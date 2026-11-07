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
- **Move:** drag up and down anywhere on the screen (or ↑/↓, W/S). The ship only moves up and down.
- **Fire:** automatic.
- **Super (the Amal Beam):** the big round button at the bottom right (or Space / X) when its ring is full.
  The beam wipes out everything in its path, meteors included.
- **Meteors:** a red dashed line and a "!" warn you first, then the meteor charges. Get out of the line.
  A meteor costs 2 hull points, anything else costs 1. When the hull runs out, the ship goes down.
- **Pause:** II, or P / Esc.
- **60 / 30 fps:** flights run at 60 fps. If a phone gets hot, tap the **60** button on the station menu (or the frame rate button on the pause card) to switch to the 30 fps battery saver. The choice is saved on the device.

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
js/pieces.js                  drawing for the set pieces: turrets, grabber, tether, station walls, rescue pods, solar flare
js/i18n.js                    Arabic + English text
sw.js, manifest.webmanifest   offline + install (landscape, fullscreen)
```
Run locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

Every push to `main` runs `.github/workflows/pages.yml` (the same workflow as Run, Abood!). It stamps the commit id into `sw.js` and publishes the game to the `gh-pages` branch. If the site does not appear after the first deploy, open **Settings → Pages** and set **Source** to **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**.

See [CREDITS.md](CREDITS.md) for third-party licences.

## Testing from the console
`window.__game.debug` drives the engine without playing: `start('venus', 1)`, `step(1/60, 600)` advances the simulation
without animation frames, `jump(120)` moves the leg clock, `skip()` jumps to the WARNING (or ends the boss on screen),
`piece('corridor')` fires any set piece (`wall squad turrets tether pods scrapRain cascade flare corridor grabber`),
`winDuel()` fixes the boss, `beats()` lists the leg's timeline, `info()` shows the run.
