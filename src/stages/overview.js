import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { groundY, COVE_R } from '../core/room.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { anodisedNormal, anodisedRough } from '../core/tex.js';

/* ===========================================================================
 * OVERVIEW — "The System"
 *
 * No component hardware of its own: the listening seat, the mains floor box
 * and every interconnect / loudspeaker cable in the room. Overlay: one cyan
 * signal path threading the whole chain, and one closed amber mains loop that
 * goes out on live and comes back on neutral.
 *
 * Every number below is derived here, in code, from LAYOUT geometry or from
 * src/core/dsp.js. Nothing is a constant chosen to look tidy.
 * ======================================================================== */

/* ---------------------------------------------------------------- numbers */

/** The reference the whole chain is scaled to: 2.83 V = 1.00 W into 8 Ω. */
const R_SPK = 8;
const V_TERM = Math.sqrt(1 * R_SPK);              // 2.8284 V rms
const P_TERM = DSP.powerW(V_TERM, R_SPK);         // 1.0000 W

/** Moving-coil cartridge, 0.30 mV rms at 5 cm/s, 1 kHz — the chain's input. */
const V_CART = 0.30e-3;

const G_TOTAL = DSP.dB(V_TERM / V_CART);           // +79.49 dB
const G_PHONO = 60.0;                              // RIAA stage, at 1 kHz
const G_XOVER = 0.0;                               // active crossover, in band
const G_AMP = 26.0;                                // monoblock voltage gain
const G_VOL = G_TOTAL - G_PHONO - G_XOVER - G_AMP; // −6.51 dB: the volume control

/** Monoblock rating. */
const P_AMP = 600, R_AMP = 4;
const V_AMP = DSP.vrmsFor(P_AMP, R_AMP);          // 48.99 V rms

/** Loudspeaker sensitivity, dB SPL at 2.83 V / 1 m. */
const SENS = 89;

/** Streamer payload: 2 channels × 24 bit × 192 kHz. */
const BITS = 24, FS_HI = 192000, CHANS = 2;
const BITRATE = BITS * FS_HI * CHANS;             // 9.216 Mbit/s
const SNR_24 = DSP.quantSnrDb(BITS);              // 146.25 dB

/** Mains loop operating point — stated, not assumed silently: both
 *  monoblocks at full output, class AB at ~55 %, plus 100 W of front end. */
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
const SPL_SEAT = DSP.splAt(SENS, P_TERM, D_SEAT); // 75.3 dB, free field

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
  new THREE.CatmullRomCurve3(pts.map(V3), false, 'catmullrom', 0.28);

/**
 * A true catenary between two points, sagging by `sag` at mid-span:
 * y(u) = sag·(cosh(κ(2u−1)) − cosh κ)/(cosh κ − 1) added to the chord —
 * zero at both ends, −sag at the centre. Clamped to the floor.
 */
function catenary(a, b, sag, n = 8, kappa = 1.5) {
  const A = V3(a), B = V3(b), ch = Math.cosh(kappa), out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = A.clone().lerp(B, u);
    p.y += sag * ((Math.cosh(kappa * (2 * u - 1)) - ch) / (ch - 1));
    out.push([p.x, Math.max(p.y, gY(p.z) + 0.0095), p.z]);
  }
  return out;
}

/* =============================================================== hardware */

