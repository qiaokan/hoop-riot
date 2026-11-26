import { describe, expect, it } from 'vitest';
import { AIController, AI_PARAMS, ACCURACY, AIParams } from '../src/core/ai';
import { COURT, HIGH_MIN_Y, HOOP, attackHoopX } from '../src/core/constants';
import { Game, GameEventType, Intent, NO_INTENT } from '../src/core/game';
import { COURTS, HOME_TEAM, OPPONENTS, StageDef, applyUpgrades } from '../src/core/teams';

function runMatch(seed: number, oppIndex: number, seconds = 120) {
  const opp = OPPONENTS[oppIndex];
  const game = new Game({ home: HOME_TEAM, away: opp.team, seed, matchSeconds: seconds, accuracy: [1, ACCURACY[opp.difficulty]], stage: COURTS[opp.court].stage });
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
  const totals = { fgm: 0, fga: 0, kos: 0, games: 0 };
  for (const [seed, opp] of [[1, 0], [2, 1], [3, 2], [4, 3], [5, 0], [6, 3], [7, 2], [8, 1]] as const) {
    it(`finishes a match cleanly (seed ${seed}, opponent ${opp})`, () => {
      const { game, counts, maxLooseSteps, oops } = runMatch(seed, opp);
      const [a, b] = game.score;
      const s = game.stats;
      // eslint-disable-next-line no-console
      console.log(`seed ${seed} vs ${OPPONENTS[opp].team.name}: ${a}-${b}`,
        `FG ${s[0].fgm}/${s[0].fga} vs ${s[1].fgm}/${s[1].fga}`,
        `dunks ${s[0].dunks}/${s[1].dunks} KOs ${s[0].kos}/${s[1].kos} blocks ${s[0].blocks}/${s[1].blocks} steals ${s[0].steals}/${s[1].steals}`,
        `viol ${counts.violation ?? 0} passes ${counts.pass ?? 0} lobs ${counts.oop ?? 0} oops ${oops} tackles ${counts.tackle ?? 0} dodges ${counts.spin ?? 0}`,
        `launches ${counts.launch ?? 0} throws ${counts.throw ?? 0} specials c${counts.special ?? 0} m${counts.megaslam ?? 0} s${counts.shockwave ?? 0} b${counts.blitz ?? 0} maxLoose ${(maxLooseSteps / 60).toFixed(1)}s`);
      expect(game.phase).toBe('end');
      expect(game.winner).not.toBeNull();
      expect(a + b).toBeGreaterThan(12);
      expect((counts.hit ?? 0) + (counts.ko ?? 0)).toBeGreaterThan(0);
      expect(counts.pass ?? 0).toBeGreaterThan(0);
      expect(maxLooseSteps).toBeLessThan(60 * 12);
      const fga = s[0].fga + s[1].fga, fgm = s[0].fgm + s[1].fgm;
      expect(fgm / fga).toBeGreaterThan(0.25);
      totals.fgm += fgm; totals.fga += fga; totals.kos += s[0].kos + s[1].kos; totals.games++;
    });
  }

  it('keeps shooting and knockdowns in a sane range across all matches', () => {
    expect(totals.games).toBe(8);
    const pct = totals.fgm / totals.fga;
    // eslint-disable-next-line no-console
    console.log(`overall FG ${(pct * 100).toFixed(0)}%  knockdowns per team per match ${(totals.kos / totals.games / 2).toFixed(1)}`);
    expect(pct).toBeGreaterThan(0.45);
    expect(pct).toBeLessThan(0.93);
    expect(totals.kos / totals.games / 2).toBeLessThan(16);
  });

  it('is deterministic for a given seed', () => {
    const a = runMatch(9, 1, 40).game.score.join('-');
    const b = runMatch(9, 1, 40).game.score.join('-');
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------- mechanics

/** A live game with team 0 on offense, player 0 holding the ball, and everyone else parked far away. */
const BARE: StageDef = { launchers: [], itemEvery: 0 };

function scene(seed = 1, stage: StageDef = BARE, home = HOME_TEAM) {
  const game = new Game({ home, away: OPPONENTS[1].team, seed, matchSeconds: 600, stage });
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

  it('a launch pad throws a player high into the air', () => {
    const { game, me } = scene(1, { launchers: [{ x: 700, z: 180 }], itemEvery: 0 });
    me.x = 700; me.z = 180;
    let top = 0;
    run(game, 80, () => ({}), () => { top = Math.max(top, me.y); return false; });
    expect(top).toBeGreaterThan(HIGH_MIN_Y + 50);
    expect(game.padTimers[0]).toBeGreaterThan(0);
  });

  it('an air shot from a launch pad goes in the upper hoop for a bonus point', () => {
    const hx = attackHoopX(0);
    const { game, me } = scene(1, { launchers: [{ x: hx - 260, z: 95 }], itemEvery: 0 });
    me.x = hx - 260; me.z = 95;
    let release = false;
    run(game, 400, (f) => {
      if (me.state === 'shoot' && me.vy <= 0) release = true;
      return { 0: { shoot: f >= 3 && !release } };
    }, () => game.score[0] > 0 || game.ball.state === 'loose');
    expect(game.score[0]).toBe(3);
  });

  it('a sky dunk off a launch pad is worth 3', () => {
    const hx = attackHoopX(0);
    const { game, me } = scene(1, { launchers: [{ x: hx - 260, z: 95 }], itemEvery: 0 });
    me.x = hx - 330; me.z = 95;
    const seen: string[] = [];
    run(game, 300, () => {
      const near = Math.hypot(me.x - hx, me.z - HOOP.z) < 200;
      return { 0: { mx: me.launched || me.state === 'dunk' ? 0 : 1, sprint: true, shoot: me.launched && near && me.y > HIGH_MIN_Y + 10 } };
    }, () => {
      for (const e of game.drainEvents()) if (e.type === 'dunk' && e.text) seen.push(e.text);
      return game.score[0] > 0;
    });
    expect(seen).toContain('SKY DUNK!');
    expect(game.score[0]).toBe(3);
  });

  it('a thrown item knocks an opponent down', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 900; d1.z = 180; d1.facing = -1;
    game.items.push({ id: 99, kind: 0, x: 900, y: 0, z: 180, vx: 0, vy: 0, state: 'ground', holder: null, team: null, spin: 0 });
    run(game, 3, () => ({}));
    expect(game.heldItem(d1)).not.toBeNull();
    let down = false;
    run(game, 60, (f) => ({ 2: { action: f === 0, face: -1 } }), () => { down ||= me.state === 'down'; return down; });
    expect(down).toBe(true);
    expect(game.items.length).toBe(0);
  });

  it('upgrades change how the game plays', () => {
    const up = applyUpgrades(HOME_TEAM, ['chin', 'shoot', 'hype']);
    expect(up.hypeRate).toBeGreaterThan(1);
    const base = scene();
    base.me.x = attackHoopX(0) - 300; base.me.z = HOOP.z;
    const tuned = scene(1, BARE, up.team);
    tuned.me.x = attackHoopX(0) - 300; tuned.me.z = HOOP.z;
    expect(tuned.game.shotWindow(tuned.me)).toBeGreaterThan(base.game.shotWindow(base.me));
    // Iron Chin: three jabs no longer floor the carrier.
    const { game, me, d1 } = tuned;
    me.x = 700;
    let hits = 0, down = false;
    run(game, 400, (f) => {
      d1.x = me.x - 30; d1.z = me.z; d1.facing = 1;
      return { 2: { action: f % 8 === 0, face: 1 } };
    }, () => {
      for (const e of game.drainEvents()) if (e.type === 'hit') hits++;
      down ||= me.state === 'down';
      return down;
    });
    expect(down).toBe(true);
    expect(hits).toBe(3);
  });

  it('three quick presses throw a jab, cross and finisher that launches the target', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 668; d1.z = 180; d1.facing = 1;
    const combos: number[] = [];
    let hits = 0, top = 0, down = false;
    run(game, 120, (f) => ({ 2: { action: f % 9 === 0 && f < 30, face: 1 } }), () => {
      if (d1.state === 'punch' && !combos.includes(d1.combo)) combos.push(d1.combo);
      for (const e of game.drainEvents()) if (e.type === 'hit') hits++;
      down ||= me.state === 'down';
      if (me.state === 'down') top = Math.max(top, me.y);
      return false;
    });
    expect(combos).toEqual([0, 1, 2]);
    expect(hits).toBe(2);
    expect(down).toBe(true);
    expect(top).toBeGreaterThan(20); // actually thrown into the air
    expect(game.ball.holder).not.toBe(0);
  });

  it('a punch that misses cannot be chained', () => {
    const { game, d1 } = scene();
    d1.x = 300; d1.z = 300;
    let maxCombo = 0;
    run(game, 60, (f) => ({ 2: { action: f % 9 === 0 } }), () => { if (d1.state === 'punch') maxCombo = Math.max(maxCombo, d1.combo); return false; });
    expect(maxCombo).toBe(0);
  });

  it('a hit freezes only the two fighters involved', () => {
    const { game, me, mate, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 668; d1.z = 180; d1.facing = 1;
    mate.x = 400; mate.z = 300;
    let frozenTogether = false, mateMoved = false;
    const x0 = mate.x;
    run(game, 20, (f) => ({ 2: { action: f === 0, face: 1 }, 1: { mx: 1 } }), () => {
      if (me.freeze > 0 && d1.freeze > 0) { frozenTogether = true; if (mate.x > x0) mateMoved = true; }
      return false;
    });
    expect(frozenTogether).toBe(true);
    expect(mateMoved).toBe(true);
  });

  it('a knocked-down body bowls over a teammate in its path', () => {
    const { game, me, mate, d1 } = scene();
    me.x = 700; me.z = 180;
    mate.x = 760; mate.z = 180;
    d1.x = 610; d1.z = 180;
    let mateDown = false;
    run(game, 80, (f) => ({ 2: { mx: 1, sprint: true, action: f === 1 } }), () => { mateDown ||= mate.state === 'down'; return mateDown; });
    expect(mateDown).toBe(true);
  });

  it('a dodge breaks out of a combo', () => {
    const { game, me, d1 } = scene();
    me.x = 700; me.z = 180;
    d1.x = 668; d1.z = 180; d1.facing = 1;
    let down = false, escaped = false;
    run(game, 120, (f) => ({ 2: { action: f % 9 === 0 && f < 30, face: 1 }, 0: { mx: 1, special: me.state === 'stun' && me.t > 0.1 } }), () => {
      down ||= me.state === 'down';
      escaped ||= me.state === 'spin';
      return false;
    });
    expect(escaped).toBe(true);
    expect(down).toBe(false);
    expect(game.ball.holder).toBe(0);
  });
});
