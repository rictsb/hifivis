import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   BASS & THE ROOM
   ---------------------------------------------------------------------------
   One hero — the right subwoofer, three-quarter — and one diagram: the room
   drawn in plan with the pressure field at the demonstration tone painted on
   it. Everything else that used to be in this scene (a floor-wide wash, three
   dimension bars, two graph cards) is now prose.

   Room model — rigid-walled rectangular modal expansion:
     p(r,ω) = jωρ₀c²Q · Σₙ Ψₙ(rs)·Ψₙ(r) / [Kₙ·(ωₙ² − ω² − 2jδω)]
     Ψₙ = cos(pπx/W)·cos(qπz/D)·cos(rπy/H),  Kₙ = V / 2^(non-zero indices)
     δ  = 3·ln10/RT60   (amplitude decay giving 60 dB in RT60)
   The (0,0,0) term is kept: it is the uniform pressurisation that dominates
   below the first axial resonance.

   Every number shown is derived here, at module scope, from LAYOUT and DSP,
   and the drive level that sets the excursion and the seat SPL is stated in
   content(), in the hero label and in the readouts.
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
const DIAG3D = Math.hypot(RM.W, RM.D, RM.H);   // 12.06 m — the longest straight line

const rx = (x) => x + RM.W / 2;             // room-local coords, corner origin
const rz = (z) => z - RM.z0;

const axial = (p, q, r) => DSP.roomMode(p, q, r, RM.W, RM.D, RM.H);
const F_T11 = axial(1, 1, 0);   // 30.02 Hz — the first tangential mode, and the
                                // demonstration tone: 30 Hz lands on it to 0.07 %
const AXIALS = [axial(0, 1, 0), axial(1, 0, 0), axial(0, 2, 0), axial(2, 0, 0)];

// ---- the subwoofer ----------------------------------------------------------
const CAB = 0.50;                           // external cube edge
const WALL = 0.030;
const PED_H = 0.245;                        // machined pedestal
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
/** The stated drive level. Everything downstream — excursion, volume velocity,
 *  seat SPL — follows from it, so it is printed on screen, not buried here. */
const SPL_REF = 100;                        // dB @ 1 m, half space, per sub

// ---- acoustic centres -------------------------------------------------------
const DRV_Y = PED_H + CAB / 2;
const DRV_FWD = 0.252;
const subPt = (P) => new THREE.Vector3(
  P.x + Math.sin(P.ry) * DRV_FWD, DRV_Y, P.z + Math.cos(P.ry) * DRV_FWD);
const SUB_R = subPt(LAYOUT.subR);
const SUB_L = subPt(LAYOUT.subL);
const SEAT = new THREE.Vector3(LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z);
const D_SUB = SUB_R.distanceTo(SEAT);

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

// ---- seat-to-seat spread, 20–80 Hz ------------------------------------------
const FG = DSP.logSpace(15, 200, 220);
const SOFA_X = [-0.85, -0.425, 0, 0.425, 0.85];
const SOFA = SOFA_X.map((x) => new THREE.Vector3(x, SEAT.y, SEAT.z));
const SMOOTH_N = 6;                         // 1/6-octave, how a measurement is read
function smooth(arr) {
  const k = Math.pow(2, 1 / (2 * SMOOTH_N));
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
  const band = FG.map((f, i) => i).filter((i) => FG[i] >= 20 && FG[i] <= 80);
  const spread = band.reduce(
    (a, i) => a + Math.max(...per.map((p) => p[i])) - Math.min(...per.map((p) => p[i])), 0
  ) / band.length;
  const mid = band.map((i) => per[2][i]);
  return { spread, pp: Math.max(...mid) - Math.min(...mid) };
}
const ENV1 = envelope([SUB_R]);                 // one sub
const ENV2 = envelope([SUB_R, SUB_L]);          // the pair

// ---- demonstration tone: the first tangential mode --------------------------
const F_TONE = F_T11;
const LAM_TONE = DSP.lambda(F_TONE, C);
const X_PK = DSP.excursionForSpl(SPL_REF, F_TONE, SD, 1);   // 4.85 mm peak
const Q_PK = SD * TAU * F_TONE * X_PK;                      // 78.2 L/s peak
const psi110 = (P) => Math.cos(Math.PI * rx(P.x) / RM.W) * Math.cos(Math.PI * rz(P.z) / RM.D);
const PSI_R = psi110(SUB_R);
const PSI_L = psi110(SUB_L);
const seatSpl = (s) => DSP.splFromPa(DSP.cAbs(green(F_TONE, s, SEAT)) * Q_PK / Math.SQRT2);
const SPL_ONE = seatSpl([SUB_R]);
const SPL_TWO = seatSpl([SUB_R, SUB_L]);        // exactly SPL_ONE + 6.021 dB
const LAM30 = DSP.lambda(30, C);
const LAM2K = DSP.lambda(2000, C);
const SUB_OFF = Math.abs(SUB_R.x);              // 2.84 m off the centre line

