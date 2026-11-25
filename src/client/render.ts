import { COURT, HOOP, JUMP_V, TeamId } from '../core/constants';
import type { Game, GameEvent } from '../core/game';
import { Backdrop, FAR_PARALLAX, NEAR_PARALLAX, buildBackdrop } from './background';
import { drawBall, drawHoopBack, drawHoopFront, drawPlayer, drawShadow, roundRect } from './sprites';
import { FLOOR_TOP, LAYER_RES, VIEW_H, VIEW_W, sy } from './view';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  color: string; size: number;
  kind: 'spark' | 'dust' | 'fire' | 'confetti' | 'ring';
  grav: number;
}

interface Popup { text: string; x: number; y: number; z: number; life: number; color: string; size: number }
interface Banner { text: string; sub?: string; life: number; max: number; color: string }

const HIT_WORDS = ['POW!', 'WHAM!', 'BAM!', 'SMACK!', 'THUD!'];

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private bg: Backdrop;
  camX = 0;
  private shake = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private banner: Banner | null = null;
  private netSway: [number, number] = [0, 0];
  private flash = 0;
  private scale = 1;
  private rnd = Math.random;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.bg = buildBackdrop();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
  }

  showBanner(text: string, color = '#ffe14a', sub?: string, life = 1.4) {
    this.banner = { text, sub, life, max: life, color };
  }

  // ------------------------------------------------------------ events → FX

  onEvent(e: GameEvent, game: Game) {
    const teamColor = (t?: TeamId) => (t === undefined ? '#ffffff' : game.teams[t].trim);
    switch (e.type) {
      case 'hit':
        this.burst(e, 9, '#fff6a8', 'spark', 220);
        this.popup(HIT_WORDS[Math.floor(this.rnd() * HIT_WORDS.length)], e, '#ffffff', 16);
        this.shake = Math.max(this.shake, 4);
        break;
      case 'ko':
        this.burst(e, 18, '#ffd23f', 'spark', 320);
        this.popup('DOWN!', e, '#ff5a5a', 22);
        this.shake = Math.max(this.shake, 9);
        break;
      case 'swish':
        this.netSway[e.x < COURT.midX ? 0 : 1] = 1;
        break;
      case 'rim':
        this.netSway[e.x < COURT.midX ? 0 : 1] = 0.5;
        this.burst(e, 5, '#ffb15c', 'spark', 120);
        break;
      case 'score': {
        this.burst(e, 26, teamColor(e.team), 'confetti', 260);
        this.popup(e.text ?? `+${e.points}`, { ...e, y: e.y + 40 }, teamColor(e.team), 20);
        if (e.points === 3) this.showBanner('FROM DOWNTOWN!', teamColor(e.team), '3 POINTS');
        break;
      }
      case 'dunk':
        this.netSway[e.x < COURT.midX ? 0 : 1] = 1.4;
        this.burst(e, 30, '#ffffff', 'spark', 380);
        this.ring(e, '#ffe14a');
        this.shake = Math.max(this.shake, 12);
        this.flash = 0.35;
        this.showBanner('SLAM DUNK!', '#ff6a26');
        break;
      case 'block':
        this.burst(e, 12, '#9ef0ff', 'spark', 240);
        this.popup(e.text ?? 'BLOCK!', e, '#9ef0ff', 20);
        this.shake = Math.max(this.shake, 5);
        break;
      case 'steal':
      case 'fumble':
        if (e.text) this.popup(e.text, e, teamColor(e.team), 15);
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
        break;
      case 'shockwave':
        this.ring(e, '#9ef0ff');
        this.ring({ ...e, y: 10 }, '#ffffff');
        this.shake = Math.max(this.shake, 14);
        this.flash = 0.4;
        this.showBanner('SHOCKWAVE!', '#9ef0ff');
        break;
      case 'violation':
        this.showBanner('SHOT CLOCK', '#ff5a5a', 'TURNOVER');
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
        if (e.text) this.popup(e.text, { ...e, y: 90 }, '#ff6a26', 16);
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

  private ring(e: { x: number; y: number; z: number }, color: string) {
    this.particles.push({ x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, life: 0, max: 0.45, color, size: 10, kind: 'ring', grav: 0 });
  }

  private popup(text: string, e: { x: number; y: number; z: number }, color: string, size: number) {
    this.popups.push({ text, x: e.x, y: e.y + 20, z: e.z, life: 1.1, color, size });
  }

  // ------------------------------------------------------------ frame

  render(game: Game, dt: number, humanId: number | null, opts: { hud: boolean; dim?: number }) {
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
    const camX = this.camX;

    // Backdrop layers.
    ctx.drawImage(this.bg.sky, 0, 0, VIEW_W, FLOOR_TOP);
    this.drawLayer(this.bg.far, camX * FAR_PARALLAX, this.bg.farW);
    this.drawLayer(this.bg.near, camX * NEAR_PARALLAX, this.bg.nearW);
    ctx.drawImage(this.bg.court, camX * LAYER_RES, 0, VIEW_W * LAYER_RES, VIEW_H * LAYER_RES, 0, 0, VIEW_W, VIEW_H);

    drawHoopBack(ctx, HOOP.leftX, camX);
    drawHoopBack(ctx, HOOP.rightX, camX);

    // Shadows.
    for (const p of game.players) drawShadow(ctx, p.x - camX, p.z, p.y, 18 * p.def.build);
    const b = game.ball;
    drawShadow(ctx, b.x - camX, b.z, b.y, 9);

    // Depth-sorted entities.
    const items: { z: number; draw: () => void }[] = [];
    for (const p of game.players) {
      items.push({
        z: p.z,
        draw: () => drawPlayer(ctx, p, game.teams[p.team], p.x - camX, game.time, p.id === humanId, b.holder === p.id),
      });
    }
    items.push({ z: b.z + 1, draw: () => drawBall(ctx, b.x - camX, sy(b.z, b.y), b.spin, !!b.shot?.special) });
    items.sort((a, c) => a.z - c.z);
    for (const it of items) it.draw();

    drawHoopFront(ctx, HOOP.leftX, camX, this.netSway[0], game.time);
    drawHoopFront(ctx, HOOP.rightX, camX, this.netSway[1], game.time);

    // Release-timing meter for the human's jump shot: fills as the jump nears its apex.
    if (humanId !== null) {
      const h = game.players[humanId];
      if (h.state === 'shoot' && !h.released && b.holder === h.id) {
        const q = 1 - Math.min(1, Math.abs(h.vy) / JUMP_V);
        const mx = h.x - camX + 22, my = sy(h.z, h.y) - 70;
        ctx.fillStyle = 'rgba(12,8,28,0.85)';
        ctx.fillRect(mx - 1, my - 1, 8, 42);
        ctx.fillStyle = q > 0.85 ? '#7dff6a' : q > 0.6 ? '#ffe14a' : '#ff5a5a';
        ctx.fillRect(mx, my + 40 * (1 - q), 6, 40 * q);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - 2, my + 40 * 0.15 - 1, 10, 2);
      }
    }

    this.drawParticles(camX);
    this.drawPopups(camX);
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,230,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (opts.dim) {
      ctx.fillStyle = `rgba(10,6,24,${opts.dim})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (opts.hud) {
      this.drawHud(game, humanId);
      this.drawBanner();
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
    if (h) target += (h.facing * 80);
    target = Math.max(0, Math.min(COURT.len - VIEW_W, target));
    const k = 1 - Math.exp(-dt * 4);
    this.camX += (target - this.camX) * k;
  }

  private updateFx(game: Game, dt: number) {
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.netSway = [Math.max(0, this.netSway[0] - dt * 1.5), Math.max(0, this.netSway[1] - dt * 1.5)];
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
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
    for (const p of this.particles) {
      p.life += dt;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 'confetti' && p.y < 4) { p.y = 4; p.vx *= 0.8; p.vy = 0; }
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
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * k + 1;
        const r = 10 + (1 - k) * 120;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
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

  private drawHud(game: Game, humanId: number | null) {
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
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(game.score[0]), x + 74, y + 35);
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

    // Hype meters.
    this.meter(16, VIEW_H - 34, game.hype[0], A.jersey, `${A.name.toUpperCase()} RIOT`, 'left', game.time);
    this.meter(VIEW_W - 216, VIEW_H - 34, game.hype[1], B.jersey, `${B.name.toUpperCase()} RIOT`, 'right', game.time);
    if (humanId !== null) {
      const h = game.players[humanId];
      ctx.fillStyle = 'rgba(12,8,28,0.7)';
      ctx.fillRect(16, VIEW_H - 46, 200, 5);
      ctx.fillStyle = h.stamina > 0.3 ? '#7dff6a' : '#ff5a5a';
      ctx.fillRect(16, VIEW_H - 46, 200 * h.stamina, 5);
      ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cfd3e6';
      ctx.fillText('STAMINA', 16, VIEW_H - 50);
    }
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
    ctx.fillStyle = '#ffffff';
    ctx.fillText(full ? 'RIOT READY — SPECIAL!' : label, align === 'left' ? x + 4 : x + w - 4, y + 11);
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
    ctx.translate(VIEW_W / 2, 170);
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
