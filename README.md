# Hoop Riot

A 2-on-2 street-basketball brawler that runs in the browser. Fighting is legal: there are no refs and no fouls. It's an original game in the genre of early-90s "anything goes" street basketball. The characters, teams, art, courts and audio are all new, and everything is drawn and synthesized in code (no image or audio files).

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/hoop-riot.html — one self-contained file, open it directly
npm test           # headless simulation and mechanics tests
```

## Modes

| Mode | What it is |
|---|---|
| **Street Tour** | Beat four crews in order, each on its own court. Pick one of three upgrades after every win. Progress is saved in the browser. |
| **Quick Match** | One game against the crew you choose. |
| **2P Co-op** | Two people on the same team against the computer. Each person keeps one player. |
| **2P Versus** | Person against person. Each has a computer teammate. |

## Controls

One player:

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | WASD / arrows | Left stick / D-pad |
| Sprint | Shift | RB / RT |
| Shoot / jump | J or Space: hold to jump, let go when the marker is in the green | A |
| Pass (with ball) / punch combo (without) / throw (holding an item) | K | X |
| Running tackle | Sprint + K without the ball | RB + X |
| Air kick | K while jumping | X in the air |
| Dodge (cannot be hit) | L | B / Y |
| Special | L when the RIOT meter is full | B / Y |
| Switch player (on defense) | Q | LB |
| Pause · mute · music | P · M · N | Start |

Two players on one keyboard:

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | W A S D | Arrow keys |
| Sprint | Left Shift | Right Shift |
| Shoot / jump | J | , (comma) |
| Pass / hit / throw | K | . (period) |
| Dodge / special | L | / (slash) |
| Switch player (Versus) | Q | ' (quote) |

With one gamepad connected in a two-player mode, the gamepad goes to Player 2. With two, each player gets one.

**Who you control:** in one-player modes and in Versus, you always drive your team's ball carrier, and control follows your passes. On defense, press the switch key to take your other player. Control also moves on its own when your player is knocked down.

## Rules

- 2-on-2, 2–5 minute game clock, 15-second shot clock. 3 points from beyond the arc. Tied at the buzzer means sudden death.
- **Shooting:** a bar appears over your head during a jump shot. Let go while the marker is in the green zone and the shot always scores. The zone shrinks with distance and when a defender is close or in the air.
- **Dunks:** sprint into the paint and press shoot. A dunk always scores unless you are hit out of the air.
- **Alley-oop:** pass to a teammate who is jumping near the rim and they dunk it.

**Fighting**
- **Combo:** tap K three times for a jab, a cross and a finisher. Each strike has a wind-up and a recovery. A strike that lands can be cancelled into the next one; a miss has to recover fully and cannot be chained.
- **Hit pause:** when a strike lands, the attacker and the victim freeze on the impact frame for a moment while everyone else keeps moving.
- The first two hits stagger and never take the ball. The third hit of a chain launches the victim, who drops the ball.
- **Knockdowns are physical:** the body flies in an arc, can bounce once, slides, and bounces off the end fence. A flying body bowls over a teammate in its path.
- A running tackle, an air kick or a thrown item knocks down at once. An air kick on an airborne player spikes them into the floor. A missed tackle leaves you sliding.
- Hitting anyone who is in the air knocks them down.
- **Getting out:** a dodge slips any hit and passes through defenders. Pressing dodge while being comboed breaks out, at the cost of half your stamina.

**The stage**
- **Upper hoop:** every basket has a gold hoop above the normal one. A shot let go high in the air goes at it for a bonus point (3 from inside the arc, 4 from outside).
- **Launch pads:** step on a yellow pad to be thrown into the air. Press shoot near the rim for a 3-point sky dunk, or hold and release for an air shot at the upper hoop. A pad needs 4 seconds to recharge.
- **Items:** trash cans, cones and crates drop onto the court. Walk over one with empty hands to pick it up, then press K to throw it.

**RIOT meter:** fills from hits, scores, steals and blocks. Each character has two specials:

| Character type | With the ball | Without the ball |
|---|---|---|
| Shooters (Dash, Pike, Jinx, Ace, Rex) | **Comet Shot**: cannot miss, floors anyone in its path | **Blitz**: a homing tackle that runs down the ball carrier |
| Bruisers (Mo, Rusty, Volt, Gale, Tank) | **Mega Slam**: a flying dunk from anywhere into the upper hoop, worth 3 | **Shockwave**: floors everyone nearby |

## Street Tour

| Game | Crew | Court | What the court has |
|---|---|---|---|
| 1 | Harbor Hounds (easy) | Pier 9 | No pads; items drop often |
| 2 | Neon Vipers (normal) | Arcade Alley | Four launch pads |
| 3 | Sky Pilots (normal) | The Helipad | Launch pads right in the lane, no items |
| 4 | Iron Monarchs (hard) | Palace Court | Two launch pads, lots of items |

Upgrades (one after each win): Quick Feet, Sharpshooter, Iron Chin, Hype Man, Springs, Heavy Hands. Losing a game lets you retry it.

**Debug/testing URL params:** `?autoplay=1` (CPU vs CPU), `?speed=4`, `?seed=N`, `?mute=1`, `?mode=tour|quick|coop|versus`, `?opp=0..3`. In the console, `__hoop.start('quick', 2)` starts a match and `__hoop.advance(n)` steps the simulation.

## Architecture

- `src/core/`: a deterministic fixed-step simulation (60 Hz, seeded RNG) with no DOM.
  - `game.ts`: physics, ball states, shots, dunks, passes, fighting, launch pads, items, scoring, clocks.
  - `ai.ts`: computer players for both sides.
  - `teams.ts`: teams, courts and upgrades.
- `src/client/`:
  - `render.ts`: Canvas 2D renderer: camera, zoom and slow motion, particles, HUD.
  - `character.ts`: the characters. Each move produces a target pose (hips, feet, arms, lean, squash) with wind-up and follow-through, and the drawn pose eases toward it. Also faces, outlines and the hit flash.
  - `sprites.ts`: ball, hoops, pads, items.
  - `background.ts`: five court themes painted from palettes.
  - `audio.ts`: WebAudio synth for SFX and a music loop.
  - `input.ts`: keyboard layouts for one or two players, and gamepads.
- `src/main.ts`: menus, modes, player switching, tournament flow.
- `tests/sim.test.ts`: full computer-vs-computer matches on every court, plus one test per mechanic.
- `scripts/`: programmatic Vite build/dev (no config file) and an inliner that produces the single-file build.

## Roadmap (proposed)

1. **Tuning from real play:** knockdown rates, launch-pad strength, computer difficulty.
2. **Breakable backboards:** big dunks shatter the rim for bonus points and a short replacement delay.
3. **More stage objects:** things to climb, moving hazards, a conveyor that brings items in.
4. **Online play** using the deterministic core with rollback.
5. **Sprite sheets:** bake the code-drawn characters into frame-by-frame animation with smear frames.
6. **Mobile touch controls** and a PWA wrapper.
