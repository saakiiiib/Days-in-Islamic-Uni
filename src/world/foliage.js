import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { measurePath, samplePath } from './bridge.js';
import { hashId } from './appearance.js';
import { MONUMENT_PLACEMENTS } from './landmarks/monumentsPlaza.js';

const TMP_COLOR_A = new THREE.Color();
const TMP_COLOR_B = new THREE.Color();
const TMP_COLOR_OUT = new THREE.Color();

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Normalizes a primitive geometry into a non-indexed position+normal+color part
 * with vertical height + upward-normal shading (sunlit crowns, shaded undersides).
 */
function prepareShadedPart(source, bottomHex, topHex, {
  minY = null,
  maxY = null,
  jitter = 0,
  jitterSeed = 0,
  recomputeNormals = false,
  radialDarken = 0,
} = {}) {
  const geom = source.index ? source.toNonIndexed() : source;
  if (geom !== source) source.dispose();
  if (geom.getAttribute('uv')) geom.deleteAttribute('uv');
  if (geom.getAttribute('uv1')) geom.deleteAttribute('uv1');

  const pos = geom.getAttribute('position');
  if (jitter > 0) {
    // Deterministic spatial jitter keyed on position keeps shared edges watertight.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n1 = Math.sin(x * 3.9 + jitterSeed) * Math.cos(y * 3.1 - jitterSeed * 0.7);
      const n2 = Math.sin(z * 4.7 + y * 2.3 + jitterSeed * 1.3);
      const factor = 1 + jitter * (n1 * 0.65 + n2 * 0.35);
      pos.setXYZ(i, x * factor, y * factor, z * factor);
    }
    pos.needsUpdate = true;
  }

  if (recomputeNormals || !geom.getAttribute('normal')) {
    geom.computeVertexNormals();
  }

  geom.computeBoundingBox();
  const y0 = minY ?? geom.boundingBox.min.y;
  const y1 = maxY ?? geom.boundingBox.max.y;
  const spanY = Math.max(1e-4, y1 - y0);
  const maxR = Math.max(
    1e-4,
    Math.hypot(
      Math.max(Math.abs(geom.boundingBox.min.x), Math.abs(geom.boundingBox.max.x)),
      Math.max(Math.abs(geom.boundingBox.min.z), Math.abs(geom.boundingBox.max.z)),
    ),
  );

  const normal = geom.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  TMP_COLOR_A.setHex(bottomHex);
  TMP_COLOR_B.setHex(topHex);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = normal.getY(i);
    const heightT = clamp01((y - y0) / spanY);
    const upT = clamp01(ny * 0.5 + 0.5);
    let shade = heightT * 0.65 + upT * 0.35;
    if (radialDarken > 0) {
      const rT = clamp01(Math.hypot(x, z) / maxR);
      shade = clamp01(shade - (1 - rT) * radialDarken);
    }
    TMP_COLOR_OUT.copy(TMP_COLOR_A).lerp(TMP_COLOR_B, shade);
    colors[i * 3] = TMP_COLOR_OUT.r;
    colors[i * 3 + 1] = TMP_COLOR_OUT.g;
    colors[i * 3 + 2] = TMP_COLOR_OUT.b;
  }

  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geom;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Failed to merge campus foliage geometry');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Archetype 1: Lush multi-lobe Mango / Rain Tree (classic IU Kushtia Ambagan).
 * Tapered bark trunk, root flare, 3 forked branch stubs, and 4 sculpted crown lobes.
 */
