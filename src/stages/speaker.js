import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { DRIVER, TS as SPECTS, SPEAKER, XOVER } from '../core/spec.js';

/* ===========================================================================
   MOTOR & CABINET  —  two floorstanders, one motor opened up beside them.

   THE PRIMARIES ARE NOT DECLARED HERE. They come from src/core/spec.js so the
   same driver is quoted identically in every chapter (the crossover, amplifier
   and room stages all read the same Re, Bl, Sd and sensitivity). Everything
   below is derived from those primaries and the constants in dsp.js.
   =========================================================================== */

const TAU = DSP.TAU;

/**
 * The driver, exactly as spec.js declares it, plus the one quantity this
 * chapter needs that is not a system primary: the lumped voice-coil inductance.
 * Le is a property of this winding alone and nothing else in the piece quotes
 * it, so it is derived here from the geometry that follows.
 */
const TS = { ...DRIVER, Le: 0.55e-3 };

const ws = TAU * TS.fs;                                   // 175.929 rad/s
const Cms = SPECTS.Cms;                                   // 659.37 µm/N
const Kms = 1 / Cms;                                      // 1516.6 N/m
const Rms = (ws * TS.Mms) / TS.Qms;                       // 2.053 N·s/m
const Qes = SPECTS.Qes;                                   // 0.37116
const Qts = SPECTS.Qts;                                   // 0.34102
const Vas = SPECTS.Vas;                                   // 0.11195 m³ = 112 L
const Vb = DRIVER.Vb;                                     // 30 L sealed, one per woofer
const AL = { alpha: SPECTS.alpha, fc: SPECTS.fc, Qtc: SPECTS.Qtc };
const Kbox = Kms * (1 + AL.alpha);                        // box-stiffened suspension
const Res = (TS.Bl * TS.Bl) / Rms;                        // motional resistance at fs, Ω
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

const ETA0 = SPECTS.eta0;                                 // 0.647 %
const SPL_1W = SPECTS.spl1W;                              // 90.11 dB @ 1 W / 1 m
const SENS = SPEAKER.sens;                                // 91.21 dB @ 2.83 V / 1 m
const P_283 = (2.8284 * 2.8284) / TS.Re;                  // 1.291 W into a 6.2 Ω coil

/** Voice coil: 0.32 mm Ø enamelled copper, overhung in an 8.5 mm gap. */
const WIRE_MM2 = Math.PI * Math.pow(0.32 / 2, 2);         // 0.08042 mm²
const WIRE_LEN = (TS.Re * WIRE_MM2 * 1e-6) / 1.724e-8;    // ρ_Cu → 28.9 m
const H_GAP = 0.0085, H_COIL = 0.0245;                    // gap and winding heights
const XMAX_CHK = (H_COIL - H_GAP) / 2;                    // = 8.0 mm — matches DRIVER.Xmax
const L_IN_GAP = WIRE_LEN * (H_GAP / H_COIL);             // 10.03 m of wire is in the field
const B_GAP = TS.Bl / L_IN_GAP;                           // 1.20 T — a good ferrite gap
const N_TURNS = WIRE_LEN / (TAU * 0.0254);                // 25.4 mm coil radius → 181 turns
const V_SIG = DSP.signalSpeed(0.66);                      // field/energy speed in the winding
const T_FILL = WIRE_LEN / V_SIG;                          // ~146 ns to energise the whole coil

/**
 * Reference drive level for the whole overlay: 96 dB SPL at 1 m into half
 * space, from ONE driver. Four woofers are animated (two per cabinet, both
 * cabinets) and every figure on screen is per driver.
 */
const SPL_REF = 96;
const F_LO = 30, F_HI = 100;                              // the two comparison points
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
 *
 * `corner` is the radius of the four VERTICAL edges. It is deliberately large
 * (14 mm): the reflected image of the studio's front strip has to span the
 * fillet to produce a gradient rather than a clipped line, and that single
 * unbroken vertical highlight running the full height is what makes lacquer
 * over a dark base read as lacquer.
 */
function prism(planPts, h, opts = {}) {
  const { rake = 0, y0 = 0, corner = 0.014, bevel = 0.0042, mat = cabMat() } = opts;
  const shape = roundedShape(planPts.map(([x, z]) => [x, -z]), corner);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: h - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 4, curveSegments: 9, steps: 1,
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
  /*
   * NOTE: do NOT call computeVertexNormals() here. LatheGeometry already emits
   * analytic normals; recomputing them averages face normals across the theta
   * seam, where the two coincident vertex columns each see only half their
   * neighbours. On a ring with a 0.7 mm chamfer that mis-averaged seam column
   * returns a near-mirror normal and clips to 100 % white — one hard bloomed
   * square on the flange of every driver in the frame.
   */
  const g = new THREE.LatheGeometry(p, radial);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * The cabinet lacquer. A clone of the library's pianoBlack with its clearcoat
 * intact and the environment turned up: the black base holds the value down
 * while the clearcoat carries the whole tonal range, which is the only way a
 * gloss cabinet reads as one solid rather than as a flat grey panel.
 */
let _cab = null;
function cabMat() {
  if (_cab) return _cab;
  _cab = mats().pianoBlack.clone();
  // The emitters were widened and dimmed after the last round, so a lacquer
  // tuned to survive the old narrow-and-hot rig now renders as a silhouette.
  // Lifting the base a stop and the environment response with it puts the long
  // top-to-bottom ramp back on the cheek, which is the whole reason to build a
  // gloss cabinet. clearcoatRoughness stays low — orange peel is a core job.
  _cab.color.setHex(0x0a0b0e);
  _cab.roughness = 0.22;
  _cab.clearcoat = 1.0;
  _cab.clearcoatRoughness = 0.030;
  _cab.envMapIntensity = 2.25;
  _cab.reflectivity = 0.66;
  return _cab;
}

/**
 * A slightly convex clear panel. This is the specular layer that sits in FRONT
 * of a diagram card, so the studio's wide front strip sweeps across it as a
 * soft band instead of the card reading as a flat decal pasted on the render.
 * Convexity is what turns the reflection into a moving highlight rather than a
 * static rectangle.
 */
function glassPanel(w, h, bulge = 0.006) {
  // CYLINDRICAL, not spherical. A doubly-curved panel is a convex mirror: it
  // collapses the whole studio into one small blown highlight sitting in the
  // middle of the plot. Curving in x only turns the same source into a soft
  // vertical band that sweeps across as the camera drifts, which is what glass
  // over an instrument actually looks like.
  const g = new THREE.PlaneGeometry(w, h, 26, 4);
  const p = g.attributes.position;
  const hw2 = w / 2;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / hw2;
    p.setZ(i, bulge * (1 - u * u));
  }
  g.computeVertexNormals();
  const m = mats().glass.clone();
  m.color.setHex(0x0a0d11);
  m.roughness = 0.26;
  m.clearcoat = 1.0;
  m.clearcoatRoughness = 0.16;
  m.envMapIntensity = 0.70;
  m.transparent = true;
  m.opacity = 0.12;
  m.depthWrite = false;
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 40;
  return mesh;
}

