// The place a match is played in: sky, light, court, hoops, fence and what stands behind it.
// Each of the five courts has its own look. All of it is made in code when the court loads.
import * as THREE from 'three';
import { BALL_R, COURT, HIGH_RIM_Y, HOOP, THREE_PT } from '../core/constants';
import type { CourtId } from '../core/teams';

type RGB = [number, number, number];
/** Everything that makes one court look different from another. */
interface Look {
  /** Toward the sun (or moon), its colour and strength. */
  sun: RGB; sunCol: RGB; sunPow: number;
  /** Light from the camera's side, and from the sky and the ground. */
  fill: RGB; fillPow: number; hemi: [RGB, RGB, number];
  sky: { zenith: RGB; mid: RGB; horizon: RGB; glow: RGB; clouds: number; cloudLit: RGB; stars: number; below: RGB };
  haze: string; fog: number; env: number; exposure: number;
  paint: string; arc: string; key: string; line: string; asphalt: string; walk: string;
  /** The wall behind the far fence: brick colour, painted words, splashes of colour. */
  wall: { brick: string; tint: string; words: [string, string, number, number][]; splash: string[] } | null;
  trees: string[] | null;
  /** Buildings: wall colours, share of lit windows, how bright they glow, far skyline colour. */
  city: { walls: string[]; lit: number; glow: RGB; far: string } | null;
  /** How bright the street lamps burn; above 1 they also light the court. */
  lamps: number;
  lampCols: RGB[];
  extra: 'none' | 'docks' | 'neon' | 'sky' | 'palace';
  centre: string;
}

