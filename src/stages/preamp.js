import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import * as T from '../core/tex.js';
import { PREAMP, PHONO, AMP, CART, DRIVER, SPEAKER, CHAIN } from '../core/spec.js';

/* ===========================================================================
   GAIN & CONTROL — the line preamplifier.

   Primaries come from src/core/spec.js: the line stage's own gain and output
   impedance, and — through CHAIN — the setting this system actually runs at.
   Everything else below is either a stated local design premise (a component
   value the engineer picks) or is derived from those premises in code.
   =========================================================================== */

// ---- physical constants ---------------------------------------------------
const K_B = 1.380649e-23;          // J/K
const T_K = 293.15;                // K (20 °C)
const BW = 20000;                  // Hz, 20 Hz–20 kHz measurement bandwidth
/** Johnson–Nyquist noise over BW: e = √(4kTB·R). This is V per √Ω. */
const EK = Math.sqrt(4 * K_B * T_K * BW);      // 1.7994e-8 V/√Ω

// ---- primaries from the system specification ------------------------------
const GAIN_DB = PREAMP.gainDb;     // dB, fixed voltage gain of the line stage
const R_ACT = PREAMP.zOut;         // Ω, output-buffer source impedance

// ---- local design premises (declared here, nowhere else) ------------------
const V_SRC = 2.000;               // V rms, DAC output at 0 dBFS (CTA-2006)
const SRC_DR = 120;                // dB, source dynamic range, unwtd/20 kHz
const EN_DENS = 1.8e-9;            // V/√Hz, input-referred noise of the block
const R_LAD = 10000;               // Ω, ladder image/termination impedance
const R_LOAD = 47000;              // Ω, power-amp input impedance
const C_PER_M = 100e-12;           // F/m, interconnect capacitance
const CABLE_L = 3.0;               // m
const RAIL = 18.0;                 // V, gain-stage supply rails
const V_SAT = 2.0;                 // V, saturation loss at each rail
const R_PASSIVE = 10000;           // Ω, 40 kΩ passive pot at its midpoint
const RELAY_W = 0.0124;            // m, real signal-relay case width

// ---- derived ---------------------------------------------------------------
const G = DSP.undB(GAIN_DB);                       // 3.1623
const E_SRC = V_SRC * DSP.undB(-SRC_DR);           // 2.000 µV
const E_NI = EN_DENS * Math.sqrt(BW);              // 0.2546 µV
const C_CABLE = C_PER_M * CABLE_L;                 // 300 pF
const V_CLIP = (RAIL - V_SAT) / Math.SQRT2;        // 11.314 V rms
const CLIP_DBV = DSP.dB(V_CLIP);                   // +21.07 dBV
const PEAK_DBV = DSP.dB(V_SRC * G);                // +16.02 dBV
const HEADROOM = CLIP_DBV - PEAK_DBV;              // 5.05 dB

/* Where the knob actually sits in this system. 2.83 V at the loudspeaker
   terminals is 1.000 W into SPEAKER.nominalZ, i.e. SPEAKER.sens at 1 m. The
   ladder gives back whatever the rest of the chain over-delivers. */
const V_TERM_1W = Math.sqrt(1.0 * SPEAKER.nominalZ);           // 2.8284 V rms
const ATT_VINYL = -CHAIN.volumeDb;                             // 20.054 dB
const ATT_DIGITAL = -(DSP.dB(V_TERM_1W / V_SRC) - GAIN_DB - AMP.gainDb); // 32.99
const N_VINYL = Math.round(ATT_VINYL);                         // 20
const N_DIGITAL = Math.round(ATT_DIGITAL);                     // 33

const parallel = (a, b) => (a <= 0 || b <= 0 ? 0 : (a * b) / (a + b));
const eR = (R) => EK * Math.sqrt(Math.max(R, 0));

/**
 * Six cascaded constant-input-impedance L-pads, binary-weighted in dB.
 * Each section is designed for a load of R_LAD (the next section's input
 * impedance, or the terminating resistor), so the sections cascade exactly:
 *     r = ratio,  R1 = (1−r)·R,  R2 = rR/(1−r)   with R = R_LAD
 * A relay per section either inserts it or shorts R1 and lifts R2.
 */
const WEIGHTS = [32, 16, 8, 4, 2, 1];
const SECTIONS = WEIGHTS.map((aDb) => {
  const r = DSP.undB(-aDb);
  return { aDb, r, R1: (1 - r) * R_LAD, R2: (r * R_LAD) / (1 - r) };
});

/** Ladder state for an integer attenuation of N dB (0…63). */
function ladderState(N) {
  let z = 0, ratio = 1;
  const on = [];
  for (const s of SECTIONS) {
    const engaged = (N & s.aDb) !== 0;
    on.push(engaged);
    if (engaged) { ratio *= s.r; z = parallel(s.R2, z + s.R1); }
  }
  // the terminating resistor sits across the output node
  return { on, ratio, zOut: parallel(z, R_LAD), N };
}

/** Ladder AFTER the gain block ("attenuate late") — this preamp, as built. */
function chainLate(N) {
  const L = ladderState(N);
  const s = [V_SRC], n = [E_SRC];
  s[1] = s[0] * G;                       n[1] = G * Math.hypot(n[0], E_NI);
  s[2] = s[1] * L.ratio;                 n[2] = Math.hypot(n[1] * L.ratio, eR(L.zOut));
  s[3] = s[2];                           n[3] = Math.hypot(n[2], eR(R_ACT));
  return { L, s, n, snr: DSP.dB(s[3] / n[3]) };
}

/** Ladder BEFORE the gain block ("attenuate early") — the comparison. */
function chainEarly(N) {
  const L = ladderState(N);
  const s = [V_SRC], n = [E_SRC];
  s[1] = s[0] * L.ratio;                 n[1] = Math.hypot(n[0] * L.ratio, eR(L.zOut));
  s[2] = s[1] * G;                       n[2] = G * Math.hypot(n[1], E_NI);
  s[3] = s[2];                           n[3] = Math.hypot(n[2], eR(R_ACT));
  return { L, s, n, snr: DSP.dB(s[3] / n[3]) };
}

/** S/N referred to the (attenuated) output, tabulated for every knob position. */
const SNR_LATE = new Float64Array(64);
const SNR_EARLY = new Float64Array(64);
for (let N = 0; N < 64; N++) { SNR_LATE[N] = chainLate(N).snr; SNR_EARLY[N] = chainEarly(N).snr; }
const MARGIN_OP = SNR_LATE[N_VINYL] - SNR_EARLY[N_VINYL];   // 8.58 dB at −19
const MARGIN_63 = SNR_LATE[63] - SNR_EARLY[63];             // 10.17 dB
const Z_31 = ladderState(31).zOut;                 // 3954 Ω — six pads cascaded
const Z_32 = ladderState(32).zOut;                 // 245 Ω  — one pad, terminated
const Z_33 = ladderState(33).zOut;                 // 1164 Ω
/**
 * THE STEP AT −32 IS REAL, and it is the most interesting thing on the plot.
 * S/N is not monotonic in the setting, because the ladder's own Johnson noise
 * goes as √Zout and Zout is a function of the relay WORD, not of the number of
 * decibels. 011111 cascades six pads and looks back into 3.95 kΩ; 100000 is one
 * 32 dB pad terminated in 10 kΩ and looks back into 245 Ω — 12.1 dB less
 * thermal noise for 1 dB more attenuation.
 */
const STEP_32 = SNR_LATE[32] - SNR_LATE[31];       // +9.40 dB
const STEP_TH = DSP.dB(Math.sqrt(Z_31 / Z_32));    // 12.1 dB of noise-voltage
const KINK = SNR_LATE[32] - SNR_LATE[33];          // 6.33 dB
const KINK_TH = KINK - 1;                          // 5.33 dB of it is thermal

/**
 * Cable + load transfer function. The source drives C_CABLE shunted by R_LOAD,
 * so the −3 dB corner uses the parallel combination, not the source alone.
 */
