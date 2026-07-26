import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { PAL } from '../core/materials.js';
import { radialSprite } from '../core/tex.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
 * AIR · ROOM · EAR — the last 4.83 m.
 *
 * No hardware of its own. The subject is the listening seat: the chair that
 * already stands there, the ear point above it, the two direct paths and the
 * floor bounce. Two plates flank it — a magnified window of the air at 1 kHz,
 * and what the floor does to the response.
 *
 * Every number is derived from DSP + LAYOUT + the loudspeaker's Thiele–Small
 * primaries at module load. The one aesthetic choice — the displacement
 * magnification — follows from a stated constraint and is printed on screen.
 * ======================================================================== */

const c = DSP.C_SOUND_20C;                 // 343.2 m/s, dry air at 20 °C
const rho = DSP.RHO_AIR;                   // 1.2041 kg/m³
const Z0 = rho * c;                        // 413.25 Pa·s/m — specific impedance of air

// --- the loudspeaker, from its primaries ----------------------------------
/**
 * The same driver speaker.js is built from, so the two chapters cannot print
 * two different loudspeakers. Nothing here is asserted: sensitivity falls out
 * of Small's efficiency, and 2.83 V into 6.2 Ω is 1.29 W, not 1 W.
 */
const TS = { fs: 28.0, Mms: 0.049, Re: 6.2, Bl: 12.0, Qms: 4.2, Sd: 0.0346 };
const ws = DSP.TAU * TS.fs;
const Cms = 1 / (ws * ws * TS.Mms);
const Vas = rho * c * c * TS.Sd * TS.Sd * Cms;                 // 0.1120 m³
const Qes = (ws * TS.Mms * TS.Re) / (TS.Bl * TS.Bl);           // 0.3712
/** Reference efficiency (Small): η₀ = (4π²/c³)·fs³·Vas/Qes. */
const ETA0 = ((4 * Math.PI * Math.PI) / Math.pow(c, 3)) * Math.pow(TS.fs, 3) * Vas / Qes;
/** 1 acoustic watt into 2π sr, at 1 m: p = √(ρc/2π). */
const SPL_1W_AC = DSP.splFromPa(Math.sqrt(Z0 / (2 * Math.PI)));  // 112.16 dB
const SENS_1W = SPL_1W_AC + 10 * Math.log10(ETA0);               // 90.27 dB @ 1 W / 1 m
const P_283 = (2.83 * 2.83) / TS.Re;                             // 1.2917 W into 6.2 Ω
const SENS = SENS_1W + 10 * Math.log10(P_283);                   // 91.38 dB @ 2.83 V / 1 m

// --- geometry -------------------------------------------------------------
/**
 * Acoustic centre for this stage: the MIDRANGE axis, 0.985 m (speaker.js
 * MID_Y). The crossover is LR4 at 80 Hz / 2.20 kHz, so the midrange alone
 * radiates the 300–500 Hz band in which the first floor null falls. Using the
 * tweeter's 1.145 m would move the null 56 Hz.
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
/** The loudest peak on this track asks 100 W a channel of a 300 W monoblock. */
const PEAK_W = 100;
const SPL_1M = DSP.splAt(SENS_1W, PEAK_W, 1);                  // 110.27 dB
const SPL_SEAT_1 = DSP.splAt(SENS_1W, PEAK_W, R_DIR);          // 96.59 dB
/** Pair, mono-correlated, listener on the median plane: +6.02 dB. */
const SPL_SEAT = SPL_SEAT_1 + DSP.dB(2);                       // 102.61 dB
const W_AC_EACH = ETA0 * PEAK_W;                               // 0.6466 W
const W_AC = 2 * W_AC_EACH;                                    // 1.293 W
const W_HEAT = 2 * (PEAK_W - W_AC_EACH);                       // 198.7 W

/**
 * The room hands some of it back. Sabine room constant R = Sᾱ/(1−ᾱ) with the
 * ᾱ = 0.25 the subwoofer chapter states for this room, and
 * Lp − Ldirect = 10·log10(1 + (4/R)·4πr²/Q). The seat is past the critical
 * distance 0.141·√(QR) for any plausible Q, so the ruler is direct field only.
 */