/** Low lounge chair, dark leather over a satin steel sled. Seat top 375 mm. */
function loungeChair() {
  const g = new THREE.Group();
  const M = mats();

  // Dark leather: the rubber base, plus a fine pebbled grain. Without a grain
  // an upholstered panel renders as a flat grey slab at any distance.
  const grain = anodisedNormal(512, 0.62).clone();
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(11, 11);
  grain.needsUpdate = true;
  const grainR = anodisedRough(512, 0.62, 0.24).clone();
  grainR.wrapS = grainR.wrapT = THREE.RepeatWrapping;
  grainR.repeat.set(9, 9);
  grainR.needsUpdate = true;

  const leather = M.rubber.clone();
  leather.color.setHex(0x0d0a08);
  leather.roughness = 0.68;
  leather.roughnessMap = grainR;
  leather.normalMap = grain;
  leather.normalScale = new THREE.Vector2(0.85, 0.85);
  leather.sheen = 0.16;
  leather.sheenColor = new THREE.Color(0x241b12);
  leather.clearcoat = 0.22;
  leather.clearcoatRoughness = 0.46;
  leather.envMapIntensity = 0.30;

  const welt = leather.clone();
  welt.color.setHex(0x191310);
  welt.roughness = 0.44;

  const RAIL_Y = 0.252, HALF_W = 0.352, RUN_D = 0.66, RAKE = 0.34;
  const cr = Math.cos(RAKE), sr = Math.sin(RAKE);
  // polished stainless flat bar — it is the bright line that draws the chair
  const frame = M.chrome.clone();
  frame.roughness = 0.14;
  frame.envMapIntensity = 0.70;
  frame.color.setHex(0xb6babe);

  for (const s of [-1, 1]) {
    const runner = new THREE.Mesh(GEO.bevelBox(0.030, 0.013, RUN_D, 0.004, 3), frame);
    runner.position.set(s * HALF_W, 0.0125, 0.01);
    g.add(runner);

    const rail = new THREE.Mesh(GEO.bevelBox(0.030, 0.016, RUN_D, 0.004, 3), frame);
    rail.position.set(s * HALF_W, RAIL_Y, 0.01);
    g.add(rail);

    for (const z of [-0.285, 0.285]) {
      const post = new THREE.Mesh(GEO.bevelBox(0.026, RAIL_Y - 0.024, 0.015, 0.003, 3), frame);
      post.position.set(s * HALF_W, (RAIL_Y - 0.024) / 2 + 0.016, z + 0.01);
      g.add(post);
      const pad = new THREE.Mesh(GEO.bevelCyl(0.017, 0.019, 0.007, 24, 0.0008), M.anodBlack);
      pad.position.set(s * HALF_W, 0.0035, z + 0.01);
      g.add(pad);
    }

    const bp = new THREE.Mesh(GEO.bevelBox(0.026, 0.560, 0.015, 0.003, 3), frame);
    bp.rotation.x = -RAKE;
    bp.position.set(s * (HALF_W - 0.003), 0.345 + 0.280 * cr, 0.290 + 0.280 * sr);
    g.add(bp);

    for (const z of [-0.175, 0.145]) {
      const ap = new THREE.Mesh(GEO.bevelBox(0.020, 0.245, 0.014, 0.003, 3), frame);
      ap.position.set(s * (HALF_W + 0.009), RAIL_Y + 0.118, z + 0.01);
      g.add(ap);
      const sc = GEO.screw(0.0019);
      sc.rotation.set(0, 0, Math.PI / 2 * s);
      sc.position.set(s * (HALF_W + 0.020), RAIL_Y + 0.010, z + 0.01);
      g.add(sc);
    }
  }

  for (const z of [-0.285, 0.285]) {
    const cross = new THREE.Mesh(GEO.bevelBox(HALF_W * 2 - 0.032, 0.014, 0.026, 0.003, 3), frame);
    cross.position.set(0, RAIL_Y, z + 0.01);
    g.add(cross);
  }

  // cap rail across the top of the back — the chair's silhouette line. Kept
  // deliberately duller than the flat bar: a mirror cylinder that long just
  // becomes a blown-out streak under the key light.
  const capMat = frame.clone();
  capMat.roughness = 0.44;
  capMat.envMapIntensity = 0.26;
  capMat.color.setHex(0x9aa0a6);
  const cap = new THREE.Mesh(GEO.bevelCyl(0.0100, 0.0100, HALF_W * 2 - 0.010, 28, 0.0012), capMat);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(0, 0.345 + 0.552 * cr, 0.290 + 0.552 * sr);
  g.add(cap);

  // Channelled upholstery: three seat channels, six back cushions. The deep
  // gaps between them are what make a soft object read as something made.
  for (const x of [-0.232, 0, 0.232]) {
    const pad = new THREE.Mesh(GEO.bevelBox(0.220, 0.116, 0.632, 0.040, 6), leather);
    pad.position.set(x, RAIL_Y + 0.066, 0.005);
    g.add(pad);
  }

  const backAt = (d) => [0, 0.345 + d * cr, 0.292 + d * sr];
  for (const d of [0.1275, 0.3915]) {
    for (const x of [-0.216, 0, 0.216]) {
      const pad = new THREE.Mesh(GEO.bevelBox(0.206, 0.238, 0.098, 0.032, 6), leather);
      pad.rotation.x = -RAKE;
      const [, py, pz] = backAt(d);
      pad.position.set(x, py, pz);
      g.add(pad);
    }
  }

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(GEO.bevelBox(0.082, 0.044, 0.400, 0.020, 5), leather);
    arm.position.set(s * (HALF_W + 0.009), RAIL_Y + 0.262, -0.005);
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
  const sw = DIAG.tube(superEllipse(0.351, 0.321), 0.0032, welt, 150);
  sw.position.set(0, RAIL_Y + 0.066, 0.005);
  g.add(sw);

  for (const d of [0.1275, 0.3915]) {
    const bw = DIAG.tube(superEllipse(0.3255, 0.1225, 52), 0.0029, welt, 130);
    bw.rotation.set(Math.PI / 2 - RAKE, 0, 0);
    bw.position.set(...backAt(d));
    g.add(bw);
  }

  GEO.shadowed(g);
  g.add(GEO.contactShadow(1.55, 1.62, 0.72));
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

/**
 * The set is a photographic cyclorama: the floor sweeps up into the back wall
 * on a 1.9 m radius starting 1.9 m from the wall. Behind that point the ground
 * you can actually see is the sweep, not the y = 0 plane, so anything laid
 * "on the floor" upstage has to follow it or it is simply buried.
 */
const COVE_Z0 = LAYOUT.room.wallZ + COVE_R;     // −3.65 — behind all the gear
const gY = groundY;
/** Slope of the sweep at z, in radians (0 = flat). */
function gSlope(z) {
  if (z >= COVE_Z0) return 0;
  return Math.asin(Math.min(COVE_Z0 - z, COVE_R * 0.999) / COVE_R);
}
/** A point sitting `h` above the visible ground. */
const G = (x, h, z) => [x, gY(z) + h, z];

const RK = LAYOUT.rack;
const RACK_FRONT = RK.z + RK.d / 2;          // −3.05
const RACK_BACK = RK.z - RK.d / 2;           // −3.55
const SPINE_Z = RACK_FRONT + 0.170;
const SPINE_X = -0.246;
const NODE_X = -0.336;
/** Vertical tap on each bay: inside every legal box height, outside the rack's
 *  width, and never below the visible ground line. */
const bayY = (i) => Math.max(RK.shelfY[i] + 0.050, gY(SPINE_Z) + 0.038);

const FB = [-0.660, 0, -3.020];              // mains floor box, on the sweep
const MONO_L = LAYOUT.monoL, MONO_R = LAYOUT.monoR;
const SPK_L = LAYOUT.speakerL, SPK_R = LAYOUT.speakerR;

/** Real cable routes — physically plausible, with catenary slack. */
function cableRoutes() {
  const out = [];

  // mains: floor box → behind the rack, into the conditioner's rear inlet
  out.push({
    r: 0.0062,
    p: [
      G(FB[0] + 0.080, 0.026, FB[2] - 0.040),
      G(FB[0] + 0.010, 0.020, -3.090),
      G(-0.480, 0.018, -3.140),
      G(-0.380, 0.018, -3.190),
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
        G(s * 0.34, 0.020, -3.330),
        G(m.x - s * 0.24, 0.020, -3.230),
        G(m.x - s * 0.10, 0.024, -3.150),
        G(m.x - s * 0.04, 0.048, -3.098),
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
        G(s * 0.40, 0.020, -3.372),
        G(m.x - s * 0.22, 0.020, -3.276),
        G(m.x - s * 0.09, 0.022, -3.192),
        G(m.x - s * 0.02, 0.044, -3.136),
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
          G(m.x - s * 0.150 + off, 0.030, -2.990),
          ...catenary(G(m.x - s * 0.250 + off, 0.020, -2.930), G(sp.x + s * 0.330 + off, 0.016, -2.790), 0.018, 6),
          G(sp.x + s * 0.180 + off, 0.020, -2.730),
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
        ...catenary([tx + 0.070 + off, 0.245, tz - 0.145], G(tx + 0.330 + off, 0.014, tz - 0.360), 0.050, 6),
        G(-1.700 + off, 0.014, -2.930),
        G(-1.280 + off, 0.016, -3.010),
        G(-0.900 + off, 0.018, -3.090),
        G(-0.560 + off, 0.020, -3.170),
        [-0.360 + off, 0.400, -3.280],
        [-0.280 + off, 0.520, -3.440],
        [-0.245 + off, bayY(3) - 0.012, RACK_BACK + 0.002],
      ],
    });
  }
  return out;
}