function buildMangoRainTreeGeometry() {
  const parts = [];

  // Root buttress flare + tapered bark trunk
  const flare = new THREE.CylinderGeometry(0.32, 0.48, 0.5, 7, 1, true);
  flare.translate(0, 0.25, 0);
  parts.push(prepareShadedPart(flare, 0x423123, 0x5c4634, { minY: 0, maxY: 0.5 }));

  const trunk = new THREE.CylinderGeometry(0.18, 0.33, 2.75, 7, 1, true);
  trunk.translate(0, 1.45, 0);
  parts.push(prepareShadedPart(trunk, 0x4b3828, 0x725943, { minY: 0.1, maxY: 2.85 }));

  // 3 outward-forked branching stubs supporting the multi-lobe crown
  const branchAngles = [0.25, 2.35, 4.45];
  for (let i = 0; i < branchAngles.length; i++) {
    const a = branchAngles[i];
    const branch = new THREE.CylinderGeometry(0.08, 0.15, 1.45, 5, 1, true);
    branch.translate(0, 0.72, 0);
    branch.rotateZ(-0.62);
    branch.rotateY(a);
    branch.translate(0, 2.15 + (i % 2) * 0.18, 0);
    parts.push(prepareShadedPart(branch, 0x533f2e, 0x6f5742, { minY: 2.0, maxY: 3.4 }));
  }

  // 4 organically offset slightly-faceted foliage crown clusters
  const lobes = [
    { pos: [0.0, 4.35, 0.0], scale: [1.92, 1.42, 1.84], dark: 0x2f5a30, light: 0x6da148, seed: 1.1 },
    { pos: [1.14, 3.65, 0.54], scale: [1.52, 1.12, 1.44], dark: 0x2b542e, light: 0x609341, seed: 2.4 },
    { pos: [-1.08, 3.78, 0.42], scale: [1.46, 1.16, 1.50], dark: 0x315d32, light: 0x679a44, seed: 3.7 },
    { pos: [-0.14, 3.70, -1.08], scale: [1.50, 1.12, 1.40], dark: 0x274e2c, light: 0x598a3e, seed: 5.2 },
  ];

  for (const lobe of lobes) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const shaded = prepareShadedPart(geo, lobe.dark, lobe.light, {
      jitter: 0.11,
      jitterSeed: lobe.seed,
      recomputeNormals: true,
      radialDarken: 0.12,
    });
    shaded.scale(lobe.scale[0], lobe.scale[1], lobe.scale[2]);
    shaded.translate(lobe.pos[0], lobe.pos[1], lobe.pos[2]);
    parts.push(shaded);
  }

  return mergeParts(parts);
}

/**
 * Builds 8 arched, V-folded multi-segment palm fronds with both top and underside
 * faces so palms look full and graceful from pedestrian eye level and above.
 */
