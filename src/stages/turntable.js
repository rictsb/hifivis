import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { radialSprite } from '../core/tex.js';

/* ===========================================================================
   GROOVE TO VOLTAGE
   Every number displayed by this stage is derived in the block below. Nothing
   is chosen to look good; where a modelling assumption is made it is named.
   =========================================================================== */

const TAU = DSP.TAU;
const SQ2 = Math.SQRT2;

// ---- platter kinematics ---------------------------------------------------
const RPM   = 100 / 3;                       // 33⅓ rev/min
const OMEGA = (TAU * RPM) / 60;              // 3.4907 rad/s
const T_REV = 60 / RPM;                      // 1.800 s per revolution
const R_OUT = 0.14605;                       // m — IEC outermost recorded radius
const R_IN  = 0.060325;                      // m — IEC innermost recorded radius
const V_OUT = OMEGA * R_OUT;                 // 0.5098 m/s
const V_IN  = OMEGA * R_IN;                  // 0.2106 m/s
const vAt   = (r) => OMEGA * r;

// groove pitch from a 20-minute side spread over the recorded band
const SIDE_MIN = 20;
const REVS     = SIDE_MIN * RPM;             // 666.7 revolutions
const PITCH    = (R_OUT - R_IN) / REVS;      // 128.6 µm
const R_DOT    = PITCH / T_REV;              // 71.4 µm/s inward creep

// 180-bar strobe: bars = 120·f_mains / rpm  (full-wave illumination at 50 Hz)
const STROBE_BARS = Math.round((120 * 50) / RPM);   // 180

// ---- tonearm: Löfgren A (Baerwald) for the IEC radii ----------------------
// Null radii r1,r2 satisfy  sin β = (r1+r2)/2L  and  r1·r2 = 2LD − D².
const L_EFF    = 0.239;                      // effective length, m
const NULL1    = 0.0660, NULL2 = 0.1209;     // Baerwald nulls, m
const K_BAER   = NULL1 * NULL2;
const OVERHANG = L_EFF - Math.sqrt(L_EFF * L_EFF - K_BAER);   // 17.32 mm
const MOUNT_D  = L_EFF - OVERHANG;                            // 221.68 mm
const OFFSET   = Math.asin((NULL1 + NULL2) / (2 * L_EFF));    // 23.02°
const reqOffset = (r) => Math.asin((r * r + K_BAER) / (2 * L_EFF * r));
const trackErr  = (r) => OFFSET - reqOffset(r);               // rad, + = overhung

// ---- 45/45 groove geometry ------------------------------------------------
const GROOVE_W = 60e-6;                 // top width of an unmodulated groove
const GROOVE_D = GROOVE_W / 2;          // 90° included angle → depth = half width
const BOTTOM_R = 6e-6;                  // radius of the groove bottom
const TIP_R_H  = 18e-6;                 // 0.7 mil across-groove radius (touches walls)
const TIP_R_V  = 5e-6;                  // 0.2 mil along-groove radius (traces λ)

// Wall-normal convention, in (lateral u, vertical w) with +u toward the rim:
//   n_L = (+1, +1)/√2   (inner wall)      n_R = (+1, −1)/√2   (outer wall)
// so  u = (sL + sR)/√2  and  w = (sL − sR)/√2 — in-phase is lateral.
const tipFromWalls = (sL, sR) => [(sL + sR) / SQ2, (sL - sR) / SQ2];

// ---- vertical tracking force and the Hertzian contact ---------------------
const G0     = 9.80665;
const VTF_G  = 2.0;                                   // grams
const VTF_N  = VTF_G * 1e-3 * G0;                     // 19.613 mN
const N_WALL = VTF_N / (2 * Math.cos(Math.PI / 4));   // 13.869 mN normal to each wall
const E_DIA = 1050e9, NU_DIA = 0.20;                  // diamond
const E_PVC = 3.0e9,  NU_PVC = 0.40;                  // vinyl copolymer, quasi-static
const E_STAR = 1 / ((1 - NU_DIA ** 2) / E_DIA + (1 - NU_PVC ** 2) / E_PVC);
const R_EQ   = Math.sqrt(TIP_R_H * TIP_R_V);          // geometric-mean tip radius
const A_HZ   = Math.cbrt((3 * N_WALL * R_EQ) / (4 * E_STAR));   // contact radius
const AREA_C = Math.PI * A_HZ * A_HZ;                 // 2.88 × 10⁻¹¹ m²
const P_MEAN = N_WALL / AREA_C;                       // 482 MPa
const P_MAX  = 1.5 * P_MEAN;                          // 723 MPa (Hertz peak)
// 1 tonne-force per cm² = 1000 × 9.80665 N / 10⁻⁴ m² = 9.80665 × 10⁷ Pa
const TF_CM2 = 1000 * G0 * 1e4;
const P_TCM2 = P_MEAN / TF_CM2;                       // 4.92 tf/cm²
const PVC_H  = 140e6;                                 // indentation hardness ≈ 2.8·σy
const P_PLAS = PVC_H / TF_CM2;                        // 1.43 tf/cm² — plastic bound

// ---- the moving-coil generator -------------------------------------------
const B_GAP   = 0.42;                     // T in the working gap
const N_TURNS = 24;                       // turns per channel coil
const L_TURN  = 0.80e-3;                  // effective conductor length per turn
const BL      = B_GAP * N_TURNS * L_TURN; // 8.064 mT·m
const V_REF   = 0.05;                     // 5 cm/s reference wall velocity
const E_REF   = DSP.backEmf(BL, V_REF);   // 403 µV
const R_COIL  = 10, R_LOAD = 100;         // Ω — coil DCR and phono input load
const I_REF   = E_REF / (R_COIL + R_LOAD);// 3.66 µA
const WIRE_MM2 = 0.030;                   // mm² — tonearm litz, 7 × 0.07 mm
const V_DRIFT  = DSP.driftVelocity(I_REF, WIRE_MM2);   // 8.96 nm/s
const F_SIG    = 1000;                                 // Hz
const X_DRIFT  = DSP.driftDisplacement(V_DRIFT, F_SIG);// 1.43 pm peak excursion
const V_FIELD  = DSP.signalSpeed(0.66);                // 1.979 × 10⁸ m/s
const LOOP_LEN = 1.2;                                  // m of wire in the loop
const T_LOOP   = LOOP_LEN / V_FIELD;                   // 6.06 ns
const SPEED_RATIO = V_FIELD / V_DRIFT;                 // 2.2 × 10¹⁶

// ---- the modulation we actually draw --------------------------------------
// A single 1 kHz tone, unequal on the two channels and 0.9 rad apart, so the
// tip traces a real stereo ellipse rather than a textbook straight line.
const A_L     = V_REF / (TAU * F_SIG);    // 7.96 µm peak wall displacement
const R_RATIO = 0.62;
const R_PHASE = -0.90;                    // rad
const A_R     = A_L * R_RATIO;
const V_L_PK  = TAU * F_SIG * A_L;        // = V_REF by construction
const V_R_PK  = TAU * F_SIG * A_R;

// ---- traceability: why the inner grooves distort --------------------------
// A tip of along-groove radius r can follow a sine only while the groove's
// minimum radius of curvature λ²/(4π²A) stays above r.
const F_HF     = 10000;
const lambdaAt = (r) => vAt(r) / F_HF;
const aMaxAt   = (r) => (lambdaAt(r) ** 2) / (4 * Math.PI * Math.PI * TIP_R_V);
const vMaxAt   = (r) => TAU * F_HF * aMaxAt(r);        // 0.83 → 0.14 m/s

// ---- display scalings (all stated on screen) ------------------------------
const MAG        = 1600;      // groove cross-section magnification
const TIME_RATIO = 1000;      // groove/stylus motion slowed 1 : 1000
const CARRIER_MAG = 4e9;      // carrier excursion magnification in the wire

// ---------------------------------------------------------------------------
// small geometry helpers
// ---------------------------------------------------------------------------

