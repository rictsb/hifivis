import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { anodisedNormal, anodisedRough } from '../core/tex.js';

/* ===========================================================================
 * OVERVIEW — "The System"
 *
 * No component of its own: the listening seat, the mains floor box and every
 * interconnect in the room. Three gestures in the overlay and nothing else —
 * mains in (a closed amber loop), signal through (one cyan run), acoustic out
 * (two dashed legs of air).
 *
 * Every number below is derived here, in code, from LAYOUT geometry or from
 * src/core/dsp.js. Nothing is a constant chosen to look tidy.
 * ======================================================================== */

/* ---------------------------------------------------------------- numbers */

/** Moving-coil cartridge, 0.30 mV rms at 5 cm/s, 1 kHz — the chain's input. */
const V_CART = 0.30e-3;

/**
 * The gain budget, built FORWARDS. Nothing here is back-solved: the pre-amp
 * stage in this piece is a fixed +10.0 dB line stage followed by a relay ladder
 * that can only be set in whole decibels, so the ladder value must be an
 * integer and the total falls out of it.
 */
const G_PHONO = 60.0;    // RIAA stage at 1 kHz
const G_LINE = 10.0;     // pre-amp line stage, fixed
const G_LADDER = -16.0;  // relay ladder setting, integer dB
const G_XOVER = 0.0;     // active crossover, in band
const G_AMP = 26.0;      // monoblock voltage gain
const G_PRE = G_LINE + G_LADDER;                                  // −6.0 dB
const G_TOTAL = G_PHONO + G_PRE + G_XOVER + G_AMP;                // +80.0 dB

const R_SPK = 8;
const V_TERM = V_CART * DSP.undB(G_TOTAL);        // 3.0000 V rms — ratio 10⁴ : 1
const P_TERM = DSP.powerW(V_TERM, R_SPK);         // 1.1250 W

/** Loudspeaker sensitivity, dB SPL at 2.83 V (= 1 W into 8 Ω) at 1 m. */
const SENS = 89;
const V_SENS = Math.sqrt(1 * R_SPK);              // 2.8284 V, the reference only
const SPL_1M = DSP.splAt(SENS, P_TERM, 1);        // 89.51 dB

/** Monoblock rating. */
const P_AMP = 600, R_AMP = 4;
const V_AMP = DSP.vrmsFor(P_AMP, R_AMP);          // 48.99 V rms

/**
 * Mains loop operating point — stated, not assumed silently: both monoblocks
 * at continuous full output, class AB at 55 %, plus 100 W of front end, drawn
 * sinusoidally at unity power factor.
 */
const MAINS_V = 230, MAINS_F = 50;
const ETA_AB = 0.55, P_FRONT = 100;
const P_MAINS = (2 * P_AMP) / ETA_AB + P_FRONT;   // 2281.8 W
const I_MAINS = P_MAINS / MAINS_V;                // 9.92 A rms
const I_MAINS_PK = I_MAINS * Math.SQRT2;          // 14.03 A
const CU_MM2 = 2.5;                               // conductor c.s.a. of the flex
const V_DRIFT = DSP.driftVelocity(I_MAINS, CU_MM2) * Math.SQRT2;  // peak, m/s
const X_DRIFT = DSP.driftDisplacement(V_DRIFT, MAINS_F);          // peak, m
const V_FIELD = DSP.signalSpeed(0.66);            // 1.979e8 m/s
const LAMBDA_MAINS = V_FIELD / MAINS_F;           // 3.96e6 m

/** Geometry-derived acoustics: straight from LAYOUT. */
const D_SEAT = Math.hypot(
  LAYOUT.speakerL.x - LAYOUT.listener.x,
  LAYOUT.speakerL.z - LAYOUT.listener.z,
);                                                // 4.830 m
const T_AIR = D_SEAT / DSP.C_SOUND_20C;           // 14.07 ms
const SPL_SEAT = DSP.splAt(SENS, P_TERM, D_SEAT); // 75.83 dB, free field

const TIME_SCALE = 0.02;                          // 50 Hz → ~1 s per cycle
const PULSE_SECONDS = 3.0;                        // real seconds per traverse

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
  new THREE.CatmullRomCurve3(pts.map(V3), false, 'catmullrom', 0.30);

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

/* =============================================================== hardware */

