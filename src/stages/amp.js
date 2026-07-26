import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { radialSprite } from '../core/tex.js';
import { AMP, SPEAKER, CABLE, DAMPING, DRIVER, MAINS } from '../core/spec.js';

/**
 * POWER AMPLIFICATION — the left monoblock, shot as the hero.
 *
 * The claim: an amplifier does not make the signal bigger, it uses the signal
 * to modulate a current drawn from a power supply, and that current is a closed
 * loop — out of the red terminal, through the coil, back through the black one.
 *
 * Every primary comes from `core/spec.js`; everything else on screen is derived
 * here from those primaries and shown with its arithmetic in content().
 */

// ---------------------------------------------------------------------------
// PRIMARIES — imported, never re-declared
// ---------------------------------------------------------------------------
const RL        = SPEAKER.nominalZ;           // 8 Ω nominal load
const P_RATED   = AMP.pOut8;                  // 300 W into 8 Ω
const V_RMS     = AMP.vRms;                   // 48.990 V
const V_PK      = AMP.vPk;                    // 69.282 V
const I_PK      = AMP.iPk;                    // 8.6603 A
const RAIL      = AMP.rail;                   // ±75 V loaded mean
const HEADROOM  = RAIL - V_PK;                // 5.72 V
const Z_OUT     = AMP.zOut;                   // 0.02 Ω
const CAB_LEN   = CABLE.len;                  // 3.0 m one way
const CAB_AREA  = CABLE.areaMm2;              // 2.5 mm²
const R_CABLE   = CABLE.rLoop;                // 41.376 mΩ, out AND back
const DF_TERM   = DAMPING.atTerminals;        // 400.00
const DF_DRIVE  = DAMPING.atDriver;           // 130.34
const RE_COIL   = DRIVER.Re;                  // 6.2 Ω voice-coil dc resistance
/** Total resistance in the damping loop, at the terminals and at the driver. */
const RD_AMP    = RE_COIL + Z_OUT;                        // 6.220 Ω
const RD_DRV    = RE_COIL + Z_OUT + R_CABLE;              // 6.261 Ω
const DAMP_PEN  = RD_DRV / RD_AMP - 1;                    // 0.665 %
const F_RIPPLE  = 2 * MAINS.f;                // 100 Hz, full-wave off 50 Hz
/** `CABLE` carries no velocity factor. The speaker flex is the same PVC-
 *  insulated construction as the mains lead, so take MAINS.vf. */
const VF        = MAINS.vf;                   // 0.66
const V_FIELD   = DSP.signalSpeed(VF);        // 1.9786e8 m/s

// ---------------------------------------------------------------------------
// DERIVED MODEL
// ---------------------------------------------------------------------------
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

const P_MAX     = (RAIL * RAIL) / (2 * RL);   // 351.6 W ideal rail-to-rail
const M_CLIP    = V_PK / RAIL;                // 0.9238 — where the amp clips
const X_CLIP    = M_CLIP * M_CLIP;            // 0.853 of P_MAX = the 300 W rating

// --- reservoir ---------------------------------------------------------------
const C_RES     = 0.015;                      // F per rail
const I_DC_FULL = I_PK / Math.PI;             // 2.76 A mean rail current
const V_RIPPLE  = I_DC_FULL / (F_RIPPLE * C_RES);            // 1.84 V p-p
const P_DC_FULL = 2 * RAIL * I_DC_FULL;       // 413.5 W drawn at full output

// --- what is actually moving in the wire ------------------------------------
const F_SIG     = 1000;                       // Hz test tone
const V_DRIFT   = DSP.driftVelocity(I_PK, CAB_AREA);         // 2.55e-4 m/s peak
const X_DRIFT   = DSP.driftDisplacement(V_DRIFT, F_SIG);     // 40.5 nm peak
const T_CABLE   = CAB_LEN / V_FIELD;                         // 15.2 ns
const X_IN_T    = V_DRIFT * T_CABLE;                         // 3.9 pm
const SPEED_RAT = V_FIELD / V_DRIFT;                         // 7.8e11

const TS        = 0.002;                      // timeScale: 1 kHz → 2 Hz on screen
const F_SCREEN  = F_SIG * TS;                 // 2 Hz as drawn

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

