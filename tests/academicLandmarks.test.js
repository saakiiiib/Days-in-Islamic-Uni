import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/osm.js';
import { pointInPolygon, pointToSegmentDistance } from '../src/map/geometry.js';
import { chooseEntries, wallEdges } from '../src/world/facades.js';
import { buildRoadAppearance } from '../src/world/roads.js';
import {
  ACADEMIC_LANDMARK_IDS,
  isAcademicLandmark,
  buildAcademicLandmark,
} from '../src/world/landmarks/academicLandmarks.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const roadAppearance = buildRoadAppearance(map);

const TARGETS = [
  { key: 'administration', osmType: 'relation', id: ACADEMIC_LANDMARK_IDS.administration, drawCalls: 3, courtyards: 1, height: 9.6 },
  { key: 'newAdministration', osmType: 'way', id: ACADEMIC_LANDMARK_IDS.newAdministration, drawCalls: 1, courtyards: 0, height: 9.6 },
  { key: 'rabindraNazrul', osmType: 'relation', id: ACADEMIC_LANDMARK_IDS.rabindraNazrul, drawCalls: 1, courtyards: 2, height: 9.6 },
  { key: 'ibnSina', osmType: 'relation', id: ACADEMIC_LANDMARK_IDS.ibnSina, drawCalls: 1, courtyards: 2, height: 16.0 },
  { key: 'businessAdmin', osmType: 'relation', id: ACADEMIC_LANDMARK_IDS.businessAdmin, drawCalls: 1, courtyards: 1, height: 19.2 },
];

const targetBuildings = TARGETS.map(spec => {
  const building = map.buildings.find(b => b.osmType === spec.osmType && String(b.id) === spec.id);
  assert.ok(building, `OSM building ${spec.osmType}/${spec.id} must exist in public/data/map.osm`);
  return { spec, building, entrances: chooseEntries(building, map.roads, map.entrances) };
});

test('ACADEMIC_LANDMARK_IDS and isAcademicLandmark match exact typed OSM keys only', () => {
  assert.deepEqual(ACADEMIC_LANDMARK_IDS, {
    administration: '18079380',
    newAdministration: '929202651',
    rabindraNazrul: '18079382',
    ibnSina: '18079384',
    businessAdmin: '18079386',
  });

  const matched = map.buildings.filter(isAcademicLandmark);
  assert.equal(matched.length, 5, 'exactly 5 buildings in map.osm match academic flagship landmarks');
  for (const { building } of targetBuildings) {
    assert.equal(isAcademicLandmark(building), true);
  }

  // Wrong OSM types, missing osmType, null, and unrelated hero landmarks must return false
  for (const invalid of [
    null,
    undefined,
    {},
    { id: '18079380' },
    { osmType: 'way', id: '18079380' },
    { osmType: 'relation', id: '929202651' },
    { osmType: 'way', id: '18079382' },
    { osmType: 'way', id: '18079384' },
    { osmType: 'way', id: '18079386' },
    { osmType: 'way', id: '532464097' },
    { osmType: 'relation', id: '7650711' },
  ]) {
    assert.equal(isAcademicLandmark(invalid), false, `must reject ${JSON.stringify(invalid)}`);
  }
});

