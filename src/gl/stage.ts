// The 3D view of a match. The game, its menus, its scoreboard and its sound are the same code as
// the 2D game; this class only takes over drawing the world, through the renderer's `stage` hook.
import * as THREE from 'three';
import { BALL_R, COURT, HIGH_RIM_Y, HOOP } from '../core/constants';
import type { Game, GameEvent } from '../core/game';
import type { CourtId } from '../core/teams';
import type { HumanView, Project, Stage, StageFx } from '../client/render';
import { rideAnim, rideTilt, stepRide } from '../client/vehicles';
import { VIEW_H, VIEW_W } from '../client/view';
import { Fx } from './fx';
import { buildPost, Post } from './post';
import { Props } from './props';
import { Puppet } from './puppet';
import { buildWorld, World } from './world';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class GLStage implements Stage {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, VIEW_W / VIEW_H, 20, 14000);
  private readonly post: Post;
  private readonly fx: Fx;
  private readonly props: Props;
  private world: World | null = null;
  private court: CourtId = 'rooftop';
  private built: CourtId | null = null;
  private game: Game | null = null;
  private puppets: Puppet[] = [];
  private readonly markers: { ring: THREE.Mesh; arrow: THREE.Mesh }[] = [];
  private readonly ballMats: Record<'iron' | 'bomb', THREE.MeshStandardMaterial>;
  private readonly cam = { x: COURT.midX, cine: 0, hoopX: HOOP.rightX };
  private pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  /** Dev only: put the camera somewhere by hand ([x, y, z] of the eye, then of the point looked at). */
  debugCam: { pos: [number, number, number]; aim: [number, number, number] } | null = null;
  private avg = 16;
  private frames = 0;
  private readonly pos = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  constructor(private readonly overlay: HTMLCanvasElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'stage';
    overlay.parentElement!.insertBefore(this.canvas, overlay);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: new URLSearchParams(location.search).has('keep') });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.resize();
    this.post = buildPost(this.renderer, this.scene, this.camera);
    this.fx = new Fx(this.scene);
    this.props = new Props(this.scene);
    this.ballMats = {
      iron: new THREE.MeshStandardMaterial({ color: '#8d93a1', roughness: 0.3, metalness: 0.95 }),
      bomb: new THREE.MeshStandardMaterial({ color: '#1c1c24', roughness: 0.4, metalness: 0.2 }),
    };
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(22, 27, 48), mat);
      ring.rotation.x = -Math.PI / 2;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(6, 11, 4), mat);
      arrow.rotation.x = Math.PI;
      for (const m of [ring, arrow]) { m.userData.noAO = true; m.visible = false; this.scene.add(m); }
      this.markers.push({ ring, arrow });
    }
    addEventListener('resize', () => { this.resize(); const s = this.renderer.getDrawingBufferSize(new THREE.Vector2()); this.post.setSize(s.x, s.y); });
    (window as unknown as { __gl: unknown }).__gl = this;
  }

  /** The picture sits exactly under the 2D overlay, which sizes itself to the window. */
  private resize() {
    const w = parseFloat(this.overlay.style.width) || VIEW_W, h = parseFloat(this.overlay.style.height) || VIEW_H;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  setCourt(court: CourtId) {
    this.court = court;
  }

  reset() {
    this.game = null;
    this.cam.cine = 0;
  }

  onEvent(e: GameEvent) {
    const high = e.y > (HOOP.rimY + HIGH_RIM_Y) / 2;
    switch (e.type) {
      case 'swish': case 'rim': case 'score': case 'dunk': case 'bodydunk':
        this.world?.swish(e.type === 'score' ? (e.team === 1 ? HOOP.leftX : HOOP.rightX) : e.x, high ? HIGH_RIM_Y : HOOP.rimY, e.type === 'dunk' || e.type === 'bodydunk' ? 2 : 1);
        break;
      default: break;
    }
  }

  project: Project = (x, y, z) => {
    const v = this.v2.set(x, y, z).project(this.camera);
    if (v.z > 1) return [-9999, -9999];
    return [(v.x + 1) * 0.5 * VIEW_W, (1 - v.y) * 0.5 * VIEW_H];
  };

  draw(game: Game, dt: number, humans: HumanView[], fx: StageFx) {
    if (this.built !== this.court) {
      this.world?.dispose();
      this.world = buildWorld(this.scene, this.renderer, this.court);
      this.renderer.toneMappingExposure = this.world.exposure;
      this.built = this.court;
    }
    const world = this.world!;
    if (this.game !== game) {
      for (const pu of this.puppets) pu.dispose();
      this.puppets = game.players.map((p) => new Puppet(p, game.teams[p.team]));
      for (const pu of this.puppets) pu.addTo(this.scene);
      this.props.reset(game);
      this.game = game;
      this.cam.x = clamp(game.ball.x, 330, 1170);
    }
    const time = game.time, toys = game.toys, b = game.ball;

    // Players, on foot or on a ride.
    for (const r of toys.rides) if (r.respawn <= 0) stepRide(r, dt);
    for (const pu of this.puppets) {
      const r = pu.p.state === 'ride' ? toys.rideOf(pu.p) : null;
      pu.update(game, dt, time, r ? { kind: r.kind, ...rideTilt(r) } : null);
    }
    this.props.update(game, dt, this.puppets, rideAnim);

    // The ball: in the carrier's hand (bouncing while they dribble), or wherever the game has it.
    const ball = world.ball, h = b.holder !== null ? game.players[b.holder] : null;
    if (h) {
      const hand = this.puppets[h.id].handWorld;
      const dribbling = h.state === 'move' && h.y === 0 && Math.hypot(h.vx, h.vz) > 20;
      if (dribbling) ball.position.set(hand.x, game.ballR + (hand.y - 10 - game.ballR) * clamp((b.y - 6) / 30, 0, 1), hand.z);
      else if (h.state === 'shoot' || h.state === 'dunk' || h.state === 'hang' || h.state === 'jump') ball.position.set(hand.x, hand.y + 9, hand.z);
      else ball.position.set(hand.x + h.facing * 4, hand.y - 5, hand.z);
    } else ball.position.set(b.x, Math.max(game.ballR, b.y), b.z);
    ball.rotation.z = -b.spin;
    ball.scale.setScalar(game.ballR / BALL_R);
    const ev = toys.event?.kind;
    const special = !!b.shot?.special;
    ball.material = ev === 'ironball' ? this.ballMats.iron : ev === 'bombball' ? this.ballMats.bomb : world.ballMat;
    world.ballMat.emissive.setRGB(special ? 2.4 : 0, special ? 0.9 : 0, special ? 0.1 : 0);
    if (ev === 'bombball') {
      const hot = Math.sin(time * (toys.ballFuse < 1.5 ? 38 : 12)) > 0;
      this.ballMats.bomb.emissive.setRGB(hot ? 3 : 0, hot ? 0.3 : 0, 0);
    }

    // Who each person controls: a ring under them and an arrow over them.
    this.markers.forEach((m, i) => {
      const hv = humans[i], p = hv ? game.players[hv.pid] : null;
      m.ring.visible = !!p && p.state !== 'ride';
      m.arrow.visible = !!p && p.state !== 'down';
      if (!p || !hv) return;
      (m.ring.material as THREE.MeshBasicMaterial).color.set(hv.color).multiplyScalar(2.2);
      m.ring.position.set(p.x, 0.9, p.z);
      m.arrow.position.set(p.x, p.y + 132 + Math.sin(time * 6) * 3, p.z);
      m.arrow.rotation.y = time * 2;
    });

    for (const rim of game.rims) world.setBroken(rim.x, rim.high, rim.brokenT > 0);
    this.fx.update(fx, special ? b : null, dt);

    // Camera: a broadcast view that follows the play, drops in under the hoop for a dunk, and pushes in on big moments.
    const cam = this.cam;
    const tx = clamp(b.x * 0.7 + (h ? h.x + h.facing * 60 : b.x) * 0.3, 330, 1170);
    cam.x += (tx - cam.x) * Math.min(1, 3.2 * dt);
    const dunker = game.players.find((p) => (p.state === 'dunk' || p.state === 'hang') && p.dunk);
    if (dunker?.dunk) cam.hoopX = dunker.dunk.tx > COURT.midX ? HOOP.rightX : HOOP.leftX;
    cam.cine += ((dunker ? 1 : 0) - cam.cine) * Math.min(1, (dunker ? 7 : 3) * dt);
    const pos = this.pos.set(cam.x, 238, 860), aim = this.aim.set(cam.x, 104, 180);
    const dir = cam.hoopX < COURT.midX ? 1 : -1;
    pos.lerp(this.v.set(cam.hoopX + dir * 250, 120, 600), cam.cine * 0.8);
    aim.lerp(this.v.set(cam.hoopX - dir * 4, 128, 180), cam.cine * 0.8);
    const push = clamp((fx.zoom - 1) / 0.22, 0, 1) * (1 - cam.cine);
    if (push > 0.001) {
      pos.lerp(this.v.set(fx.focus.x, fx.focus.y + 70, fx.focus.z + 420), push * 0.45);
      aim.lerp(this.v.set(fx.focus.x, fx.focus.y + 20, fx.focus.z), push * 0.6);
    }
    if (fx.shake > 0) { pos.x += (Math.random() - 0.5) * fx.shake * 1.4; pos.y += (Math.random() - 0.5) * fx.shake * 1.4; }
    if (this.debugCam) { pos.set(...this.debugCam.pos); aim.set(...this.debugCam.aim); }
    this.camera.position.copy(pos);
    this.camera.lookAt(aim);
    this.camera.updateMatrixWorld();
    world.frame(this.camera, cam.x, dt, time, toys.gust ? toys.gust.dir : 0);
    this.post.render(dt);

    // If frames run long, draw fewer pixels.
    this.avg += (Math.min(dt, 0.1) * 1000 - this.avg) * 0.03;
    if (++this.frames > 150 && this.avg > 21 && this.pixelRatio > 0.75 && document.visibilityState === 'visible') {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.frames = 0; this.avg = 16;
      this.resize();
      const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.post.setSize(s.x, s.y);
    }
  }

  /** Milliseconds one frame takes on the graphics card (a dev check). */
  cost(): number {
    const gl = this.renderer.getContext(), t0 = performance.now();
    for (let i = 0; i < 10; i++) { this.post.render(0); gl.finish(); }
    return (performance.now() - t0) / 10;
  }
}
