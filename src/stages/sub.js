import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { ROOM, XOVER } from '../core/spec.js';

/* ===========================================================================
   BASS & THE ROOM
   ---------------------------------------------------------------------------
   One hero — the right subwoofer, three-quarter — and one card: the room drawn
   in plan at 1 m grid with the pressure field at the demonstration tone painted
   on it, under a slightly convex clear panel so the studio's front strip sweeps
   across the map the way it would across a real backlit display.

   Room model — rigid-walled rectangular modal expansion:
     p(r,w) = jwp0c²Q · Sum_n Psi_n(rs)·Psi_n(r) / [K_n·(w_n² - w² - 2jdw)]
     Psi_n = cos(p·pi·x/W)·cos(q·pi·z/D)·cos(r·pi·y/H),  K_n = V / 2^(non-zero)
     d     = 3·ln10/RT60   (amplitude decay giving 60 dB in RT60)
   The (0,0,0) term is kept: it is the uniform pressurisation that dominates
   below the first axial resonance.

   PRIMARIES. The room's dimensions and its RT60 come from src/core/spec.js so
   that this chapter and the air chapter describe the same room. The subwoofer's
   own Thiele-Small set is CHOSEN here and is a different driver from spec's
   DRIVER (the 220 mm mid-bass in the floorstander); everything downstream of it
   — alignment, excursion, volume velocity, seat SPL — is derived, and the drive
   level that sets the scale is printed on screen rather than buried.
   =========================================================================== */

const C = DSP.C_SOUND_20C;                 // 343.2 m/s, dry air at 20 degC
const TAU = DSP.TAU;

// ---- the room ---------------------------------------------------------------
// LAYOUT.room and spec ROOM are the same three numbers (7.4 x 9.0 x 3.1 m);
// geometry has to agree with the scene, so the dimensions are read from LAYOUT
// and cross-checked against spec, while RT60 — which only exists in spec — is
// taken from there. Everything acoustic below follows from those four.
const RM = { W: LAYOUT.room.w, D: LAYOUT.room.d, H: LAYOUT.room.h, z0: LAYOUT.room.wallZ };
if (Math.abs(RM.W - ROOM.W) + Math.abs(RM.D - ROOM.D) + Math.abs(RM.H - ROOM.H) > 1e-9) {
  throw new Error('sub.js: LAYOUT.room disagrees with spec.ROOM');
}
const V_ROOM = RM.W * RM.D * RM.H;                                   // 206.46 m³
const S_ROOM = 2 * (RM.W * RM.D + RM.W * RM.H + RM.D * RM.H);        // 234.88 m²
const RT60 = ROOM.rt60;                                              // 0.42 s — the primary
/** Mean absorption implied by that RT60, inverting Sabine: a = 0.161·V/(S·T). */
const ABAR = (0.161 * V_ROOM) / (S_ROOM * RT60);
const F_SCH = DSP.schroeder(RT60, V_ROOM);
const DELTA = 3 * Math.LN10 / RT60;         // amplitude decay constant, s⁻¹
const DIAG3D = Math.hypot(RM.W, RM.D, RM.H);   // 12.06 m — the longest straight line

const rx = (x) => x + RM.W / 2;             // room-local coords, corner origin
const rz = (z) => z - RM.z0;

const axial = (p, q, r) => DSP.roomMode(p, q, r, RM.W, RM.D, RM.H);
const F_T11 = axial(1, 1, 0);   // 30.02 Hz — the first tangential mode, and the
                                // demonstration tone: 30 Hz lands on it to 0.08 %
const AXIALS = [axial(0, 1, 0), axial(1, 0, 0), axial(0, 2, 0), axial(2, 0, 0)];

// ---- the subwoofer ----------------------------------------------------------
const CAB = 0.50;                           // external cube edge
const WALL = 0.030;
const PED_H = 0.245;                        // machined pedestal
const M_PANEL = (CAB ** 3 - (CAB - 2 * WALL) ** 3) * 750;   // 30 mm MDF @ 750 kg/m³
const M_TOTAL = M_PANEL + 12 + 8 + 6 + 3;   // + driver, plate amp, bracing, trim
const VB = (CAB - 2 * WALL) ** 3 - 0.008;   // net internal volume, 77 L

/** The moving assembly AS DRAWN. Sd is derived from the drawn radii rather than
 *  typed, so the geometry on screen and the arithmetic in the panel agree. */
const CONE_R = 0.1700;                      // m, outer radius of cone + surround
const SURR_W = 0.0340;                      // m, roll-surround width
const SD = Math.PI * (CONE_R - SURR_W / 2) ** 2;   // 0.0735 m² — 306 mm effective
const FRAME_R = 0.2000;                     // m, trim-flange outer radius (400 mm)
const XMAX = 0.019;                         // m, one-way linear excursion
/** The two diameters a driver actually has, both derived from the drawn radii.
 *  Nominal is what a catalogue prints; effective is what moves air, and it is
 *  the one every acoustic number below is computed from. */
const D_NOM = 2 * CONE_R;                            // 0.340 m, cone + surround
const D_EFF = 2 * Math.sqrt(SD / Math.PI);           // 0.306 m, effective piston
/** Where the moving assembly's rest plane sits relative to the front face, and
 *  the flange that laps over the roll's outer edge. The flange's inner radius
 *  is INSIDE CONE_R on purpose: a trim ring that stops short of the surround
 *  leaves a sight-line down the lacquer bore, and a 172 mm mirrored cylinder
 *  seen end-on is what was reading as a chrome torus around the driver. */
const DRV_Z = CAB / 2 - 0.0135;                      // rest plane of the cone
const RING_IN = CONE_R - 0.0010;                     // 0.1690 m, laps the roll
const RING_Z = CAB / 2 + 0.0090;                     // flange mid-plane

/** CHOSEN: this chapter's driver. Not spec.DRIVER — that is the 220 mm mid-bass
 *  in the floorstander. A 340 mm sealed subwoofer unit, Sd 306 mm effective. */
const SUB_TS = { fs: 16, Qts: 0.42, Vas: 0.220 };
const ALIGN = DSP.sealedAlignment(SUB_TS, VB);
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
const SUB_L = subPt(LAYOUT.subL);           // exact mirror of SUB_R in x
const SEAT = new THREE.Vector3(LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z);

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

/** Mode shape evaluated once at a point — the whole cost of the model. */
const shapeAt = (P) => Float64Array.from(MODES, (m) => psi(m, P));
const SH_R = shapeAt(SUB_R);
const SH_L = shapeAt(SUB_L);
const SH_SEAT = shapeAt(SEAT);
/** Source coupling for the right sub at unit level and the left at `mix`. */
const coupling = (mix) => Float64Array.from(SH_R, (v, i) => v + mix * SH_L[i]);

/**
 * Room transfer function: pressure (Pa) per unit peak volume velocity (m³/s),
 * returned as [re, im]. Linear in the source coupling, which is what lets the
 * A/B between one sub and two be exact rather than re-solved.
 */
