// World units are roughly screen pixels. x runs along the court (left to right),
// z is depth (0 = far fence, larger = closer to the camera), y is height.

export const DT = 1 / 60;

export const COURT = {
  len: 1500,
  depth: 360,
  minX: 34,
  maxX: 1466,
  minZ: 16,
  maxZ: 344,
  midX: 750,
};

export const HOOP = {
  leftX: 118,
  rightX: 1382,
  z: 180,
  rimY: 150,
  rimR: 17,
};

export const GRAVITY = 1700;
export const JUMP_V = 560;
export const RUN_SPEED = 175;
export const SPRINT_MUL = 1.45;
export const THREE_PT = 340;
export const DUNK_RANGE = 165;
export const DUNK_TIME = 0.55;
export const SHOT_CLOCK = 15;
export const DEFAULT_MATCH_SECONDS = 180;
export const HAND_Y = 36;

export type TeamId = 0 | 1;

/** Team 0 attacks the right hoop, team 1 attacks the left hoop. */
export function attackDir(team: TeamId): 1 | -1 {
  return team === 0 ? 1 : -1;
}
export function attackHoopX(team: TeamId): number {
  return team === 0 ? HOOP.rightX : HOOP.leftX;
}
export function ownHoopX(team: TeamId): number {
  return team === 0 ? HOOP.leftX : HOOP.rightX;
}
