// Abood to the Moon · عبود إلى القمر — engine: boot, loop, gameplay, particles, audio, input.
// Drawing lives in art.js, DOM in ui.js, data/save in meta.js, text in i18n.js (see docs/SPEC.md).
import * as M from './meta.js';
import { T, TL, nf, lang, setLang, applyI18n } from './i18n.js';
import * as A from './art.js';
import * as UI from './ui.js';

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
const tt = (key, fb = '') => { try { const v = T(key); return v && v !== key ? v : fb; } catch (e) { return fb; } };
const line = key => { try { const v = TL(key); return typeof v === 'string' && v && v !== key ? v : ''; } catch (e) { return ''; } };
const safe = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { console.error(e); } };

// ---------------------------------------------------------------------------------------------
// Resize + quality (QDPR caps, auto-downgrade only)
const QDPR = [2, 1.5, 1.15, 0.85];
let qLevel = COARSE ? 1 : 0;
if ((navigator.deviceMemory || 8) <= 3) qLevel = 2;
let W = 700, scale = 1, offY = 0, RES = 1, FX = 1, MAXP = 300;

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
}
let rzT = 0;
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 80); });
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);

// ---------------------------------------------------------------------------------------------
// State
let st = 'boot', t = 0, stT = 0, playT = 0, booted = false;
let S = null;            // M.stats() snapshot for the current leg
let run = null;          // current leg
let ship = null, bot = null, arrive = null;
const objs = [], meteors = [], bolts = [], picks = [], parts = [], texts = [], lasers = [];
let scroll = 0, shakeA = 0, hitStop = 0, hitStopCd = 0, flashA = 0;
let superF = 0, superWasFull = false, beamT = 0, beamMax = 1;
let comboN = 0, comboT = 0, mult = 1, lastMult = 1;
let lastWin = false, lastRun = null;
const debug = { invincible: false, timeScale: 1, noSpawn: false };

// ---------------------------------------------------------------------------------------------
// Device integration
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
let wake = null;
async function wakeOn() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
function wakeOff() { try { wake && wake.release(); } catch (e) {} wake = null; }

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

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (st === 'play') setPause(true); musicFade(0); }
  else if (st === 'play') wakeOn();
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
};
async function initAudio(onProgress) {
  try { ZZ = (await import('./vendor/zzfx.js')).ZZFX; actx = ZZ.audioContext; }
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
    await nextFrame();
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
const P_SHARD = 0, P_SPARK = 1, P_FIRE = 2, P_SMOKE = 3, P_RING = 4, P_DEBRIS = 5, P_SPARKLE = 6;
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
// live counters meta only learns from track(); batched and flushed at the end of a leg (track() saves every call)
const pend = { crystals: 0, junk: 0, tanks: 0, pickups: 0 };
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
  else if (c === 'KeyP' || c === 'Escape') { if (st === 'play') setPause(true); else if (st === 'pause') setPause(false); }
});
addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW') keys.up = false;
  else if (c === 'ArrowDown' || c === 'KeyS') keys.down = false;
});
addEventListener('blur', () => { keys.up = keys.down = false; dragId = null; });

// ---------------------------------------------------------------------------------------------
// Leg setup
const SIZES = { S: { r: 12, hp: 1, pts: 10, sg: 0.03 }, M: { r: 22, hp: 3, pts: 25, sg: 0.045 }, L: { r: 36, hp: 7, pts: 50, sg: 0.07 } };
const JUNK = {
  panel: { r: 22, hp: 2, pts: 30, sg: 0.05 },
  tank: { r: 16, hp: 2, pts: 30, sg: 0.05 },
  drone: { r: 17, hp: 3, pts: 30, sg: 0.055 },
  dish: { r: 20, hp: 3, pts: 30, sg: 0.055 },
};
const MIX_KEYS = ['rockS', 'rockM', 'rockL', 'ice', 'crystal', 'panel', 'tank', 'drone', 'dish'];

function journeyIndex(jid) { return (M.JOURNEYS || []).findIndex(j => j.id === jid); }
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

