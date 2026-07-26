import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* ===========================================================================
   GAIN & CONTROL — the line preamplifier.

   Every number below is either a stated design premise (a component value the
   engineer chooses) or is derived from those premises in code. Nothing is
   chosen to look good, and every figure printed in the panel is interpolated
   from the same model that drives the picture.
   =========================================================================== */

// ---- physical constants ---------------------------------------------------
const K_B = 1.380649e-23;          // J/K
const T_K = 293.15;                // K (20 °C)
const BW = 20000;                  // Hz, 20 Hz–20 kHz measurement bandwidth
/** Johnson–Nyquist noise density over BW: e = √(4kTB·R). This is V per √Ω. */
const EK = Math.sqrt(4 * K_B * T_K * BW);      // 1.7994e-8 V/√Ω

// ---- design premises (declared, not derived) ------------------------------
const V_SRC = 2.000;               // V rms, DAC output at 0 dBFS
const SRC_DR = 120;                // dB, source dynamic range, unweighted/20 kHz
const GAIN_DB = 10.0;              // dB, fixed voltage gain of the line stage
const EN_DENS = 1.8e-9;            // V/√Hz, input-referred noise of the gain stage
const R_LAD = 10000;               // Ω, ladder image/termination impedance
const R_ACT = 50;                  // Ω, output-buffer source impedance
const R_LOAD = 47000;              // Ω, power-amp input impedance
const C_PER_M = 100e-12;           // F/m, interconnect capacitance
const CABLE_L = 3.0;               // m
const RAIL = 18.0;                 // V, gain-stage supply rails
const V_SAT = 2.0;                 // V, saturation loss at each rail
const R_PASSIVE = 10000;           // Ω, 40 kΩ passive pot at its midpoint
const CM_HUM = 0.020;              // V rms, chassis-to-chassis 50 Hz difference
const TOL_STD = 0.001;             // 0.1 % receiver resistors
const RELAY_W = 0.0124;            // m, real signal-relay case width

// ---- derived ---------------------------------------------------------------
const G = DSP.undB(GAIN_DB);                       // 3.1623
const E_SRC = V_SRC * DSP.undB(-SRC_DR);           // 2.000 µV
const E_NI = EN_DENS * Math.sqrt(BW);              // 0.2546 µV
const C_CABLE = C_PER_M * CABLE_L;                 // 300 pF
const V_CLIP = (RAIL - V_SAT) / Math.SQRT2;        // 11.314 V rms
const CLIP_DBV = DSP.dB(V_CLIP);                   // +21.07 dBV
const PEAK_DBV = DSP.dB(V_SRC * G);                // +16.02 dBV
const HEADROOM = CLIP_DBV - PEAK_DBV;              // 5.05 dB
const V_MAX_SRC = V_CLIP / G;                      // 3.578 V rms
const CMRR_STD = 1 / (2 * TOL_STD);                // 500  → 53.98 dB
const CM_RESID = CM_HUM / CMRR_STD;                // 40.0 µV

const parallel = (a, b) => (a <= 0 || b <= 0 ? 0 : (a * b) / (a + b));
const eR = (R) => EK * Math.sqrt(Math.max(R, 0));

/**
 * Six cascaded constant-input-impedance L-pads, binary-weighted in dB.
 * Each section is designed for a load of R_LAD (the next section's input
 * impedance, or the terminating resistor), so the sections cascade exactly:
 *     r = ratio,  R1 = (1−r)·R,  R2 = rR/(1−r)   with R = R_LAD
 * A relay per section either inserts it or shorts R1 and lifts R2.
 */
const WEIGHTS = [32, 16, 8, 4, 2, 1];
const SECTIONS = WEIGHTS.map((aDb) => {
  const r = DSP.undB(-aDb);
  return { aDb, r, R1: (1 - r) * R_LAD, R2: (r * R_LAD) / (1 - r) };
});

/** Ladder state for an integer attenuation of N dB (0…63). */
function ladderState(N) {
  let z = 0, ratio = 1;
  const on = [];
  for (const s of SECTIONS) {
    const engaged = (N & s.aDb) !== 0;
    on.push(engaged);
    if (engaged) { ratio *= s.r; z = parallel(s.R2, z + s.R1); }
  }
  // the terminating resistor sits across the output node
  return { on, ratio, zOut: parallel(z, R_LAD), N };
}

/** Ladder AFTER the gain block ("attenuate late") — this preamp, as built. */
function chainLate(N) {
  const L = ladderState(N);
  const s = [V_SRC], n = [E_SRC];
  s[1] = s[0] * G;                       n[1] = G * Math.hypot(n[0], E_NI);
  s[2] = s[1] * L.ratio;                 n[2] = Math.hypot(n[1] * L.ratio, eR(L.zOut));
  s[3] = s[2];                           n[3] = Math.hypot(n[2], eR(R_ACT));
  return { L, s, n, snr: DSP.dB(s[3] / n[3]) };
}

