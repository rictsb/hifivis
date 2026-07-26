import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';
import { DIGITAL } from '../core/spec.js';

/* =========================================================================
   NETWORK TO BITS — every constant below is derived from spec.js or from a
   modelling premise that is stated on screen in content().

   PRIMARIES, taken from src/core/spec.js and never re-declared here:
     DIGITAL.fsCd   44 100 Hz   the disc rate this system streams
     DIGITAL.bits   24          the system word length
   Everything else on this stage is derived from those two, from the 1500-byte
   Ethernet MTU, or from a premise named in the prose.
   ========================================================================= */

const FS = DIGITAL.fsCd, NBITS = DIGITAL.bits, NCH = 2;
const PAYLOAD_BPS = NCH * NBITS * FS;              // 2 116 800 bit/s
const FRAME_B = (NCH * NBITS) / 8;                 // 6 byte per stereo frame
const MSS = 1460;                                  // 1500 MTU − 20 IPv4 − 20 TCP
/* A segment carries whole frames only: 1460/6 = 243.33, so 243. */
const SEG_FRAMES = Math.floor(MSS / FRAME_B);      // 243
const SEG_B = SEG_FRAMES * FRAME_B;                // 1458 byte of payload
const PKT_AUDIO = SEG_FRAMES / FS;                 // 5.5102 ms of music
const PKT_RATE = FS / SEG_FRAMES;                  // 181.481 packet/s
const WIRE_B = SEG_B + 40 + 14 + 4 + 8 + 12;       // 1536 B on the wire
const LINE_BPS = 1e9;                              // 1000BASE-T
const T_SER = (WIRE_B * 8) / LINE_BPS;             // 12.288 µs per wire frame

const BCLK = 64 * FS;                              // 2.8224 MHz — AES3 frame is 64 bit
const MCLK = 128 * FS;                             // 5.6448 MHz — biphase channel rate

const TJ = 50e-12, JF = 1e4;
const SNR_TJ = DSP.jitterSnrDb(JF, TJ);            // 110.06 dB rms, 0–fs/2
const SNR_24 = DSP.quantSnrDb(NBITS);              // 146.26 dB
const TJ_24 = 1 / (DSP.TAU * JF * DSP.undB(SNR_24)); // 0.7746 ps
const SNR_20K = SNR_TJ + 10 * Math.log10((FS / 2) / 20000); // 110.48 dB in 20 kHz

/* Time. The packet layer runs at the stage timeScale; the bit layer is four
   orders of magnitude faster, so it is derived from t with its own multiplier.
   Both ratios are declared on the card, multiplied out, because a reader
   looking at the picture must not have to find the prose to know what the
   ribbon's speed means. */
const TS = 0.02;                                   // 1 simulated s per 50 real s
const BIT_PER_SIM_S = 1200;                        // bit slots drawn per simulated second
const BIT_RATIO = Math.round(BCLK / BIT_PER_SIM_S);// 2352 : 1 on top of the stage rate
const REAL_RATIO = Math.round(BIT_RATIO / TS);     // 117 600 : 1 against real time
/** 117600 -> "117 600". Thin-spaced groups, no locale dependence. */
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* MODELLING PREMISES. Not measurements — every one of these is named in the
   prose as a premise, because a number on screen that came from nowhere is
   worse than no number. */
const BUF_TARGET = 120, BUF_FULL = 140;            // ms of audio; a wired-LAN target
/** Strip-chart window. Occupancy never leaves 70–140 ms, so a 0-based axis
 *  would spend 60 % of the box on space the signal never visits. */
const BUF_LO = 65, BUF_HI = 145;
const WIN = 0.360;                                 // s of history on the strip chart
const STALL_MEAN = 0.090;                          // mean interval between switch stalls, s
const RETX_ONE_IN = 380;                           // segments needing a retransmission
const RTT = 0.0045;                                // fast-retransmit round trip, s

const TONE_F = 997, TONE_A = DSP.undB(-3), FULL24 = Math.pow(2, NBITS - 1) - 1;

const C_LIT = 0x5cc0f2, C_DIM = 0x17384a, C_AUX = 0x6b7783, C_AUXD = 0x1d2229;
const C_PRE = 0x93a7b6, C_NOW = 0xe6f6ff, C_AM = 0xf0b35a;

/* ---------- helpers ------------------------------------------------------ */
const _p3 = [0, 0, 0];
function poly(tr, pts) {
  const n = pts.length;
  tr.write((i) => { const p = pts[i < n ? i : n - 1]; _p3[0] = p[0]; _p3[1] = p[1]; _p3[2] = p[2] || 0; return _p3; });
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** One draw from a standard normal, from a given uniform source. */
function gauss(rnd) {
  const u1 = Math.max(1e-9, rnd()), u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(DSP.TAU * u2);
}
function anchor(parent, x, y, z = 0) {
  const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o;
}

/**
 * A CONVEX clear panel. This is the specular layer: a flat pane facing the
 * camera mirrors whatever sits at the reflection angle, and in this room that
 * is the dark floor. Curving it sweeps the surface normal through ~13°, which
 * drags the reflected image of the wide front strip across the panel as a soft
 * band with a real gradient either side of it.
 *
 * rx, ry are the radii of curvature in metres; the sag is (w/2)²/2rx + (h/2)²/2ry.
 */
function curvedPane(w, h, rx, ry, sx = 26, sy = 16) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.attributes.position;
  const sag = (w * w) / (8 * rx) + (h * h) / (8 * ry);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, sag - (x * x) / (2 * rx) - (y * y) / (2 * ry));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** The one glass recipe this stage uses, so every specular layer matches. */
function coverGlass(opacity, env) {
  const m = mats().glass.clone();
  m.transparent = true; m.opacity = opacity;
  m.roughness = 0.070; m.clearcoatRoughness = 0.045;
  m.depthWrite = false; m.envMapIntensity = env;
  return m;
}

/* ---------- real 24-bit sample words ------------------------------------ */
function code(n, quad) {
  const ph = DSP.TAU * TONE_F * n / FS + (quad ? Math.PI / 2 : 0);
  return Math.round(TONE_A * Math.sin(ph) * FULL24);
}
/**
 * AES3 subframe: preamble · 24 audio bits LSB-first · V U C P (even parity).
 *
 * The preamble is NOT four biphase-coded bits. It is eight half-cells with a
 * fixed pattern that no biphase-mark-coded data can produce — three identical
 * half-cells in a row — which is exactly what makes it findable.
 *   Z (block start) 11101000 · X (channel A) 11100010 · Y (channel B) 11100100
 */
