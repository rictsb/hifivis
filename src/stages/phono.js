import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   PHONO STAGE — RIAA equalisation.

   Every quantity below is computed from DSP or from an explicit closed-form
   expression. Nothing is a constant chosen because it looked right.
   =========================================================================== */

// --- the three time constants ------------------------------------------------
const F1 = DSP.RIAA_F.f1;                       // 3180 µs → 50.05 Hz  pole
const F2 = DSP.RIAA_F.f2;                       //  318 µs → 500.49 Hz zero
const F3 = DSP.RIAA_F.f3;                       //   75 µs → 2122.07 Hz pole

// --- groove mechanics --------------------------------------------------------
// A magnetic cartridge is a velocity transducer. For a lateral sinusoid of
// peak velocity v̂ the peak displacement is a = v̂/ω, so a constant-velocity
// cut makes the excursion grow as 1/f.
const V_REF = 0.05;                             // m/s peak — the 5 cm/s reference
const exc = (v, f) => v / (DSP.TAU * f);
const A_1K = exc(V_REF, 1000);                  // 7.958 µm
const A_50_FLAT = exc(V_REF, 50);               // 159.155 µm
const REC_50 = DSP.riaaRecordDb(50);            // −16.946 dB
const A_50_RIAA = exc(V_REF * DSP.undB(REC_50), 50);  // 22.622 µm
const A_RATIO = A_50_FLAT / A_50_RIAA;          // 7.035 = undB(16.946)

// Average groove pitch: a 20-minute side at 33⅓ rpm is 666.7 revolutions,
// spread across the recorded band from 146.05 mm to 60.0 mm radius.
const LP_TURNS = 20 * (100 / 3);
const LP_BAND = 0.14605 - 0.0600;
const PITCH = LP_BAND / LP_TURNS;               // 129.08 µm

// --- gain budget -------------------------------------------------------------
const V_CART = 0.30e-3;                         // V rms, MC at the 5 cm/s reference
const V_LINE = 2.0;                             // V rms, full line level
const G_TOTAL_DB = DSP.dB(V_LINE / V_CART);     // 76.478 dB
const G_STAGE_DB = 64.0;                        // this unit's specification
const V_OUT = V_CART * DSP.undB(G_STAGE_DB);    // 0.4755 V rms
const G_REST_DB = G_TOTAL_DB - G_STAGE_DB;      // 12.478 dB left for the line stage
// A *passive* RIAA network is unity at DC and lossy in the midband:
const NET_LOSS_1K = DSP.dB(DSP.cAbs(DSP.riaaRaw(1000)));   // −19.911 dB
const AMP_RAW_DB = G_STAGE_DB - NET_LOSS_1K;    // 83.911 dB of raw amplification

// --- noise -------------------------------------------------------------------
const K_B = 1.380649e-23, T_K = 293.15;         // 20 °C
const R_CART = 10;                              // Ω, MC coil resistance
const EN_DEV = 1.0e-9;                          // V/√Hz, input device
const EN_R = Math.sqrt(4 * K_B * T_K * R_CART); // 0.4024 nV/√Hz Johnson
const EN_TOT = Math.hypot(EN_DEV, EN_R);        // 1.0779 nV/√Hz
// The noise is shaped by the playback curve too, so the honest bandwidth is
// ∫|H(f)/H(1k)|² df over 20 Hz–20 kHz, not a flat 20 kHz.
const ENB = (() => {
  const a = Math.log(20), b = Math.log(20000), n = 2000;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const f = Math.exp(a + ((b - a) * (i + 0.5)) / n);
    const p = DSP.undB(DSP.riaaPlaybackDb(f));
    s += p * p * f * ((b - a) / n);
  }
  return s;                                     // 8630 Hz
})();
const V_NOISE = EN_TOT * Math.sqrt(ENB);        // 100.1 nV rms
const SNR_DB = DSP.dB(V_CART / V_NOISE);        // 69.5 dB

// --- what component tolerance actually costs ---------------------------------
// 0.1 % resistors with 1 % film capacitors put each RC within √(.001²+.01²).
const D_T = Math.hypot(0.001, 0.010);           // 1.005 %
const TOL_DB = (() => {
  const mag = (T, f) => {
    const w = DSP.TAU * f;
    return DSP.cAbs(DSP.cDiv([1, w * T.T2], DSP.cMul([1, w * T.T1], [1, w * T.T3])));
  };
  const base = DSP.RIAA_T;
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    const f = Math.pow(10, Math.log10(20) + (3 * i) / 599);
    let ss = 0;
    for (const k of ['T1', 'T2', 'T3']) {
      const q = Object.assign({}, base);
      q[k] = base[k] * (1 + D_T);
      const e = DSP.dB(mag(q, f) / mag(q, 1000)) - DSP.dB(mag(base, f) / mag(base, 1000));
      ss += e * e;
    }
    worst = Math.max(worst, Math.sqrt(ss));
  }
  return worst;                                 // 0.103 dB
})();

