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
| Shoot / jump / get off a ride | J or Space: hold to jump, let go when the marker is in the green | A |
| Pass (with ball) / punch combo (without) / use an item (holding one) / fire (on a ride) | K | X |
| Grab | Run or walk into an opponent, or press K while touching one (not while holding the ball) | Same |
| In a grab | K: knee strike. Left or right + K: throw that way. Up + K: throw them at the hoop | X |
| Running tackle | Sprint + K without the ball | RB + X |
| Air kick | K while jumping | X in the air |
| Dodge (cannot be hit) | L | B / Y |
| Special | L when the RIOT meter is full | B / Y |
| Call for a pass | K when your teammate has the ball | X |
| Pause · mute · music | P · M · N | Start |

Two players on one keyboard:

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | W A S D | Arrow keys |
| Sprint | Left Shift | Right Shift |
| Shoot / jump | J | , (comma) |
| Pass / hit / throw | K | . (period) |
| Dodge / special | L | / (slash) |

With one gamepad connected in a two-player mode, the gamepad goes to Player 2. With two, each player gets one.

**Who you control:** one player for the whole match. Player 1 is always Dash; in co-op Player 2 is Mo, and in Versus Player 2 is the other team's first player. Control never switches. When your computer teammate has the ball, press K to call for a pass, or jump at the rim to ask for a lob.

## Rules

- 2-on-2, 2–5 minute game clock, 15-second shot clock. 3 points from beyond the arc. Tied at the buzzer means sudden death.
- **Play never stops for a basket.** The ball drops out of the net and is live at once, so both teams fight for it. The team that just scored has to wait about a second before touching it, which gives the other side first chance.
- **Shooting:** a bar appears over your head during a jump shot. Let go while the marker is in the green zone and the shot is aimed dead centre, so it always drops. The zone shrinks with distance and when a defender is close or in the air.
- **Ball physics:** outside the green zone the aim scatters, and the rim and backboard decide the rest. The ball really bounces off the ring and the board, so shots can rattle in, bank in, or bounce out for a rebound. A shot can be rebounded as soon as it has touched the rim or board.
- **Dunks:** sprint into the paint and press shoot. A dunk always scores unless you are hit out of the air.
- **Alley-oop:** pass to a teammate who is jumping near the rim and they dunk it.

**Fighting**
- **Combo:** tap K three times for a jab, a cross and a finisher. Each strike has a wind-up and a recovery. A strike that lands can be cancelled into the next one; a miss has to recover fully and cannot be chained.
- **Hit pause:** when a strike lands, the attacker and the victim freeze on the impact frame for a moment while everyone else keeps moving.
- The first two hits stagger and never take the ball. The third hit of a chain launches the victim, who drops the ball.
- **Knockdowns are physical:** the body flies in an arc, can bounce once, slides, and bounces off the end fence. A flying body bowls over a teammate in its path.
- A running tackle, an air kick or a thrown item knocks down at once. An air kick on an airborne player spikes them into the floor. A missed tackle leaves you sliding.
- Hitting anyone who is in the air knocks them down.
- **Grabs:** run or walk into an opponent and you grab them on contact. Pressing K while touching an opponent also grabs, instead of punching. You cannot grab while you hold the ball, and after a grab you must wait 8 seconds for the next (the HUD shows "GRAB READY"). Someone who was just grabbed cannot be grabbed again for 4 seconds. A prompt over your head shows the buttons and the time left. A grab that is not used lets go after about a second and a half. The computer only grabs when it decides to.
- **In a grab:** for the first 0.3 seconds (the clinch) the grabber can only hold on; that is the victim's window to get out. After it, K alone knees them (up to twice; the third press throws), and left or right + K throws them that way.
- **Throws:** the thrower hoists the victim over their head and hurls them. The victim flies spinning, lands with a heavy slam and a bounce, drops the ball, stays down longer than from a normal knockdown, and bowls over a teammate in the way.
- **Getting out:** a dodge slips any hit and passes through defenders. Pressing dodge while being comboed breaks out for half your stamina; while held, for a fifth. Breaking a grab staggers the grabber. A held ball carrier with no stamina left can still press K to pass the ball out; the ball gets away, the body does not.

