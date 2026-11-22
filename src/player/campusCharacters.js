/**
 * Days in Islamic Uni | Procedural Campus Characters
 * Three.js ES module.
 *
 * Provides:
 * - createHujurCharacter: Islamic University scholar / Hujur with draped thobe/robe,
 *   patterned red houndstooth keffiyeh/ghutrah with dual agal cords, trimmed beard, and sandals.
 * - createNiqabCharacter: Female student with draped modest abaya, curved niqab veil,
 *   contoured eye opening, and layered shoulder khimar shawl.
 * - animateCharacterWalk: Fluid joint and robe-bobbing walking/running animation gait.
 * - moveCampusNPCTo: Path navigation helper for campus side characters.
 */
import * as THREE from 'three';

const PI = Math.PI;
const cache = new Map();
const SCARF_TEXTURES = new Map();
const GEOMETRIES = new Map();
const GEOMETRY_USERS = new WeakMap();
const MATERIAL_ENTRIES = new WeakMap();
const CHARACTER_MATERIALS = new WeakMap();
const RELEASED_CHARACTERS = new WeakSet();

// These meshes only animate through Object3D transforms. Reusing their immutable
// buffers preserves every vertex while avoiding regeneration for each scholar.
function sharedGeometry(key, create) {
  if (!GEOMETRIES.has(key)) {
    const geometry = create();
    GEOMETRIES.set(key, geometry);
    GEOMETRY_USERS.set(geometry, { key, references: 0 });
  }
  return GEOMETRIES.get(key);
}

function standard(color, roughness = 0.86, side = THREE.FrontSide) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side });
}

function mesh(g, m, parent, x = 0, y = 0, z = 0, shadow = true) {
  const ownership = GEOMETRY_USERS.get(g);
  if (ownership) ownership.references++;
  const obj = new THREE.Mesh(g, m);
  obj.position.set(x, y, z);
  obj.castShadow = shadow;
  obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}

function ellipsoid(parent, mat, size, pos, detail = 16) {
  const obj = mesh(sharedGeometry(`sphere:${detail}`, () => new THREE.SphereGeometry(1, detail, Math.max(10, detail - 4))), mat, parent, ...pos);
  obj.scale.set(...size);
  return obj;
}

function cylinder(parent, mat, top, bottom, length, segments, pos) {
  return mesh(sharedGeometry(`cylinder:${top}:${bottom}:${length}:${segments}`, () => new THREE.CylinderGeometry(top, bottom, length, segments)), mat, parent, ...pos);
}

function torus(parent, mat, radius, tube, radialSegs, tubularSegs, pos) {
  return mesh(sharedGeometry(`torus:${radius}:${tube}:${radialSegs}:${tubularSegs}`, () => new THREE.TorusGeometry(radius, tube, radialSegs, tubularSegs)), mat, parent, ...pos);
}

function roundLine(parent, mat, from, to, radius = 0.01, segs = 7) {
  const A = new THREE.Vector3(...from);
  const B = new THREE.Vector3(...to);
  const dir = B.clone().sub(A);
  const length = dir.length();
  const line = mesh(sharedGeometry(`cylinder:${radius}:${radius}:${length}:${segs}`, () => new THREE.CylinderGeometry(radius, radius, length, segs)), mat, parent, ...A.clone().add(B).multiplyScalar(0.5).toArray(), false);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return line;
}

/**
 * Builds an owned LatheGeometry robe with gentle vertical cloth folds below the waist.
 */
