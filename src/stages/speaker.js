import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   MOTOR & CABINET  —  two floorstanders, one of them cut open.

   Every number below is derived from six measured primaries and the physical
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
const Rms = (ws * TS.Mms) / TS.Qms;                        // 2.053 N·s/m
const Qes = (ws * TS.Mms * TS.Re) / (TS.Bl * TS.Bl);       // 0.3712
const Qts = (TS.Qms * Qes) / (TS.Qms + Qes);               // 0.3410
const RHOC2 = DSP.RHO_AIR * DSP.C_SOUND_20C * DSP.C_SOUND_20C;
const Vas = RHOC2 * TS.Sd * TS.Sd * Cms;                   // 0.1120 m³ = 112 L
const Vb = 0.030;                                          // 30 L sealed chamber, one per woofer
const AL = DSP.sealedAlignment({ fs: TS.fs, Qts, Vas }, Vb); // {alpha, fc, Qtc}
const Kbox = Kms * (1 + AL.alpha);                         // box-stiffened suspension
const Res = (TS.Bl * TS.Bl) / Rms;                         // motional resistance at resonance, Ω
const Qmc = TS.Qms * Math.sqrt(AL.alpha + 1);              // mechanical Q in the box

/**
 * −3 dB corner of the sealed 2nd-order high-pass, in closed form.
 * |H|² = u²/((1−u)² + u/Qtc²) = ½ with u = (f/fc)²  ⇒  u² + (2 − 1/Qtc²)·u − 1 = 0.
 * Qtc > 1/√2 puts f₃ below fc; Qtc = 1/√2 (Butterworth) puts it exactly at fc.
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
const P_283 = (2.83 * 2.83) / TS.Re;                       // 1.292 W into 6.2 Ω
const SENS = SPL_1W + 10 * Math.log10(ETA0) + 10 * Math.log10(P_283);
const P_AC_283 = ETA0 * P_283;                             // acoustic watts out of 2.83 V

/** Voice coil: 0.32 mm Ø enamelled copper, overhung in an 8.5 mm gap. */
const WIRE_MM2 = Math.PI * Math.pow(0.32 / 2, 2);          // 0.08042 mm²
const WIRE_LEN = (TS.Re * WIRE_MM2 * 1e-6) / 1.72e-8;      // ρ_Cu = 1.72e-8 Ω·m → 29.0 m
const H_GAP = 0.0085, H_COIL = 0.0245;                     // gap and winding heights
const XMAX_CHK = (H_COIL - H_GAP) / 2;                      // = 8.0 mm — matches TS.Xmax
const L_IN_GAP = WIRE_LEN * (H_GAP / H_COIL);              // 10.06 m of wire is in the field
const B_GAP = TS.Bl / L_IN_GAP;                            // 1.19 T — a good ferrite gap
const N_TURNS = WIRE_LEN / (TAU * 0.0254);                 // 25.4 mm coil radius → 182 turns
const V_SIG = DSP.signalSpeed(0.66);                       // field/energy speed in the winding
const T_FILL = WIRE_LEN / V_SIG;                           // ~147 ns to energise the whole coil

/** Reference drive level for the whole overlay. */
const SPL_REF = 96;                                        // dB at 1 m, half space, ONE driver
const F_LO = 30, F_HI = 100;                               // the two mandated comparison points
const X30 = DSP.excursionForSpl(SPL_REF, F_LO, TS.Sd);     // 7.574 mm peak
const X100 = DSP.excursionForSpl(SPL_REF, F_HI, TS.Sd);    // 0.682 mm peak
/** Lowest frequency this driver can reach SPL_REF before hitting Xmax. */
const F_XMAX = F_LO * Math.sqrt(X30 / TS.Xmax);

/** Electron drift in the coil at a stated peak current. */
const drift = (i) => DSP.driftVelocity(i, WIRE_MM2);

/** Magnitude of the mechanical driving-point force for a peak displacement. */
function forceFor(f, xp) {
  const w = TAU * f;
  const A = (Kbox - w * w * TS.Mms) * xp;                  // stiffness − inertia, in phase with x
  const B = Rms * w * xp;                                  // damping, in quadrature
  return { A, B, peak: Math.hypot(A, B) };
}

