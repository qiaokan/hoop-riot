import {
  COURT, DT, DUNK_RANGE, DUNK_TIME, GRAVITY, HAND_Y, HOOP, JUMP_V, RUN_SPEED, SHOT_CLOCK,
  SPRINT_MUL, THREE_PT, TeamId, attackDir, attackHoopX, ownHoopX, DEFAULT_MATCH_SECONDS,
} from './constants';
import { makeRng } from './rng';
import type { PlayerDef, TeamDef } from './teams';

export interface Intent {
  mx: number;
  mz: number;
  sprint: boolean;
  shoot: boolean;
  action: boolean;
  special: boolean;
  /** Optional facing override (AI uses it to aim punches). */
  face?: 1 | -1;
}

export const NO_INTENT: Intent = { mx: 0, mz: 0, sprint: false, shoot: false, action: false, special: false };

export type PState =
  | 'move' | 'jump' | 'shoot' | 'punch' | 'stun' | 'down' | 'dunk' | 'pass' | 'hang'
  | 'tackle' | 'airkick' | 'spin';

export type DunkKind = 'dunk' | 'oop' | 'mega';

export interface Player {
  id: number;
  team: TeamId;
  slot: 0 | 1;
  def: PlayerDef;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  facing: 1 | -1;
  state: PState;
  t: number;
  stamina: number;
  hits: number;
  hitTimer: number;
  invuln: number;
  pickupCd: number;
  /** The current attack (punch, tackle, air kick) has already connected. */
  punchHit: boolean;
  /** The current tackle is a Blitz special (homing, invulnerable). */
  blitz: boolean;
  /** Distance walked, drives the run cycle. */
  anim: number;
  /** Shot released this jump (so we do not release twice). */
  released: boolean;
  dunk?: { sx: number; sy: number; sz: number; tx: number; tz: number; T: number; kind: DunkKind };
  prev: { shoot: boolean; action: boolean; special: boolean };
}

export type BallState = 'held' | 'loose' | 'shot' | 'pass' | 'scored';

export interface Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  state: BallState;
  holder: number | null;
  lastTeam: TeamId;
  spin: number;
  afterShot: boolean;
  shot?: { made: boolean; points: number; team: TeamId; shooter: number; t: number; T: number; special: boolean; hoopX: number };
  pass?: { from: number; to: number; t: number; T: number; oop: boolean };
}

export type GameEventType =
  | 'bounce' | 'swish' | 'rim' | 'hit' | 'ko' | 'whistle' | 'block' | 'steal' | 'fumble'
  | 'shoot' | 'dunk' | 'pass' | 'catch' | 'special' | 'buzzer' | 'score' | 'jump' | 'land'
  | 'violation' | 'suddendeath' | 'final' | 'shockwave' | 'tipoff'
  | 'tackle' | 'spin' | 'oop' | 'blitz' | 'megaslam';

export interface GameEvent {
  type: GameEventType;
  x: number; y: number; z: number;
  team?: TeamId;
  points?: number;
  player?: number;
  text?: string;
}

export type Phase = 'tipoff' | 'play' | 'score' | 'turnover' | 'end';

export interface TeamStats {
  fgm: number; fga: number; tpm: number; tpa: number;
  dunks: number; steals: number; blocks: number; kos: number; hits: number;
}

export interface GameOptions {
  home: TeamDef;
  away: TeamDef;
  seed?: number;
  matchSeconds?: number;
  /** Shot-window multipliers per team (difficulty tuning). */
  accuracy?: [number, number];
}

const emptyStats = (): TeamStats => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, steals: 0, blocks: 0, kos: 0, hits: 0 });

