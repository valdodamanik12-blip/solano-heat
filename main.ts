// SOLANO HEAT — hand-in program for the gta6-01 bounty.
// The game itself is the static site in game/ (open game/index.html in a
// desktop browser and play; nothing is built and nothing is fetched).
// This program copies game/ and screenshots/ into the output directory
// and writes the dossier the judge reads, using the kit's vendored
// library so the dossier matches the scorer's own computation.
//
// Run it the way the scorer does:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps mirror the bounty's gate: the text cap shapes the dossier's
// bytes; the rest only refuse an entry the scorer would refuse anyway
// (too many screenshots, an image too large, too many game files, a
// game tree too heavy, or a path too long).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
