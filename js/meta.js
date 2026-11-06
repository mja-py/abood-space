// Progression for "Abood to the Moon": save data, in-game dirhams, the eight journeys, Usta's hangar upgrades,
// the suit wardrobe, daily missions, badges and the 7-day login gift.
// Everything lives in localStorage on this device. Dirhams are an in-game currency only: there are no real payments.
// Pure data + save: this module never touches the DOM, and it runs in node (no localStorage -> in-memory save).
//
// ---- exports ----
// data
//   JOURNEYS            [{ id, planet, from, theme:{ sky:[top,mid,bottom], nebula:[c1,c2,c3], dust, rock:[base,dark,light], ice:[base,dark,light], star },
//                          legs:[{ dur, speed, spawn, mix:{rockS,rockM,rockL,ice,crystal,panel,tank,drone,dish}, meteor:[minGap,maxGap], firstMeteor, warn }] }]
//   UPGRADES            [{ id, max, price:[...] }]                     (ids: blaster spread hull shield super engine magnet nabeeh)
//   SUITS               [{ id, price, col, shade, trim, visor, perk?, hp?, superStart?, coinMult?, badge? }]
//   BADGES              [{ id, tiered:true, goals:[b,s,g], stat } | { id, reward, unlock? }]
//   TIER_REWARD         [20, 200, 2000]   dirhams for bronze / silver / gold
//   LOGIN               [5, 8, 10, 14, 18, 22, 30]   7-day login gift (day 7+ keeps paying 30)
//   DAILY_BONUS         40 extra dirhams for claiming all three daily missions
//   REPLAY_PAY          0.4 (replayed legs pay 40%)
//   DROPS               suggested drop table for game.js (coin chance per kind, crystal coins, pickup chance)
//   START_COINS         20
// save
//   save(), data() -> raw save object, resetSave(), today() -> 'YYYY-MM-DD'
//   settings() -> { muted, lang, picked, quality } (a copy), setSetting(k, v)
//   seen(k) -> bool, markSeen(k)            one-off flags (story shown, help shown, tutorial...)
// money
//   coins(), addCoins(n) -> new total, spend(n) -> bool
//   legReward(jid, li) -> what finishing this leg pays now (full the first time, 40% on replays)
//   legPay(j, li) -> full first-time pay by journey index, journeyBonus(j) -> arrival bonus by journey index
// upgrades
//   level(id) 0..max, nextPrice(id) -> number | null (maxed), canBuy(id) -> bool
//   buyUpgrade(id) -> { ok:true, level, price } | { ok:false, reason:'unknown'|'max'|'coins', price }
//   upValue(id, lv) -> numbers for that upgrade at level lv (what stats() would use), totalLevels(), tier() 0..4
//   stats() -> { maxHp, dmg, fireRate, guns, shieldCd, superGain, superDur, superPassive, follow, maxVy, magnet,
//                bot:{ lv, rate, every, dmg, vacuum, double, warn }, tier, suit, coinMult, superStart }
// suits
//   suit() -> current suit object, ownsSuit(id), buySuit(id) -> { ok, reason:'unknown'|'owned'|'badge'|'coins' },
//   wearSuit(id) -> { ok:true } | false
// progress
//   journeyIndex(jid), journey(jid), leg(jid, li), isUnlocked(jid), legsDone(jid) 0..3, canPlay(jid, li),
//   nextPlayable() -> { jid, li }, planetsDone() 0..8, best(jid) -> best leg score in that journey
//   startRun()  optional: call when a leg starts (resets the live counters; settlement also resets them)
//   finishLeg(jid, li, run) -> { reward, bonus, picked, total, journeyDone, unlocked, first, newBest, best, badges, missions }
//   failLeg(jid, li, run)   -> { kept, newBest, best, badges, missions }
//      run = { score, kills, coins, hits, meteors, supers, noHit }   (meteors = meteors dodged)
// events, missions, badges, login
//   track(ev, n=1)   live counters: 'rocks'|'kill', 'coins'|'coin', 'meteorsDodged'|'meteor'|'dodge', 'supers'|'super',
//                    'crystals', 'junk', 'tanks', 'pickups', 'hits'. Settlement-owned counters (legs, planets, runs, noHit,
//                    deaths) are counted by finishLeg/failLeg only, so calling track() for them does nothing.
//                    It is safe to BOTH track() live and pass totals in `run`: settlement only adds what track() missed.
//   missions() -> [{ kind, goal, progress, reward, claimed, done }] x3 (today), claimMission(i) -> dirhams paid (0 = nothing)
//   missionsReady() -> count, takeDone() -> missions finished since last asked [{ i, kind, goal, reward }]
//   badgeList() -> [{ id, tiered, tier 0..3, goal, progress, reward, done, date }], checkBadges() -> newly earned
//   login() -> { day 1..7, gift, claimable, streak }, claimLogin() -> dirhams paid (0 = already claimed)
//   loginReady() -> bool

const KEY = 'abood-moon-v1';
const SCHEMA = 1;
const pad = n => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const dayNo = s => Math.round(new Date(s + 'T12:00:00').getTime() / 864e5);
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const r2 = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// storage: localStorage when it works, otherwise a plain in-memory save (private windows, blocked storage, node)
const store = (() => {
  let ls = null;
  try { ls = globalThis.localStorage || null; if (ls) { ls.setItem(KEY + '.t', '1'); ls.removeItem(KEY + '.t'); } } catch (e) { ls = null; }
  const mem = {};
  return {
    get: k => { try { if (ls) return ls.getItem(k); } catch (e) {} return k in mem ? mem[k] : null; },
    set: (k, v) => { try { if (ls) { ls.setItem(k, v); return; } } catch (e) {} mem[k] = v; },
  };
})();

