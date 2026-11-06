// Abood to the Moon · عبود إلى القمر — engine: boot, loop, gameplay, duels, particles, audio, input.
// Drawing lives in art.js, DOM in ui.js, data/save in meta.js, text in i18n.js (see docs/SPEC.md and DESIGN-v2 §8.4).
import * as M from './meta.js?v=__BUILD__';
import { T, TL, nf, lang, setLang, applyI18n } from './i18n.js?v=__BUILD__';
import * as I18N from './i18n.js?v=__BUILD__';
import * as A from './art.js?v=__BUILD__';
import * as UI from './ui.js?v=__BUILD__';

// ---------------------------------------------------------------------------------------------
// Core constants and helpers
// Safari < 16 has no roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
  };
}

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d', { alpha: false });
const H = 400, MINW = 640, SHIP_X = 110, Y_MIN = 40, Y_MAX = 370;
const INK = '#1c1530', FONT = '"Baloo Bhaijaan 2", "Trebuchet MS", Tahoma, system-ui, sans-serif';
const TAU = Math.PI * 2;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
const STANDALONE = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
function compact(a, keep) { let j = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (keep(v)) a[j++] = v; } a.length = j; } // in-place filter, no garbage
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const easeOut = f => 1 - Math.pow(1 - clamp(f, 0, 1), 3);
const easeInOut = f => { f = clamp(f, 0, 1); return f * f * (3 - 2 * f); };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const tt = (key, fb = '') => { try { const v = T(key); return v && v !== key ? v : fb; } catch (e) { return fb; } };
const tf = (key, ...a) => { try { const v = T(key, ...a); return typeof v === 'string' && v && v !== key ? v : ''; } catch (e) { return ''; } }; // keys that take arguments
const line = key => { try { const v = TL(key); return typeof v === 'string' && v && v !== key ? v : ''; } catch (e) { return ''; } };
const safe = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { console.error(e); } };
// Mozah: T()/TL() pick the feminine `G` variants while the girl flag is on (i18n.setGirl, DESIGN §8.2)
const girl = () => { safe(I18N.setGirl, safe(M.char) === 'mozah'); };

// ---------------------------------------------------------------------------------------------
// Resize + quality (QDPR caps, auto-downgrade only)
const QDPR = [2, 1.5, 1.15, 0.85];
let qLevel = COARSE ? 1 : 0;
if ((navigator.deviceMemory || 8) <= 3) qLevel = 2;
let W = 700, scale = 1, offY = 0, RES = 1, FX = 1, MAXP = 300;
let pauseDrawn = false; // paused: one frame is drawn on entry, then the canvas is left alone (G8)

function resize() {
  const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, d = Math.min(devicePixelRatio || 1, QDPR[qLevel]);
  if (!w || !h) return;
  const cw = Math.round(w * d), ch = Math.round(h * d);
  if (cv.width !== cw) cv.width = cw;
  if (cv.height !== ch) cv.height = ch;
  scale = h / H; W = w / scale; offY = 0;
  if (W < MINW) { scale = w / MINW; W = MINW; offY = (h / scale - H) / 2; } // narrow screens: fit width, letterbox centred
  RES = scale * d;
  FX = qLevel >= 2 ? 0.6 : 1; MAXP = Math.round((COARSE ? 240 : 320) * FX);
  pauseDrawn = false;
}
let rzT = 0;
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 80); });
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);

// ---------------------------------------------------------------------------------------------
// State
let st = 'boot', t = 0, stT = 0, playT = 0, booted = false, pausedFrom = 'play';
let S = null;            // M.stats() snapshot (+ boosters) for the current run
let run = null;          // current leg or duel (run.mode 'leg' | 'duel')
let ship = null, bot = null, arrive = null;
let rv = null;           // the rival in a duel
let GUNS = [], BLV = 0;  // gun points and blaster level, cached per run
const objs = [], meteors = [], bolts = [], picks = [], parts = [], texts = [], lasers = [];
const eshots = [], emobs = [], elasers = []; // duel: enemy shots, mines + drones, rival lasers
let scroll = 0, shakeA = 0, hitStop = 0, hitStopCd = 0, flashA = 0;
let superF = 0, superWasFull = false, beamT = 0, beamMax = 1;
let comboN = 0, comboT = 0, mult = 1, lastMult = 1;
let lastWin = false, lastRun = null;
let menuO = { friends: [], char: 'abood', costume: null }, menuOT = -1;
const debug = { invincible: false, timeScale: 1, noSpawn: false, noAttack: false };

// ---------------------------------------------------------------------------------------------
// Device integration
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
// G7: a lock granted after wakeOff() (a quick pause right after launch) is released at once
let wake = null, wantWake = false, wakeReq = false;
async function wakeOn() {
  wantWake = true;
  if (!navigator.wakeLock || wake || wakeReq) return;
  wakeReq = true;
  try {
    const w = await navigator.wakeLock.request('screen');
    if (!wantWake) { try { w.release(); } catch (e) {} return; }
    wake = w; w.addEventListener('release', () => { if (wake === w) wake = null; });
  } catch (e) { wake = null; } finally { wakeReq = false; }
}
function wakeOff() { wantWake = false; try { wake && wake.release(); } catch (e) {} wake = null; }

let fsTried = false;
async function tryFullscreen() {
  if (fsTried) return; fsTried = true;
  const el = document.documentElement;
  try {
    if (COARSE && !STANDALONE && !document.fullscreenElement && (el.requestFullscreen || el.webkitRequestFullscreen))
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
  } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
}

const pausable = () => st === 'play' || st === 'arrive' || st === 'dead';
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (pausable()) setPause(true); musicFade(0); }
  else if (pausable()) wakeOn();
});

// (the service worker and its update toast are registered by ui.js initUI)

// ---------------------------------------------------------------------------------------------
// Sound: ZzFX buffers + small synth
let actx = null, master = null, sfxBus = null, musicBus = null, arpBus = null, padFilter = null, ZZ = null, muted = false;
const SND = {};
const SFX_DEF = { // name: [zzfx params, volume]
  shoot: [[1, .05, 560, 0, .01, .05, 1, 1.8, -12, 0, 0, 0, 0, 0, 0, 0, 0, .5, .01], .09],
  zap: [[1, .02, 1700, 0, .02, .07, 0, 2, -28, 0, 0, 0, 0, 0, 0, 0, 0, .6, .01], .12],
  rockhit: [[1, .1, 220, 0, 0, .05, 4, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0, .5, .01], .22],
  boomS: [[1, .1, 95, 0, .02, .28, 4, 1.6, -4, 0, 0, 0, 0, 1.6, 0, .2, 0, .5, .03], .38],
  boomL: [[1, .15, 62, .01, .12, .7, 4, 1.2, -2, 0, 0, 0, 0, 2.2, 0, .35, 0, .6, .1], .6],
  tank: [[1, .1, 70, 0, .16, .62, 4, .8, -3, 0, 0, 0, 0, 2.6, 0, .45, 0, .7, .08], .6],
  hurt: [[1, .1, 120, 0, .04, .28, 4, 2.2, -8, 0, 0, 0, 0, 1.5, 0, .15, 0, .6, .04], .55],
  shieldpop: [[1, .05, 760, 0, .03, .26, 0, 1.5, -22, 0, -200, .06, 0, 0, 0, 0, 0, .6, .02], .4],
  coin: [[1, 0, 1400, 0, .02, .12, 1, 1.6, 0, 0, 520, .04, 0, 0, 0, 0, 0, .6, .01], .22],
  pickup: [[1, 0, 440, .02, .2, .35, 0, 1.6, 0, 0, 220, .07, .07, 0, 0, 0, 0, .8, .02], .45],
  superready: [[1, 0, 520, .02, .3, .45, 0, 1.4, 0, 0, 260, .12, .12, 0, 0, 0, 0, .7, .02], .45],
  beam: [[1, 0, 110, .25, 1.3, .9, 2, 1, 2.2, 0, 0, 0, 0, .25, 3, 0, 0, .8, .1], .32],
  warn: [[1, 0, 920, 0, .07, .04, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .9, 0], .3],
  whoosh: [[1, .2, 500, .04, .08, .4, 3, 1, -16, 0, 0, 0, 0, .8, 0, 0, 0, .5, .08], .45],
  fanfare: [[1, 0, 392, .02, .45, .55, 1, 1.4, 0, 0, 196, .14, 0, 0, 0, 0, 0, .8, .05], .4],
  click: [[1, 0, 1200, 0, 0, .03, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, 0], .18],
  dum: [[1, 0, 95, 0, .02, .22, 0, 3, -3.5, 0, 0, 0, 0, 0, 0, 0, 0, .4, .05], .9],
  tek: [[1, 0, 1800, 0, 0, .05, 4, 1, 0, 0, 0, 0, 0, 4, 0, 0, 0, .3, .02], .3],
  // duels
  eshot: [[1, .05, 300, 0, .01, .09, 2, 1.4, -8, 0, 0, 0, 0, .2, 0, 0, 0, .55, .01], .1],
  lwarn: [[1, 0, 150, .1, .5, .3, 1, 1, 1, 0, 0, 0, 0, 0, 12, 0, 0, .5, .05], .2],
  lfire: [[1, .05, 520, 0, .15, .4, 3, 1.5, -2, 0, 0, 0, 0, .5, 0, .05, 0, .7, .06], .32],
  mine: [[1, 0, 1500, 0, .01, .05, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, 0], .13],
  plate: [[1, .1, 260, 0, .02, .22, 4, 1.4, -4, 0, 0, 0, 0, 1.8, 0, 0, 0, .5, .03], .35],
  shit: [[1, .05, 1250, 0, 0, .05, 1, 1.8, 0, 0, 0, 0, 0, 0, 0, .2, 0, .4, 0], .1],
  sbreak: [[1, .05, 700, 0, .04, .45, 0, 1.6, -20, 0, -180, .05, 0, .3, 0, .1, 0, .6, .03], .45],
  rphase: [[1, 0, 180, .03, .25, .45, 2, 1, 3, 0, 120, .12, 0, 0, 0, 0, 0, .7, .06], .38],
  rfixed: [[1, 0, 660, .01, .25, .45, 0, 1.6, 0, 0, 330, .09, .09, 0, 0, 0, 0, .8, .02], .4],
};
async function initAudio(onProgress) {
  try { ZZ = (await import('./vendor/zzfx.js?v=__BUILD__')).ZZFX; actx = ZZ.audioContext; }
  catch (e) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e2) { actx = null; } }
  if (!actx) return;
  master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
  sfxBus = actx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  musicBus = actx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  // arpeggio bus with a soft feedback echo for a spacey feel
  arpBus = actx.createGain(); arpBus.gain.value = 1; arpBus.connect(musicBus);
  try {
    const dl = actx.createDelay(1), fb = actx.createGain(), wet = actx.createGain();
    dl.delayTime.value = 0.43; fb.gain.value = 0.32; wet.gain.value = 0.38;
    arpBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(musicBus);
    padFilter = actx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 900; padFilter.connect(musicBus);
  } catch (e) { padFilter = null; }
  if (!ZZ) return;
  const list = Object.entries(SFX_DEF);
  for (let i = 0; i < list.length; i++) {
    const [name, [p, vol]] = list[i];
    try { const s = ZZ.buildSamples(...p); const b = actx.createBuffer(1, s.length, ZZ.sampleRate); b.getChannelData(0).set(s); SND[name] = { b, vol }; } catch (e) {}
    onProgress && onProgress((i + 1) / list.length);
    if (i % 2) await nextFrame();
  }
}
let unlocked = false;
function unlockAudio() {
  if (!actx) return;
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  if (!unlocked) { unlocked = true; try { const s = actx.createBufferSource(); s.buffer = actx.createBuffer(1, 1, 22050); s.connect(actx.destination); s.start(0); } catch (e) {} }
}
const audioOK = () => actx && !muted && actx.state === 'running';
function play(name, rate = 1, vol = 1, at = 0, bus = sfxBus) {
  const s = SND[name]; if (!s || !audioOK()) return;
  try {
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = s.b; src.playbackRate.value = rate; g.gain.value = s.vol * vol;
    src.connect(g).connect(bus || master); src.start(at || actx.currentTime);
  } catch (e) {}
}
function tone(f, d, type, vol, at, bus = musicBus) {
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g).connect(bus); o.start(at); o.stop(at + d + 0.02);
  } catch (e) {}
}
function sweep(f0, f1, d, type, vol) {
  if (!audioOK()) return;
  try {
    const at = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + d);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g).connect(sfxBus); o.start(at); o.stop(at + d + 0.05);
  } catch (e) {}
}
function setMuted(m) {
  muted = !!m;
  if (master && actx) { try { master.gain.setTargetAtTime(muted ? 0 : 1, actx.currentTime, 0.02); } catch (e) { master.gain.value = muted ? 0 : 1; } }
}
const throttle = {};
function sfxT(name, gap, rate = 1, vol = 1) { const n = performance.now(); if ((throttle[name] || 0) > n) return; throttle[name] = n + gap * 1000; play(name, rate, vol); }
function chime(notes, d, vol) { if (!audioOK()) return; const at = actx.currentTime + 0.03; notes.forEach((n, i) => { const f = 523.25 * Math.pow(2, n / 12); tone(f, d, 'triangle', vol, at + i * 0.09, sfxBus); tone(f * 2, d * 0.5, 'sine', vol * 0.3, at + i * 0.09, sfxBus); }); }
const sfx = {
  shoot: () => play('shoot', rnd(0.93, 1.07), rnd(0.85, 1)),
  zap: () => play('zap', rnd(0.95, 1.1)),
  rockhit: () => sfxT('rockhit', 0.055, rnd(0.9, 1.15)),
  boom: (size) => size === 'L' ? play('boomL', rnd(0.95, 1.05)) : sfxT('boomS', 0.04, size === 'S' ? rnd(1.25, 1.45) : rnd(0.95, 1.1)),
  tank: () => sfxT('tank', 0.08, rnd(0.9, 1.05)),
  hurt: () => play('hurt'),
  shieldpop: () => play('shieldpop'),
  coin: (k) => sfxT('coin', 0.03, 1 + Math.min(k, 10) * 0.05),
  pickup: () => play('pickup'),
  superready: () => play('superready'),
  beam: () => { play('beam'); sweep(180, 880, 1.6, 'sawtooth', 0.035); sweep(90, 440, 1.8, 'triangle', 0.05); },
  warn: () => { if (!audioOK()) return; const at = actx.currentTime; play('warn', 1, 1, at); play('warn', 1.12, 1, at + 0.17); },
  whoosh: () => play('whoosh', rnd(0.9, 1.1)),
  fanfare: (big) => {
    play('fanfare'); if (!audioOK()) return;
    const at = actx.currentTime + 0.05, notes = big ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    notes.forEach((n, i) => { const f = 293.66 * Math.pow(2, n / 12); tone(f, big ? 0.9 : 0.6, 'triangle', 0.07, at + i * 0.11, sfxBus); tone(f * 2, 0.3, 'square', 0.012, at + i * 0.11, sfxBus); });
    if (big) tone(146.83, 2.2, 'sine', 0.08, at, sfxBus);
  },
  click: () => play('click'),
  // duels
  eshot: () => sfxT('eshot', 0.06, rnd(0.9, 1.1)),
  laserWarn: () => { sfxT('lwarn', 0.25); },
  laserFire: () => { play('lfire', rnd(0.95, 1.05)); sweep(260, 90, 0.5, 'sawtooth', 0.03); },
  mine: () => sfxT('mine', 0.12),
  plate: () => play('plate', rnd(0.9, 1.1)),
  shieldHit: () => sfxT('shit', 0.07, rnd(0.95, 1.1)),
  shieldBreak: () => { play('sbreak'); play('boomS', 1.3, 0.6); },
  rivalPhase: () => play('rphase'),
  rivalFixed: () => { play('rfixed'); chime([0, 4, 7, 12, 16], 0.5, 0.06); },
};

// Music: soft space pad + a slow Hijaz arpeggio on D, quiet darbuka (family continuity)
const HIJAZ = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16];
const ARP = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 7, 6, 4, 2, 3, 4, 5, 4, 2, 1, 2, 4, 0, -1, 2, 1, 0, -1, -1, -1,
  4, 5, 7, 5, 4, 2, 4, 5, 6, 5, 4, 2, 1, 2, 1, -1, 0, 2, 4, 2, 3, 2, 1, 2, 0, -1, 1, 0, 0, -1, -1, -1];
const PAD = [0, 0, 5, 7];  // semitone roots: D D G A
let nextNote = 0, mStep = 0, musicOn = false;
function musicFade(v) {
  if (!musicBus || !actx) return;
  try { musicBus.gain.setTargetAtTime(v, actx.currentTime, v > 0 ? 0.4 : 0.15); } catch (e) {}
}
function pad(root, at, d) {
  if (!padFilter) return;
  for (const [semi, type, vol, det] of [[0, 'sine', 0.03, 0], [7, 'triangle', 0.012, 3], [12, 'sine', 0.014, -4], [13, 'sine', 0.004, 0]]) {
    try {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(73.42 * Math.pow(2, (root + semi) / 12), at); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 1.6); g.gain.setValueAtTime(vol, at + d - 0.4); g.gain.linearRampToValueAtTime(0.0001, at + d + 1.2);
      o.connect(g).connect(padFilter); o.start(at); o.stop(at + d + 1.3);
    } catch (e) {}
  }
}
function music() { // called every frame; schedules ~150 ms ahead on the audio clock
  const want = (st === 'play' || st === 'arrive') && !document.hidden;
  if (!actx || muted || actx.state !== 'running' || !want) {
    if (musicOn) { musicOn = false; musicFade(0); }
    if (actx) nextNote = actx.currentTime + 0.05; return;
  }
  if (!musicOn) { musicOn = true; musicFade(1); mStep = mStep - (mStep % 16); }
  const SP = 60 / 84 / 2;
  if (nextNote < actx.currentTime) nextNote = actx.currentTime + 0.05;
  while (nextNote < actx.currentTime + 0.15) {
    const s = mStep % ARP.length, b = mStep % 8, at = nextNote;
    if (mStep % 16 === 0) pad(PAD[(mStep / 16 | 0) % PAD.length], at, SP * 16);
    if (ARP[s] >= 0) { const f = 293.66 * Math.pow(2, HIJAZ[ARP[s]] / 12); tone(f, SP * 2.4, 'triangle', 0.016, at, arpBus); tone(f * 2, SP * 0.6, 'sine', 0.004, at, arpBus); }
    if (b === 0) play('dum', 1, 0.3, at, musicBus);
    if (b === 3 || b === 6) play('tek', 1, b === 3 ? 0.28 : 0.2, at, musicBus);
    nextNote += SP; mStep++;
  }
}

