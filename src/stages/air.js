import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { PAL } from '../core/materials.js';
import { radialSprite } from '../core/tex.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { DRIVER, TS, SPEAKER, AMP, ROOM } from '../core/spec.js';


/* ===========================================================================
 * AIR · ROOM · EAR — the last 4.83 m.
 *
 * No hardware of its own. The subject is the listening geometry, seen from the
 * left of the median plane so that the 4.830 m direct path lies ACROSS the
 * frame instead of running away from the lens: loudspeaker at the left, the
 * floor bounce as a pool on the polished floor in the middle, the seat at the
 * right. A wavefront travels each path at 343.2 m/s and the direct one arrives
 * 1.208 ms ahead of the bounce.
 *
 * ONE plate hangs above it — a magnified window of the air itself, which is the
 * only claim in this chapter that a picture tells better than a sentence. The
 * floor-bounce comb used to be a second plate; it is now two numbers in a label
 * and two in the panel, because the folded amber path in the picture already
 * says everything the plate said.
 *
 * Every primary comes from src/core/spec.js. Nothing here re-declares a driver,
 * a sensitivity or a room; everything else is derived at module load and the
 * derivation is printed on screen.
 * ======================================================================== */

const c = DSP.C_SOUND_20C;                 // 343.2 m/s, dry air at 20 °C
const rho = DSP.RHO_AIR;                   // 1.2041 kg/m³
const Z0 = rho * c;                        // 413.25 Pa·s/m — specific impedance of air

// --- the loudspeaker, straight from the specification ----------------------
/**
 * `TS.spl1W` is one watt at one metre; `SPEAKER.sens` (= TS.spl283) is 2.83 V at
 * one metre, which is one watt into 8 Ω by definition but 1.29 W into this
 * 6.2 Ω coil, so it reads 1.11 dB higher. Every level on this page follows from
 * the 1 W figure; the 2.83 V figure is quoted once, named, in the panel.
 */
const SENS_1W = TS.spl1W;                                      // 90.11 dB @ 1 W / 1 m
const SENS_283 = SPEAKER.sens;                                 // 91.21 dB @ 2.83 V / 1 m
const P_283 = (2.8284 * 2.8284) / DRIVER.Re;                   // 1.2905 W into 6.2 Ω

// --- geometry -------------------------------------------------------------
/**
 * Acoustic centre for this stage: the MIDRANGE axis at 0.985 m on a
 * SPEAKER.height = 1.25 m cabinet. The crossover is LR4 at 80 Hz / 2.20 kHz, so
 * the midrange alone radiates the 300–500 Hz band in which the first floor null
 * falls. Using the tweeter's 1.145 m would move that null by 56 Hz.
 */
const AC_Y = 0.985;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SL = V(LAYOUT.speakerL.x, AC_Y, LAYOUT.speakerL.z);
const SR = V(LAYOUT.speakerR.x, AC_Y, LAYOUT.speakerR.z);
const EAR = V(LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z);

/** Both speakers are the same distance from the seat — the seat is on axis. */
const R_DIR = SR.distanceTo(EAR);                              // 4.8304 m
const T_DIR = R_DIR / c;                                       // 14.07 ms

/** Floor reflection: an image source mirrored in the plane y = 0. */
const IMG_FLOOR = V(SL.x, -SL.y, SL.z);
const R_FLOOR = IMG_FLOOR.distanceTo(EAR);                     // 5.2449 m
const DT_FLOOR = (R_FLOOR - R_DIR) / c;                        // 1.2078 ms
const kFloor = SL.y / (SL.y + EAR.y);
const B_FLOOR = V(SL.x + (EAR.x - SL.x) * kFloor, 0.006, SL.z + (EAR.z - SL.z) * kFloor);

// --- level chain ----------------------------------------------------------
/** CHOSEN: the loudest peak on this track — a third of the monoblock's rating,
 *  taken from the specification so the two chapters cannot drift apart. */
const PEAK_W = Math.round(AMP.pOut8 / 3);                      // 100 W
const SPL_1M = DSP.splAt(SENS_1W, PEAK_W, 1);                  // 110.11 dB
const SPL_SEAT_1 = DSP.splAt(SENS_1W, PEAK_W, R_DIR);          // 96.43 dB
/** Pair, mono-correlated, listener on the median plane: +6.02 dB. */
const SPL_SEAT = SPL_SEAT_1 + DSP.dB(2);                       // 102.45 dB
/**
 * Per LOUDSPEAKER, which is the only way this can be written without mixing
 * references: 100 W into one drive unit at η₀ = 0.647 % makes 0.647 W of sound
 * and 99.35 W of heat. Doubling those for the pair and then quoting a
 * single-speaker SPL in the same clause is the error a reader checks first.
 */
const W_AC_EACH = TS.eta0 * PEAK_W;                            // 0.647 W
const W_HEAT_EACH = PEAK_W - W_AC_EACH;                        // 99.35 W

/**
 * The room hands some of it back. ᾱ is not asserted: Sabine inverted on the
 * specification's own RT60 gives ᾱ = 0.161·V/(S·T60), then R = Sᾱ/(1−ᾱ) and
 * Lp − Ldirect = 10·log10(1 + (4/R)·4πr²/Q).
 *
 * spec.ROOM is {W, D, H} — width across, depth away from the listener, height —
 * matching LAYOUT.room's axis names.
 */