const PRE_X = [1, 1, 1, 0, 0, 0, 1, 0];
const PRE_Y = [1, 1, 1, 0, 0, 1, 0, 0];
const PRE_Z = [1, 1, 1, 0, 1, 0, 0, 0];
function makeSubframe(k) {
  const frame = Math.floor(k / 2), chB = (((k % 2) + 2) % 2) === 1;
  const c = code(frame, chB);
  const u = c < 0 ? c + 16777216 : c;
  const b = new Uint8Array(32);
  for (let i = 0; i < 24; i++) b[4 + i] = (u >> i) & 1;   // LSB first
  b[28] = 0; b[29] = 0; b[30] = 0;                        // V, U, C
  let p = 0; for (let i = 4; i < 31; i++) p ^= b[i];
  b[31] = p;                                              // even parity over 4..31
  const pre = chB ? PRE_Y : (frame % 192 === 0 ? PRE_Z : PRE_X);
  return { bits: b, pre, val: u };
}
const _sfC = [{ k: NaN, sf: null }, { k: NaN, sf: null }];
function subframeAt(k) {
  for (const e of _sfC) if (e.k === k && e.sf) return e.sf;
  const e = _sfC[((k % 2) + 2) % 2];
  e.k = k; e.sf = makeSubframe(k);
  return e.sf;
}

/* =========================================================================
   HARDWARE
   ========================================================================= */
const H = 0.092, W = LAYOUT.rack.w - 0.03, D = LAYOUT.rack.d - 0.06;
/** Fascia is milled in three pieces; the middle one carries the clock window. */
const CUT_X0 = 0.022, CUT_X1 = 0.186;
/** The window aperture in that middle piece. */
const AP_W = 0.132, AP_H = 0.050, AP_CX = (CUT_X0 + CUT_X1) / 2, AP_CY = -0.004;
/** Clock island, in the band the window can see: 60 mm behind the fascia. */
const OCXO_POS = [AP_CX, 0, 0.160];
const DISP_X = -0.086, DISP_Y = 0.004, DISP_W = 0.200, DISP_H = 0.040;

function oled() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 128;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mono = (px, w = 700) => `${w} ${px}px ui-monospace, "SF Mono", Menlo, monospace`;
  const draw = (occ) => {
    g.fillStyle = '#03060a'; g.fillRect(0, 0, 640, 128);
    g.fillStyle = 'rgba(120,200,240,0.030)';
    for (let y = 0; y < 128; y += 3) g.fillRect(0, y, 640, 1);
    // Panel emissives are no longer competing with clipped white highlights, so
    // the display runs at a real OLED level rather than at paper white.
    g.fillStyle = '#63aecd'; g.font = mono(48); g.fillText('44.1', 16, 58);
    g.font = mono(24, 500); g.fillStyle = '#3d7590'; g.fillText('kHz', 130, 57);
    g.fillStyle = '#63aecd'; g.font = mono(48); g.fillText('24', 206, 58);
    g.font = mono(24, 500); g.fillStyle = '#3d7590'; g.fillText('bit', 264, 57);
    g.fillStyle = '#63aecd'; g.font = mono(28); g.fillText('AES · LOCK', 380, 55);
    g.font = mono(19, 500); g.fillStyle = '#3d7590'; g.fillText('BUF', 16, 105);
    g.fillStyle = '#0e2733'; g.fillRect(62, 87, 392, 18);
    g.fillStyle = '#4a9cc4'; g.fillRect(62, 87, 392 * Math.min(1, occ / BUF_FULL), 18);
    g.fillStyle = '#63aecd'; g.font = mono(23); g.fillText(`${occ.toFixed(0)} ms`, 474, 106);
    t.needsUpdate = true;
  };
  draw(BUF_TARGET);
  return { tex: t, draw };
}

function rearPanel() {
  const g = new THREE.Group();
  g.rotation.y = Math.PI;                       // everything faces −Z
  const rj = new THREE.Group();
  const body = new THREE.Mesh(GEO.bevelBox(0.016, 0.014, 0.010, 0.0008), mats().anodGrey);
  body.position.z = 0.005; rj.add(body);
  const slot = new THREE.Mesh(GEO.bevelBox(0.0125, 0.0105, 0.004, 0.0005), mats().plastic);
  slot.position.z = 0.0092; rj.add(slot);
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.0045, 0.0008), mats().gold);
    p.position.set(-0.0042 + i * 0.0012, 0.0026, 0.0095); rj.add(p);
  }
  for (const [x, m] of [[-0.0055, mats().ledGreen], [0.0055, mats().ledAmber]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0012, 0.0006), m);
    l.position.set(x, -0.0055, 0.0102); rj.add(l);
  }
  rj.position.set(-0.20, 0.004, D / 2 - 0.004); g.add(rj);
  for (let i = 0; i < 2; i++) {
    const u = new THREE.Group();
    const s = new THREE.Mesh(GEO.bevelBox(0.0136, 0.0068, 0.009, 0.0006), mats().steel);
    s.position.z = 0.0045; u.add(s);
    const tg = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0022, 0.006), mats().plastic);
    tg.position.set(0, -0.0012, 0.0062); u.add(tg);
    u.position.set(-0.152 + i * 0.018, 0.004, D / 2 - 0.004); g.add(u);
  }
  const x = GEO.xlr(); x.position.set(-0.09, 0.002, D / 2 - 0.004); g.add(x);
  const r = GEO.rcaJack(0xd8a24a); r.position.set(-0.038, 0.002, D / 2 - 0.004); g.add(r);
  const bnc = new THREE.Mesh(GEO.bevelCyl(0.0048, 0.0052, 0.013, 24, 0.0005), mats().steel);
  bnc.rotation.x = Math.PI / 2; bnc.position.set(-0.004, 0.002, D / 2 + 0.0025); g.add(bnc);
  const iec = GEO.iecInlet(); iec.position.set(0.21, 0.000, D / 2 - 0.004); g.add(iec);
  GEO.shadowed(g);
  return g;
}

/**
 * The clock island: U-shaped shield fence (open at the front so the window can
 * see in), gold-plated OCXO can with its own lid and four pins, and the
 * reference-lock LED. It sits in the front band of the board because that is
 * the only part the window reaches.
 */
function clockIsland() {
  const g = new THREE.Group();
  const steel = mats().steel, gold = mats().gold;
  const m = mats().pcb.clone();
  m.color.setHex(0x3b464e);             // stop the sub-board blowing out under the key
  const b = new THREE.Mesh(GEO.bevelBox(0.098, 0.0016, 0.072, 0.0006, 2), m);
  b.position.y = -0.0008; g.add(b);
  for (const [dx, dz, w, d] of [[0, -0.031, 0.086, 0.0022],
    [-0.043, 0, 0.0022, 0.062], [0.043, 0, 0.0022, 0.062]]) {
    const f = new THREE.Mesh(GEO.bevelBox(w, 0.010, d, 0.0005, 2), steel);
    f.position.set(dx, 0.005, dz); g.add(f);
  }
  const can = new THREE.Mesh(GEO.bevelBox(0.026, 0.0115, 0.026, 0.0010, 3), gold);
  can.position.y = 0.00575; g.add(can);
  const cl = new THREE.Mesh(GEO.bevelBox(0.0215, 0.0013, 0.0215, 0.0005, 2), gold);
  cl.position.y = 0.0122; g.add(cl);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.003, 8), gold);
    p.position.set(dx * 0.0095, 0.0015, dz * 0.0095); g.add(p);
  }
  GEO.shadowed(g);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0009, 0.0018), mats().ledCyan);
  l.position.set(-0.031, 0.0006, 0.014); g.add(l);
  g.userData.can = can;
  return g;
}

