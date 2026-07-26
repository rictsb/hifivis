import * as THREE from 'three';
import { LAYOUT, frameShot } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* =========================================================================
   NETWORK TO BITS — every constant below is derived, none is chosen.

   The chain runs at 44.1 kHz because the converter in bay 2 does: its
   front panel lights the 44.1 segment and its whole reconstruction argument
   is built on two points per cycle at 20 kHz. One rate for the whole chain.
   ========================================================================= */

const FS = 44100, NBITS = 24, NCH = 2;
const PAYLOAD_BPS = NCH * NBITS * FS;              // 2 116 800 bit/s
const PAYLOAD_B = PAYLOAD_BPS / 8;                 // 264 600 byte/s
const FRAME_B = (NCH * NBITS) / 8;                 // 6 byte per stereo frame
const MSS = 1460;                                  // 1500 MTU − 20 IPv4 − 20 TCP
/* A segment carries whole frames only: 1460/6 = 243.33, so 243. */
const SEG_FRAMES = Math.floor(MSS / FRAME_B);      // 243
const SEG_B = SEG_FRAMES * FRAME_B;                // 1458 byte of payload
const PKT_AUDIO = SEG_FRAMES / FS;                 // 5.5102 ms of music
const PKT_RATE = FS / SEG_FRAMES;                  // 181.481 packet/s
const WIRE_B = SEG_B + 40 + 14 + 4 + 8 + 12;       // 1536 B on the wire
const LINE_BPS = 1e9;                              // 1000BASE-T
const T_SER = (WIRE_B * 8) / LINE_BPS;             // 12.288 µs per frame
const LINE_PPS = 1 / T_SER;                        // 81 380 packet/s at line rate

const BCLK = 64 * FS;                              // 2.8224 MHz — AES3 frame is 64 bit
const MCLK = 128 * FS;                             // 5.6448 MHz — biphase channel rate

const TJ = 50e-12, JF = 1e4;
const SNR_TJ = DSP.jitterSnrDb(JF, TJ);            // 110.06 dB rms, 0–fs/2
const SNR_24 = DSP.quantSnrDb(NBITS);              // 146.26 dB
const TJ_24 = 1 / (DSP.TAU * JF * DSP.undB(SNR_24)); // 0.7746 ps
const SNR_20K = SNR_TJ + 10 * Math.log10((FS / 2) / 20000); // 110.48 dB in 20 kHz

/* Time. The packet layer runs at the stage timeScale; the bit layer is far too
   fast for that, so it is derived from t with its own multiplier and the ratio
   is stated on screen. */
const TS = 0.02;                                   // 1 simulated s per 50 real s
const CELL_PER_REAL_S = 24;
const CELL_PER_SIM_S = CELL_PER_REAL_S / TS;       // 1200 cell per simulated second
const CELL_RATIO = Math.round(BCLK / CELL_PER_REAL_S);   // 117 600 : 1 against real time

