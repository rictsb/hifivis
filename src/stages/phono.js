import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
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
// The cartridge is a 10 Ω source loaded by 100 Ω, so the amplifier input sees
// a divided signal and a 9.09 Ω source resistance. Both matter below.
const V_CART = 0.30e-3;                         // V rms, MC open-circuit at 5 cm/s
const R_CART = 10;                              // Ω, MC coil resistance
const Z_LOAD = 100;                             // Ω, MC loading
const LOAD_DB = DSP.dB(Z_LOAD / (Z_LOAD + R_CART));   // −0.828 dB
const V_IN = V_CART * DSP.undB(LOAD_DB);        // 0.27273 mV rms at the input
const V_LINE = 2.0;                             // V rms, full line level
const G_TOTAL_DB = DSP.dB(V_LINE / V_IN);       // 77.306 dB
const G_STAGE_DB = 64.0;                        // this unit's specification
const V_OUT = V_IN * DSP.undB(G_STAGE_DB);      // 0.4322 V rms
const G_REST_DB = G_TOTAL_DB - G_STAGE_DB;      // 13.306 dB left for the line stage
// A *passive* RIAA network is unity at DC and lossy in the midband:
const NET_LOSS_1K = DSP.dB(DSP.cAbs(DSP.riaaRaw(1000)));   // −19.911 dB
const AMP_RAW_DB = G_STAGE_DB - NET_LOSS_1K;    // 83.911 dB of raw amplification

// --- noise -------------------------------------------------------------------
const K_B = 1.380649e-23, T_K = 293.15;         // 20 °C
const R_SRC = (R_CART * Z_LOAD) / (R_CART + Z_LOAD);  // 9.091 Ω seen by the input
const EN_DEV = 1.0e-9;                          // V/√Hz, input device
const EN_R = Math.sqrt(4 * K_B * T_K * R_SRC);  // 0.3836 nV/√Hz Johnson
const EN_TOT = Math.hypot(EN_DEV, EN_R);        // 1.0711 nV/√Hz
// The noise is shaped by the playback curve too, so the honest bandwidth is
// ∫|H(f)/H(1k)|² df over 20 Hz–20 kHz, not a flat 20 kHz.
const ENB = (() => {
  const a = Math.log(20), b = Math.log(20000), n = 4000;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const f = Math.exp(a + ((b - a) * (i + 0.5)) / n);
    const p = DSP.undB(DSP.riaaPlaybackDb(f));
    s += p * p * f * ((b - a) / n);
  }
  return s;                                     // 8630 Hz
})();
const V_NOISE = EN_TOT * Math.sqrt(ENB);        // 99.5 nV rms
const SNR_DB = DSP.dB(V_IN / V_NOISE);          // 68.8 dB

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

// --- the input loop: carriers vs field (quoted in prose, not drawn) ----------
const I_RMS = V_CART / (Z_LOAD + R_CART);       // 2.727 µA
const I_PK = I_RMS * Math.SQRT2;                // 3.857 µA
const WIRE_MM2 = 0.05;                          // mm², tonearm litz
const V_DRIFT = DSP.driftVelocity(I_PK, WIRE_MM2);        // 5.669 nm/s
const X_DRIFT = DSP.driftDisplacement(V_DRIFT, 1000);     // 0.902 pm
const C_FIELD = DSP.signalSpeed(0.66);          // 1.979e8 m/s
const CYCLE_1K = 1 / 1000;                      // s
const FIELD_PER_HALF = (C_FIELD * CYCLE_1K) / 2;// 98.9 km
const SPEED_RATIO = C_FIELD / V_DRIFT;          // 3.49e16
const CU_SPACING = 255.6e-12;                   // m, fcc Cu nearest neighbour a/√2

/** Unicode superscript exponent — `toExponential().replace()` prints "3.5×1016". */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup10 = (v, digits = 1) => {
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return m.toFixed(digits) + ' × 10' + [...String(e)].map((c) => SUP[c]).join('');
};

// --- presentation ------------------------------------------------------------
// The sweep is a real swept-sine measurement, so it runs in real time: no
// magnification factor is claimed anywhere on this stage.
const SWEEP = 3.4;                              // seconds per 20 Hz → 20 kHz sweep
const GROOVE_MAG = 1000;                        // the excursion strip, stated on screen

const S = {
  f: 1000, rec: 0, play: 0, sum: 0,
  vin: V_IN, vout: V_OUT, gain: G_STAGE_DB,
};

const sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

// ---------------------------------------------------------------------------
// FRAMING
//
// The clear stage is 960 × 840 of a 1600 × 1000 canvas. Rather than guess, the
// card is positioned in normalised device coordinates through place(), so its
// screen extent is known before anything is rendered: it lands between NDC
// x −0.08 and +0.53, which is screen x 736…1092 — clear of the chapter rail at
// 160 and of the panel at 1120.
// ---------------------------------------------------------------------------
const CH_H = 0.112, CH_FOOT = 0.008;
const HERO_Y = LAYOUT.bayCentre(3, CH_H) + CH_FOOT;         // 0.678
const HERO_Z = LAYOUT.rack.z + (LAYOUT.rack.d - 0.06) / 2;  // fascia plane, −3.08
const HERO_R = 0.354;                           // bounding radius of the chassis
const AZ = 0.44, EL = 0.075, FOV = 30;

const RIGHT_W = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
const OFF = 0.335;                              // slide the frame right of the hero
const _base = frameShot([0, HERO_Y, HERO_Z], HERO_R, { fill: 0.55, az: AZ, el: EL, fov: FOV });
const SHOT = {
  position: [_base.position[0] + RIGHT_W.x * OFF, _base.position[1], _base.position[2] + RIGHT_W.z * OFF],
  target: [RIGHT_W.x * OFF, HERO_Y, HERO_Z + RIGHT_W.z * OFF],
  fov: FOV,
};

const CAM = new THREE.Vector3(...SHOT.position);
const FWD = new THREE.Vector3(...SHOT.target).sub(CAM).normalize();
const RGT = new THREE.Vector3().crossVectors(FWD, new THREE.Vector3(0, 1, 0)).normalize();
const UPV = new THREE.Vector3().crossVectors(RGT, FWD).normalize();
const ASPECT = 1.6, TANH = Math.tan((FOV * Math.PI) / 360);

/** World point that projects to (ndcX, ndcY) at `dist` metres down the axis. */
function place(ndcX, ndcY, dist) {
  return CAM.clone()
    .addScaledVector(FWD, dist)
    .addScaledVector(RGT, ndcX * ASPECT * TANH * dist)
    .addScaledVector(UPV, ndcY * TANH * dist);
}

// ---------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------
function anchor(parent, x, y, z = 0) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
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
    g.add(poly([V3(x, y - h * 1.5, z + 0.0004), V3(x, y + h * 1.5, z + 0.0004)], color, 2.2));
  }
  return g;
}