function internals() {
  const g = new THREE.Group();
  const iw = W - 0.012, id = D - 0.014, y0 = -H / 2 + 0.006;
  // A high-end digital board is not bright green FR4: it is a dark, matt
  // soldermask that would not draw the eye away from the gold can. Cloning
  // keeps the copper-trace map and only pulls the base colour down.
  const bm = mats().pcb.clone();
  bm.color.setHex(0x66776d); bm.roughness = 0.58; bm.clearcoat = 0.22;
  const board = new THREE.Mesh(GEO.bevelBox(iw, 0.0016, id, 0.0006, 2), bm);
  board.position.set(0, y0, -0.002); board.receiveShadow = true; g.add(board);
  const put = (mesh, x, z, y = 0) => {
    mesh.position.set(x, y0 + 0.0008 + y, z); mesh.castShadow = true; g.add(mesh); return mesh;
  };

  const [CIX, , CIZ] = OCXO_POS;
  const isl = clockIsland();
  isl.position.set(CIX, y0 + 0.0008, CIZ);
  g.add(isl);
  g.userData.can = isl.userData.can;

  // Parts that sit inside the band the window actually reaches, so it has
  // something to look at either side of the clock island: the two low-noise
  // regulators that feed the oven, and their tantalum reservoirs.
  for (const sx of [-1, 1]) {
    const reg = new THREE.Mesh(GEO.bevelBox(0.0062, 0.0022, 0.0056, 0.0004, 2), mats().plastic);
    put(reg, CIX + sx * 0.070, CIZ + 0.010, 0.0011);
    const tab = new THREE.Mesh(GEO.bevelBox(0.0058, 0.0003, 0.0026, 0.0001, 1), mats().steel);
    put(tab, CIX + sx * 0.070, CIZ + 0.0142, 0.0002);
    const tan = new THREE.Mesh(GEO.bevelBox(0.0034, 0.0018, 0.0018, 0.0003, 2), mats().anodGrey);
    put(tan, CIX + sx * 0.070, CIZ - 0.012, 0.0009);
  }

  // re-clocker, buffer DRAM, PHY magnetics, reservoir caps
  put(new THREE.Mesh(GEO.bevelBox(0.023, 0.0026, 0.023, 0.0004, 2), mats().plastic), -0.030, 0.150, 0.0013);
  put(new THREE.Mesh(GEO.bevelBox(0.016, 0.0006, 0.016, 0.0003, 2), mats().anodGrey), -0.030, 0.150, 0.0029);
  for (let i = 0; i < 2; i++) {
    put(new THREE.Mesh(GEO.bevelBox(0.0165, 0.0018, 0.0085, 0.0003, 2), mats().plastic), -0.100, 0.158 - i * 0.015, 0.0009);
  }
  put(new THREE.Mesh(GEO.bevelBox(0.024, 0.010, 0.014, 0.0006, 2), mats().plastic), -0.198, -0.150, 0.005);
  for (let i = 0; i < 4; i++) {
    const x = 0.150 + (i % 2) * 0.019, z = -0.148 + Math.floor(i / 2) * 0.021;
    put(new THREE.Mesh(GEO.bevelCyl(0.0052, 0.0054, 0.0135, 24, 0.0006), mats().anodBlack), x, z, 0.0068);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.0004, 20), mats().chrome), x, z, 0.0137);
  }
  const rnd = mulberry32(9);
  const smd = new THREE.InstancedMesh(GEO.bevelBox(0.0018, 0.0009, 0.0032, 0.0002, 1), mats().plastic, 130);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3();
  for (let i = 0; i < 130; i++) {
    const x = (rnd() - 0.5) * (iw - 0.02), z = -id / 2 + 0.012 + rnd() * (id - 0.03);
    q.setFromAxisAngle(up, rnd() < 0.5 ? 0 : Math.PI / 2);
    m4.compose(pv.set(x, y0 + 0.0013, z), q, s1);
    smd.setMatrixAt(i, m4);
  }
  smd.castShadow = true; g.add(smd);

  return g;
}