/**
 * The floor field, decomposed by (p,q).
 *
 * At y = 0 every vertical index contributes cos(0) = 1, so the shape of the
 * field on the floor depends only on (p,q); modes sharing a floor pattern can
 * be summed once. The pair is not a separate field: the left sub's modal
 * coupling is (−1)^p times the right one's, so a second sub at level `mix`
 * scales every term by (1 + mix·(−1)^p) — exact, and it makes the odd-p terms
 * vanish when the pair is level-matched.
 */
const NPAT = 18;
const PAT = (() => {
  const w = TAU * F_TONE, w2 = w * w, dw = -2 * DELTA * w;
  const kk = w * DSP.RHO_AIR * C * C;
  const pat = new Map();
  const d0 = w2 * w2 + dw * dw;
  pat.set('0,0', { p: 0, q: 0, re: (-w2 / V_ROOM) / d0, im: (-dw / V_ROOM) / d0 });
  for (const m of MODES) {
    if (m.f > 200) continue;
    const num = psi(m, SUB_R);
    if (Math.abs(num) < 1e-14) continue;
    const dr = m.w2 - w2, d = dr * dr + dw * dw;
    const key = `${m.p},${m.q}`;
    const e = pat.get(key) || { p: m.p, q: m.q, re: 0, im: 0 };
    e.re += num * m.invK * dr / d; e.im += num * m.invK * (-dw) / d;
    pat.set(key, e);
  }
  const list = [...pat.values()].map((e) => ({ p: e.p, q: e.q, re: -kk * e.im, im: kk * e.re }));
  list.sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im));
  return list.slice(0, NPAT);
})();
/** peak of the single-sub field over the floor, used to normalise the map */
const PAT_PEAK = (() => {
  let pk = 1e-30;
  for (let i = 0; i <= 148; i++) {
    for (let j = 0; j <= 180; j++) {
      const u = i / 148, v = j / 180;
      let sr = 0, si = 0;
      for (const e of PAT) {
        const g = Math.cos(Math.PI * e.p * u) * Math.cos(Math.PI * e.q * v);
        sr += e.re * g; si += e.im * g;
      }
      pk = Math.max(pk, Math.hypot(sr, si));
    }
  }
  return pk;
})();

// ---- camera -----------------------------------------------------------------
const FOV = 36, ASPECT = 1.6;
const TANV = Math.tan((FOV * Math.PI) / 360), TANH = TANV * ASPECT;
/** Bounding centre and radius of one subwoofer, pedestal included. */
const HERO = new THREE.Vector3(LAYOUT.subR.x, (PED_H + CAB) / 2, LAYOUT.subR.z);
const HERO_R = 0.54;
const BASE = frameShot([HERO.x, HERO.y, HERO.z], HERO_R,
  { fill: 0.46, az: 0.34, el: 0.235, fov: FOV });
const CAMV = new THREE.Vector3(...BASE.position);
const AXIS = new THREE.Vector3(), RIGHT = new THREE.Vector3(), UPC = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/**
 * Aim so the hero lands on a chosen pixel of the 1600×1000 frame. The Director
 * shifts the principal point to 0.40 of the width, i.e. to (640, 500), so the
 * hero sits right of centre in the safe box and the diagram gets the left half.
 * Solves h = (A + R·tx + U·ty)/|…| for the axis A by fixed-point iteration.
 */
