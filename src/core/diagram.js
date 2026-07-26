import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { PAL } from './materials.js';
import { logSpace, linSpace, clamp } from './dsp.js';

/**
 * The shared diagram language.
 *
 * Everything explanatory in the scene is built from these primitives so that
 * eleven independently-authored stages still look like one publication:
 *   · thin cool grid, hairline axes, one accent trace, at most one secondary
 *   · fat screen-space lines (GL 1-px lines look cheap at any resolution)
 *   · text is DOM, projected onto world anchors, so it stays crisp
 *
 * A diagram is a Group. Set `diagram.reveal = 0..1` and call `applyReveal()`
 * (the app does this for you during stage transitions).
 */

const _res = new THREE.Vector2(1600, 1000);
const _lineMats = new Set();

export function setResolution(w, h) {
  _res.set(w, h);
  for (const m of _lineMats) m.resolution.copy(_res);
}

export function lineMaterial(color = PAL.cy, width = 2.0, opts = {}) {
  const m = new LineMaterial({
    color,
    linewidth: width,
    worldUnits: false,
    dashed: !!opts.dashed,
    dashSize: opts.dashSize ?? 0.012,
    gapSize: opts.gapSize ?? 0.010,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthTest: opts.depthTest !== false,
    depthWrite: false,
    alphaToCoverage: true,
    toneMapped: opts.toneMapped ?? false,
  });
  m.resolution.copy(_res);
  _lineMats.add(m);
  return m;
}

/** A polyline whose points can be rewritten every frame. */
export class Trace extends Line2 {
  constructor(n, color = PAL.cy, width = 2.0, opts = {}) {
    const geo = new LineGeometry();
    const pos = new Float32Array(n * 3);
    geo.setPositions(pos);
    super(geo, lineMaterial(color, width, opts));
    this.frustumCulled = false;
    this.renderOrder = opts.renderOrder ?? 10;
    this._n = n;
    this._pos = pos;
    this._baseOpacity = opts.opacity ?? 1;
  }
  /** fn(i, t) → [x,y,z] for i in 0..n-1, t = i/(n-1) */
  write(fn) {
    const p = this._pos;
    for (let i = 0; i < this._n; i++) {
      const v = fn(i, i / (this._n - 1));
      p[i * 3] = v[0]; p[i * 3 + 1] = v[1]; p[i * 3 + 2] = v[2] || 0;
    }
    this.geometry.setPositions(p);
    this.geometry.attributes.instanceStart.needsUpdate = true;
    this.geometry.attributes.instanceEnd.needsUpdate = true;
    this.computeLineDistances();
    return this;
  }
  /** Draw only the first `f` (0..1) of the polyline — for "drawing on" reveals. */
  setProgress(f) {
    const c = Math.max(1, Math.floor((this._n - 1) * clamp(f, 0, 1)));
    this.geometry.instanceCount = c;
    return this;
  }
  setOpacity(o) { this.material.opacity = this._baseOpacity * o; return this; }
}

/**
 * A plot: local coordinates are metres, data is mapped into [0..w] × [0..h]
 * with the origin at the bottom-left of the plot box.
 */
export class Graph extends THREE.Group {
  /**
   * @param opts.w,h            plot size in metres
   * @param opts.xLog           log-scale x
   * @param opts.xRange,yRange  [min,max] in data units
   * @param opts.xTicks,yTicks  array of data values (or 'auto')
   */
  constructor(opts = {}) {
    super();
    this.o = Object.assign({
      w: 0.60, h: 0.34, xLog: false, xRange: [20, 20000], yRange: [-30, 10],
      xTicks: null, yTicks: null, grid: true, frame: true,
      gridColor: PAL.grid, axisColor: 0x555c66, zeroLine: null,
    }, opts);
    this.traces = [];
    this._buildFrame();
  }
  x(v) {
    const { xLog, xRange, w } = this.o;
    const t = xLog
      ? (Math.log10(v) - Math.log10(xRange[0])) / (Math.log10(xRange[1]) - Math.log10(xRange[0]))
      : (v - xRange[0]) / (xRange[1] - xRange[0]);
    return t * w;
  }
  y(v) {
    const { yRange, h } = this.o;
    return ((v - yRange[0]) / (yRange[1] - yRange[0])) * h;
  }
  /** inverse map, plot-x metres → data */
  xInv(px) {
    const { xLog, xRange, w } = this.o;
    const t = px / w;
    return xLog ? Math.pow(10, Math.log10(xRange[0]) + t * (Math.log10(xRange[1]) - Math.log10(xRange[0])))
      : xRange[0] + t * (xRange[1] - xRange[0]);
  }

