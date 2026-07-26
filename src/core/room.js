import * as THREE from 'three';
import { mats } from './materials.js';
import { bevelBox, bevelCyl, contactShadow, shadowed } from './geo.js';
import { LAYOUT } from './layout.js';
import { blobShadow } from './tex.js';

/**
 * The set: floor, seamless backdrop, equipment rack, amp stands, plinth, and
 * the practical lights. The environment map does the heavy lifting for
 * reflections; these lights exist for shadows and directional shaping.
 */

/**
 * Cove radius. The sweep must begin *behind* everything that stands on the
 * floor (rack rear −3.55, subwoofer rear ≈ −3.53), or the lower 300–400 mm of
 * the equipment is geometrically buried in the rising backdrop.
 * Sweep starts at `LAYOUT.room.wallZ + COVE_R` = −3.65.
 */
export const COVE_R = 1.75;

/** Height of the visible ground at a given z — flat floor, then the cove. */
export function groundY(z) {
  const z0 = LAYOUT.room.wallZ + COVE_R;
  if (z >= z0) return 0;
  const s = Math.min(1, (z0 - z) / COVE_R);
  return COVE_R * (1 - Math.cos(Math.asin(s)));
}

function seamlessBackdrop() {
  // Cyclorama: the floor sweeps up into the back wall with no horizon line —
  // the classic infinity-cove used for product photography. Profile is defined
  // explicitly in (z, y); the surface is then extruded across X.
  const W = 22, H = 7.0, R = COVE_R, wallZ = LAYOUT.room.wallZ;
  const prof = [];
  prof.push([wallZ + R + 5.0, 0]);                 // flat floor coming forward
  const N = 26;
  for (let i = 0; i <= N; i++) {                   // quarter-round cove
    const a = (Math.PI / 2) * (i / N);
    prof.push([wallZ + R - Math.sin(a) * R, R - Math.cos(a) * R]);
  }
  prof.push([wallZ, H]);                           // straight wall up

  const v = [], idx = [], uv = [], n = prof.length;
  for (let i = 0; i < n; i++) {
    const [z, y] = prof[i];
    v.push(-W / 2, y, z, W / 2, y, z);
    uv.push(0, i / (n - 1), 1, i / (n - 1));
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: cycGradient(), metalness: 0, roughness: 0.90,
    envMapIntensity: 0.7, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.y = -0.0015;              // sit a hair under the polished floor
  m.receiveShadow = true;
  return m;
}

/**
 * The lit sweep. v runs 0 at the front of the floor to 1 at the top of the
 * wall; the pool sits just behind the equipment and falls away above and in
 * front, with a gentle horizontal vignette so the sweep has a centre.
 */
function cycGradient(w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    // pool centred at v = 0.52 (just above the gear), asymmetric falloff
    const t = (v - 0.52) / (v < 0.52 ? 0.34 : 0.42);
    const pool = Math.exp(-t * t * 1.15);
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const side = 1 - 0.34 * u * u;                 // soft horizontal vignette
      const lum = 0.055 + 0.235 * pool * side;
      const i = (y * w + x) * 4;
      d[i] = (lum * 246) | 0;
      d[i + 1] = (lum * 250) | 0;
      d[i + 2] = (lum * 255) | 0;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function floor() {
  const g = new THREE.PlaneGeometry(30, 30, 1, 1);
  const m = new THREE.Mesh(g, mats().floor);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

/** Open-frame rack: four machined uprights, glass-and-alloy shelves. */
function rack() {
  const L = LAYOUT.rack;
  const g = new THREE.Group();
  g.position.set(L.x, 0, L.z);

  const postR = 0.017;
  const topY = L.topY;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = new THREE.Mesh(bevelCyl(postR, postR * 1.05, topY, 28, 0.0012), mats().aluTrim);
    p.position.set(sx * (L.w / 2 - postR * 1.4), topY / 2, sz * (L.d / 2 - postR * 1.4));
    p.castShadow = p.receiveShadow = true;
    g.add(p);
    // machined collar at each shelf junction
    for (const y of L.shelfY) {
      const c = new THREE.Mesh(bevelCyl(postR * 1.28, postR * 1.28, 0.010, 28, 0.0008), mats().steel);
      c.position.set(p.position.x, y - 0.011, p.position.z);
      g.add(c);
    }
    const foot = new THREE.Mesh(bevelCyl(postR * 1.5, postR * 0.9, 0.020, 28, 0.0012), mats().steel);
    foot.position.set(p.position.x, 0.010, p.position.z);
    foot.castShadow = true;
    g.add(foot);
  }

  const shelfGeo = bevelBox(L.w, 0.020, L.d, 0.0022, 3);
  for (const y of L.shelfY) {
    const s = new THREE.Mesh(shelfGeo, mats().anodBlack);
    s.position.y = y - 0.010;
    s.castShadow = s.receiveShadow = true;
    g.add(s);
    // thin alloy edge trim catches the strip light
    const trim = new THREE.Mesh(bevelBox(L.w + 0.004, 0.0035, 0.004, 0.0012, 2), mats().aluTrim);
    trim.position.set(0, y - 0.0035, L.d / 2 + 0.001);
    g.add(trim);
  }
  const top = new THREE.Mesh(bevelBox(L.w + 0.03, 0.024, L.d + 0.03, 0.003, 4), mats().anodBlack);
  top.position.y = topY - 0.012;
  top.castShadow = top.receiveShadow = true;
  g.add(top);

  const sh = contactShadow(L.w * 2.6, L.d * 2.6, 0.85);
  sh.position.set(0, 0.0014, 0);
  g.add(sh);
  return g;
}

/** Low isolation stand for a monoblock. */
function ampStand(x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const w = 0.40, d = 0.50, h = 0.105;
  const plate = new THREE.Mesh(bevelBox(w, 0.016, d, 0.002, 3), mats().anodBlack);
  plate.position.y = h - 0.008;
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = new THREE.Mesh(bevelCyl(0.013, 0.015, h - 0.016, 24, 0.001), mats().steel);
    p.position.set(sx * (w / 2 - 0.03), (h - 0.016) / 2, sz * (d / 2 - 0.035));
    p.castShadow = true;
    g.add(p);
  }
  const sh = contactShadow(w * 2.4, d * 2.4, 0.8);
  g.add(sh);
  return g;
}

/** Massive isolation plinth for the turntable. */
function ttPlinth() {
  const P = LAYOUT.ttPlinth;
  const g = new THREE.Group();
  g.position.set(P.x, 0, P.z);
  g.rotation.y = P.ry;
  const w = 0.66, d = 0.56, top = P.top;
  const slab = new THREE.Mesh(bevelBox(w, 0.045, d, 0.004, 4), mats().anodBlack);
  slab.position.y = top - 0.0225;
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);
  // a bright orange strip along the plinth edge was the loudest thing in three
  // separate frames; the veneer is right, the saturation was not
  const underMat = mats().wood.clone();
  underMat.color.setHex(0x6a5646);
  underMat.roughness = 0.52;
  underMat.envMapIntensity = 0.55;
  const under = new THREE.Mesh(bevelBox(w * 0.86, 0.020, d * 0.86, 0.003, 3), underMat);
  under.position.y = top - 0.055;
  under.castShadow = true;
  g.add(under);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = new THREE.Mesh(bevelCyl(0.019, 0.022, top - 0.066, 28, 0.0012), mats().anodBlack);
    p.position.set(sx * (w / 2 - 0.055), (top - 0.066) / 2, sz * (d / 2 - 0.055));
    p.castShadow = p.receiveShadow = true;
    g.add(p);
    const foot = new THREE.Mesh(bevelCyl(0.026, 0.014, 0.016, 28, 0.001), mats().steel);
    foot.position.set(p.position.x, 0.008, p.position.z);
    g.add(foot);
  }
  const sh = contactShadow(w * 2.3, d * 2.3, 0.82);
  g.add(sh);
  return g;
}

