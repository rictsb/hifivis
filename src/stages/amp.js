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
/** Oliver's condition: crossover distortion is minimised when the quiescent
 *  voltage across each emitter resistor equals V_T. */
const IQ        = VT / RE;                    // 117.5 mA per device
const IQ_TOT    = NPAIR * IQ;                 // 352.5 mA per rail
const P_QUIES   = 2 * RAIL * IQ_TOT;          // 52.9 W burnt doing nothing


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
const SPEED_RAT = V_FIELD / V_DRIFT;                         // 7.8e11

const TS        = 0.002;                      // timeScale: 1 kHz → 2 Hz on screen
const F_SCREEN  = F_SIG * TS;                 // 2 Hz as drawn

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

/**
 * The optical axis is NOT at x = 800. The Director shifts the principal point so
 * the axis lands at the centre of the clear band: at 1600 px that is
 * (railW + (w − panelW)) / 2 = (200 + 1140) / 2 = 670 px. Placing the card off a
 * 640 px axis put it 30 px left of where the arithmetic said it was, which is
 * most of the margin the safe box has.
 */
const AXIS_PX = 670;

/** World point on the ray through a screen pixel (1600 × 1000, axis at AXIS_PX,500). */
function rayPoint(px, py, dist) {
  const f = new THREE.Vector3(-Math.sin(AZ) * Math.cos(EL), -Math.sin(EL), -Math.cos(AZ) * Math.cos(EL));
  const u = CAM_R.clone().cross(f);
  const r = f.clone()
    .addScaledVector(CAM_R, ((px - AXIS_PX) / 800) * TAN_H * 1.6)
    .addScaledVector(u, (-(py - 500) / 500) * TAN_H)
    .normalize();
  return new THREE.Vector3(...SHOT.position).addScaledVector(r, dist);
}

// The plate: 392 px across its live area, centred at (400, 496), floated 1.50 m
// from the lens. The machined trim frame adds 9 %, so the whole object spans
// x 186…614 at 1600 × 1000 — clear of the chapter rail (safe box starts at 160)
// and clear of the monoblock's own silhouette on the right.
const CARD_PX = 392, CARD_CX = 400, CARD_CY = 496, CARD_D = 1.50;
/** Yawed off the lens axis. A card square to the lens is always a decal; 13° is
 *  enough for the plate's own edge and trim to catch the front strip. */
const CARD_YAW = AZ - 0.225;
const CARD_S = (CARD_PX * CARD_D) / (PX_PER_M * D_CAM * Math.cos(AZ - CARD_YAW));
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
 * A domed instrument glass — a lens, not a flat decal. The sag has to be a real
 * fraction of the pane: at 0.4 mm across a 115 mm window the surface normal
 * never turns far enough to sweep a source across it, and a mirror-smooth flat
 * pane at this camera angle simply reflects the dark shell.
 *
 * Geometry of the band, worked out rather than fiddled. The lens sits at world
 * y = 0.411 and the camera axis looks DOWN at it by 7.2°, so a flat vertical
 * pane reflects 7.2° BELOW the horizon — the near-black floor of the
 * environment shell, which is why the old pane returned nothing at all.
 *
 * Raking the pane back by `rake` turns the reflection up by 2·rake, and the
 * dome turns it a further ±2·atan(4·sag/h) from top edge to bottom, with the
 * TOP of a convex pane reflecting upward. The front strip (18 × 2.6 m at
 * z = +4.2) subtends 5.3°…24.8° from the meter. With rake 5.7° and 5 mm of sag
 * across the 116 mm window the reflected ray runs +23° at the top of the pane
 * to −16° at the bottom, so the strip lands as a band across the upper half —
 * over the scale, which is exactly where cover glass veils a real meter.
 */
