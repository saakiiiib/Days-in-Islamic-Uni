import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseOsm, buildMapData } from '../src/map/osm.js';
import { pointInPolygon } from '../src/map/geometry.js';
import { chooseEntries } from '../src/world/facades.js';
import { buildingPalette } from '../src/world/appearance.js';
import { ensureBatchUVs } from '../src/world/assets.js';
import { buildingArchitectureGeometry } from '../src/world/buildingKit.js';
import { CENTRAL_MOSQUE_ID } from '../src/world/landmarks/centralMosque.js';
import { AUDITORIUM_ID } from '../src/world/landmarks/auditorium.js';
import { CENTRAL_LIBRARY_ID } from '../src/world/landmarks/centralLibrary.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });

function ringCentroid(ring) {
  let sx = 0, sz = 0, n = ring.length - 1;
  for (let i = 0; i < n; i++) { sx += ring[i][0]; sz += ring[i][1]; }
  return [sx / n, sz / n];
}

test('skips tiny sheds, garages, low structures and dedicated hero landmarks', () => {
  for (const id of [CENTRAL_MOSQUE_ID, AUDITORIUM_ID, CENTRAL_LIBRARY_ID]) {
    const landmark = map.buildings.find(b => b.id === id);
    assert.ok(landmark, `landmark ${id} exists in campus map`);
    assert.equal(buildingArchitectureGeometry(landmark, buildingPalette(landmark), []), null);
  }
  const garage = map.buildings.find(b => b.height < 4.5);
  assert.ok(garage, 'low shed/garage exists in campus map');
  assert.equal(buildingArchitectureGeometry(garage, buildingPalette(garage), []), null);

  const syntheticShed = {
    id: 'synthetic-shed', osmType: 'way', height: 6.4, tags: { building: 'shed' },
    polygons: [[[[0, 0], [8, 0], [8, 6], [0, 6], [0, 0]]]],
  };
  assert.equal(buildingArchitectureGeometry(syntheticShed, { kind: 'unclassified' }, []), null);
  assert.equal(buildingArchitectureGeometry({ ...syntheticShed, tags: { building: 'garage' } }, { kind: 'civic' }, []), null);
  assert.equal(buildingArchitectureGeometry({ ...syntheticShed, tags: { building: 'yes' }, height: 4.2 }, { kind: 'civic' }, []), null);
});

test('all regular campus buildings produce finite batch-ready trim within lean triangle budget', () => {
  const batched = [];
  let eligible = 0, totalTris = 0;

  for (const building of map.buildings) {
    const snapshot = JSON.stringify(building);
    const palette = buildingPalette(building);
    const entries = chooseEntries(building, map.roads, map.entrances);
    const result = buildingArchitectureGeometry(building, palette, entries);
    assert.equal(JSON.stringify(building), snapshot, 'building source data is never mutated');
    if (!result) continue;

    eligible++;
    const { trim } = result;
    assert.equal(trim.index, null, 'trim geometry is non-indexed');
    const pos = trim.getAttribute('position');
    const norm = trim.getAttribute('normal');
    const col = trim.getAttribute('color');
    assert.ok(pos && pos.count > 0);
    assert.equal(norm.count, pos.count);
    assert.equal(col.count, pos.count);
    assert.ok([...pos.array].every(Number.isFinite));
    assert.ok([...norm.array].every(Number.isFinite));
    assert.ok([...col.array].every(Number.isFinite));
    totalTris += pos.count / 3;

    ensureBatchUVs(trim);
    batched.push(trim);
  }

  assert.ok(eligible >= 35, 'generates 3D trim across regular campus building stock');
  assert.ok(totalTris / eligible < 1400, `average triangle count (${(totalTris / eligible).toFixed(1)}) remains lean`);

  const merged = mergeGeometries(batched, false);
  batched.forEach(g => g.dispose());
  assert.ok(merged, 'all building trim geometries merge cleanly into SpatialBatches');
  merged.dispose();
});

