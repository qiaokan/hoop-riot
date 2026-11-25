export interface PlayerDef {
  name: string;
  num: number;
  /** 0..1 ratings */
  speed: number;
  shoot: number;
  power: number;
  jump: number;
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

export const HOME_TEAM: TeamDef = {
  name: 'Rooftop Rebels',
  short: 'RBL',
  jersey: '#2f7cf6',
  trim: '#ffd23f',
  shorts: '#1b3f8f',
  players: [
    { name: 'Dash', num: 7, speed: 0.75, shoot: 0.7, power: 0.55, jump: 0.7, skin: '#e9b48a', hair: '#2a1a12', hairStyle: 'spiky', build: 1 },
    { name: 'Mo', num: 23, speed: 0.5, shoot: 0.5, power: 0.85, jump: 0.6, skin: '#8d5a3b', hair: '#111111', hairStyle: 'flat', build: 1.15 },
  ],
};

export interface Opponent {
  team: TeamDef;
  difficulty: Difficulty;
  blurb: string;
}

export const OPPONENTS: Opponent[] = [
  {
    difficulty: 'easy',
    blurb: 'Dock workers. Slow, sloppy, but they hit hard.',
    team: {
      name: 'Harbor Hounds',
      short: 'HHD',
      jersey: '#e8672e',
      trim: '#fff1d6',
      shorts: '#7a2f12',
      players: [
        { name: 'Rusty', num: 4, speed: 0.4, shoot: 0.4, power: 0.7, jump: 0.45, skin: '#f0c19c', hair: '#b5532a', hairStyle: 'bald', build: 1.12 },
        { name: 'Pike', num: 11, speed: 0.5, shoot: 0.45, power: 0.55, jump: 0.5, skin: '#c98e62', hair: '#3b2a1e', hairStyle: 'flat', build: 1 },
      ],
    },
  },
  {
    difficulty: 'normal',
    blurb: 'Arcade kids. Quick hands, quicker trash talk.',
    team: {
      name: 'Neon Vipers',
      short: 'NVP',
      jersey: '#25c97a',
      trim: '#151515',
      shorts: '#0d5e39',
      players: [
        { name: 'Jinx', num: 3, speed: 0.8, shoot: 0.65, power: 0.45, jump: 0.75, skin: '#f2c9a5', hair: '#ff3fa4', hairStyle: 'mohawk', build: 0.95 },
        { name: 'Volt', num: 9, speed: 0.65, shoot: 0.6, power: 0.6, jump: 0.65, skin: '#6e4630', hair: '#f5e663', hairStyle: 'afro', build: 1.02 },
      ],
    },
  },
  {
    difficulty: 'hard',
    blurb: 'The undefeated kings of the eastside courts.',
    team: {
      name: 'Iron Monarchs',
      short: 'IRM',
      jersey: '#8b5cf6',
      trim: '#e8c66a',
      shorts: '#3e2479',
      players: [
        { name: 'Rex', num: 1, speed: 0.75, shoot: 0.8, power: 0.75, jump: 0.8, skin: '#d9a07a', hair: '#d8d8d8', hairStyle: 'bun', build: 1.05 },
        { name: 'Tank', num: 50, speed: 0.55, shoot: 0.55, power: 0.95, jump: 0.7, skin: '#5b3a28', hair: '#111111', hairStyle: 'bald', build: 1.2 },
      ],
    },
  },
];
