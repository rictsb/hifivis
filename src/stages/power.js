import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   MAINS & CONDITIONING
   ---------------------------------------------------------------------------
   Every number below is derived here, in code, from first principles or from a
   stated standard value. Nothing is picked because it looks good.
   =========================================================================== */

const TAU = DSP.TAU;

// ---- supply -----------------------------------------------------------------
// ONE system draw for the whole piece: the same operating point overview.js
// states — both monoblocks at full output, class AB at ~55 %, plus 100 W of
// front end. Treated as unity power factor, which is an idealisation and is
// said to be one on screen.
const F_MAINS = 50;                                  // Hz  (EN 50160, UK/EU)
const V_RMS = 230;                                   // V   (EN 50160 nominal)
const V_PK = V_RMS * Math.SQRT2;                     // 325.27 V
const P_AMP = 600, ETA_AB = 0.55, P_FRONT = 100;
const P_SYS = (2 * P_AMP) / ETA_AB + P_FRONT;        // 2281.8 W
const I_RMS = P_SYS / V_RMS;                         // 9.921 A rms
const I_PK = I_RMS * Math.SQRT2;                     // 14.030 A
const VA = V_RMS * I_RMS;                            // 2281.8 VA

// ---- copper -----------------------------------------------------------------
// 100 % IACS at 20 °C, the value amp.js uses. σ is derived from ρ so the two
// can never drift apart.
const RHO_CU = 1.7241e-8;                            // Ω·m
const SIGMA_CU = 1 / RHO_CU;                         // 5.8001e7 S/m

// ---- the lead: 3 × 2.5 mm² H05VV-F, cores laid up on a filler ---------------
const A_MM2 = 2.5;                                   // mm²
const R_COND = Math.sqrt(A_MM2 / Math.PI) * 1e-3;    // 8.9206e-4 m
const D_COND = 2 * R_COND;                           // 1.7841 mm
const T_INS = 0.80e-3;                               // m, insulation wall
const R_INS_R = R_COND + T_INS;                      // 1.6921 mm
const PITCH_CORE = 3.90e-3;                          // m, lay-up triangle side
const T_SHEATH = 1.60e-3;                            // m, filler + sheath
const LEAD_OD = 2 * (PITCH_CORE / Math.sqrt(3) + R_INS_R + T_SHEATH); // 11.09 mm

// ---- carriers ---------------------------------------------------------------
const V_DRIFT_PK = DSP.driftVelocity(I_PK, A_MM2);   // 4.1243e-4 m/s
const X_DRIFT_PK = DSP.driftDisplacement(V_DRIFT_PK, F_MAINS); // 1.3128e-6 m

// Sommerfeld free-electron gas in copper. The classical equipartition figure
// √(3kT/m) = 1.15e5 m/s is in most textbooks and is wrong for a metal: the gas
// is degenerate, so the relevant speed is the Fermi velocity.
const HBAR = 1.054571817e-34;                        // J·s
const M_E = 9.1093837015e-31;                        // kg
const K_F = Math.cbrt(3 * Math.PI * Math.PI * DSP.N_CU);   // 1.3596e10 m⁻¹
const V_FERMI = (HBAR * K_F) / M_E;                  // 1.5739e6 m/s  (E_F = 7.05 eV)
const V_CLASSICAL = 1.1543e5;                        // √(3kT/m) at 293 K, for contrast
const TAU_COLL = (M_E * SIGMA_CU) / (DSP.N_CU * DSP.E_CHARGE ** 2); // 2.423e-14 s
const MFP = V_FERMI * TAU_COLL;                      // 3.814e-8 m  (38 nm)
const D_DIFF = (V_FERMI * MFP) / 3;                  // 0.02001 m²/s
const X_THERMAL = Math.sqrt((2 * D_DIFF) / F_MAINS); // 0.02829 m rms in one period
const N_COLL = 1 / F_MAINS / TAU_COLL;               // 8.25e11 collisions per cycle

// ---- field ------------------------------------------------------------------
const VF_CABLE = 0.66;                               // velocity factor, PVC flex
const V_FIELD = DSP.signalSpeed(VF_CABLE);           // 1.9786e8 m/s
const SPEED_RATIO = V_FIELD / V_DRIFT_PK;            // 4.80e11
const LAMBDA_MAINS = V_FIELD / F_MAINS;              // 3.957e6 m  (3957 km)

// ---- drawing scales — every one of these is printed on screen ---------------
const MAG = 26;                                      // ×, the copper and its jacket
const MAG_DRIFT = 26000;                             // ×, carrier displacement only
const MAG_EXTRA = MAG_DRIFT / MAG;                   // ×1000 on the copper's own scale
const FIELD_SLOW = 4e7;                              // field clock ÷ this, vs sim time
const TIME_SCALE = 0.02;                             // sim s per real s → 1 : 50
const FIELD_TOTAL_SLOW = FIELD_SLOW / TIME_SCALE;    // 1 : 1.25×10⁹ vs real time

