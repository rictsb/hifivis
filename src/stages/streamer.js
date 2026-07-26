import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';
import { mats, PAL } from '../core/materials.js';
import * as GEO from '../core/geo.js';
import * as DIAG from '../core/diagram.js';
import * as DSP from '../core/dsp.js';

/* =========================================================================
   NETWORK TO BITS — every constant below is derived, none is chosen.
   ========================================================================= */

const FS = 192000, NBITS = 24, NCH = 2;
const PAYLOAD_BPS = NCH * NBITS * FS;              // 9 216 000 bit/s
const PAYLOAD_B = PAYLOAD_BPS / 8;                 // 1 152 000 byte/s
const FRAME_B = (NCH * NBITS) / 8;                 // 6 byte per stereo frame
const MSS = 1460;                                  // 1500 MTU − 20 IPv4 − 20 TCP
const PKT_AUDIO = (MSS / FRAME_B) / FS;            // 1.2674 ms of music per packet
const PKT_RATE = PAYLOAD_B / MSS;                  // 789.04 packet/s
const WIRE_B = MSS + 40 + 14 + 4 + 8 + 12;         // 1538 B on the wire
const LINE_BPS = 1e9;                              // 1000BASE-T
const T_SER = (WIRE_B * 8) / LINE_BPS;             // 12.304 µs per frame on the wire

const BCLK = 64 * FS;                              // 12.288 MHz — AES3 frame is 64 bit
const TBIT = 1 / BCLK;                             // 81.38 ns
const MCLK = 128 * FS;                             // 24.576 MHz master oscillator

const VF = 0.66;                                   // velocity factor, 110 Ω pair
const V_FIELD = DSP.signalSpeed(VF);               // 1.979e8 m/s
const BIT_LEN_M = V_FIELD * TBIT;                  // 16.10 m — one bit, on the cable
const AES_VPP = 4.0, AES_Z = 110;                  // AES3 driver into 110 Ω
const AES_IPK = AES_VPP / 2 / AES_Z;               // 18.18 mA peak
const AWG24 = 0.2047;                              // mm² conductor
const V_DRIFT = DSP.driftVelocity(AES_IPK, AWG24); // 6.527e-6 m/s
const F_BMC = BCLK / 2;                            // 6.144 MHz BMC fundamental
const X_DRIFT = DSP.driftDisplacement(V_DRIFT, F_BMC); // 1.691e-13 m = 0.169 pm
const SPEED_RATIO = V_FIELD / V_DRIFT;             // 3.031e13
const CAR_DRAW_AMP = 0.0028;                       // metres on screen …
const CAR_EXAG = CAR_DRAW_AMP / X_DRIFT;           // … ×1.66e10

const TJ = 50e-12, JF = 1e4;
const SNR_TJ = DSP.jitterSnrDb(JF, TJ);            // 110.06 dB
const SNR_24 = DSP.quantSnrDb(NBITS);              // 146.26 dB
const TJ_24 = 1 / (DSP.TAU * JF * DSP.undB(SNR_24)); // 0.774 ps

/* Time. The packet layer runs at the stage timeScale; the bit layer is derived
   from t with its own multiplier, and the ratio is stated on screen. */
const TS = 0.02;                                   // 1 simulated s per 50 real s
const BITS_PER_REAL_S = 24;
const BIT_PER_SIM_S = BITS_PER_REAL_S / TS;        // 1200 bit per simulated second
const LAYER_RATIO = Math.round((BCLK / BITS_PER_REAL_S) * TS);   // 10 240

/* Receive buffer. 120 ms is a wired-LAN figure; Wi-Fi players use seconds. */
const BUF_TARGET = 120, BUF_FULL = 140;            // ms of audio
const RAIL_WIN = 0.040;                            // s of arrival history on the rail
const GRAPH_WIN = 0.200;                           // s of occupancy history

const TONE_F = 997, TONE_A = DSP.undB(-3), FULL24 = Math.pow(2, NBITS - 1) - 1;

const C_LIT = 0x5cc0f2, C_DIM = 0x18384a, C_AUX = 0x6b7783, C_AUXD = 0x1d2229;
const C_AM = 0xf0b35a;

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
/** Square wave sampled finely, emitting exact transition pairs (vertical edges). */
function stepPts(level, W, x0, yLo, yHi, S = 512) {
  const out = []; let prev = level(0);
  out.push([x0, prev ? yHi : yLo]);
  for (let s = 1; s <= S; s++) {
    const u = s / S, L = level(u);
    if (L !== prev) { const x = x0 + u * W; out.push([x, prev ? yHi : yLo], [x, L ? yHi : yLo]); prev = L; }
  }
  out.push([x0 + W, prev ? yHi : yLo]);
  return out;
}