function createDrapedRobeGeometry(profile, {
  segments = 28,
  folds = 6,
  amplitude = 0.022,
  yStart = 0.09,
  yEnd = 1.02,
} = {}) {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, segments);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.08 && y >= yStart && y <= yEnd) {
      const t = 1 - (y - yStart) / Math.max(0.001, yEnd - yStart);
      const weight = Math.sin(Math.min(1, t) * PI * 0.86);
      const angle = Math.atan2(z, x);
      const wave = 1 + amplitude * weight * (0.76 * Math.sin(angle * folds) + 0.24 * Math.cos(angle * (folds + 2) + 0.55));
      pos.setX(i, x * wave);
      pos.setZ(i, z * wave);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a multi-segment curved cloth surface (owned BufferGeometry) for natural scarf drapes.
 */
function addCurvedPanel(parent, material, corners, uvRange, {
  uSegs = 6,
  vSegs = 8,
  curveOut = 0.035,
  ripple = 0.01,
} = {}) {
  const [tl, tr, br, bl] = corners;
  const [u0, v0, u1, v1] = uvRange;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vSegs; iv++) {
    const tv = iv / vSegs;
    for (let iu = 0; iu <= uSegs; iu++) {
      const tu = iu / uSegs;
      const topX = tl[0] + (tr[0] - tl[0]) * tu;
      const topY = tl[1] + (tr[1] - tl[1]) * tu;
      const topZ = tl[2] + (tr[2] - tl[2]) * tu;
      const botX = bl[0] + (br[0] - bl[0]) * tu;
      const botY = bl[1] + (br[1] - bl[1]) * tu;
      const botZ = bl[2] + (br[2] - bl[2]) * tu;

      const arch = Math.sin(tu * PI) * Math.sin(tv * PI * 0.9) * curveOut;
      const fold = Math.sin(tu * PI * 2.5) * tv * ripple;
      const x = topX + (botX - topX) * tv;
      const y = topY + (botY - topY) * tv;
      const z = topZ + (botZ - topZ) * tv + arch + fold;

      positions.push(x, y, z);
      uvs.push(u0 + (u1 - u0) * tu, v0 + (v1 - v0) * tv);
    }
  }

  const stride = uSegs + 1;
  for (let iv = 0; iv < vSegs; iv++) {
    for (let iu = 0; iu < uSegs; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent);
}

/**
 * Builds a gracefully curved partial-cylinder cloth drape with soft folds and tapered edges.
 */
function createCurvedArcDrape(parent, material, {
  radiusTop,
  radiusBottom,
  height,
  radialSegments = 20,
  heightSegments = 8,
  thetaStart,
  thetaLength,
  pos = [0, 0, 0],
  topCurve = 0,
  bottomCurve = 0,
  bulge = 0,
  foldCount = 3,
  foldAmp = 0.012,
  taperBottomX = 1,
}) {
  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
    true,
    thetaStart,
    thetaLength,
  );
  const posAttr = geometry.attributes.position;
  const halfH = height * 0.5;
  const centerTheta = thetaStart + thetaLength * 0.5;

  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);
    const r = Math.hypot(x, z);
    const v = (halfH - y) / Math.max(0.001, height); // 0 at top, 1 at bottom
    const theta = Math.atan2(x, z);
    let dTheta = theta - centerTheta;
    while (dTheta > PI) dTheta -= 2 * PI;
    while (dTheta < -PI) dTheta += 2 * PI;
    const uNorm = Math.max(-1, Math.min(1, dTheta / Math.max(0.001, thetaLength * 0.5)));
    const centerWeight = Math.cos(uNorm * PI * 0.5);

    // Sculpt top bridge contour & soft curved lower hem
    y += topCurve * (1 - v) * centerWeight;
    y -= bottomCurve * v * centerWeight;

    // Convex shoulder drape curve + gentle fabric ripples growing toward bottom edge
    const convex = bulge * Math.sin(v * PI);
    const fold = foldAmp * v * v * Math.cos(uNorm * PI * foldCount);
    const radialScale = r > 0.001 ? (r + convex + fold) / r : 1;
    x *= radialScale * (1 - (1 - taperBottomX) * v);
    z *= radialScale;

    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent, ...pos);
}

/**
 * Procedural red/white houndstooth weave pattern with alternating diamonds for traditional keffiyeh.
 */
