// Dev-only page (lineup.html): a still contact sheet of the characters, previous drawing code on
// the upper row of each pair and the current code below it. First the whole roster standing, then
// each move as a strip of phases. Nothing animates, so one screenshot is enough to compare.
//   lineup.html?from=0&n=3&who=0   moves [from, from+n), drawn with player `who`
import { Mood, drawPlayer as drawNew, handPos } from '../client/character';
import { FLOOR_TOP, ZS } from '../client/view';
import { Game, Player } from '../core/game';
import { HOME_TEAM, OPPONENTS, TeamDef } from '../core/teams';
import { drawPlayer as drawOld } from './prev_character';
import { MOVES, reset } from './sheet';

const q = new URLSearchParams(location.search);
const FROM = Number(q.get('from') ?? 0), N = Number(q.get('n') ?? 3), WHO = Number(q.get('who') ?? 0);
const ROSTER = q.get('roster') !== '0';
const K = 9, CW = 165, RH = 185, W = K * CW + 20;
const moves = MOVES.slice(FROM, FROM + N);
const H = (ROSTER ? 2 * RH + 30 : 0) + moves.length * (2 * RH + 26);
const cv = document.getElementById('lineup') as HTMLCanvasElement;
cv.width = W * 2; cv.height = H * 2;
// ?px=1 shows the sheet at full size (scroll to look around) instead of fitted to the window.
if (q.get('px')) { cv.style.width = `${W}px`; }
const ctx = cv.getContext('2d')!;
ctx.setTransform(2, 0, 0, 2, 0, 0);

const games = OPPONENTS.map((o) => new Game({ home: HOME_TEAM, away: o.team, seed: 1 }));
const roster: { def: Player; team: TeamDef }[] = [];
games.forEach((g, i) => { for (const p of g.players) if (p.team === 1 || i === 0) roster.push({ def: p, team: g.teams[p.team] }); });
let nextId = 1000;
const make = (src: Player): Player => ({ ...src, prev: { shoot: false, action: false, special: false }, id: nextId++, facing: 1 });

function look(mood: Mood, hasBall: boolean, celebrate: boolean, ballH: number) {
  return { hasBall, mood, celebrate, dt: 1 / 60, ballH, gazeX: 100, gazeY: 0, carrying: false };
}
const label = (s: string, x: number, y: number, c = '#fff') => { ctx.fillStyle = c; ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(s, x, y); };

let y0 = 0;
if (ROSTER) {
  label('Roster — previous (top), current (bottom)', 10, 16);
  [drawOld, drawNew].forEach((draw, r) => {
    const footY = y0 + 30 + r * RH + RH - 22;
    roster.forEach((e, i) => {
      const p = make(e.def);
      reset(p);
      p.z = (footY - FLOOR_TOP) / ZS;
      const x = 80 + i * ((W - 120) / (roster.length - 1));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, footY, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
      for (let f = 0; f < 3; f++) draw(ctx, p, e.team, x, 1 + f / 60, look('normal', false, false, 36) as never);
    });
  });
  y0 += 2 * RH + 30;
}

// ?faces=1: every face, on the current drawing code, across the top.
if (q.get('faces')) {
  const moods: Mood[] = ['normal', 'happy', 'smug', 'focus', 'aim', 'effort', 'tired', 'angry', 'grit', 'shout', 'shock', 'pain', 'dizzy', 'sad'];
  ctx.fillStyle = '#7a4a34'; ctx.fillRect(0, 0, W, RH + 30);
  label('Faces (current)', 10, 16);
  moods.forEach((m, i) => {
    const p = make(roster[(i * 3) % roster.length].def);
    reset(p);
    const footY = RH;
    p.z = (footY - FLOOR_TOP) / ZS;
    const x = 60 + i * ((W - 110) / (moods.length - 1));
    for (let f = 0; f < 3; f++) drawNew(ctx, p, roster[(i * 3) % roster.length].team, x, 1 + f / 60, look(m, false, false, 36));
    label(m, x - 18, footY + 16, '#ffe9b0');
  });
}

const who = roster[WHO];
moves.forEach((m, mi) => {
  const top = y0 + mi * (2 * RH + 26);
  label(`${m.name} — previous (top), current (bottom)`, 10, top + 16);
  [drawOld, drawNew].forEach((draw, r) => {
    const footY = top + 26 + r * RH + RH - 22;
    for (let k = 0; k < K; k++) {
      const p = make(who.def);
      const x = 10 + k * CW + CW / 2;
      const tEnd = ((k + 0.5) / K) * m.len;
      // Play up to this phase so easing and springs are where they would be in the game.
      const frames = Math.max(1, Math.round(Math.min(tEnd, 0.4) * 60));
      for (let f = frames; f >= 0; f--) {
        const t = tEnd - f / 60;
        reset(p);
        const mood = m.set(p, Math.max(0, t));
        p.z = (footY - FLOOR_TOP) / ZS;
        ctx.save();
        ctx.beginPath(); ctx.rect(x - CW / 2, footY - RH + 22, CW, RH); ctx.clip();
        ctx.clearRect(x - CW / 2, footY - RH + 22, CW, RH);
        ctx.fillStyle = k % 2 ? '#7a4a34' : '#754631';
        ctx.fillRect(x - CW / 2, footY - RH + 22, CW, RH);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, footY, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
        const hasBall = !!m.ball && !p.released;
        const ballH = 6 + 30 * Math.abs(Math.sin(t * 9));
        draw(ctx, p, who.team, x, t, look(mood, hasBall, !!m.celebrate, hasBall && p.state === 'move' ? ballH : 36) as never);
        if (hasBall) {
          const hd = r === 1 ? handPos(p.id) : null;
          let bx = x + 16, by = footY - p.y - 50;
          if (hd) { bx = x + hd.dx + 3; by = footY - p.y + hd.dy + (p.state === 'move' ? 4 : -8); }
          ctx.fillStyle = '#e0702a'; ctx.strokeStyle = '#1b1320'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
});
(window as unknown as { __lineup: unknown }).__lineup = { moves: MOVES.map((m) => m.name), roster: roster.map((e) => e.def.def.name) };
