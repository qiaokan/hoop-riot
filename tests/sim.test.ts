import { describe, expect, it } from 'vitest';
import { AIController, AI_PARAMS, ACCURACY, AIParams } from '../src/core/ai';
import { COURT, HOOP, attackHoopX } from '../src/core/constants';
import { Game, GameEventType, Intent, NO_INTENT } from '../src/core/game';
import { HOME_TEAM, OPPONENTS } from '../src/core/teams';

function runMatch(seed: number, oppIndex: number, seconds = 120) {
  const opp = OPPONENTS[oppIndex];
  const game = new Game({ home: HOME_TEAM, away: opp.team, seed, matchSeconds: seconds, accuracy: [1, ACCURACY[opp.difficulty]] });
  const params = new Map<number, AIParams>();
  for (const p of game.players) params.set(p.id, p.team === 0 ? AI_PARAMS.normal : AI_PARAMS[opp.difficulty]);
  const ai = new AIController(game, params, seed);
  const counts: Partial<Record<GameEventType, number>> = {};
  let steps = 0;
  let maxLoose = 0;
  let looseFor = 0;
  let oops = 0;
  while (game.phase !== 'end' && steps < 60 * (seconds + 120)) {
    game.step(game.players.map((p) => ai.intent(p)));
    for (const e of game.drainEvents()) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.type === 'dunk' && e.text === 'ALLEY-OOP!') oops++;
    }
    for (const p of game.players) {
      for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) expect(Number.isFinite(v)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(COURT.minX - 1);
      expect(p.x).toBeLessThanOrEqual(COURT.maxX + 1);
    }
    const b = game.ball;
    expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)).toBe(true);
    if (b.state === 'loose') { looseFor += 1; maxLoose = Math.max(maxLoose, looseFor); } else looseFor = 0;
    steps++;
  }
  return { game, counts, steps, maxLooseSteps: maxLoose, oops };
}

