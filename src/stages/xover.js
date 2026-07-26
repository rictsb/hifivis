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

   One instrument panel, two plot regions. The panel carries the only picture
   that beats prose: the three bands, each −6.02 dB at its own crossover, the
   green sum on 0 dB, and the LR2-every-driver-positive mistake in red beside
   it. Phase, the passive-network arithmetic and the acoustic caveat are in
   content().

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
// A passive LR4 low-pass is TWO cascaded 2nd-order Butterworth sections, not
// one coil. Each section, into a resistive R at ω_c:
//     L = √2·R/ω_c      C = 1/(√2·R·ω_c)
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
const DF_ACT = DAMPING.atDriver;                   // 130.3 — at the driver, not the terminals
const DF_TERM = DAMPING.atTerminals;               // 400.0 — the number brochures print
const DF_PAS = DSP.dampingFactor(Z_NOM, RS_PAS);   // 7.5
const RE_COIL = DRIVER.Re;                         // 6.2 Ω, voice-coil dc resistance
const RD_ACT = RE_COIL + RS_ACT;                   // 6.261 Ω — what actually damps the cone
const RD_PAS = RE_COIL + RS_PAS;                   // 7.261 Ω
const RD_PCT = 100 * (RD_PAS / RD_ACT - 1);        // +16.0 %
// Insertion loss: the level lost to the extra series copper, both cases loaded
// by the same nominal Z.
const INSERT_DB = DSP.dB(Z_NOM / (Z_NOM + RS_PAS)) - DSP.dB(Z_NOM / (Z_NOM + RS_ACT));
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
const b2Sum = (f) => DSP.cAdd(
  LP(f, FL, 2),
  DSP.cAdd(DSP.cMul(HP(f, FL, 2), LP(f, FH, 2)), DSP.cMul(HP(f, FL, 2), HP(f, FH, 2))),
);

/* Magnitude in dB, floored at the bottom of the magnitude axis. The Graph's own
   clip allows a 4 % overshoot outside the frame, which would leave the mid and
   high bands drawing stray horizontal lines in the gap below the plot box. */
