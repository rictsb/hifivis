import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
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
const F_MAINS = 50;                                  // Hz  (EN 50160, UK/EU)
const V_RMS = 230;                                   // V   (EN 50160 nominal)
const V_PK = V_RMS * Math.SQRT2;                     // 325.269 V
const I_RMS = 5.00;                                  // A — system draw, 1150 VA
const I_PK = I_RMS * Math.SQRT2;                     // 7.0711 A
const VA = V_RMS * I_RMS;                            // 1150 VA (unity PF assumed)

// ---- the lead: 3 × 2.5 mm², individually insulated, laid up on a filler -----
const A_MM2 = 2.5;                                   // mm²
const R_COND = Math.sqrt(A_MM2 / Math.PI) * 1e-3;    // 8.9206e-4 m
const D_COND = 2 * R_COND;                           // 1.7841 mm
const T_INS = 0.80e-3;                               // m, insulation wall
const R_INS_R = R_COND + T_INS;                      // 1.6921 mm
const PITCH_CORE = 6.80e-3;                          // m, lay-up triangle side
const LEAD_OD = 2 * (PITCH_CORE / Math.sqrt(3) + R_INS_R + 1.4e-3); // 14.04 mm
const L_LEAD = 2.00;                                 // m
const RHO_CU = 1.678e-8;                             // Ω·m at 20 °C
const R_LOOP = (RHO_CU * 2 * L_LEAD) / (A_MM2 * 1e-6); // 26.85 mΩ, out AND back
const V_DROP = I_RMS * R_LOOP;                       // 0.134 V
const P_LOSS = I_RMS * I_RMS * R_LOOP;               // 0.671 W

// ---- carriers ---------------------------------------------------------------
const V_DRIFT_PK = DSP.driftVelocity(I_PK, A_MM2);   // 2.0785e-4 m/s
const X_DRIFT_PK = DSP.driftDisplacement(V_DRIFT_PK, F_MAINS); // 6.616e-7 m

// Sommerfeld free-electron gas in copper. The classical equipartition figure
// √(3kT/m) = 1.15e5 m/s is in most textbooks and is wrong for a metal: the gas
// is degenerate, so the relevant speed is the Fermi velocity.
const HBAR = 1.054571817e-34;                        // J·s
const M_E = 9.1093837015e-31;                        // kg
const K_F = Math.cbrt(3 * Math.PI * Math.PI * DSP.N_CU);   // 1.3599e10 m⁻¹
const V_FERMI = (HBAR * K_F) / M_E;                  // 1.5743e6 m/s  (E_F = 7.05 eV)
const V_CLASSICAL = 1.1543e5;                        // √(3kT/m) at 293 K, for contrast
const SIGMA_CU = 5.96e7;                             // S/m at 20 °C (100 % IACS)
const TAU_COLL = (M_E * SIGMA_CU) / (DSP.N_CU * DSP.E_CHARGE ** 2); // 2.490e-14 s
const MFP = V_FERMI * TAU_COLL;                      // 3.920e-8 m  (39.2 nm)
const D_DIFF = (V_FERMI * MFP) / 3;                  // 0.02057 m²/s
const X_THERMAL = Math.sqrt((2 * D_DIFF) / F_MAINS); // 0.02869 m rms in one period
const N_COLL = 1 / F_MAINS / TAU_COLL;               // 8.03e11 collisions per cycle

// ---- field ------------------------------------------------------------------
const VF_CABLE = 0.66;                               // velocity factor, PVC flex
const V_FIELD = DSP.signalSpeed(VF_CABLE);           // 1.9786e8 m/s
const SPEED_RATIO = V_FIELD / V_DRIFT_PK;            // 9.52e11
const LAMBDA_MAINS = V_FIELD / F_MAINS;              // 3.957e6 m  (3957 km)

// ---- linear supply downstream ----------------------------------------------
const V_SEC = 40;                                    // V rms secondary
const V_SEC_PK = V_SEC * Math.SQRT2;                 // 56.569 V
const V_DIODE = 0.85;                                // V, soft-recovery Si at rating
const V_RECT_PK = V_SEC_PK - 2 * V_DIODE;            // 54.869 V (a bridge = 2 drops)
const C_RES = 20e-3;                                 // F  (2 × 10 mF)
const I_DC = 2.0;                                    // A
const F_RIPPLE = 2 * F_MAINS;                        // 100 Hz, full wave
const V_RIPPLE_EST = I_DC / (F_RIPPLE * C_RES);      // 1.000 V pk-pk

// Peak-detect model of the reservoir: it holds the rectified peak, then sags at
// dV/dt = I/C until the next peak overtakes it.
const RAIL_N = 400;
const RAIL = (() => {
  const T = 1 / F_MAINS;
  const steps = RAIL_N * 4;
  const dt = (4 * T) / steps;
  const buf = new Float64Array(steps);
  let v = V_RECT_PK;
  for (let i = 0; i < steps; i++) {
    const rect = Math.max(0, V_SEC_PK * Math.abs(Math.sin(TAU * F_MAINS * i * dt)) - 2 * V_DIODE);
    v = Math.max(rect, v - (I_DC / C_RES) * dt);
    buf[i] = v;
  }
  const out = new Float64Array(RAIL_N);
  let conducting = 0;
  for (let i = 0; i < RAIL_N; i++) {
    out[i] = buf[steps - RAIL_N + i];
    const rect = Math.max(0, V_SEC_PK * Math.abs(Math.sin(TAU * F_MAINS * i * dt)) - 2 * V_DIODE);
    if (Math.abs(rect - out[i]) < 1e-9) conducting++;
  }
  let mx = -1e9, mn = 1e9;
  for (const q of out) { if (q > mx) mx = q; if (q < mn) mn = q; }
  return { v: out, max: mx, min: mn, ripple: mx - mn, mean: (mx + mn) / 2, duty: conducting / RAIL_N };
})();
const V_RIPPLE_SIM = RAIL.ripple;                    // 0.942 V pk-pk
const COND_MS = (RAIL.duty * 1000) / F_MAINS / 2;    // 0.58 ms per half cycle
const I_CHARGE = I_DC / RAIL.duty;                   // 34 A mean while conducting

// ---- drawing scales — every one of these is printed on screen ---------------
const MAG = 25;                                      // ×, the copper and its jacket
const MAG_DRIFT = 75000;                             // ×, carrier displacement only
const MAG_EXTRA = MAG_DRIFT / MAG;                   // 3000× the copper's own scale
const MAG_LATTICE = 7.04e7;                          // ×, lattice inset
const A_CU = 0.36149e-9;                             // m, fcc lattice parameter
const D_NN = A_CU / Math.SQRT2;                      // 0.2556 nm, {100} square pitch
const FIELD_SLOW = 1e8;                              // field clock ÷ this, vs sim time
const TIME_SCALE = 0.02;                             // sim s per real s → 1 : 50
const FIELD_TOTAL_SLOW = FIELD_SLOW / TIME_SCALE;    // 1 : 5×10⁹ vs real time

