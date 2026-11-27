// Films the promo video (dev only). It plays computer-against-computer matches from fixed seeds,
// one exact 1/60 s frame at a time, and posts every frame to the promo server (scripts/promo.mjs),
// which holds the shot list and cuts the video. `?view=2d` films the 2D game, anything else the 3D one.

const W = 1280, H = 720;
/** Frames drawn (and thrown away) before a shot, so the camera and the effects have settled. */
const PRE = 150;
const FONT = '"Trebuchet MS", sans-serif';

interface Shot { name: string; view: '2d' | '3d'; opp: number; seed: number; from: number; to: number }
interface Card { name: string; kind: 'logo' | 'caption' | 'end'; text?: string; lines?: string[] }
interface Hoop {
  game: { step(intents: unknown): void };
  start(mode: string, opp: number, seed: number): void;
  advance(n: number): void;
  tick(n: number): void;
}

const view = new URLSearchParams(location.search).get('view') === '2d' ? '2d' : '3d';
// The game sizes its picture from the window: pin that, so a frame is W by H whatever the window is.
for (const [k, v] of [['innerWidth', W], ['innerHeight', H], ['devicePixelRatio', 1]] as const) {
  Object.defineProperty(window, k, { value: v, configurable: true });
}
// The game reads its options from the address when it loads: nobody at the controls, no sound.
history.replaceState(null, '', `?view=${view}&autoplay=1&mute=1`);

const status = document.getElementById('status')!;
const out = document.createElement('canvas');
out.width = W; out.height = H;
const ctx = out.getContext('2d')!;
// The picture goes up as a data URL: unlike toBlob, making one does not wait for the page to be idle,
// which in a background tab can take half a second a frame.
const grab = (type: string, quality?: number) => out.toDataURL(type, quality);
const post = (path: string, body?: string) => fetch(path, { method: 'POST', body });

function logo(cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.05);
  ctx.font = `italic 900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#ff4fa3'; ctx.shadowBlur = size * 0.3;
  ctx.lineWidth = size / 7; ctx.strokeStyle = 'rgba(10,6,24,0.95)';
  ctx.strokeText('HOOP RIOT', 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe14a';
  ctx.fillText('HOOP RIOT', 0, 0);
  ctx.restore();
}

function line(s: string, x: number, y: number, font: string, color: string, stroke: number, align: CanvasTextAlign = 'center') {
  ctx.font = font; ctx.textAlign = align; ctx.lineJoin = 'round';
  ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(10,6,24,0.95)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** A title card or a caption, drawn on a clear background to be laid over the footage. */
function drawCard(c: Card) {
  ctx.clearRect(0, 0, W, H);
  if (c.kind === 'caption') {
    const text = c.text ?? '';
    ctx.font = `italic 900 58px ${FONT}`;
    const w = ctx.measureText(text).width;
    ctx.save();
    ctx.translate(70, H - 92);
    ctx.rotate(-0.035);
    ctx.fillStyle = '#ff4fa3';
    ctx.beginPath();
    ctx.moveTo(-26, 14); ctx.lineTo(w + 44, 14); ctx.lineTo(w + 26, 34); ctx.lineTo(-44, 34);
    ctx.fill();
    line(text, 0, 0, `italic 900 58px ${FONT}`, '#ffffff', 12, 'left');
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(10,6,24,0.6)';
  ctx.fillRect(0, 0, W, H);
  const lines = c.lines ?? [];
  if (c.kind === 'logo') {
    logo(W / 2, H / 2 + 24, 190);
    if (lines[0]) line(lines[0], W / 2, H / 2 + 104, `bold 30px ${FONT}`, '#ffffff', 7);
    return;
  }
  logo(W / 2, 300, 170);
  if (lines[0]) line(lines[0], W / 2, 376, `bold 30px ${FONT}`, '#ffffff', 7);
  lines.slice(1).forEach((s, i) => line(s, W / 2, 470 + i * 50, `italic 900 36px ${FONT}`, i ? '#cfd3e6' : '#ffe14a', 8));
}

async function run() {
  await (view === '2d' ? import('./main') : import('./main3d'));
  const hoop = (window as unknown as { __hoop: Hoop }).__hoop;
  const overlay = document.getElementById('game') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLCanvasElement | null;
  const plan = await (await fetch('/__promo/plan')).json() as { shots: Shot[]; cards: Card[] };

  if (view === '3d') {
    for (const c of plan.cards) {
      drawCard(c);
      await post(`/__promo/card?name=${c.name}`, grab('image/png'));
    }
  }
  for (const s of plan.shots) {
    if (s.view !== view) continue;
    hoop.start('quick', s.opp, s.seed);
    // Count simulation steps: slow motion makes them fewer than the frames drawn.
    const g = hoop.game, step = g.step.bind(g);
    let ticks = 0;
    g.step = (intents) => { ticks++; step(intents); };
    hoop.advance(Math.max(0, s.from - PRE));
    while (ticks < s.from) hoop.tick(1);
    for (let n = 0; ticks < s.to; n++) {
      hoop.tick(1);
      ctx.clearRect(0, 0, W, H);
      if (stage) ctx.drawImage(stage, 0, 0, W, H);
      ctx.drawImage(overlay, 0, 0, W, H);
      await post(`/__promo/frame?shot=${s.name}&n=${n}`, grab('image/jpeg', 0.95));
      if (n % 20 === 0) status.textContent = `${s.name}: frame ${n} (step ${ticks} of ${s.to})`;
    }
  }
  await post(`/__promo/done?view=${view}`);
  status.textContent = `done (${view})`;
}

run().catch((e) => { status.textContent = `failed: ${e}`; throw e; });

export {};
