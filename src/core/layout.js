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

/**
 * THE SAFE BOX.
 *
 * The chapter rail owns the left ~145 px and the explanation panel the right
 * ~460 px, so at 1600x1000 the clear stage is about x 160..1120, y 90..930 —
 * 960 x 840, i.e. 60 % of the width and 84 % of the height, centred at 0.40 of
 * the width. The Director applies a principal-point offset so the camera axis
 * already lands at that centre; what a stage still has to do is choose a
 * distance that makes the subject the right SIZE inside that box.
 */
export const SAFE = { wFrac: 0.60, hFrac: 0.84, cxFrac: 0.40 };

/**
 * Build a shot that frames a subject correctly.
 *
 *   frameShot([x,y,z], radius, { fill, az, el, fov })
 *
 * @param centre  world-space centre of the subject
 * @param radius  its bounding radius in metres
 * @param fill    fraction of the SAFE BOX HEIGHT the subject should occupy.
 *                0.55 is a hero; 0.35 leaves room for a diagram beside it.
 * @param az      azimuth in radians, 0 = straight on, +ve swings camera right
 * @param el      elevation in radians above the subject's centre
 * @param fov     vertical field of view in degrees. Use a long lens (28-34) for
 *                small objects so perspective does not distort them, and a
 *                wider one (38-45) only for the room.
 *
 * Derivation: at distance d the viewport half-height is d·tan(fov/2); the
 * subject must subtend `fill · hFrac` of the full viewport, so
 *     d = radius / (fill · hFrac · tan(fov/2))
 */
export function frameShot(centre, radius, opts = {}) {
  const { fill = 0.52, az = 0.42, el = 0.20, fov = 34 } = opts;
  const t = Array.isArray(centre) ? centre : [centre.x, centre.y, centre.z];
  const d = radius / Math.max(0.05, fill * SAFE.hFrac * Math.tan((fov * Math.PI) / 360));
  const ce = Math.cos(el);
  return {
    position: [
      t[0] + Math.sin(az) * ce * d,
      t[1] + Math.sin(el) * d,
      t[2] + Math.cos(az) * ce * d,
    ],
    target: [t[0], t[1], t[2]],
    fov,
  };
}

/** Camera keyframes. Stages may override, but should stay in this idiom. */
export const SHOTS = {
  hero: { position: [1.95, 1.52, 3.55], target: [0, 0.78, -1.55], fov: 36 },
  wide: { position: [0.0, 1.90, 5.15], target: [0, 0.80, -2.10], fov: 40 },
  frameShot,
};
