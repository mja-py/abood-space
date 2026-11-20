# عبود إلى القمر · Abood to the Moon (v3 · Abood Space)

Sister game to **Run, Abood!**. Abood is grown up now, the youngest astronaut on **Falak Station**, a satellite
station in orbit around Earth. He lives there with his smart AI robot **Nabeeh**, and the hangar robot **Usta**
builds and upgrades his ship. His dream is to fly to the Moon, and then to every planet.

It is a horizontal space shooter in landscape. Arabic is the default language; the flag buttons switch to English.
There are no aliens: the only things in space are rocks, junk left behind in orbit, and sudden meteors.

**Play:** https://mja-py.github.io/abood-space/ (v3) · the original v2 game: https://mja-py.github.io/abood-to-the-moon/

![Falak Station menu](screenshots/station-menu.png)
![The Amal Beam](screenshots/super-beam.png)

## How to play
- **Move:** drag anywhere on the screen (or the arrows / W A S D). The ship flies up, down, forward and back inside the
  left 40% of the screen.
- **Fire:** automatic. **Graze:** an enemy shot that skims past without touching you charges the beam.
- **Super (the Amal Beam):** the big round button at the bottom right (or Space / X) when its ring is full.
- **Meteors:** a red dashed line and a "!" warn you first, then the meteor charges. Get out of the line.
- **Pause:** II, or P / Esc.

## Fighting (v3.1)
- **Rage robots** appear from Venus on. Each journey teaches one new move on its first leg, alone, while Nabeeh
  explains it, then mixes it with every move learned before. Venus has 1 kind of attack, Neptune has all 6:

  | Journey | New move | Tell |
  |---|---|---|
  | Venus | aimed shot | glowing barrel |
  | Asteroid Belt | charge dash | orange arrows along its lane |
  | Jupiter | area bomb | a red circle where it will land |
  | Saturn | laser sweep | two thin lines: where it starts and ends |
  | Uranus | shield link | a blue cable to a friend (shoot the shielder first) |
  | Neptune | swarm | three homing mini drones |

  Robots fill a rage meter from time and from hits; when it is full they turn red, move faster and attack more often.
  Only a few robots may attack at once (2 at Venus, 4 at Neptune), so it stays readable.