// ---- journeys ----
// Difficulty runs along all 24 legs: d = journey*3 + leg, t = d / 23 (0 at Moon leg 1, 1 at Neptune leg 3).
// It eases in (t^1.15) so the first journeys stay relaxed; per-journey modifiers bend it (Venus has more meteors,
// the belt is dense, Uranus is fast). Upgrades are what make the later planets fair.
const MIX0 = { rockS: 0, rockM: 0, rockL: 0, ice: 0, crystal: 0, panel: 0, tank: 0, drone: 0, dish: 0 };
function mkLeg(j, li, mix, m = {}) {
  const t = (j * 3 + li) / 23, e = Math.pow(t, 1.15), gap = m.gap || 1;
  return {
    dur: Math.round(60 + 20 * t),                               // seconds of flight
    speed: Math.round((90 + 120 * e) * (m.speed || 1)),         // world scroll, logical units per second
    spawn: r2((0.7 + 1.5 * e) * (m.spawn || 1)),                // new objects per second
    mix: Object.assign({}, MIX0, mix),                          // relative weights of what spawns
    meteor: [r2((16 - 12 * e) * gap, 1), r2((22 - 15 * e) * gap, 1)], // seconds between meteors (random in range)
    firstMeteor: Math.round((25 - 17 * e) * (m.first || 1)),    // no meteor before this many seconds
    warn: r2(1.5 - 0.6 * t),                                    // seconds of lane warning before a meteor charges
  };
}
const ICE = ['#bfe6f6', '#7fb2cc', '#f2fcff'];
export const JOURNEYS = [
  { id: 'moon', planet: 'moon', from: 'earth',
    theme: { sky: ['#04061a', '#0c1236', '#1a2452'], nebula: ['#3b4fb8', '#6a3fa0', '#1f7a9a'], dust: '#9fb4ff', rock: ['#8a8178', '#5a524c', '#cbc1b4'], ice: ICE, star: '#ffffff' },
    legs: [
      mkLeg(0, 0, { rockS: 10, rockM: 2, crystal: 0.6, panel: 0.6 }),                                          // leaving orbit: small rocks
      mkLeg(0, 1, { rockS: 6, rockM: 3, rockL: 0.4, crystal: 0.6, panel: 3, tank: 1.5, drone: 0.5, dish: 1.2 }), // the junk ring
      mkLeg(0, 2, { rockS: 7, rockM: 4, rockL: 1.2, crystal: 0.8, panel: 1, tank: 0.8, dish: 0.6 }),            // lunar approach
    ] },
  { id: 'mars', planet: 'mars', from: 'moon',
    theme: { sky: ['#0a0510', '#260d1c', '#4a1a1c'], nebula: ['#c2442c', '#7a2a5a', '#e0803a'], dust: '#ffb08a', rock: ['#9a5a3c', '#62351f', '#d8946a'], ice: ICE, star: '#fff4ec' },
    legs: [
      mkLeg(1, 0, { rockS: 6, rockM: 4, rockL: 1.5, crystal: 0.8, panel: 1, tank: 1, drone: 0.8, dish: 0.8 }),
      mkLeg(1, 1, { rockS: 6, rockM: 4, rockL: 1.5, crystal: 0.6, panel: 0.6, tank: 0.8, drone: 0.5, dish: 0.5 }, { gap: 0.72 }), // meteor stream
      mkLeg(1, 2, { rockS: 5, rockM: 5, rockL: 2.5, crystal: 1, panel: 0.4, tank: 1, drone: 1, dish: 0.6 }),
    ] },
  { id: 'venus', planet: 'venus', from: 'mars',
    theme: { sky: ['#120806', '#3d1608', '#6e2d0c'], nebula: ['#ff8a2a', '#e0502a', '#ffd06a'], dust: '#ffd59a', rock: ['#8c6a4a', '#5a3e28', '#d6a46e'], ice: ICE, star: '#fff0d8' },
    legs: [
      mkLeg(2, 0, { rockS: 5, rockM: 5, rockL: 2, crystal: 0.8, panel: 0.8, tank: 1.2, drone: 1, dish: 0.6 }, { gap: 0.78 }),
      mkLeg(2, 1, { rockS: 5, rockM: 5, rockL: 2.5, crystal: 0.8, panel: 0.4, tank: 1.2, drone: 1.2, dish: 0.8 }, { gap: 0.72 }),
      mkLeg(2, 2, { rockS: 4, rockM: 5, rockL: 3, crystal: 1, panel: 0.4, tank: 1.4, drone: 1.4, dish: 1 }, { gap: 0.7, first: 0.8 }),
    ] },
  { id: 'belt', planet: 'belt', from: 'venus',
    theme: { sky: ['#070612', '#151228', '#261d3a'], nebula: ['#7a5ac8', '#3fa0a0', '#c87a4a'], dust: '#d8c8a8', rock: ['#7d7064', '#4a4038', '#c2b29c'], ice: ICE, star: '#ffffff' },
    legs: [ // dense big rocks and lots of crystals (the money journey); fewer meteors to make up for it
      mkLeg(3, 0, { rockS: 4, rockM: 6, rockL: 4, crystal: 3, panel: 0.4, tank: 0.5, drone: 0.4 }, { spawn: 1.08, gap: 1.2 }),
      mkLeg(3, 1, { rockS: 3, rockM: 6, rockL: 5, crystal: 3.5, tank: 0.6, drone: 0.5 }, { spawn: 1.1, gap: 1.2 }),
      mkLeg(3, 2, { rockS: 3, rockM: 6, rockL: 6, crystal: 4, tank: 0.6, drone: 0.6, dish: 0.4 }, { spawn: 1.1, gap: 1.15 }),
    ] },
  { id: 'jupiter', planet: 'jupiter', from: 'belt',
    theme: { sky: ['#0b0710', '#241626', '#40292a'], nebula: ['#d8955a', '#a85a3a', '#e8c89a'], dust: '#f2d6b0', rock: ['#86766a', '#54463c', '#c8b49e'], ice: ICE, star: '#fff8ee' },
    legs: [
      mkLeg(4, 0, { rockS: 3, rockM: 4, rockL: 2.5, ice: 3, crystal: 1.2, panel: 0.6, tank: 1, drone: 1, dish: 0.8 }),
      mkLeg(4, 1, { rockS: 2, rockM: 4, rockL: 3, ice: 4, crystal: 1.2, panel: 0.4, tank: 1, drone: 1.2, dish: 0.8 }),
      mkLeg(4, 2, { rockS: 2, rockM: 4, rockL: 3.5, ice: 5, crystal: 1.4, tank: 1.2, drone: 1.2, dish: 1 }),
    ] },
  { id: 'saturn', planet: 'saturn', from: 'jupiter',
    theme: { sky: ['#0a0a14', '#1e1a2e', '#3a3248'], nebula: ['#e6c87a', '#9a7ac8', '#c8a06a'], dust: '#f6e6b8', rock: ['#9a9080', '#625a4e', '#d8ccb4'], ice: ICE, star: '#fffbe8' },
    legs: [ // ring debris: mostly ice
      mkLeg(5, 0, { rockS: 2, rockM: 3, rockL: 2, ice: 7, crystal: 1.4, panel: 1, tank: 1, drone: 1, dish: 1 }),
      mkLeg(5, 1, { rockS: 1, rockM: 3, rockL: 2.5, ice: 8, crystal: 1.6, panel: 1, tank: 1.2, drone: 1.2, dish: 1 }),
      mkLeg(5, 2, { rockS: 1, rockM: 3, rockL: 3, ice: 9, crystal: 1.8, panel: 0.6, tank: 1.2, drone: 1.4, dish: 1.2 }),
    ] },
  { id: 'uranus', planet: 'uranus', from: 'saturn',
    theme: { sky: ['#03101a', '#082e3a', '#0f4a52'], nebula: ['#3fd6c8', '#3a8ad0', '#9af0e0'], dust: '#c8fff6', rock: ['#7a8a8e', '#4a5658', '#bfd4d6'], ice: ['#c8f4f0', '#82c2c0', '#f4fffe'], star: '#effffd' },
    legs: [ // cold teal, fast ice
      mkLeg(6, 0, { rockS: 1, rockM: 2, rockL: 2, ice: 9, crystal: 1.4, panel: 0.6, tank: 1.2, drone: 1.4, dish: 1 }, { speed: 1.03 }),
      mkLeg(6, 1, { rockS: 1, rockM: 2, rockL: 2.5, ice: 10, crystal: 1.5, panel: 0.6, tank: 1.2, drone: 1.5, dish: 1 }, { speed: 1.03 }),
      mkLeg(6, 2, { rockS: 1, rockM: 2, rockL: 3, ice: 11, crystal: 1.6, panel: 0.5, tank: 1.3, drone: 1.6, dish: 1.2 }, { speed: 1.02 }),
    ] },
  { id: 'neptune', planet: 'neptune', from: 'uranus',
    theme: { sky: ['#020418', '#061640', '#0c2a6a'], nebula: ['#2a5ae0', '#4a2ab0', '#3ac0f0'], dust: '#a8c8ff', rock: ['#6e7890', '#40485e', '#b4c0d8'], ice: ['#b8d8ff', '#6f98d6', '#eef6ff'], star: '#eef4ff' },
    legs: [ // deep blue, the hardest
      mkLeg(7, 0, { rockS: 1, rockM: 2.5, rockL: 3, ice: 10, crystal: 1.5, panel: 0.6, tank: 1.4, drone: 1.6, dish: 1.2 }),
      mkLeg(7, 1, { rockS: 1, rockM: 2.5, rockL: 3.5, ice: 11, crystal: 1.6, panel: 0.6, tank: 1.5, drone: 1.8, dish: 1.2 }),
      mkLeg(7, 2, { rockS: 1, rockM: 3, rockL: 4, ice: 12, crystal: 1.8, panel: 0.6, tank: 1.6, drone: 2, dish: 1.4 }),
    ] },
];
export const journeyIndex = jid => JOURNEYS.findIndex(j => j.id === jid);
export const journey = jid => JOURNEYS[journeyIndex(jid)] || null;
export const leg = (jid, li) => { const j = journey(jid); return (j && j.legs[li]) || null; };

