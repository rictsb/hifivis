import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import { radialSprite } from '../core/tex.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { DRIVER, TS, SPEAKER, AMP, MAINS, ROOM } from '../core/spec.js';

/* ===========================================================================
 * AIR · ROOM · EAR — the last 4.83 m.
 *
 * No hardware of its own. The subject is the path: one loudspeaker, one direct
 * ray, one floor bounce, one ear. Two plates flank it — a magnified window of
 * the air at 1 kHz, and what the floor does to the response.
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
const B_FLOOR = V(SL.x + (EAR.x - SL.x) * kFloor, 0, SL.z + (EAR.z - SL.z) * kFloor);

// --- level chain ----------------------------------------------------------
/** CHOSEN: the loudest peak on this track, a third of the monoblock's rating. */
const PEAK_W = 100;
const AMP_HEADROOM_DB = DSP.dBpow(AMP.pOut8 / PEAK_W);         // +4.77 dB in hand
const SPL_1M = DSP.splAt(SENS_1W, PEAK_W, 1);                  // 110.11 dB
const SPL_SEAT_1 = DSP.splAt(SENS_1W, PEAK_W, R_DIR);          // 96.43 dB
/** Pair, mono-correlated, listener on the median plane: +6.02 dB. */
const SPL_SEAT = SPL_SEAT_1 + DSP.dB(2);                       // 102.45 dB
const W_AC_EACH = TS.eta0 * PEAK_W;                            // 0.647 W
const W_AC = 2 * W_AC_EACH;                                    // 1.293 W
const W_HEAT = 2 * (PEAK_W - W_AC_EACH);                       // 198.7 W

/**
 * The room hands some of it back. ᾱ is not asserted: Sabine inverted on the
 * specification's own RT60 gives ᾱ = 0.161·V/(S·T60), then R = Sᾱ/(1−ᾱ) and
 * Lp − Ldirect = 10·log10(1 + (4/R)·4πr²/Q).
 */
const V_ROOM = ROOM.L * ROOM.W * ROOM.H;                       // 206.46 m³
const S_ROOM = 2 * (ROOM.L * ROOM.W + ROOM.L * ROOM.H + ROOM.W * ROOM.H);   // 234.88 m²
const ABAR = (0.161 * V_ROOM) / (S_ROOM * ROOM.rt60);          // 0.3370
const R_CONST = (S_ROOM * ABAR) / (1 - ABAR);                  // 119.4 m²
const revAdd = (Q) => 10 * Math.log10(1 + (4 / R_CONST) * (4 * Math.PI * R_DIR * R_DIR) / Q);
const rCrit = (Q) => 0.141 * Math.sqrt(Q * R_CONST);
const REV_Q2 = revAdd(2);                                      // +7.72 dB
const REV_Q8 = revAdd(8);                                      // +3.48 dB
const RC_Q2 = rCrit(2);                                        // 2.18 m
const RC_Q8 = rCrit(8);                                        // 4.36 m

// --- particle motion, reference condition ---------------------------------
const F_REF = 1000, SPL_REF = 94;                    // CHOSEN reference condition
const P_REF_PA = DSP.paFromSpl(SPL_REF);             // 1.0024 Pa rms
const U_REF = P_REF_PA / Z0;                         // 2.4256 mm/s rms
const W_REF = DSP.TAU * F_REF;
const XI_REF = U_REF / W_REF;                        // 0.3860 µm rms
const XI_PK = XI_REF * Math.SQRT2;                   // 0.5460 µm peak
const U_PK = U_REF * Math.SQRT2;                     // 3.4303 mm/s peak
const P_PK = P_REF_PA * Math.SQRT2;                  // 1.4176 Pa peak
/** Peak speeds. A sinusoid's MEAN speed is 2/π of its peak, so distances
 *  covered in the same time stand at (π/2)× this — the odometer ratio. */
const SPEED_RATIO = c / U_PK;                        // 1.0005 × 10⁵
const PATH_RATIO = SPEED_RATIO * (Math.PI / 2);      // 1.5716 × 10⁵

/** Threshold of hearing: 20 µPa at 1 kHz. */
const XI_THR_PK = ((DSP.P_REF / Z0) / W_REF) * Math.SQRT2;     // 10.89 pm peak
const BOHR_D = 2 * 52.9177e-12;                      // 105.8 pm, hydrogen

