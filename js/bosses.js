// Abood Space v3.4 · bosses that think.
// v3.3 gave every boss one signature trick, but each ran it on a fixed timer and never looked at the player, so the fights
// still read as scripted. Now every boss has a small brain:
//   senses    where the ship sits (and for how long), how it moves, how hard the boss is being hit, what hit the player
//   decides   picks its next move from several by weight, never the same one twice running, and favours what worked
//   reacts    calls out a habit and goes for that spot, defends when it takes a beating, eases off after a hit, feints
//   remembers what hit the player in earlier attempts (kept in localStorage) and opens with it; Zero copies the three
//             styles that hit this player the most
// A thought bubble over its head shows what it has in mind (… ! ? eye, target, shield, grin), so the player can read it.
// game.js keeps HP, phases, the HUD and the fixed/fly-off ending; a style adds movement, its own objects and hazards.
//   B = make(style, rv, lite)   state for one fight            update(B, dt, live, rv)   every frame of the fight
//   bolt(B, b) → true if a player bolt was used up here         lane / at / beam / home   the laser, saw, beam and missiles
//   coreHit(B, rv, dealt) after the core took damage            playerHit(B, rv)          the ship was hit
//   shift(B, rv) / fixed(B, rv)   phase change / the boss is fixed      draw(B, c, 'under' | 'over')
// A style: { hint, init, update (the always-on mechanism), moves: { name: { w, go, step → true when done, end, rest, icon } },
//            camp / heat (reactions: return a move name, null for the default call-out, false if it handled it itself) }
// Styles never import the engine: game.js binds an api object X (ship, rv, shots, effects, sound, hurt, drawing).
const INK = '#1c1530', TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = f => 1 - Math.pow(1 - clamp(f, 0, 1), 3);
const easeInOut = f => { f = clamp(f, 0, 1); return f * f * (3 - 2 * f); };
let X = null;
export function bind(api) { X = api; }

// ---- shared helpers ----
const hp1 = k => Math.max(1, X.dmg()) * k;   // hit points in "bolts": an upgraded ship still needs the same number of hits
function ping(x, y) { X.sparks(x, y, 3, '#ffffff', 120, -90); X.sfx('shieldHit'); }
function popFx(x, y, col, n = 10) { X.sparks(x, y, n, col, 170); X.ring(x, y, 26, col, 0.3); }
function lanesY(n, rv) {
  const a = Math.max(X.Y_MIN + 30, rv.ymin != null ? rv.ymin : 60), b = Math.min(X.Y_MAX - 30, rv.ymax != null ? rv.ymax : 330), out = [];
  for (let i = 0; i < n; i++) out.push(n === 1 ? (a + b) / 2 : a + (b - a) * i / (n - 1));
  return out;
}
function segCircle(ax, ay, bx, by, cx, cy, r) { // does the segment a→b pass within r of c?
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, f = clamp(((cx - ax) * dx + (cy - ay) * dy) / L, 0, 1);
  const px = ax + dx * f - cx, py = ay + dy * f - cy; return px * px + py * py < r * r;
}
function metalChunk(c, x, y, r, rot, seed, flash, hot) { // a scrap chunk in the art.js look: ink outline, flat grey, a highlight
  c.save(); c.translate(x, y); c.rotate(rot);
  c.fillStyle = flash > 0.5 ? '#ffffff' : hot ? '#c46a5a' : '#8d94a8'; c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, k = 0.78 + 0.22 * Math.abs(Math.sin(seed * 7.1 + i * 2.3)); c.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k); } c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-r * 0.5, -r * 0.35); c.lineTo(r * 0.15, -r * 0.6); c.stroke();
  c.fillStyle = '#c7cedb'; c.beginPath(); c.arc(r * 0.25, r * 0.2, Math.max(1.2, r * 0.12), 0, TAU); c.fill();
  if (hot) { c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,90,60,.55)'; c.beginPath(); c.arc(0, 0, r * 0.45, 0, TAU); c.fill(); }
  c.restore();
}
function weakMark(c, x, y, r, t, col = '#ffe066') { // "hit it now": two small arrows beside the boss, pointing at it (nothing is drawn over the body)
  const p = 0.5 + 0.5 * Math.sin(t * 7), x0 = x - r - 18 - p * 5;
  c.save(); c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 2; c.lineJoin = 'round';
  for (let k = 0; k < 2; k++) { const xx = x0 - k * 13; c.globalAlpha = k ? 0.55 : 1; c.beginPath(); c.moveTo(xx + 8, y); c.lineTo(xx - 2, y - 8); c.lineTo(xx - 2, y + 8); c.closePath(); c.fill(); c.stroke(); }
  c.restore();
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// aim where the ship will be (k scales how far ahead); bosses mix this with plain aim so neither habit is always safe
function lead(x, y, v, k = 1) {
  const s = X.ship, tm = Math.min(0.8, Math.hypot(s.x - x, s.y - y) / Math.max(80, v)) * k;
  return Math.atan2(clamp(s.y + (s.vy || 0) * tm, X.Y_MIN, X.Y_MAX) - y, s.x + (s.vxp || 0) * tm * 0.5 - x);
}
const farY = rv => clamp(X.ship.y > 200 ? rv.ymin + rnd(0, 40) : rv.ymax - rnd(0, 40), rv.ymin, rv.ymax);   // a spot well off the ship's lane
function laneTell(c, y, x1, t, hw = 20, f = 1) { // "something is coming along this lane": a red band with chevrons running left
  c.save(); c.fillStyle = `rgba(255,50,70,${0.1 + 0.14 * f + 0.05 * Math.sin(t * 20)})`; c.fillRect(0, y - hw, x1, hw * 2);
  c.strokeStyle = `rgba(255,90,100,${0.5 + 0.3 * f})`; c.lineWidth = 2; c.setLineDash([10, 8]); c.lineDashOffset = t * 90;
  c.beginPath(); c.moveTo(0, y - hw); c.lineTo(x1, y - hw); c.moveTo(0, y + hw); c.lineTo(x1, y + hw); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(255,90,110,.8)';
  for (let k = 0; k < 5; k++) { const x = x1 - ((t * 220 + k * x1 / 5) % Math.max(1, x1)); c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x + 3, y - 8); c.lineTo(x, y); c.lineTo(x + 3, y + 8); c.closePath(); c.fill(); }
  c.restore();
}

// ================================================================================================
// the memory: what hit this player in earlier fights (per boss and per style). Small, and only ever read by the bosses.
const MKEY = 'abood-moon-bossmem-v1';
let MEM = null, saidBrain = false;
function mem() {
  if (!MEM) { try { MEM = JSON.parse(localStorage.getItem(MKEY) || '{}') || {}; } catch (e) { MEM = {}; } MEM.b = MEM.b || {}; MEM.s = MEM.s || {}; }
  return MEM;
}
function memSave() { try { localStorage.setItem(MKEY, JSON.stringify(MEM)); } catch (e) { /* private mode: it just forgets */ } }
export function memory(v) { if (v === null) { MEM = { b: {}, s: {} }; memSave(); } else if (v) { MEM = v; MEM.b = MEM.b || {}; MEM.s = MEM.s || {}; memSave(); } return mem(); }
const MV = (B, k) => (k && B.S.moves && (B.S.moves[k] || (B.stage >= 3 && GIANT[k]))) || null;
const okMove = (B, rv, M) => !!M && !(M.lite === false && B.lite) && !(M.ph && rv.ph < M.ph);
const favOf = (B, m) => Object.keys(m.h).filter(k => MV(B, k) && m.h[k] > 0).sort((a, b) => m.h[b] - m.h[a])[0] || null;

// ================================================================================================
// the brain
function mkBrain(B, rv) {
  const M = mem(), m = M.b[rv.id] || (M.b[rv.id] = { n: 0, w: 0, h: {} });
  const br = { cy: 200, cx: 0, camp: 0, campCd: 4, band: [0.25, 0.5, 0.25], heat: 0, heatCd: 2.5, hitT: 99, hitN: 0, n: 0,
    tot: 0, icon: null, it: 0, i0: 1, last: null, last2: null, mv: null, mt: 0, mT: 0, rest: 1.3, next: null,
    sayCd: 1.5, said: {}, m, fav: m.n > 0 ? favOf(B, m) : null, favSaid: false, wk: null, again: m.n > 0 && !m.w, low: false };
  m.n++; memSave(); return br;
}
function icon(B, k, t = 1.3) { const br = B.br; if (!br) return; br.icon = k; br.it = br.i0 = t; }
function talk(B, key, force) {
  const br = B.br; if (!br || B.noIcon) return false;
  if (!force && (br.sayCd > 0 || (br.said[key] | 0) >= 2)) return false;
  br.said[key] = (br.said[key] | 0) + 1; br.sayCd = 5.5; X.rvSay(key); return true;
}
function queue(B, k, why) { const br = B.br, M = br && MV(B, k); if (!M || (M.lite === false && B.lite)) return; br.next = [k, why]; br.rest = Math.min(br.rest, 0.3); }
function sense(B, dt, live, rv) {
  const br = B.br, s = X.ship, S = B.S;
  br.it -= dt; br.sayCd -= dt; br.hitT += dt; br.heatCd -= dt; br.campCd -= dt;
  br.heat *= Math.exp(-dt * 0.8);                                   // share of its HP lost in the last second or so
  if (!live || !X.fight()) { br.camp = 0; return; }
  br.n += dt;
  if (Math.abs(s.y - br.cy) > 44 || Math.abs(s.x - br.cx) > 80) { br.cy = s.y; br.cx = s.x; br.camp = 0; } else br.camp += dt;
  const bi = s.y < 150 ? 0 : s.y > 260 ? 2 : 1;
  for (let i = 0; i < 3; i++) br.band[i] += ((i === bi ? 1 : 0) - br.band[i]) * Math.min(1, dt * 0.3);
  if (br.again && br.n > 1.2) { br.again = false; if (talk(B, B.studied ? 'bq_study' : 'bq_again', true)) icon(B, 'eye', 1.8); }
  // the player sits still: it says so and goes for that spot
  if (br.camp > (B.lite ? 5 : 3.6) && br.campCd <= 0) {
    br.campCd = B.lite ? 9 : 6.5; br.camp = 0;
    const k = S.camp ? S.camp(B, rv, br) : null;
    if (k !== false) { icon(B, 'eye', 1.6); talk(B, 'bq_camp'); if (k) queue(B, k, 'eye'); }
    if (!saidBrain && !X.harmless()) { saidBrain = true; X.say('bot_brain'); }
  }
  // it is taking a beating (well above the pace of this fight so far, whatever the ship's upgrades): defend
  if (br.heat > Math.max(0.014, (br.n > 4 ? br.tot / br.n : 0.02) * 2) && br.heatCd <= 0) {
    br.heatCd = B.lite ? 9 : 6.5; br.heat = 0;
    const k = S.heat ? S.heat(B, rv, br) : null;
    if (k !== false) { icon(B, 'guard', 1.6); talk(B, 'bq_ouch'); if (k) queue(B, k, 'guard'); }
  }
  const wk = X.weapon(); if (wk !== br.wk) { br.wk = wk; if (wk && br.n > 3) { talk(B, 'bq_toy'); br.rest = Math.min(br.rest, 0.5); } }
  if (!br.low && rv.hp / rv.max < 0.18) { br.low = true; if (talk(B, 'bq_scared', true)) icon(B, 'bang'); }
}
function pick(B, rv) {
  const S = B.S, br = B.br, opts = []; let tot = 0;
  const keys = Object.keys(S.moves); if (B.stage >= 3) keys.push(...Object.keys(GIANT));
  for (const k of keys) {
    const M = MV(B, k); if (!okMove(B, rv, M)) continue;
    let w = M.w ? M.w(B, rv, br) : 1; if (!(w > 0)) continue;
    if (k === br.last) w *= 0.2; else if (k === br.last2) w *= 0.6;
    if (k === br.fav) w *= 1.7;
    opts.push([k, w]); tot += w;
  }
  let r = Math.random() * tot; for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
  return opts.length ? opts[0][0] : null;
}
function startMove(B, rv, k, why) {
  const br = B.br, M = MV(B, k); if (!M) { br.rest = 1; return false; }
  br.mv = k; br.mt = 0; br.mT = 0; br.last2 = br.last; br.last = k; icon(B, why || M.icon || 'bang');
  if (k === br.fav && !br.favSaid) { br.favSaid = true; talk(B, 'bq_learn', true); }
  if (M.go) M.go(B, rv, br);
  return true;
}
function restT(B, rv, M) {
  let r = typeof M.rest === 'function' ? M.rest(B, rv) : M.rest || 1.2;
  if (B.lite) r *= 1.45; if (X.harmless()) r *= 1.25; if (rv.ph >= 2) r *= 0.8; if (B.br.low) r *= 0.8; if (X.enraged()) r *= 0.8;
  if (B.br.hitT < 1.5) r += 0.9;   // it just hit the player: a breath before the next one
  return r;
}
function endMove(B, rv) { const br = B.br, M = MV(B, br.mv); if (!M) { br.mv = null; return; } if (M.end) M.end(B, rv, br); br.rest = restT(B, rv, M); br.mv = null; }
function runBrain(B, dt, live, rv) {
  const S = B.S, br = B.br; if (!S.moves) return;
  if (br.mv) { const M = MV(B, br.mv); br.mt += dt; br.mT += dt; if (!M.step || M.step(B, dt, live, rv, br) || br.mT > (M.max || 16)) endMove(B, rv); return; }
  if (!live || !X.fight()) return;
  br.rest -= dt;
  if (br.rest < 0.4 && br.it <= 0) icon(B, 'dots', 0.45);          // it is thinking
  if (br.rest > 0) return;
  if (br.next) { const [k, why] = br.next; br.next = null; startMove(B, rv, k, why); } else startMove(B, rv, pick(B, rv));
}
// one of the boss's own phase attacks (meta.js), fired when the brain chooses and not on a metronome. Returns how long it takes.
function kit(B, rv) {
  const L = ((rv.phase && rv.phase.atk) || []).filter(a => a.k !== 'ram' && a.k !== 'pulse'); if (!L.length) return 0.5;
  const a = L[Math.floor(Math.random() * L.length)], v = a.v || 230, mx = () => rv.x - rv.r * 0.8;
  if (a.k === 'aim') { // a burst that alternates "at you" and "ahead of you"
    const n = (a.n || 1) + (B.lite ? 0 : 1);
    for (let i = 0; i < n; i++) X.later(i * 0.24, () => { X.shot(a.shot || 'pellet', mx(), rv.y, i % 2 ? lead(rv.x, rv.y, v) : X.aim(rv.x, rv.y), v); X.sfx('eshot'); });
    return n * 0.24 + 0.3;
  }
  if (a.k === 'spiral') { // a sweep of shots that starts on the far side and walks toward the ship
    const n = B.lite ? 7 : 12, arms = a.arms || 1, dir = X.ship.y > rv.y ? 1 : -1;
    for (let i = 0; i < n; i++) X.later(i * 0.14, () => { for (let q = 0; q < arms; q++) X.shot('pellet', mx(), rv.y, Math.PI - dir * (0.85 - i * 1.7 / n) + q * 0.5 * dir, a.v || 200); X.sfx('eshot'); });
    return n * 0.14 + 0.3;
  }
  X.atk(a);
  return a.k === 'laser' ? 1.4 + (a.n || 1) * 0.5 : a.k === 'lanes3' ? 2.2 : 0.8;
}
const KIT = { icon: 'aim', lite: false, w: (B, rv) => ((rv.phase && rv.phase.atk) || []).length ? 1 : 0, go(B, rv, br) { br.dur = kit(B, rv); }, step: (B, dt, live, rv, br) => br.mt > br.dur, rest: 1.2 };
// ================================================================================================
// v3.5 the giant final forms share two moves of their own on top of the family's: they send out workers of the family, and
// they blast areas (which kind is the family's: meta.js ROYAL).
function royal(B, rv) {
  const k0 = (rv.R && rv.R.royal) || 'zones', k = k0 === 'all' ? ['zones', 'ring', 'wall'][Math.floor(Math.random() * 3)] : k0, s = X.ship, fx = rv.x - rv.r * 0.7;
  X.shake(5); talk(B, 'bq_royal');
  if (k === 'ring') { X.gapRing(fx, rv.y); if (rv.ph >= 2) X.later(1.2, () => X.gapRing(fx, rv.y)); return 2.2; }
  if (k === 'wall') { X.atk({ k: 'wall', v: 170, gap: 100 }); if (rv.ph >= 1) X.later(1.4, () => X.atk({ k: 'wall', v: 170, gap: 100 })); return 2.5; }
  if (k === 'sting') { // a fan of darts that leaves the ship's own lane open, then one dart down that lane
    for (let i = 0; i < 7; i++) { if (i === 3) continue; X.shot('dart', fx, rv.y, X.aim(fx, rv.y) + (i - 3) * 0.17, 290); }
    X.sfx('eshot'); X.later(X.tele(0.75), () => { X.shot('dart', fx, rv.y, lead(fx, rv.y, 320), 320); X.sfx('eshot'); }); return 1.5;
  }
  const n = 3 + Math.min(2, rv.ph), w = X.tele(1.2);
  X.zone(s.x, s.y, 54, w); for (let i = 1; i < n; i++) { const a = rnd(0, TAU), d = rnd(70, 150); X.zone(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 50, w + i * 0.14); }
  X.sfx('mine'); return 2;
}
const GIANT = {
  brood: { w: (B, rv) => X.kin() < 2 ? 1.6 : X.kin() < 4 ? 0.5 : 0,   // the hatch opens and the family's workers fly out
    go(B, rv, br) { br.k = 0; br.t2 = 0.6; X.sfx('plate'); talk(B, 'bq_brood'); },
    step(B, dt, live, rv, br) { br.t2 -= dt; if (br.t2 <= 0) { br.k++; br.t2 = 0.6; X.brood(rv.x + (rv.ha ? rv.ha[0] : 0), rv.y + (rv.ha ? rv.ha[1] : 0)); } return br.k >= (rv.ph >= 1 ? 3 : 2); }, rest: 1.7 },
  royal: { w: (B, rv) => rv.ph >= 1 ? 1.5 : 1, go(B, rv, br) { br.dur = royal(B, rv); }, step: (B, dt, live, rv, br) => br.mt > br.dur, rest: 1.5 },
};