/** Ladder BEFORE the gain block ("attenuate early") — the comparison. */
function chainEarly(N) {
  const L = ladderState(N);
  const s = [V_SRC], n = [E_SRC];
  s[1] = s[0] * L.ratio;                 n[1] = Math.hypot(n[0] * L.ratio, eR(L.zOut));
  s[2] = s[1] * G;                       n[2] = G * Math.hypot(n[1], E_NI);
  s[3] = s[2];                           n[3] = Math.hypot(n[2], eR(R_ACT));
  return { L, s, n, snr: DSP.dB(s[3] / n[3]) };
}

/** S/N referred to the (attenuated) output, tabulated for every knob position. */
const SNR_LATE = new Float64Array(64);
const SNR_EARLY = new Float64Array(64);
for (let N = 0; N < 64; N++) { SNR_LATE[N] = chainLate(N).snr; SNR_EARLY[N] = chainEarly(N).snr; }
const MARGIN_20 = SNR_LATE[20] - SNR_EARLY[20];    // 8.84 dB
const MARGIN_63 = SNR_LATE[63] - SNR_EARLY[63];    // 10.17 dB

/**
 * Cable + load transfer function. The source drives C_CABLE shunted by R_LOAD,
 * so the −3 dB corner uses the parallel combination, not the source alone.
 */
function loadH(f, rs) {
  const w = DSP.TAU * f;
  const zc = [0, -1 / (w * C_CABLE)];
  const zp = DSP.cDiv(DSP.cMul([R_LOAD, 0], zc), DSP.cAdd([R_LOAD, 0], zc));
  return DSP.cDiv(zp, DSP.cAdd([rs, 0], zp));
}
const loadDb = (f, rs) => DSP.dB(DSP.cAbs(loadH(f, rs)));
const cornerHz = (rs) => 1 / (DSP.TAU * parallel(rs, R_LOAD) * C_CABLE);

const DIV_LOSS = DSP.dB(R_LOAD / (R_PASSIVE + R_LOAD));        // −1.68 dB
const HF_LOSS = loadDb(20000, R_PASSIVE) - DIV_LOSS;           // −0.40 dB

export const MODEL = {
  EK, G, E_SRC, E_NI, V_CLIP, CLIP_DBV, HEADROOM, C_CABLE, CMRR_STD,
  SECTIONS, ladderState, chainLate, chainEarly, loadDb, cornerHz,
  SNR_LATE, SNR_EARLY, R_PASSIVE, R_ACT,
};

/* ===========================================================================
   HARDWARE — rack bay 4. Thick brushed fascia, knurled volume knob, machined
   display window, discrete indicator LEDs, dense balanced/unbalanced rear.
   =========================================================================== */

const W = LAYOUT.rack.w - 0.03;      // 0.555
const D = LAYOUT.rack.d - 0.06;      // 0.440
const H = 0.098;
const FOOT = 0.007;
const ZF = D / 2;                    // front face, local

// 7-segment map
const SEGMAP = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
const LB = 0.0125, SW = 0.0026, SD = 0.0016, PITCH = 0.0198;

/** Build the two instanced meshes that make the dB readout. */
function segDisplay() {
  const g = new THREE.Group();
  const hMat = mats().meterGlow.clone(); hMat.color.setHex(0xffffff);
  const vMat = hMat.clone();
  const hGeo = GEO.bevelBox(LB, SW, SD, 0.0006, 2);
  const vGeo = GEO.bevelBox(SW, LB, SD, 0.0006, 2);
  const hPos = [], vPos = [], idx = { h: {}, v: {} };
  const put = (arr, key, x, y) => { idx[arr === hPos ? 'h' : 'v'][key] = arr.length; arr.push([x, y]); };
  // minus sign
  put(hPos, 'minus', -PITCH * 1.05, 0);
  for (let d = 0; d < 2; d++) {
    const x = (d - 0.5) * PITCH + PITCH * 0.42;
    put(hPos, d + 'a', x, LB); put(hPos, d + 'g', x, 0); put(hPos, d + 'd', x, -LB);
    put(vPos, d + 'f', x - LB / 2, LB / 2); put(vPos, d + 'b', x + LB / 2, LB / 2);
    put(vPos, d + 'e', x - LB / 2, -LB / 2); put(vPos, d + 'c', x + LB / 2, -LB / 2);
  }
  const mk = (geo, mat, pts) => {
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pts.length * 3), 3);
    const m = new THREE.Matrix4();
    pts.forEach(([x, y], i) => { m.makeTranslation(x, y, 0); im.setMatrixAt(i, m); });
    im.frustumCulled = false;
    return im;
  };
  const hIm = mk(hGeo, hMat, hPos), vIm = mk(vGeo, vMat, vPos);
  g.add(hIm, vIm);
  g.userData = { hIm, vIm, idx };
  return g;
}

