import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { XOVER, SPEAKER, AMP, CABLE, DRIVER, DAMPING } from '../core/spec.js';

/* ===========================================================================
   ACTIVE CROSSOVER — rack bay 5, the top unit.

   Linkwitz–Riley 4th order, three ways, in the cascade topology:

       low  = LP4(fL)
       mid  = HP4(fL) · LP4(fH)
       high = HP4(fL) · HP4(fH)

   One instrument panel, two plot regions, everything docked inside it — the
   legend included. The panel carries the only picture that beats prose: the
   three bands, each −6.02 dB at its own crossover, the green sum on 0 dB, and
   the LR2-every-driver-positive mistake beside it as two deep bowls.

   EVERY PRIMARY COMES FROM ../core/spec.js. Nothing here re-declares a
   crossover frequency, a nominal impedance, a cable resistance, an output
   impedance or a voice-coil resistance.
   =========================================================================== */

// ---------------------------------------------------------------------------
// Primaries (imported) and what they imply (derived here)
// ---------------------------------------------------------------------------
const FL = XOVER.fLow;                  // 80 Hz
const FH = XOVER.fHigh;                 // 2200 Hz
const ORDER = XOVER.order;              // 4
const SLOPE_DB_OCT = 20 * ORDER * Math.log10(2);   // 24.0824 dB/oct
const XO_DB = DSP.dB(0.5);              // −6.0206 dB — each band at its own fc

// --- the passive network this box exists to avoid ---------------------------
// A passive LR4 low-pass is TWO cascaded 2nd-order sections, not one coil. The
// textbook Butterworth pair, into a resistive R at ω_c, is
//     L = √2·R/ω_c      C = 1/(√2·R·ω_c)
// but two of those cascaded directly do NOT realise LR4: the first section is
// terminated by the second's finite input impedance, not by R, so a real ladder
// has four different element values and has to be co-designed. What survives is
// the PART COUNT and the series copper, which is the whole argument here.
const Z_NOM = SPEAKER.nominalZ;         // 8 Ω nominal load
const W_C = DSP.TAU * FL;               // 502.65 rad/s
const L_SEC = (Math.SQRT2 * Z_NOM) / W_C;          // 22.51 mH per section
const C_SEC = 1 / (Math.SQRT2 * Z_NOM * W_C);      // 175.8 µF per section
/* The series copper, DERIVED rather than asserted. A 22.5 mH multilayer air
   core takes about 96 m of wire; wound in 12 AWG (3.31 mm²) — which is what a
   serious passive woofer inductor is wound in, because anything thinner costs
   more decibels than it saves in money — ρ·L/A with the same ρ the cable uses
   gives 0.500 Ω a section. */
const COIL_LEN_M = 96;                  // m of wire in one 22.5 mH air core
const COIL_MM2 = 3.31;                  // 12 AWG
const R_SEC = (CABLE.rhoCu * COIL_LEN_M) / (COIL_MM2 * 1e-6);   // 0.500 Ω
const N_SEC = ORDER / 2;                // two 2nd-order sections in an LR4
const R_NET = N_SEC * R_SEC;            // 1.00 Ω of series copper

// Series resistance in the voice-coil loop, identical in both cases except for
// the network itself. Cable and output impedance come from spec.js so this
// chapter and the monoblock chapter quote the same wire.
const RS_ACT = AMP.zOut + CABLE.rLoop;             // 61.4 mΩ
const RS_PAS = RS_ACT + R_NET;                     // 1.0614 Ω
// Damping factor AT THE DRIVER, which is the only place it means anything: the
// 400 that DAMPING.atTerminals returns ignores the cable that is always there.
const DF_ACT = DAMPING.atDriver;                   // 130.3
const DF_PAS = DSP.dampingFactor(Z_NOM, RS_PAS);   // 7.5
const RE_COIL = DRIVER.Re;                         // 6.2 Ω, voice-coil dc resistance
const RD_ACT = RE_COIL + RS_ACT;                   // 6.261 Ω — what actually damps the cone
const RD_PAS = RE_COIL + RS_PAS;                   // 7.261 Ω
const RD_PCT = 100 * (RD_PAS / RD_ACT - 1);        // +16.0 %
// Insertion loss. A loss is a positive quantity; the signed level change is
// negative. Print the magnitude and call it a loss, or the reader is invited to
// think the passive network has a decibel of gain.
const INSERT_DB = DSP.dB(Z_NOM / (Z_NOM + RS_PAS)) - DSP.dB(Z_NOM / (Z_NOM + RS_ACT));
const INSERT_LOSS = Math.abs(INSERT_DB);           // 1.02 dB
// The NETWORK'S OWN share of the power in the loop — not the cable's, not the
// amplifier's. Those two are present in the active case as well.
const LOSS_PCT = (100 * R_NET) / (Z_NOM + RS_PAS); // 11.0 %

const SWEEP_S = 16;                     // seconds per cursor round trip

// ---------------------------------------------------------------------------
// Filter maths — every trace is evaluated from these complex responses
// ---------------------------------------------------------------------------
const LP = (f, fc, n) => DSP.lrLow(f, fc, n);
const HP = (f, fc, n) => DSP.lrHigh(f, fc, n);

const bLow = (f) => LP(f, FL, ORDER);
const bMid = (f) => DSP.cMul(HP(f, FL, ORDER), LP(f, FH, ORDER));
const bHigh = (f) => DSP.cMul(HP(f, FL, ORDER), HP(f, FH, ORDER));
const bSum = (f) => DSP.cAdd(DSP.cAdd(bLow(f), bMid(f)), bHigh(f));

// The same three-way built as LR2 with every driver positive — the myth trace.
// It is not a copy of any band limb: it rides within a decibel of 0 dB across
// most of the band and collapses into two bowls, −28.8 dB at fL and −57.6 dB at
// fH, which is a shape nothing else on the plot has.
const b2Sum = (f) => DSP.cAdd(
  LP(f, FL, 2),
  DSP.cAdd(DSP.cMul(HP(f, FL, 2), LP(f, FH, 2)), DSP.cMul(HP(f, FL, 2), HP(f, FH, 2))),
);

const dbOf = (fn) => (f) => DSP.dB(DSP.cAbs(fn(f)));

/* Phase of the sum is not a product, so it is unwrapped numerically on a log
   grid and group delay taken as −dφ/dω by central difference. */
