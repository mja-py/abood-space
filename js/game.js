// Abood to the Moon · عبود إلى القمر — engine: boot, loop, gameplay, duels, particles, audio, input.
// Drawing lives in art.js, DOM in ui.js, data/save in meta.js, text in i18n.js (see docs/SPEC.md and DESIGN-v2 §8.4).
import * as M from './meta.js?v=__BUILD__';
import { T, TL, nf, lang, setLang, applyI18n } from './i18n.js?v=__BUILD__';
import * as I18N from './i18n.js?v=__BUILD__';
import * as A from './art.js?v=__BUILD__';
import * as UI from './ui.js?v=__BUILD__';
import * as PZ from './pieces.js?v=__BUILD__';

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
const H = 400, SHIP_X = 110, Y_MIN = 40, Y_MAX = 370;
// v3.2: one play-field shape on every screen (the phone's, about 2.15:1). Taller screens (iPad, square, 16:9) get bands
// above and below, wider ones bands at the sides, so dodging room and crossing times are the same everywhere.
const WORLD_W = 860, WORLD_MAX = 900;
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
// a hidden tab gets no animation frames, so boot never waits on one for more than 60 ms
const nextFrame = () => new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
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
let W = WORLD_W, scale = 1, offY = 0, offX = 0, RES = 1, FX = 1, MAXP = 300;
let pauseDrawn = false; // paused: one frame is drawn on entry, then the canvas is left alone (G8)

function resize() {
  const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, d = Math.min(devicePixelRatio || 1, QDPR[qLevel]);
  if (!w || !h) return;
  const cw = Math.round(w * d), ch = Math.round(h * d);
  if (cv.width !== cw) cv.width = cw;
  if (cv.height !== ch) cv.height = ch;
  scale = h / H; W = w / scale; offY = 0; offX = 0;
  if (W < WORLD_W) { scale = w / WORLD_W; W = WORLD_W; offY = (h / scale - H) / 2; }          // taller: fit width, bands top and bottom
  else if (W > WORLD_MAX) { W = WORLD_MAX; offX = (w / scale - WORLD_MAX) / 2; }            // wider: fit height, bands at the sides
  document.documentElement.style.setProperty('--band-y', Math.max(0, offY * scale).toFixed(1) + 'px');
  document.documentElement.style.setProperty('--band-x', Math.max(0, offX * scale).toFixed(1) + 'px');
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
const retries = {};      // v3 hidden assist: deaths per leg key this session (2+ → slower, +1 hull, a shield)

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
const keys = { up: false, down: false, left: false, right: false };
let dragId = null, dragY = 0, dragX = 0;
function logicalY(e) { const r = cv.getBoundingClientRect(); return (e.clientY - r.top) / scale - offY; }
function logicalX(e) { const r = cv.getBoundingClientRect(); return (e.clientX - r.left) / scale - offX; }
// v3.1 free movement: the ship flies anywhere in the left 40% of the screen
const X_MIN = 70, xMax = () => Math.max(SHIP_X + 60, W * 0.4);
const isUI = e => e.target && e.target.closest && e.target.closest('button, a, input, select, .panel, .sheet, [role="dialog"]');

cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', e => {
  unlockAudio();
  if (isUI(e) || st !== 'play') return;
  dragId = e.pointerId; dragY = logicalY(e); dragX = logicalX(e);
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId || st !== 'play' || !ship) return;
  const y = logicalY(e), dy = (y - dragY) * 1.3; dragY = y;
  const x = logicalX(e), dx = (x - dragX) * 1.3; dragX = x;
  ship.ty = clamp(ship.ty + dy, Y_MIN, Y_MAX);
  ship.tx = clamp((ship.tx || ship.x) + dx, X_MIN, xMax());
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
  else if (c === 'ArrowLeft' || c === 'KeyA') { keys.left = true; if (st === 'play') e.preventDefault(); }
  else if (c === 'ArrowRight' || c === 'KeyD') { keys.right = true; if (st === 'play') e.preventDefault(); }
  else if (c === 'Space' || c === 'KeyX') { if (st === 'play') { e.preventDefault(); if (!e.repeat) doSuper(); } }
  else if (c === 'KeyP' || c === 'Escape') { if (pausable()) setPause(true); else if (st === 'pause') setPause(false); }
});
addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW') keys.up = false;
  else if (c === 'ArrowDown' || c === 'KeyS') keys.down = false;
  else if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false;
  else if (c === 'ArrowRight' || c === 'KeyD') keys.right = false;
});
addEventListener('blur', () => { keys.up = keys.down = keys.left = keys.right = false; dragId = null; });

// ---------------------------------------------------------------------------------------------
// Run setup: stats, costume, boosters
const SIZES = { S: { r: 12, hp: 1, pts: 10, sg: 0.03 }, M: { r: 22, hp: 3, pts: 25, sg: 0.045 }, L: { r: 36, hp: 7, pts: 50, sg: 0.07 } };
const JUNK = {
  panel: { r: 22, hp: 2, pts: 30, sg: 0.05 },
  tank: { r: 16, hp: 2, pts: 30, sg: 0.05 },
  drone: { r: 17, hp: 3, pts: 30, sg: 0.055 },
  dish: { r: 20, hp: 3, pts: 30, sg: 0.055 },
};
const MIX_KEYS = ['rockS', 'rockM', 'rockL', 'ice', 'crystal', 'panel', 'tank', 'drone', 'dish', 'turret'];
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
    // v3: the scripted timeline (DESIGN-v3), the boss inside a leg, assist and medal counters
    plan: null, beats: [], bi: 0, windows: [], pend: [], fseq: 0, fillerMul: 1, mixNow: null, meteorNow: null, pairNow: null, meteorsOff: 0,
    boss: null, frozen: false, ds: null, R: null, rid: null, rescued: 0, rescueTotal: 0, bumps: 0, deaths: 0, bossFixed: [], bossTime: 0,
    AS: {}, hard: false, easy: false, extraHull: 0, startShield: false, held: null, grazes: 0,
  }, o);
}
const shieldCd = () => (S && S.shieldCd > 0) ? S.shieldCd : (run && run.AS && run.AS.regenShield > 0) ? run.AS.regenShield : 0;
function resetWorld() {
  objs.length = meteors.length = bolts.length = picks.length = parts.length = texts.length = lasers.length = 0;
  eshots.length = emobs.length = elasers.length = 0;
  zones.length = sweeps.length = rings.length = wings.length = 0;
  rv = null;
  if (run) { run.held = null; run.flare = null; }
}

