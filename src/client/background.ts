import { COURT, HOOP, THREE_PT } from '../core/constants';
import { makeRng } from '../core/rng';
import { FLOOR_TOP, LAYER_RES, VIEW_H, VIEW_W, ZS, sy } from './view';

function layer(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * LAYER_RES);
  c.height = Math.ceil(h * LAYER_RES);
  const ctx = c.getContext('2d')!;
  ctx.scale(LAYER_RES, LAYER_RES);
  return [c, ctx];
}

export interface Backdrop {
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
  court: HTMLCanvasElement;
  farW: number;
  nearW: number;
}

export const FAR_PARALLAX = 0.22;
export const NEAR_PARALLAX = 0.5;

export function buildBackdrop(): Backdrop {
  const rng = makeRng(2024);
  const maxCam = COURT.len - VIEW_W;

  // Sky: dusk gradient with a low sun.
  const [sky, s] = layer(VIEW_W, FLOOR_TOP);
  const g = s.createLinearGradient(0, 0, 0, FLOOR_TOP);
  g.addColorStop(0, '#1a1340');
  g.addColorStop(0.45, '#5b2a6e');
  g.addColorStop(0.78, '#e0606a');
  g.addColorStop(1, '#ffb36b');
  s.fillStyle = g;
  s.fillRect(0, 0, VIEW_W, FLOOR_TOP);
  const sun = s.createRadialGradient(640, 170, 4, 640, 170, 90);
  sun.addColorStop(0, 'rgba(255,240,190,1)');
  sun.addColorStop(0.25, 'rgba(255,200,120,0.85)');
  sun.addColorStop(1, 'rgba(255,140,90,0)');
  s.fillStyle = sun;
  s.fillRect(500, 60, 280, 200);
  for (let i = 0; i < 70; i++) {
    s.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.6})`;
    s.fillRect(rng() * VIEW_W, rng() * 90, 1.2, 1.2);
  }

  // Far skyline.
  const farW = VIEW_W + maxCam * FAR_PARALLAX + 20;
  const [far, f] = layer(farW, FLOOR_TOP);
  let x = -10;
  while (x < farW) {
    const w = 30 + rng() * 60;
    const h = 50 + rng() * 110;
    f.fillStyle = '#3a2457';
    f.fillRect(x, FLOOR_TOP - 40 - h, w, h + 40);
    if (rng() < 0.3) f.fillRect(x + w / 2 - 1, FLOOR_TOP - 40 - h - 18, 2, 18);
    f.fillStyle = 'rgba(255,214,140,0.5)';
    for (let wy = FLOOR_TOP - 34 - h; wy < FLOOR_TOP - 40; wy += 9) {
      for (let wx = x + 4; wx < x + w - 4; wx += 7) if (rng() < 0.18) f.fillRect(wx, wy, 3, 4);
    }
    x += w + 2;
  }

  // Near buildings with neon.
  const nearW = VIEW_W + maxCam * NEAR_PARALLAX + 20;
  const [near, n] = layer(nearW, FLOOR_TOP);
  x = -20;
  const neon = ['#ff4fa3', '#3ff0ff', '#ffe14a', '#7dff6a'];
  const words = ['NOODLES', 'ARCADE', 'OPEN 24H', 'KICKS', 'TACOS', 'GYM'];
  let wi = 0;
  while (x < nearW) {
    const w = 80 + rng() * 110;
    const h = 60 + rng() * 70;
    const top = FLOOR_TOP - 70 - h;
    n.fillStyle = '#24183a';
    n.fillRect(x, top, w, h + 70);
    n.fillStyle = '#2e2048';
    n.fillRect(x, top, w, 6);
    for (let wy = top + 14; wy < FLOOR_TOP - 76; wy += 16) {
      for (let wx = x + 8; wx < x + w - 12; wx += 18) {
        n.fillStyle = rng() < 0.35 ? 'rgba(255,200,120,0.75)' : 'rgba(20,14,36,0.9)';
        n.fillRect(wx, wy, 9, 9);
      }
    }
    if (rng() < 0.55) {
      const col = neon[Math.floor(rng() * neon.length)];
      const word = words[wi++ % words.length];
      n.font = 'bold 13px "Trebuchet MS", sans-serif';
      const tw = n.measureText(word).width;
      const nx = x + (w - tw) / 2, ny = top + 30 + rng() * 20;
      n.fillStyle = 'rgba(10,6,20,0.85)';
      n.fillRect(nx - 6, ny - 14, tw + 12, 19);
      n.shadowColor = col;
      n.shadowBlur = 10;
      n.fillStyle = col;
      n.fillText(word, nx, ny);
      n.shadowBlur = 0;
    }
    if (rng() < 0.35) {
      // Water tower.
      const tx = x + w * 0.3;
      n.fillStyle = '#1b122c';
      n.fillRect(tx, top - 34, 30, 22);
      n.beginPath();
      n.moveTo(tx - 3, top - 34);
      n.lineTo(tx + 15, top - 46);
      n.lineTo(tx + 33, top - 34);
      n.fill();
      n.fillRect(tx + 4, top - 12, 3, 12);
      n.fillRect(tx + 23, top - 12, 3, 12);
    }
    x += w + 6;
  }

  // Court layer in world coordinates.
  const [court, c] = layer(COURT.len, VIEW_H);
  // Back wall + chain-link fence.
  c.fillStyle = '#2b2236';
  c.fillRect(0, FLOOR_TOP - 76, COURT.len, 76);
  c.fillStyle = '#3a3048';
  for (let bx = 0; bx < COURT.len; bx += 26) {
    for (let by = FLOOR_TOP - 76; by < FLOOR_TOP; by += 12) c.fillRect(bx + ((by / 12) % 2) * 13, by, 24, 10);
  }
  // Graffiti.
  c.save();
  c.font = 'italic 900 40px "Trebuchet MS", sans-serif';
  const tags: [string, string, number][] = [['RIOT', '#ff4fa3', 360], ['BALL IS LIFE', '#3ff0ff', 610], ['NO REFS', '#ffe14a', 1000]];
  for (const [t, col, gx] of tags) {
    c.globalAlpha = 0.55;
    c.fillStyle = '#111';
    c.fillText(t, gx + 3, FLOOR_TOP - 22 + 3);
    c.fillStyle = col;
    c.fillText(t, gx, FLOOR_TOP - 22);
  }
  c.restore();
  c.strokeStyle = 'rgba(200,210,230,0.28)';
  c.lineWidth = 1;
  for (let fx = -60; fx < COURT.len + 60; fx += 10) {
    c.beginPath(); c.moveTo(fx, FLOOR_TOP - 76); c.lineTo(fx + 60, FLOOR_TOP); c.stroke();
    c.beginPath(); c.moveTo(fx + 60, FLOOR_TOP - 76); c.lineTo(fx, FLOOR_TOP); c.stroke();
  }
  c.fillStyle = '#6c6f7d';
  for (let px = 0; px <= COURT.len; px += 150) c.fillRect(px - 2, FLOOR_TOP - 80, 4, 80);
  c.fillRect(0, FLOOR_TOP - 82, COURT.len, 4);

  // Asphalt.
  const floorBottom = sy(COURT.depth);
  c.fillStyle = '#353a46';
  c.fillRect(0, FLOOR_TOP, COURT.len, floorBottom - FLOOR_TOP);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.floor(rng() * 40);
    c.fillStyle = `rgba(${v},${v + 4},${v + 14},0.5)`;
    c.fillRect(rng() * COURT.len, FLOOR_TOP + rng() * (floorBottom - FLOOR_TOP), 1.5, 1.5);
  }
  // Painted playing surface.
  const x0 = COURT.minX - 10, x1 = COURT.maxX + 10;
  const top = sy(COURT.minZ - 8), bot = sy(COURT.maxZ + 8);
  c.fillStyle = 'rgba(43,96,124,0.55)';
  c.fillRect(x0, top, x1 - x0, bot - top);
  // Keys.
  const keyRect = (hx: number): [number, number, number, number] => {
    const left = hx < COURT.midX;
    const kx = left ? x0 : hx - 190;
    const kw = left ? hx + 190 - x0 : x1 - (hx - 190);
    return [kx, sy(HOOP.z - 62), kw, sy(HOOP.z + 62) - sy(HOOP.z - 62)];
  };
  c.fillStyle = 'rgba(214,74,74,0.45)';
  for (const hx of [HOOP.leftX, HOOP.rightX]) c.fillRect(...keyRect(hx));
  c.strokeStyle = 'rgba(245,245,240,0.85)';
  c.lineWidth = 2.5;
  c.strokeRect(x0, top, x1 - x0, bot - top);
  c.beginPath(); c.moveTo(COURT.midX, top); c.lineTo(COURT.midX, bot); c.stroke();
  c.beginPath(); c.ellipse(COURT.midX, sy(HOOP.z), 60, 60 * ZS, 0, 0, Math.PI * 2); c.stroke();
  c.save();
  c.beginPath(); c.rect(x0, top, x1 - x0, bot - top); c.clip();
  for (const hx of [HOOP.leftX, HOOP.rightX]) {
    const dir = hx < COURT.midX ? 1 : -1;
    c.beginPath(); c.ellipse(hx, sy(HOOP.z), THREE_PT, THREE_PT * ZS, 0, 0, Math.PI * 2); c.stroke();
    c.strokeRect(...keyRect(hx));
    c.beginPath(); c.ellipse(hx + dir * 190, sy(HOOP.z), 55, 55 * ZS, 0, -Math.PI / 2, Math.PI / 2, dir < 0); c.stroke();
  }
  c.restore();
  // Center logo.
  c.save();
  c.translate(COURT.midX, sy(HOOP.z));
  c.scale(1, ZS);
  c.font = 'italic 900 34px "Trebuchet MS", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,210,63,0.5)';
  c.fillText('HR', 0, 2);
  c.restore();

  // Curb + sidewalk in front.
  c.fillStyle = '#8a8d98';
  c.fillRect(0, floorBottom, COURT.len, 6);
  c.fillStyle = '#5c5f6b';
  c.fillRect(0, floorBottom + 6, COURT.len, VIEW_H - floorBottom - 6);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let px = 0; px < COURT.len; px += 64) c.fillRect(px, floorBottom + 6, 2, VIEW_H);

  return { sky, far, near, court, farW, nearW };
}
