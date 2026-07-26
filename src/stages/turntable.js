import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { MAINS, CART, TT, TONEARM } from '../core/spec.js';

/* ===========================================================================
   GROOVE TO VOLTAGE

   Primaries come from src/core/spec.js and are never re-declared here. Where a
   figure is local (a design choice for this deck, or a display scaling) it is
   derived from a spec primary and the derivation is stated.
   =========================================================================== */

const TAU = DSP.TAU;
const SQ2 = Math.SQRT2;

// ---- platter kinematics (spec: TT) ----------------------------------------
const RPM   = TT.rpm;                        // 33⅓ rev/min
const OMEGA = TT.omega;                      // 3.4907 rad/s
const T_REV = 60 / RPM;                      // 1.800 s per revolution
const R_OUT = TT.rOuter;                     // 0.146 m — outermost recorded radius
const R_IN  = TT.rInner;                     // 0.060 m — innermost recorded radius
const V_OUT = TT.vOuter;                     // 0.5096 m/s
const V_IN  = TT.vInner;                     // 0.2094 m/s
const vAt   = (r) => OMEGA * r;

// groove pitch from a 20-minute side spread over the recorded band
const SIDE_MIN = 20;
const REVS     = SIDE_MIN * RPM;             // 666.7 revolutions
const PITCH    = (R_OUT - R_IN) / REVS;      // 129.0 µm
const R_DOT    = PITCH / T_REV;              // 71.7 µm/s inward creep

// strobe: bars = 120·f_mains / rpm  (full-wave illumination at the spec mains
// frequency, MAINS.f = 50 Hz)
const STROBE_BARS = Math.round((120 * MAINS.f) / RPM);   // 180

// ---- tonearm: Löfgren A (Baerwald) for the IEC radii ----------------------
// Null radii r1,r2 satisfy  sin β = (r1+r2)/2L  and  r1·r2 = L² − D².
const L_EFF    = TT.armEff;                  // effective length, m (spec)
const NULL1    = 0.0660, NULL2 = 0.1209;     // Baerwald nulls, m
const K_BAER   = NULL1 * NULL2;
const OVERHANG = L_EFF - Math.sqrt(L_EFF * L_EFF - K_BAER);   // 17.32 mm
const MOUNT_D  = L_EFF - OVERHANG;                            // 221.68 mm
const OFFSET   = Math.asin((NULL1 + NULL2) / (2 * L_EFF));    // 23.02°
const reqOffset = (r) => Math.asin((r * r + K_BAER) / (2 * L_EFF * r));
// rad. Positive means the fitted offset EXCEEDS what the tangent needs, which
// is the case between the two nulls; outside them it goes negative, reaching
// −1.79° at the first groove. Löfgren A equalises weighted DISTORTION (error
// over radius), not error, so the angular error is largest at the rim.
const trackErr  = (r) => OFFSET - reqOffset(r);

// ---- 45/45 groove geometry ------------------------------------------------
const GROOVE_W = 60e-6;                 // top width of an unmodulated groove
const GROOVE_D = GROOVE_W / 2;          // 90° included angle → depth = half width
const BOTTOM_R = 6e-6;                  // radius of the groove bottom
const TIP_R_H  = 18e-6;                 // 0.7 mil across-groove radius (touches walls)
const TIP_R_V  = 5e-6;                  // 0.2 mil along-groove radius (traces λ)
// A sphere of radius r tangent to both 45° walls has its centre r√2 above the
// apex, so its underside sits r(√2 − 1) clear of the groove bottom. The tip
// rides the walls and never the bottom — 7.46 µm of daylight, a quarter of the
// groove depth.
const TIP_CLEAR = TIP_R_H * (SQ2 - 1);  // 7.46 µm

// Wall-normal convention, in (lateral u, vertical w) with +u toward the rim:
//   n_L = (+1, +1)/√2   (inner wall)      n_R = (+1, −1)/√2   (outer wall)
// so  u = (sL + sR)/√2  and  w = (sL − sR)/√2 — in-phase is lateral.
const tipFromWalls = (sL, sR) => [(sL + sR) / SQ2, (sL - sR) / SQ2];

// ---- vertical tracking force and the Hertzian contact ---------------------
const G0     = 9.80665;
const VTF_N  = CART.vtfN;                             // 19.6 mN (spec)
const N_WALL = VTF_N / (2 * Math.cos(Math.PI / 4));   // 13.86 mN normal to each wall
const E_DIA = 1050e9, NU_DIA = 0.20;                  // diamond
const E_PVC = 3.0e9,  NU_PVC = 0.40;                  // vinyl copolymer, quasi-static
const E_STAR = 1 / ((1 - NU_DIA ** 2) / E_DIA + (1 - NU_PVC ** 2) / E_PVC);
const R_EQ   = Math.sqrt(TIP_R_H * TIP_R_V);          // geometric-mean tip radius
const A_HZ   = Math.cbrt((3 * N_WALL * R_EQ) / (4 * E_STAR));   // contact radius
const AREA_C = Math.PI * A_HZ * A_HZ;                 // 2.88 × 10⁻¹¹ m²
const P_MEAN = N_WALL / AREA_C;                       // 482 MPa — the MEAN
// Hertz's pressure distribution over a circular contact is a hemisphere, so the
// peak at the centre is exactly 3/2 of the mean. A tribologist reads an
// unqualified contact pressure as the peak, so both are printed.
const P_PEAK = 1.5 * P_MEAN;                          // 723 MPa
// 1 tonne-force per cm² = 1000 × 9.80665 N / 10⁻⁴ m² = 9.80665 × 10⁷ Pa
const TF_CM2 = 1000 * G0 * 1e4;
const P_TCM2 = P_MEAN / TF_CM2;                       // 4.92 tf/cm²

// ---- the moving-coil generator (spec: CART) -------------------------------
const BL      = CART.Bl;                  // 8.05 mT·m — THE primary
const B_GAP   = 0.42;                     // T in the working gap. CHOSEN.
const N_TURNS = 24;                       // turns per channel coil. CHOSEN.
const L_TURN  = BL / (B_GAP * N_TURNS);   // DERIVED: 0.799 mm of conductor per turn
const V_REF   = CART.vRef;                // 5 cm/s reference wall velocity, PEAK
const E_PK    = CART.outPk;               // 402.5 µV peak
const E_RMS   = CART.outRms;              // 284.6 µV rms
// Coil dc resistance and phono load are BOTH spec primaries. This line used to
// type 10 for the coil, which is a re-declaration of CART.srcOhm and exactly the
// class of thing the editor caught elsewhere in the piece.
const R_COIL  = CART.srcOhm, R_LOAD = CART.loadOhm;         // Ω
const I_PK    = E_PK / (R_COIL + R_LOAD); // 3.659 µA peak
// The tonearm wire is a SPEC PRIMARY (TONEARM.litzMm2), shared with the phono
// chapter so the two cannot quote the same cable differently. The strand
// diameter is DERIVED from it, not typed: 7 strands of area A/7 each.
const WIRE_MM2 = TONEARM.litzMm2;                      // 0.030 mm²
const STRANDS  = 7;
const STRAND_D = Math.sqrt((4 * WIRE_MM2) / (STRANDS * Math.PI));   // 0.0739 mm
const V_DRIFT  = DSP.driftVelocity(I_PK, WIRE_MM2);    // 8.97 nm/s peak
const F_SIG    = 1000;                                 // Hz
const X_DRIFT  = DSP.driftDisplacement(V_DRIFT, F_SIG);// 1.43 pm peak excursion
const CU_SPACING = 255.6e-12;                          // fcc copper, a/√2
const CU_RATIO = CU_SPACING / X_DRIFT;                 // 179
const V_FIELD  = MAINS.vField;                         // 1.979 × 10⁸ m/s (vf 0.66)

// ---- the modulation we actually draw --------------------------------------
// A single 1 kHz tone, unequal on the two channels and 0.9 rad apart, so the
// tip traces a real stereo ellipse rather than a textbook straight line.
const A_L     = V_REF / (TAU * F_SIG);    // 7.96 µm peak wall displacement
const R_RATIO = 0.62;
const R_PHASE = -0.90;                    // rad
const A_R     = A_L * R_RATIO;
const V_L_PK  = TAU * F_SIG * A_L;        // = V_REF by construction
const V_R_PK  = TAU * F_SIG * A_R;
const U_MAX   = (A_L + A_R) / SQ2;        // 9.11 µm — the widest the groove wanders

// ---- traceability: why the inner grooves distort --------------------------
// A tip of along-groove radius r can follow a sine only while the groove's
// minimum radius of curvature λ²/(4π²A) stays above r.
const F_HF     = 10000;
const lambdaAt = (r) => vAt(r) / F_HF;
const aMaxAt   = (r) => (lambdaAt(r) ** 2) / (4 * Math.PI * Math.PI * TIP_R_V);
const vMaxAt   = (r) => TAU * F_HF * aMaxAt(r);        // 0.83 → 0.14 m/s

// ---- how close the cut comes to its neighbour ------------------------------
// The land between two adjacent grooves is the pitch less one groove width.
// Two cuts meet when their lateral displacements differ by more than that, and
// the card shows the three quantities as one dimension chain: 60 + 69 = 129.
const LAND = PITCH - GROOVE_W;                        // 69.0 µm