// Suggested drops for game.js (it may use its own): chance that a destroyed thing drops one coin,
// crystal rocks always drop 3..6 coins worth 2 each, and the chance of a rare pickup (repair/shield/cell/rapid).
export const DROPS = {
  coin: { rockS: 0.12, rockM: 0.3, rockL: 0.55, ice: 0.25, crystal: 0, panel: 0.4, tank: 0.3, drone: 0.6, dish: 0.5 },
  crystal: [3, 6], crystalValue: 2, pickup: 0.05,
};

// ---- economy ----
// Leg reward round(60 * 1.55^j * (1 + 0.35*li)); replays pay 40%. Arrival bonus round(250 * 1.6^j).
// Expected earnings on a first clear with no failures ("pickups" = coins picked up with ~65% of things destroyed, the
// DROPS table below, no magnet), and what a greedy "buy the cheapest" player can afford along the way (simulated).
// Start: 20 dirhams + 5 login gift + 10 first-flight badge. Hangar total: 50,240 (+ 4,000 for the two perk suits).
//
//   journey  legs   rewards  pickups  bonus | cum. earned | bought by the end of it (greedy)          | levels | tier
//   moon     1        60       ~16      -   |       ~115  | magnet 1 (90)  <- first buy after leg 1    |   1    |
//   moon     2        81       ~19      -   |       ~215  | engine 1 (100)                            |   2    |
//   moon     3       102       ~25     250  |       ~700  | blaster 1, hull 1, nabeeh 1 (moon badge)  |   5    |  0
//   mars     1-3     377       ~94     400  |     ~1,850  | super 1, spread 1, shield 1, blaster 2, hull 2 | 10 |  1
//   venus    1-3     584      ~126     640  |     ~3,250  | magnet 2, engine 2, super 2               |  13    |  1
//   belt     1-3     905      ~400   1,024  |     ~5,580  | spread 2, nabeeh 2, shield 2, blaster 3   |  17    |  2
//   jupiter  1-3   1,403      ~220   1,638  |     ~8,840  | hull 3, magnet 3, super 3                 |  20    |  2
//   saturn   1-3   2,175      ~270   2,621  |    ~14,600  | engine 3, nabeeh 3, spread 3, shield 3 + gold suit | 24 | 3
//   uranus   1-3   3,369      ~290   4,194  |    ~22,460  | blaster 4, hull 4, super 4                |  27    |  3
//   neptune  1-3   5,223      ~330   6,711  |    ~36,720  | nabeeh 4, spread 4, shield 4              |  30    |  4
// (cum. earned includes the badge rewards; daily missions 30-60 x3 (+40) and the login gift come on top.)
// A first clear does NOT buy everything: blaster 5 / hull 5 (5,000 each), nabeeh 5 (7,000) and the heat / pilot suits
// (~21,000 together) need farming: a Neptune leg-3 replay pays 877 + ~115 pickups, a Belt leg-3 replay 152 + ~150
// crystal coins, so maxing out takes ~20 replays of the late legs on top of the retries players make on the way.
export const REPLAY_PAY = 0.4;
export const START_COINS = 20;
export const legPay = (j, li) => Math.round(60 * Math.pow(1.55, j) * (1 + 0.35 * li));
export const journeyBonus = j => Math.round(250 * Math.pow(1.6, j));

