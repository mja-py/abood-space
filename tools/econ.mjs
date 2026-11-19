// Hour-budget simulator (dev tool): node tools/econ.mjs
// Plays the story on paper with measured lengths (from tools/pilot.js runs) and the game's own payout and gate tables, and
// reports how long each journey takes to open and finish, and whether any journey can only be opened by replaying legs.
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const M = await import('../js/meta.js');
const LEG_SECS = [[150, 153, 219], [165, 180, 240], [165, 178, 250], [163, 189, 258], [171, 185, 260], [163, 190, 259], [163, 190, 270], [180, 183, 260]];
const MISSION_SECS = { fly: 96, rescue: 72, escort: 107, hold: 96, haul: 68, bossrush: 120, time: 78, hunt: 55 };
const MENU = 35;                                   // seconds between flights: results, menu, hangar
const retry = { skilled: 0.15, typical: 0.6, learning: 1.2 };   // extra attempts per flight, on average
function story(kind) {
  const R = retry[kind]; let t = 0, stars = 0; const rows = [];
  for (let j = 0; j < M.JOURNEYS.length; j++) {
    const J = M.JOURNEYS[j], g = M.journeyNeed(J.id), list = M.contractList(J.id); const t0 = t;
    // the gate: stars so far and the contracts of the journey before (already flown below)
    const short = j > 0 ? Math.max(0, g.need - stars) : 0;
    // star replays: a leg replayed for a missing star (about one star per replay)
    const prev = j > 0 ? j - 1 : 0; t += short * (LEG_SECS[prev][1] + MENU);
    stars += short;
    for (let li = 0; li < 3; li++) { t += (LEG_SECS[j][li] + MENU) * (1 + R); stars += kind === 'skilled' ? 2.6 : kind === 'typical' ? 2 : 1.5; }
    for (const c of list) t += (MISSION_SECS[c.type] + MENU) * (1 + R * 1.3);
    rows.push(`${J.id.padEnd(8)} gate ${String(g.need).padStart(2)} stars + ${g.cNeed} contracts | star replays ${short.toFixed(0).padStart(2)} | ${((t - t0) / 60).toFixed(0).padStart(3)} min | done at ${(t / 3600).toFixed(1)} h`);
  }
  return { hours: t / 3600, rows };
}
for (const k of Object.keys(retry)) { const s = story(k); console.log(`\n--- story, ${k} player: ${s.hours.toFixed(1)} h`); console.log(s.rows.join('\n')); }
// everything: what is built so far against the 250-hour budget
const L = M.LONG, built = { story: true, hard: true, ship: 'partly (upgrades only; Marks and power levels come in v4.2)', rank: true, expeditions: false, families: false };
console.log('\n--- the 250-hour budget (targets) and what exists today');
for (const k in L) console.log(`${k.padEnd(12)} ${String(L[k]).padStart(3)} h   ${built[k] === true ? 'built' : built[k] || 'not built yet'}`);
console.log('rank 100 needs', 45 * 100 * 100, 'XP; a leg gives about 160-300, a contract 45-140');