**The stage**
- **Upper hoop:** every basket has a gold hoop above the normal one. A shot let go high in the air goes at it for a bonus point (3 from inside the arc, 4 from outside).
- **Launch pads:** step on a yellow pad to be thrown into the air. Press shoot near the rim for a 3-point sky dunk, or hold and release for an air shot at the upper hoop. A pad needs 4 seconds to recharge.
- **Breakable rims:** every dunk strains the rim. After six it tears off for 6 seconds: shots drop through the gap and dunks find nothing to dunk on. The gold hoop above still works.
- **Teammate boost:** jump while touching a teammate who is standing still (and your side is not defending) and they throw you as high as a launch pad.

**Hitting the ball**
- A punch, kick or tackle that reaches a loose ball knocks it away, and swats an opponent's shot or pass. A ball that was just struck staggers the first opponent it hits, and they cannot catch it until it touches the floor.
- **Juggles:** a body still in the air after a knockdown can be hit again, twice at most.
- **Body dunk:** in a grab, Up + K throws the victim at the hoop you attack. A body that drops through the rim is 1 point (and counts as two dunks against the rim). Sure from close in, a gamble from further out. Any body that falls through a hoop counts, however it got there.

**Items** drop onto the court. Walk over one with empty hands to pick it up, then press K.

| Item | What K does |
|---|---|
| Trash can, cone, crate | Throw it: knocks down the first opponent it hits |
| Bomb | Throw it. The fuse lights when you pick it up (3.5 s) and it blows up on contact, on the floor, or in your hands. A blast launches everyone nearby, friend or foe, flings the ball (a flung ball can score), and sets off other bombs |
| Bat | Swing (3 swings): sends an opponent flying. Hit a loose ball and it is a line drive at your hoop that can score from anywhere, and floors anyone in its way |
| Hammer | Slam (2 slams): launches every opponent around you and pops a loose ball into the air |
| Fire extinguisher | Spray (4 sprays): shoves opponents and the ball away |
| Banana | Throw it; it lies on the floor and sends the next runner sliding (either team) |
| Magnet | Worn for 9 s: a loose ball nearby rolls to you |
| Spring shoes | Worn for 10 s: every jump is a launch-pad jump, so jump shots go at the gold hoop |

Swing at the right moment as a thrown item arrives and you catch it instead of being hit.

**Rides:** walk into one to get on. K uses it, J gets off; it runs out after a few seconds and comes back later.

| Ride | Court | What it does |
|---|---|---|
| Skateboard | Arcade Alley | Twice running speed; runs opponents over, one at a time: each ram slows it, costs a third of its life, and it cannot ram again for 3 seconds. K is a burst of speed. J with the ball goes straight into a shot or a dunk |
| Tank | Palace Court | Slow. Punches bounce off; only heavy hits and blasts wear down its 4 armour, and then it blows up. K fires an exploding shell every 3 seconds (it spares your own side). Ramming works once every 3 seconds. Loaded with the ball, K fires the ball at the hoop (less accurate from far away) |
| Helicopter | The Helipad | Flies over everyone. K drops a bomb. J bails out; with the ball near the rim that is a 3-point sky dunk |

**Hazards**

| Hazard | Court | What it does |
|---|---|---|
| Car, guard dogs | Pier 9 | A lane flashes red, then something comes down it and runs over anyone still there |
| Pinball bumpers | Arcade Alley | Kick away players and the ball |
| Wind, catapults | The Helipad | Gusts push the ball and anyone in the air. The pads in the lane also fling you toward the hoop you attack |
| Wrecking ball | Palace Court | Swings the length of the middle lane |

**Events** start on their own every 25 seconds or so and last 12–14 seconds, one at a time. The name and the time left show under the scoreboard.

| Event | What changes |
|---|---|
| Low gravity | Everyone and everything floats |
| Rain | The floor has no grip: you slide when you turn or stop |
| UFO | A saucer hunts the ball carrier, beams them up, and drops them somewhere else |
| Iron ball | The ball floors any opponent it hits in flight, and they cannot catch it |
| Bomb ball | The ball goes off every 6 seconds, wherever it is |
| Giant ball | Bigger, easier to grab, and it only fits the rim dead centre |

Knockdowns caused by the court (traffic, a banana, your own bomb) are not credited to either team.

**RIOT meter:** fills from hits, scores, steals and blocks. Each character has two specials:

| Character type | With the ball | Without the ball |
|---|---|---|
| Shooters (Dash, Pike, Jinx, Ace, Rex) | **Comet Shot**: cannot miss, floors anyone in its path | **Blitz**: a homing tackle that runs down the ball carrier |
| Bruisers (Mo, Rusty, Volt, Gale, Tank) | **Mega Slam**: a flying dunk from anywhere into the upper hoop, worth 3 | **Shockwave**: floors everyone nearby |

