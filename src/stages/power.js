import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { MAINS, AMP, SPEAKER, CABLE } from '../core/spec.js';

/* ===========================================================================
   MAINS & CONDITIONING
   ---------------------------------------------------------------------------
   Primaries come from src/core/spec.js and are never re-declared here. Anything
   this stage needs that spec.js does not carry is derived below from what it
   does, and the derivation is written down.
   =========================================================================== */

const TAU = DSP.TAU;

// ---- supply -----------------------------------------------------------------
// The operating point is the one the whole piece runs: BOTH monoblocks at full
// output into the 8 Ω load that is actually connected (AMP.pOut8), class AB at
// AMP.effAB wall-plug efficiency. Quoting the 4 Ω rating for a mains draw while
// running an 8 Ω load doubles the answer and is the classic cheat.
const F_MAINS = MAINS.f;                             // 50 Hz
const V_RMS = MAINS.vRms;                            // 230 V
const V_PK = MAINS.vPk;                              // 325.27 V
// LOCAL CHOICE, not a spec primary: everything upstream of the power amps —
// turntable, phono, streamer, DAC, preamp, crossover and this conditioner —
// budgeted at 100 W total.
const P_FRONT = 100;
const P_SYS = (2 * AMP.pOut8) / AMP.effAB + P_FRONT; // 1190.9 W
// STATED PREMISE: unity power factor. I_RMS = P/V only holds when the current
// is in phase with the voltage AND sinusoidal. A capacitor-input supply is
// neither — it conducts in short peaks near the crest at a power factor around
// PF_REAL, so its real rms line current is 1/PF_REAL times this and its crest
// factor is far higher. The drawing here is the unity-PF sinusoid, so the
// arithmetic on screen is the unity-PF arithmetic, and the panel says so.
const PF_REAL = 0.62;                                // CHOSEN: typical capacitor-input
const I_RMS = P_SYS / V_RMS;                         // 5.1779 A rms at PF = 1
const I_RMS_REAL = I_RMS / PF_REAL;                  // 8.351 A rms at PF = 0.62
const I_PK = I_RMS * Math.SQRT2;                     // 7.3227 A
const VA = V_RMS * I_RMS;                            // 1190.9 VA

// ---- copper -----------------------------------------------------------------
const RHO_CU = CABLE.rhoCu;                          // 1.724e-8 Ω·m at 20 °C
const SIGMA_CU = 1 / RHO_CU;                         // 5.8005e7 S/m

// ---- the lead: 3 × 2.5 mm² H05VV-F, cores laid up on a filler ---------------
const A_MM2 = MAINS.cableAreaMm2;                    // 2.5 mm²
const R_COND = Math.sqrt(A_MM2 / Math.PI) * 1e-3;    // 8.9206e-4 m
const D_COND = 2 * R_COND;                           // 1.7841 mm
const T_INS = 0.80e-3;                               // m, insulation wall
const R_INS_R = R_COND + T_INS;                      // 1.6921 mm
const PITCH_CORE = 3.90e-3;                          // m, lay-up triangle side
const T_SHEATH = 1.60e-3;                            // m, filler + sheath
const LEAD_OD = 2 * (PITCH_CORE / Math.sqrt(3) + R_INS_R + T_SHEATH); // 11.09 mm

// ---- carriers ---------------------------------------------------------------
const V_DRIFT_PK = DSP.driftVelocity(I_PK, A_MM2);   // 2.1525e-4 m/s
const X_DRIFT_PK = DSP.driftDisplacement(V_DRIFT_PK, F_MAINS); // 6.8517e-7 m

// Sommerfeld free-electron gas in copper. The classical equipartition figure
// √(3kT/m) = 1.15e5 m/s is in most textbooks and is wrong for a metal: the gas
// is degenerate, so the relevant speed is the Fermi velocity.
const HBAR = 1.054571817e-34;                        // J·s
const M_E = 9.1093837015e-31;                        // kg
const K_F = Math.cbrt(3 * Math.PI * Math.PI * DSP.N_CU);   // 1.3596e10 m⁻¹
const V_FERMI = (HBAR * K_F) / M_E;                  // 1.5739e6 m/s  (E_F = 7.05 eV)
const TAU_COLL = (M_E * SIGMA_CU) / (DSP.N_CU * DSP.E_CHARGE ** 2); // 2.423e-14 s
const MFP = V_FERMI * TAU_COLL;                      // 3.814e-8 m  (38 nm)
const D_DIFF = (V_FERMI * MFP) / 3;                  // 0.0200 m²/s
const X_THERMAL = Math.sqrt((2 * D_DIFF) / F_MAINS); // 0.0283 m rms in one period

// ---- field ------------------------------------------------------------------
const V_FIELD = MAINS.vField;                        // 1.9786e8 m/s  (0.66 c)
const SPEED_RATIO = V_FIELD / V_DRIFT_PK;            // 9.19e11

// ---- drawing scales — every one of these is printed on screen ---------------
const MAG = 7;                                       // ×, the copper and its jacket
const MAG_DRIFT = 21000;                             // ×, carrier displacement only
const MAG_EXTRA = MAG_DRIFT / MAG;                   // ×3000 on the copper's own scale
const FIELD_SLOW = 4.5e7;                            // field clock ÷ this, vs sim time
const TIME_SCALE = 0.02;                             // sim s per real s → 1 : 50
const FIELD_TOTAL_SLOW = FIELD_SLOW / TIME_SCALE;    // 1 : 2.25×10⁹ vs real time

// What the eye actually reads, in card metres per REAL second. Both
// exaggerations collapse into these two numbers, so their ratio is quotable.
const SEEN_DRIFT = V_DRIFT_PK * MAG_DRIFT * TIME_SCALE;          // 0.0904 m/s
const SEEN_FIELD = (V_FIELD * MAG * TIME_SCALE) / FIELD_SLOW;    // 0.6155 m/s
const SEEN_RATIO = SEEN_FIELD / SEEN_DRIFT;                      // ×6.8