const _c = new THREE.Color();
function setDisplay(disp, N) {
  const { hIm, vIm, idx } = disp.userData;
  const ON = 0x5cc0f2, OFF = 0x0d1418;
  const lit = new Set();
  if (N > 0) lit.add('minus');
  const s = String(Math.min(99, N)).padStart(2, '0');
  for (let d = 0; d < 2; d++) for (const c of SEGMAP[+s[d]]) lit.add(d + c);
  for (const [arr, im] of [['h', hIm], ['v', vIm]]) {
    for (const k in idx[arr]) {
      _c.setHex(lit.has(k) ? ON : OFF);
      im.setColorAt(idx[arr][k], _c);
    }
    im.instanceColor.needsUpdate = true;
  }
}

function buildPreamp() {
  const g = new THREE.Group();
  g.position.set(LAYOUT.rack.x, LAYOUT.rack.shelfY[4] + FOOT, LAYOUT.rack.z);
  const M = mats();

  // ---- chassis ------------------------------------------------------------
  const ch = GEO.chassis(W, H, D, {
    r: 0.0028, seg: 5, faceThick: 0.014, body: M.anodBlack, face: M.alu,
  });
  ch.position.y = H / 2;
  g.add(ch);

  // Two machined grooves rather than a polished trim strip: a mirror band on a
  // front panel blows out under a big soft key and destroys the brushed finish.
  const groove = M.anodBlack.clone(); groove.color.setHex(0x0e1013); groove.roughness = 0.55;
  for (const sy of [1, -1]) {
    const t = new THREE.Mesh(GEO.bevelBox(W - 0.030, 0.0030, 0.0060, 0.0009, 2), groove);
    t.position.set(0, H / 2 + sy * (H / 2 - 0.0092), ZF - 0.0022);
    t.receiveShadow = true;
    g.add(t);
  }

  // ---- display window -----------------------------------------------------
  const winW = 0.152, winH = 0.048;
  const bez = new THREE.Mesh(GEO.bevelBox(winW + 0.011, winH + 0.011, 0.0040, 0.0012, 3), M.anodGrey);
  bez.position.set(0.010, H / 2, ZF - 0.0012);
  bez.castShadow = bez.receiveShadow = true;
  g.add(bez);
  const glass = new THREE.Mesh(GEO.bevelBox(winW, winH, 0.0030, 0.0008, 2), M.glass);
  glass.position.set(0.010, H / 2, ZF - 0.0008);
  g.add(glass);

  const disp = segDisplay();
  disp.position.set(0.010 - 0.028, H / 2 + 0.006, ZF + 0.0017);
  g.add(disp);

  // level meter strip inside the window
  const trk = new THREE.Mesh(GEO.bevelBox(0.118, 0.0030, 0.0012, 0.0004, 2), M.plastic);
  trk.position.set(0.010, H / 2 - 0.0150, ZF + 0.0014);
  g.add(trk);
  const meter = new THREE.Mesh(GEO.bevelBox(0.118, 0.0030, 0.0014, 0.0004, 2), M.meterGlow);
  meter.geometry.translate(0.059, 0, 0);          // origin at the left end
  meter.position.set(0.010 - 0.059, H / 2 - 0.0150, ZF + 0.0018);
  g.add(meter);

  // ---- volume knob --------------------------------------------------------
  const KR = 0.032, KH = 0.020;
  const recess = new THREE.Mesh(GEO.bevelCyl(KR + 0.0055, KR + 0.0060, 0.005, 56, 0.0008), M.anodBlack);
  recess.rotation.x = Math.PI / 2;
  recess.position.set(0.200, H / 2, ZF - 0.0005);
  recess.castShadow = recess.receiveShadow = true;
  g.add(recess);

  // engraved index ticks around the recess — machining detail sells the scale
  const tickGeo = GEO.bevelBox(0.0009, 0.0042, 0.0010, 0.0002, 2);
  const ticks = new THREE.InstancedMesh(tickGeo, M.anodGrey, 21);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3(), rr = KR + 0.0086;
    for (let i = 0; i < 21; i++) {
      const a = THREE.MathUtils.degToRad(-120 + (i / 20) * 240);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
      p.set(0.200 + Math.sin(a) * rr, H / 2 + Math.cos(a) * rr, ZF + 0.0006);
      const s = i % 5 === 0 ? 1.5 : 1;
      sc.set(1, s, 1);
      m.compose(p, q, sc);
      ticks.setMatrixAt(i, m);
    }
  }
  ticks.castShadow = false;
  g.add(ticks);

  const knobPivot = new THREE.Group();
  knobPivot.rotation.x = -Math.PI / 2;
  knobPivot.position.set(0.200, H / 2, ZF + KH / 2 + 0.0010);
  const knob = GEO.knob(KR, KH, { flutes: 76, body: M.alu, mark: M.steel });
  knobPivot.add(knob);
  g.add(knobPivot);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(KR * 0.99, 0.0013, 10, 64), M.steel);
  collar.position.set(0.200, H / 2, ZF + KH + 0.0005);
  g.add(collar);

  // ---- input selector -----------------------------------------------------
  const selPivot = new THREE.Group();
  selPivot.rotation.x = -Math.PI / 2;
  selPivot.position.set(-0.196, H / 2 + 0.011, ZF + 0.008);
  const sel = GEO.knob(0.0195, 0.016, { flutes: 52, body: M.alu, mark: M.steel });
  sel.rotation.y = THREE.MathUtils.degToRad(-52);
  selPivot.add(sel);
  g.add(selPivot);

  // ---- indicator LEDs -----------------------------------------------------
  const ledGeo = new THREE.CircleGeometry(0.0018, 16);
  const ledMat = M.ledCyan.clone(); ledMat.color.setHex(0xffffff);
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, 5);
  leds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(15), 3);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    m4.makeTranslation(-0.196 + (i - 2) * 0.0125, H / 2 - 0.029, ZF + 0.0016);
    leds.setMatrixAt(i, m4);
    _c.setHex(i === 1 ? 0x63c8f5 : 0x121a20);
    leds.setColorAt(i, _c);
  }
  leds.frustumCulled = false;
  g.add(leds);
  const stby = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), M.ledAmber);
  stby.position.set(-0.253, H / 2 - 0.029, ZF + 0.0016);
  g.add(stby);

  // ---- fasteners ----------------------------------------------------------
  GEO.screwRow(g, [
    [-0.265, H / 2 + 0.0355], [0.265, H / 2 + 0.0355],
    [-0.265, H / 2 - 0.0355], [0.265, H / 2 - 0.0355],
  ], ZF + 0.0009, 0.0018);

  // ---- top: vents + feet --------------------------------------------------
  const vents = GEO.ventSlots(0.30, D * 0.52, 3, 12, { mat: M.plastic, sw: 0.0045, sd: 0.026 });
  vents.position.set(-0.06, H - 0.0012, -0.03);
  g.add(vents);
  const lidLine = new THREE.Mesh(GEO.bevelBox(W - 0.030, 0.0020, 0.0030, 0.0006, 2), M.alu);
  lidLine.position.set(0, H - 0.0008, ZF - 0.028);
  g.add(lidLine);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.0135, 0.0155, FOOT, 28, 0.0008), M.steel);
    f.position.set(sx * (W / 2 - 0.036), -FOOT / 2, sz * (D / 2 - 0.045));
    f.castShadow = true;
    g.add(f);
  }

  // ---- rear panel: 4 XLR + 8 RCA + IEC + ground post -----------------------
  const rear = new THREE.Group();
  rear.rotation.y = Math.PI;
  rear.position.z = -D / 2;
  const plate = new THREE.Mesh(GEO.bevelBox(W - 0.020, H - 0.014, 0.0035, 0.0008, 2), M.anodGrey);
  plate.position.set(0, H / 2, 0.0016);
  plate.castShadow = plate.receiveShadow = true;
  rear.add(plate);
  for (let i = 0; i < 4; i++) {
    const x = -0.205 + i * 0.052;
    const c = GEO.xlr();
    c.position.set(x, H / 2 + 0.014, 0.0030);
    rear.add(c);
  }
  for (let i = 0; i < 8; i++) {
    const x = -0.215 + (i % 4) * 0.030 + Math.floor(i / 4) * 0.140;
    const c = GEO.rcaJack(i % 2 ? 0x2b2f36 : 0xd94b3a);
    c.position.set(x, H / 2 - 0.026, 0.0030);
    rear.add(c);
  }
  const iec = GEO.iecInlet();
  iec.position.set(0.225, H / 2 + 0.006, 0.0020);
  rear.add(iec);
  const gnd = new THREE.Mesh(GEO.bevelCyl(0.0042, 0.0048, 0.009, 20, 0.0005), M.gold);
  gnd.rotation.x = Math.PI / 2;
  gnd.position.set(0.150, H / 2 - 0.028, 0.006);
  rear.add(gnd);
  g.add(rear);

  GEO.shadowed(ch);
  g.add(GEO.contactShadow(W * 1.35, D * 1.35, 0.55, 0.0016));

  g.userData = { knob, disp, meter };
  return g;
}