function loadH(f, rs) {
  const w = DSP.TAU * f;
  const zc = [0, -1 / (w * C_CABLE)];
  const zp = DSP.cDiv(DSP.cMul([R_LOAD, 0], zc), DSP.cAdd([R_LOAD, 0], zc));
  return DSP.cDiv(zp, DSP.cAdd([rs, 0], zp));
}
const loadDb = (f, rs) => DSP.dB(DSP.cAbs(loadH(f, rs)));
const cornerHz = (rs) => 1 / (DSP.TAU * parallel(rs, R_LOAD) * C_CABLE);

const DIV_LOSS = DSP.dB(R_LOAD / (R_PASSIVE + R_LOAD));        // −1.68 dB
const HF_LOSS = loadDb(20000, R_PASSIVE) - DIV_LOSS;           // −0.40 dB

export const MODEL = {
  EK, G, E_SRC, E_NI, V_CLIP, CLIP_DBV, HEADROOM, C_CABLE,
  SECTIONS, ladderState, chainLate, chainEarly, loadDb, cornerHz,
  SNR_LATE, SNR_EARLY, R_PASSIVE, R_ACT, N_VINYL, N_DIGITAL,
  MARGIN_OP, MARGIN_63, Z_31, Z_32, Z_33, STEP_32, STEP_TH, KINK, KINK_TH,
  DIV_LOSS, HF_LOSS,
};

/* ===========================================================================
   HARDWARE — rack bay 4. Three-part machined fascia, knurled volume knob, a
   convex meter lens over the readout, discrete indicators, dense rear.
   =========================================================================== */

const W = LAYOUT.rack.w - 0.03;      // 0.555
const D = LAYOUT.rack.d - 0.06;      // 0.440
const H = 0.098;
const FOOT = 0.007;
const ZF = D / 2;                    // front face, local

// 7-segment map, shared by the front-panel readout and the board silkscreen
const SEGMAP = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
const LB = 0.0125, SW = 0.0026, SD = 0.0016, PITCH = 0.0198;

/** Build the two instanced meshes that make the dB readout. */
function segDisplay() {
  const g = new THREE.Group();
  const hMat = mats().meterGlow.clone(); hMat.color.setHex(0xffffff);
  const vMat = hMat.clone();
  const hGeo = GEO.bevelBox(LB, SW, SD, 0.0006, 2);
  const vGeo = GEO.bevelBox(SW, LB, SD, 0.0006, 2);
  const hPos = [], vPos = [], idx = { h: {}, v: {} };
  const put = (arr, key, x, y) => { idx[arr === hPos ? 'h' : 'v'][key] = arr.length; arr.push([x, y]); };
  // minus sign
  put(hPos, 'minus', -PITCH * 1.05, 0);
  for (let d = 0; d < 2; d++) {
    const x = (d - 0.5) * PITCH + PITCH * 0.42;
    put(hPos, d + 'a', x, LB); put(hPos, d + 'g', x, 0); put(hPos, d + 'd', x, -LB);
    put(vPos, d + 'f', x - LB / 2, LB / 2); put(vPos, d + 'b', x + LB / 2, LB / 2);
    put(vPos, d + 'e', x - LB / 2, -LB / 2); put(vPos, d + 'c', x + LB / 2, -LB / 2);
  }
  const mk = (geo, mat, pts) => {
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pts.length * 3), 3);
    const m = new THREE.Matrix4();
    pts.forEach(([x, y], i) => { m.makeTranslation(x, y, 0); im.setMatrixAt(i, m); });
    im.frustumCulled = false;
    return im;
  };
  const hIm = mk(hGeo, hMat, hPos), vIm = mk(vGeo, vMat, vPos);
  g.add(hIm, vIm);
  g.userData = { hIm, vIm, idx };
  return g;
}

const _c = new THREE.Color();
function setDisplay(disp, N) {
  const { hIm, vIm, idx } = disp.userData;
  const ON = 0x8ddcff, OFF = 0x070d12;
  const lit = new Set();
  if (N > 0) lit.add('minus');
  const s = String(Math.min(99, N)).padStart(2, '0');
  for (let d = 0; d < 2; d++) for (const c of SEGMAP[+s[d]]) lit.add(d + c);
  for (const [arr, im] of [['h', hIm], ['v', vIm]]) {
    for (const k in idx[arr]) {
      _c.setHex(lit.has(k) ? ON : OFF);
      im.setColorAt(idx[arr][k], _c);
    }
    im.instanceColor.needsUpdate = true;
  }
}

/* ---- brushed alloy authored FOR this panel --------------------------------
   The shared brush map is authored square and then stretched over a 555 x 98 mm
   fascia, so its cross-grain frequency lands at a fraction of a pixel, aliases,
   and reads as a uniform screen-space stripe rather than as metal — and the same
   stripe then appears at the same pitch on every other chassis in the rack, so
   nothing has a size. This map is authored in the panel's own millimetres: a
   1.5 mm grain (about three pixels at this magnification, so it survives the
   downsample), wandering and varying in bite the way a belt-sanded face does,
   and dying out where the machined edges break it.
   -------------------------------------------------------------------------- */
const _h1 = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
const _vn = (x) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return _h1(i) * (1 - u) + _h1(i + 1) * u;
};

let _fascia = null;
function fasciaMaps(base = 0.52, amt = 0.30) {
  if (_fascia) return _fascia;
  const N = 512;
  const grain = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const v = y / (N - 1);
    for (let x = 0; x < N; x++) {
      const u = x / (N - 1);
      // the grain wanders about 0.6 mm over the width of the panel
      const w = v + (_vn(u * 7.3 + 3.1) - 0.5) * 0.012;
      const n = _vn(w * 112) * 0.46 + _vn(w * 268 + 21.3) * 0.32 + _vn(w * 630 + 41.7) * 0.22;
      const amp = 0.50 + 0.50 * _vn(u * 5.3 + 61.2);      // the head bites unevenly
      const bite = Math.min(1, Math.min(v, 1 - v) / 0.055); // dies at the machined edges
      grain[y * N + x] = (n - 0.5) * amp * bite;
    }
  }
  const mk = (fill) => {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(N, N);
    fill(im.data);
    ctx.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.needsUpdate = true;
    return t;
  };
  const rough = mk((d) => {
    for (let i = 0, p = 0; i < N * N; i++, p += 4) {
      const v = (i / N | 0) / (N - 1);
      const edge = 1 + 0.30 * Math.max(0, 1 - Math.min(v, 1 - v) / 0.055);
      const r = Math.max(0.10, Math.min(0.95, base * edge + grain[i] * amt * 2));
      d[p] = d[p + 1] = d[p + 2] = (r * 255) | 0; d[p + 3] = 255;
    }
  });
  const norm = mk((d) => {
    const at = (x, y) => grain[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
      const p = (y * N + x) * 4;
      d[p] = ((-dx * 0.5 + 0.5) * 255) | 0;
      d[p + 1] = ((-dy * 0.5 + 0.5) * 255) | 0;
      d[p + 2] = 255; d[p + 3] = 255;
    }
  });
  _fascia = { rough, norm };
  return _fascia;
}

