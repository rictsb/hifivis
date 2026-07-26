import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { anodisedNormal } from '../core/tex.js';
import { MAINS, SPEAKER, AMP, CART, PHONO, PREAMP, CHAIN } from '../core/spec.js';

/* ===========================================================================
 * OVERVIEW — "The System"
 *
 * No chassis of its own. What this stage owns is the plumbing: the mains floor
 * box, the cable riser beside the rack, every interconnect in the room, and the
 * listening chair. Two gestures in the overlay and nothing else — mains in (a
 * closed amber loop, live out and neutral back) and signal through (one cyan
 * run from the cartridge to the binding posts) — plus one plot: the level
 * diagram that the whole chain is really about.
 *
 * EVERY PRIMARY COMES FROM src/core/spec.js. Nothing here is re-declared.
 * ======================================================================== */

/* ---------------------------------------------------------------- numbers */

/** Cartridge output at 5 cm/s: derived in spec.js from e = Bl·v. 284.6 µV rms. */
const V_CART = CART.outRms;

/**
 * The gain budget, built FORWARDS from spec.js. The only free choice is the
 * volume setting, and it is not free either: the ladder is a switched resistor
 * network that steps in whole decibels, so it takes the integer nearest the
 * residual that spec.js derives for exactly one watt.
 */
const G_PHONO = PHONO.gainDb;                 // +64.0 dB at 1 kHz
const G_LINE = PREAMP.gainDb;                 // +10.0 dB, fixed line stage
const G_LADDER = Math.round(CHAIN.volumeDb);  // −20 dB, nearest whole step
const G_XOVER = 0.0;                          // active crossover, in band
const G_AMP = AMP.gainDb;                     // +26.0 dB
const G_TOTAL = G_PHONO + G_LINE + G_LADDER + G_XOVER + G_AMP;   // +80.0 dB

const R_SPK = SPEAKER.nominalZ;                   // 8 Ω nominal
const V_TERM = V_CART * DSP.undB(G_TOTAL);        // 2.8461 V rms
const P_TERM = DSP.powerW(V_TERM, R_SPK);         // 1.0125 W
const V_SENS = CHAIN.vTerm;                       // 2.8284 V = 1.000 W into 8 Ω

/**
 * Sensitivity is quoted at 2.83 V / 1 m, so the level at the posts must be
 * referred to 2.83 V — not converted to watts and back, which is the fiddle
 * that hides the 6.2 Ω coil.
 */
const SENS = SPEAKER.sens;                                    // 91.21 dB
const SPL_1M = SENS + DSP.dB(V_TERM / V_SENS);                // 91.26 dB
const LADDER_ERR = DSP.dB(V_TERM / V_SENS);                   // +0.054 dB

/** Amplifier. The load in this room is 8 Ω, so the 8 Ω rating is the one used. */
const P_OUT = AMP.pOut8;                          // 300 W into 8 Ω
const V_AMP = AMP.vRms;                           // 48.99 V rms

/**
 * Mains operating point — stated, not assumed silently: both monoblocks at
 * continuous full output into their actual 8 Ω load, class AB at 55 %, plus a
 * CHOSEN 100 W for the six front-end chassis, drawn at unity power factor.
 */
const P_FRONT = 100;                              // W, CHOSEN
const P_MAINS = (2 * P_OUT) / AMP.effAB + P_FRONT;   // 1190.9 W
const MAINS_V = MAINS.vRms, MAINS_F = MAINS.f;
const I_MAINS = P_MAINS / MAINS_V;                // 5.178 A rms
const I_MAINS_PK = I_MAINS * Math.SQRT2;          // 7.323 A
const CU_MM2 = MAINS.cableAreaMm2;                // 2.5 mm²
const V_DRIFT = DSP.driftVelocity(I_MAINS, CU_MM2) * Math.SQRT2;  // 0.215 mm/s pk
const X_DRIFT = DSP.driftDisplacement(V_DRIFT, MAINS_F);          // 0.685 µm pk
const V_FIELD = MAINS.vField;                     // 1.9786e8 m/s

/** Geometry-derived acoustics: straight from LAYOUT. */
const D_SEAT = Math.hypot(
  LAYOUT.speakerL.x - LAYOUT.listener.x,
  LAYOUT.speakerL.z - LAYOUT.listener.z,
);                                                // 4.830 m
const T_AIR = D_SEAT / DSP.C_SOUND_20C;           // 14.07 ms
const SPL_SEAT = SPL_1M + DSP.distanceLossDb(D_SEAT);   // 77.58 dB, free field

/**
 * Two clocks, and they are NOT the same clock — which is why both are printed.
 * `timeScale` slows everything by 50×, so the mains cycle plays at 1 : 50. The
 * field front is then slowed a further ~1.7×10⁶ on top of that so a 35 ns
 * traverse lasts three seconds. The carriers are NOT slowed beyond 1 : 50;
 * they are magnified in space instead.
 */
const TIME_SCALE = 0.02;
const MAINS_SLOW = 1 / TIME_SCALE;                // 50
const PULSE_REAL = 3.0;                           // real seconds per traverse