// ---- hangar upgrades (Usta) ----
// Prices start at 90-250 and grow about x2.5 per level (the cheapest are affordable after 1-2 Moon legs).
export const UPGRADES = [
  { id: 'blaster', max: 5, price: [120, 300, 750, 2000, 5000] },
  { id: 'spread', max: 4, price: [180, 500, 1500, 4000] },
  { id: 'hull', max: 5, price: [120, 320, 800, 2000, 5000] },
  { id: 'shield', max: 4, price: [250, 700, 1800, 4500] },
  { id: 'super', max: 4, price: [160, 450, 1200, 3200] },
  { id: 'engine', max: 3, price: [100, 400, 1200] },
  { id: 'magnet', max: 3, price: [90, 350, 1100] },
  { id: 'nabeeh', max: 5, price: [150, 500, 1300, 3200, 7000] },
];
// numbers per level (index = level)
const FX = {
  blaster: { dmg: [1, 1.3, 1.6, 1.9, 2.2, 2.6], fireRate: [4, 4.6, 5.2, 5.8, 6.4, 7] },   // damage per bolt, bolts per second per gun
  spread: { guns: [1, 2, 3, 4, 5] },                                                       // bolts per volley (fan)
  hull: { maxHp: [3, 4, 5, 6, 7, 8] },
  shield: { shieldCd: [0, 18, 14, 10, 7] },                                                // seconds to recharge, 0 = no shield
  super: { superGain: [1, 1.2, 1.4, 1.6, 1.8], superDur: [2.2, 2.55, 2.9, 3.25, 3.6], superPassive: [0, 0.005, 0.008, 0.011, 0.015] },
  engine: { follow: [9, 12, 15, 19], maxVy: [520, 620, 720, 840] },                       // follow: smoothing rate 1/s; maxVy: units/s
  magnet: { magnet: [0, 80, 130, 190] },                                                   // coin pull radius
  nabeeh: { rate: [0, 0.7, 1, 1.3, 1.6, 2], dmg: [0, 1, 1.2, 1.5, 1.8, 2], vacuum: [0, 0, 0, 90, 110, 130] },
};

