# Vinyl playback and phono amplification — verified brief and interfaces

Verified 2026-09-07 UTC. Turntable, moving-coil cartridge and phono stage are **generic educational components**, with walnut and machined-metal exteriors belonging to the shared exhibit design. Their cutaways must not be presented as any Nagra product or as the user's actual cartridge. The user specified exact branded models for other components, not these.

## Explicit subsystem interfaces

- Mechanical input: a rotating record carries a continuously varying stereo groove. The platter motor draws electrical power through its power supply; the cartridge generates a signal from mechanical movement and need not receive mains power.
- Electrical output: cartridge L+ and L− form one complete coil/input-load circuit; R+ and R− form the other. Show both conductors per channel. A separate tonearm/chassis bonding lead can run to the phono chassis terminal and must be distinguished from these signal returns and from protective earth. It is not a universal third audio channel or obligatory current return.
- The phono input is **MC compatible**, with generic 100 Ω input loading for this exhibit. Treat its input as a finite load, not a free-floating glowing signal terminal.
- The phono stage supplies gain and playback RIAA equalization; its analog L/R line output goes to a dedicated preamp line input. The preamp selects **phono OR DAC**. Vinyl never passes through the streamer or DAC in the depicted analog path.
- Both phono amplifier and turntable motor have power feeds. Signal energy from the cartridge is small; the phono stage's power supply supplies the energy used in the amplified output.

Recommended wiring annotation: `Cartridge → MC phono / RIAA → HD PREAMP selected analog input`. Show this as the alternative to `Streamer → HD DAC X → HD PREAMP`, with a visible input-selector junction rather than one serial chain.

## What to explain