function buildHardware() {
  const g = new THREE.Group();
  g.position.set(LAYOUT.rack.x, LAYOUT.bayCentre(LAYOUT.bay.streamer, H), LAYOUT.rack.z);

  const wallT = 0.0035, lidT = 0.0045, faceT = 0.013;
  /* The fascia runs on its own brushed aluminium. A vertical panel photographed
     from slightly above mirrors the floor, which is the darkest thing in the
     room, so on the library brush at roughness 0.26 the face fell to near
     charcoal while its bevels clipped. Rougher and with a stronger env term the
     face lifts into a readable mid grey and the bevel highlight ramps instead
     of clipping — the long top-to-bottom gradient a machined front should
     have. */
  const alu = mats().alu.clone();
  alu.roughness = 0.31; alu.envMapIntensity = 1.20;
  const aluV = mats().aluV, blk = mats().anodBlack;

  const floorP = new THREE.Mesh(GEO.bevelBox(W, 0.004, D, 0.0012, 3), blk);
  floorP.position.y = -H / 2 + 0.002; g.add(floorP);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(GEO.bevelBox(wallT, H - 0.004, D - 0.002, 0.0010, 3), aluV);
    w.position.set(sx * (W / 2 - wallT / 2), 0.002, -0.001); g.add(w);
  }
  const rear = new THREE.Mesh(GEO.bevelBox(W - wallT * 2, H - 0.004, wallT, 0.0010, 3), blk);
  rear.position.set(0, 0.002, -D / 2 + wallT / 2); g.add(rear);

  /* The `cut` group is the whole of what changes as the chapter opens: the
     smoked infill behind a permanent machined window, and nothing else.

     An earlier pass dissolved the middle fascia panel and the lid. A front
     panel that vanishes does not read as a cutaway — it reads as a missing
     part, which is the one thing a product render must never look like. Every
     panel now stays; the window simply clears. */
  const cut = new THREE.Group();
  g.add(cut);
  const fz = D / 2 + 0.0002;
  const faceZ = D / 2 - faceT / 2;

  // Fascia in three milled pieces, 0.8 mm reveal between them. The middle one
  // is built as four bars around the window aperture.
  for (const [x0, x1] of [[-W / 2, CUT_X0], [CUT_X1, W / 2]]) {
    const w = x1 - x0 - 0.0008;
    const f = new THREE.Mesh(GEO.bevelBox(w, H, faceT, 0.0026, 5), alu);
    f.position.set((x0 + x1) / 2, 0, faceZ);
    g.add(f);
  }
  {
    const mx0 = CUT_X0 + 0.0004, mx1 = CUT_X1 - 0.0004;
    const ay0 = AP_CY - AP_H / 2, ay1 = AP_CY + AP_H / 2;
    const ax0 = AP_CX - AP_W / 2, ax1 = AP_CX + AP_W / 2;
    for (const [x0, x1, y0, y1] of [
      [mx0, mx1, ay1, H / 2],          // top rail
      [mx0, mx1, -H / 2, ay0],         // bottom rail
      [mx0, ax0, ay0, ay1],            // left jamb
      [ax1, mx1, ay0, ay1]]) {         // right jamb
      const bar = new THREE.Mesh(GEO.bevelBox(x1 - x0, y1 - y0, faceT, 0.0016, 4), alu);
      bar.position.set((x0 + x1) / 2, (y0 + y1) / 2, faceZ);
      g.add(bar);
    }
    // The aperture's inner reveal: a dark machined surround set 4 mm back, so
    // the window has a wall and a depth rather than being a hole in a decal.
    for (const [w, h, dx, dy] of [
      [AP_W + 0.004, 0.0035, 0, AP_H / 2 - 0.0008],
      [AP_W + 0.004, 0.0035, 0, -AP_H / 2 + 0.0008],
      [0.0035, AP_H - 0.0016, -AP_W / 2 + 0.0008, 0],
      [0.0035, AP_H - 0.0016, AP_W / 2 - 0.0008, 0]]) {
      const r = new THREE.Mesh(GEO.bevelBox(w, h, 0.010, 0.0006, 2), blk);
      r.position.set(AP_CX + dx, AP_CY + dy, faceZ - 0.0016);
      g.add(r);
    }
  }

  // A milled shadow-gap along the bottom of the fascia: the dark line that
  // separates a machined front from the shelf it stands on.
  const gap = new THREE.Mesh(GEO.bevelBox(W - 0.004, 0.0042, 0.0035, 0.0008, 2), blk);
  gap.position.set(0, -H / 2 + 0.0032, fz - 0.0016); g.add(gap);

  const bez = new THREE.Mesh(GEO.bevelBox(DISP_W + 0.009, DISP_H + 0.009, 0.003, 0.0008, 3), blk);
  bez.position.set(DISP_X, DISP_Y, fz - 0.0012); g.add(bez);
  const ol = oled();
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(DISP_W, DISP_H),
    new THREE.MeshBasicMaterial({ map: ol.tex, toneMapped: false }));
  disp.position.set(DISP_X, DISP_Y, fz + 0.0009); g.add(disp);

  /* A trim ring around the display, proud of the bezel. It is what tells the
     eye there is a physical window here and not a printed panel, and it gives
     the glass an edge to sit in.

     It runs on its OWN aluminium, rougher and with a weaker env term than the
     library brush. A 2.4 mm bar with a 0.7 mm fillet sweeps its mirror
     direction through the whole front strip over a couple of pixels, so on
     M.alu (roughness 0.26) it clipped to a 100 % white hairline with visible
     lateral CA. At 0.40 the same bar carries a grey ramp with a bright core —
     which is what a machined bezel actually does. */
  const trimM = mats().alu.clone();
  trimM.roughness = 0.40; trimM.envMapIntensity = 0.62; trimM.color.setHex(0xa9aeb4);
  for (const [w, h, dx, dy] of [
    [DISP_W + 0.0132, 0.0024, 0, DISP_H / 2 + 0.0054],
    [DISP_W + 0.0132, 0.0024, 0, -DISP_H / 2 - 0.0054],
    [0.0024, DISP_H + 0.0036, -DISP_W / 2 - 0.0054, 0],
    [0.0024, DISP_H + 0.0036, DISP_W / 2 + 0.0054, 0]]) {
    const t = new THREE.Mesh(GEO.bevelBox(w, h, 0.0026, 0.0007, 3), trimM);
    t.position.set(DISP_X + dx, DISP_Y + dy, fz + 0.0004); g.add(t);
  }

  /* THE SPECULAR LAYER, twice. Without it a lit panel is a decal: the emissive
     is the only thing the surface does. Both covers are real dielectrics with
     their own reflection — almost flat across the width so the wide front strip
     lands as one long horizontal band, and curved top-to-bottom so that band
     has a gradient either side of it instead of mirroring the dark floor
     straight back at the lens. Both are raked back 6°, because with the glass
     vertical the mirror direction points at the floor, which is the darkest
     thing in the room. */
  const cover = new THREE.Mesh(
    curvedPane(DISP_W + 0.007, DISP_H + 0.008, 12.0, 0.150, 30, 20), coverGlass(0.36, 1.5));
  cover.position.set(DISP_X, DISP_Y, fz + 0.0012);
  cover.rotation.x = -0.105;
  cover.renderOrder = 4;
  g.add(cover);

  const win = new THREE.Mesh(
    curvedPane(AP_W + 0.002, AP_H + 0.002, 30.0, 1.20, 26, 18), coverGlass(0.135, 0.85));
  win.position.set(AP_CX, AP_CY, faceZ + faceT / 2 - 0.0016);
  win.rotation.x = -0.130;
  win.renderOrder = 5;
  g.add(win);

  // The smoked infill behind that glass. This is what dissolves: closed, the
  // window is a dark pane; open, it is a view of the oven.
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(AP_W, AP_H), mats().anodBlack.clone());
  smoke.position.set(AP_CX, AP_CY, faceZ + faceT / 2 - 0.0042);
  cut.add(smoke);

  const kn = GEO.knob(0.0185, 0.013, { flutes: 64 });
  kn.rotation.x = Math.PI / 2; kn.position.set(0.222, 0.002, fz + 0.0055); g.add(kn);
  const kRing = new THREE.Mesh(new THREE.TorusGeometry(0.0206, 0.0009, 10, 44), mats().chrome);
  kRing.position.set(0.222, 0.002, fz + 0.0006); g.add(kRing);
  // Transport buttons, on the solid fascia below the display — they used to sit
  // inside the window aperture, where they had nothing to be milled into.
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(GEO.bevelCyl(0.0040, 0.0042, 0.0026, 24, 0.0004), mats().anodGrey);
    b.rotation.x = Math.PI / 2; b.position.set(-0.058 + i * 0.025, -0.0325, fz + 0.0012); g.add(b);
  }
  const sb = new THREE.Mesh(GEO.bevelCyl(0.0055, 0.0058, 0.003, 28, 0.0005), mats().anodGrey);
  sb.rotation.x = Math.PI / 2; sb.position.set(-0.238, 0.002, fz + 0.0013); g.add(sb);
  const sled = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 14), mats().ledCyan);
  sled.position.set(-0.238, 0.027, fz + 0.0006); g.add(sled);

  GEO.screwRow(g, [[-W / 2 + 0.011, H / 2 - 0.010], [-W / 2 + 0.011, -H / 2 + 0.010],
    [W / 2 - 0.011, H / 2 - 0.010], [W / 2 - 0.011, -H / 2 + 0.010]], fz + 0.0006, 0.0017);

  const inner = internals();
  g.add(inner);

  const lid = new THREE.Group();
  const lp = new THREE.Mesh(GEO.bevelBox(W, lidT, D - faceT, 0.0012, 3), blk);
  lp.position.z = -faceT / 2; lid.add(lp);
  const vents = GEO.ventSlots(0.20, 0.21, 3, 12, { sd: 0.016, sw: 0.0045 });
  vents.position.set(0, lidT / 2 - 0.0006, -0.075); lid.add(vents);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const s = GEO.screw(0.0016); s.rotation.x = 0;
    s.position.set(sx * (W / 2 - 0.012), lidT / 2 + 0.0003, -faceT / 2 + sz * (D / 2 - 0.022));
    lid.add(s);
  }
  lid.position.set(0, H / 2 - lidT / 2, 0);
  g.add(lid);

  /* The lid STAYS ON, and so does every panel. The reveal is the window
     clearing, nothing more.

     An earlier pass dissolved the lid so the key light could reach the board.
     It turns out not to be needed: image-based lighting is not occluded by
     geometry, so the interior seen through the aperture is lit by the studio
     environment whether the lid is there or not — and a box with its lid
     missing reads as a broken product, which is a much larger cost than the
     one direct-light bounce it buys.

     Clone every material in `cut` first: the library ones are shared with every
     other stage, and fadeTree writes opacity onto whatever it is given. */
  cut.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.userData.op0 = o.material.opacity ?? 1;
  });

  g.add(GEO.at(rearPanel(), 0, 0.004, -D / 2 - 0.0005));

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Mesh(GEO.bevelCyl(0.010, 0.011, 0.005, 24, 0.0006), mats().steel);
    f.position.set(sx * (W / 2 - 0.038), -H / 2 - 0.0024, sz * (D / 2 - 0.052));
    g.add(f);
  }

  GEO.shadowed(g);
  disp.castShadow = disp.receiveShadow = false;
  cover.castShadow = cover.receiveShadow = false;
  win.castShadow = win.receiveShadow = false;
  smoke.castShadow = smoke.receiveShadow = false;
  sled.castShadow = sled.receiveShadow = false;
  const sh = GEO.contactShadow(W * 1.45, D * 1.45, 0.40, 0);
  sh.position.set(0, -H / 2 - 0.0038, 0); g.add(sh);

  g.userData.cut = cut;
  g.userData.oled = ol;
  g.userData.can = inner.userData.can;
  return g;
}