function patternedScarf(accent = '#b73332') {
  const key = String(accent).toLowerCase();
  if (SCARF_TEXTURES.has(key)) return SCARF_TEXTURES.get(key);
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const c = canvas.getContext('2d');
    if (!c) return null;

    c.fillStyle = '#f4f0e7';
    c.fillRect(0, 0, 256, 256);

    const step = 24;
    c.strokeStyle = accent;
    c.lineWidth = 5;

    for (let n = -256; n < 512; n += step) {
      c.beginPath(); c.moveTo(n, 0); c.lineTo(n + 256, 256); c.stroke();
      c.beginPath(); c.moveTo(n, 256); c.lineTo(n + 256, 0); c.stroke();
    }

    c.fillStyle = accent;
    for (let y = 12; y < 256; y += 24) {
      for (let x = 12; x < 256; x += 24) {
        if (((x + y) / 24) % 2 < 1) {
          c.fillRect(x - 3, y - 8, 6, 16);
          c.fillRect(x - 8, y - 3, 16, 6);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    SCARF_TEXTURES.set(key, tex);
    return tex;
  } catch {
    return null;
  }
}

function makeMaterials(type, opt) {
  const key = JSON.stringify({
    type,
    robeColor: opt.robeColor,
    scarfColor: opt.scarfColor,
    skinColor: opt.skinColor,
    beardColor: opt.beardColor,
    shoeColor: opt.shoeColor,
  });
  if (cache.has(key)) {
    const entry = cache.get(key);
    entry.references++;
    return entry.materials;
  }

  const tex = patternedScarf(opt.scarfColor);
  const m = {
    robe: standard(opt.robeColor),
    robeTrim: standard(0xd4cfbf, 0.78),
    skin: standard(opt.skinColor, 0.92),
    eyes: standard(0x282321),
    eyeWhite: standard(0xefeadc),
    beard: standard(opt.beardColor, 0.99),
    shoes: standard(opt.shoeColor, 0.92),
    scarf: tex
      ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide })
      : standard(opt.scarfColor, 0.95, THREE.DoubleSide),
    agal: standard('#181819'),
    shadow: standard(0x33302d),
  };
  const entry = { key, materials: m, references: 1 };
  cache.set(key, entry);
  MATERIAL_ENTRIES.set(m, entry);
  return m;
}

/** Release one character's buffers without invalidating another character's
 * shared materials or the bounded scarf-texture cache. Safe to call twice. */
export function disposeCampusCharacter(group) {
  if (!group || RELEASED_CHARACTERS.has(group)) return;
  RELEASED_CHARACTERS.add(group);
  const entry = CHARACTER_MATERIALS.get(group);
  const sharedMaterials = new Set(Object.values(entry?.materials ?? {}));
  const geometries = new Map(), ownMaterials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.set(object.geometry, (geometries.get(object.geometry) ?? 0) + 1);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      if (!sharedMaterials.has(material)) ownMaterials.add(material);
    }
  });
  for (const [geometry, count] of geometries) {
    const ownership = GEOMETRY_USERS.get(geometry);
    if (!ownership) geometry.dispose();
    else if ((ownership.references -= count) <= 0) {
      GEOMETRIES.delete(ownership.key);
      GEOMETRY_USERS.delete(geometry);
      geometry.dispose();
    }
  }
  ownMaterials.forEach(material => material.dispose());
  if (entry && --entry.references === 0) {
    cache.delete(entry.key);
    new Set(Object.values(entry.materials)).forEach(material => material.dispose());
  }
  CHARACTER_MATERIALS.delete(group);
}

function createRobe(body, m) {
  // Smooth waist-to-hem draped panjabi/thobe curve with rounded shoulder yoke
  const profile = [
    [0.0, 0.085],
    [0.44, 0.085],
    [0.52, 0.11],
    [0.515, 0.22],
    [0.495, 0.38],
    [0.465, 0.58],
    [0.425, 0.78],
    [0.39, 0.96],
    [0.378, 1.12],
    [0.375, 1.26],
    [0.355, 1.335],
    [0.31, 1.385],
    [0.23, 1.415],
    [0.16, 1.422],
    [0.0, 1.422],
  ];
  const robe = mesh(createDrapedRobeGeometry(profile, { segments: 28, folds: 6, amplitude: 0.022, yStart: 0.095, yEnd: 1.0 }), m.robe, body);

  // Sewn center placket hugging the chest & yoke exterior (+Z), plus collar trim and buttons
  roundLine(body, m.robeTrim, [0, 1.412, 0.242], [0, 1.335, 0.362], 0.0075);
  roundLine(body, m.robeTrim, [0, 1.335, 0.362], [0, 0.90, 0.408], 0.008);
  roundLine(body, m.robeTrim, [-0.028, 1.33, 0.360], [-0.028, 0.91, 0.404], 0.0045);
  roundLine(body, m.robeTrim, [0.028, 1.33, 0.360], [0.028, 0.91, 0.404], 0.0045);
  for (const [y, z] of [[1.32, 0.368], [1.21, 0.384], [1.10, 0.388], [0.99, 0.398]]) {
    ellipsoid(body, m.shadow, [0.011, 0.011, 0.006], [0, y, z], 8);
  }

  const neck = cylinder(body, m.skin, 0.14, 0.148, 0.18, 14, [0, 1.47, 0]);
  neck.castShadow = false;

  // Standing band collar with crisp trim edge
  cylinder(body, m.robe, 0.168, 0.188, 0.082, 22, [0, 1.436, 0]);
  const collarBase = torus(body, m.robe, 0.188, 0.024, 8, 22, [0, 1.404, 0]);
  collarBase.rotation.x = PI / 2;
  const collarTrim = torus(body, m.robeTrim, 0.171, 0.013, 8, 22, [0, 1.474, 0]);
  collarTrim.rotation.x = PI / 2;

  return robe;
}

