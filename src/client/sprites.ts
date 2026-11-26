import { HOOP } from '../core/constants';
import type { Player } from '../core/game';
import type { TeamDef } from '../core/teams';
import { ZS, sy } from './view';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

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

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, z: number, height: number, size: number) {
  const k = Math.max(0.35, 1 - height / 260);
  ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
  ctx.beginPath();
  ctx.ellipse(x, sy(z), size * k, size * 0.38 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, team: TeamDef, sx: number, time: number, isHuman: boolean, hasBall: boolean) {
  const d = p.def;
  const footY = sy(p.z, p.y);
  const airborne = p.y > 1;
  const moving = Math.hypot(p.vx, p.vz) > 25 && !airborne;
  const phase = p.anim * 0.085;
  const swing = moving ? Math.sin(phase) * 0.75 : 0;
  const bw = d.build;

  ctx.save();
  ctx.translate(sx, footY);

  if (p.state === 'down') {
    ctx.translate(0, -8);
    ctx.rotate(-p.facing * Math.PI / 2 * Math.min(1, p.t * 6));
  } else if (p.state === 'stun') {
    ctx.rotate(-p.facing * 0.22);
  } else if (p.state === 'tackle') {
    ctx.translate(0, -12);
    ctx.rotate(p.facing * 1.15);
  } else if (p.state === 'airkick') {
    ctx.rotate(-p.facing * 0.4);
  }
  if (p.state === 'spin') {
    // Whirl: flip the figure back and forth quickly.
    const c = Math.cos(p.t * 36);
    ctx.scale(p.facing * (Math.abs(c) < 0.25 ? (c < 0 ? -0.25 : 0.25) : c), 1);
  } else {
    ctx.scale(p.facing, 1);
  }
  if (p.invuln > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.45;

  const skin = d.skin;
  const skinD = shade(skin, 0.82);
  const jersey = team.jersey;
  const shorts = team.shorts;

  // Pose angles (0 = straight down, positive = forward).
  let legF = swing, legB = -swing, kneeF = 0, kneeB = 0;
  let armF = -swing * 0.8, armB = swing * 0.8, elbowF = -0.3, elbowB = -0.3;
  const hipY = -30;
  if (airborne) { legF = 0.6; legB = -0.2; kneeF = -1.2; kneeB = -0.9; }
  switch (p.state) {
    case 'punch': {
      const ext = p.t < 0.16 ? Math.min(1, p.t / 0.06) : Math.max(0, 1 - (p.t - 0.16) / 0.1);
      armF = 0.4 + ext * 1.2; elbowF = -0.9 * (1 - ext);
      armB = -0.6; legF = 0.5; legB = -0.45;
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
      armF = 1.4; armB = 2; legF = 0.2; legB = -0.2;
      break;
    default:
      if (hasBall && !airborne) { armF = 0.9 + Math.abs(swing) * 0.2; elbowF = -0.4; }
  }

  // Back arm + back leg.
  limb(ctx, -2, -52, armB, 22, 6, shade(skin, 0.7), shade(skin, 0.7), -elbowB);
  limb(ctx, -3, hipY, legB, 30, 8, shade(shorts, 0.75), skinD, kneeB);
  const [bfx, bfy] = [-3 + Math.sin(legB) * 15 + Math.sin(legB + kneeB) * 15, hipY + Math.cos(legB) * 15 + Math.cos(legB + kneeB) * 15];
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect(bfx - 4, bfy - 3, 11, 6);

  // Front leg.
  limb(ctx, 3, hipY, legF, 30, 8, shorts, skin, kneeF);
  const [ffx, ffy] = [3 + Math.sin(legF) * 15 + Math.sin(legF + kneeF) * 15, hipY + Math.cos(legF) * 15 + Math.cos(legF + kneeF) * 15];
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ffx - 4, ffy - 3, 12, 6);
  ctx.fillStyle = team.trim;
  ctx.fillRect(ffx - 4, ffy + 1, 12, 2);

  // Shorts block.
  ctx.fillStyle = shorts;
  ctx.fillRect(-10 * bw, hipY - 4, 20 * bw, 10);

  // Torso.
  ctx.fillStyle = jersey;
  roundRect(ctx, -11 * bw, -58, 22 * bw, 30, 5);
  ctx.fill();
  ctx.fillStyle = team.trim;
  ctx.fillRect(-11 * bw, -58, 22 * bw, 3);
  ctx.fillRect(-11 * bw, -31, 22 * bw, 3);
  ctx.fillStyle = shade(jersey, 0.75);
  ctx.fillRect(-11 * bw, -55, 4, 24);
  ctx.save();
  ctx.scale(p.facing, 1);
  ctx.fillStyle = team.trim;
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(d.num), 0, -38);
  ctx.restore();

  // Head.
  const hy = -68;
  ctx.fillStyle = skinD;
  ctx.fillRect(-3, -62, 6, 5);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, hy, 10.5, 0, Math.PI * 2); ctx.fill();
  drawHair(ctx, d.hairStyle, d.hair, hy);
  // Headband.
  ctx.fillStyle = team.trim;
  ctx.fillRect(-10.5, hy - 5, 21, 3);
  // Face.
  ctx.fillStyle = '#1b1b1b';
  const eyeY = hy - 1;
  if (p.state === 'down' || p.state === 'stun') {
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4, eyeY - 2); ctx.lineTo(8, eyeY + 2); ctx.moveTo(8, eyeY - 2); ctx.lineTo(4, eyeY + 2); ctx.stroke();
  } else {
    ctx.fillRect(5, eyeY - 2, 2.5, 4);
  }
  ctx.fillStyle = shade(skin, 0.7);
  ctx.fillRect(4, hy + 5, 4, 1.5);

  // Front arm on top.
  const fistColor = skin;
  const [hx, hyy] = limb(ctx, 2, -52, armF, 22, 6.5, skin, skin, -elbowF);
  ctx.fillStyle = fistColor;
  ctx.beginPath(); ctx.arc(hx, hyy, 4, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // Human marker.
  if (isHuman && p.state !== 'down') {
    const my = footY - 96 + Math.sin(time * 6) * 2;
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(sx - 7, my - 8); ctx.lineTo(sx + 7, my - 8); ctx.lineTo(sx, my);
    ctx.fill();
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P1', sx, my - 11);
  }
}

