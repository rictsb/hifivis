import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';

// STUB — to be replaced.
export default {
  id: 'dac',
  title: 'Digital to Analogue',
  nav: 'DAC',
  kicker: 'DAC',
  standfirst: 'There is no staircase',
  shot: { position: [1.95, 1.52, 3.55], target: [0, 0.78, -1.55], fov: 36 },
  timeScale: 1,
  build(ctx) {
    const L = LAYOUT.rack;
    const g = new THREE.Group();
    const h = 0.092;
    const box = ctx.GEO.chassis(L.w - 0.03, h, L.d - 0.06);
    box.position.set(L.x, LAYOUT.bayCentre(2, h), L.z);
    g.add(box);
    return { hardware: g };
  },
  update() {},
  content() { return '<p>Pending.</p>'; },
  readouts() { return []; },
};