// ---- display scalings (both stated on screen) -----------------------------
// The section card is 92.5 mm wide in world units and hangs 0.56 m from the
// lens — about a fifth of the frame width, beside the deck and never over it.
// MAG is DERIVED from that width and the requirement that exactly three grooves
// at the true 129 µm pitch span the card edge to edge, so the width, the land
// and the pitch are all in one picture at one scale:
//     span = 2 · pitch + one groove width
const CARD_D     = 0.545;                                  // m from the lens
const CARD_WANT  = 0.0795;                                 // m, target card width
const MAG        = Math.round(CARD_WANT / (2 * PITCH + GROOVE_W));   // 250 : 1
const CARD_W     = MAG * (2 * PITCH + GROOVE_W);           // 0.0795 m, exactly 3 grooves
// The card's internal layout was drawn at 770 : 1; every length in it scales
// with the magnification so the drawing stays proportioned.
const CS         = MAG / 770;
const CARD_H     = 0.100 * CS;
const TIME_RATIO = 1000;      // groove/stylus motion slowed 1 : 1000

/**
 * Readouts refresh at 10 Hz on the app's own timer, whose phase this module
 * cannot see. Latching inside update() — on any grid, however coarse — leaves
 * the footer holding one instant and the labels another, and a still frame then
 * shows the same quantity twice with two values. So nothing numeric is written
 * from update() at all: `latch()` below evaluates every displayed number once
 * and writes BOTH the labels and the values readouts() returns, and it is
 * called from readouts(). One call, one instant, no possible disagreement.
 */

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
  // A flat drive belt is dull nitrile. mats().rubber's sheen lit its two
  // straight runs into a pair of chrome rods across the top plate.
  const bm = mats().rubber.clone();
  bm.sheen = 0.08;
  bm.roughness = 0.90;
  bm.envMapIntensity = 0.30;
  const m = new THREE.Mesh(g, bm);
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  return m;
}

/** Filled 2D polygon in the local XY plane — overlay only. */
function poly(pts, color, opacity = 1, order = 11, z = 0) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.position.z = z;
  m.renderOrder = order;
  return m;
}

/* ---------------------------------------------------------------------------
   TWO CORE HELPERS ARE REBUILT LOCALLY, AND THE REASON IS THE SAME BUG.

   `DIAG.diagramCard()` and `DIAG.dimension()` both hang a `userData.setOpacity`
   on their GROUP which writes straight into their children's materials. Core's
   `fadeTree()` calls that setter and then carries on traversing INTO those same
   children, where it latches `_baseOp = material.opacity` — the value the setter
   has just written. `main.js` calls `fadeTree(overlay, 0)` the moment a stage is
   added, so the base is latched at zero and those children never draw again,
   at any reveal.

   The card plate and the dimension arrowheads are meshes, so both are hit. The
   traces are Line2 and re-derive their own opacity, so they survive — which is
   why this card has been shipping as an empty translucent frame with unheaded
   dimension lines. Verified by reproducing the traversal. Reported, not patched:
   the core is frozen. A plain mesh under a plain group is immune.
   --------------------------------------------------------------------------- */

/**
 * Backing plate: an unlit ground for the drawing, inside a machined bezel that
 * is a real bevelled solid lit by the room. A square-cornered black rectangle
 * with a 1 px border is a pasted PNG; a plate with thickness, a fillet that
 * catches the front strip and a shadow line down one edge is an object.
 */
function cardPlate(w, h, pad = 0.020 * CS) {
  const g = new THREE.Group();
  const W = w + pad * 2, H = h + pad * 2;
  const T = 0.0034 * Math.max(0.6, CS * 2.2);

  const bez = mats().alu.clone();
  bez.color.setHex(0x343a41);
  bez.roughness = 0.46;
  bez.envMapIntensity = 0.58;
  const bezel = new THREE.Mesh(GEO.bevelBox(W + 0.0034, H + 0.0034, T, 0.0008, 3), bez);
  // Its FRONT face must sit behind the plate. Placed at −T·0.72 the box's front
  // face landed at −0.5 mm, i.e. in front of both the plate and the drawing's
  // ground, so what the whole card was reading against was a sheet of satin
  // alloy — which is where the streaky mid-grey wash came from, and why nothing
  // done to the plate material changed it.
  bezel.position.set(w / 2, h / 2, -0.0018 - T / 2);
  bezel.renderOrder = 1;
  // NOT a shadow caster. Tried: the plate sits between the key light and the
  // left loudspeaker, and taking that cabinet's top chamfer out of shadow left
  // it as a blown white bar across a third of the frame. A floating diagram is
  // allowed to be weightless; a blown highlight is not.
  bezel.castShadow = false;
  g.add(bezel);

  // The ground the drawing sits on is a LIT DIELECTRIC, not a UI div. A
  // MeshBasicMaterial takes no light, shades across nothing and never appears
  // in the floor reflection, which is what made every card in this piece read
  // as a pasted PNG. A physical plate catches the shell's horizon band along
  // its top edge and falls away down its face.
  //
  // MATTE, and that is the whole trick. At roughness 0.36 with a clearcoat the
  // plate spread the key light and the shell's horizon band across its entire
  // face as a streaky mid-grey, and hairline white ink on mid-grey is not a
  // drawing. The ground has to stay in the bottom tenth of the ramp; the
  // specular EVENT belongs to the glass in front of it, where it can be a band
  // in one corner instead of a wash over everything.
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0d12, metalness: 0.0, roughness: 0.44,
    clearcoat: 0.45, clearcoatRoughness: 0.20,
    envMapIntensity: 0.55, transparent: true, opacity: 0.97,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(W, H), plateMat);
  plate.position.set(w / 2, h / 2, -0.0011);
  plate.renderOrder = 3;
  g.add(plate);

  // The drawing's own ground, inset so a lit margin of the slab still shows
  // inside the bezel. Even at roughness 0.74 and envMapIntensity 0.10 the lit
  // slab settles around 28 % — fine as a surround, hopeless as the ground under
  // hairline ink, which needs to sit near black or the section stops reading as
  // a section. So the slab is the object and this is the paper on it.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.010 * CS, H - 0.010 * CS),
    new THREE.MeshBasicMaterial({
      color: 0x0a0d13, transparent: true, opacity: 0.94, toneMapped: false, depthWrite: true,
    }));
  ground.position.set(w / 2, h / 2, -0.0008);
  ground.renderOrder = 4;
  g.add(ground);

  const b = new DIAG.Trace(5, 0x39414c, 1.0, { opacity: 0.75, renderOrder: 5 });
  const x0 = -pad, y0 = -pad;
  b.write((i) => [[x0, y0], [x0 + W, y0], [x0 + W, y0 + H], [x0, y0 + H], [x0, y0]][i].concat(-0.0007));
  g.add(b);
  return g;
}

/** Horizontal dimension with arrowheads that survive the fade. */
function dimH(x0, x1, y, colour = 0x9aa3b0, z = 0.0013) {
  const g = new THREE.Group();
  const t = new DIAG.Trace(2, colour, 1.2, { opacity: 0.80, renderOrder: 11 });
  t.write((i) => [i ? x1 : x0, y, z]);
  g.add(t);
  const hl = 0.0058 * CS, hw = 0.0019 * CS;
  for (const [x, s] of [[x0, 1], [x1, -1]]) {
    g.add(poly([[x, y], [x + s * hl, y + hw], [x + s * hl, y - hw]], colour, 0.85, 12, z));
  }
  return g;
}

/** One-way arrow: shaft + head, from a to b. */
function arrow(a, b, color, width = 1.8, head = 0.010) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
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
  return g;
}

/**
 * Section hatching. A sectioned solid in an engineering drawing is hatched, and
 * without it a filled region is just a coloured rectangle — which is exactly
 * what round 2's card was. One LineSegments, one draw call, hairline weight.
 * The slope is deliberately NOT 45°: the groove walls are at 45°, and hatching
 * parallel to an edge is the one thing a draughtsman never does. Lines share a
 * common phase so they align across every rectangle.
 */
function hatchRects(rects, step, colour, opacity, slope = 0.52, z = 0.0002) {
  let cMin = Infinity, cMax = -Infinity;
  for (const [x0, y0, x1, y1] of rects) {
    cMin = Math.min(cMin, y0 - slope * x1);
    cMax = Math.max(cMax, y1 - slope * x0);
  }
  const pos = [];
  for (let c = Math.ceil(cMin / step) * step; c <= cMax; c += step) {
    for (const [x0, y0, x1, y1] of rects) {
      const a = Math.max(x0, (y0 - c) / slope), b = Math.min(x1, (y1 - c) / slope);
      if (b - a > 1e-4) pos.push(a, slope * a + c, z, b, slope * b + c, z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: colour, transparent: true, opacity, depthWrite: false, toneMapped: false,
  }));
  mesh.renderOrder = 8;
  return mesh;
}

