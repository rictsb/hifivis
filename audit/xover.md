# Round-3 audit — stage `xover`

## Art-director score: **40/100** (+7 from 33)

> Much cleaner staging, one card, two plot regions. But fill 1.00 puts the hero in the bottom third at small scale, the legend floats as unbacked text on bare grey, and the backdrop is a uniform mid-grey card with a visible vertical boundary.


## Findings for this stage (6)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/xover.js:529 uses `fill: 1.00` — the extreme of the set. The hero sits in the bottom third at small scale while the top two-thirds of the safe box is bare mid-grey backdrop with no light shaping at all: no pool, no falloff, no gradient, and a visible vertical boundary where the cyclorama's lit region ends. It is the most obviously 'Blender default studio' frame in the deck.

**Fix:** xover.js:529 -> `frameShot([0.070, 1.100, -3.03], 0.27, { fill: 0.44, az: CAM_AZ, el: -0.02, fov: 30 })` so the chassis grows and rises. Separately, shape the backdrop: after the core spotlight fix, add a large dim gradient wash on the cyclorama (a MeshBasic additive plane with a blobShadow map, as floorPool() does for the floor) so the wall has a lit pool and a falloff instead of one value.

### 2. [MAJOR] (certain)

**Wrong:** The trace legend (sum LR4 / low·mid·high / LR2 every driver +) floats as unbacked coloured rules and text on bare grey backdrop, camera-left of the card and not aligned to it. It reads as a 2D DOM overlay pasted on top of the render — the one place in the piece where the diagram language visibly breaks.

**Fix:** Dock the legend inside the card's own plate (bottom-left, inside the border), or give it its own DIAG.diagramCard backing plate aligned to the main card's baseline and yaw. Never leave a legend on bare backdrop.

### 3. [MAJOR] (certain)

**Wrong:** The magnitude plot draws a false trace. dbOf() clamps every band to DB_FLOOR = −30 (xover.js:91-92) while the Graph's yRange is [−30, 6], so low, mid and high all lie exactly on the bottom axis and print as one solid horizontal cyan line running the full width of the plot box — visible in the render at the base of both crossover Vs. The comment at xover.js:88-90 claims this was avoided; it was not. Separately, the red LR2-every-driver-positive trace is drawn as short near-vertical dashes lying directly on top of the cyan band limbs, so the myth the plot exists to kill is visually indistinguishable from the correct answer.

**Fix:** Stop the floored trace from drawing: sample each band over only the frequency span where it exceeds the floor (split into segments), or set DB_FLOOR below yRange[0] minus the Graph's 4 % overshoot (yRange bottom −30, span 36 dB, so DB_FLOOR ≈ −31.5 puts the flat run outside the clip). For the myth trace, separate it vertically — offset the red curve by, say, −2 dB with a stated offset, or plot only the LR2 SUM (which nulls to −∞ at both crossovers and is a distinct shape) rather than a dashed overlay on the same path as the cyan limbs.

### 4. [MAJOR] (certain)

**Wrong:** The group-delay plot is two-thirds dead. GD_MAX_MS = 8 ms with the peak at 6.93 ms at 54 Hz, but above ~200 Hz the group delay is sub-millisecond, so from 200 Hz to 20 kHz the amber trace lies flat on the zero axis — confirmed in the render, where the right two thirds of the region is a single horizontal amber line. The 2.2 kHz crossover's own delay contribution (GD_FH, quoted in the prose) is invisible at this scale.

**Fix:** Make the group-delay axis logarithmic in ms (e.g. 0.02–10 ms) so both crossovers' contributions are visible, or restrict the group-delay plot's xRange to 20–1000 Hz and say so in the caption. Either way both quoted figures — the 6.93 ms peak and the value at 2.20 kHz — must be readable off the plot.

### 5. [MINOR] (certain)

**Wrong:** "insertion loss is −1.02 dB" — a loss quoted as a negative number. Insertion loss is conventionally a positive quantity (the loss is 1.02 dB); printing it negative invites the reader to think the passive network has 1 dB of gain.

**Fix:** Print Math.abs(INSERT_DB).toFixed(2) and say "insertion loss is 1.02 dB", or keep the sign and say "the level falls by 1.02 dB".

### 6. [MINOR] (likely)

**Wrong:** "The same low-pass built passively into a nominal 8 Ω is not one coil but two 2nd-order sections", with L = √2·R/ωc = 22.5 mH and C = 1/(√2·R·ωc) = 176 µF per section, ×2. Two identical LC Butterworth sections cascaded directly do not give LR4: the first section is loaded by the second's finite input impedance rather than by R, so the realised response is not two cascaded Q = 0.707 pairs. A real passive LR4 low-pass into 8 Ω is a specific 4th-order ladder with four different element values. The element COUNT (two coils, two caps) and the DCR conclusion survive, but the values as stated do not realise LR4.

