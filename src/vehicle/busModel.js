import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { localToWorld, worldToLocal, rectangleFootprint } from '../navigation/campusQueries.js';
import { pedestrianContact, touchesPedestrian, vansOverlap } from './contacts.js';

export const BUS_CONFIG = Object.freeze({
  maxSpeed: 24.0,            // ~86.4 km/h top speed
  reverseSpeed: 6.5,
  acceleration: 5.5,          // Heavy bus torque
  reverseAcceleration: 3.2,
  braking: 8.5,              // Responsive pneumatic brakes
  rolling: 0.18,
  drag: 0.015,
  wheelbase: 5.4,
  maxSteer: 0.44,
  wheelRadius: 0.54,
  halfWidth: 1.35,           // Bus width: 2.7m
  front: 3.6,                // Bus length: 9.8m
  rear: 4.6,
});

const approach = (value, target, delta) =>
  value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);

/** Create illuminated destination marquee texture */
function createDestinationTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle LED matrix border frame
    ctx.strokeStyle = '#33220a';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    // Glowing orange/amber LED matrix sign
    ctx.fillStyle = '#ffbb22';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ISLAMIC UNIVERSITY', canvas.width / 2, 43);

    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#ff8411';
    ctx.fillText('কুষ্টিয়া · লাল বাস', canvas.width / 2, 90);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/** Create university crest decal texture for bus flanks */
function createBusSideDecal() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#f6ebd4'; // Cream livery banner background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle crimson & gold accent top/bottom pinstripes
    ctx.fillStyle = '#b8182a';
    ctx.fillRect(0, 0, canvas.width, 7);
    ctx.fillRect(0, canvas.height - 7, canvas.width, 7);
    ctx.fillStyle = '#d49d35';
    ctx.fillRect(0, 9, canvas.width, 3);
    ctx.fillRect(0, canvas.height - 12, canvas.width, 3);

    ctx.fillStyle = '#0f522e'; // Deep Islamic green crest lettering
    ctx.font = 'bold 40px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ইসলামী বিশ্ববিদ্যালয় · কুষ্টিয়া', canvas.width / 2, 46);

    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#9e1526';
    ctx.fillText('ISLAMIC UNIVERSITY · BANGLADESH · BRTC', canvas.width / 2, 90);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/** Create authentic Bangladeshi BRTA commercial license plate texture (কুষ্টিয়া-স ১১-০০৭৯) */
function createLicensePlateTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Authentic BRTA commercial green retro-reflective plate
    ctx.fillStyle = '#116937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#083a1d';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.strokeStyle = '#eef5ef';
    ctx.lineWidth = 4;
    ctx.strokeRect(11, 11, canvas.width - 22, canvas.height - 22);

    // Corner mounting bolts
    ctx.fillStyle = '#cdd6ce';
    for (const [bx, by] of [[22, 22], [234, 22], [22, 106], [234, 106]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('কুষ্টিয়া-স', canvas.width / 2, 44);
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('১১-০০৭৯', canvas.width / 2, 88);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/** Compose a Matrix4 from position and Euler angles. */
function makeTransform(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  matrix.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(1, 1, 1));
  return matrix;
}

/**
 * Normalize and collect geometries by shared PBR material bucket, then merge
 * into minimal draw calls via mergeGeometries.
 */
function createMaterialBatcher() {
  const buckets = new Map();

  function register(name, material, { castShadow = true, receiveShadow = true, vertexColors = false } = {}) {
    buckets.set(name, { name, material, castShadow, receiveShadow, vertexColors, parts: [] });
  }

  function add(bucketName, rawGeo, { matrix = null, color = null } = {}) {
    const bucket = buckets.get(bucketName);
    if (!bucket) throw new Error(`Unknown bus geometry bucket: ${bucketName}`);

    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    if (geo !== rawGeo) rawGeo.dispose();

    if (matrix) geo.applyMatrix4(matrix);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();

    const pos = geo.getAttribute('position');
    const count = pos.count;
    if (!geo.getAttribute('uv')) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }

    // Strip mismatched optional attributes so mergeGeometries never fails
    for (const attr of Object.keys(geo.attributes)) {
      if (attr !== 'position' && attr !== 'normal' && attr !== 'uv' && attr !== 'color') {
        geo.deleteAttribute(attr);
      }
    }

    if (bucket.vertexColors) {
      const c = new THREE.Color(color ?? 0xffffff);
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    } else if (geo.getAttribute('color')) {
      geo.deleteAttribute('color');
    }

    bucket.parts.push(geo);
  }

  function addBox(bucketName, w, h, d, x, y, z, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const matrix = opts.matrix ?? makeTransform(x, y, z, opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    add(bucketName, geo, { matrix, color: opts.color });
  }

  function addCylinder(bucketName, rt, rb, h, segs, x, y, z, opts = {}) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, segs);
    const matrix = opts.matrix ?? makeTransform(x, y, z, opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    add(bucketName, geo, { matrix, color: opts.color });
  }

  function addPlane(bucketName, w, h, x, y, z, opts = {}) {
    const geo = new THREE.PlaneGeometry(w, h);
    const matrix = opts.matrix ?? makeTransform(x, y, z, opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    add(bucketName, geo, { matrix, color: opts.color });
  }

  function addTubeBetween(bucketName, p0, p1, radius, segs = 6, opts = {}) {
    const start = new THREE.Vector3(...p0);
    const end = new THREE.Vector3(...p1);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 1e-5) return;
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const matrix = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
    add(bucketName, new THREE.CylinderGeometry(radius, radius, len, segs), { matrix, color: opts.color });
  }

  function flush(parent) {
    const mergedGeometries = [];
    for (const bucket of buckets.values()) {
      if (!bucket.parts.length) continue;
      const merged = mergeGeometries(bucket.parts, false);
      for (const p of bucket.parts) p.dispose();
      bucket.parts.length = 0;
      if (!merged) throw new Error(`Failed to merge bus geometry bucket: ${bucket.name}`);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      mergedGeometries.push(merged);

      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.name = bucket.name;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      parent.add(mesh);
    }
    return mergedGeometries;
  }

  return { register, add, addBox, addCylinder, addPlane, addTubeBetween, flush };
}

/** Build shared heavy-duty wheel tire & recessed steel/chrome rim geometries for one side. */
function buildHeavyDutyWheelGeometries(radius, width, sideSign) {
  const tireBatch = createMaterialBatcher();
  const dummyMat = null;
  tireBatch.register('tire', dummyMat);
  tireBatch.register('rim', dummyMat, { vertexColors: true });

  // Main wide tire barrel (rotated so axle lies along X)
  const rx = 0, ry = 0, rz = Math.PI / 2;
  tireBatch.addCylinder('tire', radius, radius, width * 0.84, 24, 0, 0, 0, { rx, ry, rz });
  // Sculpted beveled tire sidewalls (wider radius joins main tread, narrower radius faces outward)
  for (const s of [-1, 1]) {
    tireBatch.addCylinder(
      'tire',
      radius * 0.88,
      radius * 0.96,
      width * 0.11,
      24,
      s * (width * 0.45),
      0,
      0,
      { rx, ry, rz: s > 0 ? -Math.PI / 2 : Math.PI / 2 }
    );
  }
  // Tread blocks around tire circumference for realistic close-up heavy-duty rubber profile
  const treadCount = 20;
  for (let i = 0; i < treadCount; i++) {
    const angle = (i / treadCount) * Math.PI * 2;
    const cy = Math.cos(angle) * (radius - 0.005);
    const cz = Math.sin(angle) * (radius - 0.005);
    tireBatch.addBox('tire', width * 0.78, 0.024, 0.055, 0, cy, cz, { rx: angle });
  }

  // Heavy-duty recessed steel rim + 6 hex lug nuts + domed central chrome hubcap
  const rimR = radius * 0.58;
  const outX = sideSign * (width * 0.46);
  const dishX = sideSign * (width * 0.34);
  const outRz = sideSign > 0 ? -Math.PI / 2 : Math.PI / 2;

  // Inner steel barrel spanning wheel width
  tireBatch.addCylinder('rim', rimR * 0.94, rimR * 0.94, width * 0.86, 18, 0, 0, 0, {
    rx, ry, rz, color: 0x676f78,
  });
  // Bright outer steel rim lip (tapers smoothly outward)
  tireBatch.addCylinder('rim', rimR * 0.93, rimR, 0.05, 20, outX, 0, 0, {
    rx, ry, rz: outRz, color: 0xcbd2d8,
  });
  // Recessed concave steel dish
  tireBatch.addCylinder('rim', rimR * 0.76, rimR * 0.76, 0.04, 18, dishX, 0, 0, {
    rx, ry, rz: outRz, color: 0x8e969e,
  });
  // Dark ventilated rim shadow accents around bolt circle
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    tireBatch.addCylinder(
      'rim',
      0.036,
      0.036,
      0.045,
      8,
      dishX + sideSign * 0.008,
      Math.cos(a) * (rimR * 0.62),
      Math.sin(a) * (rimR * 0.62),
      { rx, ry, rz: outRz, color: 0x2a2f35 }
    );
  }
  // 6 chrome hex lug nuts around the central bolt circle
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    tireBatch.addCylinder(
      'rim',
      0.024,
      0.024,
      0.055,
      6,
      dishX + sideSign * 0.035,
      Math.cos(a) * (rimR * 0.38),
      Math.sin(a) * (rimR * 0.38),
      { rx, ry, rz: outRz, color: 0xedf2f6 }
    );
  }
  // Central domed chrome hubcap (narrower apex faces outward)
  tireBatch.addCylinder('rim', rimR * 0.24, rimR * 0.29, 0.08, 14, dishX + sideSign * 0.055, 0, 0, {
    rx, ry, rz: outRz, color: 0xf4f7fa,
  });
  tireBatch.addCylinder('rim', rimR * 0.15, rimR * 0.23, 0.04, 14, dishX + sideSign * 0.10, 0, 0, {
    rx, ry, rz: outRz, color: 0xffffff,
  });

  const tempGroup = new THREE.Group();
  const [tireGeo, rimGeo] = tireBatch.flush(tempGroup);
  tempGroup.clear();
  return { tireGeo, rimGeo };
}

