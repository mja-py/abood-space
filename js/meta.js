// Progression for "Abood to the Moon": save data, in-game dirhams, the eight journeys (24 legs, ship-level gates, leg
// stars), Usta's hangar upgrades and boosters, Abood and his sister Mozah with their costumes and ship paints, the daily
// missions and the endless mission ladder, the rogue-ship duels, badges and the 7-day login gift.
// Everything lives in localStorage on this device. Dirhams are an in-game currency only: there are no real payments.
// Pure data + save: this module never touches the DOM, and it runs in node (no localStorage -> in-memory save).
//
// ---- exports ----
// data
//   JOURNEYS            [{ id, planet, from, need, theme:{ sky:[3], nebula:[3], dust, rock:[3], ice:[3], star },
//                          legs:[{ dur, speed, spawn, mix:{rockS,rockM,rockL,ice,crystal,panel,tank,drone,dish}, meteor:[minGap,maxGap],
//                                  firstMeteor, warn, mv, pair, hp, coin, pick, star }] }]      need = ship level gate
//   UPGRADES            [{ id, max, price:[...], tricks:[{ lv, id }] }]   (ids: blaster spread hull shield super engine magnet nabeeh)
//   USTA_ORDER          [33 upgrade ids]: Usta's recommended buying order (entry k = that upgrade's next level)
//   COSTUMES            [{ id, who:'b'|'g'|null, kind:'color'|'perk', price, src:{ type:'free'|'coins'|'badge'|'rival'|'ladder', id?, lv? },
//                          eff:{ hpPlus?, superStart?, botRate?, superDurPlus?, coinPlus?, repairMult?, magnetPlus?, vyMult?, followPlus?,
//                                crystalWeight?, crystalPlus?, dmgMult?, warnPlus?, comboWin? },
//                          fx:{ trail:[c1,c2,c3], particle, bolt, aura:null|{ col, r, a }, life, rings:null|{ col, a, n } },
//                          perk:'cp_<id>'|null, badge:<badge id>|undefined }]       (perk/badge kept for v1 callers)
//   SUITS               = COSTUMES (alias)
//   SKINS               [{ id, src:{ type:'free'|'rival'|'badge', id? } }]   ship paints (colours live in art.js)
//   RIVALS              the ten rogue robot ships (DESIGN-v2 §3.3, exact data)
//   BOOSTERS            [{ id:'shield', price:40 }, { id:'super', price:60 }, { id:'hull', price:80 }, { id:'coins', price:120 }]
//   CHARS ['abood','mozah'], GIRL_MISSIONS 10, SCHEMA 2
//   MULT_STEP 0.1, MULT_MAX 2.5, DAILY_BONUS 50, LOGIN [10,15,20,25,30,40,60], START_COINS 20
//   REPLAY_PAY 0.35, STAR_PAY 0.3, STAR_HULL 0.6, DUEL_STAR_HULL 0.5, DUEL_STAR_PAY 0.15,
//   REMATCH_FEE 0 (owner decision: rematches are free), REMATCH_PAY 0.35, DUEL_DAY_MULT 2, DUEL_GUN [1,1.6,2.1,2.5,2.8], BEAM_DUEL 0.10
//   DROPS               { coin:{kind:chance}, crystal:[min,max], crystalValue, pickup, pickWeights:{cell,rapid,repair,shield}, duel:{ per10, burst } }
//   BADGES              [{ id, tiered:true, goals:[b,s,g], stat } | { id, reward, life, unlock?:{ kind, id } }],  TIER_REWARD [20, 200, 2000]
//   MISSION_KINDS       every mission kind id (ladder and daily pools; 'runRocks' is the v1 daily kind, still understood)
//   legPay(j, li), journeyBonus(j), ladderReward(lv) = 50 + 25*lv
// save
//   save(), data() -> raw save object, resetSave(), today() -> 'YYYY-MM-DD'
//   settings() -> { muted, lang, picked, quality, fps } (a copy), setSetting(k, v)
//   seen(k) -> bool, markSeen(k)            one-off flags (story shown, help shown, tutorial...)
// money
//   coins(), addCoins(n) -> new total, spend(n) -> bool
//   legReward(jid, li) -> what finishing this leg pays now (full the first time, 35% on replays)
// characters and looks
//   char() -> 'abood'|'mozah', setChar(ch) -> bool (false if unknown or locked), girlOpen() -> bool, missionsDone() -> n
//   costume(ch = char()) -> COSTUMES entry, ownsCostume(id), costumeFits(id, ch = char()) -> bool
//   costumeState(id) -> { owned, wearing, fits, price, src, locked, progress:[have, need]|null, warn } (warn: Link while Nabeeh is lv 0)
//   buyCostume(id) -> { ok:true } | { ok:false, reason:'unknown'|'owned'|'locked'|'coins' }  (wears it if it fits)
//   wearCostume(id) -> bool, costumeOf(ch) -> costume id that character wears
//   suit() / ownsSuit(id) / buySuit(id) / wearSuit(id)   aliases of costume / ownsCostume / buyCostume / wearCostume
//   skin() -> id, ownsSkin(id), wearSkin(id) -> bool, skinState(id) -> { owned, wearing, src, locked }
//   ustaTip() -> perk costume id Usta suggests now (heat at ship level 12, pilot 17, link 23, hope 30) | null
// hangar
//   level(id) 0..max, nextPrice(id) -> number | null (maxed), canBuy(id) -> bool
//   buyUpgrade(id) -> { ok:true, level, price } | { ok:false, reason:'unknown'|'max'|'coins', price }
//   upValue(id, lv) -> numbers for that upgrade at level lv (what stats() would use, tricks included)
//   totalLevels() = shipLevel(), tier() 0..4, recommend() -> next USTA_ORDER id not reached yet | null
//   boosters() -> { shield, super, hull, coins } (stock), buyBooster(id) -> { ok, reason?:'unknown'|'coins' }
//   armed() -> ids[], setArmed(id, on) -> bool (false when the stock is 0), launchBoosters() -> { shield, super, hull, coins } (bools;
//            uses the armed ones up and clears the arming; remembered for settlement: coins adds +0.5 to the coin multiplier)
//   stats() -> { char, costume, suit, skin, fx, maxHp, dmg, fireRate, guns, pierce, regen, shieldCd, shieldBlast,
//                superGain, superDur, superPassive, superStart, follow, maxVy, nearMiss, magnet, pullPickups,
//                bot:{ lv, rate, every, dmg, vacuum, double, warn:true, warnPlus, intercept },
//                warnPlus, comboWin, repairMult, crystalWeight, crystalPlus, coinMult, duelBolt, beamDuel, tier }   (never boosters)
// progress
//   journeyIndex(jid), journey(jid), leg(jid, li), legsDone(jid) 0..3, planetsDone() 0..8, best(jid)
//   shipLevel(), journeyNeed(jid) -> { need, have, ok }, nextGate() -> { jid, need, have, left } | null (the journey waiting on a gate)
//   isUnlocked(jid) -> previous journey done && (shipLevel() >= need || legsDone(jid) >= 1), canPlay(jid, li)
//   nextPlayable() -> { jid, li }: the frontier leg; with no frontier, the playable leg after the last one flown (never the same leg)
//   legStars(jid, li) -> [b1, b2, b3], starTotal() 0..72, starsOf(jid) 0..9
// runs
//   startRun()  optional: call when a leg starts (resets the live counters; settlement also resets them)
//   finishLeg(jid, li, run) -> { reward, bonus, picked, total, journeyDone, unlocked, first, newBest, best, badges, missions,
//                                stars:[b,b,b], newStars:[i...], starPay, coinMult, levelUp:{ lv, reward, mult, unlock }|null, girl,
//                                gate:{ jid, need, have, left }|null, played:bool }    total = reward + bonus + picked + starPay
//   failLeg(jid, li, run)    -> { kept, newBest, best, badges, missions, coinMult, levelUp, girl }
//   abandonLeg(jid, li, run) | abandonLeg(run) -> same as failLeg but counts no death and no best score (quit / restart from
//                            pause, review G4: the picked coins are still paid)
//      run = { score, kills, coins, hits, meteors, supers, noHit, hpEnd, maxHp, comboMax, beamMax, crystals, chain, botKills, pickups }
// duels
//   duelsOpen() -> bool (Mars done), rival(id) -> RIVALS entry, rivalOpen(id) -> bool, duelDayFree() -> bool (today's ×2 unused)
//   rivalList() -> [{ id, i, open, beaten, stars:[b,b,b], wins, best, fee:0, firstReward, rematchReward, unlock:{ kind, id },
//                     diff, par, need, needDone, prevBeaten, dayBonus }]
//   duelDot() -> bool (an open unbeaten rival, or today's duel bonus unused)
//   duelEntry(rid) -> 0 (always free), startDuel(rid) -> { ok, fee:0, reason?:'unknown'|'locked' } (never charges)
//   finishDuel(rid, run) -> { win:true, first, reward, dayBonus, starPay, picked, total, stars, newStars, unlock:{ kind, id }|null,
//                             coinMult, badges, missions, levelUp, girl, best, newBest }
//   failDuel(rid, run)   -> { win:false, kept, coinMult, badges, missions, levelUp, girl }
//   abandonDuel(rid, run) | abandonDuel(run) -> like failDuel without counting a loss
//      duel run = { time, hits, hpEnd, maxHp, coins, supers, kills, chain, botKills, pickups, comboMax?, beamMax? }
// events, missions, badges, login
//   track(ev, n=1)   live counters: 'rocks'|'kill', 'coins'|'coin', 'meteor'|'dodge', 'super', 'crystal', 'junk', 'tank', 'pickup',
//                    'hit', 'chain', 'botKill'. Settlement-owned counters (legs, planets, runs, noHit, deaths, duel wins) are
//                    counted by the settlement functions only. It is safe to BOTH track() live and pass totals in `run`.
//   mult() -> ladder coin multiplier, nextMult(), skipPrice(), ensureLadder()
//   ladder() -> { lv, mult, nextMult, reward, skipPrice, missions:[{ kind, goal, progress, done }] }, skipLadder(i) -> bool
//   missions() -> [{ kind, goal, progress, reward, claimed, done }] x3 (today, reward already x dailyScale), claimMission(i) -> dirhams
//   dailyScale(), dailyBonus() -> today's all-three bonus, missionsReady() -> count, ensureDaily()
//   takeDone() -> missions finished since last asked [{ set:'daily'|'ladder', i, kind, goal, reward }]
//   badgeList() -> [{ id, tiered, tier, goal, goals?, progress, reward, done, date?, unlock? }], checkBadges() -> newly earned
//   login() -> { day 1..7, gift, booster:'shield'|null, claimable, streak, welcome }, claimLogin() -> dirhams (0 = already claimed)
//   loginReady() -> bool