// ---- suits (wardrobe) ----
// Colours are free. Only suits with a perk cost dirhams (or a badge).
export const SUITS = [
  { id: 'white', price: 0, col: '#f4f6fb', shade: '#cdd4e2', trim: '#f0643c', visor: '#7fd3ff' },
  { id: 'blue', price: 0, col: '#9fd2f4', shade: '#6aa8d6', trim: '#ffffff', visor: '#bfeaff' },
  { id: 'sand', price: 0, col: '#ead5a6', shade: '#c7aa74', trim: '#d0452f', visor: '#8fd8ff' },
  { id: 'teal', price: 0, col: '#24474c', shade: '#142e31', trim: '#3fd0c0', visor: '#6ff0e0' },
  { id: 'heat', price: 1500, perk: 'perk_heat', hp: 1, col: '#e8603a', shade: '#b8432a', trim: '#e9edf2', visor: '#ffd27a' },
  { id: 'pilot', price: 2500, perk: 'perk_pilot', superStart: 0.3, col: '#2c3f7c', shade: '#1d2b58', trim: '#f2c94c', visor: '#9fe0ff' },
  { id: 'gold', price: 0, badge: 'saturn', perk: 'perk_gold', coinMult: 1.2, col: '#f2cf63', shade: '#c9a13a', trim: '#fff4c8', visor: '#ffe9a8' },
];

// ---- badges ----
// tiered: bronze -> silver -> gold, each tier needs 10x the goal and pays 10x the dirhams
export const TIER_REWARD = [20, 200, 2000];
export const BADGES = [
  { id: 'first', reward: 10, life: s => s.runs >= 1 },                       // first flight
  { id: 'hangar', reward: 10, life: s => s.bought >= 1 },                    // first upgrade from Usta
  { id: 'moon', reward: 100, life: () => legsDone('moon') >= 3 },            // reach the Moon
  { id: 'mars', reward: 200, life: () => legsDone('mars') >= 3 },
  { id: 'saturn', reward: 500, life: () => legsDone('saturn') >= 3, unlock: 'gold' }, // gold suit
  { id: 'tour', reward: 2000, life: () => legsDone('neptune') >= 3 },        // grand tour: Neptune
  { id: 'rocks', tiered: true, goals: [100, 1000, 10000], stat: s => s.rocks },
  { id: 'meteors', tiered: true, goals: [10, 100, 1000], stat: s => s.meteorsDodged },
  { id: 'coins', tiered: true, goals: [100, 1000, 10000], stat: s => s.coins },
  { id: 'supers', tiered: true, goals: [10, 100, 1000], stat: s => s.supers },
  { id: 'legs', tiered: true, goals: [5, 50, 500], stat: s => s.legs },
  { id: 'planets', tiered: true, goals: [3, 30, 300], stat: s => s.planets },     // arrivals (replays of a 3rd leg count)
  { id: 'nohit', tiered: true, goals: [3, 30, 300], stat: s => s.noHit },         // legs finished without a hit
];

// ---- missions ----
// three a day, picked from this pool by the date; each pays 30-60
const DAILY = [
  { kind: 'rocks', goals: [40, 80, 150], reward: g => Math.round(28 + g * 0.2) },     // destroy N things
  { kind: 'coins', goals: [25, 50, 80], reward: g => Math.round(28 + g * 0.35) },     // pick up N coins
  { kind: 'legs', goals: [1, 2, 3], reward: g => 25 + g * 10 },                       // finish N legs
  { kind: 'supers', goals: [2, 4, 6], reward: g => 26 + g * 5 },                      // use the super N times
  { kind: 'meteors', goals: [3, 6, 10], reward: g => 26 + g * 3 },                    // dodge N meteors
  { kind: 'noHit', goals: [1], reward: () => 60 },                                    // finish a leg without a hit
  { kind: 'runRocks', goals: [30, 50], reward: g => Math.round(20 + g * 0.6) },       // destroy N things in one leg
];
export const DAILY_BONUS = 40;
export const LOGIN = [5, 8, 10, 14, 18, 22, 30];

// ---- the save ----
const STAT0 = () => ({ rocks: 0, meteorsDodged: 0, coins: 0, supers: 0, legs: 0, planets: 0, runs: 0, noHit: 0, deaths: 0,
  hits: 0, crystals: 0, junk: 0, tanks: 0, pickups: 0, score: 0, bought: 0, streak: 0, spent: 0, earned: 0 });
