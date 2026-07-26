# Audit findings — stage `power`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **34** — Composition, framing and staging
  The hero conditioner is effectively invisible. Two 23%-wide diagram slabs and 14 labels own the frame; the left loudspeaker is a clipped, equally-bright distraction.

- **28** — Materials, lighting and render quality
  The conditioner — the subject — is completely occluded by two black diagram planes. 50% of the frame is below 5% luminance. There is almost no render left to judge.

- **44** — Typography, information design and UI
  Fourteen labels; four on the rail; 'Supply' overlaps 'Neutral · back'; 533 prose words against a 320 ceiling.


## Findings for this stage (16)

### 1. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** The hero has been swamped. The mains conditioner in rack bay 0 is not findable in shots/power.png — it is behind and below two diagram slabs each about 23% of frame width and 45% of frame height, which together consume ~45% of the stage. Those slabs carry eight separate plot regions (three copper-bar panels, a lattice inset, four stacked graphs), and power.js makes 14 labels.add calls against the contract's stated ceiling of ~10. The left loudspeaker, clipped at the frame edge, is the same tonal value and roughly the same size as the whole hero region.

**Fix:** In src/stages/power.js: keep the right-hand card (the four mains-cycle graphs) and cut the left slab to one panel — the live/neutral pair with the drift-vs-field ratio — dropping the lattice inset and the third bar. Cut labels from 14 to 8 by folding the lattice, true-ratio and mains-lead callouts into content(). Then reframe power.js:992 from fov 27.5 at position [2.02,1.44,2.65] to roughly position [1.35,1.10,1.35], target [0.10,0.62,-2.90], fov 30, so the conditioner chassis is the largest single object in the SAFE box and the surviving card sits beside it, not over it.

### 2. [BLOCKER] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** src/stages/power.js:1099 animates carrier displacement in phase with the current: `const drift = X_DRIFT_PK * MAG_DRIFT * sn;` with sn = sin(ωt). Displacement is the integral of velocity, so x(t) = −x̂·cos(ωt): the carriers must be at maximum displacement when the current is zero and back at home when the current peaks. The same update() gets it right for the readout eleven lines earlier (S.xd = −X_DRIFT_PK·Math.cos(th), line 1087), so the swarm and the 'CARRIER x' readout are visibly 90° apart. amp.js:911, preamp.js and overview.js:816 all use −cos correctly; power is the only stage that gets it wrong, and it is the stage whose entire subject is what the carriers do.

**Fix:** Replace line 1099 with `const drift = -X_DRIFT_PK * MAG_DRIFT * Math.cos(th);`. Nothing else changes — the arrows and E-field heads correctly follow the current (sin) and must stay as they are, which then makes the 90° lag between arrow direction and carrier position visible, which is the point.

### 3. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** power.js:21-23 declares the system draw as I_RMS = 5.00 A, 1150 VA at unity power factor, and gi.addTrace draws the mains current as a pure I_PK·sin(ωt). overview.js:52-55 declares the same system as P_MAINS = 2×600/0.55 + 100 = 2281.8 W, I_MAINS = 9.92 A rms, 14.03 A peak, and animates its readout to that. Both are on screen as authoritative. Worse, power's own content() ends by explaining that this load 'draws in violent, harmonic-rich bursts instead of a clean sine' at 33 A for 0.6 ms per half cycle — which is flatly incompatible with the sinusoid drawn above it and with 'unity PF assumed'.

