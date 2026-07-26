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
   chosen to look good.
   =========================================================================== */

// ---- physical constants ---------------------------------------------------
const K_B = 1.380649e-23;          // J/K
const T_K = 293.15;                // K (20 °C)
const BW = 20000;                  // Hz, 20 Hz–20 kHz measurement bandwidth
/** Johnson–Nyquist noise density: e = √(4kTB·R). This is V per √Ω. */
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
const TOL_TRIM = 0.0001;           // 0.01 % laser-trimmed network
const A_CU = 0.20e-6;              // m², interconnect centre conductor (24 AWG)
const VF = 0.66;                   // cable velocity factor
const F_TONE = 1000;               // Hz, the test tone
const CU_SPACING = 255.6e-12;      // m, Cu nearest-neighbour distance (fcc, a=361.5 pm)

// ---- derived ---------------------------------------------------------------
const G = DSP.undB(GAIN_DB);                       // 3.1623
const E_SRC = V_SRC * DSP.undB(-SRC_DR);           // 2.000 µV
const E_NI = EN_DENS * Math.sqrt(BW);              // 0.2546 µV
const C_CABLE = C_PER_M * CABLE_L;                 // 300 pF
const V_CLIP = (RAIL - V_SAT) / Math.SQRT2;        // 11.314 V rms
const CLIP_DBV = DSP.dB(V_CLIP);                   // +21.07 dBV
const V_FIELD = DSP.signalSpeed(VF);               // 1.9787e8 m/s
const T_FLIGHT = CABLE_L / V_FIELD;                // 15.16 ns
const CMRR_STD = 1 / (2 * TOL_STD);                // 500  → 53.98 dB
const CMRR_TRIM = 1 / (2 * TOL_TRIM);              // 5000 → 73.98 dB

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
  return { L, s, n, snr: DSP.dB(s[3] / n[3]), peakNode: s[1] };
}

/** Ladder BEFORE the gain block ("attenuate early") — the comparison. */
function chainEarly(N) {
  const L = ladderState(N);
  const s = [V_SRC], n = [E_SRC];
  s[1] = s[0] * L.ratio;                 n[1] = Math.hypot(n[0] * L.ratio, eR(L.zOut));
  s[2] = s[1] * G;                       n[2] = G * Math.hypot(n[1], E_NI);
  s[3] = s[2];                           n[3] = Math.hypot(n[2], eR(R_ACT));
  return { L, s, n, snr: DSP.dB(s[3] / n[3]), peakNode: s[0] };
}

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

/** Electron drift for the current this preamp is delivering right now. */
function carriers(vOut) {
  const iRms = vOut / R_LOAD;
  const vd = DSP.driftVelocity(iRms, A_CU * 1e6);           // m/s rms
  const disp = DSP.driftDisplacement(vd * Math.SQRT2, F_TONE);
  return { iRms, vd, disp };
}

export const MODEL = {
  EK, G, E_SRC, E_NI, V_CLIP, CLIP_DBV, C_CABLE, T_FLIGHT, V_FIELD,
  CMRR_STD, CMRR_TRIM, SECTIONS, ladderState, chainLate, chainEarly,
  loadDb, cornerHz, carriers, R_PASSIVE, R_ACT, CM_HUM, CU_SPACING,
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
  const sh = GEO.contactShadow(W * 1.35, D * 1.35, 0.55, 0.0016);
  g.add(sh);

  g.userData = { knob, knobPivot, disp, meter, leds };
  return g;
}

/* ===========================================================================
   OVERLAY PART 1 — the relay ladder, exploded above the rack at ×2.5.
   =========================================================================== */

// Board drawn at 2.5 × life size, then the whole plate is scaled 1.8 × in the
// grid cell — hence the "×4.5" on its caption. A real relay case is 12.4 ×
// 9.9 × 7.2 mm; the drawn body is 31.0 × 24.8 mm before the plate scale.
const BW_ = 0.232, BH_ = 0.094;        // board size, metres, as drawn
const SPITCH = 0.0320;

