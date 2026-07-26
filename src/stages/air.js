import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';

// STUB — to be replaced.
export default {
  id: 'air',
  title: 'Air, Room, Ear',
  nav: 'Air &amp; ear',
  kicker: 'Air &amp; ear',
  standfirst: 'Pressure, at last',
  shot: { position: [1.95, 1.52, 3.55], target: [0, 0.78, -1.55], fov: 36 },
  timeScale: 1,
  build(ctx) {
    return {};
  },
  update() {},
  content() { return '<p>Pending.</p>'; },
  readouts() { return []; },
};