const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUPS[c] || c).join('');
function sci(v, d = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(d)}×10${sup(e)}`;
}
const CYS = '#5cc0f2', AMS = '#f0b35a', GYS = '#8f98a4', RDS = '#f2795c', GRS = '#7fd6a2';

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

function card(w, h, opacity = 0.62) {
  const g = DIAG.diagramCard(w, h, { opacity, pad: 0.024 });
  g.userData.plate.userData._baseOp = opacity;
  return g;
}

function ringTrace(cx, cy, r, color, width = 1.2, n = 56, opts = {}) {
  const t = new DIAG.Trace(n, color, width, opts);
  t.write((i, u) => [cx + Math.cos(u * TAU) * r, cy + Math.sin(u * TAU) * r, opts.z || 0]);
  return t;
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

const LEAD_PTS = [
  [0.207, 0.1725, -3.522], [0.240, 0.166, -3.585], [0.300, 0.128, -3.622],
  [0.362, 0.066, -3.598], [0.404, 0.020, -3.520], [0.436, 0.014, -3.400],
  [0.470, 0.014, -3.180], [0.462, 0.014, -2.940], [0.404, 0.014, -2.700],
  [0.286, 0.015, -2.430], [0.128, 0.016, -2.190], [-0.086, 0.017, -2.010],
  [-0.330, 0.018, -1.925], [-0.600, 0.019, -1.895], [-0.880, 0.019, -1.912],
  [-1.160, 0.018, -1.980], [-1.430, 0.017, -2.100],
];

function buildLead() {
  const M = mats();
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(LEAD_PTS.map((p) => new THREE.Vector3(...p)));
  const jacket = M.plastic.clone();
  jacket.color.setHex(0x17191d);
  jacket.roughness = 0.44;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, LEAD_OD / 2, 14, false), jacket);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);

  const body = new THREE.Mesh(GEO.bevelBox(0.030, 0.023, 0.040, 0.0025, 4), M.plastic);
  body.position.set(0.207, 0.1725, -3.542);
  body.castShadow = true;
  g.add(body);
  const collar = new THREE.Mesh(GEO.bevelBox(0.034, 0.027, 0.006, 0.0015, 3), M.anodGrey);
  collar.position.set(0.207, 0.1725, -3.524);
  g.add(collar);

  for (const t of [0.055, 0.32, 0.62]) {
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const fr = new THREE.Mesh(GEO.bevelCyl(0.0092, 0.0092, 0.013, 18, 0.0008), M.anodGrey);
    fr.position.copy(p);
    fr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    fr.castShadow = true;
    g.add(fr);
  }

  // Instantaneous power p(t) = VI(1 − cos 2ωt): real, 100 Hz, never negative.
  const sheathMat = new THREE.MeshBasicMaterial({
    color: PAL.am, transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.BackSide,
  });
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, LEAD_OD * 0.92, 12, false), sheathMat);
  sheath.renderOrder = 12;
  g.add(sheath);

  g.userData.curve = curve;
  g.userData.sheath = sheathMat;
  return g;
}

// ===========================================================================
// OVERLAY — card A: the cable
// ===========================================================================

const A_W = 1.02, A_H = 1.14;
const XA0 = 0.115, XA1 = 0.885;                   // 30.8 mm of real cable
const R_CU = R_COND * MAG;                        // 0.02230
const R_INS = R_INS_R * MAG;                      // 0.04230
const PITCH = PITCH_CORE * MAG;                   // 0.17000
const Y_L = 0.895, Y_N = Y_L - PITCH, Y_E = Y_L - 2 * PITCH;   // 0.895 / 0.725 / 0.555
const Y_DIM = 1.055;                              // the ×25 comparison row
const Z_CORE = 0.055;
const N_CARR = 30;

function halfCyl(len, r, mat, seg) {
  const gm = new THREE.CylinderGeometry(r, r, len, seg, 1, true, Math.PI / 2, Math.PI);
  const m = new THREE.Mesh(gm, mat);
  m.rotation.z = -Math.PI / 2;
  return m;
}

function buildCableCard() {
  const root = new THREE.Group();
  root.position.set(-1.36 + A_W / 2, 0.100 + A_H / 2, -2.55);
  const g = new THREE.Group();
  g.position.set(-A_W / 2, -A_H / 2, 0);
  root.add(g);
  g.add(card(A_W, A_H, 0.93));

  const M = mats();
  // Everything in the section is drawn back-to-front by renderOrder with
  // depthWrite off, so the layers stack predictably however the card is tilted.
  const layer = (m, order) => {
    m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide;
    m.userData.order = order;
    return m;
  };
  // NOTE: a concave metal half-tube is a mirror. Keep it rough and dim or it
  // focuses the studio strip into a caustic that punches straight through bloom.
  const cuMat = layer(M.copper.clone(), 8);
  cuMat.color.setHex(0xb06a38);
  cuMat.roughness = 0.62;
  cuMat.metalness = 0.75;
  cuMat.envMapIntensity = 0.55;
  const cuE = cuMat.clone(); cuE.color.setHex(0x7d4b2b); cuE.envMapIntensity = 0.45;
  const insMat = layer(M.plastic.clone(), 6);
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
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], 0xe8b98c, 1.2, { opacity: 0.8, renderOrder: 11 }));
    }
    for (const dy of [R_INS, -R_INS]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], 0x5b636e, 1.0, { opacity: 0.65, renderOrder: 11 }));
    }
  }

  // ---- the closed loop, drawn unbroken ------------------------------------
  const XS = 0.048, XLD = 0.972, ZL = Z_CORE + 0.006;
  for (const [x, h] of [[XS, PITCH + 0.09], [XLD, PITCH + 0.09]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.050, h), new THREE.MeshBasicMaterial({
      color: 0x0f151c, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    }));
    b.position.set(x, (Y_L + Y_N) / 2, Z_CORE - 0.003);
    b.renderOrder = 9;
    b.userData._baseOp = 0.9;
    g.add(b);
    g.add(poly([[x - 0.025, (Y_L + Y_N) / 2 - h / 2, ZL], [x + 0.025, (Y_L + Y_N) / 2 - h / 2, ZL],
      [x + 0.025, (Y_L + Y_N) / 2 + h / 2, ZL], [x - 0.025, (Y_L + Y_N) / 2 + h / 2, ZL],
      [x - 0.025, (Y_L + Y_N) / 2 - h / 2, ZL]], 0x49525d, 1.0, { opacity: 0.85, renderOrder: 10 }));
  }
  g.add(poly([[XS, Y_L, ZL], [XA0, Y_L, ZL]], PAL.am, 2.2, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA1, Y_L, ZL], [XLD, Y_L, ZL], [XLD, Y_N, ZL], [XA1, Y_N, ZL]], PAL.am, 2.2, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA0, Y_N, ZL], [XS, Y_N, ZL], [XS, Y_L, ZL]], PAL.am, 2.2, { opacity: 0.9, renderOrder: 12 }));

  // earth: bonded at both ends, no current
  const eOpt = { opacity: 0.8, renderOrder: 12, dashed: true, dashSize: 0.011, gapSize: 0.009 };
  g.add(poly([[XA1, Y_E, ZL], [XLD, Y_E, ZL], [XLD, Y_N - 0.045, ZL]], PAL.gr, 1.7, eOpt));
  g.add(poly([[XA0, Y_E, ZL], [XS, Y_E, ZL], [XS, Y_E - 0.042, ZL]], PAL.gr, 1.7, eOpt));
  for (let i = 0; i < 3; i++) {
    const w = 0.034 - i * 0.010;
    g.add(poly([[XS - w / 2, Y_E - 0.042 - i * 0.009, ZL], [XS + w / 2, Y_E - 0.042 - i * 0.009, ZL]], PAL.gr, 1.8, { opacity: 0.8, renderOrder: 12 }));
  }

  // ---- current arrows: they reverse 100 times a second ---------------------
  const arrows = [];
  for (const c of cores) {
    if (c.sign === 0) continue;
    for (let i = 0; i < 4; i++) {
      const a = arrowHead(0.0135, PAL.am, 0.95);
      a.position.set(XA0 + len * (0.15 + i * 0.235), c.y, Z_CORE + 0.014);
      g.add(a);
      arrows.push({ m: a, sign: c.sign });
    }
  }

  // ---- E in the dielectric, alternating with S = E × H --------------------
  const gapMid = (Y_L + Y_N) / 2;
  const eLines = [], eHeads = [], sHeads = [];
  for (let i = 0; i < 6; i++) {
    const x = 0.345 + i * 0.098;
    const t = poly([[x, Y_L - R_INS, Z_CORE + 0.010], [x, gapMid, Z_CORE + 0.010], [x, Y_N + R_INS, Z_CORE + 0.010]],
      PAL.cy, 1.4, { opacity: 0.55, renderOrder: 12, dashed: true, dashSize: 0.008, gapSize: 0.006 });
    g.add(t); eLines.push(t);
    const h = arrowHead(0.0095, PAL.cy, 0.8);
    h.position.set(x, gapMid, Z_CORE + 0.012);
    g.add(h); eHeads.push(h);
  }
  for (let i = 0; i < 5; i++) {
    const a = arrowHead(0.0115, PAL.am, 0.55);
    a.position.set(0.394 + i * 0.098, gapMid, Z_CORE + 0.012);
    g.add(a); sHeads.push(a);
  }
  // fringing outside the pair
  for (const [yc, s] of [[Y_L + R_INS, 1], [Y_E - R_INS, -1]]) {
    for (let i = 0; i < 3; i++) {
      const x = XA0 + len * (0.24 + i * 0.26);
      const t = new DIAG.Trace(20, PAL.cy, 1.0, { opacity: 0.24, renderOrder: 12 });
      t.write((j, u) => {
        const a = Math.PI * u;
        return [x + Math.sin(a) * 0.062, yc + s * (1 - Math.cos(a)) * 0.026, Z_CORE + 0.006];
      });
      g.add(t); eLines.push(t);
    }
  }

  // ---- B notation: ⊙ out of the page, ⊗ into it ---------------------------
  // live current +x ⇒ B out of the page above it, into the page below it; the
  // neutral's opposite current makes the two add between the pair.
  const bGlyphs = [];
  for (const s of [
    { x: 0.235, y: Y_L + R_INS + 0.040, base: +1 },
    { x: 0.235, y: gapMid, base: -1 },
    { x: 0.800, y: gapMid, base: -1 },
    { x: 0.800, y: (Y_N + Y_E) / 2, base: +1 },
  ]) {
    const grp = new THREE.Group();
    grp.position.set(s.x, s.y, Z_CORE + 0.016);
    const r = 0.0095;
    grp.add(ringTrace(0, 0, r, PAL.cy, 1.2, 28, { opacity: 0.7, renderOrder: 13 }));
    const out = disc(0, 0, 0.0006, 0.0028, PAL.cy, 0.9, 12);
    const cross = new THREE.Group();
    cross.add(poly([[-r * 0.68, -r * 0.68, 0.0006], [r * 0.68, r * 0.68, 0.0006]], PAL.cy, 1.2, { opacity: 0.85, renderOrder: 13 }));
    cross.add(poly([[-r * 0.68, r * 0.68, 0.0006], [r * 0.68, -r * 0.68, 0.0006]], PAL.cy, 1.2, { opacity: 0.85, renderOrder: 13 }));
    grp.add(out, cross);
    g.add(grp);
    bGlyphs.push({ out, cross, base: s.base });
  }

  // ---- travelling energy front, in the dielectric only --------------------
  const frontGrp = new THREE.Group();
  // |S| is far larger between live and neutral than anywhere else, so the band
  // is weighted rather than uniform.
  const GAPH = (PITCH - 2 * R_INS) * 0.78;
  const frontBands = [];
  for (const [y, h, wgt] of [[gapMid, GAPH, 1.00], [(Y_N + Y_E) / 2, GAPH, 0.42],
    [Y_L + R_INS + 0.030, 0.032, 0.28], [Y_E - R_INS - 0.030, 0.032, 0.28]]) {
    const b = bandPlane(0.190, h, PAL.am, 0.19 * wgt);
    b.position.set(0, y, Z_CORE + 0.020);
    b.userData.wgt = 0.19 * wgt;
    frontGrp.add(b);
    frontBands.push(b);
    const e = poly([[0.064, y - h / 2, Z_CORE + 0.021], [0.064, y + h / 2, Z_CORE + 0.021]],
      PAL.am, 1.8, { opacity: 0.50 * wgt, renderOrder: 14 });
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
        x: XA0 + 0.070 + rnd(k) * (len - 0.140),
        y: c.y + (rnd(k * 3 + 1) - 0.5) * R_CU * 1.45,
        z: Z_CORE - R_CU * 0.5 + rnd(k * 5 + 2) * R_CU * 0.7,
        s: c.sign,
        f: [0.63 + rnd(k * 11) * 1.5, 0.71 + rnd(k * 13) * 1.6, 0.55 + rnd(k * 17) * 1.3],
        p: [rnd(k * 19) * 100, rnd(k * 23) * 100, rnd(k * 29) * 100],
        g: 0.6 + rnd(k * 31) * 0.4,
      });
    }
  });
  const swarm = new DIAG.Swarm(carriers.length, { color: PAL.cy, size: 0.0048, additive: true });
  g.add(swarm);

  // ---- dimensions ----------------------------------------------------------
  // (a) conductor diameter, vertical across the live core — true ×25
  const xd = 0.070;
  const dimD = DIAG.dimension([xd, Y_L - R_CU, Z_CORE + 0.004], [xd, Y_L + R_CU, Z_CORE + 0.004],
    { color: PAL.ink3, width: 1.3, head: 0.0085 });
  preFade(dimD, 0.9); g.add(dimD);
  for (const dy of [R_CU, -R_CU]) {
    g.add(poly([[xd - 0.014, Y_L + dy, Z_CORE + 0.004], [XA0 + 0.008, Y_L + dy, Z_CORE + 0.004]], PAL.ink3, 0.8, { opacity: 0.4, renderOrder: 11 }));
  }

  // (b) the same ×25 scale, laid out horizontally: ⌀ beside the carrier swing
  const yD = Y_DIM, xRef = 0.132;
  const tick = (x, half, col, w) => poly([[x, yD - half, Z_CORE + 0.004], [x, yD + half, Z_CORE + 0.004]], col, w, { opacity: 0.9, renderOrder: 13 });
  const dimRef = DIAG.dimension([xRef, yD, Z_CORE + 0.004], [xRef + D_COND * MAG, yD, Z_CORE + 0.004],
    { color: PAL.ink3, width: 1.3, head: 0.0085 });
  preFade(dimRef, 0.9); g.add(dimRef);
  g.add(tick(xRef, 0.013, PAL.ink3, 1.1));
  g.add(tick(xRef + D_COND * MAG, 0.013, PAL.ink3, 1.1));

  const xTrue = 0.250;
  g.add(tick(xTrue, 0.021, PAL.rd, 2.6));
  const dimTrue = DIAG.dimension([xTrue, yD, Z_CORE + 0.004], [xTrue + X_DRIFT_PK * MAG, yD, Z_CORE + 0.004],
    { color: PAL.rd, width: 1.6, head: 0.00003 });
  preFade(dimTrue, 0.95); g.add(dimTrue);

  const xShown = 0.380;
  const dimShown = DIAG.dimension([xShown, yD, Z_CORE + 0.004], [xShown + X_DRIFT_PK * MAG_DRIFT, yD, Z_CORE + 0.004],
    { color: PAL.cy, width: 1.7, head: 0.0090 });
  preFade(dimShown, 0.95); g.add(dimShown);
  g.add(tick(xShown, 0.013, PAL.cy, 1.2));
  g.add(tick(xShown + X_DRIFT_PK * MAG_DRIFT, 0.013, PAL.cy, 1.2));
  // ×800 blow-up bracket, red tick → cyan bar
  g.add(poly([[xTrue + 0.0015, yD - 0.017, Z_CORE + 0.004], [xShown, yD - 0.030, Z_CORE + 0.004],
    [xShown + X_DRIFT_PK * MAG_DRIFT, yD - 0.030, Z_CORE + 0.004], [xTrue + 0.0015, yD - 0.017, Z_CORE + 0.004]],
  PAL.ink3, 0.8, { opacity: 0.32, renderOrder: 11, dashed: true, dashSize: 0.007, gapSize: 0.006 }));

  // ---- lattice inset -------------------------------------------------------
  const insetC = [0.108, 0.170], insetR = 0.092;
  const bg = new THREE.Mesh(new THREE.CircleGeometry(insetR, 44), new THREE.MeshBasicMaterial({
    color: 0x0a0e13, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
  }));
  bg.position.set(insetC[0], insetC[1], Z_CORE - 0.002);
  bg.renderOrder = 9; bg.userData._baseOp = 0.9;
  g.add(bg);
  g.add(ringTrace(insetC[0], insetC[1], insetR, 0x5a636e, 1.3, 64, { opacity: 0.85, renderOrder: 11, z: Z_CORE }));

  const pitchL = D_NN * MAG_LATTICE;                 // 0.018 m
  const ionMat = M.copper.clone();
  ionMat.color.setHex(0x93552f); ionMat.roughness = 0.42;
  const cells = [];
  for (let ix = -5; ix <= 5; ix++) {
    for (let iy = -5; iy <= 5; iy++) {
      const px = ix * pitchL, py = iy * pitchL;
      if (Math.hypot(px, py) < insetR - 0.011) cells.push([px, py]);
    }
  }
  const ions = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0058, 10, 8), ionMat, cells.length);
  const im = new THREE.Matrix4();
  cells.forEach(([px, py], i) => { im.makeTranslation(insetC[0] + px, insetC[1] + py, Z_CORE); ions.setMatrixAt(i, im); });
  ions.castShadow = false;
  g.add(ions);

  const eSwarm = new DIAG.Swarm(18, { color: PAL.cy, size: 0.0046, additive: true });
  g.add(eSwarm);
  const eSeeds = [];
  for (let i = 0; i < 18; i++) {
    const k = i * 13 + 5;
    eSeeds.push({
      x: (rnd(k) - 0.5) * insetR * 1.4, y: (rnd(k * 3) - 0.5) * insetR * 1.4,
      f: [1.1 + rnd(k * 7) * 2.2, 1.3 + rnd(k * 11) * 2.4], p: [rnd(k * 17) * 100, rnd(k * 19) * 100],
    });
  }
  g.add(poly([[insetC[0] + insetR * 0.72, insetC[1] + insetR * 0.69, Z_CORE + 0.002],
    [0.246, Y_E - R_INS - 0.024, Z_CORE + 0.002], [0.246, Y_E - 0.006, Z_CORE + 0.002]],
  0x5a636e, 0.9, { opacity: 0.5, renderOrder: 11, dashed: true, dashSize: 0.007, gapSize: 0.006 }));
  g.add(disc(0.246, Y_E - 0.006, Z_CORE + 0.020, 0.0024, 0x9aa3ae, 0.85));

  // ---- true-ratio speed strip ---------------------------------------------
  const sp = new DIAG.Graph({
    w: 0.700, h: 0.064, xLog: true, xRange: [1e-5, 1e9], yRange: [0, 1],
    xTicks: [1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9],
    yTicks: [0, 1],
  });
  sp.position.set(0.252, 0.144, Z_CORE - 0.001);
  g.add(sp);
  for (const [v, col, w, dashed] of [
    [V_DRIFT_PK, PAL.cy, 3.2, false], [V_FERMI, 0x9aa3ae, 3.0, false],
    [V_FIELD, PAL.am, 3.4, false], [DSP.C_LIGHT, 0xeef0f4, 1.4, true],
  ]) sp.addMarker(v, { color: col, width: w, dashed, opacity: 1.0 });
  for (const [v, col] of [[V_DRIFT_PK, PAL.cy], [V_FERMI, 0x9aa3ae], [V_FIELD, PAL.am]]) {
    sp.add(disc(sp.x(v), 0.064, 0.003, 0.0042, col, 0.95, 12));
  }

  root.userData = { swarm, carriers, eSwarm, eSeeds, insetC, insetR, arrows, eLines, eHeads, sHeads, bGlyphs, frontGrp, len };
  return root;
}

// ===========================================================================
// OVERLAY — card B: mains to DC rail
// ===========================================================================

const B_W = 0.92, B_H = 1.14;
const GW = 0.720, GX = 0.100;

function psuChain(y) {
  const M = mats();
  const g = new THREE.Group();
  const cu = M.copper.clone(); cu.color.setHex(0xb2683a); cu.envMapIntensity = 1.0;
  const mw = M.magnetWire.clone(); mw.color.setHex(0x9a5730); mw.envMapIntensity = 0.85;
  const alu = M.alu.clone(); alu.color.setHex(0xcfd3d8); alu.envMapIntensity = 1.35;
  const blk = M.plastic.clone(); blk.color.setHex(0x1b1e23);
  const chr = M.chrome.clone();

  // a slightly denser plate behind the chain, so dark metal reads against the rack
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GW + 0.03, 0.098), new THREE.MeshBasicMaterial({
    color: 0x07090c, transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false,
  }));
  back.position.set(GX + GW / 2 - 0.015, y, 0.008);
  back.renderOrder = 6;
  back.userData._baseOp = 0.88;
  g.add(back);

  const tor = new THREE.Group();
  tor.position.set(GX + 0.050, y, 0.030);
  tor.add(new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0112, 12, 48), mw));
  const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0119, 8, 40), cu);
  t2.scale.set(1, 1, 0.4);
  tor.add(t2);
  GEO.shadowed(tor);
  g.add(tor);

  const br = new THREE.Group();
  br.position.set(GX + 0.230, y, 0.030);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const d = new THREE.Group();
    d.add(new THREE.Mesh(GEO.bevelCyl(0.0055, 0.0055, 0.020, 16, 0.0008), blk));
    const band = new THREE.Mesh(GEO.bevelCyl(0.0058, 0.0058, 0.003, 16, 0.0004), chr);
    band.position.y = 0.0068;
    d.add(band);
    d.position.set(Math.cos(a) * 0.029, Math.sin(a) * 0.029, 0);
    d.rotation.z = -a + Math.PI / 2;
    GEO.shadowed(d);
    br.add(d);
  }
  g.add(br);

  for (let i = 0; i < 2; i++) {
    const can = new THREE.Mesh(GEO.bevelCyl(0.0165, 0.0170, 0.060, 28, 0.0012), alu);
    can.position.set(GX + 0.408 + i * 0.044, y, 0.030);
    can.castShadow = true;
    g.add(can);
    const cap = new THREE.Mesh(GEO.bevelCyl(0.0150, 0.0150, 0.0018, 20, 0.0004), blk);
    cap.position.set(can.position.x, y + 0.0308, 0.030);
    g.add(cap);
    for (const rot of [0, Math.PI / 2]) {
      const sc = new THREE.Mesh(GEO.bevelBox(0.023, 0.0006, 0.0014, 0.0002, 2), chr);
      sc.position.set(can.position.x, y + 0.0318, 0.030);
      sc.rotation.y = rot;
      g.add(sc);
    }
  }

  for (const dy of [0.030, -0.030]) {
    const bar = new THREE.Mesh(GEO.bevelBox(0.130, 0.0035, 0.0035, 0.0008, 2), cu);
    bar.position.set(GX + 0.600, y + dy, 0.030);
    bar.castShadow = true;
    g.add(bar);
  }

  const wire = (pts) => poly(pts.map((p) => [p[0], p[1], 0.030]), 0x6f757e, 1.3, { opacity: 0.55, renderOrder: 12 });
  g.add(wire([[GX + 0.084, y + 0.012], [GX + 0.168, y + 0.012], [GX + 0.196, y + 0.030]]));
  g.add(wire([[GX + 0.084, y - 0.012], [GX + 0.168, y - 0.012], [GX + 0.196, y - 0.030]]));
  g.add(wire([[GX + 0.264, y + 0.030], [GX + 0.336, y + 0.030], [GX + 0.336, y + 0.036], [GX + 0.408, y + 0.036]]));
  g.add(wire([[GX + 0.264, y - 0.030], [GX + 0.336, y - 0.030], [GX + 0.336, y - 0.036], [GX + 0.452, y - 0.036]]));
  g.add(wire([[GX + 0.408, y + 0.036], [GX + 0.535, y + 0.036], [GX + 0.535, y + 0.030]]));
  g.add(wire([[GX + 0.452, y - 0.036], [GX + 0.535, y - 0.036], [GX + 0.535, y - 0.030]]));
  return g;
}

function buildPsuCard() {
  const root = new THREE.Group();
  root.position.set(0.260 + B_W / 2, 0.100 + B_H / 2, -2.55);
  const g = new THREE.Group();
  g.position.set(-B_W / 2, -B_H / 2, 0);
  root.add(g);
  g.add(card(B_W, B_H, 0.93));

  const T = 1 / F_MAINS;

  const gv = new DIAG.Graph({
    w: GW, h: 0.120, xRange: [0, T], yRange: [-360, 360],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [-360, -180, 0, 180, 360], zeroLine: 0,
  });
  gv.position.set(GX, 0.815, 0.002);
  g.add(gv);
  gv.addTrace((t) => V_PK * Math.sin(TAU * F_MAINS * t), { color: PAL.cy, width: 2.4, n: 260 });
  const dotV = gv.addDot(PAL.cy, 0.0062);

  const gi = new DIAG.Graph({
    w: GW, h: 0.110, xRange: [0, T], yRange: [-9, 9],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [-9, -4.5, 0, 4.5, 9],
  });
  gi.position.set(GX, 0.605, 0.002);
  g.add(gi);
  gi.addTrace((t) => I_PK * Math.sin(TAU * F_MAINS * t), { color: PAL.am, width: 2.4, n: 260 });
  gi.addTrace((t) => -I_PK * Math.sin(TAU * F_MAINS * t), { color: PAL.am, width: 1.6, n: 260, dashed: true, opacity: 0.85 });
  gi.addTrace(() => 0, { color: PAL.gr, width: 2.2, n: 2, opacity: 0.95 });
  const dotIL = gi.addDot(PAL.am, 0.0058);
  const dotIN = gi.addDot(PAL.am, 0.0042);

  const gd = new DIAG.Graph({
    w: GW, h: 0.130, xRange: [0, T], yRange: [-62, 62],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [-62, -31, 0, 31, 62], zeroLine: 0,
  });
  gd.position.set(GX, 0.365, 0.002);
  g.add(gd);
  gd.addTrace((t) => V_SEC_PK * Math.sin(TAU * F_MAINS * t), { color: 0x8f98a4, width: 1.3, n: 300, dashed: true, opacity: 0.45 });
  gd.addTrace((t) => Math.max(0, V_SEC_PK * Math.abs(Math.sin(TAU * F_MAINS * t)) - 2 * V_DIODE), { color: PAL.cy, width: 2.2, n: 400 });
  gd.addTrace((t, i) => RAIL.v[Math.min(RAIL_N - 1, i)], { color: PAL.am, width: 2.4, n: RAIL_N });

  const yLo = RAIL.min - 0.17, yHi = RAIL.max + 0.17;
  const VMAG = Math.round(((124) / 0.130) / ((yHi - yLo) / 0.110));
  const gr = new DIAG.Graph({
    w: GW, h: 0.110, xRange: [0, T], yRange: [yLo, yHi],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [yLo, RAIL.min, RAIL.mean, RAIL.max, yHi],
  });
  gr.position.set(GX, 0.150, 0.002);
  g.add(gr);
  gr.addTrace((t) => Math.max(yLo, V_SEC_PK * Math.abs(Math.sin(TAU * F_MAINS * t)) - 2 * V_DIODE), { color: PAL.cy, width: 1.7, n: 400, opacity: 0.55 });
  gr.addTrace((t, i) => RAIL.v[Math.min(RAIL_N - 1, i)], { color: PAL.am, width: 2.6, n: RAIL_N });
  const xr = gr.x(0.0136);
  const dimR = DIAG.dimension([xr, gr.y(RAIL.min), 0.006], [xr, gr.y(RAIL.max), 0.006], { color: PAL.ink3, width: 1.3, head: 0.0075 });
  preFade(dimR, 0.9);
  gr.add(dimR);
  for (const v of [RAIL.min, RAIL.max]) {
    gr.add(poly([[0, gr.y(v), 0.004], [GW, gr.y(v), 0.004]], PAL.ink3, 0.9,
      { opacity: 0.42, renderOrder: 11, dashed: true, dashSize: 0.007, gapSize: 0.006 }));
  }

  g.add(psuChain(1.075));

  root.userData = { dotV, dotIL, dotIN, VMAG };
  return root;
}

// ===========================================================================
// STAGE
// ===========================================================================

const S = { v: 0, i: 0, vd: 0, xd: 0 };

export default {
  id: 'power',
  title: 'Mains &amp; Conditioning',
  nav: 'Mains',
  kicker: 'Mains',
  standfirst: 'Nothing travels from the wall but a change in the field',
  shot: { position: [2.02, 1.44, 2.65], target: [0.33, 0.67, -2.55], fov: 27.5 },
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = new THREE.Group();
    this._cond = buildConditioner();
    this._lead = buildLead();
    hardware.add(this._cond, this._lead);

    const overlay = new THREE.Group();
    this._cA = buildCableCard();
    this._cB = buildPsuCard();
    overlay.add(this._cA, this._cB);

    // detail bracket on the real lead → the cutaway card
    const p = this._lead.userData.curve.getPointAt(0.845);
    const brk = new THREE.Group();
    brk.add(poly([
      [p.x - 0.052, p.y + 0.011, p.z], [p.x - 0.052, p.y + 0.030, p.z],
      [p.x + 0.052, p.y + 0.030, p.z], [p.x + 0.052, p.y + 0.011, p.z],
    ], 0x8b939d, 1.2, { opacity: 0.7, renderOrder: 11 }));
    for (const [x2, y2, z2] of [[-1.320, 0.140, -2.500], [-0.420, 0.140, -2.500]]) {
      brk.add(poly([[p.x + (x2 < p.x ? -0.052 : 0.052), p.y + 0.030, p.z], [x2, y2, z2]], 0x8b939d, 0.9,
        { opacity: 0.26, renderOrder: 11, dashed: true, dashSize: 0.013, gapSize: 0.011 }));
    }
    overlay.add(brk);

    // ---- labels ---------------------------------------------------------------
    const L = ctx.labels;
    const A = this._cA.children[0], B = this._cB.children[0];
    const anch = (parent, x, y, z = Z_CORE) => {
      const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o;
    };

    this._lLive = L.add(anch(A, 0.176, Y_L + R_INS, Z_CORE + 0.02), {
      kicker: 'Live', value: `+${I_PK.toFixed(2)} A`, cls: 'am', offset: [0, -17],
    });
    this._lNeut = L.add(anch(A, 0.192, Y_N + R_INS, Z_CORE + 0.02), {
      kicker: 'Neutral · back', value: `−${I_PK.toFixed(2)} A`, cls: 'am', offset: [0, -17],
    });
    L.add(anch(A, 0.192, Y_E + R_INS, Z_CORE + 0.02), {
      kicker: 'Protective earth', value: '0.00 A', offset: [0, -17],
    });
    L.add(anch(A, 0.740, Y_L + R_INS, Z_CORE + 0.02), {
      kicker: 'Energy front  S = E × H',
      text: `${sci(V_FIELD, 3)} m/s, in the dielectric · 1 : ${sci(FIELD_TOTAL_SLOW, 0)}`,
      cls: 'am', offset: [0, -20],
    });
    L.add(anch(A, 0.330, Y_DIM, Z_CORE + 0.02), {
      kicker: 'All three at the same ×25',
      text: `<span style="color:${GYS}">⌀ 1.784 mm</span> · <span style="color:${RDS}">true swing ±0.662 µm</span> · <span style="color:${CYS}">the same swing ×${MAG_DRIFT / 1000}k</span>`,
      offset: [0, -26],
    });
    L.add(anch(A, 0.108, 0.078, Z_CORE + 0.02), {
      kicker: 'Copper lattice ×7.0×10⁷',
      text: `fcc {100}, ${(D_NN * 1e9).toFixed(3)} nm · jitter indicative`, offset: [0, 22],
    });
    L.add(anch(A, 0.640, 0.208, Z_CORE + 0.02), {
      kicker: `True ratio · m/s, 10⁻⁵ → 10⁹ · field ÷ drift ${sci(SPEED_RATIO, 1)}`,
      text: `<span style="color:${CYS}">drift 2.08×10⁻⁴</span> · <span style="color:${GYS}">thermal 1.57×10⁶</span> · <span style="color:${AMS}">field 1.98×10⁸</span> · c`,
      offset: [0, -16],
    });
    L.add(anch(A, 0.079, (Y_L + Y_N) / 2, Z_CORE + 0.02), { kicker: 'Supply', offset: [0, 0] });
    L.add(anch(A, 0.941, (Y_L + Y_N) / 2, Z_CORE + 0.02), { kicker: 'Load', offset: [0, 0] });

    L.add(anch(B, GX + GW * 0.5, 1.118, 0.03), {
      kicker: 'Inside the box it feeds',
      text: `toroid → bridge → ${(C_RES * 1e3).toFixed(0)} mF → ± rail`, offset: [0, -14],
    });
    L.add(anch(B, GX + GW * 0.5, 0.775, 0.006), {
      kicker: 'One mains cycle · 20 ms',
      text: `V̂ ${V_PK.toFixed(1)} V from ${V_RMS} rms · Î ${I_PK.toFixed(2)} A`, offset: [0, 0],
    });
    L.add(anch(B, GX + GW * 0.5, 0.560, 0.006), {
      kicker: `Live and neutral, always equal and opposite · <span style="color:${GRS}">earth 0 A</span>`,
      text: `${V_SEC} V rms secondary → V̂ ${V_SEC_PK.toFixed(1)} − 2 Vf = ${V_RECT_PK.toFixed(1)} V`, offset: [0, 0],
    });
    this._lR = L.add(anch(B, GX + GW * 0.5, 0.320, 0.006), {
      kicker: `Reservoir ripple · vertical ×${this._cB.userData.VMAG}`,
      text: `I/(f·C) = ${V_RIPPLE_EST.toFixed(2)} V bound · simulated <b>${V_RIPPLE_SIM.toFixed(2)} V pk-pk</b>`, offset: [0, 0],
    });
    L.add(anch(this._lead, p.x, p.y + 0.034, p.z), {
      kicker: 'Mains lead', text: `3 × 2.5 mm² · ⌀${(LEAD_OD * 1e3).toFixed(1)} mm · ${L_LEAD.toFixed(1)} m`, offset: [60, 34],
    });

    return { hardware, overlay };
  },

  update(dt, t, ctx) {
    const th = TAU * F_MAINS * t;
    const sn = Math.sin(th);
    S.v = V_PK * sn;
    S.i = I_PK * sn;
    S.vd = V_DRIFT_PK * sn;
    S.xd = -X_DRIFT_PK * Math.cos(th);

    const nd = this._cond.userData.needles;
    nd[0].rotation.z = -sn * 0.60;                   // volts, ±325 V f.s.d.
    nd[1].rotation.z = -sn * (I_PK / 10) * 0.60;     // amps, ±10 A f.s.d.
    const pNorm = 0.5 * (1 - Math.cos(2 * th));      // p(t)/(2·V·I)
    this._lead.userData.sheath.opacity = 0.04 + 0.15 * pNorm;

    this._cA.lookAt(ctx.camera.position);
    this._cB.lookAt(ctx.camera.position);

    const U = this._cA.userData;
    const drift = X_DRIFT_PK * MAG_DRIFT * sn;
    const Tj = t * 3200;
    U.swarm.update((i) => {
      const c = U.carriers[i];
      const jx = Math.sin(Tj * c.f[0] + c.p[0]) * 0.0034 + Math.sin(Tj * c.f[2] * 1.7 + c.p[2]) * 0.0016;
      const jy = Math.sin(Tj * c.f[1] + c.p[1]) * 0.0030 + Math.cos(Tj * c.f[0] * 1.4 + c.p[1]) * 0.0013;
      const jz = Math.sin(Tj * c.f[2] + c.p[2]) * 0.0020;
      return {
        p: [c.x + jx + c.s * drift, c.y + jy, c.z + jz],
        s: c.g * (c.s === 0 ? 0.75 : 1.0),
        c: c.s === 0 ? 0x7fd6a2 : PAL.cy,
      };
    });
    U.eSwarm.update((i) => {
      const s = U.eSeeds[i];
      const jx = Math.sin(Tj * s.f[0] + s.p[0]) * 0.020 + Math.sin(Tj * s.f[1] * 2.1 + s.p[1]) * 0.010;
      const jy = Math.cos(Tj * s.f[1] + s.p[1]) * 0.020 + Math.sin(Tj * s.f[0] * 1.8 + s.p[0]) * 0.010;
      let px = s.x + jx, py = s.y + jy;
      const r = Math.hypot(px, py), lim = U.insetR - 0.010;
      if (r > lim) { px *= lim / r; py *= lim / r; }
      return { p: [U.insetC[0] + px, U.insetC[1] + py, Z_CORE + 0.010], s: 1, c: PAL.cy };
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
    for (const b of U.bGlyphs) {
      const out = (b.base > 0) === pos;
      b.out.visible = out;
      b.cross.visible = !out;
      b.out.userData._baseOp = 0.22 + 0.72 * amp;
      b.cross.traverse((c) => { if (c.isLine2) c._baseOpacity = 0.22 + 0.62 * amp; });
    }

    // the energy front runs on its own, stated clock
    const cutLen = (XA1 - XA0) / MAG;
    const u = (((V_FIELD * t) / FIELD_SLOW / cutLen) % 1 + 1) % 1;
    U.frontGrp.position.x = XA0 + u * (XA1 - XA0);
    const fade = Math.sin(Math.PI * Math.min(1, u / 0.99));
    for (const b of U.frontGrp.children) if (b.userData.wgt) b.userData._baseOp = b.userData.wgt * (0.28 + 0.72 * fade);

    const tc = ((t % (1 / F_MAINS)) + 1 / F_MAINS) % (1 / F_MAINS);
    const V = this._cB.userData;
    V.dotV.userData.setData(tc, V_PK * Math.sin(TAU * F_MAINS * tc));
    V.dotIL.userData.setData(tc, I_PK * Math.sin(TAU * F_MAINS * tc));
    V.dotIN.userData.setData(tc, -I_PK * Math.sin(TAU * F_MAINS * tc));

    this._lLive.setValue(`${S.i >= 0 ? '+' : ''}${S.i.toFixed(2)} A`);
    this._lNeut.setValue(`${-S.i >= 0 ? '+' : ''}${(-S.i).toFixed(2)} A`);
  },

  content() {
    return `
