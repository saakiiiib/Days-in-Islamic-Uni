import * as THREE from 'three';
import { getCampusLandmark } from '../data/campus-landmarks.js';
import { buildCentralMosque, CENTRAL_MOSQUE_ID } from './landmarks/centralMosque.js';
import { buildCentralLibrary, CENTRAL_LIBRARY_ID } from './landmarks/centralLibrary.js';
import { academicFacadeGeometry } from './academicFacades.js';
import { buildAuditorium, AUDITORIUM_ID } from './landmarks/auditorium.js';
import { buildMonumentsPlaza } from './landmarks/monumentsPlaza.js';
import { isAcademicLandmark, buildAcademicLandmark } from './landmarks/academicLandmarks.js';
import { isResidentialHallLandmark, buildResidentialHall, buildShahAzizurPondGhat } from './landmarks/residentialHalls.js';
import { buildingArchitectureGeometry } from './buildingKit.js';
import { addCampusFoliage } from './foliage.js';
import { enhanceWaterMaterial } from './waterShader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingGeometry, surfaceGeometry, geometryMaterialPart, polygonCenter, lineSegmentsGeometry } from './geometry.js';
import { makeBridgeGeometries } from './bridge.js';
import { buildRoadAppearance, ROAD_LEVELS } from './roads.js';
import { buildingPalette, LAND_COLORS } from './appearance.js';
import { facadeGeometry, tintGeometry, chooseEntries } from './facades.js';
import { planReferenceVegetation } from './referenceVegetation.js';
import { horizontalUVs, facadeUVs, ensureBatchUVs, disposeWorldTextures } from './assets.js';
import { buildScenery } from './scenery.js';
import { buildMainGate } from './mainGate.js';
import { buildWaterDetails } from './waterDetail.js';

export { bridgeHeightAt } from './bridge.js';

const CHUNK_SIZE = 150;

class SpatialBatches {
  constructor(group, collisionGroup) {
    this.group = group;
    this.collisionGroup = collisionGroup;
    this.buckets = new Map();
    this.buildingMeshes = [];
    this.bridgeMeshes = [];
  }
  add(geometry, material, x, z, { collision = false, kind = 'surface' } = {}) {
    if (!geometry.getAttribute('position')?.count) { geometry.dispose(); return; }
    // Preserve metre-scaled UVs while standardising independently generated
    // surfaces, facade quads and caps for the shared spatial batches.
    ensureBatchUVs(geometry);
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    const key = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)},${material.uuid},${collision},${kind}`;
    if (!this.buckets.has(key)) this.buckets.set(key, { geometries: [], material, collision, kind });
    this.buckets.get(key).geometries.push(geometry);
  }
  finish() {
    for (const { geometries, material, collision, kind } of this.buckets.values()) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(item => item.dispose());
      if (!geometry) throw new Error(`Could not merge ${kind} geometry`);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${kind}-chunk`;
      mesh.receiveShadow = true;
      mesh.castShadow = kind === 'building' || kind === 'building-trim' || kind === 'bridge';
      if (kind === 'road') mesh.renderOrder = 1;
      this.group.add(mesh);
      if (kind === 'building') this.buildingMeshes.push(mesh);
      if (kind === 'bridge') this.bridgeMeshes.push(mesh);
      if (collision) {
        const collider = new THREE.Mesh(geometry, material);
        collider.name = `collision-${kind}`;
        this.collisionGroup.add(collider);
      }
    }
    this.buckets.clear();
  }
}

