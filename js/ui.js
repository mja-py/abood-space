// Abood to the Moon · عبود إلى القمر — all DOM: loader, rotate overlay, language picker, station menu, sheets
// (hangar / suits / missions / badges / help), HUD, pause card, results card, toasts. The main canvas belongs to game.js.
//
// ---- exports (see docs/SPEC.md "js/ui.js exports") ----
//   initUI(h)        h = { onLaunch(jid, li), onPause(), onResume(), onQuit(), onRetry(), onNext(), onSuper(), onMute(), isMuted(), onFps() → 30|60, getFps(),
//                          optional: onSelect(jid, li) (menu selection changed), sfx(name) ('tick' | 'chime' while coins count) }
//   showMenu(), hideMenus()
//   showHud(on, jid?, li?)   jid/li optional: ui.js already knows the leg from launch/retry/next
//   hud(s)           s = { hp, maxHp, score, coins, prog 0..1, superF 0..1, shield 0..1 (1 = up), combo, rapid 0..1, jid?, li? }
//                    writes the DOM only when a value changes
//   showPause(on), showResult(r) (r = finishLeg/failLeg result + { win, jid, li, run }), note(text, ms?),
//   loader(f, msgKeyOrText), hideLoader(), isBlocking() (portrait overlay up)
//   extras: renderMenu(), openSheet(kind), closeSheet(), syncCoins()
import * as M from './meta.js';
import { T, TL, nf, lang, setLang, applyI18n } from './i18n.js';
import * as I from './i18n.js';
import * as A from './art.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const INK = '#1c1530', FONT = '"Baloo Bhaijaan 2", "Trebuchet MS", Tahoma, system-ui, sans-serif';
const mq = q => { try { return matchMedia(q); } catch (e) { return { matches: false, addEventListener() {} }; } };
const REDUCED = mq('(prefers-reduced-motion: reduce)').matches;
const COARSE = mq('(pointer: coarse)').matches;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = mq('(display-mode: standalone)').matches || mq('(display-mode: fullscreen)').matches || navigator.standalone === true;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sr = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const coinIc = () => el('i', 'coin');
const safeCall = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { console.error(e); } };

// art.js may still be loading its sprites (or be missing a function): never let a drawing break the UI
const artErr = new Set();
function art(fn, ...args) {
  if (typeof A[fn] !== 'function') return false;
  try { A[fn](...args); return true; } catch (e) { if (!artErr.has(fn)) { artErr.add(fn); console.warn('art.' + fn, e); } return false; }
}
// a key that i18n.js may not have yet: fall back to built-in text
function TT(key, ar, en, ...args) { const v = T(key, ...args); return v === key || v == null ? (lang() === 'ar' ? ar : en) : v; }
const upText = (id, lv) => typeof I.upText === 'function' ? I.upText(id, lv) : T('up_' + id + '_v', M.upValue(id, lv));
const FLAG = I.FLAG || {
  en: '<svg viewBox="0 0 60 30" aria-hidden="true"><path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>',
  ar: '<svg viewBox="0 0 12 6" aria-hidden="true"><rect width="12" height="2" fill="#00732f"/><rect y="2" width="12" height="2" fill="#fff"/><rect y="4" width="12" height="2" fill="#000"/><rect width="3" height="6" fill="#ff0000"/></svg>',
};
const pickedLang = () => {
  try { if (typeof I.hasPickedLang === 'function') return I.hasPickedLang(); } catch (e) {}
  try { const v = localStorage.getItem('abood-lang'); return v === 'ar' || v === 'en'; } catch (e) { return false; }
};
const jName = id => T('j_' + id);
const pName = id => T('p_' + id);
const legName = (jid, li) => T('leg_' + jid + '_' + li);

let H = {};
const hook = (name, ...a) => { try { return typeof H[name] === 'function' ? H[name](...a) : undefined; } catch (e) { console.error('hook ' + name, e); } };
let inited = false;

// =============================================================================================
// small animation scheduler for UI canvases (menu avatar, hangar, loader) — 30 fps, only while visible
const anims = new Set();
let animRaf = 0, animLast = 0;
function addAnim(cnv, draw, group) {
  const a = { cnv, draw, group, drawn: false }; anims.add(a);
  try { draw(performance.now() / 1000); a.drawn = true; } catch (e) { console.warn(e); }
  if (!animRaf && !REDUCED) animRaf = requestAnimationFrame(animTick);
  return a;
}
function dropAnims(group) { for (const a of anims) if (a.group === group) anims.delete(a); }
function animTick(now) {
  animRaf = 0; if (!anims.size) return;
  if (now - animLast >= 1000 / 30 - 3) {
    animLast = now; const t = now / 1000;
    for (const a of anims) {
      if (!a.cnv.isConnected) { anims.delete(a); continue; }
      if (a.cnv.offsetParent === null && a.group !== 'loader') continue; // hidden
      try { a.draw(t); } catch (e) { anims.delete(a); console.warn(e); }
    }
  }
  animRaf = requestAnimationFrame(animTick);
}