/** Lathe from an array of [radius, y] with explicit chamfers already in it. */
function lathe(pts, seg, mat) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Swept tapered tube along a Catmull–Rom path — the tonearm and its wiring. */
function taperTube(pts, r0, r1, mat, radial = 18, seg = 44) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const P = curve.getPointAt(t);
    const N = fr.normals[i], B = fr.binormals[i];
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a), sy = Math.sin(a);
      const nx = N.x * cx + B.x * sy, ny = N.y * cx + B.y * sy, nz = N.z * cx + B.z * sy;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      nor.push(nx, ny, nz);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Closed convex hull of two circles — the path a flat belt actually takes. */
function beltPath(c1, r1, c2, r2, n1 = 110, n2 = 26) {
  const d = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
  const al = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
  const gm = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const out = [];
  for (let i = 0; i <= n1; i++) {
    const a = al + gm + (TAU - 2 * gm) * (i / n1);
    out.push([c1[0] + Math.cos(a) * r1, c1[1] + Math.sin(a) * r1]);
  }
  for (let i = 0; i <= n2; i++) {
    const a = al - gm + 2 * gm * (i / n2);
    out.push([c2[0] + Math.cos(a) * r2, c2[1] + Math.sin(a) * r2]);
  }
  return out;
}

/** A flat belt: extruded ring between the outer hull and the same hull inset. */
function beltMesh(c1, r1, c2, r2, thick, height) {
  const outer = beltPath(c1, r1, c2, r2);
  const inner = beltPath(c1, r1 - thick, c2, r2 - thick);
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p[0], -p[1])));
  const hole = new THREE.Path(inner.reverse().map((p) => new THREE.Vector2(p[0], -p[1])));
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: true, bevelSize: 0.0002,
    bevelThickness: 0.0002, bevelSegments: 1, curveSegments: 2,
  });
  const m = new THREE.Mesh(g, mats().rubber);
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  return m;
}

/** Filled 2D polygon in the local XY plane — overlay only. */
function poly(pts, color, opacity = 1, order = 11) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.renderOrder = order;
  return m;
}

// ---------------------------------------------------------------------------
// HARDWARE — local frame: origin on the spindle axis, y = 0 at the plinth top.
// ---------------------------------------------------------------------------

const Y_PLATE   = 0.058;          // top of the alloy top plate
const Y_PLATTER = 0.060;          // underside of the platter
const H_PLATTER = 0.048;
const Y_REC     = Y_PLATTER + H_PLATTER;      // 0.108 — record underside
const T_REC     = 0.0018;
const Y_SURF    = Y_REC + T_REC;              // 0.1098 — playing surface
const ARM_Y     = 0.1260;                     // tonearm tube axis height
const PIV_ANG   = -31 * Math.PI / 180;
const PIVOT     = [MOUNT_D * Math.cos(PIV_ANG), MOUNT_D * Math.sin(PIV_ANG)];
const PIV_PHI   = Math.atan2(PIVOT[1], PIVOT[0]);
const POD       = [-0.205, 0.135];
const R_BELT    = 0.1375;
const R_PULLEY  = 0.0075;

/** Stylus (x,z) for a given groove radius — the over-the-record intersection. */
function stylusXZ(r) {
  const d = MOUNT_D;
  const c = (d * d + r * r - L_EFF * L_EFF) / (2 * d * r);
  const a = PIV_PHI + Math.acos(Math.max(-1, Math.min(1, c)));
  return [r * Math.cos(a), r * Math.sin(a)];
}
/** Arm bearing angle (rotation.y) that puts the stylus at radius r. */
function armAngle(r) {
  const s = stylusXZ(r);
  return Math.atan2(-(s[1] - PIVOT[1]), s[0] - PIVOT[0]);
}

function buildPlatter() {
  const g = new THREE.Group();
  const body = lathe([
    [0, 0], [0.1350, 0], [0.1375, 0.0025], [0.1375, 0.0160],
    [0.1440, 0.0185], [0.1552, 0.0230], [0.1552, 0.0448],
    [0.1532, 0.0480], [0.0064, 0.0480], [0.0064, 0.0430],
  ], 96, mats().anodBlack);
  g.add(body);

  // proud alloy band round the rim — this is what the strobe is printed on
  const rimMat = mats().alu.clone();
  rimMat.roughness = 0.47;
  rimMat.color.setHex(0x878c92);
  g.add(lathe([
    [0.1552, 0.0242], [0.1566, 0.0256], [0.1566, 0.0424], [0.1552, 0.0438],
  ], 96, rimMat));

  // machined concentric relief on the top face
  for (let i = 0; i < 3; i++) {
    const r = 0.062 + i * 0.030;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.00035, 5, 96), mats().anodGrey);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.0480;
    g.add(ring);
  }

  // 180-bar strobe ring: 120·50 Hz / 33⅓ rpm = 180
  const bar = new THREE.InstancedMesh(GEO.bevelBox(0.0011, 0.0092, 0.0006, 0.0002, 1), mats().anodBlack, STROBE_BARS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  for (let i = 0; i < STROBE_BARS; i++) {
    const a = (i / STROBE_BARS) * TAU;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    m.compose(v.set(Math.sin(a) * 0.1569, 0.0340, Math.cos(a) * 0.1569), q, s);
    bar.setMatrixAt(i, m);
  }
  bar.castShadow = true;
  g.add(bar);
  return g;
}

let _vinyl = null;
function vinylMat() {
  if (!_vinyl) {
    _vinyl = mats().vinyl.clone();
    _vinyl.roughness = 0.255;
    _vinyl.clearcoatRoughness = 0.15;
  }
  return _vinyl;
}

function buildRecord() {
  const g = new THREE.Group();
  const body = lathe([
    [0.00364, 0], [0.1495, 0], [0.1512, 0.0004], [0.1512, 0.0014], [0.1495, T_REC],
  ], 128, vinylMat());
  g.add(body);

  const top = new THREE.Mesh(new THREE.RingGeometry(0.00364, 0.1495, 128, 1), vinylMat());
  top.rotation.x = -Math.PI / 2;
  top.position.y = T_REC;
  top.receiveShadow = true;
  g.add(top);

  const paper = mats().plastic.clone();
  paper.color.setHex(0x5b5346); paper.roughness = 0.95; paper.clearcoat = 0.04;
  const label = new THREE.Mesh(new THREE.RingGeometry(0.00364, 0.0500, 64, 1), paper);
  label.rotation.x = -Math.PI / 2;
  label.position.y = T_REC + 0.00006;
  g.add(label);

  const ink = mats().plastic.clone();
  ink.color.setHex(0x14151a);
  for (const [ri, ro] of [[0.0462, 0.0478], [0.0330, 0.0338], [0.0132, 0.0140]]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 64, 1), ink);
    r.rotation.x = -Math.PI / 2;
    r.position.y = T_REC + 0.00012;
    g.add(r);
  }
  return g;
}

function buildMotorPod() {
  const g = new THREE.Group();
  g.position.set(POD[0], 0, POD[1]);
  const body = lathe([
    [0, 0], [0.0380, 0], [0.0395, 0.0016], [0.0395, 0.0080],
    [0.0355, 0.0110], [0.0355, 0.0580], [0.0340, 0.0620],
    [0.0140, 0.0620], [0.0140, 0.0600],
  ], 56, mats().anodBlack);
  g.add(body);
  const cap = lathe([
    [0, 0.0600], [0.0150, 0.0600], [0.0150, 0.0625], [0.0090, 0.0640],
  ], 40, mats().alu);
  g.add(cap);
  const pulley = lathe([
    [0, 0.0640], [R_PULLEY, 0.0640], [R_PULLEY, 0.0648],
    [R_PULLEY - 0.0006, 0.0652], [R_PULLEY - 0.0006, 0.0718],
    [R_PULLEY, 0.0722], [R_PULLEY, 0.0760], [0, 0.0760],
  ], 40, mats().steel);
  g.add(pulley);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const sc = GEO.screw(0.0014);
    sc.rotation.x = 0;
    sc.position.set(Math.sin(a) * 0.0265, 0.0621, Math.cos(a) * 0.0265);
    g.add(sc);
  }
  const led = new THREE.Mesh(GEO.bevelCyl(0.0016, 0.0016, 0.0012, 16, 0.0003), mats().ledCyan);
  led.position.set(0.0300, 0.0450, 0.0180);
  led.rotation.x = Math.PI / 2;
  led.lookAt(new THREE.Vector3(0.09, 0.045, 0.054));
  g.add(led);
  const sh = GEO.contactShadow(0.13, 0.13, 0.7);
  sh.position.y = 0.0016;
  g.add(sh);
  return g;
}

