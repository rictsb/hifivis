# Power, conditioning and grounding

Verified 2026-09-06. The conditioner is an **unbranded educational design**, not a reconstruction of an AudioQuest, Nagra or other proprietary circuit. Its appearance may share the exhibit's wood, satin metal and restrained lighting. A sectional diagram must retain the label “generic electrical principle; schematic layout”.

## System interface: power is a parallel network

Draw mains distribution separately from the audio tree. Its outlets are parallel loads, never a series chain through the streamer, DAC and amplifier. Each AC cable includes line **L**, neutral **N**, and protective earth **PE** where Class I construction applies. The complete ordinary load-current path runs from the source winding along L, through the equipment power supply, and back along N to that winding. Its instantaneous direction reverses. PE bonds exposed conductive chassis to the protective system; it is not the ordinary power-current return. Small designed leakage currents can exist, so avoid claiming that PE always carries exactly zero current. An illustrative fault loop returns through PE to the upstream neutral/source bonding point, not merely into an absorbing patch of soil. Do not add an N–PE bond inside the conditioner.

Power destinations in the installation:

| Branch | AC-fed unit | Downstream supply path |
|---|---|---|
| Digital source | Generic streamer power supply | Internal electronics; show both supply and return |
| DAC | Dedicated HD DAC X HD PSU | Two matched umbilicals to HD DAC X audio chassis |
| Vinyl | Generic turntable motor supply | Motor; cartridge signal is a separate passive generator circuit |
| Phono | Generic phono supply | Phono gain/EQ electronics |
| Preamplifier | Dedicated HD PREAMP HD PSU | Two matched umbilicals to HD PREAMP audio chassis |
| Distribution/crossover | Generic powered line-level buffer/crossover | Audio circuit and return |
| Main left/right | Each Reference AMP | Its internal power supply |
| W13 left/right | Each speaker's own AC connection | Internal bass amplifier; separate from external monoblock circuit |
| Sub left/right | Each powered subwoofer | Own amplifier; line inputs are separate |

For the generic boxes, select an explicitly declared Class I enclosure model rather than inventing actual commercial safety classes. For branded gear show verified mains connectors and externally observable connections; do not invent internal grounding pinouts. Conditioner PE continues through AC cables and outlet safety contacts, not through audio signal shields.

Nagra's HD PREAMP manual identifies Class I construction, mains entering the separate HD PSU, and two LEMO supply cables. DAC and preamp PSUs have different configurations and are not interchangeable. The preamp manual distinguishes its XLR pin-1/chassis switch from protective mains earthing. Represent a matched pair of umbilicals per device; do not put a second mains inlet on the audio chassis. The HD PREAMP's published ground post is not justification for invented extra ground straps. [HD PREAMP manual, printed pp. 6, 11–13, 19–20](https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-PREAMP-User-Manual-English.pdf). HD DAC X pairing is separately shown in its [manual, printed pp. 11–13](https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-DAC-X-User-Manual-English.pdf).

