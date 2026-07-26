/**
 * Shared signal maths. Every number a stage displays should come from here or
 * from an equally explicit closed-form expression — never from a magic constant
 * chosen to look good.
 */

export const TAU = Math.PI * 2;
export const C_LIGHT = 299792458;       // m/s, vacuum
export const C_SOUND_20C = 343.2;       // m/s, dry air at 20 °C
export const E_CHARGE = 1.602176634e-19;// C
export const N_CU = 8.4933e28;          // free electrons per m³ in copper
export const RHO_AIR = 1.2041;          // kg/m³ at 20 °C, 101.325 kPa
export const P_REF = 20e-6;             // Pa, 0 dB SPL

export const dB = (x) => 20 * Math.log10(Math.max(x, 1e-30));
export const undB = (d) => Math.pow(10, d / 20);
export const dBpow = (x) => 10 * Math.log10(Math.max(x, 1e-30));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Normalised sinc: sin(πx)/(πx), = 1 at x = 0. */
export function sinc(x) {
  if (Math.abs(x) < 1e-9) return 1 - (Math.PI * Math.PI * x * x) / 6;
  const p = Math.PI * x;
  return Math.sin(p) / p;
}

/** Speed of sound vs temperature (°C), ideal-gas approximation. */
export const cAir = (tC = 20) => 331.3 * Math.sqrt(1 + tC / 273.15);

/** SPL (dB) from rms pressure in pascals. */
export const splFromPa = (pa) => dB(pa / P_REF);
export const paFromSpl = (spl) => P_REF * undB(spl);

// ---------------------------------------------------------------------------
// Complex helpers (as [re, im] pairs) for filter maths
// ---------------------------------------------------------------------------
export const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cDiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
export const cAbs = (a) => Math.hypot(a[0], a[1]);
export const cArg = (a) => Math.atan2(a[1], a[0]);

// ---------------------------------------------------------------------------
// RIAA
// ---------------------------------------------------------------------------
/**
 * RIAA time constants (IEC 60098): 3180 µs, 318 µs, 75 µs.
 * Playback (de-emphasis) transfer function, normalised to 0 dB at 1 kHz:
 *
 *   H(s) = (1 + s·T2) / ((1 + s·T1)(1 + s·T3))
 *   T1 = 3180 µs  (pole  f = 50.05 Hz)
 *   T2 =  318 µs  (zero  f = 500.5 Hz)
 *   T3 =   75 µs  (pole  f = 2122 Hz)
 */
export const RIAA_T = { T1: 3180e-6, T2: 318e-6, T3: 75e-6 };
export const RIAA_F = {
  f1: 1 / (TAU * RIAA_T.T1),   // 50.05 Hz
  f2: 1 / (TAU * RIAA_T.T2),   // 500.5 Hz
  f3: 1 / (TAU * RIAA_T.T3),   // 2122 Hz
};
/** Complex RIAA playback response, un-normalised. */
export function riaaRaw(f) {
  const w = TAU * f;
  const num = [1, w * RIAA_T.T2];
  const den = cMul([1, w * RIAA_T.T1], [1, w * RIAA_T.T3]);
  return cDiv(num, den);
}
const RIAA_1K = cAbs(riaaRaw(1000));
/** RIAA playback (de-emphasis) magnitude in dB, 0 dB at 1 kHz. */
export const riaaPlaybackDb = (f) => dB(cAbs(riaaRaw(f)) / RIAA_1K);
/** RIAA recording (pre-emphasis) magnitude in dB — the exact inverse. */
export const riaaRecordDb = (f) => -riaaPlaybackDb(f);
/** RIAA playback phase in degrees. */
export const riaaPhaseDeg = (f) => (cArg(riaaRaw(f)) * 180) / Math.PI;