/* =========================================================================
   OVERLAY — one card, three plot regions, sitting above the chassis.
   Local origin = bottom-left of the content area.

   The card is deliberately narrower than the chassis (500 mm against 555 mm):
   the hardware is the subject and the diagram is its caption, not the reverse.
   ========================================================================= */
const PW = 0.446, PH = 0.160, PAD = 0.022;
const CARD_HALF = PH / 2 + PAD;
/** Chassis top is at 0.382; the card's outer edge clears it by 40 mm. */
const CARD_C = [-0.024, 0.382 + 0.040 + CARD_HALF, -3.020];
const P_OP = 1.0;      // fully opaque: at 0.93 the rack's specular highlights
                       // punch through in linear space and read as ghosts.

/* ribbon */
const RIB_X0 = 0.005, RIB_W = 0.436, RIB_H = 0.013, RIB_Y = 0.138;
const CELL_P = RIB_W / 32, CELL_W = CELL_P - 0.0024;
const HALF_P = CELL_P / 2, HALF_W = HALF_P - 0.0015;
const cellX = (i) => RIB_X0 + (i + 0.5) * CELL_P;
const halfX = (i) => RIB_X0 + (i + 0.5) * HALF_P;
const TITLE_Y = 0.157;

/* the two plots, and the arrival strip that shares the left one's time axis */
const GH = 0.062, GY = 0.024;
const SGY = 0.006, SGH = 0.013;
const OGX = 0.029, GW = 0.162;
/** The edge plot runs the full depth of the card: the left column spends its
 *  lower band on the arrival strip, and the punchline should not sit above
 *  100 px of dead plate. */
const EGH = GY + GH - SGY;
const EGX = 0.252, EGW = 0.163;
const CAP_Y = 0.104;

/** 48 edges out of a 50 ps rms population: enough for the ±1σ band the caption
 *  names to bound something visible. */
const N_EDGE = 48, N_SAMP = 110;