test('all 5 academic landmarks produce finite bounded geometry within vertex, draw call, material and zero-collider budgets', () => {
  for (const { spec, building, entrances } of targetBuildings) {
    const snapshot = JSON.stringify(building);
    const model = buildAcademicLandmark(building, { entrances });
    assert.equal(JSON.stringify(building), snapshot, `${spec.key}: source OSM building data remains caller-owned`);

    const d = model.diagnostics;
    assert.equal(d.osmType, spec.osmType);
    assert.equal(d.osmId, spec.id);
    assert.equal(d.osmKey, `${spec.osmType}/${spec.id}`);
    assert.equal(d.landmarkKey, spec.key);
    assert.equal(d.drawCalls, spec.drawCalls, `${spec.key}: drawCalls budget`);
    assert.equal(d.collisionObjects, 0, `${spec.key}: zero added collision objects`);
    assert.equal(d.courtyardCount, spec.courtyards, `${spec.key}: preserves mapped courtyard count`);
    assert.ok(d.vertexCount > 5000 && d.vertexCount < 55000, `${spec.key}: vertexCount (${d.vertexCount}) stays well inside <55,000 budget`);
    assert.equal(model.group.children.length, spec.drawCalls, `${spec.key}: group mesh count matches drawCalls`);

    const staticMesh = model.group.children[0];
    const geo = staticMesh.geometry;
    const mat = staticMesh.material;
    assert.equal(geo.groups.length, 0, `${spec.key}: single merged static draw batch`);
    assert.equal(geo.index, null, `${spec.key}: non-indexed static geometry`);
    assert.equal(staticMesh.castShadow, true);
    assert.equal(staticMesh.receiveShadow, true);
    assert.equal(mat.vertexColors, true);
    assert.equal(mat.roughness, 0.80);
    assert.equal(mat.envMapIntensity, 0.35);

    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const col = geo.getAttribute('color');
    assert.equal(pos.count, norm.count);
    assert.equal(pos.count, col.count);
    assert.ok([...pos.array].every(Number.isFinite), `${spec.key}: all static positions finite`);
    assert.ok([...norm.array].every(Number.isFinite), `${spec.key}: all static normals finite`);
    assert.ok([...col.array].every(Number.isFinite), `${spec.key}: all static vertex colors finite`);

    // Exact roofRise consistency
    assert.ok(
      Math.abs(geo.boundingBox.max.y - (building.height + d.roofRise)) < 1e-3,
      `${spec.key}: boundingBox.max.y matches baseHeight + roofRise`
    );

    // Every static vertex stays tightly bounded to mapped outer/courtyard perimeter rings
    const poly = building.polygons[0];
    for (let i = 0; i < pos.count; i++) {
      const p = [pos.getX(i), pos.getZ(i)];
      if (pointInPolygon(p, poly)) continue;
      const outerDist = Math.min(...poly[0].slice(1).map((b, j) => pointToSegmentDistance(p, poly[0][j], b)));
      let holeDist = Infinity;
      for (let r = 1; r < poly.length; r++) {
        const hd = Math.min(...poly[r].slice(1).map((b, j) => pointToSegmentDistance(p, poly[r][j], b)));
        if (hd < holeDist) holeDist = hd;
      }
      if (holeDist < outerDist) {
        assert.ok(holeDist <= 0.40, `${spec.key}: courtyard wall trim stays tight (${holeDist.toFixed(3)}m)`);
      } else {
        assert.ok(outerDist <= d.maxHorizontalExtent + 1e-3, `${spec.key}: outer trim stays within maxHorizontalExtent (${outerDist.toFixed(3)}m)`);
      }
    }

    // All rooftop stairhead/elevator penthouse polygons remain strictly inside mapped roof footprint
    for (const mp of d.features.penthousePolygons) {
      for (const ring of mp) {
        for (const pt of ring) {
          assert.ok(pointInPolygon(pt, poly), `${spec.key}: rooftop penthouse stays strictly inside mapped roof`);
        }
      }
    }

    // Archetype-specific iconic feature checks
    if (spec.key === 'administration') {
      assert.equal(d.features.porticoCount, 1);
      assert.equal(d.features.pedimentCount, 1);
      assert.ok(d.features.pilasterCount >= 40);
      assert.equal(d.features.flagpoleCount, 2);
      assert.equal(d.features.flags.length, 2);
      // Verify both ceremonial flagpoles stand clear of mapped service road asphalt, edges, and curbs
      for (const fl of d.features.flags) {
        const q = [fl.position[0], fl.position[2]];
        for (const layer of ['asphalt', 'edges', 'curbs']) {
          assert.equal(
            roadAppearance[layer].some(rp => pointInPolygon(q, rp)),
            false,
            `flagpole ${fl.name} stays off road ${layer}`
          );
        }
      }
    } else if (spec.key === 'newAdministration') {
      assert.equal(d.features.porticoCount, 1);
      assert.equal(d.features.pedimentCount, 1);
      assert.ok(d.features.pilasterCount >= 40);
      assert.equal(d.features.flagpoleCount, 0, 'flagpoles belong on Administration Building ONLY');
    } else if (spec.key === 'rabindraNazrul') {
      assert.equal(d.features.porticoCount, 1);
      assert.ok(d.features.columnCount >= 100, 'double-columned recessed arcade galleries line outer & courtyard walls');
      assert.ok(d.features.archCount >= 100, 'decorative arches crown upper gallery bays');
      assert.ok(d.features.stairCoreCount >= 1);
      assert.equal(d.features.flagpoleCount, 0);
    } else if (spec.key === 'ibnSina' || spec.key === 'businessAdmin') {
      assert.equal(d.features.porticoCount, 1);
      assert.ok(d.features.chajjaCount >= 60, `${spec.key}: continuous projecting horizontal chajja ledges`);
      assert.ok(d.features.finCount >= 80, `${spec.key}: rhythmic vertical solar shading fins`);
      assert.equal(d.features.stairCoreCount, 1, `${spec.key}: tall vertical glazed stair/elevator core`);
      assert.ok(d.features.penthousePolygons.length >= 1, `${spec.key}: rooftop elevator penthouse`);
      assert.ok(d.roofRise >= 3.2, `${spec.key}: elevator penthouse rises ~2.4 m above roof parapet`);
      assert.ok(d.features.waterTankCount >= 2, `${spec.key}: cylindrical rooftop overhead water tanks`);
      assert.equal(d.features.flagpoleCount, 0);
    }

    model.dispose();
  }
});