const SHOT = (() => {
  const HX = 902, HY = 606;
  const h = HERO.clone().sub(CAMV);
  const dist = h.length();
  h.normalize();
  const tx = ((HX - 640) / 800) * TANH, ty = ((500 - HY) / 500) * TANV;
  const L = Math.sqrt(1 + tx * tx + ty * ty);
  AXIS.copy(h);
  for (let i = 0; i < 10; i++) {
    RIGHT.copy(AXIS).cross(WORLD_UP).normalize();
    UPC.copy(RIGHT).cross(AXIS).normalize();
    AXIS.copy(h).multiplyScalar(L).addScaledVector(RIGHT, -tx).addScaledVector(UPC, -ty).normalize();
  }
  RIGHT.copy(AXIS).cross(WORLD_UP).normalize();
  UPC.copy(RIGHT).cross(AXIS).normalize();
  const t = CAMV.clone().addScaledVector(AXIS, dist);
  return { position: BASE.position, target: [t.x, t.y, t.z], fov: FOV };
})();
/** World point that projects to pixel (px, py) at `dist` metres from the lens. */
function place(px, py, dist) {
  const nx = ((px - 640) / 800) * TANH, ny = ((500 - py) / 500) * TANV;
  return CAMV.clone()
    .addScaledVector(AXIS, dist)
    .addScaledVector(RIGHT, dist * nx)
    .addScaledVector(UPC, dist * ny);
}
function faceCam(g) {
  const d = CAMV.clone().sub(g.position);
  g.rotation.set(0, Math.atan2(d.x, d.z), 0);
  g.rotateX(-Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.62);
  return g;
}

// ---- the plan card ----------------------------------------------------------
const PLAN_W = 0.80;
const PLAN_H = PLAN_W * RM.D / RM.W;        // 0.973 m — true room aspect
const PLAN_PAD = 0.030;
const CARD_AT = [402, 392, 3.42];           // px, px, metres from the lens
/** room x,z → card-local metres (up on the card = toward the back wall) */
const mx = (x) => (x / RM.W) * PLAN_W;
const my = (z) => ((RM.z0 + RM.D / 2) - z) / RM.D * PLAN_H;

const dash = (n, col, wdt, op) => new DIAG.Trace(n, col, wdt,
  { dashed: true, dashSize: 0.030, gapSize: 0.024, opacity: op });