/**
 * The listening seat: a low, deeply reclined lounge chair on a satin steel
 * sled. Back top 664 mm, so a seated ear lands at LAYOUT.listener.y = 1.06 m.
 *
 * It sits between the lens and the system, so it is built to be read as a dark
 * mass with a rim, not as a cage: few bright members, large upholstered
 * volumes, and leather that is genuinely dark rather than a mid grey with a
 * gloss coat.
 */
function loungeChair() {
  const g = new THREE.Group();
  const M = mats();

  const grain = anodisedNormal(512, 0.62).clone();
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(14, 14);
  grain.needsUpdate = true;

  const leather = M.rubber.clone();
  leather.color.setHex(0x0a0908);
  leather.roughness = 0.82;
  leather.normalMap = grain;
  leather.normalScale = new THREE.Vector2(0.70, 0.70);
  leather.sheen = 0.30;
  leather.sheenRoughness = 0.85;
  leather.sheenColor = new THREE.Color(0x2a1e14);
  leather.clearcoat = 0.0;
  leather.envMapIntensity = 0.22;

  const welt = leather.clone();
  welt.color.setHex(0x191310);
  welt.roughness = 0.62;
  welt.sheen = 0.5;

  const HALF_W = 0.375, RUN_D = 0.80;
  const RAIL_Y = 0.238, SEAT_Y = RAIL_Y + 0.062;      // cushion centre
  const HINGE_Y = 0.330, HINGE_Z = 0.320, RAKE = 0.58;
  const cr = Math.cos(RAKE), sr = Math.sin(RAKE);
  const backAt = (d) => [0, HINGE_Y + d * cr, HINGE_Z + d * sr];

  // Satin — not mirror — stainless. A polished bar this long under the key
  // light becomes a blown white streak and the chair reads as a wire frame.
  const frame = M.steel.clone();
  frame.roughness = 0.30;
  frame.envMapIntensity = 0.55;
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

    // one raked back stile per side, and nothing else above the rail
    const bp = new THREE.Mesh(GEO.bevelBox(0.028, 0.400, 0.017, 0.004, 3), frame);
    bp.rotation.x = -RAKE;
    const [, my, mz] = backAt(0.200);
    bp.position.set(s * (HALF_W - 0.004), my, mz);
    g.add(bp);
  }

  const cross = new THREE.Mesh(GEO.bevelBox(HALF_W * 2 - 0.036, 0.016, 0.030, 0.004, 3), frame);
  cross.position.set(0, RAIL_Y, -0.320);
  g.add(cross);

  // Channelled upholstery: three seat channels, six back cushions. The deep
  // gaps between them are what make a soft object read as something made.
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

  // low upholstered arms — mass, not tube
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(GEO.bevelBox(0.104, 0.086, 0.520, 0.030, 5), leather);
    arm.position.set(s * (HALF_W - 0.006), RAIL_Y + 0.104, -0.030);
    g.add(arm);
  }

  // welted seams — a soft object needs a hard line round it to read as made
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

/** Flush mains floor box — the one place energy enters the room. */
function floorBox() {
  const g = new THREE.Group();
  const M = mats();

  const plate = new THREE.Mesh(GEO.bevelBox(0.196, 0.013, 0.140, 0.0035, 3), M.alu);
  plate.position.y = 0.0065;
  g.add(plate);

  const well = new THREE.Mesh(GEO.bevelBox(0.158, 0.009, 0.104, 0.002, 3), M.anodBlack);
  well.position.y = 0.0125;
  g.add(well);

  for (const x of [-0.038, 0.038]) {
    const face = new THREE.Mesh(GEO.bevelCyl(0.0235, 0.0245, 0.007, 32, 0.0008), M.plastic);
    face.position.set(x, 0.0155, 0.006);
    g.add(face);
    for (const [px, pz] of [[-0.0095, 0.006], [0.0095, 0.006], [0, -0.011]]) {
      const pin = new THREE.Mesh(GEO.bevelBox(0.0028, 0.0032, 0.0075, 0.0004, 2), M.anodBlack);
      pin.position.set(x + px, 0.0182, pz);
      g.add(pin);
    }
  }

  const grommet = new THREE.Mesh(GEO.bevelCyl(0.0100, 0.0135, 0.022, 24, 0.0012), M.rubber);
  grommet.rotation.set(0, 0.55, Math.PI / 2);
  grommet.position.set(0.090, 0.021, -0.044);
  g.add(grommet);

  for (const [x, z] of [[-0.086, 0.052], [0.086, 0.052], [-0.086, -0.052], [0.086, -0.052]]) {
    const sc = GEO.screw(0.0019);
    sc.rotation.x = 0;
    sc.position.set(x, 0.0132, z);
    g.add(sc);
  }

  GEO.shadowed(g);
  return g;
}

