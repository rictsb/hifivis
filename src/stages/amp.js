import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { radialSprite } from '../core/tex.js';

/**
 * POWER AMPLIFICATION — the left monoblock, shot as the hero.
 *
 * The claim: an amplifier does not make the signal bigger, it uses the signal
 * to modulate a current drawn from a power supply. The supply current is
 * unipolar — it always runs +V → upper device → node → lower device → −V — and
 * only the load current reverses. That asymmetry is the whole picture.
 *
 * Every number on screen is computed here from stated inputs.
 */

// ---------------------------------------------------------------------------
// THE MODEL
// ---------------------------------------------------------------------------

const RL        = 8;                          // Ω, nominal load
const P_RATED   = 300;                        // W, the specification
const V_RMS     = DSP.vrmsFor(P_RATED, RL);   // √(300·8)   = 48.99 V
const V_PK      = V_RMS * Math.SQRT2;         //            = 69.28 V
const I_PK      = V_PK / RL;                  //            =  8.66 A
const RAIL      = 75;                         // V, loaded mean, chosen ≥ V_PK + losses
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
const VBIAS     = 2 * VBE_Q + 2 * IQ * RE;    // 1.2864 V across the spreader
const IQ_TOT    = NPAIR * IQ;                 // 352.5 mA per rail
const P_QUIES   = 2 * RAIL * IQ_TOT;          // 52.9 W burnt doing nothing
const VBIAS_LOW = 0.90;                       // V, the under-biased comparison

const P_MAX     = (RAIL * RAIL) / (2 * RL);   // 351.6 W ideal rail-to-rail
const M_CLIP    = V_PK / RAIL;                // 0.9238 — where the amp actually clips
const X_CLIP    = M_CLIP * M_CLIP;            // 0.853 of P_MAX = the 300 W rating

// --- cable, output impedance, damping ---------------------------------------
const RHO_CU    = 1.724e-8;                   // Ω·m, annealed copper at 20 °C
const CAB_LEN   = 3.0;                        // m, one way
const CAB_AREA  = 2.5e-6;                     // m² (2.5 mm²)
const R_CABLE   = (2 * CAB_LEN * RHO_CU) / CAB_AREA;         // 41.4 mΩ, out and back
const Z_OUT     = 0.02;                       // Ω, amplifier output impedance
const DF_TERM   = DSP.dampingFactor(RL, Z_OUT);              // 400
const DF_DRIVE  = DSP.dampingFactor(RL, Z_OUT + R_CABLE);    // 130
const RE_COIL   = 5.4;                        // Ω, voice-coil dc resistance
const DAMP_PEN  = (RE_COIL + Z_OUT + R_CABLE) / (RE_COIL + Z_OUT) - 1; // 0.76 %

// --- reservoir ---------------------------------------------------------------
const F_RIPPLE  = 100;                        // Hz, full-wave off 50 Hz mains
const C_RES     = 0.015;                      // F per rail
const I_DC_FULL = I_PK / Math.PI;             // 2.76 A mean rail current at full output
const V_RIPPLE  = I_DC_FULL / (F_RIPPLE * C_RES);            // 1.84 V p-p
const E_RES     = 0.5 * C_RES * RAIL * RAIL;  // 42.2 J stored per rail
const P_DC_FULL = 2 * RAIL * I_DC_FULL;       // 413.5 W drawn at full output

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
 * Drive voltage at which the *unbiased* stage first reaches a given fraction of
 * the correctly-biased transfer curve. This is the honest measure of the
 * crossover dead band: the textbook "±V_be" is where conduction begins, but the
 * stage is still delivering almost nothing well past it.
 */
function deadbandAt(frac) {
  let lo = 0, hi = 3;
  for (let k = 0; k < 50; k++) {
    const m = 0.5 * (lo + hi);
    if (stageOut(m, 0) / stageOut(m, VBIAS) < frac) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}
const DB_1PC  = deadbandAt(0.01);              // ±0.456 V
const DB_HALF = deadbandAt(0.50);              // ±1.152 V

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
let M_PEAK = 2 / Math.PI, P_D_PEAK = 0;
for (let k = 1; k <= 600; k++) {
  const m = k / 600, p = pDiss(m);
  if (p > P_D_PEAK) { P_D_PEAK = p; M_PEAK = m; }
}
const X_PEAK = M_PEAK * M_PEAK;                // as a fraction of maximum output power

// meter law: logarithmic, 30 dB of scale ending at the rated power
const MET_DB   = 30;
const MET_FS   = P_RATED;
const MET_SWEEP = 0.87266;                     // ±50° in radians
const meterFrac = (p) => DSP.clamp((10 * Math.log10(Math.max(p, 1e-9) / MET_FS) + MET_DB) / MET_DB, 0, 1);

// ---------------------------------------------------------------------------
// THE SHOT — one monoblock as the hero, instrument plate beside it
// ---------------------------------------------------------------------------
// The clear stage is 960 × 840 at 1600 × 1000 and the Director already shifts
// the principal point to its centre. So: frame the monoblock, then TRUCK the
// whole rig sideways (position and target together, which slides the subject
// across the frame without rotating it) so the amp sits left-of-centre and the
// plate has the right-hand third to itself.
const AZ = 0.46, EL = 0.17, FOV = 30, FILL = 0.52;
const MONO_R = 0.2765;                          // half the amp's overall height
const MONO_C = [LAYOUT.monoL.x, 0.315, LAYOUT.monoL.z];
const TAN_H = Math.tan((FOV * Math.PI) / 360);
const D_CAM = MONO_R / (FILL * 0.84 * TAN_H);   // 2.362 m
const PX_PER_M = 500 / (D_CAM * TAN_H);         // 790 px per metre at the subject
const TRUCK = 225 / PX_PER_M;                   // slide the amp 225 px left of centre

const _base = frameShot(MONO_C, MONO_R, { fill: FILL, az: AZ, el: EL, fov: FOV });
const CAM_R = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));   // screen-right, in world
const SHOT = {
  position: [_base.position[0] + CAM_R.x * TRUCK, _base.position[1], _base.position[2] + CAM_R.z * TRUCK],
  target: [_base.target[0] + CAM_R.x * TRUCK, _base.target[1], _base.target[2] + CAM_R.z * TRUCK],
  fov: FOV,
};

