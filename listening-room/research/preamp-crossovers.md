# HD PREAMP and crossover specialist report

Verified 2026-09-07. The subject is the original **Nagra HD PREAMP**, not Reference PREAMP or another HD generation. This report owns neither W13 internal filter details nor amplifier specifications; see the loudspeaker/amplifier specialist reports. Manufacturer assertions are separated from mathematical teaching models.

## Essential architecture handoff

The exact HD PREAMP manual distinguishes its main XLR/RCA outputs from REC/AUX. The front switch selects **XLR OR main RCA**. REC/AUX can instead select a volume-following AUX output; REC has fixed level. Therefore never draw main XLR and main RCA as simultaneously active. Use RCA1 for DAC and RCA2 for phono as alternative selected sources. XLR inputs are unbalanced unless optional transformers are installed. Main XLR outputs are balanced. [Manufacturer manual, printed pp16–19](https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-PREAMP-User-Manual-English.pdf)

Recommended exhibit routing, coordinated with speakers specialist:

```
Streamer → HD DAC X ─ RCA stereo ─┐
                                 ├→ HD PREAMP input selector / level
Turntable → phono ─ RCA stereo ──┘
                                  ├ main XLR L → Reference mono L → W13 L passive binding posts (+ and −)
                                  ├ main XLR R → Reference mono R → W13 R passive binding posts (+ and −)
                                  └ AUX RCA stereo → generic high-impedance stereo input buffer
                                                         ├ unity full-range balanced L/R → W13 L/R bass XLR
                                                         └ independent LP L/R → powered sub L/R
```

The buffer and sub crossover can occupy one generic educational enclosure. Each L/R destination is a separate amplifier channel. Never join two amplifier outputs; never wire L/R together with a Y-cable. For a mono sub demonstration, use an active summing stage, preferably (L+R)/2 to preserve headroom on correlated mono input, with stated coefficients. A stereo sub branch avoids that extra assumption. Keep protective earth paths and circuit returns visible separately when wiring is isolated.

The AUX function is documented; the generic buffer output count, impedance and branch behavior are design assumptions for this exhibit, not Nagra features. The manual describes AUX separately but does not explicitly publish a simultaneous-XLR/AUX loading test; use a high-Z load and label the external buffer schematic. A defensively certain alternative is HD PREAMP main XLR L/R → generic balanced distribution buffer → full-range outputs to both monoblocks and W13 bass, with separate sub LP outputs. That requires no AUX independence assumption but places the generic unity buffer in the amplifier route. Main W13 feeds stay full range in either arrangement; do not externally apply the educational LR4 high-pass to stock W13 while calling it the documented installation.

## Exact model construction and appearance

