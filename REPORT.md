# SOLANO HEAT — build and verification report (round 3)

## What this is

An original open-world crime game in the fictional city of Solano Bay,
written from scratch for the gta6-01 bounty in plain JavaScript: ES
modules, canvas 2D, no libraries, no assets, no network requests. This
round was composed entirely from the written spec inside one recorded
session — no previous version's code was read or reused — and the game
was then tested, fixed and re-tested in the same session (the revision
pass is summarised at the bottom).

## How to run

- Play: open `game/index.html` in a desktop browser, or run
  `node serve.ts` and visit http://localhost:8080/game/ (the server is a
  small Node standard-library static server in the repo root).
- Hand in: `MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json`
  with the kit's vendored `buildDossier`.

## The game

- **World** (`city.js`): an 11×9-block grid city (3,384 × 2,784 px) with
  two-lane roads, generated buildings, two parks, a downtown plaza, a
  bay with three piers and a causeway bridge on the west edge, dockyard
  blocks with crates, a south beach and sea, and named landmarks:
  Dario's plaza corner, a hospital, a police precinct, and a respray
  garage. Buildings and water collide; piers and the causeway carry you
  over water.
- **Player** (`player.js`, `vehicles.js`): walk/sprint in 8 directions,
  steal and drive six vehicle types (compact, sedan, taxi, van, sports,
  pickup) with distinct speed/accel/grip/health, arcade physics, moving
  traffic that follows lanes and turns at junctions, parked cars, and a
  bail-out driver when you take a moving car.
- **Heat** (`police.js`): crimes are worth heat points (100 = 1 star,
  max 5). Witnessed crimes count in full, unseen ones at a third.
  Police units spawn off-screen in proportion to stars, pursue with
  interception steering, ram the player's car, and fill a bust meter
  when they corner a slow or on-foot player. Heat decays while unseen.
  BUSTED (precinct) and WASTED (hospital) respawns charge a fee plus a
  share of carried cash and blow the active job.
- **Combat** (`combat.js`): fists with reach/arc checks, and a pistol
  (mouse aim, 12-round magazine, reserve ammo, R reload with a timed
  reload) whose bullets stop on buildings and can down pedestrians or
  wreck cars. Guards fight back; the crowd flees threats and witnesses
  crimes.
- **Story** (`missions.js`): five jobs for fixer Dario Klem, in order —
  *First Wheels* (timed dock-to-garage package run, by car), *Ledger
  Bound* (run down a fleeing debtor and stay on him), *Daylight Gold*
  (steal a guarded Vireo GT at the docks, paid by the car's condition;
  Dario hands you the pistol here), *Reel Trouble* (beach pickup that
  forces two stars, delivered to the plaza), *Solano Goodbye* (a
  four-star ambush pinned until you reach the respray garage). Payouts
  in the verified run: $250 / $400 / $600 / $800 / $1,200. After the
  chain, jobs replay for half pay.
- **Presentation**: HUD with cash, health, heat stars, ammo, objective
  line, contextual prompts, a bust meter and toasts; a live minimap
  (roads, water, police, mission car, objective, player); a title
  screen with New Game / Continue; a pause menu; synthesised WebAudio
  effects (shots, crashes, cash, siren) with an M mute; localStorage
  saving of cash, story progress, gun and position.
- **Debug/screenshot hooks** (`shots.js`): `window.__solano` exposes
  state and actions for testing, and `?shot=chase|briefing|docks-fight|
  beach-drive|start&seed=n` poses deterministic scenes through the
  game's own systems.

## Module map

| File | Bytes | Role |
|---|---:|---|
| game/index.html | 7,328 | Page, HUD DOM, overlays, styling |
| game/src/main.js | 24,664 | Orchestration: loop, crime economy, interactions, respawns, saving, debug hook |
| game/src/render.js | 12,157 | Canvas renderer (ground, buildings, vehicles, peds, player, beacon) |
| game/src/city.js | 9,555 | City generation, landmarks, collision, water |
| game/src/missions.js | 9,200 | The five-mission chain |
| game/src/vehicles.js | 7,110 | Vehicle types, traffic, driving physics |
| game/src/pedestrians.js | 6,041 | Crowd/guard/target behaviour |
| game/src/police.js | 5,629 | Pursuit AI and the bust rule |
| game/src/combat.js | 5,549 | Fists, pistol, bullets |
| game/src/hud.js | 4,979 | DOM HUD and minimap |
| game/src/config.js | 4,814 | Tuning constants and data |
| game/src/audio.js | 4,386 | Synthesised sound kit |
| game/src/effects.js | 3,730 | Particles, floating text, shake |
| game/src/input.js | 2,820 | Keyboard/mouse sampling |
| game/src/shots.js | 2,421 | Posed scenes for screenshots/tests |
| game/src/player.js | 2,144 | On-foot movement and health |
| game/src/random.js | 2,064 | Seeded RNG |
| game/src/save.js | 1,301 | localStorage persistence |
| main.ts | 1,627 | Hand-in program (dossier) |
| serve.ts | 1,736 | Local static server |
| README.md | 1,505 | Project readme with the bounty badges |
| shots.json | 254 | Screenshot manifest |

