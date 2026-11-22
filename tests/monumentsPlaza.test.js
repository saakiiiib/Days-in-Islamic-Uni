import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData, pointToSegmentDistance, pointInMultiPolygon } from '../src/map/index.js';
import { buildMonumentsPlaza, MONUMENT_PLACEMENTS } from '../src/world/landmarks/monumentsPlaza.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));

function distanceToPolygons(point, polygons) {
  let best = Infinity;
  for (const polygon of polygons ?? []) {
    if (pointInMultiPolygon(point, [polygon])) return 0;
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        best = Math.min(best, pointToSegmentDistance(point, ring[i - 1], ring[i]));
      }
    }
  }
  return best;
}

function distanceToRoad(point, road) {
  let best = distanceToPolygons(point, road.polygons);
  for (const path of road.paths ?? []) {
    for (let i = 1; i < path.length; i++) {
      best = Math.min(best, pointToSegmentDistance(point, path[i - 1], path[i]));
    }
  }
  return best;
}

test('MONUMENT_PLACEMENTS exposes frozen verified coordinates for all four heritage monuments', () => {
  assert.ok(Object.isFrozen(MONUMENT_PLACEMENTS));
  assert.equal(MONUMENT_PLACEMENTS.length, 4);
  const byId = Object.fromEntries(MONUMENT_PLACEMENTS.map(p => [p.id, p]));
  assert.deepEqual(Object.keys(byId).sort(), [
    'martyrs-memorial', 'mukta-bangla', 'shaheed-minar', 'sotota-fountain',
  ]);
  for (const p of MONUMENT_PLACEMENTS) {
    assert.ok(Object.isFrozen(p));
    assert.equal(typeof p.name, 'string');
    assert.ok(p.bn.length > 0);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw));
    assert.ok(Number.isFinite(p.clearRadius) && p.clearRadius >= 10);
  }
  assert.equal(byId['mukta-bangla'].bn, 'মুক্ত বাংলা');
  assert.equal(byId['shaheed-minar'].bn, 'শহীদ মিনার');
  assert.equal(byId['martyrs-memorial'].bn, 'স্মৃতিসৌধ');
  assert.equal(byId['sotota-fountain'].bn, 'সততা ফোয়ারা');
});

test('all four heritage monuments build cleanly within draw-call, vertex and zero-collider budgets', () => {
  const plaza = buildMonumentsPlaza(map);
  plaza.group.updateMatrixWorld(true);
  const { group, placements, diagnostics } = plaza;

  assert.equal(group.name, 'campus-heritage-monuments-plaza');
  assert.equal(placements.length, 4);
  assert.equal(diagnostics.monumentCount, 4);
  assert.equal(diagnostics.collisionObjects, 0);
  assert.ok(diagnostics.drawCalls <= 8, `expected <= 8 draw calls, got ${diagnostics.drawCalls}`);
  assert.ok(diagnostics.drawCalls <= 10);

  const meshes = [];
  group.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
  assert.equal(meshes.length, diagnostics.drawCalls);

  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position');
    const col = mesh.geometry.getAttribute('color');
    assert.ok(pos && pos.count > 0, `${mesh.name} has non-empty positions`);
    assert.ok([...pos.array].every(Number.isFinite), `${mesh.name} has finite vertices`);
    assert.equal(col.count, pos.count, `${mesh.name} has matching vertex colors`);
    assert.equal(mesh.geometry.groups.length, 0, `${mesh.name} is single-group merged geometry`);
  }

  // Verify Mukta Bangla single-mesh budget & silhouette height (~9.5 m)
  const muktaMesh = group.getObjectByName('mukta-bangla-monument');
  assert.ok(muktaMesh && muktaMesh.isMesh);
  assert.ok(muktaMesh.geometry.getAttribute('position').count <= 14000,
    `Mukta Bangla verts ${muktaMesh.geometry.getAttribute('position').count} <= 14000`);
  assert.ok(Math.abs(muktaMesh.material.roughness - 0.76) < 1e-6);
  const muktaBox = new THREE.Box3().setFromObject(muktaMesh);
  const muktaHeight = muktaBox.max.y - muktaBox.min.y;
  assert.ok(muktaHeight >= 9.2 && muktaHeight <= 9.8, `Mukta Bangla height ${muktaHeight} ~9.5 m`);

  // Verify upgraded Shaheed Minar & Martyrs' Memorial material calibration & heights
  const minarMesh = group.getObjectByName('shaheed-minar-frames-disc-and-plaza');
  assert.ok(minarMesh && Math.abs(minarMesh.material.roughness - 0.78) < 1e-6);
  assert.ok(Math.abs(minarMesh.material.envMapIntensity - 0.4) < 1e-6);
  const minarBox = new THREE.Box3().setFromObject(minarMesh);
  assert.ok(Math.abs((minarBox.max.y - minarBox.min.y) - 11.5) < 1e-3);

  const memorialMesh = group.getObjectByName('martyrs-memorial-shell-portals-and-wings');
  assert.ok(memorialMesh && Math.abs(memorialMesh.material.roughness - 0.84) < 1e-6);
  assert.ok(Math.abs(memorialMesh.material.envMapIntensity - 0.35) < 1e-6);
  const memorialBox = new THREE.Box3().setFromObject(memorialMesh);
  assert.ok(Math.abs((memorialBox.max.y - memorialBox.min.y) - 14.0) < 1e-3);

  // Verify Sotota Fountain stonework (~4.2 m), water pool, and animated water jets
  const fountainStone = group.getObjectByName('sotota-fountain-stonework');
  const fountainPool = group.getObjectByName('sotota-fountain-water-pool');
  const fountainJets = group.getObjectByName('sotota-fountain-water-jets');
  assert.ok(fountainStone && fountainPool && fountainJets);
  const stoneBox = new THREE.Box3().setFromObject(fountainStone);
  const stoneHeight = stoneBox.max.y - stoneBox.min.y;
  assert.ok(stoneHeight >= 4.0 && stoneHeight <= 4.4, `Sotota Fountain stonework height ${stoneHeight} ~4.2 m`);

  plaza.dispose();
});