// ---------------------------------------------------------------------------------------------
// Particles (one flat array, capped by MAXP, compacted in place)
const P_SHARD = 0, P_SPARK = 1, P_FIRE = 2, P_SMOKE = 3, P_RING = 4, P_DEBRIS = 5, P_SPARKLE = 6, P_FX = 7;
const PUFF = new Map();
function puffSprite(col) {
  let c = PUFF.get(col); if (c) return c;
  c = mk(32, 32); const g = c.getContext('2d'); g.fillStyle = col; g.beginPath(); g.arc(16, 16, 13, 0, TAU); g.fill();
  g.globalCompositeOperation = 'destination-in'; const gr = g.createRadialGradient(16, 16, 6, 16, 16, 15);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  PUFF.set(col, c); return c;
}
const GLOWS = new Map();
function glowSpr(col) {
  let g = GLOWS.get(col); if (g !== undefined) return g;
  g = safe(A.glow, col) || null; GLOWS.set(col, g); return g;
}
const SHARDS = new Map();
function shardSpr(kind) {
  let s = SHARDS.get(kind); if (s !== undefined) return s;
  s = safe(A.shardSprite, kind) || null; SHARDS.set(kind, s); return s;
}
// costume trail sprites (art.js fxSprite: ember spark sparkle comet crystal snow star); a glow when art has none
const FXS = new Map();
function fxSpr(kind, col) {
  const k = kind + '|' + col;
  let s = FXS.get(k); if (s !== undefined) return s;
  s = (typeof A.fxSprite === 'function' ? safe(A.fxSprite, kind, col) : null) || glowSpr(col);
  FXS.set(k, s); return s;
}
function addP(k, x, y, vx, vy, life, r, col, reserve = 0) {
  if (parts.length >= MAXP - reserve) return null;
  const p = { k, x, y, vx, vy, life, max: life, r, col, rot: rnd(0, TAU), vr: rnd(-8, 8), spr: null, drag: 1.5 };
  if (k === P_SPARK || k === P_FIRE || k === P_SPARKLE) p.spr = glowSpr(col);
  else if (k === P_SHARD) p.spr = shardSpr(col);
  else if (k === P_SMOKE) p.spr = puffSprite(col);
  parts.push(p); return p;
}
function sparks(x, y, n, col = '#ffd27a', spd = 160, bvx = 0) {
  n = Math.ceil(n * FX);
  for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(0.3, 1) * spd; const p = addP(P_SPARK, x, y, Math.cos(a) * v + bvx, Math.sin(a) * v, rnd(0.2, 0.5), rnd(4, 8), col); if (p) p.drag = 3; }
}
function smoke(x, y, n, col = '#6d6a80', bvx = 0) {
  n = Math.ceil(n * FX);
  for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(10, 50); addP(P_SMOKE, x + rnd(-6, 6), y + rnd(-6, 6), Math.cos(a) * v + bvx * 0.4, Math.sin(a) * v, rnd(0.5, 0.9), rnd(6, 12), col); }
}
function ring(x, y, R, col = '#ffd27a', life = 0.38) { const p = addP(P_RING, x, y, 0, 0, life, R, col); if (p) p.drag = 0; }
function explode(x, y, r, o = {}) {
  const bvx = (o.vx || 0) * 0.3;
  const shardKind = o.shard || 'rock';
  const nS = Math.round(4 + r / 4);
  for (let i = 0; i < Math.ceil(nS * FX); i++) {
    const a = rnd(0, TAU), v = rnd(60, 190) * (0.7 + r / 60);
    const p = addP(P_SHARD, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, Math.cos(a) * v + bvx, Math.sin(a) * v, rnd(0.5, 0.9), rnd(3, 4 + r / 6), shardKind);
    if (p) p.drag = 1.2;
  }
  sparks(x, y, 5 + r / 4, o.spark || '#ffd27a', 140 + r * 3, bvx);
  if (o.fire) for (let i = 0; i < Math.ceil((4 + r / 6) * FX); i++) { const a = rnd(0, TAU), v = rnd(20, 90); addP(P_FIRE, x + rnd(-r, r) * 0.4, y + rnd(-r, r) * 0.4, Math.cos(a) * v + bvx, Math.sin(a) * v, rnd(0.35, 0.6), rnd(10, 16 + r / 3), o.fireCol || '#ff8a2a'); }
  smoke(x, y, 1 + r / 12, o.smoke || '#6d6a80', o.vx || 0);
  ring(x, y, r * 2 + 10, o.ringCol || '#ffe7a8', r > 30 ? 0.45 : 0.32);
}
function floatText(s, x, y, col = '#ffe066', size = 18, loc = false) { if (!s) return; if (texts.length > 40) texts.shift(); const life = loc ? 1.5 : 1.05; texts.push({ s, x: loc ? clamp(x, 70, W - 70) : x, y, vy: loc ? -38 : -55, life, max: life, col, size, loc }); }
const say2 = (key, x, y, col = '#9ff0ff', size = 16) => floatText(tt(key), x, y, col, size, true); // localized floating text
// live counters meta only learns from track(); batched and flushed at the end of a run (track() saves every call).
// Names are the contract's track() events (DESIGN §8.1).
const pend = { crystal: 0, junk: 0, tank: 0, pickup: 0, chain: 0, botKill: 0 };
function flushTrack() { for (const k in pend) { if (pend[k] > 0) safe(M.track, k, pend[k]); pend[k] = 0; } }

// ---------------------------------------------------------------------------------------------
// Input
const keys = { up: false, down: false };
let dragId = null, dragY = 0;
function logicalY(e) { const r = cv.getBoundingClientRect(); return (e.clientY - r.top) / scale - offY; }
const isUI = e => e.target && e.target.closest && e.target.closest('button, a, input, select, .panel, .sheet, [role="dialog"]');

cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', e => {
  unlockAudio();
  if (isUI(e) || st !== 'play') return;
  dragId = e.pointerId; dragY = logicalY(e);
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId || st !== 'play' || !ship) return;
  const y = logicalY(e), dy = (y - dragY) * 1.3; dragY = y;
  ship.ty = clamp(ship.ty + dy, Y_MIN, Y_MAX);
});
const endDrag = e => { if (e.pointerId === dragId) dragId = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag); cv.addEventListener('lostpointercapture', endDrag);
addEventListener('pointerdown', unlockAudio, true);
addEventListener('touchend', unlockAudio, { passive: true });
cv.addEventListener('contextmenu', e => e.preventDefault());
// UI click sound for every DOM button (ui.js owns the buttons; this keeps sounds in one place)
document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('button')) { unlockAudio(); sfx.click(); } }, true);

addEventListener('keydown', e => {
  unlockAudio();
  const tg = e.target && e.target.tagName;
  if (tg === 'INPUT' || tg === 'TEXTAREA') return;
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW') { keys.up = true; if (st === 'play') e.preventDefault(); }
  else if (c === 'ArrowDown' || c === 'KeyS') { keys.down = true; if (st === 'play') e.preventDefault(); }
  else if (c === 'Space' || c === 'KeyX') { if (st === 'play') { e.preventDefault(); if (!e.repeat) doSuper(); } }
  else if (c === 'KeyP' || c === 'Escape') { if (pausable()) setPause(true); else if (st === 'pause') setPause(false); }
});
addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW') keys.up = false;
  else if (c === 'ArrowDown' || c === 'KeyS') keys.down = false;
});
addEventListener('blur', () => { keys.up = keys.down = false; dragId = null; });

// ---------------------------------------------------------------------------------------------
// Run setup: stats, costume, boosters
const SIZES = { S: { r: 12, hp: 1, pts: 10, sg: 0.03 }, M: { r: 22, hp: 3, pts: 25, sg: 0.045 }, L: { r: 36, hp: 7, pts: 50, sg: 0.07 } };
const JUNK = {
  panel: { r: 22, hp: 2, pts: 30, sg: 0.05 },
  tank: { r: 16, hp: 2, pts: 30, sg: 0.05 },
  drone: { r: 17, hp: 3, pts: 30, sg: 0.055 },
  dish: { r: 20, hp: 3, pts: 30, sg: 0.055 },
};
const MIX_KEYS = ['rockS', 'rockM', 'rockL', 'ice', 'crystal', 'panel', 'tank', 'drone', 'dish'];
const DUEL_GUN = Array.isArray(M.DUEL_GUN) ? M.DUEL_GUN : [1, 1.6, 2.1, 2.5, 2.8];
const BEAM_DUEL = typeof M.BEAM_DUEL === 'number' ? M.BEAM_DUEL : 0.10;
const FX_DEF = { trail: ['#ffb04a', '#ff8a2a', '#ffd27a'], particle: 'flame', bolt: 'blaster', aura: null };

function journeyIndex(jid) { return (M.JOURNEYS || []).findIndex(j => j.id === jid); }
// M.stats() with defaults for every field the engine reads (DESIGN §8.1); boosters are NOT in stats()
function readStats() {
  const s = Object.assign({
    char: null, costume: null, skin: null,
    maxHp: 3, dmg: 1, fireRate: 4, guns: 1, pierce: 0, regen: 0, shieldCd: 0, shieldBlast: 0,
    superGain: 1, superDur: 2.2, superPassive: 0, superStart: 0,
    follow: 10, maxVy: 700, nearMiss: 0, magnet: 0, pullPickups: false,
    warnPlus: 0, comboWin: 1.2, repairMult: 1, crystalWeight: 1, crystalPlus: 0, coinMult: 1, tier: 0,
  }, safe(M.stats) || {});
  if (s.costume == null && s.suit) s.costume = s.suit; // v1 meta
  if (!s.char) s.char = safe(M.char) || 'abood';
  s.fx = Object.assign({}, FX_DEF, s.fx || {});
  if (!Array.isArray(s.fx.trail) || !s.fx.trail.length) s.fx.trail = FX_DEF.trail;
  s.bot = Object.assign({ lv: 0, rate: 0, dmg: 0, vacuum: 0, double: false, warnPlus: 0, intercept: false }, s.bot || {});
  if (s.bot.double == null) s.bot.double = s.bot.lv >= 5;
  const g = clamp(s.guns | 0, 1, 5);
  if (!(s.duelBolt > 0)) s.duelBolt = (DUEL_GUN[g - 1] || g) / g;
  if (!(s.beamDuel > 0)) s.beamDuel = BEAM_DUEL;
  if (!(s.comboWin > 0)) s.comboWin = 1.2;
  return s;
}
function shipR() {
  const tier = S ? S.tier || 0 : 0;
  for (const f of [A.shipRadius, A.shipHitRadius]) if (typeof f === 'function') { const r = safe(f, tier); if (r > 0) return r; }
  if (typeof A.SHIP_R === 'number') return A.SHIP_R + tier * 1.2;
  return 16 + tier * 1.2;
}
function gunPoints() {
  const g = Math.max(1, S.guns | 0);
  const pts = safe(A.GUN_POINTS, S.tier || 0, g);
  if (Array.isArray(pts) && pts.length) return pts;
  const out = []; for (let i = 0; i < g; i++) { const k = i - (g - 1) / 2; out.push({ dx: 34, dy: k * 7, angle: k * 0.09 }); }
  return out;
}
function newRun(o) {
  return Object.assign({
    mode: 'leg', elapsed: 0, ending: false, endT: 0, ended: false,
    score: 0, kills: 0, coins: 0, hits: 0, meteors: 0, supers: 0,
    comboMax: 0, beamMax: 0, beamKills: 0, crystals: 0, chain: 0, botKills: 0, pickups: 0,
    hitTimes: [], mercyT: 0, coinChain: 0, coinChainT: 0, deadT: 0, lowSaid: false, regenT: 0, starSaid: false, boost: {},
  }, o);
}
function resetWorld() {
  objs.length = meteors.length = bolts.length = picks.length = parts.length = texts.length = lasers.length = 0;
  eshots.length = emobs.length = elasers.length = 0;
  rv = null;
}
// shared by legs and duels: stats, boosters (DESIGN §6, §8.4), ship, Nabeeh, clocks
function beginRun() {
  girl();
  S = readStats();
  GUNS = gunPoints(); BLV = safe(M.level, 'blaster') || 0;
  const B = Object.assign({ shield: false, super: false, hull: false, coins: false }, safe(M.launchBoosters) || {});
  run.boost = B;
  if (B.hull) S.maxHp += 1;
  safe(M.startRun);
  ship = { x: SHIP_X, y: 210, ty: 210, py: 210, vy: 0, tilt: 0, hp: S.maxHp, maxHp: S.maxHp, inv: 0, alive: true,
    shieldUp: S.shieldCd > 0, shieldT: 0, extraShield: B.shield ? 1 : 0, fireT: 0.3, rapidT: 0, sc: 1, vx: 0, thrust: 0.6 };
  bot = { x: SHIP_X - 60, y: 160, vx: 0, vy: 0, mood: 'normal', moodT: 0, say: '', sayT: 0, sayMax: 1, lastSay: -99, zapT: 1, startSay: 0.9 };
  superF = B.super ? 1 : clamp(S.superStart || 0, 0, 1); superWasFull = false; beamT = 0; beamMax = Math.max(0.5, S.superDur || 2.2);
  comboN = 0; comboT = 0; mult = 1; lastMult = 1; scroll = 0; shakeA = 0; hitStop = 0; flashA = 0; arrive = null;
  dragId = null;
  for (const k in pend) pend[k] = 0;
  st = 'play'; stT = 0; playT = 0;
  checkSuperFull();
  // used boosters float up next to the ship
  let k = 0;
  for (const id of ['hull', 'shield', 'super', 'coins']) if (B[id]) { const s = tt('bo_' + id); if (s) floatText('+ ' + s, SHIP_X + 150, 150 + k * 26, '#ffe066', 15, true); k++; }
  wakeOn();
  if (actx) { nextNote = actx.currentTime + 0.05; mStep = 0; }
  try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {}
}

// a leg (M1: only playable legs; a locked leg falls back to the frontier, a locked journey is refused)
function start(jid, li = 0) {
  if (typeof jid === 'number') jid = M.JOURNEYS[jid] && M.JOURNEYS[jid].id;
  const ji = journeyIndex(jid); if (ji < 0) { console.warn('unknown journey', jid); return false; }
  const J = M.JOURNEYS[ji]; li = clamp(li | 0, 0, J.legs.length - 1);
  if (typeof M.canPlay === 'function' && !safe(M.canPlay, jid, li)) {
    const d = clamp(safe(M.legsDone, jid) | 0, 0, J.legs.length - 1);
    if (safe(M.canPlay, jid, d)) li = d; else { console.warn('journey locked', jid); return false; }
  }
  abandon();
  const L = J.legs[li];
  resetWorld();
  run = newRun({ mode: 'leg', jid, ji, li, J, L, last: li === J.legs.length - 1, spawnT: 1.6, nextMeteor: L.firstMeteor != null ? L.firstMeteor : 20 });
  beginRun();
  // leg fields (DESIGN §4.3) and costume perks (§5)
  run.mix = Object.assign({}, L.mix || {});
  if (run.mix.crystal) run.mix.crystal *= S.crystalWeight || 1;
  run.hpMul = L.hp > 0 ? L.hp : 1;
  run.coinMul = L.coin > 0 ? L.coin : 1;
  run.pickMul = L.pick > 0 ? L.pick : 1;
  run.mv = L.mv > 0 ? L.mv : 950;
  run.warn = (L.warn || 1.1) + (S.warnPlus || 0) + (S.bot.warnPlus || 0);
  safe(UI.hideMenus); safe(UI.showPause, false); safe(UI.showHud, true, jid, li);
  const legName = tt(`leg_${jid}_${li}`);
  if (legName) safe(UI.note, legName);
  return true;
}

// a leg or duel still in flight is settled before it is thrown away: picked coins are kept, as dying keeps them (G4)
function abandon() {
  if (!run || run.ended || !ship) return;
  const from = st === 'pause' ? pausedFrom : st;
  if (from !== 'play' && from !== 'arrive' && from !== 'dead') return;
  run.ended = true;
  flushTrack();
  const r = report();
  try {
    if (run.mode === 'duel') {
      if (run.ds === 'fixed') M.finishDuel(run.rid, r);   // the rival was already fixed
      else if (typeof M.abandonDuel === 'function') M.abandonDuel(run.rid, r);
      else M.failDuel(run.rid, r);
    } else {
      if (from === 'arrive') M.finishLeg(run.jid, run.li, r); // the leg was already done
      else if (typeof M.abandonLeg === 'function') M.abandonLeg(run.jid, run.li, r);
      else M.failLeg(run.jid, run.li, r);
    }
  } catch (e) { console.error(e); }
}

function refreshMenuO() {
  menuOT = t;
  let friends = menuO.friends;
  try { const l = typeof M.rivalList === 'function' ? M.rivalList() : null; if (Array.isArray(l)) friends = l.filter(r => r && r.beaten).map(r => r.id); } catch (e) {}
  let costume = null;
  try { const c = typeof M.costume === 'function' ? M.costume() : typeof M.suit === 'function' ? M.suit() : null; costume = c && c.id || null; } catch (e) {}
  let skin = null, tier = 0;
  try { skin = typeof M.skin === 'function' ? M.skin() : null; tier = typeof M.tier === 'function' ? M.tier() : 0; } catch (e) {}
  menuO = { friends, char: safe(M.char) || 'abood', costume, skin, tier };
}
function goMenu() {
  abandon();
  flushTrack();
  st = 'menu'; stT = 0; run = null; arrive = null; beamT = 0; rv = null;
  resetWorld();
  wakeOff();
  girl(); refreshMenuO();
  safe(UI.showHud, false); safe(UI.showPause, false); safe(UI.showMenu);
}

