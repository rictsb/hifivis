# Audit findings — stage `dac`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **52** — Composition, framing and staging
  The hardware crop is the best in the deck; the framing wastes it. Card touches the top frame edge, seven graphs, and the monoblock's lit meter outranks the subject.

- **45** — Materials, lighting and render quality
  Best-lit rack stage; the fascia, display and knobs are legible. Ruined by rack posts clipping to white with bloom halos and by the diagram card ghosting the preamp display through it.

- **64** — Typography, information design and UI
  Good card-caption discipline, but the top caption crowds the masthead at y=43 and the Δ-Σ caption is printed over the graph above it.


## Findings for this stage (17)

### 1. [BLOCKER] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** src/stages/dac.js quotes an SNR with no signal level and then blames the discrepancy on the wrong cause. SPEC.snrMeas measures a signal that is 9.89 dB below a full-scale sine (MOD_GAIN = 0.5 and the three-tone composite has amplitudes 0.275/0.14/0.085, total tone power 0.0512 against 0.5 for FS), while DSP.noiseShapedSnrDb is defined for a full-scale sine. I reran the modulator and the FFT: snrMeas = 67.42 dB, in-band noise = −77.32 dBFS, so the modulator's dynamic range referred to full scale is 77.32 dB. The gap to the 85.19 dB model is therefore 7.9 dB, not 17.8. Both the panel D2 label ('in-band 67.4 dB · model 85.2 dB') and the content() bullet ('this modulator measures 67.4 dB — white-noise assumptions flatter a one-bit quantiser') attribute the whole 17.8 dB to the white-noise assumption, overstating the real penalty by a factor of 2.25.

**Fix:** Report dynamic range, not SNR at an arbitrary level: change SPEC.snrMeas to 10*log10(0.5/noise) so it is referred to a full-scale sine (77.3 dB), and change the label to 'DR 77.3 dB re FS, 0–22.05 kHz · model 85.2 dB'. Rewrite the content bullet as: the model assumes the 1-bit quantisation error is white and uncorrelated with the input; it is not, and a real 2nd-order 1-bit loop falls 7.9 dB short. If you keep the −9.9 dBFS SNR number as well, state the input level next to it.

### 2. [BLOCKER] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** Panel D2 is captioned 'Shaped noise · measured FFT' but the trace it plots contains the signal tones, and they are the two dominant features of the panel. SPEC.floorAt() takes a plain 1/12-octave mean of every bin, tone bins included. I evaluated it: floorAt(4500) = −25.5 dB and floorAt(9000) = −32.5 dB against an adjacent floor of −115.7 dB at 6 kHz and −104.3 dB at 15 kHz — spikes of 90 and 72 dB standing out of a curve labelled 'noise'. Both spikes are clearly visible in shots/dac.png. The 1 kHz tone is hidden only because xRange starts at 3000 Hz, which is itself an accident rather than a decision.

**Fix:** In SPEC.floorAt, skip every bin within ±16 of a tone bin (toneK is already computed in analyseStream — hoist it to module scope), or use the median of the band instead of the mean. Then draw the three tones the way panel C draws its images: separate amber 2-point stems at their true dBFS heights (1 kHz −11.2, 4.5 kHz −17.1, 9 kHz −21.4 dBFS), and drop xRange to 800 Hz so the 1 kHz tone is not silently cropped out.

### 3. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** The diagram card touches the top frame edge (device y ~30) so there is zero sky, and it carries seven graph regions — reconstruction sinc sum, zero-order hold, 20 kHz sampled sine, amplitude floor, aperture/images, 1-bit stream, shaped-noise FFT. dac.js declares 7 DIAG.Graph instances. A magazine spread does not put seven plots on one page. The hero DAC is a 440 x 70 px strip two-thirds down the frame while the card owns the top 60%.

