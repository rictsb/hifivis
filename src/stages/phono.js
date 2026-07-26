import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { CART, TT, TONEARM, PHONO, PREAMP, AMP, SPEAKER, CHAIN } from '../core/spec.js';

/* ===========================================================================
   PHONO STAGE — RIAA equalisation.

   Primaries come from src/core/spec.js. Nothing here re-declares one; anything
   this chapter needs that spec.js does not carry is derived below and the
   derivation is stated.
   =========================================================================== */

// --- the standard: three time constants --------------------------------------
const F1 = DSP.RIAA_F.f1;                       // 3180 µs → 50.05 Hz  pole
const F2 = DSP.RIAA_F.f2;                       //  318 µs → 500.49 Hz zero
const F3 = DSP.RIAA_F.f3;                       //   75 µs → 2122.07 Hz pole

// --- the network actually fitted ---------------------------------------------
// A passive de-emphasis network in two buffered sections. Section one is a
// series R₁ into a shunt R₂+C₁, which puts a zero at R₂C₁ and a pole at
// (R₁+R₂)C₁; section two is a series R₃ into a shunt C₂, a pole at R₃C₂.
// The values are the nearest E96/standard-film parts, so the realised corners
// are NOT the standard's corners — which is the whole point of the green trace.
const NET = { R1: 86.6e3, R2: 9.53e3, C1: 33e-9, R3: 2.26e3, C2: 33e-9 };
const TR = {
  T1: (NET.R1 + NET.R2) * NET.C1,               // 3172.29 µs
  T2: NET.R2 * NET.C1,                          //  314.49 µs
  T3: NET.R3 * NET.C2,                          //   74.58 µs
};
/** Realised corner frequencies, derived — never typed into the prose. */
const FR = { f1: 1 / (DSP.TAU * TR.T1), f2: 1 / (DSP.TAU * TR.T2), f3: 1 / (DSP.TAU * TR.T3) };
const netRaw = (f) => {
  const w = DSP.TAU * f;
  return DSP.cDiv([1, w * TR.T2], DSP.cMul([1, w * TR.T1], [1, w * TR.T3]));
};
const NET_1K = DSP.cAbs(netRaw(1000));
/** Realised de-emphasis, normalised to 0 dB at 1 kHz. */
const playDb = (f) => DSP.dB(DSP.cAbs(netRaw(f)) / NET_1K);
/** Record (the standard, from DSP) plus the network. A result, not an identity. */
const sumDb = (f) => DSP.riaaRecordDb(f) + playDb(f);

const ERR = (() => {
  let hi = 0, lo = 0, fHi = 0;
  for (let i = 0; i <= 3000; i++) {
    const f = 20 * Math.pow(1000, i / 3000);
    const e = sumDb(f);
    if (e > hi) { hi = e; fHi = f; }
    if (e < lo) lo = e;
  }
  return { hi, lo, fHi };                       // +0.060 dB at 99.7 Hz, −0.003
})();
// Insertion loss of the passive network at 1 kHz: the gain blocks must make it up.
const NET_LOSS_1K = DSP.dB(NET_1K);             // −19.96 dB

// --- what component tolerance costs on top of the E96 grid -------------------
// 0.1 % films and 1 % polystyrene, root-sum-square over the three constants.
const D_T = Math.hypot(0.001, 0.010);           // 1.005 %
const TOL_DB = (() => {
  const mag = (T, f) => {
    const w = DSP.TAU * f;
    return DSP.cAbs(DSP.cDiv([1, w * T.T2], DSP.cMul([1, w * T.T1], [1, w * T.T3])));
  };
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    const f = Math.pow(10, Math.log10(20) + (3 * i) / 599);
    let ss = 0;
    for (const k of ['T1', 'T2', 'T3']) {
      const q = Object.assign({}, TR);
      q[k] = TR[k] * (1 + D_T);
      const e = DSP.dB(mag(q, f) / mag(q, 1000)) - DSP.dB(mag(TR, f) / mag(TR, 1000));
      ss += e * e;
    }
    worst = Math.max(worst, Math.sqrt(ss));
  }
  return worst;                                 // 0.103 dB
})();

// --- groove mechanics --------------------------------------------------------
// A magnetic cartridge is a velocity transducer. For a lateral sinusoid of peak
// velocity v̂ the peak displacement is a = v̂/ω, so a constant-velocity cut makes
// the excursion grow as 1/f.
const V_REF = CART.vRef;                        // 0.05 m/s PEAK — spec.js
const exc = (v, f) => v / (DSP.TAU * f);
const A_50_FLAT = exc(V_REF, 50);               // 159.155 µm — UNCUT, see below
// ...but that case is never cut. The record curve is 16.94 dB down at 50 Hz, so
// the velocity actually in the groove is V_REF·10^(rec/20) and the excursion
// with it. Quoting the flat figure alone tells the reader a real 50 Hz cut
// overruns its neighbour, which is the opposite of what the curve is for.
const REC_50 = DSP.riaaRecordDb(50);            // −16.94 dB
const A_50_CUT = A_50_FLAT * DSP.undB(REC_50);  // 22.60 µm, inside the pitch

// Average groove pitch: a 20-minute side at spec.js's 33⅓ rpm is 666.7
// revolutions, spread across the recorded band from TT.rOuter to TT.rInner.
const LP_TURNS = 20 * TT.rpm;                   // 666.67
const PITCH = (TT.rOuter - TT.rInner) / LP_TURNS;     // 129.0 µm

// --- gain budget -------------------------------------------------------------
// Every term is a spec.js primary. The cartridge is a CART.srcOhm source into a
// CART.loadOhm load, so the input never sees the open-circuit voltage; spec.js
// carries that loss and CHAIN's volume residual is solved with it in place, so
// this ladder and the preamp chapter's now agree to 1e-12 dB.
// CART.outRms is the open-circuit 284.61 µV; CART.loadLossDb is the −0.828 dB
// the 10 Ω coil loses into the 100 Ω load; CART.atInputRms is what is left.
const V_IN = CART.atInputRms;                   // 258.74 µV rms at the input
const G_STAGE_DB = PHONO.gainDb;                // 64.00 dB
const V_OUT = V_IN * DSP.undB(G_STAGE_DB);      // 0.4101 V rms
const G_REST_DB = PREAMP.gainDb + AMP.gainDb + CHAIN.volumeDb;   // +16.774 dB
// 0.41007 V × 10^(16.7737/20) = 2.82843 V = 1.0000 W into 8 Ω, to 1e-12 dB.
const V_TERM = V_OUT * DSP.undB(G_REST_DB);
const W_TERM = (V_TERM * V_TERM) / SPEAKER.nominalZ;   // 1.0000 W
// The overview chapter PRINTS this ladder, so this chapter does not — the panel
// truncates and a figure quoted twice is a figure that can disagree twice. It is
// still computed here, from the same spec.js primaries, because if this chapter
// ever moved off them W_TERM would stop being 1.000 W and the discrepancy would
// be visible in a single line of this file.
if (Math.abs(W_TERM - 1) > 1e-9) throw new Error('phono: chain no longer lands 1 W');
const AMP_RAW_DB = G_STAGE_DB - NET_LOSS_1K;    // 83.96 dB of raw amplification

