import * as THREE from 'three';
import { LAYOUT, SAFE, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { DIGITAL } from '../core/spec.js';

/**
 * DIGITAL TO ANALOGUE — where the staircase myth dies.
 *
 * ONE card, ONE plot region, and the converter itself as the hero.
 *   · the samples, all seventeen sinc kernels, the zero-order hold the output
 *     stage actually emits (amber), and the one band-limited curve that fits
 *     the samples (cyan). The myth and its removal in a single frame.
 *
 * The Δ-Σ spectrum that used to occupy a second plot region is still MEASURED
 * — a 65 536-point FFT of a real second-order modulator runs at build — but it
 * is quoted in the instrument cluster and the prose rather than drawn. Two
 * plots on one card at this framing put the diagram at four times the hero's
 * mass and neither plot was legible; one plot, twice the size, is the trade.
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
const SNR16 = DSP.quantSnrDb(WORD_CD);      // 98.09 dB

const ZOH_20K = DSP.zohDb(20000, FS);       // −3.1678 dB, non-oversampling
const OSR_DIG = 8;                          // CHOSEN digital interpolation ratio
const FS_OS = FS * OSR_DIG;                 // 352 800 Hz hold rate after ×8
const ZOH_20K_OS = DSP.zohDb(20000, FS_OS); // −0.0460 dB

/** Johnson–Nyquist noise: v = √(4·k·T·R·B), 1 kΩ, 20 kHz, 20 °C. */
const K_B = 1.380649e-23, T_KELVIN = 293.15, R_J = 1000, BW_J = 20000;
const V_JOHNSON = Math.sqrt(4 * K_B * T_KELVIN * R_J * BW_J); // 5.690e-7 V
const LSB_VS_KTB = 20 * Math.log10(LSB24 / V_JOHNSON);        // −4.54 dB

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

/** Thin-space grouping, so 44 100 and 22 050 in the prose are the imported
 *  primary and its half rather than two more numbers typed by hand. */
const grp = (v) => Math.round(v).toLocaleString('en-GB').replace(/,/g, ' ');

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

const SPEC = { binHz: FS_MOD / N_FFT, snrMeas: 0, drFs: 0 };

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
}

// ---------------------------------------------------------------------------
// 4. Hardware
// ---------------------------------------------------------------------------
const H_TOT = 0.092;
const H_BODY = 0.086;
const FOOT = 0.006;
const W_C = LAYOUT.rack.w - 0.03;          // 0.555
const D_C = LAYOUT.rack.d - 0.06;          // 0.440
const LID_LIFT = 0.016;                    // lifted, then tilted about its rear edge
const LID_TILT = 0.022;                    // rad. Any more and the lid mirrors the front strip

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

/**
 * THE SPECULAR LAYER, as a texture.
 *
 * A cover-glass reflection is not a fog. It is the image of a source with a
 * boundary: bright core, a short fall to the rim, then nothing. The round-2
 * version of this was a wide radial-ish ramp at more than three times this
 * amplitude and it read as an uncorrected lens flare over the whole card. The
 * stops below give the band a leading edge that stays inside two per cent of
 * the panel's width — the boundary is what makes it read as glass.
 */