// ---------------------------------------------------------------------------
// HARDWARE — rack bay 3
// ---------------------------------------------------------------------------
function buildHardware() {
  const M = mats();
  const R = LAYOUT.rack;
  const W = R.w - 0.03;          // 0.555
  const D = R.d - 0.06;          // 0.440
  const H = CH_H;                // 0.112 — bay 3 allows 0.160
  const FOOT = CH_FOOT;
  const FT = 0.020;              // a thick, properly machined fascia
  const fz = D / 2;

  const face = M.alu.clone();
  face.color.setHex(0xc6c9cf);
  face.roughness = 0.22;

  const g = new THREE.Group();
  g.position.set(R.x, HERO_Y, R.z);

  g.add(GEO.chassis(W, H, D, { r: 0.0028, seg: 4, faceThick: FT, body: M.anodBlack, face }));

  // --- fascia -----------------------------------------------------------------
  // applied centre plate, standing 1.2 mm proud of the brushed panel
  const plate = new THREE.Mesh(GEO.bevelBox(0.262, 0.072, 0.0040, 0.0011, 3), M.anodBlack);
  plate.position.set(0, 0, fz + 0.0014);
  g.add(plate);

  // chrome bezel around the plate — four hairline bars
  const bezH = GEO.bevelBox(0.2695, 0.0015, 0.0020, 0.0004, 2);
  const bezV = GEO.bevelBox(0.0015, 0.0750, 0.0020, 0.0004, 2);
  for (const sy of [1, -1]) {
    const b = new THREE.Mesh(bezH, M.chrome);
    b.position.set(0, sy * 0.0368, fz + 0.0031);
    g.add(b);
  }
  for (const sx of [1, -1]) {
    const b = new THREE.Mesh(bezV, M.chrome);
    b.position.set(sx * 0.1340, 0, fz + 0.0031);
    g.add(b);
  }

  // full-width chrome inlay along the bottom of the fascia — a light-catcher
  const inlay = new THREE.Mesh(GEO.bevelBox(0.508, 0.0024, 0.0018, 0.0005, 2), M.chrome);
  inlay.position.set(0, -0.0455, fz + 0.0010);
  g.add(inlay);

  // milled relief lines flanking the plate
  for (const sx of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(GEO.bevelBox(0.052, 0.0012, 0.0012, 0.0003, 2), M.anodBlack);
      l.position.set(sx * 0.0975, (i - 1.5) * 0.0105, fz + 0.0004);
      g.add(l);
    }
  }

  // recessed indicator well: a darker anodised inset, not glass (glass here is
  // an opaque dielectric and would hide everything behind it)
  const well = M.anodBlack.clone();
  well.color.setHex(0x0c0e11);
  well.roughness = 0.30;
  const win = new THREE.Mesh(GEO.bevelBox(0.212, 0.0500, 0.0018, 0.0005, 2), well);
  win.position.set(0, 0, fz + 0.0031);
  g.add(win);

  // hairline backlit bar — kept small so bloom stays a glint, not a flare
  const glow = new THREE.Mesh(GEO.bevelBox(0.100, 0.0026, 0.0009, 0.0003, 2), M.meterGlow);
  glow.position.set(-0.046, 0.0140, fz + 0.0044);
  g.add(glow);

  // stepped cartridge-loading ladder: 8 segments, the first four lit
  const segGeo = GEO.bevelBox(0.0076, 0.0030, 0.0009, 0.0003, 2);
  const segDim = M.plastic.clone();
  segDim.color.setHex(0x18272e);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(segGeo, i < 4 ? M.meterGlow : segDim);
    s.position.set(-0.0930 + i * 0.0110, -0.0125, fz + 0.0044);
    g.add(s);
  }
  // MC and mute indicators
  const ledGeo = GEO.bevelCyl(0.0018, 0.0020, 0.0015, 16, 0.0003);
  for (const [x, y, m] of [[0.0720, 0.0140, M.ledCyan], [0.0940, -0.0125, M.ledAmber]]) {
    const l = new THREE.Mesh(ledGeo, m);
    l.rotation.x = Math.PI / 2;
    l.position.set(x, y, fz + 0.0044);
    g.add(l);
  }

  // two machined stepped controls: MM/MC selector and cartridge loading
  function control(x, pointer) {
    const c = new THREE.Group();
    c.position.set(x, 0, fz);
    const r = 0.0205;
    const bez = new THREE.Mesh(GEO.bevelCyl(r + 0.0068, r + 0.0075, 0.0030, 48, 0.0008), M.anodBlack);
    bez.rotation.x = Math.PI / 2;
    bez.position.z = 0.0015;
    c.add(bez);
    const kg = new THREE.Group();
    kg.rotation.x = Math.PI / 2;
    kg.position.z = 0.0030 + 0.0160 / 2;
    const k = GEO.knob(r, 0.0160, { body: mats().alu, mark: M.chrome, flutes: 60 });
    k.rotation.y = pointer;
    kg.add(k);
    c.add(kg);
    // engraved index positions
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.00068, 8, 6), M.chrome, 5);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.5 + (i / 4 - 0.5) * Math.PI * 1.3;
      m4.makeTranslation(Math.cos(a) * (r + 0.0105), Math.sin(a) * (r + 0.0105), 0.0020);
      dots.setMatrixAt(i, m4);
    }
    c.add(dots);
    return c;
  }
  g.add(control(-0.196, Math.PI + 0.65));
  g.add(control(0.196, Math.PI - 0.33));

  GEO.screwRow(g, [
    [-0.2590, 0.0400], [-0.2590, -0.0400], [-0.2590, 0],
    [0.2590, 0.0400], [0.2590, -0.0400], [0.2590, 0],
  ], fz + 0.0006, 0.0021);

  // --- top and feet -----------------------------------------------------------
  const v = GEO.ventSlots(0.28, 0.22, 3, 12, { mat: M.plastic, sw: 0.0034, sd: 0.019 });
  v.position.set(0, H / 2 - 0.0017, -0.060);
  g.add(v);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const f = new THREE.Mesh(GEO.bevelCyl(0.0130, 0.0152, FOOT, 28, 0.0009), M.steel);
      f.position.set(sx * (W / 2 - 0.042), -H / 2 - FOOT / 2, sz * (D / 2 - 0.054));
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
  g.add(GEO.contactShadow(W * 1.25, D * 1.25, 0.45, -H / 2 - FOOT + 0.0013));
  return g;
}