// shared by legs and duels: stats, boosters (DESIGN §6, §8.4), ship, Nabeeh, clocks
function beginRun() {
  girl();
  S = readStats();
  GUNS = gunPoints(); BLV = safe(M.level, 'blaster') || 0;
  const B = Object.assign({ shield: false, super: false, hull: false, coins: false }, safe(M.launchBoosters) || {});
  run.boost = B;
  if (B.hull) S.maxHp += 1;
  if (run.extraHull > 0) S.maxHp += run.extraHull;   // v3 hidden assist after repeated deaths
  safe(M.startRun);
  ship = { x: SHIP_X, tx: SHIP_X, px: SHIP_X, vxp: 0, y: 210, ty: 210, py: 210, vy: 0, tilt: 0, hp: S.maxHp, maxHp: S.maxHp, inv: 0, alive: true,
    shieldUp: shieldCd() > 0 || !!run.startShield, shieldT: 0, extraShield: B.shield ? 1 : 0, fireT: 0.3, rapidT: 0, sc: 1, vx: 0, thrust: 0.6 };
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
  const L0 = J.legs[li];
  resetWorld();
  // v3: the leg plan (timeline, assist profile, boss) from meta.js; the leg's tuning row is scaled by it
  const hard = !!safe(M.hardOn, jid);
  // v3.1: the first flight of a leg is the hand-shaped one; replays draw a seed so waves and set pieces change
  const replay = (safe(M.legsDone, jid) | 0) > li, seed = replay ? Math.floor(Math.random() * 1e9) : null;
  const plan = safe(M.legPlan, jid, li, hard, seed) || null;
  const AS = (plan && plan.assist) || {};
  const rk = jid + ':' + li, easy = (retries[rk] || 0) >= 2;   // hidden assist: slower, +1 hull and a shield after two deaths
  const sp = (plan ? plan.speedScale : 1) * (easy ? 0.85 : 1);
  const mods = (plan && plan.mods) || [], ion = mods.includes('ion');
  const L = Object.assign({}, L0, { dur: plan ? plan.dur : L0.dur, speed: L0.speed * sp * (ion ? 1.15 : 1), mv: (L0.mv > 0 ? L0.mv : 950) * sp, star: plan ? plan.star : L0.star });
  run = newRun({ mode: 'leg', jid, ji, li, J, L, last: li === J.legs.length - 1, spawnT: 1.6, nextMeteor: L.firstMeteor != null ? L.firstMeteor : 20,
    plan, beats: plan ? plan.beats.slice() : [], AS, hard, easy, extraHull: easy ? 1 : 0, startShield: easy, rescueTotal: plan ? plan.rescueTotal : 0,
    mods, magDir: Math.random() < 0.5 ? -1 : 1, magT: 0, wind: 0, windT: 0, dirP: 1, dirK: 1, dirT: 0, intensity: 0 });
  beginRun();
  // leg fields (DESIGN §4.3) and costume perks (§5)
  run.mix = Object.assign({}, L.mix || {});
  if (run.mix.crystal) run.mix.crystal *= S.crystalWeight || 1;
  run.hpMul = plan ? plan.hpMul : L.hp > 0 ? L.hp : 1;
  run.coinMul = L.coin > 0 ? L.coin : 1;
  run.pickMul = L.pick > 0 ? L.pick : 1;
  run.mv = L.mv;
  run.warn = (L.warn || 1.1) + (S.warnPlus || 0) + (S.bot.warnPlus || 0) + (plan ? plan.warnPlus : 0);
  safe(UI.hideMenus); safe(UI.showPause, false); safe(UI.showHud, true, jid, li);
  if (hard) safe(UI.note, tt('f_hard'));
  if (mods.length) later(1.8, () => { safe(UI.banner, tt('mod_title', 'Space weather'), mods.map(m => tt('mod_' + m, m)).join(' · '), 3400); sfx.warn(); });
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
// v3.1 reach band: every centre the hull can line up with (the ship reaches Y_MIN..Y_MAX); spawns stay inside it
function freeY(r) {
  let best = rnd(Y_MIN + 4, Y_MAX - 4), bestD = -1;
  for (let i = 0; i < 5; i++) {
    const y = rnd(Y_MIN + 4, Y_MAX - 4); let d = 1e9;
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
  else if (k === 'turret') o = makeTurret();
  else if (k === 'grabber') o = makeGrabber();
  else return null;
  o.x = W + o.r + 12; o.y = y != null ? y : freeY(o.r); o.by = o.y;
  objs.push(o); return o;
}
function spawner(dt) {
  if (debug.noSpawn) return;
  const L = run.L, prog = run.elapsed / L.dur, fm = run.fillerMul == null ? 1 : run.fillerMul;
  run.spawnT -= dt;
  if (run.spawnT > 0 || fm <= 0) return;
  const rate = Math.max(0.2, (L.spawn || 1) * (0.8 + 0.4 * prog) * (run.mercyT > 0 ? 0.7 : 1) * fm * directorK());
  run.spawnT = (1 / rate) * rnd(0.6, 1.4);
  if (objs.length < 60) spawnKind(weighted(run.mixNow || run.mix || L.mix || {}));
}
function meteorSpawner() {
  const L = run.L, gap = run.meteorNow || L.meteor, pair = run.pairNow != null ? run.pairNow : L.pair;
  if (debug.noSpawn || !gap || !(gap[1] > 0)) return;
  if (run.meteorsOff > 0) { run.nextMeteor = Math.max(run.nextMeteor, run.elapsed + 2); return; }
  if (run.elapsed < run.nextMeteor) return;
  if (run.elapsed + run.warn > L.dur - 1.2) { run.nextMeteor = 1e9; return; }
  spawnMeteor();
  // pair: a second meteor warns at the same moment in another lane at least 90 away
  if (pair > 0 && Math.random() < pair) {
    const y0 = meteors[meteors.length - 1].y;
    for (let i = 0; i < 12; i++) { const y = rnd(Y_MIN + 6, Y_MAX - 6); if (Math.abs(y - y0) >= 90) { spawnMeteor(y, true); break; } }
  }
  run.nextMeteor = run.elapsed + rnd(gap[0], gap[1]);
}

// ---------------------------------------------------------------------------------------------
// v3 timeline: beats fire at their time, windows undo themselves, pending spawns are spread over a few seconds
function later(d, fn) { run.pend.push({ d, fn, done: false }); }
function win(dur, undo) { run.windows.push({ left: Math.max(0.05, dur || 0), undo, done: false }); }
function runBeats(dt) {
  if (!run.beats || !run.beats.length) return;
  const T = run.elapsed;
  while (run.bi < run.beats.length && run.beats[run.bi].t <= T) { const b = run.beats[run.bi++]; try { beat(b); } catch (e) { errOnce('beat:' + b.kind, e); } }
  for (const w of run.windows) { w.left -= dt; if (w.left <= 0) { w.done = true; if (w.undo) w.undo(); } }
  compact(run.windows, w => !w.done);
  for (const s of run.pend) { s.d -= dt; if (s.d <= 0) { s.done = true; s.fn(); } }
  compact(run.pend, s => !s.done);
  if (run.meteorsOff > 0 && run.meteorsOff < 1e8) run.meteorsOff -= dt;
}
const laneY = (i, n) => Y_MIN + 10 + ((i % n) + 0.5) * (Y_MAX - Y_MIN - 20) / n;
function beat(b) {
  switch (b.kind) {
    case 'filler': { const seq = ++run.fseq; run.fillerMul = b.rate; run.mixNow = b.mix || null; win(b.dur, () => { if (run.fseq === seq) { run.fillerMul = 1; run.mixNow = null; } }); break; }
    case 'meteorsOff': if (run.meteorsOff < 1e8) run.meteorsOff = Math.max(run.meteorsOff, b.dur || 0); break;
    case 'meteors': run.meteorNow = b.gap; run.pairNow = b.pair || 0; run.nextMeteor = Math.min(run.nextMeteor, run.elapsed + rnd(2, 5)); win(b.dur, () => { run.meteorNow = null; run.pairNow = null; }); break;
    case 'shower': { const n = b.n | 0, over = b.over || 4, lanes = b.lanes | 0, k = b.kind2 || 'rockS';
      for (let i = 0; i < n; i++) later(i * over / Math.max(1, n), () => spawnKind(k, lanes > 0 ? laneY(i, lanes) : null)); break; }
    case 'relief': { let k = b.pick || 'cell';
      if (k === 'weapon') k = 'w_' + pick(WEAPONS);
      if (k === 'repair' && ship.hp >= ship.maxHp) k = ship.shieldUp || shieldCd() <= 0 ? (superF < 0.6 ? 'cell' : 'coins') : 'shield';
      const n = k === 'coins' ? (b.n > 1 ? b.n : 8) : (b.n | 0) || 1;
      for (let i = 0; i < n; i++) later(i * 0.25, () => { const p = addPick(k === 'coins' ? 'coin' : k, W + 20, clamp(ship.y + rnd(-60, 60), Y_MIN, Y_MAX), 1); if (p) { p.vx = -run.L.speed * 0.8; p.vy = 0; p.life = 20; } });
      break; }
    case 'say': say(b.key, true); break;
    case 'warn': bossWarn(b.boss); break;
    case 'boss': startBoss(b); break;
    case 'wave': case 'event': case 'pods': setPiece(b); break;
    default: errOnce('beat?' + b.kind, new Error('unknown beat ' + b.kind));
  }
}
// ---------------------------------------------------------------------------------------------
// v3 set pieces: waves (wall, squad, turrets, tether), events (scrapRain, cascade, flare, corridor, grabber), rescue pods.
// Everything is an ordinary object in `objs` (bolts, the beam, Nabeeh and the hull all work on it); the ones that move
// on their own carry o.move(o, dt), the ones with their own look carry o.draw(c, o). o.ghost = bolts and the beam pass
// through; o.harmless = never hurts the hull (its own collision, if any, lives in o.move).
const PIECE = { turret: { r: 22, hp: 5, pts: 60, sg: 0.06 }, grabber: { r: 20, hp: 16, pts: 80, sg: 0.06 } };
function makeTurret() {
  const z = PIECE.turret, L = run.L;
  return { type: 'junk', kind: 'turret', size: 'M', x: 0, y: 0, by: 0, r: z.r, hp: z.hp * (run.hpMul || 1), pts: z.pts, sg: z.sg,
    vx: -L.speed * 0.5, vy: 0, rot: 0, vr: 0, seed: Math.floor(Math.random() * 9999), flash: 0, dead: false, killT: 0, ph: 0, wob: 0,
    aim: Math.PI, tell: 0, fireT: rnd(1.6, 2.6), draw: (c, o) => PZ.drawTurret(c, o, t), move: turretMove };
}
function turretMove(o, dt) {
  o.x += o.vx * dt; o.y += Math.sin(t * 0.7 + o.seed) * 6 * dt;
  if (!ship.alive || st !== 'play' || o.x > W - 20 || o.x < ship.x + 50) { o.tell = 0; return; }
  o.aim = Math.atan2(ship.y - o.y, ship.x - o.x);
  o.fireT -= dt; const every = run.AS && run.AS.bossAtk > 1 ? 2.6 * run.AS.bossAtk : 2.6;
  o.tell = clamp(1 - o.fireT / 0.8, 0, 1);
  if (o.fireT <= 0) { o.fireT = every; shot('pellet', o.x + Math.cos(o.aim) * 22, o.y + Math.sin(o.aim) * 22, o.aim, 170); const s = eshots[eshots.length - 1]; if (s) s.src = 'turret'; sfx.eshot(); }
}
function makeGrabber() {
  const z = PIECE.grabber;
  const o = { type: 'junk', kind: 'grabber', size: 'M', x: 0, y: 0, by: 0, r: z.r, hp: z.hp * (run.hpMul || 1), pts: z.pts, sg: z.sg,
    vx: -120, vy: 0, rot: 0, vr: 0, seed: Math.floor(Math.random() * 9999), flash: 0, dead: false, killT: 0, ph: 0, wob: 0,
    holding: false, free: true, draw: (c, o) => PZ.drawGrabber(c, o, t), move: grabberMove };
  return o;
}
function grabberMove(o, dt) {
  if (!o.holding) {
    const tx = bot.x + 26, ty = bot.y, dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy) || 1, v = 300;
    o.x += dx / d * v * dt; o.y += dy / d * v * dt;
    if (o.x > W + 40 && d > 60) o.x = W + 40;
    if (d < 24 && !run.held && st === 'play') { o.holding = true; run.held = o; sfx.plate(); say('bot_grabbed', true); say2('f_grabbed', bot.x, bot.y - 30, '#ffb3b3'); mood('alert', 3); }
  } else {
    // it hauls Nabeeh up and away to the right, in front of the guns: fly up and shoot it before it leaves
    o.x += 62 * dt; o.y += (Y_MIN + 14 - o.y) * Math.min(1, dt * 0.9);
    if (o.x > W + 40) freeBot(o);
  }
}
function freeBot(o) {
  if (run.held !== o) return;
  run.held = null; o.holding = false;
  if (!o.dead) return;
  sparks(bot.x, bot.y, 12, '#9ff0ff', 160); ring(bot.x, bot.y, 36, '#9ff0ff', 0.35);
  say('bot_freed', true); say2('f_freed', bot.x, bot.y - 30, '#9ff0ff'); mood('happy', 2);
}
// a squad drone: flies in along a sine, then dives at where the ship was, then leaves
// keeps a moving object inside the reach band: drift and splits bounce off its edges, things that fly in from outside
// (cascades) are free until they are in, and anything stuck outside fades out harmlessly
const BAND_OUT = 14;
function bandFix(o, dt) {
  if (o.ghost || o.free) return;
  if (o.entering) { if (o.y >= Y_MIN && o.y <= Y_MAX) o.entering = false; else return; }
  const lo = o.kind === 'drone' && !o.move ? Y_MIN + o.wob : Y_MIN, hi = o.kind === 'drone' && !o.move ? Y_MAX - o.wob : Y_MAX;
  if (o.kind === 'drone' && !o.move) {   // the wobble swings round o.by: keep the centre line in band
    if (o.by < lo) { o.by = lo; if (o.vy < 0) o.vy = -o.vy; } else if (o.by > hi) { o.by = hi; if (o.vy > 0) o.vy = -o.vy; }
    o.y = o.by + Math.sin(o.ph) * o.wob;
  } else if (o.move) {
    if (o.y < Y_MIN) o.y = Y_MIN; else if (o.y > Y_MAX) o.y = Y_MAX;
  } else {
    if (o.y < lo) { o.y = lo; if (o.vy < 0) o.vy = -o.vy * 0.8; } else if (o.y > hi) { o.y = hi; if (o.vy > 0) o.vy = -o.vy * 0.8; }
  }
  if (o.y < Y_MIN - BAND_OUT || o.y > Y_MAX + BAND_OUT) { o.outT = (o.outT || 0) + dt; if (o.outT > 1.2) { o.dead = true; smoke(o.x, o.y, 1, '#6d6a80'); } }
  else o.outT = 0;
}
function squadMove(o, dt) {
  if (o.st === 'in') { o.x += o.vx * dt; o.ph += dt * 2.5; o.y = o.by + Math.sin(o.ph) * 26; if (o.x < W * 0.6) { o.st = 'dive'; const dx = ship.x - o.x, dy = ship.y - o.y, d = Math.hypot(dx, dy) || 1, v = run.L.speed * 2.4; o.dvx = dx / d * v; o.dvy = dy / d * v; } }
  else { o.x += o.dvx * dt; o.y += o.dvy * dt; o.dvy *= Math.exp(-0.5 * dt); }
}
// a tethered junk piece swings on a cable under its anchor; cut the anchor and it floats off
function tetherMove(o, dt) {
  const a = o.anchor; if (!a || a.dead) { o.move = null; o.anchor = null; o.vx = -run.L.speed * 0.9; o.vy = rnd(-30, 30); return; }
  o.ang += o.angV * dt; o.angV -= Math.cos(o.ang) * 2.2 * dt;
  o.x = a.x + Math.cos(o.ang) * o.len; o.y = a.y + Math.sin(o.ang) * o.len;
}
// a station wall segment: a rectangle the hull cannot cross (o.y0..o.y1, o.x..o.x+o.w)
function wallMove(o, dt) {
  o.x += o.vx * dt;
  if (o.x + o.w < -20) { o.dead = true; return; }
  if (!ship.alive || st !== 'play') return;
  const r = shipR() * 0.8 * hurtK(), cx = clamp(ship.x, o.x, o.x + o.w), cy = clamp(ship.y, o.y0, o.y1), dx = ship.x - cx, dy = ship.y - cy;
  if (dx * dx + dy * dy < r * r) {
    if (ship.inv <= 0 && !debug.invincible) hurtShip(1, 'wall');
    const push = o.top ? o.y1 + r + 4 : o.y0 - r - 4; ship.y = ship.ty = clamp(push, Y_MIN, Y_MAX); ship.vy = 0;
  }
}
function spawnWall(gap, k) {
  const gc = clamp((k ? rnd(Y_MIN + 50, Y_MAX - 50) : ship.y) + rnd(-40, 40), Y_MIN + 60, Y_MAX - 60), x0 = W + 30 + k * 150;
  for (let y = Y_MIN - 6; y <= Y_MAX + 6; y += 44) {
    if (Math.abs(y - gc) < gap / 2) continue;
    const o = makeJunk('panel', x0, y); o.vx = -run.L.speed * 1.05; o.vy = 0; o.vr = 0.3; o.wallSeg = true; objs.push(o);
  }
}
function setPiece(b) {
  const L = run.L, j = run.ji || 0;
  if (b.kind === 'pods') {
    for (let i = 0; i < (b.n | 0 || 1); i++) later(i * (b.over || 1), () => { const p = addPick('pod', W + 24, rnd(Y_MIN + 30, Y_MAX - 30), 1); if (p) { p.vx = -L.speed * 0.55; p.vy = 0; p.life = 26; } });
    return;
  }
  if (b.kind === 'wave') {
    switch (b.form) {
      case 'robots': { const n = b.n | 0 || 1;
        if (b.teach) { const o = makeRobot({ teach: b.teach, y: 200, sx: W * 0.72 }); if (o) { o.life = 16; say2('rb_' + b.teach, W * 0.55, 90, '#ffb3b3'); } break; }
        for (let i = 0; i < n; i++) later(i * 0.7, () => makeRobot({}));
        if (!run.robotSaid) { run.robotSaid = true; say('bot_robots', true); }
        break; }
      case 'wall': for (let k = 0; k < (b.n | 0 || 1); k++) spawnWall(b.gap || 150, k); break;
      case 'squad': { const n = b.n | 0 || 4, top = Math.random() < 0.5, by = top ? rnd(Y_MIN + 30, 150) : rnd(250, Y_MAX - 30);
        for (let i = 0; i < n; i++) later(i * 0.32, () => { const o = makeJunk('drone', W + 30, by); o.hp = 2 * (run.hpMul || 1); o.vx = -L.speed * 1.5; o.st = 'in'; o.by = by; o.ph = i * 0.9; o.move = squadMove; o.squad = true; objs.push(o); }); break; }
      case 'turrets': { const n = b.n | 0 || 1; for (let i = 0; i < n; i++) later(i * 1.5, () => spawnKind('turret', laneY(i * 2 + 1, 4))); say2('f_turret', ship.x + 40, ship.y - 40, '#ffb3b3'); break; }
      case 'tether': { const n = b.n | 0 || 1;
        for (let i = 0; i < n; i++) later(i * 2.5, () => {
          const a = spawnKind('dish', laneY(i, 2) - 40); if (!a) return; a.vx = -L.speed * 0.85; a.vy = 0;
          const ch = makeJunk('tank', a.x, a.y + 80); ch.vx = a.vx; ch.anchor = a; ch.len = 85; ch.ang = Math.PI / 2 + rnd(-0.8, 0.8); ch.angV = rnd(-1, 1); ch.move = tetherMove; ch.tether = true; objs.push(ch);
        }); break; }
      default: { const n = (b.n | 0) * 3 || 6; for (let i = 0; i < n; i++) later(i * 0.5, () => spawnKind(i % 3 ? 'rockS' : 'rockM', laneY(i, 5))); }
    }
    return;
  }
  if (b.kind !== 'event') return;
  const dur = b.dur || 6;
  switch (b.ev) {
    case 'scrapRain': { say2('f_scrapRain', ship.x + 40, ship.y - 44, '#ffe066'); safe(UI.note, tt('f_scrapRain'));
      const n = Math.floor(dur / 0.3); for (let i = 0; i < n; i++) later(i * 0.3, () => { const o = spawnKind('rockS'); if (o) { o.harmless = true; o.coinSure = true; o.pts = 5; o.vx *= 1.25; o.flash = 0.3; } }); break; }
    case 'cascade': { say2('f_cascade', ship.x + 40, ship.y - 44, '#ffd9a0'); const n = 10 + j * 2;
      for (let i = 0; i < n; i++) later(i * (4 / n), () => { const up = i % 2 === 0, o = spawnKind(i % 4 === 0 ? 'rockM' : 'rockS', up ? Y_MAX + 20 : Y_MIN - 20); if (o) { o.vy = (up ? -1 : 1) * rnd(60, 130); o.vx *= 1.1; o.entering = true; } }); break; }
    case 'flare': { say2('f_flare', ship.x + 40, ship.y - 44, '#ffb347'); say('bot_flare', true); safe(UI.note, tt('f_flare'));
      for (let i = 0; i < 3; i++) later(i * 0.4, () => { const o = spawnKind('rockL', laneY(i, 3)); if (o) { o.vx = -L.speed * 0.55; o.vy = 0; o.hp *= 2; o.shelter = true; } });
      const warn = Math.max(3, dur * 0.6); run.flare = { t: 0, warn, flash: 0, hit: false, dur: 1.4 }; sfx.warn(); mood('alert', warn); break; }
    case 'corridor': { say2('f_corridor', ship.x + 40, ship.y - 44, '#ffd9a0'); say('bot_corridor', true); safe(UI.note, tt('f_corridor'));
      const gh = Math.max(120, 190 - j * 9), w = 250, step = w / (L.speed * 1.0), n = Math.max(3, Math.round(dur / step)), ph = rnd(0, TAU);
      for (let i = 0; i < n; i++) later(i * step, () => {
        const gc = 200 + 85 * Math.sin(ph + i * 0.75), x = W + 20;
        for (const top of [true, false]) {
          const y0 = top ? -10 : gc + gh / 2, y1 = top ? gc - gh / 2 : H + 10;
          objs.push({ type: 'wall', kind: 'wall', size: 'L', x, y: (y0 + y1) / 2, y0, y1, w, top, r: 0, hp: Infinity, pts: 0, sg: 0, vx: -L.speed * 1.0, vy: 0, rot: 0, vr: 0, seed: i, flash: 0, dead: false, killT: 0,
            ghost: true, harmless: true, move: wallMove, draw: (c, o) => PZ.drawWall(c, o, t) });
        }
      }); break; }
    case 'grabber': { later(0.5, () => { const o = spawnKind('grabber', Y_MIN - 10); if (o) { o.x = W * 0.75; o.y = -30; say2('f_grabbed', ship.x + 40, ship.y - 44, '#ffb3b3'); } }); break; }
  }
}
// the solar flare timer: a warning glow from the right, then a flash that hurts a hull with no big rock in front of it
function updateFlare(dt) {
  const F = run.flare; if (!F) return;
  F.t += dt;
  if (F.t >= F.warn) {
    const k = F.t - F.warn; F.flash = k < 0.3 ? k / 0.3 : clamp(1 - (k - 0.3) / (F.dur - 0.3), 0, 1);
    if (!F.hit && k > 0.1 && ship.alive && st === 'play') {
      F.hit = true;
      let safe_ = false;
      for (const o of objs) if (!o.dead && o.shelter && o.x > ship.x && o.x - ship.x < 230 && Math.abs(o.y - ship.y) < o.r + 6) { safe_ = true; break; }
      if (safe_) { floatText(tt('f_shield'), ship.x + 30, ship.y - 40, '#9ff0ff', 16); mood('happy', 1.5); }
      else if (ship.inv <= 0 && !debug.invincible) hurtShip(1, 'flare');
      for (const o of objs) if (!o.dead && !o.ghost && o.type === 'rock' && o.size === 'S') kill(o, 'meteor');
      shake(6); sfxT('boomL', 0.6, 0.8, 0.5);
    }
    if (k >= F.dur) run.flare = null;
  }
}
// =============================================================================================
// v3.1 combat layer: rage robots (attack tokens, rage, one new attack per journey), area-blast zones, laser sweeps,
// boss rings, the player's wingmen and weapon pickups. Robots are objects in `objs` (kind 'robot') so bolts, the beam,
// Nabeeh, tank chains and the hull already work on them.
const zones = [], sweeps = [], rings = [], wings = [];
const ROBOT_ATTACKS = Array.isArray(M.ROBOT_ATTACKS) ? M.ROBOT_ATTACKS : ['shot', 'dash', 'bomb', 'sweep', 'shield', 'swarm'];
const CUR0 = { robots: false, attacks: 0, tokens: 2, hp: 6, shotV: 200, tele: 1, waves: 0, n: 2, rage: 10, every: 2.5, life: 15 };
const CUR = () => (run && run.plan && run.plan.curve) || (run && safe(M.curve, run.ji)) || CUR0;
const directorK = () => (run && run.dirK > 0) ? run.dirK : 1;
// v3.1 director (Venus on): pressure p drifts up while the player is doing well and drops fast after hits; a 40 s
// build-up / peak / relax wave rides on top. dirK scales filler spawns and robot and boss-part attack rates.
function director(dt) {
  if (!run || run.mode === 'duel' || (run.ji | 0) < 2 || run.easy) { if (run) run.dirK = 1; return; }
  run.dirT += dt; run.intensity = Math.max(0, (run.intensity || 0) - dt * 0.12);
  const hp = ship.maxHp > 0 ? ship.hp / ship.maxHp : 1, hurting = run.intensity > 0.9 || hp <= 0.34;
  if (hurting) run.dirP -= dt * 0.08; else if (run.intensity < 0.2 && hp >= 0.66) run.dirP += dt * 0.006;
  const lo = run.hard ? 0.9 : 0.78, hi = run.hard ? 1.35 : 1.25;
  run.dirP = clamp(run.dirP, lo, hi);
  const wave = run.boss ? 0 : 0.1 * Math.sin(run.dirT * TAU / 40);
  run.dirK = clamp(run.dirP + wave, lo, hi);
}
// v3.1 leg modifiers that change over time: the magnetic field flips, the solar wind gusts
function weather(dt) {
  const m = run.mods; if (!m || !m.length) return;
  if (m.includes('magnet')) { run.magT += dt; if (run.magT > 11) { run.magT = 0; run.magDir = -run.magDir; floatText(run.magDir > 0 ? '▼' : '▲', ship.x + 30, ship.y - 40, '#9fb4ff', 20); } }
  if (m.includes('wind')) { run.windT += dt; run.wind = 22 * Math.sin(run.windT * TAU / 14); }
}
function drawWeather(c) {
  const m = run.mods; if (!m || !m.length) return;
  if (m.includes('dark') && ship) {
    const g = c.createRadialGradient(ship.x + 80, ship.y, 90, ship.x + 80, ship.y, 330);
    g.addColorStop(0, 'rgba(4,6,20,0)'); g.addColorStop(1, 'rgba(4,6,20,0.82)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  if (m.includes('magnet')) { c.save(); c.globalAlpha = 0.18; c.strokeStyle = '#9fb4ff'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { const x = (i + 0.5) * W / 6, y0 = ((t * 60 * run.magDir) % 80 + 80) % 80; for (let y = y0 - 80; y < H; y += 80) { c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x, y + 8 * run.magDir); c.lineTo(x + 6, y); c.stroke(); } } c.restore(); }
  if (m.includes('ion')) { c.save(); c.globalAlpha = 0.07 + 0.04 * Math.sin(t * 3); c.fillStyle = '#7fd3ff'; c.fillRect(0, 0, W, H); c.restore(); }
}
const TELE = { shot: 0.6, dash: 0.9, bomb: 1.25, sweep: 1.0, shield: 0.6, swarm: 0.8 };
const teleOf = k => Math.max(0.35, (TELE[k] || 0.8) * (CUR().tele || 1) + ((run.AS && run.AS.warnPlus) || 0) * 0.6);
const tokensUsed = () => { let n = 0; for (const o of objs) if (!o.dead && o.act) n++; return n; };
function robotY(o) { // a lane away from the other robots
  let best = o ? o.y : 200, bd = -1;
  for (let i = 0; i < 6; i++) { const y = rnd(RV_YMIN, RV_YMAX + 30); let d = 1e9; for (const q of objs) if (q !== o && !q.dead && q.kind === 'robot') d = Math.min(d, Math.abs(q.y - y)); if (d > bd) { bd = d; best = y; } }
  return best;
}
function pickAtk(atk, main) {
  if (atk.length <= 1) return atk[0] || 'shot';
  if (Math.random() < 0.55) return main;
  return atk[Math.floor(Math.random() * atk.length)];
}
function makeRobot(opt = {}) {
  const C = CUR(), n = clamp(C.attacks | 0, 1, ROBOT_ATTACKS.length);
  const atk = opt.teach ? [opt.teach] : (opt.atk || ROBOT_ATTACKS.slice(0, n));
  // the robot's look (and favourite move) leans to the newest attack the journey has taught
  const main = opt.teach || (Math.random() < 0.4 ? atk[atk.length - 1] : atk[Math.floor(Math.random() * atk.length)]);
  // toughness: the journey's base HP plus about 1-2 s of the ship's focused fire (two guns on one lane), so upgrades still
  // help but never delete a robot before it can show its move
  const dps = (S.dmg || 1) * (S.fireRate || 4) * Math.min(2, S.guns || 1), tough = 0.9 + 0.2 * Math.max(0, (run.ji | 0) - 2);
  const sy = opt.y != null ? opt.y : robotY(null), hp = ((C.hp || 14) + dps * tough) * (run.hpMul || 1) * (opt.hpK || 1);
  const o = { type: 'junk', kind: 'robot', size: 'M', x: opt.x != null ? opt.x : W + 30, y: sy, by: sy, r: 20, hp, max: hp, pts: 70, sg: 0.06,
    vx: 0, vy: 0, rot: 0, vr: 0, seed: Math.floor(Math.random() * 9999), flash: 0, dead: false, killT: 0, ph: rnd(0, TAU), wob: 0,
    st: 'in', sx: opt.sx != null ? opt.sx : rnd(W * 0.58, W - 70), sy, life: opt.life || (opt.teach ? 16 : C.life || 15), age: 0, atk, main,
    cd: opt.teach ? 1.2 : rnd(1.0, 2.0), act: null, tell: 0, rage: 0, raging: false, strafeT: rnd(2, 4), minion: !!opt.minion, teach: !!opt.teach,
    shieldBy: null, dashing: false, move: robotMove, onHit: robotHit, draw: (c, o) => PZ.drawRageBot(c, o, t) };
  objs.push(o);
  return o;
}
function enrage(o) {
  if (o.raging) return;
  o.raging = true; o.rage = 1; o.cd = Math.min(o.cd, 0.5);
  floatText(tt('f_rage', 'RAGE!'), o.x - 10, o.y - 30, '#ff5a4a', 16, true);
  ring(o.x, o.y, 40, '#ff5a4a', 0.35); sfxT('rockhit', 0.15, 0.5, 0.9);
  if (Math.random() < 0.4) say('bot_rage');
}
function robotHit(o) { if (!o.raging) { o.rage += 0.09; if (o.rage >= 1) enrage(o); } }
function robotMove(o, dt) {
  const C = CUR(), spd = o.raging ? 1.4 : 1;
  o.age += dt;
  if (o.shieldBy && o.shieldBy.dead) o.shieldBy = null;
  if (o.dashing) { o.x -= o.dv * dt; if (o.dvY != null) o.y += (o.dvY - o.y) * Math.min(1, dt * 2.5); if (o.x < -40) o.dead = true; return; }
  if (!o.raging && st === 'play') { o.rage += dt / Math.max(3, C.rage || 10); if (o.rage >= 1) enrage(o); }
  if (o.st === 'in') { o.x += (o.sx - o.x) * Math.min(1, dt * 2.4 * spd); o.y += (o.sy - o.y) * Math.min(1, dt * 2); if (Math.abs(o.x - o.sx) < 8) { o.st = 'hold'; o.cd = Math.min(o.cd, rnd(0.3, 0.8)); } }
  else if (o.st === 'out') { o.x += 260 * dt; if (o.x > W + 50) o.dead = true; return; }
  else {
    o.strafeT -= dt * spd; if (o.strafeT <= 0) { o.strafeT = rnd(2.4, 4.4); o.sy = robotY(o); }
    o.y += (o.sy + Math.sin(t * 2 + o.seed) * 6 - o.y) * Math.min(1, dt * 1.8 * spd);
    o.x += (o.sx + Math.sin(t * 1.3 + o.seed) * 8 - o.x) * Math.min(1, dt * 2);
    if (o.age > o.life && !o.act && !o.minion) o.st = 'out';
  }
  if (o.act) { robotAct(o, dt); return; }
  if (o.st !== 'hold' || st !== 'play' || !ship.alive || debug.noAttack || run.ending) return;
  o.cd -= dt * spd / directorK();
  if (o.cd <= 0) { if (tokensUsed() < (C.tokens || 2) + (o.raging ? 1 : 0)) startAct(o); else o.cd = 0.25; }
}
function startAct(o) {
  let k = pickAtk(o.atk, o.main);
  let mate = null;
  if (k === 'shield') { let bd = 1e9; for (const q of objs) if (q !== o && !q.dead && q.kind === 'robot' && !q.shieldBy && q.main !== 'shield') { const d = Math.hypot(q.x - o.x, q.y - o.y); if (d < bd) { bd = d; mate = q; } } if (!mate) k = 'shot'; }
  const a = { k, t: 0, warn: teleOf(k), mate, done: false };
  o.act = a;
  if (k === 'bomb') { // the target circle shows at once: the telegraph IS the circle
    const n = o.raging ? 2 : 1;
    for (let i = 0; i < n; i++) { const lead = i ? (ship.vy || 0) * 0.5 : 0; addZone(clamp(ship.x + (i ? rnd(-30, 50) : 0), 40, W * 0.5), clamp(ship.y + lead + (i ? rnd(-60, 60) : 0), Y_MIN, Y_MAX), o.raging ? 62 : 50, a.warn + 0.15, o.x, o.y - 18); }
    sfx.mine();
  } else if (k === 'sweep') {
    const sg = ship.y >= o.y ? 1 : -1, y1 = clamp(ship.y + sg * 80, Y_MIN - 10, Y_MAX + 10);
    sweeps.push({ x0: o.x - 14, y0: o.y, y1, y: o.y, t: 0, warn: a.warn, dur: o.raging ? 0.7 : 0.95, ph: 'warn', hit: false, dead: false, from: o });
    sfx.laserWarn();
  } else if (k === 'dash') sfx.warn();
}
function robotAct(o, dt) {
  const a = o.act, C = CUR(); a.t += dt; o.tell = clamp(a.t / a.warn, 0, 1);
  if (a.t < a.warn) return;
  switch (a.k) {
    case 'shot': { const n = o.raging ? 3 : 1, mx = o.x - 26, my = o.y, base = aimAng(mx, my);
      for (let i = 0; i < n; i++) { shot('pellet', mx, my, base + (n > 1 ? (i / (n - 1) - 0.5) * 0.36 : 0), C.shotV || 200); const s = eshots[eshots.length - 1]; if (s) s.src = 'robot'; }
      sfx.eshot(); break; }
    case 'dash': o.dashing = true; o.dv = 520 * (o.raging ? 1.25 : 1); o.dvY = o.raging ? ship.y : null; o.dmg = 1; sfx.whoosh(); shake(3); break;
    case 'shield': if (a.mate && !a.mate.dead) { a.mate.shieldBy = o; ring(a.mate.x, a.mate.y, 34, '#5ec8ff', 0.4); sfx.shieldHit(); } break;
    case 'swarm': { const n = o.raging ? 4 : 3;
      for (let i = 0; i < n && emobs.length < 24; i++) { const life = 6; emobs.push({ kind: 'drone', x: o.x - 6, y: clamp(o.y + 14 + (i - (n - 1) / 2) * 14, 20, H - 20), ang: Math.PI + (i - (n - 1) / 2) * 0.5, v: 115, turn: 1.3, life, max: life, hp: 2, r: ER('drone'), flash: 0, dead: false, beepT: 0.2 }); }
      sfx.mine(); break; }
    // bomb and sweep run on their own timers once started
  }
  o.act = null; o.tell = 0;
  o.cd = (C.every || 2.5) * rnd(0.85, 1.15) * (o.raging ? 0.6 : 1) * (o.teach ? 0.7 : 1);
}
function addZone(x, y, r, warn, bx, by) { if (zones.length < 16) zones.push({ x, y, r, t: 0, warn: Math.max(0.5, warn), ph: 'warn', bx, by, dead: false }); }
function zoneHits(x, y, r) {
  const shR = shipR() * hurtK();
  if (ship.alive && st === 'play' && Math.hypot(ship.x - x, ship.y - y) < r + shR * 0.4 && ship.inv <= 0 && !debug.invincible) hurtShip(1, run.boss ? 'boss' : 'zone');
  for (const w of wings) if (!w.dead && Math.hypot(w.x - x, w.y - y) < r) popWing(w);
}
function updateCombat(dt) {
  // area blasts
  for (const z of zones) {
    z.t += dt;
    if (z.ph === 'warn') { if (z.t >= z.warn) { z.ph = 'boom'; z.t = 0; zoneHits(z.x, z.y, z.r); sfx.boom('M'); shake(5); sparks(z.x, z.y, 14, '#ffb347', 200); smoke(z.x, z.y, 3, '#5a566e'); } }
    else if (z.t > 0.35) z.dead = true;
  }
  compact(zones, z => !z.dead);
  // laser sweeps
  const shR = shipR() * hurtK();
  for (const L of sweeps) {
    if (L.from && L.from.dead) { L.dead = true; continue; }
    L.t += dt; if (L.from) L.x0 = L.from.x - 14;
    if (L.ph === 'warn') { if (L.t >= L.warn) { L.ph = 'fire'; L.t = 0; sfx.laserFire(); } continue; }
    const k = clamp(L.t / L.dur, 0, 1); L.y = L.y0 + (L.y1 - L.y0) * k;
    if (!L.hit && ship.alive && ship.x < L.x0 && Math.abs(ship.y - L.y) < 9 + shR && ship.inv <= 0 && !debug.invincible) { L.hit = true; hurtShip(1, run.boss ? 'boss' : 'laser'); }
    for (const w of wings) if (!w.dead && w.x < L.x0 && Math.abs(w.y - L.y) < 10) popWing(w);
    if (k >= 1) L.dead = true;
  }
  compact(sweeps, L => !L.dead);
  // boss rings with a gap
  for (const g of rings) {
    g.t += dt;
    if (g.ph === 'warn') { if (g.t >= g.warn) { g.ph = 'go'; g.t = 0; g.r = 60; sfx.whoosh(); } continue; }
    g.r += g.v * dt;
    if (ship.alive && !g.hit) {
      const dx = ship.x - g.x, dy = ship.y - g.y, d = Math.hypot(dx, dy);
      if (Math.abs(d - g.r) < 6 + shR * 0.6) { const ang = Math.atan2(dy, dx), off = Math.abs(wrapA(ang - g.a)); if (off > g.w && ship.inv <= 0 && !debug.invincible) { g.hit = true; hurtShip(1, 'boss'); } }
    }
    if (g.r > W * 1.3) g.dead = true;
  }
  compact(rings, g => !g.dead);
  updateWings(dt);
  updateWeapon(dt);
}

// ---- wingmen: rescued maintenance robots fly with the ship, shoot, and take one hit each ----
const WING_SLOTS = [[-16, -50], [-16, 50], [-50, 0]];
function wingMax() { return 2 + (S && S.bot && S.bot.lv >= 5 ? 1 : 0); }
function addWing() {
  if (wings.filter(w => !w.dead).length >= wingMax()) return false;
  const used = wings.filter(w => !w.dead).map(w => w.slot); let slot = 0; while (used.includes(slot)) slot++;
  wings.push({ slot, x: ship.x, y: ship.y, fireT: rnd(0.2, 0.6), ph: rnd(0, TAU), dead: false });
  floatText(tt('f_wingJoin', 'Wingman!'), ship.x + 30, ship.y - 44, '#7dff9a', 15, true);
  return true;
}
function popWing(w) {
  if (w.dead) return; w.dead = true;
  sparks(w.x, w.y, 12, '#7dff9a', 160); ring(w.x, w.y, 30, '#7dff9a', 0.35); sfx.shieldpop();
  floatText(tt('f_wingSave', 'Saved you!'), w.x, w.y - 18, '#7dff9a', 14);
  say('bot_wing');
}
function updateWings(dt) {
  if (!wings.length) return;
  for (const w of wings) {
    if (w.dead) continue;
    const s = WING_SLOTS[w.slot] || WING_SLOTS[0], tx = ship.x + s[0], ty = clamp(ship.y + s[1], Y_MIN - 20, Y_MAX + 20);
    w.x += (tx - w.x) * Math.min(1, dt * 7); w.y += (ty - w.y) * Math.min(1, dt * 7);
    if (st !== 'play' || !ship.alive || !canFire()) continue;
    w.fireT -= dt;
    if (w.fireT <= 0 && bolts.length < 110) { w.fireT = 0.66; bolts.push({ x: w.x + 14, y: w.y, vx: 640, vy: 0, ang: 0, dmg: (S.dmg || 1) * 0.6, lv: 0, pierce: 0, skip: null, dead: false, as: rv ? 0 : null, tgt: null, ta: 0, wing: true }); }
  }
  compact(wings, w => !w.dead);
}
// a shot or a body that touches a wingman pops the wingman instead of hitting the ship
function wingBlock(x, y, r) { for (const w of wings) if (!w.dead && (w.x - x) ** 2 + (w.y - y) ** 2 < (r + 11) ** 2) { popWing(w); return true; } return false; }

// ---- weapon pickups: spread, laser, homing, saw (about 10 s each) ----
const WEAPONS = ['spread', 'laser', 'homing', 'saw'];
function giveWeapon(kind) {
  ship.weapon = { kind, t: kind === 'laser' ? 11 : 14, max: kind === 'laser' ? 11 : 14, laserT: 0, saw: 0 };
  say2('wp_' + kind, ship.x + 30, ship.y + 40, '#ffe066'); say('bot_weapon');
}
function updateWeapon(dt) {
  const w = ship.weapon; if (!w) return;
  if (st === 'play') w.t -= dt;
  if (w.t <= 0) { ship.weapon = null; return; }
  if (st !== 'play' || !ship.alive || !canFire()) return;
  const dmg = S.dmg || 1;
  if (w.kind === 'laser') {
    w.laserT -= dt; if (w.laserT > 0) return; w.laserT = 0.1;
    for (const o of objs) if (!o.dead && !o.ghost && o.x > ship.x && o.x < W + 10 && Math.abs(o.y - ship.y) < o.r + 8) damage(o, dmg * 0.9, 'bolt');
    for (const m of emobs) if (!m.dead && m.x > ship.x && Math.abs(m.y - ship.y) < m.r + 8) { m.hp -= dmg * 0.9; m.flash = 1; if (m.hp <= 0) killMob(m, 'bolt'); }
    if (rv) laserBoss(dmg * 0.9 * (S.duelBolt || 1));
  } else if (w.kind === 'saw') {
    w.saw += dt * 7;
    for (let i = 0; i < 2; i++) {
      const a = w.saw + i * Math.PI, bx = ship.x + Math.cos(a) * 46, by = ship.y + Math.sin(a) * 46;
      for (const o of objs) if (!o.dead && !o.ghost && (o.sawCd || 0) <= t && (o.x - bx) ** 2 + (o.y - by) ** 2 < (o.r + 11) ** 2) { o.sawCd = t + 0.15; damage(o, dmg * 1.2, 'bolt'); sparks(bx, by, 3, '#ffe066', 120); }
      for (const s of eshots) if (!s.dead && (s.x - bx) ** 2 + (s.y - by) ** 2 < (s.r + 12) ** 2) { s.dead = true; sparks(s.x, s.y, 3, '#ffe066', 100); }
      for (const m of emobs) if (!m.dead && (m.x - bx) ** 2 + (m.y - by) ** 2 < (m.r + 12) ** 2) killMob(m, 'bolt');
      if (rv && (run.sawCd || 0) <= t && sawBoss(bx, by, dmg * 1.2 * (S.duelBolt || 1))) run.sawCd = t + 0.15;
    }
  }
}
// what the laser and the saw do to a boss (phase C adds parts and guards; this is the plain rival)
function laserBoss(d) { if (typeof laserBoss2 === 'function' && laserBoss2(d)) return; if (Math.abs(rv.y - ship.y) < rv.r + 8 && rv.x > ship.x) damageRival(d, 'bolt'); }
function sawBoss(x, y, d) { if (typeof sawBoss2 === 'function') return sawBoss2(x, y, d); if ((rv.x - x) ** 2 + (rv.y - y) ** 2 < (rv.r + 12) ** 2) { damageRival(d, 'bolt'); return true; } return false; }
function drawCombatUnder(c) {
  for (const z of zones) if (z.ph === 'warn') PZ.drawZone(c, z, t);
  for (const L of sweeps) if (L.ph === 'warn') PZ.drawSweep(c, L, t);
  for (const g of rings) PZ.drawRingGap(c, g, t);
  for (const o of objs) if (!o.dead && o.kind === 'robot' && o.act && o.act.k === 'dash') {
    const f = clamp(o.act.t / o.act.warn, 0, 1);
    c.save(); c.strokeStyle = `rgba(255,179,71,${0.3 + 0.6 * f})`; c.lineWidth = 3; c.setLineDash([14, 8]); c.lineDashOffset = t * 80;
    c.beginPath(); c.moveTo(o.x - 24, o.y); c.lineTo(0, o.y); c.stroke(); c.setLineDash([]);
    for (let x = o.x - 60; x > 20; x -= 70) { c.beginPath(); c.moveTo(x, o.y - 7); c.lineTo(x - 10, o.y); c.lineTo(x, o.y + 7); c.stroke(); }
    c.restore();
  }
}
function drawCombatOver(c) {
  for (const z of zones) if (z.ph === 'boom') PZ.drawZone(c, z, t);
  for (const L of sweeps) if (L.ph === 'fire') PZ.drawSweep(c, L, t);
}
function drawShipKit(c) { // wingmen, the saw and the laser weapon, drawn with the ship
  for (const w of wings) if (!w.dead) PZ.drawWingman(c, w.x, w.y, t, w.ph);
  const w = ship.weapon; if (!w || !ship.alive) return;
  if (w.kind === 'saw') for (let i = 0; i < 2; i++) { const a = w.saw + i * Math.PI; PZ.drawSaw(c, ship.x + Math.cos(a) * 46, ship.y + Math.sin(a) * 46, t); }
  if (w.kind === 'laser' && st === 'play' && canFire()) PZ.drawLaserWeapon(c, ship.x + 30, ship.y, W + 10, t);
}

function drawPiecesUnder(c) {
  for (const o of objs) if (!o.dead && o.tether && o.anchor && !o.anchor.dead) PZ.drawTether(c, o.anchor.x, o.anchor.y, o.x, o.y, t);
  drawCombatUnder(c);
}
function drawPiecesOver(c) {
  drawCombatOver(c);
  try { drawWeather(c); } catch (e) { errOnce('weather', e); }
  const F = run.flare; if (!F) return;
  PZ.drawFlare(c, W, H, F.t < F.warn ? clamp(F.t / F.warn, 0, 1) : 1 - F.flash * 0.5, F.flash, t);
}
function bossWarn(id) {
  const name = rvName(id);
  safe(UI.banner, tt('f_warning', 'WARNING'), name, 3600);
  sfx.warn(); sfx.rivalPhase(); mood('alert', 3.5); shake(3);
  say(safe(M.guardian, id) ? 'bot_guardian' : 'bot_boss', true);
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
  if (o.shieldBy && !o.shieldBy.dead && src !== 'beam') { o.flash = 0.5; sparks(o.x - o.r, o.y, 2, '#9fe6ff', 90); sfxT('shieldHit', 0.1, 1.2, 0.6); return; } // v3.1 shield link
  if (o.onHit) o.onHit(o, d);
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
      if (n === o || n.dead || n.killT > 0 || n.ghost) continue;
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
  coin: { rockS: 0.10, rockM: 0.22, rockL: 0.40, ice: 0.15, crystal: 0, panel: 0.30, tank: 0.25, drone: 0.45, dish: 0.40, turret: 0.6, grabber: 0.7 },

  crystal: [2, 4], crystalValue: 2, pickup: 0.05,
  pickWeights: { cell: 2, rapid: 2, repair: 2, shield: 1 },
  duel: { per10: 3, burst: 20 },
}, M.DROPS || {});
function dropKey(o) { return o.type === 'junk' ? o.kind : o.kind === 'rock' ? 'rock' + o.size : o.kind; }
function drops(o) {
  let n = 0, val = 1;
  if (o.kind === 'crystal') { const c = DROPS.crystal || [2, 4]; n = c[0] + Math.floor(Math.random() * (c[1] - c[0] + 1)) + (S.crystalPlus | 0); val = DROPS.crystalValue || 2; }
  else if (o.coinSure || (o.kind === 'robot' && Math.random() < 0.7)) n = 1;
  if (o.kind === 'robot' && !o.minion && Math.random() < 0.12 * (run.pickMul || 1)) addPick('w_' + pick(WEAPONS), o.x, o.y, 1);   // v3.1 weapon pickups
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
  const p = { kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, val, ph: rnd(0, 10), pulled: false, life: 18, dead: false };
  picks.push(p); return p;
}
function collect(p) {
  if (p.kind === 'pod') { // v3: a stranded maintenance robot, rescued by flying over it
    run.rescued++; sfx.pickup(); sfx.coin(3);
    sparks(p.x, p.y, 14, '#7dff9a', 140); ring(p.x, p.y, 40, '#7dff9a', 0.4);
    addKill(50, p.x, p.y);
    floatText(run.rescueTotal > 0 ? `${tt('f_rescued')} ${run.rescued}/${run.rescueTotal}` : tt('f_rescued'), ship.x + 30, ship.y + 40, '#7dff9a', 16, true);
    say('bot_rescue', true); mood('happy', 1.5);
    addWing();   // v3.1: the rescued robot flies with you
    return;
  }
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
  else if (p.kind === 'rapid') { ship.rapidT = 9; say2('f_rapid', ship.x + 30, fy, '#ffb347'); }
  else if (p.kind.startsWith('w_')) giveWeapon(p.kind.slice(2));
  mood('happy', 1.2); say('bot_pickup');
}
function shake(a) { if (!REDUCED) shakeA = Math.max(shakeA, a); }
function hitStopMs(ms) { if (hitStopCd > 0) return; hitStop = Math.max(hitStop, ms / 1000); hitStopCd = 0.25; }

const duelSafe = () => run && rv && (run.ds === 'intro' || run.ds === 'fixed');

// a shield pop with the shield ✦ (shieldBlast) also clears small rocks (and, in a duel, enemy shots, mines, drones) nearby
function shieldBlast() {
  const R = S.shieldBlast || 0; if (R <= 0) return;
  ring(ship.x, ship.y, R, '#9ff0ff', 0.35);
  for (const o of objs) if (!o.dead && o.type === 'rock' && o.size === 'S' && o.kind !== 'crystal' && Math.hypot(o.x - ship.x, o.y - ship.y) < R + o.r) kill(o, 'pop');
  for (const s of eshots) if (!s.dead && Math.hypot(s.x - ship.x, s.y - ship.y) < R + s.r) { s.dead = true; sparks(s.x, s.y, 3, '#9ff0ff', 90); }
  for (const m of emobs) if (!m.dead && Math.hypot(m.x - ship.x, m.y - ship.y) < R + m.r) killMob(m, 'pop');
}
// v3 assist: a bump instead of a hit (Moon: everything; the Moon boss and the Mars boss: their attacks)
function bump(src) {
  run.bumps++; ship.inv = 0.9;
  sfxT('rockhit', 0.12, 0.8, 0.9); buzz(15); shake(3);
  ring(ship.x, ship.y, 42, '#ffe066', 0.3); sparks(ship.x + 8, ship.y, 8, '#fff2b0', 120);
  if (run.bumps === 1 || Math.random() < 0.3) { say2('f_bump', ship.x + 30, ship.y + 40, '#ffe066'); say('bot_bump'); }
  mood('alert', 0.8);
  return true;
}
function hurtShip(dmg, src = 'hit') {
  if (!ship.alive || ship.inv > 0 || debug.invincible || st !== 'play' || duelSafe()) return false;
  const AS = run.AS || {};
  if (AS.noDamage || (AS.bossHarmless && src === 'boss')) return bump(src);
  if (ship.extraShield > 0 || ship.shieldUp) {
    // the shield booster's extra charge goes first, then the normal shield
    if (ship.extraShield > 0) ship.extraShield--; else { ship.shieldUp = false; ship.shieldT = shieldCd(); }
    ship.inv = 0.7;
    sfx.shieldpop(); ring(ship.x, ship.y, 54, '#9ff0ff', 0.4); sparks(ship.x, ship.y, 14, '#9ff0ff', 180);
    say2('f_shieldPop', ship.x + 30, ship.y + 40); say('bot_shield');
    shieldBlast();
    shake(4); buzz(25); return true;
  }
  ship.hp -= dmg; run.hits++; run.regenT = 0; run.intensity = Math.min(3, (run.intensity || 0) + 0.6 * dmg);
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
  const x = ship.x, y = ship.y;
  // v3 Mars assist: the ship respawns in place with a fresh shield; the leg goes on (counted for the medals)
  if (run.AS && run.AS.respawn && run.mode !== 'duel') {
    run.deaths++; ship.hp = ship.maxHp; ship.inv = 3; ship.shieldUp = true; ship.shieldT = 0; ship.rapidT = 0;
    ring(x, y, 70, '#9ff0ff', 0.5); ring(x, y, 110, '#fff6c2', 0.6); sparks(x, y, 18, '#9ff0ff', 200); smoke(x, y, 4, '#5a566e');
    play('boomL', 0.5); shake(8); flashA = REDUCED ? 0 : 0.25;
    if (rv) clearEnemyFire();
    for (const m of meteors) if (!m.dead && m.phase === 'go' && Math.abs(m.y - y) < 60) m.dead = true;
    say2('f_respawn', x + 30, y + 40, '#9ff0ff'); say('bot_respawn', true); mood('alert', 2);
    return;
  }
  if (run.mode !== 'duel') { const rk = run.jid + ':' + run.li; retries[rk] = (retries[rk] || 0) + 1; }
  ship.alive = false; beamT = 0;
  explode(x, y, 34, { shard: 'metal', fire: true, ringCol: '#ffd27a' });
  for (let i = 0; i < Math.ceil(26 * FX); i++) { const a = rnd(0, TAU), v = rnd(80, 320); addP(P_FIRE, x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.4, 0.9), rnd(10, 22), pick(['#ff8a2a', '#ffb347', '#ff5a3c'])); }
  for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), v = rnd(60, 220); const p = addP(P_DEBRIS, x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(1, 1.6), rnd(3, 7), pick(['#f4f2ea', '#e2552d', '#c8202b', '#8d94a8', '#3b3b46'])); if (p) p.drag = 0.6; }
  ring(x, y, 90, '#ffe7a8', 0.55); ring(x, y, 140, '#ff9a3c', 0.75);
  smoke(x, y, 8, '#4d4a5e');
  play('boomL', 0.8); sfx.tank(); buzz([60, 40, 120]); shake(16); hitStop = 0.08; flashA = REDUCED ? 0 : 0.35;
  mood('sad', 9);
  if (rv) { if (!line('bot_duelLose')) say('bot_lose', true); else say('bot_duelLose', true); rvSay(line('rv_' + rv.id + '_taunt')); }
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
  return safe(M.rival, rid) || list.find(r => r.id === rid) || safe(M.guardian, rid) || null;
}
// v3: a boss inside a leg (the journey's rogue ship on leg 3, a guardian on legs 1-2). The timer freezes, the filler stops,
// the duel machine runs the fight; once the boss is fixed the leg drains and arrives as usual.
function startBoss(b) {
  const R0 = rivalData(b.id); if (!R0 || rv) return false;
  const P = run.plan || {}, k = P.bossAtk || 1, scale = b.scale || 1;
  const R = Object.assign({}, R0, { hp: Math.round(R0.hp * scale) });
  if (k !== 1) R.phases = (R0.phases || []).map(ph => Object.assign({}, ph, { atk: (ph.atk || []).map(a => Object.assign({}, a, a.every ? { every: a.every * k } : {}, a.off ? { off: a.off * k } : {})) }));
  run.frozen = true; run.fillerMul = 0; run.mixNow = null; run.meteorsOff = 1e9; run.pend.length = 0;
  run.boss = { id: R.id, final: !!b.final, guardian: !!R.guardian };
  run.R = R; run.rid = R.id; run.ds = 'intro'; run.dsT = 0; run.fightT = 0; run.fightTime = null; run.enraged = false;
  for (const m of meteors) m.dead = true;
  makeRival(R);
  bot.duelSaid = true;
  safe(UI.setBoss, R.id);
  mood('alert', 2.5);
  return true;
}
function bossDone() {
  if (!rv) return;
  const id = rv.id, final = !!(run.boss && run.boss.final);
  run.bossFixed.push(id); run.bossTime = run.fightTime != null ? run.fightTime : run.fightT;
  rv = null; run.boss = null; run.ds = null; run.R = null; run.rid = null;
  eshots.length = emobs.length = elasers.length = 0;
  run.frozen = false; run.meteorsOff = 0; run.fillerMul = 1;
  safe(UI.setBoss, null);
  if (final) { run.elapsed = run.L.dur; run.ending = true; run.endT = 0; }
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
  const RG = safe(M.rigOf, R.id);
  run = newRun({ mode: 'duel', rid, R, J, ji: RG ? RG.j : journeyIndex(R.need), L: { speed: 130, dur: 1, hp: 1, coin: 1, pick: 1, mix: {} }, ds: 'intro', dsT: 0, fightT: 0, last: false,
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
    say: '', sayT: 0, sayMax: 1, alpha: 1, rot: 0, fixedEye: false, burst: false, introSaid: false, lastSafe: -1, dead: false, smokeT: 0,
    art: R.art || R.id, s: R.s > 0 ? R.s : 1 };   // v3 guardians borrow a rival body at a smaller scale
  safe(A.bakeRival, rv.art, rv.s);
  const pts = typeof A.rivalPoints === 'function' ? safe(A.rivalPoints, rv.art) : null;
  rv.mu = pts && pts.muzzle ? [pts.muzzle[0] * rv.s, pts.muzzle[1] * rv.s] : [-rv.r * 0.8, 0]; rv.ha = pts && pts.hatch ? [pts.hatch[0] * rv.s, pts.hatch[1] * rv.s] : [-rv.r * 0.4, 0];
  if (R.shield) setShield(R.shield);
  if (R.plates) { const P = R.plates; rv.plates = []; for (let i = 0; i < (P.n | 0); i++) rv.plates.push({ hp: P.hp, max: P.hp, alive: true, flash: 0, x: rv.x, y: rv.y, rot: rnd(0, TAU) }); }
  rigUp(R);
  if (rv.move.mode === 'blink') rv.blinkT = (rv.move.every || 3) * 0.6;
}
// ---------------------------------------------------------------------------------------------
// v3.1 real bosses: a rig of parts and guards around the rival core (meta.js BOSS_RIG)
const rvHome = () => { const base = W - 120 - (rv && rv.rigDx || 0); return rv && rv.adv ? clamp(W * 0.62, ship.x + 200, base) : base; };
function rigUp(R) {
  const rig = !R.guardian && safe(M.rigOf, R.id); rv.parts = null; rv.guards = null; rv.rig = null; rv.ymin = RV_YMIN; rv.ymax = RV_YMAX;
  rv.adv = false; rv.desp = false; rv.guardT = 0;
  if (R.guardian) { // guardians stay small: one guard drone from Venus on (two from Uranus), a gun from Saturn on
    const j = run.ji | 0;
    if (j >= 2) { rv.guardN = j >= 6 ? 2 : 1; rv.guards = []; for (let i = 0; i < rv.guardN; i++) addGuard(); }
    if (j >= 5) { rv.parts = [{ i: 0, kind: 'gun', at: [-4, -(rv.r + 26)], hp: Math.max(8, rv.max * 0.2), max: Math.max(8, rv.max * 0.2), atk: { k: 'aim', every: 2.6, n: 2, v: 240 }, x: rv.x, y: rv.y, r: 15, cd: 2, tell: 0, aim: Math.PI, flash: 0, dead: false }];
      rv.ymin = Math.max(RV_YMIN, Y_MIN + 6 + rv.r + 48); }
    return;
  }
  if (!rig) return;
  rv.rig = rig; rv.s = rig.scale; rv.r = (R.r || 34) * rig.scale;
  const pts = typeof A.rivalPoints === 'function' ? safe(A.rivalPoints, rv.art) : null;
  if (pts && pts.muzzle) rv.mu = [pts.muzzle[0] * rv.s, pts.muzzle[1] * rv.s];
  if (pts && pts.hatch) rv.ha = [pts.hatch[0] * rv.s, pts.hatch[1] * rv.s];
  rv.parts = rig.parts.map((p, i) => ({ i, kind: p.kind, at: p.at, hp: Math.max(8, rv.max * p.hp), max: Math.max(8, rv.max * p.hp), atk: p.atk || null,
    x: rv.x + p.at[0], y: rv.y + p.at[1], r: p.kind === 'hangar' ? 20 : 17, cd: rnd(1.2, 2.4) + i * 0.4, tell: 0, aim: Math.PI, flash: 0, dead: false }));
  let up = 0, dn = 0, rx = 0; for (const p of rv.parts) { up = Math.min(up, p.at[1] - 22); dn = Math.max(dn, p.at[1] + 22); rx = Math.max(rx, p.at[0] + 24); }
  rv.rigDx = Math.max(36, rx - 34 + rv.r * 0.4);   // big bodies and their rear parts stay clear of the right edge
  rv.ymin = Math.max(RV_YMIN, Y_MIN + 6 - up); rv.ymax = Math.min(RV_YMAX, Y_MAX - 6 - dn); if (rv.ymin > rv.ymax) rv.ymin = rv.ymax = 200;
  rv.guardN = rig.guards | 0; rv.guards = []; for (let i = 0; i < rv.guardN; i++) addGuard();
  rv.adv = false; rv.desp = false; rv.guardT = 0;
}
function addGuard() {
  if (!rv || !rv.guards || rv.guards.length >= rv.guardN) return;
  const hp = Math.max(4, rv.max * 0.035);
  rv.guards.push({ hp, max: hp, a: rnd(0, TAU), x: rv.x, y: rv.y, rot: 0, flash: 0, dead: false });
}
const partsAlive = () => rv && rv.parts ? rv.parts.filter(p => !p.dead).length : 0;
const shieldGenUp = () => !!(rv && rv.parts && rv.parts.some(p => !p.dead && p.kind === 'shieldGen'));
const hangarUp = () => !!(rv && rv.parts && rv.parts.some(p => !p.dead && p.kind === 'hangar'));
function hitPart(p, d) {
  if (p.dead || run.ds !== 'fight' || !(d > 0)) return;
  p.hp -= d; p.flash = 1; rv.hurt = Math.min(1, rv.hurt + 0.15); superFromDmg(d * 0.6);
  if (p.hp > 0) { sfxT('rockhit', 0.07, 0.7, 0.8); return; }
  p.dead = true; p.tell = 0;
  explode(p.x, p.y, 20, { shard: 'metal', fire: true, ringCol: '#ffb347', spark: '#ffcf6a' }); ring(p.x, p.y, 60, '#ff9a3c', 0.45);
  sfx.tank(); shake(8); hitStopMs(50);
  run.score += 200; floatText('+200', p.x, p.y - 20, '#ffe066', 18);
  for (let i = 0; i < 4; i++) { const c = addPick('coin', p.x, p.y, 1); if (c) c.vx = -rnd(60, 160); }
  if (Math.random() < 0.5) addPick('w_' + pick(WEAPONS), p.x, p.y, 1);
  floatText(tt('f_partDown', 'Part down!'), p.x - 20, p.y + 26, '#9ff0ff', 15, true);
  if (p.kind === 'shieldGen') { floatText(tt('f_coreOpen', 'Core open!'), rv.x - 30, rv.y - rv.r - 20, '#9ff0ff', 18, true); say('bot_coreOpen', true); }
  else say('bot_partDown');
}
function hitGuard(g, d) {
  if (g.dead) return; g.hp -= d; g.flash = 1;
  if (g.hp > 0) { sfx.shieldHit(); return; }
  g.dead = true; explode(g.x, g.y, 10, { shard: 'metal', spark: '#9fe6ff', ringCol: '#9fe6ff' }); sfx.plate(); run.score += 40;
}
// a part fires one of its attacks from its own position
function partFire(p) {
  const a = p.atk; if (!a) return;
  const C = CUR(), k = a.k;
  if (p.kind === 'gun') {
    const v = (a.v || 230) * (rv.desp ? 1.1 : 1), base = Math.atan2(ship.y - p.y, ship.x - p.x), mx = p.x + Math.cos(base) * 22, my = p.y + Math.sin(base) * 22;
    if (k === 'fan') { const n = a.n || 3, arc = a.arc || 0.5; for (let i = 0; i < n; i++) shot('pellet', mx, my, base + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0), v); }
    else { const n = a.n || 1; for (let i = 0; i < n; i++) rv.q.push({ d: i * 0.14, fn: () => { if (p.dead) return; const b2 = Math.atan2(ship.y - p.y, ship.x - p.x); shot('pellet', p.x + Math.cos(b2) * 22, p.y + Math.sin(b2) * 22, b2, v); } }); }
    sfx.eshot();
  } else if (p.kind === 'arm') {
    const warn = Math.max(0.6, 1.15 * ((C.tele || 1) || 1) + ((run.AS && run.AS.warnPlus) || 0) * 0.6);
    if (k === 'ring') { const off = rnd(-0.55, 0.55); rings.push({ x: p.x, y: p.y, r: 60, v: a.v || 210, a: Math.atan2(ship.y - p.y, ship.x - p.x) + off, w: a.w || 0.45, t: 0, warn: warn * 0.8, ph: 'warn', hit: false, dead: false }); sfx.laserWarn(); }
    else { const n = a.n || 2, r = a.r || 50; addZone(ship.x, ship.y, r, warn, p.x, p.y); for (let i = 1; i < n; i++) { const ang = rnd(0, TAU), d = rnd(70, 140); addZone(clamp(ship.x + Math.cos(ang) * d, 40, W * 0.55), clamp(ship.y + Math.sin(ang) * d, Y_MIN, Y_MAX), r, warn + i * 0.12, p.x, p.y); } sfx.mine(); }
  } else if (p.kind === 'hangar') {
    let alive = 0; for (const o of objs) if (!o.dead && o.minion) alive++;
    const cap = Math.max(2, (C.tokens || 2) + 1), early = (run.ji | 0) < 2 || !(C.attacks > 0);
    for (let i = 0; i < (a.n || 1) && alive < cap; i++, alive++) {
      if (early) { const o = spawnKind(i % 2 ? 'drone' : 'rockM', clamp(p.y + rnd(-10, 10), Y_MIN, Y_MAX)); if (o) { o.x = p.x - 10; o.vx = -(run.L.speed || 130) * 1.1; o.minion = true; o.flash = 0.8; } }
      else makeRobot({ minion: true, x: p.x - 10, y: p.y, sx: rnd(W * 0.46, W * 0.6), hpK: 0.55, life: 12 });
    }
    if (rv.guards && rv.guards.length < rv.guardN) addGuard();
    p.tell = 1; smoke(p.x, p.y, 2, '#6d6a80'); sfx.plate();
  }
}
function updateRig(dt, live) {
  if (!rv.parts) return;
  const f = rv.hp / rv.max;
  if (!rv.adv && rv.rig && f <= rv.rig.advance) { rv.adv = true; floatText(tt('f_advance', 'It is coming closer!'), rv.x - 60, rv.y - rv.r - 24, '#ff8a5a', 17, true); safe(UI.note, tt('f_advance')); sfx.rivalPhase(); shake(6); }
  if (!rv.desp && rv.rig && f <= rv.rig.desp) { rv.desp = true; floatText(tt('f_desp', 'Last stand!'), rv.x - 40, rv.y - rv.r - 44, '#ff5a4a', 19, true); say('bot_desp', true); sfx.rivalPhase(); shake(8); }
  for (const p of rv.parts) {
    p.x = rv.x + p.at[0]; p.y = rv.y + p.at[1]; p.flash = Math.max(0, p.flash - dt * 6);
    if (p.dead) { if (Math.random() < 2 * dt * FX) smoke(p.x, p.y, 1, '#4d4a5e'); continue; }
    if (p.kind === 'gun') p.aim = Math.atan2(ship.y - p.y, ship.x - p.x);
    if (p.kind === 'hangar') p.tell = Math.max(0, p.tell - dt * 1.5);
    if (!live || run.ds !== 'fight' || debug.noAttack || !p.atk) continue;
    p.cd -= dt * (rv.desp ? 1.7 : 1) * (run.enraged ? 1.25 : 1) / ((run.plan && run.plan.bossAtk) || 1) / directorK();
    if (p.kind === 'gun') p.tell = clamp(1 - p.cd / 0.6, 0, 1);
    if (p.cd <= 0) { p.cd = (p.atk.every || 3) * rnd(0.9, 1.1); partFire(p); }
  }
  // guards orbit the core; the hangar rebuilds them
  if (rv.guards) {
    const R0 = rv.r + 30;
    for (const g of rv.guards) { g.a += dt * 1.3; g.x = rv.x + Math.cos(g.a) * R0; g.y = rv.y + Math.sin(g.a) * R0; g.rot = g.a + Math.PI; g.flash = Math.max(0, g.flash - dt * 6); }
    compact(rv.guards, g => !g.dead);
    if (rv.guards.length < rv.guardN && hangarUp()) { rv.guardT += dt; if (rv.guardT > 7) { rv.guardT = 0; addGuard(); } }
  }
}
// bolts against the rig: guards first, then parts (returns true when the bolt is used up)
function boltRig(b) {
  if (rv.guards) for (const g of rv.guards) if (!g.dead && (b.x - g.x) ** 2 + (b.y - g.y) ** 2 < 15 * 15) { b.dead = true; sparks(b.x, b.y, 2, '#9fe6ff', 100, -60); hitGuard(g, b.dmg); return true; }
  if (rv.parts) for (const p of rv.parts) if (!p.dead && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (p.r + 4) ** 2) { b.dead = true; if (run.ds !== 'fight') { sparks(b.x, b.y, 2, '#ffffff', 90, -80); return true; } sparks(b.x, b.y, 2.5, '#ffd27a', 110, -60); hitPart(p, b.dmg); return true; }
  return false;
}
// the laser and the saw weapons and homing missiles know about parts and guards too
function laserBoss2(d) {
  if (!rv.parts && !rv.guards) return false;
  if (rv.guards) for (const g of rv.guards) if (!g.dead && g.x > ship.x && Math.abs(g.y - ship.y) < 14) { hitGuard(g, d); return true; }
  if (rv.parts) for (const p of rv.parts) if (!p.dead && p.x > ship.x && Math.abs(p.y - ship.y) < p.r + 6) { hitPart(p, d); return true; }
  if (Math.abs(rv.y - ship.y) < rv.r + 8 && rv.x > ship.x) damageRival(d, 'bolt');
  return true;
}
function sawBoss2(x, y, d) {
  if (rv.guards) for (const g of rv.guards) if (!g.dead && (g.x - x) ** 2 + (g.y - y) ** 2 < 26 * 26) { hitGuard(g, d); return true; }
  if (rv.parts) for (const p of rv.parts) if (!p.dead && (p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + 12) ** 2) { hitPart(p, d); return true; }
  if ((rv.x - x) ** 2 + (rv.y - y) ** 2 < (rv.r + 12) ** 2) { damageRival(d, 'bolt'); return true; }
  return false;
}
function homeBoss(b) {
  let best = null, bd = 1e9;
  if (rv.guards) for (const g of rv.guards) { if (g.dead) continue; const d = (g.x - b.x) ** 2 + (g.y - b.y) ** 2; if (d < bd) { bd = d; best = g; } }
  if (rv.parts) for (const p of rv.parts) { if (p.dead) continue; const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2; if (d < bd) { bd = d; best = p; } }
  return best || rv;
}
function drawRigUnder(c) {
  if (!rv.parts) return;
  c.save(); c.strokeStyle = INK; c.lineCap = 'round';
  for (const p of rv.parts) { c.lineWidth = 9; c.strokeStyle = INK; c.beginPath(); c.moveTo(rv.x, rv.y); c.lineTo(p.x, p.y); c.stroke(); c.lineWidth = 5; c.strokeStyle = p.dead ? '#3b3b46' : '#6a7088'; c.beginPath(); c.moveTo(rv.x, rv.y); c.lineTo(p.x, p.y); c.stroke(); }
  c.restore();
  if (shieldGenUp() && run.ds !== 'fixed') { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(94,200,255,${0.35 + 0.15 * Math.sin(t * 6)})`; c.lineWidth = 4; c.beginPath(); c.arc(rv.x, rv.y, rv.r + 10, 0, TAU); c.stroke(); c.restore(); }
}
function drawRigOver(c) {
  if (rv.parts) for (const p of rv.parts) PZ.drawBossPart(c, p, t);
  if (rv.guards) for (const g of rv.guards) PZ.drawGuard(c, g, t);
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
  zones.length = sweeps.length = rings.length = 0;
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
  if (shieldGenUp()) { d *= 0.25; if (src !== 'beam' && Math.random() < 0.25) sparks(rv.x - rv.r, rv.y + rnd(-10, 10), 2, '#9fe6ff', 90); }   // v3.1: the shield generator protects the core
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
  if (rv.parts) for (const p of rv.parts) if (!p.dead) { p.dead = true; explode(p.x, p.y, 16, { shard: 'metal', fire: true, ringCol: '#ffb347' }); }
  if (rv.guards) { for (const g of rv.guards) sparks(g.x, g.y, 6, '#9fe6ff', 120); rv.guards.length = 0; }
  for (const o of objs) if (!o.dead && o.minion) { o.dead = true; smoke(o.x, o.y, 2, '#6d6a80'); }
  zones.length = sweeps.length = rings.length = 0;

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
  if (f >= 2.5) { if (run.mode === 'duel') endRun(true); else bossDone(); }
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
  rv.ty = clamp(rv.ty, rv.ymin != null ? rv.ymin : RV_YMIN, rv.ymax != null ? rv.ymax : RV_YMAX);
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
  if (run && run.mods && run.mods.includes('ion')) v *= 0.7;
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
    case 'ram': if (!rv.ram) rv.ram = { ph: 'warn', t: 0, warn: a.warn != null ? a.warn : 1.0, v: a.v || 650, back: a.back || 300, y: rv.y, hit: false, stop: clamp(ship.x - 70, 40, 150) }; break;
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
  const m = rv.ram, home = rvHome(); m.t += dt;
  if (m.ph === 'warn') { rv.tell = clamp(m.t / m.warn, 0, 1); if (m.t >= m.warn) { m.ph = 'go'; sfx.whoosh(); shake(4); } }
  else if (m.ph === 'go') { rv.x -= m.v * dt; if (Math.random() < 0.6 * FX) addP(P_FIRE, rv.x + rv.r, rv.y + rnd(-8, 8), 200, rnd(-20, 20), 0.3, 12, '#ff8a2a', 30); if (rv.x <= (m.stop || 150)) { rv.x = m.stop || 150; m.ph = 'back'; } }
  else { rv.x += m.back * dt; if (rv.x >= home) { rv.x = home; rv.ram = null; return; } }
  if (m.ph !== 'warn' && !m.hit && ship.alive) {
    const rr = rv.r * 0.85 + shR * hurtK(), dx = rv.x - ship.x, dy = rv.y - ship.y;
    if (dx * dx + dy * dy < rr * rr && hurtShip(2, 'boss')) m.hit = true;
  }
}
function updateRival(dt) {
  const home = rvHome(), shR = shipR();
  if (rv.parts) for (const p of rv.parts) { p.x = rv.x + p.at[0]; p.y = rv.y + p.at[1]; }
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
  updateRig(dt, live);
  updateLasers(dt, shR);
}
function updateLasers(dt, shR) {
  for (const L of elasers) {
    L.t += dt; L.x0 = muzzle();
    if (L.ph === 'warn') { if (L.t >= L.warn) { L.ph = 'fire'; L.t = 0; sfx.laserFire(); shake(3); } }
    else {
      if (!L.hit && ship.alive && Math.abs(ship.y - L.y) < ER('laser') + shR * hurtK() && hurtShip(1, 'boss')) L.hit = true; // once per laser
      if (L.t >= L.dur) L.dead = true;
    }
  }
  compact(elasers, L => !L.dead);
  if (rv.hold && rv.hold.dead) rv.hold = null;
}
function mineBlast(m) {
  m.dead = true;
  explode(m.x, m.y, 14, { fire: true, shard: 'metal', ringCol: '#ff8a5a', spark: '#ffb38a' }); ring(m.x, m.y, 40, '#ff6a4a', 0.35); sfx.boom('S');
  const rr = 40 + shipR() * 0.6 * hurtK(), dx = ship.x - m.x, dy = ship.y - m.y;
  if (ship.alive && dx * dx + dy * dy < rr * rr) hurtShip(1, 'boss');
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
// v3.1 graze: +2% beam per shot that skims past, a spark ring, a little float now and then
function graze(s) {
  run.grazes++;
  if (beamT <= 0) { superF = Math.min(1, superF + 0.02); checkSuperFull(); }
  ring(s.x, s.y, 16, '#9ff0ff', 0.22); sparks(s.x, s.y, 3, '#e6fbff', 90);
  if (run.grazes === 1 || run.grazes % 6 === 0) floatText(tt('f_graze', 'Graze!'), ship.x + 26, ship.y - 34, '#9ff0ff', 15, true);
}
const hurtK = () => (run && run.AS && run.AS.hurtScale > 0) ? run.AS.hurtScale : 1;   // v3: the hull's own hitbox, smaller for young pilots
function updateEnemies(dt) {
  if (!eshots.length && !emobs.length) return;
  const shR = shipR() * hurtK(), hot = ship.alive && st === 'play' && !debug.invincible;
  for (const s of eshots) {
    if (s.dead) continue;
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.x < -30 || s.x > W + 60 || s.y < -30 || s.y > H + 30 || s.life <= 0) { s.dead = true; continue; }
    if (wings.length && wingBlock(s.x, s.y, s.r)) { s.dead = true; continue; }
    if (hot && ship.inv <= 0) {
      const rr = s.r + shR * 0.75, dx = s.x - ship.x, dy = s.y - ship.y;
      if (dx * dx + dy * dy < rr * rr) { s.dead = true; sparks(s.x, s.y, 5, '#ffb3a0', 120); hurtShip(s.dmg || 1, s.src || 'boss'); }
      else if (!s.grazed) { // v3.1 graze: a shot that skims the hull charges the beam
        const gr = rr + 14;
        if (dx * dx + dy * dy < gr * gr) { s.grazed = true; graze(s); }
      }

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
    if (wings.length && wingBlock(m.x, m.y, m.r)) { if (m.kind === 'mine') mineBlast(m); else { m.dead = true; sparks(m.x, m.y, 6, '#ffcf6a', 120); } continue; }
    if (hot && ship.inv <= 0) {
      const rr = m.r + shR * 0.8, dx = m.x - ship.x, dy = m.y - ship.y;
      if (dx * dx + dy * dy < rr * rr) { if (m.kind === 'mine') mineBlast(m); else { m.dead = true; sparks(m.x, m.y, 8, '#ffcf6a', 140); hurtShip(1, 'boss'); } continue; }
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
  if ((rv.parts || rv.guards) && boltRig(b)) return;
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
  if (rv.guards) for (const g of rv.guards) if (!g.dead && circRect(g.x, g.y, 10, b)) hitGuard(g, g.hp + 1);
  if (rv.parts && run.ds === 'fight') for (const p of rv.parts) if (!p.dead && circRect(p.x, p.y, p.r, b)) hitPart(p, p.max * 0.22 * dt);
  for (const s of eshots) if (!s.dead && circRect(s.x, s.y, s.r, b)) { s.dead = true; addP(P_SPARKLE, s.x, s.y, 0, 0, 0.3, 6, '#fff6c2', 30); }
  for (const m of emobs) if (!m.dead && circRect(m.x, m.y, m.r, b)) killMob(m, 'beam');
  for (const L of elasers) if (L.ph === 'fire' && Math.abs(L.y - ship.y) < 35) L.hit = true; // the beam also shelters the ship from a laser on its lane
}

// ---------------------------------------------------------------------------------------------
// Arrival / end of a run
function beginArrive() {
  if (st !== 'play') return;
  st = 'arrive'; stT = 0; beamT = 0; dragId = null; ship.vx = 0;
  arrive = { T: 0, dur: run.last ? 4.4 : 3.0, last: run.last, vx: 0, sparkT: 0 };
  for (const o of objs) if (!o.dead) { smoke(o.x, o.y, 2, '#8a86a0', o.vx); sparks(o.x, o.y, 3, '#cfd8ff', 80); o.dead = true; }
  for (const m of meteors) m.dead = true;
  bolts.length = 0; zones.length = sweeps.length = rings.length = 0; eshots.length = emobs.length = 0; ship.weapon = null;
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
    crystals: run.crystals, chain: run.chain, botKills: run.botKills, pickups: run.pickups,
    bumps: run.bumps, deaths: run.deaths, grazes: run.grazes, rescued: run.rescued, rescueTotal: run.rescueTotal, bossFixed: run.bossFixed.slice(), bossTime: run.bossTime, hard: run.hard };
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
  if (win && !duel) delete retries[run.jid + ':' + run.li];
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
    if (!run.frozen) run.elapsed += dt;
    director(dt); weather(dt);
    run.mercyT -= dt;
    if (!run.half && run.elapsed >= L.dur / 2) { run.half = true; const h = tt('f_halfway'); if (h) safe(UI.note, h); }
    if (!run.ending && !run.boss && run.elapsed >= L.dur) { run.ending = true; run.endT = 0; }
    if (run.ending) {
      run.endT += dt;
      let left = 0; for (const o of objs) if (!o.dead && o.x < W + 40) left++;
      const mLeft = meteors.some(m => !m.dead);
      if ((left === 0 && !mLeft) || run.endT > 4) beginArrive();
    } else { runBeats(dt); if (!run.boss) { spawner(dt); meteorSpawner(); } }
    if (!bot.startSay || (bot.startSay -= dt) <= 0) { if (bot.startSay !== null) { bot.startSay = null; say('bot_start', true); } }
    // ★3 reached (the score goal of DESIGN §4.3); settlement decides the stars
    if (!run.starSaid && L.star > 0 && run.score >= L.star) { run.starSaid = true; floatText('★★★', ship.x + 110, ship.y - 46, '#ffe066', 22); sfx.pickup(); }
  }
  if (st === 'play' && duel) run.elapsed += dt;
  if (st === 'dead') { run.deadT += dt; if (run.deadT >= 1.6) endRun(false); }
  if (st === 'arrive') { arrive.T += dt; if (arrive.T >= arrive.dur) endRun(true); }

  updateShip(dt);
  updateObjs(dt);
  if (run.flare) updateFlare(dt);
  updateCombat(dt);
  if (run.held && run.held.dead) freeBot(run.held);
  if (rv) updateRival(dt);
  updateEnemies(dt);
  if (!duel) updateMeteors(dt);
  updatePicks(dt);
  updateBot(dt);
  updateParts(dt);
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboN = 0; mult = 1; lastMult = 1; } }
  run.coinChainT -= dt;
  shakeA *= Math.exp(-9 * dt); if (shakeA < 0.2) shakeA = 0;
  flashA = Math.max(0, flashA - dt * 1.6);
}

function canFire() {
  if (run.mode === 'duel' || rv) return run.ds === 'fight' || run.ds === 'shift';
  return !run.ending || run.endT < 3.5;
}
function updateShip(dt) {
  if (!ship.alive) return;
  if (st === 'play') {
    const kd = (keys.down ? 1 : 0) - (keys.up ? 1 : 0), kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (kd) ship.ty = clamp(ship.ty + kd * 330 * dt, Y_MIN, Y_MAX);
    if (kx) ship.tx = clamp(ship.tx + kx * 300 * dt, X_MIN, xMax());
    if (run.mods && run.mods.includes('magnet') && !run.boss) ship.ty = clamp(ship.ty + run.magDir * 38 * dt, Y_MIN, Y_MAX);
    ship.tx = clamp(ship.tx, X_MIN, xMax());
    const k = (S.follow || 10) > 1.5 ? S.follow : (S.follow || 0.2) * 60; // rate constant (1/s)
    ship.py = ship.y; ship.px = ship.x;
    let step = (ship.ty - ship.y) * (1 - Math.exp(-k * dt));
    const vmax = (S.maxVy || 700) * dt; if (step > vmax) step = vmax; else if (step < -vmax) step = -vmax;
    ship.y += step;
    let sx = (ship.tx - ship.x) * (1 - Math.exp(-k * dt)); const hmax = vmax * 0.85; if (sx > hmax) sx = hmax; else if (sx < -hmax) sx = -hmax;
    ship.x += sx;
    ship.vy = (ship.y - ship.py) / Math.max(dt, 1e-4); ship.vxp = (ship.x - ship.px) / Math.max(dt, 1e-4);
    ship.tilt += (clamp(ship.vy / 360, -1, 1) - ship.tilt) * Math.min(1, dt * 10);
    ship.thrust = 0.6 + Math.min(0.45, Math.abs(ship.vy) / 1200 + Math.max(0, ship.vxp) / 600);
    ship.inv = Math.max(0, ship.inv - dt);
    ship.rapidT = Math.max(0, ship.rapidT - dt);
    if (!ship.shieldUp && shieldCd() > 0) { ship.shieldT -= dt; if (ship.shieldT <= 0) { ship.shieldUp = true; ring(ship.x, ship.y, 44, '#9ff0ff', 0.3); say2('f_shieldUp', ship.x + 30, ship.y + 40, '#9ff0ff', 14); } }
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
        const wk = ship.weapon && ship.weapon.kind, rate = wk === 'homing' ? 3.2 : (S.fireRate || 4) * (ship.rapidT > 0 ? 2 : 1);
        if (wk === 'laser') { ship.fireT = 0.2; } else {
        ship.fireT += 1 / rate; if (ship.fireT < 0) ship.fireT = 0;
        fire();
        }
      }
    }
    // beam
    if (beamT > 0) {
      beamT -= dt;
      const b = beamRect();
      for (const o of objs) if (!o.dead && !o.ghost && circRect(o.x, o.y, o.r, b)) kill(o, 'beam');
      for (const m of meteors) if (!m.dead && m.phase === 'go' && circRect(m.x, m.y, m.r, b)) killMeteor(m);
      if (rv) beamDuel(dt, b);
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
  const duel = !!rv, AS = run.AS || {}, wk = ship.weapon && ship.weapon.kind;
  if (wk === 'spread' || wk === 'homing') { // v3.1 weapon pickups
    const dmg = (S.dmg || 1) * (duel ? S.duelBolt || 1 : 1), mx = ship.x + 32 * ship.sc, my = ship.y;
    if (wk === 'spread') for (const a of [-0.3, -0.15, 0, 0.15, 0.3]) bolts.push({ x: mx, y: my, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, ang: a, dmg: dmg * 0.8, lv: BLV, pierce: 0, skip: null, dead: false, as: null, tgt: null, ta: 0 });
    else for (const k of [-1, 1]) bolts.push({ x: mx - 8, y: my + k * 8, vx: 320, vy: k * 160, ang: k * 0.46, dmg: dmg * 1.6, lv: Math.max(2, BLV), pierce: 0, skip: null, dead: false, as: null, tgt: null, ta: 0, home: true, life: 2.6 });
    sfx.shoot(); return;
  }
  let tgt = null;
  if (!duel && AS.autoAim) { // v3 Moon: bolts bend towards the nearest thing ahead
    let bd = 1e9; for (const o of objs) { if (o.dead || o.x < ship.x + 40 || o.x > W - 10 || o.harmless) continue; const dy = o.y - ship.y; if (Math.abs(dy) > 140) continue; const d = (o.x - ship.x) + Math.abs(dy) * 1.5; if (d < bd) { bd = d; tgt = o; } }
  }
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
    bolts.push({ x: mx, y: my, vx, vy, ang, dmg, lv: BLV, pierce: S.pierce | 0, skip: null, dead: false, as: duel ? 0 : null, tgt, ta: 0 });
  }
  sfx.shoot();
}
function updateObjs(dt) {
  const shR = shipR() * hurtK(), big = (run.AS && run.AS.bigHitbox > 0) ? run.AS.bigHitbox : 1;
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.as !== null && rv) { b.as += clamp((rv.y - b.y) * 2 - b.as, -40, 40) * dt * 8; b.y += b.as * dt; b.ang = Math.atan2(b.vy + b.as, b.vx); } // duel aim assist
    else if (b.tgt && !b.tgt.dead && b.tgt.x > b.x) { b.ta += clamp((b.tgt.y - b.y) * 3 - b.ta, -60, 60) * dt * 8; b.y += b.ta * dt; b.ang = Math.atan2(b.vy + b.ta, b.vx); } // v3 Moon auto-aim
    if (b.home) { // v3.1 homing missiles: turn towards the nearest target ahead
      b.life -= dt; if (b.life <= 0) { b.dead = true; continue; }
      if (!b.ht || b.ht.dead) { let bd = 1e9; b.ht = null; for (const o of objs) { if (o.dead || o.ghost || o.harmless || o.x < b.x - 10) continue; const d = (o.x - b.x) ** 2 + (o.y - b.y) ** 2; if (d < bd) { bd = d; b.ht = o; } } for (const m of emobs) { if (m.dead) continue; const d = (m.x - b.x) ** 2 + (m.y - b.y) ** 2; if (d < bd) { bd = d; b.ht = m; } } if (rv && typeof homeBoss === 'function') { const h = homeBoss(b, bd); if (h) b.ht = h; } else if (rv && !b.ht) b.ht = rv; }
      if (b.ht) { const want = Math.atan2(b.ht.y - b.y, b.ht.x - b.x), cur = Math.atan2(b.vy, b.vx), a = cur + clamp(wrapA(want - cur), -5 * dt, 5 * dt), sp = Math.min(520, Math.hypot(b.vx, b.vy) + 300 * dt); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ang = a; }
    }
    if (b.x > W + 20 || b.y < -20 || b.y > H + 20 || b.x < -20) { b.dead = true; continue; }
    for (let j = 0; j < objs.length; j++) {
      const o = objs[j]; if (o.dead || o === b.skip || o.ghost) continue;
      const rr = o.r * big + 4, dx = b.x - o.x, dy = b.y - o.y;
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
    if (rv) { boltDuel(b); if (b.dead) continue; }
    else if (emobs.length) { for (const m of emobs) { if (m.dead) continue; if ((b.x - m.x) ** 2 + (b.y - m.y) ** 2 < (m.r + 4) ** 2) { b.dead = true; m.hp -= b.dmg; m.flash = 1; sparks(b.x, b.y, 2, '#ffd27a', 100, -60); if (m.hp <= 0) killMob(m, 'bolt'); break; } } if (b.dead) continue; }
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
    if (o.move) { o.move(o, dt); if (o.dead) continue; }   // v3 set pieces drive their own motion
    else {
      o.x += o.vx * dt;
      if (o.kind === 'drone') { o.ph += dt * 2.2; o.y = o.by + Math.sin(o.ph) * o.wob; o.by += o.vy * dt; }
      else { if (run.wind) o.vy += run.wind * dt; o.y += o.vy * dt; }
    }
    bandFix(o, dt); if (o.dead) continue;
    o.rot += o.vr * dt;
    o.flash = Math.max(0, o.flash - dt * 6);
    if (o.x < -o.r - 60 || o.y < -o.r - 80 || o.y > H + o.r + 80) { o.dead = true; continue; }
    if (o.kind === 'drone' && Math.random() < 3 * dt * FX) addP(P_SPARK, o.x + rnd(-8, 8), o.y + rnd(-8, 8), rnd(-40, 40), rnd(-40, 40), 0.2, 4, '#9fe8ff', 50);
    if (ship.alive && st === 'play' && !o.harmless) {
      if (wings.length && !o.solid && wingBlock(o.x, o.y, o.r * 0.85)) { kill(o, 'ram'); continue; }
      const rr = o.r * 0.85 + shR, dx = o.x - ship.x, dy = o.y - ship.y;
      if (dx * dx + dy * dy < rr * rr && ship.inv <= 0 && !debug.invincible) { if (hurtShip(o.dmg || 1, o.src || 'rock')) { if (o.solid) ship.inv = 0.5; else kill(o, 'ram'); } }
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
      if (!o.ghost && dx * dx + dy * dy < rr * rr) kill(o, 'meteor');
    }
    // G3: overlapping the ship is never a dodge, even while it blinks after a hit
    if (ship.alive && st === 'play' && !m.hitShip) {
      const rr = m.r * 0.8 + shR * hurtK(), dx = m.x - ship.x, dy = m.y - ship.y;
      if (dx * dx + dy * dy < rr * rr) { m.hitShip = true; if (ship.inv <= 0 && !debug.invincible) hurtShip(2, 'meteor'); }
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
    let pull = p.pulled || (ship.alive && d < mag && (coin || (pullAll && p.kind !== 'pod')));
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
      if (run.mods && run.mods.includes('magnet')) p.vy += run.magDir * 60 * dt;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (!p.pulled) { if (p.y < Y_MIN + 6) { p.y = Y_MIN + 6; p.vy = Math.abs(p.vy); } else if (p.y > Y_MAX - 6) { p.y = Y_MAX - 6; p.vy = -Math.abs(p.vy); } } // v3.2: always reachable
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
  if (run.held && !run.held.dead) { tx = run.held.x - 30; ty = run.held.y + 4; }   // v3: a grabber has Nabeeh
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
  if (run.held) return;   // v3: a grabber has Nabeeh
  if (rv) {
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
      if (!best) { bd = 1e9; for (const o of objs) { if (o.dead || o.ghost || o.x > W - 6 || o.x < ship.x - 20 || used.includes(o)) continue; const d = (o.x - bot.x) ** 2 + (o.y - bot.y) ** 2; if (d < bd) { bd = d; best = o; kind = 'obj'; } } }
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
      if (o.dead || o.ghost || o.x > W - 6 || o.x < ship.x - 20 || used.includes(o)) continue;
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
  if (st === 'menu' || st === 'boot' || !run) { // the station backdrop fills the whole screen behind the menus
    const sh = cv.height / H, wm = cv.width / sh;
    if (wm >= 640) c.setTransform(sh, 0, 0, sh, 0, 0); else { const sw = cv.width / 640; c.setTransform(sw, 0, 0, sw, 0, (cv.height - H * sw) / 2); }
    if (t - menuOT > 0.5 || t < menuOT) refreshMenuO();
    safe(A.drawStationScene, c, Math.max(640, wm), H, t, menuO); return;
  }
  const band = offY > 0.5 || offX > 0.5;
  if (band) { c.fillStyle = '#070a1f'; c.fillRect(0, 0, cv.width, cv.height); }
  c.setTransform(RES, 0, 0, RES, offX * RES, offY * RES);
  if (band) { c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip(); render2(c); c.restore(); drawBands(c); return; }
  render2(c);
}
// the bands around the play field: a soft frame so the field reads as one window on every screen
function drawBands(c) {
  c.save(); c.lineWidth = 2; c.strokeStyle = 'rgba(120,150,255,.22)';
  if (offY > 0.5) { c.beginPath(); c.moveTo(0, -1); c.lineTo(W, -1); c.moveTo(0, H + 1); c.lineTo(W, H + 1); c.stroke(); }
  if (offX > 0.5) { c.beginPath(); c.moveTo(-1, 0); c.lineTo(-1, H); c.moveTo(W + 1, 0); c.lineTo(W + 1, H); c.stroke(); }
  c.restore();
}
function render2(c) {
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
  if (typeof drawPiecesUnder === 'function') { try { drawPiecesUnder(c); } catch (e) { errOnce('piecesUnder', e); } }
  if (rv) { try { drawDuelUnder(c); } catch (e) { errOnce('duelUnder', e); } }
  // A3: the "!" marker moves left of the super button when the lane is low
  for (const m of meteors) if (m.phase === 'warn' && !m.dead) safe(A.drawWarning, c, W, m.y, m.wt / m.warn, t, m.y > H - 125 ? W - 125 : W - 20);
  for (const p of picks) {
    const bob = p.kind === 'coin' ? 0 : Math.sin(t * 4 + p.ph) * 3;
    if (p.life < 2 && Math.floor(p.life * 8) % 2) continue;
    if (p.kind === 'pod') { try { PZ.drawPod(c, p.x, p.y, t, p.ph); } catch (e) { errOnce('pod', e); } continue; }
    if (p.kind.startsWith('w_')) { try { PZ.drawWeaponPick(c, p.kind, p.x, p.y, t + p.ph); } catch (e) { errOnce('wpick', e); } continue; }
    safe(A.drawPickup, c, p.kind, p.x, p.y + bob, t + p.ph);
  }
  const pal = J.theme.rock, ipal = J.theme.ice || J.theme.rock;
  for (const o of objs) {
    if (o.dead) continue;
    if (o.draw) { try { o.draw(c, o); } catch (e) { errOnce('draw:' + o.type, e); } continue; }
    if (o.type === 'rock') { RO.x = o.x; RO.y = o.y; RO.r = o.r; RO.rot = o.rot; RO.seed = o.seed; RO.kind = o.kind; RO.flash = o.flash; RO.palette = o.kind === 'ice' ? ipal : pal; A.drawRock(c, RO); }
    else { JO.x = o.x; JO.y = o.y; JO.rot = o.rot; JO.seed = o.seed; JO.kind = o.kind; JO.flash = o.flash; JO.t = t; A.drawJunk(c, JO); }
  }
  if (rv) { try { drawRivalNow(c); } catch (e) { errOnce('rival', e); } }
  drawParts(c, false);
  const bk = S.fx.bolt || 'blaster';
  for (const b of bolts) A.drawBolt(c, b.x, b.y, bk, b.lv, b.ang);
  for (const m of meteors) if (m.phase === 'go' && !m.dead) { MO.x = m.x; MO.y = m.y; MO.r = m.r; MO.vx = m.vx; MO.seed = m.seed; A.drawMeteor(c, MO, t); }
  if (rv || eshots.length) { try { drawDuelOver(c); } catch (e) { errOnce('duelOver', e); } }
  if (beamT > 0 && ship.alive) A.drawBeam(c, ship.x + 22, ship.y, W, clamp(beamT / beamMax, 0, 1), t);
  for (const l of lasers) A.drawBotLaser(c, l.x1, l.y1, l.x2, l.y2, l.life / l.max);
  drawParts(c, true);
  if (ship.alive) { try { drawShipKit(c); } catch (e) { errOnce('kit', e); } drawShipNow(c); }
  A.drawNabeeh(c, bot.x, bot.y, 0.5, { t, mood: bot.mood, talk: bot.sayT > 0, laser: lasers.length > 0 });
  if (bot.sayT > 0 && bot.say) {
    const age = bot.sayMax - bot.sayT, f = Math.min(1, age / 0.15, bot.sayT / 0.25);
    A.drawBubble(c, bot.x + 6, bot.y - 14, bot.say, f, W);
  }
  if (rv && rv.sayT > 0 && rv.say && rv.alpha > 0.2) {
    const age = rv.sayMax - rv.sayT, f = Math.min(1, age / 0.15, rv.sayT / 0.25);
    safe(A.drawBubble, c, rv.x - rv.r * 0.4, rv.y - rv.r - 2, rv.say, f, W);
  }
  drawTexts(c);
  if (typeof drawPiecesOver === 'function') { try { drawPiecesOver(c); } catch (e) { errOnce('piecesOver', e); } }
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
    c.beginPath(); c.moveTo(rv.x - rv.r, rv.ram.y); c.lineTo((rv.ram.stop || 150) - rv.r, rv.ram.y); c.stroke();
    c.globalAlpha = 1; c.lineWidth = 2; c.strokeStyle = `rgba(255,120,90,${a + 0.3})`; c.beginPath(); c.moveTo(rv.x - rv.r, rv.ram.y); c.lineTo(60, rv.ram.y); c.stroke(); c.restore();
  }
  if (rv.blink) {
    const f = clamp(rv.blink.t / rv.blink.tell, 0, 1);
    for (const y of [rv.blink.ty, ...rv.blink.dec]) {
      if (A.drawBlinkGhost) A.drawBlinkGhost(c, rv.art || rv.id, rv.x, y, f, t);
      else { c.save(); c.setLineDash([4, 5]); c.strokeStyle = `rgba(220,200,255,${0.3 + 0.5 * f})`; c.lineWidth = 2; c.beginPath(); c.arc(rv.x, y, rv.r, 0, TAU); c.stroke(); c.restore(); }
    }
  }
  if (rv.pulseT > 0) {
    if (A.drawPulse) A.drawPulse(c, rv.x, rv.y, t);
    else { c.save(); c.strokeStyle = 'rgba(127,180,255,.5)'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { const r = rv.r + ((t * 120 + i * 60) % 180); c.beginPath(); c.arc(rv.x, rv.y, r, 0, TAU); c.stroke(); } c.restore(); }
  }
}
function drawRivalNow(c) {
  if (rv.parts) drawRigUnder(c);
  const sh = rv.sh ? (rv.sh.up ? clamp(rv.sh.hp / rv.sh.max, 0, 1) : 0) : 0;
  if (rv.plates) for (const p of rv.plates) if (p.alive) {
    if (A.drawPlate) A.drawPlate(c, p.x, p.y, p.rot, p.flash);
    else { c.fillStyle = p.flash > 0.5 ? '#fff' : '#9aa3b8'; c.fillRect(p.x - 10, p.y - 7, 20, 14); }
  }
  const shift = run.ds === 'shift';
  const o = RVO; o.t = t; o.s = rv.s || 1; o.hurt = rv.hurt; o.phase = Math.min(2, rv.ph); o.stun = rv.stunT > 0 ? clamp(rv.stunT, 0.01, 1) : 0;
  o.shift = shift ? clamp(1 - run.dsT / 1.2, 0, 1) : 0; o.limp = run.ds === 'fixed' ? rv.limp || 0 : 0; o.thrust = rv.ram && rv.ram.ph !== 'warn' ? 1.4 : 0.5 + Math.min(0.5, Math.abs(rv.ty - rv.y) / 120);
  o.tell = rv.tell; o.mood = run.ds === 'fixed' ? (rv.fixedEye ? 'fixed' : 'hit') : rv.hurt > 0.6 ? 'hit' : 'angry'; o.shield = sh;
  o.alpha = rv.alpha * (shift && Math.floor(t * 14) % 2 ? 0.55 : 1);
  if (o.alpha <= 0.01) return;
  c.save(); c.translate(rv.x, rv.y); if (rv.rot) c.rotate(rv.rot);
  if (A.drawRival) A.drawRival(c, rv.art || rv.id, 0, 0, o);
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
  if (rv.parts || rv.guards) drawRigOver(c);
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
  if (!rv) { // without a rival the robots' homing minis still need drawing
    for (const m of emobs) { if (m.kind === 'mine') { if (A.drawMine) A.drawMine(c, m.x, m.y, t, 1 - m.life / m.max); } else if (A.drawMiniDrone) A.drawMiniDrone(c, m.x, m.y, t, m.flash); }
    return;
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
const HUDO = { hp: 0, maxHp: 0, score: 0, coins: 0, prog: 0, superF: 0, shield: 0, combo: 1, rapid: 0, duel: false, rival: null, weapon: null, weaponF: 0, wings: 0 };
const RIVH = { id: '', name: '', hp: 0, max: 1, phase: 0, phases: 1, ticks: [], shield: 0, stun: false, intro: 1, parts: 0, partsN: 0, guards: 0, core: false };
function hudNow() {
  if (!run || !ship || (st !== 'play' && st !== 'pause' && st !== 'arrive' && st !== 'dead')) return;
  const scd = shieldCd(), sh = ship.shieldUp || ship.extraShield > 0 ? 1 : scd > 0 ? clamp(1 - ship.shieldT / scd, 0, 0.99) : 0;
  const o = HUDO, duel = run.mode === 'duel';
  o.hp = ship.hp; o.maxHp = ship.maxHp; o.score = Math.round(run.score); o.coins = run.coins;
  o.prog = duel ? 0 : Math.round(clamp(run.elapsed / run.L.dur, 0, 1) * 200) / 200;
  o.superF = Math.round(superF * 100) / 100; o.shield = Math.round(sh * 50) / 50; o.combo = mult;
  o.rapid = ship.rapidT > 0 ? Math.round(ship.rapidT / 6 * 50) / 50 : 0;
  o.weapon = ship.weapon ? ship.weapon.kind : null; o.weaponF = ship.weapon ? Math.round(clamp(ship.weapon.t / ship.weapon.max, 0, 1) * 50) / 50 : 0; o.wings = wings.length;
  o.duel = duel; o.rival = null;
  if (rv) {
    const r = RIVH;
    if (r.id !== rv.id) { r.id = rv.id; r.name = rvName(rv.id); r.max = rv.max; r.phases = (rv.R.phases || []).length || 1; r.ticks = (rv.R.phases || []).slice(1).map(p => p.at); }
    r.hp = Math.ceil(rv.hp); r.phase = rv.ph; r.stun = rv.stunT > 0;
    r.partsN = rv.parts ? rv.parts.length : 0; r.parts = partsAlive(); r.guards = rv.guards ? rv.guards.length : 0; r.core = !!rv.parts && !shieldGenUp();
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
    // v3: skip() jumps to the WARNING before the boss (or past the boss on screen); skip(true) ends the leg at once
    skip(all = false) {
      if (st !== 'play' || !run || run.mode === 'duel') return false;
      if (rv) { if (run.ds !== 'fixed') { run.fightTime = run.fightT; rv.hp = 0; } bossDone(); return true; }
      if (!all && run.plan && run.plan.boss && run.elapsed < run.L.dur - 4.5) return this.jump(run.L.dur - 4.5);
      run.elapsed = run.L.dur; run.ending = true; run.boss = null; beginArrive(); return true;
    },
    jump(T) { // to a time in the leg: earlier beats are skipped, not fired
      if (st !== 'play' || !run || run.mode === 'duel' || rv) return false;
      run.elapsed = clamp(T, 0, run.L.dur); while (run.bi < run.beats.length && run.beats[run.bi].t < run.elapsed) run.bi++;
      run.windows.length = run.pend.length = 0; run.fillerMul = 1; run.mixNow = null; run.meteorNow = null; run.meteorsOff = 0; run.nextMeteor = run.elapsed + 3; return true;
    },
    beats() { return run && run.beats ? run.beats.map((b, i) => (i < run.bi ? '✓ ' : '  ') + b.t + ' ' + b.kind + (b.ev ? '/' + b.ev : b.form ? '/' + b.form : b.id ? '/' + b.id : '')) : []; },
    win() {
      if (!run || run.ended || !ship || !ship.alive) return false; // M1: never settle a dead ship as a win
      if (run.mode === 'duel') return this.winDuel(true);
      endRun(true); return true;
    },
    // win a duel: through the "fixed" cinematic, or at once with winDuel(true)
    winDuel(now = false) {
      if (!run || run.ended || !rv || !ship.alive) return false;
      if (now) { if (run.ds !== 'fixed') { run.fightTime = run.fightT; rv.hp = 0; } if (run.mode === 'duel') endRun(true); else bossDone(); return true; }
      if (run.ds === 'intro') { run.ds = 'fight'; startPhase(); }
      if (run.ds !== 'fixed') { run.ds = 'fight'; rv.invT = 0; rv.sh = null; rv.ph = (rv.R.phases || [1]).length - 1; damageRival(rv.hp + 1, 'debug'); }
      return true;
    },
    killPart(kind) { if (!rv || !rv.parts) return false; const p = rv.parts.find(q => !q.dead && (!kind || q.kind === kind)); if (!p) return false; if (run.ds !== 'fight') { run.ds = 'fight'; run.dsT = 0; startPhase(); } hitPart(p, p.hp + 1); return true; },
    rivalHp(f) { if (!rv || run.ds !== 'fight') return false; rv.invT = 0; const keep = rv.sh; rv.sh = null; damageRival(Math.max(0, rv.hp - clamp(f, 0, 1) * rv.max), 'debug'); if (!rv.sh) rv.sh = keep; return rv.hp; },
    rival() {
      return rv ? { parts: rv.parts && rv.parts.map(p => ({ kind: p.kind, hp: Math.round(p.hp), dead: p.dead })), guards: rv.guards && rv.guards.length, adv: rv.adv, desp: rv.desp, shieldGen: shieldGenUp(), id: rv.id, ds: run.ds, dsT: run.dsT, hp: rv.hp, max: rv.max, ph: rv.ph, x: rv.x, y: rv.y, shield: rv.sh && { up: rv.sh.up, hp: rv.sh.hp, max: rv.sh.max }, stunT: rv.stunT,
        plates: rv.plates && rv.plates.filter(p => p.alive).length, ram: rv.ram && rv.ram.ph, enraged: run.enraged, fightT: run.fightT, eshots: eshots.length, emobs: emobs.length,
        elasers: elasers.length, objs: objs.length, pulse: rv.pulseT > 0, blink: !!rv.blink, move: rv.move && rv.move.mode, fixedEye: rv.fixedEye, drops: rv.drops } : null;
    },
    die() { if (st === 'play' && ship && ship.alive) { ship.hp = 0; die(); return true; } return false; },
    fillSuper() { superF = 1; checkSuperFull(); },
    super: () => { superF = 1; checkSuperFull(); return doSuper(); },
    spawn(kind = 'rockM', y) { if (!run) return null; return spawnKind(kind, y); },
    step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) { try { update(dt); } catch (e) { errOnce('update', e); } } try { render(); hudNow(); } catch (e) { errOnce('render', e); } return run ? run.elapsed : 0; }, // headless tests
    objs: () => objs.filter(o => !o.dead).map(o => ({ kind: o.kind, type: o.type, x: Math.round(o.x), y: Math.round(o.y), r: o.r, entering: !!o.entering, free: !!o.free, ghost: !!o.ghost, move: !!o.move })),
    zone(x, y, r = 50, warn = 0.5) { addZone(x, y, r, warn); return zones.length; },
    robot(o) { return run ? makeRobot(o || {}) : null; },
    weapon(k = 'spread') { if (ship) giveWeapon(k); return ship && ship.weapon; },
    wing() { return ship ? addWing() : false; },
    combat() { return { robots: objs.filter(o => !o.dead && o.kind === 'robot').map(o => ({ main: o.main, atk: o.atk, act: o.act && o.act.k, raging: o.raging, st: o.st, hp: o.hp })), zones: zones.length, sweeps: sweeps.length, rings: rings.length, wings: wings.length, eshots: eshots.length, emobs: emobs.length, tokens: tokensUsed(), weapon: ship && ship.weapon && ship.weapon.kind, grazes: run && run.grazes }; },
    piece(b) { if (!run || st !== 'play') return false; setPiece(typeof b === 'string' ? (b === 'pods' ? { kind: 'pods', n: 1 } : ['wall', 'squad', 'turrets', 'tether'].includes(b) ? { kind: 'wave', form: b, n: 1 } : { kind: 'event', ev: b, dur: 8 }) : b); return true; },
    meteor(y) { if (run && st === 'play' && run.mode !== 'duel') spawnMeteor(y); },
    hurt(n = 1) { if (ship) return hurtShip(n); },
    pickup(kind = 'coin', pull = false) { if (!run) return; const p = addPick(kind, ship.x + 120, ship.y, 1); if (p && pull) p.pulled = true; },
    setY(y) { if (ship) { ship.ty = ship.y = clamp(y, Y_MIN, Y_MAX); } },
    setXY(x, y) { if (ship) { ship.tx = ship.x = clamp(x, X_MIN, xMax()); if (y != null) ship.ty = ship.y = clamp(y, Y_MIN, Y_MAX); } return ship && { x: ship.x, y: ship.y }; },
    info() {
      return run ? { st, mode: run.mode, elapsed: run.elapsed, dur: run.L.dur, objs: objs.length, meteors: meteors.length, bolts: bolts.length, picks: picks.length, parts: parts.length,
        hp: ship.hp, maxHp: ship.maxHp, shield: ship.shieldUp, extraShield: ship.extraShield, superF, beamT, score: run.score, kills: run.kills, coins: run.coins, hits: run.hits,
        dodged: run.meteors, supers: run.supers, mult, y: ship.y, qLevel, W, H, botY: bot.y, botSay: bot.sayT > 0 ? bot.say : '', fps: fpsCap,
        comboMax: run.comboMax, beamMax: run.beamMax, crystals: run.crystals, chain: run.chain, botKills: run.botKills, pickups: run.pickups, boost: run.boost,
        fx: S.fx, costume: S.costume, char: S.char, ds: run.ds, rid: run.rid, bumps: run.bumps, deaths: run.deaths, rescued: run.rescued, frozen: run.frozen,
        boss: run.boss && run.boss.id, fillerMul: run.fillerMul, dirK: run.dirK, dirP: run.dirP, intensity: run.intensity, mods: run.mods, bi: run.bi, assist: run.AS, easy: run.easy, hard: run.hard } : { st, qLevel, W, H, fps: fpsCap };

    },
    stats: () => S, report: () => run && report(),
    sounds: () => Object.keys(SND), audio: () => actx && actx.state,
    run: () => run, ship: () => ship, quality: (q) => { if (q != null) { qLevel = clamp(q, 0, 3); resize(); safe(A.setArtQuality, qLevel); } return qLevel; },
  }),
};
window.__aboodMoon = Object.assign(window.__aboodMoon || {}, { state: () => st, start: (j, l) => start(j, l), duel: (rid) => startDuel(rid) });

boot();
