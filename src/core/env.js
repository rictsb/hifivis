import * as THREE from 'three';

/**
 * Procedural studio environment.
 *
 * This is the single biggest lever on whether the render reads as "product
 * photography" or "WebGL demo". Real high-end audio photography is lit with a
 * handful of very large, very soft sources plus one long narrow strip that
 * rakes across brushed metal to produce the signature elongated highlight.
 * We build that as an emissive-geometry scene and PMREM it, so every material
 * gets physically-consistent reflections instead of a generic gradient.
 */

function lightBox(w, h, d, colour, intensity) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshBasicMaterial({ color: colour, side: THREE.BackSide });
  m.color.multiplyScalar(intensity);
  return new THREE.Mesh(g, m);
}

function panel(w, h, colour, intensity) {
  const m = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide });
  m.color.multiplyScalar(intensity);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Vertical-gradient shell: charcoal ceiling, faint horizon lift, near-black floor. */
function shell() {
  const geo = new THREE.SphereGeometry(28, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vP;
      void main(){
        float y = normalize(vP).y;
        // near-black floor, subtle cool lift at the horizon, dim neutral ceiling
        vec3 floorC = vec3(0.006,0.007,0.009);
        vec3 horiz  = vec3(0.040,0.046,0.058);
        vec3 ceil   = vec3(0.018,0.019,0.022);
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

  // --- KEY: large soft box, high and to camera-left, slightly warm-neutral.
  const key = panel(9, 6.0, 0xfff3e2, 5.4);
  key.position.set(-6.2, 6.4, 3.4);
  key.lookAt(0, 0.9, 0);
  s.add(key);

  // --- STRIP: long, narrow, high, running left→right behind the system. This is
  // the one that draws the elongated streak down a brushed-aluminium fascia.
  const strip = panel(16, 0.62, 0xeaf4ff, 13.0);
  strip.position.set(0.6, 5.0, -4.6);
  strip.rotation.x = -Math.PI * 0.40;
  s.add(strip);

  // --- SECOND STRIP: shorter, camera-right and forward, catches side panels.
  const strip2 = panel(7.5, 0.42, 0xdfeaff, 9.0);
  strip2.position.set(6.4, 4.0, 1.2);
  strip2.rotation.set(-Math.PI * 0.16, -Math.PI * 0.5, 0);
  s.add(strip2);

  // --- FILL: broad, dim, front-low. Keeps shadow sides from going to mud.
  const fill = panel(12, 5, 0xbfd4ee, 0.62);
  fill.position.set(2.0, 1.4, 7.2);
  fill.lookAt(0, 1.0, 0);
  s.add(fill);

  // --- KICKER: tight warm source low-right, separates cabinets from backdrop.
  const kick = panel(2.6, 1.4, 0xffd9a8, 2.4);
  kick.position.set(4.4, 0.55, -2.4);
  kick.lookAt(0, 0.6, 0);
  s.add(kick);

  // --- NEGATIVE FILL: black flags either side keep the metal from washing out
  // and give the falloff that makes an object look solid.
  const flagL = panel(9, 7, 0x000000, 1);
  flagL.position.set(-7.6, 2.4, -0.6);
  flagL.rotation.y = Math.PI * 0.5;
  s.add(flagL);
  const flagR = panel(9, 7, 0x000000, 1);
  flagR.position.set(7.6, 2.4, -0.6);
  flagR.rotation.y = -Math.PI * 0.5;
  s.add(flagR);

  // --- CEILING BOUNCE: very dim, very large, prevents pure-black top faces.
  const ceil = panel(20, 20, 0x99aabb, 0.20);
  ceil.position.set(0, 7.4, 0);
  ceil.rotation.x = Math.PI * 0.5;
  s.add(ceil);

  // --- FLOOR CARD: the polished floor already reflects, but a dim upward card
  // gives under-chassis surfaces a believable lift.
  const under = panel(14, 12, 0x8899aa, 0.10);
  under.position.set(0, -0.35, 0);
  under.rotation.x = -Math.PI * 0.5;
  s.add(under);

  // A couple of dim volumes far back read as "room" in reflective surfaces.
  const backBox = lightBox(24, 9, 0.6, 0x0d1014, 1.0);
  backBox.position.set(0, 3.0, -9.5);
  s.add(backBox);

  return s;
}

export function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = buildEnvScene();
  const rt = pmrem.fromScene(envScene, 0.018, 0.1, 60);
  // free the throwaway scene
  envScene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  pmrem.dispose();
  return rt.texture;
}
