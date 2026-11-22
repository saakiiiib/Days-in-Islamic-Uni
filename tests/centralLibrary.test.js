import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/osm.js';
import { pointInPolygon, pointToSegmentDistance } from '../src/map/geometry.js';
import { chooseEntries, wallEdges } from '../src/world/facades.js';
import { buildCentralLibrary, CENTRAL_LIBRARY_ID } from '../src/world/landmarks/centralLibrary.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const building = map.buildings.find(b => b.id === CENTRAL_LIBRARY_ID);
const entrances = chooseEntries(building, map.roads, map.entrances);

test('central library retains the mapped OSM footprint with single-batch bounded geometry', () => {
  const snapshot = JSON.stringify(building);
  const model = buildCentralLibrary(building, { entrances });
  assert.equal(JSON.stringify(building), snapshot, 'source map data remains caller-owned');
  assert.equal(model.diagnostics.osmType, 'way');
  assert.equal(model.diagnostics.osmId, CENTRAL_LIBRARY_ID);
  assert.equal(model.diagnostics.drawCalls, 1);
  assert.equal(model.diagnostics.collisionObjects, 0);
  assert.equal(model.diagnostics.monumentalArchCount, 2, 'primary facade features two monumental arched recesses');
  assert.ok(model.diagnostics.forkedColumnCount >= 16, 'rhythmic white forked Y-columns line the outer facades');
  assert.ok(model.diagnostics.windowBayCount >= 30, 'recessed dark steel-grille window bays span storeys');
  assert.ok(model.diagnostics.monitorPolygons.length >= 1, 'central roof skylight/stair monitor is placed');

  const mesh = model.group.children[0], geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = geometry.getAttribute('color');
  assert.equal(geometry.groups.length, 0, 'single vertex-colored draw batch');
  assert.equal(geometry.index, null, 'non-indexed geometry');
  assert.equal(positions.count, colors.count);
  assert.equal(positions.count, normals.count);
  assert.ok(positions.count < 55000, 'vertex count stays within budget');
  assert.ok([...positions.array].every(Number.isFinite));
  assert.ok([...normals.array].every(Number.isFinite));

  for (let i = 0; i < positions.count; i++) {
    const p = [positions.getX(i), positions.getZ(i)];
    if (pointInPolygon(p, building.polygons[0])) continue;
    const distance = Math.min(...building.polygons[0][0].slice(1).map((b, j) => pointToSegmentDistance(p, building.polygons[0][0][j], b)));
    assert.ok(distance <= model.diagnostics.maxHorizontalExtent + 1e-3, 'overhang and facade trim remain tightly bounded to footprint');
  }

  for (const poly of model.diagnostics.monitorPolygons) for (const ring of poly) for (const p of ring) {
    assert.ok(pointInPolygon(p, building.polygons[0]), 'rooftop skylight monitor stays strictly inside mapped roof');
  }
  assert.ok(Math.abs(geometry.boundingBox.max.y - (building.height + model.diagnostics.roofRise)) < 1e-4);
  model.dispose();
});

test('primary road-facing entrance remains visually clear at ground level beneath overhead canopy and roof overhang', () => {
  const model = buildCentralLibrary(building, { entrances });
  model.group.updateMatrixWorld(true);
  const entry = entrances[0], edge = entry.edge;
  for (const y of [.08, .8, 1.75, 3.0]) for (const offset of [-.6, 0, .6]) {
    const at = edge.at(entry.distance + offset, y, 2);
    const ray = new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(-edge.nx, 0, -edge.nz), 0, 2.3);
    assert.equal(ray.intersectObject(model.group, true).length, 0, `entry aperture stays open at y=${y}, offset=${offset}`);
  }
  // Overhead entrance canopy & projecting flat roof slab must both be present above entry
  const canopyRay = new THREE.Raycaster(new THREE.Vector3(...edge.at(entry.distance, 4.2, .45)), new THREE.Vector3(0, -1, 0), 0, 1.5);
  assert.ok(canopyRay.intersectObject(model.group, true).length > 0, 'entrance canopy shelters the entry');
  const roofRay = new THREE.Raycaster(new THREE.Vector3(...edge.at(entry.distance, building.height + 2, .75)), new THREE.Vector3(0, -1, 0), 0, 3);
  assert.ok(roofRay.intersectObject(model.group, true).length > 0, 'deep cantilevered roof overhang projects 0.95m beyond outer wall');
  model.dispose();
});

test('custom height, overhang and explicit mapped-edge entrances work cleanly alongside fallback defaults', () => {
  const edge = wallEdges(building.polygons[0]).find(e => !e.ringIndex && e.length > 30);
  const custom = buildCentralLibrary(building, {
    entrances: [{ edge, distance: edge.length / 2, source: 'surveyed' }],
    baseHeight: 12.8,
    roofOverhang: .65,
  });
  assert.equal(custom.diagnostics.baseHeight, 12.8);
  assert.equal(custom.diagnostics.roofOverhang, .65);
  assert.equal(custom.diagnostics.entries[0].surveyed, true);
  assert.equal(custom.diagnostics.monumentalArchCount, 2);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(custom.group).max.y - (12.8 + custom.diagnostics.roofRise)) < 1e-4);
  custom.dispose();

  const fallback = buildCentralLibrary(building);
  assert.equal(fallback.diagnostics.entries[0].source, 'illustrative-longest-edge');
  assert.equal(fallback.diagnostics.monumentalArchCount, 2);
  fallback.dispose();
});

test('central library resources are disposed exactly once and detached cleanly', () => {
  const model = buildCentralLibrary(building), mesh = model.group.children[0], parent = new THREE.Group();
  parent.add(model.group);
  let g = 0, m = 0;
  mesh.geometry.addEventListener('dispose', () => g++);
  mesh.material.addEventListener('dispose', () => m++);
  model.dispose(); model.dispose();
  assert.equal(g, 1); assert.equal(m, 1);
  assert.equal(model.group.children.length, 0);
  assert.equal(parent.children.length, 0);
});

test('identity, footprint, height, overhang and entry validation reject unusable inputs', () => {
  assert.throws(() => buildCentralLibrary({ ...building, id: '1' }), /way 532464097/);
  assert.throws(() => buildCentralLibrary({ ...building, osmType: 'relation' }), /way 532464097/);
  assert.throws(() => buildCentralLibrary(building, { baseHeight: NaN }), /finite/);
  assert.throws(() => buildCentralLibrary(building, { roofOverhang: 4 }), /limits/);
  assert.throws(() => buildCentralLibrary(building, { entrances: [] }), /nonempty/);
  assert.throws(() => buildCentralLibrary(building, { entrances: [{ edge: { a: [0, 0], b: [5, 0] }, distance: 2 }] }), /mapped outer edge/);
  assert.throws(() => buildCentralLibrary({ ...building, polygons: [[[[0, 0], [1, 0], [NaN, 2], [0, 0]]]] }), /finite/);
});
