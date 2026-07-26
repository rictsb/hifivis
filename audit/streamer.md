# Audit findings — stage `streamer`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **40** — Composition, framing and staging
  One card wall covering 55% x 60% of the stage, six plot regions on it, hero clipped by the bottom frame edge, two label kickers chopped by the card border.

- **38** — Materials, lighting and render quality
  44% of the frame is under 2% luminance behind one enormous black card. The hardware that survives is decent but rainbow-fringed by the CA pass and rim-glowing on every edge.

- **66** — Typography, information design and UI
  The best label system in the piece: every caption sits directly above the graph card it names, left-aligned to its edge. Loses points for the clock-edge caption disappearing under the toroid and for the panel slicing an .eq in half.


## Findings for this stage (12)

### 1. [BLOCKER] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The network model in src/stages/streamer.js makeModel() loses one packet on every stall, so the receive buffer drains monotonically and the stage's own thesis fails on screen. When a stall is scheduled, m.nextT has already been advanced to the next nominal packet time and m.stallEnd = nextT + dur; the loop then jumps nextT to stallEnd and replays only Math.round(dur*PKT_RATE) packets, so the packet that was due AT nextT is never sent. I reran the exact model: mean delivery rate 778.91 pkt/s against the nominal 789.04 (−1.28 %). Starting from 120 ms the occupancy reaches 0 ms at ~10 s of simulated time and thereafter oscillates 0–40 ms, clamped by Math.max(0, ...). At timeScale 0.02 that is about 8 minutes of viewing, or under 3 minutes at the 3x the UI allows. The occupancy strip chart, the bar, the BUFFER readout and the front-panel OLED all then read a permanently starved buffer under a caption that says buffering decouples network timing from conversion timing.

**Fix:** Replace the nextT arithmetic with a proper D/D/1 queue: keep a nominal counter m.n, and release packet n at rel = Math.max(m.n/PKT_RATE, m.free, m.stallEnd), then m.n++, m.free = rel + T_SER; tag kind=2 when rel > nominal (burst) and only allow a new stall to start when rel <= nominal. I verified this exact formulation over 300 simulated seconds: mean rate 788.98 vs nominal 789.04, occupancy stays in 79–121 ms with no drift. Do NOT just add +1 to backlog — I tested that and it overcorrects to 795.87 pkt/s and the buffer runs away to 2700 ms.

### 2. [BLOCKER] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The two boxes are wired together and disagree about the sample rate, in the same frame. streamer.js oled() draws '192.0 kHz 24 bit AES · LOCK' and every streamer constant derives from FS = 192000; dac.js displayTexture() draws '44.1 kHz 24 bit', lights the AES source and lights the 44.1 rate LED, and every DAC constant derives from FS = 44100. Both front panels are legible in shots/dac.png (192.0 on the streamer in bay 1, 44.1 on the DAC in bay 2) and the DAC's rear AES3 XLR is fed from the streamer's. A reader who has just been told the bit clock is 64 fs = 12.288 MHz then sees the receiving converter locked at 44.1 kHz.

**Fix:** Pick one rate for the chain and make both panels agree. Cleanest is to make the DAC's displayed input 192.0 kHz / 24 bit / AES-LOCK (light the '192' rate segment in displayTexture()) while keeping the sinc/ZOH teaching panels explicitly at 44.1 kHz with a label saying 'shown at 44.1 kHz because two points per cycle is where the argument bites'. Alternatively drop the streamer to 44.1 kHz, but then BCLK becomes 2.8224 MHz and MCLK 5.6448 MHz and all of column 1 must be recomputed.

### 3. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** One diagram card spans device x 440-2200, y 96-1310 — 55% of stage width and 60% of its height, a wall in front of the room. It carries six plot regions. Its bottom edge chops two label kickers mid-height: "BUFFER · 0-140 MS · 300 MS WINDOW" and "SNR VS T_J · 0.1 PS-10 NS · 80-170 DB" are both half-cut by the card boundary. Below it the streamer chassis and the rack are clipped by the bottom frame edge.