function start(jid, li = 0) {
  if (typeof jid === 'number') jid = M.JOURNEYS[jid] && M.JOURNEYS[jid].id;
  const ji = journeyIndex(jid); if (ji < 0) { console.warn('unknown journey', jid); return; }
  const J = M.JOURNEYS[ji]; li = clamp(li | 0, 0, J.legs.length - 1);
  const L = J.legs[li];
  S = Object.assign({ maxHp: 3, dmg: 1, fireRate: 4, guns: 1, shieldCd: 0, superGain: 1, superDur: 2.2, superPassive: 0, follow: 10, magnet: 0, tier: 0, coinMult: 1, superStart: 0 }, safe(M.stats) || {});
  S.bot = Object.assign({ lv: 0, rate: 0, dmg: 0, vacuum: 0, double: false }, S.bot || {});
  if (S.bot.double == null) S.bot.double = S.bot.lv >= 5;
  safe(M.startRun);
  run = {
    jid, ji, li, J, L, last: li === J.legs.length - 1,
    elapsed: 0, ending: false, endT: 0, ended: false,
    score: 0, kills: 0, coins: 0, hits: 0, meteors: 0, supers: 0,
    spawnT: 1.6, nextMeteor: L.firstMeteor != null ? L.firstMeteor : 20, hitTimes: [], mercyT: 0, coinChain: 0, coinChainT: 0,
    deadT: 0, lowSaid: false,
  };
  objs.length = meteors.length = bolts.length = picks.length = parts.length = texts.length = lasers.length = 0;
  ship = { x: SHIP_X, y: 210, ty: 210, py: 210, vy: 0, tilt: 0, hp: S.maxHp, maxHp: S.maxHp, inv: 0, alive: true,
    shieldUp: S.shieldCd > 0, shieldT: 0, fireT: 0.3, rapidT: 0, sc: 1, vx: 0, thrust: 0.6 };
  bot = { x: SHIP_X - 60, y: 160, vx: 0, vy: 0, mood: 'normal', moodT: 0, say: '', sayT: 0, sayMax: 1, lastSay: -99, zapT: 1, startSay: 0.9 };
  superF = clamp(S.superStart || 0, 0, 1); superWasFull = superF >= 1; beamT = 0; beamMax = Math.max(0.5, S.superDur || 2.2);
  comboN = 0; comboT = 0; mult = 1; lastMult = 1; scroll = 0; shakeA = 0; hitStop = 0; flashA = 0; arrive = null;
  dragId = null;
  st = 'play'; stT = 0; playT = 0;
  safe(UI.hideMenus); safe(UI.showPause, false); safe(UI.showHud, true, jid, li);
  const legName = tt(`leg_${jid}_${li}`);
  if (legName) safe(UI.note, legName);
  wakeOn();
  if (actx) { nextNote = actx.currentTime + 0.05; mStep = 0; }
  try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {}
}

function goMenu() {
  flushTrack();
  st = 'menu'; stT = 0; run = null; arrive = null; beamT = 0;
  objs.length = meteors.length = bolts.length = picks.length = parts.length = texts.length = lasers.length = 0;
  wakeOff();
  safe(UI.showHud, false); safe(UI.showPause, false); safe(UI.showMenu);
}