/** World point on the ray through a screen pixel (1600 × 1000, axis at 640,500). */
function rayPoint(px, py, dist) {
  const f = new THREE.Vector3(-Math.sin(AZ) * Math.cos(EL), -Math.sin(EL), -Math.cos(AZ) * Math.cos(EL));
  const u = CAM_R.clone().cross(f);
  const r = f.clone()
    .addScaledVector(CAM_R, ((px - 640) / 800) * TAN_H * 1.6)
    .addScaledVector(u, (-(py - 500) / 500) * TAN_H)
    .normalize();
  return new THREE.Vector3(...SHOT.position).addScaledVector(r, dist);
}

// The plate: 435 px wide, centred at (883, 508), floated 1.65 m from the lens so
// it clears the rack in depth as well as on screen.
const CARD_PX = 435, CARD_CX = 883, CARD_CY = 508, CARD_D = 1.65;
const CARD_S = (CARD_PX * CARD_D) / (PX_PER_M * D_CAM);        // metres per card unit

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
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}
/** A very shallow cylindrical section — a lens, not a flat decal. */
function curvedPlane(w, h, sag, sx = 24, sy = 16) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (2 * p.getY(i)) / h;
    p.setZ(i, sag * (1 - u * u));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
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
      // white bloom. The brushed look survives on the roughness/normal maps.
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

// ---------------------------------------------------------------------------
// The meter dial — silkscreen on a backlit face, drawn once into a canvas
// ---------------------------------------------------------------------------
let _dialTex = null;
function dialTexture(renderer) {
  if (_dialTex) return _dialTex;
  const W = 1536, H = Math.round((W * MET_H) / MET_W);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Backlit face. Real McIntosh meter glass is a deep cyan-leaning cobalt with
  // a modest lamp lift, not a lightbox: the silkscreen has to stay the darkest
  // thing in the window or the ticks disappear into bloom.
  const bg = g.createRadialGradient(W / 2, H * 0.92, 60, W / 2, H * 0.80, W * 0.86);
  bg.addColorStop(0.00, '#4fb6ee');
  bg.addColorStop(0.26, '#2f8ecb');
  bg.addColorStop(0.64, '#17629c');
  bg.addColorStop(1.00, '#0d4272');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const vg = g.createLinearGradient(0, 0, 0, H * 0.5);
  vg.addColorStop(0, 'rgba(4,18,34,0.40)');
  vg.addColorStop(1, 'rgba(4,18,34,0.00)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  const PX = W / MET_W;                    // pixels per metre
  const cx = W / 2, cy = H / 2 + PIVOT_DY * PX;   // needle pivot, in canvas pixels
  const rTick = R_TICK * PX, rNum = R_NUM * PX;
  const ink = 'rgba(3,13,24,1.00)';
  const inkS = 'rgba(3,13,24,0.80)';

  // 1 dB ticks across 30 dB, majors every 5 dB
  for (let d = 0; d <= MET_DB; d++) {
    const a = -MET_SWEEP + (d / MET_DB) * 2 * MET_SWEEP;
    const major = d % 5 === 0;
    const len = major ? 58 : 26;
    g.strokeStyle = major ? ink : inkS;
    g.lineWidth = major ? 12 : 5.2;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * rTick, cy - Math.cos(a) * rTick);
    g.lineTo(cx + Math.sin(a) * (rTick - len), cy - Math.cos(a) * (rTick - len));
    g.stroke();
  }
  g.strokeStyle = 'rgba(3,13,24,0.66)'; g.lineWidth = 3.6;
  g.beginPath(); g.arc(cx, cy, rTick, -Math.PI / 2 - MET_SWEEP, -Math.PI / 2 + MET_SWEEP); g.stroke();

  // numerals: 0.3 1 3 10 30 100 300 W — five decibels apart, so evenly spaced
  const labels = ['0.3', '1', '3', '10', '30', '100', '300'];
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < labels.length; i++) {
    const a = -MET_SWEEP + (i / (labels.length - 1)) * 2 * MET_SWEEP;
    const x = cx + Math.sin(a) * rNum, y = cy - Math.cos(a) * rNum;
    g.save(); g.translate(x, y); g.rotate(a * 0.55);
    g.font = '700 62px ui-sans-serif, -apple-system, Helvetica, Arial';
    g.fillText(labels[i], 0, 0);
    g.restore();
  }

  g.font = '700 38px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(3,13,24,0.94)';
  g.letterSpacing = '11px';
  g.fillText('POWER OUTPUT', cx, H * 0.150);
  g.font = '600 30px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(3,13,24,0.84)';
  g.fillText('WATTS INTO 8 Ω', cx, H * 0.862);
  g.letterSpacing = '0px';
  g.font = '600 27px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(3,13,24,0.72)';
  g.fillText('−30 dB', cx - rTick * 0.90, cy - rTick * 0.28);
  g.fillText('0 dB', cx + rTick * 0.92, cy - rTick * 0.28);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  t.needsUpdate = true;
  _dialTex = t;
  return t;
}

