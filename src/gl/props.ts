// Everything on the court that is not a player, the ball or the building: launch pads, items,
// vehicles, traffic, the wrecking ball, bumpers, tank shells and the saucer. All built in code.
import * as THREE from 'three';
import { COURT, PAD_RECHARGE } from '../core/constants';
import type { Game, Item } from '../core/game';
import type { ItemKind, RideKind } from '../core/teams';
import type { Ride } from '../core/toys';
import type { RideAnim } from '../client/vehicles';
import type { Puppet } from './puppet';

const UP = new THREE.Vector3(0, 1, 0);
const mats = new Map<string, THREE.MeshStandardMaterial>();
/** A shared material by colour, roughness and metalness. */
function std(color: string, rough = 0.6, metal = 0): THREE.MeshStandardMaterial {
  const key = `${color}/${rough}/${metal}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); mats.set(key, m); }
  return m;
}
const glow = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

type Geo = THREE.BufferGeometry;
const box = (w: number, h: number, d: number): Geo => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 16): Geo => new THREE.CylinderGeometry(r1, r0, h, seg);
const ball = (r: number): Geo => new THREE.SphereGeometry(r, 20, 14);
/** Adds a mesh to `g` at a place; `rot` is in radians about x, y, z. */
function part(g: THREE.Object3D, geo: Geo, mat: THREE.Material, x = 0, y = 0, z = 0, rot?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A tube between two points (chains, legs). */
function span(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length() || 1;
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
}

// ---------------------------------------------------------------- items

/** Items stand on the floor at the group's origin; a bat and a hammer have their grip there instead. */
function buildItem(kind: ItemKind): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'can': {
      part(g, cyl(7, 8, 19, 18), std('#aab3c0', 0.35, 0.8), 0, 9.5, 0);
      for (const y of [5, 10, 15]) part(g, new THREE.TorusGeometry(7.7, 0.5, 6, 18), std('#7f8996', 0.4, 0.8), 0, y, 0, [Math.PI / 2, 0, 0]);
      part(g, cyl(9, 9, 3, 18), std('#7d8794', 0.4, 0.8), 0, 20.5, 0);
      part(g, new THREE.TorusGeometry(3, 0.7, 6, 12, Math.PI), std('#5d6672', 0.4, 0.8), 0, 22, 0);
      break;
    }
    case 'cone': {
      part(g, box(19, 3, 19), std('#ff7a1a', 0.6), 0, 1.5, 0);
      part(g, cyl(7, 1.6, 19, 18), std('#ff7a1a', 0.6), 0, 12.5, 0);
      part(g, cyl(4.9, 3.5, 5, 18), std('#ffffff', 0.5), 0, 12, 0);
      break;
    }
    case 'crate': {
      const tex = canvasTex(128, 128, (c) => {
        c.fillStyle = '#b5814a'; c.fillRect(0, 0, 128, 128);
        c.fillStyle = '#c9965c'; for (let i = 0; i < 4; i++) c.fillRect(0, i * 32 + 3, 128, 13);
        c.strokeStyle = '#7a4f24'; c.lineWidth = 16; c.strokeRect(8, 8, 112, 112);
        c.beginPath(); c.moveTo(12, 12); c.lineTo(116, 116); c.stroke();
        c.fillStyle = '#3a2a1a'; for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }
      });
      part(g, box(21, 21, 21), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), 0, 10.5, 0);
      break;
    }
    case 'bomb': {
      const body = part(g, ball(10), new THREE.MeshStandardMaterial({ color: '#23232d', roughness: 0.35, metalness: 0.4 }), 0, 10, 0);
      body.name = 'body';
      part(g, cyl(2.8, 2.8, 4), std('#6b6b78', 0.4, 0.7), 0, 21, 0);
      part(g, new THREE.TorusGeometry(5, 0.8, 6, 12, 1.6), std('#c9a25a', 0.8), 5, 23, 0, [0, 0, 1.4]);
      part(g, ball(2.6), glow(8, 5, 1), 9.5, 25.5, 0).name = 'spark';
      break;
    }
    case 'bat': {
      const wood = std('#c8924a', 0.55);
      part(g, cyl(1.5, 3.9, 30, 14), wood, 0, 17, 0);
      part(g, ball(3.9), wood, 0, 32, 0);
      part(g, cyl(1.6, 1.6, 8, 10), std('#2b2533', 0.8), 0, 2, 0);
      part(g, cyl(2.4, 2.4, 1.6, 10), wood, 0, -2.4, 0);
      break;
    }
    case 'banana': {
      part(g, new THREE.TorusGeometry(9, 2.7, 10, 18, 2), std('#ffe14a', 0.5), 0, 11, 0, [0, 0, 3.7]);
      part(g, cyl(1.2, 1, 3, 8), std('#6b4a1e', 0.8), 8.4, 6.4, 0, [0, 0, 0.9]);
      break;
    }
    case 'hammer': {
      part(g, cyl(1.7, 1.7, 34, 12), std('#b5814a', 0.6), 0, 15, 0);
      part(g, cyl(6.5, 6.5, 19, 16), std('#8f96a8', 0.3, 0.9), 0, 33, 0, [0, 0, Math.PI / 2]);
      part(g, cyl(7.2, 7.2, 2.4, 16), std('#5d6672', 0.3, 0.9), 9, 33, 0, [0, 0, Math.PI / 2]);
      part(g, cyl(7.2, 7.2, 2.4, 16), std('#5d6672', 0.3, 0.9), -9, 33, 0, [0, 0, Math.PI / 2]);
      break;
    }
    case 'ext': {
      part(g, cyl(6.4, 6.4, 17, 16), std('#e23b3b', 0.35, 0.3), 0, 8.5, 0);
      part(g, ball(6.4), std('#e23b3b', 0.35, 0.3), 0, 17, 0).scale.y = 0.6;
      part(g, cyl(6.6, 6.6, 4, 16), std('#ffffff', 0.5), 0, 9, 0);
      part(g, cyl(2.6, 2.6, 5, 10), std('#2b2b33', 0.5, 0.5), 0, 22, 0);
      part(g, cyl(1, 1, 10, 8), std('#2b2b33', 0.5), 6, 21, 0, [0, 0, -1.2]);
      break;
    }
    case 'magnet': {
      const red = std('#e23b3b', 0.4, 0.3), tip = std('#f1f1f6', 0.3, 0.8);
      part(g, new THREE.TorusGeometry(7, 2.6, 10, 18, Math.PI), red, 0, 13, 0);
      for (const x of [-7, 7]) { part(g, cyl(2.6, 2.6, 6, 12), red, x, 10, 0); part(g, cyl(2.6, 2.6, 5, 12), tip, x, 4.5, 0); }
      break;
    }
    case 'shoes': {
      for (let i = 0; i < 5; i++) part(g, new THREE.TorusGeometry(4.6, 0.8, 6, 14), std('#9aa0b5', 0.3, 0.9), 0, 1.5 + i * 2.3, 0, [Math.PI / 2 + (i % 2 ? 0.2 : -0.2), 0, 0]);
      const green = std('#3fd07a', 0.5);
      part(g, ball(1), green, 2, 15, 0).scale.set(9, 4, 5);
      part(g, cyl(4, 4.4, 9, 12), green, -3, 20, 0);
      break;
    }
  }
  return g;
}

// ---------------------------------------------------------------- vehicles

interface RideModel { g: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[]; rotor?: THREE.Object3D; tail?: THREE.Object3D; barrel?: THREE.Object3D; stripe: THREE.MeshStandardMaterial; yaw: number }

function buildRide(kind: RideKind): RideModel {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const wheels: THREE.Object3D[] = [];
  const stripe = new THREE.MeshStandardMaterial({ color: '#d8dde6', roughness: 0.5 });
  const model: RideModel = { g, body, wheels, stripe, yaw: 0 };
  // Sized up to sit right beside the big-headed players, as the 2D ones are.
  body.scale.setScalar(kind === 'heli' ? 1.35 : kind === 'tank' ? 1.15 : 1.1);
  const tyre = std('#22222a', 0.8), steel = std('#8f96a8', 0.3, 0.9);
  if (kind === 'board') {
    part(body, box(52, 2.6, 17), std('#3a2a1e', 0.7), 0, 9.6, 0);
    part(body, box(52, 0.6, 17.4), stripe, 0, 8.2, 0);
    for (const s of [1, -1]) {
      part(body, box(13, 2.6, 17), std('#3a2a1e', 0.7), s * 31, 11.4, 0, [0, 0, s * 0.32]);
      part(body, box(5, 3.4, 13), steel, s * 19, 6.4, 0);
      for (const z of [8.5, -8.5]) wheels.push(part(body, cyl(4.4, 4.4, 4.6, 14), std('#ffd23f', 0.5), s * 19, 4.4, z, [Math.PI / 2, 0, 0]));
    }
  } else if (kind === 'tank') {
    const green = std('#5c7a3a', 0.7), dark = std('#3d5426', 0.75);
    part(body, box(86, 22, 44), green, 0, 22, 0);
    part(body, box(40, 10, 44), green, 40, 20, 0, [0, 0, -0.5]);
    part(body, box(88, 4, 46), stripe, 0, 30, 0);
    for (const z of [27, -27]) {
      part(body, box(84, 18, 12), tyre, 0, 10, z);
      for (const x of [-42, 42]) part(body, cyl(9, 9, 12, 14), tyre, x, 10, z, [Math.PI / 2, 0, 0]);
      for (const x of [-30, -10, 10, 30]) wheels.push(part(body, cyl(7, 7, 13, 12), dark, x, 9, z, [Math.PI / 2, 0, 0]));
    }
    // The turret is an open drum, so the driver standing in it shows from the waist up.
    const drum = part(body, new THREE.CylinderGeometry(17, 20, 30, 24, 1, true), green, 0, 48, 0);
    (drum.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    part(body, new THREE.TorusGeometry(17, 2.4, 8, 24), dark, 0, 63, 0, [Math.PI / 2, 0, 0]);
    const barrel = new THREE.Group();
    barrel.position.set(16, 50, 0);
    part(barrel, cyl(3.4, 3.4, 46, 12), dark, 23, 0, 0, [0, 0, -Math.PI / 2]);
    part(barrel, cyl(4.6, 4.6, 8, 12), dark, 46, 0, 0, [0, 0, -Math.PI / 2]);
    body.add(barrel);
    model.barrel = barrel;
  } else {
    const red = std('#e2452f', 0.4, 0.2), white = std('#f1f1f6', 0.4, 0.2);
    // An open tub, so the pilot is seen sitting in it.
    const tub = part(body, new THREE.SphereGeometry(24, 24, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), red, 4, 30, 0);
    tub.scale.set(1.25, 0.9, 0.8);
    (tub.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    part(body, new THREE.TorusGeometry(24, 1.6, 8, 28), white, 4, 30, 0, [Math.PI / 2, 0, 0]).scale.set(1.25, 0.8, 1);
    part(body, new THREE.SphereGeometry(24, 24, 12, -Math.PI * 0.5, Math.PI, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: '#bfe6ff', roughness: 0.1, transparent: true, opacity: 0.28 }), 4, 30, 0).scale.set(1.25, 0.95, 0.8);
    part(body, box(4, 4, 62), stripe, 4, 22, 0);
    part(body, cyl(7, 3, 58, 12), red, -52, 38, 0, [0, 0, Math.PI / 2]);
    part(body, box(4, 20, 1.5), white, -80, 46, 0, [0, 0, 0.4]);
    const tail = new THREE.Group();
    tail.position.set(-80, 44, 4);
    part(tail, box(2, 22, 1), steel, 0, 0, 0); part(tail, box(22, 2, 1), steel, 0, 0, 0);
    body.add(tail);
    model.tail = tail;
    part(body, cyl(2, 2, 16, 10), steel, 4, 58, 0);
    const rotor = new THREE.Group();
    rotor.position.set(4, 66, 0);
    part(rotor, box(150, 1.2, 8), std('#2b2b33', 0.5), 0, 0, 0); part(rotor, box(8, 1.2, 150), std('#2b2b33', 0.5), 0, 0, 0);
    part(rotor, cyl(4, 4, 3, 12), steel, 0, 0, 0);
    body.add(rotor);
    model.rotor = rotor;
    for (const z of [17, -17]) {
      part(body, cyl(1.8, 1.8, 66, 10), steel, 2, 3, z, [0, 0, Math.PI / 2]);
      for (const x of [-14, 18]) part(body, cyl(1.4, 1.4, 12, 8), steel, x, 9, z);
    }
  }
  return model;
}

function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const side = canvasTex(256, 64, (c) => {
    c.fillStyle = '#d8372a'; c.fillRect(0, 0, 256, 64);
    // Flames licking back from the nose, and a number on the door.
    for (let i = 0; i < 7; i++) {
      c.fillStyle = i % 2 ? '#ffe14a' : '#ff8a2a';
      c.beginPath(); c.moveTo(256, 8 + i * 7); c.quadraticCurveTo(190 - i * 6, 2 + i * 8, 120 + (i % 3) * 16, 12 + i * 7); c.quadraticCurveTo(190, 16 + i * 7, 256, 20 + i * 7); c.fill();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(70, 34, 20, 0, 7); c.fill();
    c.fillStyle = '#17121c'; c.font = '900 28px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('13', 70, 36);
  });
  const red = std('#d8372a', 0.3, 0.3), paint = new THREE.MeshStandardMaterial({ map: side, roughness: 0.3, metalness: 0.3 });
  const flip = paint.clone(); flip.map = side.clone(); flip.map.wrapS = THREE.RepeatWrapping; flip.map.repeat.x = -1;
  part(g, box(170, 26, 66), [red, red, red, red, paint, flip] as unknown as THREE.Material, 0, 27, 0);
  part(g, box(64, 24, 58), std('#17202c', 0.1, 0.6), -22, 50, 0);
  part(g, box(68, 3, 60), red, -22, 63, 0);
  part(g, box(16, 12, 20), std('#8f96a8', 0.3, 0.9), 40, 46, 0);
  part(g, box(10, 3, 70), red, -88, 52, 0);
  for (const z of [26, -26]) { part(g, box(3, 12, 3), red, -86, 45, z); part(g, ball(5), glow(9, 7.5, 4), 86, 30, z); part(g, box(3, 6, 10), glow(5, 0.4, 0.3), -85.5, 32, z); }
  for (const [x, r] of [[-52, 19], [56, 15]] as const) for (const z of [34, -34]) {
    part(g, cyl(r, r, 12, 18), std('#17171d', 0.8), x, r, z, [Math.PI / 2, 0, 0]).name = 'wheel';
    part(g, cyl(r * 0.5, r * 0.5, 13, 12), std('#c4cad8', 0.3, 0.9), x, r, z, [Math.PI / 2, 0, 0]);
  }
  return g;
}

const FURS = [['#b5722e', '#e9d2a8'], ['#3a3a44', '#8f8f9c'], ['#e9e2d2', '#ffffff'], ['#7a4a22', '#c8a070']];
interface Dog { g: THREE.Group; legs: THREE.Mesh[]; tail: THREE.Mesh; head: THREE.Group; body: THREE.Mesh }
function buildDog(i: number): Dog {
  const g = new THREE.Group(), [fur, belly] = FURS[i % 4];
  const f = std(fur, 0.8), b = std(belly, 0.8);
  const body = part(g, ball(1), f, 0, 25, 0); body.scale.set(22, 10, 9);
  part(g, ball(1), b, 6, 21, 0).scale.set(13, 6, 7);
  const head = new THREE.Group();
  head.position.set(22, 33, 0);
  part(head, ball(8), f, 2, 0, 0);
  part(head, box(11, 6, 7), b, 11, -2, 0);
  part(head, ball(1.8), std('#17121c', 0.3), 17, -0.5, 0);
  part(head, box(6, 2, 4), std('#e2577a', 0.6), 13, -6.5, 0, [0, 0, -0.4]);
  for (const z of [4.6, -4.6]) { part(head, box(5, 8, 2), f, -1, 7, z, [0, 0, 0.5]); part(head, ball(1.4), std('#17121c', 0.2), 6.5, 2.4, z * 0.8); }
  part(head, new THREE.TorusGeometry(7.4, 1.3, 6, 14), std('#d8372a', 0.5), -4, -3, 0, [0, Math.PI / 2, 0.3]);
  g.add(head);
  const legs = [0, 1, 2, 3].map(() => part(g, cyl(2.6, 2, 1, 8), f));
  const tail = part(g, cyl(2.2, 1, 16, 8), f, -24, 30, 0);
  return { g, legs, tail, head, body };
}

function buildUfo(): { g: THREE.Group; beam: THREE.Mesh; spot: THREE.Mesh; lights: THREE.Mesh[] } {
  const g = new THREE.Group();
  const hull = new THREE.LatheGeometry([[0, -12], [26, -10], [62, 0], [30, 9], [0, 11]].map(([r, y]) => new THREE.Vector2(Math.max(0.01, r), y)), 40);
  part(g, hull, std('#aab3c6', 0.25, 0.9), 0, 0, 0);
  part(g, new THREE.SphereGeometry(24, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: '#9ff3e0', roughness: 0.05, transparent: true, opacity: 0.45 }), 0, 6, 0);
  // The pilot: a green head with big dark eyes, peering down.
  part(g, ball(9), std('#7dff6a', 0.5), 0, 16, 0).scale.y = 1.15;
  for (const s of [1, -1]) part(g, ball(3), std('#101018', 0.1), s * 3.6, 17, 7.6).scale.set(1, 1.5, 0.6);
  part(g, cyl(0.7, 0.7, 14, 6), std('#aab3c6', 0.3, 0.9), 0, 36, 0);
  part(g, ball(2.4), glow(6, 1, 1), 0, 44, 0);
  part(g, cyl(14, 10, 4, 20), glow(1.5, 4, 2.4), 0, -12, 0);
  const lights = Array.from({ length: 10 }, (_, i) => part(g, ball(3.4), new THREE.MeshBasicMaterial(), Math.cos((i / 10) * 6.283) * 52, 0, Math.sin((i / 10) * 6.283) * 52));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(12, 40, 1, 28, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2, 1.1), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const spot = new THREE.Mesh(new THREE.RingGeometry(30, 40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  spot.rotation.x = -Math.PI / 2;
  for (const m of [beam, spot]) m.userData.noAO = true;
  return { g, beam, spot, lights };
}

// ---------------------------------------------------------------- the lot

export class Props {
  private readonly root = new THREE.Group();
  private pads: { g: THREE.Group; top: THREE.MeshStandardMaterial; ring: THREE.Mesh; halo: THREE.Mesh }[] = [];
  private items = new Map<number, { kind: ItemKind; g: THREE.Group }>();
  private rides = new Map<Ride, RideModel>();
  private lane: THREE.Mesh;
  private car = buildCar();
  private dogs = [0, 1, 2, 3].map(buildDog);
  private wrecker = new THREE.Group();
  private chain: THREE.Mesh;
  private bumpers: { g: THREE.Group; cap: THREE.MeshStandardMaterial; body: THREE.MeshStandardMaterial; top: THREE.Mesh; star: THREE.MeshBasicMaterial }[] = [];
  private shells: THREE.Group[] = [];
  private ufo = buildUfo();
  private ufoX = NaN;
  private ufoTilt = 0;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    // Traffic lane: a warning stripe with arrows running the way the danger will come.
    const tex = canvasTex(128, 64, (c) => {
      c.fillStyle = 'rgba(255,60,50,0.55)'; c.fillRect(0, 0, 128, 64);
      c.fillStyle = 'rgba(255,225,74,0.95)';
      c.beginPath(); c.moveTo(84, 32); c.lineTo(48, 4); c.lineTo(62, 32); c.lineTo(48, 60); c.fill();
    });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 26;
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(COURT.len + 500, 40), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.lane.rotation.x = -Math.PI / 2; this.lane.userData.noAO = true;
    part(this.wrecker, ball(27), std('#3a3f4c', 0.3, 0.9));
    part(this.wrecker, cyl(6, 6, 9, 12), std('#4a4f5c', 0.4, 0.9), 0, 28, 0);
    for (let i = 0; i < 10; i++) part(this.wrecker, new THREE.ConeGeometry(4, 9, 8), std('#5d6472', 0.3, 0.9), Math.cos(i * 0.63) * 29, 0, Math.sin(i * 0.63) * 29, [Math.sin(i * 0.63) * 1.57, 0, -Math.cos(i * 0.63) * 1.57]);
    this.chain = new THREE.Mesh(cyl(1.8, 1.8, 1, 8), std('#2b2b33', 0.4, 0.9));
    this.chain.castShadow = true;
    this.root.add(this.lane, this.car, this.wrecker, this.chain, this.ufo.g, this.ufo.beam, this.ufo.spot);
    for (const d of this.dogs) this.root.add(d.g);
  }

  /** A new match: clear out what belonged to the last one and lay out this court's fixtures. */
  reset(game: Game) {
    for (const p of this.pads) p.g.removeFromParent();
    for (const it of this.items.values()) it.g.removeFromParent();
    for (const r of this.rides.values()) r.g.removeFromParent();
    for (const b of this.bumpers) b.g.removeFromParent();
    this.items.clear(); this.rides.clear();
    const arrows = canvasTex(128, 128, (c) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#1a1a22';
      for (const x of [30, 64, 98]) { c.beginPath(); c.moveTo(x, 34); c.lineTo(x + 15, 64); c.lineTo(x + 5, 64); c.lineTo(x + 5, 92); c.lineTo(x - 5, 92); c.lineTo(x - 5, 64); c.lineTo(x - 15, 64); c.fill(); }
    });
    this.pads = game.stage.launchers.map((pad) => {
      const g = new THREE.Group();
      g.position.set(pad.x, 0, pad.z);
      part(g, cyl(27, 26, 3, 32), std('#1a1a22', 0.6), 0, 1.5, 0);
      const top = new THREE.MeshStandardMaterial({ map: arrows, roughness: 0.4, emissiveMap: arrows, emissive: new THREE.Color(0, 0, 0) });
      part(g, cyl(23, 23, 1.6, 32), [std('#1a1a22'), top, std('#1a1a22')] as unknown as THREE.Material, 0, 3.4, 0, [0, pad.kick ? (pad.x < COURT.midX ? -Math.PI / 2 : Math.PI / 2) : Math.PI / 2, 0]);
      const ring = new THREE.Mesh(new THREE.RingGeometry(15, 20, 40), glow(3, 2.4, 0.6));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 4.4; ring.userData.noAO = true;
      const halo = new THREE.Mesh(new THREE.RingGeometry(26, 29, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.8; halo.userData.noAO = true;
      g.add(ring, halo);
      this.root.add(g);
      return { g, top, ring, halo };
    });
    this.bumpers = game.toys.bumpers.map((bm) => {
      const g = new THREE.Group();
      g.position.set(bm.x, 0, bm.z);
      const body = new THREE.MeshStandardMaterial({ color: '#ff4fa3', roughness: 0.4 }), cap = new THREE.MeshStandardMaterial({ color: '#ffe14a', roughness: 0.35 });
      const star = new THREE.MeshBasicMaterial();
      part(g, cyl(27, 25, 6, 28), std('#2b2b45', 0.5), 0, 3, 0);
      part(g, cyl(20, 21, 12, 28), body, 0, 12, 0);
      const top = part(g, cyl(24, 25, 6, 28), cap, 0, 21, 0);
      part(g, new THREE.CylinderGeometry(9, 9, 1.4, 5), star, 0, 24.6, 0);
      this.root.add(g);
      return { g, cap, body, top, star };
    });
    this.ufoX = NaN;
  }

  update(game: Game, dt: number, puppets: Puppet[], anim: (r: Ride) => RideAnim) {
    const time = game.time, toys = game.toys;

    // Launch pads: lit and pulsing when ready, a ring filling up while they recharge.
    this.pads.forEach((p, i) => {
      const charge = 1 - game.padTimers[i] / PAD_RECHARGE, ready = charge >= 1, pulse = 0.5 + 0.5 * Math.sin(time * 7);
      p.top.color.set(ready ? '#ffd23f' : '#5e6370');
      p.top.emissive.setRGB(ready ? 0.9 + pulse * 0.9 : 0, ready ? 0.7 + pulse * 0.7 : 0, ready ? 0.15 : 0);
      p.ring.visible = !ready;
      p.ring.geometry.setDrawRange(0, Math.floor(40 * Math.max(0, charge)) * 6);
      p.halo.visible = ready;
      p.halo.scale.setScalar(1 + pulse * 0.14);
      (p.halo.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * pulse;
    });

    // Items: lying about, flying, or in a hand (a bat and a hammer follow the swing).
    const seen = new Set<number>();
    for (const it of game.items) {
      seen.add(it.id);
      let m = this.items.get(it.id);
      if (!m) { m = { kind: it.kind, g: buildItem(it.kind) }; m.g.scale.setScalar(1.3); this.root.add(m.g); this.items.set(it.id, m); }
      this.placeItem(game, it, m.g, puppets);
      if (it.kind === 'bomb') {
        const lit = it.fuse >= 0, hot = lit && Math.sin(time * (it.fuse < 1.2 ? 40 : 14)) > 0;
        ((m.g.getObjectByName('body') as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.setRGB(hot ? 2.6 : 0, hot ? 0.25 : 0, 0);
        const sp = m.g.getObjectByName('spark')!;
        sp.visible = lit; sp.scale.setScalar(0.8 + 0.7 * Math.abs(Math.sin(time * 31)));
      }
    }
    for (const [id, m] of this.items) if (!seen.has(id)) { m.g.removeFromParent(); this.items.delete(id); }

    // Vehicles.
    for (const r of toys.rides) {
      let m = this.rides.get(r);
      if (!m) { m = buildRide(r.kind); m.yaw = r.facing > 0 ? 0 : Math.PI; this.root.add(m.g); this.rides.set(r, m); }
      m.g.visible = r.respawn <= 0;
      if (!m.g.visible) continue;
      const a = anim(r), want = r.facing > 0 ? 0 : Math.PI;
      let d = want - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      m.yaw += d * (1 - Math.exp(-12 * dt));
      m.g.position.set(r.x, r.y, r.z);
      m.g.rotation.y = m.yaw;
      m.body.rotation.z = -a.pitch;
      if (r.kind === 'heli') { m.body.rotation.x = THREE.MathUtils.clamp(r.vz / 230, -1, 1) * 0.18; m.rotor!.rotation.y = a.rotor; m.tail!.rotation.z = a.rotor * 1.7; }
      for (const w of m.wheels) w.rotation.y = -a.roll / (r.kind === 'board' ? 4.4 : 7);
      if (m.barrel) m.barrel.position.x = 16 - a.kick * 10;
      const rider = r.rider !== null ? game.players[r.rider] : null;
      m.stripe.color.set(rider ? game.teams[rider.team].jersey : '#d8dde6');
    }

    // Traffic: the lane warns first, then a car or a pack of dogs comes through.
    const tr = toys.traffic;
    this.lane.visible = !!tr;
    this.car.visible = !!tr && tr.kind === 'car' && tr.warn <= 0;
    for (const d of this.dogs) d.g.visible = !!tr && tr.kind === 'dogs' && tr.warn <= 0;
    if (tr) {
      const mat = this.lane.material as THREE.MeshBasicMaterial;
      this.lane.position.set(COURT.midX, 0.7, tr.lane);
      this.lane.scale.x = tr.dir;
      mat.opacity = tr.warn > 0 ? 0.45 + 0.45 * Math.abs(Math.sin(time * 12)) : 0.4;
      mat.map!.offset.x = -time * 3.6;
      if (this.car.visible) {
        this.car.position.set(tr.x, Math.abs(Math.sin(time * 30)) * 1.2, tr.lane);
        this.car.rotation.y = tr.dir > 0 ? 0 : Math.PI;
        this.car.traverse((o) => { if (o.name === 'wheel') o.rotation.y = -time * 30; });
      }
      this.dogs.forEach((dog, i) => {
        if (!dog.g.visible) return;
        // The gallop: stretched out in the air, then gathered with the feet under the body.
        const ph = time * 15 + i * 1.7, ext = Math.sin(ph), lift = Math.max(0, ext) * 9;
        dog.g.position.set(tr.x - tr.dir * i * 60, lift, tr.lane + (i % 2 ? 7 : -7));
        dog.g.rotation.y = tr.dir > 0 ? 0 : Math.PI;
        dog.g.scale.setScalar(1 + (i % 3) * 0.12);
        dog.body.rotation.z = ext * 0.14;
        dog.head.position.y = 33 + ext * 1.5;
        dog.tail.rotation.z = 1.1 + ext * 0.4;
        dog.legs.forEach((leg, k) => {
          const front = k < 2, sw = (front ? 1 : -1) * ext * 0.9 + (k % 2 ? 0.25 : -0.25) * Math.cos(ph);
          const hip = this.a.set(front ? 14 : -14, 22, k % 2 ? 5 : -5);
          span(leg, hip, this.b.set(hip.x + Math.sin(sw) * 20, hip.y - Math.cos(sw) * 20 + (lift > 0 ? 3 : 0), hip.z));
        });
      });
    }

    // The wrecking ball swings from a point high over the middle of the court.
    const wk = toys.wrecker;
    this.wrecker.visible = this.chain.visible = !!wk;
    if (wk) {
      this.wrecker.position.set(wk.x, wk.y, wk.z);
      this.wrecker.rotation.z = (COURT.midX - wk.x) / 400;
      span(this.chain, this.a.set(COURT.midX, 520, wk.z), this.b.set(wk.x, wk.y + 26, wk.z));
    }

    toys.bumpers.forEach((bm, i) => {
      const b = this.bumpers[i];
      if (!b) return;
      const hit = bm.hit / 0.25, on = hit > 0;
      b.top.scale.set(1 + hit * 0.22, 1, 1 + hit * 0.22);
      b.cap.emissive.setRGB(on ? 1.6 : 0.25, on ? 1.4 : 0.2, on ? 0.7 : 0);
      b.body.emissive.setRGB(on ? 1.4 : 0.3, on ? 1.4 : 0.02, on ? 1.4 : 0.12);
      const pink = Math.floor(time * 4) % 2 === 1;
      b.star.color.setRGB(pink ? 3 : 0.4, pink ? 0.5 : 2.6, pink ? 1.6 : 3);
    });

    // Tank shells in flight.
    while (this.shells.length < toys.shells.length) {
      const g = new THREE.Group();
      part(g, cyl(4, 4, 14, 10), std('#c4cad8', 0.3, 0.9), 0, 0, 0, [0, 0, -Math.PI / 2]);
      part(g, new THREE.ConeGeometry(4, 8, 10), std('#e2452f', 0.4), 11, 0, 0, [0, 0, -Math.PI / 2]);
      part(g, new THREE.ConeGeometry(4, 20, 10), glow(8, 3.5, 0.6), -17, 0, 0, [0, 0, Math.PI / 2]).name = 'flame';
      this.root.add(g); this.shells.push(g);
    }
    this.shells.forEach((g, i) => {
      const sh = toys.shells[i];
      g.visible = !!sh;
      if (!sh) return;
      g.position.set(sh.x, sh.y, sh.z);
      g.rotation.y = sh.vx >= 0 ? 0 : Math.PI;
      g.getObjectByName('flame')!.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(time * 40));
    });

    // The saucer: it leans into its flight, and its beam brightens when it has someone.
    const ufo = toys.ufo, U = this.ufo;
    U.g.visible = U.beam.visible = U.spot.visible = !!ufo;
    if (ufo) {
      const vx = Number.isNaN(this.ufoX) || dt <= 0 ? 0 : (ufo.x - this.ufoX) / dt;
      this.ufoX = ufo.x;
      this.ufoTilt += (THREE.MathUtils.clamp(-vx / 500, -0.3, 0.3) - this.ufoTilt) * Math.min(1, 5 * dt);
      const H = 215 + Math.sin(time * 2.4) * 4;
      U.g.position.set(ufo.x, H, ufo.z);
      U.g.rotation.set(0, time * 0.6, 0); U.g.rotateZ(this.ufoTilt);
      const beam = ufo.phase === 'lift' ? 1 : ufo.phase === 'carry' ? 0.5 : ufo.cd <= 0 ? 0.2 : 0;
      U.beam.visible = U.spot.visible = beam > 0;
      U.beam.position.set(ufo.x, (H - 12) / 2, ufo.z);
      U.beam.scale.set(1, H - 12, 1);
      (U.beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.3 * beam + 0.05 * Math.sin(time * 20) * beam;
      U.spot.position.set(ufo.x, 1, ufo.z); U.spot.rotation.z = time * 3;
      (U.spot.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.6 * beam;
      U.lights.forEach((l, i) => {
        const on = (Math.floor(time * 8) + i) % 3 === 0;
        (l.material as THREE.MeshBasicMaterial).color.setRGB(on ? 5 : 0.5, on ? 4 : 0.3, on ? 1 : 0.6);
      });
    } else this.ufoX = NaN;
  }

  private placeItem(game: Game, it: Item, g: THREE.Group, puppets: Puppet[]) {
    const tool = it.kind === 'bat' || it.kind === 'hammer';
    if (it.state !== 'held' || it.holder === null) {
      // Loose items keep whatever angle their tumbling and rolling left them at; a tool lies on its side.
      g.position.set(it.x, it.y + (tool ? 5 : 0), it.z);
      g.rotation.set(0, it.id * 1.3, 0);
      if (tool) g.rotateZ(Math.PI / 2 - 0.2 - it.spin);
      else if (it.armed) g.rotateX(Math.PI / 2);
      else { g.position.y += 12; g.rotateZ(-it.spin); g.translateY(-12); }
      return;
    }
    const h = game.players[it.holder], pu = puppets[h.id], f = h.facing;
    g.position.copy(pu.handWorld);
    g.rotation.set(0, f > 0 ? 0 : Math.PI, 0);
    if (tool) {
      let a = 0.45;
      if (it.kind === 'bat' && h.state === 'punch' && h.weapon === 'bat') a = h.t < 0.1 ? -1.3 : h.t < 0.22 ? -1.3 + ((h.t - 0.1) / 0.12) * 3.1 : 1.8 - Math.min(0.5, (h.t - 0.22) * 2);
      else if (it.kind === 'hammer' && h.state === 'pound') a = h.t < 0.2 ? -0.5 : h.t < 0.26 ? -0.5 + ((h.t - 0.2) / 0.06) * 2.7 : 2.2;
      g.rotateZ(-a);
    } else {
      g.position.y -= 14;
      g.translateX(5);
      if (it.kind === 'ext') g.rotateZ(-0.25);
    }
  }
}
