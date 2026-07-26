import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { radialSprite } from '../core/tex.js';

/**
 * POWER AMPLIFICATION — two monoblocks.
 *
 * The claim of this stage: an amplifier does not make the signal bigger, it
 * uses the signal to modulate a current drawn from a power supply. Everything
 * below is derived from that one sentence, and every number on screen is
 * computed here rather than chosen.
 */

// ---------------------------------------------------------------------------
// THE MODEL — all constants either measured-standard or derived
// ---------------------------------------------------------------------------

const RL        = 8;                          // Ω, nominal load
const P_RATED   = 300;                        // W, the specification
const V_RMS     = DSP.vrmsFor(P_RATED, RL);   // √(300·8)   = 48.99 V
const V_PK      = V_RMS * Math.SQRT2;         //            = 69.28 V
const I_PK      = V_PK / RL;                  //            =  8.66 A
const I_RMS     = V_RMS / RL;                 //            =  6.12 A
const RAIL      = 75;                         // V, chosen ≥ V_PK + losses
const HEADROOM  = RAIL - V_PK;                //            =  5.72 V

const NPAIR     = 3;                          // complementary pairs per rail
const RE        = 0.22;                       // Ω, emitter resistor per device
const K_B       = 1.380649e-23;               // J/K   (SI defined)
const Q_E       = 1.602176634e-19;            // C     (SI defined)
const T_JUNC    = 300;                        // K
const VT        = (K_B * T_JUNC) / Q_E;       // 25.85 mV thermal voltage
const IS_DEV    = 5e-12;                      // A, device saturation current
/** Oliver's condition: crossover distortion is minimised when the quiescent
 *  voltage across each emitter resistor equals V_T. */
const IQ        = VT / RE;                    // 117.5 mA per device
const VBE_Q     = VT * Math.log(IQ / IS_DEV); // 617.4 mV
const VBIAS     = 2 * VBE_Q + 2 * IQ * RE;    // 1.2865 V across the spreader
const IQ_TOT    = NPAIR * IQ;                 // 352.5 mA per rail
const P_QUIES   = 2 * RAIL * IQ_TOT;          // 52.9 W burnt doing nothing
const VBIAS_LOW = 0.90;                       // V, the under-biased comparison

const P_MAX     = (RAIL * RAIL) / (2 * RL);   // 351.6 W ideal rail-to-rail
const M_WORST   = 2 / Math.PI;                // level at peak dissipation
const P_D_IDEAL = DSP.classABDissipation(RAIL, RL, M_WORST); // 142.5 W

// --- cable, output impedance, damping ---------------------------------------
const RHO_CU    = 1.724e-8;                   // Ω·m, annealed copper at 20 °C
const CAB_LEN   = 3.0;                        // m, one way
const CAB_AREA  = 2.5e-6;                     // m² (2.5 mm²)
const R_PER_M   = RHO_CU / CAB_AREA;          // 6.90 mΩ/m
const R_CABLE   = 2 * CAB_LEN * R_PER_M;      // 41.4 mΩ, out and back
const Z_OUT     = 0.02;                       // Ω, amplifier output impedance
const DF_TERM   = DSP.dampingFactor(RL, Z_OUT);              // 400
const DF_DRIVE  = DSP.dampingFactor(RL, Z_OUT + R_CABLE);    // 130
const RE_COIL   = 5.4;                        // Ω, voice-coil dc resistance
const BL        = 12;                         // N/A (= V·s/m) force factor
const F_BEMF    = 40;                         // Hz, stated operating point
const X_BEMF    = 0.004;                      // m, peak excursion there
const V_CONE    = DSP.TAU * F_BEMF * X_BEMF;  // 1.005 m/s peak
const E_BEMF    = DSP.backEmf(BL, V_CONE);    // 12.06 V peak
const I_BEMF    = E_BEMF / (RE_COIL + Z_OUT + R_CABLE);      // 2.21 A
const F_BRAKE   = DSP.motorForce(BL, I_BEMF); // 26.5 N opposing the motion
const DAMP_PEN  = (RE_COIL + Z_OUT + R_CABLE) / (RE_COIL + Z_OUT) - 1; // 0.76 %

// --- reservoir ---------------------------------------------------------------
const F_RIPPLE  = 100;                        // Hz, full-wave off 50 Hz mains
const C_RES     = 0.015;                      // F per rail
const I_DC_FULL = I_PK / Math.PI;             // 2.76 A mean rail current
const V_RIPPLE  = I_DC_FULL / (F_RIPPLE * C_RES);            // 1.84 V p-p
const E_RES     = 0.5 * C_RES * RAIL * RAIL;  // 42.2 J stored per rail

// --- what is actually moving in the wire ------------------------------------
const F_SIG     = 1000;                       // Hz test tone
const V_DRIFT   = DSP.driftVelocity(I_PK, 2.5);              // 2.55e-4 m/s
const X_DRIFT   = DSP.driftDisplacement(V_DRIFT, F_SIG);     // 40.5 nm
const VF        = 0.66;                       // velocity factor of the cable
const V_FIELD   = DSP.signalSpeed(VF);        // 1.979e8 m/s
const T_CABLE   = CAB_LEN / V_FIELD;          // 15.2 ns to cross 3 m
const X_IN_T    = V_DRIFT * T_CABLE;          // 3.9 pm — sub-atomic
const SPEED_RAT = V_FIELD / V_DRIFT;          // 7.8e11

const TS        = 0.002;                      // timeScale: 1 kHz → 2 Hz on screen

// ---------------------------------------------------------------------------
// Output-stage solver — a real complementary emitter follower, not a formula
// ---------------------------------------------------------------------------
const IS_N = NPAIR * IS_DEV;   // the bank behaves as one device N× as large
const RE_N = RE / NPAIR;       // …with N× less emitter degeneration