**Fix:** Either state that these are the two Butterworth sections' ideal values and that a real ladder must be co-designed (one added clause), or substitute the correct 4th-order ladder values for 8 Ω at 80 Hz and quote their series DCR. The 1.00 Ω / 11.0 % / 16.0 % argument is unaffected either way.


---

## Whole-piece findings still open (10)

- **[major]** Every emitter in env.js is an unmodulated single value: beauty 4.6, frontStrip 3.4, strip 3.8, strip2 3.0, kick 2.6. There is no luminance ramp ACROSS the set — no bright side and dark side to the environment, no visible horizon in the reflection. Consequently a black lacquer cheek reflects a single flat grey with a blob in it, instead of the long unbroken top-to-bottom gradient that is the defining cue of a Wilson or Devialet cabinet shot.

  *Fix:* Add a vertical luminance gradient to the emitter texture (multiply the falloff by a top-to-bottom ramp from 1.0 to 0.35) and reduce beauty 4.6 -> 3.2 while enlarging it 11x6.5 -> 15x9 and moving it closer (z 5.0 -> 3.6). A larger, dimmer, gradated source gives a wrapped highlight with a long ramp instead of a hot spot. Also strengthen the shell() horizon band (horiz 0.055 -> 0.085) so there is a readable horizon line in every mirror surface.

- **[major]** src/core/materials.js: pianoBlack has clearcoatRoughness 0.028 as a flat scalar with no map, and floor has clearcoatRoughness 0.10 flat. A perfect uniform clearcoat is what turns a reflected softbox into a decal-sharp rectangle. Real lacquer has orange-peel: the highlight has structure and the reflection distorts slightly.

  *Fix:* Give pianoBlack a clearcoatRoughnessMap (reuse T.anodisedRough(1024, 0.06, 0.03)) and raise the base to 0.05, and give it a very low-amplitude normalMap for orange-peel. Do the same on M.floor (clearcoatRoughness 0.10 -> map with base 0.13). The highlight must break up over its own length.

- **[major]** The explanation panel's prose is truncated mid-sentence in the still frames for power, streamer, preamp, xover, amp, speaker and air — 'When is the one thing it cannot supply', 'which does not hold', 'What the three bands add up to is an all-pass: 360° of', 'not 24. It is second', 'and reads 91.21 dB. A 100 W peak — 4.8 dB inside the'. The shots are the deliverable being judged; in every one of those seven the reader loses the end of the argument. Contract addendum §C caps content() at 320 words and eight of twelve overran; several still do.

  *Fix:* Cut each of the seven to fit the panel without scroll at 1600x1000. The reliable cut is the third and fourth body paragraphs — the prose in this piece front-loads the mechanism (correctly) and then repeats it. Verify by shooting each stage and confirming the last paragraph's final line is above the readout footer with the fade absent.

- **[minor]** Label kickers are uppercased by CSS, which destroys every unit in them: 'µm' becomes 'µM' (micromolar), 'ms' becomes 'MS', 'ps' becomes 'PS', 'dBFS' becomes 'DBFS', 'kHz' becomes 'KHZ', 'dB' becomes 'DB', 'mm' becomes 'MM'. For a piece aimed at a measurement editor this is the one typographic error that will be circled. Examples visible in shipped frames: turntable 'TIP · 18 × 5 µM RADII', dac '· DBFS', streamer 'BAND ±50 PS', air '1 KHZ · 94 DB'.

  *Fix:* In src/core/labels.js, stop text-transform:uppercase on the kicker and instead author kickers in caps in the stage files, leaving units in their correct case. Or wrap units in a span the transform skips. Also fix the orphan wrap seen in dac where the kicker breaks to a second line beginning '· DBFS'.

- **[minor]** Label bodies run to three and four lines of dense monospace at the same size and weight as their own kickers, so there is no typographic hierarchy and they read as code comments scattered over the render rather than as magazine callouts. Turntable carries six such blocks, power roughly eight, air seven. A product-render callout is one line.

  *Fix:* Establish a hierarchy in labels.js: kicker at 0.72rem letterspaced, body at 0.86rem, value at 1.0rem in the accent. Then cap each label at two body lines in the stage files and push the third line into content(). The value line — the one number the label exists to deliver — should be visibly the largest thing in the block.

