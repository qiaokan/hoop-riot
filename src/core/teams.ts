export interface PlayerDef {
  name: string;
  num: number;
  /** 0..1 ratings */
  speed: number;
  shoot: number;
  power: number;
  jump: number;
  /** Full-meter move with the ball: Comet Shot (cannot miss) or Mega Slam (flying 3-point dunk). */
  special: 'comet' | 'slam';
  /** Full-meter move without the ball: Shockwave (floors everyone nearby) or Blitz (homing tackle). */
  defSpecial: 'shockwave' | 'blitz';
  /** Jabs in a row needed to knock this player down (default 3). */
  tough?: number;
  /** This player's jabs knock down one hit sooner. */
  heavyHands?: boolean;
  skin: string;
  hair: string;
  hairStyle: 'spiky' | 'flat' | 'afro' | 'mohawk' | 'bald' | 'bun';
  build: number;
}

export interface TeamDef {
  name: string;
  short: string;
  jersey: string;
  trim: string;
  shorts: string;
  players: [PlayerDef, PlayerDef];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

// ---------------------------------------------------------------- courts

export type ItemKind = 'can' | 'cone' | 'crate' | 'bomb' | 'bat' | 'banana' | 'hammer' | 'ext' | 'magnet' | 'shoes';
export type HazardKind = 'car' | 'dogs' | 'wrecker' | 'bumpers' | 'wind';
export type EventKind = 'lowgrav' | 'rain' | 'ufo' | 'ironball' | 'bombball' | 'bigball';
export type RideKind = 'board' | 'tank' | 'heli';

export interface StageDef {
  /** Launch pads: step on one to be thrown high into the air. A pad with `kick` is a catapult: it also flings you toward the hoop you attack. */
  launchers: { x: number; z: number; kick?: number }[];
  /** Average seconds between item drops; 0 disables items. */
  itemEvery: number;
  /** Which items drop here (default: all of them). */
  items?: ItemKind[];
  /** Moving dangers and court gimmicks. */
  hazards?: HazardKind[];
  /** Timed events that can strike during a match. */
  events?: EventKind[];
  /** Vehicles parked on the court. */
  rides?: { kind: RideKind; x: number; z: number }[];
}

export type CourtId = 'rooftop' | 'docks' | 'arcade' | 'helipad' | 'palace';

export interface CourtDef {
  id: CourtId;
  name: string;
  feature: string;
  stage: StageDef;
}

export const COURTS: Record<CourtId, CourtDef> = {
  rooftop: {
    id: 'rooftop', name: 'The Rooftop', feature: 'Launch pads, a skateboard, every item',
    stage: {
      launchers: [{ x: 378, z: 95 }, { x: 1122, z: 95 }], itemEvery: 11,
      events: ['lowgrav', 'rain', 'bigball'], rides: [{ kind: 'board', x: 750, z: 300 }],
    },
  },
  docks: {
    id: 'docks', name: 'Pier 9', feature: 'Traffic! Cars, guard dogs, bombs and bats',
    stage: {
      launchers: [], itemEvery: 10, items: ['can', 'crate', 'bomb', 'bat', 'banana', 'hammer', 'ext'],
      hazards: ['car', 'dogs'], events: ['rain', 'ironball'],
    },
  },
  arcade: {
    id: 'arcade', name: 'Arcade Alley', feature: 'Pinball bumpers, four launch pads',
    stage: {
      launchers: [{ x: 378, z: 95 }, { x: 378, z: 265 }, { x: 1122, z: 95 }, { x: 1122, z: 265 }], itemEvery: 13,
      hazards: ['bumpers'], events: ['bombball', 'bigball', 'lowgrav'], rides: [{ kind: 'board', x: 750, z: 180 }],
    },
  },
  helipad: {
    id: 'helipad', name: 'The Helipad', feature: 'A helicopter, catapults, gusts of wind',
    stage: {
      launchers: [{ x: 430, z: 180, kick: 300 }, { x: 1070, z: 180, kick: 300 }], itemEvery: 13,
      items: ['bomb', 'magnet', 'shoes', 'bat', 'banana'],
      hazards: ['wind'], events: ['ufo', 'lowgrav'], rides: [{ kind: 'heli', x: 750, z: 60 }],
    },
  },
  palace: {
    id: 'palace', name: 'Palace Court', feature: 'A tank, a wrecking ball, lots of items',
    stage: {
      launchers: [{ x: 378, z: 265 }, { x: 1122, z: 265 }], itemEvery: 15,
      hazards: ['wrecker'], events: ['ufo', 'ironball', 'bombball'], rides: [{ kind: 'tank', x: 750, z: 300 }],
    },
  },
};

export const DEFAULT_STAGE: StageDef = COURTS.rooftop.stage;

// ---------------------------------------------------------------- teams

export const HOME_TEAM: TeamDef = {
  name: 'Rooftop Rebels',
  short: 'RBL',
  jersey: '#2f7cf6',
  trim: '#ffd23f',
  shorts: '#1b3f8f',
  players: [
    { name: 'Dash', num: 7, speed: 0.75, shoot: 0.7, power: 0.55, jump: 0.7, special: 'comet', defSpecial: 'blitz', skin: '#e9b48a', hair: '#2a1a12', hairStyle: 'spiky', build: 1 },
    { name: 'Mo', num: 23, speed: 0.5, shoot: 0.5, power: 0.85, jump: 0.6, special: 'slam', defSpecial: 'shockwave', skin: '#8d5a3b', hair: '#111111', hairStyle: 'flat', build: 1.15 },
  ],
};

export interface Opponent {
  team: TeamDef;
  difficulty: Difficulty;
  blurb: string;
  court: CourtId;
}

/** In tournament order. */
export const OPPONENTS: Opponent[] = [
  {
    difficulty: 'easy',
    court: 'docks',
    blurb: 'Dock workers. Slow, sloppy, but they hit hard.',
    team: {
      name: 'Harbor Hounds',
      short: 'HHD',
      jersey: '#e8672e',
      trim: '#fff1d6',
      shorts: '#7a2f12',
      players: [
        { name: 'Rusty', num: 4, speed: 0.4, shoot: 0.4, power: 0.7, jump: 0.45, special: 'slam', defSpecial: 'shockwave', skin: '#f0c19c', hair: '#b5532a', hairStyle: 'bald', build: 1.12 },
        { name: 'Pike', num: 11, speed: 0.5, shoot: 0.45, power: 0.55, jump: 0.5, special: 'comet', defSpecial: 'blitz', skin: '#c98e62', hair: '#3b2a1e', hairStyle: 'flat', build: 1 },
      ],
    },
  },
  {
    difficulty: 'normal',
    court: 'arcade',
    blurb: 'Arcade kids. Quick hands, quicker trash talk.',
    team: {
      name: 'Neon Vipers',
      short: 'NVP',
      jersey: '#25c97a',
      trim: '#151515',
      shorts: '#0d5e39',
      players: [
        { name: 'Jinx', num: 3, speed: 0.8, shoot: 0.65, power: 0.45, jump: 0.75, special: 'comet', defSpecial: 'blitz', skin: '#f2c9a5', hair: '#ff3fa4', hairStyle: 'mohawk', build: 0.95 },
        { name: 'Volt', num: 9, speed: 0.65, shoot: 0.6, power: 0.6, jump: 0.65, special: 'slam', defSpecial: 'shockwave', skin: '#6e4630', hair: '#f5e663', hairStyle: 'afro', build: 1.02 },
      ],
    },
  },
  {
    difficulty: 'normal',
    court: 'helipad',
    blurb: 'Stunt flyers. They live above the rim.',
    team: {
      name: 'Sky Pilots',
      short: 'SKY',
      jersey: '#f4f6fb',
      trim: '#2a8fe6',
      shorts: '#27598f',
      players: [
        { name: 'Ace', num: 8, speed: 0.72, shoot: 0.72, power: 0.5, jump: 0.95, special: 'comet', defSpecial: 'blitz', skin: '#c68a5e', hair: '#e8552b', hairStyle: 'spiky', build: 0.98 },
        { name: 'Gale', num: 15, speed: 0.75, shoot: 0.55, power: 0.68, jump: 0.9, special: 'slam', defSpecial: 'shockwave', skin: '#f3d2b3', hair: '#2b2b33', hairStyle: 'bun', build: 1.04 },
      ],
    },
  },
  {
    difficulty: 'hard',
    court: 'palace',
    blurb: 'The undefeated kings of the eastside courts.',
    team: {
      name: 'Iron Monarchs',
      short: 'IRM',
      jersey: '#8b5cf6',
      trim: '#e8c66a',
      shorts: '#3e2479',
      players: [
        { name: 'Rex', num: 1, speed: 0.75, shoot: 0.8, power: 0.75, jump: 0.8, special: 'comet', defSpecial: 'blitz', skin: '#d9a07a', hair: '#d8d8d8', hairStyle: 'bun', build: 1.05 },
        { name: 'Tank', num: 50, speed: 0.55, shoot: 0.55, power: 0.95, jump: 0.7, special: 'slam', defSpecial: 'shockwave', skin: '#5b3a28', hair: '#111111', hairStyle: 'bald', build: 1.2 },
      ],
    },
  },
];

// ---------------------------------------------------------------- upgrades

export interface Upgrade {
  id: 'speed' | 'shoot' | 'chin' | 'hype' | 'jump' | 'hands';
  name: string;
  desc: string;
}

export const UPGRADES: Upgrade[] = [
  { id: 'speed', name: 'QUICK FEET', desc: 'Both players run faster' },
  { id: 'shoot', name: 'SHARPSHOOTER', desc: 'A bigger green zone on every shot' },
  { id: 'chin', name: 'IRON CHIN', desc: 'It takes 4 jabs to knock you down' },
  { id: 'hype', name: 'HYPE MAN', desc: 'Your RIOT meter fills 40% faster' },
  { id: 'jump', name: 'SPRINGS', desc: 'Jump higher for blocks and rebounds' },
  { id: 'hands', name: 'HEAVY HANDS', desc: 'Your jabs knock down in 2 hits' },
];

/** Returns a copy of the team with the given upgrades applied, plus its RIOT-meter rate. */
export function applyUpgrades(team: TeamDef, ids: string[]): { team: TeamDef; hypeRate: number } {
  const has = (id: string) => ids.includes(id);
  const up = (p: PlayerDef): PlayerDef => ({
    ...p,
    speed: p.speed + (has('speed') ? 0.2 : 0),
    shoot: p.shoot + (has('shoot') ? 0.25 : 0),
    jump: p.jump + (has('jump') ? 0.25 : 0),
    tough: has('chin') ? 4 : p.tough,
    heavyHands: has('hands') ? true : p.heavyHands,
  });
  return {
    team: { ...team, players: [up(team.players[0]), up(team.players[1])] },
    hypeRate: has('hype') ? 1.4 : 1,
  };
}
