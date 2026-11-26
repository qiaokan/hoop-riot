import { DUNK_RANGE, GRAVITY, HIGH_MIN_Y, HOOP, THREE_PT, attackDir, attackHoopX, ownHoopX } from './constants';
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
  /** Chance to commit to a running tackle when lined up with the ball carrier. */
  tackle: number;
  /** Chance to dodge out of pressure. */
  dodge: number;
  /** Chance to follow a landed punch with the next strike of the combo. */
  combo: number;
  /** Chance to go for a grab when close to the ball carrier. */
  grab: number;
  /** Shot release timing error (seconds). */
  jitter: number;
}

export const AI_PARAMS: Record<Difficulty, AIParams> = {
  easy: { react: 0.34, aggression: 0.1, blockSkill: 0.2, passIQ: 0.35, tackle: 0.05, dodge: 0.1, combo: 0.15, grab: 0.03, jitter: 0.17 },
  normal: { react: 0.22, aggression: 0.2, blockSkill: 0.4, passIQ: 0.55, tackle: 0.11, dodge: 0.3, combo: 0.35, grab: 0.07, jitter: 0.11 },
  hard: { react: 0.13, aggression: 0.32, blockSkill: 0.6, passIQ: 0.7, tackle: 0.2, dodge: 0.5, combo: 0.6, grab: 0.13, jitter: 0.07 },
};

/** Multiplier on the size of the sure-make release window. */
export const ACCURACY: Record<Difficulty, number> = { easy: 0.85, normal: 1, hard: 1.1 };

interface Brain {
  next: number;
  tx: number;
  tz: number;
  sprint: boolean;
  face?: 1 | -1;
  action: boolean;
  special: boolean;
  jump: boolean;
  tackle: boolean;
  ttx: number;
  ttz: number;
  startShot: boolean;
  releaseIn: number;
  holding: boolean;
  shootUntil: number;
  hadBall: boolean;
  gotBallAt: number;
  lastPunch: number;
  lastTackle: number;
  padUntil: number;
  padX: number;
  padZ: number;
  /** Which combo strike the follow-up decision was last made for, and what it was. */
  comboSeen: number;
  comboGo: boolean;
  /** Walking into the ball carrier to grab them until this time. */
  grabUntil: number;
}

