# Audit findings — stage `air`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **26** — Composition, framing and staging
  As a closing spread it is the busiest frame in the piece. Four cards, eleven labels, no focal point, two kickers overprinting each other, and labels running under the panel.

- **29** — Materials, lighting and render quality
  Bloom fog is out of control: a blown square on the right speaker's midrange throws a halo that washes out a quarter of the frame. Contrast is gone.

- **38** — Typography, information design and UI
  Four rail collisions including an amber value printed over the active chapter pill, plus an illegible three-label pile-up on the rack's specular highlight.


## Findings for this stage (8)

### 1. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** As the closing frame of the piece this is the busiest image in the deck and has no focal point at all. Four diagram cards, eleven labels.add calls, roughly ten free traces, plus circles and arcs, all at 20% object scale in a wide room shot (air.js:231, position y = 2.15 m, fov 40). Two kickers overprint each other around device x 360-700, y 1040 ("WAVEFRONT · 200 HZ · λ..." and a "WEIGHT..." kicker). "FLOOR BOUNCE · IMAGE SOURCE 0.95 M DOWN / +0.400 m of path" is chopped by the cochlea card's border. The "AT THE SEAT ... 100 W" label at device x 1920-2260 runs into the panel. The chair reappears at bottom-centre with only its backrest showing, clipped by the frame.