// What the eye actually reads, in card metres per REAL second. Both exaggerations
// collapse into these two numbers, so their ratio is quotable.
const SEEN_DRIFT = V_DRIFT_PK * MAG_DRIFT * TIME_SCALE;          // 0.198 m/s
const SEEN_FIELD = (V_FIELD * MAG * TIME_SCALE) / FIELD_SLOW;    // 3.166 m/s
const SEEN_RATIO = SEEN_FIELD / SEEN_DRIFT;                      // ×16

const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUPS[c] || c).join('');
function sci(v, d = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(d)}×10${sup(e)}`;
}
const CYS = '#5cc0f2', AMS = '#f0b35a', GYS = '#98a1ad', RDS = '#f2795c';

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

function card(w, h, opacity = 0.90) {
  const g = DIAG.diagramCard(w, h, { opacity, pad: 0.024 });
  g.userData.plate.userData._baseOp = opacity;
  return g;
}

function poly(pts, color, width = 1.4, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => pts[i]);
  return t;
}

function disc(x, y, z, r, color, op = 1, seg = 16) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg),
    new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: op, depthWrite: false }));
  m.position.set(x, y, z);
  m.renderOrder = 13;
  m.userData._baseOp = op;
  return m;
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
  grd.addColorStop(0.78, 'rgba(255,255,255,1)');
  grd.addColorStop(0.90, 'rgba(255,255,255,0.45)');
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

  const inset = new THREE.Mesh(GEO.bevelBox(0.418, CHt - 0.020, 0.004, 0.0012, 3), M.anodBlack);
  inset.position.set(0, 0, zF - 0.0012);
  g.add(inset);

  const mw = 0.212, mh = 0.050;
  const bez = new THREE.Mesh(GEO.bevelBox(mw + 0.016, mh + 0.014, 0.007, 0.0014, 3), M.anodGrey);
  bez.position.set(0.052, 0.006, zF + 0.0015);
  g.add(bez);

  const back = M.meterGlow.clone();
  back.color.multiplyScalar(0.32);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), back);
  glass.position.set(0.052, 0.006, zF + 0.0052);
  g.add(glass);

  const tickMat = M.ledCyan.clone();
  tickMat.color.multiplyScalar(0.55);
  const NT = 21;
  const ticks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.0011, 0.0075), tickMat, NT);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(1, 1, 1);
  const pivotY = 0.006 - 0.062;
  for (let i = 0; i < NT; i++) {
    const a = -0.62 + (1.24 * i) / (NT - 1);
    const rr = 0.0715 - (i % 5 === 0 ? 0 : 0.0022);
    qq.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    mtx.compose(new THREE.Vector3(0.052 + Math.sin(a) * rr, pivotY + Math.cos(a) * rr, 0.0002), qq, ss);
    ticks.setMatrixAt(i, mtx);
  }
  ticks.position.copy(glass.position);
  ticks.position.z += 0.0004;
  g.add(ticks);

  const needles = [];
  for (const [col, len] of [[M.ledCyan, 0.066], [M.ledAmber, 0.058]]) {
    const nm = col.clone();
    nm.color.multiplyScalar(2.4);
    const n = new THREE.Mesh(GEO.bevelBox(0.0016, len, 0.0016, 0.0004, 2), nm);
    const pivot = new THREE.Group();
    pivot.position.set(0.052, pivotY, zF + 0.0058);
    n.position.y = len / 2 + 0.012;
    pivot.add(n);
    g.add(pivot);
    needles.push(pivot);
  }
  const hub = new THREE.Mesh(GEO.bevelCyl(0.0045, 0.005, 0.003, 18, 0.0004), M.chrome);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0.052, pivotY, zF + 0.006);
  g.add(hub);

  const cover = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), M.glass);
  cover.position.set(0.052, 0.006, zF + 0.0066);
  g.add(cover);

  const kb = GEO.knob(0.0195, 0.015, { flutes: 56 });
  kb.rotation.x = Math.PI / 2;
  kb.position.set(-0.168, 0.004, zF + 0.0055);
  GEO.shadowed(kb);
  g.add(kb);
  const ringM = M.ledCyan.clone();
  ringM.color.multiplyScalar(2.2);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.0225, 0.0248, 44), ringM);
  halo.position.set(-0.168, 0.004, zF + 0.0016);
  g.add(halo);

  const ledCols = [M.ledGreen, M.ledCyan, M.ledCyan, M.ledAmber];
  for (let i = 0; i < 4; i++) {
    const lm = ledCols[i].clone();
    lm.color.multiplyScalar(1.9);
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), lm);
    l.position.set(-0.106 + i * 0.013, -0.040, zF + 0.0016);
    g.add(l);
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
// Out of the inlet, down the rack's right rear corner, a slack hairpin on the
// floor beside the rack (the only part the hero shot sees), then away behind
// the rack to a wall socket. The length is measured off the curve, not asserted.

const LEAD_PTS = [
  [0.207, 0.1725, -3.522], [0.228, 0.1660, -3.580], [0.276, 0.1380, -3.628],
  [0.344, 0.0900, -3.646], [0.416, 0.0400, -3.612], [0.456, 0.0170, -3.530],
  [0.462, 0.0160, -3.420], [0.458, 0.0160, -3.290], [0.446, 0.0160, -3.160],
  [0.424, 0.0160, -3.072], [0.386, 0.0160, -3.022], [0.344, 0.0160, -3.030],
  [0.320, 0.0160, -3.092], [0.326, 0.0160, -3.200], [0.340, 0.0160, -3.330],
  [0.344, 0.0170, -3.470], [0.318, 0.0175, -3.594], [0.220, 0.0180, -3.684],
  [0.030, 0.0180, -3.762], [-0.230, 0.0180, -3.910], [-0.480, 0.0180, -4.190],
  [-0.668, 0.0180, -4.570], [-0.740, 0.0180, -4.980],
];

const LEAD_CURVE = new THREE.CatmullRomCurve3(LEAD_PTS.map((p) => new THREE.Vector3(...p)));
const L_LEAD = LEAD_CURVE.getLength();               // ≈ 3.1 m, inlet to socket
const R_LOOP = (RHO_CU * 2 * L_LEAD) / (A_MM2 * 1e-6); // out AND back
const V_DROP = I_RMS * R_LOOP;
const P_LOSS = I_RMS * I_RMS * R_LOOP;

function buildLead() {
  const M = mats();
  const g = new THREE.Group();
  const curve = LEAD_CURVE;
  const jacket = M.rubber.clone();
  jacket.color.setHex(0x191b1f);
  jacket.roughness = 0.62;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 320, LEAD_OD / 2, 16, false), jacket);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);

  const body = new THREE.Mesh(GEO.bevelBox(0.030, 0.023, 0.040, 0.0025, 4), M.plastic);
  body.position.set(0.207, 0.1725, -3.542);
  body.castShadow = true;
  g.add(body);
  const collar = new THREE.Mesh(GEO.bevelBox(0.034, 0.027, 0.006, 0.0015, 3), M.anodGrey);
  collar.position.set(0.207, 0.1725, -3.524);
  g.add(collar);

  // a moulded strain relief and two cable ties: small parts sell the scale
  for (const t of [0.055, 0.30]) {
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const fr = new THREE.Mesh(GEO.bevelCyl(0.0072, 0.0072, 0.011, 18, 0.0008), M.anodGrey);
    fr.position.copy(p);
    fr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    fr.castShadow = true;
    g.add(fr);
  }

  // the hairpin on the floor gets its own contact shadow, or it floats
  const sh = GEO.contactShadow(0.40, 0.62, 0.55, 0.0010);
  sh.position.set(0.392, 0, -3.26);
  g.add(sh);

  // Instantaneous power p(t) = VI(1 − cos 2ωt): real, 100 Hz, never negative.
  const sheathMat = new THREE.MeshBasicMaterial({
    color: PAL.am, transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.BackSide,
  });
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, LEAD_OD * 1.35, 12, false), sheathMat);
  sheath.renderOrder = 12;
  g.add(sheath);

  g.userData.curve = curve;
  g.userData.sheath = sheathMat;
  return g;
}

// ===========================================================================
// OVERLAY — the one card: the lead in section
// ===========================================================================

const A_W = 0.80, A_H = 0.42;
const XA0 = 0.118, XA1 = 0.712;                   // 29.7 mm of real cable at ×20
const R_CU = R_COND * MAG;                        // 0.017841
const R_INS = R_INS_R * MAG;                      // 0.033841
const PITCH = PITCH_CORE * MAG;                   // 0.078
const Y_L = 0.335, Y_N = Y_L - PITCH, Y_E = Y_L - 2 * PITCH;   // 0.335 / 0.257 / 0.179
const Y_DIM = 0.400;                              // the ×20 comparison row
const Z_CORE = 0.050;
const N_CARR = 26;

function halfCyl(len, r, mat, seg) {
  const gm = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI);
  const m = new THREE.Mesh(gm, mat);
  m.rotation.z = -Math.PI / 2;
  return m;
}

function buildCableCard() {
  const root = new THREE.Group();
  root.position.set(0.06, 0.554, -2.88);
  const g = new THREE.Group();
  g.position.set(-A_W / 2, -A_H / 2, 0);
  root.add(g);
  g.add(card(A_W, A_H, 0.90));

  const M = mats();
  const layer = (m) => { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; return m; };
  // NOTE: a concave metal half-tube is a mirror. Keep it rough and dim or it
  // focuses the studio strip into a caustic that punches straight through bloom.
  const cuMat = layer(M.copper.clone());
  cuMat.color.setHex(0xb06a38);
  cuMat.roughness = 0.62;
  cuMat.metalness = 0.75;
  cuMat.envMapIntensity = 0.55;
  const cuE = cuMat.clone(); cuE.color.setHex(0x7d4b2b); cuE.envMapIntensity = 0.45;
  const insMat = layer(M.plastic.clone());
  insMat.color.setHex(0x0c0f13);
  insMat.roughness = 0.82;
  insMat.clearcoat = 0.25;
  insMat.opacity = 0.95;
  const insE = insMat.clone(); insE.color.setHex(0x0d1611);

  const flat = (w, h, x, y, z, col, order) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      color: col, toneMapped: false, transparent: true, opacity: 1, depthWrite: false,
    }));
    m.position.set(x, y, z);
    m.renderOrder = order;
    m.userData._baseOp = 1;
    return m;
  };

  const len = XA1 - XA0;
  const xm = (XA0 + XA1) / 2;
  const cores = [
    { y: Y_L, sign: +1, ins: insMat, cu: cuMat },
    { y: Y_N, sign: -1, ins: insMat, cu: cuMat },
    { y: Y_E, sign: 0, ins: insE, cu: cuE },
  ];

  for (const c of cores) {
    // flat backings give the section its base colour; the half-tubes on top add
    // the real specular shading from the studio environment
    g.add(flat(len, 2 * R_INS, xm, c.y, Z_CORE - R_INS - 0.003, c === cores[2] ? 0x0c130f : 0x0b0e12, 5));
    const sh = halfCyl(len, R_INS, c.ins, 26);
    sh.position.set(xm, c.y, Z_CORE);
    sh.renderOrder = 6;
    g.add(sh);
    g.add(flat(len, 2 * R_CU, xm, c.y, Z_CORE - R_CU - 0.002, c.sign === 0 ? 0x4d2f1b : 0x7a4626, 7));
    const cu = halfCyl(len, R_CU, c.cu, 34);
    cu.position.set(xm, c.y, Z_CORE);
    cu.renderOrder = 8;
    g.add(cu);
    for (const xe of [XA0, XA1]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(R_CU, R_INS, 28, 1, Math.PI / 2, Math.PI), c.ins);
      ring.position.set(xe, c.y, Z_CORE);
      ring.rotation.z = -Math.PI / 2;
      ring.renderOrder = 9;
      g.add(ring);
      const face = new THREE.Mesh(new THREE.CircleGeometry(R_CU, 26, Math.PI / 2, Math.PI), c.cu);
      face.position.set(xe, c.y, Z_CORE);
      face.rotation.z = -Math.PI / 2;
      face.renderOrder = 10;
      g.add(face);
    }
    for (const dy of [R_CU, -R_CU]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], 0xe8b98c, 1.1, { opacity: 0.75, renderOrder: 11 }));
    }
    for (const dy of [R_INS, -R_INS]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], 0x5b636e, 0.9, { opacity: 0.6, renderOrder: 11 }));
    }
  }

  // ---- the closed loop, drawn unbroken ------------------------------------
  const XS = 0.048, XLD = 0.760, ZL = Z_CORE + 0.006;
  for (const [x, h] of [[XS, PITCH + 0.070], [XLD, PITCH + 0.070]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.042, h), new THREE.MeshBasicMaterial({
      color: 0x0f151c, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    }));
    b.position.set(x, (Y_L + Y_N) / 2, Z_CORE - 0.003);
    b.renderOrder = 9;
    b.userData._baseOp = 0.9;
    g.add(b);
    g.add(poly([[x - 0.021, (Y_L + Y_N) / 2 - h / 2, ZL], [x + 0.021, (Y_L + Y_N) / 2 - h / 2, ZL],
      [x + 0.021, (Y_L + Y_N) / 2 + h / 2, ZL], [x - 0.021, (Y_L + Y_N) / 2 + h / 2, ZL],
      [x - 0.021, (Y_L + Y_N) / 2 - h / 2, ZL]], 0x49525d, 1.0, { opacity: 0.85, renderOrder: 10 }));
  }
  g.add(poly([[XS, Y_L, ZL], [XA0, Y_L, ZL]], PAL.am, 2.0, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA1, Y_L, ZL], [XLD, Y_L, ZL], [XLD, Y_N, ZL], [XA1, Y_N, ZL]], PAL.am, 2.0, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA0, Y_N, ZL], [XS, Y_N, ZL], [XS, Y_L, ZL]], PAL.am, 2.0, { opacity: 0.9, renderOrder: 12 }));

  // earth: bonded at both ends, no return current
  const eOpt = { opacity: 0.75, renderOrder: 12, dashed: true, dashSize: 0.010, gapSize: 0.008 };
  g.add(poly([[XA1, Y_E, ZL], [XLD, Y_E, ZL], [XLD, Y_N - 0.040, ZL]], PAL.gr, 1.5, eOpt));
  g.add(poly([[XA0, Y_E, ZL], [XS, Y_E, ZL], [XS, Y_E - 0.038, ZL]], PAL.gr, 1.5, eOpt));
  for (let i = 0; i < 3; i++) {
    const w = 0.030 - i * 0.009;
    g.add(poly([[XS - w / 2, Y_E - 0.038 - i * 0.008, ZL], [XS + w / 2, Y_E - 0.038 - i * 0.008, ZL]], PAL.gr, 1.6, { opacity: 0.8, renderOrder: 12 }));
  }

  // ---- current arrows: they reverse 100 times a second ---------------------
  const arrows = [];
  for (const c of cores) {
    if (c.sign === 0) continue;
    for (let i = 0; i < 4; i++) {
      const a = arrowHead(0.0115, PAL.am, 0.95);
      a.position.set(XA0 + len * (0.14 + i * 0.24), c.y, Z_CORE + 0.014);
      g.add(a);
      arrows.push({ m: a, sign: c.sign });
    }
  }

  // ---- E in the dielectric, alternating; S = E × H, which does not --------
  const gapMid = (Y_L + Y_N) / 2;
  const eLines = [], eHeads = [], sHeads = [];
  for (let i = 0; i < 5; i++) {
    const x = 0.276 + i * 0.088;
    const t = poly([[x, Y_L - R_INS, Z_CORE + 0.010], [x, gapMid, Z_CORE + 0.010], [x, Y_N + R_INS, Z_CORE + 0.010]],
      PAL.cy, 1.3, { opacity: 0.55, renderOrder: 12, dashed: true, dashSize: 0.007, gapSize: 0.005 });
    g.add(t); eLines.push(t);
    const h = arrowHead(0.0080, PAL.cy, 0.8);
    h.position.set(x, gapMid, Z_CORE + 0.012);
    g.add(h); eHeads.push(h);
  }
  for (let i = 0; i < 4; i++) {
    const a = arrowHead(0.0098, PAL.am, 0.55);
    a.position.set(0.320 + i * 0.088, gapMid, Z_CORE + 0.012);
    g.add(a); sHeads.push(a);
  }

  // ---- travelling energy front, in the dielectric only --------------------
  const frontGrp = new THREE.Group();
  // |S| is far larger between live and neutral than anywhere else, so the band
  // is weighted rather than uniform.
  const GAPH = (PITCH - 2 * R_INS) * 0.80;
  for (const [y, h, wgt] of [[gapMid, GAPH, 1.00], [(Y_N + Y_E) / 2, GAPH, 0.40],
    [Y_L + R_INS + 0.022, 0.024, 0.26], [Y_E - R_INS - 0.022, 0.024, 0.26]]) {
    const b = bandPlane(0.140, h, PAL.am, 0.22 * wgt);
    b.position.set(0, y, Z_CORE + 0.020);
    b.userData.wgt = 0.22 * wgt;
    frontGrp.add(b);
    const e = poly([[0.047, y - h / 2, Z_CORE + 0.021], [0.047, y + h / 2, Z_CORE + 0.021]],
      PAL.am, 1.7, { opacity: 0.55 * wgt, renderOrder: 14 });
    frontGrp.add(e);
  }
  g.add(frontGrp);

  // ---- carriers ------------------------------------------------------------
  const rnd = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const carriers = [];
  cores.forEach((c, ci) => {
    for (let i = 0; i < N_CARR; i++) {
      const k = ci * 97 + i * 7 + 3;
      carriers.push({
        x: XA0 + 0.062 + rnd(k) * (len - 0.124),
        y: c.y + (rnd(k * 3 + 1) - 0.5) * R_CU * 1.45,
        z: Z_CORE - R_CU * 0.5 + rnd(k * 5 + 2) * R_CU * 0.7,
        s: c.sign,
        f: [0.63 + rnd(k * 11) * 1.5, 0.71 + rnd(k * 13) * 1.6, 0.55 + rnd(k * 17) * 1.3],
        p: [rnd(k * 19) * 100, rnd(k * 23) * 100, rnd(k * 29) * 100],
        g: 0.6 + rnd(k * 31) * 0.4,
      });
    }
  });
  const swarm = new DIAG.Swarm(carriers.length, { color: PAL.cy, size: 0.0042, additive: true });
  g.add(swarm);

  // ---- the ×20 / ×1200 comparison row -------------------------------------
  const yD = Y_DIM;
  const tick = (x, half, col, w) => poly([[x, yD - half, Z_CORE + 0.004], [x, yD + half, Z_CORE + 0.004]], col, w, { opacity: 0.9, renderOrder: 13 });
  const xRef = 0.118;
  const dimRef = DIAG.dimension([xRef, yD, Z_CORE + 0.004], [xRef + D_COND * MAG, yD, Z_CORE + 0.004],
    { color: PAL.ink3, width: 1.3, head: 0.0080 });
  preFade(dimRef, 0.9); g.add(dimRef);
  g.add(tick(xRef, 0.011, PAL.ink3, 1.1));
  g.add(tick(xRef + D_COND * MAG, 0.011, PAL.ink3, 1.1));

  const xTrue = 0.238;
  g.add(tick(xTrue, 0.018, PAL.rd, 2.6));
  const dimTrue = DIAG.dimension([xTrue, yD, Z_CORE + 0.004], [xTrue + X_DRIFT_PK * MAG, yD, Z_CORE + 0.004],
    { color: PAL.rd, width: 1.6, head: 0.00003 });
  preFade(dimTrue, 0.95); g.add(dimTrue);

  const xShown = 0.330;
  const dimShown = DIAG.dimension([xShown, yD, Z_CORE + 0.004], [xShown + X_DRIFT_PK * MAG_DRIFT, yD, Z_CORE + 0.004],
    { color: PAL.cy, width: 1.7, head: 0.0085 });
  preFade(dimShown, 0.95); g.add(dimShown);
  g.add(tick(xShown, 0.011, PAL.cy, 1.2));
  g.add(tick(xShown + X_DRIFT_PK * MAG_DRIFT, 0.011, PAL.cy, 1.2));
  // blow-up bracket: red tick → cyan bar
  g.add(poly([[xTrue + 0.0012, yD - 0.014, Z_CORE + 0.004], [xShown, yD - 0.026, Z_CORE + 0.004],
    [xShown + X_DRIFT_PK * MAG_DRIFT, yD - 0.026, Z_CORE + 0.004], [xTrue + 0.0012, yD - 0.014, Z_CORE + 0.004]],
  PAL.ink3, 0.8, { opacity: 0.30, renderOrder: 11, dashed: true, dashSize: 0.006, gapSize: 0.005 }));

  // ---- phase plot: current and carrier position, one cycle ----------------
  const T = 1 / F_MAINS;
  const ph = new DIAG.Graph({
    w: 0.415, h: 0.086, xRange: [0, T], yRange: [-1.18, 1.18],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [-1, 0, 1], zeroLine: 0,
  });
  ph.position.set(0.085, 0.022, Z_CORE - 0.002);
  g.add(ph);
  ph.addTrace((t) => Math.sin(TAU * F_MAINS * t), { color: PAL.am, width: 2.2, n: 200 });
  ph.addTrace((t) => -Math.cos(TAU * F_MAINS * t), { color: PAL.cy, width: 2.2, n: 200 });
  const dotI = ph.addDot(PAL.am, 0.0052);
  const dotX = ph.addDot(PAL.cy, 0.0052);

  root.userData = { swarm, carriers, arrows, eLines, eHeads, sHeads, frontGrp, len, ph, dotI, dotX };
  return root;
}

// ===========================================================================
// STAGE
// ===========================================================================

const S = { v: 0, i: 0, vd: 0, xd: 0, p: 0 };

export default {
  id: 'power',
  title: 'Mains &amp; Conditioning',
  nav: 'Mains',
  kicker: 'Mains',
  standfirst: 'Nothing travels from the wall but a change in the field',
  shot: frameShot([0.02, 0.40, -3.16], 0.30, { fill: 0.63, az: 0.44, el: 0.13, fov: 31 }),
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
    const anch = (parent, x, y, z = Z_CORE) => {
      const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o;
    };
    const CARD = { occlude: false };

    this._lLive = L.add(anch(A, XA1 + 0.030, Y_L, Z_CORE + 0.02), {
      ...CARD, kicker: 'Live · out', value: `+${I_PK.toFixed(2)} A`, cls: 'am', offset: [58, 0], priority: 3,
    });
    this._lNeut = L.add(anch(A, XA1 + 0.030, Y_N, Z_CORE + 0.02), {
      ...CARD, kicker: 'Neutral · the same back', value: `−${I_PK.toFixed(2)} A`, cls: 'am', offset: [58, 0], priority: 3,
    });
    L.add(anch(A, XA1 + 0.030, Y_E, Z_CORE + 0.02), {
      ...CARD, kicker: 'Earth · no return current', value: 'a few mA of leakage', cls: '', offset: [58, 0], priority: 2,
    });
    L.add(anch(A, 0.300, Y_DIM, Z_CORE + 0.02), {
      ...CARD,
      kicker: `The first two at true ×${MAG} · the third that same swing ×${MAG_EXTRA} more`,
      text: `<span style="color:${GYS}">⌀ ${(D_COND * 1e3).toFixed(3)} mm</span> · <span style="color:${RDS}">true swing ±${(X_DRIFT_PK * 1e6).toFixed(2)} µm</span> · <span style="color:${CYS}">the same swing, blown up</span>`,
      offset: [0, -22], priority: 4,
    });
    L.add(anch(A, 0.470, Y_L + R_INS, Z_CORE + 0.02), {
      ...CARD, kicker: 'Energy front  S = E × H',
      text: `${sci(V_FIELD, 3)} m/s · clock 1 : ${sci(FIELD_TOTAL_SLOW, 2)} · as drawn only ×${SEEN_RATIO.toFixed(0)} faster than the carriers, truly ×${sci(SPEED_RATIO, 1)}`,
      cls: 'am', offset: [0, -18], priority: 4,
    });
    L.add(anch(A, 0.052, (Y_L + Y_N) / 2 + PITCH * 0.62, Z_CORE + 0.02), {
      ...CARD, kicker: 'Supply', cls: 'plain', offset: [0, -14], priority: 1,
    });
    L.add(anch(A, 0.760, (Y_L + Y_N) / 2 + PITCH * 0.62, Z_CORE + 0.02), {
      ...CARD, kicker: 'Load', cls: 'plain', offset: [0, -14], priority: 1,
    });
    L.add(anch(A, 0.560, 0.062, Z_CORE + 0.02), {
      ...CARD, kicker: 'One cycle · 20 ms',
      text: `<span style="color:${AMS}">current ∝ sin ωt</span> · <span style="color:${CYS}">carrier position ∝ −cos ωt</span> — a quarter cycle apart`,
      offset: [96, 0], priority: 3,
    });

    const pL = LEAD_CURVE.getPointAt(0.30);
    L.add(anch(this._lead, pL.x + 0.02, pL.y + 0.030, pL.z), {
      kicker: 'Mains lead', text: `3 × 2.5 mm² · ⌀${(LEAD_OD * 1e3).toFixed(1)} mm · ${L_LEAD.toFixed(2)} m to the socket`,
      offset: [70, 26], priority: 2,
    });

    return { hardware, overlay };
  },

  update(dt, t, ctx) {
    const th = TAU * F_MAINS * t;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    S.v = V_PK * sn;
    S.i = I_PK * sn;
    S.vd = V_DRIFT_PK * sn;
    S.xd = -X_DRIFT_PK * cs;
    S.p = 2 * VA * sn * sn;                          // p(t) = V̂Î sin²ωt

    const nd = this._cond.userData.needles;
    nd[0].rotation.z = -sn * (V_PK / 400) * 0.62;    // volts, ±400 V f.s.d.
    nd[1].rotation.z = -sn * (I_PK / 20) * 0.62;     // amps, ±20 A f.s.d.
    this._lead.userData.sheath.opacity = 0.030 + 0.085 * (S.p / (2 * VA));

    this._cA.lookAt(ctx.camera.position);

    const U = this._cA.userData;
    // Displacement is the integral of velocity: x(t) = −x̂ cos ωt. The carriers
    // are therefore furthest from home when the current is zero, and back at
    // home when it peaks — a quarter cycle behind the arrows, which is the point.
    const drift = -X_DRIFT_PK * MAG_DRIFT * cs;
    const Tj = t * 3200;
    U.swarm.update((i) => {
      const c = U.carriers[i];
      const jx = Math.sin(Tj * c.f[0] + c.p[0]) * 0.0030 + Math.sin(Tj * c.f[2] * 1.7 + c.p[2]) * 0.0014;
      const jy = Math.sin(Tj * c.f[1] + c.p[1]) * 0.0026 + Math.cos(Tj * c.f[0] * 1.4 + c.p[1]) * 0.0011;
      const jz = Math.sin(Tj * c.f[2] + c.p[2]) * 0.0018;
      return {
        p: [c.x + jx + c.s * drift, c.y + jy, c.z + jz],
        s: c.g * (c.s === 0 ? 0.75 : 1.0),
        c: c.s === 0 ? PAL.gr : PAL.cy,
      };
    });

    const pos = sn >= 0;
    const amp = Math.abs(sn);
    for (const a of U.arrows) {
      a.m.rotation.z = (a.sign > 0) === pos ? 0 : Math.PI;
      a.m.userData._baseOp = 0.28 + 0.67 * amp;
    }
    for (const h of U.eHeads) {
      h.rotation.z = pos ? -Math.PI / 2 : Math.PI / 2;
      h.userData._baseOp = 0.12 + 0.72 * amp;
    }
    for (const h of U.sHeads) h.userData._baseOp = 0.20 + 0.45 * amp;   // S never reverses
    for (const l of U.eLines) l._baseOpacity = 0.10 + 0.50 * amp;

    // the energy front runs on its own, stated clock
    const cutLen = (XA1 - XA0) / MAG;
    const u = (((V_FIELD * t) / FIELD_SLOW / cutLen) % 1 + 1) % 1;
    U.frontGrp.position.x = XA0 + u * (XA1 - XA0);
    const fade = Math.sin(Math.PI * Math.min(1, u / 0.99));
    for (const b of U.frontGrp.children) if (b.userData.wgt) b.userData._baseOp = b.userData.wgt * (0.28 + 0.72 * fade);

    const tc = ((t % (1 / F_MAINS)) + 1 / F_MAINS) % (1 / F_MAINS);
    U.dotI.userData.setData(tc, Math.sin(TAU * F_MAINS * tc));
    U.dotX.userData.setData(tc, -Math.cos(TAU * F_MAINS * tc));

    this._lLive.setValue(`${S.i >= 0 ? '+' : ''}${S.i.toFixed(2)} A`);
    this._lNeut.setValue(`${-S.i >= 0 ? '+' : ''}${(-S.i).toFixed(2)} A`);
  },

  content() {
    return `
