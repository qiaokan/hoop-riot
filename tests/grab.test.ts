import { describe, expect, it } from 'vitest';
import { AIController, AI_PARAMS, ACCURACY, AIParams } from '../src/core/ai';
import { GRAB_CLINCH, GRAB_COOLDOWN, GRAB_IMMUNE } from '../src/core/constants';
import { Game, Intent, NO_INTENT } from '../src/core/game';
import { COURTS, HOME_TEAM, OPPONENTS } from '../src/core/teams';

/**
 * Plays a match with player 0 driven the way a person plays defense: when the other team has
 * the ball, head straight for the ball carrier. Counts how many grabs that produces.
 */
export function defenderGrabs(seed: number, oppIndex: number, sprint: boolean, seconds = 120, humanLike = false, throwNow = false) {
  const opp = OPPONENTS[oppIndex];
  const game = new Game({ home: HOME_TEAM, away: opp.team, seed, matchSeconds: seconds, accuracy: [1, ACCURACY[opp.difficulty]], stage: COURTS[opp.court].stage });
  const params = new Map<number, AIParams>();
  for (const p of game.players) params.set(p.id, p.team === 0 ? AI_PARAMS.normal : AI_PARAMS[opp.difficulty]);
  const ai = new AIController(game, params, seed);
  let grabs = 0, throws = 0, defenseFrames = 0, steps = 0;
  // Opponent possessions, and how many were lost (no score) after their ball carrier was grabbed.
  let poss = 0, lost = 0, prevTeam = -1, grabbedHolder = false, scoreAt = 0;
  // A person steers with four keys and reacts late: the direction only updates every 9 frames.
  let kx = 0, kz = 0;
  while (game.phase !== 'end' && steps < 60 * (seconds + 60)) {
    const me = game.players[0];
    const h = game.holder();
    const intents = game.players.map((p): Intent => {
      // Holding someone: knee, knee, throw.
      if (p.id === 0 && me.state === 'grab') return throwNow
        ? { mx: me.facing, mz: 0, sprint: false, shoot: steps % 6 < 3, action: false, special: false, grab: true }
        : { mx: 0, mz: 0, sprint: false, shoot: steps % 12 < 3, action: false, special: false, grab: true };
      if (p.id !== 0 || !h || h.team === 0) return ai.intent(p);
      defenseFrames++;
      const dx = h.x - me.x, dz = h.z - me.z, d = Math.hypot(dx, dz) || 1;
      if (humanLike) {
        if (steps % 9 === 0) { kx = Math.abs(dx) > 10 ? Math.sign(dx) : 0; kz = Math.abs(dz) > 10 ? Math.sign(dz) : 0; }
        return { mx: kx, mz: kz, sprint, shoot: false, action: false, special: false, grab: true };
      }
      return { mx: dx / d, mz: dz / d, sprint, shoot: false, action: false, special: false, grab: true };
    });
    const was = me.state;
    game.step(intents);
    if (was === 'grab' && me.state === 'toss') throws++;
    const wasGrab = was === 'grab';
    game.drainEvents();
    if (!wasGrab && me.state === 'grab') { grabs++; if (h && h.id === me.grabId) grabbedHolder = true; }
    const h2 = game.holder();
    const team = h2 ? h2.team : prevTeam;
    if (team !== prevTeam) {
      if (prevTeam === 1 && grabbedHolder && game.score[1] === scoreAt) lost++;
      if (team === 1) { poss++; scoreAt = game.score[1]; }
      grabbedHolder = false;
      prevTeam = team;
    }
    steps++;
  }
  return { grabs, throws, defenseSeconds: defenseFrames / 60, poss, lost };
}

describe('grabs in real play', () => {
  // The first version only allowed grabs while walking, so anyone holding sprint on defense
  // never got one. These play whole matches the way a person does and count what happens.
  for (const sprint of [false, true]) {
    it(`a defender ${sprint ? 'sprinting' : 'walking'} at the ball carrier gets grabs, but not on every possession`, () => {
      let grabs = 0, throws = 0;
      const per: number[] = [];
      for (let seed = 1; seed <= 6; seed++) {
        const r = defenderGrabs(seed, seed % 4, sprint);
        grabs += r.grabs; throws += r.throws; per.push(r.grabs);
      }
      // eslint-disable-next-line no-console
      console.log(`${sprint ? 'sprinting' : 'walking'} at the ball carrier: ${grabs} grabs, ${throws} throws in 6 matches (${per.join(',')})`);
      expect(grabs / 6).toBeGreaterThanOrEqual(1.5);
      expect(grabs / 6).toBeLessThan(13);
    });
  }
});