// G6: pausing works in play, arrive and dead; resume returns to the state it came from
function setPause(p) {
  if (p) {
    if (!pausable()) return;
    pausedFrom = st; st = 'pause'; dragId = null; keys.up = keys.down = false; wakeOff(); pauseDrawn = false; safe(UI.showPause, true);
  } else {
    if (st !== 'pause') return;
    if (safe(UI.isBlocking)) return; // portrait overlay still up
    st = pausedFrom || 'play'; safe(UI.showPause, false); wakeOn();
  }
}

// ---------------------------------------------------------------------------------------------
// Nabeeh
function say(key, force = false) {
  if (!bot) return;
  if (!force && (t - bot.lastSay < 4 || bot.sayT > 0)) return;
  const s = line(key); if (!s) return;
  bot.say = s; bot.sayT = bot.sayMax = 2.2; bot.lastSay = t;
}
function mood(m, d = 1.6) { if (!bot) return; bot.mood = m; bot.moodT = d; }

// ---------------------------------------------------------------------------------------------
// Spawning
function weighted(mixObj) {
  let tot = 0; for (const k of MIX_KEYS) tot += Math.max(0, +mixObj[k] || 0);
  if (tot <= 0) return 'rockS';
  let r = Math.random() * tot;
  for (const k of MIX_KEYS) { r -= Math.max(0, +mixObj[k] || 0); if (r <= 0) return k; }
  return 'rockS';
}
function freeY(r) {
  let best = rnd(Y_MIN, Y_MAX), bestD = -1;
  for (let i = 0; i < 5; i++) {
    const y = rnd(Math.max(24, r), Math.min(H - 24, H - r)); let d = 1e9;
    for (const o of objs) if (o.x > W - 140) d = Math.min(d, Math.abs(o.y - y) - o.r - r);
    if (d > 10) return y;
    if (d > bestD) { bestD = d; best = y; }
  }
  return best;
}
function makeRock(kind, size, x, y) {
  const z = SIZES[size], L = run.L, hm = run.hpMul || 1;
  const r = kind === 'crystal' ? 24 : z.r;
  const sp = L.speed * (size === 'L' ? rnd(0.75, 0.95) : size === 'S' ? rnd(1, 1.3) : rnd(0.85, 1.15)) * (kind === 'ice' ? 1.12 : 1);
  return {
    type: 'rock', kind, size, x, y, r, hp: (kind === 'crystal' ? 4 : z.hp) * hm, pts: kind === 'crystal' ? 40 : z.pts, sg: kind === 'crystal' ? 0.06 : z.sg,
    vx: -sp, vy: rnd(-16, 16), rot: rnd(0, TAU), vr: rnd(-1.4, 1.4) * (14 / r), seed: Math.floor(Math.random() * 9999), flash: 0, dead: false, killT: 0,
  };
}
function makeJunk(kind, x, y) {
  const j = JUNK[kind], L = run.L;
  return {
    type: 'junk', kind, size: 'M', x, y, by: y, r: j.r, hp: j.hp * (run.hpMul || 1), pts: j.pts, sg: j.sg,
    vx: -L.speed * rnd(0.85, 1.1), vy: kind === 'drone' ? 0 : rnd(-12, 12), rot: rnd(0, TAU), vr: kind === 'panel' ? rnd(-1.6, 1.6) : rnd(-0.6, 0.6),
    seed: Math.floor(Math.random() * 9999), flash: 0, dead: false, killT: 0, ph: rnd(0, TAU), wob: rnd(22, 40),
  };
}
function spawnKind(k, y) {
  let o;
  if (k === 'rockS' || k === 'rockM' || k === 'rockL') { const s = k[4]; o = makeRock('rock', s, 0, 0); }
  else if (k === 'ice') { const s = Math.random() < 0.35 ? 'S' : Math.random() < 0.7 ? 'M' : 'L'; o = makeRock('ice', s, 0, 0); }
  else if (k === 'crystal') o = makeRock('crystal', 'M', 0, 0);
  else if (JUNK[k]) o = makeJunk(k, 0, 0);
  else return null;
  o.x = W + o.r + 12; o.y = y != null ? y : freeY(o.r); o.by = o.y;
  objs.push(o); return o;
}
function spawner(dt) {
  if (debug.noSpawn) return;
  const L = run.L, prog = run.elapsed / L.dur;
  run.spawnT -= dt;
  if (run.spawnT > 0) return;
  const rate = Math.max(0.2, (L.spawn || 1) * (0.8 + 0.4 * prog) * (run.mercyT > 0 ? 0.7 : 1));
  run.spawnT = (1 / rate) * rnd(0.6, 1.4);
  if (objs.length < 60) spawnKind(weighted(run.mix || L.mix || {}));
}
function meteorSpawner() {
  const L = run.L;
  if (debug.noSpawn || !L.meteor || !(L.meteor[1] > 0)) return;
  if (run.elapsed < run.nextMeteor) return;
  if (run.elapsed + run.warn > L.dur - 1.2) { run.nextMeteor = 1e9; return; }
  spawnMeteor();
  // pair: a second meteor warns at the same moment in another lane at least 90 away
  if (L.pair > 0 && Math.random() < L.pair) {
    const y0 = meteors[meteors.length - 1].y;
    for (let i = 0; i < 12; i++) { const y = rnd(Y_MIN + 6, Y_MAX - 6); if (Math.abs(y - y0) >= 90) { spawnMeteor(y, true); break; } }
  }
  run.nextMeteor = run.elapsed + rnd(L.meteor[0], L.meteor[1]);
}
function spawnMeteor(y, quiet = false) {
  const warn = (run && run.warn) || 1.1;
  if (y == null) {
    const near = Math.random() < 0.3 ? 0 : rnd(-1, 1) * rnd(15, 70); // near the ship, but not always exactly on it
    y = clamp(ship.y + near, Y_MIN + 6, Y_MAX - 6);
  }
  meteors.push({ x: W + 90, y, r: 19, vx: -((run && run.mv) || 950), seed: Math.floor(Math.random() * 9999), phase: 'warn', wt: 0, warn, counted: false, hitShip: false, dead: false });
  if (!quiet) { sfx.warn(); mood('alert', warn + 0.6); say('bot_meteor', true); }
}

// ---------------------------------------------------------------------------------------------
// Combat
function damage(o, d, src) {
  if (o.dead) return;
  o.hp -= d; o.flash = 1;
  if (o.hp <= 0) kill(o, src);
  else sfx.rockhit();
}
const scoringSrc = src => src === 'bolt' || src === 'bot' || src === 'beam' || src === 'blast' || src === 'pop';
function shardKind(o) { return o.type === 'junk' ? 'metal' : o.kind; }
function kill(o, src) {
  if (o.dead) return;
  o.dead = true;
  const scoring = scoringSrc(src);
  const big = o.size === 'L' || o.kind === 'tank';
  if (scoring) {
    if (o.kind === 'crystal') { pend.crystal++; run.crystals++; }
    if (o.type === 'junk') pend.junk++;
    if (o.kind === 'tank') pend.tank++;
    if (src === 'blast') { pend.chain++; run.chain++; }
    if (src === 'bot') { pend.botKill++; run.botKills++; }
    if (src === 'beam') { run.beamKills++; if (run.beamKills > run.beamMax) run.beamMax = run.beamKills; }
  }
  if (o.kind === 'tank') {
    let chained = false;
    explode(o.x, o.y, o.r + 10, { vx: o.vx, shard: 'metal', fire: true, ringCol: '#ffb347', spark: '#ffcf6a' });
    ring(o.x, o.y, 110, '#ff9a3c', 0.5);
    sfx.tank(); shake(8); hitStopMs(40);
    for (const n of objs) {
      if (n === o || n.dead || n.killT > 0) continue;
      const dx = n.x - o.x, dy = n.y - o.y, d = Math.hypot(dx, dy);
      // G5: only a scoring blast chains as 'blast'; a meteor or a ram chain pays nothing
      if (d < 95 + n.r) { n.killT = 0.07 + d / 1100; n.chainSrc = scoring ? 'blast' : 'chain0'; chained = true; }
    }
    if (chained && src === 'blast') say2('f_chain', o.x, o.y - 24, '#ffb347', 16);
    // duel: a fuel-tank blast next to the rival hurts it (Scrap King's tankHurt)
    if (rv && scoring && run.R.tankHurt > 0 && Math.hypot(rv.x - o.x, rv.y - o.y) < 95 + rv.r * 0.5) damageRival(run.R.tankHurt * rv.max, 'blast');
  } else {
    const ice = o.kind === 'ice', cry = o.kind === 'crystal', junk = o.type === 'junk';
    explode(o.x, o.y, o.r, {
      vx: o.vx, shard: shardKind(o), fire: big || junk,
      spark: ice ? '#bfeeff' : cry ? '#9ff0ff' : junk ? '#ffd27a' : '#ffd9a0',
      ringCol: ice ? '#d6f6ff' : cry ? '#b9a6ff' : '#ffe7a8',
      smoke: ice ? '#a9c6d8' : '#6d6a80',
    });
    if (junk) sfx.boom('M'); else sfx.boom(o.size);
    if (big) { shake(5); hitStopMs(40); }
  }
  if (scoring) {
    run.kills++;
    const pts = o.pts + (src === 'blast' ? 20 : 0);
    addKill(pts, o.x, o.y);
    if (beamT <= 0) gainSuper(o.sg);
    drops(o);
  }
  // split rocks (not when vaporised by the beam or smashed by a meteor / the hull)
  if (o.type === 'rock' && o.kind !== 'crystal' && (src === 'bolt' || src === 'bot' || src === 'blast') && (o.size === 'L' || o.size === 'M')) {
    const cs = o.size === 'L' ? 'M' : 'S';
    for (const k of [-1, 1]) {
      const c = makeRock(o.kind, cs, o.x + k * o.r * 0.25, o.y + k * o.r * 0.35);
      c.vx = o.vx * rnd(0.95, 1.2) + rnd(10, 40); c.vy = o.vy * 0.5 + k * rnd(55, 95); c.flash = 0.8;
      objs.push(c);
    }
  }
}
function addKill(pts, x, y) {
  if (comboT > 0) comboN++; else comboN = 1;
  comboT = S.comboWin || 1.2;
  if (comboN > run.comboMax) run.comboMax = comboN;
  mult = Math.min(5, 1 + Math.floor((comboN - 1) / 3));
  const p = pts * mult; run.score += p;
  floatText('+' + nf(p), x, y - 6, mult >= 3 ? '#ffb347' : mult >= 2 ? '#ffd166' : '#ffe066', 15 + mult * 2);
  if (mult > lastMult && mult >= 2) {
    floatText(T('f_combo', mult), ship.x + 120, ship.y - 30, mult >= 4 ? '#ff9a3c' : '#ffd166', 14 + mult * 1.5, true);
    if (mult >= 3) { say('bot_combo'); mood('happy', 1.5); }
  }
  lastMult = mult;
}
function gainSuper(g) {
  superF = Math.min(1, superF + (g == null ? 0.04 : g) * (S.superGain || 1));
  checkSuperFull();
}
function checkSuperFull() {
  if (superF >= 1 && !superWasFull) { superWasFull = true; sfx.superready(); mood('happy', 1.2); if (ship && st === 'play') say2('f_superReady', ship.x + 40, ship.y + 42, '#ffe066', 17); }
}
const DROPS = Object.assign({
  coin: { rockS: 0.10, rockM: 0.22, rockL: 0.40, ice: 0.15, crystal: 0, panel: 0.30, tank: 0.25, drone: 0.45, dish: 0.40 },
  crystal: [2, 4], crystalValue: 2, pickup: 0.05,
  pickWeights: { cell: 2, rapid: 2, repair: 2, shield: 1 },
  duel: { per10: 3, burst: 20 },
}, M.DROPS || {});
function dropKey(o) { return o.type === 'junk' ? o.kind : o.kind === 'rock' ? 'rock' + o.size : o.kind; }
function drops(o) {
  let n = 0, val = 1;
  if (o.kind === 'crystal') { const c = DROPS.crystal || [2, 4]; n = c[0] + Math.floor(Math.random() * (c[1] - c[0] + 1)) + (S.crystalPlus | 0); val = DROPS.crystalValue || 2; }
  else n = Math.random() < ((DROPS.coin || {})[dropKey(o)] || 0) * (run.coinMul || 1) ? 1 : 0;
  for (let i = 0; i < n; i++) addPick('coin', o.x, o.y, val);
  const pc = (DROPS.pickup || 0.05) * (run.pickMul || 1) * (o.size === 'S' ? 0.25 : 1);
  if (Math.random() < pc) { const k = rollPickup(); if (k) addPick(k, o.x, o.y, 1); }
}
// power-up roll from DROPS.pickWeights: repair only when hurt (× the Rover costume), shield only when it is down
function rollPickup() {
  const w = DROPS.pickWeights || { cell: 2, rapid: 2, repair: 2, shield: 1 };
  const c = +w.cell || 0, r = +w.rapid || 0, rp = ship.hp < ship.maxHp ? (+w.repair || 0) * (S.repairMult || 1) : 0, sh = !ship.shieldUp ? (+w.shield || 0) : 0;
  let x = Math.random() * (c + r + rp + sh);
  if ((x -= c) < 0) return 'cell'; if ((x -= r) < 0) return 'rapid'; if ((x -= rp) < 0) return 'repair'; if (sh > 0) return 'shield';
  return c + r > 0 ? 'cell' : null;
}
function addPick(kind, x, y, val) {
  if (picks.length >= 80) return null;
  const a = rnd(0, TAU), v = rnd(30, 110);
  const p = { kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, val, ph: rnd(0, 10), pulled: false, life: 14, dead: false };
  picks.push(p); return p;
}
function collect(p) {
  if (p.kind === 'coin') {
    run.coins += p.val;
    run.coinChain = run.coinChainT > 0 ? run.coinChain + 1 : 0; run.coinChainT = 0.5;
    sfx.coin(run.coinChain);
    for (let i = 0; i < Math.ceil(3 * FX); i++) addP(P_SPARKLE, p.x + rnd(-6, 6), p.y + rnd(-6, 6), rnd(-40, 40), rnd(-50, 10), rnd(0.25, 0.45), rnd(4, 7), '#ffe066', 20);
    return;
  }
  sfx.pickup(); pend.pickup++; run.pickups++;
  sparks(p.x, p.y, 10, '#fff2b0', 120);
  ring(p.x, p.y, 34, '#fff6c2', 0.35);
  const fy = ship.y + 40;
  if (p.kind === 'repair') { ship.hp = Math.min(ship.maxHp, ship.hp + 1); say2('f_repair', ship.x + 30, fy, '#9ff0a0'); }
  else if (p.kind === 'shield') { ship.shieldUp = true; ship.shieldT = 0; say2('f_shield', ship.x + 30, fy); }
  else if (p.kind === 'cell') { superF = Math.min(1, superF + 0.35); say2('f_cell', ship.x + 30, fy, '#ffe066'); checkSuperFull(); }
  else if (p.kind === 'rapid') { ship.rapidT = 6; say2('f_rapid', ship.x + 30, fy, '#ffb347'); }
  mood('happy', 1.2); say('bot_pickup');
}
function shake(a) { if (!REDUCED) shakeA = Math.max(shakeA, a); }
function hitStopMs(ms) { if (hitStopCd > 0) return; hitStop = Math.max(hitStop, ms / 1000); hitStopCd = 0.25; }

const duelSafe = () => run && run.mode === 'duel' && (run.ds === 'intro' || run.ds === 'fixed');
// a shield pop with the shield ✦ (shieldBlast) also clears small rocks (and, in a duel, enemy shots, mines, drones) nearby
function shieldBlast() {
  const R = S.shieldBlast || 0; if (R <= 0) return;
  ring(ship.x, ship.y, R, '#9ff0ff', 0.35);
  for (const o of objs) if (!o.dead && o.type === 'rock' && o.size === 'S' && o.kind !== 'crystal' && Math.hypot(o.x - ship.x, o.y - ship.y) < R + o.r) kill(o, 'pop');
  for (const s of eshots) if (!s.dead && Math.hypot(s.x - ship.x, s.y - ship.y) < R + s.r) { s.dead = true; sparks(s.x, s.y, 3, '#9ff0ff', 90); }
  for (const m of emobs) if (!m.dead && Math.hypot(m.x - ship.x, m.y - ship.y) < R + m.r) killMob(m, 'pop');
}
function hurtShip(dmg) {
  if (!ship.alive || ship.inv > 0 || debug.invincible || st !== 'play' || duelSafe()) return false;
  if (ship.extraShield > 0 || ship.shieldUp) {
    // the shield booster's extra charge goes first, then the normal shield
    if (ship.extraShield > 0) ship.extraShield--; else { ship.shieldUp = false; ship.shieldT = S.shieldCd || 0; }
    ship.inv = 0.7;
    sfx.shieldpop(); ring(ship.x, ship.y, 54, '#9ff0ff', 0.4); sparks(ship.x, ship.y, 14, '#9ff0ff', 180);
    say2('f_shieldPop', ship.x + 30, ship.y + 40); say('bot_shield');
    shieldBlast();
    shake(4); buzz(25); return true;
  }
  ship.hp -= dmg; run.hits++; run.regenT = 0;
  run.hitTimes.push(playT);
  if (run.hitTimes.length >= 2 && playT - run.hitTimes[run.hitTimes.length - 2] < 15) run.mercyT = 8;
  sfx.hurt(); buzz(50); shake(9); hitStopMs(40); flashA = REDUCED ? 0 : 0.25;
  sparks(ship.x + 10, ship.y, 16, '#ffcf6a', 200); smoke(ship.x, ship.y, 3, '#5a566e');
  mood('sad', 1.8);
  if (ship.hp <= 0) { ship.hp = 0; die(); return true; }
  ship.inv = 1.4;
  if (ship.hp === 1 && !run.lowSaid) { run.lowSaid = true; say('bot_lowhp', true); say2('f_lowhp', ship.x + 30, ship.y + 40, '#ffb3b3'); } else say('bot_hit', true);
  return true;
}
function die() {
  ship.alive = false; beamT = 0;
  const x = ship.x, y = ship.y;
  explode(x, y, 34, { shard: 'metal', fire: true, ringCol: '#ffd27a' });
  for (let i = 0; i < Math.ceil(26 * FX); i++) { const a = rnd(0, TAU), v = rnd(80, 320); addP(P_FIRE, x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.4, 0.9), rnd(10, 22), pick(['#ff8a2a', '#ffb347', '#ff5a3c'])); }
  for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), v = rnd(60, 220); const p = addP(P_DEBRIS, x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(1, 1.6), rnd(3, 7), pick(['#f4f2ea', '#e2552d', '#c8202b', '#8d94a8', '#3b3b46'])); if (p) p.drag = 0.6; }
  ring(x, y, 90, '#ffe7a8', 0.55); ring(x, y, 140, '#ff9a3c', 0.75);
  smoke(x, y, 8, '#4d4a5e');
  play('boomL', 0.8); sfx.tank(); buzz([60, 40, 120]); shake(16); hitStop = 0.08; flashA = REDUCED ? 0 : 0.35;
  mood('sad', 9);
  if (run.mode === 'duel') { if (!line('bot_duelLose')) say('bot_lose', true); else say('bot_duelLose', true); if (rv) rvSay(line('rv_' + rv.id + '_taunt')); }
  else say('bot_lose', true);
  st = 'dead'; stT = 0; run.deadT = 0;
}
function doSuper() {
  if (st !== 'play' || !ship || !ship.alive || beamT > 0 || superF < 1 || duelSafe()) return false;
  superF = 0; superWasFull = false; beamMax = Math.max(0.5, S.superDur || 2.2); beamT = beamMax; run.supers++; run.beamKills = 0;
  sfx.beam(); shake(12); flashA = REDUCED ? 0 : 0.35; mood('happy', beamMax);
  say('bot_super', true);
  return true;
}
const BR = { x0: 0, x1: 0, y0: 0, y1: 0 };
function beamRect() { BR.x0 = ship.x + 18; BR.x1 = W + 80; BR.y0 = ship.y - 35; BR.y1 = ship.y + 35; return BR; }
const circRect = (x, y, r, b) => { const cx = clamp(x, b.x0, b.x1), cy = clamp(y, b.y0, b.y1); return (x - cx) ** 2 + (y - cy) ** 2 < r * r; };