function makeSleeve(parent, material, skin, sign, config = {}) {
  const opts = typeof config === 'boolean' ? { long: config } : config;
  const long = opts.long ?? true;
  const shoulderX = opts.shoulderX ?? 0.355;
  const shoulderY = opts.shoulderY ?? 1.255;
  const cuffMat = opts.cuffMat ?? material;

  const shoulder = new THREE.Group();
  shoulder.position.set(sign * shoulderX, shoulderY, 0);
  parent.add(shoulder);

  // Rounded shoulder cap blends upper arm organically into the torso yoke
  ellipsoid(shoulder, material, [0.158, 0.135, 0.152], [sign * 0.012, -0.01, 0], 14);

  // Upper sleeve gently angled outward
  const upper = cylinder(shoulder, material, 0.152, 0.124, 0.31, 14, [sign * 0.062, -0.16, 0]);
  upper.rotation.z = sign * 0.18;

  // Soft rounded elbow joint avoids a harsh straight pipe silhouette
  ellipsoid(shoulder, material, [0.122, 0.102, 0.122], [sign * 0.092, -0.305, 0.006], 12);

  // Tapered forearm sleeve with subtle natural forward pitch
  const forearmLen = long ? 0.32 : 0.23;
  const forearmY = long ? -0.455 : -0.41;
  const forearm = cylinder(shoulder, material, 0.12, 0.092, forearmLen, 14, [sign * 0.118, forearmY, 0.024]);
  forearm.rotation.z = sign * 0.10;
  forearm.rotation.x = -0.10;

  // Finished sleeve cuff rim
  const cuffY = long ? -0.598 : -0.51;
  const cuff = cylinder(shoulder, cuffMat, 0.096, 0.094, 0.038, 14, [sign * 0.132, cuffY, 0.038]);
  cuff.rotation.z = sign * 0.10;
  cuff.rotation.x = -0.10;

  // Sculpted hand emerging neatly past the cuff
  ellipsoid(shoulder, skin, [0.08, 0.106, 0.07], [sign * 0.142, long ? -0.655 : -0.56, 0.046], 12);
  return shoulder;
}

function makeFeet(group, shoeMat, skinMat, sign, sandal = true) {
  const pivot = new THREE.Group();
  pivot.position.set(sign * 0.21, 0.27, 0);
  group.add(pivot);

  ellipsoid(pivot, shoeMat, [0.165, 0.095, 0.265], [0, -0.182, 0.095], 14);
  if (sandal) {
    ellipsoid(pivot, skinMat, [0.118, 0.053, 0.17], [0, -0.133, 0.105], 12);
    ellipsoid(pivot, shoeMat, [0.133, 0.026, 0.09], [0, -0.1, 0.13], 12);
  }
  return pivot;
}