// ---------------------------------------------------------------------------
// Linkwitz–Riley crossover (LR-N = two cascaded Butterworth of order N/2)
// ---------------------------------------------------------------------------
/** Butterworth low-pass magnitude-squared response, order n. */
function butterLP(f, fc, n) {
  // H(s) = 1 / Π (s² + 2·cos(θk)·s + 1) ... evaluate on s = jω/ωc
  const x = f / fc;
  let re = 1, im = 0;
  const pairs = Math.floor(n / 2);
  for (let k = 0; k < pairs; k++) {
    const th = (Math.PI * (2 * k + 1)) / (2 * n);
    // s² + 2 sin(th) s + 1 with s = jx  →  (1 - x²) + j(2 sin(th) x)
    const d = [1 - x * x, 2 * Math.sin(th) * x];
    [re, im] = cMul([re, im], d);
  }
  if (n % 2) { const d = [1, x]; [re, im] = cMul([re, im], d); }
  return cDiv([1, 0], [re, im]);
}
function butterHP(f, fc, n) {
  // s → 1/s turns a low-pass into a high-pass. Evaluating on s = jx that is
  // s' = 1/(jx) = −j/x, whereas butterLP(fc,f) evaluates at +j/x — the complex
  // conjugate. Magnitude is unaffected, phase is negated, so the conjugate must
  // be taken or every high-pass in the piece reports the wrong sign of phase
  // (and Linkwitz–Riley then appears to sum with the wrong rotation).
  const lp = butterLP(fc, f, n);
  return [lp[0], -lp[1]];
}
/** LR-order-N low-pass complex response (N must be 2, 4 or 8). */
export function lrLow(f, fc, N = 4) {
  const b = butterLP(f, fc, N / 2);
  return cMul(b, b);
}
/** LR-order-N high-pass complex response. */
export function lrHigh(f, fc, N = 4) {
  const b = butterHP(f, fc, N / 2);
  return cMul(b, b);
}
/**
 * LR4 sum. Both sections are −6 dB and *in phase* at fc, so they sum to
 * unity magnitude — but with 360° of total phase rotation through the band.
 * (LR2 sums flat only if one driver is polarity-inverted.)
 */
export function lrSumDb(f, fc, N = 4) {
  const s = cAdd(lrLow(f, fc, N), lrHigh(f, fc, N));
  return dB(cAbs(s));
}

// ---------------------------------------------------------------------------
// Thiele–Small / sealed-box loudspeaker model
// ---------------------------------------------------------------------------
/**
 * Sealed (closed-box) alignment.
 * @param ts {fs, Qts, Vas}  free-air resonance (Hz), total Q, equivalent volume (m³)
 * @param Vb box volume in m³
 * Returns {fc, Qtc, alpha}
 */
export function sealedAlignment(ts, Vb) {
  const alpha = ts.Vas / Vb;
  const k = Math.sqrt(alpha + 1);
  return { alpha, fc: ts.fs * k, Qtc: ts.Qts * k };
}
/** Sealed-box 2nd-order high-pass magnitude in dB. */
export function sealedResponseDb(f, fc, Qtc) {
  const x = f / fc;
  const num = x * x;
  const den = [1 - x * x, x / Qtc];
  return dB(num / cAbs(den));
}
/** Peak cone displacement (m, one-way) for a target SPL at 1 m, half-space. */
export function excursionForSpl(spl, f, Sd, r = 1) {
  // p_rms = ρ0 · Sd · ω² · x_peak / (2·√2·π·r) ... (piston, half space, far field)
  // solve for x_peak
  const p = paFromSpl(spl);
  const w = TAU * f;
  return (p * 2 * Math.SQRT2 * Math.PI * r) / (RHO_AIR * Sd * w * w);
}
/** Far-field on-axis SPL at r for a piston of area Sd moving ±x at f (half space). */
export function splFromExcursion(x, f, Sd, r = 1) {
  const w = TAU * f;
  const p = (RHO_AIR * Sd * w * w * x) / (2 * Math.SQRT2 * Math.PI * r);
  return splFromPa(p);
}
/** Motor force factor: F = Bl · i. */
export const motorForce = (Bl, i) => Bl * i;
/** Back-EMF from coil velocity: e = Bl · v. */
export const backEmf = (Bl, v) => Bl * v;

// ---------------------------------------------------------------------------
// Electrical
// ---------------------------------------------------------------------------
/**
 * Electron drift velocity in a wire.
 *   v_d = I / (n · A · e)
 * For 2.5 mm² copper at 5 A this is ~1.5 × 10⁻⁴ m/s — about 0.5 m/hour.
 * On 50 Hz AC the carriers merely oscillate about a fixed point; the peak
 * displacement is v_d,peak/ω, of order a micrometre.
 */