## Street Tour

| Game | Crew | Court | What the court has |
|---|---|---|---|
| 1 | Harbor Hounds (easy) | Pier 9 | Traffic, heavy items (bombs, bats, hammers); rain, iron ball |
| 2 | Neon Vipers (normal) | Arcade Alley | Four launch pads, bumpers, a skateboard; bomb ball, giant ball, low gravity |
| 3 | Sky Pilots (normal) | The Helipad | A helicopter, catapults, wind; UFO, low gravity |
| 4 | Iron Monarchs (hard) | Palace Court | A tank, a wrecking ball, lots of items; UFO, iron ball, bomb ball |

The Rooftop (launch pads, a skateboard, every item; low gravity, rain, giant ball) is only the title-screen court for now.

Upgrades (one after each win): Quick Feet, Sharpshooter, Iron Chin, Hype Man, Springs, Heavy Hands. Losing a game lets you retry it.

**Debug/testing URL params:** `?autoplay=1` (CPU vs CPU), `?speed=4`, `?seed=N`, `?mute=1`, `?mode=tour|quick|coop|versus`, `?opp=0..3`. In the console, `__hoop.start('quick', 2)` starts a match and `__hoop.advance(n)` steps the simulation.

## Architecture

- `src/core/`: a deterministic fixed-step simulation (60 Hz, seeded RNG) with no DOM.
  - `game.ts`: physics, ball states, shots, dunks, passes, fighting, grabs, launch pads, scoring, clocks.
  - `toys.ts`: items, explosions, hazards, events and rides. Each one works through the same knockdown and ball physics as everything else.
  - `ai.ts`: computer players for both sides.
  - `teams.ts`: teams, courts and upgrades.
- `src/client/`:
  - `render.ts`: Canvas 2D renderer: camera, zoom and slow motion, particles, HUD.
  - `character.ts`: the characters. Each move produces a target pose (hips, feet, arms, lean, squash) with wind-up and follow-through, and the drawn pose eases toward it. Also faces, outlines and the hit flash.
  - `sprites.ts`: ball, hoops, pads.
  - `toysprites.ts`: items, vehicles, the car, dogs, wrecking ball, bumpers and saucer.
  - `background.ts`: five court themes painted from palettes.
  - `audio.ts`: WebAudio synth for SFX and a music loop.
  - `input.ts`: keyboard layouts for one or two players, and gamepads.
- `src/main.ts`: menus, modes, player switching, tournament flow.
- `tests/sim.test.ts`: full computer-vs-computer matches on every court, plus one test per mechanic.
- `tests/toys.test.ts`: one test per item, hazard, event and ride, plus full matches on all five courts with everything switched on.
- `scripts/`: programmatic Vite build/dev (no config file) and an inliner that produces the single-file build.

## Balance meter

`npm run balance` (optionally `-- 40` for more seeds, `PLAIN=1` to strip every toy) plays whole matches headless and prints what the tuning is judged by: scores, knockdowns by cause, share of time players spend on the floor, explosions, rim breaks, and what a person chasing the ball carrier gets out of grabs.

Where build 14 stands, 40 computer-vs-computer matches of 120 seconds per court (home side is always the "normal" computer):

| Court | Score | Knockdowns per team | By the court | Time on the floor | Same with no toys |
|---|---|---|---|---|---|
| Pier 9 | 19–9 | 12.3 | 3.1 | 8.1% | 4.7% |
| Arcade Alley | 15–18 | 13.7 | 3.0 | 8.9% | 5.1% |
| The Helipad | 18–19 | 9.7 | 6.3 | 8.0% | 4.5% |
| Palace Court | 12–23 | 13.7 | 8.2 | 10.6% | 6.7% |

A defender who sprints at the ball carrier all match and throws the instant the grab allows it takes roughly 12–23% of the other team's possessions that way, depending on the team and the sample (about 30% against Harbor Hounds, the easy team); before this build it was 28–56%.

The meter only knows how the computer plays. It says nothing about how the game feels.

## Roadmap (proposed)

1. **Tuning from real play:** everything so far is tuned against the balance meter (below), which only knows how the computer plays. How it feels with a person at the keys is still unjudged.
2. **Engine and rotor sounds, more animation** for the vehicles and the new item moves.
3. **Court picker** for Quick Match, and a way to switch toys off.
4. **Online play** using the deterministic core with rollback.
5. **Sprite sheets:** bake the code-drawn characters into frame-by-frame animation with smear frames.