test('all open courtyard holes stay 100% open to sky via downward raycasts on Admin, Rabindra-Nazrul, Ibn Sina, and BBA', () => {
  const courtyardTargets = targetBuildings.filter(t => t.spec.courtyards > 0);
  assert.equal(courtyardTargets.length, 4);

  let totalCourtyardsVerified = 0;
  let totalRaysFired = 0;

  for (const { spec, building, entrances } of courtyardTargets) {
    const model = buildAcademicLandmark(building, { entrances });
    model.group.updateMatrixWorld(true);
    const poly = building.polygons[0];

    for (let r = 1; r < poly.length; r++) {
      const hole = poly[r];
      const xs = hole.map(p => p[0]);
      const zs = hole.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      let raysInHole = 0;

      for (let ix = 1; ix <= 5; ix++) {
        for (let iz = 1; iz <= 5; iz++) {
          const pt = [minX + ((maxX - minX) * ix) / 6, minZ + ((maxZ - minZ) * iz) / 6];
          // Must lie strictly inside the hole (outside solid building polygon) and away from courtyard walls
          if (pointInPolygon(pt, poly)) continue;
          const wallDist = Math.min(...hole.slice(1).map((b, j) => pointToSegmentDistance(pt, hole[j], b)));
          if (wallDist < 0.65) continue;

          const ray = new THREE.Raycaster(
            new THREE.Vector3(pt[0], building.height + 20, pt[1]),
            new THREE.Vector3(0, -1, 0),
            0,
            building.height + 25
          );
          const hits = ray.intersectObject(model.group, true);
          assert.equal(hits.length, 0, `${spec.key} courtyard hole ${r} at (${pt[0].toFixed(1)}, ${pt[1].toFixed(1)}) must remain open to sky`);
          raysInHole++;
          totalRaysFired++;
        }
      }
      assert.ok(raysInHole >= 5, `${spec.key} hole ${r} sampled with multiple interior vertical rays`);
      totalCourtyardsVerified++;
    }
    model.dispose();
  }

  assert.equal(totalCourtyardsVerified, 6, 'all 6 mapped courtyard voids verified across the 4 courtyard buildings');
  assert.ok(totalRaysFired >= 100);
});

test('all 5 ground-level entrances remain 100% raycast-clear (y = 0.08..2.8) beneath overhead portico canopies', () => {
  for (const { spec, building, entrances } of targetBuildings) {
    const model = buildAcademicLandmark(building, { entrances });
    model.group.updateMatrixWorld(true);
    const entry = entrances[0];
    const edge = entry.edge;

    for (const y of [0.08, 0.7, 1.4, 2.0, 2.6, 2.8]) {
      for (const offset of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const origin = edge.at(entry.distance + offset, y, 2.6);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(...origin),
          new THREE.Vector3(-edge.nx, 0, -edge.nz),
          0,
          2.9
        );
        assert.equal(
          ray.intersectObject(model.group, true).length,
          0,
          `${spec.key}: ground-level entry stays raycast-clear at y=${y}, lateral=${offset}`
        );
      }
    }

    // Overhead entrance portico canopy must shelter the entry above y = 3.2 m
    const canopyOrigin = edge.at(entry.distance, 4.5, 0.75);
    const canopyRay = new THREE.Raycaster(new THREE.Vector3(...canopyOrigin), new THREE.Vector3(0, -1, 0), 0, 1.8);
    assert.ok(
      canopyRay.intersectObject(model.group, true).length > 0,
      `${spec.key}: overhead entrance portico canopy shelters entry`
    );

    model.dispose();
  }
});

