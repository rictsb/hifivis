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
 * is quoted in the instrument cluster and the prose rather than drawn.
 *
 * Time: `timeScale` 2e-5, so one sample period (22.676 µs) takes 1.134 s of
 * wall clock. The cursor steps one sample per sample period — the animation
 * runs at exactly the rate the transport bar claims and nothing else moves.
 */

// ---------------------------------------------------------------------------
// 1. Primaries — imported, then derived. Nothing here is typed twice.
// ---------------------------------------------------------------------------
const FS = DIGITAL.fsCd;              // 44 100 Hz
const FS_MAX = DIGITAL.fs;            // 192 000 Hz, the converter's ceiling
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
/**
 * The shaping figure is a FUNCTION OF FREQUENCY and quoting it bare understates
 * the mechanism: 20 kHz is the weakest point of the shaping in band. Below the
 * corner |1 − z⁻¹|ⁿ falls at 20·n dB per decade, so the same modulator is
 * ~34 dB further down at 1 kHz than it is at the band edge.
 */
const NTF_20K = ntfDb(20000);         // −54.06 dB
const NTF_SLOPE = 20 * NS_ORDER;      // 40 dB per decade

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
const grp = (v) => Math.round(v).toLocaleString('en-GB').replace(/,/g, ' ');

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

const SPEC = { binHz: FS_MOD / N_FFT, snrMeas: 0, drFs: 0, gap: 0 };

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
   *
   * It still lands ~8 dB under the model, and the panel says why: 6.02N + 1.76
   * assumes an error that is uniform over one LSB and uncorrelated with the
   * signal, and a one-bit quantiser's error is neither; and the FFT counts the
   * three-tone intermodulation products as noise because they are not tones the
   * generator asked for.
   */
  SPEC.drFs = SPEC.snrMeas + HEADROOM_DB;
  SPEC.gap = SNR_MODEL - SPEC.drFs;
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
 * THE FASCIA READOUT.
 *
 * The round-4 audit's second finding was that the converter's front panel was
 * visually identical to the streamer's directly below it — both read
 * "44.1 kHz · 24 bit · AES · LOCK" in the same hierarchy, so in its own chapter
 * the reader could not tell which chassis was the subject. This panel says what
 * a CONVERTER does and nothing else: the interpolation ratio, the rate the hold
 * therefore runs at, the reconstruction filter selected, and the modulator
 * behind it. It is the same arithmetic the explanation panel quotes, printed on
 * the hardware.
 *
 * Canvas aspect (7.14 : 1) matches the plane's, or the glyphs are squashed.
 */
function displayTexture() {
  const w = 1200, h = 168;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#070b11');
  bg.addColorStop(1, '#03050a');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);

  const CY = '#b6e6ff', CY_D = '#5e9fc2', DIM = '#46596b';
  const mono = (px, wt = 600) => `${wt} ${px}px ui-monospace, Menlo, monospace`;

  x.fillStyle = CY;
  x.font = mono(92);
  x.fillText('×8', 24, 96);
  x.fillStyle = CY_D;
  x.font = mono(52, 500);
  x.fillText('→', 156, 92);
  x.fillStyle = CY;
  x.font = mono(92);
  x.fillText((FS_OS / 1000).toFixed(1), 226, 96);
  x.fillStyle = CY_D;
  x.font = mono(36, 500);
  x.fillText('kHz', 506, 96);

  x.fillStyle = DIM;
  x.font = mono(30, 500);
  x.fillText(`${(FS / 1000).toFixed(1)} kHz · ${WORD} bit in`, 26, 150);

  x.fillStyle = CY;
  x.font = mono(34, 500);
  x.fillText('LINEAR PHASE', 624, 62);
  x.fillStyle = CY_D;
  x.font = mono(30, 500);
  x.fillText(`Δ-Σ ${OSR} fs · 1 bit`, 624, 108);
  x.fillStyle = DIM;
  x.font = mono(28, 500);
  x.fillText(`AES · max ${FS_MAX / 1000} kHz`, 624, 150);

  x.fillStyle = '#7fd6a2';
  x.beginPath();
  x.arc(1002, 52, 9, 0, Math.PI * 2);
  x.fill();
  x.font = mono(30, 500);
  x.fillText('LOCK', 1026, 62);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * A soft-edged darkening alpha, for the flags that hold the neighbouring bays
 * back. Full density in the middle, ramping to nothing over the outer eighth of
 * each edge, so the flag has no rectangle of its own anywhere in the frame.
 */