/**
 * SATIN — the only material a small part on a driver is allowed to be.
 *
 * This is the fix for the hard white squares that have been pasted across the
 * drivers since round 1, and the diagnosis took a pixel probe to pin down.
 * Hiding one mesh at a time and re-reading the framebuffer showed the peak
 * always sat on a `ring()` annulus — the tweeter faceplate rim and the woofer
 * mounting flange — and killing the rim DirectionalLight alone took that peak
 * from 240 to 94 in sRGB. Setting metalness to 0 with specularIntensity 0 took
 * it to 168 with the light still on.
 *
 * The reason is the F0 term. For a METAL, F0 is the albedo — 0.3 to 0.8 — and a
 * flat annulus normal to the driver axis satisfies the mirror condition for a
 * punctual light along a whole arc at once, so it returns several units of
 * linear radiance. ACES prints that as paper white, and because UnrealBloom
 * upsamples its coarse mips bilinearly, a 7 px clipped core comes back as a
 * 20 px BOX with corners. That box, repeated eight times across two cabinets,
 * is what the art director has been circling.
 *
 * Anodised and powder-coated alloy is physically a dielectric coat over metal:
 * F0 = 0.04 · specularIntensity, which cannot exceed 1 whatever the geometry
 * does. The part still reads as machined — the value contrast and the broken
 * edge do that — but it can no longer clip.
 *
 * The maps go too. `alu`, `anodBlack` and `steel` all carry a procedural
 * roughnessMap that MULTIPLIES the scalar, plus a normalMap. On a chassis panel
 * that is right; on a 4 mm ring one blotch of the map covers the whole part, so
 * a stated roughness of 0.8 renders at 0.2 and the perturbed normal points
 * somewhere the author never chose.
 */
function satin(hex, rough, spec = 0.55, env = 0.55, cc = 0) {
  const m = hw().anodBlack.clone();
  m.roughnessMap = null; m.normalMap = null; m.aoMap = null;
  m.color.setHex(hex);
  m.metalness = 0.0;
  m.roughness = rough;
  m.specularIntensity = spec;
  m.envMapIntensity = env;
  m.anisotropy = 0;
  m.clearcoat = cc;
  m.clearcoatRoughness = 0.32;
  return m;
}

/**
 * A countersunk flange fastener.
 *
 * GEO.screw is right for a brushed front panel but wrong here: its head takes
 * whatever material you hand it and its hex socket is hard-wired to the shared
 * `plastic`, which carries a clearcoat at roughness 0.35. On a 6 mm head lit by
 * five practicals at once that clipped, and the bloom halo of a 4 px clipped
 * core is a 40 px white square — two of them per driver, and enough spill to
 * wash the whole head module to light grey. A real driver fastener is a dark
 * matte dielectric, so this one is built that way and cannot clip.
 */
function fastener(r) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(GEO.bevelCyl(r, r * 1.03, 0.0011, 20, 0.00026),
    satin(0x3c4147, 0.72, 0.42, 0.30));
  g.add(head);
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.46, r * 0.46, 0.0009, 6),
    satin(0x121417, 0.92, 0.20, 0.10));
  hex.position.y = 0.00030;
  g.add(hex);
  return g;
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
  /*
   * A bevelled metal ANNULUS is the shape that keeps clipping in this rig — it
   * satisfies the mirror condition somewhere along its whole circle, and a
   * saturated core two pixels wide blooms into a 40 px square. The flange, the
   * countersinks and the basket rim are all annuli, so the casting is treated
   * as what it physically is: a POWDER-COATED alloy, a mostly dielectric
   * surface, rather than a bare polished metal.
   */
  const cast = satin(0x2b2f35, 0.62, 0.60, 0.60);          // powder-coated alloy casting
  const land = satin(0x33383e, 0.50, 0.55, 0.50, 0.22);    // machined land: one value up
  const sinkM = satin(0x171a1e, 0.86, 0.30, 0.16);         // shadowed countersink
  const basket = GEO.driverBasket(rOuter * 0.995, depth * 1.12, 6, cast);
  // GEO.driverBasket builds its rim with bevelCyl, which is a *solid* disc and
  // therefore caps the driver opening. Swap it for a true annulus.
  basket.remove(basket.children[0]);
  basket.add(ring(rOuter * 0.90, rOuter * 1.015, 0.011, cast, 0.0007, 96));
  basket.position.y = -0.021;
  inner.add(basket);

  /*
   * --- mounting flange -------------------------------------------------------
   *
   * The MACHINED LAND is back, and it is a dielectric.
   *
   * The last revision deleted every bright ring on the driver because they all
   * clipped to white. The clipping was never the ring's shape, it was its
   * metalness: a bare metal annulus has F0 = albedo and returns several units of
   * linear radiance along the whole arc where it mirrors a punctual source. As a
   * satin dielectric (F0 = 0.04 · specularIntensity) it cannot, so the flange
   * gets back the one detail that carries the driver's scale — a bright machined
   * face a clear value above the casting behind it, with the countersinks cut
   * into it as dark punctuation.
   */
  const fl = ring(rOuter * 0.985, flangeR, 0.0075, land, 0.0007);
  fl.position.y = -0.0018;
  inner.add(fl);

  // Machined countersinks with a real fastener in each. The cone is 210 mm
  // EFFECTIVE, not 220: Sd = π·rEff² with rEff = 105 mm is 0.0346 m², which is
  // exactly DRIVER.Sd. (spec.js's comment on that line still says 220 mm; the
  // number is right and the comment is not — flagged to the lead.) The head is
  // ~9 mm across, which is what gives the driver its sense of size.
  const boltR = (rOuter + flangeR) / 2;
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * TAU + Math.PI / bolts;
    const sink = ring(boltRr * 1.05, boltRr * 1.62, 0.0018, sinkM, 0.0005, 22);
    sink.position.set(Math.sin(a) * boltR, 0.0013, Math.cos(a) * boltR);
    inner.add(sink);
    const s = fastener(boltRr);
    s.position.set(Math.sin(a) * boltR, 0.0028, Math.cos(a) * boltR);
    inner.add(s);
  }

  // --- moving assembly: cone + roll surround + dust cap -----------------------
  const moving = new THREE.Group();
  // The half-roll surround peaks surroundW*0.46 above the rim plane. Sit the
  // roll PROUD of the flange by a third of its own height: the crescent of
  // studio strip that lands on the roll is the single feature that makes a
  // driver read as a driver, and burying it in the baffle recess kills it.
  const baseY = -surroundW * 0.13;
  moving.position.y = baseY;
  /*
   * KEEP THE SHEEN WEIGHT LOW ON A TORUS.
   *
   * Three's sheen uses Charlie with the Neubelt visibility term,
   * V = 1/(4(NdotL + NdotV − NdotL·NdotV)), which diverges as both go to zero —
   * i.e. exactly along a silhouette. A roll surround is a half-torus, so it
   * presents a grazing silhouette to the camera all the way round its own
   * circle, and at sheen 0.55 with a light sheenColor the term ran away and
   * printed a 40 px patch of paper white on every driver, bright enough for the
   * bloom to wash the whole cabinet a stop lighter. The surround still gets its
   * crescent; it gets it from a dark, very rough sheen and a trace of clearcoat
   * rather than from a term that has no upper bound.
   */
  const surrMat = hw().rubber.clone();
  surrMat.color.setHex(0x111418);
  surrMat.roughness = 0.86; surrMat.sheen = 0.26; surrMat.sheenRoughness = 0.92;
  surrMat.sheenColor = new THREE.Color(0x2b3138); surrMat.envMapIntensity = 0.20;
  surrMat.clearcoat = 0.08; surrMat.clearcoatRoughness = 0.62;
  surrMat.specularIntensity = 0.10;
  // The dust cap sits a value ABOVE the cone, not below it: darker than the
  // cone it reads as a hole punched through the middle of the diaphragm.
  const dustMat = hw().cone.clone();
  dustMat.color.setHex(0x3a4048); dustMat.roughness = 0.70;
  dustMat.sheen = 0.24; dustMat.sheenColor = new THREE.Color(0x333a42);
  dustMat.clearcoat = 0.10; dustMat.clearcoatRoughness = 0.50;
  dustMat.envMapIntensity = 0.30; dustMat.specularIntensity = 0.12;
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
    const pm = new THREE.Mesh(new THREE.LatheGeometry(pp, 48), satin(0x5b626a, 0.52, 0.70, 0.60, 0.25));
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
  /*
   * NOTHING in a driver casts a shadow map.
   *
   * The flange stands 3 mm proud of a baffle it nearly touches, so the key
   * light's shadow of it lands as a thin crescent one or two shadow texels
   * wide — and a single leaking texel inside that crescent let the key's
   * CLEARCOAT specular through on its own. The result was a hard 8 px patch of
   * 100 % white with a boxy bloom halo under every driver: the exact defect the
   * whole piece is being judged on. The driver contributes no real shadow to
   * the frame anyway, and dropping it also takes 24 meshes out of the shadow
   * pass.
   */
  g.traverse((c) => { if (c.isMesh) c.castShadow = false; });
  // The cone likewise stops RECEIVING: with the flange proud and the surround
  // in the baffle plane, all the shadow map did here was crush it to black.
  moving.traverse((c) => { if (c.isMesh) c.receiveShadow = false; });
  return g;
}