const DEG = 180 / Math.PI;
const NTAB = 1024;
const TAB_F = DSP.logSpace(20, 20000, NTAB);
const TAB_PH = new Float64Array(NTAB);   // radians, unwrapped
const TAB_GD = new Float64Array(NTAB);   // seconds
(function buildTable() {
  let off = 0;
  let prev = DSP.cArg(bSum(TAB_F[0]));
  for (let i = 0; i < NTAB; i++) {
    const a = DSP.cArg(bSum(TAB_F[i]));
    let x = a + off;
    while (x - prev > Math.PI) { off -= DSP.TAU; x = a + off; }
    while (x - prev < -Math.PI) { off += DSP.TAU; x = a + off; }
    TAB_PH[i] = x; prev = x;
  }
  for (let i = 0; i < NTAB; i++) {
    const a = Math.max(0, i - 1), b = Math.min(NTAB - 1, i + 1);
    TAB_GD[i] = -(TAB_PH[b] - TAB_PH[a]) / (DSP.TAU * (TAB_F[b] - TAB_F[a]));
  }
})();
function tabLookup(arr, f) {
  const u = (Math.log10(DSP.clamp(f, 20, 20000)) - Math.log10(20)) / 3;
  const x = DSP.clamp(u * (NTAB - 1), 0, NTAB - 1.0001);
  const i = Math.floor(x);
  return DSP.lerp(arr[i], arr[i + 1], x - i);
}
const sumPhaseDeg = (f) => tabLookup(TAB_PH, f) * DEG;
const groupDelay = (f) => tabLookup(TAB_GD, f);

// Measured worst-case sum error and the group-delay peak.
let SUM_ERR = 0, SUM_ERR_F = 0, GD_PEAK = 0, GD_PEAK_F = 0;
for (let i = 0; i < NTAB; i++) {
  const d = DSP.dB(DSP.cAbs(bSum(TAB_F[i])));
  if (Math.abs(d) > Math.abs(SUM_ERR)) { SUM_ERR = d; SUM_ERR_F = TAB_F[i]; }
  if (TAB_GD[i] > GD_PEAK) { GD_PEAK = TAB_GD[i]; GD_PEAK_F = TAB_F[i]; }
}
const GD_FH = groupDelay(FH);                           // 0.212 ms
const PHASE_SPAN = sumPhaseDeg(20) - sumPhaseDeg(20000); // 660°

/* The group-delay axis is LOGARITHMIC in milliseconds. On a linear 0–8 ms axis
   the trace is flat on zero from 200 Hz up — two thirds of the plot dead, and
   the 2.2 kHz crossover's own 0.21 ms contribution invisible. Three decades of
   ms put both quoted figures on the same picture. */
const GD_LO_MS = 0.01, GD_HI_MS = 10;
const gdMs = (f) => groupDelay(f) * 1e3;
const gdLog = (f) => Math.log10(Math.max(1e-9, gdMs(f)));

// Magnitude axis. −36 dB puts every band's own −36 dB crossing inside the box,
// so no trace is ever floored along the bottom axis.
const DB_LO = -36, DB_HI = 6;