const S_ROOM = 2 * (LAYOUT.room.w * LAYOUT.room.d + LAYOUT.room.w * LAYOUT.room.h
  + LAYOUT.room.d * LAYOUT.room.h);                            // 234.88 m²
const ABAR = 0.25;
const R_CONST = (S_ROOM * ABAR) / (1 - ABAR);                  // 78.29 m²
const revAdd = (Q) => 10 * Math.log10(1 + (4 / R_CONST) * (4 * Math.PI * R_DIR * R_DIR) / Q);
const rCrit = (Q) => 0.141 * Math.sqrt(Q * R_CONST);
const REV_Q2 = revAdd(2);                                      // +9.29 dB
const REV_Q8 = revAdd(8);                                      // +4.58 dB
const RC_Q2 = rCrit(2);                                        // 1.76 m
const RC_Q8 = rCrit(8);                                        // 3.53 m

// --- particle motion, reference condition ---------------------------------
const F_REF = 1000, SPL_REF = 94;
const P_REF_PA = DSP.paFromSpl(SPL_REF);              // 1.0024 Pa rms
const U_REF = P_REF_PA / Z0;                          // 2.4256 mm/s rms
const XI_REF = U_REF / (DSP.TAU * F_REF);             // 0.3860 µm rms
const XI_PK = XI_REF * Math.SQRT2;                    // 0.5460 µm peak
const U_PK = U_REF * Math.SQRT2;                      // 3.4303 mm/s peak
const SPEED_RATIO = c / U_PK;                         // 1.0005 × 10⁵

/** Threshold of hearing: 20 µPa at 1 kHz. */
const XI_THR_PK = ((DSP.P_REF / Z0) / (DSP.TAU * F_REF)) * Math.SQRT2;   // 10.89 pm peak
const BOHR_D = 2 * 52.9177e-12;                       // 105.8 pm, hydrogen

/** The same lesson one stage upstream: electrons in a 2.5 mm² mains flex. */
const V_DRIFT = DSP.driftVelocity(5, 2.5);                             // 0.1470 mm/s rms
const V_DRIFT_PK = V_DRIFT * Math.SQRT2;                               // 0.2079 mm/s peak
const X_DRIFT = DSP.driftDisplacement(V_DRIFT_PK, 50);                 // 0.662 µm peak
const RATIO_CABLE = DSP.signalSpeed(0.66) / V_DRIFT_PK;                // 9.52 × 10¹¹

// --- cone to pressure -----------------------------------------------------
const F_BASS = 40;
const X_CONE = 0.004;                                  // ±4.0 mm peak, half of Xmax
const U_CONE = DSP.TAU * F_BASS * X_CONE / Math.SQRT2; // 0.711 m/s rms
const Q_VOL = TS.Sd * U_CONE;                          // 24.60 L/s rms
const SPL_BASS_1M = DSP.splFromExcursion(X_CONE, F_BASS, TS.Sd, 1);                  // 95.45 dB
const SPL_BASS_SEAT = DSP.splFromExcursion(X_CONE, F_BASS, TS.Sd, R_DIR) + DSP.dB(2);// 87.79 dB
const XI_SEAT_BASS_PK = ((DSP.paFromSpl(SPL_BASS_SEAT) / Z0) / (DSP.TAU * F_BASS)) * Math.SQRT2;
const CONE_AIR_RATIO = X_CONE / XI_SEAT_BASS_PK;       // 600 : 1