describe('AI vs AI simulation', () => {
  for (const [seed, opp] of [[1, 0], [2, 1], [3, 2], [4, 1], [5, 0], [6, 2]] as const) {
    it(`finishes a match cleanly (seed ${seed}, opponent ${opp})`, () => {
      const { game, counts, maxLooseSteps, oops } = runMatch(seed, opp);
      const [a, b] = game.score;
      const s = game.stats;
      // eslint-disable-next-line no-console
      console.log(`seed ${seed} vs ${OPPONENTS[opp].team.name}: ${a}-${b}`,
        `FG ${s[0].fgm}/${s[0].fga} vs ${s[1].fgm}/${s[1].fga}`,
        `dunks ${s[0].dunks}/${s[1].dunks} KOs ${s[0].kos}/${s[1].kos} blocks ${s[0].blocks}/${s[1].blocks} steals ${s[0].steals}/${s[1].steals}`,
        `viol ${counts.violation ?? 0} passes ${counts.pass ?? 0} lobs ${counts.oop ?? 0} oops ${oops} tackles ${counts.tackle ?? 0} dodges ${counts.spin ?? 0}`,
        `specials c${counts.special ?? 0} m${counts.megaslam ?? 0} s${counts.shockwave ?? 0} b${counts.blitz ?? 0} maxLoose ${(maxLooseSteps / 60).toFixed(1)}s`);
      expect(game.phase).toBe('end');
      expect(game.winner).not.toBeNull();
      expect(a + b).toBeGreaterThan(12);
      expect((counts.hit ?? 0) + (counts.ko ?? 0)).toBeGreaterThan(0);
      expect(counts.pass ?? 0).toBeGreaterThan(0);
      expect(maxLooseSteps).toBeLessThan(60 * 12);
      const fga = s[0].fga + s[1].fga, fgm = s[0].fgm + s[1].fgm;
      expect(fgm / fga).toBeGreaterThan(0.25);
      expect(fgm / fga).toBeLessThan(0.92);
    });
  }

  it('is deterministic for a given seed', () => {
    const a = runMatch(9, 1, 40).game.score.join('-');
    const b = runMatch(9, 1, 40).game.score.join('-');
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------- mechanics

/** A live game with team 0 on offense, player 0 holding the ball, and everyone else parked far away. */
function scene(seed = 1) {
  const game = new Game({ home: HOME_TEAM, away: OPPONENTS[1].team, seed, matchSeconds: 600 });
  game.phase = 'play';
  game.resetFormation(0);
  const [me, mate, d1, d2] = game.players;
  for (const o of [d1, d2]) { o.x = 150; o.z = 60; }
  mate.x = 300; mate.z = 300;
  game.drainEvents();
  return { game, me, mate, d1, d2 };
}

function run(game: Game, frames: number, intentFor: (frame: number) => Partial<Record<number, Partial<Intent>>>, until?: () => boolean) {
  for (let f = 0; f < frames; f++) {
    const m = intentFor(f);
    game.step(game.players.map((p) => ({ ...NO_INTENT, ...(m[p.id] ?? {}) })));
    if (until?.()) return f;
  }
  return frames;
}

describe('mechanics', () => {
  it('an open jump shot released at the top of the jump always scores', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { game, me } = scene(seed);
      me.x = attackHoopX(0) - 300; me.z = HOOP.z;
      let release = false;
      run(game, 400, () => {
        if (me.state === 'shoot' && me.vy <= 0) release = true;
        return { 0: { shoot: !release } };
      }, () => game.score[0] > 0 || game.ball.state === 'loose');
      expect(game.score[0]).toBe(2);
    }
  });

  it('a badly timed shot usually misses', () => {
    let made = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { game, me } = scene(seed);
      me.x = attackHoopX(0) - 300; me.z = HOOP.z;
      // Tap: releases on the way up, far from the top.
      run(game, 400, (f) => ({ 0: { shoot: f < 3 } }), () => game.score[0] > 0 || game.ball.state === 'loose');
      if (game.score[0] > 0) made++;
    }
    expect(made).toBeLessThan(12);
  });

  it('a defender in your face shrinks the sure-make window', () => {
    const { game, me, d1 } = scene();
    me.x = attackHoopX(0) - 300; me.z = HOOP.z;
    const open = game.shotWindow(me);
    d1.x = me.x + 30; d1.z = me.z;
    expect(game.shotWindow(me)).toBeLessThan(open * 0.5);
  });

  it('a jab staggers the ball carrier but does not take the ball', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 670; d1.z = 180; d1.facing = 1;
    let stunned = false;
    run(game, 20, (f) => ({ 2: { action: f === 0, face: 1 } }), () => { stunned ||= me.state === 'stun'; return false; });
    expect(stunned).toBe(true);
    expect(game.ball.holder).toBe(0);
  });

  it('three jabs in a row knock the carrier down and free the ball', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    let down = false;
    run(game, 240, (f) => {
      d1.x = me.x - 30; d1.z = me.z; d1.facing = 1;
      return { 2: { action: f % 8 === 0, face: 1 } };
    }, () => { down ||= me.state === 'down'; return down; });
    expect(down).toBe(true);
    expect(game.ball.holder).not.toBe(0);
  });

  it('a running tackle knocks the carrier down at once', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 610; d1.z = 180;
    let down = false;
    run(game, 40, (f) => ({ 2: { mx: 1, sprint: true, action: f === 1 } }), () => { down ||= me.state === 'down'; return down; });
    expect(down).toBe(true);
    expect(game.ball.holder).not.toBe(0);
    expect(game.stats[1].steals).toBe(1);
  });

  it('a dodge slips a tackle', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 610; d1.z = 180;
    let down = false;
    run(game, 40, (f) => ({ 2: { mx: 1, sprint: true, action: f === 1 }, 0: { mz: 1, special: f === 4 } }),
      () => { down ||= me.state === 'down'; return false; });
    expect(down).toBe(false);
    expect(game.ball.holder).toBe(0);
  });

  it('an air kick knocks a jump shooter out of the air', () => {
    const { game, me, d1 } = scene();
    me.x = 900; me.z = 180;
    d1.x = 940; d1.z = 180; d1.facing = -1;
    let down = false;
    run(game, 60, (f) => ({ 0: { shoot: f >= 2 }, 2: { shoot: f === 2, action: f === 10, face: -1 } }),
      () => { down ||= me.state === 'down'; return down; });
    expect(down).toBe(true);
  });

  it('a pass to a teammate jumping at the rim becomes an alley-oop dunk', () => {
    const { game, me, mate } = scene();
    const hx = attackHoopX(0);
    me.x = hx - 350; me.z = 200;
    mate.x = hx - 90; mate.z = HOOP.z;
    const seen: string[] = [];
    run(game, 200, (f) => ({ 1: { shoot: f === 0 }, 0: { action: f === 8 } }), () => {
      for (const e of game.drainEvents()) if (e.type === 'dunk' && e.text) seen.push(e.text);
      return game.score[0] > 0;
    });
    expect(game.score[0]).toBe(2);
    expect(seen).toContain('ALLEY-OOP!');
  });

  it('a Mega Slam flies through defenders for 3 points', () => {
    const { game, mate, d1 } = scene();
    const hx = attackHoopX(0);
    // Mo (slot 1) is the slam character: hand him the ball via a pass.
    mate.x = hx - 450; mate.z = 180;
    game.players[0].x = hx - 600; game.players[0].z = 180;
    run(game, 60, (f) => ({ 0: { action: f === 0 } }), () => game.ball.holder === 1);
    expect(game.ball.holder).toBe(1);
    game.hype[0] = 1;
    d1.x = hx - 250; d1.z = 180;
    let floored = false;
    run(game, 200, (f) => ({ 1: { special: f === 0 } }), () => { floored ||= d1.state === 'down'; return game.score[0] > 0; });
    expect(game.score[0]).toBe(3);
    expect(floored).toBe(true);
    expect(game.hype[0]).toBeLessThan(1);
  });

  it('a Blitz runs down the ball carrier', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 120;
    // Jinx (team 1, slot 0) has Blitz.
    d1.x = 1000; d1.z = 300;
    game.hype[1] = 1;
    let down = false;
    run(game, 60, (f) => ({ 2: { special: f === 0 } }), () => { down ||= me.state === 'down'; return down; });
    expect(down).toBe(true);
  });
});
