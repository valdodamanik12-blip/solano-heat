// Solano Heat — the hand-in program for gta6-01 (Node 22, standard library only).
//
// The entry is this directory: game/ holds the playable game (plain static files —
// an index.html and its ES modules, no library, no network), screenshots/ holds
// four JPEG renders of it (the first by name is the cover), and this program
// copies both into the output directory and writes the dossier the judge reads,
// built with the vendored make.fun library so the bytes match the scorer's own.
//
// Run it the way the kit prescribes:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR stands in for the grader's /output outside its container.)
// Serve the game itself with `node serve.ts` and open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Stage the entry: the game tree wholesale, and the screenshots beside it.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's caps, passed in full: text_max_bytes shapes the dossier's text,
// the rest make this program refuse exactly what the scorer would refuse —
// more than 4 screenshots or one over 256 KiB, more than 993 files or 48 MiB
// under game/, or a game path over 1000 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