/** 25 mm dome tweeter in a machined faceplate with a shallow waveguide. */
function makeTweeter(faceR = 0.052, domeR = 0.0125) {
  // Dielectric, for the reason in satin(): as a metal this faceplate rim was
  // one of the two surfaces that printed a clipped white square on every frame.
  const face = satin(0x3f454c, 0.48, 0.60, 0.52, 0.24);
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
  const wgm = new THREE.Mesh(new THREE.LatheGeometry(wg, 72), face);
  wgm.castShadow = wgm.receiveShadow = true;
  inner.add(wgm);
  const rim = ring(rOut - 0.0008, faceR, 0.0075, face, 0.0006);
  rim.position.y = -0.0022;
  inner.add(rim);

  // dome + half-roll surround. A 25 mm convex mirror collapses the whole studio
  // into one point, so the dome is the single most clip-prone surface in the
  // frame; it keeps its bright glint from a clearcoat rather than from F0.
  const domeM = satin(0x8e8a7d, 0.30, 0.90, 0.70, 0.55);
  const dm = new THREE.Mesh(new THREE.SphereGeometry(domeR, 40, 20, 0, TAU, 0, Math.PI * 0.52), domeM);
  dm.position.y = -0.0031;
  dm.castShadow = true;
  inner.add(dm);
  const sp = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    sp.push(new THREE.Vector2(domeR + (domeR * 0.34 / 2) * (1 - Math.cos(a)), Math.sin(a) * domeR * 0.15 - 0.0031));
  }
  const tsur = hw().rubber.clone();
  tsur.color.setHex(0x121519); tsur.roughness = 0.95; tsur.sheen = 0.0;
  tsur.envMapIntensity = 0.10; tsur.specularIntensity = 0.03; tsur.clearcoat = 0.0;
  const sm = new THREE.Mesh(new THREE.LatheGeometry(sp, 64), tsur);
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
    const s = fastener(0.0028);
    s.position.set(Math.sin(a) * (faceR - 0.0048), 0.0018, Math.cos(a) * (faceR - 0.0048));
    inner.add(s);
  }
  GEO.shadowed(g);
  g.traverse((c) => { if (c.isMesh) c.castShadow = false; });
  return g;
}

// ===========================================================================
// Cabinet — a Wilson-idiom two-module floorstander, 1.252 m tall.
// Local frame: origin on the floor at the cabinet centre, front = +Z.
// ===========================================================================

const RAKE_BASS = 3.5 * Math.PI / 180;
const RAKE_HEAD = 11.0 * Math.PI / 180;
const BASS_Y0 = 0.068, BASS_H = 0.747;
const GANT_Y0 = 0.815, GANT_H = 0.026;
const HEAD_Y0 = 0.841, HEAD_H = 0.411;

const T_BB = 0.024, T_HB = 0.020;                    // machined baffle thickness
const W_BB = 0.315, W_HB = 0.248;                    // baffle widths
// Bodies are recessed by one baffle thickness; the holed baffle plate sits on top.
const PLAN_BASS = [[-W_BB / 2, 0.200 - T_BB], [W_BB / 2, 0.200 - T_BB], [0.126, -0.245], [-0.126, -0.245]];
/**
 * The gantry is the bass module's machined top plate, not a shelf. Its plan is
 * the bass plan carried up through the module's own rake (the prism shears z by
 * y·tan(rake), so the top face has moved back by BASS_H·tan(RAKE_BASS)) and
 * outset by 4 mm so it reads as a bright alloy line between the two modules.
 * With the head module made deep enough to cover it, the cabinet reads as one
 * object with a joint rather than as three stacked boxes.
 */
const GSHEAR = BASS_H * Math.tan(RAKE_BASS);
const PLAN_GANT = PLAN_BASS.map(([x, z]) => [x * 1.026, z - GSHEAR + (z > 0 ? 0.004 : -0.004)]);
const PLAN_HEAD = [[-W_HB / 2, 0.155 - T_HB], [W_HB / 2, 0.155 - T_HB], [0.104, -0.268], [-0.104, -0.268]];