/** Solve  Vdrive = V_T·ln(1 + I/Is) + I·Re  for I ≥ 0. */
function deviceCurrent(vdrive) {
  if (vdrive <= 0) return 0;
  let lo = 0, hi = 60;
  for (let k = 0; k < 44; k++) {
    const mid = 0.5 * (lo + hi);
    if (VT * Math.log(1 + mid / IS_N) + mid * RE_N < vdrive) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Output voltage of the stage for a base drive `vin` at bias voltage `vb`. */
function stageOut(vin, vb) {
  let lo = vin - RAIL, hi = vin + RAIL;
  for (let k = 0; k < 48; k++) {
    const vo = 0.5 * (lo + hi);
    const iN = deviceCurrent(vin + vb / 2 - vo);
    const iP = deviceCurrent(vo - (vin - vb / 2));
    const f = iN - iP - vo / RL;               // KCL at the output node
    if (f > 0) lo = vo; else hi = vo;
  }
  return Math.min(Math.max(0.5 * (lo + hi), -V_PK), V_PK);
}

/** Quiescent current per device implied by a given bias voltage. */
function iqFor(vb) {
  let lo = 0, hi = 5;
  for (let k = 0; k < 60; k++) {
    const mid = 0.5 * (lo + hi);
    if (2 * VT * Math.log(1 + mid / IS_DEV) + 2 * mid * RE < vb) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}
const IQ_LOW = iqFor(VBIAS_LOW);               // 0.18 mA — badly under-biased

/**
 * Mean current drawn from one rail at output level m (fraction of full swing).
 * For an exponential complementary pair i_N·i_P ≈ I_q², so
 *   i_N = ½(i_out + √(i_out² + 4I_q²))
 * which is exactly class A at small signal and exactly class B at large.
 */
function railCurrent(m) {
  const ipk = (m * RAIL) / RL;
  let s = 0;
  const N = 192;
  for (let k = 0; k < N; k++) {
    const i = ipk * Math.sin((DSP.TAU * (k + 0.5)) / N);
    s += 0.5 * (i + Math.sqrt(i * i + 4 * IQ_TOT * IQ_TOT));
  }
  return s / N;
}
const pOut  = (m) => ((m * RAIL) ** 2) / (2 * RL);
const pDc   = (m) => 2 * RAIL * railCurrent(m);
const pDiss = (m) => Math.max(0, pDc(m) - pOut(m));

// peak of the modelled dissipation curve, found numerically
let M_PEAK = M_WORST, P_D_PEAK = 0;
for (let k = 1; k <= 400; k++) {
  const m = k / 400, p = pDiss(m);
  if (p > P_D_PEAK) { P_D_PEAK = p; M_PEAK = m; }
}
const X_PEAK = M_PEAK * M_PEAK;                // as a fraction of full output

// meter law: logarithmic, 30 dB of scale ending at the rated power
const MET_DB   = 30;
const MET_FS   = P_RATED;
const MET_SWEEP = 0.87266;                     // ±50° in radians
const meterFrac = (p) => DSP.clamp((10 * Math.log10(Math.max(p, 1e-9) / MET_FS) + MET_DB) / MET_DB, 0, 1);

// ---------------------------------------------------------------------------
// small geometry helpers
// ---------------------------------------------------------------------------
function roundRect(w, h, r, cx = 0, cy = 0, Ctor = THREE.Shape) {
  const s = new Ctor();
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
/** Extruded panels get UVs in metres; remap them to 0..1 so brushed maps read. */
function remapUV(geo, w, h) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}
/**
 * The material library is shared by every stage, and a stage that puts a
 * library material into its *overlay* has its opacity driven to zero by the
 * global fade. Hardware must not be at the mercy of that, so every material on
 * this chassis is a private clone, forced opaque.
 */
const _own = new Map();
function own(mat) {
  if (!mat || mat.userData.ampOwned) return mat;
  let c = _own.get(mat.uuid);
  if (!c) {
    c = mat.clone();
    c.userData.ampOwned = true;
    if (c.isMeshStandardMaterial || c.isMeshPhysicalMaterial) {
      c.transparent = false; c.opacity = 1; c.depthWrite = true;
      // `mats().alu` carries anisotropy 0.72, but none of the geometry helpers
      // emit a tangent attribute, so three's anisotropic specular has no frame
      // to work in and returns enormous values: the chassis vanishes into a
      // white bloom. Measured here at 0.81 mean luminance against a 0.17 plate.
      // The brushed look survives on the roughness and normal maps alone.
      if (c.anisotropy) c.anisotropy = 0;
    }
    _own.set(mat.uuid, c);
  }
  return c;
}
function ownAll(root) {
  root.traverse((o) => {
    if (!o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  return root;
}

function extrudePanel(shape, depth, w, h, mat, bevel = 0.0012) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments: 8, bevelEnabled: true,
    bevelSize: bevel, bevelThickness: bevel * 0.8, bevelSegments: 3,
  });
  remapUV(g, w, h);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// The meter dial — silkscreen on a backlit face, drawn once into a canvas
// ---------------------------------------------------------------------------
let _dialTex = null;
function dialTexture() {
  if (_dialTex) return _dialTex;
  const W = 1024, H = Math.round((W * MET_H) / MET_W);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // backlit face: lamps sit below the scale, so the hotspot is low and central
  const bg = g.createRadialGradient(W / 2, H * 0.92, 40, W / 2, H * 0.80, W * 0.86);
  bg.addColorStop(0.00, '#7fd3fb');
  bg.addColorStop(0.26, '#41abe6');
  bg.addColorStop(0.64, '#1f7cba');
  bg.addColorStop(1.00, '#12558c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // faint vertical falloff at the very top of the window
  const vg = g.createLinearGradient(0, 0, 0, H * 0.5);
  vg.addColorStop(0, 'rgba(6,26,44,0.34)');
  vg.addColorStop(1, 'rgba(6,26,44,0.00)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  const PX = W / MET_W;                    // pixels per metre
  const cx = W / 2, cy = H / 2 + PIVOT_DY * PX;   // needle pivot, in canvas pixels
  const rTick = R_TICK * PX, rNum = R_NUM * PX;
  const ink = 'rgba(4,16,28,0.95)';
  const inkS = 'rgba(4,16,28,0.62)';

  // 1 dB ticks across 30 dB, majors every 5 dB
  for (let d = 0; d <= MET_DB; d++) {
    const a = (-MET_SWEEP + (d / MET_DB) * 2 * MET_SWEEP);
    const major = d % 5 === 0;
    const len = major ? 40 : (d % 5 === 0 ? 26 : 18);
    g.strokeStyle = major ? ink : inkS;
    g.lineWidth = major ? 6.5 : 2.6;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * rTick, cy - Math.cos(a) * rTick);
    g.lineTo(cx + Math.sin(a) * (rTick - len), cy - Math.cos(a) * (rTick - len));
    g.stroke();
  }
  // scale arc
  g.strokeStyle = 'rgba(4,16,28,0.50)'; g.lineWidth = 2.4;
  g.beginPath(); g.arc(cx, cy, rTick, -Math.PI / 2 - MET_SWEEP, -Math.PI / 2 + MET_SWEEP); g.stroke();

  // numerals: 0.3 1 3 10 30 100 300 W — five decibels apart, so evenly spaced
  const labels = ['0.3', '1', '3', '10', '30', '100', '300'];
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < labels.length; i++) {
    const a = -MET_SWEEP + (i / (labels.length - 1)) * 2 * MET_SWEEP;
    const x = cx + Math.sin(a) * rNum, y = cy - Math.cos(a) * rNum;
    g.save(); g.translate(x, y); g.rotate(a * 0.55);
    g.font = '600 40px ui-sans-serif, -apple-system, Helvetica, Arial';
    g.fillText(labels[i], 0, 0);
    g.restore();
  }

  g.font = '600 26px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,28,0.82)';
  g.letterSpacing = '7px';
  g.fillText('POWER OUTPUT', cx, H * 0.155);
  g.font = '500 21px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,28,0.68)';
  g.fillText('WATTS INTO 8 Ω', cx, H * 0.855);
  g.letterSpacing = '0px';
  g.font = '500 19px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,28,0.56)';
  g.fillText('−30 dB', cx - rTick * 0.90, cy - rTick * 0.30);
  g.fillText('0 dB', cx + rTick * 0.92, cy - rTick * 0.30);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  _dialTex = t;
  return t;
}

// ---------------------------------------------------------------------------
// HARDWARE — one monoblock, built once and cloned
// ---------------------------------------------------------------------------
const W_BODY = 0.240, H_BODY = 0.400, D_BODY = 0.384;
const Y_BASE = 0.034;                       // top of the plinth
const Y_MID  = Y_BASE + H_BODY / 2;         // chassis centre
const Y_MET  = Y_MID + 0.072;               // meter window centre
const Z_FACE = D_BODY / 2;                  // where the fascia starts
const MET_W = 0.184, MET_H = 0.122;
const PIVOT_DY = 0.056;                     // pivot below the window centre
const PIVOT_Y = Y_MET - PIVOT_DY;
const R_TICK = 0.086, R_NUM = 0.0672, NEEDLE_L = 0.091;

/** Variants tuned for this chassis: bead-blasted rather than mirror-polished. */
function ampMetals() {
  const M = mats();
  // clone, force opaque (a library material may already have been driven to
  // opacity 0 by another stage's overlay fade), then apply the overrides
  const mk = (src, o) => {
    const m = src.clone();
    m.transparent = false; m.opacity = 1; m.depthWrite = true;
    Object.assign(m, o);
    m.userData.ampOwned = true;
    return m;
  };
  return {
    // the top deck faces the strip light square-on, so it is the matt one
    top: mk(M.alu, { roughness: 0.46, envMapIntensity: 0.70, anisotropy: 0 }),
    fascia: mk(M.alu, { roughness: 0.25, envMapIntensity: 1.30, anisotropy: 0 }),
    rib: mk(M.aluV, { roughness: 0.42, envMapIntensity: 0.82, anisotropy: 0 }),
    bezel: mk(M.chrome, { roughness: 0.085, envMapIntensity: 1.15 }),
  };
}

function buildMono() {
  const M = mats();
  const A = ampMetals();
  const g = new THREE.Group();

  // ---- plinth, feet, shell -------------------------------------------------
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.015, 0.019, 0.018, 28, 0.0012), M.steel);
    f.position.set(sx * 0.115, 0.009, sz * 0.155);
    f.castShadow = true;
    g.add(f);
  }
  const plinth = new THREE.Mesh(GEO.bevelBox(0.300, 0.018, 0.400, 0.0025, 3), M.anodBlack);
  plinth.position.y = 0.027;
  g.add(plinth);

  const shell = new THREE.Mesh(GEO.bevelBox(W_BODY, H_BODY, D_BODY, 0.004, 4), M.anodBlack);
  shell.position.set(0, Y_MID, 0);
  g.add(shell);

  // ---- flanking heatsinks --------------------------------------------------
  // heatsink() builds fins running out along its local +Z; rotate so they
  // protrude sideways and the base plate lands flush on the chassis cheek.
  for (const sx of [-1, 1]) {
    const hs = GEO.heatsink(0.350, 0.330, 0.062, 26, { mat: M.anodGrey, baseT: 0.007, finT: 0.0026 });
    hs.rotation.y = sx * Math.PI / 2;
    hs.position.set(sx * (W_BODY / 2 + 0.031), Y_MID, 0);
    g.add(hs);
    // a machined cap top and bottom ties the fin stack to the chassis
    for (const sy of [-1, 1]) {
      const cap = new THREE.Mesh(GEO.bevelBox(0.066, 0.010, 0.354, 0.0015, 3), M.anodBlack);
      cap.position.set(sx * (W_BODY / 2 + 0.031), Y_MID + sy * 0.170, 0);
      g.add(cap);
    }
  }

  // ---- top plate + venting -------------------------------------------------
  const top = new THREE.Mesh(GEO.bevelBox(0.264, 0.014, 0.402, 0.0026, 4), A.top);
  top.position.y = Y_BASE + H_BODY + 0.007;
  g.add(top);
  const vents = GEO.ventSlots(0.150, 0.290, 3, 13, { mat: M.plastic, sw: 0.0055, sd: 0.016 });
  vents.position.set(0, Y_BASE + H_BODY + 0.0135, -0.01);
  g.add(vents);

  // ---- fascia: a real aperture cut for the meter ---------------------------
  const FW = 0.250, FH = 0.408;
  const fShape = roundRect(FW, FH, 0.007);
  fShape.holes.push(roundRect(MET_W, MET_H, 0.006, 0, Y_MET - Y_MID, THREE.Path));
  const fascia = extrudePanel(fShape, 0.016, FW, FH, A.fascia, 0.0014);
  fascia.position.set(0, Y_MID, Z_FACE);
  g.add(fascia);

  // proud vertical accent ribs either side of the fascia
  for (const sx of [-1, 1]) {
    const rib = new THREE.Mesh(GEO.bevelBox(0.013, 0.392, 0.006, 0.0016, 3), A.rib);
    rib.position.set(sx * 0.107, Y_MID, Z_FACE + 0.0185);
    rib.castShadow = rib.receiveShadow = true;
    g.add(rib);
  }
  // a machined channel across the lower fascia carries the controls
  const chanY = Y_MID - 0.112;
  const chan = new THREE.Mesh(GEO.bevelBox(0.198, 0.058, 0.004, 0.0016, 3), M.anodBlack);
  chan.position.set(0, chanY, Z_FACE + 0.0166);
  chan.castShadow = chan.receiveShadow = true;
  g.add(chan);
  const kn = GEO.knob(0.0165, 0.013, { body: A.fascia, mark: A.bezel });
  kn.rotation.x = Math.PI / 2;
  kn.position.set(-0.062, chanY, Z_FACE + 0.0242);
  g.add(kn);
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0027, 16),
      i === 0 ? M.ledCyan : (i === 1 ? M.ledAmber : M.ledGreen));
    led.position.set(0.030 + i * 0.017, chanY, Z_FACE + 0.0190);
    led.castShadow = led.receiveShadow = false;
    g.add(led);
  }
  // engraved hairlines break up the lower panel
  for (const dy of [-0.052, 0.052]) {
    const ln = new THREE.Mesh(GEO.bevelBox(0.198, 0.0016, 0.0016, 0.0004, 2), M.anodBlack);
    ln.position.set(0, chanY + dy, Z_FACE + 0.0172);
    g.add(ln);
  }
  GEO.screwRow(g, [[-0.062, Y_MID - 0.182], [0.062, Y_MID - 0.182]], Z_FACE + 0.0182, 0.0015);
  GEO.screwRow(g, [[-0.117, Y_MID + 0.190], [0.117, Y_MID + 0.190],
    [-0.117, Y_MID - 0.190], [0.117, Y_MID - 0.190]], Z_FACE + 0.0176, 0.0018);

  // ---- the meter -----------------------------------------------------------
  const Z_DIAL = Z_FACE + 0.0042;
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.002, MET_H - 0.002),
    new THREE.MeshBasicMaterial({ map: dialTexture(), toneMapped: false }));
  dial.position.set(0, Y_MET, Z_DIAL);
  g.add(dial);

  // the backlight itself, a hairline of near-white just inside the bottom lip
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.030, 0.0016),
    new THREE.MeshBasicMaterial({ color: 0xf2f9ff, toneMapped: false }));
  lamp.position.set(0, Y_MET - MET_H / 2 + 0.0026, Z_DIAL + 0.0006);
  g.add(lamp);

  // needle: pivots below the scale, dark against the lit face
  const pivot = new THREE.Group();
  pivot.name = 'needle';
  pivot.position.set(0, PIVOT_Y, Z_DIAL + 0.0082);
  // A lit dielectric pointer 1.6 px wide renders at almost exactly the dial's
  // own brightness and disappears. A flat unlit silhouette always reads.
  const needleMat = new THREE.MeshBasicMaterial({ color: 0x081826 });
  needleMat.userData.ampOwned = true;
  const nd = new THREE.Mesh(GEO.bevelBox(0.0044, NEEDLE_L, 0.0020, 0.0007, 2), needleMat);
  nd.position.y = NEEDLE_L / 2;
  pivot.add(nd);
  const nb = new THREE.Mesh(GEO.bevelBox(0.0082, 0.022, 0.0022, 0.0009, 2), needleMat);
  nb.position.y = 0.009;
  pivot.add(nb);
  const tail = new THREE.Mesh(GEO.bevelBox(0.0050, 0.014, 0.0022, 0.0007, 2), needleMat);
  tail.position.y = -0.009;
  pivot.add(tail);
  g.add(pivot);
  const hub = new THREE.Mesh(GEO.bevelCyl(0.0062, 0.0068, 0.004, 24, 0.0006), A.bezel);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, PIVOT_Y, Z_DIAL + 0.0076);
  g.add(hub);

  // bezel + glass
  const bShape = roundRect(MET_W + 0.020, MET_H + 0.020, 0.008);
  bShape.holes.push(roundRect(MET_W - 0.006, MET_H - 0.006, 0.005, 0, 0, THREE.Path));
  const bez = extrudePanel(bShape, 0.009, MET_W + 0.020, MET_H + 0.020, A.bezel, 0.0010);
  bez.position.set(0, Y_MET, Z_FACE + 0.0125);
  g.add(bez);

  const smoked = M.glass.clone();
  smoked.userData.ampOwned = true;
  smoked.transparent = true;
  smoked.opacity = 0.22;
  smoked.depthWrite = false;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.004, MET_H - 0.004), smoked);
  glass.position.set(0, Y_MET, Z_FACE + 0.0185);
  glass.renderOrder = 2;
  g.add(glass);

  // ---- rear panel ----------------------------------------------------------
  const rear = new THREE.Mesh(GEO.bevelBox(0.238, 0.398, 0.008, 0.0022, 3), M.anodGrey);
  rear.position.set(0, Y_MID, -D_BODY / 2 - 0.002);
  g.add(rear);
  const back = new THREE.Group();
  back.rotation.y = Math.PI;
  back.position.z = -D_BODY / 2 - 0.006;
  g.add(back);
  const put = (o, x, y) => { o.position.set(-x, y, 0); back.add(o); return o; };
  // two pairs of binding posts — hot and return, twice over
  const pc = [[-0.078, 0xd94b3a], [-0.040, 0x1a1c20], [0.040, 0xd94b3a], [0.078, 0x1a1c20]];
  for (const [x, col] of pc) put(GEO.bindingPost({ colour: col }), x, Y_MID - 0.126);
  put(GEO.xlr(), -0.058, Y_MID + 0.118);
  put(GEO.rcaJack(0xd94b3a), 0.042, Y_MID + 0.118);
  put(GEO.iecInlet(), 0.058, Y_MID - 0.178);
  // mains switch: rocker in a bezel
  const sw = new THREE.Group();
  const swb = new THREE.Mesh(GEO.bevelBox(0.024, 0.017, 0.006, 0.0010, 2), M.plastic);
  swb.position.z = 0.003; sw.add(swb);
  const rock = new THREE.Mesh(GEO.bevelBox(0.019, 0.012, 0.005, 0.0012, 2), M.anodGrey);
  rock.position.set(0, 0.001, 0.0068); rock.rotation.x = -0.22; sw.add(rock);
  put(sw, -0.056, Y_MID - 0.178);
  GEO.shadowed(back);

  GEO.shadowed(g);
  ownAll(g);
  dial.castShadow = dial.receiveShadow = false;
  lamp.castShadow = lamp.receiveShadow = false;
  glass.castShadow = glass.receiveShadow = false;

  const sh = GEO.contactShadow(0.62, 0.72, 0.55, 0.0);
  sh.position.y = 0.001;
  g.add(sh);
  return g;
}

