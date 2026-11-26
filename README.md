# Hoop Riot

A 2-on-2 street-basketball brawler that runs in the browser. Fighting is legal: there are no refs and no fouls. It's an original game in the genre of early-90s "anything goes" street basketball. The characters, teams, art, courts and audio are all new, and everything is drawn and synthesized in code (no image or audio files).

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/hoop-riot.html — one self-contained file, open it directly
npm test           # headless AI-vs-AI simulation tests
```

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | WASD / arrows | Left stick / D-pad |
| Sprint | Shift | RB / RT |
| Shoot / jump | J or Space: hold to jump, let go when the marker is in the green | A |
| Pass (with ball) / punch (without) / call for pass (teammate has ball) | K | X |
| Running tackle | Sprint + K without the ball | RB + X |
| Air kick | K while jumping | X in the air |
| Dodge (cannot be hit) | L | B / Y |
| Special | L when the RIOT meter is full | B / Y |
| Pause · mute · music | P · M · N | Start |

**Rules:** 2-on-2, one court, 2–5 minute game clock, 15-second shot clock. 3 points from beyond the arc. Tied at the buzzer means sudden death.

**Shooting:** a bar appears over your head during a jump shot. Let go while the marker is in the green zone and the shot always scores. The zone shrinks with distance and when a defender is close or in the air. Outside the zone the shot is a gamble that gets worse the further off you were.

**Dunks:** sprint into the paint and press shoot. A dunk always scores unless you are hit out of the air.

**Alley-oop:** pass to a teammate who is jumping near the rim and they dunk it. If your teammate has the ball, jump at the rim yourself and they throw you the lob.

**Fighting:**
- A jab staggers but never takes the ball. Three jabs in a row knock the player down.
- A running tackle or an air kick knocks down at once. A missed tackle leaves you sliding.
- Hitting anyone who is in the air (a shooter or a dunker) knocks them down.
- A knocked-down ball carrier drops the ball.
- A dodge slips any of these and passes through defenders. It costs stamina.

**RIOT meter:** fills from hits, scores, steals and blocks. Each character has two specials:

| Character type | With the ball | Without the ball |
|---|---|---|
| Shooters (Dash, Pike, Jinx, Rex) | **Comet Shot**: cannot miss, floors anyone in its path | **Blitz**: a homing tackle that runs down the ball carrier |
| Bruisers (Mo, Rusty, Volt, Tank) | **Mega Slam**: a flying dunk from anywhere, worth 3 | **Shockwave**: floors everyone nearby |

**Opponents:** Harbor Hounds (easy), Neon Vipers (normal), Iron Monarchs (hard). The URL parameter `?opp=0|1|2` preselects one.

**Debug/testing URL params:** `?autoplay=1` (CPU vs CPU), `?speed=4`, `?seed=N`, `?mute=1`. `window.__hoop.advance(n)` steps the simulation from the console.

## Architecture

- `src/core/`: a deterministic fixed-step simulation (60 Hz, seeded RNG) with no DOM.
  - `game.ts`: physics, ball states, shots, dunks, passes, punches, scoring, clocks.
  - `ai.ts`: CPU brains for both sides.
- `src/client/`:
  - `render.ts`, `sprites.ts`, `background.ts`: Canvas 2D renderer with procedural characters, parallax city, particles and HUD.
  - `audio.ts`: WebAudio synth for SFX and a music loop.
  - `input.ts`: keyboard and gamepad.
- `tests/sim.test.ts`: plays full AI-vs-AI matches headless (no NaN, no stuck balls, sane FG%, games finish, deterministic) and has one test per mechanic (shot window, jab, tackle, dodge, air kick, alley-oop, Mega Slam, Blitz).
- `scripts/`: programmatic Vite build/dev (no config file) and an inliner that produces the single-file build.

## Roadmap (proposed)

1. **Court hazards and multi-level hoops:** rooftop vents that launch you, a subway car you can climb, crates for a higher basket.
2. **Weapons and items:** trash-can lids, skateboards, a conveyor that drops items onto the court.
3. **Breakable backboards:** super dunks shatter the rim. You get bonus points and a short replacement delay.
4. **Player switching** on defense, so you always control the defender nearest the ball.
5. **Story/tournament mode:** a ladder of 6 teams with home courts, upgrades between games, and switching your second player.
6. **Local 2P (co-op or versus)** on one keyboard or two gamepads, then online play using the deterministic core with rollback.
7. **Juice pass:** sprite-sheet animation baked from the procedural rig, instant replays of dunks, crowd on the sidewalk.
8. **Mobile touch controls** and a PWA wrapper.
