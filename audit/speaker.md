# Round-2 audit — stage `speaker`

## Art-director score: **36/100** (-1 from round 1's 37)

> −1. Framing repaired by the lead; drivers are still holes and the cabinet is still one flat value.


## Findings for this stage (6)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/speaker.js: the bass drivers have no cone. Crop shots/speaker.png at (1050,1050) 1000×900: each driver is a glossy black trim ring around a completely flat dark disc — no surround roll, no dust cap or phase plug, no spider, no basket spokes, no mounting screws. It reads as a hole. On the stage titled Motor & Cabinet, with a Wilson render as the benchmark, this is fatal; the driver is 60% of what a reader looks at. The same drivers appear in overview and air.

**Fix:** Build the driver properly with GEO helpers: a half-torus surround (mats().rubber, ~8 mm roll), a lathed cone from the surround inner edge to the neck (mats().cone or coneWeave), a domed dust cap (mats().dome), six countersunk GEO.screw on the flange, and a visible cast basket arm between flange and neck. The surround roll is what catches the front strip and makes a driver read as a driver — without it no amount of lighting will save the frame.

### 2. [BLOCKER] (certain)

**Wrong:** shots/speaker.png: the motor cutaway card (device x 900–1400, y 160–620) renders as a washed-out pale blob. The back plate, pole piece, ring magnet, top plate and the 8.5 mm gap — the whole point of the section — are not distinguishable; the coil outline, the flux arrows and the spider are lost. The secLamp PointLight (intensity 2.4 at 1.5 m range) is over-lighting the section slabs to near-white against a black card.

**Fix:** In src/stages/speaker.js buildSection(): drop secLamp.intensity to ~0.8 and pull it further off-axis, and raise the hairline outline opacity (the OUT = 0x9aa3ae boxes, currently opacity 0.55) to ~0.9 with width 1.4. Then re-shoot and confirm the gap slot, the two coil sections and the flux path all read as separate parts.

### 3. [MAJOR] (certain)

**Wrong:** src/stages/speaker.js: the cabinet has no clearcoat. Crop shots/speaker.png at (1050,1050): the side panel and the baffle sit at the same flat mid-grey with no vertical gradient, no environment reflection and no long unbroken highlight running down the cabinet. The brief names this specific quality; it is absent. The baffle corner is a hard edge with a token bevel and no wrapped highlight, so the cabinet does not read as one solid.

**Fix:** Use mats().pianoBlack (clearcoat 1.0 / clearcoatRoughness 0.028) or a clone of it rather than the current flat material, and increase the front and side edge radii to ~6 mm so a continuous fillet highlight runs the full height of the cabinet. That single unbroken vertical is what makes a Wilson render read as lacquer over a dark base.

### 4. [MAJOR] (certain)

**Wrong:** src/stages/speaker.js: three overlay regions are visible at once (motor cutaway card, Thiele–Small card, excursion inset) against the two-card limit, and two of them bisect the hero's silhouette. The T-S plot has no y-axis annotation at all and its cyan trace runs off the left edge of the plot box and terminates on the boundary rather than being framed. The amber fill in the excursion plot is a rectangle with a hard vertical right edge that has no relation to the curve running through it, and it is half hidden behind the EXCURSION label.

**Fix:** Drop to two cards and move both clear of the cabinet silhouette (camera-right). Label the T-S y-axis in dB with gridline values and set the x-range so the trace is fully inside the box. Either make the amber region a real area under the curve or label it explicitly as the Xmax band with its dB/mm value; as drawn it is unreadable.

### 5. [MAJOR] (certain)

