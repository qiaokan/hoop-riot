// Balance meter: plays whole matches headless and prints the numbers the tuning is judged by.
//   npx vite-node scripts/balance.ts [seeds]
import { AIController, AI_PARAMS, ACCURACY, AIParams } from '../src/core/ai';
import { Game, GameEventType, Intent } from '../src/core/game';
import { COURTS, HOME_TEAM, OPPONENTS } from '../src/core/teams';

const SEEDS = Number(process.argv[2] ?? 6);
const SECONDS = 120;
/** PLAIN=1 strips items, hazards, events and rides, to show what the toys add. */
const PLAIN = !!process.env.PLAIN;

function setup(seed: number, oppIndex: number) {
  const opp = OPPONENTS[oppIndex];
  const game = new Game({ home: HOME_TEAM, away: opp.team, seed, matchSeconds: SECONDS, accuracy: [1, ACCURACY[opp.difficulty]], stage: PLAIN ? { ...COURTS[opp.court].stage, itemEvery: 0, hazards: [], events: [], rides: [] } : COURTS[opp.court].stage });
  const params = new Map<number, AIParams>();
  for (const p of game.players) params.set(p.id, p.team === 0 ? AI_PARAMS.normal : AI_PARAMS[opp.difficulty]);
  return { game, ai: new AIController(game, params, seed), opp };
}

type Counts = Partial<Record<GameEventType, number>>;

/** Computer against computer. */
function cpuMatch(seed: number, oppIndex: number) {
  const { game, ai } = setup(seed, oppIndex);
  const c: Counts = {};
  let steps = 0, down = [0, 0], held = [0, 0], broken = 0;
  while (game.phase !== 'end' && steps < 60 * (SECONDS + 120)) {
    game.step(game.players.map((p) => ai.intent(p)));
    for (const e of game.drainEvents()) c[e.type] = (c[e.type] ?? 0) + 1;
    for (const p of game.players) { if (p.state === 'down') down[p.team]++; if (p.state === 'held') held[p.team]++; }
    for (const r of game.rims) if (r.brokenT > 0) broken++;
    steps++;
  }
  return { game, c, steps, down, held, broken };
}

/** Player 0 defends like a person: runs straight at the ball carrier, four keys, late reactions. */
function humanDefender(seed: number, oppIndex: number, sprint: boolean) {
  const { game, ai } = setup(seed, oppIndex);
  let steps = 0, grabs = 0, throws = 0, breaks = 0, poss = 0, endedByGrab = 0, turnovers = 0, kx = 0, kz = 0;
  let prevTeam = -1, grabbedHolder = false, scoreAt = 0;
  while (game.phase !== 'end' && steps < 60 * (SECONDS + 120)) {
    const me = game.players[0];
    const h = game.holder();
    const intents = game.players.map((p): Intent => {
      if (p.id === 0 && me.state === 'grab') return { mx: me.facing, mz: 0, sprint: false, shoot: false, action: steps % 6 < 3, special: false, grab: true }; // throws at once
      if (p.id !== 0 || !h || h.team === 0) return ai.intent(p);
      const dx = h.x - me.x, dz = h.z - me.z;
      if (steps % 9 === 0) { kx = Math.abs(dx) > 10 ? Math.sign(dx) : 0; kz = Math.abs(dz) > 10 ? Math.sign(dz) : 0; }
      return { mx: kx, mz: kz, sprint, shoot: false, action: false, special: false, grab: true };
    });
    const was = me.state;
    const holderBefore = h;
    game.step(intents);
    game.drainEvents();
    if (was !== 'grab' && me.state === 'grab') { grabs++; if (holderBefore && holderBefore.id === me.grabId) grabbedHolder = true; }
    if (was === 'grab' && me.state === 'toss') throws++;
    if (was === 'grab' && me.state === 'stun') breaks++;
    const h2 = game.holder();
    const team = h2 ? h2.team : prevTeam;
    if (team !== prevTeam) {
      // A turnover: the other team took the ball without the opponent having scored.
      if (prevTeam === 1 && game.score[1] === scoreAt) { turnovers++; if (grabbedHolder) endedByGrab++; }
      if (team === 1) { poss++; scoreAt = game.score[1]; }
      grabbedHolder = false;
      prevTeam = team;
    }
    steps++;
  }
  return { grabs, throws, breaks, poss, endedByGrab, turnovers, score: game.score };
}

