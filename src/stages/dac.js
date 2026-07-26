import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/**
 * DIGITAL TO ANALOGUE — where the staircase myth dies.
 *
 * Nothing on screen is drawn from memory:
 *   · the reconstruction is Σ x[n]·sinc(t/T − n) with every kernel shown
 *   · the zero-order hold appears only as the intermediate the output stage
 *     emits, with its computed aperture droop, and is then removed
 *   · the Δ-Σ spectrum is a 65 536-point FFT of the actual bit stream that is
 *     scrolling on screen, taken at boot
 *
 * Time: timeScale 2e-5, so one sample period (22.676 µs) takes 1.13 s of wall
 * clock and one modulator bit (354.3 ns) takes 17.7 ms. Both layers run on the
 * same clock; the bit layer is 64× faster exactly as it is in the hardware.
 */

// ---------------------------------------------------------------------------
// 1. Constants — every one of these is derived
// ---------------------------------------------------------------------------
const FS = 44100;                     // Hz
const T_S = 1 / FS;                   // 22.6757 µs
const NYQ = FS / 2;                   // 22 050 Hz
const WORD = 24;                      // bits
const VFS = 2.0;                      // V, full-scale peak (±2 V, 4 V p-p)

const LSB24 = DSP.lsbVolts(24, VFS);  // 2.3842e-7 V = 238.4 nV
const LSB16 = DSP.lsbVolts(16, VFS);  // 6.1035e-5 V = 61.04 µV
const SNR16 = DSP.quantSnrDb(16);     // 98.09 dB
const SNR24 = DSP.quantSnrDb(24);     // 146.26 dB

const ZOH_NYQ = DSP.zohDb(NYQ, FS);   // −3.9224 dB  (sinc(1/2) = 2/π)
const ZOH_20K = DSP.zohDb(20000, FS); // −3.1678 dB
const OSR_DIG = 8;                    // digital interpolation ratio
const FS_OS = FS * OSR_DIG;           // 352 800 Hz hold rate after ×8
const ZOH_20K_OS = DSP.zohDb(20000, FS_OS); // −0.0460 dB

/** Johnson–Nyquist noise: v = √(4·k·T·R·B), 1 kΩ, 20 kHz, 20 °C. */
const K_B = 1.380649e-23, T_KELVIN = 293.15, R_J = 1000, BW_J = 20000;
const V_JOHNSON = Math.sqrt(4 * K_B * T_KELVIN * R_J * BW_J); // 5.690e-7 V
const LSB_VS_KTB = 20 * Math.log10(LSB24 / V_JOHNSON);        // −7.56 dB

/** Analogue reconstruction filter: 3rd-order Butterworth, fc = 80 kHz. */
const FC_REC = 80000, N_REC = 3;
const recFiltDb = (f) => -10 * Math.log10(1 + Math.pow(f / FC_REC, 2 * N_REC));

// Δ-Σ modulator
const OSR = 64;
const FS_MOD = FS * OSR;              // 2 822 400 Hz
const T_BIT = 1 / FS_MOD;             // 354.31 ns
const NS_ORDER = 2;                   // error feedback, NTF = (1 − z⁻¹)²
const SNR_MODEL = DSP.noiseShapedSnrDb(1, NS_ORDER, OSR);  // 85.19 dB
const MOD_GAIN = 0.5;                 // 1-bit loops need input headroom
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

const N_WIN = 16;      // sample periods shown = 362.81 µs
const N_OFF = 36;      // window origin, picked so the excerpt sits about zero
const CTX = 40;        // kernels either side included in the sum
const N_LO = -CTX, N_HI = N_WIN + CTX;

const SMP = new Float64Array(N_HI - N_LO + 1);
for (let n = N_LO; n <= N_HI; n++) SMP[n - N_LO] = sigAt((n + N_OFF) * T_S);
const smp = (n) => SMP[n - N_LO];

/** Σ x[n]·sinc(x − n). `kMax` limits the *visible* kernels for the build-up. */
function reconstruct(x, kMax = N_WIN) {
  let y = 0;
  for (let n = N_LO; n <= N_HI; n++) {
    if (n >= 0 && n <= N_WIN && n > kMax) continue;
    y += smp(n) * DSP.sinc(x - n);
  }
  return y;
}