**Wrong:** src/stages/speaker.js:757 and 1017 draw the live excursion dimension centred on x = 0, while the Xmax gate hairlines (lines 761-767) are centred on X_GAPC = −0.02425 (the coil's axial centre). The two rulers sit side by side at the same height with centres 24 mm apart in section-local units (~74 px on screen), so the reader compares live travel against an Xmax scale that is offset from it. The comparison is the whole point of the pair.

**Fix:** Change dm[0].write and dm[1]/dm[2].position.x in update() to be centred on X_GAPC: [X_GAPC ± xp, −0.094, 0.006], and likewise the static dim built at line 757.

### 6. [MINOR] (likely)

**Wrong:** The cabinets do not read as the described Wilson-idiom faceted gloss floorstander. In both shots/speaker.png and shots/overview.png they render as plain light-grey rectangular boxes with a visibly detached head module — the rake (3.5° / 11°), the gloss lacquer on the flanks and the alloy gantry are not legible, and the pianoBlack body reads mid-grey rather than black. In the overview the loudspeakers are the least convincing objects in the room.

**Fix:** Check that mats().pianoBlack survives speaker.js's hw() clone with its clearcoat intact, raise its envMapIntensity so the gloss picks up the front wraps, and increase the visual separation between head and bass modules by making the alloy gantry brighter and slightly proud. Then re-shoot overview and confirm the cabinets read as one object, not three stacked boxes.


---

## Whole-piece (core) findings that constrain you (14)

**1. [BLOCKER]** src/core/env.js: `frontStrip` (18 × 0.85 m at intensity 11.0, line 115) and `strip` (17 × 0.7 m at 12.0, line 136) are narrow enough that every alloy edge in the set returns a clipped 100%-white line rather than a highlight with a rolloff. Count them in one frame: preamp has ~12 blown shelf-lip bars plus four full-length blown rack posts; turntable has a blown plinth chamfer and a blown tonearm; sub has a blown surround ring; the rack in sub and preamp is a neon wireframe. This single pair of emitters is why the piece reads as CGI.

*Intended fix:* Widen and dim both: frontStrip to 18 × 2.6 m at ~3.4, strip to 17 × 2.2 m at ~3.8. Keep the same positions and rotations. The reflected image of the source then spans enough of each fillet to produce a gradient instead of a clipped line. Re-shoot preamp and phono to confirm the shelf trims read as a bright-to-mid ramp, not a bar. If the scene then reads flat, raise `beauty` (line 108) from 4.6 to ~6.0 rather than putting the strips back.

**2. [BLOCKER]** src/app.css line 51: `.wlab` is `white-space:nowrap; max-width:36ch` with no overflow rule, and `.wlab .k` (line 66) inherits nowrap. Any kicker longer than 36 characters spills outside its own scrim onto the render. Visible in air ('FLOOR BOUNCE · SOURCE 0.985 M BELOW THE FLOOR' — 'THE FLOOR' prints over the rack chassis with no backing), power ('THE FIRST TWO AT TRUE ×26 · THE THIRD THAT SAME SWING ~3000 MORE' overprints the neighbouring label), and turntable ('45/45 GROOVE — 1800 : 1 · MOTION 1 : 1000' runs under the adjacent card).

*Intended fix:* In src/app.css: remove `max-width:36ch` from `.wlab` and add `white-space:normal; max-width:34ch` to `.wlab .k`. Long kickers then wrap to a second line inside the scrim and the box grows to fit. Keep `white-space:nowrap` on `.wlab .v` only, so values never break.

**3. [BLOCKER]** The same hardware carries different primaries in different chapters. (a) Voice-coil dc resistance: speaker.js TS.Re = 6.2 Ω and air.js TS.Re = 6.2 Ω, but amp.js RE_COIL = 5.4 Ω (line 60) and xover.js RE_COIL = 5.4 Ω (line 58) — and both use it for the damping-resistance argument. (b) Sensitivity: speaker.js and air.js both derive 91.38 dB @ 2.83 V/1 m; overview.js:45 asserts SENS = 89, and its 89.5 dB / 75.8 dB SPL figures follow from the wrong number. (c) Cartridge output: turntable.js derives E_RMS = 285 µV at 5 cm/s; phono.js V_CART = 0.30 mV and overview.js V_CART = 0.30 mV. (d) Phono gain: phono.js G_STAGE_DB = 64.0; overview.js G_PHONO = 60.0. (e) Amplifier: amp.js is 300 W into 8 Ω and every load in the piece is 8 Ω nominal, but power.js:25 and overview.js:50 compute the headline 2281.8 W / 9.92 A mains draw from 'two 600 W monoblocks' (the 4 Ω rating). At 8 Ω the true full-output draw is (2×300)/0.55 + 100 = 1191 W, 5.2 A rms — half the number the whole mains chapter is built on.

*Intended fix:* Pick one set and propagate. Suggested: Re = 6.2 Ω everywhere (update amp.js RE_COIL and xover.js RE_COIL, and recompute DAMP_PEN / RD_ACT / RD_PAS / RD_PCT); overview SENS = 91.4 (import or restate the derivation); overview G_PHONO = 64.0 and re-solve G_LADDER so the total still lands on an integer-dB ladder setting; cartridge 285 µV rms in all three; and in power.js/overview.js either state the operating point as '2 × 300 W into 8 Ω' and recompute P_SYS = 1191 W, I_RMS = 5.18 A, I_PK = 7.33 A (and every drift figure that follows), or say explicitly on screen that the mains figure is the 4 Ω worst case, not this system's load.

**4. [BLOCKER]** Only xover.js adds DOM numerals to its plot axes. phono's RIAA graph (yRange −25…+25 dB, xRange 20–20 k), preamp's S/N graph (55…125 dB, 0…63), speaker's sealed-response (−27…+6 dB) and excursion (0…14 mm) graphs, sub's pressure map, air's comb plot and all six DAC plots carry tick marks with no values. Every one of these is presented as a measurement and none can be read to a value; the argument rests entirely on captions.

*Intended fix:* Copy the xover pattern (xover.js:508-531, the `tick()` helper with cls:'plain', occlude:false, priority:2) into phono (0, ±20 dB and 20 Hz / 20 kHz), preamp (60, 100, 120 dB and 0 / 63), speaker (0, −12, −24 dB; 0, 8, 14 mm; 15 Hz / 400 Hz and 24 / 200 Hz) and dac's two most load-bearing plots. Three to five short labels each; prune redundant captions to stay inside the ≲10-label budget.

**5. [MAJOR]** Every one of the twelve panels ends mid-sentence under the `#panel-scroll.more` fade mask (src/app.css line 120). Xover loses its entire 'COMMONLY GOT WRONG' block — only the red title survives; sub loses the last line of its mode arithmetic; amp, speaker, air, streamer, phono, preamp, overview and dac all cut mid-word. In a still frame a fade that truncates mid-glyph reads as a crop, not as a scroll affordance. Twelve of twelve stages also exceed the 320-word ceiling in ADDENDUM C.

*Intended fix:* Two changes. (1) In app.css move the mask start from `calc(100% - 34px)` to `calc(100% - 56px)` and add a visible affordance — a hairline rule plus a small chevron — so a reader sees 'there is more' rather than 'this is broken'. (2) Instruct every stage to cut content() to what fits above the fold at 1600×1000, roughly 230 words at 13.5 px/1.66, and to place .key or .myth in the first third per ADDENDUM C. Xover and sub are the urgent two: their callouts are entirely invisible.

**6. [MAJOR]** The chapter rail is illegible in half the stages. Its inactive items are var(--ink-3) grey on the raw canvas, so they vanish against a matte black diagram card (power, dac, sub, preamp, air) and again against a blown-white rack shelf (sub). In power, ten of twelve rail rows are effectively unreadable.

*Intended fix:* In src/app.css give the rail its own scrim independent of what is behind it — on the `#rail` container add `background:linear-gradient(90deg,rgba(7,8,11,.72) 0,rgba(7,8,11,.55) 62%,transparent 100%)` with a 4 px backdrop blur — and lift the inactive `.chap .t` colour from var(--ink-3) to var(--ink-2) at 0.62 alpha. The rail is chrome; it must never depend on the render behind it.

**7. [MAJOR]** src/core/reflector.js: the planar floor reflection is incomplete and inconsistent. In overview the speakers' drivers reflect but the cabinets do not, leaving floating dark rings on a grey field; in speaker the cabinet is absent from its own reflection while unrelated pale rectangles appear; in air the rack reflects as disconnected pale fragments rather than a coherent mirror image. The result reads as smudge, and a broken reflection is worse than none — it is the first thing a retoucher would flag.

*Intended fix:* Check the reflector's camera layers/frustum and its near/far planes: the missing objects are the tall ones, which suggests the mirror camera's frustum or its clip plane is cutting geometry above a height. Also confirm every stage's hardware is on the layer the reflector renders. Then bring the blur down — the current radius destroys the silhouette; a product-floor reflection wants a sharp first 200 mm falling to blur over ~600 mm, not uniform mush.

**8. [MAJOR]** src/core/room.js ttPlinth() line ~160: the `under` slab uses mats().wood and, lit by the current rig, renders as a saturated bright-orange strip along the plinth's front edge. It is the most saturated element in both the overview and speaker frames and is a hue outside the permitted palette. It reads as an accident, not as a material.

*Intended fix:* Either darken and desaturate it — clone mats().wood with `color.setHex(0x1a1410)` and `roughness 0.7` — or replace it with mats().anodBlack. Nothing in this set should carry a warm saturated hue except PAL.am used deliberately as a diagram accent.

**9. [MAJOR]** Every rack stage frames the whole rack instead of its own chassis, because `fill` is applied to a bounding RADIUS that is dominated by the chassis width (0.555 m) while `fill` is a fraction of the safe-box HEIGHT. phono.js uses HERO_R = 0.354 with fill 0.55: the 112 mm chassis ends up ~85 px tall in a 1250-px frame. Measured heights of the subject chassis in the current shots: phono ≈ 85 px, preamp ≈ 80 px, xover ≈ 145 px, streamer ≈ 80 px, dac hidden. In phono, preamp, streamer and xover a reader cannot tell which of the six identical rack units is the subject, and in phono and preamp the identifying label sits over a neighbouring unit's shelf.

*Intended fix:* For the six rack stages, pass frameShot a radius equal to the chassis HALF-HEIGHT plus a small margin (e.g. 0.09 for a 112 mm box) rather than its bounding sphere, and take fill 0.30–0.40 so the chassis is 250–340 px tall with the card beside it. Then anchor the identifying label to the subject chassis's own fascia with a short leader, not to the shelf above it.

**10. [MAJOR]** The pinned readouts and the world labels disagree in the same still frame on every animated stage, because the readouts refresh at 10 Hz while labels update every frame. Measured from the current shots: power reads CURRENT −6.31 A in the footer while the LIVE label on the same conductor says −11.75 A; air reads PARTICLE DISPL +0.265 µm while the parcel label says ξ = +0.544 of 0.546 µm peak (and the footer's +3.00 mm/s velocity is only consistent with its own 0.265, not with the label); sub reads CONE X −3.09 mm against a label of −3.37 mm; speaker reads COIL I −3.06 A against a label of −3.19 A. Since the piece is judged from stills, this reads as an arithmetic error.

*Intended fix:* Have update() write the SAME cached state object that readouts() reads, and drive the labels from that cached state rather than from the instantaneous phase — i.e. latch the display state at the readout tick. Alternatively raise the readout refresh to the frame rate. Either way, a screenshot must show one consistent instant.

**11. [MAJOR]** content() overruns the 320-word cap (ADDENDUM §C) on eight of twelve stages, measured from the rendered DOM with .eq blocks excluded: amp 428, power 400, streamer 385, air 359, xover 357, phono 347, turntable 343, preamp 338. sub 321 is borderline. Only overview (293), speaker (291) and dac (314) comply. In every one of these the prose scrolls out of sight below the pinned readouts.

*Intended fix:* Cut to 320. amp: drop the Damping section entirely (it duplicates the xover argument) and compress the Heat paragraph. power: cut the Fermi-velocity/mean-free-path sentence to one clause. streamer: cut the buffer/master-clock paragraph. air: cut the reverberant-field paragraph to one sentence. xover: cut the passive-network paragraph to the .eq plus one sentence.

**12. [MINOR]** src/app.css .wlab: the label scrims read as operating-system notification toasts, not as editorial annotation — 60% black fill, 4 px backdrop blur, 4 px radius, a white 1 px ring and a 10 px drop shadow. In a magazine a callout over a photograph is a hairline leader plus set text, or a clean flat rule-bounded box. The current treatment is the single most 'web app' element in every frame.

*Intended fix:* Flatten it: drop the box-shadow, drop the border-radius to 2 px, drop the white ring to rgba(255,255,255,.03), and raise the fill to rgba(7,8,11,.74) so the type carries on contrast rather than on blur. Add the leader dot (.wlab.lead already exists) to every label that annotates a world point, and use cls:'plain' wherever the label sits over dead space.

**13. [MINOR]** Dead instrument clusters. All six DAC readouts are compile-time constants (FS, WORD, NYQUIST, LSB, SNR 24-BIT, ZOH). Four of six streamer readouts are constants (PAYLOAD, BIT CLOCK, JITTER, SNR 10 kHz). xover has two (CROSSOVER, SLOPE), sub has three (MODE, DRIVE, SCHROEDER), speaker's SPL @ 1 m never moves because it is the drive premise, turntable's PLATTER and CONTACT P never move. The footer is described in the addendum as 'the instrument cluster'; a cluster where two thirds of the dials are painted on is not one.

*Intended fix:* Cap constants at two per stage and give the rest live values. DAC: current kernel count, instantaneous reconstructed voltage, live in-band noise at the cursor, ZOH droop at the cursor frequency. streamer: live buffer occupancy (already there), live arrival rate (already there), live Δt and its dBFS error from the eye. sub: live seat SPL as the second sub fades in, live Ψ sum.

**14. [MINOR]** src/core/dsp.js:196-201, classABDissipation: the comment says 'Total device dissipation, both halves: P_d = Vcc²/(π²·RL) at m = 2/π'. The function is correct but the total at m = 2/π is 2·Vcc²/(π²·RL) — the quoted expression is the per-half figure. Not displayed anywhere, but amp.js reimplements this and a future author reading the comment would be off by 2×.

*Intended fix:* Correct the comment to 'P_d(total) = 2·Vcc²/(π²·RL) at m = 2/π, i.e. Vcc²/(π²·RL) per half'. Core is frozen, so report only.


---

## What the lead has ALREADY fixed in core since these findings (do not redo, do not edit core)

- **The specular ramp.** The art director's headline finding was that nothing in
  the piece had a specular layer with a *gradient*: every bright thing was a
  clipped 100 %-white line or a flat emissive patch, giving a bimodal histogram
  with no mid-grey. Proximate cause was two very narrow emitters. `env.js` now
  runs `frontStrip` at 18 x 2.60 m / 3.4 and `strip` at 17 x 2.20 m / 3.8
  (was 0.85 m / 11.0 and 0.7 m / 12.0), and `strip2` at 8 x 1.35 / 3.0. The
  reflected image of a source now spans a fillet instead of clipping across it.
  **Consequence for you:** re-look at your stage. Materials you darkened to fight
  blown highlights may now be too dark, and emissive patches you brightened to
  compete may now be too hot.
- **`src/core/spec.js` — a single source of truth for the system's primaries.**
  See below. This is mandatory.
- **`DIAG.Graph.prototype.tickLabels(labels, opts)`** — axis numerals. See below.
- `.wlab` no longer clips long kickers (the `max-width:36ch` + `nowrap`
  combination spilled text outside its own scrim).

## MANDATORY: import your primaries from `src/core/spec.js`

The measurement editor caught the piece quoting the same hardware differently in
different chapters: voice coil 6.2 Ω vs 5.4 Ω, sensitivity 91.4 vs 89 dB,
cartridge 285 vs 300 µV, phono 64 vs 60 dB, and a mains draw computed from
"600 W into 4 Ω" while every other chapter ran an 8 Ω load. That is fatal to
trust and it is the first thing a reader can catch you on.

```js
import { MAINS, DRIVER, TS, SPEAKER, AMP, CABLE, DAMPING,
         CART, TT, PHONO, PREAMP, XOVER, DIGITAL, ROOM, CHAIN } from '../core/spec.js';
```

Verified values (all derived, and the gain ladder closes to 79.945882 dB both ways):

| quantity | value |
|---|---|
| `TS.Cms` | 659.37 µm/N |
| `TS.Qes` / `TS.Qts` | 0.37116 / 0.34102 |
| `TS.Vas` | 111.95 L |
| `TS.alpha` / `TS.fc` / `TS.Qtc` | 3.7318 / 60.907 Hz / 0.74182 |
| `TS.eta0` | 0.647 % |
| `TS.spl1W` | 90.11 dB @ 1 W / 1 m |
| `TS.spl283` (= `SPEAKER.sens`) | 91.21 dB @ 2.83 V / 1 m |
| `AMP.vRms` / `vPk` / `iPk` (300 W into 8 Ω) | 48.990 V / 69.282 V / 8.6603 A |
| `CABLE.rLoop` | 41.376 mΩ (there AND back) |
| `DAMPING.atTerminals` / `atDriver` | 400.00 / 130.34 |
| `CART.outRms` | 284.61 µV |
| `TT.vOuter` / `vInner` | 0.50964 / 0.20944 m/s |
| `CHAIN.totalDb` / `volumeDb` | 79.946 dB / −20.054 dB |

**Note the two sensitivities.** `spl1W` is one watt at one metre; `spl283` is
2.83 V at one metre, which is one watt into 8 Ω *by definition* but 1.29 W into
this 6.2 Ω coil, so it reads 1.11 dB higher. Quoting one with the other's
reference is the classic sensitivity fiddle. Use the right one and name it.

If your stage needs a primary that is not in `spec.js`, derive it locally from
what is, and say so in a comment. Do not re-declare a primary.

## MANDATORY: put numerals on your axes

Only `xover` did. A plot a reader cannot take a value off is a decoration, not a
measurement. Every `DIAG.Graph` you keep must call:

```js
graph.tickLabels(ctx.labels, {
  xVals: [20, 100, 1000, 10000], yVals: [-20, 0, 20],
  xFmt: DSP.fHz, yFmt: (v) => v.toFixed(0),
});
```
It creates `cls:'plain'`, `occlude:false`, `priority:2` labels parented to the
graph, so they track it and survive the collision pass. Keep the tick count low
(3–5 per axis) and state the unit once, in the graph's own caption label.
