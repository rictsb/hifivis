import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { MAINS, AMP, SPEAKER, CABLE } from '../core/spec.js';

/* ===========================================================================
   MAINS & CONDITIONING
   ---------------------------------------------------------------------------
   Primaries come from src/core/spec.js and are never re-declared here. Anything
   this stage needs that spec.js does not carry is derived below from what it
   does, and the derivation is written down.
   =========================================================================== */

const TAU = DSP.TAU;

// ---- supply -----------------------------------------------------------------
// The operating point is the one the whole piece runs: BOTH monoblocks at full
// output into the 8 Ω load that is actually connected (AMP.pOut8), class AB at
// AMP.effAB wall-plug efficiency. Quoting the 4 Ω rating for a mains draw while
// running an 8 Ω load doubles the answer and is the classic cheat.
const F_MAINS = MAINS.f;                             // 50 Hz
const V_RMS = MAINS.vRms;                            // 230 V
const V_PK = MAINS.vPk;                              // 325.27 V
// LOCAL CHOICE, not a spec primary: everything upstream of the power amps —
// turntable, phono, streamer, DAC, preamp, crossover and this conditioner —
// budgeted at 100 W total.
const P_FRONT = 100;
const P_SYS = (2 * AMP.pOut8) / AMP.effAB + P_FRONT; // 1190.9 W
const I_RMS = P_SYS / V_RMS;                         // 5.1779 A rms
const I_PK = I_RMS * Math.SQRT2;                     // 7.3227 A
const VA = V_RMS * I_RMS;                            // 1190.9 VA

// ---- copper -----------------------------------------------------------------
const RHO_CU = CABLE.rhoCu;                          // 1.724e-8 Ω·m at 20 °C
const SIGMA_CU = 1 / RHO_CU;                         // 5.8005e7 S/m

// ---- the lead: 3 × 2.5 mm² H05VV-F, cores laid up on a filler ---------------
const A_MM2 = MAINS.cableAreaMm2;                    // 2.5 mm²
const R_COND = Math.sqrt(A_MM2 / Math.PI) * 1e-3;    // 8.9206e-4 m
const D_COND = 2 * R_COND;                           // 1.7841 mm
const T_INS = 0.80e-3;                               // m, insulation wall
const R_INS_R = R_COND + T_INS;                      // 1.6921 mm
const PITCH_CORE = 3.90e-3;                          // m, lay-up triangle side
const T_SHEATH = 1.60e-3;                            // m, filler + sheath
const LEAD_OD = 2 * (PITCH_CORE / Math.sqrt(3) + R_INS_R + T_SHEATH); // 11.09 mm

// ---- carriers ---------------------------------------------------------------
const V_DRIFT_PK = DSP.driftVelocity(I_PK, A_MM2);   // 2.1525e-4 m/s
const X_DRIFT_PK = DSP.driftDisplacement(V_DRIFT_PK, F_MAINS); // 6.8517e-7 m

// Sommerfeld free-electron gas in copper. The classical equipartition figure
// √(3kT/m) = 1.15e5 m/s is in most textbooks and is wrong for a metal: the gas
// is degenerate, so the relevant speed is the Fermi velocity.
const HBAR = 1.054571817e-34;                        // J·s
const M_E = 9.1093837015e-31;                        // kg
const K_F = Math.cbrt(3 * Math.PI * Math.PI * DSP.N_CU);   // 1.3596e10 m⁻¹
const V_FERMI = (HBAR * K_F) / M_E;                  // 1.5739e6 m/s  (E_F = 7.05 eV)
const TAU_COLL = (M_E * SIGMA_CU) / (DSP.N_CU * DSP.E_CHARGE ** 2); // 2.423e-14 s
const MFP = V_FERMI * TAU_COLL;                      // 3.814e-8 m  (38 nm)
const D_DIFF = (V_FERMI * MFP) / 3;                  // 0.0200 m²/s
const X_THERMAL = Math.sqrt((2 * D_DIFF) / F_MAINS); // 0.0283 m rms in one period

// ---- field ------------------------------------------------------------------
const V_FIELD = MAINS.vField;                        // 1.9786e8 m/s  (0.66 c)
const SPEED_RATIO = V_FIELD / V_DRIFT_PK;            // 9.19e11
const LAMBDA_MAINS = V_FIELD / F_MAINS;              // 3.957e6 m  (3957 km)

// ---- drawing scales — every one of these is printed on screen ---------------
const MAG = 7;                                       // ×, the copper and its jacket
const MAG_DRIFT = 21000;                             // ×, carrier displacement only
const MAG_EXTRA = MAG_DRIFT / MAG;                   // ×3000 on the copper's own scale
const FIELD_SLOW = 4.5e7;                            // field clock ÷ this, vs sim time
const TIME_SCALE = 0.02;                             // sim s per real s → 1 : 50
const FIELD_TOTAL_SLOW = FIELD_SLOW / TIME_SCALE;    // 1 : 2.25×10⁹ vs real time

// What the eye actually reads, in card metres per REAL second. Both
// exaggerations collapse into these two numbers, so their ratio is quotable.
const SEEN_DRIFT = V_DRIFT_PK * MAG_DRIFT * TIME_SCALE;          // 0.0904 m/s
const SEEN_FIELD = (V_FIELD * MAG * TIME_SCALE) / FIELD_SLOW;    // 0.6155 m/s
const SEEN_RATIO = SEEN_FIELD / SEEN_DRIFT;                      // ×6.8

