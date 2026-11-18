// Solmar Heat — every tuning number and colour in one place.
// The city is a 5x5 grid of blocks on a flat plane: x runs east toward the beach and the
// sea, z runs south, y is up. Roads are 16 wide, blocks 56, so road centrelines sit 72 apart.
export const STEP = 1 / 60;

export const CITY = {
  blocks: 5,
  block: 56,
  road: 16,
  pitch: 72,
  half: 188,
  // Road centrelines and block centres, from west/north (-180) to east/south (+180).
  roads: [-180, -108, -36, 36, 108, 180],
  centres: [-144, -72, 0, 72, 144],
  beachX: 188,
  seaX: 262,
  groundWest: -270,
  groundEast: 620,
  groundNorth: -280,
  groundSouth: 280,
};

export const PLAYER = {
  radius: 0.55,
  height: 1.8,
  walkSpeed: 6,
  runSpeed: 10.5,
  accel: 40,
  health: 100,
  regenDelay: 8,
  regenRate: 3,
  pistolDamage: 34,
  pistolRange: 55,
  pistolRate: 0.22,
  pistolAmmo: 12,
  punchDamage: 20,
  punchRange: 2.2,
  punchRate: 0.45,
};

export const CAR = {
  length: 4.4,
  width: 2.0,
  radius: 2.1,
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 34,
  maxReverse: 12,
  steer: 1.9,
  steerAtSpeed: 0.55,
  drag: 0.55,
  offroadDrag: 2.4,
  handbrake: 26,
  ramDamage: 6,
  // A car the player is driving takes this much of a hard hit as player damage.
  crashDamage: 9,
  crashSpeed: 14,
};

export const TRAFFIC = {
  count: 12,
  minSpeed: 8,
  maxSpeed: 14,
  followGap: 9,
  lane: 4,
};

export const PED = {
  count: 26,
  minSpeed: 1.4,
  maxSpeed: 2.6,
  fleeSpeed: 5,
};

export const WANTED = {
  max: 5,
  decaySeconds: 14,
  stealTraffic: 1,
  hitPed: 1,
  shoot: 1,
  ramCop: 1,
  // Police cars on the road for each wanted level (index = stars).
  policeCars: [0, 1, 2, 3, 4, 4],
  policeFoot: [0, 0, 0, 1, 2, 3],
  chaseSpeed: 30,
  ramDamage: 8,
  bustSeconds: 2.5,
  bustTouch: 1.2,
  fineFraction: 0.15,
  fineMin: 50,
};

export const MISSIONS = {
  // Cash the player starts with, and the safehouse (Lena's garage) spot.
  // These are the doors of the places, on the sidewalk outside their buildings.
  startCash: 100,
  safehouse: { x: -144, z: 168 },
  garage: { x: -150, z: 122 },
  bank: { x: -144, z: -126 },
  docks: { x: 150, z: -150 },
  marina: { x: 150, z: 168 },
  plaza: { x: 0, z: 0 },
};

export const PICKUPS = {
  count: 10,
  value: 25,
  respawnSeconds: 45,
};

export const FARE = {
  min: 40,
  max: 90,
  // Seconds a waiting fare stays before walking off.
  waitSeconds: 60,
};

export const AUDIO = {
  musicBpm: 104,
  engineBase: 55,
  engineTop: 190,
};

export const SAVE_KEY = 'solmar-heat.save.v1';
export const BEST_KEY = 'solmar-heat.best.v1';

export const PALETTE = {
  sky: 0x8ec3e8,
  fog: 0xf2d7a8,
  sun: 0xffe6b8,
  hemiSky: 0xbfd9ff,
  hemiGround: 0x8a6a4a,
  ground: 0x7fae62,
  road: 0x3a3f46,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d29a,
  sea: 0x2e7fa8,
  buildingRoof: 0x6b5d4f,
  player: 0x2fa39a,
  playerDark: 0x1d2b33,
  police: 0x1d2b3a,
  policeWhite: 0xe8e8e8,
  hud: '#eef1f5',
  hudMuted: '#c8ccd4',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4f8ef7',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Facade colours for the procedural building textures (warm, sun-soaked, original).
export const FACADE_COLORS = [
  { base: '#f2e3c6', trim: '#c98a4b', windows: '#2b3a4a' },
  { base: '#e8b48a', trim: '#8a4a2b', windows: '#24344a' },
  { base: '#9fc4c0', trim: '#3f6a66', windows: '#22303e' },
  { base: '#d96a5f', trim: '#7a2b26', windows: '#2a2f3a' },
  { base: '#f7f3e8', trim: '#7a7a6a', windows: '#2f3a46' },
  { base: '#c9d6a0', trim: '#6a7a3a', windows: '#2b3644' },
];

export const CAR_COLORS = [0xd95f4b, 0x3f7fb8, 0xe8c84a, 0x7fb069, 0x8a6fb8, 0xd8d8d8, 0x2b2b2b, 0xe87a2e];
export const PED_SHIRTS = [0xe8e8e8, 0xd95f4b, 0x3f7fb8, 0xe8c84a, 0x7fb069, 0x8a6fb8, 0xf2f2f2, 0x4a4a4a];
