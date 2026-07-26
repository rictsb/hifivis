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
const RT60 = ROOM.rt60;                                              // 0.42 s — the primary
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
const SPL_ONE = seatSpl(0);                 // seatSpl(1) is exactly this + 6.021 dB
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

// ---- the plan card ----------------------------------------------------------
const CARD_AT = [892, 458, 2.50];           // px, px, metres from the lens
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
let _ringMat = null, _baffMat = null, _fastMat = null, _lacMat = null;
let _trimMat = null, _meterMat = null, _fasMat = null;
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
 * The cone. mats().coneWeave's weave map is DROPPED, and that is a considered
 * decision rather than laziness: the texture repeats 26 times across the mesh,
 * so on a 340 mm cone one weave cell is well under a pixel at any framing this
 * chapter uses. It therefore contributes no visible detail at all — it acts
 * purely as a 0.17× neutral-density filter, and it was the reason the cone
 * rendered at about 3 % albedo, i.e. as a black hole in a black cabinet with no
 * value separation between the hero's one moving part and the box around it.
 *
 * What replaces it is the two things that ARE resolvable at 300 px across: a
 * mid-grey composite albedo, and geometry — the concentric relief ring turned
 * into the profile (see movingAssembly) which catches the front strip as a
 * circle. A cone is a curved surface, so it sweeps the environment on its own.
 */