// ---------------------------------------------------------------------------
// OVERLAY — the schematic panel
// ---------------------------------------------------------------------------
const P_ORIGIN = [-0.58, 0.20, -2.66];
const P_RY = 0.26;
const P_SCALE = 0.74;

// zone 1 — the output stage
const Y_RP = 0.980, Y_UP = 0.912, Y_OUT = 0.828, Y_LO = 0.744, Y_RN = 0.676;
const Y_0V = 0.790, Y_GND = 0.618;
const DEV_X = [0.450, 0.545, 0.640];
const X_AMP_T = 0.780, X_SPK_T = 0.940, X_LOAD = 1.000;
// zone 2 — inside the cable
const Y_HOT = 0.505, Y_RET = 0.425, X_C0 = 0.140, X_C1 = 1.060;
// zone rules
const Y_RULE1 = 0.578, Y_RULE2 = 0.352;

function seg(parent, pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => [pts[i][0], pts[i][1], opts.z || 0]);
  parent.add(t);
  return t;
}
/**
 * `diagramCard` installs a `userData.setOpacity` hook. `fadeTree` calls that
 * hook on the group *before* it reaches the plate mesh, where it caches the
 * (already scaled, therefore ~0) opacity as the base — and the plate never
 * comes back. Removing the hook lets fadeTree cache the pristine value.
 */
