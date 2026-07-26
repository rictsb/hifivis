# Round-4 audit — stage `preamp`

## Art-director score: **34/100** (+4 from 30)

> The blown flare is gone, and the preamp fascia is the best-lit chassis in the piece. Now the problem is a large unlit black card glued flat to the rack front covering two bays, chassis cropped at both the top and bottom edges, and a silver fascia among five black ones.


## Findings for this stage (4)

### 1. [MAJOR] (certain)

**Wrong:** The large diagram card sits flat against the rack front, unlit and opaque, covering two bays; combined with finding 3 it reads as a rectangular hole cut into the rack. Separately, the frame is cropped through a chassis at the top edge (knobs sliced at y=0) and through another at the bottom edge, so neither terminating element is whole. src/stages/preamp.js:977 also bypasses frameShot entirely and hand-builds `{ position: CAMP.toArray(), target: AIM.toArray(), fov: FOV }`, so it is not held to the safe-box derivation the other stages use.

**Fix:** preamp.js — move the card off the rack face to screen-right of the preamp chassis, standing clear in space at roughly 1.5x the chassis height, and pull the camera back so the top of the rack (LAYOUT.rack.topY 1.128) and the shelf below the preamp both terminate inside the frame. Re-derive the shot through frameShot(preampCentre, 0.115, { fill: 0.50, az: 0.30, el: 0.09, fov: 30 }) and apply any offset as an explicit truck in pixels, as amp.js and dac.js do.

### 2. [MAJOR] (certain)

**Wrong:** content() (preamp.js:1145) prints "One watt into 8 Ω is 2.83 V, 91.2 dB at 1 m". 91.216 dB is TS.spl283 — the 2.83 V figure. 2.83 V into this 6.2 Ω coil is 1.290 W, so the one-watt sensitivity is 90.108 dB. spec.js's own comment names this exact substitution "the classic sensitivity fiddle", and air.js gets it right ("2.83 V is 1.29 W into the 6.2 Ω coil and reads 91.21 dB"). The preamp chapter commits it.

**Fix:** Change to: "One watt into 8 Ω is 2.83 V; into this 6.2 Ω coil 2.83 V is 1.29 W and reads SPEAKER.sens dB at 1 m (SPEAKER.sens1W dB at one true watt)." Use SPEAKER.sens1W wherever a watt is meant.

### 3. [MAJOR] (certain)

**Wrong:** The diagram card (relay ladder + S/N plot) is roughly twice the hero's projected area, covers two rack bays, and pushes the line preamp — the actual subject — into the top 15 % of the frame where the frame edge also cuts through the crossover chassis above it. The subject is identifiable only by a small floating label.

**Fix:** Shrink the card to ~0.65 of its current linear size and move it down and right so it clears the bay-4 fascia entirely; retarget the shot on bay 4 and boom down so the hero sits at the vertical centre of the safe box. The relay ladder graphic and the S/N plot do not both need to be this large — the ladder can be halved.

### 4. [MINOR] (unsure)

**Wrong:** The S/N-vs-setting trace has a sharp spike and reversal at roughly −40 dB on the solid (late) curve. Ladder Zout does vary non-monotonically with the relay word, so a bump is physically possible, but the drawn feature is a single-sample vertical kink rather than a smooth excursion, which is the signature of a plotting or state-caching artefact.

**Fix:** Print SNR_LATE[] for N = 0…63 and check for a discontinuity at the setting where the 32 dB relay first engages. If the array is smooth, the artefact is in the trace's sampling — force the Graph to evaluate on integer N. If the array really has a step, add a one-line caption saying why.

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