function buildChassis() {
  const g = new THREE.Group();
  const CX = 0.075, CZ = 0.005, W = 0.440, D = 0.340;

  const slab = new THREE.Mesh(GEO.bevelBox(W, 0.026, D, 0.0028, 4), mats().anodBlack);
  slab.position.set(CX, 0.039, CZ);
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);

  const plate = new THREE.Mesh(GEO.bevelBox(W - 0.020, 0.006, D - 0.020, 0.0018, 3), mats().alu);
  plate.position.set(CX, 0.055, CZ);
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);

  // a low armboard under the pivot — kept matte so it does not compete with
  // the platter rim for the key light
  const armBoard = lathe([
    [0, 0.0580], [0.0450, 0.0580], [0.0462, 0.0592], [0.0462, 0.0618],
    [0.0446, 0.0630], [0, 0.0630],
  ], 56, mats().anodBlack);
  armBoard.position.set(PIVOT[0], 0, PIVOT[1]);
  g.add(armBoard);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const sc = GEO.screw(0.0017);
    sc.rotation.x = 0;
    sc.position.set(PIVOT[0] + Math.sin(a) * 0.0372, 0.0631, PIVOT[1] + Math.cos(a) * 0.0372);
    g.add(sc);
  }

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const foot = lathe([
      [0, 0], [0.0230, 0], [0.0240, 0.0020], [0.0240, 0.0180],
      [0.0195, 0.0225], [0.0195, 0.0260], [0, 0.0260],
    ], 32, mats().steel);
    foot.position.set(CX + sx * 0.182, 0, CZ + sz * 0.138);
    g.add(foot);
  }

  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([CX + sx * 0.203, CZ + sz * 0.153]);
  for (const [x, z] of pts) {
    const sc = GEO.screw(0.0018);
    sc.rotation.x = 0;
    sc.position.set(x, 0.0581, z);
    g.add(sc);
  }

  // speed selector + power indicator on the front-left corner of the top plate
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(GEO.bevelCyl(0.0068, 0.0072, 0.0034, 28, 0.0006), mats().anodGrey);
    b.position.set(-0.105 + i * 0.020, 0.0592, 0.140);
    g.add(b);
  }
  const led = new THREE.Mesh(GEO.bevelCyl(0.0018, 0.0018, 0.0010, 16, 0.0003), mats().ledCyan);
  led.position.set(-0.065, 0.0587, 0.140);
  g.add(led);

  const sh = GEO.contactShadow(0.72, 0.60, 0.66);
  sh.position.set(CX, 0.0016, CZ);
  g.add(sh);
  return g;
}

function buildArm() {
  const arm = new THREE.Group();          // rotates about the vertical bearing
  arm.position.set(PIVOT[0], ARM_Y, PIVOT[1]);

  // gimbal yoke
  const yokeMat = mats().steel;
  for (const sz of [-1, 1]) {
    const up = new THREE.Mesh(GEO.bevelBox(0.0075, 0.020, 0.0045, 0.0008, 2), yokeMat);
    up.position.set(-0.0015, -0.0075, sz * 0.0125);
    arm.add(up);
    const cap = new THREE.Mesh(GEO.bevelCyl(0.0048, 0.0048, 0.0035, 20, 0.0005), mats().anodGrey);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(-0.0015, 0, sz * 0.0140);
    arm.add(cap);
  }
  const hub = new THREE.Mesh(GEO.bevelCyl(0.0072, 0.0072, 0.0210, 28, 0.0007), mats().anodBlack);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(-0.0015, 0, 0);
  arm.add(hub);

  // arm tube: pivot → headshell stub, gently swept
  const tube = taperTube([
    [0, 0, 0], [0.070, 0.0006, 0.0006], [0.145, 0.0002, -0.0004], [0.2075, -0.0022, -0.0025],
  ], 0.0058, 0.0042, mats().alu, 20, 48);
  arm.add(tube);

  // counterweight stub + counterweight
  const stub = new THREE.Mesh(GEO.bevelCyl(0.0052, 0.0052, 0.072, 24, 0.0006), mats().steel);
  stub.rotation.z = Math.PI / 2;
  stub.position.set(-0.036, 0, 0);
  arm.add(stub);
  const cw = lathe([
    [0, -0.014], [0.0180, -0.014], [0.0245, -0.0105], [0.0245, 0.0105],
    [0.0180, 0.014], [0, 0.014],
  ], 40, mats().anodBlack);
  cw.rotation.z = Math.PI / 2;
  cw.position.set(-0.052, 0, 0);
  arm.add(cw);
  const cwRing = new THREE.Mesh(new THREE.TorusGeometry(0.0247, 0.0011, 8, 40), mats().steel);
  cwRing.rotation.y = Math.PI / 2;
  cwRing.position.set(-0.052, 0, 0);
  arm.add(cwRing);

  // anti-skate: outrigger, thread over a post, hanging weight
  const out = new THREE.Mesh(GEO.bevelCyl(0.0016, 0.0016, 0.044, 14, 0.0003), mats().steel);
  out.rotation.x = Math.PI / 2;
  out.position.set(-0.0155, 0.0035, 0.026);
  arm.add(out);
  const post = new THREE.Mesh(GEO.bevelCyl(0.0011, 0.0013, 0.013, 12, 0.0003), mats().steel);
  post.position.set(-0.0155, 0.0095, 0.047);
  arm.add(post);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.00022, 0.00022, 0.022, 6), mats().plastic);
  thread.position.set(-0.0155, 0.0045, 0.0505);
  arm.add(thread);
  const wt = lathe([[0, 0], [0.0038, 0], [0.0042, 0.0008], [0.0042, 0.0052], [0.0038, 0.0060], [0, 0.0060]], 20, mats().steel);
  wt.position.set(-0.0155, -0.0075, 0.0505);
  arm.add(wt);

  // ---- headshell + cartridge, rotated by the offset angle about the stylus
  const head = new THREE.Group();
  head.position.set(L_EFF, Y_SURF - ARM_Y, 0);
  head.rotation.y = -OFFSET;
  arm.add(head);

  const plate = new THREE.Mesh(GEO.bevelBox(0.0300, 0.0035, 0.0190, 0.0008, 3), mats().anodGrey);
  plate.position.set(-0.0190, 0.0172, 0);
  head.add(plate);
  const stubT = taperTube([
    [-0.0245, 0.0170, 0.0020], [-0.0275, 0.0156, 0.0062], [-0.0300, 0.0140, 0.0100],
  ], 0.0040, 0.0042, mats().alu, 14, 10);
  head.add(stubT);
  const collar = new THREE.Mesh(GEO.bevelCyl(0.0048, 0.0048, 0.0060, 20, 0.0006), mats().anodBlack);
  collar.rotation.z = Math.PI / 2;
  collar.rotation.y = 0.55;
  collar.position.set(-0.0272, 0.0157, 0.0060);
  head.add(collar);
  const lift = new THREE.Mesh(GEO.bevelBox(0.0055, 0.0090, 0.0016, 0.0005, 2), mats().alu);
  lift.position.set(-0.0038, 0.0205, 0.0080);
  lift.rotation.x = 0.42;
  head.add(lift);

  // cartridge body
  const bodyMat = mats().anodBlack.clone();
  bodyMat.color.setHex(0x24272c);
  const cart = new THREE.Mesh(GEO.bevelBox(0.0220, 0.0120, 0.0165, 0.0010, 3), bodyMat);
  cart.position.set(-0.0190, 0.0092, 0);
  head.add(cart);
  const nose = new THREE.Mesh(GEO.bevelBox(0.0055, 0.0072, 0.0110, 0.0009, 3), mats().anodGrey);
  nose.position.set(-0.0062, 0.0074, 0);
  head.add(nose);
  for (const sz of [-1, 1]) {
    const sc = GEO.screw(0.0013);
    sc.rotation.x = 0;
    sc.position.set(-0.0190, 0.0155, sz * 0.0058);
    head.add(sc);
  }
  for (const [dy, dz] of [[0.0026, -0.0042], [0.0026, 0.0042], [0.0080, -0.0042], [0.0080, 0.0042]]) {
    const pin = new THREE.Mesh(GEO.bevelCyl(0.00055, 0.00055, 0.0030, 10, 0.0002), mats().gold);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(-0.0313, dy, dz);
    head.add(pin);
  }

  // cantilever + stylus: 26.6° below horizontal, tip on the playing surface
  const cant = taperTube([[-0.0080, 0.0040, 0], [0, 0, 0]], 0.00035, 0.00024, mats().alu, 10, 4);
  head.add(cant);
  const dia = mats().chrome.clone();
  dia.color.setHex(0xe8f0f6); dia.roughness = 0.02;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.00042, 0.00110, 12), dia);
  tip.position.set(0.00016, 0.00042, 0);
  tip.rotation.z = Math.PI;
  head.add(tip);

  arm.userData.head = head;
  arm.userData.stylusLocal = new THREE.Vector3(L_EFF, Y_SURF - ARM_Y, 0);
  return arm;
}