/**
 * Drive voltage at which the *unbiased* stage first reaches a given fraction of
 * the correctly-biased transfer curve. The textbook "±V_be" is where conduction
 * begins; the stage is still delivering almost nothing well past it.
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
const X_PEAK = M_PEAK * M_PEAK;                // as a fraction of maximum power
const P_AT_PEAK = pOut(M_PEAK);                // delivered while burning P_D_PEAK

// meter law: logarithmic, 30 dB of scale ending at the rated power
const MET_DB   = 30;
const MET_FS   = P_RATED;
const MET_SWEEP = 0.87266;                     // ±50° in radians
const meterFrac = (p) => DSP.clamp((10 * Math.log10(Math.max(p, 1e-9) / MET_FS) + MET_DB) / MET_DB, 0, 1);

// ---------------------------------------------------------------------------
// THE SHOT — one monoblock as the hero, instrument plate beside it
// ---------------------------------------------------------------------------
// The clear stage is 960 × 840 at 1600 × 1000 and the Director already shifts
// the principal point to its centre. Frame the monoblock, then TRUCK the whole
// rig sideways (position and target together, which slides the subject across
// the frame without rotating it).
//
// The amp sits RIGHT of centre and the plate LEFT. That is deliberate: from
// this azimuth the equipment rack lies camera-right of the monoblock, so a
// plate on the right would be laid over the rack's silhouette and the rack's
// own lit displays — which render after a diagram card — would print through
// it. Trucking the other way pushes the rack past x = 1450 px, off the safe
// box entirely, and leaves the plate against bare floor and backdrop.
const AZ = 0.46, EL = 0.155, FOV = 30, FILL = 0.55;
const MONO_R = 0.2765;                          // half the amp's overall height
const MONO_C = [LAYOUT.monoL.x, 0.315, LAYOUT.monoL.z];
const TAN_H = Math.tan((FOV * Math.PI) / 360);
const D_CAM = MONO_R / (FILL * 0.84 * TAN_H);   // 2.234 m
const PX_PER_M = 500 / (D_CAM * TAN_H);         // 835 px per metre at the subject
const TRUCK_PX = -132;                          // −ve slides the subject RIGHT
const TRUCK = TRUCK_PX / PX_PER_M;

const _base = frameShot(MONO_C, MONO_R, { fill: FILL, az: AZ, el: EL, fov: FOV });
const CAM_R = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));   // screen-right
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

// The plate: 415 px wide, centred at (388, 505), floated 1.50 m from the lens.
// x 180…595 at 1600 × 1000, so it clears the chapter rail on the left and the
// monoblock's own silhouette on the right with 45 px to spare.
const CARD_PX = 415, CARD_CX = 388, CARD_CY = 505, CARD_D = 1.50;
const CARD_S = (CARD_PX * CARD_D) / (PX_PER_M * D_CAM);        // metres per card unit
const H_CARD = 1.00;                                           // card units tall

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
/**
 * A cylindrical section — a lens, not a flat decal. The sag has to be a real
 * fraction of the pane: at 0.4 mm across a 115 mm window the surface normal
 * never turns far enough to sweep a source across it, and a mirror-smooth flat
 * pane at this camera angle simply reflects the dark shell.
 */
