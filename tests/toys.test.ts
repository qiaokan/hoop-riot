import { describe, expect, it } from 'vitest';
import { AIController, AI_PARAMS, AIParams } from '../src/core/ai';
import { GRAVITY, HOOP } from '../src/core/constants';
import { Game, GameEventType, Intent, NO_INTENT, Player } from '../src/core/game';
import { COURTS, CourtId, HOME_TEAM, OPPONENTS, StageDef } from '../src/core/teams';

const BARE: StageDef = { launchers: [], itemEvery: 0 };

/** Team 0 (me, mate) attacks the right hoop. The ball starts with an opponent parked in a far corner, and the shot clock is off. */
function scene(stage: StageDef = BARE, seed = 1) {
  const game = new Game({ home: HOME_TEAM, away: OPPONENTS[1].team, seed, matchSeconds: 600, stage });
  game.phase = 'play';
  game.resetFormation(0);
  const [me, mate, d1, d2] = game.players;
  me.x = 700; me.z = 180;
  mate.x = 200; mate.z = 320;
  d1.x = 150; d1.z = 40; d2.x = 180; d2.z = 40;
  game.giveBall(d2, true);
  game.shotClock = 1e9;
  game.drainEvents();
  const seen: GameEventType[] = [];
  const texts: string[] = [];
  return { game, me, mate, d1, d2, seen, texts };
}
type S = ReturnType<typeof scene>;

function run(s: S, frames: number, intentFor: (frame: number) => Partial<Record<number, Partial<Intent>>> = () => ({}), until?: () => boolean) {
  for (let f = 0; f < frames; f++) {
    const m = intentFor(f);
    s.game.step(s.game.players.map((p) => ({ ...NO_INTENT, ...(m[p.id] ?? {}) })));
    for (const e of s.game.drainEvents()) { s.seen.push(e.type); if (e.text) s.texts.push(e.text); }
    if (until?.()) return f;
  }
  return frames;
}

function looseBall(s: S, x: number, y: number, z: number, vx = 0) {
  const b = s.game.ball;
  b.state = 'loose'; b.holder = null; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = 0; b.vz = 0; b.shot = undefined; b.pass = undefined;
}

function give(s: S, p: Player, kind: Parameters<Game['toys']['makeItem']>[0]) {
  s.game.items.push(s.game.toys.makeItem(kind, p.x, 0, p.z));
  run(s, 2);
  return s.game.heldItem(p)!;
}