/* ================================================================ routing */

const RK = LAYOUT.rack;
const RACK_FRONT = RK.z + RK.d / 2;          // −3.05
const RACK_BACK = RK.z - RK.d / 2;           // −3.55
/** The signal spine runs down the rack's left flank, just clear of the posts. */
const SPINE_X = -0.318;
const SPINE_Z = -3.020;
const bayY = (i) => RK.shelfY[i] + 0.052;

const FB = [-0.660, 0, -3.020];              // mains floor box
const MONO_L = LAYOUT.monoL, MONO_R = LAYOUT.monoR;
const SPK_L = LAYOUT.speakerL, SPK_R = LAYOUT.speakerR;

/**
 * Real cable routes — physically plausible, with catenary slack. The cove
 * sweep starts at z = −3.65, behind everything here, so the visible ground
 * under all of this is the flat y = 0 plane.
 */
function cableRoutes() {
  const out = [];

  // mains: floor box → behind the rack, into the conditioner's rear inlet
  out.push({
    r: 0.0062,
    p: [
      [FB[0] + 0.080, 0.026, FB[2] - 0.040],
      [FB[0] + 0.010, 0.020, -3.090],
      [-0.480, 0.018, -3.140],
      [-0.380, 0.018, -3.190],
      [-0.300, 0.240, -3.260],
      [-0.250, 0.180, -3.360],
      [-0.238, 0.170, RACK_BACK + 0.006],
    ],
  });

  for (const m of [MONO_L, MONO_R]) {
    const s = Math.sign(m.x);
    // conditioner → monoblock mains inlet
    out.push({
      r: 0.0058,
      p: [
        [-0.210 * s, 0.168, RACK_BACK + 0.006],
        [s * 0.16, 0.190, -3.440],
        [s * 0.34, 0.020, -3.330],
        [m.x - s * 0.24, 0.020, -3.230],
        [m.x - s * 0.10, 0.024, -3.150],
        [m.x - s * 0.04, 0.048, -3.098],
        [m.x - s * 0.03, 0.252, -3.062],
      ],
    });
    // crossover → monoblock, balanced interconnect
    out.push({
      r: 0.0034,
      p: [
        [-0.150 * s, bayY(5), RACK_BACK + 0.004],
        [-0.05 * s, 0.62, RACK_BACK - 0.032],
        [s * 0.20, 0.30, -3.470],
        [s * 0.40, 0.020, -3.372],
        [m.x - s * 0.22, 0.020, -3.276],
        [m.x - s * 0.09, 0.022, -3.192],
        [m.x - s * 0.02, 0.044, -3.136],
        [m.x - s * 0.01, 0.226, -3.098],
      ],
    });
  }

  // loudspeaker cable, drawn as the PAIR it is: current out and current back
  for (const [m, sp] of [[MONO_L, SPK_L], [MONO_R, SPK_R]]) {
    const s = Math.sign(m.x);
    const term = [sp.x + s * 0.030, 0.172, sp.z - 0.208];
    for (const off of [-0.0080, 0.0080]) {
      out.push({
        r: 0.0052,
        p: [
          [m.x - s * 0.070 + off, 0.246, -3.040],
          [m.x - s * 0.150 + off, 0.030, -2.990],
          ...catenary([m.x - s * 0.250 + off, 0.020, -2.930], [sp.x + s * 0.330 + off, 0.016, -2.790], 0.018, 6),
          [sp.x + s * 0.180 + off, 0.020, -2.730],
          [term[0] + s * 0.060 + off, 0.106, term[2] - 0.030],
          [term[0] + off, term[1], term[2]],
        ],
      });
    }
  }

  // tonearm leads, turntable → phono stage (RCA pair)
  const TT = LAYOUT.ttPlinth;
  const c = Math.cos(TT.ry), sn = Math.sin(TT.ry);
  const tx = TT.x + (0.27 * c - 0.27 * sn);
  const tz = TT.z + (-0.27 * sn - 0.27 * c);
  for (const off of [-0.006, 0.006]) {
    out.push({
      r: 0.0031,
      p: [
        [tx + off, TT.top - 0.045, tz],
        [tx + 0.035 + off, TT.top - 0.235, tz - 0.070],
        ...catenary([tx + 0.070 + off, 0.245, tz - 0.145], [tx + 0.330 + off, 0.014, tz - 0.360], 0.050, 6),
        [-1.700 + off, 0.014, -2.930],
        [-1.280 + off, 0.016, -3.010],
        [-0.900 + off, 0.018, -3.090],
        [-0.560 + off, 0.020, -3.170],
        [-0.360 + off, 0.400, -3.280],
        [-0.280 + off, 0.520, -3.440],
        [-0.245 + off, bayY(3) - 0.064, RACK_BACK + 0.002],
      ],
    });
  }
  return out;
}

