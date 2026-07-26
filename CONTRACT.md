# Stage module contract — read this completely before writing a line

You are writing **exactly one file**: `src/stages/<id>.js`. Do not edit any other
file. Other agents own the other stages; the core is frozen.

Deliverable: an ES module `export default` object matching the shape below,
building reference-quality Three.js hardware + a physically honest explanatory
overlay, and prose that would pass a measurement editor.

---

## 1. The object

```js
import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

export default {
  id: 'dac',                    // never change
  title: 'Digital to Analogue', // panel H2 — may contain &nbsp; and &amp;
  nav: 'DAC',                   // chapter-rail label, ≤ 12 chars
  kicker: 'DAC',                // small uppercase eyebrow
  standfirst: 'One sentence…',  // ≤ 90 chars, sets up the idea
  shot: { position:[x,y,z], target:[x,y,z], fov: 34 },
  timeScale: 1,                 // simulated seconds per real second (see §5)
  alwaysUpdate: false,          // true only if hardware must animate off-stage

  build(ctx) { return { hardware, overlay }; },   // both THREE.Object3D | null
  update(dt, t, ctx) {},                          // dt & t are SIMULATED seconds
  setReveal(k, ctx) {},                           // optional; k = 0..1 activation
  content() { return '<p>…</p>'; },               // panel HTML
  readouts() { return [{k,v,u,cls,bar}]; },       // live numbers, 10 Hz
};
```

* `hardware` — the physical component. Added to the scene **once, permanently
  visible**, because the wide shot must show the whole system. Position it in
  world space using `LAYOUT`.
* `overlay` — everything explanatory (graphs, particles, field lines, cutaway
  internals). Added once and **auto-faded** by activation; you do not manage its
  opacity. Anything in here must tolerate `opacity` being scaled.
* `ctx` is the shared app: `{ THREE, scene, camera, renderer, mats, PAL,
  LAYOUT, SHOTS, DIAG, GEO, DSP, labels, stage }`.

---

## 2. Where your hardware goes (metres, +X right, +Y up, −Z away from listener)

