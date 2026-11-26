import { COURT, HOOP, THREE_PT } from '../core/constants';
import { makeRng } from '../core/rng';
import type { CourtId } from '../core/teams';
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

/** Everything that makes one court look different from another. All of it is drawn by code. */
interface CourtTheme {
  sky: [string, string, string, string];
  sun: { x: number; y: number; core: string; mid: string } | null;
  stars: number;
  clouds: boolean;
  cranes: boolean;
  banners: string | null;
  far: string; farWin: string;
  near: string; nearTop: string; winLit: string; winDark: string; nearScale: number;
  neon: string[]; words: string[];
  wall: string; brick: string; fence: string; post: string;
  tags: [string, string, number][];
  asphalt: string; speck: number;
  paint: string; key: string; line: string; logo: string;
  curb: string; walk: string;
}

const THEMES: Record<CourtId, CourtTheme> = {
  rooftop: {
    sky: ['#1a1340', '#5b2a6e', '#e0606a', '#ffb36b'],
    sun: { x: 640, y: 170, core: 'rgba(255,240,190,1)', mid: 'rgba(255,200,120,0.85)' },
    stars: 70, clouds: false, cranes: false, banners: null,
    far: '#3a2457', farWin: 'rgba(255,214,140,0.5)',
    near: '#24183a', nearTop: '#2e2048', winLit: 'rgba(255,200,120,0.75)', winDark: 'rgba(20,14,36,0.9)', nearScale: 1,
    neon: ['#ff4fa3', '#3ff0ff', '#ffe14a', '#7dff6a'], words: ['NOODLES', 'ARCADE', 'OPEN 24H', 'KICKS', 'TACOS', 'GYM'],
    wall: '#2b2236', brick: '#3a3048', fence: 'rgba(200,210,230,0.28)', post: '#6c6f7d',
    tags: [['RIOT', '#ff4fa3', 360], ['BALL IS LIFE', '#3ff0ff', 610], ['NO REFS', '#ffe14a', 1000]],
    asphalt: '#353a46', speck: 40,
    paint: 'rgba(43,96,124,0.55)', key: 'rgba(214,74,74,0.45)', line: 'rgba(245,245,240,0.85)', logo: 'rgba(255,210,63,0.5)',
    curb: '#8a8d98', walk: '#5c5f6b',
  },
  docks: {
    sky: ['#243a5e', '#8a5a7a', '#f08a5d', '#ffd08a'],
    sun: { x: 300, y: 185, core: 'rgba(255,236,200,1)', mid: 'rgba(255,170,100,0.85)' },
    stars: 20, clouds: true, cranes: true, banners: null,
    far: '#3d4a66', farWin: 'rgba(255,220,160,0.35)',
    near: '#2a3346', nearTop: '#39445c', winLit: 'rgba(255,190,110,0.6)', winDark: 'rgba(18,24,36,0.9)', nearScale: 0.7,
    neon: ['#ffb347', '#7fd6ff'], words: ['BAIT', 'PIER 9', 'FISH', 'CARGO'],
    wall: '#3a3430', brick: '#4a423c', fence: 'rgba(220,210,190,0.26)', post: '#7a6f62',
    tags: [['HOUNDS', '#e8672e', 330], ['PIER 9', '#7fd6ff', 640], ['NO REFS', '#fff1d6', 1010]],
    asphalt: '#3d3b3a', speck: 46,
    paint: 'rgba(150,84,44,0.5)', key: 'rgba(36,104,116,0.5)', line: 'rgba(250,240,220,0.85)', logo: 'rgba(255,241,214,0.45)',
    curb: '#8f867a', walk: '#5e574f',
  },
  arcade: {
    sky: ['#06051a', '#12103a', '#2a1466', '#5a209a'],
    sun: null,
    stars: 110, clouds: false, cranes: false, banners: null,
    far: '#1b1640', farWin: 'rgba(120,255,230,0.5)',
    near: '#120e2a', nearTop: '#1e1740', winLit: 'rgba(255,90,200,0.75)', winDark: 'rgba(8,6,20,0.9)', nearScale: 1.1,
    neon: ['#ff4fa3', '#3ff0ff', '#7dff6a', '#ffe14a', '#b56bff'], words: ['ARCADE', 'INSERT COIN', 'HI-SCORE', 'PIXELS', 'GAME ON', '1UP'],
    wall: '#17122c', brick: '#241c44', fence: 'rgba(120,255,230,0.25)', post: '#5a4f8a',
    tags: [['VIPERS', '#25c97a', 330], ['GAME OVER', '#ff4fa3', 610], ['PRESS START', '#3ff0ff', 990]],
    asphalt: '#231f3a', speck: 30,
    paint: 'rgba(16,96,70,0.55)', key: 'rgba(200,40,140,0.45)', line: 'rgba(160,255,235,0.9)', logo: 'rgba(125,255,106,0.5)',
    curb: '#5a4f8a', walk: '#2e2850',
  },
  helipad: {
    sky: ['#2f8fe0', '#6cbcf7', '#b5e2ff', '#e9f7ff'],
    sun: { x: 760, y: 70, core: 'rgba(255,255,240,1)', mid: 'rgba(255,250,200,0.8)' },
    stars: 0, clouds: true, cranes: false, banners: null,
    far: '#9bbbe0', farWin: 'rgba(255,255,255,0.45)',
    near: '#7391b5', nearTop: '#88a6c8', winLit: 'rgba(230,245,255,0.8)', winDark: 'rgba(70,100,140,0.9)', nearScale: 0.45,
    neon: ['#ffffff', '#ffe14a'], words: ['SKY', 'H', 'AIR'],
    wall: '#5f6f86', brick: '#6d7e96', fence: 'rgba(255,255,255,0.4)', post: '#d8dde6',
    tags: [['PILOTS', '#ffffff', 340], ['FLY HIGH', '#ffe14a', 640], ['NO REFS', '#2a8fe6', 1010]],
    asphalt: '#59606c', speck: 70,
    paint: 'rgba(60,68,82,0.5)', key: 'rgba(42,143,230,0.45)', line: 'rgba(255,225,74,0.95)', logo: 'rgba(255,255,255,0.5)',
    curb: '#c4cad4', walk: '#8e97a5',
  },
  palace: {
    sky: ['#170a2c', '#3b1466', '#7a2a8a', '#c8a04a'],
    sun: { x: 480, y: 190, core: 'rgba(255,236,170,1)', mid: 'rgba(232,198,106,0.8)' },
    stars: 60, clouds: false, cranes: false, banners: '#8b5cf6',
    far: '#3a1f5e', farWin: 'rgba(232,198,106,0.55)',
    near: '#251040', nearTop: '#3a1c62', winLit: 'rgba(232,198,106,0.8)', winDark: 'rgba(18,8,34,0.9)', nearScale: 1.2,
    neon: ['#e8c66a', '#b56bff'], words: ['ROYAL', 'CROWN', 'KINGS', 'GOLD'],
    wall: '#2a163f', brick: '#3b2258', fence: 'rgba(232,198,106,0.3)', post: '#b89a4e',
    tags: [['MONARCHS', '#e8c66a', 320], ['BOW DOWN', '#b56bff', 650], ['UNDEFEATED', '#e8c66a', 960]],
    asphalt: '#2c2238', speck: 34,
    paint: 'rgba(86,50,140,0.55)', key: 'rgba(200,160,70,0.45)', line: 'rgba(240,215,140,0.9)', logo: 'rgba(232,198,106,0.55)',
    curb: '#b89a4e', walk: '#4a3a62',
  },
};