const V_ROOM = ROOM.W * ROOM.D * ROOM.H;                       // 206.46 m³
const S_ROOM = 2 * (ROOM.W * ROOM.D + ROOM.W * ROOM.H + ROOM.D * ROOM.H);   // 234.88 m²
const ABAR = (0.161 * V_ROOM) / (S_ROOM * ROOM.rt60);          // 0.3370
const R_CONST = (S_ROOM * ABAR) / (1 - ABAR);                  // 119.4 m²
const revAdd = (Q) => 10 * Math.log10(1 + (4 / R_CONST) * (4 * Math.PI * R_DIR * R_DIR) / Q);
const rCrit = (Q) => 0.141 * Math.sqrt(Q * R_CONST);
const REV_Q2 = revAdd(2);                                      // +7.72 dB
const REV_Q8 = revAdd(8);                                      // +3.48 dB
/** Q = 2 is the half-space figure for a floorstander in its lower midrange —
 *  the conservative end; a directional Q = 8 would put r_c at 4.36 m. */
const RC_Q2 = rCrit(2);                                        // 2.18 m

// --- particle motion, reference condition ---------------------------------
const F_REF = 1000, SPL_REF = 94;                    // CHOSEN reference condition
const P_REF_PA = DSP.paFromSpl(SPL_REF);             // 1.0024 Pa rms
const U_REF = P_REF_PA / Z0;                         // 2.4256 mm/s rms
const W_REF = DSP.TAU * F_REF;
const XI_REF = U_REF / W_REF;                        // 0.3860 µm rms
const XI_PK = XI_REF * Math.SQRT2;                   // 0.5460 µm peak
const U_PK = U_REF * Math.SQRT2;                     // 3.4303 mm/s peak
/** Peak speeds. A sinusoid's MEAN speed is 2/π of its peak, so distances
 *  covered in the same time stand at (π/2)× this — the odometer ratio. */
const SPEED_RATIO = c / U_PK;                        // 1.0005 × 10⁵
const PATH_RATIO = SPEED_RATIO * (Math.PI / 2);      // 1.5716 × 10⁵

/** Threshold of hearing: 20 µPa at 1 kHz. */
const XI_THR_PK = ((DSP.P_REF / Z0) / W_REF) * Math.SQRT2;     // 10.89 pm peak
const BOHR_D = 2 * 52.9177e-12;                      // 105.8 pm, hydrogen

// --- cone to pressure -----------------------------------------------------
const F_BASS = 40;
const X_CONE = DRIVER.Xmax / 2;                        // ±4.0 mm peak, half of Xmax
const SPL_BASS_SEAT = DSP.splFromExcursion(X_CONE, F_BASS, DRIVER.Sd, R_DIR) + DSP.dB(2);
/** ±6.7 µm at the seat against ±4.0 mm at the cone: 599 : 1. */
const XI_SEAT_BASS_PK = ((DSP.paFromSpl(SPL_BASS_SEAT) / Z0) / (DSP.TAU * F_BASS)) * Math.SQRT2;

// --- the room's answer: the floor bounce comb ------------------------------
/** CHOSEN: a hard floor, pressure reflection coefficient 0.90 (α = 0.19). */
const R_HARD = 0.90;
const COMB_A = (R_DIR / R_FLOOR) * R_HARD;             // 0.8289
const COMB_NULL_F = 1 / (2 * DT_FLOOR);                // 414.0 Hz
const COMB_NULL_DB = DSP.dB(1 - COMB_A);               // −15.34 dB
const COMB_PEAK_F = 1 / DT_FLOOR;                      // 827.9 Hz
const COMB_PEAK_DB = DSP.dB(1 + COMB_A);               // +5.25 dB

// --- parcel-window layout -------------------------------------------------
const LAM_REF = DSP.lambda(F_REF, c);                         // 0.3432 m at 1 kHz
const N_LAM = 2, PER_LAMBDA = 13;
const COLS = N_LAM * PER_LAMBDA + 1;                          // 27
const SPACING = LAM_REF / PER_LAMBDA;                         // 26.4 mm
const SPAN = (COLS - 1) * SPACING;                            // 0.6864 m = 2λ
const K_REF = DSP.TAU / LAM_REF;                              // 18.31 rad/m

/**
 * λ against the parcel's whole territory, both at ×1:
 *     λ / 2ξ̂ = (c/f) · ω/(2û) = π·c/û = 2 · PATH_RATIO = 3.14 × 10⁵
 * The same number as the odometer ratio in the footer, doubled — one is the
 * distance covered per second, the other the distance covered per half-cycle.
 */
const LAM_XI_RATIO = LAM_REF / (2 * XI_PK);                   // 3.1432 × 10⁵

/**
 * Row heights inside the plate. The MAGNIFIED block is above the rule and the
 * ×1 block below it, and the horizontal scale is ×1 in BOTH — only the
 * displacement is magnified, and only above the rule. The amber territory bar
 * therefore lives above the rule with the parcels it belongs to, and the grey
 * λ arrow lives below it with the true-scale rows. Nothing on this plate is a
 * ×25 000 object under a ×1 heading.
 */
const ROWS_M = [0.194, 0.164, 0.134, 0.104, 0.074];
const ROWS_T = [-0.060, -0.096];
const Y_TRK = 0.028;                       // amber 2ξ bar, magnified block
const Y_DIV = -0.010;                      // the rule between the two blocks
const Y_LAM = -0.196;                      // grey λ arrow, ×1 block
const Y_TOP = ROWS_M[0], Y_BOT = Y_LAM;

/**
 * Displacement magnification for the MAGNIFIED block only.
 * The map x → x + ξ·cos(kx − ωt) stays monotonic — parcels never cross, so the
 * drawn density never goes negative — only while ξ·k < 1. ξ·k = 0.25 keeps a
 * clearly visible ±25 % density swing while holding the as-drawn speed ratio
 * (crest : parcel = 1/ξk) to 4 : 1. That is still nothing like the true
 * 1.00×10⁵ : 1, which is why the bottom two rows are drawn at ×1 and why both
 * ratios are stated on the plate.
 */
