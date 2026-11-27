// Everything that drives, runs or flies across the court: the three rides, the car, the dogs,
// the saucer and the tank's shell. Drawn with canvas paths and lit from above and in front.
// Rides keep a little drawn-only state (pitch, recoil, wheel and rotor angles) so they rock,
// kick and spin up instead of sliding around as rigid pictures.

import type { RideKind } from '../core/teams';
import { RIDE, Ride } from '../core/toys';
import { shade } from './character';
import { roundRect } from './sprites';
import { star5 } from './toysprites';

const OUT = '#1a1a22';
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
}
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0, a0 = 0, a1 = TAU) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, a0, a1);
}
/** A wheel seen side-on: tyre, rim, turning spokes, and a glint on the tyre. */
function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, tyre: string, rim: string, spokes: number) {
  ctx.save();
  ctx.fillStyle = tyre;
  disc(ctx, x, y, r); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rim;
  disc(ctx, x, y, r * 0.58); ctx.fill();
  ctx.strokeStyle = shade(rim, 0.5); ctx.lineWidth = Math.max(0.9, r * 0.13);
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const a = ang + (i * TAU) / spokes;
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.56, y + Math.sin(a) * r * 0.56);
  }
  ctx.stroke();
  ctx.fillStyle = shade(rim, 0.55);
  disc(ctx, x, y, r * 0.17); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = Math.max(0.8, r * 0.1);
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, -2.5, -1.3); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- rides

/** Vehicles are drawn larger than their outlines below, to sit right next to the big-headed players. */
const RIDE_SCALE: Record<RideKind, number> = { board: 1.3, tank: 1.45, heli: 1.5 };
/** Height above the floor point (in the ride's own units) that it pitches about. */
const PIVOT: Record<RideKind, number> = { board: 4, tank: 6, heli: 30 };

export interface RideAnim {
  /** Pitch (positive = nose down) on a spring. */
  pitch: number; pitchV: number;
  /** 1 right after the weapon fires, fading to 0. */
  kick: number;
  lastCd: number;
  /** Distance rolled, for wheels and tracks. */
  roll: number;
  /** Rotor angle and how spun-up it is (0..1). */
  rotor: number; spin: number;
  pvx: number;
}
const rideAnims = new WeakMap<Ride, RideAnim>();
function animOf(r: Ride): RideAnim {
  let a = rideAnims.get(r);
  if (!a) {
    a = { pitch: 0, pitchV: 0, kick: 0, lastCd: r.cd, roll: 0, rotor: 0.5, spin: 0, pvx: r.vx };
    rideAnims.set(r, a);
  }
  return a;
}

/** A ride's drawn-only motion (pitch, recoil, wheels, rotor), as `stepRide` last left it. */
export function rideAnim(r: Ride): RideAnim {
  return animOf(r);
}

/** Advance a ride's drawn-only motion. Call once a frame, before drawing it or its rider. */
export function stepRide(r: Ride, dt: number) {
  const a = animOf(r);
  if (dt <= 0) return;
  dt = Math.min(dt, 1 / 30);
  const along = r.vx * r.facing;
  const acc = clamp((r.vx - a.pvx) / dt, -2500, 2500) * r.facing;
  a.pvx = r.vx;
  if (r.cd > a.lastCd + 0.5) a.kick = 1;
  a.lastCd = r.cd;
  a.kick = Math.max(0, a.kick - dt * (r.kind === 'board' ? 2.2 : 3.2));
  // Under power the nose lifts; braking drops it. A helicopter tips into its travel instead.
  let target: number, w: number;
  if (r.kind === 'board') { target = clamp(-acc * 0.0003, -0.2, 0.1) - a.kick * 0.1; w = 16; }
  else if (r.kind === 'tank') { target = clamp(-acc * 0.0007, -0.06, 0.06) - a.kick * a.kick * 0.09; w = 13; }
  else { target = r.y > 4 ? clamp(along / 230, -1, 1) * 0.15 : 0; w = 7; }
  a.pitchV += (-2 * 0.45 * w * a.pitchV - w * w * (a.pitch - target)) * dt;
  a.pitch += a.pitchV * dt;
  a.roll += Math.hypot(r.vx, r.vz) * (along < 0 ? -1 : 1) * dt;
  const up = r.rider !== null || r.y > 2 ? 1 : 0;
  a.spin += (up - a.spin) * (1 - Math.exp(-dt * (up ? 3 : 0.9)));
  a.rotor += a.spin * 34 * dt;
}

/** How a ride's rider should be tipped to stay planted on it: an angle about a point `py` below their feet. */
export function rideTilt(r: Ride): { a: number; py: number } {
  return { a: animOf(r).pitch * r.facing, py: Math.max(0, RIDE[r.kind].seat) - PIVOT[r.kind] * RIDE_SCALE[r.kind] };
}

function enter(ctx: CanvasRenderingContext2D, r: Ride, x: number, y: number): RideAnim {
  const k = RIDE_SCALE[r.kind], a = animOf(r);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r.facing * k, k);
  ctx.translate(0, -PIVOT[r.kind]); ctx.rotate(a.pitch); ctx.translate(0, PIVOT[r.kind]);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return a;
}

