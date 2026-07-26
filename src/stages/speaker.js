import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   MOTOR & CABINET  —  two floorstanders, one motor opened up beside them.

   Every number below is derived from eight measured primaries and the physical
   constants in dsp.js. Nothing is chosen to look good.

   PRIMARIES (a 210 mm-Sd long-throw bass driver, plausible measured set):
     fs   = 28.0 Hz     free-air resonance
     Mms  = 49.0 g      moving mass including air load
     Re   = 6.2 Ω       DC resistance of the voice coil
     Bl   = 12.0 T·m    force factor (gap flux density × wire length in gap)
     Qms  = 4.2         mechanical Q at fs
     Sd   = 0.0346 m²   effective piston area (r = 105 mm)
     Le   = 0.55 mH     lumped voice-coil inductance
     Xmax = 8.0 mm      one-way linear excursion
   =========================================================================== */

const TAU = DSP.TAU;
const TS = { fs: 28.0, Mms: 0.049, Re: 6.2, Bl: 12.0, Qms: 4.2, Sd: 0.0346, Le: 0.55e-3, Xmax: 0.008 };

const ws = TAU * TS.fs;                                   // 175.929 rad/s
const Cms = 1 / (ws * ws * TS.Mms);                       // 659 µm/N
const Kms = 1 / Cms;                                      // 1516.6 N/m
const Rms = (ws * TS.Mms) / TS.Qms;                       // 2.053 N·s/m
const Qes = (ws * TS.Mms * TS.Re) / (TS.Bl * TS.Bl);      // 0.3712
const Qts = (TS.Qms * Qes) / (TS.Qms + Qes);              // 0.3410
const RHOC2 = DSP.RHO_AIR * DSP.C_SOUND_20C * DSP.C_SOUND_20C;
const Vas = RHOC2 * TS.Sd * TS.Sd * Cms;                  // 0.1120 m³ = 112 L
const Vb = 0.030;                                         // 30 L sealed chamber, one per woofer
const AL = DSP.sealedAlignment({ fs: TS.fs, Qts, Vas }, Vb); // {alpha, fc, Qtc}
const Kbox = Kms * (1 + AL.alpha);                        // box-stiffened suspension
const Res = (TS.Bl * TS.Bl) / Rms;                        // motional resistance at resonance, Ω
const ZMAX = TS.Re + Res;                                 // 76.3 Ω at the impedance peak

/**
 * −3 dB corner of the sealed 2nd-order high-pass, in closed form.
 * |H|² = u²/((1−u)² + u/Qtc²) = ½ with u = (f/fc)²  ⇒  u² + (2 − 1/Qtc²)·u − 1 = 0.
 */
const F3 = (() => {
  const b = 2 - 1 / (AL.Qtc * AL.Qtc);
  const u = (-b + Math.sqrt(b * b + 4)) / 2;
  return AL.fc * Math.sqrt(u);
})();

/** Reference efficiency (Small): η₀ = (4π²/c³)·fs³·Vas/Qes. */
const ETA0 = ((4 * Math.PI * Math.PI) / Math.pow(DSP.C_SOUND_20C, 3)) * Math.pow(TS.fs, 3) * Vas / Qes;
/** 1 acoustic watt into half space, measured at 1 m. */
const SPL_1W = DSP.splFromPa(Math.sqrt((1 / (2 * Math.PI)) * DSP.RHO_AIR * DSP.C_SOUND_20C));
const P_283 = (2.83 * 2.83) / TS.Re;                      // 1.292 W into 6.2 Ω
const SENS = SPL_1W + 10 * Math.log10(ETA0) + 10 * Math.log10(P_283);
const P_AC_283 = ETA0 * P_283;                            // acoustic watts out of 2.83 V

/** Voice coil: 0.32 mm Ø enamelled copper, overhung in an 8.5 mm gap. */
const WIRE_MM2 = Math.PI * Math.pow(0.32 / 2, 2);         // 0.08042 mm²
const WIRE_LEN = (TS.Re * WIRE_MM2 * 1e-6) / 1.72e-8;     // ρ_Cu = 1.72e-8 Ω·m → 29.0 m
const H_GAP = 0.0085, H_COIL = 0.0245;                    // gap and winding heights
const XMAX_CHK = (H_COIL - H_GAP) / 2;                    // = 8.0 mm — matches TS.Xmax
const L_IN_GAP = WIRE_LEN * (H_GAP / H_COIL);             // 10.06 m of wire is in the field
const B_GAP = TS.Bl / L_IN_GAP;                           // 1.19 T — a good ferrite gap
const N_TURNS = WIRE_LEN / (TAU * 0.0254);                // 25.4 mm coil radius → 182 turns
const V_SIG = DSP.signalSpeed(0.66);                      // field/energy speed in the winding
const T_FILL = WIRE_LEN / V_SIG;                          // ~147 ns to energise the whole coil

/**
 * Reference drive level for the whole overlay: 96 dB SPL at 1 m into half
 * space, from ONE driver. Four woofers are animated (two per cabinet, both
 * cabinets) and every figure on screen is per driver — hence the qualifier on
 * the readout, the graph label and in the prose.
 */
const SPL_REF = 96;
const F_LO = 30, F_HI = 100;                              // the two mandated comparison points
const X30 = DSP.excursionForSpl(SPL_REF, F_LO, TS.Sd);    // 7.575 mm peak
const X100 = DSP.excursionForSpl(SPL_REF, F_HI, TS.Sd);   // 0.682 mm peak
/** Lowest frequency this driver reaches SPL_REF at before hitting Xmax. */
const F_XMAX = F_LO * Math.sqrt(X30 / TS.Xmax);

/** Electron drift in the coil at a stated peak current. */
const drift = (i) => DSP.driftVelocity(i, WIRE_MM2);

/** Magnitude of the mechanical driving-point force for a peak displacement. */
function forceFor(f, xp) {
  const w = TAU * f;
  const A = (Kbox - w * w * TS.Mms) * xp;                 // stiffness − inertia, in phase with x
  const B = Rms * w * xp;                                 // damping, in quadrature
  return { A, B, peak: Math.hypot(A, B) };
}

/** The stage's own operating point at 30 Hz — the worked example in content(). */
const F30 = forceFor(F_LO, X30).peak;                     // 41.3 N
const I30 = F30 / TS.Bl;                                  // 3.44 A
const DR30 = DSP.driftDisplacement(drift(I30), F_LO);     // 16.7 µm

/**
 * Private clones of the shared material library.
 *
 * DIAG.fadeTree writes material.opacity directly, so any stage whose overlay
 * contains a mesh built from a library material zeroes that material for the
 * whole scene — including other stages' permanently-visible hardware. Cloning
 * up front makes this stage immune.
 */
const HW_KEYS = ['alu', 'aluV', 'anodBlack', 'anodGrey', 'chrome', 'steel', 'gold', 'copper',
  'magnetWire', 'lamination', 'pianoBlack', 'graphite', 'plastic', 'rubber', 'glass',
  'clearGlass', 'cloth', 'cone', 'coneWeave', 'dome', 'wood', 'pcb', 'vinyl'];
let _hw = null;
function hw() {
  if (_hw) return _hw;
  const m = mats();
  _hw = {};
  for (const k of HW_KEYS) if (m[k]) _hw[k] = m[k].clone();
  return _hw;
}

// ===========================================================================
// Geometry helpers — faceted gloss cabinets need a rounded plan and a shear.
// ===========================================================================

