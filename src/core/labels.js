import * as THREE from 'three';

/**
 * World-anchored DOM annotations.
 *
 * Text in a 3D scene must be DOM: canvas-textured sprites go soft the moment
 * the camera moves, and this piece lives or dies on typography. Each label is
 * an absolutely-positioned div projected from a world anchor every frame.
 *
 * Three things beyond projection, all of which matter more than they sound:
 *
 *  1. OCCLUSION. A label whose anchor is behind solid geometry must hide, or
 *     the reader is told a part is visible when it is not. Raycast, throttled
 *     and round-robin so it costs nothing.
 *  2. KEEP-OUT. The chapter rail, masthead, transport and explanation panel own
 *     real estate. A label that lands on them is unreadable and makes both
 *     unreadable. Labels are nudged out of those rects, and hidden if the nudge
 *     would take them too far from what they name.
 *  3. MUTUAL COLLISION. Labels are placed greedily and pushed apart vertically;
 *     one that cannot be placed is dropped rather than overprinted.
 */

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Kickers are NOT case-folded. There is no safe automatic transform: CSS
 * `text-transform:uppercase` turns µ into Greek Mu, and an ASCII-only fold still
 * turns "µm" into "µM" (micromolar), "ms" into "MS" and "dBFS" into "DBFS".
 * Units carry meaning in their case, so the author writes the case they mean.
 */
const up = (s) => String(s);