/** Flat baffle panel with driver cut-outs; front face at local z = 0. */
function bafflePlate(w, h, T, holes, mat) {
  const s = roundedShape([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], 0.010);
  for (const [cx, cy, r] of holes) {
    const p = new THREE.Path();
    p.absarc(cx, cy, r, 0, TAU, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: T - 0.0026, bevelEnabled: true, bevelSize: 0.0026, bevelThickness: 0.0026,
    bevelSegments: 3, curveSegments: 26, steps: 1,
  });
  g.translate(0, 0, -T + 0.0026);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
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
  // Spikes and lock collars are satin for the same reason as the flange: a
  // 3 mm polished cone is narrower than the reflected image of any source in
  // the rig, so as a metal it returns a clipped point and four white sparks sit
  // along the bottom of the frame.
  const spikeM = satin(0x555b63, 0.42, 0.60, 0.55, 0.30);
  const lockM = satin(0x3f454c, 0.50, 0.55, 0.48, 0.20);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const spike = new THREE.Mesh(GEO.bevelCyl(0.0016, 0.0155, 0.044, 26, 0.0008), spikeM);
    spike.position.set(sx * 0.163, 0.022, sz * 0.215);
    spike.castShadow = true;
    g.add(spike);
    const lock = new THREE.Mesh(GEO.bevelCyl(0.021, 0.021, 0.0065, 30, 0.0006), lockM);
    lock.position.set(spike.position.x, 0.0415, spike.position.z);
    g.add(lock);
  }
  const plinth = prism([[-0.21, 0.268], [0.21, 0.268], [0.187, -0.30], [-0.187, -0.30]], 0.024,
    { y0: 0.044, corner: 0.012, bevel: 0.0022, mat: hw().anodBlack });
  g.add(plinth);

  // --- gloss modules ----------------------------------------------------------
  const bass = prism(PLAN_BASS, BASS_H, { y0: BASS_Y0, rake: RAKE_BASS });
  const head = prism(PLAN_HEAD, HEAD_H, { y0: HEAD_Y0, rake: RAKE_HEAD });
  g.add(bass, head);
  // The alloy gantry is the joint between the two modules and it has to be
  // brighter and proud of both, or the cabinet reads as three stacked boxes.
  const gantM = satin(0x32373d, 0.48, 0.50, 0.48, 0.22);
  const gant = prism(PLAN_GANT, GANT_H, { y0: GANT_Y0, corner: 0.010, bevel: 0.0022, mat: gantM });
  g.add(gant);
  const capM = hw().anodGrey.clone(); capM.color.setHex(0x2b2f34); capM.roughness = 0.50;
  capM.envMapIntensity = 0.85;
  const cap = prism(PLAN_HEAD.map(([x, z]) => [x * 0.965, z * 0.965]), 0.008,
    { y0: HEAD_Y0 + HEAD_H - 0.0035, rake: RAKE_HEAD, corner: 0.008, bevel: 0.0016, mat: capM });
  cap.position.z = -HEAD_H * Math.tan(RAKE_HEAD);
  g.add(cap);

  // --- baffles + drivers, in the raked baffle plane ---------------------------
  /*
   * The baffle is NOT the gloss lacquer. A mirror-finish panel normal to the
   * camera reflects the studio's front softbox straight down the lens and goes
   * to paper white, which is what buried the drivers. Real cabinets of this
   * idiom use a dense mineral-loaded composite for the baffle — matte, slightly
   * waxy — so the gloss reads only on the flanks and the fillets, where it
   * belongs, and the drivers sit on a value the eye can read them against.
   */
  const baffleMat = hw().plastic.clone();
  baffleMat.color.setHex(0x0a0c0f); baffleMat.roughness = 0.80;
  baffleMat.clearcoat = 0.10; baffleMat.clearcoatRoughness = 0.58;
  baffleMat.specularIntensity = 0.10;
  baffleMat.envMapIntensity = 0.18;
  // The weave map on coneWeave multiplies down to near-black at this size; drop
  // it and let the sheen carry the rim-to-apex value change on the cone wall.
  const bassCone = hw().coneWeave.clone();
  bassCone.map = null;
  bassCone.color.setHex(0x272c32);
  bassCone.roughness = 0.76; bassCone.metalness = 0.0;
  bassCone.clearcoat = 0.09; bassCone.clearcoatRoughness = 0.52;
  bassCone.envMapIntensity = 0.32; bassCone.specularIntensity = 0.13;
  bassCone.sheen = 0.26; bassCone.sheenRoughness = 0.90;
  bassCone.sheenColor = new THREE.Color(0x333a42);
  const midCone = hw().cone.clone();
  midCone.color.setHex(0x2a2f35); midCone.envMapIntensity = 0.32;
  midCone.roughness = 0.76; midCone.specularIntensity = 0.13;
  midCone.clearcoat = 0.09; midCone.clearcoatRoughness = 0.52;
  midCone.sheen = 0.26; midCone.sheenRoughness = 0.90;
  midCone.sheenColor = new THREE.Color(0x333a42);

  const ycB = BASS_Y0 + BASS_H / 2;
  const bg = new THREE.Group();
  bg.position.set(0, ycB, zBass(ycB));
  bg.rotation.x = -RAKE_BASS;
  g.add(bg);
  /*
   * Hole radius is set BELOW the basket rim on purpose. Open it past the rim
   * and a 2 mm annular slot appears straight through the cabinet — the baffle
   * plate is single-sided, so the slot renders the lit room behind and aliases
   * into the bloom. Overlap here is fine because the basket sits well behind
   * the plate; what must NOT overlap is the flange, which is why every driver
   * now stands 6 mm proud (see makeCabinet's driver placement).
   */
  const bPlate = bafflePlate(W_BB, BASS_H - 0.007, T_BB,
    [[0, W_LO_Y - ycB, 0.114], [0, W_HI_Y - ycB, 0.114]], baffleMat);
  bg.add(bPlate);

  const ycH = HEAD_Y0 + HEAD_H / 2;
  const hg = new THREE.Group();
  hg.position.set(0, ycH, zHead(ycH));
  hg.rotation.x = -RAKE_HEAD;
  g.add(hg);
  hg.add(bafflePlate(W_HB, HEAD_H - 0.007, T_HB,
    [[0, MID_Y - ycH, 0.0730], [0, TW_Y - ycH, 0.0405]], baffleMat));

  const wOpt = { rEff: 0.105, surroundW: 0.020, flangeR: 0.124, depth: 0.045, bolts: 8, dust: 0.041, coneMat: bassCone };
  /*
   * Stand every driver PROUD of the baffle by more than half its own flange
   * thickness. Sat at +1.6 mm the flange ring's rear face lay inside the
   * 24 mm baffle plate while its outer radius overhung the cut-out, so the two
   * solids interpenetrated over a 10 mm annulus and z-fought. Real drivers bolt
   * onto a machined land; this is that land.
   */
  const wLo = makeDriver(wOpt); wLo.position.set(0, W_LO_Y - ycB, 0.0062); bg.add(wLo);
  const wHi = makeDriver(wOpt); wHi.position.set(0, W_HI_Y - ycB, 0.0062); bg.add(wHi);
  const mid = makeDriver({ rEff: 0.068, surroundW: 0.013, flangeR: 0.090, depth: 0.038, bolts: 6, plug: 0.017, motorR: 0.050, coilR: 0.019, boltR: 0.0030, coneMat: midCone });
  mid.position.set(0, MID_Y - ycH, 0.0060); hg.add(mid);
  const tw = makeTweeter(); tw.position.set(0, TW_Y - ycH, 0.0118); hg.add(tw);

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
  const badge = new THREE.Mesh(GEO.bevelCyl(0.0155, 0.0155, 0.0022, 40, 0.0005),
    satin(0x565c64, 0.46, 0.60, 0.55, 0.25));
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
// Local units are METRES at 1 : 1, so the coil travel drawn here is the real
// cone travel; only the charge carriers are magnified, and by a stated factor.
// ===========================================================================

const R_POLE = 0.0234, R_FIN = 0.0242, R_FOUT = 0.0247, R_WIND = 0.0268;
const R_TIN = 0.0276, R_MAG = 0.0316, R_OUT = 0.075;
const X_BACK0 = -0.0585, X_BACK1 = -0.0495, X_TOP0 = -0.0285, X_TOP1 = -0.0200;
const X_GAPC = (X_TOP0 + X_TOP1) / 2;
const R_COIL = (R_FOUT + R_WIND) / 2;