// =============================================================================================
// drawing helpers (UI-only canvases)
const STARS = Array.from({ length: 60 }, (_, i) => ({ x: sr(i), y: sr(i + 99), r: 0.5 + sr(i + 7) * 1.3, p: sr(i + 3) * TAU }));
function stars(c, w, h, t, n = 40, a = 0.9) {
  for (let i = 0; i < n; i++) {
    const s = STARS[i % STARS.length], tw = 0.55 + 0.45 * Math.sin(t * 1.6 + s.p);
    c.globalAlpha = a * tw; c.fillStyle = i % 7 === 0 ? '#bff3fa' : '#fff';
    c.beginPath(); c.arc(s.x * w, s.y * h, s.r * (w / 300), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}
function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
// fallback planet (until art.js is there)
const PCOL = { earth: ['#4aa8ff', '#1d4f9a'], moon: ['#d8d4cc', '#8a857c'], mars: ['#e0754a', '#8a3320'], venus: ['#f2c36a', '#b0702a'], belt: ['#a8998a', '#5a5048'],
  jupiter: ['#e8c49a', '#9a6a44'], saturn: ['#f2dc9a', '#b09048'], uranus: ['#9ff0ea', '#3a9a98'], neptune: ['#5a8aff', '#1f3a9a'] };
function planet(c, id, x, y, r, t) {
  if (art('drawPlanet', c, id, x, y, r, t)) return;
  const col = PCOL[id] || PCOL.moon, g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  if (id === 'saturn') { c.strokeStyle = '#f6e6b8'; c.lineWidth = r * 0.12; c.beginPath(); c.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, TAU); c.stroke(); }
}
// Abood + Nabeeh, scaled to fit a box (k = canvas px per logical unit). drawAbood's (x, y) is his feet.
function duo(c, w, h, t, o = {}) {
  const k = h / 300;
  c.save(); c.scale(k, k);
  const W = w / k, bob = REDUCED ? 0 : Math.sin(t * 1.3) * 4;
  // soft floor glow (station deck)
  const g = c.createRadialGradient(W * 0.42, 268, 4, W * 0.42, 268, 120); g.addColorStop(0, 'rgba(120,220,255,.28)'); g.addColorStop(1, 'rgba(120,220,255,0)');
  c.fillStyle = g; c.fillRect(0, 200, W, 100);
  const ab = o.abood || {};
  if (!art('drawAbood', c, W * 0.4, 276 + (ab.pose === 'float' ? bob - 10 : 0), ab.s || 2.75, Object.assign({ t, suit: M.suit().id, pose: 'wave' }, ab))) {
    c.fillStyle = '#f4f6fb'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, W * 0.4 - 34, 120, 68, 150, 30); c.fill(); c.stroke();
    c.fillStyle = '#bfeaff'; c.beginPath(); c.arc(W * 0.4, 120, 42, 0, TAU); c.fill(); c.stroke();
  }
  const nb = o.nabeeh || {};
  if (!art('drawNabeeh', c, W * 0.8, 112 + bob, nb.s || 1.9, Object.assign({ t, mood: 'happy', talk: false }, nb))) {
    c.fillStyle = '#e9eef6'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(W * 0.8, 120 + bob, 34, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#211a48'; rr(c, W * 0.8 - 22, 106 + bob, 44, 24, 10); c.fill(); c.fillStyle = '#2fd4e6'; c.fillRect(W * 0.8 - 12, 112 + bob, 6, 10); c.fillRect(W * 0.8 + 6, 112 + bob, 6, 10);
  }
  c.restore();
}
function drawDuoCanvas(cnv, t, o) {
  const c = cnv.getContext('2d'), w = cnv.width, h = cnv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  stars(c, w, h * 0.75, t, 34, 0.8);
  if (o && o.planet) planet(c, o.planet, w * 0.12, h * 0.16, h * 0.07, t);
  duo(c, w, h, t, o);
}

// hangar upgrade glyphs (small, drawn here: the art module has no upgrade icons)
function upIcon(c, id, s, t) {
  c.setTransform(s / 44, 0, 0, s / 44, 0, 0); c.clearRect(0, 0, 44, 44); c.lineJoin = 'round'; c.lineCap = 'round';
  const bolt = (x, y, a, col = '#ffc53d') => { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 1.6; rr(c, -9, -3, 18, 6, 3); c.fill(); c.stroke(); c.fillStyle = '#fff6c8'; rr(c, -1, -1.5, 8, 3, 1.5); c.fill(); c.restore(); };
  stars(c, 44, 44, t, 8, 0.5);
  if (id === 'blaster') { bolt(16, 16, 0); bolt(26, 28, 0); }
  else if (id === 'spread') { bolt(24, 12, -0.45); bolt(26, 22, 0); bolt(24, 32, 0.45); }
  else if (id === 'hull') {
    c.fillStyle = '#c9d2e0'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(22, 6); c.lineTo(35, 11); c.lineTo(34, 24); c.quadraticCurveTo(31, 34, 22, 38); c.quadraticCurveTo(13, 34, 10, 24); c.lineTo(9, 11); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#d7262f'; c.fillRect(19, 13, 6, 18); c.fillRect(13, 19, 18, 6);
  } else if (id === 'shield') {
    c.strokeStyle = '#2fd4e6'; c.lineWidth = 2.4; c.fillStyle = 'rgba(47,212,230,.25)'; c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + TAU / 12; c.lineTo(22 + Math.cos(a) * 15, 22 + Math.sin(a) * 15); } c.closePath(); c.fill(); c.stroke();
    c.lineWidth = 1.2; c.globalAlpha = 0.6; c.beginPath(); c.arc(22, 22, 8, 0, TAU); c.stroke(); c.globalAlpha = 1;
  } else if (id === 'super') {
    const g = c.createRadialGradient(22, 22, 1, 22, 22, 18); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffd45a'); g.addColorStop(1, 'rgba(255,180,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, 44, 44); c.fillStyle = '#fff4c4'; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 6 : 14; c.lineTo(22 + Math.cos(a) * r, 22 + Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
  } else if (id === 'engine') {
    const f = 1 + 0.12 * Math.sin(t * 12);
    c.fillStyle = '#ff7a2a'; c.beginPath(); c.moveTo(24, 13); c.quadraticCurveTo(24 - 20 * f, 22, 24, 31); c.closePath(); c.fill();
    c.fillStyle = '#ffd45a'; c.beginPath(); c.moveTo(24, 16); c.quadraticCurveTo(24 - 12 * f, 22, 24, 28); c.closePath(); c.fill();
    c.fillStyle = '#9aa6bb'; c.strokeStyle = INK; c.lineWidth = 2; rr(c, 24, 12, 12, 20, 4); c.fill(); c.stroke();
  } else if (id === 'magnet') {
    c.lineWidth = 7; c.strokeStyle = INK; c.beginPath(); c.arc(18, 22, 10, Math.PI / 2, Math.PI * 1.5); c.stroke();
    c.lineWidth = 4.5; c.strokeStyle = '#d7262f'; c.stroke();
    c.fillStyle = '#e9eef6'; c.strokeStyle = INK; c.lineWidth = 1.5; c.fillRect(17, 9, 7, 6); c.strokeRect(17, 9, 7, 6); c.fillRect(17, 29, 7, 6); c.strokeRect(17, 29, 7, 6);
    c.fillStyle = '#e9b330'; c.beginPath(); c.arc(34, 22, 6, 0, TAU); c.fill(); c.stroke();
  } else if (id === 'nabeeh') {
    if (!art('drawNabeeh', c, 22, 20, 0.95, { t, mood: 'happy' })) { c.fillStyle = '#e9eef6'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(22, 22, 13, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#211a48'; rr(c, 13, 17, 18, 9, 4); c.fill(); c.fillStyle = '#2fd4e6'; c.fillRect(17, 19, 3, 5); c.fillRect(24, 19, 3, 5); }
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}
// medals (badges): ribbon + disc + glyph; tier -1 = locked, 0 bronze, 1 silver, 2 gold, 3 = special (one-off earned)
const TIER_COL = ['#c8823f', '#c3c8d1', '#f2c230', '#2fd4e6'], TIER_RIB = ['#8a4b25', '#6b7280', '#d7262f', '#0d7f91'];
function medal(c, id, tier, size) {
  c.setTransform(size / 40, 0, 0, size / 40, 0, 0); c.clearRect(0, 0, 40, 40); c.lineJoin = 'round'; c.lineCap = 'round';
  const on = tier >= 0, base = on ? TIER_COL[tier] : '#cfc9ba';
  c.fillStyle = on ? TIER_RIB[tier] : '#b9b3a5'; c.beginPath(); c.moveTo(10, 1); c.lineTo(18, 1); c.lineTo(22, 14); c.lineTo(15, 14); c.closePath(); c.fill();
  c.fillStyle = on ? '#1c1530' : '#a9a397'; c.beginPath(); c.moveTo(22, 1); c.lineTo(30, 1); c.lineTo(25, 14); c.lineTo(18, 14); c.closePath(); c.fill();
  c.fillStyle = base; c.strokeStyle = INK; c.lineWidth = 1.8; c.beginPath(); c.arc(20, 25, 13, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2; c.beginPath(); c.arc(20, 25, 10, 0, TAU); c.stroke();
  c.save(); c.translate(20, 25); c.fillStyle = on ? '#fffbf2' : '#efeae0'; c.strokeStyle = INK; c.lineWidth = 1.1;
  const star = (r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, q = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); c.stroke(); };
  if (id === 'rocks') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, q = 6 + (i % 3) * 1.2; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'meteors') { c.beginPath(); c.moveTo(-7, 6); c.lineTo(3, -4); c.lineTo(1, 1); c.lineTo(7, -6); c.lineTo(-3, 6); c.lineTo(-1, 1); c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'coins') { c.font = '800 9px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lang() === 'ar' ? 'د.إ' : 'AED', 0, 0.5); }
  else if (id === 'supers' || id === 'tour') star(7.5);
  else if (id === 'legs' || id === 'first') { c.fillRect(-5, -7, 2, 14); c.beginPath(); c.moveTo(-3, -7); c.lineTo(7, -4); c.lineTo(-3, -1); c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'planets' || id === 'saturn') { c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(0, 0, 9, 3, -0.4, 0, TAU); c.stroke(); }
  else if (id === 'nohit') { c.beginPath(); c.moveTo(0, -7); c.lineTo(6, -4); c.quadraticCurveTo(6, 4, 0, 8); c.quadraticCurveTo(-6, 4, -6, -4); c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'hangar') { c.lineWidth = 3; c.strokeStyle = on ? '#fffbf2' : '#efeae0'; c.beginPath(); c.moveTo(-5, 5); c.lineTo(3, -3); c.stroke(); c.beginPath(); c.arc(4, -4, 3.5, 0, TAU); c.stroke(); }
  else if (id === 'moon') { c.beginPath(); c.arc(0, 0, 7, 0.6, TAU - 0.6); c.quadraticCurveTo(-1, 0, Math.cos(0.6) * 7, Math.sin(0.6) * 7); c.fill(); c.stroke(); }
  else if (id === 'mars') { c.fillStyle = on ? '#e0754a' : '#ddd'; c.beginPath(); c.arc(0, 0, 6.5, 0, TAU); c.fill(); c.stroke(); }
  else star(6.5);
  c.restore(); c.setTransform(1, 0, 0, 1, 0, 0);
}

// =============================================================================================
// state
let selJ = null, selL = 0;
let cur = { jid: null, li: 0 }, lastRes = null;
let sheetKind = null, ustaLine = '';
let blocking = false, hudOn = false, updateReady = false, loginShown = false;
let tipTimer = 0;
let kbd = false; // last input was a key: move focus into new cards (no focus rings for touch / mouse players)

function syncCoins(v) {
  const s = T('coins', v == null ? M.coins() : v);
  document.querySelectorAll('.coinVal').forEach(e => { e.textContent = s; });
}
let noteT = 0;
export function note(text, ms = 1800) {
  const n = $('note'); if (!n || !text) return;
  n.textContent = text; n.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => { n.hidden = true; }, ms);
}
function hideNote() { clearTimeout(noteT); const n = $('note'); if (n) n.hidden = true; }
function bump(e) { if (!e || REDUCED) return; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
function maybeToast() { const t = $('toast'); if (t && updateReady && !hudOn) t.hidden = false; }
function syncMute() {
  const m = !!hook('isMuted');
  for (const id of ['muteBtn', 'menuMute']) { const b = $(id); if (b) { b.textContent = m ? '✕' : '♪'; b.setAttribute('aria-pressed', m ? 'true' : 'false'); } }
  const pm = $('pauseMute'); if (pm) { pm.textContent = (m ? '✕ ' : '♪ ') + T('sound'); pm.setAttribute('aria-pressed', m ? 'true' : 'false'); }
}
function syncFps() {
  const f = hook('getFps') === 30 ? 30 : 60;
  const b = $('fpsBtn'); if (b) { b.textContent = String(f); b.title = T('fps_l', f); }
  const p = $('pauseFps'); if (p) p.textContent = T('fps_l', f);
}
function doFps(e) { const f = hook('onFps'); syncFps(); note(T('fps_note', f === 30 ? 30 : 60)); if (e && e.currentTarget) e.currentTarget.blur(); }
function doMute(e) { hook('onMute'); syncMute(); if (e && e.currentTarget) e.currentTarget.blur(); }

// =============================================================================================
// loader
let ldTarget = 0, ldShown = 0, ldRaf = 0, ldTipT = 0, ldDone = false, ldAnim = null;
function ldTip() { const tp = $('ldTip'); if (tp) { const v = TL('tips'); tp.textContent = v && v !== 'tips' ? v : ''; } }
function ldFrame() {
  ldRaf = 0; if (ldDone) return;
  ldShown += (ldTarget - ldShown) * 0.2; if (Math.abs(ldTarget - ldShown) < 0.002) ldShown = ldTarget;
  const f = $('ldFill'), p = $('ldPct');
  if (f) f.style.transform = 'scaleX(' + ldShown.toFixed(3) + ')';
  if (p) p.textContent = Math.round(ldShown * 100) + '%';
  ldRaf = requestAnimationFrame(ldFrame);
}
function ldScene(t) {
  const cnv = $('ldCv'); if (!cnv) return; const c = cnv.getContext('2d'), w = cnv.width, h = cnv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  stars(c, w, h, t, 50, 0.9);
  planet(c, 'moon', w * 0.9, h * 0.17, h * 0.1, t);
  const bob = REDUCED ? 0 : Math.sin(t * 1.4) * 6;
  c.save(); c.translate(0, bob);
  const k = h / 300; c.save(); c.scale(k, k);
  if (!art('drawAbood', c, 200, 262, 2.3, { t, suit: safeCall(M.suit)?.id || 'white', pose: 'float' })) { c.fillStyle = '#f4f6fb'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, 170, 130, 60, 120, 26); c.fill(); c.stroke(); c.fillStyle = '#bfeaff'; c.beginPath(); c.arc(200, 128, 36, 0, TAU); c.fill(); c.stroke(); }
  c.restore(); c.restore();
  const b2 = REDUCED ? 0 : Math.sin(t * 1.9 + 1) * 7;
  c.save(); c.scale(k, k);
  if (!art('drawNabeeh', c, 340, 110 + b2, 1.7, { t, mood: 'happy', talk: Math.sin(t * 3) > 0.3 })) { c.fillStyle = '#e9eef6'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(330, 120 + b2, 28, 0, TAU); c.fill(); c.stroke(); }
  c.restore();
}
export function loader(f, msg) {
  const L = $('loader'); if (!L) return;
  if (ldDone) return;
  ldTarget = clamp(+f || 0, ldTarget, 1);
  if (msg) { const m = $('ldMsg'); if (m) m.textContent = T(msg); }
  if (!ldRaf) ldRaf = requestAnimationFrame(ldFrame);
  if (!ldTipT) { ldTip(); ldTipT = setInterval(ldTip, 2600); }
  if (!ldAnim) ldAnim = addAnim($('ldCv'), ldScene, 'loader');
}
export function hideLoader() {
  const L = $('loader'); if (!L) return;
  ldTarget = 1; ldShown = 1; const f = $('ldFill'); if (f) f.style.transform = 'scaleX(1)';
  ldDone = true; clearInterval(ldTipT); ldTipT = 0; dropAnims('loader');
  L.classList.add('done'); setTimeout(() => { L.hidden = true; }, 500);
}

// =============================================================================================
// rotate overlay (coarse pointer + portrait)
const portraitMQ = mq('(orientation: portrait)');
function syncRotate() {
  const on = COARSE && portraitMQ.matches;
  const r = $('rotate'); if (r) r.hidden = !on;
  if (on && !blocking && hudOn && $('pause').hidden) hook('onPause');
  blocking = on;
}
export const isBlocking = () => blocking;

// =============================================================================================
// menu
function defaultLeg(jid) { return clamp(M.legsDone(jid), 0, 2); }
function ensureSel() {
  if (!selJ || !M.isUnlocked(selJ)) { const n = M.nextPlayable(); selJ = n.jid; selL = n.li; }
  if (!M.canPlay(selJ, selL)) selL = defaultLeg(selJ);
}
const THUMBS = new Map();
function thumb(id, locked) {
  const key = id + (locked ? ':l' : ':o'); if (THUMBS.has(key)) return THUMBS.get(key);
  let cnv = null;
  if (typeof A.planetCard === 'function') { try { cnv = A.planetCard(id, 112, 70, locked); /* a 2x canvas: 224 x 140 px */ } catch (e) { cnv = null; console.warn('planetCard', e); } }
  if (!cnv) { // fallback until art.js is there (not cached, so the real one replaces it)
    const f = mk(224, 140), c = f.getContext('2d'); c.fillStyle = '#120d2a'; c.fillRect(0, 0, 224, 140); stars(c, 224, 140, 0, 30, 0.7); planet(c, id, 140, 76, 44, 0);
    if (locked) { c.fillStyle = 'rgba(30,26,40,.55)'; c.fillRect(0, 0, 224, 140); }
    return f;
  }
  THUMBS.set(key, cnv); return cnv;
}
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
function dragScroll(row) {
  if (row.dataset.drag) return; row.dataset.drag = 1; let x0 = 0, s0 = 0, down = false;
  row.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; down = true; row.moved = false; x0 = e.clientX; s0 = row.scrollLeft; });
  addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - x0; if (Math.abs(dx) > 5) row.moved = true; if (row.moved) row.scrollLeft = s0 - dx; });
  addEventListener('pointerup', () => { down = false; setTimeout(() => { row.moved = false; }, 0); });
  row.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += lang() === 'ar' ? -e.deltaY : e.deltaY; e.preventDefault(); } }, { passive: false });
}
export function renderMenu() {
  ensureSel(); syncCoins(); syncMute();
  const strip = $('jStrip'); if (!strip) return;
  const keepX = strip.scrollLeft, first = !strip.childElementCount; strip.innerHTML = ''; dragScroll(strip);
  M.JOURNEYS.forEach((j, i) => {
    const open = M.isUnlocked(j.id), done = M.legsDone(j.id), on = j.id === selJ;
    const b = el('button', 'jcard' + (open ? '' : ' shut') + (on ? ' on' : '') + (done >= 3 ? ' done' : '')); b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const prev = i > 0 ? M.JOURNEYS[i - 1] : null;
    b.setAttribute('aria-label', jName(j.id) + ' · ' + (open ? T('m_legsDone', done, 3) : T('m_lockedHint', pName(prev ? prev.planet : 'moon'))));
    const pic = mk(224, 140); pic.setAttribute('aria-hidden', 'true'); b.appendChild(pic);
    const fill = () => { try { pic.getContext('2d').drawImage(thumb(j.planet || j.id, !open), 0, 0, 224, 140); } catch (e) {} };
    if (THUMBS.has((j.planet || j.id) + (open ? ':o' : ':l'))) fill(); else setTimeout(fill, 30 + i * 40);
    if (!open) { const lk = el('span', 'lock'); lk.innerHTML = LOCK_SVG; b.appendChild(lk); }
    if (done >= 3) b.appendChild(el('span', 'ok', '✓'));
    b.appendChild(el('b', null, jName(j.id)));
    const lp = el('small', 'lp'); lp.setAttribute('aria-hidden', 'true'); for (let k = 0; k < 3; k++) lp.appendChild(el('i', k < done ? 'on' : '')); b.appendChild(lp);
    b.onclick = () => {
      if (strip.moved) return;
      if (!open) { note(T('m_lockedHint', pName(prev ? prev.planet : 'moon'))); return; }
      if (selJ !== j.id) { selJ = j.id; selL = defaultLeg(j.id); hook('onSelect', selJ, selL); }
      renderMenu();
    };
    strip.appendChild(b);
  });
  if (first) requestAnimationFrame(() => {
    const c2 = strip.children[Math.max(0, M.journeyIndex(selJ))]; if (!c2) return;
    const sr2 = strip.getBoundingClientRect(), cr = c2.getBoundingClientRect();
    if (cr.left < sr2.left + 8 || cr.right > sr2.right - 8) strip.scrollLeft += lang() === 'ar' ? cr.right - sr2.right + 8 : cr.left - sr2.left - 8;
  });
  else strip.scrollLeft = keepX;
  // legs of the selected journey
  const row = $('legRow'); row.innerHTML = '';
  const done = M.legsDone(selJ);
  for (let li = 0; li < 3; li++) {
    const ok = M.canPlay(selJ, li), d = li < done, on = li === selL;
    const b = el('button', 'leg' + (d ? ' done' : '') + (on ? ' on' : '')); b.type = 'button'; b.disabled = !ok;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const nm = legName(selJ, li), rw = M.legReward(selJ, li);
    b.title = T('m_legOf', li, 3) + ' · ' + nm + (ok ? ' · ' + (d ? T('m_replay') : T('m_reward', rw)) : ' · ' + T('m_locked'));
    b.setAttribute('aria-label', b.title);
    const num = el('i', null, d ? '✓' : nf(li + 1)); b.appendChild(num); b.appendChild(el('span', null, nm));
    b.onclick = () => { if (!ok) return; selL = li; hook('onSelect', selJ, selL); renderMenu(); };
    row.appendChild(b);
  }
  $('launchBtn').setAttribute('aria-label', T('b_launch') + ' · ' + jName(selJ) + ' · ' + T('m_legOf', selL, 3));
  $('dotMissions').hidden = !(M.missionsReady() > 0 || M.loginReady());
}
function startTips() {
  stopTips();
  const tx = $('botTipTxt'); if (!tx) return;
  tx.textContent = TL('bot_menu');
  tipTimer = setInterval(() => {
    if (REDUCED) { tx.textContent = TL('bot_menu'); return; }
    tx.classList.add('fade'); setTimeout(() => { tx.textContent = TL('bot_menu'); tx.classList.remove('fade'); }, 260);
  }, 6000);
}
function stopTips() { clearInterval(tipTimer); tipTimer = 0; }
let avMenuAnim = null;
export function showMenu() {
  hudShow(false); $('pause').hidden = true; $('over').hidden = true; stopCount(); dropAnims('over');
  if (!pickedLang()) { $('langPick').hidden = false; $('menu').hidden = true; return; }
  $('langPick').hidden = true;
  $('menu').hidden = false;
  renderMenu(); startTips();
  if (!avMenuAnim || !anims.has(avMenuAnim)) avMenuAnim = addAnim($('avMenu'), t => drawDuoCanvas($('avMenu'), t, { planet: null, abood: { pose: 'wave' }, nabeeh: { mood: 'happy', talk: Math.sin(t * 2.2) > 0.4 } }), 'menu');
  maybeToast(); maybeLogin();
}
export function hideMenus() {
  for (const id of ['menu', 'sheet', 'langPick', 'loginPop', 'over', 'pause']) { const e = $(id); if (e) e.hidden = true; }
  sheetKind = null; stopTips(); stopCount(); dropAnims('menu'); dropAnims('sheet'); dropAnims('over'); avMenuAnim = null;
  const t = $('toast'); if (t) t.hidden = true;
}

