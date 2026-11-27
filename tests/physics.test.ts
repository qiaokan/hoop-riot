import { describe, expect, it } from 'vitest';
import { BALL_R, DT } from '../src/core/constants';
import { Game, Intent, NO_INTENT, massOf } from '../src/core/game';
import { HOME_TEAM, OPPONENTS, StageDef } from '../src/core/teams';

const BARE: StageDef = { launchers: [], itemEvery: 0 };

function scene(seed = 1) {
  const game = new Game({ home: HOME_TEAM, away: OPPONENTS[3].team, seed, matchSeconds: 600, stage: BARE });
  game.phase = 'play';
  game.resetFormation(0);
  const [me, mate, d1, d2] = game.players;
  // Everyone out of the way in the corners; the middle of the court is empty.
  me.x = 100; me.z = 330; mate.x = 140; mate.z = 330; d1.x = 1400; d1.z = 330; d2.x = 1360; d2.z = 330;
  game.giveBall(d2, true); // hands free for everyone else
  game.shotClock = 1e9;
  game.drainEvents();
  return { game, me, mate, d1, d2 };
}
type S = ReturnType<typeof scene>;
const step = (s: S, n: number, m: (f: number) => Partial<Record<number, Partial<Intent>>> = () => ({})) => {
  for (let f = 0; f < n; f++) { const i = m(f); s.game.step(s.game.players.map((p) => ({ ...NO_INTENT, ...(i[p.id] ?? {}) }))); }
};
function loose(s: S, x: number, y: number, vx: number, vy: number, back = 0) {
  const b = s.game.ball;
  b.state = 'loose'; b.holder = null; b.shot = undefined; b.pass = undefined;
  b.x = x; b.y = y; b.z = 180; b.vx = vx; b.vy = vy; b.vz = 0;
  s.game.spinBall(back);
}

describe('ball physics', () => {
  it('a jump shot leaves the hand with backspin', () => {
    const s = scene();
    s.me.x = 1000; s.me.z = 180; s.me.facing = 1;
    s.game.giveBall(s.me, true);
    s.game.launchShot(s.me, 0, 2, false, false, false);
    // Travelling toward +x, a rolling ball would have negative wz; backspin is the opposite.
    expect(s.game.ball.vx).toBeGreaterThan(0);
    expect(s.game.ball.wz).toBeGreaterThan(8);
  });

  it('backspin brakes the bounce and topspin drives it on', () => {
    const after = (back: number) => {
      const s = scene();
      loose(s, 600, 40, 220, -300, back);
      step(s, 12);
      expect(s.game.ball.vy).toBeGreaterThan(0); // it has bounced
      return s.game.ball.vx;
    };
    const none = after(0), back = after(25), top = after(-40);
    expect(back).toBeLessThan(none - 30);
    expect(top).toBeGreaterThan(none + 30);
    // No spin at all: the floor still takes some pace off and sets the ball turning.
    expect(none).toBeLessThan(220);
    expect(none).toBeGreaterThan(100);
  });

  it('enough backspin brings the ball back', () => {
    const s = scene();
    loose(s, 600, 40, 90, -300, 45);
    step(s, 12);
    expect(s.game.ball.vx).toBeLessThan(0);
  });

  it('a ball on the floor comes to a true roll, then stops', () => {
    const s = scene();
    loose(s, 400, BALL_R - 4, 240, 0, 0);
    step(s, 20);
    const b = s.game.ball;
    expect(b.vx).toBeGreaterThan(60);
    expect(b.wz).toBeCloseTo(-b.vx / BALL_R, 1); // rolling without slipping
    let frames = 20;
    while ((Math.abs(b.vx) > 0 || Math.abs(b.vz) > 0) && frames < 900) { step(s, 1); frames++; }
    expect(b.vx).toBe(0);
    expect(b.wz).toBe(0);
    expect(frames * DT).toBeGreaterThan(1.2);
    expect(frames * DT).toBeLessThan(6);
    expect(b.x - 400).toBeGreaterThan(150);
    expect(b.x - 400).toBeLessThan(500);
  });

  it('a wet floor lets the ball skid: it keeps its pace and spins up slowly', () => {
    const dry = scene(), wet = scene();
    wet.game.toys.startEvent('rain');
    step(wet, 1);
    for (const s of [dry, wet]) { loose(s, 400, BALL_R - 4, 240, 0, 0); step(s, 30); }
    expect(wet.game.ball.vx).toBeGreaterThan(dry.game.ball.vx + 15);
  });

  it('backspin off the glass sends the ball down', () => {
    const drop = (back: number) => {
      const s = scene();
      const hp = s.game.rims.find((r) => r.x > 750 && !r.high)!;
      loose(s, hp.boardX - 30, hp.y + 40, 300, 0, back);
      step(s, 6);
      expect(s.game.ball.vx).toBeLessThan(0); // came back off the board
      return s.game.ball.vy;
    };
    expect(drop(25)).toBeLessThan(drop(0) - 40);
  });
});