/**
 * The same lesson one stage upstream, on this system's own mains draw. Two
 * 300 W monoblocks at AMP.effAB plus 100 W of front end is 1191 W, i.e. 5.18 A
 * from a 230 V supply — the 8 Ω operating point, not the 4 Ω worst case.
 */
const P_SYS = (2 * AMP.pOut8) / AMP.effAB + 100;                       // 1190.9 W
const I_SYS = P_SYS / MAINS.vRms;                                      // 5.178 A rms
const V_DRIFT = DSP.driftVelocity(I_SYS, MAINS.cableAreaMm2);          // 0.1522 mm/s rms
const V_DRIFT_PK = V_DRIFT * Math.SQRT2;                               // 0.2153 mm/s peak
const X_DRIFT = DSP.driftDisplacement(V_DRIFT_PK, MAINS.f);            // 0.685 µm peak
const RATIO_CABLE = MAINS.vField / V_DRIFT_PK;                         // 9.19 × 10¹¹

// --- cone to pressure -----------------------------------------------------
const F_BASS = 40;
const X_CONE = DRIVER.Xmax / 2;                        // ±4.0 mm peak, half of Xmax
const SPL_BASS_SEAT = DSP.splFromExcursion(X_CONE, F_BASS, DRIVER.Sd, R_DIR) + DSP.dB(2);
const XI_SEAT_BASS_PK = ((DSP.paFromSpl(SPL_BASS_SEAT) / Z0) / (DSP.TAU * F_BASS)) * Math.SQRT2;
const CONE_AIR_RATIO = X_CONE / XI_SEAT_BASS_PK;       // 600 : 1
const DR_DB = DSP.splFromPa(20);                       // 120 dB, 20 µPa → 20 Pa

// --- the room's answer: the floor bounce comb ------------------------------
/** CHOSEN: a hard floor, pressure reflection coefficient 0.90 (α = 0.19). */
const R_HARD = 0.90;
const COMB_A = (R_DIR / R_FLOOR) * R_HARD;             // 0.8289
const COMB_NULL_F = 1 / (2 * DT_FLOOR);                // 414.0 Hz
const COMB_NULL_DB = DSP.dB(1 - COMB_A);               // −15.34 dB
const COMB_PEAK_F = 1 / DT_FLOOR;                      // 827.9 Hz
const COMB_PEAK_DB = DSP.dB(1 + COMB_A);               // +5.25 dB
const combDb = (f) => DSP.dB(Math.sqrt(
  1 + COMB_A * COMB_A + 2 * COMB_A * Math.cos(DSP.TAU * f * DT_FLOOR)));

// --- parcel-window layout -------------------------------------------------
const LAM_REF = DSP.lambda(F_REF, c);                         // 0.3432 m at 1 kHz
const N_LAM = 2, PER_LAMBDA = 13;
const COLS = N_LAM * PER_LAMBDA + 1;                          // 27
const SPACING = LAM_REF / PER_LAMBDA;                         // 26.4 mm
const SPAN = (COLS - 1) * SPACING;                            // 0.6864 m = 2λ
const K_REF = DSP.TAU / LAM_REF;                              // 18.31 rad/m

/**
 * Row heights inside the card, magnified block then true-scale block, with the
 * two rules that carry the argument between them: the amber bar is the WHOLE
 * territory of one parcel at ×25 000, the grey arrow directly under it is one
 * wavelength at ×1. Side by side, at the same scale, they are the point.
 */
const ROWS_M = [0.185, 0.155, 0.125, 0.095, 0.065];
const ROWS_T = [-0.090, -0.122];
const Y_TOP = ROWS_M[0], Y_BOT = ROWS_T[ROWS_T.length - 1];
const Y_TRK = 0.022, Y_LAM = -0.018, Y_DIV = -0.048;

/**
 * Displacement magnification for the MAGNIFIED block only.
 * The map x → x + ξ·cos(kx − ωt) stays monotonic — parcels never cross, so the
 * drawn density never goes negative — only while ξ·k < 1. ξ·k = 0.25 keeps a
 * clearly visible ±25 % density swing while holding the as-drawn speed ratio
 * (crest : parcel = 1/ξk) to 4 : 1. That is still nothing like the true
 * 1.00×10⁵ : 1, which is why the bottom two rows are drawn at ×1 and why both
 * ratios are stated on the plate and in the readouts.
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
 * `fadeTree` calls a group's `userData.setOpacity` hook and then still walks
 * into the group, so any plain mesh inside caches its base opacity *after* the
 * hook has already scaled it. The first fade of a stage is `fadeTree(overlay, 0)`,
 * so those meshes cache a base of 0 and never reappear. Dropping the hook lets
 * fadeTree treat each child individually, which it does correctly.
 */
