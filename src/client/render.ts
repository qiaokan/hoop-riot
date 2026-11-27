import { BALL_R, COURT, GRAB_HOLD, HIGH_RIM_Y, HOOP, PAD_RECHARGE, TeamId } from '../core/constants';
import type { Game, GameEvent, Item, Player } from '../core/game';
import type { CourtId } from '../core/teams';
import { EVENT_NAME, RIDE } from '../core/toys';
import { Backdrop, FAR_PARALLAX, NEAR_PARALLAX, buildBackdrop } from './background';
import { Mood, drawPlayer, handPos } from './character';
import { Net } from './net';
import { drawBall, drawHoopBack, drawHoopFront, drawPad, drawShadow, roundRect } from './sprites';
import { drawBat, drawBumper, drawHammer, drawItem, drawWrecker } from './toysprites';
import { drawCar, drawDog, drawRideBack, drawRideFront, drawShell, drawUfo, rideTilt, stepRide } from './vehicles';
import { FLOOR_TOP, LAYER_RES, VIEW_H, VIEW_W, ZS, sy } from './view';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  color: string; size: number;
  kind: 'spark' | 'dust' | 'fire' | 'confetti' | 'ring' | 'impact' | 'chunk';
  grav: number;
}

interface Popup { text: string; x: number; y: number; z: number; life: number; color: string; size: number }
interface Banner { text: string; sub?: string; life: number; max: number; color: string }