const fresh = () => ({
  v: SCHEMA, coins: START_COINS, up: {}, suit: 'white', owned: SUITS.filter(s => !s.price && !s.badge).map(s => s.id),
  prog: {}, best: {}, stats: STAT0(), badges: {}, tiers: {}, daily: null, login: { last: null, streak: 0 },
  settings: { muted: false, lang: 'ar', picked: false, quality: null }, seen: {}, last: null,
});
let S = fresh();
function load() {
  let raw = null;
  try {
    raw = store.get(KEY);
    if (!raw) return;
    const d = JSON.parse(raw); if (!d || typeof d !== 'object') throw new Error('bad save');
    const f = fresh();
    S = Object.assign(f, d);
    for (const k of ['stats', 'settings', 'login']) S[k] = Object.assign(fresh()[k], d[k] && typeof d[k] === 'object' ? d[k] : {});
    for (const k of ['up', 'prog', 'best', 'badges', 'tiers', 'seen']) if (!S[k] || typeof S[k] !== 'object' || Array.isArray(S[k])) S[k] = {};
    if (!Array.isArray(S.owned)) S.owned = [];
  } catch (e) { // keep the unreadable save so progress can still be recovered by hand
    S = fresh(); try { if (raw) store.set(KEY + '.bak', raw); } catch (e2) {}
  }
  // tidy up: unknown ids out, numbers in range, free suits owned
  S.coins = Math.max(0, Math.floor(+S.coins || 0));
  for (const u of UPGRADES) S.up[u.id] = clamp(Math.floor(+S.up[u.id] || 0), 0, u.max);
  for (const k of Object.keys(S.up)) if (!UPGRADES.some(u => u.id === k)) delete S.up[k];
  for (const k of Object.keys(S.prog)) if (journeyIndex(k) < 0) delete S.prog[k]; else S.prog[k] = clamp(Math.floor(+S.prog[k] || 0), 0, 3);
  S.owned = S.owned.filter(id => SUITS.some(s => s.id === id));
  for (const s of SUITS) if (!s.price && !s.badge && !S.owned.includes(s.id)) S.owned.push(s.id);
  if (!S.owned.includes(S.suit)) S.suit = 'white';
  if (S.settings.lang !== 'ar' && S.settings.lang !== 'en') S.settings.lang = 'ar';
  S.v = SCHEMA;
}
load();
save();
export function save() { store.set(KEY, JSON.stringify(S)); }
export const data = () => S;
export function resetSave() { S = fresh(); live = {}; doneQ = []; save(); }
export const settings = () => Object.assign({}, S.settings);
export function setSetting(k, v) { S.settings[k] = v; save(); }
export const seen = k => !!S.seen[k];
export function markSeen(k) { if (!S.seen[k]) { S.seen[k] = today(); save(); } }

// ---- money ----
export const coins = () => S.coins;
export function addCoins(n) { n = Math.round(+n || 0); if (n) { S.coins = Math.max(0, S.coins + n); if (n > 0) S.stats.earned += n; save(); } return S.coins; }
export function spend(n) { if (n < 0 || S.coins < n) return false; S.coins -= n; S.stats.spent += n; save(); return true; }
const pay = n => { n = Math.max(0, Math.round(n)); S.coins += n; S.stats.earned += n; return n; };

// ---- upgrades ----
const upDef = id => UPGRADES.find(u => u.id === id);
export const level = id => S.up[id] || 0;
export const nextPrice = id => { const u = upDef(id); if (!u) return null; const k = level(id); return k >= u.max ? null : u.price[k]; };
export const canBuy = id => { const p = nextPrice(id); return p != null && S.coins >= p; };
export function buyUpgrade(id) {
  const u = upDef(id); if (!u) return { ok: false, reason: 'unknown', price: null };
  const k = level(id); if (k >= u.max) return { ok: false, reason: 'max', price: null };
  const price = u.price[k]; if (S.coins < price) return { ok: false, reason: 'coins', price };
  S.coins -= price; S.stats.spent += price; S.up[id] = k + 1; S.stats.bought += 1;
  checkBadges(); save();
  return { ok: true, level: k + 1, price };
}
export function upValue(id, lv = level(id)) {
  const fx = FX[id]; if (!fx) return {};
  const o = {}; for (const k of Object.keys(fx)) o[k] = fx[k][clamp(lv, 0, fx[k].length - 1)];
  if (id === 'nabeeh') { o.every = o.rate ? r2(1 / o.rate) : 0; o.double = lv >= 5; }
  return o;
}
export const totalLevels = () => UPGRADES.reduce((a, u) => a + level(u.id), 0);
export const tier = () => Math.min(4, Math.floor(totalLevels() / 7));

// The ONLY source of combat numbers for game.js.
export function stats() {
  const su = suit(), b = upValue('blaster'), sp = upValue('super'), en = upValue('engine'), nb = upValue('nabeeh'), lv = level('nabeeh');
  return {
    maxHp: upValue('hull').maxHp + (su.hp || 0),
    dmg: b.dmg, fireRate: b.fireRate,
    guns: upValue('spread').guns,
    shieldCd: upValue('shield').shieldCd,
    superGain: sp.superGain, superDur: sp.superDur, superPassive: sp.superPassive,
    follow: en.follow, maxVy: en.maxVy,
    magnet: upValue('magnet').magnet,
    // Nabeeh: level 0 only floats and warns; 1+ fires `rate` shots/s (every `every` s) for `dmg`; 3+ vacuums coins
    // within `vacuum`; 5 fires two lasers at once.
    bot: { lv, rate: nb.rate, every: nb.every, dmg: nb.dmg, vacuum: nb.vacuum, double: nb.double, warn: true },
    tier: tier(), suit: su.id,
    coinMult: su.coinMult || 1,
    superStart: su.superStart || 0,
  };
}

// ---- suits ----
export const suit = () => SUITS.find(s => s.id === S.suit) || SUITS[0];
export const ownsSuit = id => S.owned.includes(id);
export function buySuit(id) {
  const s = SUITS.find(x => x.id === id); if (!s) return { ok: false, reason: 'unknown' };
  if (ownsSuit(id)) return { ok: false, reason: 'owned' };
  if (s.badge) return { ok: false, reason: 'badge' };
  if (S.coins < s.price) return { ok: false, reason: 'coins' };
  S.coins -= s.price; S.stats.spent += s.price; S.stats.bought += 1; S.owned.push(id); S.suit = id;
  checkBadges(); save(); return { ok: true };
}
export function wearSuit(id) {
  if (!ownsSuit(id)) return false;
  S.suit = id; save(); return { ok: true };
}

