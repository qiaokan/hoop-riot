// The promo video: media/hoop-riot-promo.mp4. Nothing in it is recorded by hand: the footage is the
// computer playing itself from fixed seeds, and the music is synthesized here.
//
//   node scripts/promo.mjs serve    serves promo.html and saves the frames it posts into .promo/.
//                                   Open http://localhost:5190/promo.html, wait for "done", then
//                                   open http://localhost:5190/promo.html?view=2d and wait again.
//   node scripts/promo.mjs sheets   contact sheets of every shot (.promo/sheets), to pick cuts from
//   node scripts/promo.mjs cut      makes the music and cuts the video
//
// `sheets` and `cut` need ffmpeg, on the PATH or named by FFMPEG=/path/to/ffmpeg.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, '.promo');
const OUT = join(ROOT, 'media', 'hoop-riot-promo.mp4');
const POSTER = join(ROOT, 'media', 'hoop-riot-promo.jpg');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FPS = 60, BPM = 150;
/** Seconds in a beat. At 150 a minute a beat is exactly 24 frames, so every cut lands on the music. */
const BEAT = 60 / BPM;

// What to film. `opp` picks the court (0 docks, 1 arcade, 2 helipad, 3 palace), `seed` the match, and
// `from`/`to` are simulation steps (60 a second) since the tip-off.
const SHOTS = [
  { name: 'docks', view: '3d', opp: 0, seed: 22, from: 110, to: 320 },
  { name: 'oop2d', view: '2d', opp: 0, seed: 33, from: 380, to: 540 },
  { name: 'oop3d', view: '3d', opp: 0, seed: 33, from: 380, to: 540 },
  { name: 'arcade', view: '3d', opp: 1, seed: 22, from: 120, to: 340 },
  { name: 'tank', view: '3d', opp: 3, seed: 11, from: 90, to: 260 },
  { name: 'cannon', view: '3d', opp: 3, seed: 22, from: 190, to: 350 },
  { name: 'bodydunk', view: '3d', opp: 3, seed: 11, from: 400, to: 520 },
  { name: 'heli', view: '3d', opp: 2, seed: 11, from: 90, to: 330 },
  { name: 'ufo', view: '3d', opp: 2, seed: 22, from: 920, to: 1070 },
  { name: 'megaslam', view: '3d', opp: 3, seed: 22, from: 2870, to: 3020 },
];

// Words laid over the footage. The page draws each one as a clear picture.
const CARDS = [
  { name: 'logo', kind: 'logo', lines: ['2-ON-2 STREET BALL · NO REFS · NO FOULS'] },
  { name: '2d', kind: 'caption', text: 'PLAY IT IN 2D' },
  { name: '3d', kind: 'caption', text: 'OR IN 3D' },
  { name: 'fight', kind: 'caption', text: 'NO REFS. NO FOULS.' },
  { name: 'tank', kind: 'caption', text: 'RIDE A TANK' },
  { name: 'bodydunk', kind: 'caption', text: 'DUNK YOUR OPPONENT' },
  { name: 'heli', kind: 'caption', text: 'TAKE THE HELICOPTER' },
  { name: 'ufo', kind: 'caption', text: 'WATCH THE SKY' },
  { name: 'megaslam', kind: 'caption', text: 'FINISH WITH A MEGA SLAM' },
  { name: 'end', kind: 'end', lines: ['2-ON-2 STREET BALL · NO REFS · NO FOULS', 'RUNS IN YOUR BROWSER', 'one file · no install · 2D and 3D'] },
];

// The cut: which shot, from which of its frames, for how many beats, under which words.
const EDIT = [
  { shot: 'docks', at: 0, beats: 6, card: 'logo' },
  { shot: 'oop2d', at: 0, beats: 3.5, card: '2d' },
  { shot: 'oop3d', at: 84, beats: 4, card: '3d' }, // the same play, picked up on the same frame
  { shot: 'arcade', at: 96, beats: 6, card: 'fight' },
  { shot: 'tank', at: 20, beats: 6, card: 'tank' },
  { shot: 'bodydunk', at: 0, beats: 5.5, card: 'bodydunk' },
  { shot: 'heli', at: 84, beats: 6, card: 'heli' },
  { shot: 'ufo', at: 6, beats: 6, card: 'ufo' },
  { shot: 'megaslam', at: 36, beats: 6, card: 'megaslam' },
  { shot: 'cannon', at: 0, beats: 6.5, card: 'end' },
  { shot: 'docks', at: 144, beats: 3.5, card: 'end', held: true }, // the card stays up across this cut
];