<h3>The circuit, both halves of it</h3>
<p>Two conductors leave the wall. <b>Live</b> carries current out to the load;
<b>neutral</b> carries the identical current back, at every instant, to the last
milliampere. At <span class="num">50 Hz</span> the pair exchange roles
<span class="num">100</span> times a second. A third conductor, <b>protective
earth</b>, is bonded to every chassis and carries no current at all unless
something has failed. There is no such thing as one-way current.</p>

<h3>What the electrons do</h3>
<p>Drift velocity follows straight from the definition of current:</p>
<div class="eq">v̂ = Î / (n·A·e)
  = ${I_PK.toFixed(3)} / (${sci(DSP.N_CU, 3)} · ${A_MM2}×10⁻⁶ · ${sci(DSP.E_CHARGE, 3)})
  = <span class="hl">${sci(V_DRIFT_PK, 2)} m/s</span>
x̂ = v̂ / ω = ${sci(V_DRIFT_PK, 2)} / ${(TAU * F_MAINS).toFixed(2)}
  = <span class="hl">${(X_DRIFT_PK * 1e6).toFixed(3)} µm</span>   <span class="c">peak, either side of home</span></div>
<p>A carrier shuffles two-thirds of a micrometre one way, then two-thirds of a
micrometre back, and stays there. That is already a minute bias on enormous
chaos: the electron gas in copper is degenerate, so carriers travel at the Fermi
velocity <span class="num">${sci(V_FERMI, 2)} m/s</span> — not the classical
<span class="num">√(3kT/m) = ${sci(V_CLASSICAL, 1)} m/s</span> most textbooks quote —
scattering every <span class="num">${(TAU_COLL * 1e15).toFixed(1)} fs</span> after
<span class="num">${(MFP * 1e9).toFixed(0)} nm</span>. That is
<span class="num">${sci(N_COLL, 1)}</span> collisions per mains cycle and a random
walk of <span class="num">√(2Dt) = ${(X_THERMAL * 1e3).toFixed(0)} mm</span>, about
<span class="num">${sci(X_THERMAL / X_DRIFT_PK, 1)}</span> times further than the drift
— in no particular direction.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Dots racing along the
wire from wall to amplifier. Nothing races. The energy travels in the field
<em>between and around</em> the conductors at
<span class="num">${sci(V_FIELD, 2)} m/s</span> — 0.66 c in PVC flex, about
<span class="num">${sci(SPEED_RATIO, 1)}</span> times the drift speed. That ratio is
why the two are drawn here at wildly different exaggerations, and both are stated on the
drawing: the copper at <span class="num">×${MAG}</span>, the carrier swing at
<span class="num">×${MAG_DRIFT.toLocaleString('en-GB')}</span> — a further
<span class="num">×${MAG_EXTRA}</span> on top of the copper's own scale — and the
field front on a clock <span class="num">${sci(FIELD_TOTAL_SLOW, 0)}</span> times
slower than real time.</p></div>

