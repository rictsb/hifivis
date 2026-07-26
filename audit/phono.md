# Round-4 audit — stage `phono`

## Art-director score: **28/100** (-5 from 33)

> Nothing in frame is whole and nothing is identifiable as the hero. A large translucent card is rotated off-axis so the rack prints through it and its type is skewed; a second card overlaps its top-left corner; two blown white streaks sit on the shelf trim and across the graph.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/phono.js:166-168 — `FILL = 0.33` on `HERO_R = 0.1103` leaves the phono stage unidentifiable; I cannot tell from the render which chassis is the subject. The RIAA graph card is then rotated well off the camera axis so its type is skewed and the rack prints through it, and a second smaller card overlaps its top-left corner, cutting the 'Record · standard' label. Two blown white streaks (the shelf trim, finding 4) sit across the fascia and the graph.

**Fix:** phono.js:168 -> `const FILL = 0.52;` and re-target to the phono chassis centre so it reads as the hero at roughly half the safe-box height. Rotate the graph card to face the camera within ~6° (currently it is far off axis) and move it to screen-right of the chassis rather than in front of it. Merge the two overlapping cards into one — Addendum B allows two cards but not two that touch.

### 2. [BLOCKER] (certain)

**Wrong:** An opaque dark-grey rectangle with hard edges is pasted on top of the RIAA plot, occluding roughly the left third of the plot box (visible at shots/phono.png ~x 1560-2000, y 900-1440). It hides the cyan playback trace entirely below ~200 Hz and clips the amber record trace. The chapter's whole picture is the two curves crossing; half of one curve is under a grey plate.

**Fix:** In src/stages/phono.js, that plate is a second card / label scrim rendering in front of the Graph. Find the mesh centred near the plot's upper-left and either remove it, move it clear of the plot box, or set occlude:false + renderOrder below the Graph. Re-shoot and confirm the cyan trace is continuous from 20 Hz to 20 kHz.

### 3. [MAJOR] (certain)

**Wrong:** The hero (bay 3) is largely behind the diagram card and its identifying label "Bay 3 · moving-coil phono" sits on the shelf edge above it. The framing comment at phono.js:158-166 asserts the chassis lands at y 188-372 and the card at y 435-915 with no overlap; in the shipped render the card's upper-left corner reaches y ≈ 430 at 1400 px scale and the chassis is behind it. The stated arithmetic and the render disagree.

**Fix:** Re-measure off the current shot and move the card down/right until the bay-3 fascia is fully clear, or shrink the card. The claim in the comment should be re-verified against a fresh render, not left as prose.

### 4. [MINOR] (certain)

**Wrong:** Readout key 'IN → OUT' shows '0.389 → 410' with the unit 'mV rms' applied once at the end, so the input reads as 0.389 mV where the prose says 258.7 µV in. The two are different operating points (the readout is the live sweep value at 2427 Hz after RIAA boost; the prose is 1 kHz reference) but nothing on screen says so, and a measurement editor will read it as a contradiction.

**Fix:** phono.js readouts() — relabel the key 'IN → OUT @ f' and add the sweep frequency to the unit string, or fix the readout at 1 kHz so it matches the 258.7 µV / 410 mV pair the prose derives. Same applies to the GAIN readout (60.46 dB) against the prose's 64.00 dB at 1 kHz.

### 5. [MINOR] (certain)

**Wrong:** "at 5 cm/s, 50 Hz wants ±159.2 µm against a 129 µm groove pitch" is arithmetically right (0.05/(2π·50)) but is the UN-pre-emphasised case, which is never cut. With RIAA record EQ the recorded velocity at 50 Hz is 16.94 dB down and the real displacement is ±22.6 µm — comfortably inside the pitch. As written the reader concludes that a real 50 Hz cut overruns its neighbour.

**Fix:** Add the consequence, which is the whole point: "...which is why the record curve exists: pre-emphasis puts 50 Hz 16.9 dB down, so the cut is ±22.6 µm and the land survives."

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