describe('items', () => {
  it('a bomb lights when picked up and blows up whoever it is thrown at', () => {
    const s = scene();
    s.d1.x = 950; s.d1.z = 180;
    const bomb = give(s, s.me, 'bomb');
    expect(bomb.kind).toBe('bomb');
    expect(bomb.fuse).toBeGreaterThan(3);
    run(s, 90, (f) => ({ 0: { action: f === 0, face: 1 } }), () => s.d1.state === 'down');
    expect(s.seen).toContain('boom');
    expect(s.d1.state).toBe('down');
    expect(s.d1.y + Math.abs(s.d1.vy)).toBeGreaterThan(0); // launched, not just tipped over
    expect(s.game.items.length).toBe(0);
    expect(s.game.stats[0].kos).toBe(1);
  });

  it('a bomb held too long goes off in your hands, and nobody is credited', () => {
    const s = scene();
    give(s, s.me, 'bomb');
    run(s, 60 * 4, () => ({}), () => s.me.state === 'down');
    expect(s.me.state).toBe('down');
    expect(s.game.envKos).toBe(1);
    expect(s.game.stats[1].kos).toBe(0);
  });

  it('a blast flings the ball and sets off other bombs', () => {
    const s = scene();
    looseBall(s, 760, 5, 180);
    const a = s.game.toys.makeItem('bomb', 900, 0, 180);
    s.game.items.push(a);
    s.me.x = 400;
    s.game.toys.blast(800, 0, 180, 105, null, null);
    expect(s.game.ball.vy).toBeGreaterThan(300);
    expect(a.fuse).toBeGreaterThanOrEqual(0);
    run(s, 30);
    expect(s.seen.filter((e) => e === 'boom').length).toBe(2);
  });

  it('a bat sends an opponent flying much further than a punch', () => {
    const s = scene();
    s.d1.x = 750; s.d1.z = 180;
    give(s, s.me, 'bat');
    run(s, 30, (f) => ({ 0: { action: f === 0, face: 1 } }), () => s.d1.state === 'down');
    expect(s.d1.state).toBe('down');
    expect(s.d1.vx).toBeGreaterThan(400);
    expect(s.d1.downBy).toBe(0);
  });

  it('a bat breaks after three swings', () => {
    const s = scene();
    give(s, s.me, 'bat');
    for (let i = 0; i < 3; i++) run(s, 40, (f) => ({ 0: { action: f === 0 } }));
    expect(s.game.heldItem(s.me)).toBeNull();
  });

  it('batting a loose ball is a line drive at the hoop that can score from anywhere', () => {
    let scored = 0, drives = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = scene(BARE, seed);
      s.mate.state = 'down'; s.mate.t = -99; // keep the teammate out of it
      give(s, s.me, 'bat');
      looseBall(s, 750, 30, 180);
      run(s, 240, (f) => ({ 0: { action: f === 0, face: 1 } }), () => s.game.score[0] > 0);
      if (s.seen.includes('crack')) drives++;
      if (s.game.score[0] > 0) { scored++; expect(s.game.score[0]).toBe(3); }
    }
    expect(drives).toBe(12);
    expect(scored).toBeGreaterThan(2);
    expect(scored).toBeLessThan(12);
  });

  it('a thrown banana lies in wait and sends a runner sliding', () => {
    const s = scene();
    give(s, s.me, 'banana');
    run(s, 80, (f) => ({ 0: { action: f === 0, face: 1 } }));
    const peel = s.game.items[0];
    expect(peel.armed).toBe(true);
    s.d1.x = peel.x + 70; s.d1.z = peel.z;
    run(s, 60, () => ({ 2: { mx: -1 } }), () => s.d1.state === 'down');
    expect(s.d1.state).toBe('down');
    expect(s.seen).toContain('slip');
    expect(s.game.items.length).toBe(0);
  });

  it('a hammer slam launches everyone nearby and pops the ball up', () => {
    const s = scene();
    s.d1.x = 770; s.d1.z = 180; s.d2.x = 620; s.d2.z = 200;
    looseBall(s, 760, 5, 240);
    give(s, s.me, 'hammer');
    run(s, 30, (f) => ({ 0: { action: f === 0 } }), () => s.d1.state === 'down' && s.d2.state === 'down');
    expect(s.d1.state).toBe('down');
    expect(s.d2.state).toBe('down');
    expect(s.game.ball.y).toBeGreaterThan(5);
  });

  it('a fire extinguisher shoves an opponent back', () => {
    const s = scene();
    s.d1.x = 800; s.d1.z = 180;
    give(s, s.me, 'ext');
    run(s, 60, (f) => ({ 0: { action: f === 0, face: 1 } }));
    expect(s.d1.x).toBeGreaterThan(900);
    expect(s.d1.state).not.toBe('down'); // shoved, not hurt
    expect(s.seen).toContain('spray');
  });

  it('a magnet pulls a loose ball to the player', () => {
    const s = scene();
    looseBall(s, 900, 5, 180);
    s.game.items.push(s.game.toys.makeItem('magnet', s.me.x, 0, s.me.z));
    run(s, 240, () => ({}), () => s.game.ball.holder === 0);
    expect(s.me.magnetT).toBeGreaterThan(0);
    expect(s.game.ball.holder).toBe(0);
  });

  it('spring shoes turn every jump into a launch', () => {
    const peak = (shoes: boolean) => {
      const s = scene();
      if (shoes) s.game.items.push(s.game.toys.makeItem('shoes', s.me.x, 0, s.me.z));
      run(s, 2);
      let top = 0;
      run(s, 90, (f) => ({ 0: { shoot: f === 0 } }), () => { top = Math.max(top, s.me.y); return false; });
      return top;
    };
    expect(peak(true)).toBeGreaterThan(peak(false) * 1.7);
  });

  it('a thrown item can be caught with a well-timed swing, and not otherwise', () => {
    const attempt = (press: number) => {
      const s = scene();
      s.d1.x = 1000; s.d1.z = 180; s.d1.facing = -1;
      give(s, s.d1, 'crate');
      run(s, 60, (f) => ({ 2: { action: f === 0, face: -1 }, 0: { action: f === press, face: 1 } }));
      return { caught: s.texts.includes('CAUGHT!'), holding: s.game.heldItem(s.me)?.kind, down: s.seen.includes('ko') };
    };
    const results = Array.from({ length: 30 }, (_, f) => attempt(f));
    const good = results.filter((r) => r.caught);
    expect(good.length).toBeGreaterThan(2);
    expect(good.length).toBeLessThan(15);
    expect(good.every((r) => r.holding === 'crate' && !r.down)).toBe(true);
    expect(results[0].down).toBe(true); // far too early: it hits
  });
});