function buildPreamp() {
  const g = new THREE.Group();
  g.position.set(LAYOUT.rack.x, LAYOUT.rack.shelfY[4] + FOOT, LAYOUT.rack.z);
  const M = mats();

  // A clearcoat over the anodised body: without one the lid is a single flat
  // value across 440 mm and the eye reads it as untextured plastic.
  const body = M.anodBlack.clone();
  body.clearcoat = 0.55; body.clearcoatRoughness = 0.26;

  // THE FASCIA. Stock `alu` is roughness 0.26, envMapIntensity 1.0: on a
  // 555 x 98 mm panel seen almost square-on, the reflected image of the wide
  // front strip covers the whole panel, clips to paper white and takes the
  // brush grain with it. Darker, rougher and much less env-hungry puts the ramp
  // back in — bright under the top groove, falling through mid-grey to the
  // bottom — which is the only thing that tells the eye the panel is flat metal
  // and not a lit surface. The maps are authored for this panel's dimensions.
  // The env is a cool blue-white, so a neutral metal albedo comes back frankly
  // cyan. Warming the base colour by a few points is what a real alloy's own
  // reflectance does, and it is the difference between "aluminium" and "steel
  // lit by a monitor".
  // And it must belong to the rack. A bright silver fascia among five dark ones
  // reads as a different product photographed on the same shelf; the hero has
  // to be the hero through framing and finish, not through albedo. This is a
  // dark-anodised graphite that still carries the brush, so the machined
  // grooves and the display bezel are what separate it from its neighbours.
  const fm = fasciaMaps(0.58, 0.17);
  const face = M.alu.clone();
  face.color.setHex(0x504e4b); face.roughness = 0.52;
  face.roughnessMap = fm.rough; face.normalMap = fm.norm;
  face.normalScale = new THREE.Vector2(0.38, 0.38);
  face.anisotropy = 0.12; face.envMapIntensity = 0.40;
  // The end cheeks are bead-blasted rather than brushed: an anisotropic vertical
  // grain on a 62 mm panel concentrates the strip into one clipped white block.
  const faceV = M.aluV.clone();
  faceV.color.setHex(0x323337); faceV.roughness = 0.78;
  faceV.roughnessMap = fm.rough; faceV.normalMap = null;
  faceV.anisotropy = 0.06; faceV.envMapIntensity = 0.34;
  // Controls are TURNED, not brushed. The stock brush map lands radially on a
  // lathe cap and throws a starburst of spokes straight at the camera, which is
  // a CGI signature rather than a knob; and a dark metal at metalness 1 is a
  // dark mirror, so it renders as a hole. A satin alloy with an isotropic map
  // gives the smooth dark-to-light sweep across the face that a turned knob has.
  // ANISOTROPY MUST BE ZERO HERE. A knob is a lathe, and on a lathe cap the
  // tangent frame pinwheels about the axis, so any anisotropic stretch resolves
  // into radial spokes — the starburst that was the single worst artefact in
  // this frame. The form comes from geometry instead: a knurled rim, a machined
  // step and a proud boss, each catching the rig at its own angle.
  const knobMat = M.alu.clone();
  knobMat.roughnessMap = T.anodisedRough(512, 0.66, 0.14);
  knobMat.normalMap = null;
  knobMat.color.setHex(0x9aa0a8); knobMat.roughness = 0.70;
  knobMat.anisotropy = 0.0; knobMat.envMapIntensity = 1.05;
  // The face itself is stepped: a proud centre boss inside a turned rim, so the
  // knob has three normals to shade with instead of one.
  const bossMat = M.anodGrey.clone();
  bossMat.color.setHex(0x2f3338); bossMat.roughness = 0.40; bossMat.envMapIntensity = 0.42;
  const capMat = M.anodGrey.clone();
  capMat.color.setHex(0x33373c); capMat.roughness = 0.44; capMat.envMapIntensity = 0.46;

  // ---- chassis ------------------------------------------------------------
  const ch = GEO.chassis(W, H, D, {
    r: 0.0028, seg: 5, faceThick: 0.014, body, face,
  });
  ch.position.y = H / 2;
  g.add(ch);

  // Three-part fascia: a vertically-brushed cheek at each end, parted from the
  // horizontally-brushed centre by a machined groove. Two brush directions on
  // one panel is the tell of a milled front, not a folded one.
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(GEO.bevelBox(0.062, H - 0.0035, 0.0042, 0.0011, 3), faceV);
    cheek.position.set(sx * (W / 2 - 0.036), H / 2, ZF + 0.0012);
    cheek.castShadow = cheek.receiveShadow = true;
    g.add(cheek);
  }

  // Two machined grooves rather than a polished trim strip: a mirror band on a
  // front panel blows out under a big soft key and destroys the brushed finish.
  const groove = M.anodBlack.clone(); groove.color.setHex(0x0e1013); groove.roughness = 0.55;
  for (const sy of [1, -1]) {
    const t = new THREE.Mesh(GEO.bevelBox(W - 0.030, 0.0030, 0.0060, 0.0009, 2), groove);
    t.position.set(0, H / 2 + sy * (H / 2 - 0.0092), ZF - 0.0022);
    t.receiveShadow = true;
    g.add(t);
  }
  for (const sx of [-1, 1]) {
    const part = new THREE.Mesh(GEO.bevelBox(0.0022, H - 0.0035, 0.0050, 0.0006, 2), groove);
    part.position.set(sx * (W / 2 - 0.0685), H / 2, ZF - 0.0006);
    g.add(part);
  }

  // ---- display window -----------------------------------------------------
  const winW = 0.152, winH = 0.048;
  const bez = new THREE.Mesh(GEO.bevelBox(winW + 0.013, winH + 0.013, 0.0040, 0.0012, 3), M.anodGrey);
  bez.position.set(0.010, H / 2, ZF - 0.0012);
  bez.castShadow = bez.receiveShadow = true;
  g.add(bez);
  // machined lip: four thin steel bars catch a hairline all the way round
  for (const [dx, dy, lw, lh] of [
    [0, (winH + 0.0055) / 2, winW + 0.0060, 0.0016],
    [0, -(winH + 0.0055) / 2, winW + 0.0060, 0.0016],
    [(winW + 0.0060) / 2, 0, 0.0016, winH + 0.0055],
    [-(winW + 0.0060) / 2, 0, 0.0016, winH + 0.0055],
  ]) {
    const bar = new THREE.Mesh(GEO.bevelBox(lw, lh, 0.0026, 0.0005, 2), M.steel);
    bar.position.set(0.010 + dx, H / 2 + dy, ZF + 0.0016);
    bar.castShadow = true;
    g.add(bar);
  }
  // Matte black cavity, NOT a second gloss surface: one specular layer over the
  // readout, and it is the lens. Two of them and the digits wash out.
  const cav = M.plastic.clone();
  cav.color.setHex(0x03050a); cav.roughness = 0.96; cav.clearcoat = 0.0;
  cav.envMapIntensity = 0.02; cav.specularIntensity = 0.04;
  const back = new THREE.Mesh(GEO.bevelBox(winW, winH, 0.0030, 0.0008, 2), cav);
  back.position.set(0.010, H / 2, ZF + 0.0004);
  g.add(back);

  const disp = segDisplay();
  disp.position.set(0.010, H / 2 + 0.006, ZF + 0.0028);
  g.add(disp);

  // level meter strip inside the window
  const trk = new THREE.Mesh(GEO.bevelBox(0.118, 0.0030, 0.0012, 0.0004, 2), M.plastic);
  trk.position.set(0.010, H / 2 - 0.0150, ZF + 0.0026);
  g.add(trk);
  const meter = new THREE.Mesh(GEO.bevelBox(0.118, 0.0030, 0.0014, 0.0004, 2), M.meterGlow);
  meter.geometry.translate(0.059, 0, 0);          // origin at the left end
  meter.position.set(0.010 - 0.059, H / 2 - 0.0150, ZF + 0.0030);
  g.add(meter);

  // THE LENS — GEO.instrumentGlass, not a near-mirror rolled here. A crowned
  // pane at roughness 0.15 sweeps the widened front strip across the window as
  // a soft band with a top and a bottom edge; the roughness-0.055 pane this
  // stage used to build returned essentially the whole softbox as a clipped
  // rectangle and was the brightest object in the frame. reflectivity 0.34 is
  // a coated cover glass (~1.7 % at normal incidence), which is why the band
  // sits ON the digits instead of drowning them.
  const lens = GEO.instrumentGlass(winW - 0.0015, winH - 0.0015, { crown: 0.0040 });
  lens.material.opacity = 0.30;
  lens.material.envMapIntensity = 1.25;
  lens.position.set(0.010, H / 2, ZF + 0.0038);
  lens.renderOrder = 22;
  g.add(lens);

  // ---- volume knob --------------------------------------------------------
  const KR = 0.032, KH = 0.020;
  const recess = new THREE.Mesh(GEO.bevelCyl(KR + 0.0055, KR + 0.0060, 0.005, 56, 0.0008), M.anodBlack);
  recess.rotation.x = Math.PI / 2;
  recess.position.set(0.200, H / 2, ZF - 0.0005);
  recess.castShadow = recess.receiveShadow = true;
  g.add(recess);

  // engraved index ticks around the recess — machining detail sells the scale
  const tickGeo = GEO.bevelBox(0.0009, 0.0042, 0.0010, 0.0002, 2);
  const ticks = new THREE.InstancedMesh(tickGeo, M.anodGrey, 21);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3(), rr = KR + 0.0086;
    for (let i = 0; i < 21; i++) {
      const a = THREE.MathUtils.degToRad(-120 + (i / 20) * 240);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
      p.set(0.200 + Math.sin(a) * rr, H / 2 + Math.cos(a) * rr, ZF + 0.0006);
      const s = i % 5 === 0 ? 1.5 : 1;
      sc.set(1, s, 1);
      m.compose(p, q, sc);
      ticks.setMatrixAt(i, m);
    }
  }
  ticks.castShadow = false;
  g.add(ticks);

  const knobPivot = new THREE.Group();
  knobPivot.rotation.x = Math.PI / 2;      // +Y of the lathe now faces the lens
  knobPivot.position.set(0.200, H / 2, ZF + KH / 2 + 0.0010);
  const knob = GEO.knob(KR, KH, { flutes: 76, body: knobMat, mark: M.steel });
  // the stepped face: a turned rim, a machined step and a proud centre boss
  const step = new THREE.Mesh(GEO.bevelCyl(KR * 0.70, KR * 0.72, 0.0022, 56, 0.0005), bossMat);
  step.position.y = KH / 2 + 0.0004;
  step.castShadow = true;
  knob.add(step);
  const boss = new THREE.Mesh(GEO.bevelCyl(KR * 0.30, KR * 0.34, 0.0026, 44, 0.0006), knobMat);
  boss.position.y = KH / 2 + 0.0022;
  boss.castShadow = true;
  knob.add(boss);
  // an engraved pointer that actually reads at this size — the stock 1.1 mm
  // dial mark is a third of a pixel wide in the frame
  const ptr = new THREE.Mesh(GEO.bevelBox(0.0026, 0.0016, KR * 0.36, 0.0004, 2), M.steel);
  ptr.position.set(0, KH / 2 + 0.0012, KR * 0.51);
  knob.add(ptr);
  knobPivot.add(knob);
  g.add(knobPivot);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(KR * 0.99, 0.0013, 10, 64), M.steel);
  collar.position.set(0.200, H / 2, ZF + KH + 0.0005);
  g.add(collar);

  // ---- input selector -----------------------------------------------------
  const selPivot = new THREE.Group();
  selPivot.rotation.x = Math.PI / 2;
  selPivot.position.set(-0.196, H / 2 + 0.011, ZF + 0.008);
  const sel = GEO.knob(0.0195, 0.016, { flutes: 52, body: knobMat, mark: M.steel });
  sel.rotation.y = THREE.MathUtils.degToRad(-52);
  selPivot.add(sel);
  g.add(selPivot);

  // ---- indicator LEDs -----------------------------------------------------
  const ledGeo = new THREE.CircleGeometry(0.0018, 16);
  const ledMat = M.ledCyan.clone(); ledMat.color.setHex(0xffffff);
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, 5);
  leds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(15), 3);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    m4.makeTranslation(-0.196 + (i - 2) * 0.0125, H / 2 - 0.029, ZF + 0.0016);
    leds.setMatrixAt(i, m4);
    _c.setHex(i === 1 ? 0x63c8f5 : 0x121a20);
    leds.setColorAt(i, _c);
  }
  leds.frustumCulled = false;
  g.add(leds);
  const stby = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), M.ledAmber);
  stby.position.set(-0.253, H / 2 - 0.029, ZF + 0.0016);
  g.add(stby);

  // ---- input pushbuttons --------------------------------------------------
  // A milled well under the whole control cluster. Without it the left third of
  // the fascia is 200 mm of unbroken metal, and the buttons read as stickers.
  // The step catches a hairline along its top edge and drops the ground behind
  // the caps into shadow, which is what gives them a height.
  const wellPan = new THREE.Mesh(GEO.bevelBox(0.152, 0.030, 0.0034, 0.0011, 3), groove);
  wellPan.position.set(-0.152, H / 2 - 0.0250, ZF - 0.0016);
  wellPan.receiveShadow = true;
  g.add(wellPan);
  const wellLip = new THREE.Mesh(GEO.bevelBox(0.158, 0.036, 0.0022, 0.0008, 2), faceV);
  wellLip.position.set(-0.152, H / 2 - 0.0250, ZF - 0.0030);
  wellLip.receiveShadow = true;
  g.add(wellLip);
  for (let i = 0; i < 4; i++) {
    const bx = -0.156 + i * 0.0215;
    const well = new THREE.Mesh(GEO.bevelCyl(0.0072, 0.0074, 0.0022, 28, 0.0004), M.anodBlack);
    well.rotation.x = Math.PI / 2;
    well.position.set(bx, H / 2 - 0.0245, ZF + 0.0004);
    well.receiveShadow = true;
    g.add(well);
    const cap = new THREE.Mesh(GEO.bevelCyl(0.0058, 0.0062, 0.0030, 28, 0.0006), capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(bx, H / 2 - 0.0245, ZF + 0.0022);
    cap.castShadow = true;
    g.add(cap);
  }

  // ---- fasteners ----------------------------------------------------------
  GEO.screwRow(g, [
    [-0.243, H / 2 + 0.0350], [0.243, H / 2 + 0.0350],
    [-0.243, H / 2 - 0.0350], [0.243, H / 2 - 0.0350],
  ], ZF + 0.0034, 0.0018);

  // ---- top: vents + feet --------------------------------------------------
  const vents = GEO.ventSlots(0.30, D * 0.52, 3, 12, { mat: M.plastic, sw: 0.0045, sd: 0.026 });
  vents.position.set(-0.06, H - 0.0012, -0.03);
  g.add(vents);
  const lidLine = new THREE.Mesh(GEO.bevelBox(W - 0.030, 0.0020, 0.0030, 0.0006, 2), face);
  lidLine.position.set(0, H - 0.0008, ZF - 0.028);
  g.add(lidLine);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.0135, 0.0155, FOOT, 28, 0.0008), M.steel);
    f.position.set(sx * (W / 2 - 0.036), -FOOT / 2, sz * (D / 2 - 0.045));
    f.castShadow = true;
    g.add(f);
  }

  // ---- rear panel: 4 XLR + 8 RCA + IEC + ground post -----------------------
  const rear = new THREE.Group();
  rear.rotation.y = Math.PI;
  rear.position.z = -D / 2;
  const plate = new THREE.Mesh(GEO.bevelBox(W - 0.020, H - 0.014, 0.0035, 0.0008, 2), M.anodGrey);
  plate.position.set(0, H / 2, 0.0016);
  plate.castShadow = plate.receiveShadow = true;
  rear.add(plate);
  for (let i = 0; i < 4; i++) {
    const x = -0.205 + i * 0.052;
    const c = GEO.xlr();
    c.position.set(x, H / 2 + 0.014, 0.0030);
    rear.add(c);
  }
  for (let i = 0; i < 8; i++) {
    const x = -0.215 + (i % 4) * 0.030 + Math.floor(i / 4) * 0.140;
    const c = GEO.rcaJack(i % 2 ? 0x2b2f36 : 0xd94b3a);
    c.position.set(x, H / 2 - 0.026, 0.0030);
    rear.add(c);
  }
  const iec = GEO.iecInlet();
  iec.position.set(0.225, H / 2 + 0.006, 0.0020);
  rear.add(iec);
  const gnd = new THREE.Mesh(GEO.bevelCyl(0.0042, 0.0048, 0.009, 20, 0.0005), M.gold);
  gnd.rotation.x = Math.PI / 2;
  gnd.position.set(0.150, H / 2 - 0.028, 0.006);
  rear.add(gnd);
  g.add(rear);

  GEO.shadowed(ch);
  g.add(GEO.contactShadow(W * 1.35, D * 1.35, 0.55, 0.0016));

  g.userData = { knob, disp, meter };
  return g;
}

