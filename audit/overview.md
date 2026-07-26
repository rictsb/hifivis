# Audit findings — stage `overview`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **46** — Composition, framing and staging
  Good idea for an opening spread, ruined by a skeletal foreground chair, a 2.06 m dollhouse camera height, 25% dead sky and a right subwoofer that is entirely behind the panel.

- **47** — Materials, lighting and render quality
  System reads and the rack silhouette works, but every cabinet is a flat value with no clearcoat gradient, the floor mirrors nothing, and the tweeter carries a blown white square.

- **58** — Typography, information design and UI
  The rack callouts read as a stacked legend, not annotation. Two labels land on the chapter rail. The THE GAIN eq is the finest single piece of typesetting in the project.


## Findings for this stage (6)

### 1. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** The listening chair is the foreground hero of the opening spread and it reads as flat-pack garden furniture. Built at src/stages/overview.js:107-230 and placed at :538-541 at LAYOUT.listener, it is the nearest object to the camera, so it takes the strongest vignette and the strongest chromatic aberration; the key light does not reach it, so the leather goes to pure black and only the chrome sled and posts survive — the object reads as a skeleton of tubes. It has no floor contact shadow, so it floats. It is clipped by both the bottom and left frame edges, and the TIME SCALE slider and transport buttons are drawn on top of it.