  _buildFrame() {
    const { w, h, xLog, xRange, yRange, grid, frame, gridColor, axisColor } = this.o;
    const g = new THREE.Group();
    this.frameGroup = g;
    this.add(g);

    const seg = [];
    const push = (x1, y1, x2, y2) => seg.push(x1, y1, 0, x2, y2, 0);

    // x gridlines
    let xt = this.o.xTicks;
    if (!xt) {
      if (xLog) {
        xt = [];
        for (let d = Math.floor(Math.log10(xRange[0])); d <= Math.ceil(Math.log10(xRange[1])); d++) {
          for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
            const v = m * Math.pow(10, d);
            if (v >= xRange[0] * 0.999 && v <= xRange[1] * 1.001) xt.push(v);
          }
        }
      } else xt = linSpace(xRange[0], xRange[1], 9);
    }
    this._xt = xt;
    if (grid) for (const v of xt) { const X = this.x(v); push(X, 0, X, h); }

    // y gridlines
    let yt = this.o.yTicks;
    if (!yt) yt = linSpace(yRange[0], yRange[1], 5);
    this._yt = yt;
    if (grid) for (const v of yt) { const Y = this.y(v); push(0, Y, w, Y); }

    if (seg.length) {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      const gm = new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
      const lines = new THREE.LineSegments(gg, gm);
      lines.renderOrder = 8;
      g.add(lines);
      this._gridMat = gm;
    }

