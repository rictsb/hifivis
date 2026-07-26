/**
 * DOM layer: chapter rail, explanation panel, readouts, transport.
 * Kept deliberately separate from the WebGL side — the only coupling is the
 * `app` object it is handed.
 */

const $ = (s) => document.querySelector(s);

function fmtRatio(scale) {
  if (scale >= 0.999 && scale <= 1.001) return 'real time';
  if (scale > 1) return `${scale < 10 ? scale.toFixed(1) : Math.round(scale)}× faster`;
  const inv = 1 / scale;
  if (inv < 1000) return `1 : ${inv < 10 ? inv.toFixed(1) : Math.round(inv)}`;
  const e = Math.floor(Math.log10(inv));
  const m = inv / Math.pow(10, e);
  return `1 : ${m.toFixed(1)}×10${sup(e)}`;
}
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');

export class UI {
  constructor(app) {
    this.app = app;
    this.rail = $('#chapters');
    this.panelHead = $('#panel-head');
    this.body = $('#panel-body');
    this.ro = $('#panel-readouts');
    this.idxEl = $('#stage-index');
    this.kickEl = $('#stage-kicker');
    this.titleEl = $('#stage-title');
    this.sfEl = $('#stage-standfirst');
    this.scroll = $('#panel-scroll');
    this._roCells = new Map();
    this._buildRail();
    this._bind();
  }

  _buildRail() {
    const { stages } = this.app;
    this.rail.innerHTML = '';
    this.btns = stages.map((s, i) => {
      if (s.rule) {
        const r = document.createElement('div');
        r.className = 'chap-rule';
        this.rail.appendChild(r);
      }
      const b = document.createElement('button');
      b.className = 'chap';
      b.type = 'button';
      b.innerHTML = `<span class="n mono">${String(i).padStart(2, '0')}</span><span class="t">${s.nav || s.title}</span>`;
      b.addEventListener('click', () => this.app.goTo(s.id));
      this.rail.appendChild(b);
      return b;
    });
  }

  _bind() {
    $('#next').addEventListener('click', () => this.app.step(1));
    $('#prev').addEventListener('click', () => this.app.step(-1));
    $('#playpause').addEventListener('click', () => this.app.togglePlay());

    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input,textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { this.app.step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { this.app.step(-1); e.preventDefault(); }
      else if (e.key === ' ') { this.app.togglePlay(); e.preventDefault(); }
      else if (e.key === 'Home') { this.app.goTo(this.app.stages[0].id); }
      else if (e.key === 'End') { this.app.goTo(this.app.stages[this.app.stages.length - 1].id); }
      else if (/^[0-9]$/.test(e.key)) {
        const i = (+e.key + 9) % 10;
        if (this.app.stages[i]) this.app.goTo(this.app.stages[i].id);
      }
    });

    // time-scale scrubber
    const track = $('#scrub-track'), fill = $('#scrub-fill'), knob = $('#scrub-knob');
    this._scrub = { track, fill, knob, val: $('#scrub-val') };
    const set = (clientX) => {
      const r = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      this.app.setRate(Math.pow(10, -1.3 + t * 1.78)); // 0.05× … 3×
      this.setScrubPos(t);
    };
    let dragging = false;
    track.addEventListener('pointerdown', (e) => { dragging = true; track.setPointerCapture(e.pointerId); set(e.clientX); });
    track.addEventListener('pointermove', (e) => { if (dragging) set(e.clientX); });
    track.addEventListener('pointerup', (e) => { dragging = false; try { track.releasePointerCapture(e.pointerId); } catch (_) {} });
    this.setScrubPos(0.73);
  }

  setScrubPos(t) {
    const w = this._scrub.track.clientWidth || 150;
    this._scrub.fill.style.width = (t * w).toFixed(1) + 'px';
    this._scrub.knob.style.left = (t * w).toFixed(1) + 'px';
  }

  setActive(i) {
    this.btns.forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
  }

  /** Cross-fade the panel to a new stage's copy. */
  showStage(stage, i) {
    const el = this.scroll;
    el.style.transition = 'opacity .20s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      this.idxEl.textContent = String(i).padStart(2, '0');
      this.kickEl.textContent = stage.kicker || '';
      this.titleEl.innerHTML = stage.title;
      this.sfEl.innerHTML = stage.standfirst || '';
      this.body.innerHTML = typeof stage.content === 'function' ? stage.content() : (stage.content || '');
      this._buildReadouts(stage);
      el.scrollTop = 0;
      el.style.opacity = '1';
    }, 200);
  }

  _buildReadouts(stage) {
    this.ro.innerHTML = '';
    this._roCells.clear();
    const list = typeof stage.readouts === 'function' ? stage.readouts() : null;
    if (!list || !list.length) return;
    for (const r of list) {
      const d = document.createElement('div');
      d.className = 'ro ' + (r.cls || '');
      d.innerHTML = `<span class="k">${r.k}</span><span class="v"><span class="vv">${r.v ?? '—'}</span>${r.u ? `<span class="u">${r.u}</span>` : ''}</span>` +
        (r.bar !== undefined ? '<span class="bar"><i></i></span>' : '');
      this.ro.appendChild(d);
      this._roCells.set(r.k, { v: d.querySelector('.vv'), bar: d.querySelector('.bar i') });
    }
  }

  /** Fast path: only rewrite the numbers, never the DOM structure. */
  updateReadouts(stage) {
    if (typeof stage.readouts !== 'function') return;
    const list = stage.readouts();
    if (!list) return;
    if (list.length !== this._roCells.size) { this._buildReadouts(stage); return; }
    for (const r of list) {
      const c = this._roCells.get(r.k);
      if (!c) { this._buildReadouts(stage); return; }
      if (c.v.textContent !== String(r.v)) c.v.textContent = r.v;
      if (c.bar && r.bar !== undefined) c.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, r.bar)).toFixed(3)})`;
    }
  }

  setRateLabel(effective) {
    this._scrub.val.textContent = fmtRatio(effective);
  }

  setPaused(p) {
    document.body.classList.toggle('paused', p);
    document.querySelector('#playpause').setAttribute('aria-label', p ? 'Play animation' : 'Pause animation');
  }
}
