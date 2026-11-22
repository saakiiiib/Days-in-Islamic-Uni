import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMainGate, MAIN_GATE_CONFIG, MAIN_GATE_EVIDENCE } from '../src/world/mainGate.js';

function collectMeshes(root) {
  const meshes = [];
  root.traverse(obj => {
    if (obj.isMesh) meshes.push(obj);
  });
  return meshes;
}

function gateLocalToWorld(x, y, z) {
  return new THREE.Vector3(x, y, z)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), MAIN_GATE_CONFIG.yaw)
    .add(new THREE.Vector3(MAIN_GATE_CONFIG.position.x, MAIN_GATE_CONFIG.position.y, MAIN_GATE_CONFIG.position.z));
}

function castThroughGate(gate, localX, localY, fromZ = 10, toZ = -10) {
  const origin = gateLocalToWorld(localX, localY, fromZ);
  const target = gateLocalToWorld(localX, localY, toZ);
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, distance);
  return {
    visualHits: raycaster.intersectObjects(gate.group.children, true),
    colliderHits: raycaster.intersectObjects(gate.collisionGroup.children, true),
  };
}

test('Main Gate constructs the source-counted four-arch game assembly with calligraphy and landscape', () => {
  const gate = buildMainGate();

  assert.ok(gate.group.isGroup);
  assert.equal(gate.group.name, 'islamic-university-main-gate');
  assert.deepEqual(gate.group.userData.referenceEvidence, MAIN_GATE_EVIDENCE);
  assert.ok(gate.collisionGroup.isGroup);

  // 7 pier/pavilion colliders + 1 central island + 2 boundary walls + 1 highway barrier = 11 solid colliders
  assert.ok(gate.collisionGroup.children.length >= 8);
  assert.ok(gate.obstacles.length >= 7);

  // Verify gate location matches OSM Entrance Node 9027931168
  assert.equal(MAIN_GATE_CONFIG.position.x, 304.91);
  assert.equal(MAIN_GATE_CONFIG.position.z, -64.49);

  // Verify exterior player spawn on highway approach (~15.5m outside gate)
  assert.equal(MAIN_GATE_CONFIG.exteriorSpawn.x, 317.5);
  assert.equal(MAIN_GATE_CONFIG.exteriorSpawn.z, -73.5);
  assert.ok(Math.abs(MAIN_GATE_CONFIG.exteriorSpawn.yaw - 2.1866) < 0.001);

  // Verify bus parking and highway node remain unchanged
  assert.equal(MAIN_GATE_CONFIG.highwayNode.x, 338.0);
  assert.equal(MAIN_GATE_CONFIG.highwayNode.z, -87.87);
  assert.equal(MAIN_GATE_CONFIG.busParking.x, 271.0);
  assert.equal(MAIN_GATE_CONFIG.busParking.z, -45.0);

  gate.dispose();
  assert.equal(gate.group.children.length, 0);
  assert.equal(gate.collisionGroup.children.length, 0);
});

test('Main Gate batches static geometry to <= 18 draw calls with finite attributes and GateMenuCamera-safe bounds', () => {
  const gate = buildMainGate();
  const meshes = collectMeshes(gate.group);

  assert.ok(meshes.length > 0, 'gate must contain merged visual meshes');
  assert.ok(meshes.length <= 18, `expected <= 18 draw calls (strictly <= 20), got ${meshes.length}`);
  assert.ok(meshes.length <= 20);

  let maxY = -Infinity;
  const byName = new Map();

  for (const mesh of meshes) {
    byName.set(mesh.name, mesh);
    const geo = mesh.geometry;
    assert.ok(geo.isBufferGeometry, `${mesh.name} must have a BufferGeometry`);

    for (const attrName of ['position', 'normal', 'uv']) {
      const attr = geo.getAttribute(attrName);
      assert.ok(attr && attr.count > 0, `${mesh.name} must define non-empty ${attrName} attribute`);
      for (let i = 0; i < attr.array.length; i++) {
        assert.ok(Number.isFinite(attr.array[i]), `${mesh.name}.${attrName}[${i}] must be finite`);
      }
    }

    geo.computeBoundingBox();
    maxY = Math.max(maxY, geo.boundingBox.max.y);
  }

  // GateMenuCamera safe vertical ceiling (<= 10.72m)
  assert.ok(maxY <= 10.72, `Main Gate maxY (${maxY.toFixed(3)}) must stay <= 10.72`);

  // Rooftop golden Kalima stays within gate crown safe framing
  const kalima = byName.get('rooftop-kalima-calligraphy');
  assert.ok(kalima, 'rooftop Kalima mesh must exist');
  assert.ok(Math.abs(kalima.geometry.boundingBox.min.x) <= 10.2);
  assert.ok(Math.abs(kalima.geometry.boundingBox.max.x) <= 10.2);
  assert.ok(kalima.geometry.boundingBox.max.y <= 10.72);

  // Central terracotta brick planter island stays within safe maxZ <= 3.30
  const planter = byName.get('terracotta-brick');
  assert.ok(planter, 'terracotta brick planter mesh must exist');
  assert.ok(planter.geometry.boundingBox.max.z <= 3.3, `planter maxZ (${planter.geometry.boundingBox.max.z}) must be <= 3.3`);

  // Iconic architectural batches exist
  for (const required of [
    'architectural-stone',
    'brushed-steel',
    'wrought-iron',
    'burnished-gold',
    'warm-uplights',
    'fanlight-glass',
    'central-signboard',
    'marble-plaque',
    'fallen-petals',
  ]) {
    assert.ok(byName.has(required), `expected architectural batch "${required}"`);
  }

  gate.dispose();
});

