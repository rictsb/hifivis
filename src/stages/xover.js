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
const R_SEC = 0.50;                     // Ω — catalogue dc resistance of that coil
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
 * A SPECULAR LAYER: a slightly convex clear panel that sits in front of
 * whatever is underneath it.
 *
 * A lit meter with nothing over it reads as a decal, because a real instrument
 * is seen through glass and the glass carries the room. The panel is spherical
 * with a long radius, so the reflected image of the studio's front strip sweeps
 * across it as one soft band rather than sitting still. Additive blending with
 * a black base colour is the honest model: the Fresnel reflection ADDS to what
 * is transmitted, it does not multiply it, so the trace underneath keeps its
 * contrast.
 */
function lensPanel(w, h, opts = {}) {
  const {
    R = 3.2, seg = 22, rough = 0.11, envI = 1.15, z0 = 0.0, renderOrder = 30,
  } = opts;
  const g = new THREE.PlaneGeometry(w, h, seg, seg);
  const p = g.attributes.position;
  const zEdge = Math.sqrt(Math.max(1e-9, R * R - (w * w + h * h) / 4));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, z0 + Math.sqrt(Math.max(1e-9, R * R - x * x - y * y)) - zEdge);
  }
  g.computeVertexNormals();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0.0, roughness: rough,
    clearcoat: 1.0, clearcoatRoughness: 0.04,
    envMapIntensity: envI, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = renderOrder;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.userData.isLens = true;
  return mesh;
}

/**
 * The instrument panel the plots live on: a bevelled slab with a lit rim, an
 * inset screen and glass over it. Local origin is the bottom-left of the panel,
 * so the Graphs can be positioned in panel coordinates.
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
  const { bezel = 0.014, thick = 0.009 } = opts;
  const g = new THREE.Group();

  // Bevelled body — a real 3 mm fillet, so the rim takes a highlight and the
  // panel stops reading as a compositing layer.
  const body = mats().anodBlack.clone();
  body.color = new THREE.Color(0x0c0e13);
  body.roughness = 0.36;
  body.envMapIntensity = 1.05;
  const slab = new THREE.Mesh(
    GEO.bevelBox(w + bezel * 2, h + bezel * 2, thick, 0.0032, 4), body,
  );
  slab.position.set(w / 2, h / 2, -thick / 2);
  slab.castShadow = false;
  slab.receiveShadow = false;
  g.add(slab);

  // Inset screen: the dark ground the traces are drawn on.
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.005, h + 0.005),
    new THREE.MeshBasicMaterial({
      color: 0x07090d, transparent: true, opacity: 0.94,
      depthWrite: true, toneMapped: false,
    }),
  );
  screen.position.set(w / 2, h / 2, 0.0004);
  screen.renderOrder = 3;
  g.add(screen);

  // Hairline inside the bezel.
  const b = new DIAG.Trace(5, 0x4a535f, 1.1, { opacity: 0.85, renderOrder: 5 });
  const x0 = -0.004, y0 = -0.004, W = w + 0.008, H = h + 0.008;
  b.write((i) => [[x0, y0], [x0 + W, y0], [x0 + W, y0 + H], [x0, y0 + H], [x0, y0]][i].concat(0.0008));
  g.add(b);

  // The specular layer: the studio's front strip sweeps across the glass as one
  // soft band, so the traces sit BEHIND something instead of being printed on
  // the backdrop.
  const lens = lensPanel(w + 0.008, h + 0.008, { R: 0.90, rough: 0.060, envI: 1.95 });
  lens.position.set(w / 2, h / 2, 0.0036);
  g.add(lens);
  g.userData.lens = lens;

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

/** A duller copy of a metal, for parts that would otherwise clip to white. */
function satin(mat, rough, envI) {
  const m = mat.clone();
  m.roughness = rough;
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

  // Machined bezel: four strips standing proud, so the screen sits in a recess
  // with a lit edge on all four sides.
  const bez = satin(M.alu, 0.46, 0.82);
  for (const [w, h, x, y] of [
    [W + 0.012, 0.0044, 0, (H + 0.0044) / 2], [W + 0.012, 0.0044, 0, -(H + 0.0044) / 2],
    [0.0044, H + 0.0044, (W + 0.0044) / 2, 0], [0.0044, H + 0.0044, -(W + 0.0044) / 2, 0],
  ]) {
    const s = new THREE.Mesh(GEO.bevelBox(w, h, 0.0028, 0.0006, 3), bez);
    s.position.set(x, y, 0.0054);
    g.add(s);
  }

  // Cover glass, 1.4 mm in front of the bars and inside the bezel's own height.
  const lens = lensPanel(W + 0.002, H + 0.002,
    { R: 0.30, seg: 14, rough: 0.05, envI: 2.1, renderOrder: 28 });
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

  // Side cheeks, proud of the fascia, brushed vertically.
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(GEO.bevelBox(0.021, CH + 0.0025, 0.017, 0.0016, 3), M.aluV);
    cheek.position.set(s * (CW / 2 - 0.0095), 0, ZF - 0.0045);
    g.add(cheek);
    GEO.screwRow(g, [[s * (CW / 2 - 0.0095), 0.0248], [s * (CW / 2 - 0.0095), -0.0248]], ZF + 0.0045, 0.0018);
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

  // Applied control plate for the six trims, machined dark grey.
  const tray = new THREE.Mesh(GEO.bevelBox(0.264, 0.056, 0.0042, 0.0011, 3),
    satin(M.anodGrey, 0.42, 1.05));
  tray.position.set(0.048, 0, ZF - 0.0008);
  g.add(tray);

  /* Metals that face the camera square-on. The studio's front strip is wide and
     dim now rather than narrow and hot, so these are satin rather than mirror —
     but not as dark as revision 2 made them, when they were fighting a hot
     narrow source that no longer exists. */
  const markMat = satin(M.chrome, 0.24, 0.72);
  const trimBody = satin(M.alu, 0.46, 0.88);
  const selBody = satin(M.alu, 0.33, 0.90);

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
  const plate = new THREE.Mesh(GEO.bevelBox(0.062, 0.011, 0.0016, 0.0005, 3),
    satin(M.chrome, 0.32, 0.82));
  plate.position.set(-0.152, 0.0248, ZF + 0.0008);
  g.add(plate);

  // Fascia fixings.
  GEO.screwRow(g, [[-0.2735, 0.0296], [-0.2735, -0.0296], [0.2735, 0.0296], [0.2735, -0.0296]], ZF + 0.0006, 0.0014);

  // Top vents, rear panel, feet.
  const vent = GEO.ventSlots(0.30, 0.24, 3, 12, { mat: M.plastic, sw: 0.0035, sd: 0.016 });
  vent.position.set(0.02, CH / 2 - 0.0008, -0.08);
  g.add(vent);

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
  face.material.roughness = 0.33;
  face.material.envMapIntensity = 1.45;
  face.material.anisotropy = 0.60;

  /* The anodised body was tuned against the old narrow, hot emitters and is now
     too dark under the wide dim ones — a black cheek that returns one flat value
     is exactly the failure the rig fix was made to cure. The clone is private to
     this stage, so lifting it does not touch anyone else's chassis. */
  const bodyMat = _priv.get(M.anodBlack.uuid);
  if (bodyMat) { bodyMat.roughness = 0.38; bodyMat.envMapIntensity = 1.20; }

  const root = new THREE.Group();
  root.add(g);
  root.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.xover, CH) + 0.006, LAYOUT.rack.z);
  return root;
}

