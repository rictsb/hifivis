import * as THREE from 'three';

/**
 * World-anchored DOM annotations.
 *
 * Text in a 3D scene must be DOM: canvas-textured sprites go soft the moment
 * the camera moves, and this piece lives or dies on typography. Each label is
 * an absolutely-positioned div projected from a world anchor every frame,
 * with a depth test so it hides behind geometry when it should.
 */

const _v = new THREE.Vector3();

export class LabelLayer {
  constructor(el, camera) {
    this.el = el;
    this.camera = camera;
    this.items = [];
    this._raycaster = new THREE.Raycaster();
  }

  /**
   * @param anchor  THREE.Vector3 | Object3D | () => Vector3
   * @param opts.kicker  small uppercase line above
   * @param opts.text    main line (HTML allowed, kept tiny)
   * @param opts.value   monospace numeric line
   * @param opts.cls     extra classes: 'acc' | 'am' | 'lead'
   * @param opts.offset  [dx,dy] px offset from projected point
   */
  add(anchor, opts = {}) {
    const d = document.createElement('div');
    d.className = 'wlab ' + (opts.cls || '');
    const parts = [];
    if (opts.kicker) parts.push(`<span class="k">${opts.kicker}</span>`);
    if (opts.text) parts.push(`<span class="t">${opts.text}</span>`);
    if (opts.value !== undefined) parts.push(`<span class="v">${opts.value}</span>`);
    d.innerHTML = parts.join('');
    this.el.appendChild(d);
    const item = {
      el: d, anchor, offset: opts.offset || [0, 0], visible: true,
      _vEl: d.querySelector('.v'), _kEl: d.querySelector('.k'), _tEl: d.querySelector('.t'),
      opacity: 1, alive: true, hideBehind: opts.hideBehind !== false,
    };
    item.setValue = (v) => { if (item._vEl) item._vEl.textContent = v; };
    item.setText = (v) => { if (item._tEl) item._tEl.innerHTML = v; };
    item.setKicker = (v) => { if (item._kEl) item._kEl.textContent = v; };
    item.remove = () => { item.alive = false; d.remove(); };
    this.items.push(item);
    return item;
  }

  clear() {
    for (const i of this.items) i.el.remove();
    this.items.length = 0;
  }

  update(fade = 1, w, h) {
    const cam = this.camera;
    for (const it of this.items) {
      if (!it.alive) continue;
      const a = it.anchor;
      if (typeof a === 'function') _v.copy(a());
      else if (a.isVector3) _v.copy(a);
      else a.getWorldPosition(_v);
      _v.project(cam);
      const behind = _v.z > 1;
      const x = (_v.x * 0.5 + 0.5) * w + it.offset[0];
      const y = (-_v.y * 0.5 + 0.5) * h + it.offset[1];
      const on = it.visible && !behind && fade > 0.02
        && x > -140 && x < w + 140 && y > -60 && y < h + 60;
      it.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
      it.el.style.opacity = on ? (it.opacity * fade).toFixed(3) : '0';
      it.el.classList.toggle('on', on);
    }
  }
}