function domedPane(w, h, sag, sagX = 0, sx = 28, sy = 22) {
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
 * A pure specular layer: a black dielectric with a clearcoat, blended
 * additively, so ONLY its reflection of the room is added over whatever is
 * underneath. An emissive dial without one is a decal, whatever else is right.
 *
 * It must be a CLONE OF A LIBRARY MATERIAL: `applyEnv()` only walks the shared
 * library, so an ad-hoc `new MeshPhysicalMaterial` never receives the
 * environment map and reflects an empty scene.
 */
function specularLayer(M, rough = 0.14, strength = 0.9, envI = 1.9) {
  const m = M.glass.clone();
  m.userData.ampOwned = true;
  m.color.setHex(0x000000);
  m.roughness = rough;
  m.clearcoat = 1.0;
  // The clearcoat lobe has its own roughness, and at the library's 0.02 it is a
  // mirror that returns a knife-edged rectangle whatever the base roughness is.
  // Both lobes have to be broad or the band has no rolloff.
  m.clearcoatRoughness = rough * 0.85;
  m.envMapIntensity = envI;
  m.transparent = true;
  m.opacity = strength;
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending;
  m.toneMapped = true;
  return m;
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
  const W = 2048, H = Math.round((W * MET_H) / MET_W);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Backlit face. A moving-coil power meter is lit by lamps in a trough behind a
  // diffuser, so the face is a broad even cobalt with a soft falloff to the
  // frame — NOT a lightbox, and not a radial hotspot either.
  //
  // It is deliberately held a stop and a half below the value a lit panel could
  // take, because the cover glass's reflection band (see the lens, below) lands
  // across the UPPER half of the window and has to be the brightest thing in it.
  // A face driven to the top of the scale buries the one cue that says "this is
  // under glass" and the meter goes back to reading as a decal.
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0.00, '#154a70');
  bg.addColorStop(0.42, '#1d6491');
  bg.addColorStop(0.78, '#16527c');
  bg.addColorStop(1.00, '#0b3153');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // corner falloff — no lit panel is even corner to corner
  const vg = g.createRadialGradient(W / 2, H * 0.46, W * 0.18, W / 2, H * 0.46, W * 0.64);
  vg.addColorStop(0.00, 'rgba(2,11,22,0.00)');
  vg.addColorStop(1.00, 'rgba(2,11,22,0.58)');
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
    const len = major ? 74 : 33;
    g.strokeStyle = major ? ink : inkS;
    g.lineWidth = major ? 14 : 6.5;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * rTick, cy - Math.cos(a) * rTick);
    g.lineTo(cx + Math.sin(a) * (rTick - len), cy - Math.cos(a) * (rTick - len));
    g.stroke();
  }
  g.strokeStyle = 'rgba(4,16,29,0.62)'; g.lineWidth = 4.5;
  g.beginPath(); g.arc(cx, cy, rTick, -Math.PI / 2 - MET_SWEEP, -Math.PI / 2 + MET_SWEEP); g.stroke();

  // numerals: 0.3 1 3 10 30 100 300 W — five decibels apart, so evenly spaced.
  // UPRIGHT. A 100-degree sweep is short enough that upright numerals stay
  // square to the reader all the way round; the old `rotate(a * 0.6)` was
  // neither upright nor radial, which is the one thing real meter silkscreen
  // never is.
  const labels = ['0.3', '1', '3', '10', '30', '100', '300'];
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 78px ui-sans-serif, -apple-system, Helvetica, Arial';
  for (let i = 0; i < labels.length; i++) {
    const a = -MET_SWEEP + (i / (labels.length - 1)) * 2 * MET_SWEEP;
    const x = cx + Math.sin(a) * rNum, y = cy - Math.cos(a) * rNum;
    g.fillText(labels[i], x, y);
  }

  // Silkscreen. On a 2048 px canvas at this window size the legend lands at
  // roughly 26 screen px in the delivered 3200 px frame, so it is read, not
  // guessed at.
  g.font = '700 56px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,29,0.94)';
  g.letterSpacing = '16px';
  g.fillText('POWER OUTPUT', cx + 8, H * 0.105);
  g.font = '600 40px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,29,0.82)';
  g.letterSpacing = '9px';
  g.fillText('WATTS INTO 8 Ω', cx + 4, H * 0.205);
  g.letterSpacing = '0px';
  g.font = '600 34px ui-sans-serif, -apple-system, Helvetica, Arial';
  g.fillStyle = 'rgba(4,16,29,0.60)';
  g.fillText('−30 dB', W * 0.088, H * 0.905);
  g.fillText('0 dB', W * 0.916, H * 0.905);

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
    top: mk(M.alu, { roughness: 0.42, envMapIntensity: 0.88, anisotropy: 0 }),
    // ROUGHNESS IS THE MID-TONE LEVER, not envMapIntensity. Every frontal source
    // in the rig sits at y = 2.3…4.1 m while this fascia is at y = 0.4 m with the
    // lens looking 7° DOWN at it, so a smooth mirror reflects the black floor of
    // the shell and multiplying that by a bigger envMapIntensity just scales
    // darkness. Widening the lobe averages the strip in and gives the panel the
    // long top-to-bottom ramp instead of one flat value.
    fascia: mk(M.alu, { roughness: 0.36, envMapIntensity: 1.25, anisotropy: 0 }),
    // The handles are the widest specular on the front. A hair rougher than a
    // mirror so the widened front strip lands as a soft vertical ramp down the
    // rail rather than a clipped white edge line.
    handle: mk(M.alu, { roughness: 0.24, envMapIntensity: 1.20, anisotropy: 0 }),
    bezel: mk(M.chrome, { roughness: 0.15, envMapIntensity: 0.95 }),
    // A lacquered panel under the meter: clearcoat 1.0 at 0.028 roughness gives
    // the front strip a bright, soft, moving band over a near-black base — the
    // specular layer the fascia otherwise has nowhere to put.
    gloss: mk(M.pianoBlack, { envMapIntensity: 1.20 }),
    // Fin tips are 3 mm of rounded metal seen almost edge-on. They only read if
    // they are glossy enough to carry a specular line off the front strip; the
    // stock heatsink material renders the whole stack as a black void.
    fin: mk(M.anodGrey, { roughness: 0.33, envMapIntensity: 1.80, anisotropy: 0 }),
    finBase: mk(M.anodGrey, { roughness: 0.55, envMapIntensity: 0.72, anisotropy: 0 }),
    // The cheeks. Same argument as the fascia: a wider lobe is what puts a
    // gradient down a black flank instead of one value.
    shell: mk(M.anodBlack, { roughness: 0.40, envMapIntensity: 1.25, anisotropy: 0 }),
    // the rolled edge of the cover glass — polished, but narrow, so it is kept
    // a long way off mirror to stop the section clipping to a white line
    lensRim: mk(M.chrome, { color: new THREE.Color(0x8d949c), roughness: 0.20, envMapIntensity: 0.85 }),
    // the lacquered isolation pad the amp actually stands on: the one surface
    // in this frame that can hold a top-to-bottom gradient and a dark core
    // shadow at each foot, which is what plants 60 kg on a plinth
    pad: mk(M.pianoBlack, { roughness: 0.24, clearcoatRoughness: 0.045, envMapIntensity: 1.55 }),
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

  // ---- pad, plinth, feet, shell --------------------------------------------
  // A lacquered isolation pad, 6 mm, laid on the stand's black plate. The stand
  // itself is bead-blasted anodised and returns almost nothing of the chassis
  // above it, so a 60 kg monoblock reads as floating. The pad is the surface
  // that carries the long vertical gradient of the front strip and takes the
  // dark cores under the feet.
  const pad = new THREE.Mesh(GEO.bevelBox(0.376, 0.006, 0.476, 0.0018, 4), A.pad);
  pad.position.y = 0.003;
  g.add(pad);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // 12 mm rather than 18: the pad takes the other 6, so everything above the
    // plinth stays exactly where it was.
    const f = new THREE.Mesh(GEO.bevelCyl(0.015, 0.019, 0.012, 28, 0.0012), M.steel);
    f.position.set(sx * 0.115, 0.012, sz * 0.155);
    f.castShadow = true;
    g.add(f);
    // the hard core at the contact. A soft blob the size of the chassis is an
    // ambient term; what says "it is standing on that" is a small, dark,
    // fast-falloff patch directly under each foot.
    const cs = GEO.contactShadow(0.058, 0.058, 0.90, 0.0068);
    cs.position.set(sx * 0.115, 0.0068, sz * 0.155);
    g.add(cs);
  }
  const plinth = new THREE.Mesh(GEO.bevelBox(0.300, 0.018, 0.400, 0.0025, 3), M.anodBlack);
  plinth.position.y = 0.027;
  g.add(plinth);

  const shell = new THREE.Mesh(GEO.bevelBox(W_BODY, H_BODY, D_BODY, 0.004, 4), A.shell);
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

  // The needle, and — 8 mm below it — the shadow it throws on the dial. The
  // face is a MeshBasicMaterial, so it cannot receive a real shadow; but a
  // pointer standing proud of a lit dial always casts one, and its absence is
  // exactly what makes a meter look printed. It is a second, softer copy on its
  // own pivot, offset in the direction of the lamp trough above the window.
  const needleMat = new THREE.MeshBasicMaterial({ color: 0x061321 });
  needleMat.userData.ampOwned = true;
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x04101c, transparent: true, opacity: 0.30, depthWrite: false,
  });
  shadowMat.userData.ampOwned = true;
  const mkNeedle = (mat, z, name) => {
    const p = new THREE.Group();
    p.name = name;
    p.position.set(0, PIVOT_Y, z);
    const nd = new THREE.Mesh(GEO.bevelBox(0.0026, NEEDLE_L, 0.0018, 0.0005, 2), mat);
    nd.position.y = NEEDLE_L / 2;
    p.add(nd);
    const nb = new THREE.Mesh(GEO.bevelBox(0.0062, 0.030, 0.0020, 0.0008, 2), mat);
    nb.position.y = 0.013;
    p.add(nb);
    g.add(p);
    return p;
  };
  const shadowPivot = mkNeedle(shadowMat, Z_DIAL + 0.0006, 'needleShadow');
  shadowPivot.position.x += 0.0026;
  shadowPivot.position.y -= 0.0030;
  mkNeedle(needleMat, Z_DIAL + 0.0082, 'needle');

  const bShape = roundRect(MET_W + 0.020, MET_H + 0.020, 0.008);
  bShape.holes.push(roundRect(MET_W - 0.006, MET_H - 0.006, 0.005, 0, 0, THREE.Path));
  const bez = extrudePanel(bShape, 0.009, MET_W + 0.020, MET_H + 0.020, A.bezel, 0.0010);
  bez.position.set(0, Y_MET, Z_FACE + 0.0125);
  g.add(bez);
  GEO.screwRow(g, [[-0.0935, Y_MET + 0.0625], [0.0935, Y_MET + 0.0625],
    [-0.0935, Y_MET - 0.0625], [0.0935, Y_MET - 0.0625]], Z_FACE + 0.0224, 0.0013);

  // ---- the meter lens ------------------------------------------------------
  // THE COVER GLASS. Three layers, in this order, because the order is the
  // whole point: the reflection must sit IN FRONT of the glow, not be
  // multiplied into it.
  //
  //   1. a smoked tint, which gives the glass a body and sinks the dial back;
  //   2. the specular layer — an additive, env-only clearcoat on a domed pane,
  //      raked 4.3°, so the front strip sweeps across the lower half of the
  //      window as a soft band that partly veils the ticks;
  //   3. the pane's own edge highlight where the dome meets the bezel.
  //
  // On a MeshPhysicalMaterial `opacity` scales the whole shaded result,
  // specular included, so a single 20 %-opaque pane multiplies its own
  // reflection down to nothing. Layers 1 and 2 have to be separate meshes.
  const RAKE = -0.100;                        // rad = 5.7°; top back, bottom forward
  const smoked = M.glass.clone();
  smoked.userData.ampOwned = true;
  smoked.transparent = true;
  smoked.opacity = 0.16;
  smoked.depthWrite = false;
  const glass = new THREE.Mesh(domedPane(MET_W - 0.005, MET_H - 0.005, 0.0050, 0.0022, 14, 10), smoked);
  glass.position.set(0, Y_MET, Z_FACE + 0.0170);
  glass.rotation.x = RAKE;
  glass.renderOrder = 2;
  g.add(glass);

  const spec = new THREE.Mesh(domedPane(MET_W - 0.006, MET_H - 0.006, 0.0050, 0.0022),
    specularLayer(M, 0.155, 0.95, 2.45));
  spec.position.set(0, Y_MET, Z_FACE + 0.0178);
  spec.rotation.x = RAKE;
  spec.renderOrder = 3;
  g.add(spec);

  // The glass has a thickness, and the light that grazes its rolled edge is what
  // tells the eye the pane is proud of the dial rather than printed on it.
  const rimShape = roundRect(MET_W - 0.004, MET_H - 0.004, 0.005);
  rimShape.holes.push(roundRect(MET_W - 0.013, MET_H - 0.013, 0.004, 0, 0, THREE.Path));
  const rim = extrudePanel(rimShape, 0.0034, MET_W, MET_H, A.lensRim, 0.0007);
  rim.position.set(0, Y_MET, Z_FACE + 0.0152);
  rim.rotation.x = RAKE;
  g.add(rim);

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

  // Grounding, in three multiplied layers. `contactShadow` is a radial blob, so
  // one of them can only ever be a soft haze: at the plinth's own edge a blob
  // sized to the plinth has already faded to nothing. Stacking a wide soft one,
  // a medium one and a tight one builds a hard dark CORE under the chassis with
  // a long ramp out to the edge of the pad — which is what 60 kg standing on
  // polished lacquer actually looks like.
  for (const [w, d, o, y] of [
    [0.40, 0.50, 0.42, 0.0060],
    [0.345, 0.445, 0.62, 0.0063],
    [0.300, 0.400, 0.80, 0.0066],
  ]) {
    const sh = GEO.contactShadow(w, d, o, 0.0);
    sh.position.y = y;
    g.add(sh);
  }
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