test('Administration Building features waving Bangladesh and Islamic University flags with real-time update(dt) ripple', () => {
  const { building, entrances } = targetBuildings.find(t => t.spec.key === 'administration');
  const model = buildAcademicLandmark(building, { entrances });

  const bdFlag = model.group.getObjectByName('admin-flag-bangladesh');
  const iuFlag = model.group.getObjectByName('admin-flag-islamic-university');
  assert.ok(bdFlag?.isMesh, 'Bangladesh National Flag mesh exists');
  assert.ok(iuFlag?.isMesh, 'Islamic University Flag mesh exists');

  // Verify PlaneGeometry(1.8, 1.08, 10, 4) -> 11 * 5 = 55 vertices each
  assert.equal(bdFlag.geometry.getAttribute('position').count, 55);
  assert.equal(iuFlag.geometry.getAttribute('position').count, 55);
  assert.ok(bdFlag.material.map?.isDataTexture, 'Bangladesh flag uses crisp DataTexture');
  assert.ok(iuFlag.material.map?.isDataTexture, 'Islamic University flag uses crisp DataTexture');

  // Verify authentic palette colors are present in generated flag textures
  const hasApproxRgb = (tex, target, tol = 18) => {
    const d = tex.image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - target[0]) <= tol && Math.abs(d[i + 1] - target[1]) <= tol && Math.abs(d[i + 2] - target[2]) <= tol) {
        return true;
      }
    }
    return false;
  };
  assert.ok(hasApproxRgb(bdFlag.material.map, [0x00, 0x6a, 0x4e]), 'Bangladesh flag contains bottle green #006a4e');
  assert.ok(hasApproxRgb(bdFlag.material.map, [0xf4, 0x2a, 0x41]), 'Bangladesh flag contains crimson disc #f42a41');
  assert.ok(hasApproxRgb(iuFlag.material.map, [0x0f, 0x52, 0x2e]), 'IU flag contains deep emerald #0f522e');
  assert.ok(hasApproxRgb(iuFlag.material.map, [0xe5, 0xbc, 0x70]), 'IU flag contains warm gold crest/border #e5bc70');

  // Record initial vertex Z positions, advance time via update(dt), and verify sine-wave motion
  const snapshotZ = mesh => Float32Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => mesh.geometry.getAttribute('position').getZ(i));
  const bdBefore = snapshotZ(bdFlag);
  const iuBefore = snapshotZ(iuFlag);

  model.update(0.28);

  const bdAfter = snapshotZ(bdFlag);
  const iuAfter = snapshotZ(iuFlag);
  let bdMaxDelta = 0, iuMaxDelta = 0;
  for (let i = 0; i < bdBefore.length; i++) {
    bdMaxDelta = Math.max(bdMaxDelta, Math.abs(bdAfter[i] - bdBefore[i]));
    iuMaxDelta = Math.max(iuMaxDelta, Math.abs(iuAfter[i] - iuBefore[i]));
  }
  assert.ok(bdMaxDelta > 0.02, `Bangladesh flag cloth ripples during update(dt) (maxDelta=${bdMaxDelta.toFixed(4)})`);
  assert.ok(iuMaxDelta > 0.02, `IU flag cloth ripples during update(dt) (maxDelta=${iuMaxDelta.toFixed(4)})`);

  // Verify hoist edge (smallest local X vertices) stays strictly pinned at Z = 0
  for (const flag of [bdFlag, iuFlag]) {
    const pos = flag.geometry.getAttribute('position');
    const norm = flag.geometry.getAttribute('normal');
    let minX = Infinity;
    for (let i = 0; i < pos.count; i++) minX = Math.min(minX, pos.getX(i));
    let hoistCount = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i) - minX) < 1e-4) {
        assert.equal(pos.getZ(i), 0, `${flag.name}: hoist vertex stays pinned at z=0`);
        hoistCount++;
      }
    }
    assert.equal(hoistCount, 5, `${flag.name}: all 5 hoist column vertices pinned`);
    assert.ok([...pos.array].every(Number.isFinite));
    assert.ok([...norm.array].every(Number.isFinite));
  }

  // Non-finite or negative dt must remain safe
  model.update(NaN);
  model.update(-5);
  assert.ok([...bdFlag.geometry.getAttribute('position').array].every(Number.isFinite));

  model.dispose();
  // Calling update(dt) after dispose must be a safe no-op
  assert.doesNotThrow(() => model.update(0.5));
});