const XI_K = 0.25;
const XI_DRAWN = XI_K / K_REF;                                // 0.013654 m
const MAG = XI_DRAWN / XI_PK;                                 // ≈ 25 000 ×
const MAG_R = Math.round(MAG / 500) * 500;
const MAG_S = MAG_R.toLocaleString('en-GB');
const DRAWN_RATIO = 1 / XI_K;                                 // 4.0 : 1 as drawn

// ---------------------------------------------------------------------------
const S = {};   // module-scope state — exactly one instance of this stage exists
const _col = new THREE.Color();
const C_DIM = new THREE.Color(PAL.cyDim).lerp(new THREE.Color(PAL.cy), 0.34);
const C_HOT = new THREE.Color(PAL.cy);
const fmt = (v, d) => v.toFixed(d);
const sgn = (v, d, mul = 1) => (v >= 0 ? '+' : '−') + Math.abs(v * mul).toFixed(d);
/** Labels are inline spans; a break is needed between .t and .v. */
const br = (s) => s + '<br>';

/**
 * Write every live world label from the LATCHED instant. Called only from
 * readouts(), so the plate's ξ and the footer's PARCEL DISPL are the same
 * sample. Writing it from update() instead leaves the label one 100 ms latch
 * behind the footer, and a still frame then shows two different instants.
 */
function syncLabels() {
  if (!S.lab || !S.shown) return;
  S.lab.air.setValue('ξ = ' + sgn(S.shown.xi, 3, 1e6) + ' of ' + fmt(XI_PK * 1e6, 3) + ' µm peak');
}

/**
 * `fadeTree` calls a group's `userData.setOpacity` hook and then still walks
 * into the group, so any plain mesh inside caches its base opacity *after* the
 * hook has already scaled it. The first fade of a stage is `fadeTree(overlay, 0)`,
 * so those meshes cache a base of 0 and never reappear. Dropping the hook lets
 * fadeTree treat each child individually, which it does correctly.
 */
const noHook = (g) => { delete g.userData.setOpacity; return g; };

/**
 * Centred diagram card: local (0,0) is the middle of the plate.
 *
 * `DIAG.diagramCard` is now a lit dielectric slab with a machined alloy bezel on
 * all four sides — it takes light, shades across its face, casts a shadow and
 * appears in the floor reflection. The wash and the hand-rolled rim that used to
 * sit on top of it here were fighting a card that no longer needs either, and
 * with the widened emitters they turned the plate into a light-grey monitor.
 * Both are gone; the plate is the plate.
 */
function card(w, h) {
  const g = new THREE.Group();
  const k = noHook(DIAG.diagramCard(w, h, { opacity: 1.0, pad: 0.024 }));
  k.position.set(-w / 2, -h / 2, 0);
  g.add(k);
  /**
   * SMOKED FILTER. The plate is a lit dielectric, and with the widened emitters
   * a plate turned toward the key returns enough of it to sit at about 60 %
   * luminance — a light grey rectangle with no contrast left for the data on it.
   * A real instrument face solves this the same way: a smoked filter under the
   * cover glass, which halves the substrate without touching what is drawn on
   * top of it. This sits between the plate and the traces, so the parcels keep
   * their full value and the plate goes back to being a dark plate.
   */
  const smoke = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.040, h + 0.040),
    new THREE.MeshBasicMaterial({
      color: 0x05070a, transparent: true, opacity: 0.62, depthWrite: false,
    }));
  smoke.position.z = 0.0008;
  smoke.renderOrder = 4;
  g.add(smoke);
  return g;
}

/**
 * Push a whole inset above the room's own diagram layer. None of these
 * primitives write depth, so paint order is the only thing that stops a ray
 * five metres away drawing straight through a foreground plate.
 */
function liftOrder(root, base = 30) {
  root.traverse((o) => {
    if (o.isMesh || o.isLine || o.isLine2 || o.isSprite) o.renderOrder = base + (o.renderOrder || 0);
  });
}

function anchor(parent, x, y, z = 0) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** A polyline through explicit points. */
function poly(pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => [pts[i][0], pts[i][1], pts[i][2] ?? 0]);
  return t;
}

// ---------------------------------------------------------------------------
// THE PATHS, AND HOW THEY ARE DRAWN
// ---------------------------------------------------------------------------
/**
 * A ray is carrying 1/r pressure, so it must not be a line of one value from
 * end to end: that is the tractor-beam tell. Opacity here follows the pressure
 * the ray is actually carrying,
 *
 *     p(s) ∝ 1/s      referenced to the 1 m point,
 *
 * so the beam is at full weight leaving the drive unit and has fallen to 1/4.83
 * — 13.7 dB — by the time it reaches the seat. The folded path takes a further
 * ×0.90 at the bounce, which is the same pressure reflection coefficient the
 * comb figures are computed from, so the amber ray visibly steps down where it
 * touches the floor.
 */
const OP_REF = 0.62;                       // opacity at the 1 m reference point
const beamOp = (s, k = 1) => OP_REF * k * (1 / Math.max(1, s));

