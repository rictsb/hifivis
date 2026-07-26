# Round-3 audit — stage `speaker`

## Art-director score: **34/100** (+5 from 29)

> Framing regression repaired and the composition now works, but roughly ten hard-edged white squares are pasted across the drivers and baffle. Drivers are flat discs with no surround roll, no dust cap, no basket. The tan side panel is off-palette and reads as plastic.


## Findings for this stage (11)

### 1. [BLOCKER] (certain)

**Wrong:** Roughly ten hard-edged WHITE SQUARES with bloom halos are pasted across the drivers, surrounds and baffle of both cabinets — visible at 1:1 in shots/speaker.png around (420,1290)-(800,1670) and repeated on every driver. They have sharp corners and a uniform interior. This is the env.js plateau reflected in pianoBlack/dome, and it is the most immediately damning CGI tell in the whole piece.

**Fix:** Fixed by the diffusionMap() rewrite. After that, verify at 1:1 that no highlight on a driver has a straight edge. If any remain, raise the surround/basket materials off mirror: the surround must not be a chrome torus.

### 2. [BLOCKER] (certain)

**Wrong:** Every woofer cone on both cabinets carries hard-edged SQUARE white blowouts with bloom halos — four on the near cabinet, more on the far one. Cropped at 1:1 they are unmistakably rectangular area-light reflections: the cone/dust-cap material is near-mirror, so the studio's rectangular strip lights return as flat 100 % squares rather than a highlight with a rolloff. They destroy the hero and read as a rendering bug, not as gloss.

**Fix:** In speaker.js, clone the cone/coneWeave/dome materials for this stage and raise roughness (try 0.55–0.7 for the cone, 0.35–0.45 for the dust cap) and drop envMapIntensity to ~0.5, exactly as xover.js's satin() helper does for its front-facing metals. Re-shoot and confirm the strips return as a soft gradient across the cone, not as a square patch.

### 3. [MAJOR] (certain)

**Wrong:** src/stages/speaker.js drivers have no detail density. Each woofer is a smooth grey cone gradient, a flat torus surround with no half-roll shading, a flat ring basket with tiny screw dots, and no dust cap (just a nipple). At 3200 px this is a stamped-metal disc. A Wilson or Magico driver at this crop shows the surround's rolled section catching a rim light, a visible spider/basket window, a distinct dust cap with its own material, and a phase plug or a machined trim ring.

**Fix:** Rebuild the driver: a real half-torus surround (LatheGeometry, mats().rubber, roughness ~0.75) with visible thickness at the cone junction; a separate dust cap mesh in mats().dome or coneWeave; a cast basket with 6 open windows between spokes; a machined trim ring in mats().aluTrim with GEO.screw at 8 positions. Give the cone mats().coneWeave so the weave reads at this crop, not the flat mats().cone.

### 4. [MAJOR] (certain)

**Wrong:** The upper cabinet's side panel is a tan/gold gradient that is neither of the two sanctioned accents (PAL.cy signal, PAL.am energy) and is not a credible veneer — it is a uniform two-stop gradient with no grain, reading as moulded plastic. Contract §3.5 permits one accent colour; this is a third hue on the hero object.

**Fix:** Replace with mats().pianoBlack for the whole cabinet, or with mats().wood (T.veneer(1024)) at envMapIntensity 0.85 so actual grain is visible. If a two-tone cabinet is wanted, use anodGrey against pianoBlack — a value contrast, not a hue contrast.

### 5. [MAJOR] (likely)

**Wrong:** The chapter's whole demonstration is at frequencies this driver never sees in this system. The overlay sweeps 30–100 Hz at 96 dB/1 m, prints fc 60.9 Hz, f₃ 58.2 Hz, and "below 29.2 Hz it runs out of travel" — but xover.js and sub.js both state that an LR4 at 80 Hz hands everything below 80 Hz to the subwoofers, so in the assembled system this driver is a 80 Hz–2.2 kHz midbass and its 24 dB/oct high-pass removes exactly the band the chapter is about. A reader who has just read the crossover and subwoofer chapters will catch this.

