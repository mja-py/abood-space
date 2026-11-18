// Test pilot (dev tool, not loaded by the game). In the browser console on a local server:
//   const P = await import('/tools/pilot.js'); P.boot();
//   await P.fly('venus', 2, 12)            one leg at ship level 12 → { secs, hits, boss times, hit log }
//   P.sweep([0,0,12,15,18,21,24,27])       all 24 legs in the background; read P.result() until done
// It dodges by scoring a grid of positions against everything that can hurt, aims at the nearest target, and
// fires the Amal Beam at bosses. It does not use the costume power or think ahead, so real players do better.
const errs = [];
export function boot() {
  try { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); } catch (e) { /* already */ }
  const st = document.createElement('style'); st.textContent = '*{animation:none!important} #banner{display:none!important}'; document.head.appendChild(st);
  addEventListener('error', e => errs.push(e.message));
  const oe = console.error; console.error = (...a) => { errs.push(a.map(x => (x && x.stack) || String(x)).join(' ').slice(0, 300)); oe(...a); };
  return 'booted';
}
export const errors = () => errs;
export async function fly(jid, li, lv, opt = {}) {
  const M = await import('/js/meta.js?v=__BUILD__'), g = window.__game, d = g.debug, D = M.data();
  D.up = {}; for (const id of M.USTA_ORDER.slice(0, lv)) D.up[id] = (D.up[id] || 0) + 1;
  for (const u of M.UPGRADES) if ((D.up[u.id] || 0) > u.max) D.up[u.id] = u.max;
  D.armed = []; d.invincible = false; errs.length = 0;
  g.start(jid, li); const w = d.world(), s = w.ship, dt = 1 / 60;
  let steps = 0, I = null; const fights = []; let cur = null, hits0 = 0;
  const danger = (x, y) => {
    let k = 0;
    for (const e of w.eshots) { if (e.dead) continue; for (let t = 0; t <= 0.75; t += 0.15) { const dx = e.x + e.vx * t - x, dy = e.y + e.vy * t - y, R = e.r + 24; if (dx * dx + dy * dy < R * R) { k += 3 - t * 2; break; } } }
    for (const o of w.objs) {
      if (o.dead) continue;
      if (o.w != null && o.y0 != null) { if (x > o.x - 60 && x < o.x + o.w + 30 && y > o.y0 - 24 && y < o.y1 + 24) k += 6; continue; }   // corridor walls
      if (o.ghost || o.harmless) continue;
      const vx = o.dashing ? -(o.dv || 500) : (o.st === 'dive' && o.dvx != null ? o.dvx : o.vx || 0), vy = o.st === 'dive' ? o.dvy || 0 : 0;
      for (let t = 0; t <= 0.6; t += 0.15) { const dx = o.x + vx * t - x, dy = o.y + vy * t - y, R = o.r + 22; if (dx * dx + dy * dy < R * R) { k += 3; break; } }
    }
    for (const m of w.meteors) if (!m.dead && Math.abs(m.y - y) < m.r + 26) k += 4;
    for (const m of w.emobs) if (!m.dead && (m.x - x) ** 2 + (m.y - y) ** 2 < (m.r + 40) ** 2) k += 2;
    for (const z of w.zones) if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (z.r + 16) ** 2) k += 4;
    for (const L of w.elasers) if (!L.dead && Math.abs(L.y - y) < 34) k += 4;
    for (const q of w.sweeps) if (!q.dead && x < q.x0 && y > Math.min(q.y0, q.y1) - 30 && y < Math.max(q.y0, q.y1) + 30) k += 3;
    const rv = d.world().rv; if (rv && (rv.x - x) ** 2 + (rv.y - y) ** 2 < (rv.r + 60) ** 2) k += 5;
    return k;
  };
  const max = opt.max || 60 * 520, xs = opt.far ? [80, 170, 260] : [90, 230, 380];
  while (steps < max) {
    if (steps % 4 === 0 && s.alive) {
      const rv = d.world().rv; let ty = rv ? rv.y : s.y, bd = 1e9;
      if (!rv) for (const o of w.objs) if (!o.dead && o.x > s.x + 30 && o.x < w.W && !o.harmless) { const dd = (o.x - s.x) + Math.abs(o.y - s.y) * 2; if (dd < bd) { bd = dd; ty = o.y; } }
      let best = null, bs = 1e9;
      for (let y = w.Y_MIN + 6; y <= w.Y_MAX - 6; y += 20) for (const x of xs) {
        const sc = danger(x, y) * 100 + Math.abs(y - ty) * 0.25 + Math.abs(y - s.y) * 0.12 + Math.abs(x - s.x) * 0.1 + Math.abs(x - xs[1]) * 0.03;
        if (sc < bs) { bs = sc; best = [x, y]; }
      }
      if (best) { s.tx = best[0]; s.ty = best[1]; }
    }
    try { d.step(dt, 1); } catch (e) { errs.push(String(e)); break; } steps++;
    if (g.state() !== 'play') break; I = d.info();
    if (I.boss && I.ds === 'fight' && (!cur || cur.id !== I.boss)) { cur = { id: I.boss, t0: steps, t1: null, h0: I.hits }; fights.push(cur); }
    if (cur && cur.t1 == null && (I.ds === 'fixed' || !I.boss)) { cur.t1 = steps; cur.hits = I.hits - cur.h0; }
    if (!fights.length) hits0 = I.hits;
    if (I.superF >= 1 && cur && cur.t1 == null && I.ds === 'fight') d.super();
  }
  I = I || {};
  return { leg: jid + (li + 1), lv, st: g.state(), secs: Math.round(steps / 60), legHits: hits0, hits: I.hits | 0, deaths: I.deaths | 0,
    fights: fights.map(f => f.id.replace(/^g_/, '') + ':' + Math.round(((f.t1 || steps) - f.t0) / 60) + 's' + (f.t1 ? '' : '!') + '/' + (f.hits == null ? I.hits - f.h0 : f.hits) + 'h').join(' '),
    hp: I.hp + '/' + I.maxHp, threat: d.threat && +(+d.threat()).toFixed(2), log: (I.hitLog || []).join(','), errs: errs.slice(0, 2) };
}
let RES = null, PROG = [];
const JS = ['moon', 'mars', 'venus', 'belt', 'jupiter', 'saturn', 'uranus', 'neptune'];
export function sweep(levels, legs = [0, 1, 2], js = JS, opt = {}) {
  RES = null; PROG = [];
  (async () => {
    for (const j of js) for (const l of legs) {
      const r = await fly(j, l, levels[JS.indexOf(j)], opt);
      PROG.push(`${r.leg} lv${r.lv} T${r.threat} ${r.st === 'arrive' ? 'ok' : r.st} t${r.secs} leg${r.legHits} all${r.hits} d${r.deaths} hp${r.hp} | ${r.fights}${opt.log ? ' [' + r.log + ']' : ''}${r.errs.length ? ' ERR ' + r.errs[0] : ''}`);
      await new Promise(r2 => setTimeout(r2, 0));
    }
    RES = PROG.join('\n');
  })();
  return 'started';
}
export const result = () => RES || ('PARTIAL\n' + PROG.join('\n'));
