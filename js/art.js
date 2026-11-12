// js/art.js — Abood to the Moon · عبود إلى القمر
// Every canvas drawing and all sprite baking. No game state lives here.
// Everything is drawn in code, baked once into offscreen canvases (at BAKE× logical resolution so it stays
// crisp on high-DPR phones) and then only blitted each frame. All functions draw in logical units into a
// context the engine has already scaled.

export const INK = '#1c1530';
export const FONT = '"Baloo Bhaijaan 2", "Trebuchet MS", Tahoma, system-ui, sans-serif';
const TAU = Math.PI * 2;

// Safari < 16 has no roundRect
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  const rr = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
  };
  CanvasRenderingContext2D.prototype.roundRect = rr;
  if (typeof Path2D !== 'undefined' && !Path2D.prototype.roundRect) Path2D.prototype.roundRect = rr;
}

// ---------- small helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const sr = i => fract(Math.sin(i * 127.1 + 311.7) * 43758.5453);
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

function mk(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

// LRU cache; optional pixel budget for canvas entries ({c} or canvas values)
const pxOf = v => { const cv = v && (v.c || v.cv || v); return cv && cv.width ? cv.width * cv.height : 0; };
class LRU {
  constructor(max, budget = 0) { this.max = max; this.budget = budget; this.px = 0; this.m = new Map(); }
  get(k) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k, v) {
    const old = this.m.get(k); if (old !== undefined) { this.px -= pxOf(old); this.m.delete(k); }
    this.m.set(k, v); this.px += pxOf(v);
    while (this.m.size > 1 && (this.m.size > this.max || (this.budget && this.px > this.budget))) { const k0 = this.m.keys().next().value; this.px -= pxOf(this.m.get(k0)); this.m.delete(k0); }
    return v;
  }
  clear() { this.m.clear(); this.px = 0; }
  get size() { return this.m.size; }
}
// Hot-path cache: reads only stamp a use counter (no Map reorder, no allocation). Inserts evict the least
// recently used entries (a scan, only when over the count or pixel budget). Entries are objects; their pixel
// size can grow later (rock rotation frames) through add().
class Cache {
  constructor(max, budget = 0) { this.max = max; this.budget = budget; this.px = 0; this.m = new Map(); this.clock = 0; }
  get(k) { const e = this.m.get(k); if (e !== undefined) e._u = ++this.clock; return e; }
  set(k, e) {
    const old = this.m.get(k); if (old !== undefined) { this.px -= old._px || 0; this.m.delete(k); }
    e._u = ++this.clock; e._px = pxOf(e); this.m.set(k, e); this.px += e._px; this.trim(e); return e;
  }
  add(e, dpx) { e._px = (e._px || 0) + dpx; this.px += dpx; this.trim(e); }
  trim(keep) {
    while (this.m.size > 1 && (this.m.size > this.max || (this.budget && this.px > this.budget))) {
      let bk, bu = Infinity; for (const [k, v] of this.m) if (v !== keep && v._u < bu) { bu = v._u; bk = k; }
      if (bk === undefined) break; this.px -= this.m.get(bk)._px || 0; this.m.delete(bk);
    }
  }
  clear() { this.m.clear(); this.px = 0; }
  get size() { return this.m.size; }
}

// ---------- reduced motion (engine-standards §7: no fast strobe; gameplay identical) ----------
let REDUCED = false;
try {
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-reduced-motion: reduce)'); REDUCED = !!mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', e => { REDUCED = !!e.matches; });
  }
} catch (_) { /* no matchMedia */ }
export function setReducedMotion(b) { REDUCED = !!b; }
export const reducedMotion = () => REDUCED;
// a 0..1 blink wave at hz that never strobes faster than 2 Hz (and swings less) under reduced motion
const blinkWave = (t, hz, ph = 0) => REDUCED ? 0.5 + 0.2 * Math.sin((t * Math.min(hz, 1) + ph) * TAU) : 0.5 + 0.5 * Math.sin((t * hz + ph) * TAU);

// colours
const HX = new Map();
let _cc = null;
function rgbOf(col) {
  if (Array.isArray(col)) return col;
  let r = HX.get(col); if (r) return r;
  let s = String(col || '#ffffff').trim();
  if (s[0] !== '#' && !/\d/.test(s)) { if (!_cc) _cc = mk(1, 1).getContext('2d'); _cc.fillStyle = '#fff'; _cc.fillStyle = s; s = _cc.fillStyle; }
  if (s[0] === '#') { let h = s.slice(1); if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); r = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  else { const m = s.match(/[\d.]+/g) || [255, 255, 255]; r = [+m[0], +m[1], +m[2]]; }
  HX.set(col, r); return r;
}
const rgba = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (a, k) => [clamp(a[0] * k, 0, 255), clamp(a[1] * k, 0, 255), clamp(a[2] * k, 0, 255)];
const css = (col, al = 1) => rgba(rgbOf(col), al);
const lighten = (col, k) => rgba(mixc(rgbOf(col), [255, 255, 255], k));
const darken = (col, k) => rgba(shade(rgbOf(col), 1 - k));

// ---------- quality ----------
let Q = 0, BAKE = 2;
// ROCKS holds rock bodies plus their 16 lit rotation frames (one pixel budget for both, evicted together).
// DISC holds planet discs: one canvas per (planet, half-octave radius class), re-rendered in place.
const SPR = new LRU(320), ROCKS = new Cache(150, 13e6), DISC = new LRU(12, 3.6e6), RIV = new LRU(48, 6e6);
export function setArtQuality(q) {
  q = clamp(Math.round(+q || 0), 0, 3); if (q === Q) return; Q = q;
  const nb = [2, 2, 1.5, 1.2][q];
  ROCKS.budget = [13e6, 10e6, 6.5e6, 4.5e6][q]; ROCKS.trim(null);
  if (nb !== BAKE) { BAKE = nb; SPR.clear(); ROCKS.clear(); DISC.clear(); RIV.clear(); STARS = null; STB.clear(); EB.clear(); }
}
export const artQuality = () => Q;

// bake(): draw fn(g) in local units inside box (x0,y0,w,h) at res px per unit; cached by key.
function bake(key, x0, y0, w, h, res, fn, cache = SPR) {
  let e = cache.get(key); if (e) return e;
  const cv = mk(w * res, h * res), g = cv.getContext('2d');
  g.scale(cv.width / w, cv.height / h); g.translate(-x0, -y0); g.lineJoin = 'round'; g.lineCap = 'round';
  fn(g);
  e = { c: cv, x0, y0, w, h }; cache.set(key, e); return e;
}
// draw a baked entry at (x,y) with optional uniform scale
function blit(c, e, x, y, s = 1) { c.drawImage(e.c, x + e.x0 * s, y + e.y0 * s, e.w * s, e.h * s); }
// white silhouette copy of a baked entry (hit flash)
function whiteOf(e) {
  if (e.white) return e.white;
  const cv = mk(e.c.width, e.c.height), g = cv.getContext('2d');
  g.drawImage(e.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  e.white = cv; return cv;
}
// scale bucket so a sprite baked for scale s stays sharp: steps of √2
const sBucket = s => Math.pow(2, Math.ceil(Math.log2(Math.max(0.2, s)) * 2) / 2);

// ---------- noise (seamless 3D value noise; sampling on spheres/cylinders gives tileable textures) ----------
const PERM = new Uint8Array(512), VAL = new Float32Array(256);
{
  const r = rng(1337), p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const tmp = p[i]; p[i] = p[j]; p[j] = tmp; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VAL[i] = r();
}
function n3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const a = VAL[PERM[AA]], b = VAL[PERM[BA]], c = VAL[PERM[AB]], d = VAL[PERM[BB]];
  const e = VAL[PERM[AA + 1]], f = VAL[PERM[BA + 1]], g = VAL[PERM[AB + 1]], h = VAL[PERM[BB + 1]];
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
function fbm(x, y, z, o = 5) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < o; i++) { s += a * n3(x, y, z); n += a; a *= 0.5; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.3; }
  return s / n;
}
const con = (v, k) => (v - 0.5) * k + 0.5; // contrast around 0.5 (value-noise fbm clusters near 0.5)

// separable 3-tap box blur, in place; wrapX keeps horizontally tileable images seamless
function blurRGBA(D, w, h, passes = 1, wrapX = false) {
  const tmp = new Float32Array(D.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const il = i > 0 ? i - 1 : wrapX ? w - 1 : 0, ir = i < w - 1 ? i + 1 : wrapX ? 0 : w - 1, k = (j * w + i) * 4, kl = (j * w + il) * 4, kr = (j * w + ir) * 4;
      for (let q = 0; q < 4; q++) tmp[k + q] = (D[kl + q] + D[k + q] * 2 + D[kr + q]) * 0.25;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ju = j > 0 ? j - 1 : 0, jd = j < h - 1 ? j + 1 : h - 1, k = (j * w + i) * 4, ku = (ju * w + i) * 4, kd = (jd * w + i) * 4;
      for (let q = 0; q < 4; q++) D[k + q] = (tmp[ku + q] + tmp[k + q] * 2 + tmp[kd + q]) * 0.25;
    }
  }
}
const yieldNow = () => new Promise(r => setTimeout(r, 0));

// ---------- shared small sprites ----------
const GL = new LRU(80);
// glow(col): 64×64 soft radial glow for additive particles (draw with 'lighter')
export function glow(col = '#ffbe64') {
  let cv = GL.get(col); if (cv) return cv;
  cv = mk(64, 64); const g = cv.getContext('2d'), a = rgbOf(col), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(a, 1)); gr.addColorStop(0.18, rgba(a, 0.7)); gr.addColorStop(0.45, rgba(a, 0.22)); gr.addColorStop(0.75, rgba(a, 0.06)); gr.addColorStop(1, rgba(a, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); GL.set(col, cv); return cv;
}
function glowAt(c, col, x, y, r, a = 1) { if (a <= 0) return; const ga = c.globalAlpha; c.globalAlpha = ga * a; c.drawImage(glow(col), x - r, y - r, r * 2, r * 2); c.globalAlpha = ga; }

let FLARE = null;
function flareSprite() { // four-point star flare, white, 96px for unit size 1 → drawn at size s
  if (FLARE) return FLARE;
  const cv = mk(96, 96), g = cv.getContext('2d'); g.translate(48, 48); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 22); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(220,235,255,.55)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = gr; g.fillRect(-48, -48, 96, 96);
  for (const [w, l, a] of [[2.4, 47, 0.9], [1, 47, 1]]) for (let k = 0; k < 2; k++) {
    g.save(); g.rotate(k * Math.PI / 2); const lg = g.createLinearGradient(-l, 0, l, 0);
    lg.addColorStop(0, 'rgba(210,230,255,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${a})`); lg.addColorStop(1, 'rgba(210,230,255,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(-l, 0); g.lineTo(0, -w); g.lineTo(l, 0); g.lineTo(0, w); g.closePath(); g.fill(); g.restore();
  }
  FLARE = cv; return cv;
}
function flareAt(c, x, y, s, a = 1, rot = 0) {
  if (a <= 0.01) return; const ga = c.globalAlpha; c.globalAlpha = ga * a;
  if (rot) { c.save(); c.translate(x, y); c.rotate(rot); c.drawImage(flareSprite(), -s, -s, s * 2, s * 2); c.restore(); }
  else c.drawImage(flareSprite(), x - s, y - s, s * 2, s * 2);
  c.globalAlpha = ga;
}

// ---------- faces: Abood (the old person() head) and Mozah (Run, Abood!'s girl head in a sports hijab) ----------
const SKIN = { skin: '#c98b5a', skinD: '#a8704a', skinL: '#e0a978' };
function headBase(c) {
  const hg = c.createRadialGradient(5, -55.5, 1, 2, -52, 10); hg.addColorStop(0, SKIN.skinL); hg.addColorStop(0.55, SKIN.skin); hg.addColorStop(1, SKIN.skinD);
  c.fillStyle = hg; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.arc(2, -52, 9, 0, TAU); c.fill(); c.stroke();
}
// cheek, nose, the big eye (+ Mozah's lashes), brow and mouth; mood: smile | grin | sad | o
function headFeatures(c, mood, blink, look, girl) {
  if (girl) { c.fillStyle = 'rgba(246,98,128,.46)'; c.beginPath(); c.arc(6.3, -48.4, 2.7, 0, TAU); c.fill(); }
  else { c.fillStyle = 'rgba(240,110,110,.35)'; c.beginPath(); c.arc(6.2, -48.6, 2.3, 0, TAU); c.fill(); }
  c.strokeStyle = SKIN.skinD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(10.6, -52.4); c.quadraticCurveTo(12.4, -50.6, 10.5, -49.6); c.stroke();
  c.fillStyle = INK; c.strokeStyle = INK;
  if (blink) {
    c.lineWidth = 1.3; c.beginPath(); c.moveTo(5.2, -52.4); c.quadraticCurveTo(7.3, -51.2, 9.6, -52.4); c.stroke();
    if (girl) { c.lineWidth = 1; c.beginPath(); c.moveTo(9.4, -52.5); c.lineTo(10.7, -53.6); c.moveTo(8.1, -51.9); c.lineTo(8.9, -53.2); c.stroke(); }
  } else if (mood === 'grin') {
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(5, -51.6); c.quadraticCurveTo(7.4, -55.2, 9.8, -51.8); c.stroke();
    if (girl) { c.lineWidth = 1; c.beginPath(); c.moveTo(9.6, -52.4); c.lineTo(11, -53.6); c.moveTo(8.6, -53.6); c.lineTo(9.4, -55); c.stroke(); }
  } else {
    const ly = mood === 'sad' ? 0.7 : 0;
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(7.3, -52.6, 2.6, 3.1, 0, 0, TAU); c.fill(); c.lineWidth = 0.9; c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(8 + look * 0.5, -52.3 + ly, 1.65, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(8.6 + look * 0.5, -53.1 + ly, 0.6, 0, TAU); c.fill();
    if (girl) { c.lineWidth = 1; c.beginPath(); c.moveTo(9.4, -55.2); c.lineTo(10.8, -56.6); c.moveTo(7.6, -55.7); c.lineTo(8.2, -57.3); c.stroke(); }
  }
  c.strokeStyle = INK; c.lineWidth = girl ? 1.3 : 1.6; c.beginPath();
  const bu = girl ? -0.5 : 0;
  if (mood === 'sad') { c.moveTo(4.6, -56.2 + bu); c.quadraticCurveTo(7.6, -58.2 + bu, 10.2, -58.4 + bu); }
  else if (mood === 'o') { c.moveTo(4.5, -56.6 + bu); c.quadraticCurveTo(7, -59.4 + bu, 10, -57.6 + bu); }
  else { c.moveTo(4.8, -56.6 + bu); c.quadraticCurveTo(7.5, -58.4 + bu, 10.2, -56.2 + bu); }
  c.stroke(); c.lineWidth = 1.5;
  if (mood === 'grin') {
    c.fillStyle = '#5a1414'; c.beginPath(); c.moveTo(4.8, -48.8); c.quadraticCurveTo(8, -48.2, 10.6, -49.4); c.quadraticCurveTo(9.6, -44.6, 6.6, -45.4); c.quadraticCurveTo(5, -46.2, 4.8, -48.8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e8607a'; c.beginPath(); c.ellipse(7.6, -45.9, 1.7, 0.9, 0, 0, TAU); c.fill();
  } else if (mood === 'sad') { c.beginPath(); c.arc(7.8, -45.6, 2.5, Math.PI + 0.55, TAU - 0.25); c.stroke(); }
  else if (mood === 'o') { c.fillStyle = '#5a1414'; c.beginPath(); c.ellipse(8.3, -47.4, 1.7, 2.2, 0, 0, TAU); c.fill(); }
  else { c.beginPath(); c.arc(7.6, -49.2, 2.7, 0.15, Math.PI - 0.55); c.stroke(); }
}
// head circle centred at (0,0), radius 9 (unit)
function aboodHead(c, mood = 'smile', blink = false, look = 0) {
  c.save(); c.translate(-2, 52); c.lineJoin = 'round'; c.lineCap = 'round';
  headBase(c);
  // short black hair (no ghutra under the helmet)
  c.fillStyle = '#2a1a13'; c.beginPath(); c.moveTo(-6.4, -48); c.arc(2, -52, 9.35, Math.PI * 0.86, Math.PI * 1.72);
  c.quadraticCurveTo(9.4, -60, 10, -57.4); c.quadraticCurveTo(5.5, -58.6, 2.6, -56); c.quadraticCurveTo(-0.6, -53.6, -1.8, -49.2); c.closePath(); c.fill();
  c.lineWidth = 1.2; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.1; c.beginPath(); c.arc(1, -53, 7, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
  // ear
  c.fillStyle = SKIN.skin; c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.ellipse(-1.4, -51.2, 2.1, 2.7, 0.15, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = SKIN.skinD; c.lineWidth = 0.8; c.beginPath(); c.arc(-1.2, -51.2, 1, -1, 1.4); c.stroke();
  headFeatures(c, mood, blink, look, false);
  c.restore();
}
// Mozah: the same face with lashes and rosier cheeks, framed by a bukhnag-style sports hood (Run, Abood!'s
// `sporthijab` path) that hides the hair and neck, with a thin gold embroidery line round the face
function mozahHead(c, mood = 'smile', blink = false, look = 0, hijab = '#6a4c9c') {
  c.save(); c.translate(-2, 52); c.lineJoin = 'round'; c.lineCap = 'round';
  headBase(c);
  headFeatures(c, mood, blink, look, true);
  // (the face opening is a little wider and higher than Run, Abood!'s so the brow and eye read inside the helmet)
  const hp = () => { c.beginPath(); c.moveTo(10.6, -59.6); c.quadraticCurveTo(9.6, -66, 0.5, -65.6); c.quadraticCurveTo(-11.4, -64.8, -11.6, -52.5);
    c.quadraticCurveTo(-12, -44, -9.5, -40.5); c.quadraticCurveTo(0, -38.6, 7.6, -41.6); c.quadraticCurveTo(6.4, -43.8, 4.2, -44.5);
    c.quadraticCurveTo(-1.2, -45.8, -2.2, -50.6); c.quadraticCurveTo(-1.8, -58.8, 10.6, -59.6); c.closePath(); };
  hp(); c.fillStyle = hijab; c.fill(); c.save(); c.clip();
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-14, -54, 8, 16);
  c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(-2, -40, 9, 2.6, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-6, -63); c.quadraticCurveTo(2, -65, 8, -60.4); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.16)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-8, -50); c.quadraticCurveTo(-7, -45, -9, -41.5); c.moveTo(-3.5, -47); c.quadraticCurveTo(-2.5, -43, -4, -40); c.stroke();
  c.restore();
  hp(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
  c.strokeStyle = '#e8b64a'; c.lineWidth = 1.15; c.beginPath(); c.moveTo(9.9, -58.9); c.quadraticCurveTo(-0.9, -58.2, -1.4, -50.6); c.quadraticCurveTo(-0.5, -45.6, 4.4, -44); c.stroke();
  c.fillStyle = '#e8b64a'; for (const [dx, dy] of [[-6, -42.3], [-1.5, -41.4], [3, -41.7]]) { c.beginPath(); c.arc(dx, dy, 0.75, 0, TAU); c.fill(); }
  c.restore();
}
const charHead = (c, girl, mood, blink, look, S) => girl ? mozahHead(c, mood, blink, look, S.hijab) : aboodHead(c, mood, blink, look);

// ---------- costumes (§5): body colours for both characters ----------
const cc = (main, shade, trim, trim2, visor, hijab) => ({ main, shade, trim, trim2, visor, hijab });
const AB_VIS = '#78aae1';
export const COSTUME_COLORS = {
  // Abood's free colours (and the v1 perk suits)
  white: cc('#f3f5fa', '#c4cbdb', '#e8572b', '#ffb347', AB_VIS, '#6a4c9c'),
  blue: cc('#9fd3f5', '#5f9fd0', '#e8572b', '#ffffff', AB_VIS, '#1d5aa8'),
  sand: cc('#ead0a2', '#c09c68', '#c8202b', '#fff3d6', AB_VIS, '#8a5a2a'),
  teal: cc('#24474f', '#152d33', '#2fd1c5', '#9af5ee', AB_VIS, '#1f6a60'),
  heat: cc('#ec6a35', '#b4401c', '#ffd34d', '#fff1c4', AB_VIS, '#f2f2f2'),
  pilot: cc('#25386a', '#16234a', '#e8b64a', '#ffe7a3', AB_VIS, '#f2c94c'),
  gold: cc('#f4cb55', '#c79329', '#fff3c4', '#e8572b', AB_VIS, '#fff4c8'),
  // Mozah's free colours
  lilac: cc('#dccbf2', '#a990d6', '#e2557e', '#ffd1e0', '#bfeaff', '#6a4c9c'),
  rose: cc('#f6c9d4', '#d897aa', '#b8326a', '#fff0f4', '#ffd6e6', '#8a2c55'),
  mint: cc('#bfeadb', '#85c4ad', '#1f8a78', '#f2fffb', '#c8fff2', '#1f6a60'),
  plum: cc('#3b2d5e', '#241a40', '#f2b8d0', '#ffe3ef', '#ffc8e0', '#c99a3a'),
  // perk costumes (both characters)
  link: cc('#e9fbff', '#9fd8e6', '#2fd1c5', '#ffffff', '#9ff0ff', '#1f7a86'),
  hope: cc('#f4f6fb', '#c4cbdb', '#2fd1c5', '#ffd27a', '#9ff0ff', '#1f6a60'),
  rover: cc('#e8e2cf', '#b8ad8f', '#3ccf7a', '#fffbe8', '#c8ffd8', '#2f6a3a'),
  magnet: cc('#d8dde8', '#a4adc2', '#e23b4a', '#ffffff', '#bfe0ff', '#8a1f2a'),
  comet: cc('#f7fbff', '#c8d8ec', '#4aa8ff', '#ffffff', '#e0f4ff', '#1d3b78'),
  crystal: cc('#cdbff5', '#9a86d8', '#6a3fd0', '#f0eaff', '#e6dcff', '#4a2a8a'),
  champ: cc('#c8202b', '#8f141d', '#ffd23f', '#fff3c4', '#ffe9a8', '#1d1b22'),
  ice: cc('#e8f6ff', '#b6d4ea', '#7fb2cc', '#ffffff', '#e0f8ff', '#4a7a9a'),
  star: cc('#1d2340', '#0f1430', '#ffe066', '#fff3c4', '#fff6c2', '#ffe066'),
};
export const SUIT_COLORS = COSTUME_COLORS; // v1 name
const costumeId = (id, girl) => COSTUME_COLORS[id] ? id : girl ? 'lilac' : 'white';
const suitCol = (id, girl) => COSTUME_COLORS[costumeId(id, girl)];
// engine trail colours per costume (mirrors meta COSTUMES fx.trail), used to tint drawShip's own flames
const DEF_TRAIL = ['#ffb04a', '#ff8a2a', '#ffd27a'];
export const COSTUME_TRAIL = {
  heat: ['#ff5a2a', '#ff8a2a', '#ffd27a'], pilot: ['#ffe066', '#f2b630', '#fff3c4'], link: ['#5ef2ff', '#9ff0ff', '#ffffff'],
  hope: ['#3ff2e0', '#ffd27a', '#fff6c2'], gold: ['#ffe066', '#ffd23f', '#fff3b0'], rover: ['#7dff9a', '#3ccf7a', '#e8ffe8'],
  magnet: ['#7fb4ff', '#4aa8ff', '#e0f0ff'], comet: ['#ffffff', '#bfeaff', '#7fd3ff'], crystal: ['#b9a6ff', '#8a6cff', '#e6dcff'],
  champ: ['#ff5a4a', '#ffd23f', '#fff3c4'], ice: ['#e8f8ff', '#bfeaff', '#ffffff'], star: ['#ffffff', '#fff3b0', '#ffe066'],
};
// costume auras (fx.aura), used when drawShip gets no explicit o.aura
// (mirrors meta COSTUMES fx.aura / fx.rings; used only when drawShip gets no o.aura / o.rings)
const COSTUME_AURA = { link: { col: '#5ef2ff', r: 40, a: 0.14 }, hope: { col: '#3ff2e0', r: 44, a: 0.14 }, gold: { col: '#ffd23f', r: 46, a: 0.18 }, champ: { col: '#ffb347', r: 46, a: 0.14 } };
const COSTUME_RINGS = { magnet: { col: '#7fb4ff', a: 0.12, n: 2 } };

function limb(c, a, len, w, col, end) {
  c.save(); c.rotate(a); c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(-w / 2, 0, w, len, w / 2); c.fill(); c.stroke();
  if (end) end(c, len); c.restore();
}

function uaeFlag(c, x, y, w, h, lw = 0.7) {
  c.fillStyle = '#d0202f'; c.fillRect(x, y, w * 0.27, h);
  c.fillStyle = '#119a4b'; c.fillRect(x + w * 0.27, y, w * 0.73, h / 3);
  c.fillStyle = '#ffffff'; c.fillRect(x + w * 0.27, y + h / 3, w * 0.73, h / 3);
  c.fillStyle = '#16141c'; c.fillRect(x + w * 0.27, y + 2 * h / 3, w * 0.73, h / 3);
  c.strokeStyle = INK; c.lineWidth = lw; c.strokeRect(x, y, w, h);
}
function starPath(c, x, y, r, n = 5, k = 0.45, rot = -Math.PI / 2) {
  c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, d = i & 1 ? r * k : r; i ? c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } c.closePath();
}
// small chest emblem for the perk costumes, centred at (0,0), ~7 units across
function emblem(c, id, S) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 0.8;
  const disc = (col) => { c.fillStyle = col; c.beginPath(); c.arc(0, 0, 3.6, 0, TAU); c.fill(); c.stroke(); };
  if (id === 'heat') { c.fillStyle = '#ffd34d'; c.beginPath(); c.moveTo(0, -4); c.quadraticCurveTo(3.4, -0.5, 2.6, 2); c.quadraticCurveTo(1.6, 4, 0, 4); c.quadraticCurveTo(-2.8, 4, -2.8, 1.4); c.quadraticCurveTo(-2.6, -1, -1, -1.6); c.quadraticCurveTo(-0.6, 0.4, 0.4, 0.6); c.quadraticCurveTo(0.8, -1.8, 0, -4); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#ff5a2a'; c.beginPath(); c.arc(0.2, 2, 1.2, 0, TAU); c.fill(); }
  else if (id === 'pilot') { c.fillStyle = '#e8b64a'; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sd * 3, -2.6, sd * 4.6, -1.4); c.quadraticCurveTo(sd * 3.6, 0.6, sd * 1, 1.4); c.closePath(); c.fill(); c.stroke(); } c.beginPath(); c.arc(0, 0.2, 1.4, 0, TAU); c.fill(); c.stroke(); }
  else if (id === 'link') { disc('#1f7a86'); c.strokeStyle = '#5ef2ff'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-2.4, 0); c.lineTo(-0.6, 0); c.lineTo(0.6, -1.6); c.lineTo(2.2, -1.6); c.moveTo(0.6, 0); c.lineTo(2.2, 1.4); c.stroke(); c.fillStyle = '#e8ffff'; c.beginPath(); c.arc(-0.6, 0, 0.7, 0, TAU); c.fill(); }
  else if (id === 'hope') { disc('#1f6a60'); c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(0.4, 0, 2.6, Math.PI * 0.35, Math.PI * 1.65); c.arc(1.5, 0, 2, Math.PI * 1.55, Math.PI * 0.45, true); c.closePath(); c.fill(); c.fillStyle = '#3ff2e0'; starPath(c, 1.6, -0.3, 1.2, 4, 0.4); c.fill(); }
  else if (id === 'gold') { disc('#ffd23f'); c.strokeStyle = '#b07a10'; c.beginPath(); c.arc(0, 0, 2.4, 0, TAU); c.stroke(); c.fillStyle = '#b07a10'; c.fillRect(-0.4, -1.6, 0.8, 3.2); }
  else if (id === 'rover') { disc('#3b3f52'); c.strokeStyle = '#7dff9a'; c.lineWidth = 0.9; c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); for (let k = 0; k < 3; k++) { const a = k * TAU / 3; c.moveTo(0, 0); c.lineTo(Math.cos(a) * 2.2, Math.sin(a) * 2.2); } c.stroke(); }
  else if (id === 'magnet') { c.fillStyle = '#e23b4a'; c.lineWidth = 0.8; c.beginPath(); c.arc(0, -0.4, 3.2, Math.PI, 0, true); c.lineTo(3.2, -3.4); c.lineTo(1.4, -3.4); c.lineTo(1.4, -0.4); c.arc(0, -0.4, 1.4, 0, Math.PI); c.lineTo(-1.4, -3.4); c.lineTo(-3.2, -3.4); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#eef1f6'; c.fillRect(-3.2, -3.4, 1.8, 1.2); c.fillRect(1.4, -3.4, 1.8, 1.2); }
  else if (id === 'comet') { c.fillStyle = '#bfeaff'; c.beginPath(); c.moveTo(-4, 2.6); c.quadraticCurveTo(-1, -0.6, 1.4, -1.8); c.lineTo(2.4, 0.2); c.quadraticCurveTo(-0.6, 1.4, -4, 2.6); c.closePath(); c.fill(); c.fillStyle = '#4aa8ff'; c.beginPath(); c.arc(1.9, -0.8, 1.7, 0, TAU); c.fill(); c.stroke(); }
  else if (id === 'crystal') { c.fillStyle = '#b98cff'; c.beginPath(); c.moveTo(0, -4); c.lineTo(2.8, -0.8); c.lineTo(0, 4); c.lineTo(-2.8, -0.8); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-1.6, -0.8); c.lineTo(1.6, -0.8); c.moveTo(0, -3.4); c.lineTo(-0.8, -0.8); c.stroke(); }
  else if (id === 'champ') { c.fillStyle = '#ffd23f'; starPath(c, 0, 0.2, 4, 5, 0.46); c.fill(); c.stroke(); c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(-0.8, -0.6, 0.7, 0, TAU); c.fill(); }
  else if (id === 'ice') { c.strokeStyle = '#4a7a9a'; c.lineWidth = 0.9; c.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; c.moveTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4); c.lineTo(-Math.cos(a) * 3.4, -Math.sin(a) * 3.4); } c.stroke(); }
  else if (id === 'star') { c.fillStyle = '#ffe066'; starPath(c, 0, 0.2, 3.6, 5, 0.45); c.fill(); c.stroke(); }
  c.restore();
}
const EMBLEM = { heat: 1, pilot: 1, link: 1, hope: 1, gold: 1, rover: 1, magnet: 1, comet: 1, crystal: 1, champ: 1, ice: 1, star: 1 };

// the helmet (collar ring, glass bubble tinted with the costume's visor colour, the head, reflections), baked
// per character, costume, mood and blink; centred on the helmet, radius 17
function helmetSprite(girl, cid, mood, blink, sb) {
  return bake('helm|' + (girl ? 'g' : 'b') + '|' + cid + '|' + mood + '|' + (blink ? 1 : 0) + '|' + sb, -18.5, -18.5, 37, 37, BAKE * sb, g => {
    const S = COSTUME_COLORS[cid];
    g.fillStyle = '#9aa3b8'; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.roundRect(-10, 9.5, 21, 5, 2.5); g.fill(); g.stroke();
    g.fillStyle = css(S.visor || AB_VIS, girl ? 0.3 : 0.28); g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
    if (girl) { g.save(); g.beginPath(); g.arc(0, 0, 14.7, 0, TAU); g.clip(); g.translate(2, 2.3); g.scale(1.26, 1.26); mozahHead(g, mood, blink, 0, S.hijab); g.restore(); }
    else { g.save(); g.translate(2, 1.2); g.scale(1.26, 1.26); aboodHead(g, mood, blink); g.restore(); }
    const gg = g.createLinearGradient(-12, -14, 12, 14); gg.addColorStop(0, 'rgba(210,240,255,.4)'); gg.addColorStop(0.42, 'rgba(160,210,255,0)'); gg.addColorStop(1, 'rgba(90,150,230,.22)');
    g.fillStyle = gg; g.beginPath(); g.arc(0, 0, 15.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, 12.2, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(-5.6, -9.4, 1.6, 1, -0.6, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,200,140,.5)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 13.2, 0.1, 0.75); g.stroke();
    g.strokeStyle = S.main; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 15.6, 0, TAU); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 14.3, 0, TAU); g.stroke();
  });
}

// ---------- the astronaut (Abood or Mozah): feet (bottom-centre) at (x,y), ~66·s tall, facing right ----------
// o = { t, char:'abood'|'mozah', costume (or the old o.suit), pose:'stand'|'wave'|'float'|'cheer'|'sad' }
export function drawAstronaut(c, x, y, s = 1, o = {}) {
  const t = o.t || 0, pose = o.pose || 'stand', girl = o.char === 'mozah', cid = costumeId(o.costume || o.suit, girl), S = COSTUME_COLORS[cid];
  if (girl) s *= 0.96; // the younger sibling
  const blink = fract(t * 0.31 + 0.2) > 0.965;
  let bob = Math.sin(t * 2) * 0.6, rot = 0, lean = 0;
  let aB = 0.18 + Math.sin(t * 2) * 0.04, aF = -0.16 - Math.sin(t * 2 + 1) * 0.04, lB = 0.06, lF = -0.06, kneeB = 0, kneeF = 0, mood = 'smile', headT = 0;
  if (pose === 'wave') { aF = -2.05 + Math.sin(t * 7) * 0.4; aB = 0.25; mood = 'grin'; headT = -0.05; }
  else if (pose === 'float') { bob = -6 + Math.sin(t * 1.6) * 4; rot = Math.sin(t * 0.8) * 0.13; aB = 1.0 + Math.sin(t * 1.3) * 0.15; aF = -1.15 - Math.sin(t * 1.3 + 1) * 0.15; lB = 0.55; lF = -0.25; kneeB = 1; kneeF = 1; mood = 'o'; }
  else if (pose === 'cheer') { const j = Math.abs(Math.sin(t * 5)); bob = -j * 6; aB = 2.2 + Math.sin(t * 10) * 0.15; aF = -2.2 - Math.sin(t * 10 + 1) * 0.15; lB = 0.12 + j * 0.25; lF = -0.12 - j * 0.25; mood = 'grin'; }
  else if (pose === 'sad') { bob = Math.sin(t * 1.1) * 0.5 + 1; aB = 0.05; aF = 0.02; headT = 0.16; lean = 0.06; mood = 'sad'; }
  c.save(); c.translate(x, y + bob * s); c.scale(s, s); if (rot) { c.translate(0, -32); c.rotate(rot); c.translate(0, 32); }
  if (lean) c.rotate(lean);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const glove = (c, l) => { c.fillStyle = S.trim; c.beginPath(); c.roundRect(-3.6, l - 3.5, 7.2, 3.4, 1.5); c.fill(); c.stroke(); c.fillStyle = '#eef1f6'; c.beginPath(); c.arc(0, l + 1.6, 3.6, 0, TAU); c.fill(); c.stroke(); };
  const boot = (c, l) => { c.fillStyle = S.trim; c.beginPath(); c.roundRect(-4, l - 6, 8, 3, 1.5); c.fill(); c.stroke(); c.fillStyle = '#3b3f52'; c.beginPath(); c.roundRect(-4.6, l - 3.4, 11, 5.4, 2.6); c.fill(); c.stroke();
    c.fillStyle = '#5c6278'; c.fillRect(-3.6, l + 0.6, 9, 1.2); };
  const leg = (a, knee, col) => { c.save(); c.rotate(a); c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 1.5;
    if (knee) { c.beginPath(); c.roundRect(-4, 0, 8, 10, 4); c.fill(); c.stroke(); c.translate(0, 9); c.rotate(-0.9 * knee); }
    c.beginPath(); c.roundRect(-4, 0, 8, knee ? 11 : 18, 4); c.fill(); c.stroke(); boot(c, knee ? 11 : 18); c.restore(); };
  // backpack
  c.fillStyle = S.shade; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.roundRect(-18.5, -44, 11, 25, 4); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(-17, -41, 2.4, 19);
  c.strokeStyle = 'rgba(28,21,48,.45)'; c.lineWidth = 1; c.beginPath(); for (let k = 0; k < 3; k++) { c.moveTo(-15, -36 + k * 4); c.lineTo(-10, -36 + k * 4); } c.stroke();
  c.fillStyle = fract(t * 0.7) < 0.5 ? '#3ff27a' : '#1d6b3a'; c.beginPath(); c.arc(-13, -24, 1.3, 0, TAU); c.fill();
  // back arm, back leg
  c.save(); c.translate(-7, -39); limb(c, aB, 14, 6.6, S.shade, glove); c.restore();
  c.save(); c.translate(-3, -21); leg(lB, kneeB, S.shade); c.restore();
  c.save(); c.translate(3, -21); leg(lF, kneeF, S.main); c.restore();
  // torso
  const tg = c.createLinearGradient(-11, 0, 12, 0); tg.addColorStop(0, S.shade); tg.addColorStop(0.55, S.main); tg.addColorStop(1, S.main);
  c.fillStyle = tg; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.roundRect(-10.5, -44, 22, 26, 8); c.fill(); c.stroke();
  c.save(); c.beginPath(); c.roundRect(-10.5, -44, 22, 26, 8); c.clip();
  c.fillStyle = S.trim; c.fillRect(-12, -24.5, 26, 3.6); // belt
  c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(3, -44, 4, 26);
  if (cid === 'star') { c.fillStyle = '#ffe066'; c.strokeStyle = 'rgba(28,21,48,.6)'; c.lineWidth = 0.5; for (const [sx, sy, sr2] of [[-7.4, -40.2, 1.5], [-4.6, -27.6, 1.2], [9.6, -27.4, 1.3], [-8.8, -31, 0.9]]) { starPath(c, sx, sy, sr2); c.fill(); c.stroke(); } }
  if (cid === 'link') { c.strokeStyle = 'rgba(47,209,197,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-10, -28); c.lineTo(-6, -28); c.lineTo(-4, -30.5); c.lineTo(-1.5, -30.5); c.stroke(); }
  c.restore();
  c.fillStyle = '#d9dde6'; c.beginPath(); c.roundRect(-1.5, -37.5, 10, 8, 2); c.fill(); c.lineWidth = 1.1; c.stroke(); // chest box
  c.fillStyle = '#e23b4a'; c.beginPath(); c.arc(1.4, -33.5, 1.2, 0, TAU); c.fill();
  c.fillStyle = fract(t * 1.3) < 0.6 ? '#3fe0ff' : '#1a6f86'; c.beginPath(); c.arc(4.6, -33.5, 1.2, 0, TAU); c.fill();
  c.fillStyle = S.trim; c.fillRect(-0.5, -30.6, 8, 1);
  if (EMBLEM[cid]) { c.save(); c.translate(-5.6, -33.2); c.scale(0.95, 0.95); emblem(c, cid, S); c.restore(); }
  if (girl) {
    // soft collar band in trim2 (in place of Abood's scarf), with a stitched edge
    c.fillStyle = S.trim2; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.roundRect(-8.8, -46.8, 18.6, 6, 3); c.fill(); c.stroke();
    c.strokeStyle = css(S.trim, 0.85); c.lineWidth = 0.8; c.setLineDash([1.4, 1.4]); c.beginPath(); c.moveTo(-6.6, -42.4); c.lineTo(7.6, -42.4); c.stroke(); c.setLineDash([]);
  } else {
    // scarf: red, tucked at the collar, tail drifting gently behind (nod to the red shemagh)
    const wv = Math.sin(t * 2.2) * 2, w2 = Math.cos(t * 1.7) * 2;
    c.fillStyle = '#c8202b'; c.strokeStyle = INK; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-6, -44); c.quadraticCurveTo(-14, -42 + wv * 0.4, -21, -37 + wv); c.quadraticCurveTo(-19, -34 + w2, -22, -30 + wv); c.quadraticCurveTo(-13, -36, -5, -40); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.roundRect(-8.5, -46.5, 18, 5.6, 2.8); c.fill(); c.stroke();
    c.fillStyle = '#fff1e8'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-5 + k * 4, -43.7, 0.7, 0, TAU); c.fill(); }
  }
  // helmet (baked): collar ring, head inside, glass bubble with reflections
  c.save(); c.translate(1.5, -56); c.rotate(headT);
  const hm = helmetSprite(girl, cid, mood, blink && mood !== 'grin', sBucket(s)); c.drawImage(hm.c, hm.x0, hm.y0, hm.w, hm.h);
  c.restore();
  // front arm with the flag patch on the shoulder
  c.save(); c.translate(7.5, -39.5); limb(c, aF, 14, 6.8, S.main, (c, l) => { glove(c, l); });
  c.save(); c.rotate(aF); uaeFlag(c, -2.6, 2, 5.4, 3.6, 0.6); c.restore(); c.restore();
  c.restore();
}
// v1 name: Abood unless o.char says otherwise
export function drawAbood(c, x, y, s = 1, o = {}) { drawAstronaut(c, x, y, s, o); }

// ---------- Nabeeh: round floating AI drone, centred at (x,y), radius ≈ 16·s ----------
function nabShell(sb) {
  return bake('nab|' + sb, -22, -30, 44, 52, BAKE * sb, g => {
    // shell
    const sg = g.createRadialGradient(-6, -8, 2, 0, 0, 18); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.6, '#e6ecf6'); sg.addColorStop(1, '#a9b6cc');
    g.fillStyle = sg; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
    g.save(); g.clip();
    g.fillStyle = '#2fd1c5'; g.fillRect(-17, 10, 34, 3); g.fillStyle = 'rgba(28,21,48,.15)'; g.beginPath(); g.ellipse(4, 9, 16, 9, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(28,21,48,.35)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-16, 8); g.quadraticCurveTo(0, 12, 16, 8); g.stroke();
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.stroke();
    // visor
    const vg = g.createLinearGradient(0, -9, 0, 7); vg.addColorStop(0, '#1d2340'); vg.addColorStop(1, '#0b0e1f');
    g.fillStyle = vg; g.beginPath(); g.roundRect(-12, -9, 24, 15, 7.5); g.fill(); g.lineWidth = 1.6; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(-10, -7.6, 15, 3.4, 1.7); g.fill();
    // ear pods
    for (const sd of [-1, 1]) { g.fillStyle = '#c9d3e4'; g.beginPath(); g.roundRect(sd * 16 - 2.5, -5, 5, 9, 2.5); g.fill(); g.lineWidth = 1.4; g.stroke(); }
    // gloss
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(-7.5, -11.5, 3.6, 1.8, -0.55, 0, TAU); g.fill();
    // antenna base
    g.fillStyle = '#9aa6bd'; g.beginPath(); g.roundRect(-2.5, -18.5, 5, 3.4, 1.4); g.fill(); g.lineWidth = 1.2; g.stroke();
  });
}
function visorTint() { return bake('nabvis', -12, -9, 24, 15, BAKE * 2, g => { g.fillStyle = 'rgba(255,40,60,.22)'; g.beginPath(); g.roundRect(-11, -8, 22, 13, 6.5); g.fill(); }); }
export function drawNabeeh(c, x, y, s = 1, o = {}) {
  const t = o.t || 0, mood = o.mood || 'normal', talk = !!o.talk;
  const by = Math.sin(t * 2.2) * 2.4, tilt = Math.sin(t * 1.3) * 0.07 + (talk ? Math.sin(t * 9) * 0.03 : 0);
  const face = mood === 'alert' ? '#ff4d5e' : mood === 'sad' ? '#7fb4ff' : '#5ef2ff';
  c.save(); c.translate(x, y + by * s); c.scale(s, s); c.rotate(tilt); c.lineJoin = 'round'; c.lineCap = 'round';
  // thruster ring glow
  c.globalCompositeOperation = 'lighter';
  const pul = 0.75 + 0.25 * Math.sin(t * 9);
  c.globalAlpha = 0.55 * pul; c.drawImage(glow('#5ef2ff'), -14, 10, 28, 20);
  c.globalAlpha = 0.35; c.drawImage(glow('#7fdcff'), -7, 14, 14, 26);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#525a72'; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.ellipse(0, 15.5, 9, 3, 0, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = `rgba(150,250,255,${0.6 + 0.4 * pul})`; c.lineWidth = 1.4; c.beginPath(); c.ellipse(0, 16, 6, 1.6, 0, 0, Math.PI); c.stroke();
  // arms
  const wa = talk ? Math.sin(t * 8) * 0.45 : Math.sin(t * 2) * 0.12;
  const arm = (sd, a, laser) => { c.save(); c.translate(sd * 15, 5); c.rotate(a); c.fillStyle = '#c9d3e4'; c.strokeStyle = INK; c.lineWidth = 1.4;
    c.beginPath(); c.roundRect(-2.2, 0, 4.4, 9, 2.2); c.fill(); c.stroke();
    c.fillStyle = laser ? '#2a3350' : '#eef2f8'; c.beginPath(); c.arc(0, 10, 3, 0, TAU); c.fill(); c.stroke();
    if (laser) { c.globalCompositeOperation = 'lighter'; const lp = 0.7 + 0.3 * Math.sin(t * 30); c.drawImage(glow('#5ef2ff'), -9 * lp, 10 - 9 * lp, 18 * lp, 18 * lp); c.fillStyle = '#e8ffff'; c.beginPath(); c.arc(0, 10, 1.6, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }
    c.restore(); };
  arm(-1, 0.5 + wa, false); arm(1, o.laser ? -1.45 : -0.5 - wa * 0.6, !!o.laser);
  // antenna
  c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -17); c.quadraticCurveTo(1 + Math.sin(t * 3) * 1.2, -22, 2 + Math.sin(t * 3) * 2, -26); c.stroke();
  const ax = 2 + Math.sin(t * 3) * 2, on = fract(t * 0.9) < 0.5;
  c.fillStyle = mood === 'alert' ? (REDUCED || fract(t * 4) < 0.5 ? '#ff4d5e' : '#7a1622') : on ? '#ffd23f' : '#8a6a1a'; c.lineWidth = 1.3; c.beginPath(); c.arc(ax, -27, 2.6, 0, TAU); c.fill(); c.stroke();
  if (on || mood === 'alert') { c.globalCompositeOperation = 'lighter'; glowAt(c, mood === 'alert' ? '#ff4d5e' : '#ffd23f', ax, -27, 8, 0.7); c.globalCompositeOperation = 'source-over'; }
  // shell
  const sh = nabShell(sBucket(s)); c.drawImage(sh.c, sh.x0, sh.y0, sh.w, sh.h);
  // face on the visor (glowing)
  // (no per-frame clip: the alert tint is a baked visor-shaped sprite and the glow stays inside the visor)
  c.save();
  if (mood === 'alert') { const vm = visorTint(); c.drawImage(vm.c, vm.x0, vm.y0, vm.w, vm.h); }
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(glow(face), -11, -8.5, 22, 14); c.globalAlpha = 1;
  c.fillStyle = face; c.strokeStyle = face; c.lineWidth = 1.8;
  const blink = fract(t * 0.37) > 0.955, look = Math.sin(t * 0.7) * 1.2;
  if (mood === 'happy') { for (const ex of [-5, 5]) { c.beginPath(); c.moveTo(ex - 2.8 + look, -0.4); c.lineTo(ex + look, -3.6); c.lineTo(ex + 2.8 + look, -0.4); c.stroke(); } }
  else if (mood === 'alert') { const k = REDUCED || fract(t * 3) < 0.5 ? 1 : 0.8; c.font = '900 ' + (11 * k).toFixed(1) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!!', 0, -1); }
  else if (mood === 'sad') { for (const ex of [-5, 5]) { c.beginPath(); c.moveTo(ex - 2.6, -3.2 + (ex < 0 ? 0 : 0.8)); c.lineTo(ex + 2.6, -3.2 + (ex < 0 ? 0.8 : 0)); c.stroke(); c.beginPath(); c.roundRect(ex - 1.8, -1.6, 3.6, 3.6, 1.8); c.fill(); } }
  else for (const ex of [-5, 5]) { c.beginPath(); c.roundRect(ex - 2 + look, blink ? -1.2 : -4.4, 4, blink ? 1.4 : 6.4, 1.6); c.fill(); }
  if (talk) { c.lineWidth = 1.3; c.beginPath(); for (let k = 0; k < 7; k++) { const mx = -4.5 + k * 1.5, mh = 0.4 + Math.abs(Math.sin(t * 18 + k * 1.3)) * 1.6; c.moveTo(mx, 3 - mh); c.lineTo(mx, 3 + mh); } c.stroke(); }
  else if (mood === 'happy') { c.lineWidth = 1.4; c.beginPath(); c.arc(0, 1, 2.6, 0.2, Math.PI - 0.2); c.stroke(); }
  c.restore();
  c.restore();
}

// ---------- Usta: tall boxy mechanic robot, feet at (x,y), ~96·s tall ----------
export function drawUsta(c, x, y, s = 1, t = 0) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
  const bob = Math.sin(t * 2) * 0.8, Y = '#f2ac38', YD = '#c9821c', YL = '#ffd27a';
  // tracked base
  c.fillStyle = '#3b3f52'; c.lineWidth = 1.8; c.beginPath(); c.roundRect(-24, -15, 48, 15, 7.5); c.fill(); c.stroke();
  c.fillStyle = '#6b7189'; for (let k = 0; k < 4; k++) { const wx = -16 + k * 10.6; c.beginPath(); c.arc(wx, -7.5, 4.2, 0, TAU); c.fill(); c.lineWidth = 1.2; c.stroke();
    c.save(); c.translate(wx, -7.5); c.rotate(t * 2); c.strokeStyle = '#2a2d3c'; c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.moveTo(0, -3); c.lineTo(0, 3); c.stroke(); c.restore(); }
  c.strokeStyle = INK;
  c.translate(0, bob);
  c.fillStyle = '#8f97ad'; c.lineWidth = 1.6; c.beginPath(); c.roundRect(-8, -22, 16, 9, 2); c.fill(); c.stroke();
  // back arm (claw)
  c.save(); c.translate(-21, -50); c.rotate(0.12 + Math.sin(t * 1.4) * 0.06);
  c.fillStyle = '#8f97ad'; c.beginPath(); c.roundRect(-3, 0, 6, 22, 3); c.fill(); c.stroke();
  c.fillStyle = '#5b6178'; c.beginPath(); c.moveTo(-4, 22); c.lineTo(-6, 29); c.lineTo(-2, 27); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(4, 22); c.lineTo(6, 29); c.lineTo(2, 27); c.closePath(); c.fill(); c.stroke();
  c.restore();
  // torso
  const tg = c.createLinearGradient(-21, 0, 21, 0); tg.addColorStop(0, YD); tg.addColorStop(0.45, Y); tg.addColorStop(1, YL);
  c.fillStyle = tg; c.lineWidth = 2; c.beginPath(); c.roundRect(-21, -62, 42, 42, 7); c.fill(); c.stroke();
  c.save(); c.beginPath(); c.roundRect(-21, -62, 42, 42, 7); c.clip();
  c.fillStyle = '#1d1b22'; c.fillRect(-22, -28, 44, 8); c.fillStyle = '#ffd23f';
  for (let k = -3; k < 5; k++) { c.beginPath(); c.moveTo(-22 + k * 8, -20); c.lineTo(-18 + k * 8, -28); c.lineTo(-14 + k * 8, -28); c.lineTo(-18 + k * 8, -20); c.closePath(); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(8, -62, 5, 34);
  c.restore();
  c.lineWidth = 2; c.beginPath(); c.roundRect(-21, -62, 42, 42, 7); c.stroke();
  // chest gauge and lights
  c.fillStyle = '#f4f1ea'; c.lineWidth = 1.4; c.beginPath(); c.arc(-7, -45, 7, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = '#c8202b'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-7, -45); const na = -2.4 + Math.sin(t * 1.7) * 0.5 + 0.6; c.lineTo(-7 + Math.cos(na) * 5, -45 + Math.sin(na) * 5); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 0.9; c.beginPath(); c.arc(-7, -45, 5.4, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  for (let k = 0; k < 3; k++) { const on = fract(t * 0.8 + k * 0.33) < 0.5; c.fillStyle = on ? ['#3ff27a', '#ffd23f', '#ff4d5e'][k] : '#4a4458'; c.beginPath(); c.arc(6 + k * 5, -50, 1.8, 0, TAU); c.fill(); c.lineWidth = 1; c.stroke(); }
  c.fillStyle = '#3b3f52'; c.beginPath(); c.roundRect(3, -44, 15, 9, 2); c.fill(); c.stroke();
  c.strokeStyle = '#7fdcff'; c.lineWidth = 1; c.beginPath(); for (let k = 0; k < 6; k++) { const hh = 1 + Math.abs(Math.sin(t * 4 + k)) * 2.8; c.moveTo(5 + k * 2.2, -39.5 - hh); c.lineTo(5 + k * 2.2, -39.5 + hh * 0.3); } c.stroke();
  c.strokeStyle = INK;
  // neck + head
  c.fillStyle = '#8f97ad'; c.lineWidth = 1.6; c.beginPath(); c.roundRect(-6, -68, 12, 7, 2); c.fill(); c.stroke();
  c.save(); c.translate(0, -68); c.rotate(Math.sin(t * 0.9) * 0.05);
  const hg = c.createLinearGradient(0, -28, 0, 0); hg.addColorStop(0, YL); hg.addColorStop(1, Y);
  c.fillStyle = hg; c.lineWidth = 2; c.beginPath(); c.roundRect(-17, -28, 34, 27, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.roundRect(-14, -26, 12, 3, 1.5); c.fill();
  // beacon
  const bon = fract(t * 1.1) < 0.4; c.fillStyle = '#5b6178'; c.beginPath(); c.roundRect(-3, -32, 6, 4, 1); c.fill(); c.lineWidth = 1.2; c.stroke();
  c.fillStyle = bon ? '#ff8a3d' : '#9a4a1a'; c.beginPath(); c.arc(0, -34, 3, Math.PI, TAU); c.closePath(); c.fill(); c.stroke();
  if (bon) { c.globalCompositeOperation = 'lighter'; glowAt(c, '#ff8a3d', 0, -34, 12, 0.8); c.globalCompositeOperation = 'source-over'; }
  // ears / bolts
  c.fillStyle = '#8f97ad'; for (const sd of [-1, 1]) { c.beginPath(); c.roundRect(sd * 17 - (sd > 0 ? 0 : 4), -19, 4, 10, 2); c.fill(); c.lineWidth = 1.3; c.stroke(); }
  // big eye
  const blink = fract(t * 0.29) > 0.95, lx = Math.sin(t * 0.6) * 2.4, ly = Math.cos(t * 0.45) * 1;
  c.fillStyle = '#2a2d3c'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -15, 9.5, 0, TAU); c.fill(); c.stroke();
  if (blink) { c.strokeStyle = '#7fdcff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -15); c.lineTo(6, -15); c.stroke(); }
  else {
    c.globalCompositeOperation = 'lighter'; glowAt(c, '#3fd6ff', lx, -15 + ly, 11, 0.6); c.globalCompositeOperation = 'source-over';
    const eg = c.createRadialGradient(lx - 1, -16 + ly, 0.5, lx, -15 + ly, 6.5); eg.addColorStop(0, '#e8ffff'); eg.addColorStop(0.4, '#5ef2ff'); eg.addColorStop(1, '#127a9a');
    c.fillStyle = eg; c.beginPath(); c.arc(lx, -15 + ly, 6.5, 0, TAU); c.fill();
    c.fillStyle = '#0b1830'; c.beginPath(); c.arc(lx * 1.25, -15 + ly * 1.2, 2.6, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(lx - 2.2, -17.4 + ly, 1.2, 0, TAU); c.fill();
  }
  c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-6, -3.8); c.lineTo(6, -3.8); c.moveTo(-5, -2.2); c.lineTo(5, -2.2); c.stroke();
  c.restore();
  // front arm with the big wrench (taps gently)
  const sw = Math.sin(t * 2.6) * 0.22 - 0.35;
  c.save(); c.translate(20, -52); c.rotate(sw);
  c.fillStyle = '#8f97ad'; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.roundRect(-3.2, 0, 6.4, 20, 3.2); c.fill(); c.stroke();
  c.fillStyle = '#5b6178'; c.beginPath(); c.arc(0, 0, 3.6, 0, TAU); c.fill(); c.stroke();
  c.translate(0, 22); c.fillStyle = Y; c.beginPath(); c.arc(0, 0, 4.4, 0, TAU); c.fill(); c.stroke();
  c.rotate(-1.1 - sw * 0.6);
  c.fillStyle = '#c7cedb'; c.beginPath(); c.roundRect(-2.2, -3, 4.4, 26, 2.2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-5.5, 21); c.lineTo(-6.5, 30); c.lineTo(-2.4, 30); c.lineTo(-1.6, 26); c.lineTo(1.6, 26); c.lineTo(2.4, 30); c.lineTo(6.5, 30); c.lineTo(5.5, 21); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-1, -1, 1.2, 20);
  c.restore();
  c.restore();
}

// ---------- planets ----------
// Surface textures are baked once per planet in a cylindrical equal-area projection (rows = sin(latitude)),
// sampled from 3D noise on the sphere so they wrap seamlessly. drawPlanet maps them onto the disc in
// vertical strips (longitude → asin), so rotation shows real spherical motion, then adds baked shading,
// terminator, rim light and atmosphere sprites.
const PL = {
  earth: { atm: '#6fc3ff', atmA: 1, spin: 0.012, cspin: 0.02, avg: '#3b78c4' },
  moon: { atm: '#dfe6f5', atmA: 0.18, spin: 0.008, avg: '#a9a6a1' },
  mars: { atm: '#ffae8a', atmA: 0.45, spin: 0.011, avg: '#c0602f' },
  venus: { atm: '#ffd88a', atmA: 0.9, spin: 0.004, cspin: 0.012, avg: '#e3b060' },
  jupiter: { atm: '#f3d9b0', atmA: 0.45, spin: 0.016, avg: '#d2b088' },
  saturn: { atm: '#f6e2b0', atmA: 0.4, spin: 0.014, ring: 1, tilt: -0.36, avg: '#e0c78f' },
  uranus: { atm: '#b4f6f2', atmA: 0.65, spin: 0.009, ring: 2, tilt: 1.12, avg: '#94d8dc' },
  neptune: { atm: '#7aa6ff', atmA: 0.7, spin: 0.011, avg: '#3561c9' },
  belt: { atm: '#c8b49a', atmA: 0, avg: '#8d7a66' },
};
export const PLANET_IDS = ['earth', 'moon', 'mars', 'venus', 'belt', 'jupiter', 'saturn', 'uranus', 'neptune'];
const TEX = new Map();
const H2 = s => s.map(rgbOf);
function bandLookup(st, v) { v = clamp(v, 0, 0.99999) * (st.length - 1); const i = v | 0, f = v - i, s = f * f * (3 - 2 * f); return mixc(st[i], st[i + 1], s); }

function craterList(seed, n, rmin, rmax) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) { const z = r() * 2 - 1, a = r() * TAU, cl = Math.sqrt(1 - z * z); out.push([cl * Math.cos(a), cl * Math.sin(a), z, rmin + Math.pow(r(), 2.2) * (rmax - rmin)]); }
  return out;
}
function craterK(cr, x, y, z) { // brightness multiplier from craters
  let k = 1;
  for (let i = 0; i < cr.length; i++) {
    const C = cr[i], dx = x - C[0], dy = y - C[1], dz = z - C[2], d2 = dx * dx + dy * dy + dz * dz, R = C[3];
    if (d2 > R * R * 1.6) continue;
    const d = Math.sqrt(d2) / R;
    if (d < 0.78) k *= 0.8 + d * 0.12 - (dz > 0 ? 0.04 : -0.04);
    else if (d < 1.05) k *= 1.1 + (dz < 0 ? 0.06 : -0.03);
    else k *= 1 - (1.26 - d) * 0.08;
  }
  return k;
}

const SURF = {
  earth() {
    const deep = rgbOf('#123a78'), shallow = rgbOf('#2f8ad0'), sand = rgbOf('#d9b46e'), sand2 = rgbOf('#c4914f'), green = rgbOf('#4f9d48'), dgreen = rgbOf('#2d6a35'), rockc = rgbOf('#8a7356'), ice = rgbOf('#f1f6fb');
    return (x, y, z, o) => {
      const h = con(fbm(x * 1.6 + 3.1, y * 1.6 + 1.2, z * 1.6, 6), 2.3), lat = Math.abs(z);
      let col;
      if (h < 0.5) { const d = clamp((0.5 - h) / 0.22, 0, 1); col = mixc(shallow, deep, Math.sqrt(d)); }
      else {
        const e = (h - 0.5) / 0.38, m = con(fbm(x * 2.4 + 9, y * 2.4, z * 2.4 + 4, 4), 2);
        const dry = smooth(0.55, 0.3, m) * smooth(0.75, 0.25, lat);
        col = mixc(mixc(green, dgreen, smooth(0.4, 0.8, m)), mixc(sand, sand2, e), dry);
        if (e > 0.5) col = mixc(col, rockc, smooth(0.5, 0.85, e));
        col = shade(col, 0.9 + fbm(x * 9, y * 9, z * 9, 2) * 0.2);
      }
      const ic = 0.86 + (fbm(x * 4, y * 4, z * 4, 3) - 0.5) * 0.12;
      if (lat > ic) col = mixc(col, ice, smooth(ic, ic + 0.03, lat));
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  earthC() {
    return (x, y, z, o) => {
      const w = fbm(x * 1.4 + 20, y * 1.4, z * 1.4, 3);
      const v = con(fbm(x * 2.4 + w * 2.2, y * 2.4 - w * 1.6, z * 3.2 + w, 6), 2.1);
      const lat = Math.abs(z), band = 0.75 + 0.25 * Math.cos(lat * 9);
      const a = smooth(0.5, 0.78, v * band);
      const b = 225 + v * 30;
      o[0] = b; o[1] = b; o[2] = 255; o[3] = a * 235;
    };
  },
  moon() {
    const cr = craterList(77, 95, 0.025, 0.2), base = rgbOf('#bdbab3'), mare = rgbOf('#74757c');
    return (x, y, z, o) => {
      const v = fbm(x * 3, y * 3, z * 3, 5), m = smooth(0.5, 0.6, con(fbm(x * 1.1 + 9, y * 1.1, z * 1.1, 4), 1.8));
      let col = mixc(base, mare, m * 0.85); col = shade(col, (0.85 + v * 0.3) * craterK(cr, x, y, z));
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  mars() {
    const cr = craterList(41, 30, 0.02, 0.1), st = H2(['#6e2c16', '#9a4423', '#c4622d', '#d27a43', '#e2a06a']), ice = rgbOf('#f6efe8');
    return (x, y, z, o) => {
      const v = con(fbm(x * 1.8 + 2, y * 1.8, z * 1.8, 6), 1.9);
      let col = bandLookup(st, v);
      const rid = Math.abs(fbm(x * 2.2 + 5, y * 2.2, z * 2.2, 4) - 0.5);
      if (rid < 0.025) col = shade(col, 0.78 + rid * 8);
      col = shade(col, craterK(cr, x, y, z));
      const ic = (z > 0 ? 0.88 : 0.92) + (fbm(x * 5, y * 5, z * 5, 3) - 0.5) * 0.1;
      if (Math.abs(z) > ic) col = mixc(col, ice, smooth(ic, ic + 0.025, Math.abs(z)));
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  venus() {
    const st = H2(['#b86f28', '#d99240', '#ecb862', '#f6d690', '#e9a64c', '#fbe7b8']);
    return (x, y, z, o) => {
      const w = fbm(x * 1.2, y * 1.2, z * 1.2 + 5, 4);
      const v = con(fbm(x * 1.5 + w * 2.6, y * 1.5 + w * 2.6, z * 4 + w * 1.5, 5), 1.8);
      const col = bandLookup(st, v);
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  venusC() {
    return (x, y, z, o) => {
      const w = fbm(x * 2 + 4, y * 2, z * 2, 3);
      const v = con(fbm(x * 2.2 + w * 3, y * 2.2, z * 7 + w * 2, 5), 2);
      o[0] = 255; o[1] = 236; o[2] = 190; o[3] = smooth(0.55, 0.85, v) * 150;
    };
  },
  jupiter() {
    const B = H2(['#c9cdd6', '#b9a68e', '#e9dcc0', '#c79a6c', '#f2e9d6', '#a8724c', '#e7d3b0', '#f6f0e2', '#d8955a', '#efe2c6', '#b98a62', '#f4ead6', '#c6a07a', '#e8dcc2', '#b9a68e', '#c9cdd6']);
    const spot = rgbOf('#c4543a'), spotL = rgbOf('#efc6a4');
    return (x, y, z, o) => {
      const tb = fbm(x * 1.6, y * 1.6, z * 7, 4) - 0.5, tf = fbm(x * 5, y * 5, z * 16, 3) - 0.5;
      const zz = z + tb * 0.1 + tf * 0.03;
      let col = bandLookup(B, zz * 0.5 + 0.5); col = shade(col, 0.93 + tf * 0.35);
      const lon = Math.atan2(y, x); let dl = lon - 2.2; dl = dl - TAU * Math.round(dl / TAU);
      const cl = Math.sqrt(1 - z * z), ex = dl * cl / 0.25, ez = (z + 0.36) / 0.105, e = ex * ex + ez * ez;
      if (e < 1.6) {
        const sw = Math.sin(Math.atan2(ez, ex) * 2 + e * 5) * 0.08;
        if (e < 1) col = mixc(col, mixc(spot, spotL, smooth(0.3, 1, e) * 0.6 + sw), smooth(1, 0.7, e));
        else col = mixc(col, spotL, (1.6 - e) * 0.6);
      }
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  saturn() {
    const B = H2(['#d7c9a6', '#e6d3a4', '#f2e3bd', '#d9bb7e', '#efdcb0', '#c9a66b', '#f4e6c4', '#e2c88e', '#f0deb2', '#d4b57e', '#e8d6aa', '#cdbf9f']);
    return (x, y, z, o) => {
      const tb = fbm(x * 1.4, y * 1.4, z * 6, 4) - 0.5, tf = fbm(x * 4, y * 4, z * 14, 2) - 0.5;
      let col = bandLookup(B, (z + tb * 0.06) * 0.5 + 0.5); col = shade(col, 0.95 + tf * 0.2);
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  uranus() {
    const B = H2(['#c4f1ef', '#a8e4e6', '#99dade', '#8fd2d9', '#94d6dc', '#9fdde1', '#b3ebea']);
    return (x, y, z, o) => {
      const tb = fbm(x * 1.2, y * 1.2, z * 5, 3) - 0.5;
      let col = bandLookup(B, (z + tb * 0.05) * 0.5 + 0.5); col = shade(col, 0.97 + tb * 0.12);
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
  neptune() {
    const B = H2(['#3a68d8', '#2b56c4', '#4a7fe6', '#2348ad', '#3a6ee0', '#1f3f9e', '#4a86ec', '#2b56c4', '#3460cf']), spot = rgbOf('#122a74'), wh = rgbOf('#e8f2ff');
    return (x, y, z, o) => {
      const tb = fbm(x * 1.5, y * 1.5, z * 6, 4) - 0.5;
      let col = bandLookup(B, (z + tb * 0.1) * 0.5 + 0.5);
      const lon = Math.atan2(y, x); let dl = lon - 1.4; dl = dl - TAU * Math.round(dl / TAU);
      const cl = Math.sqrt(1 - z * z), ex = dl * cl / 0.2, ez = (z + 0.32) / 0.1, e = ex * ex + ez * ez;
      if (e < 1.2) col = mixc(col, spot, smooth(1.2, 0.5, e) * 0.85);
      const ci = fbm(x * 3, y * 3, z * 14, 4);
      col = mixc(col, wh, smooth(0.6, 0.75, ci) * 0.75 * (0.4 + 0.6 * smooth(2.5, 1.2, e)));
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = 255;
    };
  },
};
function bakeSurface(fn, TW) {
  const TH = TW >> 1, cv = mk(TW, TH), g = cv.getContext('2d'), img = g.createImageData(TW, TH), D = img.data, o = [0, 0, 0, 255];
  const cs = new Float32Array(TW), sn = new Float32Array(TW);
  for (let u = 0; u < TW; u++) { const a = (u + 0.5) / TW * TAU; cs[u] = Math.cos(a); sn[u] = Math.sin(a); }
  for (let v = 0; v < TH; v++) {
    const z = 1 - 2 * (v + 0.5) / TH, cl = Math.sqrt(1 - z * z);
    for (let u = 0; u < TW; u++) { fn(cl * cs[u], cl * sn[u], z, o); const k = (v * TW + u) * 4; D[k] = o[0]; D[k + 1] = o[1]; D[k + 2] = o[2]; D[k + 3] = o[3]; }
  }
  g.putImageData(img, 0, 0); return cv;
}
function planetTex(id) {
  let T = TEX.get(id); if (T) return T;
  const TW = Q >= 2 ? 384 : 512, f = SURF[id] || SURF.moon;
  T = { tex: bakeSurface(f(), TW) };
  if (SURF[id + 'C']) T.cl = bakeSurface(SURF[id + 'C'](), TW);
  TEX.set(id, T); return T;
}
// shading overlay shared by every planet: day/night terminator (light from the upper-left), limb darkening, soft specular
let PSHADE = null;
function planetShade() {
  if (PSHADE) return PSHADE;
  const N = 256, cv = mk(N, N), g = cv.getContext('2d'); g.translate(N / 2, N / 2); g.scale(N / 2, N / 2);
  g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.clip();
  let gr = g.createRadialGradient(-0.5, -0.42, 0, -0.5, -0.42, 1.62);
  gr.addColorStop(0, 'rgba(4,2,18,0)'); gr.addColorStop(0.42, 'rgba(4,2,18,0.04)'); gr.addColorStop(0.62, 'rgba(4,2,18,0.42)'); gr.addColorStop(0.74, 'rgba(4,2,18,0.86)'); gr.addColorStop(1, 'rgba(4,2,18,0.96)');
  g.fillStyle = gr; g.fillRect(-1, -1, 2, 2);
  gr = g.createRadialGradient(0, 0, 0.62, 0, 0, 1); gr.addColorStop(0, 'rgba(4,2,18,0)'); gr.addColorStop(1, 'rgba(4,2,18,0.38)');
  g.fillStyle = gr; g.fillRect(-1, -1, 2, 2);
  gr = g.createRadialGradient(-0.42, -0.42, 0, -0.42, -0.42, 0.55); gr.addColorStop(0, 'rgba(255,250,235,.16)'); gr.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = gr; g.fillRect(-1, -1, 2, 2);
  PSHADE = cv; return cv;
}
const HALO = new Map();
function haloSprite(id) { // atmosphere glow outside the limb (drawn with 'lighter' before the body)
  let h = HALO.get(id); if (h) return h;
  const P = PL[id] || PL.moon, a = rgbOf(P.atm), N = 192, cv = mk(N, N), g = cv.getContext('2d');
  g.translate(N / 2, N / 2); const u = N / 3; // planet radius = N/3
  const gr = g.createRadialGradient(-0.05 * u, -0.05 * u, u * 0.9, 0, 0, N / 2);
  gr.addColorStop(0, rgba(a, 0.7 * P.atmA)); gr.addColorStop(0.15, rgba(a, 0.5 * P.atmA)); gr.addColorStop(0.4, rgba(a, 0.16 * P.atmA)); gr.addColorStop(1, rgba(a, 0));
  g.fillStyle = gr; g.fillRect(-N / 2, -N / 2, N, N);
  HALO.set(id, cv); return cv;
}
const RIM = new Map();
function rimSprite(id) { // inner atmospheric rim on the lit limb (drawn with 'lighter' after the body)
  let h = RIM.get(id); if (h) return h;
  const P = PL[id] || PL.moon, a = rgbOf(P.atm), N = 256, cv = mk(N, N), g = cv.getContext('2d');
  g.translate(N / 2, N / 2); g.scale(N / 2, N / 2); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.clip();
  const gr = g.createRadialGradient(0.2, 0.17, 0, 0.2, 0.17, 1.2);
  gr.addColorStop(0, rgba(a, 0)); gr.addColorStop(0.74, rgba(a, 0)); gr.addColorStop(0.9, rgba(a, 0.3 * P.atmA + 0.06)); gr.addColorStop(1, rgba(mixc(a, [255, 255, 255], 0.4), 0.85 * P.atmA + 0.12));
  g.fillStyle = gr; g.fillRect(-1.3, -1.3, 2.6, 2.6);
  RIM.set(id, cv); return cv;
}
const RINGT = new Map();
function ringTex(kind) {
  let r = RINGT.get(kind); if (r) return r;
  const N = 512, cv = mk(N, N), g = cv.getContext('2d'), R = kind === 1 ? 2.3 : 1.9, u = N / 2 / R;
  g.translate(N / 2, N / 2);
  if (kind === 1) {
    const rr = rng(5), base = rgbOf('#e8d4a6'), dk = rgbOf('#b89a68');
    for (let k = 0; k < 150; k++) {
      const rad = 1.22 + k * (1.06 / 150);
      let a = 0.5 + 0.35 * Math.sin(k * 0.9) * rr() + rr() * 0.2;
      if (rad < 1.5) a *= 0.35; if (rad > 1.94 && rad < 2.0) a = 0.04; if (rad > 2.2) a *= 0.6;
      g.strokeStyle = rgba(mixc(base, dk, rr() * 0.7), clamp(a, 0, 1)); g.lineWidth = (1.06 / 150) * u + 0.6;
      g.beginPath(); g.arc(0, 0, rad * u, 0, TAU); g.stroke();
    }
    g.strokeStyle = 'rgba(28,21,48,.55)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 2.28 * u, 0, TAU); g.stroke();
  } else {
    for (const [rad, a, w] of [[1.45, 0.18, 10], [1.56, 0.5, 3], [1.66, 0.65, 3.5], [1.76, 0.95, 5], [1.84, 0.4, 2.5]]) { g.strokeStyle = `rgba(214,246,246,${a})`; g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad * u, 0, TAU); g.stroke(); }
  }
  r = { c: cv, R }; RINGT.set(kind, r); return r;
}
const RINGH = new Map();
function ringHalfSprite(P, front) { // tilted, flattened ring half baked once (no clipping per frame)
  const key = P.ring + '|' + P.tilt + '|' + (front ? 1 : 0); let cv = RINGH.get(key); if (cv) return cv;
  const RT = ringTex(P.ring), N = 768, u = N / 2 / RT.R, flat = P.ring === 1 ? 0.27 : 0.3;
  cv = mk(N, N); const g = cv.getContext('2d'); g.translate(N / 2, N / 2); g.rotate(P.tilt); g.beginPath();
  if (front) g.rect(-N, 0, 2 * N, N); else g.rect(-N, -N, 2 * N, N);
  g.clip(); g.scale(1, flat); if (!front) g.globalAlpha = 0.85; g.drawImage(RT.c, -N / 2, -N / 2, N, N);
  RINGH.set(key, cv); return cv;
}
function ringHalf(c, P, x, y, r, front) { const R = ringTex(P.ring).R * r; c.drawImage(ringHalfSprite(P, front), x - R, y - R, 2 * R, 2 * R); }
// the lit planet disc (surface strips, clouds, terminator, rim). One canvas per (planet, half-octave radius
// class), allocated once at the class's largest radius and re-rendered IN PLACE, only when the drawn radius is
// more than 6% away from the rendered one or the surface has turned 2 texels (throttled to 8 Hz above r 40);
// drawImage scaling covers everything in between (review A2).
function renderDisc(g, id, P, T, r, rot, crot) {
  g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip(); if (P.ring) g.rotate(P.tilt);
  stripes(g, T.tex, r, rot);
  if (T.cl) stripes(g, T.cl, r, crot + 0.3);
  if (P.ring === 1) { g.strokeStyle = 'rgba(20,10,30,.28)'; g.lineWidth = r * 0.09; g.beginPath(); g.ellipse(0, r * 0.1, r * 1.75, r * 0.47, 0, 0.2, Math.PI - 0.2); g.stroke(); }
  g.restore();
  g.drawImage(planetShade(), -r, -r, r * 2, r * 2);
  g.globalCompositeOperation = 'lighter'; g.drawImage(rimSprite(id), -r, -r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
  if (r > 10) { g.strokeStyle = 'rgba(28,21,48,.55)'; g.lineWidth = Math.min(2.2, r * 0.03); g.beginPath(); g.arc(0, 0, r - g.lineWidth * 0.3, 0, TAU); g.stroke(); }
}
function planetDisc(id, P, r, t) {
  const cls = Math.round(Math.log2(r) * 2), key = id + '|' + cls, T = planetTex(id), TW = T.tex.width;
  const rot = t * P.spin, crot = t * (P.cspin || 0);
  let e = DISC.get(key);
  if (!e) { const rmax = Math.pow(2, (cls + 0.5) / 2), res = Math.min(BAKE, 640 / (2 * rmax)), n = Math.ceil(2 * rmax * res) + 4; e = { cv: mk(n, n), res, r: 0, rot: 0, crot: 0, tr: -1e9 }; DISC.set(key, e); }
  if (e.r > 0 && Math.abs(r - e.r) <= e.r * 0.06) {
    const moved = Math.max(Math.abs(rot - e.rot), Math.abs(crot - e.crot)) * TW;
    if (moved < 2 || (r > 40 && Math.abs(t - e.tr) < 0.125)) return e;
  }
  const g = e.cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.cv.width, e.cv.height);
  g.setTransform(e.res, 0, 0, e.res, e.cv.width / 2, e.cv.height / 2); g.lineJoin = 'round';
  renderDisc(g, id, P, T, r, rot, crot);
  e.r = r; e.rot = rot; e.crot = crot; e.tr = t; DISC_RENDERS++; return e;
}
let DISC_RENDERS = 0;
export const artStats = () => ({ discRenders: DISC_RENDERS, discCanvases: DISC.size, rocks: ROCKS.size, rockPx: ROCKS.px, themes: THEMES.size, rivals: RIV.size });
function stripes(c, tex, r, rot) {
  const TW = tex.width, TH = tex.height, n = clamp(Math.round(r / 3.2), 10, 40), uw = TW / (2 * n);
  const off = ((-rot % 1) + 1) % 1 * TW;
  for (let i = 0; i < n; i++) {
    const l0 = -Math.PI / 2 + i * Math.PI / n, l1 = l0 + Math.PI / n;
    const x0 = r * Math.sin(l0), x1 = r * Math.sin(l1), dw = x1 - x0;
    const u0 = (off + i * uw) % TW;
    if (u0 + uw <= TW) c.drawImage(tex, u0, 0, uw, TH, x0, -r, dw + 0.5, 2 * r);
    else { const a = TW - u0, f = a / uw; c.drawImage(tex, u0, 0, a, TH, x0, -r, dw * f + 0.5, 2 * r); c.drawImage(tex, 0, 0, uw - a, TH, x0 + dw * f, -r, dw * (1 - f) + 0.5, 2 * r); }
  }
}
export function drawPlanet(c, id, x, y, r, t = 0) {
  if (!(r > 0.4)) return;
  if (id === 'belt') return drawBeltRock(c, x, y, r, t);
  const P = PL[id] || PL.moon;
  c.save();
  if (P.atmA > 0.05) { c.globalCompositeOperation = 'lighter'; c.drawImage(haloSprite(id), x - r * 1.5, y - r * 1.5, r * 3, r * 3); c.globalCompositeOperation = 'source-over'; }
  if (P.ring) ringHalf(c, P, x, y, r, false);
  if (r < 4) {
    c.fillStyle = P.avg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.drawImage(planetShade(), x - r, y - r, r * 2, r * 2);
  } else {
    const e = planetDisc(id, P, r, t), h = e.cv.width / 2 / e.res * (r / e.r);
    c.drawImage(e.cv, x - h, y - h, h * 2, h * 2);
  }
  if (P.ring) ringHalf(c, P, x, y, r, true);
  c.restore();
}

// ---------- rocks ----------
// Rock bodies are baked per (kind, seed variant, size bucket, palette) and rotated on blit. Directional
// light stays fixed (sun at the upper-left): after the body is drawn we clip to the rock's own outline
// path and lay unrotated shadow + highlight + rim sprites on top, so lumps shade correctly as they spin.
const RB = [6, 9, 13, 18, 25, 34, 46, 62, 84, 128];
const DEF_ROCK = ['#8a7f78', '#4e4540', '#c9bdb2'];
const ICE_PAL = ['#b9e2f5', '#5f8fbe', '#f2fcff'];
const PATHS = new Map();
function rockGeom(kind, sv) {
  const key = kind + sv; let G = PATHS.get(key); if (G) return G;
  const r = rng(sv * 7919 + (kind === 'ice' ? 31 : kind === 'meteor' ? 57 : kind === 'belt' ? 91 : 13));
  const n = kind === 'ice' ? 8 + (r() * 3 | 0) : 10 + (r() * 5 | 0), pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU + (r() - 0.5) * 0.4, rad = (kind === 'belt' ? 0.8 : 0.84) + r() * (kind === 'belt' ? 0.24 : 0.19); pts.push([Math.cos(a) * rad, Math.sin(a) * rad * (kind === 'belt' ? 0.82 : 1)]); }
  const p = new Path2D();
  if (kind === 'ice') { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); }
  else {
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0 = m(pts[n - 1], pts[0]); p.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) { const q = m(pts[i], pts[(i + 1) % n]); p.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    p.closePath();
  }
  G = { p, pts, rnd: r }; PATHS.set(key, G); return G;
}
function rockBody(g, kind, sv, pal, R, lw) {
  const G = rockGeom(kind, sv), r = rng(sv * 131 + 7), [base, dark, light] = pal.map(rgbOf);
  g.save(); g.scale(R, R);
  const gr = g.createRadialGradient(-0.1, -0.1, 0.05, 0, 0, 1.05);
  gr.addColorStop(0, rgba(mixc(base, light, 0.25))); gr.addColorStop(0.65, rgba(base)); gr.addColorStop(1, rgba(mixc(base, dark, 0.7)));
  g.fillStyle = gr; g.fill(G.p);
  g.save(); g.clip(G.p);
  // mottling
  for (let i = 0; i < 9; i++) { g.fillStyle = rgba(r() < 0.5 ? dark : light, 0.12 + r() * 0.12); g.beginPath(); g.ellipse((r() - 0.5) * 1.6, (r() - 0.5) * 1.6, 0.15 + r() * 0.35, 0.1 + r() * 0.25, r() * 3, 0, TAU); g.fill(); }
  if (kind === 'ice') {
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.18})`; g.beginPath(); const a = r() * TAU, d = r() * 0.5; g.moveTo(Math.cos(a) * d, Math.sin(a) * d); for (let k = 0; k < 3; k++) { const b = a + (k - 1) * 0.9 + r() * 0.4; g.lineTo(Math.cos(b) * (d + 0.4 + r() * 0.4), Math.sin(b) * (d + 0.4 + r() * 0.4)); } g.closePath(); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.035; g.beginPath(); for (let i = 0; i < 4; i++) { let px = (r() - 0.5) * 1.2, py = (r() - 0.5) * 1.2; g.moveTo(px, py); for (let k = 0; k < 3; k++) { px += (r() - 0.5) * 0.5; py += (r() - 0.5) * 0.5; g.lineTo(px, py); } } g.stroke();
    g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { g.globalAlpha = 0.5 + r() * 0.5; g.beginPath(); g.arc((r() - 0.5) * 1.4, (r() - 0.5) * 1.4, 0.025 + r() * 0.03, 0, TAU); g.fill(); } g.globalAlpha = 1;
  } else {
    // speckles
    for (let i = 0; i < 26; i++) { g.fillStyle = rgba(r() < 0.6 ? dark : light, 0.35); g.beginPath(); g.arc((r() - 0.5) * 1.8, (r() - 0.5) * 1.8, 0.012 + r() * 0.03, 0, TAU); g.fill(); }
    // craters
    const nc = kind === 'belt' ? 14 : 3 + (r() * 3 | 0);
    for (let i = 0; i < nc; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * (kind === 'belt' ? 0.75 : 0.6), cx = Math.cos(a) * d, cy = Math.sin(a) * d, cr = (kind === 'belt' ? 0.05 : 0.09) + r() * (kind === 'belt' ? 0.16 : 0.17);
      g.fillStyle = rgba(dark, 0.5); g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
      g.fillStyle = rgba(mixc(dark, base, 0.4), 0.6); g.beginPath(); g.arc(cx + cr * 0.15, cy + cr * 0.15, cr * 0.72, 0, TAU); g.fill();
      g.strokeStyle = rgba(light, 0.55); g.lineWidth = Math.max(0.025, cr * 0.18); g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.stroke();
    }
  }
  // rotation-invariant inner rim (the fixed shadow later dims it on the night side, so it reads as sunlit rim)
  g.strokeStyle = rgba(light, kind === 'ice' ? 0.75 : 0.5); g.lineWidth = 0.15; g.stroke(G.p);
  g.restore();
  if (kind === 'crystal') {
    const a0 = r() * TAU, nk = 4;
    for (let i = 0; i < nk; i++) {
      const a = i === nk - 1 ? a0 + Math.PI + (r() - 0.5) : a0 + (i - 1) * 0.6 + (r() - 0.5) * 0.25, d = 0.5 + r() * 0.12, L = (i === 1 ? 0.5 : 0.3) + r() * 0.16, w = 0.11 + r() * 0.05, col = i % 2 ? ['#b98cff', '#6a3cc9', '#f1e6ff'] : ['#4ff7e6', '#11928c', '#e6fffd'];
      g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.rotate(a + (r() - 0.5) * 0.5);
      const cg = g.createLinearGradient(0, -w, 0, w); cg.addColorStop(0, col[2]); cg.addColorStop(0.45, col[0]); cg.addColorStop(1, col[1]);
      g.fillStyle = cg; g.strokeStyle = INK; g.lineWidth = lw / R;
      g.beginPath(); g.moveTo(-0.15, -w); g.lineTo(L * 0.72, -w); g.lineTo(L, 0); g.lineTo(L * 0.72, w); g.lineTo(-0.15, w); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(0, -w * 0.3); g.lineTo(L * 0.7, -w * 0.3); g.lineTo(L * 0.95, 0); g.stroke();
      g.restore();
    }
  }
  g.strokeStyle = INK; g.lineWidth = lw / R; g.stroke(G.p);
  g.restore();
}
// palette arrays → small ids, so the sprite key is a number (no string building per rock per frame, review A4)
const PAL_ID = new WeakMap(), PAL_STR = new Map();
function palId(pal) {
  let id = PAL_ID.get(pal); if (id !== undefined) return id;
  const k = pal.join(','); id = PAL_STR.get(k); if (id === undefined) { id = PAL_STR.size; PAL_STR.set(k, id); }
  PAL_ID.set(pal, id); return id;
}
const RKIND = { rock: 0, ice: 1, crystal: 2, belt: 3 };
function rockSprite(kind, sv, r, pal) {
  let bi = 0; while (bi < RB.length - 1 && RB[bi] < r) bi++;
  const key = ((palId(pal) * 4 + (RKIND[kind] || 0)) * 8 + (sv & 7)) * 16 + bi;
  let e = ROCKS.get(key); if (e) return e;
  const B = RB[bi], pad = kind === 'crystal' ? 1.28 : 1.12, half = B * pad, res = Math.min(BAKE, 360 / (2 * half));
  const lw = clamp(1.3 + B * 0.035, 1.6, 4.5), cv = mk(half * 2 * res, half * 2 * res), g = cv.getContext('2d');
  g.scale(cv.width / (half * 2), cv.height / (half * 2)); g.translate(half, half); g.lineJoin = 'round'; g.lineCap = 'round';
  rockBody(g, kind, sv, pal, B, lw);
  e = { c: cv, x0: -half, y0: -half, w: half * 2, h: half * 2, R: B, kind, sv, res, frames: new Array(NF) };
  return ROCKS.set(key, e);
}
// one of NF lit rotation frames: body rotated by fi·step, sunlight fixed at the upper-left (clipped to the outline
// at bake time). Frames live on the body entry and count in its pixel budget, so they are evicted together.
const NF = 16, RSTEP = TAU / NF;
function rockFrame(e, fi) {
  let f = e.frames[fi]; if (f) return f;
  const B = e.R, a = fi * RSTEP, cv = mk(e.c.width, e.c.height), g = cv.getContext('2d'), L = rockLight();
  g.scale(cv.width / e.w, cv.height / e.h); g.translate(-e.x0, -e.y0);
  g.save(); g.rotate(a); g.drawImage(e.c, e.x0, e.y0, e.w, e.h); g.scale(B, B); g.clip(rockGeom(e.kind, e.sv).p); g.rotate(-a);
  g.drawImage(L.sh, -1.3, -1.3, 2.6, 2.6); g.globalCompositeOperation = 'lighter'; g.drawImage(L.li, -1.3, -1.3, 2.6, 2.6); g.restore();
  e.frames[fi] = cv; ROCKS.add(e, cv.width * cv.height); return cv;
}
let RSHADE = null;
function rockLight() { // unrotated shading layers in unit coords [-1.3,1.3]: shadow (source-over) + light (lighter)
  if (RSHADE) return RSHADE;
  const N = 128, u = N / 2.6;
  const sh = mk(N, N), g = sh.getContext('2d'); g.translate(N / 2, N / 2); g.scale(u, u);
  let gr = g.createRadialGradient(0.55, 0.6, 0, 0.55, 0.6, 1.3);
  gr.addColorStop(0, 'rgba(10,5,28,.86)'); gr.addColorStop(0.45, 'rgba(10,5,28,.66)'); gr.addColorStop(0.8, 'rgba(10,5,28,.16)'); gr.addColorStop(1, 'rgba(10,5,28,0)');
  g.fillStyle = gr; g.fillRect(-1.3, -1.3, 2.6, 2.6);
  const li = mk(N, N), h = li.getContext('2d'); h.translate(N / 2, N / 2); h.scale(u, u);
  gr = h.createRadialGradient(-0.42, -0.48, 0, -0.42, -0.48, 0.8); gr.addColorStop(0, 'rgba(255,236,205,.34)'); gr.addColorStop(1, 'rgba(255,236,205,0)');
  h.fillStyle = gr; h.fillRect(-1.3, -1.3, 2.6, 2.6);
  gr = h.createRadialGradient(0.22, 0.24, 0, 0.22, 0.24, 1.25); gr.addColorStop(0, 'rgba(255,240,215,0)'); gr.addColorStop(0.82, 'rgba(255,240,215,0)'); gr.addColorStop(0.95, 'rgba(255,240,215,.4)'); gr.addColorStop(1, 'rgba(255,245,225,.65)');
  h.fillStyle = gr; h.fillRect(-1.3, -1.3, 2.6, 2.6);
  RSHADE = { sh, li }; return RSHADE;
}
function rockDraw(c, kind, sv, x, y, r, rot, pal, flash, t) {
  const e = rockSprite(kind, sv, r, pal), s = r / e.R, q = Math.round(rot / RSTEP), fi = ((q % NF) + NF) % NF, f = rockFrame(e, fi);
  c.save(); c.translate(x, y); c.rotate(rot - q * RSTEP);
  c.drawImage(f, e.x0 * s, e.y0 * s, e.w * s, e.h * s);
  if (flash > 0) { c.rotate(fi * RSTEP); c.globalAlpha *= clamp(flash, 0, 1) * 0.9; c.drawImage(whiteOf(e), e.x0 * s, e.y0 * s, e.w * s, e.h * s); }
  c.restore();
}
export function drawRock(c, o) {
  const kind = o.kind === 'ice' || o.kind === 'crystal' ? o.kind : 'rock', r = o.r || 20;
  const pal = kind === 'ice' ? ICE_PAL : (o.palette && o.palette.length >= 3 ? o.palette : DEF_ROCK);
  const sv = Math.abs((o.seed | 0)) % 8, t = o.t ?? (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
  if (kind === 'crystal') { c.save(); c.globalCompositeOperation = 'lighter'; glowAt(c, sv % 2 ? '#b98cff' : '#4ff7e6', o.x, o.y, r * 2.1, 0.32 + 0.14 * Math.sin(t * 3 + sv)); c.restore(); }
  rockDraw(c, kind, sv, o.x, o.y, r, o.rot || 0, pal, o.flash || 0, t);
  if (kind === 'crystal') { // twinkle on the crystal tips
    c.save(); c.globalCompositeOperation = 'lighter'; const k = fract(t * 0.6 + sv * 0.37);
    if (k < 0.25) flareAt(c, o.x + Math.cos(sv * 2.1 + (o.rot || 0)) * r * 0.9, o.y + Math.sin(sv * 2.1 + (o.rot || 0)) * r * 0.9, r * 0.5, Math.sin(k / 0.25 * Math.PI));
    c.restore();
  }
}
function drawBeltRock(c, x, y, r, t) {
  const pal = ['#9a8670', '#4f4236', '#d4c0a4'];
  c.save(); c.globalCompositeOperation = 'lighter'; glowAt(c, '#ffe0b0', x - r * 0.15, y - r * 0.15, r * 1.6, 0.12); c.restore();
  rockDraw(c, 'belt', 3, x, y, r, t * 0.035, pal, 0, t);
  // two tiny moonlets in orbit
  for (let i = 0; i < 2; i++) {
    const a = t * (0.25 + i * 0.12) + i * 2.4, ox = Math.cos(a) * r * (1.5 + i * 0.25), oy = Math.sin(a) * r * 0.35;
    if (Math.sin(a) < 0 && r > 6) rockDraw(c, 'rock', 5 + i, x + ox, y + oy, Math.max(1.5, r * (0.07 + i * 0.03)), t * 0.6, pal, 0, t);
  }
}

// ---------- shards ----------
const SHARD = new Map();
// shardSprite(kind): small chip sprite, 24×24 px (draw it at ~12×12 logical, centred)
export function shardSprite(kind = 'rock', pal) {
  const key = kind + (pal ? pal.join() : ''); let cv = SHARD.get(key); if (cv) return cv;
  const P = { rock: pal || DEF_ROCK, ice: ICE_PAL, crystal: ['#4ff7e6', '#11928c', '#e6fffd'], violet: ['#b98cff', '#6a3cc9', '#f1e6ff'], metal: ['#c7cedb', '#5b6178', '#ffffff'], gold: ['#ffd23f', '#b07a10', '#fff6c4'], fire: ['#ff8a3d', '#a8321c', '#ffe08a'] }[kind] || pal || DEF_ROCK;
  cv = mk(24, 24); const g = cv.getContext('2d'); g.translate(12, 12); g.lineJoin = 'round';
  const r = rng(hashStr(key)), n = 5 + (r() * 2 | 0); g.beginPath();
  for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.5, d = 5.5 + r() * 4; i ? g.lineTo(Math.cos(a) * d, Math.sin(a) * d * 0.8) : g.moveTo(Math.cos(a) * d, Math.sin(a) * d * 0.8); }
  g.closePath(); const gr = g.createLinearGradient(-8, -8, 8, 8); gr.addColorStop(0, P[2]); gr.addColorStop(0.45, P[0]); gr.addColorStop(1, P[1]);
  g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  SHARD.set(key, cv); return cv;
}

// ---------- junk ----------
// s: scale (hit radius ≈ 20·s). Values > 4 are treated as a radius in logical units.
const JK = { panel: 1, tank: 1, drone: 1, dish: 1 };
function junkSprite(kind) {
  return bake('junk|' + kind, -34, -34, 68, 68, BAKE * 1.5, g => {
    g.strokeStyle = INK; g.lineWidth = 1.8;
    if (kind === 'panel') {
      // bent strut + joint
      g.fillStyle = '#9aa3b8'; g.beginPath(); g.roundRect(-30, -2.5, 14, 5, 2); g.fill(); g.stroke();
      g.fillStyle = '#5b6178'; g.beginPath(); g.arc(-17, 0, 3.6, 0, TAU); g.fill(); g.stroke();
      const shape = () => { g.beginPath(); g.moveTo(-14, -13); g.lineTo(24, -13); g.lineTo(24, 2); g.lineTo(19, 5); g.lineTo(21, 9); g.lineTo(14, 13); g.lineTo(-14, 13); g.closePath(); };
      shape(); g.fillStyle = '#d0a64a'; g.fill(); g.stroke();
      g.save(); shape(); g.clip();
      const cg = g.createLinearGradient(-12, -11, 22, 11); cg.addColorStop(0, '#3d6fd0'); cg.addColorStop(0.5, '#1d3f94'); cg.addColorStop(1, '#14286a');
      g.fillStyle = cg; g.fillRect(-12, -11, 34, 22);
      g.strokeStyle = 'rgba(160,200,255,.55)'; g.lineWidth = 0.9; g.beginPath();
      for (let k = 1; k < 5; k++) { g.moveTo(-12 + k * 6.8, -11); g.lineTo(-12 + k * 6.8, 11); } g.moveTo(-12, -3.7); g.lineTo(22, -3.7); g.moveTo(-12, 3.7); g.lineTo(22, 3.7); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(-12, 11); g.lineTo(0, -11); g.lineTo(6, -11); g.lineTo(-6, 11); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(230,240,255,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(14, -6); g.lineTo(18, 0); g.lineTo(15, 4); g.moveTo(18, 0); g.lineTo(22, -2); g.stroke(); // crack
      g.restore(); shape(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
    } else if (kind === 'tank') {
      const body = () => { g.beginPath(); g.roundRect(-24, -11, 46, 22, 11); };
      body(); const tg = g.createLinearGradient(0, -11, 0, 11); tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, '#e4e8f0'); tg.addColorStop(1, '#9aa3b8');
      g.fillStyle = tg; g.fill(); g.save(); body(); g.clip();
      g.fillStyle = '#e8572b'; g.fillRect(-14, -12, 5, 24); g.fillRect(9, -12, 5, 24);
      g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-20, -8, 38, 2.4);
      g.strokeStyle = 'rgba(28,21,48,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-3, 4); g.quadraticCurveTo(1, 2, 4, 6); g.stroke(); // dent
      g.restore(); body(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
      g.fillStyle = '#ffd23f'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-2.5, -5); g.lineTo(3.5, 5); g.lineTo(-8.5, 5); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = INK; g.fillRect(-3.2, -2, 1.4, 4); g.fillRect(-3.2, 2.8, 1.4, 1.2);
      g.fillStyle = '#7d879e'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(21, -4, 6, 8, 2); g.fill(); g.stroke(); g.beginPath(); g.roundRect(26, -6, 3, 12, 1.5); g.fill(); g.stroke();
    } else if (kind === 'drone') {
      // dangling arm
      g.fillStyle = '#7d879e'; g.save(); g.translate(8, 10); g.rotate(0.6); g.beginPath(); g.roundRect(-2, 0, 4, 13, 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-3, 13); g.lineTo(-4, 18); g.moveTo(3, 13); g.lineTo(4, 18); g.stroke(); g.restore();
      // bent antenna
      g.lineWidth = 1.6; g.beginPath(); g.moveTo(-4, -15); g.lineTo(-7, -22); g.lineTo(-1, -26); g.stroke();
      const sg = g.createRadialGradient(-5, -6, 2, 0, 0, 17); sg.addColorStop(0, '#c9d1c2'); sg.addColorStop(0.6, '#8f9a8a'); sg.addColorStop(1, '#58614f');
      g.fillStyle = sg; g.lineWidth = 1.9; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(140,70,30,.45)'; for (const [rx, ry, rr] of [[7, -8, 4], [-9, 7, 5], [10, 7, 3]]) { g.beginPath(); g.arc(rx, ry, rr, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(28,21,48,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-15, 5); g.quadraticCurveTo(0, 9, 15, 5); g.stroke();
      g.fillStyle = 'rgba(28,21,48,.35)'; g.beginPath(); g.ellipse(-8, -9, 4, 2.5, 0.6, 0, TAU); g.fill(); // dent
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 1.9; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.stroke();
      g.fillStyle = '#1a1420'; g.lineWidth = 1.4; g.beginPath(); g.roundRect(-9, -6, 18, 9, 4.5); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(220,220,230,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-6, -5); g.lineTo(-2, -1); g.lineTo(-4, 2); g.moveTo(-2, -1); g.lineTo(2, -3); g.stroke(); // cracked visor
      g.fillStyle = '#c9d1c2'; for (const a of [0.4, 2.2, 3.6, 5.2]) { g.beginPath(); g.arc(Math.cos(a) * 12, Math.sin(a) * 12, 1, 0, TAU); g.fill(); }
    } else { // dish
      g.fillStyle = '#5b6178'; g.beginPath(); g.roundRect(-20, 4, 16, 12, 2); g.fill(); g.stroke(); // bus box
      g.fillStyle = '#2b4f9e'; g.beginPath(); g.rect(-30, 7, 10, 6); g.fill(); g.stroke(); // stub panel
      g.lineWidth = 1.6; g.beginPath(); g.moveTo(-12, 4); g.lineTo(-6, -2); g.stroke();
      g.save(); g.translate(2, -4); g.rotate(-0.6);
      const dg = g.createLinearGradient(-16, 0, 16, 0); dg.addColorStop(0, '#ffffff'); dg.addColorStop(1, '#a9b3c6');
      g.fillStyle = dg; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-17, 0); g.quadraticCurveTo(0, 16, 17, 0); g.quadraticCurveTo(0, 6, -17, 0); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(28,21,48,.3)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-9, 4); g.quadraticCurveTo(0, 10, 9, 4); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-12, 2.5); g.lineTo(0, -14); g.lineTo(12, 2.5); g.stroke();
      g.fillStyle = '#e8572b'; g.beginPath(); g.arc(0, -14, 2.6, 0, TAU); g.fill(); g.stroke();
      g.restore();
      g.lineWidth = 1.4; g.beginPath(); g.moveTo(-4, 16); g.lineTo(6, 26); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(6, 26, 1.8, 0, TAU); g.fill(); g.stroke();
    }
  });
}
export function drawJunk(c, o) {
  const kind = JK[o.kind] ? o.kind : 'panel', t = o.t || 0, sv = Math.abs(o.seed | 0);
  let s = o.s ?? 1; if (s > 4) s = s / 20;
  const e = junkSprite(kind);
  c.save(); c.translate(o.x, o.y);
  if (kind === 'drone') c.translate(Math.sin(t * 3 + sv) * 1.5, Math.cos(t * 2.3 + sv) * 1.5);
  c.rotate(o.rot || 0); c.scale(s, s);
  c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  if (o.flash > 0) { c.globalAlpha = clamp(o.flash, 0, 1) * 0.9; c.drawImage(whiteOf(e), e.x0, e.y0, e.w, e.h); c.globalAlpha = 1; }
  c.globalCompositeOperation = 'lighter';
  if (kind === 'drone') {
    const fl = sr((t * 14 | 0) + sv) > 0.25 ? 0.6 + 0.4 * Math.sin(t * 40) : 0.1;
    glowAt(c, '#ff3040', 3, -1.5, 9, fl); c.fillStyle = `rgba(255,70,80,${fl})`; c.beginPath(); c.arc(3, -1.5, 2, 0, TAU); c.fill();
    if (sr((t * 9 | 0) + sv * 3) > 0.55) { // sparks from the broken antenna
      c.strokeStyle = '#fff2a8'; c.lineWidth = 1.1; c.beginPath();
      for (let k = 0; k < 3; k++) { const a = sr(k + (t * 9 | 0)) * TAU, l = 3 + sr(k * 7 + (t * 9 | 0)) * 5; c.moveTo(-1, -26); c.lineTo(-1 + Math.cos(a) * l, -26 + Math.sin(a) * l); }
      c.stroke(); glowAt(c, '#ffd27a', -1, -26, 9, 0.8);
    }
  } else if (kind === 'tank') {
    const on = fract(t * 1.5 + sv * 0.3) < 0.35; if (on) { glowAt(c, '#ff4d3d', 24, -8, 8, 0.9); c.fillStyle = '#ffd0c8'; c.beginPath(); c.arc(24, -8, 1.3, 0, TAU); c.fill(); }
  } else if (kind === 'dish') {
    const on = fract(t * 0.8 + sv * 0.3) < 0.2; if (on) glowAt(c, '#ffd23f', 6, 26, 7, 0.9);
  } else {
    const k = fract(t * 0.4 + sv * 0.21); if (k < 0.12) flareAt(c, -12 + k / 0.12 * 34, -11 + k / 0.12 * 22, 6, Math.sin(k / 0.12 * Math.PI) * 0.8);
  }
  c.restore();
}

// ---------- meteor ----------
let TRAIL = null;
function trailSprite() { // tapered burning trail, head at the left edge (x=0), 512×96
  if (TRAIL) return TRAIL;
  const W = 512, H = 96, cv = mk(W, H), g = cv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
  const or = [255, 160, 60], rd = [235, 70, 35], wh = [255, 250, 225];
  for (let x = 0; x < W; x++) {
    const u = x / W, hw = Math.max(0.6, (H / 2 - 3) * Math.pow(1 - u, 0.7) * (0.8 + 0.2 * smooth(0, 0.08, u))), fo = Math.pow(1 - u, 0.75), fc = Math.pow(1 - u, 1.8);
    const oc = mixc(or, rd, smooth(0.05, 0.75, u));
    for (let y = 0; y < H; y++) {
      const d = (y - H / 2 + 0.5) / hw, n = 0.8 + 0.4 * n3(x * 0.035, y * 0.22, 1.7);
      const outer = Math.exp(-d * d * 2.2) * fo * n, core = Math.exp(-d * d * 9) * fc;
      const a = clamp(outer * 1.1 + core, 0, 1), k = (y * W + x) * 4, col = mixc(oc, wh, clamp(core / (outer * 0.85 + core + 1e-4), 0, 1));
      D[k] = col[0]; D[k + 1] = col[1]; D[k + 2] = col[2]; D[k + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0); TRAIL = cv; return cv;
}
function meteorHead(sv) {
  return bake('meteor|' + sv, -1.5, -1.5, 3, 3, 40 * BAKE, g => {
    const G = rockGeom('meteor', sv), r = rng(sv * 17 + 3);
    const gr = g.createRadialGradient(-0.3, -0.2, 0.1, 0, 0, 1.05); gr.addColorStop(0, '#6b4030'); gr.addColorStop(1, '#2a1612');
    g.fillStyle = gr; g.fill(G.p); g.save(); g.clip(G.p);
    g.strokeStyle = '#ff9a3d'; g.lineWidth = 0.07; g.beginPath();
    for (let i = 0; i < 5; i++) { let px = (r() - 0.5) * 1.2, py = (r() - 0.5) * 1.2; g.moveTo(px, py); for (let k = 0; k < 3; k++) { px += (r() - 0.5) * 0.6; py += (r() - 0.5) * 0.6; g.lineTo(px, py); } }
    g.stroke(); g.strokeStyle = '#ffe08a'; g.lineWidth = 0.025; g.stroke();
    const hg = g.createRadialGradient(-0.9, 0, 0, -0.9, 0, 1.4); hg.addColorStop(0, 'rgba(255,220,120,.95)'); hg.addColorStop(0.5, 'rgba(255,120,40,.45)'); hg.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = hg; g.fillRect(-1.5, -1.5, 3, 3);
    g.restore(); g.strokeStyle = INK; g.lineWidth = 0.08; g.stroke(G.p);
  });
}
export function drawMeteor(c, o, t = 0) {
  const r = o.r || 16, sv = Math.abs(o.seed | 0) % 6, dir = (o.vx ?? -1) <= 0 ? 1 : -1;
  const fl = 0.9 + 0.1 * Math.sin(t * 43 + sv) + 0.05 * Math.sin(t * 71), L = clamp(r * 15, 150, 380) * fl, Hh = r * 2.3 * (0.95 + 0.08 * Math.sin(t * 37));
  c.save(); c.translate(o.x, o.y); if (dir < 0) c.scale(-1, 1);
  c.globalCompositeOperation = 'lighter';
  c.drawImage(trailSprite(), -r * 0.8, -Hh, L, Hh * 2);
  c.globalAlpha = 0.6; c.drawImage(trailSprite(), -r * 0.6, -Hh * 0.55, L * 0.6, Hh * 1.1); c.globalAlpha = 1;
  // embers peeling off the trail
  for (let i = 0; i < 12; i++) {
    const ph = fract(t * 1.6 + i * 0.137 + sv * 0.31), ex = r * 0.4 + ph * L * 0.85, ey = Math.sin(i * 12.9 + sv) * r * (0.3 + ph * 1.4) + Math.sin(t * 6 + i) * 2;
    glowAt(c, i % 3 ? '#ff8a3d' : '#ffd27a', ex, ey, 3 + (1 - ph) * 4, (1 - ph) * 0.9);
  }
  glowAt(c, '#ff6a2a', 0, 0, r * 4.2, 0.75);
  glowAt(c, '#ffe6a0', -r * 0.2, 0, r * 2, 0.85);
  c.globalCompositeOperation = 'source-over';
  const e = meteorHead(sv); c.save(); c.rotate(t * 2.6 * dir + sv); c.drawImage(e.c, -1.5 * r, -1.5 * r, 3 * r, 3 * r); c.restore();
  c.globalCompositeOperation = 'lighter'; glowAt(c, '#ffb050', -r * 0.5, 0, r * 1.4, 0.55 + 0.2 * Math.sin(t * 30));
  c.restore();
}

// ---------- lane warning ----------
let WBAND = null;
function warnBand() { if (!WBAND) { WBAND = mk(2, 64); const g = WBAND.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,40,60,0)'); gr.addColorStop(0.5, 'rgba(255,40,60,.9)'); gr.addColorStop(1, 'rgba(255,40,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 2, 64); } return WBAND; }
// where the "!" marker goes: at the right edge, or left of the bottom-right super button for low lanes
// (review A3: the 86 px button covers about logical y 293-382 on a 390 px tall phone). H is the logical height.
export const warnMarkerX = (W, y, H = 400) => (y > H - 125 ? W - 125 : W - 20);
export function drawWarning(c, W, y, f = 0, t = 0, mx) {
  if (!(mx > 0)) mx = warnMarkerX(W, y);
  f = clamp(f, 0, 1);
  // flash rate 3-10 Hz rising with f; under reduced motion a calm 1 Hz with a softer swing (review A5)
  const rate = REDUCED ? 2 : 6 + f * 14, fl = REDUCED ? 0.5 + 0.2 * Math.sin(t * rate * Math.PI) : 0.5 + 0.5 * Math.sin(t * rate * Math.PI), grow = smooth(0, 0.3, f);
  const x1 = W - 34, x0 = x1 - (x1 + 10) * grow;
  c.save();
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.18 + 0.22 * fl; c.drawImage(warnBand(), x0, y - 16, x1 - x0, 32); c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.setLineDash([16, 10]); c.lineDashOffset = t * 160; c.lineCap = 'butt';
  c.strokeStyle = `rgba(255,60,70,${0.55 + 0.4 * fl})`; c.lineWidth = 3; c.beginPath(); c.moveTo(x1 - 14, y); c.lineTo(x0, y); c.stroke();
  c.setLineDash([]);
  // chevrons sliding left
  c.strokeStyle = `rgba(255,200,200,${0.5 + 0.4 * fl})`; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  for (let k = 0; k < 4; k++) { const cx = x1 - 30 - fract(t * 1.6 + k / 4) * Math.min(220, x1 - x0); if (cx < x0) continue; if (Math.abs(cx - mx) < 18) continue; c.moveTo(cx + 5, y - 6); c.lineTo(cx, y); c.lineTo(cx + 5, y + 6); }
  c.stroke();
  // flashing "!" triangle
  const sc = 1 + 0.12 * fl + (f > 0.8 && !REDUCED ? 0.08 * Math.sin(t * 50) : 0), tx = mx;
  c.globalCompositeOperation = 'lighter'; glowAt(c, '#ff3040', tx, y, 34 * sc, 0.5 + 0.4 * fl); c.globalCompositeOperation = 'source-over';
  c.save(); c.translate(tx, y); c.scale(sc, sc);
  c.fillStyle = REDUCED ? '#ffd23f' : fl > 0.5 ? '#ffd23f' : '#ff4d5e'; c.strokeStyle = INK; c.lineWidth = 2.4; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(0, -14); c.lineTo(13, 10); c.lineTo(-13, 10); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = INK; c.font = '900 17px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 0, 2);
  c.restore();
  c.restore();
}

// ---------- bolts and lasers ----------
// v3.3 the default blaster: electric-blue plasma, so the player's fire never shares a colour with enemy fire (pink/red).
// It grows with the blaster level: lv 0-1 a capsule, 2-3 twin side rails, 4-5 an arrowhead, 6 a crackling ring.
function boltSprite(lv) {
  lv = clamp(lv | 0, 0, 6);
  const L = 9 + lv * 1.3, th = 2.5 + lv * 0.33, pad = 10 + lv;
  return bake('bolt3|' + lv, -L - pad, -11 - lv * 0.8, (L + pad) * 2, 22 + lv * 1.6, BAKE, g => {
    g.globalCompositeOperation = 'lighter';
    const gw = g.createRadialGradient(0, 0, 0, 0, 0, L + 8); gw.addColorStop(0, 'rgba(70,150,255,.55)'); gw.addColorStop(1, 'rgba(40,110,255,0)');
    g.save(); g.scale(1, 0.42 + lv * 0.02); g.fillStyle = gw; g.fillRect(-L - 9, -L - 9, (L + 9) * 2, (L + 9) * 2); g.restore();
    const bg = g.createLinearGradient(-L - 4, 0, L, 0); bg.addColorStop(0, 'rgba(60,120,255,0)'); bg.addColorStop(0.45, 'rgba(90,190,255,.9)'); bg.addColorStop(1, 'rgba(200,245,255,1)');
    g.fillStyle = bg; g.beginPath(); g.roundRect(-L - 4, -th, L * 2 + 4, th * 2, th); g.fill();
    if (lv >= 2) { g.fillStyle = 'rgba(120,210,255,.8)'; for (const sd of [-1, 1]) { g.beginPath(); g.roundRect(-L * 0.9, sd * (th + 2.2) - 0.9, L * 1.4, 1.8, 0.9); g.fill(); } }
    if (lv >= 4) { g.fillStyle = 'rgba(210,248,255,.95)'; g.beginPath(); g.moveTo(L + 4, 0); g.lineTo(L - 4, -th - 3); g.lineTo(L - 2, 0); g.lineTo(L - 4, th + 3); g.closePath(); g.fill(); }
    if (lv >= 6) { g.strokeStyle = 'rgba(170,230,255,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); for (let k = 1; k <= 8; k++) g.lineTo(-L + k * L / 4, (k % 2 ? -1 : 1) * (th + 4)); g.stroke(); }
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(-L * 0.25, -th * 0.45, L * 1.15, th * 0.9, th * 0.45); g.fill();
  });
}
function missileSprite() { // homing weapon: a little rocket (drawn along its flight angle; the flame is live)
  return bake('missile', -14, -8, 28, 16, BAKE * 1.5, g => {
    g.strokeStyle = INK; g.lineWidth = 1.4;
    g.fillStyle = '#ff6ad5'; g.beginPath(); g.moveTo(-8, -2.5); g.lineTo(-11, -6.5); g.lineTo(-5, -2.5); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-8, 2.5); g.lineTo(-11, 6.5); g.lineTo(-5, 2.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#f4f2ea'; g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(6, -3.6, -8, -3); g.lineTo(-8, 3); g.quadraticCurveTo(6, 3.6, 10, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff6ad5'; g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(8, -2.8, 4.5, -3); g.lineTo(4.5, 3); g.quadraticCurveTo(8, 2.8, 10, 0); g.fill();
  });
}
// costume bolt kinds (§5): colours from the matching costume trail [main, deep, light]
const BOLT_PAL = {
  ember: ['#ff5a2a', '#ff8a2a', '#ffd27a'], gold: ['#ffe066', '#f2b630', '#fff3c4'], cyan: ['#5ef2ff', '#2fb8d6', '#ffffff'],
  violet: ['#b9a6ff', '#8a6cff', '#f0eaff'], ice: ['#bfeaff', '#7fd3ff', '#ffffff'], star: ['#fff3b0', '#ffe066', '#ffffff'], champ: ['#ff5a4a', '#ffd23f', '#fff3c4'],
};
export const BOLT_KINDS = ['blaster', 'bot', ...Object.keys(BOLT_PAL)];
function kindBolt(kind, lv) {
  lv = clamp(lv | 0, 0, 6);
  const P = BOLT_PAL[kind], L = 9 + lv * 1.2, th = 2.6 + lv * 0.35, pad = 9 + lv;
  return bake('bolt|' + kind + '|' + lv, -L - pad, -10 - lv * 0.6, (L + pad) * 2, 20 + lv * 1.2, BAKE, g => {
    const [m, d, l] = P.map(rgbOf); g.globalCompositeOperation = 'lighter';
    const halo = (rx, ry, a) => { const gw = g.createRadialGradient(0, 0, 0, 0, 0, rx); gw.addColorStop(0, rgba(d, a)); gw.addColorStop(1, rgba(d, 0)); g.save(); g.scale(1, ry / rx); g.fillStyle = gw; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); };
    if (kind === 'ember') { // a fireball: hot head, ragged tail, embers peeling off
      halo(L + 7, 7 + lv * 0.4, 0.55);
      const tg = g.createLinearGradient(-L - 4, 0, L, 0); tg.addColorStop(0, rgba(d, 0)); tg.addColorStop(0.6, rgba(m, 0.85)); tg.addColorStop(1, rgba(l, 1));
      g.fillStyle = tg; g.beginPath(); g.moveTo(-L - 4, 0); g.quadraticCurveTo(-L * 0.2, -th * 1.6, L * 0.55, -th * 1.25); g.arc(L * 0.55, 0, th * 1.25, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(-L * 0.2, th * 1.6, -L - 4, 0); g.fill();
      g.fillStyle = 'rgba(255,250,220,1)'; g.beginPath(); g.ellipse(L * 0.55, 0, th * 0.85, th * 0.7, 0, 0, TAU); g.fill();
      for (const [ex, ey, er] of [[-L * 0.6, -th * 1.4, 1.3], [-L * 0.95, th * 1.1, 1], [-L * 0.25, th * 1.7, 0.9]]) { g.fillStyle = rgba(l, 0.9); g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.fill(); }
    } else if (kind === 'cyan') { // a thin, fast needle
      halo(L + 8, 4.5, 0.5);
      const bg = g.createLinearGradient(-L - 5, 0, L + 3, 0); bg.addColorStop(0, rgba(d, 0)); bg.addColorStop(0.5, rgba(m, 0.95)); bg.addColorStop(1, rgba(l, 1));
      g.fillStyle = bg; g.beginPath(); g.roundRect(-L - 5, -th * 0.6, L * 2 + 8, th * 1.2, th * 0.6); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(-L * 0.1, -th * 0.28, L * 1.1, th * 0.56, th * 0.28); g.fill();
    } else if (kind === 'violet' || kind === 'ice') { // a crystal shard / an icicle
      halo(L + 7, 7, kind === 'ice' ? 0.6 : 0.5);
      const tg = g.createLinearGradient(-L - 3, 0, L, 0); tg.addColorStop(0, rgba(d, 0)); tg.addColorStop(1, rgba(m, 0.5)); g.fillStyle = tg; g.fillRect(-L - 3, -th * 0.5, L * 1.4, th);
      g.fillStyle = rgba(m, 0.95); g.beginPath();
      if (kind === 'violet') { g.moveTo(L + 2, 0); g.lineTo(L * 0.2, -th * 1.5); g.lineTo(-L * 0.35, 0); g.lineTo(L * 0.2, th * 1.5); }
      else { g.moveTo(L + 3, 0); g.lineTo(-L * 0.2, -th * 1.15); g.lineTo(-L * 0.55, 0); g.lineTo(-L * 0.2, th * 1.15); }
      g.closePath(); g.fill(); g.strokeStyle = rgba(l, 1); g.lineWidth = 1; g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(L, 0); g.lineTo(L * 0.2, -th * 0.45); g.lineTo(-L * 0.1, 0); g.closePath(); g.fill();
    } else if (kind === 'star') { // a little star with a gold tail
      halo(L + 6, 7, 0.45);
      const tg = g.createLinearGradient(-L - 6, 0, L * 0.4, 0); tg.addColorStop(0, rgba(d, 0)); tg.addColorStop(1, rgba(d, 0.9));
      g.fillStyle = tg; g.beginPath(); g.moveTo(-L - 6, 0); g.lineTo(L * 0.4, -th * 1.1); g.lineTo(L * 0.4, th * 1.1); g.closePath(); g.fill();
      g.fillStyle = rgba(m, 1); starPath(g, L * 0.45, 0, th * 2.1, 5, 0.46, -Math.PI / 2 + 0.3); g.fill();
      g.fillStyle = '#ffffff'; starPath(g, L * 0.45, 0, th * 1.05, 5, 0.46, -Math.PI / 2 + 0.3); g.fill();
    } else { // gold, champ: the blaster capsule in new colours (champ is thicker, red outside, gold inside)
      const k = kind === 'champ' ? 1.3 : 1;
      halo(L + 7, (L + 7) * 0.45, 0.55);
      const bg = g.createLinearGradient(-L, 0, L, 0); bg.addColorStop(0, rgba(m, 0)); bg.addColorStop(0.5, rgba(m, 0.95)); bg.addColorStop(1, rgba(kind === 'champ' ? d : l, 1));
      g.fillStyle = bg; g.beginPath(); g.roundRect(-L, -th * k, L * 2, th * 2 * k, th * k); g.fill();
      g.fillStyle = 'rgba(255,255,240,1)'; g.beginPath(); g.roundRect(-L * 0.3, -th * 0.45 * k, L * 1.2, th * 0.9 * k, th * 0.45 * k); g.fill();
      if (kind === 'champ') { g.strokeStyle = rgba(d, 0.9); g.lineWidth = 1; g.beginPath(); for (const sd of [-1, 1]) { g.moveTo(-L * 0.2, sd * th * 1.6); g.lineTo(-L * 0.9, sd * th * 2.3); } g.stroke(); }
    }
  });
}
// kind: 'blaster' | 'bot' | ember gold cyan violet ice star champ; lv = blaster level; ang = flight angle
export function drawBolt(c, x, y, kind = 'blaster', lv = 0, ang = 0) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y); if (ang) c.rotate(ang);
  if (kind === 'missile') {
    const e = missileSprite(), fl = 0.7 + 0.3 * Math.sin(x * 0.3 + y);
    c.drawImage(glow('#ff8ad8'), -24, -6, 16, 12); c.fillStyle = `rgba(255,220,120,${fl})`; c.beginPath(); c.moveTo(-9, -2); c.lineTo(-16 - 5 * fl, 0); c.lineTo(-9, 2); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over'; c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  } else if (kind === 'bot') {
    c.drawImage(glow('#5ef2ff'), -12, -5, 24, 10);
    c.fillStyle = 'rgba(94,242,255,.9)'; c.beginPath(); c.roundRect(-8, -1.4, 16, 2.8, 1.4); c.fill();
    c.fillStyle = '#eaffff'; c.fillRect(-4, -0.6, 10, 1.2);
  } else { const e = BOLT_PAL[kind] ? kindBolt(kind, lv) : boltSprite(lv); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); }
  c.restore();
}

// ---------- costume particles: fxSprite(kind, col) ----------
// 48×48 px additive particle sprites (draw centred at 2r×2r with 'lighter', like glow()).
// kinds: ember spark sparkle comet crystal snow star (flame or unknown → glow(col))
const FXS = new LRU(64);
export const FX_KINDS = ['flame', 'ember', 'spark', 'sparkle', 'comet', 'crystal', 'snow', 'star'];
export function fxSprite(kind = 'flame', col = '#ffb04a') {
  if (kind === 'flame' || !FX_KINDS.includes(kind)) return glow(col);
  const key = kind + '|' + col; let cv = FXS.get(key); if (cv) return cv;
  const N = 48, h = 24; cv = mk(N, N); const g = cv.getContext('2d'), a = rgbOf(col), wl = mixc(a, [255, 255, 255], 0.65);
  g.translate(h, h); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const soft = (r, al) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, rgba(a, al)); gr.addColorStop(0.4, rgba(a, al * 0.35)); gr.addColorStop(1, rgba(a, 0)); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); };
  if (kind === 'ember') {
    soft(20, 0.55);
    const gr = g.createRadialGradient(-1, -1, 0, 0, 0, 9); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.45, rgba(a, 0.95)); gr.addColorStop(1, rgba(a, 0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -9); g.quadraticCurveTo(8, -5, 7, 2); g.quadraticCurveTo(4, 9, -2, 8); g.quadraticCurveTo(-9, 5, -7, -2); g.quadraticCurveTo(-5, -8, 0, -9); g.fill();
  } else if (kind === 'spark') {
    soft(14, 0.6);
    for (const [ang, l, w] of [[0, 21, 2.2], [Math.PI / 2, 21, 2.2], [Math.PI / 4, 11, 1.4], [-Math.PI / 4, 11, 1.4]]) {
      g.save(); g.rotate(ang); const lg = g.createLinearGradient(-l, 0, l, 0); lg.addColorStop(0, rgba(a, 0)); lg.addColorStop(0.5, rgba(wl, 1)); lg.addColorStop(1, rgba(a, 0));
      g.fillStyle = lg; g.beginPath(); g.moveTo(-l, 0); g.lineTo(0, -w); g.lineTo(l, 0); g.lineTo(0, w); g.closePath(); g.fill(); g.restore();
    }
  } else if (kind === 'sparkle' || kind === 'star') {
    soft(16, 0.5);
    if (kind === 'star') { g.fillStyle = rgba(a, 1); starPath(g, 0, 1, 13, 5, 0.46); g.fill(); g.fillStyle = rgba(wl, 1); starPath(g, 0, 1, 6.5, 5, 0.46); g.fill(); }
    else for (const [w, l, al] of [[3.2, 23, 0.85], [1.4, 23, 1]]) for (let k = 0; k < 2; k++) {
      g.save(); g.rotate(k * Math.PI / 2); const lg = g.createLinearGradient(-l, 0, l, 0); lg.addColorStop(0, rgba(a, 0)); lg.addColorStop(0.5, rgba(k ? wl : a, al)); lg.addColorStop(1, rgba(a, 0));
      g.fillStyle = lg; g.beginPath(); g.moveTo(-l, 0); g.lineTo(0, -w); g.lineTo(l, 0); g.lineTo(0, w); g.closePath(); g.fill(); g.restore();
    }
  } else if (kind === 'comet') { // a long streak, bright head on the left
    const lg = g.createLinearGradient(-22, 0, 24, 0); lg.addColorStop(0, rgba(wl, 1)); lg.addColorStop(0.18, rgba(a, 0.9)); lg.addColorStop(1, rgba(a, 0));
    g.fillStyle = lg; g.beginPath(); g.moveTo(-23, 0); g.quadraticCurveTo(-20, -6, -12, -5); g.lineTo(24, -1); g.lineTo(24, 1); g.lineTo(-12, 5); g.quadraticCurveTo(-20, 6, -23, 0); g.fill();
    const gr = g.createRadialGradient(-16, 0, 0, -16, 0, 9); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, rgba(a, 0)); g.fillStyle = gr; g.fillRect(-25, -9, 18, 18);
  } else if (kind === 'crystal') {
    soft(18, 0.4);
    g.fillStyle = rgba(a, 0.95); g.beginPath(); g.moveTo(0, -15); g.lineTo(8, -2); g.lineTo(0, 15); g.lineTo(-8, -2); g.closePath(); g.fill();
    g.strokeStyle = rgba(wl, 1); g.lineWidth = 1.4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.moveTo(0, -12); g.lineTo(3, -2); g.lineTo(-3, -2); g.closePath(); g.fill();
  } else if (kind === 'snow') {
    soft(15, 0.45);
    g.strokeStyle = rgba(wl, 1); g.lineWidth = 2; g.beginPath();
    for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3, cx = Math.cos(an), cy = Math.sin(an); g.moveTo(0, 0); g.lineTo(cx * 17, cy * 17);
      for (const d of [8, 12.5]) { const bx = cx * d, by = cy * d, b1 = an + 0.75, b2 = an - 0.75, bl = d > 10 ? 3.6 : 5; g.moveTo(bx, by); g.lineTo(bx + Math.cos(b1) * bl, by + Math.sin(b1) * bl); g.moveTo(bx, by); g.lineTo(bx + Math.cos(b2) * bl, by + Math.sin(b2) * bl); } }
    g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill();
  }
  FXS.set(key, cv); return cv;
}

export function drawBotLaser(c, x1, y1, x2, y2, f = 1) {
  f = clamp(f, 0, 1); if (f <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (const [w, col, a] of [[9, '94,242,255', 0.16], [4.5, '94,242,255', 0.5], [1.6, '235,255,255', 1]]) { c.strokeStyle = `rgba(${col},${a * f})`; c.lineWidth = w * (0.6 + 0.4 * f); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  glowAt(c, '#5ef2ff', x2, y2, 14, f); glowAt(c, '#ffffff', x2, y2, 5, f); glowAt(c, '#5ef2ff', x1, y1, 8, f * 0.8);
  c.restore();
}

// ---------- super beam (Amal Beam) ----------
let BEAMS = null;
function beamSprites() {
  if (BEAMS) return BEAMS;
  const prof = (stops) => { const cv = mk(2, 128), g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, 2, 128); return cv; };
  const sym = (col, pts) => { const s = []; for (const [o, a] of pts) { s.push([0.5 - o / 2, `rgba(${col},${a})`]); } for (let i = pts.length - 1; i >= 0; i--) s.push([0.5 + pts[i][0] / 2, `rgba(${col},${pts[i][1]})`]); return s.sort((a, b) => a[0] - b[0]); };
  const gold = prof(sym('255,190,60', [[1, 0], [0.75, 0.18], [0.45, 0.55], [0.2, 0.9], [0, 1]]));
  const teal = prof(sym('63,242,224', [[1, 0], [0.7, 0.35], [0.35, 0.85], [0, 1]]));
  const core = prof(sym('255,255,250', [[1, 0], [0.75, 0.6], [0.4, 1], [0, 1]]));
  // energy streak tile, 512×64, scrolled along the beam
  const st = mk(512, 64), g = st.getContext('2d'), r = rng(9); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 60; i++) {
    const y = 32 + (r() - 0.5) * 50 * r(), l = 30 + r() * 120, x = r() * 512, a = 0.25 + r() * 0.5, w = 0.8 + r() * 2;
    for (const dx of [0, -512]) { const lg = g.createLinearGradient(x + dx, 0, x + dx + l, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.7, `rgba(255,250,220,${a})`); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(x + dx, y - w / 2, l, w); }
  }
  BEAMS = { gold, teal, core, st }; return BEAMS;
}
export function drawBeam(c, x, y, W, f = 1, t = 0) {
  f = clamp(f, 0, 1);
  const env = f > 0.9 ? smooth(1, 0.9, f) : f < 0.16 ? smooth(0, 0.16, f) : 1; if (env <= 0.005) return;
  const B = beamSprites(), pulse = 1 + 0.07 * Math.sin(t * 38) + 0.05 * Math.sin(t * 23 + 1), h = 46 * pulse * (0.35 + 0.65 * env), len = W - x + 30;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.7 * env; c.drawImage(B.gold, x, y - h * 1.15, len, h * 2.3);
  c.globalAlpha = 0.85 * env; c.drawImage(B.teal, x, y - h * 0.55, len, h * 1.1);
  // wavy energy edges
  c.globalAlpha = 0.6 * env; c.strokeStyle = 'rgba(160,255,245,1)'; c.lineWidth = 1.6;
  for (const sd of [-1, 1]) { c.beginPath(); for (let k = 0; k <= 24; k++) { const px = x + k / 24 * len, py = y + sd * h * (0.42 + 0.06 * Math.sin(k * 1.3 - t * 30 * sd)); k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
  // streaks
  c.globalAlpha = 0.55 * env; const off = (t * 1500) % 512;
  for (let sx = x - off; sx < W + 20; sx += 512) c.drawImage(B.st, sx, y - h * 0.5, 512, h);
  c.globalAlpha = env; c.drawImage(B.core, x, y - h * 0.22, len, h * 0.44);
  // pulsing rings travelling outward
  c.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const ph = fract(t * 1.3 + i / 5), px = x + 20 + ph * (len - 20);
    c.strokeStyle = `rgba(${i % 2 ? '63,242,224' : '255,210,100'},${(1 - ph) * 0.75 * env})`;
    c.beginPath(); c.ellipse(px, y, h * 0.16 + ph * 4, h * (0.72 + ph * 0.25), 0, 0, TAU); c.stroke();
  }
  // sparkles
  const ns = Q >= 2 ? 8 : 16;
  for (let i = 0; i < ns; i++) { const ph = fract(sr(i) + t * (0.6 + sr(i + 3) * 0.6)), px = x + ph * len, py = y + (sr(i + 9) - 0.5) * h * 1.6 * (0.5 + ph * 0.5); flareAt(c, px, py, 5 + sr(i + 5) * 7, env * Math.sin(ph * Math.PI)); }
  // muzzle
  glowAt(c, '#ffd27a', x, y, h * 1.6, env); glowAt(c, '#ffffff', x, y, h * 0.7, env); flareAt(c, x, y, h * 1.2, env, t * 2);
  c.restore();
}

// ---------- shield ----------
let HEX = null;
function hexSprite() {
  if (HEX) return HEX;
  const N = 192, cv = mk(N, N), g = cv.getContext('2d'); g.translate(N / 2, N / 2); const u = N / 2;
  g.strokeStyle = 'rgba(140,230,255,1)'; g.lineWidth = 1.6; const hs = 0.15 * u, hw = hs * Math.sqrt(3);
  g.beginPath();
  for (let row = -8; row <= 8; row++) for (let col = -6; col <= 6; col++) {
    const cx = col * hw + (row & 1 ? hw / 2 : 0), cy = row * hs * 1.5;
    if (cx * cx + cy * cy > u * u * 1.1) continue;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = cx + Math.cos(a) * hs, py = cy + Math.sin(a) * hs; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.closePath();
  }
  g.stroke();
  g.globalCompositeOperation = 'destination-in';
  let gr = g.createRadialGradient(0, 0, 0, 0, 0, u); gr.addColorStop(0, 'rgba(0,0,0,.08)'); gr.addColorStop(0.6, 'rgba(0,0,0,.25)'); gr.addColorStop(0.93, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(-u, -u, N, N);
  g.globalCompositeOperation = 'lighter';
  gr = g.createRadialGradient(0, 0, u * 0.55, 0, 0, u); gr.addColorStop(0, 'rgba(80,190,255,0)'); gr.addColorStop(0.85, 'rgba(80,190,255,.22)'); gr.addColorStop(0.97, 'rgba(170,240,255,.75)'); gr.addColorStop(1, 'rgba(170,240,255,0)');
  g.fillStyle = gr; g.fillRect(-u, -u, N, N);
  gr = g.createRadialGradient(-u * 0.4, -u * 0.45, 0, -u * 0.4, -u * 0.45, u * 0.45); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(-u, -u, N, N);
  HEX = cv; return cv;
}
export function drawShieldBubble(c, x, y, r, f = 1, t = 0) {
  f = clamp(f, 0, 1); if (f <= 0.01) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y);
  c.globalAlpha = f * (0.75 + 0.15 * Math.sin(t * 5)); c.save(); c.rotate(t * 0.2); c.drawImage(hexSprite(), -r, -r, r * 2, r * 2); c.restore();
  c.globalAlpha = f; c.rotate(t * 1.7); c.lineCap = 'round';
  c.strokeStyle = 'rgba(210,250,255,.9)'; c.lineWidth = 2.2; c.beginPath(); c.arc(0, 0, r * 0.95, 0, 0.9); c.stroke();
  c.strokeStyle = 'rgba(120,220,255,.6)'; c.lineWidth = 1.4; c.beginPath(); c.arc(0, 0, r * 0.95, Math.PI, Math.PI + 0.55); c.stroke();
  c.restore();
}

// ---------- ship ----------
const SHIP_S = [1, 1.06, 1.12, 1.19, 1.26];
export const shipScale = tier => SHIP_S[clamp(tier | 0, 0, 4)];
// collision radius suggestion (circle) for the ship body at each tier
export const shipRadius = tier => 16 * shipScale(tier);
const MOUNTS = { N: [42, 3], U: [17, -13.5], L: [19, 15], UU: [5, -21], LL: [7, 24] };
const GUNSETS = [null, [['N', 0]], [['U', -0.04], ['L', 0.04]], [['N', 0], ['U', -0.1], ['L', 0.1]], [['U', -0.05], ['L', 0.05], ['UU', -0.16], ['LL', 0.16]], [['N', 0], ['U', -0.08], ['L', 0.08], ['UU', -0.17], ['LL', 0.17]]];
export function GUN_POINTS(tier = 0, guns = 1) {
  const S = shipScale(tier), set = GUNSETS[clamp(guns | 0, 1, 5)];
  return set.map(([m, a]) => ({ dx: MOUNTS[m][0] * S, dy: MOUNTS[m][1] * S, angle: a }));
}
function engines(tier) { // [x, y, size] in tier-0 units
  const eb = tier * 0.9, e = [[-37 - eb, 0.5, 1]];
  if (tier >= 2) e.push([-34 - eb * 0.6, -6.5, 0.42], [-34 - eb * 0.6, 7.5, 0.42]);
  if (tier >= 3) e.push([-24, 21.5 + tier * 1.3, 0.38]);
  if (tier >= 4) e.push([-24, -19.5 - tier * 1.3 + 2, 0.32]);
  return e;
}
function gunPod(g, m, under) {
  const [mx, my] = MOUNTS[m];
  g.strokeStyle = INK; g.lineWidth = 1.3;
  g.fillStyle = '#7d879e'; g.beginPath(); g.moveTo(mx - 10, my + (under ? -2 : 2)); g.lineTo(mx - 16, my + (under ? -8 : 8)); g.lineTo(mx - 12, my + (under ? -8 : 8)); g.lineTo(mx - 6, my + (under ? -2 : 2)); g.closePath(); g.fill(); g.stroke();
  const pg = g.createLinearGradient(0, my - 2.6, 0, my + 2.6); pg.addColorStop(0, '#a7b0c4'); pg.addColorStop(1, '#4a4f63');
  g.fillStyle = pg; g.beginPath(); g.roundRect(mx - 16, my - 2.6, 13, 5.2, 2.6); g.fill(); g.stroke();
  g.fillStyle = '#2a2d3c'; g.beginPath(); g.roundRect(mx - 4, my - 1.2, 4.2, 2.4, 1); g.fill(); g.stroke();
  g.fillStyle = '#ff8a3d'; g.fillRect(mx - 9, my - 2.6, 1.6, 5.2);
}
// ship paints (§5): { hull, hull2, trim, stripe, glow }; falak is the v1 look
export const SKIN_COLORS = {
  falak: { hull: '#ffffff', hull2: '#a6b1c7', trim: '#e8572b', stripe: '#ffb347', glow: '#5ef2ff' },
  patch: { hull: '#ece6d4', hull2: '#9c9480', trim: '#e8892b', stripe: '#8a93a8', glow: '#ffd27a' },
  hornet: { hull: '#ffd84a', hull2: '#c9930f', trim: '#1d1b22', stripe: '#1d1b22', glow: '#fff27a' },
  radar: { hull: '#ffffff', hull2: '#b4c0d4', trim: '#2f7fe0', stripe: '#7fc0ff', glow: '#5ec8ff' },
  whirl: { hull: '#4fe0d2', hull2: '#1f8a86', trim: '#ff8a2a', stripe: '#ffd27a', glow: '#9ff0e8' },
  anvil: { hull: '#6b7189', hull2: '#2a2d3c', trim: '#e8b64a', stripe: '#ffd23f', glow: '#ffb347' },
  royal: { hull: '#ffffff', hull2: '#d6c08c', trim: '#e8b64a', stripe: '#2fd1c5', glow: '#3ff2e0' },
};
export const SKIN_IDS = Object.keys(SKIN_COLORS);
const SKIN_DER = new Map();
function skinCols(id) { // derived shades, cached
  let K = SKIN_DER.get(id); if (K) return K;
  const B = SKIN_COLORS[id] || SKIN_COLORS.falak, h = rgbOf(B.hull), h2 = rgbOf(B.hull2);
  K = Object.assign({ id }, B, id === 'falak'
    ? { hullM: '#eef2f8', wing1: '#f4f6fa', wing2: '#b4bed2', far: '#8b96b0', fin: '#ff7a45' }
    : { hullM: rgba(mixc(h, h2, 0.12)), wing1: rgba(mixc(h, [255, 255, 255], 0.25)), wing2: rgba(mixc(h, h2, 0.7)), far: rgba(shade(h2, 0.82)), fin: lighten(B.trim, 0.22) });
  SKIN_DER.set(id, K); return K;
}
// paint details, drawn inside the fuselage clip
function skinPattern(g, K) {
  const id = K.id;
  if (id === 'patch') {
    for (const [x, y, w, h, col] of [[-27, -9.5, 13, 9, '#d8d0b6'], [-7, -10, 15, 8.5, '#c6bfa6'], [11, 0.5, 15, 10, '#b9b197'], [-20, 3, 12, 8, '#cdd2da']]) {
      g.fillStyle = col; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(28,21,48,.45)'; g.lineWidth = 0.7; g.strokeRect(x, y, w, h);
      g.fillStyle = 'rgba(28,21,48,.5)'; for (const [rx, ry] of [[x + 1.4, y + 1.4], [x + w - 1.4, y + 1.4], [x + 1.4, y + h - 1.4], [x + w - 1.4, y + h - 1.4]]) { g.beginPath(); g.arc(rx, ry, 0.55, 0, TAU); g.fill(); }
    }
    g.save(); g.translate(2, -1); g.rotate(0.55); g.fillStyle = '#c9cfd9'; g.strokeStyle = 'rgba(28,21,48,.55)'; g.lineWidth = 0.6; g.fillRect(-7, -1.8, 14, 3.6); g.strokeRect(-7, -1.8, 14, 3.6); g.rotate(-1.1); g.fillRect(-7, -1.8, 14, 3.6); g.strokeRect(-7, -1.8, 14, 3.6); g.restore();
  } else if (id === 'hornet') {
    g.fillStyle = '#1d1b22'; for (const x of [-25, -12, 1, 14, 27]) { g.beginPath(); g.moveTo(x, -11); g.lineTo(x + 5.5, -11); g.lineTo(x + 1.5, 12); g.lineTo(x - 4, 12); g.closePath(); g.fill(); }
  } else if (id === 'radar') {
    g.fillStyle = '#2f7fe0'; g.strokeStyle = 'rgba(28,21,48,.5)'; g.lineWidth = 0.6;
    for (const [x, y, w, h] of [[-27, -7.5, 8, 5], [-17, -7.5, 8, 5], [-24, 6.5, 30, 3]]) { g.beginPath(); g.roundRect(x, y, w, h, 1.5); g.fill(); g.stroke(); }
    g.fillStyle = '#bfe0ff'; for (const x of [-25.5, -15.5]) g.fillRect(x, -6.5, 2.4, 1.2);
  } else if (id === 'whirl') {
    g.strokeStyle = K.trim; g.lineWidth = 2.6;
    for (let k = 0; k < 3; k++) { const cx = -22 + k * 17; g.beginPath(); g.arc(cx, 1, 6, Math.PI * 0.9, Math.PI * 2.3); g.stroke(); }
    g.strokeStyle = K.stripe; g.lineWidth = 1; for (let k = 0; k < 3; k++) { const cx = -22 + k * 17; g.beginPath(); g.arc(cx, 1, 3, Math.PI * 1.1, Math.PI * 2.4); g.stroke(); }
  } else if (id === 'anvil') {
    g.strokeStyle = 'rgba(10,8,20,.55)'; g.lineWidth = 0.9; g.beginPath(); for (const x of [-22, -8, 8, 24]) { g.moveTo(x, -11); g.lineTo(x, 11); } g.moveTo(-34, -4.5); g.lineTo(40, -4.5); g.stroke();
    g.fillStyle = '#ffd23f'; g.strokeStyle = 'rgba(28,21,48,.7)'; g.lineWidth = 0.5;
    for (const x of [-25, -19, -11, -5, 5, 11, 21, 27]) for (const y of [-7, 8.2]) { g.beginPath(); g.arc(x, y, 0.9, 0, TAU); g.fill(); g.stroke(); }
  } else if (id === 'royal') {
    g.strokeStyle = '#e8b64a'; g.lineWidth = 1.1; g.beginPath(); for (let x = -33; x <= 34; x += 1.5) { const y = -5.4 + Math.sin(x * 0.42) * 1.4; x === -33 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    g.fillStyle = '#e8b64a'; for (let x = -30; x < 34; x += 7.5) { g.beginPath(); g.arc(x, -5.4 + Math.sin(x * 0.42) * 1.4, 0.9, 0, TAU); g.fill(); }
  }
}
function shipBody(g, tier, guns, cid, girl, skin) {
  const S = suitCol(cid, girl), K = skinCols(skin), trim = K.trim, gold = '#f2b630', wy = 19 + tier * 1.3, wx = tier >= 4 ? 5 : tier >= 2 ? 2 : 0, eb = tier * 0.9;
  const set = (GUNSETS[guns] || GUNSETS[1]).map(a => a[0]);
  g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 1.7;
  // far wing (behind)
  g.fillStyle = K.far; g.beginPath(); g.moveTo(5, -6); g.lineTo(-13 - wx, -wy + 2); g.lineTo(-22 - wx, -wy + 2); g.lineTo(-19, -6); g.closePath(); g.fill(); g.stroke();
  if (tier >= 4) { g.fillStyle = '#5b6178'; g.beginPath(); g.roundRect(-30, -wy - 0.5, 14, 5, 2.5); g.fill(); g.stroke(); }
  for (const m of ['U', 'UU']) if (set.includes(m)) gunPod(g, m, false);
  // tail fin
  const fg = g.createLinearGradient(0, -24, 0, -8); fg.addColorStop(0, K.fin); fg.addColorStop(1, trim);
  g.fillStyle = fg; g.beginPath(); g.moveTo(-16, -8); g.lineTo(-27 - tier, -23 - tier * 0.8); g.quadraticCurveTo(-32 - tier, -24 - tier * 0.8, -35 - tier, -22 - tier * 0.8); g.lineTo(-31, -7); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-20, -10); g.lineTo(-28 - tier, -21 - tier * 0.8); g.stroke(); g.strokeStyle = INK; g.lineWidth = 1.7;
  if (skin === 'hornet') { g.fillStyle = '#ffd84a'; g.beginPath(); g.moveTo(-22, -13); g.lineTo(-25 - tier * 0.5, -17); g.lineTo(-29 - tier * 0.7, -16); g.lineTo(-27, -12); g.closePath(); g.fill(); }
  if (tier >= 1) { g.fillStyle = trim; g.beginPath(); g.moveTo(-19, 8); g.lineTo(-28, 16 + tier * 0.6); g.lineTo(-33, 16 + tier * 0.6); g.lineTo(-31, 7); g.closePath(); g.fill(); g.stroke(); }
  // engine bells
  const bell = (bx, by, s) => { g.fillStyle = '#4a4f63'; g.beginPath(); g.moveTo(bx + 6 * s, by - 5.5 * s); g.lineTo(bx - 1, by - 7.5 * s - eb * s * 0.5); g.lineTo(bx - 1, by + 7.5 * s + eb * s * 0.5); g.lineTo(bx + 6 * s, by + 5.5 * s); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(bx - 0.6, by, 1.5 * s, (7 + eb * 0.5) * s, 0, 0, TAU); g.fill(); g.lineWidth = 1; g.stroke(); g.lineWidth = 1.7; };
  if (tier >= 2) { bell(-33 - eb * 0.6, -6.5, 0.45); bell(-33 - eb * 0.6, 7.5, 0.45); }
  bell(-36 - eb, 0.5, 1);
  // fuselage
  const fus = () => { g.beginPath(); g.moveTo(39, 3); g.quadraticCurveTo(31, -6.5, 14, -9); g.lineTo(-20, -9.5); g.quadraticCurveTo(-31, -9.5, -33.5, -5); g.lineTo(-33.5, 7); g.quadraticCurveTo(-29, 10.5, -16, 10.5); g.lineTo(18, 9.5); g.quadraticCurveTo(33, 8.5, 39, 3); g.closePath(); };
  const hg = g.createLinearGradient(0, -10, 0, 11); hg.addColorStop(0, K.hull); hg.addColorStop(0.45, K.hullM); hg.addColorStop(1, K.hull2);
  fus(); g.fillStyle = hg; g.fill();
  g.save(); fus(); g.clip();
  skinPattern(g, K);
  g.fillStyle = trim; g.beginPath(); g.moveTo(42, 2); g.lineTo(-36, 1.2); g.lineTo(-36, 4.6); g.lineTo(42, 5.2); g.closePath(); g.fill();
  if (tier >= 1) { g.fillStyle = tier >= 3 ? gold : skin !== 'falak' ? K.stripe : S.trim2 === '#ffffff' ? '#ffb347' : S.trim2; g.fillRect(-36, 5.6, 78, 1.3); }
  if (tier >= 3) { g.fillStyle = gold; g.fillRect(-36, -0.4, 78, 1); }
  g.strokeStyle = 'rgba(60,70,110,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-8, -10); g.lineTo(-8, 11); g.moveTo(24, -9); g.lineTo(24, 10); g.moveTo(-20, 7.5); g.lineTo(18, 7.5); g.stroke();
  if (tier >= 2) { g.strokeStyle = K.glow; g.lineWidth = 1; g.beginPath(); g.moveTo(-30, -4); g.lineTo(-12, -4); g.lineTo(-9, -6.5); g.lineTo(2, -6.5); g.moveTo(-14, 8); g.lineTo(10, 8); g.stroke(); }
  g.fillStyle = skin === 'anvil' ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(36, 1); g.quadraticCurveTo(28, -6, 12, -7.6); g.lineTo(-18, -8); g.lineTo(-18, -6.6); g.lineTo(12, -6); g.quadraticCurveTo(27, -4.5, 36, 1); g.closePath(); g.fill();
  if (tier >= 1) { const ng = g.createLinearGradient(30, 0, 40, 0); ng.addColorStop(0, '#9aa3b8'); ng.addColorStop(1, '#e8ecf4'); g.fillStyle = ng; g.beginPath(); g.moveTo(31, -4); g.quadraticCurveTo(36, -1, 40, 3); g.quadraticCurveTo(36, 6, 31, 8.5); g.closePath(); g.fill(); }
  g.restore();
  fus(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
  uaeFlag(g, -28.5, -6.5, 9, 6, 0.7);
  // canards
  if (tier >= 2) { g.fillStyle = trim; g.lineWidth = 1.4; g.beginPath(); g.moveTo(27, 5); g.lineTo(21, 11.5); g.lineTo(17, 11.5); g.lineTo(20, 5.5); g.closePath(); g.fill(); g.stroke(); }
  // near wing
  const wg = g.createLinearGradient(0, 4, 0, wy); wg.addColorStop(0, K.wing1); wg.addColorStop(1, K.wing2);
  const wing = () => { g.beginPath(); g.moveTo(11, 5); g.lineTo(-11 - wx, wy); g.lineTo(-23 - wx, wy); g.lineTo(-19, 5.5); g.closePath(); };
  wing(); g.fillStyle = wg; g.fill(); g.lineWidth = 1.7; g.stroke();
  g.save(); wing(); g.clip(); g.fillStyle = trim; g.beginPath(); g.moveTo(11, 5); g.lineTo(-11 - wx, wy); g.lineTo(-14 - wx, wy); g.lineTo(7, 5); g.closePath(); g.fill();
  if (skin === 'hornet') { g.fillStyle = '#1d1b22'; g.beginPath(); g.moveTo(-6, 5); g.lineTo(-1, 5); g.lineTo(-13 - wx, wy); g.lineTo(-18 - wx, wy); g.closePath(); g.fill(); }
  else if (skin === 'patch') { g.save(); g.translate(-9, 12); g.rotate(-0.5); g.fillStyle = '#c9cfd9'; g.strokeStyle = 'rgba(28,21,48,.55)'; g.lineWidth = 0.6; g.fillRect(-6, -1.6, 12, 3.2); g.strokeRect(-6, -1.6, 12, 3.2); g.restore(); }
  else if (skin === 'anvil' || skin === 'royal') { g.fillStyle = '#ffd23f'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(-17 + k * 5 - wx * 0.5, 7.5 + k * (wy - 9) / 4, 0.9, 0, TAU); g.fill(); } }
  else if (skin === 'radar') { g.fillStyle = '#2f7fe0'; g.fillRect(-24 - wx, wy - 3.2, 14, 3.2); }
  else if (skin === 'whirl') { g.strokeStyle = K.trim; g.lineWidth = 1.6; g.beginPath(); g.arc(-12, wy - 2, 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  if (tier >= 3) { g.fillStyle = gold; g.fillRect(-30, wy - 2.2, 30, 2.2); }
  g.restore(); wing(); g.strokeStyle = INK; g.stroke();
  if (tier >= 4) { g.strokeStyle = K.glow; g.lineWidth = 1.1; g.beginPath(); g.moveTo(9, 6.5); g.lineTo(-11 - wx, wy - 1); g.stroke(); g.strokeStyle = INK; g.lineWidth = 1.7; }
  if (tier >= 3) { // wingtip engine pod
    const pg = g.createLinearGradient(0, wy - 3, 0, wy + 4); pg.addColorStop(0, '#e8ecf4'); pg.addColorStop(1, '#7d879e');
    g.fillStyle = pg; g.beginPath(); g.roundRect(-25, wy - 2.5, 16, 6, 3); g.fill(); g.lineWidth = 1.4; g.stroke();
    g.fillStyle = trim; g.beginPath(); g.roundRect(-13, wy - 2.5, 4, 6, 2); g.fill(); g.stroke();
  }
  for (const m of ['L', 'LL']) if (set.includes(m)) gunPod(g, m, true);
  if (set.includes('N')) { g.fillStyle = '#4a4f63'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.roundRect(34, 1.6, 8.5, 2.8, 1.2); g.fill(); g.stroke(); g.fillStyle = '#ff8a3d'; g.fillRect(40.5, 1.6, 1.4, 2.8); }
  // cockpit bubble with the pilot's helmeted head (Abood, or Mozah in her hood)
  const glass = () => { g.beginPath(); g.ellipse(13, -9.5, 11.5, 7.6, -0.05, 0, TAU); };
  g.save(); glass(); g.clip();
  g.fillStyle = '#16244a'; g.fillRect(0, -18, 26, 14);
  g.save(); g.translate(12.5, -10.2);
  g.fillStyle = S.main; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, 6.8, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = S.trim; g.fillRect(-7, 4.6, 14, 1.6);
  g.save(); g.translate(1.6, 0.2); g.beginPath(); g.arc(0, 0, 5.3, 0, TAU); g.clip(); g.fillStyle = css(S.visor || AB_VIS, 0.5); g.fillRect(-6, -6, 12, 12);
  if (girl) { g.translate(0, 0.8); g.scale(0.56, 0.56); mozahHead(g, 'smile', false, 0, S.hijab); } else { g.scale(0.56, 0.56); aboodHead(g, 'smile'); }
  g.restore();
  g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); g.arc(1.6, 0.2, 5.4, 0, TAU); g.stroke();
  g.restore();
  const cg = g.createLinearGradient(4, -17, 20, -3); cg.addColorStop(0, 'rgba(210,245,255,.6)'); cg.addColorStop(0.5, 'rgba(120,200,240,.12)'); cg.addColorStop(1, 'rgba(40,90,170,.4)');
  g.fillStyle = cg; g.fillRect(0, -18, 26, 16);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(13, -9.5, 8.6, 5, -0.05, Math.PI * 1.08, Math.PI * 1.45); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(19.5, -13, 1.4, 0.8, -0.4, 0, TAU); g.fill();
  g.restore();
  glass(); g.strokeStyle = INK; g.lineWidth = 1.7; g.stroke();
  g.strokeStyle = skin === 'royal' || skin === 'anvil' ? '#c9a24a' : '#7d879e'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(2.4, -6.4); g.quadraticCurveTo(13, -3.6, 24, -6.6); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(2.4, -5); g.quadraticCurveTo(13, -2.2, 24, -5.2); g.stroke();
  // antenna (tier 4)
  if (tier >= 4) { g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4, -9.5); g.lineTo(-9, -15); g.stroke(); g.fillStyle = K.glow; g.beginPath(); g.arc(-9, -15, 1.4, 0, TAU); g.fill(); g.stroke(); }
}
function shipSprite(tier, guns, cid, girl, skin) {
  const S = SHIP_S[tier];
  return bake('ship|' + tier + '|' + guns + '|' + (girl ? 'g' : 'b') + '|' + cid + '|' + skin, -50 * S, -36 * S, 98 * S, 72 * S, BAKE, g => { g.scale(S, S); shipBody(g, tier, guns, cid, girl, skin); });
}
function shipGlow(tier, col) { // additive panel-line glow layer for tier ≥ 2
  const S = SHIP_S[tier];
  return bake('shipglow|' + tier + '|' + col, -50 * S, -36 * S, 98 * S, 72 * S, BAKE, g => {
    g.scale(S, S); g.strokeStyle = css(col, 0.5); g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-30, -4); g.lineTo(-12, -4); g.lineTo(-9, -6.5); g.lineTo(2, -6.5); g.moveTo(-14, 8); g.lineTo(10, 8);
    if (tier >= 4) { const wy = 19 + tier * 1.3; g.moveTo(9, 6.5); g.lineTo(-16, wy - 1); }
    g.stroke();
  });
}
// engine flame sprites; the default orange set is the v1 look, a costume trail [c1, c2, c3] tints them
const FLAMES = new Map();
function flameSprites(trail) {
  const key = trail ? trail.join() : 'def'; let F = FLAMES.get(key); if (F) return F;
  const one = (stops) => { const cv = mk(160, 64), g = cv.getContext('2d'); g.translate(160, 32); g.scale(1, 0.2); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 160); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(-160, -160, 160, 320); return cv; };
  if (!trail) F = {
    out: one([[0, 'rgba(255,110,40,1)'], [0.35, 'rgba(255,60,40,.55)'], [0.75, 'rgba(200,30,80,.15)'], [1, 'rgba(160,20,90,0)']]),
    mid: one([[0, 'rgba(255,215,90,1)'], [0.45, 'rgba(255,150,40,.6)'], [1, 'rgba(255,100,30,0)']]),
    core: one([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(220,245,255,.75)'], [1, 'rgba(140,200,255,0)']]), glow: '#ffb050',
  };
  else { const [a, b, l] = trail.map(rgbOf); F = {
    out: one([[0, rgba(b, 1)], [0.35, rgba(shade(b, 0.85), 0.55)], [0.75, rgba(shade(b, 0.6), 0.15)], [1, rgba(b, 0)]]),
    mid: one([[0, rgba(a, 1)], [0.45, rgba(b, 0.6)], [1, rgba(b, 0)]]),
    core: one([[0, 'rgba(255,255,255,1)'], [0.4, rgba(l, 0.75)], [1, rgba(l, 0)]]), glow: trail[0],
  }; }
  if (FLAMES.size > 24) FLAMES.clear();
  FLAMES.set(key, F); return F;
}
function flame(c, x, y, len, th, t, k, F = flameSprites(null)) {
  const fl = 0.86 + 0.1 * Math.sin(t * 47 + k * 3) + 0.06 * Math.sin(t * 29 + k), L = len * fl;
  c.drawImage(F.out, x - L * 1.15, y - th, L * 1.15, th * 2);
  c.drawImage(F.mid, x - L * 0.78, y - th * 0.62, L * 0.78, th * 1.24);
  c.drawImage(F.core, x - L * 0.42, y - th * 0.34, L * 0.42, th * 0.68);
  glowAt(c, F.glow, x, y, th * 1.8, 0.7);
}
// soft additive ring for costume auras; peak at 0.78 of the sprite radius
const AURA = new Map();
function auraSprite(col) {
  let cv = AURA.get(col); if (cv) return cv;
  cv = mk(128, 128); const g = cv.getContext('2d'), a = rgbOf(col), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(a, 0.12)); gr.addColorStop(0.55, rgba(a, 0.1)); gr.addColorStop(0.78, rgba(a, 1)); gr.addColorStop(0.88, rgba(a, 0.35)); gr.addColorStop(1, rgba(a, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); AURA.set(col, cv); return cv;
}
// aura = { col, r, a = 0.2, rings? } drawn additive behind the ship; rings:n draws n thin dashed rings instead
export function drawAura(c, x, y, aura, t = 0) {
  if (!aura || !(aura.r > 0)) return;
  const a = aura.a ?? 0.2, col = aura.col || '#5ef2ff';
  c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y);
  if (aura.rings) {
    c.strokeStyle = css(col, 1); c.lineWidth = 1.4; c.setLineDash([10, 7]);
    for (let i = 0; i < aura.rings; i++) { c.globalAlpha = a * (1 - i * 0.25); c.lineDashOffset = (i ? -t : t) * 14; c.beginPath(); c.arc(0, 0, aura.r * (1 - i * 0.14), 0, TAU); c.stroke(); }
    c.setLineDash([]);
  } else {
    const p = REDUCED ? 1 : 0.9 + 0.1 * Math.sin(t * 2.2), R = aura.r / 0.78 * p;
    c.globalAlpha = Math.min(1, a * 2.2); c.drawImage(auraSprite(col), -R, -R, R * 2, R * 2);
    for (let k = 0; k < 3; k++) { const an = t * 1.1 + k * TAU / 3; glowAt(c, col, Math.cos(an) * aura.r * p, Math.sin(an) * aura.r * 0.86 * p, 7, Math.min(1, a * 3)); }
  }
  c.restore();
}
// o = { t, tier, guns, tilt, thrust, hurt, shield, beam, char:'abood'|'mozah', costume (or o.suit), skin, aura, rings, ringR, trail }
//   aura: { col, r, a } | null (undefined → the costume's own aura)
//   rings: { col, a, n } | null (meta fx.rings, the magnet costume) drawn as n thin rings at radius ringR (pass
//   S.magnet; default 40); undefined → the costume's own rings
//   trail: [c1,c2,c3] tints the engine flames (undefined → the costume's trail colours)
export function drawShip(c, x, y, o = {}) {
  const t = o.t || 0, tier = clamp(o.tier | 0, 0, 4), guns = clamp(o.guns | 0 || 1, 1, 5), S = SHIP_S[tier], girl = o.char === 'mozah';
  const cid = costumeId(o.costume || o.suit, girl), skin = SKIN_COLORS[o.skin] ? o.skin : 'falak';
  const e = shipSprite(tier, guns, cid, girl, skin), tilt = clamp(o.tilt || 0, -1, 1) * 0.24, thrust = clamp(o.thrust ?? 0.5, 0, 1.5), hurt = clamp(o.hurt || 0, 0, 1);
  const aura = o.aura === undefined ? COSTUME_AURA[cid] : o.aura;
  if (aura) drawAura(c, x, y, aura, t);
  const rg = o.rings === undefined ? COSTUME_RINGS[cid] : o.rings;
  if (rg) { const R = rg.r || o.ringR || 40; if (R > 0) drawAura(c, x, y, { col: rg.col, a: rg.a ?? 0.12, r: R, rings: rg.n || 2 }, t); }
  c.save(); c.translate(x, y + Math.sin(t * 2.1) * 0.6); c.rotate(tilt);
  if (hurt > 0) { if (REDUCED) c.globalAlpha *= 0.65; else if (((t * 16) | 0) % 2 === 0) c.globalAlpha *= 0.4; }
  const ga = c.globalAlpha;
  c.globalCompositeOperation = 'lighter';
  const en = engines(tier), tr = o.trail !== undefined ? o.trail : COSTUME_TRAIL[cid], F = flameSprites(Array.isArray(tr) && tr.length >= 3 && tr.join() !== DEF_TRAIL.join() ? tr : null);
  for (let i = 0; i < en.length; i++) { const [ex, ey, sz] = en[i]; flame(c, ex * S, ey * S, (20 + 22 * thrust + tier * 3) * S * sz, (7.5 + tier * 0.4) * S * sz, t, i, F); }
  c.globalCompositeOperation = 'source-over';
  c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  if (tier >= 2) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = ga * (0.55 + 0.45 * Math.sin(t * 3)); const gl = shipGlow(tier, SKIN_COLORS[skin].glow); c.drawImage(gl.c, gl.x0, gl.y0, gl.w, gl.h); c.globalAlpha = ga; c.globalCompositeOperation = 'source-over'; }
  if (hurt > 0.55) { c.globalAlpha = ga * (hurt - 0.55) / 0.45 * 0.85; c.drawImage(whiteOf(e), e.x0, e.y0, e.w, e.h); c.globalAlpha = ga; }
  if (o.beam) { c.globalCompositeOperation = 'lighter'; const p = 0.8 + 0.2 * Math.sin(t * 40); glowAt(c, '#ffd27a', 42 * S, 3 * S, 20 * S * p, 0.9); glowAt(c, '#3ff2e0', 42 * S, 3 * S, 11 * S * p, 0.9); }
  c.restore();
  if (o.shield > 0) drawShieldBubble(c, x, y, 42 * S, o.shield, t);
}

// ---------- pickups ----------
function coinFace() {
  return bake('coin', -11, -11, 22, 22, BAKE * 2, g => {
    const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 10); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#d99a12');
    g.fillStyle = gr; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#b07a10'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 7.2, 0, TAU); g.stroke();
    g.fillStyle = '#8a5a08'; g.font = '800 7.5px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText('د.إ', 0, 0.6);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.3; g.beginPath(); g.arc(0, 0, 7.6, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  });
}
const PK = {
  repair: { col: '#3ccf7a', dk: '#1b7a45' },
  shield: { col: '#4aa8ff', dk: '#1d5aa8' },
  cell: { col: '#ffb02e', dk: '#b06a10' },
  rapid: { col: '#ff5a4a', dk: '#a8261c' },
};
function pickupIcon(kind) {
  const P = PK[kind];
  return bake('pk|' + kind, -15, -15, 30, 30, BAKE * 1.5, g => {
    const gr = g.createRadialGradient(-4, -5, 1, 0, 0, 13); gr.addColorStop(0, lighten(P.col, 0.5)); gr.addColorStop(0.6, P.col); gr.addColorStop(1, P.dk);
    g.fillStyle = gr; g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath();
    for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3, px = Math.cos(a) * 12.5, py = Math.sin(a) * 12.5; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-9, -5); g.lineTo(0, -10.2); g.lineTo(5, -7.5); g.stroke();
    g.fillStyle = '#fffaf0'; g.strokeStyle = INK; g.lineWidth = 1.3;
    if (kind === 'repair') { // wrench + plus
      g.save(); g.rotate(-0.75); g.beginPath(); g.roundRect(-1.8, -6, 3.6, 12, 1.6); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -7, 3.8, 0.9, Math.PI * 2.1); g.lineTo(1.5, -9.8); g.lineTo(-1.5, -9.8); g.closePath(); g.fill(); g.stroke(); g.restore();
      g.fillStyle = '#fffaf0'; g.beginPath(); g.roundRect(3, 2.5, 6.5, 2.4, 1); g.roundRect(5.05, 0.45, 2.4, 6.5, 1); g.fill();
    } else if (kind === 'shield') {
      g.beginPath(); g.moveTo(0, -8); g.lineTo(7, -5); g.quadraticCurveTo(7, 4, 0, 8.5); g.quadraticCurveTo(-7, 4, -7, -5); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = P.col; g.beginPath(); g.moveTo(0, -5); g.lineTo(4.5, -3); g.quadraticCurveTo(4.5, 2.8, 0, 5.6); g.closePath(); g.fill();
    } else if (kind === 'cell') {
      g.beginPath(); g.roundRect(-4.5, -7, 9, 14, 2); g.fill(); g.stroke(); g.fillStyle = '#4a4f63'; g.fillRect(-2, -9, 4, 2);
      g.fillStyle = '#ffb02e'; g.beginPath(); g.moveTo(1, -5); g.lineTo(-2.5, 0.8); g.lineTo(0, 0.8); g.lineTo(-1, 5); g.lineTo(2.6, -0.8); g.lineTo(0.2, -0.8); g.closePath(); g.fill(); g.lineWidth = 0.7; g.stroke();
    } else { // rapid: chip with double chevron
      g.beginPath(); g.roundRect(-6.5, -6.5, 13, 13, 2); g.fill(); g.stroke(); g.lineWidth = 1; g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(-6.5, k * 3.5); g.lineTo(-8.5, k * 3.5); g.moveTo(6.5, k * 3.5); g.lineTo(8.5, k * 3.5); } g.stroke();
      g.strokeStyle = P.col; g.lineWidth = 2; g.beginPath(); g.moveTo(-3.5, -3.5); g.lineTo(-0.5, 0); g.lineTo(-3.5, 3.5); g.moveTo(0.5, -3.5); g.lineTo(3.5, 0); g.lineTo(0.5, 3.5); g.stroke();
    }
  });
}
export function drawPickup(c, kind, x, y, t = 0) {
  const k = x * 0.013 + y * 0.007;
  c.save();
  if (kind === 'coin') {
    const by = Math.sin(t * 3.2 + k) * 2, sp = Math.cos(t * 3 + k * 3), w = Math.max(0.2, Math.abs(sp));
    c.translate(x, y + by);
    c.globalCompositeOperation = 'lighter'; glowAt(c, '#ffc83a', 0, 0, 17, 0.55 + 0.15 * Math.sin(t * 5 + k)); c.globalCompositeOperation = 'source-over';
    if (w < 0.98) { c.fillStyle = '#b07a10'; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.ellipse(sp > 0 ? -1.4 * (1 - w) : 1.4 * (1 - w), 0, 9.5 * w + 1.2, 9.5, 0, 0, TAU); c.fill(); c.stroke(); }
    const e = coinFace(); c.save(); c.scale(w, 1); if (sp < 0) c.scale(-1, 1); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); c.restore();
    const sk = fract(t * 0.5 + k); if (sk < 0.15) { c.globalCompositeOperation = 'lighter'; flareAt(c, 5, -6, 7, Math.sin(sk / 0.15 * Math.PI)); }
  } else {
    const P = PK[kind] || PK.cell, by = Math.sin(t * 2.6 + k) * 3, pu = 0.5 + 0.5 * Math.sin(t * 4 + k);
    c.translate(x, y + by);
    c.globalCompositeOperation = 'lighter'; glowAt(c, P.col, 0, 0, 26 + pu * 4, 0.55 + 0.25 * pu);
    c.save(); c.rotate(t * 1.4); c.strokeStyle = css(P.col, 0.75); c.lineWidth = 2; c.setLineDash([4, 5]); c.beginPath(); c.arc(0, 0, 17 + pu, 0, TAU); c.stroke(); c.restore();
    c.globalCompositeOperation = 'source-over';
    c.rotate(Math.sin(t * 2 + k) * 0.15); const e = pickupIcon(PK[kind] ? kind : 'cell'); c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  }
  c.restore();
}

// ---------- speech bubble ----------
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
function wrapLines(c, text, maxW) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const tr = cur ? cur + ' ' + w : w; if (c.measureText(tr).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tr; }
  if (cur) lines.push(cur); return lines;
}
// tail tip at (x,y) pointing down-left to the speaker; the bubble opens up and to the right. f: 0..1 appear
export function drawBubble(c, x, y, text, f = 1, maxX = 0) {
  if (!text || f <= 0) return;
  const k = f >= 1 ? 1 : easeOutBack(clamp(f, 0, 1)), a = clamp(f * 3, 0, 1);
  c.save(); c.font = '700 13px ' + FONT; const rtl = RTL.test(text);
  try { c.direction = rtl ? 'rtl' : 'ltr'; } catch (_) { /* old Safari */ }
  const lines = wrapLines(c, text, 210), lh = 17;
  let w = 0; for (const l of lines) w = Math.max(w, c.measureText(l).width); w += 22; const h = lines.length * lh + 11;
  let bx = x - 10, by = y - 11 - h; if (maxX) bx = clamp(bx, 6, maxX - w - 6); if (by < 4) by = 4;
  c.translate(x, y); c.scale(k, k); c.translate(-x, -y); c.globalAlpha *= a;
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(10,6,30,.35)'; c.beginPath(); c.roundRect(bx + 2, by + 3, w, h, 11); c.fill();
  c.fillStyle = '#fffaf0'; c.strokeStyle = INK; c.lineWidth = 2;
  const tx0 = clamp(x + 6, bx + 8, bx + w - 22);
  c.beginPath(); c.roundRect(bx, by, w, h, 11); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(tx0, by + h - 1); c.lineTo(x, y); c.lineTo(tx0 + 12, by + h - 1); c.closePath(); c.fill(); c.stroke();
  c.fillRect(tx0 + 1, by + h - 3.5, 10.5, 4.5);
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, bx + w / 2, by + 6 + lh / 2 + i * lh + 1));
  c.restore();
}

// ---------- explosion ring ----------
// f: 0 → 1 progress (expands and fades)
export function drawExplosionRing(c, x, y, r, f, col = '#ffb347') {
  f = clamp(f, 0, 1); if (f >= 1) return;
  const e = 1 - Math.pow(1 - f, 3), rr = r * (0.15 + 0.85 * e);
  c.save(); c.globalCompositeOperation = 'lighter';
  if (f < 0.4) glowAt(c, col, x, y, r * (0.6 + e), (1 - f / 0.4) * 0.9);
  if (f < 0.18) glowAt(c, '#ffffff', x, y, r * 0.5, 1 - f / 0.18);
  c.globalAlpha = (1 - f) * 0.9; c.strokeStyle = css(col); c.lineWidth = Math.max(0.8, r * 0.2 * (1 - f)); c.beginPath(); c.arc(x, y, rr, 0, TAU); c.stroke();
  c.globalAlpha = (1 - f) * 0.7; c.strokeStyle = '#fff'; c.lineWidth = Math.max(0.5, r * 0.06 * (1 - f)); c.beginPath(); c.arc(x, y, rr, 0, TAU); c.stroke();
  c.restore();
}

// ---------- space background ----------
const DEF_THEME = { sky: ['#05041a', '#110b36', '#26124a'], nebula: ['#6a3cc9', '#2fa6d9', '#ff7ab8'], dust: '#9fb8ff', rock: DEF_ROCK, star: '#ffffff' };
// 3 themes: the menu, the journey being flown and the next one (each far canvas is ~3.7 MB, review A1)
const THEMES = new LRU(3), THEME_KEY = new WeakMap();
const themeKey = th => { let k = THEME_KEY.get(th); if (!k) { k = JSON.stringify([th.sky, th.nebula, th.dust]); THEME_KEY.set(th, k); } return k; };
function bakeNebula(theme, layer, key) {
  const res = [0.36, 0.3, 0.22, 0.17][Q], w = Math.round(1024 * res), h = Math.round(400 * res);
  const cv = mk(w, h), g = cv.getContext('2d'), img = g.createImageData(w, h), D = img.data;
  const C = (theme.nebula || DEF_THEME.nebula).map(rgbOf); while (C.length < 3) C.push(C[C.length - 1] || [120, 80, 200]);
  const sd = (hashStr(key) % 997) * 0.173 + layer * 31.7, R = layer ? 2.3 : 1.65, vy = TAU * R * 400 / 1024, la = layer ? 0.62 : 1;
  const cs = new Float32Array(w), sn = new Float32Array(w);
  for (let i = 0; i < w; i++) { const an = i / w * TAU; cs[i] = Math.cos(an) * R; sn[i] = Math.sin(an) * R; }
  for (let j = 0; j < h; j++) {
    const yy = j / h, ny = yy * vy;
    for (let i = 0; i < w; i++) {
      const nx = cs[i], nz = sn[i];
      const wx = fbm(nx * 0.8 + sd, ny * 0.8, nz * 0.8, 3), wy = fbm(nx * 0.8 + 5.1, ny * 0.8 + sd, nz * 0.8 + 3.1, 3);
      const d = con(fbm(nx + (wx - 0.5) * 2.6, ny + (wy - 0.5) * 2.6 + sd * 0.2, nz + sd, 5), 2.5);
      const bc = 0.5 + 0.24 * Math.sin(i / w * TAU * (layer + 1) + sd) + 0.08 * Math.sin(i / w * TAU * 3 + sd * 2), band = Math.exp(-(((yy - bc) / 0.3) ** 2));
      const pres = smooth(0.4, 0.64, con(fbm(nx * 0.42 + sd * 1.3, ny * 0.42 + 2, nz * 0.42, 3), 1.9));
      let a = smooth(0.3, 1.02, d) * (0.15 + 0.85 * band) * (0.2 + 0.8 * pres);
      const fil = Math.abs(fbm(nx * 2.2 + sd, ny * 2.2 + 7, nz * 2.2, 3) - 0.5);
      a *= 0.55 + 0.45 * smooth(0, 0.09, fil);
      const m = smooth(0.38, 0.62, con(fbm(nx * 0.55 + 50, ny * 0.55, nz * 0.55 + sd, 3), 1.6));
      const hot = smooth(0.6, 0.95, d) * band;
      let col = mixc(C[0], C[1], m); col = mixc(col, C[2], hot * 0.6); col = shade(col, 0.62 + 0.5 * hot);
      const k = (j * w + i) * 4; D[k] = col[0]; D[k + 1] = col[1]; D[k + 2] = col[2]; D[k + 3] = clamp(a * 235 * la, 0, 255);
    }
  }
  blurRGBA(D, w, h, 2, true);
  g.putImageData(img, 0, 0); return cv;
}
function themeBake(theme) {
  const key = themeKey(theme); let B = THEMES.get(key); if (B) return B;
  const sky = mk(2, 256), g = sky.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256), S = theme.sky || DEF_THEME.sky;
  gr.addColorStop(0, S[0]); gr.addColorStop(0.55, S[1] || S[0]); gr.addColorStop(1, S[2] || S[1] || S[0]); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const r = rng(hashStr(key)), flares = [];
  for (let i = 0; i < 7; i++) flares.push([r() * 1024, 20 + r() * 360, 7 + r() * 9, r() * TAU]);
  const near = []; for (let i = 0; i < 36; i++) near.push([r() * 1024, r() * 400, 0.9 + r() * 1.2, 0.35 + r() * 0.5]);
  const dust = []; for (let i = 0; i < 16; i++) dust.push([r() * 2048, r() * 400, 0.5 + r() * 0.8, 0.12 + r() * 0.2]);
  B = { sky, neb: [bakeNebula(theme, 0, key), Q < 2 ? bakeNebula(theme, 1, key) : null], flares, near, dust, gal: [180 + r() * 660, 60 + r() * 220, r() * 0.8 - 0.4, 0.6 + r() * 0.5] };
  // the far group (sky, far stars, galaxy, main nebula) baked into ONE opaque, horizontally tiling canvas
  const res = Q >= 2 ? 1 : 1.5, far = mk(1024 * res, 400 * res), f = far.getContext('2d'); f.scale(res, res);
  f.drawImage(sky, 0, 0, 1024, 400); f.drawImage(starTiles().far, 0, 0, 1024, 400);
  { const [gx, gy, ga, gs] = B.gal, sz = 150 * gs; f.save(); f.globalCompositeOperation = 'lighter'; f.translate(gx, gy); f.rotate(ga); f.scale(1, 0.42); f.globalAlpha = 0.55; f.drawImage(galaxySprite(), -sz, -sz, sz * 2, sz * 2); f.restore(); }
  f.globalCompositeOperation = 'screen'; f.drawImage(B.neb[0], 0, 0, 1024, 400);
  B.far = far; THEMES.set(key, B); return B;
}
let STARS = null;
function starTiles() {
  if (STARS) return STARS;
  const res = Q >= 2 ? 1 : 1.5, r = rng(4242), tint = ['#ffffff', '#d6e4ff', '#ffeccc', '#cfdcff', '#ffffff'];
  const tile = (n, rmin, rmax, amin, gl) => {
    const cv = mk(1024 * res, 400 * res), g = cv.getContext('2d'); g.scale(res, res);
    for (let i = 0; i < n; i++) {
      const x = r() * 1024, y = r() * 400, rr = rmin + Math.pow(r(), 2) * (rmax - rmin), col = tint[(r() * tint.length) | 0], a = amin + r() * (1 - amin);
      for (const dx of x < 10 ? [0, 1024] : x > 1014 ? [0, -1024] : [0]) {
        if (gl) { g.globalAlpha = a * 0.35; g.drawImage(glow(col), x + dx - rr * 4, y - rr * 4, rr * 8, rr * 8); }
        g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.arc(x + dx, y, rr, 0, TAU); g.fill();
      }
    }
    return cv;
  };
  const k = Q >= 2 ? 0.6 : 1, mid = [];
  for (let i = 0; i < 120; i++) mid.push([r() * 1024, r() * 400, 0.6 + Math.pow(r(), 2) * 1.1, 0.5 + r() * 0.5, r() * TAU, 0.8 + r() * 2.2, tint[(r() * tint.length) | 0]]);
  STARS = { far: tile(420 * k | 0, 0.3, 0.85, 0.25, false), mid };
  return STARS;
}
let GAL = null;
function galaxySprite() {
  if (GAL) return GAL;
  const N = 256, cv = mk(N, N), g = cv.getContext('2d'), r = rng(808); g.translate(N / 2, N / 2); g.globalCompositeOperation = 'lighter';
  let gr = g.createRadialGradient(0, 0, 0, 0, 0, N * 0.42); gr.addColorStop(0, 'rgba(255,240,215,.9)'); gr.addColorStop(0.08, 'rgba(255,215,190,.5)'); gr.addColorStop(0.35, 'rgba(170,150,255,.12)'); gr.addColorStop(1, 'rgba(120,120,255,0)');
  g.fillStyle = gr; g.fillRect(-N / 2, -N / 2, N, N);
  for (let i = 0; i < 2600; i++) {
    const arm = i % 2, tt = Math.pow(r(), 0.75) * 3.3, rad = 6 + tt * 34, an = tt * 1.2 + arm * Math.PI + (r() - 0.5) * 0.55 * (1 + tt * 0.2), j = (r() - 0.5) * 8;
    const x = Math.cos(an) * rad + j, y = Math.sin(an) * rad + j, a = (1 - tt / 3.6) * (0.25 + r() * 0.5);
    g.fillStyle = r() < 0.3 ? `rgba(255,190,230,${a})` : r() < 0.6 ? `rgba(170,200,255,${a})` : `rgba(255,255,255,${a})`;
    g.fillRect(x, y, 0.8 + r() * 1.2, 0.8 + r() * 1.2);
  }
  gr = g.createRadialGradient(0, 0, 0, 0, 0, 10); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = gr; g.fillRect(-12, -12, 24, 24);
  GAL = cv; return cv;
}
const tileX = (c, img, off, W, y, tw, th) => { let x = -(((off % tw) + tw) % tw); for (; x < W; x += tw) c.drawImage(img, x, y, tw, th); };
let _ls = null, _lt = 0, _v = 120;
export function drawSpace(c, W, H, t = 0, scroll = 0, theme, progress = 0, fromId, toId) {
  theme = theme || DEF_THEME;
  const B = themeBake(theme), ST = starTiles(), hs = H / 400;
  if (_ls !== null) { const dt = t - _lt; if (dt > 0 && dt < 0.3) { const v = (scroll - _ls) / dt; if (v >= 0 && v < 4000) _v += (v - _v) * Math.min(1, dt * 3); } }
  _ls = scroll; _lt = t;
  c.save();
  tileX(c, B.far, scroll * 0.025, W, 0, 1024 * hs, H);
  // mid stars, each twinkling on its own phase (small blits, no full-screen layers)
  c.globalCompositeOperation = 'lighter';
  const nm = Q >= 2 ? 60 : 120, mo = scroll * 0.06;
  for (let i = 0; i < nm; i++) {
    const m = ST.mid[i], x = ((m[0] - mo) % 1024 + 1024) % 1024 * hs; if (x > W + 4) continue;
    const a = m[3] * (0.55 + 0.45 * Math.sin(t * m[5] + m[4])), rr = m[2] * hs, y = m[1] * hs;
    c.globalAlpha = a * 0.4; c.drawImage(glow(m[6]), x - rr * 4, y - rr * 4, rr * 8, rr * 8);
    c.globalAlpha = a; c.fillStyle = m[6]; c.fillRect(x - rr * 0.7, y - rr * 0.7, rr * 1.4, rr * 1.4);
    if (x < W - 1024 * hs) { c.fillRect(x + 1024 * hs - rr * 0.7, y - rr * 0.7, rr * 1.4, rr * 1.4); }
  }
  c.globalAlpha = 0.85;
  if (B.neb[1]) tileX(c, B.neb[1], scroll * 0.1 + 300, W, 0, 1024 * hs, H);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // origin body recedes to the left, destination grows on the right
  const p = clamp(progress || 0, 0, 1), e = p * p * (3 - 2 * p);
  if (fromId) { const r = (170 - 105 * e) * hs, x = (30 - e * 300) * hs, y = H * 0.96 + e * 60 * hs; if (x + r * 1.3 > 0) drawPlanet(c, fromId, x, y, r, t); }
  if (toId) { const r = (11 + 124 * Math.pow(p, 1.6)) * hs, x = W - 112 * hs + (r - 11 * hs) * 0.45, y = H * 0.27 + (r - 11 * hs) * 0.22; drawPlanet(c, toId, x, y, r, t); }
  // bright stars with cross flares
  c.globalCompositeOperation = 'lighter';
  const sc = rgbOf(theme.star || '#fff');
  for (let i = 0; i < B.flares.length; i++) {
    const [fx, fy, fs, ph] = B.flares[i]; let x = ((fx - scroll * 0.045) % 1024 + 1024) % 1024; if (x > W + 20) continue;
    const a = 0.55 + 0.45 * Math.sin(t * (1.3 + i * 0.21) + ph);
    flareAt(c, x, fy * hs, fs * (0.85 + 0.15 * a), a * 0.9);
    if (x < W - 1004) flareAt(c, x + 1024, fy * hs, fs, a * 0.9);
  }
  // near stars (slightly stretched by speed)
  const stretch = 1 + _v * 0.008, nq = Q >= 2 ? 18 : 36;
  c.fillStyle = rgba(sc, 1);
  for (let i = 0; i < nq; i++) {
    const [nx, ny, ns, na] = B.near[i]; const x = ((nx - scroll * 0.32) % 1024 + 1024) % 1024;
    c.globalAlpha = na; for (let xx = x; xx < W; xx += 1024) c.fillRect(xx, ny * hs, ns * stretch, ns);
  }
  // dust streaks for the feeling of speed
  const dl = 18 + _v * 0.42, dc = rgbOf(theme.dust || '#9fb8ff'), nd = Q >= 2 ? 8 : 16;
  const sg = streakSprite(dc);
  for (let i = 0; i < nd; i++) {
    const [dx, dy, dw, da] = B.dust[i]; const x = ((dx - scroll * 1.7) % 2048 + 2048) % 2048 - 100; if (x > W) continue;
    c.globalAlpha = da * clamp(_v / 120, 0.4, 1.4); c.drawImage(sg, x, dy * hs - dw, dl, dw * 2);
  }
  c.restore();
}
const STRK = new Map();
function streakSprite(col) {
  const k = col.join(); let cv = STRK.get(k); if (cv) return cv;
  cv = mk(64, 4); const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.08, rgba(col, 1)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 1, 64, 2); g.globalAlpha = 0.4; g.fillRect(0, 0, 64, 4); STRK.set(k, cv); return cv;
}
// pre-bake a journey theme (optional; drawSpace bakes lazily). Takes a theme object or a journey id; ui.js
// calls it in requestIdleCallback when the selected journey changes and on results (review A1).
export function bakeTheme(theme) {
  if (typeof theme === 'string') { try { const J = META && META.JOURNEYS && META.JOURNEYS.find(j => j && j.id === theme); theme = J && J.theme; } catch (_) { theme = null; } if (!theme) return; }
  themeBake(theme || DEF_THEME);
}

// ---------- station scene (menu backdrop) ----------
const STB = new LRU(2), EB = new LRU(2);
const MENU_THEME = { sky: ['#03021a', '#0c0a32', '#1a2b5e'], nebula: ['#5a2fb0', '#1f7fc9', '#ff6fa8'], dust: '#9fb8ff' };
function stationBg(W, H) {
  const key = Math.round(W / 8) + '|' + Math.round(H); let cv = STB.get(key); if (cv) return cv;
  const res = Q >= 2 ? 1 : 1.5; cv = mk(W * res, H * res); const g = cv.getContext('2d'); g.scale(res, res);
  const B = themeBake(MENU_THEME), ST = starTiles(), hs = H / 400;
  g.drawImage(B.sky, 0, 0, W, H);
  tileX(g, ST.far, 140, W, 0, 1024 * hs, H);
  g.globalCompositeOperation = 'lighter'; g.save(); g.translate(W * 0.36, H * 0.2); g.rotate(-0.35); g.scale(1, 0.4); g.globalAlpha = 0.5; g.drawImage(galaxySprite(), -130, -130, 260, 260); g.restore();
  g.globalCompositeOperation = 'screen'; tileX(g, B.neb[0], 480, W, 0, 1024 * hs, H);
  g.globalCompositeOperation = 'lighter';
  for (const m of ST.mid) for (let x = m[0] * hs; x < W; x += 1024 * hs) { const rr = m[2] * hs; g.globalAlpha = m[3] * 0.4; g.drawImage(glow(m[6]), x - rr * 4, m[1] * hs - rr * 4, rr * 8, rr * 8); g.globalAlpha = m[3]; g.fillStyle = m[6]; g.fillRect(x - rr * 0.7, m[1] * hs - rr * 0.7, rr * 1.4, rr * 1.4); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  STB.set(key, cv); return cv;
}
function earthBand(W, H) {
  const key = Math.round(W / 8) + '|' + Math.round(H); let E = EB.get(key); if (E) return E;
  const R = Math.max(W, 700) * 1.35, cx = W * 0.42, cy = H + R - 70, bh = 150, y0 = H - bh;
  const res = Q >= 2 ? 0.5 : 0.8, pw = Math.ceil(W * res), ph = Math.ceil(bh * res);
  const base = mk(pw, ph), night = mk(pw, ph), lights = mk(pw, ph);
  const gb = base.getContext('2d'), gn = night.getContext('2d'), gl = lights.getContext('2d');
  const ib = gb.createImageData(pw, ph), inn = gn.createImageData(pw, ph), il = gl.createImageData(pw, ph);
  const surf = SURF.earth(), o = [0, 0, 0, 0], K = 9, Lx = -0.78, Ly = -0.42, Lz = 0.46, sun = rgbOf('#ff8a4a');
  for (let j = 0; j < ph; j++) {
    const Y = y0 + (j + 0.5) / res, ny = (Y - cy) / R;
    for (let i = 0; i < pw; i++) {
      const X = (i + 0.5) / res, nx = (X - cx) / R, rr = nx * nx + ny * ny; if (rr >= 1) continue;
      const nz = Math.sqrt(1 - rr), px = nx * K + 2.3, py = nz * K * 1.4 + 1.1, pz = ny * 3 + 0.4;
      surf(px * 0.18, py * 0.18, 0.1 + pz * 0.02, o);
      const k = (j * pw + i) * 4;
      ib.data[k] = o[0]; ib.data[k + 1] = o[1]; ib.data[k + 2] = o[2]; ib.data[k + 3] = 255;
      const dot = nx * Lx + ny * Ly + nz * Lz, lit = smooth(-0.12, 0.42, dot), na = (1 - lit) * 0.86, tw = Math.exp(-(((lit - 0.18) / 0.12) ** 2)) * 0.55;
      const nc = mixc([3, 5, 22], sun, tw);
      inn.data[k] = nc[0]; inn.data[k + 1] = nc[1]; inn.data[k + 2] = nc[2]; inn.data[k + 3] = clamp(na * 255 + tw * 120, 0, 255);
      const land = o[2] < o[1] || o[0] > 150;
      if (land && lit < 0.45) { const v = n3(px * 2.7, py * 2.7, 0.5); const cl = smooth(0.66, 0.82, v) * smooth(0.45, 0.1, lit); if (cl > 0) { il.data[k] = 255; il.data[k + 1] = 196; il.data[k + 2] = 110; il.data[k + 3] = cl * 255; } }
    }
  }
  blurRGBA(ib.data, pw, ph, 1); gb.putImageData(ib, 0, 0); gn.putImageData(inn, 0, 0); gl.putImageData(il, 0, 0);
  // clouds: tileable strip (perspective-squashed toward the horizon), drifts slowly
  const cw = Math.ceil(1024 * res * 0.6), ch = ph, clouds = mk(cw, ch), gc = clouds.getContext('2d'), ic = gc.createImageData(cw, ch);
  for (let j = 0; j < ch; j++) {
    const v = j / ch, sq = 1 / (0.12 + v * 1.6);
    for (let i = 0; i < cw; i++) {
      const an = i / cw * TAU, x = Math.cos(an) * 2.2, z = Math.sin(an) * 2.2, y = v * 9 * (0.4 + 0.6 * sq);
      const w = fbm(x + 3, y * 0.5, z, 3), cv = con(fbm(x * 1.3 + w * 1.8, y * 2.2, z * 1.3 + w, 5), 1.9);
      const a = smooth(0.44, 0.86, cv) * 0.8;
      const k = (j * cw + i) * 4; ic.data[k] = 245; ic.data[k + 1] = 250; ic.data[k + 2] = 255; ic.data[k + 3] = a * 230;
    }
  }
  blurRGBA(ic.data, cw, ch, 1, true); gc.putImageData(ic, 0, 0);
  // atmosphere glow
  const atmo = mk(W, bh + 40), ga = atmo.getContext('2d'), acy = cy - (y0 - 40);
  const gr = ga.createRadialGradient(cx, acy, R - 46, cx, acy, R + 50);
  gr.addColorStop(0, 'rgba(90,170,255,0)'); gr.addColorStop(0.25, 'rgba(110,190,255,.22)'); gr.addColorStop(0.47, 'rgba(170,230,255,.95)'); gr.addColorStop(0.53, 'rgba(110,190,255,.55)'); gr.addColorStop(0.7, 'rgba(60,110,230,.2)'); gr.addColorStop(1, 'rgba(40,60,200,0)');
  ga.fillStyle = gr; ga.fillRect(0, 0, W, bh + 40);
  const comp = mk(W * Math.min(BAKE, 1.5), bh * Math.min(BAKE, 1.5));
  E = { base, night, lights, clouds, atmo, comp, step: null, R, cx, cy, y0, bh, cw: 1024 * 0.6 }; EB.set(key, E); return E;
}
function panel(g, x, y, w, h) {
  g.fillStyle = '#c9a24a'; g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.rect(x, y, w, h); g.fill(); g.stroke();
  const cg = g.createLinearGradient(x, y, x + w, y + h); cg.addColorStop(0, '#4a7fe0'); cg.addColorStop(0.5, '#1f3f96'); cg.addColorStop(1, '#152a6e');
  g.fillStyle = cg; g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.strokeStyle = 'rgba(150,190,255,.5)'; g.lineWidth = 0.7; g.beginPath();
  for (let k = 1; k < 6; k++) { g.moveTo(x + k * w / 6, y + 1.5); g.lineTo(x + k * w / 6, y + h - 1.5); }
  for (let k = 1; k < 4; k++) { g.moveTo(x + 1.5, y + k * h / 4); g.lineTo(x + w - 1.5, y + k * h / 4); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(x + w * 0.15, y + 1.5); g.lineTo(x + w * 0.4, y + 1.5); g.lineTo(x + w * 0.2, y + h - 1.5); g.lineTo(x + 1.5, y + h - 1.5); g.lineTo(x + 1.5, y + h * 0.7); g.closePath(); g.fill();
}
function stationSprite() {
  return bake('stn', -250, -110, 500, 230, BAKE, g => {
    g.strokeStyle = INK;
    // truss
    g.fillStyle = '#8e97ab'; g.lineWidth = 1.4; g.beginPath(); g.roundRect(-236, -3.5, 472, 7, 2); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(28,21,48,.6)'; g.lineWidth = 0.8; g.beginPath(); for (let x = -232; x < 230; x += 8) { g.moveTo(x, -2.6); g.lineTo(x + 4, 2.6); g.lineTo(x + 8, -2.6); } g.stroke();
    // solar wings: two panel pairs each side, on masts
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) {
      const x0 = sd > 0 ? 128 + k * 56 : -128 - k * 56 - 50;
      g.fillStyle = '#7d879e'; g.strokeStyle = INK; g.lineWidth = 1.1; g.fillRect(x0 + 23, -46, 4, 92); g.strokeRect(x0 + 23, -46, 4, 92);
      panel(g, x0, -48, 50, 40); panel(g, x0, 8, 50, 40);
    }
    // radiators near the hub
    for (const sd of [-1, 1]) { g.fillStyle = '#eef1f6'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.roundRect(sd * 70 - 9, -24, 18, 20, 2); g.fill(); g.stroke(); g.strokeStyle = 'rgba(28,21,48,.3)'; g.lineWidth = 0.7; g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(sd * 70 - 9, -24 + k * 5); g.lineTo(sd * 70 + 9, -24 + k * 5); } g.stroke(); }
    // hub: central spine with modules
    const hg = g.createLinearGradient(-16, 0, 16, 0); hg.addColorStop(0, '#a9b3c6'); hg.addColorStop(0.35, '#ffffff'); hg.addColorStop(1, '#8e97ab');
    g.fillStyle = hg; g.strokeStyle = INK; g.lineWidth = 1.6;
    g.beginPath(); g.roundRect(-15, -62, 30, 118, 12); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(-26, -16, 52, 32, 14); g.fill(); g.stroke();
    g.fillStyle = '#e8572b'; g.fillRect(-15, -40, 30, 4); g.fillRect(-15, 32, 30, 4); g.strokeRect(-15, -40, 30, 4); g.strokeRect(-15, 32, 30, 4);
    uaeFlag(g, -7, -54, 14, 8, 0.8);
    g.fillStyle = '#ffd27a'; for (const [wx, wy] of [[-14, -2], [-6, -2], [2, -2], [10, -2], [-4, 14], [4, 14], [-4, -28], [4, -28]]) { g.beginPath(); g.roundRect(wx - 2.5, wy - 3, 5, 6, 1.5); g.fill(); g.lineWidth = 0.9; g.stroke(); }
    // dome + antenna mast
    g.fillStyle = '#dfe5ef'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, -62, 10, Math.PI, TAU); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -72); g.lineTo(0, -98); g.moveTo(-6, -86); g.lineTo(6, -86); g.stroke();
    g.fillStyle = '#eef1f6'; g.beginPath(); g.ellipse(14, -80, 8, 3, -0.5, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(3, -76); g.lineTo(12, -80); g.stroke();
    // docking port + arm reaching down-left to the ship
    g.fillStyle = '#4a4f63'; g.beginPath(); g.roundRect(-9, 55, 18, 7, 2); g.fill(); g.stroke();
    g.fillStyle = '#c7cedb'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-14, 34); g.lineTo(-48, 62); g.lineTo(-44, 67); g.lineTo(-10, 40); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-48, 62); g.lineTo(-74, 84); g.lineTo(-69, 89); g.lineTo(-43, 67); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#5b6178'; g.beginPath(); g.arc(-46, 64.5, 4.6, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.arc(-12, 37, 4.6, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#e8572b'; g.beginPath(); g.roundRect(-80, 84, 16, 6, 2); g.fill(); g.stroke();
  });
}
function ringSprite(front) {
  return bake('ring|' + (front ? 1 : 0), -126, -46, 252, 92, BAKE, g => {
    const rx = 112, ry = 31, a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
    g.lineCap = 'butt';
    g.strokeStyle = INK; g.lineWidth = 15; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, a0, a1); g.stroke();
    g.strokeStyle = front ? '#dfe5ef' : '#8a93a8'; g.lineWidth = 12; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, a0, a1); g.stroke();
    g.strokeStyle = front ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.25)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -3, rx - 1, ry - 1, 0, a0, a1); g.stroke();
    g.strokeStyle = front ? 'rgba(60,70,110,.45)' : 'rgba(20,20,50,.5)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, 3.5, rx, ry + 1, 0, a0, a1); g.stroke();
  });
}
// o = { friends:[rival ids] (fixed rivals floating near the station), char, costume, skin, tier } (the docked ship)
const FRIEND_SLOTS = [[-300, -40], [290, -66], [-250, 84], [262, 74], [-170, -112], [160, -118], [-345, 36], [345, 12], [70, 128], [-70, -140]];
export function drawStationScene(c, W, H, t = 0, o = {}) {
  const hs = H / 400;
  c.save();
  c.drawImage(stationBg(W, H), 0, 0, W, H);
  // twinkling stars + a few flares
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) { const x = sr(i * 3 + 1) * W, y = sr(i * 3 + 2) * H * 0.75, a = 0.5 + 0.5 * Math.sin(t * (0.8 + sr(i) * 1.6) + i * 2.1); c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(x, y, 1.6, 1.6); }
  for (let i = 0; i < 5; i++) { const a = 0.5 + 0.5 * Math.sin(t * (0.7 + i * 0.23) + i * 1.7); flareAt(c, sr(i + 70) * W, sr(i + 80) * H * 0.6 + 10, 8 + sr(i + 90) * 8, a * 0.9); }
  // sun glare at the upper-left
  glowAt(c, '#ffe2b0', -20 * hs, 30 * hs, 170 * hs, 0.55); glowAt(c, '#ffffff', -10 * hs, 30 * hs, 50 * hs, 0.8); flareAt(c, 6 * hs, 32 * hs, 60 * hs, 0.7, 0.2);
  for (const [k, r, col] of [[0.25, 10, '#7fdcff'], [0.4, 18, '#ffb070'], [0.55, 7, '#b98cff']]) glowAt(c, col, W * k * 1.1, (30 + k * 140) * hs, r * hs, 0.25);
  c.globalCompositeOperation = 'source-over';
  // the Moon in the distance
  drawPlanet(c, 'moon', W * 0.2, 96 * hs, 24 * hs, t * 3);
  // Earth's glowing curve
  const E = earthBand(W, H), step = Math.floor(t * 4);
  if (E.step !== step) { // re-composite the slowly drifting clouds over the surface
    E.step = step; const g = E.comp.getContext('2d'), tt = step / 4, k = E.comp.width / W;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, E.comp.width, E.comp.height); g.setTransform(k, 0, 0, k, 0, -E.y0 * k);
    g.save(); g.beginPath(); g.arc(E.cx, E.cy, E.R, 0, TAU); g.clip();
    g.drawImage(E.base, 0, E.y0, W, E.bh);
    const off = (tt * 2.5) % E.cw; for (let x = -off; x < W; x += E.cw) g.drawImage(E.clouds, x, E.y0, E.cw, E.bh);
    g.drawImage(E.night, 0, E.y0, W, E.bh);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8 + 0.2 * Math.sin(tt * 0.9); g.drawImage(E.lights, 0, E.y0, W, E.bh);
    g.restore();
  }
  c.drawImage(E.comp, 0, E.y0, W, E.bh);
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.92 + 0.08 * Math.sin(t * 0.6); c.drawImage(E.atmo, 0, E.y0 - 40, W, E.bh + 40); c.globalAlpha = 1;
  { const lx = W * 0.07, ly = E.cy - Math.sqrt(Math.max(0, E.R * E.R - (lx - E.cx) ** 2)); glowAt(c, '#ffb070', lx, ly, 150 * hs, 0.55); glowAt(c, '#fff0d0', lx, ly, 40 * hs, 0.7); flareAt(c, lx, ly, 70 * hs, 0.5); }
  c.globalCompositeOperation = 'source-over';
  // Falak Station
  const SX = W * 0.62, SY = 150 * hs + Math.sin(t * 0.5) * 2, k = hs * Math.min(1, W / (700 * hs) + 0.15);
  c.save(); c.translate(SX, SY); c.scale(k, k);
  const rot = t * 0.12, rx = 112, ry = 31;
  const module = (a, front) => { const ca = Math.cos(a), sa = Math.sin(a), mx = ca * rx, my = sa * ry, w = 4 + 13 * Math.abs(sa);
    c.fillStyle = front ? '#f4f6fa' : '#7d879e'; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.roundRect(mx - w / 2, my - 7, w, 14, 3); c.fill(); c.stroke();
    if (w > 8) { c.fillStyle = front ? '#ffd27a' : '#8a7040'; c.fillRect(mx - w / 2 + 2.5, my - 2, w - 5, 3); } };
  const spoke = a => { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * rx, Math.sin(a) * ry); c.stroke(); };
  { const e = ringSprite(false); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); }
  c.strokeStyle = '#6b7389'; c.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; if (Math.sin(a) < 0) spoke(a); }
  for (let i = 0; i < 10; i++) { const a = rot + i * TAU / 10; if (Math.sin(a) < 0) module(a, false); }
  { const e = stationSprite(); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); }
  c.strokeStyle = INK; c.lineWidth = 4.6; for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; if (Math.sin(a) >= 0) spoke(a); }
  c.strokeStyle = '#c7cedb'; c.lineWidth = 2.6; for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; if (Math.sin(a) >= 0) spoke(a); }
  { const e = ringSprite(true); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); }
  for (let i = 0; i < 10; i++) { const a = rot + i * TAU / 10; if (Math.sin(a) >= 0) module(a, true); }
  // blinking navigation lights
  c.globalCompositeOperation = 'lighter';
  const bl = fract(t * 0.8);
  if (bl < 0.5) { glowAt(c, '#ff3040', -236, 0, 12, 1); glowAt(c, '#3fff7a', 236, 0, 12, 1); }
  const st = fract(t * 0.55); if (st < 0.06 || (st > 0.12 && st < 0.18)) { glowAt(c, '#ffffff', 0, -98, 16, 1); flareAt(c, 0, -98, 14, 0.9); }
  for (let i = 0; i < 10; i++) { const a = rot + i * TAU / 10 + 0.31; if (Math.sin(a) > 0 && fract(t * 0.5 + i * 0.37) < 0.15) glowAt(c, '#7fdcff', Math.cos(a) * rx, Math.sin(a) * ry + 6, 7, 0.9); }
  c.globalCompositeOperation = 'source-over';
  // docked ship hanging off the arm
  c.save(); c.translate(-96, 104); c.scale(0.95, 0.95); drawShip(c, 0, 0, { t, tier: o.tier | 0, guns: 1, thrust: 0.02 + 0.03 * Math.sin(t * 2), char: o.char, costume: o.costume, skin: o.skin, aura: null }); c.restore();
  c.restore();
  // reprogrammed rivals, now friends, floating round the station
  const fr = Array.isArray(o.friends) ? o.friends : null;
  if (fr) for (let i = 0; i < fr.length && i < FRIEND_SLOTS.length; i++) {
    const id = fr[i]; if (!RV[id]) continue;
    const [dx, dy] = FRIEND_SLOTS[i], fx = clamp(SX + (dx + Math.sin(t * 0.31 + i * 1.7) * 8) * k, 26 * hs, W - 26 * hs), fy = clamp(SY + (dy + Math.cos(t * 0.27 + i) * 5) * k, 24 * hs, H - 60 * hs);
    drawRival(c, id, fx, fy, { t: t + i * 3.1, s: 0.5 * k * (id === 'kabeer' ? 0.85 : 1), mood: 'fixed', thrust: 0.2 });
  }
  // Nabeeh floating nearby
  drawNabeeh(c, SX + 44 * k, SY + 112 * k, 0.85 * k, { t, mood: fract(t * 0.07) < 0.5 ? 'happy' : 'normal' });
  c.restore();
}

// ---------- rival robot ships (duels, §3.4) ----------
// Ten rogue ships built from space junk, all facing LEFT, each about 2·r across. The static body is baked per
// (id, damage phase, scale bucket) into RIV; moving parts (rotors, dish, blades, flag, arms), the eye, the mouth
// and the effects are drawn live from cheap paths and glow blits (no gradients per frame).
const RIVAL_R = { khurda: 34, bubolt: 34, zannana: 24, magna: 36, radar: 36, ghummaid: 30, dawwama: 34, kabeer: 44, sindan: 40, sifr: 34 };
export const RIVAL_IDS = Object.keys(RIVAL_R);
export const rivalRadius = id => RIVAL_R[id] || 34;
const RIVAL_THEME = { khurda: 'mars', bubolt: 'mars', zannana: 'venus', magna: 'belt', radar: 'jupiter', ghummaid: 'saturn', dawwama: 'uranus', kabeer: 'belt', sindan: 'jupiter', sifr: 'neptune' };
let META = null; // meta.js module once initArt has loaded it (themes for cards only)

const metal = (g, x0, y0, x1, y1, a, b, c) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(0.5, b); gr.addColorStop(1, c); return gr; };
const rgrad = (g, x, y, r0, r1, a, b, c) => { const gr = g.createRadialGradient(x, y, r0, x, y, r1); gr.addColorStop(0, a); gr.addColorStop(0.55, b); gr.addColorStop(1, c); return gr; };
function rivet(g, x, y, r = 1.1, col = '#c7cedb') { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = 'rgba(28,21,48,.7)'; g.lineWidth = 0.6; g.stroke(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill(); }
function tapeAt(g, x, y, rot, w = 13) { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = '#ddd3b0'; g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-w / 2, -2.2); g.lineTo(w / 2, -2.2); g.lineTo(w / 2 - 0.8, 0); g.lineTo(w / 2, 2.2); g.lineTo(-w / 2, 2.2); g.lineTo(-w / 2 + 0.8, 0); g.closePath(); g.fill(); g.stroke(); g.strokeStyle = 'rgba(120,100,60,.45)'; g.lineWidth = 0.5; g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(-w / 2 + 1, k * 1.1); g.lineTo(w / 2 - 1, k * 1.1); } g.stroke(); g.restore(); }
function crackAt(g, x, y, s = 1, rot = 0) { g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -2); g.lineTo(-2, 1); g.lineTo(1, -2); g.lineTo(5, 2); g.moveTo(1, -2); g.lineTo(2, -5); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-6, -1); g.lineTo(-2, 2); g.lineTo(1, -1); g.lineTo(5, 3); g.stroke(); g.restore(); }
function sootAt(g, x, y, s = 1) { g.fillStyle = 'rgba(25,15,20,.32)'; g.beginPath(); g.ellipse(x, y, 7 * s, 4.6 * s, 0.4, 0, TAU); g.fill(); g.fillStyle = 'rgba(25,15,20,.25)'; g.beginPath(); g.ellipse(x + 3 * s, y - 1.5 * s, 3.6 * s, 2.4 * s, 0.2, 0, TAU); g.fill(); }
// battle damage baked into the body: phase 1 a crack and a tape patch, phase 2 soot, more cracks and tape
function scuffs(g, sp, ph) {
  if (ph >= 1) { crackAt(g, sp[0][0], sp[0][1], 0.9, 0.3); tapeAt(g, sp[1][0], sp[1][1], -0.5, 12); }
  if (ph >= 2) { sootAt(g, sp[2][0], sp[2][1]); crackAt(g, sp[3 % sp.length][0], sp[3 % sp.length][1], 0.8, -0.6); tapeAt(g, sp[0][0] + 2, sp[0][1] + 3, 0.7, 10); }
}
function eyeSocket(g, x, y, r, ring = '#3b3f52', ring2 = '#9aa3b8') {
  g.fillStyle = ring; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 1.5, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = ring2; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r * 1.28, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#120c1e'; g.beginPath(); g.arc(x, y, r * 1.05, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r * 1.4, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
}
function nozzle(g, x, y, s = 1) { // a rear thruster bell opening to the right
  g.strokeStyle = INK; g.lineWidth = 1.5; g.fillStyle = '#7d879e'; g.beginPath(); g.roundRect(x - 7 * s, y - 4.5 * s, 8 * s, 9 * s, 2 * s); g.fill(); g.stroke();
  g.fillStyle = '#4a4f63'; g.beginPath(); g.moveTo(x, y - 4 * s); g.lineTo(x + 6 * s, y - 6.5 * s); g.lineTo(x + 6 * s, y + 6.5 * s); g.lineTo(x, y + 4 * s); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(x + 6 * s, y, 1.3 * s, 6 * s, 0, 0, TAU); g.fill(); g.lineWidth = 1; g.stroke();
}
function antennaBall(g, x0, y0, pts, col = '#ffd23f') { g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); for (const [x, y] of pts) g.lineTo(x, y); g.stroke(); const [bx, by] = pts[pts.length - 1]; g.fillStyle = col; g.lineWidth = 1.2; g.beginPath(); g.arc(bx, by, 2.4, 0, TAU); g.fill(); g.stroke(); }

// per rival: box (bake bounds), eye [x,y,r,style], mouth [x,y,w] | null, muzzle, hatch, engines [[x,y,size]], spots (damage decals)
const RV = {
  khurda: {
    box: [-48, -54, 98, 90], eye: [-22, 0, 8.6], mouth: [2, 11, 9], muzzle: [-41, 12], hatch: [2, 19], eng: [[38, -10, 0.42], [38, 10, 0.42]], spots: [[8, 6], [18, -8], [-4, -10], [22, 9]],
    body(g) {
      nozzle(g, 31, -10, 1); nozzle(g, 31, 10, 1);
      // satellite-dish hat on a stalk
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -18); g.lineTo(-2, -27); g.stroke();
      g.save(); g.translate(-3, -30); g.rotate(-0.3); g.scale(1.3, 1.3);
      g.fillStyle = metal(g, -13, 0, 13, 0, '#ffffff', '#e4e8f0', '#a9b3c6'); g.lineWidth = 1.8; g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(0, 11, 13, 0); g.quadraticCurveTo(0, 4.5, -13, 0); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(28,21,48,.3)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-7, 3); g.quadraticCurveTo(0, 7.4, 7, 3); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-9, 1.5); g.lineTo(0, -8); g.lineTo(9, 1.5); g.stroke();
      g.restore();
      // the dented fuel-tank body
      const body = () => { g.beginPath(); g.roundRect(-33, -19, 63, 38, 19); };
      body(); g.fillStyle = metal(g, 0, -19, 0, 19, '#ffffff', '#e8ebf2', '#a6b1c7'); g.fill();
      g.save(); body(); g.clip();
      g.fillStyle = '#e8572b'; g.fillRect(-4, -20, 7, 40); g.fillRect(15, -20, 7, 40);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(-26, -14, 50, 3);
      g.fillStyle = 'rgba(28,21,48,.16)'; g.beginPath(); g.ellipse(6, 10, 10, 5, 0.2, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(28,21,48,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(1, 8); g.quadraticCurveTo(6, 4, 12, 9); g.moveTo(20, -8); g.quadraticCurveTo(24, -11, 27, -6); g.stroke();
      g.fillStyle = 'rgba(28,21,48,.18)'; g.fillRect(-33, 12, 63, 8);
      g.restore(); body(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      for (const x of [-1, 18]) for (const y of [-13, 13]) rivet(g, x + 0.5, y, 1);
      tapeAt(g, 9, -9, 0.55, 12); tapeAt(g, 9, -9, -0.55, 12);
      // the stubby cannon under the eye
      g.fillStyle = '#7d879e'; g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.roundRect(-42, 9, 16, 6.5, 3); g.fill(); g.stroke(); g.fillStyle = '#2a2d3c'; g.beginPath(); g.roundRect(-43, 10, 3.4, 4.5, 1.2); g.fill();
      // the big red camera eye
      eyeSocket(g, -22, 0, 8.6);
    },
    front(c, o, t, L) { // blinking dish light
      const on = REDUCED ? 1 : fract(t * 0.9) < 0.45 ? 1 : 0;
      if (on) { c.globalCompositeOperation = 'lighter'; glowAt(c, L.fixed ? '#5ef2ff' : '#ff8a3d', -6.1, -39.9, 8, 0.9); c.globalCompositeOperation = 'source-over'; }
      c.fillStyle = on ? (L.fixed ? '#9ff0ff' : '#ff8a3d') : '#8a3a1a'; c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.arc(-6.1, -39.9, 2.6, 0, TAU); c.fill(); c.stroke();
    },
  },
  bubolt: {
    box: [-56, -58, 106, 98], eye: [-11, -4, 7.6, 'monocle'], mouth: [-12, 12, 12], muzzle: [-37, 8], hatch: [8, 24], eng: [[34, 0, 0.6]], spots: [[12, 4], [16, -10], [2, 15], [20, 10]],
    body(g) {
      nozzle(g, 27, 0, 1.2);
      g.fillStyle = rgrad(g, -6, -8, 2, 27, '#e39a5c', '#b8662f', '#6e3416'); g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath(); g.arc(2, 0, 25, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(2, 0, 25, 0, TAU); g.clip();
      g.fillStyle = 'rgba(90,40,15,.38)'; for (const [x, y, r] of [[14, -12, 5], [-8, 14, 6], [20, 10, 4], [4, -18, 3], [-16, 2, 3.4]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0.4, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,200,140,.35)'; for (const [x, y, r] of [[8, 4, 2], [-2, 18, 1.6], [22, -2, 1.4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(40,15,5,.45)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-24, 6); g.quadraticCurveTo(2, 12, 28, 5); g.stroke();
      g.restore(); g.beginPath(); g.arc(2, 0, 25, 0, TAU); g.stroke();
      for (let k = 0; k < 9; k++) { const a = -0.3 + k * TAU / 9; rivet(g, 2 + Math.cos(a) * 21.5, Math.sin(a) * 21.5, 1.2, '#d9a066'); }
      // the blunderbuss under the chin
      g.fillStyle = metal(g, 0, 4, 0, 12, '#e8b878', '#b07a3a', '#7a4e1e'); g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-18, 4); g.lineTo(-33, 3); g.lineTo(-38, 1); g.lineTo(-38, 15); g.lineTo(-33, 13); g.lineTo(-18, 12); g.closePath(); g.fill(); g.stroke();
      // the scrap-plate pirate hat with a golden bolt
      const hat = () => { g.beginPath(); g.moveTo(-25, -15); g.quadraticCurveTo(-24, -27, -13, -26); g.quadraticCurveTo(-8, -40, 4, -39); g.quadraticCurveTo(16, -40, 18, -27); g.quadraticCurveTo(28, -27, 30, -14); g.quadraticCurveTo(4, -22, -25, -15); g.closePath(); };
      hat(); g.fillStyle = metal(g, 0, -40, 0, -14, '#4a4f63', '#2a2d3c', '#1a1b24'); g.fill(); g.lineWidth = 2; g.stroke();
      g.strokeStyle = '#e8b64a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-22, -16.5); g.quadraticCurveTo(4, -23, 27, -16); g.stroke();
      g.fillStyle = '#ffd23f'; g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, px = 3 + Math.cos(a) * 4.2, py = -29 + Math.sin(a) * 4.2; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#8a5a08'; g.beginPath(); g.arc(3, -29, 1.6, 0, TAU); g.fill();
      // eye-patch strap with the monocle lens
      g.strokeStyle = '#1d1b22'; g.lineWidth = 4.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-24, -1); g.quadraticCurveTo(-2, -10, 25, -12); g.stroke();
      eyeSocket(g, -11, -4, 7.6, '#c9a24a', '#ffe08a');
      g.strokeStyle = '#e8b64a'; g.lineWidth = 1; g.setLineDash([1.6, 1.4]); g.beginPath(); g.moveTo(-6, 7); g.quadraticCurveTo(-2, 14, 4, 12); g.stroke(); g.setLineDash([]);
    },
    back(c, o, t, L) { // tiny flag antenna: a bolt and a wrench, no skull
      const fw = Math.sin(t * 5) * 1.6;
      c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(14, -30); c.lineTo(18, -50); c.stroke();
      c.fillStyle = '#1d1b22'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(18, -50); c.quadraticCurveTo(25, -51 + fw, 33, -49 + fw * 0.6); c.lineTo(32, -40 + fw * 0.6); c.quadraticCurveTo(25, -42 + fw, 17.5, -41); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#ffd23f'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(21, -47.5 + fw * 0.8); c.lineTo(28, -42.5 + fw * 0.7); c.moveTo(28, -47.5 + fw * 0.7); c.lineTo(21, -42.5 + fw * 0.8); c.stroke();
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(18, -51, 1.5, 0, TAU); c.fill();
    },
    front(c, o, t, L) { // the wrench arm, held forward like a pirate's cutlass (raised when charging)
      const tl = o.tell || 0, a = 0.75 + Math.sin(t * 2.2) * 0.1 - tl * 0.5;
      c.save(); c.translate(-12, 15); c.rotate(a); c.strokeStyle = INK; c.lineWidth = 1.5;
      c.fillStyle = '#9aa3b8'; c.beginPath(); c.roundRect(-2.8, 0, 5.6, 11, 2.8); c.fill(); c.stroke();
      c.fillStyle = '#5b6178'; c.beginPath(); c.arc(0, 0, 3.2, 0, TAU); c.fill(); c.stroke();
      c.translate(0, 11); c.rotate(1.15 - tl * 0.6 + Math.sin(t * 2.2 + 1) * 0.08);
      c.fillStyle = '#5b6178'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#d7dce6'; c.beginPath(); c.roundRect(-1.9, -2, 3.8, 19, 1.9); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-4.8, 16); c.lineTo(-5.6, 24); c.lineTo(-2, 24); c.lineTo(-1.4, 20.5); c.lineTo(1.4, 20.5); c.lineTo(2, 24); c.lineTo(5.6, 24); c.lineTo(4.8, 16); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-0.6, 0); c.lineTo(-0.6, 14); c.stroke();
      c.restore();
    },
  },
  zannana: {
    box: [-40, -40, 76, 64], eye: [-13, -2, 5.6], mouth: null, muzzle: [-33, 9], hatch: [6, 13], eng: [[23, 3, 0.3]], spots: [[8, 0], [14, 6], [-6, 6], [4, -6]],
    rot: [[-11, -15, 10, 1], [13, -15, 10, 1], [-3, -18.5, 8, 0], [21, -18.5, 8, 0]], // rotor hubs [x, y, r, front]
    body(g) {
      // rotor struts
      g.strokeStyle = INK; g.lineWidth = 1.4; g.fillStyle = '#7d879e';
      for (const [hx, hy] of this.rot) { g.beginPath(); g.moveTo(hx * 0.4, -6); g.lineTo(hx, hy); g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = '#9aa3b8'; g.stroke(); }
      for (const [hx, hy] of this.rot) { g.fillStyle = '#4a4f63'; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.arc(hx, hy, 2.2, 0, TAU); g.fill(); g.stroke(); }
      // striped abdomen
      const ab = () => { g.beginPath(); g.ellipse(6, 2, 16, 12, -0.08, 0, TAU); };
      ab(); g.fillStyle = rgrad(g, 2, -4, 1, 18, '#fff27a', '#ffd23f', '#c9930f'); g.fill();
      g.save(); ab(); g.clip(); g.fillStyle = '#1d1b22'; for (const x of [0, 9, 18]) { g.beginPath(); g.moveTo(x, -12); g.lineTo(x + 4.5, -12); g.lineTo(x + 2.5, 15); g.lineTo(x - 2, 15); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(2, -6, 8, 2.4, -0.1, 0, TAU); g.fill(); g.restore();
      ab(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
      // stinger cannon
      g.fillStyle = metal(g, 0, 5, 0, 13, '#4a4f63', '#2a2d3c', '#16141c'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(-12, 5); g.lineTo(-34, 8.5); g.lineTo(-12, 13); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(-17, 6); g.lineTo(-20, 7.4); g.lineTo(-20, 10.6); g.lineTo(-17, 12); g.closePath(); g.fill(); g.lineWidth = 0.8; g.stroke();
      // head with antennae
      antennaBall(g, -15, -9, [[-19, -15], [-23, -17]], '#ffd23f'); antennaBall(g, -10, -10, [[-11, -17], [-8, -21]], '#ffd23f');
      g.fillStyle = rgrad(g, -14, -5, 1, 11, '#5b6178', '#2a2d3c', '#16141c'); g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.arc(-11, -1, 9.5, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(-14, -7, 3.6, 1.6, -0.5, 0, TAU); g.fill();
      eyeSocket(g, -13, -2, 5.6, '#ffd23f', '#c9930f');
    },
    back(c, o, t, L) { rotors(c, this.rot, t, 0); },
    front(c, o, t, L) { rotors(c, this.rot, t, 1); },
  },
  magna: {
    box: [-52, -48, 102, 96], eye: [1, 0, 7.4], mouth: null, muzzle: [-30, 0], hatch: [4, 30], eng: [[41, 0, 0.55]], spots: [[18, -22], [26, 8], [10, 23], [-8, -23]],
    body(g) {
      nozzle(g, 34, 0, 1.15);
      const shoe = () => { g.beginPath(); g.moveTo(-31, -31); g.lineTo(4, -31); g.arc(4, 0, 31, -Math.PI / 2, Math.PI / 2); g.lineTo(-31, 31); g.lineTo(-31, 15); g.lineTo(4, 15); g.arc(4, 0, 15, Math.PI / 2, -Math.PI / 2, true); g.lineTo(-31, -15); g.closePath(); };
      shoe(); g.fillStyle = metal(g, 0, -31, 0, 31, '#ff6a6a', '#e23b4a', '#9a1a26'); g.fill();
      g.save(); shoe(); g.clip();
      g.fillStyle = metal(g, -31, 0, -15, 0, '#ffffff', '#d8dde8', '#8f97ad'); g.fillRect(-32, -32, 15, 64);
      g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-17, -32); g.lineTo(-17, 32); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-32, -28, 64, 4); g.beginPath(); g.arc(4, 0, 27, -1.2, -0.3); g.lineTo(4, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(60,0,10,.22)'; g.fillRect(-32, 24, 70, 8);
      g.restore(); shoe(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
      for (const [x, y] of [[-10, -23], [0, -23], [-10, 23], [0, 23], [22, -17], [27, 0], [22, 17]]) rivet(g, x, y, 1.15, '#ffd0d0');
      g.fillStyle = '#2a2d3c'; g.strokeStyle = INK; g.lineWidth = 1.4; g.font = '900 9px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; g.fillText('N', -24, -23); g.fillText('S', -24, 23.5);
      // the core pod in the gap
      g.fillStyle = metal(g, 0, -12, 0, 12, '#9aa3b8', '#5b6178', '#2a2d3c'); g.lineWidth = 2; g.beginPath(); g.arc(2, 0, 12.6, 0, TAU); g.fill(); g.stroke();
      eyeSocket(g, 1, 0, 7.4, '#3b3f52', '#c7cedb');
    },
    front(c, o, t, L) { // blue sparks between the poles
      const k = (t * 7) | 0; if (sr(k * 3.1) < 0.45 && !L.limp) {
        c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(160,210,255,.9)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-31, -20);
        for (let i = 1; i < 6; i++) c.lineTo(-33 - sr(k + i) * 8, -20 + i * 8); c.lineTo(-31, 20); c.stroke(); glowAt(c, '#7fb4ff', -33, 0, 16, 0.5); c.globalCompositeOperation = 'source-over';
      }
    },
  },
  radar: {
    box: [-54, -50, 100, 96], eye: [-6, 14, 6.2], mouth: [10, 21, 8], muzzle: [-11, -18], hatch: [2, 30], eng: [[24, 24, 0.45]], spots: [[8, 10], [12, 22], [-10, 24], [4, 6]],
    body(g) {
      // antenna arms
      g.strokeStyle = INK; g.lineWidth = 3.6; g.beginPath(); g.moveTo(14, 8); g.lineTo(26, -6); g.lineTo(30, -20); g.moveTo(-15, 22); g.lineTo(-28, 26); g.lineTo(-34, 18); g.stroke();
      g.strokeStyle = '#c7cedb'; g.lineWidth = 1.8; g.stroke();
      nozzle(g, 19, 24, 0.9);
      // neck
      g.fillStyle = '#9aa3b8'; g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.roundRect(-4, -6, 8, 12, 2); g.fill(); g.stroke();
      // torso with a face screen
      const tor = () => { g.beginPath(); g.roundRect(-17, 2, 36, 30, 9); };
      tor(); g.fillStyle = metal(g, 0, 2, 0, 32, '#ffffff', '#e6ecf6', '#a9b6cc'); g.fill(); g.save(); tor(); g.clip();
      g.fillStyle = '#2f7fe0'; g.fillRect(-18, 26, 38, 7); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-12, 4.5, 26, 2.4); g.restore();
      tor(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#16244a'; g.lineWidth = 1.4; g.beginPath(); g.roundRect(-15, 7, 20, 15, 5); g.fill(); g.stroke();
      g.fillStyle = '#3b3f52'; g.beginPath(); g.roundRect(5, 17, 11, 8, 2); g.fill(); g.lineWidth = 1; g.stroke();
      g.fillStyle = '#120c1e'; g.beginPath(); g.arc(-6, 14, 6.4, 0, TAU); g.fill();
      for (const x of [9, 13]) rivet(g, x, 9.5, 1, '#c7cedb');
    },
    back(c, o, t, L) { this.dish(c, o, t, L, false); },
    front(c, o, t, L) {
      this.dish(c, o, t, L, true);
      for (let k = 0; k < 3; k++) { const on = fract(t * 1.2 + k * 0.33) < 0.5; c.fillStyle = on ? '#5ec8ff' : '#1d4a8a'; c.strokeStyle = INK; c.lineWidth = 0.8; c.beginPath(); c.roundRect(-13 + k * 9, 27.4, 6, 3, 1.2); c.fill(); c.stroke(); }
      for (const [bx, by, ph] of [[30, -20, 0], [-34, 18, 0.5]]) { const on = fract(t * 0.8 + ph) < 0.5; c.fillStyle = on ? '#9fe4ff' : '#3a7ab8'; c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.arc(bx, by, 2.8, 0, TAU); c.fill(); c.stroke(); if (on) { c.globalCompositeOperation = 'lighter'; glowAt(c, '#5ec8ff', bx, by, 8, 0.7); c.globalCompositeOperation = 'source-over'; } }
    },
    // the spinning dish head; when charging (tell) it swings round to point at the player
    dish(c, o, t, L, front) {
      const spin = t * 1.5, tl = clamp((o.tell || 0) * 2.5, 0, 1), fixedA = Math.PI - 0.65;
      let ph = spin % TAU; let d = fixedA - ph; d -= TAU * Math.round(d / TAU); ph += d * tl;
      const sn = Math.sin(ph), cs = Math.cos(ph), R = 21, rx = Math.max(2.6, R * Math.abs(sn)), cx = 0, cy = -20, faceV = sn > 0;
      if (front !== (cs < 0.15 || faceV)) return; // the half nearer the viewer draws in front of the neck
      c.strokeStyle = INK; c.lineWidth = 2;
      c.fillStyle = faceV ? '#f4f7fc' : '#b9c3d6'; c.beginPath(); c.ellipse(cx, cy, rx, R, 0, 0, TAU); c.fill(); c.stroke();
      if (faceV) { c.fillStyle = '#d3dae6'; c.beginPath(); c.ellipse(cx + cs * rx * 0.12, cy, rx * 0.68, R * 0.68, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(28,21,48,.35)'; c.lineWidth = 1; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(cx, cy, rx * 0.86, R * 0.86, 0, Math.PI * 1.05, Math.PI * 1.45); c.stroke(); }
      else { c.strokeStyle = 'rgba(28,21,48,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - rx, cy); c.lineTo(cx + rx, cy); c.stroke(); }
      // feed horn and the emitter (the laser muzzle)
      const hx = cx + cs * 11, hy = cy;
      c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(hx, hy); c.stroke();
      const em = L.fixed ? '#5ef2ff' : '#ff3b4a';
      c.fillStyle = em; c.lineWidth = 1.2; c.beginPath(); c.arc(hx, hy, 2.8 + (o.tell || 0) * 1.4, 0, TAU); c.fill(); c.stroke();
      c.globalCompositeOperation = 'lighter'; glowAt(c, em, hx, hy, 9 + (o.tell || 0) * 14, 0.6 + (o.tell || 0) * 0.4); c.globalCompositeOperation = 'source-over';
    },
  },
  ghummaid: {
    box: [-46, -48, 88, 86], eye: [-12, -6, 8.2], mouth: [-13, 10, 8], muzzle: [-27, 2], hatch: [0, 23], eng: [[26, 8, 0.4]], spots: [[2, -16], [-2, 15], [-20, 12], [6, 18]],
    body(g) {
      nozzle(g, 20, 8, 0.85);
      antennaBall(g, 4, -22, [[6, -30], [3, -36]], '#ff9fd8');
      const egg = () => { g.beginPath(); g.ellipse(0, 0, 26, 24, 0, 0, TAU); };
      egg(); g.fillStyle = rgrad(g, -8, -10, 2, 28, '#b892f0', '#7a4cc8', '#3e2273'); g.fill();
      g.save(); egg(); g.clip(); g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(-8, -15, 12, 4, -0.35, 0, TAU); g.fill();
      g.fillStyle = 'rgba(30,10,60,.25)'; g.fillRect(-27, 15, 54, 10); g.restore();
      egg(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
      // the chameleon panel frame (its shimmer is drawn live)
      g.fillStyle = '#2a1a48'; g.lineWidth = 1.8; g.beginPath(); g.ellipse(10, 4, 11.5, 13, 0, 0, TAU); g.fill(); g.stroke();
      for (const a of [0.4, 1.6, 2.8, 4, 5.2]) rivet(g, 10 + Math.cos(a) * 13.8, 4 + Math.sin(a) * 15.2, 0.9, '#e6d6ff');
      eyeSocket(g, -12, -6, 8.2, '#5a3a9a', '#d8c4ff');
    },
    front(c, o, t, L) {
      // shimmering chameleon panel: crossfade between baked frames
      const sb = L.sb, f = (t * 3) % 8, i0 = f | 0, k = f - i0, e0 = ghPanel(i0, sb), e1 = ghPanel((i0 + 1) % 8, sb);
      c.drawImage(e0.c, 10 + e0.x0, 4 + e0.y0, e0.w, e0.h); const ga = c.globalAlpha; c.globalAlpha = ga * k; c.drawImage(e1.c, 10 + e1.x0, 4 + e1.y0, e1.w, e1.h); c.globalAlpha = ga;
      // peekaboo hands: they rise to cover the eye during a blink tell
      const up = clamp((o.tell || 0) * 1.6, 0, 1), wv = Math.sin(t * 3) * 0.12;
      for (const sd of [0, 1]) {
        const bx = sd ? 20 : -24, by = 12, tx = sd ? -6 : -18, ty = -8, hx = lerp(bx, tx, up), hy = lerp(by, ty, up) + Math.sin(t * 3 + sd) * 1.2;
        c.fillStyle = '#d8c4ff'; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.ellipse(hx, hy, 5.2, 4.4, wv + (sd ? 0.4 : -0.4), 0, TAU); c.fill(); c.stroke();
        c.lineWidth = 0.9; c.beginPath(); c.moveTo(hx - 1.6, hy - 2.6); c.lineTo(hx - 1.2, hy + 0.4); c.moveTo(hx + 1, hy - 2.8); c.lineTo(hx + 1.2, hy + 0.2); c.stroke();
      }
    },
  },
  dawwama: {
    box: [-50, -46, 100, 82], eye: [-6, -15, 6.4], mouth: [-7, -5, 7], muzzle: [-34, -2], hatch: [0, 27], eng: [], spots: [[10, -18], [8, 12], [-14, -20], [-10, 10]],
    body(g) {
      // lower cone
      g.strokeStyle = INK; g.lineWidth = 2;
      const cone = () => { g.beginPath(); g.moveTo(-21, 2); g.lineTo(21, 2); g.quadraticCurveTo(12, 18, 3, 29); g.lineTo(-3, 29); g.quadraticCurveTo(-12, 18, -21, 2); g.closePath(); };
      cone(); g.fillStyle = metal(g, -20, 0, 20, 0, '#1f8a86', '#3fd6c8', '#1a6f6a'); g.fill(); g.save(); cone(); g.clip();
      g.fillStyle = '#ff8a2a'; g.fillRect(-22, 9, 44, 3.6); g.fillRect(-22, 18, 44, 2.6); g.restore(); cone(); g.stroke();
      g.fillStyle = '#9aa3b8'; g.beginPath(); g.roundRect(-3, 27, 6, 6, 2); g.fill(); g.lineWidth = 1.3; g.stroke();
      // the orange disc
      g.lineWidth = 2; g.fillStyle = metal(g, 0, -11, 0, 8, '#ffc07a', '#ff8a2a', '#c8561a'); g.beginPath(); g.ellipse(0, -2, 33, 9.5, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#2fbfb2'; g.beginPath(); g.ellipse(0, -1, 27, 6, 0, 0, Math.PI); g.fill(); g.lineWidth = 1; g.stroke();
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.12 + k * 0.127); rivet(g, Math.cos(a) * 30, -2 + Math.sin(a) * 8, 0.9, '#ffe0b8'); }
      // the dome with swirl lines
      const dome = () => { g.beginPath(); g.moveTo(-19, -5); g.quadraticCurveTo(-20, -31, 0, -31); g.quadraticCurveTo(20, -31, 19, -5); g.quadraticCurveTo(0, -1, -19, -5); g.closePath(); };
      dome(); g.fillStyle = rgrad(g, -6, -22, 1, 24, '#8ff7ec', '#2fbfb2', '#1a6f6a'); g.fill(); g.save(); dome(); g.clip();
      g.strokeStyle = '#ff8a2a'; g.lineWidth = 2.2; g.beginPath(); g.arc(8, -14, 9, Math.PI * 1.1, Math.PI * 2.1); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.beginPath(); g.arc(-4, -22, 10, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
      g.restore(); dome(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      eyeSocket(g, -6, -15, 6.4, '#ff8a2a', '#ffd27a');
    },
    blades(c, o, t, front) {
      const sp = clamp(o.spin ?? 0.3, 0, 1.5), ang = t * (1.6 + 9 * sp), n = 8;
      for (let k = 0; k < n; k++) {
        const a = ang + k * TAU / n, sn = Math.sin(a); if ((sn >= 0) !== front) continue;
        const cs = Math.cos(a), x = cs * 33, y = -2 + sn * 9.5, w = 3 + Math.abs(sn) * 4;
        c.fillStyle = k & 1 ? '#ff8a2a' : '#3fd6c8'; c.strokeStyle = INK; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(x - w * 0.5, y - 1); c.lineTo(x + cs * 9 - w * 0.2, y - 6 - sn * 1.5); c.lineTo(x + cs * 9 + w * 0.6, y - 4.5 - sn * 1.5); c.lineTo(x + w * 0.5, y + 1.5); c.closePath(); c.fill(); c.stroke();
      }
      if (front && sp > 0.55 && !REDUCED) { c.globalAlpha *= 0.35; c.strokeStyle = '#e6fffb'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -3, 41, 12, 0, 0.15, Math.PI - 0.15); c.stroke(); c.globalAlpha /= 0.35; }
    },
    back(c, o, t, L) { this.blades(c, o, t, false); },
    front(c, o, t, L) { this.blades(c, o, t, true); if (!L.limp) { c.globalCompositeOperation = 'lighter'; glowAt(c, '#9ff0e8', 0, 33, 10 + Math.sin(t * 9) * 2, 0.7); c.globalCompositeOperation = 'source-over'; } },
  },
  kabeer: {
    box: [-66, -72, 132, 122], eye: [-24, -8, 9.6], mouth: [-21, 15, 16], muzzle: [-44, 4], hatch: [6, 32], eng: [[49, -6, 0.55], [49, 15, 0.55]], spots: [[8, -14], [30, -2], [-8, 4], [22, 22], [-32, 4]],
    body(g) {
      // old satellite solar wings at the back
      g.save(); g.translate(30, -30); g.rotate(-0.5); g.fillStyle = '#7d879e'; g.strokeStyle = INK; g.lineWidth = 1.2; g.fillRect(-2, 0, 4, 14); g.strokeRect(-2, 0, 4, 14); panel(g, -15, -20, 30, 20); g.restore();
      g.save(); g.translate(32, 30); g.rotate(0.45); g.fillStyle = '#7d879e'; g.strokeStyle = INK; g.lineWidth = 1.2; g.fillRect(-2, -14, 4, 14); g.strokeRect(-2, -14, 4, 14); panel(g, -13, 0, 26, 17); g.restore();
      nozzle(g, 42, -6, 1.15); nozzle(g, 42, 15, 1.15);
      // bent-antenna crown
      antennaBall(g, -18, -36, [[-24, -46], [-30, -52]], '#ffd23f'); antennaBall(g, -2, -42, [[-3, -52], [2, -56], [0, -64]], '#ff8a3d'); antennaBall(g, 12, -38, [[19, -46], [22, -56]], '#5ec8ff');
      g.save(); g.translate(26, -36); g.rotate(0.5); g.fillStyle = '#eef1f6'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(0, 6, 6, 0); g.quadraticCurveTo(0, 2, -6, 0); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, 2); g.lineTo(-3, 9); g.stroke(); g.restore();
      // the patched hull
      const hull = () => { g.beginPath(); g.moveTo(-42, -10); g.quadraticCurveTo(-44, -28, -24, -30); g.lineTo(26, -32); g.quadraticCurveTo(44, -32, 44, -14); g.lineTo(44, 20); g.quadraticCurveTo(44, 34, 28, 34); g.lineTo(-24, 32); g.quadraticCurveTo(-44, 30, -42, 12); g.closePath(); };
      hull(); g.fillStyle = metal(g, 0, -32, 0, 34, '#d7dce6', '#9aa3b8', '#5b6178'); g.fill();
      g.save(); hull(); g.clip();
      panel(g, 4, -27, 24, 15);
      g.fillStyle = '#e8b64a'; g.fillRect(-36, 16, 20, 13); g.strokeStyle = 'rgba(120,80,10,.6)'; g.lineWidth = 0.8; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(-36, 18 + k * 3); g.lineTo(-30, 19.5 + k * 3); g.lineTo(-24, 17.5 + k * 3); g.lineTo(-16, 19 + k * 3); } g.stroke();
      g.fillStyle = '#b4bdcc'; g.fillRect(20, 4, 20, 16); g.strokeStyle = 'rgba(28,21,48,.5)'; g.lineWidth = 0.8; g.strokeRect(20, 4, 20, 16);
      g.fillStyle = '#8f5a3a'; g.fillRect(-8, -30, 10, 12); g.strokeRect(-8, -30, 10, 12);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-40, -26, 80, 3);
      g.fillStyle = 'rgba(20,15,40,.2)'; g.fillRect(-46, 24, 92, 12);
      g.restore(); hull(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
      for (const [x, y] of [[22, 6], [38, 6], [22, 18], [38, 18], [-36, -18], [-4, 26], [14, 28], [34, -24]]) rivet(g, x, y, 1.2);
      tapeAt(g, 12, -6, 0.3, 16);
      // the crown
      g.fillStyle = metal(g, 0, -44, 0, -30, '#fff3a0', '#ffd23f', '#c9930f'); g.strokeStyle = INK; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(-22, -29); g.lineTo(-20, -40); g.lineTo(-11, -33); g.lineTo(-2, -45); g.lineTo(6, -33); g.lineTo(14, -41); g.lineTo(18, -30); g.closePath(); g.fill(); g.stroke();
      for (const [x, y, col] of [[-11, -35, '#e23b4a'], [-2, -36, '#2fd1c5'], [6.5, -35, '#e23b4a']]) { g.fillStyle = col; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); g.lineWidth = 0.8; g.stroke(); }
      // hatch frame (its door is drawn live)
      g.fillStyle = '#2a1a14'; g.lineWidth = 1.6; g.beginPath(); g.roundRect(-6, 20, 22, 13, 2); g.fill(); g.stroke();
      eyeSocket(g, -24, -8, 9.6);
    },
    front(c, o, t, L) { // the junk hatch: the door swings down and shows the glowing hold
      const h = clamp(o.hatch || 0, 0, 1);
      if (h > 0.02) { c.globalCompositeOperation = 'lighter'; glowAt(c, '#ff9a3d', 5, 27, 16 * h + 6, 0.8 * h); c.globalCompositeOperation = 'source-over'; }
      c.save(); c.translate(5, 33); c.scale(1, Math.cos(h * 1.35)); c.fillStyle = '#8f97ad'; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.roundRect(-11, -13, 22, 13, 2); c.fill(); c.stroke();
      c.strokeStyle = '#ffd23f'; c.lineWidth = 1.4; c.beginPath(); for (let k = 0; k < 3; k++) { c.moveTo(-8 + k * 6, -11); c.lineTo(-4 + k * 6, -2); } c.stroke(); c.restore();
    },
  },
  sindan: {
    box: [-60, -46, 114, 88], eye: [-5, -12, 6.4, 'slit'], mouth: [8, 8, 12], muzzle: [-53, -16], hatch: [6, 32], eng: [[46, -2, 0.6], [42, 27, 0.5]], spots: [[18, -18], [26, 22], [-6, 24], [12, 4]],
    body(g) {
      nozzle(g, 40, -2, 1.3); nozzle(g, 36, 27, 1.1);
      const anv = () => { g.beginPath(); g.moveTo(-53, -16); g.quadraticCurveTo(-32, -24, -18, -27); g.lineTo(30, -27); g.quadraticCurveTo(40, -27, 40, -17); g.lineTo(40, -10); g.quadraticCurveTo(30, -8, 24, 2); g.lineTo(22, 14);
        g.quadraticCurveTo(31, 16, 37, 24); g.lineTo(37, 33); g.lineTo(-25, 33); g.lineTo(-25, 24); g.quadraticCurveTo(-18, 16, -10, 14); g.lineTo(-12, 2); g.quadraticCurveTo(-24, -8, -53, -16); g.closePath(); };
      anv(); g.fillStyle = metal(g, 0, -27, 0, 33, '#7d849c', '#454a5c', '#22242e'); g.fill();
      g.save(); anv(); g.clip();
      g.fillStyle = '#9aa1b6'; g.fillRect(-55, -28, 98, 4.5); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-30, -27, 66, 1.6);
      g.fillStyle = '#e8b64a'; g.fillRect(-55, -21.5, 98, 2.4); g.fillRect(-27, 25, 66, 2.4);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-27, 28, 66, 6);
      g.strokeStyle = 'rgba(10,8,20,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(4, -19); g.lineTo(4, 25); g.moveTo(-12, 2); g.lineTo(23, 2); g.stroke();
      g.restore(); anv(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
      for (const x of [-34, -20, -4, 12, 28]) rivet(g, x, -24.5, 1.2, '#ffd23f');
      for (const x of [-18, -2, 14, 30]) rivet(g, x, 30, 1.2, '#ffd23f');
      for (const [x, y] of [[-6, 8], [16, 8], [32, -15]]) rivet(g, x, y, 1.2, '#ffd23f');
      // the visor slit with one eye
      g.fillStyle = '#120c1e'; g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.roundRect(-21, -18.5, 30, 13, 6.5); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-17, -17); g.lineTo(5, -17); g.stroke();
    },
  },
  sifr: {
    box: [-54, -38, 106, 74], eye: [-14, 0, 6.6, 'ring'], mouth: null, muzzle: [-50, 2], hatch: [10, 14], eng: [[47, 2, 0.6]], spots: [[10, -8], [24, 6], [-24, 6], [2, 8]],
    body(g) {
      const dart = () => { g.beginPath(); g.moveTo(-50, 2); g.quadraticCurveTo(-30, -11, -6, -14); g.lineTo(20, -15); g.lineTo(40, -32); g.lineTo(36, -12); g.quadraticCurveTo(45, -6, 45, 2); g.quadraticCurveTo(45, 10, 36, 14); g.lineTo(40, 30); g.lineTo(20, 16); g.lineTo(-6, 14); g.quadraticCurveTo(-30, 12, -50, 2); g.closePath(); };
      dart(); g.fillStyle = metal(g, 0, -15, 0, 16, '#3a3850', '#1a1824', '#08070c'); g.fill();
      g.save(); dart(); g.clip(); g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(-44, -1); g.quadraticCurveTo(-26, -10, -4, -11.5); g.lineTo(30, -12); g.lineTo(30, -9.5); g.lineTo(-4, -9); g.quadraticCurveTo(-26, -7, -44, -1); g.closePath(); g.fill(); g.restore();
      dart(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#2a2838'; g.beginPath(); g.roundRect(38, -4, 8, 12, 3); g.fill(); g.lineWidth = 1.4; g.stroke();
      g.fillStyle = '#05040a'; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.arc(-14, 0, 10, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.arc(-14, 0, 8.6, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
    },
    // red line work (cyan once fixed), baked per colour and blitted additive
    lines(col, sb) {
      return bake('sifrl|' + col + '|' + sb, -54, -38, 106, 74, BAKE * sb, g => {
        g.lineCap = 'round'; g.lineJoin = 'round';
        const path = () => { g.beginPath(); g.moveTo(-40, 2); g.quadraticCurveTo(-26, -7, -4, -8.5); g.lineTo(30, -9); g.moveTo(-2, 9); g.lineTo(32, 9); g.lineTo(36, 22); g.moveTo(22, -11); g.lineTo(36, -25); g.moveTo(-28, 5); g.lineTo(-8, 7); };
        path(); g.strokeStyle = css(col, 0.28); g.lineWidth = 4.2; g.stroke(); g.strokeStyle = css(col, 1); g.lineWidth = 1.5; g.stroke();
        g.fillStyle = css(col, 1); g.fillRect(41, -1, 3, 6);
      });
    },
    front(c, o, t, L) {
      const e = this.lines(L.fixed ? '#5ef2ff' : '#ff3048', L.sb), ga = c.globalAlpha;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = ga * (L.limp ? 0.35 : 0.75 + 0.25 * Math.sin(t * 2.2)); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); c.globalAlpha = ga; c.globalCompositeOperation = 'source-over';
    },
  },
};
// ---------- v3.5 robot families ----------
// Every journey's robots are one family in three sizes: a YOUNG form (new small bodies, also the workers that fly in the
// legs), the GROWN form (the rival bodies above) and a giant final form: the grown body drawn `k` times bigger with royal
// parts built around it (drawn at their own size so the line weight stays the same as everything else).
const hexP = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); };
const crown = (g, x, y, w, h, gem = '#ff5a8a') => {
  g.fillStyle = metal(g, 0, y - h, 0, y, '#fff3a0', '#ffd23f', '#c9930f'); g.strokeStyle = INK; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x - w / 2 - 2, y - h * 0.8); g.lineTo(x - w / 4, y - h * 0.4); g.lineTo(x, y - h); g.lineTo(x + w / 4, y - h * 0.4); g.lineTo(x + w / 2 + 2, y - h * 0.8); g.lineTo(x + w / 2, y); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - w / 2 + 2, y - 3.4, w - 4, 1.4);
  for (const [px, py] of [[x - w / 2 - 2, y - h * 0.8], [x, y - h], [x + w / 2 + 2, y - h * 0.8]]) { g.fillStyle = gem; g.beginPath(); g.arc(px, py, 2.3, 0, TAU); g.fill(); g.lineWidth = 1; g.stroke(); }
};
const KIN = {
  // ---- young forms ----
  y_khurda: {
    box: [-30, -30, 60, 56], eye: [-8, 0, 5.4], mouth: [4, 7, 6], muzzle: [-22, 3], hatch: [2, 12], eng: [[22, 0, 0.3]], spots: [[6, -4], [10, 5], [-2, -7], [12, -3]],
    body(g) {
      nozzle(g, 17, 0, 0.7); antennaBall(g, 2, -12, [[4, -19], [1, -24]], '#ff8a2a');
      const can = () => { g.beginPath(); g.roundRect(-20, -12, 38, 24, 11); };
      can(); g.fillStyle = metal(g, 0, -12, 0, 12, '#ffffff', '#e6e9f0', '#a6b1c7'); g.fill(); g.save(); can(); g.clip();
      g.fillStyle = '#ff8a2a'; g.fillRect(-1, -13, 6, 26); g.fillRect(9, -13, 3, 26); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(-20, -9, 40, 2.5); g.fillStyle = 'rgba(40,30,60,.18)'; g.fillRect(-20, 7, 40, 6);
      g.restore(); can(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      tapeAt(g, 9, -4, 0.5, 9); rivet(g, -16, -7, 0.9); rivet(g, 14, 8, 0.9);
      eyeSocket(g, -8, 0, 5.4);
    },
  },
  y_bubolt: {
    box: [-30, -30, 60, 56], eye: [-7, -1, 5.2], mouth: [-5, 8, 6], muzzle: [-20, 3], hatch: [2, 13], eng: [[22, 2, 0.3]], spots: [[6, 2], [10, 7], [-2, 10], [11, -3]],
    body(g) {
      nozzle(g, 16, 2, 0.7);
      const pot = () => { g.beginPath(); g.ellipse(0, 1, 17, 15, 0.08, 0, TAU); };
      pot(); g.fillStyle = rgrad(g, -5, -6, 1, 19, '#b98a55', '#8a5a30', '#4f2f16'); g.fill(); g.save(); pot(); g.clip();
      g.fillStyle = 'rgba(60,30,10,.4)'; for (const [x, y] of [[6, 2], [10, 8], [1, 11], [12, -2]]) { g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(40,20,5,.22)'; g.fillRect(-18, 9, 36, 8); g.restore(); pot(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      // a deckhand's bandana with a knot
      g.fillStyle = '#e23b4a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(14, -9); g.lineTo(24, -14); g.lineTo(22, -5); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-17, -5); g.quadraticCurveTo(0, -22, 17, -5); g.quadraticCurveTo(0, -11, -17, -5); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; for (const x of [-7, 1, 9]) { g.beginPath(); g.arc(x, -11.5 + Math.abs(x) * 0.14, 1, 0, TAU); g.fill(); }
      eyeSocket(g, -7, -1, 5.2, '#5a3a1c', '#d8b48a');
    },
  },
  y_zannana: {
    box: [-30, -30, 58, 52], eye: [-9, -2, 4.4], mouth: null, muzzle: [-22, 7], hatch: [4, 10], eng: [[19, 3, 0.24]], spots: [[6, 0], [10, 5], [-2, 6], [4, -5]],
    rot: [[-4, -14, 8, 1], [10, -14, 8, 0]],
    body(g) {
      for (const [hx, hy] of this.rot) { g.beginPath(); g.moveTo(hx * 0.4 + 2, -5); g.lineTo(hx, hy); g.lineWidth = 2.8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.3; g.strokeStyle = '#9aa3b8'; g.stroke(); }
      const ab = () => { g.beginPath(); g.ellipse(5, 2, 13, 10, -0.08, 0, TAU); };
      ab(); g.fillStyle = rgrad(g, 1, -3, 1, 15, '#fff27a', '#ffd23f', '#c9930f'); g.fill(); g.save(); ab(); g.clip();
      g.fillStyle = '#1d1b22'; for (const x of [3, 11]) { g.beginPath(); g.moveTo(x, -10); g.lineTo(x + 4, -10); g.lineTo(x + 2, 13); g.lineTo(x - 2, 13); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(1, -5, 6, 2, -0.1, 0, TAU); g.fill(); g.restore(); ab(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
      g.fillStyle = '#2a2d3c'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-9, 4); g.lineTo(-23, 7); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke();
      antennaBall(g, -11, -8, [[-14, -13], [-17, -15]], '#ffd23f');
      g.fillStyle = rgrad(g, -10, -4, 1, 9, '#5b6178', '#2a2d3c', '#16141c'); g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.arc(-8, -1, 7.5, 0, TAU); g.fill(); g.stroke();
      eyeSocket(g, -9, -2, 4.4, '#ffd23f', '#c9930f');
    },
    back(c, o, t) { rotors(c, this.rot, t, 0); }, front(c, o, t) { rotors(c, this.rot, t, 1); },
  },
  y_magna: {
    box: [-30, -28, 62, 56], eye: [4, 0, 4.6], mouth: null, muzzle: [-18, 0], hatch: [4, 16], eng: [[25, 0, 0.3]], spots: [[12, -10], [15, 5], [6, 12], [-6, -12]],
    body(g) {
      nozzle(g, 20, 0, 0.7);
      const shoe = () => { g.beginPath(); g.moveTo(-17, -16); g.lineTo(2, -16); g.arc(2, 0, 16, -Math.PI / 2, Math.PI / 2); g.lineTo(-17, 16); g.lineTo(-17, 7); g.lineTo(2, 7); g.arc(2, 0, 7, Math.PI / 2, -Math.PI / 2, true); g.lineTo(-17, -7); g.closePath(); };
      shoe(); g.fillStyle = metal(g, 0, -16, 0, 16, '#ff6a6a', '#e23b4a', '#9a1a26'); g.fill(); g.save(); shoe(); g.clip();
      g.fillStyle = metal(g, -17, 0, -9, 0, '#ffffff', '#d8dde8', '#8f97ad'); g.fillRect(-18, -17, 9, 34); g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-9, -17); g.lineTo(-9, 17); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-18, -14, 40, 2.4); g.restore(); shoe(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#4a4f63'; g.lineWidth = 1.5; g.beginPath(); g.arc(4, 0, 7.6, 0, TAU); g.fill(); g.stroke();
      eyeSocket(g, 4, 0, 4.6);
    },
  },
  y_radar: {
    box: [-30, -34, 60, 62], eye: [-6, 3, 5], mouth: null, muzzle: [-20, 4], hatch: [0, 15], eng: [[21, 7, 0.28]], spots: [[6, 0], [8, 10], [-2, 12], [9, -3]],
    body(g) {
      nozzle(g, 16, 7, 0.65);
      g.strokeStyle = INK; g.lineWidth = 3.2; g.beginPath(); g.moveTo(3, -6); g.lineTo(3, -14); g.stroke(); g.strokeStyle = '#9aa3b8'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = rgrad(g, 0, -20, 1, 12, '#ffffff', '#dfe5f0', '#9aa3b8'); g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.ellipse(3, -19, 12, 9, -0.25, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#e23b4a'; g.beginPath(); g.arc(1.5, -19.5, 2.1, 0, TAU); g.fill(); g.lineWidth = 1; g.stroke();
      const pod = () => { g.beginPath(); g.roundRect(-16, -7, 30, 22, 9); };
      pod(); g.fillStyle = metal(g, 0, -7, 0, 15, '#ffffff', '#e3e8f2', '#a9b3c8'); g.fill(); g.save(); pod(); g.clip();
      g.fillStyle = '#2f7fe0'; g.fillRect(-16, 9, 32, 3.5); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-16, -4, 32, 2); g.restore(); pod(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      rivet(g, 9, -2, 0.9); eyeSocket(g, -6, 3, 5, '#2f7fe0', '#a8cfff');
    },
  },
  y_ghummaid: {
    box: [-28, -32, 56, 58], eye: [-7, -3, 5.4], mouth: [-7, 7, 5], muzzle: [-18, 1], hatch: [0, 14], eng: [[18, 5, 0.26]], spots: [[2, -10], [0, 9], [-12, 8], [5, 11]],
    body(g) {
      nozzle(g, 13, 5, 0.6); antennaBall(g, 2, -14, [[4, -20], [2, -25]], '#ff9fd8');
      const egg = () => { g.beginPath(); g.ellipse(0, 0, 17, 15.5, 0, 0, TAU); };
      egg(); g.fillStyle = rgrad(g, -5, -6, 1, 18, '#b892f0', '#7a4cc8', '#3e2273'); g.fill(); g.save(); egg(); g.clip();
      g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(-5, -10, 8, 2.6, -0.35, 0, TAU); g.fill();
      for (const [x, y, col] of [[7, -4, '#7ff7d6'], [11, 2, '#ff9fd8'], [6, 6, '#5ec8ff']]) { g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.roundRect(x - 2.4, y - 2.4, 4.8, 4.8, 1); g.fill(); g.stroke(); }
      g.restore(); egg(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      eyeSocket(g, -7, -3, 5.4, '#5a3a9a', '#d8c4ff');
    },
  },
  y_dawwama: {
    box: [-28, -28, 56, 54], eye: [-4, -9, 4.4], mouth: null, muzzle: [-20, -1], hatch: [0, 14], eng: [], spots: [[6, -11], [5, 7], [-8, -12], [-6, 6]],
    body(g) {
      g.strokeStyle = INK; g.lineWidth = 1.8;
      g.fillStyle = metal(g, -12, 0, 12, 0, '#1f8a86', '#3fd6c8', '#1a6f6a'); g.beginPath(); g.moveTo(-12, 2); g.lineTo(12, 2); g.quadraticCurveTo(6, 11, 2, 18); g.lineTo(-2, 18); g.quadraticCurveTo(-6, 11, -12, 2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ff8a2a'; g.fillRect(-7, 7, 14, 2.2);
      g.fillStyle = metal(g, 0, -7, 0, 5, '#ffc07a', '#ff8a2a', '#c8561a'); g.beginPath(); g.ellipse(0, -1, 20, 6, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = rgrad(g, -4, -14, 1, 15, '#8ff7ec', '#2fbfb2', '#1a6f6a'); g.beginPath(); g.moveTo(-12, -3); g.quadraticCurveTo(-13, -19, 0, -19); g.quadraticCurveTo(13, -19, 12, -3); g.quadraticCurveTo(0, 0, -12, -3); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(-3, -13, 6, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
      eyeSocket(g, -4, -9, 4.4, '#ff8a2a', '#ffd27a');
    },
    front(c, o, t, L) { if (!L.limp) { c.globalCompositeOperation = 'lighter'; glowAt(c, '#9ff0e8', 0, 20, 6 + Math.sin(t * 9) * 1.2, 0.7); c.globalCompositeOperation = 'source-over'; } },
  },
  y_sifr: {
    box: [-30, -22, 58, 44], eye: [-6, 0, 3.8, 'ring'], mouth: null, muzzle: [-24, 1], hatch: [4, 8], eng: [[23, 1, 0.3]], spots: [[5, -3], [12, 3], [-12, 3], [1, 4]],
    body(g) {
      const d = () => { g.beginPath(); g.moveTo(-24, 1); g.quadraticCurveTo(-12, -6, 0, -7); g.lineTo(10, -8); g.lineTo(19, -17); g.lineTo(17, -6); g.quadraticCurveTo(22, -3, 22, 1); g.quadraticCurveTo(22, 5, 17, 8); g.lineTo(19, 17); g.lineTo(10, 9); g.lineTo(0, 8); g.quadraticCurveTo(-12, 7, -24, 1); g.closePath(); };
      d(); g.fillStyle = metal(g, 0, -8, 0, 9, '#4a4866', '#211f30', '#0b0a12'); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
      g.strokeStyle = 'rgba(255,48,72,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-18, 1); g.quadraticCurveTo(-10, -3.5, 2, -4.5); g.lineTo(13, -5); g.moveTo(2, 5); g.lineTo(14, 5); g.stroke(); g.strokeStyle = '#ff3048'; g.lineWidth = 1.1; g.stroke();
      g.fillStyle = '#05040a'; g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.arc(-6, 0, 5.6, 0, TAU); g.fill(); g.stroke();
    },
  },
};
// a giant final form around a grown body
function giant(base, k, o) {
  const B = RV[base], sc = p => p.map(v => v * k), kl = L => { _LK.mood = L.mood; _LK.tell = L.tell; _LK.limp = L.limp; _LK.fixed = L.fixed; _LK.sb = sBucket(L.sb * k); return _LK; };
  return Object.assign({
    box: o.box, eye: [B.eye[0] * k, B.eye[1] * k, B.eye[2] * k, B.eye[3]], mouth: B.mouth && sc(B.mouth), muzzle: sc(B.muzzle), hatch: sc(B.hatch), eng: o.eng, spots: B.spots.map(sc),
    body(g) { if (o.under) o.under(g); g.save(); g.scale(k, k); B.body(g); g.restore(); if (o.over) o.over(g); },
    back(c, ob, t, L) { if (o.liveBack) o.liveBack(c, ob, t, L); if (B.back) { c.save(); c.scale(k, k); B.back(c, ob, t, kl(L)); c.restore(); } },
    front(c, ob, t, L) { if (B.front) { c.save(); c.scale(k, k); B.front(c, ob, t, kl(L)); c.restore(); } if (o.liveFront) o.liveFront(c, ob, t, L); },
  });
}
const _LK = { mood: 'angry', tell: 0, limp: 0, fixed: false, sb: 1 };
const panelAt = (g, x, y, w, h, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = metal(g, 0, -h / 2, 0, h / 2, '#5a8fe6', '#2f5fc0', '#1b3a80'); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 3); g.fill(); g.stroke(); g.strokeStyle = 'rgba(200,225,255,.6)'; g.lineWidth = 0.9; g.beginPath(); for (let i = 1; i < 5; i++) { g.moveTo(-w / 2 + i * w / 5, -h / 2 + 2); g.lineTo(-w / 2 + i * w / 5, h / 2 - 2); } g.moveTo(-w / 2 + 2, 0); g.lineTo(w / 2 - 2, 0); g.stroke(); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 3); g.restore(); };
const strut = (g, x0, y0, x1, y1, w = 5) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = INK; g.lineWidth = w; g.stroke(); g.strokeStyle = '#9aa3b8'; g.lineWidth = w - 2.6; g.stroke(); };
Object.assign(KIN, {
  // Moon: the Scrap Mother, a patched satellite the size of a station
  q_khurda: giant('khurda', 1.75, { box: [-96, -104, 206, 196], eng: [[98, -30, 0.7], [98, 30, 0.7], [84, 62, 0.5]],
    under(g) {
      strut(g, 10, -20, 34, -70); strut(g, 10, 20, 40, 62); strut(g, 40, 0, 86, 0, 7);
      panelAt(g, 46, -78, 84, 30, -0.22); panelAt(g, -30, -70, 50, 22, 0.12);
      // strapped booster tank underneath
      const tank = () => { g.beginPath(); g.roundRect(-34, 44, 112, 34, 17); };
      tank(); g.fillStyle = metal(g, 0, 44, 0, 78, '#ffb86a', '#ff8a2a', '#b85410'); g.fill(); g.save(); tank(); g.clip(); g.fillStyle = '#fff'; g.fillRect(-2, 44, 12, 34); g.fillRect(40, 44, 6, 34); g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(-34, 49, 112, 4); g.fillStyle = 'rgba(60,20,0,.22)'; g.fillRect(-34, 70, 112, 8); g.restore(); tank(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
      nozzle(g, 78, 61, 1.5);
      // engine block behind the can
      g.fillStyle = metal(g, 0, -44, 0, 44, '#8d94a8', '#5b6178', '#33374a'); g.lineWidth = 2.4; g.beginPath(); g.roundRect(52, -44, 34, 88, 8); g.fill(); g.stroke();
      for (const y of [-34, -12, 12, 34]) rivet(g, 60, y, 1.6);
      nozzle(g, 88, -30, 1.9); nozzle(g, 88, 30, 1.9);
    },
    over(g) {
      for (const y of [44, 78]) { g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(-12, y === 44 ? 30 : 78); g.lineTo(-12, y === 44 ? 50 : 78); g.stroke(); }
      g.fillStyle = '#4a4f63'; g.strokeStyle = INK; g.lineWidth = 2; for (const x of [-16, 54]) { g.beginPath(); g.roundRect(x, 36, 9, 46, 3); g.fill(); g.stroke(); }
      tapeAt(g, 20, 60, -0.3, 22); tapeAt(g, 66, -8, 0.8, 18); crackAt(g, 60, 62, 1.3, 0.4);
      // hazard collar
      g.save(); g.beginPath(); g.roundRect(-64, 26, 40, 9, 3); g.clip(); g.fillStyle = '#ffd23f'; g.fillRect(-66, 24, 46, 14); g.fillStyle = '#1d1b22'; for (let x = -70; x < -20; x += 10) { g.beginPath(); g.moveTo(x, 38); g.lineTo(x + 6, 24); g.lineTo(x + 11, 24); g.lineTo(x + 5, 38); g.closePath(); g.fill(); } g.restore();
      g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.roundRect(-64, 26, 40, 9, 3); g.stroke();
    } }),
  // Mars: the Rust Captain on the deck of a barrel galleon
  q_bubolt: giant('bubolt', 1.7, { box: [-104, -100, 214, 196], eng: [[104, 52, 0.75], [104, 74, 0.55]],
    under(g) {
      // mast and sail behind
      strut(g, 46, 30, 46, -72, 6);
      g.fillStyle = metal(g, 50, 0, 96, 0, '#f4ecd8', '#e2d6b6', '#b8a880'); g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.moveTo(50, -66); g.quadraticCurveTo(100, -44, 92, -4); g.quadraticCurveTo(72, -10, 50, -8); g.closePath(); g.fill(); g.stroke();
      tapeAt(g, 72, -32, 0.5, 16); g.strokeStyle = 'rgba(120,90,50,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(54, -46); g.quadraticCurveTo(76, -36, 88, -24); g.stroke();
      // the hull: a long barrel boat
      const hull = () => { g.beginPath(); g.moveTo(-92, 34); g.lineTo(96, 30); g.quadraticCurveTo(100, 78, 60, 88); g.lineTo(-50, 88); g.quadraticCurveTo(-84, 80, -92, 34); g.closePath(); };
      hull(); g.fillStyle = metal(g, 0, 34, 0, 90, '#b07840', '#8a5a30', '#4a2c14'); g.fill(); g.save(); hull(); g.clip();
      g.strokeStyle = 'rgba(40,20,5,.55)'; g.lineWidth = 1.6; g.beginPath(); for (const y of [48, 62, 76]) { g.moveTo(-96, y); g.lineTo(100, y - 2); } g.stroke();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-96, 36, 200, 5); g.restore(); hull(); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
      // iron bands and portholes
      g.fillStyle = '#5b6178'; g.lineWidth = 1.8; for (const x of [-56, 2, 60]) { g.beginPath(); g.roundRect(x - 4, 33, 8, 55, 2); g.fill(); g.stroke(); rivet(g, x, 42, 1.3); rivet(g, x, 78, 1.3); }
      for (const x of [-26, 32]) { g.fillStyle = '#16141c'; g.lineWidth = 2; g.beginPath(); g.arc(x, 62, 9, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#d8b48a'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, 62, 11.5, 0, TAU); g.stroke(); g.strokeStyle = INK; }
      nozzle(g, 92, 52, 1.9); nozzle(g, 92, 74, 1.3);
    },
    over(g) {
      // two deck cannons pointing at the ship
      for (const [x, y, s] of [[-66, 40, 1], [-40, 70, 0.85]]) { g.fillStyle = metal(g, 0, y - 8, 0, y + 8, '#6b7189', '#3b3f52', '#1c1a26'); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.roundRect(x - 36 * s, y - 7 * s, 44 * s, 14 * s, 4); g.fill(); g.stroke(); g.fillStyle = '#d8b48a'; g.beginPath(); g.roundRect(x - 40 * s, y - 9 * s, 8 * s, 18 * s, 3); g.fill(); g.stroke(); g.fillStyle = '#8a5a30'; g.beginPath(); g.arc(x + 4 * s, y + 8 * s, 7 * s, 0, TAU); g.fill(); g.stroke(); }
      // gold epaulette and an earring
      g.fillStyle = '#ffd23f'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(34, -20, 12, 6, 0.5, 0, TAU); g.fill(); g.stroke(); for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(28 + i * 5, -15 + i * 2.6); g.lineTo(27 + i * 5, -6 + i * 2.6); g.stroke(); }
    } }),
  // Venus: the Hive Queen
  q_zannana: giant('zannana', 1.7, { box: [-70, -100, 212, 166], eng: [[132, 8, 0.5]],
    under(g) {
      const ab = () => { g.beginPath(); g.moveTo(22, -22); g.bezierCurveTo(60, -42, 112, -24, 118, 8); g.bezierCurveTo(120, 36, 80, 48, 44, 38); g.bezierCurveTo(26, 32, 14, 6, 22, -22); g.closePath(); };
      // rear sting first, the abdomen covers its root
      g.fillStyle = metal(g, 0, 0, 0, 22, '#4a4f63', '#2a2d3c', '#16141c'); g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.moveTo(110, -6); g.lineTo(138, 10); g.lineTo(108, 24); g.closePath(); g.fill(); g.stroke();
      ab(); g.fillStyle = rgrad(g, 56, -14, 4, 74, '#fff27a', '#ffd23f', '#b9820a'); g.fill();
      g.save(); ab(); g.clip(); g.fillStyle = '#1d1b22'; for (const x of [46, 68, 90, 108]) { g.beginPath(); g.moveTo(x, -46); g.lineTo(x + 9, -46); g.lineTo(x + 2, 52); g.lineTo(x - 8, 52); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(66, -22, 32, 5, 0.1, 0, TAU); g.fill(); g.fillStyle = 'rgba(60,30,0,.25)'; g.fillRect(14, 30, 112, 22); g.restore();
      ab(); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
      // hive cells: the hatches the workers leave by
      for (const [x, y] of [[59, 12], [81, 16], [101, 8]]) { hexP(g, x, y, 8.5); g.fillStyle = '#3a2408'; g.fill(); g.lineWidth = 1.8; g.stroke(); hexP(g, x, y, 4.6); g.fillStyle = '#ffb347'; g.fill(); }
    },
    over(g) {
      crown(g, -17, -17, 22, 17);
      // royal collar between head and body
      g.fillStyle = '#e23b4a'; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(4, 2, -6, 20); g.lineTo(-1, 20); g.quadraticCurveTo(10, 2, -1, -14); g.closePath(); g.fill(); g.stroke();
    },
    liveBack(c, o, t) {
      const f = REDUCED ? 0 : Math.sin(t * 30) * 0.16;
      for (const [a, l, w] of [[-1.05, 74, 14], [-0.62, 92, 16]]) { c.save(); c.translate(32, -18); c.rotate(a + f); c.fillStyle = 'rgba(210,235,255,.3)'; c.strokeStyle = 'rgba(28,21,48,.55)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(l / 2, 0, l / 2, w, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.moveTo(4, 0); c.lineTo(l - 8, 0); c.moveTo(l * 0.3, 0); c.lineTo(l * 0.6, -w * 0.7); c.stroke(); c.restore(); }
    } }),
  // Belt: the Lodestone, a magnet inside a magnet
  q_magna: giant('magna', 1.6, { box: [-78, -92, 190, 184], eng: [[104, -22, 0.7], [104, 22, 0.7]],
    under(g) {
      const shoe = () => { g.beginPath(); g.moveTo(-58, -80); g.lineTo(14, -80); g.arc(14, 0, 80, -Math.PI / 2, Math.PI / 2); g.lineTo(-58, 80); g.lineTo(-58, 58); g.lineTo(14, 58); g.arc(14, 0, 58, Math.PI / 2, -Math.PI / 2, true); g.lineTo(-58, -58); g.closePath(); };
      nozzle(g, 92, -22, 1.8); nozzle(g, 92, 22, 1.8);
      shoe(); g.fillStyle = metal(g, 0, -80, 0, 80, '#6aa0ff', '#2f6fe0', '#173a8a'); g.fill(); g.save(); shoe(); g.clip();
      g.fillStyle = metal(g, -58, 0, -36, 0, '#ffffff', '#d8dde8', '#8f97ad'); g.fillRect(-60, -82, 24, 164); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-36, -82); g.lineTo(-36, 82); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-60, -76, 160, 5); g.fillStyle = 'rgba(0,10,60,.25)'; g.fillRect(-60, 70, 160, 12); g.restore(); shoe(); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
      // copper coils round the bend
      for (const a of [-0.9, -0.3, 0.3, 0.9]) { g.save(); g.translate(14 + Math.cos(a) * 69, Math.sin(a) * 69); g.rotate(a); g.fillStyle = metal(g, 0, -8, 0, 8, '#ffc48a', '#d87a3a', '#8a4416'); g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.roundRect(-14, -8, 28, 16, 4); g.fill(); g.stroke(); g.strokeStyle = 'rgba(60,20,0,.5)'; g.lineWidth = 1; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(i * 5, -7); g.lineTo(i * 5, 7); } g.stroke(); g.restore(); }
      for (const y of [-69, 69]) { rivet(g, -47, y, 2); rivet(g, -10, y, 1.6); }
    },
    liveFront(c, o, t, L) {
      if (L.limp || REDUCED) return; const k = (t * 9) | 0;
      c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(160,220,255,.85)'; c.lineWidth = 1.6;
      for (const sd of [-1, 1]) { if (sr(k + sd * 3) < 0.45) continue; c.beginPath(); c.moveTo(-58, sd * 69); for (let i = 1; i <= 4; i++) c.lineTo(-58 + (sr(k * 5 + i + sd) - 0.5) * 14, sd * (69 - i * 7.2) ); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    } }),
  // Jupiter: the Great Array
  q_radar: giant('radar', 1.6, { box: [-92, -106, 190, 196], eng: [[84, 26, 0.6], [84, 54, 0.6]],
    under(g) {
      strut(g, 14, 10, 62, -52, 6); strut(g, 14, 30, 66, 62, 6); strut(g, 20, 20, 70, 20, 7);
      // backpack: a power block with two more dishes on arms
      g.fillStyle = metal(g, 0, -10, 0, 70, '#dfe5f0', '#aab4c8', '#6b7189'); g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.roundRect(30, -6, 44, 74, 10); g.fill(); g.stroke();
      g.fillStyle = '#2f7fe0'; g.fillRect(34, 8, 36, 6); g.fillRect(34, 46, 36, 6); for (const y of [0, 30, 62]) rivet(g, 68, y, 1.5);
      nozzle(g, 74, 26, 1.6); nozzle(g, 74, 54, 1.6);
      for (const [x, y, r, rot] of [[66, -62, 26, 0.5], [70, 78, 18, -0.3]]) { g.fillStyle = rgrad(g, x - 5, y - 5, 2, r, '#ffffff', '#dfe5f0', '#8f97ad'); g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.ellipse(x, y, r, r * 0.78, rot, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = 'rgba(40,50,80,.3)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, r * 0.62, r * 0.48, rot, 0, TAU); g.stroke(); g.fillStyle = '#e23b4a'; g.strokeStyle = INK; g.beginPath(); g.arc(x - 3, y - 1, r * 0.16, 0, TAU); g.fill(); g.stroke(); }
    },
    over(g) {
      // listening horns under the chin
      for (const [x, y] of [[-34, 52], [-12, 58]]) { g.fillStyle = '#4a4f63'; g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x + 6, y - 8); g.lineTo(x - 12, y + 2); g.lineTo(x - 10, y + 14); g.lineTo(x + 8, y + 2); g.closePath(); g.fill(); g.stroke(); }
    },
    liveFront(c, o, t, L) { if (L.limp) return; c.globalCompositeOperation = 'lighter'; for (const [x, y] of [[63, -63], [67, 77]]) glowAt(c, L.fixed ? '#5ef2ff' : '#ff4050', x, y, 9 + Math.sin(t * 5 + x) * 2, 0.7); c.globalCompositeOperation = 'source-over'; } }),
  // Saturn: the Mirror Moon, an orb with its own ring
  q_ghummaid: giant('ghummaid', 1.85, { box: [-104, -96, 208, 180], eng: [[58, 15, 0.7]],
    ring(g, front) {
      g.save(); g.translate(0, 6); g.rotate(-0.2); g.beginPath(); g.rect(-110, front ? 0 : -60, 220, 60); g.clip();
      g.strokeStyle = INK; g.lineWidth = 15; g.beginPath(); g.ellipse(0, 0, 88, 24, 0, 0, TAU); g.stroke();
      g.strokeStyle = '#e6c87a'; g.lineWidth = 10.5; g.stroke(); g.strokeStyle = '#9a7ac8'; g.lineWidth = 3.5; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, -1, 91, 26.5, 0, 0, TAU); g.stroke();
      g.restore();
    },
    under(g) { this.ring(g, false); for (const [x0, x1, y1] of [[-14, -22, -70], [4, 6, -78], [22, 32, -68]]) antennaBall(g, x0, -40, [[(x0 + x1) / 2, -58], [x1, y1]], '#ff9fd8'); },
    over(g) { this.ring(g, true); crown(g, -22, -37, 20, 15, '#7ff7d6'); },
    liveFront(c, o, t, L) {
      if (REDUCED) return;
      for (let i = 0; i < 3; i++) { const a = t * 1.1 + i * TAU / 3, sn = Math.sin(a); if (sn < 0) continue; const x = Math.cos(a) * 88, y = 6 + sn * 24 - Math.cos(a) * 17; c.fillStyle = ['#7ff7d6', '#ff9fd8', '#5ec8ff'][i]; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, 5.5, 0, TAU); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - 1.6, y - 1.8, 1.6, 0, TAU); c.fill(); }
    } }),
  // Uranus: the Cyclone, a top with a second, wider storey
  q_dawwama: giant('dawwama', 1.7, { box: [-100, -96, 200, 198], eng: [],
    under(g) {
      g.strokeStyle = INK; g.lineWidth = 2.4;
      const cone = () => { g.beginPath(); g.moveTo(-54, 24); g.lineTo(54, 24); g.quadraticCurveTo(30, 62, 6, 92); g.lineTo(-6, 92); g.quadraticCurveTo(-30, 62, -54, 24); g.closePath(); };
      cone(); g.fillStyle = metal(g, -54, 0, 54, 0, '#17706c', '#35c4b6', '#145a56'); g.fill(); g.save(); cone(); g.clip(); g.fillStyle = '#ff8a2a'; g.fillRect(-60, 40, 120, 6); g.fillRect(-60, 58, 120, 4.5); g.fillRect(-60, 74, 120, 3.5); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(-30, 24, 12, 70); g.restore(); cone(); g.stroke();
      g.fillStyle = '#9aa3b8'; g.beginPath(); g.roundRect(-5, 88, 10, 8, 3); g.fill(); g.stroke();
      // the wide lower disc
      g.fillStyle = metal(g, 0, 6, 0, 36, '#ffd09a', '#ff8a2a', '#b84c14'); g.beginPath(); g.ellipse(0, 22, 86, 17, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#2fbfb2'; g.beginPath(); g.ellipse(0, 23, 74, 11, 0, 0, Math.PI); g.fill(); g.lineWidth = 1.2; g.stroke();
      for (let k = 0; k < 11; k++) { const a = Math.PI * (0.08 + k * 0.084); rivet(g, Math.cos(a) * 80, 22 + Math.sin(a) * 14.5, 1.5, '#ffe0b8'); }
      for (const sd of [-1, 1]) { g.fillStyle = '#4a4f63'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.roundRect(sd * 84 - 7, 14, 14, 14, 4); g.fill(); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(sd * 84, 21, 3, 0, TAU); g.fill(); }
    },
    over(g) { crown(g, 0, -51, 24, 16, '#3fd6c8'); },
    liveFront(c, o, t, L) { if (!L.limp) { c.globalCompositeOperation = 'lighter'; glowAt(c, '#9ff0e8', 0, 98, 16 + Math.sin(t * 9) * 3, 0.75); c.globalCompositeOperation = 'source-over'; } } }),
  // Neptune: Zero Prime, the black flagship
  q_sifr: giant('sifr', 1.8, { box: [-104, -100, 216, 200], eng: [[104, -22, 0.9], [106, 4, 1.1], [104, 30, 0.9]],
    under(g) {
      for (const sd of [-1, 1]) {
        const wing = () => { g.beginPath(); g.moveTo(-10, sd * 22); g.lineTo(52, sd * 92); g.lineTo(96, sd * 96); g.lineTo(74, sd * 58); g.lineTo(84, sd * 24); g.closePath(); };
        wing(); g.fillStyle = metal(g, 0, sd * 20, 0, sd * 96, '#34324a', '#17151f', '#07060a'); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(2, sd * 28); g.lineTo(54, sd * 86); g.stroke();
        // wingtip cannon
        g.fillStyle = metal(g, 0, sd * 86, 0, sd * 100, '#4a4866', '#211f30', '#0b0a12'); g.lineWidth = 2; g.beginPath(); g.roundRect(20, sd * 92 - 5, 62, 10, 4); g.fill(); g.stroke();
      }
      g.fillStyle = metal(g, 0, -34, 0, 40, '#3a3850', '#1a1824', '#08070c'); g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.roundRect(64, -34, 34, 76, 9); g.fill(); g.stroke();
      for (const y of [-22, 4, 30]) { g.fillStyle = '#2a2838'; g.beginPath(); g.roundRect(92, y - 9, 12, 18, 4); g.fill(); g.stroke(); }
    },
    lines(col, sb) {
      return bake('qsifrl|' + col + '|' + sb, -104, -100, 216, 200, BAKE * sb, g => {
        g.lineCap = 'round'; g.lineJoin = 'round';
        const path = () => { g.beginPath(); for (const sd of [-1, 1]) { g.moveTo(6, sd * 34); g.lineTo(54, sd * 88); g.lineTo(88, sd * 92); g.moveTo(22, sd * 92); g.lineTo(78, sd * 92); g.moveTo(70, sd * 30); g.lineTo(94, sd * 30); } };
        path(); g.strokeStyle = css(col, 0.28); g.lineWidth = 5; g.stroke(); g.strokeStyle = css(col, 1); g.lineWidth = 1.7; g.stroke();
      });
    },
    liveFront(c, o, t, L) {
      const e = this.lines(L.fixed ? '#5ef2ff' : '#ff3048', L.sb), ga = c.globalAlpha;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = ga * (L.limp ? 0.35 : 0.75 + 0.25 * Math.sin(t * 2.2 + 1)); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); c.globalAlpha = ga; c.globalCompositeOperation = 'source-over';
    } }),
});
Object.assign(RV, KIN);
Object.assign(RIVAL_R, { y_khurda: 19, y_bubolt: 18, y_zannana: 16, y_magna: 18, y_radar: 18, y_ghummaid: 17, y_dawwama: 18, y_sifr: 17,
  q_khurda: 62, q_bubolt: 60, q_zannana: 52, q_magna: 60, q_radar: 58, q_ghummaid: 56, q_dawwama: 58, q_sifr: 60 });
for (const k in KIN) RIVAL_THEME[k] = RIVAL_THEME[k.slice(2)];
// quadcopter rotor blurs for Buzzy: hubs [x, y, r, front]
function rotors(c, hubs, t, front) {
  for (let i = 0; i < hubs.length; i++) {
    const [hx, hy, r, fr] = hubs[i]; if (fr !== front) continue;
    c.fillStyle = 'rgba(230,240,255,.32)'; c.strokeStyle = 'rgba(28,21,48,.45)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(hx, hy - 1, r, r * 0.26, 0, 0, TAU); c.fill(); c.stroke();
    const a = t * 38 + i * 1.3; c.strokeStyle = 'rgba(40,40,60,.75)'; c.lineWidth = 1.6; c.beginPath();
    for (let k = 0; k < 2; k++) { const b = a + k * Math.PI; c.moveTo(hx, hy - 1); c.lineTo(hx + Math.cos(b) * r, hy - 1 + Math.sin(b) * r * 0.26); } c.stroke();
  }
}
function ghPanel(fi, sb) {
  return bake('ghp|' + fi + '|' + sb, -11, -12, 22, 24, BAKE * sb, g => {
    g.beginPath(); g.ellipse(0, 0, 10.2, 11.7, 0, 0, TAU); g.clip();
    const o = fi / 8;
    g.fillStyle = '#7a4cc8'; g.fillRect(-12, -12, 24, 24);
    const C2 = ['#7ff7d6', '#c8ff7a', '#ff9fd8', '#9f7aff', '#5ec8ff'];
    for (let k = -9; k < 6; k++) { g.fillStyle = C2[((k % 5) + 5) % 5]; g.globalAlpha = 0.75; g.beginPath(); const x = -14 + (k + o * 5) * 6; g.moveTo(x, -13); g.lineTo(x + 6, -13); g.lineTo(x - 2, 13); g.lineTo(x - 8, 13); g.closePath(); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 0.6; g.beginPath();
    for (let y = -12; y < 13; y += 4) for (let x = -12 + ((y / 4) & 1) * 2; x < 13; x += 4) { g.moveTo(x + 1.6, y); g.arc(x, y, 1.6, 0, Math.PI); } g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-3, -6, 5, 2, -0.5, 0, TAU); g.fill();
  });
}

function rivalBody(id, ph, sb) {
  const R = RV[id], [x0, y0, w, h] = R.box;
  return bake('rv|' + id + '|' + ph + '|' + sb, x0, y0, w, h, BAKE * sb, g => { R.body(g); scuffs(g, R.spots, ph); }, RIV);
}
// a solid-colour copy of a baked entry (the red "charging" tint), cached on the entry
function tintOf(e, col) {
  e.tints = e.tints || {}; let cv = e.tints[col]; if (cv) return cv;
  cv = mk(e.c.width, e.c.height); const g = cv.getContext('2d'); g.drawImage(e.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
  e.tints[col] = cv; return cv;
}
let PUFF = null;
function puffSprite() { if (PUFF) return PUFF; PUFF = mk(48, 48); const g = PUFF.getContext('2d'), gr = g.createRadialGradient(24, 24, 2, 24, 24, 23); gr.addColorStop(0, 'rgba(120,116,138,.85)'); gr.addColorStop(0.6, 'rgba(100,96,120,.45)'); gr.addColorStop(1, 'rgba(90,86,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); return PUFF; }
// the eye: red and angry, squeezed shut when hit, X when stunned, blue and happy once fixed
function rivalEye(c, R, o, t, L) {
  const [ex, ey, er, style] = R.eye, mood = L.mood, fixed = mood === 'fixed', col = fixed ? '#5ef2ff' : '#ff3b4a', tell = L.tell;
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (mood === 'stun') {
    c.strokeStyle = '#fff3b0'; c.lineWidth = er * 0.36; const d = er * 0.55; c.beginPath(); c.moveTo(ex - d, ey - d); c.lineTo(ex + d, ey + d); c.moveTo(ex + d, ey - d); c.lineTo(ex - d, ey + d); c.stroke();
    return;
  }
  const dim = L.limp ? 1 - L.limp * 0.7 : 1;
  c.globalCompositeOperation = 'lighter'; glowAt(c, col, ex, ey, er * (2.4 + tell * 1.6), (0.45 + tell * 0.5) * dim); c.globalCompositeOperation = 'source-over';
  if (mood === 'hit') { // squeezed shut: a squashed red slit and a wince crease
    c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey + er * 0.1, er * 0.78, er * 0.22, 0, 0, TAU); c.fill();
    c.strokeStyle = '#ffd0c0'; c.lineWidth = er * 0.16; c.beginPath(); c.moveTo(ex - er * 0.55, ey + er * 0.1); c.lineTo(ex + er * 0.55, ey + er * 0.1); c.stroke();
    c.strokeStyle = 'rgba(255,90,100,.9)'; c.lineWidth = er * 0.18; c.beginPath(); c.moveTo(ex - er * 0.5, ey + er * 0.62); c.quadraticCurveTo(ex, ey + er * 0.42, ex + er * 0.5, ey + er * 0.62); c.stroke();
  } else if (style === 'ring') {
    c.globalAlpha *= dim; c.strokeStyle = col; c.lineWidth = er * 0.42; c.beginPath(); c.arc(ex, ey, er * 0.78, 0, TAU); c.stroke();
    c.fillStyle = fixed ? '#e8ffff' : '#ffd0d0'; c.beginPath(); c.arc(ex - er * 0.12, ey, er * (0.22 + tell * 0.12), 0, TAU); c.fill(); c.globalAlpha /= dim;
    if (fixed) { c.strokeStyle = col; c.lineWidth = er * 0.22; c.beginPath(); c.arc(ex, ey + er * 1.65, er * 0.55, 0.35, Math.PI - 0.35); c.stroke(); }
  } else {
    const happy = fixed && fract(t * 0.22) < 0.62, blink = !fixed && fract(t * 0.21 + ex * 0.01) > 0.97;
    if (happy) { c.strokeStyle = col; c.lineWidth = er * 0.38; c.beginPath(); c.arc(ex, ey + er * 0.25, er * 0.6, Math.PI + 0.35, TAU - 0.35); c.stroke(); }
    else if (blink || style === 'slit' && L.limp > 0.5) { c.strokeStyle = col; c.lineWidth = er * 0.3; c.beginPath(); c.moveTo(ex - er * 0.65, ey); c.lineTo(ex + er * 0.65, ey); c.stroke(); }
    else {
      const k = 0.74 + tell * 0.14, lx = -er * 0.2 + Math.sin(t * 0.7) * er * 0.08, ly = Math.cos(t * 0.5) * er * 0.06;
      c.globalAlpha *= dim; c.fillStyle = col; c.beginPath(); c.arc(ex, ey, er * k, 0, TAU); c.fill();
      c.fillStyle = fixed ? '#0b3a4a' : '#3a0610'; c.beginPath(); c.arc(ex + lx, ey + ly, er * 0.34, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(ex + lx - er * 0.32, ey + ly - er * 0.34, er * 0.17, 0, TAU); c.fill(); c.globalAlpha /= dim;
    }
  }
  // a metal brow: slanted down to the front when angry or hit, a raised arc once fixed
  if (style === 'slit') return;
  c.strokeStyle = INK; c.lineWidth = er * 0.5;
  if (fixed) { c.beginPath(); c.arc(ex, ey - er * 0.5, er * 1.05, Math.PI * 1.22, Math.PI * 1.78); c.stroke(); c.strokeStyle = '#c7cedb'; c.lineWidth = er * 0.2; c.stroke(); }
  else { const b0 = mood === 'hit' ? 0.2 : 0; c.beginPath(); c.moveTo(ex - er * 1.12, ey - er * (1.0 - b0)); c.lineTo(ex + er * 1.0, ey - er * (1.55 - b0)); c.stroke(); c.strokeStyle = '#c7cedb'; c.lineWidth = er * 0.2; c.stroke(); }
}
function rivalMouth(c, R, L, t) {
  if (!R.mouth) return; const [mx, my, mw] = R.mouth, mood = L.mood, h = mw * 0.4;
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (mood === 'fixed') { c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.arc(mx, my - h * 0.6, mw * 0.5, 0.35, Math.PI - 0.35); c.stroke(); c.strokeStyle = '#5ef2ff'; c.lineWidth = 1.2; c.stroke(); return; }
  c.fillStyle = '#16141c'; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.roundRect(mx - mw / 2, my - h / 2, mw, h, h / 2); c.fill(); c.stroke();
  c.strokeStyle = mood === 'stun' ? '#fff3b0' : '#ff8a8a'; c.lineWidth = 1; c.beginPath();
  if (mood === 'stun' || mood === 'hit') { for (let k = 0; k <= 6; k++) { const x = mx - mw / 2 + 1.5 + k * (mw - 3) / 6, y = my + Math.sin(k * 1.9 + t * 14) * h * 0.25; k ? c.lineTo(x, y) : c.moveTo(x, y); } }
  else { const n = Math.max(3, Math.round(mw / 3)); for (let k = 0; k <= n; k++) { const x = mx - mw / 2 + 1.5 + k * (mw - 3) / n, y = my + (k & 1 ? h * 0.22 : -h * 0.22); k ? c.lineTo(x, y) : c.moveTo(x, y); } }
  c.stroke();
}
// o = { t, hurt 0..1, phase 0..2, stun, tell 0..1, mood:'angry'|'hit'|'fixed', alpha, shield 0..1,
//       s (scale, default 1), thrust 0..1, limp 0..1 (the fixed cinematic), shift 0..1 (phase-change flash),
//       hatch 0..1 (Scrap King's junk hatch), spin 0..1 (Whirly's blade speed) }
const _L = { mood: 'angry', tell: 0, limp: 0, fixed: false, sb: 1 };
export function drawRival(c, id, x, y, o = {}) {
  const R = RV[id] || RV.khurda; if (!RV[id]) id = 'khurda';
  const t = o.t || 0, s = o.s || 1, ph = clamp(o.phase | 0, 0, 2), hurt = clamp(o.hurt || 0, 0, 1), tell = clamp(o.tell || 0, 0, 1), limp = clamp(o.limp || 0, 0, 1);
  const stun = o.stun > 0, mood = stun ? 'stun' : o.mood === 'fixed' || o.mood === 'hit' ? o.mood : 'angry', fixed = mood === 'fixed';
  const sb = sBucket(s);
  const L = _L; L.mood = mood; L.tell = tell; L.limp = limp; L.fixed = fixed; L.sb = sb;
  const e = rivalBody(id, ph, sb), r = RIVAL_R[id];
  // motion: idle bob, a buzzy jitter for the hornet, a wobble for the scrappy drone, a happy wiggle once fixed
  let bob = Math.sin(t * 2 + r) * 2.2, rot = 0, dx = 0;
  if (id === 'zannana' && !REDUCED) { bob += Math.sin(t * 23) * 0.8; dx = Math.sin(t * 17) * 0.6; }
  if (id === 'khurda') rot = Math.sin(t * 2.6) * 0.06;
  if (fixed) rot = Math.sin(t * 4) * 0.12;
  if (limp) { rot = rot * (1 - limp) - 0.32 * limp; bob = bob * (1 - limp) + limp * 6; }
  if (hurt > 0 && !REDUCED) { dx += Math.sin(t * 70) * hurt * 2.4; bob += Math.cos(t * 55) * hurt * 1.6; }
  if (id === 'khurda' && !fixed && !stun && !limp) { const sn = fract(t / 6.5); if (sn > 0.93) { const k = (sn - 0.93) / 0.07; dx -= Math.sin(k * Math.PI) * 5; rot -= Math.sin(k * Math.PI) * 0.12; } } // …achoo
  c.save(); c.translate(x + dx * s, y + bob * s); c.scale(s, s); if (rot) c.rotate(rot);
  if (o.alpha != null) c.globalAlpha *= clamp(o.alpha, 0, 1);
  const ga = c.globalAlpha;
  // charge glow (before a ram or a laser)
  if (tell > 0) { const p = REDUCED ? 1 : 0.8 + 0.2 * Math.sin(t * 18); c.globalCompositeOperation = 'lighter'; glowAt(c, '#ff3040', 0, 0, r * 2.3 * p, tell * 0.55); c.globalCompositeOperation = 'source-over'; }
  // thrusters (exhaust to the right)
  if (R.eng.length && limp < 0.6 && !stun) {
    c.globalCompositeOperation = 'lighter'; c.save(); c.scale(-1, 1); const th = 0.5 + 0.5 * clamp(o.thrust ?? 0.5, 0, 1.5), F = fixed ? flameSprites(COSTUME_TRAIL.link) : flameSprites(null);
    for (let i = 0; i < R.eng.length; i++) { const [ex, ey, sz] = R.eng[i]; flame(c, -ex, ey, (16 + 18 * th) * sz * 1.6, 7 * sz * 1.4, t, i + r, F); }
    c.restore(); c.globalCompositeOperation = 'source-over';
  }
  if (R.back) R.back(c, o, t, L);
  c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  if (R.front) R.front(c, o, t, L);
  rivalMouth(c, R, L, t);
  rivalEye(c, R, o, t, L);
  if (tell > 0) { c.globalAlpha = ga * tell * (REDUCED ? 0.3 : 0.24 + 0.14 * Math.sin(t * 18)); c.drawImage(tintOf(e, '#ff2a3a'), e.x0, e.y0, e.w, e.h); c.globalAlpha = ga; }
  if (hurt > 0) { c.globalAlpha = ga * hurt * 0.8; c.drawImage(whiteOf(e), e.x0, e.y0, e.w, e.h); c.globalAlpha = ga; }
  const sh = clamp(o.shift || 0, 0, 1);
  if (sh > 0) { c.globalAlpha = ga * Math.sin(sh * Math.PI) * 0.55; c.drawImage(tintOf(e, '#fff3c4'), e.x0, e.y0, e.w, e.h); c.globalAlpha = ga; drawExplosionRing(c, 0, 0, r * 1.6, sh, '#ffd27a'); }
  // battle damage that moves: sparks from phase 1, a smoke trail in phase 2 (and while hurt)
  const sp = R.spots;
  if ((ph >= 1 || hurt > 0.3) && !fixed) { const k = (t * 1.7 + r) | 0, f = fract(t * 1.7 + r); if (sr(k + r) < 0.55 && f < 0.3) { const [sx, sy] = sp[0], a = 1 - f / 0.3; c.globalCompositeOperation = 'lighter'; glowAt(c, '#ffd27a', sx, sy, 9, a); c.strokeStyle = `rgba(255,240,170,${a})`; c.lineWidth = 1.1; c.beginPath(); for (let i = 0; i < 4; i++) { const an = sr(k * 7 + i) * TAU, l = 4 + sr(k * 3 + i) * 6; c.moveTo(sx, sy); c.lineTo(sx + Math.cos(an) * l, sy + Math.sin(an) * l); } c.stroke(); c.globalCompositeOperation = 'source-over'; } }
  if ((ph >= 2 || hurt > 0.5 || (id === 'khurda' && hurt > 0)) && !fixed) { const [sx, sy] = sp[2], P = puffSprite(); for (let i = 0; i < 3; i++) { const f = fract(t * 0.9 + i / 3), rr = 4 + f * 9; c.globalAlpha = ga * (1 - f) * 0.6; c.drawImage(P, sx + f * 16 - rr, sy - f * 20 - rr, rr * 2, rr * 2); } c.globalAlpha = ga; }
  // reprogrammed: Nabeeh's cyan chip plugged in, and a twinkle now and then
  if (fixed) {
    const [sx, sy] = sp[1]; c.fillStyle = '#5ef2ff'; c.strokeStyle = INK; c.lineWidth = 1.1; c.beginPath(); c.roundRect(sx - 4, sy - 3, 8, 6, 1.6); c.fill(); c.stroke();
    c.fillStyle = '#0b3a4a'; c.fillRect(sx - 2.4, sy - 1, 4.8, 2);
    c.globalCompositeOperation = 'lighter'; glowAt(c, '#5ef2ff', sx, sy, 9, 0.5 + 0.3 * Math.sin(t * 3)); const k = fract(t * 0.45); if (k < 0.2) flareAt(c, sx + 6, sy - 7, 8, Math.sin(k / 0.2 * Math.PI)); c.globalCompositeOperation = 'source-over';
  }
  // dizzy stars while stunned
  if (stun) {
    const [ex, ey, er] = R.eye; c.fillStyle = '#ffd23f'; c.strokeStyle = INK; c.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) { const a = t * 4 + i * TAU / 3, sx = ex + Math.cos(a) * er * 2.2, sy = ey - er * 2.2 + Math.sin(a) * er * 0.6; starPath(c, sx, sy, 3.2); c.fill(); c.stroke(); }
    if (sr((t * 10) | 0) > 0.6) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(160,220,255,.9)'; c.lineWidth = 1.2; c.beginPath(); const k = (t * 10) | 0; c.moveTo(-r * 0.6, -r * 0.2); for (let i = 1; i < 5; i++) c.lineTo(-r * 0.6 + i * r * 0.3, -r * 0.2 + (sr(k + i) - 0.5) * 12); c.stroke(); c.globalCompositeOperation = 'source-over'; }
  }
  // charge glow at the muzzle
  if (tell > 0) { const [mx, my] = R.muzzle; c.globalCompositeOperation = 'lighter'; glowAt(c, '#ff4050', mx, my, 10 + tell * 18, 0.4 + tell * 0.6); glowAt(c, '#ffffff', mx, my, 3 + tell * 6, tell); c.globalCompositeOperation = 'source-over'; }
  c.restore();
  if (o.shield > 0) drawRivalShield(c, x, y + bob * s, r * s, o.shield, t);
}
// named points of a rival at scale 1, relative to its centre: { muzzle:[dx,dy], hatch:[dx,dy], eye:[dx,dy], r }
export function rivalPoints(id) { const R = RV[id] || RV.khurda; return { muzzle: R.muzzle.slice(), hatch: R.hatch.slice(), eye: R.eye.slice(0, 2), r: RIVAL_R[id] || 34 }; }
// pre-bake a rival (all three damage phases) before a duel starts
export function bakeRival(id, s = 1) { if (!RV[id]) return; for (let ph = 0; ph < 3; ph++) rivalBody(id, ph, sBucket(s)); }

// ---------- rival extras ----------
// frontal arc of hex cells (the rival faces left), radius ≈ r + 14; it cracks and loses cells as f → 0
const HEXARC = new LRU(12);
function shieldArc(R, lvl) {
  const key = (R | 0) + '|' + lvl; let e = HEXARC.get(key); if (e) return e;
  const hs = 6.4, rows = 2, span = 1.08, x0 = -R - hs * 3, y0 = -(R + hs * 3), w = R * 0.75 + hs * 3, h = (R + hs * 3) * 2, res = Math.min(BAKE, 2);
  const cv = mk(w * res, h * res), g = cv.getContext('2d'); g.scale(res, res); g.translate(-x0, -y0); g.lineJoin = 'round';
  const rnd = rng(R * 13 + lvl * 7), gone = [0, 0.08, 0.22, 0.42][lvl];
  // soft energy band
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(90,190,255,.28)'; g.lineWidth = hs * 3.2; g.beginPath(); g.arc(0, 0, R + hs * 0.7, Math.PI - span, Math.PI + span); g.stroke();
  g.strokeStyle = 'rgba(170,235,255,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R - hs * 0.9, Math.PI - span, Math.PI + span); g.stroke();
  for (let row = 0; row < rows; row++) {
    const rr = R + row * hs * 1.5, step = hs * Math.sqrt(3) / rr, n = Math.floor(span * 2 / step);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - span + (i + (row & 1 ? 0.5 : 0)) * step; if (a > Math.PI + span) continue;
      const edge = 1 - Math.abs(a - Math.PI) / span; if (rnd() < gone * (1.4 - edge)) continue;
      const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr;
      g.beginPath(); for (let k = 0; k < 6; k++) { const b = a + k * Math.PI / 3, px = cx + Math.cos(b) * hs * 0.92, py = cy + Math.sin(b) * hs * 0.92; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath();
      g.fillStyle = `rgba(110,210,255,${0.16 + edge * 0.2})`; g.fill(); g.strokeStyle = `rgba(180,240,255,${0.55 + edge * 0.4})`; g.lineWidth = 1.3; g.stroke();
      if (lvl && rnd() < lvl * 0.22) { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - hs * 0.6, cy - hs * 0.3); g.lineTo(cx, cy + hs * 0.1); g.lineTo(cx + hs * 0.2, cy - hs * 0.5); g.lineTo(cx + hs * 0.6, cy + hs * 0.4); g.stroke(); }
    }
  }
  e = { c: cv, x0, y0, w, h }; HEXARC.set(key, e); return e;
}
export function drawRivalShield(c, x, y, r, f = 1, t = 0) {
  f = clamp(f, 0, 1); if (f <= 0.005) return;
  const R = Math.round((r + 14) / 4) * 4, lvl = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3, e = shieldArc(R, lvl);
  const fl = f < 0.25 && !REDUCED ? 0.7 + 0.3 * Math.sin(t * 40) : 1;
  c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y); c.globalAlpha *= (0.55 + 0.45 * f) * fl;
  c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  // a bright sweep running along the arc
  const a0 = Math.PI + Math.sin(t * 1.6) * 0.8; c.strokeStyle = 'rgba(220,250,255,.8)'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, R + 4, a0 - 0.18, a0 + 0.18); c.stroke();
  c.restore();
}
// an orbiting junk plate (an old solar panel), radius ≈ 13
export function drawPlate(c, x, y, rot = 0, flash = 0) {
  const e = bake('plate', -16, -16, 32, 32, BAKE * 1.5, g => {
    g.strokeStyle = INK; g.lineWidth = 1.6;
    const sh = () => { g.beginPath(); g.moveTo(-12, -9); g.lineTo(7, -9); g.lineTo(12, -4); g.lineTo(12, 9); g.lineTo(-12, 9); g.closePath(); };
    sh(); g.fillStyle = '#d0a64a'; g.fill(); g.stroke();
    g.save(); sh(); g.clip(); g.fillStyle = metal(g, -10, -8, 10, 8, '#4a7fe0', '#1f3f96', '#152a6e'); g.fillRect(-10.5, -7.5, 21, 15);
    g.strokeStyle = 'rgba(160,200,255,.55)'; g.lineWidth = 0.8; g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(-10.5 + k * 5.3, -7.5); g.lineTo(-10.5 + k * 5.3, 7.5); } g.moveTo(-10.5, 0); g.lineTo(10.5, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(-10, 7.5); g.lineTo(-2, -7.5); g.lineTo(3, -7.5); g.lineTo(-5, 7.5); g.closePath(); g.fill(); g.restore();
    g.fillStyle = '#9aa3b8'; g.beginPath(); g.moveTo(7, -9); g.lineTo(12, -4); g.lineTo(6.5, -3.5); g.closePath(); g.fill(); g.lineWidth = 1.1; g.stroke();
    sh(); g.lineWidth = 1.6; g.stroke(); rivet(g, -9, -6, 1); rivet(g, -9, 6, 1); rivet(g, 9, 6, 1);
  });
  c.save(); c.translate(x, y); c.rotate(rot); c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  if (flash > 0) { c.globalAlpha *= clamp(flash, 0, 1) * 0.9; c.drawImage(whiteOf(e), e.x0, e.y0, e.w, e.h); }
  c.restore();
}
// Peekaboo's teleport tell: a dotted outline of the rival where it will appear (f: 0 → 1 as the blink nears)
function ghostOf(id, sb) {
  const key = 'ghost|' + id + '|' + sb; let g0 = RIV.get(key); if (g0) return g0;
  const e = rivalBody(id, 0, sb), W = e.c.width, H = e.c.height, d = Math.max(2, Math.round(2.2 * BAKE * sb));
  const sil = mk(W, H), sg = sil.getContext('2d'); sg.drawImage(e.c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#e9dcff'; sg.fillRect(0, 0, W, H);
  const out = mk(W, H), og = out.getContext('2d');
  for (let k = 0; k < 8; k++) { const a = k * TAU / 8; og.drawImage(sil, Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d)); }
  og.globalCompositeOperation = 'destination-out'; og.drawImage(sil, 0, 0);
  const dots = mk(W, H), dg = dots.getContext('2d'), st = Math.max(4, Math.round(3.4 * BAKE * sb)); dg.fillStyle = '#fff';
  for (let y = 0; y < H; y += st) for (let x = ((y / st) & 1) * st / 2; x < W; x += st) { dg.beginPath(); dg.arc(x, y, st * 0.42, 0, TAU); dg.fill(); }
  og.globalCompositeOperation = 'destination-in'; og.drawImage(dots, 0, 0);
  g0 = { c: out, sil, x0: e.x0, y0: e.y0, w: e.w, h: e.h }; RIV.set(key, g0); return g0;
}
export function drawBlinkGhost(c, id, x, y, f = 1, t = 0) {
  f = clamp(f, 0, 1); if (f <= 0.01 || !RV[id]) return;
  const e = ghostOf(id, 1), p = REDUCED ? 1 : 0.75 + 0.25 * Math.sin(t * 9);
  c.save(); c.translate(x, y); c.globalCompositeOperation = 'lighter';
  c.globalAlpha *= f * 0.22; c.drawImage(e.sil, e.x0, e.y0, e.w, e.h); c.globalAlpha /= 0.22;
  c.globalAlpha *= p; const k = 1 + (1 - f) * 0.25; c.drawImage(e.c, e.x0 * k, e.y0 * k, e.w * k, e.h * k); c.drawImage(e.c, e.x0 * k, e.y0 * k, e.w * k, e.h * k);
  glowAt(c, '#c9a6ff', 0, 0, 30, f * 0.35);
  c.restore();
}
// Magna's coin pulse: blue rings sweeping in toward her
let PRING = null;
function pulseRing() { if (PRING) return PRING; PRING = mk(256, 256); const g = PRING.getContext('2d'), gr = g.createRadialGradient(128, 128, 90, 128, 128, 128); gr.addColorStop(0, 'rgba(110,170,255,0)'); gr.addColorStop(0.6, 'rgba(120,180,255,.5)'); gr.addColorStop(0.82, 'rgba(200,230,255,1)'); gr.addColorStop(1, 'rgba(110,170,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return PRING; }
export function drawPulse(c, x, y, t = 0) {
  const P = pulseRing(); c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) { const ph = fract(t * 0.9 + i / 3), R = 40 + 190 * (1 - ph); c.globalAlpha = Math.sin(ph * Math.PI) * 0.6; c.drawImage(P, x - R, y - R, R * 2, R * 2); }
  c.globalAlpha = 1; glowAt(c, '#7fb4ff', x, y, 56, 0.45); c.restore();
}

// ---------- enemy weapons ----------
// hit radii (logical units) for game.js: shots pellet 6 · dart 5 · slug 9; mine 11; mini drone 10; plate 13; laser beam half-height 11
export const ENEMY_R = { orb: 9, pellet: 6, dart: 5, slug: 9, mine: 11, drone: 10, plate: 13, laser: 11 };
// v3.3 enemy fire reads at a glance: PINK means dodge it (a hot ring with a white core and a dark outline, readable on
// any background), GREY scrap means you can shoot it. Shape tells speed: round = slow, long = fast, big = heavy.
function shotSprite(kind) {
  if (kind === 'dart') return bake('es3|dart', -18, -9, 36, 18, BAKE * 1.5, g => {
    g.globalCompositeOperation = 'lighter'; const gw = g.createRadialGradient(4, 0, 0, 4, 0, 16); gw.addColorStop(0, 'rgba(255,60,140,.6)'); gw.addColorStop(1, 'rgba(255,40,120,0)');
    g.save(); g.scale(1, 0.45); g.fillStyle = gw; g.fillRect(-18, -20, 36, 40); g.restore(); g.globalCompositeOperation = 'source-over';
    const lg = g.createLinearGradient(-16, 0, 12, 0); lg.addColorStop(0, 'rgba(255,45,111,0)'); lg.addColorStop(0.55, '#ff2d6f'); lg.addColorStop(1, '#ffd6e4');
    g.fillStyle = lg; g.strokeStyle = '#3a0018'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(13, 0); g.quadraticCurveTo(9, -4.6, -1, -3.6); g.lineTo(-16, 0); g.lineTo(-1, 3.6); g.quadraticCurveTo(9, 4.6, 13, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(7, 0, 3.6, 1.5, 0, 0, TAU); g.fill();
  });
  if (kind === 'slug') return bake('es3|slug', -20, -20, 40, 40, BAKE * 1.5, g => {
    g.globalCompositeOperation = 'lighter'; g.fillStyle = rgrad(g, 0, 0, 0, 20, 'rgba(255,40,110,.55)', 'rgba(220,30,90,.22)', 'rgba(200,20,80,0)'); g.fillRect(-20, -20, 40, 40); g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgrad(g, -3, -3, 1, 10.5, '#ff7aa6', '#c4174f', '#5a0a24'); g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, 9.6, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,190,210,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 6.8, 0, TAU); g.stroke();
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.3; g.fillStyle = '#3a0618'; g.beginPath(); g.arc(Math.cos(a) * 7.6, Math.sin(a) * 7.6, 0.9, 0, TAU); g.fill(); }
    g.fillStyle = rgrad(g, 0, 0, 0, 4.4, '#ffffff', '#fff0f4', 'rgba(255,200,220,0)'); g.beginPath(); g.arc(0, 0, 4.4, 0, TAU); g.fill();
  });
  if (kind === 'orb') return bake('es3|orb', -13, -13, 26, 26, BAKE * 1.5, g => { // a grey scrap ball with glowing cracks: shoot it
    g.fillStyle = rgrad(g, -3, -3, 1, 10, '#c9cfdc', '#8d94a8', '#4a4f63'); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#ff9a3c'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-5, -4); g.lineTo(-1, -1); g.lineTo(-3, 3); g.moveTo(-1, -1); g.lineTo(4, -2); g.lineTo(6, 2); g.stroke();
    g.fillStyle = '#c7cedb'; g.beginPath(); g.arc(3, 4.5, 1.3, 0, TAU); g.arc(-5.5, 2, 1.1, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-3, -5, 2.6, 1.3, -0.5, 0, TAU); g.fill();
  });
  return bake('es3|pellet', -14, -14, 28, 28, BAKE * 1.5, g => {
    g.globalCompositeOperation = 'lighter'; g.fillStyle = rgrad(g, 0, 0, 0, 14, 'rgba(255,50,130,.65)', 'rgba(255,40,110,.25)', 'rgba(255,40,110,0)'); g.fillRect(-14, -14, 28, 28); g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgrad(g, 0, 0, 0.5, 6.6, '#ffffff', '#ff7aa6', '#ff2d6f'); g.strokeStyle = '#3a0018'; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 2.6, 0, TAU); g.fill();
  });
}
// kind: 'pellet' (red-orange ball, r 6) | 'dart' (fast yellow streak, r 5; drawn along ang) | 'slug' (heavy dark-red ball, r 9)
export function drawEnemyShot(c, kind, x, y, ang = 0, t = 0) {
  const e = shotSprite(kind);
  c.save(); c.translate(x, y);
  if (kind === 'dart') c.rotate(ang);
  else if (kind === 'slug') c.rotate(t * 5);
  else if (kind === 'orb') c.rotate(t * 3 + x * 0.02);
  else if (!REDUCED) { const k = 1 + 0.08 * Math.sin(t * 14 + x * 0.05); c.scale(k, k); }
  c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  if (kind === 'pellet' && !REDUCED) { c.rotate(t * 6); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.2; c.setLineDash([3, 4]); c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.stroke(); c.setLineDash([]); }
  c.restore();
}
let LZ = null;
function laserSprites() {
  if (LZ) return LZ;
  const prof = (col, pts) => { const cv = mk(2, 64), g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); for (const [o, a] of pts) { gr.addColorStop(0.5 - o / 2, `rgba(${col},${a})`); gr.addColorStop(0.5 + o / 2, `rgba(${col},${a})`); } g.fillStyle = gr; g.fillRect(0, 0, 2, 64); return cv; };
  LZ = { out: prof('255,40,60', [[1, 0], [0.6, 0.3], [0.25, 0.85], [0, 1]]), body: prof('255,120,70', [[1, 0], [0.7, 0.7], [0, 1]]), core: prof('255,255,245', [[1, 0], [0.6, 0.9], [0, 1]]) };
  return LZ;
}
// phase 'warn': dashed red lane + charging glow at the muzzle x0 (f: 0 → 1 over the warning);
// phase 'fire': a 22-tall beam from x0 to x = 0 with a white core (f: 0 → 1 over the beam). t is optional.
export function drawEnemyLaser(c, x0, y, f = 0, phase = 'warn', t) {
  f = clamp(f, 0, 1); if (t == null) t = f * 1.4;
  c.save(); c.globalCompositeOperation = 'lighter';
  if (phase === 'warn') {
    const fl = REDUCED ? 0.6 : 0.5 + 0.5 * Math.sin(t * (8 + f * 10) * Math.PI);
    c.globalAlpha = 0.1 + 0.18 * f + 0.08 * fl; c.drawImage(warnBand(), 0, y - 14, x0, 28); c.globalAlpha = 1;
    c.setLineDash([12, 9]); c.lineDashOffset = t * 220; c.lineCap = 'butt'; c.strokeStyle = `rgba(255,70,80,${0.45 + 0.4 * fl})`; c.lineWidth = 2 + f; c.beginPath(); c.moveTo(x0, y); c.lineTo(0, y); c.stroke(); c.setLineDash([]);
    glowAt(c, '#ff3040', x0, y, 10 + f * 22, 0.45 + 0.5 * f); glowAt(c, '#ffffff', x0, y, 3 + f * 7, 0.4 + 0.6 * f);
    for (let k = 0; k < 6; k++) { const ph = fract(t * 1.8 + k / 6), a = k * 1.05 + 0.4, d = (1 - ph) * 30; glowAt(c, '#ff8a8a', x0 + Math.cos(a) * d, y + Math.sin(a) * d, 3.2, ph * f); }
  } else {
    const env = f < 0.12 ? smooth(0, 0.12, f) : f > 0.8 ? smooth(1, 0.8, f) : 1, flick = REDUCED ? 1 : 1 + 0.07 * Math.sin(t * 50) + 0.04 * Math.sin(t * 31), h = 22 * (0.4 + 0.6 * env) * flick, Z = laserSprites();
    c.globalAlpha = env; c.drawImage(Z.out, 0, y - h * 1.1, x0, h * 2.2);
    c.drawImage(Z.body, 0, y - h * 0.5, x0, h); c.drawImage(Z.core, 0, y - h * 0.2, x0, h * 0.4);
    c.globalAlpha = 1; glowAt(c, '#ff4050', x0, y, h * 1.9, env); glowAt(c, '#ffffff', x0, y, h * 0.8, env); flareAt(c, x0, y, h * 1.1, env, t * 3);
    for (let i = 0; i < 5; i++) { const ph = fract(sr(i) + t * 1.6), px = x0 * (1 - ph); flareAt(c, px, y + (sr(i + 4) - 0.5) * h * 0.8, 4 + sr(i + 2) * 4, env * Math.sin(ph * Math.PI) * 0.8); }
  }
  c.restore();
}
// homing mine: a spiky ball with a blinking light; f = fuse 0..1 (it blinks faster and hotter as f → 1). r ≈ 11
export function drawMine(c, x, y, t = 0, f = 0) {
  const e = bake('mine', -16, -16, 32, 32, BAKE * 1.5, g => {
    g.strokeStyle = INK; g.lineWidth = 1.4; g.fillStyle = '#9aa3b8';
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8, ca = Math.cos(a), sa = Math.sin(a); g.beginPath(); g.moveTo(ca * 7 - sa * 2.4, sa * 7 + ca * 2.4); g.lineTo(ca * 13.5, sa * 13.5); g.lineTo(ca * 7 + sa * 2.4, sa * 7 - ca * 2.4); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = rgrad(g, -3, -3, 1, 10, '#8f97ad', '#4a4f63', '#23252f'); g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 8.6, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 6.2, 0.3, 1.5); g.moveTo(Math.cos(3.4) * 6.2, Math.sin(3.4) * 6.2); g.arc(0, 0, 6.2, 3.4, 4.6); g.stroke();
    g.fillStyle = '#2a0610'; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-3.6, -4.4, 2.2, 1.1, -0.7, 0, TAU); g.fill();
  });
  f = clamp(f, 0, 1); const on = blinkWave(t, 1.5 + f * 5);
  c.save(); c.translate(x, y); c.save(); c.rotate(t * 1.3); c.drawImage(e.c, e.x0, e.y0, e.w, e.h); c.restore();
  c.globalCompositeOperation = 'lighter'; glowAt(c, f > 0.75 ? '#ffb070' : '#ff3040', 0, 0, 12 + 8 * on + f * 6, 0.35 + 0.55 * on);
  c.fillStyle = `rgba(255,${(80 + 150 * f * on) | 0},${(70 + 120 * f * on) | 0},${0.5 + 0.5 * on})`; c.beginPath(); c.arc(0, 0, 2.6, 0, TAU); c.fill();
  c.restore();
}
// mini attack drone (Scrap King's): r ≈ 10, faces left, a red eye and a tiny rotor
export function drawMiniDrone(c, x, y, t = 0, flash = 0) {
  const e = bake('mdrone', -16, -16, 32, 30, BAKE * 1.5, g => {
    g.strokeStyle = INK; g.lineWidth = 1.3; g.fillStyle = '#5b6178'; g.beginPath(); g.moveTo(5, 3); g.lineTo(13, 8); g.lineTo(13, 2); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(5, -3); g.lineTo(12, -6); g.lineTo(8, -1); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -11); g.stroke();
    g.fillStyle = rgrad(g, -3, -3, 1, 10, '#e4e8f0', '#9aa3b8', '#5b6178'); g.lineWidth = 1.7; g.beginPath(); g.arc(0, 0, 8.4, 0, TAU); g.fill(); g.stroke();
    g.save(); g.beginPath(); g.arc(0, 0, 8.4, 0, TAU); g.clip(); g.fillStyle = '#e23b4a'; g.fillRect(-9, 3.4, 18, 2.6); g.restore();
    g.strokeStyle = INK; g.lineWidth = 1.7; g.beginPath(); g.arc(0, 0, 8.4, 0, TAU); g.stroke();
    g.fillStyle = '#120c1e'; g.lineWidth = 1.1; g.beginPath(); g.arc(-3.2, -1, 3.6, 0, TAU); g.fill(); g.stroke();
  });
  c.save(); c.translate(x, y + Math.sin(t * 6 + x * 0.1) * 1.2);
  c.fillStyle = 'rgba(230,240,255,.35)'; c.strokeStyle = 'rgba(28,21,48,.45)'; c.lineWidth = 0.7; c.beginPath(); c.ellipse(0, -11, 8, 1.8, 0, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(40,40,60,.75)'; c.lineWidth = 1.2; c.beginPath(); const a = t * 40; c.moveTo(-Math.cos(a) * 8, -11 - Math.sin(a) * 1.8); c.lineTo(Math.cos(a) * 8, -11 + Math.sin(a) * 1.8); c.stroke();
  c.drawImage(e.c, e.x0, e.y0, e.w, e.h);
  c.globalCompositeOperation = 'lighter'; glowAt(c, '#ff3040', -3.2, -1, 8, 0.8); c.fillStyle = '#ff6a70'; c.beginPath(); c.arc(-3.6, -1, 1.8, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
  if (flash > 0) { c.globalAlpha *= clamp(flash, 0, 1) * 0.9; c.drawImage(whiteOf(e), e.x0, e.y0, e.w, e.h); }
  c.restore();
}

// ---------- duel cards, paint cards, icons ----------
const CARD_SKY = { // fallback skies when meta's journey themes are not loaded
  mars: { sky: ['#0a0510', '#260d1c', '#4a1a1c'], nebula: ['#c2442c', '#7a2a5a', '#e0803a'] }, venus: { sky: ['#120806', '#3d1608', '#6e2d0c'], nebula: ['#ff8a2a', '#e0502a', '#ffd06a'] },
  belt: { sky: ['#070612', '#151228', '#261d3a'], nebula: ['#7a5ac8', '#3fa0a0', '#c87a4a'] }, jupiter: { sky: ['#0b0710', '#241626', '#40292a'], nebula: ['#d8955a', '#a85a3a', '#e8c89a'] },
  saturn: { sky: ['#0a0a14', '#1e1a2e', '#3a3248'], nebula: ['#e6c87a', '#9a7ac8', '#c8a06a'] }, uranus: { sky: ['#03101a', '#082e3a', '#0f4a52'], nebula: ['#3fd6c8', '#3a8ad0', '#9af0e0'] },
  neptune: { sky: ['#020418', '#061640', '#0c2a6a'], nebula: ['#2a5ae0', '#4a2ab0', '#3ac0f0'] }, moon: { sky: ['#04061a', '#0c1236', '#1a2452'], nebula: ['#3b4fb8', '#6a3fa0', '#1f7a9a'] },
};
function journeyLook(jid) {
  let th = null, planet = jid;
  try { const J = META && META.JOURNEYS && META.JOURNEYS.find(j => j && j.id === jid); if (J) { th = J.theme; planet = J.planet || jid; } } catch (_) { /* meta not ready */ }
  return { th: th || CARD_SKY[jid] || CARD_SKY.mars, planet };
}
function cardCanvas(w, h) { const R = 2, cv = mk(w * R, h * R); try { cv.style.width = w + 'px'; cv.style.height = h + 'px'; } catch (_) { /* offscreen */ } const g = cv.getContext('2d'); g.scale(R, R); g.lineJoin = 'round'; g.lineCap = 'round'; return { cv, g }; }
function cardSky(g, w, h, th, seed) {
  const S = th.sky || CARD_SKY.mars.sky, N = th.nebula || CARD_SKY.mars.nebula, r0 = rng(seed);
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, S[0]); bg.addColorStop(0.55, S[1] || S[0]); bg.addColorStop(1, S[2] || S[1] || S[0]); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { g.globalAlpha = 0.22; const s = (0.5 + r0() * 0.6) * Math.max(w, h); g.drawImage(glow(N[i % N.length]), r0() * w - s / 2, r0() * h - s / 2, s, s); }
  g.globalAlpha = 1; for (let i = 0; i < Math.round(w * h / 300); i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r0() * 0.7})`; const s = r0() < 0.15 ? 1.5 : 0.9; g.fillRect(r0() * w, r0() * h, s, s); }
  flareAt(g, w * (0.1 + r0() * 0.25), h * (0.1 + r0() * 0.25), 5, 0.8);
  g.globalCompositeOperation = 'source-over';
}
function greyOut(g, cv, w, h) {
  try { const img = g.getImageData(0, 0, cv.width, cv.height), d = img.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.5 + 8; d[i] = l; d[i + 1] = l; d[i + 2] = l * 1.12; } g.putImageData(img, 0, 0); }
  catch (_) { g.fillStyle = 'rgba(10,8,25,.6)'; g.fillRect(0, 0, w, h); }
}
// rivalCard(id, w, h, locked, mood): a 2w×2h canvas (style size w×h) for the duel ladder: the rival on its
// journey's sky with that planet behind; locked = a dark silhouette on a greyed sky. mood: 'angry' | 'fixed'
const RCARDS = new LRU(30);
export function rivalCard(id, w = 120, h = 90, locked = false, mood = 'angry') {
  if (!RV[id]) id = 'khurda';
  const key = id + '|' + w + '|' + h + '|' + (locked ? 1 : 0) + '|' + mood; let cv = RCARDS.get(key); if (cv) return cv;
  const jid = (META && META.RIVALS && (META.RIVALS.find(r => r.id === id) || {}).theme) || RIVAL_THEME[id], L = journeyLook(jid), C = cardCanvas(w, h), g = C.g; cv = C.cv;
  cardSky(g, w, h, L.th, hashStr(id));
  drawPlanet(g, L.planet, w * 0.84, h * 0.24, Math.min(w, h) * 0.2, 40);
  const aid = RV['q_' + id] ? 'q_' + id : id;   // the card shows the family's giant form
  const r = RIVAL_R[aid] * (aid !== id ? 1.25 : 1), s = Math.min(w * 0.36, h * 0.4) / r, cx = w * 0.46, cy = h * 0.54;
  if (locked) {
    greyOut(g, cv, w, h);
    const sil = cardCanvas(w, h), rim = cardCanvas(w, h); drawRival(sil.g, aid, cx, cy, { t: 0.8, s, mood, thrust: 0, limp: 0.0001 });
    try { const im = sil.g.getImageData(0, 0, sil.cv.width, sil.cv.height), d = im.data; for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 170 ? 255 : 0; sil.g.putImageData(im, 0, 0); } catch (_) { /* tainted: keep soft edges */ }
    rim.g.drawImage(sil.cv, 0, 0, w, h); rim.g.globalCompositeOperation = 'source-in'; rim.g.fillStyle = 'rgba(200,180,255,.6)'; rim.g.fillRect(0, 0, w, h);
    sil.g.globalCompositeOperation = 'source-in'; sil.g.fillStyle = '#120e26'; sil.g.fillRect(0, 0, w, h);
    for (const [dx, dy] of [[-1, -1], [1, -1], [0, -1.4]]) g.drawImage(rim.cv, dx, dy, w, h);
    g.drawImage(sil.cv, 0, 0, w, h);
  } else drawRival(g, aid, cx, cy, { t: 0.8, s, mood });
  RCARDS.set(key, cv); return cv;
}
// skinCard(id, w, h, o): a 2w×2h canvas showing the ship in that paint; o = { char, costume, tier, guns }
export function skinCard(id, w = 120, h = 72, o = {}) {
  const key = 'sk|' + id + '|' + w + '|' + h + '|' + (o.char || '') + '|' + (o.costume || '') + '|' + (o.tier ?? 2); let cv = RCARDS.get(key); if (cv) return cv;
  const C = cardCanvas(w, h), g = C.g; cv = C.cv;
  cardSky(g, w, h, { sky: ['#05041a', '#110b36', '#26124a'], nebula: [SKIN_COLORS[id] ? SKIN_COLORS[id].glow : '#5ef2ff', '#6a3cc9', '#2fa6d9'] }, hashStr('skin' + id));
  const tier = o.tier ?? 2, k = Math.min(w * 0.82 / (98 * SHIP_S[tier]), h * 0.9 / (60 * SHIP_S[tier]));
  g.save(); g.translate(w * 0.52, h * 0.52); g.scale(k, k); drawShip(g, 0, 0, { t: 0.4, tier, guns: o.guns || 3, thrust: 0.7, skin: id, char: o.char, costume: o.costume, aura: null }); g.restore();
  RCARDS.set(key, cv); return cv;
}
// booster icons (hangar Boosters tab, chips over Launch): shield super hull coins
const BOOST = { shield: ['#4aa8ff', '#1d5aa8'], super: ['#ffc83a', '#b0700a'], hull: ['#3ccf7a', '#1b7a45'], coins: ['#ffd23f', '#b07a10'] };
export const BOOSTER_IDS = Object.keys(BOOST);
function boostSprite(id) {
  const P = BOOST[id] || BOOST.shield;
  return bake('boost|' + id, -16, -16, 32, 32, BAKE * 2, g => {
    g.strokeStyle = INK; g.lineWidth = 1.8;
    g.fillStyle = rgrad(g, -4, -6, 1, 15, lighten(P[0], 0.45), P[0], P[1]); g.beginPath(); g.roundRect(-13.5, -13.5, 27, 27, 8); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-9.5, -10.5); g.lineTo(6, -10.5); g.stroke();
    g.fillStyle = '#fffaf0'; g.strokeStyle = INK; g.lineWidth = 1.4;
    if (id === 'shield') { g.beginPath(); g.moveTo(0, -9); g.lineTo(7.5, -5.6); g.quadraticCurveTo(7.5, 4.4, 0, 9.4); g.quadraticCurveTo(-7.5, 4.4, -7.5, -5.6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = P[0]; g.beginPath(); g.roundRect(-1.3, -4.4, 2.6, 8.8, 1); g.roundRect(-4.4, -1.3, 8.8, 2.6, 1); g.fill(); }
    else if (id === 'super') { g.fillStyle = '#3ff2e0'; g.beginPath(); g.arc(0, 0, 8.6, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#fffaf0'; starPath(g, 0, 0.4, 7.4, 4, 0.36, 0); g.fill(); g.lineWidth = 1; g.stroke(); g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(0, 0.4, 2, 0, TAU); g.fill(); }
    else if (id === 'hull') { g.beginPath(); g.moveTo(0, 8.6); g.bezierCurveTo(-11, 1, -7.4, -9.6, 0, -4.4); g.bezierCurveTo(7.4, -9.6, 11, 1, 0, 8.6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = P[1]; g.font = '900 8px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+1', 0, 0.6); }
    else { for (const [cx, cy] of [[-3, 3.4], [3.4, -2.4]]) { g.fillStyle = '#ffe680'; g.beginPath(); g.arc(cx, cy, 6.2, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#b07a10'; g.lineWidth = 0.9; g.beginPath(); g.arc(cx, cy, 4.3, 0, TAU); g.stroke(); g.strokeStyle = INK; g.lineWidth = 1.4; }
      g.fillStyle = '#8a5a08'; g.font = '900 6.5px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('×', 3.4, -2.1); }
  });
}
export function drawBoosterIcon(c, id, x, y, s = 1) { const e = boostSprite(id); c.drawImage(e.c, x + e.x0 * s, y + e.y0 * s, e.w * s, e.h * s); }
// boosterIcon(id, size): a 2·size px canvas (style size px)
export function boosterIcon(id, size = 40) { const C = cardCanvas(size, size); drawBoosterIcon(C.g, id, size / 2, size / 2, size / 32); return C.cv; }
// a gold star (on) or an empty slot (off), centred at (x,y), outer radius r — leg and duel stars
export function drawStarIcon(c, x, y, r = 10, on = true) {
  c.save(); c.lineJoin = 'round';
  starPath(c, x, y + r * 0.06, r, 5, 0.48); c.fillStyle = on ? '#ffd23f' : 'rgba(40,30,80,.55)'; c.fill(); c.strokeStyle = INK; c.lineWidth = Math.max(1.2, r * 0.16); c.stroke();
  if (on) { starPath(c, x - r * 0.08, y - r * 0.04, r * 0.55, 5, 0.48); c.fillStyle = '#fff3b0'; c.fill(); c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(x - r * 0.28, y - r * 0.3, r * 0.14, r * 0.08, -0.6, 0, TAU); c.fill(); }
  else { c.strokeStyle = 'rgba(190,170,255,.35)'; c.lineWidth = Math.max(0.8, r * 0.08); starPath(c, x, y + r * 0.06, r * 0.62, 5, 0.48); c.stroke(); }
  c.restore();
}
export function starIcon(on = true, size = 24) { const C = cardCanvas(size, size); drawStarIcon(C.g, size / 2, size / 2, size * 0.44, on); return C.cv; }

// ---------- planet card thumbnails ----------
const CARDS = new LRU(40);
// planetCard(id,w,h,locked): canvas of 2w×2h pixels with style size w×h px (draw it at w×h)
export function planetCard(id, w = 96, h = 96, locked = false) {
  const key = id + '|' + w + '|' + h + '|' + (locked ? 1 : 0); let cv = CARDS.get(key); if (cv) return cv;
  const R = 2; cv = mk(w * R, h * R); try { cv.style.width = w + 'px'; cv.style.height = h + 'px'; } catch (_) { /* offscreen */ }
  const g = cv.getContext('2d'); g.scale(R, R); g.lineJoin = 'round';
  const P = PL[id] || PL.moon, col = rgbOf(P.avg), r0 = rng(hashStr(id));
  const bg = g.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  bg.addColorStop(0, rgba(mixc([20, 14, 60], col, 0.35))); bg.addColorStop(0.6, '#0c0828'); bg.addColorStop(1, '#05031a');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) { g.globalAlpha = 0.18; const s = (0.4 + r0() * 0.5) * w; g.drawImage(glow(i === 1 ? '#6a3cc9' : P.avg), r0() * w - s / 2, r0() * h - s / 2, s, s); }
  g.globalAlpha = 1;
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r0() * 0.7})`; const s = r0() < 0.15 ? 1.5 : 0.9; g.fillRect(r0() * w, r0() * h, s, s); }
  flareAt(g, w * (0.15 + r0() * 0.2), h * (0.12 + r0() * 0.2), 6, 0.8);
  g.globalCompositeOperation = 'source-over';
  const pr = Math.min(w, h) * (id === 'saturn' ? 0.2 : id === 'uranus' ? 0.25 : 0.31);
  drawPlanet(g, id, w * 0.5, h * 0.5, pr, 40);
  if (locked) {
    try {
      const img = g.getImageData(0, 0, cv.width, cv.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.5 + 8; d[i] = l; d[i + 1] = l; d[i + 2] = l * 1.12; }
      g.putImageData(img, 0, 0);
    } catch (_) { g.fillStyle = 'rgba(10,8,25,.6)'; g.fillRect(0, 0, w, h); }
  }
  CARDS.set(key, cv); return cv;
}

// ---------- init: prebake everything the first frames need ----------
export async function initArt({ onProgress } = {}) {
  const steps = [];
  const prog = f => { try { onProgress && onProgress(clamp(f, 0, 1)); } catch (_) { /* ignore */ } };
  // only the menu theme and the next journey's theme are baked up front (review A1: no background loop, no DEF bake)
  let next = null, look = {};
  try {
    const M = await import('./meta.js?v=40ac71c3'); META = M;
    if (M && Array.isArray(M.JOURNEYS)) { const np = typeof M.nextPlayable === 'function' ? M.nextPlayable() : null, J = np && M.JOURNEYS.find(j => j && j.id === np.jid); next = (J || M.JOURNEYS[0] || {}).theme || null; }
    try { const S = typeof M.stats === 'function' ? M.stats() : null; if (S) look = { char: S.char, costume: S.costume && (S.costume.id || S.costume), skin: S.skin, tier: S.tier | 0 }; } catch (_) { /* old meta */ }
  } catch (_) { /* meta not ready: bake lazily */ }
  steps.push(() => { ['#ffbe64', '#ffb347', '#ff8a3d', '#ff6a2a', '#ffe6a0', '#5ef2ff', '#7fdcff', '#ffd27a', '#ffffff', '#ff3040', '#ffc83a', '#3fff7a', '#4ff7e6', '#b98cff'].forEach(glow); flareSprite(); planetShade(); rockLight(); trailSprite(); hexSprite(); beamSprites(); flameSprites(); galaxySprite(); });
  steps.push(() => starTiles());
  for (const id of PLANET_IDS) if (id !== 'belt') steps.push(() => { planetTex(id); haloSprite(id); rimSprite(id); if (PL[id].ring) ringTex(PL[id].ring); });
  steps.push(() => { for (let lv = 0; lv <= 5; lv++) boltSprite(lv); coinFace(); Object.keys(PK).forEach(pickupIcon); Object.keys(JK).forEach(junkSprite); for (let i = 0; i < 6; i++) meteorHead(i); nabShell(1); });
  steps.push(() => { const girl = look.char === 'mozah', cid = costumeId(look.costume, girl), sk = SKIN_COLORS[look.skin] ? look.skin : 'falak'; for (let tier = 0; tier < 2; tier++) shipSprite(tier, 1, cid, girl, sk); if (look.tier > 1) shipSprite(clamp(look.tier, 0, 4), 1, cid, girl, sk); stationSprite(); ringSprite(false); ringSprite(true); });
  steps.push(() => { const pal = (next && next.rock) || DEF_ROCK; for (const kind of ['rock', 'ice', 'crystal']) for (let sv = 0; sv < 4; sv++) for (const r of [12, 24, 40]) rockSprite(kind, sv, r, kind === 'ice' ? ICE_PAL : pal); });
  steps.push(() => { if (typeof innerWidth !== 'undefined') { const H = 400, W = Math.max(640, H * innerWidth / Math.max(1, innerHeight)); stationBg(W, H); earthBand(W, H); } });
  if (next) steps.push(() => themeBake(next));
  for (let i = 0; i < steps.length; i++) { try { steps[i](); } catch (e) { console.warn('art bake step failed', e); } prog((i + 1) / steps.length); await yieldNow(); }
}
