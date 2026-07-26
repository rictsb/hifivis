# Round-3 audit — stage `air`

## Art-director score: **32/100** (+4 from 28)

> Muddy and cluttered. Six cards and traces at unrelated depths over a near-black floor, a sofa sliced by the frame, speakers cut by the panel. The physics here is the best in the piece and the picture hides it.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** The plate row labelled kicker "×1 · true scale" / text "grey arrow λ 343.2 mm; amber bar 2ξ drawn" is not at true scale. In build() the amber bar is drawn at ±XI_DRAWN = ±13.654 mm (air.js:433) — that is the ×25 000 magnified amplitude — while the grey λ dimension immediately below it is at ±LAM_REF/2 = ±171.6 mm at ×1 (air.js:416). The block comment at air.js:143-150 states the intent explicitly: "the amber bar is the WHOLE territory of one parcel at ×25 000, the grey arrow directly under it is one wavelength at ×1. Side by side, at the same scale, they are the point." Two things at different scales are not at the same scale. The render shows a 27 mm bar against a 343 mm arrow — a visual ratio of ~12.6:1 where the true ratio is 315 000:1. This is the banned lie, in the chapter whose entire thesis is that the air does not travel.

**Fix:** Either (a) draw the amber bar at true ×1 — it is 1.09 µm against a 343.2 mm arrow, i.e. sub-pixel — and label it "2ξ at ×1 is 0.003 px: not drawable, and that is the point", exactly as power.js:942 already does for the carrier tick; or (b) keep the magnified bar but move it inside the magnified block above Y_DIV, retitle the row "×25 000", and put a SECOND grey arrow of one wavelength at ×25 000 (8.58 km, so it runs off the plate with an arrowhead and a "→ 8.6 km at this magnification" caption). Do not leave a ×25 000 bar under a "×1 · true scale" heading.

### 2. [MAJOR] (certain)

**Wrong:** The frame is the most cluttered in the set: six cards and traces at unrelated depths over a near-black floor, a sofa sliced by the frame bottom, loudspeakers cut by the panel edge, a blown white streak at ~(1015,690) preview, and hardware crossing x > 1120 px (1600 basis) which contract §A forbids. Contract §B caps this at two diagram cards and three plot regions; this frame has more than double.

**Fix:** Cut to two cards: the parcel-oscillation card and the floor-bounce comb. Move everything else into content() — the prose already carries it. Reframe so the sofa is either whole or absent, and pull the right-hand loudspeaker fully inside x < 1120. This stage has the best physics in the piece (the ±10.9 pm vs 106 pm hydrogen-atom comparison is genuinely excellent) and the picture is burying it.

### 3. [MAJOR] (certain)

**Wrong:** The world label and the pinned footer show different instants in the same frame, which is the exact failure the code comment at air.js:598-601 claims to have solved. The render shows the plate label "ξ = +0.518 of 0.546 µm peak" (cos φ = +0.949) beside footer PARCEL DISPL −0.087 µm (cos φ = −0.159) — about one 100 ms readouts() tick apart. Cause: readouts() latches S.shown = S.live and builds the DOM, but the label is only rewritten on the NEXT update() call (air.js:610-613), so at the moment of capture the label still carries the previous latch. speaker.js, sub.js and power.js all write their labels INSIDE readouts() and are correct.

**Fix:** Move the S.lab.air.setValue() call from update() into readouts(), immediately after S.shown = S.live, matching the pattern in speaker.js:1400-1408 and power.js:1086-1092. Delete the label write from update().

### 4. [MINOR] (likely)

**Wrong:** The ear marker does not read as being at the seat. The cyan direct rays and the amber floor bounce converge on a glowing ring that visually lands on top of the equipment rack, roughly 5 m behind the listening chair that is visible at the bottom of the frame. The AT THE SEAT label with its 4.830 m figure is anchored there, so the reader is told the seat is at a point that is plainly not the chair.

**Fix:** Add a depth cue: a short vertical dropline from the ear ring to the chair's headrest, or a faint floor circle at (LAYOUT.listener.x, 0, LAYOUT.listener.z) tied to the ring, so the marker is unambiguously above the chair. Alternatively lower the camera elevation so the ear ring separates from the rack in silhouette.

### 5. [MINOR] (certain)

**Wrong:** Three explanatory cards are visible at once (air-parcels plate, floor-comb plate, plus the standalone dimension/key plates) against Addendum §B's maximum of two, and the frame is correspondingly busy: five label boxes, two ray bundles, an ear marker and the whole room's hardware.

**Fix:** Fold the ×1 true-scale block into the parcel plate as a single row (it is already a sub-block), and move the floor-bounce numbers (path difference, Δt, null depth) into content() so the comb plate can carry only the plot and its axis. Target two cards, one plot region each.


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