// ---- progress ----
export const legsDone = jid => S.prog[jid] || 0;
export const isUnlocked = jid => { const j = journeyIndex(jid); return j === 0 || (j > 0 && legsDone(JOURNEYS[j - 1].id) >= 3); };
export const canPlay = (jid, li) => isUnlocked(jid) && li >= 0 && li < 3 && li <= legsDone(jid);
export const planetsDone = () => JOURNEYS.filter(j => legsDone(j.id) >= 3).length;
export function nextPlayable() {
  for (const j of JOURNEYS) if (isUnlocked(j.id) && legsDone(j.id) < 3) return { jid: j.id, li: legsDone(j.id) };
  if (S.last && canPlay(S.last.jid, S.last.li)) return { jid: S.last.jid, li: S.last.li };
  return { jid: JOURNEYS[JOURNEYS.length - 1].id, li: 2 };
}
export const best = jid => S.best[jid] || 0;
export function legReward(jid, li) {
  const j = journeyIndex(jid); if (j < 0) return 0;
  const full = legPay(j, li); return li >= legsDone(jid) ? full : Math.round(full * REPLAY_PAY);
}

// ---- live counters, missions ----
// track() counts as things happen. `live` remembers what was tracked during the current leg, so settlement only
// adds what the game did not track itself (game.js may do either, or both).
const ALIAS = { kill: 'rocks', kills: 'rocks', rock: 'rocks', rocks: 'rocks', coin: 'coins', coins: 'coins',
  meteor: 'meteorsDodged', meteors: 'meteorsDodged', dodge: 'meteorsDodged', meteorsDodged: 'meteorsDodged',
  super: 'supers', supers: 'supers', crystal: 'crystals', crystals: 'crystals', junk: 'junk', tank: 'tanks', tanks: 'tanks',
  pickup: 'pickups', pickups: 'pickups', hit: 'hits', hits: 'hits' };
const MISSION_EV = { rocks: 'rocks', coins: 'coins', supers: 'supers', meteors: 'meteorsDodged' };
let live = {};
let doneQ = [];
export function startRun() { live = {}; }
function bump(ev, n) {
  if (!n) return;
  S.stats[ev] = (S.stats[ev] || 0) + n;
  const D = ensureDaily();
  D.missions.forEach((m, i) => {
    if (MISSION_EV[m.kind] === ev) { m.progress = Math.min(m.goal, m.progress + n); checkDone(m, i); }
    if (m.kind === 'runRocks' && ev === 'rocks') { m.progress = Math.min(m.goal, Math.max(m.progress, live.rocks || 0)); checkDone(m, i); }
  });
}
function checkDone(m, i) { if (!m.done && m.progress >= m.goal) { m.done = true; doneQ.push({ i, kind: m.kind, goal: m.goal, reward: m.reward }); } }
export const takeDone = () => { const q = doneQ; doneQ = []; return q; };
export function track(ev, n = 1) {
  const k = ALIAS[ev]; n = +n || 0; if (!k || n <= 0) return;
  live[k] = (live[k] || 0) + n;
  bump(k, n);
  save();
}
export function ensureDaily() {
  const d = today();
  if (S.daily && S.daily.date === d) return S.daily;
  if (S.daily && Array.isArray(S.daily.missions)) { // a new day: pay what was finished but not claimed, so nothing is lost at midnight
    for (const m of S.daily.missions) if (!m.claimed && m.progress >= m.goal) { m.claimed = true; pay(m.reward); }
    if (!S.daily.bonus && S.daily.missions.every(x => x.claimed)) pay(DAILY_BONUS);
  }
  const h = hash('moon' + d), pool = DAILY.map((m, i) => i), picks = [];
  for (let k = 0; k < 3; k++) { const j = (h >>> (k * 5)) % pool.length; picks.push(pool.splice(j, 1)[0]); }
  S.daily = { date: d, bonus: false, missions: picks.map((mi, k) => {
    const m = DAILY[mi], goal = m.goals[(h >>> (k * 3 + 16)) % m.goals.length];
    return { kind: m.kind, goal, reward: m.reward(goal), progress: 0, claimed: false, done: false };
  }) };
  save(); return S.daily;
}
export const missions = () => ensureDaily().missions.map(m => Object.assign({}, m));
export function claimMission(i) {
  const D = ensureDaily(), m = D.missions[i]; if (!m || m.claimed || m.progress < m.goal) return 0;
  m.claimed = true; let got = pay(m.reward);
  if (!D.bonus && D.missions.every(x => x.claimed)) { D.bonus = true; got += pay(DAILY_BONUS); }
  checkBadges(); save(); return got;
}
export const missionsReady = () => ensureDaily().missions.filter(m => !m.claimed && m.progress >= m.goal).length;

