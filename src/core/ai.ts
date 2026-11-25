import { DUNK_RANGE, GRAVITY, HOOP, JUMP_V, THREE_PT, attackDir, attackHoopX, ownHoopX } from './constants';
import { Game, Intent, Player, distXZ } from './game';
import { makeRng } from './rng';
import type { Difficulty } from './teams';

export interface AIParams {
  /** Seconds between decisions. */
  react: number;
  /** Chance to throw a punch when in range at a decision. */
  aggression: number;
  /** Chance to contest a shot with a jump. */
  blockSkill: number;
  /** Chance to pass out of pressure. */
  passIQ: number;
  useSpecial: boolean;
  /** Shot release timing error (seconds). */
  jitter: number;
}

export const AI_PARAMS: Record<Difficulty, AIParams> = {
  easy: { react: 0.34, aggression: 0.2, blockSkill: 0.22, passIQ: 0.35, useSpecial: true, jitter: 0.12 },
  normal: { react: 0.22, aggression: 0.36, blockSkill: 0.42, passIQ: 0.55, useSpecial: true, jitter: 0.07 },
  hard: { react: 0.13, aggression: 0.52, blockSkill: 0.62, passIQ: 0.7, useSpecial: true, jitter: 0.035 },
};

export const ACCURACY: Record<Difficulty, number> = { easy: 0.85, normal: 0.97, hard: 1.06 };

interface Brain {
  next: number;
  tx: number;
  tz: number;
  sprint: boolean;
  face?: 1 | -1;
  action: boolean;
  special: boolean;
  jump: boolean;
  startShot: boolean;
  releaseIn: number;
  holding: boolean;
  shootUntil: number;
  hadBall: boolean;
  gotBallAt: number;
  lastPunch: number;
}

const newBrain = (): Brain => ({
  next: 0, tx: 0, tz: 0, sprint: false, action: false, special: false, jump: false,
  startShot: false, releaseIn: 0, holding: false, shootUntil: 0, hadBall: false, gotBallAt: 0, lastPunch: -9,
});

export class AIController {
  private brains = new Map<number, Brain>();
  private rng: () => number;

  constructor(private game: Game, private params: Map<number, AIParams>, seed = 7) {
    this.rng = makeRng(seed * 7919 + 13);
  }

