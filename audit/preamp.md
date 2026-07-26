# Audit findings — stage `preamp`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **38** — Composition, framing and staging
  The hero rack is bisected by the explanation panel — a knob is cut in half at the panel edge. Competent 2x2 card grid, wrong subject in the centre of frame.

- **36** — Materials, lighting and render quality
  Left third is empty grey backdrop, the hero component is half behind the text panel, the monoblock meter is a pale decal. Same edge-glow problem as phono.

- **46** — Typography, information design and UI
  The LINE PREAMP label is destroyed by a bright cyan sine passing through the glyph bodies — the single worst legibility failure in the set.


## Findings for this stage (3)

### 1. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** The hero is bisected by the explanation panel. src/stages/preamp.js:686 shot is position [0.910, 1.466, -0.459] target [-0.28, 1.06, -2.90]; because the camera sits at x = +0.91 and looks toward x = -0.28, the rack at x = 0 projects into the right third of frame and runs under #panel. At full res the preamp's right-hand knob is sliced in half by the panel edge at device x = 2280, and every shelf's right end is cut.

**Fix:** Change preamp.js:686 to something like position [0.62, 1.34, -0.30], target [0.16, 0.94, -2.92], fov 30. Aiming target.x at +0.16 (right of the rack) swings the rack into the left-of-centre band. Re-shoot and confirm the rightmost rack geometry ends before device x = 2200, leaving an 80 px gutter to the panel.

### 2. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The label at preamp.js S.lab.lvl prints 'S/N 84.3 / 74.1 dB' (render, at −52 dB) with no reference level and no bandwidth on screen, and readouts() carries {k:'S/N', u:'dB'} the same way. The figure is referred to the *attenuated* output, so it slides from 119.9 dB at unity to 84.3 dB at −52 dB purely because the denominator moved — a reader will take 84 dB as the preamp's noise performance. Relatedly, content() says putting the ladder late means 'signal-to-noise hardly moves', which the stage's own live number contradicts by 35 dB across its own sweep.

**Fix:** Put the reference in the kicker: 'S/N re. output, 20 Hz–20 kHz unweighted' — the bandwidth is already BW = 20000 in the source. Then fix the prose to say what is actually true and is what the model shows: the late ladder does not preserve absolute S/N, it preserves the *margin* — 8.84 dB better than the early ladder at −20 dB, 10.17 dB at −63 dB — while the block's headroom is what pays for it.

### 3. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** Two wording defects. (a) The main hardware label kicker reads 'Line preamp · gain is fixed after the ladder', which reads as 'the gain block sits after the ladder' — the opposite of the topology the stage builds and argues for (chainLate = ladder after gain). (b) content() presents CMRR = 1/(2δ) = 54.0 dB as a flat consequence of 0.1 % parts. That is the worst-case resistor-limited bound for a unity-gain four-resistor difference amplifier, and it additionally assumes the two source impedances are matched; an unbalanced source or a 100 Ω imbalance in the cable degrades it regardless of how good the resistors are.

**Fix:** (a) Change the kicker to 'Line preamp · fixed gain, then the ladder'. (b) Add 'worst case' to the 54.0 dB figure and one clause: 'and only if the driving impedances are matched too — a few tens of ohms of imbalance in the source costs more than the resistors do.'


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