// ---------------------------------------------------------------------------------------------
// Duels (DESIGN §3, §8.4): a 1v1 arena against a rogue junk robot. st stays 'play'; run.ds is
// 'intro' (2.5 s) → 'fight' ⇄ 'shift' (1.2 s per phase threshold) → 'fixed' (2.5 s) → results.
// rivals stay above y 300 so they never fly under the super button (bottom right)
const RV_YMIN = 50, RV_YMAX = 300, LANES = [80, 160, 240, 320];
// hit radii shared with art.js (ENEMY_R: pellet 6, dart 5, slug 9, mine 11, drone 10, plate 13, laser half-height 11)
const ER_DEF = { pellet: 6, dart: 5, slug: 9, mine: 11, drone: 10, plate: 13, laser: 11 };
const ER = k => (A.ENEMY_R && A.ENEMY_R[k]) || ER_DEF[k] || 6;
function rivalData(rid) {
  const list = Array.isArray(M.RIVALS) ? M.RIVALS : [];
  if (typeof rid === 'number') return list[rid - 1] || null; // __game.duel(1..10)
  return safe(M.rival, rid) || list.find(r => r.id === rid) || null;
}
const rvName = id => tt('rv_' + id, id);
function rvSay(s) { if (!rv || !s) return; rv.say = s; rv.sayT = rv.sayMax = 2.4; }
function startDuel(rid, quiet = false) {
  const R = rivalData(rid); if (!R) { console.warn('unknown rival', rid); return false; }
  rid = R.id;
  abandon(); // settle a run in flight first (pause → Restart)
  // the contract: M.startDuel(rid) must say ok before the engine starts (rematches are free)
  const ok = typeof M.startDuel === 'function' ? safe(M.startDuel, rid) : { ok: true };
  if (!ok || ok.ok === false) {
    const why = ok && ok.reason; if (!quiet) safe(UI.note, why === 'locked' ? (tt('du_lock') || why) : (tt('notEnough') || why || '')); // ui.js notes a refused onDuel itself
    if (run && run.ended && st !== 'over' && st !== 'menu') goMenu();
    return false;
  }
  resetWorld();
  const J = (M.JOURNEYS || []).find(j => j.id === R.theme) || M.JOURNEYS[0];
  run = newRun({ mode: 'duel', rid, R, J, L: { speed: 130, dur: 1, hp: 1, coin: 1, pick: 1, mix: {} }, ds: 'intro', dsT: 0, fightT: 0, last: false,
    hpMul: 1, coinMul: 1, pickMul: 1, warn: 1.1, enraged: false });
  beginRun();
  makeRival(R);
  safe(UI.hideMenus); safe(UI.showPause, false); safe(UI.showHud, true, null, 0, { duel: true, rid });
  safe(UI.note, tf('f_duel', rvName(rid)) || rvName(rid));
  return true;
}
function makeRival(R) {
  const P0 = (R.phases && R.phases[0]) || { atk: [] };
  rv = { id: R.id, R, x: W + 80, y: 200, ty: 200, vy: 0, r: R.r || 34, hp: R.hp, max: R.hp, ph: 0, phase: P0, move: P0.move || R.move || { mode: 'sine', amp: 100, period: 6 },
    atk: [], q: [], mt: 0, bob: rnd(0, 5), hurt: 0, tell: 0, invT: 0, stunT: 0, sh: null, plates: null, plateA: 0, plateT: 0,
    blink: null, blinkT: 1.5, hopT: 0.5, trackT: 0, sign: 1, ram: null, hold: null, pulseT: 0, drops: 0, enrageSaid: false,
    say: '', sayT: 0, sayMax: 1, alpha: 1, rot: 0, fixedEye: false, burst: false, introSaid: false, lastSafe: -1, dead: false, smokeT: 0 };
  safe(A.bakeRival, R.id);
  const pts = typeof A.rivalPoints === 'function' ? safe(A.rivalPoints, R.id) : null;
  rv.mu = pts && pts.muzzle ? pts.muzzle : [-rv.r * 0.8, 0]; rv.ha = pts && pts.hatch ? pts.hatch : [-rv.r * 0.4, 0];
  if (R.shield) setShield(R.shield);
  if (R.plates) { const P = R.plates; rv.plates = []; for (let i = 0; i < (P.n | 0); i++) rv.plates.push({ hp: P.hp, max: P.hp, alive: true, flash: 0, x: rv.x, y: rv.y, rot: rnd(0, TAU) }); }
  if (rv.move.mode === 'blink') rv.blinkT = (rv.move.every || 3) * 0.6;
}
function setShield(sd) { rv.sh = { max: Math.max(1, (sd.hp || 0.1) * rv.max), hp: 0, regen: sd.regen || 9, stun: sd.stun || 2, up: true, t: 0 }; rv.sh.hp = rv.sh.max; }
function startPhase() {
  const P = rv.phase || {};
  rv.atk = (P.atk || []).map(a => ({ a, t: a.onBlink ? Infinity : a.first != null ? a.first : a.k === 'spiral' ? (a.off || 2) * 0.6 : (a.every || 2) * 0.6, on: false, rt: 0, ang: Math.PI * (0.75 + Math.random() * 0.5) }));
  rv.q.length = 0;
}
function clearEnemyFire(fx = true) {
  if (fx) { for (const s of eshots) if (!s.dead) sparks(s.x, s.y, 2, '#ffb3a0', 70); for (const m of emobs) if (!m.dead) { smoke(m.x, m.y, 1, '#6d6a80'); sparks(m.x, m.y, 3, '#ffcf6a', 90); } }
  eshots.length = emobs.length = elasers.length = 0;
  rv.q.length = 0; rv.hold = null;
}
function superFromDmg(d) { if (beamT <= 0 && d > 0) gainSuper(1.6 * d / rv.max); }
// all damage to the rival goes through here: shield → (stun ×1.5) → hull, phase floors, 10 % coin drops
function damageRival(d, src) {
  if (!rv || run.ds !== 'fight' || rv.invT > 0 || !(d > 0)) return 0;
  if (rv.sh && rv.sh.up && src !== 'beam') {
    const dd = Math.min(d, rv.sh.hp); rv.sh.hp -= d; superFromDmg(dd); rv.hurt = Math.min(1, rv.hurt + 0.25);
    if (rv.sh.hp <= 0) breakShield(); else sfx.shieldHit();
    return dd;
  }
  if (rv.stunT > 0) d *= 1.5;
  const next = rv.R.phases && rv.R.phases[rv.ph + 1], floor = next ? next.at * rv.max : 0;
  const before = rv.hp; rv.hp = Math.max(floor, rv.hp - d);
  const dealt = before - rv.hp; if (dealt <= 0) return 0;
  rv.hurt = Math.min(1, rv.hurt + 0.5); run.score += dealt; superFromDmg(dealt);
  if (src === 'bolt' || src === 'bot') sfxT('rockhit', 0.07, rnd(0.6, 0.75), 0.8);
  // every 10 % of HP lost drops DROPS.duel.per10 coins at the rival
  const want = Math.min(10, Math.floor((1 - rv.hp / rv.max) * 10 + 1e-6)), per = (DROPS.duel && DROPS.duel.per10) || 3;
  while (rv.drops < want) { rv.drops++; for (let i = 0; i < per; i++) { const p = addPick('coin', rv.x - rv.r * 0.6, rv.y + rnd(-10, 10), 1); if (p) p.vx = -rnd(60, 160); } }
  if (rv.hp <= 0) beginFixed();
  else if (next && rv.hp <= floor) beginShift();
  return dealt;
}
function breakShield() {
  const sh = rv.sh; sh.up = false; sh.hp = 0; sh.t = sh.regen;
  rv.stunT = sh.stun; rv.q.length = 0; rv.hold = null;
  if (rv.ram && rv.ram.ph !== 'back') rv.ram.ph = 'back';
  sfx.shieldBreak(); shake(7); hitStopMs(50);
  sparks(rv.x - rv.r, rv.y, 20, '#9ff0ff', 220); ring(rv.x, rv.y, rv.r + 30, '#9ff0ff', 0.45);
  floatText(tt('f_shieldBreak'), rv.x - 30, rv.y - rv.r - 26, '#9ff0ff', 17, true);
}
function beginShift() {
  run.ds = 'shift'; run.dsT = 0; rv.invT = 1.2;
  clearEnemyFire();
  if (rv.ram) rv.ram.ph = 'back';
  rv.ph++; rv.phase = rv.R.phases[rv.ph] || rv.phase;
  if (rv.phase.move) { rv.move = rv.phase.move; rv.blink = null; if (rv.move.mode === 'blink') rv.blinkT = 1.3; }
  if (rv.phase.shield) setShield(rv.phase.shield);
  startPhase();
  rvSay(line('rv_' + rv.id + '_taunt'));
  sfx.rivalPhase(); shake(6); ring(rv.x, rv.y, rv.r * 2.4, '#ff6a5a', 0.6); sparks(rv.x, rv.y, 16, '#ffb3a0', 200);
  mood('alert', 1.2);
}
function beginFixed() {
  run.ds = 'fixed'; run.dsT = 0; rv.hp = 0; rv.invT = 0; rv.stunT = 0; rv.ram = null; rv.blink = null; rv.pulseT = 0;
  run.fightTime = run.fightT;
  clearEnemyFire();
  for (const o of objs) if (!o.dead) { smoke(o.x, o.y, 2, '#8a86a0', o.vx); sparks(o.x, o.y, 3, '#cfd8ff', 80); o.dead = true; }
  for (const p of picks) if (p.kind === 'coin') p.pulled = true;
  rv.fy = rv.y; bolts.length = 0;
  play('boomL', 1.2, 0.7); shake(10); hitStop = 0.1;
  sparks(rv.x, rv.y, 26, '#ffd27a', 240); ring(rv.x, rv.y, rv.r * 2.6, '#ffe7a8', 0.6);
  safe(UI.note, tf('f_fixed', rvName(rv.id)) || rvName(rv.id));
  mood('happy', 4);
}
function updateFixed(dt) {
  run.dsT += dt; const f = run.dsT;
  if (f < 1.1 && Math.random() < 0.5 * FX) sparks(rv.x + rnd(-rv.r, rv.r) * 0.7, rv.y + rnd(-rv.r, rv.r) * 0.7, 2, pick(['#ffd27a', '#9ff0ff']), 120);
  // limp: tilt and sink a little, then perk up once reprogrammed
  rv.limp = easeOut(f / 0.5) * (f < 1.1 ? 1 : clamp(1 - (f - 1.1) / 0.3, 0, 1));
  if (f < 1.8) rv.y += (rv.fy + (f < 1.2 ? 18 : 0) - rv.y) * Math.min(1, dt * 3);
  if (f >= 0.9 && !rv.fixedEye) {
    rv.fixedEye = true; sfx.rivalFixed();
    ring(rv.x, rv.y, rv.r * 2, '#5ef2ff', 0.6); sparks(rv.x, rv.y, 18, '#9ff0ff', 200);
    const n = (DROPS.duel && DROPS.duel.burst) || 20;
    for (let i = 0; i < n; i++) { const p = addPick('coin', rv.x + rnd(-10, 10), rv.y + rnd(-10, 10), 1); if (p) { p.pulled = true; const a = rnd(0, TAU), v = rnd(120, 300); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; } }
    rvSay(tt('rv_' + rv.id + '_fixed'));
  }
  if (f >= 1.5 && !rv.botSaid) { rv.botSaid = true; if (line('rv_' + rv.id + '_bot')) say('rv_' + rv.id + '_bot', true); else say('bot_duelWin', true); }
  if (f > 1.8) { const g = (f - 1.8) / 0.7; rv.x += 260 * g * dt * 3; rv.y -= 90 * dt; rv.alpha = clamp(1 - g, 0, 1); } // wave and fly off
  if (f >= 2.5) endRun(true);
}
function newY(from, minD) { let y = from; for (let i = 0; i < 10; i++) { y = rnd(RV_YMIN, RV_YMAX); if (Math.abs(y - from) >= minD) break; } return y; }
function moveRival(dt) {
  const m = rv.move || {}; rv.mt += dt;
  let k = 4, cap = 600;
  if (rv.hold) { rv.ty = rv.hold.y - rv.mu[1]; k = 8; cap = 520; } // keep the muzzle on an aimed laser's lane
  else switch (m.mode) {
    case 'track': rv.trackT += dt; if (rv.trackT >= 3) { rv.trackT = 0; rv.sign = -rv.sign; } rv.ty = ship.y + (m.offset || 0) * rv.sign; cap = m.v || 90; k = 6; break;
    case 'hop': rv.hopT -= dt; if (rv.hopT <= 0) { rv.hopT = m.every || 2; rv.ty = newY(rv.y, 70); } cap = m.v || 200; k = 5; break;
    case 'blink': blinkMove(dt, m); return;
    default: rv.ty = 200 + (m.amp || 100) * Math.sin(TAU * rv.mt / (m.period || 6)); k = 8; cap = 900;
  }
  rv.ty = clamp(rv.ty, RV_YMIN, RV_YMAX);
  const v = cap * dt; rv.y += clamp((rv.ty - rv.y) * (1 - Math.exp(-k * dt)), -v, v);
}
function blinkMove(dt, m) {
  if (!rv.blink) {
    rv.blinkT -= dt;
    if (rv.blinkT <= 0) { const ty = newY(rv.y, 90), dec = []; for (let i = 0; i < (m.decoys | 0); i++) dec.push(newY(ty, 70)); rv.blink = { t: 0, tell: m.tell || 0.5, ty, dec }; }
    return;
  }
  const b = rv.blink; b.t += dt;
  if (b.t >= b.tell) {
    sparks(rv.x, rv.y, 8, '#c9a6ff', 140); smoke(rv.x, rv.y, 2, '#6a5a8a');
    rv.y = rv.ty = b.ty; rv.blink = null; rv.blinkT = (m.every || 3) * (run.enraged ? 0.8 : 1);
    sparks(rv.x, rv.y, 10, '#e6d6ff', 160); sfx.whoosh();
    if (st === 'play' && run.ds === 'fight' && rv.stunT <= 0 && !debug.noAttack) for (const s of rv.atk) if (s.a.onBlink) fireAtk(s.a);
  }
}
const muzzle = () => rv.x + rv.mu[0], muzzleY = () => rv.y + rv.mu[1];
function shot(kind, x, y, ang, v) {
  if (eshots.length >= 120) return;
  eshots.push({ kind, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: ER(kind), ang, dmg: 1, life: 8, dead: false });
}
const aimAng = (x, y) => Math.atan2(ship.y - y, ship.x - x);
function addLaser(y, warn, dur, aimed) {
  const L = { y: clamp(y, 30, H - 30), warn: Math.max(0.3, warn), dur: dur || 0.6, t: 0, ph: 'warn', hit: false, dead: false, x0: muzzle() };
  elasers.push(L); if (aimed) rv.hold = L;
  sfx.laserWarn();
}
function addMob(kind, a, dy) {
  if (emobs.length >= 24) return;
  const life = a.life || 6;
  emobs.push({ kind, x: muzzle(), y: clamp(muzzleY() + dy, 20, H - 20), ang: Math.PI + rnd(-0.35, 0.35), v: a.v || 110, turn: a.turn || 1.5,
    life, max: life, hp: a.hp || 2, r: ER(kind), flash: 0, dead: false, beepT: 0.2 });
  if (kind === 'mine') sfx.mine();
}
function fireAtk(a) {
  const mx = muzzle(), my = muzzleY();
  switch (a.k) {
    case 'aim': { const n = a.n || 1, gap = a.gap != null ? a.gap : 0.15, kind = a.shot || 'pellet';
      for (let i = 0; i < n; i++) rv.q.push({ d: i * gap, fn: () => { shot(kind, muzzle(), muzzleY(), aimAng(muzzle(), muzzleY()), a.v || 230); sfx.eshot(); } }); break; }
    case 'fan': { const n = a.n || 3, arc = a.arc || 0.4, base = aimAng(mx, my);
      for (let i = 0; i < n; i++) shot('pellet', mx, my, base + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0), a.v || 230);
      sfx.eshot(); break; }
    case 'wall': { const n = a.n || 10, gap = a.gap || 90, gc = clamp(ship.y + rnd(-120, 120), 70, 330);
      for (let i = 0; i < n; i++) { const y = 40 + i * 320 / Math.max(1, n - 1); if (Math.abs(y - gc) < gap / 2) continue; shot('pellet', mx, y, Math.PI, a.v || 170); }
      sfx.eshot(); break; }
    case 'laser': { const n = a.n || 1, gap = a.gap != null ? a.gap : 0.8, warn = (a.warn || 1.2) + (S.warnPlus || 0);
      for (let i = 0; i < n; i++) rv.q.push({ d: i * gap, fn: () => addLaser(ship.y, warn, a.dur || 0.6, true) }); break; }
    case 'lanes3': { let safeI; do { safeI = Math.floor(Math.random() * 4); } while (safeI === rv.lastSafe); rv.lastSafe = safeI;
      const warn = (a.warn != null ? a.warn : 1.4) + (S.warnPlus || 0);
      LANES.forEach((y, i) => { if (i !== safeI) addLaser(y, warn, a.dur != null ? a.dur : 0.7, false); }); break; }
    case 'mine': addMob('mine', a, 0); break;
    case 'drones': { const n = a.n || 2; for (let i = 0; i < n; i++) addMob('drone', a, (i - (n - 1) / 2) * 34); break; }
    case 'summon': { const n = a.n || 1, kinds = a.kinds && a.kinds.length ? a.kinds : ['rockS'];
      for (let i = 0; i < n; i++) { const o = spawnKind(pick(kinds), clamp(rv.y + rv.ha[1] + (i - (n - 1) / 2) * 44, 40, 360)); if (!o) continue;
        o.x = rv.x + rv.ha[0]; o.by = o.y; o.vx = -(a.v || 130) * rnd(0.9, 1.1); o.summon = true; o.flash = 0.8; }
      smoke(rv.x + rv.ha[0], rv.y + rv.ha[1], 2, '#6d6a80'); break; }
    case 'ram': if (!rv.ram) rv.ram = { ph: 'warn', t: 0, warn: a.warn != null ? a.warn : 1.0, v: a.v || 650, back: a.back || 300, y: rv.y, hit: false }; break;
    case 'pulse': rv.pulseT = a.dur || 2; break;
  }
}
function spiral(s, dt, ek) {
  const a = s.a;
  s.t -= dt;
  if (!s.on) { if (s.t <= 0) { s.on = true; s.t = a.on || 3; s.rt = 0; } return; }
  s.rt -= dt;
  let shots = 0;
  while (s.rt <= 0) {
    s.rt += a.rate || 0.25;
    const arms = a.arms || 1;
    for (let k = 0; k < arms; k++) { const ang = s.ang + k * TAU / arms; if (Math.cos(ang) <= -0.2) { shot('pellet', muzzle(), muzzleY(), ang, a.v || 200); shots++; } } // never fire to the right
    s.ang += a.step || 0.45;
  }
  if (shots) sfx.eshot();
  if (s.t <= 0) { s.on = false; s.t = (a.off || 2) * ek; }
}
function updateRam(dt, shR) {
  const m = rv.ram, home = W - 120; m.t += dt;
  if (m.ph === 'warn') { rv.tell = clamp(m.t / m.warn, 0, 1); if (m.t >= m.warn) { m.ph = 'go'; sfx.whoosh(); shake(4); } }
  else if (m.ph === 'go') { rv.x -= m.v * dt; if (Math.random() < 0.6 * FX) addP(P_FIRE, rv.x + rv.r, rv.y + rnd(-8, 8), 200, rnd(-20, 20), 0.3, 12, '#ff8a2a', 30); if (rv.x <= 150) { rv.x = 150; m.ph = 'back'; } }
  else { rv.x += m.back * dt; if (rv.x >= home) { rv.x = home; rv.ram = null; return; } }
  if (m.ph !== 'warn' && !m.hit && ship.alive) {
    const rr = rv.r * 0.85 + shR, dx = rv.x - ship.x, dy = rv.y - ship.y;
    if (dx * dx + dy * dy < rr * rr && hurtShip(2)) m.hit = true;
  }
}
function updateRival(dt) {
  const home = W - 120, shR = shipR();
  rv.hurt = Math.max(0, rv.hurt - dt * 5); rv.tell = 0; rv.bob += dt;
  if (rv.sayT > 0) rv.sayT -= dt;
  if (rv.invT > 0) rv.invT -= dt;
  if (run.ds === 'intro') {
    run.dsT += dt;
    rv.x = W + 80 + (home - (W + 80)) * easeOut(run.dsT / 2.2);
    if (!rv.introSaid && run.dsT > 0.9) { rv.introSaid = true; rvSay(line('rv_' + rv.id + '_taunt')); }
    if (!bot.duelSaid && run.dsT > 0.3) { bot.duelSaid = true; say('bot_duel', true); }
    if (run.dsT >= 2.5) { run.ds = 'fight'; run.dsT = 0; startPhase(); }
    return;
  }
  if (run.ds === 'fixed') { updateFixed(dt); return; }
  const live = st === 'play' && ship.alive;
  if (live) {
    run.fightT += dt;
    if (!run.enraged && run.fightT >= 2 * (rv.R.par || 60)) { run.enraged = true; floatText(tt('f_enrage'), rv.x - 40, rv.y - rv.r - 30, '#ff8a5a', 17, true); safe(UI.note, tt('f_enrage')); sfx.rivalPhase(); }
  }
  if (run.ds === 'shift') { run.dsT += dt; if (run.dsT >= 1.2) { run.ds = 'fight'; run.dsT = 0; } }
  if (rv.stunT > 0) rv.stunT -= dt;
  if (rv.sh && !rv.sh.up) { rv.sh.t -= dt; if (rv.sh.t <= 0) { rv.sh.up = true; rv.sh.hp = rv.sh.max; ring(rv.x, rv.y, rv.r + 18, '#9ff0ff', 0.4); sfx.shieldHit(); } }
  if (rv.pulseT > 0) rv.pulseT -= dt;
  // plates orbit; one destroyed plate comes back every `respawn` s
  if (rv.plates) {
    const P = rv.R.plates, n = rv.plates.length; rv.plateA += (P.w || 1.4) * dt;
    for (let i = 0; i < n; i++) { const p = rv.plates[i], a = rv.plateA + i * TAU / n; p.x = rv.x + Math.cos(a) * (P.orbit || 58); p.y = rv.y + Math.sin(a) * (P.orbit || 58); p.rot += dt * 1.5; p.flash = Math.max(0, p.flash - dt * 6); }
    if (rv.plateT > 0) { rv.plateT -= dt; if (rv.plateT <= 0) { const p = rv.plates.find(q => !q.alive); if (p) { p.alive = true; p.hp = p.max; p.flash = 1; sparks(p.x, p.y, 6, '#cfd8ff', 90); } if (rv.plates.some(q => !q.alive)) rv.plateT = P.respawn || 7; } }
  }
  // movement (a ram or a stun overrides it)
  if (rv.ram) updateRam(dt, shR);
  else {
    if (rv.stunT <= 0) moveRival(dt);
    rv.x += (home + Math.sin(rv.bob * 1.3) * 8 - rv.x) * Math.min(1, dt * 3);
  }
  // attacks
  if (live && run.ds === 'fight' && rv.stunT <= 0 && !rv.ram && !debug.noAttack) {
    const ek = run.enraged ? 0.8 : 1;
    for (const s of rv.atk) {
      const a = s.a;
      if (a.k === 'spiral') { spiral(s, dt, ek); continue; }
      if (a.onBlink) continue;
      s.t -= dt;
      if (s.t <= 0) { s.t = (a.every || 2) * ek; fireAtk(a); if (rv.ram) break; }
    }
    for (const e of rv.q) { e.d -= dt; if (e.d <= 0) { e.done = true; e.fn(); } }
    compact(rv.q, e => !e.done);
  }
  for (const L of elasers) if (L.ph === 'warn') rv.tell = Math.max(rv.tell, clamp(L.t / L.warn, 0, 1));
  if (rv.hp / rv.max < 0.3 && (rv.smokeT -= dt) <= 0) { rv.smokeT = 0.25; smoke(rv.x + rnd(-rv.r, rv.r) * 0.5, rv.y - rv.r * 0.3, 1, '#4d4a5e'); }
  updateLasers(dt, shR);
}
function updateLasers(dt, shR) {
  for (const L of elasers) {
    L.t += dt; L.x0 = muzzle();
    if (L.ph === 'warn') { if (L.t >= L.warn) { L.ph = 'fire'; L.t = 0; sfx.laserFire(); shake(3); } }
    else {
      if (!L.hit && ship.alive && Math.abs(ship.y - L.y) < ER('laser') + shR && hurtShip(1)) L.hit = true; // once per laser
      if (L.t >= L.dur) L.dead = true;
    }
  }
  compact(elasers, L => !L.dead);
  if (rv.hold && rv.hold.dead) rv.hold = null;
}
function mineBlast(m) {
  m.dead = true;
  explode(m.x, m.y, 14, { fire: true, shard: 'metal', ringCol: '#ff8a5a', spark: '#ffb38a' }); ring(m.x, m.y, 40, '#ff6a4a', 0.35); sfx.boom('S');
  const rr = 40 + shipR() * 0.6, dx = ship.x - m.x, dy = ship.y - m.y;
  if (ship.alive && dx * dx + dy * dy < rr * rr) hurtShip(1);
}
function killMob(m, src) {
  if (m.dead) return;
  m.dead = true;
  explode(m.x, m.y, m.r, { shard: 'metal', fire: m.kind === 'mine', ringCol: m.kind === 'mine' ? '#ff8a5a' : '#9ff0ff', spark: '#ffcf6a' });
  sfx.boom('S');
  run.kills++; addKill(15, m.x, m.y);
  if (beamT <= 0) gainSuper(0.05);
  if (m.kind === 'drone') addPick('coin', m.x, m.y, 1);
  if (src === 'bot') { run.botKills++; pend.botKill++; }
  if (src === 'beam') { run.beamKills++; if (run.beamKills > run.beamMax) run.beamMax = run.beamKills; }
}
function updateEnemies(dt) {
  const shR = shipR(), hot = ship.alive && st === 'play' && !debug.invincible;
  for (const s of eshots) {
    if (s.dead) continue;
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.x < -30 || s.x > W + 60 || s.y < -30 || s.y > H + 30 || s.life <= 0) { s.dead = true; continue; }
    if (hot && ship.inv <= 0) {
      const rr = s.r + shR * 0.75, dx = s.x - ship.x, dy = s.y - ship.y;
      if (dx * dx + dy * dy < rr * rr) { s.dead = true; sparks(s.x, s.y, 5, '#ffb3a0', 120); hurtShip(s.dmg || 1); }
    }
  }
  compact(eshots, s => !s.dead);
  for (const m of emobs) {
    if (m.dead) continue;
    m.life -= dt; m.flash = Math.max(0, m.flash - dt * 6);
    if (ship.alive) { const want = Math.atan2(ship.y - m.y, ship.x - m.x), d = wrapA(want - m.ang), tr = m.turn * dt; m.ang += clamp(d, -tr, tr); }
    m.x += Math.cos(m.ang) * m.v * dt; m.y += Math.sin(m.ang) * m.v * dt;
    if (m.kind === 'mine' && (m.beepT -= dt) <= 0) { m.beepT = 0.25 + 0.75 * m.life / m.max; sfx.mine(); }
    else if (m.kind === 'drone' && Math.random() < 3 * dt * FX) addP(P_SPARK, m.x + rnd(-5, 5), m.y + rnd(-5, 5), rnd(-30, 30), rnd(-30, 30), 0.2, 3, '#ffb38a', 50);
    if (hot && ship.inv <= 0) {
      const rr = m.r + shR * 0.8, dx = m.x - ship.x, dy = m.y - ship.y;
      if (dx * dx + dy * dy < rr * rr) { if (m.kind === 'mine') mineBlast(m); else { m.dead = true; sparks(m.x, m.y, 8, '#ffcf6a', 140); hurtShip(1); } continue; }
    }
    if (m.life <= 0) { if (m.kind === 'mine') mineBlast(m); else { m.dead = true; smoke(m.x, m.y, 2, '#6d6a80'); } continue; }
    if (m.x < -40 || m.x > W + 80 || m.y < -60 || m.y > H + 60) m.dead = true;
  }
  compact(emobs, m => !m.dead);
}
function hitPlate(p, d) {
  p.hp -= d; p.flash = 1;
  if (p.hp > 0) { sfx.shieldHit(); return; }
  p.alive = false; sfx.plate();
  explode(p.x, p.y, 12, { shard: 'metal', spark: '#cfd8ff', ringCol: '#cfd8ff' });
  if (beamT <= 0) gainSuper(0.02);
  if (rv.plateT <= 0) rv.plateT = (rv.R.plates && rv.R.plates.respawn) || 7;
}
// player bolts against the duel targets: mines/drones, then plates, then the shield, then the rival
function boltDuel(b) {
  if (!rv || run.ds === 'intro' || run.ds === 'fixed') return;
  for (const m of emobs) {
    if (m.dead) continue;
    const rr = m.r + 4, dx = b.x - m.x, dy = b.y - m.y;
    if (dx * dx + dy * dy < rr * rr) { b.dead = true; m.hp -= b.dmg; m.flash = 1; sparks(b.x, b.y, 2, '#ffd27a', 100, -60); if (m.hp <= 0) killMob(m, 'bolt'); return; }
  }
  if (rv.plates) {
    const pr = (rv.R.plates.r || ER('plate')) + 4;
    for (const p of rv.plates) if (p.alive && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < pr * pr) { b.dead = true; sparks(b.x, b.y, 2, '#cfd8ff', 100, -60); hitPlate(p, b.dmg); return; }
  }
  const dx = b.x - rv.x, dy = b.y - rv.y;
  if (rv.sh && rv.sh.up && dx < 4) {
    const rr = rv.r + 16;
    if (dx * dx + dy * dy < rr * rr) { b.dead = true; sparks(b.x, b.y, 2, '#9ff0ff', 110, -80); if (run.ds === 'fight') damageRival(b.dmg, 'bolt'); return; }
  }
  const rr = rv.r + 4;
  if (dx * dx + dy * dy < rr * rr) {
    b.dead = true;
    if (run.ds !== 'fight' || rv.invT > 0) { sparks(b.x, b.y, 2, '#ffffff', 90, -80); return; } // invulnerable during a phase shift
    sparks(b.x, b.y, 2.5, '#ffd27a', 110, -60);
    damageRival(b.dmg, 'bolt');
  }
}
// the Amal Beam in a duel: % of max HP per second, breaks the shield, wipes shots, mines, drones and plates
function beamDuel(dt, b) {
  if (!rv || run.ds === 'intro' || run.ds === 'fixed') return;
  if (circRect(rv.x, rv.y, rv.r, b)) {
    if (rv.sh && rv.sh.up && run.ds === 'fight') breakShield();
    damageRival(rv.max * (S.beamDuel || BEAM_DUEL) * dt, 'beam');
  }
  if (rv.plates) for (const p of rv.plates) if (p.alive && circRect(p.x, p.y, rv.R.plates.r || 13, b)) { p.hp = 0; hitPlate(p, 1); }
  for (const s of eshots) if (!s.dead && circRect(s.x, s.y, s.r, b)) { s.dead = true; addP(P_SPARKLE, s.x, s.y, 0, 0, 0.3, 6, '#fff6c2', 30); }
  for (const m of emobs) if (!m.dead && circRect(m.x, m.y, m.r, b)) killMob(m, 'beam');
  for (const L of elasers) if (L.ph === 'fire' && Math.abs(L.y - ship.y) < 35) L.hit = true; // the beam also shelters the ship from a laser on its lane
}