// --- the room's answer ----------------------------------------------------
/** Hard floor: pressure reflection coefficient 0.90, i.e. α = 0.19, flat with f. */
const R_HARD = 0.90;
const COMB_A = (R_DIR / R_FLOOR) * R_HARD;             // 0.8289
const COMB_NULL_F = 1 / (2 * DT_FLOOR);                // 414.0 Hz
const COMB_NULL_DB = DSP.dB(1 - COMB_A);               // −15.34 dB
const COMB_PEAK_F = 1 / DT_FLOOR;                      // 827.9 Hz
const COMB_PEAK_DB = DSP.dB(1 + COMB_A);               // +5.25 dB
const combDb = (f) => DSP.dB(Math.sqrt(1 + COMB_A * COMB_A + 2 * COMB_A * Math.cos(DSP.TAU * f * DT_FLOOR)));

// --- the ear (prose only; the plate was cut) ------------------------------
const A_TM = 55e-6;        // m², effective vibrating area of the tympanic membrane
const A_FP = 3.2e-6;       // m², stapes footplate
const LEVER = 1.3;         // malleus : incus arm ratio
const ME_GAIN_DB = DSP.dB((A_TM / A_FP) * LEVER);      // +26.98 dB
const Z_PERI = 1000 * 1500;                            // perilymph ≈ water, 1.5 MPa·s/m
const TRANS_DB = 10 * Math.log10(4 * Z0 * Z_PERI / Math.pow(Z0 + Z_PERI, 2));   // −29.58 dB
const DR_DB = DSP.splFromPa(20);                       // 120 dB, 20 µPa → 20 Pa

// --- demonstration frequencies -------------------------------------------
/**
 * The wavefront drawn on the floor is at the floor-bounce null, so the ring
 * spacing IS the wavelength that the extra reflected path is half of:
 * R_FLOOR − R_DIR = 0.4145 m = LAM_WAVE/2 exactly, by construction of
 * COMB_NULL_F = 1/(2·DT_FLOOR). The cancellation is therefore visible as
 * geometry rather than asserted as a curve.
 */
const F_WAVE = COMB_NULL_F;               // 414.0 Hz
const LAM_WAVE = DSP.lambda(F_WAVE, c);   // 0.8291 m
const N_RINGS = 3;
const R_RING_MAX = N_RINGS * LAM_WAVE;    // 2.487 m
const LAM_REF = DSP.lambda(F_REF, c);     // 0.3432 m at 1 kHz

// --- parcel-window layout -------------------------------------------------
const PER_LAMBDA = 14, COLS = 2 * PER_LAMBDA + 1, ROWS = 7;
const SPACING = LAM_REF / PER_LAMBDA;                         // 24.5 mm
const ROW_DY = 0.046;
const FH = ((ROWS - 1) / 2) * ROW_DY;                         // 0.138
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
const MAG_S = MAG_R.toLocaleString('en-GB');

// ---------------------------------------------------------------------------
const S = {};   // module-scope state — exactly one instance of this stage exists
const _col = new THREE.Color();
const C_DIM = new THREE.Color(PAL.cyDim).lerp(new THREE.Color(PAL.cy), 0.30);
const C_HOT = new THREE.Color(PAL.cy);
const fmt = (v, d) => v.toFixed(d);
/** Labels are inline spans; a break is needed between .t and .v. */
const br = (s) => s + '<br>';

/**
 * `fadeTree` calls a group's `userData.setOpacity` hook and then still walks
 * into the group, so any plain mesh inside caches its base opacity *after* the
 * hook has already scaled it. The first fade of a stage is `fadeTree(overlay, 0)`,
 * so those meshes cache a base of 0 and never reappear. Dropping the hook lets
 * fadeTree treat each child individually, which it does correctly.
 * (Applies to `DIAG.diagramCard` and `DIAG.dimension`.)
 */
const noHook = (g) => { delete g.userData.setOpacity; return g; };

