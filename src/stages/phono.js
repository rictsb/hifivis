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
const A_50_FLAT = exc(V_REF, 50);               // 159.155 µm

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
// FRAMING
//
// The subject is a 555 × 112 × 440 mm box in bay 3 of six near-identical bays.
// Two things follow. (1) `fill` is a fraction of the safe-box HEIGHT, so the
// radius handed to frameShot must be the chassis' apparent HALF-HEIGHT, not its
// bounding sphere — a bounding sphere is dominated by the 555 mm width and
// leaves the chassis 85 px tall. (2) The camera is lifted so the top face is in
// view: at 21° the silhouette is 217 mm tall rather than 112, which is what
// makes a rack component read as an object instead of a strip.
//
// The 555 mm width is the binding constraint, not the height: at fill 0.33 the
// chassis is 905 px wide inside a 960 px safe box, and any more fill pushes it
// through x = 160 / x = 1120. So the hero is made to dominate by being the only
// fully-lit chassis in frame (the flags below) rather than by being enlarged.
//
// At 1600 × 1000 this lands the chassis at x 190…1090, y 188…372, and the card
// at x 452…1112, y 435…915 — both inside the safe box (160…1120, 90…930).
// ---------------------------------------------------------------------------
const CH_H = 0.112, CH_FOOT = 0.008;
const CH_D = LAYOUT.rack.d - 0.06;                          // 0.440
const HERO_Y = LAYOUT.bayCentre(3, CH_H) + CH_FOOT;         // 0.678
const HERO_Z = LAYOUT.rack.z + CH_D / 2;                    // fascia plane, −3.08
const AZ = 0.40, EL = 0.36, FOV = 30;
const HERO_R = 0.1103;          // chassis half-height + the top face in view
const FILL = 0.33;
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
const HX = -0.0375, HY = 0.44;
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