test('fallback default entrances and custom baseHeight work cleanly across landmarks', () => {
  for (const { spec, building } of targetBuildings) {
    const fallback = buildAcademicLandmark(building);
    assert.equal(fallback.diagnostics.entries[0].source, 'illustrative-longest-edge');
    assert.ok(fallback.diagnostics.vertexCount < 55000);
    // Safe no-op update on non-Admin landmarks
    assert.doesNotThrow(() => fallback.update(0.16));
    fallback.dispose();
  }

  const { building } = targetBuildings.find(t => t.spec.key === 'rabindraNazrul');
  const outerEdge = wallEdges(building.polygons[0]).find(e => !e.ringIndex && e.length > 20);
  const custom = buildAcademicLandmark(building, {
    entrances: [{ edge: outerEdge, distance: outerEdge.length / 2, source: 'surveyed' }],
    baseHeight: 12.8,
  });
  assert.equal(custom.diagnostics.baseHeight, 12.8);
  assert.equal(custom.diagnostics.entries[0].surveyed, true);
  assert.ok(custom.diagnostics.vertexCount < 55000, '4-storey Rabindra custom height still stays under 55k vertex budget');
  custom.dispose();
});

test('dispose() is 100% idempotent and releases every geometry, material and flag texture exactly once', () => {
  for (const { spec, building, entrances } of targetBuildings) {
    const model = buildAcademicLandmark(building, { entrances });
    const parent = new THREE.Group();
    parent.add(model.group);

    const disposedGeos = new Map();
    const disposedMats = new Map();
    const disposedTexs = new Map();

    for (const child of model.group.children) {
      if (!child.isMesh) continue;
      const g = child.geometry, m = child.material;
      disposedGeos.set(g, 0);
      g.addEventListener('dispose', () => disposedGeos.set(g, disposedGeos.get(g) + 1));
      disposedMats.set(m, 0);
      m.addEventListener('dispose', () => disposedMats.set(m, disposedMats.get(m) + 1));
      if (m.map) {
        disposedTexs.set(m.map, 0);
        m.map.addEventListener('dispose', () => disposedTexs.set(m.map, disposedTexs.get(m.map) + 1));
      }
    }

    assert.equal(disposedGeos.size, spec.drawCalls);
    assert.equal(disposedMats.size, spec.drawCalls);
    assert.equal(disposedTexs.size, spec.key === 'administration' ? 2 : 0);

    model.dispose();
    model.dispose();

    for (const count of disposedGeos.values()) assert.equal(count, 1, `${spec.key}: geometry disposed exactly once`);
    for (const count of disposedMats.values()) assert.equal(count, 1, `${spec.key}: material disposed exactly once`);
    for (const count of disposedTexs.values()) assert.equal(count, 1, `${spec.key}: flag texture disposed exactly once`);
    assert.equal(model.group.children.length, 0);
    assert.equal(parent.children.length, 0);
  }
});

test('identity, polygon, height and entrance validation reject unusable inputs', () => {
  const { building } = targetBuildings[0];
  assert.throws(() => buildAcademicLandmark({ ...building, id: '999' }), TypeError);
  assert.throws(() => buildAcademicLandmark({ ...building, osmType: 'way' }), TypeError);
  assert.throws(() => buildAcademicLandmark(building, { baseHeight: NaN }), RangeError);
  assert.throws(() => buildAcademicLandmark(building, { baseHeight: 2 }), RangeError);
  assert.throws(() => buildAcademicLandmark(building, { entrances: [] }), TypeError);
  assert.throws(() => buildAcademicLandmark(building, { entrances: [{ edge: { a: [0, 0], b: [5, 0] }, distance: 2 }] }), RangeError);
  assert.throws(() => buildAcademicLandmark({ ...building, polygons: [[[[0, 0], [5, 0], [NaN, 5], [0, 0]]]] }), TypeError);
});
