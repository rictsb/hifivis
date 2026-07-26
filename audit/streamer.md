# Round-2 audit — stage `streamer`

## Art-director score: **40/100** (-8 from round 1's 48)

> −8. Card content does not render. Best label system in the piece, attached to a black void.


## Findings for this stage (5)

### 1. [BLOCKER] (certain)

**Wrong:** src/stages/streamer.js: the overlay card is ~85% dead black. Neither DIAG.Graph draws at its declared size — only a ~50 px-wide fragment of one frame plus a sliver of the amber jitter band appears at the card's far right edge (around x 2900–3000, y 1450–1750 in shots/streamer.png), against a declared GW 0.235 × GH 0.155 that should be ~440 px wide. The AES3 ribbon shows 2 of its 36 Swarm cells. The DOM labels on the same card update live (106 ms, Δt = −38 ps, 0x5A9DF7), so update() runs; the failure is geometric. This is the worst functional defect in the set.

**Fix:** Debug the overlay build in buildOverlay() (lines 387–470). Check that og/eg are not being scaled or re-parented after `og.position.set(OGX, GY, 0.0006)`, that Graph's internal frame uses the w/h passed rather than a stale value, and that the Swarm `.update(i => …)` callback returns a position for every i in 0..7 and 0..27 rather than falling through to undefined for most indices. Re-shoot and confirm both plot boxes fill their declared width before touching anything else in this stage.

### 2. [BLOCKER] (certain)

**Wrong:** The overlay card in shots/streamer.png is an empty black plate (device x 725–1355, y 285–705 at 2000-px width) carrying three captions and nothing else. The AES3 subframe bit stream, the buffer strip chart and the clock eye are all absent from the plate; the only geometry visible is a fragment clipped against the card's right edge at x 1275–1310. The three labels therefore point at blank card.

**Fix:** In src/stages/streamer.js, re-check the card-local origin and scale of the three regions against the plate rectangle — the content appears to be positioned near or past the plate's right edge. Verify with node verify.mjs streamer and read the PNG before declaring done.

### 3. [MAJOR] (certain)

**Wrong:** The 'OCXO · 5.6448 MHz = 128 f_s · the whole jitter budget is 0.77 ps rms' label is anchored at device (485,797), which in shots/streamer.png is over the POWER CONDITIONER in bay 0, not over the streamer in bay 1 or its clock island. The label makes a specific claim about a specific part and points at the wrong chassis.

**Fix:** Re-anchor to the clock island (the code comments place it 60 mm behind the fascia, streamer.js:120) with a short leader, and give it offset that keeps the box over the streamer's own chassis.

### 4. [MINOR] (certain)

**Wrong:** streamer.js:52 RETX_ONE_IN = 380 is an invented constant, but content() states it as fact: 'one in 380 has to be sent again'. Same for BUF_TARGET = 120 ms and STALL_MEAN = 0.090 s — the buffer figure is at least flagged as 'a wired-LAN figure' in a code comment the reader never sees. Contract §6 requires every number on screen to be derived from stated inputs or an explicitly stated premise.

**Fix:** Write it as a stated modelling premise in the prose: 'modelled here at one segment in 380 needing a retransmission, with a 4.5 ms fast-retransmit round trip' and 'a 120 ms target buffer, a wired-LAN figure'.

### 5. [MINOR] (likely)

**Wrong:** The label 'AES3 SUBFRAME · CELLS AT 1 : 117,600' derives CELL_RATIO from BCLK = 64 fs = 2.8224 MHz (streamer.js:46), but the content() prose correctly says biphase-mark coding puts TWO half-cells in every bit, so the line's cell rate is 128 fs = 5.6448 MHz. If what is drawn are biphase cells the ratio is 235,200 : 1, not 117,600 : 1; if what is drawn are bits the label should say 'bits', not 'cells'.

**Fix:** Decide which the drawn elements are. If half-cells, use MCLK: CELL_RATIO = Math.round(MCLK / CELL_PER_REAL_S) = 235,200 and keep the word 'cells'. If bits, change the kicker to 'BITS AT 1 : 117,600'.


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
