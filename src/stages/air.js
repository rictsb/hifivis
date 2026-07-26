import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { PAL } from '../core/materials.js';
import { radialSprite } from '../core/tex.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
 * AIR · ROOM · EAR — the final transduction.
 *
 * No hardware. Everything here is overlay: a magnified window of the air in
 * front of a woofer, the wavefront spreading across the floor, the first
 * reflections, and a diagrammatic section of the outer and middle ear.
 *
 * Every number below is derived from DSP + LAYOUT at module load. Nothing is
 * chosen to look good. The two aesthetic choices that exist — the displacement
 * magnification and the demonstration frequencies — follow from a stated
 * constraint and are labelled on screen.
 * ======================================================================== */

const c = DSP.C_SOUND_20C;                 // 343.2 m/s, dry air at 20 °C
const rho = DSP.RHO_AIR;                   // 1.2041 kg/m³
const Z0 = rho * c;                        // 413.25 Pa·s/m — specific impedance of air

// --- geometry -------------------------------------------------------------
/** Assumed acoustic centre of each floorstander: tweeter axis at 0.95 m. */
const AC_Y = 0.95;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SL = V(LAYOUT.speakerL.x, AC_Y, LAYOUT.speakerL.z);
const SR = V(LAYOUT.speakerR.x, AC_Y, LAYOUT.speakerR.z);
const EAR = V(LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z);

/** Both speakers are the same distance from the seat — the seat is on axis. */
const R_DIR = SR.distanceTo(EAR);                              // 4.8310 m
const T_DIR = R_DIR / c;                                       // 14.08 ms

/** Floor reflection: an image source mirrored in the plane y = 0. */
const IMG_FLOOR = V(SL.x, -SL.y, SL.z);
const R_FLOOR = IMG_FLOOR.distanceTo(EAR);                     // 5.2313 m
const DT_FLOOR = (R_FLOOR - R_DIR) / c;                        // 1.1664 ms
const kFloor = SL.y / (SL.y + EAR.y);
const B_FLOOR = V(SL.x + (EAR.x - SL.x) * kFloor, 0, SL.z + (EAR.z - SL.z) * kFloor);

/** Side-wall reflection: left speaker off the left wall at x = −w/2. */
const WALL_X = -LAYOUT.room.w / 2;                             // −3.70 m
const IMG_WALL = V(2 * WALL_X - SL.x, SL.y, SL.z);
const R_WALL = IMG_WALL.distanceTo(EAR);                       // 7.3568 m
const DT_WALL = (R_WALL - R_DIR) / c;                          // 7.3595 ms
const kWall = (IMG_WALL.x - WALL_X) / (IMG_WALL.x - EAR.x);
const B_WALL = V(WALL_X,
  IMG_WALL.y + (EAR.y - IMG_WALL.y) * kWall,
  IMG_WALL.z + (EAR.z - IMG_WALL.z) * kWall);

// --- level chain ----------------------------------------------------------
/** Quoted sensitivity: 89 dB SPL at 2.83 V rms into 8 Ω (= 1 W), 1 m, half space. */
const SENS = 89;
/** The loudest peak on this track asks 100 W a channel of a 300 W amplifier. */
const PEAK_W = 100;
/** SPL at 1 m for exactly 1 W of acoustic power into 2π sr: p = √(ρc/2π). */
const SPL_1W_AC = DSP.splFromPa(Math.sqrt(Z0 / (2 * Math.PI)));        // 112.16 dB
/** Reference efficiency implied by that sensitivity. */
const ETA0 = Math.pow(10, (SENS - SPL_1W_AC) / 10);                    // 0.483 %
const SPL_1M = DSP.splAt(SENS, PEAK_W, 1);                             // 109.0 dB
const SPL_2M = DSP.splAt(SENS, PEAK_W, 2);                             // 103.0 dB
const SPL_SEAT_1 = DSP.splAt(SENS, PEAK_W, R_DIR);                     // 95.32 dB
/** Pair, mono-correlated, listener on the median plane: +6.02 dB. */
const SPL_SEAT = SPL_SEAT_1 + DSP.dB(2);                               // 101.34 dB
const SPL_SEAT_UNC = SPL_SEAT_1 + 10 * Math.log10(2);                  // 98.33 dB
const W_AC_EACH = ETA0 * PEAK_W;                                       // 0.4831 W
const W_AC = 2 * W_AC_EACH;                                            // 0.9662 W
const W_HEAT = 2 * (PEAK_W - W_AC_EACH);                               // 199.0 W

// --- particle motion, reference condition ---------------------------------
const F_REF = 1000, SPL_REF = 94;
const P_REF_PA = DSP.paFromSpl(SPL_REF);              // 1.0024 Pa rms
const U_REF = P_REF_PA / Z0;                          // 2.4256 mm/s rms
const XI_REF = U_REF / (DSP.TAU * F_REF);             // 0.3860 µm rms
const XI_PK = XI_REF * Math.SQRT2;                    // 0.5460 µm peak
const U_PK = U_REF * Math.SQRT2;                      // 3.4303 mm/s peak
const SPEED_RATIO = c / U_PK;                         // 1.0005 × 10⁵

/** Threshold of hearing: 20 µPa at 1 kHz. */
const XI_THR = (DSP.P_REF / Z0) / (DSP.TAU * F_REF);  // 7.70 pm rms
const XI_THR_PK = XI_THR * Math.SQRT2;                // 10.89 pm peak
const BOHR_D = 2 * 52.9177e-12;                       // 105.8 pm, hydrogen

