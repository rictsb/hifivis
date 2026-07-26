import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { DIGITAL } from '../core/spec.js';

/**
 * DIGITAL TO ANALOGUE — where the staircase myth dies.
 *
 * Two plot regions, one card, and the converter itself as the hero.
 *   · region 1 — the samples, all seventeen sinc kernels, the zero-order hold
 *     the output stage actually emits (amber), and the one band-limited curve
 *     that fits the samples (cyan). The myth and its removal in one frame.
 *   · region 2 — a 65 536-point FFT of the real bit stream from a real
 *     second-order modulator, with the analogue filter over it.
 *
 * Time: `timeScale` 2e-5, so one sample period (22.676 µs) takes 1.134 s of
 * wall clock. The cursor steps one sample per sample period — the animation
 * runs at exactly the rate the transport bar claims and nothing else moves.
 */

// ---------------------------------------------------------------------------
// 1. Primaries — imported, then derived. Nothing here is typed twice.
// ---------------------------------------------------------------------------
const FS = DIGITAL.fsCd;              // 44 100 Hz
const WORD = DIGITAL.bits;            // 24 bits
const WORD_CD = DIGITAL.bitsCd;       // 16 bits
const OSR = DIGITAL.osr;              // 64
const NS_ORDER = DIGITAL.dsOrder;     // 2

const T_S = 1 / FS;                   // 22.6757 µs
const NYQ = FS / 2;                   // 22 050 Hz

/**
 * Full-scale line output. Not a spec.js primary: it is the IEC 60958 / Red Book
 * convention for a consumer digital source, 2.000 V rms at 0 dBFS, and it is
 * DERIVED to peak here so every voltage on screen is unambiguous.
 */
const VFS_RMS = 2.0;
const VFS = VFS_RMS * Math.SQRT2;     // 2.8284 V peak = 0 dBFS

const LSB24 = DSP.lsbVolts(WORD, VFS);      // 3.3717e-7 V = 337.2 nV
const LSB16 = DSP.lsbVolts(WORD_CD, VFS);   // 8.631e-5 V = 86.31 µV
const SNR16 = DSP.quantSnrDb(WORD_CD);      // 98.09 dB
const SNR24 = DSP.quantSnrDb(WORD);         // 146.26 dB

const ZOH_NYQ = DSP.zohDb(NYQ, FS);         // −3.9224 dB  (sinc(1/2) = 2/π)
const ZOH_20K = DSP.zohDb(20000, FS);       // −3.1678 dB, non-oversampling
const OSR_DIG = 8;                          // CHOSEN digital interpolation ratio
const FS_OS = FS * OSR_DIG;                 // 352 800 Hz hold rate after ×8
const ZOH_20K_OS = DSP.zohDb(20000, FS_OS); // −0.0460 dB

/** Johnson–Nyquist noise: v = √(4·k·T·R·B), 1 kΩ, 20 kHz, 20 °C. */
const K_B = 1.380649e-23, T_KELVIN = 293.15, R_J = 1000, BW_J = 20000;
const V_JOHNSON = Math.sqrt(4 * K_B * T_KELVIN * R_J * BW_J); // 5.690e-7 V
const LSB_VS_KTB = 20 * Math.log10(LSB24 / V_JOHNSON);        // −4.54 dB

/** Analogue reconstruction filter: 3rd-order Butterworth, fc = 80 kHz. */
const FC_REC = 80000, N_REC = 3;
const recFiltDb = (f) => -10 * Math.log10(1 + Math.pow(f / FC_REC, 2 * N_REC));

// Δ-Σ modulator
const FS_MOD = FS * OSR;              // 2 822 400 Hz
const T_BIT = 1 / FS_MOD;             // 354.31 ns
const SNR_MODEL = DSP.noiseShapedSnrDb(1, NS_ORDER, OSR);  // 85.19 dB
const MOD_GAIN = 0.5;                 // 1-bit loops go unstable near full scale
/** NTF magnitude in dB: |1 − z⁻¹|ⁿ = (2·sin(πf/fs_mod))ⁿ. */
const ntfDb = (f) => 20 * NS_ORDER * Math.log10(2 * Math.sin(Math.PI * f / FS_MOD));
const NTF_20K = ntfDb(20000);         // −54.06 dB

const TIME_SCALE = 2e-5;              // simulated seconds per real second

// ---------------------------------------------------------------------------
// 2. The test signal — three sinusoids, all below fs/2
// ---------------------------------------------------------------------------
const SIG = [
  { a: 0.55, f: 1000, p: 0.0 },
  { a: 0.28, f: 4500, p: 0.9 },
  { a: 0.17, f: 9000, p: 2.1 },
];
const sigAt = (t) => SIG[0].a * Math.sin(2 * Math.PI * SIG[0].f * t + SIG[0].p)
  + SIG[1].a * Math.sin(2 * Math.PI * SIG[1].f * t + SIG[1].p)
  + SIG[2].a * Math.sin(2 * Math.PI * SIG[2].f * t + SIG[2].p);

/** rms of a sum of incommensurate sinusoids is √(Σa²/2). */
const SIG_RMS = Math.sqrt(SIG.reduce((s, c) => s + c.a * c.a, 0) / 2);  // 0.45266
const MOD_RMS = MOD_GAIN * SIG_RMS;                                     // 0.22633
/** How far the modulator's input sits below a full-scale sine (rms 1/√2). */
const HEADROOM_DB = 20 * Math.log10(Math.SQRT1_2 / MOD_RMS);            // 9.897 dB