// --- noise -------------------------------------------------------------------
const K_B = 1.380649e-23, T_K = 293.15;         // 20 °C
const R_SRC = (CART.srcOhm * CART.loadOhm) / (CART.srcOhm + CART.loadOhm);  // 9.091 Ω
const EN_DEV = 1.0e-9;                          // V/√Hz, four paralleled devices
const EN_R = Math.sqrt(4 * K_B * T_K * R_SRC);  // 0.3836 nV/√Hz Johnson
const EN_TOT = Math.hypot(EN_DEV, EN_R);        // 1.0711 nV/√Hz
// The noise is shaped by the playback curve, so the honest bandwidth is
// ∫|H(f)/H(1k)|² df over 20 Hz–20 kHz, not a flat 20 kHz.
const ENB = (() => {
  const a = Math.log(20), b = Math.log(20000), n = 4000;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const f = Math.exp(a + ((b - a) * (i + 0.5)) / n);
    const p = DSP.undB(playDb(f));
    s += p * p * f * ((b - a) / n);
  }
  return s;                                     // 8707 Hz
})();
const V_NOISE = EN_TOT * Math.sqrt(ENB);        // 99.9 nV rms
const SNR_DB = DSP.dB(V_IN / V_NOISE);          // 68.3 dB

// --- presentation ------------------------------------------------------------
// A real swept sine, in real time, no magnification claimed. It starts at the
// 1 kHz reference because that is where the curve is normalised. 20 s per sweep
// is slow enough that the 10 Hz readout tick and the graph cursor describe the
// same instant to within 3 px of the plot.
const SWEEP = 20.0;                             // s per 20 Hz → 20 kHz sweep
const PH0 = Math.log10(1000 / 20) / 3;          // start at 1 kHz

const S = { f: 1000, rec: 0, play: 0, sum: 0, vin: V_IN, vout: V_OUT, gain: G_STAGE_DB };
const sgn = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

// ---------------------------------------------------------------------------
// FRAMING — derived, and the derivation is the reason it is not 0.52.
//
// The subject is a 555 × 112 × 440 mm box. Its silhouette on screen is
//     width  = W·cos(az) + D·sin(az)
//     height = H·cos(el) + D·sin(el)
// so the WIDTH is the binding constraint, not the height, and `fill` — which
// frameShot measures against the safe box's 840 px height — cannot be pushed to
// a hero's 0.52 without taking the chassis through x = 160 / x = 1120. The two
// levers that buy height are therefore used first:
//
//   · azimuth DOWN to 0.30 rad. Apparent width is W·cos(az)+D·sin(az), which for
//     D < W falls as az → 0, so a shallower three-quarter is 3 % narrower than
//     the old 0.40 rad while still showing a cheek.
//   · elevation UP to 0.42 rad. The silhouette is then 282 mm tall instead of
//     the fascia's bare 112, the vented top panel is in view, and the aspect
//     ratio drops from 2.62 : 1 to 2.34 : 1.
//
// MEASURED off the render at fill 0.43, not asserted: the chassis came out
// 700 × 228 px, because the depth term of both formulae sits further from the
// lens than the fascia does and projects smaller than the flat arithmetic says.
// That left 260 px of unused width, so fill goes to 0.52 — the figure the audit
// asked for, which the old 0.40 rad azimuth could not have carried — landing the
// chassis at about 846 × 276 px with 57 px of margin each side of the safe box.
// HERO_R is the apparent HALF-HEIGHT (a bounding sphere would be dominated by
// the 555 mm width and leave the chassis 85 px tall).
// ---------------------------------------------------------------------------
const CH_H = 0.112, CH_FOOT = 0.008;
const CH_D = LAYOUT.rack.d - 0.06;                          // 0.440
const HERO_Y = LAYOUT.bayCentre(3, CH_H) + CH_FOOT;         // 0.678
const HERO_Z = LAYOUT.rack.z + CH_D / 2;                    // fascia plane, −3.08
const AZ = 0.30, EL = 0.42, FOV = 30;
/** apparent half-height of the silhouette at this elevation, in metres */
const HERO_R = (CH_H * Math.cos(EL) + CH_D * Math.sin(EL)) / 2;   // 0.1409
const FILL = 0.52;
const ASPECT = 1.6, TANH = Math.tan((FOV * Math.PI) / 360);

const _b = frameShot([LAYOUT.rack.x, HERO_Y, HERO_Z], HERO_R,
  { fill: FILL, az: AZ, el: EL, fov: FOV });
const _cam0 = new THREE.Vector3(..._b.position);
const _tgt0 = new THREE.Vector3(..._b.target);
const _fwd = _tgt0.clone().sub(_cam0).normalize();
const _rgt = new THREE.Vector3().crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize();
const _up = new THREE.Vector3().crossVectors(_rgt, _fwd).normalize();
const DIST = _cam0.distanceTo(_tgt0);

// Where the hero should land, in GEOMETRIC ndc — the director's shift lens then
// adds −0.1625 in x, which is what puts ndc 0 at screen x 640.
const HX = -0.0375, HY = 0.42;
const _shift = _rgt.clone().multiplyScalar(-HX * ASPECT * TANH * DIST)
  .addScaledVector(_up, -HY * TANH * DIST);
const SHOT = {
  position: _cam0.clone().add(_shift).toArray(),
  target: _tgt0.clone().add(_shift).toArray(),
  fov: FOV,
};

const CAM = new THREE.Vector3(...SHOT.position);
const FWD = new THREE.Vector3(...SHOT.target).sub(CAM).normalize();
const RGT = new THREE.Vector3().crossVectors(FWD, new THREE.Vector3(0, 1, 0)).normalize();
const UPV = new THREE.Vector3().crossVectors(RGT, FWD).normalize();

/** World point that projects to (ndcX, ndcY) at `dist` metres down the axis. */
function place(ndcX, ndcY, dist) {
  return CAM.clone()
    .addScaledVector(FWD, dist)
    .addScaledVector(RGT, ndcX * ASPECT * TANH * dist)
    .addScaledVector(UPV, ndcY * TANH * dist);
}

