// Abood to the Moon · عبود إلى القمر — all DOM: loader, rotate overlay, language picker, station menu, sheets
// (hangar / costumes / missions / duels / badges / help), HUD (legs and duels), pause card, results card, toasts.
// The main canvas belongs to game.js.
//
// ---- exports ----
//   initUI(h)        h = { onLaunch(jid, li), onDuel(rid), onPause(), onResume(), onQuit(), onRetry(), onNext(), onSuper(),
//                          onMute(), isMuted(), onFps() → 30|60, getFps(),
//                          optional: onSelect(jid, li), onChar(ch) (player switched Abood/Mozah), onBuy(id),
//                                    sfx(name) ('tick' | 'chime' while coins count) }
//                    onDuel(rid): the UI only asks; game.js calls M.startDuel(rid) and starts the duel. A falsy return or
//                    { ok:false, reason } shows a note.
//   showMenu(), hideMenus()
//   showHud(on, jid?, li?, o?)   jid/li optional: ui.js already knows the leg from launch/retry/next.
//                    showHud(true, null, 0, { duel: true, rid }) (or showHud(true, { duel: rid })) starts the duel HUD:
//                    the rival bar replaces the trip bar.
//   hud(s)           s = { hp, maxHp, score, coins, prog 0..1, superF 0..1, shield 0..1 (1 = up), combo, rapid 0..1, jid?, li?,
//                          canPause?, rival?: { id, name?, hp, max, phase (index), ticks?: [at...], shield 0..1, stun?, intro 0..1? } }
//                    writes only on change
//   setCanPause(b)   hide the II button while pausing would do nothing (arrive / dead)
//   superRect()      the super button's client rect (to keep warnings out from under it)
//   showPause(on), showResult(r)
//                    r = finishLeg/failLeg result + { win, jid, li, run }  or  finishDuel/failDuel result + { duel:true, rid, run }
//   note(text, ms?), loader(f, msgKeyOrText), hideLoader(), isBlocking() (portrait overlay up)
//   extras: renderMenu(), openSheet(kind), closeSheet(), syncCoins()
import * as M from './meta.js?v=__BUILD__';
import { T, TL, nf, lang, setLang, applyI18n } from './i18n.js?v=__BUILD__';
import * as I from './i18n.js?v=__BUILD__';
import * as A from './art.js?v=__BUILD__';

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
// v3.2: one set of line icons in the menu-tile style (ink strokes, no colour emoji), used wherever a symbol was
const IC = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  play: '<path class="fl" d="M8 5.5l11 6.5-11 6.5z"/>', pause: '<path d="M9 6v12M15 6v12"/>',
  star: '<path class="fl" d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 16.8l-5.4 3 1.2-6.1-4.5-4.2 6.1-.7z"/>',
  spark: '<path class="fl" d="M12 3l1.9 7.1L21 12l-7.1 1.9L12 21l-1.9-7.1L3 12l7.1-1.9z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6"/>',
  shield: '<path d="M12 3.5l7 2.8v5c0 4.4-2.9 7.7-7 9.2-4.1-1.5-7-4.8-7-9.2v-5z"/>',
  heart: '<path class="fl" d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4.5M9.5 13v.6M14.5 13v.6M9.5 16.2h5"/>',
  arrow: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>', up: '<path d="M6 15l6-6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const svgI = (name, cls = '') => '<svg class="si' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>';
const icon = (name, cls) => { const s = document.createElement('span'); s.className = 'sic'; s.innerHTML = svgI(name, cls); return s.firstChild; };
const withIc = (name, text, cls) => { const e = el('span', 'ic-txt' + (cls ? ' ' + cls : '')); e.appendChild(icon(name)); e.append(text); return e; };
const safeCall = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { console.error(e); } };
// meta.js functions that are new in v2: call through MM so a missing one never breaks the menus
const MM = (fn, ...a) => typeof M[fn] === 'function' ? safeCall(M[fn], ...a) : undefined;

// art.js may still be loading its sprites (or be missing a function): never let a drawing break the UI
const artErr = new Set();
function art(fn, ...args) {
  if (typeof A[fn] !== 'function') return false;
  try { A[fn](...args); return true; } catch (e) { if (!artErr.has(fn)) { artErr.add(fn); console.warn('art.' + fn, e); } return false; }
}
function artGet(fn, ...args) {
  if (typeof A[fn] !== 'function') return null;
  try { return A[fn](...args) || null; } catch (e) { if (!artErr.has(fn)) { artErr.add(fn); console.warn('art.' + fn, e); } return null; }
}
// a key that i18n.js may not have yet: fall back to built-in text
function TT(key, ar, en, ...args) { const v = T(key, ...args); return v === key || v == null ? (lang() === 'ar' ? ar : en) : v; }
const upText = (id, lv) => typeof I.upText === 'function' ? I.upText(id, lv) : T('up_' + id + '_v', M.upValue(id, lv));
const keyIsFn = k => { try { const tb = I.STR && I.STR[lang()]; return !!tb && typeof tb[k] === 'function'; } catch (e) { return false; } };
// signed numbers stay "+302" inside Arabic text (LRI … PDI isolate)
const sgn = n => typeof I.sgn === 'function' ? I.sgn(n) : '⁦+' + nf(n) + '⁩';
const fixSign = (s, n) => String(s).split('+' + nf(n)).join(sgn(n));
const plusCoins = n => { const s = T('f_coins', n), k = nf(n); return s.includes(k) ? s.replace(k, sgn(n)) : sgn(n) + ' ' + s; };
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
const rvName = id => T('rv_' + id);

// ---- characters and looks (Abood / Mozah) ----
const CHAR = () => MM('char') || 'abood';
const isGirl = () => CHAR() === 'mozah';
const setGirl = b => safeCall(I.setGirl, !!b);
const COSTUMES = () => M.COSTUMES || M.SUITS || [];
const costumeDef = id => COSTUMES().find(c => c.id === id) || null;
const idOf = v => (v && typeof v === 'object') ? v.id : v;
function costumeOf(ch = CHAR()) {
  const c = idOf(MM('costume', ch)) || (ch === CHAR() ? idOf(MM('suit')) : null);
  return c || (ch === 'mozah' ? 'lilac' : 'white');
}
// the astronaut (feet at x, y), in either character's style
function astro(c, x, y, s, o = {}) {
  o = Object.assign({ t: 0, char: CHAR(), pose: 'stand' }, o);
  if (!o.costume) o.costume = costumeOf(o.char);
  o.suit = o.costume; // v1 art name
  return art('drawAstronaut', c, x, y, s, o) || art('drawAbood', c, x, y, s, o);
}
function shipLook() {
  const st = MM('stats') || {};
  const costume = idOf(st.costume) || idOf(st.suit) || costumeOf();
  const fx = st.fx || (costumeDef(costume) || {}).fx || null;
  return { char: st.char || CHAR(), costume, suit: costume, skin: idOf(st.skin) || idOf(MM('skin')) || 'falak', aura: fx ? fx.aura || null : null,
    tier: st.tier != null ? st.tier : (MM('tier') || 0), guns: st.guns || 1, shieldCd: st.shieldCd || 0 };
}

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
    const sheetUp = !$('sheet').hidden, rot = blocking;
    for (const a of anims) {
      if (!a.cnv.isConnected) { anims.delete(a); continue; }
      if (a.group === 'menu' && (sheetUp || rot || !$('loginPop').hidden)) continue; // hidden under a sheet / the rotate card
      if (rot && a.group !== 'loader') continue;
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
function astroFallback(c, x, y, col = '#f4f6fb') {
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 4; rr(c, x - 34, y - 156, 68, 150, 30); c.fill(); c.stroke();
  c.fillStyle = '#bfeaff'; c.beginPath(); c.arc(x, y - 156, 42, 0, TAU); c.fill(); c.stroke();
}
// the player + Nabeeh, scaled to fit a box (k = canvas px per logical unit). The astronaut's (x, y) is the feet.
function duo(c, w, h, t, o = {}) {
  const k = h / 300;
  c.save(); c.scale(k, k);
  const W = w / k, bob = REDUCED ? 0 : Math.sin(t * 1.3) * 4;
  // soft floor glow (station deck)
  const g = c.createRadialGradient(W * 0.42, 268, 4, W * 0.42, 268, 120); g.addColorStop(0, 'rgba(120,220,255,.28)'); g.addColorStop(1, 'rgba(120,220,255,0)');
  c.fillStyle = g; c.fillRect(0, 200, W, 100);
  const ab = o.abood || {};
  if (!astro(c, W * 0.4, 276 + (ab.pose === 'float' ? bob - 10 : 0), ab.s || 2.75, Object.assign({ t, pose: 'wave' }, ab))) astroFallback(c, W * 0.4, 276);
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
// a rival ship (faces left) fitted in a box of side `box` centred at (x, y)
function rivalPic(c, id, x, y, box, o = {}) {
  const R = rivalDef(id), artId = (R && R.art) || id, rs = R && R.s > 0 ? R.s : 1;   // v3 guardians borrow a rival body
  const r = ((typeof A.rivalRadius === 'function' && safeCall(A.rivalRadius, artId)) || (R && R.r) || 34) * rs, k = box / (2.5 * r);
  c.save(); c.translate(x, y);
  const ok = art('drawRival', c, artId, 0, 0, Object.assign({ t: 0, mood: 'angry', phase: 0, s: k * rs }, o));
  c.scale(k, k);
  if (!ok) {
    c.fillStyle = '#8a8f9c'; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = o.mood === 'fixed' ? '#4aa8ff' : '#ff3b3b'; c.beginPath(); c.arc(-r * 0.3, -r * 0.1, r * 0.28, 0, TAU); c.fill(); c.stroke();
  }
  c.restore();
}
const rivalDef = id => MM('rival', id) || (M.RIVALS || []).find(r => r.id === id) || MM('guardian', id) || null;
// booster icons: the matching pickup from art.js (fallback: a plain glyph)
const BICON = { shield: 'shield', super: 'cell', hull: 'repair', coins: 'coin' };
const BCOL = { shield: '#2fd4e6', super: '#ffd45a', hull: '#ff6b6b', coins: '#e9b330' };
function boostIcon(c, id, size, t = 0.6, inPlace = false) {
  if (!inPlace) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, size, size); }
  c.save(); c.scale(size / 48, size / 48);
  if (!art('drawBoosterIcon', c, id, 24, 24, 1.4) && !art('drawPickup', c, BICON[id] || 'cell', 24, 24, t)) {
    c.fillStyle = BCOL[id] || '#ccc'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(24, 24, 14, 0, TAU); c.fill(); c.stroke();
  }
  c.restore();
}
// costume card picture: the astronaut, the aura glow behind and the trail colours as a jet puff
function costumePic(c, id, ch, size, t = 0.4) {
  const C = costumeDef(id), fx = C && C.fx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, size, size);
  c.save(); c.scale(size / 200, size / 200);
  if (fx && fx.aura && fx.aura.col) {
    const g = c.createRadialGradient(100, 104, 8, 100, 104, 92);
    g.addColorStop(0, hexA(fx.aura.col, 0)); g.addColorStop(0.55, hexA(fx.aura.col, 0.42)); g.addColorStop(1, hexA(fx.aura.col, 0));
    c.fillStyle = g; c.fillRect(0, 0, 200, 200);
  }
  if (fx && Array.isArray(fx.trail) && C && (C.kind === 'perk' || C.perk)) { // the jet puff in the trail colours, with the costume's particle
    const tr = fx.trail, long = fx.particle === 'comet', n = long ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const f = i / n, x = 64 - i * (long ? 7 : 8), y = 150 + i * 6 + Math.sin(i * 1.7) * 3, r = 13 * (1 - f) + 3, col = tr[i % tr.length] || '#ffb04a';
      c.globalAlpha = 0.9 * (1 - f * 0.8);
      const sp = fx.particle && fx.particle !== 'flame' ? artGet('fxSprite', fx.particle, col) : null, img = sp && (sp.c || sp);
      if (img && img.width) { try { c.globalCompositeOperation = 'lighter'; c.drawImage(img, x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2); c.globalCompositeOperation = 'source-over'; continue; } catch (e) { c.globalCompositeOperation = 'source-over'; } }
      c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  if (!astro(c, 104, 192, 2.45, { t, char: ch, costume: id, pose: 'stand' })) astroFallback(c, 104, 190, (C && C.col) || '#f4f6fb');
  c.restore();
}
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex)); if (!m) return 'rgba(255,255,255,' + a + ')';
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
const PICS = new Map(); // baked card pictures (rival cards, ship paints)
function cardPic(kind, id, w, h, locked, mood = 'angry') {
  const key = kind + ':' + id + ':' + w + 'x' + h + (locked ? ':l' : '') + ':' + mood + (kind === 'skin' ? ':' + CHAR() + ':' + costumeOf() : '');
  if (PICS.has(key)) return PICS.get(key);
  const cnv = kind === 'rival' ? artGet('rivalCard', id, w, h, !!locked, mood) : artGet('skinCard', id, w, h, { char: CHAR(), costume: costumeOf() });
  if (cnv) PICS.set(key, cnv);
  return cnv;
}
function drawCardPic(cnv, kind, id, locked, mood) {
  const c = cnv.getContext('2d'), w = cnv.width, h = cnv.height; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const src = cardPic(kind, id, Math.round(w / 2), Math.round(h / 2), locked, mood);
  if (src) { try { c.drawImage(src, 0, 0, w, h); return; } catch (e) {} }
  // fallback until art.js has the card
  c.fillStyle = '#160f34'; c.fillRect(0, 0, w, h); stars(c, w, h, 0, 18, 0.6);
  if (kind === 'rival') { rivalPic(c, id, w * 0.55, h * 0.5, h * 0.82, { mood: mood || 'angry' }); if (locked) { c.fillStyle = 'rgba(20,14,40,.7)'; c.fillRect(0, 0, w, h); } }
  else { const L = shipLook(); c.save(); c.translate(w * 0.5, h * 0.52); c.scale(w / 110, w / 110); art('drawShip', c, 0, 0, Object.assign({}, L, { t: 0.5, tier: 2, guns: 1, tilt: 0, thrust: 0.6, skin: id })); c.restore(); }
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
  const txt = (s, px = 9) => { c.font = '800 ' + px + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 0.5); };
  if (id === 'rocks') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, q = 6 + (i % 3) * 1.2; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'meteors') { c.beginPath(); c.moveTo(-7, 6); c.lineTo(3, -4); c.lineTo(1, 1); c.lineTo(7, -6); c.lineTo(-3, 6); c.lineTo(-1, 1); c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'coins') txt(lang() === 'ar' ? 'د.إ' : 'AED');
  else if (id === 'supers' || id === 'tour') star(7.5);
  else if (id === 'legs' || id === 'first') { c.fillRect(-5, -7, 2, 14); c.beginPath(); c.moveTo(-3, -7); c.lineTo(7, -4); c.lineTo(-3, -1); c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'planets' || id === 'saturn') { c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(0, 0, 9, 3, -0.4, 0, TAU); c.stroke(); }
  else if (id === 'nohit') { c.beginPath(); c.moveTo(0, -7); c.lineTo(6, -4); c.quadraticCurveTo(6, 4, 0, 8); c.quadraticCurveTo(-6, 4, -6, -4); c.closePath(); c.fill(); c.stroke(); }
  else if (id === 'hangar') { c.lineWidth = 3; c.strokeStyle = on ? '#fffbf2' : '#efeae0'; c.beginPath(); c.moveTo(-5, 5); c.lineTo(3, -3); c.stroke(); c.beginPath(); c.arc(4, -4, 3.5, 0, TAU); c.stroke(); }
  else if (id === 'moon') { c.beginPath(); c.arc(0, 0, 7, 0.6, TAU - 0.6); c.quadraticCurveTo(-1, 0, Math.cos(0.6) * 7, Math.sin(0.6) * 7); c.fill(); c.stroke(); }
  else if (id === 'mars') { c.fillStyle = on ? '#e0754a' : '#ddd'; c.beginPath(); c.arc(0, 0, 6.5, 0, TAU); c.fill(); c.stroke(); }
  else if (id === 'crystals') { c.fillStyle = on ? '#b9a6ff' : '#e6e1f2'; c.beginPath(); c.moveTo(0, -8); c.lineTo(6, -1); c.lineTo(0, 8); c.lineTo(-6, -1); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-6, -1); c.lineTo(6, -1); c.stroke(); }
  else if (id === 'chains') { c.beginPath(); c.arc(-3, 0, 4, 0, TAU); c.stroke(); c.beginPath(); c.arc(3, 0, 4, 0, TAU); c.stroke(); }
  else if (id === 'duels' || id === 'duel1' || id === 'champion') { c.lineWidth = 2.4; c.strokeStyle = on ? '#fffbf2' : '#efeae0'; c.beginPath(); c.moveTo(-6, -6); c.lineTo(6, 6); c.moveTo(6, -6); c.lineTo(-6, 6); c.stroke(); if (id === 'champion') { c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, 0, 2.5, 0, TAU); c.fill(); } }
  else if (id === 'ladder') { c.fillRect(-5, -7, 2, 14); c.fillRect(3, -7, 2, 14); for (let k = -5; k <= 5; k += 4) c.fillRect(-4, k, 8, 1.6); }
  else if (id === 'loyal') txt('7');
  else if (id === 'mozah') { c.beginPath(); c.arc(0, -1, 6, Math.PI, 0); c.lineTo(6, 6); c.quadraticCurveTo(0, 9, -6, 6); c.closePath(); c.fill(); c.stroke(); }
  else if (/^stars\d+/.test(id)) { star(7); c.fillStyle = INK; txt(id.slice(5), 6); }
  else star(6.5);
  c.restore(); c.setTransform(1, 0, 0, 1, 0, 0);
}
// three little stars (filled = earned); cls picks the size
function starRow(arr, cls = 'stars3', isNew = []) {
  const s = el('span', cls); s.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 3; k++) { const i = el('i', 'star' + (arr && arr[k] ? ' on' : '') + (isNew.includes(k) ? ' new' : '')); if (isNew.includes(k)) i.style.animationDelay = (0.5 + isNew.indexOf(k) * 0.35) + 's'; s.appendChild(i); }
  return s;
}
const starCount = arr => (arr || []).filter(Boolean).length;
function progBar(f) { const pg = el('div', 'prog'), fi = el('i'); fi.style.width = Math.round(clamp(f, 0, 1) * 100) + '%'; pg.appendChild(fi); return pg; }

