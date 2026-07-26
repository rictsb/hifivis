# Round-3 audit — stage `dac`

## Art-director score: **45/100** (-4 from 49)

> Regressed. fill 0.90 crops the rack top and bottom, a second chassis is sliced by the frame edge, and the card lands square on the hero with a soft white halo around it that reads as a lens artefact.


## Findings for this stage (6)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/dac.js:593 uses `fill: 0.90` on radius 0.216. Contract addendum §A caps this at 0.34-0.42 when a diagram sits beside the hero. The result: the camera is ~0.8 m from a 92 mm chassis, the rack is cropped top and bottom, a second chassis is sliced by the frame bottom edge, and the diagram card is forced to sit directly on the hero's silhouette.

**Fix:** dac.js:593-594 -> `frameShot([0.060, 0.692, -3.030], 0.216, { fill: 0.40, az: AZ, el: 0.16, fov: 31 })`. Then reposition the card to clear space camera-left of the rack rather than over bay 2-3.

### 2. [MAJOR] (certain)

**Wrong:** The diagram card carries a broad soft white halo around its upper-left quadrant (visible as a glow bleeding onto the rack behind it). It reads as an uncorrected lens artefact, not as a card. The sheenTexture() intended as a cover-glass reflection is being applied at an amplitude and softness that produce a fog rather than a defined reflection.

**Fix:** In dac.js sheenTexture(), give the sheen a hard-ish leading edge (a defined band boundary) rather than a radial fog, and drop its peak amplitude by half. A cover-glass reflection has a readable boundary — that boundary is what makes it read as glass.

### 3. [MAJOR] (certain)

**Wrong:** Framing: the diagram card out-masses the hero roughly 4:1 and is laid over the equipment rack rather than beside it. In the render the card occupies ~1600×860 px (of 3200×2000) while the DAC fascia is ~1600×220 px, and the card's top-left corner covers the neighbouring chassis' lit display so "44.1 kHz 24 bit LOCK AES C…" prints out from behind it. Addendum §A requires fill 0.34–0.42 for the hero when a diagram sits beside it; §B requires cards beside the hero, not over its silhouette or its neighbours'. The same pattern repeats in streamer, power, phono and preamp.

**Fix:** Truck the shot so the card sits to one side of the rack against the backdrop (amp.js:167-177 does exactly this and is the model to copy), and shrink the card until the hero fascia is at least as tall in pixels as the card is. At minimum, raise or narrow the card so no other chassis' display is bisected by its edge.

### 4. [MAJOR] (certain)

**Wrong:** The FFT plot's frequency axis cannot be read. xRange is [3000, FS_MOD/2 = 1.4112 MHz] (dac.js:750) but tickLabels supplies only xVals [20000, 1000000] (dac.js:763), so there is no numeral at the left edge and the reader has no anchor for where the plot starts. Two signal spikes appear near the left edge with no way to identify them as the 4.5 kHz and 9 kHz test tones.

**Fix:** Add 3000 to xVals so the left edge is labelled "3 kHz", and add a small marker or caption identifying the two in-band spikes as the test tones.

### 5. [MINOR] (certain)

**Wrong:** Palette rule violation: the analogue reconstruction filter is drawn in PAL.gr (dac.js:759). CONTRACT §3.5 reserves green exclusively for marking the correct answer (red marks a myth, cyan signal, amber energy). Here green marks a filter response, which competes with the green used elsewhere (e.g. xover's flat sum) as "this is the right answer".

**Fix:** Draw recFiltDb in PAL.cyDim dashed, or in PAL.ink3 dashed, and reserve green for the band-limited reconstruction in plot 1 if it is wanted at all.

### 6. [MINOR] (certain)

**Wrong:** "Two points per cycle is enough" — strictly, the sampling theorem requires strictly more than two samples per cycle; at exactly two the reconstruction is not unique (a sine at fs/2 can be reconstructed with any amplitude depending on phase). The very next clause gives 2.205 for a 20 kHz tone, so the chapter's own example is fine, but the headline sentence as written is the wrong version of the theorem in a chapter whose subject is the theorem.

**Fix:** "Just over two points per cycle is enough. A 20 kHz tone gets 2.205 of them…" — one word.


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