// ---------------------------------------------------------------------------------------------
// Arrival / end of a run
function beginArrive() {
  if (st !== 'play') return;
  st = 'arrive'; stT = 0; beamT = 0; dragId = null;
  arrive = { T: 0, dur: run.last ? 4.4 : 3.0, last: run.last, vx: 0, sparkT: 0 };
  for (const o of objs) if (!o.dead) { smoke(o.x, o.y, 2, '#8a86a0', o.vx); sparks(o.x, o.y, 3, '#cfd8ff', 80); o.dead = true; }
  for (const m of meteors) m.dead = true;
  bolts.length = 0;
  for (const p of picks) p.pulled = true;
  sfx.fanfare(run.last); mood('happy', 9); say(run.last ? 'bot_arrive' : 'bot_win', true);
  const note = run.last ? tt('f_arrive') && T('f_arrive', tt('p_' + run.J.planet, tt('j_' + run.jid))) : tt('f_legDone');
  if (note) safe(UI.note, note);
  if (run.last) { ring(W - 56, 135, 240, '#fff6c2', 1.2); ring(W - 56, 135, 160, '#9ff0ff', 0.9); }
}
// what settlement gets (DESIGN §8.1: leg run and duel run)
function report() {
  const r = { score: Math.round(run.score), kills: run.kills, coins: run.coins, hits: run.hits, meteors: run.meteors, supers: run.supers, noHit: run.hits === 0,
    hpEnd: ship ? Math.max(0, ship.hp) : 0, maxHp: ship ? ship.maxHp : 0, comboMax: run.comboMax, beamMax: run.beamMax,
    crystals: run.crystals, chain: run.chain, botKills: run.botKills, pickups: run.pickups };
  if (run.mode === 'duel') r.time = Math.round((run.fightTime != null ? run.fightTime : run.fightT) * 10) / 10;
  return r;
}
function endRun(win) {
  if (!run || run.ended) return;
  run.ended = true;
  const duel = run.mode === 'duel';
  // a won run banks the coins already flying to the ship (the arrival pull, the fixed-rival burst)
  if (win) for (const p of picks) if (!p.dead && p.pulled && p.kind === 'coin') { run.coins += p.val; p.dead = true; }
  const r = report();
  flushTrack();
  let res = {};
  try {
    if (duel) res = (win ? M.finishDuel(run.rid, r) : M.failDuel(run.rid, r)) || {};
    else res = (win ? M.finishLeg(run.jid, run.li, r) : M.failLeg(run.jid, run.li, r)) || {};
  } catch (e) { console.error(e); }
  lastWin = win; lastRun = duel ? { mode: 'duel', rid: run.rid } : { jid: run.jid, li: run.li };
  st = 'over'; stT = 0; wakeOff(); dragId = null;
  safe(UI.showHud, false);
  const mine = run;
  const info = duel ? { win, duel: true, rid: mine.rid, run: r } : { win, jid: mine.jid, li: mine.li, run: r };
  const show = () => { if (st !== 'over' || run !== mine) return; safe(UI.showResult, Object.assign({}, res, info)); };
  // Ads hook: window.aboodAfterRun = async ({ score, coins, distance, sweets }) => {...}; results appear when it settles (15 s max).
  const hook = window.aboodAfterRun;
  if (typeof hook === 'function') Promise.race([Promise.resolve().then(() => hook({ score: r.score, coins: r.coins, distance: r.score, sweets: r.coins, win, jid: mine.jid, li: mine.li, duel, rid: mine.rid })), new Promise(rs => setTimeout(rs, 15000))]).catch(() => {}).finally(show);
  else show();
}