function createFace(headGroup, mats) {
  const skin = mats.skin, eye = mats.eyes;
  ellipsoid(headGroup, skin, [0.25, 0.315, 0.265], [0, 0.02, 0.01], 20);
  for (const sign of [-1, 1]) {
    ellipsoid(headGroup, skin, [0.063, 0.12, 0.055], [sign * 0.255, 0.01, -0.006], 12); // ear
    ellipsoid(headGroup, mats.eyeWhite, [0.071, 0.032, 0.024], [sign * 0.116, 0.062, 0.245], 12);
    ellipsoid(headGroup, eye, [0.024, 0.032, 0.016], [sign * 0.111, 0.061, 0.267], 12);
    ellipsoid(headGroup, mats.beard, [0.078, 0.018, 0.021], [sign * 0.115, 0.128, 0.235], 12);
    ellipsoid(headGroup, mats.beard, [0.085, 0.14, 0.047], [sign * 0.203, -0.205, 0.104], 12);
  }
  ellipsoid(headGroup, skin, [0.061, 0.097, 0.09], [0, -0.045, 0.26], 12); // nose

  // Rounded chin beard
  ellipsoid(headGroup, mats.beard, [0.23, 0.17, 0.16], [0, -0.245, 0.138], 16);
  const beardPoint = mesh(new THREE.ConeGeometry(0.178, 0.29, 16), mats.beard, headGroup, 0, -0.405, 0.125);
  beardPoint.rotation.z = PI;

  for (const sign of [-1, 1]) {
    ellipsoid(headGroup, mats.beard, [0.098, 0.037, 0.027], [sign * 0.073, -0.139, 0.26], 12);
  }
}

function createScarf(headGroup, mats) {
  // Top head wrap + softly curved draped cloth panels
  const cap = mesh(new THREE.SphereGeometry(0.298, 24, 14, 0, 2 * PI, 0, PI * 0.53), mats.scarf, headGroup, 0, 0.20, -0.025);
  cap.scale.set(1.14, 0.86, 1.12);

  for (const sign of [-1, 1]) {
    addCurvedPanel(headGroup, mats.scarf,
      [[sign * 0.235, 0.22, -0.08], [sign * 0.33, 0.16, -0.18],
       [sign * 0.43, -0.65, -0.20], [sign * 0.25, -0.69, 0.08]],
      [0, 0, 1, 1],
      { uSegs: 5, vSegs: 8, curveOut: 0.032, ripple: 0.01 });
    addCurvedPanel(headGroup, mats.scarf,
      [[sign * 0.23, 0.13, -0.20], [sign * 0.31, 0.08, -0.26],
       [sign * 0.30, -0.65, -0.28], [sign * 0.21, -0.53, -0.19]],
      [0, 0, 1, 1],
      { uSegs: 4, vSegs: 6, curveOut: -0.022, ripple: 0.008 });
  }

  addCurvedPanel(headGroup, mats.scarf,
    [[-0.28, 0.16, -0.20], [0.28, 0.16, -0.20],
     [0.37, -0.77, -0.27], [-0.37, -0.77, -0.27]],
    [0, 0, 1, 1.7],
    { uSegs: 8, vSegs: 8, curveOut: -0.042, ripple: 0.012 });

  // Twin agal rings around the crown
  for (const height of [0.275, 0.317]) {
    const ring = torus(headGroup, mats.agal, 0.285, 0.027, 7, 28, [0, height, -0.025]);
    ring.rotation.x = PI / 2;
    ring.scale.z = 0.91;
  }
}

function newRig(group, robe, headPivot, armL, armR, legL, legR, kind, materials) {
  CHARACTER_MATERIALS.set(group, MATERIAL_ENTRIES.get(materials));
  group.userData.campusRig = {
    kind,
    torso: robe,
    headPivot,
    leftArmPivot: armL,
    rightArmPivot: armR,
    leftLegPivot: legL,
    rightLegPivot: legR,
    phase: 0,
    blend: 0,
    initialTorsoY: robe.position.y,
    initialHeadY: headPivot.position.y,
  };
  Object.assign(group.userData, {
    leftArmPivot: armL,
    rightArmPivot: armR,
    leftLegPivot: legL,
    rightLegPivot: legR,
    walkTime: 0,
  });
  return group;
}

/**
 * Creates the Islamic University Hujur scholar 3D character.
 * Coordinate convention: local +Z is forward; soles at ground Y=0.
 * Default scale 0.88 perfectly encloses a ~1.73m human in metre scale.
 */