// Card layout, in card units, with the DOM labels' own heights budgeted: the
// kicker line is ~13 px, a body line ~15 px and the value line ~16 px, and the
// card is 392 px across 1.0 unit. So a three-line label is 0.12 of the card and
// has to be given that much clear space or it lands on the artwork.
//   0.86…1.00  cable label (4 lines)
//   0.70…0.82  the two conductors
//   0.63       dimension line
//   0.53…0.62  return-path label (2 lines)
//   0.50       rule
//   0.38…0.49  plot key (3 lines)
//   0.09…0.365 the plot
const X_C0 = 0.055, X_C1 = 0.945;
const Y_HOT = 0.815, Y_RTN = 0.705;
const Y_DIM = 0.632;
const Y_RULE = 0.500;
// graph region (local card units). G_X leaves room INSIDE the plate for the y
// numerals, which hang to the left of the plot box; G_Y the same for the x.
const G_X = 0.225, G_Y = 0.092, G_W = 0.690, G_H = 0.273;

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
  const A = ampMetals();

  // BACKGROUND SEPARATION. The cyclorama behind the monoblock is one value with
  // no falloff, so a black chassis is cut out against flat card. A real set puts
  // a shaped light on the background BEHIND the subject and slightly to one
  // side, and the pool it makes — bright at the shoulder, dark at the frame — is
  // what separates a dark object without a rim light. It lives in the overlay so
  // it belongs to this chapter and is gone from the wide shot.
  // A Sprite, not a quad on the wall: the cove curves and a flat plane laid on it
  // shows its own edge where the two part company.
  const wash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSprite(256, 'rgba(152,180,210,1)', 'rgba(152,180,210,0)', 1.9),
    transparent: true, opacity: 0.15, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  wash.scale.set(2.0, 1.45, 1);
  // Placed off the LENS, not off the world axes: the pool has to sit behind the
  // monoblock's shoulder in the frame, and this camera looks across the room at
  // an angle where "behind the amp in world x" is well to one side on screen.
  wash.position.copy(rayPoint(778, 372, 3.7));
  wash.renderOrder = -2;
  root.add(wash);

  // plate centre on the ray through (CARD_CX, CARD_CY), then back off to the
  // group origin, which sits at local (0.50, H_CARD/2)
  const c = rayPoint(CARD_CX, CARD_CY, CARD_D);
  P.position.copy(c)
    .addScaledVector(CAM_R, -CARD_S * 0.50)
    .add(new THREE.Vector3(0, -CARD_S * H_CARD * 0.5, 0));
  P.rotation.y = CARD_YAW;               // 13° off the lens axis — see CARD_YAW
  P.scale.setScalar(CARD_S);
  root.add(P);

  // THE CARD AS AN OBJECT, not a pasted PNG. A square-cornered plane with a
  // 1 px border has no thickness, no edge, and nothing of the room's light on
  // it, which is the second-loudest CGI signal in the piece after blown
  // highlights. Give it a real slab with a machined trim frame: yawed off the
  // lens axis, the trim's top and left edges catch the front strip and its
  // right edge falls away, so the plate reads as a lit object in the room.
  const SLAB_T = 0.026;                       // card units ≈ 8 mm at this scale
  const SW = 1.060, SH = H_CARD + 0.060, TR = 0.032;
  const x0 = 0.5 - SW / 2, x1 = 0.5 + SW / 2;
  const y0 = H_CARD / 2 - SH / 2, y1 = H_CARD / 2 + SH / 2;
  const slab = new THREE.Mesh(GEO.bevelBox(SW, SH, SLAB_T, 0.004, 3), A.finBase);
  slab.position.set(0.5, H_CARD / 2, -SLAB_T / 2 - 0.004);
  slab.castShadow = slab.receiveShadow = true;
  P.add(slab);
  for (const [w, h, x, y] of [
    [SW + 2 * TR, TR, 0.5, y1 + TR / 2],
    [SW + 2 * TR, TR, 0.5, y0 - TR / 2],
    [TR, SH + 2 * TR, x0 - TR / 2, H_CARD / 2],
    [TR, SH + 2 * TR, x1 + TR / 2, H_CARD / 2],
  ]) {
    const t = new THREE.Mesh(GEO.bevelBox(w, h, SLAB_T + 0.016, 0.006, 4), A.handle);
    t.position.set(x, y, -SLAB_T / 2 + 0.004);
    t.castShadow = t.receiveShadow = true;
    P.add(t);
  }

  P.add(opaquePlate(DIAG.diagramCard(1.0, H_CARD, { opacity: 1 })));

  // The same specular layer the meter gets, over the plate. A diagram card with
  // nothing in front of it is a pasted PNG however good its frame is; a very
  // faint domed sheen means the room's front strip crosses it as a soft band and
  // the plate belongs to the same light as the amplifier beside it. Kept at
  // renderOrder 4 so the traces still draw over it.
  const sheen = new THREE.Mesh(domedPane(1.03, H_CARD + 0.03, 0.030, 0.016, 20, 16),
    specularLayer(mats(), 0.30, 0.52, 0.80));
  sheen.position.set(0.5, H_CARD / 2, 0.004);
  sheen.renderOrder = 4;
  P.add(sheen);

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
    xFmt: (v) => v.toFixed(1),
    yFmt: (v) => (v === 360 ? '360 W' : v.toFixed(0)),
    xOffset: [0, 13], yOffset: [-24, 0], priority: 2,
  });

  return { root, P, front, frontBar, fieldFill, fieldComb, carriers, marks, cond, graph, opPoint, opOut };
}

