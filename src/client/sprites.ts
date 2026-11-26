import { HIGH_RIM_Y, HOOP } from '../core/constants';
import { ZS, sy } from './view';

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
