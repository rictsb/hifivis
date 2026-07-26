# Round-4 audit — stage `amp`

## Art-director score: **47/100** (+3 from 44)

> The monoblock is the most credible object in the set — handles, fins, spikes, a real floor reflection. Undone by a meter that is a flat blue decal with an unshadowed needle and illegible printing, a cyclorama with a visible diagonal seam and a painted grey pool, and heatsink fins with no edge highlight.


## Findings for this stage (5)

### 1. [MAJOR] (certain)

**Wrong:** The cyclorama behind the monoblock has a hard diagonal boundary running from mid-left to upper-right separating a light grey from a darker grey, plus a soft grey blob upper-right that reads as a lens smudge. src/core/room.js:59-60 paints the lighting gradient into the backdrop's ALBEDO via cycGradient() as a `map`. A painted gradient does not move with the camera, shows a fixed hotspot, and creates exactly this kind of visible seam where the texture steps. It is the difference between a lit cyclorama and a printed backdrop card.

**Fix:** room.js:59 — set the backdrop's map to a near-flat 0.72 grey with only a very low-amplitude noise for tooth, and get the gradient from actual light: add a broad, dim area emitter in env.js aimed at the cove (or a second wide spot in room.js with a large shadow-map radius) so the pool falls off physically. If the painted map is retained for performance, at minimum smooth the step that produces the diagonal and reduce its contrast by half.

### 2. [MAJOR] (certain)

**Wrong:** The heatsink fin block is a flat black comb with no highlight on the fin tips. Real extruded fins each catch a bright line along the tip, and that repetition at scale is most of what says '300 W class-AB monoblock'. Currently the fin block reads as one dark textured plate. The top plate is likewise a plain black slab with three shallow grooves — no vents, no fasteners, no badge on a chassis that must dissipate 199 W.

**Fix:** amp.js — break the top edge of every fin with a small chamfer (GEO.bevelBox with a 0.4 mm bevel, or add a 0.5 mm radiused cap strip in mats().anodGrey along each fin tip) so a specular line runs along it. Add a vented top panel over the output devices using GEO.ventSlots, and four GEO.screw fasteners on the top plate corners.

### 3. [MAJOR] (certain)

**Wrong:** The power meter is the hero's face and it fails at 1:1: the dial is a flat, near-blown light-blue radial gradient, "POWER OUTPUT" and "WATTS INTO 8 Ω" are illegible low-contrast grey on light blue, there is no red overload sector, no tick hierarchy, and no glass. The needle at 233 W mean lands essentially on the last graduation (300), which reads as pinned rather than as −1 dB.

**Fix:** Darken the dial face and raise the silkscreen contrast (dark legends on a pale face, or pale legends on a dark face — not pale on pale); add a red sector above 300 W; add GEO.instrumentGlass over it. Consider extending the log scale one division past 300 so the operating point is not on the end stop.

### 4. [MINOR] (certain)

**Wrong:** The three interconnect cables leaving the monoblock are uniformly thick, uniformly grey-tan, have no visible connector where they meet the chassis, and the left-hand one passes straight through the bottom edge of the diagram card. They read as garden hose. They are also the only tan objects in the frame besides the backdrop seam.

**Fix:** amp.js — halve the cable radius, switch to mats().rubber (which is near-black with a sheen) so they stop competing with the chassis, add a GEO.bindingPost or a moulded strain relief where each leaves the chassis, and reroute the left cable behind the card rather than through it.

### 5. [MINOR] (certain)

**Wrong:** The equipment rack occupies x ≈ 1290-1400 of a 1400 px frame (x > 1120 at 1600×1000), running under and past the explanation panel, and an unidentified circular object is cut by the top-right frame edge. ADDENDUM §A forbids geometry past x = 1120.

**Fix:** Increase TRUCK_PX magnitude at amp.js:135 (currently −132) until the rack clears x = 1120, or narrow the fov, and identify or remove the circular object at the top-right corner.

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
