import { describe, expect, it } from 'vitest';
import { AIController, AI_PARAMS, ACCURACY, AIParams } from '../src/core/ai';
import { Game, Intent } from '../src/core/game';
import { COURTS, HOME_TEAM, OPPONENTS } from '../src/core/teams';

/**
 * Plays a match with player 0 driven the way a person plays defense: when the other team has
 * the ball, head straight for the ball carrier. Counts how many grabs that produces.
 */
export function defenderGrabs(seed: number, oppIndex: number, sprint: boolean, seconds = 120, humanLike = false) {
  const opp = OPPONENTS[oppIndex];
  const game = new Game({ home: HOME_TEAM, away: opp.team, seed, matchSeconds: seconds, accuracy: [1, ACCURACY[opp.difficulty]], stage: COURTS[opp.court].stage });
  const params = new Map<number, AIParams>();
  for (const p of game.players) params.set(p.id, p.team === 0 ? AI_PARAMS.normal : AI_PARAMS[opp.difficulty]);
  const ai = new AIController(game, params, seed);
  let grabs = 0, throws = 0, defenseFrames = 0, steps = 0;
  // A person steers with four keys and reacts late: the direction only updates every 9 frames.
  let kx = 0, kz = 0;
  while (game.phase !== 'end' && steps < 60 * (seconds + 60)) {
    const me = game.players[0];
    const h = game.holder();
    const intents = game.players.map((p): Intent => {
      // Holding someone: knee, knee, throw.
      if (p.id === 0 && me.state === 'grab') return { mx: 0, mz: 0, sprint: false, shoot: false, action: steps % 12 < 3, special: false, grab: true };
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
    if (!wasGrab && me.state === 'grab') grabs++;
    steps++;
  }
  return { grabs, throws, defenseSeconds: defenseFrames / 60 };
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