const fmtF = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(0)} Hz`);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------
/**
 * THE SPECULAR LAYER.
 *
 * `GEO.instrumentGlass` and nothing else. Revision 2 rolled its own convex
 * panel here at roughness 0.05–0.06 with envMapIntensity ~2 and additive
 * blending, which is the near-mirror Addendum J was written to stamp out: on a
 * panel this size it returns most of a softbox at full strength and blooms.
 * The helper is crowned, so the source sweeps across as a band rather than
 * sitting still as a rectangle, and `reflectivity` 0.34 is a coated cover glass
 * returning ~1.7 % at normal incidence rather than an uncoated 4 %.
 */
function coverGlass(w, h, opts = {}) {
  const m = GEO.instrumentGlass(w, h, opts);
  m.castShadow = m.receiveShadow = false;
  m.userData.isLens = true;
  return m;
}

/**
 * The instrument panel the plots live on: a bevelled slab with a machined
 * bezel, an inset screen and cover glass over it. Local origin is the
 * bottom-left of the screen, so the Graphs are positioned in panel coordinates.
 *
 * NOT `DIAG.diagramCard`: `DIAG.fadeTree` calls a group's `userData.setOpacity`
 * and then *keeps traversing into its children*, so a card's plate mesh has its
 * `_baseOp` captured after setOpacity has already scaled it to zero on the
 * first (o = 0) call — the card is then permanently invisible. Everything here
 * owns its material outright and exposes no `setOpacity`.
 *
 * `depthWrite` is ON for the screen. With it off the plate is a ghost and the
 * rack shelves print straight through the graph.
 */
function panel(w, h, opts = {}) {
  /* `bw` is the bezel bar's width, `gap` the machined land between the screen
     aperture and the bar. Revision 3 put the bars BEHIND the screen quad and
     made the quad larger than the aperture, so the frame was invisible and the
     panel read as a black rectangle with a hairline — a UI div again. The bars
     now stand 4 mm proud of the screen and the quad is exactly the aperture. */
  const { bw = 0.0095, gap = 0.0032, thick = 0.014 } = opts;
  const bezel = bw + gap;
  const M = mats();
  const g = new THREE.Group();

  // Bevelled body with real thickness, lit and shadowed like any other object.
  /* Not 0x0d0f13. Measured over the frame, the piece's mid-tone mass is 54 %
     and this one's was 37 %: too much of the picture sat in the bottom two
     tenths, and the panel's own body — the largest single object above the rack
     — was most of it. A dark instrument case is a dark GREY that shades across
     its face, not a black rectangle. */
  const body = M.anodBlack.clone();
  body.color = new THREE.Color(0x191c22);
  body.roughness = 0.42 / AN_MEAN;
  body.envMapIntensity = 1.28;
  const slab = new THREE.Mesh(
    GEO.bevelBox(w + bezel * 2, h + bezel * 2, thick, 0.0030, 4), body,
  );
  slab.position.set(w / 2, h / 2, -thick / 2);
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);

  // Inset screen: the dark ground the traces are drawn on, exactly the size of
  // the aperture the bezel frames.
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color: 0x070a0e, transparent: true, opacity: 0.95,
      depthWrite: true, toneMapped: false,
    }),
  );
  screen.position.set(w / 2, h / 2, 0.0004);
  screen.renderOrder = 3;
  g.add(screen);

  /* Machined bezel: four satin bars standing 4 mm proud around the aperture,
     with a 1.2 mm break on every edge. This is where the stage's specular event
     actually lands — the glass over a dark screen returns almost nothing, but
     the bezel's fillet takes the horizon band and bends it round the corners,
     which is what tells the eye there is a milled frame with a front and a side
     rather than a rectangle drawn on the backdrop. */
  const bez = satin(M.aluTrim, 0.44, 0.56, AN_MEAN);
  const bd = 0.0062;
  for (const [ww, hh, x, y] of [
    [w + bezel * 2, bw, w / 2, h / 2 + h / 2 + gap + bw / 2],
    [w + bezel * 2, bw, w / 2, -gap - bw / 2],
    [bw, h + gap * 2, -gap - bw / 2, h / 2],
    [bw, h + gap * 2, w + gap + bw / 2, h / 2],
  ]) {
    const b = new THREE.Mesh(GEO.bevelBox(ww, hh, bd, 0.0012, 3), bez);
    b.position.set(x, y, bd / 2 - 0.0016);
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
  }

  // Hairline just inside the aperture.
  const b = new DIAG.Trace(5, 0x46505c, 1.1, { opacity: 0.8, renderOrder: 5 });
  const x0 = -0.0016, y0 = -0.0016, W = w + 0.0032, H = h + 0.0032;
  b.write((i) => [[x0, y0], [x0 + W, y0], [x0 + W, y0 + H], [x0, y0 + H], [x0, y0]][i].concat(0.0008));
  g.add(b);

  // The specular layer, 3 mm in front of the traces and down inside the bezel's
  // own 4 mm of relief. The helper's crown (4.5 % of the short side) is left
  // alone: flattening it turns the sweeping band back into a static rectangle.
  const glass = coverGlass(w + gap * 1.4, h + gap * 1.4);
  glass.position.set(w / 2, h / 2, 0.0030);
  g.add(glass);
  g.userData.glass = glass;

  return g;
}

/**
 * The panel's foot. Addendum D: nothing floats. This one stands on the rack's
 * own top plate — a machined base bar, two short posts and a contact shadow —
 * so the card is a bench instrument sitting on the rack rather than a flatscreen
 * hovering over it, and the plate below it carries the shadow that proves it.
 *
 * Returns the mount group; `userData.deck` is the local y at which the panel's
 * lower edge sits.
 */
function cardStand(w) {
  const M = mats();
  const g = new THREE.Group();
  const alu = satin(M.aluTrim, 0.46, 0.56, AN_MEAN);

  const baseH = 0.0062, postH = 0.0112;
  const base = new THREE.Mesh(GEO.bevelBox(w * 0.62, baseH, 0.052, 0.0014, 3), alu);
  base.position.set(0, baseH / 2, 0.002);
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(GEO.bevelBox(0.0165, postH, 0.0115, 0.0011, 3), alu);
    post.position.set(s * w * 0.245, baseH + postH / 2, 0.002);
    post.castShadow = post.receiveShadow = true;
    g.add(post);
    const cap = GEO.screw(0.0017);
    cap.position.set(s * w * 0.245, baseH + postH * 0.55, 0.0090);
    g.add(cap);
  }

  const sh = GEO.contactShadow(w * 0.98, 0.125, 0.70, 0.0009);
  g.add(sh);

  g.userData.deck = baseH + postH;
  return g;
}

/**
 * Draw a function as ONE POLYLINE PER RUN that is inside the plot box, with the
 * ends carried exactly to the bottom axis.
 *
 * `Graph.addTrace` clamps out-of-range samples, which is right for a curve that
 * dips off-scale once and wrong for a filter band: an LR4 high-pass is 200 dB
 * down at 20 Hz, so the clamp lays a solid horizontal line along the bottom of
 * the box for most of its width and three of those on top of each other read as
 * a real trace. Segmenting is the only honest fix.
 */
function runTraces(g, fn, opts = {}) {
  const {
    color = PAL.cy, width = 1.6, opacity = 1, n = 560, dashed = false,
    dashSize = 0.0060, gapSize = 0.0038, z = 0.0006,
  } = opts;
  const [y0, y1] = g.o.yRange;
  const xs = DSP.logSpace(g.o.xRange[0], g.o.xRange[1], n);
  const ys = new Array(n);
  for (let i = 0; i < n; i++) ys[i] = fn(xs[i]);
  // log-x interpolation of the crossing of the floor
  const cross = (i) => {
    const t = (y0 - ys[i - 1]) / (ys[i] - ys[i - 1]);
    return Math.pow(10, Math.log10(xs[i - 1]) + t * (Math.log10(xs[i]) - Math.log10(xs[i - 1])));
  };
  const runs = [];
  let run = null;
  for (let i = 0; i < n; i++) {
    if (ys[i] >= y0) {
      if (!run) { run = []; if (i > 0) run.push([cross(i), y0]); }
      run.push([xs[i], Math.min(ys[i], y1)]);
    } else if (run) {
      run.push([cross(i), y0]);
      runs.push(run); run = null;
    }
  }
  if (run) runs.push(run);
  const made = [];
  for (const r of runs) {
    if (r.length < 2) continue;
    const t = new DIAG.Trace(r.length, color, width,
      { opacity, dashed, dashSize, gapSize, renderOrder: 10 });
    t.write((i) => [g.x(r[i][0]), g.y(r[i][1]), z]);
    g.add(t);
    made.push(t);
  }
  return made;
}

/**
 * Give a hardware subtree private copies of the shared materials.
 *
 * `DIAG.fadeTree` writes `transparent = true; opacity = baseOp × reveal` onto
 * whatever material it finds, so the moment any stage puts a material straight
 * out of `mats()` into its *overlay*, that library entry is driven to opacity 0
 * for the whole scene whenever that stage is inactive. Cloning here keeps this
 * chassis rendering whatever the neighbours do; the clones inherit the PMREM
 * env map, which is applied before stages build.
 */
const _priv = new Map();
function privatise(root) {
  root.traverse((o) => {
    if (!o.material) return;
    const sw = (m) => {
      let c = _priv.get(m.uuid);
      if (!c) { c = m.clone(); _priv.set(m.uuid, c); }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material);
  });
  return root;
}

/**
 * Make the overlay's fade ABSOLUTE.
 *
 * `main.js` stops updating an inactive stage once `reveal <= 0.002`, so the last
 * value ever handed to `DIAG.fadeTree` is about 0.0022 — and `fadeTree`'s own
 * cut-offs are `o > 0.002` for a Line2 and `o > 0.001` for the group, so
 * everything stays switched on at that alpha. For an ordinary lit mesh that is
 * genuinely invisible. For a `toneMapped:false` trace it is not: those carry
 * their colour into the HDR buffer unscaled, and measured off the wide shot the
 * plot printed a clear green-and-cyan ghost of itself in mid-air above the rack
 * — the sum line, both crossover crossings and the group-delay curve, at about
 * 14 % strength against the backdrop.
 *
 * The cure has to live somewhere `fadeTree` does not overwrite. It writes
 * `object.visible` and material `opacity`, and for a mesh it defers entirely to
 * `userData.setOpacity` if one exists; it never touches `material.visible`,
 * which the renderer checks when it builds the render list and when it builds
 * the shadow map. So: hide on the material, at a threshold that means anything.
 */
const FADE_EPS = 0.02;
function absoluteFade(root) {
  root.traverse((c) => {
    if (c.isLine2 && typeof c.setOpacity === 'function') {
      const base = c._baseOpacity ?? 1;
      c.setOpacity = function setOpacity(o) {
        this.material.opacity = base * o;
        this.material.visible = o > FADE_EPS;
        return this;
      };
      return;
    }
    if (!(c.isMesh || c.isLine || c.isPoints || c.isSprite)) return;
    const m = c.material;
    if (!m || Array.isArray(m) || typeof c.userData.setOpacity === 'function') return;
    const base = m.opacity ?? 1;
    c.userData.setOpacity = (o) => {
      m.transparent = true;
      m.opacity = base * o;
      m.visible = o > FADE_EPS;
    };
  });
  return root;
}

/** A knob whose axis points out of a front panel (+Z). */
function panelKnob(r, h, angle, opts) {
  const w = new THREE.Group();
  const k = GEO.knob(r, h, opts);
  k.rotation.y = angle;
  w.add(k);
  w.rotation.x = Math.PI / 2;
  return w;
}

function led(mat, r = 0.0013) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
}

/** A brighter copy of an emissive material, so small lights clear bloom. */
function hot(mat, k) {
  const m = mat.clone();
  m.color = mat.color.clone().multiplyScalar(k);
  return m;
}

/* `roughness` on a library material is a MULTIPLIER, not a value.
   `alu`, `aluV`, `aluTrim`, `steel`, `anodBlack` and `anodGrey` all carry a
   roughnessMap, and three.js multiplies the scalar by the map's green channel:
   `roughnessFactor = roughness * texelRoughness.g`. The brushed map is written
   about a mean of 0.26 and the anodised map about 0.40, so asking a brushed
   alloy for `roughness = 0.46` actually asks for an effective 0.12 — a near
   mirror — and that, not the environment, is why every satin part in revisions
   2 and 3 came back as a clipped white bar with a bloom halo round it.
   `satin()` takes the roughness it will actually get and divides it out. */
const BR_MEAN = 0.26;   // brushedRough(1024, 0.26, 0.20)
const AN_MEAN = 0.40;   // anodisedRough(512, 0.40, 0.11)

/** A copy of a metal at a stated EFFECTIVE roughness. */
function satin(mat, effRough, envI, mapMean = 1) {
  const m = mat.clone();
  m.roughness = DSP.clamp(effRough / mapMean, 0.02, 2.6);
  m.envMapIntensity = envI;
  return m;
}

// ---------------------------------------------------------------------------
// Hardware — 1U-and-a-half, rack bay 5
// ---------------------------------------------------------------------------
const CW = LAYOUT.rack.w - 0.03;     // 0.555
const CH = 0.078;
const CD = LAYOUT.rack.d - 0.06;     // 0.440
const ZF = CD / 2;                   // front face plane, chassis-local

/** Connector x positions on the rear panel: 8 XLR over 16 RCA. */
const XLR_X = [];
for (let i = 0; i < 8; i++) XLR_X.push(-0.166 + 0.0555 * i + (i >= 2 ? 0.012 : 0));
const RCA_X = [];
for (let i = 0; i < 16; i++) RCA_X.push(-0.172 + 0.0271 * i + (i >= 4 ? 0.008 : 0));

function rearPanel() {
  const M = mats();
  const g = new THREE.Group();

  const plate = new THREE.Mesh(GEO.bevelBox(CW - 0.010, CH - 0.008, 0.004, 0.0012, 3), M.anodBlack);
  g.add(plate);

  // Mains end: IEC inlet, rocker, fuse, chassis earth.
  const iec = GEO.iecInlet();
  iec.position.set(-0.236, 0.004, -0.008);
  iec.rotation.y = Math.PI;
  g.add(iec);
  const rock = new THREE.Mesh(GEO.bevelBox(0.015, 0.010, 0.005, 0.0008, 2), M.plastic);
  rock.position.set(-0.236, -0.023, -0.003);
  g.add(rock);
  const fuse = new THREE.Mesh(GEO.bevelCyl(0.0050, 0.0054, 0.007, 24, 0.0006), M.plastic);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.set(-0.205, -0.023, -0.004);
  g.add(fuse);
  const earth = new THREE.Mesh(GEO.bevelCyl(0.0032, 0.0036, 0.008, 20, 0.0005), M.gold);
  earth.rotation.x = Math.PI / 2;
  earth.position.set(-0.205, 0.022, -0.004);
  g.add(earth);

  // 8 balanced XLR: 2 in (L,R) then 6 out (low / mid / high, L & R).
  for (let i = 0; i < 8; i++) {
    const j = GEO.xlr();
    j.rotation.y = Math.PI;
    j.position.set(XLR_X[i], 0.0165, -0.004);
    g.add(j);
    if (i % 2 === 0) {
      const bar = new THREE.Mesh(GEO.bevelBox(0.094, 0.0015, 0.0010, 0.0004, 2), M.anodGrey);
      bar.position.set(XLR_X[i] + 0.0278, 0.0332, -0.0025);
      g.add(bar);
    }
  }
  // 16 single-ended RCA below — the same eight pairs, unbalanced.
  for (let i = 0; i < 16; i++) {
    const j = GEO.rcaJack(i % 2 === 0 ? 0xc24638 : 0x2a2f35);
    j.rotation.y = Math.PI;
    j.position.set(RCA_X[i], -0.0180, -0.004);
    g.add(j);
  }
  for (const [x, y] of [[-0.264, 0.029], [-0.264, -0.029], [0.264, 0.029], [0.264, -0.029]]) {
    const s = GEO.screw(0.0015);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, y, -0.0025);
    g.add(s);
  }
  return g;
}

/**
 * The band-level display: a recessed well, an emissive graticule and three
 * level bars, and a convex glass over the lot.
 *
 * This is the stage's specular set piece. A lit rectangle flush with a fascia is
 * a decal at any resolution; a lit rectangle sunk 3 mm behind a slightly convex
 * clear panel is an instrument, because the panel carries a band of the room
 * across it that moves when the camera moves and does not line up with anything
 * printed underneath.
 */
function bandDisplay() {
  const M = mats();
  const g = new THREE.Group();
  const W = 0.072, H = 0.032;

  /* An APPLIED module, every z positive, because the fascia is a solid plate:
     anything placed behind its front plane is inside the geometry and the
     display renders as a dead rectangle. The base plate stands on the fascia,
     the screen is drawn on its face, and a raised four-strip bezel sinks that
     face 2.6 mm below the glass — a real recess, made the way a real one is,
     rather than by burying it. */
  const base = new THREE.Mesh(GEO.bevelBox(W + 0.012, H + 0.012, 0.0040, 0.0010, 3), M.anodBlack);
  base.position.set(0, 0, 0.0020);
  g.add(base);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ color: 0x060a10, toneMapped: false }),
  );
  face.position.set(0, 0, 0.0042);
  g.add(face);

  // Graticule: five verticals, dim.
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const x = -0.028 + (i / 4) * 0.056;
    grid.push(x, -0.0115, 0, x, 0.0115, 0);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  const gl = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({
    color: 0x2f5468, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false,
  }));
  gl.position.z = 0.0043;
  g.add(gl);

  // Three band level bars — low, mid, high — at the trims' own settings.
  const bar = hot(M.meterGlow, 1.05);
  const cap = hot(M.meterGlow, 1.80);
  const lev = [0.048, 0.040, 0.034];
  for (let i = 0; i < 3; i++) {
    const y = 0.0092 - i * 0.0092;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(lev[i], 0.0032), bar);
    b.position.set(-0.028 + lev[i] / 2, y, 0.0044);
    g.add(b);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.0018, 0.0046), cap);
    c.position.set(-0.028 + lev[i], y, 0.0044);
    g.add(c);
  }

  /* Machined bezel: four strips standing proud, so the screen sits in a recess
     with a lit edge on all four sides. Anodised grey rather than the bright
     brushed alloy of revision 2 — a polished frame on a black fascia read as a
     chrome picture surround with a hole in it, and pulled the eye off the
     display it was supposed to contain. */
  const bez = satin(M.anodGrey, 0.46, 0.80, AN_MEAN);
  for (const [w, h, x, y] of [
    [W + 0.010, 0.0036, 0, (H + 0.0036) / 2], [W + 0.010, 0.0036, 0, -(H + 0.0036) / 2],
    [0.0036, H + 0.0036, (W + 0.0036) / 2, 0], [0.0036, H + 0.0036, -(W + 0.0036) / 2, 0],
  ]) {
    const s = new THREE.Mesh(GEO.bevelBox(w, h, 0.0026, 0.0006, 3), bez);
    s.position.set(x, y, 0.0053);
    g.add(s);
  }

  // Cover glass, 1.4 mm in front of the bars and inside the bezel's own height.
  const lens = coverGlass(W + 0.002, H + 0.002, { crown: 0.0011, segs: 16 });
  lens.position.set(0, 0, 0.0058);
  g.add(lens);
  return g;
}

function buildHardware() {
  const M = mats();
  const g = new THREE.Group();

  const box = GEO.chassis(CW, CH, CD, {
    body: M.anodBlack, face: M.alu, faceThick: 0.012, r: 0.0009, seg: 4,
  });
  g.add(box);

  /* Side cheeks, proud of the fascia, brushed vertically.

     These were `M.aluV` straight from the library — roughness 0.26, env 1.0 —
     and a 21 mm block standing proud is NARROWER than the reflected image of a
     softbox, so the whole section returned the source at full strength: two
     white bars either side of the fascia with a bloom halo round each, the
     brightest thing in the frame by a wide margin.

     The environment was not the cause: the key is a 2.1 directional from the
     front left and the overhead pool a 9 spot, and a 21 mm block standing 8 mm
     proud of the fascia presents both of them a face at close to the specular
     angle. The cure is roughness — a bead-blasted rack ear is not a 0.26
     mirror — plus half the protrusion, so the section reads as a machined ear
     rather than a light fitting, and lands around 0.55 luminance instead of
     clipping. */
  const cheekMat = satin(M.aluV, 0.50, 0.62, BR_MEAN);
  cheekMat.color = new THREE.Color(0x878d94);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(GEO.bevelBox(0.021, CH + 0.0025, 0.013, 0.0016, 3), cheekMat);
    cheek.position.set(s * (CW / 2 - 0.0095), 0, ZF - 0.0035);
    g.add(cheek);
    GEO.screwRow(g, [[s * (CW / 2 - 0.0095), 0.0248], [s * (CW / 2 - 0.0095), -0.0248]], ZF + 0.0035, 0.0018);
  }

  const zf = ZF + 0.0002;

  /* Two engraved reveals across the fascia. These are dark inset strips sitting
     just behind the face plane, not proud ribs: a thin rod standing off a panel
     is seen at a grazing angle from any normal camera, Fresnel takes its
     reflectance to 1, and it renders as a blown light bar rather than a
     machined line. */
  for (const y of [0.0318, -0.0318]) {
    const rev = new THREE.Mesh(GEO.bevelBox(CW - 0.048, 0.0016, 0.0016, 0.0004, 2), M.anodBlack);
    rev.position.set(0, y, ZF - 0.0012);
    g.add(rev);
  }

  // Applied control plate for the six trims, machined dark grey. It carried the
  // library's own env response and printed as a black hole in the middle of the
  // fascia; lifted, it shades from its top fillet down and the six knobs finally
  // stand on something.
  const tray = new THREE.Mesh(GEO.bevelBox(0.264, 0.056, 0.0042, 0.0011, 3),
    satin(M.anodGrey, 0.46, 1.30, AN_MEAN));
  tray.position.set(0.048, 0, ZF - 0.0008);
  g.add(tray);

  /* Metals that face the camera square-on. The studio's front strip is wide and
     dim now rather than narrow and hot, so these are satin rather than mirror —
     but not as dark as revision 2 made them, when they were fighting a hot
     narrow source that no longer exists. */
  const markMat = satin(M.chrome, 0.24, 0.72);
  const trimBody = satin(M.alu, 0.24, 0.90, BR_MEAN);
  const selBody = satin(M.alu, 0.20, 0.92, BR_MEAN);

  // Six level trims: rows are channels (L above, R below), columns are bands.
  const colX = [-0.022, 0.048, 0.118];
  const rowY = [0.0148, -0.0148];
  const trimAngle = [[-0.34, 0.11, 0.45], [-0.30, 0.17, 0.41]];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const k = panelKnob(0.0102, 0.0090, trimAngle[r][c], { body: trimBody, mark: markMat, flutes: 40 });
      k.position.set(colX[c], rowY[r], ZF + 0.0044);
      g.add(k);
      const p = led(M.ledCyan, 0.0010);
      p.position.set(colX[c] - 0.0150, rowY[r], zf + 0.0009);
      g.add(p);
    }
  }
  for (const c of colX) {
    const bar = new THREE.Mesh(GEO.bevelBox(0.030, 0.0020, 0.0006, 0.0002, 2), M.plastic);
    bar.position.set(c, 0.0308, ZF - 0.0002);
    g.add(bar);
  }

  // Two frequency-select rotaries with engraved detent arcs.
  const selX = [-0.198, -0.110];
  const selAngle = [-0.62, 0.78];
  for (let i = 0; i < 2; i++) {
    const bez = new THREE.Mesh(GEO.bevelCyl(0.0205, 0.0205, 0.0022, 48, 0.0005), satin(M.chrome, 0.28, 0.70));
    bez.rotation.x = Math.PI / 2;
    bez.position.set(selX[i], -0.0015, ZF + 0.0011);
    g.add(bez);
    const k = panelKnob(0.0142, 0.0116, selAngle[i], { body: selBody, mark: markMat, flutes: 52 });
    k.position.set(selX[i], -0.0015, ZF + 0.0080);
    g.add(k);
    for (let d = 0; d < 11; d++) {
      const a = -2.35 + (d / 10) * 4.70;
      const tick = new THREE.Mesh(GEO.bevelBox(0.0010, 0.0042, 0.0010, 0.0002, 2), M.anodGrey);
      tick.position.set(selX[i] + Math.sin(a) * 0.0252, -0.0015 + Math.cos(a) * 0.0252, ZF - 0.0003);
      tick.rotation.z = -a;
      g.add(tick);
    }
  }

  // Standby button and power pip.
  const stby = new THREE.Mesh(GEO.bevelCyl(0.0062, 0.0066, 0.0035, 28, 0.0006), selBody);
  stby.rotation.x = Math.PI / 2;
  stby.position.set(-0.254, -0.019, ZF + 0.0018);
  g.add(stby);
  const pwr = led(hot(M.ledCyan, 1.4), 0.0016);
  pwr.position.set(-0.254, 0.020, zf + 0.0011);
  g.add(pwr);

  // The band-level display, right end of the fascia.
  const disp = bandDisplay();
  disp.position.set(0.228, 0, ZF + 0.0006);
  g.add(disp);

  /* Maker's badge. Recessed and dark it read as a small blank screen, which is
     worse than nothing on a fascia that already has a display; raised, satin
     and shallow it reads as an applied metal plate and takes a highlight. */
  /* Now that the fascia reads as brushed alloy rather than near-black, a light
     badge on it is invisible. Dark anodised, standing 1.4 mm proud with its own
     break on every edge, it reads as an applied maker's plate. */
  const badge = satin(M.anodGrey, 0.42, 0.80, AN_MEAN);
  badge.color = new THREE.Color(0x2b2f35);
  const plate = new THREE.Mesh(GEO.bevelBox(0.058, 0.0104, 0.0014, 0.0004, 3), badge);
  plate.position.set(-0.152, 0.0248, ZF + 0.0008);
  g.add(plate);
  // Two engraved rules either side of it, the way a maker's plate is set.
  for (const s of [-1, 1]) {
    const rule = new THREE.Mesh(GEO.bevelBox(0.030, 0.0014, 0.0012, 0.0004, 2), M.anodBlack);
    rule.position.set(-0.152 + s * 0.048, 0.0248, ZF - 0.0004);
    g.add(rule);
  }

  // Fascia fixings.
  GEO.screwRow(g, [[-0.2735, 0.0296], [-0.2735, -0.0296], [0.2735, 0.0296], [0.2735, -0.0296]], ZF + 0.0006, 0.0014);

  /* The lid. At the new camera elevation the top face is nearly half the
     chassis's silhouette, and a bare bevelled slab up there is the difference
     between a render and a photograph: a real 2U lid is a separate pressing
     that stands 1.5 mm proud of the wrap, with its own broken edge and its own
     fixings. The vent field is cut into the lid, so it sits flush with it. */
  const lid = new THREE.Mesh(GEO.bevelBox(CW - 0.044, 0.0026, CD - 0.056, 0.0010, 3), M.anodBlack);
  lid.position.set(0, CH / 2 + 0.0004, -0.004);
  g.add(lid);

  const vent = GEO.ventSlots(0.30, 0.24, 3, 12, { mat: M.plastic, sw: 0.0035, sd: 0.016 });
  vent.position.set(0.02, CH / 2 + 0.0007, -0.08);
  g.add(vent);

  // Lid fixings, heads up. `GEO.screw` faces +Z by default; these face +Y.
  for (const [x, z] of [
    [-0.238, 0.176], [0, 0.176], [0.238, 0.176],
    [-0.238, -0.176], [0, -0.176], [0.238, -0.176],
  ]) {
    const s = GEO.screw(0.0015);
    s.rotation.x = 0;
    s.position.set(x, CH / 2 + 0.0022, z);
    g.add(s);
  }

  const rear = rearPanel();
  rear.position.set(0, 0, -CD / 2 + 0.002);
  g.add(rear);

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.010, 0.011, 0.006, 24, 0.0008), M.rubber);
    f.position.set(sx * (CW / 2 - 0.048), -CH / 2 - 0.003, sz * (CD / 2 - 0.060));
    g.add(f);
  }

  GEO.shadowed(g);
  g.traverse((o) => {
    if (!o.material) return;
    if (o.material.isMeshBasicMaterial || o.userData.isLens) { o.castShadow = false; o.receiveShadow = false; }
  });

  privatise(g);
  /* The fascia gets its own copy. Revision 1 dulled it hard to keep the top
     edge fillet under a low bloom threshold; the threshold is 2.30 and the
     studio strips are wide and dim, so the brushed panel now carries a gradient
     across its height instead of a bar along its edge. */
  const face = g.children[0].userData.face;
  face.material = face.material.clone();
  face.material.roughness = 0.24 / BR_MEAN;
  face.material.envMapIntensity = 1.35;
  face.material.anisotropy = 0.60;

  /* The anodised body was tuned against the old narrow, hot emitters and is now
     too dark under the wide dim ones — a black cheek that returns one flat value
     is exactly the failure the rig fix was made to cure. The clone is private to
     this stage, so lifting it does not touch anyone else's chassis. */
  const bodyMat = _priv.get(M.anodBlack.uuid);
  if (bodyMat) {
    bodyMat.color = new THREE.Color(0x23262a);
    bodyMat.roughness = 0.42 / AN_MEAN;
    bodyMat.envMapIntensity = 1.30;
  }

  const root = new THREE.Group();
  root.add(g);
  root.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.xover, CH) + 0.006, LAYOUT.rack.z);
  return root;
}

// ---------------------------------------------------------------------------
// Overlay layout — ONE panel, two plot regions, everything docked inside it
// ---------------------------------------------------------------------------
/* The panel is 0.408 m across a 0.615 m top plate. Two thirds of the plate's
   width is the point: narrower than this and the plate reads as an empty black
   table with a small television standing on it; this wide, the plate reads as
   the panel's plinth, which is what it now is. */
const CARD = { w: 0.408, h: 0.164 };
/* The 34 mm above the magnitude box is the title strip, and it has to be that
   deep: the legend is two lines, and at 32 mm the second line printed across
   the bezel's lit top fillet, which is the brightest thing on the panel. */
const GM = { x: 0.046, y: 0.058, w: 0.322, h: 0.072 };   // magnitude
const GG = { x: 0.046, y: 0.012, w: 0.322, h: 0.028 };   // group delay, log ms

/** The chassis's own centre, in world space. Everything else derives from it. */
const HW_Y = LAYOUT.bayCentre(LAYOUT.bay.xover, CH) + 0.006;      // 1.011
const HW_C = [LAYOUT.rack.x - 0.006, HW_Y, LAYOUT.rack.z];

/** The panel stands on the rack's top plate, so its height is not a free
 *  parameter: deck = plate top + the stand's own base and posts. */
const PLATE_Y = LAYOUT.rack.topY;                                  // 1.128
const CARD_X = 0.010, CARD_Z = LAYOUT.rack.z + 0.062;

/* Composition, and why it is what it is.

   Revision 2 aimed at [0.0645, 1.133, −3.03] — the rack's own top plate, 122 mm
   above this chassis's centre — which is why the hero sat in the bottom third
   with the top of the frame bare. The target is now the component's centre,
   1.011 m, as Addendum A requires. (The audit quotes 1.041; that is
   `bayCentre(5, 0.150)`, the centre of the BAY at its maximum permitted height.
   This chassis is 78 mm tall, not 150, so its own centre is 1.011.)

   The chassis is 0.555 m wide and 0.078 m tall — 7.1 : 1 — so it can never be
   framed on height; the binding constraint is the rack's top plate, 0.615 m
   across, which must stay inside x 160…1120. Measured off the render, `fill`
   0.62 put that plate at 116…1140 px and 0.55 at 148…1088 — still 12 px over on
   the left, and the director's idle drift is worth ±40 px on its own. 0.53
   (distance 1.569 m) with the target 6 mm left of the rack's centre line puts
   it at about 168…1080, and the chassis itself at 240…960.

   Elevation is +0.145 rad, up from −0.02. Three things follow, and all three
   are findings from the audit. The camera stops looking up at the undersides of
   the shelves. The chassis's top face comes into view — 55 mm of it against the
   fascia's 78 — so it reads as an object with a top rather than a strip of
   knobs. And the eye clears the rack's top plate at 1.128 by 94 mm, which is
   what lets the panel STAND on that plate, feet, contact shadow and all,
   instead of floating in the air above it. */
const CAM_AZ = 0.30;
const SHOT = frameShot(HW_C, 0.187, { fill: 0.53, az: CAM_AZ, el: 0.145, fov: 30 });
/** Panel yaw: 14° off the camera axis, so it is never square to the lens. */
const CARD_YAW = CAM_AZ - 0.244;

export default {
  id: 'xover',
  title: 'Active&nbsp;Crossover',
  nav: 'Crossover',
  kicker: 'Crossover',
  standfirst: 'Split the band before the amplifiers and no output stage carries another band.',
  shot: SHOT,
  timeScale: 1,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildHardware();
    const overlay = new THREE.Group();
    const S = {};
    this._s = S;

    // ===== the instrument panel, standing on the rack's top plate ==========
    const mount = new THREE.Group();
    mount.position.set(CARD_X, PLATE_Y, CARD_Z);
    mount.rotation.y = CARD_YAW;
    overlay.add(mount);

    const stand = cardStand(CARD.w);
    mount.add(stand);

    const sheet = new THREE.Group();
    sheet.position.set(0, stand.userData.deck + CARD.h / 2, 0);
    /* Tipped 3° back, the way a bench instrument stands: the camera eye is at
       1.238 and the panel's centre at 1.230, so a forward tip would show the
       reader the top of the bezel and nothing of the screen. */
    sheet.rotation.x = -0.052;
    mount.add(sheet);

    const inner = new THREE.Group();
    inner.position.set(-CARD.w / 2, -CARD.h / 2, 0);
    sheet.add(inner);
    inner.add(panel(CARD.w, CARD.h));

    const axis = { xLog: true, xRange: [20, 20000] };

    // ---- magnitude -------------------------------------------------------
    const gm = new DIAG.Graph({
      ...axis, w: GM.w, h: GM.h, yRange: [DB_LO, DB_HI],
      yTicks: [-36, -30, -24, -18, -12, -6, 0, 6], zeroLine: 0,
    });
    gm.position.set(GM.x, GM.y, 0.0010);
    inner.add(gm);
    S.gm = gm;

    // −6.02 dB reference: the level every band holds at its own crossover.
    gm.addTrace(() => XO_DB, { color: PAL.cy, width: 1.0, n: 2, dashed: true, opacity: 0.26 });
    // The mistake: the same three-way as LR2 with every driver positive.
    runTraces(gm, dbOf(b2Sum), {
      color: PAL.rd, width: 1.8, opacity: 0.95, n: 900, dashed: true,
      dashSize: 0.0058, gapSize: 0.0036,
    });
    // The three bands, each drawn only where it is on the paper.
    for (const fn of [bLow, bMid, bHigh]) {
      runTraces(gm, dbOf(fn), { color: PAL.cy, width: 1.6, opacity: 0.78, n: 620 });
    }
    // The sum.
    runTraces(gm, dbOf(bSum), { color: PAL.gr, width: 2.8, opacity: 1, n: 420, z: 0.0009 });

    gm.addMarker(FL, { color: PAL.am, opacity: 0.45 });
    gm.addMarker(FH, { color: PAL.am, opacity: 0.45 });
    for (const f of [FL, FH]) gm.addDot(PAL.am, 0.0032).userData.setData(f, XO_DB);
    S.curM = gm.addMarker(1000, { color: PAL.ink, dashed: false, width: 1.1, opacity: 0.38 });
    S.dotM = gm.addDot(PAL.gr, 0.0040);

    // ---- group delay, logarithmic in ms ----------------------------------
    const gg = new DIAG.Graph({
      ...axis, w: GG.w, h: GG.h,
      yRange: [Math.log10(GD_LO_MS), Math.log10(GD_HI_MS)],
      yTicks: [-2, -1, 0, 1],
    });
    gg.position.set(GG.x, GG.y, 0.0010);
    inner.add(gg);
    S.gg = gg;
    /* NO `addArea` under the trace. `addArea` is `toneMapped:false`, so its
       alpha reaches the framebuffer linearly and the sRGB transfer lifts it
       hard — even at 0.04 a fill under a curve that spends most of the decade
       near the top of its box printed as a solid ochre block, the heaviest
       non-hero element in the frame. A line on a grid, like the plot above it. */
    runTraces(gg, gdLog, { color: PAL.am, width: 2.0, opacity: 1, n: 520 });
    gg.addMarker(FL, { color: PAL.am, opacity: 0.4 });
    gg.addMarker(FH, { color: PAL.am, opacity: 0.4 });
    S.curG = gg.addMarker(1000, { color: PAL.ink, dashed: false, width: 1.1, opacity: 0.38 });
    S.dotG = gg.addDot(PAL.am, 0.0032);

    // ===== labels =========================================================
    const L = ctx.labels;
    const anchor = (parent, x, y, z = 0) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    // The one label on the hardware: a caption on the fascia's own centre line,
    // dropped into the shelf gap below it — never onto the neighbouring unit.
    S.lHw = L.add(anchor(hardware, -0.09, -CH / 2, ZF), {
      kicker: `Active crossover · LR${ORDER}`,
      value: `2 in, 6 out · ${FL} Hz / ${fmtF(FH)}`,
      cls: 'acc lead', offset: [0, 40], priority: 5,
    });

    /* Panel title bar, LEFT: what the plot is and the number it exists to
       prove. Anchored to the magnitude plot's top-left corner and lifted into
       the bezel's own title strip, so it is type on the instrument rather than
       a caption floating on the backdrop. */
    S.lHead = L.add(anchor(gm, gm.x(20), GM.h), {
      kicker: 'Magnitude · 6 dB/div',
      /* Not `acc`: the sum trace is green, and a cyan numeral labelling a green
         curve makes the reader hunt for a cyan one. Neutral, and the legend
         beside it carries the colour key.

         WORDED so it cannot be confused with the footer's `Sum at cursor`.
         Two different quantities were both printed as "sum … dB" in one frame:
         this one is the worst-case magnitude error over 20 Hz–20 kHz, the
         footer's is the cursor's instantaneous value. */
      value: `worst |sum| ${Math.abs(SUM_ERR).toFixed(3)} dB at ${SUM_ERR_F.toFixed(0)} Hz`,
      cls: 'plain', offset: [78, -22], occlude: false, priority: 4,
    });

    /* Panel title bar, RIGHT: the legend, docked INSIDE the panel. A legend on
       bare backdrop is the one place the diagram language visibly breaks. */
    const swatch = (c, glyph) => `<span style="color:${hex(c)};font-size:13px;line-height:0">${glyph}</span>`;
    S.lLeg = L.add(anchor(gm, gm.x(20000), GM.h), {
      text:
        `${swatch(PAL.gr, '&#9644;')} sum` +
        `&nbsp;&nbsp;${swatch(PAL.cy, '&#9644;')} low &middot; mid &middot; high<br>` +
        `${swatch(PAL.rd, '&#9866;&#9866;')} LR2, every driver +`,
      cls: 'plain', offset: [-72, -22], occlude: false, priority: 4,
    });

    /* Group delay: named inside the top-right of its own plot, where the trace
       has already fallen two decades — not on the backdrop below the panel, and
       not on the row the magnitude plot's own x numerals occupy. */
    S.lGd = L.add(anchor(gg, gg.x(20000), GG.h), {
      kicker: 'Group delay · log ms',
      cls: 'plain', offset: [-84, 11], occlude: false, priority: 3,
    });

    // Axis numerals — without these the plot's whole argument is unverifiable.
    gm.tickLabels(L, {
      xVals: [20, 100, 1000, 10000],
      xFmt: (v) => (v >= 1000 ? `${v / 1000} k` : (v === 20 ? '20 Hz' : String(v))),
      yVals: [0, XO_DB, -18, -30],
      yFmt: (v) => (v === 0 ? '0 dB' : v.toFixed(v === XO_DB ? 2 : 0)),
      xOffset: [0, 15], yOffset: [-27, 0],
    });
    /* Two decades only. Four numerals down a 32 mm plot collide at any sensible
       type size and the label layer drops them, which is worse than three. */
    gg.tickLabels(L, {
      yVals: [1, -1],
      yFmt: (v) => (v === 1 ? '10 ms' : '0.1'),
      yOffset: [-27, 0],
    });

    absoluteFade(overlay);

    S.f = 1000;
    S.sum = 0;
    S.gd = groupDelay(1000);
    S.ph = sumPhaseDeg(1000);
    return { hardware, overlay };
  },

  update(dt, t) {
    const S = this._s;
    if (!S) return;

    /* A display cursor, not a signal: nothing on this stage is time-scaled, so
       `timeScale` is 1 and this runs on the wall clock — one round trip every
       16 s, logarithmic in frequency. The readouts read the same latched state
       object, so a still frame is self-consistent. */
    const u = (t / SWEEP_S) % 1;
    const f = 20 * Math.pow(1000, u < 0.5 ? u * 2 : 2 - u * 2);
    S.f = f;
    S.sum = DSP.dB(DSP.cAbs(bSum(f)));
    S.gd = groupDelay(f);
    S.ph = sumPhaseDeg(f);

    S.curM.userData.setX(f);
    S.dotM.userData.setData(f, DSP.clamp(S.sum, DB_LO, DB_HI));
    S.curG.userData.setX(f);
    S.dotG.userData.setData(f, DSP.clamp(gdLog(f), Math.log10(GD_LO_MS), Math.log10(GD_HI_MS)));
  },

  content() {
    return `
