# Round-4 audit — stage `overview`

## Art-director score: **48/100** (-2 from 50)

> Standfirst count fixed, panel typography is excellent. But the system is small in a void, the floor returns almost nothing under twelve chassis, and the chain equation on screen now disagrees with spec.js's CHAIN by 0.22 dB.


## Findings for this stage (7)

### 1. [MAJOR] (certain)

**Wrong:** src/stages/overview.js:50-58 — `G_LADDER = Math.round(CHAIN.volumeDb)` rounds -19.23 to -19, then G_TOTAL is summed from the rounded rows (+80.17 dB) and V_TERM derived from the rounded total (2.9031 V, quoted on screen as '1.053 W in 8 Ω'). Every other chapter — preamp ('79.95 + 0.83 - 64 - 10 - 26 = -19.23'), phono ('+16.77 dB more lands 2.828 V — 1.000 W into 8 Ω'), air and speaker — quotes spec.js's canonical 2.8284 V = 1.000 W. The opening spread, which is the piece's contract with the reader, therefore states a different answer from the four chapters that derive it, and overview's own paragraph quotes 91.21 dB at 2.83 V in the same breath as 2.903 V at the posts.

**Fix:** overview.js:50 — do not round. Use `const G_LADDER = CHAIN.volumeDb;` and print the row as '- 9.23 dB  pre-amp: +10 line, -19.23 ladder'. The eq block then closes '= +79.95 dB → 2.828 V at the posts / = 1.000 W in 8 Ω, 1.29 W in the 6.2 Ω coil', which matches spec.js and every other chapter. Adjust the CHAIN GAIN readout accordingly.

### 2. [MAJOR] (certain)

**Wrong:** The cyan signal path is drawn as glowing tubes running box to box at the same visual weight as the physical interconnects and the amber mains loop, so three line systems compete and none reads. Real interconnects are dark and matte; the cyan is the diagram and it should be unmistakably thinner and brighter than any cable. The result in overview.png is neon spaghetti across the lower third.

**Fix:** overview.js — halve the cyan tube radius and raise its emissive so it reads as a drawn line rather than a lit cable, and either give the physical interconnects a separate dark mats().rubber run or drop them entirely on this stage so cyan and amber are unambiguously diagrammatic. Same treatment for the amber mains loop so the two diagram systems match each other in weight and differ only in hue.

### 3. [MAJOR] (certain)

**Wrong:** The whole system occupies roughly the lower 45 % of the safe box with a large empty grey field above it, and the floor reflection is nearly as strong and as large as the subject, so the bottom third of the frame is an upside-down duplicate rack. The level-diagram card floats unattached in the empty upper-left. This is the establishing shot of the piece and it reads as a small model on a wet floor.

**Fix:** Raise fill from 0.372 to ~0.46 and boom the target up so the subject centres in the safe box; move the level-diagram card down so its lower edge sits just above the loudspeakers rather than floating in the void. If the reflection still doubles the subject, this stage should fade the planar reflection's strength over distance more aggressively — but check core ownership before touching it and report rather than edit.

### 4. [MINOR] (likely)

**Wrong:** The wide shot does not show the whole system, which CONTRACT §1 requires of it. The right subwoofer is not visible at all and the left subwoofer overlaps the turntable plinth's leg frame from this azimuth, so the two read as one confused mass. The level-diagram card also has no marker or numeral at the POSTS end — the whole point of the plot, the number at the end, is not on it.

**Fix:** overview.js:656 — yaw the shot until LAYOUT.subL (-2.92, -3.28) clears LAYOUT.ttPlinth (-2.34, -2.28) in silhouette and both subs are inside the frame; az 0.50 -> ~0.38 with fov 29 -> 31 should do it without losing the outer loudspeakers. Add a dot and a value label at the POSTS end of the plot reading the corrected '+79.95 dBV = 2.828 V' (see finding 11), and label the amber dashed reference '2.83 V = 1 W into 8 Ω'.

### 5. [MINOR] (certain)

**Wrong:** The overview lands 2.903 V / 1.053 W at the posts (integer ladder step −19 dB) while the phono chapter lands 2.828 V / 1.000 W (exact residual −19.23 dB) for the same source and the same volume setting. Both are defensible and the overview computes HEAD_DB = +0.226 dB, but the footer key 'AT THE POSTS 2.903 V rms' carries no note, so a reader comparing chapters sees the terminal voltage disagree.

**Fix:** Append the reconciliation to the readout unit or the eq commentary: u: 'V rms · +0.23 dB over 2.828' — the level-diagram card already shows "+0.23 dB over one watt", so just make the footer agree with it.

### 6. [MINOR] (certain)

**Wrong:** Readout key 'MAINS · FULL OUT' prints 0.92 A with unit 'A' and no reference, while power.js's equivalent correctly prints 'A · 5.18 rms'. 0.92 A beside the words "full out" reads as the system's full-output line current, which is 5.18 A rms / 7.32 A peak.

**Fix:** Change u to `A · ${I_MAINS_PK.toFixed(2)} pk` (or the rms figure) so the instantaneous value has its scale.

### 7. [MINOR] (certain)

**Wrong:** The level diagram is captioned "+80.17 dB in five steps" but only about three risers are discernible in the drawn staircase — the −9.0 dB pre-amp step and the 0.0 dB crossover step are at or below one plot pixel, and the −0.83 dB loading loss is invisible. The reader is told to count five and can find three.

**Fix:** Label each riser with its own tick and value on the x axis (CART · LOAD · PHONO · PRE · XO · POSTS), or change the caption to "+80.17 dB, five gain blocks" and stop asking the reader to count risers.

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
