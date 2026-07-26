# Round-4 audit — stage `turntable`

## Art-director score: **55/100** (-3 from 58)

> Still the only frame with a real hero shot: proper three-quarter, clean diagonal, platter reads. Now held back by a record with no label, a plinth top that is the largest area in frame and returns nothing, a cartridge that is 30 px at the chapter about the cartridge, and four labels piled at bottom-centre.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** content() overruns the panel and the still frame cuts it at "...482 MPa, 4.9 tf/cm²." Everything after that is lost: the whole "Why the last track is the worst" section (λ 51 → 21 µm, traceable velocity 83 → 14 cm/s, the (146/60)² = 5.92 ratio) AND the entire .myth block that kills ban 1 (3.66 µA peak, 8.96 nm/s drift, ±1.43 pm shuffle = 1/179 of the 255.6 pm copper spacing, field at 1.98×10⁸ m/s, "it is a loop"). The chapter's two best arguments are invisible in the deliverable.

**Fix:** Cut src/stages/turntable.js content() to ~230 words. Delete the entire "<h3>The cut</h3>" paragraph and its u/w .eq block (the 45/45 geometry is already fully carried by the groove card in the render, which is legible), and move the .myth block to immediately after the .key. Re-shoot and confirm the myth block's last line sits above the readout footer with no fade over it.

### 2. [MAJOR] (certain)

**Wrong:** The record has no label. The disc is black vinyl with an amber ring and a bare brown centre boss, and at this framing — a hero three-quarter with the platter as the largest bright object — the missing label is the first thing a reader's eye goes to. Separately, the plinth top is the largest single area in the frame and it is completely dead: matte, featureless, and returning no reflection of the platter or tonearm above it.

**Fix:** turntable.js — add a paper label: a 100 mm disc at r 0.0508 in a clone of mats().plastic (roughness 0.72, no clearcoat) in a muted off-white or deep amber, with a canvas-textured ring of type. For the plinth, switch its top surface from its current matte material to mats().pianoBlack (or a graphite clone at clearcoat 0.8, clearcoatRoughness 0.06) so the platter and arm are mirrored in it — that single change does more for this frame than anything else available.

### 3. [MAJOR] (certain)

**Wrong:** Four label cards are stacked at bottom-centre ('MOVING COIL', 'GROOVE VELOCITY', 'BELT DRIVE', and the 45/45 caption) and two of them overlap the plinth's front edge. They read as a bulleted list dropped on the picture rather than annotations pointing at things. Separately the cartridge — the subject of the chapter — is roughly 30 px in the frame while the platter, which is not the subject, is 450 px.

**Fix:** turntable.js — cut to two world labels (MOVING COIL at the headshell, GROOVE VELOCITY at the stylus contact) and move BELT DRIVE and the strobe arithmetic into content() or a readout. Then either raise the camera elevation and shorten the lens so the headshell reads at 80-100 px, or add a small inset detail card showing the cartridge at 4x beside the deck.

### 4. [MAJOR] (certain)

**Wrong:** The groove card's dimension chain does not line up with the geometry it measures. The "60 µm" arrow sits entirely to the left of the drawn groove notch and the "69 µm" land arrow spans a region that is partly groove, so the chain 60 + 69 = 129 measures nothing on the drawing. And MAG = 770 is documented as chosen so "exactly three grooves at true 129 µm pitch span the card", but only one full V and a partial second are drawn — there is no adjacent groove for the land to be between.

**Fix:** Draw three groove periods across the card at MAG so the pitch is measurable, and anchor each dimension line's extension witnesses on the actual feature edges (groove top-left to groove top-right for 60 µm; groove top-right to next groove top-left for 69 µm; crest to crest for 129 µm).

### 5. [MINOR] (certain)

**Wrong:** "482 MPa, 4.9 tf/cm²" is the Hertzian MEAN contact pressure (the code names it P_MEAN). The peak pressure at the centre of a Hertz contact is 1.5× the mean — 723 MPa. A tribologist reading this will assume peak unless told.

**Fix:** Print "482 MPa mean (723 MPa peak), 4.9 tf/cm²" or add "mean" to the word after the figure.

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