/* ===========================================================================
   FRAMING — derived through frameShot(), then trucked in pixels.

   The subject is a 555 x 98 mm chassis: 5.7 : 1. Its bounding radius is half
   the DIAGONAL, and frameShot sizes against the safe box's HEIGHT, so a wide
   flat object needs a fill above 0.62 before it fills the box's WIDTH — the
   safe box is 960 x 840, i.e. 1.14 : 1, and this subject is nearly six times
   wider than it is tall. fill 0.80 puts 0.282 m of radius across 672 px, so the
   fascia runs 721 px inside a 960 px box and the rack's near-left post lands at
   x = 241 with the far-right one at 1091.

   The truck is then an explicit pixel offset applied to the aim point, and it
   is chosen so that BOTH terminating elements are whole: the top of the rack
   (LAYOUT.rack.topY = 1.128) sits 316 px above the axis with air above it, and
   the bottom edge of the canvas lands on the bay-2 shelf at 0.452 rather than
   through the chassis standing on it.
   =========================================================================== */

const AZ = 0.30, EL = 0.115, FOV = 30;
const HALF_TAN = Math.tan((FOV * Math.PI) / 360);

const PRE = new THREE.Vector3(LAYOUT.rack.x, LAYOUT.rack.shelfY[4] + FOOT + H / 2, LAYOUT.rack.z);
const HERO_R = Math.hypot(W / 2, H / 2);                  // 0.2818 m
const BASE = frameShot(PRE, HERO_R, { fill: 0.70, az: AZ, el: EL, fov: FOV });

