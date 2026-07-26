# Audit findings — stage `xover`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **30** — Composition, framing and staging
  Card abuts the panel with no gutter, panel eq text clips mid-glyph, six curve fragments run off the left edge through the rail, and the rear panel floats detached above the rack.

- **35** — Materials, lighting and render quality
  Card ghosting is worst here — rack shelves and a blown post streak are clearly visible through the graph plate, which destroys both the diagram and the object.

- **50** — Typography, information design and UI
  .eq clips 'worst case, at 105 k[Hz]' at the panel edge — visible truncation. Two labels share a baseline and read as one run-on line.


## Findings for this stage (7)

### 1. [BLOCKER] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** src/stages/xover.js:70-72 and the content() 'Why before the amplifier' paragraph quote damping factor falling from 8/0.02 = 400 to 8/0.52 = 15.4 as the headline reason to go active. Both figures are wrong in the way this project elsewhere calls a myth. (a) Z_OUT alone ignores the speaker cable: amp.js computes 2 × 3 m of 2.5 mm² = 41.4 mΩ, which drops the 'active' figure to 8/0.0614 = 130, not 400. (b) More seriously, the voice coil's own dc resistance is in the same series loop, so the quantity that actually damps the cone is Re + Rs, not RL/Rs. Using amp.js's own RE_COIL = 5.4 Ω, adding the coil's 0.50 Ω takes total damping resistance from 5.42 Ω to 5.94 Ω — a 9.6 % change, not a 26× one. amp.js states exactly this in its myth box ('400 is not three times better than 130... 0.76 %'), so the deliverable argues both sides of the same question in two adjacent stages.

**Fix:** Add cable resistance to Z_OUT so the active figure reads 130, matching amp.js. Then replace the 400 → 15.4 framing with the quantity that means something: total electrical damping resistance 5.42 Ω → 5.94 Ω, +9.6 %, i.e. Qts rises by 9.6 % and the response bump is a fraction of a dB. Keep the real argument for active — the −0.55 dB insertion loss, the 6.1 % burnt in the coil, the coil's saturation and its interaction with the driver's rising impedance — none of which need the damping-factor scare. Add the frequency at which Z_LOAD = 8 Ω is claimed, or say 'nominal'.

### 2. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** Same left-edge bleed as phono: six curve fragments (cyan and orange) clipped by the left frame edge at device x 0-530, y 470-1450, printing over rail items 05 through 11. "11 Air & ear" is completely buried under a cyan sine. Additionally the label "ACTIVE CROSSOVER 1 IN 3 / 80 Hz / 2.20 kHz" sits on the active "07 Crossover" pill.

**Fix:** In src/stages/xover.js, delete the left-hand ghost traces entirely (they carry no labelled information in the still) or move that group to +X of the rack. Move the ACTIVE CROSSOVER label anchor to the rear-panel slab with offset [+70, 0].

### 3. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** The crossover's rear panel renders as a detached slab hovering in mid-air at device x 590-1320, y 680-880, above and to the left of the rack, with no visible connection to any chassis. It reads as a bug, not a cutaway. Its label "REAR · 2 IN, 6 OUT / 6 amplifier channels" sits hard against the left frame edge with a leader crossing the chapter rail.

**Fix:** In src/stages/xover.js, either tether the rear panel to the crossover chassis with a visible ghosted extrusion (a translucent volume connecting it back to bay 5) so it reads as an exploded view, or move it flush against the rack's rear plane. Move its label to the panel's right side, offset [+90, 0], clear of x < 320.

### 4. [MAJOR] (certain) — Typography, information design and UI

**What is wrong:** The `.eq` block clips horizontally. Measured scrollWidth 408px against clientWidth 384px, so the second line 'low + mid + high = -0.015 dB   worst case, at 105 kHz' is cut mid-word at the panel edge — the reader sees 'at 105 k'. `.eq` has `overflow-x:auto` (app.css:155) with no scrollbar affordance and `white-space:pre`, so it is simply truncated in any screenshot. Same defect at smaller magnitude in power.js (386 vs 384), amp.js (386) and sub.js (394).

**Fix:** Hold displayed equations to ≤44 monospace characters per line at 12.5px in a 384px box — xover's longest line is 52 characters. Break `|LP| = |HP| = 0.5 at fc → 20·log₁₀0.5 = -6.02 dB` onto two lines with the commentary on its own line, and do the same for the four-character overruns in power/amp/sub. Optionally drop `.eq` to `font-size:12px` to buy ~2 characters.

### 5. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The passive comparison is not like-for-like. content() derives the series inductor as the 2nd-order Butterworth alignment, √2·R/ω_c = 22.5 mH (line 68), and compares its 0.50 Ω DCR against an active filter that is LR4 everywhere else on the sheet. A passive LR4 low-pass at 80 Hz into 8 Ω is two cascaded sections — two large inductors plus shunt capacitors — with roughly twice the series copper, and the shunt capacitance at 80 Hz would be hundreds of microfarads of non-polar film. The comparison as drawn (one coil in the schematic at DAMP row 2) both understates the passive penalty and misrepresents what an LR4 passive network is.

**Fix:** Either state the order in the text — 'a single 2nd-order section; a passive LR4 needs two of these, roughly 1.0 Ω of copper and DF 8' — and recompute DF_PAS accordingly, or draw the second section in the schematic. Also give the capacitor value so the reader can see why nobody does this at 80 Hz.

### 6. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** None of the four measurement graphs on the crossover sheet carries a numeric axis. The magnitude plot's whole argument — that each band is −6.02 dB at its fc, that the asymptote is 24.08 dB/oct, that the green sum sits on 0 dB — is unverifiable from the drawing; a reader has to take the caption's word for it. Same for the phase plot (yRange −760…40°, no numerals) and the group delay (0…8 ms, no numerals). The same is true of amp's dissipation plot (0…470 W) and preamp's dBV plot. For a piece whose selling point is that every number is derived, a plot you cannot read a value off is the weakest link.

**Fix:** Add three DOM tick labels to the magnitude graph (0, −6, −24 dB) and the two decade ends (20 Hz, 20 kHz) — five short labels, well inside the ≲10 budget if the redundant ones are pruned. Do the same for group delay (0, 4, 8 ms). At minimum, put the axis span in the graph's existing kicker, e.g. 'Magnitude · +6 to −30 dB · 20 Hz–20 kHz'.

### 7. [MINOR] (certain) — Composition, framing and staging

**What is wrong:** The diagram card's right edge sits about 15 px from the explanation panel's left edge — zero gutter. Nothing is technically clipped, but two hard vertical edges 15 px apart create a visual seam that reads as a layout accident. The same tightness appears in phono (PCB card ~20 px from the panel) and dac (right graph column running to the panel edge).

**Fix:** Enforce a minimum 80 px gutter between any overlay geometry's projected bounding box and device x = 2280. In practice: shrink or shift each of those three cards' world-space width by roughly 12%.


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