/** |Z| of the driver: Re + jωLe in series with the parallel motional RLC. */
function impedance(f, f0, Qm) {
  const w = TAU * f;
  const zm = DSP.cDiv([Res, 0], [1, Qm * (f / f0 - f0 / f)]);
  return DSP.cAbs(DSP.cAdd([TS.Re, w * TS.Le], zm));
}


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
    rEff, surroundW, flangeR, depth, bolts = 8, dust = 0, plug = 0,
    coneMat = hw().cone, motorR = 0.075, motorMat = hw().anodBlack, coilR = 0.025,
  } = o;
  const rOuter = rEff + surroundW / 2;
  const rc = rOuter - surroundW;
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
  const trimM = hw().anodGrey.clone(); trimM.roughness = 0.55; trimM.envMapIntensity = 0.8;
  const trim = ring(flangeR - 0.0035, flangeR, 0.0022, trimM, 0.0005);
  trim.position.y = 0.0018;
  inner.add(trim);
  const boltR = (rOuter + flangeR) / 2;
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * TAU + Math.PI / bolts;
    const s = GEO.screw(0.0026, { mat: hw().steel });
    s.rotation.x = 0;
    s.position.set(Math.sin(a) * boltR, 0.0022, Math.cos(a) * boltR);
    inner.add(s);
  }

  // --- moving assembly: cone + roll surround + dust cap -----------------------
  const moving = new THREE.Group();
  // The half-roll surround peaks surroundW*0.46 above the rim plane; sink the
  // whole moving assembly by that much so the roll sits flush with the flange.
  const baseY = -surroundW * 0.46;
  moving.position.y = baseY;
  const surrMat = hw().rubber.clone();
  surrMat.color.setHex(0x1a1d21);
  surrMat.roughness = 0.84; surrMat.sheen = 0.42; surrMat.sheenRoughness = 0.72;
  surrMat.sheenColor = new THREE.Color(0x424a54); surrMat.envMapIntensity = 0.40;
  surrMat.specularIntensity = 0.35;
  const dustMat = hw().cone.clone();
  dustMat.color.setHex(0x33373d); dustMat.roughness = 0.96; dustMat.sheen = 0.0;
  dustMat.envMapIntensity = 0.10; dustMat.specularIntensity = 0.04;
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
  g.userData.coilY = -depth - 0.009;

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
  motor.userData.topPlate = top;
  motor.userData.pole = pole;
  inner.add(motor);
  g.userData.motor = motor;
  g.userData.motorR = motorR;
  g.userData.rEff = rEff;
  g.userData.depth = depth;

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
    const s = GEO.screw(0.0022, { mat: hw().steel });
    s.rotation.x = 0;
    s.position.set(Math.sin(a) * (faceR - 0.0042), 0.0018, Math.cos(a) * (faceR - 0.0042));
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

function makeCabinet(ghostable) {
  const g = new THREE.Group();
  const shells = [];
  const shellMat = ghostable ? hw().pianoBlack.clone() : hw().pianoBlack;
  const baffleMat = ghostable ? hw().pianoBlack.clone() : hw().pianoBlack;

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
  const bass = prism(PLAN_BASS, BASS_H, { y0: BASS_Y0, rake: RAKE_BASS, mat: shellMat });
  const head = prism(PLAN_HEAD, HEAD_H, { y0: HEAD_Y0, rake: RAKE_HEAD, mat: hw().pianoBlack });
  g.add(bass, head);
  shells.push(bass);
  const gant = prism(PLAN_GANT, GANT_H, { y0: GANT_Y0, corner: 0.009, bevel: 0.0016, mat: hw().alu });
  g.add(gant);
  const cap = prism(PLAN_HEAD.map(([x, z]) => [x * 0.965, z * 0.965]), 0.008,
    { y0: HEAD_Y0 + HEAD_H - 0.0035, rake: RAKE_HEAD, corner: 0.006, bevel: 0.0014, mat: hw().anodGrey });
  cap.position.z = -HEAD_H * Math.tan(RAKE_HEAD);
  g.add(cap);

  // --- baffles + drivers, in the raked baffle plane ---------------------------
  // The weave map on coneWeave multiplies down to near-black at this size; drop
  // it and let the sheen carry the pulp-cone read instead.
  const bassCone = hw().coneWeave.clone();
  bassCone.map = null;
  bassCone.color.setHex(0x3a3f47);
  bassCone.roughness = 0.62; bassCone.clearcoat = 0.0; bassCone.envMapIntensity = 0.45;
  bassCone.specularIntensity = 0.10; bassCone.sheen = 0.0;
  const midCone = hw().cone.clone();
  midCone.color.setHex(0x30343a); midCone.envMapIntensity = 0.5;
  midCone.roughness = 0.90; midCone.specularIntensity = 0.25;

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
    [[0, MID_Y - ycH, 0.0724], [0, TW_Y - ycH, 0.0405]], hw().pianoBlack));

  const wOpt = { rEff: 0.105, surroundW: 0.020, flangeR: 0.122, depth: 0.045, bolts: 8, dust: 0.041, coneMat: bassCone };
  const wLo = makeDriver(wOpt); wLo.position.set(0, W_LO_Y - ycB, 0.0012); bg.add(wLo);
  const wHi = makeDriver(wOpt); wHi.position.set(0, W_HI_Y - ycB, 0.0012); bg.add(wHi);
  const mid = makeDriver({ rEff: 0.068, surroundW: 0.013, flangeR: 0.089, depth: 0.038, bolts: 6, plug: 0.017, motorR: 0.050, coilR: 0.019, coneMat: midCone });
  mid.position.set(0, MID_Y - ycH, 0.0010); hg.add(mid);
  const tw = makeTweeter(); tw.position.set(0, TW_Y - ycH, 0.0008); hg.add(tw);

  // Internal bracing is drawn as a hairline in the overlay instead of solid
  // geometry: a real brace inside the ghosted box mirrors the studio
  // environment and blows out through the semi-transparent baffle.

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
  g.userData = { shells, shellMat, baffleMat, wLo, wHi, mid, tw };
  return g;
}