/** Polygon → THREE.Shape with every corner broken by radius r. */
function roundedShape(pts, r) {
  const n = pts.length;
  const P = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const seg = [];
  for (let i = 0; i < n; i++) {
    const v = P[i], p = P[(i - 1 + n) % n], q = P[(i + 1) % n];
    const din = v.clone().sub(p); const lin = din.length(); din.normalize();
    const dout = q.clone().sub(v); const lout = dout.length(); dout.normalize();
    const rr = Math.min(r, lin * 0.45, lout * 0.45);
    seg.push({ a: v.clone().addScaledVector(din, -rr), v, b: v.clone().addScaledVector(dout, rr) });
  }
  const s = new THREE.Shape();
  s.moveTo(seg[0].b.x, seg[0].b.y);
  for (let i = 1; i <= n; i++) {
    const c = seg[i % n];
    s.lineTo(c.a.x, c.a.y);
    s.quadraticCurveTo(c.v.x, c.v.y, c.b.x, c.b.y);
  }
  s.closePath();
  return s;
}

/**
 * A cabinet module: plan polygon in (x, z) extruded to height h, every edge
 * broken, then sheared so the front baffle rakes back by `rake` radians.
 * Normals are corrected with the inverse-transpose of the shear.
 */
function prism(planPts, h, opts = {}) {
  const { rake = 0, y0 = 0, corner = 0.007, bevel = 0.0026, mat = hw().pianoBlack } = opts;
  const shape = roundedShape(planPts.map(([x, z]) => [x, -z]), corner);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: h - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, curveSegments: 5, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  const tr = Math.tan(rake);
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) - y * tr);
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const l = Math.hypot(nx, ny + tr * nz, nz) || 1;
    nor.setXYZ(i, nx / l, (ny + tr * nz) / l, nz / l);
  }
  g.translate(0, y0, 0);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Annular ring with broken edges — trim rings, top plates, flanges. */
function ring(rIn, rOut, h, mat, b = 0.0006, radial = 72) {
  const p = [
    new THREE.Vector2(rIn, -h / 2 + b), new THREE.Vector2(rIn + b, -h / 2),
    new THREE.Vector2(rOut - b, -h / 2), new THREE.Vector2(rOut, -h / 2 + b),
    new THREE.Vector2(rOut, h / 2 - b), new THREE.Vector2(rOut - b, h / 2),
    new THREE.Vector2(rIn + b, h / 2), new THREE.Vector2(rIn, h / 2 - b),
    new THREE.Vector2(rIn, -h / 2 + b),
  ];
  const g = new THREE.LatheGeometry(p, radial);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ===========================================================================
// Drivers
// ===========================================================================

/**
 * A cone driver, axis along +Z (front at +Z).
 * `rEff` is the effective radius at the middle of the surround, so that
 * Sd = π·rEff² is the number the maths uses.
 */
function makeDriver(o) {
  const {
    rEff, surroundW, flangeR, depth, bolts = 8, dust = 0, plug = 0, boltR: boltRr = 0.0038,
    coneMat = hw().cone, motorR = 0.075, motorMat = hw().anodBlack, coilR = 0.025,
  } = o;
  const rOuter = rEff + surroundW / 2;
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = Math.PI / 2;          // +Y-up parts → +Z-facing
  g.add(inner);

  // --- cast basket -----------------------------------------------------------
  const cast = hw().anodBlack.clone();
  cast.color.setHex(0x202328); cast.roughness = 0.66; cast.metalness = 0.85; cast.envMapIntensity = 0.7;
  const basket = GEO.driverBasket(rOuter * 0.995, depth * 1.12, 6, cast);
  // GEO.driverBasket builds its rim with bevelCyl, which is a *solid* disc and
  // therefore caps the driver opening. Swap it for a true annulus.
  basket.remove(basket.children[0]);
  basket.add(ring(rOuter * 0.90, rOuter * 1.015, 0.011, cast, 0.0007, 96));
  basket.position.y = -0.021;
  inner.add(basket);

  // --- mounting flange + fixings ---------------------------------------------
  const fl = ring(rOuter * 0.985, flangeR, 0.0075, cast, 0.0007);
  fl.position.y = -0.0018;
  inner.add(fl);
  const trimM = hw().anodGrey.clone();
  trimM.color.setHex(0x33383e); trimM.roughness = 0.52; trimM.envMapIntensity = 0.55;
  const trim = ring(flangeR - 0.0035, flangeR, 0.0022, trimM, 0.0005);
  trim.position.y = 0.0018;
  inner.add(trim);
  // Machined countersinks with a real fastener in each: at 210 mm the head is
  // ~9 mm across, which is what gives the driver its sense of size.
  const boltR = (rOuter + flangeR) / 2;
  const boltM = hw().steel.clone(); boltM.color.setHex(0x7c828a); boltM.roughness = 0.34;
  boltM.envMapIntensity = 0.8;
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * TAU + Math.PI / bolts;
    const sink = ring(boltRr * 1.05, boltRr * 1.55, 0.0016, cast, 0.0004, 20);
    sink.position.set(Math.sin(a) * boltR, 0.0012, Math.cos(a) * boltR);
    inner.add(sink);
    const s = GEO.screw(boltRr, { mat: boltM });
    s.rotation.x = 0;
    s.position.set(Math.sin(a) * boltR, 0.0026, Math.cos(a) * boltR);
    inner.add(s);
  }

  // --- moving assembly: cone + roll surround + dust cap -----------------------
  const moving = new THREE.Group();
  // The half-roll surround peaks surroundW*0.46 above the rim plane; sink the
  // whole moving assembly by that much so the roll sits flush with the flange.
  const baseY = -surroundW * 0.46;
  moving.position.y = baseY;
  const surrMat = hw().rubber.clone();
  surrMat.color.setHex(0x131619);
  surrMat.roughness = 0.86; surrMat.sheen = 0.50; surrMat.sheenRoughness = 0.74;
  surrMat.sheenColor = new THREE.Color(0x353b44); surrMat.envMapIntensity = 0.30;
  surrMat.specularIntensity = 0.20;
  const dustMat = hw().cone.clone();
  dustMat.color.setHex(0x24282d); dustMat.roughness = 0.84;
  dustMat.sheen = 0.45; dustMat.sheenColor = new THREE.Color(0x3a4048);
  dustMat.envMapIntensity = 0.22; dustMat.specularIntensity = 0.08;
  const cone = GEO.driverCone(rOuter, depth, { surroundW, dustR: dust, coneMat, surrMat, dustMat });
  moving.add(cone);
  // coil former, visible through the cutaway
  const former = ring(coilR - 0.0011, coilR + 0.0011, 0.024, hw().plastic, 0.0003, 40);
  former.position.y = -depth - 0.006;
  moving.add(former);
  const wind = ring(coilR + 0.0011, coilR + 0.0023, 0.019, hw().magnetWire, 0.0003, 40);
  wind.position.y = -depth - 0.009;
  moving.add(wind);
  moving.userData.coil = wind;
  inner.add(moving);
  g.userData.moving = moving;
  g.userData.baseY = baseY;

  // --- static phase plug ------------------------------------------------------
  if (plug > 0) {
    const pp = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pp.push(new THREE.Vector2(plug * Math.cos((Math.PI / 2) * t), plug * 1.35 * Math.sin((Math.PI / 2) * t) - depth * 0.55));
    }
    const pm = new THREE.Mesh(new THREE.LatheGeometry(pp, 48), hw().alu);
    pm.castShadow = true;
    inner.add(pm);
  }

  // --- motor: back plate + pole, magnet ring, top plate, gap ------------------
  const motor = new THREE.Group();
  const back = ring(0, motorR, 0.009, motorMat, 0.0008, 56);
  back.position.y = -depth - 0.049;
  motor.add(back);
  const pole = ring(0, coilR - 0.0016, 0.036, hw().steel, 0.0008, 48);
  pole.position.y = -depth - 0.030;
  motor.add(pole);
  const mag = ring(coilR + 0.006, motorR, 0.021, hw().lamination, 0.0008, 56);
  mag.position.y = -depth - 0.034;
  motor.add(mag);
  const top = ring(coilR + 0.0028, motorR * 0.96, 0.0085, hw().steel, 0.0008, 56);
  top.position.y = -depth - 0.0193;
  motor.add(top);
  inner.add(motor);

  GEO.shadowed(g);
  // The basket sits directly behind the cone; letting it cast into the cone
  // buries the whole diaphragm in shadow-map noise for no visual gain.
  basket.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  // The cone keeps receiveShadow: the flange and the recessed baffle genuinely
  // shade the upper half of a deep cone, and that shading is what stops the
  // lower wall — which faces the key light square on — from blowing out.
  moving.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  motor.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