export function buildBackdrop(court: CourtId): Backdrop {
  const T = THEMES[court];
  const rng = makeRng(2024 + court.length * 31 + court.charCodeAt(0));
  const maxCam = COURT.len - VIEW_W;

  // Sky.
  const [sky, s] = layer(VIEW_W, FLOOR_TOP);
  const g = s.createLinearGradient(0, 0, 0, FLOOR_TOP);
  g.addColorStop(0, T.sky[0]);
  g.addColorStop(0.45, T.sky[1]);
  g.addColorStop(0.78, T.sky[2]);
  g.addColorStop(1, T.sky[3]);
  s.fillStyle = g;
  s.fillRect(0, 0, VIEW_W, FLOOR_TOP);
  if (T.sun) {
    const sun = s.createRadialGradient(T.sun.x, T.sun.y, 4, T.sun.x, T.sun.y, 90);
    sun.addColorStop(0, T.sun.core);
    sun.addColorStop(0.25, T.sun.mid);
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = sun;
    s.fillRect(T.sun.x - 140, T.sun.y - 110, 280, 220);
  } else {
    // Moon.
    s.fillStyle = 'rgba(230,230,255,0.9)';
    s.beginPath(); s.arc(770, 60, 22, 0, Math.PI * 2); s.fill();
    s.fillStyle = T.sky[0];
    s.beginPath(); s.arc(779, 54, 20, 0, Math.PI * 2); s.fill();
  }
  for (let i = 0; i < T.stars; i++) {
    s.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.6})`;
    s.fillRect(rng() * VIEW_W, rng() * 100, 1.2, 1.2);
  }
  if (T.clouds) {
    for (let i = 0; i < 7; i++) {
      const cx = rng() * VIEW_W, cy = 30 + rng() * 120, w = 50 + rng() * 70;
      s.fillStyle = `rgba(255,255,255,${0.35 + rng() * 0.35})`;
      for (let k = 0; k < 5; k++) {
        s.beginPath();
        s.ellipse(cx + (k - 2) * w * 0.22, cy + Math.sin(k * 2.1) * 5, w * 0.24, 10 + rng() * 6, 0, 0, Math.PI * 2);
        s.fill();
      }
    }
  }

  // Far skyline.
  const farW = VIEW_W + maxCam * FAR_PARALLAX + 20;
  const [far, f] = layer(farW, FLOOR_TOP);
  let x = -10;
  while (x < farW) {
    const w = 30 + rng() * 60;
    const h = (50 + rng() * 110) * Math.min(1, T.nearScale + 0.25);
    f.fillStyle = T.far;
    f.fillRect(x, FLOOR_TOP - 40 - h, w, h + 40);
    if (rng() < 0.3) f.fillRect(x + w / 2 - 1, FLOOR_TOP - 40 - h - 18, 2, 18);
    f.fillStyle = T.farWin;
    for (let wy = FLOOR_TOP - 34 - h; wy < FLOOR_TOP - 40; wy += 9) {
      for (let wx = x + 4; wx < x + w - 4; wx += 7) if (rng() < 0.18) f.fillRect(wx, wy, 3, 4);
    }
    x += w + 2;
  }
  if (T.cranes) {
    f.strokeStyle = T.near;
    f.fillStyle = T.near;
    for (let cx = 120; cx < farW; cx += 330) {
      f.lineWidth = 5;
      f.beginPath(); f.moveTo(cx, FLOOR_TOP); f.lineTo(cx, 60); f.stroke();
      f.lineWidth = 4;
      f.beginPath(); f.moveTo(cx - 40, 72); f.lineTo(cx + 130, 60); f.stroke();
      f.lineWidth = 1.5;
      f.beginPath(); f.moveTo(cx, 44); f.lineTo(cx + 130, 60); f.moveTo(cx, 44); f.lineTo(cx - 40, 72); f.moveTo(cx, 44); f.lineTo(cx, 60); f.stroke();
      f.beginPath(); f.moveTo(cx + 100, 62); f.lineTo(cx + 100, 120); f.stroke();
      f.fillRect(cx + 90, 120, 20, 14);
    }
  }

  // Near buildings with signs.
  const nearW = VIEW_W + maxCam * NEAR_PARALLAX + 20;
  const [near, n] = layer(nearW, FLOOR_TOP);
  x = -20;
  let wi = 0;
  while (x < nearW) {
    const w = 80 + rng() * 110;
    const h = (60 + rng() * 70) * T.nearScale;
    const top = FLOOR_TOP - 70 - h;
    n.fillStyle = T.near;
    n.fillRect(x, top, w, h + 70);
    n.fillStyle = T.nearTop;
    n.fillRect(x, top, w, 6);
    for (let wy = top + 14; wy < FLOOR_TOP - 76; wy += 16) {
      for (let wx = x + 8; wx < x + w - 12; wx += 18) {
        n.fillStyle = rng() < 0.35 ? T.winLit : T.winDark;
        n.fillRect(wx, wy, 9, 9);
      }
    }
    if (rng() < 0.55 && h > 36) {
      const col = T.neon[Math.floor(rng() * T.neon.length)];
      const word = T.words[wi++ % T.words.length];
      n.font = 'bold 13px "Trebuchet MS", sans-serif';
      const tw = n.measureText(word).width;
      const nx = x + (w - tw) / 2, ny = top + 26 + rng() * Math.max(0, h - 50);
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
      n.fillStyle = T.near;
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
  const [court_, c] = layer(COURT.len, VIEW_H);
  // Back wall + chain-link fence.
  c.fillStyle = T.wall;
  c.fillRect(0, FLOOR_TOP - 76, COURT.len, 76);
  c.fillStyle = T.brick;
  for (let bx = 0; bx < COURT.len; bx += 26) {
    for (let by = FLOOR_TOP - 76; by < FLOOR_TOP; by += 12) c.fillRect(bx + ((by / 12) % 2) * 13, by, 24, 10);
  }
  // Graffiti.
  c.save();
  c.font = 'italic 900 40px "Trebuchet MS", sans-serif';
  for (const [t, col, gx] of T.tags) {
    c.globalAlpha = 0.55;
    c.fillStyle = '#111';
    c.fillText(t, gx + 3, FLOOR_TOP - 22 + 3);
    c.fillStyle = col;
    c.fillText(t, gx, FLOOR_TOP - 22);
  }
  c.restore();
  c.strokeStyle = T.fence;
  c.lineWidth = 1;
  for (let fx = -60; fx < COURT.len + 60; fx += 10) {
    c.beginPath(); c.moveTo(fx, FLOOR_TOP - 76); c.lineTo(fx + 60, FLOOR_TOP); c.stroke();
    c.beginPath(); c.moveTo(fx + 60, FLOOR_TOP - 76); c.lineTo(fx, FLOOR_TOP); c.stroke();
  }
  c.fillStyle = T.post;
  for (let px = 0; px <= COURT.len; px += 150) c.fillRect(px - 2, FLOOR_TOP - 80, 4, 80);
  c.fillRect(0, FLOOR_TOP - 82, COURT.len, 4);
  if (T.banners) {
    for (let px = 75; px < COURT.len; px += 150) {
      c.fillStyle = T.banners;
      c.beginPath();
      c.moveTo(px - 14, FLOOR_TOP - 78); c.lineTo(px + 14, FLOOR_TOP - 78); c.lineTo(px + 14, FLOOR_TOP - 38);
      c.lineTo(px, FLOOR_TOP - 28); c.lineTo(px - 14, FLOOR_TOP - 38);
      c.fill();
      c.fillStyle = T.post;
      c.beginPath(); c.arc(px, FLOOR_TOP - 56, 6, 0, Math.PI * 2); c.fill();
    }
  }

  // Ground.
  const floorBottom = sy(COURT.depth);
  c.fillStyle = T.asphalt;
  c.fillRect(0, FLOOR_TOP, COURT.len, floorBottom - FLOOR_TOP);
  for (let i = 0; i < 9000; i++) {
    const v = T.speck + Math.floor(rng() * 40);
    c.fillStyle = `rgba(${v},${v + 4},${v + 14},0.5)`;
    c.fillRect(rng() * COURT.len, FLOOR_TOP + rng() * (floorBottom - FLOOR_TOP), 1.5, 1.5);
  }
  // Painted playing surface.
  const x0 = COURT.minX - 10, x1 = COURT.maxX + 10;
  const top = sy(COURT.minZ - 8), bot = sy(COURT.maxZ + 8);
  c.fillStyle = T.paint;
  c.fillRect(x0, top, x1 - x0, bot - top);
  const keyRect = (hx: number): [number, number, number, number] => {
    const left = hx < COURT.midX;
    const kx = left ? x0 : hx - 190;
    const kw = left ? hx + 190 - x0 : x1 - (hx - 190);
    return [kx, sy(HOOP.z - 62), kw, sy(HOOP.z + 62) - sy(HOOP.z - 62)];
  };
  c.fillStyle = T.key;
  for (const hx of [HOOP.leftX, HOOP.rightX]) c.fillRect(...keyRect(hx));
  c.strokeStyle = T.line;
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
  c.fillStyle = T.logo;
  c.fillText(court === 'helipad' ? 'H' : 'HR', 0, 2);
  c.restore();

  // Curb + sidewalk in front.
  c.fillStyle = T.curb;
  c.fillRect(0, floorBottom, COURT.len, 6);
  c.fillStyle = T.walk;
  c.fillRect(0, floorBottom + 6, COURT.len, VIEW_H - floorBottom - 6);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let px = 0; px < COURT.len; px += 64) c.fillRect(px, floorBottom + 6, 2, VIEW_H);

  return { sky, far, near, court: court_, farW, nearW };
}