/** A player a person is controlling, and the tag drawn over their head. */
export interface HumanView { pid: number; label: string; color: string; /** Key names to show in prompts. */ action: string; dodge: string; shoot: string }

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private backdrops = new Map<CourtId, Backdrop>();
  private bg: Backdrop;
  camX = 0;
  private shake = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private banner: Banner | null = null;
  /** The four nets: index = side * 2 + (upper hoop ? 1 : 0). */
  private nets = [new Net(), new Net(), new Net(), new Net()];
  private flash = 0;
  private scale = 1;
  private rnd = Math.random;
  // Dramatic camera: a short zoom toward a point, and slow motion.
  private zoom = 1;
  private zoomT = 0;
  private fx = VIEW_W / 2;
  private fy = VIEW_H / 2;
  private slowT = 0;
  private lastSwishHigh = false;
  /** Recent ball positions while it flies, for the motion trail. */
  private trail: { x: number; y: number; z: number }[] = [];
  private dustT = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.bg = this.backdrop('rooftop');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private backdrop(court: CourtId): Backdrop {
    let b = this.backdrops.get(court);
    if (!b) { b = buildBackdrop(court); this.backdrops.set(court, b); }
    return b;
  }

  setCourt(court: CourtId) {
    this.bg = this.backdrop(court);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    this.canvas.style.width = `${Math.floor(VIEW_W * fit)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * fit)}px`;
    this.scale = fit * dpr;
    this.canvas.width = Math.floor(VIEW_W * this.scale);
    this.canvas.height = Math.floor(VIEW_H * this.scale);
  }

  reset() {
    this.particles = [];
    this.popups = [];
    this.banner = null;
    this.shake = 0;
    this.flash = 0;
    this.zoom = 1;
    this.zoomT = 0;
    this.slowT = 0;
    this.trail = [];
  }

  showBanner(text: string, color = '#ffe14a', sub?: string, life = 1.4) {
    this.banner = { text, sub, life, max: life, color };
  }

  /** How fast the simulation should run right now (below 1 during slow motion). */
  timeScale(): number {
    return this.slowT > 0 ? 0.35 : 1;
  }

  private drama(e: { x: number; y: number; z: number }, zoomFor: number, slowFor: number) {
    this.fx = Math.max(VIEW_W * 0.25, Math.min(VIEW_W * 0.75, e.x - this.camX));
    this.fy = Math.max(150, Math.min(380, sy(e.z, e.y)));
    this.zoomT = Math.max(this.zoomT, zoomFor);
    this.slowT = Math.max(this.slowT, slowFor);
  }

  // ------------------------------------------------------------ events → FX

  onEvent(e: GameEvent, game: Game) {
    const teamColor = (t?: TeamId) => (t === undefined ? '#ffffff' : game.teams[t].trim);
    const net = (high: boolean) => (e.x < COURT.midX ? 0 : 2) + (high ? 1 : 0);
    const high = e.y > (HOOP.rimY + HIGH_RIM_Y) / 2;
    switch (e.type) {
      case 'hit': {
        const heavy = (e.power ?? 1) >= 2;
        this.burst(e, heavy ? 14 : 8, '#fff6a8', 'spark', heavy ? 300 : 210);
        this.impact(e, '#ffffff', heavy ? 36 : 24);
        this.shake = Math.max(this.shake, heavy ? 7 : 3.5);
        break;
      }
      case 'ko':
        this.burst(e, 20, '#ffd23f', 'spark', 340);
        this.impact(e, '#ffe14a', 46);
        this.shake = Math.max(this.shake, 10);
        break;
      case 'slam': {
        // A body hitting the floor or the fence. A thrown body (power 3) lands hardest.
        const pw = e.power ?? 1;
        const at = { ...e, y: Math.max(3, e.y) };
        this.burst(at, pw >= 3 ? 22 : pw === 2 ? 12 : 6, 'rgba(215,215,225,0.8)', 'dust', pw >= 3 ? 230 : pw === 2 ? 150 : 90);
        if (pw >= 2) this.ring(at, 'rgba(255,255,255,0.7)');
        if (pw >= 3) {
          this.ring(at, '#ffe14a');
          this.impact({ ...e, y: 18 }, '#ffffff', 50);
          this.burst(at, 14, '#ffe14a', 'spark', 320);
          this.flash = Math.max(this.flash, 0.22);
        }
        this.shake = Math.max(this.shake, pw >= 3 ? 14 : pw === 2 ? 6 : 2.5);
        break;
      }
      case 'hurl':
        // The moment a throw lets go.
        this.burst(e, 10, '#ffffff', 'spark', 260);
        this.popup(e.text ?? 'THROW!', { ...e, y: e.y + 30 }, '#ff8a2a', 22);
        this.shake = Math.max(this.shake, 5);
        break;
      case 'swish':
        this.nets[net(high)].kick(0.5);
        this.lastSwishHigh = high;
        if (e.text) this.popup(e.text, { ...e, y: e.y + 10 }, e.power === 2 ? '#ffffff' : '#ffe14a', 15);
        break;
      case 'board':
        // Ball off the backboard.
        this.burst(e, 5, '#ffffff', 'spark', 110);
        this.nets[net(high)].kick(0.25);
        break;
      case 'grab':
        this.burst(e, 10, '#ffe14a', 'spark', 200);
        this.ring({ ...e, y: 30 }, '#ffe14a');
        this.popup('GRAB!', { ...e, y: e.y + 50 }, '#ffe14a', 24);
        this.shake = Math.max(this.shake, 5);
        break;
      case 'rim':
        this.nets[net(high)].kick(0.5);
        this.burst(e, 5, '#ffb15c', 'spark', 120);
        break;
      case 'score': {
        this.burst(e, 26, teamColor(e.team), 'confetti', 260);
        this.popup(e.text ?? `+${e.points}`, { ...e, y: e.y + 40 }, teamColor(e.team), 20);
        if (this.lastSwishHigh) this.showBanner('UPPER HOOP!', '#ffcf3f', `${e.points} POINTS`);
        else if (e.points === 3) this.showBanner('FROM DOWNTOWN!', teamColor(e.team), '3 POINTS');
        this.lastSwishHigh = false;
        break;
      }
      case 'dunk':
        this.nets[net(high)].kick(2);
        this.burst(e, 30, '#ffffff', 'spark', 380);
        this.ring(e, '#ffe14a');
        this.shake = Math.max(this.shake, 12);
        this.flash = 0.35;
        this.showBanner(e.text ?? 'SLAM DUNK!', e.points === 3 ? '#ffe14a' : '#ff6a26', e.points === 3 ? '3 POINTS' : undefined);
        this.drama(e, 0.9, 0.55);
        break;
      case 'megaslam':
        this.flash = 0.5;
        this.ring(e, '#ffe14a');
        this.showBanner(e.text ?? 'MEGA SLAM!', '#ffe14a', game.teams[e.team ?? 0].name.toUpperCase());
        this.drama(e, 0.5, 0.3);
        break;
      case 'blitz':
        this.flash = 0.35;
        this.ring(e, '#ff4fa3');
        this.showBanner(e.text ?? 'BLITZ!', '#ff4fa3');
        break;
      case 'tackle':
        this.burst({ ...e, y: 4 }, 7, 'rgba(200,200,210,0.7)', 'dust', 110);
        break;
      case 'spin':
        this.burst({ ...e, y: 4 }, 6, 'rgba(160,230,255,0.8)', 'dust', 90);
        this.ring({ ...e, y: 4 }, 'rgba(160,230,255,0.9)');
        break;
      case 'oop':
        this.popup('LOB!', e, '#ffe14a', 16);
        break;
      case 'launch':
        this.burst({ ...e, y: 4 }, 12, '#ffd23f', 'spark', 260);
        this.ring({ ...e, y: 4 }, '#ffd23f');
        this.popup('BOING!', { ...e, y: 40 }, '#ffd23f', 17);
        break;
      case 'item':
        this.popup(e.text ?? 'GOT IT!', e, e.text === 'BOMB!' ? '#ff5a5a' : '#ffffff', e.text ? 15 : 13);
        break;
      case 'boom': {
        // Explosion: fireball, smoke, shockwave rings.
        const big = (e.power ?? 1) >= 2;
        this.burst(e, big ? 22 : 12, '#fff3a0', 'fire', big ? 300 : 200);
        this.burst(e, big ? 20 : 10, '#ff8a2a', 'fire', big ? 220 : 150);
        this.burst(e, big ? 14 : 8, 'rgba(70,70,82,0.85)', 'dust', big ? 190 : 130);
        this.burst(e, big ? 16 : 8, '#ffe14a', 'spark', big ? 460 : 320);
        this.ring({ ...e, y: 6 }, '#ffffff');
        if (big) this.ring({ ...e, y: 6 }, '#ff8a2a');
        this.impact(e, '#ffe14a', big ? 78 : 50);
        this.shake = Math.max(this.shake, big ? 18 : 10);
        this.flash = Math.max(this.flash, big ? 0.4 : 0.2);
        this.popup(e.text ?? 'BOOM!', { ...e, y: e.y + 30 }, '#ff8a2a', big ? 26 : 20);
        break;
      }
      case 'spray':
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            x: e.x, y: e.y + (this.rnd() - 0.5) * 8, z: e.z + (this.rnd() - 0.5) * 10,
            vx: (e.power ?? 1) * (260 + this.rnd() * 220), vy: (this.rnd() - 0.4) * 60, vz: (this.rnd() - 0.5) * 50,
            life: 0, max: 0.5, color: 'rgba(240,248,255,0.85)', size: 7, kind: 'dust', grav: -30,
          });
        }
        break;
      case 'slip':
        this.burst({ ...e, y: 4 }, 8, '#ffe14a', 'spark', 180);
        this.popup('SLIP!', e, '#ffe14a', 20);
        break;
      case 'crack':
        this.impact(e, '#ffffff', 44);
        this.burst(e, 14, '#fff6a8', 'spark', 340);
        this.popup(e.text ?? 'CRACK!', { ...e, y: e.y + 30 }, '#7dff6a', 22);
        this.shake = Math.max(this.shake, 8);
        this.drama(e, 0.35, 0.2);
        break;
      case 'rimbreak':
        this.burst(e, 24, '#ffb15c', 'spark', 360);
        this.burst(e, 10, 'rgba(235,240,250,0.9)', 'confetti', 200);
        this.showBanner('RIM BROKEN!', '#ff5a5a', 'NO BASKETS THERE FOR 6 SECONDS');
        this.shake = Math.max(this.shake, 12);
        break;
      case 'rimfix':
        this.popup('RIM FIXED', e, '#7dff6a', 16);
        this.ring(e, '#7dff6a');
        break;
      case 'bodydunk':
        this.nets[net(high)].kick(2.4);
        this.burst(e, 26, '#ffffff', 'spark', 360);
        this.ring(e, '#ff4fa3');
        this.shake = Math.max(this.shake, 14);
        this.flash = 0.35;
        this.showBanner('BODY DUNK!', '#ff4fa3', '+1 POINT');
        this.drama(e, 0.9, 0.5);
        break;
      case 'warn':
        this.showBanner(e.text ?? 'LOOK OUT!', '#ff5a5a', 'GET OUT OF THE LANE', 1.3);
        break;
      case 'bump':
        this.ring({ ...e, y: 8 }, '#ff4fa3');
        this.burst({ ...e, y: 14 }, 6, '#ffe14a', 'spark', 220);
        break;
      case 'gust':
        this.popup(e.text ?? 'WIND!', e, '#bfe9ff', 26);
        break;
      case 'event':
        this.showBanner(e.text ?? 'EVENT', '#3ff0ff', undefined, 1.6);
        this.flash = Math.max(this.flash, 0.2);
        break;
      case 'beam':
        this.ring({ ...e, y: 4 }, '#96ffbe');
        this.popup(e.text ?? 'ABDUCTED!', { ...e, y: e.y + 60 }, '#96ffbe', 20);
        break;
      case 'clang':
        this.burst(e, 8, '#c4cad8', 'spark', 260);
        this.popup('CLANG!', { ...e, y: e.y + 30 }, '#c4cad8', 16);
        this.shake = Math.max(this.shake, 4);
        break;
      case 'mount':
        this.ring({ ...e, y: 4 }, '#ffe14a');
        this.popup(e.text ?? 'RIDE!', { ...e, y: e.y + 40 }, '#ffe14a', 20);
        break;
      case 'juggle':
        this.popup(e.text ?? 'JUGGLE!', e, '#ff4fa3', 22);
        break;
      case 'boost':
        this.ring({ ...e, y: 4 }, '#7dff6a');
        this.popup('BOOST!', { ...e, y: 50 }, '#7dff6a', 20);
        break;
      case 'throw':
        this.burst(e, 4, 'rgba(220,220,230,0.8)', 'dust', 80);
        break;
      case 'itemhit':
        if (e.text === 'crate') {
          // A smashed crate: planks that tumble away and clatter on the floor.
          for (let i = 0; i < 9; i++) {
            const a = this.rnd() * Math.PI * 2, sp = 120 + this.rnd() * 220;
            this.particles.push({
              x: e.x, y: e.y + 8, z: e.z, vx: Math.cos(a) * sp, vy: 160 + this.rnd() * 260, vz: Math.sin(a) * sp * 0.4,
              life: 0, max: 1.1 + this.rnd() * 0.5, color: i % 3 ? '#c8924a' : '#8a5a2b', size: 5 + this.rnd() * 5, kind: 'chunk', grav: 1500,
            });
          }
        }
        this.burst(e, 14, '#d8c9a8', 'spark', 260);
        this.impact(e, '#ffb347', 34);
        this.popup('CRASH!', e, '#ffb347', 17);
        this.shake = Math.max(this.shake, 6);
        break;
      case 'block':
        this.burst(e, 12, '#9ef0ff', 'spark', 240);
        this.popup(e.text ?? 'BLOCK!', e, '#9ef0ff', 20);
        this.shake = Math.max(this.shake, 5);
        this.drama(e, 0.5, 0.3);
        break;
      case 'steal':
      case 'fumble':
        if (e.text) this.popup(e.text, { ...e, y: e.y + 34 }, teamColor(e.team), 15);
        break;
      case 'catch':
        if (e.text) this.popup(e.text, e, '#ffffff', 14);
        break;
      case 'shoot':
        if (e.text) this.popup(`${e.text}!`, { ...e, y: e.y + 30 }, '#7dff6a', 15);
        break;
      case 'special':
        this.flash = 0.5;
        this.ring(e, '#ff8a2a');
        this.showBanner(e.text ?? 'SPECIAL!', '#ff8a2a', game.teams[e.team ?? 0].name.toUpperCase());
        this.drama(e, 0.5, 0.3);
        break;
      case 'shockwave':
        this.ring(e, '#9ef0ff');
        this.ring({ ...e, y: 10 }, '#ffffff');
        this.shake = Math.max(this.shake, 14);
        this.flash = 0.4;
        this.showBanner('SHOCKWAVE!', '#9ef0ff');
        break;
      case 'violation':
        if (e.text === 'NO RIM!') this.popup('NO RIM!', e, '#ff5a5a', 22);
        else this.showBanner('SHOT CLOCK', '#ff5a5a', 'TURNOVER');
        break;
      case 'suddendeath':
        this.showBanner('SUDDEN DEATH', '#ff5a5a', 'NEXT BUCKET WINS', 2.2);
        break;
      case 'buzzer':
        this.showBanner('TIME!', '#ffffff', undefined, 1);
        break;
      case 'final':
        this.showBanner('FINAL', '#ffe14a', undefined, 2.5);
        break;
      case 'tipoff':
        this.showBanner('TIP OFF', '#ffffff', 'NO REFS. NO FOULS.', 1.4);
        break;
      case 'land':
      case 'jump':
        this.burst({ ...e, y: 2 }, 4, 'rgba(200,200,210,0.7)', 'dust', 60);
        if (e.text) this.popup(e.text, { ...e, y: e.y + 90 }, '#ff6a26', 16);
        break;
      default:
        break;
    }
  }

  private burst(e: { x: number; y: number; z: number }, n: number, color: string, kind: Particle['kind'], speed: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const s = speed * (0.4 + this.rnd() * 0.6);
      this.particles.push({
        x: e.x, y: e.y, z: e.z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.9 + (kind === 'confetti' ? 180 : 0), vz: (this.rnd() - 0.5) * s * 0.5,
        life: 0, max: kind === 'confetti' ? 1.4 : kind === 'dust' ? 0.45 : 0.35 + this.rnd() * 0.2,
        color: kind === 'confetti' ? ['#ffe14a', '#ff4fa3', '#3ff0ff', color][i % 4] : color,
        size: kind === 'confetti' ? 4 : kind === 'dust' ? 5 : 3,
        kind,
        grav: kind === 'confetti' ? 380 : kind === 'dust' ? -20 : 500,
      });
    }
  }

  /** Comic-style starburst where a hit lands. */
  private impact(e: { x: number; y: number; z: number }, color: string, size: number) {
    this.particles.push({ x: e.x, y: e.y, z: e.z, vx: this.rnd() * 6, vy: 0, vz: 0, life: 0, max: 0.14, color, size, kind: 'impact', grav: 0 });
  }

  private ring(e: { x: number; y: number; z: number }, color: string) {
    this.particles.push({ x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, life: 0, max: 0.45, color, size: 10, kind: 'ring', grav: 0 });
  }

  private popup(text: string, e: { x: number; y: number; z: number }, color: string, size: number) {
    this.popups.push({ text, x: e.x, y: e.y + 20, z: e.z, life: 1.1, color, size });
  }

  // ------------------------------------------------------------ frame

  /** How a player should look right now: face and whether they are celebrating. */
  private look(game: Game, p: Player): { mood: Mood; celebrate: boolean } {
    switch (p.state) {
      case 'down': return { mood: 'dizzy', celebrate: false };
      case 'stun': return { mood: 'pain', celebrate: false };
      case 'punch': case 'tackle': case 'airkick': case 'toss': case 'pound': return { mood: 'grit', celebrate: false };
      case 'grab': return { mood: 'angry', celebrate: false };
      case 'spray': return { mood: 'shout', celebrate: false };
      case 'held': return { mood: p.flinch > 0 ? 'pain' : 'shock', celebrate: false };
      case 'beam': return { mood: 'shock', celebrate: false };
      case 'ride': return { mood: Math.hypot(p.vx, p.vz) > 150 ? 'shout' : 'happy', celebrate: false };
      case 'dunk': return { mood: 'shout', celebrate: false };
      case 'hang': return { mood: 'smug', celebrate: false };
      case 'shoot': return { mood: p.released ? 'focus' : 'aim', celebrate: false };
      case 'spin': return { mood: 'focus', celebrate: false };
      case 'jump': if (p.launched) return { mood: 'shock', celebrate: false }; break;
      default: break;
    }
    let side: TeamId | null = null;
    if (game.phase === 'end') side = game.winner;
    if (side !== null) return p.team === side ? { mood: 'happy', celebrate: true } : { mood: 'sad', celebrate: false };
    // Play goes on after a basket, so the scorers only get a grin for a moment.
    if (game.lastScorer !== null && game.time - game.lastScoreTime < 1.2 && game.players[game.lastScorer].team === p.team) {
      return { mood: 'happy', celebrate: false };
    }
    if (p.stamina < 0.2) return { mood: 'tired', celebrate: false };
    if (Math.hypot(p.vx, p.vz) > 215) return { mood: 'effort', celebrate: false };
    return { mood: 'normal', celebrate: false };
  }

  render(game: Game, dt: number, humans: HumanView[], opts: { hud: boolean; dim?: number }) {
    const ctx = this.ctx;
    this.updateCamera(game, dt);
    this.updateFx(game, dt);

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    let ox = 0, oy = 0;
    if (this.shake > 0) {
      ox = (this.rnd() - 0.5) * this.shake;
      oy = (this.rnd() - 0.5) * this.shake;
    }
    ctx.save();
    ctx.translate(ox, oy);
    if (this.zoom > 1.001) {
      ctx.translate(this.fx, this.fy);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.fx, -this.fy);
    }
    const camX = this.camX;

    // Backdrop layers.
    ctx.drawImage(this.bg.sky, 0, 0, VIEW_W, FLOOR_TOP);
    this.drawLayer(this.bg.far, camX * FAR_PARALLAX, this.bg.farW);
    this.drawLayer(this.bg.near, camX * NEAR_PARALLAX, this.bg.nearW);
    ctx.drawImage(this.bg.court, camX * LAYER_RES, 0, VIEW_W * LAYER_RES, VIEW_H * LAYER_RES, 0, 0, VIEW_W, VIEW_H);

    // Launch pads sit on the floor.
    game.stage.launchers.forEach((pad, i) => {
      drawPad(ctx, pad.x - camX, sy(pad.z), 1 - game.padTimers[i] / PAD_RECHARGE, game.time);
    });

    const toys = game.toys;
    const time = game.time;
    const broken = (hx: number, highRim: boolean) => game.rims.some((r) => r.x === hx && r.high === highRim && r.brokenT > 0);

    // Traffic lane: a flashing warning stripe before and while something comes through.
    const tr = toys.traffic;
    if (tr) {
      const ly = sy(tr.lane);
      const a = tr.warn > 0 ? 0.2 + 0.2 * Math.abs(Math.sin(time * 12)) : 0.14;
      ctx.fillStyle = `rgba(255,60,50,${a})`;
      ctx.fillRect(0, ly - 19, VIEW_W, 38);
      ctx.fillStyle = `rgba(255,225,74,${a + 0.3})`;
      const off = (time * 220 * tr.dir) % 60;
      for (let x = -60 + off; x < VIEW_W + 60; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x + tr.dir * 10, ly); ctx.lineTo(x - tr.dir * 6, ly - 10); ctx.lineTo(x - tr.dir * 1, ly); ctx.lineTo(x - tr.dir * 6, ly + 10);
        ctx.fill();
      }
    }

    drawHoopBack(ctx, HOOP.leftX, camX, broken(HOOP.leftX, false), broken(HOOP.leftX, true));
    drawHoopBack(ctx, HOOP.rightX, camX, broken(HOOP.rightX, false), broken(HOOP.rightX, true));

    // Shadows.
    for (const p of game.players) if (p.state !== 'ride') drawShadow(ctx, p.x - camX, p.z, p.y, 24 * p.def.build);
    const b = game.ball;
    drawShadow(ctx, b.x - camX, b.z, b.y, 10 * (game.ballR / BALL_R));
    for (const it of game.items) if (it.state !== 'held') drawShadow(ctx, it.x - camX, it.z, it.y, 10);
    for (const r of toys.rides) if (r.respawn <= 0) drawShadow(ctx, r.x - camX, r.z, r.y, r.kind === 'board' ? 24 : 46);
    if (toys.wrecker) drawShadow(ctx, toys.wrecker.x - camX, toys.wrecker.z, toys.wrecker.y, 30);
    if (toys.ufo) drawShadow(ctx, toys.ufo.x - camX, toys.ufo.z, 215, 60);

    // Depth-sorted entities.
    const labels = new Map(humans.map((h) => [h.pid, h]));
    for (const r of toys.rides) if (r.respawn <= 0) stepRide(r, dt);
    const items: { z: number; draw: () => void }[] = [];
    for (const p of game.players) {
      const look = this.look(game, p);
      const h = labels.get(p.id);
      items.push({
        z: p.z,
        draw: () => drawPlayer(ctx, p, game.teams[p.team], p.x - camX, game.time, {
          ...look, hasBall: b.holder === p.id, label: h?.label, labelColor: h?.color,
          dt, ballH: b.y - p.y, gazeX: b.x - p.x, gazeY: b.y - (p.y + 70), carrying: !!game.heldItem(p),
          ride: toys.rideOf(p)?.kind ?? null,
          tilt: p.state === 'ride' && toys.rideOf(p) ? rideTilt(toys.rideOf(p)!) : undefined,
        }),
      });
    }
    // Rides: one part behind the rider, one part in front.
    for (const r of toys.rides) {
      if (r.respawn > 0) continue;
      const rider = r.rider !== null ? game.players[r.rider] : null;
      const rx = r.x - camX, ry = sy(r.z, r.y);
      const col = rider ? game.teams[rider.team].jersey : null;
      items.push({ z: r.z - 0.5, draw: () => drawRideBack(ctx, r, rx, ry, time, col) });
      items.push({ z: r.z + 0.5, draw: () => drawRideFront(ctx, r, rx, ry, time, col) });
    }
    if (tr && tr.warn <= 0) {
      if (tr.kind === 'car') items.push({ z: tr.lane + 4, draw: () => drawCar(ctx, tr.x - camX, sy(tr.lane) + 6, tr.dir, time) });
      else for (let i = 0; i < 4; i++) {
        const dz = i % 2 ? 7 : -7;
        items.push({ z: tr.lane + dz, draw: () => drawDog(ctx, tr.x - tr.dir * i * 60 - camX, sy(tr.lane + dz), tr.dir, time, i) });
      }
    }
    const wk = toys.wrecker;
    if (wk) items.push({ z: wk.z + 1, draw: () => drawWrecker(ctx, wk.x - camX, sy(wk.z, wk.y), COURT.midX - camX, sy(wk.z, 430)) });
    for (const bm of toys.bumpers) items.push({ z: bm.z, draw: () => drawBumper(ctx, bm.x - camX, sy(bm.z), bm.hit / 0.25, time) });
    for (const sh of toys.shells) items.push({ z: sh.z, draw: () => drawShell(ctx, sh.x - camX, sy(sh.z, sh.y), Math.sign(sh.vx), time) });
    const ufo = toys.ufo;
    if (ufo) items.push({ z: ufo.z + 3, draw: () => drawUfo(ctx, ufo.x - camX, sy(ufo.z, 215), sy(ufo.z), time, ufo.phase === 'lift' ? 1 : ufo.phase === 'carry' ? 0.5 : ufo.cd <= 0 ? 0.2 : 0, ufo.x, dt) });
    items.push({
      z: b.z + 1,
      draw: () => {
        // Motion trail behind a flying ball.
        this.trail.forEach((t, i) => {
          const k = (i + 1) / (this.trail.length + 1);
          ctx.fillStyle = `rgba(255,170,90,${0.32 * k})`;
          ctx.beginPath(); ctx.arc(t.x - camX, sy(t.z, t.y), 9 * (0.45 + 0.5 * k), 0, Math.PI * 2); ctx.fill();
        });
        let bx = b.x - camX, by = sy(b.z, b.y);
        const hd = b.holder !== null ? handPos(b.holder) : null;
        if (hd && b.holder !== null) {
          // A held ball is drawn at the carrier's hand, so it never floats beside the body.
          const h = game.players[b.holder];
          const hx = h.x - camX + hd.dx, hy = sy(h.z, h.y) + hd.dy;
          const dribbling = h.state === 'move' && h.y === 0 && Math.hypot(h.vx, h.vz) > 20;
          if (dribbling) {
            // Bounce between the floor and the palm.
            const k = Math.max(0, Math.min(1, (b.y - 6) / 30));
            const floorY = sy(h.z, 0) - 9;
            bx = hx + h.facing * 2;
            by = floorY + (hy + 12 - floorY) * k;
          } else if (h.state === 'shoot' || h.state === 'dunk' || h.state === 'hang' || h.state === 'jump') {
            bx = hx; by = hy - 8;
          } else {
            bx = hx + h.facing * 5; by = hy + 4;
          }
        }
        const ev = toys.event?.kind;
        const pulse = ev === 'bombball' ? (Math.sin(time * (toys.ballFuse < 1.5 ? 38 : 12)) > 0 ? 1 : 0) : 0;
        drawBall(ctx, bx, by, b.spin, !!b.shot?.special, game.ballR, ev === 'ironball' ? 'iron' : ev === 'bombball' ? 'bomb' : 'normal', pulse);
        if (ev === 'bombball') {
          // Fuse timer around the ball.
          ctx.strokeStyle = toys.ballFuse < 1.5 ? '#ff5a5a' : '#ffe14a';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(bx, by, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, toys.ballFuse / 6)); ctx.stroke();
        }
      },
    });
    for (const it of game.items) {
      items.push({ z: it.z + 2, draw: () => this.drawItemAt(game, it, camX) });
    }
    items.sort((a, c) => a.z - c.z);
    for (const it of items) it.draw();

    for (const [hx, side] of [[HOOP.leftX, 0], [HOOP.rightX, 2]] as const) {
      drawHoopFront(ctx, hx, camX, HIGH_RIM_Y, this.nets[side + 1], game.time, broken(hx, true));
      drawHoopFront(ctx, hx, camX, HOOP.rimY, this.nets[side], game.time, broken(hx, false));
    }

    // Worn power-ups show over the head; a ridden vehicle shows how much longer it lasts.
    for (const p of game.players) {
      if (p.state === 'down') continue;
      const px = p.x - camX, py = sy(p.z, p.y) - 118;
      let ix = px + 18;
      if (p.magnetT > 0 && (p.magnetT > 2 || Math.floor(time * 8) % 2)) { drawItem(ctx, 'magnet', ix, py, 0); ix += 20; }
      if (p.springT > 0 && (p.springT > 2 || Math.floor(time * 8) % 2)) drawItem(ctx, 'shoes', ix, py, 0);
      const r = toys.rideOf(p);
      if (r && p.state === 'ride') {
        const k = Math.max(0, r.fuel / RIDE[r.kind].fuel);
        ctx.fillStyle = 'rgba(12,8,28,0.85)';
        ctx.fillRect(px - 22, py - 28, 44, 6);
        ctx.fillStyle = k > 0.3 ? '#ffe14a' : '#ff5a5a';
        ctx.fillRect(px - 21, py - 27, 42 * k, 4);
        if (r.kind === 'tank') for (let i = 0; i < r.hp; i++) { ctx.fillStyle = '#7dff6a'; ctx.fillRect(px - 21 + i * 11, py - 20, 9, 3); }
      }
    }

    // Release-timing bar for each person's jump shot. The marker sweeps left to right over the
    // jump; the green zone in the middle is the sure-make window and shrinks under pressure.
    for (const hv of humans) {
      const h = game.players[hv.pid];
      if (h.state !== 'shoot' || h.released || b.holder !== h.id) continue;
      const tA = game.apexTime(h);
      const W = game.shotWindow(h);
      const off = Math.abs(h.vy) / game.grav;
      const pos = Math.max(0, Math.min(1, h.vy > 0 ? 0.5 * (1 - off / tA) : 0.5 * (1 + off / tA)));
      const bw = 70, bx = h.x - camX - bw / 2, by = sy(h.z, h.y) - 166;
      const zone = Math.max(2, (W / tA) * bw);
      const inZone = off <= W;
      ctx.fillStyle = 'rgba(12,8,28,0.9)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 13);
      ctx.fillStyle = '#5a2030';
      ctx.fillRect(bx, by, bw, 9);
      ctx.fillStyle = inZone ? '#b6ff9a' : '#3fbf5a';
      ctx.fillRect(bx + bw / 2 - zone / 2, by, zone, 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + pos * bw - 1.5, by - 3, 3, 15);
    }

    // Prompts for a person in a grab: what the buttons do, and how long the hold lasts.
    for (const hv of humans) {
      const h = game.players[hv.pid];
      if (h.state !== 'grab' && h.state !== 'held') continue;
      const x = h.x - camX + (h.state === 'grab' ? h.facing * 12 : 0), y = sy(h.z, 0) - 172;
      const lines = h.state === 'grab'
        ? [h.knees < 2 ? `${hv.action}: knee (${h.knees}/2)` : `${hv.action}: THROW!`, `LEFT / RIGHT + ${hv.action}: THROW`, `UP + ${hv.action}: AT THE HOOP`]
        : game.ball.holder === h.id ? [`${hv.dodge}: break free`, `${hv.action}: pass out`] : [`${hv.dodge}: break free`];
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
      ctx.fillStyle = 'rgba(12,8,28,0.88)';
      roundRect(ctx, x - w / 2, y - 16, w, lines.length * 17 + 12, 7);
      ctx.fill();
      lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? hv.color : '#ffffff'; ctx.fillText(l, x, y + i * 17); });
      if (h.state === 'grab') {
        // Time left before the hold lets go.
        const total = GRAB_HOLD + h.knees * 0.3, left = Math.max(0, 1 - h.t / total);
        ctx.fillStyle = hv.color;
        ctx.fillRect(x - w / 2 + 5, y + lines.length * 17 - 9, (w - 10) * left, 3);
      }
    }

    // What the buttons do right now for a person carrying an item or riding something.
    for (const hv of humans) {
      const h = game.players[hv.pid];
      const it = game.heldItem(h);
      const r = h.state === 'ride' ? toys.rideOf(h) : null;
      let line = '';
      if (r) {
        const has = b.holder === h.id;
        line = r.kind === 'tank' ? `${hv.action}: ${has ? 'FIRE THE BALL' : 'FIRE'} · ${hv.shoot}: ${has ? 'shoot' : 'get out'}`
          : r.kind === 'heli' ? `${hv.action}: BOMB · ${hv.shoot}: ${has ? 'SKY DUNK' : 'bail out'}`
            : `${hv.action}: BOOST · ${hv.shoot}: ${has ? 'shoot / dunk' : 'jump off'}`;
      } else if (it && h.state === 'move') {
        const verb = it.kind === 'bat' ? `SWING (${it.uses})` : it.kind === 'hammer' ? `SLAM (${it.uses})` : it.kind === 'ext' ? `SPRAY (${it.uses})`
          : it.kind === 'bomb' ? `THROW IT! ${Math.max(0, it.fuse).toFixed(1)}` : 'THROW';
        line = `${hv.action}: ${verb}`;
      }
      if (!line) continue;
      const x = h.x - camX, y = sy(h.z, h.y) - (r ? 168 : 150);
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      const w = ctx.measureText(line).width + 14;
      ctx.fillStyle = 'rgba(12,8,28,0.85)';
      roundRect(ctx, x - w / 2, y - 13, w, 18, 6); ctx.fill();
      ctx.fillStyle = it?.kind === 'bomb' && !r ? '#ff5a5a' : hv.color;
      ctx.fillText(line, x, y);
    }

    this.drawParticles(camX);
    this.drawPopups(camX);
    ctx.restore();

    this.drawWeather(game);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,230,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.slowT > 0) {
      // Letterbox bars during slow motion.
      const k = Math.min(1, this.slowT / 0.15);
      ctx.fillStyle = 'rgba(8,5,18,0.85)';
      ctx.fillRect(0, 0, VIEW_W, 26 * k);
      ctx.fillRect(0, VIEW_H - 26 * k, VIEW_W, 26 * k);
    }
    if (opts.dim) {
      ctx.fillStyle = `rgba(10,6,24,${opts.dim})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (opts.hud) {
      this.drawHud(game, humans);
      this.drawBanner();
    }
  }

  /** An item on the floor, in the air, or in its carrier's hand (a bat and a hammer follow the swing). */
  private drawItemAt(game: Game, it: Item, camX: number) {
    const ctx = this.ctx;
    const time = game.time;
    if (it.state !== 'held' || it.holder === null) {
      // Loose items keep whatever angle their tumbling and rolling left them at.
      drawItem(ctx, it.kind, it.x - camX, sy(it.z, it.y), it.armed ? 0 : it.spin, it.fuse, time, it.armed);
      return;
    }
    const h = game.players[it.holder];
    const hd = handPos(h.id);
    const x = h.x - camX + (hd ? hd.dx : h.facing * 12), y = sy(h.z, h.y) + (hd ? hd.dy : -42);
    const f = h.facing;
    if (it.kind === 'bat' || it.kind === 'hammer') {
      let a = 0.45;
      if (it.kind === 'bat' && h.state === 'punch' && h.weapon === 'bat') {
        a = h.t < 0.1 ? -1.3 : h.t < 0.22 ? -1.3 + ((h.t - 0.1) / 0.12) * 3.1 : 1.8 - Math.min(0.5, (h.t - 0.22) * 2);
      } else if (it.kind === 'hammer' && h.state === 'pound') {
        a = h.t < 0.2 ? -0.5 : h.t < 0.26 ? -0.5 + ((h.t - 0.2) / 0.06) * 2.7 : 2.2;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a * f);
      ctx.scale(1.25, 1.25);
      if (it.kind === 'bat') drawBat(ctx); else drawHammer(ctx);
      ctx.restore();
      return;
    }
    drawItem(ctx, it.kind, x + f * 4, y + 6, it.kind === 'ext' ? f * 0.25 : 0, it.fuse, time);
  }

  /** Screen-space weather for the event that is running: rain, floating dust, wind streaks. */
  private drawWeather(game: Game) {
    const ctx = this.ctx;
    const time = game.time;
    const ev = game.toys.event?.kind;
    const hash = (i: number) => { const v = Math.sin(i * 127.1) * 43758.5453; return v - Math.floor(v); };
    if (ev === 'rain') {
      ctx.fillStyle = 'rgba(40,60,110,0.16)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.strokeStyle = 'rgba(190,215,255,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const x = (hash(i) * (VIEW_W + 200) - time * 140 + 4000) % (VIEW_W + 200) - 100;
        const y = (hash(i + 500) * VIEW_H + time * (760 + hash(i + 900) * 300)) % VIEW_H;
        ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 18);
      }
      ctx.stroke();
    } else if (ev === 'lowgrav') {
      ctx.fillStyle = 'rgba(110,70,220,0.12)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(225,210,255,0.6)';
      for (let i = 0; i < 40; i++) {
        const x = (hash(i) * VIEW_W + Math.sin(time * 0.7 + i) * 20 + VIEW_W) % VIEW_W;
        const y = VIEW_H - ((hash(i + 300) * VIEW_H + time * (18 + hash(i + 700) * 30)) % VIEW_H);
        ctx.fillRect(x, y, 2.5, 2.5);
      }
    }
    const gust = game.toys.gust;
    if (gust) {
      ctx.strokeStyle = 'rgba(235,245,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const span = VIEW_W + 300;
        let x = (hash(i + 40) * span + time * (700 + hash(i) * 500)) % span - 150;
        if (gust.dir < 0) x = VIEW_W - x;
        const y = 40 + hash(i + 80) * 400;
        const len = 50 + hash(i + 120) * 70;
        ctx.moveTo(x, y); ctx.lineTo(x - gust.dir * len, y + Math.sin(time * 3 + i) * 3);
      }
      ctx.stroke();
    }
  }

  private drawLayer(img: HTMLCanvasElement, offset: number, w: number) {
    const sx = Math.min(offset, w - VIEW_W);
    this.ctx.drawImage(img, sx * LAYER_RES, 0, VIEW_W * LAYER_RES, FLOOR_TOP * LAYER_RES, 0, 0, VIEW_W, FLOOR_TOP);
  }

  private updateCamera(game: Game, dt: number) {
    const b = game.ball;
    let target = b.x - VIEW_W / 2;
    const h = game.holder();
    if (h) target += h.facing * 80;
    target = Math.max(0, Math.min(COURT.len - VIEW_W, target));
    const k = 1 - Math.exp(-dt * 4);
    this.camX += (target - this.camX) * k;
  }

  private updateFx(game: Game, dt: number) {
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    // Nets: the ball pushes its way through them (seen flat on, as the camera sees it).
    const bl = game.ball;
    const gust = game.toys.gust;
    for (let i = 0; i < 4; i++) {
      const hx = i < 2 ? HOOP.leftX : HOOP.rightX, rimY = i % 2 ? HIGH_RIM_Y : HOOP.rimY;
      const near = bl.state !== 'held' && Math.abs(bl.x - hx) < 40 && Math.abs(bl.z - HOOP.z) < 30 && bl.y < rimY + 20 && bl.y > rimY - 50;
      this.nets[i].step(dt, near ? { x: bl.x - hx, y: (bl.z - HOOP.z) * ZS - (bl.y - rimY), vx: bl.vx, vy: bl.vz * ZS - bl.vy, r: game.ballR } : null, gust ? gust.dir : 0);
    }
    this.zoomT = Math.max(0, this.zoomT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.zoom += ((this.zoomT > 0 ? 1.22 : 1) - this.zoom) * (1 - Math.exp(-dt * 9));
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    const fxDt = dt * this.timeScale();
    // Comet trail.
    const b = game.ball;
    if (b.shot?.special) {
      for (let i = 0; i < 3; i++) {
        this.particles.push({
          x: b.x, y: b.y, z: b.z,
          vx: (this.rnd() - 0.5) * 60, vy: (this.rnd() - 0.5) * 60, vz: 0,
          life: 0, max: 0.4, color: ['#fff3a0', '#ffb347', '#ff5a1f'][i], size: 7 - i * 1.5, kind: 'fire', grav: -60,
        });
      }
    }
    // Sparks off every lit fuse.
    if (fxDt > 0) {
      for (const it of game.items) {
        if (it.kind !== 'bomb' || it.fuse < 0 || this.rnd() > 0.5) continue;
        this.particles.push({
          x: it.x + 6, y: it.y + 22, z: it.z + 2, vx: (this.rnd() - 0.5) * 80, vy: 40 + this.rnd() * 80, vz: 0,
          life: 0, max: 0.25, color: '#ffe14a', size: 2, kind: 'spark', grav: 300,
        });
      }
      // A damaged tank smokes.
      for (const r of game.toys.rides) {
        if (r.kind !== 'tank' || r.respawn > 0 || r.hp > 2 || this.rnd() > 0.3) continue;
        this.particles.push({
          x: r.x - r.facing * 20, y: 44, z: r.z + 1, vx: (this.rnd() - 0.5) * 20, vy: 50 + this.rnd() * 40, vz: 0,
          life: 0, max: 0.8, color: 'rgba(60,60,70,0.7)', size: 7, kind: 'dust', grav: -40,
        });
      }
    }
    // Ball trail while it is shot, passed or knocked loose at speed.
    const flying = b.state === 'shot' || b.state === 'pass' || (b.state === 'loose' && Math.hypot(b.vx, b.vy, b.vz) > 260);
    if (flying && fxDt > 0) { this.trail.push({ x: b.x, y: b.y, z: b.z }); if (this.trail.length > 7) this.trail.shift(); }
    else if (this.trail.length) this.trail.shift();
    // Dust: sprint footfalls, tackle slides, and bodies skidding after a knockdown.
    this.dustT -= fxDt;
    if (this.dustT <= 0) {
      this.dustT = 0.07;
      for (const p of game.players) {
        if (p.y > 0) continue;
        const sp = Math.hypot(p.vx, p.vz);
        const skid = (p.state === 'down' || p.state === 'tackle') && sp > 70;
        if (!skid && !(p.state === 'move' && sp > 215)) continue;
        this.particles.push({
          x: p.x - Math.sign(p.vx) * 8, y: 3, z: p.z + (this.rnd() - 0.5) * 6,
          vx: -p.vx * 0.15 + (this.rnd() - 0.5) * 30, vy: 20 + this.rnd() * 30, vz: 0,
          life: 0, max: skid ? 0.5 : 0.32, color: 'rgba(215,215,225,0.75)', size: skid ? 7 : 4.5, kind: 'dust', grav: -20,
        });
      }
    }
    // Speed lines behind a Mega Slam or Blitz.
    for (const p of game.players) {
      const mega = p.state === 'dunk' && p.dunk?.kind === 'mega';
      const flung = p.state === 'down' && p.thrown && p.y > 0;
      if (!mega && !flung && !(p.state === 'tackle' && p.blitz)) continue;
      this.particles.push({
        x: p.x, y: p.y + 30 + this.rnd() * 40, z: p.z,
        vx: flung ? -p.vx * 0.5 : -p.facing * 200, vy: 0, vz: 0,
        life: 0, max: 0.25, color: mega ? '#ffe14a' : flung ? '#ffffff' : '#ff4fa3', size: 3, kind: 'spark', grav: 0,
      });
    }
    for (const p of this.particles) {
      p.life += fxDt;
      p.vy -= p.grav * fxDt;
      p.x += p.vx * fxDt; p.y += p.vy * fxDt; p.z += p.vz * fxDt;
      if (p.kind === 'confetti' && p.y < 4) { p.y = 4; p.vx *= 0.8; p.vy = 0; }
      // Debris bounces and scrapes along the floor.
      if (p.kind === 'chunk' && p.y < 2 && p.vy < 0) { p.y = 2; p.vy = -p.vy * 0.4; p.vx *= 0.6; p.vz *= 0.6; if (p.vy < 40) { p.vy = 0; p.grav = 0; } }
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.popups) { p.life -= dt; p.y += 40 * dt; }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private drawParticles(camX: number) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      const x = p.x - camX, y = sy(p.z, p.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
      if (p.kind === 'impact') {
        // Spiky starburst that pops out and vanishes.
        const r = p.size * (0.55 + 0.6 * (1 - k));
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(10,6,24,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + p.vx;
          const rr = i % 2 ? r * 0.45 : r;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * k + 1;
        const r = 10 + (1 - k) * 120;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'chunk') {
        // A splintered plank, turning as it flies and lying still once it lands.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.grav ? p.life * 9 + p.size : p.size);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -1.6, p.size * 2, 3.2);
        ctx.strokeStyle = 'rgba(27,19,32,0.8)'; ctx.lineWidth = 1;
        ctx.strokeRect(-p.size, -1.6, p.size * 2, 3.2);
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * 0.03, y + p.vy * 0.03); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        const s = p.kind === 'dust' ? p.size * (1.5 - k) : p.size * (p.kind === 'fire' ? k + 0.3 : 1);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPopups(camX: number) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.font = `italic 900 ${p.size}px "Trebuchet MS", sans-serif`;
      const x = p.x - camX, y = sy(p.z, p.y);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,6,24,0.9)';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ HUD

  private drawHud(game: Game, humans: HumanView[]) {
    const ctx = this.ctx;
    const [A, B] = game.teams;
    // Scoreboard.
    const w = 340, x = (VIEW_W - w) / 2, y = 10;
    ctx.fillStyle = 'rgba(12,8,28,0.82)';
    roundRect(ctx, x, y, w, 50, 10);
    ctx.fill();
    ctx.fillStyle = A.jersey;
    roundRect(ctx, x + 6, y + 6, 92, 38, 7); ctx.fill();
    ctx.fillStyle = B.jersey;
    roundRect(ctx, x + w - 98, y + 6, 92, 38, 7); ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = A.trim; ctx.fillText(A.short, x + 30, y + 30);
    ctx.fillStyle = B.trim; ctx.fillText(B.short, x + w - 30, y + 30);
    ctx.font = '900 26px "Trebuchet MS", sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,6,24,0.75)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(String(game.score[0]), x + 74, y + 35);
    ctx.fillText(String(game.score[0]), x + 74, y + 35);
    ctx.strokeText(String(game.score[1]), x + w - 74, y + 35);
    ctx.fillText(String(game.score[1]), x + w - 74, y + 35);
    const t = Math.ceil(game.clock);
    const clock = game.suddenDeath ? 'OT' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    ctx.font = '900 22px "Courier New", monospace';
    ctx.fillStyle = game.clock < 10 && !game.suddenDeath ? '#ff5a5a' : '#ffe14a';
    ctx.fillText(clock, x + w / 2, y + 28);
    ctx.font = 'bold 11px "Courier New", monospace';
    const sc = Math.max(0, Math.ceil(game.shotClock));
    ctx.fillStyle = sc <= 5 ? '#ff5a5a' : '#9aa0b5';
    ctx.fillText(`SHOT ${sc}`, x + w / 2, y + 43);
    // Possession arrow.
    ctx.fillStyle = '#ffffff';
    const px = game.possession === 0 ? x + 104 : x + w - 104;
    ctx.beginPath();
    if (game.possession === 0) { ctx.moveTo(px, y + 25); ctx.lineTo(px + 7, y + 20); ctx.lineTo(px + 7, y + 30); }
    else { ctx.moveTo(px, y + 25); ctx.lineTo(px - 7, y + 20); ctx.lineTo(px - 7, y + 30); }
    ctx.fill();

    // The event that is running, with the time it has left.
    const ev = game.toys.event;
    if (ev) {
      const name = EVENT_NAME[ev.kind];
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      const cw = 150, cx = (VIEW_W - cw) / 2, cy = y + 56;
      ctx.fillStyle = 'rgba(12,8,28,0.82)';
      roundRect(ctx, cx, cy, cw, 24, 7); ctx.fill();
      ctx.fillStyle = '#3ff0ff';
      ctx.textAlign = 'center';
      ctx.fillText(name, VIEW_W / 2, cy + 13);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(cx + 8, cy + 17, cw - 16, 3);
      ctx.fillStyle = '#3ff0ff';
      ctx.fillRect(cx + 8, cy + 17, (cw - 16) * Math.max(0, ev.t / ev.total), 3);
    }

    // RIOT meters.
    this.meter(16, VIEW_H - 34, game.hype[0], A.jersey, `${A.name.toUpperCase()} RIOT`, 'left', game.time);
    this.meter(VIEW_W - 216, VIEW_H - 34, game.hype[1], B.jersey, `${B.name.toUpperCase()} RIOT`, 'right', game.time);

    // Stamina for each person: first on the left, second on the right.
    humans.slice(0, 2).forEach((hv, i) => {
      const h = game.players[hv.pid];
      const bx = i === 0 ? 16 : VIEW_W - 216;
      ctx.fillStyle = 'rgba(12,8,28,0.7)';
      ctx.fillRect(bx, VIEW_H - 46, 200, 5);
      ctx.fillStyle = h.stamina > 0.3 ? '#7dff6a' : '#ff5a5a';
      ctx.fillRect(i === 0 ? bx : bx + 200 * (1 - h.stamina), VIEW_H - 46, 200 * h.stamina, 5);
      ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillStyle = hv.color;
      const grab = h.grabCd > 0 ? `GRAB IN ${Math.ceil(h.grabCd)}s` : 'GRAB READY';
      ctx.fillText(`${hv.label} · ${h.def.name.toUpperCase()} · STAMINA · ${grab}`, i === 0 ? bx : bx + 200, VIEW_H - 50);
    });
  }

  private meter(x: number, y: number, v: number, color: string, label: string, align: 'left' | 'right', time: number) {
    const ctx = this.ctx;
    const w = 200, h = 14;
    ctx.fillStyle = 'rgba(12,8,28,0.82)';
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 6); ctx.fill();
    const full = v >= 1;
    ctx.fillStyle = full ? (Math.floor(time * 8) % 2 ? '#ffe14a' : '#ff8a2a') : color;
    const fw = w * v;
    ctx.fillRect(align === 'left' ? x : x + w - fw, y, fw, h);
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,6,24,0.8)';
    ctx.fillStyle = '#ffffff';
    const text = full ? 'RIOT READY — SPECIAL!' : label;
    const tx = align === 'left' ? x + 4 : x + w - 4;
    ctx.strokeText(text, tx, y + 11);
    ctx.fillText(text, tx, y + 11);
  }

  private drawBanner() {
    const bnr = this.banner;
    if (!bnr) return;
    const ctx = this.ctx;
    const age = bnr.max - bnr.life;
    const inK = Math.min(1, age / 0.15);
    const outK = Math.min(1, bnr.life / 0.25);
    const k = Math.min(inK, outK);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(VIEW_W / 2, 130);
    const s = 0.6 + 0.4 * inK + (inK < 1 ? 0.3 * (1 - inK) : 0);
    ctx.scale(s, s);
    ctx.rotate(-0.04);
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 56px "Trebuchet MS", sans-serif';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(10,6,24,0.95)';
    ctx.strokeText(bnr.text, 0, 0);
    ctx.fillStyle = bnr.color;
    ctx.fillText(bnr.text, 0, 0);
    if (bnr.sub) {
      ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeText(bnr.sub, 0, 30);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(bnr.sub, 0, 30);
    }
    ctx.restore();
  }
}
