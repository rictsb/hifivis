# Power amplification — verified Nagra Reference AMP

Verified 2026-09-06. Model selection is settled: the owner specified **Nagra Reference AMP**, which is an actual model, distinct from the HD AMP. Do not silently substitute HD AMP.

## Product facts suitable for exhibit copy

Nagra lists 300 W into 8 Ω, including a 30 W Class A operating region. Each monoblock has a 2000 VA epoxy-potted transformer, balanced XLR and unbalanced RCA inputs, selectable 1 or 2 Vrms sensitivity, and an 88 kΩ balanced input impedance. Published dimensions are 238 × 644 × 542 mm (W × H × D), with 56 kg per unit. The front has a Modulometer and clipping indicator. Rear A/B outputs provide different damping factors: they are **alternatives, not independent frequency-band amplifier channels**. Nagra specifies WBT binding posts, adjustable feet using phenolic and copper, internal mechanical damping, a Reference medallion and chamfered casework. Maximum listed mains consumption is 1200 W; this is not normal listening consumption or output power. The page also states 1000 W at lower impedance without naming the load, so do not graph that as a specific rated operating point. Its prose claims increased Class A range, but the table remains 30 W; retain the published table value and avoid elaborating.

Primary: [Nagra Reference AMP](https://www.nagraaudio.com/product/nagra-reference-amp/).

## Authentic photographs inspected

All three were downloaded directly from the official product page and opened at native resolution with the image-viewing tool:

- `research/references/amp-reference-pair.png` — [official pair photograph](https://www.nagraaudio.com/wp-content/uploads/2024/11/Nagra-Reference-Amplifier-duo-1920x1080.png).
- `research/references/amp-reference-single.png` — [official single photograph](https://www.nagraaudio.com/wp-content/uploads/2024/11/Nagra-Reference-Amplifier-single-752x551.png).
- `research/references/amp-reference-rear.png` — [official rear/front photograph](https://www.nagraaudio.com/wp-content/uploads/2024/11/Nagra-Reference-Amplifier-back2-1920x1081.png).

Modeling observations: extremely narrow, tall brushed-metal front; **smooth side panels, not exposed side heatsink fins**. Meter is a warm amber semicircular window inside a circular silver instrument bezel, centered high on the front. Beneath it is Nagra's small silver peclette rotary control with a dark red horizontal stripe. A tiny round REF medallion sits at top-left, and NAGRA engraving sits near the bottom. The body has subtly chamfered edges and a fine vertical grain. Four large cylindrical isolation feet sit on outriggers; alternating silver and black horizontal layers give them a stacked appearance. Rear upper quarter has a large dark mesh vent. Below that are the line inputs; lower down are two vertically stacked pairs of binding posts, then triggers and IEC mains entry near the bottom.

Proportion inference, explicitly approximate: body width about 170 mm, height about 610 mm, depth about 500 mm; foot span about 238 mm and total height about 644 mm. Treat 238 mm as overall span rather than front-panel width. These estimates preserve the photographed front height/width ratio. The official predecessor HD AMP dimension drawing supports the narrow body/foot-span distinction but is **not a REF mechanical drawing**: [HD AMP dimensional context](https://www.nagraaudio.com/wp-content/uploads/2021/05/HD-AMP-dimensions.pdf). The drawing and rendered preview are saved with `amp-HD-dimensions-context` names. The older drawing's connector-inclusive depth is 589 mm; do not silently apply it to Reference AMP.

## Interfaces and electrical topology

**Input:** one balanced line connection per channel from HD PREAMP. Model differential conductors 2 and 3 and a separate cable shield/pin 1. Signal input current closes through the balanced source/receiver circuit, not through protective earth. A single cable in the installation may represent all conductors, but inspection mode must expose their roles.

**Output:** each monoblock's chosen pair of +/− posts connects to one W13's normal speaker input. Two conductors complete the external circuit. Conventional current flows in opposite physical directions in the paired leads at a given instant and reverses with the waveform. Do not label the − post as earth or chassis without a circuit diagram. Do not join negative speaker posts between monoblocks. Do not connect A/B as low/high bands, or externally wire straight to individual W13 drivers. Internal W13 distribution belongs to the loudspeaker subsystem; its active bass arrangement requires its own AC supply.

**Energy:** the small input signal controls output power drawn from the amplifier power supply. The signal is a pattern, not an energy packet poured from DAC through every box. Show three distinct conceptual layers: balanced input voltage; supply energy and heat; speaker-terminal voltage/current.

**Factory internals boundary:** the Reference page confirms transformer and input-stage changes but does not publish a service circuit, exact rails, number of output devices or capacitor bank. HD AMP's page documents MOSFETs and 264 mF, but those details must not be asserted as verified Reference construction. A visible transistor cutaway must say **“generic linear amplifier principle; not a Nagra circuit diagram.”** Never label the Reference amp as a tube amplifier. Do not illustrate a Class-D PWM power stage as its topology.

## Concise exhibit text

**Power, following a pattern.** The preamp supplies a small changing voltage. A powered output stage follows that pattern while supplying the much larger current demanded by the loudspeaker. The energy comes from the power supply. Some becomes mechanical motion and sound; much becomes heat.

**Two wires, one circuit.** The loudspeaker current has a complete outward and return path. Both leads carry the same series current; its direction reverses with the audio waveform. Protective earth has a different job and is not the normal speaker-current return.

**What Class A means.** In the Class A region the output devices remain conducting throughout the waveform. Their standing current causes heat even with silence. This is a biasing regime, not a claim that every watt from the wall reaches the speaker.

Generic principles: [Analog Devices, amplifier energy and signal](https://wiki.analog.com/university/courses/electronics/text/chapter-9); [Analog Devices, Class A definition](https://www.analog.com/en/resources/glossary/class-a.html); [Analog Devices, linear output stages](https://www.analog.com/en/resources/analog-dialogue/articles/class-d-audio-amplifiers.html). These are explanatory circuit sources, not evidence of Nagra's proprietary topology.

## Interactive quantities and checked arithmetic

Use a separately labeled **ideal 8 Ω resistor demonstration**, not a W13 impedance simulation. Let `v(t)=sqrt(2) Vrms sin(2π f t)`, `i(t)=v(t)/R`, and `p(t)=v(t)i(t)`. Then average real power `P=Vrms²/R`, `Irms=Vrms/R`, `Vpeak=sqrt(2) Vrms`. All powers below are average power for a sinusoid, even though manufacturers colloquially write “W RMS.”

| Average power | Vrms | Irms | Vpeak | Ipeak |
|---:|---:|---:|---:|---:|
| 1 W | 2.828 V | 0.3536 A | 4.000 V | 0.5000 A |
| 10 W | 8.944 V | 1.118 A | 12.649 V | 1.581 A |
| 30 W | 15.492 V | 1.936 A | 21.909 V | 2.739 A |
| 100 W | 28.284 V | 3.536 A | 40.000 V | 5.000 A |
| 300 W | 48.990 V | 6.124 A | 69.282 V | 8.660 A |

Doubling voltage gives four times the power into this fixed resistor: +6.0206 dB. Doubling power gives +3.0103 dB. An ideal gain of 24.495 V/V follows from 48.990 Vrms output at 2 Vrms sensitivity; that is 27.782 dB. At the 1 Vrms setting it is 48.990 V/V, or 33.802 dB. These are inferred gain examples from published rating and sensitivity, not independently measured Nagra transfer functions.

A real loudspeaker is a complex, frequency-dependent load. In sinusoidal steady state, `I=V/Z(f)` and average real power is `Vrms Irms cos(phi)`; reactive energy can return to the amplifier. Do not use `Vrms²/8` as measured W13 power. Distinguish meter animation (“illustrative level”) from a modeled calibrated power reading. If rendering clipping, use a generic ceiling (e.g. ±40 V), clearly labeled; do not imply that Nagra hard-clips at the ideal rated voltage.

Formulas cross-checked against [OpenStax AC circuits](https://openstax.org/books/university-physics-volume-2/pages/15-2-simple-ac-circuits) and [OpenStax AC power](https://openstax.org/books/university-physics-volume-2/pages/15-4-power-in-an-ac-circuit).

## Animation contract and audit points

- Front meter moves slowly with an RMS/envelope proxy, never one swing per audio cycle. Caption if uncalibrated.
- Circuit current arrows reverse on both leads and the display closes the loop through source and load.
- If tiny dots represent electrons, show **local oscillation** and calculate displacement elsewhere from density, conductor area, frequency and current. Never race them from amp to speaker as the signal.
- Draw plots with actual seconds/ms/µs axes. A 1 kHz wave rendered at 1 cycle/s is 1000× slow motion; label this.
- Frequency slider changes phase progression, not voltage or power at fixed Vrms into the ideal resistor.
- Volume slider changes voltage by `10^(dB/20)`; power by `10^(dB/10)` under the fixed-load assumptions.
- All glow, current-arrow sizes, and internal placements are schematic; no unsupported claims about subjective sonics or damping-factor A/B outcomes.

Substantive uncertainties: no publicly linked Reference AMP manual or service schematic found on its product page; dimensions available as published overall specs, body estimates photo-derived. Generic explanatory internals must remain visibly distinguished from documented equipment.