/* ===========================================================================
   FRAMING

   The clear stage is 960 x 840 px inside a 1600 x 1000 canvas, and the Director
   already offsets the principal point so the camera axis lands at its centre.
   What is left to get right is the SIZE and PLACEMENT of things inside that
   box, so the shot is specified in pixels and solved backwards for a camera.
   =========================================================================== */

const AZ = 0.40, EL = 0.058, FOV = 30;
const HALF_TAN = Math.tan((FOV * Math.PI) / 360);

const PX_PER_M = 670;                       // scale on the preamp's own plane
const HERO_PX = [165, 132];                 // where the preamp centre lands
const MPP_HERO = 1 / PX_PER_M;
const CAM_DIST = (500 * MPP_HERO) / HALF_TAN;             // 2.785 m
const DECK_DIST = CAM_DIST - 0.50;                        // card plane, nearer
const MPP_DECK = (DECK_DIST * HALF_TAN) / 500;

const DIRV = new THREE.Vector3(
  Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
const RIGHT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
const UPV = new THREE.Vector3().crossVectors(DIRV, RIGHT).normalize();

const PRE = new THREE.Vector3(LAYOUT.rack.x, LAYOUT.rack.shelfY[4] + FOOT + H / 2, LAYOUT.rack.z);
const AIM = PRE.clone()
  .addScaledVector(RIGHT, -HERO_PX[0] * MPP_HERO)
  .addScaledVector(UPV, -HERO_PX[1] * MPP_HERO);
const CAMP = AIM.clone().addScaledVector(DIRV, CAM_DIST);

/** World point that projects to (px, py) from the camera axis, on a given plane. */
function screenPoint(px, py, dist) {
  const m = (dist * HALF_TAN) / 500;
  return CAMP.clone().addScaledVector(DIRV, -dist)
    .addScaledVector(RIGHT, px * m).addScaledVector(UPV, py * m);
}

/* ===========================================================================
   OVERLAY — one card, two regions. The relay ladder that the knob actually
   drives, and what moving it does to signal-to-noise.
   =========================================================================== */

const CARD_PX = [330, 470];                 // one card, left of the hero
const CARD_AT = [-303, 55];                 // its centre, px from the axis
const CW = CARD_PX[0] * MPP_DECK;
const CH = CARD_PX[1] * MPP_DECK;
const P = (px) => px * MPP_DECK;            // card pixels → metres

/** Flat, unlit fill — out here the key light is glancing and shading dies. */
function flat(hex, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: hex, toneMapped: false, transparent: true, opacity, depthWrite: false,
  });
}