Reference AMP specifies a C19 cord connection and maximum consumption of 1200 W per monoblock. Two simultaneous nameplate maxima alone exceed a 120 V × 15 A supply, before other equipment. Thus do not label one 15 A conditioner as supporting the whole system at full rated draw. The exhibit can depict appropriately rated distribution without an invented branch rating, while keeping the 1–10 A model a **separate conductor demonstration**, not a measured total system current. [Reference AMP specification](https://www.nagraaudio.com/product/nagra-reference-amp/).

Primary grounding explanation: [OSHA, identification of grounded and equipment grounding conductors](https://obis.osha.gov/dte/library/electrical/electrical.html). This describes the return-to-source function. It does not mean an audio signal's reference node must be shorted to PE everywhere.

## Signal reference, circuit return, shield and chassis

- **Unbalanced analog:** center conductor and outer return form a signal circuit. The outer conductor often also shields; it is not therefore a replacement for PE.
- **Balanced analog:** show the differential pair as the signal circuit, and shield/pin 1 as a separate conductor. The receiver responds to the voltage difference. Do not animate normal differential audio current disappearing into earth.
- **Speaker output:** the selected +/− pair and driver/network complete one loop. The negative binding post is not automatically earth; do not join independent monoblock negatives.
- **Cartridge:** each coil has its own two terminals. A turntable chassis/tonearm ground lead is a separate connection from the four cartridge signal leads.
- **PSU umbilical:** supply voltages and returns are contained in a connector assembly. Unknown pins stay undisclosed. It is neither a one-wire source of electrons nor an additional analog audio path.

Ground-loop explanation, if needed: an extra conductive path can support an unwanted circulating current and create a voltage across shared impedance. Balanced reception and correct shield/bonding practice address particular coupling mechanisms. There is no universal benefit to disconnecting arbitrary “grounds”. In this exhibit protective-earth connections remain continuous.

## Local electron drift: derived, not guessed

This is a **uniform current-density, sinusoidal conductor model**, not the actual pulsed input current of a capacitor-input rectifier. Given copper carrier density `n=8.5e28 m^-3`, area `A=2.08 mm²=2.08e-6 m²`, elementary charge magnitude `e=1.602176634e-19 C`, frequency `f=60 Hz`, and adjustable RMS current `I=1…10 A`:

```text
ω = 2πf
i(t) = √2 I sin(ωt)                conventional current toward +x
v_e(t) = −i(t)/(n e A)             ensemble electron drift velocity
x_e(t) − x₀ = [√2 I/(n e A ω)] cos(ωt)
v_e,peak = √2 I/(n e A)
x_e,peak = √2 I/(n e A 2πf)
n e A = 28,326.48288912 C/m
```

The displacement formula follows by integrating velocity. Electron drift opposes conventional current. Displacement and current are a quarter-cycle apart: at a displacement extreme, instantaneous drift velocity/current is zero. The net coherent displacement over a complete AC cycle is zero. Random microscopic motion and scattering are not shown; a visible marker represents local average displacement, not a track of an individually resolved electron.

| RMS current | Peak drift velocity | Peak displacement from center | Peak-to-peak displacement |
|---:|---:|---:|---:|
| 1 A | 0.0499255 mm/s | 0.132431 µm | 0.264863 µm |
| 2 A | 0.0998510 mm/s | 0.264863 µm | 0.529726 µm |
| 5 A | 0.249627 mm/s | 0.662157 µm | 1.32431 µm |
| 10 A | 0.499255 mm/s | 1.32431 µm | 2.64863 µm |

These numbers were recomputed using Python's full-precision `math` functions. A larger wire gives less drift for the same current; higher frequency gives less displacement for the same RMS current. No “millimetres per hour” rule is valid without these assumptions. The governing relation `I=nqAv_d` is derived in [OpenStax, conduction in metals](https://openstax.org/books/university-physics-volume-2/pages/9-2-model-of-conduction-in-metals). Density here is an explicitly selected model assumption.

**Animation contract.** In the detailed power view, show L and N as two continuous traces closed through a source and load. Put a small set of fixed-center electron clouds on each wire; oscillate each locally using the displacement equation. On L, `δx=+xpeak cos(phase)` and on a physically parallel N track `δx=−xpeak cos(phase)` for the same screen coordinate convention. All clouds on an electrically short loop are approximately phase-coherent. Draw conventional-current arrows opposite instantaneous electron velocity. Keep PE still in normal-load mode and label its role. A 0.5 Hz displayed cycle corresponds to **60 Hz slowed 120×**. Use a labelled displacement axis or explicit µm-per-pixel scale; if displacement is enlarged, state “displacement magnified”. Do not animate these dots traveling down the length of the cord.

**Small readable copy:** “The field establishes current around a complete circuit. Copper's electrons respond locally. In this 60 Hz example their average drift oscillates through only fractions of a micrometre to a few micrometres; they do not race from the outlet into the amplifier.”

## Electromagnetic propagation: a separate cable experiment

Use a separate **ideal low-loss, nonmagnetic TEM transmission-line example**, with matched termination, effective relative permittivity `εeff=2.25`, and length `ℓ=2 m`. This is not a measured mains-cord speed. For this selected model:

```text
c = 299,792,458 m/s
v = c/√εeff = 199,861,638.6667 m/s
τ = ℓ/v = 10.0069228559 ns
```

A single gently colored band can show a voltage/current disturbance traveling along the **paired conductors**. It is labelled “electromagnetic disturbance”, not “electron”. Depict a receiver responding when the wave arrives. A displayed transit time of 1 s equals approximately **99.93 million× slow motion**; alternatively give a nanosecond slider instead of a clock-based slow-motion claim. Keep a stated matched load so omitted reflections are defensible. Different geometry, materials, losses and frequency change propagation; do not publish two-thirds of light speed as a universal law. The standard relationship and effective-permittivity qualification are discussed in [Texas Instruments, High-Speed Layout Guidelines, §1.3.1](https://www.ti.com/lit/pdf/SCAA082A).

Keep this nanosecond example distinct from the 16.67 ms mains period. A 60 Hz phase delay over this specific ideal 2 m line would be only about `3.7725e-6 rad`; a dramatic traveling 60 Hz sine along a two-metre cord would be visually false without a schematic warning.

**Small readable copy:** “The electrical pattern propagates through electromagnetic fields associated with the conductors. Propagation is fast; local electron drift is slow. These are different motions, shown on different time scales.”

## What a conditioner can defensibly demonstrate

A generic section can show an inductive filter, safety-rated capacitors and separate surge-protection symbol. A power-line EMI filter can attenuate specified common-mode or differential-mode interference; performance depends on frequency and source/load impedances. A common-mode choke's opposing normal load currents largely cancel core flux, while common-mode disturbance currents produce reinforcing flux. Across-line X capacitors and line-to-chassis Y capacitors have distinct paths. The latter permit limited leakage, which is why an absolute “no earth current” claim is wrong. [TDK, General Technical Information of Power Line EMC Filters, noise modes and equivalent circuits](https://product.tdk.com/system/files/dam/doc/product/emc/emc/power-line/general_tech_info/generaltec_power-line_en.pdf). [Murata, AC line suppression example](https://www.murata.com/~/media/webrenewal/products/emc/emifil/knowhow/26to30.ashx) explicitly traces the common-mode noise return path.

Use functional blocks unless all schematic paths are drawn correctly. **Filtering is not regeneration, voltage regulation or guaranteed removal of every waveform imperfection.** Do not animate it removing the 60 Hz fundamental, converting AC into permanent DC for all equipment, creating reserve watts, or revealing previously absent musical detail. Do not claim audible benefits from this illustration.

For an interactive filter plot, a generic normalized first-order low-pass model `H(jf)=1/(1+jf/fc)` is mathematically honest only with the label **“ideal filter example; not this conditioner’s measured response.”** Its magnitude is `1/√(1+(f/fc)²)` and phase `−atan(f/fc)`; at `fc`, magnitude is −3.0103 dB and phase −45°. A chosen `fc=20 kHz` passes a 60 Hz component at −0.0000391 dB and gives −20.0432 dB at 200 kHz. This simple transfer function is pedagogical, not an EMC network design. Plot interference on a separate frequency axis rather than disguising its high frequency as large, slow undulations on the mains sine.

## Independent check of power-amplification.md

Reviewed another specialist's note against the live Reference AMP page, HD PREAMP output documentation, and independently recomputed every row of its resistor table and both inferred gains. **No substantive arithmetic or topology error found.** It correctly distinguishes Reference AMP from HD AMP, uses 300 W into 8 Ω and the published 30 W Class A table entry, treats A/B posts as alternatives, avoids undocumented MOSFET/capacitor claims, and closes both speaker conductors. Gain results 27.7815 dB and 33.8021 dB match.

Integration additions, not rejections: (1) add Reference AMP's C19 power connector to the model if its back is visible; (2) do not imply a 15 A common conditioner supports simultaneous maximum system draw; (3) preserve the preamp's distinction between XLR pin-1/chassis setting and mandatory PE. Generic resistor examples must remain visibly separate from the real W13 impedance, which has not been measured here.
