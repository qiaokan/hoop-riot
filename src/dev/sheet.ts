// Dev-only page (sheet.html): plays each move in the previous character code and the current
// one side by side, so animation changes can be judged by eye instead of by description.
import { Mood, drawPlayer as drawNew, handPos } from '../client/character';
import { FLOOR_TOP, ZS } from '../client/view';
import { GRAVITY, HOOP, JUMP_V, LAUNCH_V } from '../core/constants';
import { Game, Player } from '../core/game';
import { HOME_TEAM, OPPONENTS } from '../core/teams';
import { drawPlayer as drawOld } from './old_sprites';

interface Move {
  name: string;
  len: number;
  ball?: boolean;
  celebrate?: boolean;
  /** Put the player in the right state for loop time t; returns the face to show. */
  set: (p: Player, t: number) => Mood;
}

const reset = (p: Player) => {
  p.state = 'move'; p.t = 0; p.y = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.released = false; p.punchHit = false; p.launched = false; p.dunk = undefined; p.combo = 0; p.kneeT = 0;
};

const MOVES: Move[] = [
  { name: 'Sprint', len: 4, set: (p, t) => { p.vx = 254; p.anim = 254 * t; return 'normal'; } },
  { name: 'Run with the ball', len: 4, ball: true, set: (p, t) => { p.vx = 163; p.anim = 163 * t; return 'normal'; } },
  { name: 'Ready stance', len: 4, set: () => 'normal' },
  {
    name: 'Punch', len: 0.8,
    set: (p, t) => { if (t < 0.26) { p.state = 'punch'; p.t = t; return 'angry'; } return 'normal'; },
  },
  {
    name: 'Punch combo: jab, cross, finisher', len: 1.6,
    set: (p, t) => {
      if (t < 0.2) { p.state = 'punch'; p.combo = 0; p.t = t; return 'angry'; }
      if (t < 0.4) { p.state = 'punch'; p.combo = 1; p.t = t - 0.2; return 'angry'; }
      if (t < 0.84) { p.state = 'punch'; p.combo = 2; p.t = t - 0.4; return 'angry'; }
      return 'normal';
    },
  },
  {
    name: 'Jump shot', len: 1.4, ball: true,
    set: (p, t) => {
      const v0 = JUMP_V * 1.06, tt = t - 0.3, air = (2 * v0) / GRAVITY;
      if (tt < 0 || tt > air) return 'normal';
      p.state = 'shoot'; p.t = tt; p.vy = v0 - GRAVITY * tt; p.y = Math.max(0.1, v0 * tt - 0.5 * GRAVITY * tt * tt);
      p.released = tt > air / 2;
      return 'focus';
    },
  },
  {
    name: 'Hit, then knocked down', len: 2.4,
    set: (p, t) => {
      if (t < 0.3) { p.state = 'stun'; p.t = t; return 'pain'; }
      if (t > 0.7 && t < 1.8) { p.state = 'down'; p.t = t - 0.7; return 'dizzy'; }
      return 'normal';
    },
  },
  {
    name: 'Running tackle', len: 1.4,
    set: (p, t) => { if (t < 0.62) { p.state = 'tackle'; p.t = t; p.vx = t < 0.3 ? 430 : 120; return 'angry'; } return 'normal'; },
  },
  { name: 'Celebration', len: 4, celebrate: true, set: () => 'happy' },
  { name: 'Standing with the ball', len: 4, ball: true, set: () => 'normal' },
  {
    name: 'Dunk, then hang', len: 1.8, ball: true,
    set: (p, t) => {
      const tt = t - 0.3;
      if (tt < 0 || tt > 0.87) return 'normal';
      if (tt < 0.55) {
        const u = tt / 0.55, e = u * u * (3 - 2 * u);
        p.state = 'dunk'; p.t = tt; p.y = 70 * e + Math.sin(Math.PI * u) * 70;
        p.dunk = { sx: 0, sy: 0, sz: 0, tx: 0, tz: 0, T: 0.55, kind: 'dunk', rimY: HOOP.rimY };
      } else { p.state = 'hang'; p.t = tt - 0.55; p.y = 70; p.released = true; }
      return 'happy';
    },
  },
  {
    name: 'Jump, then air kick', len: 1.4,
    set: (p, t) => {
      const v0 = JUMP_V * 1.06, tt = t - 0.3, air = (2 * v0) / GRAVITY;
      if (tt < 0 || tt > air) return 'normal';
      p.vy = v0 - GRAVITY * tt; p.y = Math.max(0.1, v0 * tt - 0.5 * GRAVITY * tt * tt);
      if (tt < 0.16) { p.state = 'jump'; p.t = tt; return 'focus'; }
      p.state = 'airkick'; p.t = tt - 0.16;
      return 'angry';
    },
  },
  { name: 'Pass', len: 0.9, set: (p, t) => { if (t < 0.16) { p.state = 'pass'; p.t = t; } return 'normal'; } },
  { name: 'Dodge', len: 1, set: (p, t) => { if (t < 0.28) { p.state = 'spin'; p.t = t; return 'focus'; } return 'normal'; } },
  {
    name: 'Off a launch pad', len: 1.6,
    set: (p, t) => {
      const tt = t - 0.3, air = (2 * LAUNCH_V) / GRAVITY;
      if (tt < 0 || tt > air) return 'normal';
      p.state = 'jump'; p.launched = true; p.t = tt; p.vy = LAUNCH_V - GRAVITY * tt; p.y = Math.max(0.1, (LAUNCH_V * tt - 0.5 * GRAVITY * tt * tt) * 0.4);
      return 'pain';
    },
  },
  { name: 'Sulking after a basket', len: 4, set: () => 'sad' },
  {
    name: 'Grab, knee strike, throw', len: 2,
    set: (p, t) => {
      if (t < 1.1) { p.state = 'grab'; p.t = t; p.kneeT = (t > 0.4 && t < 0.62) || (t > 0.75 && t < 0.97) ? 0.1 : 0; return 'angry'; }
      if (t < 1.7) { p.state = 'toss'; p.tossDir = 1; p.t = t - 1.1; return 'angry'; }
      return 'normal';
    },
  },
  { name: 'Held in a grab', len: 4, set: (p) => { p.state = 'held'; return 'pain'; } },
];