function curvedPlane(w, h, sag, sagX = 0, sx = 28, sy = 20) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (2 * p.getY(i)) / h, v = (2 * p.getX(i)) / w;
    p.setZ(i, sag * (1 - u * u) + sagX * (1 - v * v));
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
// The pivot sits 22 mm BELOW the bottom of the window, as it does on a real
// meter: the arc then sweeps symmetrically across the full width instead of
// bunching into the upper half and leaving dead face at the corners.
const PIVOT_DY = 0.083;
const PIVOT_Y = Y_MET - PIVOT_DY;
const R_TICK = 0.116, R_NUM = 0.0985, NEEDLE_L = 0.1125;

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

  // Backlit face. Real meter glass is a deep cobalt with a modest lamp lift,
  // not a lightbox. It is deliberately kept a stop and a half below the value
  // it had, so the reflection in the lens can be the brightest thing in the
  // window — which is what makes it read as glass rather than as a decal.
  const bg = g.createRadialGradient(W / 2, H * 1.02, 60, W / 2, H * 0.86, W * 0.88);
  bg.addColorStop(0.00, '#256487');
  bg.addColorStop(0.28, '#17486c');
  bg.addColorStop(0.66, '#0b324e');
  bg.addColorStop(1.00, '#052139');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const vg = g.createLinearGradient(0, 0, 0, H * 0.62);
  vg.addColorStop(0, 'rgba(3,14,27,0.46)');
  vg.addColorStop(1, 'rgba(3,14,27,0.00)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  const PX = W / MET_W;                    // pixels per metre
  const cx = W / 2, cy = H / 2 + PIVOT_DY * PX;   // needle pivot, in canvas pixels
  const rTick = R_TICK * PX, rNum = R_NUM * PX;
  const ink = 'rgba(4,16,29,1.00)';
  const inkS = 'rgba(4,16,29,0.78)';

  // 1 dB ticks across 30 dB, majors every 5 dB
  for (let d = 0; d <= MET_DB; d++) {
    const a = -MET_SWEEP + (d / MET_DB) * 2 * MET_SWEEP;
    const major = d % 5 === 0;
    const len = major ? 56 : 25;
    g.strokeStyle = major ? ink : inkS;
    g.lineWidth = major ? 11 : 5.0;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * rTick, cy - Math.cos(a) * rTick);
    g.lineTo(cx + Math.sin(a) * (rTick - len), cy - Math.cos(a) * (rTick - len));
    g.stroke();
  }
  g.strokeStyle = 'rgba(4,16,29,0.62)'; g.lineWidth = 3.4;
  g.beginPath(); g.arc(cx, cy, rTick, -Math.PI / 2 - MET_SWEEP, -Math.PI / 2 + MET_SWEEP); g.stroke();

  // numerals: 0.3 1 3 10 30 100 300 W — five decibels apart, so evenly spaced.
  // At r = 822 px the arc pitch is 239 px against a 105 px '300', so no two
  // labels come within 1.4 glyph widths of each other.
  const labels = ['0.3', '1', '3', '10', '30', '100', '300'];
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < labels.length; i++) {
    const a = -MET_SWEEP + (i / (labels.length - 1)) * 2 * MET_SWEEP;
    const x = cx + Math.sin(a) * rNum, y = cy - Math.cos(a) * rNum;
    g.save(); g.translate(x, y); g.rotate(a * 0.6);
    g.font = '700 60px ui-sans-serif, -apple-system, Helvetica, Arial';
    g.fillText(labels[i], 0, 0);
    g.restore();
  }

  g.font = '700 36px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,29,0.94)';
  g.letterSpacing = '11px';
  g.fillText('POWER OUTPUT', cx, H * 0.098);
  g.font = '600 27px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,29,0.80)';
  g.fillText('WATTS INTO 8 Ω', cx, H * 0.185);
  g.letterSpacing = '0px';
  g.font = '600 26px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,29,0.66)';
  g.fillText('−30 dB', W * 0.085, H * 0.90);
  g.fillText('0 dB', W * 0.918, H * 0.90);

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
    top: mk(M.alu, { roughness: 0.44, envMapIntensity: 0.72, anisotropy: 0 }),
    fascia: mk(M.alu, { roughness: 0.28, envMapIntensity: 1.05, anisotropy: 0 }),
    // The handles are the widest specular on the front. A hair rougher than the
    // fascia so the widened front strip lands as a soft vertical ramp down the
    // rail rather than a clipped white edge line.
    handle: mk(M.alu, { roughness: 0.20, envMapIntensity: 1.00, anisotropy: 0 }),
    bezel: mk(M.chrome, { roughness: 0.15, envMapIntensity: 0.95 }),
    // A lacquered panel under the meter: clearcoat 1.0 at 0.028 roughness gives
    // the front strip a bright, soft, moving band over a near-black base — the
    // specular layer the fascia otherwise has nowhere to put.
    gloss: mk(M.pianoBlack, { envMapIntensity: 1.20 }),
    // Fin tips are 3 mm of rounded metal seen almost edge-on. They only read if
    // they are glossy enough to carry a specular line off the front strip; the
    // stock heatsink material renders the whole stack as a black void.
    fin: mk(M.anodGrey, { roughness: 0.255, envMapIntensity: 1.45, anisotropy: 0 }),
    finBase: mk(M.anodGrey, { roughness: 0.55, envMapIntensity: 0.72, anisotropy: 0 }),
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

  // Machined handle rails. Thin ribs return a one-pixel clipped line off the
  // front strip; a 17 mm half-round returns a gradient down its whole length.
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(GEO.bevelBox(0.017, 0.384, 0.011, 0.0038, 5), A.handle);
    rail.position.set(sx * 0.1075, Y_MID, Z_FACE + 0.0215);
    g.add(rail);
    for (const sy of [-1, 1]) {
      const boss = new THREE.Mesh(GEO.bevelCyl(0.0115, 0.0125, 0.010, 26, 0.0012), A.bezel);
      boss.rotation.x = Math.PI / 2;
      boss.position.set(sx * 0.1075, Y_MID + sy * 0.163, Z_FACE + 0.0195);
      g.add(boss);
    }
  }

  // ---- lower fascia: a lacquered control panel -----------------------------
  const chanY = Y_MID - 0.116;
  const panel = new THREE.Mesh(GEO.bevelBox(0.196, 0.084, 0.0055, 0.0022, 4), A.gloss);
  panel.position.set(0, chanY, Z_FACE + 0.0172);
  g.add(panel);
  const kn = GEO.knob(0.0175, 0.014, { body: A.fascia, mark: A.bezel });
  kn.rotation.x = Math.PI / 2;
  kn.position.set(-0.060, chanY, Z_FACE + 0.0265);
  g.add(kn);
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 16),
      i === 0 ? M.ledCyan : (i === 1 ? M.ledAmber : M.ledGreen));
    led.position.set(0.028 + i * 0.017, chanY, Z_FACE + 0.0202);
    led.castShadow = led.receiveShadow = false;
    g.add(led);
  }
  const badge = new THREE.Mesh(GEO.bevelBox(0.052, 0.011, 0.0018, 0.0006, 2), A.bezel);
  badge.position.set(0.041, chanY - 0.026, Z_FACE + 0.0206);
  g.add(badge);
  GEO.screwRow(g, [[-0.117, Y_MID + 0.190], [0.117, Y_MID + 0.190],
    [-0.117, Y_MID - 0.190], [0.117, Y_MID - 0.190]], Z_FACE + 0.0176, 0.0018);

  // ---- the meter -----------------------------------------------------------
  const Z_DIAL = Z_FACE + 0.0042;
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.002, MET_H - 0.002),
    new THREE.MeshBasicMaterial({ map: dialTexture(renderer), toneMapped: false }));
  dial.position.set(0, Y_MET, Z_DIAL);
  g.add(dial);

  // needle: pivots below the window, dark against the lit face
  const pivot = new THREE.Group();
  pivot.name = 'needle';
  pivot.position.set(0, PIVOT_Y, Z_DIAL + 0.0082);
  const needleMat = new THREE.MeshBasicMaterial({ color: 0x05101b });
  needleMat.userData.ampOwned = true;
  const nd = new THREE.Mesh(GEO.bevelBox(0.0026, NEEDLE_L, 0.0018, 0.0005, 2), needleMat);
  nd.position.y = NEEDLE_L / 2;
  pivot.add(nd);
  const nb = new THREE.Mesh(GEO.bevelBox(0.0062, 0.030, 0.0020, 0.0008, 2), needleMat);
  nb.position.y = 0.013;
  pivot.add(nb);
  g.add(pivot);

  const bShape = roundRect(MET_W + 0.020, MET_H + 0.020, 0.008);
  bShape.holes.push(roundRect(MET_W - 0.006, MET_H - 0.006, 0.005, 0, 0, THREE.Path));
  const bez = extrudePanel(bShape, 0.009, MET_W + 0.020, MET_H + 0.020, A.bezel, 0.0010);
  bez.position.set(0, Y_MET, Z_FACE + 0.0125);
  g.add(bez);
  GEO.screwRow(g, [[-0.0935, Y_MET + 0.0625], [0.0935, Y_MET + 0.0625],
    [-0.0935, Y_MET - 0.0625], [0.0935, Y_MET - 0.0625]], Z_FACE + 0.0224, 0.0013);

  // ---- the meter lens ------------------------------------------------------
  // Glass, in two layers. On a MeshPhysicalMaterial `opacity` scales the whole
  // shaded result, specular included, so a single 20 %-opaque pane multiplies
  // its own reflection down to nothing and the meter reads as a printed decal.
  // Layer 1 is the smoke tint. Layer 2 adds an env-only specular ON TOP of the
  // glow instead of multiplying it down, and is a genuinely convex cylindrical
  // section — 5 mm of sag across 115 mm — so the surface normal turns far
  // enough to sweep the front strip across the pane as a broad diagonal band.
  // Roughness 0.055 rather than mirror-smooth gives that band a width and a
  // rolloff; at 0.02 it is a needle that misses the source altogether.
  const smoked = M.glass.clone();
  smoked.userData.ampOwned = true;
  smoked.transparent = true;
  smoked.opacity = 0.18;
  smoked.depthWrite = false;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(MET_W - 0.004, MET_H - 0.004), smoked);
  glass.position.set(0, Y_MET, Z_FACE + 0.0172);
  glass.renderOrder = 2;
  g.add(glass);

  // TWO reasons the old lens contributed nothing. First, it was built with
  // `new MeshPhysicalMaterial`, and `applyEnv()` only walks the shared library
  // — an ad-hoc material never receives the environment map at all, so its
  // "reflection" was of an empty scene. It has to be a clone of a library
  // material, taken at build time, after applyEnv has run. Second, a dielectric
  // returns only F0 ≈ 4 % of what it reflects, which tone-maps to nothing;
  // driven as a *tinted metal* the whole environment comes back scaled by the
  // colour, so under additive blending the dark room adds nothing and the front
  // strip adds a real band with a rolloff.
  const specMat = M.chrome.clone();
  specMat.userData.ampOwned = true;
  specMat.color.setHex(0x515d6c);
  specMat.metalness = 1.0;
  specMat.roughness = 0.085;
  specMat.envMapIntensity = 1.95;
  specMat.transparent = true;
  specMat.opacity = 1;
  specMat.depthWrite = false;
  specMat.blending = THREE.AdditiveBlending;
  const spec = new THREE.Mesh(curvedPlane(MET_W - 0.007, MET_H - 0.007, 0.0055, 0.0024), specMat);
  spec.position.set(0, Y_MET, Z_FACE + 0.0186);
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
// OVERLAY — ONE instrument plate, two regions
//
// Region 1 (top, 55 % of the plate): the speaker cable, cut open. Two
// conductors, the carriers in each, and the field front that actually carries
// the energy. This is the one thing in the amplifier chapter that a picture
// tells better than prose, so it gets the plate.
//
// Region 2 (bottom): the solved class-AB dissipation curve, with numerals on
// both axes and a live operating point. The schematic that used to occupy this
// plate is now prose — a textbook line drawing floating in a photographic set
// was the wrong object in the wrong medium.
// ---------------------------------------------------------------------------

