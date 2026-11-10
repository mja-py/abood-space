// Abood Space v3.3 · real bosses: every rogue machine fights its own way.
// v3.1 bolted the same kit (guns, arms, hangar, shield pylon) onto every boss, so the fights read as "a ship at the right edge
// that spawns things". Here each boss has ONE signature mechanic the player must learn (Moon: wait for the shell to open;
// Mars: pop the bubbles; Venus: dodge the swoop; …) and the two guardians of a journey teach a lighter version first.
// game.js keeps HP, phases, the HUD and the fixed/fly-off ending; a style adds movement, its own objects and hazards.
//   B = make(style, rv, lite)   state for one fight            update(B, dt, live)   every frame of the fight
//   bolt(B, b) → true if a player bolt was used up here         lane / at / beam / home   the laser, saw, beam and missiles
//   coreHit(B) after the core took damage                       shift(B, ph) / fixed(B)   phase change / the boss is fixed
//   draw(B, c, 'under' | 'over')
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
function weakMark(c, x, y, r, t, col = '#ffe066') { // the "hit here" marker: a pulsing ring with four ticks
  const p = 0.5 + 0.5 * Math.sin(t * 8);
  c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = col; c.globalAlpha = 0.55 + 0.4 * p; c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, r + 4 + p * 4, 0, TAU); c.stroke();
  c.lineWidth = 3.5; c.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + t * 1.5, r0 = r + 10 + p * 4; c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * (r0 + 8), y + Math.sin(a) * (r0 + 8)); } c.stroke();
  c.restore();
}

// ================================================================================================
// Moon · Khurda, the scrap clam. Its shell is shut most of the time and bolts bounce off; it opens to spit scrap and the
// glowing core inside is the target. Teaches the first boss rule: wait for the opening.
const clam = {
  hint: 'clam', atkK: 1.6,
  init(B, rv) { B.ph = 'closed'; B.pt = 1.4; B.o = 0; B.open = false; B.mul = 1; },
  update(B, dt, live, rv) {
    const p2 = rv.ph >= 1, L = B.lite, tot = X.harmless();   // the Moon (toddlers): mostly open, a short shut
    const D = tot ? { closed: 1.3, opening: 0.4, open: 3.4, closing: 0.3 } : { closed: L ? 1.8 : p2 ? 1.7 : 2.3, opening: 0.45, open: L ? 3 : p2 ? 2.1 : 2.6, closing: 0.35 };
    B.pt -= dt;
    if (B.pt <= 0) {
      if (B.ph === 'closed') { B.ph = 'opening'; X.sfx('whoosh'); }
      else if (B.ph === 'opening') { B.ph = 'open'; if (live) clam.spit(B, rv); }
      else if (B.ph === 'open') B.ph = 'closing';
      else B.ph = 'closed';
      B.pt = D[B.ph];
    }
    const want = B.ph === 'open' || B.ph === 'opening' ? 1 : 0;
    B.o += (want - B.o) * Math.min(1, dt * (want ? 7 : 12));
    B.open = B.o > 0.55; B.mul = B.open ? (tot ? 1.6 : 1.35) : 1;
  },
  spit(B, rv) { // scrap balls: grey, slow, and they can be shot
    const n = B.lite ? 1 : rv.ph >= 1 ? 5 : 3, base = X.aim(rv.x - rv.r, rv.y), arc = n > 1 ? 0.55 : 0;
    for (let i = 0; i < n; i++) X.shot('orb', rv.x - rv.r * 0.7, rv.y, base + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0), B.lite ? 120 : 150);
    X.sfx('eshot'); X.smoke(rv.x - rv.r * 0.6, rv.y, 2, '#6d6a80');
  },
  draw(B, c, layer, rv) {
    if (layer !== 'over') return;
    const R = rv.r * 1.3, hx = rv.x + rv.r * 0.75, hy = rv.y, a = B.o * 0.95, t = X.t;
    if (B.open) weakMark(c, rv.x, rv.y, rv.r * 0.75, t);
    for (const sd of [-1, 1]) {
      c.save(); c.translate(hx, hy); c.rotate(-sd * a); c.translate(-hx, -hy);
      // a domed half shell: hinge on the right, a toothed lip on the left
      c.beginPath(); c.moveTo(rv.x + R * 0.62, rv.y);
      c.arc(rv.x, rv.y, R, sd < 0 ? -0.0 : 0, sd < 0 ? -Math.PI : Math.PI, sd < 0);
      const lip = rv.x - R; for (let k = 0; k <= 6; k++) { const x = lip + (R * 1.62) * k / 6; c.lineTo(x, rv.y + sd * (k % 2 ? 0 : 7)); }
      c.closePath();
      c.fillStyle = rv.hurt > 0.6 && !B.open ? '#d9dce6' : '#8d94a8'; c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      c.save(); c.clip(); // bands and a hazard stripe on the dome
      c.fillStyle = 'rgba(28,21,48,.18)'; c.beginPath(); c.arc(rv.x + 6, rv.y + sd * 6, R * 0.82, 0, TAU); c.fill();
      c.fillStyle = '#ffd23f'; c.fillRect(rv.x - R, rv.y + sd * R * 0.62 - 4, R * 2, 8);
      c.fillStyle = INK; for (let k = -6; k < 7; k++) { c.beginPath(); const x = rv.x + k * 12; c.moveTo(x, rv.y + sd * R * 0.62 - 4); c.lineTo(x + 6, rv.y + sd * R * 0.62 - 4); c.lineTo(x, rv.y + sd * R * 0.62 + 4); c.lineTo(x - 6, rv.y + sd * R * 0.62 + 4); c.closePath(); c.fill(); }
      c.restore();
      c.fillStyle = '#c7cedb'; for (let k = 1; k < 6; k++) { const an = sd * (k / 6) * Math.PI; c.beginPath(); c.arc(rv.x + Math.cos(an) * R * 0.86, rv.y + Math.sin(an) * R * 0.86, 2.2, 0, TAU); c.fill(); }
      c.restore();
    }
    c.fillStyle = '#4a4f63'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy, 9, 0, TAU); c.fill(); c.stroke();
  },
};

