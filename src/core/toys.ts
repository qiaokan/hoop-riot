// Everything strange on the court: items, explosions, moving hazards, timed events and rides.
// Each toy works by triggering physics the game already has (knockdowns that fly and bounce,
// a ball that collides with rims), so they all interact with players and with the ball.

import { BALL_R, COURT, DT, GRAVITY, HAND_Y, HIGH_MIN_Y, HOOP, THREE_PT, TeamId, attackHoopX } from './constants';
import type { Game, Intent, Item, Player } from './game';
import type { EventKind, ItemKind, RideKind } from './teams';

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const other = (t: TeamId): TeamId => (1 - t) as TeamId;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const ALL_ITEMS: ItemKind[] = ['can', 'cone', 'crate', 'bomb', 'bat', 'banana', 'hammer', 'ext', 'magnet', 'shoes'];
export const ITEM_NAME: Record<ItemKind, string> = {
  can: 'TRASH CAN', cone: 'CONE', crate: 'CRATE', bomb: 'BOMB!', bat: 'BAT', banana: 'BANANA',
  hammer: 'HAMMER', ext: 'EXTINGUISHER', magnet: 'MAGNET', shoes: 'SPRING SHOES',
};
export const EVENT_NAME: Record<EventKind, string> = {
  lowgrav: 'LOW GRAVITY', rain: 'RAIN', ufo: 'UFO!', ironball: 'IRON BALL', bombball: 'BOMB BALL', bigball: 'GIANT BALL',
};

export type HitKind = 'jab' | 'finisher' | 'tackle' | 'airkick' | 'bat';

export interface Ride {
  id: number;
  kind: RideKind;
  x: number; z: number; y: number;
  vx: number; vz: number;
  facing: 1 | -1;
  rider: number | null;
  hp: number;
  fuel: number;
  /** Cooldown on the ride's weapon. */
  cd: number;
  /** Seconds until a used-up or wrecked ride comes back (0 = on the court now). */
  respawn: number;
  /** Seconds before this ride can ram someone again. */
  ramCd: number;
  homeX: number; homeZ: number;
}

export interface Traffic { kind: 'car' | 'dogs'; lane: number; dir: 1 | -1; x: number; warn: number }
export interface Shell { x: number; y: number; z: number; vx: number; team: TeamId; left: number }
export interface Ufo { x: number; z: number; victim: number | null; phase: 'hunt' | 'lift' | 'carry'; tx: number; tz: number; cd: number }

export const RIDE: Record<RideKind, { speed: number; accel: number; fuel: number; hp: number; seat: number; alt: number; ram: number; back: number; ramEvery: number }> = {
  board: { speed: 340, accel: 7, fuel: 12, hp: 1, seat: 11, alt: 0, ram: 190, back: 20, ramEvery: 3 },
  tank: { speed: 115, accel: 4, fuel: 13, hp: 4, seat: 34, alt: 0, ram: 60, back: 25, ramEvery: 3 },
  heli: { speed: 230, accel: 4, fuel: 8, hp: 1, seat: 12, alt: 150, ram: 99999, back: 30, ramEvery: 0 },
};

export class Toys {
  rides: Ride[] = [];
  traffic: Traffic | null = null;
  shells: Shell[] = [];
  ufo: Ufo | null = null;
  event: { kind: EventKind; t: number; total: number } | null = null;
  /** The wrecking ball, on courts that have one. */
  wrecker: { x: number; y: number; z: number; vx: number } | null = null;
  gust: { dir: 1 | -1; t: number } | null = null;
  bumpers: { x: number; z: number; hit: number }[] = [];
  /** Seconds left on the bomb ball's fuse while that event runs. */
  ballFuse = 0;
  private itemTimer = 4;
  private nextId = 1;
  private trafficTimer = 9;
  private gustTimer = 7;
  private eventTimer = 14;
  private swing = 0;
  private sprayTick = 0;
  private prevMid: number[] = [];

  constructor(private g: Game) {
    const st = g.stage;
    (st.rides ?? []).forEach((r, i) => {
      this.rides.push({
        id: i, kind: r.kind, x: r.x, z: r.z, y: 0, vx: 0, vz: 0, facing: 1, rider: null,
        hp: RIDE[r.kind].hp, fuel: RIDE[r.kind].fuel, cd: 0, respawn: 0, ramCd: 0, homeX: r.x, homeZ: r.z,
      });
    });
    if (st.hazards?.includes('bumpers')) {
      this.bumpers = [[560, 180], [940, 180], [750, 70], [750, 290]].map(([x, z]) => ({ x, z, hit: 0 }));
    }
    if (st.hazards?.includes('wrecker')) this.wrecker = { x: COURT.midX, y: 30, z: HOOP.z, vx: 0 };
  }

  update() {
    this.updateItems();
    this.updateHazards();
    this.updateEvents();
    this.updateRides();
    this.updateShells();
    this.updateBodies();
    this.updateBuffs();
    this.updateHotBall();
  }

  /** Back to the starting formation: everyone gets off their ride and the saucer lets go. */
  reset() {
    for (const r of this.rides) r.rider = null;
    if (this.ufo) { this.ufo.victim = null; this.ufo.phase = 'hunt'; this.ufo.cd = 2; }
  }

