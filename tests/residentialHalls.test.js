import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { pointInPolygon, pointToSegmentDistance } from '../src/map/geometry.js';
import { HALL_OBSERVATIONS } from '../src/data/hall-observations.js';
import { chooseEntries } from '../src/world/facades.js';
import { buildingPalette } from '../src/world/appearance.js';
import {
  RESIDENTIAL_HALL_IDS,
  SHAH_AZIZUR_POND_ID,
  isResidentialHallLandmark,
  buildResidentialHall,
  buildShahAzizurPondGhat,
} from '../src/world/landmarks/residentialHalls.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
const allHallIds = Object.values(RESIDENTIAL_HALL_IDS);
const hallBuildings = allHallIds.map(id => {
  const b = map.buildings.find(item => item.osmType === 'way' && item.id === id);
  assert.ok(b, `expected OSM way/${id} in public/data/map.osm`);
  return b;
});

test('RESIDENTIAL_HALL_IDS is frozen and isResidentialHallLandmark strictly validates OSM way type and membership', () => {
  assert.ok(Object.isFrozen(RESIDENTIAL_HALL_IDS));
  assert.equal(allHallIds.length, 9, 'contains all 8 residential halls + Jia Hall Mosque');
  assert.ok(allHallIds.includes('532464837'));
  assert.ok(allHallIds.includes('967967197'));
  assert.ok(allHallIds.includes('532464846'));
  assert.ok(allHallIds.includes('967967198'));
  assert.ok(allHallIds.includes('532464712'));
  assert.ok(allHallIds.includes('532464760'));
  assert.ok(allHallIds.includes('970015480'));
  assert.ok(allHallIds.includes('970015482'));
  assert.ok(allHallIds.includes('1317423300'));

  for (const building of hallBuildings) {
    assert.equal(isResidentialHallLandmark(building), true, `accepts way/${building.id}`);
    assert.equal(isResidentialHallLandmark({ ...building, osmType: 'relation' }), false, 'rejects relation');
    assert.equal(isResidentialHallLandmark({ id: building.id }), false, 'rejects missing osmType');
  }
  assert.equal(isResidentialHallLandmark({ id: '532464097', osmType: 'way' }), false, 'rejects Central Library');
  assert.equal(isResidentialHallLandmark({ id: '1317423259', osmType: 'way' }), false, 'rejects Central Mosque');
  assert.equal(isResidentialHallLandmark(null), false);
});

test('all 8 residential halls and Jia Hall Mosque produce bounded single-draw-call geometry under 45,000 vertices', () => {
  const obsSnapshot = JSON.stringify(HALL_OBSERVATIONS);

  for (const building of hallBuildings) {
    const before = JSON.stringify(building);
    const entrances = chooseEntries(building, map.roads, map.entrances);
    const palette = buildingPalette(building);
    const model = buildResidentialHall(building, { entrances, palette, baseHeight: building.height });

    assert.equal(JSON.stringify(building), before, `source building way/${building.id} is never mutated`);
    assert.equal(model.diagnostics.osmType, 'way');
    assert.equal(model.diagnostics.osmId, building.id);
    assert.equal(model.diagnostics.drawCalls, 1);
    assert.equal(model.diagnostics.collisionObjects, 0);
    assert.equal(model.group.children.length, 1);

    const mesh = model.group.children[0];
    const geometry = mesh.geometry;
    const material = mesh.material;

    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
    assert.equal(material.vertexColors, true);
    assert.equal(material.roughness, 0.82);
    assert.equal(material.envMapIntensity, 0.34);

    assert.equal(geometry.groups.length, 0, 'single vertex-colored batch');
    assert.equal(geometry.index, null, 'non-indexed geometry');
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    assert.equal(positions.count, normals.count);
    assert.equal(positions.count, colors.count);
    assert.ok(positions.count > 4000, `way/${building.id} has substantial architectural geometry`);
    assert.ok(positions.count < 45000, `way/${building.id} stays below 45,000 vertex budget (got ${positions.count})`);
    assert.ok([...positions.array].every(Number.isFinite), `way/${building.id} positions are finite`);
    assert.ok([...normals.array].every(Number.isFinite), `way/${building.id} normals are finite`);
    assert.ok([...colors.array].every(Number.isFinite), `way/${building.id} colors are finite`);

    // Strictly obeys observed hall-observations.js wall colors
    const observedWall = HALL_OBSERVATIONS[`way/${building.id}`]?.fields?.wallColor?.value;
    if (observedWall) {
      assert.equal(model.diagnostics.wallColorHex, observedWall, `way/${building.id} obeys hall-observations wallColor`);
    }

    // Geometry remains tightly bounded around the mapped OSM footprint (max gateway projection <= 3.5m)
    const polygon = building.polygons[0];
    const outerRing = polygon[0];
    for (let i = 0; i < positions.count; i++) {
      const p = [positions.getX(i), positions.getZ(i)];
      if (pointInPolygon(p, polygon)) continue;
      let dist = Infinity;
      for (let j = 1; j < outerRing.length; j++) {
        const d = pointToSegmentDistance(p, outerRing[j - 1], outerRing[j]);
        if (d < dist) dist = d;
      }
      assert.ok(dist <= 3.5, `way/${building.id} vertex stays within 3.5 m of footprint (got ${dist.toFixed(2)} m)`);
    }

    assert.ok(geometry.boundingBox.min.y >= -0.05, `way/${building.id} does not sink below ground`);
    assert.ok(geometry.boundingBox.max.y > building.height + 0.5, `way/${building.id} has rooftop architecture`);
    model.dispose();
  }

  assert.equal(JSON.stringify(HALL_OBSERVATIONS), obsSnapshot, 'HALL_OBSERVATIONS remains completely unmutated');
});