/* ================================================================ overlay */

/** Cyan signal path: mains inlet → conditioner → up the rack → speaker. */
function chainPoints() {
  const p = [
    G(FB[0] + 0.020, 0.062, FB[2] + 0.020),
    G(-0.560, 0.058, -2.980),
    G(-0.430, 0.056, -2.930),
    G(-0.330, 0.062, -2.900),
    [SPINE_X, bayY(0) - 0.070, SPINE_Z],
  ];
  for (let i = 0; i < 6; i++) {
    const y = bayY(i);
    p.push([SPINE_X, y - 0.036, SPINE_Z]);
    p.push([NODE_X, y, SPINE_Z]);
    p.push([SPINE_X, y + 0.036, SPINE_Z]);
  }
  // out of the crossover, straight down beside the rack, then along the ground
  p.push([SPINE_X, bayY(5) + 0.080, SPINE_Z]);
  p.push([-0.372, bayY(5) + 0.098, SPINE_Z + 0.010]);
  p.push([-0.412, 0.940, SPINE_Z + 0.016]);
  p.push([-0.420, 0.640, SPINE_Z + 0.016]);
  p.push([-0.420, 0.400, SPINE_Z + 0.016]);
  p.push(G(-0.412, 0.075, -2.860));
  p.push(G(-0.520, 0.058, -2.900));
  p.push(G(-0.700, 0.052, -2.960));
  p.push(G(MONO_L.x + 0.075, 0.056, -3.010));
  p.push([MONO_L.x - 0.010, 0.230, -3.046]);
  p.push([MONO_L.x - 0.020, 0.286, -3.020]);      // monoblock node
  p.push(G(MONO_L.x - 0.130, 0.062, -2.960));
  p.push(G(MONO_L.x - 0.290, 0.050, -2.890));
  p.push(G(SPK_L.x + 0.240, 0.046, -2.810));
  p.push(G(SPK_L.x + 0.090, 0.060, -2.740));
  p.push([SPK_L.x - 0.030, 0.212, -2.655]);       // terminal node
  p.push([SPK_L.x + 0.045, 0.366, -2.556]);
  p.push([SPK_L.x + 0.188, 0.624, -2.468]);
  p.push([SPK_L.x + 0.224, 0.848, -2.427]);
  p.push([SPK_L.x + 0.230, 1.020, -2.404]);       // tweeter node
  return p;
}