  /** A ball that was just punched, kicked or batted hurts: it staggers (or, off a bat, floors) the first opponent in its way. */
  private updateHotBall() {
    const g = this.g;
    const b = g.ball;
    if (b.hot <= 0) return;
    if (b.state === 'held' || b.state === 'scored' || Math.hypot(b.vx, b.vz) < 250) { b.hot = 0; return; }
    for (const p of g.players) {
      if (p.team === b.lastTeam || !g.hittable(p)) continue;
      if (dist(p.x, p.z, b.x, b.z) > 20 || b.y < p.y - 5 || b.y > p.y + 88) continue;
      const dir = Math.sign(b.vx) || 1;
      if (p.state === 'ride' && this.absorbHit(p, b.hot >= 2)) { /* clang */ }
      else if (b.hot >= 2 || p.y > 0 || p.state === 'dunk') g.knockDown(p, dir, b.lastTeam, 320, 360, 'ball');
      else {
        if (g.ball.holder === p.id) g.fumble(p, dir, b.lastTeam);
        p.state = 'stun'; p.t = 0; p.stunFor = 0.45; p.vx = dir * 150;
        g.emit('hit', b.x, b.y, b.z, { player: p.id, team: b.lastTeam, power: 2 });
      }
      g.addHype(b.lastTeam, 0.08);
      b.vx *= -0.3; b.vz *= 0.5; b.vy = 220;
      if (b.state !== 'loose') { b.state = 'loose'; b.shot = undefined; b.pass = undefined; }
      b.hot = 0;
      return;
    }
  }

  /** A knockdown caused by the court itself (traffic, a slip, a stray blast): nobody gets credit for it. */
  private env(p: Player, dir: number, force: number, lift: number, cause: string) {
    const t = other(p.team);
    this.g.knockDown(p, dir, t, force, lift, 'court:' + cause);
    this.g.stats[t].kos--;
    this.g.envKos++;
  }

  // ---------------------------------------------------------------- items

  makeItem(kind: ItemKind, x: number, y: number, z: number): Item {
    return {
      id: this.nextId++, kind, x, y, z, vx: 0, vy: 0, vz: 0, state: 'ground', holder: null, team: null, spin: 0,
      fuse: -1, uses: kind === 'bat' ? 3 : kind === 'hammer' ? 2 : kind === 'ext' ? 4 : 1, armed: false,
    };
  }

  private remove(it: Item) {
    this.g.items = this.g.items.filter((i) => i !== it);
  }

  private updateItems() {
    const g = this.g;
    if (g.stage.itemEvery > 0 && g.phase === 'play') {
      this.itemTimer -= DT;
      if (this.itemTimer <= 0) {
        this.itemTimer = g.stage.itemEvery * (0.7 + 0.6 * g.rng());
        if (g.items.filter((i) => i.state === 'ground' && !i.armed).length < 3) {
          const pool = g.stage.items ?? ALL_ITEMS;
          g.items.push(this.makeItem(pool[Math.floor(g.rng() * pool.length)], 300 + g.rng() * 900, 300, 50 + g.rng() * 260));
        }
      }
    }

    const gone = new Set<Item>();
    for (const it of [...g.items]) {
      if (gone.has(it) || !g.items.includes(it)) continue;
      // A bomb's fuse starts when someone first picks it up, and it goes off wherever it is.
      if (it.kind === 'bomb' && it.fuse >= 0) {
        it.fuse -= DT;
        if (it.fuse <= 0) { gone.add(it); this.blast(it.x, it.y, it.z, 105, it.team, it); continue; }
      }
      if (it.state === 'held') {
        const h = g.players[it.holder!];
        it.x = h.x + h.facing * 12;
        it.y = h.y + HAND_Y + 6;
        it.z = h.z + 1;
      } else if (it.state === 'ground') {
        if (it.y > 0) {
          it.vy -= g.grav * DT;
          it.y += it.vy * DT;
          if (it.y <= 0) { it.y = 0; it.vy = 0; g.emit('bounce', it.x, 0, it.z); }
        } else if (it.armed) {
          // A banana on the floor: whoever runs over it goes sliding.
          for (const p of g.players) {
            if (p.y !== 0 || p.state !== 'move' || Math.hypot(p.vx, p.vz) < 50) continue;
            if (dist(p.x, p.z, it.x, it.z) < 17) { gone.add(it); this.slip(p); break; }
          }
        } else if (g.phase === 'play') {
          // Walk over an item with empty hands to pick it up.
          for (const p of g.players) {
            if (p.y !== 0 || p.state !== 'move' || dist(p.x, p.z, it.x, it.z) > 22) continue;
            // Magnets and spring shoes are worn, so even the ball carrier can take them.
            if (it.kind === 'magnet') { p.magnetT = 9; gone.add(it); }
            else if (it.kind === 'shoes') { p.springT = 10; gone.add(it); }
            else if (g.ball.holder === p.id || g.heldItem(p)) continue;
            else {
              it.state = 'held'; it.holder = p.id; it.team = p.team;
              if (it.kind === 'bomb') it.fuse = 3.5;
            }
            g.emit('item', it.x, 30, it.z, { player: p.id, text: ITEM_NAME[it.kind] });
            break;
          }
        }
      } else {
        it.spin += DT * 16;
        it.vy -= 500 * DT;
        it.x += it.vx * DT;
        it.y += it.vy * DT;
        it.z += it.vz * DT;
        let hit: Player | null = null;
        for (const o of g.players) {
          if (o.team === it.team || !g.hittable(o)) continue;
          if (Math.abs(o.x - it.x) < 24 && Math.abs(o.z - it.z) < 20 && it.y > o.y - 6 && it.y < o.y + 84) { hit = o; break; }
        }
        if (hit) {
          const o = hit;
          if (o.state === 'punch' && o.t < 0.14 && Math.sign(it.vx) === -o.facing && it.kind !== 'banana') {
            // Swinging at it at the right moment catches it instead.
            it.state = 'held'; it.holder = o.id; it.team = o.team;
            o.state = 'move'; o.t = 0;
            g.emit('item', it.x, it.y, it.z, { player: o.id, text: 'CAUGHT!' });
          } else if (it.kind === 'bomb') { gone.add(it); this.blast(it.x, it.y, it.z, 105, it.team, it); }
          else if (it.kind === 'banana') { gone.add(it); this.slip(o); }
          else if (o.state === 'ride' && this.absorbHit(o, true)) { gone.add(it); g.emit('itemhit', it.x, it.y, it.z); }
          else {
            gone.add(it);
            // Something flung by a blast belongs to nobody.
            if (it.team === null) this.env(o, Math.sign(it.vx) || 1, 300, 380, 'item');
            else { g.knockDown(o, Math.sign(it.vx) || 1, it.team, 300, 380, 'item'); g.addHype(it.team, 0.1); }
            g.emit('itemhit', it.x, it.y, it.z);
          }
        } else if (it.y <= 0 || it.x < COURT.minX - 20 || it.x > COURT.maxX + 20) {
          if (it.kind === 'bomb') { gone.add(it); this.blast(it.x, Math.max(0, it.y), it.z, 105, it.team, it); }
          else if (it.kind === 'banana') {
            it.state = 'ground'; it.armed = true; it.y = 0; it.vx = it.vy = it.vz = 0; it.spin = 0;
            it.x = clamp(it.x, COURT.minX, COURT.maxX);
          } else { gone.add(it); g.emit('itemhit', it.x, Math.max(4, it.y), it.z); }
        }
      }
    }
    if (gone.size) g.items = g.items.filter((i) => !gone.has(i));
  }