function sheenTexture(angle = -0.34) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  x.translate(s / 2, s / 2);
  x.rotate(angle);
  const g = x.createLinearGradient(0, -s * 0.85, 0, s * 0.85);
  g.addColorStop(0.000, 'rgba(255,255,255,0)');
  g.addColorStop(0.300, 'rgba(255,255,255,0)');
  g.addColorStop(0.318, 'rgba(255,255,255,0.62)');   // the leading edge
  g.addColorStop(0.400, 'rgba(255,255,255,0.44)');
  g.addColorStop(0.520, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.640, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.720, 'rgba(255,255,255,0)');
  g.addColorStop(1.000, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(-s, -s, s * 2, s * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
  wire.color.setHex(0x4a3020);
  wire.roughness = 0.62;
  wire.envMapIntensity = 0.32;
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
  // The chapter's subject should not be the dimmest fascia in the bay stack.
  // The widened strips carry a ramp across the chamfer at this gain instead of
  // the clipped line they gave when they were narrow and hot.
  faceMat.roughness = 0.275;
  faceMat.envMapIntensity = 1.80;
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

  /* THE SPECULAR LAYER over the display. A lit panel with nothing in front of
     it reads as a decal at any resolution. This is a real cover glass with a
     2.2 mm bulge (R ≈ 0.14 m across the short axis) and a tight clearcoat, so
     the widened front strip crosses it as a band with a defined edge and the
     glyphs sit behind that band.

     Transmission is the wrong tool: three.js's transmissive path leaves a lit
     diffuse residue and a blurred backdrop, and this panel sits 15 mm from a
     lit shelf strip, so the glyph field went milky. A thin, nearly clear alpha
     layer with a strong environment gain gives the same physics where it
     matters — a curvature-driven specular band that moves with the camera. */
  const lensMat = M.clearGlass.clone();
  lensMat.transmission = 0;
  lensMat.color.setHex(0x0b0f14);
  lensMat.opacity = 0.14;
  lensMat.roughness = 0.045;
  lensMat.clearcoat = 1.0;
  lensMat.clearcoatRoughness = 0.035;
  lensMat.depthWrite = false;
  lensMat.envMapIntensity = 4.2;
  const lens = new THREE.Mesh(lensGeometry(0.300, 0.0440, 0.0022, 34, 12), lensMat);
  lens.position.set(-0.092, 0.005, zF + 0.0116);
  lens.renderOrder = 4;
  g.add(lens);

  /* …and the reflected strip itself, as a band with a leading edge. The glass
     above supplies the physics; this supplies the guarantee that the band is
     ON the panel at this camera azimuth rather than just off its edge. */
  const gleam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.300, 0.0440),
    new THREE.MeshBasicMaterial({
      map: sheenTexture(0.10), color: 0x9fb6cc, transparent: true, opacity: 0.20,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
  gleam.position.set(-0.092, 0.005, zF + 0.0121);
  gleam.renderOrder = 5;
  g.add(gleam);

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
  /* The lid is lifted and tilted, which points its top face straight at the
     wide front strip: at clearcoat roughness 0.028 it mirrored the strip as a
     blown white streak the width of the chassis. Slackening the clearcoat and
     halving the env gain turns that into a ramp across the panel — the lid is
     lacquer, not a mirror. */
  const lidMat = (M.pianoBlack || M.anodBlack).clone();
  lidMat.clearcoatRoughness = 0.10;
  lidMat.envMapIntensity = 0.55;
  const lidPlate = new THREE.Mesh(GEO.bevelBox(W_C - 0.020, 0.005, D_C - 0.026, 0.0018, 3), lidMat);
  lidPlate.castShadow = lidPlate.receiveShadow = true;
  lid.add(lidPlate);
  const vents = GEO.ventSlots(0.150, 0.230, 3, 12, { mat: M.plastic, sw: 0.0042, sd: 0.014 });
  vents.position.set(0.120, 0.0026, -0.030);
  lid.add(vents);
  const lidTrim = new THREE.Mesh(GEO.bevelBox(W_C - 0.060, 0.0016, 0.003, 0.0006, 2), M.anodGrey);
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
// 5. THE SHOT — the converter as the hero, one plate beside it
// ---------------------------------------------------------------------------
/*  Round 2 shipped fill 0.90 on a 92 mm chassis: the camera sat 1.03 m away,
    the rack was cropped top and bottom, the unit below was sliced by the frame
    edge and the diagram was forced to lie on the hero's own silhouette. The
    addendum caps fill at 0.34–0.42 when a diagram sits beside the hero.

    At fill 0.40 the lens is 2.318 m out and 1 m at the subject is 778 px, so
    the whole rack (1.128 m) is 877 px tall and fits the frame with its floor
    and its planar reflection showing. The rig is then TRUCKED 152 px so the
    rack sits right of the safe box's centre, and BOOMED 80 px so the rack top
    lands just inside it — which leaves 348 px of clear backdrop camera-left
    for the plate. Card and hero share no pixels.                            */
const AZ = 0.24, EL = 0.155, FOV = 31, FILL = 0.40;
const HERO_R = 0.216;                                    // the framed radius
const HERO_C = [LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.dac, H_TOT), LAYOUT.rack.z + D_C / 2];

const TAN_H = Math.tan((FOV * Math.PI) / 360);
const D_CAM = HERO_R / (FILL * SAFE.hFrac * TAN_H);      // 2.318 m
const PX_PER_M = 500 / (D_CAM * TAN_H);                  // 777.7 px per metre

const CAM_F = new THREE.Vector3(
  -Math.sin(AZ) * Math.cos(EL), -Math.sin(EL), -Math.cos(AZ) * Math.cos(EL));
const CAM_R = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));   // screen-right
const CAM_U = CAM_R.clone().cross(CAM_F);                          // screen-up

const TRUCK_PX = -152;    // −ve slides the subject RIGHT in frame
const BOOM_PX = 80;       // +ve slides the subject DOWN in frame