/* ================================================================ overlay */

const TT = LAYOUT.ttPlinth;
/** Where the cyan run touches each component: cartridge, three bays, amp, posts, tweeter. */
const NODES = [
  [TT.x + 0.300, TT.top + 0.010, TT.z - 0.230],   // cartridge
  [SPINE_X, bayY(3), SPINE_Z],                    // phono
  [SPINE_X, bayY(4), SPINE_Z],                    // line stage + ladder
  [SPINE_X, bayY(5), SPINE_Z],                    // crossover
  [MONO_L.x - 0.020, 0.262, -3.010],              // monoblock
  [SPK_L.x - 0.030, 0.206, -2.652],               // binding posts
  [SPK_L.x + 0.226, 1.018, -2.406],               // tweeter
];

/**
 * One cyan run, source to tweeter — a single gesture, no serpentine. Cartridge
 * down the plinth, along the floor, straight up the rack's left flank through
 * the three bays that touch it, down again, out to the monoblock, along the
 * speaker cable and up the baffle.
 */
function chainPoints() {
  return [
    NODES[0],
    [TT.x + 0.420, 0.360, TT.z - 0.360],
    [TT.x + 0.560, 0.075, TT.z - 0.470],
    [-1.480, 0.052, -2.900],
    [-0.900, 0.050, -2.980],
    [-0.520, 0.055, -3.010],
    [SPINE_X - 0.010, 0.170, SPINE_Z],
    [SPINE_X, bayY(2), SPINE_Z],
    NODES[1],
    NODES[2],
    NODES[3],
    [SPINE_X, bayY(5) + 0.086, SPINE_Z],
    [-0.404, bayY(5) + 0.030, SPINE_Z + 0.012],
    [-0.428, 0.690, SPINE_Z + 0.016],
    [-0.436, 0.300, SPINE_Z + 0.016],
    [-0.470, 0.062, -2.960],
    [-0.700, 0.050, -2.980],
    [MONO_L.x + 0.090, 0.054, -3.000],
    NODES[4],
    [MONO_L.x - 0.140, 0.060, -2.950],
    [MONO_L.x - 0.320, 0.048, -2.880],
    [SPK_L.x + 0.240, 0.044, -2.808],
    [SPK_L.x + 0.080, 0.058, -2.738],
    NODES[5],
    [SPK_L.x + 0.044, 0.364, -2.556],
    [SPK_L.x + 0.186, 0.622, -2.468],
    [SPK_L.x + 0.222, 0.846, -2.428],
    NODES[6],
  ];
}

/** The mirrored right channel, drawn dim — the system is stereo, not mono. */
function branchPoints() {
  return [
    [SPINE_X, bayY(5), SPINE_Z],
    [-0.120, bayY(5) + 0.052, SPINE_Z - 0.006],
    [0.240, bayY(5) + 0.040, SPINE_Z - 0.006],
    [0.404, 0.780, SPINE_Z + 0.012],
    [0.420, 0.330, SPINE_Z + 0.016],
    [0.470, 0.062, -2.960],
    [0.700, 0.050, -2.980],
    [MONO_R.x - 0.090, 0.054, -3.000],
    [MONO_R.x + 0.020, 0.262, -3.010],
    [MONO_R.x + 0.140, 0.060, -2.950],
    [MONO_R.x + 0.320, 0.048, -2.880],
    [SPK_R.x - 0.240, 0.044, -2.808],
    [SPK_R.x - 0.080, 0.058, -2.738],
    [SPK_R.x + 0.030, 0.206, -2.652],
    [SPK_R.x - 0.044, 0.364, -2.556],
    [SPK_R.x - 0.186, 0.622, -2.468],
    [SPK_R.x - 0.222, 0.846, -2.428],
    [SPK_R.x - 0.226, 1.018, -2.406],
  ];
}

/**
 * The mains loop, as one clean out-and-back run: floor box → conditioner →
 * monoblock. Both conductors stay in open air the whole way, because seeing
 * the return leg is the entire point of the figure.
 */