  /** The action button while carrying an item: swing it, slam it, spray it, or throw it. */
  useItem(p: Player, it: Item) {
    const g = this.g;
    if (it.kind === 'bat') {
      if (p.y > 0) return;
      g.startPunch(p, 2, 'bat');
      if (--it.uses <= 0) this.remove(it);
    } else if (it.kind === 'hammer' || it.kind === 'ext') {
      if (p.y > 0) return;
      p.state = it.kind === 'hammer' ? 'pound' : 'spray';
      p.t = 0;
      p.punchHit = false;
      if (--it.uses <= 0) this.remove(it);
    } else g.throwItem(p, it);
  }

  /** Hammer: a ground pound that launches every opponent nearby and pops a loose ball up. */
  pound(p: Player) {
    const g = this.g;
    g.emit('boom', p.x + p.facing * 26, 4, p.z, { power: 1, text: 'HAMMER!' });
    for (const o of g.opponents(p)) {
      if (!g.hittable(o) || o.y > 50) continue;
      if (dist(o.x, o.z, p.x, p.z) < 105) {
        if (o.state === 'ride' && this.absorbHit(o, true)) continue;
        g.knockDown(o, o.x >= p.x ? 1 : -1, p.team, 300, 470, 'hammer');
      }
    }
    const b = g.ball;
    if (b.state !== 'held' && b.state !== 'scored' && b.y < 60 && dist(b.x, b.z, p.x, p.z) < 125) b.vy = 430;
    g.hitstop = 0.07;
  }

  /** Fire extinguisher: a jet that shoves opponents and the ball away for as long as it sprays. */
  spray(p: Player) {
    const g = this.g;
    for (const o of g.opponents(p)) {
      const dx = (o.x - p.x) * p.facing;
      if (dx < 0 || dx > 190 || Math.abs(o.z - p.z) > 40 || Math.abs(o.y - p.y) > 70 || !g.hittable(o) || o.state === 'ride') continue;
      o.vx += p.facing * 2400 * DT;
      if (o.state === 'move' && o.y === 0) { o.state = 'stun'; o.t = 0; o.stunFor = 0.5; }
    }
    const b = g.ball;
    if (b.state !== 'held' && b.state !== 'scored') {
      const dx = (b.x - p.x) * p.facing;
      if (dx > 0 && dx < 190 && Math.abs(b.z - p.z) < 40) b.vx += p.facing * 2000 * DT;
    }
    if (this.sprayTick++ % 3 === 0) g.emit('spray', p.x + p.facing * 30, p.y + 44, p.z, { power: p.facing });
  }

  private slip(p: Player) {
    const g = this.g;
    const sp = Math.hypot(p.vx, p.vz);
    this.env(p, Math.sign(p.vx) || p.facing, Math.max(280, sp * 1.3), 150, 'slip');
    g.emit('slip', p.x, 30, p.z, { text: 'SLIP!' });
  }