describe('grabs with human-like steering', () => {
  it('a person holding sprint and steering late with four keys still gets grabs', () => {
    const rows: string[] = [];
    let total = 0;
    for (let opp = 0; opp < 4; opp++) {
      let g = 0, t = 0;
      for (let seed = 1; seed <= 3; seed++) { const r = defenderGrabs(seed + opp * 10, opp, true, 120, true); g += r.grabs; t += r.throws; }
      total += g;
      rows.push(`${OPPONENTS[opp].team.name}: ${g} grabs, ${t} throws in 3 matches`);
    }
    // eslint-disable-next-line no-console
    console.log(`human-like sprinting defender — ${rows.join(' | ')}`);
    expect(total / 12).toBeGreaterThanOrEqual(1.5);
  });
});

describe('grabs are strong but answerable', () => {
  // The strongest thing a person can do: sprint at the ball carrier all match and throw the instant the
  // grab allows it. Before the clinch window and the longer cooldown this ended 28-56% of the other
  // team's possessions; it should stay a weapon without deciding the match.
  it('chasing the ball carrier and throwing at once takes a minority of possessions', () => {
    const rows: string[] = [];
    let poss = 0, lost = 0, grabs = 0;
    for (let opp = 0; opp < 4; opp++) {
      let p = 0, l = 0;
      for (let seed = 1; seed <= 4; seed++) { const r = defenderGrabs(seed + opp * 10, opp, true, 120, true, true); p += r.poss; l += r.lost; grabs += r.grabs; }
      poss += p; lost += l;
      rows.push(`${OPPONENTS[opp].team.name} ${Math.round(100 * l / p)}%`);
      expect(l / p).toBeLessThan(opp === 0 ? 0.45 : 0.32);
    }
    // eslint-disable-next-line no-console
    console.log(`possessions lost to a grab-and-throw — ${rows.join(' | ')} | overall ${Math.round(100 * lost / poss)}%, ${(grabs / 16).toFixed(1)} grabs a match`);
    expect(lost / poss).toBeLessThan(0.26);
    expect(grabs / 16).toBeGreaterThanOrEqual(2);
  });

  const BARE = { launchers: [], itemEvery: 0 };
  function hold() {
    const game = new Game({ home: HOME_TEAM, away: OPPONENTS[1].team, seed: 1, matchSeconds: 600, stage: BARE });
    game.phase = 'play';
    game.resetFormation(0);
    const [me, mate, d1, d2] = game.players;
    me.x = 700; me.z = 180; d1.x = 730; d1.z = 180; mate.x = 400; mate.z = 300; d2.x = 150; d2.z = 40;
    game.shotClock = 1e9;
    const step = (m: Partial<Record<number, Partial<Intent>>>) => game.step(game.players.map((p) => ({ ...NO_INTENT, ...(m[p.id] ?? {}) })));
    return { game, me, mate, d1, d2, step };
  }

  it('a grab cannot knee or throw during the clinch, and the victim can break out in that window', () => {
    const s = hold();
    s.game.giveBall(s.d2, true);
    let f = 0;
    while (s.me.state !== 'grab' && f++ < 40) s.step({ 0: { mx: 1, grab: true } });
    expect(s.me.state).toBe('grab');
    // Mashing throw from the first frame: nothing happens until the clinch is over.
    let frames = 0;
    while (s.me.state === 'grab' && frames < 60) { s.step({ 0: { mx: 1, shoot: frames % 2 === 0 } }); frames++; }
    expect(s.me.state).toBe('toss');
    expect(frames / 60).toBeGreaterThanOrEqual(GRAB_CLINCH - 0.02);

    const t = hold();
    t.game.giveBall(t.d2, true);
    f = 0;
    while (t.me.state !== 'grab' && f++ < 40) t.step({ 0: { mx: 1, grab: true } });
    // The victim reacts a fifth of a second in, while the grabber mashes throw.
    for (let i = 0; i < 30; i++) t.step({ 0: { mx: 1, shoot: i % 2 === 0 }, 2: { special: i === 12 } });
    expect(t.d1.state).not.toBe('down');
    expect(t.d1.state).not.toBe('held');
    expect(t.me.grabCd).toBeGreaterThan(GRAB_COOLDOWN - 1);
    expect(t.d1.grabCd).toBeGreaterThan(GRAB_IMMUNE - 1);
  });

  it('a held ball carrier with no breath left can still pass the ball out', () => {
    const s = hold();
    s.game.giveBall(s.d1, true);
    s.d2.x = 1100; s.d2.z = 250;
    s.d1.stamina = 0;
    let f = 0;
    while (s.me.state !== 'grab' && f++ < 40) s.step({ 0: { mx: 1, grab: true } });
    expect(s.d1.state).toBe('held');
    s.d1.stamina = 0;
    s.step({ 2: { special: true } });
    expect(s.d1.state).toBe('held'); // no breath: cannot break free
    for (let i = 0; i < 8; i++) s.step({});
    for (let i = 0; i < 6 && s.game.ball.state !== 'pass'; i++) s.step({ 2: { action: i === 0 } });
    expect(s.game.ball.state).toBe('pass');
    expect(s.d1.state).toBe('held'); // the ball got out, the body did not
    for (let i = 0; i < 60 && s.game.ball.state === 'pass'; i++) s.step({});
    expect(s.game.ball.holder).toBe(s.d2.id);
  });
});