**Fix:** In src/stages/dac.js, cut to three graphs on one card: the sinc sum (the argument), the zero-order hold with the filter removing it (the myth), and the shaped-noise FFT (the number). Move the aperture, 1-bit stream, amplitude-floor and 20 kHz panels into content() as prose plus one eq block. Then pull the card down and left so its top edge sits at device y >= 130 and reframe dac.js:557 to fov 26 with target [0.06, 0.72, -2.94] so the DAC chassis, not the card, is the largest element.

### 4. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** The monoblock at bottom-left is the brightest, highest-contrast object in the frame — a lit blue meter on a chromed chassis — and it is not the subject. It is clipped at the left frame edge and sits directly under chapter-rail items 09/10/11, which become illegible grey-on-light-metal. The same problem recurs in preamp (monoblock centre-bottom), phono (monoblock clipped at right) and speaker (monoblock at right).

**Fix:** Either reframe so the monoblock leaves the shot, or in each of those stages dim the off-subject monoblock's meterGlow emissive by ~70% when the stage is not 'amp'. The cheap version: in dac.js/preamp.js/phono.js/speaker.js set the camera so no lit meter falls inside the left 20% or the SAFE box's brightest quadrant. The subject must be the brightest thing in the frame; right now it never is.

### 5. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** Panel D2's ordinate is dBFS per FFT bin and the resolution bandwidth is never stated. bin = FS_MOD/N_FFT = 43.066 Hz, and SPEC.floorAt returns mean power per bin divided by 0.5. So the −98.0 dB the reader sees at 20 kHz is 'dBFS in 43.1 Hz', while the actual integrated in-band noise 0–22.05 kHz is −77.32 dBFS. A reader who takes the plotted floor as the in-band figure is 21 dB out. No axis title, no RBW note, no bandwidth in the label — this is dB with the reference omitted.

**Fix:** Add the resolution bandwidth to the panel D2 label: 'Shaped noise · measured FFT · dBFS in 43.1 Hz (65 536-point Blackman–Harris)'. Better, convert floorAt to a true density in dBFS/√Hz by subtracting 10*log10(binHz) and label the axis accordingly, then state separately that integrating it 0–22.05 kHz gives −77.3 dBFS.

### 6. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The myth box in content() says the reconstruction filter removes the zero-order hold. It does not. The analogue reconstruction filter removes the IMAGES; the aperture droop is a passband amplitude error that survives it untouched. I evaluated the stage's own recFiltDb (3rd-order Butterworth, fc = 80 kHz) at 20 kHz: −0.0038 dB. The −3.17 dB of ZOH droop at 20 kHz is still there afterwards. Droop is removed by inverse-sinc digital pre-compensation or, as the stage itself later says correctly, by moving the hold to 352.8 kHz.

**Fix:** Change the myth-box sentence from 'the reconstruction filter removes it' to something like: 'the reconstruction filter removes the images the hold creates; the hold's own −3.92 dB droop at fs/2 is a passband error and survives it, so a converter either pre-compensates it digitally or, as here, interpolates ×8 so the hold runs at 352.8 kHz and the droop falls to 0.046 dB at 20 kHz.'

### 7. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** Panel C draws two incompatible converters on one set of axes and labels it with the oversampled one. The label reads 'Aperture and images · hold ×8: −0.046 dB at 20 kHz' and the cyan trace is zohDb(f, 352800), but the seven amber image stems are drawn at n·44100 ± 9000 with heights taken from zohDb(fi, FS) — i.e. the non-oversampled case. In a real ×8 DAC those images do not exist: the digital interpolation filter suppresses them by ~100 dB and the surviving images sit at 352.8 kHz ± 9 kHz, off the right of the axis. As drawn, the 35.1 kHz image reads −12.4 dB and the green analogue filter attenuates it by only 0.031 dB, so the panel tells a reader that this DAC emits a 35 kHz image barely 12 dB below the music.

**Fix:** Decide which converter panel C depicts. If NOS: relabel it 'no oversampling — the images the aperture leaves' and keep the stems, then add the ×8 curve as an explicitly-marked comparison. If ×8 (which is what the label claims): keep the amber stems as the pre-interpolation images but add the digital interpolation filter's stopband as a fourth trace (flat 0 dB to 20 kHz, −100 dB above 24.1 kHz) and show the stems being cut down to it, then put the surviving 352.8 kHz ± 9 kHz images on the axis by extending xRange to 400 kHz.