/** Cumulative arc length along a polyline path. */
function arcs(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return cum;
}
/** Point at arc length s along a polyline. */
function pointAt(pts, cum, s) {
  const t = DSP.clamp(s, 0, cum[cum.length - 1]);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const f = (t - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
  return pts[i - 1].clone().lerp(pts[i], f);
}

/**
 * Draw a path as a chain of short hairlines whose opacity is the 1/r law
 * sampled at each segment's midpoint. `refl` is the running pressure
 * coefficient (1 before the bounce, 0.90 after it).
 */
function rayPath(group, pts, color, coreW, opts = {}) {
  /**
   * `gain` is a LUMINANCE match, not a level: PAL.am at the same alpha reads
   * about 20 % brighter than PAL.cy, and the amber path must not look louder
   * than the direct one when it is in fact 0.83 of the pressure. The physics is
   * carried entirely by `refl` and the 1/r law.
   */
  const { segs = 9, dashed = false, halo = true, refl = () => 1, gain = 1 } = opts;
  const cum = arcs(pts);
  const L = cum[cum.length - 1];
  for (let i = 0; i < segs; i++) {
    const s0 = (i / segs) * L, s1 = ((i + 1) / segs) * L;
    const sm = (s0 + s1) / 2;
    const a = pointAt(pts, cum, Math.max(0, s0 - 0.004));
    const b = pointAt(pts, cum, Math.min(L, s1 + 0.004));
    const op = beamOp(sm, refl(sm)) * gain;
    const p = [[a.x, a.y, a.z], [b.x, b.y, b.z]];
    if (halo) group.add(poly(p, color, coreW * 3.4, { opacity: op * 0.13, renderOrder: 9 }));
    group.add(poly(p, color, coreW, {
      opacity: op, renderOrder: 11, dashed,
      dashSize: 0.075, gapSize: 0.055,
    }));
  }
  return { pts, cum, L };
}

/** A circle lying in the world XZ plane at height y. */
function floorRing(cx, cz, r, y, colour, width, opacity, n = 84) {
  const t = new DIAG.Trace(n, colour, width, { opacity, renderOrder: 11 });
  t.write((i, u) => [cx + Math.cos(u * DSP.TAU) * r, y, cz + Math.sin(u * DSP.TAU) * r]);
  return t;
}

/**
 * A pool of light lying on the polished floor. The floor carries a real planar
 * reflection, and a hard-edged additive ring on a near-black plane has nothing
 * between the ring and the black. This puts a wide, very soft gradient under the
 * bounce so there is a mid-grey ramp for the reflection to work on.
 */
function floorPool(x, z, r, colour, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({
      map: radialSprite(256, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 2.4),
      color: colour, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.004, z);
  m.renderOrder = 7;
  return m;
}

// ---------------------------------------------------------------------------
// THE SHOT, and a way of placing the plate inside it.
// ---------------------------------------------------------------------------
/**
 * The previous framing put a 0.86 m sphere 1.22 m up and 0.2 m in front of the
 * seat, which framed the two diagram plates and squeezed the entire system into
 * a 200 px strip along the bottom edge. It also sat almost on the median plane,
 * where the 4.830 m direct path runs straight away from the lens and collapses
 * to a couple of hundred pixels.
 *
 * This shot swings 23° to the left of the median plane and drops the lens to
 * 1.93 m so that:
 *   · the direct path lies ACROSS the frame — 530 px of the 960 px clear band —
 *     with the loudspeaker at the left and the seat at the right;
 *   · the floor bounce sits between them at the bottom of the triangle, on the
 *     polished floor where the planar reflection can work on it;
 *   · the lens is low enough that the reflected cabinets and the reflected
 *     bounce fill the lower third, so the picture is not one thin band.
 *
 * 23° is as far round as the set goes: at 36° the camera looks past the top
 * corner of the cyclorama and the frame gains a hard black wedge and a visible
 * seam where the lit sweep ends.
 */
const SHOT = frameShot([-0.72, 1.06, -0.75], 1.52, { fill: 0.60, az: -0.40, el: 0.115, fov: 35 });

const CAM_P = V(...SHOT.position);
const CAM_F = V(...SHOT.target).sub(CAM_P).normalize();
const CAM_R = CAM_F.clone().cross(V(0, 1, 0)).normalize();
const CAM_U = CAM_R.clone().cross(CAM_F).normalize();
const D2R = Math.PI / 180;
/**
 * Place the plate at a chosen angle off the lens axis. The Director's shift lens
 * puts the axis at the centre of the clear band (screen x 670 of 1600), so at
 * fov 35 the SAFE BOX runs from −17.7° to +15.7° horizontally and +14.4° to
 * −15.3° vertically. The plate's edges are inside that.
 */
const place = (hDeg, vDeg, dist) => CAM_P.clone().addScaledVector(
  CAM_F.clone()
    .addScaledVector(CAM_R, Math.tan(hDeg * D2R))
    .addScaledVector(CAM_U, Math.tan(vDeg * D2R))
    .normalize(), dist);

/** The plate hangs in the empty upper-left band, clear of every silhouette. */
const D_AIR = 4.60;
const P_AIR = place(-9.66, 9.13, D_AIR);

/**
 * Screen scale of the plate at the delivered 1600 × 1000 basis, so the claim
 * "2ξ is under a thousandth of a pixel" is measured rather than asserted.
 */
const PX_PER_M = 1600 / (2 * D_AIR * Math.tan((SHOT.fov * Math.PI) / 360) * 1.6);
const XI_PX = 2 * XI_PK * PX_PER_M;                          // 3.9 × 10⁻⁴ px

// ---------------------------------------------------------------------------
// THE WAVEFRONT
// ---------------------------------------------------------------------------
/**
 * A short bright segment travelling each path at the true 343.2 m/s, on the
 * stage's own 1 : 500 clock. This is NOT a dot racing along a wire: it is the
 * disturbance, at its real speed, and the plate above it shows — at ×1 — that
 * the air it passes through does not go with it. That contrast is the chapter.
 *
 * `PIP_PHASE` is a phase offset on the launch cycle, chosen so the delivered
 * still lands with the direct wavefront a few centimetres short of the seat and
 * the floor wavefront still 0.6 m behind it: one picture, both arrivals, the
 * 1.208 ms gap visible as a gap. The relationship between the two is correct at
 * every instant; the offset only chooses which instant the poster frame shows.
 */
const LAUNCH = 0.0220;             // s of simulated time between launches
const PIP_PHASE = 0.00830;
const PIP_LEN = 0.46;              // m of path lit at once

export default {
  id: 'air',
  title: 'Air, Room, Ear',
  nav: 'Air &amp; ear',
  kicker: 'Air & ear',          // set with textContent — a literal ampersand
  standfirst: 'The air never travels. Only the news does.',
  shot: SHOT,
  /** One clock for the whole stage: 1 : 500. A 1 kHz cycle takes 0.5 s on screen,
   *  and the 14.07 ms flight to the seat takes 7.0 s. */
  timeScale: 0.002,

  build(ctx) {
    const overlay = new THREE.Group();
    overlay.name = 'air-overlay';
    const L = ctx.labels;
    const spr = radialSprite(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 1.7);

    // =====================================================================
    // 1 · THE PATHS — one direct ray, one floor bounce, one ear
    // =====================================================================
    const field = new THREE.Group();
    overlay.add(field);

    // The left channel: the ray this chapter follows.
    S.pathD = rayPath(field, [SL, EAR], PAL.cy, 1.4);
    /**
     * The right channel is drawn because the level at the seat is the correlated
     * PAIR, +6.02 dB. It is dashed rather than dimmed: it carries exactly the
     * same pressure as the left, and drawing it at a lower value would say
     * otherwise. Dashing says "same thing, not the subject".
     */
    rayPath(field, [SR, EAR], PAL.cy, 0.9, { segs: 6, dashed: true, halo: false });
    // The folded path: down to the floor and back up, ×0.90 after the bounce.
    S.pathF = rayPath(field, [SL, B_FLOOR, EAR], PAL.am, 1.3, {
      segs: 10, gain: 0.82, refl: (s) => (s > SL.distanceTo(B_FLOOR) ? R_HARD : 1),
    });

    // The drive units: a small open marker, not a light source.
    for (const src of [SL, SR]) {
      const g = DIAG.glow(PAL.cy, 0.052, src === SL ? 0.42 : 0.20, spr);
      g.position.copy(src);
      field.add(g);
    }

    // The bounce point on the polished floor — the floor mirrors it back.
    field.add(floorPool(B_FLOOR.x, B_FLOOR.z, 0.70, PAL.am, 0.070));
    field.add(floorRing(B_FLOOR.x, B_FLOOR.z, 0.105, 0.010, PAL.am, 1.5, 0.60));
    field.add(floorRing(B_FLOOR.x, B_FLOOR.z, 0.168, 0.010, PAL.am, 0.9, 0.20));

    // ---- the travelling wavefronts ---------------------------------------
    S.pipD = poly([[0, 0, 0], [0, 0, 0]], PAL.cy, 2.4, { opacity: 0.92, renderOrder: 15 });
    S.pipDh = poly([[0, 0, 0], [0, 0, 0]], PAL.cy, 7.0, { opacity: 0.13, renderOrder: 14 });
    S.pipF = poly([[0, 0, 0], [0, 0, 0]], PAL.am, 2.0, { opacity: 0.80, renderOrder: 15 });
    S.pipFh = poly([[0, 0, 0], [0, 0, 0]], PAL.am, 6.0, { opacity: 0.11, renderOrder: 14 });
    field.add(S.pipD, S.pipDh, S.pipF, S.pipFh);

    // ---- the ear ----------------------------------------------------------
    /**
     * A flat marker, not a glowing terminal ball with concentric rings: one thin
     * ring in the image plane and two short ticks. The plumb line below it lands
     * in the headrest of the chair directly beneath, which is what fixes the
     * marker to the seat rather than to the rack five metres behind it.
     */
    S.earRing = new DIAG.Trace(56, PAL.cy, 1.4, { opacity: 0.88, renderOrder: 13 });
    field.add(S.earRing);
    S.earTick = [
      new DIAG.Trace(2, PAL.cy, 1.4, { opacity: 0.7, renderOrder: 13 }),
      new DIAG.Trace(2, PAL.cy, 1.4, { opacity: 0.7, renderOrder: 13 }),
    ];
    field.add(...S.earTick);
    field.add(poly([[EAR.x, EAR.y - 0.085, EAR.z], [EAR.x, 0.22, EAR.z]], PAL.cy, 1.0,
      { opacity: 0.34, dashed: true, dashSize: 0.030, gapSize: 0.024, renderOrder: 12 }));

    // =====================================================================
    // 2 · THE PARCEL WINDOW — the one plate
    // =====================================================================
    const CW = 0.94, CH = 0.54;
    const air = card(CW, CH);
    air.position.copy(P_AIR);
    air.userData.yaw = 0.150;                 // off the lens axis: see update()
    air.userData.pitch = -0.048;
    overlay.add(air);
    S.air = air;

    /**
     * The window's content runs from the crest arrow at +0.241 down to the λ
     * arrow's tick at −0.216, so its own centre is 0.0125 above the plate's.
     * Everything below hangs off `wnd`, which carries that offset, and the
     * margins above and below the drawing are then equal. Left as-is the plate
     * has a visibly deeper empty band along its bottom edge.
     */
    const wnd = new THREE.Group();
    wnd.position.y = -0.0125;
    air.add(wnd);

    S.swarm = new DIAG.Swarm(COLS * (ROWS_M.length + ROWS_T.length),
      { color: PAL.cy, size: 0.0092 });
    wnd.add(S.swarm);

    // the compression maximum, travelling at ω/k = c through both blocks
    S.crest = poly([[0, Y_BOT - 0.024, 0.003], [0, Y_TOP + 0.030, 0.003]], PAL.cy, 1.3,
      { opacity: 0.42, dashed: true, dashSize: 0.014, gapSize: 0.011 });
    wnd.add(S.crest);
    S.crestTip = poly([[-0.013, Y_TOP + 0.030, 0.003], [0, Y_TOP + 0.047, 0.003],
      [0.013, Y_TOP + 0.030, 0.003]], PAL.cy, 1.9, { opacity: 0.8 });
    wnd.add(S.crestTip);

    /**
     * ABOVE THE RULE, with the block it belongs to: the whole territory of one
     * parcel, a bar 2·ξ_drawn = 27.3 mm long under the tracked column, at the
     * same ×25 000 as the parcels immediately above it. A dashed leader ties it
     * to the parcel it measures.
     */
    wnd.add(poly([[-XI_DRAWN, Y_TRK, 0.002], [XI_DRAWN, Y_TRK, 0.002]], PAL.am, 3.0,
      { opacity: 0.92 }));
    for (const sx of [-1, 1]) {
      wnd.add(poly([[sx * XI_DRAWN, Y_TRK - 0.015, 0.002], [sx * XI_DRAWN, Y_TRK + 0.015, 0.002]],
        PAL.am, 1.6, { opacity: 0.85 }));
    }
    S.trkLead = poly([[0, ROWS_M[ROWS_M.length - 1] - 0.006, 0.002], [0, Y_TRK + 0.016, 0.002]],
      PAL.am, 1.0, { opacity: 0.34, dashed: true, dashSize: 0.008, gapSize: 0.007 });
    wnd.add(S.trkLead);
    // small, because the bar it rides on is only 27 mm of a 343 mm wave and a
    // fat dot swallows the very measurement it is supposed to be marking
    S.trkDot = DIAG.glow(PAL.am, 0.013, 0.9, spr);
    S.trkDot.position.set(0, Y_TRK, 0.004);
    wnd.add(S.trkDot);

    // the rule between the magnified block and the ×1 block
    wnd.add(poly([[-SPAN / 2 - 0.020, Y_DIV, 0.001], [SPAN / 2 + 0.020, Y_DIV, 0.001]],
      PAL.ink3, 1.0, { opacity: 0.34, dashed: true, dashSize: 0.018, gapSize: 0.015 }));

    /**
     * BELOW THE RULE, everything at ×1: two rows of parcels whose real ±0.546 µm
     * is 2×10⁻⁵ of the 26.4 mm column spacing and therefore invisible, one λ drawn
     * full size, and the parcel's true territory marked — not drawn — by a
     * hairline at the centre of it. 2ξ is λ/314 000, i.e. 4×10⁻⁴ px on this
     * plate, so a mark is the only honest way to put it on the page at all.
     */
    wnd.add(noHook(DIAG.dimension(
      [-LAM_REF / 2, Y_LAM, 0.002], [LAM_REF / 2, Y_LAM, 0.002],
      { color: PAL.ink3, width: 1.3, head: 0.018 })));
    wnd.add(poly([[0, Y_LAM - 0.016, 0.003], [0, Y_LAM + 0.016, 0.003]], PAL.am, 1.4,
      { opacity: 0.85 }));

    const aTitle = anchor(air, CW / 2, CH / 2);

    /**
     * THE SPECULAR LAYER. `GEO.instrumentGlass` is crowned, so the studio's wide
     * front strip lands on it as a soft band that sweeps as the plate turns,
     * rather than as a rectangle with corners; its reflectivity is 0.34, which is
     * a coated cover glass returning ~1.7 % at normal incidence rather than the
     * 4 % of bare glass. It sits 3 mm in front of the emissive traces. This
     * replaces a hand-rolled near-mirror that returned the whole softbox.
     */
    liftOrder(air, 44);
    const glass = GEO.instrumentGlass(CW + 0.030, CH + 0.030);
    glass.position.z = 0.006;
    glass.renderOrder = 92;
    air.add(glass);

    // =====================================================================
    // LABELS — three, and no more
    // =====================================================================
    S.lab = {};
    S.lab.air = L.add(aTitle, {
      kicker: 'Air parcels · 1 kHz · 94 dB',
      text: br('above the rule, ξ ×' + MAG_S + ': the crest gains '
        + fmt(DRAWN_RATIO, 0) + ' : 1, not ' + fmt(SPEED_RATIO / 1e5, 2)
        + '×10⁵<br>below it ×1: λ ' + fmt(LAM_REF * 1000, 1) + ' mm drawn; 2ξ = λ/'
        + (Math.round(LAM_XI_RATIO / 1000) * 1000).toLocaleString('en-GB')
        + ' = ' + XI_PX.toFixed(4) + ' px, marked'),
      value: 'ξ = +0.000 of ' + fmt(XI_PK * 1e6, 3) + ' µm peak',
      cls: 'acc', occlude: false, priority: 5, offset: [160, 40],
    });
    S.lab.seat = L.add(EAR.clone(), {
      kicker: 'At the seat · ' + fmt(R_DIR, 3) + ' m · wavefront ' + fmt(c, 1) + ' m/s',
      /** The reverberant field lives here rather than in the panel: it belongs
       *  to the seat, and the panel has no room for the Sabine sentence. */
      text: br(PEAK_W + ' W → ' + fmt(SPL_1M, 1) + ' dB at 1 m → '
        + fmt(SPL_SEAT_1, 1) + ' dB here<br>+' + fmt(REV_Q8, 1) + '–'
        + fmt(REV_Q2, 1) + ' dB of room (r_c ' + fmt(RC_Q2, 1) + ' m)'),
      value: fmt(SPL_SEAT, 1) + ' dB SPL, the pair · ' + fmt(T_DIR * 1000, 2) + ' ms',
      cls: 'acc', priority: 4, offset: [-96, -126],
    });
    S.lab.floor = L.add(B_FLOOR.clone().setY(0.02), {
      kicker: 'Floor bounce · image source ' + fmt(AC_Y, 3) + ' m down · ρ ' + fmt(R_HARD, 2),
      value: '+' + fmt(R_FLOOR - R_DIR, 3) + ' m · +' + fmt(DT_FLOOR * 1000, 3)
        + ' ms · ' + fmt(COMB_NULL_DB, 1) + ' dB at ' + fmt(COMB_NULL_F, 0) + ' Hz',
      cls: 'am', priority: 3, offset: [-40, 104],
    });

    S.overlay = overlay;

    // seed one frame so the very first render is never empty
    this.update(0, 0, ctx);
    return { hardware: null, overlay };
  },

  update(dt, t, ctx) {
    const ph = W_REF * t;

    // ---- the parcel window ------------------------------------------------
    if (S.swarm) {
      const half = (COLS - 1) / 2;
      const nM = ROWS_M.length;
      S.swarm.update((idx) => {
        const j = idx % COLS, r = (idx / COLS) | 0;
        const mag = r < nM;
        const y = mag ? ROWS_M[r] : ROWS_T[r - nM];
        const x0 = (j - half) * SPACING;
        const arg = K_REF * x0 - ph;
        // Above the rule: displacement magnified ×MAG. Below it: the real
        // ±0.546 µm, which is 2×10⁻⁵ of a 26.4 mm spacing and therefore
        // invisible — that is the point of drawing it.
        const disp = (mag ? XI_DRAWN : XI_PK) * Math.cos(arg);
        // Condensation is −∂ξ/∂x ∝ sin(arg). Size and colour carry it
        // normalised, so both blocks read as the same wave: below the rule the
        // wave survives as brightness alone, because the motion is not drawable.
        const u = 0.5 + 0.5 * Math.sin(arg);
        const zj = ((j * 37 + r * 91) % 17) / 17 - 0.5;
        const tracked = mag && j === half && r === nM - 1;
        _col.copy(C_DIM).lerp(C_HOT, u);
        return {
          p: [x0 + disp, y, zj * 0.012],
          s: (tracked ? 1.7 : 1.0) * (0.78 + 0.62 * u) * (mag ? 1 : 0.88),
          c: tracked ? C_HOT : _col,
        };
      });
    }
    if (S.crest) {
      // the compression maximum sits at k·x − ω·t = π/2, so it advances at ω/k = c.
      // Wrap over exactly the wavelengths on show, so it always lands on a crest.
      let xc = (ph + Math.PI / 2) / K_REF;
      xc = ((xc + SPAN / 2) % SPAN + SPAN) % SPAN - SPAN / 2;
      S.crest.write((i) => [xc, i === 0 ? Y_BOT - 0.024 : Y_TOP + 0.030, 0.003]);
      S.crestTip.write((i) => [
        xc + [-0.013, 0, 0.013][i], [Y_TOP + 0.030, Y_TOP + 0.047, Y_TOP + 0.030][i], 0.003,
      ]);
    }
    if (S.trkDot) {
      const xt = XI_DRAWN * Math.cos(ph);
      S.trkDot.position.x = xt;
      S.trkLead.write((i) => [xt, i === 0 ? ROWS_M[ROWS_M.length - 1] - 0.006 : Y_TRK + 0.013, 0.002]);
    }

    // ---- the wavefronts ---------------------------------------------------
    // s = c·t_since_launch, in metres of path. Both launch together; the direct
    // arrives at 14.07 ms and the folded one 1.208 ms later.
    const tf = ((t + PIP_PHASE) % LAUNCH + LAUNCH) % LAUNCH;
    const sWave = c * tf;
    const pip = (core, halo, path, refl) => {
      const s1 = Math.min(sWave, path.L);
      const s0 = Math.max(0, s1 - PIP_LEN);
      const a = pointAt(path.pts, path.cum, s0), b = pointAt(path.pts, path.cum, s1);
      const live = sWave > 0.02 && sWave < path.L + PIP_LEN * 0.6;
      core.visible = halo.visible = live;
      if (!live) return;
      const k = beamOp(Math.max(1, s1), refl(s1)) / OP_REF;      // the 1/r law again
      core.material.opacity = core._baseOpacity * DSP.clamp(0.30 + 0.70 * k, 0, 1);
      halo.material.opacity = halo._baseOpacity * DSP.clamp(0.30 + 0.70 * k, 0, 1);
      for (const tr of [core, halo]) tr.write((i) => (i === 0 ? [a.x, a.y, a.z] : [b.x, b.y, b.z]));
    };
    if (S.pathD) {
      pip(S.pipD, S.pipDh, S.pathD, () => 1);
      pip(S.pipF, S.pipFh, S.pathF,
        (s) => (s > SL.distanceTo(B_FLOOR) ? R_HARD : 1));
    }

    // ---- live state -------------------------------------------------------
    // One instant, one set of numbers. `readouts()` latches this at 10 Hz and
    // writes the world label from the SAME latch, so a still frame can never
    // show a footer and a label that disagree.
    S.live = {
      xi: XI_PK * Math.cos(ph),
      u: -U_PK * Math.sin(ph),
      // Two odometers on ONE clock — the time since this wavefront left the
      // drive unit — so the footer's two figures divide into PATH_RATIO and the
      // reader can check the 1.57×10⁵ claim without being told it.
      news: sWave,
      path: 4 * XI_PK * F_REF * tf,
    };
    if (!S.shown) { S.shown = S.live; syncLabels(); }

    /**
     * The plate is a billboard yawed a few degrees off the lens axis. A card
     * exactly square to the lens is always a decal: its cover glass returns one
     * flat value and its edges have no thickness. A small yaw and pitch let the
     * widened front strip sweep across the crowned glass as a band and give the
     * plate's bezel a highlight that changes along its length.
     */
    if (S.air) {
      S.air.quaternion.copy(ctx.camera.quaternion);
      S.air.rotateY(S.air.userData.yaw);
      S.air.rotateX(S.air.userData.pitch);
    }
    // the ear marker is drawn in the image plane too
    if (S.earRing) {
      const cam = ctx.camera;
      const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const at = (dx, dy) => [
        EAR.x + rt.x * dx + upv.x * dy, EAR.y + rt.y * dx + upv.y * dy,
        EAR.z + rt.z * dx + upv.z * dy,
      ];
      S.earRing.write((i, u) => at(Math.cos(u * DSP.TAU) * 0.062, Math.sin(u * DSP.TAU) * 0.062));
      S.earTick[0].write((i) => at(i === 0 ? 0.082 : 0.124, 0));
      S.earTick[1].write((i) => at(i === 0 ? -0.082 : -0.124, 0));
    }
  },

  content() {
    return `
<h3>Air is not a conveyor</h3>
<div class="myth"><span class="lab">Commonly got wrong</span><p>Sound is not moving
air. The woofer sends a disturbance: each parcel oscillates about a fixed point
and stays there. A 40 Hz note swings it
±<span class="num">${fmt(XI_SEAT_BASS_PK * 1e6, 1)}</span> µm at the seat; the
threshold of hearing, ±<span class="num">${(XI_THR_PK * 1e12).toFixed(1)}</span> pm —
a tenth of a hydrogen atom's ${(BOHR_D * 1e12).toFixed(0)} pm.</p></div>

<div class="eq">1 kHz, 94 dB SPL <span class="c">(p = ${fmt(P_REF_PA, 2)} Pa rms)</span>
u = p/ρc = ${fmt(P_REF_PA, 2)}/${fmt(Z0, 1)}   = <span class="hl">${fmt(U_REF * 1e3, 2)} mm/s</span>
ξ = u/ω  = 2.43e−3/${W_REF.toFixed(0)} = <span class="hl">${fmt(XI_REF * 1e6, 3)} µm</span> <span class="c">rms</span>
c/û = ${fmt(c, 1)}/${fmt(U_PK * 1e3, 2)}e−3  = <span class="hl">${fmt(SPEED_RATIO / 1e5, 2)}×10⁵</span></div>

<p>A wavefront crosses the room in
<span class="num">${fmt(T_DIR * 1000, 2)}</span> ms; a parcel covers
<span class="num">${(4 * XI_PK * F_REF * T_DIR * 1e6).toFixed(1)}</span> µm in the
same time. The footer's two odometers divide into
<span class="num">${fmt(PATH_RATIO / 1e5, 2)}×10⁵</span>.</p>

<h3>Level, and the floor</h3>
<div class="eq">1 W/1 m ${fmt(SENS_1W, 2)} dB <span class="c">(η₀ ${fmt(TS.eta0 * 100, 3)} %)</span>
2.83 V = ${fmt(P_283, 2)} W in ${DRIVER.Re} Ω → ${fmt(SENS_283, 2)} dB
${PEAK_W} W → ${fmt(W_AC_EACH, 2)} W sound + ${fmt(W_HEAT_EACH, 1)} W heat
<span class="hl">${fmt(SPL_SEAT_1, 1)} dB</span> at ${fmt(R_DIR, 3)} m · <span class="hl">${fmt(SPL_SEAT, 1)} dB</span> the pair
floor +${fmt(DT_FLOOR * 1000, 3)} ms ×${fmt(COMB_A, 2)}: ${fmt(COMB_NULL_DB, 1)} @${fmt(COMB_NULL_F, 0)} +${fmt(COMB_PEAK_DB, 1)} @${fmt(COMB_PEAK_F, 0)}</div>

<p>The floor is that axis mirrored, arriving late: one event, coloured, not an
echo.</p>`;
  },

  readouts() {
    // latch: the footer and the world labels must show the SAME instant
    if (S.live) { S.shown = S.live; syncLabels(); }
    const v = S.shown || { xi: 0, u: 0, news: 0, path: 0 };
    return [
      { k: 'DIRECT AT SEAT', v: fmt(SPL_SEAT, 1), u: 'dB SPL', cls: 'acc', bar: (SPL_SEAT - 40) / 80 },
      { k: 'FLOOR NULL', v: fmt(COMB_NULL_DB, 1), u: 'dB @ ' + fmt(COMB_NULL_F, 0) + ' Hz', cls: 'am' },
      { k: 'PARCEL DISPL', v: sgn(v.xi, 3, 1e6), u: 'µm pk', cls: 'acc' },
      { k: 'PARCEL VEL', v: sgn(v.u, 2, 1e3), u: 'mm/s' },
      { k: 'WAVEFRONT', v: fmt(v.news, 2), u: 'm of ' + fmt(R_DIR, 2), cls: 'acc', bar: v.news / R_DIR },
      { k: 'PARCEL, SAME TIME', v: fmt(v.path * 1e6, 1), u: 'µm' },
    ];
  },
};