// ---------------------------------------------------------------------------------------------
// Update
function update(dt) {
  t += dt; stT += dt;
  if (st === 'menu' || st === 'boot' || st === 'pause' || !run) return;
  if (hitStop > 0) { hitStop -= dt; return; }
  hitStopCd -= dt;
  sim(dt);
}

function sim(dt) {
  const L = run.L, duel = run.mode === 'duel', active = st === 'play' || st === 'arrive' || st === 'dead';
  if (active) playT += dt;
  let spd = duel ? 60 : L.speed;
  if (st === 'arrive') spd *= 1 + easeOut(arrive.T / 1.6) * 3.5;
  if (st === 'over') spd *= 0.6;
  scroll += spd * dt;

  if (st === 'play' && !duel) {
    run.elapsed += dt;
    run.mercyT -= dt;
    if (!run.half && run.elapsed >= L.dur / 2) { run.half = true; const h = tt('f_halfway'); if (h) safe(UI.note, h); }
    if (!run.ending && run.elapsed >= L.dur) { run.ending = true; run.endT = 0; }
    if (run.ending) {
      run.endT += dt;
      let left = 0; for (const o of objs) if (!o.dead && o.x < W + 40) left++;
      const mLeft = meteors.some(m => !m.dead);
      if ((left === 0 && !mLeft) || run.endT > 4) beginArrive();
    } else { spawner(dt); meteorSpawner(); }
    if (!bot.startSay || (bot.startSay -= dt) <= 0) { if (bot.startSay !== null) { bot.startSay = null; say('bot_start', true); } }
    // ★3 reached (the score goal of DESIGN §4.3); settlement decides the stars
    if (!run.starSaid && L.star > 0 && run.score >= L.star) { run.starSaid = true; floatText('★★★', ship.x + 110, ship.y - 46, '#ffe066', 22); sfx.pickup(); }
  }
  if (st === 'play' && duel) run.elapsed += dt;
  if (st === 'dead') { run.deadT += dt; if (run.deadT >= 1.6) endRun(false); }
  if (st === 'arrive') { arrive.T += dt; if (arrive.T >= arrive.dur) endRun(true); }

  updateShip(dt);
  updateObjs(dt);
  if (duel && rv) { updateRival(dt); updateEnemies(dt); }
  else updateMeteors(dt);
  updatePicks(dt);
  updateBot(dt);
  updateParts(dt);
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboN = 0; mult = 1; lastMult = 1; } }
  run.coinChainT -= dt;
  shakeA *= Math.exp(-9 * dt); if (shakeA < 0.2) shakeA = 0;
  flashA = Math.max(0, flashA - dt * 1.6);
}