const KEY = 'abood-moon-v1';
export const SCHEMA = 3;
const pad = n => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const dayNo = s => Math.round(new Date(s + 'T12:00:00').getTime() / 864e5);
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const r2 = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = v => (typeof v === 'number' && isFinite(v)) ? v : 0;

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
// 24 hand-set legs (DESIGN-v2 §4.3). Moon and Mars are relaxed; from Venus to Neptune the HP load grows ~8% a leg and
// the dodging (meteors, speed, shorter warnings) is what gets harder. `need` is the ship level (total upgrade levels)
// a journey asks for once the previous one is done; saves that already flew a leg of a journey keep it open.
const MIX0 = { rockS: 0, rockM: 0, rockL: 0, ice: 0, crystal: 0, panel: 0, tank: 0, drone: 0, dish: 0 };
const L = (o) => Object.assign({}, o, { mix: Object.assign({}, MIX0, o.mix) });
const LEGS = [
  // moon (need 0)
  { dur: 60, speed: 85, spawn: 0.95, mix: { rockS: 12, rockM: 2.5, crystal: 1.2, panel: 0.6 }, meteor: [24, 30], firstMeteor: 30, warn: 2, mv: 650, pair: 0, hp: 1, coin: 1.5, pick: 1.5, star: 750 },
  { dur: 62, speed: 90, spawn: 1, mix: { rockS: 10, rockM: 2.5, crystal: 1.2, panel: 2.5, tank: 1.6, dish: 0.8 }, meteor: [22, 28], firstMeteor: 26, warn: 1.9, mv: 680, pair: 0, hp: 1, coin: 1.5, pick: 1.5, star: 1250 },
  { dur: 64, speed: 95, spawn: 1.05, mix: { rockS: 11, rockM: 3, rockL: 0.4, crystal: 1.3, panel: 0.8, tank: 1.2, dish: 0.5 }, meteor: [20, 26], firstMeteor: 24, warn: 1.8, mv: 700, pair: 0, hp: 1, coin: 1.5, pick: 1.5, star: 1250 },
  // mars (need 0)
  { dur: 64, speed: 100, spawn: 1.1, mix: { rockS: 8, rockM: 4, rockL: 1, crystal: 1.3, panel: 1, tank: 1.2, drone: 0.8, dish: 0.8 }, meteor: [18, 24], firstMeteor: 22, warn: 1.75, mv: 740, pair: 0, hp: 1, coin: 1.35, pick: 1.35, star: 1750 },
  { dur: 65, speed: 104, spawn: 1.12, mix: { rockS: 8, rockM: 4, rockL: 1.2, crystal: 1.2, panel: 0.6, tank: 1, drone: 0.6, dish: 0.5 }, meteor: [13, 17], firstMeteor: 16, warn: 1.7, mv: 760, pair: 0, hp: 1, coin: 1.35, pick: 1.35, star: 2000 },
  { dur: 66, speed: 108, spawn: 1.18, mix: { rockS: 7, rockM: 5, rockL: 1.6, crystal: 1.4, panel: 0.4, tank: 1.2, drone: 1, dish: 0.6 }, meteor: [16, 22], firstMeteor: 20, warn: 1.65, mv: 780, pair: 0, hp: 1, coin: 1.35, pick: 1.35, star: 2250 },
  // venus (need 12)
  { dur: 66, speed: 116, spawn: 1.24, mix: { rockS: 6, rockM: 5, rockL: 2, crystal: 1, panel: 0.8, tank: 1.3, drone: 1, dish: 0.6 }, meteor: [11.9, 17], firstMeteor: 18, warn: 1.55, mv: 820, pair: 0, hp: 1.1, coin: 1.15, pick: 1.1, star: 2750 },
  { dur: 67, speed: 120, spawn: 1.28, mix: { rockS: 5, rockM: 5, rockL: 2.5, crystal: 1, panel: 0.4, tank: 1.3, drone: 1.2, dish: 0.8 }, meteor: [11.6, 16.6], firstMeteor: 18, warn: 1.52, mv: 831, pair: 0, hp: 1, coin: 1.1, pick: 1.1, star: 3000 },
  { dur: 68, speed: 124, spawn: 1.28, mix: { rockS: 4, rockM: 5, rockL: 3, crystal: 1.1, panel: 0.4, tank: 1.5, drone: 1.4, dish: 1 }, meteor: [11.2, 16.1], firstMeteor: 17, warn: 1.49, mv: 841, pair: 0, hp: 1, coin: 1.05, pick: 1.1, star: 3500 },
  // belt (need 15): big rocks and crystals, fewer meteors
  { dur: 68, speed: 129, spawn: 1.24, mix: { rockS: 4, rockM: 6, rockL: 3.5, crystal: 3, panel: 0.4, tank: 0.6, drone: 0.4 }, meteor: [15.9, 22.8], firstMeteor: 17, warn: 1.46, mv: 852, pair: 0, hp: 1, coin: 0.8, pick: 1, star: 3500 },
  { dur: 69, speed: 134, spawn: 1.17, mix: { rockS: 3, rockM: 6, rockL: 4.5, crystal: 3.5, tank: 0.7, drone: 0.5 }, meteor: [15.3, 22], firstMeteor: 16, warn: 1.43, mv: 862, pair: 0, hp: 1, coin: 0.75, pick: 1, star: 3750 },
  { dur: 70, speed: 140, spawn: 1.21, mix: { rockS: 3, rockM: 6, rockL: 5.5, crystal: 4, tank: 0.7, drone: 0.6, dish: 0.4 }, meteor: [14.7, 21.1], firstMeteor: 16, warn: 1.4, mv: 873, pair: 0, hp: 1, coin: 0.7, pick: 1, star: 4250 },
  // jupiter (need 18)
  { dur: 71, speed: 145, spawn: 1.54, mix: { rockS: 3, rockM: 4, rockL: 2.5, ice: 3, crystal: 1.2, panel: 0.6, tank: 1, drone: 1, dish: 0.8 }, meteor: [11.2, 16.1], firstMeteor: 15, warn: 1.37, mv: 884, pair: 0, hp: 1.05, coin: 0.75, pick: 1, star: 4500 },
  { dur: 72, speed: 151, spawn: 1.56, mix: { rockS: 2, rockM: 4, rockL: 3, ice: 4, crystal: 1.2, panel: 0.4, tank: 1, drone: 1.2, dish: 0.8 }, meteor: [10.7, 15.4], firstMeteor: 14, warn: 1.34, mv: 894, pair: 0, hp: 1, coin: 0.7, pick: 1, star: 5000 },
  { dur: 73, speed: 156, spawn: 1.62, mix: { rockS: 2, rockM: 4, rockL: 3.5, ice: 5, crystal: 1.4, tank: 1.2, drone: 1.2, dish: 1 }, meteor: [10.1, 14.6], firstMeteor: 14, warn: 1.31, mv: 905, pair: 0, hp: 1, coin: 0.65, pick: 1, star: 5500 },
  // saturn (need 21)
  { dur: 73, speed: 162, spawn: 1.72, mix: { rockS: 2, rockM: 3, rockL: 2, ice: 7, crystal: 1.4, panel: 1, tank: 1, drone: 1, dish: 1 }, meteor: [9.6, 13.8], firstMeteor: 13, warn: 1.29, mv: 915, pair: 0.04, hp: 1.15, coin: 0.6, pick: 1, star: 5250 },
  { dur: 74, speed: 168, spawn: 1.78, mix: { rockS: 1, rockM: 3, rockL: 2.5, ice: 8, crystal: 1.6, panel: 1, tank: 1.2, drone: 1.2, dish: 1 }, meteor: [9, 13], firstMeteor: 13, warn: 1.26, mv: 926, pair: 0.08, hp: 1.1, coin: 0.6, pick: 1, star: 6000 },
  { dur: 75, speed: 174, spawn: 1.85, mix: { rockS: 1, rockM: 3, rockL: 3, ice: 9, crystal: 1.8, panel: 0.6, tank: 1.2, drone: 1.4, dish: 1.2 }, meteor: [8.4, 12.2], firstMeteor: 12, warn: 1.23, mv: 936, pair: 0.11, hp: 1.1, coin: 0.55, pick: 1, star: 6500 },
  // uranus (need 24): fast
  { dur: 76, speed: 188, spawn: 1.91, mix: { rockS: 1, rockM: 2, rockL: 2, ice: 9, crystal: 1.4, panel: 0.6, tank: 1.2, drone: 1.4, dish: 1 }, meteor: [7.8, 11.4], firstMeteor: 11, warn: 1.2, mv: 947, pair: 0.14, hp: 1.2, coin: 0.55, pick: 1.05, star: 6500 },
  { dur: 77, speed: 194, spawn: 1.97, mix: { rockS: 1, rockM: 2, rockL: 2.5, ice: 10, crystal: 1.5, panel: 0.6, tank: 1.2, drone: 1.5, dish: 1 }, meteor: [7.2, 10.6], firstMeteor: 11, warn: 1.17, mv: 958, pair: 0.17, hp: 1.25, coin: 0.5, pick: 1.05, star: 7000 },
  { dur: 78, speed: 201, spawn: 2.04, mix: { rockS: 1, rockM: 2, rockL: 3, ice: 11, crystal: 1.6, panel: 0.5, tank: 1.3, drone: 1.6, dish: 1.2 }, meteor: [6.6, 9.8], firstMeteor: 10, warn: 1.14, mv: 968, pair: 0.2, hp: 1.25, coin: 0.5, pick: 1.05, star: 7500 },
  // neptune (need 27): the hardest
  { dur: 78, speed: 199, spawn: 2.11, mix: { rockS: 1, rockM: 2.5, rockL: 3, ice: 10, crystal: 1.5, panel: 0.6, tank: 1.4, drone: 1.6, dish: 1.2 }, meteor: [6, 8.9], firstMeteor: 9, warn: 1.11, mv: 979, pair: 0.24, hp: 1.3, coin: 0.5, pick: 1.1, star: 7750 },
  { dur: 79, speed: 206, spawn: 2.17, mix: { rockS: 1, rockM: 2.5, rockL: 3.5, ice: 11, crystal: 1.6, panel: 0.6, tank: 1.5, drone: 1.8, dish: 1.2 }, meteor: [5.4, 8.1], firstMeteor: 9, warn: 1.08, mv: 989, pair: 0.27, hp: 1.35, coin: 0.45, pick: 1.1, star: 8250 },
  { dur: 80, speed: 212, spawn: 2.24, mix: { rockS: 1, rockM: 3, rockL: 4, ice: 12, crystal: 1.8, panel: 0.6, tank: 1.6, drone: 2, dish: 1.4 }, meteor: [4.8, 7.2], firstMeteor: 8, warn: 1.05, mv: 1000, pair: 0.3, hp: 1.4, coin: 0.45, pick: 1.1, star: 8500 },
].map(L);
const legsOf = j => LEGS.slice(j * 3, j * 3 + 3);
const ICE = ['#bfe6f6', '#7fb2cc', '#f2fcff'];
export const JOURNEYS = [
  { id: 'moon', planet: 'moon', from: 'earth', need: 0,
    theme: { sky: ['#04061a', '#0c1236', '#1a2452'], nebula: ['#3b4fb8', '#6a3fa0', '#1f7a9a'], dust: '#9fb4ff', rock: ['#8a8178', '#5a524c', '#cbc1b4'], ice: ICE, star: '#ffffff' },
    legs: legsOf(0) },
  { id: 'mars', planet: 'mars', from: 'moon', need: 0,
    theme: { sky: ['#0a0510', '#260d1c', '#4a1a1c'], nebula: ['#c2442c', '#7a2a5a', '#e0803a'], dust: '#ffb08a', rock: ['#9a5a3c', '#62351f', '#d8946a'], ice: ICE, star: '#fff4ec' },
    legs: legsOf(1) },
  { id: 'venus', planet: 'venus', from: 'mars', need: 12,
    theme: { sky: ['#120806', '#3d1608', '#6e2d0c'], nebula: ['#ff8a2a', '#e0502a', '#ffd06a'], dust: '#ffd59a', rock: ['#8c6a4a', '#5a3e28', '#d6a46e'], ice: ICE, star: '#fff0d8' },
    legs: legsOf(2) },
  { id: 'belt', planet: 'belt', from: 'venus', need: 15,
    theme: { sky: ['#070612', '#151228', '#261d3a'], nebula: ['#7a5ac8', '#3fa0a0', '#c87a4a'], dust: '#d8c8a8', rock: ['#7d7064', '#4a4038', '#c2b29c'], ice: ICE, star: '#ffffff' },
    legs: legsOf(3) },
  { id: 'jupiter', planet: 'jupiter', from: 'belt', need: 18,
    theme: { sky: ['#0b0710', '#241626', '#40292a'], nebula: ['#d8955a', '#a85a3a', '#e8c89a'], dust: '#f2d6b0', rock: ['#86766a', '#54463c', '#c8b49e'], ice: ICE, star: '#fff8ee' },
    legs: legsOf(4) },
  { id: 'saturn', planet: 'saturn', from: 'jupiter', need: 21,
    theme: { sky: ['#0a0a14', '#1e1a2e', '#3a3248'], nebula: ['#e6c87a', '#9a7ac8', '#c8a06a'], dust: '#f6e6b8', rock: ['#9a9080', '#625a4e', '#d8ccb4'], ice: ICE, star: '#fffbe8' },
    legs: legsOf(5) },
  { id: 'uranus', planet: 'uranus', from: 'saturn', need: 24,
    theme: { sky: ['#03101a', '#082e3a', '#0f4a52'], nebula: ['#3fd6c8', '#3a8ad0', '#9af0e0'], dust: '#c8fff6', rock: ['#7a8a8e', '#4a5658', '#bfd4d6'], ice: ['#c8f4f0', '#82c2c0', '#f4fffe'], star: '#effffd' },
    legs: legsOf(6) },
  { id: 'neptune', planet: 'neptune', from: 'uranus', need: 27,
    theme: { sky: ['#020418', '#061640', '#0c2a6a'], nebula: ['#2a5ae0', '#4a2ab0', '#3ac0f0'], dust: '#a8c8ff', rock: ['#6e7890', '#40485e', '#b4c0d8'], ice: ['#b8d8ff', '#6f98d6', '#eef6ff'], star: '#eef4ff' },
    legs: legsOf(7) },
];
export const journeyIndex = jid => JOURNEYS.findIndex(j => j.id === jid);
export const journey = jid => JOURNEYS[journeyIndex(jid)] || null;
export const leg = (jid, li) => { const j = journey(jid); return (j && j.legs[li]) || null; };

// ---- v3: assist profiles ----
// Read by game.js every flight (legPlan().assist). Moon is for the youngest pilots: nothing can hurt the ship, bumps only
// wobble it, the boss cannot hurt. Mars heals itself and respawns in place. From Venus on the hull is real.
//   noDamage      hits only bump the ship (no hull loss, no fail)           bossHarmless  the boss's shots and rams only bump
//   regenShield   a shield that comes back after that many s without a hit  respawn       at 0 hull the ship respawns in place
//   bigHitbox     bolts hit objects this much further away                   hurtScale     the hull's own hitbox, × this
//   autoAim       bolts bend towards the nearest object                       speedScale    object and meteor speed, × this
//   warnPlus      added to every warning (meteors, lasers)                    bossAtk       boss attack intervals, × this
export const ASSIST = {
  moon: { noDamage: true, bigHitbox: 1.6, hurtScale: 0.6, autoAim: true, bossHarmless: true, speedScale: 0.85, warnPlus: 0.8, bossAtk: 1.6, label: 'toddler' },
  mars: { regenShield: 6, respawn: true, bigHitbox: 1.3, hurtScale: 0.8, speedScale: 0.95, warnPlus: 0.4, bossAtk: 1.25, label: 'kid' },
  venus: { bigHitbox: 1.15, warnPlus: 0.15, bossAtk: 1.1 },
  belt: { bigHitbox: 1.05 },
  jupiter: {},
  saturn: { warnPlus: -0.05 },
  uranus: { warnPlus: -0.1 },
  neptune: { warnPlus: -0.1 },
};
for (const j of JOURNEYS) j.assist = ASSIST[j.id] || {};

// Drops for game.js: chance that a destroyed thing drops one coin (× the leg's `coin`), crystal rocks drop 2..4 coins
// worth 2 each, the chance of a power-up (× the leg's `pick`) and its weights; in duels 3 coins per 10% of rival HP.
export const DROPS = {
  coin: { rockS: 0.10, rockM: 0.22, rockL: 0.40, ice: 0.15, crystal: 0, panel: 0.30, tank: 0.25, drone: 0.45, dish: 0.40 },
  crystal: [2, 4], crystalValue: 2, pickup: 0.05,
  pickWeights: { cell: 2, rapid: 2, repair: 2, shield: 1 },
  duel: { per10: 3, burst: 20 },
};

// ---- economy ----
// legPay: Moon 50/65/80 … Neptune 314/408/502; journeyBonus 300 … 3,493. The day-by-day plan (17 min a day) reaches
// Neptune in week 5 and buys everything (210,970 of upgrades + 40,500 of costumes) around day 68 (DESIGN-v2 §7).
export const REPLAY_PAY = 0.35;
export const START_COINS = 20;
export const STAR_PAY = 0.3, STAR_HULL = 0.6;
export const legPay = (j, li) => Math.round(50 * Math.pow(1.3, j) * (1 + 0.3 * li));
export const journeyBonus = j => Math.round(300 * Math.pow(1.42, j));

// ---- hangar upgrades (Usta) ----
export const UPGRADES = [
  { id: 'blaster', max: 5, price: [150, 700, 2800, 8000, 26000], tricks: [{ lv: 5, id: 'pierce' }] },
  { id: 'spread', max: 4, price: [300, 2000, 6500, 24000], tricks: [] },
  { id: 'hull', max: 5, price: [150, 800, 3000, 8000, 20000], tricks: [{ lv: 5, id: 'regen' }] },
  { id: 'shield', max: 4, price: [350, 2000, 6500, 18000], tricks: [{ lv: 4, id: 'shieldBlast' }] },
  { id: 'super', max: 4, price: [250, 1400, 5000, 15000], tricks: [] },
  { id: 'engine', max: 3, price: [150, 1200, 5000], tricks: [{ lv: 3, id: 'nearMiss' }] },
  { id: 'magnet', max: 3, price: [120, 1000, 4000], tricks: [{ lv: 3, id: 'pullPickups' }] },
  { id: 'nabeeh', max: 5, price: [200, 1400, 5000, 12000, 30000], tricks: [{ lv: 2, id: 'warn' }, { lv: 4, id: 'intercept' }, { lv: 5, id: 'double' }] },
];
export const USTA_ORDER = ['blaster', 'magnet', 'hull', 'engine', 'nabeeh', 'spread', 'super', 'shield', 'blaster', 'hull', 'spread',
  'nabeeh', 'magnet', 'engine', 'super', 'shield', 'blaster', 'spread', 'hull', 'nabeeh', 'super', 'magnet', 'blaster', 'nabeeh',
  'shield', 'hull', 'engine', 'spread', 'super', 'shield', 'hull', 'blaster', 'nabeeh'];
// numbers per level (index = level)
const FX = {
  blaster: { dmg: [1, 1.25, 1.5, 1.8, 2.15, 2.6], fireRate: [4, 4.5, 5, 5.6, 6.2, 7], pierce: [0, 0, 0, 0, 0, 1] },  // damage per bolt, bolts/s per gun
  spread: { guns: [1, 2, 3, 4, 5] },                                                       // bolts per volley (fan; converging in duels)
  hull: { maxHp: [3, 4, 5, 6, 7, 8], regen: [0, 0, 0, 0, 0, 30] },                        // regen: +1 hull after that many s without a hit
  shield: { shieldCd: [0, 18, 14, 10, 7], shieldBlast: [0, 0, 0, 0, 70] },                // seconds to recharge (0 = none); pop blast radius
  super: { superGain: [1, 1.2, 1.4, 1.6, 1.8], superDur: [2.2, 2.55, 2.9, 3.25, 3.6], superPassive: [0, 0.005, 0.008, 0.011, 0.015] },
  engine: { follow: [9, 12, 15, 19], maxVy: [520, 620, 720, 840], nearMiss: [0, 0, 0, 0.04] }, // nearMiss: super gained per close meteor dodge
  magnet: { magnet: [0, 80, 130, 190], pullPickups: [false, false, false, true] },         // coin pull radius
  nabeeh: { rate: [0, 0.7, 1, 1.3, 1.6, 2], dmg: [0, 1, 1.2, 1.5, 1.8, 2], vacuum: [0, 0, 0, 90, 110, 130],
    warnPlus: [0, 0, 0.15, 0.15, 0.15, 0.15], intercept: [false, false, false, false, true, true] },
};

