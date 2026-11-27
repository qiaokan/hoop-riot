import type { Player } from '../core/game';
import type { PlayerDef, TeamDef } from '../core/teams';
import { roundRect } from './sprites';
import { sy } from './view';

// Characters are drawn from a pose: where the hips, feet and hands are, how far the body leans,
// how much it squashes. Each game state produces a target pose with wind-up, action and recovery
// phases, and the drawn pose eases toward that target every frame, so moves flow into each other.

export type Mood = 'normal' | 'angry' | 'pain' | 'dizzy' | 'happy' | 'sad' | 'focus' | 'effort'
  | 'shout' | 'grit' | 'shock' | 'smug' | 'tired' | 'aim';

export interface PlayerLook {
  hasBall: boolean;
  mood: Mood;
  /** Jumping for joy after a score or a win. */
  celebrate: boolean;
  label?: string;
  labelColor?: string;
  /** Real seconds since the last frame (for easing). */
  dt: number;
  /** Ball height above this player's feet (drives the dribbling hand). */
  ballH: number;
  /** Direction from this player's head to the ball, in world units (the eyes follow it). */
  gazeX: number;
  gazeY: number;
  /** Holding a throwable item. */
  carrying: boolean;
  /** What this player is riding, if anything. */
  ride?: 'board' | 'tank' | 'heli' | null;
  /** Tip the figure with the ride under it: an angle about a point `py` below the feet. */
  tilt?: { a: number; py: number };
}

interface Pose {
  /** Hip height above the ground and sideways shift. */
  hipH: number; hipX: number;
  /** Front and back foot: x offset and height of the sole above the ground. */
  fFx: number; fFy: number; fBx: number; fBy: number;
  /** Arms: shoulder angle (0 = down, positive = forward and up) and elbow bend. */
  armF: number; elbowF: number; armB: number; elbowB: number;
  /** Torso lean about the hips and head tilt about the neck (positive = forward). */
  lean: number; head: number;
  /** Whole-body rotation (positive = pitching forward) and how far the pivot is lifted. */
  rot: number; rotY: number;
  /** Squash and stretch about the feet. */
  sx: number; sy: number;
  /** Extra hop off the ground (celebrations). */
  hop: number;
}

const KEYS: (keyof Pose)[] = ['hipH', 'hipX', 'fFx', 'fFy', 'fBx', 'fBy', 'armF', 'elbowF', 'armB', 'elbowB', 'lean', 'head', 'rot', 'rotY', 'sx', 'sy', 'hop'];

interface Anim {
  pose: Pose;
  ready: boolean;
  wasAir: boolean;
  /** Seconds left of landing squash. */
  landT: number;
  lastState: string;
  /** Seconds left of the white hit flash. */
  hitT: number;
  lastFacing: number;
  /** Seconds left of the squash when turning around. */
  turnT: number;
  /** Speed of each pose value, for the ones that move on springs (arms, lean, head). */
  vel: Partial<Record<keyof Pose, number>>;
  /** Limp limbs while knocked down. */
  rag: Rag | null;
  /** The body's velocity last frame, to feel its acceleration. */
  pvx: number; pvy: number;
  /** How far the head and torso are thrown back or forward by that acceleration (a spring). */
  sway: number; swayV: number;
  /** Cloth and hair: how far they trail behind the motion (springs), and how far the hems fly up in a fall. */
  cloth: number; clothV: number; hair: number; hairV: number; flare: number;
  /** The last few drawn poses, for the afterimages behind a fast move. */
  ghosts: { P: Pose; x: number; y: number; flip: number; turn: number }[];
  tick: number;
}

/**
 * A knocked-down body is limp: each arm and leg is a pendulum hanging from the shoulder or hip,
 * swung about by the body's own tumbling and by hitting the floor. Angles are on screen, measured
 * from straight down (positive toward the right).
 */
interface Rag {
  th: [number, number, number, number]; // front arm, back arm, front leg, back leg
  w: [number, number, number, number];
}
const anims = new Map<number, Anim>();

/** Where each player's front hand ended up last frame, relative to their feet on screen. */
const hands = new Map<number, { dx: number; dy: number }>();
export function handPos(pid: number): { dx: number; dy: number } | null {
  return hands.get(pid) ?? null;
}

const OUT = '#1b1320';
/** Overall size of a character on screen. */
const S = 1.34;
/** Head offset and radius. The head is deliberately oversized. */
const HX = 1, HR = 15;
/** Thigh and shin length, standing hip height, ankle height. */
const LEG = 13.2, HIP = 27.5, ANKLE = 3.5;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampN = (v: number, m: number) => (v < -m ? -m : v > m ? m : v);
/** Pose values that move on springs. */
const SPRUNG = new Set<keyof Pose>(['armF', 'armB', 'elbowF', 'elbowB', 'lean', 'head']);
/** Height of the body's middle above its feet, in figure units: a tumbling body turns about it. */
const PIVOT = 44;
/** Limb lengths for the limp-body pendulums (figure units), and where each hangs from along the body (up is positive). */
const RAG_L = [20, 20, 25, 25];
const RAG_AT = [21, 21, -16, -16];

/** One step of the limp limbs: gravity, the body's own acceleration and spin, and the floor. */
function ragStep(r: Rag, p: Player, dt: number, ax: number, ay: number) {
  if (dt <= 0) return;
  const G = 1700;
  const air = p.y > 0.5;
  const rot = p.rot;
  const spin = air ? p.spinRate : 0;
  // What the limbs feel is gravity less the body's own acceleration: in free fall, nothing at all.
  const gx0 = -ax, gy0 = (air ? 0 : G) - (air ? 0 : clampN(ay, 3000));
  // Height of the body's middle above the floor (it sinks to the floor as the body tips over flat).
  const mid = p.y / S + PIVOT - (PIVOT - 12) * Math.sin(rot) * Math.sin(rot) * clamp01(1 - p.y / 36);
  const n = 3, h = dt / n;
  for (let i = 0; i < 4; i++) {
    const L = RAG_L[i], at = RAG_AT[i];
    // Spinning flings the limbs outward along the body: shoulders one way, hips the other.
    const gx = gx0 + spin * spin * at * S * Math.sin(rot);
    const gy = gy0 - spin * spin * at * S * Math.cos(rot);
    const pivotH = mid + at * Math.cos(rot);
    for (let k = 0; k < n; k++) {
      const th = r.th[i];
      const acc = (gx * Math.cos(th) - gy * Math.sin(th)) / (L * S) - (air ? 2.2 : 7) * r.w[i];
      r.w[i] = clampN(r.w[i] + acc * h, 40);
      r.th[i] += r.w[i] * h;
      // The floor: a limb cannot hang lower than it.
      const room = (pivotH - 3) / L;
      if (room < 1 && Math.cos(r.th[i]) > room) {
        const lim = Math.acos(Math.max(-1, room));
        const t = Math.atan2(Math.sin(r.th[i]), Math.cos(r.th[i]));
        const side = Math.abs(t) > 0.05 ? Math.sign(t) : (i % 2 === 0 ? 1 : -1) * (i < 2 ? 1 : -1);
        r.th[i] += side * lim - t;
        r.w[i] *= -0.25;
      }
    }
  }
}

/** Turns the limp limbs into a pose in the figure's own frame (which is turned by the body's tumble and flipped by its facing). */
function ragPose(r: Rag, p: Player, P: Pose) {
  const f = p.facing;
  const local = (th: number) => { const a = f * (th + p.rot); return Math.atan2(Math.sin(a), Math.cos(a)); };
  const aF = local(r.th[0]), aB = local(r.th[1]);
  // Legs cannot fold up behind the back: keep them within what a hip allows.
  const lF = clampN(local(r.th[2]) - 0.15, 1.5) + 0.15, lB = clampN(local(r.th[3]) + 0.1, 1.5) - 0.1;
  P.armF = aF; P.armB = aB;
  // At rest on the floor nothing lies dead straight: on the back, one knee comes up and the elbows
  // fold toward the sky; face down, the elbows fold up behind instead.
  const rest = p.y > 0.5 ? 0 : clamp01((p.t - 0.3) / 0.25);
  const faceUp = f * Math.sin(p.rot) < 0;
  const fold = faceUp ? 1 : -1;
  P.elbowF = fold * (0.25 + Math.min(0.9, Math.abs(r.w[0]) * 0.05) + 0.85 * rest);
  P.elbowB = fold * (0.25 + Math.min(0.9, Math.abs(r.w[1]) * 0.05) + 0.4 * rest);
  // A leg swinging fast bends at the knee.
  const reach = (w: number, up: number) => LEG * 2 * (0.96 - Math.min(0.3, Math.abs(w) * 0.02) - up);
  const lf = reach(r.w[2], faceUp ? 0.3 * rest : 0), lb = reach(r.w[3], 0);
  P.hipH = HIP; P.hipX = 0;
  P.fFx = 3 + Math.sin(lF) * lf; P.fFy = HIP - Math.cos(lF) * lf - ANKLE;
  P.fBx = -3 + Math.sin(lB) * lb; P.fBy = HIP - Math.cos(lB) * lb - ANKLE;
  P.lean = 0; P.rot = 0; P.rotY = 0; P.sx = 1; P.sy = 1; P.hop = 0;
  // The head lolls against the spin.
  P.head = clampN(-f * (p.y > 0.5 ? p.spinRate : 0) * 0.045, 0.5);
}