**Fix:** In src/stages/streamer.js, split the wall: keep the packet-arrival histogram, the AES3 subframe strip and the clock-edge eye on one card sized to about 1.5x the streamer's own width, and drop the biphase square waves, the transmission-line block and the SNR-vs-jitter line into content(). Move both clipped labels inside the card bounds (or anchor them below it). Raise streamer.js:705 target.y from 0.755 to 0.82 and drop fov to 30 so the rack base is inside the frame.

### 4. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The 0.169 pm carrier displacement — the number the whole drift argument turns on — is derived from a frequency that never appears on screen. X_DRIFT = V_DRIFT / (2π·F_BMC) with F_BMC = BCLK/2 = 6.144 MHz, but the only frequencies shown to the reader are 12.288 MHz (bit clock) and 24.576 MHz (OCXO). Nothing on screen or in content() tells the reader that biphase-mark's lowest fundamental is half the bit rate, so ±0.17 pm cannot be checked. The same omission hides the fact that AES3's channel rate after biphase-mark coding is 128 fs = 24.576 MHz, which is precisely why the OCXO is at 128 fs — a connection the panel lays out in two separate columns and never makes.

**Fix:** Add to the S.lab.clk text, or a new line under the BMC trace: 'biphase-mark puts two half-cells in every bit, so the channel rate is 128 fs = 24.576 MHz — the OCXO frequency — and an all-zeros pattern has its lowest fundamental at 64 fs / 2 = 6.144 MHz, which is the frequency the ±0.17 pm below is computed at.'

### 5. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The jitter SNR is quoted with neither a noise bandwidth nor a signal level. readouts() gives 'SNR 10 kHz 110.1 dB', the sg graph's label gives '110.1 dB', and content() derives it as −20log10(2π·10 kHz·50 ps). The formula's implicit conditions are a full-scale sine and jitter noise integrated over DC–fs/2. At this stage's fs = 192 kHz that band is 96 kHz; measured in a 20 kHz band the same 50 ps reads 6.81 dB better, at 116.9 dB. The 36.2 dB comparison against the 24-bit floor is internally consistent (both are DC–fs/2) but neither figure carries its band, so a reader cannot tell that the 110.1 dB is not a 20 kHz-band number.

**Fix:** Add the conditions once, in the eq block in content(): 'full-scale sine, jitter noise integrated DC–fs/2 = 96 kHz; in a 20 kHz band the same 50 ps reads 116.9 dB.' Change the readout key to 'SNR 10 kHz, FS, 0–96 kHz' or shorten to 'SNR 10 kHz (0–fs/2)'.

### 6. [MAJOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The SNR-vs-jitter graph leaks out of its own frame and its caption is overprinted. In buildOverlay(), sg has xRange [1e-13, 1e-8] and yRange [80, 170]; DSP.jitterSnrDb(1e4, 1e-8) = 64.0 dB, and Graph._fill only clips to y0 − 0.04·(y1−y0) = 76.4, so the solid cyan trace crosses the bottom frame and terminates outside the box. Visible in shots/streamer.png bottom-right. In the same region the S.lab.snr kicker 'SNR VS T_J · 0.1 PS–10 NS · 80–170 DB' is overprinted by the graph's bottom frame line and by an amber dotted leader line that strikes through '110.1 dB'.

**Fix:** Either set sg yRange to [60, 170] (and yTicks [60,80,100,120,140,160]) or shorten xRange to [1e-13, 2e-9] so the 10 kHz trace stays inside. Move S.lab.snr's anchor down to y = 0.070 with offset [0, 26] so it clears the frame, and reroute the two ov leader traces (the loops in buildOverlay that go from the component to the panel) so they do not cross the label.

### 7. [MINOR] (likely) — Composition, framing and staging

**What is wrong:** The OCXO callout — the gold-lidded oscillator module at device x 1825-2260, y 1440-1770 — floats free at an arbitrary tilt with no visible connection to the hardware, and its right corner abuts the panel with roughly a 20 px gutter. Its label "OCXO · 24.576 MHz · ±120 fs / island x2 · needs < 0.77 ps" is set in the dimmest grey over the gold lid and is effectively illegible.

**Fix:** Straighten it to a plane parallel to the stage camera, move it left so its right edge is at least 90 px clear of device x = 2280, and connect it to the streamer chassis with a DIAG leader line so it reads as a callout. Put the label above the module on the dark plate, not over the gold.