// ================================================================================================
// Moon · Khurda, the scrap clam. Bolts bounce off the shut shell; the glowing core inside is the target. It no longer opens on
// a clock: it spits and stays open, peeks and hides when it is hit, or rolls down the ship's lane and comes back dizzy.
// Knock on the shell long enough and it answers (on the Moon it giggles open).
const clam = {
  hint: 'clam',
  init(B) { B.o = 0; B.want = 0; B.open = false; B.mul = 1; B.pings = 0; B.dizzy = 0; B.lane = 0; B.gotHit = false; },
  update(B, dt, live, rv, br) {
    const tot = X.harmless();
    if (B.dizzy > 0) B.dizzy -= dt;
    B.o += (B.want - B.o) * Math.min(1, dt * (B.want ? 7 : 12));
    B.open = B.o > 0.55; B.mul = B.open ? (tot ? 1.6 : 1.35) * (B.dizzy > 0 ? 1.3 : 1) : 1;
    B.pings = Math.max(0, B.pings - dt * 0.6);
    if (live && B.pings >= (tot ? 5 : 8) && !B.open && br.mv !== 'roll') { B.pings = 0; icon(B, tot ? 'grin' : 'bang'); talk(B, tot ? 'bq_tickle' : 'bq_knock'); queue(B, tot ? 'tickle' : 'spit'); }
  },
  spit(B, rv, ld) { // scrap balls: grey, slow, and they can be shot
    const n = B.lite ? 1 : rv.ph >= 1 ? 5 : 3, v = B.lite ? 120 : 150, base = ld ? lead(rv.x - rv.r, rv.y, v) : X.aim(rv.x - rv.r, rv.y), arc = n > 1 ? 0.55 : 0;
    for (let i = 0; i < n; i++) X.shot('orb', rv.x - rv.r * 0.7, rv.y, base + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0), v);
    X.sfx('eshot'); X.smoke(rv.x - rv.r * 0.6, rv.y, 2, '#6d6a80');
  },
  coreHit(B) { B.gotHit = true; },
  moves: {
    spit: { icon: 'bang', w: () => 2,
      go(B, rv, br) { B.want = 1; br.k = 0; X.sfx('whoosh'); },
      step(B, dt, live, rv, br) {
        const T = X.harmless() ? 3.4 : B.lite ? 3 : rv.ph >= 1 ? 2.1 : 2.6;
        if (!br.k && br.mt > 0.45) { br.k = 1; if (live) clam.spit(B, rv, false); }
        if (br.k === 1 && rv.ph >= 1 && !B.lite && br.mt > 0.45 + T * 0.55) { br.k = 2; if (live) clam.spit(B, rv, true); }   // a second spit, ahead of the ship
        return br.mt > 0.45 + T;
      },
      end(B) { B.want = 0; }, rest: 1.15 },
    shy: { icon: 'q', w: () => 1.5,   // peeks out, squeals when it is hit, hides and pops up somewhere else
      go(B, rv, br) { B.want = 1; B.gotHit = false; br.k = 0; br.n2 = B.lite ? 2 : 3; br.hitAt = -1; },
      step(B, dt, live, rv, br) {
        const react = X.harmless() ? 1.7 : B.lite ? 1.2 : 0.8;
        if (br.k === 0) {
          if (B.gotHit && br.hitAt < 0) { br.hitAt = br.mt; icon(B, 'q', 0.9); }
          if ((br.hitAt >= 0 && br.mt - br.hitAt > react) || br.mt > 4) { B.want = 0; br.k = 1; br.t2 = 0.6; rv.dodge = { y: farY(rv), t: 0.9 }; X.sfx('whoosh'); }
        } else { br.t2 -= dt; if (br.t2 <= 0) { if (--br.n2 <= 0) return true; B.want = 1; br.k = 0; br.hitAt = -1; br.mt = 0; } }
        B.gotHit = false; return false;
      },
      end(B) { B.want = 0; }, rest: 1.2 },
    roll: { icon: 'bang', lite: false, w: () => 1.2,   // shuts tight, lines up on the ship and rolls down its lane; it comes back dizzy and wide open
      go(B, rv, br) { B.want = 0; br.k = 0; br.tl = X.tele(B.lite ? 1.2 : 0.95); rv.dodge = { y: clamp(X.ship.y, rv.ymin, rv.ymax), t: br.tl }; B.lane = 1; X.sfx('laserWarn'); },
      step(B, dt, live, rv, br) {
        if (br.k === 0) { if (br.mt >= br.tl) { br.k = 1; B.ownMove = true; rv.dodge = null; X.sfx('whoosh'); } }
        else if (br.k === 1) {
          rv.x -= (B.lite ? 380 : 520) * dt; if (Math.random() < 0.5) X.smoke(rv.x + rv.r, rv.y + rnd(-10, 10), 1, '#8a86a0');
          if (live && X.touch(rv.x, rv.y, rv.r)) X.hurt();
          if (rv.x < 70) { br.k = 2; X.shake(5); X.sfx('tank'); X.sparks(rv.x - rv.r, rv.y, 10, '#ffcf6a', 180); }
        } else if (br.k === 2) {
          rv.x += 300 * dt;
          if (rv.x >= X.home()) { rv.x = X.home(); B.ownMove = false; B.lane = 0; br.k = 3; br.t2 = X.harmless() ? 3.2 : 2.4; B.want = 1; B.dizzy = br.t2; icon(B, 'dizzy', br.t2); }
        } else { br.t2 -= dt; if (br.t2 <= 0) return true; }
        return false;
      },
      end(B) { B.want = 0; B.ownMove = false; B.lane = 0; B.dizzy = 0; }, rest: 1.1 },
    tickle: { icon: 'grin', w: () => 0, go(B) { B.want = 1; }, step: (B, dt, live, rv, br) => br.mt > 2.6, end(B) { B.want = 0; }, rest: 1 },
  },
  camp: (B, rv, br) => br.last === 'roll' ? null : 'roll',
  heat(B, rv, br) { if (X.harmless()) return null; if (br.mv === 'spit') br.mt = 99; return br.last === 'roll' ? 'shy' : 'roll'; },
  draw(B, c, layer, rv) {
    if (layer !== 'over') return;
    // v3.5: no shell over the body any more. The robot holds two blast doors in front of it: shut = bolts bounce off,
    // and they slide apart (up and down) when it opens. The body's art stays in full view.
    const t = X.t, h = rv.r * 0.98, w = Math.max(11, rv.r * 0.3), px = rv.x - rv.r * 1.12, gap = B.o * h * 0.86, hit = rv.hurt > 0.6 && !B.open;
    if (B.open) weakMark(c, rv.x, rv.y, rv.r * 1.12 + w, t);
    c.save(); c.lineJoin = 'round';
    for (const sd of [-1, 1]) {
      const y0 = rv.y + sd * gap, y1 = y0 + sd * h, top = Math.min(y0, y1);
      // the rail arm that carries the door
      c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(rv.x - rv.r * 0.55, rv.y + sd * rv.r * 0.5); c.lineTo(px + w * 0.5, y0 + sd * h * 0.55); c.stroke();
      c.strokeStyle = '#7d879e'; c.lineWidth = 3; c.stroke();
      c.fillStyle = hit ? '#eef0f6' : '#9aa3b8'; c.strokeStyle = INK; c.lineWidth = 2.6;
      c.beginPath(); c.roundRect(px - w * 0.5, top, w, h, 5); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(px - w * 0.5 + 2.5, top + 4, 2.5, h - 8);
      c.fillStyle = 'rgba(28,21,48,.2)'; c.fillRect(px + w * 0.5 - 4.5, top + 3, 3, h - 6);
      // hazard lip where the two doors meet
      c.save(); c.beginPath(); c.rect(px - w * 0.5 + 1.3, sd < 0 ? y0 - 9 : y0 + 1.3, w - 2.6, 7.7); c.clip();
      c.fillStyle = '#ffd23f'; c.fillRect(px - w, y0 - 12, w * 2, 24); c.fillStyle = INK;
      for (let k = -2; k < 4; k++) { const x = px - w * 0.5 + k * 7; c.beginPath(); c.moveTo(x, y0 + 12); c.lineTo(x + 7, y0 - 12); c.lineTo(x + 10.5, y0 - 12); c.lineTo(x + 3.5, y0 + 12); c.closePath(); c.fill(); }
      c.restore();
      c.fillStyle = '#e6e9f0'; for (const f of [0.3, 0.62, 0.9]) { c.beginPath(); c.arc(px, y0 + sd * h * f, 1.7, 0, TAU); c.fill(); }
    }
    c.restore();
  },
  draw2(B, c, layer, rv) { if (layer === 'under' && B.lane) laneTell(c, rv.y, rv.x - rv.r, X.t, rv.r * 0.85); },
};

// ================================================================================================
// Mars · Bubolt, the bubble launcher. Bouncing bubble-bombs that split when shot (the smallest pop into coins). It blows them
// toward the side the ship is on, streams small ones ahead of a moving ship, sucks stray bubbles back past the player from
// behind and blows them out again, and hides inside a big bubble when it is hit hard.
const BUB = [{ r: 11, hp: 1 }, { r: 17, hp: 2 }, { r: 25, hp: 3 }];
const bubble = {
  hint: 'bubble',
  init(B) { B.tg = []; B.sh = null; B.suck = 0; },
  add(B, x, y, lv, vx, vy) { if (B.tg.length >= 18) return; B.tg.push({ x, y, lv, r: BUB[lv].r, hp: hp1(BUB[lv].hp), vx, vy, flash: 0, dead: false, ph: rnd(0, 6) }); },
  update(B, dt, live, rv) {
    if (B.sh) { B.sh.x = rv.x - 1; B.sh.y = rv.y; B.sh.flash = Math.max(0, B.sh.flash - dt * 6); }
    const wall = rv.x - rv.r - 4;
    for (const o of B.tg) {
      if (o.dead) continue;
      if (B.suck > 0) o.vx = Math.min(320, o.vx + 600 * dt);
      o.x += o.vx * dt; o.y += o.vy * dt; o.flash = Math.max(0, o.flash - dt * 6); o.ph += dt * 3;
      if (o.x > wall - o.r) { o.x = wall - o.r; if (o.vx > 0) o.vx = 0; }
      if (o.y < X.Y_MIN + o.r - 10) { o.y = X.Y_MIN + o.r - 10; o.vy = Math.abs(o.vy); }
      if (o.y > X.Y_MAX - o.r + 10) { o.y = X.Y_MAX - o.r + 10; o.vy = -Math.abs(o.vy); }
      if (o.x < -o.r - 10 && B.suck <= 0) { o.dead = true; continue; }
      if (live && X.touch(o.x, o.y, o.r * 0.85)) { X.hurt(); bubble.pop(B, o, false); }
    }
    B.tg = B.tg.filter(o => !o.dead);
  },
  targets(B) { return B.sh ? B.tg.concat(B.sh) : B.tg; },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.sh) { // the big bubble it hides in
      if (o.hp > 0) { X.sfx('shieldHit'); return; }
      o.dead = true; B.sh = null; B.open = true; popFx(o.x, o.y, '#9ff0ff', 18); X.ring(o.x, o.y, o.r + 20, '#9ff0ff', 0.4); X.sfx('pop'); icon(B, 'dizzy', 1.2); return;
    }
    if (o.hp <= 0) bubble.pop(B, o, true); else X.sfx('shieldHit');
  },
  pop(B, o, split) {
    o.dead = true; popFx(o.x, o.y, '#9ff0ff', 6 + o.lv * 3); X.sfx('pop');
    if (!split) return;
    if (o.lv > 0) for (const s of [-1, 1]) bubble.add(B, o.x, o.y, o.lv - 1, Math.min(-40, o.vx * 0.8 + s * 20), s * rnd(110, 160));
    else { X.coin(o.x, o.y); X.addScore(20, o.x, o.y); }
  },
  moves: {
    blow: { icon: 'bang', w: B => B.tg.length < 9 ? 2 : 0.2,   // big ones, sent to bounce through the side the ship is on
      go(B, rv) {
        const L = B.lite, n = rv.ph >= 2 && !L ? 2 : 1, sd = Math.random() < 0.75 ? (X.ship.y > rv.y ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
        for (let i = 0; i < n; i++) bubble.add(B, rv.x - rv.r - 30, rv.y + (i - (n - 1) / 2) * 30, L ? 1 : 2, -rnd(55, 85), (i ? -sd : sd) * rnd(90, 140));
        X.sfx('plate'); X.ring(rv.x - rv.r, rv.y, 30, '#9ff0ff', 0.3);
      },
      rest: (B, rv) => B.lite ? 2.6 : rv.ph >= 1 ? 1.7 : 2.2 },
    stream: { icon: 'aim', w: B => B.tg.length < 12 ? 1.3 : 0,   // a quick string of small ones, every other one aimed ahead of the ship
      go(B, rv, br) { br.k = B.lite ? 3 : rv.ph >= 1 ? 6 : 4; br.cd = 0.25; },
      step(B, dt, live, rv, br) {
        br.cd -= dt; if (br.cd > 0) return false;
        br.cd = 0.3; const v = B.lite ? 140 : 175, a = br.k % 2 ? lead(rv.x, rv.y, v) : X.aim(rv.x, rv.y);
        bubble.add(B, rv.x - rv.r - 16, rv.y, 0, Math.cos(a) * v, Math.sin(a) * v); X.sfx('pop');
        return --br.k <= 0;
      }, rest: 1.8 },
    inhale: { icon: 'eye', lite: false,   // bubbles the player let past come back from behind, then burst out again
      w(B) { let n = 0; for (const o of B.tg) if (o.x < X.ship.x + 60) n++; return n >= 2 || B.tg.length >= 7 ? 2.6 : 0; },
      go(B) { B.suck = 1.5; X.sfx('whoosh'); talk(B, 'bq_suck'); },
      step(B, dt, live, rv) {
        B.suck -= dt; if (B.suck > 0) return false;
        for (const o of B.tg) { o.vx = -rnd(110, 190); o.vy = (Math.random() < 0.5 ? -1 : 1) * rnd(60, 160); }
        X.shake(4); X.sfx('plate'); X.ring(rv.x - rv.r, rv.y, 46, '#9ff0ff', 0.4); return true;
      },
      end(B) { B.suck = 0; }, rest: 2 },
    lob: { icon: 'eye', w: () => 0,   // straight at the spot the player will not leave
      go(B, rv) { const a = lead(rv.x, rv.y, 160, 0.6); bubble.add(B, rv.x - rv.r - 30, rv.y, B.lite ? 1 : 2, Math.cos(a) * 165, Math.sin(a) * 165); X.sfx('plate'); X.ring(rv.x - rv.r, rv.y, 30, '#9ff0ff', 0.3); },
      rest: 1.4 },
    shell: { icon: 'guard', w: () => 0,   // hit hard: it wraps itself in a big bubble that has to be popped first
      go(B, rv) { const hp = hp1(B.lite ? 4 : 7); B.sh = { sh: true, x: rv.x - 1, y: rv.y, r: rv.r + 16, hp, max: hp, flash: 1, dead: false }; B.open = false; X.sfx('shieldHit'); X.ring(rv.x, rv.y, rv.r + 30, '#9ff0ff', 0.4); },
      rest: 0.8 },
    kit: Object.assign({ ph: 1 }, KIT),
  },
  camp: (B, rv, br) => br.last === 'lob' ? 'stream' : 'lob',
  heat: B => B.sh ? null : 'shell',
  fixed(B) { for (const o of B.tg) popFx(o.x, o.y, '#9ff0ff', 4); B.tg.length = 0; B.sh = null; B.suck = 0; },
  draw(B, c, layer) {
    if (layer !== 'over') return;
    const t = X.t;
    for (const o of B.tg) {
      const w = 1 + Math.sin(o.ph * 2) * 0.05, h = 1 - Math.sin(o.ph * 2) * 0.05;
      c.save(); c.translate(o.x, o.y); c.scale(w, h);
      c.globalCompositeOperation = 'lighter'; c.fillStyle = o.flash > 0.4 ? 'rgba(255,255,255,.5)' : 'rgba(110,210,255,.18)'; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.stroke();
      c.strokeStyle = '#7fe0ff'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, o.r - 2.5, 0, TAU); c.stroke();
      // the little charge core in the middle and the shine
      c.fillStyle = '#4a4f63'; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.arc(0, 0, 3 + o.lv * 1.6, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = (Math.floor(t * 4 + o.ph) % 2) ? '#ff5a6a' : '#ffd23f'; c.beginPath(); c.arc(0, 0, 1.4 + o.lv * 0.6, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, o.r * 0.68, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
      c.restore();
    }
  },
  draw2(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') {
      if (B.suck > 0) { // suction lines running into the mouth
        c.save(); c.strokeStyle = 'rgba(159,240,255,.45)'; c.lineWidth = 2.5; c.lineCap = 'round'; c.setLineDash([14, 16]); c.lineDashOffset = -t * 260;
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, rv.y + k * 95); c.quadraticCurveTo(rv.x * 0.6, rv.y + k * 60, rv.x - rv.r, rv.y + k * 8); c.stroke(); }
        c.restore();
      }
      return;
    }
    const o = B.sh; if (!o) return;
    c.save(); c.translate(o.x, o.y); const w = 1 + Math.sin(t * 5) * 0.03; c.scale(w, 2 - w);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = o.flash > 0.4 ? 'rgba(255,255,255,.45)' : 'rgba(110,210,255,.2)'; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over'; c.strokeStyle = INK; c.lineWidth = 2.6; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.stroke();
    c.strokeStyle = '#7fe0ff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, o.r - 3, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, o.r * 0.74, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
    const dm = 1 - o.hp / o.max; if (dm > 0.3) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-o.r * 0.5, -o.r * 0.2); c.lineTo(-o.r * 0.2, 0); c.lineTo(-o.r * 0.45, o.r * 0.3); if (dm > 0.6) { c.moveTo(o.r * 0.1, -o.r * 0.6); c.lineTo(-o.r * 0.1, -o.r * 0.3); c.lineTo(o.r * 0.15, -o.r * 0.1); } c.stroke(); }
    c.restore();
  },
};

