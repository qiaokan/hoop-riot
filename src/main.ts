import { AIController, AI_PARAMS, ACCURACY, AIParams } from './core/ai';
import { DT, TeamId } from './core/constants';
import { Game } from './core/game';
import { COURTS, CourtId, HOME_TEAM, OPPONENTS, UPGRADES, Upgrade, applyUpgrades } from './core/teams';
import { Sfx } from './client/audio';
import { Input } from './client/input';
import { Renderer } from './client/render';
import { roundRect } from './client/sprites';
import { VIEW_W } from './client/view';

type Mode = 'tour' | 'quick' | 'coop' | 'versus';
type Scene = 'title' | 'card' | 'match' | 'paused' | 'results' | 'upgrade' | 'champion';

const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: 'tour', name: 'STREET TOUR', blurb: 'Beat all four crews. Pick an upgrade after every win.' },
  { id: 'quick', name: 'QUICK MATCH', blurb: 'One game against the crew of your choice.' },
  { id: 'coop', name: '2P CO-OP', blurb: 'Two players on one team against the computer.' },
  { id: 'versus', name: '2P VERSUS', blurb: 'Player against player. Each gets a computer teammate.' },
];

/** A person at the controls. Each person drives one fixed player for the whole match. */
interface Human {
  slot: 0 | 1;
  team: TeamId;
  pid: number;
  label: string;
  color: string;
}

interface Tour { stage: number; upgrades: string[]; owed: number }

const params = new URLSearchParams(location.search);
const AUTOPLAY = params.get('autoplay') === '1';
const SPEED = Math.max(0.25, Math.min(8, Number(params.get('speed') ?? 1) || 1));
const LENGTHS = [120, 180, 300];
const P1_COLOR = '#ffe14a', P2_COLOR = '#5ff0ff';
/** Shown on the title screen so it is obvious which build is running. Bump it with each change. */
const VERSION = 'build 15 · ball spin, limp-body knockdowns, rolling items';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input();
const sfx = new Sfx();
if (params.get('mute') === '1') sfx.toggleMute();
input.onFirstGesture = () => sfx.unlock();