describe('new mechanics', () => {
  it('a punch knocks a loose ball away, and the ball staggers whoever it hits', () => {
    const s = scene();
    looseBall(s, 730, 30, 180);
    s.d1.x = 840; s.d1.z = 180;
    run(s, 40, (f) => ({ 0: { action: f === 0, face: 1 } }), () => s.d1.state === 'stun');
    expect(s.d1.state).toBe('stun');
    expect(s.game.ball.vx).toBeLessThan(0); // came back off them
  });

  it('a body in the air can be juggled twice, no more', () => {
    const s = scene();
    s.d1.x = 735; s.d1.z = 180;
    s.game.knockDown(s.d1, 1, 0, 0, 500);
    // Hit them on the way up, then again each time they come back down into reach.
    let last = false;
    for (let f = 0; f < 300; f++) {
      const falling = s.me.state === 'move' && s.d1.state === 'down' && s.d1.vy < 0 && s.d1.y > 25 && s.d1.y < 80;
      const press: boolean = (f === 3 || (f > 10 && falling)) && !last;
      last = press;
      run(s, 1, () => ({ 0: { action: press, face: 1 } }));
      s.me.x = s.d1.x - 30; // stay under them
      if (s.d1.state !== 'down') break;
    }
    expect(s.texts).toContain('JUGGLE!');
    expect(s.texts).toContain('JUGGLE x2!');
    expect(s.d1.juggles).toBe(2);
    expect(s.texts.filter((t) => t.startsWith('JUGGLE')).length).toBe(2);
  });

  it('up + action in a grab throws the victim through the hoop for a point', () => {
    const s = scene();
    s.me.x = 1250; s.me.z = 180;
    s.d1.x = 1276; s.d1.z = 180;
    run(s, 20, () => ({ 0: { mx: 1, grab: true } }), () => s.me.state === 'grab');
    expect(s.me.state).toBe('grab');
    run(s, 120, (f) => ({ 0: { mz: -1, action: f === 8 } }), () => s.game.score[0] > 0);
    expect(s.texts).toContain('BODY DUNK! +1');
    expect(s.game.score).toEqual([1, 0]);
    expect(s.game.lastScorer).toBe(0);
  });

  it('a hoop throw from far out is a gamble', () => {
    let made = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = scene(BARE, seed);
      s.me.x = 1000; s.me.z = 180;
      s.d1.x = 1026; s.d1.z = 180;
      run(s, 20, () => ({ 0: { mx: 1, grab: true } }), () => s.me.state === 'grab');
      run(s, 150, (f) => ({ 0: { mz: -1, action: f === 8 } }), () => s.game.score[0] > 0);
      made += s.game.score[0];
    }
    expect(made).toBeGreaterThan(1);
    expect(made).toBeLessThan(17);
  });

  it('jumping next to a teammate who is standing still gets you boosted', () => {
    const s = scene();
    s.mate.x = 724; s.mate.z = 180;
    s.game.giveBall(s.me, true);
    run(s, 2, (f) => ({ 0: { shoot: f === 0 } }));
    expect(s.texts).toContain('BOOST!');
    expect(s.me.launched).toBe(true);
    let top = 0;
    run(s, 60, () => ({}), () => { top = Math.max(top, s.me.y); return false; });
    expect(top).toBeGreaterThan(150);
  });

  it('dunks break the rim; a broken rim cannot be scored on until it is fixed', () => {
    const s = scene();
    const rim = s.game.rims.find((r) => r.x === HOOP.rightX && !r.high)!;
    for (let i = 0; i < 6; i++) {
      s.me.x = 1290; s.me.z = 180; s.me.y = 0; s.me.state = 'move'; s.me.vx = s.me.vy = 0;
      s.game.giveBall(s.me, true);
      s.game.startDunk(s.me);
      run(s, 90);
    }
    expect(s.game.score[0]).toBe(12);
    expect(s.texts).toContain('RIM BROKEN!');
    expect(rim.brokenT).toBeGreaterThan(0);
    // The next dunk finds nothing to dunk on.
    s.me.x = 1290; s.me.z = 180; s.me.y = 0; s.me.state = 'move';
    s.game.giveBall(s.me, true);
    s.game.startDunk(s.me);
    run(s, 90);
    expect(s.game.score[0]).toBe(12);
    expect(s.texts).toContain('NO RIM!');
    // A perfect shot drops straight through the gap.
    s.me.x = 1150; s.me.y = 0; s.me.state = 'move'; s.me.facing = 1;
    s.game.giveBall(s.me, true);
    s.game.launchShot(s.me, 0, 2, false, false, false);
    run(s, 120);
    expect(s.game.score[0]).toBe(12);
    run(s, 60 * 6);
    expect(rim.brokenT).toBe(0);
    expect(s.seen).toContain('rimfix');
    s.me.x = 1150; s.me.y = 0; s.me.state = 'move'; s.me.facing = 1; s.me.pickupCd = 0;
    s.game.giveBall(s.me, true);
    s.game.launchShot(s.me, 0, 2, false, false, false);
    run(s, 120, () => ({}), () => s.game.score[0] > 12);
    expect(s.game.score[0]).toBe(14);
  });
});