const DIRV = new THREE.Vector3(...BASE.position).sub(PRE);
const CAM_DIST = DIRV.length();                           // 1.789 m
DIRV.normalize();
const RIGHT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
const UPV = new THREE.Vector3().crossVectors(DIRV, RIGHT).normalize();

const PX_PER_M = 500 / (CAM_DIST * HALF_TAN);             // 1043 px/m at the aim plane
const MPP_HERO = 1 / PX_PER_M;
const HERO_PX = [24, 24];                   // truck: hero centred, lifted 24 px
const DECK_DIST = CAM_DIST - 0.46;                        // card plane, nearer
const MPP_DECK = (DECK_DIST * HALF_TAN) / 500;

const AIM = PRE.clone()
  .addScaledVector(RIGHT, -HERO_PX[0] * MPP_HERO)
  .addScaledVector(UPV, -HERO_PX[1] * MPP_HERO);
const CAMP = AIM.clone().addScaledVector(DIRV, CAM_DIST);

/** World point that projects to (px, py) from the camera axis, on a given plane. */
function screenPoint(px, py, dist) {
  const m = (dist * HALF_TAN) / 500;
  return CAMP.clone().addScaledVector(DIRV, -dist)
    .addScaledVector(RIGHT, px * m).addScaledVector(UPV, py * m);
}

/* ===========================================================================
   OVERLAY — one card, two regions. The relay ladder that the knob actually
   drives, and what moving it does to signal-to-noise.
   =========================================================================== */

const CARD_PX = [356, 250];                 // one card, below and right of hero
const CARD_AT = [44, -272];                 // its centre, px from the axis
const CARD_PAD = 13;                        // px of plate outside the content
const CARD_YAW = -0.30;                     // rad off the lens axis (about UPV)
const CARD_TILT = -0.16;                    // top leans AWAY, so the plate's
                                            // normal tips up into the front strip
const CW = CARD_PX[0] * MPP_DECK;
const CH = CARD_PX[1] * MPP_DECK;
const P = (px) => px * MPP_DECK;            // card pixels → metres

/** Flat, unlit fill — out here the key light is glancing and shading dies. */
function flat(hex, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: hex, toneMapped: false, transparent: true, opacity, depthWrite: false,
  });
}

// ---- the exploded relay ladder --------------------------------------------
/* Drawn as the circuit actually is, because a picture that does not match the
   topology is worse than no picture. Six cascaded L-pads across the width:

     · the signal rail runs left to right through the SERIES arm R1
     · each section's SHUNT arm R2 drops from its output node to the return
     · the amber return runs the whole width and comes back to the input, so
       the loop is closed — there is no current here that does not come home
     · a relay per section either opens (section in circuit) or closes a
       contact straight across R1 and lifts R2 (section out of circuit)

   Everything that changes with the knob is instance colour, so one knob
   position is one uniform state of the picture. */
const BW_ = 0.232, BH_ = 0.094;             // board size in its own units
const SPITCH = 0.0320;
const RW = 0.0268, RH = 0.0206;             // drawn relay can
const Y_CAN = 0.0292;                       // rows, in board units
const Y_SIG = -0.0042;
const Y_R2 = -0.0242;
const Y_RET = -0.0396;
const R1W = 0.0196, R1H = 0.0066;
const R2W = 0.0066, R2H = 0.0148;
const X0 = -0.006 - SPITCH * 2.5;
const X_TERM = 0.1030;
const BOARD_PX = 314;
const BOARD_SCALE = (BOARD_PX * MPP_DECK) / BW_;
/* The card floats nearer the lens than the chassis does, so comparing metres to
   metres would understate the blow-up. This is the ratio of ANGULAR sizes: the
   drawn relay as the camera sees it, against a real 12.4 mm relay seen at the
   preamp's own distance. */
const BOARD_MAG = ((RW * BOARD_SCALE) / DECK_DIST) / (RELAY_W / CAM_DIST);

/** Seven-segment strokes for one digit, in board units. */
const DIGW = 0.0050, DIGH = 0.0086, DIGT = 0.0012;
function digitQuads(d, cx, cy) {
  const hw = DIGW / 2, hh = DIGH / 2, t = DIGT;
  const seg = {
    a: [cx, cy + hh, DIGW, t], g: [cx, cy, DIGW, t], d: [cx, cy - hh, DIGW, t],
    f: [cx - hw, cy + hh / 2, t, hh], b: [cx + hw, cy + hh / 2, t, hh],
    e: [cx - hw, cy - hh / 2, t, hh], c: [cx + hw, cy - hh / 2, t, hh],
  };
  return SEGMAP[d].split('').map((k) => seg[k]);
}

/* One palette for the two states. Engaged is lit in the signal accent, bypassed
   falls back to the board's own grey — a component with no current in it. */
const C_ON = {
  can: 0x2b5c78, glint: 0x54809a, dig: 0xcbeaFB, led: 0x5cc0f2,
  body: 0x4c6373, cap: 0x8ea2b0, link: 0x141b21, stub: 0x4fa9d6,
};
const C_OFF = {
  can: 0x2a3138, glint: 0x444d56, dig: 0x4d565f, led: 0x111820,
  body: 0x2c333a, cap: 0x4a525a, link: 0x5cc0f2, stub: 0x151b21,
};