function green(f, coupS, wSum, shR) {
  const w = TAU * f, w2 = w * w, dw = -2 * DELTA * w;
  let re = 0, im = 0;
  {                                        // uniform (0,0,0) pressurisation
    const d = w2 * w2 + dw * dw, n = wSum / V_ROOM;
    re += n * (-w2) / d; im += n * (-dw) / d;
  }
  for (let i = 0; i < MODES.length; i++) {
    const s = coupS[i];
    if (s === 0) continue;
    const m = MODES[i];
    const num = s * shR[i] * m.invK;
    const dr = m.w2 - w2, d = dr * dr + dw * dw;
    re += num * dr / d; im += num * (-dw) / d;
  }
  const k = w * DSP.RHO_AIR * C * C;
  return [-k * im, k * re];                // × j
}
/** Half-space free-field monopole reference, same units. */
function freeField(f, rcv, mix) {
  const w = TAU * f, a = w * DSP.RHO_AIR / (2 * Math.PI);
  let re = 0, im = 0;
  for (const [s, g] of [[SUB_R, 1], [SUB_L, mix]]) {
    if (!g) continue;
    const r = s.distanceTo(rcv), ph = -w * r / C + Math.PI / 2;
    re += g * (a / r) * Math.cos(ph); im += g * (a / r) * Math.sin(ph);
  }
  return [re, im];
}

// ---- seat-to-seat spread, 20-80 Hz ------------------------------------------
const FG = DSP.logSpace(15, 200, 200);
const SOFA_X = [-0.85, -0.425, 0, 0.425, 0.85];
const SOFA = SOFA_X.map((x) => new THREE.Vector3(x, SEAT.y, SEAT.z));
const SH_SOFA = SOFA.map(shapeAt);
const SMOOTH_N = 6;                         // 1/6-octave, how a measurement is read
const SMOOTH_IX = (() => {                  // which bins fall in each 1/6-oct window
  const k = Math.pow(2, 1 / (2 * SMOOTH_N));
  return Array.from(FG, (f) => {
    const ix = [];
    for (let j = 0; j < FG.length; j++) if (FG[j] >= f / k && FG[j] <= f * k) ix.push(j);
    return ix;
  });
})();
const BAND_IX = Array.from(FG, (f, i) => i).filter((i) => FG[i] >= 20 && FG[i] <= 80);
function envelope(mix) {
  const coupS = coupling(mix), wSum = 1 + mix;
  const per = SH_SOFA.map((sh, s) => {
    const raw = FG.map((f) => DSP.dB(DSP.cAbs(green(f, coupS, wSum, sh)))
      - DSP.dB(DSP.cAbs(freeField(f, SOFA[s], mix))));
    return SMOOTH_IX.map((ix) => ix.reduce((a, j) => a + raw[j], 0) / ix.length);
  });
  const spread = BAND_IX.reduce(
    (a, i) => a + Math.max(...per.map((p) => p[i])) - Math.min(...per.map((p) => p[i])), 0
  ) / BAND_IX.length;
  const mid = BAND_IX.map((i) => per[2][i]);
  return { spread, pp: Math.max(...mid) - Math.min(...mid) };
}
/** Spread and centre-seat peak-to-peak across the fade, 0.1 steps, interpolated
 *  for the readout. The underlying curve is smooth; 11 points resolve it. */
const ENV_TAB = Array.from({ length: 11 }, (_, i) => envelope(i / 10));
const ENV1 = ENV_TAB[0], ENV2 = ENV_TAB[10];
const envAt = (mix) => {
  const u = DSP.clamp(mix, 0, 1) * 10, i = Math.min(9, Math.floor(u)), f = u - i;
  return DSP.lerp(ENV_TAB[i].spread, ENV_TAB[i + 1].spread, f);
};

// ---- demonstration tone: the first tangential mode --------------------------
const F_TONE = F_T11;
const X_PK = DSP.excursionForSpl(SPL_REF, F_TONE, SD, 1);   // 4.85 mm peak
const Q_PK = SD * TAU * F_TONE * X_PK;                      // 78.3 L/s peak
const psi110 = (P) => Math.cos(Math.PI * rx(P.x) / RM.W) * Math.cos(Math.PI * rz(P.z) / RM.D);
const PSI_R = psi110(SUB_R);
const PSI_L = psi110(SUB_L);                // = −PSI_R, exactly
/** Seat pressure at the tone is linear in the left sub's level, so both halves
 *  are solved once and combined per frame. */
const G_SEAT_R = green(F_TONE, SH_R, 1, SH_SEAT);
const G_SEAT_L = green(F_TONE, SH_L, 1, SH_SEAT);
const seatSpl = (mix) => DSP.splFromPa(
  Math.hypot(G_SEAT_R[0] + mix * G_SEAT_L[0], G_SEAT_R[1] + mix * G_SEAT_L[1])
  * Q_PK / Math.SQRT2);
const SPL_ONE = seatSpl(0);
const SPL_TWO = seatSpl(1);                 // exactly SPL_ONE + 6.021 dB
const LAM30 = DSP.lambda(30, C);
const SUB_OFF = Math.abs(SUB_R.x);              // 2.84 m off the centre line

/**
 * The floor field, decomposed by (p,q).
 *
 * At y = 0 every vertical index contributes cos(0) = 1, so the shape of the
 * field on the floor depends only on (p,q); modes sharing a floor pattern can
 * be summed once. The pair is not a separate field: the left sub is the exact
 * mirror of the right in x, so its modal coupling is (−1)^p times the right
 * one's and a second sub at level `mix` scales every term by (1 + mix·(−1)^p).
 * Exact, and it makes the odd-p terms vanish when the pair is level-matched.
 */