function flagAlpha(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const sm = (t) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;             // ImageData row 0 is the TOP
    const fv = sm(v / 0.09) * sm((1 - v) / 0.13);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const a = fv * sm(Math.min(u, 1 - u) / 0.12);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = (a * 255) | 0;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
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
  faceMat.roughness = 0.275;
  faceMat.envMapIntensity = 2.05;
  const face = new THREE.Mesh(GEO.bevelBox(W_C + 0.008, H_BODY + 0.004, 0.016, 0.0026, 5), faceMat);
  face.position.set(0, 0.003, zF);
  face.castShadow = face.receiveShadow = true;
  g.add(face);
  /* The full-width dark grey band that used to run across the fascia has gone.
     It covered 58 % of a 86 mm face in a material that returns almost nothing,
     which is why the chapter's own subject measured darker than the rack it
     sits in. The face is now machined alloy across its whole width with a black
     window cut in it — the tonal mass the frame was missing, and the reason the
     converter now reads brighter than every chassis around it. */

  // display recess → opaque emissive panel → machined bezel → cover glass
  const DX = -0.092, DW = 0.286, DH = 0.0400;
  const recess = new THREE.Mesh(GEO.bevelBox(DW + 0.024, DH + 0.010, 0.0030, 0.0008, 3), M.anodBlack);
  recess.position.set(DX, 0.005, zF + 0.0092);
  recess.receiveShadow = true;
  g.add(recess);

  const disp = new THREE.Mesh(
    new THREE.PlaneGeometry(DW, DH),
    new THREE.MeshBasicMaterial({ map: displayTexture(), toneMapped: false }),
  );
  disp.position.set(DX, 0.005, zF + 0.0110);
  g.add(disp);

  /* THE SPECULAR LAYER over the display — GEO.instrumentGlass, not a near-mirror
     of my own. Contract Addendum J: a flat clearcoat at roughness 0.045 returns
     essentially the whole softbox and blooms; this helper is crowned, so the
     source sweeps across as a band, and its reflectivity 0.34 is a coated cover
     glass returning ~1.7 % at normal incidence rather than an uncoated 4 %. */
  const lens = GEO.instrumentGlass(DW + 0.014, DH + 0.006, {
    crown: 0.0022, roughness: 0.15, tint: 0x05070b,
  });
  lens.material.opacity = 0.22;              // over an emissive, not over paint
  lens.material.envMapIntensity = 1.05;
  lens.position.set(DX, 0.005, zF + 0.0118);
  lens.renderOrder = 4;
  g.add(lens);

  // machined bezel: four bars standing proud of the recess. The streamer's
  // display is flush; this one is framed, which is most of what tells the two
  // chassis apart at 180 px.
  const bezMat = M.alu.clone();
  bezMat.roughness = 0.32;
  const bezH = 0.0044, bezV = 0.0040;
  for (const [bx, by, bw, bh] of [
    [DX, 0.005 + DH / 2 + bezH / 2 + 0.0016, DW + 0.020, bezH],
    [DX, 0.005 - DH / 2 - bezH / 2 - 0.0016, DW + 0.020, bezH],
    [DX - DW / 2 - bezV / 2 - 0.0072, 0.005, bezV, DH + 0.013],
    [DX + DW / 2 + bezV / 2 + 0.0072, 0.005, bezV, DH + 0.013],
  ]) {
    const b = new THREE.Mesh(GEO.bevelBox(bw, bh, 0.0044, 0.0009, 3), bezMat);
    b.position.set(bx, by, zF + 0.0090);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
  }

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
// 5. THE SHOT — the converter as the hero, one plate below it
// ---------------------------------------------------------------------------
/*  THE SUBJECT IS WIDTH-LIMITED, AND EVERY PREVIOUS PASS SOLVED IT FOR HEIGHT.
    A 555 mm chassis 92 mm tall has a silhouette of about 4.7 : 1 against a safe
    box of 1.14 : 1, so `fill` — a fraction of the safe box's HEIGHT — is the
    wrong control: round 2 set 0.90 and cropped the rack, round 3 set 0.40 on a
    whole-rack radius and left the converter 72 px tall, 7 % of frame height.

    So the frame is solved for WIDTH and `fill` is DERIVED from it. The binding
    object is the rack, not the chassis: its posts are 30 mm wider each side and
    its shelves 30 mm deeper. At az 0.24 the rack's silhouette is 687 mm; held
    to 0.93 of the 960 px safe box that is 893 px, leaving 33 px of margin on
    each side, and it sets the scale at 1300 px per metre. The chassis is then
    846 px wide and — with the top face in view — 181 px tall: 2.5x round 3.

    Elevation is set by the shelf above. Its underside is 50 mm over the lid, so
    at EL the shelf hides everything beyond 50/tan(EL) mm of the top face; at
    0.34 rad that leaves the front 141 mm of it visible, which is what makes the
    chassis read as an object rather than a strip. Any higher and the top face
    is a sliver behind a shelf edge.

    No truck: the rack is centred on the shift lens' own axis (x = 670), so both
    monoblocks fall outside the frame entirely rather than being sliced by it.
    The rig booms 145 px so the converter sits a little above centre and the
    plate has clear room beneath it.                                          */
const AZ = 0.28, EL = 0.31, FOV = 30;
const TAN_H = Math.tan((FOV * Math.PI) / 360);
const SAFE_W_PX = 1600 * SAFE.wFrac;                     // 960
const SIL_W = LAYOUT.rack.w * Math.cos(AZ) + LAYOUT.rack.d * Math.sin(AZ);   // 0.687 m
const RACK_FRAC = 0.93;                                  // of the safe box width
const PX_PER_M = (RACK_FRAC * SAFE_W_PX) / SIL_W;        // 1300.3 px per metre
const D_CAM = 500 / (PX_PER_M * TAN_H);                  // 1.435 m

/** Clearance between this lid and the underside of the shelf above (20 mm). */
const SHELF_CLEAR = LAYOUT.rack.shelfY[LAYOUT.bay.dac + 1] - 0.020
  - (LAYOUT.rack.shelfY[LAYOUT.bay.dac] + H_TOT);        // 0.050 m
const TOP_VIS = Math.min(D_C, SHELF_CLEAR / Math.tan(EL));  // 0.141 m of top face
/** Apparent half-height of the chassis with that much of its top face in view. */
const HERO_R = (H_TOT * Math.cos(EL) + TOP_VIS * Math.sin(EL)) / 2;   // 0.0669
const FILL = (PX_PER_M * HERO_R) / (500 * SAFE.hFrac);   // 0.207, derived

const HERO_C = [LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.dac, H_TOT), LAYOUT.rack.z + D_C / 2];

