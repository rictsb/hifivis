/**
 * Single source of truth for where everything physically is.
 * Units: metres. +X right, +Y up, −Z away from the listener (toward the wall).
 * The listening seat is at +Z. Every stage MUST take its transform from here.
 */
export const LAYOUT = {
  room: { w: 7.4, d: 9.0, h: 3.1, wallZ: -5.40 },

  /** Equipment rack: 6 bays, shelf tops listed. */
  rack: {
    x: 0, z: -3.30, w: 0.585, d: 0.500,
    /** y of the top surface of each shelf, bottom-first */
    shelfY: [0.115, 0.290, 0.452, 0.614, 0.790, 0.966],
    topY: 1.128,
  },

  /** Which component lives in which bay (index into rack.shelfY). */
  bay: { power: 0, streamer: 1, dac: 2, phono: 3, preamp: 4, xover: 5 },

  monoL: { x: -0.95, y: 0.105, z: -3.02, ry: 0.10 },
  monoR: { x: 0.95, y: 0.105, z: -3.02, ry: -0.10 },

  speakerL: { x: -1.62, y: 0, z: -2.45, ry: 0.185 },
  speakerR: { x: 1.62, y: 0, z: -2.45, ry: -0.185 },

  subL: { x: -2.92, y: 0, z: -3.28, ry: 0.34 },
  subR: { x: 2.92, y: 0, z: -3.28, ry: -0.34 },

  /** Turntable sits on its own isolation plinth, well clear of the speakers. */
  ttPlinth: { x: -2.34, y: 0, z: -2.28, ry: 0.30, top: 0.735 },

  listener: { x: 0, y: 1.06, z: 2.10 },

  /** Height of a component's centre given a bay index and its own height. */
  bayCentre(idx, h) { return this.rack.shelfY[idx] + h / 2; },
};

/** Camera keyframes. Stages may override, but should stay in this idiom. */
export const SHOTS = {
  hero: { position: [1.95, 1.52, 3.55], target: [0, 0.78, -1.55], fov: 36 },
  wide: { position: [0.0, 1.90, 5.15], target: [0, 0.80, -2.10], fov: 40 },
};