- **[minor]** The bloom pass is constructed as UnrealBloomPass(res, 0.26, 0.42, 2.30) — strength 0.26, radius 0.42, threshold 2.30. The contract §3.6 tells stage authors 'bloom threshold is 0.92', which is wrong by a factor of 2.5 and will cause any author sizing an emissive to that figure to under-drive it. Separately, threshold 2.30 means only genuinely clipped pixels bloom, which is why the blown artefacts have halos and the meters do not.

  *Fix:* Correct CONTRACT.md §3.6 to state the real threshold. Once the lighting fixes land and nothing spurious clips, consider lowering threshold to ~1.15 with strength ~0.20 so the meters and LEDs get a small honest halo — currently the meter glow gets none, which contributes to the decal reading.

- **[minor]** The cyclorama (src/core/room.js seamlessBackdrop) is a single MeshPhysicalMaterial at colour 0x14161a, roughness 0.90, envMapIntensity 0.7 and receives no shaped light. In xover, amp and sub it renders as one flat value across the whole visible area with a visible boundary where it ends. A real infinity cove in a product shot always shows a pool of light and a falloff — that gradient is what separates the subject from the background without a rim light.

  *Fix:* Add a large additive gradient wash on the wall, mirroring what floorPool() does for the floor: a MeshBasicMaterial plane with blobShadow(512,1), colour ~0x2c3a4a, opacity ~0.30, additive, positioned behind the rack and facing camera. Give it a slight horizontal offset from the subject so the falloff is directional.

- **[minor]** Diagram cards throughout are square-cornered black plates with a single thin 1 px border, no thickness, no shadow, no reflection and no relationship to the room's light. They read as pasted PNGs at every stage except xover (which correctly yaws its card off the lens axis at CARD_YAW = CAM_AZ - 0.244). This is the second-largest 'CGI' signal after the highlights.

  *Fix:* In DIAG.diagramCard, give the plate real thickness (a shallow bevelBox rather than a PlaneGeometry) with a machined aluTrim edge fillet, a soft drop shadow onto whatever is behind it, and a faint env sheen across the plate. Then adopt xover's off-axis yaw as the default for every stage — a card square to the lens is always a decal.

- **[minor]** spec.js ROOM names the dimensions {L: 7.4, W: 9.0, H: 3.1} while LAYOUT.room names the same numbers {w: 7.4, d: 9.0, h: 3.1} — so spec's "L" is the room's width and spec's "W" is its depth. sub.js has to remap them (RM.W = LAYOUT.room.w, RM.D = LAYOUT.room.d) and includes a runtime throw to catch the confusion. air.js uses ROOM.L·ROOM.W·ROOM.H for volume and surface, which are order-independent, so nothing is numerically wrong today — but any future stage that computes an axial mode from ROOM.L will get the wrong answer.

  *Fix:* Rename spec.ROOM to {W: 7.4, D: 9.0, H: 3.1} to match LAYOUT, and update air.js's V_ROOM/S_ROOM accordingly. Keep sub.js's cross-check assertion.

- **[minor]** Performance is at the contract floor: 39.0 fps with 8310 draw calls and 4.37 M triangles for the whole build. 8310 draw calls is very high for a scene with thirteen chassis, and leaves no headroom on slower hardware — the contract requires ≥ 30 fps, so a modest regression in any stage breaks it.

  *Fix:* Instance the repeated small parts that dominate the count (screws, vent slots, heatsink fins, RCA/XLR jacks, knob flutes) via InstancedMesh in GEO, or merge each chassis' static sub-meshes with BufferGeometryUtils.mergeGeometries at build time. A 3–4× draw-call reduction is realistic and would give the piece real headroom.


---

## Already fixed in core by the lead — do NOT redo, do NOT edit core

All three core blockers from this round are done:
1. `diffusionMap()` square-plateau emitters → elliptical continuous falloff.
2. The two raking spotlights, 15/22 → 6/9.
3. The planar floor reflection, which was multiplied down to 1–4 % and was
   effectively off → strength 0.62 over a 9 m falloff.

Also done: exposure 1.58 → 1.92; a lit gradient on the cyclorama so it is a
sweep with a pool of light rather than a flat grey card; unit case-folding
removed everywhere; `spec.ROOM` renamed to `{W,D,H}`; `CART.loadLossDb` /
`CART.atInputRms` / `TONEARM.litzMm2` added to `spec.js`.

Measured over the twelve frames after these fixes: mean luminance 14.7 % → **19.3 %**,
pixels above 95 % → **0.11 %**, mid-tone mass **47 %**. The bimodal histogram is
fixed. What remains is per-stage.