/* -------------------------------------------------------------- utilities */

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
/** "9.1 × 10⁷" */
function expo(v, d = 1) {
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(d)} × 10${sup(e)}`;
}

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const curveThrough = (pts) =>
  new THREE.CatmullRomCurve3(pts.map(V3), false, 'catmullrom', 0.28);

/**
 * A true catenary between two points, sagging by `sag` at mid-span:
 * y(u) = sag·(cosh(κ(2u−1)) − cosh κ)/(cosh κ − 1) added to the chord —
 * zero at both ends, −sag at the centre. Clamped just above the floor.
 */
function catenary(a, b, sag, n = 8, kappa = 1.5) {
  const A = V3(a), B = V3(b), ch = Math.cosh(kappa), out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = A.clone().lerp(B, u);
    p.y += sag * ((Math.cosh(kappa * (2 * u - 1)) - ch) / (ch - 1));
    out.push([p.x, Math.max(p.y, 0.0095), p.z]);
  }
  return out;
}

/**
 * Lift a polyline off the surface of the cable that follows it, so the cyan
 * highlight rides the top of the jacket instead of sitting inside it. Vertical
 * runs are pushed toward the camera, everything else straight up.
 */
function liftPath(pts, r) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = V3(pts[Math.max(0, i - 1)]);
    const b = V3(pts[Math.min(n - 1, i + 1)]);
    const t = b.sub(a);
    if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
    t.normalize();
    const nrm = Math.abs(t.y) > 0.7 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const p = V3(pts[i]).addScaledVector(nrm, r);
    out.push([p.x, p.y, p.z]);
  }
  return out;
}

/* =============================================================== hardware */

/**
 * The listening seat: a low, deeply reclined lounge chair on a satin steel
 * sled, square to the system on the listening axis. The overview camera sits
 * behind and outboard of it, so it is deliberately outside the frame here —
 * a chair cropped by the chapter rail was the worst thing in round 2.
 */
function loungeChair() {
  const g = new THREE.Group();
  const M = mats();

  const grain = anodisedNormal(512, 0.62).clone();
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(14, 14);
  grain.needsUpdate = true;

  // Leather is a dielectric with a thin, broad specular lobe over a very dark
  // body: a low clearcoat is what lets the wide front strip lay a soft band
  // across each cushion crown instead of leaving it a flat black shape.
  const leather = M.rubber.clone();
  leather.color.setHex(0x100e0c);
  leather.roughness = 0.74;
  leather.normalMap = grain;
  leather.normalScale = new THREE.Vector2(0.70, 0.70);
  leather.sheen = 0.32;
  leather.sheenRoughness = 0.80;
  leather.sheenColor = new THREE.Color(0x33251a);
  leather.clearcoat = 0.16;
  leather.clearcoatRoughness = 0.42;
  leather.envMapIntensity = 0.44;

  const welt = leather.clone();
  welt.color.setHex(0x1d1712);
  welt.roughness = 0.56;
  welt.sheen = 0.5;

  const HALF_W = 0.375, RUN_D = 0.80;
  const RAIL_Y = 0.238, SEAT_Y = RAIL_Y + 0.062;      // cushion centre
  const HINGE_Y = 0.330, HINGE_Z = 0.320, RAKE = 0.58;
  const cr = Math.cos(RAKE), sr = Math.sin(RAKE);
  const backAt = (d) => [0, HINGE_Y + d * cr, HINGE_Z + d * sr];

  const frame = M.steel.clone();
  frame.roughness = 0.30;
  frame.envMapIntensity = 0.62;
  frame.color.setHex(0x8d9298);

  for (const s of [-1, 1]) {
    const runner = new THREE.Mesh(GEO.bevelBox(0.034, 0.014, RUN_D, 0.005, 3), frame);
    runner.position.set(s * HALF_W, 0.0130, 0.0);
    g.add(runner);

    const rail = new THREE.Mesh(GEO.bevelBox(0.034, 0.018, RUN_D - 0.04, 0.005, 3), frame);
    rail.position.set(s * HALF_W, RAIL_Y, 0.0);
    g.add(rail);

    for (const z of [-0.330, 0.330]) {
      const post = new THREE.Mesh(GEO.bevelBox(0.030, RAIL_Y - 0.026, 0.017, 0.004, 3), frame);
      post.position.set(s * HALF_W, (RAIL_Y - 0.026) / 2 + 0.017, z);
      g.add(post);
      const pad = new THREE.Mesh(GEO.bevelCyl(0.018, 0.020, 0.007, 24, 0.0008), M.anodBlack);
      pad.position.set(s * HALF_W, 0.0035, z);
      g.add(pad);
    }

    const bp = new THREE.Mesh(GEO.bevelBox(0.028, 0.400, 0.017, 0.004, 3), frame);
    bp.rotation.x = -RAKE;
    const [, my, mz] = backAt(0.200);
    bp.position.set(s * (HALF_W - 0.004), my, mz);
    g.add(bp);
  }

  const cross = new THREE.Mesh(GEO.bevelBox(HALF_W * 2 - 0.036, 0.016, 0.030, 0.004, 3), frame);
  cross.position.set(0, RAIL_Y, -0.320);
  g.add(cross);

  for (const x of [-0.248, 0, 0.248]) {
    const pad = new THREE.Mesh(GEO.bevelBox(0.234, 0.118, 0.720, 0.044, 6), leather);
    pad.position.set(x, SEAT_Y, -0.010);
    g.add(pad);
  }

  for (const d of [0.110, 0.300]) {
    for (const x of [-0.232, 0, 0.232]) {
      const pad = new THREE.Mesh(GEO.bevelBox(0.220, 0.176, 0.104, 0.034, 6), leather);
      pad.rotation.x = -RAKE;
      const [, py, pz] = backAt(d);
      pad.position.set(x, py, pz);
      g.add(pad);
    }
  }

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(GEO.bevelBox(0.104, 0.086, 0.520, 0.030, 5), leather);
    arm.position.set(s * (HALF_W - 0.006), RAIL_Y + 0.104, -0.030);
    g.add(arm);
  }

  const superEllipse = (w, d, n = 60, k = 4) => {
    const p = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      const f = Math.pow(Math.pow(Math.abs(cx), k) + Math.pow(Math.abs(sz), k), -1 / k);
      p.push([cx * f * w, 0, sz * f * d]);
    }
    return p;
  };
  const sw = DIAG.tube(superEllipse(0.374, 0.365), 0.0034, welt, 150);
  sw.position.set(0, SEAT_Y + 0.056, -0.010);
  g.add(sw);

  for (const d of [0.110, 0.300]) {
    const bw = DIAG.tube(superEllipse(0.348, 0.090, 52), 0.0030, welt, 130);
    bw.rotation.set(Math.PI / 2 - RAKE, 0, 0);
    bw.position.set(...backAt(d));
    g.add(bw);
  }

  GEO.shadowed(g);
  g.add(GEO.contactShadow(1.34, 1.52, 0.90));
  return g;
}

/**
 * Flush mains floor box — the one place energy enters the room.
 *
 * It carries this stage's specular layer: a supply neon behind a slightly
 * convex clear lens. The lens is a spherical cap with a low but non-zero
 * roughness, so the wide front strip sweeps across it as a soft band that sits
 * visibly IN FRONT of the emitter underneath rather than being painted on it.
 */
function floorBox() {
  const g = new THREE.Group();
  const M = mats();

  // A wide fillet on a satin-not-mirror alloy: a 4 mm bevel on polished stock
  // returns a clipped white bar, a 7 mm one on roughness 0.36 returns a ramp.
  const trim = M.alu.clone();
  trim.color.setHex(0x8a9096);
  trim.roughness = 0.54;
  trim.envMapIntensity = 0.58;
  const plate = new THREE.Mesh(GEO.bevelBox(0.248, 0.015, 0.178, 0.0070, 5), trim);
  plate.position.y = 0.0075;
  g.add(plate);

  const well = new THREE.Mesh(GEO.bevelBox(0.200, 0.010, 0.132, 0.002, 3), M.anodBlack);
  well.position.y = 0.0140;
  g.add(well);

  // two outlets, one with a moulded plug in it
  for (const x of [-0.052, 0.052]) {
    const face = new THREE.Mesh(GEO.bevelCyl(0.0270, 0.0282, 0.010, 32, 0.0009), M.plastic);
    face.position.set(x, 0.0186, 0.030);
    g.add(face);
    for (const [px, pz] of [[-0.0105, 0.007], [0.0105, 0.007], [0, -0.012]]) {
      const pin = new THREE.Mesh(GEO.bevelBox(0.0032, 0.0036, 0.0082, 0.0004, 2), M.anodBlack);
      pin.position.set(x + px, 0.0220, pz + 0.030);
      g.add(pin);
    }
  }

  // --- the specular layer: neon, bezel, convex lens ------------------------
  // Stack, bottom up: black seat, amber neon, air gap, convex lens over it.
  // Everything must clear the well's own top face at y = 0.019 or it is buried.
  const LX = 0.062, LZ = -0.050, LY = 0.0244;
  const bezel = new THREE.Mesh(GEO.bevelCyl(0.0158, 0.0168, 0.0090, 28, 0.0009), M.anodBlack);
  bezel.position.set(LX, 0.0186, LZ);                 // top at 0.0231
  g.add(bezel);

  const neon = new THREE.Mesh(new THREE.CircleGeometry(0.0104, 24), M.ledAmber.clone());
  neon.material.color.multiplyScalar(0.52);
  neon.rotation.x = -Math.PI / 2;
  neon.position.set(LX, 0.0234, LZ);
  g.add(neon);

  const R = 0.034, rim = 0.0132;
  const lensMat = M.clearGlass.clone();
  lensMat.roughness = 0.055;          // low, but not zero — a band, not a dot
  lensMat.transmission = 0.86;
  lensMat.thickness = 0.0024;
  lensMat.clearcoatRoughness = 0.05;
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(R, 28, 12, 0, Math.PI * 2, 0, Math.asin(rim / R)), lensMat,
  );
  lens.position.set(LX, LY + 0.0004 - R * Math.cos(Math.asin(rim / R)), LZ);
  g.add(lens);

  const grommet = new THREE.Mesh(GEO.bevelCyl(0.0104, 0.0150, 0.030, 24, 0.0012), M.rubber);
  grommet.rotation.set(0, -0.35, Math.PI / 2);
  grommet.position.set(GROM_L[0], GROM_L[1], GROM_L[2]);
  g.add(grommet);

  for (const [x, z] of [[-0.112, 0.070], [0.112, 0.070], [-0.112, -0.070], [0.112, -0.070]]) {
    const sc = GEO.screw(0.0020);
    sc.rotation.x = 0;                 // heads face up, not out of a front panel
    sc.position.set(x, 0.0140, z);
    g.add(sc);
  }

  GEO.shadowed(g);
  return g;
}

/** Cable gland on the floor box, in box-local coordinates. */
const GROM_L = [-0.118, 0.026, -0.034];

/** A moulded strain-relief boot where a cable enters a chassis. */
function boot(len = 0.026, r = 0.0068) {
  const g = new THREE.Group();
  const M = mats();
  const body = new THREE.Mesh(GEO.bevelCyl(r * 0.72, r * 1.30, len, 20, 0.0008), M.rubber);
  body.position.y = len / 2;
  g.add(body);
  const collar = new THREE.Mesh(GEO.bevelCyl(r * 1.42, r * 1.42, 0.0055, 22, 0.0007), M.steel);
  collar.position.y = 0.0028;
  g.add(collar);
  GEO.shadowed(g);
  return g;
}

/** Point a boot along a direction, sitting at `p`. */
function bootAt(p, dir, len, r) {
  const b = boot(len, r);
  b.position.copy(V3(p));
  b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V3(dir).normalize());
  return b;
}

/**
 * A slim anodised cable riser standing beside the rack's left cheek, with
 * three P-clips. Without it the interconnects are cables hanging in air, which
 * is exactly the "plugs into nothing" read the audit caught.
 */
function cableRiser(h) {
  const g = new THREE.Group();
  const M = mats();
  const bar = new THREE.Mesh(GEO.bevelBox(0.014, h, 0.026, 0.0022, 3), M.anodBlack);
  bar.position.y = h / 2;
  g.add(bar);
  const foot = new THREE.Mesh(GEO.bevelBox(0.052, 0.010, 0.066, 0.0022, 3), M.anodBlack);
  foot.position.y = 0.005;
  g.add(foot);
  for (const [x, z] of [[-0.017, 0.021], [0.017, 0.021], [-0.017, -0.021], [0.017, -0.021]]) {
    const s = GEO.screw(0.0016);
    s.rotation.x = 0;
    s.position.set(x, 0.0102, z);
    g.add(s);
  }
  return g;
}

/* ================================================================ routing */

const RK = LAYOUT.rack;
const RACK_BACK = RK.z - RK.d / 2;            // −3.55
const MONO_L = LAYOUT.monoL, MONO_R = LAYOUT.monoR;
const SPK_L = LAYOUT.speakerL, SPK_R = LAYOUT.speakerR;
const TT = LAYOUT.ttPlinth;

/** Riser: clear of the rack's left cheek, and clear of the camera's sightline. */
const SPINE_X = -0.365, SPINE_Z = -3.200;
const bayY = (i) => RK.shelfY[i] + 0.055;     // 0.669 / 0.845 / 1.021

/** Mains floor box, out in the right foreground where the loop reads broadside. */
const FB = [1.880, 0, -1.640];
const FB_RY = -0.26;

/** Tonearm output, on the plinth's rear right corner (plinth is yawed 0.30). */
const ARM_OUT = (() => {
  const c = Math.cos(TT.ry), s = Math.sin(TT.ry);
  const lx = 0.250, lz = -0.240;
  return [TT.x + lx * c + lz * s, TT.top - 0.020, TT.z - lx * s + lz * c];
})();

/** Where the run touches a component. Six taps, cartridge to binding posts. */
const N_MONO = [-0.748, 0.196, -3.010];
const N_POST = [-1.470, 0.178, -2.636];

/**
 * The signal run, as a single continuous polyline: cartridge, down the plinth,
 * along the floor BEHIND the monoblock, up the cable riser through the three
 * bays that touch it, back down the riser's outboard face, forward to the
 * monoblock, then out along the loudspeaker cable to the binding posts.
 *
 * It never leaves a surface and it terminates on hardware at both ends.
 */
function signalPath() {
  return [
    ARM_OUT,
    [ARM_OUT[0] + 0.026, TT.top - 0.210, ARM_OUT[2] - 0.050],
    [ARM_OUT[0] + 0.050, 0.130, ARM_OUT[2] - 0.096],
    [ARM_OUT[0] + 0.078, 0.020, ARM_OUT[2] - 0.150],
    ...catenary([-1.960, 0.019, -2.900], [-1.500, 0.019, -3.230], 0.006, 4),
    [-1.180, 0.019, -3.330],
    [-0.860, 0.019, -3.362],
    [-0.610, 0.021, -3.336],
    [-0.470, 0.048, -3.276],
    [SPINE_X - 0.012, 0.140, SPINE_Z - 0.020],
    [SPINE_X - 0.010, 0.420, SPINE_Z - 0.014],
    [SPINE_X - 0.010, bayY(3), SPINE_Z - 0.014],
    [SPINE_X - 0.010, bayY(4), SPINE_Z - 0.014],
    [SPINE_X - 0.010, bayY(5), SPINE_Z - 0.014],
    [SPINE_X - 0.030, bayY(5) - 0.120, SPINE_Z + 0.012],
    [SPINE_X - 0.032, 0.560, SPINE_Z + 0.014],
    [SPINE_X - 0.036, 0.180, SPINE_Z + 0.014],
    [SPINE_X - 0.070, 0.026, SPINE_Z + 0.060],
    [-0.560, 0.021, -3.110],
    [-0.660, 0.021, -3.060],
    [N_MONO[0] + 0.052, 0.070, N_MONO[2] - 0.014],
    N_MONO,
    [N_MONO[0] - 0.012, 0.150, N_MONO[2] + 0.058],
    [N_MONO[0] - 0.030, 0.026, N_MONO[2] + 0.156],
    ...catenary([-0.840, 0.020, -2.790], [-1.220, 0.020, -2.664], 0.005, 4),
    [-1.360, 0.020, -2.628],
    [N_POST[0] + 0.062, 0.058, N_POST[2] + 0.010],
    N_POST,
  ];
}

/** The right channel, physical only — the same run, mirrored, drawn dark. */
function mirrorPath(pts) {
  return pts.map((p) => [-p[0], p[1], p[2]]);
}

/**
 * The mains flex: floor box to the conditioner's rear inlet in bay 0. It is
 * ONE cable; the amber overlay draws its two conductors separated, as if the
 * jacket were transparent, because the return leg is the whole point.
 */
/** World position of the floor box's cable gland — where the flex actually leaves. */
const FB_OUT = (() => {
  const c = Math.cos(FB_RY), s = Math.sin(FB_RY);
  return [FB[0] + GROM_L[0] * c + GROM_L[2] * s, GROM_L[1], FB[2] - GROM_L[0] * s + GROM_L[2] * c];
})();

function mainsRoute() {
  return [
    FB_OUT,
    [1.660, 0.023, -1.792],
    [1.560, 0.021, -1.880],
    [1.240, 0.020, -2.096],
    [0.940, 0.020, -2.278],
    [0.680, 0.021, -2.440],
    [0.560, 0.021, -2.560],
    [0.462, 0.023, -2.702],
    [0.412, 0.035, -2.960],
    [0.378, 0.090, -3.222],
    [0.356, 0.180, RACK_BACK + 0.110],
  ];
}

/** Conditioner to each monoblock: mains, drawn dark, kept low and behind. */
function monoMains(m) {
  const s = Math.sign(m.x);
  return [
    [0.300 * s, 0.176, RACK_BACK + 0.030],
    [0.420 * s, 0.150, RACK_BACK - 0.060],
    [0.640 * s, 0.030, -3.500],
    [m.x - s * 0.180, 0.021, -3.360],
    [m.x - s * 0.060, 0.026, -3.256],
    [m.x - s * 0.020, 0.104, -3.212],
    [m.x - s * 0.014, 0.192, -3.190],
  ];
}

/* ================================================================= levels */

/** Level diagram, in dBV, node by node. Derived — never typed. */
const LEVELS = (() => {
  const L0 = DSP.dB(V_CART);
  const L1 = L0 + G_PHONO;
  const L2 = L1 + G_LINE;
  const L3 = L2 + G_LADDER;
  const L4 = L3 + G_XOVER;
  const L5 = L4 + G_AMP;
  return [L0, L1, L2, L3, L4, L5];
})();
const L_REF = DSP.dB(V_SENS);            // +9.03 dBV = 1.000 W into 8 Ω

/**
 * A slightly convex glass front for the diagram card.
 *
 * The art director's headline note: nothing in this piece has a specular layer
 * sitting IN FRONT of what is underneath it, so every plot reads as a decal.
 * This is a real one — a dielectric panel, gently crowned so the reflected
 * image of the wide front strip sweeps across it as a band rather than sitting
 * on it as a patch. Low opacity, so what it contributes is almost entirely its
 * own specular; the plot underneath still reads through it.
 */
function glassFront(w, h, bulge = 0.020) {
  const SEG = 24;
  const geo = new THREE.PlaneGeometry(w, h, SEG, SEG);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) / w) * 2, v = (pos.getY(i) / h) * 2;
    pos.setZ(i, bulge * (1 - u * u) * (1 - v * v));
  }
  geo.computeVertexNormals();
  const mat = mats().glass.clone();
  mat.color.setHex(0x0a0d12);
  mat.roughness = 0.19;                  // low, but not zero: a band, not a dot
  mat.clearcoat = 0.55;
  mat.clearcoatRoughness = 0.16;
  mat.envMapIntensity = 0.80;
  mat.transparent = true;
  mat.opacity = 0.10;
  mat.depthWrite = false;
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 18;
  return m;
}

/** A soft dark scrim over the floor: the planar reflection returns the tall
 *  hardware at close to the brightness of the real thing, which reads as
 *  standing in water. This is the per-stage remedy the audit allows. */
function reflectionScrim() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, 'rgba(6,7,10,0)');
  grd.addColorStop(0.03, 'rgba(6,7,10,0.14)');
  grd.addColorStop(0.11, 'rgba(6,7,10,0.46)');
  grd.addColorStop(0.28, 'rgba(6,7,10,0.72)');
  grd.addColorStop(1.00, 'rgba(6,7,10,0.84)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(13.5, 7.2),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI;                 // gradient runs far → near
  m.position.set(-0.2, 0.0034, 0.35);
  m.renderOrder = 4;
  return m;
}

export default {
  id: 'overview',
  title: 'The System',
  nav: 'Overview',
  kicker: 'Overview',
  standfirst: 'Twelve boxes carrying one quantity, and one closed loop feeding all of them.',
  /** Whole room. radius 0.65 = the system's half-height, so `fill` is literal. */
  shot: frameShot([-0.22, 0.60, -2.72], 0.65, { fill: 0.35, az: 0.44, el: 0.105, fov: 32 }),
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    const M = mats();

    /* ---------------------------------------------------------- hardware */
    const hardware = new THREE.Group();
    hardware.name = 'overview-hardware';

    // On the listening axis, square to the system. The overview camera is
    // behind and outboard of it, so it is outside this frame by construction.
    const chair = loungeChair();
    chair.position.set(LAYOUT.listener.x, 0, LAYOUT.listener.z - 0.06);
    hardware.add(chair);

    const fbox = floorBox();
    fbox.position.set(FB[0], 0, FB[2]);
    fbox.rotation.y = FB_RY;
    hardware.add(fbox);

    // one riser per channel, so neither run climbs through open air
    for (const s of [-1, 1]) {
      const riser = cableRiser(1.10);
      riser.position.set(s * Math.abs(SPINE_X), 0, SPINE_Z);
      GEO.shadowed(riser);
      hardware.add(riser);
    }

    // PVC jacket: a dielectric with a broad, soft specular lobe. With the
    // widened front strip this now takes a long band down each run, which is
    // what stops the cabling reading as matte tubing.
    const jacket = M.plastic.clone();
    jacket.color.setHex(0x15171b);
    jacket.roughness = 0.44;
    jacket.clearcoat = 0.52;
    jacket.clearcoatRoughness = 0.26;
    jacket.envMapIntensity = 0.85;

    const SIG = signalPath();
    const addCable = (pts, r) => {
      const t = DIAG.tube(pts, r, jacket, Math.max(60, pts.length * 5));
      t.castShadow = true;
      t.receiveShadow = true;
      hardware.add(t);
      return t;
    };

    addCable(SIG, 0.0042);
    // right channel: starts at its own riser, so it has no free end in mid-air
    addCable(mirrorPath(SIG).slice(13), 0.0042);
    const mRoute = mainsRoute();
    addCable(mRoute, 0.0062);
    for (const m of [MONO_L, MONO_R]) addCable(monoMains(m), 0.0056);

    // loudspeaker cable, drawn as the PAIR it is — out and back
    for (const [m, sp] of [[MONO_L, SPK_L], [MONO_R, SPK_R]]) {
      const s = Math.sign(m.x);
      for (const off of [-0.0085, 0.0085]) {
        addCable([
          [m.x + s * 0.200 + off, 0.132, -2.952],
          [m.x + s * 0.246 + off, 0.026, -2.880],
          ...catenary([m.x + s * 0.330 + off, 0.019, -2.812], [sp.x - s * 0.180 + off, 0.019, -2.674], 0.013, 5),
          [sp.x - s * 0.096 + off, 0.030, -2.650],
          [sp.x + s * 0.116 + off, 0.062, -2.640],
          [sp.x + s * 0.148 + off, 0.170, -2.636],
        ], 0.0050);
      }
    }

    // terminations: a boot wherever a run enters a chassis
    for (const [p, d] of [
      [[ARM_OUT[0], ARM_OUT[1] + 0.004, ARM_OUT[2]], [0, 1, 0]],
      [[SPINE_X - 0.010, bayY(3), SPINE_Z - 0.014], [-0.35, 0, -0.94]],
      [[SPINE_X - 0.010, bayY(4), SPINE_Z - 0.014], [-0.35, 0, -0.94]],
      [[SPINE_X - 0.010, bayY(5), SPINE_Z - 0.014], [-0.35, 0, -0.94]],
      [N_MONO, [0.90, 0.10, 0.42]],
      [[-N_MONO[0], N_MONO[1], N_MONO[2]], [-0.90, 0.10, 0.42]],
      [[0.352, 0.184, RACK_BACK + 0.086], [0, 0.10, -0.99]],
    ]) hardware.add(bootAt(p, d, 0.024, 0.0064));

    // spade lugs at the binding posts — the run ends on metal, not in mid-air
    for (const sp of [SPK_L, SPK_R]) {
      const s = Math.sign(sp.x);
      for (const [dy, off] of [[0, -0.0085], [0.032, 0.0085]]) {
        const lug = new THREE.Mesh(GEO.bevelBox(0.020, 0.0022, 0.012, 0.0006, 2), M.gold);
        lug.position.set(sp.x + s * 0.150 + off, 0.170 + dy, -2.634);
        lug.rotation.y = -s * 0.30;
        lug.castShadow = true;
        hardware.add(lug);
      }
    }

    /* ----------------------------------------------------------- overlay */
    const overlay = new THREE.Group();
    overlay.name = 'overview-overlay';
    overlay.add(reflectionScrim());

    /* --- gesture 1: signal through, riding the real cable --------------- */
    const cCurve = curveThrough(liftPath(SIG, 0.0058));
    this.chainLen = curveThrough(SIG).getLength();
    const N = 300;
    const chain = new DIAG.Trace(N, PAL.cy, 2.3, { opacity: 0.92, renderOrder: 13 });
    chain.write((i, u) => { const v = cCurve.getPointAt(u); return [v.x, v.y, v.z]; });
    chain.material.vertexColors = true;
    chain.material.needsUpdate = true;
    chain.geometry.setColors(new Float32Array(N * 3).fill(1));
    this.chainCol = chain.geometry.attributes.instanceColorStart.data;
    this.chainN = N;
    overlay.add(chain);

    // the six taps, glowing as the front passes each one
    const nodes = [ARM_OUT,
      [SPINE_X - 0.010, bayY(3), SPINE_Z - 0.014],
      [SPINE_X - 0.010, bayY(4), SPINE_Z - 0.014],
      [SPINE_X - 0.010, bayY(5), SPINE_Z - 0.014],
      N_MONO, N_POST].map(V3);
    this.nodes = nodes;
    this.nodeU = nodes.map((n) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k <= 300; k++) {
        const d = cCurve.getPointAt(k / 300).distanceToSquared(n);
        if (d < bd) { bd = d; best = k / 300; }
      }
      return best;
    });
    this.nodeSwarm = new DIAG.Swarm(nodes.length, { color: PAL.cy, size: 0.0040 });
    overlay.add(this.nodeSwarm);

    /* --- the last leg is air: two sightlines in the floor plane --------- */
    // Drawn as a break-line: the direction and the first 1.8 m of the 4.83 m,
    // because the seat itself is behind the lens at this framing.
    const seat = new THREE.Vector3(LAYOUT.listener.x, 0.005, LAYOUT.listener.z);
    for (const sp of [SPK_L, SPK_R]) {
      const a = new THREE.Vector3(sp.x, 0.005, sp.z);
      const air = new DIAG.Trace(28, PAL.cy, 1.4, {
        opacity: 0.24, renderOrder: 11, dashed: true, dashSize: 0.055, gapSize: 0.075,
      });
      air.write((i, u) => { const p = a.clone().lerp(seat, u * 0.38); return [p.x, p.y, p.z]; });
      overlay.add(air);
    }

    /* --- gesture 2: mains in, as a closed loop -------------------------- */
    const mCurve = curveThrough(mRoute);
    const SEP = 0.086, MP = 84;
    const live = [], neut = [], tanA = [];
    // Separate the conductors in the PICTURE PLANE, not in the floor plane: on
    // a run that crosses the frame, a floor-plane offset points straight at the
    // lens and collapses to nothing, which is why the return leg was unreadable.
    const view = new THREE.Vector3(...this.shot.target)
      .sub(new THREE.Vector3(...this.shot.position)).normalize();
    const nrm = new THREE.Vector3(), lift = new THREE.Vector3();
    const sepAt = [];
    for (let i = 0; i < MP; i++) {
      const u = i / (MP - 1);
      // Pinch the pair shut at both ends so the loop closes ON the gland and ON
      // the conditioner's inlet instead of floating clear of both.
      const w = Math.min(1, Math.min(u, 1 - u) / 0.12);
      const taper = w * w * (3 - 2 * w);
      const p = mCurve.getPointAt(u), tg = mCurve.getTangentAt(u);
      nrm.copy(tg).cross(view);
      if (nrm.lengthSq() < 1e-9) nrm.set(0, 1, 0);
      nrm.normalize().multiplyScalar((SEP / 2) * taper);
      lift.set(0, 0.011 + (SEP / 2) * taper, 0);
      live.push(p.clone().add(nrm).add(lift));
      neut.push(p.clone().sub(nrm).add(lift));
      tanA.push(tg.clone().normalize());
      sepAt.push(nrm.clone());
    }
    const loopPts = [];
    for (let i = 0; i < MP; i++) loopPts.push(live[i]);
    for (let i = MP - 1; i >= 0; i--) loopPts.push(neut[i]);
    loopPts.push(live[0].clone());
    const LN = loopPts.length;
    const loop = new DIAG.Trace(LN, PAL.am, 2.2, { opacity: 0.88, renderOrder: 13 });
    loop.write((i) => [loopPts[i].x, loopPts[i].y, loopPts[i].z]);
    loop.material.vertexColors = true;
    loop.material.needsUpdate = true;
    loop.geometry.setColors(new Float32Array(LN * 3).fill(1));
    this.loopCol = loop.geometry.attributes.instanceColorStart.data;
    this.loopN = LN;
    overlay.add(loop);

    // arrows = conventional current, circulating one way round the loop
    const NA = 12;
    this.arrowP = []; this.arrowD = [];
    for (let i = 0; i < NA; i++) {
      const u = 0.10 + (0.80 * (i + 0.5)) / NA;
      const onLive = u < 0.5;
      const half = onLive ? u * 2 : (1 - u) * 2;
      const idx = Math.min(MP - 1, Math.round(half * (MP - 1)));
      // sit just outboard of the conductor so the fat line does not swallow it
      const off = sepAt[idx].clone().normalize().multiplyScalar(onLive ? 0.016 : -0.016);
      this.arrowP.push((onLive ? live : neut)[idx].clone().add(off));
      this.arrowD.push(tanA[idx].clone().multiplyScalar(onLive ? 1 : -1));
    }
    this.arrows = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.0115, 0.034, 10),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, depthWrite: false }),
      NA,
    );
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 15;
    this.arrowBase = new THREE.Color(PAL.am);
    overlay.add(this.arrows);

    // carriers: they do not travel, they jostle about a fixed point
    const NE = 20;
    this.elecP = []; this.elecD = [];
    for (let i = 0; i < NE; i++) {
      const u = (i + 0.5) / NE;
      const onLive = u < 0.5;
      const half = onLive ? u * 2 : (1 - u) * 2;
      const idx = Math.min(MP - 1, Math.round(half * (MP - 1)));
      this.elecP.push((onLive ? live : neut)[idx].clone());
      this.elecD.push(tanA[idx].clone().multiplyScalar(onLive ? -1 : 1));   // against I
    }
    this.elec = new DIAG.Swarm(NE, { color: 0xffd9a0, size: 0.0042, additive: false });
    overlay.add(this.elec);

    this.drawAmp = 0.030;                       // metres drawn for X_DRIFT actual
    this.drawMag = this.drawAmp / X_DRIFT;      // ≈ 4.4 × 10⁴, in SPACE only
    this.tCu = this.chainLen / V_FIELD;         // ≈ 35 ns
    this.fieldSlow = PULSE_REAL / this.tCu;     // ≈ 8.7 × 10⁷ against real time

    /* --- the one plot: a level diagram, cartridge to posts -------------- */
    const GW = 1.58, GH = 0.46;
    const card = DIAG.diagramCard(GW + 0.26, GH + 0.22, { opacity: 0.95 });
    const plot = new THREE.Group();
    plot.add(card);
    card.position.set(-0.20, -0.15, 0);

    const g = new DIAG.Graph({
      w: GW, h: GH, xRange: [0, 6], yRange: [-80, 16],
      xTicks: [0, 1, 2, 3, 4, 5, 6], yTicks: [-80, -60, -40, -20, 0],
      zeroLine: 0,
    });
    plot.add(g);

    // 1.000 W into 8 Ω, as a line the trace has to land on
    const ref = new DIAG.Trace(2, PAL.am, 1.3, {
      opacity: 0.80, dashed: true, dashSize: 0.020, gapSize: 0.016, renderOrder: 10,
    });
    const YR = g.y(L_REF);
    ref.write((i) => [i === 0 ? 0 : GW, YR, 0.0006]);
    g.add(ref);

    const step = [];
    for (let i = 0; i < 6; i++) { step.push([i, LEVELS[i]]); step.push([i + 1, LEVELS[i]]); }
    const lt = new DIAG.Trace(step.length, PAL.cy, 2.6, { opacity: 1, renderOrder: 12 });
    lt.write((i) => [g.x(step[i][0]), g.y(step[i][1]), 0.0010]);
    g.add(lt);

    const dot = g.addDot(PAL.cy, 0.0075);
    dot.userData.setData(6, LEVELS[5]);

    // aligned on the card's plate, not on the plot box
    const front = glassFront(GW + 0.30, GH + 0.26, 0.013);
    front.position.set((GW + 0.26) / 2 - 0.20, (GH + 0.22) / 2 - 0.15, 0.007);
    plot.add(front);

    plot.position.set(-0.30, 1.330, -3.360);
    plot.rotation.y = Math.atan2(this.shot.position[0] - plot.position.x,
      this.shot.position[2] - plot.position.z);
    plot.position.x -= (GW / 2) * Math.cos(plot.rotation.y);
    plot.position.z += (GW / 2) * Math.sin(plot.rotation.y);
    overlay.add(plot);
    this.graph = g;

    /* ------------------------------------------------------------ labels */
    const L = ctx.labels;

    const title = new THREE.Object3D();
    title.position.set(0, GH + 0.11, 0.002);
    g.add(title);
    L.add(title, {
      kicker: 'LEVEL DIAGRAM · dBV', cls: 'acc', priority: 5, occlude: false, offset: [104, -36],
      text: 'cartridge to the binding posts<br>',
      value: `+${G_TOTAL.toFixed(1)} dB in five steps, one channel`,
    });

    g.tickLabels(L, {
      yVals: [-80, -40, 0], yFmt: (v) => v.toFixed(0),
      xVals: [0.5, 5.5], xFmt: (v) => (v < 3 ? 'CART' : 'POSTS'),
      yOffset: [-22, 0], xOffset: [0, 15],
    });

    L.add(V3(ARM_OUT), {
      kicker: 'FIELD FRONT · 0.66 c', cls: 'acc lead', priority: 3,
      occlude: false, offset: [40, -152],
      text: `${this.chainLen.toFixed(2)} m of copper in ${(this.tCu * 1e9).toFixed(0)} ns<br>`,
      value: `slowed 1 : ${expo(this.fieldSlow)}`,
    });

    L.add(V3([1.240, 0.060, -2.096]), {
      kicker: 'MAINS · ONE CLOSED LOOP', cls: 'am lead', priority: 4, offset: [-30, 128],
      text: `live out · neutral back<br>swing ±${(X_DRIFT * 1e6).toFixed(2)} µm at ${(V_DRIFT * 1e3).toFixed(2)} mm/s`,
      value: `magnified × ${expo(this.drawMag)} in space`,
    });

    L.add(V3([-0.970, 0.005, -0.630]), {
      kicker: 'THEN AIR', cls: 'acc', priority: 2, offset: [86, 26],
      text: `${D_SEAT.toFixed(2)} m to the seat · ${(T_AIR * 1e3).toFixed(1)} ms<br>`,
      value: `${SPL_1M.toFixed(1)} dB at 1 m → ${SPL_SEAT.toFixed(1)} at the seat`,
    });

    this.iNow = 0;
    this.uNow = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._sc = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    return { hardware, overlay };
  },

  update(dt, t) {
    const ph = DSP.TAU * MAINS_F * t;
    const s = Math.sin(ph);
    this.iNow = I_MAINS_PK * s;
    this.phNow = ph;

    /* --- cyan: one field front walking the electrical chain ------------- */
    const lap = PULSE_REAL * TIME_SCALE;            // simulated seconds
    const u = ((t / (lap * 1.34)) % 1) * 1.34;
    this.uNow = Math.min(1, u);
    const col = this.chainCol.array, N = this.chainN, W = 0.034;
    for (let i = 0; i < N - 1; i++) {
      for (let e = 0; e < 2; e++) {
        const x = (i + e) / (N - 1);
        const d = x - u;
        const head = Math.exp(-(d * d) / (2 * W * W));
        const tail = d < 0 && d > -0.20 ? 0.26 * Math.exp(d * 11) : 0;
        const gg = 0.60 + 0.72 * head + tail;
        const o = i * 6 + e * 3;
        col[o] = gg; col[o + 1] = gg; col[o + 2] = gg;
      }
    }
    this.chainCol.needsUpdate = true;

    const nu = this.nodeU, nodes = this.nodes;
    this.nodeSwarm.update((i) => {
      const d = u - nu[i];
      const k = Math.exp(-(d * d) / 0.0030);
      const p = nodes[i];
      return { p: [p.x, p.y, p.z], s: 0.85 + 1.15 * k };
    });

    /* --- amber: magnitude breathes at 50 Hz, direction reverses --------- */
    const mag = Math.abs(s);
    const lcol = this.loopCol.array, LN = this.loopN;
    const gv = 0.44 + 1.05 * mag;
    for (let i = 0; i < (LN - 1) * 6; i++) lcol[i] = gv;
    this.loopCol.needsUpdate = true;

    const m = this._m4, q = this._q, sc = this._sc, dir = this._dir, UP = this._up;
    const sgn = s >= 0 ? 1 : -1;
    const k = 0.58 + 0.58 * mag;
    sc.set(k, k, k);
    this.arrows.material.color.copy(this.arrowBase).multiplyScalar(0.72 + 1.05 * mag);
    for (let i = 0; i < this.arrowP.length; i++) {
      dir.copy(this.arrowD[i]).multiplyScalar(sgn);
      q.setFromUnitVectors(UP, dir);
      m.compose(this.arrowP[i], q, sc);
      this.arrows.setMatrixAt(i, m);
    }
    this.arrows.instanceMatrix.needsUpdate = true;

    // displacement is the integral of current, so it lags by 90°:
    // x(t) = −x̂·cos ωt, drawn at the SPATIAL magnification on the label.
    // The clock is the mains' own — the carriers are not slowed beyond 1 : 50.
    const disp = -this.drawAmp * Math.cos(ph);
    const eP = this.elecP, eD = this.elecD;
    this.elec.update((i) => {
      const p = eP[i], d = eD[i];
      return { p: [p.x + d.x * disp, p.y + d.y * disp, p.z + d.z * disp], s: 1 };
    });
  },

  content() {
    const pad = (v, n) => String(v).padStart(n, ' ');
    return `