/**
 * Builds the 3D model for the iconic Red Double Decker Bus ("লাল বাস").
 */
export function createDoubleDeckerBusModel() {
  const group = new THREE.Group();
  group.name = 'islamic-university-red-bus';

  const ownedMaterials = new Set();
  const ownedTextures = new Set();
  const ownedGeometries = new Set();

  const trackMat = mat => {
    ownedMaterials.add(mat);
    return mat;
  };
  const trackTex = tex => {
    if (tex) ownedTextures.add(tex);
    return tex;
  };

  // Shared PBR Materials
  const busRed = trackMat(new THREE.MeshStandardMaterial({
    color: 0xb8182a, // Iconic BRTC crimson red
    roughness: 0.36,
    metalness: 0.18,
    envMapIntensity: 0.85,
  }));

  const creamLivery = trackMat(new THREE.MeshStandardMaterial({
    color: 0xf6ebd4, // Crisp cream mid-deck band & roof crown
    roughness: 0.42,
    metalness: 0.08,
    envMapIntensity: 0.72,
  }));

  const goldAccent = trackMat(new THREE.MeshStandardMaterial({
    color: 0xd8a33a, // Lower crimson-gold accent pinstripe & interior handrail brass
    roughness: 0.30,
    metalness: 0.58,
    envMapIntensity: 1.0,
  }));

  const darkTrim = trackMat(new THREE.MeshStandardMaterial({
    color: 0x1a1c1f, // Bumpers, grille slats, gaskets, wheel arches, wipers, louvers
    roughness: 0.84,
    metalness: 0.10,
    envMapIntensity: 0.45,
  }));

  const chromeTrim = trackMat(new THREE.MeshStandardMaterial({
    color: 0xe3e7ec, // Bezels, BRTC bar, side mirrors, roof rails, AC trim
    roughness: 0.16,
    metalness: 0.90,
    envMapIntensity: 1.35,
  }));

  const interiorMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.05,
  }));

  const glassMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0x1e3344, // Reflective tinted double-decker glass
    roughness: 0.08,
    metalness: 0.55,
    envMapIntensity: 1.35,
    transparent: true,
    opacity: 0.72,
  }));

  const headlightMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0xfffbe8,
    roughness: 0.16,
    emissive: 0xfff0b2,
    emissiveIntensity: 0.78,
  }));

  const amberSignalMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0xf59e1b,
    roughness: 0.22,
    emissive: 0xff8c00,
    emissiveIntensity: 0.65,
  }));

  const taillightMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0xd91818,
    roughness: 0.24,
    emissive: 0xc20a0a,
    emissiveIntensity: 0.72,
  }));

  const wheelMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0x181a1d,
    roughness: 0.88,
    metalness: 0.06,
  }));

  const rimMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.25,
    metalness: 0.84,
    envMapIntensity: 1.25,
  }));

  const decalTex = trackTex(createBusSideDecal());
  const decalMat = decalTex
    ? trackMat(new THREE.MeshStandardMaterial({ map: decalTex, roughness: 0.40, metalness: 0.06 }))
    : null;

  const destTex = trackTex(createDestinationTexture());
  const destMat = destTex
    ? trackMat(new THREE.MeshStandardMaterial({
        map: destTex,
        roughness: 0.28,
        emissive: 0x552a04,
        emissiveIntensity: 0.55,
      }))
    : darkTrim;

  const plateTex = trackTex(createLicensePlateTexture());
  const plateMat = plateTex
    ? trackMat(new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.34, metalness: 0.12 }))
    : null;

  const body = new THREE.Group();
  body.name = 'bus-body';
  group.add(body);

  // Batch all static body parts by shared PBR material (~10-13 draw calls total)
  const batch = createMaterialBatcher();
  batch.register('bus-red-shell', busRed, { castShadow: true, receiveShadow: true });
  batch.register('bus-cream-livery', creamLivery, { castShadow: true, receiveShadow: true });
  batch.register('bus-gold-accent', goldAccent, { castShadow: false, receiveShadow: true });
  batch.register('bus-dark-trim', darkTrim, { castShadow: true, receiveShadow: true });
  batch.register('bus-chrome-trim', chromeTrim, { castShadow: true, receiveShadow: true });
  batch.register('bus-interior-cabin', interiorMat, { castShadow: false, receiveShadow: true, vertexColors: true });
  batch.register('bus-tinted-glass', glassMat, { castShadow: false, receiveShadow: false });
  batch.register('bus-headlights', headlightMat, { castShadow: false, receiveShadow: false });
  batch.register('bus-amber-signals', amberSignalMat, { castShadow: false, receiveShadow: false });
  batch.register('bus-taillights', taillightMat, { castShadow: false, receiveShadow: false });
  if (decalMat) batch.register('bus-side-decals', decalMat, { castShadow: false, receiveShadow: true });
  batch.register('bus-destination-board', destMat, { castShadow: false, receiveShadow: false });
  if (plateMat) batch.register('bus-license-plates', plateMat, { castShadow: false, receiveShadow: false });

  // Architectural coordinates (forward = -Z, rear = +Z)
  const W = 2.64;
  const HW = W / 2;           // 1.32
  const Z_FRONT = -4.35;
  const Z_REAR = 4.95;
  const L = Z_REAR - Z_FRONT; // 9.30
  const Z_MID = (Z_FRONT + Z_REAR) / 2; // +0.30

  const FRONT_Z = -2.45;
  const REAR_Z1 = 2.15;
  const REAR_Z2 = 3.45;
  const wheelR = BUS_CONFIG.wheelRadius; // 0.54

  // ---------------------------------------------------------------------------
  // 1. UNDERBODY CHASSIS, WHEEL-WELL CAVITIES & SCULPTED WHEEL-WELL ARCH TRIMS
  // ---------------------------------------------------------------------------
  // Dark underbody floor pan (narrower at wheel wells so tires never intersect)
  batch.addBox('bus-dark-trim', 1.72, 0.16, L - 0.25, 0, 0.46, Z_MID);
  // Longitudinal chassis frame rails
  for (const sx of [-0.62, 0.62]) {
    batch.addBox('bus-dark-trim', 0.12, 0.18, L - 0.7, sx, 0.36, Z_MID);
  }

  // Wheel-well arch trims & recessed dark arch cavities around all 6 wheels
  const axleList = [
    { z: FRONT_Z, r: 0.63 },
    { z: REAR_Z1, r: 0.61 },
    { z: REAR_Z2, r: 0.61 },
  ];
  for (const sign of [-1, 1]) {
    for (const axle of axleList) {
      // Recessed dark wheel-well backing wall
      batch.addBox('bus-dark-trim', 0.08, 0.78, axle.r * 2.02, sign * 0.84, wheelR + 0.22, axle.z);
      // Curved 7-segment rubber wheel-well arch flare hugging outer skin
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI;
        const a1 = ((i + 1) / segs) * Math.PI;
        const am = (a0 + a1) * 0.5;
        const segLen = 2 * axle.r * Math.sin(Math.PI / (segs * 2)) + 0.04;
        const ay = wheelR + Math.sin(am) * axle.r;
        const az = axle.z - Math.cos(am) * axle.r;
        // Dark arch liner ceiling
        batch.addBox('bus-dark-trim', 0.46, 0.05, segLen, sign * 1.09, ay, az, { rx: Math.PI / 2 - am });
        // Proud outer rubber wheel-well flare lip
        batch.addBox('bus-dark-trim', 0.055, 0.075, segLen + 0.015, sign * (HW + 0.014), ay + 0.01, az, { rx: Math.PI / 2 - am });
      }
      // Mudflap behind each wheel arch
      batch.addBox('bus-dark-trim', 0.34, 0.26, 0.035, sign * 1.12, 0.34, axle.z + axle.r + 0.02);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. LOWER DECK BODY SHELL, WHEEL-WELL SKIRTS, 5 WINDOW BAYS & FOLDING DOORS
  // ---------------------------------------------------------------------------
  const lowerDoorFront = [-4.12, -3.14];
  const lowerDoorRear = [0.44, 1.42];
  const lowerWindowBays = [
    [-2.96, -2.00],
    [-1.83, -0.87],
    [-0.70, 0.26],
    [1.60, 2.75],
    [2.93, 4.08],
  ];

  // Continuous crimson lower window sill above wheel arches & skirt segments between arches
  for (const sign of [-1, 1]) {
    const outerX = sign * (HW - 0.055); // Wall thickness 0.11m -> outer face at ±1.32

    // Crimson lower sill rail above wheel arches (broken at full-height folding doors)
    const addSkirtSegment = (z0, z1, y0 = 0.42, y1 = 1.24) => {
      const len = z1 - z0;
      if (len <= 0.02) return;
      batch.addBox('bus-red-shell', 0.11, y1 - y0, len, outerX, (y0 + y1) / 2, (z0 + z1) / 2);
      // Lower crimson-gold accent pinstripe along lower skirt flanks
      if (y1 >= 1.02 && y0 <= 0.90) {
        batch.addBox('bus-gold-accent', 0.022, 0.052, len - 0.01, sign * (HW + 0.008), 0.96, (z0 + z1) / 2);
      }
    };

    // Front corner skirt ahead of front door / driver door
    addSkirtSegment(Z_FRONT + 0.08, lowerDoorFront[0]);
    // On driver side (+X), lower panel beneath driver sliding cab window
    if (sign > 0) {
      addSkirtSegment(lowerDoorFront[0], lowerDoorFront[1], 0.46, 1.24);
      // Subtle recessed driver door outline & chrome handle
      batch.addBox('bus-dark-trim', 0.016, 0.76, 0.02, sign * (HW + 0.005), 0.85, lowerDoorFront[0] + 0.02);
      batch.addBox('bus-dark-trim', 0.016, 0.76, 0.02, sign * (HW + 0.005), 0.85, lowerDoorFront[1] - 0.02);
      batch.addBox('bus-chrome-trim', 0.03, 0.04, 0.14, sign * (HW + 0.015), 1.08, lowerDoorFront[1] - 0.16);
    }
    // Pier between front door & front wheel arch
    addSkirtSegment(lowerDoorFront[1], FRONT_Z - 0.63);
    // Horizontal arch brow skirt over front wheel well
    addSkirtSegment(FRONT_Z - 0.64, FRONT_Z + 0.64, 1.15, 1.24);
    // Solid mid-body lower skirt between front wheel arch and mid-rear folding door
    addSkirtSegment(FRONT_Z + 0.63, lowerDoorRear[0]);
    // Pier between mid-rear door and rear wheel arch 1
    addSkirtSegment(lowerDoorRear[1], REAR_Z1 - 0.61);
    // Horizontal arch brow skirt over rear tandem arches
    addSkirtSegment(REAR_Z1 - 0.62, REAR_Z2 + 0.62, 1.15, 1.24);
    // Rear engine flank skirt behind rear wheel arch 2
    addSkirtSegment(REAR_Z2 + 0.61, Z_REAR - 0.08);
    // Side engine air-intake louver trim on rear crimson flank
    for (let i = 0; i < 4; i++) {
      batch.addBox('bus-dark-trim', 0.028, 0.045, 0.56, sign * (HW + 0.006), 0.78 + i * 0.11, 4.48);
    }

    // Lower deck crimson window mullions & corner piers (y: 1.24..2.18)
    const lowerSolidZones = [
      [Z_FRONT + 0.08, lowerDoorFront[0]],
      [lowerDoorFront[1], lowerWindowBays[0][0]],
      [lowerWindowBays[0][1], lowerWindowBays[1][0]],
      [lowerWindowBays[1][1], lowerWindowBays[2][0]],
      [lowerWindowBays[2][1], lowerDoorRear[0]],
      [lowerDoorRear[1], lowerWindowBays[3][0]],
      [lowerWindowBays[3][1], lowerWindowBays[4][0]],
      [lowerWindowBays[4][1], Z_REAR - 0.08],
    ];
    for (const [z0, z1] of lowerSolidZones) {
      batch.addBox('bus-red-shell', 0.10, 0.94, z1 - z0, sign * (HW - 0.05), 1.71, (z0 + z1) / 2);
    }

    // 5 Individual Recessed Side Window Bays on Lower Deck (+ Driver Cab Window on +X)
    const sideLowerWindows = sign > 0 ? [lowerDoorFront, ...lowerWindowBays] : lowerWindowBays;
    for (const [z0, z1] of sideLowerWindows) {
      const len = z1 - z0;
      const zc = (z0 + z1) / 2;
      // Recessed glass pane (6.2cm inset from outer skin)
      batch.addBox('bus-tinted-glass', 0.018, 0.84, len - 0.04, sign * (HW - 0.062), 1.70, zc);
      // Matte-black recessed window gasket perimeter (top, bottom, left, right)
      batch.addBox('bus-dark-trim', 0.055, 0.045, len, sign * (HW - 0.042), 2.14, zc);
      batch.addBox('bus-dark-trim', 0.055, 0.045, len, sign * (HW - 0.042), 1.26, zc);
      batch.addBox('bus-dark-trim', 0.055, 0.92, 0.036, sign * (HW - 0.042), 1.70, z0 + 0.018);
      batch.addBox('bus-dark-trim', 0.055, 0.92, 0.036, sign * (HW - 0.042), 1.70, z1 - 0.018);
      // Subtle horizontal sliding-window sash bar
      batch.addBox('bus-dark-trim', 0.026, 0.028, len - 0.04, sign * (HW - 0.052), 1.54, zc);
      batch.addBox('bus-chrome-trim', 0.018, 0.014, len - 0.06, sign * (HW - 0.044), 1.54, zc);
    }

    // Glazed Folding Passenger Boarding Doors (front + mid-rear on curb side -X; mid-rear emergency/exit door on +X)
    const foldingDoors = sign < 0 ? [lowerDoorFront, lowerDoorRear] : [lowerDoorRear];
    for (const [z0, z1] of foldingDoors) {
      const len = z1 - z0;
      const zc = (z0 + z1) / 2;
      const leafW = len * 0.48;
      // Recessed door step threshold plate (chrome)
      batch.addBox('bus-chrome-trim', 0.14, 0.04, len - 0.04, sign * (HW - 0.08), 0.45, zc);
      // Outer crimson door header & double-leaf crimson door stiles (recessed slightly for relief)
      batch.addBox('bus-red-shell', 0.075, 0.09, len, sign * (HW - 0.045), 2.13, zc);
      batch.addBox('bus-red-shell', 0.055, 0.14, len - 0.04, sign * (HW - 0.06), 0.54, zc);
      batch.addBox('bus-red-shell', 0.055, 0.14, len - 0.04, sign * (HW - 0.06), 1.24, zc);
      // Outer vertical door leaf stiles & center black rubber folding seal
      batch.addBox('bus-red-shell', 0.06, 1.66, 0.065, sign * (HW - 0.055), 1.32, z0 + 0.035);
      batch.addBox('bus-red-shell', 0.06, 1.66, 0.065, sign * (HW - 0.055), 1.32, z1 - 0.035);
      batch.addBox('bus-dark-trim', 0.065, 1.68, 0.05, sign * (HW - 0.052), 1.32, zc);
      // Upper & lower recessed glazed panes on BOTH folding door leaves
      for (const leafSign of [-1, 1]) {
        const lz = zc + leafSign * (leafW * 0.50);
        // Upper tall door glass
        batch.addBox('bus-tinted-glass', 0.018, 0.74, leafW - 0.10, sign * (HW - 0.072), 1.69, lz);
        // Lower vision door glass
        batch.addBox('bus-tinted-glass', 0.018, 0.52, leafW - 0.10, sign * (HW - 0.072), 0.89, lz);
      }
      // Vertical chrome boarding grab rail just inside door edge
      batch.addCylinder('bus-chrome-trim', 0.016, 0.016, 0.95, 8, sign * (HW - 0.035), 1.35, z1 - 0.06);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. MID-DECK CREAM LIVERY BAND, IU SIDE CREST DECALS & GOLD ACCENT STRIPE
  // ---------------------------------------------------------------------------
  // Crisp cream livery belt wrapping all 4 sides (y: 2.18..2.52)
  batch.addBox('bus-cream-livery', W + 0.03, 0.34, L - 0.12, 0, 2.35, Z_MID);
  batch.addBox('bus-cream-livery', W - 0.14, 0.34, L + 0.03, 0, 2.35, Z_MID);
  // Subtle crimson-gold accent pinstripe trimming the bottom edge of the cream livery band
  batch.addBox('bus-gold-accent', W + 0.042, 0.034, L - 0.14, 0, 2.175, Z_MID);
  batch.addBox('bus-gold-accent', W - 0.16, 0.034, L + 0.042, 0, 2.175, Z_MID);

  // University side banner decals mounted flush on left & right cream livery bands
  if (decalMat) {
    batch.addPlane('bus-side-decals', 5.6, 0.30, -HW - 0.022, 2.35, Z_MID, { ry: -Math.PI / 2 });
    batch.addPlane('bus-side-decals', 5.6, 0.30, HW + 0.022, 2.35, Z_MID, { ry: Math.PI / 2 });
  }

  // ---------------------------------------------------------------------------
  // 4. UPPER DECK SHELL, 6 INDIVIDUAL RECESSED WINDOW BAYS, ROOF BROW & AC PODS
  // ---------------------------------------------------------------------------
  // Upper deck lower apron (y: 2.52..2.82) & upper fascia header (y: 3.92..4.24)
  for (const sign of [-1, 1]) {
    batch.addBox('bus-red-shell', 0.11, 0.30, L - 0.16, sign * (HW - 0.055), 2.67, Z_MID);
    batch.addBox('bus-red-shell', 0.11, 0.32, L - 0.16, sign * (HW - 0.055), 4.08, Z_MID);

    // 6 Individual Recessed Side Window Bays on Upper Deck (z: -4.12 to +4.64)
    const upperBayStart = -4.12;
    const upperBayLen = 1.30;
    const upperMullionLen = 0.192;
    // Front & rear upper corner piers
    batch.addBox('bus-red-shell', 0.105, 1.12, upperBayStart - (Z_FRONT + 0.08), sign * (HW - 0.052), 3.37, (Z_FRONT + 0.08 + upperBayStart) / 2);
    const upperLastEnd = upperBayStart + 6 * upperBayLen + 5 * upperMullionLen; // +4.64
    batch.addBox('bus-red-shell', 0.105, 1.12, (Z_REAR - 0.08) - upperLastEnd, sign * (HW - 0.052), 3.37, (upperLastEnd + Z_REAR - 0.08) / 2);

    for (let i = 0; i < 6; i++) {
      const z0 = upperBayStart + i * (upperBayLen + upperMullionLen);
      const z1 = z0 + upperBayLen;
      const zc = (z0 + z1) / 2;

      // Recessed upper tinted window pane
      batch.addBox('bus-tinted-glass', 0.018, 1.00, upperBayLen - 0.04, sign * (HW - 0.062), 3.37, zc);
      // Matte-black recessed rubber window gasket frame
      batch.addBox('bus-dark-trim', 0.055, 0.048, upperBayLen, sign * (HW - 0.042), 3.895, zc);
      batch.addBox('bus-dark-trim', 0.055, 0.048, upperBayLen, sign * (HW - 0.042), 2.845, zc);
      batch.addBox('bus-dark-trim', 0.055, 1.10, 0.036, sign * (HW - 0.042), 3.37, z0 + 0.018);
      batch.addBox('bus-dark-trim', 0.055, 1.10, 0.036, sign * (HW - 0.042), 3.37, z1 - 0.018);
      // Horizontal aluminum sliding-window transom bar
      batch.addBox('bus-dark-trim', 0.026, 0.028, upperBayLen - 0.04, sign * (HW - 0.052), 3.24, zc);
      batch.addBox('bus-chrome-trim', 0.018, 0.014, upperBayLen - 0.06, sign * (HW - 0.044), 3.24, zc);

      // Crimson vertical window mullion between adjacent upper bays
      if (i < 5) {
        const mz = z1 + upperMullionLen / 2;
        batch.addBox('bus-red-shell', 0.105, 1.12, upperMullionLen, sign * (HW - 0.052), 3.37, mz);
      }
    }
  }

  // Beveled / Rounded Vertical Corner Pillars (4 corners — eliminates boxy shoebox edges)
  for (const sx of [-1, 1]) {
    for (const sz of [Z_FRONT + 0.08, Z_REAR - 0.08]) {
      // Lower & upper crimson chamfered corner columns
      batch.addCylinder('bus-red-shell', 0.095, 0.095, 1.76, 8, sx * (HW - 0.085), 1.30, sz);
      batch.addCylinder('bus-red-shell', 0.095, 0.095, 1.72, 8, sx * (HW - 0.085), 3.38, sz);
      // Cream belt corner chamfer
      batch.addCylinder('bus-cream-livery', 0.108, 0.108, 0.34, 8, sx * (HW - 0.085), 2.35, sz);
    }
  }

  // Sculpted Beveled Roof Brow & Upper Roof Crown Overhang (y: 4.24..4.48)
  // Step 1: Slightly overhanging crimson eaves brow (projects slightly forward over front visor)
  batch.addBox('bus-red-shell', W - 0.04, 0.10, L + 0.08, 0, 4.29, Z_MID - 0.04);
  // Step 2: Chamfered upper crimson roof shoulder
  batch.addBox('bus-red-shell', W - 0.20, 0.09, L - 0.14, 0, 4.38, Z_MID - 0.02);
  // Step 3: Rounded cream upper roof crown cap
  batch.addBox('bus-cream-livery', W - 0.38, 0.08, L - 0.36, 0, 4.44, Z_MID);
  // Front roof brow sun-visor overhang above LED destination marquee
  batch.addBox('bus-red-shell', W - 0.16, 0.07, 0.24, 0, 4.24, Z_FRONT - 0.07, { rx: 0.14 });

  // Roof Safety Railing Rails (slender chrome longitudinal guard rails + stanchions on both sides)
  for (const sign of [-1, 1]) {
    const railX = sign * (HW - 0.22);
    // Longitudinal chrome railing bar
    batch.addCylinder('bus-chrome-trim', 0.018, 0.018, L - 1.10, 8, railX, 4.54, Z_MID + 0.05, { rx: Math.PI / 2 });
    // Stanchion support posts
    for (let i = 0; i < 6; i++) {
      const pz = Z_FRONT + 0.65 + i * ((L - 1.20) / 5);
      batch.addCylinder('bus-chrome-trim', 0.014, 0.016, 0.14, 6, railX, 4.47, pz);
    }
  }

  // Sculpted Dual-Tier Rooftop AC / Ventilation Pods
  for (const podZ of [-1.25, 1.85]) {
    // Lower sculpted cream AC shroud
    batch.addBox('bus-cream-livery', 1.62, 0.18, 1.56, 0, 4.55, podZ);
    // Upper tapered crimson-crowned aerodynamic cap
    batch.addBox('bus-red-shell', 1.42, 0.10, 1.34, 0, 4.68, podZ);
    // Chrome aerodynamic trim band & intake fan grilles
    batch.addBox('bus-chrome-trim', 1.65, 0.04, 1.58, 0, 4.57, podZ);
    for (const gx of [-0.36, 0.36]) {
      batch.addCylinder('bus-dark-trim', 0.26, 0.26, 0.04, 14, gx, 4.73, podZ);
      batch.addCylinder('bus-chrome-trim', 0.06, 0.06, 0.05, 10, gx, 4.735, podZ);
    }
    // Side intake louver slits
    for (const s of [-1, 1]) {
      batch.addBox('bus-dark-trim', 0.03, 0.09, 1.12, s * 0.815, 4.54, podZ);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. FRONT FACE DETAILS: SPLIT WINDSHIELDS, WIPERS, GRILLE, QUAD HEADLIGHTS,
  //    MIRRORS, DESTINATION MARQUEE, SCULPTED BUMPER & BANGLA LICENSE PLATE
  // ---------------------------------------------------------------------------
  // Lower front nose crimson panel (below lower windshield, y: 0.56..1.32)
  batch.addBox('bus-red-shell', W - 0.16, 0.76, 0.12, 0, 0.94, Z_FRONT + 0.06);
  // Upper front apron below upper windshield (y: 2.52..2.76) & brow beside destination box (y: 3.76..4.24)
  batch.addBox('bus-red-shell', W - 0.16, 0.24, 0.12, 0, 2.64, Z_FRONT + 0.06);
  batch.addBox('bus-red-shell', W - 0.16, 0.48, 0.12, 0, 4.00, Z_FRONT + 0.06);

  // Split Panoramic Lower Front Windshield (y: 1.32..2.14) with Cream Center Divider Pillar
  for (const sign of [-1, 1]) {
    batch.addBox('bus-tinted-glass', 1.08, 0.76, 0.02, sign * 0.60, 1.73, Z_FRONT + 0.05);
  }
  batch.addBox('bus-cream-livery', 0.09, 0.84, 0.08, 0, 1.73, Z_FRONT + 0.025);
  // Lower windshield dark rubber gasket surround
  batch.addBox('bus-dark-trim', 2.32, 0.045, 0.06, 0, 2.13, Z_FRONT + 0.035);
  batch.addBox('bus-dark-trim', 2.32, 0.045, 0.06, 0, 1.33, Z_FRONT + 0.035);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-dark-trim', 0.045, 0.84, 0.06, sign * 1.15, 1.73, Z_FRONT + 0.035);
  }

  // Dual Black Windshield Wipers on Lower Panoramic Windshield
  for (const sign of [-1, 1]) {
    const px = sign * 0.52;
    // Wiper pivot hub
    batch.addCylinder('bus-dark-trim', 0.024, 0.024, 0.04, 8, px, 1.33, Z_FRONT - 0.015, { rx: Math.PI / 2 });
    // Angled wiper arm extending diagonally upward
    batch.addTubeBetween('bus-dark-trim', [px, 1.33, Z_FRONT - 0.02], [px + 0.22, 1.66, Z_FRONT + 0.01], 0.010, 6);
    // Wiper blade resting across glass
    batch.addTubeBetween('bus-dark-trim', [px + 0.06, 1.48, Z_FRONT + 0.02], [px + 0.36, 1.88, Z_FRONT + 0.02], 0.013, 6);
  }

  // Split Panoramic Upper Front Windshield (y: 2.76..3.76) with Cream Center Divider Pillar
  for (const sign of [-1, 1]) {
    batch.addBox('bus-tinted-glass', 1.08, 0.94, 0.02, sign * 0.60, 3.26, Z_FRONT + 0.05);
  }
  batch.addBox('bus-cream-livery', 0.09, 1.02, 0.08, 0, 3.26, Z_FRONT + 0.025);
  batch.addBox('bus-dark-trim', 2.32, 0.048, 0.06, 0, 3.75, Z_FRONT + 0.035);
  batch.addBox('bus-dark-trim', 2.32, 0.048, 0.06, 0, 2.77, Z_FRONT + 0.035);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-dark-trim', 0.048, 1.02, 0.06, sign * 1.15, 3.26, Z_FRONT + 0.035);
  }

  // Illuminated Front Destination Marquee Lightbox (y: 3.84..4.20)
  batch.addBox('bus-dark-trim', 1.88, 0.42, 0.07, 0, 4.01, Z_FRONT - 0.01);
  batch.addPlane('bus-destination-board', 1.78, 0.34, 0, 4.01, Z_FRONT - 0.05, { ry: Math.PI });
  // Upper front warm-amber roof clearance marker lights
  for (const sign of [-1, 1]) {
    batch.addBox('bus-amber-signals', 0.14, 0.07, 0.05, sign * 1.08, 4.18, Z_FRONT - 0.02);
  }

  // Recessed Slatted Matte-Black Front Radiator Grille with Chrome BRTC Emblem Bar
  batch.addBox('bus-dark-trim', 1.44, 0.48, 0.06, 0, 0.94, Z_FRONT + 0.015);
  for (let i = 0; i < 6; i++) {
    batch.addBox('bus-dark-trim', 1.38, 0.030, 0.055, 0, 0.75 + i * 0.075, Z_FRONT - 0.012);
  }
  // Chrome perimeter grille bezel
  batch.addBox('bus-chrome-trim', 1.48, 0.032, 0.05, 0, 1.19, Z_FRONT - 0.012);
  batch.addBox('bus-chrome-trim', 1.48, 0.032, 0.05, 0, 0.69, Z_FRONT - 0.012);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-chrome-trim', 0.032, 0.52, 0.05, sign * 0.725, 0.94, Z_FRONT - 0.012);
  }
  // Iconic chrome BRTC horizontal emblem bar & center badge
  batch.addBox('bus-chrome-trim', 1.36, 0.048, 0.045, 0, 1.02, Z_FRONT - 0.028);
  batch.addCylinder('bus-chrome-trim', 0.095, 0.095, 0.045, 14, 0, 1.02, Z_FRONT - 0.035, { rx: Math.PI / 2 });
  batch.addCylinder('bus-red-shell', 0.068, 0.068, 0.05, 14, 0, 1.02, Z_FRONT - 0.038, { rx: Math.PI / 2 });

  // Recessed Quad Chrome-Bezel Headlights + Warm Amber Turn Signals
  for (const sign of [-1, 1]) {
    // Dark recessed headlamp pocket
    batch.addBox('bus-dark-trim', 0.44, 0.24, 0.05, sign * 1.00, 0.92, Z_FRONT + 0.01);
    // Twin round headlights per side (quad headlights total)
    for (const hx of [0.89, 1.09]) {
      // Chrome bezel ring
      batch.addCylinder('bus-chrome-trim', 0.095, 0.095, 0.055, 14, sign * hx, 0.92, Z_FRONT - 0.015, { rx: Math.PI / 2 });
      // Bright recessed headlight lens
      batch.addCylinder('bus-headlights', 0.072, 0.072, 0.062, 14, sign * hx, 0.92, Z_FRONT - 0.018, { rx: Math.PI / 2 });
    }
    // Outboard warm amber turn signal lens wrapping front corner
    batch.addBox('bus-chrome-trim', 0.085, 0.23, 0.055, sign * 1.24, 0.92, Z_FRONT - 0.005);
    batch.addBox('bus-amber-signals', 0.065, 0.19, 0.065, sign * 1.24, 0.92, Z_FRONT - 0.01);
    // Side amber marker indicator near front wheel
    batch.addBox('bus-amber-signals', 0.03, 0.06, 0.14, sign * (HW + 0.01), 1.02, -3.55);
  }

  // Sculpted Front Bumper + Twin Chrome Step Guards + Bangla Front License Plate
  batch.addBox('bus-dark-trim', W + 0.08, 0.30, 0.22, 0, 0.46, Z_FRONT - 0.08);
  // Sculpted beveled bumper corners wrapping around flanks
  for (const sign of [-1, 1]) {
    batch.addBox('bus-dark-trim', 0.10, 0.28, 0.38, sign * (HW + 0.02), 0.46, Z_FRONT + 0.04);
    batch.addBox('bus-chrome-trim', 0.28, 0.06, 0.05, sign * 0.72, 0.49, Z_FRONT - 0.19);
    // Recessed lower bumper fog lamps
    batch.addBox('bus-headlights', 0.16, 0.08, 0.03, sign * 1.04, 0.45, Z_FRONT - 0.185);
  }
  // Raised license plate bracket + authentic Bangla license plate (কুষ্টিয়া-স ১১-০০৭৯)
  batch.addBox('bus-dark-trim', 0.56, 0.28, 0.04, 0, 0.47, Z_FRONT - 0.19);
  if (plateMat) {
    batch.addPlane('bus-license-plates', 0.50, 0.24, 0, 0.47, Z_FRONT - 0.215, { ry: Math.PI });
  }

  // Dual Extended Chrome Side-View Mirrors on Slender Brackets (Left & Right)
  for (const sign of [-1, 1]) {
    const ax = sign * (HW - 0.01);
    const mx = sign * (HW + 0.22);
    // Slender chrome upper & lower tubular mounting arms
    batch.addTubeBetween('bus-chrome-trim', [ax, 2.04, Z_FRONT + 0.10], [mx, 2.04, Z_FRONT - 0.14], 0.014, 6);
    batch.addTubeBetween('bus-chrome-trim', [ax, 1.56, Z_FRONT + 0.10], [mx, 1.62, Z_FRONT - 0.14], 0.014, 6);
    batch.addTubeBetween('bus-chrome-trim', [mx, 2.04, Z_FRONT - 0.14], [mx, 1.60, Z_FRONT - 0.14], 0.015, 6);
    // Tall coach side-view mirror housing (chrome back shell + dark reflective glass)
    batch.addBox('bus-chrome-trim', 0.13, 0.38, 0.06, mx, 1.84, Z_FRONT - 0.16, { ry: sign * -0.18 });
    batch.addBox('bus-tinted-glass', 0.11, 0.34, 0.02, mx, 1.84, Z_FRONT - 0.128, { ry: sign * -0.18 });
  }

  // ---------------------------------------------------------------------------
  // 6. REAR FACE DETAILS: ENGINE LOUVERS, TAILLIGHTS, HIGH-MOUNT BRAKE LIGHT,
  //    REAR UPPER WINDOW, SCULPTED REAR BUMPER & BANGLA LICENSE PLATE
  // ---------------------------------------------------------------------------
  // Solid crimson rear lower engine bay wall (y: 0.54..2.18) & upper rear aprons
  batch.addBox('bus-red-shell', W - 0.16, 1.64, 0.12, 0, 1.36, Z_REAR - 0.06);
  batch.addBox('bus-red-shell', W - 0.16, 0.34, 0.12, 0, 2.69, Z_REAR - 0.06);
  batch.addBox('bus-red-shell', W - 0.16, 0.38, 0.12, 0, 4.05, Z_REAR - 0.06);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-red-shell', 0.28, 1.04, 0.12, sign * 1.10, 3.36, Z_REAR - 0.06);
  }

  // Recessed Rear Upper-Deck Panoramic Window (y: 2.86..3.86)
  batch.addBox('bus-tinted-glass', 1.90, 0.94, 0.02, 0, 3.36, Z_REAR - 0.05);
  batch.addBox('bus-dark-trim', 1.98, 0.048, 0.06, 0, 3.85, Z_REAR - 0.035);
  batch.addBox('bus-dark-trim', 1.98, 0.048, 0.06, 0, 2.87, Z_REAR - 0.035);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-dark-trim', 0.048, 1.02, 0.06, sign * 0.96, 3.36, Z_REAR - 0.035);
  }

  // Rear Engine Ventilation Louver Slats (left, right, and upper central cooling louvers)
  for (const lx of [-0.66, 0.66]) {
    batch.addBox('bus-dark-trim', 0.54, 0.62, 0.04, lx, 1.36, Z_REAR - 0.005);
    for (let i = 0; i < 6; i++) {
      batch.addBox('bus-dark-trim', 0.50, 0.034, 0.05, lx, 1.11 + i * 0.10, Z_REAR + 0.014, { rx: 0.26 });
    }
  }
  // Central engine service hatch seam & chrome handle
  batch.addBox('bus-dark-trim', 0.66, 0.022, 0.025, 0, 1.72, Z_REAR + 0.005);
  batch.addBox('bus-chrome-trim', 0.18, 0.038, 0.04, 0, 1.16, Z_REAR + 0.018);

  // Rear Bangla License Plate (কুষ্টিয়া-স ১১-০০৭৯) centered on rear hatch
  batch.addBox('bus-dark-trim', 0.56, 0.28, 0.04, 0, 0.88, Z_REAR + 0.01);
  if (plateMat) {
    batch.addPlane('bus-license-plates', 0.50, 0.24, 0, 0.88, Z_REAR + 0.036, { ry: 0 });
  }

  // Vertical Rear Lighting Clusters (Taillights, Amber Turn Signals, Reverse Lamps)
  for (const sign of [-1, 1]) {
    batch.addBox('bus-dark-trim', 0.22, 0.68, 0.06, sign * 1.11, 1.12, Z_REAR + 0.012);
    // Upper red brake/taillight
    batch.addBox('bus-taillights', 0.16, 0.26, 0.045, sign * 1.11, 1.30, Z_REAR + 0.034);
    // Middle warm amber turn signal
    batch.addBox('bus-amber-signals', 0.16, 0.16, 0.045, sign * 1.11, 1.07, Z_REAR + 0.034);
    // Lower white reverse lamp
    batch.addBox('bus-headlights', 0.16, 0.12, 0.045, sign * 1.11, 0.90, Z_REAR + 0.034);
  }

  // High-Mounted Brake Lights + Upper Rear Corner Red Marker Lamps
  batch.addBox('bus-dark-trim', 0.76, 0.11, 0.05, 0, 4.10, Z_REAR + 0.012);
  batch.addBox('bus-taillights', 0.68, 0.065, 0.045, 0, 4.10, Z_REAR + 0.032);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-taillights', 0.14, 0.08, 0.05, sign * 1.08, 4.10, Z_REAR + 0.025);
  }

  // Sculpted Rear Bumper + Chrome Exhaust Tailpipe
  batch.addBox('bus-dark-trim', W + 0.08, 0.30, 0.20, 0, 0.46, Z_REAR + 0.07);
  for (const sign of [-1, 1]) {
    batch.addBox('bus-dark-trim', 0.10, 0.28, 0.36, sign * (HW + 0.02), 0.46, Z_REAR - 0.04);
    batch.addBox('bus-chrome-trim', 0.26, 0.05, 0.04, sign * 0.78, 0.48, Z_REAR + 0.17);
  }
  batch.addCylinder('bus-chrome-trim', 0.052, 0.052, 0.34, 10, 0.88, 0.30, Z_REAR + 0.06, { rx: Math.PI / 2 });

  // ---------------------------------------------------------------------------
  // 7. VISIBLE INTERIOR SILHOUETTE: DARK BACKING, CREAM UPPER-DECK CEILING,
  //    WARM CABIN SEATS, DRIVER COCKPIT & REAR STAIRCASE WITH BRASS HANDRAIL
  // ---------------------------------------------------------------------------
  const C_DARK_CABIN = 0x1a1e24;
  const C_MID_FLOOR = 0x2a2e35;
  const C_CREAM_CEIL = 0xf2e9d5;
  const C_SEAT_WARM = 0x8d3b2b; // Warm terracotta/burgundy vinyl seats
  const C_SEAT_FRAME = 0x262a30;
  const C_STAIR_STEP = 0x353b44;
  const C_BRASS_RAIL = 0xd8a33a;

  // Lower deck interior floor, mid-deck ceiling/floor slab, and cream upper-deck ceiling
  batch.addBox('bus-interior-cabin', 2.36, 0.10, L - 0.36, 0, 0.56, Z_MID, { color: C_DARK_CABIN });
  batch.addBox('bus-interior-cabin', 2.36, 0.16, L - 0.36, 0, 2.34, Z_MID, { color: C_MID_FLOOR });
  batch.addBox('bus-interior-cabin', 2.36, 0.10, L - 0.36, 0, 4.14, Z_MID, { color: C_CREAM_CEIL });
  // Subtle dark central inner cabin spine & lower rear engine bulkhead so glass never shows hollow sky
  batch.addBox('bus-interior-cabin', 0.16, 1.50, 1.35, 0, 1.36, 4.05, { color: C_DARK_CABIN });

  // Driver cockpit dashboard, driver seat & tilted steering wheel (right-hand drive +X)
  batch.addBox('bus-interior-cabin', 0.96, 0.58, 0.42, 0.62, 1.02, -3.96, { color: C_DARK_CABIN });
  batch.addBox('bus-interior-cabin', 0.44, 0.68, 0.12, 0.68, 1.24, -3.28, { color: C_SEAT_WARM });
  batch.addBox('bus-interior-cabin', 0.44, 0.14, 0.44, 0.68, 0.92, -3.48, { color: C_SEAT_WARM });
  batch.addCylinder('bus-interior-cabin', 0.21, 0.21, 0.04, 14, 0.68, 1.32, -3.76, { rx: 0.62, color: C_SEAT_FRAME });

  // Helper to place twin passenger seat bench inside cabin
  const addTwinSeat = (sideX, baseY, z) => {
    // Cushion
    batch.addBox('bus-interior-cabin', 0.78, 0.13, 0.44, sideX, baseY + 0.30, z, { color: C_SEAT_WARM });
    // Backrest (tall enough to silhouette crisply through windows!)
    batch.addBox('bus-interior-cabin', 0.78, 0.66, 0.11, sideX, baseY + 0.65, z + 0.18, { rx: -0.10, color: C_SEAT_WARM });
    // Dark seat pedestal frame
    batch.addBox('bus-interior-cabin', 0.64, 0.28, 0.08, sideX, baseY + 0.14, z + 0.04, { color: C_SEAT_FRAME });
  };

  // Lower deck passenger seat rows (skipping boarding door & staircase zones)
  for (const sz of [-2.45, -1.55, -0.65, 2.35, 3.25]) {
    addTwinSeat(0.74, 0.60, sz);
    if (sz < 0.0) addTwinSeat(-0.74, 0.60, sz);
  }

  // Upper deck passenger seat rows (7 full rows including iconic front-row panoramic seats!)
  for (let i = 0; i < 7; i++) {
    const sz = -3.45 + i * 1.24;
    addTwinSeat(0.74, 2.42, sz);
    // Leave staircase landing clear on -X around z = 2.6..3.6
    if (sz < 1.8 || sz > 3.7) {
      addTwinSeat(-0.74, 2.42, sz);
    }
  }

  // Rear Staircase & Warm Brass Handrails rising from mid-rear lower deck up to upper deck (-X)
  const stairSteps = 8;
  for (let i = 0; i < stairSteps; i++) {
    const t = i / (stairSteps - 1);
    const sy = 0.74 + t * 1.62;
    const sz = 1.62 + t * 1.65;
    batch.addBox('bus-interior-cabin', 0.68, 0.10, 0.24, -0.78, sy, sz, { color: C_STAIR_STEP });
  }
  // Diagonal brass staircase safety handrails & upper landing guard rail
  batch.addTubeBetween('bus-interior-cabin', [-0.46, 1.32, 1.58], [-0.46, 3.05, 3.28], 0.022, 6, { color: C_BRASS_RAIL });
  batch.addTubeBetween('bus-interior-cabin', [-1.06, 1.32, 1.58], [-1.06, 3.05, 3.28], 0.022, 6, { color: C_BRASS_RAIL });
  batch.addTubeBetween('bus-interior-cabin', [-0.46, 3.05, 3.28], [-0.46, 3.05, 1.95], 0.022, 6, { color: C_BRASS_RAIL });
  // Vertical chrome/brass grab poles along lower deck aisle
  for (const gz of [-2.0, -0.2, 1.55]) {
    batch.addCylinder('bus-interior-cabin', 0.018, 0.018, 1.68, 6, -0.34, 1.44, gz, { color: C_BRASS_RAIL });
  }

  // Flush all static batched body meshes into `body`
  for (const geo of batch.flush(body)) {
    ownedGeometries.add(geo);
  }

  // ---------------------------------------------------------------------------
  // 8. UPGRADED HEAVY-DUTY WHEELS (6 WHEELS: FRONT STEERING + REAR TANDEM AXLES)
  // ---------------------------------------------------------------------------
  const steering = new THREE.Group();
  steering.name = 'bus-steering';
  steering.position.set(0, 0, FRONT_Z);
  group.add(steering);

  const wheels = [];
  const rearWheels = [];

  // Pre-build left/right shared tire & recessed lug-nut/hubcap rim geometries
  const frontLeftGeos = buildHeavyDutyWheelGeometries(wheelR, 0.34, -1);
  const frontRightGeos = buildHeavyDutyWheelGeometries(wheelR, 0.34, 1);
  const rearLeftGeos = buildHeavyDutyWheelGeometries(wheelR, 0.40, -1);
  const rearRightGeos = buildHeavyDutyWheelGeometries(wheelR, 0.40, 1);

  for (const pair of [frontLeftGeos, frontRightGeos, rearLeftGeos, rearRightGeos]) {
    ownedGeometries.add(pair.tireGeo);
    ownedGeometries.add(pair.rimGeo);
  }

  const makeWheel = (geos, name) => {
    const wGroup = new THREE.Group();
    wGroup.name = name;

    const tire = new THREE.Mesh(geos.tireGeo, wheelMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    wGroup.add(tire);

    const rim = new THREE.Mesh(geos.rimGeo, rimMat);
    rim.castShadow = true;
    rim.receiveShadow = true;
    wGroup.add(rim);

    return wGroup;
  };

  // Front steering pair (pivoting cleanly around steering group at z = FRONT_Z)
  for (const sign of [-1, 1]) {
    const geos = sign < 0 ? frontLeftGeos : frontRightGeos;
    const wheel = makeWheel(geos, sign < 0 ? 'bus-wheel-fl' : 'bus-wheel-fr');
    wheel.position.set(sign * (HW - 0.19), wheelR, 0);
    steering.add(wheel);
    wheels.push(wheel);
  }

  // Rear tandem dual axles (4 rear heavy-duty wheels)
  for (const [idx, rz] of [REAR_Z1, REAR_Z2].entries()) {
    for (const sign of [-1, 1]) {
      const geos = sign < 0 ? rearLeftGeos : rearRightGeos;
      const wheel = makeWheel(geos, `bus-wheel-r${idx + 1}-${sign < 0 ? 'l' : 'r'}`);
      wheel.position.set(sign * (HW - 0.22), wheelR, rz);
      group.add(wheel);
      rearWheels.push(wheel);
      wheels.push(wheel);
    }
  }

  return {
    group,
    body,
    steering,
    wheels,
    rearWheels,
    dispose() {
      group.traverse(o => {
        if (o.geometry) ownedGeometries.add(o.geometry);
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map) ownedTextures.add(m.map);
            if (m.emissiveMap) ownedTextures.add(m.emissiveMap);
            ownedMaterials.add(m);
          }
        }
      });
      for (const geo of ownedGeometries) geo.dispose();
      for (const tex of ownedTextures) tex.dispose();
      for (const mat of ownedMaterials) mat.dispose();
      ownedGeometries.clear();
      ownedTextures.clear();
      ownedMaterials.clear();
      group.clear();
    },
  };
}


