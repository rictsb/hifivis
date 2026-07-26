import * as DSP from './dsp.js';

/**
 * THE SYSTEM SPECIFICATION — one source of truth.
 *
 * A measurement editor caught this piece quoting the same hardware with
 * different primaries in different chapters: the voice coil was 6.2 Ω in two
 * stages and 5.4 Ω in two others, the loudspeaker was 91.4 dB in two and 89 dB
 * in a third, the cartridge was 285 µV here and 300 µV there, the phono stage
 * was 64 dB in its own chapter and 60 dB in the overview, and the mains draw
 * was computed from "two 600 W monoblocks" into 4 Ω while every other chapter
 * ran an 8 Ω load. A reader can catch you on that, and it is fatal to trust.
 *
 * EVERY STAGE MUST TAKE ITS PRIMARIES FROM HERE. Derive locally, never
 * re-declare. Where a figure is a design choice rather than a derivation, it is
 * marked CHOSEN and the choice is stated.
 */

// ---------------------------------------------------------------------------
// Mains
// ---------------------------------------------------------------------------
export const MAINS = {
  vRms: 230,                    // CHOSEN: European supply
  f: 50,                        // Hz
  get vPk() { return this.vRms * Math.SQRT2; },        // 325.27 V
  cableAreaMm2: 2.5,            // CHOSEN: 3-core 2.5 mm² flex
  cableLen: 2.0,                // m, wall to conditioner
  vf: 0.66,                     // velocity factor of PVC flex
  get vField() { return DSP.signalSpeed(this.vf); },   // 1.9786e8 m/s
};

// ---------------------------------------------------------------------------
// Loudspeaker — the anchor of the whole chain
// ---------------------------------------------------------------------------
export const DRIVER = {
  // Measured Thiele–Small primaries (CHOSEN as the design's starting point;
  // everything else in the loudspeaker chapter is derived from these).
  fs: 28.0,                     // Hz, free-air resonance
  Mms: 0.049,                   // kg, moving mass
  Re: 6.2,                      // Ω, voice-coil dc resistance
  Qms: 4.2,                     // mechanical Q
  Sd: 0.0346,                   // m², piston area (220 mm)
  Bl: 12.0,                     // T·m, force factor
  Xmax: 0.008,                  // m, linear one-way excursion
  Vb: 0.030,                    // m³? no — litres below; kept as m³ = 30 L
};
DRIVER.Vb = 0.030;              // m³ (30 L) sealed net volume

/** Everything the T/S primaries imply. Derived, never typed. */
export const TS = (() => {
  const { fs, Mms, Re, Qms, Sd, Bl } = DRIVER;
  const w = DSP.TAU * fs;
  const Cms = 1 / (w * w * Mms);                     // m/N
  const Qes = (w * Mms * Re) / (Bl * Bl);
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Vas = DSP.RHO_AIR * 343.2 * 343.2 * Sd * Sd * Cms;   // m³
  const al = Vas / DRIVER.Vb;
  const k = Math.sqrt(al + 1);
  const fc = fs * k;
  const Qtc = Qts * k;
  // Small's reference efficiency, half space:
  //   η0 = 4π²/c³ · fs³·Vas/Qes
  const eta0 = ((4 * Math.PI * Math.PI) / Math.pow(343.2, 3)) * (Math.pow(fs, 3) * Vas) / Qes;
  // TWO DIFFERENT SENSITIVITIES, and they are not interchangeable.
  //   spl1W   — one watt at one metre, half space: 112.0 + 10·log10(η0)
  //   spl283  — 2.83 V at one metre. 2.83 V is one watt into 8 Ω *by
  //             definition*, but this coil is Re = 6.2 Ω, so it actually draws
  //             2.83²/Re = 1.29 W and reads 1.11 dB higher. Quoting one figure
  //             with the other's reference is the classic sensitivity fiddle.
  const spl1W = 112.0 + 10 * Math.log10(eta0);
  const spl283 = spl1W + 10 * Math.log10((2.8284 * 2.8284) / Re);
  return { Cms, Qes, Qts, Vas, alpha: al, fc, Qtc, eta0, spl1W, spl283 };
})();

export const SPEAKER = {
  nominalZ: 8,                  // Ω, nominal load the amplifier sees
  /** dB SPL at 2.83 V / 1 m, half space — DERIVED from Small's efficiency.
   *  Use `sens1W` when you mean one watt; they differ by 1.11 dB here. */
  get sens() { return TS.spl283; },
  get sens1W() { return TS.spl1W; },
  height: 1.25,                 // m
};

// ---------------------------------------------------------------------------
// Amplifier
// ---------------------------------------------------------------------------
export const AMP = {
  /** CHOSEN rating. The doubling figure follows from the same voltage swing. */
  pOut8: 300,                   // W into 8 Ω
  get pOut4() { return this.pOut8 * 2; },             // 600 W into 4 Ω
  /** The load actually connected in this system is 8 Ω. Use pOut8 for anything
   *  that draws current from the wall — quoting the 4 Ω figure for mains draw
   *  while running an 8 Ω load is the error the editor caught. */
  get vRms() { return DSP.vrmsFor(this.pOut8, SPEAKER.nominalZ); },   // 48.99 V
  get vPk() { return this.vRms * Math.SQRT2; },                       // 69.28 V
  get iPk() { return this.vPk / SPEAKER.nominalZ; },                  // 8.66 A
  rail: 75,                     // V, ± supply. CHOSEN: vPk + ~5.7 V headroom
  zOut: 0.02,                   // Ω, output impedance
  gainDb: 26,                   // dB voltage gain
  effAB: 0.55,                  // CHOSEN: representative class-AB wall-plug efficiency
};