export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class Game {
  readonly teams: [TeamDef, TeamDef];
  players: Player[] = [];
  ball: Ball;
  score: [number, number] = [0, 0];
  hype: [number, number] = [0, 0];
  stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  clock: number;
  shotClock = SHOT_CLOCK;
  possession: TeamId = 0;
  phase: Phase = 'tipoff';
  phaseT = 0;
  time = 0;
  hitstop = 0;
  clockExpired = false;
  suddenDeath = false;
  winner: TeamId | null = null;
  /** Seconds left on a teammate's "pass me the ball" call, per team. */
  passCall: [number, number] = [0, 0];
  accuracy: [number, number];
  events: GameEvent[] = [];
  readonly rng: () => number;
  private nextPossession: TeamId = 0;
  private dribbleLatch = false;

  constructor(opts: GameOptions) {
    this.teams = [opts.home, opts.away];
    this.rng = makeRng(opts.seed ?? 1);
    this.clock = opts.matchSeconds ?? DEFAULT_MATCH_SECONDS;
    this.accuracy = opts.accuracy ?? [1, 1];
    let id = 0;
    for (const team of [0, 1] as TeamId[]) {
      for (const slot of [0, 1] as const) {
        this.players.push({
          id: id++, team, slot, def: this.teams[team].players[slot],
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: attackDir(team),
          state: 'move', t: 0, stamina: 1, hits: 0, hitTimer: 0, invuln: 0, pickupCd: 0,
          punchHit: false, blitz: false, anim: 0, released: false,
          prev: { shoot: false, action: false, special: false },
        });
      }
    }
    this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: 'held', holder: null, lastTeam: 0, spin: 0, afterShot: false };
    const first: TeamId = this.rng() < 0.5 ? 0 : 1;
    this.resetFormation(first);
    this.emit('tipoff', COURT.midX, 60, HOOP.z);
  }

  // ---------------------------------------------------------------- helpers

  holder(): Player | null {
    return this.ball.holder === null ? null : this.players[this.ball.holder];
  }
  teammate(p: Player): Player {
    return this.players.find((q) => q.team === p.team && q.id !== p.id)!;
  }
  opponents(p: Player): Player[] {
    return this.players.filter((q) => q.team !== p.team);
  }
  canAct(p: Player): boolean {
    return p.state !== 'down' && p.state !== 'stun' && p.state !== 'dunk' && p.state !== 'hang';
  }
  private hittable(o: Player): boolean {
    return o.state !== 'down' && o.invuln <= 0;
  }
  private emit(type: GameEventType, x: number, y: number, z: number, extra: Partial<GameEvent> = {}) {
    this.events.push({ type, x, y, z, ...extra });
  }
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  private addHype(team: TeamId, v: number) {
    this.hype[team] = clamp(this.hype[team] + v, 0, 1);
  }

  /** Seconds from takeoff to the top of this player's jump. */
  apexTime(p: Player): number {
    return (JUMP_V * (0.85 + 0.3 * p.def.jump)) / GRAVITY;
  }

  /**
   * Half-width, in seconds around the jump apex, of the release window in which a jump shot
   * always scores. Shrinks with distance and with defensive pressure; 0 means no sure window.
   */
  shotWindow(p: Player): number {
    const d = distXZ(p.x, p.z, attackHoopX(p.team), HOOP.z);
    if (d > 470) return 0;
    let w = d <= 200 ? 0.08 : 0.08 - ((d - 200) / 270) * 0.045;
    w *= 0.8 + 0.4 * p.def.shoot;
    let nearest = Infinity;
    let contestInAir = false;
    for (const o of this.opponents(p)) {
      if (!this.canAct(o)) continue;
      const dd = distXZ(p.x, p.z, o.x, o.z);
      if (dd < nearest) nearest = dd;
      if (dd < 70 && o.y > 18) contestInAir = true;
    }
    if (nearest < 45) w *= 0.4;
    else if (nearest < 85) w *= 0.7;
    if (contestInAir) w *= 0.6;
    return w * this.accuracy[p.team];
  }

  resetFormation(offense: TeamId) {
    const dir = attackDir(offense);
    const own = ownHoopX(offense);
    for (const p of this.players) {
      p.vx = p.vy = p.vz = 0;
      p.y = 0;
      p.state = 'move';
      p.t = 0;
      p.hits = 0;
      p.invuln = 0;
      p.pickupCd = 0;
      p.released = false;
      p.blitz = false;
      if (p.team === offense) {
        p.x = own + dir * (p.slot === 0 ? 230 : 320);
        p.z = p.slot === 0 ? 190 : 90;
        p.facing = dir;
      } else {
        p.x = own + dir * (p.slot === 0 ? 540 : 600);
        p.z = p.slot === 0 ? 150 : 260;
        p.facing = (-dir) as 1 | -1;
      }
    }
    const handler = this.players.find((p) => p.team === offense && p.slot === 0)!;
    this.giveBall(handler, true);
    this.possession = offense;
    this.shotClock = SHOT_CLOCK;
    this.passCall = [0, 0];
  }

  private giveBall(p: Player, silent = false) {
    const b = this.ball;
    const changed = b.lastTeam !== p.team || b.afterShot;
    b.state = 'held';
    b.holder = p.id;
    b.shot = undefined;
    b.pass = undefined;
    b.lastTeam = p.team;
    if (changed || silent) this.shotClock = SHOT_CLOCK;
    b.afterShot = false;
    this.possession = p.team;
    if (!silent) this.emit('catch', p.x, p.y + HAND_Y, p.z, { player: p.id });
  }

  // ---------------------------------------------------------------- main step

  step(intents: Intent[]) {
    if (this.hitstop > 0) {
      this.hitstop -= DT;
      return;
    }
    this.time += DT;
    this.phaseT += DT;
    this.passCall[0] = Math.max(0, this.passCall[0] - DT);
    this.passCall[1] = Math.max(0, this.passCall[1] - DT);

    const live = this.phase === 'play';
    for (const p of this.players) {
      const raw = intents[p.id] ?? NO_INTENT;
      const intent = live ? raw : NO_INTENT;
      this.updatePlayer(p, intent, raw);
    }
    this.separatePlayers();
    this.updateBall();

    switch (this.phase) {
      case 'tipoff':
        if (this.phaseT > 1.4) {
          this.setPhase('play');
          this.emit('whistle', COURT.midX, 80, HOOP.z);
        }
        break;
      case 'play': {
        if (!this.clockExpired) {
          this.clock -= DT;
          if (this.clock <= 0) {
            this.clock = 0;
            this.clockExpired = true;
            this.emit('buzzer', COURT.midX, 80, HOOP.z);
          }
        }
        const b = this.ball;
        if (b.state === 'held' || b.state === 'pass') {
          this.shotClock -= DT;
          if (this.shotClock <= 0) {
            this.nextPossession = (1 - this.possession) as TeamId;
            this.emit('violation', b.x, 120, b.z, { text: 'SHOT CLOCK!' });
            this.setPhase('turnover');
          }
        }
        if (this.clockExpired && b.state !== 'shot' && this.phase === 'play') this.resolveClockEnd();
        break;
      }
      case 'score':
        if (this.phaseT > 1.5) {
          if (this.winner !== null) this.setPhase('end');
          else {
            this.resetFormation(this.nextPossession);
            this.setPhase('play');
          }
        }
        break;
      case 'turnover':
        if (this.phaseT > 1.1) {
          this.resetFormation(this.nextPossession);
          this.setPhase('play');
        }
        break;
      case 'end':
        break;
    }
  }

  private setPhase(ph: Phase) {
    this.phase = ph;
    this.phaseT = 0;
  }

  private resolveClockEnd() {
    if (this.score[0] === this.score[1]) {
      if (!this.suddenDeath) {
        this.suddenDeath = true;
        this.emit('suddendeath', COURT.midX, 120, HOOP.z, { text: 'SUDDEN DEATH' });
      }
      return;
    }
    this.winner = this.score[0] > this.score[1] ? 0 : 1;
    this.emit('final', COURT.midX, 120, HOOP.z);
    this.setPhase('end');
  }

  // ---------------------------------------------------------------- players

  private updatePlayer(p: Player, intent: Intent, raw: Intent) {
    const pressedShoot = intent.shoot && !p.prev.shoot;
    const pressedAction = intent.action && !p.prev.action;
    const pressedSpecial = intent.special && !p.prev.special;
    p.prev.shoot = raw.shoot;
    p.prev.action = raw.action;
    p.prev.special = raw.special;

    p.t += DT;
    p.invuln = Math.max(0, p.invuln - DT);
    p.pickupCd = Math.max(0, p.pickupCd - DT);
    p.hitTimer -= DT;
    if (p.hitTimer <= 0) p.hits = 0;

    const hasBall = this.ball.holder === p.id;
    const airborne = p.y > 0 || p.vy > 0;

    switch (p.state) {
      case 'down':
        p.vx *= 0.9; p.vz *= 0.9;
        if (p.t > 1.1 && !airborne) { p.state = 'move'; p.t = 0; p.invuln = 0.7; }
        break;
      case 'stun':
        p.vx *= 0.88; p.vz *= 0.88;
        // A short protection window after a jab, so jabs cannot be chained into a stun-lock.
        if (p.t > 0.3) { p.state = airborne ? 'jump' : 'move'; p.t = 0; p.invuln = Math.max(p.invuln, 0.4); }
        break;
      case 'punch':
        p.vx *= 0.85; p.vz *= 0.85;
        if (!p.punchHit && p.t > 0.05 && p.t < 0.14) this.checkHit(p, 48, 24, false);
        if (p.t > 0.26) { p.state = 'move'; p.t = 0; }
        break;
      case 'tackle': {
        const active = p.t < (p.blitz ? 0.45 : 0.3) && !p.punchHit;
        if (active) {
          if (p.blitz && this.homeBlitz(p)) break;
          this.checkHit(p, 42, 28, true);
          if (p.punchHit) { p.vx *= 0.3; p.vz *= 0.3; }
        } else {
          p.vx *= 0.86; p.vz *= 0.86;
        }
        // A missed tackle slides for longer: that is the price of committing.
        if (p.t > (p.punchHit ? 0.42 : 0.62)) { p.state = 'move'; p.t = 0; p.blitz = false; }
        break;
      }
      case 'airkick':
        if (!p.punchHit) this.checkHit(p, 46, 26, true);
        break;
      case 'spin':
        if (p.t > 0.28) { p.state = 'move'; p.t = 0; }
        break;
      case 'pass':
        p.vx *= 0.8; p.vz *= 0.8;
        if (p.t > 0.16) { p.state = 'move'; p.t = 0; }
        break;
      case 'dunk':
        this.updateDunk(p);
        return; // dunk drives its own position
      case 'hang':
        p.vx = p.vz = 0;
        if (p.t <= 0.32) { p.vy = 0; return; }
        p.state = 'jump'; p.t = 0; p.vy = -50;
        break;
      case 'shoot':
        // Airborne with the ball: release on button up.
        if (hasBall && !p.released && !intent.shoot) this.releaseShot(p, false);
        break;
      case 'jump':
        if (!hasBall && pressedAction && p.y > 8) {
          p.state = 'airkick'; p.t = 0; p.punchHit = false;
          if (intent.face) p.facing = intent.face;
          else if (Math.abs(intent.mx) > 0.15) p.facing = intent.mx > 0 ? 1 : -1;
          p.vx = p.facing * 250;
          this.emit('tackle', p.x, p.y + 30, p.z, { player: p.id });
        }
        break;
      case 'move': {
        const sprinting = intent.sprint && p.stamina > 0.05 && (Math.abs(intent.mx) + Math.abs(intent.mz) > 0.1);
        const spd = RUN_SPEED * (0.82 + 0.36 * p.def.speed) * (sprinting ? SPRINT_MUL : 1) * (hasBall ? 0.93 : 1);
        let mx = intent.mx, mz = intent.mz;
        const mag = Math.hypot(mx, mz);
        if (mag > 1) { mx /= mag; mz /= mag; }
        const tvx = mx * spd, tvz = mz * spd * 0.75;
        const k = Math.min(1, 12 * DT);
        p.vx += (tvx - p.vx) * k;
        p.vz += (tvz - p.vz) * k;
        if (Math.abs(intent.mx) > 0.15) p.facing = intent.mx > 0 ? 1 : -1;
        if (intent.face) p.facing = intent.face;
        p.stamina = clamp(p.stamina + (sprinting ? -0.38 : 0.2) * DT, 0, 1);

        const full = this.hype[p.team] >= 1;
        if (hasBall) {
          if (pressedSpecial) {
            if (!full) this.startSpin(p, mx, mz);
            else if (p.def.special === 'slam') this.megaSlam(p);
            else this.specialShot(p);
          } else if (pressedShoot) {
            const hx = attackHoopX(p.team);
            const d = distXZ(p.x, p.z, hx, HOOP.z);
            const towardHoop = Math.sign(hx - p.x) === Math.sign(p.vx) || d < 70;
            if (d < DUNK_RANGE && (sprinting || d < 95) && towardHoop) this.startDunk(p);
            else this.startJumpShot(p);
          } else if (pressedAction) this.passToMate(p);
        } else {
          const h = this.holder();
          const mateHasBall = !!h && h.team === p.team && this.ball.state === 'held';
          if (pressedSpecial) {
            if (!full) this.startSpin(p, mx, mz);
            else if (p.def.defSpecial === 'blitz') this.startBlitz(p);
            else this.shockwave(p);
          } else if (pressedShoot) {
            p.state = 'jump'; p.t = 0; p.vy = JUMP_V * (0.85 + 0.3 * p.def.jump);
            // Jumping near the rim while a teammate has the ball asks for a lob.
            const lob = mateHasBall && distXZ(p.x, p.z, attackHoopX(p.team), HOOP.z) < 200;
            this.emit('jump', p.x, 0, p.z, { player: p.id, text: lob ? 'LOB!' : undefined });
          } else if (pressedAction) {
            if (mateHasBall) this.passCall[p.team] = 0.8;
            else if (sprinting) this.startTackle(p, mx, mz);
            else {
              p.state = 'punch'; p.t = 0; p.punchHit = false;
              p.vx += p.facing * 70;
            }
          }
        }
        break;
      }
    }

    // Integrate.
    if (p.y > 0 || p.vy > 0) {
      p.vy -= GRAVITY * DT;
      p.y += p.vy * DT;
      p.vx *= 0.995;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        if (p.state === 'shoot' && this.ball.holder === p.id && !p.released) this.releaseShot(p, true);
        if (p.state === 'jump' || p.state === 'shoot' || p.state === 'airkick') { p.state = 'move'; p.t = 0; }
        this.emit('land', p.x, 0, p.z, { player: p.id });
      }
    }
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    if (p.x < COURT.minX) { p.x = COURT.minX; p.vx = Math.max(0, p.vx); }
    if (p.x > COURT.maxX) { p.x = COURT.maxX; p.vx = Math.min(0, p.vx); }
    if (p.z < COURT.minZ) { p.z = COURT.minZ; p.vz = Math.max(0, p.vz); }
    if (p.z > COURT.maxZ) { p.z = COURT.maxZ; p.vz = Math.min(0, p.vz); }
    if (p.y === 0) p.anim += Math.hypot(p.vx, p.vz) * DT;
  }

  private separatePlayers() {
    const ps = this.players;
    const ghost = (q: Player) => q.state === 'dunk' || q.state === 'down' || q.state === 'spin';
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (ghost(a) || ghost(b)) continue;
        if (Math.abs(a.y - b.y) > 50) continue;
        const dx = b.x - a.x, dz = (b.z - a.z) * 1.4;
        const d = Math.hypot(dx, dz);
        const min = 22;
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; b.x += nx * push;
          a.z -= (nz * push) / 1.4; b.z += (nz * push) / 1.4;
        }
      }
    }
  }

  // ---------------------------------------------------------------- shooting

  private startJumpShot(p: Player) {
    p.state = 'shoot';
    p.t = 0;
    p.released = false;
    p.vy = JUMP_V * (0.85 + 0.3 * p.def.jump);
    p.vx *= 0.5; p.vz *= 0.5;
    p.facing = attackHoopX(p.team) > p.x ? 1 : -1;
    this.emit('jump', p.x, 0, p.z, { player: p.id });
  }

  /**
   * Skill shot: a release inside the window around the top of the jump always scores.
   * Outside it, the chance drops quickly with how far the timing was off.
   */
  private releaseShot(p: Player, landed: boolean) {
    p.released = true;
    const hx = attackHoopX(p.team);
    const d = distXZ(p.x, p.z, hx, HOOP.z);
    const off = landed ? 1 : Math.abs(p.vy) / GRAVITY;
    const W = this.shotWindow(p);
    const perfect = !landed && off <= W;
    let made = perfect;
    if (!perfect) {
      const distK = d <= 200 ? 1 : d >= 520 ? 0.3 : 1 - ((d - 200) / 320) * 0.7;
      const prob = clamp((0.55 - (off - W) * 3.2) * distK * (0.85 + 0.3 * p.def.shoot), 0.03, 0.55);
      made = this.rng() < prob;
    }
    const points = d > THREE_PT ? 3 : 2;
    const st = this.stats[p.team];
    st.fga++;
    if (points === 3) st.tpa++;
    this.launchShot(p, made, points, false);
    this.emit('shoot', p.x, p.y + HAND_Y, p.z, { player: p.id, team: p.team, text: perfect ? 'PERFECT' : undefined });
  }

  private launchShot(p: Player, made: boolean, points: number, special: boolean) {
    const b = this.ball;
    const hx = attackHoopX(p.team);
    b.x = p.x + p.facing * 10;
    b.y = p.y + HAND_Y + 18;
    b.z = p.z;
    let tx = hx, tz = HOOP.z;
    const ty = HOOP.rimY + 2;
    if (!made) {
      const a = this.rng() * Math.PI * 2;
      const r = 13 + this.rng() * 12;
      tx += Math.cos(a) * r;
      tz += Math.sin(a) * r * 0.7;
    }
    const dxz = distXZ(b.x, b.z, tx, tz);
    const T = special ? 0.95 : clamp(0.5 + dxz / 950, 0.55, 1.1);
    b.vx = (tx - b.x) / T;
    b.vz = (tz - b.z) / T;
    b.vy = (ty - b.y) / T + 0.5 * GRAVITY * T;
    b.state = 'shot';
    b.holder = null;
    b.afterShot = true;
    b.shot = { made, points, team: p.team, shooter: p.id, t: 0, T, special, hoopX: hx };
  }

  // ---------------------------------------------------------------- specials

  private specialShot(p: Player) {
    this.hype[p.team] = 0;
    const hx = attackHoopX(p.team);
    const d = distXZ(p.x, p.z, hx, HOOP.z);
    const points = d > THREE_PT ? 3 : 2;
    const st = this.stats[p.team];
    st.fga++;
    if (points === 3) st.tpa++;
    p.state = 'shoot';
    p.released = true;
    p.t = 0;
    p.vy = JUMP_V * 1.1;
    p.facing = hx > p.x ? 1 : -1;
    this.launchShot(p, true, points, true);
    this.emit('special', p.x, p.y + 60, p.z, { player: p.id, team: p.team, text: 'COMET SHOT!' });
  }

  /** Unstoppable flying dunk from anywhere: floors everyone in the way, worth 3. */
  private megaSlam(p: Player) {
    this.hype[p.team] = 0;
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    const T = clamp(0.45 + distXZ(p.x, p.z, hx, HOOP.z) / 850, 0.55, 1.25);
    p.state = 'dunk';
    p.t = 0;
    p.facing = dir;
    p.invuln = T + 0.3;
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * 12, tz: HOOP.z + 4, T, kind: 'mega' };
    this.stats[p.team].fga++;
    this.hitstop = 0.12;
    this.emit('megaslam', p.x, p.y + 60, p.z, { player: p.id, team: p.team, text: 'MEGA SLAM!' });
  }

  private shockwave(p: Player) {
    this.hype[p.team] = 0;
    this.emit('shockwave', p.x, 30, p.z, { player: p.id, team: p.team, text: 'SHOCKWAVE!' });
    for (const o of this.opponents(p)) {
      if (!this.hittable(o)) continue;
      if (distXZ(p.x, p.z, o.x, o.z) < 140) this.knockDown(o, o.x >= p.x ? 1 : -1, p.team, 340);
    }
    p.state = 'punch'; p.t = 0; p.punchHit = true;
    this.hitstop = 0.12;
  }

  /** Homing, invulnerable tackle that chases the ball carrier across the court. */
  private startBlitz(p: Player) {
    this.hype[p.team] = 0;
    p.state = 'tackle';
    p.t = 0;
    p.punchHit = false;
    p.blitz = true;
    p.invuln = 0.5;
    this.hitstop = 0.1;
    this.emit('blitz', p.x, 30, p.z, { player: p.id, team: p.team, text: 'BLITZ!' });
  }

  /** Steers a Blitz toward its target. Returns true when it reached a loose ball and ended. */
  private homeBlitz(p: Player): boolean {
    const h = this.holder();
    let tx = this.ball.x, tz = this.ball.z;
    let chasingBall = !h;
    if (h && h.team !== p.team) { tx = h.x; tz = h.z; }
    else if (h) {
      // Own team has the ball: go for the nearest opponent instead.
      let best = Infinity;
      for (const o of this.opponents(p)) {
        const dd = distXZ(p.x, p.z, o.x, o.z);
        if (dd < best) { best = dd; tx = o.x; tz = o.z; }
      }
      chasingBall = false;
    }
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (chasingBall && d < 18) {
      p.state = 'move'; p.t = 0; p.blitz = false;
      p.vx *= 0.2; p.vz *= 0.2;
      return true;
    }
    if (d > 1) {
      p.vx = (dx / d) * 780;
      p.vz = (dz / d) * 780;
      if (Math.abs(dx) > 4) p.facing = dx > 0 ? 1 : -1;
    }
    return false;
  }

  // ---------------------------------------------------------------- moves

  private startTackle(p: Player, mx: number, mz: number) {
    const m = Math.hypot(mx, mz) || 1;
    p.state = 'tackle';
    p.t = 0;
    p.punchHit = false;
    p.blitz = false;
    p.vx = (mx / m) * 430;
    p.vz = (mz / m) * 430 * 0.75;
    if (Math.abs(mx) > 0.15) p.facing = mx > 0 ? 1 : -1;
    p.stamina = Math.max(0, p.stamina - 0.2);
    this.emit('tackle', p.x, 20, p.z, { player: p.id });
  }

  /** Dodge: a short dash that cannot be hit and slips through defenders. Works with or without the ball. */
  private startSpin(p: Player, mx: number, mz: number) {
    if (p.stamina < 0.25) return;
    const m = Math.hypot(mx, mz);
    if (m < 0.1) { mx = p.facing; mz = 0; } else { mx /= m; mz /= m; }
    p.state = 'spin';
    p.t = 0;
    p.invuln = 0.32;
    p.stamina -= 0.25;
    p.vx = mx * 400;
    p.vz = mz * 400 * 0.75;
    this.emit('spin', p.x, 20, p.z, { player: p.id });
  }

  private startDunk(p: Player) {
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    p.state = 'dunk';
    p.t = 0;
    p.facing = dir;
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * 12, tz: HOOP.z + 4, T: DUNK_TIME, kind: 'dunk' };
    this.stats[p.team].fga++;
    this.emit('jump', p.x, 0, p.z, { player: p.id, text: 'DUNK!' });
  }

  private startOop(p: Player) {
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    p.state = 'dunk';
    p.t = 0;
    p.facing = dir;
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * 12, tz: HOOP.z + 4, T: 0.36, kind: 'oop' };
    this.stats[p.team].fga++;
  }

  /** A dunk always goes in unless the dunker is hit out of the air first. */
  private updateDunk(p: Player) {
    const d = p.dunk!;
    const u = Math.min(1, p.t / d.T);
    const e = u * u * (3 - 2 * u);
    const prevY = p.y;
    const top = HOOP.rimY - 46;
    const arc = d.kind === 'mega' ? 120 : 70 * Math.max(0, 1 - d.sy / 90);
    p.x = d.sx + (d.tx - d.sx) * e;
    p.z = d.sz + (d.tz - d.sz) * e;
    p.y = d.sy + (top - d.sy) * e + Math.sin(Math.PI * u) * arc;
    p.vy = (p.y - prevY) / DT;
    p.vx = p.vz = 0;
    if (d.kind === 'mega') {
      for (const o of this.opponents(p)) {
        if (!this.hittable(o)) continue;
        // The slam flies high, so it floors anyone it passes over as well as anyone it meets.
        if (distXZ(p.x, p.z, o.x, o.z) < 44 && o.y < p.y + 80) this.knockDown(o, p.facing, p.team, 320);
      }
    }
    if (u < 1) return;
    const b = this.ball;
    if (b.holder !== p.id) { p.state = 'jump'; p.t = 0; p.vy = 0; return; }
    const points = d.kind === 'mega' ? 3 : 2;
    b.holder = null;
    b.x = attackHoopX(p.team);
    b.z = HOOP.z;
    b.y = HOOP.rimY - 4;
    b.vx = b.vz = 0;
    b.vy = -260;
    b.state = 'scored';
    b.afterShot = true;
    this.stats[p.team].dunks++;
    this.awardPoints(p.team, points, p.id, true);
    const text = d.kind === 'mega' ? 'MEGA SLAM!' : d.kind === 'oop' ? 'ALLEY-OOP!' : 'SLAM DUNK!';
    this.emit('dunk', b.x, HOOP.rimY, b.z, { player: p.id, team: p.team, points, text });
    p.state = 'hang';
    p.t = 0;
    this.hitstop = d.kind === 'dunk' ? 0.1 : 0.16;
  }

  private passToMate(p: Player) {
    const mate = this.teammate(p);
    if (!this.canAct(mate)) return;
    const b = this.ball;
    const hx = attackHoopX(p.team);
    const d0 = distXZ(p.x, p.z, mate.x, mate.z);
    // A teammate in the air near the rim gets a lob for an alley-oop.
    let oop = mate.state === 'jump' && mate.y > 6 && mate.vy > -260 && distXZ(mate.x, mate.z, hx, HOOP.z) < 200;
    let T = oop ? clamp(d0 / 900, 0.12, 0.36) : clamp(d0 / 720, 0.16, 0.7);
    let predY = Math.max(0, mate.y + mate.vy * T - 0.5 * GRAVITY * T * T);
    if (oop && predY < 10) {
      oop = false;
      T = clamp(d0 / 720, 0.16, 0.7);
      predY = 0;
    }
    const tx = clamp(mate.x + mate.vx * T, COURT.minX, COURT.maxX);
    const tz = clamp(mate.z + mate.vz * T, COURT.minZ, COURT.maxZ);
    const ty = predY + HAND_Y + (oop ? 14 : 0);
    b.x = p.x + p.facing * 10; b.y = p.y + HAND_Y; b.z = p.z;
    b.vx = (tx - b.x) / T;
    b.vz = (tz - b.z) / T;
    b.vy = (ty - b.y) / T + 0.5 * GRAVITY * T;
    b.state = 'pass';
    b.holder = null;
    b.pass = { from: p.id, to: mate.id, t: 0, T, oop };
    p.state = 'pass';
    p.t = 0;
    p.facing = tx > p.x ? 1 : -1;
    this.passCall[p.team] = 0;
    this.emit(oop ? 'oop' : 'pass', b.x, b.y, b.z, { player: p.id });
  }

  // ---------------------------------------------------------------- fighting

  /** Hit test for the attacker's current move. Heavy moves (tackle, air kick) always knock down. */
  private checkHit(a: Player, reach: number, zr: number, heavy: boolean) {
    for (const o of this.opponents(a)) {
      if (!this.hittable(o)) continue;
      if (!heavy && o.state === 'stun') continue;
      const dx = (o.x - a.x) * a.facing;
      if (dx < -6 || dx > reach) continue;
      if (Math.abs(o.z - a.z) > zr) continue;
      if (Math.abs(o.y - a.y) > 58) continue;
      a.punchHit = true;
      this.hitPlayer(o, a, heavy);
      return;
    }
  }

  private hitPlayer(o: Player, a: Player, forceHeavy: boolean) {
    o.hits++;
    o.hitTimer = 1.6;
    this.stats[a.team].hits++;
    this.addHype(a.team, forceHeavy ? 0.1 : 0.07);
    // Knockdowns come from heavy moves, a third hit in a row, or catching someone in the air.
    // A plain jab only staggers: it never takes the ball.
    const heavy = forceHeavy || o.hits >= 3 || o.state === 'dunk' || o.y > 12;
    if (heavy) {
      this.knockDown(o, a.facing, a.team, 260 + 120 * a.def.power);
    } else {
      o.state = 'stun';
      o.t = 0;
      o.vx = a.facing * (150 + 80 * a.def.power);
      this.hitstop = Math.max(this.hitstop, 0.05);
      this.emit('hit', o.x, o.y + 46, o.z, { player: o.id, team: a.team });
    }
  }

  private knockDown(o: Player, dir: number, byTeam: TeamId, force: number) {
    if (this.ball.holder === o.id) this.fumble(o, dir, byTeam);
    o.state = 'down';
    o.t = 0;
    o.hits = 0;
    o.blitz = false;
    o.vx = dir * force;
    o.vz *= 0.3;
    if (o.y > 0) o.vy = Math.max(o.vy, 60);
    this.stats[byTeam].kos++;
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.emit('ko', o.x, o.y + 40, o.z, { player: o.id, team: byTeam });
  }

  private fumble(o: Player, dir: number, byTeam: TeamId) {
    const b = this.ball;
    b.state = 'loose';
    b.holder = null;
    b.x = o.x + dir * 8;
    b.y = Math.max(20, o.y + HAND_Y);
    b.z = o.z;
    b.vx = dir * (140 + this.rng() * 90);
    b.vz = (this.rng() - 0.5) * 160;
    b.vy = 240;
    o.pickupCd = 0.5;
    o.released = true;
    this.stats[byTeam].steals++;
    this.addHype(byTeam, 0.05);
    this.emit('fumble', b.x, b.y, b.z, { player: o.id, team: byTeam, text: 'STRIPPED!' });
  }

  private awardPoints(team: TeamId, points: number, shooter: number, dunk: boolean) {
    this.score[team] += points;
    const st = this.stats[team];
    st.fgm++;
    if (points === 3 && !dunk) st.tpm++;
    this.addHype(team, dunk ? 0.22 : 0.15);
    this.addHype((1 - team) as TeamId, 0.06);
    this.nextPossession = (1 - team) as TeamId;
    const s = this.players[shooter];
    this.emit('score', attackHoopX(team), HOOP.rimY, HOOP.z, { team, points, player: shooter, text: `${s.def.name.toUpperCase()} +${points}` });
    if (this.suddenDeath || this.clockExpired) {
      if (this.score[0] !== this.score[1]) {
        this.winner = this.score[0] > this.score[1] ? 0 : 1;
        this.emit('final', COURT.midX, 120, HOOP.z);
      }
    }
    if (this.phase === 'play') this.setPhase('score');
  }

  // ---------------------------------------------------------------- ball

  private updateBall() {
    const b = this.ball;
    b.spin += DT * (Math.abs(b.vx) + Math.abs(b.vz)) * 0.05;
    if (b.state === 'held') {
      const h = this.holder()!;
      const moving = Math.hypot(h.vx, h.vz) > 20 && h.y === 0 && h.state === 'move';
      const dribble = moving ? Math.abs(Math.sin(this.time * 9)) : 1;
      b.x = h.x + h.facing * 14;
      b.z = h.z + 2;
      b.y = h.y === 0 && h.state === 'move' ? 6 + (HAND_Y - 6) * dribble : h.y + HAND_Y + (h.state === 'shoot' || h.state === 'dunk' ? 24 : 0);
      if (moving && b.y < 9 && !this.dribbleLatch) { this.dribbleLatch = true; this.emit('bounce', b.x, 0, b.z, { text: 'dribble' }); }
      if (b.y > 20) this.dribbleLatch = false;
      b.vx = h.vx; b.vz = h.vz; b.vy = 0;
      return;
    }

    b.vy -= GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.z += b.vz * DT;

    if (b.state === 'shot') this.updateShot();
    else if (b.state === 'pass') this.updatePass();
    else if (b.state === 'scored') {
      b.vx *= 0.9; b.vz *= 0.9;
    }

    // Floor and walls.
    if (b.y < 5) {
      b.y = 5;
      if (b.vy < -70) this.emit('bounce', b.x, 0, b.z);
      b.vy = Math.abs(b.vy) > 70 ? -b.vy * 0.62 : 0;
      b.vx *= 0.86; b.vz *= 0.86;
      if (b.state === 'pass') { b.state = 'loose'; b.pass = undefined; }
      if (b.state === 'shot') { b.state = 'loose'; b.shot = undefined; }
    }
    if (b.y <= 5.5 && b.vy === 0) { b.vx *= 0.985; b.vz *= 0.985; }
    if (b.x < COURT.minX - 10) { b.x = COURT.minX - 10; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > COURT.maxX + 10) { b.x = COURT.maxX + 10; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.z < COURT.minZ - 6) { b.z = COURT.minZ - 6; b.vz = Math.abs(b.vz) * 0.6; }
    if (b.z > COURT.maxZ + 6) { b.z = COURT.maxZ + 6; b.vz = -Math.abs(b.vz) * 0.6; }

    if (b.state === 'loose' && this.phase === 'play') this.tryPickup();
  }

  private updateShot() {
    const b = this.ball;
    const s = b.shot!;
    s.t += DT;
    if (!s.special && s.t < s.T * 0.5) {
      for (const p of this.players) {
        if (p.team === s.team || !this.canAct(p) || p.y < 18) continue;
        if (distXZ(p.x, p.z, b.x, b.z) < 46 && Math.abs(b.y - (p.y + 74)) < 42) {
          b.state = 'loose';
          b.shot = undefined;
          b.vx = -b.vx * 0.35 + (this.rng() - 0.5) * 80;
          b.vz = (this.rng() - 0.5) * 200;
          b.vy = 160;
          this.stats[p.team].blocks++;
          this.addHype(p.team, 0.12);
          this.emit('block', b.x, b.y, b.z, { player: p.id, team: p.team, text: 'REJECTED!' });
          return;
        }
      }
    }
    if (s.special) {
      for (const p of this.players) {
        if (p.team === s.team || !this.hittable(p)) continue;
        if (distXZ(p.x, p.z, b.x, b.z) < 30 && b.y < p.y + 90) this.knockDown(p, Math.sign(b.vx) || 1, s.team, 300);
      }
    }
    if (s.t >= s.T) {
      if (s.made) {
        b.x = s.hoopX;
        b.z = HOOP.z;
        b.y = HOOP.rimY - 2;
        b.vx = b.vz = 0;
        b.vy = -150;
        b.state = 'scored';
        b.shot = undefined;
        this.emit('swish', b.x, b.y, b.z, { team: s.team });
        this.awardPoints(s.team, s.points, s.shooter, false);
      } else {
        const out = s.hoopX < COURT.midX ? 1 : -1;
        b.state = 'loose';
        b.shot = undefined;
        b.vy = 200 + this.rng() * 230;
        b.vx = out * (60 + this.rng() * 220) * (this.rng() < 0.82 ? 1 : -0.6);
        b.vz = (this.rng() - 0.5) * 260;
        this.emit('rim', b.x, b.y, b.z);
      }
      if (this.clockExpired && this.phase === 'play') this.resolveClockEnd();
    }
  }

  private updatePass() {
    const b = this.ball;
    const ps = b.pass!;
    ps.t += DT;
    const passer = this.players[ps.from];
    for (const o of this.players) {
      if (o.team === passer.team || !this.canAct(o) || o.pickupCd > 0 || ps.t < 0.08) continue;
      if (distXZ(o.x, o.z, b.x, b.z) < 20 && b.y > o.y && b.y < o.y + 84) {
        this.stats[o.team].steals++;
        this.addHype(o.team, 0.1);
        this.emit('steal', b.x, b.y, b.z, { player: o.id, team: o.team, text: 'PICKED OFF!' });
        this.giveBall(o, true);
        return;
      }
    }
    const r = this.players[ps.to];
    const oop = ps.oop;
    const reach = oop ? 50 : 32, vr = oop ? 66 : 44;
    if (this.canAct(r) && distXZ(r.x, r.z, b.x, b.z) < reach && Math.abs(b.y - (r.y + HAND_Y)) < vr) {
      this.giveBall(r);
      if (oop && r.y > 8 && r.state === 'jump') this.startOop(r);
      return;
    }
    if (ps.t > ps.T + 0.3) { b.state = 'loose'; b.pass = undefined; }
  }

  private tryPickup() {
    const b = this.ball;
    let best: Player | null = null;
    let bestD = 28;
    for (const p of this.players) {
      if (!this.canAct(p) || p.pickupCd > 0) continue;
      if (p.state === 'punch' || p.state === 'tackle' || p.state === 'airkick') continue;
      if (b.y > p.y + 92 || b.y < p.y - 10) continue;
      const d = distXZ(p.x, p.z, b.x, b.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      const rebound = this.ball.afterShot;
      this.giveBall(best);
      if (best.y > 0) { best.state = 'jump'; best.released = true; }
      if (rebound && b.y > 60) this.emit('catch', b.x, b.y, b.z, { player: best.id, text: 'BOARD!' });
    }
  }
}