/** The mirrored right channel, drawn dimmer — the system is stereo. */
function branchPoints() {
  return [
    [NODE_X, bayY(5), SPINE_Z],
    [-0.140, bayY(5) + 0.062, SPINE_Z - 0.004],
    [0.180, bayY(5) + 0.070, SPINE_Z - 0.004],
    [0.372, 0.980, SPINE_Z - 0.012],
    [0.408, 0.680, SPINE_Z - 0.016],
    [0.412, 0.420, SPINE_Z - 0.016],
    G(0.404, 0.075, -2.860),
    G(0.520, 0.058, -2.900),
    G(0.700, 0.052, -2.960),
    G(MONO_R.x - 0.075, 0.056, -3.010),
    [MONO_R.x + 0.010, 0.230, -3.046],
    [MONO_R.x + 0.020, 0.286, -3.020],
    G(MONO_R.x + 0.130, 0.062, -2.960),
    G(MONO_R.x + 0.290, 0.050, -2.890),
    G(SPK_R.x - 0.240, 0.046, -2.810),
    G(SPK_R.x - 0.090, 0.060, -2.740),
    [SPK_R.x + 0.030, 0.212, -2.655],
    [SPK_R.x - 0.045, 0.366, -2.556],
    [SPK_R.x - 0.188, 0.624, -2.468],
    [SPK_R.x - 0.224, 0.848, -2.427],
    [SPK_R.x - 0.230, 1.020, -2.404],
  ];
}