// ================================================================================================
// Venus · Zannana, the hornet. Perched it is easy to hit (×1.5), so it does not sit still for it: it jinks out of the lane when
// it is being hit, loops through the spot the ship is in (and may re-aim at the last moment), stabs straight down the ship's
// lane and comes back tired, or strafes past firing darts at where the ship is and where it is going.
// a giant only hurts with its head (its long body flies past), and it warns for longer before it dives
const big = rv => !!(rv.R && rv.R.giant);
const hornet = {
  hint: 'hornet',
  tr: rv => big(rv) ? 30 : rv.r * 0.8,
  init(B) { B.mode = 'perch'; B.ownMove = true; B.trail = []; B.mul = 1.5; B.jink = null; B.ly = 200; },
  plan(B, rv) { // an oval loop whose far turn is aimed at the ship (ahead of a moving ship from the second phase)
    const home = X.home(), s = X.ship, ld = rv.ph >= 1 && !B.lite ? 0.35 : 0;
    const tx = B.lite ? Math.max(s.x + 50, X.W * 0.3) : clamp(s.x - 14, 46, X.W * 0.3), cy = clamp(s.y + (s.vy || 0) * ld, 140, 270);
    const rx = (home - tx) / 2, ry = Math.min(B.lite ? 95 : 130, cy - X.Y_MIN - 6, X.Y_MAX - 6 - cy);
    B.path = { cx: home - rx, rx, cy, ry, sd: Math.random() < 0.5 ? 1 : -1, y0: rv.y };
  },
  pos(B, f) { const P = B.path, a = f * TAU; return [P.cx + P.rx * Math.cos(a), clamp(P.cy - P.sd * P.ry * Math.sin(a) + (P.y0 - P.cy) * (1 - f), X.Y_MIN + 10, X.Y_MAX - 10)]; },
  tele(B, rv, t) { B.mode = 'tele'; B.mt = X.tele(t); hornet.plan(B, rv); B.fake = !B.lite && rv.ph >= 1 && Math.random() < 0.4; X.sfx('laserWarn'); },
  update(B, dt, live, rv) {
    if (B.mode !== 'perch') return;
    B.mul = 1.5; let ty = 200 + Math.sin(B.t * 1.4) * 70;
    if (B.jink) { B.jink.t -= dt; ty = B.jink.y; B.trail.push([rv.x, rv.y]); if (B.trail.length > 5) B.trail.shift(); if (B.jink.t <= 0) B.jink = null; } else if (B.trail.length) B.trail.shift();
    rv.x += (X.home() - rv.x) * Math.min(1, dt * 4); rv.y += (ty - rv.y) * Math.min(1, dt * (B.jink ? 9 : 2.5)); rv.y = clamp(rv.y, rv.ymin, rv.ymax);
  },
  moves: {
    swoop: { icon: 'bang', w: () => 2,
      go(B, rv) { B.loops = !B.lite && rv.ph >= 2 ? 2 : 1; hornet.tele(B, rv, B.lite ? 1.2 : big(rv) ? 1.3 : 0.9); },
      step(B, dt, live, rv) {
        if (B.mode === 'tele') {
          B.mul = 1.5; rv.x += Math.sin(B.t * 40) * 0.6; B.mt -= dt;
          if (B.fake && B.mt < 0.15) { B.fake = false; hornet.plan(B, rv); B.mt = X.tele(0.5); X.sfx('laserWarn'); talk(B, 'bq_feint'); icon(B, 'grin'); }   // re-aims where the ship fled to
          if (B.mt <= 0) { B.mode = 'swoop'; B.f = 0; B.drop = B.lite ? 9 : 0; X.sfx('whoosh'); }
          return false;
        }
        B.mul = 1; B.f += dt / (B.lite ? 3.1 : rv.ph >= 1 ? 2.3 : 2.6);
        const [x, y] = hornet.pos(B, Math.min(1, B.f)); rv.x = x; rv.y = y;
        B.trail.push([x, y]); if (B.trail.length > 6) B.trail.shift();
        if (!B.lite && B.drop < 2 && B.f > (B.drop + 1) / 3.2) { B.drop++; X.mob('mine', x, y, { v: 70, turn: 0.9, life: 4.5, hp: hp1(2) }); }
        if (live && X.touch(x, y, hornet.tr(rv))) X.hurt();
        if (B.f >= 1) { if (--B.loops > 0) hornet.tele(B, rv, big(rv) ? 0.95 : 0.6); else return true; }
        return false;
      },
      end(B) { B.mode = 'perch'; B.trail.length = 0; B.fake = false; }, rest: (B, rv) => B.lite ? 2.4 : rv.ph >= 1 ? 1.5 : 2 },
    dart: { icon: 'aim', lite: false, w: B => B.lite ? 0.8 : 1.6,   // draws back, follows the ship's lane, commits, stabs: then limps home tired (×2)
      go(B, rv, br) { B.mode = 'aimdart'; br.tl = X.tele(B.lite ? 1.15 : big(rv) ? 1.2 : 0.85); B.ly = rv.y; B.hitD = false; X.sfx('laserWarn'); },
      step(B, dt, live, rv, br) {
        const home = X.home();
        if (B.mode === 'aimdart') {
          B.mul = 1.5;
          if (br.mt < br.tl - 0.3) B.ly += (clamp(X.ship.y + (rv.ph >= 1 ? (X.ship.vy || 0) * 0.15 : 0), X.Y_MIN + 10, X.Y_MAX - 10) - B.ly) * Math.min(1, dt * 7);
          rv.y += (B.ly - rv.y) * Math.min(1, dt * 10); rv.x += (home + 26 - rv.x) * Math.min(1, dt * 5);
          if (br.mt >= br.tl) { B.mode = 'dart'; X.sfx('whoosh'); }
        } else if (B.mode === 'dart') {
          B.mul = 1; rv.x -= (B.lite ? 620 : 860) * dt; rv.y = B.ly; B.trail.push([rv.x, rv.y]); if (B.trail.length > 6) B.trail.shift();
          if (live && !B.hitD && X.touch(rv.x, rv.y, hornet.tr(rv))) { B.hitD = true; X.hurt(); }
          if (rv.x < 46) { B.mode = 'stuck'; br.t2 = B.lite ? 1 : 0.6; X.shake(4); X.sfx('tank'); X.sparks(rv.x - rv.r, rv.y, 10, '#ffcf6a', 180); }
        } else if (B.mode === 'stuck') { br.t2 -= dt; rv.x = 46 + Math.sin(B.t * 50) * 1.5; if (B.trail.length) B.trail.shift(); if (br.t2 <= 0) { B.mode = 'limp'; icon(B, 'dizzy', 1.6); } }
        else { B.mul = 2; rv.x += Math.min((home - rv.x) * dt * 1.6 + 60 * dt, home - rv.x); rv.y += Math.sin(B.t * 9) * 0.8; if (home - rv.x < 6) return true; }
        return false;
      },
      end(B) { B.mode = 'perch'; B.trail.length = 0; }, rest: 1.3 },
    volley: { icon: 'aim', w: () => 1.1,   // strafes across the ship's lane, darts at the ship and ahead of it by turns
      go(B, rv, br) { br.k = B.lite ? 3 : rv.ph >= 1 ? 6 : 4; br.cd = 0.4; },
      step(B, dt, live, rv, br) {
        B.jink = { y: clamp(X.ship.y + 70 * Math.sin(br.mt * 3.2), rv.ymin, rv.ymax), t: 0.2 };
        br.cd -= dt; if (br.cd > 0) return false;
        br.cd = 0.32; const v = B.lite ? 280 : 340; X.shot('dart', rv.x - rv.r, rv.y, br.k % 2 ? lead(rv.x, rv.y, v) : X.aim(rv.x, rv.y), v); X.sfx('eshot');
        return --br.k <= 0;
      }, rest: 1.3 },
  },
  camp: (B, rv, br) => br.last === 'dart' ? 'swoop' : 'dart',
  heat(B, rv) { // being hit on the perch: it jinks out of the lane
    if (B.mode !== 'perch') return null;
    B.jink = { y: farY(rv), t: 0.8 }; X.sfx('whoosh'); talk(B, 'bq_dodge'); icon(B, 'grin'); return false;
  },
  draw(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under' && B.mode === 'tele' && B.path) { // the dotted flight path with moving chevrons
      c.save(); c.setLineDash([3, 9]); c.lineDashOffset = -t * 60; c.lineCap = 'round'; c.strokeStyle = 'rgba(255,90,120,.75)'; c.lineWidth = 4;
      c.beginPath(); for (let i = 0; i <= 30; i++) { const [x, y] = hornet.pos(B, i / 30); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
      c.fillStyle = '#ff5a7a'; c.strokeStyle = INK; c.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { const f = ((t * 0.6 + k / 4) % 1), [x, y] = hornet.pos(B, f), [x2, y2] = hornet.pos(B, Math.min(1, f + 0.01)), a = Math.atan2(y2 - y, x2 - x);
        c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(8, 0); c.lineTo(-5, -6); c.lineTo(-2, 0); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke(); c.restore(); }
      c.restore();
    }
    if (layer === 'under' && B.mode === 'swoop') for (let i = 0; i < B.trail.length - 1; i++) X.body(c, B.trail[i][0], B.trail[i][1], { alpha: 0.12 + i * 0.04 });
    if (layer === 'over' && (B.mode === 'perch' || B.mode === 'tele')) weakMark(c, rv.x, rv.y, rv.r * 0.8, t, '#ffe066');
  },
  draw2(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') {
      if (B.mode === 'aimdart') laneTell(c, B.ly, rv.x - rv.r, t, rv.r * 0.8);
      if (B.mode !== 'swoop') for (let i = 0; i < B.trail.length - 1; i++) X.body(c, B.trail[i][0], B.trail[i][1], { alpha: 0.1 + i * 0.04 });
      return;
    }
    if (B.mode === 'aimdart' || B.mode === 'limp') weakMark(c, rv.x, rv.y, rv.r * 0.8, t, '#ffe066');
  },
};