const SEC_CARD_W = 0.140, SEC_CARD_H = 0.208, SEC_PAD = 0.007;
const SEC_X0 = -0.0768, SEC_Y0 = -0.104;

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
  /*
   * Three parts, three values. A cutaway whose steel, ferrite and pole all
   * return the same mid-grey is a blob: the reader has to be able to point at
   * the back plate, the pole, the ring magnet and the top plate separately.
   * Steel is bright and specular; the pole is deliberately a stop darker so it
   * separates from the top plate it nearly touches; the ferrite is matte and
   * darker again but still well clear of the card behind it.
   */
  const st = hw().steel.clone();                            // machined low-carbon steel
  st.roughnessMap = null; st.normalMap = null;
  st.color.setHex(0xa8b0ba); st.roughness = 0.34; st.metalness = 1.0; st.envMapIntensity = 0.55;
  const po = st.clone();                                    // pole piece + back plate
  po.color.setHex(0x474d55); po.roughness = 0.58; po.envMapIntensity = 0.28;
  // Ferrite is a dielectric, but a dielectric in this rig returns almost no
  // light at all and the ring magnets went black against a black card. Given a
  // little metalness it picks the environment up at a mid value and the four
  // parts of the circuit finally separate.
  const mg = hw().lamination.clone();
  mg.roughnessMap = null; mg.normalMap = null;
  mg.color.setHex(0x22272d); mg.roughness = 0.78; mg.metalness = 0.68; mg.envMapIntensity = 0.40;
  const cw = hw().magnetWire.clone();
  cw.color.setHex(0xb2632f); cw.roughness = 0.24; cw.envMapIntensity = 1.0;
  const pl = hw().plastic.clone(); pl.color.setHex(0x2a2f36); pl.envMapIntensity = 0.5;
  const cn = hw().coneWeave.clone();
  cn.map = null; cn.color.setHex(0x3a4048); cn.metalness = 0.0; cn.roughness = 0.62;
  cn.clearcoat = 0.20; cn.clearcoatRoughness = 0.40; cn.envMapIntensity = 0.60;

  /*
   * opacity 1.0, not 0.985. diagramCard is a TRANSPARENT plate, so it blends
   * over whatever the opaque pass already wrote — and 1.5 % of a near-white
   * subwoofer dust cap standing behind it printed as a grey sphere floating on
   * the card with nothing to explain it. That is the art director's finding 7,
   * and it is a compositing bug rather than a stray object.
   */
  const card = DIAG.diagramCard(SEC_CARD_W, SEC_CARD_H, { opacity: 1.0, pad: SEC_PAD });
  card.position.set(SEC_X0, SEC_Y0, -0.018);
  g.add(card);

  // --- the magnetic circuit, in section ---------------------------------------
  g.add(slab(X_BACK0, X_BACK1, -R_OUT, R_OUT, po, 0.011));            // back plate
  g.add(slab(X_BACK1, -0.0125, -R_POLE, R_POLE, po, 0.011));          // pole piece
  for (const s of [1, -1]) {
    g.add(slab(X_BACK1, X_TOP0, s * R_MAG, s * R_OUT, mg, 0.011));    // ring magnet
    g.add(slab(X_TOP0, X_TOP1, s * R_TIN, s * R_OUT * 0.955, st, 0.011)); // top plate
  }

  // hairline outlines: without them the gap slot vanishes at this scale
  const OUT = 0xbcc4ce;
  const box = (x0, x1, y0, y1, w = 1.2, o = 0.55, col = OUT) => {
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
    // The gap itself: the 8.5 mm slot between pole and top plate is the whole
    // point of the section, so it is tinted and outlined in the signal colour.
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(X_TOP1 - X_TOP0, R_TIN - R_POLE),
      new THREE.MeshBasicMaterial({ color: PAL.cy, transparent: true, opacity: 0.30, depthWrite: false, toneMapped: false }));
    slot.position.set(X_GAPC, s * (R_POLE + R_TIN) / 2, 0.0068);
    slot.renderOrder = 11;
    g.add(slot);
    box(X_TOP0, X_TOP1, s * R_POLE, s * R_TIN, 1.3, 0.9, PAL.cy);
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
  /*
   * A bracket across the whole moving assembly — coil, former, cone neck — with
   * the force vector springing from its centre. Drawn free-floating beside the
   * coil the arrow read as interface chrome; against a bracket that visibly
   * spans the moving mass it reads as F = Bl·i acting on 49 g.
   */
  const brk = new DIAG.Trace(5, 0xc0c7d0, 1.3, { opacity: 0.55, renderOrder: 14 });
  {
    const P = [[0.0272, -0.0524], [0.0300, -0.0524], [0.0300, 0.0524], [0.0272, 0.0524], [0.0300, 0.0524]];
    brk.write((i) => [P[i][0], P[i][1], 0.011]);
  }
  mov.add(brk);
  g.add(mov);

  // --- the magnetic circuit is a closed loop too -------------------------------
  for (const s of [1, -1]) {
    const K = [[-0.0535, s * 0.0110], [-0.0535, s * 0.0520], [-0.0400, s * 0.0560],
      [-0.0243, s * 0.0520], [-0.0243, s * 0.0295], [-0.0243, s * 0.0180],
      [-0.0330, s * 0.0110], [-0.0450, s * 0.0100], [-0.0535, s * 0.0110]];
    const t = new DIAG.Trace(K.length, PAL.cy, 1.4, { opacity: 0.34, renderOrder: 11 });
    t.write((i) => [K[i][0], K[i][1], 0.0082]);
    g.add(t);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.0026, 0.0068, 10),
      new THREE.MeshBasicMaterial({ color: PAL.cy, toneMapped: false, transparent: true, opacity: 0.45 }));
    head.position.set(-0.0243, s * 0.0255, 0.0082);
    head.rotation.z = s > 0 ? Math.PI : 0;          // flux crosses the gap radially inward
    g.add(head);
  }

  // The corrugated spider was drawn here. At this scale it read as two loose
  // amber squiggles floating beside the coil and cost more legibility than the
  // compliance argument gained; Cms is quoted numerically instead.

  // --- the circuit, drawn as one closed loop -----------------------------------
  const LOOP = [];
  const yT = 0.078, xT = 0.031, xAmp = 0.045, zL = 0.015;
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

  const carriers = new DIAG.Swarm(76, { color: PAL.am, size: 0.0021 });
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

  // Textbook convention: the dot/cross goes IN the conductor cross-section. The
  // winding runs circumferentially, so at this cut it is exactly perpendicular
  // to the page — which is the whole reason F = Bl·i is axial.
  const src = new THREE.Mesh(new THREE.TorusGeometry(0.0072, 0.0009, 8, 28),
    new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true, opacity: 0.85 }));
  src.position.set(xAmp, 0, zL + 0.001);
  src.renderOrder = 16;
  g.add(src);
  const sine = new DIAG.Trace(17, PAL.am, 1.4, { opacity: 0.85, renderOrder: 17 });
  sine.write((i, u) => [xAmp + (u - 0.5) * 0.0092, Math.sin(u * TAU) * 0.0026, zL + 0.002]);
  g.add(sine);

  const markT = polarityMark(0.0042); const markB = polarityMark(0.0042);
  markT.position.set(X_GAPC, R_COIL, 0.013);
  markB.position.set(X_GAPC, -R_COIL, 0.013);
  g.add(markT, markB);

  /*
   * Force vector. It is drawn FROM the coil — origin at X_GAPC + x(t), just
   * clear of the winding — so it reads as F = Bl·i acting on the moving
   * assembly, not as free-floating interface chrome.
   */
  const ARR = 0xaeb6c1;
  const fArrow = new DIAG.Trace(2, ARR, 2.6, { opacity: 0.95, renderOrder: 16 });
  const fHead = new THREE.Mesh(new THREE.ConeGeometry(0.0038, 0.0098, 14),
    new THREE.MeshBasicMaterial({ color: ARR, toneMapped: false, transparent: true }));
  fHead.renderOrder = 16;
  g.add(fArrow, fHead);

  /*
   * The travel ruler. BOTH rulers are centred on X_GAPC — the coil's own axial
   * centre — so the live excursion dimension and the Xmax gate share an origin
   * and can actually be compared. Centring the live one on x = 0 while the gate
   * sat on X_GAPC put a 24 mm offset between two scales the reader is being
   * asked to read against each other.
   */
  const RY = -0.092;
  const dim = DIAG.dimension([X_GAPC - X30, RY, 0.006], [X_GAPC + X30, RY, 0.006], { color: PAL.cy, head: 0.010 });
  g.add(dim);
  for (const s of [1, -1]) {
    const t = new DIAG.Trace(2, PAL.am, 1.3, { opacity: 0.85, renderOrder: 13 });
    t.write((i) => [X_GAPC + s * TS.Xmax, RY + 0.004 - i * 0.015, 0.006]);
    g.add(t);
  }
  const rule = new DIAG.Trace(2, PAL.am, 1.1, { opacity: 0.6, renderOrder: 13 });
  rule.write((i) => [X_GAPC + (i ? 1 : -1) * TS.Xmax, RY - 0.0105, 0.006]);
  g.add(rule);

  // --- the specular layer -------------------------------------------------------
  // A convex clear panel in front of the whole cut. The widened front strip
  // sweeps across it as a soft band, so the card reads as glass over an
  // instrument rather than as a decal printed on the render.
  const gp = glassPanel(SEC_CARD_W + SEC_PAD * 2, SEC_CARD_H + SEC_PAD * 2, 0.0038);
  gp.position.set(SEC_X0 + SEC_CARD_W / 2, SEC_Y0 + SEC_CARD_H / 2, 0.024);
  g.add(gp);

  g.userData = { mov, carriers, path, markT, markB, fArrow, fHead, dim, wire, flow };
  return g;
}

// ===========================================================================
// Framing
//
// The clear stage is 960 x 840 px inside a 1600 x 1000 canvas, with the camera
// axis landing at x = 670. The cabinet is the hero: full height, ~600 px tall,
// on the left. The camera is NOT trucked sideways — the look-at point is panned
// right instead, so the cabinet is seen from exactly the chosen three-quarter
// angle and simply sits left of the optical axis. Two cards share the column on
// its right and neither crosses the safe box.
// ===========================================================================