// ---- badges ----
export function checkBadges() {
  const got = [];
  for (const b of BADGES) {
    if (b.tiered) {
      let k = S.tiers[b.id] || 0;
      while (k < 3 && (b.stat(S.stats) || 0) >= b.goals[k]) { pay(TIER_REWARD[k]); got.push({ id: b.id, tiered: true, tier: k, reward: TIER_REWARD[k] }); k++; }
      S.tiers[b.id] = k;
    } else if (!S.badges[b.id] && b.life(S.stats)) {
      S.badges[b.id] = today(); pay(b.reward);
      if (b.unlock && !S.owned.includes(b.unlock)) S.owned.push(b.unlock);
      got.push({ id: b.id, tiered: false, reward: b.reward, unlock: b.unlock || null });
    }
  }
  if (got.length) save();
  return got;
}
export function badgeList() {
  return BADGES.map(b => {
    if (b.tiered) {
      const k = S.tiers[b.id] || 0, i = Math.min(k, 2);
      return { id: b.id, tiered: true, tier: k, goal: b.goals[i], goals: b.goals.slice(), progress: b.stat(S.stats) || 0, reward: TIER_REWARD[i], done: k >= 3 };
    }
    return { id: b.id, tiered: false, tier: S.badges[b.id] ? 1 : 0, goal: 1, progress: S.badges[b.id] ? 1 : 0, reward: b.reward, done: !!S.badges[b.id], date: S.badges[b.id] || null, unlock: b.unlock || null };
  });
}

// ---- settling a leg ----
const num = v => Math.max(0, Math.floor(+v || 0));
function settle(run) {
  // add what the live track() calls missed (never count twice)
  const pairs = [['rocks', run.kills], ['coins', run.coins], ['meteorsDodged', run.meteors], ['supers', run.supers], ['hits', run.hits]];
  for (const [k, v] of pairs) { const miss = num(v) - (live[k] || 0); if (miss > 0) { live[k] = (live[k] || 0) + miss; bump(k, miss); } }
  // the one-leg mission
  const D = ensureDaily(), legKills = Math.max(num(run.kills), live.rocks || 0);
  D.missions.forEach((m, i) => { if (m.kind === 'runRocks') { m.progress = Math.min(m.goal, Math.max(m.progress, legKills)); checkDone(m, i); } });
  S.stats.runs += 1; S.stats.score += num(run.score);
}
function bestOf(jid, run) {
  const sc = num(run.score), nb = sc > (S.best[jid] || 0) && sc > 0;
  if (nb) S.best[jid] = sc;
  return { newBest: nb, best: S.best[jid] || 0 };
}
function finishMissions(noHit) {
  const D = ensureDaily();
  D.missions.forEach((m, i) => {
    if (m.kind === 'legs') { m.progress = Math.min(m.goal, m.progress + 1); checkDone(m, i); }
    if (m.kind === 'noHit' && noHit) { m.progress = Math.min(m.goal, m.progress + 1); checkDone(m, i); }
  });
}
// run = { score, kills, coins, hits, meteors, supers, noHit }
export function finishLeg(jid, li, run = {}) {
  const j = journeyIndex(jid);
  if (j < 0 || li < 0 || li > 2) return { reward: 0, bonus: 0, picked: 0, total: 0, journeyDone: false, unlocked: null, first: false, newBest: false, best: 0, badges: [], missions: [] };
  const done = legsDone(jid), first = li >= done;
  const reward = first ? legPay(j, li) : Math.round(legPay(j, li) * REPLAY_PAY);
  const journeyDone = first && li === 2;
  const bonus = journeyDone ? journeyBonus(j) : 0;
  const unlocked = journeyDone && JOURNEYS[j + 1] ? JOURNEYS[j + 1].id : null;
  const picked = Math.round(num(run.coins) * (suit().coinMult || 1));
  settle(run);
  if (first) S.prog[jid] = Math.max(done, li + 1);
  const noHit = !!run.noHit || (run.hits != null && num(run.hits) === 0);
  S.stats.legs += 1; if (noHit) S.stats.noHit += 1; if (li === 2) S.stats.planets += 1;
  finishMissions(noHit);
  pay(reward + bonus + picked);
  S.last = { jid, li };
  const b = bestOf(jid, run);
  live = {};
  const badges = checkBadges();
  const ms = takeDone();
  save();
  return { reward, bonus, picked, total: reward + bonus + picked, journeyDone, unlocked, first, newBest: b.newBest, best: b.best, badges, missions: ms };
}
export function failLeg(jid, li, run = {}) {
  const kept = Math.round(num(run.coins) * (suit().coinMult || 1));
  settle(run);
  S.stats.deaths += 1;
  pay(kept);
  if (journeyIndex(jid) >= 0) S.last = { jid, li };
  const b = journeyIndex(jid) >= 0 ? bestOf(jid, run) : { newBest: false, best: 0 };
  live = {};
  const badges = checkBadges();
  const ms = takeDone();
  save();
  return { kept, newBest: b.newBest, best: b.best, badges, missions: ms };
}

// ---- login gift ----
function loginStatus() {
  const d = today(), last = S.login.last;
  if (last === d) return { claimable: false, streak: S.login.streak };
  const streak = last && dayNo(d) - dayNo(last) === 1 ? S.login.streak + 1 : 1;
  return { claimable: true, streak };
}
export function login() {
  const st = loginStatus(), day = Math.min(Math.max(st.streak, 1), LOGIN.length);
  return { day, gift: LOGIN[day - 1], claimable: st.claimable, streak: st.streak };
}
export const loginReady = () => loginStatus().claimable;
export function claimLogin() {
  const st = login(); if (!st.claimable) return 0;
  S.login = { last: today(), streak: st.streak }; S.stats.streak = Math.max(S.stats.streak, st.streak);
  pay(st.gift); save(); return st.gift;
}