function buildBoard() {
  const g = new THREE.Group();
  const UNIT = new THREE.PlaneGeometry(1, 1);
  const mk = (hex, n, ro, op = 1, col = false) => {
    const im = new THREE.InstancedMesh(UNIT, flat(hex, op), n);
    if (col) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    im.frustumCulled = false; im.renderOrder = ro; g.add(im); return im;
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
  const put = (im, i, cx, cy, w, h, z) => {
    scl.set(w, h, 1); pos.set(cx, cy, z); m.compose(pos, q, scl); im.setMatrixAt(i, m);
  };

  const plate = mk(0x0e141a, 1, 6);
  put(plate, 0, 0, 0, BW_, BH_, 0.0000);

  const can = mk(0xffffff, 6, 7, 1, true);
  const glint = mk(0xffffff, 6, 8, 1, true);
  const stem = mk(0x39434d, 6, 7);
  const pins = mk(0xa98d57, 18, 7);
  const link = mk(0xffffff, 6, 11, 1, true);      // the closed bypass contact
  const resB = mk(0xffffff, 13, 7, 1, true);      // R1 x6, R2 x6, terminator
  const resC = mk(0xffffff, 26, 8, 1, true);
  const stub = mk(0xffffff, 12, 9, 1, true);      // shunt drops to the return

  const NSEG = 40;
  const dig = mk(0xffffff, NSEG, 12, 1, true);
  const digOwner = new Int8Array(NSEG).fill(-1);
  let di = 0;

  const led = new THREE.InstancedMesh(new THREE.CircleGeometry(0.0023, 14), flat(0xffffff), 6);
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
  led.frustumCulled = false; led.renderOrder = 10;
  g.add(led);

  const outline = [];
  const box = (cx, cy, hw, hh, z) => outline.push(
    cx - hw, cy - hh, z, cx + hw, cy - hh, z, cx + hw, cy - hh, z, cx + hw, cy + hh, z,
    cx + hw, cy + hh, z, cx - hw, cy + hh, z, cx - hw, cy + hh, z, cx - hw, cy - hh, z,
  );

  // --- the six sections ------------------------------------------------------
  let ri = 0, ci = 0, si = 0;
  const resIdx = { r1: [], r2: [], term: 0 };
  const capIdx = [];
  const putRes = (x, y, w, h) => {
    const bi = ri;
    put(resB, ri++, x, y, w, h, 0.0010);
    const c0 = ci;
    if (w > h) for (const sg of [-1, 1]) put(resC, ci++, x + sg * ((w + 0.0026) / 2), y, 0.0026, h * 1.12, 0.0012);
    else for (const sg of [-1, 1]) put(resC, ci++, x, y + sg * ((h + 0.0026) / 2), w * 1.12, 0.0026, 0.0012);
    capIdx.push([c0, c0 + 1]);
    box(x, y, (w > h ? (w + 0.0052) / 2 : w * 0.56), (w > h ? h * 0.56 : (h + 0.0052) / 2), 0.0018);
    return bi;
  };

  for (let i = 0; i < 6; i++) {
    const x = X0 + i * SPITCH;
    const xn = x + SPITCH / 2;                   // this section's output node
    put(can, i, x, Y_CAN, RW, RH, 0.0010);
    put(glint, i, x, Y_CAN + RH / 2 - 0.0011, RW, 0.0022, 0.0014);
    for (let k = 0; k < 3; k++) {
      put(pins, i * 3 + k, x + (k - 1) * 0.0082, Y_CAN - RH / 2 - 0.0032, 0.0022, 0.0064, 0.0008);
    }
    put(stem, i, x + 0.0086, (Y_CAN - RH / 2 - 0.0064 + Y_SIG) / 2, 0.0013,
      Y_CAN - RH / 2 - 0.0064 - Y_SIG, 0.0006);
    box(x, Y_CAN, RW / 2, RH / 2, 0.0018);

    m.makeTranslation(x - 0.0088, Y_CAN - RH / 2 - 0.0056, 0.0018); led.setMatrixAt(i, m);

    // 32 · 16 · 8 · 4 · 2 · 1, silk-screened, so the relay word in the caption
    // can be read straight off the picture
    const txt = String(WEIGHTS[i]);
    const step = DIGW + 0.0022;
    for (let k = 0; k < txt.length; k++) {
      const cx = x + (k - (txt.length - 1) / 2) * step;
      for (const [qx, qy, qw, qh] of digitQuads(+txt[k], cx, Y_CAN)) {
        if (di >= NSEG) break;
        put(dig, di, qx, qy, qw, qh, 0.0020);
        digOwner[di] = i; di++;
      }
    }

    resIdx.r1.push(putRes(x, Y_SIG, R1W, R1H));                 // series arm
    resIdx.r2.push(putRes(xn, Y_R2, R2W, R2H));                 // shunt arm
    // the bypass contact, drawn as a link arcing over the series arm
    put(link, i, x, Y_SIG + 0.0060, R1W + 0.0060, 0.0022, 0.0016);
    // shunt drop: signal-side above R2, return-side below it
    put(stub, si++, xn, (Y_SIG + (Y_R2 + R2H / 2 + 0.0026)) / 2, 0.0016,
      Y_SIG - (Y_R2 + R2H / 2 + 0.0026), 0.0008);
    put(stub, si++, xn, ((Y_R2 - R2H / 2 - 0.0026) + Y_RET) / 2, 0.0016,
      (Y_R2 - R2H / 2 - 0.0026) - Y_RET, 0.0008);
  }
  for (let k = di; k < NSEG; k++) put(dig, k, 0, 0, 0, 0, 0);

  // the terminating 10 kΩ across the output, and the two rail stubs at the ends
  resIdx.term = putRes(X_TERM, Y_R2, R2W, R2H);
  box(0, 0, BW_ / 2, BH_ / 2, 0.0016);

  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
  const ol = new THREE.LineSegments(og, new THREE.LineBasicMaterial({
    color: 0x7d8791, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false,
  }));
  ol.renderOrder = 13;
  g.add(ol);

  // The live signal rail and the return. The bypass contact sits in parallel
  // with R1, so the rail is straight in both states — what changes is whether
  // the current goes through the resistor or through the contact.
  const XL = -BW_ / 2 + 0.007, XR = BW_ / 2 - 0.007;
  const sig = new DIAG.Trace(2, PAL.cy, 2.6, { renderOrder: 16 });
  sig.write((i) => [i === 0 ? XL : XR, Y_SIG, 0.0024]);
  const ret = new DIAG.Trace(2, PAL.am, 2.0, { renderOrder: 16, opacity: 0.70 });
  ret.write((i) => [i === 0 ? XL : XR, Y_RET, 0.0024]);
  // the two ends of the loop: source in on the left, load out on the right
  const endL = new DIAG.Trace(2, PAL.am, 2.0, { renderOrder: 16, opacity: 0.70 });
  endL.write((i) => [XL, i === 0 ? Y_SIG : Y_RET, 0.0024]);
  const endR = new DIAG.Trace(2, PAL.am, 2.0, { renderOrder: 16, opacity: 0.70 });
  endR.write((i) => [XR, i === 0 ? Y_SIG : Y_RET, 0.0024]);
  const termStub = new DIAG.Trace(4, PAL.cy, 1.8, { renderOrder: 15, opacity: 0.75 });
  termStub.write((i) => [X_TERM,
    [Y_SIG, Y_R2 + R2H / 2 + 0.0026, Y_R2 - R2H / 2 - 0.0026, Y_RET][i], 0.0018]);
  g.add(sig, ret, endL, endR, termStub);

  g.userData = { led, can, glint, dig, digOwner, link, resB, resC, stub, resIdx, capIdx };
  return g;
}

/**
 * The stage fader records each mesh's "base" opacity the first time it sees it —
 * but it is first called with o = 0, after the diagram card has already zeroed
 * its own plate. Seeding the value at build time, while every material is still
 * at full opacity, avoids latching a base of zero.
 */
function seedFade(root) {
  root.traverse((o) => {
    if ((o.isMesh || o.isSprite || o.isLine || o.isPoints) && o.material
        && o.userData._baseOp === undefined) o.userData._baseOp = o.material.opacity ?? 1;
  });
  return root;
}

/* ---------------------------------------------------------------------------
   THE CARD AS AN OBJECT.

   `DIAG.diagramCard` now builds the slab itself — real thickness, a broken
   edge, a machined aluTrim bezel, lit, shadow-casting and present in the floor
   reflection. Stacking a second hand-rolled slab and bezel behind it, as this
   stage used to, is what made the plate read as a rectangular hole cut into
   the rack: two opaque black plates and two bezels at slightly different sizes.

   What is still this stage's job is the two things the core cannot know about:

     1. A MULTIPLY-BLENDED POOL behind the plate, darkening the rack the card
        floats in front of. The key light is 0.40 m of standoff away from
        casting a true shadow that far, so without this the card has no
        occlusion and no distance from what it covers.
     2. THE SPECULAR LAYER, from `GEO.instrumentGlass` — crowned, coated
        (reflectivity 0.34, not the uncoated 4 %) and roughness 0.15, so the
        widened front strip sweeps across the face as a soft band with a top
        and a bottom edge rather than sitting on it as a clipped rectangle.
        The near-mirror this stage used to roll itself — roughness 0.085 on a
        flat pane — returned the whole softbox and bloomed.

   Plus: the deck is yawed and leaned off the lens axis, so that band is
   asymmetric. A card square to the lens returns the source as a flat wash or
   not at all; either way it looks printed.
   --------------------------------------------------------------------------- */
function cardPlate(w, h) {
  const g = new THREE.Group();

  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.7, h * 1.9),
    new THREE.MeshBasicMaterial({
      map: T.blobShadow(256, 1), transparent: true, opacity: 0.58,
      depthWrite: false, toneMapped: false,
    }));
  shade.position.set(0.016, -0.022, -0.034);
  shade.renderOrder = 1;
  g.add(shade);

  return g;
}