/** Centred diagram card: local (0,0) is the middle of the plate. */
function card(w, h, opacity = 0.92) {
  const g = new THREE.Group();
  const k = noHook(DIAG.diagramCard(w, h, { opacity, pad: 0.024 }));
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
function dot(colour, size, intensity, tex) {
  return DIAG.glow(colour, size, intensity, tex);
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
  /**
   * The seat, at head height, from just behind and to the right of it. The
   * chair is the only physical object in this chapter and it is the subject;
   * the loudspeakers flank it and the two plates sit above the empty floor
   * either side, clear of the rail and the panel.
   */
  shot: { position: [0.55, 1.80, 6.60], target: [0.05, 0.82, 1.55], fov: 35 },
  /** One clock for the whole stage: 1 : 500. A 1 kHz cycle takes 0.5 s on screen. */
  timeScale: 0.002,

  build(ctx) {
    const overlay = new THREE.Group();
    overlay.name = 'air-overlay';
    const L = ctx.labels;
    const spr = radialSprite(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 1.7);

    // =====================================================================
    // 1 · THE ROOM — the two direct paths, the floor bounce, the seat
    // =====================================================================
    const field = new THREE.Group();
    overlay.add(field);

    // -- the spreading wavefront from the right loudspeaker, where the sphere
    //    cuts the floor. Line weight carries the amplitude, which falls as 1/r.
    S.rings = [];
    for (let i = 0; i < N_RINGS; i++) {
      const t = new DIAG.Trace(180, PAL.cy, 2.6, { opacity: 0.55, renderOrder: 11 });
      t.userData.i = i;
      field.add(t);
      S.rings.push(t);
    }
    for (const src of [SL, SR]) {
      const g = dot(PAL.cy, 0.075, 0.75, spr);
      g.position.copy(src);
      field.add(g);
    }

    // -- both direct rays -------------------------------------------------
    for (const src of [SL, SR]) {
      field.add(poly([[src.x, src.y, src.z], [EAR.x, EAR.y, EAR.z]], PAL.cy, 2.2,
        { opacity: src === SR ? 0.9 : 0.55 }));
    }

    // -- the floor bounce off the left channel: the folded path ------------
    field.add(poly([
      [SL.x, SL.y, SL.z], [B_FLOOR.x, 0.006, B_FLOOR.z], [EAR.x, EAR.y, EAR.z],
    ], PAL.am, 2.0, { opacity: 0.85 }));
    field.add(floorRing(B_FLOOR.x, B_FLOOR.z, 0.10, 0.009, PAL.am, 1.6, 0.7, 44));
    {
      const g = dot(PAL.am, 0.085, 0.7, spr);
      g.position.set(B_FLOOR.x, 0.012, B_FLOOR.z);
      field.add(g);
    }

    // -- the ear ------------------------------------------------------------
    {
      const g = dot(PAL.cy, 0.09, 0.9, spr);
      g.position.copy(EAR);
      field.add(g);
      const ring = new DIAG.Trace(48, PAL.cy, 1.4, { opacity: 0.75, renderOrder: 13 });
      ring.userData.earRing = true;
      field.add(ring);
      S.earRing = ring;
    }

    // =====================================================================
    // 2 · THE PARCEL WINDOW — air is not a conveyor
    // =====================================================================
    const CW = 0.80, CH = 0.52;
    const air = card(CW, CH, 0.93);
    air.position.set(-0.58, 0.56, 2.91);
    overlay.add(air);
    S.air = air;

    // a faint leader tying the window to the loudspeaker it is a window in front of
    overlay.add(poly([
      [-0.58, 0.56 + 0.30, 2.91],
      [(SL.x - 0.58) / 2 - 0.18, 0.98, (SL.z + 2.91) / 2 + 0.30],
      [SL.x + 0.10, 0.90, SL.z + 0.20],
    ], PAL.ink3, 1.0, { opacity: 0.20, dashed: true, dashSize: 0.05, gapSize: 0.045 }));

    S.swarm = new DIAG.Swarm(COLS * ROWS, { color: PAL.cy, size: 0.0052 });
    air.add(S.swarm);

    // the compression maximum, travelling at c
    S.crest = poly([[0, -FH - 0.014, 0.002], [0, FH + 0.014, 0.002]], PAL.cy, 1.3,
      { opacity: 0.38, dashed: true, dashSize: 0.014, gapSize: 0.012 });
    air.add(S.crest);
    S.crestTip = poly([[-0.012, FH + 0.014, 0.002], [0, FH + 0.032, 0.002], [0.012, FH + 0.014, 0.002]],
      PAL.cy, 1.8, { opacity: 0.75 });
    air.add(S.crestTip);

    // λ at true scale; displacement at ×MAG. Both dimensioned.
    air.add(noHook(DIAG.dimension([-LAM_REF / 2, 0.205, 0.001], [LAM_REF / 2, 0.205, 0.001],
      { color: PAL.ink3, width: 1.3, head: 0.020 })));
    air.add(noHook(DIAG.dimension([-XI_DRAWN, -0.205, 0.001], [XI_DRAWN, -0.205, 0.001],
      { color: PAL.cy, width: 1.6, head: 0.020 })));
    // the tracked parcel always comes back to this line
    air.add(poly([[0, -0.205, 0.001], [0, -FH - 0.010, 0.001]], PAL.ink3, 1.0,
      { opacity: 0.42, dashed: true, dashSize: 0.012, gapSize: 0.010 }));
    for (const sx of [-1, 1]) {
      air.add(poly([[sx * XI_DRAWN, -0.222, 0.001], [sx * XI_DRAWN, -0.188, 0.001]],
        PAL.cy, 1.2, { opacity: 0.65 }));
    }

    const aTitle = anchor(air, -CW / 2, CH / 2 + 0.03);

    // =====================================================================
    // LABELS — four
    // =====================================================================
    S.lab = {};
    S.lab.air = L.add(aTitle, {
      kicker: 'Air parcels · 1 kHz · 94 dB SPL',
      text: br('λ ' + fmt(LAM_REF * 1000, 1) + ' mm at true scale'
        + '<br>displacement ×' + MAG_S),
      value: 'ξ = ±0.000 µm',
      cls: 'acc', occlude: false, priority: 4, offset: [168, -46],
    });
    S.lab.seat = L.add(EAR.clone(), {
      kicker: 'At the seat · ' + fmt(R_DIR, 3) + ' m · direct field',
      text: br(fmt(SENS, 1) + ' dB/2.83 V/1 m · ' + PEAK_W + ' W peak'
        + '<br>' + fmt(SPL_1M, 1) + ' dB at 1 m → ' + fmt(SPL_SEAT_1, 1) + ' dB here'),
      value: fmt(SPL_SEAT, 1) + ' dB SPL, the pair · ' + fmt(T_DIR * 1000, 2) + ' ms',
      cls: 'acc', priority: 5, offset: [150, 76],
    });
    S.lab.floor = L.add(B_FLOOR.clone().setY(0.02), {
      kicker: 'Floor bounce · source ' + fmt(AC_Y, 3) + ' m below the floor',
      text: br('+' + fmt(R_FLOOR - R_DIR, 3) + ' m of path = λ/2 · '
        + fmt(COMB_NULL_DB, 1) + ' dB'),
      value: '+' + fmt(DT_FLOOR * 1000, 3) + ' ms',
      cls: 'am', priority: 2, offset: [86, -116],
    });
    S.lab.wave = L.add(V(1.05, 0.02, -0.60), {
      kicker: 'Wavefront · ' + fmt(F_WAVE, 0) + ' Hz · λ = ' + fmt(LAM_WAVE, 3) + ' m',
      text: br(fmt(c, 1) + ' m/s · weight ∝ 1/r'),
      value: 'r = 0.00 m',
      cls: 'acc', priority: 1, offset: [10, 46],
    });

    // the inset paints above the room's own diagram layer
    liftOrder(air, 30);
    S.overlay = overlay;

    // seed one frame so the very first render is never empty
    this.update(0, 0, ctx);
    return { hardware: null, overlay };
  },

  update(dt, t, ctx) {
    // ---- the parcel window ------------------------------------------------
    const ph = W_REF * t;
    if (S.swarm) {
      const half = (COLS - 1) / 2, midRow = (ROWS - 1) / 2;
      S.swarm.update((idx) => {
        const j = idx % COLS, r = (idx / COLS) | 0;
        const x0 = (j - half) * SPACING;
        const arg = K_REF * x0 - ph;
        const disp = XI_DRAWN * Math.cos(arg);
        // condensation −∂ξ/∂x = ξ·k·sin(arg), i.e. XI_K·cond: ±75 % of the
        // undisturbed density. Size and brightness carry the normalised value.
        const u = 0.5 + 0.5 * Math.sin(arg);
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
      const rr = Math.sqrt(rho2);
      tr.write((i, u) => {
        const a = u * DSP.TAU;
        return [SR.x + Math.cos(a) * rr, 0.014, SR.z + Math.sin(a) * rr];
      });
      // amplitude falls as 1/r, and the line carries it as weight
      const born = DSP.smoothstep(AC_Y, AC_Y + 0.5, R);
      tr.material.linewidth = DSP.clamp(3.0 / Math.max(R, 1), 0.45, 3.0);
      tr._baseOpacity = 0.55 * born;
      if (R > rShow) rShow = R;
    }
    S.rNow = rShow;

    // ---- live values -------------------------------------------------------
    if (S.lab) {
      const xiNow = XI_PK * Math.cos(ph);
      S.xiNow = xiNow;
      S.uNow = -U_PK * Math.sin(ph);
      S.lab.air.setValue('ξ = ' + (xiNow >= 0 ? '+' : '−') + fmt(Math.abs(xiNow) * 1e6, 3)
        + ' of ' + fmt(XI_PK * 1e6, 3) + ' µm peak');
      S.lab.wave.setValue('r = ' + fmt(rShow, 2) + ' m');
    }

    // ---- the plates are true billboards: parallel to the image plane, so
    //      they read as printed plates rather than keystoned signage
    for (const g of [S.air, S.comb]) if (g) g.quaternion.copy(ctx.camera.quaternion);
    // the ear marker is a ring drawn in the image plane too
    if (S.earRing) {
      const cam = ctx.camera;
      const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      S.earRing.write((i, u) => {
        const a = u * DSP.TAU, k = 0.085;
        return [
          EAR.x + (Math.cos(a) * rt.x + Math.sin(a) * upv.x) * k,
          EAR.y + (Math.cos(a) * rt.y + Math.sin(a) * upv.y) * k,
          EAR.z + (Math.cos(a) * rt.z + Math.sin(a) * upv.z) * k,
        ];
      });
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

<div class="eq">1 kHz, 94 dB SPL <span class="c">(p = 1 Pa rms)</span>
u = p/ρc = 1/(1.2041·343.2) = <span class="hl">${fmt(U_REF * 1e3, 2)} mm/s</span>
ξ = u/ω  = 2.43e−3/6283     = <span class="hl">${fmt(XI_REF * 1e6, 3)} µm</span> <span class="c">rms</span>
                            <span class="c">${fmt(XI_PK * 1e6, 3)} µm peak</span>
c/û = 343.2/3.43e−3         = <span class="hl">${fmt(SPEED_RATIO / 1e3, 0)}×10³</span></div>

<p>The mains flex again: electrons drift <span class="num">${fmt(V_DRIFT * 1e3, 3)}</span> mm/s
rms (<span class="num">${fmt(V_DRIFT_PK * 1e3, 3)}</span> mm/s peak) and flex
±<span class="num">${fmt(X_DRIFT * 1e6, 2)}</span> µm about a fixed point while the field
runs at <span class="num">0.66 c</span> — a ratio of
<span class="num">${(RATIO_CABLE / 1e11).toFixed(1)}×10¹¹</span>.</p>

<h3>Level</h3>
<p>Small's efficiency for this driver is
<span class="num">${fmt(ETA0 * 100, 2)}</span>%, so 2.83 V into its
<span class="num">${TS.Re}</span>&nbsp;Ω — <span class="num">${fmt(P_283, 2)}</span> W, not
1 W — gives <span class="num">${fmt(SENS, 1)}</span> dB at 1 m, the figure the loudspeaker
chapter derives. A ${PEAK_W} W peak is then <span class="num">${fmt(SPL_1M, 1)}</span> dB at
1 m and <span class="num">${fmt(SPL_SEAT_1, 1)}</span> dB of direct sound at
<span class="num">${fmt(R_DIR, 3)}</span> m; the correlated pair sums to
<span class="num">${fmt(SPL_SEAT, 1)}</span> dB. That is the direct field alone. With
ᾱ = 0.25 over <span class="num">${fmt(S_ROOM, 1)}</span> m² the room constant is
<span class="num">${fmt(R_CONST, 1)}</span> m², so the critical distance is
<span class="num">${fmt(RC_Q2, 1)}</span> m at Q = 2 and
<span class="num">${fmt(RC_Q8, 1)}</span> m at Q = 8: the seat is in the reverberant field
either way, which hands back <span class="num">+${fmt(REV_Q2, 1)}</span> or
<span class="num">+${fmt(REV_Q8, 1)}</span> dB on top.</p>

<h3>The room, and the ear</h3>
<p>The floor bounce is the midrange axis mirrored, a source
<span class="num">${fmt(AC_Y, 3)}</span> m below the floor:
+<span class="num">${fmt(R_FLOOR - R_DIR, 3)}</span> m of path,
+<span class="num">${fmt(DT_FLOOR * 1000, 2)}</span> ms, first cancellation at 1/(2Δt) =
<span class="num">${fmt(COMB_NULL_F, 0)}</span> Hz and
<span class="num">${fmt(COMB_NULL_DB, 1)}</span> dB deep, first peak
+<span class="num">${fmt(COMB_PEAK_DB, 1)}</span> dB at
<span class="num">${fmt(COMB_PEAK_F, 0)}</span> Hz. It lands inside the fusion window, so you
hear one event, coloured. At the eardrum,
${(A_TM * 1e6).toFixed(0)}/${(A_FP * 1e6).toFixed(1)} mm² of area times a ${LEVER} lever
returns <span class="num">${fmt(ME_GAIN_DB, 1)}</span> dB of the
<span class="num">${fmt(-TRANS_DB, 1)}</span> dB the air-to-perilymph mismatch costs.</p>

<div class="key"><span class="lab">The idea</span><p>${PEAK_W} W a channel in;
<span class="num">${fmt(W_AC, 2)}</span> W of sound out and
<span class="num">${fmt(W_HEAT, 0)}</span> W of heat. The cone swings ±4 mm; at
<span class="num">${fmt(R_DIR, 2)}</span> m the air at 40 Hz swings
±<span class="num">${fmt(XI_SEAT_BASS_PK * 1e6, 1)}</span> µm —
<span class="num">${fmt(CONE_AIR_RATIO, 0)}</span> times less — inside a
<span class="num">${fmt(DR_DB, 0)}</span> dB window from 20 µPa to 20 Pa.</p></div>`;
  },

  readouts() {
    return [
      { k: 'DIRECT AT SEAT', v: fmt(SPL_SEAT, 1), u: 'dB SPL', cls: 'acc', bar: (SPL_SEAT - 40) / 80 },
      { k: 'PARTICLE DISPL', v: (S.xiNow >= 0 ? '+' : '−') + fmt(Math.abs(S.xiNow || 0) * 1e6, 3), u: 'µm pk', cls: 'acc' },
      { k: 'PARTICLE VEL', v: (S.uNow >= 0 ? '+' : '−') + fmt(Math.abs(S.uNow || 0) * 1e3, 2), u: 'mm/s' },
      { k: 'WAVEFRONT R', v: fmt(S.rNow || 0, 2), u: 'm', bar: (S.rNow || 0) / R_RING_MAX },
      { k: 'FLOOR DELAY', v: fmt(DT_FLOOR * 1000, 3), u: 'ms', cls: 'am' },
      { k: 'ACOUSTIC POWER', v: fmt(W_AC, 3), u: 'W', cls: 'am' },
    ];
  },
};