// =============================================================================================
// login popup (once per session) + sheets
function loginDays(box) {
  const L = M.login(), gifts = M.LOGIN || [], n = gifts.length || 7; box.innerHTML = '';
  for (let k = 1; k <= n; k++) {
    const d = el('div', (k < L.day || (k === L.day && !L.claimable)) ? 'done' : k === L.day ? 'today' : '');
    d.appendChild(el('span', null, T('lg_day', k)));
    const b = el('b'); b.appendChild(coinIc()); b.append(nf(gifts[k - 1] || 0)); b.querySelector('.coin').style.cssText = 'width:13px;height:13px;border-width:1.5px'; d.appendChild(b);
    box.appendChild(d);
  }
  return L;
}
function maybeLogin() {
  if (loginShown || !M.loginReady()) return;
  loginShown = true;
  const L = loginDays($('loginDays'));
  const btn = $('loginClaim'); btn.textContent = T('lg_claim', L.gift);
  btn.onclick = () => { const got = M.claimLogin(); $('loginPop').hidden = true; if (got) { note(T('f_coins', '+' + got)); hook('sfx', 'chime'); } renderMenu(); };
  $('loginPop').hidden = false;
}
const SHEETS = {
  hangar: ['hg_title', sheetHangar], suits: ['st_title', sheetSuits], missions: ['ms_title', sheetMissions], badges: ['bg_title', sheetBadges], help: ['help_title', sheetHelp],
};
export function openSheet(kind) {
  const S2 = SHEETS[kind]; if (!S2) return;
  const body = $('sheetBody'), keep = kind === sheetKind ? body.scrollTop : 0;
  dropAnims('sheet'); sheetKind = kind; body.innerHTML = ''; $('sheet').hidden = false; syncCoins();
  $('sheetTitle').textContent = T(S2[0]);
  S2[1](body);
  body.scrollTop = keep;
}
export function closeSheet() { $('sheet').hidden = true; sheetKind = null; dropAnims('sheet'); if (!$('menu').hidden) renderMenu(); const b = document.querySelector('[data-sheet]:focus'); if (b) b.blur(); }
function card(draw, name, sub, btn, cls) {
  const c = el('div', 'card' + (cls ? ' ' + cls : '')); const cnv = mk(192, 192); cnv.setAttribute('aria-hidden', 'true'); c.appendChild(cnv);
  if (draw) draw(cnv);
  c.appendChild(el('b', null, name)); if (sub) c.appendChild(el('small', null, sub));
  if (btn) {
    const b = el('button', btn.cls || ''); b.type = 'button'; b.disabled = !!btn.disabled;
    if (btn.price != null) { b.appendChild(coinIc()); b.append(nf(btn.price)); b.setAttribute('aria-label', btn.text); } else b.textContent = btn.text;
    if (btn.onClick) b.onclick = btn.onClick; c.appendChild(b);
  }
  return c;
}
// ---- hangar (Usta) ----
function sheetHangar(body) {
  const head = el('div', 'hangar-head');
  const ub = el('div', 'usta-box'), uc = mk(184, 184); uc.setAttribute('aria-hidden', 'true'); ub.appendChild(uc); head.appendChild(ub);
  addAnim(uc, t => {
    const c = uc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 184, 184); stars(c, 184, 120, t, 14, 0.6);
    c.save(); c.scale(184 / 100, 184 / 100);
    if (!art('drawUsta', c, 50, 97, 0.9, t)) { c.fillStyle = '#e9b330'; c.strokeStyle = INK; c.lineWidth = 3; rr(c, 28, 24, 44, 66, 8); c.fill(); c.stroke(); c.fillStyle = '#2fd4e6'; c.beginPath(); c.arc(50, 44, 10, 0, TAU); c.fill(); c.stroke(); }
    c.restore();
  }, 'sheet');
  if (!ustaLine) ustaLine = TL('usta_lines');
  const say = el('p', 'say'); say.appendChild(el('b', null, T('n_usta') + ': ')); say.append(ustaLine); head.appendChild(say);
  const sv = el('div', 'ship-view'), sc = mk(352, 192); sc.setAttribute('aria-hidden', 'true'); sv.appendChild(sc);
  sv.appendChild(el('small', null, T('hg_tier', M.tier()))); head.appendChild(sv);
  const st = M.stats();
  addAnim(sc, t => {
    const c = sc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 352, 192);
    // streaking stars
    for (let i = 0; i < 26; i++) { const s = STARS[i], x = ((s.x * 352 - t * (40 + s.r * 60)) % 352 + 352) % 352; c.globalAlpha = 0.35 + s.r * 0.3; c.fillStyle = '#fff'; c.fillRect(x, s.y * 192, 2 + s.r * 5, 1.5); }
    c.globalAlpha = 1;
    const k = 2.0, bob = REDUCED ? 0 : Math.sin(t * 1.6) * 3;
    c.save(); c.scale(k, k);
    if (!art('drawShip', c, 352 / k / 2 + 6, 192 / k / 2 + bob, { t, tier: st.tier, guns: st.guns, tilt: REDUCED ? 0 : Math.sin(t * 1.6) * 0.25, thrust: 0.8, suit: st.suit, hurt: 0, shield: st.shieldCd > 0 ? 0.35 : 0, beam: false })) {
      c.fillStyle = '#f4f1ea'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.ellipse(88, 48 + bob, 34, 14, 0, 0, TAU); c.fill(); c.stroke();
    }
    c.restore();
  }, 'sheet');
  body.appendChild(head);
  body.appendChild(el('p', 'note-line', T('shopNote')));
  const ups = el('div', 'ups');
  for (const u of M.UPGRADES) {
    const lv = M.level(u.id), max = u.max, price = M.nextPrice(u.id), can = M.canBuy(u.id), isMax = price == null;
    const row = el('div', 'up' + (isMax ? ' max' : ''));
    const ic = mk(88, 88); ic.setAttribute('aria-hidden', 'true'); row.appendChild(ic);
    if (u.id === 'nabeeh' || u.id === 'engine') addAnim(ic, t => upIcon(ic.getContext('2d'), u.id, 88, t), 'sheet'); else upIcon(ic.getContext('2d'), u.id, 88, 0);
    const nm = el('b', 'up-name'); nm.appendChild(el('span', null, T('up_' + u.id)));
    const pips = el('span', 'pips'); pips.setAttribute('role', 'img'); pips.setAttribute('aria-label', T('up_lv', lv, max));
    for (let k = 0; k < max; k++) pips.appendChild(el('i', k < lv ? 'on' : '')); nm.appendChild(pips); row.appendChild(nm);
    row.appendChild(el('small', 'up-d', T('up_' + u.id + '_d')));
    const eff = el('span', 'eff');
    if (isMax) { eff.append(upText(u.id, lv)); }
    else { const now = el('em', null, upText(u.id, lv)); eff.appendChild(now); eff.appendChild(el('b', null, T('arrow'))); eff.append(upText(u.id, lv + 1)); }
    row.appendChild(eff);
    const b = el('button'); b.type = 'button';
    if (isMax) { b.textContent = T('up_max'); b.disabled = true; }
    else { b.appendChild(coinIc()); b.append(nf(price)); b.disabled = !can; b.setAttribute('aria-label', T('up_buy', price) + ' · ' + T('up_' + u.id)); }
    b.onclick = () => {
      const r = M.buyUpgrade(u.id) || {};
      if (r.ok) { note(T('bought')); ustaLine = TL('usta_buy'); hook('sfx', 'chime'); hook('onBuy', u.id); }
      else if (r.reason === 'max') { ustaLine = TL('usta_max'); }
      else { note(T('notEnough')); ustaLine = TL('usta_poor'); }
      openSheet('hangar');
    };
    row.appendChild(b);
    ups.appendChild(row);
  }
  body.appendChild(ups);
}
// ---- suits ----
function sheetSuits(body) {
  body.appendChild(el('p', 'note-line', T('st_note')));
  const g = el('div', 'cards'), wornId = M.suit().id;
  for (const s of M.SUITS) {
    const own = M.ownsSuit(s.id), worn = s.id === wornId, badgeLock = !!s.badge && !own;
    const sub = s.perk ? T(s.perk) : T('free');
    let btn;
    if (worn) btn = { text: T('wearing'), cls: 'sec', disabled: true };
    else if (own) btn = { text: T('wear'), cls: 'sec', onClick: () => { M.wearSuit(s.id); hook('sfx', 'chime'); openSheet('suits'); } };
    else if (badgeLock) btn = { text: T('badgeOnly'), disabled: true };
    else btn = { text: T('buy', s.price), price: s.price, disabled: M.coins() < s.price, onClick: () => { const r = M.buySuit(s.id) || {}; if (r.ok) { note(T('bought')); hook('sfx', 'chime'); } else note(T('notEnough')); openSheet('suits'); } };
    const cl = [worn ? 'on' : '', s.perk ? 'perk' : '', badgeLock ? 'locked' : ''].filter(Boolean).join(' ');
    const cc = card(cnv => {
      const c = cnv.getContext('2d'); c.clearRect(0, 0, 192, 192);
      c.save(); c.scale(192 / 200, 192 / 200);
      if (!art('drawAbood', c, 100, 192, 2.45, { t: 0.4, suit: s.id, pose: 'stand' })) { c.fillStyle = s.col || '#fff'; c.strokeStyle = INK; c.lineWidth = 4; rr(c, 70, 70, 60, 110, 24); c.fill(); c.stroke(); c.fillStyle = s.visor || '#bfeaff'; c.beginPath(); c.arc(100, 66, 32, 0, TAU); c.fill(); c.stroke(); }
      c.restore();
    }, T('suit_' + s.id), sub, btn, cl);
    g.appendChild(cc);
  }
  body.appendChild(g);
}
// ---- missions + login ----
function sheetMissions(body) {
  const box = el('div', 'login-box'), headR = el('div', 'login-head');
  const L = M.login();
  const tl = el('div'); tl.appendChild(el('b', null, T('lg_title'))); if (L.streak > 1) { tl.append(' · '); tl.appendChild(el('small', null, T('lg_streak', L.streak))); }
  headR.appendChild(tl);
  if (L.claimable) {
    const b = el('button', 'btn alt'); b.type = 'button'; b.style.cssText = 'min-height:38px;font-size:15px;padding:2px 14px'; b.textContent = T('lg_claim', L.gift);
    b.onclick = () => { const got = M.claimLogin(); if (got) { note(T('f_coins', '+' + got)); hook('sfx', 'chime'); } openSheet('missions'); };
    headR.appendChild(b);
  } else headR.appendChild(el('small', null, T('lg_done')));
  box.appendChild(headR);
  const days = el('div', 'login-days'); loginDays(days); box.appendChild(days);
  body.appendChild(box);
  body.appendChild(el('p', 'sec-title', T('ms_daily')));
  body.appendChild(el('p', 'hint', T('ms_note') + ' · ' + T('ms_bonus', M.DAILY_BONUS || 0)));
  M.missions().forEach((m, i) => {
    const ready = !m.claimed && m.progress >= m.goal;
    const row = el('div', 'mission' + (ready ? ' done' : '') + (m.claimed ? ' claimed' : ''));
    const tx = el('div'); tx.appendChild(el('b', null, T('ms_' + m.kind, m.goal))); tx.appendChild(el('br')); tx.appendChild(el('small', null, T('bg_reward', m.reward)));
    row.appendChild(tx);
    const b = el('button'); b.type = 'button';
    if (m.claimed) { b.textContent = T('claimed'); b.disabled = true; }
    else if (ready) { b.appendChild(coinIc()); b.append(T('claim')); b.onclick = () => { const got = M.claimMission(i); if (got) { note(T('f_coins', '+' + got)); hook('sfx', 'chime'); } openSheet('missions'); }; }
    else { b.textContent = T('ms_prog', m.progress, m.goal); b.disabled = true; }
    row.appendChild(b);
    const pg = el('div', 'prog'); const fi = el('i'); fi.style.width = Math.round(clamp(m.progress / m.goal, 0, 1) * 100) + '%'; pg.appendChild(fi); row.appendChild(pg);
    body.appendChild(row);
  });
}
// ---- badges ----
function sheetBadges(body) {
  const list = M.badgeList();
  const have = list.filter(b => b.tier > 0).length;
  body.appendChild(el('p', 'hint', T('bg_tiered') + ' · ' + T('bg_count', have, list.length)));
  const g = el('div', 'cards');
  for (const b of list) {
    const tier = b.tiered ? b.tier - 1 : (b.done ? 3 : -1);
    const name = b.tiered ? T('bc_' + b.id) : T('bg_' + b.id);
    const desc = b.tiered ? T('bc_' + b.id + '_d', b.goal) : T('bg_' + b.id + '_d');
    const cc = card(cnv => medal(cnv.getContext('2d'), b.id, tier, 192), name, desc, null, b.tier > 0 ? '' : 'locked');
    const chip = el('span', 'tier', b.tiered ? (b.done ? T('tier_all') : b.tier > 0 ? T('tier_' + (b.tier - 1)) : T('tier_none')) : (b.done ? '✓' : T('bg_locked')));
    cc.appendChild(chip);
    if (!b.done && b.tiered) {
      const pg = el('div', 'prog'), fi = el('i'); fi.style.width = Math.round(clamp(b.progress / b.goal, 0, 1) * 100) + '%'; pg.appendChild(fi); cc.appendChild(pg);
      cc.appendChild(el('small', null, T('bg_prog', Math.min(b.progress, b.goal), b.goal) + ' · ' + T('bg_reward', b.reward)));
    } else if (!b.done) cc.appendChild(el('small', null, T('bg_reward', b.reward)));
    g.appendChild(cc);
  }
  body.appendChild(g);
}
// ---- help ----
function helpPic(kind) {
  return cnv => {
    cnv.width = 192; cnv.height = 144; const c = cnv.getContext('2d'), t = 0.6;
    c.fillStyle = '#1d1640'; c.fillRect(0, 0, 192, 144); stars(c, 192, 144, 1, 18, 0.6);
    c.save(); c.scale(2, 2); // 96 x 72 logical
    const ship = (x, y, o = {}) => art('drawShip', c, x, y, Object.assign({ t, tier: 0, guns: 1, tilt: 0, thrust: 0.7, suit: 'white' }, o)) || (c.fillStyle = '#f4f1ea', c.beginPath(), c.ellipse(x, y, 16, 7, 0, 0, TAU), c.fill());
    if (kind === 'move') {
      c.save(); c.translate(30, 36); c.scale(0.55, 0.55); ship(0, 0, { tilt: -0.5 }); c.restore();
      c.strokeStyle = '#2fd4e6'; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(70, 14); c.lineTo(70, 58); c.moveTo(64, 20); c.lineTo(70, 13); c.lineTo(76, 20); c.moveTo(64, 52); c.lineTo(70, 59); c.lineTo(76, 52); c.stroke();
      c.fillStyle = '#ffe0c2'; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.ellipse(80, 38, 6, 8, -0.3, 0, TAU); c.fill(); c.stroke();
    } else if (kind === 'fire') {
      c.save(); c.translate(24, 36); c.scale(0.5, 0.5); ship(0, 0); c.restore();
      for (let i = 0; i < 3; i++) if (!art('drawBolt', c, 46 + i * 12, 36, 'blaster', 1)) { c.fillStyle = '#ffc53d'; c.fillRect(42 + i * 12, 35, 8, 2.5); }
      if (!art('drawRock', c, { x: 82, y: 36, r: 10, rot: 0.4, seed: 3, kind: 'rock', flash: 0 })) planet(c, 'moon', 82, 36, 10, 0);
    } else if (kind === 'super') {
      if (!art('drawBeam', c, 26, 36, 96, 0.8, 0.5)) { c.fillStyle = 'rgba(255,230,140,.8)'; c.fillRect(26, 31, 70, 10); }
      c.save(); c.translate(22, 36); c.scale(0.5, 0.5); ship(0, 0, { beam: true }); c.restore();
    } else if (kind === 'meteor') {
      art('drawWarning', c, 96, 20, 0.6, 0.5);
      if (!art('drawMeteor', c, { x: 60, y: 46, r: 8, vx: -950, seed: 2 }, 0.5)) { c.fillStyle = '#ff7a2a'; c.beginPath(); c.arc(60, 46, 8, 0, TAU); c.fill(); }
    } else if (kind === 'coins') {
      art('drawRock', c, { x: 26, y: 38, r: 13, rot: 0.2, seed: 5, kind: 'crystal', flash: 0 });
      art('drawJunk', c, { x: 60, y: 34, s: 0.55, rot: 0.5, seed: 1, kind: 'tank', flash: 0, t });
      if (!art('drawPickup', c, 'coin', 82, 50, t)) { c.fillStyle = '#e9b330'; c.beginPath(); c.arc(82, 50, 6, 0, TAU); c.fill(); }
    } else if (kind === 'pickups') {
      ['repair', 'shield', 'cell', 'rapid'].forEach((p, i) => { if (!art('drawPickup', c, p, 15 + i * 22, 36, t)) { c.fillStyle = ['#ff6b6b', '#2fd4e6', '#ffd45a', '#ff9a2a'][i]; c.beginPath(); c.arc(15 + i * 22, 36, 7, 0, TAU); c.fill(); } });
    } else if (kind === 'junk') {
      art('drawJunk', c, { x: 22, y: 26, s: 0.5, rot: 0.3, seed: 2, kind: 'panel', flash: 0, t });
      art('drawJunk', c, { x: 70, y: 24, s: 0.5, rot: -0.2, seed: 4, kind: 'dish', flash: 0, t });
      art('drawJunk', c, { x: 46, y: 52, s: 0.5, rot: 0, seed: 6, kind: 'drone', flash: 0, t });
    } else if (kind === 'hull') {
      for (let i = 0; i < 4; i++) { c.fillStyle = i < 3 ? '#d7262f' : '#3b3160'; c.strokeStyle = INK; c.lineWidth = 1.5; c.save(); c.translate(24 + i * 14, 36); c.transform(1, 0, -0.18, 1, 0, 0); rr(c, -5, -8, 10, 16, 2.5); c.fill(); c.stroke(); c.restore(); }
    } else if (kind === 'shield') {
      c.save(); c.translate(48, 36); c.scale(0.5, 0.5); ship(0, 0); c.restore();
      if (!art('drawShieldBubble', c, 48, 36, 24, 1, t)) { c.strokeStyle = '#2fd4e6'; c.lineWidth = 2; c.beginPath(); c.arc(48, 36, 24, 0, TAU); c.stroke(); }
    } else if (kind === 'nabeeh') {
      art('drawBotLaser', c, 40, 34, 84, 40, 0.8);
      art('drawRock', c, { x: 84, y: 40, r: 8, rot: 0.4, seed: 7, kind: 'rock', flash: 0.5 });
      art('drawNabeeh', c, 26, 32, 0.8, { t, mood: 'happy', laser: true });
    } else if (kind === 'hangar') {
      art('drawUsta', c, 48, 70, 0.66, t);
    } else if (kind === 'legs') {
      planet(c, 'earth', 14, 54, 12, t); planet(c, 'moon', 82, 20, 10, t);
      c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(24, 48); c.quadraticCurveTo(50, 46, 72, 26); c.stroke(); c.setLineDash([]);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < 2 ? '#d7262f' : '#fff'; c.strokeStyle = INK; c.lineWidth = 1.2; const p = [[34, 46], [50, 41], [64, 32]][i]; c.beginPath(); c.arc(p[0], p[1], 3.5, 0, TAU); c.fill(); c.stroke(); }
    }
    c.restore();
  };
}
function sheetHelp(body) {
  const sec = (title, items) => {
    body.appendChild(el('p', 'sec-title', title));
    const g = el('div', 'cards help-cards');
    for (const [kind, key] of items) {
      const c = el('div', 'card'), cnv = mk(192, 144); cnv.setAttribute('aria-hidden', 'true'); helpPic(kind)(cnv); c.appendChild(cnv);
      c.appendChild(el('small', null, T(key))); g.appendChild(c);
    }
    body.appendChild(g);
  };
  sec(TT('help_s_controls', 'التحكم', 'Controls'), [['move', 'help_move'], ['fire', 'help_fire'], ['super', 'help_super']]);
  body.appendChild(el('p', 'hint', T('help_keys')));
  sec(TT('help_s_space', 'في الفضاء', 'Out in space'), [['meteor', 'help_meteor'], ['coins', 'help_coins'], ['pickups', 'help_pickups']]);
  sec(TT('help_s_ship', 'سفينتك', 'Your ship'), [['hull', 'help_hull'], ['shield', 'help_shield'], ['nabeeh', 'help_nabeeh'], ['hangar', 'help_hangar']]);
  sec(TT('help_s_trips', 'الرحلات', 'Journeys'), [['legs', 'help_story'], ['legs', 'help_legs']]);
  body.appendChild(el('p', 'sec-title', T('r_factTitle')));
  const facts = el('div', 'facts');
  const bodies = ['earth'].concat(M.JOURNEYS.map(j => j.planet || j.id));
  bodies.forEach((id, i) => {
    const reached = id === 'earth' || M.legsDone(M.JOURNEYS[i - 1].id) >= 3;
    const f = el('div', 'fact' + (reached ? '' : ' locked')), cnv = mk(112, 112); cnv.setAttribute('aria-hidden', 'true');
    const c = cnv.getContext('2d'); c.fillStyle = '#1d1640'; c.fillRect(0, 0, 112, 112); stars(c, 112, 112, 2, 10, 0.6); planet(c, id, 56, 56, id === 'saturn' ? 26 : 34, 0);
    f.appendChild(cnv); f.appendChild(el('b', null, id === 'earth' ? pName('earth') : jName(id))); f.appendChild(el('small', null, T('fact_' + id)));
    facts.appendChild(f);
  });
  body.appendChild(facts);
  if (IOS && !STANDALONE) body.appendChild(el('p', 'hint', T('ios')));
}

