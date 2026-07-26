# Audit findings — stage `turntable`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **58** — Composition, framing and staging
  The only real hero shot: proper three-quarter, clean diagonal, readable silhouette. Held back by two labels occluded by the tonearm and by unbacked outline diagrams that break the house language.

- **52** — Materials, lighting and render quality
  The one frame with a genuine product-photography moment — the platter rim arc. Undone by a dead-matte record with no groove sheen and no label, and blown square blobs on the dust cover.

- **62** — Typography, information design and UI
  Clean top band, and the one stage with a visible leader line that works (OUTER GROOVE). 'BELT DRIVE' floats 200px from the belt with nothing joining them.


## Findings for this stage (10)

### 1. [BLOCKER] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** src/stages/turntable.js:999 — the tangential groove-velocity arrows on the record point exactly opposite to the platter's rotation. The platter is driven by `platter.rotation.y -= OMEGA*dt` (line 1164); I verified numerically in three that a point at (x,z)=(r,0) then moves toward +Z, i.e. velocity = Ω·r·(−sin a, +cos a). The arrow helper uses `const tx = Math.sin(a), tz = -Math.cos(a)` — the negation of that. Both arrows (outer 0.510 m/s, inner 0.211 m/s) fly backwards along the groove, which is the one thing the annotation exists to show.

**Fix:** In tang(): `const tx = -Math.sin(a), tz = Math.cos(a);` and delete/keep the comment `// platter runs clockwise from above` (the rotation direction itself is correct — records do run clockwise here).

### 2. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** Two labels are cut by the hardware: "INNER GROOVE · 60.3 MM / λ at 10 kHz = 21 µm / 0.211 m/s" has its kicker broken by the dust-cover hinge, and "STYLUS ... / r 109.0 mm · 0.380 m/s" is bisected by the tonearm pillar and cueing lever. This is the depth-test bug manifesting — the labels sit in front of geometry they should be behind, or behind geometry they should clear.

**Fix:** Once the raycast in labels.js is implemented, re-anchor both to the platter's outer edge with offsets that place them over the plinth's flat black top rather than across the arm assembly: INNER GROOVE at offset [-110, +26], STYLUS at offset [+96, -18].

### 3. [MAJOR] (certain) — Materials, lighting and render quality

**What is wrong:** The record is dead matte black with no groove sheen and no label. mats().vinyl (src/core/materials.js line 173) is roughness 0.20, vinylGrooves roughnessMap, clearcoat 0.5 — it should throw a bright concentric anisotropic arc across the disc, which is the single most recognisable specular behaviour of a record under studio light. In the 1:1 crop it is a featureless black disk; the tonearm above it casts no visible reflection into it either, and the gloss plinth top under the platter is equally dead. The platter rim, by contrast, produces the best specular arc in the entire twelve-frame set, which proves the rig can do it — the disc surface just is not catching anything.

**Fix:** Two changes. In src/core/materials.js give M.vinyl anisotropy 0.85 with anisotropyRotation driven per-fragment is not available, so instead build the record disc as a LatheGeometry (not a plane/circle) with ~256 radial segments and radial UVs so the roughnessMap runs circumferentially, and set clearcoatRoughness 0.06, envMapIntensity 1.4. Then in src/stages/turntable.js add a printed label texture (a plain dark-amber annulus with fine concentric ruling is enough) — a record with no label reads as a rubber mat. This fix depends on finding 1 landing: with a proper camera-left bounce card there will finally be something for the disc to reflect.

### 4. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The cartridge output is quoted with no peak/rms marking anywhere, in the stage that defines it. turntable.js sets V_REF = 0.05 m/s and uses it as a PEAK velocity (A_L = V_REF/ω = 7.96 µm peak, V_L_PK = V_REF), then content() prints 'e = Bl·v = 8.06 mV·s/m × 0.050 m/s = 403 µV at the 5 cm/s reference' and the readout prints 'OUTPUT … µV' — all unqualified. If 5 cm/s is peak then the cartridge's rms output at that reference is 285 µV, not 403 µV. The brief lists rms/peak confusion as a specific trap.

