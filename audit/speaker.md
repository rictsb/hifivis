# Round-4 audit — stage `speaker`

## Art-director score: **36/100** (+2 from 34)

> Framing works. Materials do not: the cabinet flank is a warm tan wash (off-palette and the only warm object in a cool frame), the surround reads as a chrome torus rather than rubber, the cone has no texture, and the panel prose is visibly truncated mid-argument.


## Findings for this stage (7)

### 1. [MAJOR] (certain)

**Wrong:** content() overflows the panel: the last line, '29.2 Hz, which the LR4 at 80 Hz never asks for.', is visibly faded out by the scroll mask at 1600x1000. The reader loses the closing clause of the excursion argument. Addendum I caps content() at roughly 260 words including headings and this still overruns.

**Fix:** Cut the two sentences of THE MOTOR that restate what the F = Bl·i equation block already shows ('Bl = 12.0 T·m: of the coil's 28.9 m...' can lose the wire-length clause, which is repeated in the 'Current is a loop' paragraph). Target 235 words. Verify by re-shooting and confirming no fade at the bottom edge.

### 2. [MAJOR] (certain)

**Wrong:** At 1:1 the cabinet's gloss side panel is a warm brown/tan gradient — it is mirroring env.js's wrapR (0xffe6c8, warm) and it is the only warm-coloured object in an otherwise cool frame. It reads as brown plastic or a wood-effect vinyl wrap, not black lacquer. This is off-palette (CONTRACT §3.5) and it is the largest single colour area on the hero.

**Fix:** Two options, pick one. (a) In env.js:144 cool wrapR from 0xffe6c8 to 0xf0eee8 and drop its intensity 2.8 -> 2.2, keeping the warmth only in `kick` where it separates cabinets from the backdrop. (b) In speaker.js, rotate the cabinet's azimuth ~8° so the flank picks up frontStrip (0xf2f6ff) instead of wrapR. (a) is the better fix because the same tan appears on the turntable plinth edge and the amp's right flank.

### 3. [MAJOR] (certain)

**Wrong:** The drivers are not driver-shaped. At 1:1 the midwoofer's surround is a light grey ring with a single hard specular crescent — it reads as a chrome torus, not a rubber half-roll; the cone is a flat untextured grey; the dust cap is a smooth ellipsoid with one blown white blob; there is no visible basket, no spider, no chassis spokes. The tweeter dome has a golf-ball highlight. In a Wilson or Devialet frame the surround is matte with a soft wrapped sheen and the cone carries visible fibre or weave.

**Fix:** speaker.js — build the surround from mats().rubber (roughness 0.82, sheen 0.4) as a proper half-torus, never a bright dielectric; give the cone mats().coneWeave with its clothWeave map at a repeat tight enough to read at 1:1; make the dust cap the same material as the cone, not a separate smooth body; and add a cast basket ring with 4-6 spokes visible between cone and baffle. The sub's cone in sub.js has the same problem and takes the same fix.

### 4. [MAJOR] (certain)

**Wrong:** The motor cutaway is unreadable. At 1:1 it is a set of pale-blue outlined rectangles, a grey diagonal bar for the cone, an amber zig-zag polyline with a circle and a triangle for the source, and a small cyan bow-tie — no magnet body, no pole piece, no top plate shading, no gap flux, nothing that reads as a voice coil in a magnetic circuit. Four callouts (CHARGE CARRIERS, VOICE COIL, MOTOR FORCE, CONE TRAVEL) float in a column 200-350 px away with no leaders to any part, so nothing on the drawing is identified.

**Fix:** In src/stages/speaker.js buildSection(): give the magnet, front plate, back plate and pole piece filled silhouettes in distinguishable values (graphite / lamination / anodGrey clones) rather than outlines, and draw 4-6 flux arcs through the gap in amber. Shorten the four label offsets to 60-120 px and add a leader line from each to the part it names (the 'lead' class is already in use at speaker.js:1214).

### 5. [MAJOR] (certain)

**Wrong:** The section card and the response/excursion card abut and overlap (shots/speaker.png, the graph card's top-left corner sits over the section card's lower edge at ~x 1450-1900, y 1090-1130). Together they form one black slab occupying roughly a third of the safe box, which is more visual mass than the loudspeaker. ADDENDUM §B caps this at two cards that do not overlap the hero's silhouette; they also crop the near cabinet's upper woofer.

**Fix:** Separate the two cards by at least 40 px of clear background and shrink the combined stack: put the section card above and clear of the graph card, or drop the free-air dashed trace and the excursion plot's caption box to shorten the graph card. Confirm no card pixel touches another card or the near cabinet.

### 6. [MAJOR] (certain)

**Wrong:** Drivers still have no detail density. Each woofer is a smooth grey cone gradient with a soft torus surround, no dust-cap boundary, no basket spokes or windows, no spider, no trim ring. At 3200 px on the hero of the loudspeaker chapter this reads as a stamped disc. This was round-1 finding 3 and it has not been actioned.

**Fix:** Rebuild the driver in src/stages/speaker.js: a LatheGeometry half-roll surround in mats().rubber at roughness ~0.75 with visible thickness at the cone junction; a separate dust cap in coneWeave or dome; a cast basket with six open windows; a machined trim ring with GEO.screw at eight positions; the cone in coneWeave rather than flat cone.

### 7. [MINOR] (certain)

**Wrong:** content()'s last line ("...29.2 Hz, which the LR4 at 80 Hz never asks for") sits under the panel's fade gradient in the shipped still. It is also the only place the excursion demonstration is reconciled with the crossover, so it is the wrong line to lose. Separately, "Travel runs out below 29.2 Hz" does not restate the 96 dB reference on which F_XMAX depends.

**Fix:** Cut ~15 words earlier in the panel (the "coil fills in 146 ns" clause can move to a label) and rewrite the last sentence as "At 96 dB travel runs out below 29.2 Hz — which the LR4 at 80 Hz never asks for." Also add gX.addMarker(XOVER.fLow) to the excursion plot so the 80 Hz handover is visible on the curve.

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