const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUPS[c] || c).join('');
function sci(v, d = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(d)}×10${sup(e)}`;
}
const CYS = '#5cc0f2', AMS = '#f0b35a', RDS = '#f2795c';

// ---------------------------------------------------------------------------
// THE MOVEMENTS
// ---------------------------------------------------------------------------
// Two centre-zero moving-coil instruments: line volts and line current, each
// reading the INSTANT. A real movement cannot follow 50 Hz — but the whole
// scene runs at TIME_SCALE, so one mains cycle takes a second on screen, which
// is comfortably inside a meter's ballistics. That is stated on the fascia
// label rather than left as a fudge.
const MW = 0.0955, MH = 0.0645;      // one window
const SWEEP = 1.05;                  // rad, half sweep (60°)
const PIVOT_DY = 0.0300;             // m below the window centre — inside the glass
const R_TICK = 0.0470, R_NUM = 0.0375, R_BAND = 0.0497;
const NEEDLE_L = 0.0435, HUB_R = 0.0034;
const FSD_V = 400, FSD_A = 10;       // full-scale deflection of the two movements
const RED_FRAC = 0.85;               // the over-range band starts here
const FRAC_V = V_PK / FSD_V;         // 0.8132 of f.s.d. at the crest
const FRAC_A = I_PK / FSD_A;         // 0.7323

// ---------------------------------------------------------------------------
// small local helpers
// ---------------------------------------------------------------------------

/** Seed fadeTree's opacity bookkeeping so cards and dimensions survive fading. */
function preFade(root, op) {
  root.traverse((c) => {
    if ((c.isMesh || c.isSprite || c.isLine || c.isPoints) && c.userData._baseOp === undefined) {
      c.userData._baseOp = op !== undefined ? op : (c.material?.opacity ?? 1);
    }
  });
  return root;
}

function card(w, h, opacity = 1.0) {
  const g = DIAG.diagramCard(w, h, { opacity, pad: 0.018 });
  g.userData.plate.userData._baseOp = opacity;
  return g;
}

function poly(pts, color, width = 1.4, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => pts[i]);
  return t;
}

/** Flat arrowhead in the card plane, pointing along +X. */
function arrowHead(size, color, op = 1) {
  const s = new THREE.Shape();
  s.moveTo(size, 0); s.lineTo(-size * 0.60, size * 0.54); s.lineTo(-size * 0.60, -size * 0.54); s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({
    color, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.renderOrder = 15;
  m.userData._baseOp = op;
  return m;
}

let _bandTex = null;
function bandTexture() {
  if (_bandTex) return _bandTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 4;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.46, 'rgba(255,255,255,0.20)');
  grd.addColorStop(0.80, 'rgba(255,255,255,1)');
  grd.addColorStop(0.91, 'rgba(255,255,255,0.42)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 4);
  _bandTex = new THREE.CanvasTexture(c);
  _bandTex.colorSpace = THREE.SRGBColorSpace;
  return _bandTex;
}

/** A soft-edged rectangle in alpha — the card's drop shadow. */
let _softTex = null;
function softRectTex() {
  if (_softTex) return _softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.filter = 'blur(17px)';
  g.fillStyle = '#ffffff';
  g.fillRect(26, 26, 76, 76);
  _softTex = new THREE.CanvasTexture(c);
  return _softTex;
}

function bandPlane(w, h, color, op) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    map: bandTexture(), color, transparent: true, opacity: op, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  }));
  m.renderOrder = 16;
  m.userData._baseOp = op;
  return m;
}

/**
 * A shallow convex panel. A flat plane returns one mirror image of a studio
 * source and clips; a slight bulge sweeps that image across the panel as a soft
 * band, which is what a real cover glass or a lacquered fascia does.
 */
function convexPanel(w, h, bulge, su = 30, sv = 12) {
  const g = new THREE.PlaneGeometry(w, h, su, sv);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getY(i) / (h / 2);
    p.setZ(i, bulge * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * THE SPECULAR LAYER — a reflection of the room, ADDED over whatever is behind.
 *
 * The obvious construction (a dark dielectric at low opacity) does not work:
 * `opacity` on a MeshPhysicalMaterial scales the whole shaded result, specular
 * included, and a dielectric returns only F0 ≈ 4 % of what it reflects, which
 * tone-maps to nothing. Driven as a TINTED METAL under additive blending the
 * whole environment comes back scaled by the tint — the dark room adds nothing
 * and the wide front strip adds a real band with a rolloff. Roughness sets the
 * band's width: mirror-smooth is a needle that misses the source altogether.
 * It must also be a clone of a library material, because applyEnv() only walks
 * the shared library and an ad-hoc material reflects an empty scene.
 */
function specLayer(M, tint, rough, envI) {
  const m = M.chrome.clone();
  m.color.setHex(tint);
  m.metalness = 1.0;
  m.roughness = rough;
  m.envMapIntensity = envI;
  m.transparent = true;
  m.opacity = 1;
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending;
  return m;
}

/** Rounded rectangle as a Shape or a Path (for holes). */
function roundRect(w, h, r, cx = 0, cy = 0, Ctor = THREE.Shape) {
  const s = new Ctor();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// ===========================================================================
// THE METER DIAL — silkscreen on a backlit face, drawn once into a canvas
// ===========================================================================
// The old face was a pale blue gradient with unlabelled ticks and a white stick
// for a pointer, which is clip art. A McIntosh blue meter is a deep cobalt
// field with the SCALE printed on it in cream: the printing is the brightest
// thing in the window, never the field, and the brightest thing of all is the
// reflection in the glass on top.

const DIAL_SPEC = {
  volts: {
    fsd: FSD_V, minor: 25, mid: 100, major: 200,
    legend: 'A.C. LINE VOLTS', sub: 'INSTANTANEOUS · ± 400 f.s.d.',
    footL: '50 Hz', footR: `${V_RMS} V rms`,
  },
  amps: {
    fsd: FSD_A, minor: 1, mid: 5, major: 5,
    legend: 'LINE CURRENT', sub: 'AMPERES · ± 10 f.s.d.',
    footL: '50 Hz', footR: `${I_RMS.toFixed(2)} A rms`,
  },
};

const _dialTex = {};
function dialTexture(kind, renderer) {
  if (_dialTex[kind]) return _dialTex[kind];
  const S = DIAL_SPEC[kind];
  const W = 1536, H = Math.round((W * MH) / MW);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const F = 'ui-sans-serif, -apple-system, Helvetica, Arial';

  // Backlit face: the lamp is behind the bottom edge, so the field is brightest
  // low and centre and falls into the top corners.
  const bg = g.createRadialGradient(W / 2, H * 1.00, 40, W / 2, H * 0.88, W * 0.80);
  bg.addColorStop(0.00, '#215b7d');
  bg.addColorStop(0.26, '#154466');
  bg.addColorStop(0.62, '#0a2c48');
  bg.addColorStop(1.00, '#051425');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const vg = g.createLinearGradient(0, 0, 0, H * 0.64);
  vg.addColorStop(0, 'rgba(3,12,24,0.50)');
  vg.addColorStop(1, 'rgba(3,12,24,0.00)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  const PX = W / MW;                              // canvas pixels per metre
  const cx = W / 2, cy = H / 2 + PIVOT_DY * PX;   // the pivot, in canvas pixels
  const rT = R_TICK * PX, rN = R_NUM * PX, rB = R_BAND * PX;
  const cream = (a) => `rgba(226,235,243,${a})`;
  const ang = (v) => (v / S.fsd) * SWEEP;
  const at = (a, r) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];

  // over-range band, printed outside the ticks where a real one lives
  g.lineCap = 'butt';
  g.strokeStyle = '#c04a34';
  g.lineWidth = 0.0028 * PX;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx, cy, rB, -Math.PI / 2 + s * RED_FRAC * SWEEP, -Math.PI / 2 + s * SWEEP, s < 0);
    g.stroke();
  }

  // the scale arc
  g.strokeStyle = cream(0.46);
  g.lineWidth = 0.00030 * PX;
  g.beginPath(); g.arc(cx, cy, rT, -Math.PI / 2 - SWEEP, -Math.PI / 2 + SWEEP); g.stroke();

  // ticks in three lengths: minor, mid, major
  const near = (v, m) => Math.abs(v / m - Math.round(v / m)) < 1e-6;
  for (let i = 0; i * S.minor <= 2 * S.fsd + 1e-9; i++) {
    const v = -S.fsd + i * S.minor;
    const maj = near(v, S.major), mid = !maj && near(v, S.mid);
    const len = (maj ? 0.0062 : mid ? 0.0042 : 0.0025) * PX;
    g.strokeStyle = cream(maj ? 0.97 : mid ? 0.84 : 0.60);
    g.lineWidth = (maj ? 0.00058 : mid ? 0.00042 : 0.00030) * PX;
    const a = ang(v);
    const p0 = at(a, rT), p1 = at(a, rT - len);
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
  }

  // numerals. A centre-zero movement prints magnitudes on both wings.
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = cream(0.97);
  g.font = `600 ${Math.round(0.0042 * PX)}px ${F}`;
  for (let v = -S.fsd; v <= S.fsd + 1e-9; v += S.major) {
    const a = ang(v);
    const [x, y] = at(a, rN);
    g.save(); g.translate(x, y); g.rotate(a * 0.55);
    g.fillText(String(Math.abs(Math.round(v))), 0, 0);
    g.restore();
  }

  // legends
  g.letterSpacing = `${Math.round(0.00070 * PX)}px`;
  g.font = `700 ${Math.round(0.0034 * PX)}px ${F}`;
  g.fillStyle = cream(0.93);
  g.fillText(S.legend, cx, H * 0.100);
  g.letterSpacing = `${Math.round(0.00030 * PX)}px`;
  g.font = `600 ${Math.round(0.0022 * PX)}px ${F}`;
  g.fillStyle = cream(0.62);
  g.fillText(S.sub, cx, H * 0.190);
  g.letterSpacing = '0px';
  g.font = `600 ${Math.round(0.0020 * PX)}px ${F}`;
  g.fillStyle = cream(0.52);
  g.fillText(S.footL, W * 0.135, H * 0.905);
  g.fillText(S.footR, W * 0.865, H * 0.905);

  // the printed boss the pointer pivots out of
  const bs = g.createRadialGradient(cx, cy, 4, cx, cy, HUB_R * PX * 2.6);
  bs.addColorStop(0, 'rgba(3,12,22,0.85)');
  bs.addColorStop(1, 'rgba(3,12,22,0.00)');
  g.fillStyle = bs;
  g.beginPath(); g.arc(cx, cy, HUB_R * PX * 2.6, 0, Math.PI * 2); g.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  t.needsUpdate = true;
  _dialTex[kind] = t;
  return t;
}

/** The pointer blade: wide where it leaves the boss, fine at the tip. */
function bladeGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.00110, -0.0062);
  s.lineTo(0.00110, -0.0062);
  s.lineTo(0.00090, 0.0060);
  s.lineTo(0.00034, NEEDLE_L);
  s.lineTo(-0.00034, NEEDLE_L);
  s.lineTo(-0.00090, 0.0060);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/**
 * One centre-zero movement. Backlit silkscreened face, a counterweighted ivory
 * pointer with a shadow cast onto the dial, and a peak-hold index in each wing.
 */
function meterUnit(M, kind, renderer, renderer2) {
  const grp = new THREE.Group();

  const dial = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({
    map: dialTexture(kind, renderer), toneMapped: false,
  }));
  dial.castShadow = dial.receiveShadow = false;
  grp.add(dial);

  // peak-hold: a fine amber index parked at the crest the pointer reached, one
  // in each wing. It rides in the over-range ring, so it never fouls the scale.
  const pkMat = new THREE.MeshBasicMaterial({
    color: PAL.am, toneMapped: false, transparent: true, opacity: 0.90, depthWrite: false,
  });
  const peaks = [];
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Group();
    p.position.set(0, -PIVOT_DY, 0.0004);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.0013, 0.0040), pkMat);
    bar.position.y = R_BAND;
    p.add(bar);
    grp.add(p);
    peaks.push(p);
  }

  // The shadow is a second blade in the dial plane, displaced by a constant
  // vector — the lamp is behind, the room light is in front and above, so the
  // pointer throws a soft offset copy of itself onto the face.
  const shadow = new THREE.Group();
  shadow.position.set(0.0010, -PIVOT_DY - 0.0012, 0.0007);
  const shMesh = new THREE.Mesh(bladeGeo(), new THREE.MeshBasicMaterial({
    color: 0x061626, toneMapped: false, transparent: true, opacity: 0.26, depthWrite: false,
  }));
  shadow.add(shMesh);
  grp.add(shadow);

  const pivot = new THREE.Group();
  pivot.position.set(0, -PIVOT_DY, 0.0012);
  const blade = new THREE.Mesh(bladeGeo(), new THREE.MeshBasicMaterial({
    color: 0xf2ecd9, toneMapped: false,
  }));
  pivot.add(blade);
  grp.add(pivot);

  // the boss, in front of the blade root: the pivot of a real movement
  const hub = new THREE.Mesh(new THREE.CircleGeometry(HUB_R, 24), new THREE.MeshBasicMaterial({
    color: 0x0c2233, toneMapped: false,
  }));
  hub.position.set(0, -PIVOT_DY, 0.0016);
  grp.add(hub);
  const hubRing = new THREE.Mesh(new THREE.RingGeometry(HUB_R * 0.94, HUB_R * 1.12, 28),
    new THREE.MeshBasicMaterial({ color: 0x9fb3c2, toneMapped: false, transparent: true, opacity: 0.55 }));
  hubRing.position.set(0, -PIVOT_DY, 0.0017);
  grp.add(hubRing);

  grp.userData = { pivot, shadow, peaks };
  return grp;
}

// ===========================================================================
// HARDWARE — the conditioner, rack bay 0
// ===========================================================================

const CW = LAYOUT.rack.w - 0.03;     // 0.555
const CD = LAYOUT.rack.d - 0.06;     // 0.440
const CHt = 0.115;                   // total height incl. feet (bay 0 max 0.150)
const FT = 0.016;                    // fascia thickness
const TOPT = 0.006;                  // top plate thickness
const FOOT = 0.010;

const M_CX = 0.056, M_CY = 0.000;          // the meter pair's centre on the fascia
const M_GAP = 0.0060;                      // the divider between the windows
const BEZ_W = 2 * MW + M_GAP + 0.0180;     // 0.2150
const BEZ_H = MH + 0.0160;                 // 0.0805
const M_DX = (MW + M_GAP) / 2;             // 0.05075

/**
 * Variants tuned for this chassis. After the studio emitters were widened and
 * dimmed, a 58 mm brushed cheek at roughness 0.26 returns the whole strip as a
 * clipped white slab and a 2 mm lid inlay returns a clipped white line. Both
 * are satin here, not polished: the section has to stay inside the grey ramp.
 */
function powerMetals() {
  const M = mats();
  const mk = (src, o) => { const m = src.clone(); Object.assign(m, o); return m; };
  return {
    fascia: mk(M.alu, { roughness: 0.32, envMapIntensity: 0.86, anisotropy: 0.45 }),
    // A 58 mm cheek is still narrower than the reflected image of the front
    // strip, so even at 0.375 it returned the whole slab clipped to white.
    cheek: mk(M.aluV, { color: new THREE.Color(0x8e9298), roughness: 0.485, envMapIntensity: 0.42 }),
    inlay: mk(M.anodGrey, { roughness: 0.52, envMapIntensity: 0.50 }),
    bezel: mk(M.alu, { color: new THREE.Color(0xb4b9bf), roughness: 0.265, envMapIntensity: 0.78, anisotropy: 0 }),
    knob: mk(M.alu, { roughness: 0.415, envMapIntensity: 0.62, anisotropy: 0.30 }),
  };
}

function ventedTop(w, d, holes) {
  const s = new THREE.Shape();
  const r = 0.005, hw = w / 2, hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd); s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - r); s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hd); s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + r); s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  for (const [cx, cy, ww, hh] of holes) s.holes.push(roundRect(ww, hh, 0.004, cx, cy, THREE.Path));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: TOPT, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2, curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

function toroid(M) {
  const g = new THREE.Group();
  const R = 0.070, r = 0.026;
  const wind = new THREE.Mesh(new THREE.TorusGeometry(R, r, 16, 64), M.magnetWire);
  wind.rotation.x = -Math.PI / 2;
  wind.castShadow = wind.receiveShadow = true;
  g.add(wind);
  const sec = new THREE.Mesh(new THREE.TorusGeometry(R, r * 1.06, 10, 56), M.copper);
  sec.rotation.x = -Math.PI / 2;
  sec.scale.set(1, 1, 0.42);
  g.add(sec);
  const dish = new THREE.Mesh(GEO.bevelCyl(0.036, 0.040, 0.007, 36, 0.0008), M.steel);
  dish.position.y = r * 0.62;
  dish.castShadow = true;
  g.add(dish);
  const bolt = new THREE.Mesh(GEO.bevelCyl(0.0075, 0.0075, 0.012, 18, 0.0006), M.steel);
  bolt.position.y = r * 0.62 + 0.008;
  g.add(bolt);
  const base = new THREE.Mesh(GEO.bevelCyl(0.050, 0.050, 0.004, 36, 0.0008), M.anodGrey);
  base.position.y = -r * 0.72;
  g.add(base);
  return g;
}

function buildConditioner(renderer) {
  const M = mats();
  const A = powerMetals();
  const g = new THREE.Group();
  g.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(0, CHt), LAYOUT.rack.z);

  const bodyH = CHt - FOOT;
  const yBody = -CHt / 2 + FOOT + bodyH / 2;
  const yTopFace = CHt / 2;

  const tub = new THREE.Mesh(GEO.bevelBox(CW, bodyH - TOPT, CD - FT, 0.0026, 4), M.anodBlack);
  tub.position.set(0, yBody - TOPT / 2, -FT / 2);
  tub.castShadow = tub.receiveShadow = true;
  g.add(tub);

  const holeA = [-0.095, -0.020, 0.185, 0.185];
  const holeB = [0.135, -0.020, 0.105, 0.150];
  const top = new THREE.Mesh(ventedTop(CW, CD - FT, [holeA, holeB]), M.anodBlack);
  top.position.set(0, yTopFace - TOPT, -FT / 2);
  top.castShadow = top.receiveShadow = true;
  g.add(top);

  // the slats over both apertures, in ONE instanced mesh
  {
    const slats = [];
    for (const [cx, cz, w, d] of [holeA, holeB]) {
      const n = Math.max(4, Math.round(d / 0.026));
      for (let i = 0; i < n; i++) slats.push([cx, cz - d / 2 + (d / n) * (i + 0.5), w - 0.004]);
    }
    const im = new THREE.InstancedMesh(GEO.bevelBox(1, 0.0035, 0.0055, 0.0008, 2), M.anodGrey, slats.length);
    const m4 = new THREE.Matrix4();
    slats.forEach(([x, z, w], i) => {
      m4.makeScale(w, 1, 1);
      m4.setPosition(x, yTopFace - TOPT / 2, z - FT / 2);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true;
    g.add(im);
  }

  // brushed inlay along the top front edge — a second material on the lid, but
  // satin: at 0.26 roughness this 2 mm strip clipped to white across the frame
  const inlay = new THREE.Mesh(GEO.bevelBox(CW - 0.09, 0.0022, 0.030, 0.0007, 2), A.inlay);
  inlay.position.set(0, yTopFace - TOPT + 0.0006, CD / 2 - FT - 0.030);
  inlay.castShadow = inlay.receiveShadow = true;
  g.add(inlay);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const s = GEO.screw(0.0014);
      s.rotation.x = 0;                              // lid screws face +Y
      s.position.set(sx * (CW / 2 - 0.014), yTopFace - TOPT + 0.0012, -0.140 + i * 0.088 - FT / 2);
      g.add(s);
    }
  }

  const tor = toroid(M);
  tor.position.set(holeA[0], yBody - 0.012, holeA[1] - FT / 2);
  g.add(tor);

  for (let i = 0; i < 2; i++) {
    const can = new THREE.Mesh(GEO.bevelCyl(0.019, 0.020, 0.052, 28, 0.0012), M.alu);
    can.position.set(holeB[0] - 0.024 + i * 0.048, yBody - 0.004, holeB[1] - FT / 2 + (i ? -0.030 : 0.030));
    can.castShadow = true;
    g.add(can);
    const cap = new THREE.Mesh(GEO.bevelCyl(0.017, 0.017, 0.002, 20, 0.0004), M.plastic);
    cap.position.set(can.position.x, can.position.y + 0.027, can.position.z);
    g.add(cap);
  }
  const board = new THREE.Mesh(GEO.bevelBox(0.30, 0.0018, 0.20, 0.0006, 2), M.pcb);
  board.position.set(0.06, yBody - 0.036, -0.02 - FT / 2);
  board.receiveShadow = true;
  g.add(board);

  // ---- fascia --------------------------------------------------------------
  const zF = CD / 2;
  const face = new THREE.Mesh(GEO.bevelBox(CW, CHt, FT, 0.0030, 5), A.fascia);
  face.position.set(0, 0, zF - FT / 2);
  face.castShadow = face.receiveShadow = true;
  g.add(face);

  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(GEO.bevelBox(0.058, CHt - 0.004, 0.011, 0.0022, 4), A.cheek);
    cheek.position.set(sx * (CW / 2 - 0.033), 0, zF + 0.005);
    cheek.castShadow = cheek.receiveShadow = true;
    g.add(cheek);
    GEO.screwRow(g, [[sx * (CW / 2 - 0.033), 0.036], [sx * (CW / 2 - 0.033), -0.036]], zF + 0.0108, 0.0019);
  }

  // The recessed centre panel is lacquered, not bead-blasted.
  const inset = new THREE.Mesh(GEO.bevelBox(0.418, CHt - 0.020, 0.004, 0.0012, 3), M.pianoBlack);
  inset.position.set(0, 0, zF - 0.0012);
  inset.receiveShadow = true;
  g.add(inset);
  // A LACQUERED PANEL IS NOT ONE FLAT VALUE. A shallow crown over the whole
  // inset sweeps the widened front strip across it as a broad soft band.
  const lacquer = new THREE.Mesh(convexPanel(0.414, CHt - 0.024, 0.0030, 34, 8),
    specLayer(M, 0x3d4653, 0.170, 1.55));
  lacquer.position.set(0, 0, zF + 0.0014);
  lacquer.renderOrder = 4;
  lacquer.castShadow = lacquer.receiveShadow = false;
  g.add(lacquer);

  // ---- the two movements ---------------------------------------------------
  // A black surround behind the aperture, so the bezel's cut lands on black.
  const surround = new THREE.Mesh(GEO.bevelBox(BEZ_W - 0.002, BEZ_H - 0.002, 0.003, 0.0010, 2), M.anodBlack);
  surround.position.set(M_CX, M_CY, zF + 0.0022);
  g.add(surround);

  const meters = [];
  [['volts', -1], ['amps', +1]].forEach(([kind, s]) => {
    const u = meterUnit(M, kind, renderer);
    u.position.set(M_CX + s * M_DX, M_CY, zF + 0.0042);
    g.add(u);
    meters.push({ ...u.userData, frac: kind === 'volts' ? FRAC_V : FRAC_A });
  });

  // the divider between the windows — behind the glass, not in front of it
  const div = new THREE.Mesh(GEO.bevelBox(M_GAP - 0.0006, MH + 0.001, 0.0030, 0.0008, 3), M.anodBlack);
  div.position.set(M_CX, M_CY, zF + 0.0050);
  g.add(div);

  // A machined bezel with a REAL aperture: a plate with two rounded cut-outs and
  // an extruded fillet, not a flat frame drawn over the top.
  {
    const sh = roundRect(BEZ_W, BEZ_H, 0.0055);
    for (const s of [-1, 1]) sh.holes.push(roundRect(MW - 0.0016, MH - 0.0016, 0.0038, s * M_DX, 0, THREE.Path));
    const geo = new THREE.ExtrudeGeometry(sh, {
      depth: 0.0075, bevelEnabled: true, bevelSize: 0.0009, bevelThickness: 0.0009, bevelSegments: 3, curveSegments: 6,
    });
    geo.translate(0, 0, -0.0075 / 2);
    const bez = new THREE.Mesh(geo, A.bezel);
    bez.position.set(M_CX, M_CY, zF + 0.0072);
    bez.castShadow = bez.receiveShadow = true;
    g.add(bez);
    GEO.screwRow(g, [[M_CX - BEZ_W / 2 + 0.0055, BEZ_H / 2 - 0.0052], [M_CX + BEZ_W / 2 - 0.0055, BEZ_H / 2 - 0.0052],
      [M_CX - BEZ_W / 2 + 0.0055, -BEZ_H / 2 + 0.0052], [M_CX + BEZ_W / 2 - 0.0055, -BEZ_H / 2 + 0.0052]],
    zF + 0.0113, 0.0013);
  }

  // A faint smoked tint, then THE SPECULAR LAYER: a slightly convex cover glass
  // whose only contribution is a reflection of the room, added over the emissive
  // behind it. Without one a lit meter is a decal, not something under glass.
  const tint = new THREE.Mesh(convexPanel(BEZ_W - 0.0165, BEZ_H - 0.0165, 0.0042, 16, 8),
    new THREE.MeshBasicMaterial({
      color: 0x060b12, transparent: true, opacity: 0.17, depthWrite: false, toneMapped: false,
    }));
  tint.position.set(M_CX, M_CY, zF + 0.0064);
  tint.renderOrder = 6;
  tint.castShadow = tint.receiveShadow = false;
  g.add(tint);
  const cover = new THREE.Mesh(convexPanel(BEZ_W - 0.0165, BEZ_H - 0.0165, 0.0042),
    specLayer(M, 0x515e6e, 0.070, 2.15));
  cover.position.set(M_CX, M_CY, zF + 0.0068);
  cover.renderOrder = 7;
  cover.castShadow = cover.receiveShadow = false;
  g.add(cover);

  // ---- left-hand controls --------------------------------------------------
  const kb = GEO.knob(0.0195, 0.015, { flutes: 56, body: A.knob, mark: A.bezel });
  kb.rotation.x = Math.PI / 2;
  kb.position.set(-0.170, 0.006, zF + 0.0055);
  GEO.shadowed(kb);
  g.add(kb);
  // the halo is a thin ring, not a blob: keep it under the bloom threshold and
  // let the ring's shape do the work
  const ringM = M.ledCyan.clone();
  ringM.color.multiplyScalar(0.70);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.0228, 0.0242, 60), ringM);
  halo.position.set(-0.170, 0.006, zF + 0.0016);
  g.add(halo);

  const plate = new THREE.Mesh(GEO.bevelBox(0.062, 0.0072, 0.0016, 0.0005, 2), A.bezel);
  plate.position.set(-0.170, -0.038, zF + 0.0012);
  g.add(plate);

  // one indicator per rear outlet, in the same 4 × 2 grid: detail that means
  // something is worth more than detail that is decoration. Both the pilots and
  // their bores are instanced — eight of each was sixteen draw calls.
  {
    const cols = [PAL.cy, PAL.cy, PAL.gr, PAL.cy, PAL.cy, PAL.am, PAL.cy, PAL.gr];
    const led = new THREE.InstancedMesh(new THREE.CircleGeometry(0.0016, 14),
      new THREE.MeshBasicMaterial({ toneMapped: false }), 8);
    const bore = new THREE.InstancedMesh(new THREE.RingGeometry(0.0018, 0.0029, 16), M.anodGrey, 8);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < 8; i++) {
      const x = -0.136 + (i % 4) * 0.0138, y = 0.011 - Math.floor(i / 4) * 0.0138;
      m4.makeTranslation(x, y, 0.0004); led.setMatrixAt(i, m4);
      m4.makeTranslation(x, y, 0.0001); bore.setMatrixAt(i, m4);
      led.setColorAt(i, col.setHex(cols[i]).multiplyScalar(0.92));
    }
    led.position.z = zF + 0.0014; bore.position.z = zF + 0.0014;
    g.add(led, bore);
  }

  // mains rocker, right of the meters, balancing the knob
  {
    const sw = new THREE.Mesh(GEO.bevelBox(0.022, 0.012, 0.005, 0.0012, 3), M.plastic);
    sw.position.set(0.194, 0.000, zF + 0.0022);
    g.add(sw);
    const rk = new THREE.Mesh(GEO.bevelBox(0.017, 0.0085, 0.004, 0.0010, 3), M.anodGrey);
    rk.position.set(0.194, 0.0005, zF + 0.0048);
    rk.rotation.x = -0.24;
    rk.castShadow = true;
    g.add(rk);
  }
  GEO.screwRow(g, [[-0.240, 0.046], [0.240, 0.046], [-0.240, -0.046], [0.240, -0.046]], zF + 0.0018, 0.0016);

  // ---- rear panel ----------------------------------------------------------
  // Never in frame, so it is instanced down to a handful of calls rather than
  // built out of eight full connector groups.
  const zR = -CD / 2;
  const rearPlate = new THREE.Mesh(GEO.bevelBox(CW - 0.03, CHt - 0.018, 0.003, 0.001, 2), M.anodGrey);
  rearPlate.position.set(0, 0, zR + 0.0016);
  g.add(rearPlate);

  const inlet = GEO.iecInlet();
  inlet.rotation.y = Math.PI;
  inlet.position.set(0.207, 0.014, zR + 0.0005);
  GEO.shadowed(inlet);
  g.add(inlet);

  {
    const body = new THREE.InstancedMesh(GEO.bevelBox(0.0250, 0.0184, 0.006, 0.0008, 2), M.plastic, 8);
    const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0015, 0.0032, 0.0064), M.gold, 24);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      const x = -0.222 + (i % 4) * 0.070, y = 0.026 - Math.floor(i / 4) * 0.036;
      m4.makeTranslation(x, y, zR - 0.0025); body.setMatrixAt(i, m4);
      [[-0.0064, -0.0032], [0.0064, -0.0032], [0, 0.0041]].forEach(([dx, dy], k) => {
        m4.makeTranslation(x + dx, y + dy, zR - 0.0028);
        pins.setMatrixAt(i * 3 + k, m4);
      });
    }
    g.add(body, pins);
  }
  const post = GEO.bindingPost({ colour: 0x5f9e70 });
  post.rotation.y = Math.PI;
  post.position.set(0.150, -0.030, zR);
  g.add(post);

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.016, 0.019, FOOT, 24, 0.0012), M.steel);
    f.position.set(sx * (CW / 2 - 0.052), -CHt / 2 + FOOT / 2, sz * (CD / 2 - 0.062));
    f.castShadow = true;
    g.add(f);
  }
  g.add(GEO.contactShadow(CW * 1.5, CD * 1.5, 0.7, -CHt / 2 + 0.0008));

  g.userData.meters = meters;
  return g;
}

// ===========================================================================
// HARDWARE — the mains lead
// ===========================================================================
// Out of the IEC inlet, down the rack's right rear corner, then back along the
// floor to a wall plate. The route is drawn to the spec length rather than
// asserted: MAINS.cableLen is 2.00 m and the CatmullRom through these points
// measures 1.9967 m, which is the figure the arithmetic uses.

const LEAD_PTS = [
  [0.207, 0.1725, -3.522], [0.222, 0.1670, -3.575], [0.258, 0.1420, -3.625],
  [0.310, 0.0980, -3.662], [0.352, 0.0520, -3.678], [0.376, 0.0230, -3.672],
  [0.392, 0.0180, -3.700], [0.406, 0.0180, -3.790], [0.414, 0.0180, -3.906],
  [0.424, 0.0180, -4.070], [0.446, 0.0180, -4.292], [0.482, 0.0180, -4.552],
  [0.524, 0.0180, -4.832], [0.558, 0.0180, -5.100], [0.578, 0.0290, -5.268],
  [0.584, 0.0560, -5.342],
];

const LEAD_CURVE = new THREE.CatmullRomCurve3(LEAD_PTS.map((p) => new THREE.Vector3(...p)));
const L_LEAD = MAINS.cableLen;                       // 2.00 m, wall to conditioner
const R_LOOP = (RHO_CU * 2 * L_LEAD) / (A_MM2 * 1e-6); // 27.58 mΩ, out AND back
const V_DROP = I_RMS * R_LOOP;                       // 0.143 V
const P_LOSS = I_RMS * I_RMS * R_LOOP;               // 0.740 W

function buildLead() {
  const M = mats();
  const g = new THREE.Group();
  const curve = LEAD_CURVE;
  const jacket = M.rubber.clone();
  jacket.color.setHex(0x191b1f);
  jacket.roughness = 0.62;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, LEAD_OD / 2, 12, false), jacket);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);

  const body = new THREE.Mesh(GEO.bevelBox(0.030, 0.023, 0.040, 0.0025, 4), M.plastic);
  body.position.set(0.207, 0.1725, -3.542);
  body.castShadow = true;
  g.add(body);
  const collar = new THREE.Mesh(GEO.bevelBox(0.034, 0.027, 0.006, 0.0015, 3), M.anodGrey);
  collar.position.set(0.207, 0.1725, -3.524);
  g.add(collar);

  // a moulded strain relief and a cable clip: small parts sell the scale
  for (const t of [0.075, 0.34]) {
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const fr = new THREE.Mesh(GEO.bevelCyl(0.0072, 0.0072, 0.011, 18, 0.0008), M.anodGrey);
    fr.position.copy(p);
    fr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    fr.castShadow = true;
    g.add(fr);
  }

  // the wall plate the lead actually ends in — a cable that stops in mid-air
  // is the first thing that reads as unfinished
  const plate = new THREE.Mesh(GEO.bevelBox(0.086, 0.086, 0.010, 0.0022, 4), M.anodGrey);
  plate.position.set(0.584, 0.070, -5.372);
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  for (const sy of [0.030, -0.030]) {
    const s = GEO.screw(0.0018);
    s.rotation.x = Math.PI / 2;
    s.position.set(0.584, 0.070 + sy, -5.366);
    g.add(s);
  }

  // the floor run gets its own contact shadow, or it floats
  const sh = GEO.contactShadow(0.28, 1.70, 0.5, 0.0010);
  sh.position.set(0.470, 0, -4.42);
  g.add(sh);

  // Instantaneous power p(t) = VI(1 − cos 2ωt): real, 100 Hz, never negative.
  const sheathMat = new THREE.MeshBasicMaterial({
    color: PAL.am, transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.BackSide,
  });
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, LEAD_OD * 1.25, 8, false), sheathMat);
  sheath.renderOrder = 12;
  g.add(sheath);

  g.userData.curve = curve;
  g.userData.sheath = sheathMat;
  return g;
}

// ===========================================================================
// THE SHOT — hero the conditioner, and derive the card's place from the camera
// ===========================================================================
// Bay 0's centre is y = 0.1725. The framing radius is the chassis' HALF-HEIGHT
// plus a margin, not its bounding sphere — a bounding sphere is dominated by
// the 555 mm width and shrinks the chassis to a sliver. The target sits above
// the chassis so it lands in the lower third with the card clear above it, and
// the camera is far enough back that the whole conditioner, both cheeks and its
// shelf are inside the safe box with nothing crossing x < 160 or x > 1120.
// I disagree with the audit's prescribed `fill: 0.30`: the binding constraint
// here is WIDTH, not height. A 555 mm chassis seen at any useful azimuth
// subtends 0.62-0.65 m across, and the safe box is only 960 px wide, so the
// widest the shot can go is ≈ 0.40 fill. Below that the conditioner drops to
// 12 % of frame height and the picture becomes a photograph of an empty rack.
const FOV = 30;
const TGT = [0.00, 0.245, -3.30];
const SHOT = frameShot(TGT, 0.119, { fill: 0.405, az: 0.21, el: 0.165, fov: FOV });

const _camP = new THREE.Vector3(...SHOT.position);
const _fwd = new THREE.Vector3(...SHOT.target).sub(_camP).normalize();
const _right = new THREE.Vector3().crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize();
const _up = new THREE.Vector3().crossVectors(_right, _fwd).normalize();

// Card placement is expressed in SCREEN PIXELS at 1600 × 1000 and converted, because
// "above and camera-right of the hero, not across it" is a screen-space statement
// and world coordinates cannot express it. Nothing explanatory may overlap the
// conditioner's front panel, so the card lives entirely above it.
const CARD_D = 1.00;                                        // m in front of the lens
const CARD_PXM = 500 / (CARD_D * Math.tan((FOV * Math.PI) / 360));   // px per metre there
const CARD_SX = 168, CARD_SY = -206;                        // px from the camera axis
const CARD_K = 0.84;                                        // uniform scale
// A card square to the lens is always a decal; yaw it off the axis.
const CARD_YAW = -0.20;
const CARD_POS = _camP.clone()
  .addScaledVector(_fwd, CARD_D)
  .addScaledVector(_right, CARD_SX / CARD_PXM)
  .addScaledVector(_up, -CARD_SY / CARD_PXM);

// ===========================================================================
// OVERLAY — one card: the lead in longitudinal section
// ===========================================================================

const A_W = 0.250, A_H = 0.215;
const XS = 0.022, XA0 = 0.052, XA1 = 0.176, XLD = 0.206;
const R_CU = R_COND * MAG;                        // 0.0062444
const R_INS = R_INS_R * MAG;                      // 0.0118444
const PITCH = PITCH_CORE * MAG;                   // 0.0273
const Y_L = 0.170, Y_N = Y_L - PITCH, Y_E = Y_L - 2 * PITCH;   // 0.170 / 0.1427 / 0.1154
const Z_CORE = 0.004;
const N_CARR = 20;

function buildCableCard() {
  const root = new THREE.Group();
  root.position.copy(CARD_POS);
  root.lookAt(_camP);
  root.rotateY(CARD_YAW);
  root.scale.setScalar(CARD_K);
  const g = new THREE.Group();
  g.position.set(-A_W / 2, -A_H / 2, 0);
  root.add(g);

  // A square-cornered plate with a 1 px border reads as a pasted PNG. Giving it
  // a soft drop shadow onto the rack behind and a lit fillet along its top and
  // left edges gives it thickness and a relationship to the room's key light.
  const drop = new THREE.Mesh(new THREE.PlaneGeometry(A_W + 0.050, A_H + 0.050),
    new THREE.MeshBasicMaterial({
      map: softRectTex(), color: 0x000000, transparent: true, opacity: 0.30,
      depthWrite: false, toneMapped: false,
    }));
  drop.position.set(A_W / 2 + 0.007, A_H / 2 - 0.008, -0.006);
  drop.renderOrder = 1;
  drop.userData._baseOp = 0.30;
  g.add(drop);

  // A hair under opaque: a dead-black plate reads as a pasted PNG, and letting
  // 7 % of the rack through ties it to what it is standing in front of.
  g.add(card(A_W, A_H, 0.93));
  {
    const p = 0.018, x0 = -p, y0 = -p, W = A_W + p * 2, H = A_H + p * 2, z = 0.0006;
    g.add(poly([[x0, y0, z], [x0, y0 + H, z], [x0 + W, y0 + H, z]], 0x8b96a4, 1.5,
      { opacity: 0.42, renderOrder: 6 }));
    g.add(poly([[x0 + W, y0 + H, z], [x0 + W, y0, z], [x0, y0, z]], 0x1b2129, 1.5,
      { opacity: 0.75, renderOrder: 6 }));
  }

  const flat = (w, h, x, y, z, col, order, op = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      color: col, toneMapped: false, transparent: true, opacity: op, depthWrite: false,
    }));
    m.position.set(x, y, z);
    m.renderOrder = order;
    m.userData._baseOp = op;
    return m;
  };

  const len = XA1 - XA0;
  const xm = (XA0 + XA1) / 2;
  // The conductors are a diagram band, not a photograph of copper: amber at low
  // opacity with an amber hairline, so nothing on this card can out-shout the
  // lit hardware beside it.
  // NB these opacities are LINEAR and the buffer is written straight out, so a
  // 0.24 fill lands near 0.5 once encoded. 0.12 is what reads as a band.
  const cores = [
    { y: Y_L, sign: +1, col: PAL.am, fill: 0.13, edge: 0.80 },
    { y: Y_N, sign: -1, col: PAL.am, fill: 0.13, edge: 0.80 },
    { y: Y_E, sign: 0, col: PAL.gr, fill: 0.07, edge: 0.50 },
  ];

  for (const c of cores) {
    // the jacket: a lighter slab so each core reads as copper INSIDE insulation
    g.add(flat(len, 2 * R_INS, xm, c.y, Z_CORE - 0.0012, 0x1a222c, 5, 1));
    g.add(flat(len, 2 * R_CU, xm, c.y, Z_CORE, c.col, 7, c.fill));
    for (const dy of [R_CU, -R_CU]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], c.col, 1.2, { opacity: c.edge, renderOrder: 11 }));
    }
    for (const dy of [R_INS, -R_INS]) {
      g.add(poly([[XA0, c.y + dy, Z_CORE + 0.001], [XA1, c.y + dy, Z_CORE + 0.001]], 0x545c67, 0.9, { opacity: 0.55, renderOrder: 11 }));
    }
  }

  // ---- the closed loop, drawn unbroken ------------------------------------
  const ZL = Z_CORE + 0.004;
  const boxH = PITCH + 0.052;
  const yMid = (Y_L + Y_N) / 2;
  for (const [x, kind] of [[XS, 'socket'], [XLD, 'load']]) {
    const b = flat(0.034, boxH, x, yMid, Z_CORE - 0.002, 0x11161d, 6, 0.92);
    g.add(b);
    const hw = 0.017, hh = boxH / 2;
    g.add(poly([[x - hw, yMid - hh, ZL], [x + hw, yMid - hh, ZL], [x + hw, yMid + hh, ZL],
      [x - hw, yMid + hh, ZL], [x - hw, yMid - hh, ZL]], 0x4b545f, 1.0, { opacity: 0.85, renderOrder: 10 }));
    if (kind === 'socket') {
      // a mains outlet glyph: two live/neutral slots and an earth pin
      for (const dy of [0.013, -0.013]) {
        g.add(poly([[x - 0.008, yMid + dy, ZL], [x + 0.008, yMid + dy, ZL]], 0xc3ccd6, 3.4, { opacity: 0.9, renderOrder: 12 }));
      }
      g.add(poly([[x, yMid + 0.004, ZL], [x, yMid - 0.004, ZL]], PAL.gr, 3.2, { opacity: 0.85, renderOrder: 12 }));
    } else {
      // a resistor zig-zag: the load, whatever it is
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        pts.push([x + (i === 0 || i === 8 ? 0 : (i % 2 ? 0.008 : -0.008)), yMid + 0.020 - (0.040 * i) / 8, ZL]);
      }
      g.add(poly(pts, 0x9aa3ae, 1.4, { opacity: 0.8, renderOrder: 12 }));
    }
  }
  g.add(poly([[XS, Y_L, ZL], [XA0, Y_L, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA1, Y_L, ZL], [XLD, Y_L, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XA1, Y_N, ZL], [XLD, Y_N, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));
  g.add(poly([[XS, Y_N, ZL], [XA0, Y_N, ZL]], PAL.am, 1.8, { opacity: 0.9, renderOrder: 12 }));

  // earth: bonded at both ends, no return current
  const eOpt = { opacity: 0.65, renderOrder: 12, dashed: true, dashSize: 0.006, gapSize: 0.005 };
  g.add(poly([[XA1, Y_E, ZL], [XLD, Y_E, ZL], [XLD, yMid - boxH / 2 - 0.004, ZL]], PAL.gr, 1.3, eOpt));
  g.add(poly([[XA0, Y_E, ZL], [XS, Y_E, ZL], [XS, Y_E - 0.026, ZL]], PAL.gr, 1.3, eOpt));
  for (let i = 0; i < 3; i++) {
    const w = 0.022 - i * 0.007;
    g.add(poly([[XS - w / 2, Y_E - 0.026 - i * 0.006, ZL], [XS + w / 2, Y_E - 0.026 - i * 0.006, ZL]], PAL.gr, 1.4, { opacity: 0.75, renderOrder: 12 }));
  }

  // ---- current arrows: they reverse 100 times a second ---------------------
  const arrows = [];
  for (const c of cores) {
    if (c.sign === 0) continue;
    for (let i = 0; i < 3; i++) {
      const a = arrowHead(0.0052, PAL.am, 0.9);
      a.position.set(XA0 + len * (0.18 + i * 0.32), c.y, Z_CORE + 0.010);
      g.add(a);
      arrows.push({ m: a, sign: c.sign });
    }
  }

  // ---- E across the live–neutral gap; S = E × H, which does not reverse ----
  // The cores of a real 3-core flex all but touch: the dielectric gap is
  // 0.52 mm, so at ×MAG it is a seam, and it is drawn as one.
  const gapMid = yMid;
  const gapH = PITCH - 2 * R_INS;
  const eSeam = [], eHeads = [];
  for (let i = 0; i < 5; i++) {
    const x = XA0 + len * (0.12 + i * 0.19);
    const s = flat(0.020, gapH * 0.9, x, gapMid, Z_CORE + 0.006, PAL.cy, 13, 0.5);
    s.material.blending = THREE.AdditiveBlending;
    g.add(s); eSeam.push(s);
    const h = arrowHead(0.0050, PAL.cy, 0.8);
    h.position.set(x, gapMid, Z_CORE + 0.008);
    g.add(h); eHeads.push(h);
  }

  // ---- travelling energy front, in the dielectric only --------------------
  const frontGrp = new THREE.Group();
  // |S| is far larger between live and neutral than anywhere else, so the band
  // is weighted rather than uniform.
  const sHeads = [];
  for (const [y, h, wgt] of [[gapMid, PITCH * 0.55, 1.00], [(Y_N + Y_E) / 2, PITCH * 0.55, 0.42],
    [Y_L + R_INS + 0.013, 0.017, 0.28], [Y_E - R_INS - 0.013, 0.017, 0.28]]) {
    const b = bandPlane(0.062, h, PAL.am, 0.26 * wgt);
    b.position.set(0, y, Z_CORE + 0.012);
    b.userData.wgt = 0.26 * wgt;
    frontGrp.add(b);
    const e = poly([[0.021, y - h / 2, Z_CORE + 0.013], [0.021, y + h / 2, Z_CORE + 0.013]],
      PAL.am, 1.6, { opacity: 0.55 * wgt, renderOrder: 14 });
    frontGrp.add(e);
    if (wgt > 0.9) {
      const a = arrowHead(0.0068, PAL.am, 0.85);
      a.position.set(0.030, y, Z_CORE + 0.014);
      frontGrp.add(a); sHeads.push(a);
    }
  }
  g.add(frontGrp);

  // ---- carriers ------------------------------------------------------------
  const rnd = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const carriers = [];
  cores.forEach((c, ci) => {
    for (let i = 0; i < N_CARR; i++) {
      const k = ci * 97 + i * 7 + 3;
      carriers.push({
        x: XA0 + 0.024 + rnd(k) * (len - 0.048),
        y: c.y + (rnd(k * 3 + 1) - 0.5) * R_CU * 1.30,
        z: Z_CORE + 0.001 + rnd(k * 5 + 2) * 0.0015,
        s: c.sign,
        f: [0.63 + rnd(k * 11) * 1.5, 0.71 + rnd(k * 13) * 1.6, 0.55 + rnd(k * 17) * 1.3],
        p: [rnd(k * 19) * 100, rnd(k * 23) * 100, rnd(k * 29) * 100],
        g: 0.6 + rnd(k * 31) * 0.4,
      });
    }
  });
  const swarm = new DIAG.Swarm(carriers.length, { color: PAL.cy, size: 0.0016, additive: true });
  g.add(swarm);

  // ---- the two swing marks -------------------------------------------------
  // The amber band above IS the ⌀1.784 mm copper at ×MAG, so it is the scale
  // reference and does not need a second bar. What has to be shown is that at
  // that same magnification the carriers' true swing has NO WIDTH — hence a
  // zero-width tick, captioned as such — and what it becomes when blown up.
  const SX = 0.024;
  const tick = (x, y, half, col, w, op = 0.9) =>
    poly([[x, y - half, Z_CORE + 0.002], [x, y + half, Z_CORE + 0.002]], col, w, { opacity: op, renderOrder: 13 });

  g.add(tick(SX, 0.092, 0.0070, PAL.rd, 2.4));

  const swingShown = 2 * X_DRIFT_PK * MAG_DRIFT;      // 0.02878 m of card
  const dimShown = DIAG.dimension([SX, 0.074, Z_CORE + 0.002], [SX + swingShown, 0.074, Z_CORE + 0.002],
    { color: PAL.cy, width: 1.4, head: 0.0040 });
  preFade(dimShown, 0.95); g.add(dimShown);
  g.add(tick(SX, 0.074, 0.0050, PAL.cy, 1.1));
  g.add(tick(SX + swingShown, 0.074, 0.0050, PAL.cy, 1.1));

  // ---- phase plot: current and carrier position, one cycle ----------------
  const T = 1 / F_MAINS;
  const ph = new DIAG.Graph({
    w: 0.152, h: 0.040, xRange: [0, T], yRange: [-1.20, 1.20],
    xTicks: DSP.linSpace(0, T, 5), yTicks: [-1, 0, 1], zeroLine: 0,
  });
  ph.position.set(0.026, 0.014, Z_CORE - 0.001);
  g.add(ph);
  ph.addTrace((t) => Math.sin(TAU * F_MAINS * t), { color: PAL.am, width: 1.8, n: 160 });
  ph.addTrace((t) => -Math.cos(TAU * F_MAINS * t), { color: PAL.cy, width: 1.8, n: 160 });
  const dotI = ph.addDot(PAL.am, 0.0028);
  const dotX = ph.addDot(PAL.cy, 0.0028);

  root.userData = { swarm, carriers, arrows, eSeam, eHeads, sHeads, frontGrp, len, ph, dotI, dotX };
  return root;
}

// ===========================================================================
// STAGE
// ===========================================================================

// One latched display state. update() runs every frame; readouts() is polled at
// 10 Hz. If the labels track the instant and the footer tracks the poll, a
// single still frame shows two different answers for the same quantity. So both
// read D, and D only changes on the latch tick.
const D = { v: 0, i: 0, vd: 0, xd: 0, p: 0 };

export default {
  id: 'power',
  title: 'Mains &amp; Conditioning',
  nav: 'Mains',
  kicker: 'Mains',
  standfirst: 'Nothing travels from the wall but a change in the field',
  shot: SHOT,
  timeScale: TIME_SCALE,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = new THREE.Group();
    this._cond = buildConditioner(ctx.renderer);
    this._lead = buildLead();
    hardware.add(this._cond, this._lead);

    const overlay = new THREE.Group();
    this._cA = buildCableCard();
    overlay.add(this._cA);
    this._pk = 0;

    // ---- labels ------------------------------------------------------------
    const L = ctx.labels;
    const A = this._cA.children[0];
    const anch = (x, y, z = Z_CORE + 0.014) => {
      const o = new THREE.Object3D(); o.position.set(x, y, z); A.add(o); return o;
    };
    const CARD = { occlude: false };
    const yMid = (Y_L + Y_N) / 2;

    // ONE label for the pair, because the pair is the point: the same current,
    // opposite signs, at the same instant. Two labels said it twice.
    this._lLoop = L.add(anch(0.216, yMid), {
      ...CARD, kicker: 'Live out · Neutral back',
      value: `+${I_PK.toFixed(2)} ⇄ −${I_PK.toFixed(2)} A`, cls: 'am', offset: [58, 0], priority: 5,
    });
    L.add(anch(0.216, Y_E), {
      ...CARD, kicker: 'Earth · no return', value: 'a few mA', cls: '', offset: [58, 0], priority: 2,
    });

    L.add(anch(0.070, 0.196), {
      ...CARD, kicker: 'Energy front · S = E × H',
      text: `slowed 1 : ${sci(FIELD_TOTAL_SLOW, 2)} — ×${SEEN_RATIO.toFixed(1)} ahead here, ×${sci(SPEED_RATIO, 1)} in truth`,
      value: `${sci(V_FIELD, 3)} m/s`, cls: 'am', offset: [0, -14], priority: 4,
    });

    L.add(anch(0.024, 0.083), {
      ...CARD,
      kicker: `Carrier swing · copper ⌀${(D_COND * 1e3).toFixed(2)} mm at ×${MAG}`,
      text: `<span style="color:${RDS}">red: ±${(X_DRIFT_PK * 1e6).toFixed(2)} µm at ×${MAG}, 0.02 px</span>`
        + `<br><span style="color:${CYS}">cyan: the same at ×${MAG_EXTRA.toLocaleString('en-GB')} more</span>`,
      offset: [148, 12], priority: 5,
    });

    // the subject has to be named on its own fascia, or a reader cannot tell
    // which of six identical rack units this chapter is about
    const badge = new THREE.Object3D();
    badge.position.set(-0.245, CHt / 2, CD / 2 + 0.010);
    this._cond.add(badge);
    L.add(badge, {
      kicker: 'Mains conditioner · bay 0', cls: 'lead',
      text: '±400 V and ±10 A f.s.d., instantaneous',
      value: `${I_RMS.toFixed(2)} A rms · 1 : 50`, offset: [86, -26], priority: 6,
    });

    // MANDATORY axis numerals — a plot you cannot take a value off is decoration
    this._cA.userData.ph.tickLabels(L, {
      xVals: [0, 0.010, 0.020], yVals: [-1, 1],
      xFmt: (v) => (v > 0.015 ? '20 ms' : (v * 1e3).toFixed(0)),
      yFmt: (v) => (v > 0 ? '+1' : '−1'),
      xOffset: [0, 12], yOffset: [-15, 0],
    });

    return { hardware, overlay };
  },

  update(dt, t, ctx) {
    const th = TAU * F_MAINS * t;
    const sn = Math.sin(th);
    const cs = Math.cos(th);

    D.v = V_PK * sn;
    D.i = I_PK * sn;
    D.vd = V_DRIFT_PK * sn;
    D.xd = -X_DRIFT_PK * cs;
    D.p = 2 * VA * sn * sn;                          // p(t) = V̂Î sin²ωt

    // Peak-hold, taken off the drawn waveform rather than asserted: it settles
    // within a quarter cycle and then parks where the pointer actually reaches.
    this._pk = Math.max(Math.abs(sn), this._pk * 0.9992);
    for (const m of this._cond.userData.meters) {
      const a = -SWEEP * m.frac * sn;
      m.pivot.rotation.z = a;
      m.shadow.rotation.z = a;
      const pa = SWEEP * m.frac * this._pk;
      m.peaks[0].rotation.z = pa;
      m.peaks[1].rotation.z = -pa;
    }
    this._lead.userData.sheath.opacity = 0.024 + 0.070 * (sn * sn);

    const U = this._cA.userData;
    // Displacement is the integral of velocity: x(t) = −x̂ cos ωt. The carriers
    // are therefore furthest from home when the current is zero, and back at
    // home when it peaks — a quarter cycle behind the arrows, which is the point.
    const drift = -X_DRIFT_PK * MAG_DRIFT * cs;
    const Tj = t * 3200;
    U.swarm.update((i) => {
      const c = U.carriers[i];
      const jx = Math.sin(Tj * c.f[0] + c.p[0]) * 0.0016 + Math.sin(Tj * c.f[2] * 1.7 + c.p[2]) * 0.0008;
      const jy = Math.sin(Tj * c.f[1] + c.p[1]) * 0.0011 + Math.cos(Tj * c.f[0] * 1.4 + c.p[1]) * 0.0006;
      return {
        p: [c.x + jx + c.s * drift, c.y + jy, c.z],
        s: c.g * (c.s === 0 ? 0.7 : 1.0),
        c: c.s === 0 ? PAL.gr : PAL.cy,
      };
    });

    const pos = sn >= 0;
    const amp = Math.abs(sn);
    for (const a of U.arrows) {
      a.m.rotation.z = (a.sign > 0) === pos ? 0 : Math.PI;
      a.m.userData._baseOp = 0.30 + 0.65 * amp;
    }
    for (const h of U.eHeads) {
      h.rotation.z = pos ? -Math.PI / 2 : Math.PI / 2;
      h.userData._baseOp = 0.14 + 0.70 * amp;
    }
    for (const s of U.eSeam) s.userData._baseOp = 0.10 + 0.46 * amp;
    for (const h of U.sHeads) h.userData._baseOp = 0.30 + 0.45 * amp;   // S never reverses

    // the energy front runs on its own, stated clock
    const cutLen = (XA1 - XA0) / MAG;
    const u = (((V_FIELD * t) / FIELD_SLOW / cutLen) % 1 + 1) % 1;
    U.frontGrp.position.x = XA0 + u * (XA1 - XA0);
    const fade = Math.sin(Math.PI * Math.min(1, u / 0.99));
    for (const b of U.frontGrp.children) if (b.userData.wgt) b.userData._baseOp = b.userData.wgt * (0.30 + 0.70 * fade);

    const tc = ((t % (1 / F_MAINS)) + 1 / F_MAINS) % (1 / F_MAINS);
    U.dotI.userData.setData(tc, Math.sin(TAU * F_MAINS * tc));
    U.dotX.userData.setData(tc, -Math.cos(TAU * F_MAINS * tc));
  },

  content() {
    // Budget: the panel holds ~18 lines at this measure before it scrolls, and
    // a still frame is the deliverable, so the argument has to close inside it.
    return `