const shades = new Map<string, string>();
/** A colour made darker (k < 1) or lighter (k > 1). Takes "#rrggbb" or "rgb(r,g,b)". */
export function shade(c: string, k: number): string {
  const key = c + k;
  let out = shades.get(key);
  if (out) return out;
  let r: number, g: number, b: number;
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else { const m = c.match(/\d+/g)!; r = +m[0]; g = +m[1]; b = +m[2]; }
  const f = (v: number) => Math.min(255, Math.max(0, Math.round(v * k)));
  out = `rgb(${f(r)},${f(g)},${f(b)})`;
  shades.set(key, out);
  return out;
}

/**
 * Each player's own build, worked out from their stats so no two stand alike: jumpers and
 * sprinters are long in the leg, strong players broad in the shoulder and thick in the limb,
 * heavy ones thick through the middle and a little stooped.
 */
interface Figure { leg: number; chest: number; waist: number; belly: number; limb: number; hunch: number; head: number }
const figures = new Map<PlayerDef, Figure>();
function figureOf(d: PlayerDef): Figure {
  let f = figures.get(d);
  if (!f) {
    const heavy = clamp01((d.build - 1) * 4 + (d.power - 0.7) * 1.2);
    f = {
      leg: Math.min(1.2, Math.max(0.82, 1 + (d.jump - 0.68) * 1.5 + (d.speed - 0.65) * 0.5)),
      chest: d.build * (0.94 + 0.22 * d.power),
      waist: d.build * (0.84 + 0.4 * heavy - 0.12 * d.speed),
      belly: 4.6 * heavy,
      limb: 0.8 + 0.34 * d.power + 0.5 * (d.build - 1),
      hunch: 0.07 * heavy,
      head: 1,
    };
    // Long-legged players carry a smaller head, squat ones a bigger one: it widens the gap in how tall they read.
    f.head = Math.min(1.12, Math.max(0.9, 1.04 - (f.leg - 1) * 0.6));
    figures.set(d, f);
  }
  return f;
}

/** Values for the figure being drawn right now, shared by the drawing helpers. */
const cur = { hair: 0, cloth: 0, flare: 0 };

type Hand = 'fist' | 'open' | 'grip' | 'point';
/** What each hand (front, back) is doing in this move. */
function handsFor(p: Player, look: PlayerLook): [Hand, Hand] {
  switch (p.state) {
    case 'punch': return p.weapon === 'bat' ? ['grip', 'grip'] : ['fist', 'fist'];
    case 'tackle': case 'pound': case 'spray': case 'airkick': return ['fist', 'fist'];
    case 'down': case 'held': case 'stun': case 'beam': return ['open', 'open'];
    case 'shoot': case 'pass': case 'jump': case 'dunk': case 'grab': case 'toss': case 'spin': return ['open', 'open'];
    case 'hang': return ['grip', 'open'];
    case 'ride': return ['grip', 'grip'];
    default: break;
  }
  if (look.celebrate) return p.id % 3 === 2 ? ['point', 'fist'] : ['fist', 'fist'];
  if (look.carrying) return ['grip', 'grip'];
  if (look.hasBall) return ['open', 'open'];
  return Math.hypot(p.vx, p.vz) < 25 ? ['open', 'open'] : ['fist', 'fist'];
}

// ---------------------------------------------------------------- poses

function celebrate(P: Pose, p: Player, time: number) {
  const k = Math.sin(time * 9 + p.id * 1.7);
  switch (p.id % 3) {
    case 0: // Jumping fist pumps.
      P.armF = 2.45 + 0.3 * k; P.armB = 2.35 - 0.3 * k; P.elbowF = 0.25; P.elbowB = 0.25;
      P.hop = Math.abs(k) * 10; P.lean = -0.05;
      break;
    case 1: // Both fists shaking overhead (kept clear of the face).
      P.armF = 2.5 + 0.12 * k; P.elbowF = 0.45; P.armB = 2.3 - 0.12 * k; P.elbowB = 0.6;
      P.lean = -0.12; P.head = -0.12; P.hipH = HIP - 1 + Math.abs(k) * 1.5; P.fFx = 7; P.fBx = -7;
      break;
    default: // Pointing at the sky, other hand on the hip.
      P.armF = 2.6; P.elbowF = 0; P.armB = 0.5; P.elbowB = 1.7;
      P.lean = -0.14; P.head = -0.2; P.hop = Math.max(0, k) * 6;
  }
}