function buildOverlay(ctx, shot) {
  const ov = new THREE.Group();
  const S = { occAt: (b) => M.occAt(b) };

  const P = new THREE.Group();
  P.position.set(...CARD_C);
  // Face the card near the camera — a diagram read at an angle is a diagram
  // half-read — but hold it 5° off the lens axis, because a plate square to the
  // lens is always a decal.
  P.rotation.y = Math.atan2(shot.position[0] - CARD_C[0], shot.position[2] - CARD_C[2]) - 0.055;
  // Rake the pane back 4°, the way an instrument panel is raked. It costs
  // nothing in legibility and it lifts the reflected image of the front strip
  // off the top edge down into the plate, where it reads as a band.
  P.rotation.x = -0.070;
  ov.add(P);

  const C = new THREE.Group();
  C.position.set(-PW / 2, -PH / 2, 0);
  P.add(C);

  /* The card is a MACHINED PLATE, not a pasted PNG. A PlaneGeometry with a
     1 px border has no thickness, so it has no edge for the room to light and
     no shadow to drop on what is behind it — which is the single loudest CGI
     tell in a still. This is a real 12 mm slab with a bevelled fillet standing
     4 mm proud of the plate all round: the front strip catches that fillet as a
     thin bright rim, and the slab drops a soft shadow onto the converter behind
     it. The material is cloned because fadeTree writes opacity onto whatever it
     finds, and the library materials are shared with every other stage. */
  const slabM = mats().anodBlack.clone();
  slabM.color.setHex(0x14171b);
  const slab = new THREE.Mesh(
    GEO.bevelBox(PW + PAD * 2 + 0.008, PH + PAD * 2 + 0.008, 0.012, 0.0022, 4), slabM);
  slab.position.set(PW / 2, PH / 2, -0.0085);
  slab.castShadow = true; slab.receiveShadow = true;
  C.add(slab);

  const card = DIAG.diagramCard(PW, PH, { opacity: P_OP, pad: PAD });
  // fadeTree captures a mesh's base opacity the first time it sees it — and the
  // card group's own setOpacity(0) runs first in the same traverse. Seed it.
  card.userData.plate.userData._baseOp = P_OP;
  C.add(card);

  /* ---------- region 1: the AES3 subframe -------------------------------- */
  S.pre = new DIAG.Swarm(8, {
    color: 0xffffff, additive: false, geometry: new THREE.PlaneGeometry(HALF_W, RIB_H),
  });
  C.add(S.pre);
  S.dat = new DIAG.Swarm(28, {
    color: 0xffffff, additive: false, geometry: new THREE.PlaneGeometry(CELL_W, RIB_H),
  });
  C.add(S.dat);
  {
    const y = RIB_Y - RIB_H / 2 - 0.005;
    const pb = new DIAG.Trace(4, C_AUX, 1.0, { opacity: 0.55 });
    poly(pb, [[RIB_X0, y + 0.005], [RIB_X0, y], [RIB_X0 + 4 * CELL_P - 0.0024, y],
      [RIB_X0 + 4 * CELL_P - 0.0024, y + 0.005]]);
    C.add(pb);
    const ab = new DIAG.Trace(4, PAL.cy, 1.1, { opacity: 0.55 });
    poly(ab, [[cellX(4) - CELL_W / 2, y + 0.005], [cellX(4) - CELL_W / 2, y],
      [cellX(27) + CELL_W / 2, y], [cellX(27) + CELL_W / 2, y + 0.005]]);
    C.add(ab);
  }

  /* ---------- region 2: buffer occupancy, over its own arrival strip ------
     The arrival ticks used to live inside the occupancy plot box, sharing a
     0–140 ms axis they have nothing to do with. They now have their own strip
     below it, sharing only the time axis — which they DO share — and that
     shared axis carries the one set of numerals. */
  const og = new DIAG.Graph({
    w: GW, h: GH, xRange: [-WIN, 0], yRange: [BUF_LO, BUF_HI],
    xTicks: [-0.36, -0.27, -0.18, -0.09, 0], yTicks: [70, 90, 110, 130],
  });
  og.position.set(OGX, GY, 0.0006); C.add(og); S.og = og;
  const tgt = new DIAG.Trace(2, PAL.am, 1.2, { opacity: 0.6, dashed: true, dashSize: 0.006, gapSize: 0.005 });
  poly(tgt, [[0, og.y(BUF_TARGET), 0.0008], [GW, og.y(BUF_TARGET), 0.0008]]);
  og.add(tgt);
  og.addTrace((x) => S.occAt(-x), { color: PAL.cy, width: 2.0, n: 150 });
  og.tickLabels(ctx.labels, {
    yVals: [70, 100, 130], yFmt: (v) => v.toFixed(0), yOffset: [-15, 0],
  });

  const ag = new DIAG.Graph({
    w: GW, h: SGH, xRange: [-WIN, 0], yRange: [0, 1],
    xTicks: [-0.36, -0.27, -0.18, -0.09, 0], yTicks: [], grid: false,
  });
  ag.position.set(OGX, SGY, 0.0006); C.add(ag); S.ag = ag;
  S.pk = new DIAG.Swarm(96, {
    color: 0xffffff, additive: false, geometry: new THREE.PlaneGeometry(0.0010, SGH * 0.78),
  });
  S.pk.position.z = 0.0010;
  ag.add(S.pk);
  S.tickY = SGH / 2;
  ag.tickLabels(ctx.labels, {
    xVals: [-0.36, -0.18, 0],
    xFmt: (v) => (v * 1000).toFixed(0).replace('-', '−'),
    xOffset: [0, 12],
  });

  /* ---------- region 3: the clock edge, as a population ------------------
     Three or four traces are not an eye. This draws N_EDGE edges whose
     displacements are drawn from a Gaussian of 50 ps rms, as a density
     scatter, so the ±50 ps band the caption names is visibly the ±1σ envelope
     of the population it bounds — and so the crossing has a real width. */
  const eg = new DIAG.Graph({
    w: EGW, h: EGH, xRange: [-500, 500], yRange: [-0.08, 1.12],
    xTicks: [-400, -200, 0, 200, 400], yTicks: [0, 0.5, 1], zeroLine: 0.5,
  });
  eg.position.set(EGX, SGY, 0.0006); C.add(eg); S.eg = eg;
  const TE = 400 / (2 * Math.atanh(0.6));           // 20–80 % edge = 400 ps
  const edge = (x, sh) => 0.5 * (1 + Math.tanh((x - sh) / TE));

  const bandM = new THREE.Mesh(new THREE.PlaneGeometry(eg.x(50) - eg.x(-50), EGH),
    new THREE.MeshBasicMaterial({ color: PAL.am, transparent: true, opacity: 0.035, depthWrite: false, toneMapped: false }));
  bandM.position.set(eg.x(0), EGH / 2, -0.0003); bandM.renderOrder = 6; eg.add(bandM);

  {
    const rndE = mulberry32(51413);
    const off = new Float64Array(N_EDGE);
    for (let j = 0; j < N_EDGE; j++) off[j] = gauss(rndE) * (TJ * 1e12);
    // One instanced mesh, one draw call. The per-dot colour is a twelfth of the
    // accent, so density — not opacity — is what builds the band; that is what
    // an edge population actually looks like on a scope.
    const pop = new DIAG.Swarm(N_EDGE * N_SAMP, {
      color: 0xffffff, additive: true, geometry: new THREE.PlaneGeometry(0.0016, 0.0016),
    });
    pop.renderOrder = 7;
    const dim = new THREE.Color(PAL.am).multiplyScalar(0.052);
    pop.update((i) => {
      const j = (i / N_SAMP) | 0, k = i - j * N_SAMP;
      const xp = -500 + (1000 * k) / (N_SAMP - 1);
      return { p: [eg.x(xp), eg.y(edge(xp, off[j])), 0.0003], s: 1, c: dim };
    });
    eg.add(pop);
  }

  eg.addTrace((x) => edge(x, 0), { color: PAL.cy, width: 1.5, n: 80, dashed: true, z: 0.0010 });
  S.edgeT = eg.addTrace((x) => edge(x, S.dt || 0), { color: 0xffe3b4, width: 2.6, n: 80, z: 0.0012 });
  S.edgeDot = eg.addDot(PAL.am, 0.0036);
  eg.tickLabels(ctx.labels, {
    xVals: [-400, 0, 400], yVals: [0, 1],
    xFmt: (v) => v.toFixed(0).replace('-', '−'),
    yFmt: (v) => v.toFixed(0),
    xOffset: [0, 12], yOffset: [-12, 0],
  });

  /* ---------- the specular layer over the card ---------------------------
     The card is a physical pane in the room, not a screen-space overlay, so it
     has to carry a reflection. Curved, so the front strip crosses it as a soft
     band with a gradient rather than sitting on it as a flat value. */
  const pane = new THREE.Mesh(
    curvedPane(PW + PAD * 2, PH + PAD * 2, 22.0, 0.95, 26, 20), coverGlass(0.100, 1.70));
  pane.position.set(PW / 2, PH / 2, 0.0016);
  pane.renderOrder = 26;
  pane.castShadow = pane.receiveShadow = false;
  C.add(pane);

  /* ---------- callout: the real oscillator, in the box ------------------- */
  const canW = new THREE.Vector3();
  HW.userData.can.getWorldPosition(canW);
  // The label lives in the clear band between the chassis lid and the card, so
  // it sits over its OWN chassis and nothing else, with a leader that comes out
  // through the window and up the front.
  const CO = [canW.x, 0.406, -3.038];
  const lead = new DIAG.Trace(5, 0x7c8894, 1.1, { opacity: 0.7, dashed: true, dashSize: 0.005, gapSize: 0.004 });
  poly(lead, [[canW.x, canW.y + 0.006, canW.z],
    [canW.x, canW.y + 0.010, -3.044],
    [CO[0], CO[1] - 0.006, CO[2] - 0.006],
    [CO[0], CO[1] - 0.002, CO[2] - 0.006]]);
  ov.add(lead);
  S.coAnchor = anchor(ov, CO[0], CO[1], CO[2]);

  /* ============ labels ===============================================
     Two lines each wherever possible: a kicker that names the thing and a value
     line that delivers the number. The argument belongs in the panel; a
     product-render callout is a caption, not a paragraph. */
  const L = ctx.labels;
  S.lab = {};
  S.lab.bits = L.add(anchor(C, RIB_X0 + RIB_W / 2, TITLE_Y), {
    kicker: 'AES3 SUBFRAME · 32 bit',
    value: `0x000000 · drawn 1 : ${group(REAL_RATIO)} of real time`,
    cls: 'acc', occlude: false, priority: 4, offset: [0, -4],
  });
  S.lab.buf = L.add(anchor(C, OGX + GW / 2, CAP_Y), {
    kicker: 'BUFFER FILL · ms',
    text: 'strip below: packet arrivals',
    value: '120 ms', cls: 'acc', occlude: false, priority: 3, offset: [0, -4],
  });
  // Kickers are capped at 34ch by CSS, but `ch` does not include the 0.13em
  // letterspacing, so anything past ~27 characters wraps and orphans its units.
  S.lab.edge = L.add(anchor(C, EGX + EGW / 2, CAP_Y), {
    kicker: `CLOCK EDGE · 1σ = ${(TJ * 1e12).toFixed(0)} ps`,
    text: `${N_EDGE} draws · peak at 10 kHz`,
    value: 'Δt = +0 ps', cls: 'am', occlude: false, priority: 3, offset: [0, -4],
  });
  S.lab.ocxo = L.add(S.coAnchor, {
    kicker: `OCXO · ${(MCLK / 1e6).toFixed(4)} MHz = 128 f_s`,
    value: `24-bit budget ${(TJ_24 * 1e12).toFixed(2)} ps rms`, cls: 'acc',
    occlude: false, priority: 6, offset: [0, 0],
  });

  ov.userData.S = S;
  return ov;
}