const CAM_F = new THREE.Vector3(
  -Math.sin(AZ) * Math.cos(EL), -Math.sin(EL), -Math.cos(AZ) * Math.cos(EL));
const CAM_R = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));   // screen-right
const CAM_U = CAM_R.clone().cross(CAM_F);                          // screen-up

const TRUCK_PX = 0;       // −ve slides the subject RIGHT in frame
const BOOM_PX = -145;     // +ve slides the subject DOWN in frame

const _base = frameShot(HERO_C, HERO_R, { fill: FILL, az: AZ, el: EL, fov: FOV });
const _off = CAM_R.clone().multiplyScalar(TRUCK_PX / PX_PER_M)
  .addScaledVector(CAM_U, BOOM_PX / PX_PER_M);
const SHOT = {
  position: [_base.position[0] + _off.x, _base.position[1] + _off.y, _base.position[2] + _off.z],
  target: [_base.target[0] + _off.x, _base.target[1] + _off.y, _base.target[2] + _off.z],
  fov: FOV,
};

/**
 * The optical axis is NOT at x = 800. The Director shifts the principal point to
 * the centre of the clear band, which at 1600 px is
 * (railW + (w − panelW)) / 2 = (200 + 1140) / 2 = 670.
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
/* 440 × 290 px centred at (404, 700): x 184…624, y 555…845, inside the safe box
   (160…1120, 90…930) with 24 px to spare on the left. The plate floats 0.29 m
   in front of the rack's fascia plane and about 0.31 m above the floor, so it
   is caught by the planar floor reflection and casts a shadow back onto the
   rack. The converter's silhouette ends at y 413, so plate and hero share no
   pixels; a hairline leader closes the gap between them.                     */