| stage | placement |
|---|---|
| `power` | rack bay 0 |
| `streamer` | rack bay 1 |
| `dac` | rack bay 2 |
| `phono` | rack bay 3 |
| `preamp` | rack bay 4 |
| `xover` | rack bay 5 |
| `turntable` | on `LAYOUT.ttPlinth`, top surface at `y = LAYOUT.ttPlinth.top` |
| `amp` | both monoblocks, on `LAYOUT.monoL/monoR` (`y` is the stand's top) |
| `speaker` | both floorstanders at `LAYOUT.speakerL/R`, ~1.25 m tall |
| `sub` | both subs at `LAYOUT.subL/R` |
| `overview`, `air` | no hardware |

Rack bay geometry: usable width `LAYOUT.rack.w - 0.03` (0.555 m), depth
`LAYOUT.rack.d - 0.06` (0.44 m). Vertical centre:
`LAYOUT.bayCentre(bayIndex, yourHeight)`. Max heights per bay, in order:
`0.150, 0.145, 0.145, 0.160, 0.160, 0.150`. Front face is at `+Z`.

The rack, plinth, amp stands, floor and cyclorama already exist. Do not rebuild
them.

---

## 3. Look — non-negotiable

The benchmark is a Wilson Audio / McIntosh / Devialet product render.

1. **No razor edges.** Use `GEO.chassis()`, `GEO.bevelBox()`, `GEO.bevelCyl()`.
   Never `new THREE.BoxGeometry` for anything the camera sees. The thin bright
   line on a broken edge is most of what makes an object look real.
2. **Materials come from `mats()`.** Never invent a `MeshStandardMaterial`.
   Available: `alu, aluV, anodBlack, anodGrey, chrome, steel, gold, copper,
   magnetWire, lamination, pianoBlack, graphite, plastic, rubber, glass,
   clearGlass, cloth, cone, coneWeave, dome, wood, pcb, vinyl, floor,
   meterGlow, ledCyan, ledAmber, ledGreen, ledRed`. `.clone()` one and tweak
   `color`/`roughness` if you need a variant.
3. **Detail density sells scale.** Screws (`GEO.screw`), vents
   (`GEO.ventSlots`), heatsink fins (`GEO.heatsink`), knurling (`GEO.knob`),
   connectors (`GEO.bindingPost`, `GEO.rcaJack`, `GEO.xlr`, `GEO.iecInlet`).
   A bare bevelled box is a fail.
4. **Shadows on.** `castShadow = receiveShadow = true` on every solid mesh, or
   call `GEO.shadowed(group)`. Add `GEO.contactShadow(w,d)` under floor-standing
   items.
5. **One accent colour.** Cyan `PAL.cy` for signal, amber `PAL.am` for
   energy/current/heat, red `PAL.rd` only to mark a myth, green `PAL.gr` only to
   mark the correct answer. No other hues.
6. Emissive things (`meterGlow`, LEDs) are `MeshBasicMaterial` with
   `toneMapped:false`; bloom threshold is 0.92, so keep them bright but small.

---

## 4. Diagrams — use the shared language, don't invent one

From `DIAG`:

* `new DIAG.Graph({w,h,xLog,xRange,yRange,xTicks,yTicks,zeroLine})` then
  `.addTrace(fn,{color,width,dashed})`, `.addArea`, `.addMarker`, `.addDot`,
  `.addBand`, `.refresh()`. Local origin = bottom-left of the plot box.
* `new DIAG.Trace(n, color, width)` + `.write((i,t)=>[x,y,z])` for arbitrary
  animated polylines. `.setProgress(0..1)` draws it on.
* `DIAG.diagramCard(w,h)` — dark backing plate; put it behind a Graph.
* `new DIAG.Swarm(count,{color,size})` + `.update(i => ({p:[x,y,z], s, c}))`
  for particles (charge carriers, samples, air parcels).
* `DIAG.tube(points, r, mat)`, `DIAG.dimension(a,b)`, `DIAG.glow(color,size)`.

**All explanatory text is DOM,** never a canvas texture:
`ctx.labels.add(anchorVec3OrObject3D, {kicker, text, value, cls:'acc'|'am',
offset:[dx,dy]})` → returns `{setValue, setText, setKicker, visible, opacity}`.
Update `setValue()` inside `update()`. Keep to ≲ 10 labels; they are the
typography and they must not collide.

Diagram planes should face the stage camera. Position them beside the hardware,
not through it, at roughly 1.2–2× the component's size.

---

## 5. Time

`timeScale` is **simulated seconds per real second**. The user can scale it
0.05×–3×. Pick it so the phenomenon is legible:

* 50 Hz mains → `timeScale ≈ 0.02` (one cycle ≈ 1 s on screen)
* 1 kHz audio → `≈ 0.002`
* 44.1 kHz samples → `≈ 2e-5`
* 6.144 MHz DSD → `≈ 2e-7`
* a 33⅓ rpm platter → `1` (real time)

`update(dt, t, ctx)` receives simulated dt and accumulated simulated t. If two
phenomena in one stage differ by orders of magnitude, derive the fast one from
`t` with its own multiplier and **say so in a label** ("shown at 1 : 4×10⁶").

---

## 6. Physics — a beautiful lie is worse than an ugly truth

A loudspeaker engineer will audit this and reject anything wrong. Every number
on screen must be derived, not chosen. Use `DSP` (it has RIAA time constants,
Linkwitz-Riley, Thiele–Small, drift velocity, quantisation/noise-shaping SNR,
sinc reconstruction, room modes, SPL). Show your arithmetic in `content()`.

**Three things are explicitly banned and will be hunted for:**

1. **Dots racing along a wire at signal speed.** Electron drift in copper is
   ~10⁻⁴ m/s — sub-millimetre per second — and on AC it does not travel at all,
   it oscillates about a fixed point with a peak displacement of order a
   micrometre. The *field/energy* propagates at ~0.6–0.7 c. If your stage shows
   a wire, it must show **both**, at their true ratio, and make the contrast the
   point.
2. **One-way current.** Current is a closed loop. Any circuit you draw needs its
   return path visible — live *and* neutral, hot *and* ground, signal *and*
   return. No arrows that go and never come back.
3. **The stair-step reconstruction myth.** A DAC's output after reconstruction
   is the unique band-limited function through the samples, not a staircase.
   If a staircase appears anywhere it must be explicitly labelled as the
   zero-order-hold *intermediate* and shown being removed by the reconstruction
   filter, with the sinc sum drawn.

Other traps: don't confuse rms and peak; don't quote SPL without a distance;
don't claim a sealed box rolls off at 24 dB/oct (it is 12); don't imply bits =
dynamic range without the 6.02·N + 1.76 relation; RIAA is 3180/318/75 µs, poles
at 50.05 Hz and 2122 Hz, zero at 500.5 Hz; LR4 sums flat in magnitude with both
drivers in-phase (LR2 needs one inverted).

---

## 7. Prose

`content()` returns HTML for a 63-character-measure panel. House style:

* 150–320 words. Short paragraphs. British spelling. Present tense.
* `<h3>` for small mono section labels, `<p>`, `<ul><li>`, `<b>`, `<em>`.
* `<span class="num">1.5 × 10⁻⁴</span>` for any inline number.
* `<div class="eq">…</div>` for a displayed equation (monospace, `\n` preserved,
  wrap commentary in `<span class="c">`, highlight in `<span class="hl">`).
* `<div class="key"><span class="lab">The idea</span><p>…</p></div>` for the
  one thing to remember.
* `<div class="myth"><span class="lab">Commonly got wrong</span><p>…</p></div>`
  when you are killing a misconception.
* Lead with the physical mechanism, then the arithmetic, then the consequence.
  No marketing adjectives. No "simply" / "just". Never say "magic".

`readouts()` returns 2–6 objects `{k, v, u, cls, bar}` — `k` uppercase short
label, `v` the value **as a string you formatted** (use `DSP.si`, `DSP.fHz`,
`toFixed`), `u` unit, `cls` `'acc'|'am'|''`, `bar` optional 0..1 meter. The keys
must be stable across calls (the DOM is only rebuilt if they change).

---

## 8. Verify before you finish — required

```bash
node build.mjs && node shoot.mjs <your-stage-id>
```

Must print `clean console`, ≥ 30 fps, and produce `shots/<id>.png`. **Read that
PNG back and look at it.** Iterate until it is genuinely beautiful: correct
framing, no clipping through geometry, no z-fighting, labels legible and not
overlapping, the diagram readable, the hardware detailed.

Also run `node shoot.mjs overview` to confirm you have not broken the wide shot
(your hardware must look right in it too).

If a core helper is genuinely broken, say so in your final report — do not patch
core files.

## 9. Report back

Return a short structured report: what you built, the physics claims you make
and where each number comes from, anything you could not do, and the fps/draw
calls from your last run.
