import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { setResolution } from './diagram.js';

/**
 * Grade pass — everything that happens *after* tone mapping.
 * Deliberately restrained: real product photography is clean. We add only
 * what a physical camera would: a trace of lateral chromatic aberration at the
 * frame edge, sensor grain that scales with darkness, and a soft optical
 * vignette. No contrast crushing, no colour-wheel stylisation.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.030 },
    uCA: { value: 0.00032 },
    uVig: { value: 0.22 },
    uLift: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uCA, uVig, uLift;
    varying vec2 vUv;

    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }

    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c,c);

      // lateral CA: radial, quadratic with field height, sub-pixel at centre
      vec2 off = c * uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      // optical vignette (cos^4-ish), gentle
      float vig = 1.0 - uVig * pow(r2*2.0, 1.35);
      col *= clamp(vig, 0.0, 1.0);

      // grain: stronger in shadow, as on a real sensor
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      float g = hash(gl_FragCoord.xy + fract(uTime)*137.0) - 0.5;
      col += g * uGrain * (1.0 - smoothstep(0.0, 0.65, l));

      col += uLift * (1.0 - l);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,          // MSAA is done on the composer target instead
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
    depth: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.58;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  return renderer;
}

export function createComposer(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,                       // real MSAA — the edge quality lever
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const composer = new EffectComposer(renderer, rt);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom: high threshold, small radius. Only the meter glow and LEDs should
  // ever bloom — a scene-wide haze is the classic "WebGL demo" tell.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.26, 0.42, 2.30);
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const smaa = new SMAAPass(size.x, size.y);
  composer.addPass(smaa);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.setSize(window.innerWidth, window.innerHeight);
  setResolution(size.x, size.y);

  return { composer, renderPass, bloom, grade, smaa };
}

export function resize(renderer, composer, camera, extras) {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  setResolution(db.x, db.y);
  if (extras?.bloom) extras.bloom.resolution.set(db.x, db.y);
  if (extras?.smaa) extras.smaa.setSize(w, h);
}
