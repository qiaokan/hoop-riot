import type { Intent } from '../core/game';

interface Layout {
  left: string[]; right: string[]; up: string[]; down: string[];
  shoot: string[]; action: string[]; special: string[]; sprint: string[]; swap: string[];
}

/** Player 1 when two people share the keyboard. */
const P1: Layout = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  shoot: ['KeyJ', 'Space'], action: ['KeyK'], special: ['KeyL'], sprint: ['ShiftLeft'], swap: ['KeyQ', 'KeyI'],
};
/** Player 2 when two people share the keyboard. */
const P2: Layout = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  shoot: ['Comma', 'Numpad1'], action: ['Period', 'Numpad2'], special: ['Slash', 'Numpad3'],
  sprint: ['ShiftRight', 'Numpad0'], swap: ['Quote', 'Numpad5'],
};
/** One player alone: WASD or arrows, either Shift. */
const SOLO: Layout = {
  left: [...P1.left, ...P2.left], right: [...P1.right, ...P2.right], up: [...P1.up, ...P2.up], down: [...P1.down, ...P2.down],
  shoot: P1.shoot, action: P1.action, special: P1.special, sprint: ['ShiftLeft', 'ShiftRight'], swap: P1.swap,
};

export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'mute' | 'music';

export class Input {
  private held = new Set<string>();
  /** Keys pressed since the last time they were consumed (for one-shot actions like switching player). */
  private tapped = new Set<string>();
  private menuQueue: MenuKey[] = [];
  private prevPad: boolean[][] = [];
  private padSwap: boolean[] = [];
  onFirstGesture: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Quote', 'Slash'].includes(e.code)) e.preventDefault();
      this.gesture();
      if (!e.repeat) {
        this.tapped.add(e.code);
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
    if (SOLO.up.includes(code)) return 'up';
    if (SOLO.down.includes(code)) return 'down';
    if (SOLO.left.includes(code)) return 'left';
    if (SOLO.right.includes(code)) return 'right';
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

  private pads(): Gamepad[] {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const out: Gamepad[] = [];
    for (const p of list) if (p && p.connected) out.push(p);
    return out;
  }

  /** Which gamepad drives a player slot. With two players and one pad, the pad goes to player 2. */
  private padFor(slot: 0 | 1, solo: boolean): Gamepad | null {
    const pads = this.pads();
    if (solo) return slot === 0 ? pads[0] ?? null : null;
    if (pads.length >= 2) return pads[slot];
    return slot === 1 ? pads[0] ?? null : null;
  }

  /** Poll once per frame: turns gamepad button edges into menu keys and switch taps. */
  poll() {
    const map: [number, MenuKey][] = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'], [0, 'confirm'], [1, 'back'], [9, 'pause']];
    this.pads().forEach((p) => {
      const prev = (this.prevPad[p.index] ??= []);
      for (const [i, key] of map) {
        const now = !!p.buttons[i]?.pressed;
        if (now && !prev[i]) { this.menuQueue.push(key); this.gesture(); }
        prev[i] = now;
      }
      const lb = !!p.buttons[4]?.pressed;
      if (lb && !prev[4]) this.padSwap[p.index] = true;
      prev[4] = lb;
    });
  }

  takeMenu(): MenuKey[] {
    const q = this.menuQueue;
    this.menuQueue = [];
    return q;
  }

  /** True once per press of this player's "switch player" key. */
  takeSwap(slot: 0 | 1, solo: boolean): boolean {
    const layout = solo ? SOLO : slot === 0 ? P1 : P2;
    let hit = false;
    for (const c of layout.swap) if (this.tapped.delete(c)) hit = true;
    const pad = this.padFor(slot, solo);
    if (pad && this.padSwap[pad.index]) { this.padSwap[pad.index] = false; hit = true; }
    return hit;
  }

  /** Forget stale one-shot presses (call when a match starts). */
  clearTaps() {
    this.tapped.clear();
    this.padSwap = [];
  }

  intent(slot: 0 | 1, solo: boolean): Intent {
    const L = solo ? SOLO : slot === 0 ? P1 : P2;
    let mx = (this.any(L.right) ? 1 : 0) - (this.any(L.left) ? 1 : 0);
    let mz = (this.any(L.down) ? 1 : 0) - (this.any(L.up) ? 1 : 0);
    let shoot = this.any(L.shoot), action = this.any(L.action), special = this.any(L.special), sprint = this.any(L.sprint);
    const p = this.padFor(slot, solo);
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
      sprint ||= b(5) || b(7) || b(6);
    }
    return { mx, mz, sprint, shoot, action, special };
  }
}