/* ---------- real 24-bit sample words ------------------------------------ */
function code(n, quad) {
  const ph = DSP.TAU * TONE_F * n / FS + (quad ? Math.PI / 2 : 0);
  return Math.round(TONE_A * Math.sin(ph) * FULL24);
}
/** AES3 subframe: 4 preamble · 24 audio LSB-first · V U C P (even parity). */
function makeSubframe(n, quad) {
  const c = code(n, quad);
  const u = c < 0 ? c + 16777216 : c;
  const b = new Uint8Array(32);
  b[0] = 1; b[1] = 0; b[2] = 0; b[3] = 1;                 // preamble cells
  for (let i = 0; i < 24; i++) b[4 + i] = (u >> i) & 1;   // LSB first
  b[28] = 0; b[29] = 0; b[30] = 0;                        // V, U, C
  let p = 0; for (let i = 4; i < 31; i++) p ^= b[i];
  b[31] = p;                                              // even parity over 4..31
  return { bits: b, val: u };
}
/** Two-entry cache: a 16-cell window spans at most two subframes. */
const _sfC = [{ k: NaN, sf: null }, { k: NaN, sf: null }];
function subframeAt(k) {
  for (const e of _sfC) if (e.k === k && e.sf) return e.sf;
  const sf = makeSubframe(Math.floor(k / 2), ((k % 2) + 2) % 2 === 1);
  const e = _sfC[((k % 2) + 2) % 2]; e.k = k; e.sf = sf;
  return sf;
}
const bitAtCell = (cell) => subframeAt(Math.floor(cell / 32)).bits[((cell % 32) + 32) % 32];

/* =========================================================================
   HARDWARE
   ========================================================================= */
const H = 0.092, W = LAYOUT.rack.w - 0.03, D = LAYOUT.rack.d - 0.06;
/** Fascia is milled in three pieces; the middle one is the cutaway window. */
const CUT_X0 = 0.022, CUT_X1 = 0.186;
/** Clock island, in the band the cutaway can see. */
/* 0.052 m behind the fascia: the 34° key only reaches 0.046/tan34° = 0.068 m
   in through a 46 mm slot, so anything deeper than that sits in shadow. */
const OCXO_POS = [(CUT_X0 + CUT_X1) / 2, 0, 0.155];

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
    g.fillStyle = '#7fd2ff'; g.font = mono(48); g.fillText('192.0', 16, 58);
    g.font = mono(24, 500); g.fillStyle = '#4e93b6'; g.fillText('kHz', 152, 57);
    g.fillStyle = '#7fd2ff'; g.font = mono(48); g.fillText('24', 224, 58);
    g.font = mono(24, 500); g.fillStyle = '#4e93b6'; g.fillText('bit', 282, 57);
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
 * The clock island: U-shaped shield fence (open at the front so the key
 * reaches in), gold-plated OCXO can with its own lid and four pins, and the
 * reference-lock LED. Built twice — once at true size inside the chassis,
 * once magnified in the overlay, because a 26 mm can behind a 46 mm slot is
 * about 20 px on screen at rack framing.
 */
function clockIsland({ clone = false, base = false } = {}) {
  const g = new THREE.Group();
  const pick = (n) => (clone ? mats()[n].clone() : mats()[n]);
  const steel = pick('steel'), gold = pick('gold');
  if (base) {
    const m = pick('pcb');
    m.color.setHex(0x39434b);           // stop the tilted board blowing out under the key
    const b = new THREE.Mesh(GEO.bevelBox(0.098, 0.0016, 0.072, 0.0006, 2), m);
    b.position.y = -0.0008; g.add(b);
  }
  for (const [dx, dz, w, d] of [[0, -0.031, 0.086, 0.0022],
    [-0.043, 0, 0.0022, 0.062], [0.043, 0, 0.0022, 0.062]]) {
    const m = new THREE.Mesh(GEO.bevelBox(w, 0.010, d, 0.0005, 2), steel);
    m.position.set(dx, 0.005, dz); g.add(m);
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
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0009, 0.0018), pick('ledCyan'));
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

  // Clock island. It sits in the FRONT band of the board because that is the
  // only part a front cutaway can see: the shelf above is 50 mm over the lid,
  // so nothing inside is reachable from a downward sightline.
  const [CIX, , CIZ] = OCXO_POS;
  const isl = clockIsland();
  isl.position.set(CIX, y0 + 0.0008, CIZ);
  g.add(isl);

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

  const dw = 0.200, dh = 0.040;
  const bez = new THREE.Mesh(GEO.bevelBox(dw + 0.009, dh + 0.009, 0.003, 0.0008, 3), blk);
  bez.position.set(-0.086, 0.002, fz - 0.0012); g.add(bez);
  const ol = oled();
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh),
    new THREE.MeshBasicMaterial({ map: ol.tex, toneMapped: false }));
  disp.position.set(-0.086, 0.002, fz + 0.0009); g.add(disp);

  const kn = GEO.knob(0.0185, 0.013, { flutes: 64 });
  kn.rotation.x = Math.PI / 2; kn.position.set(0.222, 0.002, fz + 0.0055); g.add(kn);
  const kRing = new THREE.Mesh(new THREE.TorusGeometry(0.0206, 0.0009, 10, 44), mats().chrome);
  kRing.position.set(0.222, 0.002, fz + 0.0006); g.add(kRing);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(GEO.bevelCyl(0.0042, 0.0044, 0.0026, 24, 0.0004), mats().anodGrey);
    b.rotation.x = Math.PI / 2; b.position.set(0.062 + i * 0.021, -0.026, fz + 0.0012); cut.add(b);
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
  g.add(hinge);
  cut.add(hinge);
  g.remove(hinge);

  // The cutaway (lid + middle fascia panel + its buttons) dissolves rather than
  // lifts: bay 2's shelf is only 50 mm above this lid, so no raised or hinged
  // lid can clear both the 34° key and the sightline into the box. Clone every
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
  g.userData.ocxo = anchor(g, OCXO_POS[0], -H / 2 + 0.024, OCXO_POS[2]);
  return g;
}