const CARD_D = 1.145;                      // metres from the lens
const CARD_PX = { w: 440, h: 290, cx: 404, cy: 700 };
const MPX = mpp(CARD_D);                   // 0.6136 mm per pixel out there
const CARD = { w: CARD_PX.w * MPX, h: CARD_PX.h * MPX };
const CARD_C = rayPoint(CARD_PX.cx, CARD_PX.cy, CARD_D);
/** Square to the lens is always a decal: yaw the plate 0.13 rad off the ray. */
const CARD_YAW = Math.atan2(SHOT.position[0] - CARD_C.x, SHOT.position[2] - CARD_C.z) - 0.13;

// plot box inside the plate, in pixels — the left margin holds the y numerals
const PAD = { l: 54, r: 16, t: 26, b: 32 };
const G1 = {
  x: PAD.l * MPX,
  y: PAD.b * MPX,
  w: (CARD_PX.w - PAD.l - PAD.r) * MPX,
  h: (CARD_PX.h - PAD.t - PAD.b) * MPX,
};

/** Fascia plane and the lit filter button, in world space — the leader's end. */
const FASCIA_Z = LAYOUT.rack.z + D_C / 2;
const LEADER_END = new THREE.Vector3(
  0.124, LAYOUT.bayCentre(LAYOUT.bay.dac, H_TOT) - 0.010, FASCIA_Z + 0.006);

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

    /* The overlay is world-aligned; the plate is a child of it. The flags below
       have to be positioned in world space, and a plate-local frame would have
       put them on the plate. */
    const overlay = new THREE.Group();

    /* HOLDING THE NEIGHBOURS BACK. Six near-identical chassis in one column and
       the reader cannot tell which one the chapter is about. These are flags —
       black scrims with a soft-edged alpha, hung 45 mm in front of the fascia
       plane — so bay 2 is the only fully-lit chassis in frame. They live in the
       overlay, so they fade out with it and the wide shot is untouched. */
    const alpha = flagAlpha();
    const flag = (w, h, cx, cy, rot, op) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: 0x04050a, transparent: true, opacity: op, alphaMap: alpha,
          depthWrite: false, toneMapped: false,
          /* MULTIPLY, not alpha-over. The frame buffer is HDR: a lit display
             sits at 3-6 in linear, and mixing 74 % of a near-black over it
             still leaves 0.8, which tone-maps back to bright. The first
             version of this flag was invisible on exactly the two things it
             existed to hold back. Multiplying scales whatever is underneath,
             so an emissive goes down by the same stops as a lit shelf. */
          blending: THREE.MultiplyBlending, premultipliedAlpha: true,
        }));
      m.position.set(cx, cy, FASCIA_Z + 0.045);
      m.rotation.z = rot;
      /* Late. Every neighbouring chassis has a lit display or a lit meter, and
         those are transparent, tone-mapped-off materials drawn in the second
         pass: at a low renderOrder the flag went down BEFORE them and the
         streamer's readout was still the second-brightest thing in the frame.
         Depth test is still on, so the plate in front is unaffected. */
      m.renderOrder = 22;
      return m;
    };
    const yTop = LAYOUT.rack.shelfY[LAYOUT.bay.dac] + H_TOT;   // 0.544, lid line
    const yBot = LAYOUT.rack.shelfY[LAYOUT.bay.dac];           // 0.452, shelf top
    /* Three stops on the bays above, two and a half below. Multiplying by 0.10
       leaves a neighbouring chassis as a dark form with its trim just readable,
       which is a rack; multiplying by zero leaves a converter floating in a
       void, which is a press shot with no system in it. The lower flag is held
       lighter because the bottom third of the frame is the only place the floor
       and its reflection appear. */
    overlay.add(flag(0.95, 1.24 - yTop, 0, (1.24 + yTop) / 2, 0, 0.52));
    overlay.add(flag(0.95, yBot - 0.070, 0, (yBot + 0.070) / 2, Math.PI, 0.78));

    const holder = new THREE.Group();
    holder.position.copy(CARD_C);
    holder.rotation.y = CARD_YAW;
    overlay.add(holder);
    const root = new THREE.Group();
    root.position.set(-CARD.w / 2, -CARD.h / 2, 0);
    holder.add(root);

    const S = this._s = { t: 0, n: -1, state: { n: 0, v: 0, err: 0 } };

    /* THE PLATE, as an object rather than a pasted PNG: a machined slab with
       real thickness and a bevelled fillet, opaque and depth-writing so the
       rack behind cannot print through, and a cover glass in front of the
       traces so the plate carries a specular ramp of its own. */
    const slabMat = M.anodBlack.clone();
    slabMat.color.setHex(0x1a212b);
    slabMat.metalness = 0.0;
    slabMat.roughness = 0.58;
    slabMat.envMapIntensity = 0.90;
    const slab = new THREE.Mesh(GEO.bevelBox(CARD.w, CARD.h, 0.013, 0.0026, 4), slabMat);
    slab.position.set(CARD.w / 2, CARD.h / 2, -0.0085);
    slab.castShadow = slab.receiveShadow = true;
    root.add(slab);
    /* No drawn border. A hairline rule a few pixels inside the slab's own
       silhouette doubles the edge and is most of what makes a card read as a
       pasted PNG; the bevelled fillet catching the front strip is the border. */

    // sample dots for the reconstruction plot
    const dots = new DIAG.Swarm(N_WIN + 1, { color: 0xccd3dc, size: 0.0021, additive: false });
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
        const t = new DIAG.Trace(150, 0x2d6a8c, 1.2, { opacity: 0.80, renderOrder: 9 });
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
      S.holdDot = g.addDot(PAL.am, 0.0028);
      S.curDot = g.addDot(PAL.cy, 0.0028);

      g.tickLabels(ctx.labels, {
        xVals: [0, 8, 16], yVals: [-1, 0, 1],
        xFmt: (v) => String(v),
        yFmt: (v) => (v === 0 ? '0' : (v > 0 ? '+' : '−') + VFS.toFixed(2)),
        xOffset: [0, 14], yOffset: [-24, 0],
      });
    }

    /* THE COVER GLASS over the whole plate, from GEO.instrumentGlass. Crowned,
       so the widened front strip sweeps it as a band with a readable boundary
       rather than sitting on it as a rectangle, and coated rather than a
       mirror. Alpha is held low so the traces underneath lose nothing. */
    const glass = GEO.instrumentGlass(CARD.w - 0.006, CARD.h - 0.006, {
      crown: 0.0038, roughness: 0.15, tint: 0x05080d, segs: 28,
    });
    glass.material.opacity = 0.19;
    glass.material.envMapIntensity = 1.05;
    glass.position.set(CARD.w / 2, CARD.h / 2, 0.0055);
    glass.renderOrder = 30;
    root.add(glass);

    /* THE LEADER. The plate floated with no anchor and nothing tying it to the
       chassis it explains; the eye went to a lit panel over empty backdrop. A
       hairline from the plate's top-right corner to the lit reconstruction-
       filter button says which chassis, and which control, this plot is of. */
    overlay.updateMatrixWorld(true);
    const leadA = holder.localToWorld(
      new THREE.Vector3(CARD.w / 2 - 0.012, CARD.h / 2 + 0.004, 0.004));
    const lead = new DIAG.Trace(2, PAL.ink3, 1.1, { opacity: 0.55, renderOrder: 16 });
    lead.write((i) => (i === 0 ? leadA.toArray() : LEADER_END.toArray()));
    overlay.add(lead);

    // ---- labels -------------------------------------------------------------
    const L = ctx.labels;
    const anchor = (lx, ly) => {
      const o = new THREE.Object3D();
      o.position.set(lx, ly, 0.004);
      root.add(o);
      return o;
    };

    /* Kickers wrap past ~27 characters and label bodies past ~29; a wrapped
       kicker orphaned "· dBFS" onto its own line in an earlier frame. Both
       lines below are inside those limits, so each label is one kicker, one
       body line and one value — a hierarchy, not a code comment. */
    /* UNDER the plate, not over it. Above it the caption landed shoulder to
       shoulder with the streamer's own lit readout one bay down and the two
       read as one run of type; below it there is nothing but floor. */
    S.lab1 = L.add(anchor(CARD.w / 2, 0), {
      kicker: 'RECONSTRUCTION · 0…16',
      text: 'cyan: Σ sincs · amber: hold',
      value: '', cls: 'acc', offset: [0, 40], occlude: false, priority: 6,
    });

    /* The chassis label sits BELOW the fascia, over the shelf edge. Above it,
       where it used to be, it straddled the boundary and read as naming the
       unit in the bay above — which in this stack is a different chapter. */
    const hwAnchor = new THREE.Object3D();
    hwAnchor.position.set(-0.115, -H_BODY / 2 - 0.004, D_C / 2);
    hardware.add(hwAnchor);
    L.add(hwAnchor, {
      kicker: 'CONVERTER · BAY 2 OF 6',
      value: `${WORD} bit in · ×${OSR_DIG} out · ${VFS_RMS.toFixed(3)} V rms`,
      cls: 'acc', offset: [0, 28], occlude: false, priority: 7,
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
   * ~230 words. Front-loaded, because the elaboration is what the panel cuts:
   * callout, equation, idea, then the ladder.
   */
  content() {
    const dr = SPEC.drFs ? SPEC.drFs.toFixed(1) : '—';
    const gap = SPEC.gap ? SPEC.gap.toFixed(1) : '—';
    return `
<h3>The unique curve</h3>
<p>A converter is handed <span class="num">${grp(FS)}</span> numbers a second. If nothing was recorded at or above <span class="num">${grp(NYQ)}</span> Hz, exactly one band-limited function passes through them: 20 kHz gets <span class="num">${SAMPLES_PER_CYCLE.toFixed(3)}</span> samples and reconstructs exactly.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>The staircase, in amber, belongs to the output stage, not the signal. Interpolating <span class="num">×${OSR_DIG}</span> moves it to <span class="num">${(FS_OS / 1000).toFixed(1)}</span> kHz, where the aperture costs <span class="num">${ZOH_20K_OS.toFixed(3)}</span> dB, not <span class="num">${ZOH_20K.toFixed(2)}</span>.</p></div>
<div class="eq">y(t) = Σₙ x[n] · sinc(t/T − n)
<span class="c">T = 1/${grp(FS)} = ${(T_S * 1e6).toFixed(3)} µs</span></div>
<ul>
<li>Full scale <span class="num">${VFS_RMS.toFixed(3)}</span> V rms → a ${WORD}-bit LSB of <span class="num">${(LSB24 * 1e9).toFixed(1)}</span> nV, <span class="num">${Math.abs(LSB_VS_KTB).toFixed(1)}</span> dB under a 1 kΩ resistor's own <span class="num">${(V_JOHNSON * 1e9).toFixed(0)}</span> nV in 20 kHz.</li>
<li>6.02N + 1.76 gives <span class="num">${SNR16.toFixed(1)}</span> dB at ${WORD_CD} bits. The one-bit demonstrator's shaping drops its floor <span class="num">${Math.abs(NTF_20K).toFixed(1)}</span> dB at 20 kHz, <span class="num">${NTF_SLOPE}</span> dB/decade below.</li>
<li>Its <span class="num">${dr}</span> dBFS measures <span class="num">${gap}</span> dB under that <span class="num">${SNR_MODEL.toFixed(1)}</span> dB model, which assumes an error uniform over one LSB and uncorrelated with the signal. One bit is neither.</li>
</ul>`;
  },

  /**
   * `.ro .k` is `text-transform:uppercase` in the stylesheet, so a unit written
   * into a readout KEY is destroyed: "kHz" prints "KHZ". Units therefore live in
   * `u`, which carries no transform, and the keys below are words only.
   *
   * "IN-BAND DR" was read by the editor as the CONVERTER's dynamic range, which
   * would make this DAC worse than CD. It is the measured in-band DR of the
   * deliberately crippled one-bit demonstration modulator, and the key now says
   * so on the same line as the number.
   */
  readouts() {
    const st = this._latch(false);
    return [
      { k: 'Sample rate', v: (FS / 1000).toFixed(2), u: 'kHz', cls: 'acc' },
      { k: 'Cursor index', v: `${st.n}.5`, u: `of ${N_WIN}` },
      { k: 'Output', v: (st.v >= 0 ? '+' : '−') + Math.abs(st.v).toFixed(3), u: 'V', cls: 'acc' },
      { k: 'Hold error', v: (st.err >= 0 ? '+' : '−') + Math.abs(st.err).toFixed(0), u: 'mV', cls: 'am' },
      { k: 'Δ-Σ demo DR', v: SPEC.drFs.toFixed(1), u: `dBFS · 1 bit, OSR ${OSR}` },
      { k: 'Aperture ×8', v: ZOH_20K_OS.toFixed(3).replace('-', '−'), u: 'dB at 20 kHz', cls: 'am' },
    ];
  },
};