// The card floats in front of the fascia plane at a fixed fraction of the camera
// distance, so its size on screen is invariant if the framing is retuned.
const CARD_DIST = 0.885 * DIST;
/** Pixels per metre on the card's plane at 1600 × 1000. Every dimension on the
 *  card is written in pixels and divided by this, because what has to be right
 *  is the SCREEN size — the metres are an implementation detail that changes
 *  whenever `fill` does. */
const CARD_PX = 1000 / (2 * CARD_DIST * TANH);      // ≈ 1750 px/m

// ---------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------
function anchor(parent, x, y, z = 0) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function poly(pts, color, width, opts = {}) {
  const t = new DIAG.Trace(pts.length, color, width, opts);
  t.write((i) => [pts[i].x, pts[i].y, pts[i].z]);
  return t;
}
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Alpha ramp for the negative-fill flags. Feathered on both sides and at the far
 * edge, and feathered over a short run at the BOTTOM (v = 0) — that is the edge
 * nearest the hero, and it has to reach full density within one bay or the
 * neighbouring chassis is barely touched, while a hard line there would read as
 * a rectangle rather than as falloff.
 */
function flagAlpha(size = 128, near = 0.08) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const sm = (t) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;             // ImageData row 0 is the TOP
    const fv = sm(v / near) * sm((1 - v) / 0.12);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const a = fv * sm(Math.min(u, 1 - u) / 0.13);
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