**The groove is a mechanical signal.** A stylus follows the two walls of a 45/45 stereo groove. With the coordinate convention defined below, equal left/right signals produce lateral motion; opposite-polarity signals produce vertical motion. The fine motion is transferred through the cantilever. [Ortofon stereo-groove explanation](https://ortofon.com/pages/2m-mono-se).

**A moving-coil cartridge is a generator.** Its coils move relative to a magnetic field; changing magnetic flux linkage induces a voltage. In a simplified linear model, output is proportional to the stylus velocity projected on the channel axis, not directly to its displacement. Coil placement, winding count, field shape and cantilever details are intentionally generic. [Ortofon MC operating principle](https://ortofon.com/pages/what-is-mc).

**The phono stage restores the balance.** Records use a prescribed recording equalization; playback applies its inverse while raising the small cartridge signal to line level. In the exhibit, 60 dB gain at 1 kHz means a voltage multiplication of 1,000: 0.5 mV RMS at the input becomes 0.5 V RMS at the output. This is an assumed operating point, not a Nagra specification. A commercial 0.5 mV cartridge rating at a stated 1 kHz groove velocity demonstrates that this is a plausible scale, but the manufacturer's velocity-rating convention is not silently treated as a peak or RMS displacement calibration. [Ortofon MC Tango specifications](https://ortofon.com/pages/mc-tango).

## Generic 45/45 mechanical cutaway

Define horizontal lateral displacement as x, upward vertical as z, and the groove's tangential direction as y. Let qL and qR be the displacements on the two orthogonal channel axes (these are groove coordinates, already reflecting recording equalization). Then choose:

`x = (qL + qR)/sqrt(2)`

`z = (qL − qR)/sqrt(2)`

`qL = (x + z)/sqrt(2); qR = (x − z)/sqrt(2)`

The sign of the vertical coordinate depends on viewing and channel-polarity convention; state ours. Do not confuse these displacement coordinates with the original unequalized electrical program. Presets **Mono L=R**, **Left only**, **Opposite L=−R** make the geometry immediately visible. Label the last preset a teaching signal rather than normal stereo music.

Model two sloping groove walls, a small contact stylus on both walls, a cantilever, a pivot/support, a moving armature with two abstract coils and a fixed magnetic circuit. Cutaway geometry is schematic. Keep the record traveling tangentially beneath the stylus; groove modulation drives cross-groove motion. Do not draw audio wiggles as radial lines marching out of the record.

Faraday model: `e = −d(NΦ)/dt ≈ −K dx_channel/dt`, where K is an illustrative flux-linkage gradient. For `x_channel = A sin(2πft)`, output is proportional to `2πf A cos(2πft)`: it peaks at fastest motion, and crosses zero at displacement extrema. This quadrature is the key animation. Suspension resonances, losses, tracking error, channel crosstalk and frequency-dependent loading are omitted.

For a standalone calibrated displacement illustration, explicitly assume **peak** channel velocity 0.05 m/s at 1 kHz. Then A = 0.05/(2π × 1000) = **7.95775 μm peak**. Do not connect this assumed peak convention to the manufacturer's 5 cm/s cartridge rating without verifying that rating's convention. Easier integrated implementation: display normalized displacement and induced voltage with the 90° relation, and leave the separate 0.5 mV RMS gain example independently stated.

## Frequency and platter-speed controls

At groove radius r, tangential speed is `v_t = 2πr (RPM/60)`. At r=0.100 m and 33⅓ RPM, v_t = **0.34906585 m/s**. A 1 kHz test tone cut at that speed has spatial wavelength `λ_g = v_t/f = 0.34906585 mm`. This groove wavelength is unrelated to the 343 mm acoustic wavelength of a 1 kHz sound in approximately 20°C air.

At 45 RPM and the same radius, v_t = **0.47123890 m/s**. A *new* 1 kHz tone cut at 45 RPM would have λ_g = 0.47123890 mm. But playing the **same 33⅓ RPM groove** at 45 RPM must retain λ_g = 0.34906585 mm and produce **1,350 Hz**. Its displacement pattern does not change; motion occurs 1.35 times faster. In the ideal generator model the pre-EQ voltage also grows by 1.35. Playback RIAA then weights the new frequency, so final phono output is not generally just 1.35 times the original.

Implementation recommendation: a `Recorded tone` frequency slider, a fixed `Cut at 33⅓ RPM` assumption, and a `Playback speed 33⅓ / 45` selector. Compute λ_g using cutting speed, and f_play = f_cut × RPM_play/RPM_cut. This is a meaningful cause/effect interaction and avoids rewriting the groove when users change playback speed. If a radius slider exists, label that it generates a new local test-groove illustration at that radius.

Keep the room-view platter turning at its actual selected RPM (0.5556 or 0.75 revolutions/s), independent of greatly slowed microscopic groove motion. A slow-motion slider for the cutaway must also affect the plotted voltage consistently; report the effective time scale. Suggested label: **“Generic MC cutaway · slow motion · groove displacement enlarged · normalized waveforms.”**

## RIAA implementation and checks

The ideal three-time-constant playback transfer is

`H0(s) = (1 + s·318 μs) / [(1 + s·3180 μs)(1 + s·75 μs)]`.

Normalize its magnitude at 1 kHz: `H(s) = 10^(G1k/20) H0(s)/|H0(j2π·1000)|`. Thus G1k=60 dB gives magnitude 1,000 at 1 kHz. The pole/zero frequencies are 50.0487, 500.487 and 2122.066 Hz. The optional IEC/rumble rolloff is not included. [Analog Devices / Walt Jung, *Op Amp Applications*, Section 6, printed pp6.11–6.20; PDF pages 12–21 zero-based](https://www.analog.com/media/en/training-seminars/design-handbooks/Op-Amp-Applications/Section6.pdf).

Own numerical evaluation, matching the handbook response table:

| Frequency | Playback EQ relative to 1 kHz |
|---|---:|
| 20 Hz | +19.2741 dB |
| 50 Hz | +16.9457 dB |
| 100 Hz | +13.0885 dB |
| 500 Hz | +2.6476 dB |
| 1 kHz | 0 dB |
| 10 kHz | −13.7343 dB |
| 20 kHz | −19.6203 dB |

If the UI shows a tone-dependent voltage after EQ, compute it from this transfer. If instead the displayed 0.5 mV→0.5 V stays fixed when users vary frequency, explicitly label it **“1 kHz gain example”**. Avoid a fake frequency-independent 60 dB RIAA response.

An illustrative loop can be shown as the generated source in series with cartridge coil resistance and the input load, with both coil terminals wired. Input current can be plotted separately from input voltage if the source resistance and load are declared. Do not make a moving-coil cartridge a battery injecting electrons unidirectionally into a one-wire path.

## Short exhibit copy

**Motion becomes voltage.** “The stylus follows the groove. A tiny coil moves in a magnetic field, generating a voltage that follows velocity: fastest at the middle of a swing, zero at its turning points.”

**Two walls, two channels.** “Stereo combines two directions at 45°. Equal channels move the stylus sideways; opposite channels move it vertically. This enlarged model lets you separate them.”

**Restore and amplify.** “The phono stage reverses the record's equalization and raises its tiny signal to line level. Our 1 kHz example uses 60 dB: 0.5 mV becomes 0.5 V.”

**Speed changes pitch.** “This groove was cut for 33⅓ RPM. At 45 RPM the same 1 kHz pattern becomes 1.35 kHz. Its physical wavelength stays the same.”

## Independent cross-check of research/speakers.md

Reviewed independently from its author. **Research passes with no substantive defect found**, subject to the integrated rendered artifact still being checked by the appointed critics.

- Reopened the official [W13 bass amplifier manual](https://boenicke-audio.ch/W13BassAmplifer.pdf). Verified XLR input, maximum 4.36 V / 15 dBu, presets 50/62/78/98 Hz at 12 dB/octave, mains 100–240 V and 350 W per driver. The proposed line-level bass interface is consistent. Its distinction between known preset slopes and unknown Q/acoustic summation is necessary and correct.
- Independently recalculated at 80 dB SPL, 100 Hz, ρ=1.204 kg/m³ and c=343 m/s: pRMS=0.2 Pa; uRMS=0.0004842943 m/s; ξpeak=1.090045 μm; I=9.685887×10⁻⁵ W/m²; 3 m flight=8.74636 ms. All supplied values pass. Verified the sign of its displacement equation by time differentiation and the pressure/displacement relation through the wave equation.
- Recalculated rectangular-room fundamental frequencies: 28.5833 / 38.1111 / 61.25 Hz. Two equal coherent sinusoids give +6.0206 dB for zero phase difference and cancellation at 180°. The research correctly confines this to one receiving point and does not promise real room-wide cancellation.
- Source caution, not an exhibit defect: OpenStax §17.3 includes an inaccurate aside implying SPL is uncommon in air. Use its first-principles derivation, not that aside. The supplied speaker note does not repeat the aside.
- All main speaker-level paths have explicit returns, and the separate powered bass / auxiliary sub branches do not pretend that the external active crossover feeds W13 passive driver groups. The unity-gain distribution/line-driver addition needs to remain visibly generic in the integrated result.