// ---- characters, costumes, ship paints ----
export const CHARS = ['abood', 'mozah'];
export const GIRL_MISSIONS = 10;
const TRAIL0 = ['#ffb04a', '#ff8a2a', '#ffd27a'];
const fx = (trail, particle = 'flame', bolt = 'blaster', aura = null, more = {}) => Object.assign({ trail, particle, bolt, aura, life: 1, rings: null }, more);
const color = (id, who) => ({ id, who, kind: 'color', price: 0, src: { type: 'free' }, eff: {}, fx: fx(TRAIL0), perk: null });
const perk = (id, price, src, eff, f) => ({ id, who: null, kind: 'perk', price, src, eff, fx: f, perk: 'cp_' + id });
export const COSTUMES = [
  color('white', 'b'), color('blue', 'b'), color('sand', 'b'), color('teal', 'b'),
  color('lilac', 'g'), color('rose', 'g'), color('mint', 'g'), color('plum', 'g'),
  perk('heat', 2500, { type: 'coins' }, { hpPlus: 1 }, fx(['#ff5a2a', '#ff8a2a', '#ffd27a'], 'ember', 'ember')),
  perk('pilot', 4000, { type: 'coins' }, { superStart: 0.3 }, fx(['#ffe066', '#f2b630', '#fff3c4'], 'flame', 'gold')),
  perk('link', 10000, { type: 'coins' }, { botRate: 1.25 }, fx(['#5ef2ff', '#9ff0ff', '#ffffff'], 'spark', 'cyan', { col: '#5ef2ff', r: 40, a: 0.14 })),
  perk('hope', 24000, { type: 'coins' }, { superDurPlus: 0.4 }, fx(['#3ff2e0', '#ffd27a', '#fff6c2'], 'sparkle', 'gold', { col: '#3ff2e0', r: 44, a: 0.14 })),
  perk('gold', 0, { type: 'badge', id: 'saturn' }, { coinPlus: 0.2 }, fx(['#ffe066', '#ffd23f', '#fff3b0'], 'sparkle', 'gold', { col: '#ffd23f', r: 46, a: 0.18 })),
  perk('rover', 0, { type: 'rival', id: 'bubolt' }, { repairMult: 2 }, fx(['#7dff9a', '#3ccf7a', '#e8ffe8'], 'spark', 'blaster')),
  perk('magnet', 0, { type: 'rival', id: 'magna' }, { magnetPlus: 40 }, fx(['#7fb4ff', '#4aa8ff', '#e0f0ff'], 'spark', 'blaster', null, { rings: { col: '#7fb4ff', a: 0.12, n: 2 } })),
  perk('comet', 0, { type: 'rival', id: 'ghummaid' }, { vyMult: 1.15, followPlus: 3 }, fx(['#ffffff', '#bfeaff', '#7fd3ff'], 'comet', 'blaster', null, { life: 2 })),
  perk('crystal', 0, { type: 'rival', id: 'kabeer' }, { crystalWeight: 1.3, crystalPlus: 1 }, fx(['#b9a6ff', '#8a6cff', '#e6dcff'], 'crystal', 'violet')),
  perk('champ', 0, { type: 'rival', id: 'sifr' }, { dmgMult: 1.1 }, fx(['#ff5a4a', '#ffd23f', '#fff3c4'], 'spark', 'champ', { col: '#ffb347', r: 46, a: 0.14 })),
  perk('ice', 0, { type: 'ladder', lv: 10 }, { warnPlus: 0.3 }, fx(['#e8f8ff', '#bfeaff', '#ffffff'], 'snow', 'ice')),
  perk('star', 0, { type: 'badge', id: 'stars48' }, { comboWin: 1.5 }, fx(['#ffffff', '#fff3b0', '#ffe066'], 'star', 'star')),
];
for (const c of COSTUMES) if (c.src.type === 'badge') c.badge = c.src.id;   // v1 field
export const SUITS = COSTUMES;
const START_WEAR = { abood: 'white', mozah: 'lilac' };
const COLOR_IDS = COSTUMES.filter(c => c.kind === 'color').map(c => c.id);
export const SKINS = [
  { id: 'falak', src: { type: 'free' } },
  { id: 'patch', src: { type: 'rival', id: 'khurda' } },
  { id: 'hornet', src: { type: 'rival', id: 'zannana' } },
  { id: 'radar', src: { type: 'rival', id: 'radar' } },
  { id: 'whirl', src: { type: 'rival', id: 'dawwama' } },
  { id: 'anvil', src: { type: 'rival', id: 'sindan' } },
  { id: 'royal', src: { type: 'badge', id: 'tour' } },
];
// Usta's costume tips by ship level
const USTA_TIPS = [[30, 'hope'], [23, 'link'], [17, 'pilot'], [12, 'heat']];

// ---- boosters (one run each, bought in the hangar, armed over Launch) ----
export const BOOSTERS = [{ id: 'shield', price: 40 }, { id: 'super', price: 60 }, { id: 'hull', price: 80 }, { id: 'coins', price: 120 }];
const BOOST0 = () => ({ shield: 0, super: 0, hull: 0, coins: 0 });

// ---- duels: rogue robot ships built from space junk (DESIGN-v2 §3) ----
export const DUEL_STAR_HULL = 0.5, DUEL_STAR_PAY = 0.15;
export const REMATCH_FEE = 0, REMATCH_PAY = 0.35, DUEL_DAY_MULT = 2;
export const DUEL_GUN = [1, 1.6, 2.1, 2.5, 2.8];
export const BEAM_DUEL = 0.10;
export const RIVALS = [
  { id: 'khurda', need: 'mars', hp: 300, r: 34, coins: 300, unlock: ['skin', 'patch'], par: 50, diff: 1, theme: 'mars',
    move: { mode: 'sine', amp: 110, period: 6 },
    phases: [{ at: 1, atk: [{ k: 'aim', every: 1.6, v: 230 }] },
      { at: 0.5, atk: [{ k: 'fan', every: 2.2, v: 240, n: 3, arc: 0.35 }, { k: 'aim', every: 2.2, v: 230, first: 1.1 },
        { k: 'summon', every: 9, n: 2, kinds: ['rockS'] }] }] },
  { id: 'bubolt', need: 'mars', hp: 520, r: 34, coins: 450, unlock: ['costume', 'rover'], par: 60, diff: 1, theme: 'mars',
    move: { mode: 'track', v: 90, offset: 40 },
    phases: [{ at: 1, atk: [{ k: 'aim', every: 2.4, v: 260, n: 3 }] },
      { at: 0.6, atk: [{ k: 'aim', every: 2.4, v: 260, n: 3 }, { k: 'wall', every: 6, v: 170, gap: 90 }] },
      { at: 0.25, atk: [{ k: 'aim', every: 1.9, v: 260, n: 3 }, { k: 'wall', every: 6, v: 170, gap: 90 },
        { k: 'summon', every: 7, n: 1, kinds: ['drone'] }] }] },
  { id: 'zannana', need: 'venus', hp: 750, r: 24, coins: 700, unlock: ['skin', 'hornet'], par: 65, diff: 2, theme: 'venus',
    move: { mode: 'hop', every: 1.6, v: 300 },
    phases: [{ at: 1, atk: [{ k: 'aim', every: 0.9, v: 340, shot: 'dart' }] },
      { at: 0.5, atk: [{ k: 'aim', every: 1.1, v: 340, n: 2, gap: 0.12, shot: 'dart' }, { k: 'ram', every: 8, warn: 1.0, v: 700, back: 320 }] }] },
  { id: 'magna', need: 'belt', hp: 1000, r: 36, coins: 1000, unlock: ['costume', 'magnet'], par: 70, diff: 2, theme: 'belt',
    plates: { n: 3, hp: 6, r: 13, orbit: 58, w: 1.4, respawn: 7 }, move: { mode: 'sine', amp: 90, period: 7 },
    phases: [{ at: 1, atk: [{ k: 'fan', every: 2.6, v: 220, n: 5, arc: 0.6 }] },
      { at: 0.5, atk: [{ k: 'fan', every: 2.2, v: 220, n: 5, arc: 0.6 }, { k: 'aim', every: 1.8, v: 260 }, { k: 'pulse', every: 10, dur: 2 }] }] },
  { id: 'radar', need: 'jupiter', hp: 1250, r: 36, coins: 1400, unlock: ['skin', 'radar'], par: 70, diff: 3, theme: 'jupiter',
    move: { mode: 'hop', every: 3, v: 160 },
    phases: [{ at: 1, atk: [{ k: 'laser', every: 4.5, warn: 1.2, dur: 0.6 }, { k: 'aim', every: 1.5, v: 250 }] },
      { at: 0.55, atk: [{ k: 'laser', every: 4.2, warn: 1.2, dur: 0.6, n: 2, gap: 0.8 }, { k: 'aim', every: 1.3, v: 250 }] },
      { at: 0.25, atk: [{ k: 'lanes3', every: 5 }, { k: 'aim', every: 1.6, v: 250 }] }] },
  { id: 'ghummaid', need: 'saturn', hp: 1500, r: 30, coins: 1900, unlock: ['costume', 'comet'], par: 70, diff: 3, theme: 'saturn',
    move: { mode: 'blink', every: 3.2, tell: 0.5 },
    phases: [{ at: 1, atk: [{ k: 'fan', onBlink: true, v: 260, n: 3, arc: 0.4 }] },
      { at: 0.6, atk: [{ k: 'aim', onBlink: true, v: 300, n: 3, gap: 0.14 }, { k: 'mine', every: 7, v: 110, turn: 1.6, life: 6 }] },
      { at: 0.3, move: { mode: 'blink', every: 2.4, tell: 0.5, decoys: 1 },
        atk: [{ k: 'aim', onBlink: true, v: 300, n: 3, gap: 0.14 }, { k: 'mine', every: 7, v: 110, turn: 1.6, life: 6 }] }] },
  { id: 'dawwama', need: 'uranus', hp: 1800, r: 34, coins: 2500, unlock: ['skin', 'whirl'], par: 75, diff: 4, theme: 'uranus',
    move: { mode: 'sine', amp: 120, period: 8 },
    phases: [{ at: 1, atk: [{ k: 'spiral', on: 3, off: 2, rate: 0.22, step: 0.45, v: 200 }] },
      { at: 0.5, atk: [{ k: 'spiral', on: 3, off: 2.2, rate: 0.25, step: 0.45, arms: 2, v: 210 }, { k: 'aim', every: 2.6, v: 280 }] },
      { at: 0.2, atk: [{ k: 'spiral', on: 3, off: 2.2, rate: 0.25, step: 0.45, arms: 2, v: 210 }, { k: 'wall', every: 5, v: 180, gap: 100 }] }] },
  { id: 'kabeer', need: 'neptune', hp: 1900, r: 44, coins: 3200, unlock: ['costume', 'crystal'], par: 80, diff: 4, theme: 'belt', tankHurt: 0.06,
    move: { mode: 'sine', amp: 70, period: 10 },
    phases: [{ at: 1, atk: [{ k: 'summon', every: 4, n: 3, kinds: ['rockM', 'panel', 'dish'] }, { k: 'aim', every: 2, v: 240 }] },
      { at: 0.6, atk: [{ k: 'summon', every: 5, n: 2, kinds: ['rockM', 'panel'] }, { k: 'drones', every: 6, n: 2, v: 120, turn: 1.2, life: 7 },
        { k: 'fan', every: 3, v: 230, n: 5, arc: 0.7 }] },
      { at: 0.3, atk: [{ k: 'summon', every: 4, n: 3, kinds: ['rockM', 'tank', 'tank', 'panel'] }, { k: 'drones', every: 7, n: 2, v: 120, turn: 1.2, life: 7 },
        { k: 'fan', every: 3, v: 230, n: 5, arc: 0.7 }] }] },
  { id: 'sindan', need: 'neptune', hp: 2150, r: 40, coins: 4000, unlock: ['skin', 'anvil'], par: 80, diff: 5, theme: 'jupiter',
    shield: { hp: 0.12, regen: 9, stun: 2 }, move: { mode: 'track', v: 70, offset: 0 },
    phases: [{ at: 1, atk: [{ k: 'aim', every: 1.6, v: 220, shot: 'slug' }, { k: 'ram', every: 9, warn: 1.0, v: 650, back: 280 }] },
      { at: 0.6, atk: [{ k: 'aim', every: 1.4, v: 220, shot: 'slug' }, { k: 'wall', every: 5, v: 170, gap: 90 }, { k: 'ram', every: 11, v: 650, back: 280 }] },
      { at: 0.3, atk: [{ k: 'aim', every: 1.8, v: 220, shot: 'slug' }, { k: 'wall', every: 6, v: 170, gap: 90 }, { k: 'laser', every: 4, warn: 1.0, dur: 0.6 }] }] },
  { id: 'sifr', need: 'neptune', hp: 2850, r: 34, coins: 5000, unlock: ['costume', 'champ'], par: 75, diff: 5, theme: 'neptune',
    move: { mode: 'hop', every: 2.2, v: 260 },
    phases: [{ at: 1, atk: [{ k: 'aim', every: 1.5, v: 320, n: 3, gap: 0.12 }, { k: 'laser', every: 6, warn: 1.1, dur: 0.6 }] },
      { at: 0.7, move: { mode: 'blink', every: 4, tell: 0.5 },
        atk: [{ k: 'spiral', on: 2.5, off: 2, rate: 0.24, step: 0.5, arms: 2, v: 220 }, { k: 'mine', every: 8, v: 120, turn: 1.8, life: 6 }] },
      { at: 0.4, move: { mode: 'hop', every: 2.2, v: 260 }, shield: { hp: 0.08, regen: 10, stun: 1.5 },
        atk: [{ k: 'aim', every: 1.8, v: 320, n: 3, gap: 0.12 }, { k: 'wall', every: 5, v: 190, gap: 90 }, { k: 'ram', every: 10, v: 700, back: 320 }] }] },
];

// ---- v3: guardians (small bosses that end legs 1 and 2 of a journey) ----
// Same shape as RIVALS so game.js runs them with the duel machine; `art` is the rival body they borrow, `s` its scale.
const G = (id, art, s, hp, r, par, move, phases, more = {}) =>
  Object.assign({ id, art, s, hp, r, par, coins: 0, guardian: true, diff: 0, unlock: null, theme: null, move, phases }, more);
