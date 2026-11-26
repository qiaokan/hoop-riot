import type { Player } from '../core/game';
import type { PlayerDef, TeamDef } from '../core/teams';
import { roundRect } from './sprites';
import { sy } from './view';

// Characters are drawn from a pose: where the hips, feet and hands are, how far the body leans,
// how much it squashes. Each game state produces a target pose with wind-up, action and recovery
// phases, and the drawn pose eases toward that target every frame, so moves flow into each other.

export type Mood = 'normal' | 'angry' | 'pain' | 'dizzy' | 'happy' | 'sad' | 'focus' | 'effort';

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

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
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
        // Reaching up for a block or rebound.
        P.armF = 2.6; P.armB = 2.4; P.elbowF = 0.1; P.elbowB = 0.15; P.head = -0.15;
      }
      break;
    case 'shoot':
      if (!p.released) {
        // Ball set overhead, elbows bent.
        P.armF = 2.45; P.elbowF = 0.25; P.armB = 2.3; P.elbowB = 0.3; P.lean = -0.06; P.head = -0.12;
      } else {
        // Follow-through: shooting arm extended toward the rim.
        P.armF = 2.15; P.elbowF = -0.2; P.armB = 1.3; P.elbowB = 0.6; P.lean = 0.08;
      }
      break;
    case 'punch':
      rate = 55;
      if (p.combo >= 2) {
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
      rate = 60;
      const upAt = p.downFor - 0.28;
      if (p.thrown) {
        // Thrown: tumbling through the air. The spin itself comes from the body's rotation.
        P.armF = 2.4 + Math.sin(time * 20) * 0.5; P.armB = 2.7 - Math.sin(time * 20) * 0.5; P.elbowF = 0.2; P.elbowB = 0.2;
        P.fFx = 7; P.fFy = 7; P.fBx = -6; P.fBy = 5; P.lean = -0.1;
      } else if (t < 0.3) {
        // Knocked backward, limbs flung out.
        const u = t / 0.3;
        P.rot = -(Math.PI / 2) * Math.min(1, u * 1.25); P.rotY = 10 + Math.sin(u * Math.PI) * 12;
        P.armF = -2.2; P.armB = -2.6; P.elbowF = 0.2; P.elbowB = 0.2;
        P.fFx = 8; P.fFy = 8; P.fBx = 2; P.fBy = 5;
      } else if (t < upAt) {
        // Flat on the back, with a small bounce on impact.
        P.rot = -Math.PI / 2; P.rotY = 9 + (t < 0.42 ? Math.sin(((t - 0.3) / 0.12) * Math.PI) * 4 : 0);
        P.armF = -2.5; P.elbowF = 0.2; P.armB = -1.2; P.elbowB = 0.4;
        P.fFx = 6; P.fFy = 3; P.fBx = -4;
      } else {
        // Pushing back up.
        const u = clamp01((t - upAt) / 0.28);
        P.rot = -(Math.PI / 2) * (1 - u); P.rotY = 9 * (1 - u);
        P.hipH = HIP - 7 + 7 * u; P.lean = 0.5 * (1 - u); P.head = 0.3 * (1 - u);
        P.armF = 0.6; P.armB = 0.3; P.fFx = 7; P.fBx = -6;
      }
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
      rate = 45;
      P.rot = -0.5;
      P.fFx = 20; P.fFy = 12; P.fBx = -5; P.fBy = 12;
      P.armF = -0.8; P.elbowF = 0.6; P.armB = 1.3; P.elbowB = 0.8; P.lean = -0.1;
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
    case 'pass':
      // Chest pass: both arms thrust forward, a step into it.
      rate = 45;
      P.armF = 1.55; P.elbowF = 0; P.armB = 1.4; P.elbowB = 0.1; P.lean = 0.24; P.fFx = 10;
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

/** A leg from the hip to a foot target. The knee position is solved so the foot lands where asked. */
function leg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, soleY: number, thigh: string, shin: string, shoe: string, trim: string) {
  let fy = -soleY - ANKLE;
  let dx = fx - hx, dy = fy - hy;
  let dist = Math.hypot(dx, dy);
  const max = LEG * 2 - 0.2;
  if (dist > max) { fx = hx + (dx / dist) * max; fy = hy + (dy / dist) * max; dx = fx - hx; dy = fy - hy; dist = max; }
  if (dist < 1) dist = 1;
  const h = Math.sqrt(Math.max(0, LEG * LEG - (dist / 2) * (dist / 2)));
  // The knee always bends forward.
  let nx = dy / dist, ny = -dx / dist;
  if (nx < 0) { nx = -nx; ny = -ny; }
  const kx = hx + dx / 2 + nx * h, ky = hy + dy / 2 + ny * h;
  strokePath(ctx, [hx, hy, kx, ky, fx, fy], 11, OUT);
  strokePath(ctx, [kx, ky, fx, fy], 7.6, shin);
  // Sock.
  strokePath(ctx, [kx + (fx - kx) * 0.6, ky + (fy - ky) * 0.6, fx, fy], 7.6, shoe);
  strokePath(ctx, [hx, hy, kx, ky], 8.6, thigh);
  // Shoe: toes dip when the foot is off the ground.
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(Math.min(0.7, soleY * 0.07));
  ctx.fillStyle = shoe;
  roundRect(ctx, -4.5, -3.6, 14, 7.4, 3);
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = trim;
  ctx.fillRect(-3.4, 1.4, 11.8, 1.8);
  ctx.restore();
}

