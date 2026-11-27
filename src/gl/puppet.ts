// A player as a solid toy figure, posed every frame from the same pose function the 2D game uses.
// Everything here is built in code: tapered limbs, a lathed jersey, a ball head with a face.
import * as THREE from 'three';
import { DUNK_STAND, HOOP } from '../core/constants';
import type { Game, Player } from '../core/game';
import type { TeamDef } from '../core/teams';
import { Mood, PlayerLook, armLen, figureOf, handsFor, poseFor } from '../client/character';

/** World units per figure unit, the standing hip height, thigh/shin length, ankle height and the tumbling pivot (all as in the 2D figure). */
const S = 1.34, LEG = 13.2, ANKLE = 3.5, PIVOT = 44, ARM = 13;
/** Head radius and the height of its middle above the neck. */
const HR = 14, HEAD_Y = 13;

const UP = new THREE.Vector3(0, 1, 0);
const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number) => clamp(v, 0, 1);

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A tapered tube between two points, with a ball at its start so joints stay round. */
class Seg {
  readonly tube: THREE.Mesh;
  readonly joint: THREE.Mesh | null;
  private readonly d = new THREE.Vector3();
  constructor(parent: THREE.Object3D, r0: number, r1: number, mat: THREE.Material, joint = true) {
    this.tube = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 16, 1, true), mat);
    this.tube.castShadow = this.tube.receiveShadow = true;
    parent.add(this.tube);
    this.joint = joint ? ball(parent, r0, mat) : null;
  }
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const d = this.d.subVectors(b, a);
    const len = Math.max(0.01, d.length());
    this.tube.position.addVectors(a, b).multiplyScalar(0.5);
    this.tube.scale.set(1, len, 1);
    this.tube.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    this.joint?.position.copy(a);
  }
}

function ball(parent: THREE.Object3D, r: number, mat: THREE.Material, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const m = new THREE.Mesh(SPHERE, mat);
  m.scale.set(r * sx, r * sy, r * sz);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A body of revolution about the vertical axis; `v` runs with height so a texture wraps it evenly. */
function lathe(pts: [number, number][], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.01, r), y)), 32);
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  let lo = Infinity, hi = -Infinity;
  for (const [, y] of pts) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - lo) / (hi - lo));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Brow tilt (positive = angry), eye openness, mouth shape and mouth opening for each mood. */
const FACES: Record<Mood, { brow: number; eye: number; mouth: 'line' | 'open' | 'smile' | 'frown' | 'teeth'; open: number }> = {
  normal: { brow: 0, eye: 1, mouth: 'line', open: 0 },
  angry: { brow: 0.5, eye: 0.8, mouth: 'teeth', open: 0.5 },
  pain: { brow: -0.45, eye: 0.25, mouth: 'open', open: 0.7 },
  dizzy: { brow: -0.3, eye: 0.5, mouth: 'open', open: 0.5 },
  happy: { brow: -0.1, eye: 0.9, mouth: 'smile', open: 0.6 },
  sad: { brow: -0.5, eye: 0.75, mouth: 'frown', open: 0 },
  focus: { brow: 0.25, eye: 0.8, mouth: 'line', open: 0 },
  effort: { brow: 0.35, eye: 0.7, mouth: 'teeth', open: 0.4 },
  shout: { brow: 0.4, eye: 1, mouth: 'open', open: 1.2 },
  grit: { brow: 0.55, eye: 0.7, mouth: 'teeth', open: 0.6 },
  shock: { brow: -0.5, eye: 1.25, mouth: 'open', open: 0.9 },
  smug: { brow: 0.2, eye: 0.6, mouth: 'smile', open: 0.3 },
  tired: { brow: -0.35, eye: 0.5, mouth: 'open', open: 0.5 },
  aim: { brow: 0.3, eye: 0.7, mouth: 'line', open: 0 },
};