/** 25 mm dome tweeter in a machined faceplate with a shallow waveguide. */
function makeTweeter(faceR = 0.052, domeR = 0.0125) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = Math.PI / 2;
  g.add(inner);

  // waveguide: a shallow flare from the dome surround out to the faceplate rim
  const wg = [];
  const n = 22, rIn = domeR * 1.34, rOut = faceR - 0.006;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = rIn + (rOut - rIn) * t;
    wg.push(new THREE.Vector2(r, -0.0092 * Math.pow(1 - t, 2.1) + 0.0002));
  }
  const wgm = new THREE.Mesh(new THREE.LatheGeometry(wg, 72), hw().alu);
  wgm.castShadow = wgm.receiveShadow = true;
  inner.add(wgm);
  const rim = ring(rOut - 0.0008, faceR, 0.0075, hw().alu, 0.0006);
  rim.position.y = -0.0022;
  inner.add(rim);

  // dome + half-roll surround
  const dm = new THREE.Mesh(new THREE.SphereGeometry(domeR, 40, 20, 0, TAU, 0, Math.PI * 0.52), hw().dome);
  dm.position.y = -0.0031;
  dm.castShadow = true;
  inner.add(dm);
  const sp = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    sp.push(new THREE.Vector2(domeR + (domeR * 0.34 / 2) * (1 - Math.cos(a)), Math.sin(a) * domeR * 0.15 - 0.0031));
  }
  const sm = new THREE.Mesh(new THREE.LatheGeometry(sp, 64), hw().rubber);
  inner.add(sm);

  // motor behind
  const mg = ring(0.010, 0.036, 0.017, hw().lamination, 0.0007, 48);
  mg.position.y = -0.020;
  inner.add(mg);
  const bp = ring(0, 0.036, 0.006, hw().anodBlack, 0.0006, 48);
  bp.position.y = -0.031;
  inner.add(bp);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const s = GEO.screw(0.0028, { mat: hw().steel });
    s.rotation.x = 0;
    s.position.set(Math.sin(a) * (faceR - 0.0048), 0.0018, Math.cos(a) * (faceR - 0.0048));
    inner.add(s);
  }
  GEO.shadowed(g);
  return g;
}

// ===========================================================================
// Cabinet — a Wilson-idiom two-module floorstander, 1.252 m tall.
// Local frame: origin on the floor at the cabinet centre, front = +Z.
// ===========================================================================

const RAKE_BASS = 3.5 * Math.PI / 180;
const RAKE_HEAD = 11.0 * Math.PI / 180;
const BASS_Y0 = 0.068, BASS_H = 0.747;
const GANT_Y0 = 0.815, GANT_H = 0.020;
const HEAD_Y0 = 0.835, HEAD_H = 0.417;

const T_BB = 0.024, T_HB = 0.020;                    // machined baffle thickness
const W_BB = 0.315, W_HB = 0.248;                    // baffle widths
// Bodies are recessed by one baffle thickness; the holed baffle plate sits on top.
const PLAN_BASS = [[-W_BB / 2, 0.200 - T_BB], [W_BB / 2, 0.200 - T_BB], [0.126, -0.245], [-0.126, -0.245]];
const PLAN_GANT = [[-0.161, 0.158], [0.161, 0.158], [0.129, -0.295], [-0.129, -0.295]];
const PLAN_HEAD = [[-W_HB / 2, 0.155 - T_HB], [W_HB / 2, 0.155 - T_HB], [0.103, -0.175], [-0.103, -0.175]];