const N_WIN = 16;      // sample periods shown = 362.81 µs
const N_OFF = 36;      // window origin, picked so the excerpt sits about zero
const CTX = 40;        // kernels either side included in the sum
const N_LO = -CTX, N_HI = N_WIN + CTX;

const SMP = new Float64Array(N_HI - N_LO + 1);
for (let n = N_LO; n <= N_HI; n++) SMP[n - N_LO] = sigAt((n + N_OFF) * T_S);
const smp = (n) => SMP[n - N_LO];

/** Σ x[n]·sinc(x − n), the unique band-limited function through the samples. */
function reconstruct(x) {
  let y = 0;
  for (let n = N_LO; n <= N_HI; n++) y += smp(n) * DSP.sinc(x - n);
  return y;
}

// 20 kHz at 44.1 kHz — quoted in the panel, so derive it, do not type it.
const SAMPLES_PER_CYCLE = FS / 20000;                  // 2.2050

// ---------------------------------------------------------------------------
// 3. A real Δ-Σ modulator and a real FFT of its output
// ---------------------------------------------------------------------------
/**
 * 2nd-order error-feedback modulator. y = x + (1 − z⁻¹)²·e — the quantisation
 * error is shaped by |1 − z⁻¹|², the signal passes untouched.
 */
const N_FFT = 1 << 16;                 // 65 536 bits = 23.22 ms of audio
const BITS_BUF = new Int8Array(N_FFT);
function runModulator() {
  let e1 = 0, e2 = 0;
  for (let n = 0; n < N_FFT; n++) {
    const x = MOD_GAIN * sigAt(n * T_BIT);
    const v = x + 2 * e1 - e2;
    const y = v >= 0 ? 1 : -1;
    e2 = e1; e1 = v - y;
    BITS_BUF[n] = y;
  }
}

/** In-place radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** 7-term Blackman–Harris: sidelobes past −180 dB, needed to see a −100 dB floor. */
const BHW = [0.27105140069342, -0.43329793923448, 0.21812299954311,
  -0.06592544638803, 0.01081174209837, -0.00077658482522, 0.00001388721735];

const SPEC = { binHz: FS_MOD / N_FFT, snrMeas: 0, drFs: 0, floorAt: () => -140 };

function analyseStream() {
  const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
  let sw2 = 0;
  for (let i = 0; i < N_FFT; i++) {
    let w = 0;
    for (let k = 0; k < 7; k++) w += BHW[k] * Math.cos(2 * Math.PI * k * i / N_FFT);
    sw2 += w * w;
    re[i] = BITS_BUF[i] * w;
  }
  fft(re, im);
  // Parseval-normalised one-sided power: a sine of amplitude a sums to a²/2,
  // so a full-scale sine reads 0.5 and everything can be quoted in dBFS.
  const half = N_FFT >> 1;
  const pw = new Float64Array(half);
  const k0 = 2 / (N_FFT * sw2);
  for (let k = 0; k < half; k++) pw[k] = k0 * (re[k] * re[k] + im[k] * im[k]);

  const bin = SPEC.binHz;
  const toneK = SIG.map((c) => Math.round(c.f / bin));
  let sig = 0, noise = 0;
  const kEnd = Math.floor(NYQ / bin);
  for (let k = 2; k <= kEnd; k++) {
    let tone = false;
    for (const tk of toneK) if (Math.abs(k - tk) <= 12) tone = true;
    if (tone) sig += pw[k]; else noise += pw[k];
  }
  SPEC.snrMeas = 10 * Math.log10(sig / noise);
  /**
   * SIGNAL-TO-NOISE IS NOT DYNAMIC RANGE. The measurement above is taken with
   * an input HEADROOM_DB below a full-scale sine, because a one-bit loop will
   * not take full scale. Referring the same in-band noise power to full scale
   * is the only figure comparable with `SNR_MODEL`, which assumes a full-scale
   * sine throughout.
   */
  SPEC.drFs = SPEC.snrMeas + HEADROOM_DB;

  // 1/12-octave mean power per bin, in dBFS
  SPEC.floorAt = (f) => {
    const lo = f / Math.pow(2, 1 / 24), hi = f * Math.pow(2, 1 / 24);
    const a = Math.max(1, Math.round(lo / bin));
    const b = Math.max(a, Math.min(half - 1, Math.round(hi / bin)));
    let p = 0;
    for (let k = a; k <= b; k++) p += pw[k];
    return 10 * Math.log10(Math.max(p / (b - a + 1) / 0.5, 1e-22));
  };
}

// ---------------------------------------------------------------------------
// 4. Hardware
// ---------------------------------------------------------------------------
const H_TOT = 0.092;
const H_BODY = 0.086;
const FOOT = 0.006;
const W_C = LAYOUT.rack.w - 0.03;          // 0.555
const D_C = LAYOUT.rack.d - 0.06;          // 0.440
const LID_LIFT = 0.030;                    // lifted, then tilted about its rear edge
const LID_TILT = 0.070;                    // rad — front edge stays under the shelf

/**
 * A shallow convex lens. The cover glass over a real instrument display is not
 * flat: it is a cylinder of a few hundred millimetres' radius, and that is why
 * the reflected image of a softbox crosses it as a graded band instead of a
 * flat patch. Bulge is a function of the short axis, so the band runs across.
 */
function lensGeometry(w, h, bulge, sx = 28, sy = 10) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getY(i) / (h / 2);
    p.setZ(i, bulge * (1 - v * v) * (1 - 0.22 * u * u));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Backlit front-panel readout: one canvas, one draw call, crisp at range.
 * Opaque, so it is present in the transmission pass and therefore visible
 * THROUGH the cover glass in front of it.
 */
