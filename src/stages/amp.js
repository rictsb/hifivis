import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';

// STUB — to be replaced.
export default {
  id: 'amp',
  title: 'Power Amplification',
  nav: 'Monoblocks',
  kicker: 'Monoblocks',
  standfirst: 'A valve on the power supply',
  shot: { position: [1.95, 1.52, 3.55], target: [0, 0.78, -1.55], fov: 36 },
  timeScale: 1,
  build(ctx) {
    return {};
  },
  update() {},
  content() { return '<p>Pending.</p>'; },
  readouts() { return []; },
};
