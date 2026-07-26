# Audit findings — stage `amp`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **33** — Composition, framing and staging
  Camera aimed at the rack, not the monoblock. The subject is a 210 px object at the left frame edge with eight nav items and a label printed on top of it.

- **30** — Materials, lighting and render quality
  The stage is called Monoblocks and the monoblock is at the extreme left edge, cropped and dim, while the camera frames the rack behind a translucent card. No heatsink detail survives; the fins are a black void.

- **40** — Typography, information design and UI
  Worst rail collision in the piece, an orphaned 'THE METER' h3 alone at the panel edge, two whole sections below the fold, five broken readout bars.


## Findings for this stage (12)

### 1. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** The camera is pointed at the wrong object. src/stages/amp.js:781 shot targets [-0.122, 0.625, -2.78] — that is the equipment rack at x = 0, not a monoblock (LAYOUT.monoL/monoR are at x = -0.95 / +0.95). The result: the rack is the 400 px centre-of-frame object, while the actual monoblock is a 210 px shape jammed against the left frame edge with the chapter rail printed across it, and the second monoblock is entirely behind the panel.

**Fix:** Retarget amp.js:781 onto the left monoblock as a single hero: position [-0.05, 0.78, -1.72], target [-1.02, 0.52, -3.02], fov 32. That puts the monoblock in the left-of-centre band at roughly two-thirds frame height, with the rack falling away as a soft background mass at right. Move the schematic card to the right of the monoblock, in the space the rack currently wastes.

### 2. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** Direct text-on-text collision. The "METER / log · 30 dB to 300 W / 98 W mean" label sits at roughly device x 85-300, y 928-1024, exactly on top of the chapter-rail entries "04 Turntable" and "05 Phono stage". The glyphs interleave; neither string is readable. Additionally the active rail item "08 Monoblocks" is printed directly on the monoblock's front face above the blue meter, and "07 Crossover" and "09 Loudspeaker" sit on the chassis.

**Fix:** Once the amp camera is retargeted (see the amp framing finding), move the METER label's anchor to the monoblock's right-hand side with offset [+90, -10] so it never enters x < 320. Independently, the rail exclusion in labels.js must guarantee this class of collision cannot recur in any stage.

### 3. [MAJOR] (certain) — Materials, lighting and render quality

**What is wrong:** The McIntosh meter reads as a decal, not glass with something glowing behind it. There IS a glass plane (src/stages/amp.js lines 474-483) but it is mats().glass cloned to opacity 0.22 with depthWrite false — on a MeshPhysicalMaterial, opacity scales the whole shaded result including the specular, so the softbox reflection that should sit in front of the graphics is at 22% strength and invisible against a dial whose brightest stop is #7fd3fb at toneMapped:false. It is also a dead-flat plane, so it catches only one narrow slice of the environment. In the 1:1 crop of shots/dac.png the meter is a pale blue rectangle with a black needle and no surface at all.

**Fix:** Split it into two meshes. Keep the 0.22 smoke tint as-is, then add a second plane 0.4 mm in front with MeshPhysicalMaterial({ color:0x000000, metalness:0, roughness:0.02, envMapIntensity:2.6, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false }) — an env-only specular layer that adds a reflection on top of the glow instead of multiplying it down. Give it a 2.5 degree tilt about X, or build it as a very shallow cylindrical section (sag ~0.4 mm), so a strip highlight sweeps across the face rather than missing it entirely.

### 4. [MAJOR] (certain) — Materials, lighting and render quality

**What is wrong:** The meter blue is a washed-out lightbox, not McIntosh cobalt. dialTexture() in src/stages/amp.js lines 245-249 runs the radial gradient #7fd3fb -> #41abe6 -> #1f7cba -> #12558c with the hotspot at the bottom, drawn toneMapped:false, so most of the meter face sits above 80% luminance and near-white. Real MC1.25KW/MC275 meter glass is a deep cyan-leaning cobalt with a modest lamp lift and crisp black silkscreen; the reference blooms only slightly. Here the face outshines the chassis and the ticks and 'POWER OUTPUT' legend are illegible mush even at 3200 px.