**Fix:** Add one sentence to content() and a marker to the excursion plot: state that these are the driver's own free-air-plus-box capabilities, that the active LR4 at 80 Hz removes everything below the handover, and that the excursion curve therefore shows what the driver could do rather than what it is asked to do. Add gX.addMarker(XOVER.fLow) with a tick label so the 80 Hz handover is visible on the excursion plot (it already falls inside the 24–200 Hz range).

### 6. [MAJOR] (certain)

**Wrong:** All four cutaway callouts are pushed 240–360 px away from the parts they name (offsets [−360,−122], [−238,26], [−262,46], [−88,72] at speaker.js:1219-1237), so MOTOR FORCE, VOICE COIL, CONE TRAVEL and CHARGE CARRIERS float over the cabinet and over empty space with no leader to the coil, gap or wire. The one dashed leader in the frame runs from the card to the driver and reads as a stray diagonal crossing the picture.

**Fix:** Reduce the offsets to 60–120 px and add leader dots/lines (the 'lead' class already used on the hardware label at speaker.js:1214). Stack the four in the clear column between cabinet and card as the comment claims they are, and give each one a short leader ending on the part.

### 7. [MINOR] (certain)

**Wrong:** The upper monitor sits on the main cabinet with a bright white sliver of gap between them and no visible joint hardware, so it reads as two objects stacked by accident rather than one designed enclosure. A grey untextured sphere floats unexplained at roughly (1020,520) preview, behind the diagram cards.

**Fix:** Close the gap with a machined spacer plate (bevelBox in aluTrim) and an ambient-occlusion darkening at the joint; remove the stray sphere or give it a label explaining what it is.

### 8. [MINOR] (certain)

**Wrong:** The 30 L box volume is per woofer (code comment at speaker.js:36: "30 L sealed, one per woofer"), but there are two woofers per cabinet and nothing on screen says each has its own chamber. The standfirst reads "pushing 49 g of cone against 30 litres of trapped air" and the eq reads α = Vas/Vb = 112/30. A reader looking at a 1.25 m cabinet with two woofers will assume a shared box and compute α = 112/60 = 1.87, fc = 47.7 Hz — and conclude the chapter is wrong.

**Fix:** Add "each woofer in its own sealed 30 L chamber" to the .eq commentary or the cabinet paragraph.

### 9. [MINOR] (certain)

**Wrong:** The plot tick numerals bunch and collide. gR's x ticks (15, 400) and gX's y tick (14) all land within ~40 px of each other at the boundary between the two plots, and the two amber/cyan caption boxes sit ON the traces they describe — the EXCURSION caption box overlays the amber Xmax band and the excursion curve itself.

**Fix:** Move gR's x tick labels above its plot (or drop them and label only gX's x axis, which shares the log decade), and move the excursion caption into the plot's genuinely empty lower-right quadrant (the curve falls left to right, so the space at high frequency and low excursion is free) rather than the mid-left where the trace runs.

### 10. [MINOR] (certain)

**Wrong:** Four cones are animated at the same ±4.28 mm and the panel's 96 dB is per driver, but the only disclosure is the word "1 driver" in a plot kicker and "· 1 drv" appended to the TERMINAL V unit. A reader watching four cones move in unison and reading "96 dB at 1 m" will take it as the system level; four such drivers would be ~108 dB at 1 m.

**Fix:** Move the disclosure into the primary caption: change the CONE TRAVEL label to "±4.28 mm at 39.9 Hz · one driver of four" and add one clause to content(): "every figure here is per driver; four of them together are 12 dB louder."

### 11. [MINOR] (certain)

**Wrong:** Sd = 0.0346 m² is commented in spec.js as "piston area (220 mm)", but π·(0.110)² = 0.0380 m²; 0.0346 m² corresponds to a 210 mm effective diameter. The comment is not on screen, but the 220 mm figure appears in the code as the driver's identity and could leak into prose in a later revision.

**Fix:** Correct the comment to "(210 mm effective)" or raise Sd to 0.0380 and let every downstream figure — Vas, η₀, both sensitivities, excursion and F_XMAX — recompute.


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
