import { HOOP } from '../core/constants';
import { ZS } from './view';

// A hoop's net as a small cloth: strands of nodes hanging from the rim, each pulled back to its
// resting place by a spring. The ball pushes the nodes out of its way as it drops through, so a
// swish snaps the net down and it whips back; a dunk yanks the whole thing.

const STRANDS = 9, ROWS = 4, ROW_H = 8;

interface Node { x: number; y: number; vx: number; vy: number; rx: number; ry: number }

export class Net {
  private nodes: Node[][] = [];

  constructor() {
    const r = HOOP.rimR;
    for (let i = 0; i < STRANDS; i++) {
      // The half of the ring that faces the camera.
      const a = Math.PI + (i / (STRANDS - 1)) * Math.PI;
      const strand: Node[] = [];
      for (let k = 0; k < ROWS; k++) {
        const taper = 1 - 0.15 * k;
        const rx = Math.cos(a) * r * taper, ry = -Math.sin(a) * r * ZS * taper + k * ROW_H;
        strand.push({ x: rx, y: ry, vx: 0, vy: 0, rx, ry });
      }
      this.nodes.push(strand);
    }
  }

  /** Yanks the whole net (a dunk, a body through the hoop). */
  kick(v: number) {
    for (const s of this.nodes) for (let k = 1; k < ROWS; k++) { s[k].vy += v * (40 + 25 * k); s[k].vx += (Math.random() - 0.5) * v * 60; }
  }

  /**
   * One step. `ball` is the ball relative to the middle of the rim on screen (x right, y down), or
   * null when it is nowhere near the net.
   */
  step(dt: number, ball: { x: number; y: number; vx: number; vy: number; r: number } | null, wind: number) {
    if (dt <= 0) return;
    const n = 2, h = Math.min(dt, 1 / 30) / n;
    for (let it = 0; it < n; it++) {
      for (const s of this.nodes) {
        for (let k = 1; k < ROWS; k++) {
          const q = s[k];
          // Lower rows hang looser, so the bottom of the net swings widest.
          const stiff = 520 - 110 * k;
          q.vx += (-stiff * (q.x - q.rx) - 7 * q.vx + wind * k * 30) * h;
          q.vy += (-stiff * (q.y - q.ry) - 7 * q.vy) * h;
          q.x += q.vx * h; q.y += q.vy * h;
          if (ball) {
            const dx = q.x - ball.x, dy = q.y - ball.y;
            const d = Math.hypot(dx, dy), R = ball.r + 1.5;
            if (d < R && d > 0.01) {
              // Pushed out to the ball's surface, and carried along with it.
              q.x = ball.x + (dx / d) * R; q.y = ball.y + (dy / d) * R;
              q.vx += (ball.vx - q.vx) * 0.35; q.vy += (ball.vy - q.vy) * 0.35;
            }
          }
          // A strand cannot stretch far past its length.
          const up = s[k - 1];
          const lx = q.x - up.x, ly = q.y - up.y, l = Math.hypot(lx, ly), max = ROW_H * 1.9;
          if (l > max) { q.x = up.x + (lx / l) * max; q.y = up.y + (ly / l) * max; }
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, gold: boolean) {
    ctx.strokeStyle = gold ? 'rgba(255,240,190,0.9)' : 'rgba(245,245,245,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of this.nodes) {
      ctx.moveTo(x + s[0].x, y + s[0].y);
      for (let k = 1; k < ROWS; k++) ctx.lineTo(x + s[k].x, y + s[k].y);
    }
    // Cross strings, row by row, zig-zagging like a real net.
    for (let k = 1; k < ROWS; k++) {
      ctx.moveTo(x + this.nodes[0][k].x, y + this.nodes[0][k].y);
      for (let i = 1; i < STRANDS; i++) {
        const a = this.nodes[i][k], b = this.nodes[i - 1][k - 1], c = this.nodes[i][k - 1];
        ctx.lineTo(x + (b.x + c.x) / 2, y + (b.y + c.y) / 2 + ROW_H * 0.5);
        ctx.lineTo(x + a.x, y + a.y);
      }
    }
    ctx.stroke();
  }
}
