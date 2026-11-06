# عبود إلى القمر · Abood to the Moon

Sister game to **Run, Abood!**. Abood is grown up now, the youngest astronaut on **Falak Station**, a satellite
station in orbit around Earth. He lives there with his smart AI robot **Nabeeh**, and the hangar robot **Usta**
builds and upgrades his ship. His dream is to fly to the Moon, and then to every planet.

It is a horizontal space shooter in landscape. Arabic is the default language; the flag buttons switch to English.
There are no aliens: the only things in space are rocks, junk left behind in orbit, and sudden meteors.

**Play:** https://mja-py.github.io/abood-to-the-moon/

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

## Journeys
Eight journeys of three legs each: Moon → Mars → Venus → Asteroid Belt → Jupiter → Saturn → Uranus → Neptune.
A leg lasts 60–80 seconds. Finishing a leg pays dirhams, and finishing a whole journey pays a big arrival bonus,
gives you that planet's postcard and fact, and unlocks the next journey. Finished legs can be replayed for 40% of
the reward. If the ship goes down you keep the coins you picked up, but not the leg reward.
The Moon starts easy; each planet gets faster and busier.

## Hangar (Usta's upgrades)
Blaster, twin guns (up to 5 bolts), hull armour (3 → 8), shield, super core, engine, magnet, and **Nabeeh AI**
(from level 1 Nabeeh shoots rocks with his own laser, from level 3 he pulls in coins, and at level 5 he fires
double). As you upgrade, the ship's look changes through 5 tiers. Suits: four free colours, plus a heat suit
(+1 hull), a pilot suit (the beam starts 30% charged) and a gold suit (badge for reaching Saturn, coins ×1.2).
There are also daily missions, a 7-day login gift, and bronze, silver and gold badges.

## Files
```
index.html  css/style.css     page, HUD, menus (Falak Station)
js/game.js                    loop, gameplay, particles, sound (ZzFX + Hijaz music)
js/art.js                     all drawing: space, planets, ship, Abood, Nabeeh, Usta, rocks, junk, meteors
js/ui.js                      menus, hangar, suits, missions, badges, results, HUD
js/meta.js                    save, journeys, economy, upgrades, missions, badges
js/i18n.js                    Arabic + English text
sw.js, manifest.webmanifest   offline + install (landscape, fullscreen)
```
Run locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

Every push to `main` runs `.github/workflows/pages.yml` (the same workflow as Run, Abood!). It stamps the commit id into `sw.js` and publishes the game to the `gh-pages` branch. If the site does not appear after the first deploy, open **Settings → Pages** and set **Source** to **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**.

Pushing a tag like `v1.0.0` runs `.github/workflows/release.yml`. It creates a GitHub release with the source zip and a single-file build of the whole game (`tools/build_single.py`), using the notes in `.github/release-notes/<tag>.md`.

See [CREDITS.md](CREDITS.md) for third-party licences.