/** Variants tuned for this chassis: bead-blasted rather than mirror-polished. */
function ampMetals() {
  const M = mats();
  const mk = (src, o) => {
    const m = src.clone();
    m.transparent = false; m.opacity = 1; m.depthWrite = true;
    Object.assign(m, o);
    m.userData.ampOwned = true;
    return m;
  };
  return {
    top: mk(M.alu, { roughness: 0.46, envMapIntensity: 0.70, anisotropy: 0 }),
    fascia: mk(M.alu, { roughness: 0.25, envMapIntensity: 1.30, anisotropy: 0 }),
    rib: mk(M.aluV, { roughness: 0.42, envMapIntensity: 0.82, anisotropy: 0 }),
    bezel: mk(M.chrome, { roughness: 0.085, envMapIntensity: 1.15 }),
    // Fin tips are 3 mm of rounded metal seen almost edge-on. They only read if
    // they are glossy enough to carry a specular line off the front strip; the
    // stock heatsink material renders the whole stack as a black void.
    fin: mk(M.anodGrey, { roughness: 0.30, envMapIntensity: 1.55, anisotropy: 0 }),
    finBase: mk(M.anodGrey, { roughness: 0.55, envMapIntensity: 0.85, anisotropy: 0 }),
  };
}

/**
 * Fin stack with a generous tip break. `GEO.heatsink` uses a 0.6 mm bevel on a
 * 2.2 mm fin, which is not enough radius to hold a highlight; 1.2 mm on a 3 mm
 * fin makes each tip a half-round that catches the light.
 */
function finStack(span, h, out, n, A) {
  const g = new THREE.Group();
  const baseT = 0.008, finT = 0.0030;
  const base = new THREE.Mesh(GEO.bevelBox(span, h, baseT, 0.0012, 3), A.finBase);
  base.position.z = -out / 2 + baseT / 2;
  g.add(base);
  const im = new THREE.InstancedMesh(GEO.bevelBox(finT, h, out - baseT, 0.0012, 3), A.fin, n);
  const m = new THREE.Matrix4();
  const pitch = span / n;
  for (let i = 0; i < n; i++) {
    m.makeTranslation(-span / 2 + pitch * (i + 0.5), 0, baseT / 2);
    im.setMatrixAt(i, m);
  }
  g.add(im);
  GEO.shadowed(g);
  return g;
}

function buildMono(renderer) {
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
  // fins run out along local +Z; rotate so they protrude sideways and the base
  // plate lands flush on the chassis cheek.
  for (const sx of [-1, 1]) {
    const hs = finStack(0.350, 0.330, 0.064, 30, A);
    hs.rotation.y = (sx * Math.PI) / 2;
    hs.position.set(sx * (W_BODY / 2 + 0.032), Y_MID, 0);
    g.add(hs);
    for (const sy of [-1, 1]) {
      const cap = new THREE.Mesh(GEO.bevelBox(0.068, 0.010, 0.354, 0.0018, 3), M.anodBlack);
      cap.position.set(sx * (W_BODY / 2 + 0.032), Y_MID + sy * 0.170, 0);
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

  for (const sx of [-1, 1]) {
    const rib = new THREE.Mesh(GEO.bevelBox(0.013, 0.392, 0.006, 0.0016, 3), A.rib);
    rib.position.set(sx * 0.107, Y_MID, Z_FACE + 0.0185);
    g.add(rib);
  }
  const chanY = Y_MID - 0.112;
  const chan = new THREE.Mesh(GEO.bevelBox(0.198, 0.058, 0.004, 0.0016, 3), M.anodBlack);
  chan.position.set(0, chanY, Z_FACE + 0.0166);
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
    new THREE.MeshBasicMaterial({ map: dialTexture(renderer), toneMapped: false }));
  dial.position.set(0, Y_MET, Z_DIAL);
  g.add(dial);

  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.030, 0.0016),
    new THREE.MeshBasicMaterial({ color: 0xdff0ff, toneMapped: false }));
  lamp.position.set(0, Y_MET - MET_H / 2 + 0.0026, Z_DIAL + 0.0006);
  g.add(lamp);

  // needle: pivots below the scale, dark against the lit face
  const pivot = new THREE.Group();
  pivot.name = 'needle';
  pivot.position.set(0, PIVOT_Y, Z_DIAL + 0.0082);
  const needleMat = new THREE.MeshBasicMaterial({ color: 0x06121e });
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

  const bShape = roundRect(MET_W + 0.020, MET_H + 0.020, 0.008);
  bShape.holes.push(roundRect(MET_W - 0.006, MET_H - 0.006, 0.005, 0, 0, THREE.Path));
  const bez = extrudePanel(bShape, 0.009, MET_W + 0.020, MET_H + 0.020, A.bezel, 0.0010);
  bez.position.set(0, Y_MET, Z_FACE + 0.0125);
  g.add(bez);

  // Glass, in two layers. On a MeshPhysicalMaterial `opacity` scales the whole
  // shaded result, specular included, so a single 22 %-opaque pane multiplies
  // its own reflection down to nothing and the meter reads as a printed decal.
  // Layer 1 is the smoke tint; layer 2 adds an env-only specular on top of the
  // glow rather than multiplying it down, and is a shallow cylindrical section
  // so the front strip lands as a sweeping highlight instead of missing.
  const smoked = M.glass.clone();
  smoked.userData.ampOwned = true;
  smoked.transparent = true;
  smoked.opacity = 0.20;
  smoked.depthWrite = false;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.004, MET_H - 0.004), smoked);
  glass.position.set(0, Y_MET, Z_FACE + 0.0178);
  glass.renderOrder = 2;
  g.add(glass);

  const specMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: 0.02, envMapIntensity: 2.6,
    transparent: true, opacity: 1, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  specMat.userData.ampOwned = true;
  const spec = new THREE.Mesh(curvedPlane(MET_W - 0.007, MET_H - 0.007, 0.0004), specMat);
  spec.position.set(0, Y_MET, Z_FACE + 0.0190);
  spec.renderOrder = 3;
  g.add(spec);

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
  spec.castShadow = spec.receiveShadow = false;

  // The amp stands on a 0.40 × 0.50 m plate, so the contact shadow must be that
  // size — a wider blob hangs in mid air and darkens the floor behind.
  const sh = GEO.contactShadow(0.40, 0.50, 0.62, 0.0);
  sh.position.y = 0.0013;
  g.add(sh);
  return g;
}