const DB_FLOOR = -30;
const dbOf = (fn) => (f) => Math.max(DB_FLOOR, DSP.dB(DSP.cAbs(fn(f))));

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
const GD_FH = groupDelay(FH);
const GD_MAX_MS = 8;                                    // group-delay axis top
const PHASE_SPAN = sumPhaseDeg(20) - sumPhaseDeg(20000); // 660°

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
 * with a very long radius, so the reflected image of the studio's front strip
 * sweeps across it as one soft band rather than sitting still. Additive
 * blending with a black base colour is the honest model: the Fresnel reflection
 * ADDS to what is transmitted, it does not multiply it, so the trace underneath
 * keeps its contrast.
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
    clearcoat: 1.0, clearcoatRoughness: 0.05,
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
 * inset screen and glass over it. Local origin is the bottom-left of the plot
 * area, so the Graphs can be positioned in panel coordinates.
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
  const { bezel = 0.013, thick = 0.008 } = opts;
  const g = new THREE.Group();

  // Bevelled body — a real 3 mm fillet, so the rim takes a highlight and the
  // panel stops reading as a compositing layer.
  const body = mats().anodBlack.clone();
  body.color = new THREE.Color(0x0b0d11);
  body.roughness = 0.38;
  body.envMapIntensity = 0.95;
  const slab = new THREE.Mesh(
    GEO.bevelBox(w + bezel * 2, h + bezel * 2, thick, 0.0030, 4), body,
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

  // The specular layer.
  const lens = lensPanel(w + 0.006, h + 0.006, { R: 1.2, rough: 0.06, envI: 2.0 });
  lens.position.set(w / 2, h / 2, 0.0034);
  g.add(lens);
  g.userData.lens = lens;

  return g;
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
  const tray = new THREE.Mesh(GEO.bevelBox(0.303, 0.056, 0.0042, 0.0011, 3), M.anodGrey);
  tray.position.set(0.084, 0, ZF - 0.0008);
  g.add(tray);

  /* Metals that face the camera square-on. The studio's front strip is wide and
     dim now rather than narrow and hot, so these need to be satin rather than
     mirror or the six trims and the two selectors return one flat 100 % patch
     each instead of a highlight with a rolloff. */
  const markMat = satin(M.chrome, 0.26, 0.60);
  const trimBody = satin(M.anodGrey, 0.46, 0.72);
  const selBody = satin(M.alu, 0.36, 0.68);

  // Six level trims: rows are channels (L above, R below), columns are bands.
  const colX = [-0.001, 0.078, 0.157];
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
    const bez = new THREE.Mesh(GEO.bevelCyl(0.0205, 0.0205, 0.0022, 48, 0.0005), satin(M.chrome, 0.30, 0.55));
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

  // Standby button, power pip, and a small backlit window.
  const stby = new THREE.Mesh(GEO.bevelCyl(0.0062, 0.0066, 0.0035, 28, 0.0006), selBody);
  stby.rotation.x = Math.PI / 2;
  stby.position.set(-0.254, -0.019, ZF + 0.0018);
  g.add(stby);
  const pwr = led(hot(M.ledCyan, 1.4), 0.0016);
  pwr.position.set(-0.254, 0.020, zf + 0.0011);
  g.add(pwr);

  /* The backlit window: recessed surround, emissive bars, and a convex lens
     over them. Without the lens the bars are a decal printed on the fascia. */
  const winWell = new THREE.Mesh(GEO.bevelBox(0.056, 0.024, 0.003, 0.0008, 3), M.anodBlack);
  winWell.position.set(0.246, 0.0, ZF - 0.0004);
  g.add(winWell);
  const glowMat = hot(M.meterGlow, 1.35);
  for (const [w, x, y] of [[0.038, 0.243, 0.0045], [0.026, 0.237, -0.0045]]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.0024), glowMat);
    bar.position.set(x, y, ZF + 0.0014);
    g.add(bar);
  }
  const winLens = lensPanel(0.052, 0.021, { R: 0.30, seg: 12, rough: 0.045, envI: 1.05, renderOrder: 28 });
  winLens.position.set(0.246, 0.0, ZF + 0.0026);
  g.add(winLens);

  // Brand plate: a broad shallow inset, seen face-on, so it behaves.
  const plate = new THREE.Mesh(GEO.bevelBox(0.062, 0.013, 0.0014, 0.0005, 3), M.anodGrey);
  plate.position.set(-0.152, 0.0248, ZF - 0.0005);
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
     edge fillet under a 0.92 bloom threshold; the threshold is now 1.06 and the
     studio strips are wide and dim, so the brushed panel carries a gradient
     across its height instead of a bar along its edge. */
  const face = g.children[0].userData.face;
  face.material = face.material.clone();
  face.material.roughness = 0.28;
  face.material.envMapIntensity = 1.00;
  face.material.anisotropy = 0.60;

  const root = new THREE.Group();
  root.add(g);
  root.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.xover, CH) + 0.006, LAYOUT.rack.z);
  return root;
}

// ---------------------------------------------------------------------------
// Overlay layout — ONE panel, two plot regions, floating above the chassis
// ---------------------------------------------------------------------------
const CARD = { w: 0.255, h: 0.146 };
const GM = { x: 0.033, y: 0.046, w: 0.213, h: 0.089 };   // magnitude
const GG = { x: 0.033, y: 0.015, w: 0.213, h: 0.022 };   // group delay
const CARD_C = [0.092, 1.252, -3.00];                    // panel centre, world

