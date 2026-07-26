# Round-4 audit — stage `xover`

## Art-director score: **38/100** (-2 from 40)

> Cleanest staging in the rack set, one card, correct physics. But 48% of the frame is empty backdrop, the card floats as a TV on an invisible stand with no shadow or reflection, and the shot aims 92 mm above the crossover's own centre so the hero sits in the bottom third.


## Findings for this stage (4)

### 1. [MAJOR] (certain)

**Wrong:** src/stages/xover.js:690 — the shot targets `[0.0645, 1.133, -3.03]`, which is the rack's top plate (LAYOUT.rack.topY = 1.128), not the crossover. The crossover's own centre is LAYOUT.bayCentre(5, 0.150) ≈ 1.041. At the derived camera distance of 1.18 m that 92 mm error is about 15% of frame height, and it is exactly why the hero sits in the bottom third with 48% of the frame as empty backdrop. Addendum A: 'target is your component's centre.'

**Fix:** xover.js:690 -> `const SHOT = frameShot([0.0645, 1.041, -3.03], 0.187, { fill: 0.62, az: CAM_AZ, el: 0.06, fov: 30 });` — target the chassis, drop fill 0.706 -> 0.62 to make room for the card above it, and raise el from -0.02 to 0.06 so the camera stops looking up at the undersides of the shelves.

### 2. [MAJOR] (certain)

**Wrong:** The graph card floats in mid-air with a hard rectangular border and no support, no shadow and no reflection in the polished floor directly below it. It reads as a flatscreen television hovering over the rack. The same object appears in air.js (twice) and amp.js. Addendum D explicitly requires that nothing float without a reflection or a contact shadow.

**Fix:** Either give the card a visible physical stand — a slim anodBlack foot plus GEO.contactShadow(cardW*1.1, 0.06) on the floor beneath it — or drop the border entirely and let the card be a lit dark slab (see finding 3) that reads as a panel rather than a screen. Whichever is chosen must be applied identically in xover.js, air.js and amp.js so the diagram language is one language.

### 3. [MAJOR] (certain)

**Wrong:** Two different quantities are both printed as "sum ... dB" in one frame. The card's own label prints SUM_ERR — the worst-case magnitude error over 20 Hz-20 kHz, −0.015 dB (xover.js:802) — while the footer prints S.sum, the cursor's instantaneous sum, −0.007 dB. Identical wording, different numbers, no way for the reader to tell them apart.

**Fix:** Change the card label at xover.js:802 to `worst |sum| ${Math.abs(SUM_ERR).toFixed(3)} dB at ${SUM_ERR_F.toFixed(0)} Hz` and change the footer key from 'Sum' to 'Sum at cursor'. Both numbers are worth showing; they must be distinguishable.

### 4. [MAJOR] (certain)

**Wrong:** The card floats in the empty upper third with the crossover chassis cropped at the bottom of the frame and the rack running out of the left edge, so the hero is a strip of knobs at the picture's base and the top 15 % of the frame is bare backdrop. The plot legend ("sum · low · mid · high" and "LR2, every driver +") is set in one colour, so nothing on the plot can be keyed to a name.

**Fix:** Boom the shot down and raise fill so the crossover chassis reads as an object with its top face in view, and drop the card so it sits beside rather than above. Colour each legend entry to match its trace (sum in PAL.gr, the three bands in PAL.cy at three widths or one dashed, LR2 in PAL.rd) and put a short colour swatch before each word.

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