// Near-Nyquist demonstration: 20 kHz sampled at 44.1 kHz = 2.205 points/cycle
const F_NEAR = 20000;
const SAMPLES_PER_CYCLE = FS / F_NEAR;                 // 2.2050
const nearAt = (t) => Math.sin(2 * Math.PI * F_NEAR * t + 0.6);
const SMP_N = new Float64Array(N_HI - N_LO + 1);
for (let n = N_LO; n <= N_HI; n++) SMP_N[n - N_LO] = nearAt(n * T_S);
function reconstructNear(x) {
  let y = 0;
  for (let n = N_LO; n <= N_HI; n++) y += SMP_N[n - N_LO] * DSP.sinc(x - n);
  return y;
}

// ---------------------------------------------------------------------------
// 3. A real Δ-Σ modulator and a real FFT of its output
// ---------------------------------------------------------------------------
/**
 * 2nd-order error-feedback modulator. y = x + (1 − z⁻¹)²·e — the quantisation
 * error is shaped by |1 − z⁻¹|², the signal passes untouched.
 *
 * core/dsp.js exports deltaSigmaStep, but its cascade latches at order 2 and
 * diverges at order 3 (see the report), so the loop is written out here.
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

const SPEC = { binHz: FS_MOD / N_FFT, snrMeas: 0, floorAt: () => -140 };

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
const LID_LIFT = 0.036;                    // lifted, then tilted about its rear edge
const LID_TILT = 0.085;                    // rad — front edge tops out 11 mm under the shelf

/** Backlit front-panel readout: one canvas, one draw call, crisp at range. */
function displayTexture() {
  const w = 1024, h = 190;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);

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
  bd.color.setHex(0xa4b0a8);                  // knock the solder mask back
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
  canMat.color.setHex(0xb4bac1);
  canMat.roughness = 0.34;
  canMat.envMapIntensity = 1.5;
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
  sinkMat.color.setHex(0x676d75);
  const sink = GEO.heatsink(0.056, 0.024, 0.020, 10, { mat: sinkMat });
  sink.position.set(0.205, yF + 0.013, -0.040);
  sink.rotation.y = Math.PI / 2;
  g.add(sink);

  // toroidal supply at the rear
  const toroid = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.013, 12, 40), M.magnetWire);
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

  // ---- fascia ----
  const zF = D_C / 2 - 0.008;
  const faceMat = M.alu.clone();
  faceMat.roughness = 0.28;
  faceMat.envMapIntensity = 1.55;
  const face = new THREE.Mesh(GEO.bevelBox(W_C + 0.008, H_BODY + 0.004, 0.016, 0.0026, 5), faceMat);
  face.position.set(0, 0.003, zF);
  face.castShadow = face.receiveShadow = true;
  g.add(face);
  const band = new THREE.Mesh(GEO.bevelBox(W_C - 0.030, 0.050, 0.0022, 0.0008, 2), M.anodGrey);
  band.position.set(0, 0.005, zF + 0.0085);
  g.add(band);

  const glass = new THREE.Mesh(GEO.bevelBox(0.300, 0.044, 0.0035, 0.0009, 3), M.glass);
  glass.position.set(-0.092, 0.005, zF + 0.0100);
  glass.castShadow = true;
  g.add(glass);
  const disp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.284, 0.0390),
    new THREE.MeshBasicMaterial({
      map: displayTexture(), transparent: true, toneMapped: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  disp.position.set(-0.092, 0.005, zF + 0.0119);
  disp.renderOrder = 3;
  g.add(disp);

  // machined filter-select buttons, one lit
  const btnGeo = GEO.bevelCyl(0.0086, 0.0092, 0.0045, 28, 0.0006);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(btnGeo, M.alu);
    b.rotation.x = Math.PI / 2;
    b.position.set(0.098 + i * 0.026, -0.010, zF + 0.0090);
    b.castShadow = true;
    g.add(b);
    const led = new THREE.Mesh(GEO.bevelBox(0.008, 0.0013, 0.0006, 0.0003, 2),
      i === 1 ? M.ledCyan : M.plastic);
    led.position.set(0.098 + i * 0.026, 0.0065, zF + 0.0084);
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
  const lidPlate = new THREE.Mesh(GEO.bevelBox(W_C - 0.020, 0.005, D_C - 0.026, 0.0018, 3), M.anodBlack);
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
// 5. Overlay — one instrument board, six panels plus an amplitude ruler
// ---------------------------------------------------------------------------
const BW = 0.96, BDH = 0.58, CW = 0.445, COL2 = 0.515;
const PAN = {
  E:  { x: 0.000, y: 0.000, w: BW, h: 0.038 },
  F:  { x: 0.000, y: 0.086, w: CW, h: 0.086 },
  B:  { x: 0.000, y: 0.222, w: CW, h: 0.106 },
  A:  { x: 0.000, y: 0.378, w: CW, h: 0.172 },
  D2: { x: COL2, y: 0.086, w: CW, h: 0.142 },
  D:  { x: COL2, y: 0.272, w: CW, h: 0.066 },
  C:  { x: COL2, y: 0.378, w: CW, h: 0.172 },
};

const N_BITS_SHOWN = 256;              // exactly 4 sample periods
const BUILD_S = 2.0;                   // presentation seconds to lay in 17 kernels
const CYCLE_S = 9.0;

/**
 * A flat backing plate. Built locally rather than with DIAG.diagramCard because
 * that helper installs a group-level userData.setOpacity which fadeTree runs
 * *before* it records the child plate's base opacity — so the plate is captured
 * at 0 and never becomes visible again.
 */
function plate(w, h, color, opacity, z, order) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.position.set(w / 2, h / 2, z);
  m.renderOrder = order;
  return m;
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
  shot: { position: [0.70, 1.16, -1.30], target: [-0.02, 0.80, -2.94], fov: 33 },
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    runModulator();
    analyseStream();

    const hardware = buildHardware();

    const overlay = new THREE.Group();
    overlay.position.set(-0.185, 0.99, -2.88);
    overlay.rotation.y = 0.18;
    const root = new THREE.Group();
    root.position.set(-BW / 2, -BDH / 2, 0);
    overlay.add(root);

    const S = this._s = {};

    // one solid backing plate for the whole instrument board, plus a lighter
    // tone behind each panel so the six read as separate instruments
    const pad = 0.026;
    const back = plate(BW + pad * 2, BDH + pad * 2, 0x05070a, 0.96, -0.006, 2);
    back.position.x -= pad; back.position.y -= pad;
    root.add(back);
    const edge = new DIAG.Trace(5, 0x3d4652, 1.0, { opacity: 0.8, renderOrder: 3 });
    edge.write((i) => [[-pad, -pad], [BW + pad, -pad], [BW + pad, BDH + pad],
      [-pad, BDH + pad], [-pad, -pad]][i].concat(-0.005));
    root.add(edge);
    for (const k in PAN) {
      const q = PAN[k];
      const t = plate(q.w + 0.014, q.h + 0.014, 0x0e1319, 0.55, -0.0035, 4);
      t.position.x += q.x - 0.007; t.position.y += q.y - 0.007;
      root.add(t);
    }

    // one instanced swarm carries every sample dot and marker on the board
    const dots = new DIAG.Swarm(N_WIN * 2 + 6, { color: PAL.ink, size: 0.0038, additive: false });
    root.add(dots);
    S.dots = dots;

    // ===== A · reconstruction ==============================================
    {
      const p = PAN.A;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xRange: [0, N_WIN], yRange: [-1.12, 1.12],
        xTicks: [0, 2, 4, 6, 8, 10, 12, 14, 16], yTicks: [-1, -0.5, 0, 0.5, 1],
        zeroLine: 0,
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      S.gA = g;

      S.kernels = [];
      for (let n = 0; n <= N_WIN; n++) {
        const t = new DIAG.Trace(190, PAL.cyDim, 1.1, { opacity: 0.95, renderOrder: 10 });
        const a = smp(n);
        t.write((i, u) => {
          const x = u * N_WIN;
          return [g.x(x), g.y(a * DSP.sinc(x - n)), 0.0006];
        });
        t.visible = false;
        g.add(t);
        S.kernels.push(t);
      }
      S.sumA = new DIAG.Trace(420, PAL.cy, 2.6, { renderOrder: 13 });
      g.add(S.sumA);
      S.sweep = new DIAG.Trace(2, PAL.cy, 1.2, { opacity: 0.5, dashed: true, dashSize: 0.006, gapSize: 0.005, renderOrder: 12 });
      g.add(S.sweep);
    }

    // ===== B · zero-order hold ==============================================
    {
      const p = PAN.B;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xRange: [0, N_WIN], yRange: [-1.12, 1.12],
        xTicks: [0, 4, 8, 12, 16], yTicks: [-1, 0, 1], zeroLine: 0,
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      S.gB = g;

      const stair = new DIAG.Trace(2 * (N_WIN + 1) + 1, PAL.rd, 1.9, { opacity: 0.78, renderOrder: 11 });
      stair.write((i) => {
        const n = Math.min(N_WIN, Math.floor(i / 2));
        const x = Math.min(N_WIN, (i + 1) >> 1);
        return [g.x(x), g.y(smp(n)), 0.0005];
      });
      g.add(stair);

      S.recB = new DIAG.Trace(420, PAL.cy, 2.4, { renderOrder: 13 });
      S.recB.write((i, u) => [g.x(u * N_WIN), g.y(reconstruct(u * N_WIN)), 0.0008]);
      g.add(S.recB);
    }

    // ===== F · two points per cycle =========================================
    {
      const p = PAN.F;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xRange: [0, N_WIN], yRange: [-1.2, 1.2],
        xTicks: [0, 4, 8, 12, 16], yTicks: [-1, 0, 1], zeroLine: 0,
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      S.gF = g;

      S.recF = new DIAG.Trace(520, PAL.cy, 3.0, { renderOrder: 12 });
      S.recF.write((i, u) => [g.x(u * N_WIN), g.y(reconstructNear(u * N_WIN)), 0.0007]);
      g.add(S.recF);

      // the original 20 kHz sine, dashed on top: the two curves coincide
      const ref = new DIAG.Trace(520, PAL.gr, 1.6, {
        opacity: 1, dashed: true, dashSize: 0.014, gapSize: 0.011, renderOrder: 14,
      });
      ref.write((i, u) => [g.x(u * N_WIN), g.y(nearAt(u * N_WIN * T_S)), 0.0011]);
      g.add(ref);
    }

    // ===== C · aperture and images ==========================================
    {
      const p = PAN.C;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xLog: true, xRange: [4000, 160000], yRange: [-30, 3],
        yTicks: [-30, -20, -10, 0], zeroLine: 0,
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      xBand(g, 4000, 20000, PAL.cy, 0.055);
      g.addTrace((f) => DSP.zohDb(f, FS), { color: PAL.rd, width: 1.6, n: 800, opacity: 0.8 });
      g.addTrace((f) => DSP.zohDb(f, FS_OS), { color: PAL.cy, width: 2.2, n: 500 });
      g.addTrace(recFiltDb, { color: PAL.gr, width: 1.6, n: 400, dashed: true, opacity: 0.9 });
      g.addMarker(NYQ, { color: PAL.am, width: 1.2, opacity: 0.5 });

      // the 9 kHz tone and its images about multiples of fs, at aperture height
      for (const fi of [9000, FS - 9000, FS + 9000, 2 * FS - 9000, 2 * FS + 9000,
        3 * FS - 9000, 3 * FS + 9000]) {
        const st = new DIAG.Trace(2, PAL.am, 2.0, { opacity: 0.95, renderOrder: 12 });
        st.write((i) => [g.x(fi), i === 0 ? g.y(-30) : g.y(DSP.zohDb(fi, FS)), 0.001]);
        g.add(st);
      }
      g.addDot(PAL.rd, 0.0042).userData.setData(NYQ, ZOH_NYQ);
    }

    // ===== D · the 1-bit stream ============================================
    {
      const p = PAN.D;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xRange: [0, N_BITS_SHOWN], yRange: [-1.15, 1.15],
        xTicks: [0, 64, 128, 192, 256], yTicks: [-1, 0, 1], zeroLine: 0,
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      S.gD = g;
      S.stream = new DIAG.Trace(N_BITS_SHOWN * 2 + 2, PAL.cy, 1.1, { opacity: 0.42, renderOrder: 11 });
      g.add(S.stream);
      S.boxcar = new DIAG.Trace(N_BITS_SHOWN, PAL.gr, 2.8, { renderOrder: 13 });
      g.add(S.boxcar);
    }

    // ===== D2 · shaped noise, measured =====================================
    {
      const p = PAN.D2;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xLog: true, xRange: [3000, FS_MOD / 2], yRange: [-160, 0],
        yTicks: [-160, -120, -80, -40, 0],
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      xBand(g, 3000, 20000, PAL.cy, 0.055);
      g.addTrace((f) => SPEC.floorAt(f), { color: PAL.am, width: 1.5, n: 480, opacity: 0.92 });
      g.addTrace((f) => SPEC.floorAt(f) + recFiltDb(f), { color: PAL.cy, width: 2.0, n: 480 });
      g.addTrace(recFiltDb, { color: PAL.gr, width: 1.5, n: 300, dashed: true, opacity: 0.85 });
      g.addMarker(NYQ, { color: PAL.am, width: 1.2, opacity: 0.5 });
    }

    // ===== E · amplitude ruler ==============================================
    {
      const p = PAN.E;
      const g = new DIAG.Graph({
        w: p.w, h: p.h, xLog: true, xRange: [1e-8, 4], yRange: [0, 1],
        xTicks: [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1],
        yTicks: [], zeroLine: null,
      });
      g.position.set(p.x, p.y, 0);
      root.add(g);
      S.gE = g;
      xBand(g, 1e-8, V_JOHNSON, PAL.rd, 0.07);
      S.stemV = [LSB24, V_JOHNSON, LSB16, VFS];
      const cols = [PAL.cy, PAL.rd, PAL.cy, PAL.ink];
      S.stemV.forEach((v, i) => {
        const st = new DIAG.Trace(2, cols[i], 2.2, { renderOrder: 12 });
        st.write((k) => [g.x(v), k === 0 ? 0 : g.o.h * 0.80, 0.001]);
        g.add(st);
      });
    }

    // ---- labels ------------------------------------------------------------
    const L = ctx.labels;
    const anchor = (lx, ly) => {
      const o = new THREE.Object3D();
      o.position.set(lx, ly, 0.004);
      root.add(o);
      return o;
    };
    const top = (p, frac) => anchor(p.x + p.w * frac, p.y + p.h + 0.004);

    S.labA = L.add(top(PAN.A, 0.42), {
      kicker: 'Reconstruction · sum of sincs',
      value: '17 of 17 kernels', cls: 'acc', offset: [0, -15],
    });
    L.add(top(PAN.B, 0.32), {
      kicker: 'Zero-order hold · the intermediate',
      value: `${ZOH_NYQ.toFixed(2)} dB at fs/2 · ${ZOH_20K.toFixed(2)} dB at 20 k`,
      cls: 'am', offset: [0, -15],
    });
    L.add(top(PAN.F, 0.30), {
      kicker: '20 kHz sampled at 44.1 kHz',
      value: `${SAMPLES_PER_CYCLE.toFixed(3)} points per cycle — exact`,
      cls: 'acc', offset: [0, -15],
    });
    L.add(top(PAN.C, 0.34), {
      kicker: 'Aperture and images',
      value: `hold ×8: ${ZOH_20K_OS.toFixed(3)} dB at 20 kHz`,
      cls: 'acc', offset: [0, -15],
    });
    S.labD = L.add(top(PAN.D, 0.34), {
      kicker: 'Δ-Σ 1-bit stream · 2.8224 MHz',
      value: '64 bits per sample · 1 : 5.0×10⁴', cls: 'acc', offset: [0, -15],
    });
    L.add(top(PAN.D2, 0.36), {
      kicker: 'Shaped noise · measured FFT',
      value: `in-band ${SPEC.snrMeas.toFixed(1)} dB · model ${SNR_MODEL.toFixed(1)} dB`,
      cls: 'am', offset: [0, -15],
    });
    L.add(anchor(PAN.E.x + S.gE.x(LSB24), PAN.E.y + PAN.E.h), {
      kicker: 'Amplitude floor, ±2 V',
      value: `LSB ${(LSB24 * 1e9).toFixed(1)} nV · 1 kΩ kTB ${(V_JOHNSON * 1e9).toFixed(0)} nV`,
      cls: 'am', offset: [86, -15],
    });
    L.add(anchor(PAN.E.x + S.gE.x(VFS), PAN.E.y + PAN.E.h), {
      kicker: 'Full scale',
      value: `${VFS.toFixed(3)} V · 16-bit LSB ${(LSB16 * 1e6).toFixed(2)} µV`,
      offset: [-92, -15],
    });

    const hwAnchor = new THREE.Object3D();
    hwAnchor.position.set(-0.09, -0.046, 0.20);
    hardware.add(hwAnchor);
    L.add(hwAnchor, {
      kicker: 'Analogue | digital',
      text: 'screened clock, split ground',
      offset: [0, 24],
    });

    S.phase = 0;
    S.nAcc = -1;
    return { hardware, overlay };
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

    // Presentation clock: real seconds scaled by the user's rate. The physics
    // runs on `t`; only the draw-on of the diagram runs on this.
    S.phase = (S.phase + dt / TIME_SCALE) % CYCLE_S;
    const build = DSP.clamp(S.phase / BUILD_S, 0, 1);
    const nAcc = Math.min(N_WIN, Math.floor(build * (N_WIN + 1)) - 1);

    if (nAcc !== S.nAcc) {
      S.nAcc = nAcc;
      const g = S.gA;
      for (let n = 0; n <= N_WIN; n++) {
        S.kernels[n].visible = n <= nAcc;
        S.kernels[n].material.color.setHex(n === nAcc ? PAL.cy : PAL.cyDim);
      }
      S.sumA.write((i, u) => {
        const x = u * N_WIN;
        return [g.x(x), g.y(reconstruct(x, nAcc)), 0.0009];
      });
      S.labA.setValue(`${nAcc + 1} of ${N_WIN + 1} kernels`);
      const done = nAcc >= N_WIN;
      S.sweep.visible = !done;
      if (!done) {
        const xs = g.x(Math.max(0, nAcc));
        S.sweep.write((i) => [xs, i === 0 ? 0 : g.o.h, 0.0012]);
      }
      const f = done ? 1 : DSP.clamp((nAcc + 1) / (N_WIN + 1), 0.02, 1);
      S.recB.setProgress(f);
      S.recF.setProgress(f);
    }

    // ---- the 1-bit stream, at its true rate ------------------------------
    const g = S.gD;
    const p = t / T_BIT;
    const i0 = Math.floor(p), frac = p - i0;
    const bit = (j) => BITS_BUF[(i0 + j) & (N_FFT - 1)];
    S.stream.write((i) => {
      const j = Math.min(N_BITS_SHOWN, i >> 1);
      const x = Math.min(N_BITS_SHOWN, (i + 1) >> 1) - frac;
      return [g.x(DSP.clamp(x, 0, N_BITS_SHOWN)), g.y(bit(j)), 0.0006];
    });
    // 64-bit boxcar — one sample period of decimation. Its output is the audio.
    S.boxcar.write((i, u) => {
      const j0 = Math.round(u * N_BITS_SHOWN);
      let s = 0;
      for (let k = -32; k < 32; k++) s += bit(j0 + k);
      return [g.x(DSP.clamp(j0 - frac, 0, N_BITS_SHOWN)), g.y(s / 64), 0.0009];
    });

    // ---- sample dots and ruler markers, all in one instanced swarm --------
    const A = PAN.A, F = PAN.F, E = PAN.E;
    S.dots.update((i) => {
      if (i <= N_WIN) {
        return { p: [A.x + S.gA.x(i), A.y + S.gA.y(smp(i)), 0.0016], s: 1, c: PAL.ink };
      }
      if (i <= N_WIN * 2 + 1) {
        const n = i - N_WIN - 1;
        return { p: [F.x + S.gF.x(n), F.y + S.gF.y(SMP_N[n - N_LO]), 0.0016], s: 1, c: PAL.ink };
      }
      const k = i - (N_WIN * 2 + 2);
      const v = S.stemV[k];
      if (v === undefined) return null;
      return {
        p: [E.x + S.gE.x(v), E.y + E.h * 0.80, 0.0016], s: 1.1,
        c: [PAL.cy, PAL.rd, PAL.cy, PAL.ink][k],
      };
    });
  },

  content() {
    const snr = SPEC.snrMeas ? SPEC.snrMeas.toFixed(1) : '\u2014';
    return `
<h3>The unique curve</h3>
<p>A converter is handed <span class="num">44 100</span> numbers a second and has to make a voltage. The sampling theorem does not say those numbers are "enough points to draw the wave". It says that <em>if</em> the recording held nothing at or above <span class="num">22 050</span> Hz, exactly one band-limited function passes through them.</p>
<p>That function is a sum of sinc kernels, one centred on every sample and scaled by it. Because sinc is <b>1</b> at its own sample instant and <b>exactly zero</b> at every other one, the sum meets every dot and stays smooth between them.</p>
<div class="eq">y(t) = \u03a3\u2099 x[n] \u00b7 sinc(t/T \u2212 n)
<span class="c">T = 1/44 100 = 22.676 \u00b5s</span></div>
<div class="myth"><span class="lab">Commonly got wrong</span><p>The staircase. A chip does emit steps — holding each value until the next update is what the output stage physically does — but the hold is an artefact of that stage and the reconstruction filter removes it. Its aperture costs <span class="num">\u22123.92</span> dB at f<sub>s</sub>/2 and puts a null at 44.1 kHz. Recorded sound never looks like stairs.</p></div>
<h3>Arithmetic</h3>
<ul>
<li>16-bit: <span class="num">6.02 \u00d7 16 + 1.76 = ${SNR16.toFixed(1)}</span> dB. 24-bit: <span class="num">${SNR24.toFixed(1)}</span> dB.</li>
<li>The 24-bit LSB over \u00b12 V is <span class="num">${(LSB24 * 1e9).toFixed(1)} nV</span>; a 1 k\u03a9 resistor makes <span class="num">${(V_JOHNSON * 1e9).toFixed(0)} nV</span> of its own noise in 20 kHz, so the bottom bit sits <span class="num">${Math.abs(LSB_VS_KTB).toFixed(1)}</span> dB below one component's floor.</li>
<li>Shaping by |1\u2212z\u207b\u00b9|\u00b2 drops the one-bit noise density <span class="num">${Math.abs(NTF_20K).toFixed(1)}</span> dB at 20 kHz. In band the model gives <span class="num">${SNR_MODEL.toFixed(1)}</span> dB; this modulator measures <span class="num">${snr}</span> dB — white-noise assumptions flatter a one-bit quantiser.</li>
<li>Interpolating \u00d78 moves the hold to <span class="num">352.8</span> kHz, where the aperture costs <span class="num">${ZOH_20K_OS.toFixed(3)}</span> dB at 20 kHz.</li>
</ul>
<div class="key"><span class="lab">The idea</span><p>Two points per cycle is enough. The 20 kHz trace has <span class="num">2.205</span> of them, looks like nothing, and reconstructs exactly.</p></div>
<h3>Colour</h3>
<p>Cyan is the reconstruction; red the hold and the sub-thermal region; green the original wave and the analogue filter; amber measured noise.</p>`;
  },

  readouts() {
    return [
      { k: 'FS', v: (FS / 1000).toFixed(2), u: 'kHz', cls: 'acc' },
      { k: 'WORD', v: String(WORD), u: 'bit' },
      { k: 'NYQUIST', v: (NYQ / 1000).toFixed(2), u: 'kHz', cls: 'acc' },
      { k: 'LSB', v: (LSB24 * 1e9).toFixed(1), u: 'nV', cls: 'am' },
      { k: 'SNR 24-BIT', v: SNR24.toFixed(1), u: 'dB' },
      { k: 'ZOH 20 kHz', v: ZOH_20K.toFixed(2), u: 'dB', cls: 'am' },
    ];
  },
};