/* =========================================================================
   NETWORK MODEL — a D/D/1 queue behind a 1 GbE port.

   Packet n is nominally due at n/PKT_RATE. It is released at
       rel = max(nominal, serialiser free, end of any stall)
   and the serialiser is then busy for one wire frame, T_SER. Nothing is ever
   lost or skipped, so the long-run delivery rate is exactly PKT_RATE and the
   buffer neither drains nor runs away; a stall costs occupancy and the
   catch-up burst, at line rate, gives it back.
   ========================================================================= */
function makeModel() {
  const rnd = mulberry32(20240719);
  const RING = 512, DTS = 0.0008;
  const ring = new Float32Array(RING).fill(BUF_TARGET);
  const AR = 4096;
  const arT = new Float64Array(AR), arK = new Uint8Array(AR);
  const m = {
    t: 0, occ: BUF_TARGET, n: 0, free: 0, stallEnd: 0, stallKind: 0,
    head: 0, ringHead: 0, ringAcc: 0, nStall: 0, nRetx: 0,
  };
  m.step = (dt) => {
    if (!(dt > 0)) return;
    m.t += dt;
    let guard = 0;
    for (;;) {
      const nom = m.n / PKT_RATE;
      const rel = Math.max(nom, m.free, m.stallEnd);
      if (rel > m.t || guard++ > 6000) break;
      m.n++;
      m.free = rel + T_SER;
      m.occ += PKT_AUDIO * 1000;
      const late = rel > nom + 1e-12;
      arT[m.head % AR] = rel;
      arK[m.head % AR] = late ? (m.stallKind === 1 ? 1 : 2) : 0;
      m.head++;
      if (!late) {                                  // only a caught-up sender stalls
        if (rnd() < (1 / PKT_RATE) / STALL_MEAN) {  // a switch queues behind other traffic
          m.stallEnd = rel + 0.010 + rnd() * 0.032;
          m.stallKind = 0; m.nStall++;
        } else if (rnd() < 1 / RETX_ONE_IN) {       // a segment is lost and re-sent
          m.stallEnd = rel + RTT;
          m.stallKind = 1; m.nRetx++;
        }
      }
    }
    m.occ = Math.max(0, m.occ - dt * 1000);         // exactly 1000 ms of audio per second
    m.ringAcc += dt;
    let g2 = 0;
    while (m.ringAcc >= DTS && g2++ < 600) {
      m.ringAcc -= DTS;
      m.ringHead = (m.ringHead + 1) % RING;
      ring[m.ringHead] = m.occ;
    }
  };
  /** Walk the arrival ring back over `win` seconds, newest first. */
  m.recent = (win, cb) => {
    const cut = m.t - win;
    let n = 0;
    for (let i = m.head - 1; i >= 0 && i > m.head - AR; i--) {
      const j = ((i % AR) + AR) % AR;
      if (arT[j] < cut) break;
      if (cb) cb(arT[j], arK[j], n);
      n++;
    }
    return n;
  };
  m.occAt = (back) => ring[(((m.ringHead - Math.round(back / DTS)) % RING) + RING) % RING];
  return m;
}

/* =========================================================================
   STAGE
   ========================================================================= */
const M = makeModel();

/**
 * Framing. The subject is a 555 × 92 mm rack unit with a 500 mm diagram card
 * stacked above it; radius is HALF THE STACK, not the chassis's bounding
 * sphere, so `fill` means what it says. At fill 0.60 the fascia is about
 * 127 px tall and 767 px wide inside the 960 × 840 safe box: the hardware is
 * the largest object in the frame, which is the point.
 */
const STACK_LO = 0.290;                                   // shelf line
const STACK_HI = CARD_C[1] + CARD_HALF;                   // card outer top
const SHOT = frameShot([-0.015, (STACK_LO + STACK_HI) / 2 + 0.050, -3.040],
  (STACK_HI - STACK_LO) / 2, { fill: 0.65, az: -0.15, el: 0.115, fov: 26 });

/**
 * ONE LATCHED INSTANT.
 *
 * The pinned readouts refresh at 10 Hz and the world labels used to refresh
 * every frame, so a still frame showed the buffer as 106 ms on the card and
 * 108 ms in the footer. Latching in update() is not enough either: the two
 * cadences still land on different ticks. So the snapshot is taken inside
 * readouts(), which the app calls at exactly the moment it rewrites the
 * footer — the card labels, the eye trace, the front-panel display and the
 * footer therefore all carry the SAME instant, always.
 *
 * It re-latches only when the model has actually advanced, so pausing freezes
 * every number rather than letting the jitter draw keep running.
 */
const DISP = { occ: BUF_TARGET, rate: PKT_RATE, dt: 0, errDb: -140, t: -1 };
const _jr = mulberry32(88117);