/** The turntable feeding the phono stage — the second source. */
function sourcePoints() {
  const TT = LAYOUT.ttPlinth;
  return [
    [TT.x + 0.10, TT.top + 0.060, TT.z - 0.13],
    [TT.x + 0.36, TT.top + 0.018, TT.z - 0.24],
    [-1.72, 0.735, -2.700],
    [-1.30, 0.715, -2.820],
    [-0.90, 0.698, -2.900],
    [-0.560, 0.678, -2.930],
    [NODE_X, bayY(3), SPINE_Z],
  ];
}

/** The mains loop route: out to the monoblock via the conditioner. */
function mainsRoute() {
  // Out of the floor box, forward on to open sweep, up into the conditioner
  // and back out to a monoblock. Both conductors stay in clear air the whole
  // way, because seeing the return leg is the entire point of this figure.
  return [
    G(FB[0] + 0.040, 0.062, FB[2] + 0.030),
    G(-0.540, 0.052, -2.970),
    G(-0.400, 0.046, -2.920),
    G(-0.240, 0.042, -2.870),
    G(-0.080, 0.044, -2.830),
    G(0.040, 0.070, -2.850),
    G(0.084, 0.118, -2.890),
    [0.098, 0.248, -2.920],        // conditioner tap
    G(0.190, 0.086, -2.880),
    G(0.310, 0.052, -2.830),
    G(0.460, 0.042, -2.790),
    G(0.610, 0.046, -2.800),
    G(0.706, 0.090, -2.850),
    [0.726, 0.238, -2.884],        // monoblock tap
  ];
}