/** The cover glass over a card face. Separated so it can be added last. */
function cardGlass(w, h) {
  const p = GEO.instrumentGlass(w, h, { crown: Math.min(w, h) * 0.05 });
  p.material.opacity = 0.15;          // a coated pane, not a smoked filter
  p.renderOrder = 26;
  return p;
}

/* ===========================================================================
   THE STAGE
   =========================================================================== */

/* The knob is a hand, so it runs in real time. It rests at the setting this
   system actually uses — the still frame must show the number the chapter
   derives, not an arbitrary point of a sweep — then takes one trip down the
   scale and back before returning to rest. */
const DWELL = 11;                      // s parked at N_VINYL
const CYCLE = 34;                      // s for the whole excursion and back
const KEYS = [[0, null], [0.22, 1], [0.58, 61], [1, null]];   // null = N_VINYL

const S = { N: N_VINYL, late: chainLate(N_VINYL), lab: {} };

/** Knob position at simulated time t. Smooth at every keyframe. */
function knobAt(t) {
  const u = ((t % CYCLE) + CYCLE) % CYCLE;
  if (u < DWELL) return ATT_VINYL;
  const w = (u - DWELL) / (CYCLE - DWELL);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, va] = KEYS[i], [b, vb] = KEYS[i + 1];
    if (w >= a && w <= b) {
      const f = (w - a) / (b - a), s = f * f * (3 - 2 * f);
      const A = va === null ? ATT_VINYL : va, B = vb === null ? ATT_VINYL : vb;
      return A + (B - A) * s;
    }
  }
  return ATT_VINYL;
}