export function createHujurCharacter(options = {}) {
  const opt = {
    robeColor: '#eae8dc',
    skinColor: '#ba8667',
    scarfColor: '#b42b2d',
    beardColor: '#27201d',
    shoeColor: '#695844',
    scale: 0.88,
    ...options,
  };
  const mats = makeMaterials('hujur', opt);
  const group = new THREE.Group();
  group.name = 'Campus Story - Hujur';
  group.scale.setScalar(opt.scale);

  const body = new THREE.Group();
  group.add(body);
  createRobe(body, mats);
  const leftArm = makeSleeve(body, mats.robe, mats.skin, -1, { cuffMat: mats.robeTrim });
  const rightArm = makeSleeve(body, mats.robe, mats.skin, 1, { cuffMat: mats.robeTrim });
  const leftLeg = makeFeet(group, mats.shoes, mats.skin, -1);
  const rightLeg = makeFeet(group, mats.shoes, mats.skin, 1);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.69, 0);
  body.add(headGroup);

  createFace(headGroup, mats);
  createScarf(headGroup, mats);

  newRig(group, body, headGroup, leftArm, rightArm, leftLeg, rightLeg, 'hujur', mats);
  return group;
}

/**
 * Creates the Islamic University Niqab student 3D character.
 */
export function createNiqabCharacter(options = {}) {
  const opt = {
    robeColor: '#161619',
    skinColor: '#c9a285',
    scarfColor: '#111115',
    beardColor: '#111115',
    shoeColor: '#29242a',
    scale: 0.88,
    ...options,
  };
  const m = makeMaterials('niqab', opt);
  const veil = standard(opt.scarfColor, 0.96, THREE.DoubleSide);
  const root = new THREE.Group();
  root.name = 'Campus Story - Niqab Student';
  root.scale.setScalar(opt.scale);

  const body = new THREE.Group();
  root.add(body);

  // Flowing modest abaya with graceful A-line hem and subtle draped pleats
  const robeProfile = [
    [0.0, 0.06],
    [0.47, 0.06],
    [0.525, 0.095],
    [0.51, 0.22],
    [0.48, 0.42],
    [0.44, 0.64],
    [0.40, 0.86],
    [0.365, 1.06],
    [0.352, 1.24],
    [0.335, 1.33],
    [0.285, 1.39],
    [0.21, 1.43],
    [0.145, 1.455],
    [0.0, 1.455],
  ];
  mesh(createDrapedRobeGeometry(robeProfile, { segments: 28, folds: 7, amplitude: 0.026, yStart: 0.075, yEnd: 1.06 }), m.robe, body);

  // Natural draped shoulder shawl / khimar mantle uniting shoulders and upper chest smoothly
  createCurvedArcDrape(body, veil, {
    radiusTop: 0.235,
    radiusBottom: 0.398,
    height: 0.38,
    radialSegments: 24,
    heightSegments: 6,
    thetaStart: -PI,
    thetaLength: PI * 2,
    pos: [0, 1.28, 0],
    topCurve: 0.01,
    bottomCurve: 0.048,
    bulge: 0.068,
    foldCount: 5,
    foldAmp: 0.012,
  });

  const armL = makeSleeve(body, m.robe, m.robe, -1, { shoulderX: 0.335, shoulderY: 1.265 });
  const armR = makeSleeve(body, m.robe, m.robe, 1, { shoulderX: 0.335, shoulderY: 1.265 });
  const legL = makeFeet(root, m.shoes, m.shoes, -1, false);
  const legR = makeFeet(root, m.shoes, m.shoes, 1, false);

  const head = new THREE.Group();
  head.position.y = 1.66;
  body.add(head);

  // Sculpted hijab head wrap + soft layered crown fold
  ellipsoid(head, veil, [0.282, 0.32, 0.282], [0, 0.072, -0.012], 20);
  const crownFold = mesh(new THREE.SphereGeometry(0.292, 20, 12, 0, 2 * PI, 0, PI * 0.56), veil, head, 0, 0.115, -0.025);
  crownFold.scale.set(1.03, 0.96, 1.04);

  // Contoured recessed eye opening with natural skin curvature and expressive eyes
  const eyeBand = standard(opt.skinColor, 0.9);
  ellipsoid(head, eyeBand, [0.218, 0.112, 0.215], [0, 0.098, 0.068], 16);
  for (const s of [-1, 1]) {
    ellipsoid(head, m.eyeWhite, [0.048, 0.022, 0.016], [s * 0.095, 0.106, 0.272], 12);
    ellipsoid(head, m.eyes, [0.022, 0.022, 0.012], [s * 0.093, 0.106, 0.285], 12);
    ellipsoid(head, m.beard, [0.055, 0.011, 0.014], [s * 0.096, 0.143, 0.267], 10);
  }

  // Soft curved forehead / brow wrap framing the top of the contoured eye opening
  createCurvedArcDrape(head, veil, {
    radiusTop: 0.272,
    radiusBottom: 0.260,
    height: 0.145,
    radialSegments: 18,
    heightSegments: 3,
    thetaStart: -PI * 0.44,
    thetaLength: PI * 0.88,
    pos: [0, 0.228, 0.030],
    topCurve: 0.01,
    bottomCurve: -0.014,
    foldCount: 2,
    foldAmp: 0.005,
  });

  // Gracefully curved draped front niqab veil wrapping smoothly across cheeks and over chest
  createCurvedArcDrape(head, veil, {
    radiusTop: 0.252,
    radiusBottom: 0.368,
    height: 0.45,
    radialSegments: 20,
    heightSegments: 8,
    thetaStart: -PI * 0.45,
    thetaLength: PI * 0.90,
    pos: [0, -0.163, 0.042],
    topCurve: 0.012,
    bottomCurve: 0.038,
    bulge: 0.018,
    foldCount: 3,
    foldAmp: 0.014,
    taperBottomX: 0.92,
  });

  // Curved back khimar cascade wrapping gently around the sides and draping over the upper back
  createCurvedArcDrape(head, veil, {
    radiusTop: 0.258,
    radiusBottom: 0.44,
    height: 0.64,
    radialSegments: 22,
    heightSegments: 6,
    thetaStart: PI * 0.36,
    thetaLength: PI * 1.28,
    pos: [0, -0.22, -0.028],
    topCurve: 0.01,
    bottomCurve: 0.045,
    bulge: 0.025,
    foldCount: 4,
    foldAmp: 0.016,
  });

  newRig(root, body, head, armL, armR, legL, legR, 'niqab', m);
  return root;
}