export default {
  id: 'overview',
  title: 'The System',
  nav: 'Overview',
  kicker: 'Overview',
  standfirst: 'Twelve boxes carrying one quantity, and one closed loop feeding all of them.',
  shot: { position: [2.48, 2.06, 6.80], target: [0.17, 0.75, -2.55], fov: 28.5 },
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    const M = mats();

    /* ---------------------------------------------------------- hardware */
    const hardware = new THREE.Group();
    hardware.name = 'overview-hardware';

    const chair = loungeChair();
    chair.position.set(LAYOUT.listener.x, 0, LAYOUT.listener.z - 0.185);
    chair.rotation.y = Math.PI * 0.014;
    hardware.add(chair);

    const fbox = floorBox();
    fbox.position.set(FB[0], gY(FB[2]), FB[2]);
    fbox.rotation.set(gSlope(FB[2]), 0, 0);     // lie flat on the sweep
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

    const cCurve = curveThrough(chainPoints());
    this.chainLen = cCurve.getLength();
    const N = 300;
    const chain = new DIAG.Trace(N, PAL.cy, 3.1, { opacity: 0.96, renderOrder: 13 });
    chain.write((i, u) => { const v = cCurve.getPointAt(u); return [v.x, v.y, v.z]; });
    chain.material.vertexColors = true;
    chain.material.needsUpdate = true;
    chain.geometry.setColors(new Float32Array(N * 3).fill(1));
    this.chainCol = chain.geometry.attributes.instanceColorStart.data;
    this.chainN = N;
    overlay.add(chain);

    const bCurve = curveThrough(branchPoints());
    const branch = new DIAG.Trace(160, PAL.cy, 2.0, { opacity: 0.32, renderOrder: 12 });
    branch.write((i, u) => { const v = bCurve.getPointAt(u); return [v.x, v.y, v.z]; });
    overlay.add(branch);

    const sCurve = curveThrough(sourcePoints());
    const src = new DIAG.Trace(90, PAL.cy, 2.0, { opacity: 0.30, renderOrder: 12 });
    src.write((i, u) => { const v = sCurve.getPointAt(u); return [v.x, v.y, v.z]; });
    overlay.add(src);

    // the last leg is air, not copper: dashed, and never animated
    const ear = V3([LAYOUT.listener.x, LAYOUT.listener.y, LAYOUT.listener.z]);
    for (const sp of [SPK_L, SPK_R]) {
      const a = new THREE.Vector3(
        sp.x + Math.sin(sp.ry) * 0.20, 1.02, sp.z + Math.cos(sp.ry) * 0.20,
      );
      const air = new DIAG.Trace(48, PAL.cy, 1.3, {
        opacity: 0.17, renderOrder: 11, dashed: true, dashSize: 0.030, gapSize: 0.070,
      });
      air.write((i, u) => {
        const p = a.clone().lerp(ear, u);
        return [p.x, p.y, p.z];
      });
      overlay.add(air);
    }

    // nodes: one glow wherever the path enters a component
    const nodes = [];
    for (let i = 0; i < 6; i++) nodes.push(V3([NODE_X, bayY(i), SPINE_Z]));
    nodes.push(V3([MONO_L.x - 0.020, 0.255, -3.160]));
    nodes.push(V3([SPK_L.x - 0.030, 0.208, -2.655]));
    nodes.push(V3([SPK_L.x + 0.228, 1.020, -2.405]));
    this.nodes = nodes;
    this.nodeU = nodes.map((n) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k <= 240; k++) {
        const d = cCurve.getPointAt(k / 240).distanceToSquared(n);
        if (d < bd) { bd = d; best = k / 240; }
      }
      return best;
    });
    this.nodeSwarm = new DIAG.Swarm(nodes.length, { color: PAL.cy, size: 0.0062 });
    overlay.add(this.nodeSwarm);

    // callout leaders for the six rack components (one polyline, retraced)
    const anchors = [];
    for (let i = 0; i < 6; i++) anchors.push(V3([-0.400 - 0.056 * i, 0.955 + 0.236 * i, -3.020]));
    const lead = new DIAG.Trace(18, 0x4d5865, 1.1, { opacity: 0.50, renderOrder: 11 });
    lead.write((i) => {
      const b = Math.floor(i / 3), k = i % 3;
      const p = k === 1 ? anchors[b] : nodes[b];
      return [p.x, p.y, p.z];
    });
    overlay.add(lead);

    /* --- the mains loop: out on live, back on neutral ------------------- */
    const mCurve = curveThrough(mainsRoute());
    const SEP = 0.105, MP = 120;
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
    const loop = new DIAG.Trace(LN, PAL.am, 2.6, { opacity: 0.92, renderOrder: 13 });
    loop.write((i) => [loopPts[i].x, loopPts[i].y, loopPts[i].z]);
    loop.material.vertexColors = true;
    loop.material.needsUpdate = true;
    loop.geometry.setColors(new Float32Array(LN * 3).fill(1));
    this.loopCol = loop.geometry.attributes.instanceColorStart.data;
    this.loopN = LN;
    overlay.add(loop);

    // arrows = conventional current, circulating one way round the loop
    const NA = 32;
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
      new THREE.ConeGeometry(0.0092, 0.026, 10),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, depthWrite: false }),
      NA,
    );
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 15;
    this.arrowBase = new THREE.Color(PAL.am);
    overlay.add(this.arrows);

    // carriers: they do not travel, they jostle
    const NE = 36;
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
    this.elec = new DIAG.Swarm(NE, { color: 0xffd9a0, size: 0.0040, additive: false });
    overlay.add(this.elec);
    this.drawAmp = 0.030;
    this.drawMag = this.drawAmp / X_DRIFT;

    /* ------------------------------------------------------------ labels */
    const L = ctx.labels;
    const rack = [
      ['01 · CONDITIONER', `${MAINS_V} V · ${MAINS_F} Hz`, 'am'],
      ['02 · STREAMER', `${(BITRATE / 1e6).toFixed(3)} Mbit/s`, 'acc'],
      ['03 · DAC', `${BITS} bit · ${SNR_24.toFixed(0)} dB`, 'acc'],
      ['04 · PHONO', `RIAA · +${G_PHONO.toFixed(0)} dB`, 'acc'],
      ['05 · PREAMP', `${G_VOL.toFixed(1).replace('-', '−')} dB`, 'acc'],
      ['06 · CROSSOVER', 'LR4 · 80 Hz', 'acc'],
    ];
    rack.forEach(([k, v, cls], i) => {
      L.add(anchors[i], { kicker: k, value: v, cls, offset: [-64, 0] });
    });

    const TT = LAYOUT.ttPlinth;
    L.add(V3([TT.x + 0.10, TT.top + 0.40, TT.z - 0.02]), {
      kicker: 'SOURCE · TURNTABLE',
      value: `${(V_CART * 1e3).toFixed(2)} mV · 5 cm/s`, cls: 'acc', offset: [-6, -16],
    });
    L.add(V3([MONO_L.x - 0.26, 0.105, -2.600]), {
      kicker: 'MONOBLOCK', text: `+${G_AMP.toFixed(0)} dB voltage gain<br>`,
      value: `${P_AMP} W / ${R_AMP} Ω · ${V_AMP.toFixed(1)} V`, cls: 'acc', offset: [-28, 56],
    });
    L.add(V3([SPK_R.x - 0.06, 1.380, -2.40]), {
      kicker: 'LOUDSPEAKER', text: `sensitivity ${SENS} dB at 1 m<br>`,
      value: `${V_TERM.toFixed(2)} V = ${P_TERM.toFixed(2)} W / ${R_SPK} Ω`, cls: 'acc', offset: [-104, -24],
    });

    const legendA = V3([LAYOUT.listener.x, LAYOUT.listener.y + 0.02, LAYOUT.listener.z]);
    L.add(legendA, {
      kicker: 'LISTENING SEAT',
      text: `${D_SEAT.toFixed(2)} m from each loudspeaker<br>`,
      value: `${(T_AIR * 1e3).toFixed(1)} ms of air`, cls: 'acc', offset: [12, 40],
    });

    const mainsA = V3([0.980, 0.062, -2.360]);
    L.add(mainsA, {
      kicker: 'MAINS · CLOSED LOOP',
      text: `electrons ±${(X_DRIFT * 1e6).toFixed(1)} µm at ${(V_DRIFT * 1e3).toFixed(2)} mm/s<br>`,
      value: `drawn × ${expo(this.drawMag)}`, cls: 'am', offset: [26, 30],
    });

    this.pulseRatio = PULSE_SECONDS / (this.chainLen / V_FIELD);
    const fieldA = V3([-0.100, 0.062, -2.230]);
    L.add(fieldA, {
      kicker: 'FIELD FRONT',
      text: `0.66 c · ${this.chainLen.toFixed(1)} m of copper in ${(this.chainLen / V_FIELD * 1e9).toFixed(0)} ns<br>`,
      value: `shown 1 : ${expo(this.pulseRatio)}`, cls: 'acc', offset: [-8, 34],
    });

    // leaders for the two legends, back to the thing each describes
    const legLead = new DIAG.Trace(6, 0x4d5865, 1.0, { opacity: 0.42, renderOrder: 11 });
    const legPts = [
      mainsA, V3([0.610, gY(-2.800) + 0.046, -2.800]), mainsA,
      fieldA, V3([-0.420, 0.400, SPINE_Z + 0.016]), fieldA,
    ];
    legLead.write((i) => [legPts[i].x, legPts[i].y, legPts[i].z]);
    overlay.add(legLead);

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
    const col = this.chainCol.array, N = this.chainN, W = 0.034;
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
      return { p: [p.x, p.y, p.z], s: 0.85 + 2.0 * k };
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
    const Lc = this.chainLen || 5.6;
    const tCu = Lc / V_FIELD;                       // s
    const ratio = T_AIR / tCu;                      // air : copper
    const pad = (v, n) => String(v).padStart(n, ' ');
    return `
<h3>What the boxes do</h3>
<p>Thirteen chassis stand here. Twelve touch the signal; the thirteenth — the
conditioner — touches only energy. Between them they carry one quantity, the
pressure history of a performance, from a stored trace to moving air, and every
box is asked to change how it is represented without changing its shape.</p>

<h3>Six forms, five changes</h3>
<p>Trace one note. It is <b>mechanical</b> at the microphone diaphragm,
<b>electrical</b> in the coil behind it, <b>numeric</b> in the file,
<b>electrical</b> again at the converter, <b>mechanical</b> at the voice coil,
and <b>acoustic</b> for the last <span class="num">${D_SEAT.toFixed(2)}</span> m.
Six representations, five changes — and only the last three happen here.</p>

<h3>The gain</h3>
<div class="eq">  ${(V_CART * 1e3).toFixed(2)} mV   <span class="c">cartridge, 5 cm/s at 1 kHz</span>
+ ${pad(G_PHONO.toFixed(1), 4)} dB   <span class="c">phono stage     × ${DSP.undB(G_PHONO).toFixed(0)}</span>
− ${pad(Math.abs(G_VOL).toFixed(1), 4)} dB   <span class="c">volume control  × ${DSP.undB(G_VOL).toFixed(3)}</span>
+ ${pad(G_XOVER.toFixed(1), 4)} dB   <span class="c">crossover       × ${DSP.undB(G_XOVER).toFixed(2)}</span>
+ ${pad(G_AMP.toFixed(1), 4)} dB   <span class="c">monoblock       × ${DSP.undB(G_AMP).toFixed(2)}</span>
─────────
<span class="hl">+ ${G_TOTAL.toFixed(1)} dB</span>   <span class="c">a voltage ratio of ${(V_TERM / V_CART).toFixed(0)} : 1</span>
  ${V_TERM.toFixed(2)} V    <span class="c">= ${P_TERM.toFixed(2)} W into ${R_SPK} Ω = ${SENS} dB at 1 m</span></div>
<p>At <span class="num">${D_SEAT.toFixed(2)}</span> m that is
<span class="num">${SPL_SEAT.toFixed(1)}</span> dB from one loudspeaker in a free
field. The only stage in the chain that turns the signal <em>down</em> is the one
called the amplifier.</p>

<h3>Two speeds</h3>
<p>The cyan path is <span class="num">${Lc.toFixed(1)}</span> m of conductor and
the field crosses it in <span class="num">${(tCu * 1e9).toFixed(0)} ns</span>.
The last <span class="num">${D_SEAT.toFixed(2)}</span> m — air — takes
<span class="num">${(T_AIR * 1e3).toFixed(1)} ms</span>,
<span class="num">${expo(ratio)}</span> times longer. Everything that matters
about arrival time happens after the last box.</p>

<div class="key"><span class="lab">The idea</span><p>Current is a closed loop.
The amber path leaves on live and returns on neutral, and nothing in it travels:
at full output its electrons oscillate
±<span class="num">${(X_DRIFT * 1e6).toFixed(1)}</span> µm about a fixed point at
<span class="num">${(V_DRIFT * 1e3).toFixed(2)}</span> mm/s peak, while the field
that pushes them moves at <span class="num">${expo(V_FIELD, 2)}</span> m/s — a
ratio of <span class="num">${expo(V_FIELD / V_DRIFT)}</span>. No one animation
holds both, so the electrons are magnified
<span class="num">${expo(this.drawMag || 2.29e4)}</span> and the front slowed
<span class="num">${expo(this.pulseRatio || 1.06e8)}</span>, both printed on the
scene. One 50 Hz wavelength here is
<span class="num">${(LAMBDA_MAINS / 1000).toFixed(0)}</span> km, so the loop is
everywhere in phase. Its two conductors are drawn apart; in the flex they lie
about <span class="num">4</span> mm apart and enclose almost no area.</p></div>`;
  },

  readouts() {
    const i = this.iNow || 0;
    return [
      { k: 'CHAIN GAIN', v: `+${G_TOTAL.toFixed(1)}`, u: 'dB', cls: 'acc' },
      { k: 'AT THE POSTS', v: V_TERM.toFixed(2), u: 'V rms', cls: 'acc' },
      { k: 'MAINS CURRENT', v: i.toFixed(2), u: 'A', cls: 'am', bar: Math.abs(i) / I_MAINS_PK },
      { k: 'CARRIER DRIFT', v: (DSP.driftVelocity(Math.abs(i), CU_MM2) * 1e3).toFixed(3), u: 'mm/s', cls: 'am' },
      { k: 'FIELD FRONT', v: expo(V_FIELD, 2), u: 'm/s', cls: '' },
      { k: 'AIR PATH', v: (T_AIR * 1e3).toFixed(1), u: 'ms', cls: '' },
    ];
  },
};