/* =========================================================================
   OVERLAY — one instrument panel floating just above the component.
   Local origin = bottom-left; three columns of 0.284 m.
   ========================================================================= */
const PW = 0.900, PH = 0.630;
const PX = -0.450, PY = 0.560, PZ = -2.915;
const P_OP = 1.0;      // fully opaque: at 0.93 the rack's specular highlights
                       // punch through in linear space and read as ghosts.

function buildOverlay(ctx, hardware) {
  const ov = new THREE.Group();
  const S = { occAt: (b) => M.occAt(b) };

  const P = new THREE.Group();
  P.position.set(PX, PY, PZ);
  const card = DIAG.diagramCard(PW, PH, { opacity: P_OP, pad: 0.018 });
  // fadeTree captures a mesh's base opacity the first time it sees it — and the
  // card group's own setOpacity(0) runs first in the same traverse. Seed it.
  card.userData.plate.userData._baseOp = P_OP;
  P.add(card);
  ov.add(P);

  for (const x of [0.296, 0.604]) {
    const r = new DIAG.Trace(2, 0x2c333c, 1.0, { opacity: 0.9 });
    poly(r, [[x, 0.028], [x, PH - 0.028]]); P.add(r);
  }

  /* ============ COLUMN 0 — arrival and buffer ======================== */
  const RX0 = 0.018, RX1 = 0.236, RY = 0.552;
  const rail = new DIAG.Trace(2, 0x3c444f, 1.2, { opacity: 0.85 });
  poly(rail, [[RX0, RY], [RX1, RY]]); P.add(rail);
  const nowL = new DIAG.Trace(2, PAL.ink3, 1.3, { opacity: 0.9 });
  poly(nowL, [[RX1, RY - 0.020], [RX1, RY + 0.020]]); P.add(nowL);
  S.rail = { x0: RX0, x1: RX1, y: RY };

  const BX = 0.252, BX2 = 0.276, BY = 0.072, BY2 = 0.432;
  S.bar = { x: BX, x2: BX2, y: BY, y2: BY2 };
  const inlet = new DIAG.Trace(3, 0x3c444f, 1.2, { opacity: 0.7 });
  poly(inlet, [[RX1, RY], [(BX + BX2) / 2, RY], [(BX + BX2) / 2, BY2 + 0.007]]); P.add(inlet);

  const pk = new DIAG.Swarm(128, {
    color: 0xffffff, additive: false, geometry: new THREE.PlaneGeometry(0.0034, 0.018),
  });
  P.add(pk); S.pk = pk;

  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(BX2 - BX, BY2 - BY),
    new THREE.MeshBasicMaterial({ color: 0x121820, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  barBg.position.set((BX + BX2) / 2, (BY + BY2) / 2, 0.0002); barBg.renderOrder = 7; P.add(barBg);
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(BX2 - BX, 1),
    new THREE.MeshBasicMaterial({ color: PAL.cy, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }));
  barFill.renderOrder = 8; P.add(barFill); S.barFill = barFill;
  const yT = BY + (BY2 - BY) * (BUF_TARGET / BUF_FULL);
  const tgt = new DIAG.Trace(2, PAL.am, 1.3, { opacity: 0.9 });
  poly(tgt, [[BX - 0.006, yT], [BX2 + 0.006, yT]]); P.add(tgt);
  const barBox = new DIAG.Trace(5, 0x3c444f, 1.0, { opacity: 0.85 });
  poly(barBox, [[BX, BY], [BX2, BY], [BX2, BY2], [BX, BY2], [BX, BY]]); P.add(barBox);

  const og = new DIAG.Graph({
    w: 0.212, h: 0.360, xRange: [-GRAPH_WIN, 0], yRange: [0, BUF_FULL],
    xTicks: [-0.20, -0.15, -0.10, -0.05, 0], yTicks: [0, 35, 70, 105, 140],
  });
  og.position.set(0.018, 0.072, 0.0006); P.add(og); S.og = og;
  const tgt2 = new DIAG.Trace(2, PAL.am, 1.2, { opacity: 0.55, dashed: true, dashSize: 0.007, gapSize: 0.006 });
  poly(tgt2, [[0, og.y(BUF_TARGET), 0.0008], [0.212, og.y(BUF_TARGET), 0.0008]]);
  og.add(tgt2);
  og.addTrace((x) => S.occAt(-x), { color: PAL.cy, width: 2.1, n: 200 });

  /* ============ COLUMN 1 — the bitstream ============================= */
  const NC = 32, CP = 0.00875, CW = 0.0070, CH2 = 0.016, CX = 0.310, CY = 0.556;
  const cells = new DIAG.Swarm(NC, {
    color: 0xffffff, additive: false, geometry: new THREE.PlaneGeometry(CW, CH2),
  });
  P.add(cells); S.cells = cells;
  S.cellX = (i) => CX + CW / 2 + i * CP;
  S.cellY = CY;
  {
    const x0 = CX, x1 = CX + NC * CP - (CP - CW);
    const br = new DIAG.Trace(4, 0x4a535e, 1.0, { opacity: 0.75 });
    poly(br, [[x0, CY + 0.0105], [x0, CY + 0.0165], [x1, CY + 0.0165], [x1, CY + 0.0105]]);
    P.add(br);
    const ab = new DIAG.Trace(4, PAL.cy, 1.2, { opacity: 0.6 });
    poly(ab, [[CX + 4 * CP, CY - 0.0105], [CX + 4 * CP, CY - 0.0165],
      [CX + 28 * CP - (CP - CW), CY - 0.0165], [CX + 28 * CP - (CP - CW), CY - 0.0105]]);
    P.add(ab);
  }

  const WX = 0.310, WW = 0.280, NPER = 16;
  S.wx = WX; S.ww = WW; S.nper = NPER;
  S.clkY = 0.472; S.bmcY = 0.404; S.wAmp = 0.019;
  const clk = new DIAG.Trace(180, PAL.cy, 1.8, { opacity: 0.95 }); P.add(clk); S.clk = clk;
  const bmc = new DIAG.Trace(240, PAL.cy, 1.8, { opacity: 0.95 }); P.add(bmc); S.bmc = bmc;
  for (const y of [S.clkY, S.bmcY]) {
    const b = new DIAG.Trace(2, 0x333b45, 0.9, { opacity: 0.5 });
    poly(b, [[WX, y], [WX + WW, y]]); P.add(b);
  }

  const xd = 0.354, xr = 0.546, yA = 0.248, yB = 0.186, yS = 0.146;
  for (const cx of [0.332, 0.568]) {
    const w2 = 0.022, h2 = 0.034, cy = (yA + yB) / 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w2 * 2, h2 * 2),
      new THREE.MeshBasicMaterial({ color: 0x0d131a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    m.position.set(cx, cy, 0.0002); m.renderOrder = 7; P.add(m);
    const b = new DIAG.Trace(5, 0x4a535e, 1.0, { opacity: 0.9 });
    poly(b, [[cx - w2, cy - h2], [cx + w2, cy - h2], [cx + w2, cy + h2], [cx - w2, cy + h2], [cx - w2, cy - h2]]);
    P.add(b);
    // AES3 is transformer-coupled at both ends: 1 : 1, core between the windings
    for (const [wx, s] of [[cx - 0.0075, -1], [cx + 0.0075, 1]]) {
      const pts = [[wx, cy - 0.024]];
      for (let j = 0; j <= 24; j++) {
        const u = j / 24, a = ((u * 3) % 1) * Math.PI;
        pts.push([wx + s * 0.0052 * Math.sin(a), cy - 0.024 + 0.048 * u]);
      }
      const w = new DIAG.Trace(pts.length, PAL.cy, 1.4, { opacity: 0.55 });
      poly(w, pts); P.add(w);
    }
    for (const dx of [-0.0016, 0.0016]) {
      const core = new DIAG.Trace(2, 0x6b7783, 1.2, { opacity: 0.7 });
      poly(core, [[cx + dx, cy - 0.024], [cx + dx, cy + 0.024]]); P.add(core);
    }
  }
  const condA = new DIAG.Trace(2, C_LIT, 2.6, {}); poly(condA, [[xd, yA], [xr, yA]]); P.add(condA);
  const condB = new DIAG.Trace(2, C_LIT, 2.6, {}); poly(condB, [[xd, yB], [xr, yB]]); P.add(condB);
  S.condA = condA; S.condB = condB;
  {                                            // 110 Ω termination across the pair
    const pts = [[xr, yA]];
    for (let i = 0; i < 6; i++) pts.push([xr + (i % 2 ? -0.0055 : 0.0055), yA - 0.0074 - i * 0.0092]);
    pts.push([xr, yB]);
    const term = new DIAG.Trace(pts.length, PAL.ink3, 1.4, { opacity: 0.85 });
    poly(term, pts); P.add(term);
  }
  const shd = new DIAG.Trace(2, 0x555c66, 1.2, { opacity: 0.7, dashed: true, dashSize: 0.007, gapSize: 0.006 });
  poly(shd, [[xd, yS], [xr + 0.006, yS]]); P.add(shd);
  const gnd = new DIAG.Trace(8, 0x555c66, 1.2, { opacity: 0.75 });
  poly(gnd, [[xd, yS], [xd - 0.014, yS], [xd - 0.014, yS - 0.008], [xd - 0.023, yS - 0.008],
    [xd - 0.005, yS - 0.008], [xd - 0.019, yS - 0.013], [xd - 0.009, yS - 0.013], [xd - 0.016, yS - 0.018]]);
  P.add(gnd);

  const car = new DIAG.Swarm(10, { color: C_AM, size: 0.0027 });
  P.add(car); S.car = car;
  S.carBase = [];
  for (let i = 0; i < 5; i++) {
    const x = xd + 0.028 + i * ((xr - xd - 0.056) / 4);
    S.carBase.push([x, yA], [x, yB]);
  }
  S.carAmp = CAR_DRAW_AMP;

  /* ============ COLUMN 2 — jitter ==================================== */
  const eg = new DIAG.Graph({
    w: 0.252, h: 0.165, xRange: [-500, 500], yRange: [-0.08, 1.12],
    xTicks: [-400, -200, 0, 200, 400], yTicks: [0, 0.5, 1], zeroLine: 0.5,
  });
  eg.position.set(0.630, 0.400, 0.0006); P.add(eg); S.eg = eg;
  const TE = 400 / (2 * Math.atanh(0.6));           // 20–80 % edge = 400 ps
  const edge = (x, sh) => 0.5 * (1 + Math.tanh((x - sh) / TE));
  const bandM = new THREE.Mesh(new THREE.PlaneGeometry(eg.x(50) - eg.x(-50), 0.165),
    new THREE.MeshBasicMaterial({ color: PAL.am, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
  bandM.position.set(eg.x(0), 0.0825, -0.0003); bandM.renderOrder = 6; eg.add(bandM);
  for (const q of [-1.5, -0.67, 0.67, 1.5]) {
    eg.addTrace((x) => edge(x, q * 50), { color: PAL.am, width: 1.1, n: 80, opacity: 0.26 });
  }
  eg.addTrace((x) => edge(x, 0), { color: PAL.cy, width: 1.9, n: 110, dashed: true });
  S.edgeT = eg.addTrace((x) => edge(x, S.dt || 0), { color: PAL.am, width: 2.4, n: 110 });
  S.edgeDot = eg.addDot(PAL.am, 0.0042);

  const sg = new DIAG.Graph({
    w: 0.252, h: 0.190, xLog: true, xRange: [1e-13, 1e-8], yRange: [80, 170],
    xTicks: [1e-13, 1e-12, 1e-11, 1e-10, 1e-9, 1e-8], yTicks: [80, 100, 120, 140, 160],
  });
  sg.position.set(0.630, 0.100, 0.0006); P.add(sg); S.sg = sg;
  sg.addTrace((tj) => DSP.jitterSnrDb(1e3, tj), { color: PAL.cy, width: 1.3, n: 150, opacity: 0.32, dashed: true });
  sg.addTrace((tj) => DSP.jitterSnrDb(JF, tj), { color: PAL.cy, width: 2.2, n: 150 });
  sg.addTrace(() => SNR_24, { color: PAL.gr, width: 1.3, n: 40, dashed: true, opacity: 0.85 });
  sg.addMarker(TJ, { color: PAL.am, width: 1.2 });
  sg.addMarker(TJ_24, { color: PAL.gr, width: 1.2 });
  sg.addDot(PAL.am, 0.0046).userData.setData(TJ, SNR_TJ);
  sg.addDot(PAL.gr, 0.0040).userData.setData(TJ_24, SNR_24);

  /* ============ exploded clock island, magnified and labelled ======== */
  const MAG = 2.0, DX = 0.436, DY = 0.452, DZ = -2.865;
  const detail = clockIsland({ clone: true, base: true });
  detail.scale.setScalar(MAG);
  detail.position.set(DX, DY, DZ);
  detail.rotation.set(0.80, -0.30, 0);        // tip the board up to face the shot
  detail.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    // Several of these meshes share one cloned material. fadeTree records a
    // base opacity per MESH from the material it happens to see, so the second
    // sharer would latch the first one's already-faded value — seed it.
    o.userData._baseOp = o.material.opacity ?? 1;
  });
  ov.add(detail);
  S.detailCan = detail.userData.can;

  const yTop = LAYOUT.rack.shelfY[LAYOUT.bay.streamer] + H;
  const zF = LAYOUT.rack.z + D / 2;
  const yMid = LAYOUT.bayCentre(LAYOUT.bay.streamer, H);
  for (const [cx, ex] of [[CUT_X0, -0.098], [CUT_X1, 0.098]]) {   // cutaway → detail
    const t = new DIAG.Trace(2, 0x4a535e, 1.0, { opacity: 0.5, dashed: true, dashSize: 0.006, gapSize: 0.005 });
    poly(t, [[cx, yMid + 0.026, zF + 0.002], [DX + ex, DY - 0.052, DZ + 0.03]]);
    ov.add(t);
  }
  for (const sx of [-1, 1]) {                  // component → panel
    const t = new DIAG.Trace(3, 0x39414c, 1.0, { opacity: 0.42 });
    poly(t, [[sx * 0.252, yTop + 0.002, zF - 0.03],
      [sx * 0.330, PY - 0.052, (zF + PZ) / 2],
      [sx * 0.390, PY - 0.014, PZ]]);
    ov.add(t);
  }

  /* ============ labels =============================================== */
  const L = ctx.labels;
  S.lab = {};
  S.lab.ocxo = L.add(S.detailCan, {
    kicker: `OCXO · ${(MCLK / 1e6).toFixed(3)} MHz = 128 f_s`,
    text: `island ×${MAG}&nbsp;·&nbsp;`, value: `needs < ${(TJ_24 * 1e12).toFixed(2)} ps`,
    cls: 'acc', offset: [-26, 98],
  });
  S.lab.rail = L.add(anchor(P, 0.127, RY + 0.022), {
    kicker: 'ARRIVAL · 40 ms WINDOW', text: '789 packet/s, when the network allows', offset: [0, -13],
  });
  S.lab.buf = L.add(anchor(P, 0.127, BY - 0.002), {
    kicker: 'BUFFER · 0–140 ms · 200 ms WINDOW', text: 'drained by the local clock&nbsp;·&nbsp;',
    value: '120 ms', cls: 'acc', offset: [0, 21],
  });
  S.lab.word = L.add(anchor(P, 0.450, CY + 0.018), {
    kicker: 'AES3 SUBFRAME · 997 Hz, −3 dBFS', text: '24 audio bits, LSB first&nbsp;·&nbsp;',
    value: '0x000000', cls: 'acc', offset: [0, -13],
  });
  S.lab.clk = L.add(anchor(P, 0.450, 0.360), {
    kicker: 'BIT CLOCK 64 f_s = 12.288 MHz',
    text: `biphase-mark below · ${LAYER_RATIO.toLocaleString('en-GB')}× slower than packets`, offset: [0, 4],
  });
  // NB: kickers are uppercased by the stylesheet, and CSS maps µ → Μ and σ → Σ.
  // Keep both out of any kicker or the units read as milli- and as a sum.
  S.lab.field = L.add(anchor(P, 0.450, 0.292), {
    kicker: `FIELD : CARRIERS = ${(SPEED_RATIO / 1e13).toFixed(1)} × 10¹³`,
    text: `carrier motion drawn ×${(CAR_EXAG / 1e10).toFixed(1)} × 10¹⁰`,
    cls: 'am', offset: [0, 0],
  });
  S.lab.aes = L.add(anchor(P, 0.450, 0.132), {
    kicker: `AES/EBU 110 Ω · ONE BIT = ${BIT_LEN_M.toFixed(1)} METRES`,
    text: 'the return is the other conductor, not the shield', offset: [0, 22],
  });
  S.lab.edge = L.add(anchor(P, 0.756, 0.568), {
    kicker: 'CLOCK EDGE · ±500 ps · rms 50 ps', value: 'Δt = +0 ps', cls: 'am', offset: [0, -12],
  });
  S.lab.snr = L.add(anchor(P, 0.756, 0.098), {
    kicker: 'SNR vs t_j · 0.1 ps–10 ns · 80–170 dB',
    text: `24-bit floor needs ${(TJ_24 * 1e12).toFixed(2)} ps&nbsp;·&nbsp;`,
    value: `${SNR_TJ.toFixed(1)} dB`, cls: 'am', offset: [0, 21],
  });

  ov.userData.S = S;
  return ov;
}

/* =========================================================================
   NETWORK MODEL
   ========================================================================= */
function makeModel() {
  const rnd = mulberry32(20240719);
  const RING = 768, DTS = 0.0004;
  const ring = new Float32Array(RING).fill(BUF_TARGET);
  const m = {
    t: 0, occ: BUF_TARGET, nextT: 0, mode: 'flow', stallEnd: 0, backlog: 0,
    arrivals: [], held: [], ringHead: 0, ringAcc: 0, nStall: 0, nRetx: 0,
  };
  m.step = (dt) => {
    if (!(dt > 0)) return;
    m.t += dt;
    let guard = 0;
    while (m.nextT <= m.t && guard++ < 800) {
      if (m.mode === 'stall') {
        if (m.nextT >= m.stallEnd) m.mode = 'burst';
        else { m.nextT = m.stallEnd; continue; }
      }
      const kind = m.mode === 'burst' ? 2 : 0;
      if (rnd() < 1 / 380) {                        // lost → fast retransmit, 4.5 ms late
        m.held.push({ t: m.nextT + 0.0045, kind: 1 }); m.nRetx++;
      } else {
        m.arrivals.push({ t: m.nextT, kind });
        m.occ += PKT_AUDIO * 1000;
      }
      if (m.mode === 'burst') {
        m.backlog -= 1;
        if (m.backlog <= 0) { m.mode = 'flow'; m.nextT += 1 / PKT_RATE; }
        else m.nextT += T_SER;                      // switch drains its queue at line rate
      } else {
        m.nextT += 1 / PKT_RATE;
        if (rnd() < (1 / PKT_RATE) / 0.090) {       // a stall roughly every 90 ms
          const dur = 0.010 + rnd() * 0.032;        // 10–42 ms of queueing
          m.mode = 'stall'; m.stallEnd = m.nextT + dur;
          m.backlog = Math.max(1, Math.round(dur * PKT_RATE));
          m.nStall++;
        }
      }
    }
    for (let i = m.held.length - 1; i >= 0; i--) {
      if (m.held[i].t <= m.t) { m.arrivals.push(m.held[i]); m.occ += PKT_AUDIO * 1000; m.held.splice(i, 1); }
    }
    m.occ = Math.max(0, m.occ - dt * 1000);         // exactly 1000 ms of audio per second
    m.ringAcc += dt;
    let g2 = 0;
    while (m.ringAcc >= DTS && g2++ < 500) {
      m.ringAcc -= DTS;
      m.ringHead = (m.ringHead + 1) % RING;
      ring[m.ringHead] = m.occ;
    }
    const cut = m.t - RAIL_WIN;
    while (m.arrivals.length && m.arrivals[0].t < cut) m.arrivals.shift();
    if (m.arrivals.length > 400) m.arrivals.splice(0, m.arrivals.length - 400);
  };
  m.occAt = (back) => ring[(((m.ringHead - Math.round(back / DTS)) % RING) + RING) % RING];
  return m;
}

/* =========================================================================
   STAGE
   ========================================================================= */
const M = makeModel();
let S = null, HW = null;

export default {
  id: 'streamer',
  title: 'Network&nbsp;to Bits',
  nav: 'Streamer',
  kicker: 'STREAMER',
  standfirst: 'TCP guarantees the bits. Only a local oscillator can guarantee the instants.',
  shot: { position: [0.43, 1.17, -1.30], target: [0.19, 0.755, -2.92], fov: 34 },
  timeScale: TS,
  alwaysUpdate: false,

  build(ctx) {
    HW = buildHardware();
    const overlay = buildOverlay(ctx, HW);
    S = overlay.userData.S;
    // Run the network model through one full graph window so the occupancy
    // strip chart opens with real history rather than a flat pre-roll.
    for (let i = 0; i < 640; i++) M.step(GRAPH_WIN / 320);
    return { hardware: HW, overlay };
  },

  setReveal(k) {
    const cut = HW.userData.cut, hinge = HW.userData.hinge;
    hinge.position.y = hinge.userData.y0 + k * 0.026;
    hinge.rotation.x = -k * 0.050;
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

    /* ---- bit layer: derived from t with its own multiplier ------------ */
    const bIdx = t * BIT_PER_SIM_S;
    const bi = Math.floor(bIdx), bf = bIdx - bi;
    const kSub = Math.floor(bi / 32);
    const sf = subframeAt(kSub);
    const cur = ((bi % 32) + 32) % 32;
    const isAudio = (i) => i >= 4 && i < 28;

    S.cells.update((i) => {
      const b = sf.bits[i];
      let col;
      if (i === cur) col = 0xdff4ff;
      else if (i > cur) col = isAudio(i) ? 0x0e1c26 : 0x12161a;
      else if (isAudio(i)) col = b ? C_LIT : C_DIM;
      else col = b ? C_AUX : C_AUXD;
      return { p: [S.cellX(i), S.cellY, 0.0008], s: 1, c: col };
    });
    S.lab.word.setValue('0x' + sf.val.toString(16).toUpperCase().padStart(6, '0'));

    const NP = S.nper;
    poly(S.clk, stepPts((u) => ((((bf + u * NP) % 1) < 0.5) ? 1 : 0),
      S.ww, S.wx, S.clkY - S.wAmp, S.clkY + S.wAmp, 384));

    // biphase mark: a transition at every cell edge, plus mid-cell for a 1
    const c0 = bi - NP;
    let pol = ((c0 % 2) + 2) % 2;
    const marks = [];
    for (let k = 0; k < NP; k++) {
      const b = bitAtCell(c0 + k);
      marks.push({ pol, mid: b ? 1 : 0 });
      pol ^= 1; if (b) pol ^= 1;
    }
    const bmcLvl = (u) => {
      const p = bf + u * NP;
      const k = Math.min(NP - 1, Math.max(0, Math.floor(p)));
      const mk = marks[k];
      return (mk.mid && (p - k) >= 0.5) ? (mk.pol ^ 1) : mk.pol;
    };
    poly(S.bmc, stepPts(bmcLvl, S.ww, S.wx, S.bmcY - S.wAmp, S.bmcY + S.wAmp, 512));

    /* the whole 1.5 m lead is 0.09 of a bit long, so it flips as one */
    const polNow = bmcLvl(1 - 1e-6);
    S.condA.material.color.setHex(polNow ? C_LIT : 0x1d4c66);
    S.condB.material.color.setHex(polNow ? 0x1d4c66 : C_LIT);
    const drive = polNow ? 1 : -1;
    S.smooth = (S.smooth === undefined) ? drive : S.smooth + (drive - S.smooth) * Math.min(1, dt * 700);
    S.car.update((i) => {
      const [x, y] = S.carBase[i];
      const dir = (i % 2 === 0) ? 1 : -1;           // out on A, back on B
      return { p: [x + dir * S.smooth * S.carAmp, y, 0.001], s: 1, c: C_AM };
    });

    /* ---- packet layer ------------------------------------------------- */
    const R = S.rail, arr = M.arrivals;
    const n = Math.min(arr.length, S.pk.count), off = arr.length - n;
    S.pk.update((i) => {
      if (i >= n) return null;
      const a = arr[off + i];
      const age = (M.t - a.t) / RAIL_WIN;
      if (age < 0 || age > 1) return null;
      return {
        p: [R.x1 - age * (R.x1 - R.x0), R.y, 0.001], s: 1,
        c: a.kind === 1 ? C_AM : (a.kind === 2 ? 0x9ad9f7 : C_LIT),
      };
    });

    const occ = M.occ, B = S.bar;
    const hgt = Math.max(0.0004, (B.y2 - B.y) * Math.min(1, occ / BUF_FULL));
    S.barFill.scale.set(1, hgt, 1);
    S.barFill.position.set((B.x + B.x2) / 2, B.y + hgt / 2, 0.0004);
    S.og.refresh();
    S.lab.buf.setValue(`${occ.toFixed(0)} ms`);

    /* ---- jitter ------------------------------------------------------- */
    S.jAcc = (S.jAcc || 0) + dt;
    if (S.jAcc > 0.006) {
      S.jAcc = 0;
      const u1 = Math.random() || 1e-9, u2 = Math.random();
      S.dt = DSP.clamp(Math.sqrt(-2 * Math.log(u1)) * Math.cos(DSP.TAU * u2) * 50, -190, 190);
      const err = DSP.TAU * JF * Math.max(1e-3, Math.abs(S.dt)) * 1e-12;
      S.lab.edge.setValue(
        `Δt = ${S.dt >= 0 ? '+' : '−'}${Math.abs(S.dt).toFixed(0)} ps → ${DSP.dB(err).toFixed(1)} dBFS`);
    }
    S.eg._fill(S.edgeT);
    S.edgeDot.userData.setData(S.dt || 0, 0.5);

    /* ---- front-panel display ------------------------------------------ */
    S.oAcc = (S.oAcc || 0) + dt;
    if (S.oAcc > 0.004) { S.oAcc = 0; HW.userData.oled.draw(occ); }
  },

  content() {
    return `
<h3>What arrives</h3>
<p>Two channels of 24-bit samples at 192 kHz is a fixed number of bits per second, and nothing else.</p>
<div class="eq">2 × 24 bit × 192 000 s⁻¹ = <span class="hl">9.216 Mbit/s</span>
                         = 1.152 MB/s
<span class="c">in 1460-byte segments (1500 − 20 − 20):</span>
1 152 000 / 1460 = <span class="hl">789 packet/s</span>
<span class="c">each holding</span> (1460/6)/192 000 = 1.27 ms <span class="c">of music</span></div>
<p>They do not arrive every 1.27 ms. They arrive in clumps, late, out of order, sometimes twice. TCP repairs all of that: the bits are guaranteed, in order, eventually. <b>When</b> is the one thing it cannot supply.</p>

<h3>What leaves</h3>
<p>A local oscillator empties the buffer at exactly 1.152 MB/s. An AES3 frame is 64 bits — two subframes of 4 preamble, 24 audio LSB-first, then V U C P — so the bit clock is 64 × f<sub>s</sub> = <span class="num">12.288 MHz</span>.</p>
<p>One bit is <span class="num">16.1 m</span> of cable, so a 1.5 m lead holds a tenth of a bit and flips as a unit. The field moves at <span class="num">1.98 × 10⁸ m/s</span> (0.66 c); the carriers, at 18 mA peak in 24 AWG, drift at <span class="num">6.5 × 10⁻⁶ m/s</span> and on alternating current merely shuffle ±<span class="num">0.17 pm</span> about a fixed point — a ratio of <span class="num">3.0 × 10¹³</span>, so the overlay draws that shuffle <span class="num">1.7 × 10¹⁰</span> times life size. Current leaves on one conductor and returns on the other; the shield carries neither.</p>

<h3>Why the clock is the hard part</h3>
<p>A sample taken Δt early on a tone of frequency f is wrong by A·2πf·Δt. For <em>random</em> Δt of rms t<sub>j</sub>:</p>
<div class="eq">SNR = −20 log₁₀(2π f t_j)
    = −20 log₁₀(2π · 10 kHz · 50 ps)
    = −20 log₁₀(3.14 × 10⁻⁶) = <span class="hl">110.1 dB</span>
<span class="c">24-bit floor:</span> 6.02 × 24 + 1.76 = 146.3 dB
<span class="c">50 ps sits</span> 36.2 dB <span class="c">above that floor;</span>
<span class="c">reaching it needs</span> 0.77 ps <span class="c">rms.</span></div>
<p>That figure is for random jitter, which raises a noise floor. Periodic jitter instead puts discrete sidebands either side of every tone, spaced by the jitter frequency, at the same total level.</p>
<div class="myth"><span class="lab">Commonly got wrong</span><p>That "bit-perfect" settles the question. It settles the numbers. What comes out is those numbers multiplied by the instants at which they are converted — and only the numbers came over the network.</p></div>
<div class="key"><span class="lab">The idea</span><p>A file is a sequence with no time in it. The streamer's job is to hand the converter a sequence <em>and</em> a clock. One of those arrived over Ethernet. The other has to be made here, in an oven, at 24.576 MHz.</p></div>`;
  },

  readouts() {
    const rate = M.arrivals.length / RAIL_WIN;
    return [
      { k: 'PAYLOAD', v: (PAYLOAD_BPS / 1e6).toFixed(3), u: 'Mbit/s', cls: 'acc' },
      { k: 'BIT CLOCK', v: (BCLK / 1e6).toFixed(3), u: 'MHz', cls: 'acc' },
      { k: 'BUFFER', v: M.occ.toFixed(0), u: 'ms', bar: M.occ / BUF_FULL },
      { k: 'ARRIVAL', v: rate >= 1000 ? (rate / 1000).toFixed(1) + 'k' : rate.toFixed(0), u: 'pkt/s' },
      { k: 'JITTER', v: (TJ * 1e12).toFixed(0), u: 'ps rms', cls: 'am' },
      { k: 'SNR 10 kHz', v: SNR_TJ.toFixed(1), u: 'dB', cls: 'am' },
    ];
  },
};