const newBrain = (): Brain => ({
  next: 0, tx: 0, tz: 0, sprint: false, action: false, special: false, jump: false,
  tackle: false, ttx: 0, ttz: 0,
  startShot: false, releaseIn: 0, holding: false, shootUntil: 0, hadBall: false, gotBallAt: 0, lastPunch: -9, lastTackle: -9,
  padUntil: -9, padX: 0, padZ: 0, comboSeen: -1, comboGo: false, grabUntil: -9,
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
    const P = this.params.get(p.id)!;

    const has = g.ball.holder === p.id;
    if (has && !b.hadBall) b.gotBallAt = now;
    b.hadBall = has;

    if (b.holding) {
      out.shoot = now < b.shootUntil;
      if (!out.shoot) b.holding = false;
      return out;
    }

    // Reflexes that cannot wait for the next decision tick.
    if (g.phase === 'play') {
      // Holding someone: two knees, then the throw.
      if (p.state === 'grab') {
        out.action = p.t > 0.22 && Math.floor(now * 7) % 2 === 0;
        return out;
      }
      // Being held: sometimes burn stamina to wrench free.
      if (p.state === 'held') {
        if (p.stamina >= 0.2 && this.rng() < 0.008 + P.dodge * 0.06) out.special = true;
        return out;
      }
      // Landed a punch: decide once per strike whether to throw the next one.
      if (p.state === 'punch' && p.punchHit && p.combo < 2) {
        if (b.comboSeen !== p.combo) { b.comboSeen = p.combo; b.comboGo = this.rng() < P.combo; }
        if (b.comboGo && p.t > 0.11) { out.action = true; return out; }
      } else if (p.state !== 'punch') b.comboSeen = -1;
      // Being hit again and again: sometimes burn stamina to dodge out of the chain.
      if (p.state === 'stun' && p.hits >= 2 && p.stamina >= 0.5 && this.rng() < P.dodge * 0.05) {
        out.special = true;
        out.mx = -p.facing;
        return out;
      }
      // In the air off a launch pad with the ball: sky dunk near the rim, otherwise time an air shot.
      if (has && p.state === 'jump' && p.launched && !p.released) {
        if (distXZ(p.x, p.z, attackHoopX(p.team), HOOP.z) < 195) {
          out.shoot = p.y > HIGH_MIN_Y + 8 || p.vy <= 0;
          return out;
        }
        if (p.vy > 0) {
          b.holding = true;
          b.shootUntil = now + Math.max(0.03, p.vy / GRAVITY + (this.rng() - 0.5) * 2 * P.jitter);
          out.shoot = true;
        }
        return out;
      }
      // Carrying an item with an opponent lined up: throw it.
      if (!has && p.state === 'move' && g.heldItem(p)) {
        for (const o of g.opponents(p)) {
          const dx = o.x - p.x;
          if (g.canAct(o) && Math.abs(o.z - p.z) < 18 && Math.abs(dx) > 40 && Math.abs(dx) < 400 && this.rng() < 0.15) {
            out.action = true;
            out.face = dx > 0 ? 1 : -1;
            return out;
          }
        }
      }
      // Teammate is in the air at the rim: throw the lob.
      const mate = g.teammate(p);
      if (has && p.state === 'move' && mate.state === 'jump' && mate.y > 8 && mate.vy > -120
        && distXZ(mate.x, mate.z, attackHoopX(p.team), HOOP.z) < 190) {
        out.action = true;
        return out;
      }
      // In the air next to a shooter or dunker: kick them out of it.
      if (!has && p.state === 'jump' && p.y > 14) {
        for (const o of g.opponents(p)) {
          if (o.state !== 'dunk' && o.state !== 'shoot') continue;
          const dx = o.x - p.x;
          if (Math.abs(dx) < 50 && Math.abs(o.z - p.z) < 24 && Math.abs(o.y - p.y) < 55 && this.rng() < P.aggression * 0.1) {
            out.action = true;
            out.face = dx >= 0 ? 1 : -1;
            return out;
          }
        }
      }
    }

    if (now >= b.next) {
      this.think(p, b);
      b.next = now + P.react * (0.7 + 0.6 * this.rng());
    }

    if (b.tackle) {
      b.tackle = false;
      const dx = b.ttx - p.x, dz = b.ttz - p.z;
      const d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d;
      out.mz = dz / d;
      out.sprint = true;
      out.action = true;
      return out;
    }
    if (b.action) {
      b.action = false;
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
    out.grab = now < b.grabUntil;
    if (out.grab) out.sprint = false;
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
    else if (ball.state === 'shot') {
      // Once the ball is off the rim it goes wherever the bounce sends it: chase it.
      if (ball.shot?.touched) this.looseBall(p, b); else this.rebound(p, b);
    }
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
    if (p.state !== 'move') return;
    const full = g.hype[p.team] >= 1;

    if (full && d < (p.def.special === 'slam' ? 620 : 520) && this.rng() < 0.5) {
      b.special = true;
      return;
    }

    // Already committed to running over a launch pad.
    if (g.time < b.padUntil) { b.tx = b.padX; b.tz = b.padZ; b.sprint = true; return; }

    // A defender closing in with free hands is coming to grab: slip past them or move the ball.
    if (opp && nd < 100 && opp.state === 'move') {
      const closing = ((opp.vx - p.vx) * (p.x - opp.x) + (opp.vz - p.vz) * (p.z - opp.z)) / (nd || 1);
      if (closing > 60 && this.rng() < 0.3 + P.dodge) {
        // Best answer is to move the ball; otherwise dodge past on the open side.
        if (g.canAct(mate) && this.laneClear(p, mate) && this.rng() < 0.3 + P.passIQ * 0.6) { b.action = true; return; }
        if (!full && p.stamina >= 0.3 && this.rng() < 0.6) {
          b.tx = opp.x + (opp.x - p.x);
          b.tz = p.z + (p.z > opp.z ? 50 : -50);
          b.special = true;
          return;
        }
      }
    }

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
      b.startShot = true;
      b.releaseIn = Math.max(0.05, g.apexTime(p) + (this.rng() - 0.5) * 2 * P.jitter);
      b.tx = p.x; b.tz = p.z;
      return;
    }

    const mateOpen = g.canAct(mate) && this.nearestOpp(mate).d > 70 && this.laneClear(p, mate);
    if (nd < 52 && mateOpen && this.rng() < P.passIQ) { b.action = true; return; }

    // A ready launch pad on the way to the rim: sometimes take it for a sky dunk.
    if (nd > 45 && this.rng() < 0.3) {
      let pad: { x: number; z: number } | null = null, best = 170;
      g.stage.launchers.forEach((l, i) => {
        if (g.padTimers[i] > 0) return;
        const toHoop = Math.abs(hx - l.x);
        if (toHoop > 420 || toHoop > Math.abs(hx - p.x) - 10) return;
        const dd = distXZ(p.x, p.z, l.x, l.z);
        if (dd < best) { best = dd; pad = l; }
      });
      if (pad) {
        const l = pad as { x: number; z: number };
        b.padUntil = g.time + 0.9;
        b.padX = l.x + dir * 8;
        b.padZ = l.z;
        b.tx = b.padX; b.tz = b.padZ; b.sprint = true;
        return;
      }
    }

    // Drive toward the rim, slipping away from the nearest defender.
    const dodge = opp ? (opp.z > p.z ? -1 : 1) : 0;
    b.tx = hx - dir * (d < 260 ? 60 : 120);
    b.tz = HOOP.z + dodge * (nd < 90 ? 80 : 30);
    // Sprint when there is room, and also to get away from someone close: a sprinter cannot be grabbed.
    b.sprint = p.stamina > 0.35 && (nd > 60 || this.rng() < 0.3) || (nd < 70 && p.stamina > 0.15);

    // Crowded: dodge through the defender along the drive line.
    if (nd < 46 && !full && p.stamina > 0.4 && this.rng() < P.dodge) b.special = true;
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

    // Open at the rim with the ball handler in range: jump and ask for the lob.
    if (p.state === 'move' && holder.state === 'move' && distXZ(p.x, p.z, hx, HOOP.z) < 185
      && distXZ(p.x, p.z, holder.x, holder.z) < 430 && this.nearestOpp(p).d > 34 && this.rng() < 0.12) {
      b.jump = true;
    }
  }

  private defend(p: Player, b: Brain, holder: Player) {
    const g = this.game;
    const P = this.params.get(p.id)!;
    const own = ownHoopX(p.team);
    const mate = g.teammate(p);
    const myD = distXZ(p.x, p.z, holder.x, holder.z);
    const mateD = g.canAct(mate) ? distXZ(mate.x, mate.z, holder.x, holder.z) : Infinity;
    const primary = myD <= mateD;

    if (g.hype[p.team] >= 1 && p.state === 'move') {
      if (p.def.defSpecial === 'shockwave') {
        if (this.nearestOpp(p).d < 125) { b.special = true; return; }
      } else if (myD < 520 && this.rng() < 0.5) { b.special = true; return; }
    }

    if (primary) {
      const vx = own - holder.x, vz = HOOP.z - holder.z;
      const vl = Math.hypot(vx, vz) || 1;
      b.tx = holder.x + (vx / vl) * 34;
      b.tz = holder.z + (vz / vl) * 34;
      b.sprint = myD > 90 && p.stamina > 0.3;
      // Sometimes go for a grab: walk straight into the ball carrier.
      if (g.time >= b.grabUntil && myD < 75 && holder.state === 'move' && p.grabCd <= 0 && this.rng() < P.grab) b.grabUntil = g.time + 0.8;
      if (g.time < b.grabUntil) { b.tx = holder.x; b.tz = holder.z; b.sprint = false; return; }
      const inReach = myD < 48 && Math.abs(holder.z - p.z) < 22;
      if (holder.state === 'dunk' && myD < 90 && this.rng() < P.aggression + 0.2) {
        b.face = holder.x > p.x ? 1 : -1; b.action = true;
      } else if (holder.state === 'shoot' && myD < 75 && this.rng() < P.blockSkill) {
        b.jump = true;
      } else if (inReach && this.rng() < P.aggression) {
        b.face = holder.x > p.x ? 1 : -1; b.action = true;
      } else if (holder.state === 'move' && p.state === 'move' && myD > 55 && myD < 135
        && Math.abs(holder.z - p.z) < 30 && p.stamina > 0.3
        && g.time - b.lastTackle > 1.5 + (1 - P.aggression) * 3 && this.rng() < P.tackle) {
        b.lastTackle = g.time;
        b.tackle = true;
        b.ttx = holder.x + holder.vx * 0.15;
        b.ttz = holder.z + holder.vz * 0.15;
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
