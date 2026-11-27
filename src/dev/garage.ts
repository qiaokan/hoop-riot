// Dev-only page (garage.html): a still contact sheet of the rides, the car, the dogs and the saucer.
// In each pair the previous drawing code is on top and the current code below it.
//   garage.html?t=1.3   draws everything at game time t (phases of the gallop, lights, rotors)
//   garage.html?px=1    full size (scroll to look around) instead of fitted to the window
import { drawCar, drawDog, drawRideBack, drawRideFront, drawShell, drawUfo, stepRide } from '../client/vehicles';
import type { RideKind } from '../core/teams';
import { RIDE, Ride } from '../core/toys';
import * as old from './prev_toysprites';

const q = new URLSearchParams(location.search);
const T = Number(q.get('t') ?? 1.3);
const W = 1400, RH = 250;
type Ctx = CanvasRenderingContext2D;
interface Cell { name: string; w: number; prev: (c: Ctx, x: number, y: number) => void; now: (c: Ctx, x: number, y: number) => void }

let nextId = 1;
/** A ride in a given state, with its drawn-only motion played in: `drive` is run for each of `frames` frames. */
function ride(kind: RideKind, o: Partial<Ride>, frames = 0, drive?: (r: Ride, f: number) => void): Ride {
  const r: Ride = { id: nextId++, kind, x: 0, z: 0, y: 0, vx: 0, vz: 0, facing: 1, rider: null, hp: RIDE[kind].hp, fuel: RIDE[kind].fuel, cd: 0, respawn: 0, ramCd: 0, homeX: 0, homeZ: 0, ...o };
  const vx = r.vx;
  r.vx = 0;
  stepRide(r, 1 / 60);
  for (let f = 0; f < frames; f++) {
    r.vx += (vx - r.vx) * 0.07;
    drive?.(r, f);
    r.cd = Math.max(0, r.cd - 1 / 60);
    stepRide(r, 1 / 60);
  }
  return r;
}
const BLUE = '#3f6fd8';
function rideCell(name: string, r: Ride, w = 200): Cell {
  const ridden = r.rider !== null, team = ridden ? BLUE : null;
  return {
    name, w,
    prev: (c, x, y) => { old.drawRideBack(c, r.kind, x, y - r.y, r.facing, T, ridden, T * 200); old.drawRideFront(c, r.kind, x, y - r.y, r.facing, T, ridden, T * 200, team); },
    now: (c, x, y) => { drawRideBack(c, r, x, y - r.y, T, team); drawRideFront(c, r, x, y - r.y, T, team); },
  };
}

const cells: Cell[] = [
  rideCell('Skateboard, parked', ride('board', {}), 150),
  rideCell('Skateboard, at speed', ride('board', { rider: 0, vx: 330 }, 40), 190),
  rideCell('Skateboard, burst', ride('board', { rider: 0, vx: 330 }, 46, (r, f) => { if (f === 40) { r.cd = 1.5; r.vx += 240; } }), 210),
  rideCell('Tank, parked', ride('tank', {})),
  rideCell('Tank, driving', ride('tank', { rider: 0, vx: 115 }, 50)),
  rideCell('Tank, just fired', ride('tank', { rider: 0, vx: 60 }, 44, (r, f) => { if (f === 40) r.cd = 3; }), 220),
  rideCell('Tank, one hit left', ride('tank', { rider: 0, vx: 115, hp: 1 }, 50)),
  rideCell('Tank, facing left', ride('tank', { rider: 0, vx: -115, facing: -1, hp: 2 }, 50)),
  rideCell('Helicopter, parked', ride('heli', {}), 250),
  rideCell('Helicopter, hovering', ride('heli', { rider: 0, y: 60 }, 150), 250),
  rideCell('Helicopter, flying, bomb dropped', ride('heli', { rider: 0, y: 60, vx: 230, cd: 3.4 }, 150), 250),
  { name: 'Car', w: 330, prev: (c, x, y) => old.drawCar(c, x, y, 1, T), now: (c, x, y) => drawCar(c, x, y, 1, T) },
  { name: 'Car, right to left', w: 330, prev: (c, x, y) => old.drawCar(c, x, y, -1, T), now: (c, x, y) => drawCar(c, x, y, -1, T) },
  ...[0, 1, 2, 3].map((i): Cell => ({ name: `Dog ${i + 1}`, w: 120, prev: (c, x, y) => old.drawDog(c, x, y, 1, T, i), now: (c, x, y) => drawDog(c, x, y, 1, T, i) })),
  // One dog through a whole stride.
  ...[0, 1, 2, 3, 4, 5].map((k): Cell => {
    const t = T + (k / 6) * ((Math.PI * 2) / 20);
    return { name: k ? '' : 'Dog 1, one stride', w: 105, prev: (c, x, y) => old.drawDog(c, x, y, 1, t * (20 / 22), 0), now: (c, x, y) => drawDog(c, x, y, 1, t, 0) };
  }),
  { name: 'Saucer, searching', w: 190, prev: (c, x, y) => old.drawUfo(c, x, y - 150, y, T, 0.2), now: (c, x, y) => drawUfo(c, x, y - 150, y, T, 0.2) },
  { name: 'Saucer, lifting someone', w: 190, prev: (c, x, y) => old.drawUfo(c, x, y - 150, y, T, 1), now: (c, x, y) => drawUfo(c, x, y - 150, y, T, 1) },
  {
    name: 'Saucer, carrying, in flight', w: 190, prev: (c, x, y) => old.drawUfo(c, x, y - 150, y, T, 0.5),
    now: (c, x, y) => { for (let f = 0; f < 40; f++) drawUfo(c, -999, -999, -999, T, 0.5, f * 8.6, 1 / 60); drawUfo(c, x, y - 150, y, T, 0.5); },
  },
  { name: 'Shell', w: 110, prev: (c, x, y) => old.drawShell(c, x, y - 60, 1), now: (c, x, y) => drawShell(c, x, y - 60, 1, T) },
];

// Lay the cells out in rows that fit the sheet.
const rows: Cell[][] = [[]];
let used = 0;
for (const c of cells) {
  if (used + c.w > W - 20) { rows.push([]); used = 0; }
  rows[rows.length - 1].push(c);
  used += c.w;
}
const H = rows.length * (2 * RH + 30);
const cv = document.getElementById('garage') as HTMLCanvasElement;
cv.width = W * 2; cv.height = H * 2;
if (q.get('px')) cv.style.width = `${W}px`;
const ctx = cv.getContext('2d')!;
ctx.setTransform(2, 0, 0, 2, 0, 0);
ctx.fillStyle = '#7a4a34';
ctx.fillRect(0, 0, W, H);
rows.forEach((row, ri) => {
  const top = ri * (2 * RH + 30);
  let x0 = 10;
  row.forEach((c, ci) => {
    ['prev', 'now'].forEach((which, r) => {
      const y = top + 26 + r * RH;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y, c.w, RH); ctx.clip();
      ctx.fillStyle = (ci + r) % 2 ? '#7a4a34' : '#724330';
      ctx.fillRect(x0, y, c.w, RH);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(x0 + c.w / 2, y + RH - 26, Math.min(60, c.w * 0.3), 7, 0, 0, Math.PI * 2); ctx.fill();
      (which === 'prev' ? c.prev : c.now)(ctx, x0 + c.w / 2, y + RH - 26);
      ctx.restore();
    });
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(c.name, x0 + 4, top + 18);
    x0 += c.w;
  });
});
(window as unknown as { __garage: unknown }).__garage = { rows: rows.map((r) => r.map((c) => c.name)), W, H };
