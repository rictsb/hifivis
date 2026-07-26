import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   ACTIVE CROSSOVER — rack bay 5.

   Linkwitz–Riley 4th order, three ways, 80 Hz and 2.20 kHz, in the serial
   (cascade) topology:

       low  = LP4(80)
       mid  = HP4(80) · LP4(2200)
       high = HP4(80) · HP4(2200)

   Every curve and every number on screen is evaluated from those three
   complex responses; nothing is a fitted constant.

   ---------------------------------------------------------------------------
   NOTE ON A CORE HELPER (reported, not patched)

   `DSP.lrHigh()` is built on `butterHP(f,fc,n) = butterLP(fc,f,n)` — the
   frequency-reversed low-pass. That has the correct MAGNITUDE but the
   COMPLEX-CONJUGATE phase: at f = fc/2 it returns +86.63° where the true
   4th-order high-pass is −86.63°. Two consequences, both fatal if used raw:

     · `DSP.lrSumDb` reports a −2.29 dB dip either side of fc, where the real
       LR4 sum is flat to 0.000 dB;
     · it inverts the LR2 lesson exactly — it claims LR2 sums flat with both
       drivers positive and nulls with one inverted, which is backwards, and
       backwards in precisely the way the brief warns about.

   The true high-pass is the conjugate of what the helper returns, so this
   module wraps it in `HPn()` and forms its own sum. `DSP.lrLow` is correct
   and is used directly; magnitudes out of `DSP.lrHigh` are correct too.
   =========================================================================== */

// ---------------------------------------------------------------------------
// Model constants
// ---------------------------------------------------------------------------
const FL = 80;                          // Hz — LF crossover
const FH = 2200;                        // Hz — HF crossover
const N_ORDER = 4;                      // Linkwitz–Riley 4th order
const SLOPE_DB_OCT = 20 * N_ORDER * Math.log10(2);   // 24.0824 dB/oct
const XO_DB = DSP.dB(0.5);              // −6.0206 dB — each band at its own fc

const C_AIR = DSP.C_SOUND_20C;          // 343.2 m/s
const LAM_H = DSP.lambda(FH);           // 0.1560 m at 2.20 kHz
const LAM_L = DSP.lambda(FL);           // 4.290 m at 80 Hz

// Acoustic centres, metres above the design axis (midpoint of mid & tweeter).
const Y_AC = { low: -0.62, mid: -0.10, high: +0.10 };
const D_MT = Y_AC.high - Y_AC.mid;      // 0.20 m
const D_WM = Y_AC.mid - Y_AC.low;       // 0.52 m
const R_LISTEN = 3.00;                  // m
const OFF_DEG = 15;
const DR_15 = D_MT * Math.sin((OFF_DEG * Math.PI) / 180);         // 51.76 mm
const NULL_DEG = (Math.asin(LAM_H / (2 * D_MT)) * 180) / Math.PI; // 22.95°
const DZ_TW = 0.025;                    // tweeter acoustic centre 25 mm back
const TAU_TW = DZ_TW / C_AIR;           // 72.8 µs
const TILT_DEG = (Math.asin(DZ_TW / D_MT) * 180) / Math.PI;       // 7.18°

// Electrical: damping factor, active vs passive.
const Z_LOAD = 8.0;                     // Ω nominal driver impedance
const Z_OUT = 0.02;                     // Ω amplifier output impedance
const L_PASS = (Math.SQRT2 * Z_LOAD) / (DSP.TAU * FL);            // 22.5 mH
const R_COIL = 0.50;                    // Ω — catalogue DCR for that inductor
const DF_ACT = DSP.dampingFactor(Z_LOAD, Z_OUT);                  // 400
const DF_PAS = DSP.dampingFactor(Z_LOAD, Z_OUT + R_COIL);         // 15.38
const INSERT_DB = DSP.dB(Z_LOAD / (Z_LOAD + Z_OUT + R_COIL));     // −0.547 dB
const LOSS_PCT = (100 * (Z_OUT + R_COIL)) / (Z_LOAD + Z_OUT + R_COIL);

// Carriers vs field, for the loop schematic (10 W into 8 Ω, 2.5 mm² copper).
const I_PEAK = Math.SQRT2 * Math.sqrt(10 / Z_LOAD);               // 1.581 A
const V_DRIFT = DSP.driftVelocity(I_PEAK, 2.5);                   // 4.65e-5 m/s
const X_DRIFT = DSP.driftDisplacement(V_DRIFT, FL);               // 92.5 nm
const V_FIELD = DSP.signalSpeed(0.66);                            // 1.98e8 m/s
const SPEED_RATIO = V_FIELD / V_DRIFT;                            // 4.26e12
// Path difference at 15° for the woofer–midrange spacing, in wavelengths at 80 Hz.
const DR_L15 = (D_WM * Math.sin((OFF_DEG * Math.PI) / 180)) / LAM_L;   // 0.0314

const TIMESCALE = 0.002;
const SWEEP_S = 18;                     // real seconds per cursor round trip

// ---------------------------------------------------------------------------
// Filter maths
// ---------------------------------------------------------------------------
const conj = (a) => [a[0], -a[1]];
const LPn = (f, fc, n) => DSP.lrLow(f, fc, n);
const HPn = (f, fc, n) => conj(DSP.lrHigh(f, fc, n));   // see header note

const bLow = (f) => LPn(f, FL, 4);
const bMid = (f) => DSP.cMul(HPn(f, FL, 4), LPn(f, FH, 4));
const bHigh = (f) => DSP.cMul(HPn(f, FL, 4), HPn(f, FH, 4));
const bSum = (f) => DSP.cAdd(DSP.cAdd(bLow(f), bMid(f)), bHigh(f));

// The same crossover built as LR2, all drivers positive — the myth trace.
const b2Low = (f) => LPn(f, FL, 2);
const b2Mid = (f) => DSP.cMul(HPn(f, FL, 2), LPn(f, FH, 2));
const b2High = (f) => DSP.cMul(HPn(f, FL, 2), HPn(f, FH, 2));
const b2SumPos = (f) => DSP.cAdd(DSP.cAdd(b2Low(f), b2Mid(f)), b2High(f));

