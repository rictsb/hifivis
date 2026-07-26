# Round-3 audit — stage `preamp`

## Art-director score: **30/100** (-7 from 37)

> Worst regression. A blown white flare with a starburst occupies a third of the frame; a large unlit black card blocks three shelves; both the top and bottom chassis are cropped; the -23 display is a decal with no glass in front of it.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/preamp.js frame: a blown white flare with a starburst core occupies roughly x 700-1060 of a 1500-wide preview — a third of the safe box — sitting on the rack's right-hand front upright and the shelf ends. It has no shape, no falloff structure and no plausible optical cause. It reads as a render bug, not as a highlight, and it is the single worst artefact in the twelve frames.

**Fix:** After the core `fore` spotlight fix, re-shoot. If it survives, yaw the camera: preamp.js:499 AZ 0.30 -> 0.16 so the upright is no longer at the specular angle to the camera-right source. Confirm no pixel in the frame is 255,255,255 outside the meter/LED emissives.

### 2. [BLOCKER] (certain)

**Wrong:** The relay-ladder diagram card is a large unlit black rectangle floating in front of the rack from roughly x 200-780, y 435-880 (preview), blocking three shelves including the hero preamp's own lower half. It has no shadow, no reflection and no edge treatment — it is a black hole in the middle of the hero. Its graph axis labels (120, 90, 60, 0 dB) fall outside the card's own plate, and its bottom is clipped by the frame edge.

**Fix:** Move the card out of the hero's silhouette: place it camera-left of the rack in clear space, or reduce it and dock it beside the preamp chassis rather than over it. Pull the axis labels inside the plate (increase the Graph's left margin). Give the card the same tilt-off-axis treatment xover uses (CARD_YAW = CAM_AZ - 0.244) so it catches a sheen and does not read as a pasted black PNG.

### 3. [BLOCKER] (certain)

**Wrong:** Three compounding render failures in one frame. (a) A blown white light source floods the frame at approximately x 1890–2240, y 1020–1680 in the 3200×2000 render — inside the safe box, and the brightest object in the picture by a wide margin. (b) The S/N-vs-setting plot occupies the lower third of the diagram card and renders essentially black: the two traces added at preamp.js:759-761 (PAL.cy, widths 1.5 dashed / 2.6 solid) are barely above the card's own luminance, so the caption "solid late 111.5 · dashed early 101.9" promises two curves and neither is legible. (c) The card's bottom edge lands at y ≈ 1840/2000, overrunning the safe box floor and printing across the TIME SCALE / "real time" transport row at the bottom left.

**Fix:** (a) Find the practical or specular source at that position and either dull it, occlude it, or re-yaw the shot; nothing in the safe box may clip to white. (b) Raise the two S/N traces' opacity to 1.0, put a lighter backing under the plot region (or drop the cover-glass renderOrder below the traces), and verify against a fresh shoot that both curves and the amber operating-point marker read. (c) Shrink the card ~25 % and lift it so its bottom edge clears y = 1860 (of 2000); the plot area is currently ~150 px tall inside a ~500 px card, so there is slack to take out.

### 4. [MINOR] (certain)

**Wrong:** The preamp fascia's brushed-aluminium texture reads as a screen-space stripe pattern rather than machined metal — the anisotropic streaks run at a uniform pitch across the whole panel with no variation at the bevels or around the display cutout, and the same streak scale appears on the amp's top plate, so the two objects appear to be different sizes than they are. The '-23' display is a flat cyan glow in a black cutout with no glass in front of it.

**Fix:** Reduce the anisotropic streak frequency on the fascia by ~40% and vary it, and break the pattern at the machined edges. Add the same convex clearGlass cover panel over the display that power.js has over its meters — a display with no reflection in front of it is a decal, and this one currently is.

### 5. [MINOR] (certain)

**Wrong:** The hero's own display reads −23 dB while the chapter's derived answer for this system is −20 dB (vinyl, one watt) or −33 dB (2 V digital source). The relay graphic, the divider, the output voltage and the S/N readout are all internally consistent at −23, but the one number the chapter exists to derive is not the one the instrument shows, and the amber "THIS SYSTEM, VINYL AT 1 W / −20.05 dB · 010100" annotation sits beside a ladder showing 010111.

**Fix:** Park the animated setting at N_VINYL (20) for the still, or let it dwell there long enough that the shot lands on it; the sweep can still demonstrate the ladder elsewhere in the cycle.


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