export const GUARDIANS = {
  moon: [
    G('g_moon_a', 'khurda', 0.7, 60, 24, 20, { mode: 'sine', amp: 70, period: 7 }, [{ at: 1, atk: [{ k: 'summon', every: 5, n: 1, kinds: ['rockS'] }] }]),
    G('g_moon_b', 'bubolt', 0.7, 85, 24, 22, { mode: 'sine', amp: 90, period: 6 }, [{ at: 1, atk: [{ k: 'aim', every: 3.2, v: 150 }, { k: 'summon', every: 6, n: 1, kinds: ['rockS'] }] }]),
  ],
  mars: [
    G('g_mars_a', 'khurda', 0.75, 150, 26, 24, { mode: 'sine', amp: 100, period: 6 }, [{ at: 1, atk: [{ k: 'aim', every: 2.6, v: 180 }] }, { at: 0.5, atk: [{ k: 'fan', every: 3, v: 180, n: 3, arc: 0.35 }] }]),
    G('g_mars_b', 'bubolt', 0.75, 190, 26, 25, { mode: 'track', v: 70, offset: 50 }, [{ at: 1, atk: [{ k: 'aim', every: 2.4, v: 200, n: 2 }] }, { at: 0.5, atk: [{ k: 'aim', every: 2.4, v: 200, n: 2 }, { k: 'summon', every: 7, n: 1, kinds: ['drone'] }] }]),
  ],
  venus: [
    G('g_venus_a', 'zannana', 0.8, 280, 20, 25, { mode: 'hop', every: 2.2, v: 220 }, [{ at: 1, atk: [{ k: 'aim', every: 1.4, v: 280, shot: 'dart' }] }, { at: 0.5, atk: [{ k: 'aim', every: 1.3, v: 280, shot: 'dart', n: 2, gap: 0.14 }] }]),
    G('g_venus_b', 'bubolt', 0.8, 340, 28, 26, { mode: 'track', v: 80, offset: 40 }, [{ at: 1, atk: [{ k: 'aim', every: 2.2, v: 240, n: 2 }] }, { at: 0.5, atk: [{ k: 'wall', every: 6, v: 160, gap: 110 }, { k: 'aim', every: 2.4, v: 240 }] }]),
  ],
  belt: [
    G('g_belt_a', 'magna', 0.8, 400, 30, 26, { mode: 'sine', amp: 90, period: 7 }, [{ at: 1, atk: [{ k: 'fan', every: 2.8, v: 210, n: 3, arc: 0.5 }] }, { at: 0.5, atk: [{ k: 'fan', every: 2.4, v: 210, n: 5, arc: 0.6 }] }], { plates: { n: 2, hp: 5, r: 13, orbit: 50, w: 1.4, respawn: 8 } }),
    G('g_belt_b', 'kabeer', 0.7, 460, 32, 28, { mode: 'sine', amp: 60, period: 9 }, [{ at: 1, atk: [{ k: 'summon', every: 4.5, n: 2, kinds: ['rockM', 'rockL'] }] }, { at: 0.5, atk: [{ k: 'summon', every: 4.5, n: 2, kinds: ['rockM', 'tank'] }, { k: 'aim', every: 2.2, v: 240 }] }]),
  ],
  jupiter: [
    G('g_jupiter_a', 'radar', 0.8, 520, 30, 28, { mode: 'hop', every: 3.2, v: 150 }, [{ at: 1, atk: [{ k: 'laser', every: 5, warn: 1.3, dur: 0.5 }] }, { at: 0.5, atk: [{ k: 'laser', every: 4.5, warn: 1.3, dur: 0.5 }, { k: 'aim', every: 1.8, v: 250 }] }]),
    G('g_jupiter_b', 'zannana', 0.9, 600, 22, 28, { mode: 'hop', every: 1.8, v: 280 }, [{ at: 1, atk: [{ k: 'aim', every: 1.1, v: 320, shot: 'dart' }] }, { at: 0.5, atk: [{ k: 'aim', every: 1.1, v: 320, shot: 'dart', n: 2, gap: 0.12 }, { k: 'ram', every: 9, warn: 1.1, v: 620, back: 300 }] }]),
  ],
  saturn: [
    G('g_saturn_a', 'ghummaid', 0.85, 640, 26, 28, { mode: 'blink', every: 3.4, tell: 0.55 }, [{ at: 1, atk: [{ k: 'fan', onBlink: true, v: 250, n: 3, arc: 0.4 }] }, { at: 0.5, atk: [{ k: 'fan', onBlink: true, v: 250, n: 3, arc: 0.4 }, { k: 'mine', every: 8, v: 100, turn: 1.5, life: 6 }] }]),
    G('g_saturn_b', 'magna', 0.9, 720, 32, 30, { mode: 'sine', amp: 100, period: 6 }, [{ at: 1, atk: [{ k: 'fan', every: 2.4, v: 230, n: 5, arc: 0.6 }] }, { at: 0.5, atk: [{ k: 'fan', every: 2.2, v: 230, n: 5, arc: 0.6 }, { k: 'aim', every: 1.8, v: 260 }, { k: 'pulse', every: 11, dur: 2 }] }], { plates: { n: 3, hp: 6, r: 13, orbit: 56, w: 1.4, respawn: 7 } }),
  ],
  uranus: [
    G('g_uranus_a', 'dawwama', 0.85, 780, 30, 30, { mode: 'sine', amp: 110, period: 8 }, [{ at: 1, atk: [{ k: 'spiral', on: 2.5, off: 2.2, rate: 0.26, step: 0.45, v: 190 }] }, { at: 0.5, atk: [{ k: 'spiral', on: 2.5, off: 2.2, rate: 0.26, step: 0.45, v: 190 }, { k: 'aim', every: 2.6, v: 280 }] }]),
    G('g_uranus_b', 'radar', 0.9, 860, 32, 30, { mode: 'hop', every: 2.8, v: 170 }, [{ at: 1, atk: [{ k: 'laser', every: 4.2, warn: 1.1, dur: 0.6 }, { k: 'aim', every: 1.6, v: 260 }] }, { at: 0.5, atk: [{ k: 'lanes3', every: 5.5 }, { k: 'aim', every: 1.8, v: 260 }] }]),
  ],
  neptune: [],   // Neptune's three legs end with Scrap King, Anvil and Zero
};
// v3.3: every boss fights its own way (js/bosses.js). Guardian A of a journey teaches that journey's signature in a lite
// form; guardian B keeps an earlier one alive. Scale = how much bigger the journey-end body is drawn.
export const BOSS_STYLE = {
  khurda: ['clam', 1.45], bubolt: ['bubble', 1.4], zannana: ['hornet', 1.4], magna: ['magnet', 1.3], radar: ['search', 1.4],
  ghummaid: ['hide', 1.4], dawwama: ['vortex', 1.25], kabeer: ['builder', 1.2], sindan: ['hammer', 1.35], sifr: [['vortex', 'hide', 'hammer'], 1.35],
};
const G_STYLE = { g_moon_a: 'clam', g_moon_b: 'bubble', g_mars_a: 'clam', g_mars_b: 'bubble', g_venus_a: 'hornet', g_venus_b: 'bubble',
  g_belt_a: 'magnet', g_belt_b: 'builder', g_jupiter_a: 'search', g_jupiter_b: 'hornet', g_saturn_a: 'hide', g_saturn_b: 'magnet',
  g_uranus_a: 'vortex', g_uranus_b: 'search' };
for (const k in GUARDIANS) for (const g of GUARDIANS[k]) { g.style = G_STYLE[g.id] || null; delete g.plates; }
export const styleOf = R => !R ? null : R.style || (BOSS_STYLE[R.id] || [])[0] || null;
export const styleScale = id => (BOSS_STYLE[id] || [])[1] || 1.3;
export function guardian(id) { for (const k in GUARDIANS) { const g = GUARDIANS[k].find(x => x.id === id); if (g) return g; } return null; }
export const boss = id => RIVALS.find(r => r.id === id) || guardian(id) || null;
// which boss ends a leg: leg 3 = the journey's rogue ship (Neptune: one per leg), legs 1-2 = a guardian
const BOSS_OF = { neptune: ['kabeer', 'sindan', 'sifr'] };
export function bossOf(jid, li) {
  const j = journeyIndex(jid); if (j < 0 || !(li >= 0 && li <= 2)) return null;
  const fixed = BOSS_OF[jid]; if (fixed) return { kind: 'rival', id: fixed[li] };
  if (li === 2) return { kind: 'rival', id: RIVALS[j].id };
  const g = (GUARDIANS[jid] || [])[li]; return g ? { kind: 'guardian', id: g.id } : null;
}

// ---- v3: leg plans (scripted timelines) ----
// A leg is no longer a timer with random spawns: legPlan(jid, li) builds a ~130 s timeline of beats (waves, showers,
// meteor windows, relief, set pieces, rescue pods, a WARNING and the boss) from the journey's flavour and the leg's
// tuning row in LEGS. The timer freezes while the boss is on screen; the leg ends when the boss is fixed.
//   beat kinds: filler {dur, rate, mix?}  shower {kind, n, over, lanes?}  meteors {dur, gap:[a,b], pair}  meteorsOff {dur}
//               relief {pick, n}  wave {form:'line'|'wall'|'squad'|'turrets'|'tether', n, gap}  event {ev, dur}  pods {n, over}
//               say {key}  warn {boss}  boss {id, scale, final}
// FLAV: what each leg introduces (intro kinds) and the set pieces its waves use.
const FLAV = {
  moon:    { intro: [['rockS'], ['tank'], ['rockL']], waveA: ['line', 'line', 'wall'], mid: ['scrapRain', 'wall', 'cascade'], waveB: ['line', 'wall', 'line'], twist: ['cascade', 'scrapRain', 'cascade'] },
  mars:    { intro: [['drone'], ['panel'], ['tank']], waveA: ['squad', 'wall', 'squad'], mid: ['cascade', 'scrapRain', 'tether'], waveB: ['wall', 'squad', 'wall'], twist: ['scrapRain', 'cascade', 'grabber'] },
  venus:   { intro: [['turret'], ['tank'], ['drone']], waveA: ['turrets', 'squad', 'wall'], mid: ['flare', 'tether', 'cascade'], waveB: ['squad', 'turrets', 'squad'], twist: ['grabber', 'flare', 'corridor'] },
  belt:    { intro: [['rockL'], ['crystal'], ['tank']], waveA: ['wall', 'cascade', 'wall'], mid: ['cascade', 'corridor', 'cascade'], waveB: ['squad', 'wall', 'turrets'], twist: ['corridor', 'cascade', 'grabber'] },
  jupiter: { intro: [['ice'], ['turret'], ['drone']], waveA: ['squad', 'turrets', 'tether'], mid: ['tether', 'flare', 'squad'], waveB: ['turrets', 'squad', 'wall'], twist: ['flare', 'grabber', 'corridor'] },
  saturn:  { intro: [['ice'], ['tank'], ['drone']], waveA: ['squad', 'wall', 'turrets'], mid: ['cascade', 'tether', 'grabber'], waveB: ['wall', 'squad', 'turrets'], twist: ['corridor', 'flare', 'cascade'] },
  uranus:  { intro: [['ice'], ['turret'], ['tank']], waveA: ['turrets', 'squad', 'wall'], mid: ['flare', 'corridor', 'tether'], waveB: ['squad', 'turrets', 'squad'], twist: ['grabber', 'cascade', 'flare'] },
  neptune: { intro: [['ice'], ['drone'], ['tank']], waveA: ['squad', 'turrets', 'wall'], mid: ['tether', 'grabber', 'corridor'], waveB: ['turrets', 'squad', 'squad'], twist: ['flare', 'cascade', 'corridor'] },
};
export const LEG_BASE = 130;         // seconds before the boss (+5 per leg index)
export const HARD = { hp: 1.35, speed: 1.15, warn: -0.2, pay: 2 };
const EVENTS = ['cascade', 'flare', 'corridor', 'grabber', 'scrapRain'];
function piece(name, t, j, li, D) {
  if (EVENTS.includes(name)) return [{ t, kind: 'event', ev: name, dur: name === 'scrapRain' ? 9 : name === 'corridor' ? 14 : name === 'flare' ? 8 : 6 }];
  if (name === 'line') return [{ t, kind: 'shower', kind2: 'rockS', n: 5 + j, over: 4, lanes: 5 }];
  if (name === 'wall') return [{ t, kind: 'wave', form: 'wall', n: 1 + Math.floor(j / 3), gap: 150 - j * 6 }];
  if (name === 'squad') return [{ t, kind: 'wave', form: 'squad', n: 4 + Math.min(3, Math.floor(j / 2)) }];
  if (name === 'turrets') return [{ t, kind: 'wave', form: 'turrets', n: j < 4 ? 1 : 2 }];
  if (name === 'tether') return [{ t, kind: 'wave', form: 'tether', n: 1 + Math.floor(j / 4) }];
  return [];
}
// ---- v3.1: rage robots and the difficulty curve ----
// Robots start at Venus. Each journey teaches ONE new attack (alone, in a teach beat on its first leg) and keeps every
// attack learned before, so the attack mix grows linearly: Venus 1 … Neptune 6.
export const ROBOT_ATTACKS = ['shot', 'dash', 'bomb', 'sweep', 'shield', 'swarm'];
// per journey (index = journey): attacks unlocked, attack tokens (robots allowed to attack at once), robot base HP (game.js
// adds a share of the ship's own firepower so an upgraded ship still meets robots that live long enough to attack), enemy shot
// speed, telegraph seconds, robot waves per leg, robots per wave, seconds to full rage, attack interval, robot life
const CV = (attacks, tokens, hp, shotV, tele, waves, n, rage, every, life) => ({ robots: attacks > 0, attacks, tokens, hp, shotV, tele, waves, n, rage, every, life });
export const CURVE = [
  CV(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),              // moon: no robots (toddlers)
  CV(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),              // mars
  CV(1, 2, 14, 190, 1.0, 2, 2, 11, 2.7, 15),     // venus: aimed shot
  CV(2, 2, 18, 205, 0.95, 3, 2, 10, 2.5, 15),    // belt: + charge dash
  CV(3, 3, 22, 220, 0.9, 3, 3, 9, 2.35, 16),     // jupiter: + area bomb
  CV(4, 3, 26, 235, 0.85, 4, 3, 8.5, 2.2, 16),   // saturn: + laser sweep
  CV(5, 4, 30, 250, 0.8, 4, 3, 8, 2.1, 17),      // uranus: + shield link
  CV(6, 4, 34, 265, 0.75, 5, 4, 7.5, 2.0, 17),   // neptune: + swarm
];
export const curve = j => CURVE[clamp(j | 0, 0, CURVE.length - 1)];
// leg modifiers (Jupiter on): one twist per leg, two on the Hard tier
export const MODS = ['ion', 'dark', 'magnet', 'wind'];
// replays draw their waves and set pieces from the journey's pool with a seed, so the same leg flies differently
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PLANS = {};
export function legPlan(jid, li, hard = false, seed = null) {
  const j = journeyIndex(jid); if (j < 0 || !(li >= 0 && li <= 2)) return null;
  const key = jid + ':' + li + (hard ? ':h' : '') + (seed != null ? ':' + seed : '');
  if (PLANS[key]) return PLANS[key];
  const J = JOURNEYS[j], L = J.legs[li], F0 = FLAV[jid] || FLAV.moon;
  let F = F0;
  if (seed != null) { // a replay: shuffle the journey's own pieces into the slots (never the same piece twice in a row)
    const R = rng(seed), any = a => a[Math.floor(R() * a.length)], waves = [...F0.waveA, ...F0.waveB], sets = [...F0.mid, ...F0.twist];
    const wA = any(waves); let wB = any(waves); for (let k = 0; k < 4 && wB === wA; k++) wB = any(waves);
    const sM = any(sets); let sT = any(sets); for (let k = 0; k < 4 && sT === sM; k++) sT = any(sets);
    F = Object.assign({}, F0, { waveA: [wA, wA, wA], waveB: [wB, wB, wB], mid: [sM, sM, sM], twist: [sT, sT, sT] });
  }
  const D = LEG_BASE + 5 * li, r = f => Math.round(f * D);
  const assist = hard ? {} : Object.assign({}, J.assist || {});
  const speedScale = (assist.speedScale || 1) * (hard ? HARD.speed : 1);
  const warnPlus = (assist.warnPlus || 0) + (hard ? HARD.warn : 0);
  const gapMul = li === 0 ? 1 : 0.9;
  const meteor = L.meteor ? [L.meteor[0] * gapMul, L.meteor[1] * gapMul] : null;
  const intro = {}; for (const k of F.intro[li] || ['rockS']) intro[k] = 1; intro.rockS = (intro.rockS || 0) + 0.6;
  const beats = [];
  // introduce: a calm start that shows the leg's new thing
  beats.push({ t: 1, kind: 'filler', dur: r(0.1) - 1, rate: 0.55, mix: intro });
  beats.push({ t: 0, kind: 'meteorsOff', dur: j === 0 ? r(0.34) : r(0.1) });
  // wave block A
  beats.push(...piece(F.waveA[li], r(0.1), j, li, D));
  beats.push({ t: r(0.1), kind: 'filler', dur: r(0.17), rate: 0.85 });
  beats.push({ t: r(0.15), kind: 'pods', n: 1, over: 1 });
  // relief
  beats.push({ t: r(0.27), kind: 'filler', dur: r(0.07), rate: 0 });
  beats.push({ t: r(0.27), kind: 'event', ev: 'scrapRain', dur: r(0.07) - 1 });
  // develop: mixed filler with a meteor window
  beats.push({ t: r(0.34), kind: 'filler', dur: r(0.21), rate: 1 });
  if (meteor) beats.push({ t: r(0.34), kind: 'meteors', dur: r(0.21), gap: [meteor[0] * 0.85, meteor[1] * 0.85], pair: L.pair || 0 });
  beats.push({ t: r(0.44), kind: 'pods', n: 1, over: 1 });
  // the middle set piece
  beats.push({ t: r(0.55), kind: 'filler', dur: r(0.13), rate: 0.35 });
  beats.push(...piece(F.mid[li], r(0.55) + 1, j, li, D));
  // wave block B
  beats.push({ t: r(0.68), kind: 'filler', dur: r(0.17), rate: 1.15 });
  beats.push(...piece(F.waveB[li], r(0.68) + 1, j, li, D));
  beats.push({ t: r(0.75), kind: 'pods', n: 1, over: 1 });
  // the twist
  beats.push({ t: r(0.85), kind: 'filler', dur: r(0.1), rate: 0.5 });
  beats.push(...piece(F.twist[li], r(0.85) + 1, j, li, D));
  // v3.1 rage robots (Venus on): a teach beat on the first leg, then waves that grow with the leg and the journey
  const C = curve(j);
  if (C.robots) {
    const newest = ROBOT_ATTACKS[C.attacks - 1];
    if (li === 0) { beats.push({ t: r(0.05), kind: 'wave', form: 'robots', n: 1, teach: newest }); beats.push({ t: r(0.05), kind: 'say', key: 'bot_teach_' + newest }); }
    const slots = [0.18, 0.4, 0.6, 0.75, 0.88].slice(0, Math.min(5, C.waves + li));
    for (const f of slots) beats.push({ t: r(f), kind: 'wave', form: 'robots', n: C.n + (li >= 2 ? 1 : 0) + (hard ? 1 : 0) });
  }
  // v3.3 supply drones: three per leg carry a weapon capsule (the only source of weapons now)
  for (const f of [0.22, 0.5, 0.8]) beats.push({ t: r(f), kind: 'carrier' });
  // calm, WARNING, boss
  beats.push({ t: r(0.95), kind: 'filler', dur: D, rate: 0 });
  beats.push({ t: r(0.95), kind: 'meteorsOff', dur: D });
  beats.push({ t: r(0.95) + 1, kind: 'relief', pick: 'repair', n: 1 });
  const B = bossOf(jid, li);
  if (B) {
    beats.push({ t: D - 4, kind: 'warn', boss: B.id });
    beats.push({ t: D - 0.5, kind: 'boss', id: B.id, kind2: B.kind, scale: hard ? HARD.hp : 1, final: true });
  }
  beats.sort((a, b) => a.t - b.t);
  const star = Math.round(L.star * (D / L.dur) * 1.15 / 50) * 50;
  const plan = { jid, li, hard: !!hard, dur: D, star, speedScale, warnPlus, assist, hpMul: (L.hp > 0 ? L.hp : 1) * (hard ? HARD.hp : 1),
    beats, rescueTotal: 3, boss: B, bossAtk: assist.bossAtk || 1, curve: curve(j), mods: [] };
  if (j >= 4) {
    const R = seed != null ? rng(seed ^ 0x9e37) : null, first = R ? MODS[Math.floor(R() * MODS.length)] : MODS[(j * 2 + li) % MODS.length];
    plan.mods.push(first);
    if (hard) plan.mods.push(MODS[(MODS.indexOf(first) + 1 + (li % 3)) % MODS.length]);
  }
  PLANS[key] = plan; return plan;
}