const overlaps = (a, b) =>
  a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export class LabelLayer {
  constructor(el, camera, scene = null) {
    this.el = el;
    this.camera = camera;
    this.scene = scene;
    this.items = [];
    this._ray = new THREE.Raycaster();
    this._ray.far = 60;
    this._cursor = 0;
    this._keepOut = [];
    this._keepOutAge = -1;
  }

  /**
   * @param anchor  THREE.Vector3 | Object3D | () => Vector3
   * @param opts.kicker   small uppercase line above (ASCII-folded, SI-safe)
   * @param opts.text     main line (HTML allowed)
   * @param opts.value    monospace numeric line
   * @param opts.cls      'acc' | 'am' | 'lead' | 'plain'
   * @param opts.offset   [dx,dy] px from the projected point
   * @param opts.priority higher survives a collision (default 0)
   * @param opts.occlude  false to skip the depth test (diagram-anchored labels)
   */
  add(anchor, opts = {}) {
    const d = document.createElement('div');
    d.className = 'wlab ' + (opts.cls || '');
    const parts = [];
    if (opts.kicker) parts.push(`<span class="k">${up(opts.kicker)}</span>`);
    if (opts.text) parts.push(`<span class="t">${opts.text}</span>`);
    if (opts.value !== undefined) parts.push(`<span class="v">${opts.value}</span>`);
    d.innerHTML = parts.join('');
    this.el.appendChild(d);
    const item = {
      el: d, anchor, offset: opts.offset || [0, 0],
      visible: true, opacity: 1, alive: true,
      occlude: opts.occlude !== false,
      priority: opts.priority || 0,
      _occluded: false, _w: 0, _h: 0,
      _vEl: d.querySelector('.v'), _kEl: d.querySelector('.k'), _tEl: d.querySelector('.t'),
    };
    item.setValue = (v) => { if (item._vEl && item._vEl.textContent !== String(v)) item._vEl.textContent = v; };
    item.setText = (v) => { if (item._tEl) item._tEl.innerHTML = v; };
    item.setKicker = (v) => { if (item._kEl) item._kEl.textContent = up(v); };
    item.remove = () => { item.alive = false; d.remove(); };
    this.items.push(item);
    return item;
  }

  clear() {
    for (const i of this.items) i.el.remove();
    this.items.length = 0;
  }

  /** Rects the UI owns. Recomputed on resize, not per frame. */
  _rects(w, h) {
    if (this._keepOutAge === w * 8191 + h) return this._keepOut;
    this._keepOutAge = w * 8191 + h;
    const pad = 10;
    const out = [];
    for (const sel of ['#chapters', '#masthead', '#panel', '#controls', '#scrub']) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      out.push({ l: r.left - pad, r: r.right + pad, t: r.top - pad, b: r.bottom + pad });
    }
    this._keepOut = out;
    return out;
  }

  /**
   * Cached list of things that can actually hide a label: opaque, visible
   * meshes. Rebuilt occasionally rather than per ray, both because walking the
   * graph is the expensive part and because raycasting fat lines (Line2)
   * requires a camera on the raycaster and tells us nothing — a 2 px trace does
   * not occlude anything.
   */
  _blockers() {
    if (this._blockCache && this._blockAge-- > 0) return this._blockCache;
    const out = [];
    this.scene.traverse((o) => {
      if (!o.visible || !o.isMesh || o.isLine2 || o.isLineSegments2) return;
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      if (m.transparent === true || (m.opacity !== undefined && m.opacity < 0.95)) return;
      if (m.isMeshBasicMaterial && m.toneMapped === false) return;   // emissive/UI
      out.push(o);
    });
    this._blockCache = out;
    this._blockAge = 90;
    return out;
  }

  /** Is the anchor hidden behind solid geometry? Conservative on purpose. */
  _occludedAt(world) {
    if (!this.scene) return false;
    const cam = this.camera;
    _dir.copy(world).sub(cam.position);
    const dist = _dir.length();
    if (dist < 0.05) return false;
    _dir.multiplyScalar(1 / dist);
    this._ray.camera = cam;
    this._ray.set(cam.position, _dir);
    this._ray.near = 0.02;
    this._ray.far = dist - 0.12;              // ignore things at the anchor itself
    if (this._ray.far <= this._ray.near) return false;
    const hits = this._ray.intersectObjects(this._blockers(), false);
    return hits.length > 0;
  }

  update(fade = 1, w, h) {
    const cam = this.camera;
    const live = this.items.filter((it) => it.alive);
    if (!live.length) return;

    // --- throttled occlusion: two labels per frame, round-robin
    if (fade > 0.5 && this.scene) {
      for (let n = 0; n < 2 && n < live.length; n++) {
        const it = live[this._cursor++ % live.length];
        if (!it.occlude) { it._occluded = false; continue; }
        const a = it.anchor;
        if (typeof a === 'function') _v.copy(a());
        else if (a.isVector3) _v.copy(a);
        else a.getWorldPosition(_v);
        it._occluded = this._occludedAt(_v);
      }
    }

    const keepOut = this._rects(w, h);
    const placed = [];

    // Place in priority order so the important label wins a collision.
    const order = live.slice().sort((a, b) => b.priority - a.priority);

    for (const it of order) {
      const a = it.anchor;
      if (typeof a === 'function') _v.copy(a());
      else if (a.isVector3) _v.copy(a);
      else a.getWorldPosition(_v);
      _v.project(cam);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * w + it.offset[0];
      let y = (-_v.y * 0.5 + 0.5) * h + it.offset[1];

      // measure once, then reuse (offsetWidth is a layout read; cache it)
      if (!it._w) { it._w = it.el.offsetWidth || 120; it._h = it.el.offsetHeight || 26; }
      const hw = it._w / 2, hh = it._h / 2;

      let show = it.visible && !behind && fade > 0.02 && !it._occluded;

      if (show) {
        // --- push out of UI keep-out rects, horizontally
        for (let pass = 0; pass < 2 && show; pass++) {
          for (const k of keepOut) {
            const box = { l: x - hw, r: x + hw, t: y - hh, b: y + hh };
            if (!overlaps(box, k)) continue;
            const pushRight = k.r - box.l;
            const pushLeft = box.r - k.l;
            const move = pushRight < pushLeft ? pushRight : -pushLeft;
            if (Math.abs(move) > 190) { show = false; break; }
            x += move;
          }
        }
        // --- nudge apart from already-placed labels, vertically
        if (show) {
          for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (const p of placed) {
              const box = { l: x - hw, r: x + hw, t: y - hh, b: y + hh };
              if (!overlaps(box, p)) continue;
              const down = p.b - box.t + 3;
              const upd = box.b - p.t + 3;
              y += down < upd ? down : -upd;
              moved = true;
            }
            if (!moved) break;
          }
          const box = { l: x - hw, r: x + hw, t: y - hh, b: y + hh };
          for (const p of placed) if (overlaps(box, p)) { show = false; break; }
          if (show && (box.r < 4 || box.l > w - 4 || box.b < 4 || box.t > h - 4)) show = false;
          if (show) placed.push(box);
        }
      }

      it.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
      it.el.style.opacity = show ? (it.opacity * fade).toFixed(3) : '0';
      it.el.classList.toggle('on', show);
    }
  }
}