  /**
   * An explosion: launches every player in range (friend or foe), flings the ball, sets off other
   * bombs and scatters loose items. A flung ball is live, so a blast can score.
   */
  blast(x: number, y: number, z: number, R: number, team: TeamId | null, source: Item | null, aimed = false) {
    const g = this.g;
    g.emit('boom', x, Math.max(10, y), z, { power: 2 });
    for (const p of g.players) {
      if (p.state === 'beam' || (p.invuln > 0 && p.state !== 'down')) continue;
      const d = dist(p.x, p.z, x, z);
      if (d > R || Math.abs(p.y - y) > 130) continue;
      // An aimed shot (a tank shell) spares the side that fired it. Bombs spare nobody.
      if (aimed && team === p.team) continue;
      // A tank shrugs off its own side's explosions, and a helicopter is above its own bombs.
      if (p.state === 'ride' && this.rideOf(p)?.kind !== 'board' && team === p.team) continue;
      if (p.state === 'ride' && this.absorbHit(p, true, 2)) continue;
      const k = 1 - 0.5 * (d / R);
      if (team !== null && team !== p.team) g.knockDown(p, p.x >= x ? 1 : -1, team, 380 * k, 540 * k, 'blast');
      else this.env(p, p.x >= x ? 1 : -1, 380 * k, 540 * k, 'blast');
    }
    const b = g.ball;
    if (b.state !== 'held' && b.state !== 'scored') {
      const dx = b.x - x, dz = b.z - z;
      const d = Math.hypot(dx, dz);
      if (d < R + 30 && Math.abs(b.y - y) < 150) {
        const n = d || 1;
        b.vx = (dx / n) * 520 + (d < 1 ? (g.rng() - 0.5) * 300 : 0);
        b.vz = (dz / n) * 280;
        b.vy = 560;
        this.liveBall(null);
      }
    }
    for (const it of g.items) {
      if (it === source || it.state === 'held') continue;
      if (dist(it.x, it.z, x, z) > R) continue;
      if (it.kind === 'bomb') it.fuse = it.fuse < 0 ? 0.15 : Math.min(it.fuse, 0.15);
      else if (it.state === 'ground' && !it.armed) { it.state = 'thrown'; it.team = null; it.vx = (it.x >= x ? 1 : -1) * 380; it.vy = 260; it.vz = 0; it.y = 10; }
    }
    g.hitstop = Math.max(g.hitstop, 0.06);
  }

  /** Marks a ball that has been sent flying as a live shot for whichever team attacks the hoop it is heading for. */
  liveBall(shooter: number | null, points = 2, three = false, touched = true) {
    const g = this.g;
    const b = g.ball;
    const team: TeamId = b.vx >= 0 ? 0 : 1;
    const sh = shooter !== null && g.players[shooter].team === team ? shooter : g.players.find((p) => p.team === team)!.id;
    b.state = 'shot';
    b.holder = null;
    b.pass = undefined;
    b.afterShot = true;
    b.lastTeam = team;
    b.shot = { made: false, points, team, shooter: sh, t: 0, T: 0.5, special: false, hoopX: attackHoopX(team), rimY: HOOP.rimY, three, touched, board: false };
  }

  /**
   * An attack that reaches the ball hits it. A fist or a kick knocks it away (and blocks a shot);
   * a bat sends it at the hoop as a line drive that can score from anywhere.
   */
  strikeBall(a: Player, reach: number, zr: number, kind: HitKind) {
    const g = this.g;
    const b = g.ball;
    if (b.state === 'held' || b.state === 'scored' || b.struck > 0) return;
    const dx = (b.x - a.x) * a.facing;
    if (dx < -6 || dx > reach + 8 || Math.abs(b.z - a.z) > zr + 6 || b.y < a.y - 4 || b.y > a.y + 96) return;
    // Fists leave their own side's shots and passes alone.
    if (kind !== 'bat') {
      if (b.state === 'shot' && b.shot?.team === a.team) return;
      if (b.state === 'pass' && b.pass && g.players[b.pass.from].team === a.team) return;
    }
    b.struck = 0.3;
    b.hot = kind === 'bat' ? 2 : 1;
    if (kind === 'bat') {
      const hx = attackHoopX(a.team);
      const d = dist(a.x, a.z, hx, HOOP.z);
      const ang = g.rng() * Math.PI * 2, r = 20 * Math.sqrt(g.rng());
      const tx = hx + Math.cos(ang) * r, tz = HOOP.z + Math.sin(ang) * r;
      // As flat as a ball can fly and still drop through a rim rather than clank off the front of it.
      const T = Math.max(0.45, Math.sqrt((0.75 * dist(b.x, b.z, tx, tz) + Math.max(0, HOOP.rimY - b.y)) / (0.5 * g.grav)));
      b.vx = (tx - b.x) / T;
      b.vz = (tz - b.z) / T;
      b.vy = (HOOP.rimY + 2 - b.y) / T + 0.5 * g.grav * T;
      // The ball must head for the batter's hoop for liveBall to credit the right team.
      if (Math.sign(b.vx) !== (a.team === 0 ? 1 : -1)) b.vx = (a.team === 0 ? 1 : -1) * Math.abs(b.vx || 1);
      const three = d > THREE_PT;
      this.liveBall(a.id, three ? 3 : 2, three, false);
      b.shot!.T = T;
      g.stats[a.team].fga++;
      if (three) g.stats[a.team].tpa++;
      g.emit('crack', b.x, b.y, b.z, { player: a.id, text: 'LINE DRIVE!' });
    } else {
      if (b.state === 'shot' && b.shot && b.shot.team !== a.team) {
        g.stats[a.team].blocks++;
        g.emit('block', b.x, b.y, b.z, { player: a.id, team: a.team, text: 'SWATTED!' });
      } else g.emit('bounce', b.x, b.y, b.z);
      b.state = 'loose';
      b.shot = undefined;
      b.pass = undefined;
      b.vx = a.facing * (kind === 'jab' ? 380 : 520);
      b.vz = (g.rng() - 0.5) * 120;
      b.vy = b.y > 60 ? -200 : 280;
      b.lastTeam = a.team;
    }
  }

  // ---------------------------------------------------------------- bodies, rims, buffs

  damageRim(rim: { x: number; y: number; hp: number; brokenT: number }, n: number) {
    if (rim.brokenT > 0) return;
    rim.hp -= n;
    if (rim.hp <= 0) {
      rim.brokenT = 6;
      this.g.emit('rimbreak', rim.x, rim.y, HOOP.z, { text: 'RIM BROKEN!' });
    }
  }