/** Flat baffle panel with driver cut-outs; front face at local z = 0. */
function bafflePlate(w, h, T, holes, mat) {
  const s = roundedShape([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], 0.008);
  for (const [cx, cy, r] of holes) {
    const p = new THREE.Path();
    p.absarc(cx, cy, r, 0, TAU, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: T - 0.0022, bevelEnabled: true, bevelSize: 0.0022, bevelThickness: 0.0022,
    bevelSegments: 2, curveSegments: 26, steps: 1,
  });
  g.translate(0, 0, -T + 0.0022);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** z of the raked bass baffle at world height y. */
const zBass = (y) => 0.200 - (y - BASS_Y0) * Math.tan(RAKE_BASS);
/** z of the raked head baffle at world height y. */
const zHead = (y) => 0.155 - (y - HEAD_Y0) * Math.tan(RAKE_HEAD);

const W_LO_Y = 0.285, W_HI_Y = 0.565, MID_Y = 0.985, TW_Y = 1.145;

function makeCabinet() {
  const g = new THREE.Group();

  // --- spikes and machined plinth --------------------------------------------
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const spike = new THREE.Mesh(GEO.bevelCyl(0.0016, 0.0155, 0.044, 26, 0.0008), hw().steel);
    spike.position.set(sx * 0.163, 0.022, sz * 0.215);
    spike.castShadow = true;
    g.add(spike);
    const lock = new THREE.Mesh(GEO.bevelCyl(0.021, 0.021, 0.0065, 30, 0.0006), hw().alu);
    lock.position.set(spike.position.x, 0.0415, spike.position.z);
    g.add(lock);
  }
  const plinth = prism([[-0.21, 0.268], [0.21, 0.268], [0.187, -0.30], [-0.187, -0.30]], 0.024,
    { y0: 0.044, corner: 0.010, bevel: 0.0018, mat: hw().anodBlack });
  g.add(plinth);

  // --- gloss modules ----------------------------------------------------------
  const bass = prism(PLAN_BASS, BASS_H, { y0: BASS_Y0, rake: RAKE_BASS, mat: hw().pianoBlack });
  const head = prism(PLAN_HEAD, HEAD_H, { y0: HEAD_Y0, rake: RAKE_HEAD, mat: hw().pianoBlack });
  g.add(bass, head);
  const gantM = hw().alu.clone(); gantM.envMapIntensity = 0.70; gantM.roughness = 0.33;
  const gant = prism(PLAN_GANT, GANT_H, { y0: GANT_Y0, corner: 0.009, bevel: 0.0016, mat: gantM });
  g.add(gant);
  const capM = hw().anodGrey.clone(); capM.color.setHex(0x2b2f34); capM.roughness = 0.56;
  capM.envMapIntensity = 0.65;
  const cap = prism(PLAN_HEAD.map(([x, z]) => [x * 0.965, z * 0.965]), 0.008,
    { y0: HEAD_Y0 + HEAD_H - 0.0035, rake: RAKE_HEAD, corner: 0.006, bevel: 0.0014, mat: capM });
  cap.position.z = -HEAD_H * Math.tan(RAKE_HEAD);
  g.add(cap);

  // --- baffles + drivers, in the raked baffle plane ---------------------------
  /*
   * The baffle is NOT the gloss lacquer. A mirror-finish panel normal to the
   * camera reflects the studio's front softbox straight down the lens and goes
   * to paper white, which is what buried the drivers. Real cabinets of this
   * idiom use a dense mineral-loaded composite for the baffle — matte, slightly
   * waxy — so the gloss reads only on the curved flanks where it belongs.
   */
  const baffleMat = hw().plastic.clone();
  baffleMat.color.setHex(0x0d0f12); baffleMat.roughness = 0.63;
  baffleMat.clearcoat = 0.22; baffleMat.clearcoatRoughness = 0.48;
  baffleMat.envMapIntensity = 0.45;
  // The weave map on coneWeave multiplies down to near-black at this size; drop
  // it and let the sheen carry the rim-to-apex value change on the cone wall.
  const bassCone = hw().coneWeave.clone();
  bassCone.map = null;
  bassCone.color.setHex(0x353a41);
  bassCone.roughness = 0.72; bassCone.clearcoat = 0.10; bassCone.clearcoatRoughness = 0.5;
  bassCone.envMapIntensity = 0.50; bassCone.specularIntensity = 0.16;
  bassCone.sheen = 0.60; bassCone.sheenRoughness = 0.72;
  bassCone.sheenColor = new THREE.Color(0x4b525c);
  const midCone = hw().cone.clone();
  midCone.color.setHex(0x2c3036); midCone.envMapIntensity = 0.5;
  midCone.roughness = 0.80; midCone.specularIntensity = 0.22;
  midCone.sheen = 0.60; midCone.sheenColor = new THREE.Color(0x454b55);

  const ycB = BASS_Y0 + BASS_H / 2;
  const bg = new THREE.Group();
  bg.position.set(0, ycB, zBass(ycB));
  bg.rotation.x = -RAKE_BASS;
  g.add(bg);
  const bPlate = bafflePlate(W_BB, BASS_H - 0.007, T_BB,
    [[0, W_LO_Y - ycB, 0.113], [0, W_HI_Y - ycB, 0.113]], baffleMat);
  bg.add(bPlate);

  const ycH = HEAD_Y0 + HEAD_H / 2;
  const hg = new THREE.Group();
  hg.position.set(0, ycH, zHead(ycH));
  hg.rotation.x = -RAKE_HEAD;
  g.add(hg);
  hg.add(bafflePlate(W_HB, HEAD_H - 0.007, T_HB,
    [[0, MID_Y - ycH, 0.0724], [0, TW_Y - ycH, 0.0405]], baffleMat));

  const wOpt = { rEff: 0.105, surroundW: 0.020, flangeR: 0.122, depth: 0.045, bolts: 8, dust: 0.041, coneMat: bassCone };
  const wLo = makeDriver(wOpt); wLo.position.set(0, W_LO_Y - ycB, 0.0012); bg.add(wLo);
  const wHi = makeDriver(wOpt); wHi.position.set(0, W_HI_Y - ycB, 0.0012); bg.add(wHi);
  const mid = makeDriver({ rEff: 0.068, surroundW: 0.013, flangeR: 0.089, depth: 0.038, bolts: 6, plug: 0.017, motorR: 0.050, coilR: 0.019, boltR: 0.0030, coneMat: midCone });
  mid.position.set(0, MID_Y - ycH, 0.0010); hg.add(mid);
  const tw = makeTweeter(); tw.position.set(0, TW_Y - ycH, 0.0008); hg.add(tw);

  // --- rear alloy terminal / resistor panel -----------------------------------
  const rear = new THREE.Group();
  const ry = 0.315, rz = -0.245 - (ry - BASS_Y0) * Math.tan(RAKE_BASS);
  rear.position.set(0, ry, rz - 0.004);
  rear.rotation.set(-RAKE_BASS, Math.PI, 0);
  const plate = new THREE.Mesh(GEO.bevelBox(0.166, 0.215, 0.009, 0.0016, 3), hw().alu);
  plate.castShadow = plate.receiveShadow = true;
  rear.add(plate);
  const inset = new THREE.Mesh(GEO.bevelBox(0.140, 0.086, 0.004, 0.0012, 2), hw().anodBlack);
  inset.position.set(0, 0.055, 0.005);
  rear.add(inset);
  for (const [x, y, c] of [[-0.040, -0.030, 0xd94b3a], [0.040, -0.030, 0x1b1d21], [-0.040, -0.078, 0xd94b3a], [0.040, -0.078, 0x1b1d21]]) {
    const bp = GEO.bindingPost({ colour: c });
    bp.position.set(x, y, 0.0045);
    rear.add(bp);
  }
  for (const x of [-0.038, 0.038]) {
    const puck = new THREE.Mesh(GEO.bevelCyl(0.0115, 0.0125, 0.030, 32, 0.0008), hw().plastic);
    puck.rotation.x = Math.PI / 2;
    puck.position.set(x, 0.055, 0.020);
    puck.castShadow = true;
    rear.add(puck);
    const capN = new THREE.Mesh(GEO.bevelCyl(0.0105, 0.0105, 0.005, 32, 0.0006), hw().alu);
    capN.rotation.x = Math.PI / 2;
    capN.position.set(x, 0.055, 0.037);
    rear.add(capN);
  }
  GEO.screwRow(rear, [[-0.072, 0.098], [0.072, 0.098], [-0.072, -0.098], [0.072, -0.098]], 0.0052, 0.0022);
  GEO.shadowed(rear);
  g.add(rear);

  // --- badge -------------------------------------------------------------------
  const badge = new THREE.Mesh(GEO.bevelCyl(0.0155, 0.0155, 0.0022, 40, 0.0005), hw().alu);
  badge.rotation.x = Math.PI / 2 - RAKE_BASS;
  badge.position.set(0, 0.118, zBass(0.118) + 0.0006);
  g.add(badge);

  g.add(GEO.contactShadow(0.92, 1.05, 0.80));
  g.userData = { wLo, wHi, mid, tw };
  return g;
}

// ===========================================================================
// Overlay helpers
// ===========================================================================

/** Filled section block in the local (x = axial, y = radial) cut plane. */
function slab(ax0, ax1, ay0, ay1, mat, d = 0.006) {
  const x0 = Math.min(ax0, ax1), x1 = Math.max(ax0, ax1);
  const y0 = Math.min(ay0, ay1), y1 = Math.max(ay0, ay1);
  const g = new THREE.ExtrudeGeometry(roundedShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 0.0013), {
    depth: d, bevelEnabled: true, bevelSize: 0.0010, bevelThickness: 0.0009, bevelSegments: 3, curveSegments: 4, steps: 1,
  });
  g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  return m;
}

/** Sampler for a polyline path. */
function polyPath(pts) {
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const total = cum[cum.length - 1];
  return {
    P, total,
    at(s, out) {
      s = ((s % total) + total) % total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      return out.lerpVectors(P[i - 1], P[i], t);
    },
  };
}

/** ⊗ / ⊙ current-direction marker pair. */
function polarityMark(r = 0.0058, color = PAL.am) {
  const g = new THREE.Group();
  const mk = (o) => { o.renderOrder = 18; return o; };
  const rim = mk(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.15, 8, 24),
    new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true })));
  g.add(rim);
  const cross = new THREE.Group();
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const b = mk(new THREE.Mesh(new THREE.PlaneGeometry(r * 1.42, r * 0.24),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true })));
    b.rotation.z = a;
    cross.add(b);
  }
  const dot = mk(new THREE.Mesh(new THREE.CircleGeometry(r * 0.34, 14),
    new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true })));
  g.add(cross, dot);
  g.userData.setInto = (into) => { cross.visible = into; dot.visible = !into; };
  g.userData.setInto(true);
  return g;
}

// ===========================================================================
// Motor section — an engineering cut in a plane that faces the stage camera.
// Local frame: +x = the driver axis (front to the right), +y = radial.
// ===========================================================================

const R_POLE = 0.0234, R_FIN = 0.0242, R_FOUT = 0.0247, R_WIND = 0.0268;
const R_TIN = 0.0276, R_MAG = 0.0316, R_OUT = 0.075;
const X_BACK0 = -0.0585, X_BACK1 = -0.0495, X_TOP0 = -0.0285, X_TOP1 = -0.0200;
const X_GAPC = (X_TOP0 + X_TOP1) / 2;
const R_COIL = (R_FOUT + R_WIND) / 2;