**Fix:** Do not cut it — a chair back-to-camera in the near foreground is the right editorial device for a room spread — but rebuild the staging. (1) Add GEO.contactShadow(0.86, 0.72) under it at overview.js:541. (2) Add a low, dim fill from camera-left (a small rect area or point at about [3.4, 1.5, 4.6], intensity low, colour matched to the room's key) so the leather channels read as leather and the object becomes a lit silhouette with a rim rather than a wire frame. (3) Move it to LAYOUT.listener.x - 0.55 and rotate ~0.10 rad so it reads as a corner-anchored crop rather than a centred obstruction, and so it clears the transport chrome above y = H-120.

### 2. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** The right subwoofer is entirely behind the explanation panel, so the system is asymmetric in the one frame whose job is to show the whole system. Arithmetic: shot at overview.js:527 is position [2.48,2.06,6.80], target [0.17,0.75,-2.55], fov 28.5; at the sub plane (z = -3.28, ~10.1 m away) the half-width of the frustum is 10.1·tan(14.25°) = 2.56 m, and LAYOUT.subR.x is 2.92 — outside it, and the right 29% of what remains is covered by the panel anyway. The left sub survives only as an amber glow behind the turntable plinth.

**Fix:** Either (a) widen to fov 34 and retarget to [-0.35, 0.72, -2.55] so both subs land inside the SAFE box, or (b) commit to the tighter frame and deliberately let both subs bleed symmetrically off the left and right of the SAFE box as dark bookends — which requires shifting target.x to about -0.45 so the composition is symmetric about the SAFE centre rather than about the canvas centre. Option (b) is the stronger picture; option (a) is the honest system diagram. Pick one, do not leave it asymmetric.

### 3. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** Camera height reads as a dollhouse. overview.js:527 puts the eye at y = 2.06 m looking down at a system whose tallest element is 1.25 m, so every speaker is seen from above and none of them tower. Combined with the target at y = 0.75, the hardware compresses into a horizontal band from ~37% to ~64% of frame height, leaving a dead black band across the top 18% and a dead floor across the bottom 20%.

**Fix:** Drop to seated ear height: position [2.10, 1.22, 6.40], target [-0.35, 0.82, -2.55], fov 32. That lifts the speakers against the cyclorama, kills the top dead band by letting the cabinets reach into it, and gives the classic reference-room look. Re-check the chair does not then fill the lower third — if it does, pull it further left per the chair finding.

### 4. [MAJOR] (certain) — Typography, information design and UI

**What is wrong:** The six rack callouts (overview.js:707, `offset:[-64,0]` in a loop) render as a left-aligned vertical stack — 06 CROSSOVER, 05 PREAMP, 04 PHONO, 03 DAC, 02 STREAMER, 01 CONDITIONER — reading top-to-bottom in descending order in dead space to the left of the rack. It reads as a legend, not as annotation, and the numbering runs backwards down the page against every reading convention. The leader polyline (overview.js:621, colour 0x4d5865 at 0.50 opacity) is too faint to bind them. Two further labels ('SOURCE · TURNTABLE' and 'LISTENING SEAT') land on the chapter rail.

**Fix:** Alternate the callouts left and right of the rack so they read as pointing at bays rather than as a list, or keep the stack and set the numbers ascending downward. Raise the leader trace to `PAL.cy` at 0.35 opacity or to 0x6f7a88 at 0.7 so the connection is visible at 1600×1000. Push the turntable and listening-seat labels clear of x<190.

### 5. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** content() 'The gain': 'The only stage in the chain that turns the signal down is the one called the amplifier.' The gain table directly above it labels the only negative row 'volume control', at −6.5 dB, and the monoblock row is +26.0 dB. As written the sentence points at the power amplifier, which is the one stage that unambiguously turns it up. Separately, G_VOL is a back-solved residual of −6.51 dB, but the preamp stage this refers to is built with a fixed +10.0 dB line stage and an integer-dB relay ladder, so its achievable settings are +10 − N dB: −6.5 dB is not reachable (−6.0 or −7.0 are), and the overview's budget silently omits the preamp's +10 dB of fixed gain.

**Fix:** Rewrite as 'The only stage that turns the signal down is the one called the pre-amplifier' and split the row into '+10.0 dB line stage / −16.5 dB ladder'. Then round the ladder to the integer the preamp can actually set (−16 dB, giving −6.0 dB net and 2.90 V at the posts, or −17 dB and 2.59 V) so the two stages agree.

### 6. [MINOR] (certain) — Composition, framing and staging

**What is wrong:** The amber mains loop in front of the rack (device x 500-1600, y 1150-1300) is a tangle of doubled-back squiggles that reads as spaghetti rather than a cable, and the cyan signal path makes a decorative serpentine bracket to the left of the rack that carries no information. Between them they are the busiest thing in the lower-middle of the opening spread, competing with the hardware they are supposed to connect.

**Fix:** Simplify both to a single clean run each, with the loop closure shown as one visible return leg rather than four folds. In an opening spread the paths should be readable at a glance as "mains in, signal through, acoustic out" — three gestures, not thirty.


---

## Core findings (already fixed by the lead — for context only, do NOT edit core)

The following were found across the whole piece and have been repaired in `src/core/*` and `src/app.css`:


- The studio environment had **no front hemisphere** — every camera-facing surface reflected black. `env.js` now has a beauty box, a front strip and two front wraps, and every emitter has a soft-edged diffusion map (the hard white squares on dust caps are gone).
- The floor now carries a **real planar reflection** (`src/core/reflector.js`), blurred with distance, with a soft knee so emissives do not clip.
- Exposure 1.30 → **1.58**; bloom threshold 0.92 → **1.06**, strength 0.42 → 0.30; chromatic aberration 0.0011 → **0.00032**.
- `DIAG.diagramCard` now writes depth and defaults to opacity **0.90**, so cards no longer ghost the hardware behind them.
- `GEO.contactShadow` now uses multiply blending against a white-surround texture, so contact shadows actually darken (including over the reflective floor).
- `lineMaterial` had `alphaToCoverage:true`, which made every stage fade-out silently fail. Fixed.
- **`DSP.butterHP` returned the complex conjugate** — every high-pass phase in the piece had the wrong sign. Fixed and verified: LR4 now sums to 0.000000 dB error across the band, −6.021 dB at fc, LP and HP in phase; LR2 summed in positive polarity nulls at −46.7 dB, confirming it needs one driver inverted.
- **`DSP.deltaSigmaStep` was broken.** Rewritten as a proper error-feedback modulator with NTF = (1−z⁻¹)ⁿ, FFT-verified: order 1 puts in-band noise 38 dB below the out-of-band density, order 2 puts it 55 dB below. Order ≥3 is now clamped, because an unscaled 3rd-order NTF has ‖NTF‖∞ = 8, far past Lee's rule for a 1-bit quantiser — measured, it stops shaping entirely. `DSP.ntfInfinityNorm(n)` and `DSP.DS_MAX_ORDER` are exported.
- **Labels are rebuilt** (`src/core/labels.js`): they now depth-test against opaque geometry, are pushed out of keep-out rects for the chapter rail / masthead / panel / transport, are nudged apart from each other, and are dropped rather than overprinted. Kickers are ASCII-folded in JS so **µ, Ω and π survive** (CSS `text-transform:uppercase` was turning "µV" into "ΜV"). Labels have a subtle scrim; pass `cls:'plain'` to opt out where the background is already dead space.
- **The panel is restructured**: head and readouts are now pinned, and only the prose scrolls. `.key` callouts and the live readouts are no longer below the fold. `.ro .bar` was a `<span>` with a height and no `display:block` — the meters never rendered. Fixed.
- The transport `#rate` chip now updates.
- `.eq` blocks are 11.5 px so longer lines survive the 388 px content box.