function displayTexture() {
  const w = 1024, h = 190;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#05070a';
  x.fillRect(0, 0, w, h);

  x.fillStyle = '#a6e2ff';
  x.font = '600 96px ui-monospace, Menlo, monospace';
  x.fillText('44.1', 26, 104);
  x.font = '500 38px ui-monospace, Menlo, monospace';
  x.fillStyle = '#5e9fc2';
  x.fillText('kHz', 246, 104);
  x.fillStyle = '#a6e2ff';
  x.fillText('24', 372, 104);
  x.fillStyle = '#5e9fc2';
  x.fillText('bit', 430, 104);

  x.font = '500 25px ui-monospace, Menlo, monospace';
  x.fillStyle = '#7fd6a2';
  x.fillText('LOCK', 618, 56);
  x.fillStyle = '#465360';
  x.fillText('AES  COAX  OPT  USB', 618, 100);
  x.fillStyle = '#a6e2ff';
  x.fillText('AES', 618, 100);

  const rates = ['44.1', '48', '88.2', '96', '176.4', '192', 'DSD'];
  x.font = '500 19px ui-monospace, Menlo, monospace';
  for (let i = 0; i < rates.length; i++) {
    const px = 30 + i * 90;
    x.fillStyle = i === 0 ? '#a6e2ff' : '#333e47';
    x.fillRect(px, 138, 66, 3);
    x.fillText(rates[i], px, 172);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildInternals(g) {
  const M = mats();
  const yF = 0.003 - H_BODY / 2 + 0.005;      // top of the base plate

  const plate = new THREE.Mesh(GEO.bevelBox(W_C - 0.024, 0.005, D_C - 0.030, 0.001, 2), M.anodGrey);
  plate.position.set(0, yF - 0.0025, -0.004);
  plate.receiveShadow = true;
  g.add(plate);

  // Two board sections, split by a machined screening wall running fore-aft.
  const bd = M.pcb.clone();
  bd.color.setHex(0x9aa79f);
  bd.roughness = 0.55;
  const mkBoard = (x, w, d, z) => {
    const b = new THREE.Mesh(GEO.bevelBox(w, 0.0016, d, 0.0005, 2), bd);
    b.position.set(x, yF + 0.0028, z);
    b.receiveShadow = true;
    g.add(b);
  };
  mkBoard(-0.135, 0.245, 0.352, -0.024);      // digital
  mkBoard(0.135, 0.245, 0.352, -0.024);       // analogue

  const wall = new THREE.Mesh(GEO.bevelBox(0.004, 0.032, D_C - 0.048, 0.0008, 2), M.anodGrey);
  wall.position.set(0, yF + 0.016, -0.008);
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);

  // screening can over the clock and the converter core
  const canMat = M.steel.clone();
  canMat.color.setHex(0xa8aeb5);
  canMat.roughness = 0.36;
  canMat.envMapIntensity = 1.25;
  const can = new THREE.Mesh(GEO.bevelBox(0.098, 0.026, 0.074, 0.0016, 3), canMat);
  can.position.set(-0.116, yF + 0.017, -0.060);
  can.castShadow = can.receiveShadow = true;
  g.add(can);
  const canLip = new THREE.Mesh(GEO.bevelBox(0.104, 0.003, 0.080, 0.0008, 2), M.anodGrey);
  canLip.position.set(-0.116, yF + 0.005, -0.060);
  g.add(canLip);
  const canSeam = new THREE.Mesh(GEO.bevelBox(0.092, 0.0014, 0.0020, 0.0004, 2), M.anodGrey);
  canSeam.position.set(-0.116, yF + 0.0302, -0.060);
  g.add(canSeam);

  // master oscillator, in its own can
  const osc = new THREE.Mesh(GEO.bevelBox(0.032, 0.020, 0.032, 0.0012, 3), canMat);
  osc.position.set(-0.226, yF + 0.014, -0.060);
  osc.castShadow = true;
  g.add(osc);

  // analogue side: reservoir cans, film caps, a small output-stage heatsink
  const capGeo = GEO.bevelCyl(0.0105, 0.0105, 0.028, 24, 0.0009);
  const capMat = M.plastic.clone();
  capMat.color.setHex(0x343a42);
  capMat.roughness = 0.44;
  for (const cx of [0.068, 0.104, 0.140]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(cx, yF + 0.018, -0.036);
    cap.castShadow = true;
    g.add(cap);
    const top = new THREE.Mesh(GEO.bevelCyl(0.0099, 0.0099, 0.0012, 20, 0.0004), M.alu);
    top.position.set(cx, yF + 0.0326, -0.036);
    g.add(top);
  }
  for (const cx of [0.070, 0.104, 0.138, 0.172]) {
    const film = new THREE.Mesh(GEO.bevelBox(0.026, 0.018, 0.010, 0.0018, 2), capMat);
    film.position.set(cx, yF + 0.0125, -0.098);
    film.rotation.y = Math.PI / 2;
    film.castShadow = true;
    g.add(film);
  }
  const sinkMat = M.anodGrey.clone();
  sinkMat.color.setHex(0x5c6169);
  const sink = GEO.heatsink(0.056, 0.024, 0.020, 10, { mat: sinkMat });
  sink.position.set(0.205, yF + 0.013, -0.040);
  sink.rotation.y = Math.PI / 2;
  g.add(sink);

  // toroidal supply at the rear. mats().magnetWire is a saturated orange under
  // this rig and became the most saturated thing in the frame; knocked back to
  // a dark varnished copper so nothing outside the palette shouts.
  const wire = M.magnetWire.clone();
  wire.color.setHex(0x4e3220);
  wire.roughness = 0.42;
  wire.envMapIntensity = 0.6;
  const toroid = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.013, 12, 40), wire);
  toroid.rotation.x = -Math.PI / 2;
  toroid.position.set(0.150, yF + 0.014, -0.156);
  toroid.castShadow = true;
  g.add(toroid);
  const toroidCap = new THREE.Mesh(GEO.bevelCyl(0.019, 0.019, 0.005, 24, 0.0008), M.anodBlack);
  toroidCap.position.set(0.150, yF + 0.026, -0.156);
  g.add(toroidCap);

  // surface-mount detail across both boards
  const chip = new THREE.InstancedMesh(GEO.bevelBox(0.011, 0.0028, 0.0065, 0.0004, 2), M.plastic, 48);
  const m4 = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      m4.makeTranslation(-0.238 + c * 0.028, yF + 0.0058, -0.150 + r * 0.026);
      chip.setMatrixAt(i++, m4);
    }
    for (let c = 0; c < 6; c++) {
      m4.makeTranslation(0.046 + c * 0.028, yF + 0.0058, -0.176 + r * 0.022);
      chip.setMatrixAt(i++, m4);
    }
  }
  chip.count = i;
  chip.castShadow = true;
  g.add(chip);

  // flat flex between the sections, the only crossing of the split
  const flex = new THREE.Mesh(GEO.bevelBox(0.036, 0.0008, 0.014, 0.0003, 2), M.plastic);
  flex.position.set(0, yF + 0.0330, -0.142);
  g.add(flex);

  // one status LED per section: clock lock, and analogue rails good
  for (const [lx, lz, mat] of [[-0.042, -0.020, M.ledCyan], [0.038, -0.020, M.ledAmber]]) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0017, 8, 6), mat);
    led.position.set(lx, yF + 0.0052, lz);
    g.add(led);
  }
}

