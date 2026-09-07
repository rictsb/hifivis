# Independent physics review

Reviewer: physics_critic, independent of all six subsystem authors and of the implementation. Review began 2026-09-07. Final verdict: **PHYSICS APPROVED**, following integrated review, revisions, actual browser interaction, final rendered inspection and independent arithmetic checks. No substantive physics defects remain for the final hash recorded below. The earlier rejection rounds are retained as an audit trail.

## Defect register

| ID | Severity | Observed defect | Required change | Status |
|---|---|---|---|---|
| P-01 | Substantive | `src/scene.js` draws preamp directly to monoblocks while `content.js` describes main XLR to a distribution buffer then to monoblocks and W13 bass. | Make both room wiring and all route diagrams share the documented selected architecture: preamp main XLR to generic balanced distribution; independent unity full-range outputs to each monoblock and each W13 bass line input; separate LP outputs to subs. | Closed in revised integrated build; independently inspected |
| P-02 | Substantive | Scene currently has one PSU-to-audio cable per HD unit and identifies it as coming from conditioner. Both actual HD products require two matched umbilicals. | Render two separate supply umbilicals per matched PSU; distinguish these from PSU mains feeds in route identity and labeling. | Closed in revised integrated build; independently inspected |
| P-03 | Substantive evidence defect | `SOURCE.w13manual` points to a failing `/wp-content/uploads/2019/01/W13BassAmplifer_2.pdf` URL. Original-W13 construction is attributed primarily to the current MK2 product page. | Use accessible factory `https://boenicke-audio.ch/W13BassAmplifer.pdf`; add original brochure and 2021 SE+ review, with generation caveat, to relevant text and evidence drawer. | Closed in revised integrated build; independently inspected |
| P-04 | Substantive mechanical defect | In the 3D scientific insert, `exploded.children[0]` translates the entire driver group including its mounting ring and screws. Separate copper voice-coil rings stay fixed. | Keep frame and magnet stationary; move the diaphragm, dustcap and attached voice coil together. Show the connecting suspension or explicitly label its omission. | Closed in revised integrated build; independently inspected |
| P-05 | Substantive if presented as explanatory | Every rendered meter currently receives `state.level*.009`; this makes the DAC's input/fixed-output meter respond to downstream preamp attenuation. No visible meter calibration caveat was found. | Keep the DAC's meter independent of downstream Level, and make output meter behavior consistent with its source. State that meter needle deflections are illustrative rather than calibrated instrument simulations. | Closed in revised integrated build; independently inspected |
| P-06 | Evidence defect | The RIAA citation `precision-riaa-equalization.html` failed direct opening. | Replace with independently accessible Analog Devices Audio Amplifiers handbook chapter `https://www.analog.com/media/en/training-seminars/design-handbooks/P2%20Ch6_final.pdf`, which documents the constants and transfer function. | Closed in revised integrated build; independently inspected |
| P-07 | Quantitative assumption defect | The AC copy supplies density, area and frequency but does not clearly state the sinusoidal-current and uniform-current-density assumptions needed for the RMS-to-peak and displacement formulas. | Add this explicit model scope and note that real rectifier input current may be pulsed. | Closed in revised integrated build; independently inspected |
| P-08 | Substantive mechanical defect | The turntable's modeled stylus is about 204 mm from spindle center, outside its 146 mm record radius. Integrated screenshot visibly places the cartridge over the plinth. | Reshape the arm to put the stylus in the recorded annulus; verify its height at the record. | Closed in revised integrated build; independently inspected |
| P-09 | Substantive quantitative display defect | `axis()` rounds short time axes to 0.1 ms. At 20 kHz the actual 0, 0.025, 0.050 ms ticks appear as 0.0, 0.0, 0.1. | Use adaptive precision or microseconds for short time axes. | Closed in revised integrated build; independently inspected |
| P-10 | Sampling display defect | Top digital plot caps samples at index 500 rather than distributing displayed sample markers over the time window. At low tone/high fs most of the plot has no shown samples. | Draw every kth sample across the whole window, with an explicit stride label when decimated. | Closed in revised integrated build; independently inspected |
| P-11 | Substantive explanatory legibility defect | `axis()` leaves canvas `textAlign=right`; speaker chart's subsequent label is clipped to just “enlarged” at the left canvas edge, visible in integrated screenshot. Similar amplifier annotation is affected. | Restore left alignment before explanatory labels; verify screenshots. | Closed in revised integrated build; independently inspected |
| P-12 | Particle phase defect | Particle equilibrium positions inset 10 pixels at each end, but displacement phase uses n/7 as though positions span the complete pressure axis. | Compute phase from the same normalized x coordinate as the pressure curve. | Closed in revised integrated build; independently inspected |
| P-13 | Quantization assumption omission | Statistical SQNR estimate is shown for an undithered coherent test sequence without explaining that the standard formula assumes uniform uncorrelated error. | State assumptions and distinguish the estimate from measured SNR of the visible sequence. | Closed in revised integrated build; independently inspected |
| P-14 | Sampling-boundary ambiguity | At exactly fs/2 the green sine is one sequence-consistent solution; sampled data do not uniquely determine original sine amplitude and phase. Current “exact baseband sine” wording can overstate uniqueness. | Say “one consistent baseband sine” and add the Nyquist-boundary caveat. | Closed in revised integrated build; independently inspected |
| P-15 | Control precision issue | Log slider step offset makes an intended 100 Hz value approximately 100.0069 Hz while displaying 100 Hz. At fc=100, the user therefore sees -77 dB rather than the exact ideal inverted null. | Round control frequency to its displayed integer-Hz value or provide exact entry/preset. | Closed in revised integrated build; independently inspected |
| P-16 | Scientific scale label gap | The same 0.6 Hz generic 3D cone insert appears in the Subs view, but only the Speakers view states its 0.6 Hz and exaggerated-displacement assumptions. | Add the insert scale/omission note to Subs or suppress that insert there. | Closed in revised integrated build; independently inspected |
| P-17 | Substantive timing defect | `tick()` caps dt at 0.05 s then uses it for scientific elapsed and platter rotation. Independent software-rendered room test advanced only 0.55 animation seconds in 2.594 wall seconds; speaker physics advanced 1.70 in 2.502. This violates stated 0.5 Hz scientific cycles and selected RPM on the tested browser. | Use actual wall-clock elapsed for scientific phase and record rotation while retaining pause/background behavior. Improve render performance where practical and disclose measured software-renderer limits. | Closed; independently measured true wall-clock timing and 45 RPM in final file |

