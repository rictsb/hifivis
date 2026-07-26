import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   BASS & THE ROOM
   ---------------------------------------------------------------------------
   Every number is derived here, at module scope, from LAYOUT and DSP.
   content() and readouts() read the same constants the geometry does, so the
   prose cannot drift from the picture.

   Room model — rigid-walled rectangular modal expansion:
     p(r,ω) = jωρ₀c²Q · Σₙ Ψₙ(rs)·Ψₙ(r) / [Kₙ·(ωₙ² − ω² − 2jδω)]
     Ψₙ = cos(pπx/W)·cos(qπz/D)·cos(rπy/H),  Kₙ = V / 2^(non-zero indices)
     δ  = 3·ln10/RT60   (amplitude decay giving 60 dB in RT60)
   The (0,0,0) term is kept: it is the uniform pressurisation that dominates
   below the first axial resonance.
   =========================================================================== */

const C = DSP.C_SOUND_20C;                 // 343.2 m/s, dry air at 20 °C
const TAU = DSP.TAU;

// ---- the room ---------------------------------------------------------------
const RM = { W: LAYOUT.room.w, D: LAYOUT.room.d, H: LAYOUT.room.h, z0: LAYOUT.room.wallZ };
const V_ROOM = RM.W * RM.D * RM.H;
const S_ROOM = 2 * (RM.W * RM.D + RM.W * RM.H + RM.D * RM.H);
const ABAR = 0.25;                          // stated mean absorption coefficient
const RT60 = DSP.rt60Sabine(V_ROOM, ABAR * S_ROOM);
const F_SCH = DSP.schroeder(RT60, V_ROOM);
const DELTA = 3 * Math.LN10 / RT60;
const DIAGFLOOR = Math.hypot(RM.W, RM.D);
const DIAG3D = Math.hypot(RM.W, RM.D, RM.H);

const rx = (x) => x + RM.W / 2;             // room-local coords, corner origin
const rz = (z) => z - RM.z0;

const axial = (p, q, r) => DSP.roomMode(p, q, r, RM.W, RM.D, RM.H);
const F_D1 = axial(0, 1, 0);
const F_W1 = axial(1, 0, 0);
const F_T11 = axial(1, 1, 0);   // 30.02 Hz — the first tangential mode, and the
                                // demonstration tone: 30 Hz lands on it to 0.07 %
const AXIALS = [F_D1, F_W1, axial(0, 2, 0), axial(2, 0, 0),
  axial(0, 0, 1), axial(0, 3, 0), axial(3, 0, 0), axial(0, 4, 0)];
const Z_NODE = RM.z0 + RM.D / 2;            // depth node of every odd-q mode

// ---- the subwoofer ----------------------------------------------------------
const CAB = 0.50;                           // external cube edge
const WALL = 0.030;
const PED_H = 0.245;                        // machined pedestal (see report)
const M_PANEL = (CAB ** 3 - (CAB - 2 * WALL) ** 3) * 750;   // 30 mm MDF @ 750 kg/m³
const M_TOTAL = M_PANEL + 12 + 8 + 6 + 3;   // + driver, plate amp, bracing, trim
const VB = (CAB - 2 * WALL) ** 3 - 0.008;   // net internal volume
const TS = { fs: 16, Qts: 0.42, Vas: 0.220 };
const ALIGN = DSP.sealedAlignment(TS, VB);
const SD = 0.0855;                          // m², effective piston area
const XMAX = 0.019;                         // m, one-way linear excursion
const F3 = (() => {                         // −3 dB of the sealed alignment
  const b = 2 - 1 / (ALIGN.Qtc * ALIGN.Qtc);
  return ALIGN.fc * Math.sqrt((-b + Math.sqrt(b * b + 4)) / 2);
})();
const SPL_REF = 100;                        // dB @ 1 m, half space, per sub

// ---- acoustic centres -------------------------------------------------------
const DRV_Y = PED_H + CAB / 2;
const DRV_FWD = 0.252;
const subPt = (P) => new THREE.Vector3(
  P.x + Math.sin(P.ry) * DRV_FWD, DRV_Y, P.z + Math.cos(P.ry) * DRV_FWD);
const SUB_R = subPt(LAYOUT.subR);
const SUB_L = subPt(LAYOUT.subL);
/** Main-speaker bass centre — a declared assumption, since the floorstander is
 *  another module's hardware: 0.40 m up the baffle, 0.17 m forward of its
 *  LAYOUT floor reference. */
const MAIN_R = new THREE.Vector3(
  LAYOUT.speakerR.x + Math.sin(LAYOUT.speakerR.ry) * 0.17, 0.40,
  LAYOUT.speakerR.z + Math.cos(LAYOUT.speakerR.ry) * 0.17);
const SEAT = new THREE.Vector3(LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z);

const D_SUB = SUB_R.distanceTo(SEAT);
const D_MAIN = MAIN_R.distanceTo(SEAT);
const DELTA_D = D_SUB - D_MAIN;
const DELTA_T = DELTA_D / C;
const FC_X = 80;
const PHASE_ERR = 360 * FC_X * DELTA_T;