// ===========================================================================
// Overlay helpers
// ===========================================================================

/** Filled section block in the local (x = axial, y = radial) cut plane. */
function slab(ax0, ax1, ay0, ay1, mat, d = 0.006) {
  const x0 = Math.min(ax0, ax1), x1 = Math.max(ax0, ax1);
  const y0 = Math.min(ay0, ay1), y1 = Math.max(ay0, ay1);
  const g = new THREE.ExtrudeGeometry(roundedShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 0.0011), {
    depth: d, bevelEnabled: true, bevelSize: 0.0007, bevelThickness: 0.0007, bevelSegments: 2, curveSegments: 3, steps: 1,
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

  // Section materials: library clones lifted so a cut face reads as a drawing.
  const st = hw().steel.clone();
  st.color.setHex(0xc2c7ce); st.roughness = 0.26; st.envMapIntensity = 2.0;
  const mg = hw().lamination.clone();
  mg.color.setHex(0x565e68); mg.roughness = 0.55; mg.envMapIntensity = 1.6;
  const cw = hw().magnetWire.clone();
  cw.color.setHex(0xcb7539); cw.roughness = 0.18; cw.envMapIntensity = 1.8;
  const pl = hw().plastic.clone(); pl.color.setHex(0x2b2f36);
  const cn = hw().coneWeave.clone(); cn.color.setHex(0x373b42);

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
  const coilLine = [];
  for (const s of [1, -1]) {
    const t = new DIAG.Trace(5, PAL.am, 1.8, { opacity: 0.95, renderOrder: 15 });
    const P = [[X_GAPC - H_COIL / 2, s * R_FOUT], [X_GAPC + H_COIL / 2, s * R_FOUT],
      [X_GAPC + H_COIL / 2, s * R_WIND], [X_GAPC - H_COIL / 2, s * R_WIND], [X_GAPC - H_COIL / 2, s * R_FOUT]];
    t.write((i) => [P[i][0], P[i][1], 0.0090]);
    mov.add(t);
    coilLine.push(t);
  }
  g.add(mov);

  // --- the magnetic circuit is a closed loop too -------------------------------
  const field = [];
  for (const s of [1, -1]) {
    const K = [[-0.0535, s * 0.0110], [-0.0535, s * 0.0520], [-0.0400, s * 0.0560],
      [-0.0243, s * 0.0520], [-0.0243, s * 0.0295], [-0.0243, s * 0.0180],
      [-0.0330, s * 0.0110], [-0.0450, s * 0.0100], [-0.0535, s * 0.0110]];
    const t = new DIAG.Trace(K.length, PAL.cy, 1.4, { opacity: 0.45, renderOrder: 11 });
    t.write((i) => [K[i][0], K[i][1], 0.0082]);
    g.add(t);
    field.push(t);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.0026, 0.0068, 10),
      new THREE.MeshBasicMaterial({ color: PAL.cy, toneMapped: false, transparent: true, opacity: 0.75 }));
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

  // --- force vector and excursion callout --------------------------------------
  const ARR = 0xb9c1cb;
  const fArrow = new DIAG.Trace(2, ARR, 3.0, { opacity: 0.95, renderOrder: 16 });
  const fHead = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.0110, 14),
    new THREE.MeshBasicMaterial({ color: ARR, toneMapped: false, transparent: true }));
  fHead.renderOrder = 16;
  g.add(fArrow, fHead);

  const dim = DIAG.dimension([-X30, -0.094, 0.006], [X30, -0.094, 0.006], { color: PAL.cy, head: 0.010 });
  g.add(dim);
  // Xmax gate: two hairlines at the coil's linear limit, so the live travel has a ruler
  for (const s of [1, -1]) {
    const t = new DIAG.Trace(2, PAL.rd, 1.2, { opacity: 0.6, renderOrder: 13 });
    t.write((i) => [X_GAPC + s * TS.Xmax, -0.088 - i * 0.014, 0.006]);
    g.add(t);
  }
  const rule = new DIAG.Trace(2, PAL.rd, 1.0, { opacity: 0.35, renderOrder: 13 });
  rule.write((i) => [X_GAPC + (i ? 1 : -1) * TS.Xmax, -0.1015, 0.006]);
  g.add(rule);

  g.userData = { mov, carriers, path, markT, markB, fArrow, fHead, dim, spider, spider2, field, wire, coilLine, flow };
  return g;
}

