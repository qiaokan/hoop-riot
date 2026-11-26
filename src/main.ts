import { AIController, AI_PARAMS, ACCURACY, AIParams } from './core/ai';
import { DT } from './core/constants';
import { Game, Intent } from './core/game';
import { HOME_TEAM, OPPONENTS } from './core/teams';
import { Sfx } from './client/audio';
import { Input } from './client/input';
import { Renderer } from './client/render';
import { roundRect } from './client/sprites';
import { VIEW_W } from './client/view';

type Scene = 'title' | 'match' | 'paused' | 'results';

const params = new URLSearchParams(location.search);
const AUTOPLAY = params.get('autoplay') === '1';
const SPEED = Math.max(0.25, Math.min(8, Number(params.get('speed') ?? 1) || 1));
const LENGTHS = [120, 180, 300];

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input();
const sfx = new Sfx();
if (params.get('mute') === '1') sfx.toggleMute();
input.onFirstGesture = () => sfx.unlock();

let scene: Scene = 'title';
let menuRow = 0;
let oppIndex = Math.max(0, Math.min(2, Number(params.get('opp') ?? 1) || 0));
let lenIndex = 1;
let endTimer = 0;
let game: Game;
let ai: AIController;
let humanId: number | null = null;
let seed = Number(params.get('seed') ?? 0) || Math.floor(Math.random() * 1e9);

function newGame(opts: { human: boolean; matchSeconds: number; opp: number }) {
  const opp = OPPONENTS[opts.opp];
  seed = (seed * 1103515245 + 12345) >>> 0;
  game = new Game({
    home: HOME_TEAM, away: opp.team, seed, matchSeconds: opts.matchSeconds,
    accuracy: [1, ACCURACY[opp.difficulty]],
  });
  const p = new Map<number, AIParams>();
  for (const pl of game.players) p.set(pl.id, pl.team === 0 ? AI_PARAMS.normal : AI_PARAMS[opp.difficulty]);
  ai = new AIController(game, p, seed);
  humanId = opts.human ? 0 : null;
  renderer.reset();
  endTimer = 0;
}

function startMatch() {
  newGame({ human: !AUTOPLAY, matchSeconds: LENGTHS[lenIndex], opp: oppIndex });
  scene = 'match';
}

// Attract mode behind the title screen.
newGame({ human: false, matchSeconds: 9999, opp: oppIndex });
if (AUTOPLAY) startMatch();

function intents(): Intent[] {
  const human = humanId !== null ? input.intent() : null;
  return game.players.map((p) => (p.id === humanId && human ? human : ai.intent(p)));
}

function stepSim() {
  game.step(intents());
  for (const e of game.drainEvents()) {
    renderer.onEvent(e, game);
    if (scene === 'match') sfx.play(e);
  }
}

