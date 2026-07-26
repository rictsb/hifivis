# Round-4 audit — stage `sub`

## Art-director score: **45/100** (+7 from 38)

> Biggest gain. The cabinet finally has a machined fillet catching an unbroken bright line, and the two-sub null argument is the sharpest information design in the deck. Killed by the room-plan card: saturated tan and pale-blue fills at a quarter of the frame, off-palette, reading as a weather map.


## Findings for this stage (5)

### 1. [MAJOR] (certain)

**Wrong:** The room-in-plan card is the only saturated colour field in the piece: large flat tan/orange and pale-blue regions occupying about a quarter of the frame at full chroma. It reads as a television weather map, it breaks CONTRACT §3.5 (one accent colour; amber means energy, cyan means signal — here they mean +p and -p), and it overwhelms the subwoofer, which is the best-rendered object in the set. It is also drawn in perspective, so a 'plan' is not presented as a plan.

**Fix:** sub.js — replace the filled regions with contour LINES only on the dark card ground: amber lines for compression, cyan for rarefaction, at the existing 0.86 Pa spacing, plus a single low-alpha (≤0.18) fill to distinguish sign. Rotate the card to face the camera square so the plan reads as a plan. Move the PRESSURE KEY block out of the scene and into content() — a legend is prose, not staging.

### 2. [MAJOR] (certain)

**Wrong:** At 1:1 the subwoofer's cheek and top face are each ONE flat grey value with no gradient and no reflected structure, despite the cabinet having a genuinely good machined fillet catching a bright line down its front-left edge. The fillet proves the geometry is right; the flat cheek proves the environment is not (see finding 2). This is the clearest single demonstration in the deck of what is missing.

**Fix:** Apply finding 2 (vertical luminance ramp in diffusionMap, stronger horizon in shell) and finding 6 (clearcoatRoughnessMap on pianoBlack), then re-shoot sub and check that the cheek carries an unbroken ramp from soft white at the top through several stops of grey into the flag at the bottom. If it does not, the cabinet's material is not pianoBlack — check which material sub.js applies to the cabinet body.

### 3. [MINOR] (certain)

**Wrong:** The pressure key prints "peak 5.1 Pa = 3.6 Pa rms = 105 dB SPL" (correct: 3.606/2e-5 → 105.12 dB) while the footer prints SEAT SPL 78.3 dB, and the drive is stated as 100 dB at 1 m. 100 dB at 1 m falling to 78.3 dB at ~3.4 m looks like a broken inverse-square law until the reader works out that the seat sits on the Ψ₁₁₀ null. The 105 dB is the map's maximum, which is not stated either.

**Fix:** Label the key figure "map maximum 105 dB SPL" and add one clause to the SEAT SPL row or the plan label: "seat is on the Ψ₁₁₀ null — 21.7 dB below the antinode".

### 4. [MINOR] (certain)

**Wrong:** The plan map paints the room in large saturated fields of amber and cyan used as a SIGN convention (+p / −p). Everywhere else in the piece cyan means signal and amber means energy/current/heat (CONTRACT §3.5). A reader carrying that convention across eleven chapters will read the amber regions as "where the energy is", which is not what they mean.

**Fix:** Either state the local convention prominently in the map's own kicker ("colour is pressure SIGN, not the piece's signal/energy accent"), or repaint as a single-hue diverging ramp through the card's background value so the two lobes differ in value rather than hue.

### 5. [MINOR] (certain)

**Wrong:** For the flagship of the low-frequency chapter the subwoofer is under-detailed: a plain lacquer cube with four corner screws, a smooth grey cone with a featureless dome, a soft torus surround carrying one hard white specular crescent, no basket, no visible spider or motor, and a plate amp reduced to a strip with a bar-graph and two knobs on the pedestal.

**Fix:** Add a cast basket with open windows behind the cone, a distinct dust cap material, a machined trim ring with visible fasteners, and give the plate amp real controls (level, phase, low-pass defeat) with legends. Raise the surround's roughness so the crescent breaks up.

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