function buildArmBase() {
  const g = new THREE.Group();
  g.position.set(PIVOT[0], 0, PIVOT[1]);
  const base = lathe([
    [0, Y_PLATE], [0.0270, Y_PLATE], [0.0280, Y_PLATE + 0.0012],
    [0.0280, Y_PLATE + 0.0080], [0.0250, Y_PLATE + 0.0110],
    [0.0160, Y_PLATE + 0.0110], [0.0160, Y_PLATE + 0.0090],
  ], 40, mats().anodBlack);
  g.add(base);
  const pillar = lathe([
    [0, Y_PLATE + 0.008], [0.0148, Y_PLATE + 0.008], [0.0148, ARM_Y - 0.0300],
    [0.0128, ARM_Y - 0.0270], [0.0128, ARM_Y - 0.0130], [0.0106, ARM_Y - 0.0105],
    [0.0106, ARM_Y - 0.0090], [0, ARM_Y - 0.0090],
  ], 36, mats().anodGrey);
  g.add(pillar);
  const vtaScrew = new THREE.Mesh(GEO.bevelCyl(0.0022, 0.0022, 0.0060, 14, 0.0004), mats().steel);
  vtaScrew.rotation.z = Math.PI / 2;
  vtaScrew.position.set(0.0160, ARM_Y - 0.0210, 0);
  g.add(vtaScrew);

  // cueing lever: platform on a bracket, lever knob at the base
  const brk = new THREE.Mesh(GEO.bevelBox(0.0500, 0.0060, 0.0090, 0.0010, 3), mats().anodBlack);
  brk.position.set(-0.0270, Y_PLATE + 0.0140, 0.0230);
  brk.rotation.y = -0.62;
  g.add(brk);
  const pad = new THREE.Mesh(GEO.bevelBox(0.0180, 0.0035, 0.0075, 0.0008, 2), mats().rubber);
  pad.position.set(-0.0455, Y_PLATE + 0.0182, 0.0390);
  pad.rotation.y = -0.62;
  g.add(pad);
  const lev = new THREE.Mesh(GEO.bevelCyl(0.0028, 0.0032, 0.0170, 20, 0.0005), mats().alu);
  lev.rotation.z = Math.PI / 2;
  lev.rotation.y = -0.62;
  lev.position.set(0.0060, Y_PLATE + 0.0150, 0.0290);
  g.add(lev);

  // arm rest with a clip
  const restPost = lathe([
    [0, Y_PLATE], [0.0110, Y_PLATE], [0.0110, Y_PLATE + 0.0040],
    [0.0062, Y_PLATE + 0.0070], [0.0062, ARM_Y - 0.0075], [0, ARM_Y - 0.0075],
  ], 26, mats().anodGrey);
  restPost.position.set(0.0640, 0, -0.0480);
  g.add(restPost);
  const cradle = new THREE.Mesh(GEO.bevelBox(0.0150, 0.0055, 0.0110, 0.0012, 3), mats().rubber);
  cradle.position.set(0.0640, ARM_Y - 0.0055, -0.0480);
  cradle.rotation.y = 0.55;
  g.add(cradle);
  return g;
}

function buildClamp() {
  const g = new THREE.Group();
  const y = Y_SURF;
  const body = lathe([
    [0.0040, y], [0.0290, y], [0.0300, y + 0.0014], [0.0300, y + 0.0060],
    [0.0250, y + 0.0080], [0.0250, y + 0.0180], [0.0225, y + 0.0205],
    [0.0060, y + 0.0205], [0.0060, y + 0.0180],
  ], 48, mats().anodBlack);
  g.add(body);
  const knurl = GEO.knob(0.0252, 0.0100, { flutes: 52, body: mats().anodGrey, dial: false });
  knurl.position.y = y + 0.0130;
  g.add(knurl);
  const cap = new THREE.Mesh(GEO.bevelCyl(0.0210, 0.0222, 0.0026, 40, 0.0006), mats().anodBlack);
  cap.position.y = y + 0.0218;
  g.add(cap);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.0216, 0.0009, 8, 44), mats().alu);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = y + 0.0206;
  g.add(trim);
  return g;
}

// ---------------------------------------------------------------------------
// OVERLAY
// ---------------------------------------------------------------------------

const SHOT = { position: [-1.96, 1.42, -0.94], target: [-2.200, 1.02, -2.420], fov: 34 };

const CARD_H = 0.235;
const CARD_W = [0.225, 0.255, 0.265];
const CARD_GAP = 0.0275;
const PANEL_W = CARD_W[0] + CARD_W[1] + CARD_W[2] + CARD_GAP * 2;
const CARD_X = (() => {
  const out = []; let x = -PANEL_W / 2;
  for (const w of CARD_W) { out.push(x); x += w + CARD_GAP; }
  return out;                                   // bottom-left x of each card
})();
const PANEL_AT = [-2.333, 1.243, -2.389];

/** One-way arrow: shaft + head, in the local XY plane (or any plane via pts). */
function arrow(a, b, color, width = 1.8, head = 0.010) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  const t = new DIAG.Trace(2, color, width, { opacity: 0.95 });
  const shaftEnd = B.clone().addScaledVector(dir, -head * 0.85);
  t.write((i) => (i === 0 ? [A.x, A.y, A.z] : [shaftEnd.x, shaftEnd.y, shaftEnd.z]));
  g.add(t);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.40, head, 12),
    new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false }));
  cone.position.copy(B).addScaledVector(dir, -head * 0.5);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  cone.renderOrder = 13;
  g.add(cone);
  g.userData.len = len;
  return g;
}

