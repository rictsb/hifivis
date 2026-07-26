# Audit findings — stage `sub`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **36** — Composition, framing and staging
  Hero subwoofer is ~4% of frame; the left one is hidden behind the turntable. Mid-frame is a knot of overlapping traces, and the chair reappears clipped at the bottom.

- **32** — Materials, lighting and render quality
  A flat desaturated teal wash covers the lower half of the frame with a hard straight seam at its far edge. The sub cone carries four hard white squares that read as stuck-on LEDs.

- **54** — Typography, information design and UI
  NODES · MODE (1,1,0) destroys two rail rows; the myth callout is 4px above the panel fold, i.e. invisible.


## Findings for this stage (10)

### 1. [BLOCKER] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The seat SPL cannot be derived from anything on screen. `SPL_REF = 100` (dB @ 1 m, half space, per sub, sub.js:64) drives X_PK → Q_PK → seatSpl(), producing the label 'SEAT · ON THE NODE … 78.3 dB SPL', the readout 'SEAT SPL 78.3 dB' and the excursion readout 'x 4.3 mm of 19'. The 100 dB @ 1 m drive level appears in neither content() nor any label. A reader is shown three numbers with no stated input and no way to check them — exactly the failure mode the brief forbids.

**Fix:** Add the drive to content() ('The box' block): a line such as `drive 100 dB @ 1 m, half space, per sub → x̂ = 4.85 mm, Û = 78.2 L/s peak` and put `· 100 dB @ 1 m` into the S.lab.sub kicker. Then 78.3 / 84.3 dB become checkable.

### 2. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** The hero is ~4% of the frame. SHOT at sub.js:211 is position [0.45, 3.55, 6.60], fov 44 — an almost plan view from 3.55 m. The right subwoofer renders as an 80 x 105 px box; the left one at LAYOUT.subL is completely occluded by the turntable and its plinth. Meanwhile device x 810-1490, y 600-980 is an unreadable knot of overlapping cyan and amber traces sitting on top of the rack, and the room-mode pressure map ends up as a soft blue blob in the bottom-right corner, mostly under the panel, reading as a lens flare rather than a pressure field.

**Fix:** Split the intent. Keep a moderately high camera for the modal floor pattern but drop to position [0.30, 2.35, 5.40], target [0.90, 0.42, -1.90], fov 38 so the right sub reads at a useful size and the floor plane still shows. Move the mode-pattern plane's bright lobe left, to about x = -0.6, so it lands inside the SAFE box instead of under the panel. Move or thin the trace knot over the rack — at this camera the rack is not the subject and should be a quiet mass. And remove the chair from this stage's frame (it appears clipped at the bottom and adds nothing).

### 3. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** The label "ROOM MODES · MODE (1,1,0) · 30.02 HZ / the seat sits on one" prints directly on top of chapter-rail items "08 Monoblocks" and "09 Loudspeaker" at device x 230-560, y 1130-1200. Text on text, both unreadable.

**Fix:** Anchor it to the floor-plane node line at about x = +0.4 with offset [+40, -12] so it lands well right of device x = 320. The rail exclusion in labels.js is the systemic fix.

### 4. [MAJOR] (certain) — Materials, lighting and render quality

**What is wrong:** A flat desaturated teal wash covers the entire lower half of shots/sub.png, terminating in a hard straight seam across the full frame width at roughly y=1150 (original px). It sits over the polished floor and over the listening chair, raising the black level of the largest single area in the frame to a muddy mid-teal with no gradient and no depth cue. It is exactly the scene-wide haze CONTRACT.md section 3 warns about, and it also swamps the accent-colour discipline (rule 5) by making teal the dominant hue of the composition.

**Fix:** In src/stages/sub.js reduce the modal-pressure plane's opacity to about 0.30 of its current value, replace its hard rectangular boundary with a radial alpha falloff to zero at the edges (a canvas mask, same approach as blobShadow), and change its blending from additive to NormalBlending with a colour that stays under the floor's own value so it reads as a projection onto the floor rather than a light in the room. Keep the node/antinode contrast by raising the *modulation* depth rather than the base level.