describe('hazards', () => {
  it('a car runs down whoever is in its lane, after a warning', () => {
    const s = scene({ ...BARE, hazards: ['car'] });
    s.game.toys.traffic = { kind: 'car', lane: 180, dir: 1, x: -120, warn: 0.5 };
    s.d1.x = 900; s.d1.z = 300;
    run(s, 25);
    expect(s.me.state).toBe('move'); // still only a warning
    run(s, 200, () => ({}), () => s.me.state === 'down');
    expect(s.me.state).toBe('down');
    expect(s.d1.state).toBe('move');
    expect(s.game.envKos).toBe(1);
    expect(s.game.stats[1].kos).toBe(0);
    run(s, 300);
    expect(s.game.toys.traffic).toBeNull();
  });

  it('traffic turns up on its own', () => {
    const s = scene({ ...BARE, hazards: ['car', 'dogs'] });
    run(s, 60 * 40);
    expect(s.seen).toContain('warn');
  });

  it('the wrecking ball clears the middle lane', () => {
    const s = scene({ ...BARE, hazards: ['wrecker'] });
    s.me.x = 750; s.me.z = 180;
    s.d1.x = 750; s.d1.z = 300;
    run(s, 60 * 5, () => ({}), () => s.me.state === 'down');
    expect(s.me.state).toBe('down');
    expect(s.d1.state).toBe('move');
  });

  it('pinball bumpers kick players and the ball away', () => {
    const s = scene({ ...BARE, hazards: ['bumpers'] });
    s.me.x = 500; s.me.z = 180;
    let minVx = 0;
    run(s, 60, () => ({ 0: { mx: 1 } }), () => { minVx = Math.min(minVx, s.me.vx); return false; });
    expect(s.seen).toContain('bump');
    expect(minVx).toBeLessThan(-150);
    looseBall(s, 880, 8, 180, 300);
    let back = false;
    run(s, 60, () => ({}), () => { back ||= s.game.ball.vx < -100; return back; });
    expect(back).toBe(true);
  });

  it('a gust of wind carries the ball', () => {
    const land = (wind: boolean) => {
      const s = scene({ ...BARE, hazards: ['wind'] });
      if (wind) s.game.toys.gust = { dir: 1, t: 2 };
      looseBall(s, 900, 220, 300);
      run(s, 25);
      return s.game.ball.x;
    };
    expect(land(true)).toBeGreaterThan(land(false) + 25);
  });

  it('a catapult flings you toward the hoop you attack', () => {
    const s = scene({ launchers: [{ x: 700, z: 180, kick: 300 }], itemEvery: 0 });
    s.game.giveBall(s.me, true);
    run(s, 2);
    expect(s.me.launched).toBe(true);
    run(s, 120, () => ({}), () => s.me.y === 0);
    expect(s.me.x).toBeGreaterThan(900);
  });
});