const f = (x: number, d = 1) => x.toFixed(d);
console.log(`\n== computer vs computer, ${SEEDS} seeds x ${SECONDS}s ==`);
console.log('court        score(avg)   margin  |m|>20  KO/team  court-KO  down%   booms  rimbrk  rim-out%  grabs  bodydunk  FG%   items-used');
const all = { kos: 0, n: 0, fgm: 0, fga: 0 };
const causeRows: string[] = [];
for (let o = 0; o < OPPONENTS.length; o++) {
  const causes: Record<string, number> = {};
  let a = 0, b = 0, absM = 0, blow = 0, kos = 0, env = 0, down = 0, booms = 0, rb = 0, out = 0, grabs = 0, bd = 0, fgm = 0, fga = 0, used = 0, steps = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const r = cpuMatch(s * 7 + o, o);
    const g = r.game;
    a += g.score[0]; b += g.score[1]; absM += Math.abs(g.score[0] - g.score[1]); if (Math.abs(g.score[0] - g.score[1]) > 20) blow++;
    kos += g.stats[0].kos + g.stats[1].kos; env += g.envKos; down += r.down[0] + r.down[1]; steps += r.steps;
    booms += r.c.boom ?? 0; rb += r.c.rimbreak ?? 0; out += r.broken; grabs += r.c.grab ?? 0; bd += r.c.bodydunk ?? 0;
    fgm += g.stats[0].fgm + g.stats[1].fgm; fga += g.stats[0].fga + g.stats[1].fga;
    used += (r.c.throw ?? 0) + (r.c.crack ?? 0) + (r.c.spray ?? 0);
    for (const [k, v] of Object.entries(g.koCauses)) causes[k] = (causes[k] ?? 0) + v;
  }
  all.kos += kos; all.n += SEEDS; all.fgm += fgm; all.fga += fga;
  const n = SEEDS;
  causeRows.push(`${OPPONENTS[o].court.padEnd(8)} ` + Object.entries(causes).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f(v / n)}`).join('  '));
  console.log(`${OPPONENTS[o].court.padEnd(12)} ${f(a / n).padStart(5)}-${f(b / n).padEnd(5)}  ${f(absM / n).padStart(5)}  ${String(blow).padStart(4)}/${n}  ${f(kos / n / 2).padStart(6)}  ${f(env / n).padStart(7)}  ${f(100 * down / (steps * 4)).padStart(5)}  ${f(booms / n).padStart(5)}  ${f(rb / n).padStart(5)}  ${f(100 * out / (steps * 2)).padStart(7)}  ${f(grabs / n).padStart(5)}  ${f(bd / n).padStart(7)}  ${f(100 * fgm / fga, 0).padStart(3)}  ${f(used / n).padStart(6)}`);
}
console.log('knockdowns per match by cause (both teams):');
for (const r of causeRows) console.log('  ' + r);
console.log(`overall: KO/team/match ${f(all.kos / all.n / 2)}  FG ${f(100 * all.fgm / all.fga, 0)}%`);

console.log(`\n== person-like defender chasing the ball carrier, ${Math.max(3, SEEDS >> 1)} seeds x ${SECONDS}s ==`);
console.log('opponent         sprint  grabs  throws  broken  opp-poss  turnovers  lost-to-grab  score');
for (let o = 0; o < OPPONENTS.length; o++) for (const sprint of [false, true]) {
  const n = Math.max(3, SEEDS >> 1);
  let g = 0, t = 0, br = 0, p = 0, e = 0, a = 0, b = 0, to = 0;
  for (let s = 1; s <= n; s++) { const r = humanDefender(s + o * 10, o, sprint); g += r.grabs; t += r.throws; br += r.breaks; p += r.poss; e += r.endedByGrab; to += r.turnovers; a += r.score[0]; b += r.score[1]; }
  console.log(`${OPPONENTS[o].team.name.padEnd(16)} ${String(sprint).padEnd(6)} ${f(g / n).padStart(5)}  ${f(t / n).padStart(6)}  ${f(br / n).padStart(6)}  ${f(p / n).padStart(8)}  ${f(100 * to / p, 0).padStart(8)}%  ${f(100 * e / p, 0).padStart(11)}%  ${f(a / n)}-${f(b / n)}`);
}