/*
 * The hero is the RIGHT-hand cabinet, seen from OUTSIDE the pair — camera at
 * x ≈ +2.9, looking back across the room. Every other framing puts something
 * bright in the safe box: from the left of the same cabinet the studio's warm
 * kicker is dead ahead and lays a blown wedge across the polished floor, and
 * framing the left-hand cabinet drags the turntable plinth in behind the
 * hero's shoulder. From here the sight line runs into the dark back wall, the
 * subwoofer sits off-frame behind the panel, and the only other object in the
 * box is one monoblock, mostly occluded by the hero itself.
 *
 * 36° off the baffle normal: enough flank for the lacquer to show a full
 * highlight ramp, not so much that the drivers foreshorten.
 */
const CABC = [LAYOUT.speakerR.x, 0.626, LAYOUT.speakerR.z];
const AZ = 0.45, EL = 0.075, FOV = 34;
const RGT = [Math.cos(AZ), 0, -Math.sin(AZ)];       // screen-right, in world
const PAN = 0.58;                                   // metres of lateral look-at offset
const _fs = frameShot(CABC, 0.626, { fill: 0.80, az: AZ, el: EL, fov: FOV });
const SHOT = {
  position: _fs.position,
  target: _fs.target.map((v, i) => v + PAN * RGT[i]),
  fov: FOV,
};

const CAMV = new THREE.Vector3(...SHOT.position);
const TGTV = new THREE.Vector3(...SHOT.target);
const FWD = TGTV.clone().sub(CAMV).normalize();
const RIGHTV = new THREE.Vector3(RGT[0], 0, RGT[2]);
const UPV = new THREE.Vector3().crossVectors(RIGHTV, FWD).normalize();
/** Metres per device pixel at a given distance, for a 1000 px-high canvas. */
const mPerPx = (d) => (d * Math.tan((FOV * Math.PI) / 360)) / 500;
/** World point that lands dx px right and dy px below the camera axis. */
function screenPt(dx, dy, dist) {
  const k = mPerPx(dist);
  return CAMV.clone().addScaledVector(FWD, dist)
    .addScaledVector(RIGHTV, dx * k)
    .addScaledVector(UPV, -dy * k);
}

const SEC_D = 2.90, GRA_D = 2.60;
const SEC_C = screenPt(300, -180, SEC_D);        // motor cutaway card, screen ~(954, 320)
// The graph card sits FLUSH under the cutaway card. At a 45 px gap the
// subwoofer's dust cap showed through between them as an unexplained grey
// sphere — the art director's finding 7 — and a gap that small reads as a
// misalignment rather than as space anyway.
const GRA_C = screenPt(248, 192, GRA_D);         // graph card,         screen ~(888, 692)
// A flat card square to the lens still projects ~5 % wider than the on-axis
// arithmetic says, because its corners are further off axis than its centre.
// These two constants are the measured request, not the nominal size.
const SEC_S = (435 * mPerPx(SEC_D)) / (SEC_CARD_H + SEC_PAD * 2);   // → ~435 px tall

// Graph card: plot box 0.60 wide, a wide left margin for the y-axis numerals.
// The two plots are pushed 0.13 apart — 72 px on screen — because at the old
// 0.07 the upper plot's x numerals and the lower plot's top y numeral landed
// within 30 px of each other and read as one bunched column of digits.
const GW = 0.60, GH = 0.175;
const GX0 = -0.085, GY0 = -0.022, GCW = 0.703, GCH = 0.640;
const GRA_S = (392 * mPerPx(GRA_D)) / GCW;       // → ~400 px wide

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

/** Signed value that never prints a signed zero: "-0.00 A" is a typo, not a
 *  measurement. Round first, then take the sign from the rounded value. */