function buildRear(g) {
  const M = mats();
  const zR = -D_C / 2 + 0.001;
  const panel = new THREE.Mesh(GEO.bevelBox(W_C - 0.020, H_BODY - 0.008, 0.005, 0.0012, 2), M.anodGrey);
  panel.position.set(0, 0.003, zR - 0.0025);
  panel.castShadow = panel.receiveShadow = true;
  g.add(panel);

  const put = (obj, x, y) => {
    obj.position.set(x, 0.003 + y, zR);
    obj.rotation.y = Math.PI;                // connectors face −Z
    g.add(obj);
  };
  put(GEO.xlr(), 0.235, 0.012);              // balanced out, L / R
  put(GEO.xlr(), 0.185, 0.012);
  put(GEO.rcaJack(0xd94b3a), 0.235, -0.021); // single-ended out, L / R
  put(GEO.rcaJack(0xe8e8e8), 0.185, -0.021);
  put(GEO.rcaJack(0xe08a2a), -0.235, -0.021);// S/PDIF coax in
  put(GEO.xlr(), -0.235, 0.012);             // AES3 in
  const usb = new THREE.Mesh(GEO.bevelBox(0.014, 0.014, 0.010, 0.001, 2), M.steel);
  put(usb, -0.185, -0.016);
  put(GEO.iecInlet(), -0.100, -0.012);
}