/** The same reading of a player's mood the 2D renderer makes. */
function moodOf(game: Game, p: Player): { mood: Mood; celebrate: boolean } {
  switch (p.state) {
    case 'down': return { mood: 'dizzy', celebrate: false };
    case 'stun': return { mood: 'pain', celebrate: false };
    case 'punch': case 'tackle': case 'airkick': case 'toss': case 'pound': return { mood: 'grit', celebrate: false };
    case 'grab': return { mood: 'angry', celebrate: false };
    case 'held': return { mood: p.flinch > 0 ? 'pain' : 'shock', celebrate: false };
    case 'dunk': return { mood: 'shout', celebrate: false };
    case 'hang': return { mood: 'smug', celebrate: false };
    case 'shoot': return { mood: p.released ? 'focus' : 'aim', celebrate: false };
    case 'spin': return { mood: 'focus', celebrate: false };
    default: break;
  }
  if (game.phase === 'end' && game.winner !== null) return p.team === game.winner ? { mood: 'happy', celebrate: true } : { mood: 'sad', celebrate: false };
  if (game.lastScorer !== null && game.time - game.lastScoreTime < 1.2 && game.players[game.lastScorer].team === p.team) return { mood: 'happy', celebrate: false };
  if (p.stamina < 0.2) return { mood: 'tired', celebrate: false };
  if (Math.hypot(p.vx, p.vz) > 215) return { mood: 'effort', celebrate: false };
  return { mood: 'normal', celebrate: false };
}

interface Limb { upper: Seg; lower: Seg; band: Seg; end: THREE.Object3D }

