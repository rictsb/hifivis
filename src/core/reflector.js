import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { LAYOUT } from './layout.js';

/**
 * Glossy floor.
 *
 * A dark polished floor that reflects nothing is the single most reliable
 * "this is CGI" tell in this product category — an image-based environment map
 * gives a surface its sheen but cannot put the *object* in the floor. So we
 * render a real planar reflection and add it over the PBR floor.
 *
 * Notes:
 *  - It is ADDITIVE over the existing shaded floor, which is physically the
 *    right shape (specular adds to diffuse) and keeps the key light's shadows,
 *    which are cast onto the PBR floor underneath.
 *  - The scene renders LINEAR into the composer's HalfFloat target (three
 *    disables tone mapping when the destination is a render target), and the
 *    reflection target is linear too — so this shader must not tone map or
 *    encode. OutputPass does both, once, at the end.
 *  - Multi-tap blur with a radius that grows with distance approximates a
 *    microfacet lobe: near the object the reflection is tight, further away it
 *    smears. A perfect mirror floor looks cheap; a glossy one looks expensive.
 */

const FloorReflectionShader = {
  uniforms: {
    color: { value: new THREE.Color(0x8fa6bd) },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    uStrength: { value: 0.38 },
    uBlur: { value: 1.9 },
    uCentre: { value: new THREE.Vector3(0, 0, -2.4) },
    uFalloff: { value: 4.6 },
    uRes: { value: new THREE.Vector2(1024, 1024) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      vUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 color;
    uniform float uStrength, uBlur, uFalloff;
    uniform vec3 uCentre;
    uniform vec2 uRes;
    varying vec4 vUv;
    varying vec3 vW;

    vec3 tap(vec2 o){
      vec4 uv = vUv;
      uv.xy += o * uv.w;
      return texture2DProj(tDiffuse, uv).rgb;
    }

    void main() {
      // distance from the system centre, in metres → how much of the
      // reflection survives, and how far it smears
      float d = length(vW.xz - uCentre.xz);
      float fade = 1.0 - smoothstep(0.0, uFalloff, d);
      fade *= fade;

      float r = (uBlur * (0.35 + 1.65 * (1.0 - fade))) / uRes.y;
      vec3 c = tap(vec2(0.0)) * 0.28;
      c += tap(vec2( r,  0.0)) * 0.12;
      c += tap(vec2(-r,  0.0)) * 0.12;
      c += tap(vec2(0.0,  r )) * 0.12;
      c += tap(vec2(0.0, -r )) * 0.12;
      c += tap(vec2( r*0.7,  r*0.7)) * 0.06;
      c += tap(vec2(-r*0.7,  r*0.7)) * 0.06;
      c += tap(vec2( r*0.7, -r*0.7)) * 0.06;
      c += tap(vec2(-r*0.7, -r*0.7)) * 0.06;

      // the floor is a dielectric: it tints the reflection and never returns
      // more than it received
      c *= color;
      // soft knee — a mirrored meter glow must not clip to a white blob
      c = c / (1.0 + c * 0.42);

      gl_FragColor = vec4(max(c, 0.0) * uStrength * fade, 1.0);
    }`,
};

export function addGlossFloor(scene, renderer) {
  const geo = new THREE.PlaneGeometry(26, 26);
  const refl = new Reflector(geo, {
    clipBias: 0.0008,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x8fa6bd,
    shader: FloorReflectionShader,
  });
  refl.rotation.x = -Math.PI / 2;
  refl.position.y = 0.0016;
  refl.material.transparent = true;
  refl.material.blending = THREE.AdditiveBlending;
  refl.material.depthWrite = false;
  refl.material.toneMapped = false;
  refl.renderOrder = -1;
  refl.material.uniforms.uRes.value.set(1024, 1024);
  refl.material.uniforms.uCentre.value.set(0, 0, LAYOUT.rack.z + 0.9);
  scene.add(refl);
  return refl;
}