/**
 * DoubleDeckerBus entity controller.
 * Handles physics simulation, driver controls, collision responses, and visual synchronization.
 */
export class DoubleDeckerBus {
  constructor({ queries, spawn, config = {} } = {}) {
    this.queries = queries;
    this.config = { ...BUS_CONFIG, ...config };
    this.model = createDoubleDeckerBusModel();
    this.group = this.model.group;

    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.steering = 0;
    this.wheelAngle = 0;
    this.acceleration = 0;
    this.visualLean = 0;
    this.visualPitch = 0;

    this.isBus = true;
    this.id = 'iu-red-bus';
    this.name = 'IU Red Bus (লাল বাস)';
    this.durability = 150;
    this.maxDurability = 150;
    this.occupied = false;
    this.autonomous = false;
    this.hitObstacle = false;
    this.yieldingToPedestrian = false;

    this.driveAcceleration = 0;
    this.impactAge = 0;
    this.impactStrength = 0;
    this.impactRoll = 0;

    this.spawn = { ...spawn };
    this.reset();
  }

  reset(spawn = this.spawn) {
    const y = this.queries ? this.queries.groundHeight(spawn.x ?? 0, spawn.z ?? 0) : 0;
    this.position.set(spawn.x ?? 0, y, spawn.z ?? 0);
    this.yaw = spawn.yaw ?? 0;
    this.speed = this.steering = this.wheelAngle = this.acceleration = this.visualLean = this.visualPitch = 0;
    this.driveAcceleration = this.impactAge = this.impactStrength = this.impactRoll = 0;
    this.durability = this.maxDurability;
    this.occupied = this.autonomous = this.hitObstacle = this.yieldingToPedestrian = false;
    this.syncVisuals(0);
  }