const _base = frameShot(HERO_C, HERO_R, { fill: FILL, az: AZ, el: EL, fov: FOV });
const _off = CAM_R.clone().multiplyScalar(TRUCK_PX / PX_PER_M)
  .addScaledVector(CAM_U, BOOM_PX / PX_PER_M);
const SHOT = {
  position: [_base.position[0] + _off.x, _base.position[1] + _off.y, _base.position[2] + _off.z],
  target: [_base.target[0] + _off.x, _base.target[1] + _off.y, _base.target[2] + _off.z],
  fov: FOV,
};

/**
 * The optical axis is NOT at x = 800, and it is not at 640 either. The Director
 * shifts the principal point to the centre of the clear band, which at 1600 px
 * is (railW + (w − panelW)) / 2 = (200 + 1140) / 2 = 670. Composing off 640 put
 * this card 30 px left of where the arithmetic said it was — most of the margin
 * the safe box has on that side.
 */
const AXIS_PX = 670;

/** World point on the ray through screen pixel (px,py) at AXIAL depth `dist`. */
function rayPoint(px, py, dist) {
  const r = CAM_F.clone()
    .addScaledVector(CAM_R, ((px - AXIS_PX) / 800) * TAN_H * 1.6)
    .addScaledVector(CAM_U, (-(py - 500) / 500) * TAN_H);
  return new THREE.Vector3(...SHOT.position).addScaledVector(r, dist);
}
/** Metres per screen pixel at an axial depth. */
const mpp = (dist) => (dist * TAN_H) / 500;

// ---------------------------------------------------------------------------
// 6. Overlay — ONE card, ONE plot region
// ---------------------------------------------------------------------------
// 330 × 196 px centred at (352, 388): x 187…517, y 290…486. Measured off the
// render: the chapter rail ends at 160 and the rack's left post starts at 564,
// so the plate has 27 px of margin on one side and 47 px on the other, and its
// lower edge clears the top of the left monoblock (y ≈ 512).
const CARD_D = 1.86;                       // metres from the lens — it floats
const CARD_PX = { w: 330, h: 196, cx: 352, cy: 388 };
const MPX = mpp(CARD_D);                   // 1.0316 mm per pixel out there
const CARD = { w: CARD_PX.w * MPX, h: CARD_PX.h * MPX };
const CARD_C = rayPoint(CARD_PX.cx, CARD_PX.cy, CARD_D);
/** Square to the lens is always a decal: yaw the plate 0.13 rad off the ray. */
const CARD_YAW = Math.atan2(SHOT.position[0] - CARD_C.x, SHOT.position[2] - CARD_C.z) - 0.13;

// plot box inside the plate, in pixels — the left margin holds the y numerals
const PAD = { l: 50, r: 14, t: 20, b: 30 };
const G1 = {
  x: PAD.l * MPX,
  y: PAD.b * MPX,
  w: (CARD_PX.w - PAD.l - PAD.r) * MPX,
  h: (CARD_PX.h - PAD.t - PAD.b) * MPX,
};

// ---------------------------------------------------------------------------