// --- the input loop: carriers vs field ---------------------------------------
const Z_LOAD = 100;                             // Ω, MC loading
const I_RMS = V_CART / (Z_LOAD + R_CART);       // 2.727 µA
const I_PK = I_RMS * Math.SQRT2;                // 3.857 µA
const WIRE_MM2 = 0.05;                          // mm², tonearm litz
const V_DRIFT = DSP.driftVelocity(I_PK, WIRE_MM2);        // 5.669 nm/s
const X_DRIFT = DSP.driftDisplacement(V_DRIFT, 1000);     // 0.902 pm
const C_FIELD = DSP.signalSpeed(0.66);          // 1.979e8 m/s
const CABLE_L = 1.2;                            // m of arm cable
const T_TRANSIT = CABLE_L / C_FIELD;            // 6.07 ns
const CYCLE_1K = 1 / 1000;                      // s
const FIELD_PER_HALF = (C_FIELD * CYCLE_1K) / 2;// 98.9 km
const SPEED_RATIO = C_FIELD / V_DRIFT;          // 3.49e16
const CU_SPACING = 255.6e-12;                   // m, fcc Cu nearest neighbour a/√2

// display magnifications, stated on screen
const CARRIER_MAG = 3e10;
const CARRIER_MAG_TXT = (CARRIER_MAG / 1e10) + '×10¹⁰';
const GROOVE_MAG = 1300;

// --- presentation ------------------------------------------------------------
const SWEEP = 0.0065;                           // simulated seconds per sweep
const W1K = DSP.TAU * 1000;

const S = {
  f: 1000, rec: 0, play: 0, sum: 0,
  vin: V_CART, vout: V_OUT, gain: G_STAGE_DB,
};

const sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
/** Frequency with its unit, never uppercased into nonsense. */
const hz = (f) => (f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : f.toFixed(2) + ' Hz');

// ---------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------

/** fadeTree() captures a mesh's opacity the first time it sees it — and the
 *  app's first call happens at reveal = 0. Seed the base so nothing dies. */
function seedFade(obj, base) {
  obj.traverse((c) => { if (c.material && !c.isLine2) c.userData._baseOp = base; });
  return obj;
}

function anchor(parent, x, y, z = 0) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Arc-length parameterised closed polyline. */
function loopPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const tmp = new THREE.Vector3();
  return {
    pts, total,
    at(s) {
      const d = ((s % total) + total) % total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const seg = Math.max(1e-9, cum[i] - cum[i - 1]);
      return tmp.copy(pts[i - 1]).lerp(pts[i], (d - cum[i - 1]) / seg);
    },
  };
}

function poly(pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => [pts[i].x, pts[i].y, pts[i].z]);
  return t;
}
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);

function flatMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** A solid measurement bar with end ticks — reads at any size. */
function bar(x0, x1, y, h, z, color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, h), flatMat(color, 0.92));
  m.position.set((x0 + x1) / 2, y, z);
  m.renderOrder = 11;
  g.add(m);
  for (const x of [x0, x1]) {
    g.add(poly([V3(x, y - h * 1.15, z + 0.0004), V3(x, y + h * 1.15, z + 0.0004)], color, 2.2));
  }
  return seedFade(g, 0.92);
}