  private updateBodies() {
    const g = this.g;
    for (const p of g.players) {
      const mid = p.y + 40;
      const prev = this.prevMid[p.id] ?? mid;
      // A flying body that drops through the hoop its team defends is a body dunk for the other side.
      if (p.state === 'down' && !p.bodyDunked && prev > mid) {
        const team = other(p.team);
        const hx = attackHoopX(team);
        for (const rim of g.rims) {
          if (rim.x !== hx || rim.brokenT > 0) continue;
          if (prev > rim.y && mid <= rim.y && dist(p.x, p.z, rim.x, HOOP.z) < HOOP.rimR + 9) {
            p.bodyDunked = true;
            const scorer = p.downBy >= 0 && g.players[p.downBy].team === team ? p.downBy : g.players.find((q) => q.team === team)!.id;
            g.stats[team].fga++;
            g.awardPoints(team, 1, scorer, true);
            g.emit('bodydunk', rim.x, rim.y, HOOP.z, { team, text: 'BODY DUNK! +1' });
            this.damageRim(rim, 2);
            break;
          }
        }
      }
      this.prevMid[p.id] = mid;
    }
    for (const rim of g.rims) {
      if (rim.brokenT <= 0) continue;
      rim.brokenT -= DT;
      if (rim.brokenT <= 0) { rim.brokenT = 0; rim.hp = 6; g.emit('rimfix', rim.x, rim.y, HOOP.z); }
    }
  }