**Fix:** src/stages/amp.js lines 245-249: change the stops to #4fb6ee / #2f8ecb / #17629c / #0d4272. Raise the ink alpha from 0.95/0.62 to 1.0/0.80 and lineWidth 6.5/2.6 to 8/3.5 so the ticks survive the mip chain; set the dial texture's anisotropy to renderer.capabilities.getMaxAnisotropy() and generateMipmaps true. Same treatment for the identical pale-blue meters visible in preamp.png, dac.png and speaker.png.

### 5. [MAJOR] (certain) — Materials, lighting and render quality

**What is wrong:** The stage named Monoblocks does not show a monoblock. In shots/amp.png the camera frames the rack; the monoblock is at the extreme left edge, cropped by the frame, unlit, and behind the chapter rail, while a 62%-opaque schematic covers the rack. From a materials standpoint this is fatal — the piece's most McIntosh-like object (fascia, meter, ribs, heatsink, binding posts, all of which amp.js actually builds in detail at lines 390-500) is never presented. Separately the heatsink fins in every frame that shows one (dac.png, air.png) are a solid black void: GEO.heatsink builds real fins but no light reaches into the valleys and no fin tip carries an edge highlight.

**Fix:** Re-shoot the amp stage from the monoblock: put shot.position roughly 3/4-front-left of LAYOUT.monoR at 0.9-1.1 m out and 0.55 m high with fov 30, and move the schematic card to camera-right beside it. For the fins, add a small forward-right emitter in src/core/env.js — panel(1.6, 1.2, 0xe8eef8, 4.0) at (2.6, 1.1, 2.2) lookAt(0.6, 0.6, -1.0) — aimed to rake across the fin stack, and give the fin geometry in src/core/geo.js line 96 a larger bevel (0.0006 -> 0.0011) so each tip can hold a line.

### 6. [MAJOR] (certain) — Typography, information design and UI

**What is wrong:** amp.js:810 — `L.add(..., {kicker:'Meter', cls:'acc', offset:[10,-104], text:'log · 30 dB to 300 W<br>', value:'—'})`. The −104px vertical offset lifts the label off the blue meter it names and drops it squarely onto chapter rail rows 04 Turntable, 05 Phono stage and 06 Preamp. Three rail entries are destroyed and the label is 150px from its subject. It also ships a trailing `<br>` inside `text` and a placeholder `value:'—'` that is presumably overwritten in `update()` but reads as an em-dash if it is not.

**Fix:** Change the offset to place the label to the *right* of the meter, e.g. `offset:[86,-8]`, and add a leader (see the leader-system finding). Remove the trailing `<br>` once `.wlab` allows wrapping.

### 7. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** amp.js:727-733 shades a 'class-B deadband' rectangle spanning gT.x(−VBE_Q·2) to gT.x(+VBE_Q·2), i.e. ±1.235 V, and content() says 'Unbiased, the deadband is the full ±1.23 V'. Both are wrong. I ran the module's own stageOut(vin, 0) solver: the unbiased output is 0.6 mV at vin = 0.40 V, 10 mV at 0.485 V, 100 mV at 0.635 V, and 0.650 V at vin = 1.235 V — i.e. by the edge of the drawn band the unbiased stage is already delivering 53 % of the biased output. The real soft deadband is roughly ±0.5 V, and for a complementary emitter follower the hard limit is ±V_be = ±0.617 V, not ±2V_be. 1.235 V is the full width, quoted as a half-width — a factor-of-two error on top of a factor-of-2.4 one.

**Fix:** Draw the band at ±VBE_Q (±0.617 V), or better at the ±0.49 V where the solver's unbiased curve actually leaves zero, so the shading matches the red trace on screen — at present the trace visibly straightens well inside the rectangle. Change the prose to 'Unbiased, the transfer curve is flat out to about ±0.5 V of drive — a deadband 1.2 V wide — and crossover distortion is worst at low level, where that 1.2 V is most of the signal.'