function roundedRect(sh, w, h, r) {
  const x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
}
let _coneMat = null, _surrMat = null, _ringMat = null;
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
    const S = this._s = { drivers: [], knobs: [], mix: 0, tNow: 0 };

    hardware.add(this._sub(LAYOUT.subL, S, true));
    hardware.add(this._sub(LAYOUT.subR, S, false));

    overlay.add(this._plan(S));
    this._labels(ctx, S);
    return { hardware, overlay };
  },

  // =========================================================================
  // hardware
  // =========================================================================
  _sub(P, S, isLeft) {
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
    // machined nameplate on the pedestal front
    const plate2 = new THREE.Mesh(GEO.bevelBox(0.086, 0.011, 0.0022, 0.0004, 2), M.alu);
    plate2.position.set(0, PED_H - 0.072, half + 0.0262);
    g.add(plate2);

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
    const flh = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 10), M.ledCyan.clone());
    flh.position.set(0, PED_H + 0.052, half + 0.0035);
    g.add(flh);
    S.drivers.push({ g: drv, led: flh, left: isLeft });
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
  // overlay — one card: the room in plan, with the field at the tone
  // =========================================================================
  _plan(S) {
    const wrap = new THREE.Group();
    wrap.position.copy(place(CARD_AT[0], CARD_AT[1], CARD_AT[2]));

    const card = DIAG.diagramCard(PLAN_W, PLAN_H, { opacity: 0.93, pad: PLAN_PAD });
    // diagramCard installs a group-level userData.setOpacity; DIAG.fadeTree
    // calls it and then still descends into the plate, capturing the already
    // scaled opacity as the mesh's base. Removing the hook lets the per-mesh
    // path own the fade, which is the one that survives a fade from zero.
    delete card.userData.setOpacity;
    card.position.set(-PLAN_W / 2, -PLAN_H / 2, -0.004);
    wrap.add(card);

    // ---- the field ---------------------------------------------------------
    const pat = new Float32Array(NPAT * 4);
    for (let i = 0; i < PAT.length; i++) {
      pat[i * 4] = PAT[i].p; pat[i * 4 + 1] = PAT[i].q;
      pat[i * 4 + 2] = PAT[i].re / PAT_PEAK; pat[i * 4 + 3] = PAT[i].im / PAT_PEAK;
    }
    const uni = {
      uPat: { value: pat },
      uMix: { value: 0 },
      uPh: { value: new THREE.Vector2(1, 0) },
      uOpacity: { value: 1 },
      uPos: { value: new THREE.Color(PAL.cy) },
      uNeg: { value: new THREE.Color(PAL.am) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        #define NPAT ${NPAT}
        #define LEVELS 6.0
        uniform vec4 uPat[NPAT];
        uniform float uMix;
        uniform vec2 uPh;
        uniform float uOpacity;
        uniform vec3 uPos;
        uniform vec3 uNeg;
        varying vec2 vUv;
        void main() {
          float u = vUv.x;              // rx / W
          float v = 1.0 - vUv.y;        // rz / D, back wall at the top of the card
          float sr = 0.0, si = 0.0;
          for (int i = 0; i < NPAT; i++) {
            float p = uPat[i].x;
            float par = mod(p, 2.0) < 0.5 ? 1.0 : -1.0;
            float g = (1.0 + uMix * par)
                    * cos(3.14159265 * p * u)
                    * cos(3.14159265 * uPat[i].y * v);
            sr += uPat[i].z * g;
            si += uPat[i].w * g;
          }
          float inst = sr * uPh.x - si * uPh.y;
          float env = sqrt(sr * sr + si * si);
          float m = clamp(0.45 * env + 0.55 * abs(inst), 0.0, 1.0);
          float lv = m * LEVELS;
          float band = floor(lv) / LEVELS;          // stepped choropleth fill
          float f = fract(lv);
          float edge = 1.0 - smoothstep(0.0, 0.10, min(f, 1.0 - f));
          vec3 base = inst >= 0.0 ? uPos : uNeg;
          float on = step(0.7, lv);                 // nothing drawn at the nodes
          vec3 rgb = base * (band * 0.46 + edge * 0.30 * on);
          gl_FragColor = vec4(rgb, uOpacity);
        }`,
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(PLAN_W, PLAN_H, 1, 1), mat);
    field.position.z = 0.0004;
    field.renderOrder = 4;
    field.userData.setOpacity = (o) => {
      uni.uOpacity.value = o;
      field.visible = o > 0.004;
    };
    wrap.add(field);
    S.uni = uni;

    // ---- room outline, nodal lines, markers --------------------------------
    const box = new DIAG.Trace(5, 0x8b939d, 1.3, { opacity: 0.7, renderOrder: 12 });
    const corners = [[-PLAN_W / 2, -PLAN_H / 2], [PLAN_W / 2, -PLAN_H / 2],
      [PLAN_W / 2, PLAN_H / 2], [-PLAN_W / 2, PLAN_H / 2], [-PLAN_W / 2, -PLAN_H / 2]];
    box.write((i) => [corners[i][0], corners[i][1], 0.002]);
    wrap.add(box);

    // Ψ₁₁₀ = 0 loci: the room's centre line and its mid-depth line
    const nx = new DIAG.Trace(2, PAL.gr, 1.7, { opacity: 0.95, renderOrder: 13 });
    nx.write((i) => [0, i ? PLAN_H / 2 : -PLAN_H / 2, 0.003]);
    const nz = new DIAG.Trace(2, PAL.gr, 1.7, { opacity: 0.95, renderOrder: 13 });
    nz.write((i) => [i ? PLAN_W / 2 : -PLAN_W / 2, 0, 0.003]);
    wrap.add(nx, nz);

    // λ/2 at 30 Hz, drawn to the plan's own scale
    const rul = DIAG.dimension(
      [mx(-LAM30 / 4), my(2.95), 0.004], [mx(LAM30 / 4), my(2.95), 0.004],
      { color: PAL.cy, width: 1.7, head: 0.020 });
    delete rul.userData.setOpacity;      // see the diagramCard note above
    wrap.add(rul);

    // the two subwoofers
    S.marks = [];
    for (const [P, left] of [[SUB_L, true], [SUB_R, false]]) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.011, 0.017, 28),
        new THREE.MeshBasicMaterial({
          color: PAL.cy, transparent: true, opacity: 1, toneMapped: false,
          depthWrite: false, side: THREE.DoubleSide,
        }));
      r.position.set(mx(P.x), my(P.z), 0.005);
      r.renderOrder = 14;
      wrap.add(r);
      S.marks.push({ m: r, left });
    }
    // the sofa, five seats
    for (const x of SOFA_X) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 14),
        new THREE.MeshBasicMaterial({
          color: PAL.am, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false,
        }));
      d.position.set(mx(x), my(SEAT.z), 0.005);
      d.renderOrder = 14;
      wrap.add(d);
    }

    // label anchors
    S.aTitle = new THREE.Object3D(); S.aTitle.position.set(0, PLAN_H / 2 + PLAN_PAD, 0.01);
    S.aRule = new THREE.Object3D(); S.aRule.position.set(mx(LAM30 / 4), my(2.95), 0.01);
    S.aNode = new THREE.Object3D(); S.aNode.position.set(0, my(SEAT.z), 0.01);
    wrap.add(S.aTitle, S.aRule, S.aNode);

    return faceCam(wrap);
  },

  // =========================================================================
  _labels(ctx, S) {
    const L = ctx.labels;
    S.lab = {};
    S.lab.sub = L.add(new THREE.Vector3(LAYOUT.subR.x, PED_H + CAB + 0.10, LAYOUT.subR.z), {
      kicker: `Sealed 380 mm · ${(VB * 1000).toFixed(0)} L · ${M_TOTAL.toFixed(0)} kg`,
      text: `f₃ ${F3.toFixed(1)} Hz · 12 dB/oct · drive ${SPL_REF} dB @ 1 m<br>`,
      value: '', cls: 'am', offset: [0, -18], priority: 3,
    });
    S.lab.plan = L.add(S.aTitle, {
      kicker: `Room in plan · ${RM.W} × ${RM.D} m · floor level`,
      text: `pressure at ${F_TONE.toFixed(2)} Hz, shown at 1 : 50<br>`,
      value: '', cls: 'acc', offset: [0, -20], occlude: false, priority: 2,
    });
    S.lab.node = L.add(S.aNode, {
      kicker: 'Ψ₁₁₀ = 0', text: 'the sofa sits on the centre line',
      cls: 'plain', offset: [8, 30], occlude: false, priority: 1,
    });
    S.lab.rul = L.add(S.aRule, {
      kicker: 'λ/2 at 30 Hz', value: `${(LAM30 / 2).toFixed(2)} m`,
      cls: 'acc', offset: [46, 4], occlude: false, priority: 0,
    });
  },

  // =========================================================================
  update(dt, t) {
    const S = this._s;
    if (!S || !S.uni) return;
    S.tNow = t;

    // 30.019 Hz at timeScale 0.02 → 0.60 Hz on screen, i.e. 1 : 50
    const ph = TAU * F_TONE * t;
    const cs = Math.cos(ph), sn = Math.sin(ph);
    S.uni.uPh.value.set(cs, sn);

    // slow A/B: the left sub's level ramps 0 → 1 → 0 (period 0.32 sim seconds)
    const P = 0.32;
    const u = (((t % P) + P) % P) / P;
    const mix = DSP.smoothstep(0.42, 0.56, u) - DSP.smoothstep(0.94, 1.0, u);
    S.mix = mix;
    S.uni.uMix.value = mix;

    // cones at true-scale excursion; the left one only plays at level `mix`
    const x = X_PK * cs;
    for (const d of S.drivers) {
      const lv = d.left ? mix : 1;
      d.g.position.z = CAB / 2 - 0.0055 + x * lv;
      d.led.material.color.setRGB(0.388 * lv + 0.02, 0.784 * lv + 0.03, 0.961 * lv + 0.05);
    }
    for (const m of S.marks) m.m.material.opacity = m.left ? 0.18 + 0.82 * mix : 1;
    for (const k of S.knobs) k.rotation.z = -1.25 + 2.4 * mix;

    const both = mix > 0.5;
    S.lab.sub.setValue(`x ${(x * 1000).toFixed(2)} mm of ${(XMAX * 1000).toFixed(0)} peak`);
    S.lab.plan.setValue(both
      ? `both subs — Ψ₁₁₀ sums to 0.000`
      : `right sub alone — Ψ₁₁₀ = ${PSI_R.toFixed(3)}`);
  },

  // =========================================================================
  content() {
    const n = (v) => `<span class="num">${v}</span>`;
    return `
<p>One wavelength at ${n('30 Hz')} is ${n(LAM30.toFixed(2) + ' m')}; the room's longest
straight line, corner to corner, is ${n(DIAG3D.toFixed(2) + ' m')}. No point in the room is
more than half a wavelength from a wall, so the steady state is not a travelling wave but a
standing pattern fixed by the boundaries. At ${n('2 kHz')} λ is
${n((LAM2K * 1000).toFixed(0) + ' mm')} and the room is acoustically large.</p>

<div class="key"><span class="lab">The idea</span><p>Below Schroeder the room is a resonator
with a fixed geography of loud and quiet places. A source excites a mode by where it stands,
not by how well it is made.</p></div>

<h3>The modes are arithmetic</h3>
<div class="eq">f = <span class="hl">c/2</span> · √( (p/W)² + (q/D)² + (r/H)² )
<span class="c">W ${RM.W} · D ${RM.D} · H ${RM.H} m · c ${C} m/s</span>
<span class="c">axial </span>${AXIALS.map((f) => f.toFixed(2)).join('  ')} Hz
δ = 3·ln10/RT60 = ${DELTA.toFixed(1)} s⁻¹</div>
<p>Sabine with ᾱ = ${n(ABAR)} over ${n(S_ROOM.toFixed(1) + ' m²')} gives RT60
${n(RT60.toFixed(2) + ' s')}, so 2000·√(RT60/V) puts Schroeder at
${n(F_SCH.toFixed(0) + ' Hz')}: every subwoofer frequency is below it, discrete resonances
rather than statistics. 30 Hz falls within
${n((100 * Math.abs(F_TONE - 30) / 30).toFixed(2) + '%')} of the first tangential mode
${n('(1,1,0)')} at ${n(F_TONE.toFixed(2) + ' Hz')}. The plan sums the ${NPAT} strongest floor
patterns at that frequency; ${n('(1,1,0)')} carries most of it. Walls here are rigid — real
ones absorb more at 20 Hz, so the peaks are gentler.</p>

<h3>The box</h3>
<div class="eq">Vas ${(TS.Vas * 1000).toFixed(0)} L / Vb ${(VB * 1000).toFixed(0)} L → α ${ALIGN.alpha.toFixed(2)}
fc = fs·√(α+1) = <span class="hl">${ALIGN.fc.toFixed(1)} Hz</span> · Qtc ${ALIGN.Qtc.toFixed(2)}
f₃ ${F3.toFixed(1)} Hz, <span class="hl">12 dB/oct</span> <span class="c">— sealed is 2nd order</span>
${SPL_REF} dB @ 1 m half space → x̂ ${(X_PK * 1000).toFixed(2)} mm
Û = Sd·ω·x̂ = ${(Q_PK * 1000).toFixed(1)} L/s peak</div>

<h3>Why two</h3>
<p>Each sub stands ${n(SUB_OFF.toFixed(2) + ' m')} off the centre line, where Ψ₁₁₀ meets them
equal and opposite: ${n(PSI_R.toFixed(3))} and ${n(PSI_L.toFixed(3))}. Their sum drives the
mode with no net force, and it is never excited — watch the quadrants collapse as the second
comes up.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>Two subwoofers do not flatten
the response at one seat. Computed here, 20–80 Hz peak-to-peak at the central seat is
${n(ENV1.pp.toFixed(1) + ' dB')} with one and ${n(ENV2.pp.toFixed(1) + ' dB')} with two, and
the pair adds a flat ${n('6.02 dB')}: a centre-line seat is already blind to every odd
lateral mode. What collapses is the disagreement <em>between</em> seats,
${n(ENV1.spread.toFixed(1) + ' dB')} to ${n(ENV2.spread.toFixed(1) + ' dB')} — the prize,
because one equalisation then serves them all.</p></div>`;
  },

  readouts() {
    const S = this._s || {};
    const both = (S.mix ?? 0) > 0.5;
    const x = X_PK * Math.cos(TAU * F_TONE * (S.tNow || 0));
    return [
      { k: 'MODE (1,1,0)', v: F_TONE.toFixed(2), u: 'Hz', cls: 'acc' },
      { k: 'DRIVE, 1 m', v: SPL_REF.toFixed(0), u: 'dB', cls: 'am' },
      { k: 'CONE x', v: (x * 1000).toFixed(2), u: 'mm', cls: '', bar: Math.abs(x) / XMAX },
      { k: 'SEAT SPL', v: (both ? SPL_TWO : SPL_ONE).toFixed(1), u: 'dB', cls: '', bar: Math.abs(Math.cos(TAU * F_TONE * (S.tNow || 0))) },
      { k: 'SEAT SPREAD', v: (both ? ENV2.spread : ENV1.spread).toFixed(1), u: 'dB', cls: 'am' },
      { k: 'SCHROEDER', v: F_SCH.toFixed(0), u: 'Hz', cls: 'acc' },
    ];
  },
};