// cable region
const X_C0 = 0.055, X_C1 = 0.945;
const Y_HOT = 0.845, Y_RTN = 0.725;
const Y_DIM = 0.665;
const Y_RULE = 0.508;
// graph region (local card units)
const G_X = 0.150, G_Y = 0.075, G_W = 0.775, G_H = 0.345;

function seg(parent, pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => [pts[i][0], pts[i][1], opts.z || 0]);
  parent.add(t);
  return t;
}

/**
 * `diagramCard`'s plate is a transparent MeshBasicMaterial at renderOrder 3.
 * Anything in the scene drawn with a higher renderOrder — every DIAG.Trace is
 * 8..14, and several chassis use lit display planes above that — renders AFTER
 * the plate and prints straight through it, which is why the rack used to show
 * through this card. Making the plate opaque puts it in the opaque queue, where
 * it writes depth before any transparent object is considered.
 *
 * `fadeTree` descends into the card group even when the group carries a
 * setOpacity hook, so the hook has to live on the PLATE, not on the group.
 */
function opaquePlate(card) {
  const plate = card.userData.plate;
  delete card.userData.setOpacity;
  plate.material.transparent = false;
  plate.material.opacity = 1;
  plate.material.color.setHex(0x0a0d12);
  plate.userData.setOpacity = (o) => {
    plate.material.transparent = o < 0.995;
    plate.material.opacity = o;
    plate.visible = o > 0.002;
  };
  return card;
}