// ================================================================================================
// Mars · Bubolt, the bubble launcher. It blows big bouncing bubble-bombs; a shot bubble splits into two smaller ones and the
// smallest pop into coins (like the classic bubble-splitting games). The danger is the crowd you make yourself.
const BUB = [{ r: 11, hp: 1 }, { r: 17, hp: 2 }, { r: 25, hp: 3 }];
const bubble = {
  hint: 'bubble', atkK: 1.8,
  init(B) { B.tg = []; B.cd = 1.2; },
  add(B, x, y, lv, vx, vy) { if (B.tg.length >= 18) return; B.tg.push({ x, y, lv, r: BUB[lv].r, hp: hp1(BUB[lv].hp), vx, vy, flash: 0, dead: false, ph: rnd(0, 6) }); },
  update(B, dt, live, rv) {
    const L = B.lite, top = L ? 1 : 2;
    B.cd -= dt;
    if (B.cd <= 0 && live && X.fight()) {
      const n = rv.ph >= 2 && !L ? 2 : 1;
      for (let i = 0; i < n; i++) bubble.add(B, rv.x - rv.r, rv.y + (i - (n - 1) / 2) * 30, top, -rnd(55, 85), (Math.random() < 0.5 ? -1 : 1) * rnd(90, 140));
      B.cd = (L ? 4.2 : rv.ph >= 1 ? 2.8 : 3.4) * (X.harmless() ? 1.2 : 1);
      X.sfx('plate'); X.ring(rv.x - rv.r, rv.y, 30, '#9ff0ff', 0.3);
    }
    for (const o of B.tg) {
      if (o.dead) continue;
      o.x += o.vx * dt; o.y += o.vy * dt; o.flash = Math.max(0, o.flash - dt * 6); o.ph += dt * 3;
      if (o.y < X.Y_MIN + o.r - 10) { o.y = X.Y_MIN + o.r - 10; o.vy = Math.abs(o.vy); }
      if (o.y > X.Y_MAX - o.r + 10) { o.y = X.Y_MAX - o.r + 10; o.vy = -Math.abs(o.vy); }
      if (o.x < -o.r - 10) { o.dead = true; continue; }
      if (live && X.touch(o.x, o.y, o.r * 0.85)) { X.hurt(); bubble.pop(B, o, false); }
    }
    B.tg = B.tg.filter(o => !o.dead);
  },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.hp <= 0) bubble.pop(B, o, true); else X.sfx('shieldHit');
  },
  pop(B, o, split) {
    o.dead = true; popFx(o.x, o.y, '#9ff0ff', 6 + o.lv * 3); X.sfx('pop');
    if (!split) return;
    if (o.lv > 0) for (const s of [-1, 1]) bubble.add(B, o.x, o.y, o.lv - 1, Math.min(-40, o.vx * 0.8 + s * 20), s * rnd(110, 160));
    else { X.coin(o.x, o.y); X.addScore(20, o.x, o.y); }
  },
  fixed(B) { for (const o of B.tg) popFx(o.x, o.y, '#9ff0ff', 4); B.tg.length = 0; },
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
};

// ================================================================================================
// Venus · Zannana, the hornet. It does not stay at the edge: after a short perch it shows a dotted flight path, then swoops
// in a loop right through the player's side, dropping stinger mines. Perched it is easy to hit (×1.5).
const hornet = {
  hint: 'hornet', atkK: 1.3,
  init(B, rv) { B.mode = 'perch'; B.mt = 2.4; B.ownMove = true; B.trail = []; B.mul = 1.5; },
  plan(B, rv) { // a full oval loop through the arena, top-first or bottom-first, starting and ending at the perch
    const home = X.home(), rx = (home - X.W * (B.lite ? 0.3 : 0.07)) / 2;
    B.path = { cx: home - rx, rx, cy: 200, ry: B.lite ? 105 : 135, sd: Math.random() < 0.5 ? 1 : -1, y0: rv.y };
  },
  pos(B, f) { const P = B.path, a = f * TAU; return [P.cx + P.rx * Math.cos(a), clamp(P.cy - P.sd * P.ry * Math.sin(a) + (P.y0 - P.cy) * (1 - f), X.Y_MIN + 10, X.Y_MAX - 10)]; },
  update(B, dt, live, rv) {
    const home = X.home(), p2 = rv.ph >= 1;
    B.quiet = B.mode !== 'perch';
    if (B.mode === 'perch') {
      B.mul = 1.5;
      rv.x += (home - rv.x) * Math.min(1, dt * 4); rv.y += (200 + Math.sin(B.t * 1.4) * 70 - rv.y) * Math.min(1, dt * 2.5);
      rv.y = clamp(rv.y, rv.ymin, rv.ymax);
      B.mt -= dt;
      if (B.mt <= 0 && live && X.fight()) { B.mode = 'tele'; B.mt = X.tele(B.lite ? 1.2 : 0.9); hornet.plan(B, rv); X.sfx('laserWarn'); B.loops = !B.lite && rv.ph >= 2 ? 2 : 1; }
    } else if (B.mode === 'tele') {
      B.mul = 1.5; rv.x += Math.sin(B.t * 40) * 0.6; // buzzing in place
      B.mt -= dt; if (B.mt <= 0) { B.mode = 'swoop'; B.f = 0; B.drop = B.lite ? 9 : 0; X.sfx('whoosh'); }
    } else if (B.mode === 'swoop') {
      B.mul = 1;
      const dur = B.lite ? 3.1 : p2 ? 2.3 : 2.6;
      B.f += dt / dur;
      const [x, y] = hornet.pos(B, Math.min(1, B.f)); rv.x = x; rv.y = y;
      B.trail.push([x, y]); if (B.trail.length > 6) B.trail.shift();
      if (!B.lite && B.drop < 2 && B.f > (B.drop + 1) / 3.2) { B.drop++; X.mob('mine', x, y, { v: 70, turn: 0.9, life: 4.5, hp: hp1(2) }); }
      if (live && X.touch(x, y, rv.r * 0.8)) X.hurt();
      if (B.f >= 1) {
        if (--B.loops > 0) { B.mode = 'tele'; B.mt = X.tele(0.6); hornet.plan(B, rv); }
        else { B.mode = 'perch'; B.mt = B.lite ? 3.2 : p2 ? 1.9 : 2.5; B.trail.length = 0; }
      }
    } else { // back to the perch from the right edge
      rv.x += (home - rv.x) * Math.min(1, dt * 3.5);
      if (Math.abs(rv.x - home) < 6) { B.mode = 'perch'; B.mt = B.lite ? 3.2 : p2 ? 1.9 : 2.5; }
    }
  },
  shift(B, rv) { if (B.mode !== 'perch') { B.mode = 'back'; B.trail.length = 0; } },
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
};