test('all 8 residential halls and Jia Hall Mosque keep ground-level entrances 100% raycast-clear (y = 0.08..2.6)', () => {
  for (const building of hallBuildings) {
    const entrances = chooseEntries(building, map.roads, map.entrances);
    const palette = buildingPalette(building);
    const model = buildResidentialHall(building, { entrances, palette, baseHeight: building.height });
    model.group.updateMatrixWorld(true);

    const entry = entrances[0];
    const edge = entry.edge;
    for (const y of [0.08, 0.65, 1.35, 2.0, 2.6]) {
      for (const offset of [-0.85, -0.4, 0, 0.4, 0.85]) {
        const origin = edge.at(entry.distance + offset, y, 8.0);
        const dir = new THREE.Vector3(-edge.nx, 0, -edge.nz);
        const ray = new THREE.Raycaster(new THREE.Vector3(...origin), dir, 0, 8.05);
        const hits = ray.intersectObject(model.group, true);
        assert.equal(
          hits.length,
          0,
          `way/${building.id} (${building.name}) entrance must stay clear at y=${y}, offset=${offset}`,
        );
      }
    }
    model.dispose();
  }
});

test('distinct architectural signatures are verifiable across halls, gates, pediment, portal, and Jia Hall Mosque dome', () => {
  const buildFor = id => {
    const b = map.buildings.find(x => x.osmType === 'way' && x.id === id);
    const entrances = chooseEntries(b, map.roads, map.entrances);
    const palette = buildingPalette(b);
    const model = buildResidentialHall(b, { entrances, palette, baseHeight: b.height });
    model.group.updateMatrixWorld(true);
    return { b, entry: entrances[0], model };
  };

  // July-36 Hall: signature triangular pediment canopy peaking cleanly above entry center + projecting roof eaves
  {
    const { b, entry, model } = buildFor(RESIDENTIAL_HALL_IDS.JULY_36);
    assert.equal(model.diagnostics.hasTriangularPediment, true);
    const peakRay = new THREE.Raycaster(new THREE.Vector3(...entry.edge.at(entry.distance, 7.0, 1.2)), new THREE.Vector3(0, -1, 0), 0, 4.5);
    const peakHits = peakRay.intersectObject(model.group, true);
    assert.ok(peakHits.length > 0 && peakHits[0].point.y > 4.8, 'July-36 triangular pediment rises to a pitched central peak');
    const eaveRay = new THREE.Raycaster(new THREE.Vector3(...entry.edge.at(entry.distance + 10, b.height + 2.0, 0.5)), new THREE.Vector3(0, -1, 0), 0, 3.0);
    assert.ok(eaveRay.intersectObject(model.group, true).length > 0, 'July-36 features projecting roof eaves');
    model.dispose();
  }

  // Shahid Anas Hall: tall white-framed portal rising cleanly above roofline
  {
    const { b, entry, model } = buildFor(RESIDENTIAL_HALL_IDS.SHAHID_ANAS);
    assert.equal(model.diagnostics.hasTallPortalBay, true);
    const crownRay = new THREE.Raycaster(new THREE.Vector3(...entry.edge.at(entry.distance, b.height + 3.0, 0.45)), new THREE.Vector3(0, -1, 0), 0, 3.0);
    const hits = crownRay.intersectObject(model.group, true);
    assert.ok(hits.length > 0 && hits[0].point.y > b.height + 1.0, 'Shahid Anas tall portal bay crowns above roof');
    model.dispose();
  }

  // Gateway halls (Shah Azizur, Shahid Ziaur, Saddam, Lalon, Khaleda Zia, Aisha): overhead gate arch header above clear entry
  for (const [id, gateOutward] of [
    [RESIDENTIAL_HALL_IDS.SHAH_AZIZUR, 1.9],
    [RESIDENTIAL_HALL_IDS.SHAHID_ZIAUR, 2.5],
    [RESIDENTIAL_HALL_IDS.SADDAM_HOSSAIN, 2.35],
    [RESIDENTIAL_HALL_IDS.LALON_SHAH, 1.85],
    [RESIDENTIAL_HALL_IDS.KHALEDA_ZIA, 2.7],
    [RESIDENTIAL_HALL_IDS.AISHA_SIDDIQA, 2.7],
  ]) {
    const { entry, model } = buildFor(id);
    const archRay = new THREE.Raycaster(new THREE.Vector3(...entry.edge.at(entry.distance, 7.5, gateOutward)), new THREE.Vector3(0, -1, 0), 0, 4.5);
    const hits = archRay.intersectObject(model.group, true);
    assert.ok(hits.length > 0 && hits[0].point.y > 4.2, `way/${id} features overhead entrance gateway arch header`);

    // Women's halls additionally feature folded dark wrought-iron gate leaves tucked beside pillars outside clear width
    if (id === RESIDENTIAL_HALL_IDS.KHALEDA_ZIA || id === RESIDENTIAL_HALL_IDS.AISHA_SIDDIQA) {
      assert.equal(model.diagnostics.hasFoldedIronGates, true);
      const leafOrigin = entry.edge.at(entry.distance + 1.4, 1.2, 1.7);
      const leafRay = new THREE.Raycaster(new THREE.Vector3(...leafOrigin), new THREE.Vector3(entry.edge.ux, 0, entry.edge.uz), 0, 1.2);
      assert.ok(leafRay.intersectObject(model.group, true).length > 0, `way/${id} has folded wrought-iron gate leaves outside clear entry`);
    }
    model.dispose();
  }

  // Jia Hall Mosque: central pointed dome centered inside roof rising smoothly above octagonal drum
  {
    const { b, model } = buildFor(RESIDENTIAL_HALL_IDS.JIA_HALL_MOSQUE);
    const [mx, mz] = model.diagnostics.domeCenter;
    assert.ok(pointInPolygon([mx, mz], b.polygons[0]), 'Jia Hall Mosque dome sits inside mapped footprint');
    assert.ok(model.diagnostics.domeTopY > b.height + 5.5, 'Jia Hall Mosque dome + drum + gold finial rises gracefully');
    const domeRay = new THREE.Raycaster(new THREE.Vector3(mx, model.diagnostics.domeTopY + 2, mz), new THREE.Vector3(0, -1, 0), 0, 6);
    assert.ok(domeRay.intersectObject(model.group, true).length > 0, 'central mosque dome crown is present');
    model.dispose();
  }
});