<h3>The split</h3>
<p>Three ways, Linkwitz&#8209;Riley ${ORDER}th order, at <span class="num">${FL} Hz</span> and
<span class="num">${fmtF(FH)}</span>. Each band is two cascaded Butterworth sections, so the
asymptote is <span class="num">${SLOPE_DB_OCT.toFixed(2)} dB</span> per octave and every band
sits at <span class="num">${XO_DB.toFixed(2)} dB</span> at its own crossover &mdash; not &minus;3.
The three sum to an all&#8209;pass: <b>360&deg; through each crossover</b>,
${Math.round(PHASE_SPAN)}&deg; in&#8209;band. Only arrival time moves &mdash;
<span class="num">${(GD_PEAK * 1e3).toFixed(2)} ms</span> at ${GD_PEAK_F.toFixed(0)} Hz,
<span class="num">${(GD_FH * 1e3).toFixed(2)} ms</span> at ${fmtF(FH)}.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>LR2 sums flat too &mdash; but only
with one driver&rsquo;s polarity <em>reversed</em>. Wire an LR2 with every driver positive and it
nulls at each crossover, as the red trace does.</p></div>

<p>Passively into ${Z_NOM}&nbsp;&Omega; this low&#8209;pass is two coils and two capacitors. The
ideal Butterworth pair &mdash; <span class="num">${(L_SEC * 1e3).toFixed(1)} mH</span>,
<span class="num">${(C_SEC * 1e6).toFixed(0)} &micro;F</span> &mdash; is not an LR${ORDER} ladder:
each section is loaded by the next, not by R. What survives is the copper. Two 12&nbsp;AWG air
cores at <span class="num">${R_SEC.toFixed(2)}&nbsp;&Omega;</span> burn
<span class="num">${LOSS_PCT.toFixed(1)}%</span> of the loop power &mdash;
<span class="num">${INSERT_LOSS.toFixed(2)} dB</span> of insertion loss.</p>