/**
 * The exploded ladder.
 *
 * It is drawn flat rather than shaded: out here the only illumination is the
 * room's key light at a glancing angle over a dark environment, so a shaded
 * relay case renders as nothing at all. Flat fills, a hairline edge on every
 * part and one accent for the live path — the same language as the plots.
 */
function flat(hex, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: hex, toneMapped: false, transparent: true, opacity, depthWrite: false,
  });
}

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

  const plate = mk(0x16211c, 1, 6);
  put(plate, 0, 0, 0, BW_, BH_, 0.0000);

  const relay = mk(0xffffff, 6, 7);
  relay.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
  const glint = mk(0x6b7784, 6, 8);
  const label = mk(0x1b2027, 6, 8);
  const pins = mk(0xb9975a, 24, 7);
  const resB = mk(0x8497a6, 13, 7);
  const resC = mk(0xcfd4da, 26, 8);

  const ledMat = flat(0xffffff);
  const led = new THREE.InstancedMesh(new THREE.CircleGeometry(0.0024, 14), ledMat, 6);
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
  led.frustumCulled = false; led.renderOrder = 9;
  g.add(led);

  const outline = [];
  const box = (cx, cy, hw, hh, z) => outline.push(
    cx - hw, cy - hh, z, cx + hw, cy - hh, z, cx + hw, cy - hh, z, cx + hw, cy + hh, z,
    cx + hw, cy + hh, z, cx - hw, cy + hh, z, cx - hw, cy + hh, z, cx - hw, cy - hh, z,
  );

  const x0 = -0.006 - SPITCH * 2.5;
  const RY = 0.0125, RW = 0.0292, RH = 0.0248;
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
    color: 0x8a949f, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false,
  }));
  ol.renderOrder = 12;
  g.add(ol);

  // live signal path (cyan) and the ground return rail (amber): a closed loop
  const sig = new DIAG.Trace(64, PAL.cy, 2.4, { renderOrder: 16 });
  const ret = new DIAG.Trace(2, PAL.am, 1.8, { renderOrder: 16, opacity: 0.7 });
  ret.write((i) => [i === 0 ? -BW_ / 2 + 0.006 : BW_ / 2 - 0.006, -BH_ / 2 + 0.0035, 0.0020]);
  g.add(sig, ret);

  g.userData = { led, relay, sig, x0 };
  return g;
}