function CONE_MAT() {
  if (!_coneMat) {
    _coneMat = mats().cone.clone();
    _coneMat.map = null;
    _coneMat.color.setHex(0x484e57);
    _coneMat.metalness = 0.0;
    _coneMat.roughness = 0.58;
    _coneMat.clearcoat = 0.34;
    _coneMat.clearcoatRoughness = 0.34;
    _coneMat.envMapIntensity = 0.72;
    _coneMat.sheen = 0.28;
    _coneMat.sheenRoughness = 0.88;
    _coneMat.sheenColor = new THREE.Color(0x3b424c);
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
/**
 * Coated dust cap. A convex cap is a DIVERGING MIRROR: it gathers the whole
 * front hemisphere into its own silhouette, so any clearcoat on it returns the
 * beauty box over nearly its entire visible area. At clearcoat 0.32 that made
 * the one light-grey object in an otherwise black driver — a plastic egg at the
 * centre of the hero. It is now a coated-fabric cap: matte, barely above the
 * cone in value, with the environment turned right down. The cap is separated
 * from the cone by its GEOMETRY (a glue fillet and a machined retaining ring),
 * which is how a real driver separates it, not by being three stops brighter.
 */
function DUST_MAT() {
  if (!_dustMat) {
    _dustMat = mats().cone.clone();
    _dustMat.color.setHex(0x15181c);
    _dustMat.roughness = 0.86;
    _dustMat.clearcoat = 0.10;
    _dustMat.clearcoatRoughness = 0.55;
    _dustMat.sheen = 0.30;
    _dustMat.sheenRoughness = 0.94;
    _dustMat.sheenColor = new THREE.Color(0x2b3038);
    _dustMat.envMapIntensity = 0.26;
  }
  return _dustMat;
}
/** Fasteners. Plain steel at roughness 0.20 returns a clipped white square at
 *  this scale; these are darker and rougher so they read as heads, not stars. */
function FAST_MAT() {
  if (!_fastMat) {
    _fastMat = mats().steel.clone();
    _fastMat.color.setHex(0x777d86);
    _fastMat.roughness = 0.50;
    _fastMat.envMapIntensity = 0.52;
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
    _ringMat.color.setHex(0xb0b7c0);
    _ringMat.roughness = 0.27;
    _ringMat.envMapIntensity = 1.25;
  }
  return _ringMat;
}
/** Satin machined trim: the plinth reveal, the knob bodies, the toggle. Darker
 *  than the flange so the driver keeps the one bright ring. */
function TRIM() {
  if (!_trimMat) {
    _trimMat = mats().aluTrim.clone();
    _trimMat.color.setHex(0x6d737b);
    _trimMat.roughness = 0.52;
    _trimMat.envMapIntensity = 0.60;
  }
  return _trimMat;
}
/**
 * The plate-amp fascia, and why it is BRUSHED rather than satin.
 *
 * At aluTrim's roughness the fascia is a flat vertical metal panel, and a flat
 * vertical metal panel reflects exactly one direction — here about 11° below
 * horizontal, which is the black floor of the shell — so the whole plate
 * rendered as an unbroken black field with only the meter alive on it. Brushed
 * aluminium is the fix that is also the truth: its anisotropic roughness smears
 * the reflection along the grain, so it gathers the studio's wide front strip
 * into the long horizontal streak that says machined metal. That streak is what
 * the front strip in the rig exists for.
 */
function FASCIA_MAT() {
  if (!_fasMat) {
    _fasMat = mats().alu.clone();
    _fasMat.color.setHex(0x7a8087);
    _fasMat.roughness = 0.37;
    _fasMat.envMapIntensity = 0.52;
  }
  return _fasMat;
}
/** Excursion-meter segments. Deliberately well under the bloom threshold: this
 *  is a backlit LCD segment, not a light source. */
function METER_MAT() {
  if (!_meterMat) {
    _meterMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  }
  return _meterMat;
}
/**
 * Bead-blasted baffle. Roughness is deliberately high for a metal: at 0.50 a
 * flat vertical anodised plate gathers a narrow cone about the one reflected
 * direction — the shell's black floor — and renders at the same value as the
 * lacquer it is bolted to, so a 446 mm machined plate reads as nothing at all.
 * At 0.70 the cone is wide enough to take in the horizon band and the front
 * strip, which is what bead blasting does in the real world too.
 */
function BAFFLE_MAT() {
  if (!_baffMat) {
    _baffMat = mats().anodBlack.clone();
    _baffMat.color.setHex(0x2b2f35);
    _baffMat.roughness = 0.70;
    _baffMat.envMapIntensity = 1.25;
  }
  return _baffMat;
}
/**
 * THE CROWN SKIN — why a 500 mm lacquer cheek was one flat value.
 *
 * A FLAT vertical panel photographed from above returns exactly one part of the
 * environment: reflect the view vector about a constant normal and the answer
 * is a single direction, here about 11° BELOW horizontal, which in this studio
 * is the near-black floor of the shell. No amount of clearcoat or envMap gain
 * fixes that, because the surface is not sampling anything else. It is not a
 * lighting fault and it is not a material fault: a flat mirror has nothing to
 * ramp between.
 *
 * A real lacquered cabinet of this class is not flat. Crown the cheek by 8 mm
 * over 480 mm — a 1.7 % camber, invisible as a shape — and the normal swings
 * ±3° top to bottom, so the reflected ray sweeps ±6° and crosses the studio's
 * horizon band near the top of the panel. The cheek then carries an unbroken
 * ramp from that band, down through several stops, into the flag at the floor.
 * That ramp is the entire difference between lacquer and painted card.
 *
 * The bow is cylindrical about the horizontal axis and is faded to zero at the
 * vertical rims (the u⁶ term), so the skin meets the flat face it sits on and
 * the silhouette is unchanged.
 */
function crownSkin(w, h, bulge, seg = 22) {
  const g = new THREE.PlaneGeometry(w, h, seg, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getY(i) / (h / 2);
    p.setZ(i, bulge * (1 - v * v) * (1 - Math.pow(Math.abs(u), 6)));
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
  for (let i = 0; i <= 44; i++) {
    const t = i / 44;
    // A CONCENTRIC RELIEF RING at 0.58 of the cone, 0.6 mm proud over 18 mm of
    // radius: the stiffening bead a large pressed cone carries. It is the one
    // piece of cone detail that survives to the pixel at this framing, and it
    // catches the front strip as a circle, which is what stops a 340 mm disc
    // reading as a smooth grey gradient with nothing in it.
    const u = (t - 0.58) / 0.11;
    const bead = Math.abs(u) < 1 ? 0.0006 * (1 - u * u) * (1 - u * u) : 0;
    cp.push(new THREE.Vector2(rd + (rc - rd) * t, -dep * Math.pow(1 - t, 1.28) + bead));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(cp, 128), CONE_MAT()));
  const sp = [];
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI * (i / 22);
    sp.push(new THREE.Vector2(rc + (SURR_W / 2) * (1 - Math.cos(a)),
      Math.sin(a) * SURR_W * 0.50));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(sp, 128), SURR_MAT()));
  const A = 0.78, dp = [];                  // 45° of arc: a cap, not a dome
  for (let i = 0; i <= 16; i++) {
    const a = A * (1 - i / 16);
    dp.push(new THREE.Vector2((Math.sin(a) / Math.sin(A)) * rd,
      -dep + ((Math.cos(a) - Math.cos(A)) / (1 - Math.cos(A))) * 0.0132));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(dp, 96), DUST_MAT()));
  // The glue fillet the cap is bonded on with, and a turned retaining ring over
  // it. This is how a driver separates its cap from its cone — a joint you can
  // see — rather than by making the cap three stops brighter than the cone.
  const fp = [];
  for (let i = 0; i <= 10; i++) {
    const a = (Math.PI / 2) * (i / 10);
    fp.push(new THREE.Vector2(rd + 0.0042 - Math.cos(a) * 0.0042,
      -dep - 0.0012 + Math.sin(a) * 0.0026));
  }
  const fil = new THREE.Mesh(new THREE.LatheGeometry(fp, 72), SURR_MAT());
  g.add(fil);
  const rr = new THREE.Mesh(ringLathe(rd + 0.0044, rd + 0.0092, 0.0034, 0.0007), RING_MAT());
  rr.position.y = -dep + 0.0008;
  g.add(rr);
  return g;
}
/**
 * The trim flange, and the same argument as crownSkin one scale down.
 *
 * A flat annulus facing the camera reflects one direction — the same 11°-below
 * that killed the cheek — so the "diamond-turned alloy trim" was rendering as a
 * dark grey hoop. Its face is now CROWNED in section: a shallow arc of 1.7 mm
 * sagitta across the 31 mm land, which tilts the normal ±12° at the edges and
 * sweeps the reflection through ±24°. Somewhere across that width the ring
 * crosses the studio's horizon band, so a bright line runs round it at a radius
 * that changes with angle — which is what a machined ring does in a photograph
 * and what a flat one never does. The land is turned with a fine circumferential
 * groove at mid-width to break the sweep, as a diamond-turned part would be.
 */