// ---------------------------------------------------------------------------
// HARDWARE — rack bay 3
// ---------------------------------------------------------------------------
function buildHardware() {
  const M = mats();
  const R = LAYOUT.rack;
  const W = R.w - 0.03;          // 0.555
  const D = CH_D;                // 0.440
  const H = CH_H;                // 0.112 — bay 3 allows 0.160
  const FOOT = CH_FOOT;
  const FT = 0.020;              // a thick, properly machined fascia
  const fz = D / 2;

  // Brushed alloy — and the roughness is the whole argument.
  //
  // A VERTICAL METAL FASCIA SEEN FROM ABOVE MIRRORS THE FLOOR. Reflect the view
  // vector about +Z and the y component keeps its sign, so a camera 24° up sends
  // the specular ray 24° DOWN, into the set's floor card — which is the dimmest
  // emitter in the rig. At roughness 0.30 the GGX lobe is ~17° wide and picks up
  // nothing else, which is why this panel was rendering at 6 % grey: black, with
  // one clipped white line where the top break happened to catch the front strip.
  // A real brushed (not polished) fascia is nearer 0.45; that lobe is wide enough
  // to reach the shell's horizon band 24° above the specular ray, so the panel
  // fills with a ramp instead of resolving to two values.
  // Measured: at roughness 0.46 / envMapIntensity 1.20 the panel read 14.1 %
  // mean against a diagram card at 27.5 %, so the picture's brightest mass was
  // still not the hero. A metal's output is albedo × the lobe average, and this
  // lobe is pointed at the floor, so both terms have to come up: albedo to 0.70
  // linear (still inside the library's 0.85 ceiling) and the lobe wide enough at
  // 0.60 to average in the horizon band 24° above it. That is a bead-blasted
  // fascia rather than a fine brush, which is what this class of chassis is.
  const face = M.alu.clone();
  face.color.setHex(0xd6d9de);
  face.roughness = 0.600;
  face.envMapIntensity = 2.45;

  // The knobs need their OWN alloy, not the fascia's. A knob's spun end face is
  // perpendicular to the lens, so unlike the fascia it mirrors what is directly
  // behind the camera — the beauty box, at about 8 in linear. At the fascia's
  // 0.70 albedo that returns 5.6, and the two knobs measured 1.9 % of their own
  // area above 95 % and were the brightest objects in the picture. A darker
  // machined alloy at 0.33 returns about 2.0, just under the 2.30 bloom
  // threshold: still the brightest thing on the chassis, but no longer clipped.
  const knobMat = M.alu.clone();
  knobMat.color.setHex(0x9aa0a8);
  knobMat.roughness = 0.420;
  knobMat.envMapIntensity = 0.75;

  // The hero's own shell is a shade above the black-anodised boxes either side of
  // it, so its top face reads as a surface rather than as a hole in the frame.
  const shellMat = M.anodBlack.clone();
  shellMat.color.setHex(0x31363d);
  shellMat.roughness = 0.40;
  shellMat.envMapIntensity = 1.45;

  // Satin trim, not mirror. A 2 mm bar is narrower than the reflected image of
  // the softbox, so a chrome finish makes the whole section clip and bloom.
  const trim = M.aluTrim.clone();
  trim.color.setHex(0xb4b9c0);
  trim.roughness = 0.42;
  trim.envMapIntensity = 0.78;

  const g = new THREE.Group();
  g.position.set(R.x, HERO_Y, R.z);

  // The fascia's top break is a 45° facet between a vertical panel and a
  // horizontal one, which is aimed straight between the front strip and the
  // beauty box — the two largest emitters in the rig — so it is always the
  // hottest thing on the chassis. Widening it made a blown BAR out of a blown
  // line, which is worse: the contract wants a thin bright line on the edge, and
  // bloom integrates area. 4.2 mm keeps the clipped run under three pixels at
  // this framing while the 0.52 roughness holds the panel below it in the ramp.
  g.add(GEO.chassis(W, H, D, { r: 0.0022, seg: 5, faceThick: FT, body: shellMat, face }));

  // --- the applied top rail ----------------------------------------------------
  // The 45° break between a vertical fascia and a horizontal top panel is aimed
  // exactly between the front strip and the beauty box, the rig's two largest
  // emitters. A METAL there has F0 = its albedo, so at 0.70 it returns 70 % of a
  // source sitting at ~8 in linear: 5.6, far above the 2.30 bloom threshold, and
  // it clipped to a hard white bar across the full 555 mm with a bloom halo
  // twice its height. Measured over95 in that band: 0.567 %.
  //
  // The fix is a part, not a number. Real chassis of this class carry an applied
  // chamfer rail, and a DIELECTRIC one reflects 4 % rather than 70 % — 0.32 in
  // linear, inside the ramp, with Fresnel lifting it along the run so it still
  // reads as a lit edge.
  //
  // It has to BURY the fillet, not sit level with it. The first attempt cleared
  // it by 0.36 mm, which the bevelBox's own 0.6 mm corner rounding then ate, so
  // the metal fillet went on printing through and the bar did not move at all
  // between renders. A 19 mm face standing 3.5 mm proud of both planes covers
  // the 3.5 mm fillet with 3.5 mm to spare at every point along it.
  const railMat = M.plastic.clone();
  railMat.color.setHex(0x363b42);
  railMat.roughness = 0.40;
  railMat.clearcoat = 0.38;
  railMat.clearcoatRoughness = 0.28;
  railMat.envMapIntensity = 0.70;
  const rail = new THREE.Mesh(GEO.bevelBox(W - 0.0010, 0.0190, 0.0040, 0.0006, 3), railMat);
  rail.rotation.x = -Math.PI / 4;
  rail.position.set(0, 0.05462, D / 2 - 0.00138);
  rail.castShadow = false; rail.receiveShadow = true;
  g.add(rail);

  // --- fascia -----------------------------------------------------------------
  // Applied centre plate, standing 1.2 mm proud. It carries a clearcoat so the
  // wide front strip lays a bright-to-mid ramp across it instead of one value.
  const plateMat = M.anodBlack.clone();
  plateMat.color.setHex(0x1e2228);
  plateMat.roughness = 0.38;
  plateMat.clearcoat = 0.70;
  plateMat.clearcoatRoughness = 0.20;
  const plate = new THREE.Mesh(GEO.bevelBox(0.262, 0.072, 0.0040, 0.0011, 3), plateMat);
  plate.position.set(0, 0, fz + 0.0014);
  g.add(plate);

  // bezel around the plate — four hairline bars
  const bezH = GEO.bevelBox(0.2695, 0.0015, 0.0020, 0.0004, 2);
  const bezV = GEO.bevelBox(0.0015, 0.0750, 0.0020, 0.0004, 2);
  for (const sy of [1, -1]) {
    const b = new THREE.Mesh(bezH, trim);
    b.position.set(0, sy * 0.0368, fz + 0.0031);
    g.add(b);
  }
  for (const sx of [1, -1]) {
    const b = new THREE.Mesh(bezV, trim);
    b.position.set(sx * 0.1340, 0, fz + 0.0031);
    g.add(b);
  }

  // full-width inlay along the bottom of the fascia — a light-catcher
  const inlay = new THREE.Mesh(GEO.bevelBox(0.508, 0.0024, 0.0018, 0.0005, 2), trim);
  inlay.position.set(0, -0.0455, fz + 0.0010);
  g.add(inlay);

  // Milled relief lines flanking the plate. At 1.2 mm they were under two pixels
  // at this framing and did nothing; a 2.4 mm cut reads as machining.
  // They also sat at x ±97.5 mm, which is UNDER the 212 mm indicator well, so
  // nothing of them was ever visible. They belong on the bare fascia, in the
  // 37 mm gap between the applied plate and the knob bezel.
  for (const sx of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(GEO.bevelBox(0.030, 0.0022, 0.0014, 0.0005, 2), M.anodBlack);
      l.position.set(sx * 0.1585, (i - 2) * 0.0112, fz + 0.0005);
      g.add(l);
    }
  }

  // recessed indicator well — a dark anodised inset behind the lens
  const well = M.anodBlack.clone();
  well.color.setHex(0x0c0e11);
  well.roughness = 0.30;
  const win = new THREE.Mesh(GEO.bevelBox(0.212, 0.0500, 0.0018, 0.0005, 2), well);
  win.position.set(0, 0, fz + 0.0031);
  g.add(win);

  // Everything lit behind the lens. These must not cast: a backlit segment that
  // throws a shadow onto its own display prints as a dark step under each mark.
  const lit = [];

  const segDim = M.plastic.clone();
  segDim.color.setHex(0x18272e);

  // Unlit track behind the level bar. Without it the lit bar floats in black and
  // reads as a decal; with it, two thirds of a scale is lit and one third is not,
  // which is what makes an instrument look like an instrument.
  const track = new THREE.Mesh(GEO.bevelBox(0.1520, 0.0026, 0.0008, 0.0003, 2), segDim);
  track.position.set(-0.0200, 0.0140, fz + 0.0042);
  g.add(track); lit.push(track);

  // hairline backlit bar — kept small so bloom stays a glint, not a flare
  const glow = new THREE.Mesh(GEO.bevelBox(0.100, 0.0026, 0.0009, 0.0003, 2), M.meterGlow);
  glow.position.set(-0.046, 0.0140, fz + 0.0045);
  g.add(glow); lit.push(glow);

  // stepped cartridge-loading ladder: 8 segments, the first four lit
  const segGeo = GEO.bevelBox(0.0076, 0.0030, 0.0009, 0.0003, 2);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(segGeo, i < 4 ? M.meterGlow : segDim);
    s.position.set(-0.0930 + i * 0.0110, -0.0125, fz + 0.0044);
    g.add(s); lit.push(s);
  }
  // MC and mute indicators
  const ledGeo = GEO.bevelCyl(0.0018, 0.0020, 0.0015, 16, 0.0003);
  for (const [x, y, m] of [[0.0720, 0.0140, M.ledCyan], [0.0940, -0.0125, M.ledAmber]]) {
    const l = new THREE.Mesh(ledGeo, m);
    l.rotation.x = Math.PI / 2;
    l.position.set(x, y, fz + 0.0044);
    g.add(l); lit.push(l);
  }

  // two machined stepped controls: MM/MC selector and cartridge loading
  function control(x, pointer) {
    const c = new THREE.Group();
    c.position.set(x, 0, fz);
    const r = 0.0205;
    const bez = new THREE.Mesh(GEO.bevelCyl(r + 0.0068, r + 0.0075, 0.0030, 48, 0.0008), M.anodBlack);
    bez.rotation.x = Math.PI / 2;
    bez.position.z = 0.0015;
    c.add(bez);
    const kg = new THREE.Group();
    kg.rotation.x = Math.PI / 2;
    kg.position.z = 0.0030 + 0.0160 / 2;
    const k = GEO.knob(r, 0.0160, { body: knobMat, mark: trim, flutes: 60 });
    k.rotation.y = pointer;
    kg.add(k);
    c.add(kg);
    // engraved index positions
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.00068, 8, 6), trim, 5);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.5 + (i / 4 - 0.5) * Math.PI * 1.3;
      m4.makeTranslation(Math.cos(a) * (r + 0.0105), Math.sin(a) * (r + 0.0105), 0.0020);
      dots.setMatrixAt(i, m4);
    }
    c.add(dots);
    return c;
  }
  g.add(control(-0.196, Math.PI + 0.65));
  g.add(control(0.196, Math.PI - 0.33));

  GEO.screwRow(g, [
    [-0.2590, 0.0400], [-0.2590, -0.0400], [-0.2590, 0],
    [0.2590, 0.0400], [0.2590, -0.0400], [0.2590, 0],
  ], fz + 0.0006, 0.0021);

  // --- top and feet -----------------------------------------------------------
  const v = GEO.ventSlots(0.28, 0.22, 3, 12, { mat: M.plastic, sw: 0.0034, sd: 0.019 });
  v.position.set(0, H / 2 - 0.0017, -0.060);
  g.add(v);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const f = new THREE.Mesh(GEO.bevelCyl(0.0130, 0.0152, FOOT, 28, 0.0009), M.steel);
      f.position.set(sx * (W / 2 - 0.042), -H / 2 - FOOT / 2, sz * (D / 2 - 0.054));
      g.add(f);
    }
  }

  // --- rear panel -------------------------------------------------------------
  const rear = new THREE.Group();
  rear.position.z = -D / 2;
  rear.rotation.y = Math.PI;
  g.add(rear);

  [[-0.168, 0xd8dade], [-0.126, 0xd94b3a], [0.126, 0xd8dade], [0.168, 0xd94b3a]]
    .forEach(([x, col]) => {
      const j = GEO.rcaJack(col);
      j.position.set(x, -0.004, 0);
      rear.add(j);
    });

  // earth post — its own node, deliberately not a signal return
  const post = new THREE.Group();
  post.position.set(-0.072, -0.004, 0);
  const shaft = new THREE.Mesh(GEO.bevelCyl(0.0034, 0.0039, 0.015, 24, 0.0005), M.gold);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.0075;
  post.add(shaft);
  const nut = GEO.knob(0.0066, 0.0052, { body: M.gold, mark: M.gold, flutes: 26, dial: false });
  nut.rotation.x = Math.PI / 2; nut.position.z = 0.0105;
  post.add(nut);
  const pbase = new THREE.Mesh(GEO.bevelCyl(0.0052, 0.0058, 0.0032, 24, 0.0005), M.plastic);
  pbase.rotation.x = Math.PI / 2; pbase.position.z = 0.0016;
  post.add(pbase);
  rear.add(post);

  // outboard-supply umbilical: locking multi-pin socket
  const sock = new THREE.Group();
  sock.position.set(0.238, -0.002, 0);
  const shell = new THREE.Mesh(GEO.bevelCyl(0.0118, 0.0126, 0.0095, 32, 0.0008), M.steel);
  shell.rotation.x = Math.PI / 2; shell.position.z = 0.0048;
  sock.add(shell);
  const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.0092, 0.0092, 0.003, 28), M.plastic);
  ins.rotation.x = Math.PI / 2; ins.position.z = 0.0085;
  sock.add(ins);
  const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.005, 10), M.gold, 4);
  const mp = new THREE.Matrix4(), qp = new THREE.Quaternion(), sp = new THREE.Vector3(1, 1, 1);
  qp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    mp.compose(new THREE.Vector3(Math.cos(a) * 0.0044, Math.sin(a) * 0.0044, 0.0098), qp, sp);
    pins.setMatrixAt(i, mp);
  }
  sock.add(pins);
  rear.add(sock);

  const perf = GEO.perfGrid(0.085, 0.040, 0.0055, 0.0016, M.plastic);
  perf.position.set(0.055, -0.002, 0.0004);
  rear.add(perf);

  GEO.shadowed(g);
  for (const m of lit) m.castShadow = false;

  // --- the specular layer ------------------------------------------------------
  // A display without glass over it is a decal. The previous answer here was a
  // hand-rolled cylindrical panel at roughness 0.050 and envMapIntensity 3.6,
  // additively blended — a near-mirror returning three and a half times the
  // room, and measurably the brightest object in the frame. Contract Addendum J
  // exists because of it. `GEO.instrumentGlass` is the shared part: crowned, so
  // the source sweeps across as a band rather than sitting as a rectangle, and
  // reflectivity 0.34 for a coated cover glass's ~1.7 % at normal incidence.
  const lens = GEO.instrumentGlass(0.2130, 0.0510, {
    crown: 0.0021, roughness: 0.16, tint: 0x05070b, segs: 28,
  });
  lens.material.opacity = 0.34;
  lens.position.set(0, 0, fz + 0.0060);
  lens.castShadow = lens.receiveShadow = false;
  g.add(lens);
  // the lens sits in a machined rebate, so it gets a hairline surround
  const rim = new THREE.Mesh(GEO.bevelBox(0.2205, 0.0585, 0.0016, 0.0004, 2), trim);
  rim.position.set(0, 0, fz + 0.0026);
  rim.castShadow = false; rim.receiveShadow = true;
  g.add(rim);

  g.add(GEO.contactShadow(W * 1.10, D * 1.14, 0.45, -H / 2 - FOOT + 0.0013));
  return g;
}