function loadTour(): Tour {
  try {
    const t = JSON.parse(localStorage.getItem('hoopriot.tour') ?? 'null');
    if (t && typeof t.stage === 'number' && Array.isArray(t.upgrades)) {
      return { stage: Math.max(0, Math.min(OPPONENTS.length - 1, t.stage)), upgrades: t.upgrades.map(String), owed: Number(t.owed) || 0 };
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return { stage: 0, upgrades: [], owed: 0 };
}
function saveTour() {
  try { localStorage.setItem('hoopriot.tour', JSON.stringify(tour)); } catch { /* play on without saving */ }
}

let tour = loadTour();
let scene: Scene = 'title';
let mode: Mode = (MODES.find((m) => m.id === params.get('mode'))?.id) ?? 'tour';
let menuRow = 0;
let oppIndex = Math.max(0, Math.min(OPPONENTS.length - 1, Number(params.get('opp') ?? 1) || 0));
let lenIndex = 0;
let endTimer = 0;
let cardTimer = 0;
let upgradeChoices: Upgrade[] = [];
let upgradeSel = 0;
let game: Game;
let ai: AIController;
let humans: Human[] = [];
let solo = true;
let seed = Number(params.get('seed') ?? 0) || Math.floor(Math.random() * 1e9);

/** Which opponent the next match is against. */
function matchOpp(): number {
  return mode === 'tour' ? tour.stage : oppIndex;
}

function newGame(kind: Mode | 'attract', opp: number, seconds: number) {
  const o = OPPONENTS[opp];
  seed = (seed * 1103515245 + 12345) >>> 0;
  const up = kind === 'tour' ? applyUpgrades(HOME_TEAM, tour.upgrades) : { team: HOME_TEAM, hypeRate: 1 };
  const court: CourtId = kind === 'attract' ? 'rooftop' : o.court;
  game = new Game({
    home: up.team, away: o.team, seed, matchSeconds: seconds,
    accuracy: [1, kind === 'versus' ? 1 : ACCURACY[o.difficulty]],
    stage: COURTS[court].stage,
    hypeRate: [up.hypeRate, 1],
  });
  const p = new Map<number, AIParams>();
  for (const pl of game.players) p.set(pl.id, pl.team === 0 || kind === 'versus' ? AI_PARAMS.normal : AI_PARAMS[o.difficulty]);
  ai = new AIController(game, p, seed);
  const h = (slot: 0 | 1, team: TeamId, pid: number): Human =>
    ({ slot, team, pid, label: slot === 0 ? 'P1' : 'P2', color: slot === 0 ? P1_COLOR : P2_COLOR });
  if (kind === 'attract' || AUTOPLAY) humans = [];
  else if (kind === 'coop') humans = [h(0, 0, 0), h(1, 0, 1)];
  else if (kind === 'versus') humans = [h(0, 0, 0), h(1, 1, 2)];
  else humans = [h(0, 0, 0)];
  solo = humans.length < 2;
  renderer.setCourt(court);
  renderer.reset();
  input.clearTaps();
  endTimer = 0;
}

function attract() {
  newGame('attract', matchOpp(), 9999);
}

/** Show the matchup card, then play. */
function goCard() {
  if (mode === 'tour' && tour.owed > 0) { openUpgrades(); return; }
  newGame(mode, matchOpp(), LENGTHS[lenIndex]);
  cardTimer = 0;
  scene = AUTOPLAY ? 'match' : 'card';
}

function openUpgrades() {
  const pool = UPGRADES.filter((u) => !tour.upgrades.includes(u.id));
  // Deterministic shuffle from the match seed.
  let s = seed;
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  upgradeChoices = pool.slice(0, 3);
  upgradeSel = 0;
  if (!upgradeChoices.length) { tour.owed = 0; saveTour(); goCard(); return; }
  scene = 'upgrade';
}

function toTitle() {
  scene = 'title';
  menuRow = 0;
  attract();
}

attract();
if (AUTOPLAY) { mode = 'quick'; goCard(); }

// ------------------------------------------------------------------ simulation

function stepSim() {
  // People always grab when they push into an opponent; the computer only when it means to.
  const held = humans.map((h) => ({ ...input.intent(h.slot, solo), grab: true }));
  const byPid = new Map(humans.map((h, i) => [h.pid, held[i]]));
  game.step(game.players.map((p) => byPid.get(p.id) ?? ai.intent(p)));
  for (const e of game.drainEvents()) {
    renderer.onEvent(e, game);
    if (scene === 'match') sfx.play(e);
  }
}

function titleRows(): string[] {
  return mode === 'tour' ? ['mode', 'length', 'start', 'reset'] : ['mode', 'opp', 'length', 'start'];
}

function onMatchOver() {
  if (AUTOPLAY) { goCard(); return; }
  if (mode === 'tour' && game.winner === 0) {
    // Bank the win right away so a closed tab does not lose it.
    if (tour.stage >= OPPONENTS.length - 1) {
      tour = { stage: 0, upgrades: [], owed: 0 };
      saveTour();
      scene = 'champion';
      return;
    }
    tour.stage++;
    tour.owed = 1;
    saveTour();
  }
  scene = 'results';
}

function handleMenu() {
  for (const k of input.takeMenu()) {
    if (k === 'mute') { sfx.toggleMute(); continue; }
    if (k === 'music') { sfx.toggleMusic(); continue; }
    switch (scene) {
      case 'title': {
        const rows = titleRows();
        const row = rows[menuRow];
        if (k === 'up') menuRow = (menuRow + rows.length - 1) % rows.length;
        else if (k === 'down') menuRow = (menuRow + 1) % rows.length;
        else if (k === 'left' || k === 'right') {
          const d = k === 'left' ? -1 : 1;
          if (row === 'mode') {
            const i = MODES.findIndex((m) => m.id === mode);
            mode = MODES[(i + d + MODES.length) % MODES.length].id;
            attract();
          } else if (row === 'opp') {
            oppIndex = (oppIndex + d + OPPONENTS.length) % OPPONENTS.length;
            attract();
          } else if (row === 'length') lenIndex = (lenIndex + d + LENGTHS.length) % LENGTHS.length;
        } else if (k === 'confirm') {
          if (row === 'reset') { tour = { stage: 0, upgrades: [], owed: 0 }; saveTour(); menuRow = 0; attract(); }
          else goCard();
        }
        break;
      }
      case 'card':
        if (k === 'confirm') scene = 'match';
        else if (k === 'back') toTitle();
        break;
      case 'match':
        if (k === 'pause' || k === 'back') scene = 'paused';
        break;
      case 'paused':
        if (k === 'pause' || k === 'confirm') scene = 'match';
        else if (k === 'back') toTitle();
        break;
      case 'results':
        if (k === 'confirm') goCard();
        else if (k === 'back') toTitle();
        break;
      case 'upgrade':
        if (k === 'left') upgradeSel = (upgradeSel + upgradeChoices.length - 1) % upgradeChoices.length;
        else if (k === 'right') upgradeSel = (upgradeSel + 1) % upgradeChoices.length;
        else if (k === 'confirm') {
          tour.upgrades.push(upgradeChoices[upgradeSel].id);
          tour.owed = 0;
          saveTour();
          goCard();
        }
        break;
      case 'champion':
        if (k === 'confirm' || k === 'back') toTitle();
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
    acc += dt * SPEED * (scene === 'match' ? renderer.timeScale() : 1);
    let n = 0;
    while (acc >= DT && n < 40) { stepSim(); acc -= DT; n++; }
    if (scene === 'match' && game.phase === 'end') {
      endTimer += dt;
      if (endTimer > 2.6) onMatchOver();
    }
  } else if (scene === 'card') {
    cardTimer += dt;
    if (cardTimer > 4) scene = 'match';
  }

  const dim = { title: 0.45, card: 0.7, match: 0, paused: 0.6, results: 0.68, upgrade: 0.78, champion: 0.6 }[scene];
  const views = scene === 'title' ? [] : humans.map((h) => ({
    pid: h.pid, label: h.label, color: h.color,
    action: solo || h.slot === 0 ? 'K' : '.', dodge: solo || h.slot === 0 ? 'L' : '/', shoot: solo || h.slot === 0 ? 'J' : ',',
  }));
  renderer.render(game, dt, views, { hud: scene === 'match' || scene === 'paused', dim });
  const ctx = renderer.ctx;
  const t = now / 1000;
  if (scene === 'title') drawTitle(ctx, t);
  else if (scene === 'card') drawCard(ctx, t);
  else if (scene === 'paused') drawPause(ctx);
  else if (scene === 'results') drawResults(ctx);
  else if (scene === 'upgrade') drawUpgrades(ctx, t);
  else if (scene === 'champion') drawChampion(ctx, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ overlays

const FONT = '"Trebuchet MS", sans-serif';

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', stroke = 0) {
  ctx.font = font;
  ctx.textAlign = align;
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(10,6,24,0.95)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.85) {
  ctx.fillStyle = `rgba(12,8,28,${alpha})`;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
}

function drawTitle(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.translate(VIEW_W / 2, 92);
  ctx.rotate(-0.05);
  const pulse = 1 + Math.sin(t * 3) * 0.02;
  ctx.scale(pulse, pulse);
  ctx.shadowColor = '#ff4fa3';
  ctx.shadowBlur = 24;
  text(ctx, 'HOOP RIOT', 0, 0, `italic 900 84px ${FONT}`, '#ffe14a', 'center', 12);
  ctx.shadowBlur = 0;
  text(ctx, '2-ON-2 STREET BALL · NO REFS · NO FOULS', 0, 32, `bold 17px ${FONT}`, '#ffffff', 'center', 5);
  ctx.restore();

  const opp = OPPONENTS[matchOpp()];
  const m = MODES.find((x) => x.id === mode)!;
  const rows = titleRows();
  const label = (row: string): string => {
    if (row === 'mode') return `MODE:  ◀ ${m.name} ▶`;
    if (row === 'opp') return `OPPONENT:  ◀ ${opp.team.name.toUpperCase()} (${mode === 'versus' ? 'PLAYER 2' : opp.difficulty.toUpperCase()}) ▶`;
    if (row === 'length') return `LENGTH:  ◀ ${LENGTHS[lenIndex] / 60} MIN ▶`;
    if (row === 'reset') return 'RESET TOUR PROGRESS';
    if (mode === 'tour') return tour.owed > 0 ? 'PICK YOUR UPGRADE  (ENTER)' : `START GAME ${tour.stage + 1} OF ${OPPONENTS.length}  (ENTER)`;
    return 'START GAME  (ENTER)';
  };
  const bx = VIEW_W / 2 - 260, by = 150;
  panel(ctx, bx, by, 520, 16 + rows.length * 36);
  rows.forEach((r, i) => {
    const sel = i === menuRow;
    const y = by + 34 + i * 36;
    if (sel) {
      ctx.fillStyle = 'rgba(255,225,74,0.16)';
      roundRect(ctx, bx + 14, y - 23, 492, 32, 8);
      ctx.fill();
    }
    const big = r === 'start';
    text(ctx, label(r), VIEW_W / 2, y, `bold ${big ? 20 : r === 'reset' ? 14 : 17}px ${FONT}`, sel ? '#ffe14a' : r === 'reset' ? '#9aa0b5' : '#cfd3e6');
  });
  const court = COURTS[opp.court];
  const info = mode === 'tour'
    ? `Next: ${opp.team.name} at ${court.name}. ${tour.upgrades.length ? `Upgrades: ${tour.upgrades.map((id) => UPGRADES.find((u) => u.id === id)?.name ?? id).join(', ')}` : m.blurb}`
    : `${m.blurb} ${court.name}: ${court.feature.toLowerCase()}.`;
  text(ctx, info, VIEW_W / 2, by + 16 + rows.length * 36 + 22, `italic 14px ${FONT}`, '#ffffff', 'center', 4);

  drawControls(ctx, 350, mode === 'coop' || mode === 'versus');
  text(ctx, VERSION, VIEW_W - 10, 16, `11px ${FONT}`, '#cfd3e6', 'right', 3);
}

/** Controls reference: one person, or two people sharing the keyboard. */
function drawControls(ctx: CanvasRenderingContext2D, y: number, twoP: boolean) {
  const cx = VIEW_W / 2;
  panel(ctx, cx - 380, y, 760, 148, 0.82);
  if (!twoP) {
    const lines = [
      ['MOVE', 'WASD / Arrows', 'SPRINT', 'Shift'],
      ['SHOOT / JUMP', 'J or Space: hold, let go in the green', 'PASS / PUNCH', 'K (tap 3 times: combo)'],
      ['TACKLE', 'Sprint + K (no ball)', 'AIR KICK', 'K in the air'],
      ['DODGE', 'L (can\'t be hit)', 'SPECIAL', 'L (RIOT full)'],
      ['CALL FOR PASS', 'K when your teammate has the ball', 'USE ITEM', 'K (walk over it first)'],
      ['GRAB', 'Run into an opponent, or K when touching', 'IN A GRAB', 'K knee · dir + K throw · up + K hoop'],
    ];
    lines.forEach((l, i) => {
      const yy = y + 24 + i * 22.5;
      text(ctx, l[0], cx - 362, yy, `bold 13px ${FONT}`, '#ffe14a', 'left');
      text(ctx, l[1], cx - 232, yy, `13px ${FONT}`, '#ffffff', 'left');
      text(ctx, l[2], cx + 100, yy, `bold 13px ${FONT}`, '#ffe14a', 'left');
      text(ctx, l[3], cx + 215, yy, `13px ${FONT}`, '#ffffff', 'left');
    });
    text(ctx, 'P pause · M mute · N music · Gamepad: stick, A shoot, X pass / hit, B dodge / special, RB sprint',
      cx, y + 164, `12px ${FONT}`, '#cfd3e6', 'center', 3);
  } else {
    const rows = [
      ['', 'PLAYER 1', 'PLAYER 2'],
      ['MOVE', 'W A S D', 'Arrow keys'],
      ['SPRINT', 'Left Shift', 'Right Shift'],
      ['SHOOT / JUMP', 'J', ',  (comma)'],
      ['PASS / HIT / THROW', 'K', '.  (period)'],
      ['DODGE / SPECIAL', 'L', '/  (slash)'],
      ['GRAB', 'Run into an opponent. Pass key: knee. Direction + pass key: throw. Up + pass key: at the hoop', ''],
    ];
    rows.forEach((r, i) => {
      const yy = y + 20 + i * 17.2;
      const head = i === 0;
      text(ctx, r[0], cx - 362, yy, `bold 12.5px ${FONT}`, '#cfd3e6', 'left');
      text(ctx, r[1], cx - 110, yy, `${head ? 'bold ' : ''}12.5px ${FONT}`, head ? P1_COLOR : '#ffffff', 'left');
      text(ctx, r[2], cx + 130, yy, `${head ? 'bold ' : ''}12.5px ${FONT}`, head ? P2_COLOR : '#ffffff', 'left');
    });
    text(ctx, 'Tackle: sprint + pass key · Air kick: pass key in the air · With one gamepad, it goes to Player 2',
      cx, y + 164, `12px ${FONT}`, '#cfd3e6', 'center', 3);
  }
}

function drawCard(ctx: CanvasRenderingContext2D, t: number) {
  const [A, B] = game.teams;
  const opp = OPPONENTS[matchOpp()];
  const court = COURTS[opp.court];
  const head = mode === 'tour' ? `GAME ${tour.stage + 1} OF ${OPPONENTS.length}` : MODES.find((m) => m.id === mode)!.name;
  text(ctx, head, VIEW_W / 2, 120, `bold 22px ${FONT}`, '#ffffff', 'center', 5);
  text(ctx, A.name.toUpperCase(), VIEW_W / 2 - 40, 210, `italic 900 44px ${FONT}`, A.jersey, 'right', 9);
  text(ctx, 'VS', VIEW_W / 2, 208, `italic 900 30px ${FONT}`, '#ffe14a', 'center', 7);
  text(ctx, B.name.toUpperCase(), VIEW_W / 2 + 40, 210, `italic 900 44px ${FONT}`, B.jersey, 'left', 9);
  text(ctx, `${A.players[0].name} & ${A.players[1].name}`, VIEW_W / 2 - 40, 240, `bold 16px ${FONT}`, '#ffffff', 'right', 4);
  text(ctx, `${B.players[0].name} & ${B.players[1].name}`, VIEW_W / 2 + 40, 240, `bold 16px ${FONT}`, '#ffffff', 'left', 4);
  panel(ctx, VIEW_W / 2 - 300, 280, 600, 104);
  text(ctx, court.name.toUpperCase(), VIEW_W / 2, 312, `bold 22px ${FONT}`, '#ffe14a');
  text(ctx, court.feature, VIEW_W / 2, 338, `16px ${FONT}`, '#ffffff');
  text(ctx, mode === 'versus' ? 'The gold upper hoop is worth a bonus point.' : opp.blurb, VIEW_W / 2, 364, `italic 15px ${FONT}`, '#cfd3e6');
  if (mode === 'tour' && tour.upgrades.length) {
    text(ctx, `Your upgrades: ${tour.upgrades.map((id) => UPGRADES.find((u) => u.id === id)?.name ?? id).join(' · ')}`,
      VIEW_W / 2, 416, `bold 14px ${FONT}`, '#7dff6a', 'center', 4);
  }
  if (Math.floor(t * 2) % 2 === 0) text(ctx, 'PRESS ENTER', VIEW_W / 2, 470, `bold 18px ${FONT}`, '#ffe14a', 'center', 5);
}

function drawPause(ctx: CanvasRenderingContext2D) {
  text(ctx, 'PAUSED', VIEW_W / 2, 120, `italic 900 64px ${FONT}`, '#ffe14a', 'center', 10);
  text(ctx, 'Enter / P: resume  ·  Esc: quit to title', VIEW_W / 2, 156, `bold 16px ${FONT}`, '#ffffff', 'center', 4);
  drawControls(ctx, 172, !solo);
  const tips = [
    'Tap K three times: jab, cross, then a finisher that launches them and frees the ball. A miss cannot be chained.',
    'Run into an opponent to grab them. K knees; left or right + K throws; UP + K throws them at the hoop (in = 1 point).',
    'Caught in a combo or a grab? Press L to break out (costs stamina); no stamina, K passes the ball out. After a grab, wait 8 seconds.',
    'Yellow pads launch you: shoot near the rim for a 3-point sky dunk. Shots from high up go in the gold hoop for +1.',
    'Items: K swings the bat (bat a loose ball at the hoop!), slams the hammer, sprays, or throws. Get rid of a lit bomb.',
    'Walk into a skateboard, tank or helicopter to ride it: K fires or boosts, J gets off. Punch a loose ball to send it flying.',
  ];
  tips.forEach((tip, i) => text(ctx, tip, VIEW_W / 2, 386 + i * 18, `13px ${FONT}`, '#cfd3e6', 'center', 3));
}

function drawResults(ctx: CanvasRenderingContext2D) {
  const [A, B] = game.teams;
  const won = game.winner === 0;
  const title = mode === 'versus' ? (won ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!') : won ? 'YOU WIN!' : 'YOU LOSE';
  const color = mode === 'versus' ? (won ? P1_COLOR : P2_COLOR) : won ? '#ffe14a' : '#ff5a5a';
  text(ctx, title, VIEW_W / 2, 100, `italic 900 68px ${FONT}`, color, 'center', 10);
  text(ctx, `${A.name}  ${game.score[0]}  —  ${game.score[1]}  ${B.name}`, VIEW_W / 2, 146, `bold 24px ${FONT}`, '#ffffff', 'center', 6);
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
  panel(ctx, VIEW_W / 2 - 260, 172, 520, 230);
  text(ctx, A.short, VIEW_W / 2 - 40, 202, `bold 15px ${FONT}`, A.jersey, 'right', 3);
  text(ctx, B.short, VIEW_W / 2 + 200, 202, `bold 15px ${FONT}`, B.jersey, 'right', 3);
  rows.forEach((r, i) => {
    const y = 234 + i * 27;
    text(ctx, r[0], VIEW_W / 2 - 230, y, `15px ${FONT}`, '#cfd3e6', 'left');
    text(ctx, r[1], VIEW_W / 2 - 40, y, `bold 15px ${FONT}`, '#ffffff', 'right');
    text(ctx, r[2], VIEW_W / 2 + 200, y, `bold 15px ${FONT}`, '#ffffff', 'right');
  });
  const next = mode === 'tour'
    ? (won ? 'Enter: pick an upgrade  ·  Esc: back to title' : 'Enter: try again  ·  Esc: back to title')
    : 'Enter: rematch  ·  Esc: back to title';
  text(ctx, next, VIEW_W / 2, 440, `bold 16px ${FONT}`, '#ffe14a', 'center', 4);
}

function drawUpgrades(ctx: CanvasRenderingContext2D, t: number) {
  text(ctx, 'PICK AN UPGRADE', VIEW_W / 2, 110, `italic 900 56px ${FONT}`, '#ffe14a', 'center', 10);
  text(ctx, `Next up: ${OPPONENTS[tour.stage].team.name} at ${COURTS[OPPONENTS[tour.stage].court].name}`,
    VIEW_W / 2, 150, `bold 17px ${FONT}`, '#ffffff', 'center', 4);
  const w = 230, gap = 26, n = upgradeChoices.length;
  const x0 = VIEW_W / 2 - (n * w + (n - 1) * gap) / 2;
  upgradeChoices.forEach((u, i) => {
    const sel = i === upgradeSel;
    const x = x0 + i * (w + gap), y = 200 - (sel ? 8 + Math.sin(t * 6) * 3 : 0);
    ctx.fillStyle = sel ? 'rgba(255,225,74,0.95)' : 'rgba(30,24,56,0.95)';
    roundRect(ctx, x, y, w, 170, 14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.25)';
    ctx.stroke();
    text(ctx, u.name, x + w / 2, y + 52, `900 22px ${FONT}`, sel ? '#1a1030' : '#ffe14a');
    // Wrap the description onto two lines.
    const words = u.desc.split(' ');
    let a = '', b = '';
    for (const wd of words) (a.length + wd.length < 20 && !b ? (a += `${wd} `) : (b += `${wd} `));
    text(ctx, a.trim(), x + w / 2, y + 96, `16px ${FONT}`, sel ? '#1a1030' : '#ffffff');
    text(ctx, b.trim(), x + w / 2, y + 118, `16px ${FONT}`, sel ? '#1a1030' : '#ffffff');
  });
  text(ctx, '◀ ▶ choose  ·  Enter: take it', VIEW_W / 2, 440, `bold 16px ${FONT}`, '#ffe14a', 'center', 4);
}

function drawChampion(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.translate(VIEW_W / 2, 150);
  ctx.rotate(-0.04);
  const pulse = 1 + Math.sin(t * 4) * 0.03;
  ctx.scale(pulse, pulse);
  text(ctx, 'STREET CHAMPIONS!', 0, 0, `italic 900 70px ${FONT}`, '#ffe14a', 'center', 12);
  ctx.restore();
  text(ctx, `Final: ${game.teams[0].name} ${game.score[0]} — ${game.score[1]} ${game.teams[1].name}`, VIEW_W / 2, 220, `bold 22px ${FONT}`, '#ffffff', 'center', 6);
  text(ctx, `You beat ${OPPONENTS.map((o) => o.team.name).join(', ')}.`, VIEW_W / 2, 262, `17px ${FONT}`, '#ffffff', 'center', 4);
  text(ctx, 'Every court in the city is yours.', VIEW_W / 2, 290, `italic 17px ${FONT}`, '#cfd3e6', 'center', 4);
  text(ctx, 'Enter: back to title', VIEW_W / 2, 440, `bold 16px ${FONT}`, '#ffe14a', 'center', 4);
}

// Debug / test hook.
(window as unknown as { __hoop: unknown }).__hoop = {
  get game() { return game; },
  get scene() { return scene; },
  get humans() { return humans; },
  get tour() { return tour; },
  /** Start a match right away, skipping the matchup card. */
  start(m: Mode = 'quick', opp = oppIndex) {
    mode = m;
    oppIndex = opp;
    newGame(m, matchOpp(), LENGTHS[lenIndex]);
    scene = 'match';
  },
  /** Advance the simulation by n fixed steps using live input + AI (for automated testing). */
  advance(n: number) { for (let i = 0; i < n; i++) stepSim(); },
  /**
   * Film strip (dev only): steps the game frame by frame, drawing each one at exactly 1/60 s, and
   * pastes every `every`-th frame, cropped around a player or the ball, into one sheet laid over
   * the page. Motion can then be judged from a single still.
   */
  film(o: { frames: number; every?: number; pid?: number; ball?: boolean; at?: { x: number; y: number; z: number }; w?: number; h?: number; cols?: number; up?: number }) {
    const every = o.every ?? 3, w = o.w ?? 150, h = o.h ?? 150, cols = o.cols ?? 8;
    const shots = Math.ceil(o.frames / every);
    let cv = document.getElementById('film') as HTMLCanvasElement | null;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'film';
      cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9;background:#1c2233;width:100%';
      document.body.appendChild(cv);
    }
    cv.width = cols * w; cv.height = Math.ceil(shots / cols) * h;
    const c = cv.getContext('2d')!;
    const k = canvas.width / 960;
    for (let f = 0; f < o.frames; f++) {
      stepSim();
      renderer.render(game, DT, [], { hud: false, dim: 0 });
      if (f % every) continue;
      const t = o.at ?? (o.ball ? game.ball : game.players[o.pid ?? 0]);
      const cx = t.x - renderer.camX, cy = 236 + t.z * 0.7 - t.y - (o.up ?? 45);
      const i = f / every, dx = (i % cols) * w, dy = Math.floor(i / cols) * h;
      c.drawImage(canvas, (cx - w / 2) * k, (cy - h / 2) * k, w * k, h * k, dx, dy, w, h);
      c.strokeStyle = '#445'; c.strokeRect(dx + 0.5, dy + 0.5, w - 1, h - 1);
      c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.fillText(String(f), dx + 4, dy + 12);
    }
  },
  /** Removes the film strip. */
  unfilm() { document.getElementById('film')?.remove(); },
  /** Jump to a scene (for automated screenshots). */
  show(s: Scene) { if (s === 'upgrade') openUpgrades(); else scene = s; },
  finish: onMatchOver,
};
