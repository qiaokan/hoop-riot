// Sprites for everything strange on the court: items, rides, hazards and the saucer.
// All drawn with canvas paths; x, y is the point on the floor (or the object's centre where noted).

import type { ItemKind, RideKind } from '../core/teams';
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

// ---------------------------------------------------------------- rides

/** Vehicles are drawn larger than their outlines below, to sit right next to the big-headed players. */
const RIDE_SCALE: Record<RideKind, number> = { board: 1.3, tank: 1.45, heli: 1.5 };

/** The part of a ride that sits behind its rider. (x, y) is the floor point under it; `alt` its height. */
export function drawRideBack(ctx: CanvasRenderingContext2D, kind: RideKind, x: number, y: number, facing: number, time: number, ridden: boolean, anim: number) {
  const k = RIDE_SCALE[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * k, k);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
  if (kind === 'board') {
    // Deck and wheels: the rider stands on top.
    ctx.fillStyle = '#2b2b33';
    for (const wx of [-13, 13]) { ctx.beginPath(); ctx.arc(wx, -3, 3.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ff4fa3';
    ctx.beginPath(); ctx.moveTo(-22, -11); ctx.quadraticCurveTo(-19, -6, -14, -6.5); ctx.lineTo(14, -6.5); ctx.quadraticCurveTo(20, -6, 23, -11);
    ctx.lineTo(21, -11.5); ctx.quadraticCurveTo(18, -9.5, 14, -9.5); ctx.lineTo(-14, -9.5); ctx.quadraticCurveTo(-18, -9.5, -20, -11.5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    void anim;
  } else if (kind === 'heli') {
    // Tail boom, mast and rotor.
    ctx.fillStyle = '#e8b21e';
    ctx.beginPath(); ctx.moveTo(-22, -34); ctx.lineTo(-66, -44); ctx.lineTo(-66, -38); ctx.lineTo(-22, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c23a2a';
    ctx.beginPath(); ctx.moveTo(-62, -40); ctx.lineTo(-72, -58); ctx.lineTo(-64, -58); ctx.lineTo(-56, -42); ctx.closePath(); ctx.fill(); ctx.stroke();
    const tr = ridden ? time * 50 : 0.6;
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-67 + Math.cos(tr) * 9, -50 + Math.sin(tr) * 9); ctx.lineTo(-67 - Math.cos(tr) * 9, -50 - Math.sin(tr) * 9); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.fillStyle = '#6b6b78';
    ctx.fillRect(-9, -112, 5, 66); ctx.strokeRect(-9, -112, 5, 66);
    // Main rotor: a blur when spinning.
    if (ridden) {
      const w = 62 * (0.35 + 0.65 * Math.abs(Math.sin(time * 38)));
      ctx.fillStyle = 'rgba(40,40,52,0.55)';
      ctx.beginPath(); ctx.ellipse(-6.5, -113, w, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(200,205,220,0.22)';
      ctx.beginPath(); ctx.ellipse(-6.5, -113, 62, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#2b2b33';
      roundRect(ctx, -62, -116, 111, 4, 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** The part of a ride that covers its rider's legs. `hp` is 0..1 (tanks smoke when damaged). */
export function drawRideFront(ctx: CanvasRenderingContext2D, kind: RideKind, x: number, y: number, facing: number, time: number, ridden: boolean, anim: number, team: string | null) {
  const k = RIDE_SCALE[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * k, k);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
  if (kind === 'tank') {
    // Barrel.
    ctx.fillStyle = '#4d6b3a';
    ctx.fillRect(14, -40, 34, 7); ctx.strokeRect(14, -40, 34, 7);
    ctx.fillStyle = '#2f4423';
    ctx.fillRect(44, -42, 7, 11); ctx.strokeRect(44, -42, 7, 11);
    // Turret with an open hatch (the driver stands in it).
    ctx.fillStyle = '#5f8247';
    ctx.beginPath(); ctx.moveTo(-22, -28); ctx.lineTo(-17, -46); ctx.lineTo(17, -46); ctx.lineTo(24, -28); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Hull.
    ctx.fillStyle = '#4d6b3a';
    ctx.beginPath(); ctx.moveTo(-40, -12); ctx.lineTo(-34, -30); ctx.lineTo(34, -30); ctx.lineTo(44, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = team ?? '#e8c66a';
    star5(ctx, 0, -21, 6);
    // Tracks.
    ctx.fillStyle = '#23232d';
    roundRect(ctx, -44, -14, 90, 15, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b6b78';
    for (let i = 0; i < 5; i++) {
      const wx = -34 + i * 17.5;
      ctx.beginPath(); ctx.arc(wx, -6.5, 5, 0, Math.PI * 2); ctx.fill();
      const a = anim * 0.12 + i;
      ctx.strokeStyle = '#23232d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(wx, -6.5); ctx.lineTo(wx + Math.cos(a) * 5, -6.5 + Math.sin(a) * 5); ctx.stroke();
    }
    void time; void ridden;
  } else if (kind === 'heli') {
    // Skids.
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(28, 0); ctx.moveTo(-14, 0); ctx.lineTo(-10, -10); ctx.moveTo(14, 0); ctx.lineTo(10, -10); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    // Open tub: the pilot sits in it, head and arms in the air.
    ctx.fillStyle = '#f4c531';
    ctx.beginPath();
    ctx.moveTo(-28, -40); ctx.quadraticCurveTo(-32, -8, -8, -8); ctx.lineTo(16, -8); ctx.quadraticCurveTo(38, -10, 36, -36);
    ctx.lineTo(28, -36); ctx.quadraticCurveTo(26, -30, 16, -30); ctx.lineTo(-18, -30); ctx.lineTo(-20, -40); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = team ?? '#c23a2a';
    ctx.fillRect(-20, -22, 44, 5);
    // Windscreen.
    ctx.fillStyle = 'rgba(160,225,255,0.55)';
    ctx.beginPath(); ctx.moveTo(28, -36); ctx.quadraticCurveTo(40, -52, 26, -62); ctx.lineTo(22, -58); ctx.quadraticCurveTo(30, -50, 22, -36); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function star5(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------- hazards

export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 30) * 0.8);
  ctx.scale(dir * 1.35, 1.35);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
  // Body.
  ctx.fillStyle = '#d8372a';
  ctx.beginPath();
  ctx.moveTo(-52, -8); ctx.lineTo(-52, -26); ctx.quadraticCurveTo(-50, -32, -40, -33); ctx.lineTo(-26, -50); ctx.lineTo(14, -50);
  ctx.lineTo(30, -33); ctx.lineTo(48, -30); ctx.quadraticCurveTo(54, -28, 54, -20); ctx.lineTo(54, -8); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Windows.
  ctx.fillStyle = '#bfe9ff';
  ctx.beginPath(); ctx.moveTo(-34, -34); ctx.lineTo(-23, -46); ctx.lineTo(-6, -46); ctx.lineTo(-6, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1, -34); ctx.lineTo(-1, -46); ctx.lineTo(12, -46); ctx.lineTo(23, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Lights and bumper.
  ctx.fillStyle = '#fff3a0';
  ctx.beginPath(); ctx.ellipse(51, -22, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8f96a8';
  ctx.fillRect(-54, -12, 110, 5);
  // Wheels.
  for (const wx of [-32, 32]) {
    ctx.fillStyle = '#23232d';
    ctx.beginPath(); ctx.arc(wx, -8, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c4cad8';
    ctx.beginPath(); ctx.arc(wx, -8, 4, 0, Math.PI * 2); ctx.fill();
    const a = time * 30;
    ctx.beginPath(); ctx.moveTo(wx, -8); ctx.lineTo(wx + Math.cos(a) * 9, -8 + Math.sin(a) * 9); ctx.stroke();
  }
  ctx.restore();
}

export function drawDog(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, time: number, i: number) {
  const ph = time * 22 + i * 1.7;
  const hop = Math.abs(Math.sin(ph)) * 5;
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.scale(dir, 1);
  ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
  const fur = ['#8a5a2b', '#3a3a44', '#c9a25a', '#6b4a1e'][i % 4];
  // Legs: stretched out and gathered in turn.
  const s = Math.sin(ph) * 9;
  ctx.lineWidth = 3.4; ctx.strokeStyle = OUT;
  ctx.beginPath(); ctx.moveTo(9, -9); ctx.lineTo(12 + s, 0 + hop * 0.2); ctx.moveTo(-9, -9); ctx.lineTo(-12 - s, 0 + hop * 0.2); ctx.stroke();
  ctx.lineWidth = 1.8;
  // Body, head, ear, tail.
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.ellipse(0, -13, 15, 7, -0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(16, -19, 7.5, 6, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(21, -18); ctx.lineTo(28, -16); ctx.lineTo(21, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, -23); ctx.lineTo(10, -30); ctx.lineTo(16, -25); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14, -15); ctx.quadraticCurveTo(-22, -22, -20, -28); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(18, -21, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.arc(18.5, -21, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(22, -15.5); ctx.lineTo(24, -12.5); ctx.lineTo(25.5, -15.8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

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

/** The saucer, centred at (x, y) on screen, with its beam reaching down to floorY. */
export function drawUfo(ctx: CanvasRenderingContext2D, x: number, y: number, floorY: number, time: number, beam: number) {
  // Beam: faint while hunting, bright while lifting someone.
  const g = ctx.createLinearGradient(0, y, 0, floorY);
  g.addColorStop(0, `rgba(150,255,190,${0.25 + 0.45 * beam})`);
  g.addColorStop(1, `rgba(150,255,190,${0.04 + 0.2 * beam})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - 14, y + 6); ctx.lineTo(x + 14, y + 6); ctx.lineTo(x + 34, floorY); ctx.lineTo(x - 34, floorY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(150,255,190,${0.35 + 0.5 * beam})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, floorY, 34, 13, 0, 0, Math.PI * 2); ctx.stroke();
  const bob = Math.sin(time * 4) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(Math.sin(time * 2.3) * 0.06);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  ctx.fillStyle = 'rgba(160,235,255,0.8)';
  ctx.beginPath(); ctx.ellipse(0, -7, 19, 15, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8f96a8';
  ctx.beginPath(); ctx.ellipse(0, 0, 46, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a6072';
  ctx.beginPath(); ctx.ellipse(0, 4, 30, 6, 0, 0, Math.PI); ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = (i + Math.floor(time * 8)) % 2 ? '#ffe14a' : '#ff4fa3';
    ctx.beginPath(); ctx.arc(-32 + i * 16, 0, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number) {
  ctx.fillStyle = 'rgba(255,170,60,0.7)';
  ctx.beginPath(); ctx.moveTo(x - dir * 6, y - 4); ctx.lineTo(x - dir * 30, y); ctx.lineTo(x - dir * 6, y + 4); ctx.fill();
  ctx.fillStyle = '#23232d';
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