// ---------------------------------------------------------------------------
// HARDWARE — rack bay 3
// ---------------------------------------------------------------------------
function buildHardware() {
  const M = mats();
  const R = LAYOUT.rack;
  const W = R.w - 0.03;          // 0.555
  const D = R.d - 0.06;          // 0.440
  const H = 0.078;
  const FOOT = 0.006;
  const FT = 0.018;              // a thick, properly machined fascia
  const fz = D / 2;

  const face = M.alu.clone();
  face.color.setHex(0xc4c7cd);
  face.roughness = 0.23;

  const g = new THREE.Group();
  g.position.set(R.x, LAYOUT.bayCentre(3, H) + FOOT, R.z);

  const box = GEO.chassis(W, H, D, {
    r: 0.0026, seg: 4, faceThick: FT, body: M.anodBlack, face,
  });
  g.add(box);

  // --- fascia -----------------------------------------------------------------
  // applied centre plate, standing 0.7 mm proud of the brushed panel
  const plate = new THREE.Mesh(GEO.bevelBox(0.214, 0.0495, 0.0035, 0.0009, 3), M.anodBlack);
  plate.position.set(0, 0, fz + 0.0012);
  g.add(plate);

  // chrome bezel around the plate — four hairline bars
  const bezH = GEO.bevelBox(0.2205, 0.0013, 0.0018, 0.0004, 2);
  const bezV = GEO.bevelBox(0.0013, 0.0521, 0.0018, 0.0004, 2);
  for (const sy of [1, -1]) {
    const b = new THREE.Mesh(bezH, M.chrome);
    b.position.set(0, sy * 0.0254, fz + 0.0026);
    g.add(b);
  }
  for (const sx of [1, -1]) {
    const b = new THREE.Mesh(bezV, M.chrome);
    b.position.set(sx * 0.1096, 0, fz + 0.0026);
    g.add(b);
  }

  // milled relief lines flanking the plate
  for (const sx of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(GEO.bevelBox(0.048, 0.0011, 0.0011, 0.0003, 2), M.anodBlack);
      l.position.set(sx * 0.083, (i - 1) * 0.0085, fz + 0.0004);
      g.add(l);
    }
  }

  // recessed indicator well: a darker anodised inset, not glass (glass here is
  // an opaque dielectric and would hide everything behind it)
  const well = M.anodBlack.clone();
  well.color.setHex(0x0d0f12);
  well.roughness = 0.30;
  const win = new THREE.Mesh(GEO.bevelBox(0.176, 0.0336, 0.0016, 0.0005, 2), well);
  win.position.set(0, 0, fz + 0.0026);
  g.add(win);

  // hairline backlit bar — kept small so bloom stays a glint, not a flare
  const glow = new THREE.Mesh(GEO.bevelBox(0.086, 0.0022, 0.0008, 0.0003, 2), M.meterGlow);
  glow.position.set(-0.030, 0.0095, fz + 0.0038);
  g.add(glow);

  // stepped cartridge-loading ladder: 8 segments, the first four lit
  const segGeo = GEO.bevelBox(0.0064, 0.0026, 0.0008, 0.0003, 2);
  const segDim = M.plastic.clone();
  segDim.color.setHex(0x1a2b33);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(segGeo, i < 4 ? M.meterGlow : segDim);
    s.position.set(-0.0555 + i * 0.0092, -0.0075, fz + 0.0038);
    g.add(s);
  }
  // MC / MM / mute indicators
  const ledGeo = GEO.bevelCyl(0.0016, 0.0018, 0.0014, 16, 0.0003);
  [[0.0455, M.ledCyan], [0.0455, null], [0.0640, M.ledAmber]]
    .forEach(([x, m], i) => {
      if (!m) return;
      const l = new THREE.Mesh(ledGeo, m);
      l.rotation.x = Math.PI / 2;
      l.position.set(x, i === 0 ? 0.0095 : -0.0075, fz + 0.0038);
      g.add(l);
    });

  // two machined stepped controls: MM/MC selector and cartridge loading
  function control(x, pointer) {
    const c = new THREE.Group();
    c.position.set(x, 0, fz);
    const r = 0.0163;
    const bez = new THREE.Mesh(GEO.bevelCyl(r + 0.0064, r + 0.0070, 0.0026, 44, 0.0007), M.anodBlack);
    bez.rotation.x = Math.PI / 2;
    bez.position.z = 0.0013;
    c.add(bez);
    const kg = new THREE.Group();
    kg.rotation.x = Math.PI / 2;
    kg.position.z = 0.0026 + 0.0136 / 2;
    const k = GEO.knob(r, 0.0136, { body: mats().alu, mark: M.chrome, flutes: 52 });
    k.rotation.y = pointer;
    kg.add(k);
    c.add(kg);
    // engraved index positions
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.00062, 8, 6), M.chrome, 5);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.5 + (i / 4 - 0.5) * Math.PI * 1.3;
      m4.makeTranslation(Math.cos(a) * (r + 0.0098), Math.sin(a) * (r + 0.0098), 0.0018);
      dots.setMatrixAt(i, m4);
    }
    c.add(dots);
    return c;
  }
  g.add(control(-0.178, Math.PI + 0.65));
  g.add(control(0.178, Math.PI - 0.33));

  GEO.screwRow(g, [
    [-0.2585, 0.0268], [-0.2585, -0.0268], [-0.2585, 0],
    [0.2585, 0.0268], [0.2585, -0.0268], [0.2585, 0],
  ], fz + 0.0005, 0.0019);

  // --- top and feet -----------------------------------------------------------
  const v = GEO.ventSlots(0.26, 0.22, 3, 11, { mat: M.plastic, sw: 0.0034, sd: 0.019 });
  v.position.set(0, H / 2 - 0.0017, -0.055);
  g.add(v);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const f = new THREE.Mesh(GEO.bevelCyl(0.0122, 0.0142, FOOT, 28, 0.0008), M.steel);
      f.position.set(sx * (W / 2 - 0.040), -H / 2 - FOOT / 2, sz * (D / 2 - 0.052));
      g.add(f);
    }
  }

  // --- rear panel -------------------------------------------------------------
  const rear = new THREE.Group();
  rear.position.z = -D / 2;
  rear.rotation.y = Math.PI;
  g.add(rear);

  [[-0.168, 0xd8dade], [-0.126, 0xd94b3a], [0.126, 0xd8dade], [0.168, 0xd94b3a]]
    .forEach(([x, col]) => {
      const j = GEO.rcaJack(col);
      j.position.set(x, -0.004, 0);
      rear.add(j);
    });

  // earth post — its own node, deliberately not a signal return
  const post = new THREE.Group();
  post.position.set(-0.072, -0.004, 0);
  const shaft = new THREE.Mesh(GEO.bevelCyl(0.0034, 0.0039, 0.015, 24, 0.0005), M.gold);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.0075;
  post.add(shaft);
  const nut = GEO.knob(0.0066, 0.0052, { body: M.gold, mark: M.gold, flutes: 26, dial: false });
  nut.rotation.x = Math.PI / 2; nut.position.z = 0.0105;
  post.add(nut);
  const pbase = new THREE.Mesh(GEO.bevelCyl(0.0052, 0.0058, 0.0032, 24, 0.0005), M.plastic);
  pbase.rotation.x = Math.PI / 2; pbase.position.z = 0.0016;
  post.add(pbase);
  rear.add(post);

  // outboard-supply umbilical: locking multi-pin socket
  const sock = new THREE.Group();
  sock.position.set(0.238, -0.002, 0);
  const shell = new THREE.Mesh(GEO.bevelCyl(0.0118, 0.0126, 0.0095, 32, 0.0008), M.steel);
  shell.rotation.x = Math.PI / 2; shell.position.z = 0.0048;
  sock.add(shell);
  const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.0092, 0.0092, 0.003, 28), M.plastic);
  ins.rotation.x = Math.PI / 2; ins.position.z = 0.0085;
  sock.add(ins);
  const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.005, 10), M.gold, 4);
  const mp = new THREE.Matrix4(), qp = new THREE.Quaternion(), sp = new THREE.Vector3(1, 1, 1);
  qp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    mp.compose(new THREE.Vector3(Math.cos(a) * 0.0044, Math.sin(a) * 0.0044, 0.0098), qp, sp);
    pins.setMatrixAt(i, mp);
  }
  sock.add(pins);
  rear.add(sock);

  const perf = GEO.perfGrid(0.085, 0.040, 0.0055, 0.0016, M.plastic);
  perf.position.set(0.055, -0.002, 0.0004);
  rear.add(perf);

  GEO.shadowed(g);
  g.add(GEO.contactShadow(W * 1.3, D * 1.3, 0.45, -H / 2 - FOOT + 0.0013));
  return g;
}