describe('events', () => {
  it('low gravity makes everything float, then wears off', () => {
    const peak = (low: boolean) => {
      const s = scene();
      if (low) s.game.toys.startEvent('lowgrav');
      run(s, 1);
      let top = 0;
      run(s, 200, (f) => ({ 0: { shoot: f === 0 } }), () => { top = Math.max(top, s.me.y); return false; });
      return { top, s };
    };
    const low = peak(true);
    expect(low.top).toBeGreaterThan(peak(false).top * 1.8);
    run(low.s, 60 * 12);
    expect(low.s.game.grav).toBe(GRAVITY);
    expect(low.s.game.toys.event).toBeNull();
  });

  it('a shot still finds the hoop in low gravity', () => {
    const s = scene();
    s.game.toys.startEvent('lowgrav');
    run(s, 1);
    s.me.x = 1100; s.me.facing = 1;
    s.game.giveBall(s.me, true);
    s.game.launchShot(s.me, 0, 2, false, false, false);
    run(s, 240, () => ({}), () => s.game.score[0] > 0);
    expect(s.game.score[0]).toBe(2);
  });

  it('rain makes the floor slippery', () => {
    const slide = (rain: boolean) => {
      const s = scene();
      if (rain) s.game.toys.startEvent('rain');
      run(s, 90, () => ({ 0: { mx: 1 } }));
      const x0 = s.me.x;
      run(s, 40);
      return s.me.x - x0;
    };
    expect(slide(true)).toBeGreaterThan(slide(false) * 3);
  });

  it('the iron ball floors whoever it hits', () => {
    const s = scene();
    s.game.toys.startEvent('ironball');
    s.d1.x = 900; s.d1.z = 180;
    looseBall(s, 800, 40, 180, 520);
    s.game.ball.lastTeam = 0;
    run(s, 30, () => ({}), () => s.d1.state === 'down');
    expect(s.d1.state).toBe('down');
  });

  it('the bomb ball goes off every few seconds, wherever it is', () => {
    const s = scene();
    s.game.giveBall(s.me, true);
    s.game.toys.startEvent('bombball');
    run(s, 60 * 7, () => ({}), () => s.me.state === 'down');
    expect(s.seen).toContain('boom');
    expect(s.me.state).toBe('down');
    expect(s.game.ball.holder).toBeNull();
  });

  it('the giant ball is bigger and easier to grab', () => {
    const s = scene();
    s.game.toys.startEvent('bigball');
    run(s, 1);
    expect(s.game.ballR).toBeGreaterThan(12);
    looseBall(s, s.me.x + 34, 5, s.me.z);
    run(s, 3);
    expect(s.game.ball.holder).toBe(0);
  });

  it('a UFO abducts the ball carrier and drops them somewhere else', () => {
    const s = scene();
    s.game.giveBall(s.me, true);
    s.game.toys.startEvent('ufo');
    run(s, 60 * 4, () => ({}), () => s.me.state === 'beam');
    expect(s.me.state).toBe('beam');
    expect(s.game.ball.holder).toBeNull();
    const x0 = s.me.x, z0 = s.me.z;
    run(s, 60 * 6, () => ({}), () => s.me.state === 'down');
    expect(s.me.state).toBe('down');
    expect(Math.hypot(s.me.x - x0, s.me.z - z0)).toBeGreaterThan(60);
    run(s, 60 * 4, () => ({}), () => s.me.state === 'move');
    expect(s.me.state).toBe('move');
  });

  it('events start on their own on a court that has them, one at a time', () => {
    const s = scene({ ...BARE, events: ['lowgrav', 'rain'] });
    run(s, 60 * 60);
    expect(s.seen.filter((e) => e === 'event').length).toBeGreaterThan(1);
    expect(s.seen.filter((e) => e === 'event').length - s.seen.filter((e) => e === 'eventend').length).toBeLessThanOrEqual(1);
  });
});