## Independent source verification

Directly opened the Nagra Reference AMP, HD DAC X and original HD PREAMP manufacturer pages and both HD manuals through the web tool. Confirmed Reference AMP 300 W/8 ohms, published 30 W Class A region, 2000 VA transformer and overall dimensions; manufacturer 1200 W maximum consumption per unit. Confirmed DAC FPGA conversion to DSD256, current stage, interstage transformer voltage gain and JAN5963 output tubes. Its RCA/XLR outputs are not simultaneously used, and optional balancing transformers must not be assumed. Confirmed preamp transformer-tap volume, two E88CC tubes, external supercapacitor PSU, and both HD units' two umbilicals. No undocumented Reference AMP circuit details are asserted in current content. The manufacturer's subjective sonic claims were not adopted.

Independently extracted original manufacturer brochure printed p36 from `BoenickeAudio_Brochure_web.pdf` and the original local bass manual from `W13BassAmplifer_2.pdf`. Confirmed original W13 dimensions, twin 13-inch bass with 2 × 350 W Class D, passive 6-inch and 3-inch electrical filter descriptions, rear tweeter, and separate XLR bass input with 4.36 V / 15 dBu maximum and the four published preset frequencies. Proprietary tuning-benefit claims were not adopted.

Sources independently accessed:

- https://www.nagraaudio.com/product/nagra-reference-amp/
- https://www.nagraaudio.com/product/hd-dac-x/
- https://www.nagraaudio.com/product/hd-preamp/
- https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-DAC-X-User-Manual-English.pdf
- https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-PREAMP-User-Manual-English.pdf
- https://boenicke-audio.ch/W13BassAmplifer.pdf
- https://www.linkwitzlab.com/filters.htm
- https://openstax.org/books/university-physics-volume-1/pages/17-3-sound-intensity
- https://openstax.org/books/university-physics-volume-2/pages/9-2-model-of-conduction-in-metals
- https://www.analog.com/media/en/training-seminars/tutorials/MT-017.pdf
- https://www.analog.com/media/en/training-seminars/design-handbooks/P2%20Ch6_final.pdf

## Independent arithmetic checks

Recomputed in Python from the declared model equations, without using specialist numeric answers as inputs:

- Copper drift at 2 A RMS: 0.0998509817 mm/s peak velocity, 0.264862955 micrometres peak displacement; at 10 A, 1.324314776 micrometres peak.
- Selected ideal 2 m TEM-line transit: 10.006922856 ns.
- Plane wave, 80 dB SPL / 100 Hz: 0.2 Pa RMS pressure, 0.484294335 mm/s RMS particle velocity, 1.090045228 micrometres peak displacement, 3.43 m wavelength, 9.685886694e-5 W/m² intensity.
- LR4 at f/fc of 0.5, 1, 2: low-pass -0.5265788, -6.0205999, -24.6089784 dB; high-pass complementary, complex sum magnitude unity. Phase at fc is 180 degrees for each branch.
- RIAA normalized to 1 kHz: +19.2741484 dB at 20 Hz and -19.6203319 dB at 20 kHz.
- Rigid rectangular room axial fundamentals: 28.5833333, 38.1111111, 61.25 Hz for 6.0 / 4.5 / 2.8 m.
- Groove speed at 100 mm radius: 0.349065850 m/s at 33⅓ RPM and 0.471238898 m/s at 45 RPM.