function setPause(p) {
  if (p) {
    if (st !== 'play') return;
    st = 'pause'; dragId = null; keys.up = keys.down = false; wakeOff(); safe(UI.showPause, true);
  } else {
    if (st !== 'pause') return;
    if (safe(UI.isBlocking)) return; // portrait overlay still up
    st = 'play'; safe(UI.showPause, false); wakeOn();
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
  const z = SIZES[size], L = run.L;
  const r = kind === 'crystal' ? 24 : z.r;
  const sp = L.speed * (size === 'L' ? rnd(0.75, 0.95) : size === 'S' ? rnd(1, 1.3) : rnd(0.85, 1.15)) * (kind === 'ice' ? 1.12 : 1);
  return {
    type: 'rock', kind, size, x, y, r, hp: kind === 'crystal' ? 4 : z.hp, pts: kind === 'crystal' ? 40 : z.pts, sg: kind === 'crystal' ? 0.06 : z.sg,
    vx: -sp, vy: rnd(-16, 16), rot: rnd(0, TAU), vr: rnd(-1.4, 1.4) * (14 / r), seed: Math.floor(Math.random() * 9999), flash: 0, dead: false, killT: 0,
  };
}
function makeJunk(kind, x, y) {
  const j = JUNK[kind], L = run.L;
  return {
    type: 'junk', kind, size: 'M', x, y, by: y, r: j.r, hp: j.hp, pts: j.pts, sg: j.sg,
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
  if (objs.length < 60) spawnKind(weighted(L.mix || {}));
}
function meteorSpawner() {
  const L = run.L;
  if (debug.noSpawn || !L.meteor || !(L.meteor[1] > 0)) return;
  if (run.elapsed < run.nextMeteor) return;
  const warn = L.warn || 1.1;
  if (run.elapsed + warn > L.dur - 1.2) { run.nextMeteor = 1e9; return; }
  spawnMeteor();
  run.nextMeteor = run.elapsed + rnd(L.meteor[0], L.meteor[1]);
}
function spawnMeteor(y) {
  const warn = (run && run.L.warn) || 1.1;
  if (y == null) {
    const near = Math.random() < 0.3 ? 0 : rnd(-1, 1) * rnd(15, 70); // near the ship, but not always exactly on it
    y = clamp(ship.y + near, Y_MIN + 6, Y_MAX - 6);
  }
  meteors.push({ x: W + 90, y, r: 19, vx: -950, seed: Math.floor(Math.random() * 9999), phase: 'warn', wt: 0, warn, counted: false, hitShip: false, dead: false });
  sfx.warn(); mood('alert', warn + 0.6); say('bot_meteor', true);
}

// ---------------------------------------------------------------------------------------------
// Combat
function damage(o, d, src) {
  if (o.dead) return;
  o.hp -= d; o.flash = 1;
  if (o.hp <= 0) kill(o, src);
  else sfx.rockhit();
}
const scoringSrc = src => src === 'bolt' || src === 'bot' || src === 'beam' || src === 'blast';
function shardKind(o) { return o.type === 'junk' ? 'metal' : o.kind; }
function kill(o, src) {
  if (o.dead) return;
  o.dead = true;
  const scoring = scoringSrc(src);
  const big = o.size === 'L' || o.kind === 'tank';
  if (scoringSrc(src)) { if (o.kind === 'crystal') pend.crystals++; if (o.type === 'junk') pend.junk++; if (o.kind === 'tank') pend.tanks++; }
  if (o.kind === 'tank') {
    let chained = false;
    explode(o.x, o.y, o.r + 10, { vx: o.vx, shard: 'metal', fire: true, ringCol: '#ffb347', spark: '#ffcf6a' });
    ring(o.x, o.y, 110, '#ff9a3c', 0.5);
    sfx.tank(); shake(8); hitStopMs(40);
    for (const n of objs) {
      if (n === o || n.dead || n.killT > 0) continue;
      const dx = n.x - o.x, dy = n.y - o.y, d = Math.hypot(dx, dy);
      if (d < 95 + n.r) { n.killT = 0.07 + d / 1100; chained = true; } // delayed chain reaction looks great
    }
    if (chained && src === 'blast') say2('f_chain', o.x, o.y - 24, '#ffb347', 16);
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
  comboT = 1.2;
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
  superF = Math.min(1, superF + (g || 0.04) * (S.superGain || 1));
  checkSuperFull();
}
function checkSuperFull() {
  if (superF >= 1 && !superWasFull) { superWasFull = true; sfx.superready(); mood('happy', 1.2); if (ship && st === 'play') say2('f_superReady', ship.x + 40, ship.y + 42, '#ffe066', 17); }
}
const DROPS = Object.assign({ coin: { rockS: 0.12, rockM: 0.3, rockL: 0.55, ice: 0.25, crystal: 0, panel: 0.4, tank: 0.3, drone: 0.6, dish: 0.5 }, crystal: [3, 6], crystalValue: 2, pickup: 0.05 }, M.DROPS || {});
function dropKey(o) { return o.type === 'junk' ? o.kind : o.kind === 'rock' ? 'rock' + o.size : o.kind; }
function drops(o) {
  let n = 0, val = 1;
  if (o.kind === 'crystal') { const c = DROPS.crystal || [3, 6]; n = c[0] + Math.floor(Math.random() * (c[1] - c[0] + 1)); val = DROPS.crystalValue || 2; }
  else n = Math.random() < ((DROPS.coin || {})[dropKey(o)] || 0) ? 1 : 0;
  for (let i = 0; i < n; i++) addPick('coin', o.x, o.y, val);
  const pc = (DROPS.pickup || 0.05) * (o.size === 'S' ? 0.25 : 1);
  if (Math.random() < pc) {
    const opts = ['cell', 'rapid', 'rapid', 'cell'];
    if (ship.hp < ship.maxHp) opts.push('repair', 'repair');
    if (!ship.shieldUp) opts.push('shield');
    addPick(pick(opts), o.x, o.y, 1);
  }
}
function addPick(kind, x, y, val) {
  if (picks.length >= 80) return;
  const a = rnd(0, TAU), v = rnd(30, 110);
  picks.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, val, ph: rnd(0, 10), pulled: false, life: 14 });
}
function collect(p) {
  if (p.kind === 'coin') {
    run.coins += p.val;
    run.coinChain = run.coinChainT > 0 ? run.coinChain + 1 : 0; run.coinChainT = 0.5;
    sfx.coin(run.coinChain);
    for (let i = 0; i < Math.ceil(3 * FX); i++) addP(P_SPARKLE, p.x + rnd(-6, 6), p.y + rnd(-6, 6), rnd(-40, 40), rnd(-50, 10), rnd(0.25, 0.45), rnd(4, 7), '#ffe066', 20);
    return;
  }
  sfx.pickup(); pend.pickups++;
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

function hurtShip(dmg) {
  if (!ship.alive || ship.inv > 0 || debug.invincible || st !== 'play') return false;
  if (ship.shieldUp) {
    ship.shieldUp = false; ship.shieldT = S.shieldCd || 0; ship.inv = 0.7;
    sfx.shieldpop(); ring(ship.x, ship.y, 54, '#9ff0ff', 0.4); sparks(ship.x, ship.y, 14, '#9ff0ff', 180);
    say2('f_shieldPop', ship.x + 30, ship.y + 40); say('bot_shield');
    shake(4); buzz(25); return true;
  }
  ship.hp -= dmg; run.hits++;
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
  mood('sad', 9); say('bot_lose', true);
  st = 'dead'; stT = 0; run.deadT = 0;
}
function doSuper() {
  if (st !== 'play' || !ship || !ship.alive || beamT > 0 || superF < 1) return false;
  superF = 0; superWasFull = false; beamMax = Math.max(0.5, S.superDur || 2.2); beamT = beamMax; run.supers++;
  sfx.beam(); shake(12); flashA = REDUCED ? 0 : 0.35; mood('happy', beamMax);
  say('bot_super', true);
  return true;
}
function beamRect() { return { x0: ship.x + 18, x1: W + 80, y0: ship.y - 35, y1: ship.y + 35 }; }
const circRect = (x, y, r, b) => { const cx = clamp(x, b.x0, b.x1), cy = clamp(y, b.y0, b.y1); return (x - cx) ** 2 + (y - cy) ** 2 < r * r; };

// ---------------------------------------------------------------------------------------------
// Arrival / end of leg
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
function endRun(win) {
  if (!run || run.ended) return;
  run.ended = true;
  const r = { score: run.score, kills: run.kills, coins: run.coins, hits: run.hits, meteors: run.meteors, supers: run.supers, noHit: run.hits === 0 };
  flushTrack();
  let res = {};
  try { res = (win ? M.finishLeg(run.jid, run.li, r) : M.failLeg(run.jid, run.li, r)) || {}; } catch (e) { console.error(e); }
  lastWin = win; lastRun = { jid: run.jid, li: run.li };
  st = 'over'; stT = 0; wakeOff(); dragId = null;
  safe(UI.showHud, false);
  const mine = run;
  const show = () => { if (st !== 'over' || run !== mine) return; safe(UI.showResult, Object.assign({}, res, { win, jid: mine.jid, li: mine.li, run: r })); };
  // Ads hook: window.aboodAfterRun = async ({ score, coins, distance, sweets }) => {...}; results appear when it settles (15 s max).
  const hook = window.aboodAfterRun;
  if (typeof hook === 'function') Promise.race([Promise.resolve().then(() => hook({ score: r.score, coins: r.coins, distance: r.score, sweets: r.coins, win, jid: mine.jid, li: mine.li })), new Promise(rs => setTimeout(rs, 15000))]).catch(() => {}).finally(show);
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
  const L = run.L, active = st === 'play' || st === 'arrive' || st === 'dead';
  if (active) playT += dt;
  let spd = L.speed;
  if (st === 'arrive') spd *= 1 + easeOut(arrive.T / 1.6) * 3.5;
  if (st === 'over') spd *= 0.6;
  scroll += spd * dt;

  if (st === 'play') {
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
  }
  if (st === 'dead') { run.deadT += dt; if (run.deadT >= 1.6) endRun(false); }
  if (st === 'arrive') { arrive.T += dt; if (arrive.T >= arrive.dur) endRun(true); }

  updateShip(dt);
  updateObjs(dt);
  updateMeteors(dt);
  updatePicks(dt);
  updateBot(dt);
  updateParts(dt);
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboN = 0; mult = 1; lastMult = 1; } }
  run.coinChainT -= dt;
  shakeA *= Math.exp(-9 * dt); if (shakeA < 0.2) shakeA = 0;
  flashA = Math.max(0, flashA - dt * 1.6);
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
    // auto fire
    if (!run.ending || run.endT < 3.5) {
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
  // engine trail sparks
  if ((st === 'play' || st === 'arrive') && Math.random() < 0.9 * FX) {
    const sc = ship.sc;
    const tr = S.tier || 0, ex = (37 + tr * 0.9) * (safe(A.shipScale, tr) || 1) + 4;
    addP(P_FIRE, ship.x - ex * sc, ship.y + rnd(-3, 3) * sc, -160 - rnd(0, 140) - (st === 'arrive' ? 300 : 0), rnd(-14, 14), rnd(0.14, 0.26), rnd(5, 8) * sc, pick(['#ffb04a', '#ff8a2a', '#ffd27a']), 40);
  }
}
function fire() {
  const pts = gunPoints(), lv = safe(M.level, 'blaster') || 0;
  for (const g of pts) {
    if (bolts.length >= 100) break;
    const a = g.angle || 0, v = 640;
    bolts.push({ x: ship.x + (g.dx || 30) * ship.sc, y: ship.y + (g.dy || 0) * ship.sc, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a, dmg: S.dmg || 1, lv, dead: false });
  }
  sfx.shoot();
}
function updateObjs(dt) {
  const shR = shipR();
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x > W + 20 || b.y < -20 || b.y > H + 20) { b.dead = true; continue; }
    for (let j = 0; j < objs.length; j++) {
      const o = objs[j]; if (o.dead) continue;
      const rr = o.r + 4, dx = b.x - o.x, dy = b.y - o.y;
      if (dx * dx + dy * dy < rr * rr) {
        b.dead = true;
        sparks(b.x, b.y, 2.5, o.kind === 'ice' ? '#d6f6ff' : '#ffd27a', 110, -60);
        damage(o, b.dmg, 'bolt');
        break;
      }
    }
    if (b.dead) continue;
    for (const m of meteors) { // meteors shrug bolts off (only the beam breaks them)
      if (m.phase !== 'go' || m.dead) continue;
      const dx = b.x - m.x, dy = b.y - m.y, rr = m.r + 4;
      if (dx * dx + dy * dy < rr * rr) { b.dead = true; sparks(b.x, b.y, 2, '#ffcf6a', 120, -200); break; }
    }
  }
  compact(bolts, b => !b.dead);
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]; if (o.dead) continue;
    if (o.killT > 0) { o.killT -= dt; if (o.killT <= 0) { kill(o, 'blast'); continue; } }
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
    if (ship.alive && st === 'play' && !m.hitShip) {
      const rr = m.r * 0.8 + shR, dx = m.x - ship.x, dy = m.y - ship.y;
      if (dx * dx + dy * dy < rr * rr && ship.inv <= 0 && !debug.invincible) { m.hitShip = true; hurtShip(2); }
    }
    if (!m.counted && m.x + m.r < ship.x - shR) {
      m.counted = true;
      if (!m.hitShip && ship.alive && st === 'play') {
        run.meteors++; safe(M.track, 'meteor', 1);
        if (Math.abs(m.y - ship.y) < 60) { run.score += 20; floatText('+20', ship.x, ship.y - 34, '#9ff0ff', 16); }
        mood('happy', 1);
      }
    }
    if (m.x < -420) m.dead = true;
  }
  compact(meteors, m => !m.dead);
}
function updatePicks(dt) {
  const L = run.L, mag = Math.max(0, S.magnet || 0), vac = S.bot.lv >= 1 ? Math.max(0, S.bot.vacuum || 0) : 0;
  const tx = ship.x, ty = ship.y;
  for (const p of picks) {
    if (p.dead) continue;
    p.life -= dt; p.ph += dt;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    let pull = p.pulled || (ship.alive && d < mag);
    if (!pull && vac > 0 && bot && Math.hypot(bot.x - p.x, bot.y - p.y) < vac) pull = true;
    if (pull && ship.alive && st !== 'dead' && st !== 'over') {
      p.pulled = true;
      const sp = 260 + 600 * (1 - Math.min(1, d / 220)) + (st === 'arrive' ? 500 : 0);
      p.vx += (dx / d * sp - p.vx) * Math.min(1, dt * 8); p.vy += (dy / d * sp - p.vy) * Math.min(1, dt * 8);
    } else {
      p.vx += (-L.speed * 0.7 - p.vx) * Math.min(1, dt * 1.5); p.vy *= Math.exp(-2 * dt);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (ship.alive && (st === 'play' || st === 'arrive') && d < 26 * Math.max(0.5, ship.sc)) { p.dead = true; collect(p); continue; }
    if (p.x < -30 || p.life <= 0) p.dead = true;
  }
  compact(picks, p => !p.dead);
}
function updateBot(dt) {
  const tx = (ship.alive ? ship.x : ship.x + 10) - 50 * ship.sc, ty = Math.max(26, (ship.alive ? ship.y : ship.y) - 46 * ship.sc);
  const k = 38, dmp = 2 * Math.sqrt(k) * 0.75;
  bot.vx += ((tx - bot.x) * k - bot.vx * dmp) * dt; bot.vy += ((ty - bot.y) * k - bot.vy * dmp) * dt;
  bot.x += bot.vx * dt; bot.y += bot.vy * dt + Math.sin(t * 2.4) * 6 * dt;
  if (bot.moodT > 0) { bot.moodT -= dt; if (bot.moodT <= 0) bot.mood = 'normal'; }
  if (bot.sayT > 0) bot.sayT -= dt;
  for (const l of lasers) { l.life -= dt; if (l.o && !l.o.dead) { l.x2 = l.o.x; l.y2 = l.o.y; } }
  compact(lasers, l => l.life > 0);
  const B = S.bot;
  if (st === 'play' && ship.alive && B.lv >= 1 && B.rate > 0) {
    bot.zapT -= dt;
    if (bot.zapT <= 0) {
      bot.zapT = 1 / B.rate;
      const shots = B.double ? 2 : 1, used = [];
      for (let s = 0; s < shots; s++) {
        let best = null, bd = 1e9;
        for (const o of objs) {
          if (o.dead || o.x > W - 6 || o.x < ship.x - 20 || used.includes(o)) continue;
          const d = (o.x - bot.x) ** 2 + (o.y - bot.y) ** 2; if (d < bd) { bd = d; best = o; }
        }
        if (!best) break;
        used.push(best);
        lasers.push({ x1: bot.x + 8, y1: bot.y, x2: best.x, y2: best.y, o: best, life: 0.14, max: 0.14 });
        sparks(best.x, best.y, 3, '#9ff0ff', 90);
        damage(best, B.dmg || 1, 'bot');
      }
      if (used.length) sfx.zap();
    }
  }
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
  if (st === 'menu' || st === 'boot' || !run) { safe(A.drawStationScene, c, W, H, t); return; }
  drawWorld(c);
}

function drawWorld(c) {
  const J = run.J, L = run.L;
  const prog = clamp(run.elapsed / L.dur, 0, 1);
  try { A.drawSpace(c, W, H, t, scroll, J.theme, prog, J.from, J.planet); } catch (e) { c.fillStyle = '#0b1030'; c.fillRect(0, 0, W, H); errOnce('drawSpace', e); }
  if (arrive && arrive.last) drawArrivalPlanet(c, J);
  // shaken play layer
  let sx = 0, sy = 0;
  if (shakeA > 0 && !REDUCED) { sx = rnd(-1, 1) * shakeA; sy = rnd(-1, 1) * shakeA; }
  c.save(); c.translate(sx, sy);
  for (const m of meteors) if (m.phase === 'warn' && !m.dead) safe(A.drawWarning, c, W, m.y, m.wt / m.warn, t);
  for (const p of picks) {
    const bob = p.kind === 'coin' ? 0 : Math.sin(t * 4 + p.ph) * 3;
    if (p.life < 2 && Math.floor(p.life * 8) % 2) continue;
    safe(A.drawPickup, c, p.kind, p.x, p.y + bob, t + p.ph);
  }
  for (const o of objs) {
    if (o.dead) continue;
    if (o.type === 'rock') A.drawRock(c, { x: o.x, y: o.y, r: o.r, rot: o.rot, seed: o.seed, kind: o.kind, flash: o.flash, palette: o.kind === 'ice' ? (J.theme.ice || J.theme.rock) : J.theme.rock });
    else A.drawJunk(c, { x: o.x, y: o.y, s: 1, rot: o.rot, seed: o.seed, kind: o.kind, flash: o.flash, t });
  }
  drawParts(c, false);
  for (const b of bolts) A.drawBolt(c, b.x, b.y, 'blaster', b.lv, b.ang);
  for (const m of meteors) if (m.phase === 'go' && !m.dead) A.drawMeteor(c, { x: m.x, y: m.y, r: m.r, vx: m.vx, seed: m.seed }, t);
  if (beamT > 0 && ship.alive) A.drawBeam(c, ship.x + 22, ship.y, W, clamp(beamT / beamMax, 0, 1), t);
  for (const l of lasers) A.drawBotLaser(c, l.x1, l.y1, l.x2, l.y2, l.life / l.max);
  drawParts(c, true);
  if (ship.alive) drawShipNow(c);
  A.drawNabeeh(c, bot.x, bot.y, 0.5, { t, mood: bot.mood, talk: bot.sayT > 0, laser: lasers.length > 0 });
  if (bot.sayT > 0 && bot.say) {
    const age = bot.sayMax - bot.sayT, f = Math.min(1, age / 0.15, bot.sayT / 0.25);
    A.drawBubble(c, bot.x + 6, bot.y - 14, bot.say, f, W);
  }
  drawTexts(c);
  c.restore();
  // low hull: soft red edge from the left, slow pulse (no strobe)
  if (ship.alive && ship.hp === 1 && st === 'play') {
    const a = 0.16 + 0.08 * Math.sin(t * 2.5);
    const g = c.createLinearGradient(0, 0, 130, 0); g.addColorStop(0, `rgba(200,32,43,${a})`); g.addColorStop(1, 'rgba(200,32,43,0)');
    c.fillStyle = g; c.fillRect(0, 0, 130, H);
  }
  if (flashA > 0.01) { c.globalAlpha = flashA; c.fillStyle = '#fff6e0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  if (arrive && arrive.last && arrive.T > arrive.dur - 0.8) { c.globalAlpha = clamp((arrive.T - (arrive.dur - 0.8)) / 0.8, 0, 1) * 0.5; c.fillStyle = '#fff6e0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
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
  A.drawShip(c, 0, 0, { t, tier: S.tier || 0, guns: S.guns || 1, tilt: ship.tilt, thrust: ship.thrust, suit: S.suit, hurt: ship.inv > 0 ? ship.inv / 1.4 : 0, shield: ship.shieldUp ? 1 : 0, beam: beamT > 0 });
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
// HUD
function hudNow() {
  if (!run || !ship || (st !== 'play' && st !== 'pause' && st !== 'arrive' && st !== 'dead')) return;
  const sh = ship.shieldUp ? 1 : S.shieldCd > 0 ? clamp(1 - ship.shieldT / S.shieldCd, 0, 0.99) : 0;
  safe(UI.hud, {
    hp: ship.hp, maxHp: ship.maxHp, score: run.score, coins: run.coins,
    prog: Math.round(clamp(run.elapsed / run.L.dur, 0, 1) * 200) / 200,
    superF: Math.round(superF * 100) / 100, shield: Math.round(sh * 50) / 50, combo: mult,
    rapid: ship.rapidT > 0 ? Math.round(ship.rapidT / 6 * 50) / 50 : 0,
  });
}

// ---------------------------------------------------------------------------------------------
// Loop: frame cap 60 in flight / 30 elsewhere, dt clamp, quality auto-downgrade
let last = 0, fAcc = 0, fN = 0, slowWins = 0, nextDue = 0, running = false;
// Flights run at 60 fps; the battery saver setting caps them at 30 for phones that run hot. Menus are always 30.
let fpsCap = (() => { try { return (safe(M.settings) || {}).fps === 30 ? 30 : 60; } catch (e) { return 60; } })();
function perf(raw) {
  if (st !== 'play' || raw > 0.1) return;
  fAcc += raw; fN++;
  if (fN >= 90) {
    const avg = fAcc / fN; fAcc = 0; fN = 0;
    // frames well over budget for the chosen rate (60 or 30 fps)
    if (avg > 1.4 / fpsCap) { if (++slowWins >= 2 && qLevel < QDPR.length - 1) { qLevel++; slowWins = 0; resize(); safe(A.setArtQuality, qLevel); GLOWS.clear(); SHARDS.clear(); } } else slowWins = 0;
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  const fast = st === 'play' || st === 'arrive' || st === 'dead';
  const gap = 1000 / (fast ? fpsCap : 30);
  if (now < nextDue - 2) return;
  nextDue = now - nextDue > gap ? now + gap : nextDue + gap;
  const raw = last ? (now - last) / 1000 : 0.016; last = now;
  perf(raw);
  if (st === 'play' && safe(UI.isBlocking)) setPause(true);
  // at 30 fps (or a slow frame) run two half steps, so fast meteors can't skip past the ship
  const step = clamp(raw, 0, 1 / 20) * debug.timeScale, n = step > 1 / 45 ? 2 : 1;
  try { for (let i = 0; i < n; i++) update(step / n); } catch (e) { errOnce('update', e); }
  try { render(); } catch (e) { errOnce('render', e); }
  hudNow();
  music();
}

// ---------------------------------------------------------------------------------------------
// UI hooks
const hooks = {
  onLaunch(jid, li) { unlockAudio(); tryFullscreen(); start(jid, li); },
  onPause() { setPause(true); },
  onResume() { setPause(false); },
  onQuit() { goMenu(); },
  onRetry() { const r = lastRun || (run && { jid: run.jid, li: run.li }); if (r) start(r.jid, r.li); else goMenu(); },
  onNext() {
    const r = lastRun;
    let n = null;
    if (r && lastWin) {
      const J = M.JOURNEYS[journeyIndex(r.jid)];
      if (J && r.li + 1 < J.legs.length && safe(M.canPlay, r.jid, r.li + 1) !== false) n = { jid: r.jid, li: r.li + 1 };
    }
    if (!n) n = safe(M.nextPlayable) || r;
    if (n) start(n.jid, n.li); else goMenu();
  },
  onSuper() { doSuper(); },
  onMute() { unlockAudio(); setMuted(!muted); safe(M.setSetting, 'muted', muted); return muted; },
  isMuted() { return muted; },
  onFps() { fpsCap = fpsCap === 30 ? 60 : 30; safe(M.setSetting, 'fps', fpsCap); nextDue = 0; return fpsCap; },
  getFps() { return fpsCap; },
  sfx(name) { if (name === 'tick') sfxT('coin', 0.04, 1.3, 0.5); else if (name === 'chime') sfx.pickup(); else if (SND[name]) play(name); },
};

// ---------------------------------------------------------------------------------------------
// Boot: loader → fonts → art → sounds → menu
async function boot() {
  try { const s = safe(M.settings) || {}; muted = !!s.muted; } catch (e) {}
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
  goMenu(); t = 0;
  if (!running) { running = true; requestAnimationFrame(loop); }
}

// Test / tooling hook
window.__game = {
  state: () => st,
  start: (j, l) => start(j, l),
  debug: Object.assign(debug, {
    skip() { if (st === 'play' && run) { run.elapsed = run.L.dur; run.ending = true; beginArrive(); return true; } return false; },
    win() { if (run && !run.ended) { endRun(true); return true; } return false; },
    die() { if (st === 'play' && ship && ship.alive) { ship.hp = 0; die(); return true; } return false; },
    fillSuper() { superF = 1; checkSuperFull(); },
    super: () => { superF = 1; checkSuperFull(); return doSuper(); },
    spawn(kind = 'rockM', y) { if (!run) return null; return spawnKind(kind, y); },
    meteor(y) { if (run && st === 'play') spawnMeteor(y); },
    hurt(n = 1) { if (ship) return hurtShip(n); },
    pickup(kind = 'coin') { if (run) addPick(kind, ship.x + 120, ship.y, 1); },
    setY(y) { if (ship) { ship.ty = ship.y = clamp(y, Y_MIN, Y_MAX); } },
    info() {
      return run ? { st, elapsed: run.elapsed, dur: run.L.dur, objs: objs.length, meteors: meteors.length, bolts: bolts.length, picks: picks.length, parts: parts.length,
        hp: ship.hp, maxHp: ship.maxHp, shield: ship.shieldUp, superF, beamT, score: run.score, kills: run.kills, coins: run.coins, hits: run.hits,
        dodged: run.meteors, supers: run.supers, mult, y: ship.y, qLevel, W, H, botY: bot.y, botSay: bot.sayT > 0 ? bot.say : '' } : { st, qLevel, W, H };
    },
    sounds: () => Object.keys(SND), audio: () => actx && actx.state,
    run: () => run, ship: () => ship, quality: (q) => { if (q != null) { qLevel = clamp(q, 0, 3); resize(); safe(A.setArtQuality, qLevel); } return qLevel; },
  }),
};
window.__aboodMoon = Object.assign(window.__aboodMoon || {}, { state: () => st, start: (j, l) => start(j, l) });

boot();