// ---- v3.1: real bosses — the journey-end rogue ships become big machines ----
// A rig sits on top of the rival: the rival body is the CORE (drawn `scale` times bigger), PARTS bolt on around it, each
// with its own HP (a share of the core's) and its own attack. Part kinds:
//   gun        fires from its own barrel: aim (n shots) or fan (n, arc)
//   arm        area damage: zone (n red circles round the ship, then a blast) or ring (an expanding ring with one gap)
//   hangar     launches minions (rage robots of the journey; rocks and drones on the Moon and Mars) and rebuilds guards
//   shieldGen  while it stands the core takes a quarter of the damage
// Guards are drones orbiting the core that block bolts; the hangar rebuilds them. At `advance` (core HP share) the boss
// moves into the arena, and below `desp` it fires everything faster. `j` is the journey the boss belongs to.
const PT = (kind, dx, dy, hp, atk) => ({ kind, at: [dx, dy], hp, atk });
export const BOSS_RIG = {
  khurda:   { j: 0, scale: 1.5, guards: 0, advance: 0.3, desp: 0.15, parts: [PT('hangar', 8, -64, 0.2, { every: 4.5, n: 2 })] },
  bubolt:   { j: 1, scale: 1.5, guards: 2, advance: 0.3, desp: 0.15, parts: [PT('gun', -18, -62, 0.18, { k: 'aim', every: 2.6, n: 2, v: 230 }), PT('hangar', -10, 64, 0.2, { every: 5, n: 1 })] },
  zannana:  { j: 2, scale: 1.9, guards: 2, advance: 0.35, desp: 0.15, parts: [PT('gun', -14, -60, 0.16, { k: 'fan', every: 2.6, n: 3, arc: 0.4, v: 250 }), PT('gun', -14, 60, 0.16, { k: 'aim', every: 2.2, n: 2, v: 260 }), PT('shieldGen', 44, 0, 0.18)] },
  magna:    { j: 3, scale: 1.5, guards: 0, advance: 0.35, desp: 0.15, parts: [PT('shieldGen', 52, 0, 0.16), PT('hangar', -4, 66, 0.18, { every: 6, n: 1 }), PT('arm', -4, -66, 0.18, { k: 'zone', every: 5, n: 2, r: 52 })] },
  radar:    { j: 4, scale: 1.5, guards: 2, advance: 0.35, desp: 0.15, parts: [PT('gun', -12, -64, 0.15, { k: 'aim', every: 2, n: 3, v: 270 }), PT('gun', -12, 64, 0.15, { k: 'fan', every: 2.6, n: 5, arc: 0.6, v: 240 }), PT('arm', 48, -34, 0.15, { k: 'zone', every: 5.5, n: 3, r: 50 }), PT('hangar', 48, 40, 0.16, { every: 6.5, n: 1 })] },
  ghummaid: { j: 5, scale: 1.6, guards: 3, advance: 0.35, desp: 0.15, parts: [PT('shieldGen', 46, 0, 0.15), PT('arm', -10, -60, 0.15, { k: 'ring', every: 6, w: 0.5, v: 200 }), PT('hangar', -10, 60, 0.15, { every: 6.5, n: 1 }), PT('gun', 30, -50, 0.13, { k: 'aim', every: 2.2, n: 3, v: 280 })] },
  dawwama:  { j: 6, scale: 1.55, guards: 3, advance: 0.4, desp: 0.15, parts: [PT('gun', -14, -64, 0.13, { k: 'fan', every: 2.4, n: 5, arc: 0.7, v: 240 }), PT('arm', -14, 64, 0.13, { k: 'ring', every: 6, w: 0.45, v: 220 }), PT('arm', 48, -40, 0.13, { k: 'zone', every: 5, n: 3, r: 52 }), PT('shieldGen', 52, 22, 0.14), PT('hangar', 30, 62, 0.14, { every: 7, n: 2 })] },
  kabeer:   { j: 7, scale: 1.4, guards: 2, advance: 0.4, desp: 0.15, parts: [PT('hangar', -10, -70, 0.14, { every: 6, n: 2 }), PT('hangar', -10, 70, 0.14, { every: 6, n: 2 }), PT('gun', 56, -36, 0.13, { k: 'aim', every: 2, n: 3, v: 280 }), PT('arm', 56, 36, 0.13, { k: 'zone', every: 5, n: 3, r: 54 })] },
  sindan:   { j: 7, scale: 1.45, guards: 3, advance: 0.4, desp: 0.15, parts: [PT('shieldGen', 56, 0, 0.13), PT('gun', -12, -66, 0.13, { k: 'fan', every: 2.4, n: 5, arc: 0.6, v: 250 }), PT('arm', -12, 66, 0.13, { k: 'ring', every: 5.5, w: 0.42, v: 230 }), PT('hangar', 40, 60, 0.13, { every: 7, n: 2 })] },
  sifr:     { j: 7, scale: 1.7, guards: 4, advance: 0.45, desp: 0.18, parts: [PT('shieldGen', 50, 0, 0.12), PT('gun', -14, -62, 0.12, { k: 'aim', every: 1.8, n: 3, v: 300 }), PT('gun', -14, 62, 0.12, { k: 'fan', every: 2.2, n: 5, arc: 0.7, v: 260 }), PT('arm', 40, -52, 0.12, { k: 'zone', every: 4.5, n: 4, r: 54 }), PT('hangar', 40, 52, 0.12, { every: 6.5, n: 2 })] },
};
export const rigOf = id => BOSS_RIG[id] || null;
// a rigged boss takes longer, so its third star (time) gets more room
export const parOf = R => R ? Math.round((R.par || 60) * (BOSS_RIG[R.id] ? 1.6 : 1)) : 60;

// ---- badges ----
// tiered: bronze -> silver -> gold, each a bigger goal with a bigger reward (golds land around days 55-75)
export const TIER_REWARD = [20, 200, 2000];
export const BADGES = [
  { id: 'first', reward: 10, life: s => s.runs >= 1 },                       // first flight
  { id: 'hangar', reward: 10, life: s => s.bought >= 1 },                    // first upgrade from Usta
  { id: 'moon', reward: 100, life: () => legsDone('moon') >= 3 },            // reach the Moon
  { id: 'mars', reward: 200, life: () => legsDone('mars') >= 3 },
  { id: 'duel1', reward: 150, life: () => RIVALS.some(r => beaten(r.id)) },  // first rogue ship fixed
  { id: 'saturn', reward: 500, life: () => legsDone('saturn') >= 3, unlock: { kind: 'costume', id: 'gold' } },
  { id: 'tour', reward: 2000, life: () => legsDone('neptune') >= 3, unlock: { kind: 'skin', id: 'royal' } }, // grand tour: Neptune
  { id: 'champion', reward: 3000, life: () => beaten('sifr') },              // Zero fixed
  { id: 'stars24', reward: 300, life: () => starTotal() >= 24 },
  { id: 'stars48', reward: 800, life: () => starTotal() >= 48, unlock: { kind: 'costume', id: 'star' } },
  { id: 'stars72', reward: 3000, life: () => starTotal() >= 72 },
  { id: 'mozah', reward: 50, life: s => s.mozahRuns >= 1 },                  // a flight as Mozah
  { id: 'rocks', tiered: true, goals: [300, 15000, 150000], stat: s => s.rocks },
  { id: 'meteors', tiered: true, goals: [20, 500, 2500], stat: s => s.meteorsDodged },
  { id: 'coins', tiered: true, goals: [200, 10000, 60000], stat: s => s.coins },
  { id: 'supers', tiered: true, goals: [10, 250, 1500], stat: s => s.supers },
  { id: 'legs', tiered: true, goals: [10, 150, 700], stat: s => s.legs },
  { id: 'planets', tiered: true, goals: [3, 40, 200], stat: s => s.planets },      // arrivals (replays of a 3rd leg count)
  { id: 'nohit', tiered: true, goals: [3, 40, 150], stat: s => s.noHit },          // legs finished without a hit
  { id: 'crystals', tiered: true, goals: [30, 600, 5000], stat: s => s.crystals }, // crystal rocks destroyed
  { id: 'chains', tiered: true, goals: [20, 500, 4000], stat: s => s.chain },      // things destroyed by fuel-tank blasts
  { id: 'duels', tiered: true, goals: [3, 15, 60], stat: s => s.duelWins },        // duel wins (rematches count)
  { id: 'ladder', tiered: true, goals: [5, 15, 30], stat: () => ladderLv() },      // mission ladder level reached
  { id: 'loyal', tiered: true, goals: [7, 30, 60], stat: s => s.streak },          // best login streak
];

// ---- missions: the daily three and the endless ladder (DESIGN-v2 §2) ----
// ev: a live counter that adds up; run: a one-run best (from the settled run); set: counted by settlement
const MK = {
  rocks: { ev: 'rocks', lad: n => Math.min(2500, 120 + 60 * n), daily: [60, 120, 200], pay: g => 28 + g * 0.15 },
  runKills: { run: 'kills', lad: n => Math.min(250, 30 + 5 * n), daily: [40, 70], pay: g => 20 + g * 0.5 },
  crystals: { ev: 'crystals', lad: n => Math.min(80, 4 + 2 * n), daily: [5, 10], pay: g => 25 + g * 2 },
  chain: { ev: 'chain', lad: n => Math.min(80, 3 + 2 * n), daily: [5, 10], pay: g => 25 + g * 2 },
  meteors: { ev: 'meteorsDodged', lad: n => Math.min(80, 4 + 2 * n), daily: [4, 8, 12], pay: g => 26 + g * 3 },
  supers: { ev: 'supers', lad: n => Math.min(30, 2 + n), daily: [2, 4, 6], pay: g => 26 + g * 5 },
  beamKills: { run: 'beamMax', lad: n => Math.min(30, 6 + n), daily: [8, 12], pay: g => 20 + g * 2 },
  coins: { ev: 'coins', lad: n => Math.min(1500, 80 + 40 * n), daily: [40, 80, 120], pay: g => 28 + g * 0.25 },
  runCoins: { run: 'coins', lad: n => Math.min(150, 25 + 4 * n), daily: [30, 50], pay: g => 20 + g * 0.6 },
  noHit: { set: true, lad: n => Math.min(4, 1 + Math.floor(n / 6)), daily: [1], pay: () => 60 },
  fullHull: { set: true, lad: n => Math.min(6, 1 + Math.floor(n / 4)), daily: [1, 2], pay: g => 35 + g * 10 },
  combo: { run: 'comboMax', lad: n => Math.min(60, 10 + 2 * n), daily: [15, 25], pay: g => 20 + g },
  legs: { set: true, lad: n => Math.min(12, 2 + Math.floor(n / 2)), daily: [1, 2, 3], pay: g => 25 + g * 10 },
  planet: { set: true, lad: n => Math.min(3, 1 + Math.floor(n / 8)), daily: [1], pay: () => 50 },
  pickups: { ev: 'pickups', lad: n => Math.min(15, 2 + Math.floor(n / 2)), daily: [2, 4], pay: g => 25 + g * 4 },
  botKills: { ev: 'botKills', lad: n => Math.min(400, 20 + 10 * n), daily: [30, 60], pay: g => 25 + g * 0.4, open: () => level('nabeeh') >= 1 },
  duelWin: { set: true, lad: n => Math.min(3, 1 + Math.floor(n / 8)), daily: [1], pay: () => 60, open: () => duelsOpen() },
  runRocks: { run: 'kills', legacy: true, daily: [30, 50], pay: g => 20 + g * 0.6 },   // v1 daily kind (kept for saved dailies)
};
export const MISSION_KINDS = Object.keys(MK);
const POOL = MISSION_KINDS.filter(k => !MK[k].legacy);
const kindOpen = k => !MK[k].open || MK[k].open();
export const MULT_STEP = 0.1, MULT_MAX = 2.5;
export const DAILY_BONUS = 50;
export const ladderReward = lv => 50 + 25 * lv;
export const LOGIN = [10, 15, 20, 25, 30, 40, 60];
const WELCOME_DAYS = 3;

