# Round-3 audit — stage `phono`

## Art-director score: **33/100** (+2 from 31)

> Still no identifiable hero: chassis cropped at the top edge, graph card cropped at the bottom edge, and two blown white smears sitting on the fascia and the shelf. Nothing in frame is whole.


## Findings for this stage (4)

### 1. [BLOCKER] (certain)

**Wrong:** There is no whole object in the frame. The phono chassis is cropped by the top frame edge, the chassis above it is cropped, and the RIAA graph card is cropped by both the bottom frame edge and the readout footer. Two blown white smears (one on the fascia at ~(390,340) preview, one elongated on the shelf at ~(1000,350)) sit on the only clean surfaces.

**Fix:** Pull the camera back and lower it: in phono.js the SHOT is built from _cam0/_tgt0 plus _shift — increase the camera distance ~35% and raise the target so the phono chassis sits whole in the upper third and the card sits whole in the lower half with a clear margin above the footer (footer top is y ~ 930 px at 1600x1000 — no scene geometry below y 900).

### 2. [BLOCKER] (certain)

**Wrong:** The gain-budget .eq in content() does not sum. It prints 284.6 µV → −0.83 dB (100 Ω load, 10 Ω coil) → +64.00 dB = 410.1 mV → +15.95 dB = 2.83 V. Recomputed: 0.41007 V × 10^(15.946/20) = 0.41007 × 6.2707 = 2.5715 V, not 2.8284 V. The error is exactly the 0.83 dB LOAD_DB row: G_REST_DB (phono.js:95) is PREAMP.gainDb + AMP.gainDb + CHAIN.volumeDb, and CHAIN.volumeDb (spec.js:170) was solved from the OPEN-CIRCUIT cartridge voltage, so it already assumes no loading loss. The preamp chapter prints the same chain without the loading row and is self-consistent (79.95 − 64 − 10 − 26 = −20.05 dB), so the two chapters now disagree by 0.83 dB about the same system.

**Fix:** Pick one convention and apply it to both chapters. Cleanest: make CHAIN in spec.js solve the volume residual from the LOADED input (vCart × Z/(Z+Rcart)), which moves volumeDb from −20.05 to −20.88 dB and setting 20 → 21; then the phono ladder's last row becomes +15.11 dB → 2.83 V and the preamp's eq updates automatically. If spec.js must not change, delete the −0.83 dB row from the phono .eq and state the loading loss separately in prose, or print the honest 2.571 V and say "0.83 dB short of one watt, because the ladder step is quantised to whole decibels and the loading loss was not in the budget".

### 3. [MINOR] (likely)

**Wrong:** The RIAA graph is the clearest diagram in the deck and it is being wasted at the bottom of the frame, tilted, cropped and dark. It carries four traces plus a bracket inset in one plot region — at the size it is rendered the +0.060/-0.003 dB error trace is indistinguishable from the 0 dB line.

**Fix:** Promote it: reframe so the graph occupies the lower-right two-fifths of the safe box whole, and either drop the excursion bracket inset to a separate small card or move its numbers into content(). Give the error trace a distinct value so the 'a result, not an identity' point is actually visible in the picture.

### 4. [MINOR] (certain)

**Wrong:** The realised network corners "50.17, 506.1 and 2134" are hardcoded string literals in content() rather than derived from TR. They happen to be correct (1/(2π·3172.29 µs) = 50.17, 1/(2π·314.49 µs) = 506.09, 1/(2π·74.58 µs) = 2134.1), but CONTRACT §6 requires every number on screen to be derived, and if anyone edits NET the prose will silently go stale.

**Fix:** Replace the three literals with ${(1/(DSP.TAU*TR.T1)).toFixed(2)}, ${(1/(DSP.TAU*TR.T2)).toFixed(1)}, ${(1/(DSP.TAU*TR.T3)).toFixed(0)}.


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
