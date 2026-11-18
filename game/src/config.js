// Solano Heat — shared constants: world geometry, the heat scale, the palette the whole
// game paints with, and the words the menus show. Everything else imports from here so
// the city, the physics and the HUD never disagree about how big the world is.

export const STEP = 1 / 60; // the fixed simulation step, in seconds

// The city grid: COLS x ROWS building blocks separated by roads on every side, so the
// world is blocks plus one more road than there are blocks, in both directions.
export const COLS = 11;
export const ROWS = 9;
export const BLOCK = 250; // one block's width and height, in world units
export const ROAD = 80; // one road's width, curb to curb
export const PITCH = BLOCK + ROAD;
export const WORLD_W = COLS * BLOCK + (COLS + 1) * ROAD; // 3710
export const WORLD_H = ROWS * BLOCK + (ROWS + 1) * ROAD; // 3050

export const CITY_SEED = 20261117;

// Wanted heat: HEAT_PER_STAR heat is one star, so the stars a player sees are always
// ceil(heat / HEAT_PER_STAR) and five stars is the top of the scale.
export const HEAT_MAX = 500;
export const HEAT_PER_STAR = 100;

export const SAVE_KEY = 'solano-heat-save-v1';
export const START_MONEY = 120; // What Mari lands with; the debt is $2,200.

export const GAME_TITLE = 'SOLANO HEAT';
export const GAME_SUBTITLE = 'an original open-world crime story';

// Golden-hour Solano Bay: warm roofs, teal water, pastel walls. One palette object so
// the renderer, the cars and the menus all reach for the same colours.
export const PALETTE = {
  water: '#1d7a8c',
  waterDeep: '#146074',
  sand: '#ecd29a',
  grass: '#79b657',
  grassDark: '#67a047',
  parkPath: '#d9c08a',
  asphalt: '#3c4048',
  asphaltDark: '#33373f',
  laneMark: '#e8e3c8',
  sidewalk: '#b9b3a4',
  curb: '#9d9787',
  plazaStone: '#c9b995',
  dockFloor: '#8d8578',
  crate: '#a9713d',
  crateDark: '#8a5a2f',
  roof: ['#e2725b', '#e88ca0', '#f2a65a', '#e9c46a', '#90be6d', '#43aa8b', '#577590', '#f4f1de'],
  wallShade: '#00000033',
  windowLit: '#ffd97a',
  windowDark: '#2b3a4a',
  palmTrunk: '#8a5a2f',
  palmLeaf: '#3e9b4f',
  playerJacket: '#12b5a5',
  playerCap: '#ff7b1c',
  policeBlue: '#1f3a93',
  gold: '#ffd60a',
  blood: '#c0392b',
  hudInk: '#10131c',
  hudPaper: '#fdf6e3',
  accent: '#ff5d3b',
};

export const CONTROLS = [
  ['W A S D / arrows', 'move and drive'],
  ['Shift', 'sprint on foot'],
  ['E', 'enter or leave a car, talk, confirm'],
  ['Mouse', 'aim'],
  ['Left click', 'shoot or punch'],
  ['R', 'reload the pistol'],
  ['Space', 'handbrake'],
  ['M', 'full-city map'],
  ['H', 'this help'],
  ['P / Esc', 'pause'],
];

export const INTRO_LINES = [
  'Solano Bay, golden hour. Marina "Mari" Voss is home,',
  'and she owes fixer Dario Klem more than she has.',
  'Work his jobs. Pay the debt. Try not to get caught.',
];