// =============================================================================================
// HUD
let hc = {};
let hasShield = false;
function setTrip(jid, li) {
  const J = M.journey(jid); if (!J) return;
  cur = { jid, li };
  const from = J.from || 'earth', to = J.planet || J.id;
  for (const [id, body] of [['tripFrom', from], ['tripTo', to]]) {
    const cnv = $(id); if (!cnv) continue; const c = cnv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 56, 56);
    planet(c, body, 28, 28, body === 'saturn' ? 15 : body === 'belt' ? 20 : 22, 0);
  }
  $('tripLeg').textContent = T('m_legOf', li, 3) + ' · ' + legName(jid, li);
  $('trip').setAttribute('aria-label', T('h_prog', pName(from), pName(to)));
  hc.trip = jid + ':' + li; hc.prog = -1;
}
function hudShow(on) {
  hudOn = !!on;
  $('hud').hidden = !on; $('superBtn').hidden = !on;
  if (!on) return;
  const t = $('toast'); if (t) t.hidden = true;
}
export function showHud(on, jid, li) {
  hudShow(on);
  if (!on) return;
  if (jid) cur = { jid, li: li | 0 };
  hc = {};
  try { hasShield = (M.stats().shieldCd || 0) > 0; } catch (e) { hasShield = false; }
  if (cur.jid) setTrip(cur.jid, cur.li);
  syncMute();
  $('pauseBtn').textContent = 'II';
}
function pips(hp, maxHp) {
  const box = $('hull');
  if (hc.maxHp !== maxHp) { box.innerHTML = ''; for (let i = 0; i < maxHp; i++) box.appendChild(el('i')); hc.maxHp = maxHp; }
  const prev = hc.hp;
  [...box.children].forEach((p, i) => {
    const on = i < hp; p.classList.toggle('on', on);
    if (prev != null && !on && i < prev) { p.classList.remove('lost'); void p.offsetWidth; p.classList.add('lost'); }
  });
  if (prev != null && hp < prev && !REDUCED) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
  box.classList.toggle('low', hp <= 1 && maxHp > 1 && hp > 0);
  box.setAttribute('aria-label', T('a_hp', Math.max(0, hp), maxHp));
  hc.hp = hp;
}
export function hud(s) {
  if (!s || !hudOn) return;
  if (s.jid && hc.trip !== s.jid + ':' + (s.li | 0)) setTrip(s.jid, s.li | 0);
  const hp = Math.max(0, Math.round(s.hp ?? 0)), maxHp = Math.max(1, Math.round(s.maxHp ?? 3));
  if (hp !== hc.hp || maxHp !== hc.maxHp) pips(hp, maxHp);
  if (s.score !== hc.score) { $('hScore').textContent = nf(s.score | 0); hc.score = s.score; }
  const combo = s.combo | 0;
  if (combo !== hc.combo) {
    const ct = $('comboTag'); ct.hidden = combo <= 1;
    if (combo > 1) { ct.textContent = '×' + combo; ct.classList.toggle('hot', combo >= 4); if (combo > (hc.combo || 0)) bump(ct); }
    hc.combo = combo;
  }
  if (s.coins !== hc.coins) { $('hCoins').textContent = nf(s.coins | 0); if (hc.coins != null && s.coins > hc.coins && !hc.coinPop) { bump($('coinBox')); hc.coinPop = setTimeout(() => { hc.coinPop = 0; }, 300); } hc.coins = s.coins; }
  const prog = Math.round(clamp(+s.prog || 0, 0, 1) * 500) / 500;
  if (prog !== hc.prog) {
    const f = clamp((cur.li + prog) / 3, 0, 1);
    $('tripFill').style.transform = 'scaleX(' + f.toFixed(4) + ')';
    $('tripShip').style.left = (f * 100).toFixed(2) + '%';
    hc.prog = prog;
  }
  const sf = Math.round(clamp(+s.superF || 0, 0, 1) * 100) / 100;
  if (sf !== hc.sf) {
    const b = $('superBtn'); b.style.setProperty('--f', sf);
    const full = sf >= 1; if (full !== hc.full) { b.classList.toggle('full', full); b.querySelector('b').textContent = full ? T('h_superReady') : ''; hc.full = full; }
    b.setAttribute('aria-label', T('a_super') + ' ' + Math.round(sf * 100) + '%');
    hc.sf = sf;
  }
  const sh = s.shield === true ? 1 : Math.round(clamp(+s.shield || 0, 0, 1) * 50) / 50;
  if (sh !== hc.sh) {
    const chip = $('shieldChip'), vis = hasShield || sh > 0;
    chip.hidden = !vis;
    if (vis) { chip.classList.toggle('up', sh >= 1); chip.classList.toggle('off', sh < 1); chip.querySelector('i').style.transform = 'scaleX(' + sh + ')'; }
    hc.sh = sh;
  }
  const rp = Math.round(clamp(+s.rapid > 1 ? +s.rapid / 6 : +s.rapid || 0, 0, 1) * 50) / 50;
  if (rp !== hc.rp) { const chip = $('rapidChip'); chip.hidden = rp <= 0; if (rp > 0) chip.querySelector('i').style.transform = 'scaleX(' + rp + ')'; hc.rp = rp; }
}