describe('rides', () => {
  const withRide = (kind: 'board' | 'tank' | 'heli') => {
    const s = scene({ ...BARE, rides: [{ kind, x: 700, z: 180 }] });
    s.me.x = 690;
    run(s, 3, () => ({ 0: { mx: 1 } }));
    return { s, r: s.game.toys.rides[0] };
  };

  it('a skateboard is faster than running and runs people over', () => {
    const { s, r } = withRide('board');
    expect(s.me.state).toBe('ride');
    expect(r.rider).toBe(0);
    s.d1.x = 1000; s.d1.z = 180;
    let top = 0;
    run(s, 120, () => ({ 0: { mx: 1 } }), () => { top = Math.max(top, s.me.vx); return s.d1.state === 'down'; });
    expect(top).toBeGreaterThan(300);
    expect(s.d1.state).toBe('down');
    run(s, 2, (f) => ({ 0: { shoot: f === 0 } }));
    expect(s.me.state).toBe('jump');
    expect(r.rider).toBeNull();
  });

  it('a ride runs out and comes back later', () => {
    const { s, r } = withRide('board');
    run(s, 60 * 13);
    expect(s.me.state).not.toBe('ride');
    expect(r.respawn).toBeGreaterThan(0);
    s.me.x = 300;
    run(s, 60 * 21);
    expect(r.respawn).toBe(0);
    expect(r.x).toBe(700);
  });

  it('a tank shrugs off punches, and falls apart after enough heavy hits', () => {
    const { s, r } = withRide('tank');
    expect(s.me.state).toBe('ride');
    s.game.giveBall(s.mate, true);
    s.d1.x = s.me.x + 40; s.d1.z = 180; s.d1.facing = -1;
    run(s, 30, (f) => ({ 2: { action: f === 0, face: -1 } }));
    expect(s.me.state).toBe('ride');
    expect(s.seen).toContain('clang');
    expect(r.hp).toBe(4);
    for (let i = 0; i < 2; i++) s.game.toys.blast(r.x + 30, 0, r.z, 80, 1, null);
    expect(s.seen.length).toBeGreaterThan(0);
    run(s, 2);
    expect(r.rider).toBeNull();
    expect(r.respawn).toBeGreaterThan(0);
    expect(s.me.state).toBe('down');
  });

  it('a tank fires shells that explode, and fires the ball at the hoop when loaded with it', () => {
    const { s } = withRide('tank');
    s.d1.x = 1050; s.d1.z = 180;
    run(s, 60, (f) => ({ 0: { action: f === 0, mx: 0.2 } }), () => s.d1.state === 'down');
    expect(s.d1.state).toBe('down');
    expect(s.seen).toContain('boom');
    run(s, 90);
    s.game.giveBall(s.me, true);
    run(s, 3, (f) => ({ 0: { action: f === 0, mx: 0.2 } }));
    expect(s.texts).toContain('CANNON SHOT!');
    expect(s.game.ball.state).toBe('shot');
    expect(s.game.ball.vx).toBeGreaterThan(0);
  });

  it('a helicopter flies over everyone and drops bombs', () => {
    const { s, r } = withRide('heli');
    run(s, 60);
    expect(s.me.y).toBeGreaterThan(140);
    s.d1.x = r.x; s.d1.z = r.z;
    run(s, 120, (f) => ({ 0: { action: f === 0 } }), () => s.d1.state === 'down');
    expect(s.d1.state).toBe('down');
    expect(s.me.state).toBe('ride'); // too high for its own blast
  });

  it('bailing out of the helicopter with the ball over the rim is a sky dunk', () => {
    const { s, r } = withRide('heli');
    s.game.giveBall(s.me, true);
    run(s, 60);
    r.x = 1260; r.z = 180;
    run(s, 2);
    run(s, 90, (f) => ({ 0: { shoot: f === 0 } }), () => s.game.score[0] > 0);
    expect(s.texts).toContain('SKY DUNK!');
    expect(s.game.score[0]).toBe(3);
  });
});

