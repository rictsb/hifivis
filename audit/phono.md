# Audit findings — stage `phono`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **28** — Composition, framing and staging
  No identifiable hero. Overlay traces run across the rack faceplates and bleed off the left frame edge straight through the chapter rail. The least legible frame in the set.

- **34** — Materials, lighting and render quality
  The rack has become a neon wireframe: roughly thirty uniform white edge lines, all equally bright, several on downward-facing edges. Traces cut straight through the chassis.

- **48** — Typography, information design and UI
  Pole/zero labels scattered below the plot with no leaders to the markers; 'CHASSIS EARTH' and 'CARRIERS OSCILLATE' share a baseline; the myth block prints '3.5×1016'.


## Findings for this stage (4)

### 1. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** Four or five disconnected overlay curve fragments run off the LEFT frame edge (device x 0-600, y 280-1070) with no card behind them and no label attached. They pass straight through chapter-rail items 00-05, so cyan traces cross the nav typography. It reads as rendering garbage, not as a diagram. The stage also has no identifiable hero: I cannot tell which box in the rack is the phono stage.

**Fix:** In src/stages/phono.js, clamp the RIAA trace group's world extent so nothing projects left of NDC x = -0.80, and give it a DIAG.diagramCard backing plate so the curves sit on a plate rather than floating over the room. Separately, single out the hero: give bay 3 a brighter key or a subtle rim, pull the camera in (phono.js:681 fov 34 -> 28, target y 0.755 -> 0.70) so the phono chassis is at least 30% of the SAFE box width.

### 2. [MAJOR] (certain) — Typography, information design and UI

**What is wrong:** src/stages/phono.js:822 — `SPEED_RATIO.toExponential(1).replace('e+','&times;10')` emits the exponent as plain digits, so the `.myth` block renders 'a ratio of 3.5×1016'. Every other stage sets exponents as true superscripts (10⁸, 10¹¹, 10⁻⁴). A measurement editor reads this as three-point-five times one thousand and sixteen.

**Fix:** Replace with a superscript mapper, e.g. `.replace(/e\+?(-?\d+)/, (_,e)=>'&times;10'+[...e].map(c=>({'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'})[c]).join(''))`. Grep the other stages for `toExponential` used the same way.

### 3. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** src/stages/phono.js:822 — `SPEED_RATIO.toExponential(1).replace('e+', '&times;10')` turns 3.4902e16 into the literal string '3.5&times;1016'. The myth box therefore ends 'a ratio of 3.5×1016' — an un-superscripted exponent that reads as three thousand five hundred, in the one paragraph whose entire point is orders of magnitude. (turntable.js does this correctly with real superscript glyphs.)

**Fix:** Replace with an explicit superscript: `${(SPEED_RATIO/1e16).toFixed(1)}&times;10<sup>16</sup>` or the literal '3.5 × 10¹⁶' built from Unicode superscripts, matching turntable.js:1133.

### 4. [MINOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The stated carrier magnification does not match the drawing. phono.js:730 computes `disp = X_DRIFT * CARRIER_MAG` and applies it directly in path units, but the drawn loop is ~0.72 design units representing CABLE_L = 1.2 m (the neighbouring label asserts '1.2 m in 6.06 ns'). The apparent magnification relative to the drawn wire is therefore (0.027/0.72)/(0.902 pm/1.2 m) ≈ 5×10¹⁰, not the '×3×10¹⁰' printed in the label. turntable.js:1197 does apply exactly this correction (`scale = S.loopLen / LOOP_LEN`); phono does not.

**Fix:** Mirror turntable.js: `const scale = R.path.total / CABLE_L; const disp = X_DRIFT * CARRIER_MAG * scale * s1;` — then the printed ×3×10¹⁰ is true.


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
