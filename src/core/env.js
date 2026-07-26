import * as THREE from 'three';

/**
 * Procedural studio environment.
 *
 * This is the single biggest lever on whether the render reads as "product
 * photography" or "WebGL demo".
 *
 * Two rules, both learned the hard way:
 *
 * 1. THERE MUST BE LIGHT IN FRONT OF THE SUBJECT. A rig of top, back and side
 *    softboxes leaves every camera-facing surface reflecting a black hemisphere,
 *    so brushed aluminium renders at ~10 % grey and reads as dark plastic. Real
 *    product sets are built around a large frontal source just off the lens axis
 *    — that is what fills a fascia and gives lacquer its depth.
 *
 * 2. EVERY EMITTER NEEDS SOFT EDGES. A flat untextured plane reflects as a
 *    hard-edged block of one value — literal white rectangles pasted on dust
 *    caps and driver domes. Real softboxes have a diffusion panel that is
 *    brightest at the centre and rolls off at the frame, and the reflection of
 *    that roll-off is what makes a highlight look photographed.
 */

// --- soft-edged emitter texture ---------------------------------------------
let _diffuse = null;
/**
 * Softbox diffusion.
 *
 * The first version of this used `min(u, v)` — an L∞ metric — so its level sets
 * were SQUARES, and it held a flat plateau across most of the panel. Anything
 * with a clearcoat therefore mirrored the source as a rectangle with corners,
 * and every specular event in the render was either that blown plateau or
 * nothing. That is why the histogram was bimodal with no mid-grey.
 *
 * A real softbox has a diffusion panel that is brightest near the middle and
 * falls off continuously to the frame — elliptical level sets, no plateau, no
 * corners. Mirrored in a cabinet cheek that reads as a long unbroken gradient
 * running from soft white, through several stops of grey, into the flag: the
 * ramp a product render lives in.
 */
function diffusionMap(size = 256) {
  if (_diffuse) return _diffuse;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // normalised position, −1 … +1, centre at 0
      const u = (x / (size - 1)) * 2 - 1;
      const v = (y / (size - 1)) * 2 - 1;
      // L2 (elliptical) radius, 1.0 at the mid-edge. On a stretched plane this
      // becomes an ellipse in world space — exactly a strip softbox's falloff.
      const r = Math.min(1, Math.hypot(u, v) * 0.86);
      // continuous ramp, no plateau: bright core, long tail, hard zero at rim
      const core = Math.pow(1 - r, 1.30);
      const rim = 1 - Math.pow(r, 6);          // guarantees 0 at the very edge
      const val = Math.max(0, Math.min(1, core * rim));
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = (val * 255) | 0;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  _diffuse = t;
  return t;
}

/** A softbox: a plane whose emission falls off toward its own edges. */
function box(w, h, colour, intensity) {
  const m = new THREE.MeshBasicMaterial({
    color: colour, side: THREE.DoubleSide, map: diffusionMap(),
  });
  m.color.multiplyScalar(intensity);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** A flag: pure black, no texture. Subtracts light, shapes falloff. */
function flag(w, h) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }),
  );
}