### 8. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** readouts() reports 'ZOH 20 kHz −3.17 dB' as a live property of this converter, which directly contradicts the stage's own panel C label ('hold ×8: −0.046 dB at 20 kHz') and its content() bullet ('interpolating ×8 moves the hold to 352.8 kHz, where the aperture costs −0.046 dB'). The persistent readout strip is read as the instrument's current state; it cannot show the figure for an architecture the stage has just said it does not use.

**Fix:** Change the readout key/value to 'ZOH 20 kHz (×8)' / −0.046 dB, and if you want the NOS figure kept visible put it in panel B's label only, where it is already correctly framed as the intermediate.

### 9. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** An LSB step size is compared with an rms noise voltage and the difference is quoted in dB as if the two were commensurable. content() says 'The 24-bit LSB over ±2 V is 238.4 nV; a 1 kΩ resistor makes 569 nV of its own noise in 20 kHz, so the bottom bit sits 7.6 dB below one component's floor.' LSB24 = 238.42 nV is a quantisation step; V_JOHNSON = 569.0 nV is an rms. The like-for-like comparison is the quantisation noise rms, LSB/√12 = 68.83 nV, which sits 18.35 dB below the resistor — the stage understates its own margin by 10.8 dB. Panel E repeats the error graphically, putting a step size, an rms noise voltage and a peak full-scale voltage on one 'amplitude' axis with no distinction.

**Fix:** Quote the quantisation noise as an rms: 'the 24-bit LSB is 238.4 nV, so the quantisation noise is LSB/√12 = 68.8 nV rms — 18.4 dB below the 569 nV rms a single 1 kΩ resistor makes in 20 kHz.' On panel E, draw the LSB/√12 stem alongside the LSB stem and mark VFS as '2.000 V peak = 1.414 V rms' so peak and rms are not silently mixed.

### 10. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The stage quotes a 146.3 dB floor beside a converter whose own measured dynamic range is 77.3 dB and never reconciles them. readouts() shows 'SNR 24-BIT 146.3 dB', content() shows the same, panel E scales the amplitude ruler to the 24-bit LSB — and the modulator drawn in panels D and D2 is 2nd-order 1-bit at OSR 64, which I measured at 77.3 dB DR (85.2 dB by the white-noise model). Word length and converter dynamic range are different quantities, but placed side by side with no comment they read as the same claim, and a reader is entitled to ask what the 238 nV LSB is for.

**Fix:** Add one sentence to content(): the 24-bit word sets the arithmetic floor at 146.3 dB (0–22.05 kHz, full-scale sine); the modulator drawn here is a deliberately simple 2nd-order 1-bit loop and reaches 77.3 dB; production converters use 5th-order multi-bit loops at the same OSR to get within ~25 dB of the word length. Also add the measurement band to the SNR readout key ('SNR 24-BIT, 0–22.05 kHz').

### 11. [MINOR] (certain) — Composition, framing and staging

**What is wrong:** The label "ANALOGUE | DIGITAL / screened clock, split ground" prints across a shelf front whose chrome highlight runs straight through the middle of the text — the word ANALOGUE is bisected by the highlight and effectively unreadable at full resolution.

**Fix:** Move the anchor down and left onto the dark shelf underside with offset [-40, +22], or suppress it once the depth test lands. Any label whose projected position lands on a specular streak needs to move; this is the most visible instance.

### 12. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The instrument board's backing plate is 4 % transparent and the rack's chrome uprights ghost through it. In dac.js build(), `plate(BW + pad*2, BDH + pad*2, 0x05070a, 0.96, ...)` — at 0.96 in linear space the rack post's specular highlight punches through the right column of the board and reads as a vertical grey smear across panels C, D and D2 in shots/dac.png. The streamer's author hit exactly this and documented the fix (`P_OP = 1.0 // at 0.93 the rack's specular highlights punch through in linear space and read as ghosts`).

