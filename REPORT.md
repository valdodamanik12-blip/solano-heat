# Solano Heat — build report

An original open-world crime game for the make.fun **gta6-01** bounty ("Make GTA 6"),
built from scratch in vanilla JavaScript: ES modules on a 2D canvas, WebAudio for
every sound, zero dependencies, zero network requests. Everything — names, people,
places, art, code — is original; nothing references any existing game or franchise.

**Play it:** `node serve.ts` in this repository, then open http://localhost:8080.
**Hand it in:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` writes the
dossier the judge reads (see "Dossier" below).

## The game

Mari Voss comes home to **Solano Bay** owing fixer **Dario Klem** $2,200. She works
it off job by job out of Klem Auto Works — and when the debt is ash, the city stays
open: courier work, collectibles, and the law remain.

- **The city.** A seeded 11×9-block city (3,710 × 3,050 px) generated from one
  constant seed, so every player gets the same Solano Bay: 8 named districts
  (Solano Beach, Palm Heights, Midtown, The Flats, Old Port, Northgate, Downtown,
  Marina Mile), four signed POIs (Klem Auto Works, Police HQ, St. Solana General,
  Manny's Respray), two parks with fountains, a crate-stacked dockyard, a beach row
  with palms and huts, and a pier walking out into the bay.
- **On foot and behind the wheel.** Walking/running with mouse aim, and driving
  with proper car physics (bicycle-model steering, drift, damage, wrecks). Six car
  kinds — sedan, Sunfire GT sport, cab, van, hauler, police Interceptor — all
  stealable: parked cars, carjackings (the driver bails and flees), and marked
  mission cars each report differently.
- **The law.** A heat meter behind 0–5 stars. Crimes are weighted by witnesses:
  unseen ×0.45, civilian witnesses ×1.0, in front of police ×1.5. Heat cools while
  unseen, faster the longer the trail is cold. Interceptors pursue with lead
  prediction, pile out two foot officers when they corner Mari on foot, shoot at
  3+ stars, and hold an arrest meter that ends in **BUSTED** (fine, car impounded,
  respawn at HQ). Death is **WASTED** (hospital bill, respawn at St. Solana).
- **The story.** Five jobs for Dario, each with a briefing dialogue: *First Wheels*
  (deliver the marked sedan to the pier, $150), *The Sealed Case* (docks pickup to
  a Flats drop, $250), *Daylight Gold* (steal the gold Sunfire GT back from the
  civic impound — this is the job Dario arms Mari for, $400), *Ledger Bound* (clear
  four armed yard guards at the Old Port, take the ledger, $600), *Last Run* (a
  150-second timed van run to the pier, $800). $2,200 exactly: the debt. Then
  endless procedurally-routed courier jobs pay by distance.
- **Combat.** Mouse-aimed pistol (12-round magazine, R to reload, auto-reload on
  empty) and fists; guards and officers return fire; pedestrians flee gunfire,
  crashes, and speeding cars, and can be knocked down — which the law notices.
- **The rest of the loop.** 20 lost film reels hidden around the city (+$50 each),
  Manny's Respray ($120: full repair, a repaint, one star forgotten), a live
  minimap and a full-city map (M), title/pause/help/WASTED/BUSTED screens, and a
  localStorage save (money, story progress, reels, weapon, position, stats)
  autosaved every 20 seconds and at every milestone, with Continue on the title.
- **Sound.** Entirely synthesized WebAudio: gunshots, punches, crashes, cash,
  pickups, doors, a two-tone siren that tracks the nearest pursuit car, an engine
  whose pitch follows speed, and a slow minor-key bass-and-pad music loop.

## Architecture

| File | What it owns |
| --- | --- |
| `game/src/config.js` | Every constant: world geometry, heat tuning, palette, controls, intro text |
| `game/src/random.js` | The seeded RNG (mulberry32) and the small math kit everything shares |
| `game/src/input.js` | Keyboard/mouse state: level + edge triggers, action names (`interact`, `pause`, …) |
| `game/src/audio.js` | The WebAudio sound bank: SFX, engine, siren, music |
| `game/src/city.js` | City generation: blocks, buildings, solids, POIs, palms, parked spots, reels; collision and line-of-sight queries |
| `game/src/render.js` | Painting the world: bay, roads, blocks, lifted buildings with lit windows, signs, beacons |
| `game/src/vehicles.js` | Car physics, traffic AI (lane following), parked cars, car rendering |
| `game/src/pedestrians.js` | The pedestrian figure renderer and the wandering/fleeing/down Ped |
| `game/src/player.js` | Mari: movement, driving inputs, aim, health, entering/exiting cars, firing |
| `game/src/combat.js` | Bullets, the player's pistol and punch, enemy fire, reloads |
| `game/src/police.js` | The heat/star Wanted model, pursuit AI, foot officers, arrests |
| `game/src/missions.js` | The five-job story data, the step state machine, yard guards, courier generation |
| `game/src/hud.js` | HUD, minimap, full map, dialogue box, banners/toasts, and every menu screen |
| `game/src/save.js` | The localStorage record: save / load / continue |
| `game/src/shots.js` | The four deterministic `?shot=` scenes the dossier screenshots are rendered from |
| `game/src/main.js` | The Game class: fixed-step loop, world glue (collisions, theft, respray, reels), crime hooks, boot |
| `main.ts` | The hand-in program: stages `game/` + `screenshots/` and writes `dossier.json` via the vendored library |
| `serve.ts` | The kit's static dev server (unchanged) |

The step runs at a fixed 60 Hz (`STEP = 1/60`) behind an accumulator, so gameplay
speed is frame-rate independent. Systems talk to the world through a small hook
surface on the Game object (`onGunshot`, `onPedShot`, `onOfficerShot`,
`onVehicleImpact`, `onPlayerWasted`, `onBusted`), which keeps the crime-reporting
rules in exactly one place.

## Verification

All checks were run headlessly (Chrome DevTools Protocol against `node serve.ts`)
against the real page — real menu clicks, real key presses, real mouse aim.

**Playthrough — 25/25.** Title boots → New Game → walking moves Mari → E at Dario
opens the briefing → dialogue advances → mission 1 activates and spawns the marked
sedan → E enters it → driving to the pier completes the mission and pays exactly
$150 ($120 → $270) → the save exists in localStorage → E exits → witnessed crimes
reach exactly 2 stars → police Interceptors respond → P pauses and the Resume
button resumes → M opens and closes the full map → the pistol fires (shots counted,
magazine spent) → R reloads → a soak run keeps the world stepping. **Zero console
errors, zero uncaught exceptions, zero external network requests** (18 requests,
all to the local server).

**Story chain — 19/19.** All five missions completed in order with exact payouts
($270 → $520 → $920 → $1,520 → $2,320), the pistol granted on Daylight Gold, the
four-guard fight step clearing, the debt marked paid, a courier job paying after
the story, a reel paying $50, the respray repairing/repainting/dropping a star for
exactly $120, and both respawns (WASTED → hospital, billed $75; BUSTED → HQ, heat
cleared). Zero uncaught exceptions across the chain.

**Screenshots.** The four `shots.json` scenes rendered from the game's own
`?shot=` staging at 1280×720 JPEG, quality 82: 140,924 / 140,652 / 129,089 /
109,848 bytes — each under the 256 KiB cap — and visually inspected (a four-star
chase, the downtown briefing with dialogue open, the Ledger Bound yard fight, the
beach drive with a pursuit car behind).

**Dossier.** `node main.ts` run twice into two output directories produces
byte-identical `dossier.json` (sha256 `9671f88f0a4f7994cbe66925cbb87634251ba331c4e9a7b357718450bed28b63`):
18 source files, 147,812 bytes of game, dossier text 149,014 bytes against the
163,840 cap with **no truncation**.

## Bugs found and fixed during the build

1. **Missing constant.** `main.js` imported `START_MONEY`, which config.js never
   defined — the module graph failed at boot. Added it ($120).
2. **Spawn order.** `buildWorld` spawned traffic before the player existed (the
   spawner measures distance from the player) and dropped the spawners' returned
   arrays. The player is now created first and the fleets assigned.
3. **Input contract mismatch.** Menus ask `consumeClick()` for a boolean and the
   state machine asks `hit('pause')` by action name, while Input spoke raw key
   codes and returned nothing. Input now translates action names, returns the
   click, records the pointer position on mousedown (a click without a preceding
   move used to read as (0,0)), and `endFrame` no longer eats clicks meant for the
   frame's menu pass. `main.js` also passed `(window, canvas)` to a
   `constructor(canvas)` — the "canvas" was the window, and the first real click
   threw on `getBoundingClientRect`.
4. **Audio argument order.** Three `blip()` call sites passed the old
   (freq, seconds, type, volume) shape into (freqFrom, freqTo, seconds, …), making
   a ramp target NaN — which threw inside the step and froze the game mid-briefing.
   Call sites fixed, and the frame loop now schedules the next frame first, so no
   single bad frame can ever freeze the game again.
5. **Heat evaporated.** `Wanted.sightTimer` starts at 99 ("long unseen"), so every
   fresh heat was born "cooling" and the uncapped ramp (≈391/s) drained 200 heat
   in half a second — police effectively never came. Reports now restart the
   trail warm when witnessed, and the drain rate is capped (9–29/s).
6. **Fresh Interceptors culled on frame one.** The beached-car cleanup removed
   any pursuit car that was stationary and >700 away — which describes a car that
   has just spawned at range, before its first throttle step. The cull now
   requires 6 seconds of hunt time.
7. **The pistol never fired.** `Player.update` tracked the aim but never pulled
   the trigger; mouse fire now routes to `playerShoot`/`playerPunch`, and
   `playerShoot` increments the shots-fired stat it was supposed to keep.

## Known gaps

- Police cars can beach themselves on building corners during long pursuits; the
  6-second cull-and-respawn keeps the fleet honest, but the driving is not
  pathfinding-smart.
- Beyond the wanted system there is no free-roam difficulty ramp; courier pay
  scales with distance only.
- The music is a short synthesized loop, not a composed track.
- Mari's figure is small at city zoom — readable by her gold cap, but small.
- Traffic pile-ups at intersections resolve politely and sometimes slowly.

## Originality note

Solano Bay, Mari Voss, Dario Klem, Klem Auto Works, Manny's Respray, St. Solana
General, and the Sunfire GT are invented for this entry. No third-party names,
assets, audio, or code are used; the only vendored file is the kit's own
`vendor/makefun-game.ts`, byte-unchanged.