    if (frame) {
      const f = new Trace(5, axisColor, 1.2, { opacity: 0.9, renderOrder: 9 });
      f.write((i) => [[0, 0], [w, 0], [w, h], [0, h], [0, 0]][i].concat(0));
      g.add(f);
      this._frameTrace = f;
    }
    if (this.o.zeroLine !== null && this.o.zeroLine !== undefined) {
      const z = new Trace(2, axisColor, 1.4, { opacity: 0.85, renderOrder: 9, dashed: true, dashSize: 0.010, gapSize: 0.008 });
      const Y = this.y(this.o.zeroLine);
      z.write((i) => [i === 0 ? 0 : w, Y, 0]);
      g.add(z);
      this._zeroTrace = z;
    }
  }

  /** Add a trace sampled over the x range. fn(xData) → yData. */
  addTrace(fn, { color = PAL.cy, width = 2.2, n = 320, dashed = false, opacity = 1, z = 0.0005, clip = true } = {}) {
    const t = new Trace(n, color, width, { dashed, opacity });
    const xs = this.o.xLog ? logSpace(this.o.xRange[0], this.o.xRange[1], n) : linSpace(this.o.xRange[0], this.o.xRange[1], n);
    t.userData.fn = fn;
    t.userData.xs = xs;
    t.userData.clip = clip;
    t.userData.z = z;
    this._fill(t);
    this.add(t);
    this.traces.push(t);
    return t;
  }
  _fill(t) {
    const xs = t.userData.xs, fn = t.userData.fn, clip = t.userData.clip, z = t.userData.z;
    const [y0, y1] = this.o.yRange;
    t.write((i) => {
      const xv = xs[i];
      let yv = fn(xv, i);
      if (clip) yv = clamp(yv, y0 - (y1 - y0) * 0.04, y1 + (y1 - y0) * 0.04);
      return [this.x(xv), this.y(yv), z];
    });
  }
  /** Re-evaluate every trace (call when the model changes). */
  refresh() { for (const t of this.traces) if (t.userData.fn) this._fill(t); }

  /** Vertical marker line at a data x. */
  addMarker(xv, { color = PAL.am, width = 1.4, dashed = true, opacity = 0.8 } = {}) {
    const t = new Trace(2, color, width, { dashed, opacity, dashSize: 0.008, gapSize: 0.007 });
    const X = this.x(xv);
    t.write((i) => [X, i === 0 ? 0 : this.o.h, 0.0004]);
    this.add(t);
    t.userData.setX = (v) => { const XX = this.x(v); t.write((i) => [XX, i === 0 ? 0 : this.o.h, 0.0004]); };
    return t;
  }
  /** Small filled dot marker that can be moved. */
  addDot(color = PAL.am, r = 0.0055) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 20),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false }));
    d.renderOrder = 12;
    d.position.z = 0.0012;
    this.add(d);
    d.userData.setData = (xv, yv) => d.position.set(this.x(xv), this.y(yv), 0.0012);
    return d;
  }
  /** Shaded band between two y values across the whole x range. */
  addBand(ya, yb, color = PAL.cy, opacity = 0.10) {
    const h = this.y(yb) - this.y(ya);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(this.o.w, Math.abs(h)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(this.o.w / 2, (this.y(ya) + this.y(yb)) / 2, -0.0002);
    m.renderOrder = 6;
    this.add(m);
    return m;
  }
  /** Filled area under a function (for spectra / energy). */
  addArea(fn, { color = PAL.cy, opacity = 0.16, n = 200, baseline = null } = {}) {
    const yBase = baseline === null ? this.o.yRange[0] : baseline;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 7;
    mesh.frustumCulled = false;
    this.add(mesh);
    const xs = this.o.xLog ? logSpace(this.o.xRange[0], this.o.xRange[1], n) : linSpace(this.o.xRange[0], this.o.xRange[1], n);
    mesh.userData.update = () => {
      const [y0, y1] = this.o.yRange;
      for (let i = 0; i < n; i++) {
        const X = this.x(xs[i]);
        const Y = this.y(clamp(fn(xs[i], i), y0, y1));
        pos[i * 6] = X; pos[i * 6 + 1] = this.y(yBase); pos[i * 6 + 2] = -0.0001;
        pos[i * 6 + 3] = X; pos[i * 6 + 4] = Y; pos[i * 6 + 5] = -0.0001;
      }
      geo.attributes.position.needsUpdate = true;
    };
    mesh.userData.update();
    return mesh;
  }
  setOpacity(o) {
    if (this._gridMat) this._gridMat.opacity = 0.55 * o;
    if (this._frameTrace) this._frameTrace.setOpacity(o);
    if (this._zeroTrace) this._zeroTrace.setOpacity(o);
    for (const t of this.traces) t.setOpacity(o);
    this.traverse((c) => { if (c.isMesh && c.material && c.material.transparent && c.userData.baseOp === undefined) { c.userData.baseOp = c.material.opacity; } });
    this.traverse((c) => { if (c.isMesh && c.material && c.userData.baseOp !== undefined) c.material.opacity = c.userData.baseOp * o; });
    return this;
  }
  get ticksX() { return this._xt; }
  get ticksY() { return this._yt; }
}

/**
 * A holographic backing card that diagrams sit on: a dark glass plane with a
 * hairline border. Keeps traces legible over any part of the scene.
 */
export function diagramCard(w, h, opts = {}) {
  const { opacity = 0.62, border = true, pad = 0.02 } = opts;
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w + pad * 2, h + pad * 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x080a0d, transparent: true, opacity, depthWrite: false, toneMapped: false,
  });
  const p = new THREE.Mesh(geo, mat);
  p.position.set(w / 2, h / 2, -0.001);
  p.renderOrder = 4;
  g.add(p);
  if (border) {
    const b = new Trace(5, 0x39414c, 1.0, { opacity: 0.85, renderOrder: 5 });
    const W = w + pad * 2, H = h + pad * 2, x0 = -pad, y0 = -pad;
    b.write((i) => [[x0, y0], [x0 + W, y0], [x0 + W, y0 + H], [x0, y0 + H], [x0, y0]][i].concat(-0.0008));
    g.add(b);
    g.userData.border = b;
  }
  g.userData.plate = p;
  g.userData.setOpacity = (o) => {
    mat.opacity = opacity * o;
    if (g.userData.border) g.userData.border.setOpacity(o);
  };
  return g;
}