// ===========================================================================
// Stage
// ===========================================================================

const SHOT = { position: [1.35, 1.16, 0.74], target: [-0.32, 0.70, -2.49], fov: 36 };
const SEC_POS = [-0.16, 0.86, -1.45], SEC_S = 4.0;
const PANEL_POS = [0.175, 0.88, -2.24];

/** Orient a flat XY group so it squarely faces a world point. */
const _mLook = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

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
function faceCamera(obj, camPos) {
  _mLook.lookAt(camPos, obj.position, _up);
  obj.quaternion.setFromRotationMatrix(_mLook);
}
const EXAG = 200;                        // carrier-motion magnification, stated on screen
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
    const hw = new T3.Group();
    const near = makeCabinet(true);
    near.position.set(LAYOUT.speakerL.x, LAYOUT.speakerL.y, LAYOUT.speakerL.z);
    near.rotation.y = LAYOUT.speakerL.ry;
    const far = makeCabinet(false);
    far.position.set(LAYOUT.speakerR.x, LAYOUT.speakerR.y, LAYOUT.speakerR.z);
    far.rotation.y = LAYOUT.speakerR.ry;
    hw.add(near, far);

    // ---------------- overlay -------------------------------------------------
    const ov = new T3.Group();
    const camPos = new T3.Vector3(...SHOT.position);

    // (a) the 30 L sealed chamber, drawn inside the lower bass module
    const loc = new T3.Group();
    loc.position.copy(near.position);
    loc.rotation.y = near.rotation.y;
    ov.add(loc);
    // The sealed volume is shown as a wireframe only: a translucent solid inside
    // a semi-transparent cabinet composites into a blown highlight.
    const boxPos = new T3.Vector3(0, 0.293, -0.015);
    const boxEdge = new T3.LineSegments(new T3.EdgesGeometry(new T3.BoxGeometry(0.265, 0.3145, 0.360)),
      new T3.LineBasicMaterial({ color: PAL.cy, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    boxEdge.position.copy(boxPos);
    boxEdge.renderOrder = 6;
    loc.add(boxEdge);
    // wireframe silhouette so the ghosted box still reads as a cabinet
    const yb = BASS_Y0 + 0.002, yt = BASS_Y0 + BASS_H - 0.002;
    const dz = BASS_H * Math.tan(RAKE_BASS);
    const P4 = PLAN_BASS;
    const edge = (n, fn) => { const t = new DIAG.Trace(n, PAL.ink3, 1.2, { opacity: 0.5 }); t.write(fn); loc.add(t); };
    edge(P4.length + 1, (i) => { const q = P4[i % P4.length]; return [q[0], yb, q[1]]; });
    edge(P4.length + 1, (i) => { const q = P4[i % P4.length]; return [q[0], yt, q[1] - dz]; });
    for (const q of P4) edge(2, (i) => (i === 0 ? [q[0], yb, q[1]] : [q[0], yt, q[1] - dz]));

    const boxAnchor = new T3.Object3D(); boxAnchor.position.set(-0.140, 0.36, 0.10); loc.add(boxAnchor);
    const effAnchor = new T3.Object3D(); effAnchor.position.set(-0.13, 1.06, 0.10); loc.add(effAnchor);

    // (b) motor section
    const sec = buildSection();
    sec.position.set(...SEC_POS);
    sec.scale.setScalar(SEC_S);
    faceCamera(sec, camPos);
    ov.add(sec);
    const secLamp = new T3.PointLight(0xfff2e2, 1.8, 0.92, 2);
    secLamp.position.set(SEC_POS[0] - 0.16, SEC_POS[1] + 0.22, SEC_POS[2] + 0.30);
    ov.add(secLamp);
    const U = sec.userData;

    // leader line from the section back to the real upper woofer
    const wp = new T3.Vector3(0, W_HI_Y, zBass(W_HI_Y) + 0.02);
    wp.applyAxisAngle(new T3.Vector3(0, 1, 0), near.rotation.y).add(near.position);
    const leader = new DIAG.Trace(2, PAL.cy, 1.1, { opacity: 0.30, dashed: true, dashSize: 0.018, gapSize: 0.014 });
    leader.write((i) => (i === 0
      ? [SEC_POS[0] + 0.20, SEC_POS[1] + 0.30, SEC_POS[2]]
      : [wp.x, wp.y, wp.z]));
    ov.add(leader);

    // (c) diagram stack
    const panel = new T3.Group();
    panel.position.set(...PANEL_POS);
    faceCamera(panel, camPos);
    ov.add(panel);
    const inner = new T3.Group();
    inner.position.set(-0.300, -0.475, 0);
    panel.add(inner);
    inner.add(DIAG.diagramCard(0.60, 0.950, { opacity: 0.90, pad: 0.018 }));

    const GW = 0.545, GH = 0.215;
    const mkG = (opts, y) => { const g = new DIAG.Graph(Object.assign({ w: GW, h: GH, xLog: true }, opts)); g.position.set(0.028, y, 0.001); inner.add(g); return g; };

    // impedance
    const gZ = mkG({ xRange: [10, 2000], yRange: [0, 80], yTicks: [0, 20, 40, 60, 80] }, 0.680);
    gZ.addTrace((f) => impedance(f, TS.fs, TS.Qms), { color: PAL.cyDim, width: 1.6, dashed: true });
    gZ.addTrace((f) => impedance(f, AL.fc, Qmc), { color: PAL.cy, width: 2.4 });
    gZ.addTrace(() => TS.Re, { color: PAL.ink3, width: 1.0, dashed: true, n: 2 });
    gZ.addMarker(TS.fs, { color: PAL.ink3 });
    gZ.addMarker(AL.fc, { color: PAL.am });
    const dotZ = gZ.addDot(PAL.am, 0.006);

    // sealed response
    const gR = mkG({ xRange: [15, 500], yRange: [-27, 6], yTicks: [-24, -18, -12, -6, 0, 6], zeroLine: 0 }, 0.375);
    gR.addTrace((f) => DSP.sealedResponseDb(f, TS.fs, Qts), { color: PAL.cyDim, width: 1.5, dashed: true });
    gR.addTrace((f) => 40 * Math.log10(f / AL.fc), { color: PAL.am, width: 1.4, dashed: true });
    gR.addTrace((f) => DSP.sealedResponseDb(f, AL.fc, AL.Qtc), { color: PAL.cy, width: 2.6 });
    gR.addMarker(AL.fc, { color: PAL.am });
    const dotR = gR.addDot(PAL.am, 0.006);

    // excursion at constant SPL
    const gX = mkG({ xRange: [20, 200], yRange: [0, 14], yTicks: [0, 4, 8, 12] }, 0.070);
    gX.addBand(TS.Xmax * 1000, 14, PAL.rd, 0.10);
    gX.addTrace((f) => DSP.excursionForSpl(SPL_REF, f, TS.Sd) * 1000, { color: PAL.am, width: 2.6 });
    gX.addMarker(F_XMAX, { color: PAL.rd });
    const dotX = gX.addDot(PAL.cy, 0.006);

    const anch = (g, gx, gy) => { const o = new T3.Object3D(); o.position.set(g.position.x + g.x(gx), g.position.y + g.y(gy), 0); inner.add(o); return o; };
    const aZ = anch(gZ, 900, 60), aR = anch(gR, 320, -20), aX = anch(gX, 150, 4.4);

    // ---------------- labels --------------------------------------------------
    const L = ctx.labels;
    const secAnchor = (x, y, z) => { const o = new T3.Object3D(); o.position.set(x, y, z || 0); sec.add(o); return o; };
    const BR = '<br>';
    const lF = L.add(secAnchor(X_GAPC, 0.100, 0.01), { kicker: 'Motor force', text: 'F = Bl · i' + BR, value: '0.0 N', cls: 'am', offset: [0, -30] });
    const lI = L.add(secAnchor(-0.046, -0.076, 0.01), { kicker: 'Voice coil', text: `Bl 12.0 T·m in a ${B_GAP.toFixed(2)} T gap` + BR, value: 'i = 0.00 A', cls: 'am', offset: [4, 40] });
    const lC = L.add(secAnchor(0.030, 0.086, 0.02), { kicker: 'Charge carriers', text: 'oscillate — they never arrive' + BR, value: `±0 µm · shown ×${EXAG}`, cls: 'am', offset: [0, -42] });
    const lX = L.add(secAnchor(X_GAPC, -0.100, 0.01), { kicker: 'Cone travel', text: `Mms ${(TS.Mms * 1000).toFixed(0)} g · Cms ${(Cms * 1e6).toFixed(0)} µm/N · Rms ${Rms.toFixed(2)} N·s/m` + BR, value: '±0.00 mm at 30.0 Hz', cls: 'acc', offset: [0, 40] });
    const lE = L.add(secAnchor(0.057, -0.086, 0.02), { kicker: 'Back-EMF', text: 'e = Bl · v' + BR, value: '0.0 V', cls: 'acc', offset: [0, 36] });
    const lZ = L.add(aZ, { kicker: 'Impedance', text: `Zmax ${(TS.Re * (1 + TS.Qms / Qes)).toFixed(1)} Ω` + BR, value: `fs ${TS.fs.toFixed(0)} → fc ${AL.fc.toFixed(1)} Hz`, offset: [-42, 4] });
    const lR = L.add(aR, { kicker: 'Sealed 30 L', text: `fc ${AL.fc.toFixed(1)} · Qtc ${AL.Qtc.toFixed(2)} · f₃ ${F3.toFixed(1)} Hz` + BR, value: '−12 dB / octave', cls: 'acc', offset: [-48, 6] });
    const lXg = L.add(aX, { kicker: 'Excursion · 96 dB', text: 'x ∝ 1/f²' + BR, value: '—', cls: 'am', offset: [-40, 4] });
    const lB = L.add(boxAnchor, { kicker: 'Sealed chamber', text: `30 L net · Vas ${(Vas * 1000).toFixed(0)} L` + BR, value: `α = Vas/Vb = ${AL.alpha.toFixed(2)}`, offset: [-70, 6] });
    const lEf = L.add(effAnchor, { kicker: 'Efficiency', text: `${SENS.toFixed(1)} dB @ 2.83 V / 1 m` + BR, value: `η₀ = ${(ETA0 * 100).toFixed(2)} %`, cls: 'am', offset: [-82, -4] });

    S = {
      near, far, sec: U, gZ, gR, gX, dotZ, dotR, dotX,
      labels: { lF, lI, lC, lX, lE, lZ, lR, lXg, lB, lEf },
      shellMat: near.userData.shellMat,
      baffleMat: near.userData.baffleMat,
      lamp: secLamp,
      woofers: [near.userData.wLo, near.userData.wHi, far.userData.wLo, far.userData.wHi],
      ph: 0, f: F_LO, x: 0, i: 0, F: 0, e: 0, xp: X30, ip: 0, spl: SPL_REF, dr: 0,
      cp: new T3.Vector3(),
    };
    seedOpacity(ov);
    return { hardware: hw, overlay: ov };
  },

  update(dt, t) {
    if (!S) return;
    // --- drive: 96 dB at 1 m, gliding between 30 Hz and 100 Hz -----------------
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
    S.ip = F.peak / TS.Bl;                           // peak current, A
    S.i = S.F / TS.Bl;                               // instantaneous current, A
    S.e = TS.Bl * w * xp * cs;                       // back-EMF, V
    S.spl = DSP.splFromExcursion(xp, f, TS.Sd);
    S.dr = DSP.driftDisplacement(drift(S.ip), f);    // peak carrier displacement, m

    // --- real cones move at true 1 : 1 world scale ------------------------------
    for (const d of S.woofers) d.userData.moving.position.y = d.userData.baseY + S.x;

    // --- the section (a ×4 magnification of the same motion) --------------------
    const U = S.sec;
    U.mov.position.x = S.x;
    const into = S.i >= 0;
    U.markT.userData.setInto(into);
    U.markB.userData.setInto(!into);
    U.markT.position.x = X_GAPC + S.x * 0.0;         // marks stay on the gap
    const fl = DSP.clamp(Math.abs(S.F) / 45, 0, 1) * 0.085 + 0.004;
    const dir = S.F >= 0 ? 1 : -1;
    const x0 = X_GAPC + S.x;
    U.fArrow.write((i) => [i === 0 ? x0 : x0 + dir * fl, 0.092, 0.01]);
    U.fHead.position.set(x0 + dir * (fl + 0.005), 0.092, 0.01);
    U.fHead.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;

    // excursion dimension, redrawn to the live peak
    const dm = U.dim.children;
    dm[0].write((i) => [(i === 0 ? -1 : 1) * xp, -0.094, 0.006]);
    dm[1].position.x = -xp + 0.005;
    dm[2].position.x = xp - 0.005;

    // spider: corrugated, inner end tied to the moving former
    const spid = (tr, sg) => tr.write((i, u) => {
      const y = sg * (R_FIN + u * (R_OUT * 0.70 - R_FIN));
      const bx = -0.0042 + (1 - u) * S.x + Math.sin(u * Math.PI * 6) * 0.0018;
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
    const glow = 0.45 + 0.55 * Math.abs(S.i) / Math.max(S.ip, 1e-6);
    U.wire.material.opacity = 0.35 + 0.45 * glow;

    // --- graphs ------------------------------------------------------------------
    S.dotZ.userData.setData(f, impedance(f, AL.fc, Qmc));
    S.dotR.userData.setData(f, DSP.sealedResponseDb(f, AL.fc, AL.Qtc));
    S.dotX.userData.setData(f, xp * 1000);

    // --- labels ------------------------------------------------------------------
    const Lb = S.labels;
    Lb.lF.setValue(`${S.F >= 0 ? '+' : '−'}${Math.abs(S.F).toFixed(1)} N`);
    Lb.lI.setValue(`i = ${S.i >= 0 ? '+' : '−'}${Math.abs(S.i).toFixed(2)} A`);
    Lb.lC.setValue(`±${(S.dr * 1e6).toFixed(1)} µm · shown ×${EXAG}`);
    Lb.lX.setValue(`±${(xp * 1000).toFixed(2)} mm at ${f.toFixed(1)} Hz`);
    Lb.lE.setValue(`${S.e >= 0 ? '+' : '−'}${Math.abs(S.e).toFixed(1)} V`);
    Lb.lXg.setValue(`${(xp * 1000).toFixed(2)} mm at ${f.toFixed(0)} Hz`);
  },

  setReveal(k) {
    if (!S) return;
    const set = (m, o) => {
      m.opacity = o;
      const tr = o < 0.995;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.depthWrite = !tr;
      // a ghosted panel must not also blow a mirror-sharp clearcoat highlight
      m.clearcoatRoughness = 0.028 + 0.42 * k;
      m.roughness = 0.30 + 0.60 * k;
      m.clearcoat = 1 - k;
      m.envMapIntensity = 1.15 - 1.09 * k;
      m.reflectivity = 0.6 - 0.56 * k;
      m.specularIntensity = 1 - 0.92 * k;
      m.sheen = 0;
    };
    set(S.shellMat, 1 - 0.55 * k);
    set(S.baffleMat, 1 - 0.15 * k);
    for (const s of S.near.userData.shells) s.renderOrder = k > 0.005 ? 2 : 0;
    S.lamp.intensity = 1.8 * k;
  },

  content() {
    return `
<h3>The motor</h3>
<p>A coil of <span class="num">${WIRE_LEN.toFixed(1)} m</span> of 0.32 mm copper hangs in a
radial gap of <span class="num">${B_GAP.toFixed(2)} T</span>. Only the
<span class="num">${L_IN_GAP.toFixed(1)} m</span> inside the ${(H_GAP * 1000).toFixed(1)} mm gap
does any work, so <b>Bl = B·l = ${TS.Bl.toFixed(1)} T·m</b>. Force follows the current exactly:</p>
<div class="eq">F = Bl · i
  = 12.0 × 5 A  <span class="hl">= 60 N</span>
<span class="c">reverse i, and F reverses with it</span>
e = Bl · v   <span class="c">the coil is also a generator</span></div>
<p>The current is a <b>loop</b>: in one tinsel lead, ${N_TURNS.toFixed(0)} turns round the
former, out of the other, back to the amplifier. Nothing travels down it. At
${F_LO} Hz the carriers oscillate about a fixed point with a peak displacement of
<span class="num">${(DSP.driftDisplacement(drift(forceFor(F_LO, X30).peak / TS.Bl), F_LO) * 1e6).toFixed(1)} µm</span>
— while the cone they drive moves <span class="num">${(X30 * 1000).toFixed(2)} mm</span>,
some <span class="num">${(X30 / DSP.driftDisplacement(drift(forceFor(F_LO, X30).peak / TS.Bl), F_LO)).toFixed(0)}×</span> further.
The field that carries the energy fills the whole winding in
<span class="num">${(T_FILL * 1e9).toFixed(0)} ns</span>, against a ${F_LO} Hz period of
<span class="num">33.3 ms</span>.</p>

<h3>The mechanics</h3>
<p>Measured: fs <span class="num">${TS.fs.toFixed(1)} Hz</span>, Mms
<span class="num">${(TS.Mms * 1000).toFixed(0)} g</span>, Re
<span class="num">${TS.Re.toFixed(1)} Ω</span>, Qms <span class="num">${TS.Qms.toFixed(1)}</span>,
Sd <span class="num">${TS.Sd.toFixed(4)} m²</span>. Everything else follows:</p>
<div class="eq">Cms = 1/(ωs²·Mms) = <span class="hl">${(Cms * 1e6).toFixed(0)} µm/N</span>
Qes = ωs·Mms·Re/Bl²  = ${Qes.toFixed(3)}
Qts = ${Qts.toFixed(3)}   Vas = ρc²Sd²Cms = ${(Vas * 1000).toFixed(0)} L
α   = Vas/Vb = ${(Vas * 1000).toFixed(0)}/30 = ${AL.alpha.toFixed(2)}
fc  = fs·√(α+1) = <span class="hl">${AL.fc.toFixed(1)} Hz</span>
Qtc = Qts·√(α+1) = ${AL.Qtc.toFixed(3)}  <span class="c">f₃ = ${F3.toFixed(1)} Hz</span></div>
<div class="myth"><span class="lab">Commonly got wrong</span><p>A sealed box rolls off at
<b>12 dB/octave</b>, not 24. It is a second-order high-pass: two energy stores,
the moving mass and the compliance of suspension plus trapped air.</p></div>

<h3>Excursion, and why bass is hard</h3>
<p>For a given SPL the piston must displace a fixed volume of air per cycle, and
the radiated pressure goes as acceleration, so <b>x ∝ 1/f²</b>. At 96 dB and 1 m,
one of these drivers needs <span class="num">${(X30 * 1000).toFixed(2)} mm</span> at
${F_LO} Hz but only <span class="num">${(X100 * 1000).toFixed(2)} mm</span> at ${F_HI} Hz —
a factor of <span class="num">${(X30 / X100).toFixed(1)}</span>, exactly (100/30)².
Xmax is (${(H_COIL * 1000).toFixed(1)} − ${(H_GAP * 1000).toFixed(1)})/2 =
<span class="num">${(XMAX_CHK * 1000).toFixed(1)} mm</span>, so below
<span class="num">${F_XMAX.toFixed(1)} Hz</span> it simply runs out of travel.</p>

<h3>Efficiency, honestly</h3>
<div class="eq">η₀ = (4π²/c³)·fs³·Vas/Qes = <span class="hl">${(ETA0 * 100).toFixed(2)} %</span>
2.83 V into ${TS.Re.toFixed(1)} Ω = ${P_283.toFixed(2)} W electrical
    → ${(P_AC_283 * 1000).toFixed(1)} mW acoustic = ${SENS.toFixed(1)} dB @ 1 m
    → ${(100 - ETA0 * 100).toFixed(2)} % heats the voice coil</div>
<div class="key"><span class="lab">The idea</span><p>The coil converts current to force
linearly and velocity back to voltage linearly, with the same constant. A
loudspeaker is a very bad heater that leaks under one per cent of its input as
sound — and that leak is the whole point.</p></div>`;
  },

  readouts() {
    const s = S || { i: 0, F: 0, x: 0, xp: 0, spl: SPL_REF, f: F_LO, ip: 1 };
    return [
      { k: 'COIL I', v: (s.i >= 0 ? '+' : '−') + Math.abs(s.i).toFixed(2), u: 'A', cls: 'am', bar: Math.abs(s.i) / 5 },
      { k: 'FORCE', v: (s.F >= 0 ? '+' : '−') + Math.abs(s.F).toFixed(1), u: 'N', cls: 'am', bar: Math.abs(s.F) / 60 },
      { k: 'CONE X', v: (s.x * 1000).toFixed(2), u: 'mm', cls: 'acc', bar: Math.abs(s.x) / TS.Xmax },
      { k: 'SPL @ 1 m', v: s.spl.toFixed(1), u: 'dB', cls: 'acc' },
      { k: 'FC', v: AL.fc.toFixed(1), u: 'Hz' },
      { k: 'QTC', v: AL.Qtc.toFixed(3), u: '' },
    ];
  },
};