// =============================================================================================
// pause
export function showPause(on) {
  const p = $('pause'); if (!p) return;
  p.hidden = !on;
  $('pauseBtn').textContent = on ? '▶' : 'II';
  if (on) { syncMute(); hideNote(); const t = $('toast'); if (t) t.hidden = true; if (kbd) try { $('resumeBtn').focus({ preventScroll: true }); } catch (e) {} }
}

// =============================================================================================
// results (+ counting coin animation)
let count = null;
function stopCount() { if (count) { cancelAnimationFrame(count.raf); count = null; } }
function flyCoin() {
  if (REDUCED) return;
  const from = $('swCoinIc').getBoundingClientRect(), to = document.querySelector('#over .coinpill .coin'); if (!to) return;
  const b = to.getBoundingClientRect(), e = el('i', 'coin flycoin'); e.style.left = from.left + 'px'; e.style.top = from.top + 'px'; document.body.appendChild(e);
  requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transform = `translate(${b.left - from.left}px, ${b.top - from.top}px) scale(.8)`; e.style.opacity = '.3'; }));
  setTimeout(() => e.remove(), 700);
}
function resultParts(r) {
  if (!r.win) return [{ key: 'r_kept', n: r.kept || 0 }];
  const out = [{ key: r.first === false ? 'r_replay' : 'r_reward', n: r.reward || 0 }, { key: 'r_picked', n: r.picked != null ? r.picked : (r.run && r.run.coins) || 0 }];
  if (r.bonus) out.push({ key: 'r_bonus', n: r.bonus });
  return out;
}
function showParts(parts, upto, f) {
  const ids = ['swPartR', 'swPartC', 'swPartB'];
  ids.forEach((id, i) => {
    const e = $(id), p = parts[i];
    e.textContent = p && i <= upto ? T(p.key) + ' +' + nf(i < upto ? p.n : Math.round(p.n * f)) : '';
    e.classList.toggle('hot', !!p && i === upto && f < 1);
  });
}
function endCount() {
  if (!count) return;
  const c = count; stopCount();
  $('swCoins').textContent = nf(c.total); showParts(c.parts, c.parts.length - 1, 1); syncCoins(c.base + c.total);
  bump($('swCoins')); hook('sfx', 'chime');
}
function runCount(r) {
  stopCount();
  const parts = resultParts(r), total = r.win ? (r.total != null ? r.total : parts.reduce((a, p) => a + p.n, 0)) : (r.kept || 0);
  const now = M.coins(), base = Math.max(0, now - total);
  const lens = parts.map(p => p.n > 0 ? clamp(0.35 + p.n / 400, 0.45, 1.1) : 0.05);
  count = { parts, total, base, lens, t: -0.45, last: performance.now(), tick: 0, fly: 0, raf: 0 };
  $('swCoins').textContent = '0'; showParts(parts, -1, 0); syncCoins(base);
  if (REDUCED || total <= 0) { endCount(); return; }
  const step = now2 => {
    if (!count) return;
    const dt = Math.min(0.05, (now2 - count.last) / 1000); count.last = now2; count.t += dt;
    let t = count.t, acc = 0, phase = 0, f = 0;
    if (t < 0) { count.raf = requestAnimationFrame(step); return; }
    for (phase = 0; phase < parts.length; phase++) { if (t < count.lens[phase]) { f = t / count.lens[phase]; break; } t -= count.lens[phase]; acc += parts[phase].n; }
    if (phase >= parts.length) { endCount(); return; }
    const shown = acc + Math.round(parts[phase].n * f);
    $('swCoins').textContent = nf(shown); showParts(parts, phase, f); syncCoins(base + shown);
    count.tick -= dt; count.fly -= dt;
    if (count.tick <= 0) { count.tick = 0.06; hook('sfx', 'tick', shown / Math.max(1, total)); }
    if (count.fly <= 0) { count.fly = 0.12; flyCoin(); }
    count.raf = requestAnimationFrame(step);
  };
  count.raf = requestAnimationFrame(step);
}
function nextTarget(r) {
  if (!r || !r.win) return null;
  const ji = M.journeyIndex(r.jid);
  if (r.li < 2) return { jid: r.jid, li: r.li + 1, leg: true }; // finishing a leg always opens the next one
  const nj = M.JOURNEYS[ji + 1];
  if (nj && M.isUnlocked(nj.id)) { const n = M.nextPlayable(); return { jid: n.jid, li: n.li, leg: false }; }
  return null;
}
function fillResult(r, animate) {
  const panel = $('overPanel'), J = M.journey(r.jid), planetId = (J && (J.planet || J.id)) || r.jid, arrived = !!(r.win && r.journeyDone);
  panel.classList.toggle('win', !!r.win); panel.classList.toggle('lose', !r.win); panel.classList.toggle('postcard', arrived);
  $('overTitle').textContent = !r.win ? T('r_fail') : arrived ? T('r_arrive', pName(planetId)) : T('r_win');
  if (animate || !r.botLine) r.botLine = TL(arrived ? 'bot_arrive' : r.win ? 'bot_win' : 'bot_lose');
  $('overBotTxt').textContent = r.botLine;
  const run = r.run || {};
  let msg;
  if (!r.win) msg = T('r_failHint') + (M.journeyIndex(r.jid) > 0 || r.li > 0 ? ' ' + T('r_tryUpgrade') : '');
  else if (r.newBest) msg = T('r_newBest');
  else if (run.noHit || run.hits === 0) msg = T('r_noHit');
  else msg = T('m_legOf', r.li, 3) + ' · ' + legName(r.jid, r.li);
  $('overMsg').textContent = msg;
  $('sScore').textContent = nf(run.score || 0); $('sKills').textContent = nf(run.kills || 0);
  $('sBest').textContent = nf(r.best != null ? r.best : M.best(r.jid));
  $('sBest').parentElement.classList.toggle('nb', !!r.newBest);
  $('sBestLbl').textContent = r.newBest ? T('r_newBest') : T('r_best');
  // art: postcard on arrival, otherwise Abood + Nabeeh
  dropAnims('over');
  const fact = $('overFact');
  if (arrived) {
    fact.hidden = false; fact.textContent = '';
    fact.appendChild(el('b', null, T('r_postcard', pName(planetId)) + ' · ')); fact.append(T('r_factTitle') + ' ' + T('fact_' + planetId));
    addAnim($('avOver'), t => {
      const cnv = $('avOver'), c = cnv.getContext('2d'), w = cnv.width, h = cnv.height;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); stars(c, w, h, t, 50, 0.9);
      planet(c, planetId, w * 0.55, h * 0.56, h * (planetId === 'saturn' ? 0.24 : 0.34), t * 0.3);
      c.save(); c.translate(w * 0.2, h * 0.24 + (REDUCED ? 0 : Math.sin(t * 1.5) * 4)); c.scale(1.4, 1.4); art('drawShip', c, 0, 0, { t, tier: M.tier(), guns: M.stats().guns, tilt: 0.1, thrust: 0.5, suit: M.suit().id }); c.restore();
    }, 'over');
  } else {
    fact.hidden = true;
    addAnim($('avOver'), t => drawDuoCanvas($('avOver'), t, { abood: { pose: r.win ? 'cheer' : 'sad' }, nabeeh: { mood: r.win ? 'happy' : 'sad' } }), 'over');
  }
  // unlock line
  const ul = $('overUnlock');
  if (r.win && r.unlocked) { ul.hidden = false; ul.textContent = T('r_unlocked', jName(r.unlocked)); } else ul.hidden = true;
  // missions finished + new badges
  const ms = $('overMissions'); ms.innerHTML = '';
  for (const m of r.missions || []) ms.appendChild(el('span', 'badge-chip ms-chip', T('ms_' + m.kind, m.goal) + ' · ' + T('bg_reward', m.reward)));
  const bs = $('overBadges'); bs.innerHTML = '';
  for (const b of r.badges || []) {
    const chip = el('span', 'badge-chip'), cnv = mk(48, 48); cnv.setAttribute('aria-hidden', 'true'); medal(cnv.getContext('2d'), b.id, b.tiered ? b.tier : 3, 48);
    chip.appendChild(cnv); chip.append((b.tiered ? T('bc_' + b.id) + ' · ' + T('tier_' + b.tier) : T('bg_' + b.id)) + ' · ' + T('bg_reward', b.reward || 0)); bs.appendChild(chip);
  }
  // buttons
  const nt = nextTarget(r), nb = $('nextBtn'), rb = $('retryBtn');
  nb.hidden = !nt;
  if (nt) nb.textContent = nt.leg ? T('b_next') : T('m_next', jName(nt.jid));
  rb.className = r.win ? 'btn alt' : 'btn';
  rb.textContent = r.win ? T('b_replay') : T('b_retry');
  $('quitBtn').textContent = T('b_station');
  if (!animate) { // re-render after a language switch: final numbers, no recount
    const parts = resultParts(r), total = r.win ? (r.total != null ? r.total : parts.reduce((a, p) => a + p.n, 0)) : (r.kept || 0);
    $('swCoins').textContent = nf(total); showParts(parts, parts.length - 1, 1); syncCoins();
  }
}
export function showResult(r) {
  r = Object.assign({}, r || {});
  lastRes = r; cur = { jid: r.jid, li: r.li | 0 };
  hudShow(false); hideNote(); $('pause').hidden = true; $('menu').hidden = true; $('sheet').hidden = true;
  $('over').hidden = false;
  fillResult(r, true);
  runCount(r);
  maybeToast();
  if (kbd) try { (r.win && nextTarget(r) ? $('nextBtn') : $('retryBtn')).focus({ preventScroll: true }); } catch (e) {}
}