function latch() {
  DISP.t = M.t;
  DISP.occ = M.occ;
  DISP.rate = M.recent(WIN) / WIN;
  // One Gaussian draw per tick, clipped to the plot: a single edge out of the
  // same 50 ps rms population the scatter behind it is drawn from.
  DISP.dt = DSP.clamp(gauss(_jr) * (TJ * 1e12), -190, 190);
  // Error amplitude for that displacement on a full-scale 10 kHz sine.
  DISP.errDb = DSP.dB(DSP.TAU * JF * Math.max(1e-3, Math.abs(DISP.dt)) * 1e-12);
  if (!S) return;
  S.dt = DISP.dt;
  S.eg._fill(S.edgeT);
  S.edgeDot.userData.setData(DISP.dt, 0.5);
  S.lab.buf.setValue(`${DISP.occ.toFixed(0)} ms`);
  S.lab.edge.setValue(
    `Δt ${DISP.dt >= 0 ? '+' : '−'}${Math.abs(DISP.dt).toFixed(0)} ps → ${DISP.errDb.toFixed(1)} dBFS`);
  HW.userData.oled.draw(DISP.occ);
}

let S = null, HW = null;

export default {
  id: 'streamer',
  title: 'Network&nbsp;to Bits',
  nav: 'Streamer',
  kicker: 'STREAMER',
  standfirst: 'TCP guarantees the bits. Only a local oscillator can guarantee the instants.',
  shot: SHOT,
  timeScale: TS,
  alwaysUpdate: false,

  build(ctx) {
    HW = buildHardware();
    const overlay = buildOverlay(ctx, SHOT);
    S = overlay.userData.S;
    // Run the model through more than one graph window so the strip chart opens
    // with real history rather than a flat pre-roll.
    for (let i = 0; i < 1200; i++) M.step(0.0005);
    latch();
    return { hardware: HW, overlay };
  },

  setReveal(k) {
    const cut = HW.userData.cut;
    const f = 1 - DSP.smoothstep(0.06, 0.62, k);
    cut.traverse((o) => {
      if (!o.isMesh) return;
      o.material.opacity = (o.userData.op0 ?? 1) * f;
      o.castShadow = f > 0.5;
    });
    cut.visible = f > 0.004;
  },

  update(dt, t) {
    M.step(dt);
    if (!S) return;

    /* ---- the AES3 subframe, at its own rate --------------------------- */
    const ci = Math.floor(t * BIT_PER_SIM_S);
    const sf = subframeAt(Math.floor(ci / 32));
    const cur = ((ci % 32) + 32) % 32;

    S.pre.update((i) => {
      const hi = sf.pre[i];
      const isNow = cur < 4 && (i >> 1) === cur;
      return { p: [halfX(i), RIB_Y, 0.0008], s: 1, c: isNow ? C_NOW : (hi ? C_PRE : C_AUXD) };
    });
    // The WHOLE subframe is always drawn at its true values, with one bright
    // cell marking where the bit clock is. Drawing the bits ahead of the cursor
    // as unlit would be a truer picture of a serial line, but it leaves a still
    // frame showing six cells out of thirty-two — and this piece is read as
    // stills. The cursor carries the time; the cells carry the word.
    S.dat.update((i) => {
      const idx = i + 4, b = sf.bits[idx];
      const col = idx === cur ? C_NOW
        : idx < 28 ? (b ? C_LIT : C_DIM)
          : (b ? C_AUX : C_AUXD);
      return { p: [cellX(idx), RIB_Y, 0.0008], s: 1, c: col };
    });
    S.lab.bits.setValue('0x' + sf.val.toString(16).toUpperCase().padStart(6, '0')
      + ` · drawn 1 : ${group(REAL_RATIO)} of real time`);

    /* ---- packet layer -------------------------------------------------- */
    const g = S.ag, ph = S.pk;
    let k = 0;
    M.recent(WIN, (ta, kind) => {
      if (k >= ph.count) return;
      ph.setColorAt(k, _col.set(kind === 1 ? C_AM : (kind === 2 ? 0x9ad9f7 : C_LIT)));
      _m4.compose(_pv.set(g.x(ta - M.t), S.tickY, 0), _q, _s1);
      ph.setMatrixAt(k, _m4);
      k++;
    });
    for (let i = k; i < ph.count; i++) {
      _m4.compose(_pv.set(0, 0, 0), _q, _s0);
      ph.setMatrixAt(i, _m4);
    }
    ph.instanceMatrix.needsUpdate = true;
    if (ph.instanceColor) ph.instanceColor.needsUpdate = true;
    S.og.refresh();
  },

  content() {
    return `
<div class="myth"><span class="lab">Commonly got wrong</span><p>That "bit-perfect" settles the question. It settles the numbers — not the instants at which they are converted, and only the numbers crossed the network.</p></div>

<h3>What arrives</h3>
<p>Two channels of 24-bit samples at 44.1 kHz is <span class="num">2.1168 Mbit/s</span>. A 1460 B segment carries whole 6 B frames only — 243 of them, <span class="num">1458 B</span>, 5.5102 ms — so <span class="num">181.5 packet/s</span>, and they do not arrive on that beat: the model stalls the switch every <span class="num">90 ms</span> and re-sends one segment in <span class="num">380</span>, into a <span class="num">120 ms</span> buffer. TCP repairs every loss; <b>when</b> is the one thing it cannot supply.</p>

<h3>What leaves</h3>
<p>Biphase-mark coding halves every AES3 bit, so the line runs at 128 f<sub>s</sub> = <span class="num">5.6448 MHz</span> — the oven's own frequency. A sample converted Δt early on a tone f errs by A·2πf·Δt:</p>
<div class="eq">SNR = −20 log₁₀(2π f t_j)
    = <span class="hl">${SNR_TJ.toFixed(1)} dB</span>   f 10 kHz, t_j 50 ps rms
<span class="c">over 0–${(FS / 2000).toFixed(2)} kHz; ${SNR_20K.toFixed(1)} dB counted to 20 kHz</span>
<span class="c">24-bit floor ${SNR_24.toFixed(1)} dB, which ${(TJ_24 * 1e12).toFixed(2)} ps rms reaches</span></div>`;
  },

  readouts() {
    if (M.t !== DISP.t) latch();
    return [
      { k: 'PAYLOAD', v: (PAYLOAD_BPS / 1e6).toFixed(4), u: 'Mbit/s', cls: 'acc' },
      { k: 'BIT CLOCK', v: (BCLK / 1e6).toFixed(4), u: 'MHz', cls: 'acc' },
      { k: 'BUFFER', v: DISP.occ.toFixed(0), u: 'ms', bar: DISP.occ / BUF_FULL },
      { k: 'ARRIVAL 0.36 s', v: DISP.rate.toFixed(0), u: 'pkt/s', cls: '' },
      { k: 'CLOCK Δt', v: (DISP.dt >= 0 ? '+' : '−') + Math.abs(DISP.dt).toFixed(0), u: 'ps', cls: 'am' },
      { k: 'ERROR 10 kHz', v: DISP.errDb.toFixed(1), u: 'dBFS', cls: 'am' },
    ];
  },
};

/* scratch objects for the arrival ticks */
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pv = new THREE.Vector3();
const _s1 = new THREE.Vector3(1, 1, 1);
const _s0 = new THREE.Vector3(0, 0, 0);
