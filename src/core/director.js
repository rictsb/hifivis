import * as THREE from 'three';
import { clamp, smoothstep } from './dsp.js';

/**
 * Camera director.
 *
 * Cinematic moves between stage keyframes, plus a slow idle drift and pointer
 * parallax so a still frame never feels dead. Users can orbit/dolly; doing so
 * suspends the drift until the next stage change.
 */

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Director {
  constructor(camera, domEl) {
    this.cam = camera;
    this.dom = domEl;

    this.pos = new THREE.Vector3(0, 1.6, 4.4);
    this.tgt = new THREE.Vector3(0, 1.0, 0);
    this.fov = 38;

    this._from = { p: new THREE.Vector3(), t: new THREE.Vector3(), f: 38 };
    this._to = { p: new THREE.Vector3(), t: new THREE.Vector3(), f: 38 };
    this._mid = new THREE.Vector3();
    this._k = 1;           // transition progress
    this._dur = 1.7;

    // user orbit offsets, decayed back to zero after a while
    this.orbit = { az: 0, el: 0, dolly: 0 };
    this.userActive = 0;
    this.drift = 1;

    this.ptr = new THREE.Vector2();
    this._ptrS = new THREE.Vector2();

    /**
     * Shift lens. The explanation panel occupies the right ~29 % of the canvas
     * and the chapter rail the left ~10 %, so the optical centre of the *visible*
     * stage is at about 0.40 of the width, not 0.50. Rather than skewing the
     * camera (which would tilt verticals), we offset the principal point — the
     * same thing a product photographer does with a tilt-shift lens. Subjects
     * land centred in the clear band with vertical lines still vertical.
     */
    this.shiftX = 0;
    this._updateShift();
    window.addEventListener('resize', () => this._updateShift(), { passive: true });

    this._bind();
  }

  _updateShift() {
    const w = window.innerWidth;
    if (w < 820) { this.shiftX = 0; return; }          // panel is bottom-docked
    const panelW = Math.min(w * 0.315, 436) + 24;      // #panel width + right gap
    const railW = w < 1180 ? 46 : 200;                 // chapter rail
    const centre = (railW + (w - panelW)) / 2;         // centre of the clear band
    this.shiftX = (1 - (2 * centre) / w) * -1;         // → NDC offset of that centre
  }

  _bind() {
    const el = this.dom;
    let down = false, lx = 0, ly = 0, btn = 0;
    el.addEventListener('pointerdown', (e) => {
      down = true; btn = e.button; lx = e.clientX; ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => { down = false; try { el.releasePointerCapture(e.pointerId); } catch (_) {} });
    el.addEventListener('pointercancel', () => { down = false; });
    el.addEventListener('pointermove', (e) => {
      this.ptr.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      if (!down) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.orbit.az -= dx * 0.0038;
      this.orbit.el = clamp(this.orbit.el - dy * 0.0030, -0.55, 0.72);
      this.userActive = 1;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.dolly = clamp(this.orbit.dolly + e.deltaY * 0.0016, -0.45, 1.4);
      this.userActive = 1;
    }, { passive: false });
  }

  /** Jump or fly to a keyframe. */
  goTo(kf, instant = false) {
    this._from.p.copy(this.pos); this._from.t.copy(this.tgt); this._from.f = this.fov;
    this._to.p.set(...kf.position); this._to.t.set(...kf.target); this._to.f = kf.fov ?? 38;
    // arc control point: lift the path so we sweep around rather than through
    this._mid.copy(this._from.p).add(this._to.p).multiplyScalar(0.5);
    const span = this._from.p.distanceTo(this._to.p);
    this._mid.y += span * 0.12;
    const away = this._mid.clone().sub(this._to.t).setY(0);
    if (away.lengthSq() > 1e-6) this._mid.add(away.normalize().multiplyScalar(span * 0.10));
    this._dur = instant ? 0.0001 : clamp(0.95 + span * 0.16, 1.1, 2.5);
    this._k = 0;
    this.orbit.az *= 0.0; this.orbit.el *= 0.0; this.orbit.dolly *= 0.0;
    this.userActive = 0;
  }

  get transitioning() { return this._k < 1; }

  update(dt, t) {
    // --- keyframe transition
    if (this._k < 1) {
      this._k = clamp(this._k + dt / this._dur, 0, 1);
      const e = easeInOut(this._k);
      // quadratic Bézier through the lifted mid point
      const u = 1 - e;
      this.pos.set(
        u * u * this._from.p.x + 2 * u * e * this._mid.x + e * e * this._to.p.x,
        u * u * this._from.p.y + 2 * u * e * this._mid.y + e * e * this._to.p.y,
        u * u * this._from.p.z + 2 * u * e * this._mid.z + e * e * this._to.p.z,
      );
      this.tgt.lerpVectors(this._from.t, this._to.t, e);
      this.fov = this._from.f + (this._to.f - this._from.f) * e;
    }

    // --- idle drift: a slow lateral arc + a breath in the dolly
    this.userActive = Math.max(0, this.userActive - dt * 0.10);
    const idle = (1 - smoothstep(0, 0.4, this.userActive)) * this.drift;
    const driftAz = Math.sin(t * 0.052) * 0.055 * idle;
    const driftEl = Math.sin(t * 0.037 + 1.1) * 0.022 * idle;
    const breathe = Math.sin(t * 0.043 + 2.2) * 0.014 * idle;

    // --- pointer parallax
    this._ptrS.lerp(this.ptr, 1 - Math.pow(0.001, dt));
    const paraAz = -this._ptrS.x * 0.045;
    const paraEl = -this._ptrS.y * 0.028;

    // --- compose final camera from spherical offsets around the target
    const off = this.pos.clone().sub(this.tgt);
    const r = off.length();
    const az = Math.atan2(off.x, off.z) + this.orbit.az + driftAz + paraAz;
    const el = Math.asin(clamp(off.y / r, -1, 1)) + this.orbit.el + driftEl + paraEl;
    const rr = r * (1 + this.orbit.dolly + breathe);
    const ce = Math.cos(clamp(el, -0.85, 1.30));
    this.cam.position.set(
      this.tgt.x + Math.sin(az) * ce * rr,
      this.tgt.y + Math.sin(clamp(el, -0.85, 1.30)) * rr,
      this.tgt.z + Math.cos(az) * ce * rr,
    );
    this.cam.lookAt(this.tgt);
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();
    // Principal-point offset. m[8] = (r+l)/(r−l); the resulting NDC shift is −m[8].
    this.cam.projectionMatrix.elements[8] = -this.shiftX;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
  }
}