// ---------------------------------------------------------------------------
// OVERLAY — one instrument plate, two zones
//
// Zone 1: the output stage as a closed loop. Zone 2: what is actually moving
// inside the speaker cable. Everything else this stage has to say — the
// transfer curve, the dissipation peak, damping — is prose, because the plate
// is beside the hardware, not instead of it.
// ---------------------------------------------------------------------------

// zone 1 (card-local units; the plate is 1.00 × 0.99 units)
const Y_RP = 0.855, Y_UP = 0.755, Y_OUT = 0.635, Y_LO = 0.515, Y_RN = 0.415, Y_RET = 0.345;
const X_SUP = 0.080, X_RETC = 0.030;
const X_DRV = 0.275;
const DEV_X = [0.345, 0.455, 0.565];
const X_OUT0 = 0.315, X_AMP_T = 0.680, X_SPK_T = 0.800, X_LOAD = 0.900;
const DEV_HW = 0.026, DEV_HH = 0.028;
// zone 2
const Y_RULE = 0.235, Y_HOT = 0.150, Y_RTN = 0.055;
const X_C0 = 0.075, X_C1 = 0.905;

function seg(parent, pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => [pts[i][0], pts[i][1], opts.z || 0]);
  parent.add(t);
  return t;
}
/**
 * `diagramCard` installs a `userData.setOpacity` hook, but `fadeTree` still
 * descends into the group afterwards and the plate mesh caches the
 * already-scaled (therefore ~0) opacity as its base — so the plate never comes
 * back. Removing the hook lets fadeTree cache the pristine value.
 */
function unhookCard(card) { delete card.userData.setOpacity; return card; }

function anchor(parent, x, y) {
  const o = new THREE.Object3D();
  o.position.set(x, y, 0.006);
  parent.add(o);
  return o;
}

