import {
  BODY, COURT, DT, DUNK_FEET, DUNK_RANGE, DUNK_STAND, DUNK_TIME, HANG_FEET, HANG_TIME, GRAVITY, HAND_Y, HOOP, JUMP_V, RUN_SPEED, SHOT_CLOCK,
  SPRINT_MUL, THREE_PT, TeamId, attackDir, attackHoopX, ownHoopX, DEFAULT_MATCH_SECONDS,
  BALL_R, GRAB_CLINCH, GRAB_COOLDOWN, GRAB_HOLD, GRAB_IMMUNE, HIGH_MIN_Y, HIGH_RIM_Y, LAUNCH_V, PAD_RECHARGE,
} from './constants';
import { makeRng } from './rng';
import { DEFAULT_STAGE } from './teams';
import type { ItemKind, PlayerDef, StageDef, TeamDef } from './teams';
import { Toys } from './toys';
import type { HitKind } from './toys';

export interface Intent {
  mx: number;
  mz: number;
  sprint: boolean;
  shoot: boolean;
  action: boolean;
  special: boolean;
  /** Optional facing override (AI uses it to aim punches). */
  face?: 1 | -1;
  /** Walking into an opponent grabs them. People always grab; the computer only when it means to. */
  grab?: boolean;
}

export const NO_INTENT: Intent = { mx: 0, mz: 0, sprint: false, shoot: false, action: false, special: false };

export type PState =
  | 'move' | 'jump' | 'shoot' | 'punch' | 'stun' | 'down' | 'dunk' | 'pass' | 'hang'
  | 'tackle' | 'airkick' | 'spin' | 'grab' | 'held' | 'toss'
  | 'pound' | 'spray' | 'ride' | 'beam';

export type DunkKind = 'dunk' | 'oop' | 'mega' | 'sky';

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
  /** Who this fighter's current punch landed on (-1: nobody yet). The fist is drawn on them. */
  hitId: number;
  /** The current tackle is a Blitz special (homing, invulnerable). */
  blitz: boolean;
  /** In the air off a launch pad. */
  launched: boolean;
  padCd: number;
  /** Hit pause: seconds this fighter stays frozen on the frame of impact. */
  freeze: number;
  /** Seconds a press of the pass button stays buffered. */
  actBuf: number;
  /** Seconds a press of the shoot button stays buffered for fighting, so combo inputs are not dropped. */
  atkBuf: number;
  /** After a fight press, the shoot button will not shoot until it has been left alone this long. */
  shootLock: number;
  /** Where the last blow landed: 0 head, 1 body, 2 chin (an uppercut). Picks the reaction. */
  hitZone: number;
  /** Which strike of the punch combo this is: 0 jab, 1 cross, 2 finisher. */
  combo: number;
  /** How long the current stagger lasts. */
  stunFor: number;
  /** A knocked-down body has already bounced once / already bowled a teammate over. */
  bounced: boolean;
  bowled: boolean;
  /** Grabs: who this player is holding, who is holding them (-1 = nobody). */
  grabId: number;
  heldBy: number;
  /** How long this player has been pushing into an opponent, and the cooldown before the next grab. */
  pushT: number;
  grabCd: number;
  /** Knee strikes landed in the current grab, and time left on the knee animation. */
  knees: number;
  kneeT: number;
  /** Throws: which way this player is throwing, and (for the victim) whether they were thrown. */
  tossDir: number;
  thrown: boolean;
  /** Body rotation on screen (clockwise, radians) while being swung or spinning through the air. */
  rot: number;
  spinRate: number;
  /** Time left doubling over from a knee, and how long the current knockdown lasts. */
  flinch: number;
  downFor: number;
  /** The ride this player is on (-1 = on foot), and the delay before they can get on one again. */
  rideId: number;
  rideCd: number;
  /** Seconds left on the magnet and the spring shoes. */
  magnetT: number;
  springT: number;
  /** This knockdown: already went through a hoop, who caused it, and how many times it was juggled. */
  bodyDunked: boolean;
  downBy: number;
  juggles: number;
  /** The current swing is with a bat. */
  weapon: 'bat' | null;
  /** The current throw is aimed at the hoop. */
  tossHoop: boolean;
  /** Distance walked, drives the run cycle. */
  anim: number;
  /** Shot released this jump (so we do not release twice). */
  released: boolean;
  dunk?: { sx: number; sy: number; sz: number; tx: number; tz: number; T: number; kind: DunkKind; rimY: number };
  prev: { shoot: boolean; action: boolean; special: boolean };
}

export type BallState = 'held' | 'loose' | 'shot' | 'pass' | 'scored';

export interface Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  state: BallState;
  holder: number | null;
  lastTeam: TeamId;
  /** Drawn rotation angle (follows the real spin below). */
  spin: number;
  /** Angular velocity in radians a second, about the x, y and z axes. A ball rolling toward +x has wz = -vx / r. */
  wx: number; wy: number; wz: number;
  afterShot: boolean;
  /** Seconds before the ball can be struck again, and how hard it was last struck (0 no, 1 fist, 2 bat). */
  struck: number;
  hot: number;
  shot?: { made: boolean; points: number; team: TeamId; shooter: number; t: number; T: number; special: boolean; hoopX: number; rimY: number; three: boolean; touched: boolean; board: boolean };
  pass?: { from: number; to: number; t: number; T: number; oop: boolean };
}

export type GameEventType =
  | 'bounce' | 'swish' | 'rim' | 'hit' | 'ko' | 'whistle' | 'block' | 'steal' | 'fumble'
  | 'shoot' | 'dunk' | 'pass' | 'catch' | 'special' | 'buzzer' | 'score' | 'jump' | 'land'
  | 'violation' | 'suddendeath' | 'final' | 'shockwave' | 'tipoff'
  | 'tackle' | 'spin' | 'oop' | 'blitz' | 'megaslam'
  | 'launch' | 'item' | 'throw' | 'itemhit' | 'swing' | 'slam' | 'board' | 'grab' | 'hurl'
  | 'boom' | 'spray' | 'slip' | 'crack' | 'rimbreak' | 'rimfix' | 'bodydunk' | 'warn' | 'bump'
  | 'gust' | 'event' | 'eventend' | 'beam' | 'clang' | 'mount' | 'juggle' | 'boost';

export interface GameEvent {
  type: GameEventType;
  x: number; y: number; z: number;
  team?: TeamId;
  points?: number;
  player?: number;
  text?: string;
  /** Strength of a hit or landing: 1 light, 2 heavy. */
  power?: number;
}

/** An object lying on the court, carried by a player, or flying. */
export interface Item {
  id: number;
  kind: ItemKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  state: 'ground' | 'held' | 'thrown';
  holder: number | null;
  team: TeamId | null;
  spin: number;
  /** Bomb: seconds until it goes off (-1 = not lit yet). */
  fuse: number;
  /** Swings, slams or sprays left. */
  uses: number;
  /** A banana lying in wait on the floor. */
  armed: boolean;
}

/** How heavy a player is next to an average one (1): bigger builds and stronger players weigh more. */
export function massOf(d: PlayerDef): number {
  return (d.build * d.build * (0.8 + 0.25 * d.power)) / 0.95;
}