**Fix:** In content() write 'e = Bl·v̂ = 8.06 mV·s/m × 0.0500 m/s peak = 403 µV peak = 285 µV rms (5 cm/s peak, 1 kHz)'. Add ' pk' to the OUTPUT readout unit and to the S.labEmf kicker ('e = Bl·v, instantaneous').

### 5. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The cartridge and its cable are two different components in two adjacent chapters. turntable.js: Bl = 0.42 T × 24 × 0.80 mm = 8.064 mT·m → 403 µV at 5 cm/s, tonearm litz WIRE_MM2 = 0.030 mm², I = 3.665 µA, drift 8.98 nm/s. phono.js: V_CART = 0.300 mV rms at '5 cm/s pk' (which implies Bl = 8.485 mT·m), WIRE_MM2 = 0.050 mm², I_PK = 3.857 µA, drift 5.67 nm/s. Same cartridge, same arm, same 10 Ω coil and 100 Ω load — and two different generators and two different cables, both printed on screen.

**Fix:** Pick one cartridge. Simplest: keep turntable's Bl = 8.064 mT·m and set phono's V_CART = 285e-6 (403 µV peak / √2, rms), re-deriving G_TOTAL_DB, V_OUT, G_REST_DB, SNR_DB and the eq block; and make WIRE_MM2 identical (0.030 mm²) in both files, updating both drift/displacement figures and the two myth boxes.

### 6. [MAJOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** On the magnified 45/45 card, the cyan (L) and violet (R) wall markers do not lie on the drawn groove walls — they run outside the grey profile and past the apex (visible at full resolution in shots/turntable.png). turntable.js:715-716: the apex-end point is written as `[ax - RB*0.9, ay + RB*0.55]` — the horizontal offset is 0.9·RB but the vertical is 0.55·RB, so the marker is drawn at slope 1.085 instead of the wall's exact 45°, ending ~0.0034 card-units (≈1.5 % of the card width, ~20 px at 3200) below the wall. At 1600:1 magnification, on the stage's key diagram, the mismatch is obvious.

**Fix:** Use the same coefficient for both axes: `wallL.write(i => i===0 ? [ax - RB*0.9, ay + RB*0.9, 0.0009] : [ax - D + w*MAG, CY, 0.0009])` and mirrored for wallR. Or simply run each marker from the apex (ax, ay) to the surface intersection — the wall is exactly 45° between them.

### 7. [MAJOR] (likely) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The lateral/vertical decomposition — the whole point of the 45/45 geometry — is drawn as two unlabelled white marks (decU on a rail at y = CY−D−0.026, decW on a rail at x = CX+D+0.024) floating inside the dark 'vinyl' fill, and the three DIAG.dimension callouts (groove width 60 µm, pitch 129 µm, tip radius 18 µm) carry no text at all. Four anonymous marks; nothing on the card tells the reader which is u and which is w, or that the long arrow at the bottom is the groove pitch.

**Fix:** Add two short DOM labels via ctx.labels on anchors at the ends of railU and railW ('u — lateral, (L+R)/√2' and 'w — vertical, (L−R)/√2', updated with the live µm value), and give the two dimension lines inline captions ('60 µm groove', '129 µm pitch'). That is +2 labels; drop the redundant 'Stylus · VTF 2.00 g' label (VTF is already in the Hertz label and the readouts) to stay inside the ten-label budget.

### 8. [MINOR] (likely) — Composition, framing and staging

**What is wrong:** A large detail-free black slab occupies device x 530-1260, y 905-1195 behind the platter — presumably the dust cover raised, but with no edge highlight, no glass reflection and no visible hinge it reads as an unexplained floating cube and eats the frame's upper-left quadrant. Meanwhile a bright sliver of the right loudspeaker is squeezed into the 30 px between the plinth and the panel at device x 2200-2260.

**Fix:** Give the dust cover the clearGlass material with a visible edge fillet and one soft-box reflection so it reads as a lid, or remove it from this shot. Nudge SHOT at turntable.js:616 to target.x -2.32 (from -2.200) so the right-hand speaker sliver falls fully outside the SAFE box rather than half in it.

### 9. [MINOR] (certain) — Materials, lighting and render quality

