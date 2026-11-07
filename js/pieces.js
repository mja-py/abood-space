// Abood to the Moon v3 · drawing for the set pieces: guard turrets, grabber robots, tethered junk, derelict station
// walls, rescue pods and the solar flare. Pure canvas, no state: game.js owns the objects and calls these every frame.
// Same look as art.js: ink outlines, flat fills, a highlight, no gradients heavier than a glow.
const INK = '#1c1530', TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function rivet(c, x, y, r = 1.4) {
  c.fillStyle = '#c7cedb'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(28,21,48,.7)'; c.lineWidth = 0.7; c.stroke();
}
function flashOver(c, flash, path) {
  if (!(flash > 0)) return;
  c.save(); c.globalAlpha *= clamp(flash, 0, 1) * 0.85; c.fillStyle = '#ffffff'; path(); c.fill(); c.restore();
}

// ---- guard turret: an old relay satellite with a gun; o.aim = angle to the ship, o.tell 0..1 before a shot ----
export function drawTurret(c, o, t = 0) {
  const s = o.r / 22;
  c.save(); c.translate(o.x, o.y); c.scale(s, s);
  c.rotate(Math.sin(t * 0.8 + (o.seed || 0)) * 0.08);
  c.strokeStyle = INK; c.lineWidth = 2;
  // solar wings
  for (const k of [-1, 1]) {
    c.save(); c.translate(0, k * 20); c.fillStyle = '#2c4ea8'; c.beginPath(); c.roundRect(-14, -8, 28, 16, 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(160,200,255,.5)'; c.lineWidth = 1; c.beginPath(); for (let i = -7; i <= 7; i += 7) { c.moveTo(i, -8); c.lineTo(i, 8); } c.moveTo(-14, 0); c.lineTo(14, 0); c.stroke();
    c.restore();
  }
  // body
  c.fillStyle = '#8d94a8'; c.beginPath(); c.roundRect(-13, -12, 26, 24, 5); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.roundRect(-10, -9, 8, 18, 3); c.fill();
  rivet(c, -9, -8); rivet(c, 9, -8); rivet(c, -9, 8); rivet(c, 9, 8);
  // gun on a turret ring, pointing at the ship
  c.save(); c.rotate(o.aim || Math.PI);
  c.fillStyle = '#4d5268'; c.beginPath(); c.arc(0, 0, 7.5, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#5b6178'; c.beginPath(); c.roundRect(4, -3.2, 18, 6.4, 2); c.fill(); c.stroke();
  const tell = clamp(o.tell || 0, 0, 1);
  if (tell > 0) { c.fillStyle = `rgba(255,${Math.round(120 - 60 * tell)},60,${0.5 + 0.5 * tell})`; c.beginPath(); c.arc(22, 0, 2.5 + 2.5 * tell, 0, TAU); c.fill(); }
  c.restore();
  // eye light
  const blink = Math.sin(t * 5 + (o.seed || 0)) > 0.3;
  c.fillStyle = blink ? '#ff4a4a' : '#7a2030'; c.beginPath(); c.arc(0, -16, 2.6, 0, TAU); c.fill(); c.stroke();
  flashOver(c, o.flash, () => { c.beginPath(); c.roundRect(-14, -30, 28, 60, 6); });
  c.restore();
}

// ---- grabber: a salvage robot with two claws; o.holding = it has Nabeeh ----
export function drawGrabber(c, o, t = 0) {
  const s = o.r / 20, open = o.holding ? 0.12 : 0.45 + 0.3 * Math.sin(t * 6 + (o.seed || 0));
  c.save(); c.translate(o.x, o.y); c.scale(s, s);
  c.strokeStyle = INK; c.lineWidth = 2;
  // thruster
  c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(14, -5); c.lineTo(24 + Math.sin(t * 30) * 3, 0); c.lineTo(14, 5); c.closePath(); c.fill();
  // arms + claws (to the left, towards Nabeeh)
  for (const k of [-1, 1]) {
    c.save(); c.translate(-10, k * 9); c.rotate(k * open);
    c.fillStyle = '#8d94a8'; c.beginPath(); c.roundRect(-22, -3, 22, 6, 3); c.fill(); c.stroke();
    c.fillStyle = '#e2552d'; c.beginPath(); c.moveTo(-22, -3); c.lineTo(-32, -k * 7 - 3); c.lineTo(-28, 1); c.lineTo(-22, 3); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  // body
  c.fillStyle = '#f2b630'; c.beginPath(); c.roundRect(-12, -14, 26, 28, 8); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.roundRect(-9, -11, 7, 16, 3); c.fill();
  rivet(c, 9, -10); rivet(c, 9, 10);
  // eye
  c.fillStyle = '#1c1530'; c.beginPath(); c.arc(-2, -3, 6.5, 0, TAU); c.fill();
  c.fillStyle = o.holding ? '#7dff9a' : '#ff4a4a'; c.beginPath(); c.arc(-3, -3.5, 3.4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(-4.3, -5, 1.2, 0, TAU); c.fill();
  // antenna
  c.beginPath(); c.moveTo(4, -14); c.lineTo(7, -22); c.stroke(); c.fillStyle = '#ff4a4a'; c.beginPath(); c.arc(7.5, -23, 2.2, 0, TAU); c.fill(); c.stroke();
  flashOver(c, o.flash, () => { c.beginPath(); c.roundRect(-34, -24, 60, 48, 8); });
  c.restore();
}

// ---- tether: a cable between an anchor and the junk swinging on it ----
export function drawTether(c, ax, ay, bx, by, t = 0) {
  c.save(); c.strokeStyle = INK; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  c.strokeStyle = '#9aa3b8'; c.lineWidth = 2; c.setLineDash([6, 4]); c.lineDashOffset = -t * 20; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  c.restore();
}

// ---- derelict station wall: a long plated segment (o.x left edge, o.w width, o.y0..o.y1), hazard stripes at the gap ----
export function drawWall(c, o, t = 0) {
  const x = o.x, w = o.w, y0 = o.y0, y1 = o.y1, h = y1 - y0; if (h <= 0) return;
  c.save();
  c.fillStyle = '#4f546e'; c.strokeStyle = INK; c.lineWidth = 3;
  c.beginPath(); c.rect(x, y0, w, h); c.fill(); c.stroke();
  // plates
  c.fillStyle = '#646a86'; c.strokeStyle = 'rgba(28,21,48,.6)'; c.lineWidth = 1.5;
  const pw = 56, ph = 44;
  for (let px = x + 6; px < x + w - 10; px += pw + 6) for (let py = y0 + 6; py < y1 - 10; py += ph + 6) {
    const cw = Math.min(pw, x + w - 6 - px), ch = Math.min(ph, y1 - 6 - py); if (cw < 14 || ch < 12) continue;
    c.beginPath(); c.roundRect(px, py, cw, ch, 4); c.fill(); c.stroke();
    rivet(c, px + 5, py + 5); rivet(c, px + cw - 5, py + ch - 5);
  }
  // hazard stripes along the edge that faces the gap
  const ey = o.top ? y1 - 8 : y0, sw = 14;
  c.save(); c.beginPath(); c.rect(x, ey, w, 8); c.clip();
  c.fillStyle = '#f2b630'; c.fillRect(x, ey, w, 8);
  c.fillStyle = INK; for (let k = 0; k < w / sw + 1; k++) { const sx = x + k * sw; c.beginPath(); c.moveTo(sx, ey); c.lineTo(sx + 7, ey); c.lineTo(sx - 1, ey + 8); c.lineTo(sx - 8, ey + 8); c.closePath(); c.fill(); }
  c.restore();
  // a blinking lamp
  const on = Math.sin(t * 4 + x * 0.01) > 0;
  c.fillStyle = on ? '#ff4a4a' : '#6a2030'; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(x + w * 0.5, o.top ? y1 - 16 : y0 + 16, 3.5, 0, TAU); c.fill(); c.stroke();
  c.restore();
}

// ---- rescue pod: a maintenance robot waving inside a bubble, with a beacon ----
export function drawPod(c, x, y, t = 0, ph = 0) {
  const by = Math.sin(t * 2.4 + ph) * 3;
  c.save(); c.translate(x, y + by);
  // beacon ring
  const pu = 0.5 + 0.5 * Math.sin(t * 3 + ph);
  c.strokeStyle = `rgba(125,255,154,${0.25 + 0.45 * pu})`; c.lineWidth = 2; c.setLineDash([5, 6]); c.lineDashOffset = -t * 30; c.beginPath(); c.arc(0, 0, 24 + pu * 3, 0, TAU); c.stroke(); c.setLineDash([]);
  // bubble
  c.fillStyle = 'rgba(159,240,255,.22)'; c.strokeStyle = 'rgba(159,240,255,.9)'; c.lineWidth = 2.2; c.beginPath(); c.arc(0, 0, 19, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 14.5, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
  // little robot: body, head, antenna, waving arm
  c.strokeStyle = INK; c.lineWidth = 1.8;
  c.fillStyle = '#8d94a8'; c.beginPath(); c.roundRect(-7, -1, 14, 11, 3); c.fill(); c.stroke();
  c.fillStyle = '#c7cedb'; c.beginPath(); c.roundRect(-6.5, -12, 13, 11, 4); c.fill(); c.stroke();
  c.fillStyle = '#1c1530'; c.beginPath(); c.roundRect(-4.5, -9.5, 9, 5, 2); c.fill();
  c.fillStyle = '#5ef2ff'; c.beginPath(); c.arc(-1.8, -7, 1.4, 0, TAU); c.arc(2.2, -7, 1.4, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(0, -12); c.lineTo(0, -16); c.stroke(); c.fillStyle = '#ff4a4a'; c.beginPath(); c.arc(0, -17, 1.8, 0, TAU); c.fill();
  const wave = Math.sin(t * 9 + ph) * 0.5;
  c.save(); c.translate(7, 1); c.rotate(-0.9 + wave); c.fillStyle = '#8d94a8'; c.beginPath(); c.roundRect(0, -2, 9, 4, 2); c.fill(); c.stroke(); c.restore();
  c.save(); c.translate(-7, 2); c.rotate(0.6); c.fillStyle = '#8d94a8'; c.beginPath(); c.roundRect(-9, -2, 9, 4, 2); c.fill(); c.stroke(); c.restore();
  // beacon
  c.fillStyle = pu > 0.5 ? '#7dff9a' : '#2e7a48'; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -22, 3, 0, TAU); c.fill(); c.stroke();
  c.restore();
}

// ---- solar flare: a warm glow builds from the right (f 0..1 during the warning), then a white-hot flash ----
export function drawFlare(c, W, H, f, flash, t = 0) {
  if (f <= 0 && flash <= 0) return;
  c.save();
  if (f > 0) {
    const g = c.createLinearGradient(W, 0, W * (1 - 0.55 * f), 0);
    g.addColorStop(0, `rgba(255,170,60,${0.55 * f})`); g.addColorStop(1, 'rgba(255,170,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // rays
    c.globalAlpha = 0.25 * f; c.strokeStyle = '#ffd27a'; c.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = (i + 0.5) * H / 7 + Math.sin(t * 3 + i) * 10; c.beginPath(); c.moveTo(W, y); c.lineTo(W - 140 * f - (i % 2) * 60, y + (i - 3) * 8); c.stroke(); }
  }
  if (flash > 0) { c.globalAlpha = clamp(flash, 0, 1) * 0.75; c.fillStyle = '#fff1c8'; c.fillRect(0, 0, W, H); }
  c.restore();
}

// =============================================================================================
// v3.1: rage robots, wingmen, weapon pickups, area blasts, boss parts
const ATK_COL = { shot: '#ff8a5a', dash: '#ffb347', bomb: '#ff5a4a', sweep: '#ff3fa0', shield: '#5ec8ff', swarm: '#b98aff' };
// a rage robot: one body, the part of its newest attack on top; o.tell 0..1 (charging an attack), o.raging, o.shieldBy
export function drawRageBot(c, o, t = 0) {
  const s = o.r / 20, rage = !!o.raging, main = o.main || 'shot', col = ATK_COL[main] || '#ff8a5a';
  c.save(); c.translate(o.x, o.y);
  if (rage) { const p = 0.6 + 0.4 * Math.sin(t * 14 + (o.seed || 0)); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,60,50,${0.22 * p})`; c.beginPath(); c.arc(0, 0, o.r * 1.9, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }
  if (o.dashing) c.rotate(0); else c.rotate(Math.sin(t * 2 + (o.seed || 0)) * 0.06);
  c.scale(s, s);
  c.strokeStyle = INK; c.lineWidth = 2;
  // thruster (right side, it faces left)
  c.fillStyle = rage ? '#ff5a3c' : '#ffb347'; c.beginPath(); c.moveTo(16, -5); c.lineTo(27 + Math.sin(t * 28) * 3 + (o.dashing ? 12 : 0), 0); c.lineTo(16, 5); c.closePath(); c.fill();
  // legs / fins
  c.fillStyle = '#5b6178';
  c.beginPath(); c.moveTo(4, 12); c.lineTo(12, 22); c.lineTo(16, 20); c.lineTo(10, 10); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(4, -12); c.lineTo(12, -22); c.lineTo(16, -20); c.lineTo(10, -10); c.closePath(); c.fill(); c.stroke();
  // body
  c.fillStyle = rage ? '#c8473a' : '#8d94a8'; c.beginPath(); c.roundRect(-15, -14, 31, 28, 9); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.roundRect(-11, -11, 9, 18, 4); c.fill();
  rivet(c, 11, -9); rivet(c, 11, 9);
  // the attack part
  c.fillStyle = col;
  if (main === 'shot') { c.fillStyle = '#4d5268'; c.beginPath(); c.roundRect(-28, -4, 16, 8, 2); c.fill(); c.stroke(); }
  else if (main === 'dash') { c.fillStyle = '#e2e6ee'; c.beginPath(); c.moveTo(-15, -8); c.lineTo(-32, 0); c.lineTo(-15, 8); c.closePath(); c.fill(); c.stroke(); }
  else if (main === 'bomb') { c.beginPath(); c.roundRect(-4, -22, 12, 9, 3); c.fill(); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(2, -17.5, 2.2, 0, TAU); c.fill(); }
  else if (main === 'sweep') { c.fillStyle = '#1c1530'; c.beginPath(); c.arc(-9, 0, 8, 0, TAU); c.fill(); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(-10, 0, 4.5, 0, TAU); c.fill(); }
  else if (main === 'shield') { c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -24); c.stroke(); c.beginPath(); c.arc(0, -26, 4, 0, TAU); c.fill(); c.stroke(); }
  else if (main === 'swarm') { c.fillStyle = '#4d5268'; c.beginPath(); c.roundRect(-2, 13, 14, 7, 2); c.fill(); c.stroke(); c.fillStyle = col; c.fillRect(1, 15, 8, 3); }
  // eye
  if (main !== 'sweep') {
    c.fillStyle = INK; c.beginPath(); c.arc(-6, -3, 6, 0, TAU); c.fill();
    c.fillStyle = rage ? '#ffe066' : '#ff4a4a'; c.beginPath(); c.arc(-7, -3.5, 3.2, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(-8.2, -5, 1.1, 0, TAU); c.fill();
    if (rage) { c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-13, -11); c.lineTo(-2, -8); c.stroke(); }
  }
  // tell: a growing glow at the part that is about to act
  const tell = clamp(o.tell || 0, 0, 1);
  if (tell > 0) { c.globalCompositeOperation = 'lighter'; c.fillStyle = col; c.globalAlpha *= 0.35 + 0.6 * tell; c.beginPath(); c.arc(main === 'bomb' ? 2 : -24, main === 'bomb' ? -18 : 0, 4 + 8 * tell, 0, TAU); c.fill(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  flashOver(c, o.flash, () => { c.beginPath(); c.roundRect(-16, -15, 33, 30, 9); });
  c.restore();
  // a shield link from a shielder
  if (o.shieldBy && !o.shieldBy.dead) {
    c.save(); c.strokeStyle = 'rgba(94,200,255,.75)'; c.lineWidth = 2; c.setLineDash([5, 5]); c.lineDashOffset = -t * 40;
    c.beginPath(); c.moveTo(o.shieldBy.x, o.shieldBy.y - 20); c.lineTo(o.x, o.y); c.stroke(); c.setLineDash([]);
    c.strokeStyle = 'rgba(159,230,255,.85)'; c.lineWidth = 3; c.beginPath(); c.arc(o.x, o.y, o.r + 9, 0, TAU); c.stroke(); c.restore();
  }
}

// a wingman: a rescued maintenance robot flying with the ship (o.f flash on hit)
export function drawWingman(c, x, y, t = 0, ph = 0) {
  c.save(); c.translate(x, y + Math.sin(t * 3 + ph) * 1.5);
  c.strokeStyle = INK; c.lineWidth = 1.6;
  c.fillStyle = '#7dff9a'; c.beginPath(); c.moveTo(-9, -3); c.lineTo(-17 - Math.sin(t * 30) * 2, 0); c.lineTo(-9, 3); c.closePath(); c.fill();
  c.fillStyle = '#c7cedb'; c.beginPath(); c.roundRect(-9, -7, 18, 14, 5); c.fill(); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.roundRect(-3, -4.5, 10, 6, 2); c.fill();
  c.fillStyle = '#5ef2ff'; c.beginPath(); c.arc(0.5, -1.5, 1.4, 0, TAU); c.arc(4.5, -1.5, 1.4, 0, TAU); c.fill();
  c.fillStyle = '#4d5268'; c.beginPath(); c.roundRect(8, -1.5, 7, 3, 1); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(0, -7); c.lineTo(0, -11); c.stroke(); c.fillStyle = '#7dff9a'; c.beginPath(); c.arc(0, -12, 1.8, 0, TAU); c.fill();
  c.restore();
}

// weapon pickups: a crate with the weapon's icon
const WP = { w_spread: '#ffb347', w_laser: '#5ef2ff', w_homing: '#ff6ad5', w_saw: '#ffe066' };
export function drawWeaponPick(c, kind, x, y, t = 0) {
  const col = WP[kind] || '#ffe066', pu = 0.5 + 0.5 * Math.sin(t * 4);
  c.save(); c.translate(x, y + Math.sin(t * 2.6) * 3);
  c.globalCompositeOperation = 'lighter'; c.fillStyle = col; c.globalAlpha = 0.18 + 0.15 * pu; c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.fill(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.rotate(Math.sin(t * 2) * 0.12);
  c.strokeStyle = INK; c.lineWidth = 2; c.fillStyle = '#2a2150'; c.beginPath(); c.roundRect(-14, -14, 28, 28, 7); c.fill(); c.stroke();
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.4; c.lineCap = 'round';
  if (kind === 'w_spread') { for (const a of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(-7, 0); c.lineTo(-7 + Math.cos(a) * 15, Math.sin(a) * 15); c.stroke(); } }
  else if (kind === 'w_laser') { c.lineWidth = 4; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke(); c.lineWidth = 1.5; c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke(); }
  else if (kind === 'w_homing') { c.beginPath(); c.moveTo(-8, 6); c.quadraticCurveTo(0, -12, 8, -2); c.stroke(); c.beginPath(); c.moveTo(8, -2); c.lineTo(3, -4); c.lineTo(6, 2); c.closePath(); c.fill(); }
  else if (kind === 'w_saw') { c.save(); c.rotate(t * 6); c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = i % 2 ? 5 : 9; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.restore(); }
  c.restore();
}
// a spinning saw blade
export function drawSaw(c, x, y, t = 0, r = 11) {
  c.save(); c.translate(x, y); c.rotate(t * 14);
  c.fillStyle = '#ffe066'; c.strokeStyle = INK; c.lineWidth = 1.6;
  c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, rr = i % 2 ? r * 0.62 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.arc(0, 0, r * 0.25, 0, TAU); c.fill();
  c.restore();
}
// the piercing laser weapon: a beam across the lane
export function drawLaserWeapon(c, x0, y, x1, t = 0) {
  c.save(); c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(94,242,255,.35)'; c.lineWidth = 12 + Math.sin(t * 40) * 2; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
  c.strokeStyle = 'rgba(220,252,255,.95)'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
  c.restore();
}
// an area-blast marker: a red circle that fills as the blast nears (f 0..1), then the blast (boom 0..1)
export function drawZone(c, z, t = 0) {
  const f = clamp(z.t / z.warn, 0, 1);
  c.save();
  if (z.ph === 'warn') {
    c.fillStyle = `rgba(255,60,50,${0.08 + 0.18 * f})`; c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,90,70,${0.5 + 0.5 * f})`; c.lineWidth = 2.5; c.setLineDash([8, 6]); c.lineDashOffset = -t * 30; c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.stroke(); c.setLineDash([]);
    c.fillStyle = `rgba(255,120,90,${0.25 + 0.4 * f})`; c.beginPath(); c.arc(z.x, z.y, z.r * f, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,230,200,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(z.x - 7, z.y); c.lineTo(z.x + 7, z.y); c.moveTo(z.x, z.y - 7); c.lineTo(z.x, z.y + 7); c.stroke();
    if (z.bx != null) { const bx = z.bx + (z.x - z.bx) * f, by = z.by + (z.y - z.by) * f - Math.sin(f * Math.PI) * 60; c.fillStyle = '#3b3b46'; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(bx, by, 6, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc(bx, by - 2, 2, 0, TAU); c.fill(); }
  } else {
    const k = clamp(z.t / 0.35, 0, 1);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,170,80,${0.6 * (1 - k)})`; c.beginPath(); c.arc(z.x, z.y, z.r * (0.6 + 0.5 * k), 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,240,200,${1 - k})`; c.lineWidth = 4; c.beginPath(); c.arc(z.x, z.y, z.r * (0.7 + 0.5 * k), 0, TAU); c.stroke();
  }
  c.restore();
}
// an expanding ring with a gap (boss ringGap): cx,cy centre, r radius, gap angle a ± w
export function drawRingGap(c, g, t = 0) {
  c.save();
  const al = g.ph === 'warn' ? 0.3 + 0.4 * clamp(g.t / g.warn, 0, 1) : 0.95;
  c.strokeStyle = g.ph === 'warn' ? `rgba(255,90,70,${al})` : `rgba(255,140,90,${al})`; c.lineWidth = g.ph === 'warn' ? 2 : 9; if (g.ph === 'warn') c.setLineDash([6, 6]);
  c.beginPath(); c.arc(g.x, g.y, g.ph === 'warn' ? 60 : g.r, g.a + g.w, g.a - g.w + TAU); c.stroke();
  if (g.ph !== 'warn') { c.strokeStyle = 'rgba(255,240,210,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(g.x, g.y, g.r, g.a + g.w, g.a - g.w + TAU); c.stroke(); }
  c.restore();
}
// a robot's laser sweep: warn = thin line at y, fire = a beam at the current y
export function drawSweep(c, L, t = 0) {
  c.save();
  if (L.ph === 'warn') { c.strokeStyle = `rgba(255,63,160,${0.35 + 0.5 * clamp(L.t / L.warn, 0, 1)})`; c.lineWidth = 1.6; c.setLineDash([10, 6]); c.beginPath(); c.moveTo(L.x0, L.y0); c.lineTo(0, L.y0); c.stroke(); c.setLineDash([]); c.strokeStyle = 'rgba(255,63,160,.35)'; c.beginPath(); c.moveTo(L.x0, L.y1); c.lineTo(0, L.y1); c.stroke(); }
  else { c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,63,160,.45)'; c.lineWidth = 14; c.beginPath(); c.moveTo(L.x0, L.y); c.lineTo(0, L.y); c.stroke(); c.strokeStyle = 'rgba(255,220,240,.95)'; c.lineWidth = 3; c.beginPath(); c.moveTo(L.x0, L.y); c.lineTo(0, L.y); c.stroke(); }
  c.restore();
}

// ---- boss parts: drawn around the big boss core. p = { kind, x, y, r, hp, max, flash, dead, aim, tell } ----
export function drawBossPart(c, p, t = 0) {
  const s = p.r / 18;
  c.save(); c.translate(p.x, p.y); c.scale(s, s);
  c.strokeStyle = INK; c.lineWidth = 2;
  if (p.dead) {
    c.fillStyle = '#3b3b46'; c.beginPath(); c.moveTo(-10, -8); c.lineTo(6, -12); c.lineTo(12, -2); c.lineTo(4, 10); c.lineTo(-9, 8); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#ffb347'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-4, -2); c.lineTo(2, 2); c.moveTo(3, -5); c.lineTo(6, 1); c.stroke();
    c.restore(); return;
  }
  if (p.kind === 'gun') {
    c.fillStyle = '#5b6178'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); c.stroke();
    c.save(); c.rotate(p.aim != null ? p.aim : Math.PI); c.fillStyle = '#4d5268'; c.beginPath(); c.roundRect(4, -4.5, 22, 9, 2); c.fill(); c.stroke();
    if (p.tell > 0) { c.fillStyle = `rgba(255,120,60,${0.4 + 0.6 * p.tell})`; c.beginPath(); c.arc(26, 0, 3 + 4 * p.tell, 0, TAU); c.fill(); }
    c.restore();
    c.fillStyle = '#ff4a4a'; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill(); c.stroke();
  } else if (p.kind === 'hangar') {
    c.fillStyle = '#8d94a8'; c.beginPath(); c.roundRect(-18, -14, 36, 28, 6); c.fill(); c.stroke();
    const open = clamp(p.tell || 0, 0, 1);
    c.fillStyle = INK; c.beginPath(); c.roundRect(-13, -9, 16, 18, 3); c.fill();
    c.fillStyle = '#f2b630'; c.fillRect(-13, -9, 16, 18 * (1 - open)); c.fillStyle = INK; for (let k = -9; k < 9 - 18 * open; k += 6) c.fillRect(-13, k, 16, 2);
    rivet(c, 12, -9); rivet(c, 12, 9);
  } else if (p.kind === 'shieldGen') {
    const pu = 0.5 + 0.5 * Math.sin(t * 5);
    c.fillStyle = '#4d5268'; c.beginPath(); c.moveTo(-10, 14); c.lineTo(-6, -10); c.lineTo(6, -10); c.lineTo(10, 14); c.closePath(); c.fill(); c.stroke();
    c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(94,200,255,${0.4 + 0.4 * pu})`; c.beginPath(); c.arc(0, -14, 9, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#9fe8ff'; c.beginPath(); c.arc(0, -14, 6, 0, TAU); c.fill(); c.stroke();
  } else { // arm: a claw that slams (zones)
    c.fillStyle = '#9aa3b8'; c.beginPath(); c.roundRect(-16, -6, 30, 12, 4); c.fill(); c.stroke();
    c.fillStyle = '#e2552d'; c.beginPath(); c.moveTo(-16, -6); c.lineTo(-26, -12); c.lineTo(-22, 0); c.lineTo(-26, 12); c.lineTo(-16, 6); c.closePath(); c.fill(); c.stroke();
  }
  // hp ring
  const f = clamp(p.hp / p.max, 0, 1);
  c.strokeStyle = 'rgba(28,21,48,.6)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.stroke();
  c.strokeStyle = f > 0.5 ? '#7dff9a' : f > 0.25 ? '#ffd23f' : '#ff5a4a'; c.beginPath(); c.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke();
  flashOver(c, p.flash, () => { c.beginPath(); c.arc(0, 0, 18, 0, TAU); });
  c.restore();
}
// a boss guard drone: a small shield-carrying drone orbiting the core
export function drawGuard(c, g, t = 0) {
  c.save(); c.translate(g.x, g.y); c.rotate(g.rot || 0);
  c.strokeStyle = INK; c.lineWidth = 1.8;
  c.fillStyle = '#5ec8ff'; c.globalAlpha *= 0.55; c.beginPath(); c.arc(0, 0, 15, Math.PI * 0.55, Math.PI * 1.45); c.lineTo(0, 0); c.closePath(); c.fill(); c.globalAlpha /= 0.55;
  c.fillStyle = '#8d94a8'; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#ff4a4a'; c.beginPath(); c.arc(-2, 0, 3, 0, TAU); c.fill();
  c.restore();
  if (g.flash > 0) { c.save(); c.globalAlpha = clamp(g.flash, 0, 1) * 0.8; c.fillStyle = '#fff'; c.beginPath(); c.arc(g.x, g.y, 10, 0, TAU); c.fill(); c.restore(); }
}