// ================================================================================================
// Belt · Magna, the magnet. It wears pulled-in scrap as an orbiting armour. What it does with the armour depends on the ship:
// close in, it flings the lot out in a ring; far back, it snipes with the pieces one by one. It can also drag scrap in from
// BEHIND the player (the left edge flashes first), and when its armour is shot away it panics and pulls in a fresh coat.
const magnet = {
  hint: 'magnet',
  init(B) { B.tg = []; B.fly = []; B.warn = []; B.pol = 'pull'; B.ang = 0; B.feed = 0.4; B.seed = 1; },
  cap(B, rv) { return B.lite ? 5 : rv.ph >= 1 ? 10 : 8; },
  orbN(B) { let n = 0; for (const o of B.tg) if (o.st === 'orb' && !o.dead) n++; return n; },
  scrap(B, rv, x, y, hot, v) { B.tg.push({ st: 'in', hot: !!hot, x, y, tx: rv.x, ty: rv.y, r: 13, hp: hp1(1), rot: rnd(0, 6), seed: B.seed++, flash: 0, dead: false, v: v || 0 }); },
  update(B, dt, live, rv) {
    const R = rv.r + 34, p2 = rv.ph >= 1;
    B.ang += dt * (p2 ? 1.6 : 1.1) * (B.pol === 'charge' ? 0.3 : 1);
    const orb = B.tg.filter(o => o.st === 'orb' && !o.dead);
    orb.forEach((o, i) => { const a = B.ang + i * TAU / orb.length; o.tx = rv.x + Math.cos(a) * R; o.ty = rv.y + Math.sin(a) * R; o.a = a; });
    if (B.pol === 'pull') {
      B.feed -= dt;
      if (B.feed <= 0 && live && X.fight() && B.tg.length < magnet.cap(B, rv)) { B.feed = B.lite ? 1.2 : p2 ? 0.55 : 0.75; magnet.scrap(B, rv, rnd(X.W * 0.5, X.W * 0.85), Math.random() < 0.5 ? -20 : X.H + 20); }
    }
    for (const w of B.warn) { w.t -= dt; if (w.t <= 0) { w.dead = true; if (live) { magnet.scrap(B, rv, -24, w.y, true, 110); X.sfx('whoosh'); } } }
    B.warn = B.warn.filter(w => !w.dead);
    for (const o of B.tg) {
      if (o.dead) continue;
      o.flash = Math.max(0, o.flash - dt * 6); o.rot += dt * 2;
      if (o.st === 'in') { // pulled in along a curve, faster as it nears
        o.v = Math.min(420, o.v + 520 * dt); const dx = rv.x - o.x, dy = rv.y - o.y, d = Math.hypot(dx, dy) || 1;
        o.x += dx / d * o.v * dt + (-dy / d) * 60 * dt; o.y += dy / d * o.v * dt + (dx / d) * 60 * dt;
        if (d < R + 6) { o.st = 'orb'; o.hot = false; }
        else if (o.hot && live && X.touch(o.x, o.y, o.r * 0.85)) { o.dead = true; X.hurt(); popFx(o.x, o.y, '#ffb38a', 6); }
      } else { o.x += (o.tx - o.x) * Math.min(1, dt * 8); o.y += (o.ty - o.y) * Math.min(1, dt * 8); }
    }
    for (const o of B.fly) {
      if (o.dead) continue;
      o.x += o.vx * dt; o.y += o.vy * dt; o.rot += dt * 6; o.flash = Math.max(0, o.flash - dt * 6);
      if (o.x < -30 || o.x > X.W + 40 || o.y < -30 || o.y > X.H + 30) o.dead = true;
      else if (live && X.touch(o.x, o.y, o.r * 0.85)) { o.dead = true; X.hurt(); popFx(o.x, o.y, '#ffb38a', 6); }
    }
    B.tg = B.tg.filter(o => !o.dead); B.fly = B.fly.filter(o => !o.dead);
  },
  coat(B, rv) { // not enough armour for the move: a quick coat first. Returns how long to wait for it
    const want = B.lite ? 3 : 5, n = want - B.tg.length; if (n <= 0) return 0;
    for (let i = 0; i < n; i++) magnet.scrap(B, rv, rnd(X.W * 0.55, X.W * 0.9), i % 2 ? -20 : X.H + 20, false, 240);
    X.sfx('whoosh'); return 1.4;
  },
  toss(B, o, a, v) { o.dead = true; B.fly.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: o.r, hp: hp1(1), rot: o.rot, seed: o.seed, flash: 0, dead: false }); },
  moves: {
    fling: { icon: 'bang',   // the armour leaves in a ring, so the gaps between pieces are the way through: its pick when the ship is close
      w: () => X.ship.x > X.W * 0.22 ? 2.2 : 1,
      go(B, rv, br) { br.pre = magnet.coat(B, rv); br.tl = br.pre + X.tele(0.9); br.k = 0; },
      step(B, dt, live, rv, br) {
        if (br.mt < br.pre) return false;
        if (B.pol === 'pull' && !br.k) { B.pol = 'charge'; X.sfx('laserWarn'); }
        if (!br.k && br.mt >= br.tl) {
          br.k = 1; B.pol = 'push'; const v = B.lite ? 150 : rv.ph >= 1 ? 210 : 180;
          for (const o of B.tg) if (o.st === 'orb' && !o.dead) magnet.toss(B, o, o.a, v);
          X.sfx('whoosh'); X.shake(5); X.ring(rv.x, rv.y, rv.r + 50, '#ff5a6a', 0.4);
        }
        return br.k && br.mt > br.tl + 1.2;
      },
      end(B) { B.pol = 'pull'; }, rest: (B, rv) => B.lite ? 2.6 : rv.ph >= 1 ? 1.6 : 2.2 },
    snipe: { icon: 'aim',   // one piece at a time, at the ship and ahead of it by turns: its pick when the ship hangs back
      w: () => X.ship.x > X.W * 0.22 ? 1 : 2.2,
      go(B, rv, br) { br.pre = magnet.coat(B, rv); br.tl = br.pre + X.tele(0.7); br.cd = 0; br.k = 0; },
      step(B, dt, live, rv, br) {
        if (br.mt < br.pre) return false;
        if (B.pol === 'pull') { B.pol = 'charge'; X.sfx('laserWarn'); }
        if (br.mt < br.tl) return false;
        B.pol = 'push'; br.cd -= dt; if (br.cd > 0) return false;
        br.cd = B.lite ? 0.45 : 0.3;
        const o = B.tg.find(q => q.st === 'orb' && !q.dead); if (!o || br.k >= 6) return true;
        const v = B.lite ? 220 : 280; magnet.toss(B, o, br.k++ % 2 ? lead(o.x, o.y, v) : X.aim(o.x, o.y), v); X.sfx('eshot');
        return false;
      },
      end(B) { B.pol = 'pull'; }, rest: 1.8 },
    tug: { icon: 'eye', lite: false, w: B => B.lite ? 0.5 : 1.2,   // scrap dragged in from behind the player
      go(B, rv, br) {
        const n = B.lite ? 2 : rv.ph >= 1 ? 5 : 3, s = X.ship;
        for (let i = 0; i < n; i++) B.warn.push({ y: clamp(s.y + (i - (n - 1) / 2) * 48 + rnd(-10, 10), X.Y_MIN + 6, X.Y_MAX - 6), t: X.tele(0.85) + i * 0.28, t0: X.tele(0.85) + i * 0.28 });
        talk(B, 'bq_pull'); X.sfx('laserWarn');
      },
      step: (B, dt, live, rv, br) => !B.warn.length && br.mt > 1.4, rest: 2 },
    kit: Object.assign({ ph: 1 }, KIT),
  },
  camp: (B, rv, br) => br.last === 'snipe' ? 'tug' : 'snipe',
  heat(B, rv) { // shot bare: a fresh coat, fast
    if (magnet.orbN(B) > 3) return null;
    for (let i = 0; i < (B.lite ? 2 : 4); i++) magnet.scrap(B, rv, rnd(X.W * 0.55, X.W * 0.9), i % 2 ? -20 : X.H + 20, false, 240);
    X.sfx('whoosh'); return null;
  },
  targets(B) { return B.tg.concat(B.fly); },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.hp > 0) { X.sfx('shieldHit'); return; }
    o.dead = true; X.explode(o.x, o.y, o.r, { shard: 'metal', spark: '#cfd8ff', ringCol: '#cfd8ff' }); X.sfx('plate');
    if (Math.random() < 0.35) X.coin(o.x, o.y); X.addScore(15, o.x, o.y);
  },
  fixed(B) { for (const o of magnet.targets(B)) X.sparks(o.x, o.y, 4, '#cfd8ff', 90); B.tg.length = B.fly.length = B.warn.length = 0; },
  draw(B, c, layer, rv) {
    const t = X.t, red = B.pol !== 'pull', col = red ? '255,90,106' : '94,200,255';
    if (layer === 'under') { // field lines from both edges into the magnet
      c.save(); c.lineCap = 'round'; c.setLineDash([6, 10]); c.lineDashOffset = (red ? 1 : -1) * t * 80;
      const fl = B.pol === 'charge' ? 0.5 + 0.5 * Math.sin(t * 30) : 1;
      c.strokeStyle = `rgba(${col},${0.22 * fl + 0.1})`; c.lineWidth = 3;
      for (let k = 0; k < 6; k++) { const x0 = X.W * (0.45 + k * 0.09), top = k % 2 === 0, y0 = top ? 0 : X.H;
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 - 30, (y0 + rv.y) / 2, rv.x, rv.y + (top ? -rv.r : rv.r)); c.stroke(); }
      c.setLineDash([]); c.restore();
      return;
    }
    // v3.5: the body IS the magnet now (no second horseshoe drawn over it): two small pole lamps on its tips swap colour with the polarity
    for (const sd of [-1, 1]) { c.fillStyle = (sd < 0) === red ? '#ff5a6a' : '#5ec8ff'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.roundRect(rv.x - rv.r * 0.98, rv.y + sd * rv.r * 0.62 - 4.5, 9, 9, 2.5); c.fill(); c.stroke(); }
    for (const o of B.tg) metalChunk(c, o.x, o.y, o.r, o.rot, o.seed, o.flash, B.pol === 'charge');
    for (const o of B.fly) metalChunk(c, o.x, o.y, o.r, o.rot, o.seed, o.flash, true);
    // (no ring round the body while it charges: the chunks themselves glow hot)
  },
  draw2(B, c, layer) {
    const t = X.t;
    if (layer === 'under') { // "it is coming from behind you": chevrons at the left edge on each lane
      for (const w of B.warn) {
        const f = 1 - clamp(w.t / w.t0, 0, 1), on = Math.floor(t * 8) % 2;
        c.save(); c.fillStyle = `rgba(255,60,80,${0.1 + 0.2 * f})`; c.fillRect(0, w.y - 15, 150, 30);
        c.fillStyle = on ? '#ff5a6a' : '#ffd23f'; c.strokeStyle = INK; c.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const x = 10 + k * 16 + f * 10; c.beginPath(); c.moveTo(x + 9, w.y); c.lineTo(x, w.y - 9); c.lineTo(x + 3, w.y); c.lineTo(x, w.y + 9); c.closePath(); c.fill(); c.stroke(); }
        c.restore();
      }
      return;
    }
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,90,106,.8)'; c.lineWidth = 2.5;
    for (const o of B.tg) if (o.hot && !o.dead) { c.beginPath(); c.arc(o.x, o.y, o.r + 4 + Math.sin(t * 16) * 2, 0, TAU); c.stroke(); }
    c.restore();
  },
};

// ================================================================================================
// Jupiter · Radar, the hunter. Its searchlight does not sweep on a clock any more: it SEARCHES (mostly where the player likes
// to be), TRACKS the ship once it sees it (the ship can outrun the beam) and gets confused when the ship slips behind a rock
// ("?"), poking around where it last saw it. Hide too long and it lobs a blast over the rock or shoots the rock away; it also
// sends a spotter drone round the cover. Rocks still block shots both ways.
const search = {
  hint: 'search',
  init(B) { B.tg = []; B.lock = 0; B.cool = 0; B.spawn = 0; B.seed = 3; B.st = 'scan'; B.sy = 200; B.sy2 = 200; B.wp = 110; B.lastY = 200; B.lt = 0; B.hid = 0; B.alert = 0; B.spot = null; B.mark = null; B.hideRock = null; B.fl = 0; B.openT = 0; for (let i = 0; i < (B.lite ? 2 : 3); i++) search.cover(B, i); },
  cover(B, i) {
    const n = B.lite ? 2 : 3, y = X.Y_MIN + 40 + (X.Y_MAX - X.Y_MIN - 80) * ((i % n) + 0.5) / n;
    B.tg.push({ x: X.W * (0.47 + (i % 2) * 0.06), y, r: 30, hp: hp1(9), max: hp1(9), vy: (i % 2 ? 1 : -1) * rnd(14, 22), rot: rnd(0, 6), seed: B.seed++, flash: 0, dead: false });
  },
  origin(rv) { return [rv.x - rv.r * 0.55, rv.y - rv.r * 0.35]; },
  waypoint(B, br) { // where to look next: around where it lost the ship, else mostly where the player likes to be, sometimes a full sweep
    if (B.st === 'lost') { B.wp = clamp(B.lastY + rnd(-85, 85), X.Y_MIN, X.Y_MAX); return; }
    const bands = [[X.Y_MIN, 150], [150, 260], [260, X.Y_MAX]], i = br.band.indexOf(Math.max(br.band[0], br.band[1], br.band[2]));
    B.wp = Math.random() < 0.6 ? rnd(bands[i][0], bands[i][1]) : (B.sy > 200 ? X.Y_MIN + 6 : X.Y_MAX - 6);
  },
  update(B, dt, live, rv, br) {
    const p2 = rv.ph >= 1, p3 = rv.ph >= 2 && !B.lite, s = X.ship, on = live && X.fight();
    for (const o of B.tg) {
      o.y += o.vy * dt; o.flash = Math.max(0, o.flash - dt * 6); o.rot += dt * 0.2;
      if (o.y < X.Y_MIN + o.r) { o.y = X.Y_MIN + o.r; o.vy = Math.abs(o.vy); } if (o.y > X.Y_MAX - o.r) { o.y = X.Y_MAX - o.r; o.vy = -Math.abs(o.vy); }
    }
    if (B.tg.length < (B.lite ? 2 : 3)) { B.spawn += dt; if (B.spawn > 4) { B.spawn = 0; search.cover(B, B.seed); const o = B.tg[B.tg.length - 1]; o.y = Math.random() < 0.5 ? X.Y_MIN + o.r : X.Y_MAX - o.r; X.smoke(o.x, o.y, 2, '#8a86a0'); } }
    for (const q of X.eshots) if (!q.dead) for (const o of B.tg) if ((q.x - o.x) ** 2 + (q.y - o.y) ** 2 < (o.r + q.r) ** 2) { q.dead = true; X.sparks(q.x, q.y, 3, '#ffb3a0', 80); break; }   // cover eats enemy shots too
    if (B.mark) { // "no more hiding": it shoots the rock away
      const o = B.mark.o; B.mark.t -= dt;
      if (o.dead) B.mark = null;
      else if (B.mark.t <= 0) { o.dead = true; X.explode(o.x, o.y, o.r, { shard: 'rock', ringCol: '#ff6a5a', spark: '#ffd27a' }); X.sfx('boomS'); X.shake(6); B.tg = B.tg.filter(q => !q.dead); B.mark = null; B.spawn = 0; }
    }
    const [ox, oy] = search.origin(rv);
    let clear = true; B.hideRock = null;
    for (const o of B.tg) if (segCircle(ox, oy, s.x, s.y, o.x, o.y, o.r * 0.9)) { clear = false; B.hideRock = o; break; }
    B.hid = clear || !on ? 0 : B.hid + dt; B.openT = clear && on ? B.openT + dt : 0;
    if (B.alert > 0) B.alert -= dt;
    const kA = B.alert > 0 ? 1.5 : 1, vScan = (B.lite ? 95 : p2 ? 150 : 125) * kA, vTrack = (B.lite ? 85 : p2 ? 135 : 110) * kA;
    B.hw = (B.lite ? 0.1 : 0.13) * (B.fl > 0 ? 2.4 : 1);
    const angTo = y => Math.atan2(y - oy, s.x - ox), inCone = y => Math.abs(wrap(angTo(s.y) - angTo(y))) < B.hw;
    const go = (y, ty, v) => y + clamp(ty - y, -v * dt, v * dt), need = B.lite ? 1.1 : p3 ? 0.55 : 0.75;
    if (B.cool > 0) { B.cool -= dt; if (B.cool <= 0) B.st = 'scan'; }
    else if (B.st === 'track') {
      B.sy = go(B.sy, s.y, vTrack);
      if (!clear) { B.st = 'lost'; B.lt = 2.6; B.lastY = s.y; search.waypoint(B, br); icon(B, 'q', 1.6); talk(B, 'bq_lost'); }
      else if (Math.abs(B.sy - s.y) > 95) { B.st = 'scan'; B.wp = s.y; }   // outrun: it sweeps on to where it last saw the ship
    } else {
      if (B.st === 'lost') { B.lt -= dt; if (B.lt <= 0) B.st = 'scan'; }
      if (Math.abs(B.sy - B.wp) < 4) search.waypoint(B, br);
      B.sy = go(B.sy, B.wp, vScan * (B.st === 'lost' ? 0.8 : 1));
      if (on && clear && inCone(B.sy)) { B.st = 'track'; icon(B, 'bang', 1); talk(B, 'bq_see'); X.sfx('laserWarn'); }
    }
    // the second beam (last phase) goes where the ship would run to
    B.sy2 = go(B.sy2, B.st === 'track' ? clamp(s.y + (s.y < 200 ? 100 : -100), X.Y_MIN, X.Y_MAX) : X.Y_MIN + X.Y_MAX - B.sy, vScan);
    B.angs = p3 ? [angTo(B.sy), angTo(B.sy2)] : [angTo(B.sy)];
    B.seen = on && B.cool <= 0 && clear && (inCone(B.sy) || (p3 && inCone(B.sy2)));
    B.lock = B.seen ? B.lock + dt * (B.fl > 0 ? 1.4 : 1) : Math.max(0, B.lock - dt * (B.cool > 0 ? 2 : 1.4));
    B.lockF = clamp(B.lock / need, 0, 1);
    if (B.lock >= need) {
      B.lock = 0; B.cool = B.lite ? 1.8 : 1.2;
      const n = B.lite ? 1 : 3, v = B.lite ? 300 : 380;
      for (let i = 0; i < n; i++) X.later(i * 0.12, () => X.shot('dart', ox, oy, i === 1 ? lead(ox, oy, v) : X.aim(ox, oy), v));
      X.sfx('laserFire'); X.ring(s.x, s.y, 30, '#ff3040', 0.3);
    }
    const sp = B.spot;
    if (sp) { // the spotter: it creeps round the cover and, if it gets a good look, swings the big beam straight onto the ship
      sp.flash = Math.max(0, sp.flash - dt * 6); sp.life -= dt; sp.ph += dt;
      sp.x += ((sp.life > 0 ? X.W * 0.45 : X.W + 80) - sp.x) * Math.min(1, dt * 2.2); sp.y += clamp(s.y - sp.y, -75 * dt, 75 * dt);
      if (sp.life > 0 && on) {
        sp.see = Math.abs(sp.y - s.y) < 30 ? sp.see + dt : Math.max(0, sp.see - dt * 2);
        if (sp.see > 0.7) { sp.see = 0; B.sy = s.y; if (B.cool <= 0) { B.st = 'track'; B.lock = Math.max(B.lock, need * 0.6); } icon(B, 'bang', 1); X.ring(s.x, s.y, 34, '#ffb347', 0.3); X.sfx('laserWarn'); }
      }
      if (sp.dead || sp.x > X.W + 40) B.spot = null;
    }
  },
  moves: {
    flush: { icon: 'aim', w: B => B.hid > 2.2 ? 3 : 0,   // a blast lobbed over the rock the player is hiding behind
      go(B, rv) { const s = X.ship, r = B.lite ? 44 : 52, w = X.tele(B.lite ? 1.4 : 1.1); X.zone(s.x, s.y, r, w); if (!B.lite && rv.ph >= 1) X.zone(s.x, s.y + (s.y < 200 ? 1 : -1) * 96, r - 8, w + 0.25); talk(B, 'bq_flush'); },
      rest: 1.6 },
    flood: { icon: 'eye', w: B => B.openT > 5 ? 2.2 : 0.5,   // the player never hides: the beam opens wide for a moment, and only a rock helps
      go(B, rv, br) { br.tl = X.tele(0.95); B.fl = -1; X.sfx('laserWarn'); },
      step(B, dt, live, rv, br) { if (B.fl < 0) { if (br.mt >= br.tl) { B.fl = B.lite ? 1.2 : 1.7; X.sfx('laserFire'); } } else { B.fl -= dt; if (B.fl <= 0) return true; } return false; },
      end(B) { B.fl = 0; }, rest: 1.6 },
    spotter: { icon: 'eye', lite: false, w: (B, rv) => B.spot ? 0 : rv.ph >= 1 ? 1.6 : 0.9,
      go(B, rv) { B.spot = { spot: true, x: rv.x - rv.r, y: rv.y, r: 13, hp: hp1(3), life: 9, see: 0, ph: 0, flash: 0, dead: false }; X.sfx('whoosh'); },
      rest: 1.5 },
    smash: { icon: 'bang', w: () => 0,
      go(B) { const o = B.hideRock; if (o && !o.dead) { B.mark = { o, t: X.tele(1), t0: X.tele(1) }; X.sfx('laserWarn'); talk(B, 'bq_flush'); } },
      rest: 1.2 },
    kit: Object.assign({}, KIT, { w: (B, rv) => ((rv.phase && rv.phase.atk) || []).length ? (B.hid > 1 ? 0.3 : 1.2) : 0 }),
  },
  camp(B) { if (B.hid > 1) return 'smash'; B.wp = X.ship.y; return null; },   // sitting in the open: the beam comes straight over
  heat(B) { B.alert = 4.5; return null; },
  targets(B) { return B.spot ? B.tg.concat(B.spot) : B.tg; },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.spot) { if (o.hp > 0) { X.sfx('shieldHit'); return; } o.dead = true; B.spot = null; X.explode(o.x, o.y, 12, { shard: 'metal', spark: '#ffcf6a', ringCol: '#ffb347' }); X.sfx('plate'); X.coin(o.x, o.y); X.addScore(30, o.x, o.y); return; }
    if (o.hp > 0) { if (Math.random() < 0.3) X.sfx('rockhit'); return; }
    o.dead = true; X.explode(o.x, o.y, o.r, { shard: 'rock', ringCol: '#ffcf6a', spark: '#ffd27a' }); X.sfx('boomS'); X.coin(o.x, o.y); X.addScore(40, o.x, o.y);
    B.tg = B.tg.filter(q => !q.dead);
  },
  fixed(B) { B.tg.length = 0; B.spot = null; B.mark = null; B.fl = 0; },
  draw(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') {
      const [ox, oy] = search.origin(rv), L = 1100;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const a of B.angs || []) {
        const g = c.createRadialGradient(ox, oy, 10, ox, oy, L * 0.8); g.addColorStop(0, `rgba(255,243,176,${B.cool > 0 ? 0.08 : 0.26})`); g.addColorStop(1, 'rgba(255,243,176,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(ox, oy); c.arc(ox, oy, L, a - B.hw, a + B.hw); c.closePath(); c.fill();
      }
      c.restore();
      for (const o of B.tg) X.rock(c, o.x, o.y, o.r, o.rot, o.seed, o.flash);
      return;
    }
    if (B.lockF > 0.02) { // lock-on brackets close in on the ship
      const s = X.ship, k = 1 - B.lockF, r = 26 + 26 * k, col = B.lockF > 0.7 ? '#ff3040' : '#ffb347';
      c.save(); c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4 + t * 2; c.save(); c.translate(s.x, s.y); c.rotate(a); c.beginPath(); c.moveTo(r, -7); c.lineTo(r + 6, -7); c.lineTo(r + 6, 7); c.lineTo(r, 7); c.stroke(); c.restore(); }
      c.beginPath(); c.arc(s.x, s.y, r - 6, -Math.PI / 2, -Math.PI / 2 + TAU * B.lockF); c.stroke(); c.restore();
    }
  },
  draw2(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') {
      if (B.fl < 0 && B.angs) { // the floodlight is about to open this wide
        const [ox, oy] = search.origin(rv), a = B.angs[0], w = (B.lite ? 0.1 : 0.13) * 2.4;
        c.save(); c.strokeStyle = `rgba(255,243,176,${0.45 + 0.35 * Math.sin(t * 26)})`; c.lineWidth = 2.5; c.setLineDash([10, 9]); c.lineDashOffset = -t * 80;
        c.beginPath(); c.moveTo(ox + Math.cos(a - w) * 1100, oy + Math.sin(a - w) * 1100); c.lineTo(ox, oy); c.lineTo(ox + Math.cos(a + w) * 1100, oy + Math.sin(a + w) * 1100); c.stroke(); c.restore();
      }
      if (B.mark && !B.mark.o.dead) { // the rock it is about to shoot away
        const o = B.mark.o, f = 1 - clamp(B.mark.t / B.mark.t0, 0, 1), [ox, oy] = search.origin(rv);
        c.save(); c.strokeStyle = `rgba(255,60,80,${0.4 + 0.4 * f})`; c.lineWidth = 2; c.setLineDash([8, 8]); c.lineDashOffset = -t * 90; c.beginPath(); c.moveTo(ox, oy); c.lineTo(o.x, o.y); c.stroke(); c.setLineDash([]);
        c.lineWidth = 3.5; c.beginPath(); c.arc(o.x, o.y, o.r + 6 + (1 - f) * 16, 0, TAU); c.stroke(); c.restore();
      }
      return;
    }
    const sp = B.spot; if (!sp) return;
    c.save(); c.translate(sp.x, sp.y + Math.sin(sp.ph * 5) * 2);
    c.strokeStyle = `rgba(255,179,71,${0.25 + 0.6 * clamp(sp.see / 0.7, 0, 1)})`; c.lineWidth = 2; c.setLineDash([4, 7]); c.lineDashOffset = t * 60; c.beginPath(); c.moveTo(-12, 0); c.lineTo(-sp.x, 0); c.stroke(); c.setLineDash([]);
    c.strokeStyle = INK; c.lineWidth = 2.2; c.fillStyle = '#6a7088';
    for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(0, sd * 13, 11, 2.6, Math.sin(t * 40) * 0.2, 0, TAU); c.fill(); c.stroke(); }
    c.fillStyle = sp.flash > 0.4 ? '#ffffff' : '#8d94a8'; c.beginPath(); c.roundRect(-11, -9, 22, 18, 6); c.fill(); c.stroke();
    c.fillStyle = '#fff8ea'; c.beginPath(); c.arc(-4, 0, 5.2, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = sp.see > 0.3 ? '#ff3040' : '#ffb347'; c.beginPath(); c.arc(-5.5, 0, 2.4, 0, TAU); c.fill();
    c.restore();
  },
};

