# Round-3 audit — stage `overview`

## Art-director score: **50/100** (+3 from 47)

> Framing regression repaired; composition now reads. But the system is a toy in a void — top 26% of the safe box is empty backdrop, and the polished floor returns essentially nothing, so twelve chassis sit on black felt.


## Findings for this stage (6)

### 1. [MAJOR] (certain)

**Wrong:** src/stages/overview.js:593 frames with `fill: 0.35` on radius 0.65 at fov 32. The top ~26% of the safe box (y 90-310 at 1600x1000) is empty backdrop and the whole system reads as a model on a table. The opening spread should command the page.

**Fix:** overview.js:593 -> `frameShot([-0.22, 0.78, -2.72], 0.65, { fill: 0.35, az: 0.44, el: 0.105, fov: 27 })`. Dropping fov 32 -> 27 grows the subject ~18% and raising target y 0.60 -> 0.78 removes the dead band without cropping the outer loudspeakers. Then move the LEVEL DIAGRAM card down into the gap directly over the rack.

### 2. [MAJOR] (certain)

**Wrong:** The signal path is drawn as glowing cyan tubes that run from box to box like neon spaghetti, at the same visual weight as the amber mains loop, so the two systems compete and neither reads. Real interconnects are dark and matte; the cyan is the diagram, and it should be a thinner, brighter, more delicate line than a physical cable, or clearly offset from the physical cabling.

**Fix:** Reduce the cyan tube radius by half and raise its emissive so it reads as a drawn line rather than a lit cable, and give the physical interconnects a separate dark mats().rubber run. Alternatively drop the physical cables entirely on this stage and let the cyan and amber paths be unambiguously diagrammatic.

### 3. [MAJOR] (likely)

**Wrong:** Measurement inconsistency the editor will catch. The chain equation states '= +80.0 dB -> 2.846 V = 1.013 W into 8 Ω', then the label 'THEN AIR' claims '91.3 dB at 1 m -> 77.6 at the seat'. 91.3 dB at 1 m only follows from 90.11 dB/W/m plus 10·log10(1.306 W), i.e. 2.846 V into the 6.2 Ω voice coil that air.js and speaker.js use. The frame therefore computes the wattage into 8 Ω and the SPL into 6.2 Ω. (Everything else I checked in overview is correct: 0.285 mV × 10^4 = 2.85 V; 64-10+0+26 = 80; 10·log10(1.0125) = 0.054 dB; 20·log10(4.83) = 13.68 dB.)

**Fix:** Pick one convention and state it. Either quote 8 Ω nominal throughout and derive SPL from 8 Ω (giving ~90.2 dB at 1 m, 76.5 at the seat), or say explicitly in the eq block 'into the 6.2 Ω coil, 8 Ω nominal' and carry 1.306 W into both numbers. The overview is the piece's contract with the reader; it cannot use two impedances.

### 4. [MAJOR] (certain)

**Wrong:** Standfirst and body contradict each other on the same screen: the standfirst reads "Twelve boxes carrying one quantity" while the first paragraph of content() reads "Thirteen chassis stand here; twelve touch the signal, the conditioner only energy." Thirteen is the correct count (6 rack + turntable + 2 monoblocks + 2 speakers + 2 subs).

**Fix:** Change the standfirst to "Thirteen boxes carrying one quantity, and one closed loop feeding all of them." (fits the ≤ 90 char limit), or drop the count from the standfirst entirely.

### 5. [MINOR] (certain)

**Wrong:** The level diagram's whole point — the number at the end — is not on it. The y axis is labelled 0/−40/−80 dBV and the endpoints CART/POSTS, but there is no marker or numeral for the result (+9.08 dBV = 2.846 V), and the amber dashed reference line near the top is unlabelled (it is presumably 2.83 V / one watt). The staircase also shows five steps where the panel's eq shows four rows, because the +10 line and −20 ladder are drawn separately but summed in the prose.

**Fix:** Add a dot and a value label at the POSTS end reading "+9.08 dBV = 2.846 V", label the amber dashed line "2.83 V = 1 W into 8 Ω", and either split the preamp row in the eq to match the plot or merge the two steps in the plot to match the eq.

### 6. [MINOR] (likely)

**Wrong:** The wide shot does not show the whole system. The right subwoofer is not visible at all, and the left subwoofer sits visually inside the turntable table's leg frame — from this azimuth the two objects overlap and read as one confused mass. CONTRACT §1 says the wide shot must show the whole system.

**Fix:** Widen the fov slightly or pull back and raise the camera so both subs clear the turntable plinth in silhouette; check LAYOUT.subL (−2.92, −3.28) against LAYOUT.ttPlinth (−2.34, −2.28) at the chosen azimuth and yaw the shot until they separate.


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