test('every monument placement on public/data/map.osm clears mapped buildings (>= 10 m) and roads (>= 8 m)', () => {
  for (const p of MONUMENT_PLACEMENTS) {
    const pt = [p.x, p.z];

    let minBuildingDist = Infinity;
    for (const building of map.buildings ?? []) {
      minBuildingDist = Math.min(minBuildingDist, distanceToPolygons(pt, building.polygons));
    }
    assert.ok(minBuildingDist >= 10,
      `${p.id} building clearance ${minBuildingDist.toFixed(2)} m must be >= 10 m`);

    let minRoadDist = Infinity;
    for (const road of map.roads ?? []) {
      minRoadDist = Math.min(minRoadDist, distanceToRoad(pt, road));
    }
    assert.ok(minRoadDist >= 8,
      `${p.id} road clearance ${minRoadDist.toFixed(2)} m must be >= 8 m`);

    let minWaterDist = Infinity;
    for (const water of map.water ?? []) {
      minWaterDist = Math.min(minWaterDist, distanceToPolygons(pt, water.polygons));
    }
    assert.ok(minWaterDist >= 8,
      `${p.id} water clearance ${minWaterDist.toFixed(2)} m must be >= 8 m`);

    const hostGarden = (map.greens ?? []).find(g => String(g.id) === p.gardenId);
    assert.ok(hostGarden, `${p.id} references valid campus garden ${p.gardenId}`);
    assert.ok(pointInMultiPolygon(pt, hostGarden.polygons),
      `${p.id} sits inside mapped campus garden ${p.gardenId}`);
  }

  // Pairwise monument separation keeps ceremonial plazas cleanly distinct without overlapping
  for (let i = 0; i < MONUMENT_PLACEMENTS.length; i++) {
    for (let j = i + 1; j < MONUMENT_PLACEMENTS.length; j++) {
      const a = MONUMENT_PLACEMENTS[i], b = MONUMENT_PLACEMENTS[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(dist >= 30, `${a.id} and ${b.id} separation ${dist.toFixed(1)} m must be >= 30 m`);
    }
  }
});

test('update(dt) animates Sotota Fountain smoothly without throwing and dispose() is 100% idempotent', () => {
  const plaza = buildMonumentsPlaza();
  const parent = new THREE.Group();
  parent.add(plaza.group);

  const jetsPivot = plaza.group.getObjectByName('sotota-fountain-jets-pivot');
  const jetsMesh = plaza.group.getObjectByName('sotota-fountain-water-jets');
  const poolMesh = plaza.group.getObjectByName('sotota-fountain-water-pool');
  assert.ok(jetsPivot && jetsMesh && poolMesh);

  const initialScaleY = jetsPivot.scale.y;
  const initialOpacity = jetsMesh.material.opacity;
  plaza.update(0.35);
  assert.notEqual(jetsPivot.scale.y, initialScaleY, 'water-jet arc scale animates');
  assert.notEqual(jetsMesh.material.opacity, initialOpacity, 'water-jet mist opacity shimmers');
  assert.ok(Number.isFinite(poolMesh.material.roughness));

  // Edge dt values never throw or produce non-finite state
  for (const dt of [0, -0.5, NaN, Infinity, undefined, 0.016, 1.2]) {
    plaza.update(dt);
    assert.ok(Number.isFinite(jetsPivot.scale.y));
    assert.ok(Number.isFinite(jetsMesh.material.opacity));
    assert.ok(Number.isFinite(poolMesh.material.roughness));
  }

  // Track exact disposal counts for EVERY unique geometry and material (including nested Minar & Memorial)
  const geometries = new Set();
  const materials = new Set();
  plaza.group.traverse(obj => {
    if (obj.isMesh) {
      geometries.add(obj.geometry);
      materials.add(obj.material);
    }
  });
  const disposedGeometries = new Map();
  const disposedMaterials = new Map();
  for (const g of geometries) {
    disposedGeometries.set(g, 0);
    g.addEventListener('dispose', () => disposedGeometries.set(g, disposedGeometries.get(g) + 1));
  }
  for (const m of materials) {
    disposedMaterials.set(m, 0);
    m.addEventListener('dispose', () => disposedMaterials.set(m, disposedMaterials.get(m) + 1));
  }

  plaza.dispose();
  plaza.dispose();
  plaza.update(0.016);

  assert.equal(parent.children.length, 0);
  assert.equal(plaza.group.children.length, 0);
  for (const [g, count] of disposedGeometries) {
    assert.equal(count, 1, `geometry ${g.uuid} disposed exactly once`);
  }
  for (const [m, count] of disposedMaterials) {
    assert.equal(count, 1, `material ${m.uuid} disposed exactly once`);
  }
});