/* Receive buffer. 120 ms is a wired-LAN figure; Wi-Fi players use seconds. */
const BUF_TARGET = 120, BUF_FULL = 140;            // ms of audio
const WIN = 0.360;                                 // s of history on the strip chart
const STALL_MEAN = 0.090;                          // mean interval between stalls, s
const RETX_ONE_IN = 380;                           // segments needing a retransmission
const RTT = 0.0045;                                // fast-retransmit round trip

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
function anchor(parent, x, y, z = 0) {
  const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o;
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
/** Fascia is milled in three pieces; the middle one is the cutaway window. */
const CUT_X0 = 0.022, CUT_X1 = 0.186;
/** Clock island, in the band the cutaway can see: 60 mm behind the fascia. */
const OCXO_POS = [(CUT_X0 + CUT_X1) / 2, 0, 0.160];

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
    g.fillStyle = '#7fd2ff'; g.font = mono(48); g.fillText('44.1', 16, 58);
    g.font = mono(24, 500); g.fillStyle = '#4e93b6'; g.fillText('kHz', 130, 57);
    g.fillStyle = '#7fd2ff'; g.font = mono(48); g.fillText('24', 206, 58);
    g.font = mono(24, 500); g.fillStyle = '#4e93b6'; g.fillText('bit', 264, 57);
    g.fillStyle = '#7fd2ff'; g.font = mono(28); g.fillText('AES · LOCK', 380, 55);
    g.font = mono(19, 500); g.fillStyle = '#4e93b6'; g.fillText('BUF', 16, 105);
    g.fillStyle = '#12303f'; g.fillRect(62, 87, 392, 18);
    g.fillStyle = '#5cc0f2'; g.fillRect(62, 87, 392 * Math.min(1, occ / BUF_FULL), 18);
    g.fillStyle = '#7fd2ff'; g.font = mono(23); g.fillText(`${occ.toFixed(0)} ms`, 474, 106);
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
 * The clock island: U-shaped shield fence (open at the front so the cutaway
 * can see in), gold-plated OCXO can with its own lid and four pins, and the
 * reference-lock LED. It sits in the front band of the board because that is
 * the only part a front cutaway reaches.
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
  const board = new THREE.Mesh(GEO.bevelBox(iw, 0.0016, id, 0.0006, 2), mats().pcb);
  board.position.set(0, y0, -0.002); board.receiveShadow = true; g.add(board);
  const put = (mesh, x, z, y = 0) => {
    mesh.position.set(x, y0 + 0.0008 + y, z); mesh.castShadow = true; g.add(mesh); return mesh;
  };

  const [CIX, , CIZ] = OCXO_POS;
  const isl = clockIsland();
  isl.position.set(CIX, y0 + 0.0008, CIZ);
  g.add(isl);
  g.userData.can = isl.userData.can;

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
  const alu = mats().alu, aluV = mats().aluV, blk = mats().anodBlack;

  const floorP = new THREE.Mesh(GEO.bevelBox(W, 0.004, D, 0.0012, 3), blk);
  floorP.position.y = -H / 2 + 0.002; g.add(floorP);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(GEO.bevelBox(wallT, H - 0.004, D - 0.002, 0.0010, 3), aluV);
    w.position.set(sx * (W / 2 - wallT / 2), 0.002, -0.001); g.add(w);
  }
  const rear = new THREE.Mesh(GEO.bevelBox(W - wallT * 2, H - 0.004, wallT, 0.0010, 3), blk);
  rear.position.set(0, 0.002, -D / 2 + wallT / 2); g.add(rear);

  // Fascia in three milled pieces, 0.8 mm reveal between them. The middle one
  // is the cutaway window and lives in its own group so it can dissolve.
  const cut = new THREE.Group();
  g.add(cut);
  for (const [x0, x1, isCut] of [[-W / 2, CUT_X0, false], [CUT_X0, CUT_X1, true], [CUT_X1, W / 2, false]]) {
    const w = x1 - x0 - 0.0008;
    const f = new THREE.Mesh(GEO.bevelBox(w, H, faceT, 0.0026, 5), alu);
    f.position.set((x0 + x1) / 2, 0, D / 2 - faceT / 2);
    (isCut ? cut : g).add(f);
  }
  const fz = D / 2 + 0.0002;

  // A milled shadow-gap along the bottom of the fascia: the dark line that
  // separates a machined front from the shelf it stands on.
  const gap = new THREE.Mesh(GEO.bevelBox(W - 0.004, 0.0042, 0.0035, 0.0008, 2), blk);
  gap.position.set(0, -H / 2 + 0.0032, fz - 0.0016); g.add(gap);

  const dw = 0.200, dh = 0.040;
  const bez = new THREE.Mesh(GEO.bevelBox(dw + 0.009, dh + 0.009, 0.003, 0.0008, 3), blk);
  bez.position.set(-0.086, 0.004, fz - 0.0012); g.add(bez);
  const ol = oled();
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh),
    new THREE.MeshBasicMaterial({ map: ol.tex, toneMapped: false }));
  disp.position.set(-0.086, 0.004, fz + 0.0009); g.add(disp);

  const kn = GEO.knob(0.0185, 0.013, { flutes: 64 });
  kn.rotation.x = Math.PI / 2; kn.position.set(0.222, 0.002, fz + 0.0055); g.add(kn);
  const kRing = new THREE.Mesh(new THREE.TorusGeometry(0.0206, 0.0009, 10, 44), mats().chrome);
  kRing.position.set(0.222, 0.002, fz + 0.0006); g.add(kRing);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(GEO.bevelCyl(0.0042, 0.0044, 0.0026, 24, 0.0004), mats().anodGrey);
    b.rotation.x = Math.PI / 2; b.position.set(0.062 + i * 0.021, -0.030, fz + 0.0012); cut.add(b);
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
  const hinge = new THREE.Group();
  hinge.position.set(0, H / 2 - lidT / 2, -D / 2);
  lid.position.z = D / 2;
  hinge.add(lid);
  hinge.userData.y0 = hinge.position.y;
  cut.add(hinge);

  // The cutaway (lid + middle fascia panel + its buttons) dissolves rather than
  // lifts: bay 2's shelf is only 50 mm above this lid, so no raised or hinged
  // lid can clear both the key light and the sightline into the box. Clone every
  // material first — the library ones are shared with the other stages.
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
  sled.castShadow = sled.receiveShadow = false;
  const sh = GEO.contactShadow(W * 1.45, D * 1.45, 0.40, 0);
  sh.position.set(0, -H / 2 - 0.0038, 0); g.add(sh);

  g.userData.cut = cut;
  g.userData.hinge = hinge;
  g.userData.oled = ol;
  g.userData.can = inner.userData.can;
  return g;
}