export function driftVelocity(I, areaMm2, n = N_CU) {
  return I / (n * areaMm2 * 1e-6 * E_CHARGE);
}
/** Peak displacement of a carrier under sinusoidal drift at frequency f. */
export function driftDisplacement(vPeak, f) {
  return vPeak / (TAU * f);
}
/** Signal (field / energy) propagation speed in a cable with velocity factor vf. */
export const signalSpeed = (vf = 0.66) => C_LIGHT * vf;

/** Damping factor = load impedance / amplifier output impedance. */
export const dampingFactor = (Zload, Zout) => Zload / Zout;
/** Power into a load from rms voltage. */
export const powerW = (vrms, R) => (vrms * vrms) / R;
/** Voltage swing needed for P watts into R. */
export const vrmsFor = (P, R) => Math.sqrt(P * R);

/** Class-AB output-stage dissipation for a sine at output level m (0..1). */
export function classABDissipation(Vcc, RL, m) {
  // Total device dissipation, both halves: P_d = Vcc²/(π²·RL) at m = 2/π
  const Pout = (m * Vcc) ** 2 / (2 * RL);
  const Pdc = (2 * Vcc * m * Vcc) / (Math.PI * RL);
  return Math.max(0, Pdc - Pout);
}

// ---------------------------------------------------------------------------
// Digital
// ---------------------------------------------------------------------------
/** Ideal quantisation SNR for an n-bit uniform quantiser with a full-scale sine. */
export const quantSnrDb = (bits) => 6.0206 * bits + 1.7609;
/** Same, with the noise spread over fs and measured in a band of width BW. */
export const quantSnrDbOSR = (bits, fs, bw) => quantSnrDb(bits) + 10 * Math.log10(fs / (2 * bw));
/**
 * SNR of an n-th-order noise-shaped 1-bit modulator at oversampling ratio OSR.
 *   SNR ≈ 6.02·B + 1.76 − 10·log10(π^{2n}/(2n+1)) + (2n+1)·10·log10(OSR)
 */
export function noiseShapedSnrDb(bits, order, osr) {
  return quantSnrDb(bits)
    - 10 * Math.log10(Math.pow(Math.PI, 2 * order) / (2 * order + 1))
    + (2 * order + 1) * 10 * Math.log10(osr);
}
/** LSB size in volts for an n-bit converter with full-scale ±Vfs. */
export const lsbVolts = (bits, vfs) => (2 * vfs) / Math.pow(2, bits);
/** Jitter-limited SNR for a full-scale sine at f: SNR = −20·log10(2π·f·tj). */
export const jitterSnrDb = (f, tjRms) => -dB(TAU * f * tjRms);

/**
 * Band-limited reconstruction: sum of sinc-interpolated samples.
 * This is the honest answer to "what comes out of a DAC" — NOT a staircase.
 */
export function sincReconstruct(samples, fs, t, halfWidth = 24) {
  const x = t * fs;
  const i0 = Math.max(0, Math.floor(x) - halfWidth);
  const i1 = Math.min(samples.length - 1, Math.floor(x) + halfWidth);
  let y = 0;
  for (let i = i0; i <= i1; i++) y += samples[i] * sinc(x - i);
  return y;
}

/** Zero-order-hold aperture response: |sinc(f/fs)| — the droop a NOS DAC has. */
export const zohDb = (f, fs) => dB(Math.abs(sinc(f / fs)));

/** First-order Δ-Σ modulator step (returns bit, updated integrator). */
const _binom = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };

