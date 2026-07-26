# Audit findings — stage `speaker`

## Art-director scores (0-100; 100 = indistinguishable from a product photograph)

- **24** — Composition, framing and staging
  Worst frame. The 1.25 m floorstander is chopped into two disconnected pieces by an overlay slab and buried under a wireframe box, three cards and eight free traces.

- **33** — Materials, lighting and render quality
  The motor cutaway is untextured grey and pale-blue boxes with blotchy noise — the exact 'grey plastic box' the brief bans, and the worst material in the piece.

- **55** — Typography, information design and UI
  Five of nine labels sit on top of live graph traces; SEALED CHAMBER swings between the rail and fully off-screen.


## Findings for this stage (9)

### 1. [BLOCKER] (certain) — Composition, framing and staging

**What is wrong:** The 1.25 m loudspeaker does not read as one object. In shots/speaker.png the head unit (tweeter + midrange) sits isolated at upper-left, separated from the bass cabinet below by the bright horizontal plane of the motor-cutaway card; they read as two unrelated boxes. The baffle is additionally covered by a translucent cyan wireframe box, which destroys the single continuous specular running the height of the cabinet that is the whole Wilson signature.

**Fix:** Two changes in src/stages/speaker.js. (1) SHOT at :754 is [1.35,1.16,0.74] -> [-0.32,0.70,-2.49] fov 36 — a chest-height wide. A 1.25 m object needs a portrait treatment: drop to position [1.05, 0.86, 0.30], target [-1.40, 0.70, -2.45], fov 30, so the cabinet fills ~80% of the SAFE box height and the camera is below its midpoint. (2) Move the whole motor/cutaway overlay group to +X of the cabinet so nothing crosses the baffle, and delete the cyan bounding wireframe over the front face entirely — the cabinet's own edge highlight must be unbroken from plinth to top cap.

### 2. [MAJOR] (certain) — Composition, framing and staging

**What is wrong:** Label collision at the top of frame: "MOTOR FORCE / F = Bl·i / -13.4 N" and "CHARGE CARRIERS / oscillate — they never arrive / ±5.2 µm · shown ×200" overlap horizontally around device y 420-520, with "-13.4 N" touching "oscillate". Separately "SEALED CHAMBER / 30 L net · Vas 112 L / α = Vas/Vb = 3.73" prints on top of the active "09 Loudspeaker" rail pill and the turntable's plinth leg, and "EXCURSION · 96 dB / ±4.22 mm at 40 Hz" is drawn over the red band of another graph.

**Fix:** In src/stages/speaker.js separate the two top anchors by at least 0.30 m in world X and give the second an offset[1] of -34. Move SEALED CHAMBER to the cabinet's right side (offset [+80, 0]). Move EXCURSION off the red band onto the card's dark margin.

### 3. [MAJOR] (certain) — Materials, lighting and render quality

**What is wrong:** The motor cutaway is untextured grey and pale-blue boxes with a giant blotchy noise pattern across the magnet — exactly the 'grey plastic box' the contract bans, and the worst-looking material in the piece. In buildSection() (src/stages/speaker.js lines 596-620) `st` and `mg` are clones of steel and lamination, both of which carry roughnessMap = anodisedRough(512). The parts are built with slab()/ExtrudeGeometry, whose WorldUVGenerator emits UVs in metres, so a 0.021 m ring magnet samples about 2% of a 512 px noise texture — a single blotch magnified ~50x. That is the mottled cloud on the top magnet block in shots/speaker.png.

**Fix:** In src/stages/speaker.js buildSection(): set st.roughnessMap = null and mg.roughnessMap = null (and normalMap = null on any anodised clone used on slab geometry), or clone the texture and set .repeat.set(40,40) with wrapS/wrapT = RepeatWrapping. Then give the section real material separation: mg (ferrite) color 0x2e3238 roughness 0.72 metalness 0.35; st (pole and plates, machined low-carbon steel) color 0x8d949d roughness 0.30 metalness 1.0 with a 0.6 mm bevel on the gap corners so the top plate gets an edge highlight. Right now nothing in the motor has a broken edge and every corner is razor-sharp.

### 4. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The opening premise of 'Excursion, and why bass is hard' is wrong and contradicts its own conclusion: 'For a given SPL the piston must displace a fixed volume of air per cycle, and the radiated pressure goes as acceleration, so x ∝ 1/f².' Constant displaced volume per cycle gives x ∝ 1/f (constant volume velocity), not 1/f². The correct single premise is that far-field pressure is proportional to volume ACCELERATION, p = ρ·Sd·ω²·x/(2√2·π·r), so constant p ⇒ x ∝ 1/f². The arithmetic that follows (7.57 mm at 30 Hz, 0.682 mm at 100 Hz, ratio 11.1) is right; only the sentence is wrong.