// ---- the save ----
const STAT0 = () => ({ rocks: 0, meteorsDodged: 0, coins: 0, supers: 0, legs: 0, planets: 0, runs: 0, noHit: 0, deaths: 0,
  hits: 0, crystals: 0, junk: 0, tanks: 0, pickups: 0, score: 0, bought: 0, streak: 0, spent: 0, earned: 0,
  missions: 0, duelWins: 0, duelLosses: 0, chain: 0, botKills: 0, fullHull: 0, beamKills: 0, stars: 0, mozahRuns: 0,
  rescued: 0, bumps: 0, bossesFixed: 0, medals: 0 });
const fresh = () => ({
  v: SCHEMA, coins: START_COINS, up: {}, char: 'abood', wear: Object.assign({}, START_WEAR), owned: COLOR_IDS.slice(),
  skin: 'falak', skins: ['falak'], prog: {}, best: {}, stars: {}, medals: {}, hardOn: {}, stats: STAT0(), badges: {}, tiers: {},
  daily: null, ladder: null, duel: {}, duelDay: null, boost: BOOST0(), armed: [], away: null, welcome: null, girlSeen: false,
  login: { last: null, streak: 0 }, settings: { muted: false, lang: 'ar', picked: false, quality: null, fps: 60 }, seen: {}, last: null,
});
let S = fresh();
let live = {};          // what track() counted during the current run
let doneQ = [];         // missions finished since the game last asked
let runBoost = null;    // the boosters launchBoosters() used for the current run (read at settlement)

const MAPS = ['up', 'prog', 'best', 'badges', 'tiers', 'seen', 'stars', 'duel', 'wear', 'boost', 'medals', 'hardOn'];
function load() {
  let raw = null, d = null;
  try {
    raw = store.get(KEY);
    if (raw) { d = JSON.parse(raw); if (!isObj(d)) throw new Error('bad save'); }
  } catch (e) { // keep the unreadable save so progress can still be recovered by hand
    d = null; try { if (raw) store.set(KEY + '.bak', raw); } catch (e2) {}
  }
  S = fresh();
  if (d) {
    const v1 = !(+d.v >= 2);
    Object.assign(S, d);
    for (const k of ['stats', 'settings', 'login']) S[k] = Object.assign(fresh()[k], isObj(d[k]) ? d[k] : {});
    for (const k of MAPS) if (!isObj(S[k])) S[k] = k === 'wear' ? Object.assign({}, START_WEAR) : k === 'boost' ? BOOST0() : {};
    if (v1) migrateV1(d);
    if (!(+d.v >= 3)) migrateV2(d);
  }
  tidy();
}
// v2 -> v3: legs got medals (seeded from the finish star in tidy()) and the rogue ships moved into the journeys. A rival
// already beaten in the arena stays beaten, so the journey pays nothing twice. Nothing is removed.
function migrateV2(d) {
  S.medals = {}; S.hardOn = {};
  S.mig = { from: Math.max(1, +(d.v || 1)), date: today() };
}
// v1 -> v2: everything the player earned stays (coins, progress, upgrade levels, suits, badges, stats, today's missions).
// Nothing was removed, so nothing needs a refund: suits are kept (and get Mozah-ready), prices only change from now on.
function migrateV1(d) {
  S.char = 'abood';
  S.wear = { abood: typeof d.suit === 'string' ? d.suit : 'white', mozah: 'lilac' };
  delete S.suit;
  S.skin = 'falak'; S.skins = ['falak'];   // badge paints (tour -> royal) and costumes (saturn -> gold) are granted in tidy()
  S.ladder = null; S.stars = {}; S.duel = {}; S.duelDay = null;
  S.boost = BOOST0(); S.armed = []; S.away = null; S.welcome = null; S.girlSeen = false;
  // today's v1 daily keeps its progress; missions finished in it count toward Mozah
  if (isObj(d.daily) && Array.isArray(d.daily.missions)) { S.daily = d.daily; S.daily.v = 1; S.stats.missions = d.daily.missions.filter(m => m && m.done).length; }
  S.mig = { from: 1, date: today() };
}
function okMission(m) { return isObj(m) && MK[m.kind] && +m.goal > 0 && isFinite(+m.progress) && isFinite(+(m.reward ?? 0)); }
function tidy() {
  S.coins = Math.max(0, Math.floor(fin(+S.coins)));
  delete S.suit;   // v1 field, replaced by S.wear
  for (const k of Object.keys(S.stats)) { const v = +S.stats[k]; S.stats[k] = isFinite(v) ? Math.max(0, v) : 0; }
  for (const u of UPGRADES) S.up[u.id] = clamp(Math.floor(+S.up[u.id] || 0), 0, u.max);
  for (const k of Object.keys(S.up)) if (!upDef(k)) delete S.up[k];
  for (const k of Object.keys(S.prog)) if (journeyIndex(k) < 0) delete S.prog[k]; else S.prog[k] = clamp(Math.floor(+S.prog[k] || 0), 0, 3);
  for (const k of Object.keys(S.best)) if (journeyIndex(k) < 0) delete S.best[k]; else S.best[k] = Math.max(0, Math.floor(fin(+S.best[k])));
  // stars: known legs only, bits 1|2|4; a finished leg always has its first star
  const st = {};
  for (const j of JOURNEYS) for (let li = 0; li < 3; li++) {
    const k = j.id + ':' + li, b = (Math.floor(+S.stars[k] || 0) & 7) | (legsDone(j.id) > li ? 1 : 0);
    if (b) st[k] = b;
  }
  S.stars = st;
  // medals (v3): known legs only, bits 1 finish | 2 no damage | 4 every pod rescued | 8 score; a finished leg has its first medal
  const md = {};
  for (const j of JOURNEYS) for (let li = 0; li < 3; li++) {
    const k = j.id + ':' + li, b = (Math.floor(+S.medals[k] || 0) & 15) | (legsDone(j.id) > li ? 1 : 0);
    if (b) md[k] = b;
  }
  S.medals = md;
  const ho = {}; for (const k of Object.keys(S.hardOn)) if (journeyIndex(k) >= 0 && S.hardOn[k] && hardOpen(k)) ho[k] = true; S.hardOn = ho;
  S.stats.medals = medalTotal();
  // duels
  const du = {};
  for (const r of RIVALS) {
    const e = S.duel[r.id]; if (!isObj(e)) continue;
    const beatenOn = typeof e.beaten === 'string' ? e.beaten : null;
    du[r.id] = { beaten: beatenOn, wins: Math.max(0, Math.floor(fin(+e.wins))), stars: beatenOn ? (Math.floor(+e.stars || 0) & 7) | 1 : 0,
      best: +e.best > 0 ? r2(+e.best, 1) : null };
  }
  S.duel = du;
  if (typeof S.duelDay !== 'string') S.duelDay = null;
  // costumes and paints
  if (!Array.isArray(S.owned)) S.owned = [];
  S.owned = [...new Set(S.owned.filter(id => costumeDef(id)))];
  for (const id of COLOR_IDS) if (!S.owned.includes(id)) S.owned.push(id);
  if (!Array.isArray(S.skins)) S.skins = [];
  S.skins = [...new Set(S.skins.filter(id => skinDef(id)))];
  if (!S.skins.includes('falak')) S.skins.unshift('falak');
  // boosters
  const bo = BOOST0(); for (const b of BOOSTERS) bo[b.id] = Math.max(0, Math.floor(fin(+S.boost[b.id]))); S.boost = bo;
  S.armed = Array.isArray(S.armed) ? [...new Set(S.armed.filter(id => S.boost[id] > 0))] : [];
  // missions (M2: a broken daily or ladder never reaches missions()/track())
  const D = S.daily;
  if (!(isObj(D) && typeof D.date === 'string' && Array.isArray(D.missions) && D.missions.length === 3 && D.missions.every(okMission))) S.daily = null;
  else for (const m of D.missions) { m.goal = +m.goal; m.progress = clamp(+m.progress, 0, m.goal); m.reward = Math.max(0, Math.round(+(m.reward ?? 0))); m.claimed = !!m.claimed; m.done = !!m.done || m.progress >= m.goal; }
  const Lad = S.ladder;
  if (isObj(Lad) && +Lad.lv >= 1) {
    Lad.lv = Math.floor(+Lad.lv); Lad.skips = Math.max(0, Math.floor(fin(+Lad.skips)));
    if (!(Array.isArray(Lad.missions) && Lad.missions.length === 3 && Lad.missions.every(okMission))) Lad.missions = ladderSet(Lad.lv);
    else for (const m of Lad.missions) { m.goal = +m.goal; m.progress = clamp(+m.progress, 0, m.goal); m.done = !!m.done || m.progress >= m.goal; m.from = Math.max(0, Math.floor(fin(+m.from))); }
  } else S.ladder = null;
  // settings, login
  if (S.settings.lang !== 'ar' && S.settings.lang !== 'en') S.settings.lang = 'ar';
  if (!isObj(S.login) || (S.login.last != null && typeof S.login.last !== 'string')) S.login = { last: null, streak: 0 };
  S.login.streak = Math.max(0, Math.floor(fin(+S.login.streak)));
  if (!isObj(S.seen)) S.seen = {};
  if (S.last && !(isObj(S.last) && journeyIndex(S.last.jid) >= 0 && S.last.li >= 0 && S.last.li <= 2)) S.last = null;
  grantUnlocks();
  // character and what each one wears
  if (!CHARS.includes(S.char) || (S.char === 'mozah' && !girlOpen())) S.char = 'abood';
  const w = {}; for (const ch of CHARS) { const id = S.wear[ch]; w[ch] = ownsCostume(id) && costumeFits(id, ch) ? id : START_WEAR[ch]; } S.wear = w;
  if (!ownsSkin(S.skin)) S.skin = 'falak';
  S.girlSeen = !!S.girlSeen;
  // welcome-back gift: 3+ days since the game was last opened
  const t = today(), prev = typeof S.away === 'string' ? S.away : S.login.last;
  if (prev && dayNo(t) - dayNo(prev) >= WELCOME_DAYS) S.welcome = t;
  else if (S.welcome !== t) S.welcome = null;
  S.away = t;
  S.stats.stars = starTotal();
  S.v = SCHEMA;
}
// costumes / paints / badges earned elsewhere (badges, rivals, ladder) are owned; safe to call any time
function grantUnlocks() {
  const got = [];
  for (const b of BADGES) if (b.unlock && S.badges[b.id] && grant(b.unlock.kind, b.unlock.id)) got.push(b.unlock);
  for (const r of RIVALS) if (beaten(r.id) && grant(r.unlock[0], r.unlock[1])) got.push({ kind: r.unlock[0], id: r.unlock[1] });
  if (S.ladder && S.ladder.lv >= 10 && grant('costume', 'ice')) got.push({ kind: 'costume', id: 'ice' });
  return got;
}
function grant(kind, id) {
  const list = kind === 'skin' ? S.skins : S.owned;
  if (list.includes(id)) return false;
  list.push(id); return true;
}
export function save() { store.set(KEY, JSON.stringify(S)); }
export const data = () => S;
export function resetSave() { S = fresh(); live = {}; doneQ = []; runBoost = null; save(); }
export const settings = () => Object.assign({}, S.settings);
export function setSetting(k, v) { S.settings[k] = v; save(); }
export const seen = k => !!S.seen[k];
export function markSeen(k) { if (!S.seen[k]) { S.seen[k] = today(); save(); } }

// ---- money ----
export const coins = () => S.coins;
export function addCoins(n) { n = Math.round(+n || 0); if (n) { S.coins = Math.max(0, S.coins + n); if (n > 0) S.stats.earned += n; save(); } return S.coins; }
export function spend(n) { n = Math.round(+n); if (!(n >= 0) || S.coins < n) return false; S.coins -= n; S.stats.spent += n; save(); return true; }
const pay = n => { n = Math.max(0, Math.round(fin(n))); S.coins += n; S.stats.earned += n; return n; };
const charge = n => { S.coins -= n; S.stats.spent += n; };

// ---- upgrades ----
const upDef = id => UPGRADES.find(u => u.id === id);
export const level = id => S.up[id] || 0;
export const nextPrice = id => { const u = upDef(id); if (!u) return null; const k = level(id); return k >= u.max ? null : u.price[k]; };
export const canBuy = id => { const p = nextPrice(id); return p != null && S.coins >= p; };
export function buyUpgrade(id) {
  const u = upDef(id); if (!u) return { ok: false, reason: 'unknown', price: null };
  const k = level(id); if (k >= u.max) return { ok: false, reason: 'max', price: null };
  const price = u.price[k]; if (S.coins < price) return { ok: false, reason: 'coins', price };
  charge(price); S.up[id] = k + 1; S.stats.bought += 1;
  checkBadges(); save();
  return { ok: true, level: k + 1, price };
}
export function upValue(id, lv = level(id)) {
  const f = FX[id]; if (!f) return {};
  const o = {}; for (const k of Object.keys(f)) o[k] = f[k][clamp(lv, 0, f[k].length - 1)];
  if (id === 'nabeeh') { o.every = o.rate ? r2(1 / o.rate) : 0; o.double = lv >= 5; }
  return o;
}
export const totalLevels = () => UPGRADES.reduce((a, u) => a + level(u.id), 0);
export const shipLevel = totalLevels;
export const tier = () => Math.min(4, Math.floor(totalLevels() / 7));
// Usta's next recommendation: the first USTA_ORDER entry whose level is not reached yet
export function recommend() {
  const seenN = {};
  for (const id of USTA_ORDER) { seenN[id] = (seenN[id] || 0) + 1; if (level(id) < seenN[id]) return id; }
  const left = UPGRADES.filter(u => level(u.id) < u.max);
  return left.length ? left.sort((a, b) => nextPrice(a.id) - nextPrice(b.id))[0].id : null;
}

// ---- boosters ----
const boostDef = id => BOOSTERS.find(b => b.id === id);
export const boosters = () => Object.assign({}, S.boost);
export function buyBooster(id) {
  const b = boostDef(id); if (!b) return { ok: false, reason: 'unknown' };
  if (S.coins < b.price) return { ok: false, reason: 'coins' };
  charge(b.price); S.boost[id] += 1; save(); return { ok: true };
}
export const armed = () => S.armed.filter(id => S.boost[id] > 0);
export function setArmed(id, on) {
  if (!boostDef(id)) return false;
  if (on) { if (!(S.boost[id] > 0)) return false; if (!S.armed.includes(id)) S.armed.push(id); }
  else S.armed = S.armed.filter(x => x !== id);
  save(); return true;
}
export function launchBoosters() {
  const B = { shield: false, super: false, hull: false, coins: false };
  for (const id of armed()) { S.boost[id] -= 1; B[id] = true; }
  S.armed = []; runBoost = B; save();
  return Object.assign({}, B);
}