// ---------------------------------------------------------------------------
// OVERLAY — one card, two plot regions, six labels
// ---------------------------------------------------------------------------
function buildOverlay(ctx) {
  const L = ctx.labels;
  const root = new THREE.Group();
  const R = {};

  // --- the stage key ----------------------------------------------------------
  // A soft frontal source aimed only at bay 3, so the hero separates from the
  // five identical boxes around it. Lives in the overlay, so it exists only
  // while this chapter is on screen (see setReveal).
  const key = new THREE.SpotLight(0xfff3e4, 0, 2.6, 0.34, 0.92, 1.6);
  key.position.set(0.22, HERO_Y + 0.42, HERO_Z + 0.80);
  key.castShadow = false;
  key.target.position.set(0, HERO_Y, HERO_Z);
  root.add(key, key.target);
  R.key = key;

  // --- one card, floating clear of the rack -----------------------------------
  const CW = 0.380, CH = 0.482, PAD = 0.020;
  const CARD_DIST = 2.20;
  const PX = 0.002 * TANH * CARD_DIST;          // metres per screen pixel on the card
  const holder = new THREE.Group();
  holder.position.copy(place(0.318, 0.050, CARD_DIST));
  holder.lookAt(CAM);
  root.add(holder);

  const card = new THREE.Group();
  card.position.set(-CW / 2, -CH / 2, 0);
  holder.add(card);

  const plate = DIAG.diagramCard(CW, CH, { opacity: 0.90, pad: PAD });
  // fadeTree captures a mesh's opacity the first time it sees it, and the app's
  // first call happens at reveal 0 — seed the plate or it never comes back.
  plate.userData.plate.userData._baseOp = 0.90;
  card.add(plate);

  // ======================= 1. the RIAA curves ==============================
  const GH = 0.290, GY = CH - GH;
  const g = new DIAG.Graph({
    w: CW, h: GH, xLog: true, xRange: [20, 20000], yRange: [-25, 25],
    yTicks: [-20, -10, 0, 10, 20], zeroLine: 0,
  });
  g.position.set(0, GY, 0);
  card.add(g);
  R.graph = g;

  // The record curve rises at +6 dB/oct between f1…f2 and again above f3 —
  // those are the constant-groove-amplitude decades.
  for (const [fa, fb] of [[F1, F2], [F3, 20000]]) {
    const x0 = g.x(fa), x1 = g.x(fb);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, GH), flatMat(PAL.am, 0.013));
    m.position.set((x0 + x1) / 2, GH / 2, -0.0004);
    m.renderOrder = 5;
    g.add(m);
  }

  for (const f of [F1, F2, F3]) g.addMarker(f, { color: PAL.ink3, width: 1.2, opacity: 0.55 });

  g.addTrace((f) => DSP.riaaRecordDb(f), { color: PAL.am, width: 2.8, n: 420, z: 0.0006 });
  g.addTrace((f) => DSP.riaaPlaybackDb(f), { color: PAL.cy, width: 2.8, n: 420, z: 0.0008 });
  R.tSum = g.addTrace((f) => DSP.riaaRecordDb(f) + DSP.riaaPlaybackDb(f),
    { color: PAL.gr, width: 3.4, n: 420, z: 0.0014 });
  R.tSum.setProgress(0.001);

  for (const f of [F1, F2, F3]) {
    const d = g.addDot(PAL.ink, 0.0034);
    d.userData.setData(f, DSP.riaaPlaybackDb(f));
  }

  R.cursor = g.addMarker(1000, { color: PAL.ink, width: 1.5, dashed: false, opacity: 0.45 });
  R.dotRec = g.addDot(PAL.am, 0.0052);
  R.dotPlay = g.addDot(PAL.cy, 0.0052);
  R.dotSum = g.addDot(PAL.gr, 0.0052);

  // ======================= 2. groove excursion =============================
  // Same 50 Hz, same 5 cm/s, with and without pre-emphasis, drawn at ×1000
  // against the average groove pitch.
  const mid = CW / 2;
  const halfFlat = A_50_FLAT * GROOVE_MAG;      // 0.1592
  const halfRiaa = A_50_RIAA * GROOVE_MAG;      // 0.0226
  const halfPitch = (PITCH / 2) * GROOVE_MAG;   // 0.0645

  for (const sx of [-1, 1]) {
    card.add(poly([V3(mid + sx * halfPitch, 0.006, 0.006), V3(mid + sx * halfPitch, 0.086, 0.006)],
      PAL.ink3, 1.3, { opacity: 0.55, dashed: true, dashSize: 0.006, gapSize: 0.005 }));
  }
  card.add(poly([V3(mid - halfPitch, 0.010, 0.006), V3(mid + halfPitch, 0.010, 0.006)],
    PAL.ink3, 1.4, { opacity: 0.55 }));
  card.add(bar(mid - halfFlat, mid + halfFlat, 0.062, 0.0090, 0.008, PAL.am));
  card.add(bar(mid - halfRiaa, mid + halfRiaa, 0.032, 0.0090, 0.008, PAL.cy));

  // ======================= labels ==========================================
  const lab = {};

  lab.hero = L.add(new THREE.Vector3(0.12, HERO_Y + 0.030, HERO_Z), {
    kicker: 'Moving-coil phono stage · 100 Ω',
    value: G_STAGE_DB.toFixed(2) + ' dB at 1 kHz',
    offset: [0, -34], priority: 6,
  });

  lab.play = L.add(anchor(g, g.x(20), g.y(DSP.riaaPlaybackDb(20))), {
    kicker: 'Playback — de-emphasis', cls: 'acc', occlude: false, priority: 4,
    value: sgn(DSP.riaaPlaybackDb(20)) + ' dB at 20 Hz', offset: [94, -15],
  });
  lab.sum = L.add(anchor(g, g.x(20), g.y(0)), {
    kicker: 'Record + playback', occlude: false, priority: 5,
    value: '0.00 dB', offset: [76, -14],
  });
  lab.rec = L.add(anchor(g, g.x(20), g.y(DSP.riaaRecordDb(20))), {
    kicker: 'Record — pre-emphasis', cls: 'am', occlude: false, priority: 4,
    value: sgn(DSP.riaaRecordDb(20)) + ' dB at 20 Hz', offset: [94, 16],
  });
  lab.corner = L.add(anchor(g, g.x(F2), 0), {
    kicker: 'T₁ 3180 · T₂ 318 · T₃ 75 µs', occlude: false, priority: 2,
    value: F1.toFixed(2) + ' · ' + F2.toFixed(2) + ' · ' + F3.toFixed(0) + ' Hz',
    offset: [0, 42],
  });
  lab.exc = L.add(anchor(card, mid, 0.010), {
    kicker: '50 Hz at 5 cm/s, shown ×' + GROOVE_MAG, cls: 'acc', occlude: false, priority: 3,
    text: 'grey: adjacent groove centres, '
      + (PITCH * 1e6).toFixed(0) + ' µm',
    value: '±' + (A_50_FLAT * 1e6).toFixed(1) + ' → ±' + (A_50_RIAA * 1e6).toFixed(1)
      + ' µm · ÷' + A_RATIO.toFixed(2),
    offset: [0, 40],
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
  shot: SHOT,
  timeScale: 1,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildHardware();
    const built = buildOverlay(ctx);
    R = built.R;
    return { hardware, overlay: built.overlay };
  },

  /** The stage key belongs to this chapter only. */
  setReveal(k) {
    if (R && R.key) R.key.intensity = 0 * k;
  },

  update(dt, t) {
    if (!R) return;

    // ---- swept sine, 20 Hz → 20 kHz in 3.4 s, in real time -----------------
    const ph = (((t / SWEEP) % 1) + 1) % 1;
    const f = 20 * Math.pow(1000, ph);
    S.f = f;
    S.rec = DSP.riaaRecordDb(f);
    S.play = DSP.riaaPlaybackDb(f);
    S.sum = S.rec + S.play;
    // A constant-velocity source cut with pre-emphasis presents the cartridge
    // output as the record curve; the stage hands back a level output.
    S.vin = V_IN * DSP.undB(S.rec);
    S.gain = G_STAGE_DB + S.play;
    S.vout = S.vin * DSP.undB(S.gain);

    R.cursor.userData.setX(f);
    R.dotRec.userData.setData(f, S.rec);
    R.dotPlay.userData.setData(f, S.play);
    R.dotSum.userData.setData(f, S.sum);
    R.tSum.setProgress(ph);
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
pitch, and the cutter crosses into its neighbour.</p>

<div class="key"><span class="lab">The idea</span><p>Pre-emphasis is not a tone
control. It trades bass excursion against treble noise and hands playback the
exact reciprocal. The green trace is summed point by point from the other two
and is <span class="num">0.00 dB</span> across the band; the only real error is
tolerance, about <span class="num">&plusmn;${TOL_DB.toFixed(2)} dB</span> with
0.1&nbsp;% resistors and 1&nbsp;% film capacitors.</p></div>

<div class="eq">H(s) = (1+sT&#8322;) / (1+sT&#8321;)(1+sT&#8323;)  <span class="c">playback</span>
T&#8321;  3180 &micro;s  pole  <span class="hl">${F1.toFixed(2)} Hz</span>
T&#8322;   318 &micro;s  zero  <span class="hl">${F2.toFixed(2)} Hz</span>
T&#8323;    75 &micro;s  pole  <span class="hl">${F3.toFixed(2)} Hz</span></div>

<p>The corners split the record curve into four asymptotes: constant velocity
below <span class="num">${F1.toFixed(1)} Hz</span>, <b>+6 dB/octave</b> to
<span class="num">${F2.toFixed(1)} Hz</span>, flat to
<span class="num">${(F3 / 1000).toFixed(2)} kHz</span>, then +6 dB/octave again.
A 6 dB/octave rise in <em>velocity</em> is constant <em>amplitude</em> &mdash;
the shaded decades are where the groove stops getting wider. At 50 Hz that is
<span class="num">${Math.abs(REC_50).toFixed(2)} dB</span>, a factor
<span class="num">${A_RATIO.toFixed(2)}</span>.</p>

<h3>Gain and noise budget</h3>
<div class="eq">0.300 mV  <span class="c">cartridge, 5 cm/s at 1 kHz</span>
${LOAD_DB.toFixed(2)} dB  <span class="c">100 &Omega; load on a 10 &Omega; coil</span>
${(V_IN * 1e3).toFixed(3)} mV  <span class="c">at the input</span>
2.000 V   <span class="c">line level &rarr;</span> <span class="hl">${G_TOTAL_DB.toFixed(2)} dB</span>
${G_STAGE_DB.toFixed(2)} dB  <span class="c">this stage &rarr;</span> ${V_OUT.toFixed(3)} V rms
${G_REST_DB.toFixed(2)} dB  <span class="c">left for the line stage</span>
<span class="c">passive network at 1 kHz</span> ${NET_LOSS_1K.toFixed(2)} dB
<span class="c">so the amplifiers make</span> ${AMP_RAW_DB.toFixed(2)} dB</div>

<div class="eq">e&#8345; 1.00 &oplus; &radic;(4kT&middot;${R_SRC.toFixed(2)} &Omega;) = ${(EN_R * 1e9).toFixed(2)}
       = ${(EN_TOT * 1e9).toFixed(2)} nV/&radic;Hz
RIAA-weighted noise BW ${(ENB / 1000).toFixed(2)} kHz
       &rarr; ${(V_NOISE * 1e9).toFixed(1)} nV rms
S/N re ${(V_IN * 1e6).toFixed(0)} &micro;V = <span class="hl">${SNR_DB.toFixed(1)} dB</span></div>

<p>Four paralleled input devices reach that
<span class="num">1 nV/&radic;Hz</span>; uncorrelated noise falls as
<span class="num">&radic;n</span>. The bandwidth is the playback curve's own
noise integral, not a flat 20 kHz, because de-emphasis discards more treble
noise than the bass lift adds. Unweighted. On most pressings surface noise sets
the floor.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>The earth wire
is not the signal return. The coil has two terminals and its own screened pair:
what leaves on the hot comes back on the cold. The earth post exists because the
arm tube, bearing and platter are a <em>different</em> node, tied to signal
ground at a single point. Carriers in that loop oscillate
<span class="num">&plusmn;${(X_DRIFT * 1e12).toFixed(2)} pm</span> at 1 kHz,
<span class="num">1/${Math.round(CU_SPACING / X_DRIFT)}</span> of a copper atom
spacing, while the field covers
<span class="num">${(FIELD_PER_HALF / 1000).toFixed(0)} km</span> in half a
cycle &mdash; a ratio of
<span class="num">${sup10(SPEED_RATIO)}</span>.</p></div>
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
        v: (S.vin * 1e3).toFixed(3) + ' → ' + (S.vout * 1e3).toFixed(0),
        u: 'mV rms', cls: 'acc',
      },
    ];
  },
};