export default {
  id: 'dac',
  title: 'Digital to Analogue',
  nav: 'DAC',
  kicker: 'DAC',
  standfirst: 'Exactly one band-limited curve passes through those samples.',
  shot: SHOT,
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    runModulator();
    analyseStream();

    const M = mats();
    const hardware = buildHardware();

    const overlay = new THREE.Group();
    overlay.position.copy(CARD_C);
    overlay.rotation.y = CARD_YAW;
    const root = new THREE.Group();
    root.position.set(-CARD.w / 2, -CARD.h / 2, 0);
    overlay.add(root);

    const S = this._s = { t: 0, n: -1, state: { n: 0, v: 0, err: 0 } };

    /* THE PLATE, as an object rather than a pasted PNG: a machined slab with
       real thickness and a bevelled fillet, opaque and depth-writing so the
       rack behind cannot print through, and a separate convex cover glass in
       front of the traces so the plate carries a specular ramp of its own. */
    const slabMat = M.anodBlack.clone();
    slabMat.color.setHex(0x02040a);
    slabMat.metalness = 0.0;
    slabMat.roughness = 0.64;
    slabMat.envMapIntensity = 0.30;
    const slab = new THREE.Mesh(GEO.bevelBox(CARD.w, CARD.h, 0.013, 0.0026, 4), slabMat);
    slab.position.set(CARD.w / 2, CARD.h / 2, -0.0085);
    slab.castShadow = slab.receiveShadow = true;
    root.add(slab);
    /* No drawn border. A hairline rule a few pixels inside the slab's own
       silhouette doubles the edge and is most of what makes a card read as a
       pasted PNG; the bevelled fillet catching the front strip is the border. */

    // sample dots for the reconstruction plot
    const dots = new DIAG.Swarm(N_WIN + 1, { color: 0xccd3dc, size: 0.0023, additive: false });
    root.add(dots);
    S.dots = dots;

    // ===== the samples, the hold, and the one curve that fits ==============
    {
      const g = new DIAG.Graph({
        w: G1.w, h: G1.h, xRange: [0, N_WIN], yRange: [-1.18, 1.18],
        xTicks: [0, 2, 4, 6, 8, 10, 12, 14, 16], yTicks: [-1, -0.5, 0, 0.5, 1],
        zeroLine: 0,
      });
      g.position.set(G1.x, G1.y, 0);
      root.add(g);
      S.g1 = g;

      // the zero-order hold the output stage physically emits — AMBER, because
      // it is an intermediate, not a myth. Red is reserved for the myth callout.
      const stair = new DIAG.Trace(2 * (N_WIN + 1) + 1, PAL.am, 1.8, { opacity: 0.82, renderOrder: 10 });
      stair.write((i) => {
        const n = Math.min(N_WIN, Math.floor(i / 2));
        const x = Math.min(N_WIN, (i + 1) >> 1);
        return [g.x(x), g.y(smp(n)), 0.0005];
      });
      g.add(stair);

      // every kernel, all the time: a still frame must show the finished sum
      for (let n = 0; n <= N_WIN; n++) {
        const a = smp(n);
        const t = new DIAG.Trace(150, PAL.cyDim, 1.0, { opacity: 0.60, renderOrder: 9 });
        t.write((i, u) => {
          const x = u * N_WIN;
          return [g.x(x), g.y(a * DSP.sinc(x - n)), 0.0004];
        });
        g.add(t);
      }

      const sum = new DIAG.Trace(520, PAL.cy, 3.0, { renderOrder: 13 });
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
      S.holdDot = g.addDot(PAL.am, 0.0030);
      S.curDot = g.addDot(PAL.cy, 0.0030);

      g.tickLabels(ctx.labels, {
        xVals: [0, 4, 8, 12, 16], yVals: [-1, 0, 1],
        xFmt: (v) => String(v),
        yFmt: (v) => (v === 0 ? '0' : (v > 0 ? '+' : '−') + VFS.toFixed(2)),
        xOffset: [0, 13], yOffset: [-21, 0],
      });
    }

    /* THE COVER GLASS over the whole plate. Slightly convex (sagitta 3.2 mm
       across 0.21 m, R ≈ 1.7 m) with a low but non-zero roughness, so the
       widened front strip sweeps it as a soft band with a readable boundary
       instead of the radial fog round 2 shipped. Alpha is low enough that the
       traces underneath lose nothing. */
    const glassMat = M.clearGlass.clone();
    glassMat.transmission = 0;
    glassMat.color.setHex(0x05080d);
    glassMat.opacity = 0.11;
    glassMat.roughness = 0.105;
    glassMat.clearcoat = 1.0;
    glassMat.clearcoatRoughness = 0.075;
    glassMat.envMapIntensity = 2.1;
    glassMat.depthWrite = false;
    const glass = new THREE.Mesh(
      lensGeometry(CARD.w - 0.005, CARD.h - 0.005, 0.0040, 34, 20), glassMat);
    glass.position.set(CARD.w / 2, CARD.h / 2, 0.0052);
    glass.renderOrder = 30;
    root.add(glass);

    // and the reflected strip itself: a band with a leading edge, laid across
    // the upper-left where the beauty box actually sits, at a peak alpha well
    // under half of round 2's radial fog
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD.w - 0.005, CARD.h - 0.005),
      new THREE.MeshBasicMaterial({
        map: sheenTexture(-0.21), color: 0x8ea6bc, transparent: true, opacity: 0.055,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
    sheen.position.set(CARD.w / 2, CARD.h / 2, 0.0058);
    sheen.renderOrder = 31;
    root.add(sheen);

    // ---- labels -------------------------------------------------------------
    const L = ctx.labels;
    const anchor = (lx, ly) => {
      const o = new THREE.Object3D();
      o.position.set(lx, ly, 0.004);
      root.add(o);
      return o;
    };

    /* Kickers wrap past ~27 characters and label bodies past ~29; a wrapped
       kicker orphaned "· dBFS" onto its own line in the round-2 frame. Both
       lines below are inside those limits, so each label is one kicker, one
       body line and one value — a hierarchy, not a code comment. */
    S.lab1 = L.add(anchor(CARD.w / 2, CARD.h), {
      kicker: 'RECONSTRUCTION · V',
      text: 'cyan: Σ sincs · amber: hold',
      value: '', cls: 'acc', offset: [0, -34], occlude: false, priority: 6,
    });

    const hwAnchor = new THREE.Object3D();
    hwAnchor.position.set(-0.06, H_BODY / 2 + 0.004, D_C / 2);
    hardware.add(hwAnchor);
    L.add(hwAnchor, {
      kicker: 'CONVERTER · RACK BAY 2',
      value: `${WORD} bit · ${(FS / 1000).toFixed(1)} kHz · ${VFS_RMS.toFixed(3)} V rms`,
      cls: 'acc', offset: [0, -38], occlude: false, priority: 7,
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
   * readouts() — so the cursor, the label value and the six footer cells are
   * always the same instant, whatever moment a screenshot catches.
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
    S.lab1.setValue(`y = ${sv(S.state.v, 3)} V · hold error ${sv(S.state.err, 0)} mV`);
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

  /**
   * 160 words. The round-2 panel ran to the bottom of the frame and the whole
   * arithmetic section was cut off below the readout footer, so the reader lost
   * every number the chapter derives. Front-loaded and cut to fit at 1600×1000
   * with no scroll: callout, equation, idea, then the ladder.
   */
  content() {
    const dr = SPEC.drFs ? SPEC.drFs.toFixed(1) : '—';
    return `
<h3>The unique curve</h3>
<p>A converter is handed <span class="num">${grp(FS)}</span> numbers a second and has to make a voltage. The theorem: <em>if</em> nothing was recorded at or above <span class="num">${grp(NYQ)}</span> Hz, exactly one band-limited function passes through them.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>The staircase, in amber. The hold is real, but it belongs to the output stage, not to the signal. Interpolating <span class="num">×${OSR_DIG}</span> moves it to <span class="num">${(FS_OS / 1000).toFixed(1)}</span> kHz, where the aperture costs <span class="num">${ZOH_20K_OS.toFixed(3)}</span> dB instead of <span class="num">${ZOH_20K.toFixed(2)}</span>.</p></div>
<div class="eq">y(t) = Σₙ x[n] · sinc(t/T − n)
<span class="c">T = 1/${grp(FS)} = ${(T_S * 1e6).toFixed(3)} µs</span></div>
<div class="key"><span class="lab">The idea</span><p>Just over two points per cycle is enough. A 20 kHz tone gets <span class="num">${SAMPLES_PER_CYCLE.toFixed(3)}</span> of them and reconstructs exactly.</p></div>
<ul>
<li>Full scale <span class="num">${VFS_RMS.toFixed(3)}</span> V rms → a ${WORD}-bit LSB of <span class="num">${(LSB24 * 1e9).toFixed(1)}</span> nV, <span class="num">${Math.abs(LSB_VS_KTB).toFixed(1)}</span> dB under one 1 kΩ resistor's <span class="num">${(V_JOHNSON * 1e9).toFixed(0)}</span> nV in 20 kHz.</li>
<li>6.02N + 1.76 = <span class="num">${SNR16.toFixed(1)}</span> dB at ${WORD_CD} bits. Shaping drops the one-bit floor <span class="num">${Math.abs(NTF_20K).toFixed(1)}</span> dB: DR <span class="num">${dr}</span>, model <span class="num">${SNR_MODEL.toFixed(1)}</span> dBFS.</li>
</ul>`;
  },

  /**
   * `.ro .k` is still `text-transform:uppercase` in the stylesheet, so a unit
   * written into a readout KEY is destroyed exactly as it was in the round-2
   * label kickers: "kHz" printed "KHZ". Units therefore live in `u`, which
   * carries no transform, and the keys below are words only.
   */
  readouts() {
    const st = this._latch(false);
    return [
      { k: 'Sample rate', v: (FS / 1000).toFixed(2), u: 'kHz', cls: 'acc' },
      { k: 'Cursor index', v: `${st.n}.5`, u: `of ${N_WIN}` },
      { k: 'Output', v: (st.v >= 0 ? '+' : '−') + Math.abs(st.v).toFixed(3), u: 'V', cls: 'acc' },
      { k: 'Hold error', v: (st.err >= 0 ? '+' : '−') + Math.abs(st.err).toFixed(0), u: 'mV', cls: 'am' },
      { k: 'In-band DR', v: SPEC.drFs.toFixed(1), u: 'dBFS' },
      { k: 'Aperture ×8', v: ZOH_20K_OS.toFixed(3).replace('-', '−'), u: 'dB at 20 kHz', cls: 'am' },
    ];
  },
};