function buildPalmFrondsGeometry(originY) {
  const positions = [];
  const colors = [];
  const pushTri = (a, b, c, color) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
  };

  const upperColors = [new THREE.Color(0x316e32), new THREE.Color(0x52963d), new THREE.Color(0x73ae47)];
  const underColors = [new THREE.Color(0x235225), new THREE.Color(0x3a6f2e), new THREE.Color(0x528236)];

  for (let i = 0; i < 8; i++) {
    const isUpper = i % 2 === 0;
    const yaw = (i * Math.PI) / 4 + (isUpper ? 0.08 : -0.05);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const reach = isUpper ? 2.45 : 2.75;
    const lift = isUpper ? 0.56 : 0.24;
    const baseY = originY + (isUpper ? 0.18 : -0.04);

    // 4 stations from crownshaft hub to drooping pointed frond tip
    const stations = [
      { r: 0.08, y: baseY, w: 0.16, droop: 0.03 },
      { r: reach * 0.36, y: baseY + lift, w: 0.44, droop: 0.14 },
      { r: reach * 0.72, y: baseY + lift * 0.35 - 0.12, w: 0.38, droop: 0.18 },
      { r: reach, y: baseY - 0.68 - (isUpper ? 0 : 0.22), w: 0.0, droop: 0.0 },
    ];

    const toWorld = (r, y, lat) => [r * cosY - lat * sinY, y, r * sinY + lat * cosY];

    for (let s = 0; s < 3; s++) {
      const p0 = stations[s];
      const p1 = stations[s + 1];
      const c0 = toWorld(p0.r, p0.y, 0);
      const l0 = toWorld(p0.r, p0.y - p0.droop, -p0.w);
      const r0 = toWorld(p0.r, p0.y - p0.droop, p0.w);
      const c1 = toWorld(p1.r, p1.y, 0);
      const topColor = upperColors[s];
      const botColor = underColors[s];

      if (s < 2) {
        const l1 = toWorld(p1.r, p1.y - p1.droop, -p1.w);
        const r1 = toWorld(p1.r, p1.y - p1.droop, p1.w);
        // Left blade top & underside
        pushTri(c0, c1, l0, topColor);
        pushTri(c1, l1, l0, topColor);
        pushTri(c0, l0, c1, botColor);
        pushTri(c1, l0, l1, botColor);
        // Right blade top & underside
        pushTri(c0, r0, c1, topColor);
        pushTri(c1, r0, r1, topColor);
        pushTri(c0, c1, r0, botColor);
        pushTri(c1, r1, r0, botColor);
      } else {
        // Pointed tip triangles
        pushTri(c0, c1, l0, topColor);
        pushTri(c0, l0, c1, botColor);
        pushTri(c0, r0, c1, topColor);
        pushTri(c0, c1, r0, botColor);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Archetype 2: Graceful Royal Palm (Roystonea regia).
 * Ringed tapered grey trunk with subtle lower swell, emerald crownshaft, and 8 arched fronds.
 */
function buildRoyalPalmGeometry() {
  const parts = [];

  // 5 ringed grey trunk segments with characteristic slight mid-lower swell and gentle lean
  const rings = [
    { y0: 0.0, y1: 1.25, rBot: 0.29, rTop: 0.25, x0: 0.0, x1: 0.02, cBot: 0x6f736d, cTop: 0x949890 },
    { y0: 1.25, y1: 2.55, rBot: 0.26, rTop: 0.29, x0: 0.02, x1: 0.05, cBot: 0x858982, cTop: 0xa4a79e },
    { y0: 2.55, y1: 3.85, rBot: 0.28, rTop: 0.24, x0: 0.05, x1: 0.07, cBot: 0x898d85, cTop: 0xa8aba2 },
    { y0: 3.85, y1: 5.05, rBot: 0.23, rTop: 0.20, x0: 0.07, x1: 0.08, cBot: 0x848880, cTop: 0xa3a69d },
    { y0: 5.05, y1: 6.15, rBot: 0.20, rTop: 0.18, x0: 0.08, x1: 0.08, cBot: 0x7e827a, cTop: 0x9ca097 },
  ];

  for (const ring of rings) {
    const h = ring.y1 - ring.y0;
    const seg = new THREE.CylinderGeometry(ring.rTop, ring.rBot, h, 7, 1, true);
    seg.translate((ring.x0 + ring.x1) * 0.5, ring.y0 + h * 0.5, 0);
    parts.push(prepareShadedPart(seg, ring.cBot, ring.cTop, { minY: ring.y0, maxY: ring.y1 }));
  }

  // Smooth glossy green crownshaft
  const crownshaft = new THREE.CylinderGeometry(0.16, 0.21, 1.3, 7, 1, true);
  crownshaft.translate(0.08, 6.72, 0);
  parts.push(prepareShadedPart(crownshaft, 0x357234, 0x62a446, { minY: 6.07, maxY: 7.37 }));

  // 8 arched drooping palm fronds anchored at crownshaft top
  const fronds = buildPalmFrondsGeometry(7.24);
  fronds.translate(0.08, 0, 0);
  parts.push(fronds);

  return mergeParts(parts);
}

/**
 * Archetype 3: Spreading Krishnachura Flame Tree (Delonix regia).
 * Gnarled branching trunk, wide umbrella dark-green canopy, and bright scarlet-crimson blossoms.
 */
function buildKrishnachuraGeometry() {
  const parts = [];

  const flare = new THREE.CylinderGeometry(0.32, 0.5, 0.45, 7, 1, true);
  flare.translate(0, 0.22, 0);
  parts.push(prepareShadedPart(flare, 0x453a32, 0x5c4f44, { minY: 0, maxY: 0.45 }));

  const trunk = new THREE.CylinderGeometry(0.20, 0.34, 2.35, 7, 1, true);
  trunk.rotateZ(0.07);
  trunk.translate(0.06, 1.3, 0);
  parts.push(prepareShadedPart(trunk, 0x4c4037, 0x6e5f52, { minY: 0.1, maxY: 2.5 }));

  // 4 wide spreading limbs forming the iconic umbrella frame
  const limbAngles = [0.2, 1.75, 3.35, 4.9];
  for (let i = 0; i < limbAngles.length; i++) {
    const limb = new THREE.CylinderGeometry(0.07, 0.14, 1.85, 5, 1, true);
    limb.translate(0, 0.92, 0);
    limb.rotateZ(-0.82);
    limb.rotateY(limbAngles[i]);
    limb.translate(0.08, 2.05 + (i % 2) * 0.16, 0);
    parts.push(prepareShadedPart(limb, 0x504339, 0x6d5d50, { minY: 2.0, maxY: 3.6 }));
  }

  // Wide flat umbrella dark-green feathery foliage layer
  const greenLobes = [
    { pos: [0.05, 3.82, 0.0], scale: [2.15, 0.62, 2.05], seed: 6.1 },
    { pos: [1.35, 3.65, 0.45], scale: [1.38, 0.52, 1.32], seed: 7.3 },
    { pos: [-1.25, 3.70, 0.52], scale: [1.36, 0.50, 1.35], seed: 8.5 },
    { pos: [-0.08, 3.68, -1.25], scale: [1.45, 0.52, 1.28], seed: 9.7 },
  ];
  for (const lobe of greenLobes) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const shaded = prepareShadedPart(geo, 0x1f4726, 0x3e7434, {
      jitter: 0.1,
      jitterSeed: lobe.seed,
      recomputeNormals: true,
    });
    shaded.scale(lobe.scale[0], lobe.scale[1], lobe.scale[2]);
    shaded.translate(lobe.pos[0], lobe.pos[1], lobe.pos[2]);
    parts.push(shaded);
  }

  // Fiery scarlet-crimson Krishnachura blossom canopy crowning the umbrella top
  const blossomClusters = [
    { pos: [0.05, 4.38, 0.0], scale: [1.82, 0.58, 1.72], dark: 0xb52116, light: 0xf75224, seed: 11.1 },
    { pos: [1.32, 4.14, 0.42], scale: [1.22, 0.46, 1.18], dark: 0xc22819, light: 0xff6229, seed: 12.4 },
    { pos: [-1.22, 4.18, 0.48], scale: [1.18, 0.45, 1.20], dark: 0xae1e15, light: 0xf24a22, seed: 13.8 },
    { pos: [-0.05, 4.16, -1.18], scale: [1.26, 0.46, 1.12], dark: 0xb82418, light: 0xfa5826, seed: 15.2 },
    { pos: [0.35, 4.58, -0.35], scale: [1.05, 0.40, 1.02], dark: 0xd12f1a, light: 0xff6f2e, seed: 16.6 },
  ];
  for (const cluster of blossomClusters) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const shaded = prepareShadedPart(geo, cluster.dark, cluster.light, {
      jitter: 0.12,
      jitterSeed: cluster.seed,
      recomputeNormals: true,
    });
    shaded.scale(cluster.scale[0], cluster.scale[1], cluster.scale[2]);
    shaded.translate(cluster.pos[0], cluster.pos[1], cluster.pos[2]);
    parts.push(shaded);
  }

  return mergeParts(parts);
}

/**
 * Archetype 4: Tall slender conical Debdaru / Ashoka (Polyalthia longifolia).
 * Straight trunk wrapped in 5 layered tapering emerald tiers.
 */
function buildDebdaruGeometry() {
  const parts = [];

  const trunk = new THREE.CylinderGeometry(0.10, 0.20, 2.25, 6, 1, true);
  trunk.translate(0, 1.12, 0);
  parts.push(prepareShadedPart(trunk, 0x4b3c2f, 0x6a5644, { minY: 0, maxY: 2.25 }));

  const tiers = [
    { r: 1.24, h: 2.05, y: 2.52, dark: 0x1e4a2b, light: 0x42803d, seed: 21.1 },
    { r: 1.08, h: 1.95, y: 3.62, dark: 0x21502e, light: 0x498941, seed: 22.3 },
    { r: 0.89, h: 1.85, y: 4.72, dark: 0x255732, light: 0x519345, seed: 23.5 },
    { r: 0.67, h: 1.72, y: 5.82, dark: 0x2a5f36, light: 0x5a9d4a, seed: 24.7 },
    { r: 0.42, h: 1.60, y: 6.95, dark: 0x31693b, light: 0x67aa50, seed: 25.9 },
  ];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const cone = new THREE.ConeGeometry(tier.r, tier.h, 8, 1, false);
    cone.rotateY(i * 0.42);
    const shaded = prepareShadedPart(cone, tier.dark, tier.light, {
      jitter: 0.08,
      jitterSeed: tier.seed,
      recomputeNormals: true,
    });
    shaded.translate(0, tier.y, 0);
    parts.push(shaded);
  }

  return mergeParts(parts);
}