/**
 * Instanced particle system for charge carriers, samples, photons of field —
 * anything that flows. Positions are driven by a callback so the *physics*
 * lives in the stage, not here.
 */
export class Swarm extends THREE.InstancedMesh {
  constructor(count, { color = PAL.am, size = 0.0045, geometry = null, additive = true } = {}) {
    const geo = geometry || new THREE.SphereGeometry(size, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color, toneMapped: false, transparent: true, opacity: 1,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    super(geo, mat, count);
    this.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.frustumCulled = false;
    this.renderOrder = 14;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }
  /** fn(i) → {p:[x,y,z], s?:number, c?:hex|Color} */
  update(fn) {
    for (let i = 0; i < this.count; i++) {
      const r = fn(i);
      if (!r) { this._s.set(0, 0, 0); this._m.compose(this._p.set(0, 0, 0), this._q, this._s); this.setMatrixAt(i, this._m); continue; }
      this._p.set(r.p[0], r.p[1], r.p[2]);
      const s = r.s ?? 1;
      this._s.set(s, s, s);
      this._m.compose(this._p, this._q, this._s);
      this.setMatrixAt(i, this._m);
      if (r.c !== undefined) { this._c.set(r.c); this.setColorAt(i, this._c); }
    }
    this.instanceMatrix.needsUpdate = true;
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
  }
  setOpacity(o) { this.material.opacity = o; }
}

/** A glowing sprite — LEDs, hot spots, the leading edge of a wavefront. */
export function glow(color = PAL.cy, size = 0.05, intensity = 1, tex = null) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity: intensity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  m.scale.set(size, size, 1);
  m.renderOrder = 20;
  return m;
}

/** Thin tube along a path — cables, field lines, the groove spiral. */
export function tube(points, r = 0.002, mat, seg = null) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const g = new THREE.TubeGeometry(curve, seg || Math.max(24, points.length * 3), r, 10, false);
  const m = new THREE.Mesh(g, mat);
  m.userData.curve = curve;
  return m;
}

/**
 * Axis-aligned dimension line with arrowheads — used to call out physical
 * sizes (wavelength, excursion, groove width) at true scale.
 */
export function dimension(a, b, { color = PAL.ink3, width = 1.2, head = 0.006 } = {}) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const t = new Trace(2, color, width, { opacity: 0.9 });
  t.write((i) => (i === 0 ? [A.x, A.y, A.z] : [B.x, B.y, B.z]));
  g.add(t);
  const dir = B.clone().sub(A).normalize();
  for (const [pt, sgn] of [[A, 1], [B, -1]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.42, head, 12),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true }));
    cone.position.copy(pt).addScaledVector(dir, sgn * head * 0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().multiplyScalar(sgn));
    g.add(cone);
  }
  g.userData.setOpacity = (o) => g.traverse((c) => {
    if (c.material) { c.material.transparent = true; c.material.opacity = 0.9 * o; }
  });
  return g;
}

/** Uniformly fade a subtree that mixes Traces, Graphs, cards and meshes. */
export function fadeTree(root, o) {
  root.traverse((c) => {
    if (c.userData && typeof c.userData.setOpacity === 'function') { c.userData.setOpacity(o); return; }
    if (c.setOpacity && (c.isLine2 || c instanceof Swarm)) { c.setOpacity(o); return; }
    if (c.isMesh || c.isSprite || c.isLine || c.isPoints) {
      const m = c.material;
      if (!m) return;
      if (c.userData._baseOp === undefined) { c.userData._baseOp = m.opacity ?? 1; }
      m.transparent = true;
      m.opacity = c.userData._baseOp * o;
      m.visible = o > 0.001;
    }
  });
  root.visible = o > 0.001;
}