const dbOf = (fn) => (f) => DSP.dB(DSP.cAbs(fn(f)));

/* Continuous (never-wrapping) phase of a 2nd-order Butterworth section,
   x = f/fc. atan2 sweeps monotonically here, so no unwrapping is needed. */
const DEG = 180 / Math.PI;
const phLP2 = (x) => -Math.atan2(Math.SQRT2 * x, 1 - x * x);   //   0 → −π
const phHP2 = (x) => Math.atan2(Math.SQRT2 * x, x * x - 1);    //   π → 0

/* Band phase in degrees, each band referenced to its own DC asymptote: a
   constant −360° is removed per high-pass section so all four curves start at
   0° and share one axis. A constant offset changes no group delay and no
   wrapped phase — it is the standard way to overlay LP and HP phase. */
const phLowDeg = (f) => 2 * phLP2(f / FL) * DEG;
const phMidDeg = (f) => (2 * phHP2(f / FL) - DSP.TAU) * DEG + 2 * phLP2(f / FH) * DEG;
const phHighDeg = (f) => (2 * phHP2(f / FL) - DSP.TAU) * DEG + (2 * phHP2(f / FH) - DSP.TAU) * DEG;

/* The summed response is not a simple product, so its phase is unwrapped
   numerically on a log grid, seeded to the low band (which dominates at
   20 Hz), and group delay taken as −dφ/dω by central difference. */