/** Redraw the ladder's live signal path: over an engaged section, under a bypass. */
function writeBoardPath(board, on) {
  const { sig, x0 } = board.userData;
  const yHi = 0.0392, yLo = 0.0300;
  const pts = [[-BW_ / 2 + 0.006, yLo]];
  for (let i = 0; i < 6; i++) {
    const x = x0 + i * SPITCH;
    if (on[i]) {
      pts.push([x - 0.0150, yLo], [x - 0.0120, yHi], [x + 0.0120, yHi], [x + 0.0150, yLo]);
    } else {
      pts.push([x - 0.0150, yLo], [x + 0.0150, yLo]);
    }
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

/* ===========================================================================
   OVERLAY PART 2 — the three explanatory cards.
   =========================================================================== */

const CAM_ANCHOR = new THREE.Vector3(0.910, 1.466, -0.459);

/**
 * A 2 × 2 plate grid in the clear volume left of and above the rack. The four
 * plates share one orientation — billboarding each separately splays them and
 * eats the gutters.
 */
const CELL_W = 0.46, CELL_H = 0.26;
const GRID = { x: -0.80, y: 1.26, gx: 0.075, gy: 0.115, z: -2.75 };
const DECK = new THREE.Group();
DECK.position.set(GRID.x, GRID.y, GRID.z);
DECK.lookAt(CAM_ANCHOR);
const cellPos = (col, row) => [
  (col - 0.5) * (CELL_W + GRID.gx),
  (0.5 - row) * (CELL_H + GRID.gy),
  0,
];

/** An oriented card whose local (0,0) is the bottom-left of the plot area. */
function card(w, h, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  DECK.add(g);
  const inner = new THREE.Group();
  inner.position.set(-w / 2, -h / 2, 0);
  g.add(inner);
  inner.add(DIAG.diagramCard(w, h, { pad: 0.024, opacity: 0.82 }));
  g.userData.inner = inner;
  return g;
}
/**
 * The stage fader records each mesh's "base" opacity the first time it sees it —
 * but it is first called with o = 0, after the diagram card has already zeroed
 * its own plate, and a material shared by two meshes is captured twice. Both
 * cases latch a base of 0 and the mesh never comes back. Seeding the value at
 * build time, while every material is still at full opacity, avoids it.
 */
function seedFade(root) {
  root.traverse((o) => {
    if ((o.isMesh || o.isSprite || o.isLine || o.isPoints) && o.material
        && o.userData._baseOp === undefined) o.userData._baseOp = o.material.opacity ?? 1;
  });
  return root;
}

/** World position of a point given in a card's local plot coordinates. */
const cardPt = (c, x, y, z = 0) => c.userData.inner.localToWorld(new THREE.Vector3(x, y, z));

// ---------------------------------------------------------------- level card
function buildLevelCard() {
  const w = CELL_W, h = CELL_H;
  const c = card(w, h, ...cellPos(0, 0));
  const G_ = new DIAG.Graph({
    w, h, xRange: [0, 4], yRange: [-130, 30],
    xTicks: [0, 1, 2, 3, 4], yTicks: [-130, -90, -50, -10, 30],
  });
  c.userData.inner.add(G_);

  const mk = (col, dash, wid) => {
    const t = new DIAG.Trace(8, col, wid, { dashed: dash, dashSize: 0.009, gapSize: 0.007, renderOrder: 13 });
    G_.add(t); return t;
  };
  const sigL = mk(PAL.cy, false, 2.6), noiL = mk(PAL.am, false, 2.2);
  const sigE = mk(PAL.cy, true, 1.6), noiE = mk(PAL.am, true, 1.4);

  const ceil = new DIAG.Trace(2, PAL.ink3, 1.3, { dashed: true, dashSize: 0.012, gapSize: 0.009, opacity: 0.8, renderOrder: 12 });
  ceil.write((i) => [i === 0 ? 0 : w, G_.y(CLIP_DBV), 0.0006]);
  G_.add(ceil);

  const gap = new DIAG.Trace(2, PAL.gr, 3.0, { renderOrder: 14 });
  G_.add(gap);

  c.userData.G = G_;
  c.userData.tr = { sigL, noiL, sigE, noiE, gap };
  return c;
}

function writeLevel(c, late, early) {
  const G_ = c.userData.G, { sigL, noiL, sigE, noiE, gap } = c.userData.tr;
  const yr = G_.o.yRange;
  const step = (t, arr) => t.write((i) => {
    const k = i >> 1, edge = i & 1;
    const v = DSP.clamp(DSP.dB(arr[k]), yr[0] + 1, yr[1] - 1);
    return [G_.x(k + (edge ? 0.92 : 0.08)), G_.y(v), 0.0012];
  });
  step(sigL, late.s); step(noiL, late.n);
  step(sigE, early.s); step(noiE, early.n);
  const X = G_.x(3.5);
  const ys = G_.y(DSP.clamp(DSP.dB(late.s[3]), yr[0] + 1, yr[1] - 1));
  const yn = G_.y(DSP.clamp(DSP.dB(late.n[3]), yr[0] + 1, yr[1] - 1));
  gap.write((i) => [X, i === 0 ? yn : ys, 0.0016]);
}

// -------------------------------------------------------------- loading card
function buildLoadCard() {
  const w = CELL_W, h = CELL_H;
  const c = card(w, h, ...cellPos(1, 0));
  const G_ = new DIAG.Graph({
    w, h, xLog: true, xRange: [20, 2e7], yRange: [-12, 2],
    yTicks: [-12, -9, -6, -3, 0], zeroLine: 0,
  });
  c.userData.inner.add(G_);
  G_.addTrace((f) => loadDb(f, R_PASSIVE), { color: PAL.rd, width: 2.2, n: 300 });
  G_.addTrace((f) => loadDb(f, R_ACT), { color: PAL.cy, width: 2.6, n: 300 });
  G_.addMarker(20000, { color: PAL.ink3, width: 1.2, opacity: 0.6 });
  const dA = G_.addDot(PAL.cy, 0.0048); dA.userData.setData(20000, loadDb(20000, R_ACT));
  const dP = G_.addDot(PAL.rd, 0.0048); dP.userData.setData(20000, loadDb(20000, R_PASSIVE));
  c.userData.G = G_;
  return c;
}

// ---------------------------------------------------------- interconnect card
const CBL = { x0: 0.078, x1: 0.378, yH: 0.186, yC: 0.118, yS: 0.084 };
const CBL_SCALE = (CBL.x1 - CBL.x0) / CABLE_L;      // 0.300 m for 3 m → 1 : 10
const CARRIER_MAG = 2e10;
const N_CARRY = 17;

function buildCableCard() {
  const w = CELL_W, h = CELL_H;
  const c = card(w, h, ...cellPos(0, 1));
  const inner = c.userData.inner;
  const M = { block: flat(0x2b333c) };
  const xD = CBL.x0 - 0.030, xR = CBL.x1 + 0.030;   // driver / receiver terminals
  const yMid = (CBL.yH + CBL.yC) / 2;

  for (const x of [xD - 0.018, xR + 0.018]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.104), M.block);
    b.position.set(x, yMid, 0.004);
    b.renderOrder = 6;
    inner.add(b);
    const o = new DIAG.Trace(5, PAL.ink3, 1.3, { renderOrder: 14, opacity: 0.85 });
    const hw = 0.018, hh = 0.052;
    o.write((i) => [x + [-hw, hw, hw, -hw, -hw][i], yMid + [-hh, -hh, hh, hh, -hh][i], 0.009]);
    inner.add(o);
  }

  // A closed loop: out along pin 2, back along pin 3. Both legs are drawn,
  // and they are joined at the source and at the receiver.
  const P = [[xD, CBL.yC], [xD, CBL.yH], [xR, CBL.yH], [xR, CBL.yC], [xD, CBL.yC]];
  const loop = new DIAG.Trace(5, PAL.cy, 2.6, { renderOrder: 13 });
  loop.write((i) => [P[i][0], P[i][1], 0.001]);
  inner.add(loop);

  // pin 1 / shield: bonded at one end only, so it carries no signal return
  const Sh = [[xD, CBL.yS], [xR, CBL.yS]];
  const shield = new DIAG.Trace(2, PAL.ink3, 1.9,
    { renderOrder: 12, opacity: 0.8, dashed: true, dashSize: 0.010, gapSize: 0.007 });
  shield.write((i) => [Sh[i][0], Sh[i][1], 0.001]);
  inner.add(shield);
  const bond = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 12),
    new THREE.MeshBasicMaterial({ color: PAL.ink3, toneMapped: false, transparent: true }));
  bond.position.set(xD, CBL.yS, 0.002);
  inner.add(bond);

  // charge carriers — they oscillate about a fixed point, in antiphase on the
  // two legs. Magnified; see the label.
  const swarm = new DIAG.Swarm(N_CARRY * 2, { color: PAL.am, size: 0.0030, additive: false });
  inner.add(swarm);

  // instantaneous current direction, one arrow per leg, opposite by definition
  const arrowMat = new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true });
  const arrows = [CBL.yH, CBL.yC].map((y) => {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.0062, 0.0150, 12), arrowMat);
    a.position.set((CBL.x0 + CBL.x1) / 2, y, 0.003);
    inner.add(a);
    return a;
  });

  // the field lives between the conductors — that is what propagates
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(0.005, CBL.yH - CBL.yC),
    new THREE.MeshBasicMaterial({ color: PAL.cy, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
  );
  front.position.set(CBL.x0, yMid, 0.002);
  front.renderOrder = 15;
  inner.add(front);
  const halo = DIAG.glow(PAL.cy, 0.042, 0.40);
  halo.position.copy(front.position);
  inner.add(halo);

  c.userData.swarm = swarm;
  c.userData.front = front;
  c.userData.halo = halo;
  c.userData.arrows = arrows;
  return c;
}