  get disabled() {
    return this.durability <= 0;
  }

  applyDamage(amount, { speed = 0, normal = { x: 0, z: 0 } } = {}) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.durability = Math.max(0, this.durability - amount);
    this.impactAge = 0;
    this.impactStrength = Math.min(0.2, Math.abs(speed) * 0.03);
    const local = worldToLocal(this.position.x + normal.x, this.position.z + normal.z, this.position, this.yaw);
    this.impactRoll = Math.sign(local[0]) * this.impactStrength * 0.6;
    if (this.disabled) this.speed = this.driveAcceleration = 0;
  }

  update(dt, input = {}, { emergencyBrake = false, pedestrians = [], vans = [], onImpact } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, 0.1);
    const ticks = Math.ceil(duration * 60);
    this.hitObstacle = this.yieldingToPedestrian = false;

    for (let i = 0; i < ticks; i++) {
      this.step(
        duration / ticks,
        this.occupied && !this.disabled ? input : {},
        emergencyBrake || this.disabled,
        pedestrians,
        vans,
        onImpact
      );
    }
  }

  step(dt, input, emergencyBrake, pedestrians, vans, onImpact) {
    const cfg = this.config;
    const before = this.speed;
    const isSprint = !!input.sprint;
    const maxSpeed = isSprint ? 32.0 : cfg.maxSpeed;
    const acceleration = isSprint ? 8.0 : cfg.acceleration;
    const brake = input.brake || input.jump || emergencyBrake;
    const force =
      input.forward && !input.back
        ? acceleration
        : input.back && !input.forward
        ? -cfg.reverseAcceleration
        : 0;

    this.driveAcceleration = THREE.MathUtils.lerp(this.driveAcceleration, force, 1 - Math.exp(-12 * dt));

    if (brake) {
      this.speed = approach(this.speed, 0, cfg.braking * dt);
    } else if (input.forward && !input.back) {
      this.speed =
        this.speed < -0.05
          ? approach(this.speed, 0, cfg.braking * dt)
          : Math.max(0, Math.min(maxSpeed, this.speed + Math.max(0, this.driveAcceleration) * dt));
    } else if (input.back && !input.forward) {
      this.speed =
        this.speed > 0.05
          ? approach(this.speed, 0, cfg.braking * dt)
          : Math.min(0, Math.max(-cfg.reverseSpeed, this.speed + Math.min(0, this.driveAcceleration) * dt));
    } else {
      this.speed = approach(this.speed, 0, (cfg.rolling + cfg.drag * this.speed * this.speed) * dt);
    }

    if (Math.abs(this.speed) < 0.01 && (!input.forward && !input.back || brake)) this.speed = 0;

    const steer = Number.isFinite(input.steer)
      ? THREE.MathUtils.clamp(input.steer, -1, 1)
      : Number(!!input.left) - Number(!!input.right);
    const steeringTarget = (steer * cfg.maxSteer) / (1 + Math.abs(this.speed) * 0.05);
    this.steering = approach(this.steering, steeringTarget, 1.4 * dt);

    const yawRate = (this.speed / cfg.wheelbase) * Math.tan(this.steering);
    const steps = Math.max(1, Math.ceil((Math.abs(this.speed) + Math.abs(yawRate) * 3.0) * (dt / 0.065)));
    const subDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      const nextYaw = this.yaw + yawRate * subDt;
      const midYaw = (this.yaw + nextYaw) / 2;
      const candidate = {
        x: this.position.x - Math.sin(midYaw) * this.speed * subDt,
        z: this.position.z - Math.cos(midYaw) * this.speed * subDt,
        y: this.position.y,
      };

      const contacts = pedestrians.filter(p => touchesPedestrian(candidate, nextYaw, cfg, p));
      const other = vans.find(
        v => v !== this && Math.hypot(v.position.x - candidate.x, v.position.z - candidate.z) < 8 && vansOverlap(candidate, nextYaw, cfg, v)
      );
      const worldBlocked = this.queries ? !this.queries.rectangleClear(candidate, nextYaw, cfg) : false;

      if (worldBlocked || other || contacts.length) {
        const impactSpeed = Math.abs(this.speed);
        const forward = {
          x: -Math.sin(nextYaw) * Math.sign(this.speed || 1),
          z: -Math.cos(nextYaw) * Math.sign(this.speed || 1),
        };
        if (worldBlocked || other) {
          onImpact?.({ type: other ? 'vehicle' : 'static', van: this, other, speed: impactSpeed, normal: forward });
        } else {
          for (const pedestrian of contacts) {
            onImpact?.({
              type: 'pedestrian',
              van: this,
              pedestrian,
              speed: impactSpeed,
              normal: pedestrianContact(candidate, nextYaw, cfg, pedestrian) ?? forward,
            });
          }
        }
        this.speed = 0;
        this.hitObstacle = true;
        this.driveAcceleration = 0;
        break;
      }

      this.position.x = candidate.x;
      this.position.z = candidate.z;
      this.yaw = nextYaw;
      this.wheelAngle -= (this.speed * subDt) / cfg.wheelRadius;
    }

    this.acceleration = THREE.MathUtils.lerp(this.acceleration, (this.speed - before) / dt, 1 - Math.exp(-8 * dt));
    if (this.queries) this.position.y = this.queries.groundHeight(this.position.x, this.position.z);
  }

  syncVisuals(dt) {
    this.impactAge += Math.max(0, Math.min(dt, 0.1));
    const front = localToWorld(0, -this.config.front, this.position, this.yaw);
    const rear = localToWorld(0, this.config.rear, this.position, this.yaw);
    const frontY = this.queries ? this.queries.groundHeight(...front) : this.position.y;
    const rearY = this.queries ? this.queries.groundHeight(...rear) : this.position.y;
    this.position.y = (frontY + rearY) / 2;

    const rebound = Math.sin(this.impactAge * 18) * Math.exp(-this.impactAge * 4.5);
    const targetLean = THREE.MathUtils.clamp(
      this.speed * this.speed * Math.tan(this.steering) * 0.005 + this.impactRoll * rebound,
      -0.08,
      0.08
    );
    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(frontY - rearY, this.config.wheelbase) + this.acceleration * 0.008,
      -0.15,
      0.15
    );

    const blend = dt > 0 ? 1 - Math.exp(-8 * Math.min(dt, 0.1)) : 1;
    this.visualLean = THREE.MathUtils.lerp(this.visualLean, targetLean, blend);
    this.visualPitch = THREE.MathUtils.lerp(this.visualPitch, targetPitch, blend);

    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);

    this.model.body.rotation.set(
      THREE.MathUtils.clamp(this.visualPitch + rebound * this.impactStrength, -0.15, 0.15),
      0,
      this.visualLean
    );
    this.model.steering.rotation.y = this.steering;

    for (const wheel of this.model.wheels) {
      wheel.rotation.x = this.wheelAngle;
    }
  }

  distanceFrom(x, z) {
    const [u, v] = worldToLocal(x, z, this.position, this.yaw);
    const cfg = this.config;
    return Math.hypot(Math.max(0, Math.abs(u) - cfg.halfWidth), Math.max(0, -cfg.front - v, v - cfg.rear));
  }

  get footprint() {
    return rectangleFootprint(this.position, this.yaw, this.config);
  }

  createParkedCollider() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    // Heavy bus box collider
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.config.halfWidth * 2, 4.2, this.config.front + this.config.rear),
      material
    );
    mesh.position.set(0, 2.1, (-this.config.front + this.config.rear) / 2);
    group.add(mesh);
    group.position.copy(this.position);
    group.rotation.y = this.yaw;
    group.updateMatrixWorld(true);
    return group;
  }

  dispose() {
    this.model.dispose();
  }
}