**What is wrong:** The cartridge — the subject of this stage's physics — is an unresolved dark box with a white blob, and the tonearm bearing yoke carries a hard-clipped white rectangle at roughly (740,250) in the 1:1 crop. Meanwhile the platter-edge knurl aliases into a shimmering dashed pattern, and there is no darkening where the platter rim meets the plinth or where the arm pillar meets it, so both float.

**Fix:** In src/stages/turntable.js give the cartridge body a bevelled two-part shell (bevelBox with r=0.0004) in mats().anodBlack with a separate mats().alu top plate, gold pin block from mats().gold, and a visible cantilever; at this framing it warrants ~15 more triangles' worth of silhouette. Replace the knurl instancing on the platter rim with a fine roughness/normal map so it cannot alias. Add GEO.contactShadow under the platter and the arm base — this only becomes visible once finding 7's floor-value change lands.

### 10. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** 'they oscillate ±1.4 pm — a hundredth of an atom' overstates the motion by ~1.8×. Against the copper nearest-neighbour spacing the phono stage itself uses (255.6 pm, fcc a/√2), 1.4286 pm is 1/179 of an atom spacing, and against a 128 pm atomic radius it is 1/90 of a radius. The comparison is also made against a different yardstick from the adjacent chapter, which correctly prints '1/283 of a copper atom spacing'.

**Fix:** Use the same yardstick as phono.js: 'they oscillate ±1.43 pm — 1/179 of the 255.6 pm spacing between copper atoms'.


---

## Core findings (already fixed by the lead — for context only, do NOT edit core)

The following were found across the whole piece and have been repaired in `src/core/*` and `src/app.css`:


- The studio environment had **no front hemisphere** — every camera-facing surface reflected black. `env.js` now has a beauty box, a front strip and two front wraps, and every emitter has a soft-edged diffusion map (the hard white squares on dust caps are gone).
- The floor now carries a **real planar reflection** (`src/core/reflector.js`), blurred with distance, with a soft knee so emissives do not clip.
- Exposure 1.30 → **1.58**; bloom threshold 0.92 → **1.06**, strength 0.42 → 0.30; chromatic aberration 0.0011 → **0.00032**.
- `DIAG.diagramCard` now writes depth and defaults to opacity **0.90**, so cards no longer ghost the hardware behind them.
- `GEO.contactShadow` now uses multiply blending against a white-surround texture, so contact shadows actually darken (including over the reflective floor).
- `lineMaterial` had `alphaToCoverage:true`, which made every stage fade-out silently fail. Fixed.
- **`DSP.butterHP` returned the complex conjugate** — every high-pass phase in the piece had the wrong sign. Fixed and verified: LR4 now sums to 0.000000 dB error across the band, −6.021 dB at fc, LP and HP in phase; LR2 summed in positive polarity nulls at −46.7 dB, confirming it needs one driver inverted.
- **`DSP.deltaSigmaStep` was broken.** Rewritten as a proper error-feedback modulator with NTF = (1−z⁻¹)ⁿ, FFT-verified: order 1 puts in-band noise 38 dB below the out-of-band density, order 2 puts it 55 dB below. Order ≥3 is now clamped, because an unscaled 3rd-order NTF has ‖NTF‖∞ = 8, far past Lee's rule for a 1-bit quantiser — measured, it stops shaping entirely. `DSP.ntfInfinityNorm(n)` and `DSP.DS_MAX_ORDER` are exported.
- **Labels are rebuilt** (`src/core/labels.js`): they now depth-test against opaque geometry, are pushed out of keep-out rects for the chapter rail / masthead / panel / transport, are nudged apart from each other, and are dropped rather than overprinted. Kickers are ASCII-folded in JS so **µ, Ω and π survive** (CSS `text-transform:uppercase` was turning "µV" into "ΜV"). Labels have a subtle scrim; pass `cls:'plain'` to opt out where the background is already dead space.
- **The panel is restructured**: head and readouts are now pinned, and only the prose scrolls. `.key` callouts and the live readouts are no longer below the fold. `.ro .bar` was a `<span>` with a height and no `display:block` — the meters never rendered. Fixed.
- The transport `#rate` chip now updates.
- `.eq` blocks are 11.5 px so longer lines survive the 388 px content box.