export default {
  id: 'preamp',
  title: 'Gain &amp; Control',
  nav: 'Preamp',
  kicker: 'Preamp',
  standfirst: 'Volume is not gain — it is a resistor ladder throwing voltage away.',
  shot: { position: CAMP.toArray(), target: AIM.toArray(), fov: FOV },
  timeScale: 1,
  alwaysUpdate: false,

  build(ctx) {
    const hardware = buildPreamp();
    const overlay = new THREE.Group();

    // ---- the card ---------------------------------------------------------
    const deck = new THREE.Group();
    deck.position.copy(screenPoint(CARD_AT[0], CARD_AT[1], DECK_DIST));
    deck.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(RIGHT, UPV, DIRV));
    deck.rotateY(CARD_YAW);                   // off the lens axis: it catches a sheen
    deck.rotateX(CARD_TILT);
    overlay.add(deck);

    const PAD = P(CARD_PAD);
    deck.add(cardPlate(CW + PAD * 2, CH + PAD * 2));

    const inner = new THREE.Group();          // origin = bottom-left of the card
    inner.position.set(-CW / 2, -CH / 2, 0);
    deck.add(inner);
    // opaque: at 0.9 the shelf lips behind still print through the card
    inner.add(DIAG.diagramCard(CW, CH, { pad: PAD * 0.72, opacity: 1.0, border: false }));

    // The core plate is a lit dielectric at roughness 0.34, which under this rig
    // returns enough of the room that the whole card floats to mid-grey and the
    // two dark regions read as separate panels dropped onto a light sheet. A
    // near-black inked field over it, inset by 4 px so the plate survives as a
    // machined surround, puts the card back to one instrument face — and the
    // cover glass then has something dark to lay its band across.
    const inkMat = mats().anodBlack.clone();
    inkMat.color.setHex(0x0a0d12);
    inkMat.roughness = 0.44; inkMat.envMapIntensity = 0.26;
    inkMat.clearcoat = 0.35; inkMat.clearcoatRoughness = 0.30;
    const ink = new THREE.Mesh(GEO.bevelBox(CW - P(5), CH - P(5), 0.0015, 0.0006, 2), inkMat);
    ink.position.set(CW / 2, CH / 2, 0.0010);
    ink.receiveShadow = true;
    inner.add(ink);

    // hairline between the two regions
    const rule = new DIAG.Trace(2, 0x39414c, 1.0, { opacity: 0.7, renderOrder: 6 });
    rule.write((i) => [i === 0 ? P(14) : P(342), P(108), 0.0006]);
    inner.add(rule);

    // ---- region 1: the relay ladder ---------------------------------------
    const board = buildBoard();
    board.scale.setScalar(BOARD_SCALE);
    board.position.set(P(178), P(178), 0.002);
    inner.add(board);

    // ---- region 2: S/N against knob position ------------------------------
    const gw = P(262), gh = P(74);
    const G_ = new DIAG.Graph({
      w: gw, h: gh, xRange: [0, 63], yRange: [55, 125],
      xTicks: [0, 16, 32, 48, 63], yTicks: [60, 80, 100, 120],
    });
    G_.position.set(P(76), P(28), 0.002);
    inner.add(G_);
    G_.addTrace((n) => SNR_EARLY[Math.round(n)],
      { color: PAL.cy, width: 1.4, n: 64, dashed: true, opacity: 0.85 });
    G_.addTrace((n) => SNR_LATE[Math.round(n)], { color: PAL.cy, width: 2.4, n: 64 });

    // where this system actually sits — a fixed amber marker, not a decoration
    const opMark = G_.addMarker(N_VINYL, { color: PAL.am, width: 1.4, opacity: 0.9 });
    const gap = new DIAG.Trace(2, PAL.gr, 3.0, { renderOrder: 15 });
    G_.add(gap);
    const dotL = G_.addDot(PAL.cy, P(3.0));
    const dotE = G_.addDot(PAL.ink3, P(2.4));

    // AXIS NUMERALS — a plot you cannot take a value off is a decoration.
    // Both sets sit INSIDE the plate: the y column has 76 px of margin to its
    // left and the x row 32 px below it before the bezel.
    G_.tickLabels(ctx.labels, {
      xVals: [0, 32, 63], yVals: [60, 90, 120],
      xFmt: (v) => (v === 0 ? '0 dB' : '−' + v),
      yFmt: (v) => String(v),
      xOffset: [0, 12], yOffset: [-19, 0],
    });

    // ---- labels -----------------------------------------------------------
    const L = ctx.labels;
    const cardPt = (x, y) => inner.localToWorld(new THREE.Vector3(x, y, 0));

    // THREE world labels, not five. The card is small now and the captions sit
    // off it, in the clear rack to its left, so nothing overprints the plot and
    // nothing stacks into a column of scrims.
    //
    // The subject label docks ABOVE the chassis, in the 71 mm void between the
    // preamp's lid and the shelf over it, so a reader knows which of the six
    // identical rack units this chapter is about.
    S.lab.hw = L.add(
      new THREE.Vector3(PRE.x - 0.190, PRE.y + H / 2 + 0.002, PRE.z + ZF),
      {
        kicker: 'Line preamp · rack bay 4',
        value: '−19 dB · 8.9 : 1 · 710 mV',
        cls: 'acc lead', occlude: false, offset: [70, -42], priority: 5,
      });

    S.lab.board = L.add(cardPt(P(0), P(182)), {
      kicker: `Relay ladder, shown ×${BOARD_MAG.toFixed(1)}`,
      value: '010011 · Z 2.94 kΩ', occlude: false,
      offset: [-98, 0], priority: 4,
    });

    // The step is REAL, not a sampling artefact: SNR_LATE is tabulated on the
    // integers and the trace is sampled at n = 64 over 0…63, so every drawn
    // vertex is one relay word. At −31 six pads cascade to a 3.95 kΩ source; at
    // −32 a single pad terminated in 10 kΩ gives 245 Ω, and 12 dB less thermal
    // noise from the ladder more than pays for the extra 1 dB of attenuation.
    S.lab.snr = L.add(cardPt(P(0), P(58)), {
      kicker: 'S/N re. output · dB',
      text: `Amber is this system. The step at −32 is ladder Z: `
        + `${DSP.si(Z_31, 3)}Ω → ${DSP.si(Z_32, 3)}Ω.`,
      value: 'late 115.3 · early 106.7',
      occlude: false, offset: [-118, 6], priority: 3,
    });

    // the specular layer goes on last, over everything the card draws
    deck.add(cardGlass(CW + PAD * 1.1, CH + PAD * 1.1));

    seedFade(overlay);
    Object.assign(S, { hw: hardware, board, G: G_, opMark, gap, dotL, dotE });
    this._sync(S.N);
    return { hardware, overlay };
  },

  /** Push one knob position through the whole model and into the picture. */
  _sync(N) {
    const late = chainLate(N);
    S.N = N; S.late = late;
    setDisplay(S.hw.userData.disp, N);
    const B = S.board.userData;
    const { led, can, glint, dig, digOwner, link, resB, resC, stub, resIdx, capIdx } = B;
    const set = (im, i, hex) => { _c.setHex(hex); im.setColorAt(i, _c); };
    for (let i = 0; i < 6; i++) {
      const P_ = late.L.on[i] ? C_ON : C_OFF;
      set(led, i, P_.led);
      set(can, i, P_.can);
      set(glint, i, P_.glint);
      set(link, i, P_.link);
      for (const [arm, cx] of [[resIdx.r1[i], capIdx[i * 2]], [resIdx.r2[i], capIdx[i * 2 + 1]]]) {
        set(resB, arm, P_.body);
        set(resC, cx[0], P_.cap); set(resC, cx[1], P_.cap);
      }
      set(stub, i * 2, late.L.on[i] ? P_.stub : C_OFF.stub);
      set(stub, i * 2 + 1, late.L.on[i] ? 0xc59243 : C_OFF.stub);
    }
    // the terminating resistor is always in circuit
    set(resB, resIdx.term, C_ON.body);
    set(resC, capIdx[12][0], C_ON.cap); set(resC, capIdx[12][1], C_ON.cap);
    for (let k = 0; k < digOwner.length; k++) {
      const o = digOwner[k];
      set(dig, k, o < 0 ? 0x000000 : (late.L.on[o] ? C_ON.dig : C_OFF.dig));
    }
    for (const im of [led, can, glint, dig, link, resB, resC, stub]) im.instanceColor.needsUpdate = true;

    const G_ = S.G, yl = SNR_LATE[N], ye = SNR_EARLY[N];
    S.gap.write((i) => [G_.x(N), G_.y(i === 0 ? ye : yl), 0.0018]);
    S.dotL.userData.setData(N, yl);
    S.dotE.userData.setData(N, ye);

    const ratio = 1 / late.L.ratio;
    const rTxt = ratio < 100 ? ratio.toFixed(1) : Math.round(ratio);
    S.lab.hw.setValue(`−${N} dB · ${rTxt} : 1 · ${DSP.si(late.s[3], 3)}V`);
    S.lab.board.setValue(`${bits(N)} · Z ${DSP.si(late.L.zOut, 3)}Ω`);
    S.lab.snr.setValue(`late ${yl.toFixed(1)} · early ${ye.toFixed(1)}`);
  },

  update(dt, t) {
    // The setting is NOT committed here. Everything quoted as a number — the
    // front-panel digits, the relay word, the plot markers, the world labels
    // and the footer cluster — is latched together inside readouts(), which the
    // app calls once per readout tick, after update() and before the frame is
    // drawn. A still frame therefore shows one instant, not two.
    const Nf = knobAt(t);
    S.pending = DSP.clamp(Math.round(Nf), 0, 63);
    S.hw.userData.knob.rotation.y = THREE.MathUtils.degToRad(-30 - 300 * (63 - Nf) / 63);
    S.hw.userData.meter.scale.x = Math.max(0.001, (63 - Nf) / 63);
  },

  content() {
    const n = (x) => `<span class="num">${x}</span>`;
    return `
<div class="key"><span class="lab">The idea</span><p>Volume is subtraction. The gain is fixed; the knob decides how much to throw away, and where.</p></div>

<h3>Where the setting comes from</h3>
<p>${n((CART.outRms * 1e6).toFixed(0) + ' µV')} at the cartridge must become ${n('2.83 V')} at the terminals — ${n(CHAIN.totalDb.toFixed(2) + ' dB')}, plus ${n(Math.abs(CHAIN.loadLossDb).toFixed(2) + ' dB')} lost into its ${n('100 Ω')} load:</p>
<div class="eq">${CHAIN.totalDb.toFixed(2)} + ${Math.abs(CHAIN.loadLossDb).toFixed(2)} − ${PHONO.gainDb} − ${GAIN_DB.toFixed(0)} − ${AMP.gainDb} = <span class="hl">−${ATT_VINYL.toFixed(2)}</span>
<span class="c">2.83 V = ${((V_TERM_1W * V_TERM_1W) / DRIVER.Re).toFixed(2)} W in ${DRIVER.Re} Ω → ${SPEAKER.sens.toFixed(2)} dB, 1 W ${SPEAKER.sens1W.toFixed(2)}
setting ${N_VINYL} dB · ${bits(N_VINYL)} · 2 V src −${ATT_DIGITAL.toFixed(1)}</span></div>

<h3>Late, not early</h3>
<p>Six binary-weighted L-pads, ${n('32/16/8/4/2/1 dB')} into ${n('10 kΩ')}, sit <b>after</b> the ${n('+' + GAIN_DB.toFixed(0) + ' dB')} block: ${n(MARGIN_OP.toFixed(2) + ' dB')} better S/N here, ${n(MARGIN_63.toFixed(2) + ' dB')} at −63. S/N is not monotonic — −32 beats −31 by ${n(STEP_32.toFixed(1) + ' dB')}.</p>

<div class="myth"><span class="lab">Commonly got wrong</span><p>"A passive control is more transparent." Its ${n('40 kΩ')} pot at midpoint is a ${n('10 kΩ')} source: ${n(DIV_LOSS.toFixed(2) + ' dB')} in the divider, ${n(HF_LOSS.toFixed(2) + ' dB')} more at 20 kHz into 3 m of cable. This ${n('50 Ω')} buffer corners at ${n((cornerHz(R_ACT) / 1e6).toFixed(1) + ' MHz')}.</p></div>`;
  },

  readouts() {
    if (S.pending !== undefined && S.pending !== S.N) this._sync(S.pending);
    const l = S.late, r = 1 / l.L.ratio;
    return [
      { k: 'Volume', v: `−${S.N}`, u: 'dB', cls: 'acc', bar: (63 - S.N) / 63 },
      { k: 'Divider', v: `${r < 100 ? r.toFixed(2) : Math.round(r)} : 1`, u: '' },
      { k: 'Output', v: DSP.si(l.s[3], 3), u: 'V rms' },
      { k: 'Ladder Z', v: DSP.si(l.L.zOut, 3), u: 'Ω' },
      { k: 'S/N re. out', v: SNR_LATE[S.N].toFixed(1), u: 'dB', bar: SNR_LATE[S.N] / 125 },
      { k: 'Late − early', v: `+${(SNR_LATE[S.N] - SNR_EARLY[S.N]).toFixed(2)}`, u: 'dB', cls: 'acc' },
    ];
  },
};

/** '011000' — the relay word for an integer setting, MSB (32 dB) first. */
function bits(N) {
  return ladderState(N).on.map((b) => (b ? 1 : 0)).join('');
}