<h3>One quantity, six forms</h3>
<p>Thirteen chassis stand here; twelve touch the signal, the conditioner only
energy. A note is mechanical in the groove, electrical from the cartridge coil
through six boxes, mechanical again at the voice coil, acoustic for the last
<span class="num">${D_SEAT.toFixed(2)}</span> m.</p>

<div class="key"><span class="lab">The idea</span><p>Current is a closed loop: the
amber path leaves on live and returns on neutral, and nothing in it travels. Its
carriers oscillate ±<span class="num">${(X_DRIFT * 1e6).toFixed(2)}</span> µm
about a fixed point at <span class="num">${(V_DRIFT * 1e3).toFixed(3)}</span> mm/s
peak while the field driving them runs at
<span class="num">${expo(V_FIELD, 2)}</span> m/s.</p></div>

<div class="eq">  ${(V_CART * 1e3).toFixed(3)} mV  <span class="c">cartridge, 5 cm/s at 1 kHz</span>
+ ${pad(G_PHONO.toFixed(1), 4)} dB  <span class="c">phono stage,  × ${DSP.undB(G_PHONO).toFixed(0)}</span>
− ${pad((-(G_LINE + G_LADDER)).toFixed(1), 4)} dB  <span class="c">pre-amp: +10 line, −20 ladder</span>
+ ${pad(G_XOVER.toFixed(1), 4)} dB  <span class="c">crossover, in band</span>
+ ${pad(G_AMP.toFixed(1), 4)} dB  <span class="c">monoblock,    × ${DSP.undB(G_AMP).toFixed(2)}</span>
<span class="hl">= +${G_TOTAL.toFixed(1)} dB</span> → ${V_TERM.toFixed(3)} V = ${P_TERM.toFixed(3)} W into ${R_SPK} Ω</div>
<p>Whole-decibel steps: the ladder overshoots one watt by
<span class="num">${LADDER_ERR.toFixed(2)}</span> dB. Only the pre-amplifier
turns the signal <em>down</em>. At the seat that is
<span class="num">${SPL_SEAT.toFixed(1)}</span> dB, free field — and the air
takes <span class="num">${expo(T_AIR / (this.tCu || 3.1e-8))}</span> times as
long as the field needs to cross the copper.</p>`;
  },

  readouts() {
    const i = this.iNow || 0;
    const ph = this.phNow || 0;
    const x = -X_DRIFT * Math.cos(ph);
    return [
      { k: 'CHAIN GAIN', v: `+${G_TOTAL.toFixed(1)}`, u: 'dB', cls: 'acc' },
      { k: 'AT THE POSTS', v: V_TERM.toFixed(3), u: 'V rms', cls: 'acc' },
      { k: 'MAINS · FULL OUT', v: i.toFixed(2), u: 'A', cls: 'am', bar: Math.abs(i) / I_MAINS_PK },
      { k: 'CARRIER DRIFT', v: (DSP.driftVelocity(Math.abs(i), CU_MM2) * 1e3).toFixed(3), u: 'mm/s', cls: 'am' },
      { k: 'CARRIER OFFSET', v: (x * 1e6).toFixed(3), u: 'µm', cls: 'am', bar: Math.abs(x) / X_DRIFT },
      {
        k: 'FIELD FRONT', v: ((this.uNow || 0) * (this.chainLen || 0)).toFixed(2),
        u: `m of ${(this.chainLen || 0).toFixed(2)}`, cls: '', bar: this.uNow || 0,
      },
    ];
  },
};