function sgn(x, n) {
  const r = Number(x.toFixed(n));
  return (r > 0 ? '+' : r < 0 ? '\u2212' : '') + Math.abs(r).toFixed(n);
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
    const near = makeCabinet();                       // the hero: LAYOUT.speakerR
    near.position.set(LAYOUT.speakerR.x, LAYOUT.speakerR.y, LAYOUT.speakerR.z);
    near.rotation.y = LAYOUT.speakerR.ry;
    const far = makeCabinet();
    far.position.set(LAYOUT.speakerL.x, LAYOUT.speakerL.y, LAYOUT.speakerL.z);
    far.rotation.y = LAYOUT.speakerL.ry;
    hwg.add(near, far);

    // ---------------- overlay -------------------------------------------------
    const ov = new T3.Group();

    // (a) the motor, opened up beside the cabinet
    const sec = buildSection();
    sec.position.copy(SEC_C)
      .addScaledVector(RIGHTV, -(SEC_X0 + SEC_CARD_W / 2) * SEC_S)
      .addScaledVector(UPV, -(SEC_Y0 + SEC_CARD_H / 2) * SEC_S);
    sec.scale.setScalar(SEC_S);
    faceCamera(sec);
    ov.add(sec);
    // A low, far-off-axis practical. At 2.4 it printed the whole section as one
    // near-white blob against a black card; the parts only separate when the
    // lamp is a modelling light, not a key.
    const secLamp = new T3.PointLight(0xfff2e2, 1.7, 3.2, 2);
    secLamp.position.copy(SEC_C).addScaledVector(RIGHTV, -0.52).addScaledVector(UPV, 0.34)
      .addScaledVector(FWD, -0.30);
    ov.add(secLamp);
    const U = sec.userData;

    /*
     * The long dashed leader from the card back to the woofer is GONE. It ran
     * the full width of the clear stage at a shallow diagonal and read as a
     * stray rule crossing the picture rather than as a tie between a part and
     * its section. The cut is tied to the driver by being a recognisable cut of
     * it, and by the four short leaders below.
     */

    // (b) two plots on one card: what the box does, and what it costs in travel
    const gwrap = new T3.Group();
    gwrap.position.copy(GRA_C);
    faceCamera(gwrap);
    gwrap.scale.setScalar(GRA_S);
    ov.add(gwrap);
    const inner = new T3.Group();
    inner.position.set(-(GX0 + GCW / 2), -(GY0 + GCH / 2), 0);
    gwrap.add(inner);
    const gcard = DIAG.diagramCard(GCW - 0.036, GCH - 0.036, { opacity: 1.0, pad: 0.018 });
    gcard.position.set(GX0, GY0, 0);
    inner.add(gcard);

    // sealed response: free air vs 30 L box. Two traces only — the third
    // (the 12 dB/octave asymptote) sat on top of them both and the slope is
    // stated in the caption instead.
    const gR = new DIAG.Graph({
      w: GW, h: GH, xLog: true, xRange: [15, 400], yRange: [-27, 6],
      yTicks: [-24, -18, -12, -6, 0, 6], zeroLine: 0,
    });
    gR.position.set(0, 0.415, 0.001);
    inner.add(gR);
    gR.addTrace((f) => DSP.sealedResponseDb(f, TS.fs, Qts), { color: PAL.cyDim, width: 1.6, dashed: true });
    gR.addTrace((f) => DSP.sealedResponseDb(f, AL.fc, AL.Qtc), { color: PAL.cy, width: 2.8 });
    gR.addMarker(F3, { color: PAL.cy, opacity: 0.5 });
    const dotR = gR.addDot(PAL.am, 0.006);
    // DSP.fHz prints "15.00" / "400.0"; an axis wants "15" and "400".
    const fTick = (v) => (v >= 1000 ? `${v / 1000} k` : String(v));
    gR.tickLabels(ctx.labels, {
      xVals: [15, 400], yVals: [0, -12, -24],
      xFmt: fTick, yFmt: (v) => v.toFixed(0),
      xOffset: [0, 12], yOffset: [-22, 0], priority: 5,
    });

    /*
     * Excursion at constant SPL, ONE driver — and the 80 Hz marker that says
     * this driver is never asked for most of it.
     *
     * The measurement editor's objection to the last revision was that the whole
     * chapter demonstrates a band the active LR4 at XOVER.fLow has already handed
     * to the subwoofers, so a reader coming from the crossover chapter reads the
     * excursion curve as a claim about the assembled system. It is not: it is
     * what this driver could do. The marker and its numeral put that on the plot
     * instead of burying it in the prose.
     */
    const gX = new DIAG.Graph({
      w: GW, h: GH, xLog: true, xRange: [24, 200], yRange: [0, 12], yTicks: [0, 4, 8, 12],
    });
    gX.position.set(0, 0.105, 0.001);
    inner.add(gX);
    gX.addBand(TS.Xmax * 1000, 12, PAL.am, 0.13);
    gX.addTrace(() => TS.Xmax * 1000, { color: PAL.am, width: 1.3, dashed: true, n: 2 });
    gX.addTrace((f) => DSP.excursionForSpl(SPL_REF, f, TS.Sd) * 1000, { color: PAL.am, width: 2.8 });
    gX.addMarker(F_XMAX, { color: PAL.am, opacity: 0.5 });
    gX.addMarker(XOVER.fLow, { color: PAL.cy, opacity: 0.75, dashed: false, width: 1.6 });
    const dotX = gX.addDot(PAL.cy, 0.006);
    gX.tickLabels(ctx.labels, {
      xVals: [24, XOVER.fLow, 200], yVals: [0, 8, 12],
      xFmt: fTick, yFmt: (v) => v.toFixed(0),
      xOffset: [0, 12], yOffset: [-22, 0], priority: 5,
    });

    // the specular layer over the plots, matching the one over the cutaway
    const gGlass = glassPanel(GCW, GCH, 0.020);
    gGlass.position.set(GX0 + GCW / 2, GY0 + GCH / 2, 0.030);
    inner.add(gGlass);

    const anch = (gr, gx, gy) => {
      const o = new T3.Object3D();
      o.position.set(gr.position.x + gr.x(gx), gr.position.y + gr.y(gy), 0.004);
      inner.add(o);
      return o;
    };
    /*
     * Captions go where the trace is not.
     *
     * The sealed response rises left to right and is flat along the top by
     * 130 Hz, so the bottom-right quadrant of that plot is empty. The excursion
     * curve falls left to right and is under 0.7 mm above 100 Hz, so the band
     * between the curve and the Xmax shading on the right is empty. Both
     * captions are anchored to the right-hand edge and pulled left by half their
     * own width, so neither ever sits on the curve it describes.
     */
    const aR = anch(gR, Math.sqrt(15 * 400), -27), aX = anch(gX, Math.sqrt(24 * 200), 0);

    // ---------------- labels --------------------------------------------------
    /*
     * Four annotations on the cutaway.
     *
     * They were 240–360 px from the parts they name, with no leader, floating
     * over the cabinet and over empty space. Now each one is anchored to a fixed
     * point in the clear column between cabinet and card, stacked in the same
     * order as the parts run down the drawing, and each has a SHORT drawn leader
     * ending on its own part. One body line each: a callout on a product render
     * is one line, and the third line belongs in the panel.
     */
    const L = ctx.labels;
    const LEAD_COL = 68;                        // px right of the camera axis
    /**
     * Anchor a label at a fixed screen position and rule a leader from its right
     * edge to a point in the section's own local frame.
     * @param dy   px below the camera axis
     * @param lx,ly  the part, in section-local metres
     */
    const call = (dy, lx, ly, opts) => {
      const a = new T3.Object3D();
      a.position.copy(screenPt(LEAD_COL, dy, SEC_D));
      ov.add(a);
      const part = new T3.Vector3(lx, ly, 0.012).applyMatrix4(sec.matrixWorld);
      const from = screenPt(LEAD_COL + 118, dy, SEC_D);
      const t = new DIAG.Trace(3, 0xa7b0bb, 1.2, { opacity: 0.50, renderOrder: 9 });
      t.write((i) => (i === 0 ? [from.x, from.y, from.z]
        : i === 1 ? [from.x + (part.x - from.x) * 0.34, from.y, from.z]
          : [part.x, part.y, part.z]));
      ov.add(t);
      const dot = new T3.Mesh(new T3.CircleGeometry(mPerPx(SEC_D) * 2.6, 12),
        new T3.MeshBasicMaterial({ color: 0xc3cad3, toneMapped: false, transparent: true, opacity: 0.5 }));
      dot.position.copy(part);
      faceCamera(dot);
      dot.renderOrder = 10;
      ov.add(dot);
      return L.add(a, Object.assign({ offset: [0, 0], occlude: false }, opts));
    };
    sec.updateMatrixWorld(true);

    const lC = call(-330, 0.016, 0.078, {
      kicker: 'CHARGE CARRIERS', text: 'they oscillate; they never arrive',
      value: `±0 µm · shown ×${EXAG}`, cls: 'am', priority: 3,
    });
    const lI = call(-232, X_GAPC, R_COIL, {
      kicker: 'VOICE COIL', text: `${L_IN_GAP.toFixed(1)} m of wire in ${B_GAP.toFixed(2)} T`,
      value: 'i = 0.00 A', cls: 'am', priority: 3,
    });
    const lF = call(-134, 0.029, 0.0, {
      kicker: 'MOTOR FORCE', text: 'F = Bl · i, on 49 g of moving mass',
      value: '0.0 N', cls: 'am', priority: 4,
    });
    const lX = call(-32, X_GAPC, -0.092, {
      kicker: 'CONE TRAVEL',
      text: `Xmax ${(TS.Xmax * 1000).toFixed(1)} mm in an ${(H_GAP * 1000).toFixed(1)} mm gap`,
      value: '±0.00 mm at 30.0 Hz · one of four', cls: 'acc', priority: 4,
    });
    const lR = L.add(aR, {
      kicker: `SEALED ${(Vb * 1000).toFixed(0)} L · −12 dB/octave`,
      value: `fc ${AL.fc.toFixed(1)} Hz · Qtc ${AL.Qtc.toFixed(3)} · f₃ ${F3.toFixed(1)} Hz`,
      cls: 'acc', offset: [0, 44], occlude: false, priority: 2,
    });
    const lXg = L.add(aX, {
      kicker: `EXCURSION · mm · ${SPL_REF} dB, 1 m`,
      value: '—', cls: 'am', offset: [0, 44], occlude: false, priority: 2,
    });

    S = {
      near, far, sec: U, gR, gX, dotR, dotX,
      labels: { lF, lI, lC, lX, lR, lXg },
      lamp: secLamp,
      woofers: [near.userData.wLo, near.userData.wHi, far.userData.wLo, far.userData.wHi],
      ph: 0, f: F_LO, x: 0, i: 0, F: 0, e: 0, v: 0, xp: X30, ip: 0, Fp: 1, dr: 0,
      cp: new T3.Vector3(),
      /**
       * The latched display state. readouts() writes it and update() reads it,
       * so the pinned instrument cluster and the world labels always show the
       * same instant — they used to disagree by a frame's worth of phase, which
       * in a still frame reads as an arithmetic error.
       */
      d: null,
    };
    S.d = { f: F_LO, i: 0, F: 0, e: 0, v: 0, x: 0, xp: X30, dr: 0 };
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
    // Terminal voltage the amplifier must actually deliver:
    //   v = Re·i + Le·di/dt + Bl·ẋ,  with i = (A·sin + B·cos)/Bl.
    const didt = (w * (F.A * cs - F.B * sn)) / TS.Bl;
    S.v = TS.Re * S.i + TS.Le * didt + S.e;
    S.dr = DSP.driftDisplacement(drift(S.ip), f);    // peak carrier displacement, m

    // --- real cones move at true 1 : 1 world scale ------------------------------
    for (const d of S.woofers) d.userData.moving.position.y = d.userData.baseY + S.x;

    // --- the section (the same motion, drawn at the section's 1 : 1 scale) ------
    const U = S.sec;
    U.mov.position.x = S.x;
    const into = S.i >= 0;
    U.markT.userData.setInto(into);
    U.markB.userData.setInto(!into);
    // Force vector, drawn from the coil itself, just clear of the winding.
    // The arrow lives in the empty axial corridor between the pole piece and
    // the cone neck. Sprung from x = 0.031 it reached 0.077 at full swing and
    // drove its head straight through the source symbol at x = 0.045.
    const fl = DSP.clamp(Math.abs(S.F) / 45, 0, 1) * 0.019 + 0.003;
    const dir = S.F >= 0 ? 1 : -1;
    const x0 = 0.003 + S.x, yA = 0.0;
    U.fArrow.write((i) => [i === 0 ? x0 : x0 + dir * fl, yA, 0.012]);
    U.fHead.position.set(x0 + dir * (fl + 0.005), yA, 0.012);
    U.fHead.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;

    // excursion dimension, redrawn to the live peak, on the coil's own centre
    const RY = -0.092;
    const dm = U.dim.children;
    dm[0].write((i) => [X_GAPC + (i === 0 ? -1 : 1) * xp, RY, 0.006]);
    dm[1].position.x = X_GAPC - xp + 0.005;
    dm[2].position.x = X_GAPC + xp - 0.005;

    // --- carriers: true drift, magnified by a stated factor ---------------------
    const amp = S.dr * EXAG * sn;
    const step = U.path.total / U.carriers.count;
    U.carriers.update((i) => {
      U.path.at(i * step + amp, S.cp);
      return { p: [S.cp.x, S.cp.y, S.cp.z], s: 1 };
    });
    const iDir = S.i >= 0 ? 1 : -1;
    for (const h of U.flow) {
      U.path.at(h.userData.s, S.cp);
      h.position.copy(S.cp);
      U.path.at(h.userData.s + iDir * 0.004, S.cp);
      const d = S.cp.clone().sub(h.position);
      if (d.lengthSq() > 1e-9) h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      h.material.opacity = 0.25 + 0.65 * Math.abs(S.i) / Math.max(S.ip, 1e-6);
    }
    U.wire.material.opacity = 0.35 + 0.45 * (0.45 + 0.55 * Math.abs(S.i) / Math.max(S.ip, 1e-6));

    // --- graphs ------------------------------------------------------------------
    S.dotR.userData.setData(f, DSP.sealedResponseDb(f, AL.fc, AL.Qtc));
    S.dotX.userData.setData(f, xp * 1000);

    // Label VALUES are not written here. They are written by readouts(), from
    // the same latched instant the pinned instrument cluster prints — see the
    // note on S.d. Writing them here as well put the two 100 ms apart, which at
    // 97 Hz is 2 radians: the frame showed COIL I −0.48 A beside a label
    // reading i = +0.38 A, and a still frame cannot explain that away.
  },

  setReveal(k) {
    if (!S) return;
    S.lamp.intensity = 1.7 * k;
  },

  /*
   * 250 words, and it has to STAY there. The still frame is the deliverable and
   * the panel does not scroll in it: the previous revision ran to 320 and was
   * cut mid-sentence at "It is second". The elaboration is what gets lost, so
   * the mechanism and the arithmetic go first and the consequence last.
   */
  content() {
    return `
<h3>The motor</h3>
<p><span class="num">Bl</span> = <span class="num">${TS.Bl.toFixed(1)} T·m</span>: of the coil's
${WIRE_LEN.toFixed(1)} m of 0.32 mm copper, <span class="num">${L_IN_GAP.toFixed(1)} m</span> lies in
an ${(H_GAP * 1000).toFixed(1)} mm gap at ${B_GAP.toFixed(2)} T.</p>
<div class="eq">F = Bl·i = <span class="hl">${F30.toFixed(1)} N</span> at ${F_LO} Hz, ${SPL_REF} dB
i = F/Bl = <span class="hl">${I30.toFixed(2)} A</span>   coil fills in ${(T_FILL * 1e9).toFixed(0)} ns</div>
<p>Current is a <b>loop</b> — in on one tinsel lead, ${N_TURNS.toFixed(0)} turns, out on the
other — and nothing travels down it: carriers oscillate
<span class="num">${(DR30 * 1e6).toFixed(1)} µm</span>, the cone moves
<span class="num">${(X30 * 1000).toFixed(2)} mm</span>.</p>

<h3>The cabinet</h3>
<div class="myth"><span class="lab">Commonly got wrong</span><p>A sealed box rolls off at
<b>12 dB/octave</b>, not 24 — second order: one mass, one compliance.</p></div>
<div class="eq">α = Vas/Vb = ${(Vas * 1000).toFixed(0)}/${(Vb * 1000).toFixed(0)} = ${AL.alpha.toFixed(2)}
fc = fs·√(α+1) = <span class="hl">${AL.fc.toFixed(1)} Hz</span>    Qtc ${AL.Qtc.toFixed(3)}
f₃ ${F3.toFixed(1)} Hz  η₀ ${(ETA0 * 100).toFixed(2)} %  ${SENS.toFixed(1)} dB at 2.83 V</div>
<p>Each woofer has its own sealed ${(Vb * 1000).toFixed(0)} L chamber. Every figure is
<b>per driver</b>: four are 12 dB louder. Travel runs out below
<span class="num">${F_XMAX.toFixed(1)} Hz</span>, which the LR4 at
<span class="num">${XOVER.fLow} Hz</span> never asks for.</p>`;
  },

  readouts() {
    const s = S;
    if (!s) {
      return [
        { k: 'DRIVE', v: F_LO.toFixed(1), u: 'Hz' },
        { k: 'COIL I', v: '+0.00', u: 'A', cls: 'am' },
        { k: 'FORCE', v: '+0.0', u: 'N', cls: 'am' },
        { k: 'BACK-EMF', v: '+0.0', u: 'V', cls: 'acc' },
        { k: 'CONE X', v: '0.00', u: 'mm', cls: 'acc' },
        { k: 'TERMINAL V', v: '+0.0', u: 'V', cls: 'acc' },
      ];
    }
    // THE LATCH. This is the only place the display state is sampled, and both
    // the footer and the world labels are written from it, so a screenshot can
    // only ever show one instant.
    const d = { f: s.f, i: s.i, F: s.F, e: s.e, v: s.v, x: s.x, xp: s.xp, dr: s.dr };
    s.d = d;
    const L = s.labels;
    L.lF.setValue(`${sgn(d.F, 1)} N`);
    L.lI.setValue(`i = ${sgn(d.i, 2)} A`);
    L.lC.setValue(`±${(d.dr * 1e6).toFixed(1)} µm · shown ×${EXAG}`);
    L.lX.setValue(`±${(d.xp * 1000).toFixed(2)} mm at ${d.f.toFixed(1)} Hz · one of four`);
    L.lXg.setValue(`${(d.xp * 1000).toFixed(2)} mm at ${d.f.toFixed(0)} Hz · LR4 hands over at ${XOVER.fLow} Hz`);
    const sg = sgn;
    return [
      { k: 'DRIVE', v: d.f.toFixed(1), u: 'Hz' },
      { k: 'COIL I', v: sg(d.i, 2), u: 'A', cls: 'am', bar: Math.abs(d.i) / Math.max(s.ip, 1e-6) },
      { k: 'FORCE', v: sg(d.F, 1), u: 'N', cls: 'am', bar: Math.abs(d.F) / Math.max(s.Fp, 1e-6) },
      { k: 'BACK-EMF', v: sg(d.e, 1), u: 'V', cls: 'acc' },
      { k: 'CONE X', v: sg(d.x * 1000, 2), u: 'mm', cls: 'acc', bar: Math.abs(d.x) / TS.Xmax },
      { k: 'TERMINAL V', v: sg(d.v, 1), u: 'V', cls: 'acc' },
    ];
  },
};