/**
 * THE SPECULAR LAYER — `GEO.instrumentGlass`, not a hand-rolled near-mirror.
 *
 * Round 3 answered "the card reads as a decal" with a crowned panel at
 * roughness 0.095 and additive blending, which returns the softbox at close to
 * full intensity: a milky wash across the drawing rather than a band laid over
 * it. The core helper is crowned so the source SWEEPS as a band, sits at
 * reflectivity 0.34 (a coated cover glass returns ~1.7 % at normal incidence,
 * not the uncoated 4 %) and carries a little roughness because it is glass in a
 * room. The only local change is the tint, which is pulled to black so the
 * 30 % veil darkens the plate rather than tinting the ink blue.
 */
function cardGlass(w, h) {
  const gl = GEO.instrumentGlass(w, h, {
    crown: Math.min(w, h) * 0.050, roughness: 0.20, tint: 0x010203,
  });
  // The helper's defaults are set for a meter face against a bright fascia. A
  // black card carrying hairline ink is the opposite case: at opacity 0.30 and
  // envMapIntensity 0.85 the veil lifted the whole upper half of the drawing to
  // mid grey and the section printed through it. Dim it until the sweep is a
  // band across the top corner and nothing else.
  gl.material.opacity = 0.15;
  gl.material.envMapIntensity = 0.50;
  gl.renderOrder = 40;
  return gl;
}

// ---------------------------------------------------------------------------
// local procedural textures (canvas only — nothing loaded)
// ---------------------------------------------------------------------------