// ---------------------------------------------------------------------------
// Speaker cable — 3 m of 2.5 mm² copper, there AND back
// ---------------------------------------------------------------------------
export const CABLE = {
  len: 3.0,                     // m one way
  areaMm2: 2.5,
  rhoCu: 1.724e-8,              // Ω·m at 20 °C
  /** Round-trip resistance: current goes out and must come back. */
  get rLoop() { return (2 * this.len * this.rhoCu) / (this.areaMm2 * 1e-6); }, // 0.0414 Ω
};

/** Damping factor at the amplifier terminals, and at the driver. */
export const DAMPING = {
  get atTerminals() { return DSP.dampingFactor(SPEAKER.nominalZ, AMP.zOut); },
  get atDriver() { return DSP.dampingFactor(SPEAKER.nominalZ, AMP.zOut + CABLE.rLoop); },
};

// ---------------------------------------------------------------------------
// Vinyl front end
// ---------------------------------------------------------------------------
export const CART = {
  type: 'moving coil',
  /** CHOSEN reference modulation velocity for a quoted output. */
  vRef: 0.05,                   // m/s peak (5 cm/s)
  Bl: 0.00805,                  // T·m, tiny coil in a tiny gap
  /** Output at vRef. DERIVED: e = Bl·v, quoted rms for a sinusoid. */
  get outPk() { return DSP.backEmf(this.Bl, this.vRef); },
  get outRms() { return this.outPk / Math.SQRT2; },   // ≈ 2.85e-4 V = 0.285 mV
  loadOhm: 100,
  srcOhm: 10,                   // CHOSEN: coil dc resistance of a low-output MC
  vtfN: 0.0196,                 // 2.0 g vertical tracking force, in newtons
  /**
   * Loading loss. The cartridge is a source with `srcOhm` driving `loadOhm`, so
   * the phono input never sees the open-circuit voltage:
   *     loss = 20·log10(loadOhm / (srcOhm + loadOhm)) = −0.83 dB
   * This row was in the phono chapter's ladder but not in CHAIN's solve, so the
   * phono and preamp chapters disagreed by exactly that 0.83 dB.
   */
  get loadLossDb() { return DSP.dB(this.loadOhm / (this.srcOhm + this.loadOhm)); },
  /** Voltage actually presented to the phono input. */
  get atInputRms() { return this.outRms * DSP.undB(this.loadLossDb); },
};

/** Tonearm wiring. One gauge, quoted once. */
export const TONEARM = { litzMm2: 0.030, lenM: 1.2 };

export const TT = {
  rpm: 100 / 3,                 // 33⅓
  get omega() { return (this.rpm * DSP.TAU) / 60; },  // 3.4907 rad/s
  rOuter: 0.146,                // m, first groove
  rInner: 0.060,                // m, last groove
  get vOuter() { return this.omega * this.rOuter; },  // 0.5096 m/s
  get vInner() { return this.omega * this.rInner; },  // 0.2094 m/s
  armEff: 0.239,                // m, effective length
};

export const PHONO = { gainDb: 64 };      // dB at 1 kHz. CHOSEN.

// ---------------------------------------------------------------------------
// Line stage, crossover, digital
// ---------------------------------------------------------------------------
export const PREAMP = { gainDb: 10, zOut: 50 };
export const XOVER = { fLow: 80, fHigh: 2200, order: 4 };
export const DIGITAL = { fs: 192000, bits: 24, fsCd: 44100, bitsCd: 16, osr: 64, dsOrder: 2 };

// ---------------------------------------------------------------------------
// Room and seat
// ---------------------------------------------------------------------------
/** Axis names match LAYOUT.room exactly: W across, D away from the listener,
 *  H floor to ceiling. (These were L/W/D-swapped against LAYOUT and two stages
 *  read them as different axes.) */
export const ROOM = { W: 7.4, D: 9.0, H: 3.1, rt60: 0.42 };

/**
 * The chain, end to end. Every stage that quotes a gain must take it from here
 * so the ladder always adds up.
 *
 * The volume setting is DERIVED as the residual that lands 2.83 V (= 1.000 W
 * into 8 Ω) at the terminals from the cartridge's own output.
 */
export const CHAIN = (() => {
  const vCart = CART.outRms;
  const vTerm = Math.sqrt(1.0 * SPEAKER.nominalZ);          // 2.8284 V rms = 1 W
  const loadDb = CART.loadLossDb;                              // −0.83 dB
  const total = DSP.dB(vTerm / vCart);                         // cartridge → posts
  // The ladder must account for the loading loss, or the chapter that shows it
  // and the chapter that does not will disagree by 0.83 dB.
  const vol = total - loadDb - PHONO.gainDb - PREAMP.gainDb - AMP.gainDb;
  return { vCart, vTerm, totalDb: total, loadLossDb: loadDb, volumeDb: vol };
})();