<h3>The circuit, both halves of it</h3>
<p>Two conductors leave the wall. <b>Live</b> carries current out; <b>neutral</b>
carries the identical current back at every instant — the loop <em>is</em> the
circuit. <b>Protective earth</b> carries no return current at all.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>Dots racing along the
wire. Nothing races. <b>E</b> points live to neutral, <b>H</b> encircles each core,
and the energy rides <span class="num">S = E × H</span> in the field <em>between</em>
them at <span class="num">${sci(V_FIELD, 2)} m/s</span> —
<span class="num">${sci(SPEED_RATIO, 1)}</span> times the drift speed.</p></div>

<h3>What the electrons do</h3>
<p>Both monoblocks at <span class="num">${AMP.pOut8} W</span> into
<span class="num">${SPEAKER.nominalZ} Ω</span> at
<span class="num">${(AMP.effAB * 100).toFixed(0)} %</span>, plus
<span class="num">${P_FRONT} W</span> of front end, draw
<span class="num">${P_SYS.toFixed(0)} W</span> —
<span class="num">${I_RMS.toFixed(2)} A</span> rms
<em>at unity power factor</em>, which is the case drawn. A capacitor-input supply
conducts in short peaks near <span class="num">${PF_REAL}</span>, so its real rms is
nearer <span class="num">${I_RMS_REAL.toFixed(1)} A</span>; the figures below scale
with it.</p>
<div class="eq">v̂ = Î/(n·A·e) = <span class="hl">${sci(V_DRIFT_PK, 2)} m/s</span> → x̂ = <span class="hl">${(X_DRIFT_PK * 1e6).toFixed(2)} µm</span></div>
<p>The carrier shuffles that far and stays, on a Fermi velocity of
<span class="num">${sci(V_FERMI, 2)} m/s</span> scattering every
<span class="num">${(TAU_COLL * 1e15).toFixed(1)} fs</span> in no direction at all.</p>`;
  },

  readouts() {
    // The footer DOM is rewritten at 10 Hz; a world label written every frame
    // would show a different instant in the same still. So the conductor label
    // is written HERE, from the same snapshot the footer is built from — one
    // screenshot, one instant, whatever moment it is taken.
    if (this._lLoop) {
      const a = Math.abs(D.i).toFixed(2);
      this._lLoop.setValue(`${D.i >= 0 ? '+' : '−'}${a} ⇄ ${D.i >= 0 ? '−' : '+'}${a} A`);
    }
    return [
      { k: 'MAINS', v: (D.v >= 0 ? '+' : '−') + Math.abs(D.v).toFixed(1), u: `V · ${V_RMS} rms`, cls: 'acc' },
      { k: 'CURRENT', v: (D.i >= 0 ? '+' : '−') + Math.abs(D.i).toFixed(2), u: `A · ${I_RMS.toFixed(2)} rms`, cls: 'am' },
      { k: 'DRIFT v', v: (D.vd * 1e6).toFixed(1), u: 'µm/s', cls: 'am', bar: Math.abs(D.vd) / V_DRIFT_PK },
      { k: 'CARRIER x', v: (D.xd * 1e9).toFixed(0), u: 'nm', cls: 'acc', bar: (D.xd / X_DRIFT_PK + 1) / 2 },
      { k: 'POWER', v: D.p.toFixed(0), u: `W · ${VA.toFixed(0)} mean`, cls: 'am', bar: D.p / (2 * VA) },
      { k: 'FIELD', v: sci(V_FIELD, 3), u: 'm/s · 0.66 c', cls: '' },
    ];
  },
};
