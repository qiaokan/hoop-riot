import type { Intent } from '../core/game';

const MOVE = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
};
const SHOOT = ['KeyJ', 'Space'];
const ACTION = ['KeyK'];
const SPECIAL = ['KeyL'];
const SPRINT = ['ShiftLeft', 'ShiftRight'];

export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'mute' | 'music';

export class Input {
  private held = new Set<string>();
  private menuQueue: MenuKey[] = [];
  private prevPad: boolean[] = [];
  onFirstGesture: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.gesture();
      if (!e.repeat) {
        const m = this.menuFor(e.code);
        if (m) this.menuQueue.push(m);
      }
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('pointerdown', () => this.gesture());
  }

  private gesture() {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  private menuFor(code: string): MenuKey | null {
    if (MOVE.up.includes(code)) return 'up';
    if (MOVE.down.includes(code)) return 'down';
    if (MOVE.left.includes(code)) return 'left';
    if (MOVE.right.includes(code)) return 'right';
    if (code === 'Enter' || code === 'KeyJ' || code === 'Space') return 'confirm';
    if (code === 'Escape' || code === 'Backspace') return 'back';
    if (code === 'KeyP') return 'pause';
    if (code === 'KeyM') return 'mute';
    if (code === 'KeyN') return 'music';
    return null;
  }

  private any(codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Poll once per frame: turns gamepad button edges into menu keys. */
  poll() {
    const p = this.pad();
    if (!p) return;
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const map: [number, MenuKey][] = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'], [0, 'confirm'], [1, 'back'], [9, 'pause']];
    for (const [i, key] of map) {
      const now = b(i);
      if (now && !this.prevPad[i]) { this.menuQueue.push(key); this.gesture(); }
      this.prevPad[i] = now;
    }
  }

  takeMenu(): MenuKey[] {
    const q = this.menuQueue;
    this.menuQueue = [];
    return q;
  }

  intent(): Intent {
    let mx = (this.any(MOVE.right) ? 1 : 0) - (this.any(MOVE.left) ? 1 : 0);
    let mz = (this.any(MOVE.down) ? 1 : 0) - (this.any(MOVE.up) ? 1 : 0);
    let shoot = this.any(SHOOT), action = this.any(ACTION), special = this.any(SPECIAL), sprint = this.any(SPRINT);
    const p = this.pad();
    if (p) {
      const dz = 0.25;
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      if (Math.abs(ax) > dz) mx = ax;
      if (Math.abs(ay) > dz) mz = ay;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      if (b(14)) mx = -1;
      if (b(15)) mx = 1;
      if (b(12)) mz = -1;
      if (b(13)) mz = 1;
      shoot ||= b(0);
      action ||= b(2);
      special ||= b(1) || b(3);
      sprint ||= b(5) || b(7) || b(4) || b(6);
    }
    return { mx, mz, sprint, shoot, action, special };
  }
}