function canFire() {
  if (run.mode === 'duel') return run.ds === 'fight' || run.ds === 'shift';
  return !run.ending || run.endT < 3.5;
}
function updateShip(dt) {
  if (!ship.alive) return;
  if (st === 'play') {
    const kd = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kd) ship.ty = clamp(ship.ty + kd * 330 * dt, Y_MIN, Y_MAX);
    const k = (S.follow || 10) > 1.5 ? S.follow : (S.follow || 0.2) * 60; // rate constant (1/s)
    ship.py = ship.y;
    let step = (ship.ty - ship.y) * (1 - Math.exp(-k * dt));
    const vmax = (S.maxVy || 700) * dt; if (step > vmax) step = vmax; else if (step < -vmax) step = -vmax;
    ship.y += step;
    ship.vy = (ship.y - ship.py) / Math.max(dt, 1e-4);
    ship.tilt += (clamp(ship.vy / 360, -1, 1) - ship.tilt) * Math.min(1, dt * 10);
    ship.thrust = 0.6 + Math.min(0.3, Math.abs(ship.vy) / 1200);
    ship.inv = Math.max(0, ship.inv - dt);
    ship.rapidT = Math.max(0, ship.rapidT - dt);
    if (!ship.shieldUp && S.shieldCd > 0) { ship.shieldT -= dt; if (ship.shieldT <= 0) { ship.shieldUp = true; ring(ship.x, ship.y, 44, '#9ff0ff', 0.3); say2('f_shieldUp', ship.x + 30, ship.y + 40, '#9ff0ff', 14); } }
    if (S.superPassive > 0 && beamT <= 0) { superF = Math.min(1, superF + S.superPassive * dt); checkSuperFull(); }
    // hull ✦ regen: +1 hull after S.regen seconds without a hit
    if (S.regen > 0 && ship.hp < ship.maxHp) {
      run.regenT += dt;
      if (run.regenT >= S.regen) { run.regenT = 0; ship.hp++; ring(ship.x, ship.y, 40, '#9ff0a0', 0.35); say2('f_repair', ship.x + 30, ship.y + 40, '#9ff0a0', 14); }
    } else run.regenT = 0;
    // auto fire
    if (canFire()) {
      ship.fireT -= dt;
      if (ship.fireT <= 0) {
        const rate = (S.fireRate || 4) * (ship.rapidT > 0 ? 2 : 1);
        ship.fireT += 1 / rate; if (ship.fireT < 0) ship.fireT = 0;
        fire();
      }
    }
    // beam
    if (beamT > 0) {
      beamT -= dt;
      const b = beamRect();
      for (const o of objs) if (!o.dead && circRect(o.x, o.y, o.r, b)) kill(o, 'beam');
      for (const m of meteors) if (!m.dead && m.phase === 'go' && circRect(m.x, m.y, m.r, b)) killMeteor(m);
      if (run.mode === 'duel') beamDuel(dt, b);
      if (Math.random() < 0.5 * FX) addP(P_SPARKLE, rnd(ship.x + 40, W), ship.y + rnd(-30, 30), rnd(-80, 80), rnd(-60, 60), 0.4, rnd(5, 9), pick(['#fff6c2', '#9ff0ff']), 30);
      if (beamT <= 0) beamT = 0;
    }
  } else if (st === 'arrive') {
    const a = arrive;
    ship.py = ship.y;
    if (!a.last || a.T <= 0.35) { ship.ty += (200 - ship.ty) * Math.min(1, dt * 1.5); ship.y += (ship.ty - ship.y) * Math.min(1, dt * 3); }
    ship.vy = (ship.y - ship.py) / Math.max(dt, 1e-4); ship.tilt *= 0.9;
    ship.inv = 0; ship.thrust = 1;
    if (a.T > 0.35) {
      if (a.last) {
        // fly into orbit: glide to the planet's upper-left limb, shrinking with distance
        if (a.x0 == null) { a.x0 = ship.x; a.y0 = ship.y; }
        const P = arrivalPlanet(), f = easeInOut((a.T - 0.35) / 3.4);
        const tx = P.x - P.r * 0.95, ty = clamp(P.y - P.r * 0.3, 60, H - 60);
        ship.x = a.x0 + (tx - a.x0) * f; ship.ty = ship.y = a.y0 + (ty - a.y0) * f - Math.sin(f * Math.PI) * 30;
        ship.sc = 1 - 0.68 * f;
      } else { ship.vx += 300 * dt; ship.x += ship.vx * dt; }
    }
    if (a.last) {
      a.sparkT -= dt;
      if (a.sparkT <= 0) { a.sparkT = 0.05; addP(P_SPARKLE, rnd(W * 0.4, W), rnd(20, H - 20), rnd(-30, 30), rnd(-30, 30), rnd(0.5, 0.9), rnd(5, 10), pick(['#fff6c2', '#ffe066', '#9ff0ff'])); }
    }
  }
  // engine trail in the worn costume's colours and particle (DESIGN §5 fx)
  if ((st === 'play' || st === 'arrive') && Math.random() < 0.9 * FX) {
    const sc = ship.sc, fx = S.fx, tr = fx.trail, comet = fx.particle === 'comet', lm = fx.life > 0 ? fx.life : comet ? 2 : 1;
    const tier = S.tier || 0, ex = (37 + tier * 0.9) * (safe(A.shipScale, tier) || 1) + 4;
    const x = ship.x - ex * sc, y = ship.y + rnd(-3, 3) * sc, vx = -160 - rnd(0, 140) - (st === 'arrive' ? 300 : 0);
    addP(P_FIRE, x, y, vx, rnd(-14, 14), rnd(0.14, 0.26) * lm, rnd(5, 8) * sc, pick(tr), 40);
    if (fx.particle !== 'flame' && Math.random() < (comet ? 0.5 : 0.4)) {
      const col = tr[1 + (Math.random() * (tr.length - 1) | 0)] || tr[0];
      const p = addP(P_FX, x - 4 * sc, y + rnd(-4, 4) * sc, vx * 0.55, rnd(-26, 26), rnd(0.3, 0.55) * lm, rnd(4, 7) * sc, col, 40);
      if (p) { p.spr = fxSpr(fx.particle, col); p.vr = rnd(-4, 4); p.drag = 1; }
    }
  }
}
function fire() {
  const duel = run.mode === 'duel' && rv;
  for (const g of GUNS) {
    if (bolts.length >= 100) break;
    // duel bolts fly faster (flight ≈ 0.6 s across the arena) and steer gently towards the rival (see updateObjs),
    // so a player who follows the rival lands about the 65 % of hits the duel fairness check assumes (DESIGN §3.1).
    // Plain 640 u/s bolts land under 25 % against a sine mover (model: scratchpad etests/aim.mjs).
    const a = g.angle || 0, v = duel ? 1000 : 640, mx = ship.x + (g.dx || 30) * ship.sc, my = ship.y + (g.dy || 0) * ship.sc;
    let vx, vy, ang, dmg = S.dmg || 1;
    if (duel) {
      // duels: the volley converges on the ship's line at the rival's x (DESIGN §3.1), each bolt worth dmg × duelBolt
      const a2 = a * 0.15, dy = (g.dy || 0) * ship.sc;
      vx = Math.cos(a2) * v; vy = -dy * v / Math.max(80, rv.x - mx) + Math.sin(a2) * v; ang = Math.atan2(vy, vx);
      dmg *= S.duelBolt || 1;
    } else { vx = Math.cos(a) * v; vy = Math.sin(a) * v; ang = a; }
    bolts.push({ x: mx, y: my, vx, vy, ang, dmg, lv: BLV, pierce: S.pierce | 0, skip: null, dead: false, as: duel ? 0 : null });
  }
  sfx.shoot();
}
function updateObjs(dt) {
  const shR = shipR(), duel = run.mode === 'duel';
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.as !== null && rv) { b.as += clamp((rv.y - b.y) * 2 - b.as, -40, 40) * dt * 8; b.y += b.as * dt; b.ang = Math.atan2(b.vy + b.as, b.vx); } // duel aim assist
    if (b.x > W + 20 || b.y < -20 || b.y > H + 20) { b.dead = true; continue; }
    for (let j = 0; j < objs.length; j++) {
      const o = objs[j]; if (o.dead || o === b.skip) continue;
      const rr = o.r + 4, dx = b.x - o.x, dy = b.y - o.y;
      if (dx * dx + dy * dy < rr * rr) {
        // blaster ✦ pierce: a bolt passes through one small rock or ice shard
        if (b.pierce > 0 && o.type === 'rock' && o.size === 'S' && o.kind !== 'crystal') { b.pierce--; b.skip = o; }
        else b.dead = true;
        sparks(b.x, b.y, 2.5, o.kind === 'ice' ? '#d6f6ff' : '#ffd27a', 110, -60);
        damage(o, b.dmg, 'bolt');
        break;
      }
    }
    if (b.dead) continue;
    if (duel) { boltDuel(b); continue; }
    for (const m of meteors) { // meteors shrug bolts off (only the beam breaks them)
      if (m.phase !== 'go' || m.dead) continue;
      const dx = b.x - m.x, dy = b.y - m.y, rr = m.r + 4;
      if (dx * dx + dy * dy < rr * rr) { b.dead = true; sparks(b.x, b.y, 2, '#ffcf6a', 120, -200); break; }
    }
  }
  compact(bolts, b => !b.dead);
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]; if (o.dead) continue;
    if (o.killT > 0) { o.killT -= dt; if (o.killT <= 0) { kill(o, o.chainSrc || 'blast'); continue; } }
    o.x += o.vx * dt;
    if (o.kind === 'drone') { o.ph += dt * 2.2; o.y = o.by + Math.sin(o.ph) * o.wob; o.by += o.vy * dt; }
    else o.y += o.vy * dt;
    o.rot += o.vr * dt;
    o.flash = Math.max(0, o.flash - dt * 6);
    if (o.x < -o.r - 60 || o.y < -o.r - 80 || o.y > H + o.r + 80) { o.dead = true; continue; }
    if (o.kind === 'drone' && Math.random() < 3 * dt * FX) addP(P_SPARK, o.x + rnd(-8, 8), o.y + rnd(-8, 8), rnd(-40, 40), rnd(-40, 40), 0.2, 4, '#9fe8ff', 50);
    if (ship.alive && st === 'play') {
      const rr = o.r * 0.85 + shR, dx = o.x - ship.x, dy = o.y - ship.y;
      if (dx * dx + dy * dy < rr * rr && ship.inv <= 0 && !debug.invincible) { if (hurtShip(1)) kill(o, 'ram'); }
    }
  }
  compact(objs, o => !o.dead);
}
function killMeteor(m) {
  m.dead = true;
  explode(m.x, m.y, 30, { fire: true, shard: 'rock', ringCol: '#ffb347', spark: '#ffcf6a', fireCol: '#ff6a2a' });
  ring(m.x, m.y, 100, '#ff9a3c', 0.5);
  play('boomL', 1.1); shake(8); hitStopMs(40);
  run.kills++; addKill(100, m.x, m.y);
  run.beamKills++; if (run.beamKills > run.beamMax) run.beamMax = run.beamKills;
}
function updateMeteors(dt) {
  const shR = shipR();
  for (const m of meteors) {
    if (m.dead) continue;
    if (m.phase === 'warn') {
      m.wt += dt;
      if (m.wt >= m.warn) { m.phase = 'go'; sfx.whoosh(); }
      continue;
    }
    m.x += m.vx * dt;
    if (Math.random() < 0.7 * FX) addP(P_FIRE, m.x + rnd(0, 20), m.y + rnd(-8, 8), rnd(-40, 40) + 200, rnd(-20, 20), rnd(0.2, 0.4), rnd(8, 14), pick(['#ff8a2a', '#ffb347']), 30);
    // smash rocks in the lane (no score)
    for (const o of objs) {
      if (o.dead) continue;
      const rr = o.r + m.r, dx = o.x - m.x, dy = o.y - m.y;
      if (dx * dx + dy * dy < rr * rr) kill(o, 'meteor');
    }
    // G3: overlapping the ship is never a dodge, even while it blinks after a hit
    if (ship.alive && st === 'play' && !m.hitShip) {
      const rr = m.r * 0.8 + shR, dx = m.x - ship.x, dy = m.y - ship.y;
      if (dx * dx + dy * dy < rr * rr) { m.hitShip = true; if (ship.inv <= 0 && !debug.invincible) hurtShip(2); }
    }
    if (!m.counted && m.x + m.r < ship.x - shR) {
      m.counted = true;
      if (!m.hitShip && ship.alive && st === 'play') {
        run.meteors++; safe(M.track, 'meteor', 1);
        if (Math.abs(m.y - ship.y) < 60) {
          run.score += 20; floatText('+20', ship.x, ship.y - 34, '#9ff0ff', 16);
          if (S.nearMiss > 0) { superF = Math.min(1, superF + S.nearMiss); checkSuperFull(); } // engine ✦ near miss
        }
        mood('happy', 1);
      }
    }
    if (m.x < -420) m.dead = true;
  }
  compact(meteors, m => !m.dead);
}
function updatePicks(dt) {
  const L = run.L, mag = Math.max(0, S.magnet || 0), vac = S.bot.lv >= 1 ? Math.max(0, S.bot.vacuum || 0) : 0, pullAll = !!S.pullPickups;
  const tx = ship.x, ty = ship.y, pulse = rv && rv.pulseT > 0;
  for (const p of picks) {
    if (p.dead) continue;
    p.life -= dt; p.ph += dt;
    const coin = p.kind === 'coin';
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    // magnet: coins (power-ups too with the magnet ✦); Nabeeh's vacuum takes coins
    let pull = p.pulled || (ship.alive && d < mag && (coin || pullAll));
    if (!pull && coin && vac > 0 && bot && Math.hypot(bot.x - p.x, bot.y - p.y) < vac) pull = true;
    // Magna's pulse: coins on screen fly to her and are lost when they reach her
    if (pulse && coin && !(pull && d < 60)) {
      const ex = rv.x - p.x, ey = rv.y - p.y, e = Math.hypot(ex, ey) || 1, sp = 340;
      p.vx += (ex / e * sp - p.vx) * Math.min(1, dt * 5); p.vy += (ey / e * sp - p.vy) * Math.min(1, dt * 5);
      p.x += p.vx * dt; p.y += p.vy * dt; p.pulled = false;
      if (e < rv.r * 0.8) { p.dead = true; addP(P_SPARKLE, p.x, p.y, 0, 0, 0.3, 6, '#7fb4ff', 20); }
      continue;
    }
    if (pull && ship.alive && st !== 'dead' && st !== 'over') {
      p.pulled = true;
      const sp = 260 + 600 * (1 - Math.min(1, d / 220)) + (st === 'arrive' ? 500 : 0);
      p.vx += (dx / d * sp - p.vx) * Math.min(1, dt * 8); p.vy += (dy / d * sp - p.vy) * Math.min(1, dt * 8);
    } else {
      p.vx += (-L.speed * 0.7 - p.vx) * Math.min(1, dt * 1.5); p.vy *= Math.exp(-2 * dt);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (ship.alive && (st === 'play' || st === 'arrive') && d < 26 * Math.max(0.5, ship.sc)) { p.dead = true; collect(p); continue; }
    if (p.x < -30 || p.life <= 0 || p.y < -40 || p.y > H + 40) p.dead = true;
  }
  compact(picks, p => !p.dead);
}
function botShoot(tx, ty, o) {
  lasers.push({ x1: bot.x + 8, y1: bot.y, x2: tx, y2: ty, o, life: 0.14, max: 0.14 });
  sparks(tx, ty, 3, '#9ff0ff', 90);
}
function updateBot(dt) {
  let tx = (ship.alive ? ship.x : ship.x + 10) - 50 * ship.sc, ty = Math.max(26, ship.y - 46 * ship.sc);
  // the fixed cinematic: Nabeeh flies over and plugs into the rival
  const plug = rv && run.ds === 'fixed' && run.dsT > 0.2 && run.dsT < 1.8;
  if (plug) { tx = rv.x - rv.r - 16; ty = rv.y - 8; }
  const k = plug ? 60 : 38, dmp = 2 * Math.sqrt(k) * 0.75;
  bot.vx += ((tx - bot.x) * k - bot.vx * dmp) * dt; bot.vy += ((ty - bot.y) * k - bot.vy * dmp) * dt;
  bot.x += bot.vx * dt; bot.y += bot.vy * dt + Math.sin(t * 2.4) * 6 * dt;
  if (plug && run.dsT > 0.6 && Math.random() < 0.5) { lasers.push({ x1: bot.x + 8, y1: bot.y, x2: rv.x - rv.r * 0.4, y2: rv.y, o: null, life: 0.1, max: 0.1 }); }
  if (bot.moodT > 0) { bot.moodT -= dt; if (bot.moodT <= 0) bot.mood = 'normal'; }
  if (bot.sayT > 0) bot.sayT -= dt;
  for (const l of lasers) { l.life -= dt; if (l.o && !l.o.dead) { l.x2 = l.o.x; l.y2 = l.o.y; } }
  compact(lasers, l => l.life > 0);
  const B = S.bot;
  if (st !== 'play' || !ship.alive || !(B.lv >= 1) || !(B.rate > 0)) return;
  bot.zapT -= dt;
  if (bot.zapT > 0) return;
  bot.zapT = 1 / B.rate;
  const shots = B.double ? 2 : 1, used = [];
  if (run.mode === 'duel') {
    if (run.ds === 'intro' || run.ds === 'fixed') return;
    let n = 0;
    for (let s = 0; s < shots; s++) {
      // lv4 ✦ intercept: shots, mines and drones within 170 of the ship come first
      let best = null, bd = 170 * 170, kind = '';
      if (B.intercept) {
        for (const e of eshots) { if (e.dead || used.includes(e)) continue; const d = (e.x - ship.x) ** 2 + (e.y - ship.y) ** 2; if (d < bd) { bd = d; best = e; kind = 'shot'; } }
        for (const m of emobs) { if (m.dead || used.includes(m)) continue; const d = (m.x - ship.x) ** 2 + (m.y - ship.y) ** 2; if (d < bd) { bd = d; best = m; kind = 'mob'; } }
      }
      if (!best && run.ds === 'fight' && rv.invT <= 0) { best = rv; kind = 'rival'; }
      if (!best) { bd = 1e9; for (const o of objs) { if (o.dead || o.x > W - 6 || o.x < ship.x - 20 || used.includes(o)) continue; const d = (o.x - bot.x) ** 2 + (o.y - bot.y) ** 2; if (d < bd) { bd = d; best = o; kind = 'obj'; } } }
      if (!best) break;
      if (kind !== 'rival') used.push(best);
      n++;
      if (kind === 'shot') { best.dead = true; botShoot(best.x, best.y, null); }
      else if (kind === 'mob') { botShoot(best.x, best.y, best); best.hp -= B.dmg || 1; best.flash = 1; if (best.hp <= 0) killMob(best, 'bot'); }
      else if (kind === 'rival') { botShoot(rv.x - rv.r * 0.5, rv.y + rnd(-6, 6), null); damageRival(B.dmg || 1, 'bot'); }
      else { botShoot(best.x, best.y, best); damage(best, B.dmg || 1, 'bot'); }
    }
    if (n) sfx.zap();
    return;
  }
  for (let s = 0; s < shots; s++) {
    let best = null, bd = 1e9;
    for (const o of objs) {
      if (o.dead || o.x > W - 6 || o.x < ship.x - 20 || used.includes(o)) continue;
      const d = (o.x - bot.x) ** 2 + (o.y - bot.y) ** 2; if (d < bd) { bd = d; best = o; }
    }
    if (!best) break;
    used.push(best);
    botShoot(best.x, best.y, best);
    damage(best, B.dmg || 1, 'bot');
  }
  if (used.length) sfx.zap();
}
function updateParts(dt) {
  for (const p of parts) {
    p.life -= dt;
    if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  compact(parts, p => p.life > 0);
  for (const s of texts) { s.life -= dt; s.y += s.vy * dt; s.vy *= Math.exp(-1.5 * dt); }
  compact(texts, s => s.life > 0);
}

// ---------------------------------------------------------------------------------------------
// Render
function render() {
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (offY > 0.5) { c.fillStyle = '#070a1f'; c.fillRect(0, 0, cv.width, cv.height); }
  c.setTransform(RES, 0, 0, RES, 0, offY * RES);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (st === 'menu' || st === 'boot' || !run) {
    if (t - menuOT > 0.5 || t < menuOT) refreshMenuO(); // the costume or character may change in the sheets
    safe(A.drawStationScene, c, W, H, t, menuO); return;
  }
  drawWorld(c);
}

const RO = { x: 0, y: 0, r: 0, rot: 0, seed: 0, kind: '', flash: 0, palette: null }; // scratch objects for art calls (G8)
const JO = { x: 0, y: 0, s: 1, rot: 0, seed: 0, kind: '', flash: 0, t: 0 };
const MO = { x: 0, y: 0, r: 0, vx: 0, seed: 0 };
const SO = { t: 0, tier: 0, guns: 1, tilt: 0, thrust: 0, char: 'abood', costume: null, suit: null, skin: null, aura: null, rings: null, ringR: 0, trail: undefined, hurt: 0, shield: 0, beam: false };
const RVO = { t: 0, s: 1, hurt: 0, phase: 0, stun: 0, tell: 0, mood: 'angry', alpha: 1, shield: 0, shift: 0, limp: 0, thrust: 0.5 };
function drawWorld(c) {
  const J = run.J, L = run.L, duel = run.mode === 'duel';
  const prog = duel ? 0.5 : clamp(run.elapsed / L.dur, 0, 1);
  // A2: during the final arrival the big planet covers the destination, so drawSpace skips it
  const toId = arrive && arrive.last ? null : J.planet;
  try { A.drawSpace(c, W, H, t, scroll, J.theme, prog, J.from, toId); } catch (e) { c.fillStyle = '#0b1030'; c.fillRect(0, 0, W, H); errOnce('drawSpace', e); }
  if (arrive && arrive.last) drawArrivalPlanet(c, J);
  // shaken play layer
  let sx = 0, sy = 0;
  if (shakeA > 0 && !REDUCED) { sx = rnd(-1, 1) * shakeA; sy = rnd(-1, 1) * shakeA; }
  c.save(); c.translate(sx, sy);
  if (duel && rv) { try { drawDuelUnder(c); } catch (e) { errOnce('duelUnder', e); } }
  // A3: the "!" marker moves left of the super button when the lane is low
  for (const m of meteors) if (m.phase === 'warn' && !m.dead) safe(A.drawWarning, c, W, m.y, m.wt / m.warn, t, m.y > H - 125 ? W - 125 : W - 20);
  for (const p of picks) {
    const bob = p.kind === 'coin' ? 0 : Math.sin(t * 4 + p.ph) * 3;
    if (p.life < 2 && Math.floor(p.life * 8) % 2) continue;
    safe(A.drawPickup, c, p.kind, p.x, p.y + bob, t + p.ph);
  }
  const pal = J.theme.rock, ipal = J.theme.ice || J.theme.rock;
  for (const o of objs) {
    if (o.dead) continue;
    if (o.type === 'rock') { RO.x = o.x; RO.y = o.y; RO.r = o.r; RO.rot = o.rot; RO.seed = o.seed; RO.kind = o.kind; RO.flash = o.flash; RO.palette = o.kind === 'ice' ? ipal : pal; A.drawRock(c, RO); }
    else { JO.x = o.x; JO.y = o.y; JO.rot = o.rot; JO.seed = o.seed; JO.kind = o.kind; JO.flash = o.flash; JO.t = t; A.drawJunk(c, JO); }
  }
  if (duel && rv) { try { drawRivalNow(c); } catch (e) { errOnce('rival', e); } }
  drawParts(c, false);
  const bk = S.fx.bolt || 'blaster';
  for (const b of bolts) A.drawBolt(c, b.x, b.y, bk, b.lv, b.ang);
  for (const m of meteors) if (m.phase === 'go' && !m.dead) { MO.x = m.x; MO.y = m.y; MO.r = m.r; MO.vx = m.vx; MO.seed = m.seed; A.drawMeteor(c, MO, t); }
  if (duel && rv) { try { drawDuelOver(c); } catch (e) { errOnce('duelOver', e); } }
  if (beamT > 0 && ship.alive) A.drawBeam(c, ship.x + 22, ship.y, W, clamp(beamT / beamMax, 0, 1), t);
  for (const l of lasers) A.drawBotLaser(c, l.x1, l.y1, l.x2, l.y2, l.life / l.max);
  drawParts(c, true);
  if (ship.alive) drawShipNow(c);
  A.drawNabeeh(c, bot.x, bot.y, 0.5, { t, mood: bot.mood, talk: bot.sayT > 0, laser: lasers.length > 0 });
  if (bot.sayT > 0 && bot.say) {
    const age = bot.sayMax - bot.sayT, f = Math.min(1, age / 0.15, bot.sayT / 0.25);
    A.drawBubble(c, bot.x + 6, bot.y - 14, bot.say, f, W);
  }
  if (duel && rv && rv.sayT > 0 && rv.say && rv.alpha > 0.2) {
    const age = rv.sayMax - rv.sayT, f = Math.min(1, age / 0.15, rv.sayT / 0.25);
    safe(A.drawBubble, c, rv.x - rv.r * 0.4, rv.y - rv.r - 2, rv.say, f, W);
  }
  drawTexts(c);
  c.restore();
  // low hull: soft red edge from the left, slow pulse (no strobe); the gradient is built once (G8)
  if (ship.alive && ship.hp === 1 && st === 'play') {
    if (!LOWG) { LOWG = c.createLinearGradient(0, 0, 130, 0); LOWG.addColorStop(0, 'rgba(200,32,43,1)'); LOWG.addColorStop(1, 'rgba(200,32,43,0)'); }
    c.globalAlpha = 0.16 + 0.08 * Math.sin(t * 2.5); c.fillStyle = LOWG; c.fillRect(0, 0, 130, H); c.globalAlpha = 1;
  }
  if (flashA > 0.01) { c.globalAlpha = flashA; c.fillStyle = '#fff6e0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  if (arrive && arrive.last && arrive.T > arrive.dur - 0.8) { c.globalAlpha = clamp((arrive.T - (arrive.dur - 0.8)) / 0.8, 0, 1) * 0.5; c.fillStyle = '#fff6e0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
}
let LOWG = null;
// Duel drawing. Every art call has a plain fallback so a missing art export never blanks the arena.
function drawDuelUnder(c) {
  // laser warnings and the ram lane under everything
  for (const L of elasers) if (L.ph === 'warn') {
    if (A.drawEnemyLaser) A.drawEnemyLaser(c, L.x0, L.y, clamp(L.t / L.warn, 0, 1), 'warn', t);
    else { c.save(); c.setLineDash([12, 8]); c.strokeStyle = 'rgba(255,60,70,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(L.x0, L.y); c.lineTo(0, L.y); c.stroke(); c.restore(); }
  }
  if (rv.ram && rv.ram.ph === 'warn') {
    const f = clamp(rv.ram.t / rv.ram.warn, 0, 1), a = 0.25 + 0.35 * f;
    c.save(); c.setLineDash([18, 10]); c.lineDashOffset = t * 120; c.strokeStyle = `rgba(255,90,60,${a})`; c.lineWidth = rv.r * 1.2; c.globalAlpha = 0.25;
    c.beginPath(); c.moveTo(rv.x - rv.r, rv.ram.y); c.lineTo(150 - rv.r, rv.ram.y); c.stroke();
    c.globalAlpha = 1; c.lineWidth = 2; c.strokeStyle = `rgba(255,120,90,${a + 0.3})`; c.beginPath(); c.moveTo(rv.x - rv.r, rv.ram.y); c.lineTo(60, rv.ram.y); c.stroke(); c.restore();
  }
  if (rv.blink) {
    const f = clamp(rv.blink.t / rv.blink.tell, 0, 1);
    for (const y of [rv.blink.ty, ...rv.blink.dec]) {
      if (A.drawBlinkGhost) A.drawBlinkGhost(c, rv.id, rv.x, y, f, t);
      else { c.save(); c.setLineDash([4, 5]); c.strokeStyle = `rgba(220,200,255,${0.3 + 0.5 * f})`; c.lineWidth = 2; c.beginPath(); c.arc(rv.x, y, rv.r, 0, TAU); c.stroke(); c.restore(); }
    }
  }
  if (rv.pulseT > 0) {
    if (A.drawPulse) A.drawPulse(c, rv.x, rv.y, t);
    else { c.save(); c.strokeStyle = 'rgba(127,180,255,.5)'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { const r = rv.r + ((t * 120 + i * 60) % 180); c.beginPath(); c.arc(rv.x, rv.y, r, 0, TAU); c.stroke(); } c.restore(); }
  }
}
function drawRivalNow(c) {
  const sh = rv.sh ? (rv.sh.up ? clamp(rv.sh.hp / rv.sh.max, 0, 1) : 0) : 0;
  if (rv.plates) for (const p of rv.plates) if (p.alive) {
    if (A.drawPlate) A.drawPlate(c, p.x, p.y, p.rot, p.flash);
    else { c.fillStyle = p.flash > 0.5 ? '#fff' : '#9aa3b8'; c.fillRect(p.x - 10, p.y - 7, 20, 14); }
  }
  const shift = run.ds === 'shift';
  const o = RVO; o.t = t; o.hurt = rv.hurt; o.phase = Math.min(2, rv.ph); o.stun = rv.stunT > 0 ? clamp(rv.stunT, 0.01, 1) : 0;
  o.shift = shift ? clamp(1 - run.dsT / 1.2, 0, 1) : 0; o.limp = run.ds === 'fixed' ? rv.limp || 0 : 0; o.thrust = rv.ram && rv.ram.ph !== 'warn' ? 1.4 : 0.5 + Math.min(0.5, Math.abs(rv.ty - rv.y) / 120);
  o.tell = rv.tell; o.mood = run.ds === 'fixed' ? (rv.fixedEye ? 'fixed' : 'hit') : rv.hurt > 0.6 ? 'hit' : 'angry'; o.shield = sh;
  o.alpha = rv.alpha * (shift && Math.floor(t * 14) % 2 ? 0.55 : 1);
  if (o.alpha <= 0.01) return;
  c.save(); c.translate(rv.x, rv.y); if (rv.rot) c.rotate(rv.rot);
  if (A.drawRival) A.drawRival(c, rv.id, 0, 0, o);
  else {
    c.globalAlpha = o.alpha; c.fillStyle = o.hurt > 0.5 ? '#ffd0c0' : '#8a8fa8'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, rv.r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = o.mood === 'fixed' ? '#5ef2ff' : '#ff3040'; c.beginPath(); c.arc(-rv.r * 0.35, -2, rv.r * 0.28, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }
  c.restore();
  if (sh > 0) {
    if (A.drawRivalShield) A.drawRivalShield(c, rv.x, rv.y, rv.r, sh, t);
    else { c.save(); c.strokeStyle = `rgba(159,240,255,${0.4 + 0.5 * sh})`; c.lineWidth = 4; c.beginPath(); c.arc(rv.x, rv.y, rv.r + 14, Math.PI * 0.6, Math.PI * 1.4); c.stroke(); c.restore(); }
  }
  for (const m of emobs) {
    if (m.kind === 'mine') { if (A.drawMine) A.drawMine(c, m.x, m.y, t, 1 - m.life / m.max); else { c.fillStyle = m.flash > 0.5 ? '#fff' : '#c8202b'; c.beginPath(); c.arc(m.x, m.y, m.r, 0, TAU); c.fill(); } }
    else if (A.drawMiniDrone) A.drawMiniDrone(c, m.x, m.y, t, m.flash);
    else { c.fillStyle = m.flash > 0.5 ? '#fff' : '#ffb347'; c.beginPath(); c.arc(m.x, m.y, m.r, 0, TAU); c.fill(); }
  }
}
function drawDuelOver(c) {
  for (const s of eshots) {
    if (A.drawEnemyShot) A.drawEnemyShot(c, s.kind, s.x, s.y, s.ang, t);
    else { c.fillStyle = s.kind === 'dart' ? '#ffe066' : '#ff6a3c'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
  }
  for (const L of elasers) if (L.ph === 'fire') {
    const f = clamp(1 - L.t / L.dur, 0, 1);
    if (A.drawEnemyLaser) A.drawEnemyLaser(c, L.x0, L.y, f, 'fire', t);
    else { c.fillStyle = `rgba(255,60,70,${0.5 + 0.5 * f})`; c.fillRect(0, L.y - 11, L.x0, 22); c.fillStyle = '#fff'; c.fillRect(0, L.y - 3, L.x0, 6); }
  }
}
// Final leg: the destination swells to fill much of the screen while the ship flies into its orbit.
// It starts exactly where drawSpace leaves it at progress 1 (r 135 at (W-56, 135)) and the centre moves less than the
// radius grows, so the copy underneath is always covered.
function arrivalPlanet() {
  const f = arrive ? easeInOut(clamp(arrive.T / 3.4, 0, 1)) : 0;
  const x0 = W - 56, y0 = H * 0.27 + 124 * 0.22, r0 = 135, x1 = W - 90, y1 = H * 0.48, r1 = 260;
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, r: r0 + (r1 - r0) * f, f };
}
function drawArrivalPlanet(c, J) {
  const P = arrivalPlanet();
  safe(A.drawPlanet, c, J.planet, P.x, P.y, P.r, t);
}
function drawShipNow(c) {
  // drawShip blinks while hurt > 0 (with a white flash early on) and draws the hex shield bubble when shield > 0
  c.save();
  c.translate(ship.x, ship.y); if (ship.sc !== 1) c.scale(ship.sc, ship.sc);
  const o = SO; o.t = t; o.tier = S.tier || 0; o.guns = S.guns || 1; o.tilt = ship.tilt; o.thrust = ship.thrust;
  // costume look from stats().fx: aura glow, the Magnet costume's rings at the magnet radius (ringR is in ship space), flame colours
  o.char = S.char || 'abood'; o.costume = o.suit = S.costume; o.skin = S.skin; o.aura = S.fx.aura || null; o.trail = S.fx.trail;
  o.rings = S.fx.rings || null; o.ringR = (S.magnet || 0) / (ship.sc || 1);
  o.hurt = ship.inv > 0 ? ship.inv / 1.4 : 0; o.shield = ship.shieldUp || ship.extraShield > 0 ? 1 : 0; o.beam = beamT > 0;
  A.drawShip(c, 0, 0, o);
  c.restore();
}
function drawParts(c, add) {
  if (add) { c.save(); c.globalCompositeOperation = 'lighter'; }
  for (const p of parts) {
    const f = p.life / p.max;
    switch (p.k) {
      case P_SPARK: case P_SPARKLE: if (!add) break; {
        const r = p.r * (0.4 + 0.6 * f) * (p.k === P_SPARKLE ? 1 : 1.4);
        c.globalAlpha = Math.min(1, f * 1.4);
        if (p.spr) c.drawImage(p.spr, p.x - r, p.y - r, r * 2, r * 2); else { c.fillStyle = p.col; c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
        if (p.k === P_SPARKLE) { c.fillStyle = '#fffbe8'; c.fillRect(p.x - r * 0.6, p.y - 0.6, r * 1.2, 1.2); c.fillRect(p.x - 0.6, p.y - r * 0.6, 1.2, r * 1.2); }
      } break;
      case P_FIRE: if (!add) break; {
        const r = p.r * (1.4 - 0.6 * f);
        c.globalAlpha = f * 0.75;
        if (p.spr) c.drawImage(p.spr, p.x - r, p.y - r, r * 2, r * 2); else { c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, r * 0.4, 0, TAU); c.fill(); }
      } break;
      case P_FX: if (!add) break; {
        const r = p.r * (0.5 + 0.5 * f);
        c.globalAlpha = Math.min(1, f * 1.5);
        if (p.spr) { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(p.spr, -r, -r, r * 2, r * 2); c.restore(); }
      } break;
      case P_SMOKE: if (add) break; {
        const r = p.r * (1.8 - 0.8 * f);
        c.globalAlpha = f * 0.45; c.drawImage(p.spr, p.x - r, p.y - r, r * 2, r * 2);
      } break;
      case P_SHARD: if (add) break; {
        c.globalAlpha = Math.min(1, f * 2);
        const r = p.r;
        if (p.spr) { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(p.spr, -r, -r, r * 2, r * 2); c.restore(); }
        else { c.fillStyle = '#8a7a6a'; c.fillRect(p.x - r / 2, p.y - r / 2, r, r); }
      } break;
      case P_DEBRIS: if (add) break; {
        c.globalAlpha = Math.min(1, f * 2); c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = p.col; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.roundRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2, 1.5); c.fill(); c.stroke(); c.restore();
      } break;
      case P_RING: if (add) break; {
        c.globalAlpha = 1; safe(A.drawExplosionRing, c, p.x, p.y, p.r, 1 - f, p.col);
      } break;
    }
  }
  c.globalAlpha = 1;
  if (add) c.restore();
}
function drawTexts(c) {
  if (!texts.length) return;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  const rtl = lang() === 'ar' ? 'rtl' : 'ltr';
  for (const s of texts) {
    c.direction = s.loc ? rtl : 'ltr';
    const age = s.max - s.life, k = age < 0.15 ? 1.4 - 0.4 * (age / 0.15) : 1;
    c.globalAlpha = Math.min(1, s.life / 0.3);
    c.font = '800 ' + Math.round(s.size * k) + 'px ' + FONT;
    c.lineWidth = 4; c.strokeStyle = INK; c.strokeText(s.s, s.x, s.y);
    c.fillStyle = s.col; c.fillText(s.s, s.x, s.y);
  }
  c.globalAlpha = 1; c.direction = 'inherit';
}
const errSeen = new Set();
function errOnce(k, e) { if (errSeen.has(k)) return; errSeen.add(k); console.error(k, e); }

// ---------------------------------------------------------------------------------------------
// HUD (one reused object; ui.js writes the DOM only on change)
const HUDO = { hp: 0, maxHp: 0, score: 0, coins: 0, prog: 0, superF: 0, shield: 0, combo: 1, rapid: 0, duel: false, rival: null };
const RIVH = { id: '', name: '', hp: 0, max: 1, phase: 0, phases: 1, ticks: [], shield: 0, stun: false, intro: 1 };
function hudNow() {
  if (!run || !ship || (st !== 'play' && st !== 'pause' && st !== 'arrive' && st !== 'dead')) return;
  const sh = ship.shieldUp || ship.extraShield > 0 ? 1 : S.shieldCd > 0 ? clamp(1 - ship.shieldT / S.shieldCd, 0, 0.99) : 0;
  const o = HUDO, duel = run.mode === 'duel';
  o.hp = ship.hp; o.maxHp = ship.maxHp; o.score = Math.round(run.score); o.coins = run.coins;
  o.prog = duel ? 0 : Math.round(clamp(run.elapsed / run.L.dur, 0, 1) * 200) / 200;
  o.superF = Math.round(superF * 100) / 100; o.shield = Math.round(sh * 50) / 50; o.combo = mult;
  o.rapid = ship.rapidT > 0 ? Math.round(ship.rapidT / 6 * 50) / 50 : 0;
  o.duel = duel; o.rival = null;
  if (duel && rv) {
    const r = RIVH;
    if (r.id !== rv.id) { r.id = rv.id; r.name = rvName(rv.id); r.max = rv.max; r.phases = (rv.R.phases || []).length || 1; r.ticks = (rv.R.phases || []).slice(1).map(p => p.at); }
    r.hp = Math.ceil(rv.hp); r.phase = rv.ph; r.stun = rv.stunT > 0;
    r.shield = rv.sh && rv.sh.up ? Math.round(clamp(rv.sh.hp / rv.sh.max, 0, 1) * 50) / 50 : 0;
    r.intro = run.ds === 'intro' ? Math.round(clamp(run.dsT / 1.2, 0, 1) * 20) / 20 : 1;
    o.rival = r;
  }
  safe(UI.hud, o);
}

// ---------------------------------------------------------------------------------------------
// Loop: frame cap 60 in flight (30 with the battery saver) / 30 in menus / 20 on the results card,
// dt clamp + sub-steps, quality auto-downgrade
let last = 0, fAcc = 0, fN = 0, slowWins = 0, nextDue = 0, running = false;
let fpsCap = (() => { try { return (safe(M.settings) || {}).fps === 30 ? 30 : 60; } catch (e) { return 60; } })();
function stepDown() { if (qLevel >= QDPR.length - 1) return; qLevel++; slowWins = 0; resize(); safe(A.setArtQuality, qLevel); GLOWS.clear(); SHARDS.clear(); FXS.clear(); }
// G2: slow frames are clamped (not thrown away), the window is time based, and very slow devices step down at once
function perf(raw) {
  if (st !== 'play' || raw > 0.5) return; // a tab switch or a long GC is not a slow device
  raw = Math.min(raw, 0.25);
  fAcc += raw; fN++;
  if (fAcc >= 1.5) {
    const avg = fAcc / fN; fAcc = 0; fN = 0;
    if (avg > 2 / fpsCap) stepDown();
    else if (avg > 1.4 / fpsCap) { if (++slowWins >= 2) stepDown(); }
    else slowWins = 0;
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  const fast = st === 'play' || st === 'arrive' || st === 'dead';
  const gap = 1000 / (fast ? fpsCap : st === 'over' ? 20 : 30);
  if (now < nextDue - 2) return;
  nextDue = now - nextDue > gap ? now + gap : nextDue + gap;
  const raw = last ? (now - last) / 1000 : 0.016; last = now;
  perf(raw);
  if (pausable() && safe(UI.isBlocking)) setPause(true);
  // at 30 fps (or a slow frame) run sub-steps of ≤ 1/60 s, so fast meteors can't skip past the ship
  const step = clamp(raw, 0, 1 / 15) * debug.timeScale, n = step > 1 / 45 ? Math.min(4, Math.ceil(step * 60 - 0.1)) : 1;
  try { for (let i = 0; i < n; i++) update(step / n); } catch (e) { errOnce('update', e); }
  // G8: while paused the frozen scene is drawn once (and again after a resize), then the GPU rests
  if (st !== 'pause' || !pauseDrawn) { try { render(); } catch (e) { errOnce('render', e); } pauseDrawn = st === 'pause'; }
  hudNow();
  music();
}

// ---------------------------------------------------------------------------------------------
// UI hooks
const hooks = {
  onLaunch(jid, li) { unlockAudio(); tryFullscreen(); start(jid, li); },
  onDuel(rid) { unlockAudio(); tryFullscreen(); return startDuel(rid, true); },
  onDuels() { goMenu(); safe(UI.openSheet, 'duels'); },
  onPause() { setPause(true); },
  onResume() { setPause(false); },
  onQuit() { goMenu(); },
  // G1: restart the run in flight (pause card) or the one just finished (results card)
  onRetry() {
    const r = run ? (run.mode === 'duel' ? { mode: 'duel', rid: run.rid } : { jid: run.jid, li: run.li }) : lastRun;
    if (!r) return goMenu();
    if (r.mode === 'duel') { if (!startDuel(r.rid)) goMenu(); }
    else if (!start(r.jid, r.li)) goMenu();
  },
  onNext() {
    const r = lastRun;
    if (!r || r.mode === 'duel') return goMenu();
    let n = null;
    if (lastWin) {
      const J = M.JOURNEYS[journeyIndex(r.jid)];
      if (J && r.li + 1 < J.legs.length && safe(M.canPlay, r.jid, r.li + 1) !== false) n = { jid: r.jid, li: r.li + 1 };
    }
    if (!n) n = safe(M.nextPlayable) || null;
    if (n && lastWin && n.jid === r.jid && n.li === r.li) n = null; // U1: never "Next" into the leg just played
    if (n && start(n.jid, n.li)) return;
    goMenu();
  },
  onSuper() { doSuper(); },
  onMute() { unlockAudio(); setMuted(!muted); safe(M.setSetting, 'muted', muted); return muted; },
  isMuted() { return muted; },
  onFps() { fpsCap = fpsCap === 30 ? 60 : 30; safe(M.setSetting, 'fps', fpsCap); nextDue = 0; fAcc = 0; fN = 0; slowWins = 0; return fpsCap; },
  getFps() { return fpsCap; },
  onChar() { girl(); refreshMenuO(); },
  sfx(name) { if (name === 'tick') sfxT('coin', 0.04, 1.3, 0.5); else if (name === 'chime') sfx.pickup(); else if (SND[name]) play(name); },
};

// ---------------------------------------------------------------------------------------------
// Boot: loader → fonts → art → sounds → menu
async function boot() {
  try { const s = safe(M.settings) || {}; muted = !!s.muted; } catch (e) {}
  girl();
  safe(applyI18n);
  resize();
  safe(A.setArtQuality, qLevel);
  let ldMsg = '';
  const ld = (f, key) => { if (key) ldMsg = tt(key, ldMsg); safe(UI.loader, f, ldMsg); };
  ld(0.04, 'ld_fonts');
  try { await Promise.race([Promise.all(['500', '700', '800'].map(w => document.fonts.load(w + ' 20px "Baloo Bhaijaan 2"', 'عبود Abood'))), sleep(3000)]); } catch (e) {}
  ld(0.15, 'ld_art');
  try { await A.initArt({ onProgress: f => ld(0.15 + clamp(+f || 0, 0, 1) * 0.6) }); } catch (e) { console.error('initArt', e); }
  ld(0.76, 'ld_sound');
  try { await initAudio(f => ld(0.76 + f * 0.18)); } catch (e) { console.error('audio', e); }
  setMuted(muted);
  try { UI.initUI(hooks); } catch (e) { console.error('initUI', e); }
  ld(0.96, 'ld_cache');
  await sleep(120);
  ld(1, 'ld_ready');
  await sleep(220);
  safe(UI.hideLoader);
  booted = true;
  goMenu(); t = 0; menuOT = -1;
  if (!running) { running = true; requestAnimationFrame(loop); }
}

// Test / tooling hook
window.__game = {
  state: () => st,
  start: (j, l) => start(j, l),
  duel: (rid) => startDuel(rid),   // rival id, or 1..10 for the ladder position
  debug: Object.assign(debug, {
    skip() { if (st === 'play' && run && run.mode !== 'duel') { run.elapsed = run.L.dur; run.ending = true; beginArrive(); return true; } return false; },
    win() {
      if (!run || run.ended || !ship || !ship.alive) return false; // M1: never settle a dead ship as a win
      if (run.mode === 'duel') return this.winDuel(true);
      endRun(true); return true;
    },
    // win a duel: through the "fixed" cinematic, or at once with winDuel(true)
    winDuel(now = false) {
      if (!run || run.mode !== 'duel' || run.ended || !rv || !ship.alive) return false;
      if (now) { if (run.ds !== 'fixed') { run.fightTime = run.fightT; rv.hp = 0; } endRun(true); return true; }
      if (run.ds === 'intro') { run.ds = 'fight'; startPhase(); }
      if (run.ds !== 'fixed') { run.ds = 'fight'; rv.invT = 0; rv.sh = null; rv.ph = (rv.R.phases || [1]).length - 1; damageRival(rv.hp + 1, 'debug'); }
      return true;
    },
    rivalHp(f) { if (!rv || run.ds !== 'fight') return false; rv.invT = 0; const keep = rv.sh; rv.sh = null; damageRival(Math.max(0, rv.hp - clamp(f, 0, 1) * rv.max), 'debug'); if (!rv.sh) rv.sh = keep; return rv.hp; },
    rival() {
      return rv ? { id: rv.id, ds: run.ds, dsT: run.dsT, hp: rv.hp, max: rv.max, ph: rv.ph, x: rv.x, y: rv.y, shield: rv.sh && { up: rv.sh.up, hp: rv.sh.hp, max: rv.sh.max }, stunT: rv.stunT,
        plates: rv.plates && rv.plates.filter(p => p.alive).length, ram: rv.ram && rv.ram.ph, enraged: run.enraged, fightT: run.fightT, eshots: eshots.length, emobs: emobs.length,
        elasers: elasers.length, objs: objs.length, pulse: rv.pulseT > 0, blink: !!rv.blink, move: rv.move && rv.move.mode, fixedEye: rv.fixedEye, drops: rv.drops } : null;
    },
    die() { if (st === 'play' && ship && ship.alive) { ship.hp = 0; die(); return true; } return false; },
    fillSuper() { superF = 1; checkSuperFull(); },
    super: () => { superF = 1; checkSuperFull(); return doSuper(); },
    spawn(kind = 'rockM', y) { if (!run) return null; return spawnKind(kind, y); },
    meteor(y) { if (run && st === 'play' && run.mode !== 'duel') spawnMeteor(y); },
    hurt(n = 1) { if (ship) return hurtShip(n); },
    pickup(kind = 'coin', pull = false) { if (!run) return; const p = addPick(kind, ship.x + 120, ship.y, 1); if (p && pull) p.pulled = true; },
    setY(y) { if (ship) { ship.ty = ship.y = clamp(y, Y_MIN, Y_MAX); } },
    info() {
      return run ? { st, mode: run.mode, elapsed: run.elapsed, dur: run.L.dur, objs: objs.length, meteors: meteors.length, bolts: bolts.length, picks: picks.length, parts: parts.length,
        hp: ship.hp, maxHp: ship.maxHp, shield: ship.shieldUp, extraShield: ship.extraShield, superF, beamT, score: run.score, kills: run.kills, coins: run.coins, hits: run.hits,
        dodged: run.meteors, supers: run.supers, mult, y: ship.y, qLevel, W, H, botY: bot.y, botSay: bot.sayT > 0 ? bot.say : '', fps: fpsCap,
        comboMax: run.comboMax, beamMax: run.beamMax, crystals: run.crystals, chain: run.chain, botKills: run.botKills, pickups: run.pickups, boost: run.boost,
        fx: S.fx, costume: S.costume, char: S.char, ds: run.ds, rid: run.rid } : { st, qLevel, W, H, fps: fpsCap };
    },
    stats: () => S, report: () => run && report(),
    sounds: () => Object.keys(SND), audio: () => actx && actx.state,
    run: () => run, ship: () => ship, quality: (q) => { if (q != null) { qLevel = clamp(q, 0, 3); resize(); safe(A.setArtQuality, qLevel); } return qLevel; },
  }),
};
window.__aboodMoon = Object.assign(window.__aboodMoon || {}, { state: () => st, start: (j, l) => start(j, l), duel: (rid) => startDuel(rid) });

boot();