// ---- Linkwitz–Riley 4th order ----------------------------------------------
// DSP.lrHigh() returns the complex CONJUGATE of the true high-pass: magnitude
// right, phase sign-inverted, so DSP.lrSumDb() reads −1.08 dB an octave either
// side of fc instead of 0.000 dB. Reported; correct closed form used here.
const b2lp = (f, fc) => DSP.cDiv([1, 0], [1 - (f / fc) ** 2, Math.SQRT2 * (f / fc)]);
const b2hp = (f, fc) => DSP.cDiv([-((f / fc) ** 2), 0], [1 - (f / fc) ** 2, Math.SQRT2 * (f / fc)]);
const LR4_LP = (f, fc) => DSP.cMul(b2lp(f, fc), b2lp(f, fc));
const LR4_HP = (f, fc) => DSP.cMul(b2hp(f, fc), b2hp(f, fc));
const rot = (z, ph) => [z[0] * Math.cos(ph) - z[1] * Math.sin(ph), z[0] * Math.sin(ph) + z[1] * Math.cos(ph)];
/** level-matched acoustic sum at the seat, sub late by tau relative to the main */
const sumDb = (f, tau) =>
  DSP.dB(DSP.cAbs(DSP.cAdd(LR4_HP(f, FC_X), rot(LR4_LP(f, FC_X), -TAU * f * tau))));

const WRAP_EXTRA = (1 - PHASE_ERR / 360) / FC_X;    // phase knob wound to 360°
function worstOf(tau) {
  let db = 99, f0 = 0;
  for (let f = 25; f <= 400; f += 0.25) { const v = sumDb(f, tau); if (v < db) { db = v; f0 = f; } }
  return { db, f: f0 };
}
const WORST_INSTALLED = worstOf(DELTA_T);
const WORST_WRAPPED = worstOf(DELTA_T + WRAP_EXTRA);

// ---- modal room model -------------------------------------------------------
const FMAX_TF = 400;
const MODES = (() => {
  const out = [];
  for (let p = 0; p <= Math.floor(FMAX_TF * 2 * RM.W / C); p++)
    for (let q = 0; q <= Math.floor(FMAX_TF * 2 * RM.D / C); q++)
      for (let r = 0; r <= Math.floor(FMAX_TF * 2 * RM.H / C); r++) {
        if (!p && !q && !r) continue;
        const f = axial(p, q, r);
        if (f > FMAX_TF) continue;
        const nz = (p ? 1 : 0) + (q ? 1 : 0) + (r ? 1 : 0);
        out.push({ p, q, r, f, w2: (TAU * f) ** 2, invK: Math.pow(2, nz) / V_ROOM });
      }
  return out;
})();
const psi = (m, P) => Math.cos(Math.PI * m.p * rx(P.x) / RM.W)
  * Math.cos(Math.PI * m.q * rz(P.z) / RM.D)
  * Math.cos(Math.PI * m.r * P.y / RM.H);

/** room transfer function: pressure per unit peak volume velocity, [re, im] */
function green(f, srcs, rcv) {
  const w = TAU * f, w2 = w * w, dw = -2 * DELTA * w;
  let re = 0, im = 0;
  {                                        // uniform (0,0,0) pressurisation
    const d = w2 * w2 + dw * dw, n = srcs.length / V_ROOM;
    re += n * (-w2) / d; im += n * (-dw) / d;
  }
  for (const m of MODES) {
    let num = 0;
    for (const s of srcs) num += psi(m, s);
    if (num === 0) continue;
    num *= psi(m, rcv) * m.invK;
    const dr = m.w2 - w2, d = dr * dr + dw * dw;
    re += num * dr / d; im += num * (-dw) / d;
  }
  const k = w * DSP.RHO_AIR * C * C;
  return [-k * im, k * re];                // × j
}
/** half-space free-field monopole reference, same units */
function freeField(f, srcs, rcv) {
  const w = TAU * f, a = w * DSP.RHO_AIR / (2 * Math.PI);
  let re = 0, im = 0;
  for (const s of srcs) {
    const r = s.distanceTo(rcv), ph = -w * r / C + Math.PI / 2;
    re += (a / r) * Math.cos(ph); im += (a / r) * Math.sin(ph);
  }
  return [re, im];
}

// ---- precomputed seat-response envelopes ------------------------------------
const FG = DSP.logSpace(15, 200, 220);
const SOFA = [-0.85, -0.425, 0, 0.425, 0.85].map((x) => new THREE.Vector3(x, SEAT.y, SEAT.z));
/** 1/6-octave smoothing — the resolution a measurement is normally read at */
const SMOOTH = 6;
function smooth(arr) {
  const k = Math.pow(2, 1 / (2 * SMOOTH));
  return FG.map((f, i) => {
    let s = 0, n = 0;
    for (let j = 0; j < FG.length; j++) {
      if (FG[j] >= f / k && FG[j] <= f * k) { s += arr[j]; n++; }
    }
    return n ? s / n : arr[i];
  });
}
function envelope(srcs) {
  const per = SOFA.map((s) => smooth(FG.map((f) =>
    DSP.dB(DSP.cAbs(green(f, srcs, s))) - DSP.dB(DSP.cAbs(freeField(f, srcs, s))))));
  const up = FG.map((_, i) => Math.max(...per.map((a) => a[i])));
  const lo = FG.map((_, i) => Math.min(...per.map((a) => a[i])));
  const band = FG.map((f, i) => i).filter((i) => FG[i] >= 20 && FG[i] <= 80);
  const spread = band.reduce((a, i) => a + up[i] - lo[i], 0) / band.length;
  const mid = band.map((i) => per[2][i]);
  return { up, lo, spread, pp: Math.max(...mid) - Math.min(...mid) };
}
const ENV1 = envelope([SUB_R]);                 // one sub
const ENV2 = envelope([SUB_R, SUB_L]);          // the pair
function atF(arr, f) {
  const a = Math.log10(FG[0]), b = Math.log10(FG[FG.length - 1]);
  const x = DSP.clamp((Math.log10(f) - a) / (b - a), 0, 1) * (FG.length - 1);
  const i = Math.min(FG.length - 2, Math.floor(x));
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
}