<h3>Field, not flow</h3>
<p>Between the conductors <b>E</b> points from live to neutral and <b>H</b> encircles
each core; the two H fields reinforce in the gap and oppose outside it. Poynting's
vector <span class="num">S = E × H</span> therefore points along the cable into the
load — and because <em>both</em> E and H reverse each half cycle, S does not. Energy
flows one way down an alternating cable, and the flux integrated over that space is
the whole <span class="num">V·I = ${VA} W</span> the system draws. The 50 Hz wave in this lead is
<span class="num">${(LAMBDA_MAINS / 1e3).toFixed(0)} km</span> long, so its
<span class="num">${L_LEAD.toFixed(1)} m</span> is
<span class="num">${sci(L_LEAD / LAMBDA_MAINS, 1)}</span> of a wavelength: every part
of it is in phase. The copper only guides that field and wastes
<span class="num">I²R = ${P_LOSS.toFixed(2)} W</span> in
<span class="num">${(R_LOOP * 1e3).toFixed(1)} mΩ</span> of out-and-back resistance,
dropping <span class="num">${V_DROP.toFixed(2)} V</span> of the
<span class="num">${V_RMS} V</span>.</p>

<h3>Making it DC</h3>
<p>A ${V_SEC} V rms secondary peaks at
<span class="num">${V_SEC_PK.toFixed(1)} V</span>; a bridge costs two diode drops,
leaving <span class="num">${V_RECT_PK.toFixed(1)} V</span>. The reservoir holds that
peak and sags at I/C:</p>
<div class="eq">V_ripple ≈ I / (f·C) = ${I_DC.toFixed(1)} / (${F_RIPPLE} · ${(C_RES * 1e3).toFixed(0)}×10⁻³)
  = <span class="hl">${V_RIPPLE_EST.toFixed(2)} V pk-pk</span>  <span class="c">constant-current bound</span>