function unhookCard(card) { delete card.userData.setOpacity; return card; }

function anchor(parent, x, y) {
  const o = new THREE.Object3D();
  o.position.set(x, y, 0.004);
  parent.add(o);
  return o;
}

function buildOverlay(ctx) {
  const M = mats();
  const root = new THREE.Group();
  const P = new THREE.Group();
  P.position.set(...P_ORIGIN);
  P.rotation.y = P_RY;
  P.scale.setScalar(P_SCALE);
  root.add(P);

  // one instrument plate, three zones divided by hairlines
  const card = unhookCard(DIAG.diagramCard(1.12, 1.05, { opacity: 0.95 }));
  card.position.set(0.02, 0.01, -0.004);
  P.add(card);

  const dimWire = 0x7b848f;
  const dash = { dashed: true, dashSize: 0.009, gapSize: 0.007, opacity: 0.5 };
  for (const y of [Y_RULE1, Y_RULE2]) seg(P, [[0.02, y], [1.14, y]], 0x39414c, 1.0, { opacity: 0.7 });

  // ---- supply rails --------------------------------------------------------
  const railP = [[0.155, Y_RP]];
  const railN = [[0.155, Y_RN]];
  for (const x of DEV_X) {
    railP.push([x, Y_RP], [x, Y_UP + 0.029], [x, Y_RP]);
    railN.push([x, Y_RN], [x, Y_LO - 0.029], [x, Y_RN]);
  }
  railP.push([0.74, Y_RP]);
  railN.push([0.74, Y_RN]);
  const railPT = seg(P, railP, PAL.am, 2.8);
  const railNT = seg(P, railN, PAL.am, 2.8);

  // ---- reservoir bank ------------------------------------------------------
  const canGeo = GEO.bevelCyl(0.030, 0.030, 0.090, 30, 0.0028);
  const canMat = new THREE.MeshBasicMaterial({ color: 0x2c333c, toneMapped: false, transparent: true });
  const canEdge = [];
  for (const [cy, top, bot] of [[0.885, Y_RP, Y_0V], [0.721, Y_0V, Y_RN]]) {
    const can = new THREE.Mesh(canGeo, canMat);
    can.position.set(0.155, cy, 0.010);
    P.add(can);
    // outline + polarity band so it reads as a capacitor, not a grey lump
    canEdge.push(seg(P, [[0.125, cy - 0.045], [0.185, cy - 0.045], [0.185, cy + 0.045],
      [0.125, cy + 0.045], [0.125, cy - 0.045]], PAL.am, 1.4, { opacity: 0.8, z: 0.012 }));
    seg(P, [[0.127, cy + 0.028], [0.183, cy + 0.028]], PAL.am, 2.2, { opacity: 0.95, z: 0.012 });
    seg(P, [[0.155, top], [0.155, cy + 0.045]], PAL.am, 2.0);
    seg(P, [[0.155, cy - 0.045], [0.155, bot]], PAL.am, 2.0);
  }
  // 0 V node, and the drop to the return bus
  seg(P, [[0.060, Y_0V], [0.300, Y_0V]], PAL.ink, 2.2, { opacity: 0.9 });
  seg(P, [[0.060, Y_0V], [0.060, Y_GND]], PAL.ink, 2.2, { opacity: 0.9 });

  // ---- driver + bias spreader ---------------------------------------------
  const blockMat = new THREE.MeshBasicMaterial({ color: 0x1b222b, toneMapped: false, transparent: true });
  const drv = new THREE.Mesh(GEO.bevelBox(0.062, 0.048, 0.006, 0.0018, 2), blockMat);
  drv.position.set(0.310, Y_OUT, 0.004);
  P.add(drv);
  seg(P, [[0.279, Y_OUT + 0.048], [0.279, Y_OUT + 0.024]], PAL.cy, 1.8, { opacity: 0.9 });
  seg(P, [[0.341, Y_OUT], [0.385, Y_OUT]], PAL.cy, 2.0);
  seg(P, [[0.385, Y_LO], [0.385, Y_UP], [0.425, Y_UP]], PAL.cy, 2.0);
  seg(P, [[0.385, Y_LO], [0.425, Y_LO]], PAL.cy, 2.0);
  const spread = new THREE.Mesh(GEO.bevelBox(0.020, 0.070, 0.005, 0.0015, 2), blockMat);
  spread.position.set(0.385, Y_OUT, 0.004);
  P.add(spread);
  for (const [x0, y0, x1, y1] of [[0.375, Y_OUT + 0.028, 0.395, Y_OUT + 0.028],
    [0.375, Y_OUT - 0.028, 0.395, Y_OUT - 0.028]]) {
    seg(P, [[x0, y0], [x1, y1]], PAL.cy, 1.4, { opacity: 0.7, z: 0.006 });
  }

  // ---- output devices ------------------------------------------------------
  const devGeo = GEO.bevelBox(0.050, 0.058, 0.010, 0.0026, 3);
  const devMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
  const banks = [];
  for (const [yc, sgn] of [[Y_UP, 1], [Y_LO, -1]]) {
    const im = new THREE.InstancedMesh(devGeo, devMat, NPAIR);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NPAIR * 3), 3);
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4();
    for (let i = 0; i < NPAIR; i++) { m.makeTranslation(DEV_X[i], yc, 0.008); im.setMatrixAt(i, m); }
    im.frustumCulled = false;
    im.renderOrder = 12;
    P.add(im);
    banks.push(im);
    for (const x of DEV_X) {
      // outline so the device reads even when it is not conducting
      seg(P, [[x - 0.025, yc - 0.029], [x + 0.025, yc - 0.029], [x + 0.025, yc + 0.029],
        [x - 0.025, yc + 0.029], [x - 0.025, yc - 0.029]], 0x707a86, 1.1, { opacity: 0.8, z: 0.014 });
      // emitter resistor, then the lead to the output node
      seg(P, [[x, yc - sgn * 0.029], [x, yc - sgn * 0.038]], PAL.am, 2.0);
      seg(P, [[x, yc - sgn * 0.055], [x, Y_OUT]], PAL.am, 2.0);
      const r = new THREE.Mesh(GEO.bevelBox(0.017, 0.018, 0.006, 0.0014, 2), blockMat);
      r.position.set(x, yc - sgn * 0.0465, 0.005);
      P.add(r);
      seg(P, [[x - 0.0085, yc - sgn * 0.0555], [x + 0.0085, yc - sgn * 0.0555],
        [x + 0.0085, yc - sgn * 0.0375], [x - 0.0085, yc - sgn * 0.0375],
        [x - 0.0085, yc - sgn * 0.0555]], PAL.am, 1.0, { opacity: 0.65, z: 0.008 });
    }
  }

  // ---- output node, terminals, load, return bus ---------------------------
  const hotRun = seg(P, [[0.420, Y_OUT], [X_LOAD, Y_OUT]], PAL.cy, 3.2);
  const retRun = seg(P, [[0.060, Y_GND], [X_LOAD, Y_GND]], PAL.ink, 3.2, { opacity: 0.92 });
  seg(P, [[X_LOAD, Y_OUT], [X_LOAD, 0.800]], PAL.cy, 2.6);
  seg(P, [[X_LOAD, 0.646], [X_LOAD, Y_GND]], PAL.ink, 2.6, { opacity: 0.92 });
  const NW = 6, coilPts = [];
  for (let i = 0; i <= NW * 14; i++) {
    const u = i / (NW * 14);
    coilPts.push([X_LOAD - 0.017 + Math.cos(u * NW * DSP.TAU) * 0.017, 0.800 - u * 0.154]);
  }
  seg(P, coilPts, PAL.cy, 2.2, { opacity: 0.95 });

  // amplifier terminals and loudspeaker terminals: the cable runs between them
  const ring = (x, y, col) => {
    const t = new THREE.Mesh(new THREE.RingGeometry(0.0055, 0.0095, 22),
      new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, side: THREE.DoubleSide }));
    t.position.set(x, y, 0.010);
    t.renderOrder = 13;
    P.add(t);
  };
  for (const x of [X_AMP_T, X_SPK_T]) { ring(x, Y_OUT, PAL.rd); ring(x, Y_GND, 0xa8b0ba); }
  seg(P, [[X_AMP_T, Y_OUT - 0.012], [X_AMP_T, Y_RULE1 + 0.006]], dimWire, 1.0, dash);
  seg(P, [[X_SPK_T, Y_OUT - 0.012], [X_SPK_T, Y_RULE1 + 0.006]], dimWire, 1.0, dash);

  // ---- direction arrows: the loop, and it reverses -------------------------
  const arrowMat = new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true });
  const arrows = [];
  for (const [ax, ay, base] of [[0.700, Y_OUT, 0], [0.860, Y_OUT, 0],
    [0.700, Y_GND, Math.PI], [0.300, Y_GND, Math.PI]]) {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.021, 12), arrowMat);
    a.position.set(ax, ay, 0.009);
    a.userData.base = base;
    P.add(a);
    arrows.push(a);
  }

  // ---- zone 2: inside the cable -------------------------------------------
  seg(P, [[X_C0, Y_HOT], [X_C1, Y_HOT]], 0x5b6774, 6.5, { opacity: 0.95 });
  seg(P, [[X_C0, Y_RET], [X_C1, Y_RET]], 0x5b6774, 6.5, { opacity: 0.95 });
  const dim = DIAG.dimension([X_C0, Y_RULE2 + 0.026, 0.002], [X_C1, Y_RULE2 + 0.026, 0.002],
    { color: dimWire, head: 0.011 });
  P.add(dim);

  const front = [];
  for (const y of [Y_HOT, Y_RET]) {
    const s = DIAG.glow(PAL.cy, 0.070, 0.9, radialSprite(128));
    s.position.set(X_C0, y, 0.012);
    P.add(s);
    front.push(s);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.0045, 0.024),
      new THREE.MeshBasicMaterial({ color: 0xdff2ff, toneMapped: false, transparent: true }));
    b.position.set(X_C0, y, 0.013);
    P.add(b);
    front.push(b);
  }

  const NC = 24;
  const carriers = new DIAG.Swarm(NC * 2, { color: PAL.am, size: 0.0048, additive: false });
  P.add(carriers);
  const marks = [];
  for (let i = 0; i < NC; i++) marks.push(X_C0 + 0.024 + (i / (NC - 1)) * (X_C1 - X_C0 - 0.048));
  const tickPts = [];
  for (const x of marks) tickPts.push([x, Y_HOT - 0.016], [x, Y_HOT - 0.009], [x, Y_HOT - 0.016]);
  seg(P, tickPts, dimWire, 0.9, { opacity: 0.4 });

  // ---- zone 3: the two graphs ---------------------------------------------
  const gain = stageOut(2, VBIAS) / 2;
  const gT = new DIAG.Graph({
    w: 0.44, h: 0.22, xRange: [-2, 2], yRange: [-2, 2],
    xTicks: [-2, -1, 0, 1, 2], yTicks: [-2, -1, 0, 1, 2], zeroLine: 0,
  });
  gT.position.set(0.085, 0.060, 0);
  // the class-B deadband: neither device conducts until the drive clears 2·V_be
  const dead = new THREE.Mesh(
    new THREE.PlaneGeometry(gT.x(VBE_Q * 2) - gT.x(-VBE_Q * 2), 0.22),
    new THREE.MeshBasicMaterial({ color: PAL.rd, transparent: true, opacity: 0.11, depthWrite: false, toneMapped: false }));
  dead.position.set(gT.x(0), 0.11, -0.0003);
  dead.renderOrder = 6;
  gT.add(dead);
  gT.addTrace((x) => x * gain, { color: dimWire, width: 1.1, n: 2, dashed: true, opacity: 0.5 });
  gT.addTrace((x) => stageOut(x, 0), { color: PAL.rd, width: 2.4, n: 190 });
  gT.addTrace((x) => stageOut(x, VBIAS_LOW), { color: PAL.vi, width: 1.8, n: 190, dashed: true });
  gT.addTrace((x) => stageOut(x, VBIAS), { color: PAL.cy, width: 2.8, n: 190 });
  P.add(gT);

  const gD = new DIAG.Graph({
    w: 0.44, h: 0.22, xRange: [0, 1], yRange: [0, 470],
    xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 117.5, 235, 352.5, 470],
  });
  gD.position.set(0.625, 0.060, 0);
  gD.addTrace((x) => pDc(Math.sqrt(x)), { color: PAL.vi, width: 1.6, n: 140, opacity: 0.75 });
  gD.addTrace((x) => x * P_MAX, { color: PAL.cy, width: 2.2, n: 140 });
  gD.addTrace((x) => pDiss(Math.sqrt(x)), { color: PAL.am, width: 2.8, n: 140 });
  gD.addMarker(X_PEAK, { color: PAL.am, width: 1.3 });
  const dotD = gD.addDot(PAL.am, 0.0065);
  const dotP = gD.addDot(PAL.cy, 0.0055);
  P.add(gD);

  return { root, P, banks, arrows, front, carriers, marks, hotRun, retRun, railPT, railNT, dotD, dotP };
}