// ---- the exploded relay ladder --------------------------------------------
const BW_ = 0.232, BH_ = 0.094;             // board size in its own units
const SPITCH = 0.0320;
const RW = 0.0292, RH = 0.0248;             // drawn relay body
const BOARD_PX = 296;
const BOARD_SCALE = (BOARD_PX * MPP_DECK) / BW_;
const BOARD_MAG = (RW * BOARD_SCALE) / RELAY_W;           // ≈ 3.7 : 1

function buildBoard() {
  const g = new THREE.Group();
  const UNIT = new THREE.PlaneGeometry(1, 1);
  const mk = (hex, n, ro, op = 1) => {
    const im = new THREE.InstancedMesh(UNIT, flat(hex, op), n);
    im.frustumCulled = false; im.renderOrder = ro; g.add(im); return im;
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
  const put = (im, i, cx, cy, w, h, z) => {
    scl.set(w, h, 1); pos.set(cx, cy, z); m.compose(pos, q, scl); im.setMatrixAt(i, m);
  };

  const plate = mk(0x141b21, 1, 6);
  put(plate, 0, 0, 0, BW_, BH_, 0.0000);

  const relay = mk(0xffffff, 6, 7);
  relay.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
  const glint = mk(0x6b7784, 6, 8);
  const label = mk(0x1b2027, 6, 8);
  const pins = mk(0xb9975a, 24, 7);
  const resB = mk(0x8497a6, 13, 7);
  const resC = mk(0xcfd4da, 26, 8);

  const led = new THREE.InstancedMesh(new THREE.CircleGeometry(0.0024, 14), flat(0xffffff), 6);
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
  led.frustumCulled = false; led.renderOrder = 9;
  g.add(led);

  const outline = [];
  const box = (cx, cy, hw, hh, z) => outline.push(
    cx - hw, cy - hh, z, cx + hw, cy - hh, z, cx + hw, cy - hh, z, cx + hw, cy + hh, z,
    cx + hw, cy + hh, z, cx - hw, cy + hh, z, cx - hw, cy + hh, z, cx - hw, cy - hh, z,
  );

  const x0 = -0.006 - SPITCH * 2.5;
  const RY = 0.0125;
  for (let i = 0; i < 6; i++) {
    const x = x0 + i * SPITCH;
    put(relay, i, x, RY, RW, RH, 0.0010);
    put(glint, i, x, RY + RH / 2 - 0.0012, RW, 0.0024, 0.0014);
    put(label, i, x, RY + 0.0074, 0.0236, 0.0052, 0.0014);
    for (let k = 0; k < 4; k++) put(pins, i * 4 + k, x + (k - 1.5) * 0.0080, RY - RH / 2 - 0.0042, 0.0024, 0.0084, 0.0008);
    m.makeTranslation(x, RY - 0.0250, 0.0016); led.setMatrixAt(i, m);
    _c.setHex(0x101820); led.setColorAt(i, _c);
    _c.setHex(0x333c46); relay.setColorAt(i, _c);
    box(x, RY, RW / 2, RH / 2, 0.0018);
  }

  // R1 (series) above, R2 (shunt) below, one pair per section
  let ri = 0, ci = 0;
  const putRes = (x, y, w, h) => {
    put(resB, ri++, x, y, w, h, 0.0010);
    const half = (w + 0.0030) / 2;
    if (w > h) for (const sg of [-1, 1]) put(resC, ci++, x + sg * half, y, 0.0030, h, 0.0012);
    else for (const sg of [-1, 1]) put(resC, ci++, x, y + sg * ((h + 0.0030) / 2), w, 0.0030, 0.0012);
    box(x, y, (w > h ? half + 0.0018 : w / 2), (w > h ? h / 2 : (h + 0.0030) / 2 + 0.0018), 0.0018);
  };
  for (let i = 0; i < 6; i++) {
    putRes(x0 + i * SPITCH, -0.0228, 0.0212, 0.0104);
    putRes(x0 + i * SPITCH, -0.0368, 0.0212, 0.0104);
  }
  putRes(0.1010, -0.0110, 0.0104, 0.0250);                // terminating 10 kΩ, to ground
  box(0, 0, BW_ / 2, BH_ / 2, 0.0016);                    // board edge

  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
  const ol = new THREE.LineSegments(og, new THREE.LineBasicMaterial({
    color: 0x8a949f, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false,
  }));
  ol.renderOrder = 12;
  g.add(ol);

  // The live signal path (cyan) and the ground return rail (amber) — the loop
  // is closed: everything the ladder shunts away goes back along the return.
  const sig = new DIAG.Trace(64, PAL.cy, 2.4, { renderOrder: 16 });
  const ret = new DIAG.Trace(2, PAL.am, 1.8, { renderOrder: 16, opacity: 0.62 });
  ret.write((i) => [i === 0 ? -BW_ / 2 + 0.006 : BW_ / 2 - 0.006, -BH_ / 2 + 0.0035, 0.0020]);
  g.add(sig, ret);

  g.userData = { led, relay, sig, x0 };
  return g;
}

/** Redraw the live path: over an engaged section, straight past a bypass. */
function writeBoardPath(board, on) {
  const { sig, x0 } = board.userData;
  const yHi = 0.0392, yLo = 0.0300;
  const pts = [[-BW_ / 2 + 0.006, yLo]];
  for (let i = 0; i < 6; i++) {
    const x = x0 + i * SPITCH;
    if (on[i]) pts.push([x - 0.0150, yLo], [x - 0.0120, yHi], [x + 0.0120, yHi], [x + 0.0150, yLo]);
    else pts.push([x - 0.0150, yLo], [x + 0.0150, yLo]);
  }
  pts.push([BW_ / 2 - 0.006, yLo]);
  const n = 64;
  sig.write((i) => {
    const t = (i / (n - 1)) * (pts.length - 1);
    const a = Math.min(pts.length - 1, Math.floor(t)), b = Math.min(pts.length - 1, a + 1);
    const f = t - a;
    return [pts[a][0] + (pts[b][0] - pts[a][0]) * f, pts[a][1] + (pts[b][1] - pts[a][1]) * f, 0.0022];
  });
}

/**
 * The stage fader records each mesh's "base" opacity the first time it sees it —
 * but it is first called with o = 0, after the diagram card has already zeroed
 * its own plate. Seeding the value at build time, while every material is still
 * at full opacity, avoids latching a base of zero.
 */
function seedFade(root) {
  root.traverse((o) => {
    if ((o.isMesh || o.isSprite || o.isLine || o.isPoints) && o.material
        && o.userData._baseOp === undefined) o.userData._baseOp = o.material.opacity ?? 1;
  });
  return root;
}

/* ===========================================================================
   THE STAGE
   =========================================================================== */

const SWEEP = 26;             // seconds for one full down-and-up of the knob
const PH0 = 0.096;            // phase so the still frame lands mid-scale

const S = { N: 24, late: chainLate(24), lab: {} };

export default {
  id: 'preamp',
  title: 'Gain &amp; Control',
  nav: 'Preamp',
  kicker: 'Preamp',
  standfirst: 'Volume is not gain — it is a resistor ladder throwing voltage away.',
  shot: { position: CAMP.toArray(), target: AIM.toArray(), fov: FOV },
  timeScale: 1,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildPreamp();
    const overlay = new THREE.Group();

    // ---- the card ---------------------------------------------------------
    const deck = new THREE.Group();
    deck.position.copy(screenPoint(CARD_AT[0], CARD_AT[1], DECK_DIST));
    deck.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(RIGHT, UPV, DIRV));
    overlay.add(deck);

    const inner = new THREE.Group();          // origin = bottom-left of the card
    inner.position.set(-CW / 2, -CH / 2, 0);
    deck.add(inner);
    inner.add(DIAG.diagramCard(CW, CH, { pad: P(14), opacity: 0.88 }));

    // hairline between the two regions
    const rule = new DIAG.Trace(2, 0x39414c, 1.0, { opacity: 0.7, renderOrder: 6 });
    rule.write((i) => [i === 0 ? P(12) : P(318), P(258), 0.0004]);
    inner.add(rule);

    // ---- region 1: the relay ladder ---------------------------------------
    const board = buildBoard();
    board.scale.setScalar(BOARD_SCALE);
    board.position.set(P(165), P(348), 0.002);
    inner.add(board);

    // ---- region 2: S/N against knob position ------------------------------
    const gw = P(280), gh = P(176);
    const G_ = new DIAG.Graph({
      w: gw, h: gh, xRange: [0, 63], yRange: [55, 125],
      xTicks: [0, 16, 32, 48, 63], yTicks: [60, 80, 100, 120],
    });
    G_.position.set(P(34), P(40), 0.002);
    inner.add(G_);
    G_.addTrace((n) => SNR_EARLY[Math.round(n)],
      { color: PAL.cy, width: 1.5, n: 64, dashed: true, opacity: 0.75 });
    G_.addTrace((n) => SNR_LATE[Math.round(n)], { color: PAL.cy, width: 2.6, n: 64 });

    const mark = G_.addMarker(0, { color: PAL.ink3, width: 1.1, opacity: 0.55 });
    const gap = new DIAG.Trace(2, PAL.gr, 3.0, { renderOrder: 15 });
    G_.add(gap);
    const dotL = G_.addDot(PAL.cy, P(3.2));
    const dotE = G_.addDot(PAL.ink3, P(2.6));

    // ---- labels -----------------------------------------------------------
    const L = ctx.labels;
    const cardPt = (x, y) => inner.localToWorld(new THREE.Vector3(x, y, 0));
    const plotPt = (x, y) => G_.localToWorld(new THREE.Vector3(G_.x(x), G_.y(y), 0));

    S.lab.hw = L.add(
      new THREE.Vector3(PRE.x + 0.02, PRE.y, PRE.z + ZF + 0.03),
      {
        kicker: 'Line preamp · fixed gain, then the ladder',
        value: '−24 dB · 15.8 : 1 · 399 mV · 50 Ω',
        cls: 'acc', offset: [0, 52], priority: 3,
      });

    S.lab.board = L.add(cardPt(P(165), CH + P(6)), {
      kicker: `Relay ladder, drawn ×${BOARD_MAG.toFixed(1)} · 32·16·8·4·2·1 dB`,
      value: '011000 · Z 3.15 kΩ', cls: 'plain', occlude: false,
      offset: [0, -26], priority: 2,
    });

    S.lab.snr = L.add(cardPt(P(165), P(258)), {
      kicker: 'S/N re. output · 20 Hz-20 kHz unweighted',
      value: 'late 104.0 · early 94.2 dB',
      cls: 'plain', occlude: false, offset: [0, 15], priority: 2,
    });

    S.lab.margin = L.add(plotPt(30, 62), {
      kicker: 'Late ladder − early ladder', value: '+9.8 dB',
      cls: 'plain', occlude: false, offset: [0, 0], priority: 1,
    });

    S.lab.late = L.add(plotPt(52, SNR_LATE[52] + 5), {
      kicker: 'Ladder after the gain block', cls: 'plain', occlude: false,
      offset: [0, -8], priority: 0,
    });

    seedFade(overlay);
    Object.assign(S, { hw: hardware, board, G: G_, mark, gap, dotL, dotE });
    this._sync(S.N);
    return { hardware, overlay };
  },

  /** Push one knob position through the whole model and into the picture. */
  _sync(N) {
    const late = chainLate(N);
    S.N = N; S.late = late;
    setDisplay(S.hw.userData.disp, N);
    writeBoardPath(S.board, late.L.on);
    const { led, relay } = S.board.userData;
    for (let i = 0; i < 6; i++) {
      _c.setHex(late.L.on[i] ? 0x5cc0f2 : 0x101820); led.setColorAt(i, _c);
      _c.setHex(late.L.on[i] ? 0x2e5f7a : 0x333c46); relay.setColorAt(i, _c);
    }
    led.instanceColor.needsUpdate = true;
    relay.instanceColor.needsUpdate = true;

    const G_ = S.G, yl = SNR_LATE[N], ye = SNR_EARLY[N];
    S.mark.userData.setX(N);
    S.gap.write((i) => [G_.x(N), G_.y(i === 0 ? ye : yl), 0.0018]);
    S.dotL.userData.setData(N, yl);
    S.dotE.userData.setData(N, ye);

    const ratio = 1 / late.L.ratio;
    const rTxt = ratio < 100 ? ratio.toFixed(1) : Math.round(ratio);
    S.lab.hw.setValue(`−${N} dB · ${rTxt} : 1 · ${DSP.si(late.s[3], 3)}V · 50 Ω`);
    S.lab.board.setValue(`${late.L.on.map((b) => (b ? 1 : 0)).join('')} · Z ${DSP.si(late.L.zOut, 3)}Ω`);
    S.lab.snr.setValue(`late ${yl.toFixed(1)} · early ${ye.toFixed(1)} dB`);
    S.lab.margin.setValue(`+${(yl - ye).toFixed(2)} dB`);
  },

  update(dt, t) {
    // The knob is a human hand, so it runs in real time; nothing else here is
    // fast enough to need a scale.
    const Nf = 32 - 28 * Math.cos(DSP.TAU * (t / SWEEP + PH0));
    const N = DSP.clamp(Math.round(Nf), 0, 63);
    if (N !== S.N) this._sync(N);
    S.hw.userData.knob.rotation.y = THREE.MathUtils.degToRad(-30 - 300 * (63 - Nf) / 63);
    S.hw.userData.meter.scale.x = Math.max(0.001, (63 - Nf) / 63);
  },

  content() {
    const n = (x) => `<span class="num">${x}</span>`;
    return `
<div class="key"><span class="lab">The idea</span><p>Volume is subtraction. The gain is fixed; the knob only decides how much of it to throw away — and where in the chain to throw it.</p></div>

<h3>The knob is an attenuator</h3>
<p>Voltage gain is fixed at ${n('+10.0 dB')}. The control is six relay-switched L-pads, binary-weighted ${n('32/16/8/4/2/1 dB')}, each designed into a ${n('10 kΩ')} image impedance so the sections cascade without interacting.</p>
<div class="eq">a = 10^(−20/20) = <span class="hl">0.100</span>  <span class="c">10 : 1</span>
V = 2.000 × 3.162 × 0.100 = <span class="hl">0.632 V</span></div>

<h3>Late, not early</h3>
<p>The ladder sits <b>after</b> the gain block. That does not hold signal-to-noise still: referred to its own output it falls from ${n(SNR_LATE[0].toFixed(1) + ' dB')} at unity to ${n(SNR_LATE[52].toFixed(1) + ' dB')} at −52 dB, because the denominator is what moved. What it holds is the <b>margin</b> over the same ladder placed first.</p>
<div class="eq"><span class="c">S/N late − S/N early</span>
−20 dB: <span class="hl">${MARGIN_20.toFixed(2)} dB</span>   −63 dB: <span class="hl">${MARGIN_63.toFixed(2)} dB</span></div>
<p>Turned well down, the output noise is the ladder's own Johnson noise; put the ladder first and the block multiplies that by ${n('3.162')}, so the margin tends towards the gain itself. Headroom pays for it — the block sits at ${n(PEAK_DBV.toFixed(1) + ' dBV')} under a ${n(CLIP_DBV.toFixed(1) + ' dBV')} ceiling, ${n(HEADROOM.toFixed(2) + ' dB')} spare. A source above ${n(V_MAX_SRC.toFixed(2) + ' V rms')} forces the ladder to the front.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>"A passive control is more transparent." Its wiper impedance is not. A 40 kΩ pot at midpoint is a ${n('10 kΩ')} source; into 3 m of cable (${n('300 pF')}) loaded by 47 kΩ that is −3 dB at ${n((cornerHz(R_PASSIVE) / 1e3).toFixed(1) + ' kHz')} and ${n(HF_LOSS.toFixed(2) + ' dB')} at 20 kHz, on top of ${n(DIV_LOSS.toFixed(2) + ' dB')} lost in the divider. The ${n('50 Ω')} buffer here corners at ${n((cornerHz(R_ACT) / 1e6).toFixed(1) + ' MHz')}.</p></div>

<h3>Balanced out</h3>
<p>Pins 2 and 3 carry signal out and back — one closed loop. A four-resistor difference amplifier rejects what is common to both by at worst ${n('1/(2δ)')}: 0.1 % parts give ${n(DSP.dB(CMRR_STD).toFixed(1) + ' dB')}, so ${n('20 mV')} of chassis-to-chassis hum leaves ${n((CM_RESID * 1e6).toFixed(0) + ' µV')} — and only if the driving impedances match too. A few tens of ohms of imbalance in the source costs more than the resistors do.</p>`;
  },

  readouts() {
    const l = S.late, r = 1 / l.L.ratio;
    return [
      { k: 'Volume', v: `−${S.N}`, u: 'dB', cls: 'acc', bar: (63 - S.N) / 63 },
      { k: 'Divider', v: `${r < 100 ? r.toFixed(2) : Math.round(r)} : 1`, u: '' },
      { k: 'Output', v: DSP.si(l.s[3], 3), u: 'V rms' },
      { k: 'Output noise', v: (l.n[3] * 1e6).toFixed(2), u: 'µV' },
      { k: 'S/N re. out', v: SNR_LATE[S.N].toFixed(1), u: 'dB', bar: SNR_LATE[S.N] / 125 },
      { k: 'Late − early', v: `+${(SNR_LATE[S.N] - SNR_EARLY[S.N]).toFixed(2)}`, u: 'dB', cls: 'acc' },
    ];
  },
};