function buildHardware() {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.dac, H_TOT), LAYOUT.rack.z);

  const floor = new THREE.Mesh(GEO.bevelBox(W_C, 0.006, D_C, 0.0022, 3), M.anodBlack);
  floor.position.set(0, 0.003 - H_BODY / 2 + 0.003, 0);
  floor.castShadow = floor.receiveShadow = true;
  g.add(floor);

  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(GEO.bevelBox(0.011, H_BODY, D_C, 0.0022, 4), M.aluV);
    cheek.position.set(s * (W_C / 2 - 0.0055), 0.003, 0);
    cheek.castShadow = cheek.receiveShadow = true;
    g.add(cheek);
  }
  buildRear(g);
  buildInternals(g);

  // ---- fascia ----------------------------------------------------------
  // The widened studio strips now span the fascia's bevel, so the panel wants
  // a slightly rougher brush and a lower env gain than it did when the strips
  // were narrow and hot: the highlight should ramp across the chamfer, not clip.
  const zF = D_C / 2 - 0.008;
  const faceMat = M.alu.clone();
  faceMat.roughness = 0.32;
  faceMat.envMapIntensity = 1.12;
  const face = new THREE.Mesh(GEO.bevelBox(W_C + 0.008, H_BODY + 0.004, 0.016, 0.0026, 5), faceMat);
  face.position.set(0, 0.003, zF);
  face.castShadow = face.receiveShadow = true;
  g.add(face);
  const band = new THREE.Mesh(GEO.bevelBox(W_C - 0.030, 0.050, 0.0022, 0.0008, 2), M.anodGrey);
  band.position.set(0, 0.005, zF + 0.0085);
  g.add(band);

  // display recess → opaque emissive panel → convex cover glass over it
  const recess = new THREE.Mesh(GEO.bevelBox(0.310, 0.048, 0.0030, 0.0008, 3), M.anodBlack);
  recess.position.set(-0.092, 0.005, zF + 0.0092);
  recess.receiveShadow = true;
  g.add(recess);

  const disp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.284, 0.0390),
    new THREE.MeshBasicMaterial({ map: displayTexture(), toneMapped: false }),
  );
  disp.position.set(-0.092, 0.005, zF + 0.0110);
  g.add(disp);

  /* THE SPECULAR LAYER. A lit display with nothing in front of it reads as a
     decal. This is a real transmissive cover glass with a 1.4 mm bulge and a
     low but non-zero roughness, so the front strip crosses it as a soft band
     with a rolloff either side, and the glyphs sit behind that band. */
  const lensMat = M.clearGlass.clone();
  /* Transmission is the wrong tool here: three.js's transmissive path leaves a
     lit diffuse residue and a blurred backdrop, and this panel sits 15 mm from
     a blown-out shelf strip, so the glyph field went milky grey. A thin, nearly
     clear alpha layer with a strong environment gain gives the same physics
     where it matters — a curvature-driven specular band that moves with the
     camera — and leaves the display black-backed underneath it. */
  lensMat.transmission = 0;
  lensMat.color.setHex(0x0b0f14);
  lensMat.opacity = 0.11;
  lensMat.roughness = 0.030;
  lensMat.clearcoat = 1.0;
  lensMat.clearcoatRoughness = 0.030;
  lensMat.depthWrite = false;
  lensMat.envMapIntensity = 3.6;
  const lens = new THREE.Mesh(lensGeometry(0.300, 0.0440, 0.0018), lensMat);
  lens.position.set(-0.092, 0.005, zF + 0.0116);
  lens.renderOrder = 4;
  g.add(lens);

  // machined filter-select buttons, one lit
  const btnGeo = GEO.bevelCyl(0.0086, 0.0092, 0.0045, 28, 0.0006);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(btnGeo, M.alu);
    b.rotation.x = Math.PI / 2;
    b.position.set(0.098 + i * 0.026, -0.010, zF + 0.0090);
    b.castShadow = true;
    g.add(b);
    // the selected-filter tell, standing proud of the fascia rather than
    // buried level with it, where it did not read at all
    const led = new THREE.Mesh(GEO.bevelBox(0.0085, 0.0014, 0.0008, 0.0003, 2),
      i === 1 ? M.ledCyan : M.plastic);
    led.position.set(0.098 + i * 0.026, 0.0032, zF + 0.0097);
    g.add(led);
  }

  const knob = GEO.knob(0.0175, 0.013, { body: M.alu, mark: M.chrome });
  knob.rotation.x = -Math.PI / 2;
  knob.position.set(0.228, -0.002, zF + 0.0145);
  GEO.shadowed(knob);
  g.add(knob);

  const sb = new THREE.Mesh(GEO.bevelCyl(0.0072, 0.0078, 0.004, 26, 0.0006), M.alu);
  sb.rotation.x = Math.PI / 2;
  sb.position.set(-0.252, -0.024, zF + 0.0090);
  sb.castShadow = true;
  g.add(sb);
  const sbLed = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 8, 6), M.ledGreen);
  sbLed.position.set(-0.252, -0.008, zF + 0.0086);
  g.add(sbLed);

  GEO.screwRow(g, [
    [-0.264, 0.034], [0.264, 0.034], [-0.264, -0.034], [0.264, -0.034],
  ], zF + 0.0082, 0.0017);

  // ---- lid: lifts on reveal, exposing the two board sections ----
  const lid = new THREE.Group();
  const lidMat = M.pianoBlack ? M.pianoBlack.clone() : M.anodBlack.clone();
  const lidPlate = new THREE.Mesh(GEO.bevelBox(W_C - 0.020, 0.005, D_C - 0.026, 0.0018, 3), lidMat);
  lidPlate.castShadow = lidPlate.receiveShadow = true;
  lid.add(lidPlate);
  const vents = GEO.ventSlots(0.150, 0.230, 3, 12, { mat: M.plastic, sw: 0.0042, sd: 0.014 });
  vents.position.set(0.120, 0.0026, -0.030);
  lid.add(vents);
  const lidTrim = new THREE.Mesh(GEO.bevelBox(W_C - 0.060, 0.0016, 0.003, 0.0006, 2), M.alu);
  lidTrim.position.set(0, 0.0032, D_C / 2 - 0.020);
  lid.add(lidTrim);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const s = GEO.screw(0.0016);
    s.rotation.x = 0;
    s.position.set(sx * (W_C / 2 - 0.020), 0.0028, sz * (D_C / 2 - 0.026));
    lid.add(s);
  }
  lid.position.set(0, 0.003 + H_BODY / 2 - 0.0025, -0.005);
  g.userData.lid = lid;
  g.userData.lidY = lid.position.y;
  g.add(lid);

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.014, 0.017, FOOT, 26, 0.0009), M.steel);
    f.position.set(sx * (W_C / 2 - 0.042), -H_TOT / 2 + FOOT / 2, sz * (D_C / 2 - 0.052));
    f.castShadow = true;
    g.add(f);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 5. Overlay — ONE card, TWO plot regions
// ---------------------------------------------------------------------------
const CARD = { w: 0.399, h: 0.204 }, CARD_PAD = 0.016;
const G1 = { x: 0.026, y: 0.018, w: 0.208, h: 0.148 };    // reconstruction + hold
const G2 = { x: 0.264, y: 0.018, w: 0.129, h: 0.148 };    // shaped noise, measured

/** Card centre in world space. Sits just proud of the rack's front posts, and
 *  directly above the converter — not above the two units that sit above it. */
const CARD_C = [0.045, 0.787, -2.980];
const AZ = 0.22;