Nagra documents dual-mono tube circuitry without feedback, two E88CC tubes, output-transformer tap selection for volume, and an external supercapacitor supply. Those are valid cutaway labels; a glowing transformer field or enlarged tube cross-section must be marked schematic. Do not invent circuit layouts, turns counts, voltages, or sound improvements. [Manufacturer product page](https://www.nagraaudio.com/product/hd-preamp/)

Two dedicated LEMO umbilicals connect the matching PSU and audio chassis. The meter can show input or output level, with black L/red R needles and 0 dB corresponding to 1 Vrms. Separate motorized volume controls may be synchronized. The output pin-1 ground lift changes the audio-ground/chassis bond and **does not lift protective mains earth**. [Exact manual, pp11–13, 15, 19, 22–23](https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-PREAMP-User-Manual-English.pdf)

Use the newer 2021 mechanical drawing for outer envelope: **D439 × W438 × H121–130 mm per chassis**; stack H237–260 mm depending on feet. The visible body is narrower than the suspension envelope. Drawing and photos indicate approximately W320 mm for the rectangular center body, with four substantial cylindrical isolation columns outside it. Each column has multiple silver discs separated by dark horizontal gaps; a dark-edged isolation platform links the columns underneath. PSU is 16.5 kg; audio chassis 13.5 kg. The product text's 438×396×121 mm and older manual's 433×436×121 mm are less consistent dimension summaries; do not treat them as literal body widths. [Manufacturer 2021 dimension drawing](https://www.nagraaudio.com/wp-content/uploads/2021/05/HD-series-dimensions.pdf)

Observed photographs, all downloaded and inspected locally:

- `research/references/preamp-stacked-front.jpg` — [official front photograph](https://www.nagraaudio.com/wp-content/uploads/2018/12/nagra-hd-preamp-all3-1920x1080.jpg). Brushed silver center panel, subtly rounded corners. Left circular amber modulometer in machined concentric surround, lower rounded projection obscuring the bottom dial. Twin smaller volume knobs centered, separate L/R; each has a raised horizontal finger bar and etched radial scale. Large right selector has a raised oblique bar and red equatorial stripe. Six input/off positions around the selector. Tiny metal toggles at bottom; Nagra logo upper center, Swiss marking lower right. PSU front plain with centered Nagra logo, same suspension.
- `research/references/preamp-front.jpg` — [official close oblique photograph](https://www.nagraaudio.com/wp-content/uploads/2018/12/24301269_1767126706664851_2145518284972182141_n-752x551.jpg). Confirms warm amber dial, sharp engraving, fine brush direction and substantial chamfers. The meter is not a glowing rectangular VU display.
- `research/references/preamp-back.jpg` — [official rear photograph](https://www.nagraaudio.com/wp-content/uploads/2018/12/HD-preamp_back-2-752x500.jpg). Audio rear connectors arranged in mirrored channel groups; two central LEMOs below bypass XLR sockets. Body occupies ~73% total width. Picture shows PSU's plain front beneath a reversed upper chassis, so do not use the lower panel as a PSU rear reference.

These are authenticity references, not embedded documentary rights clearance or a claim of dimensional CAD accuracy. Real geometry estimated from photography must be labeled exterior study if an exact reproduction is asserted.

## UI-ready explanations

**Choose one recording.** “The preamp selects either the DAC's analog output or the phono stage. These are alternative entrances, not consecutive steps.”

**Voltage controls voltage.** “A line signal is a changing voltage between circuit conductors. Very little current is needed by the next high-impedance input. Local charge motion and electromagnetic fields establish that signal; audio is not a stream of electrons carried from the recording.”

**The Nagra volume control.** “In this HD PREAMP, output-transformer taps set the level. The drawing shows the principle, not the proprietary winding layout. Lower level means a smaller analog voltage sent to every volume-following branch.”

**Two jobs inside each W13.** “The external Nagra monoblock drives the passive section. A separate full-range line feed supplies the W13's own powered bass system. Our added subs receive their own low-pass branch.”

**Explore an ideal crossover.** “This separate teaching filter is not the W13 crossover. It divides one signal into high and low bands before amplification. Complementary electrical filters only become complementary sound if the drivers, positions and delays also match.”

## Quantitative volume model

Define demo source level **1.000 Vrms**, sensitivity LOW, reference volume 0 dB as unity gain for the normalized exhibit signal. Voltage gain `g = 10^(levelDb/20)`. At −20 dB, output is 0.100 Vrms. For an illustrative purely resistive 100 kΩ input, load current is 1.00 µArms and delivered signal power 0.100 µW. At 1 Vrms it is 10 µArms and 10 µW. These refer to signal power at that input, **not preamp mains consumption**. Expose the assumed load. Do not confuse dB voltage ratios with dBW or dB SPL. Volume affects waveform amplitude, not electron propagation speed or frequency. Actual maximum output, tap ratios, device input load, tube rails and clipping need their own specifications; do not infer them from this normalized demo.

Transformer cartoon: changing primary current produces changing core flux, which induces secondary voltage. Both windings have their own closed circuits. An ideal turns ratio sets voltage ratio; actual tap positions and parasitics are unspecified. A tap-selection animation may step 0.5 dB (manual remote step), but visually spaced taps are schematic and not evidence of actual winding geometry.

## Educational analog LR4 crossover — derived from first principles

An ideal fourth-order Linkwitz–Riley filter cascades two second-order Butterworth sections, each Q=1/√2. This is a generic analog transfer-function model, not sampled DSP and not W13 internals. Set `ωc=2πfc` rad/s, `s=jω`, and normalized complex frequency `p=s/ωc`:

```
LP(p) = 1 / (p² + √2 p + 1)²
HP(p) = p⁴ / (p² + √2 p + 1)²
```

For real frequency ratio `r=f/fc`, let `D=(1-r²+j√2r)²`. Compute complex `LP=1/D`, `HP=r⁴/D`. Their **magnitude** responses are `|LP|=1/(1+r⁴)` and `|HP|=r⁴/(1+r⁴)`. Both have common phase `φ=-2 atan2(√2r,1-r²)` (unwrapped 0 to −2π); the HP phase may alternatively be written 360° higher. Neither branch is zero-phase. `LP+HP` has unity magnitude with frequency-dependent all-pass phase, so do not claim a time-aligned copy of the input. Electrical summation is a theoretical measurement; never wire power outputs together.

For a sinusoidal display with input peak A, use `yLP=A|LP|sin(2π f t + φ)` and `yHP=A|HP|sin(2π f t + φ)`. State time slowdown explicitly. Magnitude-dB display is `20log10(|H|)`; clamp a graph at −60 dB only for drawing, not arithmetic. Far into the stopband the attenuation approaches 24 dB/octave. This is asymptotic, not exactly the difference between fc and 2fc.

Independent Python complex-arithmetic spot check:

| f/fc | LP magnitude | HP magnitude | LP dB | HP dB | sum magnitude |
|---|---:|---:|---:|---:|---:|
| 0.5 | 0.94117647 | 0.05882353 | −0.52658 | −24.60898 | 1.000000 |
| 1.0 | 0.50000000 | 0.50000000 | −6.02060 | −6.02060 | 1.000000 |
| 2.0 | 0.05882353 | 0.94117647 | −24.60898 | −0.52658 | 1.000000 |

At fc each branch is −0.5 as a complex coefficient (180° phase), and sums to −1. Matching polarity is correct for LR4. At f=80 Hz a 1 ms extra LF delay rotates it by −28.8°; ideal normalized sum is 0.968583 = −0.277262 dB. A 3.125 ms delay produces −90° extra phase and −3.0103 dB sum; 6.25 ms gives −180° and exact cancellation **only for these ideal coincident, equally scaled branches**. Calculate sum as complex vectors `HP + LP exp(−j2πfτ)`, never as sum of magnitudes if delay/polarity differs. A 1 m path difference at c=343 m/s is 2.915 ms and must be included if converting placement into delay.

The actual installation's W13 full-range feeds plus added LP subs do **not** inherit the ideal LR4 flat-sum result. Label any graph overlay “ideal matched two-way teaching system” and visually separate it from actual W13 paths. Integration in a real room requires measured driver/room responses, level, delay and polarity alignment; the exhibit cannot predict that user's measured bass response.

Primary technical reference for the filter principle and acoustic caveat: [Siegfried Linkwitz, Active Filters §1 and §3](https://www.linkwitzlab.com/filters.htm). The calculations above are explicit mathematical derivations checked in Python, not quoted product measurements.

## Concrete rejection checklist for reviewers

1. Reject simultaneous main RCA+XLR routing, REC mistaken for volume-following AUX, or default XLR input called balanced.
2. Reject W13 bass powered only from external monoblock terminals; a separate line feed is mandatory per speaker specialist.
3. Reject external LR4 coefficients described as W13's internal filter or flat room response.
4. Reject −3 dB at LR4 fc, magnitude-only sums after delay, zero-phase language, or power-output electrical summing.
5. Reject resistor-potentiometer cutaway labeled HD PREAMP, generic rectangular front meter, missing second chassis/LEMO leads, or plain 438 mm rectangular body.
6. Reject output ground lift drawn as a mains earth disconnect.