const noHook = (g) => { delete g.userData.setOpacity; return g; };

/**
 * Centred diagram card: local (0,0) is the middle of the plate.
 * The plate is left fully opaque. A 6 % leak is invisible over the backdrop but
 * not over a specular highlight, and a loudspeaker's surround ghosting through
 * a plate that is supposed to be in front of it reads as a compositing bug.
 */
function card(w, h, opacity = 1.0) {
  const g = new THREE.Group();
  const k = noHook(DIAG.diagramCard(w, h, { opacity, pad: 0.022 }));
  k.position.set(-w / 2, -h / 2, 0);
  g.add(k);
  return g;
}

/**
 * THE SPECULAR LAYER.
 *
 * A lit plate with nothing in front of it reads as a decal. Real instrument
 * glass is a slightly convex dielectric: the reflected image of the studio's
 * wide front strip sweeps across it as a soft band that is brightest where the
 * curvature turns the normal toward the source, and the band has a rolloff
 * rather than an edge. This is a genuine `mats().glass` clone with an envMap —
 * the band is the reflection, not a painted gradient.
 */
function coverGlass(w, h, bulge = 0.052) {
  const g = new THREE.PlaneGeometry(w, h, 32, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getY(i) / (h / 2);
    // Curvature is mostly about the HORIZONTAL axis, so the reflected image of
    // the studio's wide front strip lands as a horizontal band that sweeps up
    // the plate — the way a meter lens behaves — rather than as a round blob.
    p.setZ(i, bulge * (1 - v * v) * (1 - 0.28 * u * u));
  }
  g.computeVertexNormals();
  const m = mats().glass.clone();
  m.color.setHex(0x04060a);
  m.transparent = true;
  // 0.14 is the whole point: the reflection lands as a soft DARK-GREY band with
  // a rolloff, not a white veil. Any higher and the plate reads as fogged.
  m.opacity = 0.14;
  m.depthWrite = false;
  m.roughness = 0.13;
  m.clearcoatRoughness = 0.085;
  m.envMapIntensity = 1.25;
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 92;
  return mesh;
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

/**
 * A ray drawn as a beam: a wide, very dim underlay plus a narrow bright core.
 * A single-width screen-space line has a bimodal profile — full value or
 * nothing — which is exactly what makes a diagram look pasted on. Two widths
 * give the line a rolloff.
 */
function beam(group, pts, color, coreW, coreOp) {
  group.add(poly(pts, color, coreW * 4.2, { opacity: coreOp * 0.13, renderOrder: 9 }));
  group.add(poly(pts, color, coreW * 2.0, { opacity: coreOp * 0.26, renderOrder: 10 }));
  group.add(poly(pts, color, coreW, { opacity: coreOp, renderOrder: 11 }));
}

/**
 * The same beam, but graded along its length. A ray of one constant value from
 * end to end is the overlay-demo tell: it prints over everything it crosses
 * with no sense of distance. Splitting it into short segments whose opacity
 * ramps toward the listener gives the ray an aerial perspective, so the far end
 * — which is the end that passes in front of the rack — sits back where it
 * belongs.
 */
function gradBeam(group, a, b, color, coreW, op0, op1, segs = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const P = (u) => A.clone().lerp(B, DSP.clamp(u, 0, 1));
  for (let i = 0; i < segs; i++) {
    const p0 = P(i / segs - 0.005), p1 = P((i + 1) / segs + 0.005);
    const op = op0 + (op1 - op0) * ((i + 0.5) / segs);
    const pts = [[p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z]];
    group.add(poly(pts, color, coreW * 3.6, { opacity: op * 0.17, renderOrder: 9 }));
    group.add(poly(pts, color, coreW, { opacity: op, renderOrder: 11 }));
  }
}

/** A circle lying in the world XZ plane at height y. */
function floorRing(cx, cz, r, y, colour, width, opacity, n = 84) {
  const t = new DIAG.Trace(n, colour, width, { opacity, renderOrder: 11 });
  t.write((i, u) => [cx + Math.cos(u * DSP.TAU) * r, y, cz + Math.sin(u * DSP.TAU) * r]);
  return t;
}

// ---------------------------------------------------------------------------
// THE SHOT, and a way of placing plates inside it.
// ---------------------------------------------------------------------------
/**
 * Framed on the listening geometry — the bounce point, the ear and the near
 * half of the direct ray. Slightly camera-left of the median plane and low, so
 * the eye reads left to right in world x: loudspeaker upstage-left at 8.4 m,
 * bounce point on the floor at 6.4 m, ear downstage-right at 3.9 m. The set's
 * key and its warm floor pool are both built for a frontal camera; swinging
 * round to the side turns that pool into a hard-edged wash and rakes a
 * blown specular off the right cabinet, so the axis stays near the median.
 */
const SHOT = frameShot([-0.55, 0.78, 0.20], 0.860, { fill: 0.62, az: -0.06, el: 0.1463, fov: 32 });

const CAM_P = V(...SHOT.position);
const CAM_F = V(...SHOT.target).sub(CAM_P).normalize();
const CAM_R = CAM_F.clone().cross(V(0, 1, 0)).normalize();
const CAM_U = CAM_R.clone().cross(CAM_F).normalize();
const D2R = Math.PI / 180;
/**
 * Place a plate at a chosen angle off the lens axis. The Director's shift lens
 * puts the axis at the centre of the clear band (screen x 670 of 1600), so at
 * fov 32 the SAFE BOX runs from −16.3° to +14.5° horizontally and +13.2° to
 * −14.0° vertically. Every plate edge below is inside that.
 */
const place = (hDeg, vDeg, dist) => CAM_P.clone().addScaledVector(
  CAM_F.clone()
    .addScaledVector(CAM_R, Math.tan(hDeg * D2R))
    .addScaledVector(CAM_U, Math.tan(vDeg * D2R))
    .normalize(), dist);

/**
 * Sits just above the left loudspeaker it is a window in front of: the cabinet's
 * top edge is at +5.7°, the plate's bottom edge at +4.4°, so the plate crops the
 * very top corner of the cabinet and nothing else.
 */
const P_AIR = place(-10.9, 7.5, 5.0);
/** Nearer than the sofa's front edge, so the plate is never half-eaten by it. */
const P_COMB = place(8.5, -7.0, 3.40);

export default {
  id: 'air',
  title: 'Air, Room, Ear',
  nav: 'Air &amp; ear',
  kicker: 'Air & ear',          // set with textContent — a literal ampersand
  standfirst: 'The air never travels. Only the news does.',
  shot: SHOT,
  /** One clock for the whole stage: 1 : 500. A 1 kHz cycle takes 0.5 s on screen. */
  timeScale: 0.002,

  build(ctx) {
    const overlay = new THREE.Group();
    overlay.name = 'air-overlay';
    const L = ctx.labels;
    const spr = radialSprite(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 1.7);

    // =====================================================================
    // 1 · THE PATH — one direct ray, one floor bounce, one ear
    // =====================================================================
    const field = new THREE.Group();
    overlay.add(field);

    // the left channel: the ray this chapter follows
    gradBeam(field, [SL.x, SL.y, SL.z], [EAR.x, EAR.y, EAR.z], PAL.cy, 2.0, 0.26, 0.92);
    // the right channel is drawn too, because the level at the seat is the
    // correlated PAIR — but it is held back so the frame has one subject
    gradBeam(field, [SR.x, SR.y, SR.z], [EAR.x, EAR.y, EAR.z], PAL.cy, 1.1, 0.06, 0.24, 3);
    // the folded path: down to the floor and back up
    gradBeam(field, [SL.x, SL.y, SL.z], [B_FLOOR.x, 0.006, B_FLOOR.z], PAL.am, 1.8, 0.30, 0.80, 4);
    gradBeam(field, [B_FLOOR.x, 0.006, B_FLOOR.z], [EAR.x, EAR.y, EAR.z], PAL.am, 1.8, 0.80, 0.90, 3);

    for (const src of [SL, SR]) {
      const g = DIAG.glow(PAL.cy, 0.085, src === SL ? 0.7 : 0.32, spr);
      g.position.copy(src);
      field.add(g);
    }

    // the bounce point on the polished floor — the floor mirrors it back
    field.add(floorRing(B_FLOOR.x, B_FLOOR.z, 0.115, 0.010, PAL.am, 1.7, 0.72));
    field.add(floorRing(B_FLOOR.x, B_FLOOR.z, 0.185, 0.010, PAL.am, 1.0, 0.28));
    {
      const g = DIAG.glow(PAL.am, 0.115, 0.62, spr);
      g.position.set(B_FLOOR.x, 0.014, B_FLOOR.z);
      field.add(g);
    }

    // the ear — the one place the eye should land
    {
      const g = DIAG.glow(PAL.cy, 0.115, 0.95, spr);
      g.position.copy(EAR);
      field.add(g);
      S.earRing = new DIAG.Trace(56, PAL.cy, 1.6, { opacity: 0.9, renderOrder: 13 });
      S.earRing2 = new DIAG.Trace(56, PAL.cy, 1.0, { opacity: 0.34, renderOrder: 13 });
      field.add(S.earRing, S.earRing2);
    }

    // =====================================================================
    // 2 · THE PARCEL WINDOW — air is not a conveyor
    // =====================================================================
    const CW = 0.86, CH = 0.50;
    const air = card(CW, CH);
    air.position.copy(P_AIR);
    overlay.add(air);
    S.air = air;

    S.swarm = new DIAG.Swarm(COLS * (ROWS_M.length + ROWS_T.length),
      { color: PAL.cy, size: 0.0092 });
    air.add(S.swarm);

    // λ at true scale, immediately under the parcel's own excursion bar
    air.add(noHook(DIAG.dimension(
      [-LAM_REF / 2, Y_LAM, 0.002], [LAM_REF / 2, Y_LAM, 0.002],
      { color: PAL.ink3, width: 1.3, head: 0.018 })));

    // the compression maximum, travelling at ω/k = c through both blocks
    S.crest = poly([[0, Y_BOT - 0.028, 0.003], [0, Y_TOP + 0.030, 0.003]], PAL.cy, 1.3,
      { opacity: 0.42, dashed: true, dashSize: 0.014, gapSize: 0.011 });
    air.add(S.crest);
    S.crestTip = poly([[-0.013, Y_TOP + 0.030, 0.003], [0, Y_TOP + 0.047, 0.003],
      [0.013, Y_TOP + 0.030, 0.003]], PAL.cy, 1.9, { opacity: 0.8 });
    air.add(S.crestTip);

    /**
     * The whole territory of one parcel: a bar 2·ξ_drawn long under the tracked
     * column. At ×25 000 it is 27 mm on a 1.03 m wave. The λ arrow above and
     * this dash below are the same picture at the same scale, and the ratio
     * between them is the argument.
     */
    air.add(poly([[-XI_DRAWN, Y_TRK, 0.002], [XI_DRAWN, Y_TRK, 0.002]], PAL.am, 2.6,
      { opacity: 0.9 }));
    for (const sx of [-1, 1]) {
      air.add(poly([[sx * XI_DRAWN, Y_TRK - 0.011, 0.002], [sx * XI_DRAWN, Y_TRK + 0.011, 0.002]],
        PAL.am, 1.3, { opacity: 0.7 }));
    }
    S.trkDot = DIAG.glow(PAL.am, 0.026, 0.85, spr);
    S.trkDot.position.set(0, Y_TRK, 0.004);
    air.add(S.trkDot);

    // the divider between the magnified block and the true-scale block
    air.add(poly([[-SPAN / 2, Y_DIV, 0.001], [SPAN / 2, Y_DIV, 0.001]], PAL.ink3, 1.0,
      { opacity: 0.30, dashed: true, dashSize: 0.018, gapSize: 0.015 }));

    const aTitle = anchor(air, -CW / 2, CH / 2 + 0.010);
    const aTrue = anchor(air, -SPAN / 2, -CH / 2);

    // above 40, which is where the loudspeaker chapter's own cover glass sits
    liftOrder(air, 44);
    air.add(coverGlass(CW + 0.040, CH + 0.040));
    // the edge of the glass — the tell that says there is something in front
    {
      const e = poly([[-CW / 2 - 0.020, CH / 2 + 0.018, 0.014],
        [CW / 2 + 0.020, CH / 2 + 0.018, 0.014]], 0xaebac8, 1.1, { opacity: 0.32 });
      e.renderOrder = 94;
      air.add(e);
    }

    // =====================================================================
    // 3 · WHAT THE FLOOR DOES — the comb
    // =====================================================================
    const KW = 0.68, KH = 0.44;
    const comb = card(KW, KH);
    comb.position.copy(P_COMB);
    overlay.add(comb);
    S.comb = comb;

    /**
     * The comb runs to 20 kHz, but its teeth are 1/Δt = 828 Hz apart, so a
     * 320-pixel plot taken that far turns the top two octaves into a solid
     * block of ink. That is an aliasing artefact, not a measurement. The axis
     * stops at 6 kHz, where seven teeth are still individually resolvable, and
     * the markers state the period so the reader can continue it.
     */
    const g = new DIAG.Graph({
      w: 0.54, h: 0.27, xLog: true, xRange: [80, 6000], yRange: [-20, 8],
      yTicks: [-20, -10, 0, 8], zeroLine: 0,
    });
    g.position.set(-0.245, -0.105, 0.001);
    comb.add(g);
    g.addTrace((f) => combDb(f), { color: PAL.cy, width: 1.9, n: 1600 });
    g.addMarker(COMB_NULL_F, { color: PAL.am, width: 1.3, opacity: 0.8 });
    g.addMarker(COMB_PEAK_F, { color: PAL.am, width: 1.0, opacity: 0.45 });
    g.addDot(PAL.am, 0.007).userData.setData(COMB_NULL_F, COMB_NULL_DB);
    S.graph = g;

    const kTitle = anchor(comb, -KW / 2, KH / 2 + 0.010);

    liftOrder(comb, 56);
    comb.add(coverGlass(KW + 0.040, KH + 0.040, 0.028));
    {
      const e = poly([[-KW / 2 - 0.020, KH / 2 + 0.018, 0.014],
        [KW / 2 + 0.020, KH / 2 + 0.018, 0.014]], 0xaebac8, 1.1, { opacity: 0.32 });
      e.renderOrder = 94;
      comb.add(e);
    }

    // =====================================================================
    // LABELS — five, plus five axis numerals
    // =====================================================================
    S.lab = {};
    S.lab.air = L.add(aTitle, {
      kicker: 'Air parcels · 1 kHz · 94 dB',
      text: br('top five rows shown ×' + MAG_S
        + '<br>crest : parcel = ' + fmt(DRAWN_RATIO, 0) + ' : 1 as drawn,'
        + '<br>' + fmt(SPEED_RATIO / 1e5, 2) + '×10⁵ : 1 truly'),
      value: 'ξ = +0.000 of ' + fmt(XI_PK * 1e6, 3) + ' µm peak',
      cls: 'acc', occlude: false, priority: 5, offset: [172, -34],
    });
    S.lab.tru = L.add(aTrue, {
      kicker: '×1 · true scale',
      text: 'the real ±' + fmt(XI_PK * 1e6, 3) + ' µm — nothing moves.<br>'
        + 'grey arrow λ ' + fmt(LAM_REF * 1000, 1) + ' mm; amber bar 2ξ drawn',
      occlude: false, priority: 3, offset: [148, 52],
    });
    S.lab.seat = L.add(EAR.clone(), {
      kicker: 'At the seat · ' + fmt(R_DIR, 3) + ' m · direct field',
      text: br(fmt(SENS_1W, 1) + ' dB/1 W/1 m · ' + PEAK_W + ' W peak'
        + '<br>' + fmt(SPL_1M, 1) + ' dB at 1 m → ' + fmt(SPL_SEAT_1, 1) + ' dB here'),
      value: fmt(SPL_SEAT, 1) + ' dB SPL, the pair · ' + fmt(T_DIR * 1000, 2) + ' ms',
      cls: 'acc', priority: 4, offset: [40, -88],
    });
    S.lab.floor = L.add(B_FLOOR.clone().setY(0.02), {
      kicker: 'Floor bounce · image source ' + fmt(AC_Y, 3) + ' m under the floor',
      text: br('+' + fmt(R_FLOOR - R_DIR, 3) + ' m of path = λ/2 at '
        + fmt(COMB_NULL_F, 0) + ' Hz'),
      value: '+' + fmt(DT_FLOOR * 1000, 3) + ' ms · ' + fmt(COMB_NULL_DB, 1) + ' dB',
      cls: 'am', priority: 2, offset: [86, 86],
    });
    S.lab.comb = L.add(kTitle, {
      kicker: 'Direct + floor · dB re direct alone',
      text: br('hard floor, pressure coefficient ' + fmt(R_HARD, 2)),
      value: fmt(COMB_NULL_DB, 1) + ' dB at ' + fmt(COMB_NULL_F, 0)
        + ' Hz · +' + fmt(COMB_PEAK_DB, 1) + ' at ' + fmt(COMB_PEAK_F, 0),
      cls: 'am', occlude: false, priority: 3, offset: [150, -28],
    });

    // 200 Hz rather than 100: at xRange[0] = 80 the 100 Hz tick sits on the
    // y-axis and its numeral collides with the −15 dB one.
    g.tickLabels(L, {
      xVals: [200, 1000, 5000],
      yVals: [-15, 0],
      xFmt: (v) => (v >= 1000 ? v / 1000 + ' k' : String(v)),
      yFmt: (v) => (v > 0 ? '+' + v : String(v)),
      xOffset: [0, 15], yOffset: [-26, 0],
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
        // Top block: displacement magnified ×MAG. Bottom block: the real
        // ±0.546 µm, which is 5×10⁻⁷ of a spacing and therefore invisible —
        // that is the point of drawing it.
        const disp = (mag ? XI_DRAWN : XI_PK) * Math.cos(arg);
        // Condensation is −∂ξ/∂x ∝ sin(arg). Size and colour carry it
        // normalised, so both blocks read as the same wave.
        const u = 0.5 + 0.5 * Math.sin(arg);
        const zj = ((j * 37 + r * 91) % 17) / 17 - 0.5;
        const tracked = mag && j === half && r === 2;
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
      // Wrap over exactly the three wavelengths on show, so it always lands on a crest.
      let xc = (ph + Math.PI / 2) / K_REF;
      xc = ((xc + SPAN / 2) % SPAN + SPAN) % SPAN - SPAN / 2;
      S.crest.write((i) => [xc, i === 0 ? Y_BOT - 0.028 : Y_TOP + 0.030, 0.003]);
      S.crestTip.write((i) => [
        xc + [-0.013, 0, 0.013][i], [Y_TOP + 0.030, Y_TOP + 0.047, Y_TOP + 0.030][i], 0.003,
      ]);
    }
    if (S.trkDot) S.trkDot.position.x = XI_DRAWN * Math.cos(ph);

    // ---- live state -------------------------------------------------------
    // One instant, one set of numbers. `readouts()` latches this at 10 Hz and
    // the labels read the LATCHED copy, so a still frame can never show a
    // footer and a label that disagree.
    S.live = {
      xi: XI_PK * Math.cos(ph),
      u: -U_PK * Math.sin(ph),
      p: -P_PK * Math.sin(ph),
      news: c * t,
      path: 4 * XI_PK * F_REF * t,
    };
    const sh = S.shown || S.live;
    if (S.lab) {
      S.lab.air.setValue('ξ = ' + sgn(sh.xi, 3, 1e6) + ' of ' + fmt(XI_PK * 1e6, 3) + ' µm peak');
    }

    // ---- the plates are true billboards: parallel to the image plane, so
    //      they read as printed plates rather than keystoned signage
    for (const gr of [S.air, S.comb]) if (gr) gr.quaternion.copy(ctx.camera.quaternion);
    // the ear marker is a ring drawn in the image plane too
    if (S.earRing) {
      const cam = ctx.camera;
      const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const ring = (tr, k) => tr.write((i, u) => {
        const a = u * DSP.TAU;
        return [
          EAR.x + (Math.cos(a) * rt.x + Math.sin(a) * upv.x) * k,
          EAR.y + (Math.cos(a) * rt.y + Math.sin(a) * upv.y) * k,
          EAR.z + (Math.cos(a) * rt.z + Math.sin(a) * upv.z) * k,
        ];
      });
      ring(S.earRing, 0.098);
      ring(S.earRing2, 0.155);
    }
  },

  content() {
    return `
<h3>Air is not a conveyor</h3>
<p>The woofer does not send you air; it sends a disturbance. Every parcel
oscillates about a fixed point and stays there. Only the compression travels.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Sound is not moving
air. At the threshold of hearing a parcel swings
±<span class="num">${(XI_THR_PK * 1e12).toFixed(1)}</span> pm — a tenth of the
${(BOHR_D * 1e12).toFixed(0)} pm across a hydrogen atom. Nothing is carried.</p></div>

<div class="eq">1 kHz, 94 dB SPL <span class="c">(p = ${fmt(P_REF_PA, 2)} Pa rms)</span>
u = p/ρc = ${fmt(P_REF_PA, 2)}/${fmt(Z0, 1)}   = <span class="hl">${fmt(U_REF * 1e3, 2)} mm/s</span>
ξ = u/ω  = 2.43e−3/${W_REF.toFixed(0)} = <span class="hl">${fmt(XI_REF * 1e6, 3)} µm</span> <span class="c">rms</span>
c/û = ${fmt(c, 1)}/${fmt(U_PK * 1e3, 2)}e−3  = <span class="hl">${fmt(SPEED_RATIO / 1e5, 2)}×10⁵</span></div>

<p>The footer clocks both: metres of news against micrometres of parcel. Peak
speeds stand at <span class="num">${fmt(SPEED_RATIO / 1e5, 2)}×10⁵</span>,
distances at <span class="num">${fmt(PATH_RATIO / 1e5, 2)}×10⁵</span>, since a
sinusoid's mean speed is 2/π of its peak. The mains flex runs the same story at
<span class="num">${(RATIO_CABLE / 1e11).toFixed(1)}×10¹¹</span>, its electrons
swinging ±<span class="num">${fmt(X_DRIFT * 1e6, 2)}</span> µm.</p>

<h3>Level</h3>
<p>Small's efficiency here is
<span class="num">${fmt(TS.eta0 * 100, 3)}</span>%, so one watt at one metre is
<span class="num">${fmt(SENS_1W, 2)}</span> dB. 2.83 V is
<span class="num">${fmt(P_283, 2)}</span> W into the ${DRIVER.Re} Ω coil, not 1 W, and
reads <span class="num">${fmt(SENS_283, 2)}</span> dB. A ${PEAK_W} W peak —
<span class="num">${fmt(AMP_HEADROOM_DB, 1)}</span> dB inside the monoblock's
${AMP.pOut8} W — gives <span class="num">${fmt(SPL_1M, 1)}</span> dB at 1 m and
<span class="num">${fmt(SPL_SEAT_1, 1)}</span> dB of direct sound at
<span class="num">${fmt(R_DIR, 3)}</span> m; the correlated pair sums to
<span class="num">${fmt(SPL_SEAT, 1)}</span> dB. Sabine inverted on RT60
${ROOM.rt60} s over <span class="num">${fmt(S_ROOM, 1)}</span> m² gives ᾱ =
<span class="num">${fmt(ABAR, 3)}</span>, R =
<span class="num">${fmt(R_CONST, 1)}</span> m²: critical distance
<span class="num">${fmt(RC_Q2, 1)}</span> m at Q = 2,
<span class="num">${fmt(RC_Q8, 1)}</span> m at Q = 8. The seat is past both, so
the room adds
<span class="num">${fmt(REV_Q8, 1)}</span>–<span class="num">${fmt(REV_Q2, 1)}</span> dB.</p>

<h3>The floor</h3>
<p>The bounce is that midrange axis mirrored, a source
<span class="num">${fmt(AC_Y, 3)}</span> m below the floor:
+<span class="num">${fmt(R_FLOOR - R_DIR, 3)}</span> m of path,
+<span class="num">${fmt(DT_FLOOR * 1000, 3)}</span> ms, first cancellation at
1/(2Δt) = <span class="num">${fmt(COMB_NULL_F, 0)}</span> Hz,
<span class="num">${fmt(-COMB_NULL_DB, 1)}</span> dB deep — inside the fusion
window, so you hear one event, coloured.</p>

<div class="key"><span class="lab">The idea</span><p>${PEAK_W} W a channel in;
<span class="num">${fmt(W_AC, 2)}</span> W of sound out and
<span class="num">${fmt(W_HEAT, 0)}</span> W of heat. The cone swings ±4 mm; at
<span class="num">${fmt(R_DIR, 2)}</span> m the air at 40 Hz swings
±<span class="num">${fmt(XI_SEAT_BASS_PK * 1e6, 1)}</span> µm —
<span class="num">${fmt(CONE_AIR_RATIO, 0)}</span> times less — inside a
<span class="num">${fmt(DR_DB, 0)}</span> dB window from 20 µPa to 20 Pa.</p></div>`;
  },

  readouts() {
    // latch: the footer and the world labels must show the SAME instant
    if (S.live) S.shown = S.live;
    const v = S.shown || { xi: 0, u: 0, p: 0, news: 0, path: 0 };
    return [
      { k: 'DIRECT AT SEAT', v: fmt(SPL_SEAT, 1), u: 'dB SPL', cls: 'acc', bar: (SPL_SEAT - 40) / 80 },
      { k: 'PARCEL DISPL', v: sgn(v.xi, 3, 1e6), u: 'µm pk', cls: 'acc' },
      { k: 'PARCEL VEL', v: sgn(v.u, 2, 1e3), u: 'mm/s' },
      { k: 'PARCEL PRESSURE', v: sgn(v.p, 3), u: 'Pa' },
      { k: 'NEWS TRAVELLED', v: fmt(v.news, 2), u: 'm', cls: 'acc' },
      { k: 'PARCEL TRAVELLED', v: fmt(v.path * 1e6, 1), u: 'µm' },
    ];
  },
};