// ---------------------------------------------------------------------------
// Overlay layout — ONE panel, two plot regions, everything docked inside it
// ---------------------------------------------------------------------------
const CARD = { w: 0.230, h: 0.166 };
const GM = { x: 0.031, y: 0.060, w: 0.190, h: 0.084 };   // magnitude
const GG = { x: 0.031, y: 0.006, w: 0.190, h: 0.042 };   // group delay, log ms
const CARD_C = [0.037, 1.248, -3.00];                    // panel centre, world

/* Composition, and why it is what it is.

   The chassis is 0.555 m wide and 0.078 m tall — 7.1 : 1 — so it can never fill
   a 960 x 840 safe box on height; it is framed on WIDTH, and at this azimuth it
   projects to ~920 px of the 960, sitting inside x 180…1100.

   The camera sits BELOW the rack's own top plate (y 1.128). That plate is a
   0.5 m gloss slab directly above this bay, and from any higher eye it is the
   biggest, brightest object in the frame; from underneath it becomes a dark
   ceiling with one lit fillet.

   The subject is therefore the chassis AND the panel above it — from the
   chassis floor at y 0.972 to the panel's top edge at y 1.346, a half-height of
   0.187 m. `fill` is 0.706 rather than the 0.50–0.62 the addendum suggests for
   a hero, because a 7.1 : 1 subject cannot be filled on height: at the
   resulting 1.177 m the chassis projects ~810 px into the 960 px safe box while
   that half-height subtends 0.706 of the box's height. The target's x is
   0.0645, not the rack's 0, because the rack's own top plate is the widest
   thing in shot at ~950 px and only centring it keeps it inside x 160…1120.

   The camera is AIMED 25 mm below the stack's geometric centre, which seats the
   fascia at 0.69 of the frame and lifts the panel clear of the rack's top plate
   without leaving the top third of the box empty — the defect of revision 2,
   which targeted the panel and dropped the hero into the bottom quarter. */