function buildOverlay() {
  const root = new THREE.Group();
  const P = new THREE.Group();

  // plate centre on the ray through (CARD_CX, CARD_CY), then back off to the
  // group origin, which sits at local (0.48, 0.475)
  const c = rayPoint(CARD_CX, CARD_CY, CARD_D);
  P.position.copy(c)
    .addScaledVector(CAM_R, -CARD_S * 0.48)
    .add(new THREE.Vector3(0, -CARD_S * 0.475, 0));
  P.rotation.y = AZ;                     // face the lens
  P.scale.setScalar(CARD_S);
  root.add(P);

  const card = unhookCard(DIAG.diagramCard(0.96, 0.95, { opacity: 0.92 }));
  P.add(card);

  const dimWire = 0x7b848f;
  const dash = { dashed: true, dashSize: 0.010, gapSize: 0.008, opacity: 0.42 };
  seg(P, [[-0.01, Y_RULE], [0.97, Y_RULE]], 0x39414c, 1.0, { opacity: 0.7 });

  // ---- supply: two reservoirs in series, 0 V at their junction -------------
  const railPT = seg(P, [[X_SUP, Y_RP], [0.660, Y_RP]], PAL.am, 2.8);
  const railNT = seg(P, [[X_SUP, Y_RN], [0.660, Y_RN]], PAL.am, 2.8);
  const capPlate = (y) => {
    seg(P, [[X_SUP - 0.032, y + 0.010], [X_SUP + 0.032, y + 0.010]], PAL.am, 2.6, { opacity: 0.95, z: 0.004 });
    seg(P, [[X_SUP - 0.032, y - 0.010], [X_SUP + 0.032, y - 0.010]], PAL.am, 2.6, { opacity: 0.95, z: 0.004 });
  };
  seg(P, [[X_SUP, Y_RP], [X_SUP, 0.760]], PAL.am, 2.0);
  capPlate(0.750);
  seg(P, [[X_SUP, 0.740], [X_SUP, Y_OUT]], PAL.am, 2.0);
  seg(P, [[X_SUP, Y_OUT], [X_SUP, 0.530]], PAL.am, 2.0);
  capPlate(0.520);
  seg(P, [[X_SUP, 0.510], [X_SUP, Y_RN]], PAL.am, 2.0);
  const node0 = new THREE.Mesh(new THREE.CircleGeometry(0.0075, 16),
    new THREE.MeshBasicMaterial({ color: PAL.ink, toneMapped: false, transparent: true }));
  node0.position.set(X_SUP, Y_OUT, 0.010);
  node0.renderOrder = 13;
  P.add(node0);

  // ---- the return: out of the 0 V node, round the outside, back to the load
  const retRun = seg(P, [[X_SUP, Y_OUT], [X_RETC, Y_OUT], [X_RETC, Y_RET], [X_LOAD, Y_RET]],
    PAL.ink, 3.0, { opacity: 0.92 });

  // ---- driver / bias spreader ---------------------------------------------
  const blockMat = new THREE.MeshBasicMaterial({ color: 0x1b222b, toneMapped: false, transparent: true });
  const spread = new THREE.Mesh(GEO.bevelBox(0.048, 0.185, 0.006, 0.0018, 2), blockMat);
  spread.position.set(X_DRV, Y_OUT, 0.005);
  P.add(spread);
  seg(P, [[X_DRV - 0.024, Y_OUT - 0.092], [X_DRV + 0.024, Y_OUT - 0.092],
    [X_DRV + 0.024, Y_OUT + 0.092], [X_DRV - 0.024, Y_OUT + 0.092],
    [X_DRV - 0.024, Y_OUT - 0.092]], 0x707a86, 1.1, { opacity: 0.75, z: 0.010 });
  seg(P, [[0.160, Y_OUT], [X_DRV - 0.024, Y_OUT]], PAL.cy, 2.0);
  const inArrow = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.020, 12),
    new THREE.MeshBasicMaterial({ color: PAL.cy, toneMapped: false, transparent: true }));
  inArrow.position.set(0.180, Y_OUT, 0.009);
  inArrow.rotation.z = -Math.PI / 2;
  P.add(inArrow);
  seg(P, [[X_DRV, Y_OUT + 0.092], [X_DRV, Y_UP], [DEV_X[2], Y_UP]], PAL.cy, 1.8, { opacity: 0.85 });
  seg(P, [[X_DRV, Y_OUT - 0.092], [X_DRV, Y_LO], [DEV_X[2], Y_LO]], PAL.cy, 1.8, { opacity: 0.85 });

  // ---- output devices ------------------------------------------------------
  const devGeo = GEO.bevelBox(DEV_HW * 2, DEV_HH * 2, 0.010, 0.0026, 3);
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
      seg(P, [[x - DEV_HW, yc - DEV_HH], [x + DEV_HW, yc - DEV_HH], [x + DEV_HW, yc + DEV_HH],
        [x - DEV_HW, yc + DEV_HH], [x - DEV_HW, yc - DEV_HH]], 0x707a86, 1.1, { opacity: 0.8, z: 0.014 });
      // collector to its rail, emitter through R_E to the output node
      seg(P, [[x, yc + sgn * DEV_HH], [x, sgn > 0 ? Y_RP : Y_RN]], PAL.am, 2.0);
      seg(P, [[x, yc - sgn * DEV_HH], [x, yc - sgn * 0.039]], PAL.am, 1.8);
      seg(P, [[x, yc - sgn * 0.065], [x, Y_OUT]], PAL.am, 1.8);
      const r = new THREE.Mesh(GEO.bevelBox(0.017, 0.026, 0.006, 0.0014, 2), blockMat);
      r.position.set(x, yc - sgn * 0.052, 0.005);
      P.add(r);
      seg(P, [[x - 0.0085, yc - sgn * 0.039], [x + 0.0085, yc - sgn * 0.039],
        [x + 0.0085, yc - sgn * 0.065], [x - 0.0085, yc - sgn * 0.065],
        [x - 0.0085, yc - sgn * 0.039]], PAL.am, 1.0, { opacity: 0.6, z: 0.008 });
    }
  }

  // ---- output node, terminals, load ---------------------------------------
  const hotRun = seg(P, [[X_OUT0, Y_OUT], [X_LOAD, Y_OUT]], PAL.cy, 3.2);
  const ring = (x, y, col) => {
    const t = new THREE.Mesh(new THREE.RingGeometry(0.0060, 0.0100, 22),
      new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, side: THREE.DoubleSide }));
    t.position.set(x, y, 0.011);
    t.renderOrder = 13;
    P.add(t);
  };
  for (const x of [X_AMP_T, X_SPK_T]) { ring(x, Y_OUT, PAL.rd); ring(x, Y_RET, 0xa8b0ba); }

  const NW = 6, coilPts = [];
  for (let i = 0; i <= NW * 14; i++) {
    const u = i / (NW * 14);
    coilPts.push([X_LOAD - 0.018 + Math.cos(u * NW * DSP.TAU) * 0.018, 0.612 - u * 0.234]);
  }
  seg(P, [[X_LOAD, Y_OUT], [X_LOAD, 0.612]], PAL.cy, 2.4);
  seg(P, coilPts, PAL.cy, 2.2, { opacity: 0.95 });
  seg(P, [[X_LOAD, 0.378], [X_LOAD, Y_RET]], PAL.ink, 2.4, { opacity: 0.9 });

  // magnification callout: the strip below IS the cable between those terminals
  seg(P, [[X_AMP_T, Y_RET - 0.014], [X_C0, Y_HOT + 0.030]], dimWire, 1.0, dash);
  seg(P, [[X_SPK_T, Y_RET - 0.014], [X_C1, Y_HOT + 0.030]], dimWire, 1.0, dash);

  // ---- direction arrows ----------------------------------------------------
  // The rail currents never reverse: charge always runs +V → upper device →
  // node → lower device → −V. Only the load loop changes sign. Two fixed
  // arrows, two that flip.
  const arrowMat = new THREE.MeshBasicMaterial({ color: PAL.am, toneMapped: false, transparent: true });
  const mkArrow = (x, y, rot) => {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.0090, 0.022, 12), arrowMat);
    a.position.set(x, y, 0.010);
    a.rotation.z = rot;
    P.add(a);
    return a;
  };
  mkArrow(0.190, Y_RP, -Math.PI / 2);          // +V rail: always toward the devices
  mkArrow(0.190, Y_RN, Math.PI / 2);           // −V rail: always back to the supply
  const arrowOut = mkArrow(0.600, Y_OUT, -Math.PI / 2);
  const arrowRet = mkArrow(0.600, Y_RET, Math.PI / 2);

  // ---- zone 2: inside the cable -------------------------------------------
  for (const y of [Y_HOT, Y_RTN]) seg(P, [[X_C0, y], [X_C1, y]], 0x5b6774, 7.0, { opacity: 0.95 });
  P.add(DIAG.dimension([X_C0, 0.014, 0.002], [X_C1, 0.014, 0.002], { color: dimWire, head: 0.012 }));

  const front = [];
  for (const y of [Y_HOT, Y_RTN]) {
    const s = DIAG.glow(PAL.cy, 0.072, 0.9, radialSprite(128));
    s.position.set(X_C0, y, 0.013);
    P.add(s);
    front.push(s);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.0050, 0.026),
      new THREE.MeshBasicMaterial({ color: 0xdff2ff, toneMapped: false, transparent: true }));
    b.position.set(X_C0, y, 0.014);
    P.add(b);
    front.push(b);
  }

  const NC = 22;
  const carriers = new DIAG.Swarm(NC * 2, { color: PAL.am, size: 0.0050, additive: false });
  P.add(carriers);
  const marks = [];
  for (let i = 0; i < NC; i++) marks.push(X_C0 + 0.030 + (i / (NC - 1)) * (X_C1 - X_C0 - 0.060));
  const tickPts = [];
  for (const x of marks) tickPts.push([x, Y_HOT - 0.017], [x, Y_HOT - 0.010], [x, Y_HOT - 0.017]);
  seg(P, tickPts, dimWire, 0.9, { opacity: 0.38 });

  return { root, P, banks, front, carriers, marks, hotRun, retRun, railPT, railNT, arrowOut, arrowRet };
}