### 8. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** V_RIPPLE = I_DC_FULL/(F_RIPPLE·C_RES) = 1.838 V p-p is computed at amp.js:74 and then never displayed anywhere — not in content(), not in a label, not in readouts(). Meanwhile content() states '±75 V rails leave 5.7 V for saturation, driver headroom and I·R_E = 0.64 V' as though the rail were stiff. At full continuous output the ripple alone takes 0.92 V off the worst-case instantaneous headroom (5.72 → 4.80 V if 75 V is the loaded mean, or 3.88 V if it is the peak), and transformer regulation is not modelled at all. The stage computes the number that qualifies its own headroom claim and then hides it.

**Fix:** Add the ripple to the Supply label (which already reads '±75 V · 15 mF · 42 J') as '±75 V mean, 1.84 V p-p at full output', and extend the headroom line in content() to 'leaves 5.7 V, of which 0.9 V is ripple trough: 4.8 V for V_ce(sat), driver V_be and I·R_E = 0.64 V.' State explicitly whether 75 V is the loaded mean or the no-load peak.

### 9. [MINOR] (certain) — Typography, information design and UI

**What is wrong:** The Damping readout abuses the unit field to carry prose: `{k:'Damping', v:'400 → 130', u:'term → driver'}`. `.ro .u` is 10px `var(--ink-3)` and is designed for 'dB', 'Hz', 'A'. The cell renders as a 260px value line that breaks the two-column rhythm and reads as a fragment.

**Fix:** Split into two cells — `{k:'DF AT TERMINALS', v:'400', u:''}` and `{k:'DF AT DRIVER', v:'130', u:''}` — or set `k:'DAMPING · TERM → DRIVER'` and `v:'400 → 130'` with `u:''`.

### 10. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The dissipation graph (amp.js:740-748) has xRange [0,1] where x = P_out/P_MAX and P_MAX = RAIL²/(2·R) = 351.6 W. The amplifier clips at V_PK = 69.28 V, i.e. m = 0.9238, x = 0.853 — so the right-hand 15 % of the plot shows operating points the amplifier cannot reach, and the P_out line is drawn continuing to 351.6 W under a heading that says '300 W into 8 Ω'. The peak-dissipation marker at x = 0.388 is inside the valid region, so the argument survives, but the curve overstates the range.

**Fix:** Add a marker or shaded region at x = 0.853 labelled 'clip', or set xRange to [0, 0.853] and relabel the axis ticks as fractions of the rated 300 W. Also note in the caption that P_MAX 351.6 W is the ideal rail-to-rail figure, not the 300 W rating.

### 11. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The worst-case device dissipation (150.5 W total, 25.1 W per device at 38.8 % of maximum output) is computed for RL = 8 Ω purely resistive. A real loudspeaker with a 45–60° phase angle at 3–4 Ω roughly doubles the instantaneous V_ce × I_c product in the conducting device, which is the reason output stages have SOA protection at all. Quoting a resistive worst case as 'worst-case heat' without that caveat understates the design problem, in a stage that otherwise gets the thermal argument exactly right.

**Fix:** Add one sentence: 'That is the resistive worst case. A loudspeaker is reactive; at 4 Ω and 60° of phase angle the same output level roughly doubles device dissipation, which is why the safe-operating-area limiter exists.' Optionally overlay a second dissipation curve for a reactive load on gD.

### 12. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** Framing: the stage whose subject is the monoblocks shows almost none of them. In shots/amp.png the left monoblock is cropped at the frame edge behind the chapter rail, the right one is a sliver at the far right, and the 1.12 × 1.05 m schematic plate is positioned in front of the equipment rack — another stage's hardware. The 'METER · log · 30 dB to 300 W · 98 W mean' label lands directly on top of the chapter-rail entries for Turntable / Phono stage / Preamp.

**Fix:** Re-aim shot.position/target so at least one monoblock is fully in frame with the schematic beside it rather than over the rack — the rack is at LAYOUT.rack.x and the monos at LAYOUT.monoL/R, so swinging the camera toward −X and pushing P_ORIGIN clear of the rack's z should do it. Move the meter label's offset to the right of the chassis (positive dx) so it cannot reach the rail.


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