/** Vertical-gradient shell: dim neutral ceiling, faint horizon, near-black floor. */
function shell() {
  const geo = new THREE.SphereGeometry(30, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vP;
      void main(){
        float y = normalize(vP).y;
        vec3 floorC = vec3(0.010,0.011,0.014);
        vec3 horiz  = vec3(0.055,0.062,0.076);
        vec3 ceil   = vec3(0.030,0.032,0.036);
        vec3 c = mix(floorC, horiz, smoothstep(-0.55, 0.02, y));
        c = mix(c, ceil, smoothstep(0.02, 0.75, y));
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildEnvScene() {
  const s = new THREE.Scene();
  s.add(shell());

  // ======================= FRONT HEMISPHERE ================================
  // Everything the camera sees reflects this half. Without it the whole scene
  // is dark plastic.

  // BEAUTY: the big frontal source, just above and slightly camera-left of the
  // lens axis. This is the light that actually fills a brushed fascia.
  const beauty = box(11, 6.5, 0xfff4e6, 8.4);
  beauty.position.set(-1.6, 4.1, 5.0);
  beauty.lookAt(0, 0.85, -2.4);
  s.add(beauty);

  // FRONT STRIP: wide, shallow, in front and low. On a vertical brushed panel
  // this draws the long horizontal streak that says "machined aluminium".
  const frontStrip = box(18, 2.60, 0xf2f6ff, 6.2);
  frontStrip.position.set(0.4, 2.35, 4.2);
  frontStrip.rotation.x = -0.14;
  s.add(frontStrip);

  // FRONT-LEFT WRAP: broad, dim, low — keeps the left cheeks of every chassis
  // from falling into the shadow side entirely.
  const wrapL = box(7, 5, 0xd8e4f4, 3.5);
  wrapL.position.set(-6.4, 1.9, 3.0);
  wrapL.lookAt(0, 0.9, -2.4);
  s.add(wrapL);

  // FRONT-RIGHT WRAP: tighter and warmer, opposite side.
  const wrapR = box(5.5, 4.2, 0xffe6c8, 2.8);
  wrapR.position.set(6.6, 2.1, 2.4);
  wrapR.lookAt(0, 0.9, -2.4);
  s.add(wrapR);

  // ======================= TOP AND BACK ====================================

  // TOP STRIP: long, narrow, high, behind — the rim/edge definer.
  const strip = box(17, 2.20, 0xeaf4ff, 6.9);
  strip.position.set(0.6, 5.2, -4.4);
  strip.rotation.x = -Math.PI * 0.40;
  s.add(strip);

  // SIDE STRIP: camera-right and back, rakes the side panels.
  const strip2 = box(8, 1.35, 0xdfeaff, 5.4);
  strip2.position.set(6.8, 4.2, 0.6);
  strip2.rotation.set(-Math.PI * 0.16, -Math.PI * 0.5, 0);
  s.add(strip2);

  // KICKER: tight warm source low-right behind, separates cabinets from backdrop.
  const kick = box(3.0, 1.6, 0xffd9a8, 4.7);
  kick.position.set(4.6, 0.6, -3.0);
  kick.lookAt(0, 0.6, -1.0);
  s.add(kick);

  // CEILING BOUNCE: very dim, very large — no pure-black top faces.
  const ceil = box(22, 22, 0x9fb0c2, 0.48);
  ceil.position.set(0, 7.6, -0.5);
  ceil.rotation.x = Math.PI * 0.5;
  s.add(ceil);

  // FLOOR CARD: dim upward lift so under-chassis surfaces are not voids.
  const under = box(16, 14, 0x8fa2b6, 0.26);
  under.position.set(0, -0.45, -1.0);
  under.rotation.x = -Math.PI * 0.5;
  s.add(under);

  // ======================= NEGATIVE FILL ===================================
  // Black flags well outboard. They give the falloff that makes an object look
  // solid — but they must not swallow the front hemisphere, so they sit wide
  // and slightly behind the frontal sources.
  const flagL = flag(8, 7);
  flagL.position.set(-8.8, 2.6, -1.2);
  flagL.rotation.y = Math.PI * 0.5;
  s.add(flagL);
  const flagR = flag(8, 7);
  flagR.position.set(8.8, 2.6, -1.2);
  flagR.rotation.y = -Math.PI * 0.5;
  s.add(flagR);
  // A gobo directly above the lens keeps the very top of the frame from
  // flattening out, and stops the beauty box wrapping right over the subject.
  const gobo = flag(6, 4);
  gobo.position.set(0, 6.6, 4.4);
  gobo.rotation.x = Math.PI * 0.5;
  s.add(gobo);

  return s;
}

export function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = buildEnvScene();
  const rt = pmrem.fromScene(envScene, 0.022, 0.1, 70);
  envScene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  pmrem.dispose();
  return rt.texture;
}