// ================================================================================================
// Saturn · Ghummaid, hide-and-seek. Look-alike boxes shuffle like a shell game. It keeps score: find it first time and the
// next round is faster with a different tell; guess wrong and it eases off. Two tells take turns: the real one's eye glints,
// or the real one gets NERVOUS (it sweats and shakes) while the ship is lined up on it. Run out of time and the copies charge
// down their lanes. While it is in the open it attacks, and blinks away when it is hit hard.
const hide = {
  hint: 'hide',
  init(B, rv) { B.ownMove = true; B.mode = 'show'; B.mt = 0; B.tg = []; B.mul = 1.2; rv.aimY = null; B.gl = 0; B.fg = 0; B.fk = null; B.streak = 0; B.rounds = 0; B.wrong = 0; B.nerv = 0; B.base = 200; B.real = null; B.tell = 'glint'; },
  all: B => [B.real, ...B.tg.filter(o => !o.dead)],
  split(B, rv) {
    const home = X.home(), p2 = rv.ph >= 1, real = B.real; if (!real) return;
    const n = clamp((B.lite ? 1 : p2 ? 3 : 2) + clamp(B.streak, -1, 1), 1, 3), ys = lanesY(n + 1, rv);
    B.tg = []; for (let i = 0; i < n; i++) B.tg.push({ x: real.x, y: real.y, tx: home, ty: 0, r: rv.r, hp: 1, flash: 0, dead: false, dash: 0, go: false });
    [real, ...B.tg].sort(() => Math.random() - 0.5).forEach((o, i) => { o.ty = ys[i]; o.tx = home; });
    X.smoke(real.x, real.y, 4, '#b8b0d8'); X.sfx('whoosh');
    B.mode = 'split'; B.mt = 0.7; B.swaps = Math.max(1, (B.lite ? 2 : p2 ? 5 : 3) + B.streak); B.wrong = 0; B.nerv = 0; B.sw = null;
    B.tell = B.rounds++ === 0 ? 'glint' : (B.tell === 'glint' && (B.streak > 0 || Math.random() < 0.5)) ? 'nerv' : 'glint';
    if (B.tell === 'nerv' && !B.nervSaid) { B.nervSaid = true; X.say('bot_nerv'); }
    B.fk = !B.lite && rv.ph >= 2 && B.tell === 'glint' ? B.tg[0] : null; B.fg = -0.8;   // last phase: one copy fakes a glint, in pink
  },
  update(B, dt, live, rv) {
    const home = X.home(), p2 = rv.ph >= 1, s = X.ship;
    const glide = (o, k = 6) => { o.x += (o.tx - o.x) * Math.min(1, dt * k); o.y += (o.ty - o.y) * Math.min(1, dt * k); };
    const real = B.real || (B.real = { x: rv.x, y: rv.y, tx: home, ty: 200 });
    B.mt -= dt; B.noIcon = B.mode !== 'show';
    if (B.mode === 'show') {
      real.tx = home; real.ty = clamp(B.base + Math.sin(B.t) * 40, rv.ymin, rv.ymax); glide(real, 3); rv.aimY = null; B.mul = 1.2;
    } else if (B.mode === 'split') {
      for (const o of hide.all(B)) glide(o, 7);
      if (B.mt <= 0) { B.mode = 'shuffle'; B.sw = null; }
    } else if (B.mode === 'shuffle') {
      rv.aimY = s.y; B.mul = 1;
      const all = hide.all(B), dur = (B.lite ? 0.7 : p2 ? 0.42 : 0.55) * (1 - 0.08 * B.streak);
      if (!B.sw) {
        if (B.swaps-- <= 0 || all.length < 2) { B.mode = 'hide'; B.mt = B.lite ? 7 : 6; B.gl = 0.6; }
        else { const i = Math.floor(Math.random() * all.length); let j = Math.floor(Math.random() * (all.length - 1)); if (j >= i) j++; B.sw = { a: all[i], b: all[j], ya: all[i].ty, yb: all[j].ty, f: 0, dur }; X.sfx('whoosh'); }
      }
      if (B.sw) {
        const S = B.sw; S.f += dt / S.dur; const f = easeInOut(S.f), arc = Math.sin(Math.min(1, S.f) * Math.PI) * 46;
        S.a.y = S.ya + (S.yb - S.ya) * f; S.a.x = home - arc; S.b.y = S.yb + (S.ya - S.yb) * f; S.b.x = home + arc * 0.4;
        if (S.f >= 1) { S.a.ty = S.yb; S.b.ty = S.ya; S.a.x = S.b.x = home; B.sw = null; }
      }
    } else if (B.mode === 'hide') {
      rv.aimY = s.y; B.mul = 1.3;
      B.nerv = B.tell === 'nerv' ? clamp(B.nerv + (Math.abs(s.y - real.y) < 30 ? dt * 2.4 : -dt * 3), 0, 1) : 0;
      for (const o of hide.all(B)) { o.tx = home + Math.sin(B.t * 2 + o.ty) * 6 + (o === real ? Math.sin(B.t * 55) * 2.5 * B.nerv : 0); glide(o, 5); }
      if (B.tell === 'glint') {
        B.gl -= dt; if (B.gl <= -1.4 + (B.lite ? -0.2 : 0)) B.gl = 0.35;
        if (B.fk && !B.fk.dead) { B.fg -= dt; if (B.fg <= -1.1) B.fg = 0.35; }
      } else B.gl = 0;
      if (B.mt <= 0) { // time is up: the copies charge down their lanes, one after another
        let i = 0; for (const o of B.tg) if (!o.dead) { o.dash = X.tele(0.75) + i * 0.4; o.d0 = o.dash; i++; }
        B.mode = 'ambush'; X.sfx('laserWarn'); B.streak = Math.max(-1, B.streak - 1);
      }
    } else if (B.mode === 'ambush') {
      rv.aimY = s.y; B.mul = 1.3; let left = 0;
      for (const o of B.tg) {
        if (o.dead) continue; left++;
        if (o.go) { o.x -= (B.lite ? 480 : 640) * dt; if (live && X.touch(o.x, o.y, o.r * 0.75)) { X.hurt(); o.dead = true; popFx(o.x, o.y, '#e6d6ff', 10); } else if (o.x < -50) o.dead = true; }
        else { o.dash -= dt; o.x = home + Math.sin(B.t * 45) * 2; if (o.dash <= 0) { o.go = true; X.sfx('whoosh'); } }
      }
      B.tg = B.tg.filter(o => !o.dead);
      if (!left) { B.mode = 'show'; B.base = clamp(real.y, 150, 250); B.noIcon = false; }
    }
    rv.x = real.x; rv.y = real.y;
    for (const o of B.tg) o.flash = Math.max(0, o.flash - dt * 6);
  },
  hit(B, o) { // a copy was shot: it pops with a spring and a puff (and, as a wrong guess, spits a little fan)
    o.dead = true; popFx(o.x, o.y, '#e6d6ff', 12); X.smoke(o.x, o.y, 3, '#b8b0d8'); X.sfx('pop');
    if (B.mode === 'ambush') { X.addScore(15, o.x, o.y); B.tg = B.tg.filter(q => !q.dead); return; }
    if (B.mode === 'hide') B.wrong++;
    X.float(X.tt('f_decoy', 'Wrong one!'), o.x - 20, o.y - 30, '#e6d6ff');
    if (!B.lite && !X.harmless()) { const a = X.aim(o.x, o.y); for (const k of [-0.25, 0, 0.25]) X.shot('pellet', o.x - 20, o.y, a + k, 190); }
    B.tg = B.tg.filter(q => !q.dead);
  },
  coreHit(B, rv) {
    if (B.mode !== 'hide') return;   // found it: the copies fold back in and the round ends
    for (const o of B.tg) { X.smoke(o.x, o.y, 2, '#b8b0d8'); X.sparks(o.x, o.y, 4, '#e6d6ff', 90); }
    B.tg = []; B.sw = null; B.mode = 'show'; B.noIcon = false; B.base = clamp(rv.y, 150, 250);
    X.float(X.tt('f_found', 'Found you!'), rv.x - 30, rv.y - rv.r - 24, '#ffe066'); X.say('bot_found');
    if (B.wrong === 0) { B.streak = Math.min(2, B.streak + 1); talk(B, 'bq_lucky'); icon(B, 'q', 1.4); } else if (B.wrong >= 2) B.streak = Math.max(-1, B.streak - 1);
  },
  moves: {
    round: { icon: 'grin', max: 30, w: () => 2.6, go(B, rv) { hide.split(B, rv); }, step: B => B.mode === 'show',
      end(B, rv) { if (B.mode !== 'show') { B.tg = []; B.sw = null; B.mode = 'show'; B.noIcon = false; rv.aimY = null; } }, rest: B => B.lite ? 2.4 : 1.8 },
    kit: Object.assign({}, KIT, { w: (B, rv, br) => ((rv.phase && rv.phase.atk) || []).length && br.last !== 'kit' ? 1.3 : 0 }),
  },
  camp: B => B.mode === 'show' ? 'kit' : false,
  heat(B, rv) { // hit hard in the open: it blinks to the far side
    const real = B.real; if (B.mode !== 'show' || !real) return false;
    const y = farY(rv); X.smoke(real.x, real.y, 4, '#b8b0d8'); real.y = y; B.base = clamp(y, rv.ymin + 40, rv.ymax - 40); X.sparks(real.x, y, 10, '#e6d6ff', 160); X.sfx('whoosh');
    talk(B, 'bq_dodge'); icon(B, 'grin'); return false;
  },
  shift(B, rv) { B.tg = []; B.sw = null; B.mode = 'show'; rv.aimY = null; },
  fixed(B, rv) { B.tg = []; rv.aimY = null; },
  draw(B, c, layer, rv) {
    if (layer === 'under') { for (const o of B.tg) X.body(c, o.x, o.y, { alpha: 1, flash: o.flash }); return; }
    if (B.mode === 'show') weakMark(c, rv.x, rv.y, rv.r * 0.8, X.t, '#ffe066');
    if (B.mode === 'hide' && B.gl > 0) { // the glint: a four-point star on the real one's eye
      const k = Math.sin(B.gl / 0.35 * Math.PI), x = rv.x - rv.r * 0.3, y = rv.y - rv.r * 0.25, s = 10 + 8 * k;
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,255,230,${0.9 * k})`;
      c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill(); c.restore();
    }
  },
  draw2(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') { if (B.mode === 'ambush') for (const o of B.tg) if (!o.dead && !o.go) laneTell(c, o.y, o.x - rv.r, t, rv.r * 0.7, 1 - clamp(o.dash / (o.d0 || 1), 0, 1)); return; }
    if (B.mode !== 'hide') return;
    const fk = B.fk;
    if (fk && !fk.dead && B.fg > 0) { // the fake glint: pink, like everything that means trouble
      const k = Math.sin(B.fg / 0.35 * Math.PI), x = fk.x - rv.r * 0.3, y = fk.y - rv.r * 0.25, s = 10 + 8 * k;
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,90,160,${0.9 * k})`;
      c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill(); c.restore();
    }
    if (B.nerv > 0.25) { // nervous: sweat drops fly off the real one
      c.save(); c.fillStyle = '#9fe6ff'; c.strokeStyle = INK; c.lineWidth = 1.6; c.globalAlpha *= clamp((B.nerv - 0.25) * 2.5, 0, 1);
      for (let k = 0; k < 3; k++) { const f = (t * 1.8 + k / 3) % 1, a = -0.5 - k * 0.55, d = rv.r * 0.75 + f * 22, x = rv.x + Math.cos(a) * d, y = rv.y + Math.sin(a) * d + f * f * 12;
        c.beginPath(); c.moveTo(x, y - 6); c.quadraticCurveTo(x + 5, y + 2, x, y + 4); c.quadraticCurveTo(x - 5, y + 2, x, y - 6); c.fill(); c.stroke(); }
      c.restore();
    }
  },
};