/** The pose this player is heading for right now, and how fast to ease toward it. */
function targetPose(p: Player, look: PlayerLook, time: number): { pose: Pose; rate: number } {
  const P: Pose = {
    hipH: HIP, hipX: 0, fFx: 5, fFy: 0, fBx: -5, fBy: 0,
    armF: 0.2, elbowF: 0.5, armB: -0.2, elbowB: 0.5,
    lean: 0.06, head: 0, rot: 0, rotY: 0, sx: 1, sy: 1, hop: 0,
  };
  let rate = 22;
  const air = p.y > 1;
  const speed = Math.hypot(p.vx, p.vz);
  const t = p.t;
  const breathe = Math.sin(time * 3 + p.id * 1.3);

  if (air) {
    // Tuck the legs near the top of a jump, stretch them out when moving fast.
    const k = 1 - clamp01(Math.abs(p.vy) / 500);
    P.fFx = 4 + 6 * k; P.fFy = 12 * k; P.fBx = -5 - 3 * k; P.fBy = 2 + 8 * k;
    P.hipH = HIP + 0.5; P.lean = 0.02;
    P.armF = 2.3; P.armB = 2.1; P.elbowF = 0.2; P.elbowB = 0.2;
  } else {
    const r = clamp01(speed / 170), s = clamp01((speed - 200) / 60);
    if (r > 0.12) {
      // Run cycle: long strides, the forward foot lifts high, the trailing foot kicks up when
      // sprinting, the body bounces and the arms pump. Not eased, so nothing lags the feet.
      rate = 70;
      const ph = p.anim * 0.085;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const stride = 8 + 5 * r + 3 * s, lift = 5 + 5 * r + 3 * s;
      P.fFx = sn * stride + 2; P.fFy = Math.max(0, cs) * lift + Math.max(0, -sn) * 4 * s;
      P.fBx = -sn * stride - 2; P.fBy = Math.max(0, -cs) * lift + Math.max(0, sn) * 4 * s;
      P.hipH = HIP - 2.4 - 1.4 * r;
      P.hop = Math.abs(cs) * 2.4 * r;
      P.lean = 0.12 + 0.2 * r + 0.18 * s;
      const sw = 0.95 + 0.35 * s;
      P.armF = -sn * sw + 0.15; P.armB = sn * sw + 0.15;
      P.elbowF = 1.45; P.elbowB = 1.45;
      P.head = -0.1 * r;
    } else {
      P.hipH += breathe * 0.4;
      P.armF += breathe * 0.04; P.armB -= breathe * 0.04;
    }
  }

  switch (p.state) {
    case 'move':
      if (air) break;
      if (look.celebrate) celebrate(P, p, time);
      else if (look.mood === 'sad') {
        P.head = 0.45; P.lean = 0.2; P.armF = 0.05; P.armB = -0.05; P.elbowF = 0.1; P.elbowB = 0.1; P.hipH = HIP - 0.8;
      } else if (look.hasBall) {
        // The dribbling hand rides the ball up and down.
        const k = clamp01((look.ballH - 6) / 30);
        P.armF = 0.85 - 0.35 * k; P.elbowF = 0.15 + 1.25 * k;
        P.lean += 0.1; P.hipH -= 1.2;
      } else if (look.carrying) {
        P.armF = 1.0; P.elbowF = 1.3; P.armB = 0.8; P.elbowB = 1.4;
      } else if (speed < 25) {
        // Ready stance: knees bent, hands up.
        P.hipH = HIP - 3.6 + breathe * 0.5; P.fFx = 9; P.fBx = -9;
        P.hop = Math.abs(Math.sin(time * 5 + p.id)) * 1.3;
        P.armF = 1.1; P.elbowF = 1.0; P.armB = 0.6; P.elbowB = 1.2; P.lean = 0.14;
      }
      break;
    case 'jump':
      if (p.launched) {
        // Flailing through the air off a launch pad.
        const f = Math.sin(time * 22 + p.id), c = Math.cos(time * 22 + p.id);
        P.armF = 2.6 + f * 0.6; P.armB = 2.6 - f * 0.6; P.elbowF = 0.2; P.elbowB = 0.2;
        P.fFx = 4 + f * 6; P.fFy = 6 + c * 3; P.fBx = -4 - f * 6; P.fBy = 5 - c * 3;
      } else {
        // Three poses blended by how fast the jumper is rising or falling. Going up: arms thrown high,
        // back arched, legs trailing. Over the top: knees tucked. Coming down: arms out for balance,
        // legs reaching for the floor.
        const up = clamp01(p.vy / 380), fall = clamp01(-p.vy / 380), top = Math.max(0, 1 - up - fall);
        P.armF = 2.75 - 1.15 * fall; P.armB = 2.5 - 1.4 * fall; P.elbowF = 0.1 + 0.55 * fall; P.elbowB = 0.15 + 0.5 * fall;
        P.head = -0.2 * up + 0.14 * fall; P.lean = -0.12 * up + 0.12 * fall;
        P.fFx = 3 * up + 9 * top + 7 * fall; P.fFy = 2 * up + 13 * top + 1 * fall;
        P.fBx = -8 * up - 7 * top - 3 * fall; P.fBy = 6 * up + 9 * top + 2 * fall;
      }
      break;
    case 'shoot':
      if (!p.released && t < 0.09) {
        // Gather: the ball comes up through the chest, knees still loaded.
        rate = 40;
        P.armF = 1.2; P.elbowF = 1.4; P.armB = 0.95; P.elbowB = 1.55; P.lean = 0.14; P.head = 0.06; P.hipH = HIP - 2;
      } else if (!p.released) {
        // Ball set overhead, elbows bent.
        P.armF = 2.45; P.elbowF = 0.25; P.armB = 2.3; P.elbowB = 0.3; P.lean = -0.06; P.head = -0.12;
      } else {
        // Follow-through: shooting arm extended toward the rim.
        P.armF = 2.15; P.elbowF = -0.2; P.armB = 1.3; P.elbowB = 0.6; P.lean = 0.08;
      }
      break;
    case 'punch':
      rate = 55;
      if (p.weapon === 'bat') {
        // Two-handed swing: cocked back over the shoulder, then all the way through.
        if (t < 0.1) {
          P.armF = 2.9; P.elbowF = 0.9; P.armB = 2.6; P.elbowB = 1.1; P.lean = -0.22; P.hipX = -3; P.fFx = 8; P.fBx = -8; P.hipH = HIP - 3;
        } else if (t < 0.26) {
          P.armF = 1.5; P.elbowF = 0; P.armB = 1.3; P.elbowB = 0.2; P.lean = 0.42; P.hipX = 7; P.fFx = 13; P.fBx = -8; P.hipH = HIP - 3; P.head = 0.05;
        } else {
          P.armF = 0.6; P.elbowF = 0.4; P.armB = 0.5; P.elbowB = 0.5; P.lean = 0.25; P.fFx = 10;
        }
      } else if (p.combo >= 2) {
        // Finisher: sink down and load up, then drive an uppercut through the target.
        if (t < 0.09) {
          P.hipH = HIP - 6; P.lean = 0.3; P.armF = -0.5; P.elbowF = 1.3; P.armB = 0.9; P.elbowB = 1.4; P.fFx = 9; P.fBx = -8; P.head = 0.15;
        } else if (t < 0.24) {
          P.hipH = HIP + 0.5; P.hop = 7; P.lean = -0.22; P.head = -0.2; P.hipX = 6;
          P.armF = 2.35; P.elbowF = 0.5; P.armB = -0.7; P.elbowB = 1.2; P.fFx = 10; P.fFy = 3; P.fBx = -6;
        } else {
          P.armF = 1.6; P.elbowF = 0.9; P.lean = 0.05; P.fFx = 8;
        }
      } else if (p.combo === 1) {
        // Cross: the back hand comes through as the shoulders turn.
        if (t < 0.05) {
          P.armB = -0.6; P.elbowB = 1.8; P.armF = 0.9; P.elbowF = 1.4; P.lean = 0.05; P.hipX = 1;
        } else if (t < 0.16) {
          P.armB = 1.6; P.elbowB = 0; P.armF = -0.4; P.elbowF = 1.7; P.lean = 0.36; P.hipX = 6;
          P.fFx = 12; P.fBx = -8; P.hipH = HIP - 2.5; P.head = 0.08;
        } else {
          P.armB = 1.0; P.elbowB = 0.9; P.armF = 0.6; P.elbowF = 1.3; P.lean = 0.16; P.fFx = 9;
        }
      } else if (t < 0.05) {
        // Jab wind-up: fist cocked, weight back.
        P.armF = -0.7; P.elbowF = 1.9; P.lean = -0.14; P.hipX = -2; P.armB = 0.9; P.elbowB = 1.3;
      } else if (t < 0.16) {
        // Jab: arm straight out, body lunging in behind it.
        P.armF = 1.58; P.elbowF = 0; P.lean = 0.3; P.hipX = 4; P.fFx = 11; P.fBx = -7;
        P.armB = -0.5; P.elbowB = 1.4; P.hipH = HIP - 2; P.head = 0.05;
      } else {
        P.armF = 1.0; P.elbowF = 0.9; P.lean = 0.14; P.fFx = 8;
      }
      break;
    case 'stun': {
      // Recoil: head snaps back, arms fly, body shakes.
      rate = 40;
      const k = Math.max(0, 1 - t / p.stunFor);
      // Reel away from the blow: backward when hit from the front, forward when hit from behind.
      const way = p.vx * p.facing <= 0 ? 1 : -1;
      P.lean = (-0.42 * k - 0.05) * way; P.head = -0.45 * k * way;
      P.armF = -0.9; P.elbowF = 0.4; P.armB = -1.3; P.elbowB = 0.3;
      P.fFx = 9; P.fFy = 3 * k; P.fBx = -3; P.hipH = HIP - 1;
      P.sx = 1 - 0.08 * k; P.sy = 1 + 0.05 * k;
      P.hipX = Math.sin(t * 70) * 1.5 * k;
      break;
    }
    case 'down': {
      // Flying and lying are limp-limb physics (see ragStep). What is posed is the push back up:
      // the body's turn unwinds while the legs fold under and the arms push off the floor.
      rate = 30;
      const u = clamp01((t - (p.downFor - 0.28)) / 0.28);
      P.hipH = HIP - 9 + 9 * u; P.lean = 0.55 * (1 - u); P.head = 0.3 * (1 - u);
      P.armF = 0.7 - 0.4 * u; P.armB = 0.4 - 0.4 * u; P.elbowF = 0.9 * (1 - u) + 0.3; P.elbowB = 0.9 * (1 - u) + 0.3;
      P.fFx = 8; P.fBx = -6;
      break;
    }
    case 'tackle':
      // Full-length dive; flatter once it has hit or missed and is sliding.
      rate = 45;
      P.rot = t < 0.3 && !p.punchHit ? 1.2 : 1.42; P.rotY = 13;
      P.armF = 2.75; P.elbowF = 0; P.armB = 2.5; P.elbowB = 0.1;
      P.fFx = -2; P.fFy = 1; P.fBx = -6; P.fBy = 3; P.hipH = HIP - 1.5; P.lean = 0.1; P.head = -0.5;
      break;
    case 'airkick':
      rate = 55;
      if (t < 0.06) {
        // Chamber: knee pulled up to the chest, body coiled.
        P.rot = -0.2; P.fFx = 9; P.fFy = 18; P.fBx = -3; P.fBy = 10;
        P.armF = 0.9; P.elbowF = 1.3; P.armB = 0.6; P.elbowB = 1.4; P.lean = 0.2;
      } else {
        // Snap: the leg fires straight out, the body thrown back behind it.
        P.rot = -0.55;
        P.fFx = 22; P.fFy = 12; P.fBx = -5; P.fBy = 12;
        P.armF = -0.8; P.elbowF = 0.6; P.armB = 1.3; P.elbowB = 0.8; P.lean = -0.1;
      }
      break;
    case 'spin':
      P.armF = 1.57; P.armB = -1.57; P.elbowF = 0; P.elbowB = 0; P.hipH = HIP - 3; P.fFx = 7; P.fBx = -7;
      break;
    case 'grab':
      // Both hands on the opponent's collar; a knee strike drives the front knee up into them.
      rate = 45;
      P.armF = 1.5; P.elbowF = 0.3; P.armB = 1.35; P.elbowB = 0.45; P.lean = 0.2; P.hipH = HIP - 1.5; P.fFx = 8; P.fBx = -8;
      if (p.kneeT > 0) { P.fFx = 17; P.fFy = 17; P.lean = -0.16; P.hipX = 4; P.hop = 4; P.head = -0.1; P.armF = 1.2; P.armB = 1.1; }
      break;
    case 'held':
      rate = 45;
      if (p.y > 4) {
        // Being swung through the air: limbs trailing.
        P.armF = 2.6; P.elbowF = 0.2; P.armB = 2.9; P.elbowB = 0.2; P.fFx = 7; P.fFy = 6; P.fBx = -6; P.fBy = 4; P.lean = -0.1; P.head = -0.2;
      } else {
        // Hunched over in the hold, struggling; doubles up when kneed.
        P.lean = 0.42; P.head = 0.3; P.hipH = HIP - 3; P.armF = 0.5; P.elbowF = 1.2; P.armB = -0.3; P.elbowB = 0.9;
        P.fFx = 6; P.fBx = -7; P.hipX = Math.sin(time * 28 + p.id) * 1.4;
        if (p.flinch > 0) { P.lean = 0.75; P.head = 0.55; P.hop = 9; P.hipH = HIP - 5; P.fFy = 4; P.fBy = 5; P.armF = 1.1; P.armB = 0.9; }
      }
      break;
    case 'toss': {
      // The throw: hoist the opponent overhead, then heave them away with the whole body.
      rate = 50;
      const fwd = p.tossDir === p.facing;
      const T = fwd ? 0.3 : 0.26;
      if (t < T * 0.65) {
        // Lifting: knees bent, back arched, arms carrying the weight up and over.
        P.armF = 2.9; P.elbowF = 0.15; P.armB = 2.75; P.elbowB = 0.2; P.lean = -0.3; P.hipH = HIP - 4; P.fFx = 9; P.fBx = -9; P.head = -0.25;
      } else if (fwd) {
        // Whipping forward: big step, arms driving through.
        P.armF = 1.75; P.elbowF = 0; P.armB = 1.6; P.elbowB = 0.1; P.lean = 0.5; P.hipH = HIP - 4; P.hipX = 7; P.fFx = 15; P.fBx = -10; P.head = 0.1;
        if (t > T) { P.armF = 1.3; P.armB = 1.1; P.lean = 0.55; }
      } else {
        // Throwing behind: arching all the way back, arms going over the head.
        P.armF = 3.6; P.elbowF = 0.1; P.armB = 3.5; P.elbowB = 0.1; P.lean = -0.6; P.hipH = HIP - 3; P.hipX = -5; P.fFx = 8; P.fBx = -9; P.head = -0.45;
        if (t > T) { P.lean = -0.3; P.armF = 3.2; P.armB = 3.1; }
      }
      break;
    }
    case 'pound':
      // Hammer: hauled up overhead with a little hop, then brought down with the whole body.
      rate = 50;
      if (t < 0.22) {
        P.armF = 3.15; P.elbowF = 0.2; P.armB = 3.0; P.elbowB = 0.25; P.lean = -0.28; P.hop = 6; P.head = -0.2; P.fFx = 7; P.fBx = -7;
      } else {
        P.armF = 1.05; P.elbowF = 0; P.armB = 0.95; P.elbowB = 0.1; P.lean = 0.6; P.hipH = HIP - 7; P.fFx = 12; P.fBx = -9; P.head = 0.2; P.hipX = 4;
      }
      break;
    case 'spray':
      // Braced against the kick of the extinguisher.
      rate = 45;
      P.armF = 1.5; P.elbowF = 0.1; P.armB = 1.25; P.elbowB = 0.6; P.lean = -0.14; P.hipH = HIP - 2.5; P.fFx = 9; P.fBx = -10;
      P.hipX = Math.sin(time * 60) * 1.2;
      break;
    case 'ride':
      rate = 30;
      P.fFy = 0; P.fBy = 0; P.head = 0; P.hop = 0;
      if (look.ride === 'tank') {
        // Standing in the hatch.
        P.hipH = HIP; P.fFx = 4; P.fBx = -4; P.armF = 1.3; P.elbowF = 0.6; P.armB = 0.9; P.elbowB = 0.9; P.lean = 0.1;
        if (look.hasBall) { P.armF = 1.6; P.elbowF = 0.9; }
      } else if (look.ride === 'heli') {
        // Sitting in the tub, hands on the stick.
        P.hipH = HIP - 9; P.fFx = 14; P.fFy = 6; P.fBx = 10; P.fBy = 5; P.armF = 1.35; P.elbowF = 0.5; P.armB = 1.2; P.elbowB = 0.6;
        P.lean = -0.06 + clamp01(speed / 230) * 0.2;
      } else {
        // Skateboard: low, feet wide, arms out for balance.
        const lean = clamp01(speed / 340);
        P.hipH = HIP - 4.5 - 2 * lean; P.fFx = 11; P.fBx = -11; P.lean = 0.12 + 0.3 * lean;
        P.armF = 1.25; P.elbowF = 0.3; P.armB = -1.0 - 0.3 * lean; P.elbowB = 0.3;
        if (look.hasBall) { P.armF = 0.9; P.elbowF = 0.9; }
      }
      break;
    case 'beam': {
      // Hauled up by the saucer: limp, limbs dangling, slowly turning.
      const f = Math.sin(time * 9 + p.id);
      P.armF = 2.7 + f * 0.4; P.elbowF = 0.3; P.armB = 2.9 - f * 0.4; P.elbowB = 0.3;
      P.fFx = 3 + f * 3; P.fFy = 1; P.fBx = -3 - f * 3; P.fBy = 2; P.lean = -0.05; P.head = -0.3;
      P.rot = Math.sin(time * 4 + p.id) * 0.3; P.rotY = 40;
      break;
    }
    case 'pass':
      // Chest pass: both arms thrust forward, a step into it.
      rate = 60;
      if (t < 0.045) {
        // Gather at the chest, weight back.
        P.armF = 1.15; P.elbowF = 1.5; P.armB = 0.95; P.elbowB = 1.6; P.lean = -0.04; P.hipX = -2;
      } else if (t < 0.11) {
        // Snap: both arms shoot out, a step into it.
        P.armF = 1.6; P.elbowF = 0; P.armB = 1.45; P.elbowB = 0.05; P.lean = 0.3; P.fFx = 11; P.hipX = 3; P.head = 0.05;
      } else {
        // Follow-through: hands drop, palms out.
        P.armF = 1.3; P.elbowF = 0.15; P.armB = 1.15; P.elbowB = 0.2; P.lean = 0.24; P.fFx = 10;
      }
      break;
    case 'dunk': {
      rate = 40;
      const u = p.dunk ? clamp01(t / p.dunk.T) : 1;
      if (u < 0.72) {
        // Ball cocked back behind the head, legs trailing.
        P.armF = 3.5; P.elbowF = 0.5; P.armB = 0.9; P.elbowB = 0.8; P.lean = -0.3; P.head = -0.25;
        P.fFx = -3; P.fFy = 9; P.fBx = -9; P.fBy = 6;
      } else {
        // Slamming it down.
        P.armF = 1.9; P.elbowF = 0; P.armB = 1.2; P.elbowB = 0.5; P.lean = 0.35; P.head = 0.15;
        P.fFx = 10; P.fFy = 7; P.fBx = 2; P.fBy = 4;
      }
      break;
    }
    case 'hang': {
      // Hanging off the rim, legs swinging.
      const sw = Math.sin(t * 16) * 5;
      P.armF = 3.0; P.elbowF = 0.1; P.armB = 2.9; P.elbowB = 0.1;
      P.fFx = 3 + sw; P.fFy = 3; P.fBx = -3 + sw; P.fBy = 2; P.lean = -0.05 + sw * 0.012;
      break;
    }
  }
  return { pose: P, rate };
}