const CAM_AZ = 0.30;
const SHOT = frameShot([0.0645, 1.133, -3.03], 0.187, { fill: 0.706, az: CAM_AZ, el: -0.02, fov: 30 });
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

    // ===== the instrument panel ===========================================
    const sheet = new THREE.Group();
    sheet.position.set(...CARD_C);
    /* Rotated 14° off the camera axis and tipped 6° forward — the camera is
       below it — so it is an object standing in the room rather than a graphic
       pasted on the lens: the near edge of the bezel is visible, and the tipped
       face takes the sweep of the front strip across its glass. */
    sheet.rotation.set(0.100, CARD_YAW, 0);
    overlay.add(sheet);

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
    /* 0.04, not the 0.16 default. `addArea` is `toneMapped:false`, so its alpha
       goes to the framebuffer linearly and the sRGB transfer lifts it hard: a
       nominal 8 % of PAL.am prints as a 30 % ochre slab that out-weighs the
       magnitude plot above it. */
    gg.addArea(gdLog, { color: PAL.am, opacity: 0.04, n: 260 });
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
      // Not `acc`: the sum trace is green, and a cyan numeral labelling a green
      // curve makes the reader hunt for a cyan one. Neutral, and the legend
      // beside it carries the colour key.
      value: `sum ${SUM_ERR.toFixed(3)} dB`,
      cls: 'plain', offset: [62, -23], occlude: false, priority: 4,
    });

    /* Panel title bar, RIGHT: the legend, docked INSIDE the panel. A legend on
       bare backdrop is the one place the diagram language visibly breaks. */
    S.lLeg = L.add(anchor(gm, gm.x(20000), GM.h), {
      text:
        `<span style="color:${hex(PAL.gr)}">&#9473;</span> sum` +
        `&nbsp;&nbsp;<span style="color:${hex(PAL.cy)}">&#9473;</span> low &middot; mid &middot; high<br>` +
        `<span style="color:${hex(PAL.rd)}">&#9548;</span> LR2, every driver +`,
      cls: 'plain', offset: [-62, -23], occlude: false, priority: 4,
    });

    // Group delay: named inside its own plot, where the trace has already
    // fallen away — not on the backdrop below the panel.
    S.lGd = L.add(anchor(gg, gg.x(2500), gg.y(0.5)), {
      kicker: 'Group delay · log ms',
      cls: 'plain', offset: [0, 0], occlude: false, priority: 3,
    });

    // Axis numerals — without these the plot's whole argument is unverifiable.
    gm.tickLabels(L, {
      xVals: [20, 100, 1000, 10000],
      xFmt: (v) => (v >= 1000 ? `${v / 1000} k` : (v === 20 ? '20 Hz' : String(v))),
      yVals: [0, XO_DB, -18, -30],
      yFmt: (v) => (v === 0 ? '0 dB' : v.toFixed(v === XO_DB ? 2 : 0)),
      xOffset: [0, 14], yOffset: [-26, 0],
    });
    gg.tickLabels(L, {
      yVals: [1, 0, -1, -2],
      yFmt: (v) => (v === 1 ? '10 ms' : (v === 0 ? '1' : (v === -1 ? '0.1' : '0.01'))),
      yOffset: [-26, 0],
    });

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
${Math.round(PHASE_SPAN)}&deg; of it in&#8209;band. Only arrival time moves &mdash;
<span class="num">${(GD_PEAK * 1e3).toFixed(2)} ms</span> at ${GD_PEAK_F.toFixed(0)} Hz,
<span class="num">${(GD_FH * 1e3).toFixed(2)} ms</span> at ${fmtF(FH)}.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>LR2 sums flat too &mdash; but only
with one driver&rsquo;s polarity <em>reversed</em>. Wire an LR2 with every driver positive and it
nulls at each crossover, as the red trace does.</p></div>

<p>Passively into ${Z_NOM}&nbsp;&Omega; this low&#8209;pass is two coils and two capacitors, not one
coil. The ideal Butterworth pair &mdash; <span class="num">${(L_SEC * 1e3).toFixed(1)} mH</span>,
<span class="num">${(C_SEC * 1e6).toFixed(0)} &micro;F</span> &mdash; is not an LR${ORDER} ladder:
each section is loaded by the next, not by R. The copper stands.
<span class="num">${R_NET.toFixed(2)}&nbsp;&Omega;</span> in series burns
<span class="num">${LOSS_PCT.toFixed(1)}%</span> of the loop power,
<span class="num">${INSERT_LOSS.toFixed(2)} dB</span> of insertion loss.</p>

<p>Damping factor is the wrong quantity: the coil&rsquo;s own
<span class="num">${RE_COIL.toFixed(1)}&nbsp;&Omega;</span> is in that same loop, so what damps
the cone rises from <span class="num">${RD_ACT.toFixed(2)}&nbsp;&Omega;</span> to
<span class="num">${RD_PAS.toFixed(2)}&nbsp;&Omega;</span> &mdash;
<span class="num">${RD_PCT.toFixed(1)}%</span>, not the seventeen&#8209;fold that
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
      { k: 'Sum', v: (S ? S.sum : 0).toFixed(3), u: 'dB', cls: 'acc' },
      { k: 'Group delay', v: (gd * 1e3).toFixed(2), u: 'ms', cls: 'am', bar: gd / GD_PEAK },
      { k: 'Sum phase', v: (S ? S.ph : 0).toFixed(0), u: '°' },
    ];
  },
};
