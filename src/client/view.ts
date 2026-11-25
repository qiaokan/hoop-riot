export const VIEW_W = 960;
export const VIEW_H = 540;
export const FLOOR_TOP = 236;
export const ZS = 0.7;
/** Resolution multiplier for pre-rendered background layers. */
export const LAYER_RES = 2;

export function sy(z: number, y = 0): number {
  return FLOOR_TOP + z * ZS - y;
}