// ================================================================================================
// Uranus · Dawwama, the whirlpool. A ring of armour plates with gaps spins round the core. It now uses the ring on purpose:
// it GUARDS (turns its thickest run of plates toward the ship and holds it there), then has to VENT (spins fast and sprays
// shots, so the gaps fly past), THROWS the plates facing the ship as returning saw discs (which leaves a hole right where the
// player is aiming) and drags the ship in. Its shots still curl in the current; a second ring joins from phase 2.
const vortex = {
  hint: 'vortex',
  ringMk(B, R, n, gaps, w) { const segs = []; for (let i = 0; i < n; i++) segs.push({ i, on: !gaps.includes(i), hp: hp1(B.lite ? 3 : 5), back: 0, flash: 0, x: 0, y: 0, r: 0, dead: false, away: false, hot: false }); return { R, n, w, a: rnd(0, TAU), segs }; },
  init(B, rv) { B.far = rv.R && rv.R.giant ? 34 : 0; B.rings = [vortex.ringMk(B, rv.r + 30 + B.far, 14, B.lite ? [0, 4, 7, 11] : [0, 7], B.lite ? 0.7 : 1)]; B.discs = []; B.guard = 0; B.fast = 0; B.pull = 0; },
  face(B, g, rv) { // the ring angle that puts the middle of its longest unbroken run of plates between the core and the ship
    const n = g.n, th = Math.atan2(X.ship.y - rv.y, X.ship.x - rv.x); let best = 0, bi = 0, run = 0;
    for (let i = 0; i < n * 2; i++) { if (g.segs[i % n].on) { run++; if (run > best && run <= n) { best = run; bi = i; } } else run = 0; }
    return th - (bi - (best - 1) / 2 + 0.5) * TAU / n;
  },
  update(B, dt, live, rv) {
    B.guard -= dt; B.fast -= dt;
    B.rings.forEach((g, gi) => {
      if (gi === 0 && B.guard > 0) g.a += clamp(wrap(vortex.face(B, g, rv) - g.a), -1.8 * dt, 1.8 * dt);
      else g.a += g.w * dt * (rv.ph >= 2 ? 1.35 : 1) * (B.fast > 0 ? 3 : 1);
      const segR = Math.PI * g.R / g.n + 3;
      for (const s of g.segs) {
        const a = g.a + (s.i + 0.5) * TAU / g.n; s.x = rv.x + Math.cos(a) * g.R; s.y = rv.y + Math.sin(a) * g.R; s.r = segR; s.flash = Math.max(0, s.flash - dt * 6);
        if (!s.on && !s.away && s.back > 0) { s.back -= dt; if (s.back <= 0) { s.on = true; s.hp = hp1(B.lite ? 3 : 5); s.flash = 1; X.sparks(s.x, s.y, 4, '#b9a6ff', 80); } }
        s.dead = !s.on;
      }
    });
    for (const d of B.discs) { // a thrown plate flies out to its mark and comes home
      d.f += dt / d.dur; d.rot += dt * 14; d.flash = Math.max(0, d.flash - dt * 6);
      const k = Math.sin(clamp(d.f, 0, 1) * Math.PI), s = d.s; d.x = s.x + (d.tx - s.x) * k; d.y = s.y + (d.ty - s.y) * k;
      if (live && !d.hitS && X.touch(d.x, d.y, d.r * 0.85)) { d.hitS = true; X.hurt(); }
      if (d.f >= 1) { d.dead = true; s.away = false; s.on = true; s.hp = hp1(B.lite ? 3 : 5); s.flash = 1; X.sfx('plate'); }
    }
    B.discs = B.discs.filter(d => !d.dead);
    if (!B.lite) for (const s of X.eshots) if (!s.dead && !s.straight) { // the current curls every enemy shot a little
      const a = Math.atan2(s.vy, s.vx) + dt * 0.55, v = Math.hypot(s.vx, s.vy); s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.ang = a;
    }
  },
  moves: {
    guard: { icon: 'guard', w: () => 1.2,
      go(B) { B.guard = B.lite ? 2.4 : 3.4; }, step: B => B.guard <= 0,
      end(B) { B.guard = 0; queue(B, 'vent', 'bang'); }, rest: 0.3 },
    vent: { icon: 'bang', w: () => 1.4,   // it cannot hold its breath: the ring races and a fan of shots walks toward the ship
      go(B, rv) {
        B.fast = 2.5; const n = B.lite ? 7 : 12, arms = rv.ph >= 1 && !B.lite ? 2 : 1, dir = X.ship.y > rv.y ? 1 : -1;
        for (let i = 0; i < n; i++) X.later(0.35 + i * 0.16, () => { for (let q = 0; q < arms; q++) X.shot('pellet', rv.x - rv.r * 0.5, rv.y, Math.PI - dir * (0.9 - i * 1.8 / n) + q * 0.55 * dir, 200); X.sfx('eshot'); });
      },
      step: (B, dt, live, rv, br) => br.mt > 2.5, end(B) { B.fast = 0; }, rest: 1.6 },
    throw: { icon: 'aim', lite: false, w: B => B.rings[0] && B.rings[0].segs.filter(s => s.on).length >= 4 ? 1.5 : 0,
      go(B, rv, br) {
        const g = B.rings[0], th = Math.atan2(X.ship.y - rv.y, X.ship.x - rv.x), off = s => Math.abs(wrap(g.a + (s.i + 0.5) * TAU / g.n - th));
        br.pl = g.segs.filter(s => s.on).sort((a, b) => off(a) - off(b)).slice(0, B.lite ? 1 : rv.ph >= 1 ? 3 : 2);
        for (const s of br.pl) s.hot = true; br.tl = X.tele(0.7); br.k = 0; X.sfx('laserWarn');
      },
      step(B, dt, live, rv, br) {
        if (!br.k && br.mt >= br.tl) {
          br.k = 1; const sh = X.ship;
          br.pl.forEach((s, i) => {
            s.hot = false; if (!s.on) return; s.on = false; s.away = true; s.back = 0;
            const ty = i === 0 ? sh.y : i === 1 ? sh.y + (Math.abs(sh.vy || 0) > 30 ? sh.vy * 0.5 : 72) : sh.y - 72;
            B.discs.push({ disc: true, s, x: s.x, y: s.y, tx: clamp(sh.x - 10, 50, X.W * 0.4), ty: clamp(ty, X.Y_MIN, X.Y_MAX), f: -i * 0.12, dur: B.lite ? 2.8 : 2.4, r: 14, hp: hp1(2), rot: 0, flash: 0, dead: false, hitS: false });
          });
          X.sfx('whoosh');
        }
        return br.k && !B.discs.length;
      },
      end(B, rv, br) { for (const s of br.pl || []) s.hot = false; }, rest: 1.4 },
    suck: { icon: 'eye', lite: false, w: (B, rv) => rv.ph >= 1 ? 1.2 : 0.6,   // the whirlpool drags the ship in while it shoots
      go(B, rv, br) { B.pull = 2.6; br.cd = 0.5; br.k = 0; talk(B, 'bq_pull'); X.sfx('whoosh'); },
      step(B, dt, live, rv, br) {
        if (live) X.pull(80, clamp((rv.y - X.ship.y) / 40, -1, 1) * 60, dt);
        br.cd -= dt; if (br.cd <= 0 && live) { br.cd = 0.55; X.shot('pellet', rv.x - rv.r * 0.5, rv.y, br.k++ % 2 ? lead(rv.x, rv.y, 190) : X.aim(rv.x, rv.y), 190); X.sfx('eshot'); }
        B.pull -= dt; return B.pull <= 0;
      },
      end(B) { B.pull = 0; }, rest: 1.6 },
    kit: Object.assign({ ph: 1 }, KIT),
  },
  camp: (B, rv, br) => br.last !== 'throw' ? 'throw' : B.lite ? 'vent' : 'suck',
  heat: B => B.guard > 0 ? null : 'guard',
  shift(B, rv) { if (rv.ph === 1 && !B.lite && B.rings.length < 2) B.rings.push(vortex.ringMk(B, rv.r + 56 + (B.far || 0), 18, [0, 6, 12], -0.75)); },
  targets(B) { const o = []; for (const g of B.rings) for (const s of g.segs) if (s.on) o.push(s); return o.concat(B.discs); },
  hit(B, s, d) {
    s.hp -= d; s.flash = 1;
    if (s.hp > 0) { X.sfx('shieldHit'); return; }
    if (s.disc) { s.dead = true; s.s.away = false; s.s.back = 4.5; X.explode(s.x, s.y, 10, { shard: 'metal', spark: '#b9a6ff', ringCol: '#b9a6ff' }); X.sfx('plate'); X.addScore(20, s.x, s.y); return; }
    s.on = false; s.dead = true; s.back = 4.5; X.sparks(s.x, s.y, 8, '#b9a6ff', 140); X.sfx('plate'); X.addScore(10, s.x, s.y);
  },
  fixed(B) { B.rings = []; B.discs = []; B.pull = 0; },
  draw(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') { // the current: faint swirling arcs, only while it is pulling the ship in
      if (!(B.pull > 0)) return;
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let k = 0; k < 5; k++) { const r = rv.r + 110 + k * 40, a = -t * (1.2 - k * 0.1) + k; c.strokeStyle = `rgba(185,166,255,${0.12 - k * 0.014})`; c.lineWidth = 3; c.beginPath(); c.arc(rv.x, rv.y, r, a, a + 1.2); c.stroke(); }
      c.restore();
      return;
    }
    // v3.5: the armour is separate plates flying round the body (no ring drawn across the art); a missing plate is just a gap
    for (const g of B.rings) {
      const step = TAU / g.n, len = g.R * step * 0.84, th = 13;
      for (const s of g.segs) {
        if (!s.on) continue;
        const a = g.a + (s.i + 0.5) * step;
        c.save(); c.translate(rv.x + Math.cos(a) * g.R, rv.y + Math.sin(a) * g.R); c.rotate(a + Math.PI / 2);
        c.fillStyle = s.flash > 0.4 ? '#ffffff' : '#8f86c9'; c.strokeStyle = INK; c.lineWidth = 2.4; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-len / 2, th / 2); c.lineTo(-len / 2 + 3, -th / 2); c.lineTo(len / 2 - 3, -th / 2); c.lineTo(len / 2, th / 2); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-len / 2 + 4, -th / 2 + 2.2, len - 8, 2.2);
        c.fillStyle = 'rgba(28,21,48,.22)'; c.fillRect(-len / 2 + 2, th / 2 - 4, len - 4, 2.6);
        c.fillStyle = '#e6e0ff'; c.beginPath(); c.arc(-len / 2 + 6, 1, 1.5, 0, TAU); c.arc(len / 2 - 6, 1, 1.5, 0, TAU); c.fill();
        c.restore();
      }
    }
  },
  draw2(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') {
      if (B.pull > 0) { // the drag: streaks running from the ship into the whirlpool
        const s = X.ship; c.save(); c.strokeStyle = 'rgba(185,166,255,.5)'; c.lineWidth = 2.5; c.lineCap = 'round'; c.setLineDash([12, 14]); c.lineDashOffset = -t * 240;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(s.x - 30, s.y + k * 26); c.quadraticCurveTo((s.x + rv.x) / 2, (s.y + rv.y) / 2 + k * 60, rv.x - rv.r, rv.y + k * 10); c.stroke(); }
        c.restore();
      }
      for (const d of B.discs) if (d.f < 0.5) { c.save(); c.strokeStyle = 'rgba(255,90,110,.75)'; c.lineWidth = 2.5; c.setLineDash([5, 6]); c.lineDashOffset = t * 50; c.beginPath(); c.arc(d.tx, d.ty, 18, 0, TAU); c.stroke(); c.restore(); }
      return;
    }
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,90,110,${0.6 + 0.3 * Math.sin(t * 24)})`; c.lineWidth = 3;
    for (const g of B.rings) for (const s of g.segs) if (s.hot && s.on) { c.beginPath(); c.arc(s.x, s.y, s.r + 3, 0, TAU); c.stroke(); }
    c.restore();
    for (const d of B.discs) {
      c.save(); c.translate(d.x, d.y); c.rotate(d.rot); c.fillStyle = d.flash > 0.4 ? '#ffffff' : '#7f74b8'; c.strokeStyle = INK; c.lineWidth = 2.2; c.lineJoin = 'round';
      c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? d.r + 2 : d.r - 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#c7cedb'; c.beginPath(); c.arc(0, 0, 3.6, 0, TAU); c.fill(); c.stroke(); c.restore();
    }
  },
};

// ================================================================================================
// Neptune 1 · Kabeer, the Scrap King. Its body is a wall of scrap blocks with the core inside; red blocks are guns. It watches
// where the player digs: new scrap goes to the hole in the ship's lane first, a hard hit on the core makes it SEAL the tunnel
// at once, and it slides a thick part of the wall in front of the ship. It throws the blocks nearest the ship (which opens the
// wall right there) and builds gun turrets where the player likes to fly.
const builder = {
  hint: 'builder',
  init(B, rv) {
    B.tg = []; B.fly = []; B.thrown = []; B.tur = []; B.cd = 2; const r = rv.r, sz = 23;
    const slots = [];
    for (let row = -3; row <= 3; row++) for (const col of [0, 1]) slots.push([-(r + 10) - col * sz, row * sz]);
    for (let k = -2; k <= 2; k++) { slots.push([k * sz * 0.95, -(r + 12)]); slots.push([k * sz * 0.95, r + 12]); }
    B.slots = slots.map((p, i) => ({ dx: p[0], dy: p[1], i, gun: [3, 6, 11, 16].includes(i) && !B.lite, x: 0, y: 0, r: 12, hp: hp1(2), on: true, flash: 0, cd: rnd(2, 4), seed: i * 1.7, dead: false, hot: false, n: 0 }));
    if (B.lite) B.slots = B.slots.filter((s, i) => i % 2 === 0 || s.dx > -(r + 20));
  },
  hole: B => B.slots.some(s => !s.on && s.dx < 0 && Math.abs(s.y - X.ship.y) < 14),
  plan(B, rv) { // where to stand so that a row of the wall that is still whole is in front of the ship
    const rows = {}, need = B.lite ? 1 : 2; let best = null;
    for (const s of B.slots) if (s.dx < -rv.r) { const k = Math.round(s.dy); rows[k] = (rows[k] || 0) + (s.on ? 1 : 0); }
    for (const k in rows) { if (rows[k] < need) continue; const y = X.ship.y - +k; if (y < rv.ymin || y > rv.ymax || Math.abs(y - rv.y) < 12) continue; if (best == null || Math.abs(y - rv.y) < Math.abs(best - rv.y)) best = y; }
    return best;
  },
  volley(B) { for (const s of B.slots) if (s.on && s.gun) X.shot('pellet', s.x - 10, s.y, s.n++ % 2 ? lead(s.x, s.y, 210) : X.aim(s.x, s.y), 210); X.sfx('eshot'); },
  update(B, dt, live, rv) {
    const p2 = rv.ph >= 1, on = live && X.fight(), sy = X.ship.y;
    for (const s of B.slots) {
      s.x = rv.x + s.dx; s.y = rv.y + s.dy; s.flash = Math.max(0, s.flash - dt * 6); s.dead = !s.on;
      if (s.on && s.gun && on) { s.cd -= dt; if (s.cd <= 0) { s.cd = rnd(3, 4.2); X.shot('pellet', s.x - 10, s.y, s.n++ % 2 ? lead(s.x, s.y, 210) : X.aim(s.x, s.y), 210); X.sfx('eshot'); } }
    }
    // rebuild: scrap flies in to an empty slot, and three times in four it goes to the hole in front of the ship
    B.cd -= dt;
    const empty = B.slots.filter(s => !s.on && !s.claimed);
    if (B.cd <= 0 && empty.length && on) {
      B.cd = B.lite ? 2.2 : p2 ? 0.9 : 1.3;
      const s = Math.random() < 0.75 ? empty.sort((a, b) => Math.abs(a.y - sy) - Math.abs(b.y - sy))[0] : empty[Math.floor(Math.random() * empty.length)], top = Math.random() < 0.5; s.claimed = true;
      const x0 = rnd(X.W * 0.5, X.W * 0.9), y0 = top ? -20 : X.H + 20;
      B.fly.push({ slot: s, x: x0, y: y0, x0, y0, f: 0, r: 11, hp: hp1(1), rot: rnd(0, 6), seed: s.seed, flash: 0, dead: false });
    }
    for (const o of B.fly) {
      if (o.dead) continue;
      o.f += dt / 1.3; o.rot += dt * 5; o.flash = Math.max(0, o.flash - dt * 6);
      const tx = o.slot.x, ty = o.slot.y, f = easeInOut(Math.max(0, o.f));
      o.x = o.x0 + (tx - o.x0) * f; o.y = o.y0 + (ty - o.y0) * f + Math.sin(f * Math.PI) * (o.y0 < 0 ? 40 : -40);
      if (o.f >= 1) { o.dead = true; o.slot.on = true; o.slot.claimed = false; o.slot.hp = hp1(2); o.slot.flash = 1; X.sfx('plate'); }
    }
    B.fly = B.fly.filter(o => !o.dead);
    for (const o of B.thrown) {
      if (o.dead) continue;
      o.x += o.vx * dt; o.y += o.vy * dt; o.rot += dt * 7; o.flash = Math.max(0, o.flash - dt * 6);
      if (o.x < -30 || o.y < -30 || o.y > X.H + 30) o.dead = true;
      else if (live && X.touch(o.x, o.y, o.r)) { o.dead = true; X.hurt(); popFx(o.x, o.y, '#ffb38a', 6); }
    }
    B.thrown = B.thrown.filter(o => !o.dead);
    for (const T of B.tur) { // a turret it built: two shots at a time, at the ship and ahead of it
      T.f = Math.min(1, T.f + dt / 0.9); T.flash = Math.max(0, T.flash - dt * 6);
      if (T.f < 1 || !on) continue;
      T.cd -= dt; if (T.cd > 0) continue;
      T.cd = 2.6; for (let i = 0; i < 2; i++) X.later(i * 0.22, () => { if (!T.dead) { X.shot('pellet', T.x - 14, T.y, i ? lead(T.x, T.y, 220) : X.aim(T.x, T.y), 220); X.sfx('eshot'); } });
    }
    B.tur = B.tur.filter(T => !T.dead);
  },
  moves: {
    throw: { icon: 'aim', lite: false,   // the front blocks nearest the ship shake loose and fly at it
      w: (B, rv) => B.slots.filter(s => s.on && s.dx < -(rv.r + 20)).length >= 2 ? 1.5 : 0,
      go(B, rv, br) {
        br.pl = B.slots.filter(s => s.on && s.dx < -(rv.r + 20)).sort((a, b) => Math.abs(a.y - X.ship.y) - Math.abs(b.y - X.ship.y)).slice(0, rv.ph >= 1 ? 3 : 2);
        for (const s of br.pl) s.hot = true; br.tl = X.tele(0.75); X.sfx('laserWarn');
      },
      step(B, dt, live, rv, br) {
        if (br.mt < br.tl) return false;
        br.pl.forEach((s, i) => {
          s.hot = false; if (!s.on) return; s.on = false; s.dead = true;
          const a = i % 2 ? lead(s.x, s.y, 210) : X.aim(s.x, s.y); B.thrown.push({ x: s.x, y: s.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 12, hp: hp1(1), rot: 0, seed: s.seed, flash: 0, dead: false });
        });
        X.sfx('whoosh'); X.shake(4); return true;
      },
      end(B, rv, br) { for (const s of br.pl || []) s.hot = false; }, rest: 1.5 },
    turret: { icon: 'eye', lite: false, w: (B, rv) => B.tur.length < (rv.ph >= 1 ? 2 : 1) ? 1.3 : 0,   // built where the player likes to fly
      go(B, rv, br) {
        const ys = [X.Y_MIN + 50, 205, X.Y_MAX - 50]; let y = ys[br.band.indexOf(Math.max(br.band[0], br.band[1], br.band[2]))];
        if (B.tur.some(T => Math.abs(T.y - y) < 40)) y = y > 205 ? ys[0] : ys[2];
        B.tur.push({ tur: true, x: X.W * 0.56, y, r: 15, hp: hp1(5), f: 0, cd: 1.4, flash: 0, dead: false, seed: 0.5, rot: 0 }); X.sfx('plate'); X.smoke(X.W * 0.56, y, 3, '#8a86a0');
      }, rest: 1.4 },
    shift: { icon: 'guard', w: (B, rv) => builder.hole(B) && builder.plan(B, rv) != null ? 1.4 : 0,   // slides a whole part of the wall in front of the tunnel, then every gun fires
      go(B, rv, br) { const y = builder.plan(B, rv); if (y != null) rv.dodge = { y, t: 1.6 }; br.k = 0; X.sfx('whoosh'); },
      step(B, dt, live, rv, br) { if (!br.k && br.mt > 0.9) { br.k = 1; if (live) builder.volley(B); } return br.mt > 1.3; }, rest: 1.3 },
    rally: { icon: 'guard', w: B => B.slots.filter(s => !s.on && !s.claimed).length >= 5 ? 1.8 : 0,   // too many holes: a whole flight of scrap at once (shoot it down on the way in)
      go(B) {
        const sy = X.ship.y, em = B.slots.filter(s => !s.on && !s.claimed).sort((a, b) => Math.abs(a.y - sy) - Math.abs(b.y - sy)).slice(0, B.lite ? 2 : 4);
        em.forEach((s, i) => { s.claimed = true; const x0 = rnd(X.W * 0.5, X.W * 0.9), y0 = i % 2 ? -20 : X.H + 20; B.fly.push({ slot: s, x: x0, y: y0, x0, y0, f: -i * 0.15, r: 11, hp: hp1(1), rot: rnd(0, 6), seed: s.seed, flash: 0, dead: false }); });
        X.sfx('whoosh');
      }, rest: 1.6 },
    kit: Object.assign({}, KIT, { w: (B, rv) => ((rv.phase && rv.phase.atk) || []).length ? 0.7 : 0 }),
  },
  camp: (B, rv, br) => B.lite ? null : br.last !== 'throw' ? 'throw' : B.tur.length < 2 ? 'turret' : 'rally',
  heat(B) { // the core was hit hard through the tunnel: the blocks in the ship's lane come back at once
    const sy = X.ship.y, em = B.slots.filter(s => !s.on).sort((a, b) => Math.abs(a.y - sy) - Math.abs(b.y - sy)).slice(0, B.lite ? 2 : 3);
    for (const s of em) { s.on = true; s.claimed = false; s.hp = hp1(2); s.flash = 1; X.sparks(s.x, s.y, 5, '#ffcf6a', 110); }
    if (!em.length) return null;
    X.sfx('plate'); talk(B, 'bq_seal'); icon(B, 'guard', 1.6); return false;
  },
  targets(B) { return B.slots.filter(s => s.on).concat(B.fly, B.thrown, B.tur); },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.hp > 0) { X.sfx('shieldHit'); return; }
    o.dead = true; if (o.slot) o.slot.claimed = false;
    if ('on' in o) o.on = false;
    X.explode(o.x, o.y, o.tur ? 16 : 10, { shard: 'metal', spark: '#ffcf6a', ringCol: '#ffb347' }); X.sfx('plate'); X.addScore(o.tur ? 40 : 10, o.x, o.y);
    if (o.tur || (!('on' in o) && Math.random() < 0.4)) X.coin(o.x, o.y);
  },
  fixed(B) { for (const s of B.slots) if (s.on) X.sparks(s.x, s.y, 3, '#ffcf6a', 90); B.slots.forEach(s => s.on = false); B.fly.length = 0; B.thrown = []; B.tur = []; },
  block(c, o, t, gun) {
    c.save(); c.translate(o.x, o.y); c.rotate(o.rot || 0);
    c.fillStyle = o.flash > 0.4 ? '#ffffff' : gun ? '#c8503e' : ['#8d94a8', '#a39b86', '#7f8aa0'][Math.floor(o.seed * 3) % 3]; c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.roundRect(-11, -11, 22, 22, 3); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(28,21,48,.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-11, -3); c.lineTo(11, -3); c.moveTo(-3, -11); c.lineTo(-3, 11); c.stroke();
    c.fillStyle = '#c7cedb'; c.beginPath(); c.arc(-7, -7, 1.5, 0, TAU); c.arc(7, 7, 1.5, 0, TAU); c.fill();
    if (gun) { c.fillStyle = '#3b3f52'; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.roundRect(-18, -3, 10, 6, 1.5); c.fill(); c.stroke(); c.fillStyle = (Math.floor(t * 3) % 2) ? '#ff5a4a' : '#ffd23f'; c.beginPath(); c.arc(4, 3, 2.2, 0, TAU); c.fill(); }
    c.restore();
  },
  draw(B, c, layer) {
    const t = X.t;
    if (layer === 'under') return;
    for (const s of B.slots) if (s.on) builder.block(c, s, t, s.gun);
    for (const o of B.fly) { c.save(); c.globalAlpha = 0.35; c.strokeStyle = '#ffcf6a'; c.lineWidth = 3; c.setLineDash([2, 6]); c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.slot.x, o.slot.y); c.stroke(); c.restore(); builder.block(c, o, t, false); }
    for (const o of B.thrown || []) builder.block(c, o, t, false);
  },
  draw2(B, c, layer) {
    if (layer !== 'over') return;
    const t = X.t;
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,90,110,${0.6 + 0.3 * Math.sin(t * 24)})`; c.lineWidth = 3;
    for (const s of B.slots) if (s.hot && s.on) { c.beginPath(); c.arc(s.x + Math.sin(t * 60 + s.i) * 1.5, s.y, 16, 0, TAU); c.stroke(); }
    c.restore();
    for (const T of B.tur) {
      const f = easeOut(T.f);
      c.save(); c.translate(T.x, T.y); c.scale(f, f);
      c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-6, 10); c.lineTo(-13, 24); c.moveTo(6, 10); c.lineTo(13, 24); c.stroke();
      c.translate(-T.x, -T.y); builder.block(c, T, t, true); c.restore();
    }
  },
};