function anchor(parent, x, y) {
  const o = new THREE.Object3D();
  o.position.set(x, y, 0.006);
  parent.add(o);
  return o;
}

function buildOverlay(ctx) {
  const root = new THREE.Group();
  const P = new THREE.Group();

  // plate centre on the ray through (CARD_CX, CARD_CY), then back off to the
  // group origin, which sits at local (0.50, H_CARD/2)
  const c = rayPoint(CARD_CX, CARD_CY, CARD_D);
  P.position.copy(c)
    .addScaledVector(CAM_R, -CARD_S * 0.50)
    .add(new THREE.Vector3(0, -CARD_S * H_CARD * 0.5, 0));
  P.rotation.y = AZ;                     // face the lens
  P.scale.setScalar(CARD_S);
  root.add(P);

  P.add(opaquePlate(DIAG.diagramCard(1.0, H_CARD, { opacity: 1 })));

  const dimWire = 0x7b848f;
  seg(P, [[0.0, Y_RULE], [1.0, Y_RULE]], 0x39414c, 1.0, { opacity: 0.65 });

  // ---- region 1: the cable, cut open --------------------------------------
  // Two conductors. Current is a loop, so the carriers in them move in
  // antiphase — the lower run is the return, not a decoration.
  const cond = [];
  for (const y of [Y_HOT, Y_RTN]) {
    cond.push(seg(P, [[X_C0, y], [X_C1, y]], 0x646f7c, 11.0, { opacity: 0.95, z: 0.004 }));
    seg(P, [[X_C0, y + 0.0140], [X_C1, y + 0.0140]], 0xa4aeba, 1.0, { opacity: 0.55, z: 0.006 });
  }

  // The field between the conductors, filling in behind the front: the energy
  // travels in here, not in the copper. Drawn as a comb of field lines whose
  // connecting runs lie exactly on the hot conductor, so `setProgress` reveals
  // them left to right and the return runs are never visible.
  const NF = 30;
  const fieldPts = [];
  for (let i = 0; i < NF; i++) {
    const x = X_C0 + ((i + 0.5) / NF) * (X_C1 - X_C0);
    fieldPts.push([x, Y_HOT], [x, Y_RTN + 0.006], [x, Y_HOT]);
  }
  const fieldComb = seg(P, fieldPts, PAL.cy, 1.1, { opacity: 0.34, z: 0.002 });

  const fieldFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: PAL.cy, toneMapped: false, transparent: true, opacity: 0.05, depthWrite: false }));
  fieldFill.position.set(X_C0, (Y_HOT + Y_RTN) / 2, 0.001);
  fieldFill.renderOrder = 6;
  P.add(fieldFill);

  // rest-position fiducials, so an oscillation about a fixed point reads as one
  const NC = 24;
  const marks = [];
  for (let i = 0; i < NC; i++) marks.push(X_C0 + 0.028 + (i / (NC - 1)) * (X_C1 - X_C0 - 0.056));
  // one comb per conductor, and both on the OUTSIDE of the pair — interleaving
  // them into a single polyline draws a zigzag across the gap, and hanging them
  // inside puts them among the field lines
  for (const [y, sgn] of [[Y_HOT, 1], [Y_RTN, -1]]) {
    const tickPts = [];
    for (const x of marks) tickPts.push([x, y + sgn * 0.0245], [x, y + sgn * 0.0165], [x, y + sgn * 0.0245]);
    seg(P, tickPts, dimWire, 0.9, { opacity: 0.34 });
  }

  const carriers = new DIAG.Swarm(NC * 2, { color: PAL.am, size: 0.0072, additive: false });
  P.add(carriers);

  const front = [];
  const frontBar = seg(P, [[X_C0, Y_RTN - 0.030], [X_C0, Y_HOT + 0.030]], 0xdff2ff, 2.6, { z: 0.008 });
  for (const y of [Y_HOT, Y_RTN]) {
    const s = DIAG.glow(PAL.cy, 0.052, 0.85, radialSprite(128));
    s.position.set(X_C0, y, 0.010);
    P.add(s);
    front.push(s);
  }

  P.add(DIAG.dimension([X_C0, Y_DIM, 0.002], [X_C1, Y_DIM, 0.002], { color: dimWire, head: 0.014 }));

  // ---- region 2: the solved dissipation curve -----------------------------
  const graph = new DIAG.Graph({
    w: G_W, h: G_H, xRange: [0, 1], yRange: [0, 360],
    xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 90, 180, 270, 360],
  });
  graph.position.set(G_X, G_Y, 0.004);
  P.add(graph);
  graph.addTrace((m) => pOut(m), { color: PAL.cy, width: 2.0, n: 120, opacity: 0.85 });
  graph.addTrace((m) => pDiss(m), { color: PAL.am, width: 3.0, n: 120 });
  graph.addMarker(M_PEAK, { color: PAL.am, width: 1.2, opacity: 0.5 });
  const opPoint = graph.addDot(PAL.am, 0.0105);
  const opOut = graph.addDot(PAL.cy, 0.0075);
  graph.tickLabels(ctx.labels, {
    xVals: [0, 0.5, 1], yVals: [0, 180, 360],
    xFmt: (v) => v.toFixed(1), yFmt: (v) => v.toFixed(0),
    xOffset: [0, 12], yOffset: [-14, 0], priority: 2,
  });

  return { root, P, front, frontBar, fieldFill, fieldComb, carriers, marks, cond, graph, opPoint, opOut };
}