// The card floats 0.17 m in front of the fascia plane. Fixing its distance as a
// fraction of the camera distance keeps its size on screen invariant if the
// framing is retuned.
// One metre on the card's plane is 500/(CARD_DIST·tan(fov/2)) ≈ 1420 px at
// 1600 × 1000, which is how every dimension on it below was chosen.
const CARD_DIST = 0.885 * DIST;

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
function flagAlpha(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const sm = (t) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;             // ImageData row 0 is the TOP
    const fv = sm(v / 0.08) * sm((1 - v) / 0.12);
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

  // Brushed alloy, one notch off the library's default. The 6.4 mm break on the
  // fascia's top edge matters more than the colour does: at the previous 4.5 mm
  // the reflected front strip clipped to white over the panel's whole width with
  // no ramp either side of it, which is the single artefact that says "render".
  const face = M.alu.clone();
  face.color.setHex(0xc0c5cb);
  face.roughness = 0.300;
  face.envMapIntensity = 0.82;

  // The hero's own shell is a shade above the black-anodised boxes either side of
  // it, so its top face reads as a surface rather than as a hole in the frame.
  const shellMat = M.anodBlack.clone();
  shellMat.color.setHex(0x25282d);
  shellMat.roughness = 0.38;

  // Satin trim, not mirror. A 2 mm bar is narrower than the reflected image of
  // the softbox, so a chrome finish makes the whole section clip and bloom.
  const trim = M.aluTrim.clone();
  trim.color.setHex(0xb4b9c0);
  trim.roughness = 0.40;
  trim.envMapIntensity = 0.62;

  const g = new THREE.Group();
  g.position.set(R.x, HERO_Y, R.z);

  g.add(GEO.chassis(W, H, D, { r: 0.0040, seg: 4, faceThick: FT, body: shellMat, face }));

  // --- fascia -----------------------------------------------------------------
  // Applied centre plate, standing 1.2 mm proud. It carries a clearcoat so the
  // wide front strip lays a bright-to-mid ramp across it instead of one value.
  const plateMat = M.anodBlack.clone();
  plateMat.color.setHex(0x141619);
  plateMat.roughness = 0.34;
  plateMat.clearcoat = 0.72;
  plateMat.clearcoatRoughness = 0.16;
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
    const k = GEO.knob(r, 0.0160, { body: face, mark: trim, flutes: 60 });
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
  // A display without glass over it is a decal. This is a 3.7 mm-crowned clear
  // panel across the indicator well: a cylindrical section, so the normal turns
  // through 31° over the window height and the reflection of the wide front
  // strip sweeps across it as a soft band rather than sitting as a flat patch.
  //
  // It is mats().glass with its albedo taken to black and its blending set to
  // additive: a partly-reflecting dielectric ADDS its reflection to what it
  // transmits, so the segments behind stay readable and only the specular and
  // clearcoat terms survive. Ordinary alpha would dim the reflection too.
  const LR = 0.105, LARC = 0.0545 / LR;
  const lensMat = M.glass.clone();
  lensMat.color.setHex(0x000000);
  lensMat.roughness = 0.050;
  lensMat.clearcoatRoughness = 0.024;
  lensMat.envMapIntensity = 3.6;
  lensMat.transparent = true;
  lensMat.depthWrite = false;
  lensMat.blending = THREE.AdditiveBlending;
  lensMat.side = THREE.FrontSide;
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(LR, LR, 0.2165, 64, 1, true, -LARC / 2, LARC), lensMat,
  );
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0, 0, fz + 0.0058 - LR);
  lens.castShadow = lens.receiveShadow = false;
  lens.frustumCulled = false;
  lens.renderOrder = 4;
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
  const alpha = flagAlpha();
  const flag = (w, h, cx, cy, rot, op = 0.80) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: 0x04050a, transparent: true, opacity: op, alphaMap: alpha,
        depthWrite: false, toneMapped: false,
      }));
    m.position.set(cx, cy, HERO_Z + 0.045);
    m.rotation.z = rot;
    m.renderOrder = 2;
    return m;
  };
  const H2 = Math.PI / 2;
  root.add(flag(1.16, 0.600, 0, 1.040, 0));            // above: bays 4 and 5
  // The bays BELOW are held a stop lighter than the rest: they are the only
  // thing giving the lower-left quarter of the frame any structure at all, and
  // at full density that quarter went to a single flat near-black.
  root.add(flag(1.16, 0.568, 0, 0.324, Math.PI, 0.70));   // below: bays 2, 1, 0
  // The side flags are deep in y as well as wide, because the rack's shelf edge
  // trim recedes diagonally out of the fascia plane and a narrow band left the
  // far end of it as the brightest thing in the frame.
  root.add(flag(0.640, 0.700, 0.640, 0.665, -H2));     // right of the fascia
  root.add(flag(0.640, 0.700, -0.640, 0.665, H2));     // left of the fascia

  // --- one card, floating clear of the rack -----------------------------------
  const CW = 0.4000, CH = 0.2760, PAD = 0.020;
  const holder = new THREE.Group();
  holder.position.copy(place(0.145, -0.335, CARD_DIST));
  holder.lookAt(CAM);
  // A card square to the lens is a decal. Yawing it 9° off the axis gives the
  // glass over it somewhere to sweep the front strip from, and gives the frame's
  // left edge a visible thickness.
  holder.rotateY(-0.157);
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
  bezMat.color.setHex(0x474c54);
  bezMat.roughness = 0.58;
  bezMat.clearcoat = 0.25;
  bezMat.clearcoatRoughness = 0.38;
  bezMat.envMapIntensity = 0.55;
  const OW = CW + PAD * 2, OH = CH + PAD * 2;
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
  plate.userData.plate.material.color.setHex(0x0f1318);
  card.add(plate);

  // ======================= 1. the RIAA curves ==============================
  const GX = 0.034, GW = CW - GX - 0.008;
  const g = new DIAG.Graph({
    w: GW, h: 0.1620, xLog: true, xRange: [20, 20000], yRange: [-25, 25],
    yTicks: [-20, -10, 0, 10, 20], zeroLine: 0,
  });
  g.position.set(GX, 0.1060, 0);
  card.add(g);
  R.graph = g;

  for (const f of [F1, F2, F3]) g.addMarker(f, { color: PAL.ink3, width: 1.2, opacity: 0.55 });

  g.addTrace((f) => DSP.riaaRecordDb(f), { color: PAL.am, width: 2.8, n: 420, z: 0.0006 });
  g.addTrace((f) => playDb(f), { color: PAL.cy, width: 2.8, n: 420, z: 0.0008 });

  R.cursor = g.addMarker(1000, { color: PAL.ink, width: 1.4, dashed: false, opacity: 0.42 });
  R.dotRec = g.addDot(PAL.am, 0.0042);
  R.dotPlay = g.addDot(PAL.cy, 0.0042);

  // A plot a reader cannot take a value off is a decoration.
  g.tickLabels(L, {
    yVals: [-20, 0, 20],
    yFmt: (v) => (v > 0 ? '+' : '') + v,
    yOffset: [-19, 0],
  });

  // ======================= 2. the error lane ===============================
  // The sum of the two curves above is ±0.06 dB, which on a ±25 dB axis is one
  // pixel — indistinguishable from the zero line, so the whole "a result, not an
  // identity" argument was invisible in the picture. It gets its own lane on the
  // same frequency axis at ±0.13 dB full scale, with the ±0.10 dB that the same
  // parts' tolerance costs marked in dashes just inside the frame: the design
  // error is visibly inside the tolerance, which is the point.
  const gl = new DIAG.Graph({
    w: GW, h: 0.0460, xLog: true, xRange: [20, 20000], yRange: [-0.13, 0.13],
    yTicks: [], zeroLine: 0,
  });
  gl.position.set(GX, 0.0300, 0);
  card.add(gl);
  R.lane = gl;

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
  // The plot is a lit panel, and nothing in this piece had a reflection sitting
  // in front of what was underneath it. This is a crowned clear panel over the
  // whole card: 12 mm of crown across 320 mm, so the surface normal turns
  // through 17° top to bottom and the widened front strip sweeps across it as a
  // soft band. Black albedo, additive, so it adds a reflection to the traces
  // rather than veiling them.
  //
  // The clearcoat is OFF. mats().glass carries clearcoat 1.0, and a clearcoat
  // lobe on top of the base specular took the whole panel to a white wash that
  // buried the traces. A sheet of glass reflects ~4 % at normal incidence and
  // rises at the edges by Fresnel, which is exactly what the base dielectric
  // lobe gives — a soft band across the crown, not a veil.
  const CR = 1.10, CARC = (OH + 0.040) / CR;
  const glassMat = M.glass.clone();
  glassMat.color.setHex(0x000000);
  glassMat.roughness = 0.170;
  glassMat.clearcoat = 0.0;
  glassMat.specularIntensity = 0.50;
  glassMat.envMapIntensity = 0.45;
  glassMat.transparent = true;
  glassMat.depthWrite = false;
  glassMat.blending = THREE.AdditiveBlending;
  glassMat.side = THREE.FrontSide;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(CR, CR, OW + 0.004, 72, 1, true, -CARC / 2, CARC), glassMat,
  );
  glass.rotation.z = Math.PI / 2;
  glass.position.set(0, 0, 0.0035 - CR);
  glass.castShadow = glass.receiveShadow = false;
  glass.frustumCulled = false;
  glass.renderOrder = 16;
  holder.add(glass);

  // ======================= labels ==========================================
  const lab = {};

  // The identifying label is pinned to the hero with a leader dot, in the flagged
  // gap immediately below its own fascia — not to the shelf above it.
  lab.hero = L.add(V3(-0.17, 0.585, HERO_Z + 0.03), {
    kicker: 'Bay 3 · moving-coil phono',
    value: G_STAGE_DB.toFixed(2) + ' dB at 1 kHz · ' + CART.loadOhm + ' Ω',
    cls: 'lead', occlude: false, offset: [104, 0], priority: 9,
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
  lab.err = L.add(anchor(card, GX + GW / 2, 0.0910), {
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
<p>A moving-coil cartridge is a velocity transducer: its output follows how
fast the groove wall moves, not how far. Peak displacement is
<span class="num">a = v&#770;/&omega;</span>, so excursion grows as
<span class="num">1/f</span>: at <span class="num">${(V_REF * 100).toFixed(0)} cm/s</span>, 50 Hz wants
<span class="num">&plusmn;${(A_50_FLAT * 1e6).toFixed(1)} &micro;m</span> against a
<span class="num">${(PITCH * 1e6).toFixed(0)} &micro;m</span> groove pitch.</p>

<div class="key"><span class="lab">The idea</span><p>The cyan curve is
<em>not</em> the algebraic inverse of the amber one: it is the network below, in
stock parts. Their sum is a result &mdash;
<span class="num">+${ERR.hi.toFixed(3)} dB</span>, inside the parts' own
<span class="num">&plusmn;${TOL_DB.toFixed(2)} dB</span>.</p></div>

<div class="eq">(1+sT&#8322;)/(1+sT&#8321;)(1+sT&#8323;)  <span class="c">fitted (ideal) Hz</span>
T&#8321; ${((NET.R1 + NET.R2) / 1e3).toFixed(1)} k &middot; ${(NET.C1 * 1e9).toFixed(0)} nF  ${(TR.T1 * 1e6).toFixed(0)} &micro;s <span class="hl">${FR.f1.toFixed(2)}</span> (${F1.toFixed(2)})
T&#8322; ${(NET.R2 / 1e3).toFixed(2)} k &middot; ${(NET.C1 * 1e9).toFixed(0)} nF  ${(TR.T2 * 1e6).toFixed(1)} &micro;s <span class="hl">${FR.f2.toFixed(1)}</span> (${F2.toFixed(1)})
T&#8323; ${(NET.R3 / 1e3).toFixed(2)} k &middot; ${(NET.C2 * 1e9).toFixed(0)} nF   ${(TR.T3 * 1e6).toFixed(1)} &micro;s <span class="hl">${FR.f3.toFixed(0)}</span> (${F3.toFixed(0)})</div>

<p>The network loses <span class="num">${Math.abs(NET_LOSS_1K).toFixed(2)} dB</span>, so the
blocks make <span class="num">${AMP_RAW_DB.toFixed(2)} dB</span> for
<span class="num">${G_STAGE_DB.toFixed(2)}</span> net:
<span class="num">${(V_IN * 1e6).toFixed(1)} &micro;V</span> in,
<span class="num">${(V_OUT * 1e3).toFixed(1)} mV</span> out on
<span class="num">${(V_NOISE * 1e9).toFixed(1)} nV</span> of noise over the
<span class="num">${(ENB / 1000).toFixed(2)} kHz</span> the curve leaves, not a flat 20 &mdash;
<span class="num">${SNR_DB.toFixed(1)} dB</span> down.
<span class="num">+${G_REST_DB.toFixed(2)} dB</span> more lands
<span class="num">${V_TERM.toFixed(3)} V</span> &mdash;
<span class="num">${W_TERM.toFixed(3)} W</span> into <span class="num">${SPEAKER.nominalZ} &Omega;</span>.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>The earth wire is
not the signal return: the coil's two terminals have their own screened
<span class="num">${TONEARM.litzMm2.toFixed(3)} mm&sup2;</span> pair.</p></div>
`;
  },

  readouts() {
    return [
      {
        k: 'SWEEP', u: 'Hz', cls: 'acc', bar: Math.log10(S.f / 20) / 3,
        v: S.f < 1000 ? S.f.toFixed(1) : String(Math.round(S.f)),
      },
      { k: 'RECORD EQ', v: sgn(S.rec), u: 'dB', cls: 'am' },
      { k: 'PLAYBACK EQ', v: sgn(S.play), u: 'dB', cls: 'acc' },
      { k: 'ERROR', v: sgn(S.sum, 3), u: 'dB', cls: '' },
      { k: 'GAIN', v: S.gain.toFixed(2), u: 'dB', cls: 'am', bar: S.gain / 90 },
      {
        k: 'IN → OUT',
        v: (S.vin * 1e3).toFixed(3) + ' → ' + (S.vout * 1e3).toFixed(0),
        u: 'mV rms', cls: 'acc',
      },
    ];
  },
};