test('Main Gate vehicular and pedestrian arch centers are unobstructed via raycast while piers and pavilion are solid', () => {
  const gate = buildMainGate();

  // Both vehicular arch centers (x = -4.70, +4.70) clear from ground through double-decker bus height (4.2m) and arch apex
  for (const vehX of [-4.70, 4.70]) {
    for (const heightY of [1.2, 2.5, 4.2, 5.8]) {
      const { visualHits, colliderHits } = castThroughGate(gate, vehX, heightY);
      assert.equal(visualHits.length, 0, `vehicular arch at x=${vehX}, y=${heightY} must have unobstructed visuals`);
      assert.equal(colliderHits.length, 0, `vehicular arch at x=${vehX}, y=${heightY} must have unobstructed colliders`);
    }
  }

  // Both pedestrian arch centers (x = -8.30, +8.30) clear for walking
  for (const pedX of [-8.30, 8.30]) {
    for (const heightY of [1.0, 2.2]) {
      const { visualHits, colliderHits } = castThroughGate(gate, pedX, heightY);
      assert.equal(visualHits.length, 0, `pedestrian arch at x=${pedX}, y=${heightY} must have unobstructed visuals`);
      assert.equal(colliderHits.length, 0, `pedestrian arch at x=${pedX}, y=${heightY} must have unobstructed colliders`);
    }
  }

  // Open sky gap above the recessed central pavilion between the two tall vehicular towers
  const skyGap = castThroughGate(gate, 0.0, 7.3);
  assert.equal(skyGap.visualHits.length, 0, 'sky gap above central pavilion beneath rooftop truss must be open');
  assert.equal(skyGap.colliderHits.length, 0, 'sky gap above central pavilion must have no collider');

  // Solid central pavilion & vehicular tower piers block rays on both visual and collision geometry
  for (const solidX of [-6.975, -2.425, 0.0, 2.425, 6.975]) {
    const { visualHits, colliderHits } = castThroughGate(gate, solidX, 2.2);
    assert.ok(visualHits.length > 0, `pier/pavilion at x=${solidX} must intersect visual geometry`);
    assert.ok(colliderHits.length > 0, `pier/pavilion at x=${solidX} must intersect collider geometry`);
  }

  gate.dispose();
});

test('Main Gate dispose() is idempotent and disposes all geometries, materials, and procedural CanvasTextures', () => {
  const previousDocument = globalThis.document;
  try {
    // Provide lightweight 2D canvas mock to exercise browser CanvasTexture paths & disposal
    globalThis.document = {
      createElement(tag) {
        if (tag !== 'canvas') return {};
        const grad = { addColorStop() {} };
        const ctx = {
          clearRect() {}, fillRect() {}, strokeRect() {},
          fillText() {}, strokeText() {},
          measureText: t => ({ width: t.length * 36 }),
          createLinearGradient: () => grad,
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, quadraticCurveTo() {},
          fill() {}, stroke() {}, save() {}, restore() {},
        };
        return { width: 0, height: 0, getContext: () => ctx };
      },
    };

    const gate = buildMainGate();
    const disposeCounts = { geometry: 0, material: 0, texture: 0 };
    const wrapped = new Set();

    const trackDispose = (obj, kind) => {
      if (!obj || wrapped.has(obj)) return;
      wrapped.add(obj);
      const orig = obj.dispose.bind(obj);
      obj.dispose = () => {
        disposeCounts[kind]++;
        orig();
      };
    };

    gate.group.traverse(obj => {
      if (!obj.isMesh) return;
      trackDispose(obj.geometry, 'geometry');
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        trackDispose(mat, 'material');
        if (mat.map) trackDispose(mat.map, 'texture');
        if (mat.bumpMap) trackDispose(mat.bumpMap, 'texture');
      }
    });
    gate.collisionGroup.traverse(obj => {
      if (!obj.isMesh) return;
      trackDispose(obj.geometry, 'geometry');
      trackDispose(obj.material, 'material');
    });

    gate.dispose();
    const afterFirst = { ...disposeCounts };
    assert.ok(afterFirst.geometry >= 20, 'all visual & collider geometries should dispose');
    assert.ok(afterFirst.material >= 16, 'all visual & collider materials should dispose');
    assert.equal(afterFirst.texture, 10, 'all 10 procedural CanvasTextures should dispose');
    assert.equal(gate.group.children.length, 0);
    assert.equal(gate.collisionGroup.children.length, 0);

    // Second and third dispose calls must be complete no-ops
    gate.dispose();
    gate.dispose();
    assert.deepEqual(disposeCounts, afterFirst, 'repeated dispose() calls must be idempotent');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