function handleMenu() {
  for (const k of input.takeMenu()) {
    if (k === 'mute') { sfx.toggleMute(); continue; }
    if (k === 'music') { sfx.toggleMusic(); continue; }
    switch (scene) {
      case 'title':
        if (k === 'up') menuRow = (menuRow + 2) % 3;
        else if (k === 'down') menuRow = (menuRow + 1) % 3;
        else if (k === 'left' || k === 'right') {
          const d = k === 'left' ? -1 : 1;
          if (menuRow === 0) oppIndex = (oppIndex + d + 3) % 3;
          if (menuRow === 1) lenIndex = (lenIndex + d + LENGTHS.length) % LENGTHS.length;
        } else if (k === 'confirm') startMatch();
        break;
      case 'match':
        if (k === 'pause' || k === 'back') scene = 'paused';
        break;
      case 'paused':
        if (k === 'pause' || k === 'confirm') scene = 'match';
        else if (k === 'back') { scene = 'title'; newGame({ human: false, matchSeconds: 9999, opp: oppIndex }); }
        break;
      case 'results':
        if (k === 'confirm') startMatch();
        else if (k === 'back') { scene = 'title'; newGame({ human: false, matchSeconds: 9999, opp: oppIndex }); }
        break;
    }
  }
}

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  handleMenu();

  if (scene === 'match' || scene === 'title') {
    acc += dt * SPEED;
    let n = 0;
    while (acc >= DT && n < 40) { stepSim(); acc -= DT; n++; }
    if (scene === 'match' && game.phase === 'end') {
      endTimer += dt;
      if (endTimer > 2.6) scene = AUTOPLAY ? (startMatch(), 'match') : 'results';
    }
  }

  const dim = scene === 'title' ? 0.45 : scene === 'paused' ? 0.55 : scene === 'results' ? 0.65 : 0;
  renderer.render(game, dt, humanId, { hud: scene === 'match' || scene === 'paused', dim });
  const ctx = renderer.ctx;
  if (scene === 'title') drawTitle(ctx, now / 1000);
  if (scene === 'paused') drawPause(ctx);
  if (scene === 'results') drawResults(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ overlays

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', stroke = 0) {
  ctx.font = font;
  ctx.textAlign = align;
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(10,6,24,0.95)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function drawTitle(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.translate(VIEW_W / 2, 118);
  ctx.rotate(-0.05);
  const pulse = 1 + Math.sin(t * 3) * 0.02;
  ctx.scale(pulse, pulse);
  ctx.shadowColor = '#ff4fa3';
  ctx.shadowBlur = 24;
  text(ctx, 'HOOP RIOT', 0, 0, 'italic 900 96px "Trebuchet MS", sans-serif', '#ffe14a', 'center', 12);
  ctx.shadowBlur = 0;
  text(ctx, '2-ON-2 STREET BALL · NO REFS · NO FOULS', 0, 38, 'bold 18px "Trebuchet MS", sans-serif', '#ffffff', 'center', 5);
  ctx.restore();

  const opp = OPPONENTS[oppIndex];
  const rows = [
    `OPPONENT:  ◀ ${opp.team.name.toUpperCase()} (${opp.difficulty.toUpperCase()}) ▶`,
    `LENGTH:  ◀ ${LENGTHS[lenIndex] / 60} MIN ▶`,
    'START GAME  (ENTER)',
  ];
  const bx = VIEW_W / 2 - 250, by = 205;
  ctx.fillStyle = 'rgba(12,8,28,0.85)';
  roundRect(ctx, bx, by, 500, 150, 12);
  ctx.fill();
  rows.forEach((r, i) => {
    const sel = i === menuRow;
    const y = by + 38 + i * 40;
    if (sel) {
      ctx.fillStyle = 'rgba(255,225,74,0.16)';
      roundRect(ctx, bx + 14, y - 24, 472, 34, 8);
      ctx.fill();
    }
    text(ctx, r, VIEW_W / 2, y, `bold ${i === 2 ? 22 : 18}px "Trebuchet MS", sans-serif`, sel ? '#ffe14a' : '#cfd3e6');
  });
  text(ctx, opp.blurb, VIEW_W / 2, by + 172, 'italic 15px "Trebuchet MS", sans-serif', '#ffffff', 'center', 4);

  drawControls(ctx, 384);
}

function drawControls(ctx: CanvasRenderingContext2D, y: number) {
  const lines = [
    ['MOVE', 'WASD / Arrows', 'SPRINT', 'Shift'],
    ['SHOOT / JUMP', 'J or Space: hold, let go in the green', 'PASS / PUNCH', 'K'],
    ['TACKLE', 'Sprint + K (no ball)', 'AIR KICK', 'K while jumping'],
    ['DODGE', 'L (can\'t be hit)', 'SPECIAL', 'L (RIOT full)'],
  ];
  ctx.fillStyle = 'rgba(12,8,28,0.8)';
  roundRect(ctx, VIEW_W / 2 - 360, y, 720, 118, 10);
  ctx.fill();
  lines.forEach((l, i) => {
    const yy = y + 25 + i * 25;
    text(ctx, l[0], VIEW_W / 2 - 340, yy, 'bold 13px "Trebuchet MS", sans-serif', '#ffe14a', 'left');
    text(ctx, l[1], VIEW_W / 2 - 220, yy, '13px "Trebuchet MS", sans-serif', '#ffffff', 'left');
    text(ctx, l[2], VIEW_W / 2 + 140, yy, 'bold 13px "Trebuchet MS", sans-serif', '#ffe14a', 'left');
    text(ctx, l[3], VIEW_W / 2 + 270, yy, '13px "Trebuchet MS", sans-serif', '#ffffff', 'left');
  });
  text(ctx, 'Gamepad: stick move · A shoot · X pass / punch / tackle · B dodge / special · RB sprint · Start pause', VIEW_W / 2, y + 133, '12px "Trebuchet MS", sans-serif', '#cfd3e6', 'center', 3);
}

function drawPause(ctx: CanvasRenderingContext2D) {
  text(ctx, 'PAUSED', VIEW_W / 2, 140, 'italic 900 64px "Trebuchet MS", sans-serif', '#ffe14a', 'center', 10);
  text(ctx, 'Enter / P: resume  ·  Esc: quit to title', VIEW_W / 2, 180, 'bold 16px "Trebuchet MS", sans-serif', '#ffffff', 'center', 4);
  drawControls(ctx, 230);
  const tips = [
    'A jab only staggers. To take the ball: land 3 jabs, tackle, or hit someone in the air.',
    'Sprint at the rim and shoot to dunk. Jump at the rim without the ball and your teammate throws a lob.',
    'Pass (K) when your teammate jumps at the rim for an alley-oop. P / M: pause / mute.',
  ];
  tips.forEach((tip, i) => text(ctx, tip, VIEW_W / 2, 410 + i * 20, '13px "Trebuchet MS", sans-serif', '#cfd3e6', 'center', 3));
}

function drawResults(ctx: CanvasRenderingContext2D) {
  const [A, B] = game.teams;
  const won = game.winner === 0;
  text(ctx, won ? 'YOU WIN!' : 'YOU LOSE', VIEW_W / 2, 110, 'italic 900 72px "Trebuchet MS", sans-serif', won ? '#ffe14a' : '#ff5a5a', 'center', 10);
  text(ctx, `${A.name}  ${game.score[0]}  —  ${game.score[1]}  ${B.name}`, VIEW_W / 2, 158, 'bold 24px "Trebuchet MS", sans-serif', '#ffffff', 'center', 6);
  const s = game.stats;
  const pct = (m: number, a: number) => (a ? `${m}/${a} (${Math.round((m / a) * 100)}%)` : '0/0');
  const rows: [string, string, string][] = [
    ['Field goals', pct(s[0].fgm, s[0].fga), pct(s[1].fgm, s[1].fga)],
    ['Threes', pct(s[0].tpm, s[0].tpa), pct(s[1].tpm, s[1].tpa)],
    ['Dunks', String(s[0].dunks), String(s[1].dunks)],
    ['Steals', String(s[0].steals), String(s[1].steals)],
    ['Blocks', String(s[0].blocks), String(s[1].blocks)],
    ['Knockdowns', String(s[0].kos), String(s[1].kos)],
  ];
  ctx.fillStyle = 'rgba(12,8,28,0.85)';
  roundRect(ctx, VIEW_W / 2 - 260, 185, 520, 230, 12);
  ctx.fill();
  text(ctx, A.short, VIEW_W / 2 - 40, 215, 'bold 15px "Trebuchet MS", sans-serif', A.jersey, 'right');
  text(ctx, B.short, VIEW_W / 2 + 200, 215, 'bold 15px "Trebuchet MS", sans-serif', B.jersey, 'right');
  rows.forEach((r, i) => {
    const y = 247 + i * 27;
    text(ctx, r[0], VIEW_W / 2 - 230, y, '15px "Trebuchet MS", sans-serif', '#cfd3e6', 'left');
    text(ctx, r[1], VIEW_W / 2 - 40, y, 'bold 15px "Trebuchet MS", sans-serif', '#ffffff', 'right');
    text(ctx, r[2], VIEW_W / 2 + 200, y, 'bold 15px "Trebuchet MS", sans-serif', '#ffffff', 'right');
  });
  text(ctx, 'Enter: rematch  ·  Esc: back to title', VIEW_W / 2, 450, 'bold 16px "Trebuchet MS", sans-serif', '#ffe14a', 'center', 4);
}

// Debug / test hook.
(window as unknown as { __hoop: unknown }).__hoop = {
  get game() { return game; },
  get scene() { return scene; },
  start: startMatch,
  /** Advance the simulation by n fixed steps using live input + AI (for automated testing). */
  advance(n: number) { for (let i = 0; i < n; i++) stepSim(); },
};