/* ===========================================================================
   THE STAGE
   =========================================================================== */

const SWEEP = 0.072;          // simulated seconds for one down-and-up of the knob
const FRONT_CYCLE = 0.0042;   // simulated seconds per wavefront launch
const FRONT_RUN = 0.0028;     // of which the front is in flight
const FRONT_RATIO = (FRONT_RUN / 0.002) / T_FLIGHT;   // real-time slow-down

const S = { N: 20, late: chainLate(20), early: chainEarly(20), lab: {} };

export default {
  id: 'preamp',
  title: 'Gain &amp; Control',
  nav: 'Preamp',
  kicker: 'Preamp',
  standfirst: 'Volume is not gain — it is a resistor ladder throwing voltage away.',
  shot: { position: [0.910, 1.466, -0.459], target: [-0.28, 1.06, -2.90], fov: 32 },
  timeScale: 0.002,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildPreamp();
    const overlay = new THREE.Group();

    const level = buildLevelCard();
    const load = buildLoadCard();
    const cable = buildCableCard();

    // the exploded ladder occupies the fourth plate of the grid
    const boardCell = card(CELL_W, CELL_H, ...cellPos(1, 1));
    const board = buildBoard();
    board.scale.setScalar(1.8);                    // drawn ×4.5 life size
    board.position.set(CELL_W / 2, CELL_H * 0.52, 0.006);
    boardCell.userData.inner.add(board);
    overlay.add(DECK);

    // leader from the knob up to the plate that explains it
    const knobW = new THREE.Vector3(0.200, LAYOUT.rack.shelfY[4] + FOOT + H / 2, LAYOUT.rack.z + ZF + 0.03);
    const bEnd = cardPt(boardCell, CELL_W + 0.024, 0.02);
    const lead = new DIAG.Trace(28, PAL.cy, 1.3,
      { opacity: 0.4, renderOrder: 11, dashed: true, dashSize: 0.012, gapSize: 0.010 });
    lead.write((i, t) => [
      knobW.x + (bEnd.x - knobW.x) * t,
      knobW.y + (bEnd.y - knobW.y) * t + Math.sin(Math.PI * t) * 0.030,
      knobW.z + (bEnd.z - knobW.z) * t,
    ]);
    overlay.add(lead);

    // ---- labels -------------------------------------------------------------
    const L = ctx.labels;
    const sup = (x) => x.toExponential(1).replace(/e\+?(-?)(\d+)/, (_, sg, d) =>
      '×10' + (sg ? '⁻' : '') + d.split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join(''));
    const top = (c) => cardPt(c, CELL_W / 2, CELL_H + 0.028);

    S.lab.vol = L.add(new THREE.Vector3(-0.262, LAYOUT.rack.shelfY[4] + FOOT + H / 2, LAYOUT.rack.z + ZF + 0.02),
      { kicker: 'Line preamp · gain is fixed after the ladder', value: '−20 dB · 10.0 : 1 · 0.632 V · 50 Ω', cls: 'acc', offset: [-124, 0] });

    S.lab.board = L.add(cardPtV(board, 0, BH_ / 2 + 0.020),
      { kicker: 'Relay ladder, drawn ×4.5 · 32·16·8·4·2·1 dB', value: '010100 · Z 2.86 kΩ', offset: [0, -16] });

    S.lab.lvl = L.add(top(level),
      { kicker: 'Gain staging · dBV · ── late  ╌╌ early', value: 'S/N 114.7 / 105.9 dB', cls: 'acc', offset: [0, -14] });
    S.lab.ceil = L.add(cardPt(level, 0.405, level.userData.G.y(CLIP_DBV)),
      { kicker: 'Clip ceiling', value: '+21.1 dBV', offset: [-38, 20] });

    S.lab.load = L.add(top(load),
      { kicker: 'Cable load · 20 Hz – 20 MHz · 3 m, 300 pF, 47 kΩ', value: '50 Ω source: −3 dB at 10.6 MHz', cls: 'acc', offset: [0, -14] });
    S.lab.f20k = L.add(cardPt(load, load.userData.G.x(20000), 0.018),
      { kicker: '20 kHz', offset: [0, 0] });
    S.lab.pass = L.add(cardPt(load, 0.125, load.userData.G.y(-5.5)),
      { kicker: 'Passive 10 kΩ pot', value: '−3 dB at 64.3 kHz', cls: 'am', offset: [0, 8] });

    S.lab.cable = L.add(top(cable),
      { kicker: 'Balanced pair 1 : 10 · out pin 2, back pin 3', value: 'CMRR 54.0 dB → 40 µV residual', cls: 'acc', offset: [0, -14] });
    S.lab.drift = L.add(cardPt(cable, CELL_W / 2, 0.048),
      { kicker: `Field front 1 : ${sup(FRONT_RATIO)} · carriers ×2×10¹⁰`, value: 'field 15.2 ns · swing 1.11 pm', cls: 'am', offset: [0, 0] });

    seedFade(overlay);
    S.hw = hardware; S.board = board; S.level = level; S.load = load; S.cable = cable;
    setDisplay(hardware.userData.disp, S.N);
    writeBoardPath(board, S.late.L.on);
    writeLevel(level, S.late, S.early);
    return { hardware, overlay };
  },

  update(dt, t) {
    // ---- the knob ---------------------------------------------------------
    const ph = ((t / SWEEP) % 1 + 1) % 1;
    const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    const Nf = 60 - 54 * tri;
    const N = Math.round(Nf);
    const changed = N !== S.N;
    S.N = N;
    S.late = chainLate(N);
    S.early = chainEarly(N);
    const late = S.late;

    const f = (63 - Nf) / 63;
    S.hw.userData.knob.rotation.y = THREE.MathUtils.degToRad(-30 - 300 * f);

    if (changed) {
      setDisplay(S.hw.userData.disp, N);
      writeBoardPath(S.board, late.L.on);
      const { led, relay } = S.board.userData;
      for (let i = 0; i < 6; i++) {
        _c.setHex(late.L.on[i] ? 0x5cc0f2 : 0x101820); led.setColorAt(i, _c);
        _c.setHex(late.L.on[i] ? 0x2e5f7a : 0x333c46); relay.setColorAt(i, _c);
      }
      led.instanceColor.needsUpdate = true;
      relay.instanceColor.needsUpdate = true;
    }
    S.hw.userData.meter.scale.x = Math.max(0.001, (63 - Nf) / 63);
    writeLevel(S.level, late, S.early);

    // ---- the interconnect -------------------------------------------------
    const car = carriers(late.s[3]);
    const amp = car.disp * CBL_SCALE * CARRIER_MAG;
    // velocity is in phase with the current; displacement is its integral, so
    // it lags by 90° — the carriers never travel, they rock about a fixed point.
    const phase = DSP.TAU * F_TONE * t;
    const d = -Math.cos(phase) * amp;
    const sgn = Math.sin(phase) >= 0 ? 1 : -1;
    const mag = Math.max(0.14, Math.abs(Math.sin(phase)));
    S.cable.userData.arrows.forEach((a, k) => {
      a.rotation.z = (k === 0 ? sgn : -sgn) > 0 ? -Math.PI / 2 : Math.PI / 2;
      a.scale.set(1, mag, 1);
    });
    const span = CBL.x1 - CBL.x0;
    S.cable.userData.swarm.update((i) => {
      const row = i < N_CARRY ? 1 : -1;
      const k = i % N_CARRY;
      const x = CBL.x0 + ((k + 0.5) / N_CARRY) * span + row * d;
      return { p: [x, row > 0 ? CBL.yH : CBL.yC, 0.003], s: 1, c: PAL.am };
    });

    const fp = ((t / FRONT_CYCLE) % 1 + 1) % 1;
    const u = fp * (FRONT_CYCLE / FRONT_RUN);
    const on = u <= 1;
    const fx = CBL.x0 + span * DSP.clamp(u, 0, 1);
    S.cable.userData.front.position.x = fx;
    S.cable.userData.halo.position.x = fx;
    S.cable.userData.front.visible = on;
    S.cable.userData.halo.visible = on;

    // ---- readout labels ----------------------------------------------------
    const ratio = 1 / late.L.ratio;
    S.lab.vol.setValue(`−${N} dB · ${ratio < 100 ? ratio.toFixed(1) : Math.round(ratio)} : 1 · ${DSP.si(late.s[3], 3)}V · 50 Ω`);
    S.lab.board.setValue(`${late.L.on.map((b) => (b ? 1 : 0)).join('')} · Z ${DSP.si(late.L.zOut, 3)}Ω`);
    S.lab.lvl.setValue(`S/N ${late.snr.toFixed(1)} / ${S.early.snr.toFixed(1)} dB`);
    S.lab.drift.setValue(`field ${DSP.si(T_FLIGHT, 3)}s · swing ${DSP.si(car.disp, 3)}m`);
  },

  content() {
    return `
<h3>The knob is an attenuator</h3>
<p>Voltage gain here is fixed at <span class="num">+10.0 dB</span> and never moves. The control is six relay-switched L-pads, binary-weighted <span class="num">32/16/8/4/2/1 dB</span>, cascaded in a <span class="num">10 kΩ</span> image impedance. Turning down does not turn the amplifier down — it discards voltage ahead of it.</p>
<div class="eq">a = 10^(−20/20) = <span class="hl">0.100</span>  <span class="c">a 10 : 1 divider</span>
V = 2.000 × 3.162 × 0.100
  = <span class="hl">0.632 V rms</span></div>

<h3>Where the ladder sits</h3>
<p>Put it <b>after</b> the gain block and it scales the signal and that block's noise together, so signal-to-noise hardly moves — but the block runs flat out at <span class="num">+16.0 dBV</span> against a ceiling of <span class="num">+21.1 dBV</span>, only <span class="num">5.0 dB</span> spare. Put it <b>before</b> and headroom is safe, but the block's noise is now fixed while the signal shrinks: at −20 dB that costs <span class="num">8.8 dB</span> of S/N. Attenuate as late as headroom allows; a source hotter than <span class="num">3.58 V rms</span> forces the ladder to the front.</p>

<h3>Why it is active</h3>
<div class="myth"><span class="lab">Commonly got wrong</span><p>"A passive control is more transparent — nothing is in the way." Its own wiper impedance is. A 40 kΩ pot at midpoint is a <span class="num">10 kΩ</span> source; into 3 m of cable (<span class="num">300 pF</span>) loaded by 47 kΩ that is −3 dB at <span class="num">64.3 kHz</span>, <span class="num">−0.40 dB</span> at 20 kHz, on top of <span class="num">1.68 dB</span> lost to the resistive divider. The <span class="num">50 Ω</span> buffer fitted here corners at <span class="num">10.6 MHz</span>.</p></div>

<h3>Balanced</h3>
<p>Pins 2 and 3 carry the signal out and back: one closed loop, no phantom return. Hum common to both cancels at the receiver. A four-resistor difference amplifier rejects by <span class="num">1/(2δ)</span> — 0.1 % parts give <span class="num">54.0 dB</span>, so <span class="num">20 mV</span> of chassis-to-chassis 50 Hz leaves <span class="num">40 µV</span>. Single-ended, all 20 mV arrives.</p>

<div class="key"><span class="lab">The idea</span><p>Volume is subtraction. What a preamplifier sells is a low output impedance and a cheap place to lose level.</p></div>`;
  },

  readouts() {
    const l = S.late, r = 1 / l.L.ratio;
    return [
      { k: 'Volume', v: `−${S.N}`, u: 'dB', cls: 'acc', bar: (63 - S.N) / 63 },
      { k: 'Divider', v: `${r < 100 ? r.toFixed(2) : Math.round(r)} : 1`, u: '' },
      { k: 'Output', v: DSP.si(l.s[3], 3), u: 'V rms' },
      { k: 'Out Z', v: '50.0', u: 'Ω' },
      { k: 'Cable −3 dB', v: (cornerHz(R_ACT) / 1e6).toFixed(2), u: 'MHz', cls: 'acc' },
      { k: 'S/N', v: l.snr.toFixed(1), u: 'dB', bar: l.snr / 125 },
    ];
  },
};

/** World point from a board-local (x,y) — the board's origin is its centre. */
function cardPtV(obj, x, y) { return obj.localToWorld(new THREE.Vector3(x, y, 0)); }