// ---------------------------------------------------------------------------
// OVERLAY
// ---------------------------------------------------------------------------
function buildOverlay(ctx) {
  const M = mats();
  const L = ctx.labels;
  const root = new THREE.Group();
  const R = {};
  const lab = {};

  // A single editorial column of three panels, coplanar, floating beside the
  // rack and in front of the monoblock so nothing occludes it.
  const CW = 0.470;                 // common card width
  const CX = 0.428, CZ = -2.660, CRY = 0.18;
  const column = (y, h) => {
    const g2 = new THREE.Group();
    g2.position.set(CX, y, CZ);
    g2.rotation.y = CRY;
    root.add(g2);
    const c = DIAG.diagramCard(CW, h, { opacity: 0.90, pad: 0.018 });
    c.userData.plate.userData._baseOp = 0.90;
    g2.add(c);
    return g2;
  };

  // ======================= 1. the RIAA plot ================================
  const GH = 0.300;
  const col = column(0.575, GH);

  const g = new DIAG.Graph({
    w: CW, h: GH, xLog: true, xRange: [20, 20000], yRange: [-25, 25],
    yTicks: [-20, -10, 0, 10, 20], zeroLine: 0,
  });
  col.add(g);
  R.graph = g;

  // The record curve rises at +6 dB/oct between f1…f2 and again above f3 —
  // those are the constant-groove-amplitude decades.
  for (const [fa, fb] of [[F1, F2], [F3, 20000]]) {
    const x0 = g.x(fa), x1 = g.x(fb);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, GH), flatMat(PAL.am, 0.014));
    m.position.set((x0 + x1) / 2, GH / 2, -0.0004);
    m.renderOrder = 5;
    m.userData._baseOp = 0.014;
    g.add(m);
  }

  for (const f of [F1, F2, F3]) g.addMarker(f, { color: PAL.ink3, width: 1.2, opacity: 0.5 });
  g.addMarker(1000, { color: PAL.ink3, width: 1.1, opacity: 0.28, dashed: true });

  g.addTrace((f) => DSP.riaaRecordDb(f), { color: PAL.am, width: 2.8, n: 420, z: 0.0006 });
  g.addTrace((f) => DSP.riaaPlaybackDb(f), { color: PAL.cy, width: 2.8, n: 420, z: 0.0008 });
  R.tSum = g.addTrace((f) => DSP.riaaRecordDb(f) + DSP.riaaPlaybackDb(f),
    { color: PAL.gr, width: 3.4, n: 420, z: 0.0014 });
  R.tSum.setProgress(0.001);

  for (const f of [F1, F2, F3]) {
    const d = g.addDot(PAL.ink, 0.0036);
    d.userData.setData(f, DSP.riaaPlaybackDb(f));
    d.userData._baseOp = 1;
  }

  R.cursor = g.addMarker(1000, { color: PAL.ink, width: 1.5, dashed: false, opacity: 0.45 });
  R.dotRec = g.addDot(PAL.am, 0.0052);
  R.dotPlay = g.addDot(PAL.cy, 0.0052);
  R.dotSum = g.addDot(PAL.gr, 0.0052);

  // Labels: two above the plot, one on the sum, three staggered beneath.
  // (`text` and `value` render on the SAME line in the stylesheet, so every
  //  label here is kicker + value — two lines, never three.)
  lab.play = L.add(anchor(g, g.x(20), GH), {
    kicker: 'Playback — de-emphasis', cls: 'acc',
    value: sgn(DSP.riaaPlaybackDb(20)) + ' dB at 20 Hz', offset: [78, -24],
  });
  lab.rec = L.add(anchor(g, g.x(20000), GH), {
    kicker: 'Record — pre-emphasis', cls: 'am',
    value: sgn(DSP.riaaRecordDb(20000)) + ' dB at 20 kHz', offset: [-74, -24],
  });
  lab.sum = L.add(anchor(g, g.x(20), g.y(0)), {
    kicker: 'Record + playback', value: '0.00 dB', offset: [70, -13],
  });

  const tTag = (f, us, kind, dy) => L.add(anchor(g, g.x(f), 0), {
    kicker: kind, value: us + ' µs · ' + hz(f), offset: [0, dy],
  });
  lab.t1 = tTag(F1, '3180', 'T1 pole', 24);
  lab.t2 = tTag(F2, '318', 'T2 zero', 58);
  lab.t3 = tTag(F3, '75', 'T3 pole', 24);

  // ======================= 2. groove excursion =============================
  const gvH = 0.156;
  const gv = column(0.300, gvH);

  const mid = CW / 2;
  const halfFlat = A_50_FLAT * GROOVE_MAG;      // 0.2387
  const halfRiaa = A_50_RIAA * GROOVE_MAG;      // 0.0339
  const halfPitch = (PITCH / 2) * GROOVE_MAG;   // 0.0968

  for (const sx of [-1, 1]) {
    gv.add(poly([V3(mid + sx * halfPitch, 0.018, 0.006), V3(mid + sx * halfPitch, 0.136, 0.006)],
      PAL.ink3, 1.3, { opacity: 0.5, dashed: true, dashSize: 0.006, gapSize: 0.005 }));
  }
  gv.add(bar(mid - halfFlat, mid + halfFlat, 0.114, 0.0105, 0.008, PAL.am));
  gv.add(bar(mid - halfRiaa, mid + halfRiaa, 0.072, 0.0105, 0.008, PAL.cy));
  gv.add(poly([V3(mid - halfPitch, 0.040, 0.008), V3(mid + halfPitch, 0.040, 0.008)],
    PAL.ink3, 1.6, { opacity: 0.7 }));

  lab.gvFlat = L.add(anchor(gv, mid, 0.114), {
    kicker: '50 Hz cut at constant velocity', cls: 'am',
    value: '±' + (A_50_FLAT * 1e6).toFixed(1) + ' µm peak', offset: [0, -20],
  });
  lab.gvRiaa = L.add(anchor(gv, mid + halfRiaa, 0.072), {
    kicker: 'with RIAA pre-emphasis', cls: 'acc',
    value: '±' + (A_50_RIAA * 1e6).toFixed(1) + ' µm · ÷' + A_RATIO.toFixed(2),
    offset: [100, 4],
  });
  lab.gvPitch = L.add(anchor(gv, mid, 0.040), {
    kicker: 'adjacent groove centres',
    value: (PITCH * 1e6).toFixed(0) + ' µm · shown ×' + GROOVE_MAG, offset: [0, 20],
  });

  // ======================= 3. the input loop ===============================
  const DW = 0.620, DH = 0.262;                 // design space
  const SC = CW / DW;                           // 0.903
  const inn = new THREE.Group();
  inn.position.set(CX, 1.000, CZ);
  inn.rotation.y = CRY;
  inn.scale.setScalar(SC);
  root.add(inn);

  const inCard = DIAG.diagramCard(DW, DH, { opacity: 0.92, pad: 0.020 });
  inCard.userData.plate.userData._baseOp = 0.92;
  inn.add(inCard);

  const board = new THREE.Mesh(GEO.bevelBox(0.400, 0.222, 0.0035, 0.0008, 2), M.pcb);
  board.position.set(0.400, 0.128, 0.0018);
  inn.add(board);
  for (const [x, y] of [[0.212, 0.028], [0.212, 0.228], [0.588, 0.028], [0.588, 0.228]]) {
    const s = GEO.screw(0.0014);
    s.position.set(x, y, 0.0042);
    inn.add(s);
  }

  const LZ = 0.010;                             // schematic plane

  // cartridge coil: four half-loops bulging left
  const coilPts = [];
  const NB = 4, NS = 12;
  for (let i = 0; i <= NB * NS; i++) {
    const u = i / (NB * NS);
    const a = ((u * NB) % 1) * Math.PI;
    coilPts.push(V3(0.055 - 0.0128 * Math.sin(a), 0.094 + 0.102 * u, LZ));
  }

  // closed input loop: coil → hot → input device → cold → coil
  const loopPts = coilPts.concat([
    V3(0.300, 0.196, LZ), V3(0.300, 0.094, LZ), V3(0.055, 0.094, LZ),
  ]);
  const closed = loopPts.concat([loopPts[0].clone()]);
  R.path = loopPath(closed);
  R.loop = poly(closed, PAL.cy, 3.0, { opacity: 1 });
  inn.add(R.loop);

  // cartridge body / arm — a separate node from the coil
  inn.add(poly([
    V3(0.026, 0.074, LZ), V3(0.088, 0.074, LZ), V3(0.088, 0.218, LZ),
    V3(0.026, 0.218, LZ), V3(0.026, 0.074, LZ),
  ], PAL.ink3, 1.2, { opacity: 0.5, dashed: true, dashSize: 0.007, gapSize: 0.005 }));

  // circulating current: hot one way, cold the other, always
  R.arrows = [];
  for (const [x, y, dir] of [[0.172, 0.196, 1], [0.172, 0.094, -1]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.0062, 0.0165, 14),
      new THREE.MeshBasicMaterial({ color: PAL.cy, toneMapped: false, transparent: true }));
    c.position.set(x, y, LZ + 0.001);
    c.userData._baseOp = 1;
    c.userData.dir = dir;
    inn.add(c);
    R.arrows.push(c);
  }

  // Carriers. They oscillate about a fixed point; they do not travel. The dim
  // ticks are each carrier's rest position, so the swing is visible as an
  // offset from a mark rather than as motion along the wire.
  R.NC = 18;
  const rest = new DIAG.Swarm(R.NC, { color: 0x8b96a4, size: 0.0026, additive: false });
  rest.position.z = 0.0012;
  rest.update((i) => {
    const p = R.path.at(((i + 0.5) * R.path.total) / R.NC);
    return { p: [p.x, p.y, p.z], s: 1, c: 0xffffff };
  });
  inn.add(rest);

  R.carriers = new DIAG.Swarm(R.NC, { color: PAL.cy, size: 0.0052, additive: true });
  R.carriers.position.z = 0.0016;
  inn.add(R.carriers);

  const resBody = (x, y, len, vert) => {
    const m = new THREE.Mesh(GEO.bevelCyl(0.0040, 0.0040, len, 20, 0.0006), M.anodGrey.clone());
    m.material.color.setHex(0x5d6672);
    m.rotation.z = vert ? 0 : Math.PI / 2;
    m.position.set(x, y, LZ - 0.001);
    return m;
  };
  inn.add(resBody(0.248, 0.145, 0.030, true));
  inn.add(poly([V3(0.248, 0.196, LZ), V3(0.248, 0.094, LZ)], PAL.cy, 1.6, { opacity: 0.55 }));

  // Four paralleled low-noise input devices, inside the loop. Drawn as unlit
  // can tops: a real metal cylinder seen end-on reflects only the dark room
  // and disappears, so this one element belongs to the diagram layer.
  const canGeo = new THREE.CircleGeometry(0.0084, 28);
  const canMat = new THREE.MeshBasicMaterial({
    color: 0xa8b0ba, toneMapped: false, transparent: true, opacity: 0.97,
  });
  const tabGeo = new THREE.CircleGeometry(0.0016, 12);
  const tabMat = new THREE.MeshBasicMaterial({
    color: 0x22282f, toneMapped: false, transparent: true, opacity: 0.9,
  });
  for (const [x, y] of [[0.281, 0.120], [0.319, 0.120], [0.281, 0.170], [0.319, 0.170]]) {
    const can = new THREE.Mesh(canGeo, canMat);
    can.position.set(x, y, LZ + 0.0016);
    can.renderOrder = 11;
    can.userData._baseOp = 0.97;
    inn.add(can);
    const tab = new THREE.Mesh(tabGeo, tabMat);
    tab.position.set(x + 0.0057, y + 0.0057, LZ + 0.0019);
    tab.renderOrder = 12;
    tab.userData._baseOp = 0.9;
    inn.add(tab);
  }
  inn.add(poly([
    V3(0.262, 0.098, LZ + 0.0012), V3(0.338, 0.098, LZ + 0.0012),
    V3(0.338, 0.192, LZ + 0.0012), V3(0.262, 0.192, LZ + 0.0012),
    V3(0.262, 0.098, LZ + 0.0012),
  ], 0xd8dee6, 1.1, { opacity: 0.45 }));

  // passive EQ ladder: three 0.1 % series resistors, two film capacitors
  inn.add(poly([
    V3(0.300, 0.145, LZ), V3(0.334, 0.145, LZ), V3(0.334, 0.196, LZ), V3(0.592, 0.196, LZ),
  ], PAL.cy, 1.8, { opacity: 0.6 }));
  for (const x of [0.372, 0.448, 0.524]) inn.add(resBody(x, 0.196, 0.026, false));
  for (const x of [0.410, 0.486]) {
    const cap = new THREE.Mesh(GEO.bevelBox(0.023, 0.044, 0.012, 0.0022, 2), M.plastic.clone());
    cap.material.color.setHex(0xc2bca8);
    cap.material.roughness = 0.55;
    cap.position.set(x, 0.144, LZ - 0.001);
    inn.add(cap);
    inn.add(poly([V3(x, 0.196, LZ), V3(x, 0.062, LZ)], PAL.cy, 1.4, { opacity: 0.5 }));
  }

  // signal ground rail — the return the EQ network and the output use
  inn.add(poly([V3(0.212, 0.062, LZ), V3(0.592, 0.062, LZ)], PAL.cy, 1.8, { opacity: 0.55 }));
  inn.add(poly([V3(0.212, 0.094, LZ), V3(0.212, 0.062, LZ)], PAL.cy, 1.6, { opacity: 0.55 }));

  // chassis / arm earth — a different node, tied to the rail at one point only
  inn.add(poly([
    V3(0.040, 0.074, LZ), V3(0.040, 0.026, LZ), V3(0.556, 0.026, LZ),
  ], PAL.am, 1.9, { opacity: 0.85, dashed: true, dashSize: 0.0085, gapSize: 0.006 }));
  inn.add(poly([V3(0.500, 0.026, LZ), V3(0.500, 0.062, LZ)], PAL.am, 1.6,
    { opacity: 0.85, dashed: true, dashSize: 0.005, gapSize: 0.004 }));
  for (let i = 0; i < 3; i++) {
    const w = 0.016 - i * 0.005;
    inn.add(poly([V3(0.556 - w, 0.019 - i * 0.005, LZ), V3(0.556 + w, 0.019 - i * 0.005, LZ)],
      PAL.am, 1.9, { opacity: 0.9 }));
  }
  const gpost = new THREE.Mesh(GEO.bevelCyl(0.0052, 0.0056, 0.008, 24, 0.0008), M.gold);
  gpost.rotation.x = Math.PI / 2;
  gpost.position.set(0.556, 0.026, LZ - 0.002);
  inn.add(gpost);

  lab.field = L.add(anchor(inn, 0.190, 0.196, LZ), {
    kicker: 'Field at 0.66 c',
    value: (C_FIELD / 1e8).toFixed(2) + '×10⁸ m/s · 1.2 m in ' + (T_TRANSIT * 1e9).toFixed(2) + ' ns',
    offset: [18, -26],
  });
  lab.earth = L.add(anchor(inn, 0.110, 0.0, LZ), {
    kicker: 'Chassis earth', cls: 'am',
    value: 'no signal current', offset: [0, 28],
  });
  lab.drift = L.add(anchor(inn, 0.440, 0.0, LZ), {
    kicker: 'Carriers oscillate, shown ' + CARRIER_MAG_TXT, cls: 'acc',
    value: '±' + (X_DRIFT * 1e12).toFixed(2) + ' pm · v̂ '
      + (V_DRIFT * 1e9).toFixed(2) + ' nm/s',
    offset: [0, 28],
  });

  R.lab = lab;
  return { overlay: root, R };
}