/** Filled strip under a polyline whose top edge is rewritten every frame. */
function fillStrip(n, color, opacity, yBase) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 2 * 3);
  const idx = [];
  for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.userData.write = (fn) => {
    for (let i = 0; i < n; i++) {
      const [x, y] = fn(i, i / (n - 1));
      pos[i * 6] = x; pos[i * 6 + 1] = yBase; pos[i * 6 + 2] = -0.0004;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = -0.0004;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return mesh;
}

/** The magnified 45/45 groove cross-section. */
function buildGrooveCard(S) {
  const g = new THREE.Group();
  const W = CARD_W[0], H = CARD_H;
  g.add(DIAG.diagramCard(W, H));

  const CX = W / 2, CY = CARD_H * 0.660;          // record surface level
  const D = GROOVE_D * MAG;                       // 0.078
  const RB = BOTTOM_R * MAG;
  const RT = TIP_R_H * MAG;                       // 0.0468
  const NX = 176;

  // profile height at card-x, given modulation (u,w) in metres
  const prof = (x, u, w) => {
    const dx = x - (CX + u * MAG);
    const wall = Math.abs(dx) - D + w * MAG;
    if (wall >= 0) return 0;
    const arc = (-D + w * MAG + RB * SQ2) - Math.sqrt(Math.max(0, RB * RB - dx * dx));
    return Math.min(0, Math.max(wall, Math.abs(dx) < RB ? arc : -1e9));
  };
  S.prof = prof;

  const fill = fillStrip(NX, 0x232b34, 0.95, 0.0);
  g.add(fill);
  const edge = new DIAG.Trace(NX, 0x9aa3ad, 1.7, { opacity: 0.95, renderOrder: 12 });
  g.add(edge);
  // the two walls, tinted by channel
  const wallL = new DIAG.Trace(2, PAL.cy, 3.0, { opacity: 0.9, renderOrder: 13 });
  const wallR = new DIAG.Trace(2, PAL.vi, 3.0, { opacity: 0.9, renderOrder: 13 });
  g.add(wallL, wallR);

  S.grooveWrite = (u, w) => {
    fill.userData.write((i) => {
      const x = (i / (NX - 1)) * W;
      return [x, CY + prof(x, u, w)];
    });
    edge.write((i) => {
      const x = (i / (NX - 1)) * W;
      return [x, CY + prof(x, u, w), 0.0006];
    });
    const ax = CX + u * MAG, ay = CY - D + w * MAG;      // modulated apex
    wallL.write((i) => (i === 0 ? [ax - RB * 0.9, ay + RB * 0.55, 0.0009] : [ax - D + w * MAG, CY, 0.0009]));
    wallR.write((i) => (i === 0 ? [ax + RB * 0.9, ay + RB * 0.55, 0.0009] : [ax + D - w * MAG, CY, 0.0009]));
  };

  // ---- stylus (a group that is simply moved) ------------------------------
  const sty = new THREE.Group();
  g.add(sty);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(RT, 48),
    new THREE.MeshBasicMaterial({ color: 0x6f7d8b, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  disc.renderOrder = 14;
  sty.add(disc);
  const shank = poly([
    [-RT * 0.62, RT * 0.74], [RT * 0.62, RT * 0.74], [RT * 0.46, RT * 2.05], [-RT * 0.46, RT * 2.05],
  ], 0x59646f, 0.42, 14);
  sty.add(shank);
  const ring = new DIAG.Trace(49, 0xdfe6ee, 1.6, { opacity: 0.95, renderOrder: 16 });
  ring.write((i) => [Math.cos((i / 48) * TAU) * RT, Math.sin((i / 48) * TAU) * RT, 0.002]);
  sty.add(ring);
  // tip-radius call-out at true scale
  const rdim = DIAG.dimension([0, 0, 0.0022], [RT * 0.707, RT * 0.707, 0.0022], { color: PAL.ink3, head: 0.006 });
  sty.add(rdim);
  // the two Hertzian contact patches, drawn 2a wide at the same magnification
  const aP = A_HZ * MAG;
  for (const s of [-1, 1]) {
    const c = new DIAG.Trace(2, PAL.am, 4.2, { opacity: 1, renderOrder: 17 });
    const cx = s * RT * 0.7071, cy = -RT * 0.7071;
    c.write((i) => {
      const k = (i === 0 ? -1 : 1) * aP * 0.7071;
      return [cx + k, cy + s * k, 0.0026];
    });
    sty.add(c);
  }
  S.stylus = sty;
  S.stylusAt = (u, w) => sty.position.set(CX + u * MAG, CY - D + w * MAG + RT * SQ2, 0.001);

  // ---- lateral / vertical decomposition of the tip displacement ----------
  const REST = [CX, CY - D + RT * SQ2];
  const dec = new DIAG.Trace(3, PAL.ink3, 1.3, { opacity: 0.75, dashed: true, dashSize: 0.006, gapSize: 0.005, renderOrder: 16 });
  g.add(dec);
  // neutral, because cyan/violet already mean L and R on the walls above
  const decU = new DIAG.Trace(2, 0xdfe6ee, 3.4, { opacity: 0.95, renderOrder: 17 });
  const decW = new DIAG.Trace(2, 0xdfe6ee, 3.4, { opacity: 0.95, renderOrder: 17 });
  const YU = CY - D - 0.026, XW = CX + D + 0.024;
  const railU = new DIAG.Trace(2, 0x505963, 1.0, { opacity: 0.7, renderOrder: 15 });
  railU.write((i) => [i ? CX + 0.032 : CX - 0.032, YU, 0.0018]);
  const railW = new DIAG.Trace(2, 0x505963, 1.0, { opacity: 0.7, renderOrder: 15 });
  railW.write((i) => [XW, i ? YU + 0.028 : YU - 0.028, 0.0018]);
  g.add(decU, decW, railU, railW);
  S.decompose = (u, w) => {
    const ux = REST[0] + u * MAG, wy = REST[1] + w * MAG;
    dec.write((i) => [[REST[0], REST[1]], [ux, REST[1]], [ux, wy]][i].concat(0.0024));
    decU.write((i) => [i ? CX + u * MAG : CX, YU, 0.0024]);
    decW.write((i) => [XW, i ? YU + w * MAG : YU, 0.0024]);
  };

  // ---- the tip locus: the stereo ellipse it actually traces ---------------
  const NL = 96;
  const locus = new DIAG.Trace(NL, PAL.cy, 1.4, { opacity: 0.55, renderOrder: 15 });
  g.add(locus);
  S.locusWrite = (phase) => {
    locus.write((i) => {
      const th = phase - (i / (NL - 1)) * TAU;
      const [u, w] = tipFromWalls(A_L * Math.sin(th), A_R * Math.sin(th + R_PHASE));
      return [CX + u * MAG, CY - D + w * MAG + RT * SQ2, 0.0008];
    });
  };

  // ---- true-scale dimensions ---------------------------------------------
  const wd = DIAG.dimension([CX - D, CY + 0.0135, 0.001], [CX + D, CY + 0.0135, 0.001], { head: 0.007 });
  g.add(wd);
  const pd = DIAG.dimension(
    [CX - (PITCH * MAG) / 2, 0.0165, 0.001], [CX + (PITCH * MAG) / 2, 0.0165, 0.001], { head: 0.007 },
  );
  g.add(pd);
  // 45° construction lines that make the geometry unmistakable
  const cons = new DIAG.Trace(3, 0x4e5761, 1.0, { opacity: 0.6, dashed: true, renderOrder: 11 });
  cons.write((i) => [[CX - D * 1.70, CY + D * 0.70], [CX, CY - D], [CX + D * 1.70, CY + D * 0.70]][i].concat(0.0004));
  g.add(cons);
  S.contactAnchor = new THREE.Object3D();
  S.contactAnchor.position.set(CX + D * 0.55, CY - D * 0.62, 0);
  g.add(S.contactAnchor);

  g.position.set(CARD_X[0], -CARD_H / 2, 0);
  return g;
}

/** Wall-velocity oscillogram — the two channels the 45/45 geometry recovers. */
function buildGraphCard(S) {
  const g = new THREE.Group();
  const W = CARD_W[1];
  g.add(DIAG.diagramCard(W, CARD_H));

  const gph = new DIAG.Graph({
    w: 0.204, h: 0.134, xRange: [0, 2], yRange: [-6, 6],
    xTicks: [0, 0.5, 1, 1.5, 2], yTicks: [-6, -3, 0, 3, 6], zeroLine: 0,
  });
  gph.position.set(0.028, 0.050, 0.0005);
  g.add(gph);

  const ph = (x) => S.phase - TAU * F_SIG * (2 - x) * 1e-3;
  gph.addTrace((x) => 100 * V_L_PK * Math.cos(ph(x)), { color: PAL.cy, width: 2.4, n: 200 });
  gph.addTrace((x) => 100 * V_R_PK * Math.cos(ph(x) + R_PHASE), { color: PAL.vi, width: 2.2, n: 200 });
  const dL = gph.addDot(PAL.cy, 0.0040);
  const dR = gph.addDot(PAL.vi, 0.0040);
  S.graph = gph;
  S.graphDots = (vl, vr) => { dL.userData.setData(2, vl * 100); dR.userData.setData(2, vr * 100); };

  g.position.set(CARD_X[1], -CARD_H / 2, 0);
  return g;
}

/** Polyline path sampler: arc-length parameterised position + tangent. */
function pathSampler(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  return {
    total,
    at(s) {
      let d = ((s % total) + total) % total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
      const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) || 1;
      return [x, y, (pts[i][0] - pts[i - 1][0]) / L, (pts[i][1] - pts[i - 1][1]) / L];
    },
  };
}

const GEN_MAG   = 20;    // cartridge body scale
const COIL_EXAG = 100;   // coil travel, relative to the body scale (stated on screen)

/** The generator and its closed circuit. */
function buildGeneratorCard(S) {
  const g = new THREE.Group();
  const W = CARD_W[2];
  g.add(DIAG.diagramCard(W, CARD_H));

  // ---- magnet, pole pieces and coil, tilted 45° onto the left-channel axis
  const gen = new THREE.Group();
  gen.position.set(W / 2, 0.180, 0.0006);
  gen.rotation.z = Math.PI / 4;
  g.add(gen);

  const PL = 3.2e-3 * GEN_MAG;          // pole face length
  const PT = 0.8e-3 * GEN_MAG;          // pole thickness
  const GAP = 1.2e-3 * GEN_MAG;         // working gap
  for (const s of [-1, 1]) {
    const y0 = (s * GAP) / 2, y1 = s * (GAP / 2 + PT);
    gen.add(poly([[-PL / 2, y0], [PL / 2, y0], [PL / 2, y1], [-PL / 2, y1]], 0x3a424b, 0.96, 10));
    const o = new DIAG.Trace(5, 0x848f9b, 1.2, { opacity: 0.9, renderOrder: 12 });
    o.write((i) => [[-PL / 2, y0], [PL / 2, y0], [PL / 2, y1], [-PL / 2, y1], [-PL / 2, y0]][i].concat(0.0004));
    gen.add(o);
  }
  gen.add(poly([                                   // yoke closing the magnetic circuit
    [-PL / 2 - PT, -GAP / 2 - PT], [-PL / 2, -GAP / 2 - PT],
    [-PL / 2, GAP / 2 + PT], [-PL / 2 - PT, GAP / 2 + PT],
  ], 0x3a424b, 0.96, 10));

  for (let i = 0; i < 4; i++) {                    // B across the gap, N → S
    const x = -PL / 2 + (PL * (i + 0.5)) / 4;
    gen.add(arrow([x, GAP / 2 - 0.0010, 0.0012], [x, -GAP / 2 + 0.0010, 0.0012], 0x2f6f92, 1.2, 0.006));
  }

  const coil = new THREE.Group();
  gen.add(coil);
  const CW = 0.9e-3 * GEN_MAG, CH = 0.7e-3 * GEN_MAG;
  coil.add(poly([[-CW / 2, -CH / 2], [CW / 2, -CH / 2], [CW / 2, CH / 2], [-CW / 2, CH / 2]], 0x6e3f22, 0.95, 13));
  for (let i = 0; i < 4; i++) {
    const x = -CW / 2 + (CW * (i + 0.5)) / 4;
    const t = new DIAG.Trace(2, 0xd08a4c, 1.5, { opacity: 1, renderOrder: 14 });
    t.write((k) => [x, (k ? 1 : -1) * (CH / 2), 0.0014]);
    coil.add(t);
  }
  const cl = new DIAG.Trace(2, 0x9aa3ad, 2.0, { opacity: 0.9, renderOrder: 12 });   // cantilever
  cl.write((i) => [i ? -CW / 2 : -PL / 2 - PT - 0.022, 0, 0.0016]);
  gen.add(cl);
  S.coil = coil;
  S.coilAxis = (s) => coil.position.set(s * GEN_MAG * COIL_EXAG, 0, 0);

  // ---- the closed circuit: coil → arm wiring → phono input → back ---------
  const LOOP = [
    [0.113, 0.126], [0.113, 0.104], [0.030, 0.104], [0.030, 0.028],
    [0.235, 0.028], [0.235, 0.104], [0.152, 0.104], [0.152, 0.126],
  ];
  const sam = pathSampler(LOOP);
  S.loopLen = sam.total;

  const wire = new DIAG.Trace(LOOP.length, 0x656f7b, 2.2, { opacity: 0.95, renderOrder: 11 });
  wire.write((i) => LOOP[i].concat(0.0004));
  g.add(wire);
  for (const [a, b] of [[[0.113, 0.126], [0.1245, 0.162]], [[0.152, 0.126], [0.1405, 0.162]]]) {
    const t = new DIAG.Trace(2, 0x656f7b, 1.8, { opacity: 0.9, renderOrder: 11 });
    t.write((i) => (i ? b : a).concat(0.0004));
    g.add(t);
  }

  // the field front, drawn on as it establishes itself round the loop
  const NF = 120;
  const front = new DIAG.Trace(NF, PAL.cy, 3.0, { opacity: 0.9, renderOrder: 15 });
  front.write((i) => { const p = sam.at((i / (NF - 1)) * sam.total); return [p[0], p[1], 0.0010]; });
  g.add(front);
  const head = DIAG.glow(PAL.cy, 0.016, 0.9, radialSprite(128));
  head.position.z = 0.0016;
  g.add(head);
  S.front = front;
  S.frontHead = head;
  S.loopAt = (s) => sam.at(s);

  // charge carriers: they oscillate about a fixed point, they do not travel
  const NC = 30;
  const swarm = new DIAG.Swarm(NC, { color: PAL.am, size: 0.0021 });
  g.add(swarm);
  S.carriers = swarm;
  S.nCarriers = NC;

  // current-direction chevrons on both legs — hot and return, always opposed
  const chev = [];
  for (const [x, y, up] of [[0.030, 0.086, -1], [0.030, 0.048, -1], [0.235, 0.048, 1], [0.235, 0.086, 1]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.0029, 0.0078, 12),
      new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, depthWrite: false }));
    c.position.set(x, y, 0.0018);
    c.renderOrder = 16;
    c.userData.up = up;
    g.add(c);
    chev.push(c);
  }
  S.chevrons = chev;

  // phono input load
  const bw = 0.036, bh = 0.014, BX = 0.1325, BY = 0.028;
  g.add(poly([[BX - bw / 2, BY - bh / 2], [BX + bw / 2, BY - bh / 2],
    [BX + bw / 2, BY + bh / 2], [BX - bw / 2, BY + bh / 2]], 0x141a21, 0.96, 12));
  const bo = new DIAG.Trace(5, 0x848f9b, 1.3, { opacity: 0.95, renderOrder: 13 });
  bo.write((i) => [[BX - bw / 2, BY - bh / 2], [BX + bw / 2, BY - bh / 2],
    [BX + bw / 2, BY + bh / 2], [BX - bw / 2, BY + bh / 2], [BX - bw / 2, BY - bh / 2]][i].concat(0.0012));
  g.add(bo);
  S.loopAnchor = new THREE.Object3D();
  S.loopAnchor.position.set(BX, 0.004, 0);
  g.add(S.loopAnchor);

  g.position.set(CARD_X[2], -CARD_H / 2, 0);
  return g;
}

