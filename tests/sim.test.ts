import { describe, expect, it } from 'vitest';
import { AIController, AI_PARAMS, ACCURACY, AIParams } from '../src/core/ai';
import { COURT } from '../src/core/constants';
import { Game, GameEventType } from '../src/core/game';
import { HOME_TEAM, OPPONENTS } from '../src/core/teams';

function runMatch(seed: number, oppIndex: number, seconds = 120) {
  const opp = OPPONENTS[oppIndex];
  const game = new Game({ home: HOME_TEAM, away: opp.team, seed, matchSeconds: seconds, accuracy: [1, ACCURACY[opp.difficulty]] });
  const params = new Map<number, AIParams>();
  for (const p of game.players) params.set(p.id, p.team === 0 ? AI_PARAMS.normal : AI_PARAMS[opp.difficulty]);
  const ai = new AIController(game, params, seed);
  const counts: Partial<Record<GameEventType, number>> = {};
  let steps = 0;
  let maxHeld = 0;
  let heldFor = 0;
  while (game.phase !== 'end' && steps < 60 * (seconds + 120)) {
    game.step(game.players.map((p) => ai.intent(p)));
    for (const e of game.drainEvents()) counts[e.type] = (counts[e.type] ?? 0) + 1;
    for (const p of game.players) {
      for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) expect(Number.isFinite(v)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(COURT.minX - 1);
      expect(p.x).toBeLessThanOrEqual(COURT.maxX + 1);
    }
    const b = game.ball;
    expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)).toBe(true);
    if (b.state === 'loose') { heldFor += 1; maxHeld = Math.max(maxHeld, heldFor); } else heldFor = 0;
    steps++;
  }
  return { game, counts, steps, maxLooseSteps: maxHeld };
}

describe('AI vs AI simulation', () => {
  for (const [seed, opp] of [[1, 0], [2, 1], [3, 2], [4, 1]] as const) {
    it(`finishes a match cleanly (seed ${seed}, opponent ${opp})`, () => {
      const { game, counts, maxLooseSteps } = runMatch(seed, opp);
      const [a, b] = game.score;
      const s = game.stats;
      // eslint-disable-next-line no-console
      console.log(`seed ${seed} vs ${OPPONENTS[opp].team.name}: ${a}-${b}`,
        `FG ${s[0].fgm}/${s[0].fga} vs ${s[1].fgm}/${s[1].fga}`,
        `dunks ${s[0].dunks}/${s[1].dunks} KOs ${s[0].kos}/${s[1].kos} blocks ${s[0].blocks}/${s[1].blocks} steals ${s[0].steals}/${s[1].steals}`,
        `violations ${counts.violation ?? 0} passes ${counts.pass ?? 0} specials ${(counts.special ?? 0) + (counts.shockwave ?? 0)} maxLoose ${(maxLooseSteps / 60).toFixed(1)}s`);
      expect(game.phase).toBe('end');
      expect(game.winner).not.toBeNull();
      expect(a + b).toBeGreaterThan(12);
      expect((counts.hit ?? 0) + (counts.ko ?? 0)).toBeGreaterThan(0);
      expect(counts.pass ?? 0).toBeGreaterThan(0);
      expect(maxLooseSteps).toBeLessThan(60 * 12);
      const fga = s[0].fga + s[1].fga, fgm = s[0].fgm + s[1].fgm;
      expect(fgm / fga).toBeGreaterThan(0.25);
      expect(fgm / fga).toBeLessThan(0.85);
    });
  }

  it('is deterministic for a given seed', () => {
    const a = runMatch(9, 1, 40).game.score.join('-');
    const b = runMatch(9, 1, 40).game.score.join('-');
    expect(a).toBe(b);
  });
});