// ---- characters, costumes, paints ----
const costumeDef = id => COSTUMES.find(c => c.id === id) || null;
const skinDef = id => SKINS.find(s => s.id === id) || null;
export const missionsDone = () => S.stats.missions || 0;
export function girlOpen() { return missionsDone() >= GIRL_MISSIONS; }
export const char = () => S.char === 'mozah' && girlOpen() ? 'mozah' : 'abood';
export function setChar(ch) {
  if (!CHARS.includes(ch) || (ch === 'mozah' && !girlOpen())) return false;
  if (S.char !== ch) { S.char = ch; save(); }
  return true;
}
export const ownsCostume = id => !!costumeDef(id) && S.owned.includes(id);
export function costumeFits(id, ch = char()) {
  const c = costumeDef(id); if (!c) return false;
  return !c.who || (c.who === 'b' ? ch === 'abood' : ch === 'mozah');
}
export const costumeOf = (ch = char()) => (ownsCostume(S.wear[ch]) && costumeFits(S.wear[ch], ch)) ? S.wear[ch] : START_WEAR[ch] || 'white';
export const costume = (ch = char()) => costumeDef(costumeOf(ch));
function srcProgress(c) {
  const s = c.src;
  if (s.type === 'coins') return [Math.min(S.coins, c.price), c.price];
  if (s.type === 'ladder') return [Math.min(ladderLv(), s.lv), s.lv];
  if (s.type === 'badge') {
    if (s.id === 'saturn') return [legsDone('saturn'), 3];
    if (s.id === 'stars48') return [Math.min(starTotal(), 48), 48];
    if (s.id === 'tour') return [legsDone('neptune'), 3];
  }
  if (s.type === 'rival') return [beaten(s.id) ? 1 : 0, 1];
  return null;
}
export function costumeState(id) {
  const c = costumeDef(id); if (!c) return null;
  const owned = ownsCostume(id);
  return { owned, wearing: costumeOf() === id, fits: costumeFits(id), price: c.price, src: Object.assign({}, c.src),
    locked: !owned && c.src.type !== 'coins' && c.src.type !== 'free', progress: owned || c.kind === 'color' ? null : srcProgress(c),
    warn: id === 'link' && level('nabeeh') === 0 };   // warn: show cs_linkNote (the perk does nothing while Nabeeh is level 0)
}
export function buyCostume(id) {
  const c = costumeDef(id); if (!c) return { ok: false, reason: 'unknown' };
  if (ownsCostume(id)) return { ok: false, reason: 'owned' };
  if (c.src.type !== 'coins') return { ok: false, reason: 'locked' };
  if (S.coins < c.price) return { ok: false, reason: 'coins' };
  charge(c.price); S.stats.bought += 1; S.owned.push(id);
  if (costumeFits(id)) S.wear[char()] = id;
  checkBadges(); save(); return { ok: true };
}
export function wearCostume(id) {
  if (!ownsCostume(id) || !costumeFits(id)) return false;
  S.wear[char()] = id; save(); return true;
}
export const suit = () => costume();
export const ownsSuit = ownsCostume;
export const buySuit = buyCostume;
export const wearSuit = wearCostume;
export const skin = () => ownsSkin(S.skin) ? S.skin : 'falak';
export const ownsSkin = id => !!skinDef(id) && S.skins.includes(id);
export function wearSkin(id) { if (!ownsSkin(id)) return false; S.skin = id; save(); return true; }
export function skinState(id) {
  const s = skinDef(id); if (!s) return null;
  const owned = ownsSkin(id);
  return { owned, wearing: skin() === id, src: Object.assign({}, s.src), locked: !owned };
}
export function ustaTip() {
  const lv = shipLevel();
  for (const [need, id] of USTA_TIPS) if (lv >= need && !ownsCostume(id)) return id;
  return null;
}

// The ONLY source of combat numbers for game.js (boosters are not in here: game.js applies launchBoosters() itself).
export function stats() {
  const cs = costume(), e = cs.eff, b = upValue('blaster'), sp = upValue('super'), en = upValue('engine'), nb = upValue('nabeeh'),
    hu = upValue('hull'), sh = upValue('shield'), mg = upValue('magnet'), lv = level('nabeeh'), guns = upValue('spread').guns;
  const rate = r2(nb.rate * (e.botRate || 1));
  return {
    char: char(), costume: cs.id, suit: cs.id, skin: skin(),
    fx: { trail: cs.fx.trail.slice(), particle: cs.fx.particle, bolt: cs.fx.bolt, aura: cs.fx.aura ? Object.assign({}, cs.fx.aura) : null,
      life: cs.fx.life || 1, rings: cs.fx.rings ? Object.assign({}, cs.fx.rings) : null },
    maxHp: hu.maxHp + (e.hpPlus || 0),
    dmg: r2(b.dmg * (e.dmgMult || 1), 3), fireRate: b.fireRate, guns, pierce: b.pierce, regen: hu.regen,
    shieldCd: sh.shieldCd, shieldBlast: sh.shieldBlast,
    superGain: sp.superGain, superDur: r2(sp.superDur + (e.superDurPlus || 0)), superPassive: sp.superPassive, superStart: e.superStart || 0,
    follow: en.follow + (e.followPlus || 0), maxVy: Math.round(en.maxVy * (e.vyMult || 1)), nearMiss: en.nearMiss,
    magnet: mg.magnet + (e.magnetPlus || 0), pullPickups: mg.pullPickups,
    // Nabeeh: level 0 only floats and warns; 1+ fires `rate` shots/s (every `every` s) for `dmg`; 2+ warns earlier;
    // 3+ vacuums coins within `vacuum`; 4+ intercepts mines, drones and shots in duels; 5 fires two lasers at once.
    bot: { lv, rate, every: rate ? r2(1 / rate) : 0, dmg: nb.dmg, vacuum: nb.vacuum, double: nb.double, warn: true, warnPlus: nb.warnPlus, intercept: nb.intercept },
    warnPlus: e.warnPlus || 0, comboWin: e.comboWin || 1.2, repairMult: e.repairMult || 1,
    crystalWeight: e.crystalWeight || 1, crystalPlus: e.crystalPlus || 0,
    coinMult: r2(mult() + (e.coinPlus || 0)), duelBolt: r2(DUEL_GUN[guns - 1] / guns, 3), beamDuel: BEAM_DUEL,
    tier: tier(),
  };
}
const runCoinMult = () => r2(mult() + (costume().eff.coinPlus || 0) + (runBoost && runBoost.coins ? 0.5 : 0));

// ---- progress, gates, stars ----
export const legsDone = jid => S.prog[jid] || 0;
export function journeyNeed(jid) {
  const j = journey(jid), need = j ? j.need || 0 : 0, have = shipLevel();
  return { need, have, ok: have >= need };
}
export function isUnlocked(jid) {
  const j = journeyIndex(jid); if (j < 0) return false; if (j === 0) return true;
  return legsDone(JOURNEYS[j - 1].id) >= 3 && (shipLevel() >= (JOURNEYS[j].need || 0) || legsDone(jid) >= 1);
}
export const canPlay = (jid, li) => isUnlocked(jid) && li >= 0 && li < 3 && li <= legsDone(jid);
export const planetsDone = () => JOURNEYS.filter(j => legsDone(j.id) >= 3).length;
export function nextGate() {
  for (let j = 1; j < JOURNEYS.length; j++) {
    const J = JOURNEYS[j];
    if (legsDone(JOURNEYS[j - 1].id) >= 3 && !isUnlocked(J.id)) { const n = journeyNeed(J.id); return { jid: J.id, need: n.need, have: n.have, left: n.need - n.have }; }
  }
  return null;
}
// the frontier leg; with none (all done, or the next journey is waiting on a gate), the playable leg after the last
// one flown, so a "Next" button never replays the same leg (review U1)
export function nextPlayable() {
  for (const j of JOURNEYS) if (isUnlocked(j.id) && legsDone(j.id) < 3) return { jid: j.id, li: legsDone(j.id) };
  const all = [];
  for (const j of JOURNEYS) for (let li = 0; li < 3; li++) if (canPlay(j.id, li)) all.push({ jid: j.id, li });
  if (!all.length) return { jid: JOURNEYS[0].id, li: 0 };
  const k = S.last ? all.findIndex(x => x.jid === S.last.jid && x.li === S.last.li) : -1;
  return all[(k + 1) % all.length];
}
export const best = jid => S.best[jid] || 0;
export function legReward(jid, li) {
  const j = journeyIndex(jid); if (j < 0) return 0;
  const full = legPay(j, li); return li >= legsDone(jid) ? full : Math.round(full * REPLAY_PAY);
}
const bits = b => [!!(b & 1), !!(b & 2), !!(b & 4)];
const bits4 = b => [!!(b & 1), !!(b & 2), !!(b & 4), !!(b & 8)];
// v3 medals per leg: [finish, no damage, all pods rescued, score]; all 12 of a journey open its Hard tier
export function legMedals(jid, li) {
  if (journeyIndex(jid) < 0) return [false, false, false, false];
  return bits4((S.medals[jid + ':' + li] || 0) | (legsDone(jid) > li ? 1 : 0));
}
export const medalsOf = jid => [0, 1, 2].reduce((a, li) => a + legMedals(jid, li).filter(Boolean).length, 0);
export const medalTotal = () => JOURNEYS.reduce((a, j) => a + medalsOf(j.id), 0);
export const hardOpen = jid => journeyIndex(jid) >= 0 && medalsOf(jid) >= 12;
export const hardOn = jid => !!S.hardOn[jid] && hardOpen(jid);
export function setHard(jid, on) { if (journeyIndex(jid) < 0 || (on && !hardOpen(jid))) return false; if (on) S.hardOn[jid] = true; else delete S.hardOn[jid]; save(); return true; }
export function legStars(jid, li) {
  if (journeyIndex(jid) < 0) return [false, false, false];
  return bits((S.stars[jid + ':' + li] || 0) | (legsDone(jid) > li ? 1 : 0));
}
export const starsOf = jid => [0, 1, 2].reduce((a, li) => a + legStars(jid, li).filter(Boolean).length, 0);
export const starTotal = () => JOURNEYS.reduce((a, j) => a + starsOf(j.id), 0);

// ---- live counters, missions ----
const ALIAS = { kill: 'rocks', kills: 'rocks', rock: 'rocks', rocks: 'rocks', coin: 'coins', coins: 'coins',
  meteor: 'meteorsDodged', meteors: 'meteorsDodged', dodge: 'meteorsDodged', meteorsDodged: 'meteorsDodged',
  super: 'supers', supers: 'supers', crystal: 'crystals', crystals: 'crystals', junk: 'junk', tank: 'tanks', tanks: 'tanks',
  pickup: 'pickups', pickups: 'pickups', hit: 'hits', hits: 'hits', chain: 'chain', chains: 'chain', blast: 'chain',
  botKill: 'botKills', botKills: 'botKills', bot: 'botKills' };
export function startRun() { live = {}; }
const curRun = () => S.stats.runs + 1;
const ladderActive = m => curRun() >= (m.from || 0);
function eachMission(fn) {
  ensureDaily().missions.forEach((m, i) => fn(m, 'daily', i));
  ensureLadder().missions.forEach((m, i) => { if (ladderActive(m)) fn(m, 'ladder', i); });
}
function checkDone(m, set, i) {
  if (!m.done && m.progress >= m.goal) {
    m.done = true; S.stats.missions = (S.stats.missions || 0) + 1;
    doneQ.push({ set, i, kind: m.kind, goal: m.goal, reward: set === 'daily' ? m.reward : 0 });
  }
}
const addKind = (kind, n) => { if (n > 0) eachMission((m, set, i) => { if (m.kind === kind) { m.progress = Math.min(m.goal, m.progress + n); checkDone(m, set, i); } }); };
const bestKind = (kind, v) => { if (v > 0) eachMission((m, set, i) => { if (m.kind === kind) { m.progress = Math.min(m.goal, Math.max(m.progress, v)); checkDone(m, set, i); } }); };
const EV_KINDS = {}; for (const k of POOL) if (MK[k].ev) (EV_KINDS[MK[k].ev] = EV_KINDS[MK[k].ev] || []).push(k);
function bump(ev, n) {
  if (!n) return;
  S.stats[ev] = (S.stats[ev] || 0) + n;
  for (const k of EV_KINDS[ev] || []) addKind(k, n);
  if (ev === 'rocks') { bestKind('runKills', live.rocks || 0); bestKind('runRocks', live.rocks || 0); }
  if (ev === 'coins') bestKind('runCoins', live.coins || 0);
}
export const takeDone = () => { const q = doneQ; doneQ = []; return q; };
export function track(ev, n = 1) {
  const k = ALIAS[ev]; n = +n || 0; if (!k || n <= 0) return;
  live[k] = (live[k] || 0) + n;
  bump(k, n);
  save();
}
export const dailyScale = () => r2(1 + 0.2 * planetsDone());
export function ensureDaily() {
  const d = today();
  if (S.daily && S.daily.date === d) return S.daily;
  if (S.daily && Array.isArray(S.daily.missions)) { // a new day: pay what was finished but not claimed, so nothing is lost at midnight
    for (const m of S.daily.missions) if (!m.claimed && m.progress >= m.goal) { m.claimed = true; pay(m.reward); }
    if (!S.daily.bonus && S.daily.missions.every(x => x.claimed)) { S.daily.bonus = true; pay(S.daily.bonusPay ?? DAILY_BONUS); }
  }
  const h = hash('moon' + d), pool = POOL.filter(kindOpen), picks = [], sc = dailyScale();
  for (let k = 0; k < 3; k++) { const j = (h >>> (k * 5)) % pool.length; picks.push(pool.splice(j, 1)[0]); }
  S.daily = { v: 2, date: d, bonus: false, bonusPay: Math.round(DAILY_BONUS * sc), missions: picks.map((kind, k) => {
    const m = MK[kind], goal = m.daily[(h >>> (k * 3 + 16)) % m.daily.length];
    return { kind, goal, reward: Math.round(m.pay(goal) * sc), progress: 0, claimed: false, done: false };
  }) };
  save(); return S.daily;
}
export const dailyBonus = () => ensureDaily().bonusPay ?? DAILY_BONUS;
export const missions = () => ensureDaily().missions.map(m => Object.assign({}, m));
export function claimMission(i) {
  const D = ensureDaily(), m = D.missions[i]; if (!m || m.claimed || m.progress < m.goal) return 0;
  m.claimed = true; let got = pay(m.reward);
  if (!D.bonus && D.missions.every(x => x.claimed)) { D.bonus = true; got += pay(D.bonusPay ?? DAILY_BONUS); }
  checkBadges(); save(); return got;
}
export const missionsReady = () => ensureDaily().missions.filter(m => !m.claimed && m.progress >= m.goal).length;
// the ladder: endless sets of three; a full set raises the level (and the coin multiplier) when the run is settled
const ladderMission = (kind, lv) => ({ kind, goal: MK[kind].lad(lv), progress: 0, done: false, from: S.stats.runs + 1 });
function ladderSet(lv) {
  const h = hash('L' + lv), pool = POOL.filter(kindOpen), picks = [];
  for (let k = 0; k < 3; k++) picks.push(pool.splice((h >>> (k * 6)) % pool.length, 1)[0]);
  return picks.map(k => ladderMission(k, lv));
}
export function ensureLadder() { if (!S.ladder) { S.ladder = { lv: 1, skips: 0, missions: ladderSet(1) }; save(); } return S.ladder; }
const ladderLv = () => S.ladder ? S.ladder.lv : 1;
export const mult = () => Math.min(MULT_MAX, r2(1 + MULT_STEP * (ladderLv() - 1), 1));
export const nextMult = () => Math.min(MULT_MAX, r2(mult() + MULT_STEP, 1));
export const skipPrice = () => 30 + 15 * ensureLadder().lv;
export function ladder() {
  const Lr = ensureLadder();
  return { lv: Lr.lv, mult: mult(), nextMult: nextMult(), reward: ladderReward(Lr.lv), skipPrice: skipPrice(),
    missions: Lr.missions.map(m => ({ kind: m.kind, goal: m.goal, progress: m.progress, done: m.done })) };
}
export function skipLadder(i) {
  const Lr = ensureLadder(), m = Lr.missions[i]; if (!m || m.done) return false;
  const p = skipPrice(); if (S.coins < p) return false;
  const used = Lr.missions.map(x => x.kind), opts = POOL.filter(k => kindOpen(k) && !used.includes(k)); if (!opts.length) return false;
  charge(p); Lr.skips = (Lr.skips || 0) + 1;
  Lr.missions[i] = ladderMission(opts[hash('S' + Lr.lv + ':' + Lr.skips) % opts.length], Lr.lv);
  save(); return true;
}
function ladderUp() {
  const Lr = ensureLadder(); if (!Lr.missions.every(m => m.done)) return null;
  const reward = pay(ladderReward(Lr.lv)); Lr.lv += 1; Lr.missions = ladderSet(Lr.lv);
  const unlock = Lr.lv >= 10 && grant('costume', 'ice') ? { kind: 'costume', id: 'ice' } : null;
  return { lv: Lr.lv, reward, mult: mult(), unlock };
}

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
      if (b.unlock) grant(b.unlock.kind, b.unlock.id);
      got.push({ id: b.id, tiered: false, reward: b.reward, unlock: b.unlock ? Object.assign({}, b.unlock) : null });
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
    return { id: b.id, tiered: false, tier: S.badges[b.id] ? 1 : 0, goal: 1, progress: S.badges[b.id] ? 1 : 0, reward: b.reward, done: !!S.badges[b.id],
      date: S.badges[b.id] || null, unlock: b.unlock ? Object.assign({}, b.unlock) : null };
  });
}

