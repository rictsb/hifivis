# Round-3 audit — stage `sub`

## Art-director score: **38/100** (+4 from 34)

> Clean and calm, and the two-sub null argument is the sharpest information design in the deck. But the cabinet has zero contact shadow and zero reflection, the surround is a mirror-chrome torus instead of rubber, and the cone is an untextured grey gradient.


## Findings for this stage (7)

### 1. [MAJOR] (certain)

**Wrong:** The subwoofer has no contact shadow and no floor reflection whatsoever — the plinth's bottom edge meets a flat grey ground with a razor silhouette and no ambient darkening at the join. It is the clearest 'object pasted onto a background' moment in the set. It also sits far enough back that it is on the cove, where the y=0.0016 planar reflector does not reach.

**Fix:** Add GEO.contactShadow(w*1.6, d*1.6, 0.9) directly under the plinth, plus a tight high-opacity core shadow at the plinth footprint. If the sub genuinely stands on the cove, either move it forward onto the flat floor (z >= LAYOUT.room.wallZ + COVE_R) or extend the reflector, because a 59 kg cabinet with no ground contact reads as a floating render.

### 2. [MAJOR] (certain)

**Wrong:** The sub driver's surround is a mirror-chrome torus with a blown white specular arc, and the cone is an untextured grey gradient with no dust cap detail. A 380 mm long-throw woofer's surround is matte rubber with a wide diffuse roll; rendering it as chrome is a material category error and it is the brightest thing in the frame.

**Fix:** Change the surround to mats().rubber (roughness 0.82) with real half-torus section geometry; give the cone mats().coneWeave with a visible dust cap; add a machined trim ring in aluTrim with GEO.screw at 12 positions so the 380 mm scale reads.

### 3. [MAJOR] (certain)

**Wrong:** The hero label reads "Sealed 380 mm · 77 L" but 380 mm is not derivable from anything else in the file, and it contradicts the geometry the file explicitly says it derives from. sub.js:70-74 sets CONE_R = 0.1700 m (so cone + surround outer diameter is 340 mm) and derives SD = π(CONE_R − SURR_W/2)² = 0.0735 m², i.e. a 306 mm effective diameter; FRAME_R = 0.200 gives a 400 mm trim flange. "380 mm" matches none of those. Every acoustic number in the chapter uses the 306 mm figure.

**Fix:** Change the kicker to "Sealed 340 mm cone · Sd 306 mm eff · 77 L", or if a 380 mm nominal driver is genuinely intended, enlarge CONE_R to 0.190 and let SD (and every downstream excursion, volume velocity and seat SPL) recompute from it.

### 4. [MAJOR] (certain)

**Wrong:** The myth callout prints "20–80 Hz peak-to-peak at the central seat is 27.6 dB with one and 27.6 dB with two" — two identical numbers with no explanation. The arithmetic is correct and is in fact the point (the seat is on the null of every odd lateral mode, so the pair's field there is exactly 2× the single sub's at every frequency and the normalised curve is unchanged), but as printed it reads as a copy-paste bug and undermines the reader's trust in every other number in the chapter.

**Fix:** Rewrite as: "Computed here, 20–80 Hz peak-to-peak at the central seat is 27.6 dB with one sub and unchanged at 27.6 dB with two — not similar, identical, because that seat is on the null of every odd lateral mode and the pair simply doubles the field there."

### 5. [MINOR] (certain)

**Wrong:** The cabinet and plinth faces are dead-flat single-value gradients with no texture, no reflection and no light falloff across them — a 77 L, 59 kg enclosure rendered as untextured grey plastic. Only the plinth chamfer's thin bright line reads as machined.

**Fix:** Apply mats().pianoBlack (not a plain grey) and let the reflector return the room in the vertical faces; add a second machined fillet at the cabinet/plinth junction so the two masses read as one designed object rather than a box on a box.

### 6. [MINOR] (certain)

**Wrong:** The pressure key mixes peak and rms without saying so: it prints "contour 0.86 Pa · peak 5.1 Pa" and then "105 dB SPL at the peak". splFromPa(5.1) = 108.1 dB; the 105 dB comes from SPL_FS = splFromPa(P_FS/√2) (sub.js:272), i.e. the rms of that peak amplitude. A reader who checks 20·log10(5.1/2×10⁻⁵) gets 108 and concludes the chapter is 3 dB out.

**Fix:** Print "peak 5.1 Pa = 3.6 Pa rms = 105 dB SPL" in the key, or change the contour/peak numbers to rms so the whole key is in one convention.

### 7. [MINOR] (certain)

**Wrong:** The hero is a bare box. The subwoofer reads as a black cube with one driver on a plain pedestal: no visible fixings on the driver flange, no grille mounts, no plate-amp panel, no binding posts, no vents, no feet detail, no branding. CONTRACT §3.3 explicitly says "A bare bevelled box is a fail", and against a Wilson/REL product render this is the weakest hardware in the twelve. It is also under-filled: the top ~35 % of the frame above the cabinet is empty backdrop.

**Fix:** Add flange screws (GEO.screw) around the driver, a machined plate-amp panel with heatsink fins on the visible cheek or the pedestal, binding posts / XLR on the rear edge that catches light, and a chamfer highlight on the cabinet edges. Then raise the fill from 0.60 to ~0.70 or lower the camera so the cabinet fills more of the vertical safe box.


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