// ---------------------------------------------------------------------------
// animation constants — all derived from the geometry above
// ---------------------------------------------------------------------------
const CAR_SCALE = (X_C1 - X_C0 - 0.056) / CAB_LEN;   // card units per real metre
const CAR_AMP   = 0.0158;                            // drawn amplitude, card units
const CAR_EXAG  = CAR_AMP / (X_DRIFT * CAR_SCALE);   // ≈ 1.4 × 10⁶ spatial
const FRONT_RUN = 0.80;                              // real seconds per traverse
const FRONT_GAP = 0.40;
const FRONT_RAT = FRONT_RUN / T_CABLE;               // ≈ 5.3 × 10⁷ temporal
/**
 * The two exaggerations above are of different kinds — one spatial, one
 * temporal — so quoting either alone tells the reader nothing about what they
 * are actually looking at. What matters is the ratio of the two SPEEDS AS
 * DRAWN: the front crosses the plate at (X_C1−X_C0)/FRONT_RUN card units per
 * second, and a carrier's peak speed is CAR_AMP·2π·F_SCREEN. State that beside
 * the true 7.8 × 10¹¹ so nobody mistakes the picture for the physics.
 */
const SEEN_FRONT = (X_C1 - X_C0) / FRONT_RUN;
const SEEN_CARR  = CAR_AMP * DSP.TAU * F_SCREEN;
const SEEN_RATIO = SEEN_FRONT / SEEN_CARR;           // ≈ 5.6 : 1

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
    // above the chassis's front-right corner, so the label sits on empty
    // backdrop between the amp and the explanation panel
    const metAnchor = new THREE.Object3D();
    metAnchor.position.set(0.150, 0.455, 0.205);
    a.add(metAnchor);

    const S = buildOverlay(ctx);
    S.needles = needles;
    S.deflect = [0.5, 0.5];
    this._s = S;
    this._live = { v: 0, i: 0, p: 0, pd: P_QUIES, mean: 0, dc: P_QUIES, m: 0 };

    const L = ctx.labels;
    const P = S.P;
    S.L = {
      meter: L.add(metAnchor, {
        kicker: 'Meter', cls: 'acc', priority: 4, offset: [26, -30],
        text: `log · ${MET_DB} dB to ${MET_FS} W, 180 ms`, value: '—',
      }),
      cable: L.add(anchor(P, 0.50, Y_HOT), {
        kicker: 'Inside the cable', cls: 'am', priority: 4, occlude: false, offset: [0, -42],
        text: `field ${exp10(V_FIELD, 2)} m/s · carriers ±${(X_DRIFT * 1e9).toFixed(1)} nm`
          + ` at ${exp10(V_DRIFT, 2)} m/s`,
        value: `true ${exp10(SPEED_RAT)} : 1 · as drawn only ${SEEN_RATIO.toFixed(1)} : 1`,
      }),
      ret: L.add(anchor(P, 0.50, Y_DIM), {
        kicker: 'Return path',
        cls: '', priority: 3, occlude: false, offset: [0, 30],
        text: `3 m of 2.5 mm² · ${(R_CABLE * 1000).toFixed(1)} mΩ loop`,
        value: `damping R ${RD_AMP.toFixed(2)} → ${RD_DRV.toFixed(2)} Ω · +${(DAMP_PEN * 100).toFixed(2)} %`,
      }),
      // parked in the plot's own dead space, upper-left, where neither curve goes
      diss: L.add(anchor(P, G_X + G_W * 0.36, G_Y + G_H * 0.82), {
        kicker: 'Device heat · W vs swing m', cls: 'am', priority: 3, occlude: false, offset: [0, 0],
        text: `peak ${P_D_PEAK.toFixed(0)} W at m = ${M_PEAK.toFixed(2)}`,
        value: '—',
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
    // ONE cached state, written once per frame. Both the world labels below and
    // readouts() read this object, so a still frame can never show a label and
    // a footer dial disagreeing about the same instant.
    this._live = { v, i, p, pd, mean, dc: pDc(mm), m: mm };

    // --- meters: a 180 ms ballistic on a logarithmic power scale ------------
    const meanR = DSP.powerW((V_PK * envR) / Math.SQRT2, RL);
    const k = 1 - Math.exp(-dtp / 0.18);
    for (let n = 0; n < 2; n++) {
      const target = meterFrac(n === 0 ? mean : meanR);
      S.deflect[n] += (target - S.deflect[n]) * k;
      S.needles[n].rotation.z = MET_SWEEP - 2 * MET_SWEEP * S.deflect[n];
    }
    // This label reports the NEEDLE, not the power. The footer already carries
    // P MEAN; it is polled at 10 Hz while a label is written every frame, so any
    // label that restates the same quantity will sooner or later print a
    // different last digit in the same still — which reads as an arithmetic
    // error. The needle's own position is a different quantity by construction:
    // it lags the mean through the 180 ms ballistic, exactly as a real moving-
    // coil movement does, and the text says so.
    S.L.meter.setValue(`needle at ${(MET_DB * (S.deflect[0] - 1)).toFixed(0)} dB`);

    if (ctx.stage.reveal < 0.004) return;        // overlay is invisible — stop here

    // --- the dissipation curve's operating point ----------------------------
    S.opPoint.userData.setData(mm, pd);
    S.opOut.userData.setData(mm, pOut(mm));
    // per device, not total — the footer carries the total, and the per-device
    // figure is the one the safe-operating-area argument turns on
    S.L.diss.setValue(`now ${(pd / (2 * NPAIR)).toFixed(0)} W per device`);

    // --- inside the cable ---------------------------------------------------
    // Displacement is the integral of current, so it goes as −cos, and the two
    // conductors move in antiphase: that is the return path, drawn.
    const disp = -Math.cos(ph) * CAR_AMP * env;
    const N = S.marks.length;
    S.carriers.update((n) => {
      const lane = n < N ? 0 : 1;
      const x = S.marks[n % N] + (lane === 0 ? disp : -disp);
      return { p: [x, lane === 0 ? Y_HOT : Y_RTN, 0.007], s: 1, c: PAL.am };
    });
    const duty = 0.45 + 0.55 * Math.abs(i) / I_PK;
    for (const cd of S.cond) cd._baseOpacity = 0.72 + 0.23 * duty;

    // field front: its own clock, and the label states both ratios
    const u = (tp % (FRONT_RUN + FRONT_GAP)) / FRONT_RUN;
    const fx = X_C0 + DSP.clamp(u, 0, 1) * (X_C1 - X_C0);
    const fade = u <= 1 ? Math.min(1, (1 - u) * 5) : 0;
    S.frontBar.position.x = fx - X_C0;
    S.frontBar._baseOpacity = fade;
    for (const o of S.front) {
      o.position.x = fx;
      o.material.color.setRGB(0.36 * fade, 0.75 * fade, 0.95 * fade);
    }
    const w = Math.max(1e-4, fx - X_C0);
    S.fieldFill.scale.set(w, Y_HOT - Y_RTN, 1);
    S.fieldFill.position.x = X_C0 + w / 2;
    S.fieldFill.material.opacity = 0.09 * fade * ctx.stage.reveal;
    S.fieldComb.setProgress(DSP.clamp(u, 0.001, 1));
    S.fieldComb._baseOpacity = 0.40 * fade;
  },

  content() {
    return `
<div class="key"><span class="lab">The idea</span><p>The input carries almost no energy. The monoblock uses it to <b>modulate a current drawn from the supply</b>, and that current is a loop: every ampere out of the red terminal returns through the black one.</p></div>

<h3>300 W into 8 Ω</h3>
<div class="eq">V<sub>rms</sub> = √(P·R) = √(300 × 8) = <span class="hl">${V_RMS.toFixed(1)} V</span>
V<sub>pk</sub>  = ${V_RMS.toFixed(1)} × √2      = <span class="hl">${V_PK.toFixed(1)} V</span>
I<sub>pk</sub>  = ${V_PK.toFixed(1)} / 8       = <span class="hl">${I_PK.toFixed(2)} A</span>
I<sub>rail</sub> = I<sub>pk</sub>/π = ${I_DC_FULL.toFixed(2)} A mean per rail
V<sub>rip</sub> = I/(f·C) = ${I_DC_FULL.toFixed(2)}/(100 × 0.015)
      = <span class="hl">${V_RIPPLE.toFixed(2)} V p-p</span></div>
<p>The <span class="num">±${RAIL} V</span> is the loaded mean, not a no-load peak. It leaves <span class="num">${HEADROOM.toFixed(1)} V</span>, of which <span class="num">${(V_RIPPLE / 2).toFixed(2)} V</span> is the ripple trough — <span class="num">${(HEADROOM - V_RIPPLE / 2).toFixed(1)} V</span> for V<sub>ce(sat)</sub>, driver V<sub>be</sub> and I·R<sub>E</sub>.</p>

<h3>Class AB</h3>
<p>Both banks idle slightly on. Oliver's condition puts one thermal voltage across each emitter resistor:</p>
<div class="eq">V<sub>T</sub> = kT/q at 300 K        = ${(VT * 1000).toFixed(2)} mV
I<sub>q</sub> = V<sub>T</sub>/R<sub>E</sub> = ${(VT * 1000).toFixed(2)}/${RE}  = <span class="hl">${(IQ * 1000).toFixed(0)} mA</span>
V<sub>bias</sub> = 2V<sub>be</sub> + 2I<sub>q</sub>R<sub>E</sub>     = <span class="hl">${VBIAS.toFixed(3)} V</span>
P<sub>idle</sub> = 2 × ${RAIL} × ${NPAIR} × ${(IQ * 1000).toFixed(0)} mA = <span class="hl">${P_QUIES.toFixed(1)} W</span></div>
<p>Unbiased, the same solver gives under 1 % of that curve out to <span class="num">±${DB_1PC.toFixed(2)} V</span> of drive and half only at <span class="num">±${DB_HALF.toFixed(2)} V</span> — so crossover distortion is worst at low level, where that volt is most of the signal.</p>

<h3>Heat</h3>
<p>The amber curve beside the amplifier is this solver's own answer, and its peak is not at full power: <span class="num">${P_D_PEAK.toFixed(0)} W</span> total, <span class="num">${(P_D_PEAK / (2 * NPAIR)).toFixed(0)} W</span> per device, at <span class="num">m = ${M_PEAK.toFixed(2)}</span> — <span class="num">${(X_PEAK * 100).toFixed(1)} %</span> of maximum output, where only <span class="num">${P_AT_PEAK.toFixed(0)} W</span> reaches the loudspeaker. Clipping arrives at <span class="num">${(X_CLIP * 100).toFixed(0)} %</span> of the ideal <span class="num">${P_MAX.toFixed(1)} W</span>.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>That is the resistive worst case. A loudspeaker is reactive: at 4 Ω and 60° of phase the same level roughly doubles the V<sub>ce</sub>·I<sub>c</sub> product in the conducting device. Hence the safe-operating-area limiter.</p></div>

<h3>Inside the cable</h3>
<p>At <span class="num">${I_PK.toFixed(2)} A</span> peak the carriers drift at <span class="num">${exp10(V_DRIFT, 2)} m/s</span> — and on a 1 kHz tone they do not travel, they oscillate <span class="num">±${(X_DRIFT * 1e9).toFixed(1)} nm</span> about a fixed point. The field crosses the run at <span class="num">${VF} c</span> in <span class="num">${(T_CABLE * 1e9).toFixed(1)} ns</span>, in which a carrier moves <span class="num">${(X_IN_T * 1e12).toFixed(1)} pm</span>. The loop's <span class="num">${(R_CABLE * 1000).toFixed(1)} mΩ</span> joins the coil's own <span class="num">${RE_COIL} Ω</span>: damping resistance <span class="num">${RD_AMP.toFixed(2)} → ${RD_DRV.toFixed(2)} Ω</span>, <span class="num">${(DAMP_PEN * 100).toFixed(2)} %</span> — not the <span class="num">${DF_TERM.toFixed(0)} → ${DF_DRIVE.toFixed(0)}</span> that quoting damping factor implies.</p>
<p>On the plate the drift is magnified <span class="num">${exp10(CAR_EXAG, 1)}×</span> and the front slowed <span class="num">${exp10(FRONT_RAT, 1)}×</span>. Those are different kinds of cheat, so the picture shows the front outrunning the carriers by only <span class="num">${SEEN_RATIO.toFixed(1)} : 1</span>.</p>`;
  },

  readouts() {
    const s = this._live || { v: 0, i: 0, p: 0, pd: P_QUIES, mean: 0, dc: P_QUIES, m: 0 };
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
