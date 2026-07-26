import * as THREE from 'three';

/** Canvas-based procedural textures. All self-contained, no image files. */

const cache = new Map();
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { rep = [1, 1], srgb = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// --- value noise -------------------------------------------------------------
function hash2(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}
function fbm(x, y, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
  return v;
}

/**
 * Brushed-metal roughness map. Fine anisotropic scratches running along +U.
 * Feeding this to `roughnessMap` (with material.anisotropy) is what turns a
 * plastic-looking slab into machined aluminium.
 */
export function brushedRough(size = 1024, base = 0.30, amt = 0.16, streak = 340) {
  return memo(`br${size}_${base}_${amt}_${streak}`, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // long thin streaks: high frequency across V, very low across U
        const n = fbm(x / streak, y * 1.9, 3) * 0.62 + vnoise(x / 40, y * 6.5) * 0.38;
        // sparse deeper scratches
        const sc = vnoise(x / 900, y * 26) > 0.955 ? 0.10 : 0;
        const v = Math.max(0, Math.min(1, base + (n - 0.5) * amt * 2 + sc));
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = (v * 255) | 0; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Matching normal map for the brush grain — subtle, mostly along V. */
export function brushedNormal(size = 1024, strength = 0.5, streak = 340) {
  return memo(`bn${size}_${strength}_${streak}`, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const h = (x, y) => fbm(x / streak, y * 1.9, 3) * 0.6 + vnoise(x / 40, y * 6.5) * 0.4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength * 0.15;
        const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        d[i] = ((-dx / l * 0.5 + 0.5) * 255) | 0;
        d[i + 1] = ((-dy / l * 0.5 + 0.5) * 255) | 0;
        d[i + 2] = ((1 / l * 0.5 + 0.5) * 255) | 0;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Fine bead-blast / anodised micro-texture: isotropic, very tight. */
export function anodisedRough(size = 512, base = 0.42, amt = 0.10) {
  return memo(`an${size}_${base}_${amt}`, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 3.1, y / 3.1, 3) * 0.7 + vnoise(x / 0.9, y / 0.9) * 0.3;
        const v = Math.max(0, Math.min(1, base + (n - 0.5) * amt * 2));
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = (v * 255) | 0; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, { rep: [4, 4] });
  });
}

export function anodisedNormal(size = 512, strength = 0.35) {
  return memo(`ann${size}_${strength}`, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const h = (x, y) => fbm(x / 3.1, y / 3.1, 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
        const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        d[i] = ((-dx / l * 0.5 + 0.5) * 255) | 0;
        d[i + 1] = ((-dy / l * 0.5 + 0.5) * 255) | 0;
        d[i + 2] = ((1 / l * 0.5 + 0.5) * 255) | 0;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, { rep: [4, 4] });
  });
}

/** Woven grille cloth: alpha-free, just colour + roughness + normal-ish weave. */
export function clothWeave(size = 512) {
  return memo('cloth' + size, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const p = 6; // weave pitch in px
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const warp = Math.sin((x / p) * Math.PI * 2) * 0.5 + 0.5;
        const weft = Math.sin((y / p) * Math.PI * 2) * 0.5 + 0.5;
        const over = ((Math.floor(x / p) + Math.floor(y / p)) % 2) === 0;
        const v = over ? warp : weft;
        const n = vnoise(x / 2.2, y / 2.2) * 0.18;
        const l = (0.10 + v * 0.13 + n * 0.10);
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = (l * 255) | 0; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, { rep: [26, 26], srgb: true });
  });
}

/** Walnut / rosewood veneer: streaked grain with figure. */
export function veneer(size = 1024, hue = [0.42, 0.24, 0.15]) {
  return memo('ven' + size + hue.join(), () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // grain lines run along V, warped by low-frequency noise
        const warp = fbm(x / 180, y / 620, 3) * 46;
        const rings = Math.sin((x + warp) * 0.13) * 0.5 + 0.5;
        const fig = fbm(x / 26, y / 240, 4);
        const v = 0.42 + rings * 0.30 + fig * 0.28;
        const i = (y * size + x) * 4;
        d[i] = Math.min(255, hue[0] * v * 255 * 1.7) | 0;
        d[i + 1] = Math.min(255, hue[1] * v * 255 * 1.7) | 0;
        d[i + 2] = Math.min(255, hue[2] * v * 255 * 1.7) | 0;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, { rep: [1, 1], srgb: true });
  });
}