// =============================================================================================
// init
function relang() {
  if (!$('menu').hidden) { renderMenu(); const tx = $('botTipTxt'); if (tx) tx.textContent = TL('bot_menu'); }
  if (sheetKind) { ustaLine = ''; openSheet(sheetKind); }
  if (!$('over').hidden && lastRes) { endCount(); fillResult(lastRes, false); }
  if (hudOn && cur.jid) { setTrip(cur.jid, cur.li); hc.hp = undefined; hc.maxHp = undefined; hc.full = undefined; }
  if (!$('loginPop').hidden) { const L = loginDays($('loginDays')); $('loginClaim').textContent = T('lg_claim', L.gift); }
  syncMute(); syncCoins();
  if (!ldDone) ldTip();
}
function registerSW() {
  try {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    if (window.__aboodSW) return; window.__aboodSW = true; // game.js may register too: register once
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { updateReady = true; maybeToast(); } });
  } catch (e) { /* sandboxed frames refuse service workers; the game still runs */ }
}
export function initUI(h) {
  H = h || {};
  if (inited) return; inited = true;
  const fa = $('flagAr'), fe = $('flagEn'); if (fa) fa.innerHTML = FLAG.ar; if (fe) fe.innerHTML = FLAG.en;
  safeCall(applyI18n);
  // menu
  $('launchBtn').onclick = () => { ensureSel(); if (!M.canPlay(selJ, selL)) return; cur = { jid: selJ, li: selL }; hook('onLaunch', selJ, selL); };
  document.querySelectorAll('[data-sheet]').forEach(b => { b.onclick = () => openSheet(b.dataset.sheet); });
  $('sheetClose').onclick = closeSheet;
  $('sheet').addEventListener('pointerdown', e => { if (e.target === $('sheet')) closeSheet(); });
  $('loginPop').addEventListener('pointerdown', e => { if (e.target === $('loginPop')) $('loginPop').hidden = true; });
  $('menuMute').onclick = doMute; $('muteBtn').onclick = doMute; $('pauseMute').onclick = doMute;
  $('fpsBtn').onclick = doFps; $('pauseFps').onclick = doFps; syncFps(); window.addEventListener('langchange', syncFps);
  // fullscreen (Android / desktop), also tries the landscape lock
  const fsEl = document.documentElement;
  const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) && !STANDALONE;
  const syncFs = () => { $('fsBtn').hidden = !fsOK || !!(document.fullscreenElement || document.webkitFullscreenElement); };
  syncFs(); document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs);
  $('fsBtn').onclick = async () => {
    try { await (fsEl.requestFullscreen ? fsEl.requestFullscreen({ navigationUI: 'hide' }) : fsEl.webkitRequestFullscreen()); } catch (e) {}
    try { await screen.orientation.lock('landscape'); } catch (e) {}
    $('fsBtn').blur();
  };
  // language: flag pills (rendered by applyI18n) + first-run picker
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.lang [data-lang]');
    if (b && b.dataset.lang !== lang()) setLang(b.dataset.lang);
    const pk = e.target.closest && e.target.closest('[data-pick]');
    if (pk) { setLang(pk.dataset.pick); $('langPick').hidden = true; showMenu(); }
  });
  addEventListener('langchange', relang);
  // HUD buttons: pointerdown never reaches the canvas drag
  const stop = e => e.stopPropagation();
  for (const id of ['pauseBtn', 'muteBtn']) $(id).addEventListener('pointerdown', stop);
  $('pauseBtn').onclick = e => { if ($('pause').hidden) hook('onPause'); else hook('onResume'); e.currentTarget.blur(); };
  const sb = $('superBtn');
  sb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sb.classList.add('press'); hook('onSuper'); });
  const unpress = () => sb.classList.remove('press');
  sb.addEventListener('pointerup', unpress); sb.addEventListener('pointercancel', unpress); sb.addEventListener('pointerleave', unpress);
  sb.addEventListener('click', e => { if (e.detail === 0) hook('onSuper'); sb.blur(); }); // keyboard Enter/Space on the focused button
  sb.addEventListener('contextmenu', e => e.preventDefault());
  // pause card
  $('resumeBtn').onclick = () => hook('onResume');
  $('restartBtn').onclick = () => hook('onRetry');
  $('pauseQuit').onclick = () => hook('onQuit');
  // results
  $('nextBtn').onclick = () => { endCount(); const n = nextTarget(lastRes); if (n) cur = { jid: n.jid, li: n.li }; hook('onNext'); };
  $('retryBtn').onclick = () => { endCount(); if (lastRes) cur = { jid: lastRes.jid, li: lastRes.li | 0 }; hook('onRetry'); };
  $('quitBtn').onclick = () => { endCount(); hook('onQuit'); };
  $('over').addEventListener('pointerdown', e => { if (count && !(e.target.closest && e.target.closest('button'))) endCount(); });
  // toast
  $('toastBtn').onclick = () => location.reload();
  // keys: Esc closes a sheet / the login gift (game.js owns P / Esc for pause in flight)
  addEventListener('pointerdown', () => { kbd = false; }, true);
  addEventListener('keydown', e => {
    kbd = true;
    if (e.code !== 'Escape') return;
    if (!$('sheet').hidden) { closeSheet(); e.stopPropagation(); }
    else if (!$('loginPop').hidden) { $('loginPop').hidden = true; }
  });
  // rotate overlay
  syncRotate();
  if (portraitMQ.addEventListener) portraitMQ.addEventListener('change', syncRotate); else if (portraitMQ.addListener) portraitMQ.addListener(syncRotate);
  addEventListener('resize', syncRotate);
  syncMute();
  registerSW();
}
