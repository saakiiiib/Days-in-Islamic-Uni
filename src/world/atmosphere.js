import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const SKY_SCALE = 2400;
const SUN_DISTANCE = 400000;
const ENV_DOME_RADIUS = 40;
const DEFAULT_ENV_INTENSITY = 0.55;

const LEGACY_SKY_DEFAULTS = Object.freeze({
  clear: {
    turbidity: 3.0,
    rayleigh: 1.4,
    mieCoefficient: 0.0035,
    mieDirectionalG: 0.78,
    cloudOpacity: 0.28,
    cloudTint: 0xffffff,
    exposure: 0.92,
    envColors: { zenith: 0x3b7ec7, horizon: 0xcbe0ee, ground: 0x5c6e4b },
  },
  hazy: {
    turbidity: 5.8,
    rayleigh: 1.3,
    mieCoefficient: 0.0075,
    mieDirectionalG: 0.82,
    cloudOpacity: 0.36,
    cloudTint: 0xf4f4ef,
    exposure: 0.90,
    envColors: { zenith: 0x5d8eb8, horizon: 0xc5d2d5, ground: 0x626b54 },
  },
  overcast: {
    turbidity: 9.5,
    rayleigh: 0.78,
    mieCoefficient: 0.013,
    mieDirectionalG: 0.72,
    cloudOpacity: 0.58,
    cloudTint: 0xd9dddd,
    exposure: 0.88,
    envColors: { zenith: 0x8a9aa0, horizon: 0xc2c8c8, ground: 0x62685a },
  },
});

const VISIBLE_SKY_TUNING = Object.freeze({
  morning: { skyGain: 0.42, horizonBlend: 0.88, sunGlowHex: 0xffe4b8, sunGlowStrength: 0.24 },
  midday: { skyGain: 0.26, horizonBlend: 0.85, sunGlowHex: 0xfff3de, sunGlowStrength: 0.12 },
  golden: { skyGain: 0.44, horizonBlend: 0.92, sunGlowHex: 0xffb35c, sunGlowStrength: 0.85 },
  dusk: { skyGain: 1.05, horizonBlend: 0.84, sunGlowHex: 0xf28246, sunGlowStrength: 0.88 },
  default: { skyGain: 0.34, horizonBlend: 0.86, sunGlowHex: 0xfff0d4, sunGlowStrength: 0.18 },
});

function hasWebGLContext(renderer) {
  if (!renderer || typeof renderer.getContext !== 'function') return false;
  try {
    return Boolean(renderer.getContext());
  } catch {
    return false;
  }
}