// ---- settlement (legs and duels) ----
const num = v => Math.max(0, Math.floor(+v || 0));
// add what the live track() calls missed (never count twice), then the one-run missions
function settle(run) {
  const pairs = [['rocks', run.kills], ['coins', run.coins], ['meteorsDodged', run.meteors], ['supers', run.supers], ['hits', run.hits],
    ['crystals', run.crystals], ['chain', run.chain], ['botKills', run.botKills], ['pickups', run.pickups]];
  for (const [k, v] of pairs) { const miss = num(v) - (live[k] || 0); if (miss > 0) { live[k] = (live[k] || 0) + miss; bump(k, miss); } }
  const kills = Math.max(num(run.kills), live.rocks || 0);
  bestKind('runKills', kills); bestKind('runRocks', kills);
  bestKind('runCoins', Math.max(num(run.coins), live.coins || 0));
  bestKind('combo', num(run.comboMax));
  bestKind('beamKills', num(run.beamMax));
  S.stats.beamKills = Math.max(S.stats.beamKills || 0, num(run.beamMax));
  S.stats.score += num(run.score);
  if (char() === 'mozah') S.stats.mozahRuns = (S.stats.mozahRuns || 0) + 1;
}
// after the run-specific counting: the run is over (ladder level-up, badges, Mozah, missions done)
function close() {
  S.stats.runs += 1;
  const levelUp = ladderUp();
  S.stats.stars = starTotal();
  const badges = checkBadges();
  const girl = girlOpen() && !S.girlSeen; if (girl) S.girlSeen = true;
  live = {}; runBoost = null;
  const ms = takeDone();
  save();
  return { levelUp, badges, missions: ms, girl };
}
function bestOf(jid, run) {
  const sc = num(run.score), nb = sc > (S.best[jid] || 0) && sc > 0;
  if (nb) S.best[jid] = sc;
  return { newBest: nb, best: S.best[jid] || 0 };
}
const fullHullOf = run => +run.maxHp > 0 && +run.hpEnd >= +run.maxHp;
export function finishLeg(jid, li, run = {}) {
  const j = journeyIndex(jid), cm = runCoinMult();
  const none = { reward: 0, bonus: 0, picked: 0, total: 0, journeyDone: false, unlocked: null, first: false, newBest: false, best: 0, badges: [], missions: [],
    stars: [false, false, false], newStars: [], starPay: 0, coinMult: cm, levelUp: null, girl: false, gate: null, played: false };
  if (j < 0 || !(li >= 0 && li <= 2)) return none;
  if (!canPlay(jid, li)) { // review M1: a leg that is not playable pays only the picked coins, like a failed leg
    const f = endLike(run, false);
    return Object.assign(none, { picked: f.kept, total: f.kept, badges: f.badges, missions: f.missions, levelUp: f.levelUp, girl: f.girl, coinMult: f.coinMult });
  }
  const done = legsDone(jid), first = li >= done, hard = !!run.hard && hardOpen(jid);
  const plan = legPlan(jid, li, hard), starGoal = plan ? plan.star : JOURNEYS[j].legs[li].star;
  const reward = first ? legPay(j, li) : Math.round(legPay(j, li) * REPLAY_PAY * (hard ? HARD.pay : 1));
  const journeyDone = first && li === 2;
  const bonus = journeyDone ? journeyBonus(j) : 0;
  const picked = Math.round(num(run.coins) * cm);
  // stars: 1 finish, 2 hull >= 60% at the end, 3 score >= the leg's star score
  const key = jid + ':' + li, had = (S.stars[key] || 0) | (done > li ? 1 : 0);
  const now = 1 | (+run.maxHp > 0 && +run.hpEnd / +run.maxHp >= STAR_HULL ? 2 : 0) | (num(run.score) >= starGoal ? 4 : 0);
  const fresh3 = now & ~had, newStars = [0, 1, 2].filter(i => fresh3 & (1 << i));
  const starPay = newStars.filter(i => i > 0).length * Math.round(STAR_PAY * legPay(j, li));
  S.stars[key] = had | now;
  // medals (v3): 1 finish, 2 no damage at all (no hits, no bumps), 4 every rescue pod picked up, 8 score; new ones pay like stars
  const hadM = (S.medals[key] || 0) | (done > li ? 1 : 0);
  const noDmg = num(run.hits) === 0 && num(run.bumps) === 0, podsAll = +run.rescueTotal > 0 && num(run.rescued) >= +run.rescueTotal;
  const nowM = 1 | (noDmg ? 2 : 0) | (podsAll ? 4 : 0) | (num(run.score) >= starGoal ? 8 : 0);
  const freshM = nowM & ~hadM, newMedals = [0, 1, 2, 3].filter(i => freshM & (1 << i));
  const medalPay = newMedals.filter(i => i === 1 || i === 2).length * Math.round(STAR_PAY * legPay(j, li));
  S.medals[key] = hadM | nowM;
  S.stats.rescued += num(run.rescued); S.stats.bumps += num(run.bumps);
  // bosses fixed inside this leg (v3): a rogue ship counts as beaten in the arena too; its first win pays its prize once
  let bossReward = 0, bossUnlock = null; const bossFixed = [];
  for (const rid of Array.isArray(run.bossFixed) ? run.bossFixed : []) {
    const R = rival(rid); S.stats.bossesFixed += 1;
    if (!R) continue;
    bossFixed.push(rid);
    const d = duelRec(rid), firstB = !d.beaten, time = +run.bossTime > 0 ? +run.bossTime : 0;
    const nowB = 1 | (+run.maxHp > 0 && +run.hpEnd / +run.maxHp >= DUEL_STAR_HULL ? 2 : 0) | (time > 0 && time <= parOf(R) ? 4 : 0);
    S.duel[rid] = { beaten: d.beaten || today(), wins: d.wins + 1, stars: d.stars | nowB, best: time > 0 && (d.best == null || time < d.best) ? r2(time, 1) : d.best };
    S.stats.duelWins += 1; addKind('duelWin', 1);
    if (firstB) { grant(R.unlock[0], R.unlock[1]); bossUnlock = { kind: R.unlock[0], id: R.unlock[1] }; bossReward += R.coins; }
  }
  settle(run);
  if (first) S.prog[jid] = Math.max(done, li + 1);
  const noHit = !!run.noHit || (run.hits != null && num(run.hits) === 0), full = fullHullOf(run);
  S.stats.legs += 1; if (noHit) S.stats.noHit += 1; if (full) S.stats.fullHull += 1; if (li === 2) S.stats.planets += 1;
  addKind('legs', 1); if (noHit) addKind('noHit', 1); if (full) addKind('fullHull', 1); if (li === 2) addKind('planet', 1);
  pay(reward + bonus + picked + starPay + medalPay + bossReward);
  S.last = { jid, li };
  const b = bestOf(jid, run);
  const nx = JOURNEYS[j + 1];
  const unlocked = journeyDone && nx && isUnlocked(nx.id) ? nx.id : null;
  const gate = journeyDone && nx && !unlocked ? (n => ({ jid: nx.id, need: n.need, have: n.have, left: n.need - n.have }))(journeyNeed(nx.id)) : null;
  const c = close();
  return { reward, bonus, picked, total: reward + bonus + picked + starPay + medalPay + bossReward, journeyDone, unlocked, first, newBest: b.newBest, best: b.best,
    badges: c.badges, missions: c.missions, stars: bits(S.stars[key]), newStars, starPay, coinMult: cm, levelUp: c.levelUp, girl: c.girl, gate, played: true,
    medals: bits4(S.medals[key]), newMedals, medalPay, bossReward, bossUnlock, bossFixed, hard, hardOpen: hardOpen(jid), star: starGoal };

}
// a failed (or abandoned) leg: the picked coins are kept
function endLike(run, death, jid, li) {
  const cm = runCoinMult(), kept = Math.round(num(run.coins) * cm);
  settle(run);
  if (death) S.stats.deaths += 1;
  pay(kept);
  let b = { newBest: false, best: 0 };
  if (jid != null && journeyIndex(jid) >= 0) { if (li >= 0 && li <= 2) S.last = { jid, li }; b = bestOf(jid, run); }
  const c = close();
  return { kept, newBest: b.newBest, best: b.best, badges: c.badges, missions: c.missions, coinMult: cm, levelUp: c.levelUp, girl: c.girl };
}
export const failLeg = (jid, li, run = {}) => endLike(run, true, jid, li);
// quitting or restarting from pause (review G4): pays exactly what dying pays, without counting a death or a best score
export function abandonLeg(jid, li, run = {}) { if (isObj(jid)) run = jid; return endLike(run || {}, false); }   // also abandonLeg(run)

// ---- duels ----
export const duelsOpen = () => legsDone('mars') >= 3;
export const rival = id => RIVALS.find(r => r.id === id) || null;
const rivalIdx = id => RIVALS.findIndex(r => r.id === id);
const duelRec = id => S.duel[id] || { beaten: null, wins: 0, stars: 0, best: null };
function beaten(id) { return !!(S.duel[id] && S.duel[id].beaten); }
export function rivalOpen(id) {
  const i = rivalIdx(id); if (i < 0 || !duelsOpen()) return false;
  if (beaten(id)) return true;
  return legsDone(RIVALS[i].need) >= 3 && (i === 0 || beaten(RIVALS[i - 1].id));
}
export const duelDayFree = () => S.duelDay !== today();
export function rivalList() {
  return RIVALS.map((r, i) => {
    const d = duelRec(r.id);
    return { id: r.id, i, open: rivalOpen(r.id), beaten: !!d.beaten, stars: bits(d.stars), wins: d.wins, best: d.best, fee: 0,
      firstReward: r.coins, rematchReward: Math.round(REMATCH_PAY * r.coins), unlock: { kind: r.unlock[0], id: r.unlock[1] },
      diff: r.diff, par: parOf(r), need: r.need, needDone: legsDone(r.need) >= 3, prevBeaten: i === 0 || beaten(RIVALS[i - 1].id), dayBonus: duelDayFree() };
  });
}
export const duelDot = () => duelsOpen() && (duelDayFree() || RIVALS.some(r => rivalOpen(r.id) && !beaten(r.id)));
export const duelEntry = () => 0;   // owner decision: rematches are free
export function startDuel(rid) {
  if (!rival(rid)) return { ok: false, fee: 0, reason: 'unknown' };
  if (!rivalOpen(rid)) return { ok: false, fee: 0, reason: 'locked' };
  live = {};
  return { ok: true, fee: 0 };
}
export function finishDuel(rid, run = {}) {
  const R = rival(rid), cm = runCoinMult();
  if (!R || !rivalOpen(rid)) { // not playable: only the picked coins (as a lost duel)
    const f = duelEnd(run, false);
    return { win: true, first: false, reward: 0, dayBonus: 0, starPay: 0, picked: f.kept, total: f.kept, stars: [false, false, false], newStars: [],
      unlock: null, coinMult: f.coinMult, badges: f.badges, missions: f.missions, levelUp: f.levelUp, girl: f.girl, best: null, newBest: false };
  }
  const d = duelRec(rid), first = !d.beaten;
  const reward = first ? R.coins : Math.round(R.coins * REMATCH_PAY);
  const dayBonus = duelDayFree() ? reward * (DUEL_DAY_MULT - 1) : 0;
  if (dayBonus) S.duelDay = today();
  const time = +run.time;
  const now = 1 | (+run.maxHp > 0 && +run.hpEnd / +run.maxHp >= DUEL_STAR_HULL ? 2 : 0) | (time > 0 && time <= parOf(R) ? 4 : 0);
  const fresh3 = now & ~d.stars, newStars = [0, 1, 2].filter(i => fresh3 & (1 << i));
  const starPay = newStars.length * Math.round(DUEL_STAR_PAY * R.coins);
  const picked = Math.round(num(run.coins) * cm);
  const newBest = time > 0 && (d.best == null || time < d.best);
  S.duel[rid] = { beaten: d.beaten || today(), wins: d.wins + 1, stars: d.stars | now, best: newBest ? r2(time, 1) : d.best };
  settle(run);
  S.stats.duelWins += 1; addKind('duelWin', 1);
  let unlock = null;
  if (first) { grant(R.unlock[0], R.unlock[1]); unlock = { kind: R.unlock[0], id: R.unlock[1] }; }
  pay(reward + dayBonus + starPay + picked);
  const c = close();
  return { win: true, first, reward, dayBonus, starPay, picked, total: reward + dayBonus + starPay + picked, stars: bits(S.duel[rid].stars), newStars,
    unlock, coinMult: cm, badges: c.badges, missions: c.missions, levelUp: c.levelUp, girl: c.girl, best: S.duel[rid].best, newBest };
}
function duelEnd(run, loss) {
  const cm = runCoinMult(), kept = Math.round(num(run.coins) * cm);
  settle(run);
  if (loss) S.stats.duelLosses += 1;
  pay(kept);
  const c = close();
  return { win: false, kept, coinMult: cm, badges: c.badges, missions: c.missions, levelUp: c.levelUp, girl: c.girl };
}
export const failDuel = (rid, run = {}) => duelEnd(run, true);
export const abandonDuel = (rid, run = {}) => duelEnd(isObj(rid) ? rid : run || {}, false);   // also abandonDuel(run)

// ---- login gift ----
function loginStatus() {
  const d = today(), last = S.login.last;
  if (last === d) return { claimable: false, streak: S.login.streak };
  const streak = last && dayNo(d) - dayNo(last) === 1 ? S.login.streak + 1 : 1;
  return { claimable: true, streak };
}
export function login() {
  const st = loginStatus(), day = Math.min(Math.max(st.streak, 1), LOGIN.length);
  return { day, gift: LOGIN[day - 1], booster: day >= 7 ? 'shield' : null, claimable: st.claimable, streak: st.streak,
    welcome: st.claimable && S.welcome === today() };
}
export const loginReady = () => loginStatus().claimable;
export function claimLogin() {
  const st = login(); if (!st.claimable) return 0;
  S.login = { last: today(), streak: st.streak }; S.stats.streak = Math.max(S.stats.streak, st.streak);
  pay(st.gift);
  if (st.booster) S.boost[st.booster] += 1;
  if (st.welcome) { S.boost.super += 1; S.welcome = null; }
  S.away = today();
  checkBadges(); save(); return st.gift;
}

load();
save();