// ---------------------------------------------------------------------------
// animation constants — all derived from the geometry above
// ---------------------------------------------------------------------------
const CAR_AMP   = 0.0158;                            // drawn amplitude, card units
const FRONT_RUN = 0.80;                              // real seconds per traverse
const FRONT_GAP = 0.40;
/**
 * TWO different exaggerations are at work here — the carriers' displacement is
 * magnified about 1.4 × 10⁶ in space, the field front slowed about 5.3 × 10⁷ in
 * time — and quoting either alone tells the reader nothing about what they are
 * looking at. What matters is the ratio of the two SPEEDS AS DRAWN: the front
 * crosses the plate at (X_C1−X_C0)/FRONT_RUN card units per second, and a
 * carrier's peak speed is CAR_AMP·2π·F_SCREEN. The label states that number
 * beside the true 7.8 × 10¹¹ : 1, so nobody mistakes the picture for the
 * physics — which is the whole of the ban on racing dots.
 */
const SEEN_FRONT = (X_C1 - X_C0) / FRONT_RUN;
const SEEN_CARR  = CAR_AMP * DSP.TAU * F_SCREEN;
const SEEN_RATIO = SEEN_FRONT / SEEN_CARR;           // ≈ 5.6 : 1

/** Non-breaking spaces throughout: a label that wraps between "2.55 ×" and
 *  "10⁻⁴" has split a single number across two lines. */
