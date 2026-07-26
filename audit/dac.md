# Round-4 audit — stage `dac`

## Art-director score: **30/100** (-15 from 45)

> Worst regression in the set. fill 0.40 on radius 0.216 leaves the DAC chassis at roughly 7% of frame height; TRUCK_PX -152 puts a monoblock half-cropped at each edge; the reconstruction card floats detached in the top-left with a wide dead gap to the rack. The maths in this chapter is the best in the piece and the picture shows none of it.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/dac.js:634-657 — `FILL = 0.40` on `HERO_R = 0.216` puts the DAC chassis at roughly 7% of frame height, and `TRUCK_PX = -152` slides the whole rack far enough right that a monoblock is sliced by the left edge AND a second by the right edge. Nothing in the frame is whole and the subject of the chapter is a 90 px sliver. This is a 15-point regression from the previous pass (which over-filled at 0.90); the correction went straight past the target.

**Fix:** dac.js:634 -> `const AZ = 0.24, EL = 0.155, FOV = 31, FILL = 0.56;` and dac.js:635 -> `const HERO_R = 0.125;` (chassis half-height plus the top face in view). dac.js:647 -> `const TRUCK_PX = -40;` so both monoblocks leave the frame entirely. Then re-anchor the reconstruction card to screen-left of the DAC at roughly 1.6x the chassis height, closing the dead gap between card and rack.

### 2. [MAJOR] (certain)

**Wrong:** The DAC chapter has no hero. dac.js:635 sets HERO_R = 0.216 and the comment states the intent is to frame "the whole rack (1.128 m) ... 877 px tall". The converter is a 92 mm chassis — about 72 px in an 840 px safe box, 8.6 % — and its front display ("44.1 · 24 bit · AES · LOCK") is visually identical to the streamer's directly below it. The only cue is a small floating label "CONVERTER · RACK BAY 2" that sits above the shelf boundary and reads as pointing at either bay. In its own chapter the reader cannot identify the subject.

**Fix:** Set HERO_R to the converter's apparent half-height with its top face in view (~0.105-0.115, as phono.js does) and keep FILL 0.40; retarget HERO_C on the bay-2 chassis; raise EL to ~0.30 so the top face reads. Then differentiate the fascia: give the DAC a distinct display layout from the streamer's, and light the hero bay while flagging the neighbours down, as phono.js already does.

### 3. [MAJOR] (certain)

**Wrong:** The instrument cluster prints "IN-BAND DR 77.3 dBFS" as an unqualified headline in a chapter whose panel simultaneously argues a 24-bit 337.2 nV LSB and 98.1 dB at 16 bits. 77.3 dB is the measured in-band dynamic range of a deliberately crippled 2nd-order 1-bit demonstration modulator run at MOD_GAIN 0.5. Read as the converter's dynamic range — which is how the key reads — it says this DAC is worse than CD.

**Fix:** Change the key to something unambiguous, e.g. k: 'Δ-Σ demo DR' with u: 'dBFS · 2nd order, OSR 64'. And in content(), state why the measured 77.3 sits 7.9 dB below the 85.2 dB model (the 6.02·1+1.76 term is optimistic for a 1-bit quantiser and the FFT counts three-tone IMD as noise) — an unexplained 8 dB gap between "DR" and "model" on the same line invites the reader to distrust both.

### 4. [MINOR] (certain)

**Wrong:** The reconstruction card floats top-left with a wide band of empty backdrop between it and the rack, and with no leader, no anchor and no reflection. Given the frame already fails on subject size (finding 5), the card being the only thing in the left half compounds it: the eye goes to a UI panel over empty grey rather than to the converter.

**Fix:** After applying finding 5's reframing, re-anchor the card so its inner edge sits within about 0.15 m of the rack's left silhouette, and add a hairline leader from the card's lower-right corner to the DAC's fascia. Apply the lit-slab material from finding 3.

### 5. [MINOR] (certain)

**Wrong:** "Shaping drops the one-bit floor 54.1 dB" quotes NTF_20K — the noise-transfer-function magnitude at 20 kHz, which is the WEAKEST point of the shaping in band. At 1 kHz the same 2nd-order NTF is about 80 dB down. Stated bare, the figure understates the mechanism and cannot be checked by a reader who does not know which frequency it belongs to.

**Fix:** Print it as "Shaping drops the one-bit floor 54.1 dB at 20 kHz, and 40 dB per decade below that".

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