const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUPS[c] || c).join('');
function sci(v, d = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(d)}×10${sup(e)}`;
}
const SWEEP = 0.82;      // half sweep of both meter pointers, radians
const CYS = '#5cc0f2', AMS = '#f0b35a', RDS = '#f2795c';

// ---------------------------------------------------------------------------
// small local helpers
// ---------------------------------------------------------------------------

/** Seed fadeTree's opacity bookkeeping so cards and dimensions survive fading. */
function preFade(root, op) {
  root.traverse((c) => {
    if ((c.isMesh || c.isSprite || c.isLine || c.isPoints) && c.userData._baseOp === undefined) {
      c.userData._baseOp = op !== undefined ? op : (c.material?.opacity ?? 1);
    }
  });
  return root;
}

function card(w, h, opacity = 1.0) {
  const g = DIAG.diagramCard(w, h, { opacity, pad: 0.018 });
  g.userData.plate.userData._baseOp = opacity;
  return g;
}

function poly(pts, color, width = 1.4, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => pts[i]);
  return t;
}

/** Flat arrowhead in the card plane, pointing along +X. */
function arrowHead(size, color, op = 1) {
  const s = new THREE.Shape();
  s.moveTo(size, 0); s.lineTo(-size * 0.60, size * 0.54); s.lineTo(-size * 0.60, -size * 0.54); s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({
    color, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.renderOrder = 15;
  m.userData._baseOp = op;
  return m;
}

let _bandTex = null;
function bandTexture() {
  if (_bandTex) return _bandTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 4;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.46, 'rgba(255,255,255,0.20)');
  grd.addColorStop(0.80, 'rgba(255,255,255,1)');
  grd.addColorStop(0.91, 'rgba(255,255,255,0.42)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 4);
  _bandTex = new THREE.CanvasTexture(c);
  _bandTex.colorSpace = THREE.SRGBColorSpace;
  return _bandTex;
}

function bandPlane(w, h, color, op) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    map: bandTexture(), color, transparent: true, opacity: op, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  }));
  m.renderOrder = 16;
  m.userData._baseOp = op;
  return m;
}

/**
 * Backlight for a meter face. A single flat emissive value is what makes a
 * lit meter read as a decal: a real one is lit by a lamp behind the bottom
 * edge, so it is brightest along the bottom centre and falls into the corners.
 */
let _blTex = null;
function backlightTex() {
  if (_blTex) return _blTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 72;
  const g = c.getContext('2d');
  // NB the canvas is sampled with v inverted, so canvas y = 0 lands at the
  // BOTTOM of the face — which is where the lamp is.
  g.fillStyle = '#2f7ba3'; g.fillRect(0, 0, 128, 72);
  const grd = g.createRadialGradient(64, -4, 4, 64, 12, 104);
  grd.addColorStop(0.00, '#d3ecfc');
  grd.addColorStop(0.24, '#98cfef');
  grd.addColorStop(0.60, '#4693c0');
  grd.addColorStop(1.00, '#1b4d68');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 72);
  const v = g.createLinearGradient(0, 0, 0, 72);
  v.addColorStop(0.00, 'rgba(4,18,28,0.10)');
  v.addColorStop(0.52, 'rgba(4,18,28,0.02)');
  v.addColorStop(1.00, 'rgba(4,18,28,0.46)');
  g.fillStyle = v; g.fillRect(0, 0, 128, 72);
  _blTex = new THREE.CanvasTexture(c);
  _blTex.colorSpace = THREE.SRGBColorSpace;
  return _blTex;
}

/**
 * A shallow convex panel. Used for the meter lens: a flat plane returns one
 * mirror image of a studio source and clips; a slight bulge sweeps that image
 * across the panel as a soft band, which is what a real cover glass does.
 */
function convexPanel(w, h, bulge, su = 28, sv = 10) {
  const g = new THREE.PlaneGeometry(w, h, su, sv);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getY(i) / (h / 2);
    p.setZ(i, bulge * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * A pure specular layer: a black dielectric with a clearcoat, blended
 * additively, so ONLY its reflection of the room is added over whatever is
 * underneath. Emissive meters and displays read as decals without one.
 */
function specularLayer(M, rough = 0.055, strength = 0.85, envI = 1.15) {
  const m = M.glass.clone();
  m.color.setHex(0x000000);
  m.roughness = rough;
  m.clearcoat = 1.0;
  m.clearcoatRoughness = 0.02;
  m.envMapIntensity = envI;
  m.transparent = true;
  m.opacity = strength;
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending;
  m.toneMapped = true;
  return m;
}

// ===========================================================================
// HARDWARE — the conditioner, rack bay 0
// ===========================================================================

const CW = LAYOUT.rack.w - 0.03;     // 0.555
const CD = LAYOUT.rack.d - 0.06;     // 0.440
const CHt = 0.115;                   // total height incl. feet (bay 0 max 0.150)
const FT = 0.016;                    // fascia thickness
const TOPT = 0.006;                  // top plate thickness
const FOOT = 0.010;

function ventedTop(w, d, holes) {
  const s = new THREE.Shape();
  const r = 0.005, hw = w / 2, hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd); s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - r); s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hd); s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + r); s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  for (const [cx, cy, ww, hh] of holes) {
    const p = new THREE.Path();
    const rr = 0.004, a = ww / 2, b = hh / 2;
    p.moveTo(cx - a + rr, cy - b);
    p.lineTo(cx + a - rr, cy - b); p.absarc(cx + a - rr, cy - b + rr, rr, -Math.PI / 2, 0, false);
    p.lineTo(cx + a, cy + b - rr); p.absarc(cx + a - rr, cy + b - rr, rr, 0, Math.PI / 2, false);
    p.lineTo(cx - a + rr, cy + b); p.absarc(cx - a + rr, cy + b - rr, rr, Math.PI / 2, Math.PI, false);
    p.lineTo(cx - a, cy - b + rr); p.absarc(cx - a + rr, cy - b + rr, rr, Math.PI, Math.PI * 1.5, false);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: TOPT, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2, curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * One centre-zero moving-coil meter: backlit face, dark PRINTED scale (a
 * glowing scale reads as a screen, an ink one reads as an instrument), an
 * ivory pointer on a pivot hidden below the window, and an amber sector at
 * each end of the sweep. Returns the pointer pivot for update().
 */
function meterUnit(M, w, h) {
  const grp = new THREE.Group();

  // the map carries both the hue and the falloff, so the material's own colour
  // is a plain level control and the face can never go flat
  const faceMat = M.meterGlow.clone();
  faceMat.map = backlightTex();
  faceMat.color.setRGB(0.92, 0.92, 0.92);
  faceMat.needsUpdate = true;      // adding a map to a mapless material recompiles
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  grp.add(face);
  // a printed inner frame: without it the bright face meets the dark bezel on a
  // near-horizontal edge and the raster stair-steps along it
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x0a1218, toneMapped: false });
  for (const [fw, fh, fx, fy] of [[w, 0.0016, 0, h / 2 - 0.0008], [w, 0.0016, 0, -h / 2 + 0.0008],
    [0.0016, h, -w / 2 + 0.0008, 0], [0.0016, h, w / 2 - 0.0008, 0]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), frameMat);
    b.position.set(fx, fy, 0.0002);
    grp.add(b);
  }

  const ink = new THREE.MeshBasicMaterial({ color: 0x081419, toneMapped: false });
  const amb = new THREE.MeshBasicMaterial({ color: 0x9a6a1e, toneMapped: false });

  const pivotY = -h / 2 + 0.0015;                   // inside the window: a
  const R = h * 0.89;                               // pointer hanging out below
  const A = SWEEP;                                  // the glass is a giveaway

  const arc = new THREE.Mesh(new THREE.RingGeometry(R - 0.00055, R + 0.00055, 72, 1, Math.PI / 2 - A, 2 * A), ink);
  arc.position.set(0, pivotY, 0.0003);
  grp.add(arc);
  for (const s of [-1, 1]) {
    const seg = new THREE.Mesh(new THREE.RingGeometry(R - 0.0035, R - 0.0014, 18, 1,
      s > 0 ? Math.PI / 2 - A : Math.PI / 2 + A - 0.15, 0.15), amb);
    seg.position.set(0, pivotY, 0.0003);
    grp.add(seg);
  }

  const NT = 17;
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(1, 1, 1);
  const minor = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.00075, 0.0042), ink, NT);
  const major = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.00120, 0.0082), ink, 5);
  let mi = 0;
  for (let i = 0; i < NT; i++) {
    const a = -A + (2 * A * i) / (NT - 1);
    const big = i % 4 === 0;
    const r = R - (big ? 0.0041 : 0.0021);
    qq.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    mtx.compose(new THREE.Vector3(Math.sin(a) * r, pivotY + Math.cos(a) * r, 0.0004), qq, ss);
    if (big) { major.setMatrixAt(mi++, mtx); minor.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
    else minor.setMatrixAt(i, mtx);
  }
  for (; mi < 5; mi++) major.setMatrixAt(mi, new THREE.Matrix4().makeScale(0, 0, 0));
  grp.add(minor, major);

  const needleMat = new THREE.MeshBasicMaterial({ color: 0xd8d3c3, toneMapped: false });
  const pivot = new THREE.Group();
  pivot.position.set(0, pivotY, 0.0009);
  const nLen = R - 0.0075;
  const n = new THREE.Mesh(new THREE.PlaneGeometry(0.0010, nLen), needleMat);
  n.position.y = nLen / 2 + 0.0025;
  pivot.add(n);
  grp.add(pivot);
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), new THREE.MeshBasicMaterial({
    color: 0x1a2730, toneMapped: false,
  }));
  hub.position.set(0, pivotY, 0.0011);
  grp.add(hub);

  grp.userData.pivot = pivot;
  grp.userData.sweep = A;
  return grp;
}

function toroid(M) {
  const g = new THREE.Group();
  const R = 0.070, r = 0.026;
  const wind = new THREE.Mesh(new THREE.TorusGeometry(R, r, 16, 64), M.magnetWire);
  wind.rotation.x = -Math.PI / 2;
  wind.castShadow = wind.receiveShadow = true;
  g.add(wind);
  const sec = new THREE.Mesh(new THREE.TorusGeometry(R, r * 1.06, 10, 56), M.copper);
  sec.rotation.x = -Math.PI / 2;
  sec.scale.set(1, 1, 0.42);
  g.add(sec);
  const dish = new THREE.Mesh(GEO.bevelCyl(0.036, 0.040, 0.007, 36, 0.0008), M.steel);
  dish.position.y = r * 0.62;
  dish.castShadow = true;
  g.add(dish);
  const bolt = new THREE.Mesh(GEO.bevelCyl(0.0075, 0.0075, 0.012, 18, 0.0006), M.steel);
  bolt.position.y = r * 0.62 + 0.008;
  g.add(bolt);
  const base = new THREE.Mesh(GEO.bevelCyl(0.050, 0.050, 0.004, 36, 0.0008), M.anodGrey);
  base.position.y = -r * 0.72;
  g.add(base);
  return g;
}

function buildConditioner() {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(0, CHt), LAYOUT.rack.z);

  const bodyH = CHt - FOOT;
  const yBody = -CHt / 2 + FOOT + bodyH / 2;
  const yTopFace = CHt / 2;

  const tub = new THREE.Mesh(GEO.bevelBox(CW, bodyH - TOPT, CD - FT, 0.0026, 4), M.anodBlack);
  tub.position.set(0, yBody - TOPT / 2, -FT / 2);
  tub.castShadow = tub.receiveShadow = true;
  g.add(tub);

  const holeA = [-0.095, -0.020, 0.185, 0.185];
  const holeB = [0.135, -0.020, 0.105, 0.150];
  const top = new THREE.Mesh(ventedTop(CW, CD - FT, [holeA, holeB]), M.anodBlack);
  top.position.set(0, yTopFace - TOPT, -FT / 2);
  top.castShadow = top.receiveShadow = true;
  g.add(top);

  for (const [cx, cz, w, d] of [holeA, holeB]) {
    const n = Math.max(4, Math.round(d / 0.026));
    for (let i = 0; i < n; i++) {
      const z = cz - d / 2 + (d / n) * (i + 0.5);
      const s = new THREE.Mesh(GEO.bevelBox(w - 0.004, 0.0035, 0.0055, 0.0008, 2), M.anodGrey);
      s.position.set(cx, yTopFace - TOPT / 2, z - FT / 2);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
    }
  }

  // brushed inlay along the top front edge — catches the key light and gives the
  // lid a second material, which is most of what stops it reading as a slab
  const inlay = new THREE.Mesh(GEO.bevelBox(CW - 0.09, 0.0022, 0.030, 0.0007, 2), M.aluV);
  inlay.position.set(0, yTopFace - TOPT + 0.0006, CD / 2 - FT - 0.030);
  inlay.castShadow = inlay.receiveShadow = true;
  g.add(inlay);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const s = GEO.screw(0.0014);
      s.rotation.x = 0;                              // lid screws face +Y
      s.position.set(sx * (CW / 2 - 0.014), yTopFace - TOPT + 0.0012, -0.140 + i * 0.088 - FT / 2);
      g.add(s);
    }
  }

  const tor = toroid(M);
  tor.position.set(holeA[0], yBody - 0.012, holeA[1] - FT / 2);
  g.add(tor);

  for (let i = 0; i < 2; i++) {
    const can = new THREE.Mesh(GEO.bevelCyl(0.019, 0.020, 0.052, 28, 0.0012), M.alu);
    can.position.set(holeB[0] - 0.024 + i * 0.048, yBody - 0.004, holeB[1] - FT / 2 + (i ? -0.030 : 0.030));
    can.castShadow = true;
    g.add(can);
    const cap = new THREE.Mesh(GEO.bevelCyl(0.017, 0.017, 0.002, 20, 0.0004), M.plastic);
    cap.position.set(can.position.x, can.position.y + 0.027, can.position.z);
    g.add(cap);
  }
  const board = new THREE.Mesh(GEO.bevelBox(0.30, 0.0018, 0.20, 0.0006, 2), M.pcb);
  board.position.set(0.06, yBody - 0.036, -0.02 - FT / 2);
  board.receiveShadow = true;
  g.add(board);

  // ---- fascia --------------------------------------------------------------
  const zF = CD / 2;
  const face = new THREE.Mesh(GEO.bevelBox(CW, CHt, FT, 0.0030, 5), M.alu);
  face.position.set(0, 0, zF - FT / 2);
  face.castShadow = face.receiveShadow = true;
  g.add(face);

  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(GEO.bevelBox(0.058, CHt - 0.004, 0.011, 0.0022, 4), M.aluV);
    cheek.position.set(sx * (CW / 2 - 0.033), 0, zF + 0.005);
    cheek.castShadow = cheek.receiveShadow = true;
    g.add(cheek);
    GEO.screwRow(g, [[sx * (CW / 2 - 0.033), 0.036], [sx * (CW / 2 - 0.033), -0.036]], zF + 0.0108, 0.0019);
  }

  // The recessed centre panel is lacquered, not bead-blasted: it carries a
  // clearcoat ramp of the front strip instead of one flat value.
  const inset = new THREE.Mesh(GEO.bevelBox(0.418, CHt - 0.020, 0.004, 0.0012, 3), M.pianoBlack);
  inset.position.set(0, 0, zF - 0.0012);
  inset.receiveShadow = true;
  g.add(inset);
  // A LACQUERED PANEL IS NOT ONE FLAT VALUE. A shallow crown over the whole
  // fascia sweeps the front strip across it as a broad soft band instead of
  // returning one dead grey.
  const lacquer = new THREE.Mesh(convexPanel(0.414, CHt - 0.024, 0.0026, 30, 8),
    specularLayer(M, 0.115, 0.60, 1.5));
  lacquer.position.set(0, 0, zF + 0.0012);
  lacquer.renderOrder = 4;
  g.add(lacquer);

  // TWO centre-zero meters, not one 4:1 letterbox: a pointer instrument's
  // sweep is bounded by its own radius, so a very wide window can only ever be
  // a stripe with the scale huddled in the middle.
  const mw = 0.212, mh = 0.050, myC = 0.006;
  const bez = new THREE.Mesh(GEO.bevelBox(mw + 0.016, mh + 0.014, 0.006, 0.0014, 3), M.anodGrey);
  bez.position.set(0.052, myC, zF + 0.0010);
  bez.castShadow = true;
  g.add(bez);
  const uw = 0.0985, uh = 0.0455;
  const needles = [];
  for (const dx of [-0.0535, 0.0535]) {
    const u = meterUnit(M, uw, uh);
    u.position.set(0.052 + dx, myC, zF + 0.0044);
    g.add(u);
    needles.push(u.userData.pivot);
  }
  // the divider between the two windows — behind the glass, not in front of it
  const div = new THREE.Mesh(GEO.bevelBox(0.0058, mh + 0.002, 0.0034, 0.0010, 3), M.anodBlack);
  div.position.set(0.052, myC, zF + 0.0039);
  div.castShadow = true;
  g.add(div);

  // THE SPECULAR LAYER over the meters: a slightly convex cover glass whose
  // only contribution is a reflection of the room, added over the emissive
  // behind it. Without it a lit meter is a decal, not something under glass.
  const cover = new THREE.Mesh(convexPanel(mw + 0.002, mh + 0.002, 0.0052), specularLayer(M, 0.085, 0.80, 2.1));
  cover.position.set(0.052, myC, zF + 0.0060);
  cover.renderOrder = 7;
  g.add(cover);
  // a faint smoked tint under it, so the glass has a body of its own
  const tint = new THREE.Mesh(convexPanel(mw + 0.002, mh + 0.002, 0.0052, 12, 6), new THREE.MeshBasicMaterial({
    color: 0x070c11, transparent: true, opacity: 0.20, depthWrite: false, toneMapped: false,
  }));
  tint.position.set(0.052, myC, zF + 0.0058);
  tint.renderOrder = 6;
  g.add(tint);

  const kb = GEO.knob(0.0195, 0.015, { flutes: 56 });
  kb.rotation.x = Math.PI / 2;
  kb.position.set(-0.168, 0.004, zF + 0.0055);
  GEO.shadowed(kb);
  g.add(kb);
  // the halo is a thin ring, not a blob: keep it under the bloom threshold and
  // let the ring's shape do the work
  const ringM = M.ledCyan.clone();
  ringM.color.multiplyScalar(0.78);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.0228, 0.0243, 60), ringM);
  halo.position.set(-0.168, 0.004, zF + 0.0016);
  g.add(halo);

  // one indicator per rear outlet, in the same 4 x 2 grid: detail that means
  // something is worth more than detail that is decoration
  const ledCols = [M.ledCyan, M.ledCyan, M.ledGreen, M.ledCyan, M.ledCyan, M.ledAmber, M.ledCyan, M.ledGreen];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c;
      const lm = ledCols[i].clone();
      lm.color.multiplyScalar(0.95);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.0014, 12), lm);
      l.position.set(-0.128 + c * 0.0125, -0.030 - r * 0.0125, zF + 0.0016);
      g.add(l);
      const bore = new THREE.Mesh(new THREE.RingGeometry(0.0016, 0.0026, 18), M.anodGrey);
      bore.position.set(l.position.x, l.position.y, zF + 0.0013);
      g.add(bore);
    }
  }
  GEO.screwRow(g, [[-0.238, 0.046], [0.238, 0.046], [-0.238, -0.046], [0.238, -0.046]], zF + 0.0018, 0.0016);

  // ---- rear panel ----------------------------------------------------------
  const zR = -CD / 2;
  const rearPlate = new THREE.Mesh(GEO.bevelBox(CW - 0.03, CHt - 0.018, 0.003, 0.001, 2), M.anodGrey);
  rearPlate.position.set(0, 0, zR + 0.0016);
  g.add(rearPlate);

  const inlet = GEO.iecInlet();
  inlet.rotation.y = Math.PI;
  inlet.position.set(0.207, 0.014, zR + 0.0005);
  GEO.shadowed(inlet);
  g.add(inlet);

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const o = GEO.iecInlet();
      o.rotation.y = Math.PI;
      o.scale.setScalar(0.92);
      o.position.set(-0.222 + c * 0.070, 0.026 - r * 0.036, zR + 0.0005);
      g.add(o);
    }
  }
  const post = GEO.bindingPost({ colour: 0x5f9e70 });
  post.rotation.y = Math.PI;
  post.position.set(0.150, -0.030, zR);
  g.add(post);

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.016, 0.019, FOOT, 24, 0.0012), M.steel);
    f.position.set(sx * (CW / 2 - 0.052), -CHt / 2 + FOOT / 2, sz * (CD / 2 - 0.062));
    f.castShadow = true;
    g.add(f);
  }
  const sh = GEO.contactShadow(CW * 1.5, CD * 1.5, 0.7, -CHt / 2 + 0.0008);
  g.add(sh);

  g.userData.needles = needles;
  return g;
}

// ===========================================================================
// HARDWARE — the mains lead
// ===========================================================================
// Out of the IEC inlet, down the rack's right rear corner, then back along the
// floor to a wall plate. The route is drawn to the spec length rather than
// asserted: MAINS.cableLen is 2.00 m and the CatmullRom through these points
// measures 1.9967 m, which is the figure the arithmetic uses.

const LEAD_PTS = [
  [0.207, 0.1725, -3.522], [0.222, 0.1670, -3.575], [0.258, 0.1420, -3.625],
  [0.310, 0.0980, -3.662], [0.352, 0.0520, -3.678], [0.376, 0.0230, -3.672],
  [0.392, 0.0180, -3.700], [0.406, 0.0180, -3.790], [0.414, 0.0180, -3.906],
  [0.424, 0.0180, -4.070], [0.446, 0.0180, -4.292], [0.482, 0.0180, -4.552],
  [0.524, 0.0180, -4.832], [0.558, 0.0180, -5.100], [0.578, 0.0290, -5.268],
  [0.584, 0.0560, -5.342],
];

const LEAD_CURVE = new THREE.CatmullRomCurve3(LEAD_PTS.map((p) => new THREE.Vector3(...p)));
const L_LEAD = MAINS.cableLen;                       // 2.00 m, wall to conditioner
const R_LOOP = (RHO_CU * 2 * L_LEAD) / (A_MM2 * 1e-6); // 27.58 mΩ, out AND back
const V_DROP = I_RMS * R_LOOP;                       // 0.143 V
const P_LOSS = I_RMS * I_RMS * R_LOOP;               // 0.740 W

function buildLead() {
  const M = mats();
  const g = new THREE.Group();
  const curve = LEAD_CURVE;
  const jacket = M.rubber.clone();
  jacket.color.setHex(0x191b1f);
  jacket.roughness = 0.62;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 260, LEAD_OD / 2, 14, false), jacket);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);

  const body = new THREE.Mesh(GEO.bevelBox(0.030, 0.023, 0.040, 0.0025, 4), M.plastic);
  body.position.set(0.207, 0.1725, -3.542);
  body.castShadow = true;
  g.add(body);
  const collar = new THREE.Mesh(GEO.bevelBox(0.034, 0.027, 0.006, 0.0015, 3), M.anodGrey);
  collar.position.set(0.207, 0.1725, -3.524);
  g.add(collar);

  // a moulded strain relief and a cable clip: small parts sell the scale
  for (const t of [0.075, 0.34]) {
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const fr = new THREE.Mesh(GEO.bevelCyl(0.0072, 0.0072, 0.011, 18, 0.0008), M.anodGrey);
    fr.position.copy(p);
    fr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    fr.castShadow = true;
    g.add(fr);
  }

  // the wall plate the lead actually ends in — a cable that stops in mid-air
  // is the first thing that reads as unfinished
  const plate = new THREE.Mesh(GEO.bevelBox(0.086, 0.086, 0.010, 0.0022, 4), M.anodGrey);
  plate.position.set(0.584, 0.070, -5.372);
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  for (const sy of [0.030, -0.030]) {
    const s = GEO.screw(0.0018);
    s.rotation.x = Math.PI / 2;
    s.position.set(0.584, 0.070 + sy, -5.366);
    g.add(s);
  }

  // the floor run gets its own contact shadow, or it floats
  const sh = GEO.contactShadow(0.28, 1.70, 0.5, 0.0010);
  sh.position.set(0.470, 0, -4.42);
  g.add(sh);

  // Instantaneous power p(t) = VI(1 − cos 2ωt): real, 100 Hz, never negative.
  const sheathMat = new THREE.MeshBasicMaterial({
    color: PAL.am, transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.BackSide,
  });
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, LEAD_OD * 1.25, 10, false), sheathMat);
  sheath.renderOrder = 12;
  g.add(sheath);

  g.userData.curve = curve;
  g.userData.sheath = sheathMat;
  return g;
}

// ===========================================================================
// THE SHOT — hero the conditioner, and derive the card's place from the camera
// ===========================================================================
// Bay 0's centre is y = 0.1725. The subject is a 555 × 115 mm chassis, so the
// framing radius is its HALF-HEIGHT plus a margin, not its bounding sphere —
// a bounding sphere is dominated by the width and shrinks the chassis to a
// sliver. Target is lifted to 0.30 so the chassis sits low and the card has the
// upper right; at 1600 × 1000 the silhouette measures x 203…1047, inside the
// safe box.
const TGT = [0, 0.270, -3.30];
const SHOT = frameShot(TGT, 0.119, { fill: 0.405, az: 0.19, el: 0.16, fov: 30 });

const _camP = new THREE.Vector3(...SHOT.position);
const _fwd = new THREE.Vector3(...SHOT.target).sub(_camP).normalize();
const _right = new THREE.Vector3().crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize();
const _up = new THREE.Vector3().crossVectors(_right, _fwd).normalize();

// Card placement is expressed in the camera's own frame, because "beside the
// hero" is a screen-space statement and world coordinates cannot express it.
// depth 0.98 m puts the card 0.08 m in front of the rack's nearest post.
const CARD_D = 0.95;
const CARD_K = 0.90;                       // uniform scale of the whole card
const CARD_POS = _camP.clone()
  .addScaledVector(_fwd, CARD_D)
  .addScaledVector(_right, 0.0754)
  .addScaledVector(_up, 0.0906);

// ===========================================================================
// OVERLAY — one card: the lead in longitudinal section
// ===========================================================================

const A_W = 0.285, A_H = 0.215;
const XS = 0.022, XA0 = 0.052, XA1 = 0.176, XLD = 0.206;
const R_CU = R_COND * MAG;                        // 0.0062444
const R_INS = R_INS_R * MAG;                      // 0.0118444
const PITCH = PITCH_CORE * MAG;                   // 0.0273
const Y_L = 0.170, Y_N = Y_L - PITCH, Y_E = Y_L - 2 * PITCH;   // 0.170 / 0.1427 / 0.1154
const Z_CORE = 0.004;
const N_CARR = 20;

function buildCableCard() {
  const root = new THREE.Group();
  root.position.copy(CARD_POS);
  root.scale.setScalar(CARD_K);
  const g = new THREE.Group();
  g.position.set(-A_W / 2, -A_H / 2, 0);
  root.add(g);
  g.add(card(A_W, A_H, 1.0));

  const flat = (w, h, x, y, z, col, order, op = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      color: col, toneMapped: false, transparent: true, opacity: op, depthWrite: false,
    }));
    m.position.set(x, y, z);
    m.renderOrder = order;
    m.userData._baseOp = op;
    return m;
  };

  const len = XA1 - XA0;
  const xm = (XA0 + XA1) / 2;
  // The conductors are a diagram band, not a photograph of copper: amber at low
  // opacity with an amber hairline, so nothing on this card can out-shout the
  // lit hardware beside it.
  // NB these opacities are LINEAR and the buffer is written straight out, so a
  // 0.24 fill lands near 0.5 once encoded. 0.12 is what reads as a band.
  const cores = [
    { y: Y_L, sign: +1, col: PAL.am, fill: 0.13, edge: 0.80 },
    { y: Y_N, sign: -1, col: PAL.am, fill: 0.13, edge: 0.80 },
    { y: Y_E, sign: 0, col: PAL.gr, fill: 0.07, edge: 0.50 },
  ];

  for (const c of cores) {
    // the jacket: a lighter slab so each core reads as copper INSIDE insulation
    g.add(flat(len, 2 * R_INS, xm, c.y, Z_CORE - 0.0012, 0x1a222c, 5, 1));
    g.add(flat(len, 2 * R_CU, xm, c.y, Z_CORE, c.col, 7, c.fill));
    for (const dy of [R_CU, -R_CU]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], c.col, 1.2, { opacity: c.edge, renderOrder: 11 }));
    }
    for (const dy of [R_INS, -R_INS]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], 0x545c67, 0.9, { opacity: 0.55, renderOrder: 11 }));
    }
  }

  // ---- the closed loop, drawn unbroken ------------------------------------
  const ZL = Z_CORE + 0.004;
  const boxH = PITCH + 0.052;
  const yMid = (Y_L + Y_N) / 2;
  for (const [x, kind] of [[XS, 'socket'], [XLD, 'load']]) {
    const b = flat(0.034, boxH, x, yMid, Z_CORE - 0.002, 0x11161d, 6, 0.92);
    g.add(b);
    const hw = 0.017, hh = boxH / 2;
    g.add(poly([[x - hw, yMid - hh, ZL], [x + hw, yMid - hh, ZL], [x + hw, yMid + hh, ZL],
      [x - hw, yMid + hh, ZL], [x - hw, yMid - hh, ZL]], 0x4b545f, 1.0, { opacity: 0.85, renderOrder: 10 }));
    if (kind === 'socket') {
      // a mains outlet glyph: two live/neutral slots and an earth pin
      for (const dy of [0.013, -0.013]) {
        g.add(poly([[x - 0.008, yMid + dy, ZL], [x + 0.008, yMid + dy, ZL]], 0xc3ccd6, 3.4, { opacity: 0.9, renderOrder: 12 }));
      }
      g.add(poly([[x, yMid + 0.004, ZL], [x, yMid - 0.004, ZL]], PAL.gr, 3.2, { opacity: 0.85, renderOrder: 12 }));
    } else {
      // a resistor zig-zag: the load, whatever it is
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        pts.push([x + (i === 0 || i === 8 ? 0 : (i % 2 ? 0.008 : -0.008)), yMid + 0.020 - (0.040 * i) / 8, ZL]);
      }
      g.add(poly(pts, 0x9aa3ae, 1.4, { opacity: 0.8, renderOrder: 12 }));
    }
  }
  g.add(poly([[XS, Y_L, ZL], [XA0, Y_L, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA1, Y_L, ZL], [XLD, Y_L, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA1, Y_N, ZL], [XLD, Y_N, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XS, Y_N, ZL], [XA0, Y_N, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));

  // earth: bonded at both ends, no return current
  const eOpt = { opacity: 0.65, renderOrder: 12, dashed: true, dashSize: 0.006, gapSize: 0.005 };
  g.add(poly([[XA1, Y_E, ZL], [XLD, Y_E, ZL], [XLD, yMid - boxH / 2 - 0.004, ZL]], PAL.gr, 1.3, eOpt));
  g.add(poly([[XA0, Y_E, ZL], [XS, Y_E, ZL], [XS, Y_E - 0.026, ZL]], PAL.gr, 1.3, eOpt));
  for (let i = 0; i < 3; i++) {
    const w = 0.022 - i * 0.007;
    g.add(poly([[XS - w / 2, Y_E - 0.026 - i * 0.006, ZL], [XS + w / 2, Y_E - 0.026 - i * 0.006, ZL]], PAL.gr, 1.4, { opacity: 0.75, renderOrder: 12 }));
  }

  // ---- current arrows: they reverse 100 times a second ---------------------
  const arrows = [];
  for (const c of cores) {
    if (c.sign === 0) continue;
    for (let i = 0; i < 3; i++) {
      const a = arrowHead(0.0052, PAL.am, 0.9);
      a.position.set(XA0 + len * (0.18 + i * 0.32), c.y, Z_CORE + 0.010);
      g.add(a);
      arrows.push({ m: a, sign: c.sign });
    }
  }

  // ---- E across the live–neutral gap; S = E × H, which does not reverse ----
  // The cores of a real 3-core flex all but touch: the dielectric gap is
  // 0.52 mm, so at ×MAG it is a seam, and it is drawn as one.
  const gapMid = yMid;
  const gapH = PITCH - 2 * R_INS;
  const eSeam = [], eHeads = [];
  for (let i = 0; i < 5; i++) {
    const x = XA0 + len * (0.12 + i * 0.19);
    const s = flat(0.020, gapH * 0.9, x, gapMid, Z_CORE + 0.006, PAL.cy, 13, 0.5);
    s.material.blending = THREE.AdditiveBlending;
    g.add(s); eSeam.push(s);
    const h = arrowHead(0.0050, PAL.cy, 0.8);
    h.position.set(x, gapMid, Z_CORE + 0.008);
    g.add(h); eHeads.push(h);
  }

  // ---- travelling energy front, in the dielectric only --------------------
  const frontGrp = new THREE.Group();
  // |S| is far larger between live and neutral than anywhere else, so the band
  // is weighted rather than uniform.
  const sHeads = [];
  for (const [y, h, wgt] of [[gapMid, PITCH * 0.55, 1.00], [(Y_N + Y_E) / 2, PITCH * 0.55, 0.42],
    [Y_L + R_INS + 0.013, 0.017, 0.28], [Y_E - R_INS - 0.013, 0.017, 0.28]]) {
    const b = bandPlane(0.062, h, PAL.am, 0.26 * wgt);
    b.position.set(0, y, Z_CORE + 0.012);
    b.userData.wgt = 0.26 * wgt;
    frontGrp.add(b);
    const e = poly([[0.021, y - h / 2, Z_CORE + 0.013], [0.021, y + h / 2, Z_CORE + 0.013]],
      PAL.am, 1.6, { opacity: 0.55 * wgt, renderOrder: 14 });
    frontGrp.add(e);
    if (wgt > 0.9) {
      const a = arrowHead(0.0068, PAL.am, 0.85);
      a.position.set(0.030, y, Z_CORE + 0.014);
      frontGrp.add(a); sHeads.push(a);
    }
  }
  g.add(frontGrp);

  // ---- carriers ------------------------------------------------------------
  const rnd = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const carriers = [];
  cores.forEach((c, ci) => {
    for (let i = 0; i < N_CARR; i++) {
      const k = ci * 97 + i * 7 + 3;
      carriers.push({
        x: XA0 + 0.024 + rnd(k) * (len - 0.048),
        y: c.y + (rnd(k * 3 + 1) - 0.5) * R_CU * 1.30,
        z: Z_CORE + 0.001 + rnd(k * 5 + 2) * 0.0015,
        s: c.sign,
        f: [0.63 + rnd(k * 11) * 1.5, 0.71 + rnd(k * 13) * 1.6, 0.55 + rnd(k * 17) * 1.3],
        p: [rnd(k * 19) * 100, rnd(k * 23) * 100, rnd(k * 29) * 100],
        g: 0.6 + rnd(k * 31) * 0.4,
      });
    }
  });
  const swarm = new DIAG.Swarm(carriers.length, { color: PAL.cy, size: 0.0016, additive: true });
  g.add(swarm);

  // ---- the two swing marks -------------------------------------------------
  // The amber band above IS the ⌀1.784 mm copper at ×MAG, so it is the scale
  // reference and does not need a second bar. What has to be shown is that at
  // that same magnification the carriers' true swing has NO WIDTH — hence a
  // zero-width tick, captioned as such — and what it becomes when blown up.
  const SX = 0.024;
  const tick = (x, y, half, col, w, op = 0.9) =>
    poly([[x, y - half, Z_CORE + 0.002], [x, y + half, Z_CORE + 0.002]], col, w, { opacity: op, renderOrder: 13 });

  g.add(tick(SX, 0.092, 0.0070, PAL.rd, 2.4));

  const swingShown = 2 * X_DRIFT_PK * MAG_DRIFT;      // 0.02878 m of card
  const dimShown = DIAG.dimension([SX, 0.074, Z_CORE + 0.002], [SX + swingShown, 0.074, Z_CORE + 0.002],
    { color: PAL.cy, width: 1.4, head: 0.0040 });
  preFade(dimShown, 0.95); g.add(dimShown);
  g.add(tick(SX, 0.074, 0.0050, PAL.cy, 1.1));
  g.add(tick(SX + swingShown, 0.074, 0.0050, PAL.cy, 1.1));

  // ---- phase plot: current and carrier position, one cycle ----------------
  const T = 1 / F_MAINS;
  const ph = new DIAG.Graph({
    w: 0.115, h: 0.038, xRange: [0, T], yRange: [-1.20, 1.20],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [-1, 0, 1], zeroLine: 0,
  });
  ph.position.set(0.012, 0.014, Z_CORE - 0.001);
  g.add(ph);
  ph.addTrace((t) => Math.sin(TAU * F_MAINS * t), { color: PAL.am, width: 1.8, n: 160 });
  ph.addTrace((t) => -Math.cos(TAU * F_MAINS * t), { color: PAL.cy, width: 1.8, n: 160 });
  const dotI = ph.addDot(PAL.am, 0.0028);
  const dotX = ph.addDot(PAL.cy, 0.0028);

  root.userData = { swarm, carriers, arrows, eSeam, eHeads, sHeads, frontGrp, len, ph, dotI, dotX };
  return root;
}

// ===========================================================================
// STAGE
// ===========================================================================

// One latched display state. update() runs every frame; readouts() is polled at
// 10 Hz. If the labels track the instant and the footer tracks the poll, a
// single still frame shows two different answers for the same quantity. So both
// read D, and D only changes on the latch tick.
const D = { v: 0, i: 0, vd: 0, xd: 0, p: 0 };

export default {
  id: 'power',
  title: 'Mains &amp; Conditioning',
  nav: 'Mains',
  kicker: 'Mains',
  standfirst: 'Nothing travels from the wall but a change in the field',
  shot: SHOT,
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = new THREE.Group();
    this._cond = buildConditioner();
    this._lead = buildLead();
    hardware.add(this._cond, this._lead);

    const overlay = new THREE.Group();
    this._cA = buildCableCard();
    overlay.add(this._cA);

    // ---- labels ------------------------------------------------------------
    const L = ctx.labels;
    const A = this._cA.children[0];
    const anch = (x, y, z = Z_CORE + 0.014) => {
      const o = new THREE.Object3D(); o.position.set(x, y, z); A.add(o); return o;
    };
    const CARD = { occlude: false };

    this._lLive = L.add(anch(0.216, Y_L), {
      ...CARD, kicker: 'Live · out', value: `+${I_PK.toFixed(2)} A`, cls: 'am', offset: [50, 0], priority: 4,
    });
    this._lNeut = L.add(anch(0.216, Y_N), {
      ...CARD, kicker: 'Neutral · back', value: `−${I_PK.toFixed(2)} A`, cls: 'am', offset: [50, 0], priority: 4,
    });
    L.add(anch(0.216, Y_E), {
      ...CARD, kicker: 'Earth · no return', value: 'a few mA', cls: '', offset: [50, 0], priority: 2,
    });

    L.add(anch(0.075, 0.196), {
      ...CARD, kicker: 'Energy front  S = E × H',
      text: `${sci(V_FIELD, 3)} m/s on a clock 1 : ${sci(FIELD_TOTAL_SLOW, 2)} — as drawn only ×${SEEN_RATIO.toFixed(1)} faster than the carriers, truly ×${sci(SPEED_RATIO, 1)}`,
      cls: 'am', offset: [0, -18], priority: 4,
    });

    L.add(anch(0.024, 0.083), {
      ...CARD,
      kicker: `Copper ⌀${(D_COND * 1e3).toFixed(3)} mm at ×${MAG}`,
      text: `<span style="color:${RDS}">a carrier's ±${(X_DRIFT_PK * 1e6).toFixed(2)} µm at ×${MAG} is 0.02 px — this tick has no width</span><br>`
        + `<span style="color:${CYS}">and the same swing at ×${MAG_EXTRA.toLocaleString('en-GB')} more</span>`,
      offset: [152, 10], priority: 5,
    });

    L.add(anch(0.128, 0.032), {
      ...CARD, kicker: 'One cycle · ms across',
      text: `<span style="color:${AMS}">current ∝ sin ωt</span> · <span style="color:${CYS}">carrier position ∝ −cos ωt</span> — a quarter cycle apart`,
      offset: [80, 0], priority: 3,
    });

    // the subject has to be named on its own fascia, or a reader cannot tell
    // which of six identical rack units this chapter is about
    const badge = new THREE.Object3D();
    badge.position.set(-0.240, CHt / 2, CD / 2 + 0.010);
    this._cond.add(badge);
    L.add(badge, {
      kicker: 'Mains conditioner · bay 0', cls: 'lead',
      text: `line volts ±400 V f.s.d. and line current ±10 A · ${I_RMS.toFixed(2)} A rms drawn`,
      offset: [64, -50], priority: 5,
    });

    // MANDATORY axis numerals — a plot you cannot take a value off is decoration
    this._cA.userData.ph.tickLabels(L, {
      xVals: [0, 0.010, 0.020], yVals: [-1, 1],
      xFmt: (v) => (v * 1e3).toFixed(0),
      yFmt: (v) => (v > 0 ? '+1' : '−1'),
      xOffset: [0, 12], yOffset: [-14, 0],
    });

    return { hardware, overlay };
  },

  update(dt, t, ctx) {
    const th = TAU * F_MAINS * t;
    const sn = Math.sin(th);
    const cs = Math.cos(th);

    D.v = V_PK * sn;
    D.i = I_PK * sn;
    D.vd = V_DRIFT_PK * sn;
    D.xd = -X_DRIFT_PK * cs;
    D.p = 2 * VA * sn * sn;                          // p(t) = V̂Î sin²ωt

    const nd = this._cond.userData.needles;
    nd[0].rotation.z = -SWEEP * (V_PK / 400) * sn;   // volts, ±400 V f.s.d.
    nd[1].rotation.z = -SWEEP * (I_PK / 10) * sn;    // amps, ±10 A f.s.d.
    this._lead.userData.sheath.opacity = 0.024 + 0.070 * (sn * sn);

    this._cA.lookAt(ctx.camera.position);

    const U = this._cA.userData;
    // Displacement is the integral of velocity: x(t) = −x̂ cos ωt. The carriers
    // are therefore furthest from home when the current is zero, and back at
    // home when it peaks — a quarter cycle behind the arrows, which is the point.
    const drift = -X_DRIFT_PK * MAG_DRIFT * cs;
    const Tj = t * 3200;
    U.swarm.update((i) => {
      const c = U.carriers[i];
      const jx = Math.sin(Tj * c.f[0] + c.p[0]) * 0.0016 + Math.sin(Tj * c.f[2] * 1.7 + c.p[2]) * 0.0008;
      const jy = Math.sin(Tj * c.f[1] + c.p[1]) * 0.0011 + Math.cos(Tj * c.f[0] * 1.4 + c.p[1]) * 0.0006;
      return {
        p: [c.x + jx + c.s * drift, c.y + jy, c.z],
        s: c.g * (c.s === 0 ? 0.7 : 1.0),
        c: c.s === 0 ? PAL.gr : PAL.cy,
      };
    });

    const pos = sn >= 0;
    const amp = Math.abs(sn);
    for (const a of U.arrows) {
      a.m.rotation.z = (a.sign > 0) === pos ? 0 : Math.PI;
      a.m.userData._baseOp = 0.30 + 0.65 * amp;
    }
    for (const h of U.eHeads) {
      h.rotation.z = pos ? -Math.PI / 2 : Math.PI / 2;
      h.userData._baseOp = 0.14 + 0.70 * amp;
    }
    for (const s of U.eSeam) s.userData._baseOp = 0.10 + 0.46 * amp;
    for (const h of U.sHeads) h.userData._baseOp = 0.30 + 0.45 * amp;   // S never reverses

    // the energy front runs on its own, stated clock
    const cutLen = (XA1 - XA0) / MAG;
    const u = (((V_FIELD * t) / FIELD_SLOW / cutLen) % 1 + 1) % 1;
    U.frontGrp.position.x = XA0 + u * (XA1 - XA0);
    const fade = Math.sin(Math.PI * Math.min(1, u / 0.99));
    for (const b of U.frontGrp.children) if (b.userData.wgt) b.userData._baseOp = b.userData.wgt * (0.30 + 0.70 * fade);

    const tc = ((t % (1 / F_MAINS)) + 1 / F_MAINS) % (1 / F_MAINS);
    U.dotI.userData.setData(tc, Math.sin(TAU * F_MAINS * tc));
    U.dotX.userData.setData(tc, -Math.cos(TAU * F_MAINS * tc));
  },

  content() {
    return `
<h3>The circuit, both halves of it</h3>
<p>Two conductors leave the wall. <b>Live</b> carries current out; <b>neutral</b>
carries the identical current back at every instant. They are not interchangeable:
neutral is bonded to earth at the supply transformer, so it sits within a volt or two
of earth while live swings <span class="num">±${V_PK.toFixed(0)} V</span> about it.
<b>Protective earth</b> carries no return current — a few milliamps of filter
leakage, and whatever a fault sends it.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Dots racing along the
wire. Nothing races. Energy travels in the field between the conductors at
<span class="num">${sci(V_FIELD, 2)} m/s</span> — 0.66 c in PVC flex, and
<span class="num">${sci(SPEED_RATIO, 1)}</span> times the drift speed. The drawing
states its exaggerations: copper <span class="num">×${MAG}</span>, carrier swing
<span class="num">×${MAG_DRIFT.toLocaleString('en-GB')}</span>, field front on a clock
<span class="num">${sci(FIELD_TOTAL_SLOW, 2)}</span> slower than real time — leaving
the front only <span class="num">×${SEEN_RATIO.toFixed(1)}</span> faster than the
carriers on screen.</p></div>

<h3>What the electrons do</h3>
<p>Both monoblocks at <span class="num">${AMP.pOut8} W</span> into the
<span class="num">${SPEAKER.nominalZ} Ω</span> load actually connected, at
<span class="num">${(AMP.effAB * 100).toFixed(0)} %</span>, plus
<span class="num">${P_FRONT} W</span> of front end, draw
<span class="num">${P_SYS.toFixed(0)} W</span>:
<span class="num">${I_RMS.toFixed(2)} A</span> rms,
<span class="num">${I_PK.toFixed(2)} A</span> peak.</p>
<div class="eq">v̂ = Î / (n·A·e) = <span class="hl">${sci(V_DRIFT_PK, 2)} m/s</span>
x̂ = v̂ / ω = <span class="hl">${(X_DRIFT_PK * 1e6).toFixed(2)} µm</span> <span class="c">either side of home</span></div>
<p>A carrier shuffles that far one way and back, and stays there — riding a Fermi
velocity of <span class="num">${sci(V_FERMI, 2)} m/s</span> that scatters every
<span class="num">${(TAU_COLL * 1e15).toFixed(1)} fs</span> into a random walk of
<span class="num">${(X_THERMAL * 1e3).toFixed(0)} mm</span> per cycle, in no direction
at all.</p>

<h3>Field, not flow</h3>
<p><b>E</b> points live to neutral and <b>H</b> encircles each core; both reverse each
half cycle, so <span class="num">S = E × H</span> does not.</p>
<div class="eq">p(t) = V̂Î sin²ωt = ${VA.toFixed(0)}(1 − cos 2ωt) W</div>
<p>The copper only guides that flux, and wastes
<span class="num">I²R = ${P_LOSS.toFixed(2)} W</span> in
<span class="num">${(R_LOOP * 1e3).toFixed(1)} mΩ</span> out and back over
<span class="num">${L_LEAD.toFixed(2)} m</span>. At
<span class="num">${(LAMBDA_MAINS / 1e3).toFixed(0)} km</span> a wavelength, the whole
lead is in phase.</p>`;
  },

  readouts() {
    // The footer DOM is rewritten at 10 Hz; a world label written every frame
    // would show a different instant in the same still. So the two conductor
    // labels are written HERE, from the same snapshot the footer is built from
    // — one screenshot, one instant, whatever moment it is taken.
    if (this._lLive) {
      const s = `${D.i >= 0 ? '+' : '−'}${Math.abs(D.i).toFixed(2)} A`;
      const r = `${-D.i >= 0 ? '+' : '−'}${Math.abs(D.i).toFixed(2)} A`;
      this._lLive.setValue(s);
      this._lNeut.setValue(r);
    }
    return [
      { k: 'MAINS', v: (D.v >= 0 ? '+' : '−') + Math.abs(D.v).toFixed(1), u: `V · ${V_RMS} rms`, cls: 'acc' },
      { k: 'CURRENT', v: (D.i >= 0 ? '+' : '−') + Math.abs(D.i).toFixed(2), u: `A · ${I_RMS.toFixed(2)} rms`, cls: 'am' },
      { k: 'DRIFT v', v: (D.vd * 1e6).toFixed(1), u: 'µm/s', cls: 'am', bar: Math.abs(D.vd) / V_DRIFT_PK },
      { k: 'CARRIER x', v: (D.xd * 1e9).toFixed(0), u: 'nm', cls: 'acc', bar: (D.xd / X_DRIFT_PK + 1) / 2 },
      { k: 'POWER', v: D.p.toFixed(0), u: `W · ${VA.toFixed(0)} mean`, cls: 'am', bar: D.p / (2 * VA) },
      { k: 'FIELD', v: sci(V_FIELD, 3), u: 'm/s · 0.66 c', cls: '' },
    ];
  },
};