function drawHair(ctx: CanvasRenderingContext2D, style: string, color: string, hy: number) {
  ctx.fillStyle = color;
  switch (style) {
    case 'spiky':
      ctx.beginPath();
      ctx.moveTo(-11, hy - 2);
      for (let i = 0; i < 5; i++) { ctx.lineTo(-9 + i * 5, hy - 17 - (i % 2) * 3); ctx.lineTo(-6 + i * 5, hy - 8); }
      ctx.lineTo(11, hy - 2);
      ctx.fill();
      break;
    case 'flat':
      ctx.fillRect(-11, hy - 13, 22, 8);
      break;
    case 'afro':
      ctx.beginPath(); ctx.arc(-1, hy - 7, 14, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
      break;
    case 'mohawk':
      ctx.fillRect(-3, hy - 22, 7, 14);
      break;
    case 'bun':
      ctx.fillRect(-11, hy - 12, 22, 6);
      ctx.beginPath(); ctx.arc(-6, hy - 15, 5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bald':
    default:
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(-3, hy - 6, 3, 0, Math.PI * 2); ctx.fill();
  }
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

export function drawBall(ctx: CanvasRenderingContext2D, sx: number, syy: number, spin: number, glow = false) {
  if (glow) {
    const g = ctx.createRadialGradient(sx, syy, 2, sx, syy, 26);
    g.addColorStop(0, 'rgba(255,240,150,0.9)');
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, syy, 26, 0, Math.PI * 2); ctx.fill();
  }
  const r = 8;
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

/** Stanchion, backboard and the back half of the rim. */
export function drawHoopBack(ctx: CanvasRenderingContext2D, hx: number, camX: number) {
  const left = hx < 750;
  const dir = left ? 1 : -1;
  const x = hx - camX;
  const poleX = x - dir * 70;
  const baseY = sy(HOOP.z - 4);
  const boardX = x - dir * 22;
  // Pole and arm.
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(poleX - 4, sy(HOOP.z, HOOP.rimY + 70), 8, baseY - sy(HOOP.z, HOOP.rimY + 70));
  ctx.fillStyle = '#2e323b';
  ctx.fillRect(poleX - 12, baseY - 6, 24, 10);
  ctx.strokeStyle = '#4a4f5c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(poleX, sy(HOOP.z, HOOP.rimY + 60));
  ctx.lineTo(boardX, sy(HOOP.z, HOOP.rimY + 30));
  ctx.stroke();
  // Backboard (slight skew to read as 3D).
  const zb0 = HOOP.z - 36, zb1 = HOOP.z + 36;
  const yb0 = HOOP.rimY - 8, yb1 = HOOP.rimY + 62;
  const skew = (z: number) => boardX + (z - HOOP.z) * 0.32 * -dir;
  ctx.fillStyle = 'rgba(235,240,250,0.92)';
  ctx.strokeStyle = '#d33';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(skew(zb0), sy(zb0, yb1));
  ctx.lineTo(skew(zb1), sy(zb1, yb1));
  ctx.lineTo(skew(zb1), sy(zb1, yb0));
  ctx.lineTo(skew(zb0), sy(zb0, yb0));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.stroke();
  ctx.strokeStyle = '#e23b3b';
  ctx.strokeRect(skew(HOOP.z) - 7, sy(HOOP.z, HOOP.rimY + 24), 14, 18);
  // Back half of rim.
  ctx.strokeStyle = '#e8541c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, sy(HOOP.z, HOOP.rimY), HOOP.rimR, HOOP.rimR * ZS, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}

/** Net and the front half of the rim (drawn over players/ball). */
export function drawHoopFront(ctx: CanvasRenderingContext2D, hx: number, camX: number, sway: number, time: number) {
  const x = hx - camX;
  const ry = sy(HOOP.z, HOOP.rimY);
  const r = HOOP.rimR;
  ctx.strokeStyle = 'rgba(245,245,245,0.85)';
  ctx.lineWidth = 1;
  const wob = Math.sin(time * 30) * sway * 4;
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const tx = x + Math.cos(a) * r;
    const ty = ry + Math.sin(a) * r * ZS * -1;
    const bx = x + Math.cos(a) * r * 0.55 + wob;
    const by = ry + 24 + sway * 8;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
  }
  for (let k = 1; k <= 2; k++) {
    const yy = ry + k * 8 + sway * k * 2;
    const rr = r * (1 - k * 0.15);
    ctx.beginPath(); ctx.ellipse(x + wob * k * 0.5, yy, rr, rr * ZS * 0.8, 0, 0, Math.PI); ctx.stroke();
  }
  ctx.strokeStyle = '#ff6a26';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, ry, r, r * ZS, 0, 0, Math.PI);
  ctx.stroke();
}