describe('whole matches with every toy switched on', () => {
  const totals: Partial<Record<GameEventType, number>> = {};
  for (const court of Object.keys(COURTS) as CourtId[]) {
    for (const seed of [11, 12]) {
      it(`plays through on ${court} (seed ${seed})`, () => {
        const game = new Game({ home: HOME_TEAM, away: OPPONENTS[2].team, seed, matchSeconds: 150, stage: COURTS[court].stage });
        const params = new Map<number, AIParams>();
        for (const p of game.players) params.set(p.id, AI_PARAMS.normal);
        const ai = new AIController(game, params, seed);
        const counts: Partial<Record<GameEventType, number>> = {};
        let steps = 0, ridden = 0;
        while (game.phase !== 'end' && steps < 60 * 400) {
          game.step(game.players.map((p) => ai.intent(p)));
          for (const e of game.drainEvents()) { counts[e.type] = (counts[e.type] ?? 0) + 1; totals[e.type] = (totals[e.type] ?? 0) + 1; }
          for (const p of game.players) {
            for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) expect(Number.isFinite(v)).toBe(true);
            if (p.state === 'ride') ridden++;
          }
          const b = game.ball;
          expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z) && Number.isFinite(b.vx)).toBe(true);
          for (const it of game.items) expect(Number.isFinite(it.x) && Number.isFinite(it.y)).toBe(true);
          steps++;
        }
        const s = game.stats;
        // eslint-disable-next-line no-console
        console.log(`toys ${court} ${seed}: ${game.score[0]}-${game.score[1]} FG ${s[0].fgm}/${s[0].fga} ${s[1].fgm}/${s[1].fga}`,
          `KOs ${s[0].kos}/${s[1].kos} court ${game.envKos} ride ${(ridden / 60).toFixed(0)}s`,
          Object.entries(counts).filter(([k]) => ['boom', 'item', 'mount', 'event', 'warn', 'bump', 'gust', 'beam', 'crack', 'bodydunk', 'juggle', 'rimbreak', 'slip', 'spray', 'boost', 'clang'].includes(k)).map(([k, v]) => `${k} ${v}`).join(' '));
        expect(game.phase).toBe('end');
        expect(game.score[0] + game.score[1]).toBeGreaterThan(10);
        expect(game.envKos).toBeLessThan(40);
      });
    }
  }

  it('the computer actually uses the toys', () => {
    expect(totals.item ?? 0).toBeGreaterThan(20);
    expect(totals.boom ?? 0).toBeGreaterThan(5);
    expect(totals.mount ?? 0).toBeGreaterThan(5);
    expect(totals.event ?? 0).toBeGreaterThan(10);
    expect(totals.warn ?? 0).toBeGreaterThan(2);
    expect(totals.bump ?? 0).toBeGreaterThan(5);
    expect(totals.gust ?? 0).toBeGreaterThan(5);
  });
});