const _texCache = new Map();
function cached(key, fn) {
  if (!_texCache.has(key)) _texCache.set(key, fn());
  return _texCache.get(key);
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Roughness of the playing surface AS A FUNCTION OF RADIUS.
 *
 * The record is a lathe, so the map's v axis runs radially and a 4 × N strip is
 * a roughness-versus-radius profile. Round 2 drew one stripe per real groove —
 * 770 of them across ~150 screen pixels — and every mip level averaged them
 * into a single value, which is why the record rendered dead matte while the
 * strobe ring beside it clipped to white.
 *
 * A camera cannot resolve a 129 µm pitch from a metre away and neither can the
 * eye. What a photograph of an LP actually shows is the LANDS: a smooth lead-in
 * at the rim, a smooth lead-out at the label, and the gaps between tracks, all
 * reading as mirror rings against a duller modulated field. That is what this
 * draws. Mipmaps are off so the profile survives to screen.
 */
function grooveRoughTex() {
  return cached('grv', () => {
    const H = 1024, c = makeCanvas(4, H), g = c.getContext('2d');
    const img = g.createImageData(4, H);
    // v = 0 at the label edge, v = 1 at the disc rim
    const vOf = (r) => (r - R_LABEL) / (R_DISC - R_LABEL);
    const vLeadIn = vOf(R_OUT);          // 0.965 — outside this, smooth land
    const vLeadOut = vOf(R_IN);          // 0.096 — inside this, smooth land
    const GAPS = [0.17, 0.34, 0.51, 0.67, 0.84];   // five track gaps
    // The lands are the polished part and the cut band scatters: widening that
    // gap is what makes the disc read as a record rather than a machined platter.
    const ROUGH_LAND = 0.105, ROUGH_FIELD = 0.255;
    for (let y = 0; y < H; y++) {
      // v = radius fraction, 0 at the label, 1 at the rim. CanvasTexture flips
      // Y and the surface lathe runs inward, so the two inversions cancel.
      const v = (y + 0.5) / H;
      // grooved field, with a slow modulation so the band is not one flat value
      let rgh = ROUGH_FIELD + 0.020 * Math.sin(v * TAU * 9.0);
      // lands: lead-in, lead-out, inter-track gaps
      let land = 1 - smooth(vLeadIn - 0.004, vLeadIn + 0.010, v);
      land = Math.min(land, smooth(vLeadOut - 0.010, vLeadOut + 0.006, v));
      for (const gv of GAPS) {
        const d = Math.abs(v - gv);
        land = Math.min(land, smooth(0.006, 0.016, d));
      }
      rgh = ROUGH_LAND + (rgh - ROUGH_LAND) * land;
      const val = Math.max(0, Math.min(255, (rgh * 255) | 0));
      for (let k = 0; k < 4; k++) {
        const i = (y * 4 + k) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    return t;
  });
}

/**
 * The other half of the record, and the half round 2 was missing entirely.
 *
 * A roughness ramp alone cannot make a record read as a record: a flat disc a
 * metre from the lens mirrors one small solid angle of the studio, so every
 * radius reflects nearly the same thing and the whole surface returns one value
 * — which is exactly what "dead matte" looked like. What actually draws the
 * concentric bright and dark rings on a photographed LP is that the surface
 * NORMAL varies with radius: the cut band sits a few micrometres below the
 * lands, and the cut itself is not perfectly flat. Tilting the normal sweeps
 * the reflected ray through the environment, so the rings appear.
 *
 * Encoded in tangent space; on a lathe the bitangent runs radially, so only the
 * green channel carries anything. Slope is compressed through atan because the
 * land steps are otherwise near-vertical.
 */
function grooveNormalTex() {
  return cached('grvN', () => {
    const H = 512, c = makeCanvas(4, H), g = c.getContext('2d');
    const img = g.createImageData(4, H);
    const vOf = (r) => (r - R_LABEL) / (R_DISC - R_LABEL);
    const vIn = vOf(R_OUT), vOut = vOf(R_IN);
    const GAPS = [0.17, 0.34, 0.51, 0.67, 0.84];
    /** Height in arbitrary units; only its radial slope is used. */
    const hAt = (v) => {
      let cut = 1 - smooth(vIn - 0.005, vIn + 0.010, v);
      cut = Math.min(cut, smooth(vOut - 0.010, vOut + 0.006, v));
      for (const gv of GAPS) cut = Math.min(cut, smooth(0.006, 0.015, Math.abs(v - gv)));
      // ROUND 4: the cut band carried three LOW harmonics (5.3, 8.7, 15 cycles
      // across the band) at large amplitude, which swept the reflected ray
      // through the whole hemisphere half a dozen times and rendered the record
      // as a banded, brushed-aluminium disc. What a photographed LP shows is a
      // fine concentric grain — one broad sheen with structure INSIDE it — so
      // the frequencies go up and the amplitudes come down.
      return (1 - cut) * 0.42
        + cut * (0.026 * Math.sin(v * TAU * 19.0) + 0.014 * Math.sin(v * TAU * 33.0 + 1.1)
               + 0.008 * Math.sin(v * TAU * 57.0));
    };
    const dv = 1.5 / H;
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;                    // radius fraction, as above
      // the bitangent runs from rim to label, so the slope enters negated
      const s = -(hAt(v + dv) - hAt(v - dv)) / (2 * dv);
      const ny = (Math.atan(s * 0.016) / (Math.PI / 2)) * 0.72;
      const nz = Math.sqrt(Math.max(0.02, 1 - ny * ny));
      const G = ((ny * 0.5 + 0.5) * 255) | 0;
      const B = ((nz * 0.5 + 0.5) * 255) | 0;
      for (let k = 0; k < 4; k++) {
        const i = (y * 4 + k) * 4;
        img.data[i] = 128; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    return t;
  });
}

/**
 * The printed label — a 100 mm paper disc with real type on it.
 *
 * Round 3 drew a bare brown ring, and at this framing the label is the one
 * light-valued object inside the largest dark object in the picture: the eye
 * goes straight to it and finds nothing. A record label is paper, so it is the
 * only matte thing on the disc, and it is printed, so it carries type set on
 * arcs. Two arcs of type in the annulus the record weight leaves visible do
 * more for the read than any amount of ring ruling.
 */
function labelTex() {
  return cached('lbl', () => {
    const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d');
    const cx = S / 2;
    g.fillStyle = '#0d0a06'; g.fillRect(0, 0, S, S);
    // NOT mirrored. Tried it: the arc set along the foot of the label reads
    // upside down whenever the platter has carried it round to the top, which
    // is what a photographed record does, and "fixing" it with a horizontal
    // flip put the type into a genuine mirror.
    g.fillStyle = '#6e5530';                       // deep amber stock
    g.beginPath(); g.arc(cx, cx, cx * 0.995, 0, TAU); g.fill();

    // paper is not one flat value: a faint radial shade off the spindle
    const shade = g.createRadialGradient(cx, cx, cx * 0.10, cx, cx, cx);
    shade.addColorStop(0, 'rgba(255,236,200,0.07)');
    shade.addColorStop(1, 'rgba(24,16,6,0.34)');
    g.fillStyle = shade;
    g.beginPath(); g.arc(cx, cx, cx * 0.995, 0, TAU); g.fill();

    const INK = '#241a0c';
    g.strokeStyle = 'rgba(26,18,8,0.85)';
    for (const [r, w] of [[0.955, 5], [0.930, 2], [0.470, 2], [0.440, 5]]) {
      g.lineWidth = w;
      g.beginPath(); g.arc(cx, cx, cx * r, 0, TAU); g.stroke();
    }

    /** Type set on an arc. `bottom` runs it the right way up along the foot. */
    const arcText = (txt, rf, px, bottom, track = 1.16) => {
      g.save();
      g.translate(cx, cx);
      g.fillStyle = INK;
      g.font = `600 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const r = cx * rf;
      const wds = [...txt].map((ch) => g.measureText(ch).width * track);
      const span = wds.reduce((a, b) => a + b, 0) / r;
      let a = bottom ? span / 2 : -span / 2;
      for (let i = 0; i < txt.length; i++) {
        const da = wds[i] / r;
        g.save();
        g.rotate(bottom ? a - da / 2 : a + da / 2);
        g.translate(0, bottom ? r : -r);
        if (bottom) g.rotate(Math.PI);
        g.fillText(txt[i], 0, 0);
        g.restore();
        a += bottom ? -da : da;
      }
      g.restore();
    };
    // Set SMALL. The record turns, so at any instant the arcs may be at the
    // foot of the label and reading upside down — which is what a photographed
    // record does, and is only distracting if the type is large enough to parse.
    // At 42 px on a 1024 canvas the cap height lands at ~8 px on screen: plainly
    // type, not plainly a word.
    arcText('GROOVE TO VOLTAGE', 0.855, 42, false);
    arcText('REFERENCE PRESSING', 0.855, 30, true);
    arcText('45/45 STEREO', 0.630, 32, false);
    arcText('33⅓ RPM · SIDE A', 0.630, 27, true);

    // the small print, implied: a fine ring of marks between the two arcs
    g.fillStyle = 'rgba(26,18,8,0.55)';
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      g.save();
      g.translate(cx + Math.cos(a) * cx * 0.745, cx + Math.sin(a) * cx * 0.745);
      g.rotate(a + Math.PI / 2);
      g.fillRect(-9, -2.5, 18, 5);
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    // A RingGeometry's u runs with local +x and the ring is laid down by a
    // −90° rotation about X, which reverses the handedness the type was drawn
    // in: set straight, "SIDE A" comes out "A EDIS". Mirroring the SAMPLE is
    // unambiguous where mirroring the canvas transform is not (with centre at
    // 0.5 and repeat −1 the sample stays inside [0,1], so clamping is safe).
    t.center.set(0.5, 0.5);
    t.repeat.set(-1, 1);
    t.anisotropy = 8;
    return t;
  });
}

/**
 * Strobe ring: `bars` dark marks round the platter rim. A texture rather than
 * 180 instanced solids, so it mips instead of shimmering into a moiré. The
 * light bars are deliberately mid-grey, not white: this ring used to be the
 * brightest thing in frame and it was beating the record, which is the subject.
 */
function strobeTex(bars) {
  return cached('str' + bars, () => {
    const P = 8, W = bars * P;
    const c = makeCanvas(W, 4), g = c.getContext('2d');
    g.fillStyle = '#8d9299'; g.fillRect(0, 0, W, 4);
    g.fillStyle = '#1e2125';
    for (let i = 0; i < bars; i++) g.fillRect(i * P + P * 0.28, 0, P * 0.44, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
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
const R_LABEL   = 0.0505;                     // printed label outer radius
const R_DISC    = 0.1495;

/**
 * Satin materials for the arm. An armwand is bead-blasted alloy, not a mirror;
 * at mats().alu's roughness 0.26 with full environment intensity the tube
 * returned a clipped 100 % white line down its whole length and the cartridge
 * and stylus vanished into it.
 */
let _armMat = null, _headMat = null, _steelMat = null, _plateMat = null;
function armMats() {
  if (!_armMat) {
    _armMat = mats().alu.clone();
    _armMat.color.setHex(0x8b9198);
    _armMat.roughness = 0.37;
    _armMat.envMapIntensity = 0.80;
    _armMat.anisotropy = 0.40;

    _headMat = mats().anodBlack.clone();
    _headMat.color.setHex(0x23262a);
    _headMat.roughness = 0.46;
    _headMat.envMapIntensity = 0.72;

    _steelMat = mats().steel.clone();
    _steelMat.color.setHex(0x7f858c);
    _steelMat.roughness = 0.42;
    _steelMat.envMapIntensity = 0.56;

    // ROUND 4: at roughness 0.38 the top plate's two long broken edges returned
    // a pair of clipped white rails across the lower left of the frame, which
    // beat the record for brightness. A machined alloy top plate is satin.
    _plateMat = mats().alu.clone();
    _plateMat.roughness = 0.42;
    _plateMat.envMapIntensity = 0.62;
  }
  return { arm: _armMat, head: _headMat, steel: _steelMat, plate: _plateMat };
}

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
  ], 128, mats().anodBlack);
  g.add(body);

  // proud alloy band round the rim, carrying the printed strobe
  const rimMat = mats().alu.clone();
  rimMat.color.setHex(0xffffff);
  rimMat.roughness = 0.52;
  rimMat.map = strobeTex(STROBE_BARS);
  rimMat.envMapIntensity = 0.85;
  g.add(lathe([
    [0.1552, 0.0242], [0.1566, 0.0258], [0.1566, 0.0422], [0.1552, 0.0438],
  ], 192, rimMat));

  return g;
}

let _vinylTop = null, _vinylEdge = null;
function vinylMats() {
  if (!_vinylTop) {
    _vinylTop = mats().vinyl.clone();
    // The key is 3200 K-ish; a rougher diffuse lobe takes more of it, and the
    // disc drifted warm-brown. Vinyl is neutral, so the base pulls very slightly
    // cool to sit the sheen back at neutral black.
    _vinylTop.color.setHex(0x080a0e);
    _vinylTop.roughness = 1.0;                        // the map carries the value
    _vinylTop.roughnessMap = grooveRoughTex();
    _vinylTop.normalMap = grooveNormalTex();
    _vinylTop.normalScale = new THREE.Vector2(0.024, 0.024);
    // A specular layer over the surface, not instead of it: the clearcoat is a
    // second, much tighter lobe sitting in front of the roughness ramp, so the
    // studio strip lays a hard sheen across the disc while the lands and the
    // modulated band still read underneath it. Round 2 had this at 0.15, which
    // is below the level where the second lobe is visible at all.
    _vinylTop.clearcoat = 0.44;
    _vinylTop.clearcoatRoughness = 0.055;
    // A horizontal disc seen from 29 degrees above can only mirror what is
    // BEHIND it and high up, and in this rig that is bare shell — which is why
    // every attempt to light the record with envMapIntensity alone left it dead.
    // What the disc actually catches is the two directional practicals, and a
    // point-like source on a near-mirror is a blown streak, not a photograph.
    // So: hold the specular F0 down (which scales the direct lobe) and put the
    // brightness back through the environment only, where it arrives as the
    // broad soft gradient a softbox gives.
    //
    // ROUND 3: envMapIntensity was 3.10, set when the softboxes were narrow and
    // hot and the disc would not light at all. The emitters are now wide and
    // dim, and at 3.10 the record came back as brushed aluminium — a mid-grey
    // disc banded like a machined part. An LP under a softbox is BLACK, with
    // one broad sheen across it and the ring structure visible only inside that
    // sheen. 1.25 is where the black returns and the rings survive.
    // ROUND 4: 0.85 still lit the disc to a mid grey. An LP under a softbox is
    // BLACK with one sheen laid across it; the ring structure lives inside that
    // sheen and nowhere else. The clearcoat above now carries the sheen, so the
    // diffuse/rough lobe can come down to where black is black again.
    _vinylTop.specularIntensity = 0.26;
    _vinylTop.envMapIntensity = 0.34;
    // An anisotropic lobe rotated onto the circumference draws the specular into
    // concentric arcs — the signature of a record under a studio softbox. At
    // rotation 0 it smears the other way and the disc starbursts.
    _vinylTop.anisotropy = 0.40;
    _vinylTop.anisotropyRotation = Math.PI / 2;

    _vinylEdge = mats().vinyl.clone();
    _vinylEdge.roughness = 0.30;
    _vinylEdge.roughnessMap = null;
    _vinylEdge.clearcoat = 0.40;
    _vinylEdge.clearcoatRoughness = 0.10;
    _vinylEdge.envMapIntensity = 1.05;
  }
  return [_vinylTop, _vinylEdge];
}

function buildRecord() {
  const g = new THREE.Group();
  const [topMat, edgeMat] = vinylMats();

  // Body: underside and rim bead only. It used to carry a top land from the rim
  // in to the label as well — exactly coplanar with the playing surface below,
  // so the two z-fought and speckled the disc.
  const body = lathe([
    [0.00364, 0], [0.1495, 0], [0.1512, 0.0004], [0.1512, 0.0014], [0.1495, T_REC],
  ], 160, edgeMat);
  g.add(body);

  // Playing surface: its own lathe, points spaced evenly in radius so the maps'
  // v axis is linear in r.
  //
  // THE PROFILE RUNS INWARD, AND IT MUST. LatheGeometry takes the normal as
  // (dy, −dx) of the profile step, so a flat annulus written outward
  // (dx > 0, dy = 0) gets a normal of (0, −1) — pointing at the floor. Rounds 1
  // and 2 wrote it outward, so the record was shaded as though it faced away
  // from the camera: no key, no highlight, no anisotropy, nothing but ambient.
  // That, not the mip chain, is why it rendered as a grey slate. Written
  // inward, the normal is (0, +1) and the disc lights.
  // 64 × 176, not 96 × 256: the maps are linear in r and the profile is flat, so
  // the extra 26k triangles bought nothing and this stage is permanently in the
  // wide shot where every other stage's geometry is competing for the frame.
  const NP = 64, pts = [];
  for (let i = 0; i <= NP; i++) pts.push([R_DISC - (R_DISC - R_LABEL) * (i / NP), T_REC]);
  const surf = lathe(pts, 176, topMat);
  surf.receiveShadow = true;
  g.add(surf);

  // printed label, a hair proud of the land
  const paper = mats().plastic.clone();
  paper.color.setHex(0xffffff);
  paper.map = labelTex();
  paper.roughness = 0.72;
  paper.clearcoat = 0.20;
  paper.clearcoatRoughness = 0.42;
  const label = new THREE.Mesh(new THREE.RingGeometry(0.00372, R_LABEL, 96, 1), paper);
  label.rotation.x = -Math.PI / 2;
  label.position.y = T_REC + 0.00007;
  label.receiveShadow = true;
  g.add(label);
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
  ], 40, armMats().plate);
  g.add(cap);
  const pulley = lathe([
    [0, 0.0640], [R_PULLEY, 0.0640], [R_PULLEY, 0.0648],
    [R_PULLEY - 0.0006, 0.0652], [R_PULLEY - 0.0006, 0.0718],
    [R_PULLEY, 0.0722], [R_PULLEY, 0.0760], [0, 0.0760],
  ], 40, armMats().steel);
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
  const M = armMats();

  const slab = new THREE.Mesh(GEO.bevelBox(W, 0.026, D, 0.0028, 4), mats().anodBlack);
  slab.position.set(CX, 0.039, CZ);
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);

  const plate = new THREE.Mesh(GEO.bevelBox(W - 0.020, 0.006, D - 0.020, 0.0018, 3), M.plate);
  plate.position.set(CX, 0.055, CZ);
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);

  // ambient occlusion where the platter and the arm base meet the top plate —
  // without these both float over the polished alloy
  const shP = GEO.contactShadow(0.38, 0.38, 0.62, 0.0587);
  shP.position.set(0, 0, 0);
  g.add(shP);
  const shA = GEO.contactShadow(0.105, 0.105, 0.55, 0.0588);
  shA.position.set(PIVOT[0], 0, PIVOT[1]);
  g.add(shA);

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
    ], 32, M.steel);
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

/** Cartridge: two-part shell, alloy top plate, gold pin block, cantilever. */
function buildCartridge() {
  const g = new THREE.Group();          // origin = the stylus tip, on the surface
  const M = armMats();
  const shell = mats().anodBlack.clone();
  shell.color.setHex(0x191c20);
  shell.roughness = 0.40;
  shell.envMapIntensity = 0.70;

  const body = new THREE.Mesh(GEO.bevelBox(0.0168, 0.0104, 0.0152, 0.0007, 3), shell);
  body.position.set(-0.0184, 0.0104, 0);
  g.add(body);

  // tapered nose down to the cantilever root
  const nose = new THREE.Mesh(GEO.bevelBox(0.0078, 0.0066, 0.0108, 0.0008, 3), M.head);
  nose.position.set(-0.0066, 0.0058, 0);
  g.add(nose);
  const chin = new THREE.Mesh(GEO.bevelBox(0.0044, 0.0022, 0.0072, 0.0006, 2), M.plate);
  chin.position.set(-0.0060, 0.0032, 0);
  g.add(chin);

  // alloy top plate with the two mounting screws
  const top = new THREE.Mesh(GEO.bevelBox(0.0176, 0.0018, 0.0160, 0.0005, 2), M.plate);
  top.position.set(-0.0184, 0.0166, 0);
  g.add(top);
  for (const sz of [-1, 1]) {
    const sc = GEO.screw(0.0011);
    sc.rotation.x = 0;
    sc.position.set(-0.0184, 0.0176, sz * 0.0058);
    g.add(sc);
  }

  // gold pin block at the rear
  const blk = new THREE.Mesh(GEO.bevelBox(0.0030, 0.0086, 0.0112, 0.0005, 2), mats().plastic);
  blk.position.set(-0.0281, 0.0088, 0);
  g.add(blk);
  for (const [dy, dz] of [[0.0056, -0.0040], [0.0056, 0.0040], [0.0120, -0.0040], [0.0120, 0.0040]]) {
    const pin = new THREE.Mesh(GEO.bevelCyl(0.00055, 0.00055, 0.0032, 10, 0.0002), mats().gold);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(-0.0300, dy, dz);
    g.add(pin);
  }

  // cantilever at 26.6° below horizontal, tip on the playing surface
  const cant = taperTube([[-0.0082, 0.0041, 0], [-0.0004, 0.0002, 0]], 0.00042, 0.00024, M.plate, 10, 6);
  g.add(cant);
  const dia = mats().chrome.clone();
  dia.color.setHex(0xe8f0f6); dia.roughness = 0.02;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.00040, 0.00105, 14), dia);
  tip.position.set(0.00012, 0.00042, 0);
  tip.rotation.z = Math.PI;
  g.add(tip);
  return g;
}

function buildArm() {
  const arm = new THREE.Group();          // rotates about the vertical bearing
  arm.position.set(PIVOT[0], ARM_Y, PIVOT[1]);
  const M = armMats();

  // gimbal yoke
  for (const sz of [-1, 1]) {
    const up = new THREE.Mesh(GEO.bevelBox(0.0075, 0.020, 0.0045, 0.0008, 2), M.steel);
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
  ], 0.0058, 0.0042, M.arm, 20, 48);
  arm.add(tube);

  // counterweight stub + counterweight
  const stub = new THREE.Mesh(GEO.bevelCyl(0.0052, 0.0052, 0.072, 24, 0.0006), M.steel);
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
  const cwRing = new THREE.Mesh(new THREE.TorusGeometry(0.0247, 0.0011, 8, 40), M.steel);
  cwRing.rotation.y = Math.PI / 2;
  cwRing.position.set(-0.052, 0, 0);
  arm.add(cwRing);

  // anti-skate: outrigger, thread over a post, hanging weight
  const out = new THREE.Mesh(GEO.bevelCyl(0.0016, 0.0016, 0.044, 14, 0.0003), M.steel);
  out.rotation.x = Math.PI / 2;
  out.position.set(-0.0155, 0.0035, 0.026);
  arm.add(out);
  const post = new THREE.Mesh(GEO.bevelCyl(0.0011, 0.0013, 0.013, 12, 0.0003), M.steel);
  post.position.set(-0.0155, 0.0095, 0.047);
  arm.add(post);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.00022, 0.00022, 0.022, 6), mats().plastic);
  thread.position.set(-0.0155, 0.0045, 0.0505);
  arm.add(thread);
  const wt = lathe([[0, 0], [0.0038, 0], [0.0042, 0.0008], [0.0042, 0.0052], [0.0038, 0.0060], [0, 0.0060]], 20, M.steel);
  wt.position.set(-0.0155, -0.0075, 0.0505);
  arm.add(wt);

  // ---- headshell + cartridge, rotated by the offset angle about the stylus
  const head = new THREE.Group();
  head.position.set(L_EFF, Y_SURF - ARM_Y, 0);
  head.rotation.y = -OFFSET;
  arm.add(head);

  const plate = new THREE.Mesh(GEO.bevelBox(0.0300, 0.0035, 0.0190, 0.0008, 3), M.head);
  plate.position.set(-0.0190, 0.0196, 0);
  head.add(plate);
  const stubT = taperTube([
    [-0.0245, 0.0194, 0.0020], [-0.0275, 0.0178, 0.0062], [-0.0300, 0.0160, 0.0100],
  ], 0.0040, 0.0042, M.arm, 14, 10);
  head.add(stubT);
  const collar = new THREE.Mesh(GEO.bevelCyl(0.0048, 0.0048, 0.0060, 20, 0.0006), mats().anodBlack);
  collar.rotation.z = Math.PI / 2;
  collar.rotation.y = 0.55;
  collar.position.set(-0.0272, 0.0179, 0.0060);
  head.add(collar);
  const lift = new THREE.Mesh(GEO.bevelBox(0.0055, 0.0090, 0.0016, 0.0005, 2), M.plate);
  lift.position.set(-0.0038, 0.0232, 0.0080);
  lift.rotation.x = 0.42;
  head.add(lift);

  head.add(buildCartridge());

  arm.userData.head = head;
  return arm;
}

function buildArmBase() {
  const g = new THREE.Group();
  g.position.set(PIVOT[0], 0, PIVOT[1]);
  const M = armMats();
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
  const vtaScrew = new THREE.Mesh(GEO.bevelCyl(0.0022, 0.0022, 0.0060, 14, 0.0004), M.steel);
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
  const lev = new THREE.Mesh(GEO.bevelCyl(0.0028, 0.0032, 0.0170, 20, 0.0005), M.plate);
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

/**
 * The record weight. It was 60 mm across and 22 mm tall, which covered the
 * label out to 30 mm — most of the printed area — and left the disc with a dark
 * boss where its one light-valued element should be. A 39 mm weight holds the
 * record down just as well and leaves the whole 100 mm label reading.
 */
function buildClamp() {
  const g = new THREE.Group();
  const y = Y_SURF;
  const M = armMats();
  const body = lathe([
    [0.0040, y], [0.0186, y], [0.0195, y + 0.0011], [0.0195, y + 0.0042],
    [0.0164, y + 0.0058], [0.0164, y + 0.0118], [0.0146, y + 0.0134],
    [0.0052, y + 0.0134], [0.0052, y + 0.0118],
  ], 48, mats().anodBlack);
  g.add(body);
  const knurl = GEO.knob(0.0166, 0.0070, { flutes: 44, body: mats().anodGrey, dial: false });
  knurl.position.y = y + 0.0090;
  g.add(knurl);
  const cap = new THREE.Mesh(GEO.bevelCyl(0.0138, 0.0148, 0.0020, 40, 0.0005), mats().anodBlack);
  cap.position.y = y + 0.0142;
  g.add(cap);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.0143, 0.0007, 8, 44), M.plate);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = y + 0.0134;
  g.add(trim);
  return g;
}

// ---------------------------------------------------------------------------
// FRAMING
// ---------------------------------------------------------------------------

/**
 * Aim between the spindle and the stylus, not at the plinth.
 *
 * ROUND 4 REFRAME. The old shot was built round a 0.30 m subject radius, which
 * is the ISOLATION PLINTH's radius, not the deck's — so the largest area in the
 * frame was 0.66 × 0.56 m of core-owned matte slab returning nothing, while the
 * cartridge, which is what the chapter is about, measured 25 px. The subject
 * radius is now the deck's own (0.20 m) and the aim sits a third of the way
 * from the spindle towards the stylus, so the record, the arm and the headshell
 * share the safe box and the plinth is cropped back to a surround.
 *
 * Distance falls 1.68 → 1.04 m and the elevation rises 28.6° → 33.5°, which
 * opens the record towards a circle and puts the headshell assembly at ~85 px.
 *
 * The azimuth is chosen as much for what it excludes: at −0.74 rad the left
 * subwoofer clears the frame entirely and the counterweight does not cross the
 * platter rim.
 */
const AIM_LX = 0.013, AIM_LZ = 0.015;        // local, spindle at the origin
const AIM = [
  LAYOUT.ttPlinth.x + AIM_LX * Math.cos(LAYOUT.ttPlinth.ry) + AIM_LZ * Math.sin(LAYOUT.ttPlinth.ry),
  LAYOUT.ttPlinth.top + Y_SURF + 0.022,
  LAYOUT.ttPlinth.z - AIM_LX * Math.sin(LAYOUT.ttPlinth.ry) + AIM_LZ * Math.cos(LAYOUT.ttPlinth.ry),
];
const FOV = 27;
const SHOT = frameShot(AIM, 0.200, { fill: 1.020, az: -0.74, el: 0.650, fov: FOV });

// Camera basis, so overlay cards can be placed in SCREEN terms and not guessed
// at in world coordinates.
const CAM_P = new THREE.Vector3(...SHOT.position);
const CAM_T = new THREE.Vector3(...SHOT.target);
const FWD = CAM_T.clone().sub(CAM_P).normalize();
const RIGHT = new THREE.Vector3().crossVectors(FWD, new THREE.Vector3(0, 1, 0)).normalize();
const UP = new THREE.Vector3().crossVectors(RIGHT, FWD).normalize();
// The Director offsets the principal point so the optical centre lands at 0.40
// of the canvas width; at 1600 × 1000 that is an NDC shift of 0.1625.
const SHIFT = 0.1625, ASPECT = 1.6;
const TAN_H = Math.tan((FOV * Math.PI) / 360);

/** World point that projects to screen fraction (sx, sy) at `dist` from camera. */
function screenPoint(sx, sy, dist) {
  const halfH = dist * TAN_H, halfW = halfH * ASPECT;
  return CAM_P.clone()
    .addScaledVector(FWD, dist)
    .addScaledVector(RIGHT, ((2 * sx - 1) + SHIFT) * halfW)
    .addScaledVector(UP, (1 - 2 * sy) * halfH);
}

// ---------------------------------------------------------------------------
// OVERLAY — ONE card. Round 2 ran two, and neither carried its area.
// ---------------------------------------------------------------------------

// The card hangs 0.56 m from the lens — barely half the 1.04 m to the deck, so
// nothing of the hero can print through the drawing — and it is sized (see
// CARD_W above, from which MAG is derived) to 0.19 of the frame width. Placed
// at screen (0.235, 0.170) it spans x 224…528 px and y 108…232 px at
// 1600 × 1000: inside the safe box on the left, clear of the arm's bearing
// housing on the right at 560 px, and 100 px above the record's top edge.
const CARD_AT = screenPoint(0.235, 0.170, CARD_D);

/** Filled strip under a polyline whose top edge is rewritten every frame. */
function fillStrip(n, color, opacity, yBase, order = 6) {
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
  mesh.renderOrder = order;
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

/**
 * THE card — three grooves of a 45/45 cut in section, with the tip riding the
 * middle one.
 *
 * MAG is derived (see the constant) so that exactly three grooves at the true
 * 129 µm pitch span the card edge to edge: the 60 µm width, the 69 µm land and
 * the 129 µm pitch are all in one picture at one scale, dimensioned as a chain
 * whose witnesses sit on real feature edges, and the ±9 µm the tip actually
 * wanders is visibly a small fraction of the land it must not cross.
 *
 * Every length in the drawing scales with CS = MAG/770, the layout having been
 * drawn at 770 : 1, so shrinking the card reproportions it rather than cropping.
 */
function buildGrooveCard(S) {
  const g = new THREE.Group();
  const W = CARD_W, H = CARD_H;
  g.add(cardPlate(W, H));

  const CX = W / 2, CY = 0.062 * CS;        // centre groove axis · surface level
  const D  = GROOVE_D * MAG;                // groove depth
  const RB = BOTTOM_R * MAG;                // bottom fillet
  const RT = TIP_R_H * MAG;                 // tip across-groove radius
  const PW = PITCH * MAG;                   // one groove pitch
  const UM = U_MAX * MAG;                   // widest wander
  const NX = 300;

  /** One groove's cut below the land, dx from its own axis, apex raised by w. */
  const cut = (dx, w) => {
    const wall = Math.abs(dx) - D + w;
    if (wall >= 0) return 0;
    if (Math.abs(dx) < RB) {
      const arc = (-D + w + RB * SQ2) - Math.sqrt(Math.max(0, RB * RB - dx * dx));
      return Math.min(0, Math.max(wall, arc));
    }
    return wall;
  };
  // The cut before, the cut being played, and the cut after.
  const prof = (x, u, w) => Math.min(
    cut(x - (CX - PW), 0),
    cut(x - (CX + u * MAG), w * MAG),
    cut(x - (CX + PW), 0),
  );

  // ---- the sectioned vinyl -------------------------------------------------
  const fill = fillStrip(NX, 0x1b222b, 0.97, 0.0, 6);
  g.add(fill);
  // Hatching in the regions that are solid vinyl whatever the modulation does:
  // the two lands, and everything below the deepest the apex ever goes.
  const yFloor = CY - D - UM - 0.004 * CS;
  g.add(hatchRects([
    [0, 0, W, yFloor],
    [0, yFloor, CX - PW - D, CY],
    [CX - PW + D, yFloor, CX - D - UM, CY],
    [CX + D + UM, yFloor, CX + PW - D, CY],
    [CX + PW + D, yFloor, W, CY],
  ], 0.0110 * CS, 0x4b586a, 0.70));

  const edge = new DIAG.Trace(NX, 0xb3bcc6, 1.9, { opacity: 0.95, renderOrder: 12 });
  g.add(edge);
  // The two walls of the played groove. They are two channels, and the palette
  // carries exactly one signal colour — so they are the same cyan at two
  // values, solid for L and dashed for R, and the caption does the naming.
  // (Round 2 used violet for R: a fourth hue, on the most-read element in the
  // frame, and the only violet in twelve chapters.)
  const wallL = new DIAG.Trace(2, PAL.cy, 3.0, { opacity: 0.95, renderOrder: 19 });
  const wallR = new DIAG.Trace(2, PAL.cy, 3.0,
    { opacity: 0.78, dashed: true, dashSize: 0.0042 * CS, gapSize: 0.0032 * CS, renderOrder: 19 });
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
    const k = RB * 0.9, s = D - w * MAG;                 // run of one wall
    wallL.write((i) => (i === 0 ? [ax - k, ay + k, 0.0009] : [ax - s, CY, 0.0009]));
    wallR.write((i) => (i === 0 ? [ax + k, ay + k, 0.0009] : [ax + s, CY, 0.0009]));
  };

  // ---- the unmodulated groove, ghosted -------------------------------------
  // The modulation must read as a departure from a datum, not as a wobble.
  const rx0 = CX - D - UM - 0.004 * CS, rx1 = CX + D + UM + 0.004 * CS, NR = 90;
  const rest = new DIAG.Trace(NR, PAL.ink3, 1.3,
    { opacity: 0.62, dashed: true, dashSize: 0.0040 * CS, gapSize: 0.0034 * CS, renderOrder: 10 });
  rest.write((i) => {
    const x = rx0 + (rx1 - rx0) * (i / (NR - 1));
    return [x, CY + prof(x, 0, 0), 0.0003];
  });
  g.add(rest);

  // ---- the dimension chain: 60 + 69 = 129 µm -------------------------------
  // Every witness lands on a real edge of the drawing, and on a STATIC one:
  //   xA, xB  the left groove's two top corners      → 60 µm, the groove width
  //   xB, xC  that corner to the played groove's own
  //           top corner at rest (the ghosted datum) → 69 µm, the land
  //   xA, xC  one whole period, corner to corner     → 129 µm, the pitch
  // The played groove wanders ±9 µm about xC, which at this scale is a tenth of
  // the land: the ghost is drawn precisely so the chain still measures something
  // when it does.
  const DIM1 = CY + 0.0130 * CS, DIM2 = CY + 0.0300 * CS;
  const xA = CX - PW - D, xB = CX - PW + D, xC = CX - D;
  for (const [p, q, y] of [[xA, xB, DIM1], [xB, xC, DIM1], [xA, xC, DIM2]]) {
    g.add(dimH(p, q, y));
  }
  for (const x of [xA, xB, xC]) {                    // projection lines
    const t = new DIAG.Trace(2, PAL.ink3, 1.0, { opacity: 0.42, renderOrder: 10 });
    t.write((i) => [x, i ? DIM2 + 0.005 * CS : CY - 0.002 * CS, 0.0005]);
    g.add(t);
  }
  const anchor = (x, y) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, 0);
    g.add(o);
    return o;
  };
  // ---- the included angle, on the groove that has no stylus in it ---------
  // "45/45" is a claim about this angle and nothing else on the card states it.
  const AX = CX + PW, AY = CY - D, AR = D * 0.62;
  const arc = new DIAG.Trace(21, PAL.ink3, 1.2, { opacity: 0.75, renderOrder: 11 });
  arc.write((i) => {
    const a = (Math.PI / 4) + (Math.PI / 2) * (i / 20);
    return [AX + Math.cos(a) * AR, AY + Math.sin(a) * AR, 0.0012];
  });
  g.add(arc);
  const lead = new DIAG.Trace(2, PAL.ink3, 1.0, { opacity: 0.45, renderOrder: 11 });
  lead.write((i) => [AX, i ? CY + 0.0125 * CS : AY + AR, 0.0012]);
  g.add(lead);

  S.aWidth = anchor((xA + xB) / 2, DIM1);
  S.aLand  = anchor((xB + xC) / 2, DIM1);
  S.aPitch = anchor((xA + xC) / 2, DIM2);
  S.aAngle = anchor(AX, CY + 0.0135);

  // ---- stylus (a group that is simply moved) ------------------------------
  // The tip is tangent to both 45° walls, so its centre sits r√2 above the
  // apex and its underside clears the groove bottom by r(√2 − 1) = 7.5 µm. It
  // rides the walls; it never touches the bottom, and the section has to show
  // that or it teaches the opposite of the truth.
  const sty = new THREE.Group();
  g.add(sty);
  // Nearly clear: the diamond must not hide the walls it is riding on.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(RT, 48),
    new THREE.MeshBasicMaterial({ color: 0x76838f, transparent: true, opacity: 0.20, depthWrite: false, toneMapped: false }));
  disc.renderOrder = 14;
  sty.add(disc);
  const shank = poly([
    [-RT * 0.58, RT * 0.98], [RT * 0.58, RT * 0.98], [RT * 0.40, RT * 2.30], [-RT * 0.40, RT * 2.30],
  ], 0x59646f, 0.44, 14);
  sty.add(shank);
  const ring = new DIAG.Trace(49, 0xe6ecf3, 1.7, { opacity: 0.95, renderOrder: 16 });
  ring.write((i) => [Math.cos((i / 48) * TAU) * RT, Math.sin((i / 48) * TAU) * RT, 0.002]);
  sty.add(ring);
  // the two Hertzian contact patches, drawn 2a wide at the same magnification
  const aP = A_HZ * MAG;
  for (const s of [-1, 1]) {
    const c = new DIAG.Trace(2, PAL.am, 4.5, { opacity: 1, renderOrder: 17 });
    const cx = s * RT * 0.7071, cy = -RT * 0.7071;
    c.write((i) => {
      const kk = (i === 0 ? -1 : 1) * aP * 0.7071;
      return [cx + kk, cy + s * kk, 0.0026];
    });
    sty.add(c);
  }
  S.stylusAt = (u, w) => sty.position.set(CX + u * MAG, CY - D + w * MAG + RT * SQ2, 0.001);

  // No u/w construction legs. The whole excursion is ±9 µm — a few screen
  // pixels at this scale — so a right triangle drawn on it is a white smudge
  // inside the diamond, not a decomposition. The live u and w are on the
  // cartridge label, where they are readable, and the locus shows the shape.

  // ---- the tip locus: the stereo ellipse it actually traces ---------------
  const NL = 96;
  const locus = new DIAG.Trace(NL, PAL.cy, 1.8, { opacity: 0.80, renderOrder: 20 });
  g.add(locus);
  S.locusWrite = (phase) => {
    locus.write((i) => {
      const th = phase - (i / (NL - 1)) * TAU;
      const [u, w] = tipFromWalls(A_L * Math.sin(th), A_R * Math.sin(th + R_PHASE));
      return [CX + u * MAG, CY - D + w * MAG + RT * SQ2, 0.0008];
    });
  };

  // the specular layer, over everything
  // Sized to the plate, not past it: glass overhanging its own bezel is a decal.
  const spec = cardGlass(W + 0.038 * CS, H + 0.038 * CS);
  spec.position.set(W / 2, H / 2, 0.0022);
  g.add(spec);

  S.headA = anchor(CX, -0.026 * CS);

  g.position.set(-CARD_W / 2, -CARD_H / 2, 0);
  return g;
}

/** Velocity annotation drawn on the record itself. */
function buildRecordAnnot(S) {
  const g = new THREE.Group();
  const P = LAYOUT.ttPlinth;
  g.position.set(P.x, P.top, P.z);
  g.rotation.y = P.ry;
  // 4 mm proud of the vinyl, not 1: an annotation drawn ON the surface reads as
  // paint applied to the record instead of as an overlay above it.
  const Y = Y_SURF + 0.0040;

  const circle = (r, colour, width, op, dash) => {
    const n = 128;
    const t = new DIAG.Trace(n, colour, width, dash
      ? { opacity: op, renderOrder: 12, dashed: true, dashSize: 0.008, gapSize: 0.007 }
      : { opacity: op, renderOrder: 12 });
    t.write((i) => {
      const a = (i / (n - 1)) * TAU;
      return [Math.cos(a) * r, Y, Math.sin(a) * r];
    });
    return t;
  };
  g.add(circle(R_OUT, PAL.cy, 1.3, 0.36, true));
  g.add(circle(R_IN, PAL.cy, 1.3, 0.36, true));
  const live = circle(0.11, PAL.am, 1.6, 0.8, false);
  g.add(live);
  S.liveCircleWrite = (r) => {
    const n = 128;
    live.write((i) => {
      const a = (i / (n - 1)) * TAU;
      return [Math.cos(a) * r, Y, Math.sin(a) * r];
    });
  };

  // Tangential velocity, lengths in true proportion (0.16 m of arrow per m/s).
  // The platter turns clockwise seen from above (rotation.y decreasing), so a
  // point at angle a has velocity Ω·r·(−sin a, +cos a) in (x, z).
  const K = 0.16;
  const A_OUT = 2.42, A_IN = 3.66;        // clear quadrants, away from the arm
  const tang = (r, a) => {
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    const tx = -Math.sin(a), tz = Math.cos(a);
    const v = vAt(r) * K;
    return arrow([px, Y, pz], [px + tx * v, Y, pz + tz * v], PAL.cy, 2.8, 0.0062);
  };
  g.add(tang(R_OUT, A_OUT));
  g.add(tang(R_IN, A_IN));

  S.anchorOut = new THREE.Object3D();
  S.anchorOut.position.set(Math.cos(A_OUT) * R_OUT, Y, Math.sin(A_OUT) * R_OUT);
  g.add(S.anchorOut);
  return g;
}

// ---------------------------------------------------------------------------

const S = {
  r: 0.110, phase: 0,
  d: { v: vAt(0.110), tip: 0, e: 0, err: trackErr(0.110), u: 0, w: 0, vmax: vMaxAt(0.110) },
};

const f2 = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);

/** Evaluate every displayed number at ONE instant and write the labels. */
function latch() {
  const d = S.d, ph = S.phase;
  const vL = V_L_PK * Math.cos(ph);
  const vR = V_R_PK * Math.cos(ph + R_PHASE);
  const [u, w] = tipFromWalls(A_L * Math.sin(ph), A_R * Math.sin(ph + R_PHASE));
  d.u = u; d.w = w;
  d.tip = Math.hypot(vL, vR);
  d.e = DSP.backEmf(BL, vL);
  d.v = vAt(S.r);
  d.err = trackErr(S.r);
  d.vmax = vMaxAt(S.r);
  if (S.labEmf) {
    S.labEmf.setText(`tip u = ${f2(d.u * 1e6)} µm · w = ${f2(d.w * 1e6)} µm`);
    S.labEmf.setValue(`${(d.e * 1e6).toFixed(0)} µV of ${(E_PK * 1e6).toFixed(0)} µV pk (${(E_RMS * 1e6).toFixed(0)} µV rms)`);
  }
  return d;
}

export default {
  id: 'turntable',
  title: 'Groove to Voltage',
  nav: 'Turntable',
  kicker: 'Turntable',
  standfirst: 'A diamond reads a scratch and reports its speed.',
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
    ], 24, armMats().steel);
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
    panel.position.copy(CARD_AT);
    panel.lookAt(CAM_P);
    // Off the lens axis. A card square to the camera is a decal; a few degrees
    // of yaw gives it perspective, and it is what lets the specular sweep move
    // across the glass instead of sitting on it.
    panel.rotateY(-0.20);
    panel.add(buildGrooveCard(S));
    ov.add(panel);
    ov.add(buildRecordAnnot(S));

    // ---- labels ------------------------------------------------------------
    // ROUND 4: four world labels stacked at bottom-centre read as a bulleted
    // list dropped on the photograph. Two survive — one on the headshell, one
    // on the outer-radius velocity arrow — and the belt-drive/strobe arithmetic
    // moves into content(), where it belongs. The rest are the card's own
    // numerals, which are typography inside a drawing, not annotation.
    const L = ctx.labels;

    L.add(S.headA, {
      kicker: `45/45 GROOVE · ${MAG} : 1`,
      text: 'solid = left wall &middot; dashed = right',
      value: `${(GROOVE_D * 1e6).toFixed(0)} µm deep · tip clears by ${(TIP_CLEAR * 1e6).toFixed(1)} µm · 1 : ${TIME_RATIO}`,
      occlude: false, priority: 4, offset: [0, 24],
    });
    // The dimension chain's numerals. 60 + 69 = 129.
    L.add(S.aWidth, {
      value: `${(GROOVE_W * 1e6).toFixed(0)} µm`,
      cls: 'plain', occlude: false, offset: [0, -13], priority: 3,
    });
    L.add(S.aLand, {
      value: `${(LAND * 1e6).toFixed(0)} µm`,
      cls: 'plain', occlude: false, offset: [0, -13], priority: 3,
    });
    L.add(S.aPitch, {
      value: `${(PITCH * 1e6).toFixed(0)} µm`,
      cls: 'plain', occlude: false, offset: [0, -13], priority: 3,
    });
    L.add(S.aAngle, {
      value: '90°',
      cls: 'plain', occlude: false, offset: [0, -11], priority: 3,
    });

    S.labEmf = L.add(arm.userData.head, {
      kicker: 'MOVING COIL · e = Bl · v',
      text: 'tip u = +0.00 µm · w = +0.00 µm',
      value: `0 µV of ${(E_PK * 1e6).toFixed(0)} µV pk (${(E_RMS * 1e6).toFixed(0)} µV rms)`,
      // Above the headshell, over the dark cabinet, and well clear of the
      // panel's left edge: at [168, −96] the value line was being clipped by it.
      cls: 'acc lead', offset: [44, -180], priority: 3,
    });

    // The belt-drive callout is gone; its one durable number rides here, on the
    // label that is already pointing at the rim it is printed on.
    L.add(S.anchorOut, {
      kicker: 'GROOVE VELOCITY',
      text: `rim strobe: ${STROBE_BARS} = 120 × ${MAINS.f} / 33⅓`,
      value: `${V_OUT.toFixed(3)} → ${V_IN.toFixed(3)} m/s · ${(R_OUT * 1000).toFixed(0)} → ${(R_IN * 1000).toFixed(0)} mm`,
      cls: 'acc lead', offset: [-58, 112], priority: 2,
    });

    return { hardware: hw, overlay: ov };
  },

  update(dt, t, ctx) {
    // platter: real time, and it must keep turning in the wide shot
    S.platter.rotation.y -= OMEGA * dt;
    S.r = Math.max(R_IN, S.r - R_DOT * dt);
    S.arm.rotation.y = armAngle(S.r);

    if (ctx.stage.reveal < 0.01) return;

    // groove modulation, slowed 1 : 1000 (timeScale is 1, so the platter runs
    // at true speed and only the magnified cross-section is slowed)
    const ph = (TAU * F_SIG * t) / TIME_RATIO;
    S.phase = ph;
    const sL = A_L * Math.sin(ph);
    const sR = A_R * Math.sin(ph + R_PHASE);
    const vL = V_L_PK * Math.cos(ph);
    const vR = V_R_PK * Math.cos(ph + R_PHASE);
    const [u, w] = tipFromWalls(sL, sR);

    S.grooveWrite(u, w);
    S.stylusAt(u, w);
    S.locusWrite(ph);
    S.liveCircleWrite(S.r);
    // Nothing numeric is written here on purpose — see latch().
  },

  /**
   * ROUND 4 BLOCKER: this ran to 380 words and the still frame cut it at
   * "482 MPa", losing both of the chapter's best arguments — the traceability
   * collapse and the whole myth block. It is now 225 words with the callouts
   * first, because the tail is what gets cut. The 45/45 geometry that the
   * deleted equation block carried is on the card, dimensioned and to scale.
   */
  content() {
    return `
<div class="key"><span class="lab">The idea</span>
<p>The cartridge does not measure where the wall is. It measures how fast the
wall is moving.</p></div>

<div class="myth"><span class="lab">Commonly got wrong</span>
<p>Nothing races down the wire at the speed of the music. At
<span class="num">${(I_PK * 1e6).toFixed(2)} µA</span> peak in
<span class="num">${WIRE_MM2.toFixed(3)} mm²</span> of litz the carriers drift at
<span class="num">${(V_DRIFT * 1e9).toFixed(2)} nm/s</span> and shuffle
<span class="num">±${(X_DRIFT * 1e12).toFixed(2)} pm</span> at 1 kHz — 1/${CU_RATIO.toFixed(0)}
of the <span class="num">255.6 pm</span> between copper atoms. The field arrives
at <span class="num">${(V_FIELD / 1e8).toFixed(2)} × 10⁸ m/s</span>. It is a loop:
out on one conductor, back on the other.</p></div>

<h3>The generator</h3>
<div class="eq">e = Bl·v̂ = <span class="hl">${(BL * 1e3).toFixed(2)} mV·s/m</span> × ${V_REF.toFixed(4)} m/s pk
  = ${(E_PK * 1e6).toFixed(0)} µV pk = ${(E_RMS * 1e6).toFixed(0)} µV rms  <span class="c">1 kHz</span></div>
<p>${N_TURNS} turns of <span class="num">${(L_TURN * 1e3).toFixed(2)} mm</span> in a
<span class="num">${B_GAP} T</span> gap, on two patches
<span class="num">${(2 * A_HZ * 1e6).toFixed(1)} µm</span> across:
<span class="num">${(VTF_N * 1e3).toFixed(1)} mN</span> is
<span class="num">${(P_MEAN / 1e6).toFixed(0)} MPa</span> mean,
<span class="num">${(P_PEAK / 1e6).toFixed(0)}</span> peak.</p>

<p><b>The last track is the worst.</b> Velocity falls
<span class="num">${V_OUT.toFixed(3)}</span> →
<span class="num">${V_IN.toFixed(3)} m/s</span>, so 10 kHz shrinks
<span class="num">${(lambdaAt(R_OUT) * 1e6).toFixed(0)}</span> →
<span class="num">${(lambdaAt(R_IN) * 1e6).toFixed(0)} µm</span>. A
<span class="num">${(TIP_R_V * 1e6).toFixed(0)} µm</span> tip holds a wall only
while λ²/4π²A exceeds it, so traceable velocity collapses
<span class="num">${(vMaxAt(R_OUT) * 100).toFixed(0)}</span> →
<span class="num">${(vMaxAt(R_IN) * 100).toFixed(0)} cm/s</span>, as
(146/60)² = <span class="num">${((R_OUT / R_IN) ** 2).toFixed(2)}</span>.</p>`;
  },

  readouts() {
    const d = latch();
    const e = Math.abs(d.e);
    const err = (d.err * 180) / Math.PI;
    return [
      { k: 'PLATTER', v: RPM.toFixed(2), u: 'rpm' },
      { k: 'GROOVE V', v: d.v.toFixed(3), u: 'm/s', cls: 'acc', bar: d.v / V_OUT },
      { k: 'TRACK ERR', v: (err >= 0 ? '+' : '') + err.toFixed(2), u: '°', bar: Math.abs(err) / 1.79 },
      { k: 'TIP |V|', v: (d.tip * 100).toFixed(2), u: 'cm/s', cls: 'acc', bar: d.tip / 0.06 },
      { k: 'EMF L', v: (e * 1e6).toFixed(0), u: 'µV', cls: 'acc', bar: e / E_PK },
      { k: 'TRACEABLE', v: (d.vmax * 100).toFixed(0), u: 'cm/s', cls: 'am', bar: d.vmax / vMaxAt(R_OUT) },
    ];
  },
};
