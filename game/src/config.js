// SOLANO HEAT — shared tuning constants and static data.
// Everything in here is plain data: sizes, speeds, prices, palettes.
// Other modules import from this file so the game's feel can be tuned
// in exactly one place.

// ---- world geometry -------------------------------------------------------
// The city is a grid of city blocks separated by two-lane roads. One grid
// "pitch" is a building block plus the road that runs along its south and
// east edges, which keeps road maths trivial: road centrelines sit at
// multiples of PITCH plus ROAD / 2.
export const BLOCK = 216;          // buildable square inside one pitch
export const ROAD = 84;            // road width between blocks
export const PITCH = BLOCK + ROAD; // 300
export const COLS = 11;            // blocks across
export const ROWS = 9;             // blocks down
export const WORLD_W = COLS * PITCH + ROAD;
export const WORLD_H = ROWS * PITCH + ROAD;

// The bay fills the strip west of the first road; the beach runs along the
// south edge in front of the waterline. Docks are piers over the bay.
export const BAY_W = 250;          // water width on the west edge
export const BEACH_H = 120;        // sand strip height on the south edge

// ---- player ---------------------------------------------------------------
export const PLAYER_R = 13;        // collision radius on foot
export const WALK_SPEED = 148;     // px per second
export const SPRINT_SPEED = 232;
export const PLAYER_MAX_HP = 100;

// ---- heat / wanted ----------------------------------------------------------
// Heat is tracked in points; every full 100 points is one star. Points make
// partial progress visible (the HUD pips fill up) and let small crimes
// matter without instantly jumping a whole star.
export const HEAT_PER_STAR = 100;
export const HEAT_MAX = 500;
export const HEAT_DECAY = 4.2;     // points per second while unseen
export const HEAT_DECAY_SEEN = 0.6;

export const CRIME = {
  stealSeen: 55,      // taking a car in front of witnesses
  stealUnseen: 16,
  hitPed: 85,
  hitCar: 26,
  gunshot: 34,
  punch: 18,
  missionBump: 40,    // generic scripted trouble
};

// ---- economy ----------------------------------------------------------------
export const START_MONEY = 120;
export const RESPRAY_COST = 120;
export const HOSPITAL_FEE = 75;    // flat part of a WASTED penalty
export const BUST_FEE = 60;        // flat part of a BUSTED penalty
export const PENALTY_RATE = 0.08;  // plus this share of carried cash

// ---- vehicles -----------------------------------------------------------------
// topSpeed px/s, accel px/s^2, grip is how fast the heading follows the
// steering input, size is the half-length / half-width of the body.
export const VEHICLE_TYPES = [
  { id: 'compact', label: 'Solano Compact', topSpeed: 252, accel: 168, grip: 3.4, len: 34, wid: 17, hp: 70,  colors: ['#c94f42', '#4a7fb5', '#d9d4c5', '#5d8a66'] },
  { id: 'sedan',   label: 'Meridian Sedan', topSpeed: 282, accel: 178, grip: 3.1, len: 38, wid: 18, hp: 90,  colors: ['#33415c', '#8d99ae', '#6d597a', '#2a9d8f'] },
  { id: 'taxi',    label: 'Bay City Taxi',  topSpeed: 276, accel: 182, grip: 3.1, len: 38, wid: 18, hp: 90,  colors: ['#f2b705'] },
  { id: 'van',     label: 'Cargo Van',      topSpeed: 228, accel: 138, grip: 2.5, len: 42, wid: 20, hp: 130, colors: ['#e8e6df', '#7f8c8d', '#46637f'] },
  { id: 'sports',  label: 'Vireo GT',       topSpeed: 372, accel: 258, grip: 3.9, len: 37, wid: 18, hp: 80,  colors: ['#e63946', '#ffb703', '#8338ec', '#06d6a0'] },
  { id: 'pickup',  label: 'Dune Pickup',    topSpeed: 258, accel: 158, grip: 2.8, len: 41, wid: 20, hp: 120, colors: ['#bc6c25', '#606c38', '#283618', '#dda15e'] },
];

// ---- weapons ------------------------------------------------------------------
export const PISTOL = {
  mag: 12,
  startReserve: 48,
  reloadTime: 0.9,
  fireGap: 0.21,
  bulletSpeed: 780,
  damage: 34,
  range: 460,
};

// ---- palette --------------------------------------------------------------------
export const COLORS = {
  water: '#14586e',
  waterDeep: '#0d4256',
  sand: '#e3cd96',
  sandWet: '#d4ba7d',
  grass: '#5f9153',
  grassDark: '#527f47',
  sidewalk: '#b9b3a4',
  road: '#3c4043',
  roadLine: '#e8c547',
  plaza: '#cbbfa5',
  pier: '#8a6f4d',
  pierEdge: '#6f573a',
};

// Building paint jobs: body colour plus a trim tone used for roofs/awnings.
export const BUILDING_PALETTES = [
  { body: '#c96f4a', trim: '#8f4a2d' },
  { body: '#d9c9a3', trim: '#a68d5b' },
  { body: '#7fb3b0', trim: '#4d7a78' },
  { body: '#e0e1dd', trim: '#9a9d97' },
  { body: '#778da9', trim: '#4c617d' },
  { body: '#e5b25d', trim: '#b07f33' },
  { body: '#b5838d', trim: '#7d5560' },
  { body: '#6d6875', trim: '#463f4d' },
  { body: '#a3b18a', trim: '#6b7d52' },
  { body: '#f2cc8f', trim: '#bd9250' },
];