export interface Rim { x: number; y: number; high: boolean; dir: number; boardX: number; top: number; hp: number; brokenT: number }

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
  /** Launch pads and item drops (defaults to the Rooftop layout). */
  stage?: StageDef;
  /** RIOT-meter gain multipliers per team. */
  hypeRate?: [number, number];
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
  stage: StageDef;
  hypeRate: [number, number];
  items: Item[] = [];
  /** Seconds until each launch pad is ready again (0 = ready). */
  padTimers: number[];
  lastScorer: number | null = null;
  /** Game time of the last basket (for brief reactions; play itself never stops). */
  lastScoreTime = -99;
  /** Gravity right now (an event can lower it), whether the floor is slippery, and the ball's radius. */
  grav = GRAVITY;
  slip = false;
  ballR = BALL_R;
  /** The ball is a cannonball (an event): nobody on the other side can catch it while it flies. */
  heavyBall = false;
  /** Items, hazards, events and rides. */
  toys: Toys;
  /** Knockdowns caused by the court itself rather than by a player. */
  envKos = 0;
  /** Knockdowns by cause, for the balance meter. */
  koCauses: Record<string, number> = {};
  events: GameEvent[] = [];
  readonly rng: () => number;
  private nextPossession: TeamId = 0;
  /** Every rim on the court: the lower and upper hoop at each end. `dir` points from the backboard out onto the court. */
  readonly rims: Rim[] = [HOOP.leftX, HOOP.rightX].flatMap((x) => {
    const dir = x < COURT.midX ? 1 : -1;
    return [
      { x, y: HOOP.rimY, high: false, dir, boardX: x - dir * 22, top: HOOP.rimY + 62, hp: 6, brokenT: 0 },
      { x, y: HIGH_RIM_Y, high: true, dir, boardX: x - dir * 22, top: HIGH_RIM_Y + 50, hp: 6, brokenT: 0 },
    ];
  });
  private dribbleLatch = false;

  constructor(opts: GameOptions) {
    this.teams = [opts.home, opts.away];
    this.rng = makeRng(opts.seed ?? 1);
    this.clock = opts.matchSeconds ?? DEFAULT_MATCH_SECONDS;
    this.accuracy = opts.accuracy ?? [1, 1];
    this.stage = opts.stage ?? DEFAULT_STAGE;
    this.hypeRate = opts.hypeRate ?? [1, 1];
    this.padTimers = this.stage.launchers.map(() => 0);
    this.toys = new Toys(this);
    let id = 0;
    for (const team of [0, 1] as TeamId[]) {
      for (const slot of [0, 1] as const) {
        this.players.push({
          id: id++, team, slot, def: this.teams[team].players[slot],
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: attackDir(team),
          state: 'move', t: 0, stamina: 1, hits: 0, hitTimer: 0, invuln: 0, pickupCd: 0,
          punchHit: false, blitz: false, launched: false, padCd: 0, anim: 0, released: false,
          freeze: 0, actBuf: 0, atkBuf: 0, shootLock: 0, hitZone: 0, hitId: -1, combo: 0, stunFor: 0.36, bounced: false, bowled: false,
          grabId: -1, heldBy: -1, pushT: 0, grabCd: 0, knees: 0, kneeT: 0,
          tossDir: 1, thrown: false, rot: 0, spinRate: 0, flinch: 0, downFor: 1.1,
          rideId: -1, rideCd: 0, magnetT: 0, springT: 0, bodyDunked: false, downBy: -1, juggles: 0,
          weapon: null, tossHoop: false,
          prev: { shoot: false, action: false, special: false },
        });
      }
    }
    this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: 'held', holder: null, lastTeam: 0, spin: 0, wx: 0, wy: 0, wz: 0, afterShot: false, struck: 0, hot: 0 };
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
    return p.state !== 'down' && p.state !== 'stun' && p.state !== 'dunk' && p.state !== 'hang' && p.state !== 'held' && p.state !== 'beam';
  }
  hittable(o: Player): boolean {
    return o.state !== 'down' && o.state !== 'beam' && o.invuln <= 0;
  }
  emit(type: GameEventType, x: number, y: number, z: number, extra: Partial<GameEvent> = {}) {
    this.events.push({ type, x, y, z, ...extra });
  }
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  addHype(team: TeamId, v: number) {
    this.hype[team] = clamp(this.hype[team] + v * this.hypeRate[team], 0, 1);
  }

  /** Seconds from takeoff to the top of this player's jump. */
  apexTime(p: Player): number {
    return p.launched || p.springT > 0 ? LAUNCH_V / this.grav : (JUMP_V * (0.85 + 0.3 * p.def.jump)) / this.grav;
  }

  /** Take-off speed of this player's jump. Spring shoes make every jump a launch-pad jump. */
  private jump(p: Player) {
    if (p.springT > 0) { p.vy = LAUNCH_V; p.launched = true; }
    else p.vy = JUMP_V * (0.85 + 0.3 * p.def.jump);
  }

  /** The item this player is carrying, if any. */
  heldItem(p: Player): Item | null {
    return this.items.find((i) => i.state === 'held' && i.holder === p.id) ?? null;
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
    this.items = this.items.filter((i) => i.state !== 'thrown');
    for (const it of this.items) if (it.state === 'held') { it.state = 'ground'; it.holder = null; it.y = 0; it.vy = 0; }
    this.toys.reset();
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
      p.launched = false;
      p.padCd = 0;
      p.freeze = 0; p.actBuf = 0; p.atkBuf = 0; p.shootLock = 0; p.combo = 0; p.bounced = false; p.bowled = false;
      p.grabId = -1; p.heldBy = -1; p.pushT = 0; p.grabCd = 0; p.knees = 0; p.kneeT = 0;
      p.thrown = false; p.rot = 0; p.spinRate = 0; p.flinch = 0; p.downFor = 1.1;
      p.rideId = -1; p.rideCd = 0; p.juggles = 0; p.bodyDunked = false; p.weapon = null; p.tossHoop = false;
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

  giveBall(p: Player, silent = false) {
    this.dropItem(p);
    p.actBuf = 0; p.atkBuf = 0; // a buffered press must not turn into an instant pass
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
    this.updateStage();
    this.toys.update();
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
    const pressedSpecial = intent.special && !p.prev.special;
    // Presses are buffered for a moment so one made during a hit pause or a recovery still
    // counts. The shoot button fights when the player has no ball (takeFight); the pass button
    // passes, calls for the ball or jumps (takeAction). Each consumes its buffered press.
    if (intent.action && !p.prev.action) p.actBuf = 0.18;
    else p.actBuf = Math.max(0, p.actBuf - DT);
    if (pressedShoot) p.atkBuf = 0.18;
    else p.atkBuf = Math.max(0, p.atkBuf - DT);
    const takeAction = () => { if (p.actBuf <= 0) return false; p.actBuf = 0; return true; };
    const takeFight = () => { if (p.atkBuf <= 0) return false; p.atkBuf = 0; return true; };
    // Hammering the button in a fight must not fire off a shot the moment the ball is won: the
    // shoot button only shoots once it has been left alone for a third of a second.
    const hadLock = p.shootLock > 0;
    p.shootLock = Math.max(0, p.shootLock - DT);
    if (pressedShoot && (this.ball.holder !== p.id || hadLock)) p.shootLock = 0.34;
    const shootNow = pressedShoot && !hadLock;
    p.prev.shoot = raw.shoot;
    p.prev.action = raw.action;
    p.prev.special = raw.special;

    // Hit pause: attacker and victim hold the impact frame while the rest of the game goes on.
    if (p.freeze > 0) { p.freeze -= DT; return; }

    p.t += DT;
    p.invuln = Math.max(0, p.invuln - DT);
    p.pickupCd = Math.max(0, p.pickupCd - DT);
    p.padCd = Math.max(0, p.padCd - DT);
    p.grabCd = Math.max(0, p.grabCd - DT);

    const hasBall = this.ball.holder === p.id;
    const airborne = p.y > 0 || p.vy > 0;

    switch (p.state) {
      case 'down': {
        // A body flying or sliding fast bowls over a teammate in its path.
        if (!p.bowled && Math.hypot(p.vx, p.vz) > 200) {
          for (const o of this.players) {
            if (o.id === p.id || o.team !== p.team || !this.hittable(o) || o.state === 'dunk') continue;
            if (distXZ(p.x, p.z, o.x, o.z) < 26 && Math.abs(o.y - p.y) < 60) {
              p.bowled = true;
              this.knockDown(o, Math.sign(p.vx) || 1, (1 - p.team) as TeamId, 220, 240, 'bowled');
              o.freeze = 0.09; p.freeze = 0.09;
              p.vx *= 0.5;
              break;
            }
          }
        }
        if (airborne) {
          p.t = Math.min(p.t, 0.29); // still flying
          p.rot += p.spinRate * DT; // every knocked-down body tumbles, not only thrown ones
        } else {
          // Sliding: the floor takes speed off at a steady rate (a wet floor much less).
          const v = Math.hypot(p.vx, p.vz), dec = (this.slip ? 170 : 520) * DT;
          if (v <= dec) p.vx = p.vz = 0;
          else { p.vx *= (v - dec) / v; p.vz *= (v - dec) / v; }
          // Settle flat: on the back or on the face, whichever the tumble left nearer.
          const lie = Math.round((p.rot - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
          p.rot += (lie - p.rot) * 0.3;
          p.spinRate = 0;
          if (p.t > p.downFor) { p.state = 'move'; p.t = 0; p.invuln = 0.7; p.hits = 0; p.rot = 0; }
        }
        break;
      }
      case 'stun': {
        // Reeling: the feet give ground at a steady rate, like any body sliding to a stop.
        const sv = Math.hypot(p.vx, p.vz), sdec = (this.slip ? 200 : 600) * DT;
        if (sv <= sdec) p.vx = p.vz = 0;
        else { p.vx *= (sv - sdec) / sv; p.vz *= (sv - sdec) / sv; }
        // Break out of a combo with a dodge, at a heavy stamina cost.
        if (pressedSpecial && p.t > 0.06 && p.stamina >= 0.5 && !airborne) {
          p.stamina -= 0.25;
          p.hits = 0;
          this.startSpin(p, intent.mx, intent.mz);
          break;
        }
        if (p.t > p.stunFor) {
          // Recovered: a short window in which the chain cannot simply be started again.
          p.state = airborne ? 'jump' : 'move'; p.t = 0; p.hits = 0; p.invuln = Math.max(p.invuln, 0.35);
        }
        break;
      }
      case 'punch': {
        // Combo: jab, cross, finisher. Each strike has start-up, active and recovery frames.
        // A strike that lands can be cancelled into the next one; a miss has to recover fully.
        // A bat swing is one big slow strike with a long reach.
        const bat = p.weapon === 'bat';
        const fin = p.combo >= 2;
        const start = bat ? 0.1 : fin ? 0.09 : 0.05, end = bat ? 0.2 : fin ? 0.19 : 0.13, total = bat ? 0.5 : fin ? 0.44 : 0.27;
        p.vx *= 0.85; p.vz *= 0.85;
        if (!p.punchHit && p.t > start && p.t < end) this.checkHit(p, bat ? 80 : fin ? 62 : 58, bat ? 28 : 24, bat ? 'bat' : fin ? 'finisher' : 'jab');
        if (p.punchHit && !fin && p.t > end && takeFight()) this.startPunch(p, p.combo + 1);
        else if (p.t > total) { p.state = 'move'; p.t = 0; p.combo = 0; p.weapon = null; }
        break;
      }
      case 'pound':
        // Hammer: a wind-up, then the slam.
        p.vx *= 0.8; p.vz *= 0.8;
        if (!p.punchHit && p.t >= 0.22) { p.punchHit = true; this.toys.pound(p); }
        if (p.t > 0.62) { p.state = 'move'; p.t = 0; }
        break;
      case 'spray':
        p.vx *= 0.8; p.vz *= 0.8;
        if (p.t < 0.7) this.toys.spray(p);
        if (p.t > 0.8) { p.state = 'move'; p.t = 0; }
        break;
      case 'ride':
        p.stamina = clamp(p.stamina + 0.2 * DT, 0, 1);
        this.toys.drive(p, intent, shootNow, takeFight, takeAction);
        if (p.state === 'ride') return; // the ride drives the position
        break;
      case 'beam':
        return; // the saucer has them
      case 'tackle': {
        const active = p.t < (p.blitz ? 0.45 : 0.3) && !p.punchHit;
        if (active) {
          if (p.blitz && this.homeBlitz(p)) break;
          this.checkHit(p, 48, 28, 'tackle');
          if (p.punchHit) { p.vx *= 0.3; p.vz *= 0.3; }
        } else {
          p.vx *= 0.86; p.vz *= 0.86;
        }
        // A missed tackle slides for longer: that is the price of committing.
        if (p.t > (p.punchHit ? 0.42 : 0.62)) { p.state = 'move'; p.t = 0; p.blitz = false; }
        break;
      }
      case 'airkick':
        if (!p.punchHit) this.checkHit(p, 46, 26, 'airkick');
        break;
      case 'spin':
        if (p.t > 0.28) { p.state = 'move'; p.t = 0; }
        break;
      case 'grab': {
        // Holding an opponent, arcade style: the fight button alone knees them (twice, then it
        // throws); a direction plus the button throws them that way at once.
        const o = p.grabId >= 0 ? this.players[p.grabId] : null;
        p.vx *= 0.7; p.vz *= 0.7;
        p.kneeT = Math.max(0, p.kneeT - DT);
        if (!o || o.state !== 'held' || o.heldBy !== p.id) { p.state = 'move'; p.t = 0; p.grabId = -1; break; }
        if (p.t >= GRAB_CLINCH && takeFight()) {
          const way = intent.mx * p.facing;
          // Up + action aims the throw at the hoop: a body through the rim is a point.
          if (intent.mz < -0.5 && Math.abs(intent.mx) < 0.5) this.startToss(p, Math.sign(attackHoopX(p.team) - p.x) || p.facing, true);
          else if (way < -0.3) this.startToss(p, -p.facing);
          else if (way > 0.3 || p.knees >= 2) this.startToss(p, p.facing);
          else this.kneeStrike(p, o);
        } else if (p.t > GRAB_HOLD + p.knees * 0.3) this.releaseGrab(p, o, false);
        break;
      }
      case 'held': {
        const g = p.heldBy >= 0 ? this.players[p.heldBy] : null;
        const tossing = !!g && g.state === 'toss' && g.grabId === p.id;
        if (!g || !(tossing || (g.state === 'grab' && g.grabId === p.id))) {
          // The hold was broken by someone else. If it happened mid-throw, the victim is dropped.
          p.heldBy = -1; p.grabCd = 1.5; p.rot = 0;
          if (p.y > 6) this.knockDown(p, p.facing, (1 - p.team) as TeamId, 60, 100, 'dropped');
          else { p.state = 'move'; p.t = 0; }
          break;
        }
        p.flinch = Math.max(0, p.flinch - DT);
        p.z = g.z;
        p.vx = p.vy = p.vz = 0;
        p.facing = (-g.facing) as 1 | -1;
        if (tossing) {
          // Being swung: follow the throw's arc over the thrower.
          const a = this.tossArc(g, Math.min(1, g.t / this.tossTime(g)));
          p.x = clamp(g.x + a.dx, COURT.minX, COURT.maxX); p.y = a.y; p.rot = a.rot;
        } else {
          // Pinned in front of the grabber. A dodge wrenches free for a fifth of the stamina bar.
          p.x = g.x + g.facing * 24; p.y = 0; p.rot = 0;
          if (pressedSpecial && p.stamina >= 0.2) { p.stamina -= 0.2; this.releaseGrab(g, p, true); }
          // Out of breath? The ball can still be passed out of the hold. The body stays held.
          else if (this.ball.holder === p.id && takeAction()) this.passToMate(p, true);
        }
        return; // position is fully driven by the grabber
      }
      case 'toss': {
        // Wind-up (the victim is swung overhead), release, then a short follow-through.
        p.vx *= 0.7; p.vz *= 0.7;
        const o = p.grabId >= 0 ? this.players[p.grabId] : null;
        const T = this.tossTime(p);
        if (o && o.state === 'held' && o.heldBy === p.id && p.t >= T) this.releaseThrow(p, o);
        if (p.t > T + 0.3) { p.state = 'move'; p.t = 0; p.grabId = -1; }
        break;
      }
      case 'pass':
        p.vx *= 0.8; p.vz *= 0.8;
        if (p.t > 0.16) { p.state = 'move'; p.t = 0; }
        break;
      case 'dunk':
        this.updateDunk(p);
        return; // dunk drives its own position
      case 'hang':
        p.vx = p.vz = 0;
        if (p.t <= HANG_TIME) {
          // The body swings down under the rim and hangs from it at arm's length.
          const hangY = Math.max(0, (p.dunk ? p.dunk.rimY : HOOP.rimY) - HANG_FEET);
          p.y += (hangY - p.y) * Math.min(1, 13 * DT);
          p.vy = 0;
          this.clearUnder(p, false);
          return;
        }
        p.state = 'jump'; p.t = 0; p.vy = -50;
        break;
      case 'shoot':
        // Airborne with the ball: release on button up.
        if (hasBall && !p.released && !intent.shoot) this.releaseShot(p, false);
        break;
      case 'jump':
        if (hasBall && p.launched && !p.released && shootNow) {
          // Off a launch pad: dunk if the rim is close, otherwise hold for an air shot.
          if (distXZ(p.x, p.z, attackHoopX(p.team), HOOP.z) < 200) this.startSkyDunk(p);
          else p.state = 'shoot';
        } else if (!hasBall && this.heldItem(p) && takeFight()) {
          this.toys.useItem(p, this.heldItem(p)!);
        } else if (!hasBall && p.y > 8 && takeFight()) {
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
        const k = Math.min(1, (this.slip ? 2.5 : 12) * DT); // a wet floor has no grip
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
          } else if (shootNow) {
            const hx = attackHoopX(p.team);
            const d = distXZ(p.x, p.z, hx, HOOP.z);
            const towardHoop = Math.sign(hx - p.x) === Math.sign(p.vx) || d < 70;
            if (this.boost(p)) { /* thrown up by the teammate */ }
            else if (d < DUNK_RANGE && (sprinting || d < 95) && towardHoop) this.startDunk(p);
            else this.startJumpShot(p);
          } else if (takeAction()) this.passToMate(p);
        } else {
          const h = this.holder();
          const mateHasBall = !!h && h.team === p.team && this.ball.state === 'held';
          if (pressedSpecial) {
            if (!full) this.startSpin(p, mx, mz);
            else if (p.def.defSpecial === 'blitz') this.startBlitz(p);
            else this.shockwave(p);
          } else if (takeFight()) {
            // Without the ball the shoot button fights: an item if one is held, a grab at
            // point-blank range, a tackle at a sprint, otherwise a punch.
            const it = this.heldItem(p);
            const close = intent.grab && !it ? this.grabTarget(p, mx, mz, false) : null;
            if (it) this.toys.useItem(p, it);
            else if (close) this.startGrab(p, close);
            else if (sprinting) this.startTackle(p, mx, mz);
            else this.startPunch(p, 0);
          } else if (takeAction()) {
            // The pass button asks for the ball, or jumps: for a lob near the rim, a block or a rebound.
            const lob = mateHasBall && distXZ(p.x, p.z, attackHoopX(p.team), HOOP.z) < 200;
            if (mateHasBall && !lob) this.passCall[p.team] = 0.8;
            else if (!this.boost(p)) {
              p.state = 'jump'; p.t = 0; this.jump(p);
              this.emit('jump', p.x, 0, p.z, { player: p.id, text: lob ? 'LOB!' : undefined });
            }
          }
        }
        // Running or walking into an opponent with your hands free grabs them almost at once.
        if (p.state === 'move' && !hasBall && !airborne && intent.grab) {
          const o = this.grabTarget(p, mx, mz, true);
          if (!o) p.pushT = Math.max(0, p.pushT - DT);
          else { p.pushT += DT; if (p.pushT > 0.12) this.startGrab(p, o); }
        } else p.pushT = 0;
        break;
      }
    }

    // Integrate.
    if (p.y > 0 || p.vy > 0) {
      p.vy -= this.grav * DT;
      p.y += p.vy * DT;
      p.vx *= 0.995;
      if (p.y <= 0) {
        const vyIn = p.vy;
        p.y = 0;
        p.vy = 0;
        if (p.state === 'shoot' && this.ball.holder === p.id && !p.released) this.releaseShot(p, true);
        p.launched = false;
        if (p.state === 'jump' || p.state === 'shoot' || p.state === 'airkick') { p.state = 'move'; p.t = 0; }
        if (p.state === 'down') {
          if (vyIn < -230 && !p.bounced) {
            // A hard landing bounces once before the body settles. A thrown body hits harder:
            // a moment of impact freeze and a bigger bounce.
            p.bounced = true;
            p.vy = -vyIn * (p.thrown ? 0.42 : 0.36);
            p.vx *= 0.75;
            p.spinRate *= 0.45;
            if (p.thrown) p.freeze = 0.07;
            this.emit('slam', p.x, 0, p.z, { player: p.id, power: p.thrown ? 3 : 2 });
          } else {
            p.t = Math.max(p.t, 0.3);
            p.thrown = false;
            if (vyIn < -90) this.emit('slam', p.x, 0, p.z, { player: p.id, power: 1 });
          }
        } else this.emit('land', p.x, 0, p.z, { player: p.id });
      }
    }
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    // A body thrown into the end fence bounces off it.
    const wall = p.state === 'down' && Math.abs(p.vx) > 220;
    if (p.x < COURT.minX) { p.x = COURT.minX; p.vx = wall ? -p.vx * 0.45 : Math.max(0, p.vx); if (wall) this.emit('slam', p.x, p.y + 30, p.z, { player: p.id, power: 2 }); }
    if (p.x > COURT.maxX) { p.x = COURT.maxX; p.vx = wall ? -p.vx * 0.45 : Math.min(0, p.vx); if (wall) this.emit('slam', p.x, p.y + 30, p.z, { player: p.id, power: 2 }); }
    if (p.z < COURT.minZ) { p.z = COURT.minZ; p.vz = Math.max(0, p.vz); }
    if (p.z > COURT.maxZ) { p.z = COURT.maxZ; p.vz = Math.min(0, p.vz); }
    if (p.y === 0) p.anim += Math.hypot(p.vx, p.vz) * DT;
  }

  private separatePlayers() {
    const ps = this.players;
    const ghost = (q: Player) => q.state === 'dunk' || q.state === 'down' || q.state === 'spin' || q.state === 'held' || q.state === 'ride' || q.state === 'beam';
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (ghost(a) || ghost(b)) continue;
        if (Math.abs(a.y - b.y) > 50) continue;
        const dx = b.x - a.x, dz = (b.z - a.z) * 1.4;
        const d = Math.hypot(dx, dz);
        const min = BODY;
        if (d > 0.001 && d < min) {
          // Two bodies in the same spot push apart, the lighter one giving more ground.
          const ma = massOf(a.def), mb = massOf(b.def);
          const pa = ((min - d) * mb) / (ma + mb), pb = min - d - pa;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * pa; b.x += nx * pb;
          a.z -= (nz * pa) / 1.4; b.z += (nz * pb) / 1.4;
        }
      }
    }
    // Pushing must never shove anyone off the court (frozen fighters skip their own clamp).
    for (const p of ps) {
      p.x = clamp(p.x, COURT.minX, COURT.maxX);
      p.z = clamp(p.z, COURT.minZ, COURT.maxZ);
    }
  }

  // ---------------------------------------------------------------- shooting

  startJumpShot(p: Player) {
    p.state = 'shoot';
    p.t = 0;
    p.released = false;
    this.jump(p);
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
    const off = landed ? 1 : Math.abs(p.vy) / this.grav;
    const W = this.shotWindow(p);
    const perfect = !landed && off <= W;
    // Outside the window the aim scatters: more the further off the timing was, and more on a long
    // shot. Whether it still drops is then up to the rim and the backboard.
    const spread = perfect ? 0 : landed ? 60 : (8 + 0.03 * d + 260 * (off - W)) / (0.85 + 0.3 * p.def.shoot);
    // A shot let go high in the air (off a launch pad) goes at the upper hoop for a bonus point.
    const high = !landed && p.y > HIGH_MIN_Y;
    const three = d > THREE_PT;
    const points = (three ? 3 : 2) + (high ? 1 : 0);
    const st = this.stats[p.team];
    st.fga++;
    if (three) st.tpa++;
    this.launchShot(p, spread, points, false, high, three);
    this.emit('shoot', p.x, p.y + HAND_Y, p.z, { player: p.id, team: p.team, text: perfect ? 'PERFECT' : undefined });
  }

  /** Sends the ball at the rim. `spread` is the radius (in pixels at the rim) the aim may be off by. */
  launchShot(p: Player, spread: number, points: number, special: boolean, high: boolean, three: boolean) {
    const b = this.ball;
    const hx = attackHoopX(p.team);
    b.x = p.x + p.facing * 10;
    b.y = p.y + HAND_Y + 18;
    b.z = p.z;
    let tx = hx, tz = HOOP.z;
    const rimY = high ? HIGH_RIM_Y : HOOP.rimY;
    const ty = rimY + 2;
    if (spread > 0) {
      const a = this.rng() * Math.PI * 2;
      const r = spread * Math.sqrt(this.rng());
      tx += Math.cos(a) * r;
      tz += Math.sin(a) * r;
    }
    const dxz = distXZ(b.x, b.z, tx, tz);
    // In low gravity the same arc takes longer, so the ball still drops into the hoop instead of skimming it.
    const T = (special ? 0.95 : clamp(0.5 + dxz / 950, 0.55, 1.1)) * Math.sqrt(GRAVITY / this.grav);
    b.vx = (tx - b.x) / T;
    b.vz = (tz - b.z) / T;
    b.vy = (ty - b.y) / T + 0.5 * this.grav * T;
    this.spinBall(special ? 0 : 13);
    b.state = 'shot';
    b.holder = null;
    b.afterShot = true;
    b.shot = { made: spread === 0, points, team: p.team, shooter: p.id, t: 0, T, special, hoopX: hx, rimY, three, touched: false, board: false };
  }

  /** Sets the ball's spin about the axis across its path: positive is backspin, negative topspin (rad/s). */
  spinBall(back: number) {
    const b = this.ball;
    const h = Math.hypot(b.vx, b.vz) || 1;
    b.wx = (-b.vz / h) * back; b.wz = (b.vx / h) * back; b.wy = 0;
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
    this.launchShot(p, 0, points, true, false, points === 3);
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
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * DUNK_STAND, tz: HOOP.z + 4, T, kind: 'mega', rimY: HIGH_RIM_Y };
    this.stats[p.team].fga++;
    this.hitstop = 0.12;
    this.emit('megaslam', p.x, p.y + 60, p.z, { player: p.id, team: p.team, text: 'MEGA SLAM!' });
  }

  private shockwave(p: Player) {
    this.hype[p.team] = 0;
    this.emit('shockwave', p.x, 30, p.z, { player: p.id, team: p.team, text: 'SHOCKWAVE!' });
    for (const o of this.opponents(p)) {
      if (!this.hittable(o)) continue;
      if (distXZ(p.x, p.z, o.x, o.z) < 140) this.knockDown(o, o.x >= p.x ? 1 : -1, p.team, 340, 520, 'shockwave');
    }
    p.state = 'punch'; p.t = 0; p.punchHit = true; p.combo = 2; p.weapon = null;
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

  startDunk(p: Player) {
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    p.state = 'dunk';
    p.t = 0;
    p.facing = dir;
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * DUNK_STAND, tz: HOOP.z + 4, T: DUNK_TIME, kind: 'dunk', rimY: HOOP.rimY };
    this.stats[p.team].fga++;
    this.emit('jump', p.x, 0, p.z, { player: p.id, text: 'DUNK!' });
  }

  private startOop(p: Player) {
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    p.state = 'dunk';
    p.t = 0;
    p.facing = dir;
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * DUNK_STAND, tz: HOOP.z + 4, T: 0.36, kind: 'oop', rimY: HOOP.rimY };
    this.stats[p.team].fga++;
  }

  /**
   * A dunker comes down through the space under the rim, and nobody else can be standing in it:
   * everyone on the floor there is moved out, and opponents are barged aside (they reel).
   */
  private clearUnder(p: Player, barge: boolean) {
    const R = BODY + 12;
    for (const o of this.players) {
      if (o.id === p.id || o.y > 40) continue;
      if (o.state === 'down' || o.state === 'held' || o.state === 'ride' || o.state === 'beam' || o.state === 'dunk' || o.state === 'hang') continue;
      let dx = o.x - p.x, dz = (o.z - p.z) * 1.4;
      const dd = Math.hypot(dx, dz);
      if (dd >= R) continue;
      // Out the way they already are; from dead centre, back up the court.
      if (dd < 2) { dx = -p.facing; dz = 0; } else { dx /= dd; dz /= dd; }
      const push = Math.min(R - dd, 7);
      o.x = clamp(o.x + dx * push, COURT.minX, COURT.maxX);
      o.z = clamp(o.z + (dz * push) / 1.4, COURT.minZ, COURT.maxZ);
      if (barge && o.team !== p.team && o.invuln <= 0 && (o.state === 'move' || o.state === 'punch' || o.state === 'pass')) {
        o.state = 'stun'; o.t = 0; o.stunFor = 0.4; o.hitZone = 1; o.combo = 0;
        o.vx = dx * 170; o.vz = (dz * 170) / 1.4;
        this.emit('hit', o.x, 60, o.z, { player: o.id, team: p.team, power: 1 });
      }
    }
  }

  /** A dunk always goes in unless the dunker is hit out of the air first. */
  private updateDunk(p: Player) {
    const d = p.dunk!;
    const u = Math.min(1, p.t / d.T);
    const e = u * u * (3 - 2 * u);
    const prevY = p.y;
    const top = d.rimY - DUNK_FEET;
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
        if (distXZ(p.x, p.z, o.x, o.z) < 44 && o.y < p.y + 80) this.knockDown(o, p.facing, p.team, 320, 380, 'megaslam');
      }
    }
    if (u > 0.7) this.clearUnder(p, d.kind !== 'mega');
    if (u < 1) return;
    const b = this.ball;
    if (b.holder !== p.id) { p.state = 'jump'; p.t = 0; p.vy = 0; return; }
    const points = d.kind === 'mega' || d.kind === 'sky' ? 3 : 2;
    const rim = this.rims.find((r) => r.x === attackHoopX(p.team) && r.y === d.rimY)!;
    if (rim.brokenT > 0) {
      // Nothing to dunk on: the rim is hanging off the board.
      b.holder = null; b.state = 'loose'; b.x = rim.x; b.z = HOOP.z; b.y = d.rimY - 4;
      b.vx = -p.facing * 120; b.vz = 0; b.vy = -100; b.afterShot = true;
      this.emit('violation', rim.x, d.rimY, HOOP.z, { text: 'NO RIM!' });
      p.state = 'jump'; p.t = 0; p.vy = 0; p.released = true;
      return;
    }
    b.holder = null;
    b.x = attackHoopX(p.team);
    b.z = HOOP.z;
    b.y = d.rimY - 4;
    b.vx = b.vz = 0;
    b.vy = -260;
    b.state = 'scored';
    b.afterShot = true;
    this.stats[p.team].dunks++;
    this.awardPoints(p.team, points, p.id, true);
    const text = d.kind === 'mega' ? 'MEGA SLAM!' : d.kind === 'sky' ? 'SKY DUNK!' : d.kind === 'oop' ? 'ALLEY-OOP!' : 'SLAM DUNK!';
    this.emit('dunk', b.x, d.rimY, b.z, { player: p.id, team: p.team, points, text });
    p.state = 'hang';
    p.t = 0;
    this.hitstop = d.kind === 'dunk' ? 0.1 : 0.16;
    // Every dunk strains the rim; enough of them and it breaks for a while.
    this.toys.damageRim(rim, points === 3 ? 2 : 1);
  }

  private passToMate(p: Player, held = false) {
    const mate = this.teammate(p);
    if (!this.canAct(mate)) return;
    const b = this.ball;
    const hx = attackHoopX(p.team);
    const d0 = distXZ(p.x, p.z, mate.x, mate.z);
    // A teammate in the air near the rim gets a lob for an alley-oop.
    let oop = mate.state === 'jump' && mate.y > 6 && mate.vy > -260 && distXZ(mate.x, mate.z, hx, HOOP.z) < 200;
    let T = oop ? clamp(d0 / 900, 0.12, 0.36) : clamp(d0 / 720, 0.16, 0.7);
    let predY = mate.state === 'ride' ? mate.y : Math.max(0, mate.y + mate.vy * T - 0.5 * this.grav * T * T);
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
    b.vy = (ty - b.y) / T + 0.5 * this.grav * T;
    this.spinBall(5);
    b.state = 'pass';
    b.holder = null;
    b.pass = { from: p.id, to: mate.id, t: 0, T, oop };
    if (!held) { p.state = 'pass'; p.t = 0; p.facing = tx > p.x ? 1 : -1; }
    this.passCall[p.team] = 0;
    this.emit(oop ? 'oop' : 'pass', b.x, b.y, b.z, { player: p.id });
  }

  // ---------------------------------------------------------------- fighting

  /** Teammate boost: jumping while touching a teammate who is standing still gets you thrown high into the air. */
  private boost(p: Player): boolean {
    const mate = this.teammate(p);
    const h = this.holder();
    if (h && h.team !== p.team) return false; // not while defending: blocks need a normal jump
    if (mate.state !== 'move' || mate.y !== 0 || Math.hypot(mate.vx, mate.vz) > 60) return false;
    if (Math.hypot(mate.x - p.x, (mate.z - p.z) * 1.4) > BODY + 10) return false;
    p.state = 'jump'; p.t = 0; p.vy = LAUNCH_V; p.launched = true; p.released = false;
    mate.state = 'pass'; mate.t = 0; mate.facing = p.x >= mate.x ? 1 : -1;
    this.emit('boost', p.x, 20, p.z, { player: p.id, text: 'BOOST!' });
    return true;
  }

  startPunch(p: Player, combo: number, weapon: 'bat' | null = null) {
    p.state = 'punch';
    p.t = 0;
    p.punchHit = false;
    p.hitId = -1;
    p.combo = combo;
    p.weapon = weapon;
    // Each strike steps in a little further than the last, so the string stays in range.
    p.vx += p.facing * [120, 200, 230][combo];
    this.emit('swing', p.x + p.facing * 20, p.y + 46, p.z, { player: p.id, power: combo >= 2 ? 2 : 1 });
  }

  /** Hit test for the attacker's current move. */
  private checkHit(a: Player, reach: number, zr: number, kind: HitKind) {
    for (const o of this.opponents(a)) {
      // A body still in the air after a knockdown can be hit again: a juggle (twice at most).
      const juggle = o.state === 'down' && o.y > 14 && o.juggles < 2 && o.invuln <= 0 && o.t > 0.1;
      if (!juggle && !this.hittable(o)) continue;
      const dx = (o.x - a.x) * a.facing;
      if (dx < -6 || dx > reach) continue;
      if (Math.abs(o.z - a.z) > zr) continue;
      if (Math.abs(o.y - a.y) > (juggle ? 72 : 58)) continue;
      a.punchHit = true;
      if (juggle) this.juggle(o, a, kind);
      else this.hitPlayer(o, a, kind);
      return;
    }
    // Nobody there: the swing can still connect with the ball.
    this.toys.strikeBall(a, reach, zr, kind);
  }

  private juggle(o: Player, a: Player, kind: HitKind) {
    o.juggles++;
    o.t = 0.11;
    o.bounced = false;
    o.downBy = a.id;
    o.vx = a.facing * (kind === 'bat' ? 420 : 210 + 80 * a.def.power);
    o.vy = kind === 'bat' ? 520 : 430;
    a.freeze = 0.1; o.freeze = 0.1;
    this.stats[a.team].hits++;
    this.addHype(a.team, 0.08);
    this.emit('hit', (a.x + o.x) / 2, o.y + 40, o.z, { player: o.id, team: a.team, power: 2 });
    this.emit('juggle', o.x, o.y + 70, o.z, { player: a.id, team: a.team, text: o.juggles >= 2 ? 'JUGGLE x2!' : 'JUGGLE!' });
  }

  private hitPlayer(o: Player, a: Player, kind: HitKind) {
    // A tank takes the hit for its driver.
    if (o.state === 'ride' && this.toys.absorbHit(o, kind !== 'jab')) { a.freeze = 0.08; return; }
    o.hits++;
    this.stats[a.team].hits++;
    const heavyMove = kind === 'tackle' || kind === 'airkick' || kind === 'bat';
    this.addHype(a.team, heavyMove ? 0.1 : 0.07);
    // A knockdown comes from a heavy move, the last hit of a chain, or catching someone in the air.
    // Lighter hits stagger: they never take the ball, and the victim can be hit again while reeling.
    const need = Math.max(1, (o.def.tough ?? 3) - (a.def.heavyHands ? 1 : 0));
    const ko = heavyMove || o.hits >= need || o.state === 'dunk' || o.y > 12;
    const cx = (a.x + o.x) / 2 + a.facing * 6;
    // The blow travels along the line between the two bodies, not only along the court.
    let nx = o.x - a.x, nz = o.z - a.z;
    const nl = Math.hypot(nx, nz);
    if (nl < 4 || nx * a.facing <= 0) { nx = a.facing; nz = 0; } else { nx /= nl; nz /= nl; }
    // What it carries: the attacker's weight, how fast the two were closing (for a punch), and
    // more again if the victim was caught in the middle of a swing of their own.
    const punch = kind === 'jab' || kind === 'finisher';
    const closing = punch ? clamp(((a.vx - o.vx) * nx + (a.vz - o.vz) * nz) / 600, 0, 0.5) : 0;
    const counter = o.state === 'punch' || o.state === 'tackle' || o.state === 'airkick';
    const carry = clamp(Math.sqrt(massOf(a.def)) * (1 + closing) * (counter ? 1.2 : 1), 0.8, 1.6);
    a.hitId = o.id;
    o.hitZone = kind === 'finisher' ? 2 : kind === 'tackle' || (kind === 'jab' && a.combo === 1) ? 1 : 0;
    if (ko) {
      a.freeze = 0.13;
      let force = 250 + 110 * a.def.power, lift = 380;
      if (kind === 'finisher') { force += 60; lift = 480; }
      else if (kind === 'tackle') { force = 330; lift = 220; }
      else if (kind === 'airkick') { force = 300; lift = o.y > 30 ? -380 : 340; }
      else if (kind === 'bat') { force = 520; lift = 430; }
      this.knockDown(o, a.facing, a.team, force * carry, lift, o.hits < need && !heavyMove ? 'aircatch' : kind);
      const sp = Math.abs(o.vx);
      o.vx = nx * sp; o.vz = nz * sp * 0.75;
      o.downBy = a.id;
      o.freeze = 0.13;
    } else {
      const big = kind === 'finisher';
      a.freeze = big ? 0.11 : 0.07;
      o.freeze = big ? 0.11 : 0.07;
      o.state = 'stun';
      o.t = 0;
      o.stunFor = (big ? 0.5 : 0.36) + (counter ? 0.08 : 0);
      const v = Math.min(big ? 300 : 215, ((big ? 250 : 140 + 40 * a.def.power) * carry) / Math.sqrt(massOf(o.def)));
      o.vx = nx * v; o.vz = nz * v * 0.75;
      this.emit('hit', cx, o.y + 48, o.z, { player: o.id, team: a.team, power: big || counter ? 2 : 1 });
    }
  }

  /**
   * Throws a player off their feet: back along `dir` at `force`, up at `lift` (negative spikes an
   * airborne player into the floor). They fly, land, may bounce once, slide, then get up.
   */
  knockDown(o: Player, dir: number, byTeam: TeamId, force: number, lift = 380, cause = 'other') {
    this.koCauses[cause] = (this.koCauses[cause] ?? 0) + 1;
    if (this.ball.holder === o.id) this.fumble(o, dir, byTeam);
    this.dropItem(o);
    o.juggles = 0; o.bodyDunked = false; o.downBy = -1; o.weapon = null;
    o.state = 'down';
    o.t = 0;
    o.hits = 0;
    o.blitz = false;
    o.bounced = false;
    o.bowled = false;
    o.thrown = false; o.rot = 0; o.downFor = 1.1;
    // The same blow moves a heavy body less than a light one.
    const k = 1 / Math.sqrt(massOf(o.def));
    o.vx = dir * force * k;
    o.vz *= 0.3;
    o.vy = lift < 0 && o.y > 30 ? lift : Math.abs(lift) * (0.5 + 0.5 * k);
    // The blow also turns the body: head over heels, away from the hit, faster for a harder one.
    o.spinRate = (Math.sign(dir) || 1) * clamp(2.5 + force / 75, 4, 9.5);
    this.stats[byTeam].kos++;
    this.emit('ko', o.x, o.y + 44, o.z, { player: o.id, team: byTeam });
  }

  // ---------------------------------------------------------------- grabs

  /**
   * The opponent this player can grab right now: touching, on the ground, and not protected by a
   * dodge or a recent grab. With `pushing`, the player must be moving into them; otherwise (a
   * button press) they only must not be moving or facing away.
   */
  private grabTarget(p: Player, mx: number, mz: number, pushing: boolean): Player | null {
    if (p.grabCd > 0 || this.heldItem(p)) return null;
    const m = Math.hypot(mx, mz);
    if (pushing && m < 0.3) return null;
    for (const o of this.opponents(p)) {
      if (o.y !== 0 || o.invuln > 0 || o.grabCd > 0) continue;
      if (o.state !== 'move' && o.state !== 'stun' && o.state !== 'pass' && o.state !== 'punch') continue;
      // Bodies keep BODY apart, so anything a little inside that is touching.
      const ox = o.x - p.x, oz = o.z - p.z;
      if (Math.hypot(ox, oz * 1.4) > BODY + 6) continue;
      if (m >= 0.3) {
        if ((mx * ox + mz * oz) / (m * (Math.hypot(ox, oz) || 1)) < (pushing ? 0.3 : 0)) continue;
      } else if (ox * p.facing < 0) continue;
      return o;
    }
    return null;
  }

  private startGrab(p: Player, o: Player) {
    if (Math.abs(o.x - p.x) > 6) p.facing = o.x > p.x ? 1 : -1;
    p.state = 'grab'; p.t = 0; p.grabId = o.id; p.knees = 0; p.kneeT = 0; p.pushT = 0;
    // A grab takes effort, but being out of breath does not prevent one (people sprint a lot on defense).
    p.stamina = Math.max(0, p.stamina - 0.2);
    p.vx = p.vz = 0;
    o.state = 'held'; o.t = 0; o.heldBy = p.id; o.hits = 0; o.combo = 0;
    o.vx = o.vz = 0;
    p.freeze = 0.06; o.freeze = 0.06;
    this.emit('grab', (p.x + o.x) / 2, 44, p.z, { player: p.id, team: p.team, text: 'GRAB!' });
  }

  private kneeStrike(p: Player, o: Player) {
    p.knees++;
    p.kneeT = 0.22;
    o.flinch = 0.24;
    p.freeze = 0.09; o.freeze = 0.09;
    this.stats[p.team].hits++;
    this.addHype(p.team, 0.06);
    this.emit('hit', (p.x + o.x) / 2, 36, p.z, { player: o.id, team: p.team, power: 2 });
  }

  /** Seconds of wind-up before a throw lets go. */
  private tossTime(p: Player): number {
    return p.tossDir === p.facing ? 0.3 : 0.26;
  }

  /**
   * Where the victim is during a throw's wind-up, relative to the thrower: sideways offset, height
   * and body rotation. Forward: hoisted from the front up over the head, then whipped forward.
   * Backward: swung from the front straight over the head to behind.
   */
  private tossArc(g: Player, u: number): { dx: number; y: number; rot: number } {
    const f = g.facing;
    const smooth = (x: number) => x * x * (3 - 2 * x);
    let a: number, rot: number;
    if (g.tossDir === f) {
      if (u < 0.65) { a = 1.95 * smooth(u / 0.65); rot = -f * a * 0.75; }
      else { const k = smooth((u - 0.65) / 0.35); a = 1.95 - k; rot = -f * 1.95 * 0.75 + f * k * 2.1; }
    } else {
      a = 2.5 * smooth(u);
      rot = -f * a * 1.1;
    }
    return { dx: f * 26 * Math.cos(a), y: 70 * Math.sin(a), rot };
  }

  private startToss(p: Player, dir: number, atHoop = false) {
    p.state = 'toss';
    p.t = 0;
    p.tossDir = dir;
    p.tossHoop = atHoop;
    this.emit('swing', p.x, 60, p.z, { player: p.id, power: 2 });
  }

  /** Lets go of the victim at the end of the wind-up. They fly spinning, land hard, and stay down longer. */
  private releaseThrow(p: Player, o: Player) {
    const d = p.tossDir, fwd = d === p.facing;
    const rot = o.rot;
    p.grabId = -1; o.heldBy = -1;
    p.grabCd = GRAB_COOLDOWN; o.grabCd = GRAB_IMMUNE;
    this.knockDown(o, d, p.team, fwd ? 440 : 400, fwd ? 210 : 170, 'throw');
    o.downBy = p.id;
    const hx = attackHoopX(p.team);
    const d0 = distXZ(o.x, o.z, hx, HOOP.z);
    if (p.tossHoop && d0 < 430 && Math.sign(hx - o.x) === d) {
      // Aimed at the hoop: a lob that drops the body through the rim. Sure from close in, a gamble from far out.
      const T = clamp(d0 / 520, 0.5, 0.85);
      const n = Math.round(T / DT);
      const err = Math.max(0, d0 - 150) * 0.3;
      const ang = this.rng() * Math.PI * 2, r = err * Math.sqrt(this.rng());
      const drag = (1 - Math.pow(0.995, n)) / (0.005 * n); // air drag on a flying body
      o.vx = (hx + Math.cos(ang) * r - o.x) / (T * drag);
      o.vz = (HOOP.z + Math.sin(ang) * r - o.z) / T;
      o.vy = (HOOP.rimY - 38 - o.y) / T + 0.5 * this.grav * T;
    }
    p.tossHoop = false;
    o.thrown = true;
    o.rot = rot;
    o.spinRate = d * 14;
    o.downFor = 1.6;
    o.freeze = 0;
    this.addHype(p.team, 0.1);
    this.emit('hurl', o.x, o.y, p.z, { player: p.id, team: p.team, text: 'THROW!' });
  }

  /** Ends a grab without a throw: it timed out, or the victim broke free (which staggers the grabber). */
  private releaseGrab(g: Player, o: Player, broke: boolean) {
    g.grabId = -1; o.heldBy = -1;
    g.grabCd = GRAB_COOLDOWN; o.grabCd = GRAB_IMMUNE;
    o.state = 'move'; o.t = 0; o.invuln = 0.3;
    o.vx = g.facing * 110;
    if (broke) {
      g.state = 'stun'; g.t = 0; g.stunFor = 0.3; g.vx = -g.facing * 160;
      this.emit('hit', (g.x + o.x) / 2, 44, g.z, { player: g.id, team: o.team, power: 1 });
    } else {
      g.state = 'move'; g.t = 0;
    }
  }

  fumble(o: Player, dir: number, byTeam: TeamId) {
    const b = this.ball;
    b.state = 'loose';
    b.holder = null;
    b.x = o.x + dir * 8;
    b.y = Math.max(20, o.y + HAND_Y);
    b.z = o.z;
    b.vx = dir * (140 + this.rng() * 90);
    b.vz = (this.rng() - 0.5) * 160;
    b.vy = 240;
    this.spinBall(-(6 + this.rng() * 14)); // knocked loose: it tumbles forward
    b.wy = (this.rng() - 0.5) * 20;
    o.pickupCd = 0.5;
    o.released = true;
    this.stats[byTeam].steals++;
    this.addHype(byTeam, 0.05);
    this.emit('fumble', b.x, b.y, b.z, { player: o.id, team: byTeam, text: 'STRIPPED!' });
  }

  awardPoints(team: TeamId, points: number, shooter: number, dunk: boolean, three = false) {
    this.lastScorer = shooter;
    this.score[team] += points;
    const st = this.stats[team];
    st.fgm++;
    if (st.fga < st.fgm) st.fga = st.fgm; // flukes (a blasted ball, a body through the hoop) were never "attempts"
    if (three) st.tpm++;
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
    this.lastScoreTime = this.time;
    // Play never stops for a basket: the ball is live again the moment it drops out of the net.
    // The team that scored has to wait a beat before touching it, so the other side gets first go.
    for (const q of this.players) if (q.team === team) q.pickupCd = Math.max(q.pickupCd, 0.9);
    if (this.winner !== null && this.phase === 'play') this.setPhase('end');
  }

  // ---------------------------------------------------------------- stage

  /** Dunk from the air after a launch: at the upper hoop (3 points) if high enough. */
  startSkyDunk(p: Player) {
    const hx = attackHoopX(p.team);
    const dir = attackDir(p.team);
    const high = p.y > HIGH_MIN_Y;
    p.state = 'dunk';
    p.t = 0;
    p.facing = dir;
    p.dunk = { sx: p.x, sy: p.y, sz: p.z, tx: hx - dir * DUNK_STAND, tz: HOOP.z + 4, T: 0.4, kind: high ? 'sky' : 'dunk', rimY: high ? HIGH_RIM_Y : HOOP.rimY };
    this.stats[p.team].fga++;
    this.emit('jump', p.x, p.y, p.z, { player: p.id, text: high ? 'SKY DUNK!' : 'DUNK!' });
  }

  dropItem(p: Player) {
    const it = this.heldItem(p);
    if (!it) return;
    it.state = 'ground';
    it.holder = null;
    it.x = p.x; it.z = p.z;
    it.y = p.y + 20;
    it.vy = 120;
    // It keeps some of its carrier's motion, so it tumbles away rather than dropping dead.
    it.vx = p.vx * 0.5; it.vz = p.vz * 0.5;
  }

  throwItem(p: Player, it: Item) {
    it.state = 'thrown';
    it.holder = null;
    it.team = p.team;
    it.x = p.x + p.facing * 14;
    it.y = p.y + HAND_Y + 12;
    it.z = p.z;
    // Bombs and bananas are lobbed; everything else is thrown flat and hard.
    const lob = it.kind === 'bomb' || it.kind === 'banana';
    it.vx = p.facing * (it.kind === 'banana' ? 300 : lob ? 420 : 620);
    it.vy = lob ? 160 : 70;
    it.vz = 0;
    if (p.y === 0 && p.state === 'move') { p.state = 'pass'; p.t = 0; }
    this.emit('throw', it.x, it.y, it.z, { player: p.id });
  }

  private updateStage() {
    // Launch pads throw anyone who steps on them, then need a few seconds to recharge.
    this.stage.launchers.forEach((pad, i) => {
      if (this.padTimers[i] > 0) { this.padTimers[i] = Math.max(0, this.padTimers[i] - DT); return; }
      for (const p of this.players) {
        if (p.y !== 0 || p.state !== 'move' || p.padCd > 0) continue;
        if (Math.abs(p.x - pad.x) > 20 || Math.abs(p.z - pad.z) > 13) continue;
        p.vy = LAUNCH_V;
        // A catapult also flings its passenger toward the hoop they attack.
        if (pad.kick) { p.vx = attackDir(p.team) * pad.kick; p.vz = 0; p.vy = LAUNCH_V * 0.9; }
        p.state = 'jump';
        p.t = 0;
        p.launched = true;
        p.released = false;
        p.padCd = 0.8;
        this.padTimers[i] = PAD_RECHARGE;
        this.emit('launch', pad.x, 0, pad.z, { player: p.id });
        break;
      }
    });
  }

  // ---------------------------------------------------------------- ball

  private updateBall() {
    const b = this.ball;
    b.struck = Math.max(0, b.struck - DT);
    b.spin += DT * (-b.wz + Math.abs(b.wx) * 0.6);
    if (b.state === 'held') {
      b.wx = b.wy = b.wz = 0;
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

    // Near a hoop the ball is stepped in smaller slices so it cannot pass through the rim.
    const live = b.state === 'shot' || b.state === 'loose';
    const sub = live && b.y > 90 && this.rims.some((h) => Math.abs(b.x - h.x) < 100) ? 4 : 1;
    for (let i = 0; i < sub; i++) {
      const h = DT / sub;
      const prevY = b.y;
      b.vy -= this.grav * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      if (sub > 1 && this.ballVsHoops(prevY)) break;
    }

    if (b.state === 'shot') this.updateShot();
    else if (b.state === 'pass') this.updatePass();
    else if (b.state === 'scored') {
      // The net drags on the ball: it loses its sideways speed and its spin.
      b.vx *= 0.9; b.vz *= 0.9;
      b.wx *= 0.85; b.wy *= 0.85; b.wz *= 0.85;
      // Out of the bottom of the net: live again, kicked a little toward the middle of the court.
      if (b.y < 105) {
        const out = b.x < COURT.midX ? 1 : -1;
        b.state = 'loose';
        b.vx = out * (150 + this.rng() * 130);
        b.vz = (this.rng() - 0.5) * 180;
        b.vy = Math.max(b.vy, -120);
      }
    }

    // Floor and walls.
    const fr = this.ballR - 4; // height of the ball's centre when it rests on the floor
    if (b.y < fr) {
      b.y = fr;
      if (b.vy < -70) this.emit('bounce', b.x, 0, b.z);
      b.hot = 0; // a struck ball only stings until it touches the floor
      // The floor grips the ball: backspin brakes it (or brings it back), topspin drives it on.
      if (b.vy < -70) this.ballContact(0, 1, 0, this.heavyBall ? 0.35 : 0.62, this.slip ? 0.15 : 0.7);
      else b.vy = 0;
      if (b.state === 'pass') { b.state = 'loose'; b.pass = undefined; }
      if (b.state === 'shot') { b.state = 'loose'; b.shot = undefined; }
    }
    if (b.y <= fr + 0.5 && b.vy === 0) this.rollBall();
    else { b.wx *= 0.999; b.wy *= 0.995; b.wz *= 0.999; }
    if (b.x < COURT.minX - 10) { b.x = COURT.minX - 10; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > COURT.maxX + 10) { b.x = COURT.maxX + 10; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.z < COURT.minZ - 6) { b.z = COURT.minZ - 6; b.vz = Math.abs(b.vz) * 0.6; }
    if (b.z > COURT.maxZ + 6) { b.z = COURT.maxZ + 6; b.vz = -Math.abs(b.vz) * 0.6; }

    // A shot can be rebounded once it has come off the rim or board, or has clearly missed everything.
    const reboundable = b.state === 'shot' && !!b.shot && (b.shot.touched || b.shot.t > b.shot.T + 0.15);
    if ((b.state === 'loose' || reboundable) && this.phase === 'play') this.tryPickup();
  }

  /**
   * The ball meets a surface whose unit normal (nx, ny, nz) points away from it. It rebounds with
   * restitution `e`, and friction `mu` acts on the slip between the ball's surface and the wall,
   * trading speed for spin. Returns the speed it came in at.
   */
  private ballContact(nx: number, ny: number, nz: number, e: number, mu: number): number {
    const b = this.ball, r = this.ballR;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn >= 0) return 0;
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; b.vz -= (1 + e) * vn * nz;
    // Slip of the contact point: the ball's own velocity plus the spin there, less the normal part.
    const cx = b.wy * nz - b.wz * ny, cy = b.wz * nx - b.wx * nz, cz = b.wx * ny - b.wy * nx;
    let ux = b.vx - r * cx, uy = b.vy - r * cy, uz = b.vz - r * cz;
    const un = ux * nx + uy * ny + uz * nz;
    ux -= un * nx; uy -= un * ny; uz -= un * nz;
    const u = Math.hypot(ux, uy, uz);
    if (u > 0.001) {
      // A hollow ball that grips fully loses 2/5 of its slip; friction can only do so much in one touch.
      const k = Math.min(0.4, (mu * (1 + e) * -vn) / u);
      const dx = -k * ux, dy = -k * uy, dz = -k * uz;
      b.vx += dx; b.vy += dy; b.vz += dz;
      const q = 1.5 / r;
      b.wx -= q * (ny * dz - nz * dy); b.wy -= q * (nz * dx - nx * dz); b.wz -= q * (nx * dy - ny * dx);
    }
    return -vn;
  }

  /** A ball resting on the floor: sliding friction brings it to a true roll, then rolling resistance stops it. */
  private rollBall() {
    const b = this.ball, r = this.ballR;
    const g = this.slip ? 0.25 : 1;
    // Slip between the ball and the floor.
    const ux = b.vx + r * b.wz, uz = b.vz - r * b.wx;
    const u = Math.hypot(ux, uz);
    if (u > 1) {
      const k = Math.min(0.4, (900 * g * DT) / u);
      b.vx -= k * ux; b.vz -= k * uz;
      b.wz -= (1.5 / r) * k * ux; b.wx += (1.5 / r) * k * uz;
    }
    const v = Math.hypot(b.vx, b.vz);
    const dec = (this.heavyBall ? 260 : 45 + 0.55 * v) * g * DT;
    if (v <= dec) { b.vx = b.vz = 0; b.wx = b.wz = 0; }
    else { const f = (v - dec) / v; b.vx *= f; b.vz *= f; b.wx = b.vz / r; b.wz = -b.vx / r; }
    b.wy *= 0.9;
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
        if (distXZ(p.x, p.z, b.x, b.z) < 30 && b.y < p.y + 90) this.knockDown(p, Math.sign(b.vx) || 1, s.team, 300, 380, 'comet');
      }
    }
    // A ball stuck bouncing around the rim for too long is simply live again.
    if (s.t > s.T + 3) { b.state = 'loose'; b.shot = undefined; }
  }

  /**
   * Collides the ball with every rim and backboard. Returns true if it dropped through the hoop
   * its shooter was aiming at. A rim is a thin ring; a backboard is a flat panel behind it.
   */
  private ballVsHoops(prevY: number): boolean {
    const b = this.ball;
    const s = b.shot;
    const R = HOOP.rimR, r = this.ballR;
    for (const hp of this.rims) {
      if (Math.abs(b.x - hp.x) > 100) continue;
      const whole = hp.brokenT <= 0;
      // Through the ring from above: a basket.
      if (whole && s && hp.x === s.hoopX && prevY > hp.y && b.y <= hp.y && distXZ(b.x, b.z, hp.x, HOOP.z) < R - 2) {
        this.scoreShot(hp);
        return true;
      }
      if (s?.special) continue;
      // Rim: bounce off the nearest point of the ring.
      const dx = b.x - hp.x, dz = b.z - HOOP.z;
      const hl = Math.hypot(dx, dz) || 0.001;
      const px = hp.x + (dx / hl) * R, pz = HOOP.z + (dz / hl) * R;
      let nx = b.x - px, ny = b.y - hp.y, nz = b.z - pz;
      const dist = Math.hypot(nx, ny, nz);
      if (whole && dist < r + 1.5 && dist > 0.001) {
        nx /= dist; ny /= dist; nz /= dist;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) {
          // Iron rim: a dull bounce, and it bites into the ball's spin (backspin softens the next touch).
          this.ballContact(nx, ny, nz, 0.55, 0.5);
          const push = r + 1.5 - dist;
          b.x += nx * push; b.y += ny * push; b.z += nz * push;
          if (s) s.touched = true;
          if (vn < -60) this.emit('rim', px, hp.y, pz);
          // Balanced dead on the rim: roll it off toward the court.
          if (Math.hypot(b.vx, b.vy, b.vz) < 30) b.vx += hp.dir * 45;
        }
      }
      // Backboard.
      if (Math.abs(b.z - HOOP.z) < 36 + r * 0.5 && b.y > hp.y - 8 - r * 0.5 && b.y < hp.top + r * 0.5) {
        const rel = (b.x - hp.boardX) * hp.dir; // positive on the court side
        if (rel < r && rel > -r && b.vx * hp.dir < 0) {
          // Glass: backspin off the board sends the ball down toward the rim, as it does on a real court.
          this.ballContact(hp.dir, 0, 0, 0.6, 0.6);
          b.x = hp.boardX + hp.dir * r;
          if (s) { s.touched = true; s.board = true; }
          this.emit('board', hp.boardX, b.y, b.z);
        }
      }
    }
    return false;
  }

  private scoreShot(hp: { x: number; y: number; high: boolean }) {
    const b = this.ball;
    const s = b.shot!;
    // Dropping into the gold upper hoop is worth the bonus point, whichever hoop was aimed at.
    const points = (s.three ? 3 : 2) + (hp.high ? 1 : 0);
    b.state = 'scored';
    b.shot = undefined;
    b.x += (hp.x - b.x) * 0.5;
    b.z += (HOOP.z - b.z) * 0.5;
    b.vx *= 0.2; b.vz *= 0.2;
    b.vy = Math.max(b.vy, -220);
    const text = !s.touched ? 'SWISH!' : s.board ? 'BANK SHOT!' : 'RATTLED IN!';
    this.emit('swish', hp.x, hp.y, HOOP.z, { team: s.team, text, power: s.touched ? 1 : 2 });
    this.awardPoints(s.team, points, s.shooter, false, s.three);
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
    let bestD = this.ballR > BALL_R ? 38 : 28;
    for (const p of this.players) {
      if (!this.canAct(p) || p.pickupCd > 0) continue;
      if (p.state === 'punch' || p.state === 'tackle' || p.state === 'airkick' || p.state === 'grab' || p.state === 'toss' || p.state === 'pound' || p.state === 'spray') continue;
      if (b.y > p.y + 92 || b.y < p.y - 10) continue;
      // A ball that was just struck, or a cannonball in flight, cannot be caught by the other side.
      if (p.team !== b.lastTeam && (b.hot > 0 || (this.heavyBall && Math.hypot(b.vx, b.vz) > 230))) continue;
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