/** Radial gradient sprite used for glows, bloom seeds and soft contact shadows. */
export function radialSprite(size = 256, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', pow = 1) {
  return memo(`rs${size}${inner}${outer}${pow}`, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      grd.addColorStop(t, i === 0 ? inner : (i === 16 ? outer : mixCss(inner, outer, Math.pow(t, pow))));
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
function mixCss(a, b, t) {
  const pa = a.match(/[\d.]+/g).map(Number), pb = b.match(/[\d.]+/g).map(Number);
  const p = [0, 1, 2, 3].map((i) => (pa[i] ?? 1) + ((pb[i] ?? 1) - (pa[i] ?? 1)) * t);
  return `rgba(${p[0] | 0},${p[1] | 0},${p[2] | 0},${p[3].toFixed(3)})`;
}

/** Soft elliptical blob for a fake contact/ambient shadow under a chassis. */
export function blobShadow(size = 256, squash = 1) {
  return memo('bs' + size + squash, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    g.clearRect(0, 0, size, size);
    g.save();
    g.translate(size / 2, size / 2);
    g.scale(1, squash);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    grd.addColorStop(0.0, 'rgba(0,0,0,0.92)');
    grd.addColorStop(0.30, 'rgba(0,0,0,0.66)');
    grd.addColorStop(0.58, 'rgba(0,0,0,0.28)');
    grd.addColorStop(0.80, 'rgba(0,0,0,0.07)');
    grd.addColorStop(1.0, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, size / 2, 0, Math.PI * 2); g.fill();
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/**
 * Contact shadow for MULTIPLY blending: WHITE outside the blob (multiply →
 * no change, so the quad has no visible rectangle) shading to dark at the
 * centre. This darkens whatever is beneath it, including the reflective floor.
 */
export function blobShadowMul(size = 256, strength = 0.8) {
  return memo('bsm' + size + strength, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const k = Math.max(0, Math.min(1, strength));
    const stop = (t, a) => {
      const v = Math.round(255 * (1 - a * k));
      grd.addColorStop(t, `rgb(${v},${v},${v})`);
    };
    stop(0.00, 0.94); stop(0.24, 0.78); stop(0.46, 0.46);
    stop(0.68, 0.18); stop(0.86, 0.045); stop(1.00, 0.0);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Green PCB with copper traces + silkscreen — used inside opened chassis. */
export function pcb(size = 1024, base = '#0d2a1c') {
  return memo('pcb' + size + base, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    // ground pour hatch
    g.strokeStyle = 'rgba(255,255,255,0.022)'; g.lineWidth = 1;
    for (let i = -size; i < size * 2; i += 7) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + size, size); g.stroke();
    }
    // traces
    const rnd = (n) => { let s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(196,146,72,${0.30 + rnd(i) * 0.34})`;
      g.lineWidth = 1 + rnd(i * 3) * 2.6;
      let x = rnd(i * 7) * size, y = rnd(i * 11) * size;
      g.beginPath(); g.moveTo(x, y);
      const segs = 2 + ((rnd(i * 13) * 4) | 0);
      for (let s = 0; s < segs; s++) {
        const horiz = rnd(i * 17 + s) > 0.5;
        const len = 18 + rnd(i * 19 + s) * 130;
        const dir = rnd(i * 23 + s) > 0.5 ? 1 : -1;
        if (horiz) x += len * dir; else y += len * dir;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // pads
    for (let i = 0; i < 380; i++) {
      const x = rnd(i * 31) * size, y = rnd(i * 37) * size;
      g.fillStyle = 'rgba(214,168,88,0.85)';
      g.beginPath(); g.arc(x, y, 2.2 + rnd(i * 41) * 2.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = base;
      g.beginPath(); g.arc(x, y, 0.9 + rnd(i * 43) * 0.8, 0, Math.PI * 2); g.fill();
    }
    // silkscreen
    g.fillStyle = 'rgba(230,235,240,0.30)';
    for (let i = 0; i < 90; i++) {
      const x = rnd(i * 53) * size, y = rnd(i * 59) * size;
      g.fillRect(x, y, 12 + rnd(i * 61) * 26, 1.2);
    }
    return tex(c, { rep: [1, 1], srgb: true });
  });
}

/** Vinyl record surface: dense concentric groove modulation. */
export function vinylGrooves(size = 2048, ri = 0.24, ro = 0.98) {
  return memo(`vg${size}${ri}${ro}`, () => {
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const cx = size / 2, cy = size / 2, R = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.hypot(dx, dy) / R;
        let v;
        if (r > ro || r < 0.12) v = 0.62;             // rim / label — smooth
        else if (r < ri) v = 0.72;                     // paper label
        else {
          const groove = Math.sin(r * size * 0.62) * 0.5 + 0.5;
          v = 0.16 + groove * 0.30;
        }
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = (v * 255) | 0; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}