/**
 * Archetype 5: Lush multi-cluster Flowering Hedges & Garden Shrubs.
 * 3 overlapping leafy mounds studded with subtle pink, scarlet, and gold blossom accents.
 */
function buildGardenShrubGeometry() {
  const parts = [];

  const mounds = [
    { pos: [0.0, 0.42, 0.0], scale: [0.58, 0.46, 0.56], dark: 0x2a5a2f, light: 0x589142, seed: 31.1 },
    { pos: [0.39, 0.32, 0.22], scale: [0.44, 0.36, 0.42], dark: 0x2e6132, light: 0x609946, seed: 32.4 },
    { pos: [-0.36, 0.30, -0.23], scale: [0.42, 0.34, 0.44], dark: 0x26522b, light: 0x50863d, seed: 33.7 },
  ];
  for (const mound of mounds) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const shaded = prepareShadedPart(geo, mound.dark, mound.light, {
      jitter: 0.1,
      jitterSeed: mound.seed,
      recomputeNormals: true,
    });
    shaded.scale(mound.scale[0], mound.scale[1], mound.scale[2]);
    shaded.translate(mound.pos[0], mound.pos[1], mound.pos[2]);
    parts.push(shaded);
  }

  // Subtle pink, scarlet, and marigold-gold flowering blossom accents
  const blossoms = [
    { pos: [0.14, 0.80, 0.16], r: 0.11, dark: 0xc23e6b, light: 0xf476a2 },
    { pos: [-0.22, 0.74, 0.22], r: 0.10, dark: 0xc9302c, light: 0xf5584e },
    { pos: [0.48, 0.62, 0.28], r: 0.095, dark: 0xd1941f, light: 0xffcc4d },
    { pos: [-0.42, 0.59, -0.26], r: 0.095, dark: 0xc23e6b, light: 0xf2719d },
    { pos: [0.05, 0.76, -0.28], r: 0.09, dark: 0xd49622, light: 0xffd052 },
  ];
  for (const blossom of blossoms) {
    const geo = new THREE.OctahedronGeometry(blossom.r, 0);
    const shaded = prepareShadedPart(geo, blossom.dark, blossom.light, { recomputeNormals: true });
    shaded.translate(blossom.pos[0], blossom.pos[1], blossom.pos[2]);
    parts.push(shaded);
  }

  return mergeParts(parts);
}