<h3>The circuit, both halves of it</h3>
<p>Two conductors leave the wall. <b>Live</b> carries current out to the load;
<b>neutral</b> carries the identical current back at every instant. The current in
them reverses <span class="num">100</span> times a second, but the conductors are
not interchangeable: neutral is bonded to earth at the supply transformer, so it
sits within a volt or two of earth all cycle while live swings
<span class="num">±${V_PK.toFixed(0)} V</span> about it. <b>Protective earth</b>
carries no signal or return current — only the filter's earth-leakage current, a
few milliamps, and whatever a fault sends it.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Dots racing along the
wire. Nothing races. Energy travels in the field between the conductors at
<span class="num">${sci(V_FIELD, 2)} m/s</span> — 0.66 c in PVC flex, and
<span class="num">${sci(SPEED_RATIO, 1)}</span> times the drift speed. The drawing
states its exaggerations: copper <span class="num">×${MAG}</span>, carrier swing
<span class="num">×${MAG_DRIFT.toLocaleString('en-GB')}</span>, field front on a clock
<span class="num">${sci(FIELD_TOTAL_SLOW, 2)}</span> slower than real time — which
leaves the front only <span class="num">×${SEEN_RATIO.toFixed(0)}</span> faster than
the carriers on screen.</p></div>