### 8. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The displayed equation implies a fractional number of audio frames per TCP segment. content() shows 'each holding (1460/6)/192 000 = 1.27 ms of music', but 1460/6 = 243.33 frames — a segment cannot carry a third of a stereo frame. A real sender packs whole frames: 243 frames = 1458 B, 1.2656 ms, and the packet rate becomes 192 000/243 = 790.12 pkt/s, not 789.04.

**Fix:** Change the eq to '1460/6 = 243.3 frames, so 243 per segment = 1458 B' and derive 790.1 packet/s from it, updating PKT_RATE and PKT_AUDIO in the constants (PKT_AUDIO = 243/192000, PKT_RATE = PAYLOAD_B/1458) so the model and the prose agree. The buffer balance still closes exactly: 790.12 x 1.2656 ms = 1000.0 ms/s.

### 9. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The ARRIVAL readout cannot report what the model actually does. readouts() computes M.arrivals.length / RAIL_WIN, but m.step() splices m.arrivals down to 400 entries, so over the 40 ms window the readout saturates at 10.0 kpkt/s. The model's burst rate is 1/T_SER = 81 275 pkt/s (a 1 GbE switch draining its queue), so during every burst the number on screen is 8x low and is set by an array cap, not by physics.

**Fix:** Count arrivals from the model rather than the display array: keep a small ring of arrival timestamps sized for the burst rate (RAIL_WIN/T_SER = 3251 entries) or, simpler, maintain a decaying rate estimator in m.step() and read that. Alternatively raise the splice cap to 3400 and reduce the pk Swarm's sampling instead.

### 10. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The AES3 preamble is drawn as four ordinary biphase-mark-coded cells, which removes the only thing that makes a preamble a preamble. makeSubframe() sets b[0..3] = 1,0,0,1 and bmcLvl() then encodes them with the same rule as the audio bits. Real X/Y/Z preambles are 8 half-cells (11100010 etc.) that deliberately violate the biphase-mark rule so a receiver can find frame and block boundaries without ambiguity. As drawn, nothing distinguishes the preamble from data and the reader is left wondering how the receiver ever syncs.

**Fix:** Special-case cells 0–3 in bmcLvl(): emit the X-preamble half-cell pattern directly rather than BMC-encoding the bit values, and add a short note to the S.lab.word text — 'the preamble breaks the biphase rule on purpose; that violation is the frame marker'. The parity computation (XOR over slots 4..30 into b[31]) is already correct — leave it.

### 11. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The live edge readout mixes a peak per-sample error with an rms noise floor and gives both the same unit. S.lab.edge prints 'Δt = −30 ps → −114.5 dBFS', computed as dB(2π·JF·|Δt|), which is the PEAK error a single sample suffers at the zero crossing of a full-scale 10 kHz sine. Three centimetres away, S.lab.snr prints 110.1 dB from the same expression with tj as an RMS. Two different statistics, identical arithmetic, no distinction on screen.

**Fix:** Label the edge readout as what it is: 'Δt = −30 ps → peak error −114.5 dBFS (FS 10 kHz sine)'. Keep S.lab.snr as the rms noise floor and say 'rms' there too.

### 12. [MINOR] (certain) — THE DIGITAL CHAIN — streamer + dac (loudspeaker engineer / measurement editor)

**What is wrong:** The stage asserts that the buffer decouples network timing from conversion timing but never says who is clock master, which is the only thing that makes the assertion true. content() says 'A local oscillator empties the buffer at exactly 1.152 MB/s' while the model shows a source pushing at a fixed 789.04 pkt/s from somewhere else. If the source clock is independent, no finite buffer survives — it under- or overflows at the rate of the fractional mismatch. The reason a real network player is safe is that it is the master and pulls, so there is no second clock to drift against.

**Fix:** Add one sentence to the key box or the 'What leaves' paragraph: the buffer absorbs arrival variance, not a rate error; the player is the master and requests data as the OCXO consumes it, so there is no second clock to drift against — which is exactly why S/PDIF and AES3 inputs, where the source sets the rate, need a PLL or asynchronous sample-rate conversion instead.


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