function buildSection() {
  const g = new THREE.Group();

  /*
   * Section materials.
   *
   * `steel` and `lamination` both carry roughnessMap = anodisedRough(512), and
   * slab() is an ExtrudeGeometry whose WorldUVGenerator emits UVs in METRES —
   * so a 21 mm magnet block samples ~2 % of the noise texture and magnifies a
   * single blotch across the whole part. Null the map and let the geometry's
   * broken edges and the section lamp do the work instead.
   */
  const st = hw().steel.clone();                            // machined low-carbon steel
  st.roughnessMap = null; st.normalMap = null;
  st.color.setHex(0x6e757e); st.roughness = 0.34; st.metalness = 1.0; st.envMapIntensity = 0.80;
  const mg = hw().lamination.clone();                       // sintered ferrite ring
  mg.roughnessMap = null; mg.normalMap = null;
  mg.color.setHex(0x23272c); mg.roughness = 0.74; mg.metalness = 0.30; mg.envMapIntensity = 0.55;
  const cw = hw().magnetWire.clone();
  cw.color.setHex(0xb2632f); cw.roughness = 0.24; cw.envMapIntensity = 1.0;
  const pl = hw().plastic.clone(); pl.color.setHex(0x24282e); pl.envMapIntensity = 0.4;
  const cn = hw().coneWeave.clone();
  cn.map = null; cn.color.setHex(0x272b31); cn.metalness = 0.0; cn.roughness = 0.70;
  cn.clearcoat = 0.10; cn.clearcoatRoughness = 0.5; cn.envMapIntensity = 0.40;

  const card = DIAG.diagramCard(0.140, 0.208, { opacity: 0.90, pad: 0.007 });
  card.position.set(-0.0655, -0.104, -0.018);
  g.add(card);

  // --- the magnetic circuit, in section ---------------------------------------
  g.add(slab(X_BACK0, X_BACK1, -R_OUT, R_OUT, st, 0.011));            // back plate
  g.add(slab(X_BACK1, -0.0125, -R_POLE, R_POLE, st, 0.011));          // pole piece
  for (const s of [1, -1]) {
    g.add(slab(X_BACK1, X_TOP0, s * R_MAG, s * R_OUT, mg, 0.011));    // ring magnet
    g.add(slab(X_TOP0, X_TOP1, s * R_TIN, s * R_OUT * 0.955, st, 0.011)); // top plate
  }

  // hairline outlines: without them the gap slot vanishes at this scale
  const OUT = 0x9aa3ae;
  const box = (x0, x1, y0, y1, w = 1.0, o = 0.55, col = OUT) => {
    const t = new DIAG.Trace(5, col, w, { opacity: o, renderOrder: 12 });
    const P = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    t.write((i) => [P[i][0], P[i][1], 0.0075]);
    g.add(t);
    return t;
  };
  box(X_BACK0, X_BACK1, -R_OUT, R_OUT);
  box(X_BACK1, -0.0125, -R_POLE, R_POLE);
  for (const s of [1, -1]) {
    box(X_BACK1, X_TOP0, s * R_MAG, s * R_OUT);
    box(X_TOP0, X_TOP1, s * R_TIN, s * R_OUT * 0.955);
  }

  // --- moving assembly: former, winding, cone neck -----------------------------
  const mov = new THREE.Group();
  for (const s of [1, -1]) {
    mov.add(slab(X_GAPC - H_COIL / 2, X_GAPC + H_COIL / 2, s * R_FOUT, s * R_WIND, cw, 0.012));
    mov.add(slab(X_GAPC - H_COIL / 2, 0.0020, s * R_FIN, s * R_FOUT, pl, 0.010));
    const q = [[-0.0020, R_FOUT], [0.0024, R_FOUT], [0.0318, 0.0520], [0.0274, 0.0520]]
      .map(([u, v]) => [u, s * v]);
    if (s < 0) q.reverse();
    const neck = new THREE.ExtrudeGeometry(roundedShape(q, 0.0009),
      { depth: 0.009, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 2, curveSegments: 3, steps: 1 });
    neck.translate(0, 0, -0.0045);
    const nm = new THREE.Mesh(neck, cn);
    nm.renderOrder = 3;
    mov.add(nm);
  }
  // bright outline on the two coil sections, so the coil is unmistakable
  for (const s of [1, -1]) {
    const t = new DIAG.Trace(5, PAL.am, 1.8, { opacity: 0.95, renderOrder: 15 });
    const P = [[X_GAPC - H_COIL / 2, s * R_FOUT], [X_GAPC + H_COIL / 2, s * R_FOUT],
      [X_GAPC + H_COIL / 2, s * R_WIND], [X_GAPC - H_COIL / 2, s * R_WIND], [X_GAPC - H_COIL / 2, s * R_FOUT]];
    t.write((i) => [P[i][0], P[i][1], 0.0090]);
    mov.add(t);
  }
  g.add(mov);

  // --- the magnetic circuit is a closed loop too -------------------------------
  for (const s of [1, -1]) {
    const K = [[-0.0535, s * 0.0110], [-0.0535, s * 0.0520], [-0.0400, s * 0.0560],
      [-0.0243, s * 0.0520], [-0.0243, s * 0.0295], [-0.0243, s * 0.0180],
      [-0.0330, s * 0.0110], [-0.0450, s * 0.0100], [-0.0535, s * 0.0110]];
    const t = new DIAG.Trace(K.length, PAL.cy, 1.4, { opacity: 0.42, renderOrder: 11 });
    t.write((i) => [K[i][0], K[i][1], 0.0082]);
    g.add(t);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.0026, 0.0068, 10),
      new THREE.MeshBasicMaterial({ color: PAL.cy, toneMapped: false, transparent: true, opacity: 0.70 }));
    head.position.set(-0.0243, s * 0.0255, 0.0082);
    head.rotation.z = s > 0 ? Math.PI : 0;          // flux crosses the gap radially inward
    g.add(head);
  }

  // --- suspension: spider (compliance) and its loss (damping) ------------------
  const spider = new DIAG.Trace(44, PAL.amDim, 1.5, { opacity: 0.55, renderOrder: 11 });
  const spider2 = new DIAG.Trace(44, PAL.amDim, 1.5, { opacity: 0.55, renderOrder: 11 });
  g.add(spider, spider2);

  // --- the circuit, drawn as one closed loop -----------------------------------
  const LOOP = [];
  const yT = 0.086, xT = 0.048, xAmp = 0.066, zL = 0.015;
  LOOP.push([xT, yT, zL], [0.006, yT, zL], [-0.024, 0.040, 0.008], [-0.024, R_COIL, 0.0]);
  for (let i = 1; i <= 14; i++) {
    const a = Math.PI * (i / 14);
    LOOP.push([-0.024, R_COIL * Math.cos(a), R_COIL * Math.sin(a)]);
  }
  LOOP.push([-0.024, -0.040, 0.008], [0.006, -yT, zL], [xT, -yT, zL],
    [xAmp, -yT, zL], [xAmp, yT, zL], [xT, yT, zL]);
  const path = polyPath(LOOP);
  const wire = new DIAG.Trace(LOOP.length, PAL.amDim, 2.0, { opacity: 0.75 });
  wire.write((i) => LOOP[i]);
  g.add(wire);

  const carriers = new DIAG.Swarm(90, { color: PAL.am, size: 0.0021 });
  g.add(carriers);

  for (const sy of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 18),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, opacity: 0.9 }));
    post.position.set(xT, sy * yT, zL + 0.001);
    post.renderOrder = 15;
    g.add(post);
  }
  const flow = [];
  for (const sAt of [0.14, 0.40, 0.62, 0.88]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.0030, 0.0080, 10),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, opacity: 0.9 }));
    h.renderOrder = 16;
    h.userData.s = sAt * path.total;
    g.add(h);
    flow.push(h);
  }

  const markT = polarityMark(); const markB = polarityMark();
  markT.position.set(-0.024, R_COIL + 0.0132, 0.011);
  markB.position.set(-0.024, -R_COIL - 0.0132, 0.011);
  g.add(markT, markB);

  /*
   * Force vector. It is drawn FROM the coil — origin at X_GAPC + x(t), just
   * clear of the winding — so it reads as F = Bl·i acting on the moving
   * assembly, not as free-floating interface chrome. Its caption label is
   * anchored directly above it.
   */
  const ARR = 0xc6cdd6;
  const fArrow = new DIAG.Trace(2, ARR, 2.6, { opacity: 0.95, renderOrder: 16 });
  const fHead = new THREE.Mesh(new THREE.ConeGeometry(0.0038, 0.0098, 14),
    new THREE.MeshBasicMaterial({ color: ARR, toneMapped: false, transparent: true }));
  fHead.renderOrder = 16;
  g.add(fArrow, fHead);

  const dim = DIAG.dimension([-X30, -0.094, 0.006], [X30, -0.094, 0.006], { color: PAL.cy, head: 0.010 });
  g.add(dim);
  // Xmax gate: two hairlines at the coil's linear limit, so live travel has a ruler
  for (const s of [1, -1]) {
    const t = new DIAG.Trace(2, PAL.amDim, 1.2, { opacity: 0.75, renderOrder: 13 });
    t.write((i) => [X_GAPC + s * TS.Xmax, -0.088 - i * 0.014, 0.006]);
    g.add(t);
  }
  const rule = new DIAG.Trace(2, PAL.amDim, 1.0, { opacity: 0.5, renderOrder: 13 });
  rule.write((i) => [X_GAPC + (i ? 1 : -1) * TS.Xmax, -0.1015, 0.006]);
  g.add(rule);

  g.userData = { mov, carriers, path, markT, markB, fArrow, fHead, dim, spider, spider2, wire, flow };
  return g;
}