<h3>What the electrons do</h3>
<p>Two <span class="num">${P_AMP} W</span> monoblocks at
<span class="num">${(ETA_AB * 100).toFixed(0)} %</span> plus
<span class="num">${P_FRONT} W</span> of front end draw
<span class="num">${P_SYS.toFixed(0)} W</span>:
<span class="num">${I_RMS.toFixed(2)} A</span> rms,
<span class="num">${I_PK.toFixed(2)} A</span> peak.</p>
<div class="eq">v̂ = Î / (n·A·e)
  = ${I_PK.toFixed(2)} / (${sci(DSP.N_CU, 2)} · ${A_MM2}×10⁻⁶ · e)
  = <span class="hl">${sci(V_DRIFT_PK, 2)} m/s</span>
x̂ = v̂ / ω = ${sci(V_DRIFT_PK, 2)} / ${(TAU * F_MAINS).toFixed(2)}
  = <span class="hl">${(X_DRIFT_PK * 1e6).toFixed(2)} µm</span>  <span class="c">either side of home</span></div>
<p>A carrier shuffles ${(X_DRIFT_PK * 1e6).toFixed(2)} µm one way and back, and stays
there. That bias rides on chaos: copper's electron gas is degenerate, so carriers
move at the Fermi velocity <span class="num">${sci(V_FERMI, 2)} m/s</span>, not the
classical <span class="num">√(3kT/m) = ${sci(V_CLASSICAL, 1)} m/s</span>, scattering
every <span class="num">${(TAU_COLL * 1e15).toFixed(1)} fs</span> after
<span class="num">${(MFP * 1e9).toFixed(0)} nm</span> —
<span class="num">${sci(N_COLL, 1)}</span> collisions per cycle and a random walk of
<span class="num">√(2Dt) = ${(X_THERMAL * 1e3).toFixed(0)} mm</span>, in no particular
direction.</p>