// ================================================================================================
// Neptune 2 · Sindan, the anvil hammer. A red column shows where the hammer will fall; it slams, sends a shockwave along the
// floor and sticks for a moment (its glowing joint takes double damage). It now aims AHEAD of a moving ship and learns which
// way the player runs; it can shift the column at the last moment, sweep sideways along the ship's lane, smash the ground by
// its own feet to rain debris, and hold the hammer over its core as a shield when it is hit hard.
const hammer = {
  hint: 'hammer',
  init(B, rv) { B.mode = 'idle'; B.mt = 0; B.hx = rv.x - 120; B.hy = rv.y - rv.r - 40; B.waves = []; B.tg = []; B.side = 1; B.combo = 0; B.dd = 0; B.col = 200; B.row = 200; B.q = false; B.fake = false; },
  base(rv) { return [rv.x - rv.r * 0.2, rv.y - rv.r * 0.85]; },
  strike(B, dt, live, rv) { // raise over the column → slam → stuck; true when it pulls free
    const top = X.Y_MIN - 6, bot = X.Y_MAX + 6, s = X.ship; B.mt -= dt;
    if (B.mode === 'raise') {
      const ty = B.side > 0 ? top : bot; B.hx += (B.col - B.hx) * Math.min(1, dt * 6); B.hy += (ty - B.hy) * Math.min(1, dt * 6);
      if (B.fake && B.mt < 0.15) { B.fake = false; B.col = clamp(s.x + (s.vxp || 0) * 0.2, 70, X.W * 0.45); B.mt = X.tele(0.5); X.sfx('laserWarn'); talk(B, 'bq_feint'); icon(B, 'grin'); }   // the column jumps to where the ship ran
      if (B.mt <= 0) { B.mode = 'slam'; B.f = 0; B.hit = false; if (!B.q) { const dx = s.x - B.col; B.dd = B.dd * 0.5 + (Math.abs(dx) > 20 ? Math.sign(dx) * 0.6 : 0); } }
    } else if (B.mode === 'slam') {
      B.f += dt / 0.2; const y0 = B.side > 0 ? top : bot, y1 = B.side > 0 ? X.Y_MAX - 22 : X.Y_MIN + 22;
      B.hx = B.col; B.hy = y0 + (y1 - y0) * easeOut(B.f);
      if (!B.hit && live && Math.abs(s.x - B.col) < 40 && (B.side > 0 ? s.y < B.hy + 26 : s.y > B.hy - 26)) { B.hit = true; X.hurt(); }
      if (B.f >= 1) {
        B.mode = 'stuck'; B.mt = B.lite ? 2.3 : 1.7; X.shake(10); X.sfx('tank'); X.sfx('boomL'); X.smoke(B.col, B.hy, 5, '#8a86a0'); X.sparks(B.col, B.hy, 14, '#ffcf6a', 220);
        if (B.q) { // the ground shakes loose: debris comes down on the ship, where it is and where it would run
          const n = B.lite ? 2 : rv.ph >= 2 ? 4 : 3, w = X.tele(1), dir = s.y < 200 ? 1 : -1, off = [0, 92, -92, 184];
          for (let i = 0; i < n; i++) X.zone(s.x + (i ? rnd(-50, 50) : 0), s.y + off[i] * dir, 42, w + i * 0.22);
        } else if (!B.lite) for (const d of [-1, 1]) B.waves.push({ x: B.col, y: B.side > 0 ? X.Y_MAX - 14 : X.Y_MIN + 14, d, v: 330, hit: false, life: 2 });
      }
    } else if (B.mode === 'stuck') return B.mt <= 0;
    return false;
  },
  update(B, dt, live, rv) {
    B.tg.length = 0; const [bx, by] = hammer.base(rv), k = Math.min(1, dt * 4.5);
    if (B.mode === 'idle' || B.mode === 'back') { B.hx += (bx - 70 - B.hx) * k; B.hy += (by - 30 - B.hy) * k; }
    else if (B.mode === 'guard') { B.hx += (rv.x - rv.r - 26 - B.hx) * Math.min(1, dt * 9); B.hy += (rv.y - B.hy) * Math.min(1, dt * 9); }
    else if (B.mode === 'stuck') { const j = B.joint || (B.joint = { x: 0, y: 0, r: 22, dead: false, flash: 0 }); B.tg.push(j); j.x = B.hx; j.y = B.hy - B.side * 30; j.flash = Math.max(0, j.flash - dt * 6); }
    for (const w of B.waves) {
      w.x += w.d * w.v * dt; w.life -= dt;
      if (!w.hit && live && Math.abs(X.ship.x - w.x) < 18 && Math.abs(X.ship.y - w.y) < 26) { w.hit = true; X.hurt(); }
    }
    B.waves = B.waves.filter(w => w.life > 0 && w.x > -20 && w.x < X.W + 20);
  },
  moves: {
    slam: { icon: 'bang', w: () => 2,
      go(B, rv, br) {
        const s = X.ship, p2 = rv.ph >= 1 && !B.lite;
        B.q = false; B.side = p2 && Math.random() < 0.5 ? -1 : 1;   // 1: falls from the top, -1: rises from the floor
        let col = s.x + (s.vxp || 0) * 0.3;
        if (!B.lite && Math.abs(B.dd) > 0.8) { col += Math.sign(B.dd) * 32; if (!B.readSaid) { B.readSaid = true; if (talk(B, 'bq_read', true)) icon(B, 'eye', 1.6); } }   // it has seen which way the player runs
        B.col = clamp(col + rnd(-12, 12), 70, X.W * 0.45); B.fake = p2 && Math.random() < 0.35;
        B.mode = 'raise'; B.mt = X.tele(B.lite ? 1.4 : 1.05); X.sfx('laserWarn');
      },
      step: (B, dt, live, rv) => hammer.strike(B, dt, live, rv),
      end(B) { B.mode = 'back'; B.fake = false; },
      rest: (B, rv) => B.lite ? 2.2 : rv.ph >= 2 ? (B.combo++ % 2 ? 1.5 : 0.35) : rv.ph >= 1 ? 1.4 : 1.9 },
    sweep: { icon: 'aim', w: B => B.lite ? 0.7 : 1.5,   // sideways along the ship's lane, then it sticks on the way back
      go(B, rv, br) { B.side = 1; B.mode = 'row'; B.row = X.ship.y; br.tl = X.tele(B.lite ? 1.3 : 1); X.sfx('laserWarn'); },
      step(B, dt, live, rv, br) {
        const s = X.ship;
        if (B.mode === 'row') {
          if (br.mt < br.tl - 0.3) B.row += (clamp(s.y + (rv.ph >= 1 ? (s.vy || 0) * 0.15 : 0), X.Y_MIN + 24, X.Y_MAX - 24) - B.row) * Math.min(1, dt * 6);
          B.hx += (X.W * 0.56 - B.hx) * Math.min(1, dt * 6); B.hy += (B.row - B.hy) * Math.min(1, dt * 8);
          if (br.mt >= br.tl) { B.mode = 'sweep'; B.hit = false; X.sfx('whoosh'); }
        } else if (B.mode === 'sweep') {
          B.hx -= (B.lite ? 520 : 720) * dt; B.hy = B.row;
          if (!B.hit && live && Math.abs(s.y - B.row) < 34 && Math.abs(s.x - B.hx) < 46) { B.hit = true; X.hurt(); }
          if (B.hx < 50) { B.mode = 'rebound'; X.shake(7); X.sfx('tank'); X.sparks(B.hx, B.hy, 12, '#ffcf6a', 200); }
        } else if (B.mode === 'rebound') { B.hx += 420 * dt; if (B.hx >= X.W * 0.47) { B.mode = 'stuck'; B.mt = B.lite ? 2.2 : 1.6; } }
        else if (B.mode === 'stuck') { B.mt -= dt; return B.mt <= 0; }
        return false;
      },
      end(B) { B.mode = 'back'; }, rest: 1.5 },
    quake: { icon: 'bang', w: B => B.lite ? 0.5 : 1.2,   // a greedy one: it hits the ground at its own feet, so the joint is right there to shoot
      go(B, rv) { B.q = true; B.side = 1; B.fake = false; B.col = rv.x - rv.r - 110; B.mode = 'raise'; B.mt = X.tele(0.8); X.sfx('laserWarn'); },
      step: (B, dt, live, rv) => hammer.strike(B, dt, live, rv),
      end(B) { B.mode = 'back'; B.q = false; }, rest: 1.5 },
    guard: { icon: 'guard', w: () => 0,   // hit hard: the hammer head covers the core for a moment while it shoots
      go(B, rv, br) { B.mode = 'guard'; B.side = 1; B.open = false; br.dur = Math.max(2.4, kit(B, rv)); },
      step: (B, dt, live, rv, br) => br.mt > br.dur, end(B) { B.mode = 'back'; B.open = true; }, rest: 0.9 },
  },
  camp: (B, rv, br) => br.last === 'slam' ? 'sweep' : 'slam',
  heat: B => B.lite || B.mode === 'guard' ? null : 'guard',
  targets(B) { return B.tg; },
  hit(B, o, d) { o.flash = 1; X.dmgRival(d * 2, 'bolt'); X.sparks(o.x, o.y, 4, '#ffe066', 140); },
  fixed(B) { B.mode = 'back'; B.waves.length = 0; B.tg.length = 0; },
  draw(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') {
      if (B.mode === 'raise') { // the red column where it will land
        const f = 1 - clamp(B.mt / 1.2, 0, 1), a = 0.12 + 0.18 * f + 0.06 * Math.sin(t * 20);
        c.save(); c.fillStyle = `rgba(255,50,70,${a})`; c.fillRect(B.col - 40, 0, 80, X.H);
        c.strokeStyle = `rgba(255,90,100,${0.5 + 0.3 * f})`; c.lineWidth = 2; c.setLineDash([10, 8]); c.lineDashOffset = -t * 80 * B.side;
        c.beginPath(); c.moveTo(B.col - 40, 0); c.lineTo(B.col - 40, X.H); c.moveTo(B.col + 40, 0); c.lineTo(B.col + 40, X.H); c.stroke(); c.restore();
      }
      for (const w of B.waves) { // shockwave: a bright arc running along the floor or ceiling
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,200,120,${clamp(w.life, 0, 1) * 0.8})`;
        c.beginPath(); c.ellipse(w.x, w.y, 18, 22, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,230,.8)'; c.beginPath(); c.ellipse(w.x, w.y, 7, 14, 0, 0, TAU); c.fill(); c.restore();
      }
      return;
    }
    // the arm: shoulder at the boss, an elbow, the hammer head
    const [bx, by] = hammer.base(rv), ex = (bx + B.hx) / 2 + 20, ey = Math.min(by, B.hy) - 40 * B.side;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = INK; c.lineWidth = 16; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.lineTo(B.hx, B.hy - B.side * 30); c.stroke();
    c.strokeStyle = '#6a7088'; c.lineWidth = 10; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.lineTo(B.hx, B.hy - B.side * 30); c.stroke();
    c.fillStyle = '#4a4f63'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(ex, ey, 9, 0, TAU); c.fill(); c.stroke();
    // anvil head (flat face toward where it strikes)
    c.translate(B.hx, B.hy); if (B.side < 0) c.scale(1, -1);
    c.fillStyle = '#5b6178'; c.beginPath(); c.moveTo(-40, -16); c.lineTo(40, -16); c.lineTo(30, 4); c.lineTo(36, 22); c.lineTo(-36, 22); c.lineTo(-30, 4); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#8d94a8'; c.beginPath(); c.rect(-34, 12, 68, 10); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-32, -11); c.lineTo(28, -11); c.stroke();
    c.restore();
    const jx = B.hx, jy = B.hy - B.side * 30, stuck = B.mode === 'stuck';
    c.save(); c.fillStyle = stuck ? '#ffd23f' : '#3b3f52'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(jx, jy, 11, 0, TAU); c.fill(); c.stroke(); c.restore();
    if (stuck) weakMark(c, jx, jy, 12, t, '#ffe066');
  },
  draw2(B, c, layer) { if (layer === 'under' && B.mode === 'row') laneTell(c, B.row, X.W * 0.56, X.t, 32, B.br && B.br.tl ? clamp(B.br.mt / B.br.tl, 0, 1) : 1); },
};

export const STYLES = { clam, bubble, hornet, magnet, search, hide, vortex, builder, hammer };

// ================================================================================================
// engine-facing api
// Zero studies the player: it runs the three styles that hit this player the most (worst last). Unknown player: its own three.
function adaptSeq(seq) {
  const s = mem().s, pool = Object.keys(STYLES).filter(k => k !== 'clam' && (s[k] | 0) > 0).sort((a, b) => s[b] - s[a]).slice(0, 3);
  if (pool.length < 2) return { seq, studied: false };
  for (const k of seq) if (pool.length < 3 && !pool.includes(k)) pool.push(k);
  return { seq: pool.reverse(), studied: true };
}
const KEEP = ['name', 'S', 'seq', 'lite', 'stage', 't', 'br', 'studied'];   // (a style's own fields, like the vortex's B.far, are rebuilt by its init)
const FRESH = S => ({ tg: [], ownMove: false, quiet: true, mul: 1, open: true, atkK: 1, hint: S.hint, noIcon: false });   // quiet: nothing fires on a timer, the brain calls every shot
export function make(style, rv, lite, stage = lite ? 1 : 2) {
  const ad = Array.isArray(style) ? adaptSeq(style) : null, seq = ad ? ad.seq : null, name = seq ? seq[0] : style, S = STYLES[name];
  if (!S) return null;
  const B = Object.assign({ name, S, seq, lite: !!lite, stage, t: 0, br: null, studied: !!(ad && ad.studied) }, FRESH(S));
  S.init(B, rv); return B;
}
function abortMove(B, rv) {
  const br = B.br; if (!br) return;
  if (br.mv) { const M = MV(B, br.mv); if (M && M.end) M.end(B, rv, br); br.mv = null; }
  br.next = null;
}
function swap(B, rv, name) { // Zero switches signature with each phase
  const S = STYLES[name]; if (!S || S === B.S) return;
  if (B.S.fixed) B.S.fixed(B, rv);
  for (const k of Object.keys(B)) if (!KEEP.includes(k)) delete B[k];
  Object.assign(B, { name, S }, FRESH(S));
  rv.aimY = null; S.init(B, rv);
  if (B.br) { B.br.fav = favOf(B, B.br.m); B.br.favSaid = false; B.br.last = B.br.last2 = null; }
}
// how far the style reaches above/below (and right of) the core, so game.js keeps it on screen
const EXT = { clam: r => r * 1.3, magnet: r => r + 48, vortex: (r, B) => B.lite ? r + 38 : r + 64 + (B.far || 0), builder: r => r + 45 };
export function ext(B, rv) { const f = EXT[B.name]; return f ? f(rv.r, B) : rv.r; }
export function update(B, dt, live, rv) {
  B.t += dt; for (const o of B.tg || []) if (o.flash) o.flash = Math.max(0, o.flash - dt * 6);
  if (!B.br) B.br = mkBrain(B, rv);
  sense(B, dt, live, rv);
  B.S.update(B, dt, live, rv, B.br);
  runBrain(B, dt, live, rv);
}
const targets = B => B.S.targets ? B.S.targets(B) : (B.tg || []);
export function bolt(B, b, rv) {
  for (const o of targets(B)) if (!o.dead && (b.x - o.x) ** 2 + (b.y - o.y) ** 2 < (o.r + 4) ** 2) { b.dead = true; X.sparks(b.x, b.y, 2, '#ffd27a', 100, -60); B.S.hit(B, o, b.dmg, rv); return true; }
  if (!B.open && (b.x - rv.x) ** 2 + (b.y - rv.y) ** 2 < (rv.r * 1.3 + 4) ** 2) { b.dead = true; ping(b.x, b.y); B.pings = (B.pings || 0) + 1; return true; }
  return false;
}
// the laser weapon: the nearest target in the lane takes it; a shut shell stops it
export function lane(B, rv, x0, y, d) {
  let best = null, bx = 1e9;
  for (const o of targets(B)) if (!o.dead && o.x > x0 && Math.abs(o.y - y) < o.r + 6 && o.x < bx) { bx = o.x; best = o; }
  if (best && (best.x < rv.x || Math.abs(rv.y - y) > rv.r)) { B.S.hit(B, best, d, rv); return true; }
  if (!B.open && Math.abs(rv.y - y) < rv.r * 1.3) { if (Math.random() < 0.2) ping(rv.x - rv.r, y); return true; }
  return false;
}
export function at(B, rv, x, y, d) {
  for (const o of targets(B)) if (!o.dead && (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + 12) ** 2) { B.S.hit(B, o, d, rv); return true; }
  if (!B.open && (rv.x - x) ** 2 + (rv.y - y) ** 2 < (rv.r * 1.3 + 12) ** 2) { ping(x, y); return true; }
  return false;
}
// the Amal Beam clears whatever of the style is in its band
export function beam(B, rv, dt, inRect) { for (const o of targets(B)) if (!o.dead && inRect(o.x, o.y, o.r)) B.S.hit(B, o, X.dmg() * 14 * dt, rv); }
export function home(B, b) { let best = null, bd = 1e9; for (const o of targets(B)) { if (o.dead) continue; const d = (o.x - b.x) ** 2 + (o.y - b.y) ** 2; if (d < bd) { bd = d; best = o; } } return best; }
export function coreHit(B, rv, dealt, src) {
  if (B.br && dealt > 0) { B.br.heat += dealt / rv.max; B.br.tot += dealt / rv.max; }
  if (src !== 'beam' && B.S.coreHit) B.S.coreHit(B, rv);
}
// the ship was hit: the boss notes which move did it (that is what it tries first next time), gloats, and gives a breath
export function playerHit(B, rv) {
  const br = B.br; if (!br || br.hitT < 0.4) return;
  br.hitT = 0; br.hitN++;
  if (!X.harmless()) { const k = br.mv || br.last; if (k) br.m.h[k] = (br.m.h[k] | 0) + 1; const M = mem(); M.s[B.name] = (M.s[B.name] | 0) + 1; memSave(); }
  if (!B.noIcon) icon(B, 'grin', 1.4); talk(B, 'bq_hit'); if (!br.mv) br.rest += 0.6;
}
export function shift(B, rv) {
  abortMove(B, rv);
  if (B.seq) { swap(B, rv, B.seq[Math.min(B.seq.length - 1, rv.ph)]); X.say('bh_' + B.hint); }
  else if (B.S.shift) B.S.shift(B, rv);
  if (B.br) { B.br.rest = 1.6; B.br.next = null; }
}
export function fixed(B, rv) {
  abortMove(B, rv);
  if (B.S.fixed) B.S.fixed(B, rv);
  B.open = true; B.quiet = true; B.ownMove = B.S === hornet || B.S === hide; rv.aimY = null;
  if (B.br && !B.won) { B.won = true; B.br.m.w++; memSave(); }
}
export function draw(B, c, layer, rv) { B.S.draw(B, c, layer, rv); if (B.S.draw2) B.S.draw2(B, c, layer, rv); }
// for tests and the console: what the brain sees and plans; force a move
export function peek(B, rv) {
  const br = B.br; if (!br) return { style: B.name, mv: null };
  const r2 = v => Math.round(v * 100) / 100;
  return { style: B.name, mv: br.mv, last: br.last, next: br.next && br.next[0], rest: r2(br.rest), camp: r2(br.camp), heat: Math.round(br.heat * 1000) / 1000, band: br.band.map(r2),
    icon: br.it > 0 ? br.icon : null, fav: br.fav, hitN: br.hitN, moves: Object.keys(B.S.moves || {}).concat(B.stage >= 3 ? Object.keys(GIANT) : []).filter(k => okMove(B, rv, MV(B, k))), stage: B.stage, mode: B.mode || B.pol || B.st || null, open: B.open, mul: r2(B.mul), ownMove: B.ownMove, seq: B.seq, studied: B.studied };
}
export function force(B, rv, k) { if (!B.br || !MV(B, k)) return false; abortMove(B, rv); return startMove(B, rv, k); }
