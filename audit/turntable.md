# Round-3 audit — stage `turntable`

## Art-director score: **58/100** (+3 from 55)

> Still the only real hero shot — proper three-quarter, clean diagonal, readable platter silhouette. Held back by a milky translucent section card that the tonearm prints straight through, a dead plinth with almost no reflection, and a 1990s vector-illustration diagram language on the groove.


## Findings for this stage (7)

### 1. [BLOCKER] (certain)

**Wrong:** The same tonearm wire is specified twice, differently, in adjacent chapters. turntable.js:99 has WIRE_MM2 = 0.030 ("tonearm litz, 7 × 0.07 mm") giving V_DRIFT 8.96 nm/s, X_DRIFT ±1.43 pm and "1/179 of the 255.6 pm spacing between copper atoms". phono.js:135 has WIRE_MM2 = 0.05 ("tonearm litz") giving ±0.86 pm and "1/299 of a copper atom spacing". Both chapters carry the identical I_PK = 3.659 µA, so a reader who compares them sees the same current in the same wire produce two different drift figures 1.67× apart. Secondary: 7 strands of 0.07 mm diameter is 7·π·(0.035 mm)² = 0.0269 mm², not 0.030 — so even the stated construction does not give the stated area.

**Fix:** Promote the tonearm litz to spec.js as CART.leadAreaMm2 (use 0.0269 mm² and describe it as 7 × 0.07 mm, or use 0.030 mm² and describe it as 7 × 0.074 mm). Have both phono.js and turntable.js import it. Recompute X_DRIFT and the atom-spacing ratio in both from the single value.

### 2. [MAJOR] (certain)

**Wrong:** The 45/45 groove-section card renders LIGHTER than the backdrop — a milky translucent grey wash with a thin cyan hairline border, through which the loudspeaker behind and the tonearm in front are both visible. DIAG.diagramCard is specified opaque-ish (0x080a0d at 0.94) so something in turntable.js is adding a light plane on top. It looks like a semi-transparent PNG dropped on the render, and it is the first thing the eye lands on.

**Fix:** Find and remove the light-value plane behind the groove section in turntable.js (grep the build for a MeshBasicMaterial with a light colour and low opacity around the section group) so the card is the dark DIAG.diagramCard plate. Then move the card so the tonearm does not cross it — a diagram must not be interpenetrated by the hero.

### 3. [MAJOR] (likely)

**Wrong:** Scale error in the groove section. The stylus is drawn as a circle of radius ~40% of the 60 µm groove width, i.e. ~12-13 µm. The label calls it 'TIP · 18 × 5 µM RADII'; in a section taken ACROSS the groove the contact radius that matters is the 5 µm minor radius, so the drawn tip is roughly 2.5× too large and consequently sits too high in the V, contacting near the bottom rather than partway up the walls. A cartridge engineer reads this instantly.

**Fix:** Redraw the tip at 5 µm across-groove radius (one twelfth of the 60 µm width) and seat it so it contacts both walls at the correct height. If the 18 µm figure is wanted in the picture, add a second small inset showing the along-groove section. The 30 µm depth and 129 µm pitch are both correct and should stay.

### 4. [MAJOR] (likely)

**Wrong:** In the 45/45 section the stylus is drawn bottoming in the groove. For TIP_R_H = 18 µm in a 60 µm-wide 90° groove, a tip tangent to both walls sits with its centre r√2 = 25.5 µm above the vertex, so its lowest point clears the groove bottom by 25.5 − 18 = 7.5 µm — a quarter of the 30 µm groove depth. In the render the tip's underside is essentially on the vertex. "The tip rides the walls, never the bottom" is one of the few things this section can show that prose cannot, and as drawn it shows the opposite.

**Fix:** Set the tip centre height to TIP_R_H·√2 above the groove vertex (25.46 µm) rather than resting it on the bottom radius, and add a short dimension or caption marking the 7.5 µm bottom clearance. Check the same in the animated version where the tip is displaced laterally.

### 5. [MINOR] (certain)

**Wrong:** The groove diagram uses violet (PAL.vi) for the right wall against cyan for the left. Contract §3.5 sanctions cyan for signal, amber for energy, red only for a myth and green only for the correct answer. Violet is a fourth hue on the frame's most-read element, and it is the only place in twelve stages where it appears as a primary.

**Fix:** Use cyan and amber for the two walls (they are two signals, but the palette carries no second signal colour) — or better, use cyan at two different values/dash patterns for L and R and let the labels do the discriminating. Remove PAL.vi from the frame.

### 6. [MINOR] (certain)

**Wrong:** The plinth is a large dark slab that returns almost nothing of the turntable standing on it, and the record surface carries painted cyan and amber circles that read as decals applied to the vinyl rather than as an overlay above it. The tonearm is a bare thin tube with no bearing housing, no counterweight detail and no headshell reading at this crop.

**Fix:** Raise the plinth material's clearcoat response and let the reflector or a local reflection put the platter in it. Lift the disc annotations 2-3 mm off the vinyl so they read as an overlay. Add a visible gimbal bearing yoke, a machined counterweight with a stub, and an anti-skate assembly — GEO.knob and GEO.screw are enough.

### 7. [MINOR] (certain)

**Wrong:** The groove-section card is more than half empty. The V groove and stylus occupy roughly the top 40 % of a card that is ~600×550 px in the render; the lower 60 % is blank cross-hatching, and the left third carries nothing. It is the largest single graphic in the stage and the least informative per square pixel.

**Fix:** Crop the card to the section it actually contains, or use the freed space: put the 45/45 wall-normal decomposition (u = (L+R)/√2, w = (L−R)/√2) as a small vector diagram in the empty half, or show the neighbouring groove at 129 µm pitch so the "cutter crosses into its neighbour" claim from the panel is visible.


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
