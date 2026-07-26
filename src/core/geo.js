import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mats } from './materials.js';
import { blobShadow } from './tex.js';

/**
 * Geometry helpers.
 *
 * RULE: no razor edges anywhere. Real machined metal has a 0.3–1 mm break on
 * every edge, and that thin bright line is most of what tells the eye "this is
 * a solid object photographed with a big soft light". Use `chassis()` and
 * `bevelBox()` instead of BoxGeometry for anything the camera gets near.
 */

const _v = new THREE.Vector3();

/** Rounded box in metres. `r` defaults to a 1.5 mm edge break. */
export function bevelBox(w, h, d, r = 0.0015, seg = 3) {
  const rr = Math.min(r, w / 2.05, h / 2.05, d / 2.05);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/** A component chassis: bevelled box + optional separate fascia material. */
export function chassis(w, h, d, opts = {}) {
  const {
    r = 0.0022, seg = 4, body = mats().anodBlack, face = mats().alu,
    faceThick = 0.010, faceInset = 0.0,
  } = opts;
  const g = new THREE.Group();
  const shell = new THREE.Mesh(bevelBox(w, h, d - faceThick, r, seg), body);
  shell.position.z = -faceThick / 2;
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);
  if (faceThick > 0) {
    const f = new THREE.Mesh(bevelBox(w - faceInset * 2, h - faceInset * 2, faceThick, Math.min(r * 1.6, faceThick / 2.2), seg), face);
    f.position.z = (d - faceThick) / 2;
    f.castShadow = f.receiveShadow = true;
    g.add(f);
    g.userData.face = f;
  }
  g.userData.shell = shell;
  g.userData.size = new THREE.Vector3(w, h, d);
  return g;
}

/** Cylinder with broken edges — knobs, feet, capacitor cans, posts. */
export function bevelCyl(rTop, rBot, h, radial = 48, bevel = 0.0008) {
  const b = Math.min(bevel, h / 4, rTop / 3 || bevel, rBot / 3 || bevel);
  const pts = [];
  pts.push(new THREE.Vector2(0, -h / 2));
  pts.push(new THREE.Vector2(rBot - b, -h / 2));
  pts.push(new THREE.Vector2(rBot, -h / 2 + b));
  pts.push(new THREE.Vector2(rTop, h / 2 - b));
  pts.push(new THREE.Vector2(rTop - b, h / 2));
  pts.push(new THREE.Vector2(0, h / 2));
  const g = new THREE.LatheGeometry(pts, radial);
  g.computeVertexNormals();
  return g;
}

/** Knurled control knob: bevelled cylinder + fine radial flutes + dial mark. */
export function knob(r = 0.016, h = 0.014, opts = {}) {
  const { flutes = 56, body = mats().alu, mark = mats().chrome, dial = true } = opts;
  const g = new THREE.Group();
  const k = new THREE.Mesh(bevelCyl(r * 0.97, r, h, 64, 0.0009), body);
  k.castShadow = true;
  g.add(k);
  // knurl ring
  const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0007, h * 0.72, 0.0016), body, flutes);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < flutes; i++) {
    const a = (i / flutes) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(_v.set(Math.sin(a) * r * 0.995, 0, Math.cos(a) * r * 0.995), q, s);
    fl.setMatrixAt(i, m);
  }
  fl.castShadow = true;
  g.add(fl);
  if (dial) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.0011, 0.0008, r * 0.62), mark);
    d.position.set(0, h / 2 - 0.0002, r * 0.34);
    g.add(d);
  }
  g.userData.knurl = fl;
  return g;
}

/** Extruded heatsink fin stack. Real amps live or die by this silhouette. */
export function heatsink(w, h, d, fins = 22, opts = {}) {
  const { mat = mats().anodBlack, baseT = 0.006, finT = 0.0022 } = opts;
  const g = new THREE.Group();
  const base = new THREE.Mesh(bevelBox(w, h, baseT, 0.0008), mat);
  base.position.z = -d / 2 + baseT / 2;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  const finGeo = bevelBox(finT, h, d - baseT, 0.0006, 2);
  const im = new THREE.InstancedMesh(finGeo, mat, fins);
  const m = new THREE.Matrix4();
  const pitch = w / fins;
  for (let i = 0; i < fins; i++) {
    m.makeTranslation(-w / 2 + pitch * (i + 0.5), 0, baseT / 2);
    im.setMatrixAt(i, m);
  }
  im.castShadow = im.receiveShadow = true;
  g.add(im);
  return g;
}