These checks validate equations in the current copy, not yet the chart implementation or integrated behavior.

## Current status

NOT APPROVED. First integrated file (`The Listening Room.html`), `src/app.js` and five actual rendered Physics screenshots (power, DAC, turntable, crossover and speakers) were inspected. This is an integrated review, not merely a plan review. Defects P-08–14 were found in that pass and sent to the author. No staircase myth, racing AC electrons or magnitude-only LR summation was found. Signed alias frequency, quantizer arithmetic, RIAA, normalized voltage/power, LR delayed vector magnitude and plane-wave quantities are implemented correctly; remaining issues concern geometry, label precision, stated assumptions and phase/marker mapping. Final revised inspection and interactive checks remain required.

## Round 2: independent integrated browser controls

Launched the actual HTML by `file://` in a separate offline Chromium context and operated DOM controls (not only helper functions). No page errors occurred. Verified: AC slider 1 and 10 A; 6 kHz input aliases to 2 kHz at 8 ksample/s; 4-bit spacing is 0.125 full scale; preamp -20 dB gives 100 mV RMS, 1 microampere, 0.1 microwatt into the stated 100 kilohms; amplifier 0 dB gives 48.990 V RMS/300 W and -20 dB gives 4.899 V RMS/3 W; LR4 at indicated 100 Hz gives -6.02 dB each and 0 dB aligned sum; 2.5 ms delay gives -3.01 dB; SPL 80/100 changes peak air excursion from 1.090 to 10.900 micrometres; 9 m room length gives 19.06 Hz first length mode; 45 RPM gives 1.35x pitch and 74.1% duration for the fixed 33⅓-cut groove. Air toggle worked. Pause held animation elapsed constant; source selector changed to vinyl. Exact-null control precision issue became P-15.

Round-2 source inspection confirms code fixes for P-01–04 and P-06–13. The replacement RIAA `Op-Amp-Applications/Section6.pdf` source was independently opened successfully and contains the primary chapter. P-05/P-14 labels and P-15/P-16 remain to be integrated/verified. A subsequent independent wall-clock test exposed P-17, which blocks approval despite otherwise correct numerical models.

## Final integrated verdict

**APPROVED for technical correctness. No unresolved substantive physics defects.**

Final inspected artifact: `The Listening Room.html`, SHA-256 `a3e0bba0401a56dbbc9e440719711f919e14c7dee4dde957760cfbecb2e55466`. This is the same exact artifact hash independently inspected by the visual critic. Final source and screenshots include the last W13 center-piece and generic teaching-dustcap changes.

Independent offline Chromium/SwiftShader browser results are saved in `tests/physics-final.json`. No external network requests or page errors occurred. Actual DOM operations verify the 100 Hz / 100 Hz LR4 lesson now reaches an ideal null for inverted low-band polarity and for 5 ms low-band delay. The generic moving-coil frame remained at z=0.19 while cone, coil and dustcap changed by exactly the same axial displacement. The selected 45 RPM record measured 44.99999999999986 RPM. Pause held elapsed time constant. The vinyl route and Wiring-map modal opened correctly.

Final scientific elapsed equals wall elapsed: a measured 2.2499 seconds produced 2.2499 scientific seconds in both room and speaker-physics runs. This closes P-17. Rendered chart inspections confirm the 0.000/0.025/0.050 ms short axis, samples distributed throughout the 96 ksample/s / 20 Hz window with explicit stride, legible pressure-particle labels, corrected playing stylus, and the new 2 m TEM experiment's 0.999 m propagation at 5 ns and 10.007 ns arrival. The latter is explicitly a matched-line teaching example, not a measured power cord.

Screenshots actually inspected include `physics-final-geometry.png`, `physics-final-wiring.png`, `physics-final-field-5ns.png`, `physics-final-field-arrival.png`, `physics-final-sampling-dense.png`, `physics-final-time-axis.png`, `physics-final-crossover-null.png` and `physics-final-turntable.png`.

Performance boundary: the solo software-rendered 1600×1000 run measured approximately 4.44 fps in the complete room, 20.00 fps in speaker physics and 8.44 fps in turntable detail. These are not hardware-accelerated browser benchmarks. The mathematical timing remains correct at those frame rates. Root was explicitly asked to verify the hardware/Metal browser separately before claiming smooth performance, and to disclose software-renderer limitations. Physics approval is not a claim of universally smooth rendering or factory-CAD fidelity.

Audit transparency: an earlier final-pass script reached all scientific capture states but failed at a reviewer-written selector typo (`wiringButton` instead of `mapButton`). This was a test-script issue, not an exhibit defect. The corrected final pass completed successfully and produced the saved result above.