- **Real bosses (v3.3):** every boss fights its own way (`js/bosses.js`). The two guardians of a journey teach a lighter
  version first (guardian A: this journey's trick, guardian B: an earlier one), a title card names the boss, and Nabeeh
  says the trick when the fight starts:

  | Boss | Trick | How to beat it |
  |---|---|---|
  | Moon · Scrappy | a clam shell that shuts | wait until it opens, hit the glowing core; shoot the grey scrap it spits |
  | Mars · Captain Bolt | bouncing bubble bombs | every bubble splits in two; the smallest pop into coins |
  | Venus · Buzzy | the hornet leaves the edge | a dotted path shows its loop through your side; hit it while it perches (×1.5) |
  | Belt · Magna | a magnet that wears scrap | blue pulls scrap into an orbiting armour, red flings it out in a ring |
  | Jupiter · Radar | a searchlight | stay out of the beam or it locks on and snipes; hide behind the drifting rocks |
  | Saturn · Peekaboo | hide and seek | look-alike boxes shuffle; the real one's eye glints; a wrong guess pops a copy |
  | Uranus · Whirly | a spinning armour ring | shoot through the gap; from phase 2 a second ring spins the other way; shots curl |
  | Neptune 1 · Scrap King | a wall of scrap blocks | tunnel through the blocks, shoot the scrap flying in to rebuild it; red blocks shoot |
  | Neptune 2 · Anvil | a hammer on a long arm | leave the red column; after the slam its yellow joint takes double damage |
  | Neptune 3 · Zero | all of it | the spinning ring, then hide and seek, then the hammer |
- **Bosses that think (v3.4):** the tricks above no longer run on a clock. Every boss has a small brain in
  `js/bosses.js`:
  - **It watches you.** Stay in one spot for a few seconds and it says so and goes for that spot. Its shots take
    turns aiming at the ship and ahead of a moving ship, so neither standing still nor one steady slide is safe.
  - **It chooses.** Each boss has three to six moves and picks the next by the situation (Magna flings its armour
    in a ring when you are close and snipes with it when you hang back), never the same move twice running.
  - **It reacts.** Hit it well above the pace of the fight and it defends: Scrappy snaps shut, Captain Bolt hides
    in a bubble, Buzzy jinks out of your lane, Peekaboo blinks away, Whirly turns its thickest plates to you, the
    Scrap King seals your tunnel, Anvil covers its core with the hammer. After it hits you it gloats and gives you a
    breath.
  - **It remembers.** What hit you is kept between fights (localStorage `abood-moon-bossmem-v1`); on a rematch it
    favours that move and says so. Zero runs the three styles that hit this player the most, the worst one last.
  - **You can read it.** It says what it noticed (a speech line), and two small arrows beside it mean "hit it now".
    (The v3.4 thought bubble and the rings drawn over the bodies are gone: nothing covers the robot art any more.)

  | Boss | New moves |
  |---|---|
  | Scrappy | peeks and hides when hit, rolls down your lane and comes back dizzy; knock on the shell and it answers |
  | Captain Bolt | streams small bubbles ahead of you, sucks stray bubbles back from behind, hides in a big bubble |
  | Buzzy | loops through the spot you are in (and may re-aim), stabs down your lane and limps home, strafes |
  | Magna | drags scrap in from BEHIND you (the left edge flashes), snipes, pulls a fresh coat when shot bare |
  | Radar | the beam searches, tracks and loses you (`?`); floodlight, a spotter drone, a blast over your rock, or it shoots the rock away |
  | Peekaboo | keeps score and speeds up; a second tell (the real one sweats when you aim at it); the copies charge when time runs out |
  | Whirly | guards, then must vent; throws the plates facing you as returning saws (leaving a hole there); drags the ship in |
  | Scrap King | rebuilds the hole in your lane first, slides a whole wall in front of you, throws blocks, builds turrets where you like to fly |
  | Anvil | aims ahead and learns which way you run, shifts the column late, sweeps sideways, rains debris, shields its core |
- **Wingmen:** every rescued maintenance robot flies with you, shoots, and blocks one hit (2 at a time, 3 with Nabeeh
  level 5).
- **Supply drones and weapon capsules (v3.3):** three cargo drones cross every leg (and one comes after each boss phase).
  Shoot one open for a capsule that changes weapon every 1.1 s (spread, piercing laser, homing missiles, saws): grab it
  when it shows the one you want. The same weapon again levels it up to 3 (more spread, a wider laser, more missiles and
  saws, more time); another weapon swaps it; a hull hit costs one level. A low hull also gets a repair from the drone.
  Small pickups (cell, rapid, repair, shield) never stay away for long: after about 24 kills without one, one drops.
- **Shot colours (v3.3):** your blaster is electric blue and grows with its level (rails, an arrowhead, a crackling
  edge). Enemy shots are pink with a white core: dodge them. Grey scrap balls can be shot down.
- **Space weather** from Jupiter on: ion storm, dark sector, magnetic field or solar wind (two on the Hard tier).
- **Director:** from Venus on, the pressure rises slowly while you fly clean and eases off after hits, with a build-up
  and relax rhythm. Replays of a finished leg shuffle its waves and set pieces.

## Robot families (v3.5)

Every journey belongs to ONE robot family, and you watch it grow up over the three legs:

| Leg | Who ends it | Body | Moves |
|---|---|---|---|
| 1 | the **young** one | a new small body (`y_*` in `js/art.js`) | the family's two basic moves, slower |
| 2 | the **grown** one | the rival's own body | every family move |
| 3 | the **giant** | a new giant body (`q_*`), about twice the size | every move, plus `brood` and `royal` |

| Journey | Family | Young, grown, giant |
|---|---|---|
| Moon | scrap satellites (blast doors) | Bolty, Nutty, Scrappy the Giant Wreck |
| Mars | rust pirates (bubbles) | Dusty, Rusty, Captain Bolt's Pirate Ship |
| Venus | bees (dives) | Sparky, Stinger, Buzzy the Hive Queen |
| Belt | magnets (scrap armour) | Pebble, Clamp, the Giant Magnet |
| Jupiter | radar dishes (searchlight) | Blip, Ping, the Great Array |
| Saturn | mirror orbs (hide and seek) | Shadow, Blink, the Mirror Moon |
| Uranus | spinning tops (orbiting plates) | Spinner, Twister, the Cyclone |
| Neptune | the black fleet | Scrap King, Anvil, Zero Prime |

- **Workers in the legs.** The rage robots are the family's young body; from leg 2 on, **elites** in the grown body fly
  with them (more HP, already half-way to rage). The Moon and Mars get harmless family squads.
- **Giants.** `brood` opens the hatch and sends out workers; `royal` is an area attack that differs by family (blast
  zones, a shock ring with a gap, a wall of shots with a gap, or the Hive Queen's dart fan). A giant only hurts with its
  head when it dives, and warns longer.
- **Nothing covers the art.** Scrappy's shell is now two blast doors that slide apart; Whirly's ring is separate plates
  orbiting clear of the body; the magnet has no second horseshoe drawn over it.

### Difficulty restudy (v3.5)

Measured with a test pilot (a dodge-and-aim bot) flying all 24 legs at the ship level each journey asks for:

- **Before:** with the ship's upgrades, bosses died in 13-30 s (before showing their moves), young Mars bosses could
  not be hit (they tracked 40 px off the ship's lane with a 28 px body), and Saturn's laser robots chained hits.
- **Now:** boss HP in a leg is `base x LEG_K x growth`, where `growth` follows the ship's firepower above what the
  journey expects (`POWER` in `js/meta.js`, capped at x2.2). Fights measured at about 30 s (young), 40-50 s (grown)
  and 50-70 s (giant) from Venus on; the Moon stays near 20/25/30 s and Mars near 35/55/60 s.
- One laser sweep on screen at a time, and a sweep stops closer past the ship. Duel giants get a share of the stretch.

## Room, finale, curve and choices (v3.6)

Testers asked for more freedom to move, faster warnings, a curve that is not linear and does not go soft after upgrades,
a finale that is a real second battle, more horizontal room, and characters that differ.

- **Field and movement.** The field is zoomed out about 10% (`WORLD_W` 960) and the ship flies in the left **65%**.
  Bolts are 30% stronger over their first 230 px (point-blank), so flying close is worth the risk. The ship no longer
  grows with its tier (`SHIP_S`), the gun fan is tighter, wingmen sit closer.
- **Warnings** are shorter everywhere by journey (`WARN_K` in `js/meta.js`: Moon ×0.85 … Neptune ×0.58); the pre-boss
  WARNING is 2.4 s and the title card 1.7 s.
- **Curve.** `curve(j, li)`: across journeys it accelerates (attack tokens 2,2,3,3,4,5; attack interval 2.6 → 1.35 s),
  and inside a journey leg 1 is a breather, leg 2 the step, leg 3 the spike (`LEG_SHAPE`). Every leg from Venus ends its
  flying part with a **rush** wave; from Saturn robots also fly in during the middle set piece.
- **Threat.** `threat(j, shipLevel)`: every upgrade level above what the journey asks for raises the pressure (more
  robots per wave, one more attacker at 1.5, shorter pauses, tougher rocks, less rest between boss moves). Measured: a
  ship 8 levels over takes about as many hits as an on-level one, not fewer.
- **Finale = two battles, and a second form.** Leg 3 brings the family's grown robot as the **guard**, then (after a
  repair and a rumble) the **giant**, 18% bigger than in v3.5. At zero energy the giant does not give up: it grows
  another 15%, refills half a bar and fights as its **second form** (shorter rests, elite workers, two area blasts in a
  row, and `fury`: walls of shots and exploding lanes that leave one safe lane). Duel rematches fight both forms.
- **Choices that matter.**
  - Every costume has an active **power** on its own button (key `E`): Dash, Pulse, Magnet burst, Slow time, Nova,
    Overdrive, Repair, Shard storm (`POWERS` in `js/meta.js`). Perk costumes keep their passive bonus on top.
  - Ship paints are **classes**: Falak balanced, Patchwork tank, Hornet racer, Radar scout, Whirl spinner, Anvil heavy,
    Royal ace.
  - Abood is the gunner (shots +10%), Mozah the flyer (ship +12%, pickups from further).
  - The pickers show the power or class on every card.
- **Test pilot.** `tools/pilot.js` flies legs by itself and reports hits, causes and fight lengths (see Testing).

## Menus that fit the device (v3.7)

Played on a Red Magic 8S the menu scrolled and some buttons showed symbol characters. Now:

- **Nothing scrolls.** `js/ui.js` measures the screen it is on:
  - `pageRow()` shows as many cards of a row as fit (journeys, costumes, ship paints, rivals), with drawn arrows and a
    swipe for the rest; a picker row uses free height for a second or third row of cards.
  - `pageSheet()` deals the blocks of a sheet (missions, badges, how to play) onto pages no taller than the room this
    screen has: grids split card by card, a heading never ends a page, long help texts become short cards (`chunks()`).
    The page arrows and `2 / 5` sit in the sheet's header.
  - `fitPanels()` scales any panel that would still be taller or wider than the screen (menu, sheets, results, pause,
    gifts), so nothing is ever cut off. Overlays no longer scroll.
  - Everything is rebuilt on resize and rotation. Narrow landscape phones no longer fall into the portrait layout.
- **Drawn art, no symbol characters.** The six menu tiles carry small canvas pictures in the game's art (Usta, the pilot
  in the current costume, a clipboard, the next rival, a medal, Nabeeh) and Launch shows the player's own ship. Check
  marks, arrows and stars that were typed as characters (`✓ → ★ ▲ ▼`) are now drawn icons or plain words.
- Checked at 568×320, 667×375, 740×340, 902×350, 902×406 and 1180×820 in English and Arabic: no scrollable area, no
  panel off screen.

## Harder from Mars on (v3.8)

The owner found the fourth journey easy and the Hard tier no different from normal, and wants only the Moon to be the
children's journey.

- **Mars can hurt.** No self-repair and no respawn any more; it keeps slightly kinder hitboxes, 5% slower traffic and
  one free shield per leg. It asks for ship level 4, and its own robots (aimed shots) fly in.
- **The robot curve starts one journey earlier and is steeper:** Mars shot, Venus + dash, Belt + bomb, Jupiter + laser
  sweep, Saturn + shield link, Uranus + swarm, Neptune everything, faster. Attack tokens 1,2,3,3,4,5,6.
- **Upgrades are answered harder** (`threat`): more robots per wave (`+round((T-1)x4)`), extra attackers from T 1.25,
  pauses divided by T, faster shots, more elites. Measured on the Belt: 8 levels over is no longer easier than on-level.
- **The Hard tier is a different flight** (`HARD` in `js/meta.js`): +2 robots per wave, +2 attackers, one attack kind
  ahead of the journey, an elite in every wave, every robot wave slot used, faster shots, warnings x0.8, bosses rest
  x0.72, a 75% second form, threat never below 1.4. It pays x2.5. The test pilot does not survive a Hard Belt leg.
- Time to finish (estimate from payouts and the test pilot): about 8 to 10 hours to Neptune, of which about 2 hours
  is first-time flying and the rest is replays to save for the ship-level gates.

## The long game, step 1 (v4.0)

The owner expected 250 hours of play; the game held about 8 to 10. The agreed plan is a story of about 30 hours and about
250 hours to finish everything, from generated missions, deep progression and new places, with no planet locked behind
saved coins. v4.0 is the foundation; expeditions (v4.1), mastery and ship Marks (v4.2) and four new places (v4.3, v4.4)
follow. The plan is in `LONG` (hours per part) in `js/meta.js`.

- **Mission generator** (`mission(spec)` in `js/meta.js`): a short flight with a goal, built from a seed out of the same
  beats the legs use. Eight types: patrol, rescue run, escort the tanker, hold the line (a station), crystal haul, boss
  rush, time attack (machines, not rocks), hunt the elite. Ten mutators: heavy traffic, no shield, glass hull, fast
  shots, dark sector, heavy gravity, solar wind, swarm only, elites only, quick power.
  In `js/game.js`: `goalText()`, `goalMet()`, `missionTick()`, the protected ship `run.ward` (`updateWard`), the hunted
  elite, `applyMutators()`. A goal that is met ends the flight early; a missed goal or a lost tanker fails it.
- **Contracts:** six per journey (48), fixed seeds. The menu's leg row has a Contracts button for the selected journey.
- **Gates:** a journey opens with stars in total and contracts done on the journey before (`GATE`), not ship level.
  The old `need` is now Usta's recommended ship level (a wrench chip on the journey card when the ship is below it).
- **Pilot rank** 1 to 100 (`rankOf`, 45 x rank² XP) and a **completion** screen with a bar per part (`completion()`).
  Tap the rank chip on the pilot's picture.
- **Backup code** (`exportSave`, `importSave`): the save as a code or a file, with a checksum; a damaged or newer code
  is refused, and loading asks twice.
- **Save** is schema 4 (`migrateV3`): nothing is removed, journeys the old rule had opened stay open, XP is seeded
  from past flights.
- **Tools:** `tools/pilot.js` flies missions (`P.missions('belt', 15, [1, 2])`), `node tools/econ.mjs` reports the
  story's length from measured flight times and the gate table.

**Contract tiers (v4.1).** Every contract has three tiers (`TIERS`, `contractSpec(jid, ci, tier)`): the same goal one
step up the curve with one more mutator, then two. A tier opens when the one before is done; prizes and XP grow with
the tier. From Venus on the gate also asks for some tier-2 contracts on the journey before (`GATE`'s third number).
Journeys a v4.0 save had already opened stay open. 144 contract flights in all.

What the simulator says today (`node tools/econ.mjs`): the story takes about 4 hours for a skilled player, 7 for a
typical one and 10 for a learner; every contract tier adds about 4, 8 and 13 hours on top. That is still short of the
30-hour target: the rest has to come from the four new places, and the 250 hours from expeditions, robot families and
ship Marks, which are not built yet.

## Screens and layout (v3.2)

- **One play-field shape everywhere.** The field is always about 2.15:1, the shape of a phone held sideways. iPads,
  square and 16:9 screens get bands above and below; very wide screens get bands at the sides. Dodging room and the
  time a threat takes to cross are the same on every device. The HUD and the beam button sit in the bands when there is room.
- **Pickups** stay inside the band the ship can reach and last 18 s. Rapid fire lasts 9 s, weapons 14 s (laser 11 s).
- **Reward toasts.** After a leg, level-ups, new journeys, badges and finished missions play one by one over a textured
  backdrop; each moves on by itself and a tap skips it. Choices (wear a new suit or paint, meet Mozah) come last and wait.
  The results card itself keeps only the title, stars, scores, coins and the three buttons; Nabeeh says the next goal.
- **Guided pickers.** Suits (pilot, suit, ship), the hangar and the duel arena share one layout: a live stage with one
  action button, and a fixed row of choices. They fit on a phone in landscape without scrolling.
- **Icons.** Every symbol is an ink line icon in the menu-tile style; no colour emoji.
- Local dev (localhost, 127.0.0.1) never registers the service worker, so edits show on reload.

## Journeys (v3)
Eight journeys of three legs each: Moon → Mars → Venus → Asteroid Belt → Jupiter → Saturn → Uranus → Neptune.
A leg is a scripted flight of about 2½ minutes (`legPlan()` in `js/meta.js` builds it from the journey's flavour and
the leg's tuning row): a calm start that introduces the leg's new thing, a first wave, a scrap-rain breather, a meteor
window, a set piece, a second wave, a twist, a calm, a **WARNING** banner, and the boss. The trip timer freezes while the
boss is on screen; the leg ends when the boss is fixed. Finishing a leg pays dirhams, finishing a whole journey pays a big
arrival bonus, gives you that planet's postcard and fact, and unlocks the next journey. Finished legs can be replayed
for 35% of the reward. If the ship goes down, or you quit, you keep the coins you picked up, but not the leg reward.

- **Bosses inside the journey:** legs 1 and 2 end with a small **guardian** robot (about 20 s). Leg 3 ends with the
  journey's **rogue ship** (Neptune's three legs end with Scrap King, Anvil and Zero). Beating a rogue ship in the journey
  pays its first-win prize and unlocks its costume or paint; the Duels tile stays as a free rematch arena.
- **Easy start, by journey:** the **Moon** is for the youngest pilots: nothing hurts the ship, a hit is only a "bump!",
  targets are slower and bigger, bolts bend towards them, and the boss cannot hurt. **Mars** heals its shield after
  6 s and respawns the ship in place if it goes down. From **Venus** on the hull is real, turrets shoot back, and each
  journey gets faster and denser up to Neptune. A hidden assist kicks in after two deaths on the same leg (slower,
  +1 hull, a shield).
- **Set pieces:** squads of drones that fly in and dive, guard turrets, a grabber that kidnaps Nabeeh (shoot it to free
  him), junk swinging on a tether, solar-panel walls with a gap, a derelict station corridor, a solar flare you shelter
  from behind a big rock, debris cascades, and scrap rain (harmless, all coins).
- **Rescue pods:** three stranded maintenance robots per leg; fly over them to take them along.
- **Ship level gates:** from Venus on, a journey needs a minimum ship level (total upgrade levels: 12, 15, 18, 21, 24, 27).
  Usta tells you what to buy next. A journey you have already started stays open.
- **Leg stars:** each leg has 3 stars: finish it, finish with a healthy hull, and reach the score target.
- **Medals and the Hard tier:** each leg also has 4 medals: finish, no damage at all, every pod rescued, and the score
  target. All 12 medals of a journey open its **Hard** switch next to Launch: faster, tougher, warnings shorter, no
  assists, and replays pay ×2.

## Duels (rematch arena)
After you finish the Mars journey, the **Duels** tile opens with the ten rogue robot ships you meet in the journeys. Each
has its own moves and attacks: aimed shots, fans, walls with a gap, lasers with a warning, homing mines, shields, armour
plates and summoned drones, and phases that change as its health drops. Rematches are free, pay 35%, and one rival a day
pays ×2. A fixed rival becomes a friend of Falak Station (you will see it float round the station).

## Mozah
Abood's sister **Mozah** joins after you finish 10 missions (daily or ladder). Pick who flies at the top of the
Costumes sheet. She has her own suit colours, a sports hijab inside her helmet, and the Arabic text speaks to her in the feminine.

## Missions
- **Mission ladder:** endless sets of three missions, like Run, Abood!. Each finished set raises the coin multiplier by ×0.1
  (up to ×2.5) and pays a reward. A stuck mission can be skipped for dirhams.
- **Daily missions:** three a day. The rewards grow as you reach further planets.
- **Login gift:** 7 days, with a booster on day 7 and a welcome-back gift after a few days away.

## Hangar (Usta's upgrades), boosters and costumes
- **Upgrades:** blaster, twin guns (up to 5 bolts), hull armour, shield, super core, engine, magnet and **Nabeeh AI**.
  From level 1 Nabeeh shoots with his own laser, from level 3 he pulls in coins, and at level 5 he fires double.
  The top level of most upgrades adds a small extra trick. As you upgrade, the ship's look changes through 5 tiers.
- **Boosters:** start shield, start beam, +1 hull and +0.5 coins, bought in the hangar and armed before a flight.
- **Costumes:** free colours for each character, plus 12 costumes with a small effect and their own engine trail, bolt
  colour or glow, for example the magnet suit (wider magnet), the comet suit (faster moves), the ice suit
  (meteors warn earlier) and the champion suit (from beating the last rival). They come from dirhams, badges, rivals,
  the mission ladder and leg stars.
- **Ship paints:** 7 paint jobs, won from rivals and badges.
- **Badges:** bronze, silver and gold tiers, plus one-off badges.

The economy is sized for about two months of daily play (15–20 minutes a day) to win everything.

## Files
```
index.html  css/style.css     page, HUD, menus (Falak Station)
js/game.js                    loop, gameplay, particles, sound (ZzFX + Hijaz music)
js/art.js                     all drawing: space, planets, ship, Abood, Nabeeh, Usta, rocks, junk, meteors
js/ui.js                      menus, hangar, suits, missions, badges, results, HUD
js/meta.js                    save, journeys, leg plans (timelines), assist profiles, guardians, economy, upgrades, missions, badges
js/bosses.js                  the boss brain (senses, move choice, memory, family stages, giant moves) and the nine boss styles
tools/pilot.js                dev tool: a test pilot that flies legs and reports hits and fight lengths (not loaded by the game)
tools/econ.mjs                dev tool: the hour-budget simulator (node tools/econ.mjs)
js/pieces.js                  drawing for the set pieces: turrets, grabber, tether, station walls, rescue pods, solar flare
js/i18n.js                    Arabic + English text
sw.js, manifest.webmanifest   offline + install (landscape, fullscreen)
```
Run locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

Publishing: `./deploy.sh` stamps the commit id into every `__BUILD__` (cache names and asset URLs), builds the site into
an orphan `gh-pages` branch and force-pushes it. GitHub Pages serves that branch (**Settings → Pages**, source
**Deploy from a branch**, branch **gh-pages**, folder **/ (root)**). The original repo did the same from a workflow on every
push; this repo keeps it as a script because pushing workflow files needs a token with the `workflow` scope.

See [CREDITS.md](CREDITS.md) for third-party licences.

## Testing from the console
`window.__game.debug` drives the engine without playing: `start('venus', 1)`, `step(1/60, 600)` advances the simulation
without animation frames, `jump(120)` moves the leg clock, `skip()` jumps to the WARNING (or ends the boss on screen),
`piece('corridor')` fires any set piece (`wall squad turrets tether pods scrapRain cascade flare corridor grabber`),
`winDuel()` fixes the boss, `beats()` lists the leg's timeline, `info()` shows the run. v3.1 adds `robot({ atk:['bomb'] })`,
`weapon('saw')`, `wing()`, `combat()` (robots, zones, tokens), `killPart('shieldGen')`, `setXY(x, y)` and `rival()` with parts and guards. v3.3 adds `bs()` (the styled boss: style, mode, targets, HP),
`hitBoss(n)`, `carrier()`, `picks()` and `wpn()`. v3.4 adds `brain()` (what the boss senses and plans), `bossMove('dart')` (force a move) and
`bossMem()` (its memory of earlier fights; `bossMem(null)` clears it). v3.6 adds `power('nova')` (fire a costume power), `threat()`, `debug.noForm2 = true` (skip the giant's second form), and the test pilot: `const P = await import('/tools/pilot.js'); P.boot(); await P.fly('venus', 2, 12)` or `P.sweep([0,0,12,15,18,21,24,27])` then `P.result()`. v3.5 adds `world()` (the live arrays, for test pilots) and `info().hitLog` (what hit the ship and when).