  private updateBuffs() {
    const g = this.g;
    const b = g.ball;
    for (const p of g.players) {
      p.magnetT = Math.max(0, p.magnetT - DT);
      p.springT = Math.max(0, p.springT - DT);
      p.rideCd = Math.max(0, p.rideCd - DT);
      // Magnet: a loose ball nearby is pulled toward the player.
      if (p.magnetT > 0 && b.state === 'loose') {
        const dx = p.x - b.x, dz = p.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 300 && d > 4) { b.vx += (dx / d) * 1200 * DT; b.vz += (dz / d) * 1200 * DT; if (b.y > 40) b.vy -= 400 * DT; }
      }
    }
  }

  // ---------------------------------------------------------------- hazards

  private updateHazards() {
    const g = this.g;
    const hz = g.stage.hazards ?? [];
    const b = g.ball;
    const free = b.state !== 'held' && b.state !== 'scored';

    // Traffic: a car or a pack of dogs comes down one lane of the court, after a warning.
    const lanes = hz.filter((h): h is 'car' | 'dogs' => h === 'car' || h === 'dogs');
    if (lanes.length) {
      if (!this.traffic) {
        if (g.phase === 'play') this.trafficTimer -= DT;
        if (this.trafficTimer <= 0) {
          const kind = lanes[Math.floor(g.rng() * lanes.length)];
          const dir: 1 | -1 = g.rng() < 0.5 ? 1 : -1;
          this.traffic = { kind, lane: [80, 180, 280][Math.floor(g.rng() * 3)], dir, x: dir > 0 ? -120 : COURT.len + 120, warn: 1.5 };
          g.emit('warn', COURT.midX, 10, this.traffic.lane, { text: kind === 'car' ? 'CAR!' : 'DOGS!' });
        }
      } else {
        const t = this.traffic;
        if (t.warn > 0) t.warn -= DT;
        else {
          const car = t.kind === 'car';
          t.x += t.dir * (car ? 640 : 470) * DT;
          // A car is one long body; the dogs are four in a row.
          const pts = car ? [0] : [0, 60, 120, 180];
          for (const off of pts) {
            const hx = t.x - t.dir * off;
            for (const p of g.players) {
              if (!g.hittable(p) || p.y > 50 || Math.abs(p.z - t.lane) > 26 || Math.abs(p.x - hx) > (car ? 62 : 22)) continue;
              if (p.state === 'ride' && this.absorbHit(p, true, 2)) continue;
              this.env(p, t.dir, car ? 440 : 300, car ? 430 : 260, car ? 'car' : 'dogs');
            }
            if (free && b.y < 50 && Math.abs(b.z - t.lane) < 26 && Math.abs(b.x - hx) < (car ? 62 : 22)) {
              b.vx = t.dir * 520; b.vy = 380;
              if (b.state === 'pass') { b.state = 'loose'; b.pass = undefined; }
            }
          }
          if (t.x < -260 || t.x > COURT.len + 260) { this.traffic = null; this.trafficTimer = 12 + g.rng() * 8; }
        }
      }
    }

    // Wrecking ball: a pendulum swinging the length of mid-court.
    if (this.wrecker) {
      this.swing += DT * 1.0;
      const th = 0.75 * Math.cos(this.swing);
      const w = this.wrecker;
      const nx = COURT.midX + 400 * Math.sin(th), ny = 430 - 400 * Math.cos(th);
      w.vx = (nx - w.x) / DT;
      w.x = nx; w.y = ny;
      for (const p of g.players) {
        if (!g.hittable(p) || Math.abs(p.z - w.z) > 28 || Math.abs(p.x - w.x) > 30 || w.y > p.y + 95 || w.y < p.y - 30) continue;
        if (p.state === 'ride' && this.absorbHit(p, true, 2)) continue;
        this.env(p, Math.sign(w.vx) || 1, 440, 430, 'wrecker');
      }
      if (free && Math.abs(b.z - w.z) < 34 && Math.abs(b.x - w.x) < 30 && Math.abs(b.y - w.y) < 34) {
        b.vx = (Math.sign(w.vx) || 1) * 520; b.vy = 320;
        if (b.state === 'pass') { b.state = 'loose'; b.pass = undefined; }
      }
    }

    // Pinball bumpers: anything that touches one is kicked away.
    for (const bm of this.bumpers) {
      bm.hit = Math.max(0, bm.hit - DT);
      for (const p of g.players) {
        if (p.y > 20 || p.state === 'down' || p.state === 'held' || p.state === 'ride' || p.state === 'beam' || p.state === 'dunk') continue;
        const dx = p.x - bm.x, dz = (p.z - bm.z) * 1.4;
        const d = Math.hypot(dx, dz);
        if (d >= 32 || d < 0.01) continue;
        p.vx = (dx / d) * 380; p.vz = (dz / d) * 270;
        p.x = clamp(bm.x + (dx / d) * 32, COURT.minX, COURT.maxX);
        p.z = clamp(bm.z + ((dz / d) * 32) / 1.4, COURT.minZ, COURT.maxZ);
        if (bm.hit <= 0) { bm.hit = 0.25; g.emit('bump', bm.x, 10, bm.z); }
      }
      if (free && b.y < 40) {
        const dx = b.x - bm.x, dz = (b.z - bm.z) * 1.4;
        const d = Math.hypot(dx, dz);
        if (d < 28 && d > 0.01) {
          b.vx = (dx / d) * 440; b.vz = (dz / d) * 300; b.vy = Math.max(b.vy, 220);
          if (b.state === 'pass') { b.state = 'loose'; b.pass = undefined; }
          if (bm.hit <= 0) { bm.hit = 0.25; g.emit('bump', bm.x, 10, bm.z); }
        }
      }
    }

    // Wind: gusts push the ball and anyone in the air.
    if (hz.includes('wind')) {
      if (!this.gust) {
        if (g.phase === 'play') this.gustTimer -= DT;
        if (this.gustTimer <= 0) {
          this.gust = { dir: g.rng() < 0.5 ? 1 : -1, t: 2.6 };
          g.emit('gust', COURT.midX, 120, HOOP.z, { power: this.gust.dir, text: 'WIND!' });
        }
      } else {
        const gu = this.gust;
        gu.t -= DT;
        for (const p of g.players) if (p.y > 5 && p.state !== 'dunk' && p.state !== 'held' && p.state !== 'ride' && p.state !== 'beam') p.vx += gu.dir * 420 * DT;
        if (free && b.y > 20) b.vx += gu.dir * 560 * DT;
        if (gu.t <= 0) { this.gust = null; this.gustTimer = 7 + g.rng() * 5; }
      }
    }
  }

  // ---------------------------------------------------------------- events

  startEvent(kind: EventKind) {
    const g = this.g;
    if (this.event) this.endEvent();
    const total = kind === 'ufo' || kind === 'bombball' ? 14 : 12;
    this.event = { kind, t: total, total };
    if (kind === 'ufo') this.ufo = { x: COURT.midX, z: 60, victim: null, phase: 'hunt', tx: 0, tz: 0, cd: 1 };
    if (kind === 'bombball') this.ballFuse = 8;
    g.emit('event', COURT.midX, 150, HOOP.z, { text: EVENT_NAME[kind] });
  }

  endEvent() {
    const g = this.g;
    if (this.ufo?.victim !== null && this.ufo) {
      const p = g.players[this.ufo.victim!];
      if (p.state === 'beam') this.env(p, 1, 40, 0, 'ufo');
    }
    this.ufo = null;
    this.event = null;
    g.grav = GRAVITY;
    g.slip = false;
    g.ballR = BALL_R;
    g.heavyBall = false;
    g.emit('eventend', COURT.midX, 150, HOOP.z);
  }

  private updateEvents() {
    const g = this.g;
    const pool = g.stage.events ?? [];
    if (!this.event) {
      if (!pool.length) return;
      if (g.phase === 'play') this.eventTimer -= DT;
      if (this.eventTimer <= 0) {
        this.eventTimer = 20 + g.rng() * 10;
        this.startEvent(pool[Math.floor(g.rng() * pool.length)]);
      }
      return;
    }
    const ev = this.event;
    ev.t -= DT;
    g.heavyBall = ev.kind === 'ironball';
    g.grav = ev.kind === 'lowgrav' ? GRAVITY * 0.45 : GRAVITY;
    g.slip = ev.kind === 'rain';
    g.ballR = ev.kind === 'bigball' ? 14 : BALL_R;
    const b = g.ball;
    if (ev.kind === 'ironball') {
      // The ball is a cannonball: in flight it floors anyone on the other side that it hits.
      if (b.state !== 'held' && b.state !== 'scored' && Math.hypot(b.vx, b.vz) > 230) {
        for (const p of g.players) {
          if (p.team === b.lastTeam || !g.hittable(p)) continue;
          if (dist(p.x, p.z, b.x, b.z) < 22 && b.y > p.y - 5 && b.y < p.y + 90) {
            if (p.state === 'ride' && this.absorbHit(p, true)) continue;
            g.knockDown(p, Math.sign(b.vx) || 1, b.lastTeam, 300, 340, 'ball');
            b.vx *= 0.4; b.vz *= 0.4;
            if (b.state === 'pass') { b.state = 'loose'; b.pass = undefined; }
          }
        }
      }
    } else if (ev.kind === 'bombball') {
      // The ball itself is on a fuse: every few seconds it goes off, wherever it is.
      this.ballFuse -= DT;
      if (this.ballFuse <= 0) {
        this.ballFuse = 8;
        this.blast(b.x, b.y, b.z, 100, null, null);
      }
    } else if (ev.kind === 'ufo' && this.ufo) this.updateUfo(this.ufo);
    if (ev.t <= 0) this.endEvent();
  }

  private updateUfo(u: Ufo) {
    const g = this.g;
    u.cd = Math.max(0, u.cd - DT);
    const fly = (tx: number, tz: number, speed: number) => {
      const dx = tx - u.x, dz = tz - u.z;
      const d = Math.hypot(dx, dz);
      if (d < speed * DT) { u.x = tx; u.z = tz; return true; }
      u.x += (dx / d) * speed * DT; u.z += (dz / d) * speed * DT;
      return false;
    };
    if (u.phase === 'hunt') {
      // Drifts after the ball carrier, and beams up whoever it ends up over.
      const h = g.holder();
      fly(h ? h.x : g.ball.x, h ? h.z : g.ball.z, 130);
      if (u.cd > 0) return;
      for (const p of g.players) {
        if (p.y !== 0 || (p.state !== 'move' && p.state !== 'stun') || p.invuln > 0) continue;
        if (Math.abs(p.x - u.x) > 22 || Math.abs(p.z - u.z) > 26) continue;
        if (g.ball.holder === p.id) g.fumble(p, p.facing, other(p.team));
        g.dropItem(p);
        p.state = 'beam'; p.t = 0; p.vx = p.vy = p.vz = 0;
        u.victim = p.id; u.phase = 'lift';
        g.emit('beam', p.x, 60, p.z, { player: p.id, text: 'ABDUCTED!' });
        break;
      }
    } else if (u.phase === 'lift') {
      const p = g.players[u.victim!];
      if (p.state !== 'beam') { u.phase = 'hunt'; u.victim = null; return; }
      p.x += (u.x - p.x) * 0.2; p.z = u.z; p.y += 240 * DT;
      if (p.y >= 160) { u.phase = 'carry'; u.tx = 220 + g.rng() * 1060; u.tz = 60 + g.rng() * 240; }
    } else {
      const p = g.players[u.victim!];
      if (p.state !== 'beam') { u.phase = 'hunt'; u.victim = null; return; }
      const there = fly(u.tx, u.tz, 520);
      p.x = u.x; p.z = u.z; p.y = 160;
      if (there) {
        // Dropped from the saucer somewhere else on the court.
        this.env(p, 1, 40, 0, 'ufo');
        u.phase = 'hunt'; u.victim = null; u.cd = 4;
      }
    }
  }

  // ---------------------------------------------------------------- rides

  rideOf(p: Player): Ride | null {
    return p.rideId >= 0 ? this.rides[p.rideId] ?? null : null;
  }

  /**
   * A hit on a rider. A tank soaks it up (heavy hits cost armour) and its driver is unharmed until
   * the armour is gone. Returns true when the ride took the hit instead of the player.
   */
  absorbHit(p: Player, heavy: boolean, dmg = 1): boolean {
    const r = this.rideOf(p);
    if (!r || r.kind !== 'tank') return false;
    if (heavy) r.hp -= dmg;
    this.g.emit('clang', r.x, 30, r.z);
    if (r.hp <= 0) {
      // Out of armour: the tank blows up and throws its driver.
      r.rider = null; r.respawn = 40;
      p.rideId = -1; p.state = 'move'; p.y = 0;
      this.blast(r.x, 10, r.z, 80, null, null);
    }
    return true;
  }

  private dismount(p: Player, r: Ride, usedUp: boolean) {
    r.rider = null;
    p.rideId = -1;
    p.rideCd = 1.2;
    if (usedUp) { r.respawn = r.kind === 'tank' ? 35 : 30; this.g.emit('itemhit', r.x, r.y + 10, r.z); }
  }

  private updateRides() {
    const g = this.g;
    for (const r of this.rides) {
      if (r.respawn > 0) {
        r.respawn -= DT;
        if (r.respawn <= 0) {
          r.respawn = 0; r.x = r.homeX; r.z = r.homeZ; r.y = 0; r.vx = r.vz = 0;
          r.hp = RIDE[r.kind].hp; r.fuel = RIDE[r.kind].fuel;
        }
        continue;
      }
      r.cd = Math.max(0, r.cd - DT);
      r.ramCd = Math.max(0, r.ramCd - DT);
      if (r.rider !== null) {
        // The rider was knocked off or otherwise left.
        const p = g.players[r.rider];
        if (p.state !== 'ride' || p.rideId !== r.id) { r.rider = null; if (p.rideId === r.id) p.rideId = -1; p.rideCd = 1.2; }
        continue;
      }
      // Empty: it rolls to a stop, settles to the ground, and anyone who walks into it gets on.
      r.vx *= 0.9; r.vz *= 0.9;
      r.x = clamp(r.x + r.vx * DT, COURT.minX, COURT.maxX);
      r.z = clamp(r.z + r.vz * DT, COURT.minZ, COURT.maxZ);
      r.y = Math.max(0, r.y - 320 * DT);
      if (g.phase !== 'play' || r.y > 0) continue;
      for (const p of g.players) {
        if (p.y !== 0 || p.state !== 'move' || p.rideCd > 0) continue;
        if (dist(p.x, p.z, r.x, r.z) > 26) continue;
        g.dropItem(p);
        r.rider = p.id;
        p.rideId = r.id; p.state = 'ride'; p.t = 0;
        g.emit('mount', r.x, 40, r.z, { player: p.id, text: r.kind === 'board' ? 'SKATEBOARD!' : r.kind === 'tank' ? 'TANK!' : 'HELICOPTER!' });
        break;
      }
    }
  }

  /** Called every frame for a player on a ride: steering, ramming, the ride's weapon, getting off. */
  drive(p: Player, intent: Intent, pressedShoot: boolean, takeAction: () => boolean) {
    const g = this.g;
    const r = this.rideOf(p);
    if (!r || r.rider !== p.id) { p.state = 'move'; p.t = 0; p.rideId = -1; return; }
    const S = RIDE[r.kind];
    r.fuel -= DT;
    let mx = intent.mx, mz = intent.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const k = Math.min(1, S.accel * DT);
    r.vx += (mx * S.speed - r.vx) * k;
    r.vz += (mz * S.speed * 0.75 - r.vz) * k;
    r.x = clamp(r.x + r.vx * DT, COURT.minX, COURT.maxX);
    r.z = clamp(r.z + r.vz * DT, COURT.minZ, COURT.maxZ);
    if (Math.abs(intent.mx) > 0.15) r.facing = intent.mx > 0 ? 1 : -1;
    r.y = Math.min(S.alt, r.y + 320 * DT);
    p.x = r.x; p.z = r.z; p.y = r.y + Math.max(0, S.seat);
    p.facing = r.facing;
    p.vx = r.vx; p.vz = r.vz; p.vy = 0;
    p.anim += Math.hypot(r.vx, r.vz) * DT;

    // Ramming.
    const sp = Math.hypot(r.vx, r.vz);
    if (sp > S.ram && r.ramCd <= 0) {
      for (const o of g.opponents(p)) {
        if (r.ramCd > 0) break; // one body per ram
        if (!g.hittable(o) || o.y > 50 || dist(o.x, o.z, r.x, r.z) > 32) continue;
        if (o.state === 'ride' && this.absorbHit(o, true)) continue;
        g.knockDown(o, Math.sign(r.vx) || r.facing, p.team, r.kind === 'tank' ? 380 : 320, 320, 'ram:' + r.kind);
        // A ram costs the ride: it has to wind up again, and a skateboard loses a quarter of its life.
        r.ramCd = S.ramEvery;
        if (r.kind === 'board') { r.vx *= 0.4; r.vz *= 0.4; r.fuel -= 4; }
      }
    }

    // The ride's weapon.
    if (takeAction() && r.cd <= 0) {
      if (r.kind === 'tank') {
        r.cd = 3;
        if (g.ball.holder === p.id) {
          // Loaded with the ball: the cannon fires it at the hoop.
          const three = dist(p.x, p.z, attackHoopX(p.team), HOOP.z) > THREE_PT;
          g.stats[p.team].fga++;
          if (three) g.stats[p.team].tpa++;
          g.launchShot(p, 6 + 0.035 * dist(p.x, p.z, attackHoopX(p.team), HOOP.z), three ? 3 : 2, false, false, three);
          g.emit('boom', r.x + r.facing * 70, 52, r.z, { power: 1, text: 'CANNON SHOT!' });
        } else {
          this.shells.push({ x: r.x + r.facing * 72, y: 52, z: r.z, vx: r.facing * 760, team: p.team, left: 560 });
          g.emit('boom', r.x + r.facing * 70, 52, r.z, { power: 1 });
        }
      } else if (r.kind === 'heli') {
        r.cd = 1.1;
        const bomb = this.makeItem('bomb', r.x, r.y - 6, r.z);
        bomb.state = 'thrown'; bomb.team = p.team; bomb.vx = r.vx * 0.6; bomb.vz = r.vz * 0.6; bomb.fuse = 5;
        g.items.push(bomb);
        g.emit('throw', bomb.x, bomb.y, bomb.z, { player: p.id });
      } else {
        // Skateboard: a short burst of speed.
        r.cd = 1.5;
        r.vx += r.facing * 240;
      }
    }

    // Getting off: the shoot button, or the ride running out.
    if (pressedShoot || r.fuel <= 0) {
      const used = r.fuel <= 0;
      this.dismount(p, r, used);
      if (r.kind === 'heli') {
        // Bailing out of the helicopter: a sky dunk if the rim is close, otherwise a free fall you can shoot from.
        if (g.ball.holder === p.id && pressedShoot && dist(p.x, p.z, attackHoopX(p.team), HOOP.z) < 200 && p.y > HIGH_MIN_Y) { g.startSkyDunk(p); return; }
        p.state = 'jump'; p.t = 0; p.vy = 0; p.launched = true; p.released = false;
      } else if (g.ball.holder === p.id && pressedShoot) {
        // Off a skateboard or out of a tank with the ball: straight into a dunk or a jump shot.
        const hx = attackHoopX(p.team);
        if (dist(p.x, p.z, hx, HOOP.z) < 215 && Math.sign(hx - p.x) === p.facing) g.startDunk(p);
        else g.startJumpShot(p);
      } else {
        p.state = 'jump'; p.t = 0; p.y = 1; p.vy = 300; p.released = g.ball.holder !== p.id; p.launched = false;
      }
    }
  }

  private updateShells() {
    const g = this.g;
    for (const s of this.shells) {
      const step = s.vx * DT;
      s.x += step;
      s.left -= Math.abs(step);
      let boom = s.left <= 0 || s.x < COURT.minX || s.x > COURT.maxX;
      for (const p of g.players) {
        if (p.team === s.team || !g.hittable(p)) continue;
        if (Math.abs(p.x - s.x) < 22 && Math.abs(p.z - s.z) < 24 && s.y > p.y - 10 && s.y < p.y + 90) boom = true;
      }
      if (boom) { s.left = -1; this.blast(s.x, s.y, s.z, 65, s.team, null, true); }
    }
    this.shells = this.shells.filter((s) => s.left > -1);
  }
}