peak-detect simulation      = <span class="hl">${V_RIPPLE_SIM.toFixed(2)} V pk-pk</span></div>
<p>The simulated figure is lower because the diodes conduct for
<span class="num">${COND_MS.toFixed(2)} ms</span> of each
<span class="num">10 ms</span> half cycle rather than not at all. Every coulomb goes
in during that window, so the mean current through the rectifier while it conducts
is <span class="num">${I_CHARGE.toFixed(0)} A</span> — which is why a linear supply
draws in violent, harmonic-rich bursts instead of a clean sine, and why what a
conditioner faces is not a well-behaved load.</p>

<div class="key"><span class="lab">The idea</span><p>The electrons in your speaker
cable at the moment the music starts were already there. Nothing travels from the
wall to the speaker except a change in the electromagnetic field.</p></div>`;
  },

  readouts() {
    return [
      { k: 'MAINS', v: (S.v >= 0 ? '+' : '') + S.v.toFixed(1), u: `V · ${V_RMS} rms`, cls: 'acc' },
      { k: 'CURRENT', v: (S.i >= 0 ? '+' : '') + S.i.toFixed(3), u: `A · ${I_RMS.toFixed(2)} rms`, cls: 'am' },
      { k: 'DRIFT v', v: (S.vd * 1e6).toFixed(1), u: 'µm/s', cls: 'am', bar: Math.abs(S.vd) / V_DRIFT_PK },
      { k: 'CARRIER x', v: (S.xd * 1e9).toFixed(0), u: 'nm', cls: 'acc', bar: (S.xd / X_DRIFT_PK + 1) / 2 },
      { k: 'FIELD', v: sci(V_FIELD, 3), u: 'm/s · 0.66 c', cls: 'am' },
      { k: 'RAIL RIPPLE', v: V_RIPPLE_SIM.toFixed(2), u: 'V pk-pk', cls: '' },
    ];
  },
};