// ================================================================================================
// Belt · Magna, the magnet. In blue (pull) it drags scrap in from the edges and wears it as an orbiting armour; in red
// (push) it flings that armour outward in a ring. Shoot the incoming scrap and thin the armour to reach the core.
const magnet = {
  hint: 'magnet', atkK: 1.5,
  init(B, rv) { B.tg = []; B.fly = []; B.pol = 'pull'; B.pt = 3.5; B.ang = 0; B.feed = 0.4; B.seed = 1; },
  cap(B, rv) { return B.lite ? 5 : rv.ph >= 1 ? 10 : 8; },
  update(B, dt, live, rv) {
    const R = rv.r + 34, p2 = rv.ph >= 1;
    B.ang += dt * (p2 ? 1.6 : 1.1) * (B.pol === 'charge' ? 0.3 : 1);
    const orb = B.tg.filter(o => o.st === 'orb' && !o.dead);
    orb.forEach((o, i) => { const a = B.ang + i * TAU / orb.length; o.tx = rv.x + Math.cos(a) * R; o.ty = rv.y + Math.sin(a) * R; o.a = a; });
    B.pt -= dt;
    if (B.pol === 'pull') {
      B.feed -= dt;
      if (B.feed <= 0 && live && X.fight() && B.tg.length < magnet.cap(B, rv)) {
        B.feed = B.lite ? 1.2 : p2 ? 0.55 : 0.75;
        const top = Math.random() < 0.5;
        B.tg.push({ st: 'in', x: rnd(X.W * 0.5, X.W * 0.85), y: top ? -20 : X.H + 20, tx: rv.x, ty: rv.y, r: 13, hp: hp1(1), rot: rnd(0, 6), seed: B.seed++, flash: 0, dead: false, v: 0 });
      }
      if (B.pt <= 0) { B.pol = 'charge'; B.pt = X.tele(0.9); X.sfx('laserWarn'); }
    } else if (B.pol === 'charge') {
      if (B.pt <= 0) { B.pol = 'push'; B.pt = 1.4; magnet.fling(B, rv); }
    } else if (B.pt <= 0) { B.pol = 'pull'; B.pt = B.lite ? 4.2 : p2 ? 3 : 3.6; }
    for (const o of B.tg) {
      if (o.dead) continue;
      o.flash = Math.max(0, o.flash - dt * 6); o.rot += dt * 2;
      if (o.st === 'in') { // pulled in along a curve, faster as it nears
        o.v = Math.min(420, o.v + 520 * dt); const dx = rv.x - o.x, dy = rv.y - o.y, d = Math.hypot(dx, dy) || 1;
        o.x += dx / d * o.v * dt + (-dy / d) * 60 * dt; o.y += dy / d * o.v * dt + (dx / d) * 60 * dt;
        if (d < R + 6) o.st = 'orb';
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
  fling(B, rv) { // the armour leaves in a ring, so the gaps between pieces are the way through
    const v = B.lite ? 150 : rv.ph >= 1 ? 210 : 180;
    for (const o of B.tg) { if (o.st !== 'orb') continue; o.dead = true; B.fly.push({ x: o.x, y: o.y, vx: Math.cos(o.a) * v, vy: Math.sin(o.a) * v, r: o.r, hp: hp1(1), rot: o.rot, seed: o.seed, flash: 0, dead: false }); }
    X.sfx('whoosh'); X.shake(5); X.ring(rv.x, rv.y, rv.r + 50, '#ff5a6a', 0.4);
  },
  targets(B) { return B.tg.concat(B.fly); },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.hp > 0) { X.sfx('shieldHit'); return; }
    o.dead = true; X.explode(o.x, o.y, o.r, { shard: 'metal', spark: '#cfd8ff', ringCol: '#cfd8ff' }); X.sfx('plate');
    if (Math.random() < 0.35) X.coin(o.x, o.y); X.addScore(15, o.x, o.y);
  },
  fixed(B) { for (const o of magnet.targets(B)) X.sparks(o.x, o.y, 4, '#cfd8ff', 90); B.tg.length = B.fly.length = 0; },
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
    // the horseshoe on its back: the tips swap colour with the polarity
    c.save(); c.translate(rv.x + rv.r * 0.55, rv.y); c.lineCap = 'butt';
    c.strokeStyle = INK; c.lineWidth = 17; c.beginPath(); c.arc(0, 0, rv.r * 0.95, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.strokeStyle = '#8d94a8'; c.lineWidth = 11; c.beginPath(); c.arc(0, 0, rv.r * 0.95, -Math.PI * 0.42, Math.PI * 0.42); c.stroke();
    for (const s of [-1, 1]) { c.fillStyle = (s < 0) === red ? '#ff5a6a' : '#5ec8ff'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.roundRect(-12, s * rv.r * 0.95 - 7, 14, 14, 3); c.fill(); c.stroke(); }
    c.restore();
    for (const o of B.tg) metalChunk(c, o.x, o.y, o.r, o.rot, o.seed, o.flash, B.pol === 'charge');
    for (const o of B.fly) metalChunk(c, o.x, o.y, o.r, o.rot, o.seed, o.flash, true);
    if (B.pol === 'charge') { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,90,106,${0.4 + 0.4 * Math.sin(t * 30)})`; c.lineWidth = 3; c.beginPath(); c.arc(rv.x, rv.y, rv.r + 34, 0, TAU); c.stroke(); c.restore(); }
  },
};

// ================================================================================================
// Jupiter · Radar, the searchlight. A scanning beam sweeps the player's side. Stay in it too long and it locks on and snipes.
// Storm debris drifts in the middle: hide behind it (it blocks shots both ways), peek out to shoot.
const search = {
  hint: 'search', atkK: 2.2,
  init(B, rv) { B.tg = []; B.lock = 0; B.cool = 0; B.spawn = 0; B.seed = 3; for (let i = 0; i < (B.lite ? 2 : 3); i++) search.cover(B, i); },
  cover(B, i) {
    const n = B.lite ? 2 : 3, y = X.Y_MIN + 40 + (X.Y_MAX - X.Y_MIN - 80) * (i + 0.5) / n;
    B.tg.push({ x: X.W * (0.47 + (i % 2) * 0.06), y: i < 0 ? -40 : y, r: 30, hp: hp1(9), max: hp1(9), vy: (i % 2 ? 1 : -1) * rnd(14, 22), rot: rnd(0, 6), seed: B.seed++, flash: 0, dead: false });
  },
  origin(rv) { return [rv.x - rv.r * 0.55, rv.y - rv.r * 0.35]; },
  update(B, dt, live, rv) {
    const p2 = rv.ph >= 1, p3 = rv.ph >= 2 && !B.lite;
    for (const o of B.tg) {
      o.y += o.vy * dt; o.flash = Math.max(0, o.flash - dt * 6); o.rot += dt * 0.2;
      if (o.y < X.Y_MIN + o.r) { o.y = X.Y_MIN + o.r; o.vy = Math.abs(o.vy); } if (o.y > X.Y_MAX - o.r) { o.y = X.Y_MAX - o.r; o.vy = -Math.abs(o.vy); }
    }
    if (B.tg.length < (B.lite ? 2 : 3)) { B.spawn += dt; if (B.spawn > 4) { B.spawn = 0; search.cover(B, B.seed); const o = B.tg[B.tg.length - 1]; o.y = Math.random() < 0.5 ? X.Y_MIN + o.r : X.Y_MAX - o.r; X.smoke(o.x, o.y, 2, '#8a86a0'); } }
    // cover eats enemy shots too
    for (const s of X.eshots) if (!s.dead) for (const o of B.tg) if ((s.x - o.x) ** 2 + (s.y - o.y) ** 2 < (o.r + s.r) ** 2) { s.dead = true; X.sparks(s.x, s.y, 3, '#ffb3a0', 80); break; }
    // the beam(s): one sweep, two from the last phase
    const [ox, oy] = search.origin(rv), sp = B.lite ? 0.6 : p2 ? 0.95 : 0.8;
    B.beams = p3 ? [B.t * sp, B.t * sp + Math.PI] : [B.t * sp];
    B.hw = B.lite ? 0.1 : 0.13;
    const reachY = f => clamp(200 + Math.sin(f) * 175, X.Y_MIN, X.Y_MAX);
    B.angs = B.beams.map(f => Math.atan2(reachY(f) - oy, X.ship.x - ox));
    if (B.cool > 0) { B.cool -= dt; B.lock = Math.max(0, B.lock - dt * 2); return; }
    const sa = Math.atan2(X.ship.y - oy, X.ship.x - ox);
    let seen = B.angs.some(a => Math.abs(Math.atan2(Math.sin(sa - a), Math.cos(sa - a))) < B.hw);
    if (seen) for (const o of B.tg) if (segCircle(ox, oy, X.ship.x, X.ship.y, o.x, o.y, o.r * 0.9)) { seen = false; break; }
    B.seen = seen && live && X.fight();
    const need = B.lite ? 1.1 : p3 ? 0.55 : 0.75;
    B.lock = B.seen ? B.lock + dt : Math.max(0, B.lock - dt * 1.4);
    B.lockF = clamp(B.lock / need, 0, 1);
    if (B.lock >= need) {
      B.lock = 0; B.cool = B.lite ? 1.8 : 1.2;
      const n = B.lite ? 1 : 3;
      for (let i = 0; i < n; i++) X.later(i * 0.12, () => X.shot('dart', ox, oy, X.aim(ox, oy), B.lite ? 300 : 380));
      X.sfx('laserFire'); X.ring(X.ship.x, X.ship.y, 30, '#ff3040', 0.3);
    }
  },
  targets(B) { return B.tg; },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.hp > 0) { if (Math.random() < 0.3) X.sfx('rockhit'); return; }
    o.dead = true; X.explode(o.x, o.y, o.r, { shard: 'rock', ringCol: '#ffcf6a', spark: '#ffd27a' }); X.sfx('boomS'); X.coin(o.x, o.y); X.addScore(40, o.x, o.y);
    B.tg = B.tg.filter(q => !q.dead);
  },
  fixed(B) { B.tg.length = 0; },
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
};

// ================================================================================================
// Saturn · Ghummaid, hide-and-seek. It splits into look-alike boxes that shuffle like a shell game. Only the real one's eye
// glints now and then. A wrong guess pops the copy (and it spits a little fan); the right guess hurts it and ends the round.
const hide = {
  hint: 'hide', atkK: 2.2,
  init(B, rv) { B.ownMove = true; B.mode = 'show'; B.mt = 2; B.tg = []; B.mul = 1.2; rv.aimY = null; B.gl = 0; },
  slots(B, rv, n) { return lanesY(n, rv); },
  update(B, dt, live, rv) {
    const home = X.home(), p2 = rv.ph >= 1;
    B.mt -= dt;
    const glide = (o, k = 6) => { o.x += (o.tx - o.x) * Math.min(1, dt * k); o.y += (o.ty - o.y) * Math.min(1, dt * k); };
    const real = B.real || (B.real = { x: rv.x, y: rv.y, tx: home, ty: 200 });
    if (B.mode === 'show') {
      real.tx = home; real.ty = 200 + Math.sin(B.t) * 40; glide(real, 3); rv.aimY = null; B.mul = 1.2;
      if (B.mt <= 0 && live && X.fight()) {
        const n = (B.lite ? 1 : p2 ? 3 : 2), ys = hide.slots(B, rv, n + 1);
        B.tg = []; for (let i = 0; i < n; i++) B.tg.push({ x: real.x, y: real.y, tx: home, ty: 0, r: rv.r, hp: 1, flash: 0, dead: false, ox: 0 });
        const all = [real, ...B.tg]; all.sort(() => Math.random() - 0.5).forEach((o, i) => { o.ty = ys[i]; o.tx = home; });
        X.smoke(real.x, real.y, 4, '#b8b0d8'); X.sfx('whoosh');
        B.mode = 'split'; B.mt = 0.7; B.swaps = B.lite ? 2 : p2 ? 5 : 3;
      }
    } else if (B.mode === 'split') {
      for (const o of [real, ...B.tg]) glide(o, 7);
      if (B.mt <= 0) { B.mode = 'shuffle'; B.mt = 0; B.sw = null; }
    } else if (B.mode === 'shuffle') {
      rv.aimY = X.ship.y; B.mul = 1;
      const all = [real, ...B.tg.filter(o => !o.dead)], dur = B.lite ? 0.7 : p2 ? 0.42 : 0.55;
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
      rv.aimY = X.ship.y; B.mul = 1.3;
      for (const o of [real, ...B.tg]) { o.tx = home + Math.sin(B.t * 2 + o.ty) * 6; glide(o, 5); }
      B.gl -= dt; if (B.gl <= -1.4 + (B.lite ? -0.2 : 0)) B.gl = 0.35;   // the real one's glint
      if (B.mt <= 0) { // time is up: every box fires once and they shuffle again
        if (live) for (const o of [real, ...B.tg]) if (!o.dead) X.shot('pellet', o.x - rv.r * 0.6, o.y, X.aim(o.x, o.y), 200);
        X.sfx('eshot'); B.mode = 'shuffle'; B.swaps = B.lite ? 2 : 3; B.sw = null;
      }
    }
    rv.x = real.x; rv.y = real.y;
    for (const o of B.tg) o.flash = Math.max(0, o.flash - dt * 6);
  },
  hit(B, o, d) { // a wrong guess: the copy pops with a spring and a puff
    o.dead = true; popFx(o.x, o.y, '#e6d6ff', 12); X.smoke(o.x, o.y, 3, '#b8b0d8'); X.sfx('pop');
    X.float(X.tt('f_decoy', 'Wrong one!'), o.x - 20, o.y - 30, '#e6d6ff');
    if (!B.lite && !X.harmless()) { const a = X.aim(o.x, o.y); for (const k of [-0.25, 0, 0.25]) X.shot('pellet', o.x - 20, o.y, a + k, 190); }
    B.tg = B.tg.filter(q => !q.dead);
  },
  coreHit(B, rv) {
    if (B.mode === 'hide') { // found it: the copies fold back in and the round ends
      for (const o of B.tg) { X.smoke(o.x, o.y, 2, '#b8b0d8'); X.sparks(o.x, o.y, 4, '#e6d6ff', 90); }
      B.tg = []; B.sw = null; B.mode = 'show'; B.mt = B.lite ? 2.6 : 2;
      X.float(X.tt('f_found', 'Found you!'), rv.x - 30, rv.y - rv.r - 24, '#ffe066'); X.say('bot_found');
    }
  },
  shift(B) { B.tg = []; B.sw = null; B.mode = 'show'; B.mt = 1.6; },
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
};

// ================================================================================================
// Uranus · Dawwama, the whirlpool. A ring of armour plates spins round the core with a gap or two: time your shots through
// the gap. Its shots curl in the current. From phase 2 a second ring spins the other way, so the gaps must line up.
const vortex = {
  hint: 'vortex', atkK: 1.2,
  ringMk(B, R, n, gaps, w) { const segs = []; for (let i = 0; i < n; i++) segs.push({ i, on: !gaps.includes(i), hp: hp1(B.lite ? 3 : 5), back: 0, flash: 0, x: 0, y: 0, r: 0, dead: false }); return { R, n, w, a: rnd(0, TAU), segs }; },
  init(B, rv) { B.rings = [vortex.ringMk(B, rv.r + 30, 14, B.lite ? [0, 4, 7, 11] : [0, 7], B.lite ? 0.7 : 1)]; B.sw = 0; },
  update(B, dt, live, rv) {
    for (const g of B.rings) {
      g.a += g.w * dt * (rv.ph >= 2 ? 1.35 : 1);
      const segR = Math.PI * g.R / g.n + 3;
      for (const s of g.segs) {
        const a = g.a + (s.i + 0.5) * TAU / g.n; s.x = rv.x + Math.cos(a) * g.R; s.y = rv.y + Math.sin(a) * g.R; s.r = segR; s.flash = Math.max(0, s.flash - dt * 6);
        if (!s.on && s.back > 0) { s.back -= dt; if (s.back <= 0) { s.on = true; s.hp = hp1(B.lite ? 3 : 5); s.flash = 1; X.sparks(s.x, s.y, 4, '#b9a6ff', 80); } }
        s.dead = !s.on;
      }
    }
    if (!B.lite) for (const s of X.eshots) if (!s.dead && !s.straight) { // the current curls every enemy shot a little
      const a = Math.atan2(s.vy, s.vx) + dt * 0.55, v = Math.hypot(s.vx, s.vy); s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.ang = a;
    }
  },
  shift(B, rv) { if (rv.ph === 1 && !B.lite && B.rings.length < 2) B.rings.push(vortex.ringMk(B, rv.r + 56, 18, [0, 6, 12], -0.75)); },
  targets(B) { const o = []; for (const g of B.rings) for (const s of g.segs) if (s.on) o.push(s); return o; },
  hit(B, s, d) {
    s.hp -= d; s.flash = 1;
    if (s.hp > 0) { X.sfx('shieldHit'); return; }
    s.on = false; s.dead = true; s.back = 4.5; X.sparks(s.x, s.y, 8, '#b9a6ff', 140); X.sfx('plate'); X.addScore(10, s.x, s.y);
  },
  fixed(B) { B.rings = []; },
  draw(B, c, layer, rv) {
    const t = X.t;
    if (layer === 'under') { // the current: faint swirling arcs
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let k = 0; k < 7; k++) { const r = rv.r + 70 + k * 34, a = -t * (1.2 - k * 0.1) + k; c.strokeStyle = `rgba(185,166,255,${0.13 - k * 0.012})`; c.lineWidth = 3; c.beginPath(); c.arc(rv.x, rv.y, r, a, a + 1.6); c.stroke(); c.beginPath(); c.arc(rv.x, rv.y, r, a + Math.PI, a + Math.PI + 1.2); c.stroke(); }
      c.restore();
      return;
    }
    for (const g of B.rings) {
      const step = TAU / g.n;
      c.save(); c.lineCap = 'butt';
      for (const s of g.segs) {
        const a0 = g.a + s.i * step + 0.03, a1 = a0 + step - 0.06;
        if (!s.on) { c.strokeStyle = 'rgba(185,166,255,.18)'; c.lineWidth = 3; c.beginPath(); c.arc(rv.x, rv.y, g.R, a0, a1); c.stroke(); continue; }
        c.strokeStyle = INK; c.lineWidth = 16; c.beginPath(); c.arc(rv.x, rv.y, g.R, a0, a1); c.stroke();
        c.strokeStyle = s.flash > 0.4 ? '#ffffff' : '#7f74b8'; c.lineWidth = 11; c.beginPath(); c.arc(rv.x, rv.y, g.R, a0 + 0.02, a1 - 0.02); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2; c.beginPath(); c.arc(rv.x, rv.y, g.R - 3, a0 + 0.05, a1 - 0.05); c.stroke();
      }
      c.restore();
    }
  },
};

// ================================================================================================
// Neptune 1 · Kabeer, the Scrap King. Its body is a wall of scrap blocks with the core inside. Shoot a tunnel through the
// blocks to reach the core, and shoot the flying scrap before it rebuilds the wall. Red blocks are guns.
const builder = {
  hint: 'builder', atkK: 1.9,
  init(B, rv) {
    B.tg = []; B.fly = []; B.cd = 2; B.shed = 6; const r = rv.r, sz = 23;
    const slots = [];
    for (let row = -3; row <= 3; row++) for (const col of [0, 1]) slots.push([-(r + 10) - col * sz, row * sz]);
    for (let k = -2; k <= 2; k++) { slots.push([k * sz * 0.95, -(r + 12)]); slots.push([k * sz * 0.95, r + 12]); }
    B.slots = slots.map((p, i) => ({ dx: p[0], dy: p[1], i, gun: [3, 6, 11, 16].includes(i) && !B.lite, x: 0, y: 0, r: 12, hp: hp1(2), on: true, flash: 0, cd: rnd(2, 4), seed: i * 1.7, dead: false }));
    if (B.lite) B.slots = B.slots.filter((s, i) => i % 2 === 0 || s.dx > -(r + 20));
  },
  update(B, dt, live, rv) {
    const p2 = rv.ph >= 1;
    for (const s of B.slots) {
      s.x = rv.x + s.dx; s.y = rv.y + s.dy; s.flash = Math.max(0, s.flash - dt * 6); s.dead = !s.on;
      if (s.on && s.gun && live && X.fight()) { s.cd -= dt; if (s.cd <= 0) { s.cd = rnd(3, 4.2); X.shot('pellet', s.x - 10, s.y, X.aim(s.x, s.y), 210); X.sfx('eshot'); } }
    }
    // rebuild: scrap flies in from the top or bottom edge to an empty slot (shoot it on the way)
    B.cd -= dt;
    const empty = B.slots.filter(s => !s.on && !s.claimed);
    if (B.cd <= 0 && empty.length && live && X.fight()) {
      B.cd = B.lite ? 2.2 : p2 ? 0.9 : 1.3;
      const s = empty[Math.floor(Math.random() * empty.length)], top = Math.random() < 0.5; s.claimed = true;
      B.fly.push({ slot: s, x: rnd(X.W * 0.5, X.W * 0.9), y: top ? -20 : X.H + 20, f: 0, r: 11, hp: hp1(1), rot: rnd(0, 6), seed: s.seed, flash: 0, dead: false, x0: 0, y0: 0 });
      const o = B.fly[B.fly.length - 1]; o.x0 = o.x; o.y0 = o.y;
    }
    for (const o of B.fly) {
      if (o.dead) continue;
      o.f += dt / 1.3; o.rot += dt * 5; o.flash = Math.max(0, o.flash - dt * 6);
      const tx = o.slot.x, ty = o.slot.y, f = easeInOut(o.f);
      o.x = o.x0 + (tx - o.x0) * f; o.y = o.y0 + (ty - o.y0) * f + Math.sin(f * Math.PI) * (o.y0 < 0 ? 40 : -40);
      if (o.f >= 1) { o.dead = true; o.slot.on = true; o.slot.claimed = false; o.slot.hp = hp1(2); o.slot.flash = 1; X.sfx('plate'); }
    }
    B.fly = B.fly.filter(o => !o.dead);
    // from phase 2 the king throws front blocks at the player
    if (p2 && !B.lite && live && X.fight()) {
      B.shed -= dt;
      if (B.shed <= 0) {
        B.shed = rv.ph >= 2 ? 4.5 : 6;
        const front = B.slots.filter(s => s.on && s.dx < -(rv.r + 20)).sort(() => Math.random() - 0.5).slice(0, 3);
        for (const s of front) { s.on = false; s.dead = true; B.thrown = B.thrown || []; const a = X.aim(s.x, s.y); B.thrown.push({ x: s.x, y: s.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 12, hp: hp1(1), rot: 0, seed: s.seed, flash: 0, dead: false }); }
        if (front.length) { X.sfx('whoosh'); X.shake(4); }
      }
    }
    for (const o of B.thrown || []) {
      if (o.dead) continue;
      o.x += o.vx * dt; o.y += o.vy * dt; o.rot += dt * 7; o.flash = Math.max(0, o.flash - dt * 6);
      if (o.x < -30 || o.y < -30 || o.y > X.H + 30) o.dead = true;
      else if (live && X.touch(o.x, o.y, o.r)) { o.dead = true; X.hurt(); popFx(o.x, o.y, '#ffb38a', 6); }
    }
    if (B.thrown) B.thrown = B.thrown.filter(o => !o.dead);
  },
  targets(B) { return B.slots.filter(s => s.on).concat(B.fly, B.thrown || []); },
  hit(B, o, d) {
    o.hp -= d; o.flash = 1;
    if (o.hp > 0) { X.sfx('shieldHit'); return; }
    o.dead = true; if (o.slot) o.slot.claimed = false;
    if ('on' in o) o.on = false;
    X.explode(o.x, o.y, 10, { shard: 'metal', spark: '#ffcf6a', ringCol: '#ffb347' }); X.sfx('plate'); X.addScore(10, o.x, o.y);
    if (!('on' in o) && Math.random() < 0.4) X.coin(o.x, o.y);
  },
  fixed(B) { for (const s of B.slots) if (s.on) X.sparks(s.x, s.y, 3, '#ffcf6a', 90); B.slots.forEach(s => s.on = false); B.fly.length = 0; B.thrown = []; },
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
};

// ================================================================================================
// Neptune 2 · Sindan, the anvil hammer. A huge hammer on a long arm: a red column shows where it will fall, it slams down and
// sends a shockwave along the floor, then sticks for a moment: its glowing joint takes double damage.
const hammer = {
  hint: 'hammer', atkK: 1.7,
  init(B, rv) { B.mode = 'idle'; B.mt = 2; B.hx = rv.x - 120; B.hy = rv.y - rv.r - 40; B.waves = []; B.tg = []; B.side = 1; B.combo = 0; },
  base(rv) { return [rv.x - rv.r * 0.2, rv.y - rv.r * 0.85]; },
  update(B, dt, live, rv) {
    const p2 = rv.ph >= 1, p3 = rv.ph >= 2 && !B.lite, top = X.Y_MIN - 6, bot = X.Y_MAX + 6;
    B.mt -= dt; B.tg.length = 0;
    const [bx, by] = hammer.base(rv);
    if (B.mode === 'idle') {
      B.hx += (bx - 70 - B.hx) * Math.min(1, dt * 4); B.hy += (by - 30 - B.hy) * Math.min(1, dt * 4);
      if (B.mt <= 0 && live && X.fight()) {
        B.side = p2 && !B.lite && Math.random() < 0.5 ? -1 : 1;   // 1: falls from the top, -1: rises from the floor
        B.col = clamp(X.ship.x + rnd(-15, 15), 70, X.W * 0.45);
        B.mode = 'raise'; B.mt = X.tele(B.lite ? 1.4 : 1.05); X.sfx('laserWarn');
      }
    } else if (B.mode === 'raise') {
      const ty = B.side > 0 ? top : bot; B.hx += (B.col - B.hx) * Math.min(1, dt * 6); B.hy += (ty - B.hy) * Math.min(1, dt * 6);
      if (B.mt <= 0) { B.mode = 'slam'; B.f = 0; B.hit = false; }
    } else if (B.mode === 'slam') {
      B.f += dt / 0.2; const y0 = B.side > 0 ? top : bot, y1 = B.side > 0 ? X.Y_MAX - 22 : X.Y_MIN + 22;
      B.hx = B.col; B.hy = y0 + (y1 - y0) * easeOut(B.f);
      if (!B.hit && live && Math.abs(X.ship.x - B.col) < 40 && (B.side > 0 ? X.ship.y < B.hy + 26 : X.ship.y > B.hy - 26)) { B.hit = true; X.hurt(); }
      if (B.f >= 1) {
        B.mode = 'stuck'; B.mt = B.lite ? 2.3 : 1.7; X.shake(10); X.sfx('tank'); X.sfx('boomL'); X.smoke(B.col, B.hy, 5, '#8a86a0'); X.sparks(B.col, B.hy, 14, '#ffcf6a', 220);
        if (!B.lite) for (const d of [-1, 1]) B.waves.push({ x: B.col, y: B.side > 0 ? X.Y_MAX - 14 : X.Y_MIN + 14, d, v: 330, hit: false, life: 2 });
      }
    } else if (B.mode === 'stuck') {
      B.tg.push(B.joint || (B.joint = { x: 0, y: 0, r: 22, dead: false, flash: 0 })); B.joint.x = B.hx; B.joint.y = B.hy - B.side * 30; B.joint.flash = Math.max(0, B.joint.flash - dt * 6);
      if (B.mt <= 0) { B.mode = 'back'; B.mt = 0.5; }
    } else { // pull the hammer home; in the last phase it may slam twice in a row
      B.hx += (bx - 70 - B.hx) * Math.min(1, dt * 5); B.hy += (by - 30 - B.hy) * Math.min(1, dt * 5);
      if (B.mt <= 0) { if (p3 && B.combo++ % 2 === 0) { B.mode = 'idle'; B.mt = 0.2; } else { B.mode = 'idle'; B.mt = B.lite ? 3 : p2 ? 1.8 : 2.4; } }
    }
    for (const w of B.waves) {
      w.x += w.d * w.v * dt; w.life -= dt;
      if (!w.hit && live && Math.abs(X.ship.x - w.x) < 18 && Math.abs(X.ship.y - w.y) < 26) { w.hit = true; X.hurt(); }
    }
    B.waves = B.waves.filter(w => w.life > 0 && w.x > -20 && w.x < X.W + 20);
  },
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
};

export const STYLES = { clam, bubble, hornet, magnet, search, hide, vortex, builder, hammer };

// ================================================================================================
// engine-facing api
export function make(style, rv, lite) {
  const seq = Array.isArray(style) ? style : null, name = seq ? seq[0] : style, S = STYLES[name];
  if (!S) return null;
  const B = { name, S, seq, lite: !!lite, t: 0, tg: [], ownMove: false, quiet: false, mul: 1, open: true, atkK: S.atkK || 1, hint: S.hint };
  S.init(B, rv); return B;
}
function swap(B, rv, name) { // Zero: the final boss switches signature with each phase
  const S = STYLES[name]; if (!S || S === B.S) return;
  if (B.S.fixed) B.S.fixed(B, rv);
  for (const k of Object.keys(B)) if (!['name', 'S', 'seq', 'lite', 't'].includes(k)) delete B[k];
  Object.assign(B, { name, S, tg: [], ownMove: false, quiet: false, mul: 1, open: true, atkK: S.atkK || 1, hint: S.hint });
  rv.aimY = null; S.init(B, rv);
}
// how far the style reaches above/below (and right of) the core, so game.js keeps it on screen
const EXT = { clam: r => r * 1.3, magnet: r => r + 48, vortex: (r, B) => B.lite ? r + 38 : r + 64, builder: r => r + 45 };
export function ext(B, rv) { const f = EXT[B.name]; return f ? f(rv.r, B) : rv.r; }
export function update(B, dt, live, rv) { B.t += dt; for (const o of B.tg || []) if (o.flash) o.flash = Math.max(0, o.flash - dt * 6); B.S.update(B, dt, live, rv); }
const targets = B => B.S.targets ? B.S.targets(B) : (B.tg || []);
export function bolt(B, b, rv) {
  for (const o of targets(B)) if (!o.dead && (b.x - o.x) ** 2 + (b.y - o.y) ** 2 < (o.r + 4) ** 2) { b.dead = true; X.sparks(b.x, b.y, 2, '#ffd27a', 100, -60); B.S.hit(B, o, b.dmg, rv); return true; }
  if (!B.open && (b.x - rv.x) ** 2 + (b.y - rv.y) ** 2 < (rv.r * 1.3 + 4) ** 2) { b.dead = true; ping(b.x, b.y); return true; }
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
export function coreHit(B, rv) { if (B.S.coreHit) B.S.coreHit(B, rv); }
export function shift(B, rv) {
  if (B.seq) { swap(B, rv, B.seq[Math.min(B.seq.length - 1, rv.ph)]); X.say('bh_' + B.hint); return; }
  if (B.S.shift) B.S.shift(B, rv);
}
export function fixed(B, rv) { if (B.S.fixed) B.S.fixed(B, rv); B.open = true; B.quiet = true; rv.aimY = null; }
export function draw(B, c, layer, rv) { B.S.draw(B, c, layer, rv); }