const SCALE = 1.25, ROW = 215, W = 720;
// ?at=0.5 freezes every move halfway through its loop (for inspecting single poses).
const AT = new URLSearchParams(location.search).get('at');
const cv = document.getElementById('sheet') as HTMLCanvasElement;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
cv.width = W * SCALE * dpr;
cv.height = MOVES.length * ROW * SCALE * dpr;
cv.style.width = `${W * SCALE}px`;
cv.style.height = `${MOVES.length * ROW * SCALE}px`;
const ctx = cv.getContext('2d')!;

const game = new Game({ home: HOME_TEAM, away: OPPONENTS[1].team, seed: 1 });
const team = game.teams[0];
const make = (id: number): Player => ({ ...game.players[0], prev: { shoot: false, action: false, special: false }, id, facing: 1 });
const olds = MOVES.map((_, i) => make(200 + i));
const news = MOVES.map((_, i) => make(300 + i));

let last = performance.now();
const t0 = last;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = (now - t0) / 1000;
  ctx.setTransform(SCALE * dpr, 0, 0, SCALE * dpr, 0, 0);
  ctx.clearRect(0, 0, W, MOVES.length * ROW);
  MOVES.forEach((m, i) => {
    const footY = i * ROW + 196;
    const t = AT !== null ? Number(AT) * m.len : time % m.len;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    if (i % 2) ctx.fillRect(0, i * ROW, W, ROW);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(m.name, 14, i * ROW + 24);
    ctx.font = '11px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#9aa0b5';
    ctx.fillText('previous', 250, i * ROW + 24);
    ctx.fillText('current', 510, i * ROW + 24);
    const ballH = 6 + 30 * Math.abs(Math.sin(time * 9));
    for (const [p, x, isNew] of [[olds[i], 280, false], [news[i], 540, true]] as const) {
      reset(p);
      const mood = m.set(p, t);
      p.z = (footY - FLOOR_TOP) / ZS;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, footY, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
      const hasBall = !!m.ball && !p.released;
      if (isNew) {
        drawNew(ctx, p, team, x, time, { hasBall, mood, celebrate: !!m.celebrate, dt, ballH: hasBall && p.state === 'move' ? ballH : 36, gazeX: 100, gazeY: 0, carrying: false });
      } else {
        drawOld(ctx, p, team, x, time, { hasBall, mood: mood === 'effort' ? 'focus' : mood, celebrate: !!m.celebrate });
      }
      if (hasBall) {
        // Previous version: ball at the fixed offset the game used. Current: at the hand.
        let bx = x + 16, by = p.state === 'move' ? footY - (p.vx ? ballH : 36) : footY - p.y - 60;
        const hd = isNew ? handPos(p.id) : null;
        if (hd) {
          const hx = x + hd.dx, hy = footY - p.y + hd.dy;
          if (p.state === 'move' && p.vx) { const k = (ballH - 6) / 30; bx = hx + 2; by = footY - 9 + (hy + 12 - (footY - 9)) * k; }
          else if (p.state === 'move') { bx = hx + 5; by = hy + 4; }
          else { bx = hx; by = hy - 8; }
        }
        ctx.fillStyle = '#e0702a';
        ctx.strokeStyle = '#1b1320';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