// ---------------------------------------------------------------------------
// animation constants (all derived from the geometry above)
// ---------------------------------------------------------------------------
const CAR_SCALE = (X_C1 - X_C0 - 0.060) / CAB_LEN;   // card units per real metre
const CAR_AMP   = 0.0105;                            // visible amplitude, card units
const CAR_EXAG  = CAR_AMP / (X_DRIFT * CAR_SCALE);   // ≈ 9 × 10⁵
const FRONT_RUN = 1.0;                               // real seconds per traverse
const FRONT_GAP = 0.45;
const FRONT_RAT = FRONT_RUN / T_CABLE;               // ≈ 6.6 × 10⁷ slow-down

const _cA = new THREE.Color();
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
  shot: SHOT,
  timeScale: TS,
  alwaysUpdate: true,

  build(ctx) {
    const hardware = new THREE.Group();
    const a = buildMono(ctx.renderer);
    a.position.set(LAYOUT.monoL.x, LAYOUT.monoL.y, LAYOUT.monoL.z);
    a.rotation.y = LAYOUT.monoL.ry;
    const b = a.clone(true);
    b.position.set(LAYOUT.monoR.x, LAYOUT.monoR.y, LAYOUT.monoR.z);
    b.rotation.y = LAYOUT.monoR.ry;
    hardware.add(a, b);

    const needles = [a.getObjectByName('needle'), b.getObjectByName('needle')];
    // clear of the chassis, above its front-left corner, so the label sits on
    // empty backdrop and never prints on the fascia or reaches the chapter rail
    const metAnchor = new THREE.Object3D();
    metAnchor.position.set(-0.135, 0.470, 0.210);
    a.add(metAnchor);

    const S = buildOverlay();
    S.needles = needles;
    S.deflect = [0.5, 0.5];
    this._s = S;
    this._live = { v: 0, i: 0, p: 0, pd: P_QUIES, mean: 0, dc: P_QUIES };

    const L = ctx.labels;
    const P = S.P;
    S.L = {
      meter: L.add(metAnchor, {
        kicker: 'Meter', cls: 'acc', priority: 4, offset: [72, -34],
        text: `log · ${MET_DB} dB to ${MET_FS} W`, value: '—',
      }),
      supply: L.add(anchor(P, X_SUP, Y_RP), {
        kicker: 'Supply', cls: 'am', priority: 3, occlude: false, offset: [10, -62],
        text: `±${RAIL} V mean · ${(C_RES * 1000).toFixed(0)} mF · ${E_RES.toFixed(0)} J<br>`
          + `${V_RIPPLE.toFixed(2)} V p-p ripple at full output`,
        value: '—',
      }),
      dev: L.add(anchor(P, DEV_X[1], Y_RP), {
        kicker: 'Output devices', cls: 'am', priority: 3, occlude: false, offset: [40, -62],
        text: `${NPAIR} NPN · ${NPAIR} PNP · I<sub>q</sub> ${(IQ * 1000).toFixed(0)} mA each`,
        value: '—',
      }),
      ret: L.add(anchor(P, 0.42, Y_RET), {
        kicker: 'Return path', cls: '', priority: 1, occlude: false, offset: [0, 26],
        value: `DF ${DF_TERM.toFixed(0)} → ${DF_DRIVE.toFixed(0)}`,
      }),
      cable: L.add(anchor(P, 0.49, Y_HOT), {
        kicker: 'Inside the cable', cls: 'am', priority: 2, occlude: false, offset: [0, 92],
        text: `field ${exp10(V_FIELD, 2)} m/s · carriers ${exp10(V_DRIFT, 2)} m/s`,
        value: `ratio ${exp10(SPEED_RAT)}`,
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
    this._live = { v, i, p, pd, mean, dc: pDc(mm) };

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
    // Both banks always carry at least I_q; the split follows i_N·i_P ≈ I_q².
    const iUp = 0.5 * (i + Math.sqrt(i * i + 4 * IQ_TOT * IQ_TOT));
    const iDn = iUp - i;
    for (let b = 0; b < 2; b++) {
      const lvl = Math.sqrt(DSP.clamp((b === 0 ? iUp : iDn) / I_PK, 0, 1));
      _cA.copy(COLD).lerp(HOT, 0.12 + 0.88 * lvl);
      for (let d = 0; d < NPAIR; d++) S.banks[b].setColorAt(d, _cA);
      S.banks[b].instanceColor.needsUpdate = true;
    }
    const duty = Math.abs(i) / I_PK;
    S.railPT._baseOpacity = 0.34 + 0.66 * Math.sqrt(DSP.clamp(iUp / I_PK, 0, 1));
    S.railNT._baseOpacity = 0.34 + 0.66 * Math.sqrt(DSP.clamp(iDn / I_PK, 0, 1));
    S.hotRun._baseOpacity = 0.48 + 0.52 * duty;
    S.retRun._baseOpacity = 0.48 + 0.52 * duty;

    // only the load loop reverses; the rails do not
    S.arrowOut.rotation.z = i >= 0 ? -Math.PI / 2 : Math.PI / 2;
    S.arrowRet.rotation.z = i >= 0 ? Math.PI / 2 : -Math.PI / 2;

    // --- inside the cable ---------------------------------------------------
    // carriers: displacement is the integral of current, so it goes as −cos,
    // and the two conductors move in antiphase — that is the return path.
    const disp = -Math.cos(ph) * CAR_AMP * env;
    const N = S.marks.length;
    S.carriers.update((n) => {
      const lane = n < N ? 0 : 1;
      const x = S.marks[n % N] + (lane === 0 ? disp : -disp);
      return { p: [x, lane === 0 ? Y_HOT : Y_RTN, 0.009], s: 1, c: PAL.am };
    });
    // field front: its own clock, and the label says so
    const u = (tp % (FRONT_RUN + FRONT_GAP)) / FRONT_RUN;
    const fx = X_C0 + DSP.clamp(u, 0, 1) * (X_C1 - X_C0);
    const fade = u <= 1 ? Math.min(1, (1 - u) * 6) : 0;
    for (const o of S.front) {
      o.position.x = fx;
      if (o.isSprite) o.material.color.setRGB(0.36 * fade, 0.75 * fade, 0.95 * fade);
      else o.material.color.setRGB(0.87 * fade, 0.95 * fade, 1.0 * fade);
    }

    S.L.supply.setValue(`${railCurrent(mm).toFixed(2)} A per rail`);
    S.L.dev.setValue(`${Math.abs(i).toFixed(2)} A · ${i >= 0 ? 'upper' : 'lower'} bank`);
  },

  content() {
    return `
<div class="key"><span class="lab">The idea</span><p>The input carries almost no energy. The monoblock uses it to <b>modulate a current drawn from the supply</b>, and that current is a loop: every ampere out of the red terminal returns through the black one. Nothing is consumed at the loudspeaker.</p></div>

<h3>300 W into 8 Ω</h3>
<div class="eq">V<sub>rms</sub> = √(P·R) = √(300 × 8) = <span class="hl">${V_RMS.toFixed(1)} V</span>
V<sub>pk</sub>  = ${V_RMS.toFixed(1)} × √2      = <span class="hl">${V_PK.toFixed(1)} V</span>
I<sub>pk</sub>  = ${V_PK.toFixed(1)} / 8       = <span class="hl">${I_PK.toFixed(2)} A</span>
I<sub>rail</sub> = I<sub>pk</sub>/π = ${I_DC_FULL.toFixed(2)} A mean per rail
V<sub>ripple</sub> = I/(f·C) = ${I_DC_FULL.toFixed(2)}/(100 × 0.015)
       = <span class="hl">${V_RIPPLE.toFixed(2)} V p-p</span></div>
<p>The <span class="num">±${RAIL} V</span> is the loaded mean, not a no-load peak. It leaves <span class="num">${HEADROOM.toFixed(1)} V</span>, of which <span class="num">${(V_RIPPLE / 2).toFixed(2)} V</span> is the ripple trough: <span class="num">${(HEADROOM - V_RIPPLE / 2).toFixed(1)} V</span> for V<sub>ce(sat)</sub>, driver V<sub>be</sub> and I·R<sub>E</sub> = <span class="num">${((I_PK / NPAIR) * RE).toFixed(2)} V</span>. Transformer regulation would take more still.</p>

<h3>Class AB</h3>
<p>Both banks idle slightly on. Oliver's condition puts one thermal voltage across each emitter resistor:</p>
<div class="eq">V<sub>T</sub>  = kT/q at 300 K       = ${(VT * 1000).toFixed(2)} mV
I<sub>q</sub>  = V<sub>T</sub>/R<sub>E</sub> = ${(VT * 1000).toFixed(2)}/${RE} = <span class="hl">${(IQ * 1000).toFixed(0)} mA</span>
V<sub>bias</sub> = 2V<sub>be</sub> + 2I<sub>q</sub>R<sub>E</sub>     = <span class="hl">${VBIAS.toFixed(3)} V</span>
P<sub>idle</sub> = 2 × ${RAIL} × ${NPAIR} × ${(IQ * 1000).toFixed(0)} mA = <span class="hl">${P_QUIES.toFixed(1)} W</span></div>
<p>Solved without bias, the same stage gives under 1 % of that curve out to <span class="num">±${DB_1PC.toFixed(2)} V</span> of drive and half of it only at <span class="num">±${DB_HALF.toFixed(2)} V</span>; conduction begins at <span class="num">±V<sub>be</sub> = ±${VBE_Q.toFixed(2)} V</span>, a dead band <span class="num">${(2 * VBE_Q).toFixed(2)} V</span> wide. Crossover distortion is therefore worst at low level, where that volt is most of the signal. At <span class="num">${VBIAS_LOW.toFixed(2)} V</span> of bias, I<sub>q</sub> collapses to <span class="num">${(IQ_LOW * 1e3).toFixed(2)} mA</span> and it is nearly as bad.</p>

<h3>Heat</h3>
<p>Worst-case dissipation is not at full power. With idle current included the peak is <span class="num">${P_D_PEAK.toFixed(0)} W</span> total, <span class="num">${(P_D_PEAK / (2 * NPAIR)).toFixed(0)} W</span> per device, at <span class="num">${(X_PEAK * 100).toFixed(1)} %</span> of maximum output, where only <span class="num">${pOut(M_PEAK).toFixed(0)} W</span> is delivered. Clipping arrives at <span class="num">${(X_CLIP * 100).toFixed(0)} %</span> of the ideal rail-to-rail <span class="num">${P_MAX.toFixed(1)} W</span> — which is the ${P_RATED} W rating.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>That is the resistive worst case. A loudspeaker is reactive; at 4 Ω and 60° of phase angle the same output level roughly doubles the V<sub>ce</sub>·I<sub>c</sub> product in the conducting device. That is what the safe-operating-area limiter is for.</p></div>

<h3>Damping</h3>
<p>DF = <span class="num">8/${Z_OUT}</span> = <span class="num">${DF_TERM.toFixed(0)}</span> at the terminals; <span class="num">2 × ${CAB_LEN} m</span> of 2.5 mm² copper adds <span class="num">${(R_CABLE * 1000).toFixed(1)} mΩ</span>, giving <span class="num">${DF_DRIVE.toFixed(0)}</span> at the driver. That is not three times worse: the coil's own <span class="num">${RE_COIL} Ω</span> is in the same loop, so the total damping resistance rises from <span class="num">${(RE_COIL + Z_OUT).toFixed(2)} Ω</span> to <span class="num">${(RE_COIL + Z_OUT + R_CABLE).toFixed(2)} Ω</span> — <span class="num">${(DAMP_PEN * 100).toFixed(1)} %</span>.</p>

<h3>Inside the cable</h3>
<p>At <span class="num">${I_PK.toFixed(2)} A</span> peak in 2.5 mm² copper the carriers drift at <span class="num">${exp10(V_DRIFT, 2)} m/s</span> — and on a 1 kHz tone they do not travel at all, they oscillate <span class="num">±${(X_DRIFT * 1e9).toFixed(1)} nm</span> about a fixed point. The field crosses the ${CAB_LEN} m run at <span class="num">${VF} c</span> in <span class="num">${(T_CABLE * 1e9).toFixed(1)} ns</span>, in which time a carrier moves <span class="num">${(X_IN_T * 1e12).toFixed(1)} pm</span>. On the plate the drift is exaggerated <span class="num">${exp10(CAR_EXAG, 0)}×</span> and the front slowed <span class="num">${exp10(FRONT_RAT, 0)}×</span>.</p>`;
  },

  readouts() {
    const s = this._live || { v: 0, i: 0, p: 0, pd: P_QUIES, mean: 0, dc: P_QUIES };
    return [
      { k: 'Out V', v: s.v.toFixed(1), u: 'V', cls: 'acc', bar: Math.abs(s.v) / V_PK },
      { k: 'Out I', v: s.i.toFixed(2), u: 'A', cls: 'am', bar: Math.abs(s.i) / I_PK },
      { k: 'P inst', v: s.p.toFixed(0), u: 'W', cls: 'am', bar: s.p / (V_PK * I_PK) },
      { k: 'P mean', v: s.mean < 10 ? s.mean.toFixed(2) : s.mean.toFixed(0), u: 'W', cls: 'acc', bar: meterFrac(s.mean) },
      { k: 'Device heat', v: s.pd.toFixed(0), u: 'W', cls: 'am', bar: s.pd / P_D_PEAK },
      { k: 'Supply draw', v: s.dc.toFixed(0), u: 'W', cls: '', bar: s.dc / P_DC_FULL },
    ];
  },
};