/** Countersunk hex-socket screw head, ~M3. Sells scale like nothing else. */
export function screw(r = 0.0016, opts = {}) {
  const { mat = mats().steel } = opts;
  const g = new THREE.Group();
  const head = new THREE.Mesh(bevelCyl(r, r * 1.02, 0.0011, 24, 0.00025), mat);
  g.add(head);
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, 0.0009, 6), mats().plastic);
  hex.position.y = 0.00025;
  g.add(hex);
  g.rotation.x = Math.PI / 2; // default: facing +Z (a front panel)
  return g;
}

/** Scatter screws at given local XY positions on a face at z. */
export function screwRow(parent, pts, z, r = 0.0016) {
  for (const [x, y] of pts) {
    const s = screw(r);
    s.position.set(x, y, z);
    parent.add(s);
  }
}

/** Binding post (WBT-style): knurled collar, gold barrel, insulator. */
export function bindingPost(opts = {}) {
  const { colour = 0xd94b3a } = opts;
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(bevelCyl(0.0055, 0.0062, 0.020, 32, 0.0006), mats().gold);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.010;
  g.add(barrel);
  const collar = new THREE.Mesh(bevelCyl(0.0082, 0.0082, 0.008, 40, 0.0006),
    new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }));
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.0125;
  g.add(collar);
  const base = new THREE.Mesh(bevelCyl(0.0068, 0.0075, 0.004, 32, 0.0005), mats().plastic);
  base.rotation.x = Math.PI / 2;
  base.position.z = 0.002;
  g.add(base);
  return g;
}

/** RCA jack. */
export function rcaJack(colour = 0xd94b3a) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(bevelCyl(0.0038, 0.0042, 0.012, 28, 0.0004), mats().gold);
  shell.rotation.x = Math.PI / 2; shell.position.z = 0.006;
  g.add(shell);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0052, 0.0011, 10, 32),
    new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0, roughness: 0.4, clearcoat: 1 }));
  g.add(ring);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.010, 12), mats().gold);
  pin.rotation.x = Math.PI / 2; pin.position.z = 0.006;
  g.add(pin);
  return g;
}

/** XLR connector (3-pin male). */
export function xlr() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bevelCyl(0.0105, 0.0112, 0.013, 36, 0.0006), mats().anodGrey);
  body.rotation.x = Math.PI / 2; body.position.z = 0.0065;
  g.add(body);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.0082, 0.0082, 0.004, 32), mats().plastic);
  inner.rotation.x = Math.PI / 2; inner.position.z = 0.0115;
  g.add(inner);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.006, 10), mats().gold);
    p.rotation.x = Math.PI / 2;
    p.position.set(Math.cos(a) * 0.0035, Math.sin(a) * 0.0035, 0.0135);
    g.add(p);
  }
  return g;
}

/** IEC C14 mains inlet. */
export function iecInlet() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const w = 0.0135, h = 0.0100, c = 0.0035;
  shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h - c);
  shape.lineTo(w - c, h); shape.lineTo(-w + c, h); shape.lineTo(-w, h - c);
  shape.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 2 }), mats().plastic);
  g.add(body);
  for (const [x, y] of [[-0.007, -0.0035], [0.007, -0.0035], [0, 0.0045]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0035, 0.007), mats().gold);
    p.position.set(x, y, 0.0035);
    g.add(p);
  }
  return g;
}

/** Ventilation slot array cut visually into a top panel (as dark inset boxes). */
export function ventSlots(w, d, cols = 3, rows = 14, opts = {}) {
  const { mat = mats().plastic, sw = 0.004, sd = 0.030 } = opts;
  const im = new THREE.InstancedMesh(bevelBox(sw, 0.002, sd, 0.0006, 2), mat, cols * rows);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      m.makeTranslation(
        (-w / 2) + (w / (cols + 1)) * (c + 1),
        0,
        (-d / 2) + (d / (rows + 1)) * (r + 1),
      );
      im.setMatrixAt(i++, m);
    }
  }
  return im;
}

