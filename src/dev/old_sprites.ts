import { HIGH_RIM_Y, HOOP } from '../core/constants';
import type { Player } from '../core/game';
import type { PlayerDef, TeamDef } from '../core/teams';
import { ZS, sy } from '../client/view';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

/** Two-segment limb. Angle 0 points straight down, positive swings forward. Returns the end point. */
function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, ang: number, len: number, w: number, upper: string, lower: string, bend = 0) {
  const kx = x0 + Math.sin(ang) * len * 0.5;
  const ky = y0 + Math.cos(ang) * len * 0.5;
  const a2 = ang + bend;
  const ex = kx + Math.sin(a2) * len * 0.5;
  const ey = ky + Math.cos(a2) * len * 0.5;
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = upper;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.strokeStyle = lower;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke();
  return [ex, ey] as const;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, z: number, height: number, size: number) {
  const k = Math.max(0.3, 1 - height / 300);
  ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
  ctx.beginPath();
  ctx.ellipse(x, sy(z), size * k, size * 0.38 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- characters

export type Mood = 'normal' | 'angry' | 'pain' | 'dizzy' | 'happy' | 'sad' | 'focus';

export interface PlayerLook {
  hasBall: boolean;
  mood: Mood;
  /** Jumping for joy after a score or a win. */
  celebrate: boolean;
  label?: string;
  labelColor?: string;
}

/** Overall size of a character on screen. */
const S = 1.22;
/** Head center and radius, in the character's own units. The head is deliberately oversized. */
const HX = 1, HY = -60, HR = 15;

export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, team: TeamDef, sx: number, time: number, look: PlayerLook) {
  const d = p.def;
  const airborne = p.y > 1;
  const moving = Math.hypot(p.vx, p.vz) > 25 && !airborne;
  const phase = p.anim * 0.085;
  const swing = moving ? Math.sin(phase) * 0.8 : 0;
  const idle = p.state === 'move' && !airborne;
  const cele = look.celebrate && idle;
  const sulk = look.mood === 'sad' && idle;
  let footY = sy(p.z, p.y);
  if (cele) footY -= Math.abs(Math.sin(time * 9 + p.id * 1.7)) * 9;
  const bw = d.build;

  ctx.save();
  ctx.translate(sx, footY);
  if (p.state === 'down') {
    ctx.translate(0, -10);
    ctx.rotate(-p.facing * (Math.PI / 2) * Math.min(1, p.t * 6));
  } else if (p.state === 'stun') {
    ctx.rotate(-p.facing * 0.22);
  } else if (p.state === 'tackle') {
    ctx.translate(0, -14);
    ctx.rotate(p.facing * 1.15);
  } else if (p.state === 'airkick') {
    ctx.rotate(-p.facing * 0.4);
  }
  let flip: number = p.facing;
  if (p.state === 'spin') {
    // Whirl: flip the figure back and forth quickly.
    const c = Math.cos(p.t * 36);
    flip = p.facing * (Math.abs(c) < 0.25 ? (c < 0 ? -0.25 : 0.25) : c);
  }
  ctx.scale(flip * S, S);
  if (p.invuln > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.5;

  const skin = d.skin;
  const skinD = shade(skin, 0.8);
  const jersey = team.jersey;
  const shorts = team.shorts;

  // Pose angles (0 = straight down, positive = forward).
  let legF = swing, legB = -swing;
  let kneeF = moving ? -Math.max(0, -swing) * 1.2 : 0, kneeB = moving ? -Math.max(0, swing) * 1.2 : 0;
  let armF = -swing * 0.9, armB = swing * 0.9, elbowF = -0.35, elbowB = -0.35;
  if (airborne) { legF = 0.6; legB = -0.2; kneeF = -1.2; kneeB = -0.9; }
  switch (p.state) {
    case 'punch': {
      const ext = p.t < 0.16 ? Math.min(1, p.t / 0.06) : Math.max(0, 1 - (p.t - 0.16) / 0.1);
      armF = 0.4 + ext * 1.2; elbowF = -0.9 * (1 - ext);
      armB = -0.6; legF = 0.5; legB = -0.45; kneeF = 0; kneeB = 0;
      break;
    }
    case 'shoot':
    case 'dunk':
    case 'hang':
      armF = Math.PI * 0.92; armB = Math.PI * 0.8; elbowF = 0.1; elbowB = 0.2;
      break;
    case 'jump':
      armF = Math.PI * 0.75; armB = Math.PI * 0.6; elbowF = 0; elbowB = 0;
      break;
    case 'pass':
      armF = 1.5; armB = 1.3; elbowF = 0; elbowB = 0;
      break;
    case 'stun':
      armF = -0.6; armB = 0.9;
      break;
    case 'tackle':
      armF = 2.6; armB = 2.3; elbowF = 0; elbowB = 0;
      legF = -0.5; legB = -0.9; kneeF = 0; kneeB = 0;
      break;
    case 'airkick':
      legF = 1.5; kneeF = 0; legB = -0.4; kneeB = -1.4;
      armF = -0.9; armB = 1.1;
      break;
    case 'spin':
      armF = 1.5; armB = -1.5; elbowF = 0; elbowB = 0;
      break;
    case 'down':
      armF = 1.4; armB = 2; legF = 0.2; legB = -0.2; kneeF = 0; kneeB = 0;
      break;
    default:
      if (cele) {
        // Fist pumps.
        const k = Math.sin(time * 9 + p.id * 1.7);
        armF = Math.PI * (0.8 + 0.12 * k); armB = Math.PI * (0.8 - 0.12 * k); elbowF = 0.3; elbowB = 0.3;
      } else if (sulk) {
        armF = 0.1; armB = -0.1; elbowF = 0; elbowB = 0;
      } else if (look.hasBall && !airborne) {
        armF = 0.9 + Math.abs(swing) * 0.2; elbowF = -0.4;
      }
  }

  // Upper body bobs with the run cycle, breathes when standing, slumps when sulking.
  const uy = (moving ? -Math.abs(Math.sin(phase)) * 2 : Math.sin(time * 3 + p.id) * 0.6) + (sulk ? 3 : 0);
  const hipY = -20;
  const shY = -41 + uy;

  // Back arm.
  limb(ctx, -3, shY, armB, 20, 6.5, shade(skin, 0.68), shade(skin, 0.68), -elbowB);
  // Back leg and shoe.
  const [bfx, bfy] = limb(ctx, -3, hipY, legB, 21, 8.5, shade(shorts, 0.72), skinD, kneeB);
  ctx.fillStyle = '#cfcfd6';
  roundRect(ctx, bfx - 4, bfy - 3, 12, 6.5, 2.5); ctx.fill();
  // Front leg and shoe.
  const [ffx, ffy] = limb(ctx, 3, hipY, legF, 21, 8.5, shorts, skin, kneeF);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, ffx - 4, ffy - 3, 13, 6.5, 2.5); ctx.fill();
  ctx.fillStyle = team.trim;
  ctx.fillRect(ffx - 4, ffy + 1.5, 13, 2);

  // Shorts.
  ctx.fillStyle = shorts;
  roundRect(ctx, -10.5 * bw, -28 + uy, 21 * bw, 11, 3); ctx.fill();
  // Jersey.
  ctx.fillStyle = jersey;
  roundRect(ctx, -10.5 * bw, -48 + uy, 21 * bw, 23, 6); ctx.fill();
  ctx.fillStyle = shade(jersey, 0.76);
  ctx.fillRect(-10.5 * bw + 1, -44 + uy, 4, 17);
  ctx.fillStyle = team.trim;
  ctx.fillRect(-10.5 * bw, -27.5 + uy, 21 * bw, 2.5);
  ctx.save();
  ctx.scale(Math.sign(flip) || 1, 1);
  ctx.fillStyle = team.trim;
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.num), 0.5 * (Math.sign(flip) || 1), -31 + uy);
  ctx.restore();

  drawHead(ctx, d, team, look.mood, HY + uy, time);

  // Front arm on top, with a fist.
  const [hx, hy] = limb(ctx, 3, shY, armF, 20, 7, skin, skin, -elbowF);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(hx, hy, 4.2, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // Who controls this player.
  if (look.label && p.state !== 'down') {
    const my = footY - 116 + Math.sin(time * 6) * 2;
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

function drawHead(ctx: CanvasRenderingContext2D, d: PlayerDef, team: TeamDef, mood: Mood, hy: number, time: number) {
  const skin = d.skin;
  // Hair that sits behind the head.
  ctx.fillStyle = d.hair;
  if (d.hairStyle === 'afro') {
    ctx.beginPath(); ctx.arc(HX - 2, hy - 5, HR + 6, 0, Math.PI * 2); ctx.fill();
  } else if (d.hairStyle === 'bun') {
    ctx.beginPath(); ctx.arc(HX - 11, hy - 13, 6.5, 0, Math.PI * 2); ctx.fill();
  }

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(HX, hy, HR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.5)';
  ctx.lineWidth = 1.1;
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
      ctx.beginPath();
      ctx.moveTo(HX - 14, hy - 8);
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(HX - 12 + i * 5.6, hy - 22 - (i % 2 ? 6 : 1));
        ctx.lineTo(HX - 9 + i * 5.6, hy - 11);
      }
      ctx.lineTo(HX + 14, hy - 8);
      ctx.fill();
      break;
    case 'flat':
      cap();
      roundRect(ctx, HX - 13, hy - 23, 26, 12, 2); ctx.fill();
      break;
    case 'afro':
    case 'bun':
      cap();
      break;
    case 'mohawk':
      ctx.globalAlpha *= 0.25; cap(); ctx.globalAlpha /= 0.25;
      roundRect(ctx, HX - 4.5, hy - 29, 9, 19, 3); ctx.fill();
      break;
    case 'bald':
    default:
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(HX - 4, hy - 9, 4, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  // Headband.
  ctx.fillStyle = team.trim;
  ctx.fillRect(HX - 13.4, hy - 9.5, 26.8, 4);

  drawFace(ctx, mood, hy);

  if (mood === 'dizzy') {
    ctx.fillStyle = '#ffe14a';
    for (let k = 0; k < 3; k++) {
      const a = time * 6 + k * 2.09;
      star(ctx, HX + Math.cos(a) * 17, hy - 22 + Math.sin(a) * 4, 3.4);
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
function drawFace(ctx: CanvasRenderingContext2D, mood: Mood, hy: number) {
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
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.3 * sc, mood === 'sad' ? 3 : 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(ex + 1 * sc, ey + (mood === 'sad' ? 1.2 : 0.3), 1.9 * sc, 0, Math.PI * 2); ctx.fill();
    }
    // Brows.
    const inner = ex - side * 3.4 * sc, outer = ex + side * 3.4 * sc;
    let yi = ey - 6.6, yo = ey - 6.6, lw = 1.3;
    if (mood === 'angry') { yi = ey - 4.2; yo = ey - 7.8; lw = 2; }
    else if (mood === 'sad' || mood === 'pain') { yi = ey - 8; yo = ey - 5.2; lw = 1.5; }
    else if (mood === 'focus') { yi = ey - 5.4; yo = ey - 6.4; lw = 1.7; }
    else if (mood === 'happy') { yi = ey - 7.4; yo = ey - 7.4; lw = 1.2; }
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
    default:
      ctx.beginPath(); ctx.arc(mx, my - 2, 3.4, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  }
}

// ---------------------------------------------------------------- ball, hoops, stage

export function drawBall(ctx: CanvasRenderingContext2D, sx: number, syy: number, spin: number, glow = false) {
  if (glow) {
    const g = ctx.createRadialGradient(sx, syy, 2, sx, syy, 26);
    g.addColorStop(0, 'rgba(255,240,150,0.9)');
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, syy, 26, 0, Math.PI * 2); ctx.fill();
  }
  const r = 9;
  const g = ctx.createRadialGradient(sx - 3, syy - 3, 1, sx, syy, r);
  g.addColorStop(0, '#ffb15c');
  g.addColorStop(1, '#d4581a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, syy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,16,6,0.8)';
  ctx.lineWidth = 1.1;
  ctx.save();
  ctx.translate(sx, syy);
  ctx.rotate(spin);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawBoard(ctx: CanvasRenderingContext2D, boardX: number, dir: number, rimY: number, gold: boolean) {
  const zb0 = HOOP.z - 36, zb1 = HOOP.z + 36;
  const yb0 = rimY - 8, yb1 = rimY + (gold ? 50 : 62);
  const skew = (z: number) => boardX + (z - HOOP.z) * 0.32 * -dir;
  ctx.fillStyle = gold ? 'rgba(255,236,170,0.92)' : 'rgba(235,240,250,0.92)';
  ctx.beginPath();
  ctx.moveTo(skew(zb0), sy(zb0, yb1));
  ctx.lineTo(skew(zb1), sy(zb1, yb1));
  ctx.lineTo(skew(zb1), sy(zb1, yb0));
  ctx.lineTo(skew(zb0), sy(zb0, yb0));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = gold ? '#b8860b' : '#555';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = gold ? '#b8860b' : '#e23b3b';
  ctx.strokeRect(skew(HOOP.z) - 7, sy(HOOP.z, rimY + 24), 14, 18);
}

/** Stanchion, both backboards and the back halves of both rims. The upper (gold) hoop is the bonus hoop. */
export function drawHoopBack(ctx: CanvasRenderingContext2D, hx: number, camX: number) {
  const dir = hx < 750 ? 1 : -1;
  const x = hx - camX;
  const poleX = x - dir * 70;
  const baseY = sy(HOOP.z - 4);
  const boardX = x - dir * 22;
  const poleTop = sy(HOOP.z, HIGH_RIM_Y + 56);
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(poleX - 4, poleTop, 8, baseY - poleTop);
  ctx.fillStyle = '#2e323b';
  ctx.fillRect(poleX - 12, baseY - 6, 24, 10);
  ctx.strokeStyle = '#4a4f5c';
  ctx.lineWidth = 5;
  for (const rimY of [HOOP.rimY, HIGH_RIM_Y]) {
    ctx.beginPath();
    ctx.moveTo(poleX, sy(HOOP.z, rimY + 50));
    ctx.lineTo(boardX, sy(HOOP.z, rimY + 28));
    ctx.stroke();
  }
  drawBoard(ctx, boardX, dir, HIGH_RIM_Y, true);
  drawBoard(ctx, boardX, dir, HOOP.rimY, false);
  for (const [rimY, col] of [[HIGH_RIM_Y, '#d9a520'], [HOOP.rimY, '#e8541c']] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, sy(HOOP.z, rimY), HOOP.rimR, HOOP.rimR * ZS, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
}

/** Net and the front half of one rim (drawn over players and the ball). */
export function drawHoopFront(ctx: CanvasRenderingContext2D, hx: number, camX: number, rimY: number, sway: number, time: number) {
  const x = hx - camX;
  const ry = sy(HOOP.z, rimY);
  const r = HOOP.rimR;
  const gold = rimY > HOOP.rimY;
  ctx.strokeStyle = gold ? 'rgba(255,240,190,0.9)' : 'rgba(245,245,245,0.85)';
  ctx.lineWidth = 1;
  const wob = Math.sin(time * 30) * sway * 4;
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const tx = x + Math.cos(a) * r;
    const ty = ry - Math.sin(a) * r * ZS;
    const bx = x + Math.cos(a) * r * 0.55 + wob;
    const by = ry + 24 + sway * 8;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
  }
  for (let k = 1; k <= 2; k++) {
    const yy = ry + k * 8 + sway * k * 2;
    const rr = r * (1 - k * 0.15);
    ctx.beginPath(); ctx.ellipse(x + wob * k * 0.5, yy, rr, rr * ZS * 0.8, 0, 0, Math.PI); ctx.stroke();
  }
  ctx.strokeStyle = gold ? '#ffcf3f' : '#ff6a26';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, ry, r, r * ZS, 0, 0, Math.PI);
  ctx.stroke();
}

/** Launch pad on the floor. `charge` runs 0..1; at 1 it is ready and pulses. */
export function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, charge: number, time: number) {
  const ready = charge >= 1;
  const rx = 24, ry = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, rx + 2, ry + 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ready ? '#ffd23f' : '#5e6370';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1a1a22';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (ready) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, rx + 3 + pulse * 3, ry + 1.5 + pulse * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    // Up arrows.
    ctx.fillStyle = '#1a1a22';
    for (const dx of [-9, 0, 9]) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y - 6); ctx.lineTo(x + dx + 4.5, y + 1); ctx.lineTo(x + dx - 4.5, y + 1);
      ctx.fill();
      ctx.fillRect(x + dx - 1.6, y + 1, 3.2, 4);
    }
  } else {
    // Recharge ring.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, rx - 5, ry - 3, 0, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2); ctx.stroke();
  }
}

/** Throwable items: 0 trash can, 1 traffic cone, 2 crate. */
export function drawItem(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, spin: number) {
  ctx.save();
  ctx.translate(x, y - 9);
  ctx.rotate(spin);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1a1a22';
  if (kind === 0) {
    ctx.fillStyle = '#aab3c0';
    roundRect(ctx, -7, -9, 14, 18, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7d8794';
    ctx.fillRect(-8.5, -11, 17, 4);
    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-3, 8); ctx.moveTo(3, -6); ctx.lineTo(3, 8); ctx.stroke();
  } else if (kind === 1) {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3.6, -3, 7.2, 3);
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(-9, 7, 18, 3);
    ctx.strokeRect(-9, 7, 18, 3);
  } else {
    ctx.fillStyle = '#b5814a';
    ctx.fillRect(-9, -9, 18, 18); ctx.strokeRect(-9, -9, 18, 18);
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
  }
  ctx.restore();
}