## Verification (all run in this session)

Harness: a small CDP client driving the bundled Chromium headless
shell against `node serve.ts` — real key events, real button clicks,
state read back through `window.__solano`.

- **Syntax: 17/17** game modules pass `node --check`.
- **Playthrough suite: 24/24** — boot with zero console errors, zero
  page errors and zero external requests; title screen; New Game via
  the button (cash $120); walking moves the player; E talks to Dario
  and starts mission 1; E enters a car; driving accelerates; the
  package stage triggers at the docks; delivery pays exactly $250
  ($120 → $370) and advances the chain; the save is in localStorage
  with the right cash; stealing a car in the plaza is witnessed (heat
  jumps past one star) and police units respond; the pistol fires,
  the magazine drops 12 → 11, reload refills it; pause and resume
  work; the minimap draws.
- **Story suite: 14/14** — missions 2–5 start in order at the plaza;
  the debtor is caught and pays $400 ($370 → $770); four guards are
  posted at the docks, the GT is stolen into the delivery stage and
  pays $600 for an undamaged car ($770 → $1,370); the beach pickup
  forces heat to 200 and delivery pays $800 ($1,370 → $2,170); the
  finale pins heat at 400 (four stars), reaching the garage pays
  $1,200 ($2,170 → $3,370), sets the chain-complete flag and clears
  heat. Final integrity re-check: still zero console/page errors and
  zero external requests. **Total: 41/41 checks passed.**
- **Screenshots**: four new JPEGs generated in-session from the
  `?shot=` scenes, 1280×720, each under the 262,144-byte cap
  (88,005 / 74,312 / 78,535 / 76,210 bytes). Two were visually
  inspected: the chase frame shows a four-star hunt with a unit
  alongside the gold Vireo; the docks frame shows the player, pistol
  drawn, already down to 79 health because the posed guards were
  genuinely fighting him.
- **Dossier**: `MAKEFUN_OUTPUT_DIR=/tmp/gta6-v3-out node main.ts` run
  twice produced identical dossiers — sha256
  `498ab7bdbb41d5db4e1c7f270a9d8de04d2627df066194c1f184ef8e2fa984c7` —
  with **117,090 bytes of text** (cap 163,840, no truncation), 18
  source files and the 4 screenshots listed as images.

## Revision pass (what testing surfaced, and the fixes)

1. **The bay flooded the dockyards.** The first water rectangle
   covered the west block column, so the mission-1 pickup point sat
   in the sea and cars were shoved out of it by collision. The bay is
   now a defined bite over the middle-west rows with a causeway
   bridge for the western avenue, piers inside it, and dry dockyard
   blocks to the south; traffic also recentres only when it is
   actually in water.
2. **E was overloaded at the garage.** Respray shared the interact
   key, so a driver in a damaged car could not get out at the garage
   without paying. E is now always enter/exit/talk; respray moved to
   F while in a car at the garage, and the prompts and help text say
   so.
3. **Prompt markup showed as text.** The HUD prompt setter used
   textContent for strings that carry a `<b>` key hint; it now uses
   innerHTML for prompts specifically.
4. **Saves could resurrect a paid mission.** Mission completion
   persisted before the chain index advanced; completion now saves
   again after advancing, and the crowd's spawn guard was updated to
   match the new bay shape.

## Notes

- `serve.ts` was exercised on port 8907 during testing; its default
  is 8080 as documented.
- One harness tolerance: mission 4's heat reads 199 a moment after
  pickup because heat decays in real time from the forced 200 — the
  check asserts ≥ 190 and the mission itself completed and paid.
- LICENSE and vendor/makefun-game.ts are the kit's, untouched.