const pad = (n) => String(n).padStart(5, '0');
const clean = (s) => String(s).replace(/[^a-z0-9-]/gi, '');

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.error) throw new Error(`could not run ffmpeg (${FFMPEG}): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}

// ------------------------------------------------------------------ serve

async function serve() {
  const { createServer } = await import('vite');
  const body = (req) => new Promise((done) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => done(Buffer.concat(chunks)));
  });
  const sink = {
    name: 'promo-sink',
    configureServer(server) {
      server.middlewares.use('/__promo', async (req, res) => {
        const url = new URL(req.url, 'http://x');
        const q = url.searchParams;
        if (url.pathname === '/plan') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ shots: SHOTS, cards: CARDS }));
          return;
        }
        let file = null;
        if (url.pathname === '/frame') file = join(DIR, 'frames', clean(q.get('shot')), `${pad(Number(q.get('n')) | 0)}.jpg`);
        else if (url.pathname === '/card') file = join(DIR, 'cards', `${clean(q.get('name'))}.png`);
        else if (url.pathname === '/done') console.log(`done: ${clean(q.get('view'))}`);
        if (file) {
          mkdirSync(dirname(file), { recursive: true });
          // Pictures arrive as data URLs.
          writeFileSync(file, Buffer.from(String(await body(req)).split(',')[1] ?? '', 'base64'));
        }
        res.end('ok');
      });
    },
  };
  const server = await createServer({
    root: ROOT, configFile: false, base: '/',
    server: { port: Number(process.env.PORT ?? 5190), strictPort: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [sink],
  });
  await server.listen();
  server.printUrls();
}

// ------------------------------------------------------------------ sheets

function sheets() {
  const every = 10, cols = 8;
  mkdirSync(join(DIR, 'sheets'), { recursive: true });
  for (const s of SHOTS) {
    const n = readdirSync(join(DIR, 'frames', s.name)).length;
    const rows = Math.ceil(Math.ceil(n / every) / cols);
    ffmpeg(['-framerate', '60', '-i', join(DIR, 'frames', s.name, '%05d.jpg'),
      '-vf', `drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text=%{n}:fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:x=20:y=20,select=not(mod(n\\,${every})),scale=400:-1,tile=${cols}x${rows}`,
      '-frames:v', '1', '-q:v', '4', join(DIR, 'sheets', `${s.name}.jpg`)]);
    console.log(`${s.name}: ${n} frames`);
  }
}

// ------------------------------------------------------------------ music

function music(beats) {
  const SR = 44100, n = Math.ceil(beats * BEAT * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  let seed = 4321;
  const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 31) - 1;
  const at = (beat) => Math.round(beat * BEAT * SR);
  /** Adds a sample; pan runs from -1 (left) to 1 (right). */
  const put = (i, v, pan = 0) => { if (i >= 0 && i < n) { L[i] += v * (pan > 0 ? 1 - pan : 1); R[i] += v * (pan < 0 ? 1 + pan : 1); } };

  const kick = (beat, g = 1) => {
    let ph = 0;
    for (let i = 0, i0 = at(beat); i < SR * 0.4; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (44 + 120 * Math.exp(-t * 30))) / SR;
      put(i0 + i, (Math.sin(ph) * Math.exp(-t * 8) + (i < 60 ? 0.5 * (1 - i / 60) : 0)) * 0.95 * g);
    }
  };
  const snare = (beat, g = 1) => {
    let prev = 0;
    for (let i = 0, i0 = at(beat); i < SR * 0.25; i++) {
      const t = i / SR, x = noise(), hp = x - prev * 0.6;
      prev = x;
      put(i0 + i, (hp * Math.exp(-t * 20) * 0.5 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 32) * 0.55) * g);
    }
  };
  const hat = (beat, g = 1, open = false, pan = 0.25) => {
    let p1 = 0, p2 = 0;
    for (let i = 0, i0 = at(beat); i < SR * (open ? 0.3 : 0.06); i++) {
      const t = i / SR, x = noise(), h1 = x - p1, h2 = h1 - p2;
      p1 = x; p2 = h1;
      put(i0 + i, h2 * Math.exp(-t * (open ? 14 : 80)) * 0.11 * g, pan);
    }
  };
  const crash = (beat, g = 1) => {
    let p1 = 0;
    for (let i = 0, i0 = at(beat); i < SR * 1.6; i++) {
      const t = i / SR, x = noise(), h = x - p1;
      p1 = x;
      put(i0 + i, h * Math.exp(-t * 3.2) * 0.2 * g, i % 2 ? 0.3 : -0.3);
    }
  };
  const riser = (beat, len) => {
    let p1 = 0;
    for (let i = 0, i0 = at(beat), m = at(len); i < m; i++) {
      const k = i / m, x = noise(), h = x - p1 * (0.2 + 0.75 * k);
      p1 = x;
      put(i0 + i, h * k * k * 0.22);
    }
  };
  const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
  const bass = (beat, len, hz, g = 1) => {
    let lp = 0, ph = 0;
    for (let i = 0, i0 = at(beat), m = at(len); i < m; i++) {
      const t = i / SR;
      ph += hz / SR;
      const env = Math.min(1, t * 300) * Math.min(1, (m - i) / (SR * 0.02));
      const cut = 0.035 + 0.16 * Math.exp(-t * 9);
      lp += ((saw(ph) * 0.7 + Math.sign(Math.sin(2 * Math.PI * ph)) * 0.3) - lp) * cut;
      put(i0 + i, (lp * 1.5 + Math.sin(2 * Math.PI * ph * 0.5) * 0.5) * env * 0.42 * g);
    }
  };
  const stab = (beat, len, notes, g = 1, decay = 5) => {
    notes.forEach((hz, k) => [-0.006, 0, 0.006].forEach((det, j) => {
      let lp = 0, ph = j * 0.31 + k * 0.17;
      for (let i = 0, i0 = at(beat), m = at(len); i < m; i++) {
        const t = i / SR;
        ph += (hz * (1 + det)) / SR;
        const env = Math.min(1, t * 400) * Math.exp(-t * decay) * Math.min(1, (m - i) / (SR * 0.03));
        lp += (saw(ph) - lp) * (0.08 + 0.3 * Math.exp(-t * 6));
        put(i0 + i, lp * env * 0.085 * g, (j - 1) * 0.5);
      }
    }));
  };

  // E minor. Chords for the hit on every cut, and a two-bar bass line under the groove.
  const E2 = 82.41, G2 = 98, A2 = 110, B2 = 123.47, D2 = 73.42, D3 = 146.83;
  const Em = [329.63, 392, 493.88], C = [261.63, 329.63, 392], D = [293.66, 369.99, 440];
  const lineA = [[0, 1.5, E2], [3, 1, E2], [6, 1.5, G2], [8, 1.5, E2], [10, 1, D2], [11, 1, E2], [14, 1, A2], [15, 1, B2]];
  const lineB = [[0, 1.5, E2], [3, 1, E2], [6, 1.5, G2], [8, 1.5, A2], [10, 1, B2], [12, 1, D3], [13, 1, B2], [14, 2, G2]];

  // A count-in under the title (6 beats), the groove, then one big hit that rings out under the end card.
  const DROP = 6, END = EDIT.reduce((a, e) => a + (e.card === 'end' ? 0 : e.beats), 0);
  crash(0, 0.8);
  stab(0, 6, Em, 1.3, 1.4);
  bass(0, 5, E2 / 2, 0.9);
  for (let b = 0; b < DROP; b += 0.5) hat(b, 0.9);
  kick(0); kick(2); kick(4); kick(4.5);
  for (let i = 0; i < 4; i++) snare(5 + i * 0.25, 0.5 + i * 0.15);

  const cuts = EDIT.reduce((a, e) => [...a, a[a.length - 1] + e.beats], [0]);
  for (let bar = 0; DROP + bar * 4 < END; bar++) {
    const b0 = DROP + bar * 4, s = (k) => b0 + k * 0.25;
    for (const k of bar % 2 ? [0, 7, 10] : [0, 3, 10]) kick(s(k));
    snare(s(4)); snare(s(12));
    if (bar % 4 === 3) { snare(s(14), 0.6); snare(s(15), 0.8); }
    for (let k = 0; k < 16; k++) hat(s(k), k % 2 ? 0.45 : 1, k === 14 && bar % 2 === 1);
    for (const [k, len, hz] of bar % 2 ? lineB : lineA) bass(s(k), len * 0.25, hz);
  }
  cuts.slice(1, -1).forEach((b, i) => { if (b >= DROP && b < END) { stab(b, 1.5, [Em, C, D, Em][i % 4], 1); if (i % 2 === 0) crash(b, 0.45); } });
  riser(END - 2, 2);
  for (let i = 0; i < 8; i++) snare(END - 2 + i * 0.25, 0.35 + i * 0.07);
  kick(END, 1.2); crash(END, 1.1);
  stab(END, 10, [...Em, 164.81], 1.6, 0.8);
  bass(END, 8, E2 / 2, 1.1);
  kick(END + 2.5, 0.8); kick(END + 3, 1); stab(END + 3, 7, Em.map((f) => f * 2), 0.5, 1.2);

  // Squash the peaks, fade the tail, write 16-bit stereo.
  const data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  const tail = SR * 1.2;
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, (n - i) / tail);
    data.writeInt16LE(Math.round(Math.tanh(L[i] * 1.1) * f * 24000), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.tanh(R[i] * 1.1) * f * 24000), 46 + i * 4);
  }
  return data;
}

// ------------------------------------------------------------------ cut

function cut() {
  const beats = EDIT.reduce((a, e) => a + e.beats, 0), total = beats * BEAT;
  mkdirSync(dirname(OUT), { recursive: true });
  const wav = join(DIR, 'music.wav');
  writeFileSync(wav, music(beats));

  const args = [], graph = [];
  let input = 0;
  EDIT.forEach((e, i) => {
    const frames = Math.round(e.beats * BEAT * FPS), dur = (frames / FPS).toFixed(4);
    const last = join(DIR, 'frames', e.shot, `${pad(e.at + frames - 1)}.jpg`);
    if (!existsSync(last)) throw new Error(`shot "${e.shot}" is too short for the cut: no ${last}`);
    args.push('-framerate', String(FPS), '-start_number', String(e.at), '-t', dur, '-i', join(DIR, 'frames', e.shot, '%05d.jpg'));
    const v = input++;
    if (!e.card) { graph.push(`[${v}:v]null[v${i}]`); return; }
    args.push('-loop', '1', '-framerate', String(FPS), '-t', dur, '-i', join(DIR, 'cards', `${e.card}.png`));
    const c = input++;
    graph.push(`[${c}:v]format=rgba${e.held ? '' : ',fade=t=in:st=0:d=0.14:alpha=1'}[c${i}]`, `[${v}:v][c${i}]overlay=shortest=1[v${i}]`);
  });
  graph.push(`${EDIT.map((_, i) => `[v${i}]`).join('')}concat=n=${EDIT.length}:v=1:a=0,fade=t=in:st=0:d=0.25,fade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7,scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p[v]`);
  ffmpeg([...args, '-i', wav, '-filter_complex', graph.join(';'), '-map', '[v]', '-map', `${input}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF ?? '28', '-r', String(FPS),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-t', total.toFixed(3), OUT]);
  ffmpeg(['-ss', '1.6', '-i', OUT, '-frames:v', '1', '-q:v', '3', POSTER]);
  console.log(`${OUT}: ${total.toFixed(1)} s`);
}

const step = { serve, sheets, cut }[process.argv[2]];
if (!step) { console.error('usage: node scripts/promo.mjs serve | sheets | cut'); process.exit(1); }
await step();