function buildGreenKindLookup(mapData) {
  const byId = new Map();
  for (const green of mapData?.greens ?? []) {
    if (green?.id != null) {
      byId.set(green.id, green.kind);
      byId.set(String(green.id), green.kind);
      const type = ['node', 'way', 'relation'].includes(green.osmType) ? green.osmType : 'untyped';
      byId.set(`${type}/${green.id}`, green.kind);
    }
  }
  return byId;
}

function classifyTreeSpecies(point, greenKind) {
  const seed = hashId(point.id ?? `${point.x},${point.z}`);
  // Decorrelated unsigned deterministic roll in [0..99] so species and scale vary independently.
  const mixed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
  const roll = ((mixed ^ (mixed >>> 13)) >>> 0) % 100;

  const isForest = greenKind === 'forest' || greenKind === 'wood';
  const isParkGardenGrass = greenKind === 'park' || greenKind === 'garden'
    || greenKind === 'grass' || greenKind === 'meadow' || greenKind === 'grassland';

  // ~14% of non-forest trees & garden/park edges -> Royal Palms
  if (!isForest && roll < 14) return 'palm';
  // ~10% of park / garden / grass trees -> Krishnachura Flame Trees
  if (isParkGardenGrass && roll >= 14 && roll < 25) return 'krishnachura';
  // ~14% of all trees -> Tall slender conical Debdaru (Ashoka)
  if (roll >= 86) return 'debdaru';
  // Lush Mango / Rain Trees form the dominant campus canopy
  return 'mango';
}