/** The same lesson one stage upstream: electrons in a 2.5 mm² mains flex. */
const V_DRIFT = DSP.driftVelocity(5, 2.5);                             // 0.147 mm/s
const X_DRIFT = DSP.driftDisplacement(V_DRIFT * Math.SQRT2, 50);       // 0.662 µm peak
const RATIO_CABLE = DSP.signalSpeed(0.66) / (V_DRIFT * Math.SQRT2);    // 9.5 × 10¹¹

// --- cone to pressure -----------------------------------------------------
const F_BASS = 40;
const X_CONE = 0.004;                                  // ±4.0 mm peak
const R_CONE = 0.092;                                  // effective radius of a 220 mm cone
const SD = Math.PI * R_CONE * R_CONE;                  // 0.02659 m² = 266 cm²
const U_CONE = DSP.TAU * F_BASS * X_CONE / Math.SQRT2; // 0.711 m/s rms
const Q_VOL = SD * U_CONE;                             // 18.90 L/s rms
const P_BASS_1M = rho * F_BASS * Q_VOL / 1;            // 0.9104 Pa — identical to splFromExcursion
const SPL_BASS_1M = DSP.splFromPa(P_BASS_1M);          // 93.16 dB
const SPL_BASS_SEAT = DSP.splFromExcursion(X_CONE, F_BASS, SD, R_DIR) + DSP.dB(2);   // 85.50 dB
const XI_SEAT_BASS = (DSP.paFromSpl(SPL_BASS_SEAT) / Z0) / (DSP.TAU * F_BASS);       // 3.63 µm rms
const CONE_AIR_RATIO = X_CONE / (XI_SEAT_BASS * Math.SQRT2);                         // 779 : 1

// --- the room's answer ----------------------------------------------------
/** Polished concrete: pressure reflection coefficient taken as 0.90, flat with f. */
const R_HARD = 0.90;
const COMB_A = (R_DIR / R_FLOOR) * R_HARD;             // 0.8311
const COMB_NULL_F = 1 / (2 * DT_FLOOR);                // 428.7 Hz
const COMB_NULL_DB = DSP.dB(1 - COMB_A);               // −15.45 dB
const COMB_PEAK_DB = DSP.dB(1 + COMB_A);               // +5.25 dB
const combDb = (f) => DSP.dB(Math.sqrt(1 + COMB_A * COMB_A + 2 * COMB_A * Math.cos(DSP.TAU * f * DT_FLOOR)));

// --- the ear --------------------------------------------------------------
const A_TM = 55e-6;        // m², effective vibrating area of the tympanic membrane
const A_FP = 3.2e-6;       // m², stapes footplate
const LEVER = 1.3;         // malleus : incus arm ratio
const ME_GAIN = (A_TM / A_FP) * LEVER;                 // 22.34 ×
const ME_GAIN_DB = DSP.dB(ME_GAIN);                    // 26.98 dB
const Z_PERI = 1000 * 1500;                            // perilymph ≈ water, 1.5 MPa·s/m
const TRANS = 4 * Z0 * Z_PERI / Math.pow(Z0 + Z_PERI, 2);      // 1.101 × 10⁻³
const TRANS_DB = 10 * Math.log10(TRANS);               // −29.58 dB
const CANAL_L = 0.025;
const CANAL_F = c / (4 * CANAL_L);                     // 3432 Hz quarter-wave
const DR_DB = DSP.splFromPa(20);                       // 120 dB, 20 µPa → 20 Pa

/** Greenwood (1990), human: f = A(10^(a·x) − k), x = fraction from the apex. */
const GW = { A: 165.4, a: 2.1, k: 0.88, L: 0.035 };
const gwF = (x) => GW.A * (Math.pow(10, GW.a * x) - GW.k);
const gwX = (f) => Math.log10(f / GW.A + GW.k) / GW.a;
const F_APEX = gwF(0);                                 // 19.85 Hz
const F_BASE = gwF(1);                                 // 20.68 kHz
const X_1K = gwX(1000) * GW.L;                         // 14.0 mm from the apex

// --- demonstration frequencies -------------------------------------------
const F_WAVE = 200;                       // the wavefront drawn across the floor
const LAM_WAVE = DSP.lambda(F_WAVE, c);   // 1.716 m
const N_RINGS = 4;
const R_RING_MAX = N_RINGS * LAM_WAVE;    // 5.148 m
const LAM_REF = DSP.lambda(F_REF, c);     // 0.3432 m at 1 kHz

// --- parcel-window layout -------------------------------------------------
const PER_LAMBDA = 14, COLS = 2 * PER_LAMBDA + 1, ROWS = 7;
const SPACING = LAM_REF / PER_LAMBDA;                         // 24.5 mm
const ROW_DY = 0.044;
const K_REF = DSP.TAU / LAM_REF;                              // 18.31 rad/m
const W_REF = DSP.TAU * F_REF;

/**
 * Displacement magnification for the parcel window.
 * The map x → x + ξ·cos(kx − ωt) stays monotonic — parcels never cross, so the
 * drawn density never goes negative — only while ξ·k < 1. Take ξ·k = 0.754: the
 * largest swing with a comfortable margin, and a visible ±75 % density swing.
 */
const XI_K = 0.754;
const XI_DRAWN = XI_K / K_REF;                                // 0.04118 m
const MAG = XI_DRAWN / XI_PK;                                 // ≈ 75 400 ×
const MAG_R = Math.round(MAG / 100) * 100;

// ---------------------------------------------------------------------------
const S = {};   // module-scope state — exactly one instance of this stage exists
const _col = new THREE.Color();
const C_DIM = new THREE.Color(PAL.cyDim).lerp(new THREE.Color(PAL.cy), 0.30);
const C_HOT = new THREE.Color(PAL.cy);
const fmt = (v, d) => v.toFixed(d);
/** Labels are inline spans; a break is needed between .t and .v. */
const br = (s) => s + '<br>';

