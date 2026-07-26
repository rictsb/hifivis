import * as THREE from 'three';
import { createRenderer, createComposer, resize } from './core/renderer.js';
import { makeEnvironment } from './core/env.js';
import { buildMaterials, applyEnv, mats, PAL } from './core/materials.js';
import { buildRoom, floorPool } from './core/room.js';
import { LAYOUT, SHOTS } from './core/layout.js';
import { Director } from './core/director.js';
import { LabelLayer } from './core/labels.js';
import { UI } from './core/ui.js';
import { fadeTree, setResolution } from './core/diagram.js';
import * as DIAG from './core/diagram.js';
import * as GEO from './core/geo.js';
import * as DSP from './core/dsp.js';
import { STAGES } from './stages/index.js';

const HIFI = { ready: false, bootError: null, stages: [], fps: 0, info: null };
window.HIFI = HIFI;

try { boot(); } catch (e) { HIFI.bootError = String(e && e.stack || e); throw e; }

function boot() {
  const canvas = document.getElementById('gl');
  const renderer = createRenderer(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07080b, 0.0085);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.02, 60);
  camera.position.set(...SHOTS.hero.position);

  buildMaterials();
  const env = makeEnvironment(renderer);
  scene.environment = env;
  scene.environmentIntensity = 1.15;
  applyEnv(env);

  buildRoom(scene);
  floorPool(scene);

  const { composer, bloom, grade, smaa } = createComposer(renderer, scene, camera);
  const director = new Director(camera, canvas);
  const labelHost = document.getElementById('labels');

  // ---- shared context handed to every stage --------------------------------
  const app = {
    THREE, scene, camera, renderer, composer, director,
    mats: mats(), PAL, LAYOUT, SHOTS,
    DIAG, GEO, DSP,
    stages: [], byId: new Map(),
    active: null, activeIndex: 0,
    rate: 1, playing: true,
    time: 0,
  };

  // ---- instantiate stages ---------------------------------------------------
  for (const def of STAGES) {
    const st = Object.create(def);
    st.reveal = 0;
    st._t = 0;
    st.labels = new LabelLayer(labelHost, camera);
    st.ctx = Object.assign(Object.create(app), { stage: st, labels: st.labels });
    let built = {};
    try {
      built = st.build ? (st.build(st.ctx) || {}) : {};
    } catch (e) {
      console.error(`stage "${st.id}" failed to build:`, e);
      built = {};
    }
    st.hardware = built.hardware || null;
    st.overlay = built.overlay || null;
    if (st.hardware) scene.add(st.hardware);
    if (st.overlay) { scene.add(st.overlay); fadeTree(st.overlay, 0); }
    app.stages.push(st);
    app.byId.set(st.id, st);
  }
  HIFI.stages = app.stages.map((s) => ({ id: s.id, title: s.title }));

  // ---- navigation -----------------------------------------------------------
  const ui = new UI(app);

  app.goTo = (id, opts = {}) => {
    const st = app.byId.get(id);
    if (!st || st === app.active) return;
    const i = app.stages.indexOf(st);
    app.active = st;
    app.activeIndex = i;
    director.goTo(st.shot || SHOTS.hero, !!opts.instant);
    ui.setActive(i);
    ui.showStage(st, i);
  };
  app.step = (d) => {
    const i = (app.activeIndex + d + app.stages.length) % app.stages.length;
    app.goTo(app.stages[i].id);
  };
  app.togglePlay = () => { app.playing = !app.playing; ui.setPaused(!app.playing); };
  app.setRate = (r) => { app.rate = r; };
  HIFI.goTo = (id, o) => app.goTo(id, o);
  HIFI.app = app;

  // start on the overview
  app.active = app.stages[0];
  app.activeIndex = 0;
  director.pos.set(...(app.stages[0].shot || SHOTS.hero).position);
  director.tgt.set(...(app.stages[0].shot || SHOTS.hero).target);
  director.fov = (app.stages[0].shot || SHOTS.hero).fov ?? 38;
  director._k = 1;
  ui.setActive(0);
  ui.showStage(app.stages[0], 0);

  window.addEventListener('resize', () => resize(renderer, composer, camera, { bloom, smaa }), { passive: true });

  // ---- loop -----------------------------------------------------------------
  const clock = new THREE.Clock();
  let acc = 0, frames = 0, roAcc = 0;
  let firstFrames = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dtReal = Math.min(clock.getDelta(), 0.05);
    app.time += dtReal;

    // fps
    acc += dtReal; frames++;
    if (acc > 0.5) { HIFI.fps = frames / acc; acc = 0; frames = 0; }

    // stage reveal easing
    for (const st of app.stages) {
      const want = st === app.active ? 1 : 0;
      const sp = want > st.reveal ? 2.0 : 3.0;
      st.reveal += (want - st.reveal) * (1 - Math.pow(0.001, dtReal * sp / 3));
      if (Math.abs(want - st.reveal) < 0.002) st.reveal = want;
    }

    // per-stage simulation clocks
    for (const st of app.stages) {
      const live = st.reveal > 0.002 || st.alwaysUpdate;
      if (!live) continue;
      const ts = (st.timeScale ?? 1) * app.rate;
      const dtSim = app.playing ? dtReal * ts : 0;
      st._t += dtSim;
      if (st.update) {
        try { st.update(dtSim, st._t, st.ctx); }
        catch (e) { if (!st._errored) { st._errored = true; console.error(`stage "${st.id}" update:`, e); } }
      }
      if (st.overlay) fadeTree(st.overlay, st.reveal);
      if (st.setReveal) { try { st.setReveal(st.reveal, st.ctx); } catch (e) { /* reported above */ } }
    }

    director.update(dtReal, app.time);

    // labels: only the active stage's layer draws
    const w = window.innerWidth, h = window.innerHeight;
    for (const st of app.stages) {
      if (st.labels.items.length) st.labels.update(st.reveal, w, h);
    }

    // periodic readout refresh (10 Hz — no need to thrash the DOM at 60)
    roAcc += dtReal;
    if (roAcc > 0.1) { roAcc = 0; if (app.active) ui.updateReadouts(app.active); }
    ui.setRateLabel((app.active?.timeScale ?? 1) * app.rate);

    grade.uniforms.uTime.value = app.time;

    renderer.info.reset();
    composer.render();
    HIFI.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };

    if (!HIFI.ready && ++firstFrames > 3) {
      HIFI.ready = true;
      document.body.classList.add('ready');
    }
  }
  frame();
}