// ===========================================================================
// Framing
//
// The clear stage is 960 x 840 px inside a 1600 x 1000 canvas. The cabinet is
// the hero: it is framed to 63 % of the safe-box height and pushed left of the
// optical centre, leaving a clean column on its right for exactly two overlay
// cards. Nothing else is allowed into the frame.
// ===========================================================================

const CAB = [LAYOUT.speakerL.x, 0.655, LAYOUT.speakerL.z];
const AZ = 0.40, EL = 0.045, FOV = 35;
const RGT = [Math.cos(AZ), 0, -Math.sin(AZ)];       // screen-right, in world
// NB: the Director already offsets the principal point for the safe box; this is
// only the small extra truck that opens a card column, NOT the whole safe-box
// correction. Compounding the two put the cabinet off-frame.
const SHIFT = 0.145;                                // metres of lateral look-at offset
const _fs = frameShot(CAB, 0.66, { fill: 0.60, az: AZ, el: EL, fov: FOV });
const SHOT = {
  position: _fs.position.map((v, i) => v + SHIFT * RGT[i]),
  target: _fs.target.map((v, i) => v + SHIFT * RGT[i]),
  fov: FOV,
};

const CAMV = new THREE.Vector3(...SHOT.position);
const TGTV = new THREE.Vector3(...SHOT.target);
const FWD = TGTV.clone().sub(CAMV).normalize();
const RIGHTV = new THREE.Vector3(RGT[0], 0, RGT[2]);
const UPV = new THREE.Vector3().crossVectors(RIGHTV, FWD).normalize();
/** Metres per device pixel at a given distance, for a 1000 px-high canvas. */
const mPerPx = (d) => (d * Math.tan((FOV * Math.PI) / 360)) / 500;
/** World point that lands dx px right and dy px below the safe-box centre. */
function screenPt(dx, dy, dist) {
  const k = mPerPx(dist);
  return CAMV.clone().addScaledVector(FWD, dist)
    .addScaledVector(RIGHTV, dx * k)
    .addScaledVector(UPV, -dy * k);
}

const SEC_D = 2.70, GRA_D = 2.10;
const SEC_C = screenPt(205, -190, SEC_D);        // motor cutaway card, screen ~(845, 310)
const GRA_C = screenPt(205, 210, GRA_D);         // graph card,          screen ~(845, 710)
const SEC_S = (400 * mPerPx(SEC_D)) / 0.222;     // card 400 px tall
const GRA_S = (372 * mPerPx(GRA_D)) / 0.640;     // card 372 px wide

/** Orient a flat XY group so it squarely faces the stage camera. */
const _mLook = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
function faceCamera(obj) {
  _mLook.lookAt(CAMV, obj.position, _up);
  obj.quaternion.setFromRotationMatrix(_mLook);
}

/**
 * DIAG.fadeTree records a per-mesh base opacity by reading material.opacity the
 * first time it runs — which is *after* it has already zeroed a shared material
 * for an earlier mesh, so every later sharer latches a base of 0 and never
 * reappears. Seeding the value up front makes the tree fade correctly.
 */
function seedOpacity(root) {
  root.traverse((c) => {
    if ((c.isMesh || c.isSprite || c.isLine || c.isPoints) && c.material && c.userData._baseOp === undefined) {
      c.userData._baseOp = c.material.opacity ?? 1;
    }
  });
  return root;
}

const EXAG = 300;                        // carrier-motion magnification, stated on screen
const SWEEP_T = 0.14;                    // simulated seconds per 30↔100 Hz traverse

let S = null;

