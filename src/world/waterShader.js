import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEFAULT_SIZE = 256;
const SLOPE_STRENGTH = 0.036;

// Integer wave-vector frequencies guarantee mathematically exact periodic tiling
// across [0, 1] in both U and V with zero seam discontinuity.
const RIPPLE_WAVES = Object.freeze([
  { kx: 2, ky: 1, amp: 0.16, phase: 0.4 },
  { kx: -1, ky: 3, amp: 0.15, phase: 1.7 },
  { kx: 3, ky: -2, amp: 0.14, phase: 2.9 },
  { kx: 4, ky: 3, amp: 0.11, phase: 0.9 },
  { kx: -3, ky: -4, amp: 0.09, phase: 4.1 },
  { kx: 5, ky: -2, amp: 0.08, phase: 5.2 },
  { kx: 6, ky: 5, amp: 0.055, phase: 1.3 },
  { kx: -5, ky: 7, amp: 0.045, phase: 3.6 },
]);

/**
 * Computes seamless tangent-space normal RGBA pixels for overlapping sinusoidal
 * water ripples using analytic partial derivatives of the periodic heightfield.
 */
export function generateRippleNormalPixels(size = DEFAULT_SIZE) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let dhdu = 0;
      let dhdv = 0;
      for (let w = 0; w < RIPPLE_WAVES.length; w++) {
        const wave = RIPPLE_WAVES[w];
        const arg = TAU * (wave.kx * u + wave.ky * v) + wave.phase;
        const slope = Math.cos(arg) * wave.amp * TAU;
        dhdu += slope * wave.kx;
        dhdv += slope * wave.ky;
      }
      const nx = -dhdu * SLOPE_STRENGTH;
      const ny = -dhdv * SLOPE_STRENGTH;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      pixels[idx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      pixels[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      pixels[idx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

function createRippleNormalTexture(size = DEFAULT_SIZE) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  image.data.set(generateRippleNormalPixels(size));
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export const DEEP_POND_WATER_COLOR = 0x1d4f49;

/**
 * Enhances a Three.js MeshStandardMaterial for IU Lake ("Mofiz Lake") and campus
 * ponds with a seamless procedural ripple normal map and calibrated deep-pond
 * reflective PBR settings. Safely falls back in Node when `document` is absent.
 */
export function enhanceWaterMaterial(material) {
  let normalMap = material ? createRippleNormalTexture(DEFAULT_SIZE) : null;
  let elapsed = 0;
  let disposed = false;

  if (material) {
    if (material.color?.setHex) material.color.setHex(DEEP_POND_WATER_COLOR);
    material.roughness = 0.14;
    material.metalness = 0.16;
    material.envMapIntensity = 1.05;
    if (normalMap) {
      material.normalMap = normalMap;
      if (material.normalScale?.set) material.normalScale.set(0.16, 0.16);
      else material.normalScale = new THREE.Vector2(0.16, 0.16);
    }
    material.needsUpdate = true;
  }

  return {
    get normalMap() { return normalMap; },
    get active() { return Boolean(normalMap) && !disposed; },
    get disposed() { return disposed; },
    update(dt) {
      if (disposed || !normalMap) return;
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (!step) return;
      elapsed += step;
      // Dual-axis breeze scroll with subtle harmonic sway keeps ripples organic.
      const ox = normalMap.offset.x + step * 0.032 + Math.sin(elapsed * 0.45) * step * 0.008;
      const oy = normalMap.offset.y + step * 0.019 + Math.cos(elapsed * 0.37) * step * 0.006;
      normalMap.offset.x = ((ox % 1) + 1) % 1;
      normalMap.offset.y = ((oy % 1) + 1) % 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (normalMap) {
        if (material && material.normalMap === normalMap) {
          material.normalMap = null;
          material.needsUpdate = true;
        }
        normalMap.dispose();
        normalMap = null;
      }
    },
  };
}