// =============================================================================================
// state
let selJ = null, selL = 0;
let cur = { jid: null, li: 0 }, lastRes = null;
let sheetKind = null, sheetFrom = null, ustaLine = '', hangTab = 'up', pendingSheet = null;
let blocking = false, hudOn = false, updateReady = false, loginShown = false;
let tipTimer = 0;
let kbd = false; // last input was a key: move focus into new cards (no focus rings for touch / mouse players)
let duelOn = null, pendingDuel = null;

function syncCoins(v) {
  const s = T('coins', v == null ? M.coins() : v);
  document.querySelectorAll('.coinVal').forEach(e => { e.textContent = s; });
}
let noteT = 0;
export function note(text, ms = 1800, ic = null) {
  const n = $('note'); if (!n || !text) return;
  n.textContent = ''; if (ic) n.appendChild(icon(ic)); n.append(text); n.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => { n.hidden = true; }, ms);
}
function hideNote() { clearTimeout(noteT); const n = $('note'); if (n) n.hidden = true; }
// v3: the WARNING banner before a boss (title + the boss's name), slides in across the screen
let bannerT = 0;
export function banner(title, sub, ms = 3600) {
  const b = $('banner'); if (!b) return;
  b.querySelector('b').textContent = title || ''; b.querySelector('span').textContent = sub || '';
  b.hidden = false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, ms);
}
function hideBanner() { clearTimeout(bannerT); const b = $('banner'); if (b) b.hidden = true; }
function bump(e) { if (!e || REDUCED) return; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
function maybeToast() { const t = $('toast'); if (t && updateReady && !hudOn) t.hidden = false; }
function syncMute() {
  const m = !!hook('isMuted');
  for (const id of ['muteBtn', 'menuMute']) { const b = $(id); if (b) { b.innerHTML = svgI(m ? 'mute' : 'sound'); b.setAttribute('aria-pressed', m ? 'true' : 'false'); } }
  const pm = $('pauseMute'); if (pm) { pm.innerHTML = ''; pm.appendChild(withIc(m ? 'mute' : 'sound', T('sound'))); pm.setAttribute('aria-pressed', m ? 'true' : 'false'); }
}
function syncFps() {
  const f = hook('getFps') === 30 ? 30 : 60;
  const b = $('fpsBtn'); if (b) { b.textContent = String(f); b.title = T('fps_l', f); }
  const p = $('pauseFps'); if (p) p.textContent = T('fps_l', f);
}
function doFps(e) { const f = hook('onFps'); syncFps(); note(T('fps_note', f === 30 ? 30 : 60)); if (e && e.currentTarget) e.currentTarget.blur(); }
function doMute(e) { hook('onMute'); syncMute(); if (e && e.currentTarget) e.currentTarget.blur(); }
// theme pre-bake while the kid is in the menu (art keeps menu + current + next themes)
let baked = null;
function bakeSoon(theme) {
  if (!theme || theme === baked || typeof A.bakeTheme !== 'function') return; baked = theme;
  const run = () => art('bakeTheme', theme);
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 300);
}
const themeOf = jid => { const J = jid && M.journey(jid); return J && J.theme && typeof J.theme === 'object' ? J.theme : null; }; // the journey's theme object

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
  if (!astro(c, 200, 262, 2.3, { t, pose: 'float' })) astroFallback(c, 200, 262);
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
const WRENCH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.6 17.1a2 2 0 0 0 2.8 2.8l5.7-5.7a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.5-.5-2.4z"/></svg>';
function dragScroll(row) {
  if (row.dataset.drag) return; row.dataset.drag = 1; let x0 = 0, s0 = 0, down = false;
  row.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; down = true; row.moved = false; x0 = e.clientX; s0 = row.scrollLeft; });
  addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - x0; if (Math.abs(dx) > 5) row.moved = true; if (row.moved) row.scrollLeft = s0 - dx; });
  addEventListener('pointerup', () => { down = false; setTimeout(() => { row.moved = false; }, 0); });
  row.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += lang() === 'ar' ? -e.deltaY : e.deltaY; e.preventDefault(); } }, { passive: false });
}
// Usta's advice for a ship-level gate: "we need ship level 15, you have 13 · Usta recommends: Blaster"
function gateText(need) {
  const rec = MM('recommend');
  return T('m_need', need.need, need.have) + (rec ? ' ' + T('up_rec') + ': ' + T('up_' + rec) : '');
}
export function renderMenu() {
  ensureSel(); syncCoins(); syncMute();
  const strip = $('jStrip'); if (!strip) return;
  const keepX = strip.scrollLeft, first = !strip.childElementCount; strip.innerHTML = ''; dragScroll(strip);
  M.JOURNEYS.forEach((j, i) => {
    const open = M.isUnlocked(j.id), done = M.legsDone(j.id), on = j.id === selJ;
    const prev = i > 0 ? M.JOURNEYS[i - 1] : null, prevDone = !prev || M.legsDone(prev.id) >= 3;
    const need = !open && prevDone ? MM('journeyNeed', j.id) : null, gated = !!(need && !need.ok);
    const b = el('button', 'jcard' + (open ? '' : ' shut') + (gated ? ' gated' : '') + (on ? ' on' : '') + (done >= 3 ? ' done' : '')); b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const lockTxt = gated ? gateText(need) : T('m_lockedHint', pName(prev ? prev.planet : 'moon'));
    const nStars = open ? MM('starsOf', j.id) : null;
    b.setAttribute('aria-label', jName(j.id) + ' · ' + (open ? T('m_legsDone', done, 3) + (nStars != null ? ' · ' + T('a_stars', nStars) : '') : lockTxt));
    const pic = mk(224, 140); pic.setAttribute('aria-hidden', 'true'); b.appendChild(pic);
    const fill = () => { try { pic.getContext('2d').drawImage(thumb(j.planet || j.id, !open), 0, 0, 224, 140); } catch (e) {} };
    if (THUMBS.has((j.planet || j.id) + (open ? ':o' : ':l'))) fill(); else setTimeout(fill, 30 + i * 40);
    if (gated) { const g = el('span', 'gate'); g.innerHTML = WRENCH_SVG; g.appendChild(el('span', null, T('m_needShort', need.need))); b.appendChild(g); }
    else if (!open) { const lk = el('span', 'lock'); lk.innerHTML = LOCK_SVG; b.appendChild(lk); }
    if (done >= 3) { const ok = el('span', 'ok'); ok.appendChild(icon('check')); b.appendChild(ok); }
    b.appendChild(el('b', null, jName(j.id)));
    const lp = el('small', 'lp'); lp.setAttribute('aria-hidden', 'true'); for (let k = 0; k < 3; k++) lp.appendChild(el('i', k < done ? 'on' : ''));
    if (nStars) { const st = el('em', 'jst'); st.appendChild(el('i', 'star on')); st.append(nf(nStars)); lp.appendChild(st); }
    b.appendChild(lp);
    b.onclick = () => {
      if (strip.moved) return;
      if (!open) { note(lockTxt, gated ? 4200 : 1800); return; }
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
  // legs of the selected journey (with their three stars)
  const row = $('legRow'); row.innerHTML = '';
  const done = M.legsDone(selJ);
  for (let li = 0; li < 3; li++) {
    const ok = M.canPlay(selJ, li), d = li < done, on = li === selL, st = MM('legStars', selJ, li) || [false, false, false];
    const b = el('button', 'leg' + (d ? ' done' : '') + (on ? ' on' : '')); b.type = 'button'; b.disabled = !ok;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const nm = legName(selJ, li), rw = M.legReward(selJ, li);
    b.title = T('m_legOf', li, 3) + ' · ' + nm + (ok ? ' · ' + (d ? T('m_replay') : T('m_reward', rw)) + ' · ' + T('a_stars', starCount(st)) : ' · ' + T('m_locked'));
    b.setAttribute('aria-label', b.title);
    const num = el('i', null, d ? null : nf(li + 1)); if (d) num.appendChild(icon('check')); b.appendChild(num);
    const tx = el('span', 'ltx'); tx.appendChild(el('span', 'lname', nm));
    if (ok) { const lr = el('span', 'lrow'); lr.appendChild(starRow(st, 'lst')); const md = MM('legMedals', selJ, li); if (md) lr.appendChild(medalRow(md, [], false, true)); tx.appendChild(lr); }
    b.appendChild(tx);
    b.onclick = () => { if (!ok) return; selL = li; hook('onSelect', selJ, selL); renderMenu(); };
    row.appendChild(b);
  }
  // v3 Hard tier: once a journey has all 12 medals, a switch next to Launch (faster, tougher, pays ×2)
  const hb = $('hardBtn'), hOpen = !!MM('hardOpen', selJ), hOn = hOpen && !!MM('hardOn', selJ);
  if (hb) {
    hb.hidden = !hOpen;
    if (hOpen) { hb.innerHTML = ''; if (hOn) hb.appendChild(icon('star')); hb.append(T('b_hard')); hb.classList.toggle('on', hOn); hb.setAttribute('aria-pressed', hOn ? 'true' : 'false'); hb.title = T('hd_note'); hb.onclick = () => { MM('setHard', selJ, !hOn); hook('sfx', 'chime'); note(hOn ? T('b_hardOff') : T('hd_note')); renderMenu(); }; }
  }
  $('launchBtn').classList.toggle('hard', hOn);
  $('launchBtn').setAttribute('aria-label', T('b_launch') + ' · ' + jName(selJ) + ' · ' + T('m_legOf', selL, 3) + (hOn ? ' · ' + T('b_hard') : ''));
  boostRow($('boostRow'));
  $('dotMissions').hidden = !(M.missionsReady() > 0 || M.loginReady());
  // duels tile: locked until Mars is done
  const dOpen = !!MM('duelsOpen'), dt = document.querySelector('[data-sheet="duels"]');
  if (dt) {
    dt.classList.toggle('shut', !dOpen); dt.setAttribute('aria-disabled', dOpen ? 'false' : 'true');
    dt.setAttribute('aria-label', T('b_duels') + (dOpen ? '' : ' · ' + T('du_lock')));
    const dd = $('dotDuels'); if (dd) dd.hidden = !duelDot();
  }
  bakeSoon(themeOf(selJ));
}
// today's duel bonus is still there, or a rival is waiting
function duelDot() {
  if (typeof M.duelDot === 'function') return !!MM('duelDot');
  if (!MM('duelsOpen')) return false;
  const L = MM('rivalList') || [];
  return L.some(r => r.open && !r.beaten) || dayFree();
}
function dayFree() { if (typeof M.duelDayFree === 'function') return !!MM('duelDayFree'); const D = MM('data'); return !!D && D.duelDay !== MM('today'); }
// booster chips (over Launch, and in the duel sheet): tap to arm one for the next run
function boostRow(box, showNone) {
  if (!box) return;
  box.innerHTML = '';
  const stock = MM('boosters') || {}, armed = MM('armed') || [];
  const ids = (M.BOOSTERS || []).map(b => b.id).filter(id => (stock[id] || 0) > 0);
  box.hidden = !ids.length && !showNone;
  if (!ids.length) { if (showNone) box.appendChild(el('span', 'hint', T('bo_none'))); return; }
  for (const id of ids) {
    const on = armed.includes(id);
    const b = el('button', 'boost' + (on ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = T('bo_' + id) + ' · ' + T('bo_have', stock[id]); b.setAttribute('aria-label', b.title + ' · ' + T('bo_arm'));
    const cv = mk(48, 48); cv.setAttribute('aria-hidden', 'true'); boostIcon(cv.getContext('2d'), id, 48); b.appendChild(cv);
    b.appendChild(el('small', null, nf(stock[id])));
    b.onclick = () => {
      const ok = MM('setArmed', id, !on);
      if (ok === false) note(T('bo_none')); else { note(T('bo_' + id), 1800, on ? 'x' : 'check'); hook('sfx', 'tick'); }
      document.querySelectorAll('.boosts').forEach(r => boostRow(r, r.dataset.none === '1'));
    };
    box.appendChild(b);
  }
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
  maybeToast();
  if (pendingSheet) { const k = pendingSheet; pendingSheet = null; openSheet(k); } else maybeLogin();
}
export function hideMenus() {
  for (const id of ['menu', 'sheet', 'langPick', 'loginPop', 'over', 'pause']) { const e = $(id); if (e) e.hidden = true; }
  sheetKind = null; stopTips(); stopCount(); rqClose(); dropAnims('menu'); dropAnims('sheet'); dropAnims('over'); avMenuAnim = null;
  const t = $('toast'); if (t) t.hidden = true;
}

// =============================================================================================
// login popup (once per session) + sheets
function loginDays(box) {
  const L = M.login(), gifts = M.LOGIN || [], n = gifts.length || 7; box.innerHTML = '';
  for (let k = 1; k <= n; k++) {
    const d = el('div', (k < L.day || (k === L.day && !L.claimable)) ? 'done' : k === L.day ? 'today' : '');
    d.appendChild(el('span', null, T('lg_day', k)));
    const b = el('b'); b.appendChild(coinIc()); b.append(nf(gifts[k - 1] || 0)); d.appendChild(b);
    if (k === n && (L.booster || n >= 7)) { const cv = mk(32, 32); cv.className = 'lg-bo'; cv.setAttribute('aria-hidden', 'true'); boostIcon(cv.getContext('2d'), 'shield', 32); d.appendChild(cv); }
    box.appendChild(d);
  }
  return L;
}
function loginExtra(box, L) {
  if (!box) return;
  const bits = [];
  if (L.welcome) bits.push(TL('bot_welcome') + ' ' + TT('lg_welcome', '', ''));
  if (L.booster) bits.push(TT('lg_booster', '+ ' + T('bo_' + L.booster), '+ ' + T('bo_' + L.booster)));
  box.hidden = !bits.length; box.textContent = '';
  if (bits.length) { box.appendChild(el('span', 'ai-tag', T('n_nabeeh'))); box.appendChild(el('span', 'ai-txt', bits.join(' · '))); }
}
function maybeLogin() {
  if (loginShown || !M.loginReady()) return;
  loginShown = true;
  const L = loginDays($('loginDays'));
  loginExtra($('loginBot'), L);
  const btn = $('loginClaim'); btn.textContent = T('lg_claim', L.gift);
  btn.onclick = () => { const got = M.claimLogin(); $('loginPop').hidden = true; if (got) { note(plusCoins(got)); hook('sfx', 'chime'); } renderMenu(); };
  $('loginPop').hidden = false;
  if (kbd) try { btn.focus({ preventScroll: true }); } catch (e) {}
}
const SHEETS = {
  hangar: ['hg_title', sheetHangar], costumes: ['cs_title', sheetCostumes], missions: ['ms_title', sheetMissions], duels: ['du_title', sheetDuels],
  badges: ['bg_title', sheetBadges], help: ['help_title', sheetHelp],
};
const SHEET_ALIAS = { suits: 'costumes', wardrobe: 'costumes', shop: 'hangar' };
export function openSheet(kind) {
  kind = SHEET_ALIAS[kind] || kind;
  const S2 = SHEETS[kind]; if (!S2) return;
  if (kind === 'duels' && !MM('duelsOpen')) { note(T('du_lock'), 2600); return; }
  const body = $('sheetBody'), same = kind === sheetKind, keep = same ? body.scrollTop : 0, wasOpen = !$('sheet').hidden;
  if (!wasOpen) { sheetFrom = document.querySelector('[data-sheet="' + kind + '"]'); hideNote(); }
  dropAnims('sheet'); sheetKind = kind; body.innerHTML = ''; $('sheet').hidden = false; syncCoins();
  $('sheetTitle').textContent = T(S2[0]);
  if (!wasOpen) { hangTab = 'up'; dr = null; }
  S2[1](body);
  body.scrollTop = keep;
  if (!wasOpen && kbd) try { $('sheetClose').focus({ preventScroll: true }); } catch (e) {}
}
export function closeSheet() {
  const k = sheetKind;
  $('sheet').hidden = true; sheetKind = null; dropAnims('sheet');
  if (!$('menu').hidden) renderMenu();
  const back = sheetFrom || document.querySelector('[data-sheet="' + k + '"]'); sheetFrom = null;
  if (kbd && back && back.isConnected) try { back.focus({ preventScroll: true }); } catch (e) {}
  else { const ae = document.activeElement; if (ae && ae.blur && ae !== document.body) ae.blur(); }
}
function card(draw, name, sub, btn, cls) {
  const c = el('div', 'card' + (cls ? ' ' + cls : '')); const cnv = mk(192, 192); cnv.setAttribute('aria-hidden', 'true'); c.appendChild(cnv);
  if (draw) draw(cnv);
  c.appendChild(el('b', null, name)); if (sub) c.appendChild(el('small', null, sub));
  if (btn) c.appendChild(cardBtn(btn));
  return c;
}
function cardBtn(btn) {
  const b = el('button', btn.cls || ''); b.type = 'button'; b.disabled = !!btn.disabled;
  if (btn.price != null) { b.appendChild(coinIc()); b.append(nf(btn.price)); b.setAttribute('aria-label', btn.text); } else b.textContent = btn.text;
  if (btn.onClick) b.onclick = btn.onClick;
  return b;
}
// a short line under a sheet's buttons: what happened
function bought() { note(T('bought')); hook('sfx', 'chime'); }

// ---- hangar (Usta): Upgrades / Boosters ----
const TRICK = '✦';
// the ✦ tricks (DESIGN §6): level -> trick id (name = tr_<id>)
const TRICKS = { blaster: [[5, 'pierce']], hull: [[5, 'regen']], shield: [[4, 'shieldBlast']], engine: [[3, 'nearMiss']], magnet: [[3, 'pullPickups']], nabeeh: [[2, 'warn'], [4, 'intercept'], [5, 'double']] };
const noTrick = s => String(s == null ? '' : s).split(' · ').filter(p => !p.trim().startsWith(TRICK)).join(' · ');
const trickName = k => TT('tr_' + k, k, k);
const trickLine = name => keyIsFn('up_trick') ? T('up_trick', name) : TRICK + ' ' + name;
// v3.2 hangar: the same stage + choices layout as the suits picker. Tap an upgrade (or booster) tile, read it on the
// stage, buy with the one button. Fits on a phone in landscape without scrolling.
let hangSel = null, boostSel = null;
function sheetHangar(body) {
  const rec = MM('recommend');
  if (!ustaLine) { const tip = MM('ustaTip'); ustaLine = tip && Math.random() < 0.6 ? T('usta_tip', T('cs_' + tip)).replace(/^[^:]+:\s*/, '') : TL('usta_lines'); }
  const wrap = el('div', 'dr hg');
  // ---- stage ----
  const stage = el('div', 'dr-stage');
  const sc = mk(400, 200); sc.className = 'dr-cv hg-cv'; sc.setAttribute('aria-hidden', 'true'); stage.appendChild(sc);
  const L = shipLook(), boostTab = hangTab === 'boost', gi = mk(88, 88);
  const bos = M.BOOSTERS || [], stock = MM('boosters') || {};
  if (!hangSel || !M.UPGRADES.some(u => u.id === hangSel)) hangSel = rec || M.UPGRADES[0].id;
  if (!boostSel || !bos.some(b => b.id === boostSel)) boostSel = bos[0] && bos[0].id;
  addAnim(sc, t => {
    const c = sc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 400, 200);
    const g = c.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, '#231a52'); g.addColorStop(1, '#0f0b24'); c.fillStyle = g; c.fillRect(0, 0, 400, 200);
    for (let i = 0; i < 26; i++) { const s2 = STARS[i], x = ((s2.x * 400 - t * (40 + s2.r * 60)) % 400 + 400) % 400; c.globalAlpha = 0.35 + s2.r * 0.3; c.fillStyle = '#fff'; c.fillRect(x, s2.y * 200, 2 + s2.r * 5, 1.5); }
    c.globalAlpha = 1;
    const bob = REDUCED ? 0 : Math.sin(t * 1.6) * 3;
    c.save(); c.translate(140, 104 + bob); c.scale(1.8, 1.8);
    art('drawShip', c, 0, 0, Object.assign({}, L, { t, tilt: REDUCED ? 0 : Math.sin(t * 1.6) * 0.2, thrust: 0.8, hurt: 0, shield: L.shieldCd > 0 ? 0.3 : 0, beam: false }));
    c.restore();
    // the selected upgrade / booster glyph, big, at the side
    const gx = gi.getContext('2d');
    if (boostTab) { if (boostSel) boostIcon(gx, boostSel, 88, 0.4 + t * 0.2); } else upIcon(gx, hangSel, 88, t);
    c.save(); c.fillStyle = '#1d1640'; c.strokeStyle = '#1c1530'; c.lineWidth = 4; rr(c, 286, 46, 96, 96, 18); c.fill(); c.stroke();
    c.beginPath(); rr(c, 288, 48, 92, 92, 16); c.clip(); c.drawImage(gi, 290, 50, 88, 88); c.restore();
    c.save(); c.strokeStyle = 'rgba(47,212,230,.45)'; c.lineWidth = 2; rr(c, 286, 46, 96, 96, 18); c.stroke(); c.restore();
  }, 'sheet');
  const lvN = MM('shipLevel') ?? MM('totalLevels') ?? 0;
  const info = el('div', 'dr-info'), cta = el('div', 'dr-cta');
  if (!boostTab) {
    const u = M.UPGRADES.find(x => x.id === hangSel), lv = M.level(u.id), max = u.max, price = M.nextPrice(u.id), can = M.canBuy(u.id), isMax = price == null;
    const nm = el('b'); nm.append(T('up_' + u.id)); const pips = el('span', 'pips'); pips.setAttribute('role', 'img'); pips.setAttribute('aria-label', T('up_lv', lv, max));
    for (let k = 0; k < max; k++) pips.appendChild(el('i', k < lv ? 'on' : '')); nm.appendChild(pips); info.appendChild(nm);
    const eff = el('small', 'hg-eff');
    if (isMax) eff.append(noTrick(upText(u.id, lv))); else { eff.appendChild(el('em', null, noTrick(upText(u.id, lv)))); eff.appendChild(icon('arrow', 'dir')); eff.appendChild(el('b', null, noTrick(upText(u.id, lv + 1)))); }
    info.appendChild(eff);
    const tr = TRICKS[u.id] || [], next = tr.find(o => o[0] > lv), got = tr.filter(o => o[0] <= lv).map(o => trickName(o[1]));
    if (next) info.appendChild(withIc('spark', trickLine(trickName(next[1])).replace(TRICK, '').trim() + ' · ' + T('up_lv', next[0], max), 'trick'));
    else if (got.length) info.appendChild(withIc('spark', got.join(' · '), 'trick got'));
    const b = cardBtn(isMax ? { text: T('up_max'), cls: 'sec', disabled: true } : { text: T('up_buy', price), price, disabled: !can, onClick: () => {
      const r = M.buyUpgrade(u.id) || {};
      if (r.ok) { bought(); ustaLine = TL('usta_buy'); hook('onBuy', u.id); } else if (r.reason === 'max') ustaLine = TL('usta_max'); else { note(T('notEnough')); ustaLine = TL('usta_poor'); }
      openSheet('hangar');
    } });
    b.classList.add('dr-go'); if (!isMax) b.setAttribute('aria-label', T('up_buy', price) + ' · ' + T('up_' + u.id)); cta.appendChild(b);
  } else if (boostSel) {
    const bo = bos.find(x => x.id === boostSel), have = stock[bo.id] || 0;
    const nm = el('b', null, T('bo_' + bo.id)); nm.appendChild(el('em', 'hg-have', T('bo_have', have))); info.appendChild(nm);
    info.appendChild(el('small', null, T('bo_' + bo.id + '_d')));
    const b = cardBtn({ text: T('buy', bo.price), price: bo.price, disabled: M.coins() < bo.price, onClick: () => {
      const r = MM('buyBooster', bo.id) || {};
      if (r.ok) { bought(); ustaLine = TL('usta_buy'); } else { note(T('notEnough')); ustaLine = TL('usta_poor'); }
      openSheet('hangar');
    } });
    b.classList.add('dr-go'); cta.appendChild(b);
  }
  stage.appendChild(info); stage.appendChild(cta);
  wrap.appendChild(stage);
  // ---- side: tabs, Usta, tiles ----
  const side = el('div', 'dr-side');
  const tabs = el('div', 'dr-steps two'); tabs.setAttribute('role', 'tablist');
  for (const [id, key] of [['up', 'hg_tabUp'], ['boost', 'hg_tabBoost']]) {
    const b = el('button', 'dr-step' + (hangTab === id ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', hangTab === id ? 'true' : 'false');
    b.appendChild(el('span', null, T(key)));
    if (id === 'boost') { const n = Object.values(stock).reduce((a, v) => a + (+v || 0), 0); if (n) b.appendChild(el('i', null, nf(n))); }
    b.onclick = () => { if (hangTab === id) return; hangTab = id; openSheet('hangar'); };
    tabs.appendChild(b);
  }
  side.appendChild(tabs);
  const say = el('div', 'hg-say'), uc = mk(80, 80); uc.setAttribute('aria-hidden', 'true'); say.appendChild(uc);
  { const c = uc.getContext('2d'); c.save(); c.scale(0.8, 0.8); if (!art('drawUsta', c, 50, 97, 0.9, 0.5)) { c.fillStyle = '#e9b330'; rr(c, 28, 24, 44, 66, 8); c.fill(); } c.restore(); }
  const st = el('p'); st.appendChild(el('b', null, T('n_usta') + ': ')); st.append(ustaLine);
  if (rec && !boostTab) { st.append(' · '); st.appendChild(el('span', 'say-rec', T('up_rec') + ': ' + T('up_' + rec))); }
  say.appendChild(st); side.appendChild(say);
  const grid = el('div', 'hg-grid' + (boostTab ? ' bo' : '')); grid.setAttribute('role', 'listbox');
  if (!boostTab) for (const u of M.UPGRADES) {
    const lv = M.level(u.id), price = M.nextPrice(u.id), isMax = price == null, can = M.canBuy(u.id), on = u.id === hangSel;
    const b = el('button', 'hg-tile' + (on ? ' sel' : '') + (isMax ? ' max' : '') + (u.id === rec ? ' rec' : '') + (can ? ' can' : '')); b.type = 'button';
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.setAttribute('aria-label', T('up_' + u.id) + ' · ' + T('up_lv', lv, u.max));
    const ic = mk(72, 72); ic.setAttribute('aria-hidden', 'true'); upIcon(ic.getContext('2d'), u.id, 72, 0); b.appendChild(ic);
    const lb = el('span', 'hg-lv'); for (let k = 0; k < u.max; k++) lb.appendChild(el('i', k < lv ? 'on' : '')); b.appendChild(lb);
    if (u.id === rec) { const m = el('em', 'hg-rec'); m.appendChild(icon('star')); b.appendChild(m); }
    else if (can) b.appendChild(el('em', 'hg-can'));
    b.onclick = () => { hangSel = u.id; hook('sfx', 'tick'); openSheet('hangar'); };
    grid.appendChild(b);
  }
  else for (const bo of bos) {
    const have = stock[bo.id] || 0, on = bo.id === boostSel;
    const b = el('button', 'hg-tile' + (on ? ' sel' : '')); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.setAttribute('aria-label', T('bo_' + bo.id) + ' · ' + T('bo_have', have));
    const ic = mk(72, 72); ic.setAttribute('aria-hidden', 'true'); boostIcon(ic.getContext('2d'), bo.id, 72); b.appendChild(ic);
    b.appendChild(el('span', 'hg-n', '×' + nf(have)));
    b.onclick = () => { boostSel = bo.id; hook('sfx', 'tick'); openSheet('hangar'); };
    grid.appendChild(b);
  }
  side.appendChild(grid);
  side.appendChild(el('p', 'hint hg-foot', boostTab ? T('bo_arm') : TT('a_shipLv', 'مستوى السفينة ' + nf(lvN), 'Ship level ' + nf(lvN), lvN)));
  wrap.appendChild(side);
  body.appendChild(wrap);
}
// ---- costumes: character picker, colours, perk costumes, ship paint ----
function srcText(src, st) {
  if (!src) return '';
  const pr = st && st.progress;
  if (src.type === 'rival') return T('cs_src_rival', rvName(src.id));
  if (src.type === 'ladder') return T('cs_src_ladder', src.lv);
  if (src.type === 'badge' && /^stars\d+$/.test(src.id || '')) return T('cs_src_stars', pr ? pr[0] : (MM('starTotal') || 0), pr ? pr[1] : +src.id.slice(5));
  if (src.type === 'badge') return T('cs_src_badge', T('bg_' + src.id));
  return '';
}
// v3.2 guided picker: three steps (pilot, suit, ship). A tap on a choice previews it on the big stage; one button
// under the stage wears, buys or explains the lock. Nothing stacks, so the sheet never scrolls.
let dr = null;
function drItems(step, group, ch) {
  const all = COSTUMES(), fits = id => { const f = MM('costumeFits', id, ch); return f == null ? true : !!f; };
  if (step === 'pilot') return (M.CHARS || ['abood', 'mozah']).map(id => {
    const locked = id === 'mozah' && MM('girlOpen') === false, need = M.GIRL_MISSIONS || 10, have = Math.min(MM('missionsDone') || 0, need);
    return { id, name: T('ch_' + id), on: id === ch, locked, why: locked ? T('ch_lock', have, need) : '', prog: locked ? have / need : null,
      act: id === ch ? null : locked ? null : { text: T('ch_pick'), go: () => pickChar(id) } };
  });
  if (step === 'suit' && group === 'color') {
    const worn = costumeOf(ch);
    return all.filter(c => (c.kind ? c.kind === 'color' : !c.perk && !c.price) && fits(c.id)).map(C => ({ id: C.id, name: T('cs_' + C.id), sub: T('free'), on: C.id === worn,
      act: C.id === worn ? null : { text: T('wear'), go: () => drWear(C.id, ch) } }));
  }
  if (step === 'suit') return all.filter(c => (c.kind ? c.kind === 'perk' : !!c.perk)).map(C => {
    const st = MM('costumeState', C.id) || { owned: M.ownsSuit && M.ownsSuit(C.id), wearing: costumeOf(ch) === C.id, price: C.price, src: C.src || { type: 'coins' } };
    const src = st.src || C.src || { type: 'coins' }, owned = !!st.owned, on = !!st.wearing, locked = !owned && (st.locked != null ? !!st.locked : src.type !== 'coins');
    const price = st.price != null ? st.price : C.price;
    let act = null;
    if (!on && owned) act = { text: T('wear'), go: () => drWear(C.id, ch) };
    else if (!on && !locked) act = { text: T('buy', price), price, disabled: M.coins() < price, go: () => {
      const r = (MM('buyCostume', C.id) ?? MM('buySuit', C.id)) || {};
      if (r.ok) { bought(); hook('onChar', ch); } else note(T(r.reason === 'locked' ? 'bg_locked' : 'notEnough'));
      openSheet('costumes');
    } };
    const warn = (st.warn ?? (C.id === 'link' && M.level('nabeeh') < 1)) ? T('cs_linkNote') : '';
    return { id: C.id, name: T('cs_' + C.id), sub: T('cp_' + C.id) + (warn ? ' · ' + warn : ''), on, locked, perk: true,
      why: locked ? srcText(src, st) : '', prog: locked && st.progress && st.progress[1] ? st.progress[0] / st.progress[1] : null, act };
  });
  // ship paint (shared by both pilots)
  const curSkin = idOf(MM('skin')) || 'falak';
  return (M.SKINS || []).map(S => {
    const ss = MM('skinState', S.id), owned = ss ? !!ss.owned : (!!MM('ownsSkin', S.id) || S.id === 'falak'), on = ss ? !!ss.wearing : S.id === curSkin;
    return { id: S.id, name: T('sk_' + S.id), on, locked: !owned, why: owned ? '' : srcText(S.src || { type: 'free' }), ship: true,
      act: on || !owned ? null : { text: T('paint'), go: () => { if (MM('wearSkin', S.id)) { hook('sfx', 'chime'); hook('onChar', ch); } openSheet('costumes'); } } };
  });
}
function drWear(id, ch) { if (MM('wearCostume', id) ?? MM('wearSuit', id)) { hook('sfx', 'chime'); hook('onChar', ch); } openSheet('costumes'); }
function sheetCostumes(body) {
  const ch0 = CHAR();
  if (!dr) dr = { step: 'pilot', group: 'color', sel: { pilot: ch0 } };
  const ch = CHAR(), step = dr.step;
  const items = drItems(step, dr.group, ch);
  let it = items.find(x => x.id === dr.sel[step + (step === 'suit' ? dr.group : '')]) || items.find(x => x.on) || items[0];
  if (step === 'suit' && dr.group === 'color' && !items.length) { dr.group = 'perk'; openSheet('costumes'); return; }
  const key = step + (step === 'suit' ? dr.group : ''); if (it) dr.sel[key] = it.id;
  const wrap = el('div', 'dr');
  // ---- stage: live preview + the one action ----
  const stage = el('div', 'dr-stage'), cv = mk(400, 250); cv.className = 'dr-cv'; cv.setAttribute('aria-hidden', 'true'); stage.appendChild(cv);
  const pilot = step === 'pilot' && it ? it.id : ch;
  const suit = step === 'suit' && it ? it.id : costumeOf(pilot);
  const skin = step === 'ship' && it ? it.id : (idOf(MM('skin')) || 'falak');
  const L = shipLook(), shipFocus = step === 'ship';
  addAnim(cv, t => {
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 400, 250);
    const g = c.createLinearGradient(0, 0, 0, 250); g.addColorStop(0, '#231a52'); g.addColorStop(1, '#0f0b24'); c.fillStyle = g; c.fillRect(0, 0, 400, 250);
    stars(c, 400, 250, t, 30, 0.8);
    c.fillStyle = 'rgba(47,212,230,.10)'; c.beginPath(); c.ellipse(shipFocus ? 200 : 140, 236, shipFocus ? 150 : 90, 12, 0, 0, TAU); c.fill();
    const bob = REDUCED ? 0 : Math.sin(t * 1.6) * 4, look = Object.assign({}, L, { t, tilt: REDUCED ? 0 : Math.sin(t * 1.6) * 0.18, thrust: 0.8, hurt: 0, shield: 0, beam: false, skin, char: pilot, costume: suit, suit });
    if (it && it.locked) c.filter = 'grayscale(.85) brightness(.7)';
    c.save(); c.translate(shipFocus ? 215 : 300, shipFocus ? 112 + bob : 92 + bob); const k = shipFocus ? 2.15 : 1.25; c.scale(k, k); art('drawShip', c, 0, 0, look); c.restore();
    c.save(); if (shipFocus) { c.globalAlpha = 0.9; if (!astro(c, 56, 238, 1.05, { t, char: pilot, costume: suit, pose: 'wave' })) astroFallback(c, 52, 240); }
    else if (!astro(c, 140, 240, 2.35, { t, char: pilot, costume: suit, pose: it && it.on ? 'wave' : 'stand' })) astroFallback(c, 140, 240);
    c.restore(); c.filter = 'none';
  }, 'sheet');
  const info = el('div', 'dr-info');
  if (it) {
    const nm = el('b', null, it.name); if (it.on) nm.appendChild(icon('check')); info.appendChild(nm);
    const sub = it.locked ? it.why : it.on ? T(step === 'pilot' ? 'ch_playing' : step === 'ship' ? 'cs_nowShip' : 'cs_nowWearing') : it.sub || '';
    if (sub) info.appendChild(el('small', it.locked ? 'why' : '', sub));
    if (it.prog != null) info.appendChild(progBar(it.prog));
  }
  stage.appendChild(info);
  const cta = el('div', 'dr-cta');
  if (it && it.act) { const b = cardBtn({ text: it.act.text, price: it.act.price, disabled: it.act.disabled, cls: it.act.price != null ? '' : 'sec', onClick: it.act.go }); b.classList.add('dr-go'); cta.appendChild(b); }
  else if (it && it.locked) cta.appendChild(withIc('lock', T('bg_locked'), 'dr-lockline'));
  stage.appendChild(cta);
  wrap.appendChild(stage);
  // ---- side: steps, group switch, the row of choices, next ----
  const side = el('div', 'dr-side');
  const steps = el('div', 'dr-steps'); steps.setAttribute('role', 'tablist');
  [['pilot', 'cs_step1'], ['suit', 'cs_step2'], ['ship', 'cs_step3']].forEach(([id, k], i) => {
    const b = el('button', 'dr-step' + (id === step ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', id === step ? 'true' : 'false');
    b.appendChild(el('i', null, nf(i + 1))); b.appendChild(el('span', null, T(k)));
    b.onclick = () => { if (dr.step !== id) { dr.step = id; openSheet('costumes'); } };
    steps.appendChild(b);
  });
  side.appendChild(steps);
  if (step === 'suit') {
    const sg = el('div', 'dr-groups');
    for (const [g, k] of [['color', 'cs_free'], ['perk', 'cs_special']]) {
      const b = el('button', 'dr-group' + (dr.group === g ? ' on' : ''), T(k)); b.type = 'button'; b.setAttribute('aria-pressed', dr.group === g ? 'true' : 'false');
      b.onclick = () => { if (dr.group !== g) { dr.group = g; openSheet('costumes'); } };
      sg.appendChild(b);
    }
    side.appendChild(sg);
  }
  const strip = el('div', 'dr-strip' + (step === 'ship' ? ' wide' : '')); strip.setAttribute('role', 'listbox'); dragScroll(strip);
  items.forEach((x, i) => {
    const b = el('button', 'dr-opt' + (x === it ? ' sel' : '') + (x.on ? ' on' : '') + (x.locked ? ' locked' : '')); b.type = 'button';
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', x === it ? 'true' : 'false'); b.setAttribute('aria-label', x.name + (x.on ? ' · ' + T('wearing') : x.locked ? ' · ' + T('bg_locked') : ''));
    const pc = step === 'ship' ? mk(160, 100) : mk(120, 120); pc.setAttribute('aria-hidden', 'true'); b.appendChild(pc);
    setTimeout(() => {
      if (step === 'ship') drawCardPic(pc, 'skin', x.id, x.locked);
      else if (step === 'suit') costumePic(pc.getContext('2d'), x.id, ch, 120);
      else { const c = pc.getContext('2d'); c.save(); c.scale(120 / 200, 120 / 200); if (!astro(c, 100, 196, 2.5, { t: 0.4, char: x.id, costume: costumeOf(x.id), pose: 'stand' })) astroFallback(c, 100, 190); c.restore(); }
    }, 10 + i * 12);
    if (x.on) { const m = el('em', 'dr-on'); m.appendChild(icon('check')); b.appendChild(m); }
    else if (x.locked) { const m = el('em', 'dr-lk'); m.appendChild(icon('lock')); b.appendChild(m); }
    b.appendChild(el('span', null, x.name));
    b.onclick = () => { if (strip.moved) return; dr.sel[key] = x.id; hook('sfx', 'tick'); openSheet('costumes'); };
    strip.appendChild(b);
  });
  side.appendChild(strip);
  const foot = el('div', 'dr-foot');
  foot.appendChild(el('p', 'hint', T('cs_pickHint')));
  const nx = el('button', 'btn alt small dr-next'); nx.type = 'button';
  const last = step === 'ship';
  nx.textContent = last ? T('cs_done') : T('cs_next');
  nx.onclick = () => { if (last) { closeSheet(); return; } dr.step = step === 'pilot' ? 'suit' : 'ship'; openSheet('costumes'); };
  foot.appendChild(nx);
  side.appendChild(foot);
  wrap.appendChild(side);
  body.appendChild(wrap);
  // keep the chosen card in view
  requestAnimationFrame(() => { const sel = strip.querySelector('.sel'); if (sel && sel.scrollIntoView) try { sel.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} });
}
function pickChar(id) {
  if (!MM('setChar', id)) { note(T('bg_locked')); return; }
  setGirl(id === 'mozah'); safeCall(applyI18n);
  hook('sfx', 'chime'); hook('onChar', id);
  ustaLine = '';
  relang();
  if (sheetKind !== 'costumes') openSheet('costumes');
}

// ---- missions: the ladder, today's three, the login gift ----
function sheetMissions(body) {
  const L = MM('ladder');
  if (L && Array.isArray(L.missions)) {
    const head = el('div', 'ladder-head');
    head.appendChild(el('p', 'sec-title', T('ld_title', L.lv)));
    const mp = el('span', 'multpill'); mp.setAttribute('dir', 'ltr');
    mp.append('×' + nf(L.mult)); if (L.nextMult != null && L.nextMult > L.mult) { mp.appendChild(el('b', null, ' → ')); mp.append('×' + nf(L.nextMult)); }
    mp.setAttribute('aria-label', T('ld_mult', L.mult));
    head.appendChild(mp); body.appendChild(head);
    body.appendChild(el('p', 'hint', T('ld_note', L.mult, L.nextMult, L.reward)));
    L.missions.forEach((m, i) => {
      const row = el('div', 'mission ladder' + (m.done ? ' done' : ''));
      const tx = el('div'); tx.appendChild(el('b', null, T('lm_' + m.kind, m.goal))); tx.appendChild(el('br'));
      tx.appendChild(el('small', null, m.done ? T('ld_wait') : T('ms_prog', Math.min(m.progress, m.goal), m.goal)));
      row.appendChild(tx);
      const b = el('button', 'skip'); b.type = 'button';
      if (m.done) { b.innerHTML = svgI('check'); b.disabled = true; b.setAttribute('aria-label', T('ms_done')); }
      else {
        b.textContent = T('ld_skip', L.skipPrice); b.disabled = M.coins() < L.skipPrice;
        b.onclick = () => { if (MM('skipLadder', i)) { hook('sfx', 'tick'); openSheet('missions'); } else note(T('notEnough')); };
      }
      row.appendChild(b);
      row.appendChild(progBar(m.progress / Math.max(1, m.goal)));
      body.appendChild(row);
    });
  }
  body.appendChild(el('p', 'sec-title', T('ms_daily')));
  const bonus = MM('dailyBonus') ?? Math.round((M.DAILY_BONUS || 0) * (MM('dailyScale') || 1));
  body.appendChild(el('p', 'hint', T('ms_note') + ' · ' + T('ms_bonus', bonus)));
  M.missions().forEach((m, i) => {
    const ready = !m.claimed && m.progress >= m.goal;
    const row = el('div', 'mission' + (ready ? ' done' : '') + (m.claimed ? ' claimed' : ''));
    const tx = el('div'); tx.appendChild(el('b', null, T('ms_' + m.kind, m.goal))); tx.appendChild(el('br')); tx.appendChild(el('small', null, T('bg_reward', m.reward)));
    row.appendChild(tx);
    const b = el('button'); b.type = 'button';
    if (m.claimed) { b.textContent = T('claimed'); b.disabled = true; }
    else if (ready) { b.appendChild(coinIc()); b.append(T('claim')); b.onclick = () => { const got = M.claimMission(i); if (got) { note(plusCoins(got)); hook('sfx', 'chime'); } openSheet('missions'); }; }
    else { b.textContent = T('ms_prog', m.progress, m.goal); b.disabled = true; }
    row.appendChild(b);
    row.appendChild(progBar(m.progress / Math.max(1, m.goal)));
    body.appendChild(row);
  });
  // login gift
  const box = el('div', 'login-box'), headR = el('div', 'login-head');
  const Lg = M.login();
  const tl = el('div'); tl.appendChild(el('b', null, T('lg_title'))); if (Lg.streak > 1) { tl.append(' · '); tl.appendChild(el('small', null, T('lg_streak', Lg.streak))); }
  headR.appendChild(tl);
  if (Lg.claimable) {
    const b = el('button', 'btn alt small'); b.type = 'button'; b.textContent = T('lg_claim', Lg.gift);
    b.onclick = () => { const got = M.claimLogin(); if (got) { note(plusCoins(got)); hook('sfx', 'chime'); } openSheet('missions'); };
    headR.appendChild(b);
  } else headR.appendChild(el('small', null, T('lg_done')));
  box.appendChild(headR);
  const days = el('div', 'login-days'); loginDays(days); box.appendChild(days);
  body.appendChild(box);
}

// ---- duels: the rogue robot ships ----
function startDuelUI(rid) {
  pendingDuel = rid; duelOn = null;
  bakeSoon(themeOf((rivalDef(rid) || {}).theme));
  const r = hook('onDuel', rid);
  if (typeof H.onDuel !== 'function') { console.warn('ui: no onDuel hook'); pendingDuel = null; return; }
  if (r === false || (r && r.ok === false)) {
    pendingDuel = null;
    note(r && r.reason === 'coins' ? T('notEnough') : T('bg_locked'));
  }
}
function unlockPic(cnv, u) {
  if (!u) return;
  const c = cnv.getContext('2d');
  if (u.kind === 'skin') drawCardPic(cnv, 'skin', u.id, false);
  else costumePic(c, u.id, CHAR(), cnv.width);
}
// v3.2 duels on the stage layout: the chosen rival big on the stage with its fight button; all rivals in one row
let duelSel = null;
function sheetDuels(body) {
  const free = dayFree(), list = MM('rivalList') || [];
  if (!duelSel || !list.some(r => r.id === duelSel)) { const f = list.find(r => r.open && !r.beaten) || list.filter(r => r.open).pop() || list[0]; duelSel = f && f.id; }
  const k0 = list.findIndex(r => r.id === duelSel), r = list[k0] || {}, R = rivalDef(r.id) || {}, open = !!r.open, beaten = !!r.beaten;
  const wrap = el('div', 'dr du');
  // ---- stage ----
  const stage = el('div', 'dr-stage');
  const cnv = mk(400, 250); cnv.className = 'dr-cv'; cnv.setAttribute('aria-hidden', 'true'); stage.appendChild(cnv);
  setTimeout(() => drawCardPic(cnv, 'rival', r.id, !open, beaten ? 'fixed' : 'angry'), 20);
  const info = el('div', 'dr-info');
  const nm = el('b', null, open || beaten ? rvName(r.id) : (lang() === 'ar' ? '؟؟؟' : '???')); if (beaten) nm.appendChild(icon('check'));
  if (open) nm.appendChild(el('em', 'du-t', T('rv_' + r.id + '_t')));
  info.appendChild(nm);
  if (open) info.appendChild(el('small', 'du-q', '«' + (beaten ? T('rv_' + r.id + '_fixed') : TL('rv_' + r.id + '_taunt')) + '»'));
  else { const prev = list[k0 - 1], needName = !r.needDone ? jName(R.need || 'mars') : prev ? rvName(prev.id) : ''; info.appendChild(el('small', 'why', T('du_lockNext', needName))); }
  const meta = el('div', 'rv-meta');
  const df = el('span', 'diff'); df.setAttribute('role', 'img'); df.setAttribute('aria-label', T('du_diff') + ' ' + nf(r.diff || R.diff || 1) + '/5');
  df.appendChild(el('em', null, T('du_diff'))); for (let i = 0; i < 5; i++) df.appendChild(el('i', i < (r.diff || R.diff || 1) ? 'on' : '')); meta.appendChild(df);
  if (open) { const sr3 = starRow(r.stars, 'stars3 sm'); sr3.setAttribute('aria-hidden', 'false'); sr3.setAttribute('role', 'img'); sr3.setAttribute('aria-label', T('a_stars', starCount(r.stars))); meta.appendChild(sr3); }
  if (open && r.best) meta.appendChild(el('span', 'rv-best', T('du_best', r.best))); else if (open && (r.par || R.par)) meta.appendChild(el('span', 'rv-best', T('du_par', r.par || R.par)));
  info.appendChild(meta);
  stage.appendChild(info);
  const cta = el('div', 'dr-cta du-cta');
  if (open) {
    const rw = el('div', 'rv-rew'); rw.appendChild(coinIc()); rw.append(nf(beaten ? r.rematchReward : r.firstReward)); if (free) rw.appendChild(el('em', 'x2', '×2'));
    if (!beaten && r.unlock) { const uc = mk(64, 64); uc.className = 'rv-unl'; uc.setAttribute('aria-hidden', 'true'); setTimeout(() => unlockPic(uc, r.unlock), 40); rw.appendChild(uc); }
    rw.title = beaten ? T('du_reward', r.rematchReward) : T('du_reward', r.firstReward) + (r.unlock ? ' · ' + T('du_unlock') : ''); rw.setAttribute('aria-label', rw.title);
    cta.appendChild(rw);
    const b = el('button', 'dr-go' + (beaten ? ' sec' : '')); b.type = 'button'; b.textContent = beaten ? rematchText() : T('du_fight'); b.onclick = () => startDuelUI(r.id); cta.appendChild(b);
  } else cta.appendChild(withIc('lock', T('bg_locked'), 'dr-lockline'));
  stage.appendChild(cta);
  wrap.appendChild(stage);
  // ---- side ----
  const side = el('div', 'dr-side');
  const head = el('div', 'hg-say du-say'); const sp = el('p'); sp.appendChild(el('b', null, T('n_usta') + ': ')); sp.append(T('du_note')); head.appendChild(sp);
  head.appendChild(free ? el('span', 'day-chip on', T('du_day')) : withIc('check', T('du_day'), 'day-chip used'));
  side.appendChild(head);
  const br = el('div', 'boosts in-sheet'); br.dataset.none = '1'; br.setAttribute('role', 'group'); br.setAttribute('aria-label', T('bo_title')); boostRow(br, true);
  const bw = el('div', 'boost-line'); bw.appendChild(el('span', 'label', T('bo_title'))); bw.appendChild(br); side.appendChild(bw);
  const strip = el('div', 'dr-strip wide du-strip'); strip.setAttribute('role', 'listbox'); dragScroll(strip);
  list.forEach((x, k) => {
    const b = el('button', 'dr-opt' + (x.id === duelSel ? ' sel' : '') + (x.beaten ? ' on' : '') + (x.open ? '' : ' locked')); b.type = 'button';
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', x.id === duelSel ? 'true' : 'false');
    b.setAttribute('aria-label', nf(k + 1) + ' · ' + (x.open || x.beaten ? rvName(x.id) : T('bg_locked')));
    const pc = mk(160, 100); pc.setAttribute('aria-hidden', 'true'); b.appendChild(pc); setTimeout(() => drawCardPic(pc, 'rival', x.id, !x.open, x.beaten ? 'fixed' : 'angry'), 30 + k * 25);
    b.appendChild(el('em', 'du-n', nf(k + 1)));
    if (x.beaten) { const m = el('em', 'dr-on'); m.appendChild(icon('check')); b.appendChild(m); } else if (!x.open) { const m = el('em', 'dr-lk'); m.appendChild(icon('lock')); b.appendChild(m); }
    b.appendChild(el('span', null, x.open || x.beaten ? rvName(x.id) : (lang() === 'ar' ? '؟؟؟' : '???')));
    b.onclick = () => { if (strip.moved) return; duelSel = x.id; hook('sfx', 'tick'); openSheet('duels'); };
    strip.appendChild(b);
  });
  side.appendChild(strip);
  wrap.appendChild(side);
  body.appendChild(wrap);
  requestAnimationFrame(() => { const sel = strip.querySelector('.sel'); if (sel && sel.scrollIntoView) try { sel.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} });
  const firstOpen = list.find(x => x.open && !x.beaten); if (firstOpen) bakeSoon(themeOf((rivalDef(firstOpen.id) || {}).theme));
}
// Rematches are free (owner decision): "Rematch" with no price
function rematchText() { const s = T('du_rematch'); return !s || s === 'du_rematch' || /undefined|NaN/.test(s) ? TT('b_rematch', 'عيدها', 'Rematch') : s; }

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
    const chip = el('span', 'tier', b.tiered ? (b.done ? T('tier_all') : b.tier > 0 ? T('tier_' + (b.tier - 1)) : T('tier_none')) : (b.done ? null : T('bg_locked'))); if (!b.tiered && b.done) chip.appendChild(icon('check'));
    cc.appendChild(chip);
    if (!b.done && b.tiered) {
      cc.appendChild(progBar(b.progress / Math.max(1, b.goal)));
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
    const L = shipLook();
    const ship = (x, y, o = {}) => art('drawShip', c, x, y, Object.assign({}, L, { t, tier: 0, guns: 1, tilt: 0, thrust: 0.7, aura: null }, o)) || (c.fillStyle = '#f4f1ea', c.beginPath(), c.ellipse(x, y, 16, 7, 0, 0, TAU), c.fill());
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
    } else if (kind === 'gates') {
      art('drawUsta', c, 30, 70, 0.6, t);
      c.fillStyle = '#ffd45a'; c.font = '800 13px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LV 12', 70, 30);
      c.strokeStyle = '#ffd45a'; c.lineWidth = 2; rr(c, 50, 20, 40, 20, 6); c.stroke();
    } else if (kind === 'stars') {
      const star = (x, y, r, on) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fillStyle = on ? '#e9b330' : '#5a4f7a'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); };
      star(24, 38, 11, true); star(48, 34, 13, true); star(72, 38, 11, false);
    } else if (kind === 'duels') {
      c.save(); c.translate(22, 38); c.scale(0.45, 0.45); ship(0, 0); c.restore();
      rivalPic(c, 'khurda', 72, 36, 40, { t, mood: 'angry' });
    } else if (kind === 'ladder') {
      c.strokeStyle = '#e9eef6'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(36, 66); c.lineTo(44, 6); c.moveTo(60, 66); c.lineTo(68, 6); for (let k = 0; k < 5; k++) { const y = 60 - k * 12; c.moveTo(36.8 + k * 1.6, y); c.lineTo(60.8 + k * 1.6, y); } c.stroke();
      c.fillStyle = '#ffd45a'; c.font = '800 12px ' + FONT; c.textAlign = 'center'; c.fillText('×1.5', 80, 14);
    } else if (kind === 'boosters') {
      ['shield', 'super', 'hull', 'coins'].forEach((id, i) => { c.save(); c.translate(4 + i * 22, 25); boostIcon(c, id, 22, t, true); c.restore(); });
    } else if (kind === 'mozah') {
      c.save(); c.scale(0.33, 0.33); astro(c, 90, 210, 2.4, { t, char: 'abood', pose: 'wave' }); astro(c, 200, 210, 2.4, { t, char: 'mozah', costume: costumeOf('mozah'), pose: 'wave' }); c.restore();
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
  sec(TT('help_s_trips', 'الرحلات', 'Journeys'), [['legs', 'help_story'], ['legs', 'help_easy'], ['duels', 'help_bosses'], ['pickups', 'help_rescue'], ['stars', 'help_stars'], ['stars', 'help_medals'], ['legs', 'help_legs'], ['gates', 'help_gates']]);
  sec(TT('help_s_fight', 'القتال', 'Fighting'), [['duels', 'help_robots'], ['duels', 'help_bigboss'], ['nabeeh', 'help_wings'], ['pickups', 'help_weapons'], ['super', 'help_graze'], ['meteor', 'help_mods']]);
  sec(T('b_duels') + ' · ' + T('b_missions'), [['duels', 'help_duels'], ['ladder', 'help_ladder'], ['boosters', 'help_boosters'], ['mozah', 'help_mozah']]);

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
let hasShield = false, canPause = true;
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
  if (!on) { duelOn = null; return; }
  const t = $('toast'); if (t) t.hidden = true;
}
// duel mode: the rival bar (portrait, name, HP with phase ticks, shield overlay, phase pips) replaces the trip bar
function setDuel(rid) {
  duelOn = rid || null;
  $('trip').hidden = !!rid; $('tripLeg').hidden = !!rid; $('rivalBar').hidden = !rid;
  $('hud').classList.toggle('duel', !!rid);
  if (!rid) return;
  const R = rivalDef(rid) || {}, phases = Array.isArray(R.phases) ? R.phases : [];
  $('rvName').textContent = rvName(rid);
  const bar = $('rvHp'); bar.querySelectorAll('.tick').forEach(e => e.remove());
  for (let i = 1; i < phases.length; i++) { const tk = el('em', 'tick'); tk.style.left = (clamp(+phases[i].at || 0, 0, 1) * 100).toFixed(1) + '%'; bar.appendChild(tk); }
  const pp = $('rvPhase'); pp.innerHTML = ''; if (phases.length > 1) for (let i = 0; i < phases.length; i++) pp.appendChild(el('i'));
  hc.rvF = hc.rvPh = hc.rvSh = hc.rvTicks = hc.rvIn = hc.rvStun = undefined; $('rivalBar').style.opacity = ''; $('rivalBar').style.transform = '';
  drawRvPortrait(rid, 0, 'angry');
}
// v3: a boss inside a leg borrows the duel HUD; when it is fixed the trip bar comes back
export function setBoss(rid) {
  if (rid) { setDuel(rid); return; }
  setDuel(null); hideBanner();
  if (cur.jid) setTrip(cur.jid, cur.li);
}
function drawRvPortrait(rid, phase, mood) {
  const cnv = $('rvPic'); if (!cnv) return; const c = cnv.getContext('2d'), s = cnv.width;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, s, s);
  rivalPic(c, rid, s * 0.5, s * 0.5, s * 0.95, { t: 0.3, mood, phase });
}
function rivalHud(r) {
  const rid = r.id || r.rid || duelOn || pendingDuel; if (!rid) return;
  if (rid !== duelOn) setDuel(rid);
  const max = Math.max(1, +r.max || 1), f = Math.round(clamp((+r.hp || 0) / max, 0, 1) * 500) / 500;
  const ph = r.phase | 0, sh = Math.round(clamp(+r.shield || 0, 0, 1) * 50) / 50, intro = r.intro == null ? 1 : clamp(+r.intro, 0, 1);
  if (Array.isArray(r.ticks) && r.ticks.join() !== hc.rvTicks) {
    hc.rvTicks = r.ticks.join(); const bar = $('rvHp'); bar.querySelectorAll('.tick').forEach(e => e.remove());
    for (const at of r.ticks) { const tk = el('em', 'tick'); tk.style.left = (clamp(+at || 0, 0, 1) * 100).toFixed(1) + '%'; bar.appendChild(tk); }
  }
  if (intro !== hc.rvIn) { const b = $('rivalBar'); b.style.opacity = intro.toFixed(2); b.style.transform = intro < 1 && !REDUCED ? 'translateY(' + Math.round((1 - intro) * -24) + 'px)' : ''; hc.rvIn = intro; }
  if (!!r.stun !== hc.rvStun) { $('rivalBar').classList.toggle('stun', !!r.stun); hc.rvStun = !!r.stun; }
  // v3.1 big bosses: parts left (⚙ 3/4), a shield icon while the shield generator stands
  const pk = (r.partsN | 0) ? (r.parts | 0) + '/' + (r.partsN | 0) + (r.core ? '' : '+') : '';
  if (pk !== hc.rvParts) { const e = $('rvParts'); if (e) { e.hidden = !pk; e.innerHTML = ''; if (pk) { e.appendChild(icon('gear')); e.append((r.parts | 0) + '/' + (r.partsN | 0)); if (!r.core) e.appendChild(icon('shield', 'sh')); } e.title = T('h_parts'); } hc.rvParts = pk; }
  if (f !== hc.rvF) {
    $('rvFill').style.transform = 'scaleX(' + f.toFixed(4) + ')';
    if (hc.rvF != null && f < hc.rvF && !REDUCED) { const b = $('rivalBar'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }
    $('rivalBar').setAttribute('aria-label', rvName(rid) + ' · ' + Math.round(f * 100) + '%');
    hc.rvF = f; hc.rvSh = undefined;
  }
  if (ph !== hc.rvPh) {
    [...$('rvPhase').children].forEach((p, i) => p.classList.toggle('on', i <= ph));
    if (hc.rvPh != null) drawRvPortrait(rid, ph, 'angry');
    hc.rvPh = ph;
  }
  if (sh !== hc.rvSh) {
    const R = rivalDef(rid) || {}, P = (R.phases || [])[ph] || {}, frac = ((P.shield || R.shield || {}).hp) || 0.12;
    const w = sh * frac, s = $('rvShield');
    s.hidden = sh <= 0; s.style.width = (w * 100).toFixed(2) + '%'; s.style.left = (Math.max(0, f - w) * 100).toFixed(2) + '%';
    hc.rvSh = sh;
  }
}
export function showHud(on, jid, li, o) {
  hudShow(on);
  if (!on) return;
  let rid = null;
  if (jid && typeof jid === 'object') { o = jid; jid = null; }
  if (o && typeof o === 'object') rid = o.rid || (typeof o.duel === 'string' ? o.duel : null);
  else if (!jid && pendingDuel) rid = pendingDuel;
  pendingDuel = null;
  if (jid) cur = { jid, li: li | 0 };
  hc = {};
  try { hasShield = (M.stats().shieldCd || 0) > 0; } catch (e) { hasShield = false; }
  setCanPause(true);
  if (rid) setDuel(rid); else { setDuel(null); if (cur.jid) setTrip(cur.jid, cur.li); }
  syncMute();
  $('pauseBtn').textContent = 'II';
}
export function setCanPause(b) {
  canPause = b !== false;
  const p = $('pauseBtn'); if (!p) return;
  p.classList.toggle('off', !canPause); p.disabled = !canPause; p.setAttribute('aria-hidden', canPause ? 'false' : 'true');
}
export function superRect() { const b = $('superBtn'); return b && !b.hidden ? b.getBoundingClientRect() : null; }
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
  if (s.canPause != null && (s.canPause !== false) !== canPause) setCanPause(s.canPause);
  if (s.rival) rivalHud(s.rival);
  else if (s.jid && hc.trip !== s.jid + ':' + (s.li | 0)) { if (duelOn) setDuel(null); setTrip(s.jid, s.li | 0); }
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
  if (!duelOn) {
    const prog = Math.round(clamp(+s.prog || 0, 0, 1) * 500) / 500;
    if (prog !== hc.prog) {
      const f = clamp((cur.li + prog) / 3, 0, 1);
      $('tripFill').style.transform = 'scaleX(' + f.toFixed(4) + ')';
      $('tripShip').style.left = (f * 100).toFixed(2) + '%';
      hc.prog = prog;
    }
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
  // v3.1: the weapon pickup in use (with its timer) and the wingmen flying with you
  const wk = s.weapon || null, wf = wk ? Math.round(clamp(+s.weaponF || 0, 0, 1) * 50) / 50 : 0;
  const wl = wk ? (s.weaponLv | 0) || 1 : 0;
  if (wk !== hc.wk || wl !== hc.wl) { const chip = $('weaponChip'); if (chip) { chip.hidden = !wk; chip.dataset.w = wk || ''; chip.dataset.lv = wl; if (wk) $('weaponName').textContent = T('wp_' + wk); } hc.wk = wk; hc.wl = wl; hc.wf = -1; }
  if (wk && wf !== hc.wf) { const chip = $('weaponChip'); if (chip) chip.querySelector('i').style.transform = 'scaleX(' + wf + ')'; hc.wf = wf; }
  const wn = s.wings | 0;
  if (wn !== hc.wn) { const chip = $('wingChip'); if (chip) { chip.hidden = wn <= 0; $('wingN').textContent = '×' + wn; chip.setAttribute('aria-label', T('h_wings') + ' ' + wn); } hc.wn = wn; }
}

// =============================================================================================
// pause
export function showPause(on) {
  const p = $('pause'); if (!p) return;
  p.hidden = !on;
  $('pauseBtn').innerHTML = svgI(on ? 'play' : 'pause');
  if (on) { syncMute(); syncFps(); hideNote(); const t = $('toast'); if (t) t.hidden = true; if (kbd) try { $('resumeBtn').focus({ preventScroll: true }); } catch (e) {} }
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
  const out = [{ key: r.duel ? 'r_duelReward' : r.first === false ? 'r_replay' : 'r_reward', n: r.reward || 0 }, { key: 'r_picked', n: r.picked != null ? r.picked : (r.run && r.run.coins) || 0 }];
  if (r.bonus) out.push({ key: 'r_bonus', n: r.bonus });
  if (r.bossReward) out.push({ key: 'r_bossReward', n: r.bossReward });
  if (typeof r.dayBonus === 'number' && r.dayBonus > 0) out.push({ key: 'r_dayBonus', n: r.dayBonus });
  if (r.starPay) out.push({ key: 'r_starPay', n: r.starPay });
  if (r.medalPay) out.push({ key: 'r_medalPay', n: r.medalPay });
  return out;
}
// v3 medals: finish, no damage, every pod rescued, score
const MEDAL_IDS = ['finish', 'noDamage', 'rescue', 'score'];
const MEDAL_IC = { finish: 'check', noDamage: 'heart', rescue: 'bot', score: 'star' };
function medalRow(arr, isNew = [], big = false, small = false) {
  const s = el('span', 'medals4' + (big ? ' big' : small ? ' sm' : '')); s.setAttribute('aria-hidden', 'true');

  MEDAL_IDS.forEach((id, k) => { const i = el('i', 'medal m-' + id + (arr && arr[k] ? ' on' : '') + (isNew.includes(k) ? ' new' : '')); i.innerHTML = svgI(MEDAL_IC[id]); if (isNew.includes(k)) i.style.animationDelay = (1.4 + isNew.indexOf(k) * 0.3) + 's'; s.appendChild(i); });
  return s;
}
const resultTotal = (r, parts) => r.win ? (r.total != null ? r.total : parts.reduce((a, p) => a + p.n, 0)) : (r.kept || 0);
function partText(p, n) {
  if (keyIsFn(p.key)) return fixSign(T(p.key, n), n);
  return T(p.key) + ' ' + sgn(n);
}
function showParts(parts, upto, f) {
  const box = $('swParts');
  if (box.childElementCount !== parts.length) { box.innerHTML = ''; parts.forEach(() => box.appendChild(el('span'))); }
  [...box.children].forEach((e, i) => {
    const p = parts[i];
    e.textContent = p && i <= upto ? partText(p, i < upto ? p.n : Math.round(p.n * f)) : '';
    e.classList.toggle('hot', !!p && i === upto && f < 1);
  });
}
function endCount() {
  if (!count) return;
  const c = count; stopCount();
  if (c.rq && lastRes && !$('over').hidden && !c.leaving) setTimeout(() => { if (!rq && !$('over').hidden && lastRes === c.res) rqStart(lastRes.rq); }, REDUCED ? 0 : 350);
  $('swCoins').textContent = nf(c.total); showParts(c.parts, c.parts.length - 1, 1); syncCoins(c.base + c.total);
  bump($('swCoins')); hook('sfx', 'chime');
}
function runCount(r) {
  stopCount();
  const parts = resultParts(r), total = resultTotal(r, parts);
  const now = M.coins(), base = Math.max(0, now - total);
  const lens = parts.map(p => p.n > 0 ? clamp(0.35 + p.n / 400, 0.45, 1.1) : 0.05);
  count = { parts, total, base, lens, t: -0.45, last: performance.now(), tick: 0, fly: 0, raf: 0, rq: true, res: r };
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
// U1: never offer "Next" when it would replay the leg just flown
function nextTarget(r) {
  if (!r || !r.win || r.duel) return null;
  if (r.li < 2) return { jid: r.jid, li: r.li + 1, leg: true }; // finishing a leg always opens the next one
  const ji = M.journeyIndex(r.jid), nj = M.JOURNEYS[ji + 1];
  if (nj && M.isUnlocked(nj.id)) {
    const n = M.nextPlayable();
    if (n && !(n.jid === r.jid && n.li === r.li)) return { jid: n.jid, li: n.li, leg: false };
  }
  return null;
}
// one helpful line under the card (§7.5): a gate that is close, the next star, the ladder mission nearest done
function nudge(r) {
  if (r.gate && r.gate.left > 0) return T('r_gateNear', r.gate.left, jName(r.gate.jid));
  // a journey gate that is near
  const nextJ = M.JOURNEYS.find((j, i) => i > 0 && !M.isUnlocked(j.id) && M.legsDone(M.JOURNEYS[i - 1].id) >= 3);
  if (nextJ) { const g = MM('journeyNeed', nextJ.id); if (g && !g.ok && g.need - g.have <= 3) return T('r_gateNear', g.need - g.have, jName(nextJ.id)); }
  // the next star of this leg
  if (!r.duel && r.win && Array.isArray(r.stars) && !r.stars[2]) {
    const L = M.leg ? M.leg(r.jid, r.li) : null, sc = (r.run && r.run.score) || 0;
    if (L && L.star && sc < L.star) return T('r_nextStar', L.star, sc);
  }
  // the ladder mission closest to done
  const Ld = MM('ladder');
  if (Ld && Array.isArray(Ld.missions)) {
    const open = Ld.missions.filter(m => !m.done).sort((a, b) => b.progress / b.goal - a.progress / a.goal)[0];
    if (open) return T('ld_title', Ld.lv) + ': ' + T('lm_' + open.kind, open.goal) + ' · ' + T('ms_prog', Math.min(open.progress, open.goal), open.goal);
  }
  return '';
}
function fillResult(r, animate) {
  const panel = $('overPanel'), duel = !!r.duel, J = duel ? null : M.journey(r.jid), planetId = (J && (J.planet || J.id)) || r.jid, arrived = !!(!duel && r.win && r.journeyDone);
  panel.classList.toggle('win', !!r.win); panel.classList.toggle('lose', !r.win); panel.classList.toggle('postcard', arrived); panel.classList.toggle('duel', duel);
  const run = r.run || {};
  if (duel) $('overTitle').textContent = r.win ? T('du_fixedTitle', rvName(r.rid)) : T('du_lose');
  else $('overTitle').textContent = !r.win ? T('r_fail') : arrived ? T('r_arrive', pName(planetId)) : T('r_win');
  if (animate || !r.botLine) r.botLine = TL(duel ? (r.win ? 'bot_duelWin' : 'bot_duelLose') : arrived ? 'bot_arrive' : r.win ? 'bot_win' : 'bot_lose');
  $('overBotTxt').textContent = r.botLine;
  let msg;
  if (duel) msg = r.win ? '«' + T('rv_' + r.rid + '_fixed') + '» ' + T('du_win') : T('r_failHint') + ' ' + T('r_tryUpgrade');
  else if (!r.win) msg = T('r_failHint') + (M.journeyIndex(r.jid) > 0 || r.li > 0 ? ' ' + T('r_tryUpgrade') : '');
  else if (r.bossFixed && r.bossFixed.length) msg = T('r_bossFixed', rvName(r.bossFixed[0]));
  else if (r.newBest) msg = T('r_newBest');
  else if (run.noHit || run.hits === 0) msg = T('r_noHit');
  else msg = T('m_legOf', r.li, 3) + ' · ' + legName(r.jid, r.li);
  if (!duel && r.win && +run.rescueTotal > 0) msg += ' · ' + T('r_rescued', Math.min(run.rescued | 0, run.rescueTotal | 0), run.rescueTotal | 0);
  $('overMsg').textContent = msg;
  // stars (new ones pop in)
  const sb = $('overStars'); sb.innerHTML = '';
  if (r.win && Array.isArray(r.stars)) {
    const row = starRow(r.stars, 'stars3 big', animate && !REDUCED ? (r.newStars || []) : []);
    const L = duel ? null : (M.leg ? M.leg(r.jid, r.li) : null), R = duel ? rivalDef(r.rid) : null;
    const tips = duel ? [T('du_win'), T('st_2', 50), T('du_par', (R && R.par) || 0)] : [T('st_1'), T('st_2', Math.round((M.STAR_HULL || 0.6) * 100)), T('st_3', nf((L && L.star) || 0))];
    [...row.children].forEach((s, i) => { s.title = tips[i]; });
    row.setAttribute('aria-hidden', 'false'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', T('r_stars') + ' · ' + T('a_stars', starCount(r.stars)));
    sb.appendChild(row);
  }
  if (!duel && r.win && Array.isArray(r.medals)) {
    const mr = medalRow(r.medals, animate && !REDUCED ? (r.newMedals || []) : [], true);
    const mtips = [T('md_finish'), T('md_noDamage'), T('md_rescue'), T('md_score', nf(r.star || 0))];
    [...mr.children].forEach((m, i) => { m.title = mtips[i]; });
    mr.setAttribute('aria-hidden', 'false'); mr.setAttribute('role', 'img'); mr.setAttribute('aria-label', T('r_medals') + ' · ' + r.medals.filter(Boolean).length + '/4');
    sb.appendChild(mr);
  }
  sb.hidden = !sb.childElementCount;
  // score boxes: legs = score / kills / best; duels = time / hull / best time
  for (const id of ['sScore', 'sBest']) $(id).dir = duel ? 'auto' : 'ltr';
  if (duel) {
    const row = (MM('rivalList') || []).find(x => x.id === r.rid), best = r.best != null ? r.best : row && row.best;
    setScore(0, nf(Math.round(run.time || 0)) + T('sec'), T('du_time'));
    setScore(1, nf(Math.max(0, run.hpEnd || 0)) + '/' + nf(run.maxHp || 0), T('h_hull'));
    setScore(2, best ? nf(Math.round(best)) + T('sec') : '–', r.newBest ? T('r_newBest') : T('r_best'));
    $('sBest').parentElement.classList.toggle('nb', !!r.newBest);
  } else {
    setScore(0, nf(run.score || 0), T('r_score')); setScore(1, nf(run.kills || 0), T('r_kills'));
    setScore(2, nf(r.best != null ? r.best : M.best(r.jid)), r.newBest ? T('r_newBest') : T('r_best'));
    $('sBest').parentElement.classList.toggle('nb', !!r.newBest);
  }
  // coin multiplier line
  const mul = +r.coinMult || 1, ml = $('swMult');
  ml.hidden = !(mul > 1.001); if (mul > 1.001) ml.textContent = T('r_coinMult', Math.round(mul * 100) / 100);
  // art: postcard on arrival, the fixed rival after a duel, otherwise the player + Nabeeh
  dropAnims('over');
  const fact = $('overFact');
  if (arrived) {
    fact.hidden = false; fact.textContent = '';
    fact.appendChild(el('b', null, T('r_postcard', pName(planetId)) + ' · ')); fact.append(T('r_factTitle') + ' ' + T('fact_' + planetId));
    const L = shipLook();
    addAnim($('avOver'), t => {
      const cnv = $('avOver'), c = cnv.getContext('2d'), w = cnv.width, h = cnv.height;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); stars(c, w, h, t, 50, 0.9);
      planet(c, planetId, w * 0.55, h * 0.56, h * (planetId === 'saturn' ? 0.24 : 0.34), t * 0.3);
      c.save(); c.translate(w * 0.2, h * 0.24 + (REDUCED ? 0 : Math.sin(t * 1.5) * 4)); c.scale(1.4, 1.4); art('drawShip', c, 0, 0, Object.assign({}, L, { t, tilt: 0.1, thrust: 0.5 })); c.restore();
    }, 'over');
  } else if (duel || (r.win && r.bossFixed && r.bossFixed.length)) {
    fact.hidden = true;
    const bossId = duel ? r.rid : r.bossFixed[0];
    addAnim($('avOver'), t => {
      const cnv = $('avOver'), c = cnv.getContext('2d'), w = cnv.width, h = cnv.height, k = h / 300;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); stars(c, w, h * 0.75, t, 34, 0.8);
      const bob = REDUCED ? 0 : Math.sin(t * 1.6) * 5;
      rivalPic(c, bossId, w * 0.7, h * 0.33 + bob * k, h * 0.42, { t, mood: r.win ? 'fixed' : 'angry' });
      c.save(); c.scale(k, k); astro(c, (w / k) * 0.3, 284, 2.4, { t, pose: r.win ? 'cheer' : 'sad' }); c.restore();
    }, 'over');
  } else {
    fact.hidden = true;
    addAnim($('avOver'), t => drawDuoCanvas($('avOver'), t, { abood: { pose: r.win ? 'cheer' : 'sad' }, nabeeh: { mood: r.win ? 'happy' : 'sad' } }), 'over');
  }
  // v3.2: unlocks, level-ups, badges and missions no longer pile up on the card: they play as toasts (rqItems)
  r.rq = rqItems(r, duel);
  // buttons: legs = Next / Retry / Station; duels = Duels / Rematch / Station
  const nb = $('nextBtn'), rb = $('retryBtn');
  if (duel) {
    nb.hidden = false; nb.className = r.win ? 'btn' : 'btn alt'; nb.textContent = T('b_duels');
    rb.className = r.win ? 'btn alt' : 'btn'; rb.textContent = rematchText();
  } else {
    const nt = nextTarget(r);
    nb.hidden = !nt; nb.className = 'btn';
    if (nt) { nb.textContent = nt.leg ? T('b_next') : T('m_next', jName(nt.jid)); bakeSoon(themeOf(nt.jid)); }
    rb.className = r.win ? 'btn alt' : 'btn';
    rb.textContent = r.win ? T('b_replay') : T('b_retry');
  }
  $('quitBtn').textContent = T('b_station');
  if (!animate) { // re-render after a language switch: final numbers, no recount
    const parts = resultParts(r), total = resultTotal(r, parts);
    $('swCoins').textContent = nf(total); showParts(parts, parts.length - 1, 1); syncCoins();
  }
}

// =============================================================================================
// v3.2 reward toasts. News (level-up, new journey, badges, missions) plays one by one and moves on by itself; a tap skips
// to the next. Choices (wear the unlocked suit, meet Mozah) come last and wait for an answer.
function rqItems(r, duel) {
  const out = [], picIcon = (name, cls) => box => { box.className = 'rq-pic ' + (cls || ''); box.innerHTML = svgI(name); };
  const picCanvas = (draw, cls) => box => { box.className = 'rq-pic cv ' + (cls || ''); box.innerHTML = ''; const cv = mk(96, 96); box.appendChild(cv); draw(cv); };
  if (r.levelUp) out.push({ kick: () => T('rq_level'), title: () => T('ld_up', r.levelUp.lv, r.levelUp.mult, r.levelUp.reward), pic: picIcon('up', 'teal') });
  if (!duel && r.win && r.unlocked) out.push({ kick: () => T('rq_unlock'), title: () => jName(r.unlocked), sub: () => T('r_unlocked', jName(r.unlocked)),
    pic: picCanvas(cv => { try { const j = M.journey(r.unlocked); cv.getContext('2d').drawImage(thumb((j && j.planet) || r.unlocked, false), -24, 0, 144, 96); } catch (e) {} }, 'planet') });
  if (!duel && r.win && r.hardOpen && (r.newMedals || []).length && MM('medalsOf', r.jid) >= 12) out.push({ kick: () => T('rq_hard'), title: () => T('md_hard'), pic: picIcon('star', 'gold') });
  for (const b of r.badges || []) out.push({ kick: () => T('rq_badge'), title: () => b.tiered ? T('bc_' + b.id) + ' · ' + T('tier_' + b.tier) : T('bg_' + b.id), sub: () => T('bg_reward', b.reward || 0),
    pic: picCanvas(cv => medal(cv.getContext('2d'), b.id, b.tiered ? b.tier : 3, 96), 'medal') });
  for (const m of r.missions || []) out.push({ kick: () => T('rq_mission'), title: () => T((m.set === 'ladder' ? 'lm_' : 'ms_') + m.kind, m.goal), sub: () => m.reward ? T('bg_reward', m.reward) : '', pic: picIcon('check', 'ok') });
  // choices, always last
  const unl = duel ? (r.win && r.unlock) : (r.bossUnlock || (r.levelUp && r.levelUp.unlock));
  if (unl && unl.id) {
    const u = unl, isSkin = u.kind === 'skin';
    out.push({ pick: true, kick: () => T('rq_new'), title: () => isSkin ? T('sk_' + u.id) : T('cs_' + u.id), sub: () => T(isSkin ? 'rq_newSkin' : 'rq_newSuit'),
      pic: picCanvas(cv => unlockPic(cv, u), 'deep'),
      acts: () => [{ text: isSkin ? T('paint') : T('wear'), cls: 'btn', go: () => { const ok = isSkin ? MM('wearSkin', u.id) : MM('wearCostume', u.id); if (ok) { hook('sfx', 'chime'); hook('onChar', CHAR()); } } },
        { text: T('rq_later'), cls: 'ghost' }] });
  }
  if (r.girl) out.push({ pick: true, kick: () => T('rq_girl'), title: () => T('ch_mozah'), sub: () => T('girlNew'),
    pic: picCanvas(cv => { const c = cv.getContext('2d'); c.save(); c.scale(96 / 200, 96 / 200); c.translate(0, 70); astro(c, 100, 194, 2.6, { t: 0.4, char: 'mozah', costume: costumeOf('mozah'), pose: 'wave' }); c.restore(); }, 'deep'),
    acts: () => [{ text: T('rq_pick'), cls: 'btn', go: () => { endCount(); rqClose(); pendingSheet = 'costumes'; hook('onQuit'); return true; } }, { text: T('rq_later'), cls: 'ghost' }] });
  return out;
}
let rq = null, rqT = 0;
function rqStart(items) {
  rqClose();
  if (!items || !items.length) return;
  rq = { items, i: -1 };
  const box = $('rq'); box.hidden = false; box.classList.remove('out');
  rqNext();
}
function rqNext() {
  if (!rq) return;
  clearTimeout(rqT);
  rq.i++;
  if (rq.i >= rq.items.length) { rqClose(true); return; }
  rqDraw(true);
}
function rqDraw(fresh) {
  if (!rq) return;
  const it = rq.items[rq.i], card = $('rqCard'), n = rq.items.length, picks = rq.items.filter(x => x.pick).length;
  it.pic($('rqPic'));
  $('rqKick').textContent = it.kick(); $('rqTitle').textContent = it.title(); const sub = it.sub ? it.sub() : ''; $('rqSub').textContent = sub; $('rqSub').hidden = !sub;
  const act = $('rqAct'); act.innerHTML = '';
  card.classList.toggle('pick', !!it.pick);
  if (it.pick) for (const a of it.acts()) {
    const b = el('button', a.cls, a.text); b.type = 'button';
    b.onclick = e => { e.stopPropagation(); const stop = a.go && a.go(); if (!stop) rqNext(); };
    act.appendChild(b);
  }
  const dots = $('rqDots'); dots.innerHTML = ''; for (let k = 0; k < n; k++) dots.appendChild(el('i', k === rq.i ? 'on' : k < rq.i ? 'done' : ''));
  $('rqHint').textContent = it.pick ? '' : T('rq_tap') + ' · ' + T('rq_of', rq.i + 1, n);
  const sk = $('rqSkip'); sk.textContent = T('rq_skip'); sk.hidden = !!it.pick || rq.i >= n - 1 - picks;
  if (fresh) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in'); hook('sfx', it.pick ? 'chime' : 'tick'); }
  const tm = $('rqTime');
  tm.style.animation = 'none'; void tm.offsetWidth;
  if (!it.pick) { const d = REDUCED ? 3.2 : 2.6; tm.style.animation = 'rqTime ' + d + 's linear both'; rqT = setTimeout(rqNext, d * 1000); }
  if (it.pick && kbd) { const f = act.querySelector('button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} }
}
function rqSkip() { // jump past the news to the first choice (or close)
  if (!rq) return;
  const k = rq.items.findIndex((x, i) => i > rq.i && x.pick);
  if (k < 0) { rqClose(true); return; }
  rq.i = k - 1; rqNext();
}
function rqClose(done) {
  clearTimeout(rqT);
  const box = $('rq'); if (!box) return;
  const was = !!rq; rq = null;
  if (!was) { box.hidden = true; return; }
  if (REDUCED) box.hidden = true; else { box.classList.add('out'); setTimeout(() => { if (!rq) { box.hidden = true; box.classList.remove('out'); } }, 220); }
  if (done && lastRes && !$('over').hidden) { // Nabeeh says the next goal once the news is over
    const ntx = nudge(lastRes), tx = $('overBotTxt');
    if (ntx && tx) { tx.classList.add('fade'); setTimeout(() => { tx.textContent = ntx; tx.classList.remove('fade'); }, 240); }
  }
}
function setScore(i, val, label) {
  const ids = [['sScore', 'sScoreLbl'], ['sKills', 'sKillsLbl'], ['sBest', 'sBestLbl']][i];
  $(ids[0]).textContent = val; $(ids[1]).textContent = label;
}
export function showResult(r) {
  r = Object.assign({}, r || {});
  if (r.duel && !r.rid) r.rid = duelOn || pendingDuel;
  lastRes = r; if (!r.duel) cur = { jid: r.jid, li: r.li | 0 };
  hudShow(false); hideNote(); hideBanner(); $('pause').hidden = true; $('menu').hidden = true; $('sheet').hidden = true;
  $('over').hidden = false;
  fillResult(r, true);
  runCount(r);
  maybeToast();
  if (kbd) try { (r.duel ? (r.win ? $('nextBtn') : $('retryBtn')) : (r.win && nextTarget(r) ? $('nextBtn') : $('retryBtn'))).focus({ preventScroll: true }); } catch (e) {}
}

// =============================================================================================
// init
function relang() {
  if (!$('menu').hidden) { renderMenu(); const tx = $('botTipTxt'); if (tx) tx.textContent = TL('bot_menu'); }
  if (sheetKind) { ustaLine = ''; openSheet(sheetKind); }
  if (!$('over').hidden && lastRes) { const keep = rq; rq = null; endCount(); fillResult(lastRes, false); if (keep) { keep.items = lastRes.rq; rq = keep; rqDraw(false); } }
  if (hudOn && duelOn) { const d = duelOn; setDuel(d); }
  else if (hudOn && cur.jid) setTrip(cur.jid, cur.li);
  if (hudOn) { hc.hp = undefined; hc.maxHp = undefined; hc.full = undefined; }
  if (!$('loginPop').hidden) { const L = loginDays($('loginDays')); loginExtra($('loginBot'), L); $('loginClaim').textContent = T('lg_claim', L.gift); }
  syncMute(); syncCoins(); syncFps();
  if (!ldDone) ldTip();
}
function registerSW() {
  try {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    if (window.__aboodSW) return; window.__aboodSW = true; // game.js may register too: register once
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) { // local dev: never cache, drop any old worker and its cache
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      if (window.caches) caches.keys().then(ks => ks.filter(k => k.startsWith('abood-moon-')).forEach(k => caches.delete(k))).catch(() => {});
      return;
    }
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { updateReady = true; maybeToast(); } });
  } catch (e) { /* sandboxed frames refuse service workers; the game still runs */ }
}
// keep Tab inside an open dialog (sheet / pause / results / login gift)
function trapTab(e) {
  const box = ['sheet', 'pause', 'loginPop', 'over'].map($).find(x => x && !x.hidden); if (!box) return;
  const f = [...box.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1], ae = document.activeElement;
  if (!box.contains(ae)) { e.preventDefault(); a.focus(); }
  else if (e.shiftKey && ae === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && ae === z) { e.preventDefault(); a.focus(); }
}
export function initUI(h) {
  H = h || {};
  if (inited) return; inited = true;
  setGirl(isGirl());
  const fa = $('flagAr'), fe = $('flagEn'); if (fa) fa.innerHTML = FLAG.ar; if (fe) fe.innerHTML = FLAG.en;
  safeCall(applyI18n);
  // menu
  $('launchBtn').onclick = () => { ensureSel(); if (!M.canPlay(selJ, selL)) return; cur = { jid: selJ, li: selL }; pendingDuel = null; hook('onLaunch', selJ, selL); };
  document.querySelectorAll('[data-sheet]').forEach(b => { b.onclick = () => openSheet(b.dataset.sheet); });
  $('sheetClose').onclick = closeSheet;
  $('sheet').addEventListener('pointerdown', e => { if (e.target === $('sheet')) closeSheet(); });
  $('loginPop').addEventListener('pointerdown', e => { if (e.target === $('loginPop')) $('loginPop').hidden = true; });
  $('menuMute').onclick = doMute; $('pauseMute').onclick = doMute; if ($('muteBtn')) $('muteBtn').onclick = doMute;
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
  for (const id of ['pauseBtn', 'muteBtn']) if ($(id)) $(id).addEventListener('pointerdown', stop);
  $('pauseBtn').onclick = e => { if (!canPause && $('pause').hidden) return; if ($('pause').hidden) hook('onPause'); else hook('onResume'); e.currentTarget.blur(); };
  const sb = $('superBtn');
  sb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sb.classList.add('press'); hook('onSuper'); });
  const unpress = () => sb.classList.remove('press');
  sb.addEventListener('pointerup', unpress); sb.addEventListener('pointercancel', unpress); sb.addEventListener('pointerleave', unpress);
  sb.addEventListener('click', e => { if (e.detail === 0) hook('onSuper'); sb.blur(); }); // keyboard Enter/Space on the focused button
  sb.addEventListener('contextmenu', e => e.preventDefault());
  // pause card
  $('resumeBtn').onclick = () => hook('onResume');
  $('restartBtn').onclick = () => { if (duelOn) pendingDuel = duelOn; hook('onRetry'); };
  $('pauseQuit').onclick = () => hook('onQuit');
  // results
  $('nextBtn').onclick = () => {
    endCount();
    if (lastRes && lastRes.duel) { if (typeof H.onDuels === 'function') hook('onDuels'); else { pendingSheet = 'duels'; hook('onQuit'); } return; }
    const n = nextTarget(lastRes); if (n) cur = { jid: n.jid, li: n.li }; hook('onNext');
  };
  $('retryBtn').onclick = () => {
    endCount();
    if (lastRes && lastRes.duel) { startDuelUI(lastRes.rid); return; }
    if (lastRes) cur = { jid: lastRes.jid, li: lastRes.li | 0 }; hook('onRetry');
  };
  $('quitBtn').onclick = () => { endCount(); hook('onQuit'); };
  $('over').addEventListener('pointerdown', e => { if (count && !(e.target.closest && e.target.closest('button'))) endCount(); });
  // reward toasts: a tap moves the news on; choices wait for their buttons
  for (const id of ['nextBtn', 'retryBtn', 'quitBtn']) $(id).addEventListener('click', () => rqClose(), true);
  $('rq').addEventListener('click', e => { if (!rq || (e.target.closest && e.target.closest('button'))) return; const it = rq.items[rq.i]; if (it && !it.pick) rqNext(); else { const c = $('rqCard'); c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); } });
  $('rqSkip').onclick = e => { e.stopPropagation(); rqSkip(); };
  // toast
  $('toastBtn').onclick = () => location.reload();
  // keys: Esc closes a sheet / the login gift (game.js owns P / Esc for pause in flight); Tab stays inside dialogs
  addEventListener('pointerdown', () => { kbd = false; }, true);
  addEventListener('keydown', e => {
    kbd = true;
    if (e.key === 'Tab') { trapTab(e); return; }
    if (rq) { const it = rq.items[rq.i]; if (e.code === 'Escape') { if (it && it.pick) rqNext(); else rqSkip(); e.stopPropagation(); return; } if ((e.code === 'Enter' || e.code === 'Space') && it && !it.pick) { rqNext(); e.preventDefault(); return; } }
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