**Fix:** Set the back plate opacity to 1.0 in the plate() call for `back` in dac.js. Leave the per-panel 0.55 tint plates alone.

### 13. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The two amplitude-ruler labels hang off the bottom of the board. Both are anchored at PAN.E.y + PAN.E.h = 0.038 with offset dy = −15 px, which puts them below the board's bottom edge (root y = 0) so 'Amplitude floor, ±2 V / LSB 238.4 nV · 1 kΩ kTB 569 nV' and 'Full scale / 2.000 V · 16-bit LSB 61.04 µV' render over the rack and the chrome pillar. In shots/dac.png 'FULL SCALE' is half-swallowed by the rack rail.

**Fix:** Anchor both at PAN.E.y + PAN.E.h + 0.006 with offset [x, +14] so they sit inside the board above the ruler, or enlarge PAN.E's tint plate and the back plate's bottom pad by 0.030 m so the labels fall on dark ground.

### 14. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** Panel B draws the zero-order hold with no sample dots, so the one thing the reader needs to check — that each step's left corner sits exactly on a sample and on the cyan curve — cannot be checked. Panels A and F both get dots from the S.dots Swarm; B is skipped (the Swarm is sized N_WIN*2 + 6 and its update() only covers A, F and the four ruler stems). It also matters here because the ZOH's inherent T/2 group delay makes the staircase visibly lag the reconstruction, which without dots reads as 'the staircase is drawn wrong'.

**Fix:** Grow the dots Swarm to N_WIN*3 + 7 and add a third branch in S.dots.update() placing dots at B.x + gB.x(n), B.y + gB.y(smp(n)). Add a short note to panel B's label that the hold also delays by T/2 = 11.34 µs, which the reconstruction filter's phase corrects.

### 15. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The kernel-count label overstates what is being withheld. reconstruct(x, kMax) skips only kernels with 0 <= n <= N_WIN and n > kMax; all 80 context kernels from n = −40..−1 and 17..56 are always summed. So at the moment S.labA reads '1 of 17 kernels' the drawn curve is already the sum of 81 kernels. I measured the residual with zero visible kernels: peak |sum| = 0.125 against a full-scale 0.913, so the build-up still reads correctly, but the caption is not literally true.

**Fix:** Change the label to '<n> of 17 shown · 80 off-screen kernels always summed', or gate the context kernels too and accept the edge error (which grows the truncation error at x = 0 and x = 16).

### 16. [MINOR] (likely) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The green trace in panel D is a single 64-tap boxcar, drawn in the colour the contract reserves for 'the correct answer', and its code comment claims 'Its output is the audio.' A sinc-1 decimator is the wrong order for a 2nd-order modulator — the rule is order n+1, i.e. sinc-3 — so it leaves out-of-band shaped noise folding into the band, and it also imposes its own aperture droop (sinc(9000·64/2 822 400) = −0.61 dB at 9 kHz) that is never mentioned.

**Fix:** Cascade three 64-tap boxcars (sinc-3) for the green trace and change the code comment and, if you add a label, the caption, to 'sinc-3 decimator, order = modulator order + 1'. If you keep the single boxcar for cheapness, draw it in PAL.cyDim rather than PAL.gr and label it 'a single boxcar is not enough — a 2nd-order loop needs sinc-3'.

### 17. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The noise-shaping model's band is never stated, so the 85.2 dB cannot be checked. DSP.noiseShapedSnrDb(1, 2, 64) is defined with OSR = fs_mod/(2·BW); with fs_mod = 2.8224 MHz and OSR = 64 the implied band is 22.05 kHz, which happens to match the measurement window (analyseStream integrates k = 2 to floor(NYQ/bin)). Correct, but the reader is given neither the band nor the OSR definition, and 'in-band' in the panel D2 label is undefined.

**Fix:** Extend the panel D2 label to 'in-band = 0–22.05 kHz, OSR 64' and add the OSR definition to the content() bullet: OSR = fs_mod/(2·BW) = 2 822 400/(2 x 22 050) = 64.


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