<h3>Field, not flow</h3>
<p><b>E</b> points from live to neutral and <b>H</b> encircles each core; both reverse
each half cycle, so <span class="num">S = E × H</span> does not. Integrated over that
space the flux is</p>
<div class="eq">p(t) = V̂Î sin²ωt = ${VA.toFixed(0)}(1 − cos 2ωt) W</div>
<p>— zero twice a cycle, <span class="num">${(2 * VA).toFixed(0)} W</span> at the peaks,
<span class="num">${VA.toFixed(0)} W</span> mean. That mean is
<span class="num">${VA.toFixed(0)} VA</span>, and is watts only because this load is
treated as unity power factor; a real capacitor-input supply draws harmonic-rich
bursts at a crest factor near 3, which changes the shape of the current and not the
argument. The copper only guides the field, and wastes
<span class="num">I²R = ${P_LOSS.toFixed(2)} W</span> in
<span class="num">${(R_LOOP * 1e3).toFixed(1)} mΩ</span> of out-and-back resistance,
dropping <span class="num">${V_DROP.toFixed(2)} V</span>. At
<span class="num">${(LAMBDA_MAINS / 1e3).toFixed(0)} km</span> a wavelength, every part
of the lead is in phase.</p>`;
  },

  readouts() {
    return [
      { k: 'MAINS', v: (S.v >= 0 ? '+' : '') + S.v.toFixed(1), u: `V · ${V_RMS} rms`, cls: 'acc' },
      { k: 'CURRENT', v: (S.i >= 0 ? '+' : '') + S.i.toFixed(2), u: `A · ${I_RMS.toFixed(2)} rms`, cls: 'am' },
      { k: 'DRIFT v', v: (S.vd * 1e6).toFixed(1), u: 'µm/s', cls: 'am', bar: Math.abs(S.vd) / V_DRIFT_PK },
      { k: 'CARRIER x', v: (S.xd * 1e9).toFixed(0), u: 'nm', cls: 'acc', bar: (S.xd / X_DRIFT_PK + 1) / 2 },
      { k: 'POWER', v: S.p.toFixed(0), u: `W · ${VA.toFixed(0)} mean`, cls: 'am', bar: S.p / (2 * VA) },
      { k: 'FIELD', v: sci(V_FIELD, 3), u: 'm/s · 0.66 c', cls: '' },
    ];
  },
};