export default {
  id: 'speaker',
  title: 'Motor &amp; Cabinet',
  nav: 'Loudspeaker',
  kicker: 'Loudspeaker',
  standfirst: 'A wire in a gap, pushing 49 g of cone against 30 litres of trapped air.',
  shot: SHOT,
  timeScale: 0.02,
  alwaysUpdate: false,

  build(ctx) {
    const { THREE: T3 } = ctx;
    // ---------------- hardware ------------------------------------------------
    const hwg = new T3.Group();
    const near = makeCabinet();
    near.position.set(LAYOUT.speakerL.x, LAYOUT.speakerL.y, LAYOUT.speakerL.z);
    near.rotation.y = LAYOUT.speakerL.ry;
    const far = makeCabinet();
    far.position.set(LAYOUT.speakerR.x, LAYOUT.speakerR.y, LAYOUT.speakerR.z);
    far.rotation.y = LAYOUT.speakerR.ry;
    hwg.add(near, far);

    // ---------------- overlay -------------------------------------------------
    const ov = new T3.Group();

    // (a) the motor, opened up beside the cabinet
    const sec = buildSection();
    sec.position.copy(SEC_C).addScaledVector(RIGHTV, -0.0045 * SEC_S);
    sec.scale.setScalar(SEC_S);
    faceCamera(sec);
    ov.add(sec);
    const secLamp = new T3.PointLight(0xfff2e2, 2.4, 1.5, 2);
    secLamp.position.copy(SEC_C).addScaledVector(RIGHTV, -0.34).addScaledVector(UPV, 0.30)
      .addScaledVector(FWD, -0.40);
    ov.add(secLamp);
    const U = sec.userData;

    // dashed leader from the cutaway back to the driver it is a cut of
    const wp = new T3.Vector3(0, W_HI_Y, zBass(W_HI_Y) + 0.115);
    wp.applyAxisAngle(new T3.Vector3(0, 1, 0), near.rotation.y).add(near.position);
    const lead0 = SEC_C.clone().addScaledVector(RIGHTV, -0.150 * SEC_S / 3);
    const leader = new DIAG.Trace(2, PAL.cy, 1.1, { opacity: 0.26, dashed: true, dashSize: 0.020, gapSize: 0.016 });
    leader.write((i) => (i === 0 ? [lead0.x, lead0.y, lead0.z] : [wp.x, wp.y, wp.z]));
    ov.add(leader);

    // (b) two plots on one card: what the box does, and what it costs in travel
    const gwrap = new T3.Group();
    gwrap.position.copy(GRA_C);
    faceCamera(gwrap);
    gwrap.scale.setScalar(GRA_S);
    ov.add(gwrap);
    const inner = new T3.Group();
    inner.position.set(-0.300, -0.2525, 0);
    gwrap.add(inner);
    inner.add(DIAG.diagramCard(0.60, 0.505, { opacity: 0.90, pad: 0.020 }));

    const GW = 0.60, GH = 0.215;
    // sealed response: free air vs 30 L box, with the true 12 dB/octave asymptote
    const gR = new DIAG.Graph({
      w: GW, h: GH, xLog: true, xRange: [15, 400], yRange: [-27, 6],
      yTicks: [-24, -18, -12, -6, 0, 6], zeroLine: 0,
    });
    gR.position.set(0, 0.290, 0.001);
    inner.add(gR);
    gR.addTrace((f) => DSP.sealedResponseDb(f, TS.fs, Qts), { color: PAL.cyDim, width: 1.5, dashed: true });
    gR.addTrace((f) => 40 * Math.log10(f / AL.fc), { color: PAL.ink3, width: 1.2, dashed: true });
    gR.addTrace((f) => DSP.sealedResponseDb(f, AL.fc, AL.Qtc), { color: PAL.cy, width: 2.6 });
    gR.addMarker(AL.fc, { color: PAL.cy, opacity: 0.55 });
    const dotR = gR.addDot(PAL.am, 0.006);

    // excursion at constant SPL, one driver
    const gX = new DIAG.Graph({
      w: GW, h: GH, xLog: true, xRange: [24, 200], yRange: [0, 14], yTicks: [0, 4, 8, 12],
    });
    gX.position.set(0, 0, 0.001);
    inner.add(gX);
    gX.addBand(TS.Xmax * 1000, 14, PAL.am, 0.11);
    gX.addTrace(() => TS.Xmax * 1000, { color: PAL.am, width: 1.2, dashed: true, n: 2 });
    gX.addTrace((f) => DSP.excursionForSpl(SPL_REF, f, TS.Sd) * 1000, { color: PAL.am, width: 2.6 });
    gX.addMarker(F_XMAX, { color: PAL.am, opacity: 0.55 });
    const dotX = gX.addDot(PAL.cy, 0.006);

    const anch = (gr, gx, gy) => {
      const o = new T3.Object3D();
      o.position.set(gr.position.x + gr.x(gx), gr.position.y + gr.y(gy), 0.004);
      inner.add(o);
      return o;
    };
    const aR = anch(gR, 21, 1.5), aX = anch(gX, 88, 10.2);

    // ---------------- labels --------------------------------------------------
    const L = ctx.labels;
    const secAnchor = (x, y, z) => { const o = new T3.Object3D(); o.position.set(x, y, z || 0.012); sec.add(o); return o; };
    const BR = '<br>';
    const lF = L.add(secAnchor(X_GAPC, R_WIND + 0.021), {
      kicker: 'Motor force', text: 'F = Bl · i, on the coil' + BR, value: '0.0 N',
      cls: 'am', offset: [-40, -40], occlude: false, priority: 3,
    });
    const lC = L.add(secAnchor(0.030, 0.086), {
      kicker: 'Charge carriers', text: 'they oscillate, they never arrive' + BR,
      value: `±0 µm · drawn ×${EXAG}`, cls: 'am', offset: [96, -14], occlude: false, priority: 2,
    });
    const lI = L.add(secAnchor(-0.052, -0.030), {
      kicker: 'Voice coil', text: `${WIRE_LEN.toFixed(1)} m of 0.32 mm wire · Bl ${TS.Bl.toFixed(1)} T·m` + BR,
      value: 'i = 0.00 A', cls: 'am', offset: [-30, 26], occlude: false, priority: 2,
    });
    const lX = L.add(secAnchor(X_GAPC, -0.094, 0.008), {
      kicker: 'Cone travel', text: `Mms ${(TS.Mms * 1000).toFixed(0)} g · Cms ${(Cms * 1e6).toFixed(0)} µm/N · Xmax ${(TS.Xmax * 1000).toFixed(1)} mm` + BR,
      value: '±0.00 mm at 30.0 Hz', cls: 'acc', offset: [-70, 34], occlude: false, priority: 3,
    });
    const lR = L.add(aR, {
      kicker: 'Sealed 30 L', text: `fc ${AL.fc.toFixed(1)} Hz · Qtc ${AL.Qtc.toFixed(2)} · f₃ ${F3.toFixed(1)} Hz` + BR,
      value: '−12 dB / octave', cls: 'acc', offset: [64, 8], occlude: false, priority: 1,
    });
    const lXg = L.add(aX, {
      kicker: 'Excursion', text: '96 dB at 1 m · one driver · half space' + BR,
      value: '—', cls: 'am', offset: [26, 0], occlude: false, priority: 1,
    });

    S = {
      near, far, sec: U, gR, gX, dotR, dotX,
      labels: { lF, lI, lC, lX, lR, lXg },
      lamp: secLamp,
      woofers: [near.userData.wLo, near.userData.wHi, far.userData.wLo, far.userData.wHi],
      ph: 0, f: F_LO, x: 0, i: 0, F: 0, e: 0, xp: X30, ip: 0, Fp: 1, spl: SPL_REF, dr: 0,
      cp: new T3.Vector3(),
    };
    seedOpacity(ov);
    return { hardware: hwg, overlay: ov };
  },

  update(dt, t) {
    if (!S) return;
    // --- drive: 96 dB at 1 m from one driver, gliding between 30 and 100 Hz ----
    const u = (t / SWEEP_T) % 2;
    const tri = u < 1 ? u : 2 - u;
    const f = F_LO * Math.pow(F_HI / F_LO, DSP.smoothstep(0.10, 0.90, tri));
    S.f = f;
    const w = TAU * f;
    const xp = DSP.excursionForSpl(SPL_REF, f, TS.Sd);
    S.xp = xp;
    S.ph += w * dt;
    const sn = Math.sin(S.ph), cs = Math.cos(S.ph);

    const F = forceFor(f, xp);
    S.x = xp * sn;                                   // cone displacement, m
    S.F = F.A * sn + F.B * cs;                       // instantaneous force, N
    S.Fp = F.peak;                                   // peak force at this frequency
    S.ip = F.peak / TS.Bl;                           // peak current, A
    S.i = S.F / TS.Bl;                               // instantaneous current, A
    S.e = TS.Bl * w * xp * cs;                       // back-EMF, V
    S.spl = DSP.splFromExcursion(xp, f, TS.Sd);
    S.dr = DSP.driftDisplacement(drift(S.ip), f);    // peak carrier displacement, m

    // --- real cones move at true 1 : 1 world scale ------------------------------
    for (const d of S.woofers) d.userData.moving.position.y = d.userData.baseY + S.x;

    // --- the section (the same motion, drawn at the section's magnification) ----
    const U = S.sec;
    U.mov.position.x = S.x;
    const into = S.i >= 0;
    U.markT.userData.setInto(into);
    U.markB.userData.setInto(!into);
    // Force vector, drawn from the coil itself, just clear of the winding.
    const fl = DSP.clamp(Math.abs(S.F) / 45, 0, 1) * 0.048 + 0.003;
    const dir = S.F >= 0 ? 1 : -1;
    const x0 = X_GAPC + S.x, yA = R_WIND + 0.006;
    U.fArrow.write((i) => [i === 0 ? x0 : x0 + dir * fl, yA, 0.012]);
    U.fHead.position.set(x0 + dir * (fl + 0.005), yA, 0.012);
    U.fHead.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;

    // excursion dimension, redrawn to the live peak
    const dm = U.dim.children;
    dm[0].write((i) => [(i === 0 ? -1 : 1) * xp, -0.094, 0.006]);
    dm[1].position.x = -xp + 0.005;
    dm[2].position.x = xp - 0.005;

    // spider: corrugated, inner end tied to the moving former
    const spid = (tr, sg) => tr.write((i, u2) => {
      const y = sg * (R_FIN + u2 * (R_OUT * 0.70 - R_FIN));
      const bx = -0.0042 + (1 - u2) * S.x + Math.sin(u2 * Math.PI * 6) * 0.0018;
      return [bx, y, 0.0086];
    });
    spid(U.spider, 1); spid(U.spider2, -1);

    // --- carriers: true drift, magnified by a stated factor ---------------------
    const amp = S.dr * EXAG * sn;
    const step = U.path.total / U.carriers.count;
    U.carriers.update((i) => {
      U.path.at(i * step + amp, S.cp);
      return { p: [S.cp.x, S.cp.y, S.cp.z], s: 1 };
    });
    const sgn = S.i >= 0 ? 1 : -1;
    for (const h of U.flow) {
      U.path.at(h.userData.s, S.cp);
      h.position.copy(S.cp);
      U.path.at(h.userData.s + sgn * 0.004, S.cp);
      const d = S.cp.clone().sub(h.position);
      if (d.lengthSq() > 1e-9) h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      h.material.opacity = 0.25 + 0.65 * Math.abs(S.i) / Math.max(S.ip, 1e-6);
    }
    U.wire.material.opacity = 0.35 + 0.45 * (0.45 + 0.55 * Math.abs(S.i) / Math.max(S.ip, 1e-6));

    // --- graphs ------------------------------------------------------------------
    S.dotR.userData.setData(f, DSP.sealedResponseDb(f, AL.fc, AL.Qtc));
    S.dotX.userData.setData(f, xp * 1000);

    // --- labels ------------------------------------------------------------------
    const Lb = S.labels;
    Lb.lF.setValue(`${S.F >= 0 ? '+' : '−'}${Math.abs(S.F).toFixed(1)} N`);
    Lb.lI.setValue(`i = ${S.i >= 0 ? '+' : '−'}${Math.abs(S.i).toFixed(2)} A`);
    Lb.lC.setValue(`±${(S.dr * 1e6).toFixed(1)} µm · drawn ×${EXAG}`);
    Lb.lX.setValue(`±${(xp * 1000).toFixed(2)} mm at ${f.toFixed(1)} Hz`);
    Lb.lXg.setValue(`${(xp * 1000).toFixed(2)} mm at ${f.toFixed(0)} Hz`);
  },

  setReveal(k) {
    if (!S) return;
    S.lamp.intensity = 2.4 * k;
  },

  content() {
    return `
<h3>The motor</h3>
<div class="key"><span class="lab">The idea</span><p>The coil turns current into
force and velocity back into voltage with the same constant, <b>Bl</b>.
Everything else on this page is a consequence of that one number.</p></div>
<p><span class="num">${WIRE_LEN.toFixed(1)} m</span> of 0.32 mm copper hangs in a radial gap of
<span class="num">${B_GAP.toFixed(2)} T</span>. Only the <span class="num">${L_IN_GAP.toFixed(1)} m</span>
inside the ${(H_GAP * 1000).toFixed(1)} mm gap does any work, so Bl = ${TS.Bl.toFixed(1)} T·m.</p>
<div class="eq">F = Bl · i        e = Bl · v
at ${F_LO} Hz, ${SPL_REF} dB:  F̂ = <span class="hl">${F30.toFixed(1)} N</span>
   so  î = F̂/Bl = <span class="hl">${I30.toFixed(2)} A</span></div>
<p>The current is a <b>loop</b>: in on one tinsel lead, ${N_TURNS.toFixed(0)} turns round the
former, out on the other, back to the amplifier. Nothing travels down it. At
${F_LO} Hz the carriers oscillate about a fixed point with a peak displacement of
<span class="num">${(DR30 * 1e6).toFixed(1)} µm</span>, while the cone they drive moves
<span class="num">${(X30 * 1000).toFixed(2)} mm</span> — <span class="num">${(X30 / DR30).toFixed(0)}×</span>
further. The field that carries the energy fills the whole winding in
<span class="num">${(T_FILL * 1e9).toFixed(0)} ns</span>.</p>

<h3>The cabinet</h3>
<p>Measured: fs <span class="num">${TS.fs.toFixed(1)} Hz</span>, Mms
<span class="num">${(TS.Mms * 1000).toFixed(0)} g</span>, Re <span class="num">${TS.Re.toFixed(1)} Ω</span>,
Qms <span class="num">${TS.Qms.toFixed(1)}</span>, Sd <span class="num">${TS.Sd.toFixed(4)} m²</span>.
Thirty litres of trapped air stiffens the suspension:</p>
<div class="eq">Vas = ρc²·Sd²·Cms = ${(Vas * 1000).toFixed(0)} L
α   = Vas/Vb = ${(Vas * 1000).toFixed(0)}/30 = ${AL.alpha.toFixed(2)}
fc  = fs·√(α+1) = <span class="hl">${AL.fc.toFixed(1)} Hz</span>
Qtc = ${AL.Qtc.toFixed(3)}   f₃ = ${F3.toFixed(1)} Hz   |Z|max ${ZMAX.toFixed(0)} Ω
η₀  = ${(ETA0 * 100).toFixed(2)} % <span class="c">→ ${SENS.toFixed(1)} dB, 2.83 V, 1 m</span></div>
<div class="myth"><span class="lab">Commonly got wrong</span><p>A sealed box rolls off at
<b>12 dB/octave</b>, not 24. It is second order: one moving mass, one compliance
of suspension plus trapped air.</p></div>

<h3>Why bass is hard</h3>
<p>Far-field pressure follows volume <em>acceleration</em>,
p = ρ·Sd·ω²·x̂/(2√2·π·r), so holding SPL constant forces <b>x ∝ 1/f²</b>. One
driver at ${SPL_REF} dB, 1 m, half space needs <span class="num">${(X30 * 1000).toFixed(2)} mm</span>
at ${F_LO} Hz but <span class="num">${(X100 * 1000).toFixed(2)} mm</span> at ${F_HI} Hz — a factor of
<span class="num">${(X30 / X100).toFixed(1)}</span>, exactly (100/30)². Xmax is
(${(H_COIL * 1000).toFixed(1)} − ${(H_GAP * 1000).toFixed(1)})/2 =
<span class="num">${(XMAX_CHK * 1000).toFixed(1)} mm</span>, so below
<span class="num">${F_XMAX.toFixed(1)} Hz</span> it runs out of travel. All four woofers
here move together; every figure on screen is for one of them.</p>`;
  },

  readouts() {
    const s = S || { i: 0, F: 0, x: 0, e: 0, xp: 0, spl: SPL_REF, f: F_LO, ip: 1, Fp: 1 };
    return [
      { k: 'DRIVE', v: s.f.toFixed(1), u: 'Hz' },
      { k: 'COIL I', v: (s.i >= 0 ? '+' : '−') + Math.abs(s.i).toFixed(2), u: 'A', cls: 'am', bar: Math.abs(s.i) / Math.max(s.ip, 1e-6) },
      { k: 'FORCE', v: (s.F >= 0 ? '+' : '−') + Math.abs(s.F).toFixed(1), u: 'N', cls: 'am', bar: Math.abs(s.F) / Math.max(s.Fp, 1e-6) },
      { k: 'BACK-EMF', v: (s.e >= 0 ? '+' : '−') + Math.abs(s.e).toFixed(1), u: 'V', cls: 'acc' },
      { k: 'CONE X', v: (s.x * 1000).toFixed(2), u: 'mm', cls: 'acc', bar: Math.abs(s.x) / TS.Xmax },
      { k: 'SPL @ 1 m', v: s.spl.toFixed(1), u: 'dB · 1 drv, 2π', cls: 'acc' },
    ];
  },
};
