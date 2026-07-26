# Round-4 audit — stage `power`

## Art-director score: **33/100** (-1 from 34)

> The top of the frame carries a full-width band of rainbow scanline moiré off the shelf trim — the single worst render artefact in the piece and the brightest thing in the shot. Meters are decals. Three diagram regions crowd each other and one is clipped by the panel.


## Findings for this stage (5)

### 1. [MAJOR] (certain)

**Wrong:** Three diagram regions plus two cards are simultaneously visible (the conductor cross-section, the carrier-swing card, and the 20 ms sine plot), the carrier-swing card overlaps the conductor card, and the right-hand edge of the conductor card and the 'cyan: the same at ×3,000 more' line run under the explanation panel and are clipped. Addendum B caps this at two cards and three plot regions and forbids overlap.

**Fix:** power.js — merge the carrier-swing text into the conductor card as a caption strip along its bottom, so there is one card. Move that card left by roughly 0.10 m in the camera's screen-right basis so its right edge clears x = 1120 px at 1600x1000. Keep the sine plot as the second card. Re-shoot and confirm nothing crosses the panel boundary.

### 2. [MAJOR] (certain)

**Wrong:** Three shelf light-strips render as pure-white bars with hard ends across the full width of the frame (shots/power.png at y ≈ 60-140, 640-690 and 1140-1190 in the 3200 px original). They are the brightest objects in the picture, brighter than either meter, and they read as light leaks rather than as lighting. The same artefact is in preamp, phono and dac.

**Fix:** These strips are clipping in linear HDR above the bloom threshold of 2.30. Drop their emissive intensity until the peak sits below 2.0 linear, or replace the bare emissive plane with a diffuser (a low-roughness strip lit by a hidden emitter). Verify: no pixel of the shelf strips above 95 % in any of the four frames.

### 3. [MAJOR] (certain)

**Wrong:** The conductor cutaway card and the "Energy front" label are laid over the streamer chassis and its lit 44.1 kHz display, so another stage's emissive prints through and around the card edges. ADDENDUM §B: cards go beside the hardware, not through it.

**Fix:** Move the cutaway card and its two labels camera-left into the clear backdrop between the rack and the safe box's left edge, or lower them so they sit against the dark shelf void rather than across a lit fascia.

### 4. [MINOR] (certain)

**Wrong:** The eight status LEDs on the conditioner fascia are an even 4x2 grid of identical flat dots with no lens, no countersink and no light spilling onto the surrounding panel. They read as a printed dot pattern. Real indicator LEDs sit in a bezel or behind a light pipe and put a faint pool of their own colour on the fascia around them.

**Fix:** power.js — recess each LED into a small countersink (a short bevelCyl bore in the fascia material) with a domed lens over it, and vary the group: two amber, one green, the rest dark. Add a very low-intensity PointLight or a small additive quad at each lit LED so the fascia picks up a faint pool.

### 5. [MINOR] (certain)

**Wrong:** The small v/i plot (0-20 ms, ±1) carries two traces — one amber, one cyan, ~90° apart — with no key, no axis kickers and no units on the y axis. The reader cannot tell which is line current (in phase with volts at the stated unity PF) and which is carrier displacement (quadrature), and the whole PF argument depends on that distinction.

**Fix:** Add a two-entry key above the plot: "amber i · cyan carrier x", and label the y axis "normalised to peak". One extra line; without it the picture is decorative.

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