// ---------------------------------------------------------------------------
// OVERLAY — four negative-fill flags, one card, two plot regions
// ---------------------------------------------------------------------------
function buildOverlay(ctx) {
  const L = ctx.labels;
  const M = mats();
  const root = new THREE.Group();
  const R = {};

  // --- negative fill ----------------------------------------------------------
  // Six near-identical chassis and nothing marking which one is the subject was
  // the standing finding against this chapter. This is what a photographer does
  // about it: black flags in front of the bays either side of the hero, feathered
  // so there is no rectangle, leaving bay 3 the only fully-lit chassis in frame.
  // The texture's soft edge is at the plane's own foot, so a rotation of 0/π/±π½
  // aims the falloff at the hero from above, below, right and left. The gap
  // between one chassis and the next is only 56 mm, so the ramp has to reach
  // full density inside it.
  const alpha = flagAlpha(128, 0.080);
  // The rack's own cove strips run up the uprights 15 mm outboard of the
  // chassis' ends. A 56 mm ramp cannot get to full density in 15 mm, so those
  // two verticals stayed the brightest thing in the picture through three
  // rounds. The side flags get a 21 mm ramp starting exactly at the chassis edge.
  const alphaTight = flagAlpha(128, 0.030);
  const flag = (w, h, cx, cy, rot, op = 0.62, a = alpha) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: 0x04050a, transparent: true, opacity: op, alphaMap: a,
        depthWrite: false, toneMapped: false,
      }));
    // 90 mm in front of the fascia plane, not 45. Neighbouring chapters put
    // their own lens glass and knob fronts up to ~60 mm proud of the shelf, and
    // anything in front of the flag plane fails the depth test and prints at
    // full brightness — which is why the DAC's cyan readout went on competing
    // with this chapter's hero through three rounds of raising the opacity.
    // Moving the plane toward the lens also moves each flag's near edge AWAY
    // from the hero in projection, because the hero sits behind it.
    m.position.set(cx, cy, HERO_Z + 0.090);
    m.rotation.z = rot;
    m.renderOrder = 2;
    return m;
  };
  //
  // These are two stops LIGHTER than they were. At 0.80/0.70 they took 47 % of
  // the safe box below 10 % luminance and left the left third of the frame a
  // flat void, which is the same fault as a blown highlight seen from the other
  // end. A flag is meant to make a ramp, not a hole; identification is now
  // carried by the hero being the only alloy fascia among black ones.
  const H2 = Math.PI / 2;
  root.add(flag(1.16, 0.600, 0, 1.040, 0, 0.86));         // above: bays 4 and 5
  root.add(flag(1.16, 0.568, 0, 0.324, Math.PI, 0.74));   // below: bays 2, 1, 0
  // The side flags are deep in y as well as wide, because the rack's shelf edge
  // trim recedes diagonally out of the fascia plane and a narrow band left the
  // far end of it as the brightest thing in the frame. Their near edge is at
  // ±0.6275 − 0.350 = ±0.2775 m, which is the chassis' own end.
  root.add(flag(0.640, 0.700, 0.6275, 0.665, -H2, 0.80, alphaTight));
  root.add(flag(0.640, 0.700, -0.6275, 0.665, H2, 0.80, alphaTight));

  // --- one card, directly under the hero, clear of it --------------------------
  // Written in screen pixels and measured off the render, not asserted. The
  // chassis lands y 138…414 and 846 px wide; the card is 760 × 422 px spanning
  // y 478…900, so it is narrower than the hero, does not touch it, leaves a
  // 64 px band between them for the identifying label, and is deep enough to
  // cover both the DAC's readout above it and the power amplifier's meters
  // below — neither of which belongs in this chapter's frame.
  const PAD = 0.020;
  const OW = 760 / CARD_PX, OH = 422 / CARD_PX;
  const CW = OW - PAD * 2, CH = OH - PAD * 2;
  const holder = new THREE.Group();
  holder.position.copy(place(HX, -0.378, CARD_DIST));
  holder.lookAt(CAM);
  // A card square to the lens is a decal. 5° of yaw gives the glass over it
  // somewhere to sweep the front strip from and gives the frame's left edge a
  // visible thickness, without skewing the type (9° did).
  holder.rotateY(-0.090);
  root.add(holder);

  // The card is an object in the room, not a pasted PNG: a 12 mm machined plate
  // with a satin edge chamfer standing proud of it, so it catches the rig, casts
  // a shadow back onto the rack and has a lit edge on the side nearest the key.
  const frameMat = M.anodBlack.clone();
  frameMat.color.setHex(0x0c0e12);
  frameMat.roughness = 0.44;
  // A DIELECTRIC, not the trim alloy. Every metal in the library is metalness 1,
  // and a metal chamfer 2 mm wide under the room's spotlights returns a specular
  // far above 1.0 in linear — the card's top edge was the second-largest blown
  // area in the frame. A satin dark polymer bezel reflects ~4 % and ramps.
  const bezMat = M.plastic.clone();
  bezMat.color.setHex(0x1f2329);
  bezMat.roughness = 0.62;
  bezMat.clearcoat = 0.22;
  bezMat.clearcoatRoughness = 0.42;
  bezMat.envMapIntensity = 0.45;
  const bez = new THREE.Mesh(GEO.bevelBox(OW + 0.0050, OH + 0.0050, 0.0135, 0.0018, 3), bezMat);
  bez.position.z = -0.0090;
  bez.castShadow = bez.receiveShadow = true;
  holder.add(bez);
  const body = new THREE.Mesh(GEO.bevelBox(OW + 0.0008, OH + 0.0008, 0.0142, 0.0014, 3), frameMat);
  body.position.z = -0.0083;
  body.castShadow = false; body.receiveShadow = true;
  holder.add(body);

  const card = new THREE.Group();
  card.position.set(-CW / 2, -CH / 2, 0);
  holder.add(card);

  // Opaque. The card sits over blown rack trims whose linear values are well
  // above 1, so even 3.5 % transmission printed them straight through the plot.
  const plate = DIAG.diagramCard(CW, CH, { opacity: 1.0, pad: PAD });
  // fadeTree captures a mesh's opacity the first time it sees it, and the app's
  // first call happens at reveal 0 — seed the plate or it never comes back.
  plate.userData.plate.userData._baseOp = 1.0;
  // A pure-black plate is a hole in the frame: it took a quarter of the safe box
  // below 3 % luminance and hollowed out the mid-tone mass. This is still deep
  // enough for a 2 px trace to read against, and the glass over it now has a
  // value to lay its gradient onto.
  //
  // MATTE, though, and this is the whole reason the card was printing at 54 %
  // mean luminance against the hero's 17 %. The plate faces the lens, so its
  // specular ray reflects straight back past the camera into the beauty box —
  // the largest and brightest emitter in the rig — and the library card's
  // clearcoat 0.60 returned it across the entire face as one flat wash. The
  // specular event on this card belongs to the glass in front of it, which is
  // crowned and therefore sweeps; the plate behind it is an eggshell panel.
  //
  // Three measurements to find this. Dropping the glass in front of the plate
  // from 0.24 to 0.18 opacity moved the card by 0.1 points, so it was not the
  // glass; dropping the plate's envMapIntensity from 0.26 to 0.05 moved it by
  // 0.8, so it was not the image-based lighting either. It is DIFFUSE from the
  // room's direct lights — a key at 2.10, a foreground spot at 6 and a pool spot
  // at 9, through an exposure of 1.92 — and the only term a Lambert lobe under
  // that has is its albedo. So the albedo is the control: 0x0c1016 is 0.0056 in
  // linear, half of what was here, and that is what puts the card under the
  // hero instead of a stop above it.
  const pm = plate.userData.plate.material;
  pm.color.setHex(0x0c1016);
  pm.roughness = 0.90;
  pm.clearcoat = 0.0;
  pm.envMapIntensity = 0.05;
  // ...and the other half of a Lambert panel under three hard sources is its
  // Fresnel term, which at the default F0 of 4 % is worth more than the albedo
  // is. An instrument card is anti-reflection coated — that is the whole point
  // of a matte fascia behind glass — so F0 comes down to 1 %.
  pm.specularIntensity = 0.25;
  card.add(plate);

  // ======================= 1. the RIAA curves ==============================
  const GX = 0.030, GW = CW - GX - 0.008;
  const g = new DIAG.Graph({
    w: GW, h: 0.1240, xLog: true, xRange: [20, 20000], yRange: [-25, 25],
    yTicks: [-20, -10, 0, 10, 20], zeroLine: 0,
  });
  g.position.set(GX, 0.0660, 0);
  card.add(g);
  R.graph = g;

  // The library grid is 0x2a2f36, which is the same luminance as the plate now
  // that the plate is a properly dark instrument panel — the graph was drawing a
  // grid nobody could see. Lifting it two stops is what makes it a plot rather
  // than two curves floating on a rectangle.
  for (const gr of [g]) if (gr._gridMat) { gr._gridMat.color.setHex(0x4a525d); gr._gridMat.opacity = 0.62; }

  for (const f of [F1, F2, F3]) g.addMarker(f, { color: PAL.ink3, width: 1.2, opacity: 0.55 });

  g.addTrace((f) => DSP.riaaRecordDb(f), { color: PAL.am, width: 2.8, n: 420, z: 0.0006 });
  g.addTrace((f) => playDb(f), { color: PAL.cy, width: 2.8, n: 420, z: 0.0008 });

  R.cursor = g.addMarker(1000, { color: PAL.ink, width: 1.4, dashed: false, opacity: 0.42 });
  R.dotRec = g.addDot(PAL.am, 0.0042);
  R.dotPlay = g.addDot(PAL.cy, 0.0042);

  // A plot a reader cannot take a value off is a decoration. The unit rides on
  // the top numeral, so the axis is labelled once without a fourth label.
  g.tickLabels(L, {
    yVals: [-20, 0, 20],
    yFmt: (v) => (v > 0 ? '+' + v + ' dB' : String(v)),
    yOffset: [-22, 0],
  });

  // ======================= 2. the error lane ===============================
  // The sum of the two curves above is ±0.06 dB, which on a ±25 dB axis is one
  // pixel — indistinguishable from the zero line, so the whole "a result, not an
  // identity" argument was invisible in the picture. It gets its own lane on the
  // same frequency axis at ±0.13 dB full scale, with the ±0.10 dB that the same
  // parts' tolerance costs marked in dashes just inside the frame: the design
  // error is visibly inside the tolerance, which is the point.
  const gl = new DIAG.Graph({
    w: GW, h: 0.0290, xLog: true, xRange: [20, 20000], yRange: [-0.13, 0.13],
    yTicks: [], zeroLine: 0,
  });
  gl.position.set(GX, 0.0100, 0);
  card.add(gl);
  R.lane = gl;
  if (gl._gridMat) { gl._gridMat.color.setHex(0x4a525d); gl._gridMat.opacity = 0.62; }

  for (const s of [1, -1]) {
    gl.add(poly([V3(0, gl.y(s * TOL_DB), 0.0004), V3(GW, gl.y(s * TOL_DB), 0.0004)],
      PAL.ink3, 1.3, { opacity: 0.75, dashed: true, dashSize: 0.007, gapSize: 0.005 }));
  }
  gl.addTrace((f) => sumDb(f), { color: PAL.gr, width: 3.0, n: 520, z: 0.0010 });
  R.laneCursor = gl.addMarker(1000, { color: PAL.ink, width: 1.4, dashed: false, opacity: 0.42 });
  R.dotSum = gl.addDot(PAL.gr, 0.0042);

  gl.tickLabels(L, {
    xVals: [20, 100, 1000, 10000],
    xFmt: (v) => (v >= 1000 ? v / 1000 + ' k' : String(v)),
    xOffset: [0, 14],
  });

  // ======================= the specular layer over the card ================
  // The plot is a lit panel and it needs a reflection sitting in front of what
  // is underneath it. The previous answer here was a cylindrical section with
  // ADDITIVE blending, which is the wrong model twice over: a partly-reflecting
  // dielectric does not add its reflection to full transmission, it splits the
  // budget, and the additive term is unbounded. Measured off the shipped frame
  // it took the card to 62 % mean luminance — brighter than the hero, so the
  // picture's hierarchy was inverted by a piece of glass.
  //
  // `GEO.instrumentGlass` is the shared part and it composites correctly: 4 mm
  // of paraboloid crown across the card so the front strip sweeps as a band,
  // reflectivity 0.34 for a coated cover glass, and normal blending at 26 %, so
  // the traces are dimmed by a quarter exactly as real glass dims them.
  const glass = GEO.instrumentGlass(OW + 0.006, OH + 0.006, {
    crown: 0.0034, roughness: 0.19, tint: 0x05070b, segs: 32,
  });
  // The helper sets BOTH `reflectivity` 0.34 (F0 ≈ 2.7 %, a coated cover glass)
  // and `clearcoat` 1.0, which adds a second full dielectric lobe on top of the
  // first — about 7 % total, not 1.7 %. On a panel this large, facing a lens
  // that has the rig's biggest softbox directly behind it, that is the whole
  // difference between a sheen and a wash. One lobe only.
  //
  // Measured with the clearcoat removed and opacity 0.24, the card still read
  // 27.5 % mean — and the padding outside the plot and the empty middle of the
  // plot read 28.2 % and 27.6 %, i.e. a FLAT veil, which is the one thing a
  // specular layer must not be. It is the environment term that is flat here,
  // not the geometry, so the environment term comes down and the crown's own
  // Fresnel sweep is what is left: a band running from about 12 % to 24 % across
  // the panel instead of 28 % everywhere.
  glass.material.clearcoat = 0.0;
  glass.material.envMapIntensity = 0.28;
  glass.material.opacity = 0.18;
  glass.position.z = 0.0040;
  glass.castShadow = glass.receiveShadow = false;
  holder.add(glass);

  // ======================= labels ==========================================
  const lab = {};

  // The identifying label goes in the 55 px band between the chassis and the
  // card — the only clear horizontal run in the frame, and it names the thing
  // directly above it. Placed through `place()`, so it lands where the
  // arithmetic says rather than wherever an offset from a corner happens to
  // fall: geometric ndc x −0.3125 is screen x 420 once the director's −0.1625
  // shift is applied, and ndc y +0.026 is screen y 487.
  lab.hero = L.add(place(-0.3125, 0.108, CARD_DIST), {
    kicker: 'Bay 3 · moving-coil phono',
    value: G_STAGE_DB.toFixed(2) + ' dB at 1 kHz · ' + CART.loadOhm + ' Ω',
    cls: 'lead', occlude: false, offset: [0, 0], priority: 9,
  });

  // The two curves cross at 1 kHz, which leaves exactly three large clear areas
  // on the plot: the wedge either side of the crossing, and the band above the
  // crossing between cyan's fall and amber's rise. Each label sits in one of
  // them, so nothing is written over a trace.
  lab.play = L.add(anchor(g, g.x(70), g.y(0)), {
    kicker: 'Playback · network', cls: 'acc plain', occlude: false, priority: 5,
    value: sgn(playDb(20)) + ' dB at 20 Hz', offset: [0, 0],
  });
  lab.rec = L.add(anchor(g, g.x(1000), g.y(15.5)), {
    kicker: 'Record · standard', cls: 'am plain', occlude: false, priority: 5,
    value: sgn(DSP.riaaRecordDb(20000)) + ' dB at 20 kHz', offset: [0, 0],
  });
  lab.err = L.add(anchor(card, GX + GW / 2, 0.0520), {
    kicker: 'Record + network · error',
    text: 'dashed: ±' + TOL_DB.toFixed(2) + ' dB, parts tolerance',
    cls: 'plain', occlude: false, priority: 6,
    value: sgn(ERR.hi, 3) + ' / ' + sgn(ERR.lo, 3) + ' dB', offset: [0, 0],
  });

  R.lab = lab;
  return { overlay: root, R };
}

