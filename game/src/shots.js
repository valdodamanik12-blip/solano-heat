// Deterministic scene poses for screenshots and smoke tests, selected
// with ?shot=<name>. Each pose arranges the world through the same
// helpers a player would exercise — a car is entered properly, guards
// are real guards, heat is real heat — so a screenshot can never show
// a state the game itself cannot reach. S is the scene API main.js
// provides: { world, player, state, placePlayer, enterCar, newCar,
// addGuard, setHeat, startPlaying, focusOn }.

export const SHOT_NAMES = ['chase', 'briefing', 'docks-fight', 'beach-drive', 'start'];

export function applyShot(S, name) {
  const L = S.world.landmarks;
  switch (name) {
    case 'start': {
      // Title screen over the plaza.
      S.focusOn(L.briefing.x, L.briefing.y);
      return 'title';
    }
    case 'briefing': {
      S.startPlaying();
      S.placePlayer(L.briefing.x - 58, L.briefing.y + 26, 0.5);
      S.focusOn(L.briefing.x - 20, L.briefing.y);
      return 'playing';
    }
    case 'chase': {
      S.startPlaying();
      // A gold Vireo on the long east–west avenue, heat high, units close.
      const car = S.newCar('sports', 1500, 1342, 0, '#ffb703');
      S.enterCar(car);
      car.speed = 205;
      S.setHeat(400);
      const a = S.spawnCop(1330, 1300);
      const b = S.spawnCop(1245, 1395);
      if (a) a.speed = 190;
      if (b) b.speed = 178;
      S.focusOn(1560, 1342);
      return 'playing';
    }
    case 'docks-fight': {
      S.startPlaying();
      S.givePistol();
      S.placePlayer(L.docksYard.x + 10, L.docksYard.y + 30, -0.7);
      const car = S.newCar('sports', L.docksYard.x - 30, L.docksYard.y + 66, -Math.PI / 2, '#ffb703');
      car.mission = true;
      S.addGuard(L.docksYard.x + 46, L.docksYard.y + 6);
      S.addGuard(L.docksYard.x - 58, L.docksYard.y - 28);
      S.addGuard(L.docksYard.x + 30, L.docksYard.y + 74);
      S.focusOn(L.docksYard.x, L.docksYard.y + 20);
      return 'playing';
    }
    case 'beach-drive': {
      S.startPlaying();
      const car = S.newCar('pickup', 620, 2530, 0.12, '#bc6c25');
      S.enterCar(car);
      car.speed = 96;
      S.placePlayer(620, 2530);
      S.focusOn(700, 2500);
      return 'playing';
    }
    default:
      return null;
  }
}

/** Read ?shot= from a query string; null when absent. */
export function shotFromQuery(search) {
  try {
    return new URLSearchParams(search).get('shot');
  } catch {
    return null;
  }
}