const NPAT = 18;
const PAT = (() => {
  const w = TAU * F_TONE, w2 = w * w, dw = -2 * DELTA * w;
  const kk = w * DSP.RHO_AIR * C * C;
  const pat = new Map();
  const d0 = w2 * w2 + dw * dw;
  pat.set('0,0', { p: 0, q: 0, re: (-w2 / V_ROOM) / d0, im: (-dw / V_ROOM) / d0 });
  for (let i = 0; i < MODES.length; i++) {
    const m = MODES[i];
    if (m.f > 200) continue;
    const num = SH_R[i];
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
/** Peak of the floor field, taken over BOTH ends of the A/B so the contour
 *  interval is one fixed number of pascals for the whole animation. */
const PAT_PEAK = (() => {
  let pk = 1e-30;
  for (const mix of [0, 1]) {
    for (let i = 0; i <= 148; i++) {
      for (let j = 0; j <= 180; j++) {
        const u = i / 148, v = j / 180;
        let sr = 0, si = 0;
        for (const e of PAT) {
          const g = (1 + mix * (e.p % 2 ? -1 : 1))
            * Math.cos(Math.PI * e.p * u) * Math.cos(Math.PI * e.q * v);
          sr += e.re * g; si += e.im * g;
        }
        pk = Math.max(pk, Math.hypot(sr, si));
      }
    }
  }
  return pk;
})();
const LEVELS = 6;
/** Full-scale and per-contour pressure amplitude on the floor map, in pascals. */
const P_FS = PAT_PEAK * Q_PK;
const P_BAND = P_FS / LEVELS;
const SPL_FS = DSP.splFromPa(P_FS / Math.SQRT2);

// ---- camera -----------------------------------------------------------------
const FOV = 36, ASPECT = 1.6;
const TANV = Math.tan((FOV * Math.PI) / 360), TANH = TANV * ASPECT;
/** Bounding centre and radius of one subwoofer, pedestal included. */
const HERO = new THREE.Vector3(LAYOUT.subR.x, (PED_H + CAB) / 2, LAYOUT.subR.z);
const HERO_R = 0.54;
const BASE = frameShot([HERO.x, HERO.y, HERO.z], HERO_R,
  { fill: 0.77, az: 0.34, el: 0.225, fov: FOV });
const CAMV = new THREE.Vector3(...BASE.position);
const AXIS = new THREE.Vector3(), RIGHT = new THREE.Vector3(), UPC = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/**
 * Aim so the hero lands on a chosen pixel of the 1600x1000 frame. The Director
 * shifts the principal point to 0.40 of the width, i.e. to (640, 500).
 *
 * The hero goes on the LEFT of the safe box and the card on the right, beside
 * the panel. That is not only a reading order — the right floorstander sits
 * 29 degrees to the left of this subwoofer as seen from any camera that frames
 * it, so putting the hero right drags a second stage's blown-out cabinet into
 * the left edge of every frame. Putting the hero left swings it 35 degrees off
 * the axis and out of shot, and leaves the far right corner of the room, which
 * is empty, behind the card.
 *
 * Solves h = (A + R·tx + U·ty)/|…| for the axis A by fixed-point iteration.
 */
const SHOT = (() => {
  const HX = 416, HY = 570;
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
const CARD_AT = [888, 432, 2.50];           // px, px, metres from the lens
const PLAN_H = 0.687;                       // ~423 px tall at that distance
const PLAN_W = PLAN_H * RM.W / RM.D;        // true room aspect
const PLAN_PAD = 0.028;
/** room x,z → card-local metres (up on the card = toward the back wall) */
const mx = (x) => (x / RM.W) * PLAN_W;
const my = (z) => ((RM.z0 + RM.D / 2) - z) / RM.D * PLAN_H;

function roundedRect(sh, w, h, r) {
  const x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
}

let _coneMat = null, _surrMat = null, _dustMat = null;
let _ringMat = null, _baffMat = null, _glassMat = null, _fastMat = null, _lacMat = null;
let _trimMat = null, _hwGlass = null, _meterMat = null;
/**
 * The cabinet lacquer. Same albedo as mats().pianoBlack — nothing here is
 * lighter than it should be — but a stronger environment term and a tighter
 * clearcoat, so the widened front strip lays a full bright-to-mid ramp down the
 * cheek instead of leaving a 500 mm face at one flat value.
 */
function LACQUER() {
  if (!_lacMat) {
    _lacMat = mats().pianoBlack.clone();
    // Clearcoat roughness deliberately off the library's 0.028: a perfect
    // uniform clearcoat mirrors a softbox as a decal-sharp rectangle, and real
    // lacquer has enough orange-peel that the highlight breaks up and ramps
    // over its own length.
    _lacMat.clearcoatRoughness = 0.052;
    _lacMat.envMapIntensity = 1.30;
  }
  return _lacMat;
}
/**
 * Woven-composite cone. The map is mats().coneWeave's own weave, kept rather
 * than dropped: a 340 mm cone rendered as a bare lathe is a grey gradient with
 * nothing in it that says what it is made of, and the weave is the one cue that
 * gives the disc a surface. The albedo is carried in `color` because the weave
 * map multiplies down to near-black on its own.
 */
function CONE_MAT() {
  if (!_coneMat) {
    _coneMat = mats().coneWeave.clone();
    _coneMat.color.setHex(0xcdd6e2);
    _coneMat.metalness = 0.0;
    _coneMat.roughness = 0.66;
    _coneMat.clearcoat = 0.22;
    _coneMat.clearcoatRoughness = 0.46;
    _coneMat.envMapIntensity = 0.42;
    _coneMat.sheen = 0.22;
    _coneMat.sheenRoughness = 0.92;
    _coneMat.sheenColor = new THREE.Color(0x2f353d);
  }
  return _coneMat;
}
/**
 * Roll surround. A 17 mm rubber roll is MATTE — it is the one part of a
 * loudspeaker that never has a specular highlight on it. The previous sheen of
 * 1.0 at sheenRoughness 0.52 mirrored the studio's front strip as a banded
 * chrome torus that was the brightest thing in the frame; that is a material
 * category error, not a lighting one.
 */
function SURR_MAT() {
  if (!_surrMat) {
    _surrMat = mats().rubber.clone();
    /* DOUBLE-SIDED, AND THIS IS THE WHOLE BUG.
     * A half-roll surround is a lathe whose profile turns back on itself: past
     * the crown the radius still grows but the height falls, so LatheGeometry's
     * normal (dy, −dx) flips sign and the outer half of the roll becomes
     * back-facing. Against a FrontSide material it is silently culled, and what
     * the camera sees in its place is the clearcoated lacquer bore behind it —
     * a 180 mm black mirror that sweeps the whole studio into a few
     * millimetres. That is the "mirror-chrome torus with a blown white
     * specular arc": not a material choice at all, a hole in the mesh. */
    _surrMat.side = THREE.DoubleSide;
    _surrMat.color.setHex(0x1c1f24);
    _surrMat.roughness = 0.86;
    _surrMat.sheen = 0.42;
    _surrMat.sheenRoughness = 0.90;
    _surrMat.sheenColor = new THREE.Color(0x424954);
    _surrMat.envMapIntensity = 0.46;
  }
  return _surrMat;
}
/** Coated dust cap — one tone up from the cone and matte, so the centre of the
 *  driver separates without turning into a polished ball bearing. */
function DUST_MAT() {
  if (!_dustMat) {
    _dustMat = mats().cone.clone();
    _dustMat.color.setHex(0x1f2328);
    _dustMat.roughness = 0.72;
    _dustMat.clearcoat = 0.32;
    _dustMat.clearcoatRoughness = 0.28;
    _dustMat.sheen = 0.24;
    _dustMat.sheenRoughness = 0.90;
    _dustMat.sheenColor = new THREE.Color(0x333941);
    _dustMat.envMapIntensity = 0.62;
  }
  return _dustMat;
}
/** Fasteners. Plain steel at roughness 0.20 returns a clipped white square at
 *  this scale; these are darker and rougher so they read as heads, not stars. */
function FAST_MAT() {
  if (!_fastMat) {
    _fastMat = mats().steel.clone();
    _fastMat.color.setHex(0x5c6169);
    _fastMat.roughness = 0.56;
    _fastMat.envMapIntensity = 0.30;
  }
  return _fastMat;
}
/**
 * Diamond-turned alloy trim: the one bright element on an otherwise black
 * cabinet. Built from mats().aluTrim, not mats().alu — alu carries a brushed
 * normal map and anisotropy 0.72, and on a lathe with circumferential tangents
 * those smear the softbox into horizontal bars. aluTrim has neither, so the
 * flange returns one clean sweep that ramps across its own width.
 */
function RING_MAT() {
  if (!_ringMat) {
    _ringMat = mats().aluTrim.clone();
    _ringMat.color.setHex(0xa8afb8);
    _ringMat.roughness = 0.34;
    _ringMat.envMapIntensity = 1.15;
  }
  return _ringMat;
}
/** Satin machined trim: the plinth reveal, the fascia, the knob bodies. Darker
 *  than the flange so the driver keeps the one bright ring. */
function TRIM() {
  if (!_trimMat) {
    _trimMat = mats().aluTrim.clone();
    _trimMat.color.setHex(0x62676e);
    _trimMat.roughness = 0.58;
    _trimMat.envMapIntensity = 0.36;
  }
  return _trimMat;
}
/**
 * THE SPECULAR LAYER over the fascia meter — the hardware twin of GLASS_MAT
 * below. A lit segment meter with nothing in front of it is a decal; a real one
 * sits behind cover glass that carries the room. Separate material from the
 * card's so the overlay fade cannot take the hardware's reflection with it.
 */
function HW_GLASS() {
  if (!_hwGlass) {
    _hwGlass = mats().glass.clone();
    _hwGlass.color.setHex(0x000000);
    _hwGlass.roughness = 0.84;
    _hwGlass.clearcoat = 1.0;
    _hwGlass.clearcoatRoughness = 0.075;
    _hwGlass.envMapIntensity = 0.62;
    _hwGlass.transparent = true;
    _hwGlass.blending = THREE.AdditiveBlending;
    _hwGlass.depthWrite = false;
  }
  return _hwGlass;
}
/** Excursion-meter segments. Deliberately well under the bloom threshold: this
 *  is a backlit LCD segment, not a light source. */
function METER_MAT() {
  if (!_meterMat) {
    _meterMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  }
  return _meterMat;
}
/** Bead-blasted baffle. Dark enough that the warm kicker cannot tint it. */
function BAFFLE_MAT() {
  if (!_baffMat) {
    _baffMat = mats().anodBlack.clone();
    _baffMat.color.setHex(0x24272c);
    _baffMat.roughness = 0.50;
    _baffMat.envMapIntensity = 1.05;
  }
  return _baffMat;
}
/**
 * THE SPECULAR LAYER over the plan card.
 *
 * A lit map with nothing in front of it reads as a decal. Real backlit glass
 * carries the reflection of the room it stands in, and because the panel is
 * very slightly convex that reflection is a soft band that sweeps rather than a
 * hard rectangle. Black base colour plus additive blending means only the
 * specular term is added, so the map underneath keeps its values.
 */
function GLASS_MAT() {
  if (!_glassMat) {
    _glassMat = mats().glass.clone();
    _glassMat.color.setHex(0x000000);
    // One reflecting layer, not two. Base roughness is pushed right up so the
    // substrate adds no broad haze — at 0.30 it laid an even grey wash over the
    // whole map and read as fog — and the clearcoat alone carries a sharp
    // enough reflection to resolve the studio's front strip as a band.
    _glassMat.roughness = 0.86;
    _glassMat.clearcoat = 1.0;
    _glassMat.clearcoatRoughness = 0.115;
    _glassMat.envMapIntensity = 0.38;
    _glassMat.transparent = true;
    _glassMat.opacity = 1;
    _glassMat.blending = THREE.AdditiveBlending;
    _glassMat.depthWrite = false;
  }
  return _glassMat;
}
/**
 * A plane bowed a few millimetres out of flat, so a reflection ramps over it.
 * Bowed about the VERTICAL axis only. Bowing both axes makes a lens: it
 * collects a large soft source into a small blown disc. A cylindrical bow
 * rotates the normal along one axis only, which smears the source into the
 * broad vertical band a real curved cover glass shows.
 */
function convexPanel(w, h, bulge, seg = 24) {
  const g = new THREE.PlaneGeometry(w, h, seg, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2);
    p.setZ(i, bulge * (1 - u * u));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
/**
 * The moving assembly, drawn here rather than borrowed, so that every radius on
 * screen is one of the radii the chapter's arithmetic uses: cone wall to
 * CONE_R − SURR_W, a true half-torus roll of section SURR_W/2 out to CONE_R,
 * and a shallow spherical dust cap. Sd is computed from these same numbers.
 */
function movingAssembly() {
  const g = new THREE.Group();
  const rc = CONE_R - SURR_W;               // 0.136 m, cone/surround junction
  const rd = 0.062;                         // dust-cap radius
  const dep = 0.078;                        // cone depth at the cap
  const cp = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    cp.push(new THREE.Vector2(rd + (rc - rd) * t, -dep * Math.pow(1 - t, 1.28)));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(cp, 128), CONE_MAT()));
  const sp = [];
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI * (i / 22);
    sp.push(new THREE.Vector2(rc + (SURR_W / 2) * (1 - Math.cos(a)),
      Math.sin(a) * SURR_W * 0.50));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(sp, 128), SURR_MAT()));
  const A = 0.92, dp = [];                  // 53° of arc: a cap, not a dome
  for (let i = 0; i <= 16; i++) {
    const a = A * (1 - i / 16);
    dp.push(new THREE.Vector2((Math.sin(a) / Math.sin(A)) * rd,
      -dep + ((Math.cos(a) - Math.cos(A)) / (1 - Math.cos(A))) * 0.019));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(dp, 96), DUST_MAT()));
  return g;
}
/** Flat annulus with generous broken edges and a shallow cone on the top face,
 *  so the highlight crosses it as a gradient rather than sitting on it. */
function ringLathe(rIn, rOut, t, b = 0.0030) {
  const dip = 0.0016;
  const p = [
    new THREE.Vector2(rIn, -t / 2), new THREE.Vector2(rIn, t / 2 - b - dip),
    new THREE.Vector2(rIn + b, t / 2 - dip), new THREE.Vector2(rOut - b, t / 2),
    new THREE.Vector2(rOut, t / 2 - b), new THREE.Vector2(rOut, -t / 2 + b),
    new THREE.Vector2(rOut - b, -t / 2), new THREE.Vector2(rIn + b, -t / 2),
    new THREE.Vector2(rIn, -t / 2),
  ];
  const g = new THREE.LatheGeometry(p, 72);
  g.computeVertexNormals();
  return g;
}

// ===========================================================================
export default {
  id: 'sub',
  title: 'Bass &amp; the Room',
  nav: 'Subwoofers',
  kicker: 'Subwoofers',
  standfirst: 'Below 90 Hz this room is a resonator. It decides what you hear.',
  shot: SHOT,
  timeScale: 0.02,
  alwaysUpdate: false,

  // -------------------------------------------------------------------------
  build(ctx) {
    const hardware = new THREE.Group();
    const overlay = new THREE.Group();
    const S = this._s = { drivers: [], knobs: [], mix: 0, tNow: 0, x: 0 };

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

    // ---- pedestal, reveal and feet -----------------------------------------
    // The pedestal is the plate-amplifier enclosure: the cabinet above it is a
    // sealed lacquer box with nothing in it but air and one motor.
    const PW = CAB + 0.05;                  // 0.550 m, plan of the pedestal
    const PB = PED_H - 0.046;               // 0.199 m, body height
    const ped = new THREE.Mesh(GEO.bevelBox(PW, PB, PW, 0.006, 4), LACQUER());
    ped.position.y = PB / 2 + 0.016;
    g.add(ped);
    // THE REVEAL. A 16 mm satin band, proud of the cabinet and inset from the
    // pedestal, so the two masses read as one designed object with a machined
    // joint rather than as a box standing on a box.
    const rev = new THREE.Mesh(GEO.bevelBox(PW - 0.010, 0.030, PW - 0.010, 0.0026, 3), TRIM());
    rev.position.y = PED_H - 0.015;
    g.add(rev);
    // shadow gap: a dark inset collar the cabinet actually sits on
    const gap = new THREE.Mesh(GEO.bevelBox(CAB - 0.030, 0.014, CAB - 0.030, 0.002, 2), M.anodBlack);
    gap.position.y = PED_H - 0.007;
    g.add(gap);
    // machined feet: a dark disc and a small adjuster, not a chrome spike. At
    // this scale a polished cone returns a clipped white speck in the floor
    // reflection and reads as debris.
    const footD = 0.052;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const fo = new THREE.Mesh(GEO.bevelCyl(footD / 2, footD / 2 + 0.002, 0.011, 28, 0.0010), M.anodBlack);
      fo.position.set(sx * (PW / 2 - 0.052), 0.0055, sz * (PW / 2 - 0.052));
      g.add(fo);
      const ad = new THREE.Mesh(GEO.bevelCyl(0.0135, 0.0135, 0.0075, 24, 0.0008), TRIM());
      ad.position.set(fo.position.x, 0.0146, fo.position.z);
      g.add(ad);
    }

    // ---- plate-amp fascia, on the face the camera can see -------------------
    const fz = PW / 2;
    const fas = new THREE.Mesh(GEO.bevelBox(0.318, 0.076, 0.0060, 0.0018, 3), TRIM());
    fas.position.set(0, 0.112, fz + 0.0026);
    g.add(fas);
    GEO.screwRow(g, [[-0.146, 0.140], [0.146, 0.140], [-0.146, 0.084], [0.146, 0.084]],
      fz + 0.0058, 0.0022);
    // recessed meter well
    const well = new THREE.Mesh(GEO.bevelBox(0.208, 0.038, 0.0040, 0.0010, 2), M.anodBlack);
    well.position.set(-0.044, 0.112, fz + 0.0050);
    g.add(well);
    // eleven backlit segments — live cone excursion, both polarities from centre
    const SEGN = 11;
    const segGeo = GEO.bevelBox(0.0125, 0.0250, 0.0030, 0.0004, 2);
    const seg = new THREE.InstancedMesh(segGeo, METER_MAT(), SEGN);
    seg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SEGN * 3), 3);
    const _m4 = new THREE.Matrix4();
    for (let i = 0; i < SEGN; i++) {
      _m4.makeTranslation(-0.044 + (i - (SEGN - 1) / 2) * 0.0172, 0.112, fz + 0.0058);
      seg.setMatrixAt(i, _m4);
    }
    seg.instanceMatrix.needsUpdate = true;
    seg.frustumCulled = false;
    g.add(seg);
    // THE SPECULAR LAYER: slightly convex cover glass over the lit segments, so
    // the widened front strip sweeps across them as a soft band instead of
    // leaving them as a decal printed on the metal.
    const cover = new THREE.Mesh(convexPanel(0.216, 0.046, 0.0022, 20), HW_GLASS());
    cover.position.set(-0.044, 0.112, fz + 0.0086);
    cover.renderOrder = 6;
    g.add(cover);
    // Level and phase controls. GEO.knob is built about +Y, so it is laid on its
    // back inside a wrapper — setting rotation.x and rotation.z on the knob
    // itself tilts it instead of turning it.
    for (let i = 0; i < 2; i++) {
      const kw = new THREE.Group();
      kw.rotation.x = Math.PI / 2;
      kw.position.set(0.092 + i * 0.044, 0.112, fz + 0.0052);
      const k = GEO.knob(0.0155, 0.0115, { body: TRIM(), mark: M.chrome });
      k.rotation.y = -1.25;
      kw.add(k);
      g.add(kw);
      // Only the LEFT sub's level control turns: the A/B on screen is that sub
      // being brought up, and a control that moves on the sub whose level is
      // not changing would be a lie told in hardware.
      if (i === 0 && isLeft) S.knobs.push(k);
    }
    // A 4 mm indicator. Held well below the bloom threshold on purpose: the
    // previous 11 mm sphere at full ledCyan bloomed into a 120 px flare that
    // read as a light leak across the lower half of the frame.
    const flh = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x4da8dc, toneMapped: false }));
    flh.position.set(0.0725, 0.112, fz + 0.0050);
    g.add(flh);

    // ---- gloss cabinet, bored through for the driver ------------------------
    // A lacquer cube with a real through-bore, not a box with a disc painted on
    // it: the cone has to sit inside the cabinet and the bore wall has to be
    // visible around it, or the driver reads as a hole. Extruded rather than
    // bevelBox so the bore gets the same broken edge as the outside.
    /* THE BORE RADIUS IS NOT THE RADIUS YOU ASK FOR.
     * ExtrudeGeometry applies its bevel to holes as well as to the outer
     * contour, and inward: the hole is `bevelSize` SMALLER at the cap than the
     * path given, flaring back out over `bevelThickness`. With a 7.5 mm bevel a
     * 172.8 mm bore presents a 165.3 mm lip of clearcoated lacquer standing
     * inside the cone's own 170 mm edge. The path radius therefore carries the
     * bevel, so the narrowest lacquer in the aperture is CONE_R + 2.8 mm and
     * the flange laps over all of it. */
    const CAB_BEV = 0.0075;
    const holeR = CONE_R + 0.0028 + CAB_BEV;
    const bsh = new THREE.Shape();
    roundedRect(bsh, CAB - 0.016, CAB - 0.016, 0.006);
    const bore = new THREE.Path();
    bore.absarc(0, 0, holeR, 0, TAU, true);
    bsh.holes.push(bore);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(bsh, {
      depth: CAB - 0.016, bevelEnabled: true, bevelSize: CAB_BEV,
      bevelThickness: 0.0080, bevelSegments: 4, curveSegments: 60,
    }), LACQUER());
    body.position.set(0, PED_H + half, -half + 0.008);
    g.add(body);

    /* BORE LINER.
     * The through-bore is a 172 mm-radius cylinder of the cabinet's own piano
     * lacquer, and because the cone sits 78 mm back inside it, a wide crescent
     * of that wall is in shot around the driver. A clearcoated black mirror
     * curved through 180° reflects the whole studio into a few millimetres, and
     * it was returning the banded chrome ring that read as the surround. It is
     * lined: matte rubber, no environment to speak of, and taken far enough
     * forward that the flange covers its lip. */
    const linerMat = M.rubber.clone();
    linerMat.color.setHex(0x08090b);
    linerMat.roughness = 0.96;
    linerMat.sheen = 0.0;
    linerMat.envMapIntensity = 0.05;
    linerMat.side = THREE.DoubleSide;
    const LINL = 0.32;
    const GSK_Z = half - 0.0035;
    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(holeR - 0.0009, holeR - 0.0009, LINL, 96, 1, true), linerMat);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(0, PED_H + half, GSK_Z - LINL / 2);
    g.add(liner);
    // a matte gasket annulus closing the last millimetres between the roll's
    // outer edge and the bore, so no sight-line reaches lacquer at any angle
    const gskt = new THREE.Mesh(
      new THREE.RingGeometry(CONE_R, holeR + 0.0012, 96), linerMat);
    gskt.position.set(0, PED_H + half, GSK_Z);
    g.add(gskt);

    // ---- machined baffle plate, proud of the lacquer ------------------------
    const BAF = 0.446, BT = 0.020;
    const sh = new THREE.Shape();
    roundedRect(sh, BAF, BAF, 0.018);
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, TAU, true);
    sh.holes.push(hole);
    const baffle = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {
      depth: BT - 0.004, bevelEnabled: true, bevelSize: 0.0022,
      bevelThickness: 0.0018, bevelSegments: 3, curveSegments: 56,
    }), BAFFLE_MAT());
    baffle.position.set(0, PED_H + half, half - BT + 0.0060);
    g.add(baffle);

    // ---- alloy trim flange + fasteners -------------------------------------
    // Twelve M4 heads on a 377 mm pitch circle. Fasteners at a known size are
    // the cheapest scale cue there is: with them the flange reads as 400 mm
    // across, without them it could be a tweeter.
    // The flange's inner lip is INSIDE the bore radius, so the lacquer bore
    // mouth and its mirror bevel are covered by machined alloy rather than left
    // to reflect the rig.
    const ring = new THREE.Mesh(ringLathe(RING_IN, FRAME_R, 0.015), RING_MAT());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, PED_H + half, RING_Z);
    g.add(ring);
    const rr = (RING_IN + FRAME_R) / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + TAU / 24;
      const s = GEO.screw(0.0030, { mat: FAST_MAT() });
      s.position.set(Math.cos(a) * rr, PED_H + half + Math.sin(a) * rr, RING_Z + 0.0081);
      g.add(s);
    }

    // baffle fixings and grille-pin sockets: the four corners are the only
    // part of a 446 mm baffle the 400 mm flange leaves, and empty they are the
    // one place the eye finds nothing made.
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const so = new THREE.Mesh(GEO.bevelCyl(0.0092, 0.0100, 0.0035, 24, 0.0007), TRIM());
      so.rotation.x = Math.PI / 2;
      so.position.set(sx * 0.1955, PED_H + half + sy * 0.1955, half + 0.0038);
      g.add(so);
      const sc = GEO.screw(0.0028, { mat: FAST_MAT() });
      sc.position.set(so.position.x, so.position.y, half + 0.0060);
      g.add(sc);
    }

    // ---- the driver --------------------------------------------------------
    const drv = new THREE.Group();
    drv.position.set(0, PED_H + half, DRV_Z);
    const cone = movingAssembly();
    cone.rotation.x = Math.PI / 2;
    drv.add(cone);
    g.add(drv);
    S.drivers.push({ g: drv, led: flh, meter: seg, n: SEGN, left: isLeft });

    // ---- plate amplifier, on the pedestal's back panel -----------------------
    const rear = new THREE.Group();
    rear.position.set(0, 0.112, -PW / 2 + 0.002);
    rear.rotation.y = Math.PI;
    const plate = new THREE.Mesh(GEO.bevelBox(0.44, 0.152, 0.012, 0.0025, 3), M.anodGrey);
    plate.position.z = 0.006;
    rear.add(plate);
    const hs = GEO.heatsink(0.40, 0.062, 0.030, 26, { mat: M.anodBlack });
    hs.position.set(0, 0.038, 0.026);
    rear.add(hs);
    for (const [x, o] of [[-0.150, GEO.xlr()], [-0.055, GEO.xlr()], [0.140, GEO.iecInlet()]]) {
      o.position.set(x, -0.040, 0.012);
      rear.add(o);
    }
    for (const [x, c] of [[0.035, 0xd94b3a], [0.072, 0x2e3238]]) {
      const bp = GEO.bindingPost({ colour: c });
      bp.position.set(x, -0.040, 0.012);
      rear.add(bp);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0030, 10, 8), M.ledCyan);
    led.position.set(0.196, 0.038, 0.014);
    rear.add(led);
    GEO.screwRow(rear, [[-0.206, 0.062], [0.206, 0.062], [-0.206, -0.062], [0.206, -0.062]], 0.013, 0.0024);
    g.add(rear);

    GEO.shadowed(g);
    for (const o of [led, flh, seg, cover]) o.castShadow = o.receiveShadow = false;

    // ---- contact with the floor ---------------------------------------------
    // A 59 kg cabinet whose silhouette meets the floor on a razor edge is the
    // clearest 'pasted onto a background' tell there is. Two multiply quads: a
    // wide ambient pool that darkens the planar reflection out to a metre, and a
    // tight core at the footprint that closes the join.
    const shA = GEO.contactShadow(PW * 2.7, PW * 2.7, 0.46);
    shA.position.y = 0.0012;
    g.add(shA);
    const shB = GEO.contactShadow(PW * 1.28, PW * 1.28, 0.96);
    shB.position.y = 0.0021;
    g.add(shB);
    return g;
  },

  // =========================================================================
  // overlay — one card: the room in plan, with the field at the tone
  // =========================================================================
  _plan(S) {
    const wrap = new THREE.Group();
    wrap.position.copy(place(CARD_AT[0], CARD_AT[1], CARD_AT[2]));

    const card = DIAG.diagramCard(PLAN_W, PLAN_H, { opacity: 0.94, pad: PLAN_PAD });
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
      // The contours are drawn on the pressure AMPLITUDE envelope, so they are a
      // fixed, readable quantity (LEVELS bands of P_BAND pascals). The colour is
      // the INSTANTANEOUS polarity and the brightness breathes with it, so what
      // moves is the sign and the level, never the contour.
      fragmentShader: `
        #define NPAT ${NPAT}
        #define LEVELS ${LEVELS}.0
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
          float env = clamp(sqrt(sr * sr + si * si), 0.0, 1.0);
          float lv = env * LEVELS;
          float band = floor(lv) / LEVELS;          // stepped choropleth fill
          float f = fract(lv);
          float edge = 1.0 - smoothstep(0.0, 0.11, min(f, 1.0 - f));
          float on = step(0.7, lv);                 // nothing drawn at the nodes
          float puls = 0.52 + 0.48 * abs(inst) / max(env, 1e-4);
          vec3 base = inst >= 0.0 ? uPos : uNeg;
          vec3 rgb = base * (band * 0.305 + edge * 0.300 * on) * puls;
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

    // ---- 1 m survey grid — this is what makes the plan readable to a value --
    const seg = [];
    for (let i = 1; i < RM.W; i++) {
      const X = (i / RM.W - 0.5) * PLAN_W;
      seg.push(X, -PLAN_H / 2, 0.0018, X, PLAN_H / 2, 0.0018);
    }
    for (let j = 1; j < RM.D; j++) {
      const Y = (0.5 - j / RM.D) * PLAN_H;
      seg.push(-PLAN_W / 2, Y, 0.0018, PLAN_W / 2, Y, 0.0018);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    const gm = new THREE.LineBasicMaterial({
      color: 0x9aa3ad, transparent: true, opacity: 0.17, depthWrite: false, toneMapped: false,
    });
    const grid = new THREE.LineSegments(gg, gm);
    grid.renderOrder = 11;
    grid.userData.setOpacity = (o) => { gm.opacity = 0.17 * o; grid.visible = o > 0.004; };
    wrap.add(grid);

    // ---- room outline, nodal lines, markers --------------------------------
    const box = new DIAG.Trace(5, 0x8b939d, 1.3, { opacity: 0.7, renderOrder: 12 });
    const corners = [[-PLAN_W / 2, -PLAN_H / 2], [PLAN_W / 2, -PLAN_H / 2],
      [PLAN_W / 2, PLAN_H / 2], [-PLAN_W / 2, PLAN_H / 2], [-PLAN_W / 2, -PLAN_H / 2]];
    box.write((i) => [corners[i][0], corners[i][1], 0.002]);
    wrap.add(box);

    // Psi(1,1,0) = 0 loci: the room's centre line and its mid-depth line
    const nx = new DIAG.Trace(2, PAL.gr, 1.2,
      { opacity: 0.66, renderOrder: 13, dashed: true, dashSize: 0.016, gapSize: 0.013 });
    nx.write((i) => [0, i ? PLAN_H / 2 : -PLAN_H / 2, 0.003]);
    const nz = new DIAG.Trace(2, PAL.gr, 1.2,
      { opacity: 0.66, renderOrder: 13, dashed: true, dashSize: 0.016, gapSize: 0.013 });
    nz.write((i) => [i ? PLAN_W / 2 : -PLAN_W / 2, 0, 0.003]);
    wrap.add(nx, nz);

    // lambda/2 at 30 Hz, drawn to the plan's own scale. It sits in the band
    // between the sofa row and the front wall — not on the mid-depth nodal line,
    // which it would hide, and not on the sofa row, which is captioned.
    const rul = DIAG.dimension(
      [mx(-LAM30 / 4), my(2.98), 0.004], [mx(LAM30 / 4), my(2.98), 0.004],
      { color: PAL.cy, width: 1.7, head: 0.018 });
    delete rul.userData.setOpacity;      // see the diagramCard note above
    wrap.add(rul);

    // the room's own dimensions, drawn on the edges of the plan. With these
    // and the 1 m grid every point on the map can be read to a coordinate,
    // which is the whole difference between a measurement and a decoration.
    for (const [a, b] of [
      [[-PLAN_W / 2, -PLAN_H / 2 + 0.007, 0.004], [PLAN_W / 2, -PLAN_H / 2 + 0.007, 0.004]],
      [[-PLAN_W / 2 + 0.007, -PLAN_H / 2, 0.004], [-PLAN_W / 2 + 0.007, PLAN_H / 2, 0.004]],
    ]) {
      const dm = DIAG.dimension(a, b, { color: 0x9aa3ad, width: 1.1, head: 0.013 });
      delete dm.userData.setOpacity;      // see the diagramCard note above
      wrap.add(dm);
    }

    // the two subwoofers
    S.marks = [];
    for (const [P, left] of [[SUB_L, true], [SUB_R, false]]) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.0090, 0.0138, 28),
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
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.0052, 14),
        new THREE.MeshBasicMaterial({
          color: PAL.am, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false,
        }));
      d.position.set(mx(x), my(SEAT.z), 0.005);
      d.renderOrder = 14;
      wrap.add(d);
    }

    // ---- the specular layer ------------------------------------------------
    const glass = new THREE.Mesh(
      convexPanel(PLAN_W + PLAN_PAD * 2, PLAN_H + PLAN_PAD * 2, 0.0055), GLASS_MAT());
    glass.position.z = 0.008;
    glass.renderOrder = 18;
    glass.userData.setOpacity = (o) => {
      GLASS_MAT().opacity = o;
      glass.visible = o > 0.01;
    };
    wrap.add(glass);

    // label anchors
    S.aTitle = new THREE.Object3D(); S.aTitle.position.set(0, PLAN_H / 2 + PLAN_PAD, 0.02);
    S.aKey = new THREE.Object3D(); S.aKey.position.set(-PLAN_W / 2, -PLAN_H / 2 - PLAN_PAD, 0.02);
    S.aRule = new THREE.Object3D(); S.aRule.position.set(mx(-LAM30 / 4), my(2.98), 0.02);
    S.aNode = new THREE.Object3D(); S.aNode.position.set(0, my(SEAT.z), 0.02);
    // numerals on the two dimension lines. A plan with a 1 m grid and no number
    // on either edge is a decoration; with them every point on the map can be
    // read off to a coordinate, which is what makes it a measurement.
    S.aW = new THREE.Object3D(); S.aW.position.set(0, -PLAN_H / 2 + 0.007, 0.02);
    S.aD = new THREE.Object3D(); S.aD.position.set(-PLAN_W / 2 + 0.007, 0.06, 0.02);
    wrap.add(S.aTitle, S.aKey, S.aRule, S.aNode, S.aW, S.aD);

    return faceCam(wrap);
  },

  // =========================================================================
  _labels(ctx, S) {
    const L = ctx.labels;
    const cy = '#5cc0f2', am = '#f0b35a', gr = '#7fd6a2';
    S.lab = {};
    S.lab.sub = L.add(new THREE.Vector3(LAYOUT.subR.x, PED_H + CAB + 0.11, LAYOUT.subR.z), {
      kicker: `SEALED ${(D_NOM * 1000).toFixed(0)} mm · ${(VB * 1000).toFixed(0)} L`,
      text: `Sd ${(D_EFF * 1000).toFixed(0)}&nbsp;mm eff · f₃ ${F3.toFixed(1)}&nbsp;Hz`
        + `<br>12&nbsp;dB/oct · ${M_TOTAL.toFixed(0)}&nbsp;kg`,
      value: '', cls: 'am', offset: [0, -20], priority: 5,
    });
    S.lab.plan = L.add(S.aTitle, {
      kicker: 'ROOM IN PLAN · FLOOR LEVEL',
      text: `sound pressure at ${F_TONE.toFixed(2)}&nbsp;Hz, shown at 1&nbsp;:&nbsp;50`,
      value: '', cls: 'acc', offset: [0, -24], occlude: false, priority: 4,
    });
    /** The key is in ONE convention. Printing a peak contour beside an rms SPL
     *  is how a reader checks 20·log10(5.1/2e−5), gets 108, and decides the
     *  chapter is 3 dB out — so both conversions are on the line. */
    S.lab.key = L.add(S.aKey, {
      kicker: 'PRESSURE KEY',
      text: `<b style="color:${cy}">+p</b> compression · <b style="color:${am}">−p</b> rarefaction`
        + `<br><span style="color:${cy}">○</span> sub · <span style="color:${am}">●</span> seat`
        + ` · <span style="color:${gr}">- -</span> Ψ₁₁₀ = 0`
        + `<br>${LEVELS} contours of ${P_BAND.toFixed(2)}&nbsp;Pa peak`,
      value: `peak ${P_FS.toFixed(1)} Pa = ${(P_FS / Math.SQRT2).toFixed(1)} Pa rms`
        + ` = ${SPL_FS.toFixed(0)} dB SPL`,
      cls: 'acc', offset: [116, 56], occlude: false, priority: 4,
    });
    S.lab.node = L.add(S.aNode, {
      kicker: 'Ψ₁₁₀ = 0', text: 'the sofa sits on the centre line',
      cls: '', offset: [0, -30], occlude: false, priority: 2,
    });
    S.lab.rul = L.add(S.aRule, {
      kicker: 'λ/2 at 30 Hz', value: `${(LAM30 / 2).toFixed(2)} m`,
      cls: 'acc', offset: [-58, -2], occlude: false, priority: 2,
    });
    L.add(S.aW, {
      value: `W ${RM.W.toFixed(1)} m`, cls: 'plain', offset: [0, 15],
      occlude: false, priority: 1,
    });
    L.add(S.aD, {
      value: `D ${RM.D.toFixed(1)} m`, cls: 'plain', offset: [-34, 0],
      occlude: false, priority: 1,
    });
  },

  // =========================================================================
  update(dt, t) {
    const S = this._s;
    if (!S || !S.uni) return;
    S.tNow = t;

    // 30.02 Hz at timeScale 0.02 → 0.60 Hz on screen, i.e. 1 : 50
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
    S.x = x;
    for (const d of S.drivers) {
      const lv = d.left ? mix : 1;
      d.g.position.z = DRV_Z + x * lv;
      d.led.material.color.setRGB(0.302 * lv + 0.03, 0.659 * lv + 0.05, 0.863 * lv + 0.07);
      // fascia excursion meter: |x| against Xmax, the last three segments amber
      const frac = (Math.abs(x) * lv / XMAX) * d.n;
      const ic = d.meter.instanceColor;
      for (let i = 0; i < d.n; i++) {
        const on = DSP.clamp(frac - i, 0, 1);
        const hot = i >= d.n - 3;
        const r = hot ? 0.030 + 0.60 * on : 0.008 + 0.055 * on;
        const gr = hot ? 0.017 + 0.33 * on : 0.017 + 0.31 * on;
        const b = hot ? 0.006 + 0.10 * on : 0.024 + 0.57 * on;
        ic.setXYZ(i, r, gr, b);
      }
      ic.needsUpdate = true;
    }
    for (const m of S.marks) m.m.material.opacity = m.left ? 0.18 + 0.82 * mix : 1;
    for (const k of S.knobs) k.rotation.y = -1.25 + 2.35 * mix;
  },

  // =========================================================================
  content() {
    const n = (v) => `<span class="num">${v}</span>`;
    return `
<p>At ${n('30 Hz')} a wavelength is ${n(LAM30.toFixed(2) + ' m')} and this room's longest
straight line is ${n(DIAG3D.toFixed(2) + ' m')}. Nothing in it is half a wavelength from a
wall, so the steady state is a standing pattern fixed by the boundaries, not a travelling
wave.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Two subwoofers do not flatten
the response at one seat. Computed here, 20–80 Hz peak-to-peak at the central seat is
${n(ENV1.pp.toFixed(1) + ' dB')} with one sub and unchanged at
${n(ENV2.pp.toFixed(1) + ' dB')} with two — not similar, <em>identical</em>, because that seat
lies on the null of every odd lateral mode and the pair simply doubles the field there. What
collapses is the disagreement <em>between</em> seats,
${n(ENV1.spread.toFixed(1) + ' dB')} to ${n(ENV2.spread.toFixed(1) + ' dB')}.</p></div>

<div class="key"><span class="lab">The idea</span><p>Below Schroeder —
${n(F_SCH.toFixed(0) + ' Hz')} here — the room is a resonator with a fixed geography of loud
and quiet places. A source excites a mode by where it stands.</p></div>

<div class="eq">f = <span class="hl">c/2</span>·√( (p/W)² + (q/D)² + (r/H)² )
<span class="c">W ${RM.W} · D ${RM.D} · H ${RM.H} m · c ${C} m/s</span>
<span class="c">axial </span>${AXIALS.map((f) => f.toFixed(2)).join(' ')} Hz
<span class="c">Vb ${(VB * 1000).toFixed(0)} L → </span>Qtc ${ALIGN.Qtc.toFixed(2)} · f₃ ${F3.toFixed(1)} Hz · <span class="hl">12 dB/oct</span></div>

<p>30 Hz sits ${n((100 * Math.abs(F_TONE - 30) / 30).toFixed(2) + '%')} from the first
tangential mode ${n('(1,1,0)')} at ${n(F_TONE.toFixed(2) + ' Hz')}, where Ψ₁₁₀ meets the two
subs — ${n(SUB_OFF.toFixed(2) + ' m')} either side of the centre line — equal and opposite,
${n('−' + Math.abs(PSI_R).toFixed(3))} and ${n('+' + Math.abs(PSI_L).toFixed(3))}: matched,
their sum drives it with no net force. Sealed is second order, so above
${n(XOVER.fLow + ' Hz')} an LR${XOVER.order} hands over to the floorstanders.</p>`;
  },

  /**
   * The instrument cluster. It also latches the world labels: the readouts tick
   * at 10 Hz while labels update every frame, so driving both from one snapshot
   * is the only way a still frame shows a single consistent instant.
   */
  readouts() {
    const S = this._s || {};
    const mix = S.mix ?? 0;
    const x = S.x ?? 0;
    const psiSum = PSI_R + mix * PSI_L;
    const spl = seatSpl(mix);
    if (S.lab) {
      const sgn = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
      S.lab.sub.setValue(
        `x ${sgn(x * 1000, 2)} of ${(XMAX * 1000).toFixed(0)} mm, true scale`);
      S.lab.plan.setValue(mix > 0.5
        ? `both subs — Ψ₁₁₀ sums to ${sgn(psiSum, 3)}`
        : `right sub alone — Ψ₁₁₀ = ${sgn(PSI_R, 3)}`);
    }
    return [
      { k: 'MODE (1,1,0)', v: F_TONE.toFixed(2), u: 'Hz', cls: 'acc' },
      { k: 'DRIVE, 1 m', v: SPL_REF.toFixed(0), u: 'dB', cls: 'am' },
      { k: 'CONE x', v: (x * 1000).toFixed(2), u: 'mm', cls: '', bar: Math.abs(x) / XMAX },
      { k: 'SEAT SPL', v: spl.toFixed(1), u: 'dB', cls: '', bar: (spl - 60) / 40 },
      { k: 'Ψ₁₁₀ SUM', v: psiSum.toFixed(3), u: '', cls: 'acc', bar: Math.abs(psiSum / PSI_R) },
      { k: 'SEAT SPREAD', v: envAt(mix).toFixed(1), u: 'dB', cls: 'am' },
    ];
  },
};