/** The part of a ride that sits behind its rider. (x, y) is the point under it on screen. */
export function drawRideBack(ctx: CanvasRenderingContext2D, r: Ride, x: number, y: number, time: number, team: string | null) {
  const ridden = r.rider !== null;
  const speed = Math.hypot(r.vx, r.vz);
  if (r.kind === 'heli') {
    // Downwash rippling out over the floor.
    const a0 = animOf(r);
    if (a0.spin > 0.3 && r.y > 10) {
      ctx.lineWidth = 2;
      for (let j = 0; j < 2; j++) {
        const ph = (time * 1.5 + j / 2) % 1, rr = 34 + ph * 60;
        ctx.strokeStyle = `rgba(255,255,255,${0.26 * (1 - ph) * a0.spin})`;
        oval(ctx, x, y + r.y, rr, rr * 0.3); ctx.stroke();
      }
    }
  }
  const a = enter(ctx, r, x, y);
  if (r.kind === 'board') {
    const col = team ?? '#ff4fa3';
    // Speed lines.
    if (speed > 150) {
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const ph = (time * 6 + i * 0.37) % 1, len = (9 + speed * 0.05) * (1 - ph * 0.4), xx = -28 - ph * 24, yy = -3 - i * 4.5;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - len, yy); ctx.stroke();
      }
    }
    // The burst of speed is a jet under the tail.
    if (a.kick > 0.03) {
      const f = a.kick * (0.8 + 0.2 * Math.sin(time * 80));
      ctx.fillStyle = 'rgba(255,140,40,0.85)';
      ctx.beginPath(); ctx.moveTo(-24, -9.5); ctx.lineTo(-30 - 30 * f, -6.5); ctx.lineTo(-24, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath(); ctx.moveTo(-24, -8.3); ctx.lineTo(-27 - 15 * f, -6.6); ctx.lineTo(-24, -5); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.fillStyle = vgrad(ctx, -10, -4, '#c7ccd9', '#6b7183');
    ctx.beginPath(); ctx.moveTo(-16, -7); ctx.lineTo(-25, -10); ctx.lineTo(-25, -3.6); ctx.lineTo(-16, -5.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Trucks and wheels.
    for (const wx of [-13, 13]) {
      ctx.fillStyle = '#aab0c0';
      ctx.beginPath(); ctx.moveTo(wx - 3.2, -7); ctx.lineTo(wx + 3.2, -7); ctx.lineTo(wx + 1.4, -3.4); ctx.lineTo(wx - 1.4, -3.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      wheel(ctx, wx, -3.5, 3.7, a.roll / (3.7 * 1.3), '#f3e6c4', '#ff8a3c', 3);
    }
    // Deck: kicked up at both ends, grip tape on top, a stripe down the side.
    ctx.lineWidth = 2;
    ctx.fillStyle = vgrad(ctx, -14, -6.5, shade(col, 1.2), shade(col, 0.72));
    ctx.beginPath();
    ctx.moveTo(-24, -14); ctx.quadraticCurveTo(-21, -9.7, -15, -9.7); ctx.lineTo(15, -9.7); ctx.quadraticCurveTo(21, -9.7, 25, -14.6);
    ctx.lineTo(24.4, -12); ctx.quadraticCurveTo(20, -6.5, 15, -6.5); ctx.lineTo(-15, -6.5); ctx.quadraticCurveTo(-20, -6.5, -23.6, -11.6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-22, -12.4); ctx.quadraticCurveTo(-20, -9.9, -15, -9.9); ctx.lineTo(15, -9.9); ctx.quadraticCurveTo(20, -9.9, 23, -12.8); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-6, -7.6); ctx.lineTo(13, -7.6); ctx.stroke();
  } else if (r.kind === 'tank') {
    // Far track.
    ctx.fillStyle = '#15151b';
    roundRect(ctx, -41, -18, 88, 13, 6.5); ctx.fill(); ctx.stroke();
    // Exhaust.
    ctx.fillStyle = '#3a3a44';
    roundRect(ctx, -42, -35, 9, 5, 2); ctx.fill(); ctx.stroke();
    if (ridden) for (let i = 0; i < 3; i++) {
      const ph = (time * 1.7 + i / 3) % 1;
      ctx.fillStyle = `rgba(70,70,82,${0.5 * (1 - ph)})`;
      disc(ctx, -44 - ph * 15, -37 - ph * 15, 2.4 + ph * 5); ctx.fill();
    }
    // Whip aerial with a pennant in the driver's colours: it lags behind the tank.
    const sway = clamp(-a.pitch * 5 - (r.vx * r.facing) * 0.0022, -0.6, 0.6) + Math.sin(time * 9) * 0.03 * Math.min(1, speed / 60);
    const tx = -17 + Math.sin(sway) * 42, ty = -45 - Math.cos(sway) * 42;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-17, -45); ctx.quadraticCurveTo(-17, -68, tx, ty); ctx.stroke();
    const fl = Math.sin(time * 14) * 1.6 * (0.3 + Math.min(1, speed / 80));
    ctx.fillStyle = team ?? '#e8c66a';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 12, ty + 3.5 + fl); ctx.lineTo(tx, ty + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    // The hatch lid, thrown open behind the driver.
    ctx.lineWidth = 2;
    ctx.fillStyle = vgrad(ctx, -62, -46, '#6f9552', '#3f5a30');
    oval(ctx, -11.5, -53, 4, 8.5, -0.28); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    oval(ctx, -11.5, -53, 2.2, 5.5, -0.28); ctx.stroke();
  } else {
    const body = '#f4c531', bodyD = '#c98f14';
    // Far skid.
    ctx.strokeStyle = '#15151b'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-22, -3); ctx.lineTo(25, -3); ctx.quadraticCurveTo(31, -3, 33, -8); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    // Tail boom, stabiliser, fin.
    ctx.fillStyle = vgrad(ctx, -45, -20, '#ffdf6a', bodyD);
    ctx.beginPath(); ctx.moveTo(-20, -37); ctx.lineTo(-66, -45.5); ctx.lineTo(-67.5, -39); ctx.lineTo(-22, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
    for (const bx of [-33, -45, -57]) {
      const t = (-20 - bx) / 46;
      ctx.beginPath(); ctx.moveTo(bx, -36.2 - 8.5 * t); ctx.lineTo(bx - 1, -21 - 18.5 * t); ctx.stroke();
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.fillStyle = bodyD;
    roundRect(ctx, -66, -42.5, 15, 3.2, 1.6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-64, -39.5); ctx.lineTo(-70, -32); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.fillStyle = team ?? '#c23a2a';
    ctx.beginPath(); ctx.moveTo(-59, -43); ctx.lineTo(-73, -62); ctx.lineTo(-65, -62); ctx.lineTo(-54, -43.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-63.5, -60); ctx.lineTo(-56, -47); ctx.stroke();
    // Tail rotor.
    const tx = -68.5, ty = -52;
    if (a.spin > 0.5) { ctx.fillStyle = `rgba(205,210,225,${0.3 * a.spin})`; disc(ctx, tx, ty, 10.5); ctx.fill(); }
    ctx.strokeStyle = a.spin > 0.5 ? 'rgba(43,43,51,0.55)' : '#2b2b33'; ctx.lineWidth = 2.2;
    const ta = a.rotor * 1.7;
    ctx.beginPath(); ctx.moveTo(tx + Math.cos(ta) * 10, ty + Math.sin(ta) * 10); ctx.lineTo(tx - Math.cos(ta) * 10, ty - Math.sin(ta) * 10); ctx.stroke();
    ctx.fillStyle = '#6b7183'; disc(ctx, tx, ty, 1.9); ctx.fill();
    // Blinking light on the fin.
    if (ridden && Math.floor(time * 2.5) % 2) {
      ctx.fillStyle = 'rgba(255,80,80,0.35)'; disc(ctx, -69, -62.5, 4.5); ctx.fill();
      ctx.fillStyle = '#ff5a5a'; disc(ctx, -69, -62.5, 1.9); ctx.fill();
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    // Engine cowl and the inside of the tub, behind the pilot.
    ctx.fillStyle = vgrad(ctx, -58, -38, '#ffdf6a', bodyD);
    ctx.beginPath(); ctx.moveTo(-25, -38); ctx.quadraticCurveTo(-26, -55, -13, -58); ctx.lineTo(-2, -58); ctx.lineTo(0, -38); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(-21 + i * 1.2, -49 + i * 3.4); ctx.lineTo(-12, -49 + i * 3.4); }
    ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.fillStyle = '#6b4a12';
    ctx.beginPath(); ctx.moveTo(-20, -40); ctx.lineTo(28, -36); ctx.lineTo(24, -12); ctx.lineTo(-22, -12); ctx.closePath(); ctx.fill();
    // Mast, hub and rotor.
    const hx = -6.5, hy = -113;
    ctx.fillStyle = '#7b8194';
    ctx.fillRect(-8.3, -111, 3.6, 54); ctx.strokeRect(-8.3, -111, 3.6, 54);
    ctx.fillStyle = '#4a4f5c';
    roundRect(ctx, -11, -62, 9, 5, 2); ctx.fill(); ctx.stroke();
    if (a.spin > 0.55) {
      ctx.fillStyle = `rgba(205,210,225,${0.22 * a.spin})`;
      oval(ctx, hx, hy, 64, 6.5); ctx.fill();
      ctx.fillStyle = 'rgba(40,40,52,0.42)';
      for (let b = 0; b < 2; b++) {
        const c = Math.abs(Math.cos(a.rotor + (b * Math.PI) / 2));
        oval(ctx, hx, hy, Math.max(8, 64 * c), 2.6); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
      oval(ctx, hx, hy, 64, 6.5, 0, 0.2, Math.PI - 0.2); ctx.stroke();
    } else {
      ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 3.6;
      for (let b = 0; b < 2; b++) {
        const th = a.rotor + (b * Math.PI) / 2, dx = Math.cos(th) * 60, dy = Math.sin(th) * 5;
        ctx.beginPath(); ctx.moveTo(hx - dx, hy - dy); ctx.lineTo(hx + dx, hy + dy); ctx.stroke();
      }
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.fillStyle = team ?? '#c23a2a';
    roundRect(ctx, hx - 5.5, hy - 4.5, 11, 7, 3); ctx.fill(); ctx.stroke();
    void body;
  }
  ctx.restore();
}

/** The part of a ride that covers its rider's legs. */
export function drawRideFront(ctx: CanvasRenderingContext2D, r: Ride, x: number, y: number, time: number, team: string | null) {
  if (r.kind === 'board') return;
  const ridden = r.rider !== null;
  const a = enter(ctx, r, x, y);
  if (r.kind === 'tank') {
    const G1 = '#7da35c', G2 = '#557640', G3 = '#33492a';
    const bx = -a.kick * a.kick * 9;
    // Barrel: slides back when it fires.
    ctx.fillStyle = vgrad(ctx, -41, -34, '#8fb56c', '#3f5a30');
    roundRect(ctx, 14 + bx, -41, 33, 7, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = G3;
    ctx.fillRect(29 + bx, -41, 4, 7);
    ctx.fillStyle = vgrad(ctx, -43, -32, '#6f9552', '#2a3b20');
    roundRect(ctx, 45 + bx, -43, 8.5, 11, 2.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUT;
    ctx.fillRect(47.6 + bx, -40.5, 1.3, 6); ctx.fillRect(50.2 + bx, -40.5, 1.3, 6);
    // Smoke curling off the muzzle after a shot.
    if (a.kick > 0.02 && a.kick < 0.9) for (let i = 0; i < 3; i++) {
      const ph = clamp(1 - a.kick + i * 0.12, 0, 1);
      ctx.fillStyle = `rgba(210,210,220,${0.45 * (1 - ph)})`;
      disc(ctx, 56 + ph * 10 + i * 3, -38 - ph * 16 - i * 2, 2.5 + ph * 6); ctx.fill();
    }
    // Turret.
    ctx.fillStyle = vgrad(ctx, -47, -28, '#98bf74', G2);
    ctx.beginPath();
    ctx.moveTo(-24, -28); ctx.lineTo(-21, -41); ctx.quadraticCurveTo(-19.5, -46, -13, -46); ctx.lineTo(12, -46); ctx.quadraticCurveTo(22, -45, 26, -34); ctx.lineTo(27, -28); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (team) { ctx.fillStyle = team; ctx.fillRect(-21.5, -38, 46, 3); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-21.5, -38, 46, 0.9); }
    ctx.fillStyle = G3;
    roundRect(ctx, -28.5, -40, 6.5, 10, 1.6); ctx.fill(); ctx.stroke();
    roundRect(ctx, 19, -44, 7.5, 13, 3.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#22321c';
    oval(ctx, 0, -46, 9.5, 2.3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-17, -44.3); ctx.lineTo(-11, -44.3); ctx.moveTo(11, -44.3); ctx.quadraticCurveTo(19, -43.5, 23, -36); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (const rx of [-15, -7, 1, 9, 17]) { disc(ctx, rx, -31, 0.9); ctx.fill(); }
    // Hull.
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.fillStyle = vgrad(ctx, -30, -12, G1, G3);
    ctx.beginPath();
    ctx.moveTo(-43, -13); ctx.lineTo(-39, -27); ctx.quadraticCurveTo(-38, -30, -34, -30); ctx.lineTo(30, -30); ctx.lineTo(48, -17); ctx.lineTo(47, -13); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-33, -28.4); ctx.lineTo(29, -28.4); ctx.lineTo(45, -17); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-21, -29); ctx.lineTo(-23, -14); ctx.moveTo(15, -29); ctx.lineTo(15, -14); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.fillStyle = '#fff3a0';
    disc(ctx, 40.5, -20.5, 2.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(team ?? '#e8c66a', 0.55);
    star5(ctx, -3, -20.6, 7.6);
    ctx.fillStyle = team ?? '#e8c66a';
    star5(ctx, -3, -21, 6.3);
    // Damage: scorch marks, cracks, and at the end a few stray sparks.
    const hp = r.hp / RIDE.tank.hp;
    if (hp <= 0.75) {
      ctx.fillStyle = 'rgba(22,18,14,0.55)';
      oval(ctx, 24, -22, 7, 4, -0.4); ctx.fill();
      ctx.strokeStyle = 'rgba(15,12,10,0.8)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(19, -27); ctx.lineTo(24, -23); ctx.lineTo(22, -20); ctx.lineTo(28, -16); ctx.stroke();
    }
    if (hp <= 0.5) {
      ctx.fillStyle = 'rgba(22,18,14,0.55)';
      oval(ctx, -28, -21, 6, 5, 0.5); ctx.fill();
      oval(ctx, 8, -40, 5, 3.4, 0.2); ctx.fill();
      ctx.strokeStyle = 'rgba(15,12,10,0.8)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-33, -26); ctx.lineTo(-28, -22); ctx.lineTo(-30, -18); ctx.moveTo(4, -44); ctx.lineTo(8, -40); ctx.lineTo(6, -36); ctx.lineTo(11, -33); ctx.stroke();
    }
    if (hp <= 0.25) {
      ctx.fillStyle = 'rgba(22,18,14,0.6)';
      oval(ctx, -8, -24, 9, 4.5, -0.2); ctx.fill();
      if (Math.floor(time * 11) % 3 === 0) {
        ctx.fillStyle = '#ffe14a';
        const s = (time * 37) % 1;
        disc(ctx, 22 + s * 6, -26 - s * 8, 1.5); ctx.fill();
        disc(ctx, -27 - s * 5, -24 - s * 9, 1.3); ctx.fill();
      }
    }
    // Fender, then the near track with its links running round and the wheels turning.
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.fillStyle = G2;
    ctx.beginPath(); ctx.moveTo(-46.5, -15.5); ctx.lineTo(48.5, -15.5); ctx.lineTo(51, -11.5); ctx.lineTo(48, -12.4); ctx.lineTo(-46.5, -12.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.fillStyle = '#23232d';
    roundRect(ctx, -45.5, -13.5, 93, 15, 7.5); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.strokeStyle = '#55556a'; ctx.lineWidth = 2.4; ctx.lineCap = 'butt';
    ctx.setLineDash([2.2, 2.8]); ctx.lineDashOffset = -a.roll / 1.45;
    roundRect(ctx, -44.2, -12.2, 90.4, 12.4, 6.2); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.3;
    const ang = a.roll / (5 * 1.45);
    wheel(ctx, -39.3, -7, 3.9, ang * 1.3, '#3a3a46', '#9aa1b3', 6);
    wheel(ctx, 41.3, -7, 3.9, ang * 1.3, '#3a3a46', '#9aa1b3', 6);
    for (const wx of [-27, -9, 9, 27]) wheel(ctx, wx, -5.6, 5.2, ang + wx, '#3a3a46', '#8a90a0', 4);
  } else {
    // Skids.
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(27, 0); ctx.quadraticCurveTo(33.5, 0, 35.5, -5.5); ctx.moveTo(-14, 0); ctx.lineTo(-10, -10); ctx.moveTo(14, 0); ctx.lineTo(10, -10); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    // The next bomb hangs under the belly once it is ready.
    if (ridden && r.cd <= 0) {
      ctx.fillStyle = '#23232d';
      disc(ctx, 0, -4.3, 3.7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      disc(ctx, -1.2, -5.6, 1); ctx.fill();
    }
    // Open tub: the pilot sits in it, head and arms in the air.
    ctx.lineWidth = 2;
    ctx.fillStyle = vgrad(ctx, -40, -8, '#ffe36e', '#dc9c16');
    ctx.beginPath();
    ctx.moveTo(-28, -40); ctx.quadraticCurveTo(-32, -8, -8, -8); ctx.lineTo(16, -8); ctx.quadraticCurveTo(38, -10, 36, -36);
    ctx.lineTo(28, -36); ctx.quadraticCurveTo(26, -30, 16, -30); ctx.lineTo(-18, -30); ctx.lineTo(-20, -40); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(125,70,0,0.26)';
    ctx.beginPath(); ctx.moveTo(-28, -19); ctx.quadraticCurveTo(-25, -9, -8, -9); ctx.lineTo(16, -9); ctx.quadraticCurveTo(31, -10, 35.5, -21); ctx.quadraticCurveTo(22, -12.5, 2, -12.5); ctx.quadraticCurveTo(-18, -12.5, -28, -19); ctx.closePath(); ctx.fill();
    ctx.fillStyle = team ?? '#c23a2a';
    ctx.beginPath(); ctx.moveTo(-29.2, -26); ctx.lineTo(36.6, -26); ctx.lineTo(36, -21); ctx.lineTo(-28.4, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-29, -26, 65.5, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-17, -28.6); ctx.lineTo(15, -28.6); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 6; i++) { disc(ctx, -22 + i * 9, -17.5, 0.8); ctx.fill(); }
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.fillStyle = '#fff3a0';
    disc(ctx, 33, -14.5, 2.4); ctx.fill(); ctx.stroke();
    // Windscreen with a streak of glare.
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(165,228,255,0.5)';
    ctx.beginPath(); ctx.moveTo(28, -36); ctx.quadraticCurveTo(41, -52, 26, -63); ctx.lineTo(22, -59); ctx.quadraticCurveTo(31, -50, 22, -36); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(30.5, -41); ctx.quadraticCurveTo(35, -50, 28.5, -57.5); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the car

export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, time: number) {
  const bob = Math.sin(time * 30) * 0.8, rock = Math.sin(time * 13) * 0.012 - 0.022;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * 1.35, 1.35);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  oval(ctx, 0, 1, 60, 6); ctx.fill();
  // Speed lines and exhaust behind it.
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const ph = (time * 5 + i * 0.29) % 1, yy = -9 - i * 11, len = 26 + ((i * 7) % 3) * 12, xx = -62 - ph * 40;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - len, yy); ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const ph = (time * 3 + i / 3) % 1;
    ctx.fillStyle = `rgba(90,90,102,${0.5 * (1 - ph)})`;
    disc(ctx, -60 - ph * 30, -9 - ph * 11, 3 + ph * 7); ctx.fill();
  }
  // Headlight beam.
  const beam = ctx.createLinearGradient(55, 0, 125, 0);
  beam.addColorStop(0, 'rgba(255,243,160,0.4)'); beam.addColorStop(1, 'rgba(255,243,160,0)');
  ctx.fillStyle = beam;
  ctx.beginPath(); ctx.moveTo(55, -25); ctx.lineTo(125, -38); ctx.lineTo(125, -4); ctx.lineTo(55, -19); ctx.closePath(); ctx.fill();

  ctx.save();
  ctx.translate(0, bob); ctx.rotate(rock);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  // Aerial, bent back by the wind, with a ball on the end.
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-40, -36); ctx.quadraticCurveTo(-42, -52, -52 + Math.sin(time * 17) * 1.5, -60); ctx.stroke();
  ctx.fillStyle = '#ff8a3c';
  disc(ctx, -52 + Math.sin(time * 17) * 1.5, -60, 2.3); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.fillStyle = '#8f96a8';
  roundRect(ctx, -60, -12.5, 9, 3.6, 1.6); ctx.fill(); ctx.stroke();
  // Spoiler.
  ctx.fillStyle = '#8a1c15';
  ctx.beginPath(); ctx.moveTo(-59, -37); ctx.lineTo(-46, -39.5); ctx.lineTo(-46, -36.5); ctx.lineTo(-59, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-51, -36); ctx.lineTo(-50, -32); ctx.stroke();
  // Body: long bonnet, cabin set back, fastback tail.
  ctx.lineWidth = 2;
  ctx.fillStyle = vgrad(ctx, -51, -8, '#ff7257', '#a8231a');
  ctx.beginPath();
  ctx.moveTo(-54, -9); ctx.lineTo(-55, -24); ctx.quadraticCurveTo(-55, -31, -46, -33); ctx.lineTo(-31, -49); ctx.quadraticCurveTo(-29, -51, -25, -51);
  ctx.lineTo(0, -51); ctx.quadraticCurveTo(4, -51, 7, -48); ctx.lineTo(20, -34); ctx.lineTo(46, -31); ctx.quadraticCurveTo(55, -29, 56, -21); ctx.lineTo(56, -9); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(70,0,0,0.3)';
  ctx.fillRect(-56, -16, 114, 8);
  // Flames licking back from the nose.
  ctx.fillStyle = '#ffb21e';
  ctx.beginPath(); ctx.moveTo(57, -29); ctx.quadraticCurveTo(40, -31, 27, -28); ctx.quadraticCurveTo(36, -26, 19, -23.5); ctx.quadraticCurveTo(32, -21.5, 13, -18); ctx.quadraticCurveTo(36, -16.5, 57, -16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff08a';
  ctx.beginPath(); ctx.moveTo(57, -26.5); ctx.quadraticCurveTo(46, -27.5, 37, -25.5); ctx.quadraticCurveTo(43, -24, 31, -22.2); ctx.quadraticCurveTo(41, -21, 28, -18.6); ctx.quadraticCurveTo(44, -18, 57, -18.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Door, handle, and a number on it (kept readable when the car runs right to left).
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-34, -33); ctx.lineTo(-34, -14); ctx.moveTo(8, -34); ctx.lineTo(8, -14); ctx.stroke();
  ctx.fillStyle = '#e6eaf2';
  roundRect(ctx, -1, -31, 5.5, 1.8, 0.9); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
  ctx.fillStyle = '#ffffff';
  disc(ctx, -15, -23.5, 7.2); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.translate(-15, -23.5); ctx.scale(dir, 1);
  ctx.fillStyle = OUT; ctx.font = 'bold 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('7', 0, 3.6);
  ctx.restore();
  // Window, with the driver hunched at the wheel behind the glare.
  ctx.lineWidth = 2;
  ctx.fillStyle = vgrad(ctx, -47, -35, '#def5ff', '#86c2e2');
  ctx.beginPath(); ctx.moveTo(-40, -35); ctx.lineTo(-29.5, -46.6); ctx.lineTo(1.5, -46.6); ctx.lineTo(13, -35); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#2a2f3a';
  oval(ctx, -9, -30.5, 9.5, 5.5); ctx.fill();
  disc(ctx, -5.5, -38.5, 5.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-11, -41); ctx.lineTo(3.5, -41.6); ctx.lineTo(3.5, -40); ctx.lineTo(-11, -39.4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a2f3a'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(6, -33.5, 4.2, 2.2, 5.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -32); ctx.lineTo(3.5, -35.5); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.moveTo(-30, -46.6); ctx.lineTo(-24, -46.6); ctx.lineTo(-34, -35); ctx.lineTo(-40, -35); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-21, -46.6); ctx.lineTo(-19, -46.6); ctx.lineTo(-29, -35); ctx.lineTo(-31, -35); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-40, -35); ctx.lineTo(-29.5, -46.6); ctx.lineTo(1.5, -46.6); ctx.lineTo(13, -35); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-27, -49.3); ctx.lineTo(-1, -49.3); ctx.stroke();
  // Blower poking through the bonnet.
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
  ctx.fillStyle = vgrad(ctx, -42, -32, '#eef1f7', '#7b8194');
  roundRect(ctx, 24, -41, 13.5, 9, 2.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = OUT;
  ctx.fillRect(33.5, -39.2, 2.6, 4.6);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(27, -40); ctx.lineTo(27, -33); ctx.moveTo(30, -40); ctx.lineTo(30, -33); ctx.stroke();
  // Lights and chrome.
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
  ctx.fillStyle = 'rgba(255,243,160,0.45)';
  disc(ctx, 55, -22.5, 6.5); ctx.fill();
  ctx.fillStyle = '#fff8c8';
  oval(ctx, 53.6, -22.5, 3, 4.3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff3a3a';
  roundRect(ctx, -56.8, -27.5, 3.6, 6.5, 1.6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = vgrad(ctx, -14, -8, '#f1f4fa', '#7b8194');
  roundRect(ctx, -57.5, -13.5, 116, 5.6, 2.6); ctx.fill(); ctx.stroke();
  // Wheel wells and wheels: fat at the back, smaller at the front.
  ctx.fillStyle = '#15151b';
  ctx.beginPath(); ctx.arc(-33, -9, 13.5, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(34, -8.5, 12, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  wheel(ctx, -33, -10, 11.5, time * 30, '#23232d', '#d5dae6', 5);
  wheel(ctx, 34, -9, 10, time * 34, '#23232d', '#d5dae6', 5);
  ctx.restore();
}

// ---------------------------------------------------------------- the dogs

interface Breed { fur: string; belly: string; ear: 'flop' | 'point'; size: number; leg: number; head: number; tail: 'curl' | 'long' | 'stub'; spots?: boolean; collar: string }
const BREEDS: Breed[] = [
  { fur: '#9a6532', belly: '#d9b07a', ear: 'flop', size: 1.3, leg: 1, head: 1, tail: 'curl', collar: '#d8372a' },
  { fur: '#34343f', belly: '#b0733a', ear: 'point', size: 1.42, leg: 1.16, head: 0.95, tail: 'stub', collar: '#8f96a8' },
  { fur: '#d8b06a', belly: '#f4e3bd', ear: 'flop', size: 1.2, leg: 0.8, head: 1.22, tail: 'stub', collar: '#3f6fd8' },
  { fur: '#f1ede4', belly: '#ffffff', ear: 'flop', size: 1.3, leg: 1.06, head: 1, tail: 'long', spots: true, collar: '#d8372a' },
];

/** A two-bone leg from (hx, hy) to a foot at (fx, fy), with the joint bent to one side. */
function dogLeg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number, col: string) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; fx = hx + dx; fy = hy + dy; }
  const a = Math.atan2(dy, dx) + bend * Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const kx = hx + Math.cos(a) * l1, ky = hy + Math.sin(a) * l1;
  for (const [w, c] of [[4.6, OUT], [2.8, col]] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.lineTo(fx + 2, fy + 0.4); ctx.stroke();
  }
}

export function drawDog(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, time: number, i: number) {
  const B = BREEDS[i % BREEDS.length];
  const ph = time * 20 + i * 1.7;
  // The gallop: stretched out in the air (ext = 1), then gathered with the feet under the body (ext = -1).
  const ext = Math.cos(ph), drive = Math.sin(ph);
  const lift = (0.5 + 0.5 * ext) * 5.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * B.size, B.size);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // A puff of dust where the feet dig in.
  if (ext < -0.2) {
    const k = clamp((-ext - 0.2) / 0.8, 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${0.3 * k})`;
    disc(ctx, -14 - (1 - k) * 8, -2, 2 + (1 - k) * 4); ctx.fill();
  }
  ctx.translate(0, -lift);
  ctx.rotate(-drive * 0.13);
  const L = 6.6 * B.leg, dark = shade(B.fur, 0.62);
  const groundY = 0.5 + lift * 0.55;
  const legs = (e: number, col: string, off: number) => {
    // Hind leg: thrown back when stretched, tucked forward under the belly when gathered.
    const ha = -e * 1.05 - 0.1, hl = 2 * L * (0.96 - 0.3 * Math.max(0, -e));
    dogLeg(ctx, -10 + off, -12, -10 + off + Math.sin(ha) * hl, Math.min(groundY, -12 + Math.cos(ha) * hl), L, L, 1, col);
    // Fore leg: reaching forward when stretched, swept back when gathered.
    const fa = e * 1.0 + 0.1, fl = 2 * L * (0.96 - 0.26 * Math.max(0, -e));
    dogLeg(ctx, 9 + off, -11.5, 9 + off + Math.sin(fa) * fl, Math.min(groundY, -11.5 + Math.cos(fa) * fl), L, L, -1, col);
  };
  legs(Math.cos(ph - 0.7), dark, 2.2);
  // Tail streaming behind.
  const wag = Math.sin(ph * 1.5) * 2.5;
  const [tx, ty, cx, cy] = B.tail === 'curl' ? [-22, -24 + wag, -22, -15] : B.tail === 'long' ? [-29, -18 + wag, -22, -13] : [-19, -20 + wag * 0.4, -18, -16];
  for (const [w, c] of [[4.4, OUT], [2.6, B.fur]] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(-14, -15.5); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
  }
  // Body: deep chest, tucked waist. It stretches and bunches with the stride.
  const st = 1 + ext * 0.06;
  ctx.save();
  ctx.scale(st, 1 / st);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
  ctx.fillStyle = vgrad(ctx, -20, -7, shade(B.fur, 1.12), shade(B.fur, 0.8));
  ctx.beginPath();
  ctx.moveTo(-13, -17.5); ctx.quadraticCurveTo(-2, -20.5, 9, -20); ctx.quadraticCurveTo(15.5, -19.5, 16, -14); ctx.quadraticCurveTo(15, -6.5, 7, -7);
  ctx.quadraticCurveTo(-2, -9.5, -9, -10.5); ctx.quadraticCurveTo(-15.5, -10.5, -16, -14.5); ctx.quadraticCurveTo(-16, -17, -13, -17.5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = B.belly;
  oval(ctx, 8, -6.5, 9, 4.5, -0.15); ctx.fill();
  if (B.spots) {
    ctx.fillStyle = '#2b2b33';
    for (const [sx, sy, sr] of [[-5, -16, 2.8], [4, -13.5, 2.1], [-11, -12.5, 1.8], [11, -17.5, 1.6]] as const) { disc(ctx, sx, sy, sr); ctx.fill(); }
  }
  ctx.restore();
  ctx.restore();
  legs(ext, B.fur, 0);
  // Collar.
  ctx.strokeStyle = OUT; ctx.lineWidth = 4.2;
  ctx.beginPath(); ctx.moveTo(11.5, -21); ctx.lineTo(15.5, -14.5); ctx.stroke();
  ctx.strokeStyle = B.collar; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(11.5, -21); ctx.lineTo(15.5, -14.5); ctx.stroke();
  ctx.fillStyle = '#ffe14a';
  disc(ctx, 15.6, -13.2, 1.5); ctx.fill();
  // Head: held level while the body rocks, jaws open, tongue and ears flapping.
  ctx.translate(17.5, -22.5);
  ctx.rotate(drive * 0.13 * 0.75 - 0.06);
  ctx.scale(B.head, B.head);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.7;
  const flap = Math.sin(ph * 1.3 + 0.8);
  // Lower jaw and the inside of the mouth.
  ctx.fillStyle = '#7a1f2a';
  ctx.beginPath(); ctx.moveTo(2, 1.5); ctx.lineTo(12.5, 2.6); ctx.lineTo(10.5, 7 + flap * 0.6); ctx.quadraticCurveTo(5, 7.5, 1.5, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff8fa8';
  ctx.beginPath(); ctx.moveTo(8.5, 5); ctx.quadraticCurveTo(4, 6.5, 2.5 - flap, 10.5 + flap); ctx.quadraticCurveTo(6, 9.5, 9.8, 6.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Skull and snout.
  ctx.fillStyle = B.fur;
  ctx.beginPath();
  ctx.moveTo(-5.5, 2); ctx.quadraticCurveTo(-7.5, -6.5, 0, -7); ctx.quadraticCurveTo(5, -7, 7, -3.5); ctx.lineTo(12.5, -2.6); ctx.quadraticCurveTo(15, -1.5, 14.2, 1.2);
  ctx.quadraticCurveTo(13.5, 3, 11, 3); ctx.lineTo(2, 3.2); ctx.quadraticCurveTo(-3, 5, -5.5, 2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  if (B.belly !== '#ffffff') { ctx.fillStyle = B.belly; oval(ctx, 10.2, 0.8, 3.6, 2, 0.1); ctx.fill(); }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(5, 3); ctx.lineTo(6.2, 5.2); ctx.lineTo(7.4, 3); ctx.lineTo(8.6, 5); ctx.lineTo(9.8, 3); ctx.lineTo(10.9, 4.8); ctx.lineTo(12, 2.9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = OUT;
  oval(ctx, 14, -1.2, 1.9, 1.6); ctx.fill();
  // Eye under a scowling brow.
  ctx.fillStyle = '#ffffff';
  disc(ctx, 3.2, -2.6, 2.1); ctx.fill();
  ctx.fillStyle = OUT;
  disc(ctx, 3.9, -2.4, 1.05); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0.6, -5.4); ctx.lineTo(5.8, -3.6); ctx.stroke();
  // Ear.
  ctx.lineWidth = 1.6;
  ctx.fillStyle = B.spots ? '#2b2b33' : dark;
  ctx.beginPath();
  if (B.ear === 'point') { ctx.moveTo(-4.5, -4.5); ctx.lineTo(-6.5 - flap * 0.6, -14); ctx.lineTo(0.5, -6.6); }
  else { ctx.moveTo(-2, -6.6); ctx.quadraticCurveTo(-10, -8 - flap * 2.5, -11.5 - flap, -1.5 - flap * 3); ctx.quadraticCurveTo(-7, -1, -4.5, -3); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the saucer

/** There is only ever one saucer, so its lean is kept here. */
const saucer = { px: NaN, tilt: 0 };

/**
 * The saucer, centred at (x, y) on screen, with its beam reaching down to floorY.
 * `beam` is 0 (off), about 0.2 (searching), 0.5 (carrying someone) or 1 (lifting).
 * `wx` is its position on the court and `dt` the frame time, so it can lean into its flight.
 */
export function drawUfo(ctx: CanvasRenderingContext2D, x: number, y: number, floorY: number, time: number, beam: number, wx = x, dt = 0) {
  if (dt > 0) {
    if (Math.abs(wx - saucer.px) < 60) saucer.tilt += (clamp(((wx - saucer.px) / dt) * 0.00055, -0.3, 0.3) - saucer.tilt) * (1 - Math.exp(-dt * 7));
    saucer.px = wx;
  }
  const bob = Math.sin(time * 4) * 3;
  const top = y + bob + 8, tw = 12 + 3 * beam, fw = 30 + 6 * beam;
  // Beam: faint while hunting, bright while lifting someone.
  const g = ctx.createLinearGradient(0, top, 0, floorY);
  g.addColorStop(0, `rgba(150,255,190,${0.25 + 0.45 * beam})`);
  g.addColorStop(1, `rgba(150,255,190,${0.04 + 0.2 * beam})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - tw, top); ctx.lineTo(x + tw, top); ctx.lineTo(x + fw, floorY); ctx.lineTo(x - fw, floorY); ctx.closePath(); ctx.fill();
  if (beam >= 0.5) {
    const c = ctx.createLinearGradient(0, top, 0, floorY);
    c.addColorStop(0, `rgba(235,255,242,${0.45 * beam})`);
    c.addColorStop(1, 'rgba(235,255,242,0)');
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x - tw * 0.45, top); ctx.lineTo(x + tw * 0.45, top); ctx.lineTo(x + fw * 0.5, floorY); ctx.lineTo(x - fw * 0.5, floorY); ctx.closePath(); ctx.fill();
    // Rings climbing the beam, and sparkles drawn up with them.
    ctx.lineWidth = 1.6;
    for (let j = 0; j < 4; j++) {
      const t = (time * 0.9 + j / 4) % 1, yy = floorY + (top - floorY) * t, rr = fw + (tw - fw) * t;
      ctx.strokeStyle = `rgba(215,255,228,${0.6 * beam * (1 - t)})`;
      oval(ctx, x, yy, rr, rr * 0.3); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (let j = 0; j < 8; j++) {
      const t = (time * 0.65 + j * 0.377) % 1, yy = floorY + (top - floorY) * t, rr = (fw + (tw - fw) * t) * 0.8;
      const xx = x + Math.sin(j * 12.9898 + t * 3) * rr, s = (1.2 + (j % 3) * 0.7) * (0.5 + 0.5 * Math.sin(time * 14 + j));
      ctx.globalAlpha = 0.85 * beam;
      ctx.fillRect(xx - s * 1.6, yy - 0.5, s * 3.2, 1); ctx.fillRect(xx - 0.5, yy - s * 1.6, 1, s * 3.2);
    }
    ctx.globalAlpha = 1;
  }
  // Where the beam lands: a ring of light turning on the floor.
  ctx.fillStyle = `rgba(150,255,190,${0.07 + 0.16 * beam})`;
  oval(ctx, x, floorY, 34, 13); ctx.fill();
  ctx.save();
  ctx.strokeStyle = `rgba(150,255,190,${0.4 + 0.5 * beam})`; ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]); ctx.lineDashOffset = -time * 40;
  oval(ctx, x, floorY, 34, 13); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(saucer.tilt + Math.sin(time * 2.3) * 0.05);
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Underside and the emitter the beam comes from.
  ctx.fillStyle = vgrad(ctx, 2, 14, '#5d6375', '#33384a');
  oval(ctx, 0, 4, 31, 9, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  if (beam > 0) { ctx.fillStyle = `rgba(170,255,205,${0.25 + 0.3 * beam})`; oval(ctx, 0, 12, 19, 6); ctx.fill(); }
  ctx.fillStyle = beam > 0 ? `rgb(${Math.round(150 + 90 * beam)},255,${Math.round(190 + 50 * beam)})` : '#2b2f3a';
  ctx.lineWidth = 1.5;
  oval(ctx, 0, 11, 13, 3.3); ctx.fill(); ctx.stroke();
  // The disc.
  ctx.lineWidth = 2;
  const hull = ctx.createLinearGradient(0, -12, 0, 12);
  hull.addColorStop(0, '#eef1f7'); hull.addColorStop(0.5, '#a3aabc'); hull.addColorStop(1, '#5d6375');
  ctx.fillStyle = hull;
  oval(ctx, 0, 0, 47, 12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.2;
  oval(ctx, 0, 0, 44.5, 10, 0, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
  oval(ctx, 0, 0, 43, 9.3, 0, Math.PI * 1.1, Math.PI * 1.42); ctx.stroke();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
  ctx.fillStyle = vgrad(ctx, -10, 1, '#f7f9fd', '#b3bacb');
  oval(ctx, 0, -4.5, 28, 6.5); ctx.fill(); ctx.stroke();
  // Lights running round the rim.
  for (let i = 0; i < 9; i++) {
    const a = time * 2.2 + (i * TAU) / 9, s = Math.sin(a);
    if (s < -0.1) continue;
    const lx = Math.cos(a) * 41.5, ly = 2 + s * 5.2, lr = 1.5 + 1.7 * s;
    const col = (i + Math.floor(time * 6)) % 2 ? '#ffe14a' : '#ff4fa3';
    ctx.globalAlpha = 0.35; ctx.fillStyle = col;
    disc(ctx, lx, ly, lr * 2.1); ctx.fill();
    ctx.globalAlpha = 1;
    disc(ctx, lx, ly, lr); ctx.fill();
  }
  // Glass dome with the pilot inside, peering down at whoever it has caught.
  const look = clamp(saucer.tilt * 5, -1, 1), caught = beam >= 0.5;
  const dome = () => { ctx.beginPath(); ctx.ellipse(0, -6, 19, 17, 0, Math.PI, 0); ctx.ellipse(0, -6, 19, 4, 0, 0, Math.PI); ctx.closePath(); };
  ctx.fillStyle = vgrad(ctx, -23, -3, 'rgba(222,250,255,0.9)', 'rgba(120,212,238,0.72)');
  dome(); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#4fae45';
  oval(ctx, look * 2, -0.5, 10, 5.5); ctx.fill();
  ctx.fillStyle = '#7be36a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  oval(ctx, look * 2.5, -11.5, 7.6, caught ? 8.2 : 8.8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = OUT;
  for (const s of [-1, 1]) { oval(ctx, look * 3.6 + s * 3.4, -11.5 + (caught ? 0.8 : 0), 2.5, caught ? 4 : 3.3, s * 0.5); ctx.fill(); }
  ctx.fillStyle = '#ffffff';
  for (const s of [-1, 1]) { disc(ctx, look * 3.9 + s * 3.4 - 0.6, -12.8, 0.8); ctx.fill(); }
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  if (caught) ctx.arc(look * 3, -7.6, 2.6, 0.25, Math.PI - 0.25); else { ctx.moveTo(look * 3 - 1.6, -5.8); ctx.lineTo(look * 3 + 1.6, -5.8); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  dome(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
  oval(ctx, 0, -6, 14.5, 12.5, 0, Math.PI * 1.13, Math.PI * 1.4); ctx.stroke();
  // Aerial on top.
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, -29.5); ctx.stroke();
  ctx.fillStyle = Math.floor(time * 5) % 2 ? '#ff4fa3' : '#3ff0ff';
  disc(ctx, 0, -31, 2.4); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** A tank shell in flight, nose first, with a flickering tail of flame. */
export function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, time = 0) {
  const f = 0.8 + 0.2 * Math.sin(time * 90);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir || 1, 1);
  ctx.fillStyle = 'rgba(255,150,50,0.75)';
  ctx.beginPath(); ctx.moveTo(-7, -4.2); ctx.lineTo(-36 * f, 0); ctx.lineTo(-7, 4.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff3a0';
  ctx.beginPath(); ctx.moveTo(-7, -2.2); ctx.lineTo(-20 * f, 0); ctx.lineTo(-7, 2.2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  ctx.fillStyle = vgrad(ctx, -4.5, 4.5, '#8a90a0', '#23232d');
  ctx.beginPath(); ctx.moveTo(-8, -4.5); ctx.lineTo(4, -4.5); ctx.quadraticCurveTo(13, -3, 15, 0); ctx.quadraticCurveTo(13, 3, 4, 4.5); ctx.lineTo(-8, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8b21e';
  ctx.fillRect(-5.5, -3.8, 2.6, 7.6);
  ctx.restore();
}