/** An arm from the shoulder: upper arm at `ang`, forearm bent by `elbow`, ending in a fist. */
function arm(ctx: CanvasRenderingContext2D, x0: number, y0: number, ang: number, elbow: number, skin: string, band: string) {
  // Arms stretch when raised, cartoon-style, so the hands clear the oversized head.
  const L = 10 * (1 + 0.7 * clamp01((ang - 1.7) / 0.8) + 0.65 * clamp01((ang - 2.7) / 0.4));
  const kx = x0 + Math.sin(ang) * L, ky = y0 + Math.cos(ang) * L;
  const a2 = ang + elbow;
  const ex = kx + Math.sin(a2) * L, ey = ky + Math.cos(a2) * L;
  strokePath(ctx, [x0, y0, kx, ky, ex, ey], 9.4, OUT);
  strokePath(ctx, [x0, y0, kx, ky, ex, ey], 6.8, skin);
  // Wristband.
  strokePath(ctx, [kx + (ex - kx) * 0.62, ky + (ey - ky) * 0.62, kx + (ex - kx) * 0.82, ky + (ey - ky) * 0.82], 6.8, band);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(ex, ey, 4.7, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  return [ex, ey] as const;
}

/** Draws the figure with its feet at the origin. `base` is the transform at the feet, used to report the hand position. */
function body(ctx: CanvasRenderingContext2D, p: Player, team: TeamDef, P: Pose, look: PlayerLook, time: number, flip: number, base: DOMMatrix | null) {
  const d = p.def;
  const bw = d.build;
  const skin = d.skin;
  const dir = Math.sign(flip) || 1;
  ctx.save();
  // Swung in a throw or spinning through the air: turn the whole figure about its middle.
  if (p.rot && (p.state === 'held' || p.state === 'down')) {
    ctx.translate(0, -44 * S);
    ctx.rotate(p.rot);
    ctx.translate(0, 44 * S);
  }
  ctx.scale(flip * S * P.sx, S * P.sy);
  if (P.rot || P.rotY) { ctx.translate(0, -P.rotY); ctx.rotate(P.rot); }
  if (p.invuln > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha *= 0.5;

  const hipY = -P.hipH;
  const upper = (fn: () => void) => {
    ctx.save();
    ctx.translate(P.hipX, hipY);
    ctx.rotate(P.lean);
    fn();
    ctx.restore();
  };

  // Back arm, behind everything.
  upper(() => arm(ctx, -3, -21, P.armB, P.elbowB, shade(skin, 0.7), shade(team.trim, 0.7)));
  // Legs.
  leg(ctx, P.hipX - 3, hipY, P.fBx, P.fBy, shade(team.shorts, 0.72), shade(skin, 0.8), '#cfcfd6', shade(team.trim, 0.8));
  leg(ctx, P.hipX + 3, hipY, P.fFx, P.fFy, team.shorts, skin, '#ffffff', team.trim);

  upper(() => {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = OUT;
    // Shorts.
    ctx.fillStyle = team.shorts;
    roundRect(ctx, -10.5 * bw, -7, 21 * bw, 11.5, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = team.trim;
    ctx.fillRect(2.5, -4.5, 2.6, 8.4);
    // Jersey.
    ctx.fillStyle = team.jersey;
    roundRect(ctx, -11 * bw, -28, 22 * bw, 23.5, 7); ctx.fill(); ctx.stroke();
    // Two-tone shading: dark toward the back, light across the chest.
    ctx.fillStyle = shade(team.jersey, 0.74);
    roundRect(ctx, -11 * bw + 0.8, -26.5, 6.5, 20, 4); ctx.fill();
    ctx.fillStyle = shade(team.jersey, 1.16);
    roundRect(ctx, 11 * bw - 7.5, -25.5, 5, 9, 2.5); ctx.fill();
    // Neckline.
    ctx.fillStyle = team.trim;
    ctx.beginPath(); ctx.moveTo(-5, -28); ctx.lineTo(8, -28); ctx.lineTo(3, -23.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(skin, 0.86);
    ctx.beginPath(); ctx.moveTo(-3, -28); ctx.lineTo(6.4, -28); ctx.lineTo(2.8, -24.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = team.trim;
    ctx.fillRect(-11 * bw + 0.8, -7, 22 * bw - 1.6, 2.4);
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
      ctx.translate(-HX, 27);
      drawHead(ctx, p, team, look, -40, time, dir);
      ctx.restore();

    };
    // A raised arm goes behind the head, so it never covers the face.
    const raised = P.armF > 2.05;
    const frontArm = () => {
      const [ex, ey] = arm(ctx, 3, -21, P.armF, P.elbowF, skin, team.trim);
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
    a = { pose: targetPose(p, look, time).pose, ready: false, wasAir: false, landT: 0, lastState: p.state, hitT: 0, lastFacing: p.facing, turnT: 0 };
    anims.set(p.id, a);
  }
  // Ease the drawn pose toward the target.
  const { pose: T, rate } = targetPose(p, look, time);
  const k = a.ready ? 1 - Math.exp(-rate * look.dt) : 1;
  for (const key of KEYS) a.pose[key] += (T[key] - a.pose[key]) * k;
  a.ready = true;

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
  const footY = sy(p.z, p.y) - P.hop;
  // Hit pause: the one who got hit shakes on the spot.
  if (p.freeze > 0 && (p.state === 'stun' || p.state === 'down')) sx += Math.sin(time * 95 + p.id) * 2.8;

  if (a.hitT > 0) {
    // Hit flash: draw the figure off-screen, paint it white, then stamp it.
    flashCv ??= Object.assign(document.createElement('canvas'), { width: 440, height: 440 });
    const f = flashCv.getContext('2d')!;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.clearRect(0, 0, 440, 440);
    f.setTransform(2, 0, 0, 2, 220, 330);
    body(f, p, team, P, look, time, flip, null);
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-atop';
    f.fillStyle = 'rgba(255,255,255,0.92)';
    f.fillRect(0, 0, 440, 440);
    ctx.drawImage(flashCv, sx - 110, footY - 165, 220, 220);
  } else {
    ctx.save();
    ctx.translate(sx, footY);
    body(ctx, p, team, P, look, time, flip, ctx.getTransform());
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
  const hair = (fill: () => void) => {
    ctx.fillStyle = d.hair;
    fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  };

  // Hair that sits behind the head.
  if (d.hairStyle === 'afro') {
    hair(() => { ctx.beginPath(); ctx.arc(HX - 2, hy - 5 - hb * 0.6, HR + 6, 0, Math.PI * 2); ctx.fill(); });
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
  drawFace(ctx, mood, hy, gx, gy, blink);

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
function drawFace(ctx: CanvasRenderingContext2D, mood: Mood, hy: number, gx: number, gy: number, blink: boolean) {
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
    } else if (blink) {
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ex - 3 * sc, ey + 0.5); ctx.lineTo(ex + 3 * sc, ey + 0.5); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.5 * sc, mood === 'sad' ? 3 : 4.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = ink;
      const py = mood === 'sad' ? 1.3 : gy;
      ctx.beginPath(); ctx.arc(ex + gx * sc, ey + py, 2 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + gx * sc + 0.7, ey + py - 0.8, 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Brows.
    const inner = ex - side * 3.4 * sc, outer = ex + side * 3.4 * sc;
    let yi = ey - 6.8, yo = ey - 6.8, lw = 1.3;
    if (mood === 'angry') { yi = ey - 4.4; yo = ey - 8; lw = 2.1; }
    else if (mood === 'sad' || mood === 'pain') { yi = ey - 8.2; yo = ey - 5.4; lw = 1.5; }
    else if (mood === 'focus' || mood === 'effort') { yi = ey - 5.6; yo = ey - 6.8; lw = 1.8; }
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