test('Shah Azizur Rahman Hall stepped pond ghat hugs south shore of pond 1317423252 and dips cleanly below water level', () => {
  const pond = map.water.find(w => String(w.id) === SHAH_AZIZUR_POND_ID);
  assert.ok(pond, 'Shah Azizur Pond 1317423252 exists in public/data/map.osm');

  const ghat = buildShahAzizurPondGhat(map);
  ghat.group.updateMatrixWorld(true);
  const { diagnostics } = ghat;

  assert.equal(diagnostics.waterId, SHAH_AZIZUR_POND_ID);
  assert.equal(diagnostics.found, true);
  assert.equal(diagnostics.drawCalls, 1);
  assert.equal(diagnostics.collisionObjects, 0);
  assert.equal(diagnostics.stepCount, 8);
  assert.equal(diagnostics.hasSideBenches, true);

  // Anchor lies cleanly along south shore around x ≈ 12.0, z ≈ 434.2 facing northward (-Z) into the pond
  const [ax, az] = diagnostics.anchor;
  assert.ok(Math.abs(ax - 12.0) < 0.5, `ghat centered near x=12.0 (got ${ax.toFixed(2)})`);
  assert.ok(az >= 434.0 && az <= 434.4, `ghat anchored on south shore z≈434.2 (got ${az.toFixed(2)})`);
  assert.ok(diagnostics.bankNormalIntoWater[1] < -0.95, 'ghat steps descend northward (-Z) into the pond');

  const mesh = ghat.group.children[0];
  const geometry = mesh.geometry;
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
  assert.equal(mesh.material.vertexColors, true);
  assert.equal(mesh.material.roughness, 0.82);
  assert.equal(mesh.material.envMapIntensity, 0.34);
  assert.equal(geometry.groups.length, 0);
  assert.equal(geometry.index, null);
  assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));

  // Dips cleanly below the water level (y = 0.021) while wing walls/landing rise above
  assert.ok(geometry.boundingBox.min.y < 0.02, `ghat dips beneath water surface (min.y=${geometry.boundingBox.min.y})`);
  assert.ok(geometry.boundingBox.max.y > 0.02, `ghat rises above water surface (max.y=${geometry.boundingBox.max.y})`);
  assert.ok(diagnostics.stepElevations[0] > 0.021 && diagnostics.stepElevations.at(-1) <= -0.34);

  // Verify stepped descent into the pond water via downward raycasts along centerline
  const landingRay = new THREE.Raycaster(new THREE.Vector3(ax, 2.0, az + 1.5), new THREE.Vector3(0, -1, 0), 0, 3.0);
  const landingHits = landingRay.intersectObject(ghat.group, true);
  assert.ok(landingHits.length > 0 && Math.abs(landingHits[0].point.y - 0.08) < 0.02, 'top landing apron sits at y ≈ 0.08 m');

  const deepStepPt = [ax + diagnostics.bankNormalIntoWater[0] * 4.2, az + diagnostics.bankNormalIntoWater[1] * 4.2];
  assert.ok(pointInPolygon(deepStepPt, pond.polygons[0]), 'submerged lower steps extend strictly inside Shah Azizur Pond');
  const submergedRay = new THREE.Raycaster(new THREE.Vector3(deepStepPt[0], 2.0, deepStepPt[1]), new THREE.Vector3(0, -1, 0), 0, 3.0);
  const subHits = submergedRay.intersectObject(ghat.group, true);
  assert.ok(subHits.length > 0 && subHits[0].point.y < -0.25, 'deepest ghat steps sit cleanly underwater');

  // Verify flanking parapet wing walls exist on both left and right sides
  for (const side of [-1, 1]) {
    const wallRay = new THREE.Raycaster(new THREE.Vector3(ax + side * 5.78, 2.0, az + 1.5), new THREE.Vector3(0, -1, 0), 0, 2.5);
    const wallHits = wallRay.intersectObject(ghat.group, true);
    assert.ok(wallHits.length > 0 && wallHits[0].point.y > 0.85, `flanking brick parapet wing wall present on side=${side}`);
  }

  ghat.dispose();

  // Gracefully handles maps without pond 1317423252
  const emptyGhat = buildShahAzizurPondGhat({ water: [] });
  assert.equal(emptyGhat.diagnostics.found, false);
  assert.equal(emptyGhat.diagnostics.drawCalls, 0);
  emptyGhat.dispose();
});