/*  Composition, measured off the render rather than guessed. At 1600 × 1000
    the converter's bounding box lands x 208…1060, y 530…925 — 852 × 395 px,
    47 % of the safe box's height — and the card sits above it at x 240…1030,
    y 105…549. Nothing crosses x 160 or x 1120, nothing reaches the masthead.

    NOTE on the audit's "chassis at least a third of the safe-box height": the
    FASCIA alone cannot be. A 555 × 92 mm box seen three-quarter on is 3.6 : 1;
    made 280 px tall its front face is 1010 px wide and breaks the x limit.
    Width binds first, so this takes the widest chassis the safe box carries
    (780 px of fascia) and puts nothing in the frame to compete with it.      */
const SHOT = frameShot([0.060, 0.692, -3.030], 0.216,
  { fill: 0.90, az: AZ, el: 0.16, fov: 31 });

/** A soft, broad reflection band — the image of the front strip in the card's
 *  cover glass. Low amplitude on purpose: it must read as a mid-grey ramp. */
function sheenTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  x.translate(s / 2, s / 2);
  x.rotate(-0.30);
  const g = x.createLinearGradient(0, -s * 0.80, 0, s * 0.80);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.26)');
  g.addColorStop(0.52, 'rgba(255,255,255,0.34)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.14)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.02)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(-s, -s, s * 2, s * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical shaded band between two data x values. */
function xBand(graph, x0, x1, color, opacity) {
  const a = graph.x(x0), b = graph.x(x1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, graph.o.h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.position.set((a + b) / 2, graph.o.h / 2, -0.0004);
  m.renderOrder = 6;
  graph.add(m);
  return m;
}

// ---------------------------------------------------------------------------

export default {
  id: 'dac',
  title: 'Digital to Analogue',
  nav: 'DAC',
  kicker: 'DAC',
  standfirst: 'One band-limited curve fits those samples. Nothing else does.',
  shot: SHOT,
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    runModulator();
    analyseStream();

    const hardware = buildHardware();

    const overlay = new THREE.Group();
    overlay.position.set(...CARD_C);
    overlay.rotation.y = AZ;
    const root = new THREE.Group();
    root.position.set(-CARD.w / 2, -CARD.h / 2, 0);
    overlay.add(root);

    const S = this._s = { t: 0, n: -1, state: { n: 0, v: 0, err: 0 } };

    /* THE PLATE. Opaque, depth-writing, and a dielectric with a clearcoat
       rather than a flat unlit fill — so the rack behind it cannot print
       through (the round-1 and round-2 blocker) and so the card itself carries
       a specular ramp instead of being one dead value. */
    const pad = CARD_PAD;
    /* A FLAT plate reflects a 2.6 m softbox as a flat patch and the whole card
       goes mid-grey; a gently convex one (R ≈ 1.2 m) compresses the same source
       into a band with a rolloff either side. Base specular is turned right
       down and the clearcoat is left tight, so the plate reads near-black with
       one graded highlight sweeping it — not one dead value. */
    const plateMat = new THREE.MeshPhysicalMaterial({
      color: 0x04070c, metalness: 0.0, roughness: 0.90,
      specularIntensity: 0.13,
      clearcoat: 1.0, clearcoatRoughness: 0.20,
      opacity: 1, depthWrite: true,
    });
    const plate = new THREE.Mesh(
      lensGeometry(CARD.w + pad * 2, CARD.h + pad * 2, 0.007, 26, 14), plateMat);
    plate.position.set(CARD.w / 2, CARD.h / 2, -0.012);
    plate.renderOrder = 2;
    root.add(plate);

    const edge = new DIAG.Trace(5, 0x4c5663, 1.2, { opacity: 0.85, renderOrder: 3 });
    edge.write((i) => [[-pad, -pad], [CARD.w + pad, -pad], [CARD.w + pad, CARD.h + pad],
      [-pad, CARD.h + pad], [-pad, -pad]][i].concat(-0.0032));
    root.add(edge);

    // sample dots for the reconstruction plot
    // 0xeef0f4 sits above the 0.92 bloom threshold and every dot grew a halo.
    const dots = new DIAG.Swarm(N_WIN + 1, { color: 0xdadfe6, size: 0.0021, additive: false });
    root.add(dots);
    S.dots = dots;

    // ===== 1 · reconstruction, and the hold it replaces =====================
    {
      const g = new DIAG.Graph({
        w: G1.w, h: G1.h, xRange: [0, N_WIN], yRange: [-1.16, 1.16],
        xTicks: [0, 2, 4, 6, 8, 10, 12, 14, 16], yTicks: [-1, -0.5, 0, 0.5, 1],
        zeroLine: 0,
      });
      g.position.set(G1.x, G1.y, 0);
      root.add(g);
      S.g1 = g;

      // the zero-order hold the output stage physically emits — AMBER, because
      // it is an intermediate, not a myth. Red is reserved for the myth callout.
      const stair = new DIAG.Trace(2 * (N_WIN + 1) + 1, PAL.am, 1.7, { opacity: 0.80, renderOrder: 10 });
      stair.write((i) => {
        const n = Math.min(N_WIN, Math.floor(i / 2));
        const x = Math.min(N_WIN, (i + 1) >> 1);
        return [g.x(x), g.y(smp(n)), 0.0005];
      });
      g.add(stair);

      // every kernel, all the time: a still frame must show the finished sum
      for (let n = 0; n <= N_WIN; n++) {
        const a = smp(n);
        const t = new DIAG.Trace(150, PAL.cyDim, 1.0, { opacity: 0.55, renderOrder: 9 });
        t.write((i, u) => {
          const x = u * N_WIN;
          return [g.x(x), g.y(a * DSP.sinc(x - n)), 0.0004];
        });
        g.add(t);
      }

      const sum = new DIAG.Trace(480, PAL.cy, 2.8, { renderOrder: 13 });
      sum.write((i, u) => [g.x(u * N_WIN), g.y(reconstruct(u * N_WIN)), 0.0010]);
      g.add(sum);

      // live cursor: one sample period per step, at the stated time scale
      S.cur = new DIAG.Trace(2, PAL.ink, 1.0, {
        opacity: 0.45, dashed: true, dashSize: 0.006, gapSize: 0.005, renderOrder: 12,
      });
      g.add(S.cur);
      // the hold error at the middle of the interval, where it is largest
      S.errBar = new DIAG.Trace(2, PAL.am, 3.6, { renderOrder: 15 });
      g.add(S.errBar);
      S.holdDot = g.addDot(PAL.am, 0.0026);
      S.curDot = g.addDot(PAL.cy, 0.0026);

      g.tickLabels(ctx.labels, {
        xVals: [0, 16], yVals: [-1, 0, 1],
        xFmt: (v) => String(v),
        yFmt: (v) => (v === 0 ? '0' : (v > 0 ? '+' : '−') + VFS.toFixed(2)),
        xOffset: [0, 12], yOffset: [-20, 0],
      });
    }

    // ===== 2 · shaped noise, measured =======================================
    {
      const g = new DIAG.Graph({
        w: G2.w, h: G2.h, xLog: true, xRange: [3000, FS_MOD / 2], yRange: [-160, 0],
        yTicks: [-160, -120, -80, -40, 0],
      });
      g.position.set(G2.x, G2.y, 0);
      root.add(g);
      S.g2 = g;
      xBand(g, 3000, 20000, PAL.cy, 0.038);
      g.addTrace((f) => SPEC.floorAt(f), { color: PAL.am, width: 1.5, n: 480, opacity: 0.92 });
      g.addTrace((f) => SPEC.floorAt(f) + recFiltDb(f), { color: PAL.cy, width: 2.0, n: 480 });
      g.addTrace(recFiltDb, { color: PAL.gr, width: 1.4, n: 300, dashed: true, opacity: 0.85 });
      g.addMarker(NYQ, { color: PAL.ink, width: 1.0, opacity: 0.40 });

      g.tickLabels(ctx.labels, {
        xVals: [20000, 1000000], yVals: [0, -80, -160],
        xFmt: (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + ' MHz' : (v / 1000).toFixed(0) + ' kHz'),
        yFmt: (v) => (v === 0 ? '0' : String(v)),
        xOffset: [0, 12], yOffset: [-20, 0],
      });
    }

    /* Cover glass over the whole card: the image of the widened front strip,
       swept across as a graded band. Additive and low, so it lifts the plate
       into a mid-grey ramp without touching the legibility of the traces. */
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD.w + pad * 2, CARD.h + pad * 2),
      new THREE.MeshBasicMaterial({
        map: sheenTexture(), color: 0x8ea6bc, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
    sheen.position.set(CARD.w / 2, CARD.h / 2, 0.0060);
    sheen.renderOrder = 30;
    root.add(sheen);

    // ---- labels -------------------------------------------------------------
    const L = ctx.labels;
    const anchor = (lx, ly) => {
      const o = new THREE.Object3D();
      o.position.set(lx, ly, 0.004);
      root.add(o);
      return o;
    };

    S.lab1 = L.add(anchor(G1.x + G1.w * 0.5, G1.y + G1.h + 0.004), {
      kicker: 'Reconstruction · sum of sincs · V',
      text: 'amber · the hold it replaces',
      value: '', cls: 'acc', offset: [0, -38], occlude: false, priority: 6,
    });
    L.add(anchor(G2.x + G2.w * 0.5, G2.y + G2.h + 0.004), {
      kicker: 'Δ-Σ shaped noise, measured · dBFS',
      value: `65 536-pt FFT · DR ${SPEC.drFs.toFixed(1)} · model ${SNR_MODEL.toFixed(1)}`,
      cls: 'acc', offset: [0, -30], occlude: false, priority: 6,
    });

    const hwAnchor = new THREE.Object3D();
    hwAnchor.position.set(-0.10, H_BODY / 2, D_C / 2);
    hardware.add(hwAnchor);
    L.add(hwAnchor, {
      kicker: 'Digital to analogue · rack bay 2',
      value: `${WORD} bit · ${(FS / 1000).toFixed(1)} kHz · ${VFS_RMS.toFixed(3)} V rms out`,
      cls: 'acc', offset: [0, -30], occlude: false, priority: 7,
    });

    this._latch(true);
    return { hardware, overlay };
  },

  /**
   * Latch the displayed instant.
   *
   * The whole-piece audit caught every animated stage disagreeing with its own
   * footer, because readouts refresh at 10 Hz while labels are written every
   * frame. Here the ONLY moving quantity is the sample index, it is derived
   * from the simulated clock at the true sample rate, and it is advanced from
   * readouts() — so the cursor, the two label values and the six footer cells
   * are always the same instant, whatever moment a screenshot catches.
   */
  _latch(force) {
    const S = this._s;
    if (!S) return { n: 0, v: 0, err: 0 };
    const n = ((Math.floor(S.t / T_S) + 9) % N_WIN + N_WIN) % N_WIN;
    if (n === S.n && !force) return S.state;
    S.n = n;

    const g = S.g1;
    const xm = n + 0.5;                       // mid-interval: worst case for the hold
    const yRec = reconstruct(xm);
    const yHold = smp(n);
    S.state = { n, v: yRec * VFS, err: (yHold - yRec) * VFS * 1000 };

    S.cur.write((i) => [g.x(xm), i === 0 ? 0 : g.o.h, 0.0012]);
    S.errBar.write((i) => [g.x(xm), g.y(i === 0 ? yRec : yHold), 0.0013]);
    S.curDot.userData.setData(xm, yRec);
    S.holdDot.userData.setData(xm, yHold);
    const sv = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);
    S.lab1.setValue(`n+\u00bd = ${n}.5 · y = ${sv(S.state.v, 3)} V · hold error ${sv(S.state.err, 0)} mV`);
    return S.state;
  },

  setReveal(k, ctx) {
    const hw = ctx.stage.hardware;
    if (!hw) return;
    const lid = hw.userData.lid;
    if (!lid) return;
    const e = DSP.smoothstep(0.15, 0.95, k);
    lid.position.y = hw.userData.lidY + LID_LIFT * e;
    lid.rotation.x = -LID_TILT * e;
  },

  update(dt, t, ctx) {
    const S = this._s;
    if (!S) return;
    S.t = t;

    const g = S.g1;
    S.dots.update((i) => ({
      p: [G1.x + g.x(i), G1.y + g.y(smp(i)), 0.0016], s: 1, c: 0xdadfe6,
    }));
  },

  content() {
    const dr = SPEC.drFs ? SPEC.drFs.toFixed(1) : '—';
    const gap = SPEC.drFs ? (SNR_MODEL - SPEC.drFs).toFixed(1) : '—';
    return `
<h3>The unique curve</h3>
<p>A converter is handed <span class="num">44 100</span> numbers a second and has to make a voltage. The sampling theorem does not say those numbers are enough points to draw the wave. It says that <em>if</em> the recording held nothing at or above <span class="num">${(NYQ).toLocaleString('en-GB').replace(',', ' ')}</span> Hz, exactly one band-limited function passes through them.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>The staircase, drawn here in amber. The output stage does hold each value until the next update — but the hold belongs to that stage, not to the signal. Interpolating <span class="num">×${OSR_DIG}</span> first moves the hold to <span class="num">${(FS_OS / 1000).toFixed(1)}</span> kHz, where its aperture costs <span class="num">${ZOH_20K_OS.toFixed(3)}</span> dB at 20 kHz instead of <span class="num">${ZOH_20K.toFixed(2)}</span> dB — the un-oversampled hold costs <span class="num">${ZOH_NYQ.toFixed(2)}</span> dB at f<sub>s</sub>/2 and puts a null at f<sub>s</sub>. The analogue filter removes what is left.</p></div>
<div class="eq">y(t) = Σₙ x[n] · sinc(t/T − n)
<span class="c">T = 1/44 100 = 22.676 µs</span></div>
<div class="key"><span class="lab">The idea</span><p>Two points per cycle is enough. A 20 kHz tone gets <span class="num">${SAMPLES_PER_CYCLE.toFixed(3)}</span> of them, looks like nothing on a plot, and reconstructs exactly.</p></div>
<h3>Arithmetic</h3>
<ul>
<li>Full scale is <span class="num">${VFS_RMS.toFixed(3)}</span> V rms, <span class="num">${VFS.toFixed(3)}</span> V peak, so the ${WORD}-bit LSB is <span class="num">${(LSB24 * 1e9).toFixed(1)} nV</span>. One 1 kΩ resistor makes <span class="num">${(V_JOHNSON * 1e9).toFixed(0)} nV</span> of noise of its own in 20 kHz, so the bottom bit sits <span class="num">${Math.abs(LSB_VS_KTB).toFixed(1)}</span> dB below it. At ${WORD_CD} bits the step is <span class="num">${(LSB16 * 1e6).toFixed(1)} µV</span>, 256 times larger.</li>
<li>Ideal quantisation is <span class="num">6.02 × ${WORD_CD} + 1.76 = ${SNR16.toFixed(1)}</span> dB at ${WORD_CD} bits and <span class="num">${SNR24.toFixed(1)}</span> dB at ${WORD}.</li>
<li>Shaping by |1−z⁻¹|² drops the one-bit noise density <span class="num">${Math.abs(NTF_20K).toFixed(1)}</span> dB at 20 kHz. A one-bit loop cannot take full scale, so this one runs <span class="num">${HEADROOM_DB.toFixed(2)}</span> dB down; referring its measured in-band noise back to full scale gives <span class="num">${dr}</span> dB against a model of <span class="num">${SNR_MODEL.toFixed(1)}</span>. The <span class="num">${gap}</span> dB shortfall is that model's white-error assumption failing: a one-bit quantiser makes idle tones, not noise.</li>
</ul>`;
  },

  readouts() {
    const st = this._latch(false);
    return [
      { k: 'FS', v: (FS / 1000).toFixed(2), u: 'kHz', cls: 'acc' },
      { k: 'CURSOR n+\u00bd', v: `${st.n}.5`, u: `of ${N_WIN}` },
      { k: 'y(t)', v: (st.v >= 0 ? '+' : '−') + Math.abs(st.v).toFixed(3), u: 'V', cls: 'acc' },
      { k: 'HOLD ERR', v: (st.err >= 0 ? '+' : '−') + Math.abs(st.err).toFixed(0), u: 'mV', cls: 'am' },
      { k: 'IN-BAND DR', v: SPEC.drFs.toFixed(1), u: 'dBFS' },
      { k: 'ZOH \u00d78 20 kHz', v: ZOH_20K_OS.toFixed(3).replace('-', '\u2212'), u: 'dB', cls: 'am' },
    ];
  },
};
