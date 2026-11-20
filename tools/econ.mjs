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
  const R = retry[kind]; let t = 0, stars = 0, allTiers = 0; const rows = [];
  for (let j = 0; j < M.JOURNEYS.length; j++) {
    const J = M.JOURNEYS[j], g = M.journeyNeed(J.id), list = M.contractList(J.id); const t0 = t;
    // the gate: stars so far and the contracts of the journey before (already flown below)
    const short = j > 0 ? Math.max(0, g.need - stars) : 0;
    // star replays: a leg replayed for a missing star (about one star per replay)
    const prev = j > 0 ? j - 1 : 0; t += short * (LEG_SECS[prev][1] + MENU);
    stars += short;
    for (let li = 0; li < 3; li++) { t += (LEG_SECS[j][li] + MENU) * (1 + R); stars += kind === 'skilled' ? 2.6 : kind === 'typical' ? 2 : 1.5; }
    // tier 1 of every contract, plus the tier-2 ones the NEXT gate asks for (harder: more retries)
    for (const c of list) t += (MISSION_SECS[c.type] + MENU) * (1 + R * 1.3);
    const nx = M.JOURNEYS[j + 1], t2 = nx ? M.journeyNeed(nx.id).t2Need : 2;
    for (let k = 0; k < t2; k++) t += (MISSION_SECS[list[k % list.length].type] + MENU) * (1 + R * 2.2);
    allTiers += list.reduce((a, c) => a + (MISSION_SECS[c.type] + MENU) * ((1 + R * 2.2) + (1 + R * 3.2)), 0) - t2 * 0;
    rows.push(`${J.id.padEnd(8)} gate ${String(g.need).padStart(2)} stars + ${g.cNeed} contracts | star replays ${short.toFixed(0).padStart(2)} | ${((t - t0) / 60).toFixed(0).padStart(3)} min | done at ${(t / 3600).toFixed(1)} h`);
  }
  return { hours: t / 3600, rows, allTiers: allTiers / 3600 };
}
for (const k of Object.keys(retry)) { const s = story(k); console.log(`\n--- story, ${k} player: ${s.hours.toFixed(1)} h (every contract tier on top: +${s.allTiers.toFixed(1)} h)`); console.log(s.rows.join('\n')); }
// everything: what is built so far against the 250-hour budget
// expeditions (v4.2): the deep-space ladder to the depth the completion bar asks for. A sector is about 85 s of flying
// (measured with tools/pilot.js: haul 45-65, hunt 60, time 60, fly 96, hold 95, rescue 100, escort 107, the gate 115) and
// about 40 s at the stop (results, the route, a boon). The chance to finish a whole route falls as the ladder gets deeper;
// a failed route costs about 60% of its sectors. These chances are guesses until testers play it.
const SECTOR = 85, STOP = 40, win = { skilled: D => Math.max(0.45, 0.95 - 0.010 * D), typical: D => Math.max(0.25, 0.85 - 0.014 * D), learning: D => Math.max(0.15, 0.7 - 0.016 * D) };
function ladder(kind) {
  let t = 0, routes = 0;
  for (let D = 1; D <= M.EXP_DEPTH; D++) { const n = M.expSectors('ladder', D), p = win[kind](D), tries = 1 / p; routes += tries; t += n * (SECTOR + STOP) * (1 + (tries - 1) * 0.6); }
  return { hours: t / 3600, routes };
}
console.log('\n--- expeditions: the ladder to depth ' + M.EXP_DEPTH + ' (' + M.BOONS.length + ' boons, one per stop)');
for (const k of Object.keys(win)) { const r = ladder(k); console.log(`${k.padEnd(9)} ${r.hours.toFixed(1).padStart(5)} h   about ${Math.round(r.routes)} routes`); }
console.log('a daily route is about ' + (5 * (SECTOR + STOP) / 60).toFixed(0) + ' min, a weekly one about ' + (10 * (SECTOR + STOP) / 60).toFixed(0) + ' min');
const L = M.LONG, built = { story: true, hard: true, ship: 'partly (upgrades only; Marks and power levels are the next step)', rank: true, expeditions: true, families: false };
console.log('\n--- the 250-hour budget (targets) and what exists today');
for (const k in L) console.log(`${k.padEnd(12)} ${String(L[k]).padStart(3)} h   ${built[k] === true ? 'built' : built[k] || 'not built yet'}`);
console.log('rank 100 needs', 45 * 100 * 100, 'XP; a leg gives about 160-300, a contract 45-140');