describe('body physics', () => {
  it('the same blow moves a heavy player less than a light one', () => {
    const s = scene();
    const [light, heavy] = [s.me, s.mate];
    expect(massOf(heavy.def)).toBeGreaterThan(massOf(light.def) * 1.2);
    light.x = 600; light.z = 100; heavy.x = 600; heavy.z = 260;
    s.game.knockDown(light, 1, 1, 300, 380);
    s.game.knockDown(heavy, 1, 1, 300, 380);
    step(s, 100);
    expect(light.x - 600).toBeGreaterThan((heavy.x - 600) * 1.12);
    expect(heavy.x - 600).toBeGreaterThan(40);
  });

  it('a knocked-down body tumbles, settles flat, and stands up straight again', () => {
    const s = scene();
    s.me.x = 600; s.me.z = 180;
    s.game.knockDown(s.me, 1, 1, 320, 420);
    let turned = 0, last = 0, air = 0;
    for (let f = 0; f < 60 && (s.me.y > 0 || f < 3); f++) { step(s, 1); turned += Math.abs(s.me.rot - last); last = s.me.rot; air++; }
    expect(air).toBeGreaterThan(15);
    expect(turned).toBeGreaterThan(1); // it turned in the air
    step(s, 45);
    expect(s.me.state).toBe('down');
    // Flat on the floor: a quarter turn either way from upright.
    expect(Math.abs(Math.cos(s.me.rot))).toBeLessThan(0.05);
    expect(Math.hypot(s.me.vx, s.me.vz)).toBe(0); // the slide ends in a real stop
    step(s, 90);
    expect(s.me.state).toBe('move');
    expect(s.me.rot).toBe(0);
  });

  it('a heavier player gives less ground when two bodies push into each other', () => {
    const s = scene();
    const [light, heavy] = [s.me, s.mate];
    light.x = 600; light.z = 180; heavy.x = 606; heavy.z = 180;
    step(s, 1);
    expect(Math.abs(light.x - 600)).toBeGreaterThan(Math.abs(heavy.x - 606) * 1.2);
  });
});

describe('item physics', () => {
  it('a thrown can that misses bounces, rolls to a stop and can be picked up again', () => {
    const s = scene();
    s.me.x = 500; s.me.z = 180; s.me.facing = 1;
    const can = s.game.toys.makeItem('can', 500, 0, 180);
    s.game.items.push(can);
    step(s, 3);
    expect(s.game.heldItem(s.me)).toBe(can);
    step(s, 2, (f) => ({ 0: { shoot: f === 0 } }));
    expect(can.state).toBe('thrown');
    let bounces = 0;
    for (let f = 0; f < 600 && !(can.state === 'ground' && can.vx === 0 && can.y === 0); f++) {
      step(s, 1);
      for (const e of s.game.drainEvents()) if (e.type === 'bounce') bounces++;
    }
    expect(s.game.items).toContain(can);
    expect(can.state).toBe('ground');
    expect(can.team).toBeNull();
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(can.x).toBeGreaterThan(800);
    expect(Math.abs(can.spin)).toBeGreaterThan(3); // it rolled
    s.me.x = can.x; s.me.z = can.z;
    step(s, 3);
    expect(s.game.heldItem(s.me)).toBe(can);
  });

  it('a thrown crate smashes when it lands', () => {
    const s = scene();
    s.me.x = 500; s.me.z = 180; s.me.facing = 1;
    const crate = s.game.toys.makeItem('crate', 500, 0, 180);
    s.game.items.push(crate);
    step(s, 3);
    s.game.drainEvents();
    step(s, 2, (f) => ({ 0: { shoot: f === 0 } }));
    let smashed = false;
    for (let f = 0; f < 200 && s.game.items.includes(crate); f++) {
      step(s, 1);
      for (const e of s.game.drainEvents()) if (e.type === 'itemhit' && e.text === 'crate') smashed = true;
    }
    expect(s.game.items).not.toContain(crate);
    expect(smashed).toBe(true);
  });

  it('with hands full, running into an item kicks it along the floor', () => {
    const s = scene();
    s.me.x = 500; s.me.z = 180;
    s.game.giveBall(s.me, true);
    const can = s.game.toys.makeItem('can', 560, 0, 180);
    s.game.items.push(can);
    step(s, 40, () => ({ 0: { mx: 1, sprint: true } }));
    expect(can.state).toBe('ground');
    expect(can.x).toBeGreaterThan(600);
    expect(s.game.ball.holder).toBe(0);
  });

  it('a dropped item keeps some of its carrier\'s motion', () => {
    const s = scene();
    s.me.x = 500; s.me.z = 180;
    const bat = s.game.toys.makeItem('bat', 500, 0, 180);
    s.game.items.push(bat);
    step(s, 3);
    expect(s.game.heldItem(s.me)).toBe(bat);
    step(s, 20, () => ({ 0: { mx: 1, sprint: true } }));
    const x0 = s.me.x;
    s.game.knockDown(s.me, 1, 1, 300, 380);
    step(s, 90);
    expect(bat.state).toBe('ground');
    expect(bat.x).toBeGreaterThan(x0 + 15);
    expect(bat.vx).toBe(0);
  });
});
