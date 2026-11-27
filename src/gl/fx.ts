// Sparks, dust, fire, confetti, shock rings, impact stars and the ball's trail, in the world.
// The 2D renderer still decides what bursts where; this draws its list of particles as solid things.
import * as THREE from 'three';
import type { Particle, StageFx } from '../client/render';

const cache = new Map<string, { c: THREE.Color; a: number }>();
/** A CSS colour ("#rrggbb" or "rgb(a)(…)") as a linear colour and an opacity. */
export function css(str: string): { c: THREE.Color; a: number } {
  let v = cache.get(str);
  if (!v) {
    let r = 255, g = 255, b = 255, a = 1;
    if (str[0] === '#') { const n = parseInt(str.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    else { const m = (str.match(/[\d.]+/g) ?? []).map(Number); r = m[0] ?? 255; g = m[1] ?? 255; b = m[2] ?? 255; a = m[3] ?? 1; }
    v = { c: new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace), a };
    cache.set(str, v);
  }
  return v;
}

const MAX = 700;
/** How much brighter than paint each kind of particle is (above 1 it glows through the bloom). */
const GAIN: Record<Particle['kind'], number> = { spark: 4, fire: 5, confetti: 1.8, chunk: 0.9, dust: 1, ring: 2.4, impact: 3 };

export class Fx {
  private readonly bits: THREE.InstancedMesh;
  private readonly puffs: THREE.InstancedMesh;
  private readonly trail: THREE.InstancedMesh;
  private readonly rings: THREE.Mesh[] = [];
  private readonly stars: THREE.Sprite[] = [];
  private readonly glow: THREE.PointLight;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.userData.noAO = true; im.count = 0;
      im.setColorAt(0, this.col.set(0xffffff));
      scene.add(im);
      return im;
    };
    this.bits = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
    this.puffs = inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false }), 260);
    this.trail = inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 8);
    for (let i = 0; i < 12; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2; r.visible = false; r.userData.noAO = true;
      scene.add(r); this.rings.push(r);
    }
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    c.translate(64, 64); c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 26 : 60; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
    const star = new THREE.CanvasTexture(cv);
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      sp.visible = false; sp.userData.noAO = true;
      scene.add(sp); this.stars.push(sp);
    }
    // The light a comet shot throws on whatever it passes.
    this.glow = new THREE.PointLight(new THREE.Color(1, 0.55, 0.15), 0, 420, 1.6);
    scene.add(this.glow);
  }

  update(fx: StageFx, comet: { x: number; y: number; z: number } | null, dt: number) {
    let nb = 0, np = 0, nr = 0, ns = 0;
    const { m, q, e, p, s, d, col } = this;
    for (const pt of fx.particles) {
      const k = Math.max(0, 1 - pt.life / pt.max);
      const { c, a } = css(pt.color);
      col.copy(c).multiplyScalar(GAIN[pt.kind]);
      p.set(pt.x, Math.max(0.6, pt.y), pt.z);
      switch (pt.kind) {
        case 'ring': {
          const r = this.rings[nr++];
          if (!r) break;
          r.visible = true; r.position.copy(p);
          r.scale.setScalar(12 + (1 - k) * 130);
          const mat = r.material as THREE.MeshBasicMaterial;
          mat.color.copy(col); mat.opacity = Math.min(1, k * 1.4) * a;
          break;
        }
        case 'impact': {
          const sp = this.stars[ns++];
          if (!sp) break;
          sp.visible = true; sp.position.copy(p);
          sp.scale.setScalar(pt.size * (0.55 + 0.6 * (1 - k)) * 2.6);
          sp.material.color.copy(col); sp.material.opacity = Math.min(1, k * 1.6); sp.material.rotation = pt.vx;
          break;
        }
        case 'dust':
          if (np >= 260) break;
          m.compose(p, q.identity(), s.setScalar(pt.size * (1.5 - k) * 1.5));
          this.puffs.setMatrixAt(np, m); this.puffs.setColorAt(np, col.multiplyScalar(0.4 + 0.6 * k * a)); np++;
          break;
        default: {
          if (nb >= MAX) break;
          if (pt.kind === 'spark') {
            // A streak along the way it is flying.
            const sp = Math.hypot(pt.vx, pt.vy, pt.vz) || 1;
            q.setFromUnitVectors(Fx.UP, d.set(pt.vx / sp, pt.vy / sp, pt.vz / sp));
            s.set(1.3, Math.max(3, sp * 0.035), 1.3);
            col.multiplyScalar(Math.min(1, k * 1.6));
          } else if (pt.kind === 'fire') {
            q.setFromEuler(e.set(pt.life * 7, pt.life * 5, 0));
            s.setScalar(pt.size * (k + 0.3) * 1.5);
            col.multiplyScalar(k);
          } else if (pt.kind === 'confetti') {
            q.setFromEuler(e.set(pt.life * 9 + pt.x, pt.life * 7, pt.z));
            s.set(pt.size * 1.3, 0.5, pt.size * 0.9);
          } else {
            q.setFromEuler(e.set(0, pt.size, pt.grav ? pt.life * 9 + pt.size : 0));
            s.set(pt.size * 2.4, 3.4, 5);
          }
          m.compose(p, q, s);
          this.bits.setMatrixAt(nb, m); this.bits.setColorAt(nb, col); nb++;
        }
      }
    }
    for (let i = nr; i < this.rings.length; i++) this.rings[i].visible = false;
    for (let i = ns; i < this.stars.length; i++) this.stars[i].visible = false;
    for (const [im, n] of [[this.bits, nb], [this.puffs, np]] as const) {
      im.count = n; im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    // The ball's trail: a fading string of embers.
    const n = Math.min(8, fx.trail.length);
    for (let i = 0; i < n; i++) {
      const t = fx.trail[i], k = (i + 1) / (n + 1);
      m.compose(p.set(t.x, t.y, t.z), q.identity(), s.setScalar(9 * (0.45 + 0.5 * k)));
      this.trail.setMatrixAt(i, m); this.trail.setColorAt(i, col.setRGB(1.6 * k, 0.75 * k, 0.3 * k));
    }
    this.trail.count = n; this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
    this.glow.intensity += ((comet ? 14000 : 0) - this.glow.intensity) * Math.min(1, 10 * dt);
    if (comet) this.glow.position.set(comet.x, comet.y, comet.z);
  }
}