function populateInstances(mesh, items, { scaleMin, scaleMax, yScaleSpread = 0.08, tintRange = [0.9, 1.04] }) {
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const seed = hashId(item.id ?? `${item.x},${item.z}:${i}`);
    const v1 = (seed % 100) / 100;
    const v2 = ((seed >>> 8) % 100) / 100;
    const v3 = ((seed >>> 16) % 100) / 100;
    const baseScale = scaleMin + v1 * (scaleMax - scaleMin);
    const yScale = baseScale * (1 + (v2 - 0.5) * 2 * yScaleSpread);
    transform.position.set(item.x, 0, item.z);
    transform.rotation.set(0, v2 * Math.PI * 2, 0);
    transform.scale.set(baseScale, yScale, baseScale);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);

    const tone = tintRange[0] + v3 * (tintRange[1] - tintRange[0]);
    const warmShift = (v1 - 0.5) * 0.05;
    color.setRGB(tone + warmShift, tone, tone - warmShift * 0.5);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

/**
 * Adds 5 realistic instanced Bangladeshi campus foliage archetypes onto the
 * existing deterministic mapped + planned vegetation coordinates (5 draw calls
 * maximum total, zero added colliders, clean single-pass disposal via world.dispose()).
 */
export function addCampusFoliage(mapData = {}, group, materials, decoration = {}) {
  const greenKinds = buildGreenKindLookup(mapData);
  const points = [...(mapData.trees ?? [])].map(p => ({ x: p.x, z: p.z, id: p.id, greenKind: 'mapped' }));

  const clearOfMonuments = p => MONUMENT_PLACEMENTS.every(m => Math.hypot(p.x - m.x, p.z - m.z) >= m.clearRadius);

  for (const row of mapData.treeRows ?? []) {
    for (const path of row.paths ?? []) {
      if (path.length < 2) continue;
      const { distances, length } = measurePath(path);
      for (let d = 0; d <= length; d += 7) {
        const p = samplePath(path, distances, d);
        if (!clearOfMonuments(p)) continue;
        if (!points.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 2)) {
          points.push({ x: p.x, z: p.z, id: `${row.id}-${d}`, greenKind: 'row' });
        }
      }
    }
  }

  for (const tree of decoration?.trees ?? []) {
    if (!clearOfMonuments(tree)) continue;
    const greenKind = greenKinds.get(tree.greenId) ?? greenKinds.get(tree.greenKey) ?? 'general';
    points.push({ ...tree, greenKind });
  }

  const shrubs = (decoration?.shrubs ?? []).filter(clearOfMonuments);
  if (!points.length && !shrubs.length) {
    return { meshes: [], counts: { mango: 0, palm: 0, krishnachura: 0, debdaru: 0, shrubs: 0, total: 0 } };
  }

  const buckets = { mango: [], palm: [], krishnachura: [], debdaru: [] };
  for (const point of points) {
    const species = classifyTreeSpecies(point, point.greenKind);
    buckets[species].push(point);
  }

  // Ensure minimal maps with >= 1 tree always produce 'mapped-tree-canopies'.
  if (points.length > 0 && buckets.mango.length === 0) {
    for (const key of ['palm', 'debdaru', 'krishnachura']) {
      if (buckets[key].length > 0) {
        buckets.mango.push(buckets[key].shift());
        break;
      }
    }
  }

  const foliageMaterial = materials.foliage;
  const meshes = [];

  const specs = [
    {
      key: 'mango',
      name: 'mapped-tree-canopies',
      build: buildMangoRainTreeGeometry,
      items: buckets.mango,
      castShadow: true,
      receiveShadow: true,
      scaleMin: 0.92,
      scaleMax: 1.24,
      yScaleSpread: 0.09,
      tintRange: [0.9, 1.05],
      includesTrunksAndShrubs: true,
    },
    {
      key: 'palm',
      name: 'campus-royal-palms',
      build: buildRoyalPalmGeometry,
      items: buckets.palm,
      castShadow: true,
      receiveShadow: true,
      scaleMin: 0.92,
      scaleMax: 1.22,
      yScaleSpread: 0.1,
      tintRange: [0.92, 1.04],
    },
    {
      key: 'krishnachura',
      name: 'campus-krishnachura-trees',
      build: buildKrishnachuraGeometry,
      items: buckets.krishnachura,
      castShadow: true,
      receiveShadow: true,
      scaleMin: 0.94,
      scaleMax: 1.18,
      yScaleSpread: 0.06,
      tintRange: [0.94, 1.04],
    },
    {
      key: 'debdaru',
      name: 'campus-debdaru-trees',
      build: buildDebdaruGeometry,
      items: buckets.debdaru,
      castShadow: true,
      receiveShadow: true,
      scaleMin: 0.9,
      scaleMax: 1.22,
      yScaleSpread: 0.12,
      tintRange: [0.9, 1.05],
    },
    {
      key: 'shrubs',
      name: 'campus-garden-shrubs',
      build: buildGardenShrubGeometry,
      items: shrubs,
      castShadow: false,
      receiveShadow: true,
      scaleMin: 0.85,
      scaleMax: 1.22,
      yScaleSpread: 0.12,
      tintRange: [0.92, 1.06],
    },
  ];

  for (const spec of specs) {
    if (!spec.items.length) continue;
    const geometry = spec.build();
    const mesh = new THREE.InstancedMesh(geometry, foliageMaterial, spec.items.length);
    mesh.name = spec.name;
    mesh.castShadow = spec.castShadow;
    mesh.receiveShadow = spec.receiveShadow;
    if (spec.includesTrunksAndShrubs) mesh.userData.includesTrunksAndShrubs = true;
    populateInstances(mesh, spec.items, spec);
    group.add(mesh);
    meshes.push(mesh);
  }

  return {
    meshes,
    counts: {
      mango: buckets.mango.length,
      palm: buckets.palm.length,
      krishnachura: buckets.krishnachura.length,
      debdaru: buckets.debdaru.length,
      shrubs: shrubs.length,
      total: points.length + shrubs.length,
    },
  };
}