function ringLathe(rIn, rOut, t, b = 0.0026) {
  const land = Math.max(1e-4, rOut - rIn - 2 * b);
  // 6.7° of taper, and the ANGLE IS THE WHOLE DESIGN.
  //
  // A land crowned in section sweeps its reflection through ±28° across 13 mm
  // of radius, so the arc that happens to cross a studio source is about one
  // pixel wide and the ring still renders as a dark hoop — which is what the
  // flange was doing. Holding the entire land at ONE angle instead moves the
  // reflected direction by twice that angle across the full 31 mm width, so
  // wherever it crosses a source the whole land lights up together and the
  // highlight is a broad arc rather than a hairline.
  //
  // The land rises toward the OUTER rim and tapers in toward the cone, which is
  // the ordinary bezel section a driver trim ring has, and which puts the arc
  // on the outer-lower quadrant where this camera sits.
  const N = 10, drop = -land * 0.118, groove = Math.min(0.0006, land * 0.022);
  const p = [new THREE.Vector2(rIn, -t / 2), new THREE.Vector2(rIn, t / 2 - b)];
  p.push(new THREE.Vector2(rIn + b, t / 2));
  for (let i = 0; i <= N; i++) {                       // the dished land
    const s = i / N;
    const r = rIn + b + land * s;
    let z = t / 2 - drop * s;
    // fine turned groove at 0.46 of the land: a step the highlight breaks over,
    // so the sweep reads as machined rather than moulded
    if (Math.abs(s - 0.46) < 0.05) z -= groove;
    p.push(new THREE.Vector2(r, z));
  }
  p.push(new THREE.Vector2(rOut, t / 2 - drop - b));
  p.push(new THREE.Vector2(rOut, -t / 2 + b), new THREE.Vector2(rOut - b, -t / 2),
    new THREE.Vector2(rIn + b, -t / 2), new THREE.Vector2(rIn, -t / 2));
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
    const rev = new THREE.Mesh(GEO.bevelBox(PW - 0.010, 0.030, PW - 0.010, 0.0045, 4), TRIM());
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
    // The chamfers here are 4 mm, not the 1.8 mm they were. At this framing the
    // fascia is 100 px wide, so a 1.8 mm chamfer is half a pixel: a bright edge
    // half a pixel wide cannot be resolved and renders as a dotted line that
    // crawls. Anything meant to read as a machined edge has to be at least a
    // pixel across in the frame it will actually be seen in.
    const fas = new THREE.Mesh(GEO.bevelBox(0.372, 0.078, 0.0060, 0.0040, 4), FASCIA_MAT());
    fas.position.set(0, 0.112, fz + 0.0026);
    g.add(fas);
    // These screws MUST carry FAST_MAT. GEO.screwRow builds them from the
    // library's polished steel, and a 2.2 mm polished head is far narrower than
    // the reflected image of the beauty box, so it returns a clipped white
    // square and blooms — the single brightest object in the whole frame was a
    // fascia screw.
    for (const [x, y] of [[-0.176, 0.141], [0.176, 0.141], [-0.176, 0.083], [0.176, 0.083]]) {
      const sc = GEO.screw(0.0022, { mat: FAST_MAT() });
      sc.position.set(x, y, fz + 0.0058);
      g.add(sc);
    }
    // recessed meter well
    const well = new THREE.Mesh(GEO.bevelBox(0.208, 0.038, 0.0040, 0.0020, 3), M.anodBlack);
    well.position.set(-0.076, 0.112, fz + 0.0050);
    g.add(well);
    // eleven backlit segments — live cone excursion, both polarities from centre
    const SEGN = 11;
    const segGeo = GEO.bevelBox(0.0125, 0.0250, 0.0030, 0.0004, 2);
    const seg = new THREE.InstancedMesh(segGeo, METER_MAT(), SEGN);
    seg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SEGN * 3), 3);
    const _m4 = new THREE.Matrix4();
    for (let i = 0; i < SEGN; i++) {
      _m4.makeTranslation(-0.076 + (i - (SEGN - 1) / 2) * 0.0172, 0.112, fz + 0.0058);
      seg.setMatrixAt(i, _m4);
    }
    seg.instanceMatrix.needsUpdate = true;
    seg.frustumCulled = false;
    g.add(seg);
    // THE SPECULAR LAYER over the meter — Addendum J's helper, not a home-rolled
    // near-mirror. It is crowned, so the front strip sweeps across it as a band,
    // and its reflectivity is a COATED cover glass's 1.7 %, not bare glass's 4 %.
    const cover = GEO.instrumentGlass(0.216, 0.046, { crown: 0.0018, roughness: 0.15 });
    cover.position.set(-0.076, 0.112, fz + 0.0088);
    g.add(cover);

    // ---- real controls: level, phase, low-pass defeat ------------------------
    // GEO.knob is built about +Y, so it is laid on its back inside a wrapper —
    // setting rotation.x on the knob itself tilts it instead of turning it.
    // Each knob gets a machined tick arc, which is what tells a reader it is a
    // control with a scale rather than a disc glued to a panel.
    const TICK = new THREE.BoxGeometry(0.0009, 0.0030, 0.0012);
    for (const [i, cx] of [[0, 0.058], [1, 0.120]]) {
      const kw = new THREE.Group();
      kw.rotation.x = Math.PI / 2;
      kw.position.set(cx, 0.112, fz + 0.0052);
      const k = GEO.knob(0.0148, 0.0112, { body: TRIM(), mark: M.chrome });
      k.rotation.y = -1.25;
      kw.add(k);
      g.add(kw);
      // Only the LEFT sub's level control turns: the A/B on screen is that sub
      // being brought up, and a control that moves on the sub whose level is
      // not changing would be a lie told in hardware.
      if (i === 0 && isLeft) S.knobs.push(k);
      const NT = i === 0 ? 9 : 3;             // level: a scale. phase: 0/90/180.
      const tk = new THREE.InstancedMesh(TICK, FAST_MAT(), NT);
      for (let j = 0; j < NT; j++) {
        const a = -2.35 + (4.70 * j) / (NT - 1);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
        tk.setMatrixAt(j, new THREE.Matrix4().compose(
          new THREE.Vector3(cx + Math.sin(a) * 0.0192, 0.112 + Math.cos(a) * 0.0192, fz + 0.0060),
          q, new THREE.Vector3(1, 1, 1)));
      }
      tk.instanceMatrix.needsUpdate = true;
      g.add(tk);
    }
    // low-pass defeat: a machined bat toggle in its own milled well
    const tw = new THREE.Mesh(GEO.bevelBox(0.0150, 0.0230, 0.0032, 0.0008, 2), M.anodBlack);
    tw.position.set(0.166, 0.112, fz + 0.0050);
    g.add(tw);
    const bat = new THREE.Mesh(GEO.bevelCyl(0.0022, 0.0030, 0.0105, 20, 0.0006), TRIM());
    bat.position.set(0.166, 0.1155, fz + 0.0090);
    bat.rotation.x = 1.18;
    g.add(bat);
    // A 4 mm indicator. Held well below the bloom threshold on purpose: the
    // previous 11 mm sphere at full ledCyan bloomed into a 120 px flare that
    // read as a light leak across the lower half of the frame.
    const flh = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x4da8dc, toneMapped: false }));
    flh.position.set(0.0245, 0.112, fz + 0.0050);
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

    // THE CROWN. See crownSkin: a flat cheek returns one direction and can only
    // ever be one value. These three skins sit on the flat faces, carry an 8 mm
    // camber that dies to nothing at their rims, and are the reason the cabinet
    // now ramps instead of sitting at a single grey.
    const CY = PED_H + half, SKIN = 0.452, EPS = 0.0003, skins = [];
    for (const [px, py, pz, ry, rxr, bulge] of [
      [half - 0.008 + EPS, CY, 0, Math.PI / 2, 0, 0.0115],       // right cheek
      [-(half - 0.008 + EPS), CY, 0, -Math.PI / 2, 0, 0.0115],   // left cheek
      [0, CY + half - 0.008 + EPS, 0, 0, -Math.PI / 2, 0.0032],  // top
    ]) {
      const sk = new THREE.Mesh(crownSkin(SKIN, SKIN, bulge), LACQUER());
      sk.position.set(px, py, pz);
      sk.rotation.set(rxr, ry, 0);
      g.add(sk);
      skins.push(sk);
    }

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
    // A machined counterbore land just outside the flange: a turned circle on an
    // otherwise empty 446 mm plate. Its chamfers draw a fine bright ring, which
    // is how a real recessed driver mount announces itself, and it gives the eye
    // something made in the one area of the baffle the flange leaves bare.
    const cb = new THREE.Mesh(ringLathe(0.2055, 0.2145, 0.0050, 0.0009), TRIM());
    cb.rotation.x = Math.PI / 2;
    cb.position.set(0, PED_H + half, half - 0.0002);
    g.add(cb);

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
    // The crown skins are coincident with the faces they sit on: let them cast
    // or receive and the depth test between the two surfaces produces acne.
    for (const o of [led, flh, seg, cover, ...skins]) o.castShadow = o.receiveShadow = false;

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
    };
    /**
     * ONE HUE. The previous version painted the two polarities as large flat
     * fields of saturated amber and cyan, which is a weather map, and worse: in
     * every other chapter cyan means signal and amber means energy, so a reader
     * carrying that convention eleven chapters read the amber lobes as "where
     * the energy is". They are not; they are the half-cycle in rarefaction.
     *
     * It is now a contour chart in a single hue that DIVERGES THROUGH THE
     * CARD'S OWN VALUE: compression paints lighter than the card, rarefaction
     * paints darker, and the fill never exceeds alpha 0.16, so sign is carried
     * by value rather than by borrowing a second accent. That needs normal
     * alpha blending, not additive — additive can only ever add light, and a
     * map that can only get brighter cannot show a sign.
     *
     * The contours themselves are on the pressure AMPLITUDE envelope, so they
     * are a fixed readable quantity — LEVELS lines at P_BAND pascals each — and
     * are drawn at constant SCREEN width with fwidth, which is what makes them
     * hold together as lines instead of thickening wherever the field is flat.
     * What moves with the tone is the sign and the level; the contours do not.
     */
    const mat = new THREE.ShaderMaterial({
      uniforms: uni,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        #define NPAT ${NPAT}
        #define LEVELS ${LEVELS}.0
        uniform vec4 uPat[NPAT];
        uniform float uMix;
        uniform vec2 uPh;
        uniform float uOpacity;
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
          float env  = clamp(sqrt(sr * sr + si * si), 0.0, 1.0);
          float sgn  = clamp(inst / max(env, 1e-4), -1.0, 1.0);
          float t    = 0.5 + 0.5 * sgn;             // 0 rarefaction … 1 compression

          // contour lines of |p|, constant width in pixels
          float lv = env * LEVELS;
          float fw = max(fwidth(lv), 1e-5);
          float d  = min(fract(lv), 1.0 - fract(lv));
          float line = (1.0 - smoothstep(0.0, 1.70 * fw, d)) * step(0.80, lv);

          vec3 lo = vec3(0.010, 0.014, 0.020);      // below the card's value
          vec3 hi = vec3(0.46, 0.74, 0.96);         // the piece's cyan, light
          vec3 fillC = mix(lo, hi, t);
          float fillA = 0.175 * env * (0.32 + 0.68 * abs(sgn));
          vec3 lineC = mix(vec3(0.05, 0.09, 0.14), vec3(0.76, 0.93, 1.0), t);
          float lineA = line * (0.46 + 0.54 * env);

          float a = lineA + fillA * (1.0 - lineA);
          vec3 c = (lineC * lineA + fillC * fillA * (1.0 - lineA)) / max(a, 1e-4);
          gl_FragColor = vec4(c, a * uOpacity);
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
    // the sofa, five seats. Neutral, not amber: on this card amber would be the
    // piece's energy accent standing in for "a person", and the map has already
    // spent its one hue on pressure.
    SOFA_X.forEach((x, i) => {
      const mid = i === 2;
      const d = new THREE.Mesh(
        mid ? new THREE.RingGeometry(0.0052, 0.0088, 24) : new THREE.CircleGeometry(0.0046, 14),
        new THREE.MeshBasicMaterial({
          color: 0xd7dde5, transparent: true, opacity: mid ? 1 : 0.72,
          toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
        }));
      d.position.set(mx(x), my(SEAT.z), 0.005);
      d.renderOrder = 14;
      wrap.add(d);
    });

    // ---- THE SPECULAR LAYER ------------------------------------------------
    // Addendum J's helper rather than a hand-rolled near-mirror: crowned, so
    // the widened front strip sweeps across the map as a soft band, and coated,
    // so it returns 1.7 % at normal incidence instead of bare glass's 4 %. It
    // sits 8 mm in front of the map, which is what a cover glass over a backlit
    // display does — and it is the reason the card reads as a lit instrument
    // rather than as a graphic pasted into the photograph.
    const glass = GEO.instrumentGlass(PLAN_W + PLAN_PAD * 2, PLAN_H + PLAN_PAD * 2,
      { crown: 0.0035, roughness: 0.22, reflectivity: 0.14 });
    // A 10 mm crown across a 620 mm panel gathers the beauty box into a blown
    // disc at the rim — the lens flare Addendum J warns about, one scale up.
    // 4.5 mm sweeps the front strip as a band and stops there.
    // Squaring the card to the image plane also squares it to the FRONT
    // HEMISPHERE: its normal now points back down the lens axis, so both the
    // core plate's clearcoat and this glass return the beauty box straight at
    // the camera. That is physically right and it is what makes the card read
    // as lit glass, but it puts a bright wash over the map, so the glass is
    // held to a tenth and the contours are lifted to survive on top of it.
    glass.material.opacity = 0.075;     // a window over a map, not a smoked filter
    glass.position.z = 0.008;
    wrap.add(glass);

    // label anchors
    S.aTitle = new THREE.Object3D(); S.aTitle.position.set(0, PLAN_H / 2 + PLAN_PAD, 0.02);
    S.aRule = new THREE.Object3D(); S.aRule.position.set(0, my(2.98), 0.02);
    S.aNode = new THREE.Object3D(); S.aNode.position.set(0, my(SEAT.z), 0.02);
    // NUMERALS on the two dimension lines. With them and the 1 m grid every
    // point on the map can be read off to a coordinate in metres, which is the
    // difference between a measurement and a picture of one.
    S.aW = new THREE.Object3D(); S.aW.position.set(0, -PLAN_H / 2 + 0.007, 0.02);
    S.aD = new THREE.Object3D(); S.aD.position.set(-PLAN_W / 2 + 0.007, 0.055, 0.02);
    wrap.add(S.aTitle, S.aRule, S.aNode, S.aW, S.aD);

    /* SQUARE TO THE IMAGE PLANE — and note that this is NOT lookAt(camera).
     * A plan drawn in perspective is not a plan: parallel walls converge and the
     * 1 m grid stops being 1 m. Pointing the card's normal at the camera's
     * POSITION does not fix that, because this stage sits well off the optical
     * axis (the Director runs a shifted principal point), so a card aimed at the
     * lens is still oblique to the film and still keystones — which is exactly
     * what it was doing. Parallel to the IMAGE PLANE is the condition, so the
     * card's basis is the camera's own: right, up, and back along the axis. */
    wrap.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(RIGHT, UPC, AXIS.clone().negate()));
    return wrap;
  },

  // =========================================================================
  _labels(ctx, S) {
    const L = ctx.labels;
    S.lab = {};
    S.lab.sub = L.add(new THREE.Vector3(LAYOUT.subR.x, PED_H + CAB + 0.11, LAYOUT.subR.z), {
      kicker: `SEALED ${(D_NOM * 1000).toFixed(0)} mm · ${(VB * 1000).toFixed(0)} L`,
      text: `Sd ${(D_EFF * 1000).toFixed(0)}&nbsp;mm eff · f₃ ${F3.toFixed(1)}&nbsp;Hz`
        + `<br>12&nbsp;dB/oct · ${M_TOTAL.toFixed(0)}&nbsp;kg`,
      value: '', cls: 'am', offset: [0, -20], priority: 5,
    });
    /** The map's own units, on the map. Contour interval and full scale are the
     *  two numbers a reader needs to take a value off a contour chart, and the
     *  full scale is the MAP MAXIMUM — not the seat, which is 26.8 dB below it
     *  because the seat sits on the null. Saying "105 dB" without saying which
     *  point it belongs to is how the footer's 78.3 dB looks like broken
     *  inverse-square law. */
    S.lab.plan = L.add(S.aTitle, {
      kicker: 'ROOM IN PLAN · FLOOR LEVEL',
      text: `${LEVELS} contours of ${P_BAND.toFixed(2)}&nbsp;Pa peak`
        + `<br>${F_TONE.toFixed(2)}&nbsp;Hz, shown at 1&nbsp;:&nbsp;50`
        + `<br>map maximum ${SPL_FS.toFixed(0)}&nbsp;dB SPL`,
      value: '', cls: 'acc', offset: [0, -52], occlude: false, priority: 4,
    });
    S.lab.node = L.add(S.aNode, {
      kicker: 'Ψ₁₁₀ = 0 · SOFA ROW',
      text: `${(SPL_FS - SPL_ONE).toFixed(1)}&nbsp;dB below the antinode`,
      cls: '', offset: [0, -42], occlude: false, priority: 3,
    });
    S.lab.rul = L.add(S.aRule, {
      kicker: 'λ/2 at 30 Hz', value: `${(LAM30 / 2).toFixed(2)} m`,
      cls: 'acc', offset: [0, -26], occlude: false, priority: 2,
    });
    L.add(S.aW, {
      value: `W ${RM.W.toFixed(1)} m`, cls: 'plain', offset: [0, 15], occlude: false, priority: 1,
    });
    L.add(S.aD, {
      value: `D ${RM.D.toFixed(1)} m`, cls: 'plain', offset: [-34, 0], occlude: false, priority: 1,
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
<p>At ${n('30 Hz')} a wavelength is ${n(LAM30.toFixed(2) + ' m')}; the room's longest straight
line is ${n(DIAG3D.toFixed(2) + ' m')}. The steady state is a standing pattern fixed by the
boundaries, not a travelling wave.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Two subwoofers do not flatten
the response at one seat. 20–80 Hz peak-to-peak at the centre seat is
${n(ENV1.pp.toFixed(1) + ' dB')} with one and ${n(ENV2.pp.toFixed(1) + ' dB')} with two —
<em>identical</em>, because that seat lies on the null of every odd lateral mode. What collapses
is the spread <em>between</em> seats: ${n(ENV1.spread.toFixed(1) + ' dB')} to
${n(ENV2.spread.toFixed(1) + ' dB')}.</p></div>

<div class="key"><span class="lab">The idea</span><p>Below Schroeder —
${n(F_SCH.toFixed(0) + ' Hz')} here — the room is a resonator with a fixed geography of loud
and quiet places. A source excites a mode by where it stands.</p></div>

<div class="eq">f = <span class="hl">c/2</span>·√( (p/W)² + (q/D)² + (r/H)² )
<span class="c">W ${RM.W} · D ${RM.D} · H ${RM.H} m · c ${C} m/s</span>
<span class="c">axial </span>${AXIALS.map((f) => f.toFixed(2)).join(' ')}<span class="c"> Hz · LR${XOVER.order} at ${XOVER.fLow} Hz</span></div>

<p>Ψ₁₁₀ meets the two subs, ${n(SUB_OFF.toFixed(2) + ' m')} either side of centre, equal and
opposite: ${n('−' + Math.abs(PSI_R).toFixed(3))} and ${n('+' + Math.abs(PSI_L).toFixed(3))}.
Matched, their sum cannot drive it.</p>`;
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
      { k: 'DRIVE @ 1 m', v: SPL_REF.toFixed(0), u: 'dB', cls: 'am' },
      { k: 'CONE x', v: (x * 1000).toFixed(2), u: 'mm', cls: '', bar: Math.abs(x) / XMAX },
      { k: 'SEAT SPL', v: spl.toFixed(1), u: 'dB', cls: '', bar: (spl - 60) / 40 },
      { k: 'Ψ₁₁₀ SUM', v: psiSum.toFixed(3), u: '', cls: 'acc', bar: Math.abs(psiSum / PSI_R) },
      { k: 'SEAT SPREAD', v: envAt(mix).toFixed(1), u: 'dB', cls: 'am' },
    ];
  },
};