  intent(p: Player): Intent {
    const g = this.game;
    let b = this.brains.get(p.id);
    if (!b) { b = newBrain(); b.tx = p.x; b.tz = p.z; this.brains.set(p.id, b); }
    const out: Intent = { mx: 0, mz: 0, sprint: false, shoot: false, action: false, special: false };
    const now = g.time;

    const has = g.ball.holder === p.id;
    if (has && !b.hadBall) b.gotBallAt = now;
    b.hadBall = has;

    if (b.holding) {
      out.shoot = now < b.shootUntil;
      if (!out.shoot) b.holding = false;
      return out;
    }

    if (now >= b.next) {
      this.think(p, b);
      const P = this.params.get(p.id)!;
      b.next = now + P.react * (0.7 + 0.6 * this.rng());
    }

    if (b.action) {
      b.action = false;
      const P = this.params.get(p.id)!;
      const isPunch = g.ball.holder !== p.id && !(g.holder()?.team === p.team);
      if (!isPunch || now - b.lastPunch > 0.9 - P.aggression * 0.6) {
        out.action = true;
        out.face = b.face;
        if (isPunch) b.lastPunch = now;
      }
    }
    if (b.special) { out.special = true; b.special = false; }
    if (b.jump) { out.shoot = true; b.jump = false; }
    if (b.startShot) {
      out.shoot = true;
      b.startShot = false;
      b.holding = true;
      b.shootUntil = now + b.releaseIn;
    }

    const dx = b.tx - p.x, dz = b.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 6) {
      const s = Math.min(1, d / 40);
      out.mx = (dx / d) * s;
      out.mz = (dz / d) * s;
    }
    out.sprint = b.sprint;
    return out;
  }

  private think(p: Player, b: Brain) {
    const g = this.game;
    b.sprint = false;
    b.face = undefined;
    if (!g.canAct(p) || g.phase !== 'play') { b.tx = p.x; b.tz = p.z; return; }
    const ball = g.ball;
    const holder = g.holder();
    if (holder && holder.id === p.id) this.withBall(p, b);
    else if (ball.state === 'held' && holder && holder.team === p.team) this.offBall(p, b, holder);
    else if (ball.state === 'held' && holder) this.defend(p, b, holder);
    else if (ball.state === 'shot') this.rebound(p, b);
    else if (ball.state === 'pass') this.chasePass(p, b);
    else this.looseBall(p, b);
  }

  private nearestOpp(p: Player): { o: Player | null; d: number } {
    let o: Player | null = null, d = Infinity;
    for (const q of this.game.opponents(p)) {
      if (!this.game.canAct(q)) continue;
      const dd = distXZ(p.x, p.z, q.x, q.z);
      if (dd < d) { d = dd; o = q; }
    }
    return { o, d };
  }

  private withBall(p: Player, b: Brain) {
    const g = this.game;
    const P = this.params.get(p.id)!;
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    const d = distXZ(p.x, p.z, hx, HOOP.z);
    const { o: opp, d: nd } = this.nearestOpp(p);
    const mate = g.teammate(p);
    const held = g.time - b.gotBallAt;

    if (P.useSpecial && g.hype[p.team] >= 1 && d < 520 && p.state === 'move' && this.rng() < 0.5) {
      b.special = true;
      return;
    }
    if (p.state !== 'move') return;

    // Teammate (possibly the human) asked for the ball.
    if (g.passCall[p.team] > 0 && g.canAct(mate) && this.rng() < 0.9) { b.action = true; return; }

    if (d < DUNK_RANGE - 15 && nd > 28 && this.rng() < 0.85) {
      b.tx = hx; b.tz = HOOP.z; b.sprint = true;
      b.startShot = true; b.releaseIn = 0.1;
      return;
    }

    const range = 200 + 180 * p.def.shoot;
    const open = nd > 75;
    const desperate = g.shotClock < 2.6;
    const pullUp = d < THREE_PT + 40 && open && held > 1 && this.rng() < 0.18 * p.def.shoot;
    if ((d < range && open && held > 0.4) || desperate || pullUp) {
      const vy0 = JUMP_V * (0.85 + 0.3 * p.def.jump);
      b.startShot = true;
      b.releaseIn = Math.max(0.05, vy0 / GRAVITY + (this.rng() - 0.5) * 2 * P.jitter);
      b.tx = p.x; b.tz = p.z;
      return;
    }

    const mateOpen = g.canAct(mate) && this.nearestOpp(mate).d > 70 && this.laneClear(p, mate);
    if (nd < 52 && mateOpen && this.rng() < P.passIQ) { b.action = true; return; }

    // Drive toward the rim, slipping away from the nearest defender.
    const dodge = opp ? (opp.z > p.z ? -1 : 1) : 0;
    b.tx = hx - dir * (d < 260 ? 60 : 120);
    b.tz = HOOP.z + dodge * (nd < 90 ? 80 : 30);
    b.sprint = p.stamina > 0.35 && (nd > 60 || this.rng() < 0.3);
  }

  /** True when no defender stands close to the straight passing line. */
  private laneClear(from: Player, to: Player): boolean {
    const ax = from.x, az = from.z, bx = to.x - ax, bz = to.z - az;
    const len2 = bx * bx + bz * bz || 1;
    for (const o of this.game.opponents(from)) {
      if (!this.game.canAct(o)) continue;
      const t = Math.max(0, Math.min(1, ((o.x - ax) * bx + (o.z - az) * bz) / len2));
      if (distXZ(o.x, o.z, ax + bx * t, az + bz * t) < 30) return false;
    }
    return true;
  }

  private offBall(p: Player, b: Brain, holder: Player) {
    const g = this.game;
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    const spots = [
      { x: hx - dir * 300, z: 80 }, { x: hx - dir * 300, z: 285 },
      { x: hx - dir * 150, z: 55 }, { x: hx - dir * 150, z: 305 },
      { x: hx - dir * 90, z: 180 }, { x: hx - dir * 420, z: 180 },
    ];
    let best = spots[0], bestScore = -Infinity;
    for (const s of spots) {
      let minOpp = Infinity;
      for (const o of g.opponents(p)) minOpp = Math.min(minOpp, distXZ(s.x, s.z, o.x, o.z));
      const toHolder = distXZ(s.x, s.z, holder.x, holder.z);
      const score = Math.min(minOpp, 220) - distXZ(s.x, s.z, p.x, p.z) * 0.25 - (toHolder < 120 ? 200 : 0) + this.rng() * 30;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    b.tx = best.x;
    b.tz = best.z;
    b.sprint = distXZ(p.x, p.z, best.x, best.z) > 140 && p.stamina > 0.5;
  }

  private defend(p: Player, b: Brain, holder: Player) {
    const g = this.game;
    const P = this.params.get(p.id)!;
    const own = ownHoopX(p.team);
    const mate = g.teammate(p);
    const myD = distXZ(p.x, p.z, holder.x, holder.z);
    const mateD = g.canAct(mate) ? distXZ(mate.x, mate.z, holder.x, holder.z) : Infinity;
    const primary = myD <= mateD;

    if (primary) {
      const vx = own - holder.x, vz = HOOP.z - holder.z;
      const vl = Math.hypot(vx, vz) || 1;
      b.tx = holder.x + (vx / vl) * 34;
      b.tz = holder.z + (vz / vl) * 34;
      b.sprint = myD > 90 && p.stamina > 0.3;
      const inReach = myD < 48 && Math.abs(holder.z - p.z) < 22;
      if (holder.state === 'dunk' && myD < 90 && this.rng() < P.aggression + 0.2) {
        b.face = holder.x > p.x ? 1 : -1; b.action = true;
      } else if (holder.state === 'shoot' && myD < 75 && this.rng() < P.blockSkill) {
        b.jump = true;
      } else if (inReach && this.rng() < P.aggression) {
        b.face = holder.x > p.x ? 1 : -1; b.action = true;
      }
    } else {
      const other = g.teammate(holder);
      const vx = own - other.x, vz = HOOP.z - other.z;
      const vl = Math.hypot(vx, vz) || 1;
      b.tx = other.x + (vx / vl) * 60;
      b.tz = other.z + (vz / vl) * 60;
      // Help defense when the ball gets close to the rim.
      if (distXZ(holder.x, holder.z, own, HOOP.z) < 200) {
        b.tx = (b.tx + holder.x) / 2;
        b.tz = (b.tz + holder.z) / 2;
      }
      const od = distXZ(p.x, p.z, other.x, other.z);
      if (od < 44 && Math.abs(other.z - p.z) < 22 && this.rng() < P.aggression * 0.35) {
        b.face = other.x > p.x ? 1 : -1; b.action = true;
      }
    }
  }

  private rebound(p: Player, b: Brain) {
    const g = this.game;
    const P = this.params.get(p.id)!;
    const ball = g.ball;
    const s = ball.shot!;
    const out = s.hoopX < 750 ? 1 : -1;
    b.tx = s.hoopX + out * (60 + p.slot * 30);
    b.tz = HOOP.z + (p.slot === 0 ? -45 : 45);
    b.sprint = true;
    const dBall = distXZ(p.x, p.z, ball.x, ball.z);
    if (s.team !== p.team && ball.vy > 0 && dBall < 60 && s.t < s.T * 0.4 && this.rng() < P.blockSkill) b.jump = true;
    if (ball.vy < 0 && dBall < 55 && ball.y > 60 && ball.y < 175) b.jump = true;
  }

  private chasePass(p: Player, b: Brain) {
    const g = this.game;
    const ball = g.ball;
    const ps = ball.pass!;
    const passer = g.players[ps.from];
    if (ps.to === p.id) {
      b.tx = ball.x + ball.vx * 0.12;
      b.tz = ball.z + ball.vz * 0.12;
    } else if (p.team !== passer.team && distXZ(p.x, p.z, ball.x, ball.z) < 140) {
      b.tx = ball.x + ball.vx * 0.15;
      b.tz = ball.z + ball.vz * 0.15;
      b.sprint = true;
    }
  }

  private looseBall(p: Player, b: Brain) {
    const g = this.game;
    const ball = g.ball;
    const mate = g.teammate(p);
    const lx = ball.x + ball.vx * 0.25, lz = ball.z + ball.vz * 0.25;
    const myD = distXZ(p.x, p.z, lx, lz);
    const mateD = g.canAct(mate) ? distXZ(mate.x, mate.z, lx, lz) : Infinity;
    if (myD <= mateD) {
      b.tx = lx; b.tz = lz; b.sprint = true;
      if (ball.y > 55 && ball.y < 170 && myD < 45) b.jump = true;
    } else {
      const own = ownHoopX(p.team);
      b.tx = (lx + own) / 2;
      b.tz = HOOP.z + (p.slot === 0 ? -60 : 60);
    }
  }
}