// ---- demonstration tone: the first tangential mode --------------------------
const F_TONE = F_T11;
const LAM_TONE = DSP.lambda(F_TONE, C);
const X_PK = DSP.excursionForSpl(SPL_REF, F_TONE, SD, 1);
const Q_PK = SD * TAU * F_TONE * X_PK;
const psi110 = (P) => Math.cos(Math.PI * rx(P.x) / RM.W) * Math.cos(Math.PI * rz(P.z) / RM.D);
const PSI_R = psi110(SUB_R);
const PSI_L = psi110(SUB_L);
const seatSpl = (s) => DSP.splFromPa(DSP.cAbs(green(F_TONE, s, SEAT)) * Q_PK / Math.SQRT2);
const SPL_ONE = seatSpl([SUB_R]);
const SPL_TWO = seatSpl([SUB_R, SUB_L]);
const LAM30 = DSP.lambda(30, C);
const LAM2K = DSP.lambda(2000, C);

// ---- visual helpers ---------------------------------------------------------
/** Phase origin of the animation. Arbitrary — it only sets which instant of the
 *  standing wave a still frame catches. */
const PH0 = -3.148;
const SHOT = { position: [0.45, 3.55, 6.60], target: [1.55, 0.26, -1.80], fov: 44 };
const CAMV = new THREE.Vector3(...SHOT.position);
function faceCam(g) {
  const d = CAMV.clone().sub(g.position);
  g.rotation.set(0, Math.atan2(d.x, d.z), 0);
  g.rotateX(-Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.55);
  return g;
}
function panel(gr, w, h) {
  const wrap = new THREE.Group();
  const card = DIAG.diagramCard(w, h, { opacity: 0.74, pad: 0.045 });
  card.position.set(-w / 2, -h / 2, -0.002);
  gr.position.set(-w / 2, -h / 2, 0);
  wrap.add(card, gr);
  return wrap;
}
const dash = (n, col, wdt, op) => new DIAG.Trace(n, col, wdt,
  { dashed: true, dashSize: 0.055, gapSize: 0.042, opacity: op });
function roundedRect(sh, w, h, r) {
  const x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
}
let _coneMat = null, _surrMat = null;
/** Pulp cone, lifted just enough to read against a black cabinet. */
function CONE_MAT() {
  if (!_coneMat) { _coneMat = mats().cone.clone(); _coneMat.color.setHex(0x24272c); }
  return _coneMat;
}
/** Deep roll surround — matte, so it separates from the cone by tone alone. */
function SURR_MAT() {
  if (!_surrMat) { _surrMat = mats().rubber.clone(); _surrMat.color.setHex(0x191b1f); }
  return _surrMat;
}
let _ringMat = null;
/** Diamond-turned alloy: the one bright element on an otherwise black cabinet. */
function RING_MAT() {
  if (!_ringMat) {
    _ringMat = mats().alu.clone();
    _ringMat.roughness = 0.33;
    _ringMat.color.setHex(0x9ea4ac);
    _ringMat.envMapIntensity = 0.72;
    _ringMat.anisotropy = 0.85;
  }
  return _ringMat;
}
/** flat annulus with broken edges — a machined trim ring */
function ringLathe(rIn, rOut, t, b = 0.0012) {
  const p = [
    new THREE.Vector2(rIn, -t / 2), new THREE.Vector2(rIn, t / 2 - b),
    new THREE.Vector2(rIn + b, t / 2), new THREE.Vector2(rOut - b, t / 2),
    new THREE.Vector2(rOut, t / 2 - b), new THREE.Vector2(rOut, -t / 2 + b),
    new THREE.Vector2(rOut - b, -t / 2), new THREE.Vector2(rIn + b, -t / 2),
    new THREE.Vector2(rIn, -t / 2),
  ];
  const g = new THREE.LatheGeometry(p, 96);
  g.computeVertexNormals();
  return g;
}

const RUL_Z = [-1.95, -1.58, -1.21];
const Z_FIELD_NEAR = 4.30;   // the field is drawn over the floor in shot, not the whole room
const ZF = -2.05;            // the cyclorama cove hides the floor behind z ≈ −2.15
const Y0 = 0.006;

