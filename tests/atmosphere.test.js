import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { planReferenceVegetation } from '../src/world/referenceVegetation.js';
import {
  DEFAULT_LIGHTING_DATE,
  TIME_OF_DAY_DATES,
  TIME_OF_DAY_PRESETS,
  campusLighting,
  campusTimeOfDayLighting,
} from '../src/world/solarLighting.js';
import { createCampusAtmosphere } from '../src/world/atmosphere.js';
import { DEEP_POND_WATER_COLOR, enhanceWaterMaterial, generateRippleNormalPixels } from '../src/world/waterShader.js';
import { addCampusFoliage } from '../src/world/foliage.js';

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);

function createMockDocument() {
  return {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(kind) {
          if (kind !== '2d') return null;
          return {
            createImageData(w, h) {
              return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
            },
            putImageData() {},
          };
        },
      };
    },
  };
}

test('campusTimeOfDayLighting covers morning, midday, golden and dusk across all three seasons and sky moods', () => {
  assert.equal(Object.isFrozen(TIME_OF_DAY_DATES.march), true);
  assert.equal(Object.isFrozen(TIME_OF_DAY_PRESETS.golden.sky), true);
  assert.equal(Object.isFrozen(TIME_OF_DAY_PRESETS.golden.envColors), true);
  assert.equal(TIME_OF_DAY_DATES.march.midday, DEFAULT_LIGHTING_DATE);

  for (const season of ['march', 'june', 'december']) {
    for (const timeOfDay of ['morning', 'midday', 'golden', 'dusk']) {
      for (const sky of ['clear', 'hazy', 'overcast']) {
        const config = campusTimeOfDayLighting({ season, timeOfDay, sky });
        assert.equal(config.season, season);
        assert.equal(config.timeOfDay, timeOfDay);
        assert.equal(config.preset, sky);
        assert.equal(config.solar.date, TIME_OF_DAY_DATES[season][timeOfDay]);

        // Visual direction stays unit-length and above the aesthetic horizon floor
        const v = config.visualSunDirection;
        near(Math.hypot(v.x, v.y, v.z), 1, 1e-10);
        assert.ok(v.y > 0.04, `${season}/${timeOfDay} visual sun stays above aesthetic horizon floor`);
        near(Math.hypot(config.sunOffset.x, config.sunOffset.y, config.sunOffset.z), 150, 1e-9);

        // Sky shader parameters, LDR IBL gradient colors and lighting values stay in calibrated bounds
        assert.ok(config.sky.turbidity > 0 && Number.isFinite(config.sky.turbidity));
        assert.ok(config.sky.rayleigh > 0 && Number.isFinite(config.sky.rayleigh));
        assert.ok(config.sky.mieCoefficient > 0 && Number.isFinite(config.sky.mieCoefficient));
        assert.ok(config.sky.mieDirectionalG > 0 && config.sky.mieDirectionalG < 1);
        assert.ok(Number.isFinite(config.envColors.zenith));
        assert.ok(Number.isFinite(config.envColors.horizon));
        assert.ok(Number.isFinite(config.envColors.ground));
        assert.ok(config.envIntensity > 0 && config.envIntensity <= 1.0);
        assert.ok(config.exposure > 0.5 && config.exposure < 1.5);
        assert.ok(config.emissiveBoost >= 0 && config.emissiveBoost <= 1);
        assert.ok(config.sun.intensity > 0 && config.hemisphere.intensity > 0);
        assert.ok(config.fog.near > 0 && config.fog.far > config.fog.near);
      }
    }
  }

  // Morning is east; golden & dusk are west
  assert.ok(campusTimeOfDayLighting({ season: 'march', timeOfDay: 'morning' }).solar.direction.x > 0);
  assert.ok(campusTimeOfDayLighting({ season: 'march', timeOfDay: 'golden' }).solar.direction.x < 0);
  assert.ok(campusTimeOfDayLighting({ season: 'march', timeOfDay: 'dusk' }).solar.direction.x < 0);

  // December golden hour lifts visual sun to 18 deg horizon floor to avoid murky lighting
  const decGolden = campusTimeOfDayLighting({ season: 'december', timeOfDay: 'golden', sky: 'clear' });
  near(Math.asin(decGolden.visualSunDirection.y) * (180 / Math.PI), 18, 1e-6);

  // December dusk preserves genuine below-horizon NOAA metadata while keeping visual sun lifted for twilight glow
  const decDusk = campusTimeOfDayLighting({ season: 'december', timeOfDay: 'dusk', sky: 'clear' });
  assert.equal(decDusk.solar.aboveHorizon, false);
  assert.ok(decDusk.solar.altitude < 0);
  assert.ok(decDusk.visualSunDirection.y > 0.05);
  assert.ok(decDusk.visualSunDirection.x < 0, 'horizontal west-southwest azimuth is preserved');

  // Calibrated emissive boost & readable dusk lighting
  const midday = campusTimeOfDayLighting({ timeOfDay: 'midday' });
  const morning = campusTimeOfDayLighting({ timeOfDay: 'morning' });
  const golden = campusTimeOfDayLighting({ timeOfDay: 'golden' });
  const dusk = campusTimeOfDayLighting({ timeOfDay: 'dusk' });
  assert.equal(midday.emissiveBoost, 0.0);
  assert.equal(morning.emissiveBoost, 0.0);
  assert.ok(golden.emissiveBoost > morning.emissiveBoost);
  assert.ok(dusk.emissiveBoost > golden.emissiveBoost);
  assert.ok(dusk.sun.intensity >= 1.0 && dusk.hemisphere.intensity >= 1.0, 'dusk stays readable rather than pitch black');

  // Determinism & mutation isolation
  const a = campusTimeOfDayLighting();
  const b = campusTimeOfDayLighting();
  assert.deepEqual(a, b);
  a.sky.turbidity = 999;
  a.sun.intensity = 999;
  a.envColors.zenith = 0x000000;
  assert.notEqual(campusTimeOfDayLighting().sky.turbidity, 999);
  assert.notEqual(TIME_OF_DAY_PRESETS.golden.sky.turbidity, 999);
  assert.notEqual(campusTimeOfDayLighting().envColors.zenith, 0x000000);
  assert.notEqual(TIME_OF_DAY_PRESETS.golden.envColors.zenith, 0x000000);

  // Invalid inputs rejected cleanly
  assert.throws(() => campusTimeOfDayLighting({ season: 'monsoon' }), /season/i);
  assert.throws(() => campusTimeOfDayLighting({ timeOfDay: 'midnight' }), /timeOfDay/i);
  assert.throws(() => campusTimeOfDayLighting({ sky: 'storm' }), /sky/i);
});