// ---------------------------------------------------------------------------
// animation constants (all derived from the geometry above)
// ---------------------------------------------------------------------------
const CAR_SCALE = (X_C1 - X_C0 - 0.040) / CAB_LEN;  // screen metres per real metre
const CAR_AMP   = 0.0060;                            // visible amplitude, metres
const CAR_EXAG  = CAR_AMP / (X_DRIFT * CAR_SCALE);   // ≈ 5 × 10⁵
const FRONT_RUN = 1.0;                               // real seconds per traverse
const FRONT_GAP = 0.45;
const FRONT_RAT = FRONT_RUN / T_CABLE;               // ≈ 6.6 × 10⁷ slow-down

const _cA = new THREE.Color(), _cB = new THREE.Color();
const HOT = new THREE.Color(PAL.am), COLD = new THREE.Color(0x39414b);
const exp10 = (v, d = 1) => {
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  const S = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return `${m.toFixed(d)} × 10${String(e).split('').map((c) => S[c]).join('')}`;
};

export default {
  id: 'amp',
  title: 'Power&nbsp;Amplification',
  nav: 'Monoblocks',
  kicker: 'Monoblocks',
  standfirst: 'The amplifier is a valve on the power supply, not a source of energy.',
  shot: { position: [0.442, 0.995, -0.560], target: [-0.122, 0.625, -2.78], fov: 31 },
  timeScale: TS,
  alwaysUpdate: true,

  build(ctx) {
    const hardware = new THREE.Group();
    const a = buildMono();
    a.position.set(LAYOUT.monoL.x, LAYOUT.monoL.y, LAYOUT.monoL.z);
    a.rotation.y = LAYOUT.monoL.ry;
    const b = a.clone(true);
    b.position.set(LAYOUT.monoR.x, LAYOUT.monoR.y, LAYOUT.monoR.z);
    b.rotation.y = LAYOUT.monoR.ry;
    hardware.add(a, b);

    const needles = [a.getObjectByName('needle'), b.getObjectByName('needle')];
    const metAnchor = new THREE.Object3D();
    metAnchor.position.set(-0.06, Y_MET + 0.062, Z_FACE + 0.02);
    a.add(metAnchor);

    const S = buildOverlay(ctx);
    S.needles = needles;
    S.deflect = [0.5, 0.5];
    this._s = S;
    this._live = { v: 0, i: 0, p: 0, pd: P_QUIES, mean: 0 };

    const L = ctx.labels;
    const P = S.P;
    S.L = {
      meter: L.add(metAnchor, {
        kicker: 'Meter', cls: 'acc', offset: [10, -104],
        text: `log · ${MET_DB} dB to ${MET_FS} W<br>`, value: '—',
      }),
      supply: L.add(anchor(P, 0.10, Y_RP), {
        kicker: 'Supply', cls: 'am', offset: [-14, -28],
        text: `±${RAIL} V · ${(C_RES * 1000).toFixed(0)} mF · ${E_RES.toFixed(0)} J<br>`,
        value: '—',
      }),
      dev: L.add(anchor(P, 0.545, 1.062), {
        kicker: 'Output devices', cls: 'am', offset: [0, -16],
        text: `${NPAIR} NPN · ${NPAIR} PNP<br>`, value: '—',
      }),
      load: L.add(anchor(P, X_LOAD, 0.723), {
        kicker: 'Load', cls: 'acc', offset: [44, 0],
        text: `${RL} Ω coil<br>Bl ${BL} N/A<br>`,
        value: `e ${E_BEMF.toFixed(1)} V pk`,
      }),
      ret: L.add(anchor(P, 0.17, Y_GND), {
        kicker: 'Return path', cls: '', offset: [16, 24],
        text: 'the loop closes<br>', value: `DF ${DF_TERM.toFixed(0)} → ${DF_DRIVE.toFixed(0)}`,
      }),
      cable: L.add(anchor(P, 0.60, Y_HOT), {
        kicker: 'Inside the cable', cls: 'am', offset: [0, -36],
        text: `field ${exp10(V_FIELD, 2)} m/s<br>carriers ${exp10(V_DRIFT, 2)} m/s<br>`,
        value: `× ${exp10(SPEED_RAT)}`,
      }),
      gT: L.add(anchor(P, 0.305, 0.292), {
        kicker: 'Class AB handover', cls: 'acc', offset: [0, -16],
        text: `±2 V of a ±${V_PK.toFixed(0)} V swing<br>`,
        value: `I_q ${(IQ * 1000).toFixed(0)} vs ${(IQ_LOW * 1000).toFixed(2)} mA`,
      }),
      gD: L.add(anchor(P, 0.845, 0.292), {
        kicker: 'Device dissipation', cls: 'am', offset: [0, -16],
        text: '0 → 470 W vs output<br>',
        value: `peak ${P_D_PEAK.toFixed(0)} W at ${(X_PEAK * 100).toFixed(0)} %`,
      }),
    };

    // park the needles somewhere plausible before the stage is ever visited
    for (const n of needles) n.rotation.z = MET_SWEEP - 2 * MET_SWEEP * meterFrac(6);
    return { hardware, overlay: S.root };
  },

  update(dt, t, ctx) {
    const S = this._s;
    if (!S) return;
    const tp = t / TS;                 // real seconds — the programme timescale
    const dtp = dt / TS;

    // Slow programme envelope, as a fraction of the 300 W peak swing. The two
    // monoblocks are fed the same programme a third of a second apart, which is
    // where the difference between the two meters comes from.
    const envelope = (u) => DSP.clamp(
      0.50 + 0.30 * Math.sin(DSP.TAU * 0.085 * u)
           + 0.17 * Math.sin(DSP.TAU * 0.031 * u + 2.1)
           + 0.06 * Math.sin(DSP.TAU * 0.210 * u + 0.7), 0.02, 1);
    const env = envelope(tp);
    const envR = envelope(tp - 0.33);
    const vpk = V_PK * env;
    const mm = vpk / RAIL;                       // fraction of the rail swing
    const ph = DSP.TAU * F_SIG * t;
    const v = vpk * Math.sin(ph);
    const i = v / RL;
    const p = v * i;
    const mean = DSP.powerW(vpk / Math.SQRT2, RL);
    const pd = pDiss(mm);
    this._live = { v, i, p, pd, mean };

    // --- meters: a 180 ms ballistic on a logarithmic power scale ------------
    const meanR = DSP.powerW((V_PK * envR) / Math.SQRT2, RL);
    const k = 1 - Math.exp(-dtp / 0.18);
    for (let n = 0; n < 2; n++) {
      const target = meterFrac(n === 0 ? mean : meanR);
      S.deflect[n] += (target - S.deflect[n]) * k;
      S.needles[n].rotation.z = MET_SWEEP - 2 * MET_SWEEP * S.deflect[n];
    }
    S.L.meter.setValue(`${mean < 10 ? mean.toFixed(2) : mean.toFixed(0)} W mean`);

    if (ctx.stage.reveal < 0.004) return;        // overlay is invisible — stop here

    // --- which bank is the valve right now ---------------------------------
    const duty = Math.abs(i) / I_PK;
    // both banks always carry at least I_q; the split follows i_N·i_P ≈ I_q².
    // Brightness is √(i_device/I_pk) — a monotone map, not a linear one.
    const iUp = 0.5 * (i + Math.sqrt(i * i + 4 * IQ_TOT * IQ_TOT));
    const iDn = iUp - i;
    for (let b = 0; b < 2; b++) {
      const lvl = Math.sqrt(DSP.clamp((b === 0 ? iUp : iDn) / I_PK, 0, 1));
      _cA.copy(COLD).lerp(HOT, 0.12 + 0.88 * lvl);
      for (let d = 0; d < NPAIR; d++) S.banks[b].setColorAt(d, _cA);
      S.banks[b].instanceColor.needsUpdate = true;
    }
    S.railPT._baseOpacity = i >= 0 ? 0.45 + 0.55 * duty : 0.30;
    S.railNT._baseOpacity = i < 0 ? 0.45 + 0.55 * duty : 0.30;
    S.hotRun._baseOpacity = 0.50 + 0.50 * duty;
    S.retRun._baseOpacity = 0.50 + 0.50 * duty;

    for (const a of S.arrows) a.rotation.z = (i >= 0 ? -Math.PI / 2 : Math.PI / 2) + a.userData.base;

    // --- inside the cable ---------------------------------------------------
    // carriers: displacement is the integral of current, so it goes as −cos.
    const disp = -Math.cos(ph) * CAR_AMP * env;
    const N = S.marks.length;
    S.carriers.update((n) => {
      const lane = n < N ? 0 : 1;
      const x = S.marks[n % N] + (lane === 0 ? disp : -disp);
      return { p: [x, lane === 0 ? Y_HOT : Y_RET, 0.008], s: 1, c: PAL.am };
    });
    // field front: its own clock, and the label says so
    const u = (tp % (FRONT_RUN + FRONT_GAP)) / FRONT_RUN;
    const live = u <= 1;
    const fx = X_C0 + DSP.clamp(u, 0, 1) * (X_C1 - X_C0);
    const fade = live ? Math.min(1, (1 - u) * 6) : 0;
    for (let f = 0; f < S.front.length; f++) {
      const o = S.front[f];
      o.position.x = fx;
      if (o.isSprite) { o.material.color.setRGB(0.36 * fade, 0.75 * fade, 0.95 * fade); }
      else { o.material.color.setRGB(0.87 * fade, 0.95 * fade, 1.0 * fade); }
    }

    // --- the dissipation graph tracks the operating point -------------------
    const x = mm * mm;
    S.dotD.userData.setData(x, pd);
    S.dotP.userData.setData(x, pOut(mm));

    S.L.supply.setValue(`${(railCurrent(mm)).toFixed(2)} A mean`);
    S.L.dev.setValue(`${Math.abs(i).toFixed(2)} A · ${i >= 0 ? 'upper' : 'lower'}`);
  },

  content() {
    return `
<p>The input carries almost no energy. The monoblock does not enlarge it — it uses it to <b>modulate a current drawn from the power supply</b>. The signal is only the valve setting.</p>

<h3>300 W into 8 Ω</h3>
<div class="eq">V<sub>rms</sub> = √(P·R) = √(300 × 8) = <span class="hl">${V_RMS.toFixed(1)} V</span>
V<sub>pk</sub>  = ${V_RMS.toFixed(1)} × √2       = <span class="hl">${V_PK.toFixed(1)} V</span>
I<sub>pk</sub>  = ${V_PK.toFixed(1)} / 8        = <span class="hl">${I_PK.toFixed(2)} A</span>
<span class="c">±${RAIL} V rails leave ${HEADROOM.toFixed(1)} V for saturation,
driver headroom and I·R<sub>E</sub> = ${(I_PK / NPAIR * RE).toFixed(2)} V</span></div>

<h3>Class AB</h3>
<p>Both banks idle slightly on. Oliver's condition puts one thermal voltage across each emitter resistor:</p>
<div class="eq">V<sub>T</sub>  = kT/q at 300 K       = ${(VT * 1000).toFixed(2)} mV
I<sub>q</sub>  = V<sub>T</sub>/R<sub>E</sub> = ${(VT * 1000).toFixed(2)}/${RE}  = <span class="hl">${(IQ * 1000).toFixed(0)} mA</span> per device
V<sub>bias</sub> = 2V<sub>be</sub> + 2I<sub>q</sub>R<sub>E</sub>      = <span class="hl">${VBIAS.toFixed(3)} V</span>
P<sub>idle</sub> = 2 × ${RAIL} × ${NPAIR} × ${(IQ * 1000).toFixed(0)} mA = <span class="hl">${P_QUIES.toFixed(1)} W</span></div>
<p>At <span class="num">${VBIAS_LOW.toFixed(2)} V</span> of bias the idle current collapses to <span class="num">${(IQ_LOW * 1e3).toFixed(2)} mA</span> and the curve flattens through zero. Unbiased, the deadband is the full <span class="num">±${(VBE_Q * 2).toFixed(2)} V</span> — crossover distortion, worst at low level.</p>
<p>Worst-case heat is not at full power. Ideal class B peaks at m = 2/π — <span class="num">${(M_WORST * M_WORST * 100).toFixed(1)}%</span> of maximum output power:</p>
<div class="eq">P<sub>d</sub> = 2V<sub>cc</sub>²/(π²R) = 2 × ${RAIL}²/(π² × 8) = <span class="hl">${P_D_IDEAL.toFixed(1)} W</span></div>
<p>The idle current moves the modelled peak to <span class="num">${P_D_PEAK.toFixed(0)} W</span> at <span class="num">${(X_PEAK * 100).toFixed(0)}%</span>, against <span class="num">${pOut(M_PEAK).toFixed(0)} W</span> delivered: <span class="num">${(P_D_PEAK / (2 * NPAIR)).toFixed(0)} W</span> per device.</p>

<h3>The meter</h3>
<p>The needle reads power, so the scale is logarithmic: ${MET_DB} dB ending at the rated ${MET_FS} W, so the left stop is <span class="num">${(MET_FS / Math.pow(10, MET_DB / 10)).toFixed(1)} W</span>. Instantaneous power pulses at twice the signal frequency; the needle integrates it.</p>
<div class="eq">p(t) = v·i = v²/R   <span class="c">pulsing at 2f, never negative</span>
P    = V<sub>pk</sub>²/2R      <span class="c">what the needle settles on</span>
θ ∝ (10·log₁₀(P/${MET_FS}) + ${MET_DB}) / ${MET_DB}</div>

<h3>Damping and back-EMF</h3>
<p>The moving coil generates <span class="num">e = Bl·v</span> back into the amplifier. A low output impedance short-circuits it; the resulting current makes a force opposing the motion.</p>
<div class="eq">at ${F_BEMF} Hz, ${(X_BEMF * 1000).toFixed(0)} mm pk: v = ω·x = ${V_CONE.toFixed(2)} m/s
e = Bl·v = ${BL} × ${V_CONE.toFixed(2)} = <span class="hl">${E_BEMF.toFixed(1)} V pk</span>
→ ${I_BEMF.toFixed(2)} A → ${F_BRAKE.toFixed(0)} N braking the cone

DF at the terminals = 8/${Z_OUT}     = <span class="hl">${DF_TERM.toFixed(0)}</span>
2 × ${CAB_LEN} m of 2.5 mm² copper  = ${(R_CABLE * 1000).toFixed(1)} mΩ
DF at the driver = 8/${(Z_OUT + R_CABLE).toFixed(3)}  = <span class="hl">${DF_DRIVE.toFixed(0)}</span></div>
<div class="myth"><span class="lab">Commonly got wrong</span><p>${DF_TERM.toFixed(0)} is not three times better than ${DF_DRIVE.toFixed(0)}. The coil's own <span class="num">${RE_COIL} Ω</span> is in the same loop, so total damping resistance rises only from <span class="num">${(RE_COIL + Z_OUT).toFixed(3)} Ω</span> to <span class="num">${(RE_COIL + Z_OUT + R_CABLE).toFixed(3)} Ω</span> — <span class="num">${(DAMP_PEN * 100).toFixed(1)}%</span>. Cable cross-section matters a little; the last digit of a damping-factor figure does not.</p></div>

<h3>Inside the cable</h3>
<p>At ${I_PK.toFixed(2)} A peak in 2.5 mm² copper the drift velocity is <span class="num">${exp10(V_DRIFT, 2)} m/s</span>, and on a 1 kHz tone the carriers do not travel — they oscillate about a fixed point, peak displacement <span class="num">${(X_DRIFT * 1e9).toFixed(1)} nm</span>. The field carries the energy at <span class="num">${VF} c = ${exp10(V_FIELD, 2)} m/s</span> and crosses the ${CAB_LEN} m run in <span class="num">${(T_CABLE * 1e9).toFixed(1)} ns</span>; in that time a carrier moves <span class="num">${(X_IN_T * 1e12).toFixed(1)} pm</span>, less than one atomic spacing. On screen the drift is exaggerated ${exp10(CAR_EXAG, 0)}× and the front slowed ${exp10(FRONT_RAT, 0)}×.</p>

<div class="key"><span class="lab">The idea</span><p>Current is a loop. Every ampere out of the red terminal returns through the black one to the supply; the two conductors carry equal and opposite currents at every instant. Nothing is used up at the loudspeaker.</p></div>`;
  },

  readouts() {
    const s = this._live || { v: 0, i: 0, p: 0, pd: P_QUIES };
    return [
      { k: 'Out V', v: s.v.toFixed(1), u: 'V', cls: 'acc', bar: Math.abs(s.v) / V_PK },
      { k: 'Out I', v: s.i.toFixed(2), u: 'A', cls: 'am', bar: Math.abs(s.i) / I_PK },
      { k: 'P inst', v: s.p.toFixed(0), u: 'W', cls: 'am', bar: s.p / (V_PK * I_PK) },
      { k: 'Rail', v: `±${RAIL.toFixed(1)}`, u: 'V', cls: '', bar: 1 - Math.abs(s.v) / RAIL },
      { k: 'Device P', v: s.pd.toFixed(0), u: 'W', cls: 'am', bar: s.pd / P_D_PEAK },
      { k: 'Damping', v: `${DF_TERM.toFixed(0)} → ${DF_DRIVE.toFixed(0)}`, u: 'term → driver', cls: '' },
    ];
  },
};