### 5. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** src/stages/sub.js:681 — `for (const c of S.cones) c.position.z = CAB/2 - 0.0055 + x;` moves BOTH subwoofer cones unconditionally, including during the half of the A/B cycle when the labels read 'Right sub alone' / 'sum 0.000 if both play'. The animation contradicts its own caption: the left sub is visibly pumping ±4.85 mm while the stage says it is silent.

**Fix:** Store which sub each cone belongs to (S.cones.push({drv, isLeft})) and scale the left one by the mix: `c.position.z = CAB/2 - 0.0055 + x * (c.isLeft ? S.mix : 1)`. Optionally dim that sub's cyan flush LED with the same factor.

### 6. [MAJOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The modal floor field — the stage's central demonstration ('the pattern on the floor', 'watch the floor pattern collapse as the second joins') — renders as a featureless blue-teal wash with no visible nodes or antinodes (see shots/sub.png lower half, cropped). The (1,1,0) term dominates the sum by ~4 orders of magnitude (I computed 2.7×10⁻⁶ vs 1.3×10⁻¹⁰ for the (0,0,0) pressurisation), so the geometry is there in the data; it is the mapping that kills it: `s = Math.pow(b,1.35) * 0.24` (sub.js:673) caps the additive brightness at 0.24 before tone mapping, and the 0.26·envelope + 0.74·|instantaneous| blend further flattens the contrast.

**Fix:** Raise the ceiling (0.24 → ~0.6) and steepen rather than flatten: use `Math.pow(b, 0.7)`, and add explicit nodal contours — draw the |Ψ|=0 loci for the (1,1,0) pattern as solid lines, or quantise the field into 5–6 banded levels so the quadrant pattern reads as geography rather than glow. Verify by re-shooting and confirming a dark cross at x=0 and z=−0.90 with four bright quadrants.

### 7. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** content() opening paragraph: 'the room's floor diagonal, its longest straight line, is 11.65 m'. The floor diagonal (√(7.4²+9.0²) = 11.65 m) is not the room's longest straight line — the body diagonal is √(7.4²+9.0²+3.1²) = 12.06 m, and the module already computes it as DIAG3D (sub.js:35) and uses it for the readout bar. The claim is checkable and false as written.

**Fix:** Either drop 'its longest straight line' or use DIAG3D: 'the room's longest straight line, corner to corner, is 12.06 m; the wave is 95 % of it.'

### 8. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** 'One wavelength at 30 Hz is 11.44 m … so it cannot cross the room as a travelling wave.' It does cross the room, at 343.2 m/s, in 26 ms — that is precisely what the air stage animates one chapter later. What the low modal density prevents is a free-field/statistical steady state, which the very next sentence gets right ('settles into a pattern fixed by the walls'). As written the two sentences contradict each other and the first would be rejected by a competent reader.

**Fix:** Replace with: 'so no point in the room is more than half a wavelength from a wall: the steady state is not a travelling wave but a standing pattern fixed by the boundaries.'

### 9. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The modal pressure field is drawn outside the room it models. The mesh spans z ∈ [ZF = −2.05, Z_FIELD_NEAR = +4.30] but the room's near wall is at wallZ + D = −5.40 + 9.0 = +3.60, so 0.70 m of field is painted beyond the boundary — and beyond the drawn room-plan rectangle, whose near edge is correctly at +3.60. The cosine expansion has no meaning there and the plan outline visibly disagrees with the glow.

**Fix:** Clamp Z_FIELD_NEAR to RM.z0 + RM.D (3.60), or fade the mesh vertex alpha to zero at the wall.

### 10. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The A/B state label is anchored to the wrong subwoofer. S.lab.pair is placed at LAYOUT.subL (screen left) but its kicker reads 'Right sub alone' / 'Both subs playing' and its text prints 'Ψ₁₁₀ = 0.635 / −0.635' — the left sub's value first. A reader following the demonstration is told about the right sub while looking at the left one.

**Fix:** Anchor the state label to LAYOUT.subR, or reword the kicker to 'One sub / Both subs' and label the two Ψ bars individually (they already sit above each cabinet).


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