/** Perforated-metal look via a repeating hole grid (instanced dark discs). */
export function perfGrid(w, h, pitch = 0.004, r = 0.0013, mat = mats().plastic) {
  const nx = Math.floor(w / pitch), ny = Math.floor(h / pitch);
  const im = new THREE.InstancedMesh(new THREE.CircleGeometry(r, 10), mat, nx * ny);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      const off = (y % 2) * pitch * 0.5;
      m.makeTranslation(-w / 2 + pitch * (x + 0.5) + off, -h / 2 + pitch * (y + 0.5), 0);
      im.setMatrixAt(i++, m);
    }
  }
  im.count = i;
  return im;
}

/** A soft fake contact shadow quad to sit under an object on the floor. */
export function contactShadow(w, d, opacity = 0.75, y = 0.0012) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: blobShadow(256), transparent: true, opacity, depthWrite: false, blending: THREE.NormalBlending, color: 0x000000 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = -1;
  return m;
}

/** Spun-metal driver cone: profile lathe with a proper roll surround. */
export function driverCone(rOuter, depth, opts = {}) {
  const { surroundW = 0.014, dustR = 0.0, coneMat = mats().cone, surrMat = mats().rubber, dustMat = null } = opts;
  const g = new THREE.Group();
  const rc = rOuter - surroundW;
  // cone: straight-sided with a slight curve
  const pts = [];
  const seg = 18;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const r = THREE.MathUtils.lerp(Math.max(dustR, rc * 0.16), rc, t);
    const y = -depth * Math.pow(1 - t, 1.35);
    pts.push(new THREE.Vector2(r, y));
  }
  const cone = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), coneMat);
  cone.castShadow = true;
  g.add(cone);
  // half-roll surround
  const sp = [];
  const sseg = 14;
  for (let i = 0; i <= sseg; i++) {
    const a = Math.PI * (i / sseg);
    const r = rc + (surroundW / 2) * (1 - Math.cos(a));
    const y = Math.sin(a) * surroundW * 0.46;
    sp.push(new THREE.Vector2(r, y));
  }
  const surr = new THREE.Mesh(new THREE.LatheGeometry(sp, 96), surrMat);
  surr.castShadow = true;
  g.add(surr);
  if (dustR > 0) {
    const dp = [];
    for (let i = 0; i <= 12; i++) {
      const a = (Math.PI / 2) * (i / 12);
      dp.push(new THREE.Vector2(Math.sin(a) * dustR, -depth + Math.cos(a) * dustR * 0.62));
    }
    dp.reverse();
    const dust = new THREE.Mesh(new THREE.LatheGeometry(dp, 64), dustMat || coneMat);
    dust.castShadow = true;
    g.add(dust);
  }
  g.userData.cone = cone;
  return g;
}

/** Cast driver basket: rim ring + N tapered spokes + motor boss. */
export function driverBasket(rOuter, depth, spokes = 6, mat = mats().anodBlack) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(bevelCyl(rOuter, rOuter * 1.02, 0.008, 96, 0.0008), mat);
  g.add(rim);
  const boss = new THREE.Mesh(bevelCyl(rOuter * 0.28, rOuter * 0.30, 0.010, 48, 0.0008), mat);
  boss.position.y = -depth;
  g.add(boss);
  const sp = new THREE.InstancedMesh(bevelBox(rOuter * 0.09, depth * 1.02, 0.006, 0.0006, 2), mat, spokes);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const rMid = rOuter * 0.63;
    e.set(0, -a, Math.atan2(rOuter - rOuter * 0.29, depth) - Math.PI / 2);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.sin(a) * rMid, -depth / 2, Math.cos(a) * rMid), q, s);
    sp.setMatrixAt(i, m);
  }
  sp.castShadow = true;
  g.add(sp);
  return g;
}

/** Recursively enable shadows on a subtree. */
export function shadowed(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

/** Uniform scale + position helper that returns the object (chainable). */
export function at(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  if (ry) obj.rotation.y = ry;
  return obj;
}