function mainsRoute() {
  return [
    [FB[0] - 0.040, 0.056, FB[2] + 0.190],
    [-0.400, 0.052, -2.790],
    [-0.120, 0.062, -2.790],
    [0.060, 0.140, -2.856],
    [0.150, 0.212, -2.930],        // conditioner tap
    [0.300, 0.128, -2.858],
    [0.520, 0.056, -2.796],
    [0.760, 0.052, -2.800],
    [0.900, 0.110, -2.856],
    [0.950, 0.244, -2.936],        // monoblock tap
  ];
}

export default {
  id: 'overview',
  title: 'The System',
  nav: 'Overview',
  kicker: 'Overview',
  standfirst: 'Twelve boxes carrying one quantity, and one closed loop feeding all of them.',
  shot: { position: [1.78, 1.30, 4.15], target: [-0.10, 0.64, -2.55], fov: 38 },
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    const M = mats();

    /* ---------------------------------------------------------- hardware */
    const hardware = new THREE.Group();
    hardware.name = 'overview-hardware';

    // Corner-anchored, angled to the room rather than square to the lens, so
    // it reads as a crop into the near foreground and not as an obstruction.
    const chair = loungeChair();
    chair.position.set(LAYOUT.listener.x - 0.55, 0, LAYOUT.listener.z - 0.185);
    chair.rotation.y = 0.13;
    hardware.add(chair);

    const fbox = floorBox();
    fbox.position.set(FB[0], 0, FB[2]);
    hardware.add(fbox);

    const jacket = M.plastic.clone();
    jacket.color.setHex(0x0d0f12);
    jacket.roughness = 0.62;
    for (const c of cableRoutes()) {
      const t = DIAG.tube(c.p, c.r, jacket, Math.max(48, c.p.length * 4));
      t.castShadow = true;
      t.receiveShadow = true;
      hardware.add(t);
    }

    /* ----------------------------------------------------------- overlay */
    const overlay = new THREE.Group();
    overlay.name = 'overview-overlay';

    /* --- gesture 1: signal through ------------------------------------- */
    const cCurve = curveThrough(chainPoints());
    this.chainLen = cCurve.getLength();
    const N = 260;
    const chain = new DIAG.Trace(N, PAL.cy, 2.9, { opacity: 0.95, renderOrder: 13 });
    chain.write((i, u) => { const v = cCurve.getPointAt(u); return [v.x, v.y, v.z]; });
    chain.material.vertexColors = true;
    chain.material.needsUpdate = true;
    chain.geometry.setColors(new Float32Array(N * 3).fill(1));
    this.chainCol = chain.geometry.attributes.instanceColorStart.data;
    this.chainN = N;
    overlay.add(chain);

    const bCurve = curveThrough(branchPoints());
    const branch = new DIAG.Trace(150, PAL.cy, 1.7, { opacity: 0.22, renderOrder: 12 });
    branch.write((i, u) => { const v = bCurve.getPointAt(u); return [v.x, v.y, v.z]; });
    overlay.add(branch);

    /* --- gesture 2: acoustic out --------------------------------------- */
    const ear = V3([LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z]);
    for (const sp of [SPK_L, SPK_R]) {
      const a = new THREE.Vector3(
        sp.x + Math.sin(sp.ry) * 0.20, 1.02, sp.z + Math.cos(sp.ry) * 0.20,
      );
      const air = new DIAG.Trace(48, PAL.cy, 1.3, {
        opacity: 0.15, renderOrder: 11, dashed: true, dashSize: 0.034, gapSize: 0.080,
      });
      air.write((i, u) => {
        const p = a.clone().lerp(ear, u);
        return [p.x, p.y, p.z];
      });
      overlay.add(air);
    }

    // one glow wherever the run enters a component
    const nodes = NODES.map(V3);
    this.nodes = nodes;
    this.nodeU = nodes.map((n) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k <= 260; k++) {
        const d = cCurve.getPointAt(k / 260).distanceToSquared(n);
        if (d < bd) { bd = d; best = k / 260; }
      }
      return best;
    });
    this.nodeSwarm = new DIAG.Swarm(nodes.length, { color: PAL.cy, size: 0.0068 });
    overlay.add(this.nodeSwarm);

    /* --- gesture 3: mains in, as a closed loop -------------------------- */
    const mCurve = curveThrough(mainsRoute());
    const SEP = 0.088, MP = 96;
    const live = [], neut = [], tanA = [];
    const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
    for (let i = 0; i < MP; i++) {
      const u = i / (MP - 1);
      const p = mCurve.getPointAt(u), tg = mCurve.getTangentAt(u);
      nrm.copy(tg).cross(up);
      if (nrm.lengthSq() < 1e-9) nrm.set(1, 0, 0);
      nrm.normalize().multiplyScalar(SEP / 2);
      live.push(p.clone().add(nrm));
      neut.push(p.clone().sub(nrm));
      tanA.push(tg.clone().normalize());
    }
    const loopPts = [];
    for (let i = 0; i < MP; i++) loopPts.push(live[i]);
    for (let i = MP - 1; i >= 0; i--) loopPts.push(neut[i]);
    loopPts.push(live[0].clone());
    const LN = loopPts.length;
    const loop = new DIAG.Trace(LN, PAL.am, 2.4, { opacity: 0.90, renderOrder: 13 });
    loop.write((i) => [loopPts[i].x, loopPts[i].y, loopPts[i].z]);
    loop.material.vertexColors = true;
    loop.material.needsUpdate = true;
    loop.geometry.setColors(new Float32Array(LN * 3).fill(1));
    this.loopCol = loop.geometry.attributes.instanceColorStart.data;
    this.loopN = LN;
    overlay.add(loop);

    // arrows = conventional current, circulating one way round the loop
    const NA = 18;
    this.arrowP = []; this.arrowD = [];
    for (let i = 0; i < NA; i++) {
      const u = (i + 0.5) / NA;
      const onLive = u < 0.5;
      const half = onLive ? u * 2 : (1 - u) * 2;
      const idx = Math.min(MP - 1, Math.round(half * (MP - 1)));
      this.arrowP.push((onLive ? live : neut)[idx].clone());
      this.arrowD.push(tanA[idx].clone().multiplyScalar(onLive ? 1 : -1));
    }
    this.arrows = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.0098, 0.028, 10),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, depthWrite: false }),
      NA,
    );
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 15;
    this.arrowBase = new THREE.Color(PAL.am);
    overlay.add(this.arrows);

    // carriers: they do not travel, they jostle
    const NE = 24;
    this.elecP = []; this.elecD = [];
    for (let i = 0; i < NE; i++) {
      const u = (i + 0.5) / NE;
      const onLive = u < 0.5;
      const half = onLive ? u * 2 : (1 - u) * 2;
      const idx = Math.min(MP - 1, Math.round(half * (MP - 1)));
      this.elecP.push((onLive ? live : neut)[idx].clone());
      // electrons drift against the conventional current
      this.elecD.push(tanA[idx].clone().multiplyScalar(onLive ? -1 : 1));
    }
    this.elec = new DIAG.Swarm(NE, { color: 0xffd9a0, size: 0.0044, additive: false });
    overlay.add(this.elec);
    this.drawAmp = 0.032;
    this.drawMag = this.drawAmp / X_DRIFT;
    this.pulseRatio = PULSE_SECONDS / (this.chainLen / V_FIELD);

    /* ------------------------------------------------------------ labels */
    const L = ctx.labels;

    L.add(V3([TT.x + 0.02, TT.top + 0.60, TT.z - 0.06]), {
      kicker: 'SOURCE · TURNTABLE', cls: 'acc', priority: 2, offset: [10, -6],
      text: `moving coil, ${(V_CART * 1e3).toFixed(2)} mV at 5 cm/s<br>`,
      value: 'the quietest signal in the room',
    });

    L.add(V3([0.02, RK.topY + 0.46, RK.z]), {
      kicker: 'SIX BOXES · ONE SIGNAL', cls: 'acc', priority: 3, offset: [0, -8],
      text: `phono, line stage, ladder, crossover<br>`,
      value: `+${G_TOTAL.toFixed(1)} dB → ${V_TERM.toFixed(2)} V at the posts`,
    });

    L.add(V3([MONO_L.x - 0.10, 0.235, -2.760]), {
      kicker: 'MONOBLOCK', cls: 'acc', priority: 1, offset: [-46, 54],
      text: `+${G_AMP.toFixed(0)} dB of voltage gain<br>`,
      value: `${P_AMP} W / ${R_AMP} Ω · ${V_AMP.toFixed(1)} V`,
    });

    this.seatLab = L.add(V3([LAYOUT.listener.x - 0.55, 0.90, LAYOUT.listener.z - 0.19]), {
      kicker: 'LISTENING SEAT', cls: 'acc', priority: 1, offset: [104, -4],
      text: `${D_SEAT.toFixed(2)} m from each loudspeaker<br>`,
      value: `${(T_AIR * 1e3).toFixed(1)} ms of air`,
    });

    L.add(V3([1.060, 0.230, -2.880]), {
      kicker: 'MAINS · CLOSED LOOP', cls: 'am', priority: 4, offset: [58, 40],
      text: `out on live, back on neutral · carriers<br>±${(X_DRIFT * 1e6).toFixed(2)} µm at ${(V_DRIFT * 1e3).toFixed(2)} mm/s peak`,
      value: `drawn × ${expo(this.drawMag)}`,
    });

    L.add(V3([-1.180, 0.075, -2.860]), {
      kicker: 'FIELD FRONT · 0.66 c', cls: 'acc', priority: 4, offset: [-34, 52],
      text: `${this.chainLen.toFixed(1)} m of copper in ${(this.chainLen / V_FIELD * 1e9).toFixed(0)} ns<br>`,
      value: `shown 1 : ${expo(this.pulseRatio)}`,
    });

    this.iNow = 0;
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

    /* --- cyan: one field front walking the electrical chain ------------- */
    const lap = PULSE_SECONDS * TIME_SCALE;
    const u = ((t / (lap * 1.34)) % 1) * 1.34;
    const col = this.chainCol.array, N = this.chainN, W = 0.036;
    for (let i = 0; i < N - 1; i++) {
      for (let e = 0; e < 2; e++) {
        const x = (i + e) / (N - 1);
        const d = x - u;
        const head = Math.exp(-(d * d) / (2 * W * W));
        const tail = d < 0 && d > -0.20 ? 0.26 * Math.exp(d * 11) : 0;
        const g = 0.86 + 1.55 * head + tail;
        const o = i * 6 + e * 3;
        col[o] = g; col[o + 1] = g; col[o + 2] = g;
      }
    }
    this.chainCol.needsUpdate = true;

    const nu = this.nodeU, nodes = this.nodes;
    this.nodeSwarm.update((i) => {
      const d = u - nu[i];
      const k = Math.exp(-(d * d) / 0.0030);
      const p = nodes[i];
      return { p: [p.x, p.y, p.z], s: 0.80 + 2.1 * k };
    });

    /* --- amber: magnitude breathes at 50 Hz, direction reverses --------- */
    const mag = Math.abs(s);
    const lcol = this.loopCol.array, LN = this.loopN;
    const g = 0.28 + 1.42 * mag;
    for (let i = 0; i < (LN - 1) * 6; i++) lcol[i] = g;
    this.loopCol.needsUpdate = true;

    const m = this._m4, q = this._q, sc = this._sc, dir = this._dir, UP = this._up;
    const sgn = s >= 0 ? 1 : -1;
    const k = 0.30 + 0.95 * mag;
    sc.set(k, k, k);
    // the arrowheads ride a little brighter than the conductor they sit on
    this.arrows.material.color.copy(this.arrowBase).multiplyScalar(0.80 + 1.20 * mag);
    for (let i = 0; i < this.arrowP.length; i++) {
      dir.copy(this.arrowD[i]).multiplyScalar(sgn);
      q.setFromUnitVectors(UP, dir);
      m.compose(this.arrowP[i], q, sc);
      this.arrows.setMatrixAt(i, m);
    }
    this.arrows.instanceMatrix.needsUpdate = true;

    // displacement is the integral of current, so it lags it by 90°:
    // x(t) = −x̂·cos ωt, drawn at the magnification printed on the label.
    const disp = -this.drawAmp * Math.cos(ph);
    const eP = this.elecP, eD = this.elecD;
    this.elec.update((i) => {
      const p = eP[i], d = eD[i];
      return { p: [p.x + d.x * disp, p.y + d.y * disp, p.z + d.z * disp], s: 1 };
    });
  },

  content() {
    const Lc = this.chainLen || 6.0;
    const tCu = Lc / V_FIELD;                       // s
    const ratio = T_AIR / tCu;                      // air : copper
    const pad = (v, n) => String(v).padStart(n, ' ');
    return `
<h3>One quantity, six forms</h3>
<p>Thirteen chassis stand here. Twelve touch the signal; the conditioner touches
only energy. Trace one note: it is mechanical in the groove, electrical in the
cartridge coil, electrical through six boxes, mechanical again at the voice
coil, and acoustic for the last <span class="num">${D_SEAT.toFixed(2)}</span> m.
Every box changes how the pressure history is represented without being allowed
to change its shape.</p>

<div class="key"><span class="lab">The idea</span><p>Current is a closed loop.
The amber path leaves on live and returns on neutral, and nothing in it travels:
its carriers oscillate ±<span class="num">${(X_DRIFT * 1e6).toFixed(2)}</span> µm
about a fixed point at <span class="num">${(V_DRIFT * 1e3).toFixed(2)}</span> mm/s
peak, while the field that pushes them runs at
<span class="num">${expo(V_FIELD, 2)}</span> m/s — a ratio of
<span class="num">${expo(V_FIELD / V_DRIFT)}</span>. No one animation holds both,
so the scene magnifies the first
<span class="num">${expo(this.drawMag || 2.44e4)}</span> times and slows the
second <span class="num">${expo(this.pulseRatio || 9.9e7)}</span> times, and
prints both ratios on itself.</p></div>

<h3>The gain</h3>
<div class="eq">  ${(V_CART * 1e3).toFixed(2)} mV  <span class="c">cartridge, 5 cm/s at 1 kHz</span>
+ ${pad(G_PHONO.toFixed(1), 4)} dB  <span class="c">phono stage    × ${DSP.undB(G_PHONO).toFixed(0)}</span>
+ ${pad(G_LINE.toFixed(1), 4)} dB  <span class="c">line stage     × ${DSP.undB(G_LINE).toFixed(3)}</span>
− ${pad(Math.abs(G_LADDER).toFixed(1), 4)} dB  <span class="c">volume ladder  × ${DSP.undB(G_LADDER).toFixed(4)}</span>
+ ${pad(G_XOVER.toFixed(1), 4)} dB  <span class="c">crossover      × ${DSP.undB(G_XOVER).toFixed(3)}</span>
+ ${pad(G_AMP.toFixed(1), 4)} dB  <span class="c">monoblock      × ${DSP.undB(G_AMP).toFixed(2)}</span>
─────────
<span class="hl">+ ${G_TOTAL.toFixed(1)} dB</span>  <span class="c">a voltage ratio of 10 000 : 1</span>
  ${V_TERM.toFixed(2)} V   <span class="c">= ${P_TERM.toFixed(3)} W into ${R_SPK} Ω</span></div>
<p>The ladder is a switched resistor network, so it sets whole decibels only;
<span class="num">−16</span> dB against the pre-amp's fixed
<span class="num">+10</span> dB is what makes the total land on
<span class="num">+80.0</span> dB. The only stage that turns the signal
<em>down</em> is the one called the pre-amplifier.</p>
<p><span class="num">${V_SENS.toFixed(2)}</span> V is the sensitivity reference,
not the operating point: <span class="num">${V_TERM.toFixed(2)}</span> V is
<span class="num">${SPL_1M.toFixed(1)}</span> dB at 1 m and
<span class="num">${SPL_SEAT.toFixed(1)}</span> dB at the seat, one loudspeaker,
free field.</p>

<h3>Two speeds</h3>
<p>The cyan run is <span class="num">${Lc.toFixed(1)}</span> m of conductor and
the field crosses it in <span class="num">${(tCu * 1e9).toFixed(0)} ns</span>. The
last <span class="num">${D_SEAT.toFixed(2)}</span> m is air and takes
<span class="num">${(T_AIR * 1e3).toFixed(1)} ms</span>,
<span class="num">${expo(ratio)}</span> times longer. Everything that matters
about arrival time happens after the last box.</p>`;
  },

  readouts() {
    const i = this.iNow || 0;
    return [
      { k: 'CHAIN GAIN', v: `+${G_TOTAL.toFixed(1)}`, u: 'dB', cls: 'acc' },
      { k: 'AT THE POSTS', v: V_TERM.toFixed(2), u: 'V rms', cls: 'acc' },
      { k: 'MAINS · FULL OUT', v: i.toFixed(2), u: 'A', cls: 'am', bar: Math.abs(i) / I_MAINS_PK },
      { k: 'CARRIER DRIFT', v: (DSP.driftVelocity(Math.abs(i), CU_MM2) * 1e3).toFixed(3), u: 'mm/s', cls: 'am' },
      { k: 'FIELD FRONT', v: expo(V_FIELD, 2), u: 'm/s', cls: '' },
      { k: 'AIR PATH', v: (T_AIR * 1e3).toFixed(1), u: 'ms', cls: '' },
    ];
  },
};