/* =========================================================================
   OVERLAY — one card, three regions, above and right of the chassis.
   Local origin = bottom-left of the content area.
   ========================================================================= */
const PW = 0.500, PH = 0.320;
const CARD_C = [0.300, 0.628, -2.950];         // world centre of the card
const P_OP = 1.0;      // fully opaque: at 0.93 the rack's specular highlights
                       // punch through in linear space and read as ghosts.

/* ribbon */
const RIB_X0 = 0.015, RIB_W = 0.470, RIB_H = 0.016, RIB_Y = 0.268;
const CELL_P = RIB_W / 32, CELL_W = CELL_P - 0.0026;
const HALF_P = CELL_P / 2, HALF_W = HALF_P - 0.0017;
const cellX = (i) => RIB_X0 + (i + 0.5) * CELL_P;
const halfX = (i) => RIB_X0 + (i + 0.5) * HALF_P;

/* the two plots */
const GW = 0.235, GH = 0.155, GY = 0.030;
const OGX = 0.015, EGX = 0.285, EGW = 0.200;

function buildOverlay(ctx, shot) {
  const ov = new THREE.Group();
  const S = { occAt: (b) => M.occAt(b) };

  const P = new THREE.Group();
  P.position.set(...CARD_C);
  // Face the card at the camera: a diagram read at an angle is a diagram
  // half-read, but a few degrees of toe-in keeps it in the room rather than
  // on the glass.
  P.rotation.y = Math.atan2(shot.position[0] - CARD_C[0], shot.position[2] - CARD_C[2]) * 0.94;
  ov.add(P);

  const C = new THREE.Group();
  C.position.set(-PW / 2, -PH / 2, 0);
  P.add(C);

  const card = DIAG.diagramCard(PW, PH, { opacity: P_OP, pad: 0.018 });
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
    poly(pb, [[RIB_X0, y + 0.005], [RIB_X0, y], [RIB_X0 + 4 * CELL_P - 0.0026, y],
      [RIB_X0 + 4 * CELL_P - 0.0026, y + 0.005]]);
    C.add(pb);
    const ab = new DIAG.Trace(4, PAL.cy, 1.1, { opacity: 0.55 });
    poly(ab, [[cellX(4) - CELL_W / 2, y + 0.005], [cellX(4) - CELL_W / 2, y],
      [cellX(27) + CELL_W / 2, y], [cellX(27) + CELL_W / 2, y + 0.005]]);
    C.add(ab);
  }

  /* ---------- region 2: arrivals and buffer occupancy -------------------- */
  const og = new DIAG.Graph({
    w: GW, h: GH, xRange: [-WIN, 0], yRange: [0, BUF_FULL],
    xTicks: [-0.36, -0.27, -0.18, -0.09, 0], yTicks: [0, 35, 70, 105, 140],
  });
  og.position.set(OGX, GY, 0.0006); C.add(og); S.og = og;
  const tgt = new DIAG.Trace(2, PAL.am, 1.2, { opacity: 0.6, dashed: true, dashSize: 0.007, gapSize: 0.006 });
  poly(tgt, [[0, og.y(BUF_TARGET), 0.0008], [GW, og.y(BUF_TARGET), 0.0008]]);
  og.add(tgt);
  og.addTrace((x) => S.occAt(-x), { color: PAL.cy, width: 2.0, n: 190 });

  // Arrival ticks share the plot's time axis, along the floor of the box: the
  // occupancy curve never comes below 55 % of full scale, so the space is free.
  S.pk = new DIAG.Swarm(96, {
    color: 0xffffff, additive: false, geometry: new THREE.PlaneGeometry(0.0017, 0.020),
  });
  S.pk.position.z = 0.0010;
  og.add(S.pk);
  S.tickY = 0.013;

  /* ---------- region 3: the clock edge ----------------------------------- */
  const eg = new DIAG.Graph({
    w: EGW, h: GH, xRange: [-500, 500], yRange: [-0.08, 1.12],
    xTicks: [-400, -200, 0, 200, 400], yTicks: [0, 0.5, 1], zeroLine: 0.5,
  });
  eg.position.set(EGX, GY, 0.0006); C.add(eg); S.eg = eg;
  const TE = 400 / (2 * Math.atanh(0.6));           // 20–80 % edge = 400 ps
  const edge = (x, sh) => 0.5 * (1 + Math.tanh((x - sh) / TE));
  const bandM = new THREE.Mesh(new THREE.PlaneGeometry(eg.x(50) - eg.x(-50), GH),
    new THREE.MeshBasicMaterial({ color: PAL.am, transparent: true, opacity: 0.15, depthWrite: false, toneMapped: false }));
  bandM.position.set(eg.x(0), GH / 2, -0.0003); bandM.renderOrder = 6; eg.add(bandM);
  for (const q of [-1.6, -0.7, 0.7, 1.6]) {
    eg.addTrace((x) => edge(x, q * (TJ * 1e12)), { color: PAL.am, width: 1.1, n: 70, opacity: 0.24 });
  }
  eg.addTrace((x) => edge(x, 0), { color: PAL.cy, width: 1.7, n: 90, dashed: true });
  S.edgeT = eg.addTrace((x) => edge(x, S.dt || 0), { color: PAL.am, width: 2.4, n: 90 });
  S.edgeDot = eg.addDot(PAL.am, 0.0042);

  /* ---------- divider ---------------------------------------------------- */
  const dv = new DIAG.Trace(2, 0x2c333c, 1.0, { opacity: 0.9 });
  poly(dv, [[0.267, GY - 0.010], [0.267, RIB_Y - 0.040]]); C.add(dv);

  /* ---------- callout: the real oscillator, in the box ------------------- */
  const canW = new THREE.Vector3();
  HW.userData.can.getWorldPosition(canW);
  const CO = [0.030, 0.192, -2.930];
  const lead = new DIAG.Trace(4, 0x5a6570, 1.1, { opacity: 0.55, dashed: true, dashSize: 0.007, gapSize: 0.006 });
  poly(lead, [[canW.x, canW.y, canW.z], [canW.x, canW.y, LAYOUT.rack.z + D / 2 + 0.010],
    [canW.x - 0.020, canW.y - 0.070, CO[2] + 0.020], [CO[0] + 0.030, CO[1] + 0.012, CO[2]]]);
  ov.add(lead);
  S.coAnchor = anchor(ov, CO[0], CO[1], CO[2]);

  /* ============ labels =============================================== */
  const L = ctx.labels;
  S.lab = {};
  S.lab.word = L.add(anchor(C, RIB_X0 + RIB_W / 2, RIB_Y + 0.032), {
    kicker: `AES3 SUBFRAME · CELLS AT 1 : ${CELL_RATIO.toLocaleString('en-GB')}`,
    text: 'preamble, then 24 audio bits LSB first&nbsp;·&nbsp;',
    value: '0x000000', cls: 'acc', occlude: false, priority: 2, offset: [0, -6],
  });
  S.lab.buf = L.add(anchor(C, OGX + GW / 2, GY + GH + 0.030), {
    kicker: `BUFFER · 0–${BUF_FULL} MS · ${(WIN * 1000).toFixed(0)} MS WINDOW`,
    text: 'arrivals below&nbsp;·&nbsp;drained by the local clock&nbsp;·&nbsp;',
    value: '120 ms', cls: 'acc', occlude: false, priority: 3, offset: [0, -4],
  });
  S.lab.edge = L.add(anchor(C, EGX + EGW / 2, GY + GH + 0.030), {
    kicker: `CLOCK EDGE · ±500 PS · ${(TJ * 1e12).toFixed(0)} PS RMS`,
    text: 'peak error, full-scale 10 kHz sine&nbsp;·&nbsp;',
    value: 'Δt = +0 ps', cls: 'am', occlude: false, priority: 3, offset: [0, -4],
  });
  S.lab.ocxo = L.add(S.coAnchor, {
    kicker: `OCXO · ${(MCLK / 1e6).toFixed(4)} MHz = 128 f_s`,
    text: 'the whole jitter budget is&nbsp;·&nbsp;',
    value: `${(TJ_24 * 1e12).toFixed(2)} ps rms`, cls: 'acc', occlude: false, offset: [0, 16],
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
const SHOT = frameShot([0.145, 0.508, -3.030], 0.2775,
  { fill: 0.60, az: -0.20, el: 0.105, fov: 30 });
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
    const cIdx = t * CELL_PER_SIM_S;
    const ci = Math.floor(cIdx);
    const sf = subframeAt(Math.floor(ci / 32));
    const cur = ((ci % 32) + 32) % 32;

    S.pre.update((i) => {
      const hi = sf.pre[i];
      const isNow = cur < 4 && (i >> 1) === cur;
      return { p: [halfX(i), RIB_Y, 0.0008], s: 1, c: isNow ? C_NOW : (hi ? C_PRE : C_AUXD) };
    });
    S.dat.update((i) => {
      const idx = i + 4, b = sf.bits[idx];
      let col;
      if (idx === cur) col = C_NOW;
      else if (idx > cur) col = idx < 28 ? 0x0d1a23 : 0x12161a;
      else if (idx < 28) col = b ? C_LIT : C_DIM;
      else col = b ? C_AUX : C_AUXD;
      return { p: [cellX(idx), RIB_Y, 0.0008], s: 1, c: col };
    });
    S.lab.word.setValue('0x' + sf.val.toString(16).toUpperCase().padStart(6, '0'));

    /* ---- packet layer -------------------------------------------------- */
    const g = S.og, ph = S.pk;
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
    S.lab.buf.setValue(`${M.occ.toFixed(0)} ms`);

    /* ---- jitter -------------------------------------------------------- */
    S.jAcc = (S.jAcc || 0) + dt;
    if (S.jAcc > 0.006) {
      S.jAcc = 0;
      const u1 = Math.random() || 1e-9, u2 = Math.random();
      S.dt = DSP.clamp(Math.sqrt(-2 * Math.log(u1)) * Math.cos(DSP.TAU * u2) * (TJ * 1e12), -190, 190);
      const err = DSP.TAU * JF * Math.max(1e-3, Math.abs(S.dt)) * 1e-12;
      S.lab.edge.setValue(
        `Δt = ${S.dt >= 0 ? '+' : '−'}${Math.abs(S.dt).toFixed(0)} ps → ${DSP.dB(err).toFixed(1)} dBFS`);
    }
    S.eg._fill(S.edgeT);
    S.edgeDot.userData.setData(S.dt || 0, 0.5);

    /* ---- front-panel display ------------------------------------------ */
    S.oAcc = (S.oAcc || 0) + dt;
    if (S.oAcc > 0.004) { S.oAcc = 0; HW.userData.oled.draw(M.occ); }
  },

  content() {
    return `
<div class="key"><span class="lab">The idea</span><p>A file is a sequence with no time in it. The streamer hands the converter a sequence <em>and</em> a clock. Only the sequence came over the network; the clock is made here, in an oven, at 5.6448 MHz.</p></div>

<h3>What arrives</h3>
<p>Two channels of 24-bit samples at 44.1 kHz is a fixed number of bits per second and nothing else. A segment carries whole frames only, so the packet rate follows from the frame count.</p>
<div class="eq">2 × 24 bit × 44 100 s⁻¹ = 2.1168 Mbit/s
                        = 264.6 kB/s
<span class="c">1460 B segment / 6 B frame = 243.3, so</span>
243 whole frames = <span class="hl">1458 B</span> = 5.5102 ms
264 600 / 1458 = <span class="hl">181.5 packet/s</span></div>
<p>They do not arrive every 5.51 ms. They arrive in clumps and late, and one in 380 has to be sent again. TCP repairs all of that: the bits are guaranteed, in order, eventually. <b>When</b> is the one thing it cannot supply.</p>
<p>The buffer absorbs that arrival variance, not a rate error. The player is the master and asks for data as its own oscillator consumes it, so there is no second clock to drift against — which is why an AES3 or S/PDIF <em>input</em>, where the source sets the rate, needs a phase-locked loop or asynchronous rate conversion instead.</p>

<h3>What leaves</h3>
<p>An AES3 frame is 64 bits: two subframes of preamble, 24 audio bits LSB first, then validity, user, channel-status and parity. The bit clock is 64 f<sub>s</sub> = <span class="num">2.8224 MHz</span>. Biphase-mark coding puts two half-cells in every bit, so the line's channel rate is 128 f<sub>s</sub> = <span class="num">5.6448 MHz</span> — the oscillator frequency itself. The preamble breaks the biphase rule deliberately: three identical half-cells in a row cannot occur in coded data, and that violation is the frame marker.</p>

<h3>Why the clock is the hard part</h3>
<p>A sample converted Δt early on a tone of frequency f is wrong by A·2πf·Δt. For <em>random</em> Δt of rms t<sub>j</sub> that becomes a noise floor:</p>
<div class="eq">SNR = −20 log₁₀(2π f t_j)
    = −20 log₁₀(2π · 10 kHz · 50 ps)
    = <span class="hl">110.1 dB</span>
<span class="c">full-scale sine, noise over 0–f_s/2 =</span>
<span class="c">${(FS / 2000).toFixed(2)} kHz; in a 20 kHz band, ${SNR_20K.toFixed(1)} dB</span>
<span class="c">24-bit floor 6.02 × 24 + 1.76 = 146.3 dB</span>
<span class="c">50 ps sits 36.2 dB above that floor;</span>
<span class="c">reaching it needs 0.77 ps rms.</span></div>
<p>The eye on the card shows single edges, so its figure is a <em>peak</em> error, not that rms floor. Periodic jitter does something else again: discrete sidebands either side of every tone, spaced by the jitter frequency.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>That "bit-perfect" settles the question. It settles the numbers. What comes out is those numbers multiplied by the instants at which they are converted — and only the numbers came over the network.</p></div>`;
  },

  readouts() {
    const rate = M.recent(WIN) / WIN;
    return [
      { k: 'PAYLOAD', v: (PAYLOAD_BPS / 1e6).toFixed(4), u: 'Mbit/s', cls: 'acc' },
      { k: 'BIT CLOCK', v: (BCLK / 1e6).toFixed(4), u: 'MHz', cls: 'acc' },
      { k: 'BUFFER', v: M.occ.toFixed(0), u: 'ms', bar: M.occ / BUF_FULL },
      { k: 'ARRIVAL 0.36 s', v: rate.toFixed(0), u: 'pkt/s' },
      { k: 'JITTER', v: (TJ * 1e12).toFixed(0), u: 'ps rms', cls: 'am' },
      { k: 'SNR 10 kHz', v: SNR_TJ.toFixed(1), u: 'dB, 0–f_s/2', cls: 'am' },
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
