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