const NTAB = 1024;
const TAB_F = DSP.logSpace(20, 20000, NTAB);
const TAB_PH = new Float64Array(NTAB);   // radians, unwrapped
const TAB_GD = new Float64Array(NTAB);   // seconds
(function buildTable() {
  let off = 0;
  let prev = (phLowDeg(TAB_F[0]) * Math.PI) / 180;
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
  const x = u * (NTAB - 1);
  const i = Math.min(NTAB - 2, Math.floor(x));
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
const GD_FL = groupDelay(FL);
const GD_FH = groupDelay(FH);
const PHASE_SPAN = sumPhaseDeg(20) - sumPhaseDeg(20000);   // ≈ 660°

// ---------------------------------------------------------------------------
// Acoustic sum in space — exact spherical path lengths, 1/r amplitude.
// ---------------------------------------------------------------------------
const BAND = { low: bLow, mid: bMid, high: bHigh };
function acoustic(f, thDeg, tauHigh = 0) {
  const th = (thDeg * Math.PI) / 180;
  const k = (DSP.TAU * f) / C_AIR;
  const px = R_LISTEN * Math.cos(th), py = R_LISTEN * Math.sin(th);
  let s = [0, 0];
  for (const key of ['low', 'mid', 'high']) {
    const d = Math.hypot(px, py - Y_AC[key]);
    let p = -k * d;
    if (key === 'high') p -= DSP.TAU * f * tauHigh;
    s = DSP.cAdd(s, DSP.cMul(BAND[key](f), [Math.cos(p) / d, Math.sin(p) / d]));
  }
  return s;
}
const acousticDb = (f, th, tau = 0) => DSP.dB(DSP.cAbs(acoustic(f, th, tau)) * R_LISTEN);
const AC_15 = acousticDb(FH, OFF_DEG);            // −5.94 dB
const AC_TILT_ON = acousticDb(FH, 0, TAU_TW);     // −1.16 dB

const fmtF = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(0)} Hz`);

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------
/**
 * Backing plate for a diagram.
 *
 * NOT `DIAG.diagramCard`: `DIAG.fadeTree` calls a group's `userData.setOpacity`
 * and then *keeps traversing into its children*, so the card's plate mesh has
 * its `_baseOp` captured after setOpacity has already scaled it to zero on the
 * first (o = 0) call — the card is then permanently invisible. The same trap
 * kills the arrowheads of `DIAG.dimension`, and any two overlay meshes that
 * share one material instance. Everything in this overlay therefore owns its
 * material outright and exposes no `setOpacity`.
 */
function card(w, h, opts = {}) {
  const { opacity = 0.86, pad = 0.024, color = 0x080a0d } = opts;
  const g = new THREE.Group();
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(w + pad * 2, h + pad * 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  p.position.set(w / 2, h / 2, -0.0014);
  p.renderOrder = 4;
  g.add(p);
  const W = w + pad * 2, H = h + pad * 2;
  const b = new DIAG.Trace(5, 0x39414c, 1.0, { opacity: 0.8, renderOrder: 5 });
  b.write((i) => [[-pad, -pad], [-pad + W, -pad], [-pad + W, -pad + H], [-pad, -pad + H], [-pad, -pad]][i].concat(-0.0011));
  g.add(b);
  return g;
}

/** Dimension line with real arrowheads (see the note on `card`). */
function dim(a, b, { color = PAL.ink3, width = 1.3, head: hs = 0.009 } = {}) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const t = new DIAG.Trace(2, color, width, { opacity: 0.9 });
  t.write((i) => (i === 0 ? [A.x, A.y, A.z] : [B.x, B.y, B.z]));
  g.add(t);
  const dir = B.clone().sub(A).normalize();
  for (const [pt, sgn] of [[A, 1], [B, -1]]) {
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(hs * 0.40, hs, 12),
      new THREE.MeshBasicMaterial({
        color, toneMapped: false, transparent: true, opacity: 0.92,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    c.position.copy(pt).addScaledVector(dir, sgn * hs * 0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().multiplyScalar(sgn));
    c.renderOrder = 13;
    g.add(c);
  }
  return g;
}

/**
 * Give a hardware subtree private copies of the shared materials.
 *
 * Defensive, and it should not be necessary: `DIAG.fadeTree` writes
 * `transparent = true; opacity = baseOp × reveal` onto whatever material it
 * finds, so the moment any stage puts a material straight out of `mats()` into
 * its *overlay*, that library entry is driven to opacity 0 for the whole scene
 * whenever that stage is inactive — every other component, and the rack in
 * `core/room.js`, disappears with it. Cloning here costs nothing (the clones
 * inherit the PMREM env map, which is applied before stages build) and keeps
 * this chassis rendering whatever the neighbours do.
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

/** One draw call for N identical rings laid out in the local XY plane. */
function ringField(pts, rIn, rOut, color, opacity = 0.9, seg = 22) {
  const im = new THREE.InstancedMesh(
    new THREE.RingGeometry(rIn, rOut, seg),
    new THREE.MeshBasicMaterial({
      color, toneMapped: false, transparent: true, opacity,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    pts.length,
  );
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2] ?? 0); im.setMatrixAt(i, m); });
  im.renderOrder = 12;
  im.frustumCulled = false;
  return im;
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

/** Flat polyline in the local XY plane. */
function poly(pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  const z = opts.zz ?? 0.0006;
  t.write((i) => [pts[i][0], pts[i][1], z]);
  return t;
}

/** Circle / arc outline in the local XY plane. */
function ring(cx, cy, r, color, width, opts = {}) {
  const n = opts.pts ?? 64;
  const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? DSP.TAU;
  const z = opts.zz ?? 0.0006;
  const t = new DIAG.Trace(n, color, width, opts);
  t.write((i, u) => {
    const a = DSP.lerp(a0, a1, u);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  });
  return t;
}

/** Small solid arrowhead in the XY plane, pointing along +X at scale +1. */
function head(color, size = 0.009) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.44, size, 12),
    new THREE.MeshBasicMaterial({
      color, toneMapped: false, transparent: true, opacity: 0.95,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  m.rotation.z = -Math.PI / 2;   // +Y → +X
  m.renderOrder = 13;
  return m;
}

function flatDot(color, r = 0.006) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 20),
    new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  m.renderOrder = 14;
  return m;
}

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------
const CW = LAYOUT.rack.w - 0.03;     // 0.555
const CH = 0.078;
const CD = LAYOUT.rack.d - 0.06;     // 0.440
const ZF = CD / 2;                   // front face plane, chassis-local

/**
 * The rear I/O field. Built twice: once on the box, once as a callout.
 * The callout omits the metal plate — a flat 0.55 m mirror tipped toward the
 * key light reflects the softbox straight through the bloom threshold, and a
 * technical elevation wants the dark diagram card behind it anyway.
 */
/** Connector x positions, shared by the real panel and its drawn elevation. */
const XLR_X = [];
for (let i = 0; i < 8; i++) XLR_X.push(-0.166 + 0.0555 * i + (i >= 2 ? 0.012 : 0));
const RCA_X = [];
for (let i = 0; i < 16; i++) RCA_X.push(-0.172 + 0.0271 * i + (i >= 4 ? 0.008 : 0));
const XLR_Y = 0.0165, RCA_Y = -0.0180;

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
    j.position.set(XLR_X[i], XLR_Y, -0.004);
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
    j.position.set(RCA_X[i], RCA_Y, -0.004);
    g.add(j);
  }
  // Fixings, heads facing −Z.
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

  // Recessed control tray for the six trims.
  const tray = new THREE.Mesh(GEO.bevelBox(0.305, 0.059, 0.006, 0.0012, 3), M.anodGrey);
  tray.position.set(0.083, 0, ZF - 0.0018);
  g.add(tray);

  // Six level trims: rows are channels (L above, R below), columns are bands.
  const colX = [-0.003, 0.076, 0.155];
  const rowY = [0.0155, -0.0155];
  const trimAngle = [[-0.34, 0.11, 0.45], [-0.30, 0.17, 0.41]];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const k = panelKnob(0.0104, 0.0092, trimAngle[r][c], { body: M.alu, mark: M.chrome, flutes: 40 });
      k.position.set(colX[c], rowY[r], ZF + 0.0046);
      g.add(k);
      const p = led(M.ledCyan, 0.0011);
      p.position.set(colX[c] - 0.0152, rowY[r], zf + 0.0009);
      g.add(p);
    }
  }
  for (const c of colX) {
    const bar = new THREE.Mesh(GEO.bevelBox(0.032, 0.0022, 0.0006, 0.0002, 2), M.plastic);
    bar.position.set(c, 0.0326, ZF - 0.0002);
    g.add(bar);
  }

  // Two frequency-select rotaries with engraved detent arcs.
  const selX = [-0.198, -0.110];
  const selAngle = [-0.62, 0.78];
  for (let i = 0; i < 2; i++) {
    const bez = new THREE.Mesh(GEO.bevelCyl(0.0205, 0.0205, 0.0022, 48, 0.0005), M.chrome);
    bez.rotation.x = Math.PI / 2;
    bez.position.set(selX[i], -0.0015, ZF + 0.0011);
    g.add(bez);
    const k = panelKnob(0.0142, 0.0116, selAngle[i], { body: M.alu, mark: M.chrome, flutes: 52 });
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
  const stby = new THREE.Mesh(GEO.bevelCyl(0.0062, 0.0066, 0.0035, 28, 0.0006), M.alu);
  stby.rotation.x = Math.PI / 2;
  stby.position.set(-0.254, -0.019, ZF + 0.0018);
  g.add(stby);
  const pwr = led(M.ledCyan, 0.0017);
  pwr.position.set(-0.254, 0.020, zf + 0.0011);
  g.add(pwr);

  const win = new THREE.Mesh(GEO.bevelBox(0.052, 0.021, 0.003, 0.0008, 3), M.glass);
  win.position.set(0.246, 0.0, ZF + 0.0008);
  g.add(win);
  for (const [w, x, y] of [[0.038, 0.243, 0.0045], [0.026, 0.237, -0.0045]]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.0024), M.meterGlow);
    bar.position.set(x, y, ZF + 0.0026);
    g.add(bar);
  }

  /* No full-width scribe ribs on the fascia. A thin metal rod standing proud
     of a panel is seen at a grazing angle from any normal camera, Fresnel
     takes its reflectance to 1, and it renders as a blown light bar rather
     than a machined line. The brand plate below is a broad shallow inset, so
     it is seen face-on and behaves. */
  const plate = new THREE.Mesh(GEO.bevelBox(0.064, 0.014, 0.0016, 0.0005, 3), M.anodGrey);
  plate.position.set(-0.152, 0.0252, ZF - 0.0006);
  g.add(plate);

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
    if (o.material && o.material.isMeshBasicMaterial) { o.castShadow = false; o.receiveShadow = false; }
  });

  privatise(g);
  /* The fascia gets its own copy, a touch less polished than the library
     brushed aluminium: at this bevel radius the top edge fillet of a 0.26
     roughness panel returns a highlight above the 0.92 bloom threshold and
     the box reads as if it had a light bar along the top, which it has not. */
  const face = g.children[0].userData.face;
  face.material = face.material.clone();
  face.material.roughness = 0.44;
  face.material.envMapIntensity = 0.62;
  face.material.anisotropy = 0.45;

  const root = new THREE.Group();
  root.add(g);
  root.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.xover, CH) + 0.006, LAYOUT.rack.z);
  return root;
}

// ---------------------------------------------------------------------------
// Overlay layout (sheet-local metres, origin bottom-left)
// ---------------------------------------------------------------------------
const SHEET = { w: 0.620, h: 0.980 };
const G1 = { x: 0.020, y: 0.800, w: 0.580, h: 0.165 };   // magnitude
const G2 = { x: 0.020, y: 0.684, w: 0.580, h: 0.080 };   // phase
const G3 = { x: 0.020, y: 0.578, w: 0.580, h: 0.066 };   // group delay
const G4 = { x: 0.020, y: 0.436, w: 0.580, h: 0.095 };   // acoustic
const DAMP = { x: 0.020, y: 0.290, w: 0.560, h: 0.120 }; // active vs passive
const GEOM = { x: 0.078, y: 0.148 };                     // acoustic-centre origin
const RAY = 0.320;

export default {
  id: 'xover',
  title: 'Active&nbsp;Crossover',
  nav: 'Crossover',
  kicker: 'Crossover',
  standfirst: 'Split the band before the amplifiers and the amplifiers stop fighting.',
  shot: { position: [1.50, 1.44, -0.62], target: [0.67, 1.16, -2.95], fov: 33 },
  timeScale: TIMESCALE,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildHardware();
    const overlay = new THREE.Group();
    const S = {};
    this._s = S;

    // ===== measurement sheet ==============================================
    const sheet = new THREE.Group();
    sheet.position.set(0.540, 0.660, -2.786);
    sheet.rotation.y = 0.36;
    overlay.add(sheet);
    sheet.add(card(SHEET.w, SHEET.h, { opacity: 0.90, pad: 0.024 }));

    for (const y of [0.775, 0.556, 0.418, 0.272]) {
      sheet.add(poly([[0.014, y], [SHEET.w - 0.014, y]], 0x39414c, 1.0, { opacity: 0.34, zz: -0.001 }));
    }

    const axis = { xLog: true, xRange: [20, 20000] };

    // ---- magnitude -------------------------------------------------------
    const gm = new DIAG.Graph({
      ...axis, w: G1.w, h: G1.h, yRange: [-30, 6],
      yTicks: [-30, -24, -18, -12, -6, 0, 6], zeroLine: 0,
    });
    gm.position.set(G1.x, G1.y, 0);
    sheet.add(gm);
    S.gm = gm;
    gm.addTrace(() => XO_DB, { color: PAL.cy, width: 1.0, n: 2, dashed: true, opacity: 0.30 });
    gm.addTrace(dbOf(b2SumPos), { color: PAL.rd, width: 1.8, dashed: true, opacity: 0.92, n: 480 });
    for (const fn of [bLow, bMid, bHigh]) {
      gm.addTrace(dbOf(fn), { color: PAL.cy, width: 1.8, opacity: 0.78, n: 400 });
    }
    gm.addTrace(dbOf(bSum), { color: PAL.gr, width: 3.0, n: 400 });
    gm.addMarker(FL, { color: PAL.am, opacity: 0.48 });
    gm.addMarker(FH, { color: PAL.am, opacity: 0.48 });
    for (const f of [FL, FH]) gm.addDot(PAL.am, 0.0040).userData.setData(f, XO_DB);
    S.curM = gm.addMarker(1000, { color: PAL.ink, dashed: false, width: 1.1, opacity: 0.42 });
    S.dotM = gm.addDot(PAL.gr, 0.0052);

    // ---- phase -----------------------------------------------------------
    const gp = new DIAG.Graph({
      ...axis, w: G2.w, h: G2.h, yRange: [-760, 40],
      yTicks: [-720, -540, -360, -180, 0], zeroLine: 0,
    });
    gp.position.set(G2.x, G2.y, 0);
    sheet.add(gp);
    S.gp = gp;
    for (const fn of [phLowDeg, phMidDeg, phHighDeg]) {
      gp.addTrace(fn, { color: PAL.cy, width: 1.6, opacity: 0.60, n: 360 });
    }
    gp.addTrace(sumPhaseDeg, { color: PAL.gr, width: 2.6, n: 360 });
    gp.addMarker(FL, { color: PAL.am, opacity: 0.40 });
    gp.addMarker(FH, { color: PAL.am, opacity: 0.40 });
    S.curP = gp.addMarker(1000, { color: PAL.ink, dashed: false, width: 1.1, opacity: 0.42 });
    S.dotP = gp.addDot(PAL.gr, 0.0042);

    // ---- group delay -----------------------------------------------------
    const gg = new DIAG.Graph({
      ...axis, w: G3.w, h: G3.h, yRange: [0, 8], yTicks: [0, 2, 4, 6, 8],
    });
    gg.position.set(G3.x, G3.y, 0);
    sheet.add(gg);
    S.gg = gg;
    gg.addArea((f) => groupDelay(f) * 1e3, { color: PAL.am, opacity: 0.13, n: 220 });
    gg.addTrace((f) => groupDelay(f) * 1e3, { color: PAL.am, width: 2.4, n: 360 });
    gg.addMarker(FL, { color: PAL.am, opacity: 0.40 });
    gg.addMarker(FH, { color: PAL.am, opacity: 0.40 });
    S.curG = gg.addMarker(1000, { color: PAL.ink, dashed: false, width: 1.1, opacity: 0.42 });
    S.dotG = gg.addDot(PAL.am, 0.0042);

    // ---- acoustic sum ----------------------------------------------------
    const ga = new DIAG.Graph({
      ...axis, w: G4.w, h: G4.h, yRange: [-18, 6],
      yTicks: [-18, -12, -6, 0, 6], zeroLine: 0,
    });
    ga.position.set(G4.x, G4.y, 0);
    sheet.add(ga);
    S.ga = ga;
    ga.addTrace((f) => acousticDb(f, 0, TAU_TW), { color: PAL.am, width: 1.7, dashed: true, opacity: 0.85, n: 300 });
    ga.addTrace((f) => acousticDb(f, OFF_DEG), { color: PAL.vi, width: 2.1, n: 340 });
    ga.addTrace((f) => acousticDb(f, 0), { color: PAL.gr, width: 2.6, n: 300 });
    ga.addMarker(FL, { color: PAL.am, opacity: 0.40 });
    ga.addMarker(FH, { color: PAL.am, opacity: 0.40 });

    // ---- active vs passive: two closed loops -----------------------------
    const dmp = new THREE.Group();
    dmp.position.set(DAMP.x, DAMP.y, 0);
    sheet.add(dmp);
    S.arrows = [];
    const rows = [
      { y0: 0.072, col: PAL.cy, coil: false },
      { y0: 0.002, col: PAL.am, coil: true },
    ];
    for (const row of rows) {
      const y0 = row.y0, y1 = row.y0 + 0.046;
      const xa = 0.034, xb = DAMP.w - 0.050;
      dmp.add(poly([[0.004, y0 - 0.012], [0.004, y1 + 0.012], [xa, (y0 + y1) / 2], [0.004, y0 - 0.012]],
        row.col, 1.6, { opacity: 0.9 }));
      dmp.add(poly([[xb, y0 - 0.008], [xb, y1 + 0.008], [xb + 0.032, y1 + 0.022], [xb + 0.032, y0 - 0.022], [xb, y0 - 0.008]],
        row.col, 1.6, { opacity: 0.9 }));
      if (row.coil) {
        const cx0 = 0.230, cx1 = 0.340, turns = 5, seg = 14;
        const pts = [[xa, y1]];
        for (let i = 0; i <= turns * seg; i++) {
          const u = i / (turns * seg);
          pts.push([DSP.lerp(cx0, cx1, u), y1 + Math.sin(u * Math.PI * turns) * 0.0125]);
        }
        pts.push([xb, y1]);
        dmp.add(poly(pts, row.col, 1.7, { opacity: 0.95 }));
        dmp.add(poly([[0.360, y1 - 0.0095], [0.360, y1 + 0.0095], [0.414, y1 + 0.0095], [0.414, y1 - 0.0095], [0.360, y1 - 0.0095]],
          PAL.rd, 1.7, { opacity: 0.95 }));
      } else {
        dmp.add(poly([[xa, y1], [xb, y1]], row.col, 1.7, { opacity: 0.95 }));
      }
      dmp.add(poly([[xa, y0], [xb, y0]], row.col, 1.7, { opacity: 0.95 }));
      dmp.add(poly([[xa, y0], [xa, y1]], row.col, 1.4, { opacity: 0.5 }));
      dmp.add(poly([[xb, y0], [xb, y1]], row.col, 1.4, { opacity: 0.5 }));

      const aTop = head(row.col); aTop.position.set(0.106, y1, 0.0014); dmp.add(aTop);
      const aBot = head(row.col); aBot.position.set(0.106, y0, 0.0014); dmp.add(aBot);
      S.arrows.push({ top: aTop, bot: aBot });
    }

    // ---- true-scale acoustic geometry ------------------------------------
    const geo = new THREE.Group();
    geo.position.set(GEOM.x, GEOM.y, 0);
    sheet.add(geo);
    S.geo = geo;
    const yM = Y_AC.mid, yT = Y_AC.high;             // −0.10 / +0.10, true scale

    // cabinet cross-section, so the sketch reads as a loudspeaker at once
    geo.add(poly([[0, yM - 0.062], [-0.052, yM - 0.062], [-0.052, yT + 0.030], [0, yT + 0.030], [0, yM - 0.062]],
      PAL.ink3, 1.3, { opacity: 0.5 }));
    geo.add(poly([[0, yM - 0.062], [0, yT + 0.030]], PAL.ink3, 2.0, { opacity: 0.8 }));
    geo.add(ring(0, yM, 0.045, PAL.cy, 2.4, { opacity: 0.9 }));
    geo.add(ring(0, yM, 0.015, PAL.cy, 1.2, { opacity: 0.45 }));
    geo.add(ring(0, yT, 0.0115, PAL.cy, 2.6, { opacity: 0.95 }));
    geo.add(poly([[-0.020, yT], [0.020, yT]], PAL.cy, 1.0, { opacity: 0.35 }));

    const th15 = (OFF_DEG * Math.PI) / 180;
    const u15 = [Math.cos(th15), Math.sin(th15)];
    geo.add(poly([[0, 0], [RAY, 0]], PAL.gr, 1.8, { dashed: true, opacity: 0.95 }));
    geo.add(poly([[0, 0], [RAY * u15[0], RAY * u15[1]]], PAL.vi, 1.8, { dashed: true, opacity: 1 }));
    geo.add(ring(0, 0, 0.078, PAL.ink3, 1.1, { opacity: 0.55, a0: 0, a1: th15, pts: 16 }));

    /* Wavefront crests, at true scale and true speed. A crest of radius r from
       a source at height ys meets a ray at angle θ at
           s = ys·sinθ + √(r² − ys²·cos²θ),
       so the two crests are separated along that ray by exactly d·sinθ. */
    S.ticks = [];
    for (const ys of [yM, yT]) {
      for (let n = 0; n < 3; n++) {
        for (const [th, u] of [[0, [1, 0]], [th15, u15]]) {
          // a crest is marked where it cuts the ray: a tick square to the ray,
          // plus a short segment of the true (curved) wavefront through it
          const t = new DIAG.Trace(2, PAL.cy, n === 0 ? 2.8 : 2.0,
            { opacity: n === 0 ? 0.95 : 0.5 });
          const a = new DIAG.Trace(9, PAL.cy, 1.2, { opacity: n === 0 ? 0.4 : 0.22 });
          t.userData = { ys, n, th, u };
          geo.add(t); geo.add(a);
          S.ticks.push({ t, a });
        }
      }
    }
    // λ ruler, the path difference and the driver spacing — all at true scale.
    geo.add(dim([RAY - LAM_H, yM - 0.040, 0.001], [RAY, yM - 0.040, 0.001],
      { color: PAL.ink3, head: 0.010 }));
    geo.add(dim(
      [RAY * u15[0] - u15[0] * DR_15, RAY * u15[1] - u15[1] * DR_15, 0.0016],
      [RAY * u15[0], RAY * u15[1], 0.0016], { color: PAL.vi, head: 0.010 },
    ));
    geo.add(dim([-0.026, yM, 0.001], [-0.026, yT, 0.001], { color: PAL.ink3, head: 0.010 }));

    S.pOn = flatDot(PAL.gr, 0.0068);
    S.pOn.position.set(RAY, 0, 0.0025); geo.add(S.pOn);
    S.pOff = flatDot(PAL.vi, 0.0068);
    S.pOff.position.set(RAY * u15[0], RAY * u15[1], 0.0025); geo.add(S.pOff);

    /* ===== rear elevation, drawn at true scale above the rack ==============
       The real rear panel is on the chassis, facing the wall. Here it is drawn
       flat in the diagram language rather than modelled again: a lit metal
       plate this size floating in the room reflects the practicals straight
       through the bloom threshold, and the point of the callout is to count
       connectors, not to admire them. 24 sockets: 8 balanced + 16 unbalanced,
       one input pair and three output pairs, per channel. */
    const call = new THREE.Group();
    call.position.set(0.075, 1.296, -3.020);
    call.rotation.set(-0.12, 0.48, 0);
    overlay.add(call);
    const cw2 = CW + 0.020, ch2 = CH + 0.014;
    const cc = card(cw2, ch2, { opacity: 0.82, pad: 0.010 });
    cc.position.set(-cw2 / 2, -ch2 / 2, 0);
    call.add(cc);
    call.add(ringField(XLR_X.map((x) => [x, XLR_Y, 0.001]), 0.0086, 0.0106, PAL.cy, 0.92));
    const pins = [];
    for (const x of XLR_X) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * DSP.TAU - Math.PI / 2;
        pins.push([x + Math.cos(a) * 0.0035, XLR_Y + Math.sin(a) * 0.0035, 0.0012]);
      }
    }
    call.add(ringField(pins, 0, 0.0011, PAL.cy, 0.8, 8));
    call.add(ringField(RCA_X.map((x) => [x, RCA_Y, 0.001]), 0.0036, 0.0049, PAL.cy, 0.80));
    call.add(ringField(RCA_X.map((x) => [x, RCA_Y, 0.0012]), 0, 0.0011, PAL.cy, 0.5, 8));
    // mains end: IEC outline, rocker, fuse
    call.add(poly([[-0.250, -0.008], [-0.250, 0.010], [-0.244, 0.015], [-0.228, 0.015], [-0.222, 0.010],
      [-0.222, -0.008], [-0.250, -0.008]], PAL.ink3, 1.4, { opacity: 0.7 }));
    call.add(poly([[-0.250, -0.026], [-0.250, -0.014], [-0.230, -0.014], [-0.230, -0.026], [-0.250, -0.026]],
      PAL.ink3, 1.4, { opacity: 0.7 }));
    call.add(ringField([[-0.212, -0.020, 0.001]], 0.0034, 0.0046, PAL.ink3, 0.7));
    // bracket under each pair: 1 input pair, 3 output pairs
    for (let p = 0; p < 4; p++) {
      const x0 = XLR_X[p * 2] - 0.010, x1 = XLR_X[p * 2 + 1] + 0.010;
      const y = 0.0320;
      call.add(poly([[x0, y - 0.004], [x0, y], [x1, y], [x1, y - 0.004]],
        p === 0 ? PAL.am : PAL.cy, 1.4, { opacity: 0.75 }));
    }
    S.call = call;

    // ===== labels =========================================================
    const L = ctx.labels;
    const anchor = (parent, x, y, z = 0) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    const sp = ' ';   // en space between the roman lead-in and the figure

    // Hardware and callout hang off to the left, into the empty half of frame.
    S.lFascia = L.add(anchor(hardware, -CW / 2 - 0.006, 0.002, ZF), {
      kicker: 'Active crossover · LR4',
      value: `${FL} Hz / ${fmtF(FH)}`,
      cls: 'acc lead', offset: [-78, 0],
    });
    S.lCall = L.add(anchor(call, -CW / 2 + 0.014, 0.004, 0), {
      kicker: 'Rear · 2 in, 6 out',
      value: '6 amplifier channels',
      cls: 'lead', offset: [-70, 0],
    });

    // Sheet labels sit in the empty quadrant of whichever graph they explain.
    S.lCur = L.add(anchor(gm, 0, 0, 0), {
      kicker: 'cursor', value: '—', cls: 'acc', offset: [0, -26],
    });
    S.lSum = L.add(anchor(gm, gm.x(90), -0.024), {
      text: `Sum, both drivers positive${sp}`, value: `${SUM_ERR.toFixed(3)} dB`,
      cls: 'acc', offset: [0, 0],
    });
    S.lSix = L.add(anchor(gm, gm.x(5200), -0.024), {
      text: `every band at its own fc${sp}`, value: `${XO_DB.toFixed(2)} dB`,
      cls: 'am', offset: [0, 0],
    });
    S.lMyth = L.add(anchor(gm, gm.x(400), gm.y(-23)), {
      kicker: 'as LR2, both positive',
      value: 'null at each crossover', offset: [0, 0],
    });

    S.lPh = L.add(anchor(gp, gp.x(150), gp.y(-660)), {
      kicker: 'Phase — the bands stay in step',
      value: `sum turns ${Math.round(PHASE_SPAN)}°, 360° per crossover`,
      offset: [0, 0],
    });
    S.lGd = L.add(anchor(gg, gg.x(2400), gg.y(6.2)), {
      kicker: 'Group delay',
      value: `${(GD_FL * 1e3).toFixed(2)} ms @ ${FL} Hz · ${(GD_FH * 1e3).toFixed(2)} ms @ 2.2 kHz`,
      cls: 'am', offset: [0, 0],
    });
    S.lAc = L.add(anchor(ga, ga.x(260), ga.y(-12.6)), {
      kicker: `Acoustic sum at 3 m · on axis / ${OFF_DEG}° off / untimed`,
      value: `${AC_15.toFixed(2)} dB at 2.2 kHz, ${OFF_DEG}° off axis`,
      offset: [0, 0],
    });

    S.lAct = L.add(anchor(dmp, 0.150, 0.111), {
      text: `Active${sp}`, value: `damping factor ${DF_ACT.toFixed(0)}`,
      cls: 'acc', offset: [0, 0],
    });
    S.lPas = L.add(anchor(dmp, 0.150, 0.029), {
      text: `Passive · ${(L_PASS * 1e3).toFixed(1)} mH${sp}`,
      value: `${R_COIL.toFixed(2)} Ω → DF ${DF_PAS.toFixed(1)}`,
      cls: 'am', offset: [0, 0],
    });
    S.lLoop = L.add(anchor(dmp, DAMP.w * 0.5, -0.030), {
      text: `current is a closed loop; carriers oscillate${sp}`,
      value: `±${(X_DRIFT * 1e9).toFixed(0)} nm, field 0.66 c`,
      offset: [0, 0],
    });

    S.lGeom = L.add(anchor(geo, RAY * 0.58, yM - 0.058), {
      kicker: `Δr = d·sinθ    d ${D_MT.toFixed(2)} m, λ ${(LAM_H * 1e3).toFixed(0)} mm`,
      value: `${(DR_15 * 1e3).toFixed(1)} mm = ${(DR_15 / LAM_H).toFixed(3)} λ = ${(360 * DR_15 / LAM_H).toFixed(0)}°`,
      offset: [0, 22],
    });

    S.f = 1000;
    S.tau = GD_FL;
    return { hardware, overlay };
  },

  update(dt, t, ctx) {
    const S = this._s;
    if (!S) return;

    /* Cursor. This is a display cursor, not a signal: it runs on the wall
       clock (one round trip every 18 s), not at the 1 : 500 audio time scale
       everything else on this stage uses. */
    const real = t / TIMESCALE;
    const u = (real / SWEEP_S) % 1;
    const f = 20 * Math.pow(1000, u < 0.5 ? u * 2 : 2 - u * 2);
    S.f = f;

    const sd = DSP.dB(DSP.cAbs(bSum(f)));
    const pd = sumPhaseDeg(f);
    const gd = groupDelay(f);
    S.tau = gd;

    S.curM.userData.setX(f); S.dotM.userData.setData(f, sd);
    S.curP.userData.setX(f); S.dotP.userData.setData(f, pd);
    S.curG.userData.setX(f); S.dotG.userData.setData(f, gd * 1e3);
    S.lCur.anchor.position.set(S.gm.x(DSP.clamp(f, 45, 4000)), G1.h, 0);
    S.lCur.setValue(`${fmtF(f)}   sum ${sd >= 0 ? '+' : ''}${sd.toFixed(3)} dB   τ ${(gd * 1e3).toFixed(2)} ms`);

    // ---- wavefronts: crest spacing λ = 156 mm, speed 343.2 m/s -----------
    const frac = (t * FH) % 1;
    const TICK = 0.011;
    for (const tk of S.ticks) {
      const { ys, n, th, u: uu } = tk.t.userData;
      const r = LAM_H * (frac + n + 1);
      const c2 = ys * ys * Math.cos(th) * Math.cos(th);
      const s = r * r > c2 ? ys * Math.sin(th) + Math.sqrt(r * r - c2) : -1;
      if (s < 0.04 || s > RAY) { tk.t.visible = false; tk.a.visible = false; continue; }
      tk.t.visible = true; tk.a.visible = true;
      const px = s * uu[0], py = s * uu[1];
      tk.t.write((i) => {
        const g = i === 0 ? -TICK : TICK;
        return [px - uu[1] * g, py + uu[0] * g, 0.0022];
      });
      const a0 = Math.atan2(py - ys, px);
      tk.a.write((i, v) => {
        const a = a0 + (v - 0.5) * 0.16;
        return [Math.cos(a) * r, ys + Math.sin(a) * r, 0.0010];
      });
    }
    const car = Math.cos(DSP.TAU * t * FH);
    const psi = (Math.PI * DR_15) / LAM_H;                 // 59.75° half-difference
    S.pOn.scale.setScalar(0.5 + 0.8 * Math.abs(car));
    S.pOff.scale.setScalar(0.5 + 0.8 * Math.abs(car * Math.cos(psi)));

    /* The loop current alternates: both arrows flip together, so the circuit
       is closed at every instant. 80 Hz at the stage time scale. */
    const i80 = Math.sin(DSP.TAU * t * FL);
    const sc = 0.35 + 0.9 * Math.abs(i80);
    for (const a of S.arrows) {
      a.top.scale.set(sc, i80 >= 0 ? sc : -sc, sc);
      a.bot.scale.set(sc, i80 >= 0 ? -sc : sc, sc);
    }
  },

  content() {
    return `
<h3>The split</h3>
<p>Three ways, Linkwitz&#8209;Riley 4th order, at <span class="num">${FL} Hz</span> and
<span class="num">${fmtF(FH)}</span>. Each band is two cascaded Butterworth sections,
so the asymptote is <span class="num">20&#183;4&#183;log&#8321;&#8320;2 = ${SLOPE_DB_OCT.toFixed(2)} dB</span>
per octave and every band sits at <span class="num">${XO_DB.toFixed(2)} dB</span> at its
own crossover &mdash; not &minus;3.</p>

<div class="eq">|LP| = |HP| = 0.5 at f<span class="c">c</span>   <span class="c">→ 20·log₁₀0.5 = ${XO_DB.toFixed(2)} dB</span>
low + mid + high = <span class="hl">${SUM_ERR.toFixed(3)} dB</span>   <span class="c">worst case, at ${SUM_ERR_F.toFixed(0)} Hz</span></div>

<p>The two halves of an LR4 are in phase at <em>every</em> frequency, so they add to
unity. What they add up to is an all&#8209;pass: <b>360&deg; of rotation through each
crossover</b>, ${Math.round(PHASE_SPAN)}&deg; of it inside the audio band. Group delay
peaks at <span class="num">${(GD_PEAK * 1e3).toFixed(2)} ms</span> at
<span class="num">${GD_PEAK_F.toFixed(0)} Hz</span> and falls to
<span class="num">${(GD_FH * 1e3).toFixed(2)} ms</span> at ${fmtF(FH)}. Magnitude is
untouched; only the arrival time of the bass moves.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>LR2 sums flat too
&mdash; but only with one driver&rsquo;s polarity <em>reversed</em>. Wire an LR2 with both
positive and you get a null at the crossover, not a bump. LR4 is the opposite:
both positive. The red trace is that mistake.</p></div>

<h3>Why before the amplifier</h3>
<p>A passive low&#8209;pass puts an inductor in series with the woofer. The Butterworth
alignment for ${Z_LOAD}&nbsp;&Omega; at ${FL}&nbsp;Hz needs
&radic;2&#183;R/&omega;<sub>c</sub> = <span class="num">${(L_PASS * 1e3).toFixed(1)} mH</span>, and a coil
that size carries about <span class="num">${R_COIL.toFixed(2)} &Omega;</span> of copper.
That resistance adds to the amplifier&rsquo;s output impedance, so damping factor at the
voice coil falls from ${Z_LOAD}/${Z_OUT} = <span class="num">${DF_ACT.toFixed(0)}</span> to
${Z_LOAD}/${(Z_OUT + R_COIL).toFixed(2)} = <span class="num">${DF_PAS.toFixed(1)}</span>, costing
<span class="num">${INSERT_DB.toFixed(2)} dB</span> and burning
<span class="num">${LOSS_PCT.toFixed(1)}%</span> of the power before the cone.</p>

<p>Current is a closed loop in both drawings, and nothing races along it. At 10&nbsp;W
into ${Z_LOAD}&nbsp;&Omega; through 2.5&nbsp;mm&sup2; copper the carriers reach
<span class="num">${DSP.si(V_DRIFT)}m/s</span> and, on an ${FL}&nbsp;Hz sine, merely
oscillate <span class="num">&plusmn;${(X_DRIFT * 1e9).toFixed(0)} nm</span> about a fixed
point. The field crosses the same wire at <span class="num">0.66&nbsp;c</span> &mdash;
<span class="num">${(SPEED_RATIO / 1e12).toFixed(1)} &times; 10&#185;&sup2;</span> times faster.</p>

<div class="key"><span class="lab">The idea</span><p>Filter at line level, where a
decibel is free and no inductor is needed, then give every driver its own
amplifier. Six outputs, six amplifier channels &mdash; and no output stage ever
carries another band&rsquo;s current.</p></div>

<h3>The crossover is acoustic</h3>
<p>Midrange and tweeter acoustic centres are <span class="num">${D_MT.toFixed(2)} m</span>
apart; at ${fmtF(FH)}, &lambda; = <span class="num">${(LAM_H * 1e3).toFixed(0)} mm</span>.
${OFF_DEG}&deg; off the design axis adds <span class="num">${(DR_15 * 1e3).toFixed(1)} mm</span>
of path &mdash; ${(DR_15 / LAM_H).toFixed(3)}&thinsp;&lambda;, ${(360 * DR_15 / LAM_H).toFixed(0)}&deg;
&mdash; and the sum falls to <span class="num">${AC_15.toFixed(2)} dB</span>. The first full
null is at arcsin(&lambda;/2d) = <span class="num">${NULL_DEG.toFixed(1)}&deg;</span>. Let the
tweeter&rsquo;s acoustic centre sit ${(DZ_TW * 1e3).toFixed(0)}&nbsp;mm behind the midrange&rsquo;s
and the lobe tilts by arcsin(&Delta;z/d) = <span class="num">${TILT_DEG.toFixed(1)}&deg;</span>,
taking <span class="num">${AC_TILT_ON.toFixed(2)} dB</span> off the design axis. At
${FL}&nbsp;Hz the woofer&rsquo;s ${D_WM.toFixed(2)}&nbsp;m offset buys only
${DR_L15.toFixed(3)}&thinsp;&lambda; and nothing happens: lobing is set by spacing over
wavelength, so it is the top crossover that has to be aimed.</p>`;
  },

  readouts() {
    const S = this._s;
    const tau = S ? S.tau : GD_FL;
    return [
      { k: 'Crossover', v: `${FL} / 2.2 k`, u: 'Hz', cls: 'acc' },
      { k: 'Slope', v: SLOPE_DB_OCT.toFixed(2), u: 'dB/oct' },
      { k: 'Sum error', v: SUM_ERR.toFixed(3), u: 'dB', cls: 'acc' },
      { k: 'Group delay', v: (tau * 1e3).toFixed(2), u: 'ms', cls: 'am', bar: tau / 8e-3 },
      { k: 'DF active', v: DF_ACT.toFixed(0), u: '', cls: 'acc' },
      { k: 'DF passive', v: DF_PAS.toFixed(1), u: '', cls: 'am' },
    ];
  },
};