**Fix:** Pick one system draw and use it in both stages (overview's 2282 W / 9.92 A is the defensible one, and it is the one derived from a stated efficiency). Then either draw the actual rectifier current pulse train on power's gi graph — which is what the prose promises and is far more interesting — or label that trace explicitly 'sinusoidal idealisation; the real waveform is on the reservoir plot below' and drop the unity-PF claim, quoting a crest factor instead.

### 4. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** content() 'Field, not flow': 'the flux integrated over that space is the whole V·I = 1150 W the system draws'. Two errors in six words. (1) The constant is literally named VA in the source (line 23) and V_rms·I_rms is volt-amperes; it equals watts only at unity power factor, which the same stage's rectifier paragraph denies. (2) The Poynting flux at any instant is p(t) = V̂Î sin²ωt = V·I(1 − cos 2ωt), which the stage's own sheath animation implements correctly at line 1092 — it peaks at 2300 W and averages 1150 W. Writing '= 1150 W' for a quantity the drawing shows pulsing at 100 Hz is exactly the rms/peak elision the brief forbids.

**Fix:** Rewrite as: 'the flux integrated over that space is p(t) = V̂Î sin²ωt = 1150 (1 − cos 2ωt) W — zero twice a cycle, 2300 W at the peaks, 1150 W mean. That mean is 1150 VA, and equals 1150 W only because this load is being treated as unity power factor.' Keep the number derived from whichever single system draw is chosen.

### 5. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The label at power.js:1041 has kicker 'All three at the same ×25' over a value row that reads '⌀ 1.784 mm · true swing ±0.662 µm · the same swing ×75k'. The third item is by construction NOT at ×25 — it is at ×75,000, a further ×3000, as the myth box says. The label contradicts itself in one line, and it is the one label carrying the honesty of the whole drift exaggeration.

**Fix:** Change the kicker to 'The first two at true ×25 · the third blown up ×3000 more' (or 'Both drawn at ×25; the cyan bar is that same swing ×3000'). Confirmed on the render at the top of card A.

### 6. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The true-ratio speed strip label (power.js:1052) reads 'drift 2.08×10⁻⁴ · thermal 1.57×10⁶ · field 1.98×10⁸ · c'. 1.57×10⁶ m/s is the Fermi velocity, computed at line 49 from ħk_F/m. The panel prose two paragraphs earlier goes out of its way to say this is NOT the thermal figure — 'the electron gas in copper is degenerate... not the classical √(3kT/m) = 1.2×10⁵ m/s most textbooks quote'. Calling the marker 'thermal' on the drawing reinstates the exact error the text just corrected, and it is the drawing a reader looks at.

**Fix:** Rename the marker to 'Fermi 1.57×10⁶' in the label at line 1052, and consider adding a fourth, dimmer marker at V_CLASSICAL = 1.15×10⁵ tagged 'classical √(3kT/m), wrong for a metal' — that turns the strip into the argument rather than a list.

### 7. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** content() opening: 'At 50 Hz the pair exchange roles 100 times a second.' Live and neutral do not exchange roles. Neutral is bonded to earth at the supply transformer star point and stays within a volt or two of earth potential all cycle; live swings ±325 V about it. What alternates 100 times a second is the direction of the current, not the identity of the conductors. In a stage that then correctly insists protective earth is a third, distinct thing, blurring live and neutral into interchangeable partners misleads a competent reader — and it is the sentence that sets up the whole live/neutral/earth distinction.

**Fix:** Replace with: 'The current in them reverses 100 times a second. The conductors are not interchangeable: neutral is bonded to earth at the supply transformer, so it sits within a volt or two of earth all cycle while live swings ±325 V about it.'

### 8. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The ± rail arithmetic is underdetermined and probably out by 2×. C_RES = 20e-3 is commented '2 × 10 mF' and V_RIPPLE_EST = I/(f·C) = 2/(100 × 0.020) = 1.00 V, but the on-screen label reads 'toroid → bridge → 20 mF → ± rail' and psuChain() draws two capacitors and two bus bars at ±0.030 — a split supply. If the two 10 mF cans are one per rail (the only sane reading of '± rail'), each rail sees 10 mF and the ripple is 2/(100 × 0.010) = 2.00 V p-p, twice what is printed. Separately, a single 40 V rms secondary into a bridge yields one rail of 54.9 V, not ±54.9 V; that needs 40-0-40 or dual secondaries, and neither is stated. Whether I_DC = 2.0 A is per rail or total is also never said.

**Fix:** State the topology explicitly on the label — e.g. '40-0-40 V secondary → bridge → 10 mF per rail → ±54.9 V, 2.0 A per rail' — and set C_RES to the per-rail capacitance so the 1.00 V bound and the 0.94 V simulation refer to one rail. If the intent really is a single rail, remove '±' from the label and from the two bus bars in psuChain().

### 9. [MAJOR] (likely) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** On screen the energy front is only about ×3 faster than the carrier swarm (front: 30.8 mm of cable in 0.78 real s; carriers: ±49.6 mm of card at 1 Hz), against a true ratio of 9.5×10¹¹. The same holds in amp (≈×12), preamp (≈×8) and overview (≈×10). Each stage does disclose its two exaggerations, but they are different kinds of quantity — a length magnification (×75,000 / ×2×10¹⁰ / ×2.3×10⁴) and a time slow-down (1:5×10⁹ / 6.6×10⁷ / 9.9×10⁷) — and no reader can combine them to recover the ratio their eye is actually reading. The brief's demand is that the contrast be 'the point'; at present the only place the true ratio appears is a static log strip, while the animation says 'about the same'.

**Fix:** Add one clause to the existing front label in each stage stating the ratio as drawn, e.g. power: 'as drawn the front is only ×3 faster than the carriers; truly ×9.5×10¹¹'. amp: ×12 vs ×7.8×10¹¹. overview: ×10 vs ×4.8×10¹¹. preamp: ×8 vs ×2.8×10¹⁶. Better still in power, quote the drift *velocity* exaggeration (MAG_DRIFT × timeScale = ×1500) alongside the ×75,000 length magnification, so the two disclosed numbers are commensurable.

### 10. [MAJOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The 33 A charge-pulse figure ('the mean current through the rectifier while it conducts is 33 A — which is why a linear supply draws in violent, harmonic-rich bursts') falls straight out of a peak-detect model with zero source impedance (lines 77-98): with no transformer secondary resistance and no diode dynamic resistance, the conduction angle is set only by the discharge and the current amplitude is unbounded in principle. A real 40 V/100 VA secondary has 0.3–0.6 Ω; 33 A through that would drop 10–20 V, so the actual pulse is longer and much lower (typically 8–12 A over 2–3 ms). The number is a model artefact presented as a derived fact, in a stage that says 'nothing is picked because it looks good'.

**Fix:** Either add a stated secondary + diode resistance to the RAIL solver and quote the resulting peak and rms rectifier current (which also gives an honest crest factor for the mains-current claim above), or label the figure as what it is: 'with zero source impedance this is a bound; a real 0.4 Ω secondary spreads the same charge over ~2.5 ms at ~11 A peak.'

### 11. [MINOR] (certain) — Composition, framing and staging

**What is wrong:** The "MAINS LEAD / 3 × 2.5 mm² · ⌀14.0 mm · 2.0 m" label floats in a black void at device x 500-780, y 1500-1560, attached to a cable that renders as thin outlined tubes with visible gaps — it reads as wireframe, not as a flexible cable. The whole bottom 20% of the frame is otherwise empty floor.

**Fix:** Either give the mains lead a real DIAG.tube with the rubber material and a contact shadow where it meets the floor, or cut it and the label. Then raise the camera target so the empty floor band is reduced to about 10% of frame height.

### 12. [MINOR] (certain) — Materials, lighting and render quality

**What is wrong:** shots/power.png has effectively no render to grade: the conditioner in bay 0 is entirely behind two black diagram planes, 50% of the frame is below 5% luminance, and the two visible speaker edges at the left are cropped. Whatever material work power.js does is invisible. This is the lowest-value frame in the set and it is the first stage after the overview, so it sets the reader's expectation for the whole piece.

**Fix:** Re-frame to a three-quarter view of the conditioner itself in bay 0 at roughly 0.8 m, fov 32, with the two cards moved to camera-right at 1.4x the component width as CONTRACT.md section 4 specifies. The toroid, the reservoir cans and the IEC inlet are the photographic content of this stage and none of them are currently on screen.

### 13. [MINOR] (likely) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** The mains lead's stated dimensions do not correspond to 3 × 2.5 mm² flex. PITCH_CORE = 6.80 mm forces the core centres 6.8 mm apart when the insulated cores are only 3.38 mm in diameter (0.892 mm conductor radius + 0.80 mm wall), so they float on a filler nearly as thick as the cores; LEAD_OD then comes out 14.04 mm, printed on screen as '⌀14.0 mm'. Real H05VV-F 3G2.5 is about ⌀10.5–11.5 mm with core centres ~3.6–4 mm apart. overview.js's own key box says the two conductors 'lie about 4 mm apart', so the two stages disagree.

**Fix:** Set PITCH_CORE ≈ 3.9e-3 and reduce the sheath allowance so LEAD_OD lands near 11 mm, matching the overview's 4 mm claim and the real cable. The ×25 section drawing scales with it and the loop area claim gets stronger, not weaker.

### 14. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** Two inconsistencies in the copper constants. (a) power.js:51 comments SIGMA_CU = 5.96e7 S/m as '(100 % IACS)'; 100 % IACS is 5.8001×10⁷ S/m (ρ = 1.7241×10⁻⁸ Ω·m). 5.96×10⁷ is about 102.8 % IACS. (b) power.js uses RHO_CU = 1.678e-8 while amp.js:52 uses 1.724e-8 for the same metal at the same temperature — a 2.7 % disagreement inside one deliverable, and it propagates into R_LOOP (26.85 mΩ) and R_CABLE (41.4 mΩ).

**Fix:** Pick one value across both stages. 1.7241×10⁻⁸ Ω·m / 5.8001×10⁷ S/m at 20 °C is the standard and is what amp.js already uses; then power's R_LOOP becomes 27.6 mΩ, V_DROP 0.138 V, P_LOSS 0.690 W, and the Fermi-gas τ, mean free path and D all shift by 2.7 % (all still round to the printed 24.9 fs / 39 nm / 29 mm). Delete or correct the '100 % IACS' comment.

### 15. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** 'A third conductor, protective earth, is bonded to every chassis and carries no current at all unless something has failed' — and the label prints '0.00 A'. The box being described is a mains conditioner, i.e. precisely the equipment that has X and Y capacitors from live and neutral to chassis. Y-cap leakage into PE is normal, continuous, and standards-limited (3.5 mA per outlet under EN 62368/60335), and with eight outlets of Class I gear behind it a conditioner's earth conductor carries a steady few milliamps. A measurement editor reads 'no current at all' as an unqualified false claim in the one box where it is most false.

**Fix:** Change to 'carries no signal or return current; only the filter's earth-leakage current, a few milliamps, and whatever a fault sends it.' The '0.00 A' label can stay if the kicker says 'no return current' rather than implying zero total.

### 16. [MINOR] (certain) — THE ELECTRICAL CHAIN — power, preamp, xover, amp, and the electrical claims in overview

**What is wrong:** On the render, the 'Supply' and 'Load' labels at the two ends of the cable card (power.js:1055-1056) are occluded — 'Supply' is overwritten by the 'Neutral · back' label and 'Load' is clipped by the card's right edge. Those two labels are the visual evidence for the closed loop: they mark where the amber path leaves and where it comes back. Losing them is losing the proof of the stage's second-most-important claim.

**Fix:** Move the Supply label's anchor left of XS and down (offset roughly [-40, 18]) so it clears the 'Neutral · back' value, and pull the Load anchor inboard to about x = 0.905 with offset [30, 0] so it stays inside the card. Alternatively drop the 'Protective earth 0.00 A' label — three labels stacked on the three cores is what is crowding the left end.


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