// ---------------------------------------------------------------------------
let R = null;

export default {
  id: 'phono',
  title: 'RIAA Equalisation',
  nav: 'Phono stage',
  kicker: 'Phono stage',
  standfirst: 'A curve cut into the groove, and the network that takes it out.',
  shot: SHOT,
  timeScale: 1,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildHardware();
    const built = buildOverlay(ctx);
    R = built.R;
    return { hardware, overlay: built.overlay };
  },

  update(dt, t) {
    if (!R) return;

    // ---- swept sine, 20 Hz → 20 kHz in 20 s, in real time ------------------
    const ph = (((t / SWEEP + PH0) % 1) + 1) % 1;
    const f = 20 * Math.pow(1000, ph);
    S.f = f;
    S.rec = DSP.riaaRecordDb(f);
    S.play = playDb(f);
    S.sum = S.rec + S.play;
    // A constant-velocity source cut with pre-emphasis presents the cartridge
    // output as the record curve; the stage hands back a level output.
    S.vin = V_IN * DSP.undB(S.rec);
    S.gain = G_STAGE_DB + S.play;
    S.vout = S.vin * DSP.undB(S.gain);

    R.cursor.userData.setX(f);
    R.laneCursor.userData.setX(f);
    R.dotRec.userData.setData(f, S.rec);
    R.dotPlay.userData.setData(f, S.play);
    R.dotSum.userData.setData(f, S.sum);
  },

  content() {
    return `
<p>A moving-coil cartridge is a velocity transducer: output follows how fast the
groove wall moves, not how far. Displacement is
<span class="num">a = v&#770;/&omega;</span>, so excursion grows as
<span class="num">1/f</span>.</p>

<div class="key"><span class="lab">The idea</span><p>Cut flat at
<span class="num">${(V_REF * 100).toFixed(0)} cm/s</span>, 50 Hz would want
<span class="num">&plusmn;${(A_50_FLAT * 1e6).toFixed(1)} &micro;m</span> against a
<span class="num">${(PITCH * 1e6).toFixed(0)} &micro;m</span> pitch. Pre-emphasis puts it
<span class="num">${Math.abs(REC_50).toFixed(2)} dB</span> down, so the cut is
<span class="num">&plusmn;${(A_50_CUT * 1e6).toFixed(1)} &micro;m</span> and the land survives. Cyan
undoes it &mdash; not as an algebraic inverse but as a network in stock parts,
so their sum is a <em>result</em>: <span class="num">+${ERR.hi.toFixed(3)} dB</span>.</p></div>

<div class="eq">(1+sT&#8322;)/(1+sT&#8321;)(1+sT&#8323;)  <span class="c">fitted (ideal) Hz</span>
T&#8321; ${((NET.R1 + NET.R2) / 1e3).toFixed(1)} k &middot; ${(NET.C1 * 1e9).toFixed(0)} nF  ${(TR.T1 * 1e6).toFixed(0)} &micro;s <span class="hl">${FR.f1.toFixed(2)}</span> (${F1.toFixed(2)})
T&#8322; ${(NET.R2 / 1e3).toFixed(2)} k &middot; ${(NET.C1 * 1e9).toFixed(0)} nF  ${(TR.T2 * 1e6).toFixed(1)} &micro;s <span class="hl">${FR.f2.toFixed(1)}</span> (${F2.toFixed(1)})
T&#8323; ${(NET.R3 / 1e3).toFixed(2)} k &middot; ${(NET.C2 * 1e9).toFixed(0)} nF   ${(TR.T3 * 1e6).toFixed(1)} &micro;s <span class="hl">${FR.f3.toFixed(0)}</span> (${F3.toFixed(0)})</div>

<p>Passive de-emphasis costs
<span class="num">${Math.abs(NET_LOSS_1K).toFixed(2)} dB</span>, so the blocks make
<span class="num">${AMP_RAW_DB.toFixed(2)} dB</span> for
<span class="num">${G_STAGE_DB.toFixed(2)}</span> net.
<span class="num">${(V_IN * 1e6).toFixed(1)} &micro;V</span> in,
<span class="num">${(V_OUT * 1e3).toFixed(1)} mV</span> out,
<span class="num">${SNR_DB.toFixed(1)} dB</span> above
<span class="num">${(V_NOISE * 1e9).toFixed(1)} nV</span> over the curve's
<span class="num">${(ENB / 1000).toFixed(2)} kHz</span>, not a flat 20.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>The earth wire is
not the signal return: the coil has its own screened
<span class="num">${TONEARM.litzMm2.toFixed(3)} mm&sup2;</span> pair.</p></div>
`;
  },

  // Every row except the first is a value AT THE SWEPT FREQUENCY, not at the
  // 1 kHz reference the prose derives, and the keys now say so. Without that,
  // 'GAIN 60.46 dB' reads as a contradiction of the prose's 64.00 dB, and
  // 'IN → OUT  0.389 → 410 mV rms' reads as 0.389 mV in against a stated
  // 258.7 µV. Both were the same number quoted at two operating points.
  readouts() {
    return [
      {
        k: 'SWEEP f', u: 'Hz', cls: 'acc', bar: Math.log10(S.f / 20) / 3,
        v: S.f < 1000 ? S.f.toFixed(1) : String(Math.round(S.f)),
      },
      { k: 'RECORD EQ @ f', v: sgn(S.rec), u: 'dB', cls: 'am' },
      { k: 'PLAYBACK EQ @ f', v: sgn(S.play), u: 'dB', cls: 'acc' },
      { k: 'ERROR @ f', v: sgn(S.sum, 3), u: 'dB', cls: '' },
      { k: 'GAIN @ f', v: S.gain.toFixed(2), u: 'dB', cls: 'am', bar: S.gain / 90 },
      {
        k: 'IN → OUT @ f',
        v: (S.vin * 1e6).toFixed(1) + ' µV → ' + (S.vout * 1e3).toFixed(0) + ' mV',
        u: 'rms', cls: 'acc',
      },
    ];
  },
};