export function buildRoom(scene) {
  const g = new THREE.Group();
  g.name = 'room';
  g.add(floor());
  g.add(seamlessBackdrop());
  g.add(rack());
  g.add(ampStand(LAYOUT.monoL.x, LAYOUT.monoL.z, LAYOUT.monoL.ry));
  g.add(ampStand(LAYOUT.monoR.x, LAYOUT.monoR.z, LAYOUT.monoR.ry));
  g.add(ttPlinth());
  scene.add(g);

  // ---- practical lights -----------------------------------------------------
  const key = new THREE.DirectionalLight(0xfff1e0, 2.10);
  key.position.set(-4.6, 5.6, 3.2);
  key.target.position.set(0, 0.7, -2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 26;
  key.shadow.camera.left = -8.5;
  key.shadow.camera.right = 8.5;
  key.shadow.camera.top = 7.0;
  key.shadow.camera.bottom = -7.0;
  key.shadow.bias = -0.00042;
  key.shadow.normalBias = 0.014;
  key.shadow.radius = 2.2;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xbfd8f5, 1.25);
  rim.position.set(5.4, 4.2, -4.6);
  rim.target.position.set(0, 0.8, -2.0);
  scene.add(rim, rim.target);

  const fill = new THREE.DirectionalLight(0x9ab4d6, 0.26);
  fill.position.set(2.2, 1.4, 6.4);
  fill.target.position.set(0, 0.9, -2.4);
  scene.add(fill, fill.target);

  // Foreground wash: without this the floor between camera and system falls to
  // pure black and the frame loses its bottom third.
  const fore = new THREE.SpotLight(0xdCE6F2, 6, 14, Math.PI * 0.46, 0.99, 1.35);
  fore.position.set(1.4, 3.6, 5.6);
  fore.target.position.set(-0.2, 0.0, 0.4);
  fore.castShadow = false;
  scene.add(fore, fore.target);

  // A soft overhead pool that grazes the top surfaces and pools on the floor.
  const pool = new THREE.SpotLight(0xffe9cf, 9, 12, Math.PI * 0.34, 0.98, 1.6);
  pool.position.set(-0.6, 4.4, 0.9);
  pool.target.position.set(-0.15, 0.2, -2.6);
  pool.castShadow = false;
  scene.add(pool, pool.target);

  return { group: g, key, rim, fill, pool };
}

/** Large soft gradient pool on the floor — sells the "studio sweep" feel. */
export function floorPool(scene) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(13.0, 11.5),
    new THREE.MeshBasicMaterial({
      map: blobShadow(256, 1), color: 0x35485c, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(-0.1, 0.0016, -1.4);
  m.renderOrder = -2;
  scene.add(m);
  return m;
}