// ---------------------------------------------------------------- drawing

function strokePath(ctx: CanvasRenderingContext2D, pts: number[], w: number, color: string) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/** One segment of a limb, lit from the front: a darker edge behind, the full colour toward the light. */
function limb(ctx: CanvasRenderingContext2D, pts: number[], w: number, color: string) {
  strokePath(ctx, pts, w, shade(color, 0.76));
  ctx.save();
  ctx.translate(0.75, -0.55);
  strokePath(ctx, pts, w * 0.66, color);
  ctx.restore();
}

/** A leg from the hip to a foot target. The knee position is solved so the foot lands where asked. */
function leg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, soleY: number, thigh: string, shin: string, shoe: string, trim: string, len = LEG, w = 1) {
  let fy = -soleY - ANKLE;
  let dx = fx - hx, dy = fy - hy;
  let dist = Math.hypot(dx, dy);
  const max = len * 2 - 0.2;
  if (dist > max) { fx = hx + (dx / dist) * max; fy = hy + (dy / dist) * max; dx = fx - hx; dy = fy - hy; dist = max; }
  if (dist < 1) dist = 1;
  const h = Math.sqrt(Math.max(0, len * len - (dist / 2) * (dist / 2)));
  // The knee always bends forward.
  let nx = dy / dist, ny = -dx / dist;
  if (nx < 0) { nx = -nx; ny = -ny; }
  const kx = hx + dx / 2 + nx * h, ky = hy + dy / 2 + ny * h;
  // Outline first: a thick thigh, a calf that swells below the knee and narrows to the ankle.
  const cx = kx + (fx - kx) * 0.32, cy = ky + (fy - ky) * 0.32;
  strokePath(ctx, [hx, hy, kx, ky], 9.8 * w + 2.6, OUT);
  strokePath(ctx, [kx, ky, fx, fy], 6.6 * w + 2.6, OUT);
  strokePath(ctx, [kx, ky, cx, cy], 8.6 * w + 2.6, OUT);
  limb(ctx, [kx, ky, fx, fy], 6.6 * w, shin);
  limb(ctx, [kx, ky, cx, cy], 8.6 * w, shin);
  // Sock.
  strokePath(ctx, [kx + (fx - kx) * 0.62, ky + (fy - ky) * 0.62, fx, fy], 6.6 * w, shoe);
  // The leg of the shorts covers the thigh.
  limb(ctx, [hx, hy, kx, ky], 9.8 * w, thigh);
  // Shoe: a high-top with a dark sole and a toe cap. The toes dip when the foot is off the ground.
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(Math.min(0.7, soleY * 0.07));
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = OUT;
  ctx.lineJoin = 'round';
  ctx.fillStyle = shoe;
  ctx.beginPath();
  ctx.moveTo(-4.8, 3.6); ctx.lineTo(-4.8, -3.4); ctx.quadraticCurveTo(-1, -5.4, 3, -3.2);
  ctx.lineTo(8.4, -1.4); ctx.quadraticCurveTo(11.4, 0.4, 10.4, 3.6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2533';
  ctx.fillRect(-4.6, 1.9, 15, 1.9);
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.moveTo(-0.6, -3.6); ctx.lineTo(2.2, -3); ctx.lineTo(0.6, 1.8); ctx.lineTo(-2.2, 1.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(7.4, -0.2, 1.8, 0.9, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A hand at the end of a forearm pointing along `dir` (0 = down, positive = forward). */
function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, hand: Hand, skin: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-dir); // local +y now runs along the forearm, out past the wrist
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = OUT;
  ctx.lineJoin = 'round';
  ctx.fillStyle = skin;
  if (hand === 'open') {
    // Thumb first (it sits behind the palm), then a palm with the fingers spread a little.
    ctx.beginPath(); ctx.ellipse(4.3, 2.2, 1.7, 3.1, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3.6, -1.5); ctx.lineTo(3.6, -1.5); ctx.lineTo(4.2, 8.6);
    ctx.quadraticCurveTo(0, 10.8, -4.2, 8.6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const fx of [-1.5, 0.3, 2.1]) { ctx.moveTo(fx, 4.6); ctx.lineTo(fx * 1.15, 9.2); }
    ctx.stroke();
  } else {
    if (hand === 'point') {
      ctx.beginPath(); roundRect(ctx, -1.3, 3, 2.6, 8.2, 1.2); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 1.2, hand === 'grip' ? 5 : 5.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Knuckles across the front, thumb folded over the side.
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, 3.6); ctx.quadraticCurveTo(0, 5.2, 3, 3.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2.2, -1.8); ctx.quadraticCurveTo(4.6, 0.6, 2.4, 2.6); ctx.stroke();
  }
  ctx.restore();
}

/** An arm from the shoulder: upper arm at `ang`, forearm bent by `elbow`, ending in a hand. */
function arm(ctx: CanvasRenderingContext2D, x0: number, y0: number, ang: number, elbow: number, skin: string, band: string, hand: Hand = 'fist', w = 1) {
  // Arms stretch when raised, cartoon-style, so the hands clear the oversized head.
  const L = 10 * (1 + 0.7 * clamp01((ang - 1.7) / 0.8) + 0.65 * clamp01((ang - 2.7) / 0.4));
  const kx = x0 + Math.sin(ang) * L, ky = y0 + Math.cos(ang) * L;
  const a2 = ang + elbow;
  const ex = kx + Math.sin(a2) * L, ey = ky + Math.cos(a2) * L;
  // A shoulder and upper arm with some muscle on them, a slimmer forearm.
  strokePath(ctx, [x0, y0, kx, ky], 7.8 * w + 2.6, OUT);
  strokePath(ctx, [kx, ky, ex, ey], 6 * w + 2.6, OUT);
  limb(ctx, [kx, ky, ex, ey], 6 * w, skin);
  limb(ctx, [x0, y0, kx, ky], 7.8 * w, skin);
  // Wristband.
  strokePath(ctx, [kx + (ex - kx) * 0.6, ky + (ey - ky) * 0.6, kx + (ex - kx) * 0.82, ky + (ey - ky) * 0.82], 6.4 * w, band);
  drawHand(ctx, ex, ey, a2, hand, skin);
  return [ex, ey] as const;
}

/** Draws the figure with its feet at the origin. `base` is the transform at the feet, used to report the hand position. */
function body(ctx: CanvasRenderingContext2D, p: Player, team: TeamDef, P: Pose, look: PlayerLook, time: number, flip: number, base: DOMMatrix | null, turn: number) {
  const d = p.def;
  const fig = figureOf(d);
  const [handF, handB] = handsFor(p, look);
  const sw = 11 * fig.chest, ww = 11 * fig.waist;
  const shX = Math.min(5.5, sw * 0.3); // how far the shoulders sit either side of the spine, seen side-on
  const skin = d.skin;
  const dir = Math.sign(flip) || 1;
  ctx.save();
  // Swung in a throw or spinning through the air: turn the whole figure about its middle.
  if (turn) {
    ctx.translate(0, -PIVOT * S);
    ctx.rotate(turn);
    ctx.translate(0, PIVOT * S);
  }
  ctx.scale(flip * S * P.sx, S * P.sy);
  if (P.rot || P.rotY) { ctx.translate(0, -P.rotY); ctx.rotate(P.rot); }
  if (p.invuln > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha *= 0.5;

  const hipY = -P.hipH * fig.leg;
  const upper = (fn: () => void) => {
    ctx.save();
    ctx.translate(P.hipX, hipY);
    ctx.rotate(P.lean + fig.hunch);
    fn();
    ctx.restore();
  };

  // Back arm, behind everything.
  upper(() => arm(ctx, -shX, -21, P.armB, P.elbowB, shade(skin, 0.7), shade(team.trim, 0.7), handB, fig.limb * 0.95));
  // Legs.
  leg(ctx, P.hipX - 3, hipY, P.fBx, P.fBy, shade(team.shorts, 0.72), shade(skin, 0.8), '#cfcfd6', shade(team.trim, 0.8), LEG * fig.leg, fig.limb);
  leg(ctx, P.hipX + 3, hipY, P.fFx, P.fFy, team.shorts, skin, '#ffffff', team.trim, LEG * fig.leg, fig.limb);

  upper(() => {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = OUT;
    ctx.lineJoin = 'round';
    // Shorts: cut wide. The hem swings behind the motion and flies up in a fall.
    const hem = cur.cloth * 3, fl = 1 + cur.flare * 0.12, hy0 = 5 - cur.flare * 1.6;
    ctx.fillStyle = team.shorts;
    ctx.beginPath();
    ctx.moveTo(-ww + 0.5, -7.5); ctx.lineTo(ww - 0.5, -7.5);
    ctx.lineTo((ww + 1) * fl + hem, hy0); ctx.lineTo((-ww - 1) * fl + hem * 1.3, hy0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = team.trim;
    ctx.fillRect(2.5 + hem * 0.5, -4.5, 2.6, hy0 - 1 + 4.5);
    // Jersey: broad at the shoulder, cut to this player's waist, lit from the front. Its tail lifts and trails.
    const lit = ctx.createLinearGradient(-sw, 0, sw, 0);
    lit.addColorStop(0, shade(team.jersey, 0.64)); lit.addColorStop(0.5, team.jersey); lit.addColorStop(1, shade(team.jersey, 1.15));
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.moveTo(-sw + 4, -28); ctx.lineTo(sw - 4, -28);
    ctx.quadraticCurveTo(sw + 0.5, -27.5, sw, -22.5);
    ctx.quadraticCurveTo((sw + ww) / 2 + fig.belly, -13, ww, -5);
    ctx.lineTo(-ww + hem * 0.9, -4.6 - Math.abs(cur.cloth) * 0.9);
    ctx.quadraticCurveTo(-(sw + ww) / 2 - 0.5, -14, -sw, -22.5);
    ctx.quadraticCurveTo(-sw - 0.5, -27.5, -sw + 4, -28);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // The jersey's shadow on the shorts.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-ww + 1.2, -4.6, ww * 2 - 2.4, 1.8);
    // Neckline.
    ctx.fillStyle = team.trim;
    ctx.beginPath(); ctx.moveTo(-5, -28); ctx.lineTo(8, -28); ctx.lineTo(3, -23.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(skin, 0.86);
    ctx.beginPath(); ctx.moveTo(-3, -28); ctx.lineTo(6.4, -28); ctx.lineTo(2.8, -24.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = team.trim;
    ctx.fillRect(-ww + 0.9, -7, ww * 2 - 1.8, 2.4);
    ctx.save();
    ctx.scale(dir, 1);
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(d.num), 0.5 * dir, -11);
    ctx.restore();

    // Shadow the head casts on the chest.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(HX + 1, -26.6, 9.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    // Head, tilting at the neck.
    const head = () => {
      ctx.save();
      ctx.translate(HX, -27);
      ctx.rotate(P.head);
      ctx.scale(fig.head, fig.head);
      ctx.translate(-HX, 27);
      drawHead(ctx, p, team, look, -40, time, dir);
      ctx.restore();

    };
    // A raised arm goes behind the head, so it never covers the face.
    const raised = P.armF > 2.05;
    const frontArm = () => {
      const [ex, ey] = arm(ctx, shX, -21, P.armF, P.elbowF, skin, team.trim, handF, fig.limb);
      if (base) {
        const q = base.inverse().transformPoint(ctx.getTransform().transformPoint(new DOMPoint(ex, ey)));
        hands.set(p.id, { dx: q.x, dy: q.y });
      }
    };
    if (raised) frontArm();
    head();

    // Motion smear behind a punch as it lands.
    const fin = p.combo >= 2;
    if (p.state === 'punch' && p.t > (fin ? 0.08 : 0.04) && p.t < (fin ? 0.2 : 0.13)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = fin ? 5 : 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (fin) ctx.arc(4, -18, 27, -1.9, 0.5); // rising arc of the uppercut
      else ctx.arc(3, -21, 22, -1.35, 0.12);
      ctx.stroke();
    }
    // Front arm on top.
    if (!raised) frontArm();
  });

  // Kick smear.
  if (p.state === 'airkick' && p.t < 0.12) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(3, hipY, 22, 0.15, 1.2); ctx.stroke();
  }
  ctx.restore();
}

let flashCv: HTMLCanvasElement | null = null;

export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, team: TeamDef, sx: number, time: number, look: PlayerLook) {
  let a = anims.get(p.id);
  if (!a) {
    a = { pose: targetPose(p, look, time).pose, ready: false, wasAir: false, landT: 0, lastState: p.state, hitT: 0, lastFacing: p.facing, turnT: 0, vel: {}, rag: null, pvx: p.vx, pvy: p.vy, sway: 0, swayV: 0, cloth: 0, clothV: 0, hair: 0, hairV: 0, flare: 0, ghosts: [], tick: 0 };
    anims.set(p.id, a);
  }
  // Ease the drawn pose toward the target.
  const { pose: T, rate } = targetPose(p, look, time);
  const dt = Math.min(look.dt, 1 / 30);
  const k = a.ready ? 1 - Math.exp(-rate * look.dt) : 1;
  // Arms, lean and head move on springs, so they overshoot a little and settle (follow-through).
  // Feet and hips ease straight to their target so they never slide; so does everything in a fast cycle.
  const springy = a.ready && rate < 60 && dt > 0;
  for (const key of KEYS) {
    if (springy && SPRUNG.has(key)) {
      const w0 = Math.min(rate * 0.85, 0.9 / dt);
      const v = (a.vel[key] ?? 0) + (-2 * 0.52 * w0 * (a.vel[key] ?? 0) - w0 * w0 * (a.pose[key] - T[key])) * dt;
      a.vel[key] = v;
      a.pose[key] += v * dt;
    } else {
      a.pose[key] += (T[key] - a.pose[key]) * k;
      a.vel[key] = 0;
    }
  }
  a.ready = true;

  // The body's acceleration, on screen (y down).
  const ax = dt > 0 ? clampN((p.vx - a.pvx) / dt, 5000) : 0;
  const ay = dt > 0 ? clampN(-(p.vy - a.pvy) / dt, 5000) : 0;
  a.pvx = p.vx; a.pvy = p.vy;
  // Weight shift: setting off throws the head and chest back, stopping pitches them forward.
  if (dt > 0) {
    const want = clampN(-ax * p.facing * 0.00022, 0.32);
    a.swayV += (-2 * 0.45 * 16 * a.swayV - 16 * 16 * (a.sway - want)) * dt;
    a.sway = clampN(a.sway + a.swayV * dt, 0.45);
    // Shorts, jersey tail, hair and headband trail behind the motion and bounce back when it stops or turns.
    const fwd = p.vx * p.facing;
    a.clothV += (-2 * 0.3 * 13 * a.clothV - 13 * 13 * (a.cloth - clampN(-fwd / 230, 1.2))) * dt;
    a.cloth = clampN(a.cloth + a.clothV * dt, 1.8);
    a.hairV += (-2 * 0.26 * 15 * a.hairV - 15 * 15 * (a.hair - clampN(-fwd / 300 - ax * p.facing * 0.00012, 1))) * dt;
    a.hair = clampN(a.hair + a.hairV * dt, 1.5);
    a.flare += (clampN(-p.vy / 500, 1.2) - a.flare) * Math.min(1, 12 * dt);
  }

  // Knocked down: the limbs go limp. They come back under control as the player pushes up.
  const upAt = p.downFor - 0.28;
  const limp = p.state === 'down' && p.t < upAt;
  if (limp) {
    if (!a.rag) {
      // Start from wherever the limbs were, whipped back against the direction of the blow.
      const f = p.facing, kick = -(Math.sign(p.vx) || 1) * 9;
      a.rag = { th: [f * a.pose.armF, f * a.pose.armB, f * 0.2, -f * 0.2], w: [kick, kick * 0.8, kick * 0.6, kick * 0.7] };
    }
    ragStep(a.rag, p, dt, ax, ay);
    ragPose(a.rag, p, a.pose);
    for (const key of KEYS) a.vel[key] = 0;
  } else a.rag = null;

  const air = p.y > 1;
  if (a.wasAir && !air && p.state !== 'down') a.landT = 0.16;
  a.wasAir = air;
  a.landT = Math.max(0, a.landT - look.dt);
  if ((p.state === 'stun' || p.state === 'down') && a.lastState !== p.state) a.hitT = 0.09;
  a.lastState = p.state;
  a.hitT = Math.max(0, a.hitT - look.dt);
  if (p.facing !== a.lastFacing && p.state === 'move') a.turnT = 0.1;
  a.lastFacing = p.facing;
  a.turnT = Math.max(0, a.turnT - look.dt);

  const P: Pose = { ...a.pose };
  if (!limp && p.state !== 'held' && p.state !== 'ride') { P.head -= a.sway * 0.7; P.lean -= a.sway * 0.45; }
  // How far the whole figure is turned: the core's tumble, unwinding as the player gets back up.
  let turn = 0;
  if (p.state === 'held') turn = p.rot;
  else if (p.state === 'down') {
    const r = Math.atan2(Math.sin(p.rot), Math.cos(p.rot));
    turn = limp ? p.rot : r * (1 - clamp01((p.t - upAt) / 0.28));
  }
  if (a.landT > 0) {
    // Landing: squash down and absorb with the knees.
    const q = a.landT / 0.16;
    P.sy *= 1 - 0.2 * q; P.sx *= 1 + 0.14 * q; P.hipH -= 6 * q;
  } else if (air && p.vy > 260 && p.state !== 'down') {
    // Taking off: stretch.
    P.sy *= 1.08; P.sx *= 0.95;
  }

  // Turning around: a quick squash through the middle so the flip reads as a turn.
  if (a.turnT > 0) P.sx *= 1 - 0.55 * Math.sin((a.turnT / 0.1) * Math.PI);

  let flip: number = p.facing;
  if (p.state === 'spin') {
    // Whirl: flip the figure back and forth quickly.
    const c = Math.cos(p.t * 36);
    flip = p.facing * (Math.abs(c) < 0.25 ? (c < 0 ? -0.25 : 0.25) : c);
  }
  // A body lying flat rests on the floor, not at standing height: lower the turning point as it tips over.
  const lying = Math.sin(turn) * Math.sin(turn) * clamp01(1 - p.y / 36);
  const footY = sy(p.z, p.y) - P.hop + (PIVOT - 12) * S * lying;
  // Hit pause: the one who got hit shakes on the spot.
  if (p.freeze > 0 && (p.state === 'stun' || p.state === 'down')) sx += Math.sin(time * 95 + p.id) * 2.8;

  cur.hair = a.hair; cur.cloth = a.cloth; cur.flare = Math.max(0, a.flare);
  // Afterimages behind the fastest moves: the last few poses, fading.
  const fast = p.state === 'spin' || p.state === 'tackle' || p.state === 'airkick' || p.state === 'toss' || p.state === 'dunk'
    || (p.state === 'punch' && (p.weapon === 'bat' || p.combo >= 2)) || (p.state === 'down' && p.thrown && p.y > 0);
  if (!fast) a.ghosts.length = 0;
  else {
    a.ghosts.forEach((g, i) => {
      ctx.save();
      ctx.globalAlpha *= 0.1 + 0.11 * i;
      ctx.translate(g.x, g.y);
      body(ctx, p, team, g.P, look, time, g.flip, null, g.turn);
      ctx.restore();
    });
    if (dt > 0 && a.tick++ % 2 === 0) {
      a.ghosts.push({ P, x: sx, y: footY, flip, turn });
      if (a.ghosts.length > 3) a.ghosts.shift();
    }
  }

  if (a.hitT > 0) {
    // Hit flash: draw the figure off-screen, paint it white, then stamp it.
    flashCv ??= Object.assign(document.createElement('canvas'), { width: 440, height: 440 });
    const f = flashCv.getContext('2d')!;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.clearRect(0, 0, 440, 440);
    f.setTransform(2, 0, 0, 2, 220, 330);
    body(f, p, team, P, look, time, flip, null, turn);
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-atop';
    f.fillStyle = 'rgba(255,255,255,0.92)';
    f.fillRect(0, 0, 440, 440);
    ctx.drawImage(flashCv, sx - 110, footY - 165, 220, 220);
  } else {
    ctx.save();
    ctx.translate(sx, footY);
    if (look.tilt) { ctx.translate(0, look.tilt.py); ctx.rotate(look.tilt.a); ctx.translate(0, -look.tilt.py); }
    body(ctx, p, team, P, look, time, flip, ctx.getTransform(), turn);
    ctx.restore();
  }

  // Who controls this player.
  if (look.label && p.state !== 'down') {
    const my = footY - 140 + Math.sin(time * 6) * 2;
    ctx.fillStyle = look.labelColor ?? '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(sx - 7, my - 8); ctx.lineTo(sx + 7, my - 8); ctx.lineTo(sx, my);
    ctx.fill();
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,6,24,0.9)';
    ctx.strokeText(look.label, sx, my - 11);
    ctx.fillText(look.label, sx, my - 11);
  }
}

// ---------------------------------------------------------------- head and face

function drawHead(ctx: CanvasRenderingContext2D, p: Player, team: TeamDef, look: PlayerLook, hy: number, time: number, dir: number) {
  const d: PlayerDef = p.def;
  const skin = d.skin;
  const mood = look.mood;
  // Hair lags behind vertical motion a little.
  const hb = Math.max(-2.5, Math.min(2.5, p.vy * 0.006));
  // Hair leans away from the motion: sheared about the hairline, so the tips move most.
  const hair = (fill: () => void, give = 1) => {
    ctx.save();
    ctx.translate(HX, hy - 9); ctx.transform(1, 0, -cur.hair * 0.4 * give, 1, 0, 0); ctx.translate(-HX, -(hy - 9));
    ctx.fillStyle = d.hair;
    fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.restore();
  };
  // The headband's loose ends stream out behind.
  ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const bx = HX - 13.2, by = hy - 7.6 + k * 1.2;
    const ex = bx - 5.5 + cur.hair * 8 * (1 - k * 0.25), ey = by + 7.5 - Math.abs(cur.hair) * 5.5 + k * 3 + Math.sin(time * 13 + k * 2 + p.id) * 1.3 * Math.abs(cur.hair);
    for (const [w, c] of [[4.6, OUT], [2.8, k ? shade(team.trim, 0.8) : team.trim]] as const) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 4 + cur.hair * 3, by + 1.2, ex, ey); ctx.stroke();
    }
  }

  // Hair that sits behind the head.
  if (d.hairStyle === 'afro') {
    hair(() => { ctx.beginPath(); ctx.arc(HX - 2, hy - 5 - hb * 0.6, HR + 6, 0, Math.PI * 2); ctx.fill(); }, 0.45);
  } else if (d.hairStyle === 'bun') {
    hair(() => { ctx.beginPath(); ctx.arc(HX - 11, hy - 13 - hb, 6.5, 0, Math.PI * 2); ctx.fill(); });
  }

  // Head.
  // Shaded like a ball: darker toward the back of the head and under the chin.
  ctx.save();
  ctx.beginPath(); ctx.arc(HX, hy, HR, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = shade(skin, 0.8);
  ctx.fillRect(HX - HR, hy - HR, HR * 2, HR * 2);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(HX + 2.6, hy - 2.2, HR - 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath(); ctx.ellipse(HX + 6, hy - 8, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(HX, hy, HR, 0, Math.PI * 2);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Ear.
  ctx.fillStyle = shade(skin, 0.86);
  ctx.beginPath(); ctx.arc(HX - 8, hy + 2, 3.2, 0, Math.PI * 2); ctx.fill();

  // Hair on top: a cap over the crown, then the style.
  ctx.fillStyle = d.hair;
  const cap = () => { ctx.beginPath(); ctx.arc(HX, hy, HR + 0.6, Math.PI * 1.06, Math.PI * 1.94); ctx.closePath(); ctx.fill(); };
  switch (d.hairStyle) {
    case 'spiky':
      cap();
      hair(() => {
        ctx.beginPath();
        ctx.moveTo(HX - 14, hy - 8);
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(HX - 12 + i * 5.6, hy - 22 - (i % 2 ? 6 : 1) - hb);
          ctx.lineTo(HX - 9 + i * 5.6, hy - 11);
        }
        ctx.lineTo(HX + 14, hy - 8);
        ctx.fill();
      });
      break;
    case 'flat':
      cap();
      hair(() => { roundRect(ctx, HX - 13, hy - 23 - hb * 0.5, 26, 12 + hb * 0.5, 2); ctx.fill(); });
      break;
    case 'afro':
    case 'bun':
      cap();
      break;
    case 'mohawk':
      ctx.globalAlpha *= 0.25; cap(); ctx.globalAlpha /= 0.25;
      hair(() => { roundRect(ctx, HX - 4.5, hy - 29 - hb, 9, 19 + hb, 3); ctx.fill(); });
      break;
    case 'bald':
    default:
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(HX - 4, hy - 9, 4, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  // Headband.
  ctx.fillStyle = team.trim;
  ctx.fillRect(HX - 13.4, hy - 9.5, 26.8, 4);

  // Eyes follow the ball; everyone blinks now and then.
  const gl = Math.hypot(look.gazeX, look.gazeY) || 1;
  const gx = Math.max(-0.5, Math.min(1.5, ((look.gazeX * dir) / gl) * 1.5));
  const gy = Math.max(-1.2, Math.min(1.2, (-look.gazeY / gl) * 1.2));
  const blink = (time * 0.9 + p.id * 0.37) % 3.1 < 0.1;
  drawFace(ctx, mood, hy, gx, gy, blink, skin);

  if (mood === 'dizzy') {
    ctx.fillStyle = '#ffe14a';
    for (let k = 0; k < 3; k++) {
      const a = time * 6 + k * 2.09;
      star(ctx, HX + Math.cos(a) * 17, hy - 22 + Math.sin(a) * 4, 3.4);
    }
  } else if (p.stamina < 0.25 && p.state !== 'down') {
    // Out of breath: sweat drops.
    ctx.fillStyle = '#8fd8ff';
    for (let k = 0; k < 2; k++) {
      const u = (time * 1.6 + k * 0.5) % 1;
      ctx.beginPath(); ctx.ellipse(HX - 12 - k * 4 - u * 3, hy - 6 + u * 12, 1.6, 2.4, 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.4 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** The face looks toward +x. Two eyes (near and far), brows, and a mouth, all driven by mood. */
function drawFace(ctx: CanvasRenderingContext2D, mood: Mood, hy: number, gx: number, gy: number, blink: boolean, skin: string) {
  const ink = '#1b1414';
  const ey = hy + 1.5;
  const eyes: [number, number, number][] = [[HX + 7.5, 1, 1], [HX + 0.5, 0.8, -1]]; // x, size, side (toward nose = -side)
  ctx.lineCap = 'round';
  for (const [ex, sc, side] of eyes) {
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    if (mood === 'dizzy') {
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ex - 2.6 * sc, ey - 2.6); ctx.lineTo(ex + 2.6 * sc, ey + 2.6);
      ctx.moveTo(ex + 2.6 * sc, ey - 2.6); ctx.lineTo(ex - 2.6 * sc, ey + 2.6);
      ctx.stroke();
    } else if (mood === 'pain') {
      // Eyes squeezed shut: > <
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(ex + side * 2.8 * sc, ey - 2.8); ctx.lineTo(ex - side * 2.2 * sc, ey); ctx.lineTo(ex + side * 2.8 * sc, ey + 2.8);
      ctx.stroke();
    } else if (mood === 'happy') {
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(ex, ey + 1.5, 3 * sc, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else if (blink || (mood === 'aim' && side < 0)) {
      // A blink, or the far eye shut to line up a shot.
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ex - 3 * sc, ey + 0.5); ctx.lineTo(ex + 3 * sc, ey + 0.5); ctx.stroke();
    } else {
      // Eye shape carries the mood: wide in shock, narrowed when straining, half-lidded when smug or spent.
      const ry = mood === 'sad' ? 3 : mood === 'grit' ? 2.7 : mood === 'shock' ? 5.7 : mood === 'shout' ? 4.9 : mood === 'aim' ? 3.6 : 4.4;
      const rx = 3.5 * sc * (mood === 'shock' ? 1.15 : 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = ink;
      const py = mood === 'sad' || mood === 'tired' ? 1.3 : mood === 'shock' ? 0 : Math.max(-ry + 2.2, Math.min(ry - 2.2, gy));
      const pr = (mood === 'shock' ? 1.1 : 2) * sc;
      ctx.beginPath(); ctx.arc(ex + gx * sc, ey + py, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + gx * sc + 0.7, ey + py - 0.8, 0.6, 0, Math.PI * 2); ctx.fill();
      const lid = mood === 'smug' ? 0.46 : mood === 'tired' ? 0.58 : 0;
      if (lid) {
        const yl = ey - ry + 2 * ry * lid;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(ex, ey, rx + 0.5, ry + 0.5, 0, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = skin;
        ctx.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, yl - (ey - ry - 1));
        ctx.restore();
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ex - rx, yl); ctx.lineTo(ex + rx, yl); ctx.stroke();
      }
    }
    // Brows.
    const inner = ex - side * 3.4 * sc, outer = ex + side * 3.4 * sc;
    let yi = ey - 6.8, yo = ey - 6.8, lw = 1.3;
    if (mood === 'angry' || mood === 'shout') { yi = ey - 4.4; yo = ey - 8; lw = 2.1; }
    else if (mood === 'grit') { yi = ey - 3.6; yo = ey - 6.6; lw = 2.3; }
    else if (mood === 'shock') { yi = ey - 9.6; yo = ey - 9; lw = 1.3; }
    else if (mood === 'smug') { if (side > 0) { yi = ey - 8.8; yo = ey - 8; lw = 1.6; } else { yi = ey - 5.4; yo = ey - 5.8; lw = 1.6; } }
    else if (mood === 'sad' || mood === 'pain' || mood === 'tired') { yi = ey - 8.2; yo = ey - 5.4; lw = 1.5; }
    else if (mood === 'focus' || mood === 'effort' || mood === 'aim') { yi = ey - 5.6; yo = ey - 6.8; lw = 1.8; }
    else if (mood === 'happy') { yi = ey - 7.6; yo = ey - 7.6; lw = 1.2; }
    if (mood !== 'dizzy') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(inner, yi); ctx.lineTo(outer, yo); ctx.stroke();
    }
  }

  // Mouth.
  const mx = HX + 5.5, my = hy + 8.5;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  switch (mood) {
    case 'angry':
      ctx.fillStyle = '#3a0d0d';
      roundRect(ctx, mx - 4.5, my - 3, 9, 6.5, 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - 3.8, my - 3, 7.6, 2);
      break;
    case 'pain':
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, mx - 4.5, my - 2.2, 9, 4.6, 1.5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 4.5, my); ctx.lineTo(mx + 4.5, my); ctx.moveTo(mx, my - 2.2); ctx.lineTo(mx, my + 2.4); ctx.stroke();
      break;
    case 'dizzy':
      ctx.beginPath(); ctx.ellipse(mx, my, 2.2, 2.8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'happy':
      ctx.fillStyle = '#3a0d0d';
      ctx.beginPath(); ctx.arc(mx, my - 2.5, 5.6, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath(); ctx.arc(mx, my + 1.6, 2.6, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - 4.6, my - 2.5, 9.2, 1.6);
      ctx.fillStyle = 'rgba(255,120,120,0.4)';
      ctx.beginPath(); ctx.arc(HX + 11, hy + 5.5, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'sad':
      ctx.beginPath(); ctx.arc(mx, my + 3.5, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      break;
    case 'focus':
      ctx.beginPath(); ctx.moveTo(mx - 2.5, my); ctx.lineTo(mx + 2.5, my - 0.6); ctx.stroke();
      break;
    case 'shout':
      // Roaring: mouth wide open, teeth and tongue.
      ctx.fillStyle = '#3a0d0d';
      roundRect(ctx, mx - 5.2, my - 4.2, 10.6, 10.4, 3.2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - 4.4, my - 4.2, 9, 2.3);
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath(); ctx.ellipse(mx + 0.2, my + 3.8, 3.2, 2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'grit':
      // Teeth clenched.
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, mx - 5.6, my - 2.7, 11.2, 5.6, 1.7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx - 5.6, my + 0.1); ctx.lineTo(mx + 5.6, my + 0.1);
      for (const tx of [-2.8, 0, 2.8]) { ctx.moveTo(mx + tx, my - 2.7); ctx.lineTo(mx + tx, my + 2.9); }
      ctx.stroke();
      break;
    case 'shock':
      ctx.fillStyle = '#3a0d0d';
      ctx.beginPath(); ctx.ellipse(mx - 0.5, my + 1, 2.4, 3.3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'smug':
      // A one-sided smirk.
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(mx - 3.6, my + 0.4); ctx.quadraticCurveTo(mx + 1.2, my + 2.8, mx + 4.8, my - 2.4); ctx.stroke();
      break;
    case 'aim':
      // Concentrating, tongue out at the corner.
      ctx.beginPath(); ctx.moveTo(mx - 2.6, my); ctx.lineTo(mx + 2.6, my - 0.4); ctx.stroke();
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath(); ctx.ellipse(mx + 3.4, my + 1.3, 1.7, 1.4, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'tired':
      // Panting, tongue hanging.
      ctx.fillStyle = '#3a0d0d';
      ctx.beginPath(); ctx.ellipse(mx, my, 3.2, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath(); ctx.ellipse(mx + 0.6, my + 3.6, 2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'effort':
      // Mouth open, breathing hard.
      ctx.fillStyle = '#3a0d0d';
      ctx.beginPath(); ctx.ellipse(mx, my, 3, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath(); ctx.ellipse(mx, my + 1.6, 2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    default:
      ctx.beginPath(); ctx.arc(mx, my - 2, 3.4, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  }
}
