# Round-4 audit — stage `streamer`

## Art-director score: **31/100** (-5 from 36)

> Regressed. The shot deliberately frames card-plus-chassis as one stack, so the card is the hero: an opaque black wall over half the rack with four plot regions in it. The display carries a blown white specular that buries its own content, and the display glass shows visible dither checkerboard at the corners.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/streamer.js:858-861 — the shot deliberately frames `STACK_LO` (shelf line) to `STACK_HI` (card outer top) as one subject at fill 0.65, so the CARD is the hero and the streamer chassis is a band across the top. The card is an opaque black wall across the whole rack front containing four plot regions (bit strip, buffer trace, eye diagram, packet-arrival strip) against Addendum B's three-region maximum. The chassis's own display then carries a blown white specular that buries its content, and the display glass shows visible dither checkerboard at its lower-left and lower-right corners (broken alpha/stipple).

**Fix:** streamer.js:860 — frame the CHASSIS alone: `frameShot([-0.015, 0.290 + H_CH/2, -3.040], H_CH/2 + 0.02, { fill: 0.52, az: -0.15, el: 0.115, fov: 28 })`. Move the card to screen-right of the chassis, beside it, not below it. Drop one of the four plot regions (the packet-arrival strip duplicates what the buffer trace already says). Investigate the corner checkerboard — it is either a transparent material without `depthWrite:false` z-fighting against the bezel or an alpha-dithered material; give the display cover GEO.instrumentGlass instead.

### 2. [BLOCKER] (certain)

**Wrong:** A hard white specular flare with a bloom halo sits dead centre of the streamer's front-panel display (shots/streamer.png ~x 1400-1650, y 340-450), obliterating the buffer bar and any text on the hero's own face. Hard-edged rectangular grey/white patches also remain at the display window's corners. This is exactly the failure ADDENDUM §J describes and it is the brightest thing in the frame, on the hero.

**Fix:** In src/stages/streamer.js, replace the hand-rolled clear panel over the front display with GEO.instrumentGlass(w, h) placed 2-4 mm in front of the emissive, and delete the local convex-panel helper. If the flare persists, drop the panel's envMapIntensity to ~0.4. Verify at 1:1 that no highlight on the display has a straight edge and that the buffer bar is readable end to end.

### 3. [MAJOR] (certain)

**Wrong:** The panel's .eq block overruns. 'over 0-22.05 kHz; 110.5 dB counted to 20 kHz' and '24-bit floor 146.3 dB, which 0.77 ps rms reaches' are both past Addendum C's 46-character limit and visibly touch the right rounded corner of the eq box. They are also rendered dimmed, which makes an overflowing line look like a rendering error.

**Fix:** streamer.js content() — recast as: line 1 'SNR = -20 log10(2 pi f t_j)', line 2 '    = 110.1 dB   f 10 kHz, t_j 50 ps rms', line 3 '24-bit floor 146.3 dB' and move the 0-22.05 kHz bandwidth caveat into the prose paragraph above. Count characters against 46 before re-shooting.

### 4. [MAJOR] (certain)

**Wrong:** The .eq block's last two commentary lines are under the panel's fade in the still: "over 0-22.05 kHz; 110.5 dB counted to 20 kHz" and "24-bit floor 146.3 dB, which 0.77 ps rms reaches". Those two lines are the entire payoff of the jitter argument — without them the reader gets 110.1 dB with no reference band and no comparison to the word length.

**Fix:** Cut the "What arrives" paragraph by about 25 words (the switch-stall and retransmission premises can go to a label) so the .eq block clears the footer. Verify the last commentary line is fully opaque in the shot.

### 5. [MINOR] (likely)

**Wrong:** SNR_20K adds 10·log10((fs/2)/20000) = +0.42 dB to the jitter SNR, i.e. it re-bands white jitter noise from 0-22.05 kHz into 0-20 kHz. At 44.1 kHz that correction is 0.42 dB and is quoted to one decimal beside a 110.1 dB figure, which implies a precision the premise (white jitter spectrum) does not support.

**Fix:** Either drop the 20 kHz line entirely — at 44.1 kHz it says nothing — or state the premise: "assuming the jitter spectrum is white across the Nyquist band".

---

## Fixed in core by the lead since these findings — do NOT redo, do NOT edit core

The art director's headline was "there is no specular event anywhere in the
piece: every surface returns one flat value from its environment". Both named
causes are now addressed:

1. **The environment had no structure.** Eight emitters at flat single
   intensities integrate to a nearly uniform hemisphere. Each softbox now
   carries a luminance ramp along its own length, and the shell has a
   **horizon band** — the studio trick where a bright line sits where the walls
   meet the sweep, so a polished vertical surface returns a horizontal highlight
   that *bends with the surface*. That is what a reflected horizon is, and it is
   what makes a cabinet cheek read as a cheek instead of painted card.
2. **The diagram card was a UI div.** `DIAG.diagramCard` was a
   `MeshBasicMaterial` with `toneMapped:false` — it took no light, cast no
   shadow and never appeared in the floor reflection. It is now a lit dielectric
   slab with real thickness and a machined `aluTrim` bezel on all four sides. It
   catches the horizon band along its top edge, shades across its face, casts a
   shadow and shows up in the floor like everything else. **Your card will look
   different — re-look at it.**

Also: the cyclorama is widened to 34 x 9.5 m so its edges never enter frame.

Measured over the twelve frames after these fixes: mean luminance **23.2 %**
(was 8.8-14.5 % three rounds ago), pixels above 95 % **0.13 %**, mid-tone mass
**54.3 %**.

## `GEO.instrumentGlass()` exists and NOT ONE STAGE USES IT

Contract Addendum J. Several stages answered "give the meter a specular layer"
with a crowned panel at roughness 0.085, which returns essentially the whole
softbox and blooms into a lens flare — measurably the brightest thing in
`preamp`, `phono` and `dac`, and still visible in the current frames.

`GEO.instrumentGlass(w, h, opts)` is crowned (the source sweeps as a band rather
than sitting as a rectangle), `reflectivity` 0.34 (a coated cover glass returns
~1.7 % at normal incidence, not the default's uncoated 4 %) and roughness 0.15.
If your stage has a meter, a display, a lens or a card front, use it. Delete
whatever near-mirror you rolled yourself.