// ---------------------------------------------------------------------------
let R = null;

export default {
  id: 'phono',
  title: 'RIAA Equalisation',
  nav: 'Phono stage',
  kicker: 'Phono stage',
  standfirst: 'Two curves that are one function and its exact reciprocal.',
  shot: { position: [0.96, 1.07, -0.77], target: [0.52, 0.755, -2.85], fov: 34 },
  timeScale: 0.002,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildHardware();
    const built = buildOverlay(ctx);
    R = built.R;
    // DIAG.lineMaterial enables alphaToCoverage. The fat-line shader then takes
    // its alpha from edge coverage and ignores material.opacity, so a Trace
    // never fades and leaks into every other stage's shot. Opt this stage out;
    // SMAA still cleans up the edges.
    built.overlay.traverse((c) => {
      if (c.material && c.material.isLineMaterial) c.material.alphaToCoverage = false;
    });
    return { hardware, overlay: built.overlay };
  },

  /** Belt and braces: the app stops calling fadeTree once reveal snaps to 0. */
  setReveal(k) {
    if (this.overlay) this.overlay.visible = k > 0.004;
  },

  update(dt, t, ctx) {
    if (!R) return;

    // ---- frequency sweep, 20 Hz → 20 kHz -----------------------------------
    const ph = (((t / SWEEP) % 1) + 1) % 1;
    const f = 20 * Math.pow(1000, ph);
    S.f = f;
    S.rec = DSP.riaaRecordDb(f);
    S.play = DSP.riaaPlaybackDb(f);
    S.sum = S.rec + S.play;
    // A constant-velocity source cut with pre-emphasis presents the cartridge
    // output as the record curve; the stage hands back a level output.
    S.vin = V_CART * DSP.undB(S.rec);
    S.gain = G_STAGE_DB + S.play;
    S.vout = S.vin * DSP.undB(S.gain);

    R.cursor.userData.setX(f);
    R.dotRec.userData.setData(f, S.rec);
    R.dotPlay.userData.setData(f, S.play);
    R.dotSum.userData.setData(f, S.sum);
    R.tSum.setProgress(ph);

    // ---- the input loop at 1 kHz -------------------------------------------
    // i(t) = Î·cos ωt, so the carrier displacement is x(t) = (v̂/ω)·sin ωt.
    const c1 = Math.cos(W1K * t);
    const s1 = Math.sin(W1K * t);
    const disp = X_DRIFT * CARRIER_MAG * s1;
    const P = R.path, N = R.NC;
    R.carriers.update((i) => {
      const p = P.at(((i + 0.5) * P.total) / N + disp);
      // instanceColor defaults to black in Swarm, so it must always be set
      return { p: [p.x, p.y, p.z], s: 0.7 + 0.3 * Math.abs(c1), c: 0xffffff };
    });
    // Brightness follows |i|, and the whole loop lights together: 6.07 ns is
    // nothing against a 1 ms period, so this circuit is lumped.
    R.loop._baseOpacity = 0.26 + 0.74 * Math.abs(c1);
    for (const a of R.arrows) {
      const s = 0.28 + 0.72 * Math.abs(c1);
      a.scale.set(s, s, s);
      a.rotation.z = (c1 * a.userData.dir >= 0 ? -1 : 1) * (Math.PI / 2);
    }
  },

  content() {
    return `
<h3>Why the cut is not flat</h3>
<p>A moving-coil cartridge is a velocity transducer: its output follows how
fast the groove wall moves, not how far. Peak displacement is
<span class="num">a = v&#770;/&omega;</span>, so a constant-velocity cut lets
excursion grow as <span class="num">1/f</span>. At the
<span class="num">5 cm/s</span> reference the 1 kHz swing is
<span class="num">${(A_1K * 1e6).toFixed(2)} &micro;m</span>; at 50 Hz the same
velocity needs <span class="num">${(A_50_FLAT * 1e6).toFixed(1)} &micro;m</span>
against a <span class="num">${(PITCH * 1e6).toFixed(0)} &micro;m</span> average
pitch &mdash; the cutter would run through its neighbour. Constant velocity at
the top of the band buries the treble in surface noise instead.</p>

<div class="eq">H(s) = (1 + sT&#8322;) / (1 + sT&#8321;)(1 + sT&#8323;)  <span class="c">playback</span>
T&#8321;  3180 &micro;s   pole  <span class="hl">${F1.toFixed(2)} Hz</span>
T&#8322;   318 &micro;s   zero  <span class="hl">${F2.toFixed(2)} Hz</span>
T&#8323;    75 &micro;s   pole  <span class="hl">${F3.toFixed(2)} Hz</span></div>

<p>The corners split the record curve into four asymptotes: constant velocity
below <span class="num">${F1.toFixed(1)} Hz</span>, <b>+6 dB/octave</b> to
<span class="num">${F2.toFixed(1)} Hz</span>, flat to
<span class="num">${(F3 / 1000).toFixed(2)} kHz</span>, then +6 dB/octave again.
A 6 dB/octave rise in <em>velocity</em> is constant <em>amplitude</em> &mdash;
the shaded decades are where the groove stops getting wider. At 50 Hz that is
<span class="num">${Math.abs(REC_50).toFixed(2)} dB</span>, a factor
<span class="num">${A_RATIO.toFixed(2)}</span>:
<span class="num">${(A_50_FLAT * 1e6).toFixed(1)}</span> becomes
<span class="num">${(A_50_RIAA * 1e6).toFixed(1)} &micro;m</span>.</p>

<h3>Gain and noise budget</h3>
<div class="eq">cartridge  0.300 mV rms <span class="c">(5 cm/s pk, 1 kHz)</span>
line level 2.000 V rms
20&middot;log&#8321;&#8320;(2/0.0003)  = <span class="hl">${G_TOTAL_DB.toFixed(2)} dB</span>
this stage, 1 kHz     = ${G_STAGE_DB.toFixed(2)} dB &rarr; ${V_OUT.toFixed(3)} V
line stage remainder  = ${G_REST_DB.toFixed(2)} dB (&times;${DSP.undB(G_REST_DB).toFixed(2)})
<span class="c">passive network, 1 kHz vs its LF gain</span>
20&middot;log&#8321;&#8320;|H(1k)|      = <span class="hl">${NET_LOSS_1K.toFixed(2)} dB</span>
<span class="c">so the amplifiers must make</span> ${AMP_RAW_DB.toFixed(2)} dB</div>

<div class="eq">e&#8345; 1.00 nV/&radic;Hz &oplus; &radic;(4kTR), R=10 &Omega; = ${(EN_R * 1e9).toFixed(2)}
                    = ${(EN_TOT * 1e9).toFixed(2)} nV/&radic;Hz
RIAA-weighted noise BW  = ${(ENB / 1000).toFixed(2)} kHz
                    &rarr; ${(V_NOISE * 1e9).toFixed(0)} nV rms
S/N vs 0.300 mV     = <span class="hl">${SNR_DB.toFixed(1)} dB</span></div>

<p>Four paralleled input devices reach that
<span class="num">1 nV/&radic;Hz</span> &mdash; uncorrelated noise falls as
<span class="num">&radic;n</span>. The figure is unweighted,
20 Hz&ndash;20 kHz, and beats a flat 20 kHz sum because playback discards more
treble noise than the bass lift adds. On most pressings the surface noise sets
the floor, not the electronics.</p>

<div class="key"><span class="lab">The idea</span><p>Pre-emphasis is not a tone
control. It trades bass excursion against treble noise and hands the exact
reciprocal to playback. The green trace is summed point by point from the other
two and is identically <span class="num">0.00 dB</span>; the only real error is
tolerance, about <span class="num">&plusmn;${TOL_DB.toFixed(2)} dB</span> with
0.1&nbsp;% resistors and 1&nbsp;% film capacitors.</p></div>

<div class="myth"><span class="lab">Commonly got wrong</span><p>The earth wire
is not the signal return. Each coil has two terminals and its own screened
pair: what leaves on the hot comes back on the cold. The earth post exists
because the arm tube, bearing and platter are a <em>different</em> node, tied to
signal ground at one point only. Carriers in that loop drift at
<span class="num">${(V_DRIFT * 1e9).toFixed(2)} nm/s</span> peak; on a 1 kHz
signal they oscillate
<span class="num">&plusmn;${(X_DRIFT * 1e12).toFixed(2)} pm</span>,
<span class="num">1/${Math.round(CU_SPACING / X_DRIFT)}</span> of a copper atom
spacing. The field does the work at
<span class="num">${(C_FIELD / 1e8).toFixed(2)}&times;10&#8312; m/s</span>: in
half a cycle it covers
<span class="num">${(FIELD_PER_HALF / 1000).toFixed(0)} km</span> while a
carrier moves <span class="num">${(2 * X_DRIFT * 1e12).toFixed(2)} pm</span> and
returns &mdash; a ratio of
<span class="num">${SPEED_RATIO.toExponential(1).replace('e+', '&times;10')}</span>.</p></div>
`;
  },

  readouts() {
    return [
      {
        k: 'SWEEP', u: 'Hz', cls: 'acc', bar: Math.log10(S.f / 20) / 3,
        v: S.f < 1000 ? S.f.toFixed(1) : String(Math.round(S.f)),
      },
      { k: 'RECORD EQ', v: sgn(S.rec), u: 'dB', cls: 'am' },
      { k: 'PLAYBACK EQ', v: sgn(S.play), u: 'dB', cls: 'acc' },
      { k: 'SUM', v: sgn(S.sum), u: 'dB', cls: '' },
      { k: 'GAIN', v: S.gain.toFixed(2), u: 'dB', cls: 'am', bar: S.gain / 90 },
      {
        k: 'IN → OUT',
        v: (S.vin * 1e3).toPrecision(3) + ' → ' + (S.vout * 1e3).toFixed(0),
        u: 'mV rms', cls: 'acc',
      },
    ];
  },
};