/** Velocity annotation drawn on the record itself. */
function buildRecordAnnot(S) {
  const g = new THREE.Group();
  const P = LAYOUT.ttPlinth;
  g.position.set(P.x, P.top, P.z);
  g.rotation.y = P.ry;
  const Y = Y_SURF + 0.0025;

  const circle = (r, colour, width, op) => {
    const n = 128;
    const t = new DIAG.Trace(n, colour, width, { opacity: op, renderOrder: 12 });
    t.write((i) => {
      const a = (i / (n - 1)) * TAU;
      return [Math.cos(a) * r, Y, Math.sin(a) * r];
    });
    return t;
  };
  g.add(circle(R_OUT, PAL.cy, 1.5, 0.72));
  g.add(circle(R_IN, PAL.cy, 1.5, 0.72));
  const live = circle(0.11, PAL.am, 1.4, 0.72);
  g.add(live);
  S.liveCircle = live;
  S.liveCircleWrite = (r) => {
    const n = 128;
    live.write((i) => {
      const a = (i / (n - 1)) * TAU;
      return [Math.cos(a) * r, Y, Math.sin(a) * r];
    });
  };

  // tangential velocity vectors, lengths in true proportion (0.16 m per m/s)
  const K = 0.16;
  const A_OUT = 2.60, A_IN = 4.60;        // clear quadrants, away from the arm
  const tang = (r, a) => {
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    const tx = Math.sin(a), tz = -Math.cos(a);     // platter runs clockwise from above
    const v = vAt(r) * K;
    return arrow([px, Y, pz], [px + tx * v, Y, pz + tz * v], PAL.cy, 2.0, 0.0085);
  };
  g.add(tang(R_OUT, A_OUT));
  g.add(tang(R_IN, A_IN));

  const rd = DIAG.dimension(
    [Math.cos(3.35) * R_IN, Y, Math.sin(3.35) * R_IN],
    [Math.cos(3.35) * R_OUT, Y, Math.sin(3.35) * R_OUT], { head: 0.009 },
  );
  g.add(rd);

  S.anchorOut = new THREE.Object3D();
  S.anchorOut.position.set(Math.cos(A_OUT) * R_OUT, Y, Math.sin(A_OUT) * R_OUT);
  g.add(S.anchorOut);
  S.anchorIn = new THREE.Object3D();
  S.anchorIn.position.set(Math.cos(A_IN) * R_IN, Y, Math.sin(A_IN) * R_IN);
  g.add(S.anchorIn);
  return g;
}