function periodicHash(ix, iy, period) {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let h = (x * 374761393 + y * 668265263 + period * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function periodicNoise2D(u, v, period) {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Quintic smoothstep for isotropic C2-continuous cloud lobes
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = periodicHash(ix, iy, period);
  const n10 = periodicHash(ix + 1, iy, period);
  const n01 = periodicHash(ix, iy + 1, period);
  const n11 = periodicHash(ix + 1, iy + 1, period);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generates a seamless tileable RGBA procedural cloud texture on an HTML canvas.
 * Returns null safely in non-browser / headless environments without 2D canvas.
 */
function createCloudCanvasTexture(size = 256) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Integer-frequency periodic octaves guarantee exact wraparound tiling.
      const base = periodicNoise2D(u, v, 4) * 0.50
        + periodicNoise2D(u, v, 8) * 0.27
        + periodicNoise2D(u, v, 16) * 0.15
        + periodicNoise2D(u, v, 32) * 0.08;
      const wisps = periodicNoise2D(u + 0.37, v + 0.19, 6);
      const shaped = base * 0.82 + wisps * 0.18;
      const alpha = smoothstep(0.46, 0.80, shaped);
      // Soft self-shading: denser cloud cores pick up a slightly cooler belly tint.
      const coreShade = 255 - Math.round(smoothstep(0.55, 0.92, shaped) * 26);
      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, coreShade + 6);
      data[idx + 1] = Math.min(255, coreShade + 3);
      data[idx + 2] = coreShade;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 1D vertical alpha ramp texture bound to uv1 so clouds stay seamless while
 * scrolling on channel 0 and dissolve cleanly into horizon haze near elevation 0.
 */
function createHorizonFadeTexture(height = 64) {
  const data = new Uint8Array(height * 4);
  for (let i = 0; i < height; i++) {
    const v = i / (height - 1);
    const fade = Math.round(smoothstep(0.02, 0.42, v) * 255);
    const idx = i * 4;
    data[idx] = fade;
    data[idx + 1] = fade;
    data[idx + 2] = fade;
    data[idx + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 1, height, THREE.RGBAFormat);
  texture.channel = 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createCloudDome() {
  const cloudTexture = createCloudCanvasTexture(256);
  if (!cloudTexture) return null;
  const horizonMask = createHorizonFadeTexture(64);
  // Wide overhead sky cap well inside the 2200 m gameplay far plane.
  const radius = 1550;
  const geometry = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.48);
  geometry.scale(1, 0.36, 1);
  const pos = geometry.getAttribute('position');
  const uv0 = new Float32Array(pos.count * 2);
  const uv1 = new Float32Array(pos.count * 2);
  const maxY = radius * 0.36;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Planar overhead UVs avoid polar pinching at the zenith.
    uv0[i * 2] = x / 1100 + 0.5;
    uv0[i * 2 + 1] = z / 1100 + 0.5;
    // Normalized dome elevation for the static horizon fade mask.
    uv1[i * 2] = 0.5;
    uv1[i * 2 + 1] = Math.max(0, Math.min(1, y / maxY));
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv0, 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
  const material = new THREE.MeshBasicMaterial({
    map: cloudTexture,
    alphaMap: horizonMask,
    color: 0xffffff,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'campus-atmosphere-clouds';
  mesh.position.set(0, 35, 0);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, cloudTexture, horizonMask };
}

/**
 * Calibrates the visible Three.js Preetham Sky dome for scene exposures around
 * 0.90-0.98 (Three.js Sky's stock radiance expects ~0.5 exposure and otherwise
 * clips to pale beige/white under ACES Filmic). Preserves azure zenith, warm
 * golden/twilight horizon glow, and seamless distance-fog matching at y <= 0.
 */
function calibrateVisibleSkyMaterial(material) {
  if (!material || !material.uniforms || typeof material.fragmentShader !== 'string') return;
  material.uniforms.uSkyGain = { value: 0.44 };
  material.uniforms.uHorizonColor = { value: new THREE.Color(0xd8c3a5) };
  material.uniforms.uHorizonBlend = { value: 0.92 };
  material.uniforms.uSunGlowColor = { value: new THREE.Color(0xffb35c) };
  material.uniforms.uSunGlowStrength = { value: 0.85 };

  const uniformAnchor = 'uniform float time;';
  const outputAnchor = 'gl_FragColor = vec4( texColor, 1.0 );';
  if (!material.fragmentShader.includes(uniformAnchor) || !material.fragmentShader.includes(outputAnchor)) {
    return;
  }

  const extraUniforms = /* glsl */`
    uniform float time;
    uniform float uSkyGain;
    uniform vec3 uHorizonColor;
    uniform float uHorizonBlend;
    uniform vec3 uSunGlowColor;
    uniform float uSunGlowStrength;
  `;

  const calibrationBlock = /* glsl */`
    vec3 skyScatter = max( texColor - sundiscColor, vec3( 0.0 ) );
    skyScatter *= uSkyGain;
    float skyElev = max( direction.y, 0.0 );
    float skySunAlign = pow( max( cosTheta, 0.0001 ), 2.2 );
    float skyWarmMask = clamp( skySunAlign * pow( max( 1.0 - min( skyElev, 1.0 ), 0.0001 ), 1.35 ) * uSunGlowStrength, 0.0, 1.0 );
    vec3 skyWarmTransmittance = mix( vec3( 1.0 ), vec3( 1.25, 0.78, 0.32 ), skyWarmMask );
    skyScatter *= skyWarmTransmittance;
    float skyScatterLum = dot( skyScatter, vec3( 0.2126, 0.7152, 0.0722 ) );
    if ( skyScatterLum > 0.65 ) {
      float skyCompressedLum = 0.65 + log( 1.0 + ( skyScatterLum - 0.65 ) ) * 0.32;
      skyScatter *= skyCompressedLum / skyScatterLum;
    }
    float skyHorizBand = pow( max( 1.0 - min( skyElev, 1.0 ), 0.0001 ), 4.2 );
    skyScatter = mix( skyScatter, uHorizonColor, clamp( skyHorizBand * uHorizonBlend, 0.0, 0.95 ) );
    skyScatter = mix( skyScatter, uSunGlowColor * 0.95, clamp( skyWarmMask * 0.48, 0.0, 0.56 ) );
    if ( direction.y < 0.0 ) {
      skyScatter = mix( skyScatter, uHorizonColor, smoothstep( 0.0, 0.08, -direction.y ) );
    }
    vec3 skyCalibratedDisc = min( sundiscColor * 0.08, vec3( 5.0 ) );
    texColor = skyScatter + skyCalibratedDisc;
    gl_FragColor = vec4( texColor, 1.0 );
  `;

  material.fragmentShader = material.fragmentShader
    .replace(uniformAnchor, extraUniforms)
    .replace(outputAnchor, calibrationBlock);
  material.needsUpdate = true;
}

/**
 * Calibrated LDR gradient dome rendered into PMREMGenerator to produce clean
 * ~0.4-1.4 linear sky-to-horizon-to-ground IBL with a bounded <= 2.2 solar
 * specular highlight (avoiding Preetham Sky's unclamped 15-50+ HDR washout).
 */
function createEnvGradientDome() {
  const geometry = new THREE.SphereGeometry(ENV_DOME_RADIUS, 32, 16);
  const material = new THREE.ShaderMaterial({
    name: 'CampusEnvGradientShader',
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uZenithColor: { value: new THREE.Color(0x4b7cb8) },
      uHorizonColor: { value: new THREE.Color(0xebc596) },
      uGroundColor: { value: new THREE.Color(0x5b5d44) },
      uSunDirection: { value: new THREE.Vector3(0.25, 0.72, 0.64).normalize() },
      uSunColor: { value: new THREE.Color(0xffcf87) },
      uSunIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = normalize( position );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform float uSunIntensity;
      varying vec3 vDirection;

      void main() {
        vec3 dir = normalize( vDirection );
        float y = dir.y;

        // Clean physically-balanced sky-to-horizon-to-ground gradient in linear space
        vec3 zenith = uZenithColor * 1.25;
        vec3 horizon = uHorizonColor * 1.25;
        vec3 ground = uGroundColor * 1.1;

        vec3 skyCol = mix( horizon, zenith, pow( max( clamp( y, 0.0, 1.0 ), 0.0001 ), 0.56 ) );
        vec3 groundCol = mix( horizon * 0.65, ground, smoothstep( 0.0, 0.32, -y ) );
        vec3 baseColor = y >= 0.0 ? skyCol : groundCol;

        float horizonWrap = exp( -abs( y ) * 10.0 ) * 0.14;
        baseColor = mix( baseColor, horizon, horizonWrap );

        // Soft bounded solar specular highlight disc for glass, water, gold and chrome
        vec3 sunDir = normalize( uSunDirection );
        float cosTheta = max( dot( dir, sunDir ), 0.0 );
        float sunHalo = pow( max( cosTheta, 0.0001 ), 14.0 ) * 0.24;
        float sunDisc = smoothstep( 0.990, 0.999, cosTheta ) * 1.1;
        float aboveHorizon = smoothstep( -0.04, 0.06, y );
        vec3 sunHighlight = uSunColor * ( sunHalo + sunDisc ) * clamp( uSunIntensity, 0.0, 1.25 ) * aboveHorizon;

        // Hard linear radiance cap <= 2.2 so IBL never washes out PBR surfaces
        vec3 color = clamp( baseColor + sunHighlight, vec3( 0.0 ), vec3( 2.2 ) );
        gl_FragColor = vec4( color, 1.0 );
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'campus-env-ibl-dome';
  mesh.frustumCulled = false;
  return mesh;
}

function configureSkyUniforms(sky, { sunVector, turbidity, rayleigh, mieCoefficient, mieDirectionalG, showSunDisc }) {
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = turbidity;
  uniforms.rayleigh.value = rayleigh;
  uniforms.mieCoefficient.value = mieCoefficient;
  uniforms.mieDirectionalG.value = mieDirectionalG;
  uniforms.sunPosition.value.copy(sunVector);
  if (uniforms.showSunDisc) uniforms.showSunDisc.value = showSunDisc ? 1 : 0;
  if (uniforms.cloudCoverage) uniforms.cloudCoverage.value = 0;
}

/**
 * Creates the campus physical Preetham sky dome, cached calibrated LDR PMREM
 * environment reflection map, and high-altitude procedural drifting cloud dome.
 * Gracefully degrades when run in Node or with a mocked/non-WebGL renderer.
 */
export function createCampusAtmosphere(renderer, scene) {
  const sky = new Sky();
  sky.name = 'campus-atmosphere-sky';
  sky.scale.setScalar(SKY_SCALE);
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  if (sky.material) {
    sky.material.depthWrite = false;
    calibrateVisibleSkyMaterial(sky.material);
  }
  if (sky.material.uniforms.cloudCoverage) sky.material.uniforms.cloudCoverage.value = 0;
  scene?.add?.(sky);

  const clouds = createCloudDome();
  if (clouds) scene?.add?.(clouds.mesh);

  // Calibrated LDR gradient IBL mini-scene for PMREM reflections (never uses unclamped HDR Sky).
  const envScene = new THREE.Scene();
  const envDome = createEnvGradientDome();
  envScene.add(envDome);

  let pmremGenerator = null;
  if (hasWebGLContext(renderer)) {
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileCubemapShader?.();
  }

  let envRenderTarget = null;
  let lastEnvKey = null;
  let envGenerationCount = 0;
  let disposed = false;

  const sunDir = new THREE.Vector3(0.25, 0.72, 0.64).normalize();
  const sunVector = new THREE.Vector3();

  function updateClouds(dt) {
    if (disposed || !clouds) return;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (!step) return;
    clouds.cloudTexture.offset.x = (clouds.cloudTexture.offset.x + step * 0.0038) % 1;
    clouds.cloudTexture.offset.y = (clouds.cloudTexture.offset.y + step * 0.0014) % 1;
  }

  function apply(lightingConfig = {}) {
    if (disposed) return;
    const presetKey = Object.hasOwn(LEGACY_SKY_DEFAULTS, lightingConfig.preset) ? lightingConfig.preset : 'hazy';
    const fallback = LEGACY_SKY_DEFAULTS[presetKey];
    const skyConfig = lightingConfig.sky ?? fallback;

    const rawDir = lightingConfig.visualSunDirection ?? lightingConfig.solar?.direction;
    if (rawDir && Number.isFinite(rawDir.x) && Number.isFinite(rawDir.y) && Number.isFinite(rawDir.z)) {
      sunDir.set(rawDir.x, rawDir.y, rawDir.z);
      if (sunDir.lengthSq() > 1e-8) sunDir.normalize();
      else sunDir.set(0, 1, 0);
    }
    sunVector.copy(sunDir).multiplyScalar(SUN_DISTANCE);

    const turbidity = Number.isFinite(skyConfig.turbidity) ? skyConfig.turbidity : fallback.turbidity;
    const rayleigh = Number.isFinite(skyConfig.rayleigh) ? skyConfig.rayleigh : fallback.rayleigh;
    const mieCoefficient = Number.isFinite(skyConfig.mieCoefficient) ? skyConfig.mieCoefficient : fallback.mieCoefficient;
    const mieDirectionalG = Number.isFinite(skyConfig.mieDirectionalG) ? skyConfig.mieDirectionalG : fallback.mieDirectionalG;
    const exposure = Number.isFinite(lightingConfig.exposure) ? lightingConfig.exposure : fallback.exposure;

    configureSkyUniforms(sky, {
      sunVector,
      turbidity,
      rayleigh,
      mieCoefficient,
      mieDirectionalG,
      showSunDisc: true,
    });

    const visibleTuning = Object.hasOwn(VISIBLE_SKY_TUNING, lightingConfig.timeOfDay)
      ? VISIBLE_SKY_TUNING[lightingConfig.timeOfDay]
      : VISIBLE_SKY_TUNING.default;
    const skyUniforms = sky.material?.uniforms;
    const fogHorizonHex = Number.isFinite(lightingConfig.fog?.color)
      ? lightingConfig.fog.color
      : (Number.isFinite(lightingConfig.skyColor) ? lightingConfig.skyColor : fallback.envColors.horizon);
    if (skyUniforms?.uSkyGain) {
      const gainScale = presetKey === 'overcast' ? 0.85 : presetKey === 'hazy' ? 0.94 : 1.0;
      const glowScale = presetKey === 'overcast' ? 0.12 : presetKey === 'hazy' ? 0.58 : 1.0;
      const horizBlend = presetKey === 'overcast'
        ? 0.95
        : presetKey === 'hazy'
          ? Math.min(0.95, visibleTuning.horizonBlend + 0.05)
          : visibleTuning.horizonBlend;
      skyUniforms.uSkyGain.value = visibleTuning.skyGain * gainScale;
      skyUniforms.uHorizonColor.value.setHex(fogHorizonHex);
      skyUniforms.uHorizonBlend.value = horizBlend;
      skyUniforms.uSunGlowColor.value.setHex(visibleTuning.sunGlowHex);
      skyUniforms.uSunGlowStrength.value = visibleTuning.sunGlowStrength * glowScale;
    }

    if (renderer && typeof renderer === 'object' && Number.isFinite(exposure)) {
      renderer.toneMappingExposure = exposure;
    }

    const envIntensity = Number.isFinite(lightingConfig.envIntensity)
      ? lightingConfig.envIntensity
      : DEFAULT_ENV_INTENSITY;
    if (scene && typeof scene === 'object') {
      scene.environmentIntensity = envIntensity;
    }

    if (clouds) {
      const cloudOpacity = Number.isFinite(skyConfig.cloudOpacity) ? skyConfig.cloudOpacity : fallback.cloudOpacity;
      const cloudTint = Number.isFinite(skyConfig.cloudTint) ? skyConfig.cloudTint : fallback.cloudTint;
      clouds.mesh.material.opacity = cloudOpacity;
      clouds.mesh.material.color.setHex(cloudTint);
    }

    const zenithHex = Number.isFinite(lightingConfig.envColors?.zenith)
      ? lightingConfig.envColors.zenith
      : fallback.envColors.zenith;
    const horizonHex = Number.isFinite(lightingConfig.envColors?.horizon)
      ? lightingConfig.envColors.horizon
      : fogHorizonHex;
    const groundHex = Number.isFinite(lightingConfig.envColors?.ground)
      ? lightingConfig.envColors.ground
      : (Number.isFinite(lightingConfig.hemisphere?.groundColor)
        ? lightingConfig.hemisphere.groundColor
        : fallback.envColors.ground);
    const sunHex = Number.isFinite(lightingConfig.sun?.color)
      ? lightingConfig.sun.color
      : 0xfff0d4;
    const rawSunIntensity = Number.isFinite(lightingConfig.sun?.intensity) ? lightingConfig.sun.intensity : 1.8;
    const skyDamp = presetKey === 'overcast' ? 0.2 : presetKey === 'hazy' ? 0.65 : 1.0;
    const envSunIntensity = Math.max(0, Math.min(1.15, (rawSunIntensity / 2.35) * skyDamp));

    const envKey = [
      lightingConfig.season ?? '',
      lightingConfig.timeOfDay ?? '',
      presetKey,
      zenithHex,
      horizonHex,
      groundHex,
      sunHex,
      envSunIntensity.toFixed(3),
      sunDir.x.toFixed(3),
      sunDir.y.toFixed(3),
      sunDir.z.toFixed(3),
    ].join('|');

    if (envKey !== lastEnvKey) {
      lastEnvKey = envKey;
      const envUniforms = envDome.material.uniforms;
      envUniforms.uZenithColor.value.setHex(zenithHex);
      envUniforms.uHorizonColor.value.setHex(horizonHex);
      envUniforms.uGroundColor.value.setHex(groundHex);
      envUniforms.uSunDirection.value.copy(sunDir);
      envUniforms.uSunColor.value.setHex(sunHex);
      envUniforms.uSunIntensity.value = envSunIntensity;

      if (pmremGenerator) {
        const nextTarget = pmremGenerator.fromScene(envScene, 0.04, 0.1, 100, { size: 128 });
        if (scene) scene.environment = nextTarget.texture;
        envRenderTarget?.dispose();
        envRenderTarget = nextTarget;
        envGenerationCount += 1;
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    sky.removeFromParent();
    sky.geometry.dispose();
    sky.material.dispose();
    if (clouds) {
      clouds.mesh.removeFromParent();
      clouds.mesh.geometry.dispose();
      clouds.mesh.material.dispose();
      clouds.cloudTexture.dispose();
      clouds.horizonMask.dispose();
    }
    envDome.geometry.dispose();
    envDome.material.dispose();
    envScene.clear();
    if (scene && envRenderTarget && scene.environment === envRenderTarget.texture) {
      scene.environment = null;
    }
    envRenderTarget?.dispose();
    envRenderTarget = null;
    pmremGenerator?.dispose();
    pmremGenerator = null;
  }

  function follow(position) {
    if (disposed || !position) return;
    const x = Number(position.x), z = Number(position.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    sky.position.set(x, 0, z);
    if (clouds) clouds.mesh.position.set(x, 35, z);
  }

  return {
    sky,
    envScene,
    envDome,
    cloudDome: clouds?.mesh ?? null,
    hasPMREM: Boolean(pmremGenerator),
    get envMap() { return envRenderTarget?.texture ?? null; },
    get lastEnvKey() { return lastEnvKey; },
    get envGenerationCount() { return envGenerationCount; },
    get disposed() { return disposed; },
    apply,
    follow,
    update: updateClouds,
    updateClouds,
    dispose,
  };
}