test('fallback defaults, idempotent disposal, and input validation work cleanly across all landmarks', () => {
  // Default build without options works for all 9 buildings and disposes cleanly exactly once
  for (const building of hallBuildings) {
    const model = buildResidentialHall(building);
    const mesh = model.group.children[0];
    const parent = new THREE.Group();
    parent.add(model.group);
    let gDisposed = 0, mDisposed = 0;
    mesh.geometry.addEventListener('dispose', () => gDisposed++);
    mesh.material.addEventListener('dispose', () => mDisposed++);
    model.dispose();
    model.dispose();
    assert.equal(gDisposed, 1, `way/${building.id} geometry disposed exactly once`);
    assert.equal(mDisposed, 1, `way/${building.id} material disposed exactly once`);
    assert.equal(model.group.children.length, 0);
    assert.equal(parent.children.length, 0);
  }

  // Pond ghat idempotent disposal
  const ghat = buildShahAzizurPondGhat(map);
  const gMesh = ghat.group.children[0];
  const gParent = new THREE.Group();
  gParent.add(ghat.group);
  let gg = 0, gm = 0;
  gMesh.geometry.addEventListener('dispose', () => gg++);
  gMesh.material.addEventListener('dispose', () => gm++);
  ghat.dispose();
  ghat.dispose();
  assert.equal(gg, 1);
  assert.equal(gm, 1);
  assert.equal(ghat.group.children.length, 0);
  assert.equal(gParent.children.length, 0);

  // Validation rejects invalid identities, heights, entrances, and polygons
  const sample = hallBuildings[0];
  assert.throws(() => buildResidentialHall({ ...sample, id: '999999' }), /supported OSM way ID/);
  assert.throws(() => buildResidentialHall({ ...sample, osmType: 'relation' }), /supported OSM way ID/);
  assert.throws(() => buildResidentialHall(sample, { baseHeight: NaN }), /finite/);
  assert.throws(() => buildResidentialHall(sample, { baseHeight: 2 }), /between/);
  assert.throws(() => buildResidentialHall(sample, { entrances: [] }), /nonempty/);
  assert.throws(() => buildResidentialHall(sample, { entrances: [{ edge: { a: [0, 0], b: [5, 0] }, distance: 2 }] }), /mapped outer edge/);
  assert.throws(() => buildResidentialHall({ ...sample, polygons: [[[[0, 0], [1, 0], [NaN, 2], [0, 0]]]] }), /finite/);
});