**Fix:** Rebuild this as a resolution image, not a summary. Pick one idea — the ear, or the seat with the direct and floor-bounce paths — and stage it at hero scale. Cut to two cards maximum and six labels. Drop the camera to position [0.85, 1.25, 4.10], target [0.10, 1.02, -1.40], fov 34 so the listening position reads at human height. Remove the chair from this frame entirely (it is the overview's prop and only ever appears clipped here).

### 2. [MAJOR] (certain) — Typography, information design and UI

**What is wrong:** Eleven simultaneous labels, several of them 250–314px wide, produce a frame with no focal annotation and four rail collisions. In shots/air.png: 'PARTICLE DISPLACEMENT ×75,400' shares a baseline with rail item '00 Overview'; 'AIR PARCELS · 1 KHZ AT 94 DB SPL' overprints '03 DAC'; 'WAVEFRONT · 200 HZ · λ = 1.716 M · WEIGHT ∝ 1/R' runs through '06 Preamp' and its second line through '07 Crossover'; and the SIDE WALL label's amber value prints over the active pill '11 Air & ear'. Separately, three labels near x 1000–1230, y 578–608 overlap each other and the rack's bright top edge into illegible mush.

**Fix:** In air.js, cut to seven labels — merge 'Particle displacement' into the 'Air parcels' block (they state the same exaggeration twice), drop the standalone 'λ at 2 kHz' ruler caption into the diagram card, and delete the 89 dB / 1 m / 2 m / seat SPL stack (that arithmetic is already in the panel's 'CONE TO PRESSURE' paragraph). Re-anchor `air.js:521` (Side wall) and `air.js:499` (Wavefront) to the right of x=190 so they clear the rail.

### 3. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The same loudspeaker has two different specifications in two adjacent chapters, both on screen. speaker.js derives SENS = 91.4 dB @ 2.83 V / 1 m, Re = 6.2 Ω, η₀ = 0.647 % from the T/S primaries and prints all three. air.js:56-62 asserts SENS = 89 dB @ 2.83 V into 8 Ω (= 1 W) and back-derives η₀ = 0.483 %, printing '89 dB / 2.83 V / 1 m' on the inverse-square ruler and '0.48 % efficiency' in the key box. Every SPL in the air stage (109.0 / 103.0 / 95.3 / 101.3 dB, 0.97 W acoustic, 199 W heat) inherits the wrong figure.

**Fix:** In air.js set SENS = 91.4 and the load to 6.2 Ω (P_283 = 1.29 W, so 2.83 V ≠ 1 W — state that), or import the speaker stage's derived value. Recompute SPL_1M/2M/SEAT, ETA0, W_AC and W_HEAT and update the panel prose. Whichever number wins, the two chapters must print the same one.

### 4. [MAJOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The SPL at the seat is quoted as pure inverse-square with no reverberant term, in the stage titled 'Air, Room, Ear'. air.js:65-67 gives SPL_SEAT_1 = 89 + 20 − 20·log10(4.831) = 95.3 dB and the pair 101.3 dB, and the ruler label sells it as 'Inverse square'. Using the neighbouring sub stage's own room (ᾱ = 0.25, S = 234.9 m²), the room constant R = Sᾱ/(1−ᾱ) = 78.3 m²; for a half-space source (Q = 2) the critical distance is 0.141·√(QR) = 1.8 m. The seat at 4.83 m is well into the reverberant field: Lp − Ldirect = 10·log10(1 + (4/R)/(Q/4πr²)) = +9.3 dB at Q = 2, still +4.6 dB at Q = 8. The stated seat level is several dB low and the reader is told the room matters everywhere except in the one number they will remember.

**Fix:** Either add the reverberant term to the seat figure — `Lp = Lw + 10·log10(Q/4πr² + 4/R)` with R stated — and label the ruler 'direct field only', or keep 1/r but add one sentence: 'this is the direct sound alone; the reverberant field of this room adds ~5 dB at 4.83 m.'

### 5. [MAJOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** '101.3 dB peak' (label S.lab.seat) and the readout unit 'dB peak' misuse the term. SPL_SEAT is built from a sensitivity spec (an rms quantity) plus 10·log10(100 W); it is the rms SPL while the programme is at its 100 W peak, not a peak SPL (which for a sine would be another +3 dB, and for music considerably more). The brief names rms/peak confusion as a rejection criterion.

**Fix:** Change the label value to `fmt(SPL_SEAT,1) + ' dB SPL at the 100 W peak'` and the readout to `{k:'SPL AT SEAT', u:'dB SPL'}` with the kicker already carrying '100 W'. If a true peak SPL is wanted, state it separately as +3 dB for a sine.

### 6. [MINOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The floor-bounce geometry — the headline '+0.400 m of path, +1.166 ms, first cancellation at 429 Hz, −15.4 dB' — rests on AC_Y = 0.95 m, declared in air.js:26 as 'tweeter axis at 0.95 m'. The speaker stage puts the tweeter at 1.145 m, the midrange at 0.985 m and the woofers at 0.285/0.565 m. With the tweeter's real height the extra path is 0.479 m, Δt = 1.395 ms and the first null is at 358 Hz, not 429 Hz — a 70 Hz error on the number the graph is built around.

**Fix:** Set AC_Y to the actual driver height that dominates the 300–500 Hz bounce (the midrange, 0.985 m from speaker.js MID_Y) and re-derive R_FLOOR, DT_FLOOR, COMB_NULL_F, COMB_A. Fix the comment: it is not the tweeter axis. State the assumption on screen ('image source 0.99 m down · midrange axis').

### 7. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** Two formatting/reference slips in the mains-cable comparison. (1) `(RATIO_CABLE/1e12).toFixed(2)` prints '0.95×10¹²' where the value is 9.5×10¹¹ — a mantissa below 1 in scientific notation, and the source comment itself says 9.5 × 10¹¹. (2) 'electrons drift 0.147 mm/s' is the rms drift for 5 A rms (V_DRIFT), while the 0.66 µm displacement beside it is derived from the PEAK (V_DRIFT·√2); neither is marked.

**Fix:** Print `9.5×10¹¹` (or `${(RATIO_CABLE/1e11).toFixed(1)}×10¹¹`), and write 'electrons drift 0.147 mm/s rms (0.208 mm/s peak) and flex ±0.66 µm'.

### 8. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The particle-displacement figure is given twice with two different values and neither is marked peak or rms. The panel eq gives 'ξ = u/ω = 0.386 µm' (rms, since p is declared 1 Pa rms), while the on-screen label 'Particle displacement ×75,400' swings to ±0.546 µm (XI_PK) and the readout PARTICLE DISPL does the same. A reader comparing panel to picture sees a 41 % discrepancy with no explanation.

**Fix:** Add ' peak' to the S.lab.xi kicker and to the readout unit ('µm pk'), and add '= 0.546 µm peak' as a commentary span on the ξ line of the eq block.


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