// ===========================================================================
export default {
  id: 'sub',
  title: 'Bass &amp; the Room',
  nav: 'Subwoofers',
  kicker: 'Subwoofers',
  standfirst: 'Under 105 Hz this room is a resonator. It decides what you hear.',
  shot: SHOT,
  timeScale: 0.02,
  alwaysUpdate: false,

  // -------------------------------------------------------------------------
  build(ctx) {
    const hardware = new THREE.Group();
    const overlay = new THREE.Group();
    const S = this._s = { cones: [], coup: [], knobs: [] };

    for (const P of [LAYOUT.subL, LAYOUT.subR]) hardware.add(this._sub(P, S));

    // ---- floor: room plan -------------------------------------------------
    const pts = [[-RM.W / 2, ZF], [RM.W / 2, ZF], [RM.W / 2, RM.z0 + RM.D],
      [-RM.W / 2, RM.z0 + RM.D], [-RM.W / 2, ZF]];
    const plan = new DIAG.Trace(5, 0x8b939d, 1.4, { opacity: 0.62 });
    plan.write((i) => [pts[i][0], Y0, pts[i][1]]);
    overlay.add(plan);

    // ---- floor: modal pressure field --------------------------------------
    this._field(overlay, S);

    // ---- floor: nodes, antinodes, seat ------------------------------------
    const nodeW = dash(2, PAL.gr, 2.0, 0.95);
    nodeW.write((i) => [0, Y0 + 0.002, i === 0 ? ZF : RM.z0 + RM.D]);
    overlay.add(nodeW);
    const nodeD = dash(2, PAL.gr, 2.0, 0.95);
    nodeD.write((i) => [i === 0 ? -RM.W / 2 : RM.W / 2, Y0 + 0.002, Z_NODE]);
    overlay.add(nodeD);
    overlay.add(this._seat());
    overlay.add(this._ruler());

    // ---- how each sub couples to that mode --------------------------------
    for (const [P, ps] of [[LAYOUT.subL, PSI_L], [LAYOUT.subR, PSI_R]]) {
      // Ψ is a property of position, not time: a static signed bar about a zero line
      const y0 = PED_H + CAB + 0.34;
      const col = ps > 0 ? PAL.cy : PAL.am;
      const zero = new DIAG.Trace(2, PAL.ink3, 1.3, { opacity: 0.65 });
      zero.write((i) => [P.x + (i ? 0.10 : -0.10), y0, P.z]);
      const t = new DIAG.Trace(2, col, 3.4, { opacity: 1 });
      t.write((i) => [P.x, i === 0 ? y0 : y0 + 0.26 * ps, P.z]);
      const cap = new DIAG.Trace(2, col, 3.4, { opacity: 1 });
      cap.write((i) => [P.x + (i ? 0.06 : -0.06), y0 + 0.26 * ps, P.z]);
      overlay.add(zero, t, cap);
      S.coup.push(t);
    }

    overlay.add(this._graphA(S));
    overlay.add(this._graphB());
    this._labels(ctx, S);
    return { hardware, overlay };
  },

  // =========================================================================
  // hardware
  // =========================================================================
  _sub(P, S) {
    const g = new THREE.Group();
    g.position.set(P.x, 0, P.z);
    g.rotation.y = P.ry;
    const M = mats();
    const half = CAB / 2;

    // pedestal + spikes
    const ped = new THREE.Mesh(GEO.bevelBox(CAB + 0.05, PED_H - 0.030, CAB + 0.05, 0.006, 4), M.anodBlack);
    ped.position.y = (PED_H - 0.030) / 2 + 0.014;
    g.add(ped);
    const cap = new THREE.Mesh(GEO.bevelBox(CAB - 0.115, 0.016, CAB - 0.115, 0.003, 3), M.steel);
    cap.position.y = PED_H - 0.014;
    g.add(cap);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const sp = new THREE.Mesh(GEO.bevelCyl(0.020, 0.006, 0.016, 20, 0.0008), M.steel);
      sp.position.set(sx * (half - 0.008), 0.008, sz * (half - 0.008));
      g.add(sp);
    }

    // gloss cabinet body
    const bodyD = 0.40;
    const body = new THREE.Mesh(GEO.bevelBox(CAB, CAB, bodyD, 0.013, 6), M.pianoBlack);
    body.position.set(0, PED_H + half, -half + bodyD / 2);
    g.add(body);

    // machined baffle plate with the driver cut-out
    const bt = CAB - bodyD;
    const holeR = 0.1925;
    const sh = new THREE.Shape();
    roundedRect(sh, CAB + 0.019, CAB + 0.019, 0.016);
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, TAU, true);
    sh.holes.push(hole);
    const baffle = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {
      depth: bt - 0.004, bevelEnabled: true, bevelSize: 0.0026,
      bevelThickness: 0.0018, bevelSegments: 3, curveSegments: 72,
    }), M.anodGrey);
    baffle.position.set(0, PED_H + half, half - bt);
    g.add(baffle);

    // alloy trim ring + fasteners
    const ring = new THREE.Mesh(ringLathe(0.1930, 0.2260, 0.015), RING_MAT());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, PED_H + half, half + 0.0068);
    g.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.39;
      const s = GEO.screw(0.0028, { mat: M.steel });
      s.position.set(Math.cos(a) * 0.2095, PED_H + half + Math.sin(a) * 0.2095, half + 0.0145);
      g.add(s);
    }

    // the 380 mm driver
    const drv = new THREE.Group();
    drv.position.set(0, PED_H + half, half - 0.0055);
    const cone = GEO.driverCone(0.183, 0.052, {
      surroundW: 0.044, dustR: 0.050, coneMat: CONE_MAT(), surrMat: SURR_MAT(), dustMat: CONE_MAT(),
    });
    cone.rotation.x = Math.PI / 2;
    drv.add(cone);
    g.add(drv);
    S.cones.push(drv);
    const flh = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 10), M.ledCyan);
    flh.position.set(0, PED_H + 0.052, half + 0.0035);
    g.add(flh);
    const linerMat = M.rubber.clone();
    linerMat.side = THREE.DoubleSide;
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.1918, 0.1918, bt * 0.94, 48, 1, true), linerMat);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(0, PED_H + half, half - bt / 2);
    g.add(liner);

    // rear plate amplifier
    const rear = new THREE.Group();
    rear.position.set(0, PED_H + half, -half + 0.004);
    rear.rotation.y = Math.PI;
    const plate = new THREE.Mesh(GEO.bevelBox(0.35, 0.39, 0.014, 0.0025, 3), M.anodGrey);
    plate.position.z = 0.007;
    rear.add(plate);
    const hs = GEO.heatsink(0.305, 0.16, 0.036, 22, { mat: M.anodBlack });
    hs.position.set(0, 0.098, 0.032);
    rear.add(hs);
    for (let i = 0; i < 3; i++) {
      const k = GEO.knob(0.0195, 0.014, { body: M.alu, mark: M.chrome });
      k.rotation.x = Math.PI / 2;
      k.rotation.z = [-0.6, 0.35, -1.25][i];
      k.position.set(-0.105 + i * 0.105, -0.038, 0.021);
      rear.add(k);
      if (i === 2) S.knobs.push(k);
    }
    for (const [x, o] of [[-0.100, GEO.xlr()], [-0.005, GEO.xlr()], [0.100, GEO.iecInlet()]]) {
      o.position.set(x, -0.133, 0.014);
      rear.add(o);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 10, 8), M.ledCyan);
    led.position.set(0.132, -0.038, 0.016);
    rear.add(led);
    GEO.screwRow(rear, [[-0.160, 0.180], [0.160, 0.180], [-0.160, -0.180], [0.160, -0.180]], 0.015, 0.0026);
    g.add(rear);

    GEO.shadowed(g);
    led.castShadow = led.receiveShadow = false;
    flh.castShadow = flh.receiveShadow = false;
    const sh2 = GEO.contactShadow(CAB * 3.2, CAB * 3.2, 0.85);
    sh2.position.y = 0.0016;
    g.add(sh2);
    return g;
  },

  // =========================================================================
  // overlay
  // =========================================================================
  _field(overlay, S) {
    const NX = 62, NZ = 58;
    const fw = RM.W, fd = Z_FIELD_NEAR - ZF;
    const geo = new THREE.PlaneGeometry(fw, fd, NX, NZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, nV = pos.count;
    const col = new THREE.BufferAttribute(new Float32Array(nV * 3), 3);
    geo.setAttribute('color', col);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    }));
    const cz = ZF + fd / 2;
    mesh.position.set(0, Y0 - 0.0015, cz);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    overlay.add(mesh);
    S.field = mesh; S.col = col; S.nV = nV;

    // Two static complex fields — one sub, and the pair — at F_TONE.
    // Modes are grouped by their (p,q) floor pattern; at y = 0 every vertical
    // index contributes cos(0) = 1, so the floor shape depends only on (p,q).
    const w = TAU * F_TONE, w2 = w * w, dw = -2 * DELTA * w;
    const kk = w * DSP.RHO_AIR * C * C;
    const make = (srcs) => {
      const pat = new Map();
      const d0 = w2 * w2 + dw * dw, n0 = srcs.length / V_ROOM;
      pat.set('0,0', { p: 0, q: 0, re: n0 * (-w2) / d0, im: n0 * (-dw) / d0 });
      for (const m of MODES) {
        if (m.f > 150) continue;
        let num = 0;
        for (const s of srcs) num += psi(m, s);
        if (Math.abs(num) < 1e-12) continue;
        num *= m.invK;
        const dr = m.w2 - w2, d = dr * dr + dw * dw;
        const key = `${m.p},${m.q}`;
        const e = pat.get(key) || { p: m.p, q: m.q, re: 0, im: 0 };
        e.re += num * dr / d; e.im += num * (-dw) / d;
        pat.set(key, e);
      }
      const list = [...pat.values()];
      const re = new Float32Array(nV), im = new Float32Array(nV);
      for (let i = 0; i < nV; i++) {
        const ax = Math.PI * rx(pos.getX(i)) / RM.W;
        const az = Math.PI * rz(pos.getZ(i) + cz) / RM.D;
        let sr = 0, si = 0;
        for (const e of list) {
          const s = Math.cos(ax * e.p) * Math.cos(az * e.q);
          sr += e.re * s; si += e.im * s;
        }
        re[i] = -kk * si; im[i] = kk * sr;
      }
      return { re, im };
    };
    S.f1 = make([SUB_R]);
    S.f2 = make([SUB_R, SUB_L]);
    let pk = 0;
    for (let i = 0; i < nV; i++) pk = Math.max(pk, Math.hypot(S.f1.re[i], S.f1.im[i]));
    S.gain = 1 / pk;
  },

  _seat() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.150, 0.166, 56),
      new THREE.MeshBasicMaterial({
        color: PAL.am, transparent: true, opacity: 0.9, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(SEAT.x, Y0 + 0.004, SEAT.z);
    ring.renderOrder = 11;
    g.add(ring);
    for (let i = 0; i < 4; i++) {
      const t = new DIAG.Trace(2, PAL.am, 1.5, { opacity: 0.75 });
      const a = i * Math.PI / 2 + Math.PI / 4;
      t.write((k) => [SEAT.x + Math.cos(a) * (k ? 0.25 : 0.19), Y0 + 0.004,
        SEAT.z + Math.sin(a) * (k ? 0.25 : 0.19)]);
      g.add(t);
    }
    const stalk = dash(2, PAL.am, 1.3, 0.65);
    stalk.write((i) => [SEAT.x, i === 0 ? Y0 : SEAT.y, SEAT.z]);
    g.add(stalk);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true }));
    ear.position.copy(SEAT);
    g.add(ear);
    return g;
  },

  /** Three bars at true scale: the room, half a 30 Hz wave, and 2 kHz. */
  _ruler() {
    const g = new THREE.Group();
    const y = Y0 + 0.004;
    const bars = [
      [RM.W / 2, RUL_Z[0], 0x9aa3ad, 1.5, 0.11],
      [LAM30 / 4, RUL_Z[1], PAL.cy, 2.2, 0.085],
      [LAM2K / 2, RUL_Z[2], PAL.cy, 2.4, 0.05],
    ];
    for (const [hx, z, col, wd, hd] of bars) {
      g.add(DIAG.dimension([-hx, y, z], [hx, y, z], { color: col, width: wd, head: hd }));
    }
    for (const sx of [-1, 1]) {          // wall ticks on the room bar
      const t = new DIAG.Trace(2, PAL.ink3, 1.2, { opacity: 0.6 });
      t.write((i) => [sx * RM.W / 2, y, i === 0 ? RUL_Z[0] - 0.20 : RUL_Z[0] + 0.20]);
      g.add(t);
    }
    return g;
  },

  _graphA(S) {
    const w = 2.62, h = 1.06;
    const gr = new DIAG.Graph({
      w, h, xLog: true, xRange: [15, 160], yRange: [-16, 24],
      yTicks: [-16, -8, 0, 8, 16, 24], zeroLine: 0,
    });
    const bw = w - gr.x(F_SCH);
    const sb = gr.addBand(-16, 24, PAL.ink3, 0.11);
    sb.scale.x = bw / w;
    sb.position.x = gr.x(F_SCH) + bw / 2;
    for (const f of AXIALS) gr.addMarker(f, { color: PAL.ink3, width: 1.0, dashed: false, opacity: 0.40 });
    gr.addMarker(F_SCH, { color: PAL.gr, width: 1.7, dashed: true, opacity: 0.9 });
    gr.addTrace((f) => atF(ENV1.up, f), { color: PAL.am, width: 1.7, dashed: true, n: 260 });
    gr.addTrace((f) => atF(ENV1.lo, f), { color: PAL.am, width: 1.7, dashed: true, n: 260 });
    gr.addTrace((f) => atF(ENV2.up, f), { color: PAL.cy, width: 2.8, n: 260 });
    gr.addTrace((f) => atF(ENV2.lo, f), { color: PAL.cy, width: 2.8, n: 260 });
    S.dot = gr.addDot(PAL.cy, 0.016);
    S.dot.userData.setData(F_TONE, atF(ENV2.up, F_TONE));
    const wrap = panel(gr, w, h);
    wrap.position.set(0.95, 2.10, -3.05);
    return faceCam(wrap);
  },

  _graphB() {
    const w = 1.44, h = 0.64;
    const gr = new DIAG.Graph({
      w, h, xLog: true, xRange: [25, 320], yRange: [-9, 3],
      yTicks: [-9, -6, -3, 0, 3], zeroLine: 0,
    });
    gr.addMarker(FC_X, { color: PAL.ink3, width: 1.2, opacity: 0.5 });
    gr.addTrace((f) => sumDb(f, DELTA_T + WRAP_EXTRA), { color: PAL.vi, width: 1.6, dashed: true, n: 220 });
    gr.addTrace((f) => sumDb(f, DELTA_T), { color: PAL.am, width: 2.5, n: 220 });
    gr.addTrace((f) => sumDb(f, 0), { color: PAL.gr, width: 2.5, n: 220 });
    const wrap = panel(gr, w, h);
    wrap.position.set(-2.14, 2.00, -3.05);
    return faceCam(wrap);
  },

  // =========================================================================
  _labels(ctx, S) {
    const L = ctx.labels;
    S.lab = {};
    // NOTE: .t and .v render inline, so a trailing <br> in `text` is what puts
    // the mono value on its own line.
    S.lab.sub = L.add(new THREE.Vector3(LAYOUT.subR.x, 1.30, LAYOUT.subR.z), {
      kicker: `Sealed · 380 mm · ${M_TOTAL.toFixed(0)} kg`,
      text: `${(VB * 1000).toFixed(0)} L · f₃ ${F3.toFixed(1)} Hz · 12 dB/oct<br>`,
      value: '', cls: 'am', offset: [0, 0],
    });
    S.lab.pair = L.add(new THREE.Vector3(LAYOUT.subL.x, 1.46, LAYOUT.subL.z), {
      kicker: 'Right sub alone',
      text: `Ψ₁₁₀ = ${PSI_L.toFixed(3)} / ${PSI_R.toFixed(3)}<br>`,
      value: 'sum 0.000', cls: 'acc', offset: [40, 0],
    });
    S.lab.seat = L.add(new THREE.Vector3(SEAT.x, SEAT.y + 0.20, SEAT.z), {
      kicker: 'Seat · on the node', text: 'Ψ₁₁₀ = 0.000<br>',
      value: '', cls: 'am', offset: [0, -22],
    });
    S.lab.node = L.add(new THREE.Vector3(-2.30, Y0, Z_NODE), {
      kicker: `Nodes · mode (1,1,0) · ${F_TONE.toFixed(2)} Hz`,
      text: 'the seat sits on one', cls: 'acc', offset: [0, -16],
    });
    S.lab.rul = L.add(new THREE.Vector3(-1.85, Y0, RUL_Z[0]), {
      kicker: 'Room width', value: `${RM.W.toFixed(2)} m`, offset: [0, -16],
    });
    S.lab.rul2 = L.add(new THREE.Vector3(1.43, Y0, RUL_Z[1]), {
      kicker: 'λ/2 at 30 Hz', value: `${(LAM30 / 2).toFixed(2)} m`,
      cls: 'acc', offset: [0, -16],
    });
    S.lab.rul3 = L.add(new THREE.Vector3(LAM2K / 2, Y0, RUL_Z[2]), {
      kicker: 'λ at 2 kHz · same scale', value: `${(LAM2K * 1000).toFixed(0)} mm`,
      cls: 'acc', offset: [100, -6],
    });
    S.lab.gA = L.add(new THREE.Vector3(0.95, 2.80, -3.05), {
      kicker: 'At the sofa — computed',
      text: '5 seats · ⅙-oct · dB re free field<br>', value: '', offset: [0, 0],
    });
    S.lab.gB = L.add(new THREE.Vector3(-2.14, 2.48, -3.05), {
      kicker: `Sub + main · LR4 ${FC_X} Hz`,
      text: `Δd ${DELTA_D.toFixed(2)} m = ${(DELTA_T * 1e3).toFixed(2)} ms = ${PHASE_ERR.toFixed(0)}°`,
      cls: 'am', offset: [0, 0],
    });
  },

  // =========================================================================
  update(dt, t) {
    const S = this._s;
    if (!S || !S.field) return;
    const ph = TAU * F_TONE * t + PH0;
    const cs = Math.cos(ph), sn = Math.sin(ph);
    S.tNow = t;

    // slow A/B between one sub and the pair (period 0.32 simulated seconds)
    const P = 0.32;
    const u = (((t % P) + P) % P) / P;
    const mix = DSP.smoothstep(0.45, 0.55, u) - DSP.smoothstep(0.955, 1.0, u);
    S.mix = mix;

    // Floor field. Brightness = 0.30·(standing-wave envelope) + 0.70·|instantaneous|,
    // so the node/antinode geography stays legible through the zero crossing.
    // Cyan = compression, amber = rarefaction.
    const f1 = S.f1, f2 = S.f2, cA = S.col.array, g = S.gain;
    for (let i = 0; i < S.nV; i++) {
      const re = f1.re[i] + (f2.re[i] - f1.re[i]) * mix;
      const im = f1.im[i] + (f2.im[i] - f1.im[i]) * mix;
      const inst = (re * cs - im * sn) * g;
      const env = Math.hypot(re, im) * g;
      let b = 0.26 * env + 0.74 * Math.abs(inst);
      if (b > 1) b = 1;
      const s = Math.pow(b, 1.35) * 0.24;
      if (inst >= 0) { cA[i * 3] = s * 0.30; cA[i * 3 + 1] = s * 0.72; cA[i * 3 + 2] = s; }
      else { cA[i * 3] = s; cA[i * 3 + 1] = s * 0.68; cA[i * 3 + 2] = s * 0.30; }
    }
    S.col.needsUpdate = true;

    // cones at true-scale excursion, both fed the same signal
    const x = X_PK * cs;
    for (const c of S.cones) c.position.z = CAB / 2 - 0.0055 + x;

    for (const k of S.knobs) k.rotation.z = -1.25 + 2.4 * mix;

    S.lab.sub.setValue(`x ${(x * 1000).toFixed(1)} mm of ${(XMAX * 1000).toFixed(0)}`);
    S.lab.seat.setValue(`${(mix > 0.5 ? SPL_TWO : SPL_ONE).toFixed(1)} dB SPL`);
    S.lab.pair.setKicker(mix > 0.5 ? 'Both subs playing' : 'Right sub alone');
    S.lab.pair.setValue(mix > 0.5 ? 'sum 0.000 — mode gone' : 'sum 0.000 if both play');
    S.lab.gA.setValue(mix > 0.5 ? 'both subs — seats agree' : 'one sub — seats disagree');
    S.dot.userData.setData(F_TONE, atF(mix > 0.5 ? ENV2.up : ENV1.up, F_TONE));
  },

  // =========================================================================
  content() {
    const n = (v) => `<span class="num">${v}</span>`;
    return `
<p>One wavelength at ${n('30 Hz')} is ${n(LAM30.toFixed(2) + ' m')}; the room's floor
diagonal, its longest straight line, is ${n(DIAGFLOOR.toFixed(2) + ' m')}. The wave is
${n((100 * LAM30 / DIAGFLOOR).toFixed(0) + '%')} of it, so it cannot cross the room as a
travelling wave. The air pressurises as a body, then settles into a pattern fixed by the
walls. At ${n('2 kHz')} λ is ${n((LAM2K * 1000).toFixed(0) + ' mm')} —
${n((LAM30 / LAM2K).toFixed(0) + '×')} shorter, and the room is acoustically large.</p>

<h3>The modes are arithmetic</h3>
<div class="eq">f = <span class="hl">c/2</span> · √( (p/W)² + (q/D)² + (r/H)² )
<span class="c">W ${RM.W} · D ${RM.D} · H ${RM.H} m · c ${C} m/s</span>
<span class="c">axial </span>${AXIALS.slice(0, 4).map((f) => f.toFixed(2)).join('  ')} Hz
<span class="c">      </span>${AXIALS.slice(4).map((f) => f.toFixed(2)).join('  ')} Hz
δ = 3·ln10/RT60 = ${DELTA.toFixed(1)} s⁻¹  <span class="c">rigid walls; real ones</span>
<span class="c">absorb more at 20 Hz, so the peaks are gentler</span></div>
<p>30 Hz sits within ${n((100 * Math.abs(F_TONE - 30) / 30).toFixed(2) + '%')} of the first
tangential mode, ${n('(1,1,0)')} at ${n(F_TONE.toFixed(2) + ' Hz')} — the pattern on the
floor. Sabine with ᾱ = ${n(ABAR)} over ${n(S_ROOM.toFixed(1) + ' m²')} gives RT60
${n(RT60.toFixed(2) + ' s')}, so the Schroeder frequency is 2000·√(RT60/V) =
${n(F_SCH.toFixed(0) + ' Hz')}. Every subwoofer frequency is below it — discrete
resonances, not statistics.</p>

<h3>The box</h3>
<div class="eq">Vas ${(TS.Vas * 1000).toFixed(0)} L / Vb ${(VB * 1000).toFixed(0)} L → α ${ALIGN.alpha.toFixed(2)}
fc = fs·√(α+1) = <span class="hl">${ALIGN.fc.toFixed(1)} Hz</span> · Qtc = ${ALIGN.Qtc.toFixed(2)}
f₃ ${F3.toFixed(1)} Hz, <span class="hl">12 dB/oct</span> <span class="c">— sealed is 2nd order</span></div>

<h3>Why two — and what they fix</h3>
<p>The subs stand ${n(Math.abs(LAYOUT.subR.x).toFixed(2) + ' m')} either side of the centre
line, so any mode with an odd lateral index meets them with equal and opposite
pressure: Ψ₁₁₀ = ${n(PSI_R.toFixed(3))} and ${n(PSI_L.toFixed(3))}. It sums to zero and the
mode is never excited: watch the floor pattern collapse as the second joins.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>Two subwoofers do not flatten
the curve at one seat. Computed here, 20–80 Hz peak-to-peak at the central seat is
${n(ENV1.pp.toFixed(1) + ' dB')} with one sub and an identical ${n(ENV2.pp.toFixed(1) + ' dB')}
with two: a centre-line seat is already blind to every odd lateral mode. What collapses
is the <em>disagreement between seats</em>, ${n(ENV1.spread.toFixed(1) + ' dB')} to
${n(ENV2.spread.toFixed(1) + ' dB')} — the prize, because one equalisation now serves them
all.</p></div>

<h3>Arrival times</h3>
<p>The subs are ${n(D_SUB.toFixed(2) + ' m')} from the seat, the mains
${n(D_MAIN.toFixed(2) + ' m')}: ${n(DELTA_D.toFixed(2) + ' m')} further,
${n((DELTA_T * 1e3).toFixed(2) + ' ms')}, which at ${FC_X} Hz is ${n(PHASE_ERR.toFixed(0) + '°')}.
LR4 sums flat only in phase, so as installed the sum falls to
${n(WORST_INSTALLED.db.toFixed(1) + ' dB')} at ${n(WORST_INSTALLED.f.toFixed(0) + ' Hz')}. Winding
the sub's phase control until it wraps a whole cycle
(${n(((DELTA_T + WRAP_EXTRA) * 1e3).toFixed(2) + ' ms')}) is exact at ${FC_X} Hz and wrong
either side: still ${n(WORST_WRAPPED.db.toFixed(1) + ' dB')} at
${n(WORST_WRAPPED.f.toFixed(0) + ' Hz')}. Delay the <em>mains</em> by
${n((DELTA_T * 1e3).toFixed(2) + ' ms')} instead — the green trace, flat to ${n('0.00 dB')}.</p>

<div class="key"><span class="lab">The idea</span><p>Below Schroeder the room is a resonator
with a fixed geography of loud and quiet places. A source excites a mode by where it
stands, not by how good it is.</p></div>`;
  },

  readouts() {
    const S = this._s || {};
    const two = (S.mix ?? 0) > 0.5;
    const bar = Math.abs(Math.cos(TAU * F_TONE * (S.tNow || 0) + PH0));
    return [
      { k: 'MODE (1,1,0)', v: F_TONE.toFixed(2), u: 'Hz', cls: 'acc' },
      { k: 'λ AT TONE', v: LAM_TONE.toFixed(2), u: 'm', cls: 'acc', bar: DSP.clamp(LAM_TONE / DIAG3D, 0, 1) },
      { k: 'SEAT SPL', v: (two ? SPL_TWO : SPL_ONE).toFixed(1), u: 'dB', cls: '', bar },
      { k: 'SUB DELAY', v: (DELTA_T * 1e3).toFixed(2), u: 'ms', cls: 'am' },
      { k: 'PHASE @80', v: PHASE_ERR.toFixed(0), u: '°', cls: 'am' },
      { k: 'SUM DEV', v: WORST_INSTALLED.db.toFixed(1), u: 'dB', cls: 'am' },
    ];
  },
};