export class Puppet {
  readonly root = new THREE.Group();
  /** Rim light picked up after a hit: every material of this figure glows for a moment. */
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly tumble = new THREE.Group();
  private readonly squash = new THREE.Group();
  private readonly fig = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly arms: [Limb, Limb];
  private readonly legs: [Limb, Limb];
  private readonly hands: [THREE.Mesh, THREE.Mesh];
  private readonly eyes: THREE.Mesh[] = [];
  private readonly pupils: THREE.Mesh[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private readonly mouths: Record<'line' | 'open' | 'smile' | 'frown', THREE.Mesh>;
  private readonly teeth: THREE.Mesh;
  private readonly stars = new THREE.Group();
  private readonly tails: THREE.Mesh[] = [];
  private readonly tilt = new THREE.Group();
  /** Which side the ball hand is on: +1 puts it toward the camera when the figure faces right. */
  private readonly side: number;
  private readonly sw: number;
  private readonly legLen: number;
  private readonly limbW: number;
  private readonly hunch: number;
  private yaw: number;
  private readonly v = Array.from({ length: 12 }, () => new THREE.Vector3());
  /** Where the ball hand is in the world, refreshed by `update`. */
  readonly handWorld = new THREE.Vector3();
  /** The elbow of that arm, so something held can point along the forearm. */
  readonly elbowWorld = new THREE.Vector3();

  constructor(readonly p: Player, team: TeamDef) {
    const d = p.def, fig = figureOf(d);
    this.side = p.team === 0 ? 1 : -1;
    this.yaw = p.facing > 0 ? 0 : Math.PI;
    this.legLen = LEG * fig.leg;
    this.limbW = fig.limb;
    this.hunch = fig.hunch;
    const sw = (this.sw = 11 * fig.chest), ww = 11 * fig.waist;
    const mat = (color: string, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
      this.mats.push(m);
      return m;
    };
    const skin = mat(d.skin, 0.58), shorts = mat(team.shorts, 0.82), trim = mat(team.trim, 0.6), white = mat('#f4f1ea', 0.5);
    const sole = mat('#26222c', 0.7), hair = mat(d.hair, 0.75), dark = mat('#1b1320', 0.5), eyeWhite = mat('#ffffff', 0.25);
    const jersey = mat('#ffffff', 0.8, {
      map: canvasTex(512, 256, (c) => {
        c.fillStyle = team.jersey; c.fillRect(0, 0, 512, 256);
        // Side panels, hem and collar in the trim colour; the number front and back.
        c.fillStyle = team.trim;
        for (const x of [0, 256, 512]) c.fillRect(x - 9, 0, 18, 256);
        c.fillRect(0, 236, 512, 20); c.fillRect(0, 0, 512, 10);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const x of [128, 384]) {
          c.font = '900 22px "Trebuchet MS", sans-serif';
          c.fillStyle = team.trim;
          if (x === 128) c.fillText(team.short, x, 52);
          c.font = '900 88px "Trebuchet MS", sans-serif';
          c.lineWidth = 9; c.strokeStyle = 'rgba(0,0,0,0.35)';
          c.strokeText(String(d.num), x, 124); c.fillStyle = '#ffffff'; c.fillText(String(d.num), x, 124);
        }
      }),
    });

    this.root.add(this.tilt); this.tilt.add(this.tumble); this.tumble.add(this.squash); this.squash.add(this.fig);
    this.fig.add(this.torso, this.head);

    // Torso: jersey over shorts, both flattened front to back; heavier players carry more in front.
    const depth = 0.62 + fig.belly * 0.035;
    const top = lathe([[ww * 0.97, 4.4], [ww, 8], [(sw + ww) / 2 + 0.4, 14], [sw, 21.5], [sw * 0.99, 25.5], [sw * 0.84, 28.2], [sw * 0.5, 29.6], [3, 30.2]], jersey);
    top.scale.set(depth, 1, 1);
    const bottom = lathe([[0.01, -3.4], [ww * 0.8, -5.2], [ww + 1, -5.4], [ww + 0.7, 0], [ww * 0.99, 7.6]], shorts);
    bottom.scale.set(depth + 0.05, 1, 1);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 4, 16), skin);
    neck.position.y = 30; neck.castShadow = true;
    this.torso.add(top, bottom, neck);

    // Head: a ball with a face on the front, hair on top and a headband with loose ends.
    const skull = ball(this.head, HR, skin);
    skull.position.y = HEAD_Y;
    const at = (yaw: number, pitch: number, r = HR) => new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw) * r, HEAD_Y + Math.sin(pitch) * r, Math.cos(pitch) * Math.sin(yaw) * r);
    for (const s of [1, -1]) {
      const eye = ball(this.head, 1, eyeWhite, 1.4, 3.7, 3);
      eye.position.copy(at(s * 0.37, -0.02, HR - 0.5)); eye.rotation.y = -s * 0.37; eye.castShadow = false;
      const pupil = ball(this.head, 1.55, dark);
      pupil.castShadow = false;
      const brow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 5.2), hair);
      brow.position.copy(at(s * 0.38, 0.3, HR + 0.2)); brow.rotation.y = -s * 0.38;
      const ear = ball(this.head, 3, skin, 0.6, 1, 1);
      ear.position.copy(at(s * Math.PI / 2, -0.06, HR - 0.4));
      this.head.add(brow);
      this.eyes.push(eye); this.pupils.push(pupil); this.brows.push(brow);
    }
    ball(this.head, 1.9, skin).position.copy(at(0, -0.1, HR - 0.2));
    const mouthAt = at(0, -0.46, HR - 0.1);
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.position.copy(mouthAt); o.rotation.z = -0.46; this.head.add(o); return o; };
    const arc = new THREE.TorusGeometry(3.4, 0.62, 8, 16, Math.PI * 0.8);
    this.mouths = {
      line: mk(new THREE.BoxGeometry(1, 0.9, 5.2), dark),
      open: mk(SPHERE, dark),
      smile: mk(arc, dark),
      frown: mk(arc, dark),
    };
    // The arc lies in the x-y plane; stand it across the face, ends up for a smile and down for a frown.
    this.mouths.smile.rotation.set(Math.PI + Math.PI * 0.1, Math.PI / 2, 0);
    this.mouths.smile.position.y += 2.4;
    this.mouths.frown.rotation.set(Math.PI * 0.1, Math.PI / 2, 0);
    this.mouths.frown.position.y -= 2.6;
    this.teeth = mk(new THREE.BoxGeometry(1.2, 1, 4.4), eyeWhite);
    this.teeth.position.x += 0.5;

    const cap = () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.43), hair);
      m.position.y = HEAD_Y; m.rotation.z = 0.3; m.castShadow = true;
      this.head.add(m);
      return m;
    };
    switch (d.hairStyle) {
      case 'spiky': {
        cap();
        const cone = new THREE.ConeGeometry(3.4, 10, 10);
        for (let i = 0; i < 9; i++) {
          const a = i < 5 ? (i - 2) * 0.42 + 0.35 : (i - 6.5) * 0.5 + 0.35, z = i < 5 ? 0 : i % 2 ? 5.5 : -5.5;
          const dir = new THREE.Vector3(-Math.sin(a), Math.cos(a), z / HR).normalize();
          const m = new THREE.Mesh(cone, hair);
          m.position.set(0, HEAD_Y, 0).addScaledVector(dir, HR + 3.4);
          m.quaternion.setFromUnitVectors(UP, dir); m.castShadow = true;
          this.head.add(m);
        }
        break;
      }
      case 'flat': {
        cap();
        const m = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 12.4, 5.5, 24), hair);
        m.position.set(-1, HEAD_Y + 12.2, 0); m.castShadow = true;
        this.head.add(m);
        break;
      }
      case 'afro': {
        // A cloud of curls: a core with lumps all over it, left open where the face is.
        ball(this.head, 15.6, hair).position.set(-4.6, HEAD_Y + 4.4, 0);
        for (let i = 0; i < 44; i++) {
          const y = 1 - (i + 0.5) / 22, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
          const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
          if (y < -0.85 || (dir.x > 0.35 && y < 0.45)) continue;
          ball(this.head, 5.4 + (i % 3) * 0.7, hair).position.set(-4.6, HEAD_Y + 4.4, 0).addScaledVector(dir, 13.2);
        }
        break;
      }
      case 'bun': cap(); ball(this.head, 6.2, hair).position.set(-10.5, HEAD_Y + 11, 0); break;
      case 'mohawk': {
        const m = new THREE.Mesh(new THREE.TorusGeometry(HR + 1.2, 3, 10, 24, 2.3), hair);
        m.position.y = HEAD_Y; m.rotation.z = 0.75; m.scale.z = 0.75; m.castShadow = true;
        this.head.add(m);
        break;
      }
      default: break;
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(HR * HR - 49) + 0.5, 1.75, 10, 32), trim);
    band.rotation.x = Math.PI / 2; band.position.y = HEAD_Y + 8.6; band.scale.set(0.95, 0.95, 1.2);
    this.head.add(band);
    for (const s of [1, -1]) {
      const g = new THREE.BoxGeometry(0.9, 8, 2.8);
      g.translate(0, -4, 0);
      const t = new THREE.Mesh(g, trim);
      t.position.set(-11.6, HEAD_Y + 8.6, s * 1.5); t.castShadow = true;
      this.head.add(t); this.tails.push(t);
    }
    // Stars round the head of someone who has been floored.
    const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 0.8) });
    for (let k = 0; k < 3; k++) this.stars.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.9), starMat));
    this.stars.position.y = HEAD_Y + 20;
    this.head.add(this.stars);

    // Arms and legs: [ball-hand side, other side].
    const w = fig.limb;
    const arm = (): Limb => {
      const upper = new Seg(this.fig, 4.1 * w, 3.3 * w, skin), lower = new Seg(this.fig, 3.3 * w, 2.7 * w, skin);
      const bandSeg = new Seg(this.fig, 3.25 * w, 3.05 * w, trim, false);
      const hand = ball(this.fig, 1, skin);
      return { upper, lower, band: bandSeg, end: hand };
    };
    this.arms = [arm(), arm()];
    this.hands = [this.arms[0].end as THREE.Mesh, this.arms[1].end as THREE.Mesh];
    const leg = (): Limb => {
      const upper = new Seg(this.fig, 5.5 * w, 4.5 * w, shorts), lower = new Seg(this.fig, 4.3 * w, 2.9 * w, skin);
      const sock = new Seg(this.fig, 3.35 * w, 3.2 * w, white, false);
      const shoe = new THREE.Group();
      const body = ball(shoe, 1, white, 8.2, 4.1, 4.4); body.position.set(2.6, -0.2, 0);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.7, 3.2, 14), trim); collar.position.set(-0.6, 1.5, 0); collar.castShadow = true;
      const base = new THREE.Mesh(new THREE.BoxGeometry(14.2, 1.5, 7), sole); base.position.set(2.7, -2.85, 0); base.castShadow = true;
      const toe = ball(shoe, 1, trim, 3.4, 2.6, 4.2); toe.position.set(8, -0.7, 0);
      shoe.add(collar, base);
      this.fig.add(shoe);
      return { upper, lower, band: sock, end: shoe };
    };
    this.legs = [leg(), leg()];

  }

  addTo(scene: THREE.Object3D) {
    scene.add(this.root);
  }

  /** Frees what this figure put on the graphics card. */
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry !== SPHERE) m.geometry.dispose(); });
    for (const m of this.mats) { m.map?.dispose(); m.dispose(); }
  }

  /** The way the body should face (an angle about the vertical axis; 0 looks along +x). */
  private wantYaw(game: Game): number {
    const p = this.p, base = p.facing > 0 ? 0 : Math.PI;
    let dx = 0, dz = 0;
    if (p.state === 'move' && p.y === 0) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 30) { dx = p.vx / sp; dz = p.vz / sp; }
    } else if (p.state === 'shoot' || p.state === 'dunk') {
      const hx = p.dunk ? p.dunk.tx : game.ball.shot?.hoopX ?? (p.team === 0 ? HOOP.rightX : HOOP.leftX);
      dx = hx - p.x; dz = HOOP.z - p.z;
    } else if (p.state === 'punch' && p.hitId >= 0) {
      const o = game.players[p.hitId];
      dx = o.x - p.x; dz = o.z - p.z;
    }
    if (!dx && !dz) return base;
    // Never more than a quarter turn from the side the game says this player faces.
    const off = clamp(Math.atan2(-dz * p.facing, Math.abs(dx) + 1e-3), -1.25, 1.25);
    return base + off * (p.state === 'move' ? 0.8 : 1);
  }

  /** `ride` is what this player is riding and how far it is pitched (an angle about a point `py` below the feet). */
  update(game: Game, dt: number, time: number, ride: { kind: 'board' | 'tank' | 'heli'; a: number; py: number } | null = null) {
    const p = this.p, v = this.v;
    const holder = game.ball.holder === p.id, b = game.ball;
    const { mood, celebrate } = moodOf(game, p);
    const look: PlayerLook = {
      hasBall: holder, mood, celebrate, dt, ballH: b.y - p.y, gazeX: b.x - p.x, gazeY: b.y - (p.y + 70), carrying: !!game.heldItem(p), ride: ride?.kind ?? null, solid: true,
    };
    const { P, turn, lying, hitT, hair } = poseFor(p, look, time);
    const f = p.facing, s = this.side;

    // Whole body: place, facing, tumble, squash.
    let want = this.wantYaw(game);
    if (p.state === 'spin') want += p.t * 30;
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = p.state === 'spin' ? want : this.yaw + dy * (dt > 0 ? 1 - Math.exp(-16 * dt) : 1);
    this.root.position.set(p.x, p.y + P.hop - (PIVOT - 12) * S * lying, p.z);
    this.root.rotation.y = this.yaw;
    this.tilt.position.y = ride ? -ride.py : 0;
    this.tilt.rotation.z = ride ? -ride.a * f : 0;
    this.tumble.position.y = PIVOT * S + (ride ? ride.py : 0);
    this.tumble.rotation.z = -turn * f;
    this.squash.position.y = -PIVOT * S;
    this.squash.scale.set(S * P.sx, S * P.sy, S * P.sx);
    this.fig.position.y = P.rotY;
    this.fig.rotation.z = -P.rot;

    // Torso and head.
    const l = P.lean + this.hunch, cl = Math.cos(l), sl = Math.sin(l);
    const hipX = P.hipX, hipY = P.hipH * (this.legLen / LEG);
    /** A point of the torso (forward of the spine, above the hips) in figure space. */
    const tor = (out: THREE.Vector3, fwd: number, up: number, z: number) => out.set(hipX + fwd * cl + up * sl, hipY - fwd * sl + up * cl, z);
    this.torso.position.set(hipX, hipY, 0);
    this.torso.rotation.z = -l;
    tor(this.head.position, 1, 27, 0);
    this.head.rotation.z = -(l + P.head);
    this.head.scale.setScalar(figureOf(p.def).head);

    // Hands that belong on something outside the body: the rim in a dunk, the opponent a punch landed on.
    let grip: { at: THREE.Vector3; w: number; back: boolean; max: number } | null = null;
    if ((p.state === 'dunk' || p.state === 'hang') && p.dunk) {
      const hoopX = p.dunk.tx + f * DUNK_STAND;
      if (p.state === 'hang') grip = { at: v[10].set(hoopX - f * (HOOP.rimR - 1), p.dunk.rimY + 1, HOOP.z + 3), w: 1, back: false, max: 9 };
      else {
        const u = clamp01(p.t / p.dunk.T), w = clamp01((u - 0.6) / 0.2), dn = clamp01((u - 0.8) / 0.2);
        if (w > 0) grip = { at: v[10].set(hoopX - f * 6 * (1 - dn), p.dunk.rimY + 5 + 24 * (1 - dn), HOOP.z + 2), w, back: false, max: 9 };
      }
    } else if (p.state === 'punch' && p.hitId >= 0 && p.weapon !== 'bat') {
      const w = clamp01(1 - (p.t - (p.combo >= 2 ? 0.14 : 0.09)) / 0.06);
      if (w > 0) {
        const o = game.players[p.hitId], h = o.hitZone === 0 ? 86 : o.hitZone === 1 ? 52 : 74;
        grip = { at: v[10].set(o.x - f * 15, o.y + h, o.z), w, back: p.combo === 1, max: 1.15 };
      }
    }
    if (grip) { this.root.updateWorldMatrix(true, true); this.fig.worldToLocal(grip.at); }

    // Arms.
    const [handF, handB] = handsFor(p, look);
    const shZ = this.sw + 1.6;
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i], side = i === 0 ? s : -s;
      const ang = i === 0 ? P.armF : P.armB, el = i === 0 ? P.elbowF : P.elbowB;
      const L = armLen(ang);
      const sh = tor(v[0], 0, 21, side * shZ);
      const a1 = ang - l, a2 = ang + el - l;
      // Hands come in toward the middle when the forearm points forward or up.
      const inward = clamp01(Math.max(Math.sin(a2), (ang - 1.6) * 0.8));
      const elbow = v[1].set(sh.x + Math.sin(a1) * L, sh.y - Math.cos(a1) * L, side * (shZ + 1.6 - inward * 1.5));
      const hand = v[2].set(elbow.x + Math.sin(a2) * L, elbow.y - Math.cos(a2) * L, side * (shZ + 1 - inward * (shZ * 0.55)));
      if (grip && grip.back === (i === 1)) {
        const to = v[3].copy(hand).lerp(grip.at, grip.w);
        const dist = Math.max(0.01, sh.distanceTo(to));
        const L2 = clamp(dist / 2, ARM, ARM * grip.max);
        const h = Math.sqrt(Math.max(0, L2 * L2 - dist * dist / 4));
        // The elbow drops below the line from shoulder to hand, and a little behind it.
        const n = v[4].set(to.y - sh.y, -(to.x - sh.x), 0);
        if (n.y * 1 + n.x * 0.3 > 0) n.negate();
        n.normalize();
        v[5].addVectors(sh, to).multiplyScalar(0.5).addScaledVector(n, h);
        elbow.lerp(v[5], grip.w);
        hand.copy(to);
      }
      A.upper.set(sh, elbow); A.lower.set(elbow, hand);
      A.band.set(v[6].copy(elbow).lerp(hand, 0.58), v[7].copy(elbow).lerp(hand, 0.84));
      const kind = i === 0 ? handF : handB, m = this.hands[i];
      m.position.copy(hand).addScaledVector(v[8].subVectors(hand, elbow).normalize(), 2.2);
      m.quaternion.setFromUnitVectors(UP, v[8]);
      if (kind === 'open') m.scale.set(2.3 * this.limbW, 5 * this.limbW, 4.1 * this.limbW);
      else m.scale.set(4 * this.limbW, 4.2 * this.limbW, 4 * this.limbW);
    }

    // Legs: each foot has a place to be, and the knee bends forward to get it there.
    for (let i = 0; i < 2; i++) {
      const G = this.legs[i], side = i === 0 ? s : -s;
      const fx = i === 0 ? P.fFx : P.fBx, fy = i === 0 ? P.fFy : P.fBy;
      const hip = v[0].set(hipX, hipY, side * 5.2);
      const ankle = v[1].set(fx, fy + ANKLE, side * 6.4);
      const d = v[2].subVectors(ankle, hip);
      let dist = d.length();
      const max = this.legLen * 2 - 0.2;
      if (dist > max) { ankle.copy(hip).addScaledVector(d, max / dist); dist = max; }
      const h = Math.sqrt(Math.max(0, this.legLen * this.legLen - dist * dist / 4));
      const n = v[3].set(-d.y, d.x, side * 0.14 * Math.abs(d.y));
      if (n.x < 0) n.negate();
      n.normalize();
      const knee = v[4].addVectors(hip, ankle).multiplyScalar(0.5).addScaledVector(n, h);
      G.upper.set(hip, knee); G.lower.set(knee, ankle);
      G.band.set(v[5].copy(knee).lerp(ankle, 0.6), v[6].copy(knee).lerp(ankle, 0.98));
      G.end.position.copy(ankle);
      G.end.rotation.set(0, side * -0.12, -Math.min(0.7, fy * 0.07));
    }

    // Face.
    const face = FACES[mood];
    const blink = (time * 0.9 + p.id * 0.37) % 3.1 < 0.1;
    const gl = Math.hypot(look.gazeX, look.gazeY) || 1;
    const gy = clamp(look.gazeY / gl, -1, 1), gz = clamp(((b.z - p.z) / 120) * Math.cos(this.yaw), -1, 1);
    this.eyes.forEach((e, i) => {
      const sgn = i === 0 ? 1 : -1;
      e.scale.y = 3.7 * (blink ? 0.12 : face.eye);
      const pu = this.pupils[i];
      pu.visible = !blink && face.eye > 0.3;
      pu.position.copy(e.position);
      pu.position.x += 0.75; pu.position.y += gy * 1.3 * face.eye; pu.position.z += gz * 0.9 - sgn * 0.2;
      this.brows[i].rotation.x = sgn * face.brow;
      this.brows[i].position.y = HEAD_Y + Math.sin(0.3) * (HR + 0.2) + (face.eye > 1 ? 1 : 0) - Math.abs(face.brow) * 0.6;
    });
    const shape = face.mouth === 'teeth' ? 'open' : face.mouth;
    for (const k of ['line', 'open', 'smile', 'frown'] as const) this.mouths[k].visible = k === shape;
    this.mouths.open.scale.set(1.3, 0.8 + face.open * 2.6, face.mouth === 'teeth' ? 4.6 : 3.3);
    this.teeth.visible = face.mouth === 'teeth';
    this.stars.visible = mood === 'dizzy';
    if (this.stars.visible) this.stars.children.forEach((st, k) => {
      const a = time * 6 + k * 2.09;
      st.position.set(Math.cos(a) * 15, Math.sin(a * 0.7) * 2, Math.sin(a) * 15);
      st.rotation.y = a * 2;
    });
    this.tails.forEach((t, k) => { t.rotation.z = -0.35 - hair * 0.9 - k * 0.12 + Math.sin(time * 13 + k * 2 + p.id) * 0.12 * Math.abs(hair); });

    // The flash of a hit, and the blink of someone who cannot be hit yet.
    const glow = hitT > 0 ? 1.6 : 0;
    for (const m of this.mats) m.emissive.setScalar(glow);
    this.root.visible = !(p.invuln > 0 && Math.floor(time * 20) % 2 === 0);

    this.root.updateWorldMatrix(true, true);
    this.hands[0].getWorldPosition(this.handWorld);
    this.arms[0].lower.joint!.getWorldPosition(this.elbowWorld);
  }
}