/* Composition, and why it is what it is.
   The chassis is 0.555 m wide and 0.078 m tall — 7.1 : 1. With both cheeks
   inside the safe box the largest its fascia can ever be is 960/7.1 ≈ 135 px,
   so the camera is set by WIDTH, not by a height fill: at this azimuth the box
   projects to ~850 px of the 960 px box, which is the geometric maximum.
   The camera also sits BELOW the rack's own top plate (y 1.128). That plate is
   a 0.5 m gloss slab directly above this bay, and from any higher eye it is the
   biggest, brightest object in the frame; from underneath it becomes a dark
   ceiling with one lit fillet, and the unit below leaves the frame entirely.
   The panel is 0.47 of its revision-2 area so the hero is no longer out-massed. */
const CAM_AZ = 0.30;
const SHOT = frameShot([0.070, 1.215, -3.03], 0.27, { fill: 1.00, az: CAM_AZ, el: -0.085, fov: 30 });
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
    /* Rotated 14° off the camera axis and tipped 5° forward — the camera is
       below it — so it is an object standing in the room rather than a graphic
       pasted on the lens: the near edge of the bezel is visible, and the tipped
       face takes the sweep of the front strip across its glass. */
    sheet.rotation.set(0.085, CARD_YAW, 0);
    overlay.add(sheet);

    const inner = new THREE.Group();
    inner.position.set(-CARD.w / 2, -CARD.h / 2, 0);
    sheet.add(inner);
    inner.add(panel(CARD.w, CARD.h));

    const axis = { xLog: true, xRange: [20, 20000] };

    // ---- magnitude -------------------------------------------------------
    const gm = new DIAG.Graph({
      ...axis, w: GM.w, h: GM.h, yRange: [-30, 6],
      yTicks: [-30, -24, -18, -12, -6, 0, 6], zeroLine: 0,
    });
    gm.position.set(GM.x, GM.y, 0.0010);
    inner.add(gm);
    S.gm = gm;
    // −6.02 dB reference
    gm.addTrace(() => XO_DB, { color: PAL.cy, width: 1.0, n: 2, dashed: true, opacity: 0.28 });
    // the mistake: the same three-way as LR2 with every driver positive
    gm.addTrace(dbOf(b2Sum), { color: PAL.rd, width: 1.7, dashed: true, opacity: 0.9, n: 520 });
    for (const fn of [bLow, bMid, bHigh]) {
      gm.addTrace(dbOf(fn), { color: PAL.cy, width: 1.7, opacity: 0.8, n: 420 });
    }
    gm.addTrace(dbOf(bSum), { color: PAL.gr, width: 2.8, n: 420 });
    gm.addMarker(FL, { color: PAL.am, opacity: 0.45 });
    gm.addMarker(FH, { color: PAL.am, opacity: 0.45 });
    for (const f of [FL, FH]) gm.addDot(PAL.am, 0.0032).userData.setData(f, XO_DB);
    S.curM = gm.addMarker(1000, { color: PAL.ink, dashed: false, width: 1.1, opacity: 0.38 });
    S.dotM = gm.addDot(PAL.gr, 0.0040);

    // ---- group delay -----------------------------------------------------
    const gg = new DIAG.Graph({
      ...axis, w: GG.w, h: GG.h, yRange: [0, GD_MAX_MS], yTicks: [0, 2, 4, 6, 8],
    });
    gg.position.set(GG.x, GG.y, 0.0010);
    inner.add(gg);
    S.gg = gg;
    gg.addArea((f) => groupDelay(f) * 1e3, { color: PAL.am, opacity: 0.14, n: 240 });
    gg.addTrace((f) => groupDelay(f) * 1e3, { color: PAL.am, width: 2.1, n: 380 });
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
    // with a leader, dropped into the shelf gap below it — never onto the
    // neighbouring unit's face.
    S.lHw = L.add(anchor(hardware, -0.09, -CH / 2, ZF), {
      kicker: `Active crossover · LR${ORDER}`,
      value: `2 in, 6 out · ${FL} Hz / ${fmtF(FH)}`,
      cls: 'acc lead', offset: [0, 40], priority: 5,
    });

    // Panel header: what the plot is, and the number it exists to prove.
    S.lHead = L.add(anchor(gm, gm.x(20), GM.h), {
      kicker: 'Magnitude · 6 dB / division',
      value: `low + mid + high = ${SUM_ERR.toFixed(3)} dB`,
      cls: 'acc', offset: [104, -44], occlude: false, priority: 4,
    });

    /* Legend. The dashed trace is the myth, and a myth the reader has to infer
       from a floating caption is not named at all. Colour-keyed here so the
       three families are read off the plot itself. */
    S.lLeg = L.add(anchor(gm, gm.x(20), gm.y(-14)), {
      text:
        `<span style="color:${hex(PAL.gr)}">&#9473;&#9473;</span> sum, LR${ORDER}<br>` +
        `<span style="color:${hex(PAL.cy)}">&#9473;&#9473;</span> low &middot; mid &middot; high<br>` +
        `<span style="color:${hex(PAL.rd)}">&#9548;&#9548;</span> LR2, every driver +`,
      cls: 'plain', offset: [-98, 0], occlude: false, priority: 3,
    });

    // Axis numerals — without these the plot's whole argument is unverifiable.
    gm.tickLabels(L, {
      yVals: [0, XO_DB, -24],
      yFmt: (v) => (v === 0 ? '0 dB' : v.toFixed(v === XO_DB ? 2 : 0)),
      yOffset: [-28, 0],
    });
    gg.tickLabels(L, {
      xVals: [20, 100, 1000, 10000],
      xFmt: (v) => (v >= 1000 ? `${v / 1000} k` : (v === 20 ? '20 Hz' : String(v))),
      yVals: [4, 8],
      yFmt: (v) => (v === 8 ? '8 ms' : String(v)),
      xOffset: [0, 14], yOffset: [-24, 0],
    });

    // Group-delay caption, below the panel and clear of the decade numerals.
    S.lGd = L.add(anchor(gg, gg.x(2200), 0), {
      kicker: `Group delay · 0 to ${GD_MAX_MS} ms, 2 ms / division`,
      value: `peak ${(GD_PEAK * 1e3).toFixed(2)} ms at ${GD_PEAK_F.toFixed(0)} Hz`,
      cls: 'am', offset: [0, 66], occlude: false, priority: 3,
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

    S.curM.userData.setX(f); S.dotM.userData.setData(f, S.sum);
    S.curG.userData.setX(f); S.dotG.userData.setData(f, DSP.clamp(S.gd * 1e3, 0, GD_MAX_MS));
  },

  content() {
    return `
<h3>The split</h3>
<p>Three ways, Linkwitz&#8209;Riley ${ORDER}th order, at <span class="num">${FL} Hz</span> and
<span class="num">${fmtF(FH)}</span>. Each band is two cascaded Butterworth sections, so
the asymptote is <span class="num">20&#183;${ORDER}&#183;log&#8321;&#8320;2 = ${SLOPE_DB_OCT.toFixed(2)} dB</span>
per octave and every band sits at <span class="num">${XO_DB.toFixed(2)} dB</span> at its own
crossover &mdash; not &minus;3.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>LR2 sums flat as well &mdash;
but only with one driver&rsquo;s polarity <em>reversed</em>. Wire an LR2 with every driver
positive and it nulls at each crossover; the red trace is that mistake. LR4 is the
opposite: its two halves are in phase at <em>every</em> frequency.</p></div>

<div class="eq">|LP| = |HP| = 0.5 at f<span class="c">c</span>
20&#183;log&#8321;&#8320; 0.5 = <span class="hl">${XO_DB.toFixed(2)} dB</span>
low + mid + high = <span class="hl">${SUM_ERR.toFixed(3)} dB</span>
<span class="c">  worst case, at ${SUM_ERR_F.toFixed(0)} Hz</span></div>

<div class="key"><span class="lab">The idea</span><p>Filter at line level, where a decibel
is free and no inductor is needed, then give every driver its own amplifier
channel. Two inputs, six outputs.</p></div>

<p>What the three bands add up to is an all&#8209;pass: <b>360&deg; of rotation through each
crossover</b>, ${Math.round(PHASE_SPAN)}&deg; of it inside the audio band. Group delay peaks at
<span class="num">${(GD_PEAK * 1e3).toFixed(2)} ms</span> at
<span class="num">${GD_PEAK_F.toFixed(0)} Hz</span> and falls to
<span class="num">${(GD_FH * 1e3).toFixed(2)} ms</span> at ${fmtF(FH)}. Magnitude is
untouched; only the arrival time of the bass moves.</p>

<h3>What a passive network costs</h3>
<p>The same low&#8209;pass built passively into a nominal ${Z_NOM}&nbsp;&Omega; is not one coil
but two 2nd&#8209;order sections.</p>

<div class="eq">L = &radic;2&#183;R/&omega;c = ${(L_SEC * 1e3).toFixed(1)} mH  &times;${N_SEC} = <span class="hl">${R_NET.toFixed(2)} &Omega;</span> Cu
C = 1/(&radic;2&#183;R&#183;&omega;c) = ${(C_SEC * 1e6).toFixed(0)} &micro;F  &times;${N_SEC}, film
Rs ${(RS_ACT * 1e3).toFixed(0)} m&Omega; &rarr; ${RS_PAS.toFixed(2)} &Omega;   DF ${DF_ACT.toFixed(0)} &rarr; ${DF_PAS.toFixed(1)}</div>

<p>That copper burns <span class="num">${LOSS_PCT.toFixed(1)}%</span> of the power in the loop
and ${(N_SEC * C_SEC * 1e6).toFixed(0)}&nbsp;&micro;F of non&#8209;polar film buys the level back
nowhere: insertion loss is <span class="num">${INSERT_DB.toFixed(2)} dB</span>.</p>

<p>Damping factor is the wrong quantity to quote. The voice coil&rsquo;s own
<span class="num">${RE_COIL.toFixed(1)}&nbsp;&Omega;</span> sits in the same series loop, so the
resistance that damps the cone rises from <span class="num">${RD_ACT.toFixed(2)}&nbsp;&Omega;</span>
to <span class="num">${RD_PAS.toFixed(2)}&nbsp;&Omega;</span> &mdash;
<span class="num">${RD_PCT.toFixed(1)}%</span>, not seventeen&#8209;fold. Both figures carry
<span class="num">${(CABLE.rLoop * 1e3).toFixed(1)}&nbsp;m&Omega;</span> of speaker cable, which is
why the active number is ${DF_ACT.toFixed(0)} and not ${DF_TERM.toFixed(0)}.</p>

<p>These are electrical targets. The ear meets the filter multiplied by each
driver&rsquo;s own roll&#8209;off and by the path difference between drivers.</p>`;
  },

  readouts() {
    const S = this._s;
    const f = S ? S.f : 1000;
    const gd = S ? S.gd : groupDelay(1000);
    return [
      { k: 'Crossover', v: `${FL} / 2.20 k`, u: 'Hz', cls: 'acc' },
      { k: 'Slope', v: SLOPE_DB_OCT.toFixed(2), u: 'dB/oct' },
      { k: 'Cursor', v: DSP.fHz(f), u: 'Hz' },
      { k: 'Sum', v: (S ? S.sum : 0).toFixed(3), u: 'dB', cls: 'acc' },
      { k: 'Group delay', v: (gd * 1e3).toFixed(2), u: 'ms', cls: 'am', bar: gd / (GD_MAX_MS * 1e-3) },
      { k: 'Sum phase', v: (S ? S.ph : 0).toFixed(0), u: '°' },
    ];
  },
};
