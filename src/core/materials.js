import * as THREE from 'three';
import * as T from './tex.js';

/**
 * Shared material library. Every stage MUST pull from here rather than
 * inventing its own MeshStandardMaterial, otherwise the render loses the
 * single-lighting-setup coherence that makes it read as photography.
 *
 * Physical notes:
 *  - metals are metalness 1.0 with roughness driven by a map (never a flat scalar)
 *  - painted/anodised surfaces are dielectrics with a clearcoat
 *  - nothing is pure black (0.02 floor) and nothing is pure white (albedo ≤ 0.85)
 */

const M = {};
let built = false;

export function buildMaterials() {
  if (built) return M;
  built = true;

  const brRough = T.brushedRough(1024, 0.26, 0.20);
  const brNorm = T.brushedNormal(1024, 0.55);
  const anRough = T.anodisedRough(512, 0.40, 0.11);
  const anNorm = T.anodisedNormal(512, 0.30);

  // ---- METALS ---------------------------------------------------------------

  /** Brushed aluminium fascia — the McIntosh/Devialet front panel look. */
  M.alu = new THREE.MeshPhysicalMaterial({
    color: 0xb9bcc0, metalness: 1.0, roughness: 0.26,
    roughnessMap: brRough, normalMap: brNorm,
    normalScale: new THREE.Vector2(0.30, 0.30),
    anisotropy: 0.72, anisotropyRotation: 0,
    envMapIntensity: 1.0,
  });

  /** Same, brushed vertically (rotate the maps 90°) for side cheeks. */
  M.aluV = M.alu.clone();
  M.aluV.anisotropyRotation = Math.PI / 2;

  /** Dark machined aluminium — bead-blasted black anodised chassis. */
  M.anodBlack = new THREE.MeshPhysicalMaterial({
    color: 0x1c1e21, metalness: 1.0, roughness: 0.42,
    roughnessMap: anRough, normalMap: anNorm,
    normalScale: new THREE.Vector2(0.35, 0.35),
    anisotropy: 0.25, envMapIntensity: 0.95,
  });

  /** Mid-grey anodised — heatsinks, brackets, internal frames. */
  M.anodGrey = M.anodBlack.clone();
  M.anodGrey.color.setHex(0x4a4e54);
  M.anodGrey.roughness = 0.48;

  /** Polished / near-mirror chrome for trim rings and knob collars. */
  M.chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd8dade, metalness: 1.0, roughness: 0.045,
    envMapIntensity: 1.25,
  });

  /** Stainless — fasteners, spikes, tonearm hardware. */
  M.steel = new THREE.MeshPhysicalMaterial({
    color: 0x9ea3a9, metalness: 1.0, roughness: 0.20,
    roughnessMap: anRough, envMapIntensity: 1.0,
  });

  /** Gold plating — RCA/XLR pins, binding posts, cartridge pins. */
  M.gold = new THREE.MeshPhysicalMaterial({
    color: 0xd9b166, metalness: 1.0, roughness: 0.135, envMapIntensity: 1.2,
  });

  /** Bare copper — transformer windings, voice coil, bus bars. */
  M.copper = new THREE.MeshPhysicalMaterial({
    color: 0xb2643a, metalness: 1.0, roughness: 0.30, envMapIntensity: 1.0,
  });

  /** Enamelled magnet wire — copper under a translucent amber varnish. */
  M.magnetWire = new THREE.MeshPhysicalMaterial({
    color: 0x8e4f2a, metalness: 0.85, roughness: 0.24,
    clearcoat: 0.8, clearcoatRoughness: 0.14, envMapIntensity: 1.0,
  });

  /** Transformer laminations — dark grain-oriented silicon steel. */
  M.lamination = new THREE.MeshPhysicalMaterial({
    color: 0x33373c, metalness: 1.0, roughness: 0.55,
    roughnessMap: anRough, envMapIntensity: 0.8,
  });

  // ---- DIELECTRICS ----------------------------------------------------------

  /** Automotive gloss black — Wilson-style cabinet lacquer. Deep, wet. */
  M.pianoBlack = new THREE.MeshPhysicalMaterial({
    color: 0x08090b, metalness: 0.0, roughness: 0.30,
    clearcoat: 1.0, clearcoatRoughness: 0.028,
    envMapIntensity: 1.15, reflectivity: 0.6,
  });

  /** Deep graphite metallic paint — cabinet alternative, less mirror. */
  M.graphite = new THREE.MeshPhysicalMaterial({
    color: 0x1a1c20, metalness: 0.55, roughness: 0.30,
    clearcoat: 1.0, clearcoatRoughness: 0.09,
    envMapIntensity: 1.0,
  });

  /** Satin black plastic — trim, driver baskets, cable jackets. */
  M.plastic = new THREE.MeshPhysicalMaterial({
    color: 0x121417, metalness: 0.0, roughness: 0.52,
    clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.7,
  });

  /** Soft rubber — surrounds, feet, grommets. Matte, slight sheen. */
  M.rubber = new THREE.MeshPhysicalMaterial({
    color: 0x0e0f11, metalness: 0.0, roughness: 0.82,
    sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x2a2d33),
    envMapIntensity: 0.5,
  });

  /** Front glass / smoked acrylic over displays. */
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a0c0f, metalness: 0.0, roughness: 0.035,
    transmission: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.02,
    envMapIntensity: 1.3, opacity: 1,
  });

  /** True transmissive glass — meter lenses, dust cover. */
  M.clearGlass = new THREE.MeshPhysicalMaterial({
    color: 0xeef2f6, metalness: 0.0, roughness: 0.02,
    transmission: 0.94, thickness: 0.004, ior: 1.52,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    envMapIntensity: 1.2, transparent: true,
  });

  /** Grille cloth — woven, sheen-heavy, no specular highlight. */
  M.cloth = new THREE.MeshPhysicalMaterial({
    color: 0x14161a, metalness: 0.0, roughness: 0.95,
    map: T.clothWeave(512),
    sheen: 1.0, sheenRoughness: 0.85, sheenColor: new THREE.Color(0x3a4048),
    envMapIntensity: 0.55,
  });

  /** Paper/pulp cone — matte, fibrous. */
  M.cone = new THREE.MeshPhysicalMaterial({
    color: 0x17191d, metalness: 0.0, roughness: 0.88,
    sheen: 0.55, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x33383f),
    envMapIntensity: 0.6, side: THREE.DoubleSide,
  });

  /** Woven-composite cone (carbon/aramid) — visible weave, semi-gloss. */
  M.coneWeave = new THREE.MeshPhysicalMaterial({
    color: 0x1b1e23, metalness: 0.1, roughness: 0.42,
    map: T.clothWeave(512), clearcoat: 0.55, clearcoatRoughness: 0.22,
    envMapIntensity: 0.85, side: THREE.DoubleSide,
  });

  /** Beryllium / metal dome tweeter — bright, smooth. */
  M.dome = new THREE.MeshPhysicalMaterial({
    color: 0xc3bda8, metalness: 1.0, roughness: 0.16, envMapIntensity: 1.15,
  });

  /** Walnut veneer for the plinth / rack shelves. */
  M.wood = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: T.veneer(1024), metalness: 0.0, roughness: 0.36,
    clearcoat: 0.85, clearcoatRoughness: 0.10, envMapIntensity: 0.85,
  });

  /** Green PCB. */
  M.pcb = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: T.pcb(1024), metalness: 0.0, roughness: 0.42,
    clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.7,
  });

  /** Black vinyl record. */
  M.vinyl = new THREE.MeshPhysicalMaterial({
    color: 0x090a0c, metalness: 0.0, roughness: 0.20,
    roughnessMap: T.vinylGrooves(2048),
    clearcoat: 0.5, clearcoatRoughness: 0.12, envMapIntensity: 0.9,
  });

  /** The floor: dark polished concrete/stone with a broad reflection. */
  M.floor = new THREE.MeshPhysicalMaterial({
    color: 0x121418, metalness: 0.0, roughness: 0.18,
    roughnessMap: T.anodisedRough(512, 0.22, 0.12),
    clearcoat: 0.85, clearcoatRoughness: 0.10, envMapIntensity: 1.05,
  });

  // ---- EMISSIVE / UI --------------------------------------------------------

  /** Backlit meter glass — the signature cyan. Feeds bloom. */
  M.meterGlow = new THREE.MeshBasicMaterial({ color: 0x2f9fdb, toneMapped: false });
  /** Small status LED. */
  M.ledCyan = new THREE.MeshBasicMaterial({ color: 0x63c8f5, toneMapped: false });
  M.ledAmber = new THREE.MeshBasicMaterial({ color: 0xf5b45e, toneMapped: false });
  M.ledGreen = new THREE.MeshBasicMaterial({ color: 0x74d69c, toneMapped: false });
  M.ledRed = new THREE.MeshBasicMaterial({ color: 0xf2795c, toneMapped: false });

  return M;
}

export function mats() {
  return built ? M : buildMaterials();
}

/** Apply the PMREM environment to every material in the library. */
export function applyEnv(env) {
  const m = mats();
  for (const k in m) if (m[k].isMeshStandardMaterial || m[k].isMeshPhysicalMaterial) m[k].envMap = env;
}

/** Palette used consistently by diagrams and UI. Keep in sync with app.css. */
export const PAL = {
  cy: 0x5cc0f2,      // signal / cool accent
  cyDim: 0x1e4a63,
  am: 0xf0b35a,      // energy / heat / current
  amDim: 0x6b4d24,
  gr: 0x7fd6a2,      // correct / verified
  rd: 0xf2795c,      // warning / myth
  vi: 0xa88ff0,      // secondary trace
  ink: 0xeef0f4,
  ink3: 0x6f757e,
  grid: 0x2a2f36,
};