export function buildWorld(mapData, { onProgress = () => {}, preparedData = null } = {}) {
  const group = new THREE.Group(); group.name = 'islamic-university-map';
  const collisionGroup = new THREE.Group(); collisionGroup.name = 'campus-colliders'; collisionGroup.visible = false;
  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, ...options });
  const materials = {
    ground: standard(LAND_COLORS.ground, { roughness: 0.95, envMapIntensity: 0.22 }),
    pavement: standard(0xffffff, { vertexColors: true, roughness: 0.90, envMapIntensity: 0.28, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    asphalt: standard(0x2f3538, { roughness: 0.92, envMapIntensity: 0.22, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    paths: standard(0xd3cebc, { roughness: 0.90, envMapIntensity: 0.28, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    edges: standard(0xaeb5aa, { vertexColors: true, roughness: 0.90, envMapIntensity: 0.28, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    building: standard(0xffffff, { vertexColors: true, roughness: 0.86, envMapIntensity: 0.35 }),
    roof: standard(0xffffff, { vertexColors: true }),
    brick: standard(0xffffff, { vertexColors: true, roughness: 0.86, envMapIntensity: 0.35 }),
    shedRoof: standard(0xffffff, { vertexColors: true, metalness: .35, roughness: 0.62 }),
    windows: standard(0x2a4554, { roughness: 0.12, metalness: 0.45, envMapIntensity: 1.25 }),
    decor: standard(0xffffff, { vertexColors: true, roughness: 0.86, envMapIntensity: 0.35 }),
    water: standard(LAND_COLORS.water, { roughness: 0.14, metalness: 0.16, envMapIntensity: 1.05 }),
    garden: standard(LAND_COLORS.garden, { roughness: 0.95, envMapIntensity: 0.22 }),
    park: standard(LAND_COLORS.park, { roughness: 0.95, envMapIntensity: 0.22 }),
    grass: standard(LAND_COLORS.grass, { roughness: 0.95, envMapIntensity: 0.22 }),
    forest: standard(LAND_COLORS.forest, { roughness: 0.95, envMapIntensity: 0.22 }),
    orchard: standard(LAND_COLORS.orchard, { roughness: 0.95, envMapIntensity: 0.22 }),
    pitch: standard(LAND_COLORS.pitch, { roughness: 0.95, envMapIntensity: 0.22 }),
    bridge: standard(0xc0bca6, { roughness: 0.90, envMapIntensity: 0.28 }),
    rail: standard(0x525e61, { metalness: 0.4, roughness: 0.55 }),
    foliage: standard(0xffffff, { vertexColors: true, roughness: 0.92, envMapIntensity: 0.25 }),
    pitchLine: new THREE.LineBasicMaterial({ color: 0xd8dcc1, transparent: true, opacity: 0.7 }),
    debugRoad: new THREE.LineBasicMaterial({ color: 0x49e7f0, transparent: true, opacity: .8, depthTest: false }),
    debugBuilding: new THREE.LineBasicMaterial({ color: 0xffbd54, transparent: true, opacity: .9, depthTest: false }),
  };
  // Concrete roof/wall appearance is carried by their own UVs and vertex tints;
  // sharing the material retains batching instead of doubling academic chunks.
  materials.roof.dispose(); materials.roof = materials.building;
  const waterEnhancer = enhanceWaterMaterial(materials.water);
  // Keep calibrated lake sheen even after the browser ripple normal-map enhancer attaches.
  materials.water.roughness = 0.14;
  materials.water.metalness = 0.16;
  materials.water.envMapIntensity = 1.05;
  const batches = new SpatialBatches(group, collisionGroup);
  const bounds = mapData.bounds;
  const ground = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  ground.rotateX(-Math.PI / 2);
  ground.translate((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  horizontalUVs(ground, 5);
  batches.add(ground, materials.ground, 0, 0, { collision: true, kind: 'ground' });
  onProgress('Rendering mapped landscape');
  for (const green of mapData.greens ?? []) {
    const key = /forest|wood/.test(green.kind) ? 'forest' : /orchard/.test(green.kind) ? 'orchard' : /pitch|recreation_ground/.test(green.kind) ? 'pitch' : /garden/.test(green.kind) ? 'garden' : /park/.test(green.kind) ? 'park' : 'grass';
    for (const polygon of green.polygons) {
      const [x, z] = polygonCenter(polygon);
      batches.add(horizontalUVs(surfaceGeometry(polygon, 0.012), key === 'pitch' ? 6 : 4), materials[key], x, z);
      if (key === 'pitch') {
        const line = new THREE.LineSegments(lineSegmentsGeometry(polygon, 0.025), materials.pitchLine);
        line.name = 'mapped-pitch-boundary'; group.add(line);
      }
    }
  }
  for (const water of mapData.water ?? []) {
    for (const polygon of water.polygons) {
      const [x, z] = polygonCenter(polygon);
      batches.add(horizontalUVs(surfaceGeometry(polygon, 0.021), 14), materials.water, x, z, { kind: 'water' });
    }
  }
  onProgress('Joining roads and opening walking connections');
  const roadAppearance = preparedData?.roads ?? buildRoadAppearance(mapData);
  for (const [key, level, color] of [['asphalt', ROAD_LEVELS.asphalt, 0x343e43], ['paths', ROAD_LEVELS.path, 0xd2c29c], ['edges', ROAD_LEVELS.edge, 0xbac2ad], ['markings', ROAD_LEVELS.marking, 0xeae4b6]]) {
    for (const polygon of roadAppearance[key]) {
      const [x, z] = polygonCenter(polygon);
      const material = key === 'asphalt' ? materials.asphalt : key === 'paths' ? materials.paths : key === 'edges' ? materials.edges : materials.pavement;
      const geometry = horizontalUVs(surfaceGeometry(polygon, level), key === 'asphalt' ? 4 : 2.4);
      // Keep vertex colours consistent within a batch, without darkening photos twice.
      batches.add(tintGeometry(geometry, key === 'asphalt' || key === 'paths' ? 0xffffff : color), material, x, z, { kind: 'road' });
    }
  }
  for (const polygon of roadAppearance.curbs) {
    const [x, z] = polygonCenter(polygon), geometry = buildingGeometry(polygon, ROAD_LEVELS.curbTop - ROAD_LEVELS.curbBase);
    geometry.translate(0, ROAD_LEVELS.curbBase, 0);
    batches.add(tintGeometry(geometry, 0xc2c5b8), materials.edges, x, z, { kind: 'road' });
  }
  onProgress('Extruding campus buildings');
  const entryTreatments = [], landmarkModels = [], academicFacadeProfiles = [];
  for (const building of mapData.buildings ?? []) {
    const isCentralMosque = building.osmType === 'way' && building.id === CENTRAL_MOSQUE_ID;
    const isCentralLibrary = building.osmType === 'way' && building.id === CENTRAL_LIBRARY_ID;
    const isAuditorium = building.osmType === 'relation' && building.id === AUDITORIUM_ID;
    const isAcademic = isAcademicLandmark(building);
    const isHall = isResidentialHallLandmark(building);
    const palette = buildingPalette(building), entries = chooseEntries(building, mapData.roads, mapData.entrances);
    const academicFacade = academicFacadeGeometry(building, palette, entries);
    entryTreatments.push(...entries.map(e => ({ buildingId: building.id, source: e.source, nodeId: e.nodeId, position: e.edge.at(e.distance, 0, 0) })));
    for (const polygon of building.polygons) {
      const [x, z] = polygonCenter(polygon);
      const geometry = buildingGeometry(polygon, building.height);
      const roofMaterial = /^(shed|garage|grarage)$/.test(building.tags?.building ?? '') ? materials.shedRoof : materials.roof;
      const wallMaterial = palette.kind === 'residential' || palette.kind === 'construction' ? materials.brick : materials.building;
      // Only UV/material attributes change; the original collision positions and
      // triangle winding remain those of the unmodified OSM extrusion.
      batches.add(tintGeometry(horizontalUVs(geometryMaterialPart(geometry, 0), 3), palette.roof), roofMaterial, x, z, { collision: true, kind: 'building' });
      batches.add(tintGeometry(facadeUVs(geometryMaterialPart(geometry, 1), polygon, wallMaterial === materials.brick ? 2.5 : 3.5), palette.wall), wallMaterial, x, z, { collision: true, kind: 'building' });
      geometry.dispose();
      const facade = isCentralMosque || isCentralLibrary || isAuditorium || isAcademic || isHall || academicFacade ? null : facadeGeometry(polygon, building.height, palette, entries);
      if (facade) {
        batches.add(facade.windows, materials.windows, x, z, { kind: 'facade' });
        batches.add(facade.details, materials.decor, x, z, { kind: 'facade' });
      }
    }
    if (academicFacade) {
      const [x, z] = polygonCenter(building.polygons[0]);
      batches.add(academicFacade.windows, materials.windows, x, z, { kind: 'facade' });
      batches.add(academicFacade.details, materials.decor, x, z, { kind: 'facade' });
      academicFacadeProfiles.push(academicFacade.diagnostics);
    }
    const architecture = buildingArchitectureGeometry(building, palette, entries);
    if (architecture?.trim) {
      const [x, z] = polygonCenter(building.polygons[0]);
      batches.add(architecture.trim, materials.decor, x, z, { collision: false, kind: 'building-trim' });
    }
    if (isAuditorium) {
      const model = buildAuditorium(building, { entrances: entries.length ? entries : undefined, baseHeight: building.height });
      landmarkModels.push(model); group.add(model.group);
    }
    if (isCentralLibrary) {
      const model = buildCentralLibrary(building, { entrances: entries.length ? entries : undefined, baseHeight: building.height });
      landmarkModels.push(model); group.add(model.group);
    }
    if (isAcademic) {
      const model = buildAcademicLandmark(building, { entrances: entries.length ? entries : undefined, baseHeight: building.height });
      landmarkModels.push(model); group.add(model.group);
    }
    if (isHall) {
      const model = buildResidentialHall(building, { entrances: entries.length ? entries : undefined, palette, baseHeight: building.height });
      landmarkModels.push(model); group.add(model.group);
    }
  }
  for (const building of mapData.buildings ?? []) {
    if (building.osmType === 'way' && building.id === CENTRAL_MOSQUE_ID) {
      const model = buildCentralMosque(building); landmarkModels.push(model); group.add(model.group);
    }
  }
  for (const bridge of mapData.bridges ?? []) {
    const geometries = makeBridgeGeometries(bridge);
    const centre = bridge.paths?.[0]?.[0] ?? [0, 0];
    for (const deck of geometries.decks) batches.add(deck, materials.bridge, ...centre, { collision: true, kind: 'bridge' });
    for (const rail of geometries.rails) batches.add(rail, materials.rail, ...centre, { kind: 'bridge-rail' });
  }
  batches.finish();
  const waterDetails = buildWaterDetails(mapData);
  group.add(waterDetails.group);
  const monumentsPlaza = buildMonumentsPlaza(mapData);
  landmarkModels.push(monumentsPlaza);
  group.add(monumentsPlaza.group);
  const pondGhat = buildShahAzizurPondGhat(mapData);
  landmarkModels.push(pondGhat);
  group.add(pondGhat.group);
  const vegetation = preparedData?.vegetation ?? planReferenceVegetation(mapData);
  addCampusFoliage(mapData, group, materials, vegetation);
  const scenery = buildScenery(mapData, { vegetation, preparedProps: preparedData?.scenery });
  group.add(scenery.group);
  const mainGate = buildMainGate({ mapData });
  group.add(mainGate.group);
  scenery.collisionGroup.add(mainGate.collisionGroup);
  if (scenery.obstacles && mainGate.obstacles) scenery.obstacles.push(...mainGate.obstacles);
  const footprintDebug = new THREE.Group(); footprintDebug.name = 'osm-alignment-debug'; footprintDebug.visible = false;
  const debugLines = (rings, elevation, material) => {
    if (!rings.length) return;
    const line = new THREE.LineSegments(lineSegmentsGeometry(rings, elevation), material); line.renderOrder = 20; line.frustumCulled = false; footprintDebug.add(line);
  };
  debugLines((mapData.roads ?? []).flatMap(r => [...r.polygons.flatMap(p => p), ...r.paths]), .17, materials.debugRoad);
  debugLines((mapData.buildings ?? []).flatMap(b => b.polygons.flatMap(p => p)), .17, materials.debugBuilding);
  group.add(footprintDebug);
  group.updateMatrixWorld(true); collisionGroup.updateMatrixWorld(true);
  onProgress('Campus geometry ready');
  let elapsed = 0, disposed = false;
  const world = {
    group, collisionGroup, materials, scenery, bridgeMeshes: batches.bridgeMeshes, buildingMeshes: batches.buildingMeshes,
    landmarkModels, academicFacadeProfiles, waterDetails, mainGate, monumentsPlaza, pondGhat,
    landmarkRecords: (mapData.buildings ?? []).map(getCampusLandmark).filter(Boolean),
    decoration: { roads: roadAppearance, vegetation, entryTreatments }, footprintDebug, labelAnchors: mapData.places ?? [],
    update(dt) {
      elapsed += Math.max(0, dt);
      waterEnhancer.update(dt);
      for (const model of landmarkModels) model.update?.(dt);
      // Restrained tonal movement suggests a breeze on the water, with no
      // per-vertex work and no animated world geometry in the collision tree.
      const lightness = 1 + Math.sin(elapsed * 0.55) * 0.018;
      materials.water.color.setHex(LAND_COLORS.water).multiplyScalar(lightness);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      waterEnhancer.dispose();
      landmarkModels.forEach(model => model.dispose());
      waterDetails.dispose();
      disposeWorldTextures(world); scenery.dispose(); mainGate?.dispose();
      const geometries = new Set();
      group.traverse(object => { if (object.isInstancedMesh) object.dispose(); if (object.geometry) geometries.add(object.geometry); });
      collisionGroup.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      const allMaterials = new Set(Object.values(materials).flat());
      allMaterials.forEach(material => material.dispose());
      group.clear(); collisionGroup.clear();
    },
  };
  return world;
}