/**
 * Centred diagram card: local (0,0) is the middle of the plate.
 *
 * NOTE — `diagramCard` publishes `userData.setOpacity` on its group. `fadeTree`
 * calls that first and then still walks into the group, so the plate mesh has
 * its base opacity cached *after* the group hook has already zeroed it. The
 * first fade of a stage is `fadeTree(overlay, 0)`, so the plate caches a base
 * of 0 and never reappears. Dropping the group hook lets fadeTree treat the
 * plate and the border individually, which it does correctly.
 */
function card(w, h, opacity = 0.88) {
  const g = new THREE.Group();
  const k = DIAG.diagramCard(w, h, { opacity, pad: 0.024 });
  delete k.userData.setOpacity;
  k.position.set(-w / 2, -h / 2, 0);
  g.add(k);
  return g;
}

/**
 * Push a whole inset above the room's own diagram layer. None of these
 * primitives write depth, so paint order is the only thing that stops a
 * wavefront five metres away drawing straight through a foreground plate.
 */
function liftOrder(root, base = 30) {
  root.traverse((o) => { if (o.isMesh || o.isLine || o.isLine2 || o.isSprite) o.renderOrder = base + (o.renderOrder || 0); });
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

/** A soft point marker that does not look like a square. */
function dot(colour, size, intensity, tex, through = false) {
  const g = DIAG.glow(colour, size, intensity, tex);
  if (through) g.material.depthTest = false;
  return g;
}

/** A circle lying in the world XZ plane at height y. */
function floorRing(cx, cz, r, y, colour, width, opacity, n = 72) {
  const t = new DIAG.Trace(n, colour, width, { opacity, renderOrder: 11 });
  t.write((i, u) => [cx + Math.cos(u * DSP.TAU) * r, y, cz + Math.sin(u * DSP.TAU) * r]);
  return t;
}

export default {
  id: 'air',
  title: 'Air, Room, Ear',
  nav: 'Air &amp; ear',
  kicker: 'Air & ear',          // set with textContent — a literal ampersand
  standfirst: 'The air never travels. Only the news does.',
  shot: { position: [1.05, 2.15, 5.60], target: [0.25, 1.05, -1.70], fov: 40 },
  /** One clock for the whole stage: 1 : 500. A 1 kHz cycle takes 0.5 s on screen. */
  timeScale: 0.002,

  build(ctx) {
    const overlay = new THREE.Group();
    overlay.name = 'air-overlay';
    const L = ctx.labels;
    const spr = radialSprite(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 1.7);

    // =====================================================================
    // 1 · THE FLOOR — wavefronts, the inverse-square ruler, first reflections
    // =====================================================================
    const field = new THREE.Group();
    overlay.add(field);

    // -- the spreading wavefront, where the sphere cuts the floor -----------
    //    Line weight carries the amplitude, which falls as 1/r.
    S.rings = [];
    for (const src of [SL, SR]) {
      for (let i = 0; i < N_RINGS; i++) {
        const t = new DIAG.Trace(200, PAL.cy, 3.0, { opacity: 0.72, renderOrder: 11 });
        t.userData.src = src; t.userData.i = i;
        field.add(t);
        S.rings.push(t);
      }
      const g = dot(PAL.cy, 0.085, 0.85, spr);
      g.position.copy(src);
      field.add(g);
    }

    // -- both direct rays; the right one carries the 1 m / 2 m / seat ruler --
    for (const src of [SL, SR]) {
      field.add(poly([[src.x, src.y, src.z], [EAR.x, EAR.y, EAR.z]], PAL.cy, 2.2,
        { opacity: src === SR ? 0.92 : 0.5 }));
    }
    const dirR = EAR.clone().sub(SR).normalize();
    const sideR = new THREE.Vector3().crossVectors(dirR, V(0, 1, 0)).normalize();
    for (const r of [1, 2, R_DIR]) {
      const p = SR.clone().addScaledVector(dirR, r);
      const a = p.clone().addScaledVector(sideR, -0.085);
      const b = p.clone().addScaledVector(sideR, 0.085);
      field.add(poly([[a.x, a.y, a.z], [b.x, b.y, b.z]], PAL.cy, 1.6, { opacity: 0.8 }));
    }
    const ruler2m = SR.clone().addScaledVector(dirR, 2);

    // -- floor bounce: the folded path, and the image source beneath --------
    field.add(poly([
      [SL.x, SL.y, SL.z], [B_FLOOR.x, 0.006, B_FLOOR.z], [EAR.x, EAR.y, EAR.z],
    ], PAL.am, 2.0, { opacity: 0.85 }));
    // the same path straightened: a second speaker 0.95 m below the floor
    field.add(poly([
      [IMG_FLOOR.x, IMG_FLOOR.y, IMG_FLOOR.z], [EAR.x, EAR.y, EAR.z],
    ], PAL.am, 1.3, { opacity: 0.36, dashed: true, dashSize: 0.075, gapSize: 0.055, depthTest: false }));
    {
      const g = dot(PAL.am, 0.11, 0.55, spr, true);
      g.position.copy(IMG_FLOOR);
      field.add(g);
      field.add(floorRing(B_FLOOR.x, B_FLOOR.z, 0.095, 0.008, PAL.am, 1.6, 0.75, 44));
    }

    // -- side wall: the left speaker off the left wall ------------------------
    field.add(poly([
      [SL.x, SL.y, SL.z], [B_WALL.x, B_WALL.y, B_WALL.z], [EAR.x, EAR.y, EAR.z],
    ], PAL.am, 1.5, { opacity: 0.40 }));
    {
      const z0 = -2.9, z1 = 0.9, y1 = 2.1;
      field.add(poly([
        [WALL_X, 0.004, z0], [WALL_X, y1, z0], [WALL_X, y1, z1], [WALL_X, 0.004, z1], [WALL_X, 0.004, z0],
      ], PAL.ink3, 1.1, { opacity: 0.26, dashed: true, dashSize: 0.06, gapSize: 0.05 }));
    }

    // -- the seat ------------------------------------------------------------
    field.add(floorRing(EAR.x, EAR.z, 0.32, 0.008, PAL.cy, 1.6, 0.6, 64));
    field.add(poly([[EAR.x, 0.008, EAR.z], [EAR.x, EAR.y, EAR.z]], PAL.cy, 1.2,
      { opacity: 0.4, dashed: true, dashSize: 0.03, gapSize: 0.026 }));
    {
      const g = dot(PAL.cy, 0.075, 0.9, spr);
      g.position.copy(EAR);
      field.add(g);
    }

    // =====================================================================
    // 2 · THE PARCEL WINDOW — air is not a conveyor
    // =====================================================================
    const CW = 0.88, CH = 0.52, FH = (ROWS - 1) / 2 * ROW_DY;
    const air = card(CW, CH, 0.70);
    air.position.set(-0.06, 2.33, 2.64);
    overlay.add(air);
    S.air = air;

    S.swarm = new DIAG.Swarm(COLS * ROWS, { color: PAL.cy, size: 0.0055 });
    air.add(S.swarm);

    // the compression maximum, travelling at c
    S.crest = poly([[0, -FH - 0.014, 0.002], [0, FH + 0.014, 0.002]], PAL.cy, 1.3,
      { opacity: 0.38, dashed: true, dashSize: 0.014, gapSize: 0.012 });
    air.add(S.crest);
    S.crestTip = poly([[-0.012, FH + 0.014, 0.002], [0, FH + 0.032, 0.002], [0.012, FH + 0.014, 0.002]],
      PAL.cy, 1.8, { opacity: 0.75 });
    air.add(S.crestTip);

    // λ at true scale; displacement at ×MAG. Both dimensioned, both labelled.
    air.add(DIAG.dimension([-LAM_REF / 2, 0.196, 0.001], [LAM_REF / 2, 0.196, 0.001],
      { color: PAL.ink3, width: 1.3, head: 0.020 }));
    air.add(DIAG.dimension([-XI_DRAWN, -0.196, 0.001], [XI_DRAWN, -0.196, 0.001],
      { color: PAL.cy, width: 1.6, head: 0.020 }));
    // the tracked parcel always comes back to this line
    air.add(poly([[0, -0.196, 0.001], [0, -FH - 0.010, 0.001]], PAL.ink3, 1.0,
      { opacity: 0.42, dashed: true, dashSize: 0.012, gapSize: 0.010 }));
    for (const sx of [-1, 1]) {
      air.add(poly([[sx * XI_DRAWN, -0.214, 0.001], [sx * XI_DRAWN, -0.178, 0.001]],
        PAL.cy, 1.2, { opacity: 0.65 }));
    }

    const aTitle = anchor(air, -CW / 2 + 0.02, -CH / 2);
    const aLam = anchor(air, LAM_REF / 2, 0.196);
    const aXi = anchor(air, 0, -0.214);

    // leader from the window down to the woofer it is a window onto
    {
      const wf = V(SL.x + 0.06, 0.42, SL.z + 0.18);
      overlay.add(poly([
        [air.position.x - 0.30, air.position.y - 0.27, air.position.z],
        [(air.position.x + wf.x) / 2 - 0.30, (air.position.y + wf.y) / 2 - 0.10, (air.position.z + wf.z) / 2],
        [wf.x, wf.y, wf.z],
      ], PAL.ink3, 1.0, { opacity: 0.22, dashed: true, dashSize: 0.05, gapSize: 0.045 }));
    }

    // =====================================================================
    // 3 · WHAT THE ROOM DID TO IT — direct + floor bounce
    // =====================================================================
    const GW_W = 0.62, GW_H = 0.25;
    const comb = card(0.80, 0.44, 0.72);
    comb.position.set(0.98, 2.29, 1.92);
    overlay.add(comb);
    S.comb = comb;
    const gr = new DIAG.Graph({
      w: GW_W, h: GW_H, xLog: true, xRange: [50, 4000], yRange: [-20, 8],
      yTicks: [-20, -13, -6, 1, 8], zeroLine: 0,
    });
    gr.position.set(-GW_W / 2, -GW_H / 2 - 0.014, 0.001);
    comb.add(gr);
    gr.addTrace((f) => combDb(f), { color: PAL.am, width: 2.2, n: 460 });
    gr.addMarker(COMB_NULL_F, { color: PAL.cy, width: 1.2, opacity: 0.6 });
    const cTitle = anchor(comb, -0.40 + 0.02, 0.22);

    // =====================================================================
    // 4 · THE EAR — outer and middle ear at ×26; the cochlea beside it,
    //     uncoiled at ×13 so the tonotopic map is a ruler, not a doodle.
    //     Both magnifications are stated on screen.
    // =====================================================================
    const ME = 26, CO = 12;
    const ear = card(1.10, 0.46, 0.90);
    ear.position.set(0.80, 1.28, 2.80);
    overlay.add(ear);
    S.ear = ear;

    const X0 = -0.52, Y0 = 0.02;
    const mx = (mm) => X0 + mm * 1e-3 * ME;
    const my = (mm) => Y0 + mm * 1e-3 * ME;

    // ---- the last 10 mm of the ear canal, as a duct ----------------------
    const wallOf = (sgn) => {
      const t = new DIAG.Trace(16, PAL.ink3, 2.8, { opacity: 0.92 });
      t.write((i, u) => [mx(u * 10), my(sgn * (3.6 - u * 0.3) + Math.sin(u * Math.PI) * 0.5), 0]);
      return t;
    };
    ear.add(wallOf(1), wallOf(-1));
    ear.add(poly([[mx(0), my(3.6), 0], [mx(0), my(-3.6), 0]], PAL.ink3, 1.5,
      { opacity: 0.5, dashed: true, dashSize: 0.011, gapSize: 0.009 }));
    // pressure arriving down the canal
    ear.add(poly([[mx(1.4), my(0), 0], [mx(5.6), my(0), 0]], PAL.cy, 1.6, { opacity: 0.6 }));
    ear.add(poly([[mx(4.4), my(1.1), 0], [mx(5.9), my(0), 0], [mx(4.4), my(-1.1), 0]],
      PAL.cy, 1.6, { opacity: 0.75 }));

    // ---- tympanic membrane: 9 mm across, canted; the umbo is its centre ---
    const umbo = [mx(10.0), my(0.0)];
    ear.add(poly([[mx(8.6), my(-4.6), 0], [mx(11.4), my(4.6), 0]], PAL.cy, 3.6, { opacity: 1 }));

    // ---- the ossicles as what they are: a lever -------------------------
    //   long arm (malleus, umbo → axis) : short arm (incus, axis → stapes)
    //   is drawn at the stated 1.3 : 1, so the ratio is visible, not asserted.
    const FUL = [mx(15.2), my(4.6)];
    const armLong = Math.hypot(15.2 - 10.0, 4.6 - 0.0);            // 6.94 mm
    const armShort = armLong / LEVER;                              // 5.34 mm
    const aTh = Math.atan2(-3.0, 4.4);
    const STA = [mx(15.2 + armShort * Math.cos(aTh)), my(4.6 + armShort * Math.sin(aTh))];
    const fpA = [mx(21.4), my(-0.1)], fpB = [mx(21.4), my(2.9)];   // footplate, 3.0 mm
    ear.add(poly([umbo, FUL], PAL.cy, 2.8, { opacity: 0.95 }));    // malleus
    ear.add(poly([FUL, STA], PAL.cy, 2.4, { opacity: 0.95 }));     // incus long process
    ear.add(poly([STA, fpA, fpB, STA], PAL.cy, 2.2, { opacity: 0.95 }));   // the stirrup
    ear.add(poly([fpA, fpB], PAL.cy, 4.4, { opacity: 1 }));        // footplate = oval window
    // the axis of rotation
    ear.add(poly([[FUL[0] - 0.042, FUL[1], 0], [FUL[0] + 0.030, FUL[1], 0]], PAL.ink3, 1.2,
      { opacity: 0.5, dashed: true, dashSize: 0.010, gapSize: 0.008 }));
    const joint = (p, r, colour = PAL.cy, op = 0.92) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20),
        new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, transparent: true, opacity: op }));
      m.position.set(p[0], p[1], 0.001);
      return m;
    };
    ear.add(joint(FUL, 0.016), joint(STA, 0.009), joint(umbo, 0.008));

    // ---- the cochlea, uncoiled, at ×13 ----------------------------------
    const BX0 = mx(21.4) + 0.052, BL = GW.L * CO;                 // 35 mm → 0.455 m
    const BX1 = BX0 + BL;
    const yV = (u) => 0.022 - 0.014 * u;             // scala vestibuli roof
    const yB = (u) => -0.024 - 0.014 * u;            // basilar membrane
    const yT = (u) => -0.070 - 0.014 * u;            // scala tympani floor
    const lineOf = (fn, colour, w, op) => {
      const t = new DIAG.Trace(40, colour, w, { opacity: op });
      t.write((i, u) => [BX0 + u * BL, fn(u), 0]);
      return t;
    };
    ear.add(lineOf(yV, PAL.ink3, 1.9, 0.7));
    ear.add(lineOf(yT, PAL.ink3, 1.9, 0.7));
    ear.add(lineOf(yB, PAL.cy, 3.0, 1));
    // helicotrema — the two scalae meet round the end of the membrane
    ear.add(poly([
      [BX1, yV(1), 0], [BX1 + 0.028, (yV(1) + yT(1)) / 2, 0], [BX1, yT(1), 0],
    ], PAL.ink3, 1.9, { opacity: 0.7 }));
    // the stapes drives the vestibular scala; the tympanic scala returns to the
    // round window. Perilymph is incompressible: push in here, bulge out there.
    ear.add(poly([[mx(21.4), my(1.4), 0], [BX0, yV(0), 0]], PAL.cy, 1.9, { opacity: 0.85 }));
    ear.add(poly([[BX0, yT(0), 0], [mx(22.6), my(-5.2), 0], [mx(21.8), my(-6.0), 0]],
      PAL.am, 1.9, { opacity: 0.85 }));
    ear.add(poly([[mx(21.4), my(-4.8), 0], [mx(21.4), my(-7.2), 0]], PAL.am, 4.4, { opacity: 1 }));
    ear.add(poly([[mx(20.2), my(-6.0), 0], [mx(15.4), my(-6.0), 0]], PAL.am, 1.5,
      { opacity: 0.6, dashed: true, dashSize: 0.013, gapSize: 0.010 }));

    // tonotopic ticks: Greenwood, placed by real distance along the membrane
    for (const f of [F_BASE, 10000, 4000, 1000, 200, F_APEX]) {
      const u = 1 - gwX(f);                          // fraction of the length from the base
      const big = (f === F_BASE || f === F_APEX || f === 1000);
      const y0 = big ? yV(u) : yB(u) - 0.016;
      const y1 = big ? yT(u) : yB(u) + 0.016;
      ear.add(poly([
        [BX0 + u * BL, y0, 0], [BX0 + u * BL, y1, 0],
      ], PAL.cy, big ? 2.4 : 1.4, { opacity: big ? 0.95 : 0.45 }));
    }
    const u1k = 1 - gwX(1000);
    ear.add(joint([BX0 + u1k * BL, yB(u1k)], 0.009));
    const eME = anchor(ear, mx(4.0), my(4.6));
    const eCoch = anchor(ear, BX0 + u1k * BL, yT(u1k) - 0.010);

    // =====================================================================
    // LABELS — eleven, and no more
    // =====================================================================
    S.lab = {};
    S.lab.air = L.add(aTitle, {
      kicker: 'Air parcels · 1 kHz at 94 dB SPL',
      text: br('space 1 : 1 · displacement ×' + MAG_R.toLocaleString('en-GB')),
      value: 'wave ' + fmt(c, 1) + ' m/s : air ' + fmt(U_PK * 1e3, 2) + ' mm/s = '
        + fmt(SPEED_RATIO / 1e3, 1) + '×10³',
      cls: 'acc', offset: [252, 76],
    });
    S.lab.lam = L.add(aLam, {
      kicker: 'Wavelength, true scale',
      value: 'λ = ' + fmt(LAM_REF * 1000, 1) + ' mm',
      offset: [70, -18],
    });
    S.lab.xi = L.add(aXi, {
      kicker: 'Particle displacement ×' + MAG_R.toLocaleString('en-GB'),
      value: '±0.000 µm',
      cls: 'acc', offset: [0, 24],
    });
    S.lab.wave = L.add(V(-3.0, 0.04, -2.2), {
      kicker: 'Wavefront · ' + F_WAVE + ' Hz · λ = ' + fmt(LAM_WAVE, 3) + ' m · weight ∝ 1/r',
      text: br(fmt(c, 1) + ' m/s · sphere cut at the floor'),
      value: 'r = 0.00 m',
      cls: 'acc', offset: [30, -96],
    });
    S.lab.ruler = L.add(ruler2m, {
      kicker: 'Inverse square · ' + SENS + ' dB / 2.83 V / 1 m · ' + PEAK_W + ' W',
      text: br('1 m ' + fmt(SPL_1M, 1) + ' dB · 2 m ' + fmt(SPL_2M, 1) + ' dB'),
      value: 'seat ' + fmt(R_DIR, 3) + ' m — ' + fmt(SPL_SEAT_1, 1) + ' dB',
      offset: [26, -88],
    });
    S.lab.floor = L.add(B_FLOOR.clone().setY(0.02), {
      kicker: 'Floor bounce · image source 0.95 m down',
      text: br('+' + fmt(R_FLOOR - R_DIR, 3) + ' m of path'),
      value: '+' + fmt(DT_FLOOR * 1000, 3) + ' ms',
      cls: 'am', offset: [-28, 68],
    });
    S.lab.wall = L.add(V(
      B_WALL.x + 0.72 * (EAR.x - B_WALL.x),
      B_WALL.y + 0.72 * (EAR.y - B_WALL.y),
      B_WALL.z + 0.72 * (EAR.z - B_WALL.z),
    ), {
      kicker: 'Side wall at ' + fmt(-WALL_X, 2) + ' m',
      text: br('+' + fmt(R_WALL - R_DIR, 3) + ' m of path'),
      value: '+' + fmt(DT_WALL * 1000, 2) + ' ms',
      cls: 'am', offset: [8, 10],
    });
    S.lab.seat = L.add(EAR.clone(), {
      kicker: 'Listening seat · ear at ' + fmt(EAR.y, 2) + ' m',
      text: br('direct sound arrives in ' + fmt(T_DIR * 1000, 2) + ' ms'),
      value: fmt(SPL_SEAT, 1) + ' dB peak',
      cls: 'acc', offset: [-126, 28],
    });
    S.lab.comb = L.add(cTitle, {
      kicker: 'Direct + floor bounce · 50 Hz – 4 kHz',
      text: br('reflection ' + fmt(COMB_A, 2) + ' × direct'),
      value: fmt(COMB_NULL_DB, 1) + ' dB at ' + fmt(COMB_NULL_F, 0) + ' Hz',
      cls: 'am', offset: [116, -34],
    });
    S.lab.ear = L.add(eME, {
      kicker: 'Middle ear ×' + ME + ' · ' + (A_TM * 1e6).toFixed(0) + '/'
        + (A_FP * 1e6).toFixed(1) + ' mm² × ' + LEVER + ' lever',
      text: br('returns ' + fmt(-TRANS_DB, 1) + ' dB lost at the fluid'),
      value: '×' + fmt(ME_GAIN, 1) + ' = +' + fmt(ME_GAIN_DB, 1) + ' dB',
      cls: 'acc', offset: [26, -26],
    });
    S.lab.coch = L.add(eCoch, {
      kicker: 'Basilar membrane, uncoiled ×' + CO + ' · Greenwood',
      text: br('base ' + fmt(F_BASE / 1000, 1) + ' kHz → apex ' + fmt(F_APEX, 1) + ' Hz'),
      value: '1 kHz, ' + fmt(X_1K * 1e3, 1) + ' mm from the apex',
      offset: [-24, 42],
    });

    // insets paint above the room's own diagram layer
    liftOrder(air, 30); liftOrder(comb, 30); liftOrder(ear, 30);

    /*
     * NOTE — `Trace` cannot be faded by opacity. `DIAG.lineMaterial` sets
     * alphaToCoverage, and LineMaterial's fragment shader does
     *     float alpha = opacity; … alpha = 1.0 - smoothstep( … );
     * so under USE_ALPHA_TO_COVERAGE the coverage term *overwrites* opacity and
     * every fat line renders at full strength however hard `fadeTree` fades it.
     * Left alone, this stage's diagram stays burned into every other stage's
     * frame. `color` is still honoured, so we fade the lines by luminance in
     * setReveal() and drop the whole overlay once it is nearly out.
     */
    S.lines = [];
    overlay.traverse((o) => {
      if (o.isLine2 && o.material && o.material.color) {
        S.lines.push({ m: o.material, c: o.material.color.clone() });
      }
    });
    S.overlay = overlay;

    // seed one frame so the very first render is never empty
    this.update(0, 0, ctx);
    return { hardware: null, overlay };
  },

  update(dt, t, ctx) {
    // ---- the parcel window ------------------------------------------------
    const ph = W_REF * t;
    const FH = (ROWS - 1) / 2 * ROW_DY;
    if (S.swarm) {
      const half = (COLS - 1) / 2, midRow = (ROWS - 1) / 2;
      S.swarm.update((idx) => {
        const j = idx % COLS, r = (idx / COLS) | 0;
        const x0 = (j - half) * SPACING;
        const arg = K_REF * x0 - ph;
        const disp = XI_DRAWN * Math.cos(arg);
        // condensation −∂ξ/∂x = ξ·k·sin(arg), i.e. XI_K·cond: ±75 % of the
        // undisturbed density. Size and brightness carry the normalised value.
        const cond = Math.sin(arg);
        const u = 0.5 + 0.5 * cond;
        const zj = ((j * 37 + r * 91) % 17) / 17 - 0.5;
        const tracked = (j === half && r === midRow);
        _col.copy(C_DIM).lerp(C_HOT, u);
        return {
          p: [x0 + disp, (r - midRow) * ROW_DY, zj * 0.014],
          s: (tracked ? 1.8 : 1.0) * (0.80 + 0.65 * u),
          c: tracked ? C_HOT : _col,
        };
      });
    }
    if (S.crest) {
      // the compression maximum sits at k·x − ω·t = π/2, so it advances at ω/k = c.
      // Wrap over exactly the two wavelengths on show, so it always lands on a crest.
      const span = 2 * LAM_REF;
      let xc = (ph + Math.PI / 2) / K_REF;
      xc = ((xc + span / 2) % span + span) % span - span / 2;
      S.crest.write((i) => [xc, i === 0 ? -FH - 0.014 : FH + 0.014, 0.002]);
      S.crestTip.write((i) => [
        xc + [-0.012, 0, 0.012][i], [FH + 0.014, FH + 0.032, FH + 0.014][i], 0.002,
      ]);
    }

    // ---- the wavefront on the floor ---------------------------------------
    let rShow = 0;
    for (const tr of S.rings || []) {
      const R = ((c * t + tr.userData.i * LAM_WAVE) % R_RING_MAX + R_RING_MAX) % R_RING_MAX;
      const rho2 = R * R - AC_Y * AC_Y;
      if (rho2 <= 0.0004) { tr.visible = false; continue; }
      tr.visible = true;
      const rr = Math.sqrt(rho2), src = tr.userData.src;
      tr.write((i, u) => {
        const a = u * DSP.TAU;
        return [src.x + Math.cos(a) * rr, 0.014, src.z + Math.sin(a) * rr];
      });
      // amplitude falls as 1/r, and the line carries it as weight
      const born = DSP.smoothstep(AC_Y, AC_Y + 0.5, R);
      tr.material.linewidth = DSP.clamp(3.4 / Math.max(R, 1), 0.45, 3.4);
      tr._baseOpacity = 0.72 * born;
      if (src === SR && R > rShow) rShow = R;
    }
    S.rNow = rShow;

    // ---- live values -------------------------------------------------------
    if (S.lab) {
      const xiNow = XI_PK * Math.cos(ph);
      S.xiNow = xiNow;
      S.uNow = -U_PK * Math.sin(ph);
      S.lab.xi.setValue((xiNow >= 0 ? '+' : '−') + fmt(Math.abs(xiNow) * 1e6, 3) + ' µm');
      S.lab.wave.setValue('r = ' + fmt(rShow, 2) + ' m');
    }

    // ---- the insets are true billboards: parallel to the image plane, so
    //      they read as printed plates rather than keystoned signage
    for (const g of [S.air, S.ear, S.comb]) if (g) g.quaternion.copy(ctx.camera.quaternion);
  },

  setReveal(k) {
    const kk = DSP.clamp(k, 0, 1);
    for (const it of S.lines || []) it.m.color.copy(it.c).multiplyScalar(kk);
    if (S.overlay) S.overlay.visible = kk > 0.05;
  },

  content() {
    return `
<h3>Air is not a conveyor</h3>
<p>The woofer does not send you air; it sends a disturbance. Every parcel
oscillates about a fixed point and stays there. Only the compression travels.</p>

<div class="eq">at 1 kHz, 94 dB SPL <span class="c">(p = 1 Pa rms)</span>
u  = p/ρc = 1/(1.2041×343.2) = <span class="hl">${fmt(U_REF * 1e3, 2)} mm/s</span>
ξ  = u/ω  = ${fmt(U_REF * 1e3, 2)}e−3/6283     = <span class="hl">${fmt(XI_REF * 1e6, 3)} µm</span>
c/û = ${fmt(c, 1)}/${fmt(U_PK * 1e3, 2)}e−3        = <span class="hl">${fmt(SPEED_RATIO / 1e3, 0)}×10³ : 1</span></div>

<p>This is the mains cable again: electrons drift
<span class="num">${fmt(V_DRIFT * 1e3, 3)}</span> mm/s and flex
<span class="num">${fmt(X_DRIFT * 1e6, 2)}</span> µm about a fixed point while the field runs
at <span class="num">0.66 c</span> — a ratio of
<span class="num">${(RATIO_CABLE / 1e12).toFixed(2)}×10¹²</span>. Here the air flexes
<span class="num">${fmt(XI_PK * 1e6, 3)}</span> µm peak and the wave outruns it by
<span class="num">${fmt(SPEED_RATIO / 1e3, 0)}×10³</span>. Same lesson, different medium.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Sound is not moving air. At the
threshold of hearing the displacement is
<span class="num">${(XI_THR_PK * 1e12).toFixed(1)}×10⁻¹²</span> m peak — a tenth of the
${(BOHR_D * 1e12).toFixed(0)} pm Bohr diameter of a hydrogen atom. Nothing is carried.</p></div>

<h3>Cone to pressure</h3>
<p>Volume velocity <span class="num">U = S<sub>d</sub>·u</span>; far field into half space
<span class="num">p = ρfU/r</span>. A 220 mm cone
(<span class="num">${(SD * 1e4).toFixed(0)}</span> cm²) at ±4.0 mm and 40 Hz gives
<span class="num">${fmt(Q_VOL * 1e3, 1)}</span> L/s →
<span class="num">${fmt(SPL_BASS_1M, 1)}</span> dB at 1 m,
<span class="num">${fmt(SPL_BASS_SEAT, 1)}</span> dB at the seat for the coherent pair. At
<span class="num">${SENS}</span> dB / 2.83 V / 1 m, a ${PEAK_W} W peak gives
<span class="num">${fmt(SPL_1M, 1)}</span> /
<span class="num">${fmt(SPL_2M, 1)}</span> / <span class="num">${fmt(SPL_SEAT_1, 1)}</span> dB
at 1 m, 2 m and <span class="num">${fmt(R_DIR, 3)}</span> m; the pair sums to
<span class="num">${fmt(SPL_SEAT, 1)}</span> dB correlated,
<span class="num">${fmt(SPL_SEAT_UNC, 1)}</span> dB not.</p>

<h3>The room answers</h3>
<p>The floor bounce is a second speaker <span class="num">0.95</span> m below the floor:
<span class="num">+${fmt(R_FLOOR - R_DIR, 3)}</span> m,
<span class="num">+${fmt(DT_FLOOR * 1000, 2)}</span> ms, first cancellation at
1/(2Δt) = <span class="num">${fmt(COMB_NULL_F, 0)}</span> Hz and
<span class="num">${fmt(COMB_NULL_DB, 1)}</span> dB deep, peaks
<span class="num">+${fmt(COMB_PEAK_DB, 1)}</span> dB. The side wall adds
<span class="num">+${fmt(DT_WALL * 1000, 2)}</span> ms. Both land inside the fusion window —
the echo threshold is milliseconds for clicks, tens for music — so you hear one event, coloured.</p>

<h3>The ear</h3>
<p>Air to perilymph passes
<span class="num">${TRANS.toExponential(2).replace('e-3', '×10⁻³')}</span> of the incident power:
<span class="num">${fmt(TRANS_DB, 1)}</span> dB. The middle ear returns
<span class="num">${fmt(ME_GAIN_DB, 1)}</span> dB of it — ${(A_TM * 1e6).toFixed(0)}/${(A_FP * 1e6).toFixed(1)}
mm² of area times a ${LEVER} lever. The canal is a stopped pipe,
c/4L = <span class="num">${fmt(CANAL_F / 1000, 2)}</span> kHz. Greenwood then codes frequency
by place: <span class="num">${fmt(F_BASE / 1000, 1)}</span> kHz at the base,
<span class="num">${fmt(F_APEX, 1)}</span> Hz at the apex of 35 mm. The eardrum moves less
than free air — measured tympanic displacement is of order
<span class="num">10⁻⁷</span> m at 100 dB SPL (von Békésy) — because canal and ossicles
load it.</p>

<div class="key"><span class="lab">The idea</span><p>${PEAK_W} W a channel in;
<span class="num">${fmt(W_AC, 2)}</span> W of sound out and
<span class="num">${fmt(W_HEAT, 0)}</span> W of heat, at
<span class="num">${fmt(ETA0 * 100, 2)}</span>% efficiency. The cone swung ±4 mm; at your ear
the air swings ±<span class="num">${fmt(XI_SEAT_BASS * Math.SQRT2 * 1e6, 1)}</span> µm —
<span class="num">${fmt(CONE_AIR_RATIO, 0)}</span> times less — inside a
<span class="num">${fmt(DR_DB, 0)}</span> dB window from 20 µPa to 20 Pa.</p></div>`;
  },

  readouts() {
    return [
      { k: 'SPL AT SEAT', v: fmt(SPL_SEAT, 1), u: 'dB peak', cls: 'acc', bar: (SPL_SEAT - 40) / 80 },
      { k: 'PARTICLE VEL', v: (S.uNow >= 0 ? '+' : '−') + fmt(Math.abs(S.uNow || 0) * 1e3, 2), u: 'mm/s' },
      { k: 'PARTICLE DISPL', v: (S.xiNow >= 0 ? '+' : '−') + fmt(Math.abs(S.xiNow || 0) * 1e6, 3), u: 'µm', cls: 'acc' },
      { k: 'WAVEFRONT R', v: fmt(S.rNow || 0, 2), u: 'm', bar: (S.rNow || 0) / R_RING_MAX },
      { k: 'FLOOR DELAY', v: fmt(DT_FLOOR * 1000, 3), u: 'ms', cls: 'am' },
      { k: 'ACOUSTIC POWER', v: fmt(W_AC, 3), u: 'W', cls: 'am' },
    ];
  },
};
