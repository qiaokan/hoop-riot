// Sprites for the things lying around the court: items, the bat and hammer, the wrecking ball and bumpers.
// Rides, the car, the dogs and the saucer are in vehicles.ts.
// All drawn with canvas paths; x, y is the point on the floor (or the object's centre where noted).

import type { ItemKind } from '../core/teams';
import { roundRect } from './sprites';

const OUT = '#1a1a22';
/** How much bigger items are drawn than their paths. */
export const ITEM_SCALE = 1.4;

/** An item, centred a little above (x, y). `fuse` < 0 means not lit. */
export function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, spin: number, fuse = -1, time = 0, armed = false) {
  ctx.save();
  // Drawn a size up from their paths, so they read next to the big-headed players.
  ctx.translate(x, y - (armed ? 3 : 9) * ITEM_SCALE);
  ctx.rotate(spin);
  ctx.scale(ITEM_SCALE, ITEM_SCALE);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'can':
      ctx.fillStyle = '#aab3c0';
      roundRect(ctx, -7, -9, 14, 18, 2); ctx.fill(); ctx.stroke();
      // Lit from the upper left: a bright streak, a dark far side, a dented lid.
      ctx.fillStyle = '#e6ecf3'; ctx.fillRect(-5.4, -6.5, 2.2, 14);
      ctx.fillStyle = '#7f8996'; ctx.fillRect(3.6, -6.5, 2.6, 14);
      ctx.fillStyle = '#7d8794';
      roundRect(ctx, -8.5, -11.5, 17, 4.5, 1.5); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-1.6, -6); ctx.lineTo(-1.6, 8); ctx.moveTo(1.6, -6); ctx.lineTo(1.6, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -13.5); ctx.lineTo(3, -13.5); ctx.stroke();
      break;
    case 'cone':
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath(); ctx.moveTo(-1.5, -11); ctx.lineTo(1.5, -11); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9540a';
      ctx.beginPath(); ctx.moveTo(1.5, -10.4); ctx.lineTo(6.2, 6.4); ctx.lineTo(2.4, 6.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(-3, -4.5); ctx.lineTo(3, -4.5); ctx.lineTo(4.3, 0); ctx.lineTo(-4.3, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(-9, 7, 18, 3);
      ctx.strokeRect(-9, 7, 18, 3);
      break;
    case 'crate':
      ctx.fillStyle = '#b5814a';
      ctx.fillRect(-9, -9, 18, 18);
      // Planks, a darker frame and brace, nail heads.
      ctx.fillStyle = '#c9965c';
      for (let i = 0; i < 3; i++) ctx.fillRect(-9, -9 + i * 6, 18, 2.2);
      ctx.strokeStyle = '#7a4f24'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.stroke();
      ctx.strokeRect(-7.6, -7.6, 15.2, 15.2);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.fillStyle = '#3a2a1a';
      for (const [nx, ny] of [[-7.4, -7.4], [7.4, -7.4], [-7.4, 7.4], [7.4, 7.4]]) { ctx.beginPath(); ctx.arc(nx, ny, 0.9, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'bomb': {
      // Flashes faster and faster as the fuse runs down.
      const lit = fuse >= 0;
      const hot = lit && Math.sin(time * (fuse < 1.2 ? 40 : 14)) > 0;
      ctx.fillStyle = hot ? '#d8372a' : '#23232d';
      ctx.beginPath(); ctx.arc(0, 1, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(-3, -2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b6b78';
      ctx.fillRect(-2.5, -11, 5, 4); ctx.strokeRect(-2.5, -11, 5, 4);
      ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(5, -16, 8, -13); ctx.stroke();
      if (lit) {
        const f = 2.5 + 2 * Math.abs(Math.sin(time * 31));
        ctx.fillStyle = '#ffe14a';
        ctx.beginPath(); ctx.arc(8, -13, f, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6a26';
        ctx.beginPath(); ctx.arc(8, -13, f * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'bat':
      ctx.rotate(-0.9);
      drawBat(ctx);
      break;
    case 'banana':
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.moveTo(-10, 2); ctx.quadraticCurveTo(0, 12, 10, -2); ctx.quadraticCurveTo(2, 5, -9, -1); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b4a1e';
      ctx.fillRect(9, -4, 3, 3);
      break;
    case 'hammer':
      ctx.rotate(-0.5);
      drawHammer(ctx);
      break;
    case 'ext':
      ctx.fillStyle = '#e23b3b';
      roundRect(ctx, -6, -8, 12, 18, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2b33';
      ctx.fillRect(-3, -12, 6, 4); ctx.strokeRect(-3, -12, 6, 4);
      ctx.beginPath(); ctx.moveTo(3, -10); ctx.lineTo(11, -8); ctx.lineTo(11, -4); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -2, 8, 4);
      break;
    case 'magnet':
      ctx.lineWidth = 6; ctx.strokeStyle = OUT;
      ctx.beginPath(); ctx.arc(0, 1, 7, Math.PI, 0); ctx.lineTo(7, 9); ctx.moveTo(-7, 1); ctx.lineTo(-7, 9); ctx.stroke();
      ctx.lineWidth = 3.4; ctx.strokeStyle = '#e23b3b';
      ctx.beginPath(); ctx.arc(0, 1, 7, Math.PI, 0); ctx.lineTo(7, 5); ctx.moveTo(-7, 1); ctx.lineTo(-7, 5); ctx.stroke();
      ctx.strokeStyle = '#f1f1f6';
      ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(7, 9); ctx.moveTo(-7, 5); ctx.lineTo(-7, 9); ctx.stroke();
      break;
    case 'shoes':
      // A boot on a spring.
      ctx.strokeStyle = '#9aa0b5'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(i % 2 ? 5 : -5, 9 - i * 1.6);
      ctx.stroke();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.fillStyle = '#3fd07a';
      ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(-7, -11); ctx.lineTo(-1, -11); ctx.lineTo(0, -6); ctx.lineTo(9, -5); ctx.lineTo(9, -1); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
  }
  ctx.restore();
}

/** A bat with its grip at the origin, pointing up. */
export function drawBat(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 1.5; ctx.strokeStyle = OUT;
  ctx.fillStyle = '#d9a866';
  ctx.beginPath();
  ctx.moveTo(-1.6, 4); ctx.lineTo(-1.8, -8); ctx.lineTo(-3.6, -22); ctx.quadraticCurveTo(0, -27, 3.6, -22); ctx.lineTo(1.8, -8); ctx.lineTo(1.6, 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6b4a1e';
  ctx.fillRect(-2.4, 2, 4.8, 3);
}

/** A big mallet with its grip at the origin, pointing up. */
export function drawHammer(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 1.5; ctx.strokeStyle = OUT;
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(-1.6, -20, 3.2, 26); ctx.strokeRect(-1.6, -20, 3.2, 26);
  ctx.fillStyle = '#8f96a8';
  roundRect(ctx, -10, -30, 20, 12, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c4cad8';
  ctx.fillRect(-10, -29, 4, 10);
}

export function star5(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------- hazards

/** The wrecking ball. (x, y) is its centre on screen; the chain runs up to (px, py). */
export function drawWrecker(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, py: number) {
  ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 5;
  ctx.setLineDash([7, 4]);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y - 20); ctx.stroke();
  ctx.setLineDash([]);
  const g = ctx.createRadialGradient(x - 9, y - 10, 3, x, y, 28);
  g.addColorStop(0, '#8f96a8');
  g.addColorStop(1, '#2b2b33');
  ctx.fillStyle = g;
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(x - 5, y - 30, 10, 8);
}

/** A pinball bumper standing on the floor at (x, y). `hit` is 0..1 right after it fires. */
export function drawBumper(ctx: CanvasRenderingContext2D, x: number, y: number, hit: number, time: number) {
  const pop = hit * 5;
  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  ctx.fillStyle = '#2b2b45';
  ctx.beginPath(); ctx.ellipse(x, y, 25, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hit > 0 ? '#ffffff' : '#ff4fa3';
  ctx.beginPath(); ctx.ellipse(x, y - 9, 22 + pop, 9.5 + pop * 0.4, 0, 0, Math.PI); ctx.lineTo(x - 22 - pop, y - 9); ctx.fill();
  ctx.fillRect(x - 22 - pop, y - 16, 44 + pop * 2, 8);
  ctx.fillStyle = hit > 0 ? '#fff6a8' : '#ffe14a';
  ctx.beginPath(); ctx.ellipse(x, y - 17, 22 + pop, 9.5 + pop * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = Math.floor(time * 4) % 2 ? '#ff4fa3' : '#3ff0ff';
  star5(ctx, x, y - 17, 7);
}