<p>Damping factor is the wrong quantity: the coil&rsquo;s own
<span class="num">${RE_COIL.toFixed(1)}&nbsp;&Omega;</span> is in that loop too, so what damps the
cone rises <span class="num">${RD_ACT.toFixed(2)}</span> &rarr;
<span class="num">${RD_PAS.toFixed(2)}&nbsp;&Omega;</span> &mdash;
<span class="num">${RD_PCT.toFixed(1)}%</span>, not the seventeen&#8209;fold
${DF_ACT.toFixed(0)}&nbsp;&rarr;&nbsp;${DF_PAS.toFixed(1)} implies.</p>`;
  },

  readouts() {
    const S = this._s;
    const f = S ? S.f : 1000;
    const gd = S ? S.gd : groupDelay(1000);
    return [
      { k: 'Crossover', v: `${FL} / ${(FH / 1000).toFixed(2)} k`, u: 'Hz', cls: 'acc' },
      { k: 'Slope', v: SLOPE_DB_OCT.toFixed(2), u: 'dB/oct' },
      { k: 'Cursor', v: DSP.fHz(f), u: 'Hz' },
      // Named for the cursor, because the panel prints the worst-case figure
      // over the whole band and the two must not read as the same quantity.
      { k: 'Sum at cursor', v: (S ? S.sum : 0).toFixed(3), u: 'dB', cls: 'acc' },
      { k: 'Group delay', v: (gd * 1e3).toFixed(2), u: 'ms', cls: 'am', bar: gd / GD_PEAK },
      { k: 'Sum phase', v: (S ? S.ph : 0).toFixed(0), u: '°' },
    ];
  },
};