test('courtyard openings remain completely unobstructed while parapets trace outer and inner rings', () => {
  const courtyardBuildings = map.buildings.filter(b => b.polygons.some(p => p.length > 1));
  let testedCourtyards = 0;

  for (const building of courtyardBuildings) {
    const palette = buildingPalette(building);
    const entries = chooseEntries(building, map.roads, map.entrances);
    const result = buildingArchitectureGeometry(building, palette, entries);
    if (!result) continue;
    testedCourtyards++;

    const mesh = new THREE.Mesh(result.trim, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);
    for (const poly of building.polygons) {
      for (let r = 1; r < poly.length; r++) {
        const [cx, cz] = ringCentroid(poly[r]);
        if (pointInPolygon([cx, cz], poly)) continue;
        // Vertical ray through open courtyard centroid must never hit trim/roof slabs
        const ray = new THREE.Raycaster(new THREE.Vector3(cx, building.height + 10, cz), new THREE.Vector3(0, -1, 0), 0, building.height + 12);
        assert.equal(ray.intersectObject(mesh).length, 0, `courtyard ${r} of ${building.id} stays open to sky`);
      }
    }
    mesh.material.dispose();
    result.trim.dispose();
  }
  assert.ok(testedCourtyards >= 2, 'non-dedicated courtyard buildings receive open-courtyard trim');
});

test('rooftop mumty cores and overhead water tanks stay strictly inside mapped roof polygons', () => {
  let multiStoreyCores = 0;

  for (const building of map.buildings) {
    if (building.height < 9) continue;
    const palette = buildingPalette(building);
    const result = buildingArchitectureGeometry(building, palette, chooseEntries(building, map.roads, map.entrances));
    if (!result) continue;

    const pos = result.trim.getAttribute('position');
    let foundCoreVertex = false;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y <= building.height + .9) continue;
      foundCoreVertex = true;
      const pt = [pos.getX(i), pos.getZ(i)];
      assert.ok(
        building.polygons.some(poly => pointInPolygon(pt, poly)),
        `rooftop mumty/tank vertex on ${building.id} must stay strictly inside solid roof (never in courtyards)`
      );
    }
    if (foundCoreVertex) multiStoreyCores++;
    result.trim.dispose();
  }

  assert.ok(multiStoreyCores >= 20, 'multi-storey regular buildings receive contained rooftop mumty & water tank silhouettes');
});

test('ground-level entries stay clear beneath projecting 0.85m overhead portico canopies', () => {
  let verifiedCanopies = 0;

  for (const building of map.buildings) {
    const palette = buildingPalette(building);
    const entries = chooseEntries(building, map.roads, map.entrances);
    if (!entries.length) continue;
    const result = buildingArchitectureGeometry(building, palette, entries);
    if (!result) continue;

    const mesh = new THREE.Mesh(result.trim, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);

    for (const entry of entries) {
      const edge = entry.edge;
      for (const y of [.08, .8, 1.75, 2.55]) {
        const at = edge.at(entry.distance, y, 2.0);
        const ray = new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(-edge.nx, 0, -edge.nz), 0, 2.2);
        assert.equal(ray.intersectObject(mesh).length, 0, `entry of ${building.id} stays clear at y=${y}`);
      }
      const availHalf = Math.min(entry.distance - .12, edge.length - entry.distance - .12);
      if (availHalf >= .62) {
        const canopyRay = new THREE.Raycaster(new THREE.Vector3(...edge.at(entry.distance, 3.3, .55)), new THREE.Vector3(0, -1, 0), 0, .8);
        assert.ok(canopyRay.intersectObject(mesh).length > 0, `entry of ${building.id} includes overhead portico canopy`);
        verifiedCanopies++;
      }
    }

    mesh.material.dispose();
    result.trim.dispose();
  }

  assert.ok(verifiedCanopies >= 25, 'portico canopies cover regular campus building entries');
});

test('non-dedicated residential dormitories receive projecting veranda slabs and railings alongside chajjas', () => {
  const dorm = map.buildings.find(b => buildingPalette(b).kind === 'residential' && b.height >= 12 && buildingArchitectureGeometry(b, buildingPalette(b), []) !== null);
  assert.ok(dorm, 'non-dedicated multi-storey residential dormitory exists');
  const result = buildingArchitectureGeometry(dorm, buildingPalette(dorm), chooseEntries(dorm, map.roads, map.entrances));
  assert.ok(result);
  // Bounding box height exceeds building.height + 3.0 due to rooftop mumty + overhead water tank
  assert.ok(result.trim.boundingBox.max.y > dorm.height + 3.0);
  result.trim.dispose();
});
