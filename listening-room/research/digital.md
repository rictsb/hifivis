# Digital playback and HD DAC X — specialist handoff

Verified against primary sources 2026-09-07. Owned scope: generic streamer, digital transport, exact HD DAC X exterior and documented blocks, and an explicitly separate PCM sampling laboratory. Input interface: selected recording represented by samples. Output interface: stereo analog RCA to HD PREAMP RCA1, which is alternative to the phono path.

## Exact model facts and boundaries

Nagra says its FPGA converts incoming audio to DSD256, approximately 11.2 MHz. The analog chain is dual mono: D/A board → symmetric current buffer → interstage transformers providing voltage gain and unbalancing → one JAN5963 tube per channel, lowering output impedance. The supply uses supercapacitors, silicon-carbide rectifiers and 37 regulated supplies. These are manufacturer-described blocks, not independently measured performance. Nagra does not disclose enough here to draw the exact modulator, switching DAC cell, winding layout or filter impulse response. Avoid a generic stair-hold circuit drawn inside this product. Do not repeat sonic-benefit marketing. [Official HD DAC X product page](https://www.nagraaudio.com/product/hd-dac-x/)

The DAC and its PSU are separate chassis connected by two dedicated LEMO umbilicals (analog and digital); do not interchange the PREAMP supply. USB supports PCM up to 384 kHz and DSD256. The fixed output reference is 1.5 Vrms at 0 dBFS. RCA and XLR are parallel connectors and must not both be connected simultaneously. Balanced XLR requires optional output transformers; exhibit RCA avoids assuming that option. The unit is Class I, requiring protective mains earth. Its meter has black left and red right needles; its scale is input dBFS and corresponding output Vrms. The two center displays show format and sampling rate. Its large rotary control selects input, not volume. [Exact manual, printed pp6,11–19,22,30](https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-DAC-X-User-Manual-English.pdf)

Use 2021 HD-series drawing envelope: W438 × D439 × H121–130 mm for each chassis; paired height 237–260 mm. The width includes the outboard suspension columns, not a 438 mm solid rectangular box. [Official HD mechanical drawing](https://www.nagraaudio.com/wp-content/uploads/2021/05/HD-series-dimensions.pdf)

## Photographs actually downloaded and inspected

- `research/references/dac-hd-dac-x-front.jpg` — [Official front image](https://www.nagraaudio.com/wp-content/uploads/2019/01/33-1920x1080.jpg). Two brushed silver panels in a stacked frame. Upper left circular amber meter, around 20% of central panel width, with thick silver rim and rounded metal projection over the lower dial. FORMAT and SAMPLING RATE are two separate wide black horizontal windows between meter and right selector, white text inside. Main right selector is a disk with a raised diagonal finger bar crossing a horizontal red stripe; eight small black radial index tabs. Tiny mute and phase toggles beneath rate display. PSU face is plain silver with centered embossed Nagra wordmark. Each front corner column is a tall stack of four silver barrel-shaped rings separated by black gaps; bottom foot is knurled. Dark horizontal platform with thin silver border runs between columns. Center body is approximately three quarters of total width. Silver is textured and shadowed, not white plastic.
- `research/references/dac-hd-dac-x-rear.jpg` — [Official rear detail](https://www.nagraaudio.com/wp-content/uploads/2019/01/43-1920x1081.jpg). This is a detail crop, not a full rear reference. It confirms RCA above XLR in a channel output group, ground selectors as small vertical slots, red-ring multipin LEMO power inlet beside it, USB-B port and reset hole. Rear typography is dark and utilitarian; fine horizontal brushing and machined bevels are visible.

These references support recognizable modeling; no claim of factory CAD accuracy or proprietary interior geometry. Keep documentary photos optional in the reference drawer, with attribution, rather than using them as substitute 3D fronts.

## Product path versus teaching path

**Installation:** generic network streamer → USB digital cable → HD DAC X → stereo RCA → HD PREAMP selected input. The streamer stores/decodes file samples and sends data; USB packet arrival and audio conversion instants are distinct. Buffering lets the conversion clock determine output timing. A moving marker here means “follow the information,” not a real electron or a measured latency. USB differential conductors, signal ground and shield are distinct; do not depict one floating wire as a complete electrical circuit.

**HD DAC X cutaway caption:** “Nagra documents FPGA conversion to DSD256, followed by current buffering, transformer voltage gain and a tube output stage. This exploded view locates functional blocks; it does not reproduce the proprietary circuit layout.”

**PCM laboratory caption:** “A separate idealized sampler helps explain what the file contains. These controls change this mathematical example, not the Nagra's internal architecture. Samples are discrete numbers. A reconstructed analog voltage varies continuously.”

**No stair-step myth:** Show separate marks at the sample instants. Never join the marks as stairs while calling that the final analog output. If a zero-order hold toggle is included, label it “Generic unfiltered hold example — not an HD DAC X circuit.” A hold keeps an output level for one sample interval; its spectral images and sinc-shaped response differ from an ideal reconstructed output. Interpolation creates values implied by a bandlimited signal; it cannot recover information already lost to aliasing. [Analog Devices MT-017](https://www.analog.com/media/en/training-seminars/tutorials/MT-017.pdf)

## Sampling laboratory controls and correct math

Use input tone f = 100–20000 Hz; sample-rate presets 8, 16, 32, 44.1, 48 and 96 ksample/s; bit depth N = 4, 8, 16, 24; normalized input peak A = 0.8. Set phase φ = 0.23 rad to avoid the misleading special case of a Nyquist sine sampled only at zeros. Low sample rates are deliberately educational examples. The rate is samples per second **per channel**, not USB line bit rate.

Define `x[n] = A sin(2π f n/fs + φ)`, interval `Ts = 1/fs`, Nyquist frequency `fN = fs/2`. The exact sampled sequence cannot distinguish frequencies separated by an integer multiple of fs. For a tone, fold into `fw = ((f + fs/2) % fs + fs) % fs - fs/2`; show alias frequency `abs(fw)`, but generate its waveform with the **signed** fw and the same φ. Replacing fw with its absolute value without correcting phase will not pass through the samples. At the Nyquist boundary uniqueness is lost; explicitly display “Nyquist boundary — phase-dependent ambiguity.” For a reconstruction theorem statement require input bandlimit strictly below fs/2 and exact samples. Finite precision adds quantization error. [Analog Devices MT-002](https://www.analog.com/media/en/training-seminars/tutorials/mt-002.pdf)

The alias demonstration samples an unrestricted test sine with its anti-alias filter deliberately omitted. It does not imply normal studio acquisition neglects anti-alias filtering, or that a DAC can know the original frequency after aliasing. Higher playback sample rate alone cannot repair already aliased recording data.

Independent arithmetic examples:

| fs | Input f | Ts | Samples per input cycle | Baseband alias |
|---:|---:|---:|---:|---:|
| 44.1 kHz | 1 kHz | 22.6757 µs | 44.1 | 1 kHz |
| 44.1 kHz | 20 kHz | 22.6757 µs | 2.205 | 20 kHz |
| 32 kHz | 20 kHz | 31.25 µs | 1.6 | −12 kHz signed; 12 kHz magnitude |
| 16 kHz | 12 kHz | 62.5 µs | 1.3333 | −4 kHz signed; 4 kHz magnitude |

Use a static time axis in milliseconds with an optional scanning time cursor; then the plot need not pretend its horizontal speed is real. If it advances, label “time expanded: 1 ms occupies 1 s” and use that actual factor.

## Quantization that has the stated number of levels

Use a uniform signed N-bit mid-tread quantizer with spacing `Δ = 2/2^N`, code integers `k ∈ [−2^(N−1), 2^(N−1)−1]`, reconstructed values `q = kΔ`. Round input to nearest code then saturate:

```js
function quantize(x, bits) {
  const M = 2 ** (bits - 1), delta = 1 / M;
  const raw = Math.floor(x / delta + 0.5); // half-way ties toward +infinity
  const k = Math.max(-M, Math.min(M - 1, raw));
  return { k, q: k * delta, delta, clipped: k !== raw };
}
```

The representable endpoints are −1 and `1−Δ`, not ±1. Claiming 2^N levels while using symmetric endpoints ±1 and Δ=2/2^N creates an extra level. With A=0.8 and N≥4, this exhibit never saturates; the ordinary rounding error is bounded by Δ/2. If amplitude is later exposed, show saturation explicitly and do not claim the Δ/2 bound through clipping.

Plot actual `e[n]=q[n]−x[n]` and compute measured RMS over the displayed or specified record if labeling it measured. The common noise approximation `eRMS≈Δ/√12` assumes approximately uniform quantization error, with no overload; deterministic undithered tones can have correlated error and harmonic distortion. Consequently `SQNR≈6.0206N+1.7609+20log10(A)` dB is an **ideal statistical estimate over the full Nyquist band**, not the exact result of this short tone and not the Nagra analog noise floor. Raising file bit depth does not promise that much real analog dynamic range. [Analog Devices MT-001](https://www.analog.com/media/en/training-seminars/tutorials/mt-001.pdf)

| Bits | Normalized Δ | Estimated RMS error | Estimated SQNR, A=0.8 |
|---:|---:|---:|---:|
| 4 | 0.125 | 0.0360844 | 23.9051 dB |
| 8 | 0.0078125 | 0.00225527 | 47.9875 dB |
| 16 | 0.0000305176 | 0.00000880967 | 96.1523 dB |
| 24 | 0.000000119209 | 0.0000000344128 | 144.3171 dB |

For an ideal infinite quantized sequence, reconstruction is `y(t)=Σ q[n] sinc(fs t−n)`, with `sinc(u)=sin(πu)/(πu)`. The finite visualization may use a 128-tap windowed-sinc approximation with explicitly labeled truncation. **Do not draw the original sine as the reconstructed waveform through 4-bit quantized samples.** A simpler truthful UI has a sampling tab with exact sample dots plus original/aliased continuous sine and a separate quantization tab with x[n], q[n], and e[n], without claiming a simulated analog reconstruction.

If using the approximation, windowed kernel `sinc(u) sinc(u/64)` for |u|<64 and zero outside reproduces the quantized sample at integer instants (mathematical sinc zeros), but is not an exact brick-wall filter or a measured Nagra impulse response. Use samples outside the visible plot to avoid zero-padding edge artifacts. At high frequency near Nyquist it can deviate visibly; call it a numerical approximation and do not claim exact recovery.

## Independent check of preamp/crossover specialist

Read `research/preamp-crossovers.md` and independently opened the exact HD PREAMP manual and Linkwitz's original filter page. Recalculated the complex transfer functions in Python. All three response rows and all three 80 Hz delay examples pass. The mathematical statement that the LR4 sum is unity magnitude with all-pass phase is correct. The source routing, separate W13 bass requirement, output-reference/earth distinction and explicit teaching-configuration boundary are responsibly described.

No substantive arithmetic defect found. Integration notes delivered to root:

1. Preamp example is normalized 1 Vrms, whereas HD DAC X is 1.5 Vrms at 0 dBFS. Do not silently mix these references across linked readouts.
2. RCA1 and RCA2 have fixed 1 V sensitivity; a LOW/HIGH toggle belongs only to other specified inputs, not these ports.
3. AUX's independent mode is described in the manual, but simultaneous loading with main XLR is not characterized. The report already flags that assumption and gives the conservative option: main XLR → generic balanced distribution buffer → monoblocks / W13 bass / sub low-pass. Prefer that architecture if eliminating uncertainty is more important than preserving a direct preamp-to-monoblock path.

No memory files were used for this research.