// ---------------------------------------------------------------------------

const S = {
  r: 0.110, phase: 0,
  live: { v: vAt(0.110), tip: 0, e: 0 },
};

export default {
  id: 'turntable',
  title: 'Groove to Voltage',
  nav: 'Turntable',
  kicker: 'Turntable',
  standfirst: 'A diamond reads a scratch, and reports how fast it moves.',
  shot: SHOT,
  timeScale: 1,
  alwaysUpdate: true,

  build(ctx) {
    const P = LAYOUT.ttPlinth;

    // ---- hardware ---------------------------------------------------------
    const hw = new THREE.Group();
    hw.position.set(P.x, P.top, P.z);
    hw.rotation.y = P.ry;

    hw.add(buildChassis());
    hw.add(buildMotorPod());

    const platter = buildPlatter();
    platter.position.y = Y_PLATTER;
    hw.add(platter);
    S.platter = platter;

    const record = buildRecord();
    record.position.y = Y_REC - Y_PLATTER;
    platter.add(record);

    const spindle = lathe([
      [0, 0.0400], [0.00360, 0.0400], [0.00360, 0.0715],
      [0.00300, 0.0740], [0, 0.0740],
    ], 24, mats().steel);
    platter.add(spindle);

    const clamp = buildClamp();
    clamp.position.y = -Y_PLATTER;
    platter.add(clamp);

    const belt = beltMesh([0, 0], R_BELT, POD, R_PULLEY, 0.0009, 0.0070);
    belt.position.y = Y_PLATTER + 0.005;
    hw.add(belt);

    hw.add(buildArmBase());
    const arm = buildArm();
    arm.rotation.y = armAngle(S.r);
    hw.add(arm);
    S.arm = arm;

    hw.traverse((o) => {
      if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) {
        o.castShadow = true; o.receiveShadow = true;
      }
    });

    // ---- overlay ----------------------------------------------------------
    const ov = new THREE.Group();
    const panel = new THREE.Group();
    panel.position.set(...PANEL_AT);
    panel.lookAt(new THREE.Vector3(...SHOT.position));
    const cardA = buildGrooveCard(S);
    const cardB = buildGraphCard(S);
    const cardC = buildGeneratorCard(S);
    panel.add(cardA, cardB, cardC);
    ov.add(panel);
    ov.add(buildRecordAnnot(S));

    const anch = (parent, x, y, z = 0) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    // ---- labels -----------------------------------------------------------
    // .wlab renders kicker as a block and text+value inline, so any label that
    // needs three lines carries its own <br>.
    const L = ctx.labels;
    L.add(anch(cardA, CARD_W[0] / 2, CARD_H + 0.026), {
      kicker: `45/45 groove — ${MAG} : 1`,
      text: `L = inner wall · R = outer wall · pitch ${(PITCH * 1e6).toFixed(0)} µm<br>`,
      value: `groove ${(GROOVE_W * 1e6).toFixed(0)} µm · tip ${(TIP_R_H * 1e6).toFixed(0)} µm across, ${(TIP_R_V * 1e6).toFixed(0)} µm along`,
    });
    L.add(S.contactAnchor, {
      kicker: 'Hertz contact',
      text: `${VTF_G.toFixed(0)} g over ${AREA_C.toExponential(1).replace('e-11', ' × 10⁻¹¹')} m²<br>`,
      value: `${(P_MEAN / 1e6).toFixed(0)} MPa = ${P_TCM2.toFixed(1)} tf/cm²`,
      cls: 'am', offset: [74, 30],
    });
    S.labVel = L.add(anch(cardB, CARD_W[1] / 2, CARD_H + 0.026), {
      kicker: 'Wall velocity · shown 1 : 1000',
      text: '±6 cm/s f.s. · 2 ms window<br>',
      value: 'L 0.00 · R 0.00 cm/s',
      cls: 'acc',
    });
    S.labEmf = L.add(anch(cardC, CARD_W[2] / 2, CARD_H + 0.026), {
      kicker: 'Moving coil · e = Bl · v',
      text: `Bl = ${(BL * 1e3).toFixed(2)} mT·m · body ${GEN_MAG} : 1, travel ×${COIL_EXAG}<br>`,
      value: `0 µV into ${R_LOAD} Ω`,
      cls: 'acc',
    });
    L.add(S.loopAnchor, {
      kicker: `One loop, two speeds · front 1 : ${(1 / T_LOOP / 1e8).toFixed(1)} × 10⁸`,
      text: `field ${(V_FIELD / 1e8).toFixed(2)} × 10⁸ m/s · carriers ${(V_DRIFT * 1e9).toFixed(2)} × 10⁻⁹ m/s<br>`,
      value: `ratio ${(SPEED_RATIO / 1e16).toFixed(1)} × 10¹⁶ · swing ±${(X_DRIFT * 1e12).toFixed(2)} pm, shown ×4 × 10⁹`,
      cls: 'am', offset: [0, 16],
    });
    L.add(S.anchorOut, {
      kicker: 'Outer groove 146.1 mm',
      text: `λ at 10 kHz = ${(lambdaAt(R_OUT) * 1e6).toFixed(0)} µm<br>`,
      value: `${V_OUT.toFixed(3)} m/s`,
      cls: 'acc', offset: [-98, 30],
    });
    L.add(S.anchorIn, {
      kicker: 'Inner groove 60.3 mm',
      text: `λ at 10 kHz = ${(lambdaAt(R_IN) * 1e6).toFixed(0)} µm<br>`,
      value: `${V_IN.toFixed(3)} m/s`,
      cls: 'acc', offset: [-30, -54],
    });
    S.labSty = L.add(anch(arm.userData.head, -0.014, 0.034, 0), {
      kicker: 'Stylus · VTF 2.00 g',
      value: 'r 110.0 mm',
      offset: [132, -58],
    });
    L.add(anch(hw, POD[0], 0.150, POD[1]), {
      kicker: 'Belt drive · 33⅓ rpm',
      text: `strobe: 120 × 50 / 33⅓ = ${STROBE_BARS} bars`,
      offset: [-104, -8],
    });

    return { hardware: hw, overlay: ov };
  },

  update(dt, t, ctx) {
    // platter: real time, and it must keep turning in the wide shot
    S.platter.rotation.y -= OMEGA * dt;
    S.r = Math.max(R_IN, S.r - R_DOT * dt);
    S.arm.rotation.y = armAngle(S.r);

    const vg = vAt(S.r);
    S.live.v = vg;

    if (ctx.stage.reveal < 0.01) return;

    // groove modulation, slowed 1 : 1000
    const ph = (TAU * F_SIG * t) / TIME_RATIO;
    S.phase = ph;
    const sL = A_L * Math.sin(ph);
    const sR = A_R * Math.sin(ph + R_PHASE);
    const vL = V_L_PK * Math.cos(ph);
    const vR = V_R_PK * Math.cos(ph + R_PHASE);
    const [u, w] = tipFromWalls(sL, sR);
    const tip = Math.hypot(vL, vR);
    const eL = DSP.backEmf(BL, vL);
    S.live.tip = tip;
    S.live.e = eL;

    S.grooveWrite(u, w);
    S.stylusAt(u, w);
    S.locusWrite(ph);
    S.decompose(u, w);
    S.graph.refresh();
    S.graphDots(vL, vR);
    S.coilAxis(sL);
    S.liveCircleWrite(S.r);

    // --- the wire ---------------------------------------------------------
    // carriers oscillate about a fixed point: x = (v_d/ω)·sin ωt = 1.43 pm peak
    const scale = S.loopLen / LOOP_LEN;                 // drawn metres per wire metre
    const off = X_DRIFT * Math.sin(ph) * CARRIER_MAG * scale;
    const N = S.nCarriers;
    S.carriers.update((i) => {
      const p = S.loopAt(((i + 0.5) / N) * S.loopLen + off);
      return { p: [p[0], p[1], 0.0014], s: 1, c: PAL.am };
    });
    // the field front: one lap of 1.2 m of wire per second on screen = 1 : 1.65×10⁸
    const f = (t % 1) / 1;
    S.front.setProgress(f);
    const hp = S.loopAt(f * S.loopLen);
    S.frontHead.position.set(hp[0], hp[1], 0.0018);
    S.frontHead.material.opacity = 0.9 * (1 - f * 0.55);

    const sgn = Math.cos(ph) >= 0 ? 1 : -1;
    for (const c of S.chevrons) c.rotation.z = c.userData.up * sgn > 0 ? 0 : Math.PI;

    if (S.labVel) S.labVel.setValue(`L ${(vL * 100).toFixed(2)} · R ${(vR * 100).toFixed(2)} cm/s`);
    if (S.labEmf) S.labEmf.setValue(`${(eL * 1e6).toFixed(0)} µV`);
    if (S.labSty) S.labSty.setValue(`r ${(S.r * 1000).toFixed(1)} mm · ${vg.toFixed(3)} m/s`);
  },

  content() {
    return `
<h3>The cut</h3>
<p>The lacquer is cut by one chisel driven by two coils at right angles, each
<span class="num">45°</span> to the disc surface. The left channel modulates the
wall facing the spindle, the right the wall facing the rim, and the polarity of
the right wall is defined so that identical signals move the tip sideways.</p>
<div class="eq">u = (L + R)/√2   <span class="c">lateral — a mono cut</span>
w = (L − R)/√2   <span class="c">vertical — the difference</span></div>
<p>So a mono record is a pure side-to-side wiggle, and out-of-phase content is
the part that tries to lift the stylus out of the groove.</p>

<h3>The generator</h3>
<p>A moving coil reports <em>velocity</em>, not position. Twenty-four turns of
<span class="num">0.80 mm</span> effective length in a
<span class="num">0.42 T</span> gap give <span class="num">Bl = 8.06 mT·m</span>:</p>
<div class="eq">e = Bl·v = <span class="hl">8.06 mV·s/m</span> × 0.050 m/s
  = 403 µV   <span class="c">at the 5 cm/s reference</span></div>
<p>Constant amplitude therefore gives an output rising 6 dB per octave, which is
exactly why the recording characteristic is written in velocity and why the
phono stage has an equaliser to undo.</p>

<h3>Two grams, five tonnes</h3>
<div class="eq">N = 19.6 mN / (2 cos 45°)  = 13.9 mN
a = (3·N·R*/4E*)<sup>⅓</sup>      = 3.03 µm
A = πa²                  = 2.9 × 10⁻¹¹ m²
p = N/A = <span class="hl">${(P_MEAN / 1e6).toFixed(0)} MPa</span> = ${P_TCM2.toFixed(1)} tf/cm²
p_max    = <span class="hl">${(P_MAX / 1e6).toFixed(0)} MPa</span>  <span class="c">Hertz peak</span></div>
<p>Hertz, with <span class="num">E</span> of 1050 GPa for diamond and 3.0 GPa
for vinyl and an ellipsoidal tip of <span class="num">18</span> µm across the
groove by <span class="num">5</span> µm along it. Vinyl yields near
<span class="num">50 MPa</span>, so the patch spreads and the true figure sits
between the fully plastic bound of <span class="num">${P_PLAS.toFixed(1)}</span>
and this <span class="num">${P_TCM2.toFixed(1)} tf/cm²</span>. The commonly quoted
<span class="num">10⁻⁹ m²</span> contact area is more than an order of
magnitude too generous.</p>

<h3>Why the last track is the worst</h3>
<p>Linear velocity falls from <span class="num">0.510</span> to
<span class="num">0.211 m/s</span>, so a 10 kHz wavelength shrinks from
<span class="num">51</span> to <span class="num">21 µm</span>. The tip's
along-groove radius of <span class="num">5 µm</span> can only follow the groove
while its minimum radius of curvature λ²/4π²A stays above that, so the traceable
peak velocity collapses from <span class="num">${(vMaxAt(R_OUT) * 100).toFixed(0)}</span> to
<span class="num">${(vMaxAt(R_IN) * 100).toFixed(0)} cm/s</span> — by exactly
(146.1/60.3)² = <span class="num">${((R_OUT / R_IN) ** 2).toFixed(2)}</span>. That is inner-groove
distortion, and no arm or cartridge can undo it.</p>

<div class="myth"><span class="lab">Commonly got wrong</span>
<p>Nothing races down the tonearm wire at the speed of the music. At
<span class="num">3.66 µA</span> in 0.03 mm² litz the carriers drift at
<span class="num">8.98 nm/s</span> and on a 1 kHz signal merely shuffle
<span class="num">±1.4 pm</span> — a hundredth of an atom. What moves at
<span class="num">1.98 × 10⁸ m/s</span> is the field. And it is a loop: every
electron that leaves the coil returns through the other conductor.</p></div>

<div class="key"><span class="lab">The idea</span>
<p>The cartridge does not measure where the wall is. It measures how fast the
wall is moving.</p></div>`;
  },

  readouts() {
    const v = S.live.v, tip = S.live.tip, e = Math.abs(S.live.e);
    return [
      { k: 'PLATTER', v: (RPM).toFixed(2), u: 'rpm' },
      { k: 'GROOVE V', v: v.toFixed(3), u: 'm/s', cls: 'acc', bar: v / V_OUT },
      { k: 'TIP V', v: (tip * 100).toFixed(2), u: 'cm/s', cls: 'acc', bar: tip / 0.06 },
      { k: 'OUTPUT', v: (e * 1e6).toFixed(0), u: 'µV', cls: 'acc', bar: e / E_REF },
      { k: 'VTF', v: VTF_G.toFixed(2), u: 'g' },
      { k: 'CONTACT P', v: (P_MEAN / 1e6).toFixed(0), u: 'MPa', cls: 'am' },
    ];
  },
};