test('createCampusAtmosphere uses calibrated LDR IBL dome (no Preetham Sky in envScene), applies configs and disposes idempotently', () => {
  const scene = new THREE.Scene();
  const mockRenderer = { toneMappingExposure: 1.0 };
  const atmosphere = createCampusAtmosphere(mockRenderer, scene);

  assert.equal(atmosphere.hasPMREM, false);
  assert.equal(atmosphere.cloudDome, null);
  assert.equal(atmosphere.envMap, null);
  assert.ok(atmosphere.sky.isSky);
  assert.equal(atmosphere.sky.scale.x, 2400);
  assert.equal(atmosphere.sky.material.depthWrite, false);
  assert.equal(atmosphere.sky.renderOrder, -2);

  // envScene must NOT contain an unclamped HDR Preetham Sky; it uses the calibrated radius-40 ShaderMaterial dome
  assert.ok(atmosphere.envScene?.isScene);
  assert.equal(atmosphere.envScene.children.some(child => child.isSky), false);
  assert.ok(atmosphere.envDome?.isMesh);
  assert.equal(atmosphere.envScene.children.includes(atmosphere.envDome), true);
  assert.equal(atmosphere.envDome.geometry.parameters.radius, 40);
  assert.equal(atmosphere.envDome.material.isShaderMaterial, true);
  assert.equal(atmosphere.envDome.material.side, THREE.BackSide);
  assert.match(atmosphere.envDome.material.fragmentShader, /clamp\(.*2\.2/);

  atmosphere.follow({ x: 120, y: 10, z: -85 });
  assert.equal(atmosphere.sky.position.x, 120);
  assert.equal(atmosphere.sky.position.z, -85);
  assert.equal(scene.children.includes(atmosphere.sky), true);

  let skyGeoDisposes = 0;
  let skyMatDisposes = 0;
  let envGeoDisposes = 0;
  let envMatDisposes = 0;
  atmosphere.sky.geometry.addEventListener('dispose', () => { skyGeoDisposes++; });
  atmosphere.sky.material.addEventListener('dispose', () => { skyMatDisposes++; });
  atmosphere.envDome.geometry.addEventListener('dispose', () => { envGeoDisposes++; });
  atmosphere.envDome.material.addEventListener('dispose', () => { envMatDisposes++; });

  const golden = campusTimeOfDayLighting({ season: 'march', timeOfDay: 'golden', sky: 'clear' });
  atmosphere.apply(golden);
  assert.equal(mockRenderer.toneMappingExposure, golden.exposure);
  near(scene.environmentIntensity, golden.envIntensity, 1e-6);
  near(atmosphere.sky.material.uniforms.turbidity.value, golden.sky.turbidity, 1e-6);
  near(atmosphere.sky.material.uniforms.rayleigh.value, golden.sky.rayleigh, 1e-6);
  assert.equal(atmosphere.envDome.material.uniforms.uZenithColor.value.getHex(), golden.envColors.zenith);
  assert.equal(atmosphere.envDome.material.uniforms.uHorizonColor.value.getHex(), golden.envColors.horizon);
  assert.equal(atmosphere.envDome.material.uniforms.uGroundColor.value.getHex(), golden.envColors.ground);
  const firstKey = atmosphere.lastEnvKey;
  assert.ok(typeof firstKey === 'string' && firstKey.length > 0);

  // Re-applying identical config keeps the same cache key
  atmosphere.apply(golden);
  assert.equal(atmosphere.lastEnvKey, firstKey);

  // Legacy campusLighting() output is also accepted seamlessly and defaults scene.environmentIntensity to 0.55
  const legacy = campusLighting({ preset: 'overcast' });
  atmosphere.apply(legacy);
  near(scene.environmentIntensity, 0.55, 1e-6);
  assert.notEqual(atmosphere.lastEnvKey, firstKey);

  // Updates safely no-op in Node
  atmosphere.update(0.016);
  atmosphere.updateClouds(0.5);
  atmosphere.update(NaN);

  // Idempotent disposal frees geometry & material exactly once
  atmosphere.dispose();
  atmosphere.dispose();
  assert.equal(atmosphere.disposed, true);
  assert.equal(skyGeoDisposes, 1);
  assert.equal(skyMatDisposes, 1);
  assert.equal(envGeoDisposes, 1);
  assert.equal(envMatDisposes, 1);
  assert.equal(scene.children.includes(atmosphere.sky), false);

  // Safe post-dispose calls
  atmosphere.apply(golden);
  atmosphere.update(0.016);
});

test('createCampusAtmosphere builds and drifts procedural cloud dome when canvas document exists', () => {
  const previousDocument = globalThis.document;
  globalThis.document = createMockDocument();
  try {
    const scene = new THREE.Scene();
    const atmosphere = createCampusAtmosphere(null, scene);
    assert.ok(atmosphere.cloudDome?.isMesh);
    assert.equal(scene.children.includes(atmosphere.cloudDome), true);
    const map = atmosphere.cloudDome.material.map;
    assert.ok(map.isTexture);

    const startX = map.offset.x;
    const startY = map.offset.y;
    atmosphere.apply(campusTimeOfDayLighting({ timeOfDay: 'dusk' }));
    atmosphere.updateClouds(2.0);
    assert.ok(map.offset.x > startX && map.offset.y > startY);

    let cloudDisposes = 0;
    map.addEventListener('dispose', () => { cloudDisposes++; });
    atmosphere.dispose();
    atmosphere.dispose();
    assert.equal(cloudDisposes, 1);
    assert.equal(scene.children.includes(atmosphere.cloudDome), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('enhanceWaterMaterial falls back safely in Node and generates seamless normal ripples in browser', () => {
  // Node fallback (no document): applies calibrated deep-pond PBR properties without canvas normalMap
  const matNode = new THREE.MeshStandardMaterial({ color: 0x527759, roughness: 0.3, metalness: 0.15 });
  const ctrlNode = enhanceWaterMaterial(matNode);
  assert.equal(ctrlNode.active, false);
  assert.equal(ctrlNode.normalMap, null);
  assert.equal(matNode.color.getHex(), DEEP_POND_WATER_COLOR);
  near(matNode.roughness, 0.14, 1e-6);
  near(matNode.metalness, 0.16, 1e-6);
  near(matNode.envMapIntensity, 1.05, 1e-6);
  ctrlNode.update(0.016);
  ctrlNode.dispose();
  ctrlNode.dispose();
  assert.equal(ctrlNode.disposed, true);
  matNode.dispose();

  // Null material guard
  const nullCtrl = enhanceWaterMaterial(null);
  nullCtrl.update(0.1);
  nullCtrl.dispose();

  // Pure CPU ripple normal pixel validation: unit normals, upward Z, periodic seamlessness
  const size = 64;
  const pixels = generateRippleNormalPixels(size);
  assert.equal(pixels.length, size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const nx = (pixels[i] / 255) * 2 - 1;
    const ny = (pixels[i + 1] / 255) * 2 - 1;
    const nz = (pixels[i + 2] / 255) * 2 - 1;
    near(Math.hypot(nx, ny, nz), 1, 0.03);
    assert.ok(nz > 0.25, 'water tangent normal faces upward');
    assert.equal(pixels[i + 3], 255);
  }

  // Browser canvas path with synthetic document
  const previousDocument = globalThis.document;
  globalThis.document = createMockDocument();
  try {
    const mat = new THREE.MeshStandardMaterial({ color: 0x527759 });
    const ctrl = enhanceWaterMaterial(mat);
    assert.equal(ctrl.active, true);
    assert.ok(mat.normalMap?.isTexture);
    assert.equal(mat.normalMap.wrapS, THREE.RepeatWrapping);
    assert.equal(mat.normalMap.wrapT, THREE.RepeatWrapping);
    assert.equal(mat.color.getHex(), DEEP_POND_WATER_COLOR);
    near(mat.normalScale.x, 0.16, 1e-6);
    near(mat.normalScale.y, 0.16, 1e-6);
    near(mat.roughness, 0.14, 1e-6);
    near(mat.metalness, 0.16, 1e-6);
    near(mat.envMapIntensity, 1.05, 1e-6);

    const beforeX = mat.normalMap.offset.x;
    const beforeY = mat.normalMap.offset.y;
    ctrl.update(1.0);
    assert.notEqual(mat.normalMap.offset.x, beforeX);
    assert.notEqual(mat.normalMap.offset.y, beforeY);

    let texDisposes = 0;
    mat.normalMap.addEventListener('dispose', () => { texDisposes++; });
    ctrl.dispose();
    ctrl.dispose();
    assert.equal(texDisposes, 1);
    assert.equal(mat.normalMap, null);
    mat.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('addCampusFoliage creates 5 finite deterministic multi-species InstancedMeshes with clean single disposal', () => {
  const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
  const vegetation = planReferenceVegetation(map);

  const runOnce = () => {
    const group = new THREE.Group();
    const materials = { foliage: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, vertexColors: true }) };
    const result = addCampusFoliage(map, group, materials, vegetation);
    return { group, materials, result };
  };

  const first = runOnce();
  const second = runOnce();
  assert.deepEqual(first.result.counts, second.result.counts);

  const expectedNames = [
    'mapped-tree-canopies',
    'campus-royal-palms',
    'campus-krishnachura-trees',
    'campus-debdaru-trees',
    'campus-garden-shrubs',
  ];
  const meshNames = first.group.children.map(child => child.name);
  assert.equal(first.group.children.length, 5);
  assert.deepEqual(meshNames, expectedNames);

  const primary = first.group.children.find(m => m.name === 'mapped-tree-canopies');
  assert.equal(primary.userData.includesTrunksAndShrubs, true);

  const matrix = new THREE.Matrix4();
  for (const mesh of first.group.children) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.equal(mesh.material, first.materials.foliage);
    assert.equal(mesh.geometry.index, null, `${mesh.name} should be non-indexed`);
    assert.equal(mesh.receiveShadow, true);
    assert.equal(mesh.castShadow, mesh.name !== 'campus-garden-shrubs');

    const pos = mesh.geometry.getAttribute('position');
    const norm = mesh.geometry.getAttribute('normal');
    const col = mesh.geometry.getAttribute('color');
    assert.ok(pos && pos.count > 0 && pos.count % 3 === 0);
    assert.ok(norm && norm.count === pos.count);
    assert.ok(col && col.count === pos.count);
    for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]), `${mesh.name} position finite`);
    for (let i = 0; i < norm.array.length; i++) assert.ok(Number.isFinite(norm.array[i]), `${mesh.name} normal finite`);
    for (let i = 0; i < col.array.length; i++) assert.ok(Number.isFinite(col.array[i]), `${mesh.name} color finite`);

    assert.ok(Number.isFinite(mesh.boundingSphere.radius) && mesh.boundingSphere.radius > 0);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      for (const value of matrix.elements) assert.ok(Number.isFinite(value), `${mesh.name} instance matrix finite`);
    }
  }

  // Simulate world.dispose() single-pass cleanup (matching tests/world-resources.test.js)
  const disposeCounts = new Map();
  const geoDisposes = new Map();
  for (const ctx of [first, second]) {
    ctx.group.traverse(obj => {
      if (obj.isInstancedMesh) {
        disposeCounts.set(obj, 0);
        obj.addEventListener('dispose', () => disposeCounts.set(obj, disposeCounts.get(obj) + 1));
      }
      if (obj.geometry) {
        geoDisposes.set(obj.geometry, 0);
        obj.geometry.addEventListener('dispose', () => geoDisposes.set(obj.geometry, geoDisposes.get(obj.geometry) + 1));
      }
    });
    const geometries = new Set();
    ctx.group.traverse(obj => {
      if (obj.isInstancedMesh) obj.dispose();
      if (obj.geometry) geometries.add(obj.geometry);
    });
    geometries.forEach(g => g.dispose());
    ctx.materials.foliage.dispose();
    ctx.group.clear();
  }
  for (const [mesh, count] of disposeCounts) assert.equal(count, 1, mesh.name);
  for (const [, count] of geoDisposes) assert.equal(count, 1);

  // Minimal 1-tree map (like tests/world.test.js) always produces 'mapped-tree-canopies'
  const miniGroup = new THREE.Group();
  const miniMat = { foliage: new THREE.MeshStandardMaterial({ vertexColors: true }) };
  addCampusFoliage({ trees: [{ id: 'tree', x: -22, z: 12 }] }, miniGroup, miniMat, { trees: [], shrubs: [] });
  assert.ok(miniGroup.children.some(m => m.name === 'mapped-tree-canopies'));
  miniGroup.children.forEach(m => { m.dispose(); m.geometry.dispose(); });
  miniMat.foliage.dispose();

  // Empty map produces no meshes safely
  const emptyGroup = new THREE.Group();
  const emptyMat = { foliage: new THREE.MeshStandardMaterial({ vertexColors: true }) };
  const emptyResult = addCampusFoliage({}, emptyGroup, emptyMat, {});
  assert.equal(emptyGroup.children.length, 0);
  assert.equal(emptyResult.counts.total, 0);
  emptyMat.foliage.dispose();
});
