import { writeFileSync } from 'node:fs';

const defs = [
  ['overview', 'The System', 'Overview', 'Twelve boxes, one job', null],
  ['power', 'Mains &amp; Conditioning', 'Mains', 'Where the energy actually comes from', { bay: 0, h: 0.115 }],
  ['streamer', 'Network to Bits', 'Streamer', 'A file is not a signal — yet', { bay: 1, h: 0.092 }],
  ['dac', 'Digital to Analogue', 'DAC', 'There is no staircase', { bay: 2, h: 0.092 }],
  ['turntable', 'Groove to Voltage', 'Turntable', 'A diamond reading a scratch', null],
  ['phono', 'RIAA Equalisation', 'Phono stage', 'Undoing what the cutting lathe did', { bay: 3, h: 0.078 }],
  ['preamp', 'Gain &amp; Control', 'Preamp', 'Voltage, attenuation, impedance', { bay: 4, h: 0.098 }],
  ['xover', 'Active Crossover', 'Crossover', 'Splitting the band before the amps', { bay: 5, h: 0.078 }],
  ['amp', 'Power Amplification', 'Monoblocks', 'A valve on the power supply', null],
  ['speaker', 'Motor &amp; Cabinet', 'Loudspeaker', 'Current in, force out', null],
  ['sub', 'Bass &amp; the Room', 'Subwoofers', 'Below 80 Hz the room is the instrument', null],
  ['air', 'Air, Room, Ear', 'Air &amp; ear', 'Pressure, at last', null],
];

for (const [id, title, nav, sf, hw] of defs) {
  const body = hw
    ? `    const L = LAYOUT.rack;
    const g = new THREE.Group();
    const h = ${hw.h};
    const box = ctx.GEO.chassis(L.w - 0.03, h, L.d - 0.06);
    box.position.set(L.x, LAYOUT.bayCentre(${hw.bay}, h), L.z);
    g.add(box);
    return { hardware: g };`
    : `    return {};`;
  const src = `import * as THREE from 'three';
import { LAYOUT } from '../core/layout.js';

// STUB — to be replaced.
export default {
  id: '${id}',
  title: '${title}',
  nav: '${nav}',
  kicker: '${nav}',
  standfirst: '${sf}',
  shot: { position: [1.95, 1.52, 3.55], target: [0, 0.78, -1.55], fov: 36 },
  timeScale: 1,
  build(ctx) {
${body}
  },
  update() {},
  content() { return '<p>Pending.</p>'; },
  readouts() { return []; },
};
`;
  writeFileSync(`src/stages/${id}.js`, src);
}
console.log('wrote', defs.length, 'stubs');