/**
 * Animates a procedural character's gait, limbs, robe bobbing, and head sway.
 */
export function animateCharacterWalk(character, delta, speed = 0) {
  const rig = character?.userData?.campusRig;
  if (!rig) return;

  delta = Math.max(0, Math.min(Number(delta) || 0, 0.075));
  const moving = typeof speed === 'boolean' ? Number(speed) * 1.8 : Math.abs(Number(speed) || 0);
  const goal = Math.min(1, moving / 1.8);
  rig.blend += (goal - rig.blend) * (1 - Math.exp(-11 * delta));
  const stride = rig.blend;

  if (stride > 0.01) {
    rig.phase += delta * (6.5 + Math.min(6, moving * 1.5));
  }
  const s = Math.sin(rig.phase);
  const bounce = Math.abs(Math.sin(rig.phase)) * 0.018 * stride;

  rig.leftArmPivot.rotation.x = s * 0.37 * stride;
  rig.rightArmPivot.rotation.x = -s * 0.37 * stride;
  rig.leftLegPivot.rotation.x = -s * 0.41 * stride;
  rig.rightLegPivot.rotation.x = s * 0.41 * stride;
  rig.torso.position.y = rig.initialTorsoY + bounce;
  rig.headPivot.rotation.z = s * 0.02 * stride;
  rig.headPivot.rotation.x = 0.035 * stride;
  character.userData.walkTime = rig.phase;
}

/**
 * Helper: Moves an NPC smoothly toward a target point on the campus ground.
 */
export function moveCampusNPCTo(npc, target, delta, speed = 1.1) {
  const vector = new THREE.Vector3(target.x, npc.position.y, target.z).sub(npc.position);
  const dist = vector.length();
  if (dist < 0.12) return 0;
  const dir = vector.normalize();
  const step = Math.min(dist - 0.12, speed * Math.min(delta, 0.075));
  npc.position.addScaledVector(dir, step);
  npc.rotation.y = Math.atan2(dir.x, dir.z);
  return speed;
}