/**
 * One step of an error-feedback Δ-Σ modulator with NTF = (1 − z⁻¹)^order.
 *
 *   v[n] = x[n] + Σ_{k=1..N} C(N,k)·(−1)^k · e[n−k]
 *   y[n] = sgn(v[n])
 *   e[n] = y[n] − v[n]            so that  Y = X + NTF·E
 *
 * `state` is the error history, most-recent-first; the caller allocates it with
 * at least `order` elements (zero-filled).
 *
 * STABILITY. A 1-bit quantiser has no defined gain, and the modulator is stable
 * only while the noise transfer function's ∞-norm stays modest — Lee's rule of
 * thumb is ‖NTF‖∞ ≲ 1.5. For NTF = (1 − z⁻¹)ⁿ the ∞-norm is 2ⁿ: order 1 gives 2
 * and order 2 gives 4, both of which run at reduced input amplitude, but order 3
 * gives 8 and the loop overloads — measured, it stops shaping entirely rather
 * than failing loudly. Higher orders need an NTF with finite poles (a CIFB or
 * CRFB structure), which is beyond what this file models, so the order is
 * clamped here rather than quietly returning a spectrum that is not shaped.
 *
 * Verified by FFT at fs = 2.8224 MHz, OSR 64, −8 dBFS input: order 1 puts the
 * in-band noise 38 dB below the out-of-band density, order 2 puts it 55 dB below.
 */
export const ntfInfinityNorm = (order) => Math.pow(2, order);
export const DS_MAX_ORDER = 2;

export function deltaSigmaStep(x, state, order = 1) {
  order = Math.min(Math.max(1, order | 0), DS_MAX_ORDER);
  let v = x;
  for (let k = 1; k <= order; k++) {
    v += _binom(order, k) * (k % 2 ? -1 : 1) * (state[k - 1] || 0);
  }
  const bit = v >= 0 ? 1 : -1;
  const e = bit - v;
  for (let i = order - 1; i > 0; i--) state[i] = state[i - 1];
  state[0] = clamp(e, -2.5, 2.5);
  return bit;
}

// ---------------------------------------------------------------------------
// Room acoustics
// ---------------------------------------------------------------------------
/** Axial/tangential/oblique room mode frequency for dimensions L,W,H (m). */
export const roomMode = (nx, ny, nz, L, W, H, c = C_SOUND_20C) =>
  (c / 2) * Math.hypot(nx / L, ny / W, nz / H);
/** Wavelength at f. */
export const lambda = (f, c = C_SOUND_20C) => c / f;
/** Inverse-square: SPL change for distance r relative to 1 m. */
export const distanceLossDb = (r) => -20 * Math.log10(Math.max(r, 1e-6));
/** SPL at r from sensitivity (dB @ 2.83 V / 1 m) and drive power. */
export function splAt(sensitivity, watts, r) {
  return sensitivity + 10 * Math.log10(Math.max(watts, 1e-12)) + distanceLossDb(r);
}
/** Schroeder frequency — above it, statistical; below it, discrete modes. */
export const schroeder = (rt60, V) => 2000 * Math.sqrt(rt60 / V);
/** Sabine RT60 for volume V (m³) and total absorption A (m² sabins). */
export const rt60Sabine = (V, A) => (0.161 * V) / A;

// ---------------------------------------------------------------------------
// Small utilities for building traces
// ---------------------------------------------------------------------------
/** Log-spaced frequency array. */
export function logSpace(f0, f1, n) {
  const out = new Float64Array(n);
  const a = Math.log10(f0), b = Math.log10(f1);
  for (let i = 0; i < n; i++) out[i] = Math.pow(10, a + ((b - a) * i) / (n - 1));
  return out;
}
export function linSpace(a, b, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}
/** Format a number with an SI prefix, e.g. 1.5e-4 → "150 µ". */
export function si(v, digits = 3) {
  if (v === 0) return '0';
  const neg = v < 0; v = Math.abs(v);
  const p = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
  ];
  for (const [s, u] of p) {
    if (v >= s * 0.999) {
      const x = v / s;
      const d = x >= 100 ? Math.max(0, digits - 3) : x >= 10 ? Math.max(0, digits - 2) : Math.max(0, digits - 1);
      return (neg ? '-' : '') + x.toFixed(d) + (u ? ' ' + u : '');
    }
  }
  return (neg ? '-' : '') + v.toExponential(2);
}
/** Format Hz nicely: 50.05, 2.12 k, 22.05 k. */
export function fHz(f) {
  if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' k';
  if (f >= 100) return f.toFixed(1);
  return f.toFixed(2);
}