const exp10 = (v, d = 1) => {
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  const S = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return `${m.toFixed(d)} × 10${String(e).split('').map((c) => S[c]).join('')}`;
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
    const needleShadows = [a.getObjectByName('needleShadow'), b.getObjectByName('needleShadow')];
    // above the chassis's front-right corner, so the label sits on empty
    // backdrop between the amp and the explanation panel
    const metAnchor = new THREE.Object3D();
    metAnchor.position.set(0.150, 0.455, 0.205);
    a.add(metAnchor);

    const S = buildOverlay(ctx);
    S.needles = needles;
    S.needleShadows = needleShadows;
    S.deflect = [0.5, 0.5];
    this._s = S;
    this._live = { v: 0, i: 0, p: 0, pd: P_QUIES, mean: 0, dc: P_QUIES, m: 0 };

    const L = ctx.labels;
    const P = S.P;
    // Labels that sit ON the card take `plain`: the plate is already a scrim, so
    // the default one is a second dark box over a dark box — and its
    // backdrop-filter smears a soft halo onto the render around every corner.
    // `plain` keeps the accent colour and drops the box.
    // `.k` wraps past 34 characters and `.t` past 30, so anything longer than
    // that silently becomes a four-line block sitting on the artwork. Every
    // kicker and body line below is inside those limits; the long numbers live
    // in `.v`, which never wraps.
    S.L = {
      meter: L.add(metAnchor, {
        kicker: 'Meter · 180 ms ballistic', cls: 'acc', priority: 4, offset: [30, -24],
        text: `log, ${MET_DB} dB to ${MET_FS} W into 8 Ω`, value: '—',
      }),
      cable: L.add(anchor(P, 0.50, Y_HOT), {
        kicker: `Inside the cable · ±${(X_DRIFT * 1e9).toFixed(1)} nm`,
        cls: 'plain am', priority: 4, occlude: false, offset: [0, -52],
        // explicit break: left to itself the line wraps after "field" and
        // orphans the exponent onto the second line
        text: `drift ${exp10(V_DRIFT, 2)} m/s<br>field ${exp10(V_FIELD, 2)} m/s`,
        value: `true ${exp10(SPEED_RAT)} : 1, drawn ${SEEN_RATIO.toFixed(1)} : 1`,
      }),
      ret: L.add(anchor(P, 0.50, Y_DIM), {
        kicker: `Return path · ${(R_CABLE * 1000).toFixed(1)} mΩ loop`,
        cls: 'plain', priority: 3, occlude: false, offset: [0, 24],
        text: '',
        value: `damping R ${RD_AMP.toFixed(2)} → ${RD_DRV.toFixed(2)} Ω (+${(DAMP_PEN * 100).toFixed(2)} %),`
          + ` not ${DF_TERM.toFixed(0)} → ${DF_DRIVE.toFixed(0)}`,
      }),
      // Above the plot, not in it. Two traces share these axes, so the key
      // belongs here: without it a reader cannot tell which curve is the heat
      // and which is the power delivered.
      // Centred in the 53 px of clear card between the rule and the top of the
      // plot. `.k` is capped at 34ch and carries 0.13em of letter-spacing, so a
      // kicker wraps past about 27 characters however short it looks.
      diss: L.add(anchor(P, G_X + G_W * 0.58, 0.434), {
        kicker: 'Watts vs swing V̂/V rail', cls: 'plain am', priority: 3, occlude: false, offset: [0, 0],
        text: '<b style="color:#f0b35a">amber</b> heat · <b style="color:#5cc0f2">cyan</b> into 8 Ω',
        value: `peak ${P_D_PEAK.toFixed(0)} W at m = ${M_PEAK.toFixed(2)}`,
      }),
    };

    // park the needles somewhere plausible before the stage is ever visited
    for (const n of needles.concat(needleShadows)) n.rotation.z = MET_SWEEP - 2 * MET_SWEEP * meterFrac(6);
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
      const az = MET_SWEEP - 2 * MET_SWEEP * S.deflect[n];
      S.needles[n].rotation.z = az;
      S.needleShadows[n].rotation.z = az;
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
    S.L.diss.setValue(`peak ${P_D_PEAK.toFixed(0)} W at m = ${M_PEAK.toFixed(2)}`
      + ` · now ${(pd / (2 * NPAIR)).toFixed(0)} W/device`);

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
    S.fieldFill.material.opacity = 0.055 * fade * ctx.stage.reveal;
    S.fieldComb.setProgress(DSP.clamp(u, 0.001, 1));
    S.fieldComb._baseOpacity = 0.52 * fade;
  },

  content() {
    return `
<div class="key"><span class="lab">The idea</span><p>The input carries almost no energy. The monoblock uses it to <b>modulate a current drawn from the supply</b> — a loop: out of the red terminal, back through the black.</p></div>

<h3>300 W into 8 Ω, and the heat</h3>
<div class="eq">V<sub>rms</sub> = √(300 × 8) = ${V_RMS.toFixed(1)} V → V<sub>pk</sub> <span class="hl">${V_PK.toFixed(1)} V</span>
I<sub>pk</sub> = <span class="hl">${I_PK.toFixed(2)} A</span>;  mean rail draw I<sub>pk</sub>/π = ${I_DC_FULL.toFixed(2)} A
±${RAIL} V rails → ${HEADROOM.toFixed(1)} V headroom, ${V_RIPPLE.toFixed(2)} V ripple</div>
<p>Oliver's condition puts one thermal voltage, <span class="num">${(VT * 1000).toFixed(2)} mV</span>, across each <span class="num">${RE} Ω</span> emitter resistor: <span class="num">${(IQ * 1000).toFixed(0)} mA</span> per device, <span class="num">${P_QUIES.toFixed(1)} W</span> burnt idle. Heat peaks well short of full power — <span class="num">${P_D_PEAK.toFixed(0)} W</span>, <span class="num">${(P_D_PEAK / (2 * NPAIR)).toFixed(0)} W</span> per device, at <span class="num">m = ${M_PEAK.toFixed(2)}</span>, where the loudspeaker takes <span class="num">${P_AT_PEAK.toFixed(0)} W</span>.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>That is the resistive worst case. A reactive load — 4 Ω at 60° — roughly doubles V<sub>ce</sub>·I<sub>c</sub> in the conducting device. Hence the safe-operating-area limiter.</p></div>`;
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