**Fix:** Rewrite as: 'Far-field pressure follows volume acceleration, p = ρ·Sd·ω²·x̂/(2√2·π·r), so holding SPL constant forces x ∝ 1/f².' Delete the 'fixed volume per cycle' clause.

### 5. [MAJOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** SPL_REF = 96 dB is 'at 1 m, half space, ONE driver' (a source comment, speaker.js:73) but nothing on screen says so, while four woofers — two per cabinet, both cabinets — are visibly driven to the same excursion by update(). The readout reads 'SPL @ 1 m 96.0 dB' and the graph label 'Excursion · 96 dB'. Two drivers per cabinet at the same x is +6 dB, and the pair another +6 dB, so a reader watching the animation and reading the readout is out by up to 12 dB.

**Fix:** Change the readout key/unit to `{k:'SPL @1 m', u:'dB · 1 drv, 2π'}` and the graph label kicker to 'Excursion · 96 dB @ 1 m, one driver, half space'. Add the same qualifier to the excursion paragraph in content().

### 6. [MINOR] (certain) — Composition, framing and staging

**What is wrong:** A large unlabelled white arrow at device x 820-1050, y 520-570 points left at nothing, and a long amber arc runs from device x 680 to x 2240 across empty floor at the bottom of frame with no label and no visible endpoint. Both read as leftover construction geometry.

**Fix:** Either label them (the arrow presumably indicates force direction — attach it to the F = Bl·i label as a leader) or delete them. Unattached graphic marks are the strongest single tell that this is a WebGL demo rather than a render.

### 7. [MINOR] (certain) — Materials, lighting and render quality

**What is wrong:** The bass drivers are unresolved at hero scale. In the 1:1 crop of shots/speaker.png each woofer is a flat black dish inside a chrome-ish ring: no cast-basket spokes, no spider, no visible fasteners, no dust-cap separation, and the rubber roll surround catches a hard square instead of the crisp arc a real surround shows. GEO.driverBasket exists in src/core/geo.js line 296 and is not being used here, and mats().cone (roughness 0.88, sheen 0.55) gives no fibre texture at all.

**Fix:** In src/stages/speaker.js makeDriver(), add GEO.driverBasket behind each cone and a ring of GEO.screw at the flange (8 for the woofers, 6 for the mid) — CONTRACT.md rule 3 asks for exactly this and it is what sells the scale. Give mats().cone a fine radial normal map or at minimum drop roughness to 0.74 and raise sheenColor to 0x454b55 so the cone shows a value change from rim to apex. The hard square on the surround resolves with finding 2.

### 8. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** The motor-force vector floats free of the thing it acts on. update() writes fArrow/fHead at section-local y = 0.092 while the voice coil and the whole moving assembly sit at y = 0; at SEC_S = 4 that is 0.37 m of world space above the coil, and in shots/speaker.png the white arrow sits up beside the tweeter of the real cabinet, reading as interface chrome rather than as F = Bl·i on the coil.

**Fix:** Draw the arrow from the coil itself: y = 0 (or +R_WIND + 0.006, just clear of the winding), origin at X_GAPC + S.x, and keep the 'Motor force' label offset above it. Also delete the dead `U.markT.position.x = X_GAPC + S.x * 0.0;`.

### 9. [MINOR] (certain) — The mechanical and acoustic chain — turntable, phono, speaker, sub, air (loudspeaker engineer / measurement editor)

**What is wrong:** content() states 'F = Bl·i = 12.0 × 5 A = 60 N' as the worked example, but 5 A is never the simulated current: over the 30→100 Hz sweep at 96 dB the peak current runs 0.70–3.44 A and the peak force 8.3–41.3 N (I recomputed from forceFor()). The readout bars are also normalised to /5 A and /60 N, so the meters never exceed ~0.7 of full scale. An illustrative number that contradicts every live number on the same screen.

**Fix:** Either work the example at the stage's own operating point ('at 30 Hz and 96 dB the motor needs 41.3 N, so i = F/Bl = 3.44 A') or keep 5 A but flag it as the driver's rated maximum and normalise the bars to the live peaks (S.ip, F.peak).


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