const LOOKS: Record<CourtId, Look> = {
  // Golden hour over the city.
  rooftop: {
    sun: [-0.8, 0.5, -0.35], sunCol: [1, 0.66, 0.38], sunPow: 5.2,
    fill: [0.62, 0.66, 1], fillPow: 0.75, hemi: [[0.5, 0.58, 0.95], [0.7, 0.42, 0.3], 0.45],
    sky: { zenith: [0.1, 0.2, 0.5], mid: [0.62, 0.42, 0.6], horizon: [1.5, 0.74, 0.36], glow: [1.5, 0.66, 0.25], clouds: 0.8, cloudLit: [2.6, 1.25, 0.6], stars: 0, below: [0.8, 0.5, 0.4] },
    haze: '#e9a27c', fog: 0.0004, env: 0.85, exposure: 0.95,
    paint: '#27808a', arc: '#3697a0', key: '#e2673a', line: '#f4ecda', asphalt: '#3b3a40', walk: '#77706a',
    wall: { brick: '#8f4a3c', tint: '#c9c2bd', words: [['HOOP RIOT', '#ffd23f', 2048, 190], ['NO REFS', '#3ddc97', 560, 120], ['BALL OUT', '#ff5d8f', 3520, 120], ['RBL', '#2f7cf6', 1180, 90], ['★ 23', '#ffffff', 2940, 90]], splash: ['#ffd23f', '#2f7cf6', '#ff5d8f', '#3ddc97', '#f76b1c', '#9b5de5', '#ffffff'] },
    trees: ['#e2572b', '#f08a24', '#f2b632', '#c93f2b', '#6f9a3a', '#e9742b'],
    city: { walls: ['#2a2632', '#3a2e33', '#262b38'], lit: 0.2, glow: [1.1, 0.95, 0.75], far: '#3a3344' },
    lamps: 1, lampCols: [[1, 0.7, 0.34]], extra: 'none', centre: '#e2673a',
  },
  // A working pier at dusk: cranes, containers, a low red sun over the water.
  docks: {
    sun: [0.75, 0.24, -0.6], sunCol: [1, 0.5, 0.26], sunPow: 4.4,
    fill: [0.5, 0.62, 0.9], fillPow: 0.9, hemi: [[0.42, 0.52, 0.8], [0.5, 0.36, 0.3], 0.55],
    sky: { zenith: [0.07, 0.14, 0.32], mid: [0.5, 0.3, 0.42], horizon: [1.7, 0.6, 0.3], glow: [1.8, 0.6, 0.2], clouds: 1.3, cloudLit: [2.4, 0.9, 0.5], stars: 0.15, below: [0.5, 0.36, 0.36] },
    haze: '#c98a78', fog: 0.00046, env: 0.8, exposure: 1,
    paint: '#a8643a', arc: '#b9774a', key: '#2a7f8c', line: '#f6ead2', asphalt: '#3d3b3a', walk: '#5e574f',
    wall: { brick: '#4a423c', tint: '#b8b0a8', words: [['PIER 9', '#7fd6ff', 2048, 180], ['HOUNDS', '#e8672e', 600, 130], ['NO REFS', '#fff1d6', 3480, 120], ['CARGO', '#ffb347', 1240, 90], ['BAIT', '#7fd6ff', 2900, 90]], splash: ['#e8672e', '#7fd6ff', '#fff1d6', '#3d4a66', '#ffb347'] },
    trees: null,
    city: { walls: ['#2a3346', '#39445c', '#30323e'], lit: 0.14, glow: [1, 0.8, 0.55], far: '#3d4a66' },
    lamps: 1.5, lampCols: [[1, 0.72, 0.4]], extra: 'docks', centre: '#2a7f8c',
  },
  // Night in an alley of arcades: no sun, only neon.
  arcade: {
    sun: [-0.4, 0.8, 0.3], sunCol: [0.45, 0.5, 1], sunPow: 0.9,
    fill: [0.85, 0.7, 1], fillPow: 0.6, hemi: [[0.3, 0.28, 0.6], [0.34, 0.2, 0.4], 0.55],
    sky: { zenith: [0.01, 0.01, 0.05], mid: [0.05, 0.03, 0.16], horizon: [0.3, 0.1, 0.5], glow: [0.4, 0.1, 0.6], clouds: 0.3, cloudLit: [0.5, 0.2, 0.8], stars: 1, below: [0.08, 0.04, 0.16] },
    haze: '#2a1450', fog: 0.00042, env: 0.9, exposure: 1.15,
    paint: '#14664e', arc: '#1b7a5e', key: '#c2288c', line: '#a8fff0', asphalt: '#231f3a', walk: '#2e2850',
    wall: { brick: '#241c44', tint: '#a9a2c8', words: [['GAME OVER', '#ff4fa3', 2048, 170], ['VIPERS', '#25c97a', 600, 130], ['PRESS START', '#3ff0ff', 3440, 110], ['1UP', '#ffe14a', 1240, 100], ['HI-SCORE', '#b56bff', 2880, 80]], splash: ['#ff4fa3', '#3ff0ff', '#7dff6a', '#b56bff', '#241c44'] },
    trees: null,
    city: { walls: ['#17122c', '#1e1740', '#120e2a'], lit: 0.34, glow: [1.9, 0.8, 2.2], far: '#1b1640' },
    lamps: 3, lampCols: [[1, 0.8, 0.92], [0.82, 0.95, 1], [0.9, 1, 0.85], [1, 0.95, 0.8]], extra: 'neon', centre: '#c2288c',
  },
  // A landing pad above the clouds at noon.
  helipad: {
    sun: [-0.5, 0.7, 0.2], sunCol: [1, 0.95, 0.84], sunPow: 2.7,
    fill: [0.7, 0.82, 1], fillPow: 0.5, hemi: [[0.5, 0.68, 1], [0.6, 0.64, 0.7], 0.4],
    sky: { zenith: [0.06, 0.22, 0.62], mid: [0.2, 0.42, 0.8], horizon: [0.5, 0.66, 0.9], glow: [0.7, 0.66, 0.55], clouds: 0.4, cloudLit: [1, 1, 1], stars: 0, below: [0.6, 0.7, 0.86] },
    haze: '#9cc2ea', fog: 0.00017, env: 0.6, exposure: 0.85,
    paint: '#3e4652', arc: '#48515e', key: '#2378c8', line: '#e6c636', asphalt: '#474e5a', walk: '#6c7482',
    wall: null, trees: null, city: null,
    lamps: 0.6, lampCols: [[1, 0.2, 0.15]], extra: 'sky', centre: '#2a8fe6',
  },
  // The palace forecourt at dusk: purple, gold and banners.
  palace: {
    sun: [-0.62, 0.36, -0.7], sunCol: [1, 0.72, 0.4], sunPow: 3.6,
    fill: [0.72, 0.5, 1], fillPow: 0.85, hemi: [[0.42, 0.3, 0.8], [0.6, 0.45, 0.25], 0.55],
    sky: { zenith: [0.05, 0.02, 0.14], mid: [0.3, 0.1, 0.42], horizon: [1.2, 0.72, 0.3], glow: [1.4, 0.8, 0.3], clouds: 0.9, cloudLit: [1.8, 1, 0.5], stars: 0.55, below: [0.4, 0.26, 0.34] },
    haze: '#9a6a9a', fog: 0.0004, env: 0.85, exposure: 1.05,
    paint: '#5a3690', arc: '#6a43a6', key: '#c9a046', line: '#f0dc96', asphalt: '#2c2238', walk: '#4a3a62',
    wall: { brick: '#3b2258', tint: '#b9b0d0', words: [['BOW DOWN', '#b56bff', 2048, 170], ['MONARCHS', '#e8c66a', 600, 130], ['UNDEFEATED', '#e8c66a', 3440, 110], ['ROYAL', '#ffffff', 1240, 90], ['KINGS', '#e8c66a', 2900, 90]], splash: ['#e8c66a', '#b56bff', '#8b5cf6', '#3b2258', '#ffffff'] },
    trees: ['#7a3fa8', '#c9a046', '#9a55c8', '#5a2f86'],
    city: { walls: ['#251040', '#3a1c62', '#2a163f'], lit: 0.3, glow: [1.6, 1.25, 0.6], far: '#3a1f5e' },
    lamps: 2, lampCols: [[1, 0.8, 0.4]], extra: 'palace', centre: '#c9a046',
  },
};

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, color = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const SKY_FRAG = /* glsl */ `
uniform vec3 sunDir, zenith, mid, horizon, glowCol, cloudLit, below;
uniform float disc, clouds, stars;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  float s = max(dot(d, sunDir), 0.0);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  c = mix(c, zenith, smoothstep(0.1, 0.7, h));
  // The side of the sky away from the sun is cooler and darker.
  c *= mix(0.55, 1.0, smoothstep(-0.6, 0.7, dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4))));
  // Stars, a few of them bright.
  vec2 sp = d.xz / (abs(d.y) + 0.12) * 46.0;
  float st = hash(floor(sp));
  c += vec3(0.9, 0.95, 1.2) * stars * smoothstep(0.985, 1.0, st) * (0.4 + 2.2 * smoothstep(0.997, 1.0, st)) * smoothstep(0.03, 0.3, d.y);
  c += glowCol * pow(s, 5.0) * 0.8 + glowCol * 2.2 * pow(s, 70.0);
  c += (glowCol * 26.0 + 12.0) * smoothstep(0.99935, 0.9997, s) * disc;
  // Cloud bands, lit on the sun's side.
  vec2 uv = d.xz / (d.y + 0.22);
  float n = fbm(uv * vec2(0.9, 2.2) + vec2(3.0, 1.0));
  float cl = smoothstep(0.5, 0.74, n) * smoothstep(0.015, 0.16, d.y) * (1.0 - smoothstep(0.45, 0.9, d.y));
  vec3 lit = mix(mid * 0.85, cloudLit, clamp(pow(s, 1.6) * 1.2 + 0.12, 0.0, 1.0));
  c = mix(c, lit, min(1.0, cl * clouds));
  c = mix(c, below, smoothstep(0.0, -0.12, d.y));
  gl_FragColor = vec4(c, 1.0);
}`;

export interface World {
  ball: THREE.Mesh;
  ballMat: THREE.MeshStandardMaterial;
  exposure: number;
  /** Called every frame: keeps the sky round the camera, the shadows over the part of the court in view, and the air moving. */
  frame(camera: THREE.Camera, lookX: number, dt: number, time: number, gust: number): void;
  /** Something went through or hit that hoop: shake its net. */
  swish(hoopX: number, rimY: number, strength: number): void;
  /** A broken rim hangs off the board until it is fixed. */
  setBroken(hoopX: number, high: boolean, broken: boolean): void;
  dispose(): void;
}

export function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, court: CourtId): World {
  const L = LOOKS[court];
  const root = new THREE.Group();
  scene.add(root);
  let seed = 20261126 + court.length * 7919;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const v3 = (c: RGB) => new THREE.Vector3(c[0], c[1], c[2]);
  const rgb = (c: RGB, k = 1) => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);
  const add = <T extends THREE.Object3D>(o: T, shadow = true): T => {
    if ((o as unknown as THREE.Mesh).isMesh) { o.castShadow = shadow; o.receiveShadow = true; }
    root.add(o);
    return o;
  };
  const SUN = new THREE.Vector3(...L.sun).normalize();

  // ---------------------------------------------------------------- sky and light
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: SUN }, disc: { value: 0 }, zenith: { value: v3(L.sky.zenith) }, mid: { value: v3(L.sky.mid) }, horizon: { value: v3(L.sky.horizon) },
      glowCol: { value: v3(L.sky.glow) }, cloudLit: { value: v3(L.sky.cloudLit) }, below: { value: v3(L.sky.below) }, clouds: { value: L.sky.clouds }, stars: { value: L.sky.stars },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noAO = true;
  // The same sky, without the sun's disc (the sun is its own light), lights and reflects in everything.
  const envScene = new THREE.Scene();
  envScene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(envScene, 0, 1, 7000);
  pm.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = L.env;
  skyMat.uniforms.disc.value = 1;
  root.add(sky);
  scene.fog = new THREE.FogExp2(L.haze, L.fog);

  const sun = new THREE.DirectionalLight(rgb(L.sunCol), L.sunPow);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -820; sc.right = 820; sc.top = 600; sc.bottom = -600; sc.near = 200; sc.far = 3600;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 1.4;
  const fill = new THREE.DirectionalLight(rgb(L.fill), L.fillPow);
  fill.position.set(900, 500, 1400); fill.target.position.set(750, 60, 180);
  root.add(sun, sun.target, fill, fill.target, new THREE.HemisphereLight(rgb(L.hemi[0]), rgb(L.hemi[1]), L.hemi[2]));

  // ---------------------------------------------------------------- ground
  const GX0 = -900, GZ0 = -330, GW = 3300, GD = 1080, PX = 1.5;
  const puddles = court === 'helipad' ? [] : Array.from({ length: 9 }, () => ({ x: -200 + rnd() * 1900, z: 400 + rnd() * 250, rx: 50 + rnd() * 90, rz: 16 + rnd() * 26, a: rnd() * 0.6 - 0.3 }));
  const paint = (c: CanvasRenderingContext2D, rough: boolean) => {
    const g = (v: number) => `rgb(${v},${v},${v})`;
    c.scale(PX, PX); c.translate(-GX0, -GZ0);
    // Asphalt, a pavement behind the far fence, then the painted court.
    c.fillStyle = rough ? g(236) : L.asphalt; c.fillRect(GX0, GZ0, GW, GD);
    for (let i = 0; i < 60000; i++) {
      const v = rough ? 205 + rnd() * 50 : 40 + rnd() * 50;
      c.fillStyle = rough ? g(v) : `rgba(${v},${v - 2},${v + 2},0.4)`;
      c.fillRect(GX0 + rnd() * GW, GZ0 + rnd() * GD, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
    c.fillStyle = rough ? g(215) : L.walk; c.fillRect(GX0, GZ0, GW, -44 - GZ0);
    if (!rough) {
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1.6;
      for (let x = GX0; x < GX0 + GW; x += 90) { c.beginPath(); c.moveTo(x, GZ0); c.lineTo(x, -44); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(GX0, -50, GW, 6);
    }
    c.fillStyle = rough ? g(150) : L.paint; c.fillRect(0, 0, COURT.len, COURT.depth);
    for (const hx of [HOOP.leftX, HOOP.rightX]) {
      const dir = hx < COURT.midX ? 1 : -1;
      c.save(); c.beginPath(); c.rect(0, 0, COURT.len, COURT.depth); c.clip();
      c.fillStyle = rough ? g(140) : L.arc;
      c.beginPath(); c.arc(hx, HOOP.z, THREE_PT, 0, Math.PI * 2); c.fill();
      c.restore();
      c.fillStyle = rough ? g(132) : L.key;
      c.fillRect(dir > 0 ? 0 : COURT.len - 250, HOOP.z - 70, 250, 140);
      c.beginPath(); c.arc(hx + dir * 132, HOOP.z, 70, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = rough ? g(132) : L.centre;
    c.beginPath(); c.arc(COURT.midX, HOOP.z, 62, 0, Math.PI * 2); c.fill();
    // Wear: scuffs, and patches where the paint has gone thin.
    for (let i = 0; i < 14000; i++) {
      c.fillStyle = rough ? g(150 + rnd() * 70) : rnd() < 0.5 ? `rgba(0,0,0,${0.03 + rnd() * 0.06})` : `rgba(255,240,220,${0.02 + rnd() * 0.04})`;
      c.fillRect(rnd() * COURT.len, rnd() * COURT.depth, 2 + rnd() * 7, 1 + rnd() * 2.5);
    }
    c.strokeStyle = rough ? g(120) : L.line; c.lineWidth = 4.5;
    c.strokeRect(2, 2, COURT.len - 4, COURT.depth - 4);
    c.beginPath(); c.moveTo(COURT.midX, 0); c.lineTo(COURT.midX, COURT.depth); c.stroke();
    c.beginPath(); c.arc(COURT.midX, HOOP.z, 62, 0, Math.PI * 2); c.stroke();
    for (const hx of [HOOP.leftX, HOOP.rightX]) {
      const dir = hx < COURT.midX ? 1 : -1;
      c.strokeRect(dir > 0 ? 2 : COURT.len - 250, HOOP.z - 70, 248, 140);
      c.beginPath(); c.arc(hx + dir * 132, HOOP.z, 70, 0, Math.PI * 2); c.stroke();
      c.save(); c.beginPath(); c.rect(0, 0, COURT.len, COURT.depth); c.clip();
      c.beginPath(); c.arc(hx, HOOP.z, THREE_PT, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    if (court === 'helipad' && !rough) {
      // The landing mark.
      c.fillStyle = L.line; c.font = '900 92px "Arial Black", "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('H', COURT.midX, HOOP.z + 6);
      c.lineWidth = 7; c.setLineDash([26, 16]);
      c.strokeRect(-60, -24, COURT.len + 120, COURT.depth + 60);
      c.setLineDash([]);
    }
    // Cracks in the asphalt and standing water in front of the court.
    if (!rough) {
      c.strokeStyle = 'rgba(10,8,12,0.5)'; c.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) {
        let x = GX0 + rnd() * GW, z = 372 + rnd() * 360;
        c.beginPath(); c.moveTo(x, z);
        for (let k = 0; k < 9; k++) { x += (rnd() - 0.5) * 70; z += (rnd() - 0.5) * 34; c.lineTo(x, z); }
        c.stroke();
      }
    }
    for (const p of puddles) {
      c.save(); c.translate(p.x, p.z); c.rotate(p.a);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      if (rough) { gr.addColorStop(0, g(10)); gr.addColorStop(0.75, g(14)); gr.addColorStop(1, 'rgba(236,236,236,0)'); }
      else { gr.addColorStop(0, 'rgba(12,12,18,0.7)'); gr.addColorStop(0.8, 'rgba(12,12,18,0.55)'); gr.addColorStop(1, 'rgba(12,12,18,0)'); }
      c.scale(p.rx, p.rz); c.fillStyle = gr;
      c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  };
  const ground = add(new THREE.Mesh(
    new THREE.PlaneGeometry(GW, GD),
    new THREE.MeshStandardMaterial({
      map: canvasTex(GW * PX, GD * PX, (c) => paint(c, false)),
      roughnessMap: canvasTex(GW * PX, GD * PX, (c) => paint(c, true), false),
      roughness: 1, metalness: 0,
    }),
  ), false);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(GX0 + GW / 2, 0, GZ0 + GD / 2);
  if (L.extra !== 'sky') {
    const land = add(new THREE.Mesh(new THREE.PlaneGeometry(18000, 14000), new THREE.MeshStandardMaterial({ color: L.asphalt, roughness: 0.95 })), false);
    land.rotation.x = -Math.PI / 2; land.position.set(750, -0.6, -1000);
  }

  // ---------------------------------------------------------------- hoops
  const gold = L.extra === 'palace';
  const steel = new THREE.MeshStandardMaterial({ color: gold ? '#c9a046' : '#7d8492', roughness: 0.38, metalness: 0.85 });
  const nets: { x: number; high: boolean; net: THREE.LineSegments; rim: THREE.Mesh; t: number; k: number; broken: boolean }[] = [];
  const netGeo = (() => {
    const N = 14, ROWS = 5, pts: number[] = [];
    const at = (i: number, j: number) => {
      const a = ((i + (j % 2) * 0.5) / N) * Math.PI * 2, r = HOOP.rimR - 0.6 - (HOOP.rimR * 0.42 * j) / ROWS;
      return [Math.cos(a) * r, -(j / ROWS) * 27, Math.sin(a) * r];
    };
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < N; i++) {
      pts.push(...at(i, j), ...at(i, j + 1));
      pts.push(...at(i, j), ...at(i + (j % 2 ? 1 : -1), j + 1));
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  })();
  const boardTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#c9d0da'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#e2572b'; c.lineWidth = 12; c.strokeRect(6, 6, 244, 244);
    c.lineWidth = 9; c.strokeRect(84, 122, 88, 74);
  });
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.94 });
  for (const hx of [HOOP.leftX, HOOP.rightX]) {
    const dir = hx < COURT.midX ? 1 : -1, bx = hx - dir * 22;
    add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 7, HIGH_RIM_Y + 64, 18), steel)).position.set(bx - dir * 36, (HIGH_RIM_Y + 64) / 2, HOOP.z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 6, 18), steel)).position.set(bx - dir * 36, 3, HOOP.z);
    for (const [y, bw, bh] of [[HOOP.rimY, 108, 76], [HIGH_RIM_Y, 82, 56]] as const) {
      add(new THREE.Mesh(new THREE.BoxGeometry(36, 6, 6), steel)).position.set(bx - dir * 18, y + 30, HOOP.z);
      add(new THREE.Mesh(new THREE.BoxGeometry(3.5, bh, bw), [boardMat, boardMat, steel, steel, steel, steel])).position.set(bx, y + bh / 2 - 13, HOOP.z);
      const high = y === HIGH_RIM_Y;
      const rim = add(new THREE.Mesh(new THREE.TorusGeometry(HOOP.rimR, 1.6, 12, 48), new THREE.MeshStandardMaterial({ color: high ? '#f5c02e' : '#f0531f', roughness: 0.32, metalness: high ? 0.9 : 0.55 })));
      rim.rotation.x = Math.PI / 2; rim.position.set(hx, y, HOOP.z);
      add(new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 9), steel)).position.set(hx - dir * (HOOP.rimR + 3), y, HOOP.z);
      const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.25), transparent: true, opacity: 0.9 }));
      net.position.set(hx, y - 1, HOOP.z);
      root.add(net);
      nets.push({ x: hx, high, net, rim, t: 9, k: 1, broken: false });
    }
  }

  // ---------------------------------------------------------------- fence
  const link = canvasTex(64, 64, (c) => {
    c.strokeStyle = 'rgba(205,210,222,1)'; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(0, 32); c.lineTo(32, 0); c.lineTo(64, 32); c.lineTo(32, 64); c.closePath(); c.stroke();
  });
  link.wrapS = link.wrapT = THREE.RepeatWrapping;
  const fenceMat = new THREE.MeshStandardMaterial({ map: link, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.7 });
  const post = L.extra === 'sky' ? new THREE.MeshStandardMaterial({ color: '#e6eaf0', roughness: 0.4, metalness: 0.6 }) : steel;
  const FENCE_H = L.extra === 'sky' ? 96 : 176;
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, FENCE_H);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 17), uv.getY(i) * (FENCE_H / 17));
    const m = add(new THREE.Mesh(g, fenceMat), false);
    m.position.set((x0 + x1) / 2, FENCE_H / 2, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    m.userData.noAO = true;
    const n = Math.round(len / 164);
    for (let i = 0; i <= n; i++) add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, FENCE_H + 6, 10), post)).position.set(x0 + ((x1 - x0) * i) / n, (FENCE_H + 6) / 2, z0 + ((z1 - z0) * i) / n);
    const rail = add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, len, 8), post));
    rail.position.set((x0 + x1) / 2, FENCE_H, (z0 + z1) / 2);
    rail.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), Math.PI / 2);
  };
  fence(-90, -38, 1590, -38);
  fence(-90, -38, -90, 420);
  fence(1590, -38, 1590, 420);

  // ---------------------------------------------------------------- the painted wall
  if (L.wall) {
    const W = L.wall;
    const wallTex = canvasTex(4096, 256, (c) => {
      const base = new THREE.Color(W.brick);
      c.fillStyle = W.brick; c.fillRect(0, 0, 4096, 256);
      for (let r = 0; r < 16; r++) for (let k = 0; k < 130; k++) {
        const v = 0.9 + rnd() * 0.45;
        c.fillStyle = `rgb(${Math.round(base.r * 255 * v)},${Math.round(base.g * 255 * v)},${Math.round(base.b * 255 * v)})`;
        c.fillRect(k * 32 + (r % 2) * 16 - 16, r * 16, 30, 14);
      }
      // Big blocks of colour behind the letters, then the letters.
      for (let i = 0; i < 26; i++) {
        c.fillStyle = pick(W.splash); c.globalAlpha = 0.85;
        c.beginPath(); c.ellipse(rnd() * 4096, 60 + rnd() * 150, 60 + rnd() * 150, 30 + rnd() * 60, rnd() - 0.5, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      for (const [text, fillCol, x, size] of W.words) {
        c.save(); c.translate(x, 132); c.rotate((rnd() - 0.5) * 0.12); c.font = `900 italic ${size}px "Arial Black", "Trebuchet MS", sans-serif`;
        c.lineWidth = size * 0.2; c.strokeStyle = '#17121c'; c.strokeText(text, 0, 0);
        c.lineWidth = size * 0.09; c.strokeStyle = '#ffffff'; c.strokeText(text, 0, 0);
        c.fillStyle = fillCol; c.fillText(text, 0, 0);
        c.restore();
      }
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, 226, 4096, 30);
    });
    const brick = new THREE.MeshStandardMaterial({ color: W.brick, roughness: 0.9 });
    const neon = L.extra === 'neon';
    const face = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, color: W.tint, emissiveMap: neon ? wallTex : null, emissive: neon ? new THREE.Color(0.55, 0.55, 0.55) : new THREE.Color(0, 0, 0) });
    add(new THREE.Mesh(new THREE.BoxGeometry(2300, 132, 16), [brick, brick, brick, brick, face, brick])).position.set(750, 66, -168);
    add(new THREE.Mesh(new THREE.BoxGeometry(2310, 7, 22), new THREE.MeshStandardMaterial({ color: gold ? '#c9a046' : '#b9b0a4', roughness: 0.6, metalness: gold ? 0.8 : 0 }))).position.set(750, 135, -168);
  }

  // ---------------------------------------------------------------- trees and lamps
  const bark = new THREE.MeshStandardMaterial({ color: '#4a3528', roughness: 0.9 });
  if (L.trees) {
    const leaves = L.trees.map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, flatShading: true }));
    const blob = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 11; i++) {
      const x = -260 + i * 205 + (rnd() - 0.5) * 80, z = -250 - rnd() * 90, hgt = 105 + rnd() * 60;
      add(new THREE.Mesh(new THREE.CylinderGeometry(6, 10, hgt, 8), bark)).position.set(x, hgt / 2, z);
      const mat = pick(leaves);
      for (let k = 0; k < 6; k++) {
        const b = add(new THREE.Mesh(blob, rnd() < 0.25 ? pick(leaves) : mat));
        const r = 38 + rnd() * 26;
        b.scale.set(r, r * (0.75 + rnd() * 0.3), r);
        b.position.set(x + (rnd() - 0.5) * 84, hgt + 6 + rnd() * 52, z + (rnd() - 0.5) * 70);
        b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      }
    }
  }
  [80, 520, 980, 1420].forEach((x, i) => {
    const col = L.lampCols[i % L.lampCols.length];
    add(new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 250, 10), post)).position.set(x, 125, -72);
    add(new THREE.Mesh(new THREE.BoxGeometry(5, 5, 60), post)).position.set(x, 250, -46);
    add(new THREE.Mesh(new THREE.BoxGeometry(18, 6, 26), post)).position.set(x, 250, -14);
    add(new THREE.Mesh(new THREE.BoxGeometry(12, 2, 20), new THREE.MeshBasicMaterial({ color: rgb(col, 9 * L.lamps) })), false).position.set(x, 246.4, -14);
    if (L.lamps > 1) {
      // After dark the lamps do real work: each lights the court under it, and one more out front lights the faces.
      const lamp = new THREE.PointLight(rgb(col), 7000 * L.lamps, 900, 1.5);
      lamp.position.set(x, 240, -10);
      const front = new THREE.PointLight(rgb(L.lampCols[(i + 1) % L.lampCols.length]), 4000 * L.lamps, 1000, 1.5);
      front.position.set(x - 60, 220, 520);
      root.add(lamp, front);
    }
  });

  // ---------------------------------------------------------------- what stands behind
  const roof = new THREE.MeshStandardMaterial({ color: '#2a2730', roughness: 0.9 });
  if (L.city) {
    const C = L.city;
    const winTex = C.walls.map((col) => canvasTex(128, 256, (c) => {
      c.fillStyle = col; c.fillRect(0, 0, 128, 256);
      for (let r = 0; r < 16; r++) for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(8,8,14,0.8)'; c.fillRect(8 + i * 20, 5 + r * 15.6, 13, 10); }
    }));
    const lightTex = C.walls.map(() => canvasTex(128, 256, (c) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, 128, 256);
      for (let r = 0; r < 16; r++) for (let i = 0; i < 6; i++) if (rnd() < C.lit) { c.fillStyle = rnd() < 0.75 ? '#ffc56e' : '#bfe0ff'; c.fillRect(8 + i * 20, 5 + r * 15.6, 13, 10); }
    }));
    const tower = (x: number, z: number, w: number, h: number, d: number) => {
      const k = Math.floor(rnd() * winTex.length);
      const mk = (rep: number) => {
        const m = new THREE.MeshStandardMaterial({ map: winTex[k].clone(), emissiveMap: lightTex[k].clone(), emissive: rgb(C.glow), roughness: 0.75 });
        for (const t of [m.map!, m.emissiveMap!]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(rep / 130)), Math.max(1, Math.round(h / 250))); }
        return m;
      };
      const front = mk(w), flank = mk(d);
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [flank, flank, roof, roof, front, front]), false).position.set(x, h / 2, z);
      if (L.extra === 'palace' && rnd() < 0.6) {
        // An onion dome with a spire.
        const dome = add(new THREE.Mesh(new THREE.LatheGeometry([[0.01, 0], [0.7, 0.05], [1, 0.45], [0.8, 0.9], [0.3, 1.3], [0.06, 1.7], [0.01, 2.2]].map(([r, y]) => new THREE.Vector2(r, y)), 20), new THREE.MeshStandardMaterial({ color: '#d9b04e', roughness: 0.3, metalness: 0.9 })), false);
        const s = Math.min(w, d) * 0.36;
        dome.scale.setScalar(s); dome.position.set(x, h, z);
      } else if (rnd() < 0.45) {
        // A water tank on legs.
        const tx = x + (rnd() - 0.5) * w * 0.5;
        add(new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 40, 12), bark), false).position.set(tx, h + 46, z);
        add(new THREE.Mesh(new THREE.ConeGeometry(25, 16, 12), roof), false).position.set(tx, h + 74, z);
        add(new THREE.Mesh(new THREE.BoxGeometry(30, 26, 30), roof), false).position.set(tx, h + 13, z);
      }
      if (L.extra === 'neon' && rnd() < 0.8) {
        // A sign in lights on the front.
        const word = pick(['ARCADE', 'INSERT COIN', 'HI-SCORE', 'PIXELS', 'GAME ON', '1UP', 'PLAY', 'TOKENS']);
        const col = pick(['#ff4fa3', '#3ff0ff', '#7dff6a', '#ffe14a', '#b56bff']);
        const tex = canvasTex(512, 128, (c) => {
          c.fillStyle = '#0a0818'; c.fillRect(0, 0, 512, 128);
          c.strokeStyle = col; c.lineWidth = 8; c.strokeRect(10, 10, 492, 108);
          c.fillStyle = col; c.font = '900 76px "Arial Black", "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(word, 256, 68, 460);
        });
        const sw = Math.min(w * 0.86, 220);
        add(new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3.2, 3.2, 3.2) })), false).position.set(x, Math.min(h - 30, 190 + rnd() * 90), z + d / 2 + 2);
      }
    };
    const near = L.extra === 'docks' ? 110 : 150;
    for (let x = -1500; x < 3000;) { const w = 170 + rnd() * 230; tower(x + w / 2, -600 - rnd() * 120, w, near + rnd() * 190, 200); x += w + 16 + rnd() * 90; }
    for (let x = -2200; x < 3700;) { const w = 200 + rnd() * 260; tower(x + w / 2, -1050 - rnd() * 260, w, 220 + rnd() * 300, 240); x += w + 30 + rnd() * 140; }
    for (let z = -300; z < 700; z += 330) { tower(-560 - rnd() * 120, z, 240, 260 + rnd() * 260, 300); tower(2060 + rnd() * 120, z, 240, 260 + rnd() * 260, 300); }
    // The far skyline: plain blocks the haze turns into silhouettes.
    const far = new THREE.MeshStandardMaterial({ color: C.far, roughness: 1 });
    for (let x = -4200; x < 5600;) {
      const w = 180 + rnd() * 320, h = 300 + rnd() * rnd() * 800;
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 200), far), false).position.set(x + w / 2, h / 2, -2600 - rnd() * 900);
      x += w + rnd() * 160;
    }
  }
  if (L.extra === 'docks') {
    // Stacked containers behind the wall, and cranes standing over them.
    const ribs = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(0,0,0,0.22)'; for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 3, 64); }, true);
    ribs.wrapS = THREE.RepeatWrapping; ribs.repeat.x = 6;
    const cols = ['#c2452d', '#2a7f8c', '#d99a2b', '#3d5a80', '#7a8a3a', '#b8b0a8'].map((col) => new THREE.MeshStandardMaterial({ color: col, map: ribs, roughness: 0.6, metalness: 0.3 }));
    for (let x = -420; x < 1900; x += 152 + rnd() * 30) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) add(new THREE.Mesh(new THREE.BoxGeometry(146, 58, 60), pick(cols))).position.set(x + (rnd() - 0.5) * 14, 29 + k * 58, -250 - rnd() * 14);
    }
    const iron = new THREE.MeshStandardMaterial({ color: '#c2452d', roughness: 0.5, metalness: 0.5 });
    for (const x of [140, 1180]) {
      for (const dx of [-60, 60]) for (const dz of [-40, 40]) add(new THREE.Mesh(new THREE.BoxGeometry(12, 420, 12), iron), false).position.set(x + dx, 210, -420 + dz);
      add(new THREE.Mesh(new THREE.BoxGeometry(150, 16, 100), iron), false).position.set(x, 420, -420);
      add(new THREE.Mesh(new THREE.BoxGeometry(520, 14, 18), iron), false).position.set(x + 110, 450, -420);
      add(new THREE.Mesh(new THREE.BoxGeometry(40, 34, 40), new THREE.MeshStandardMaterial({ color: '#f1f1f6', roughness: 0.5 })), false).position.set(x - 20, 412, -420);
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 170, 6), iron), false).position.set(x + 300, 358, -420);
      add(new THREE.Mesh(new THREE.BoxGeometry(146, 58, 60), pick(cols)), false).position.set(x + 300, 244, -420);
    }
    // The harbour: flat water that mirrors the sky.
    const water = add(new THREE.Mesh(new THREE.PlaneGeometry(16000, 6000), new THREE.MeshStandardMaterial({ color: '#1c2a3a', roughness: 0.08, metalness: 0.6 })), false);
    water.rotation.x = -Math.PI / 2; water.position.set(750, 0.4, -4200);
  }
  if (L.extra === 'sky') {
    // A sea of cloud below the pad, and other towers standing out of it.
    const puff = new THREE.MeshStandardMaterial({ color: '#dfe8f4', roughness: 1, emissive: new THREE.Color(0.1, 0.12, 0.16) });
    const blob = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 150; i++) {
      const b = add(new THREE.Mesh(blob, puff), false);
      const r = 220 + rnd() * 420, a = rnd() * Math.PI * 2, dist = 900 + rnd() * 4800;
      b.scale.set(r * 1.6, r * 0.55, r);
      b.position.set(750 + Math.cos(a) * dist, -260 - rnd() * 160, -600 - Math.abs(Math.sin(a)) * dist);
    }
    const glass = new THREE.MeshStandardMaterial({ color: '#8fb4dc', roughness: 0.15, metalness: 0.7 });
    for (let i = 0; i < 16; i++) {
      const w = 160 + rnd() * 200, h = 300 + rnd() * 900;
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), glass), false).position.set(-2600 + i * 420 + rnd() * 160, h / 2 - 600, -1500 - rnd() * 2200);
    }
    // The pad is the top of a tower: a rim round its edge, with red beacons.
    const edge = new THREE.MeshStandardMaterial({ color: '#c4cad4', roughness: 0.5, metalness: 0.4 });
    add(new THREE.Mesh(new THREE.BoxGeometry(GW, 600, GD), edge), false).position.set(GX0 + GW / 2, -301, GZ0 + GD / 2);
  }
  if (L.extra === 'palace') {
    // Banners between gold poles along the wall.
    for (let i = 0; i < 9; i++) {
      const x = -180 + i * 232;
      add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 300, 10), steel)).position.set(x, 150, -150);
      add(new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), steel)).position.set(x, 304, -150);
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(64, 120, 6, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? '#8b5cf6' : '#c9a046', roughness: 0.7, side: THREE.DoubleSide })));
      flag.position.set(x + 36, 232, -150);
      flag.userData.wave = i;
    }
  }

  // ---------------------------------------------------------------- air and ball
  const MOTES = 520;
  const mp = new Float32Array(MOTES * 3), mv = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) { mp[i * 3] = -200 + rnd() * 1900; mp[i * 3 + 1] = rnd() * 330; mp[i * 3 + 2] = -30 + rnd() * 620; mv[i] = rnd() * 6.28; }
  const moteGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    size: 5, sizeAttenuation: true, transparent: true, opacity: L.extra === 'sky' ? 0.2 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: rgb(L.sunCol, 2.2 * Math.min(1, L.sunPow / 3) + (L.lamps > 2 ? 1.4 : 0)), fog: false,
    map: canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); }),
  }));
  motes.frustumCulled = false;
  root.add(motes);

  const ballMat = new THREE.MeshStandardMaterial({
    roughness: 0.62,
    map: canvasTex(512, 256, (c) => {
      c.fillStyle = '#e06f24'; c.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 7000; i++) { c.fillStyle = `rgba(110,45,8,${rnd() * 0.22})`; c.fillRect(rnd() * 512, rnd() * 256, 2, 2); }
      c.strokeStyle = '#1f130e'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(0, 128); c.lineTo(512, 128); c.stroke();
      for (const x of [128, 384]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
      for (const x of [0, 256, 512]) { c.beginPath(); c.ellipse(x, 128, 70, 128, 0, 0, Math.PI * 2); c.stroke(); }
    }),
  });
  const ball = add(new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), ballMat));
  const flags = root.children.filter((o) => o.userData.wave !== undefined) as THREE.Mesh[];

  return {
    ball, ballMat, exposure: L.exposure,
    frame(camera, lookX, dt, time, gust) {
      sky.position.copy(camera.position);
      sun.target.position.set(lookX, 0, 200);
      sun.position.copy(sun.target.position).addScaledVector(SUN, 1800);
      const wind = gust ? gust * 260 : 9;
      for (let i = 0; i < MOTES; i++) {
        mp[i * 3] += (wind + Math.sin(time * 0.3 + mv[i]) * 6) * dt;
        mp[i * 3 + 1] += Math.sin(time * 0.5 + mv[i] * 3) * 5 * dt;
        if (mp[i * 3] > 1700) mp[i * 3] = -200; else if (mp[i * 3] < -200) mp[i * 3] = 1700;
      }
      moteGeo.getAttribute('position').needsUpdate = true;
      for (const n of nets) {
        n.t += dt;
        const k = Math.exp(-n.t * 3.2) * Math.sin(n.t * 22) * n.k;
        n.net.scale.set(1 - 0.22 * k, 1 + 0.5 * k, 1 - 0.22 * k);
        n.net.rotation.z = gust ? gust * 0.25 + Math.sin(time * 9) * 0.05 : 0;
      }
      for (const f of flags) f.rotation.y = Math.sin(time * 1.6 + f.userData.wave) * 0.25 + (gust ? gust * 0.6 : 0);
    },
    swish(hoopX, rimY, strength) {
      for (const n of nets) if (Math.abs(n.x - hoopX) < 40 && n.high === rimY > (HOOP.rimY + HIGH_RIM_Y) / 2) { n.t = 0; n.k = strength; }
    },
    setBroken(hoopX, high, broken) {
      for (const n of nets) {
        if (n.x !== hoopX || n.high !== high || n.broken === broken) continue;
        n.broken = broken;
        const dir = hoopX < COURT.midX ? 1 : -1;
        n.net.visible = !broken;
        // It swings down from the edge still bolted to the board.
        n.rim.rotation.set(Math.PI / 2, broken ? dir * 1.25 : 0, 0);
        n.rim.position.set(hoopX - (broken ? dir * HOOP.rimR * 0.7 : 0), (high ? HIGH_RIM_Y : HOOP.rimY) - (broken ? HOOP.rimR * 0.95 : 0), HOOP.z);
      }
    },
    dispose() {
      root.removeFromParent();
      const seen = new Set<THREE.Material>();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
          if (seen.has(mat)) continue;
          seen.add(mat);
          const sm = mat as THREE.MeshStandardMaterial;
          sm.map?.dispose(); sm.roughnessMap?.dispose(); sm.emissiveMap?.dispose();
          mat.dispose();
        }
        const lt = o as THREE.DirectionalLight;
        if (lt.isDirectionalLight && lt.shadow?.map) lt.shadow.map.dispose();
      });
      env.dispose();
    },
  };
}
