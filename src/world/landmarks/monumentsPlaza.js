import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tintGeometry } from '../facades.js';
import { buildShaheedMinar } from './shaheedMinar.js';
import { buildMartyrsMemorial } from './martyrsMemorial.js';

/**
 * Verified clear garden plaza placements inside public/data/map.osm.
 * Exported as a frozen contract so foliage & scenery can stay clear of paved ceremonial plazas.
 */
export const MONUMENT_PLACEMENTS = Object.freeze([
  Object.freeze({
    id: 'mukta-bangla',
    name: 'Mukta Bangla Sculpture',
    bn: 'মুক্ত বাংলা',
    x: 247.0,
    z: -59.0,
    yaw: 1.57,
    heightMeters: 9.5,
    clearRadius: 11,
    gardenId: '1317423288',
  }),
  Object.freeze({
    id: 'shaheed-minar',
    name: 'Shaheed Minar',
    bn: 'শহীদ মিনার',
    x: 170.0,
    z: -56.0,
    yaw: 0.18,
    heightMeters: 11.5,
    clearRadius: 16,
    gardenId: '1317423287',
  }),
  Object.freeze({
    id: 'martyrs-memorial',
    name: "Martyrs' Memorial",
    bn: 'স্মৃতিসৌধ',
    x: 138.0,
    z: -56.0,
    yaw: 0.12,
    heightMeters: 14.0,
    clearRadius: 16,
    gardenId: '1317423287',
  }),
  Object.freeze({
    id: 'sotota-fountain',
    name: 'Sotota Fountain',
    bn: 'সততা ফোয়ারা',
    x: 168.0,
    z: -103.0,
    yaw: 0,
    heightMeters: 4.2,
    clearRadius: 10,
    gardenId: '1317423238',
  }),
]);

const APRON_BASE_Y = 0.014;
const APRON_TOP_Y = 0.045;

const MUKTA_PALETTE = Object.freeze({
  brickLow: 0x7b4234,
  brickMid: 0x8e4e3e,
  brickTop: 0xa45f4a,
  brickShadow: 0x4f2a21,
  drumDark: 0x72392c,
  drumReliefLight: 0x9b523e,
  drumReliefMid: 0x864333,
  drumReliefDark: 0x5c2c21,
  stoneRim: 0xd9d2c4,
  stoneBright: 0xeae4d7,
  stoneCurb: 0xcfc7b8,
  concreteIvory: 0xede9df,
  concreteBright: 0xf7f5ee,
  concreteShadow: 0xd5cfc2,
  bronzeLight: 0xdfba5b,
  bronzeMain: 0xc49739,
  bronzeMid: 0xa77c28,
  bronzeDark: 0x785619,
  soil: 0x4b382b,
  foliageDark: 0x3b6935,
  foliageLight: 0x538443,
  flowerMarigold: 0xd98a2c,
  flowerCrimson: 0xc23c34,
});

const FOUNTAIN_PALETTE = Object.freeze({
  marbleBright: 0xf6f4ee,
  marbleMain: 0xedeae1,
  marbleMid: 0xdcd6c8,
  marbleShadow: 0xbcb5a6,
  emeraldDeep: 0x135b57,
  emeraldMain: 0x1b7c74,
  emeraldBright: 0x28998e,
  bronzeNozzle: 0x624d2c,
  lotusGold: 0xe3c36c,
  curbBrick: 0x8e4f3e,
  soil: 0x4a382c,
  shrubDark: 0x3b6b37,
  shrubLight: 0x568948,
  petalWarm: 0xe3a83c,
  petalRose: 0xd45b6b,
  waterCenter: 0x157470,
  waterMid: 0x2ba49a,
  waterRim: 0x52c4b8,
  waterFoam: 0xbbf2ec,
  jetAqua: 0x8ee5de,
  jetMist: 0xeffdfb,
});

const APRON_PALETTE = Object.freeze({
  stoneDeck: 0xd8d1c2,
  stoneLight: 0xe5dfd2,
  stoneCurb: 0xc8c0b0,
  brickInlay: 0x995745,
  brickBorder: 0x824738,
  emeraldSlate: 0x3f6e68,
});

function preparePart(geometry, color) {
  geometry.deleteAttribute('uv');
  if (geometry.index) {
    const nonIndexed = geometry.toNonIndexed();
    geometry.dispose();
    geometry = nonIndexed;
  }
  tintGeometry(geometry, color);
  return geometry;
}

function makeAnnulus(rOuter, rInner, y0, y1, segments = 24, startAngle = 0, arcLength = Math.PI * 2, { skipBottom = true } = {}) {
  const positions = [];
  const pushQuad = (a, b, c, d) => { positions.push(...a, ...b, ...c, ...a, ...c, ...d); };
  const closed = Math.abs(arcLength - Math.PI * 2) < 1e-4;
  for (let i = 0; i < segments; i++) {
    const a0 = startAngle + (i / segments) * arcLength;
    const a1 = startAngle + ((i + 1) / segments) * arcLength;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const ox0 = c0 * rOuter, oz0 = s0 * rOuter;
    const ox1 = c1 * rOuter, oz1 = s1 * rOuter;
    const ix0 = c0 * rInner, iz0 = s0 * rInner;
    const ix1 = c1 * rInner, iz1 = s1 * rInner;
    pushQuad([ox0, y1, oz0], [ix0, y1, iz0], [ix1, y1, iz1], [ox1, y1, oz1]);
    pushQuad([ox0, y0, oz0], [ox0, y1, oz0], [ox1, y1, oz1], [ox1, y0, oz1]);
    pushQuad([ix0, y0, iz0], [ix1, y0, iz1], [ix1, y1, iz1], [ix0, y1, iz0]);
    if (!skipBottom) {
      pushQuad([ox0, y0, oz0], [ox1, y0, oz1], [ix1, y0, iz1], [ix0, y0, iz0]);
    }
  }
  if (!closed) {
    const aStart = startAngle, aEnd = startAngle + arcLength;
    const cs = Math.cos(aStart), ss = Math.sin(aStart);
    const ce = Math.cos(aEnd), se = Math.sin(aEnd);
    pushQuad([cs * rInner, y0, ss * rInner], [cs * rInner, y1, ss * rInner],
      [cs * rOuter, y1, ss * rOuter], [cs * rOuter, y0, ss * rOuter]);
    pushQuad([ce * rOuter, y0, se * rOuter], [ce * rOuter, y1, se * rOuter],
      [ce * rInner, y1, se * rInner], [ce * rInner, y0, se * rInner]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Sweeps a rectangular profile smoothly along an array of 3D frames { p, w, d }
 * to sculpt curved concrete liberation wing-arches and unfurling bronze banners cleanly.
 */
function makeSweptRibbon(frames, colorMain, colorEdge = colorMain) {
  const positions = [];
  const colors = [];
  const cMain = new THREE.Color(colorMain);
  const cEdge = new THREE.Color(colorEdge);
  const pushQuad = (a, b, c, d, col) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) colors.push(col.r, col.g, col.b);
  };
  const rings = [];
  const tmpT = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const ref = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < frames.length; i++) {
    const prev = frames[Math.max(0, i - 1)].p;
    const next = frames[Math.min(frames.length - 1, i + 1)].p;
    tmpT.set(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize();
    const axis = frames[i].axis ?? [0, 0, 1];
    ref.set(axis[0], axis[1], axis[2]);
    if (Math.abs(tmpT.dot(ref)) > 0.96) ref.set(1, 0, 0);
    tmpN.crossVectors(ref, tmpT).normalize();
    tmpB.crossVectors(tmpT, tmpN).normalize();
    const hw = frames[i].w / 2, hd = frames[i].d / 2;
    const p = frames[i].p;
    const corner = (sn, sb) => [
      p[0] + tmpN.x * sn * hw + tmpB.x * sb * hd,
      p[1] + tmpN.y * sn * hw + tmpB.y * sb * hd,
      p[2] + tmpN.z * sn * hw + tmpB.z * sb * hd,
    ];
    rings.push([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    pushQuad(r0[0], r0[1], r1[1], r1[0], cMain);
    pushQuad(r0[1], r0[2], r1[2], r1[1], cEdge);
    pushQuad(r0[2], r0[3], r1[3], r1[2], cMain);
    pushQuad(r0[3], r0[0], r1[0], r1[3], cEdge);
  }
  // End caps (outward -T on start, outward +T on end)
  const first = rings[0], last = rings[rings.length - 1];
  pushQuad(first[0], first[3], first[2], first[1], cEdge);
  pushQuad(last[0], last[1], last[2], last[3], cEdge);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds Mukta Bangla Sculpture (মুক্ত বাংলা) as 1 merged vertex-colored mesh (<= 14,000 verts).
 * Local origin sits at y = 0 on the plaza apron; primary ceremonial front faces +Z (toward Main Gate at yaw 1.57).
 */
function buildMuktaBangla() {
  const parts = [];
  const add = (geometry, color) => { parts.push(preparePart(geometry, color)); };
  const box = (x, y, z, w, h, d, color) =>
    add(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color);
  const cyl = (rTop, rBot, h, segs, x, y, z, color, openEnded = false) =>
    add(new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, openEnded).translate(x, y + h / 2, z), color);

  // 1. 3-tier circular stepped red-brick & warm-stone ceremonial pedestal (y = 0 .. 0.96 m).
  const tiers = [
    { r: 5.35, y0: 0.00, y1: 0.30, brick: MUKTA_PALETTE.brickLow, deck: MUKTA_PALETTE.brickMid, lip: MUKTA_PALETTE.stoneRim },
    { r: 4.35, y0: 0.30, y1: 0.62, brick: MUKTA_PALETTE.brickMid, deck: MUKTA_PALETTE.brickTop, lip: MUKTA_PALETTE.stoneRim },
    { r: 3.35, y0: 0.62, y1: 0.96, brick: MUKTA_PALETTE.brickTop, deck: MUKTA_PALETTE.brickTop, lip: MUKTA_PALETTE.stoneBright },
  ];
  const lipH = 0.065;
  for (const t of tiers) {
    const riserH = t.y1 - t.y0 - lipH;
    cyl(t.r - 0.08, t.r - 0.08, riserH, 24, 0, t.y0, 0, t.brick, true);
    cyl(t.r - 0.05, t.r - 0.05, 0.03, 24, 0, t.y1 - lipH - 0.03, 0, MUKTA_PALETTE.brickShadow, true);
    cyl(t.r - 0.24, t.r - 0.24, lipH, 24, 0, t.y1 - lipH, 0, t.deck);
    add(makeAnnulus(t.r, t.r - 0.24, t.y1 - lipH, t.y1, 24), t.lip);
  }

  // Commemorative white-marble dedication plaque plinth on front lower step facing Main Gate (+Z)
  box(0, 0.30, 4.72, 1.35, 0.52, 0.42, MUKTA_PALETTE.stoneBright);
  box(0, 0.36, 4.94, 1.02, 0.36, 0.04, MUKTA_PALETTE.drumDark);

  // 2. Low curved brick flower curb surrounding the pedestal with 4 cardinal ceremonial walkways.
  const curbArcSpan = Math.PI * 0.33;
  for (let q = 0; q < 4; q++) {
    const startA = q * (Math.PI / 2) + Math.PI * 0.085;
    add(makeAnnulus(7.35, 6.60, 0.0, 0.28, 7, startA, curbArcSpan), MUKTA_PALETTE.brickMid);
    add(makeAnnulus(7.40, 7.22, 0.28, 0.35, 7, startA, curbArcSpan), MUKTA_PALETTE.stoneCurb);
    add(makeAnnulus(6.78, 6.55, 0.28, 0.35, 7, startA, curbArcSpan), MUKTA_PALETTE.stoneCurb);
    add(makeAnnulus(7.22, 6.78, 0.24, 0.31, 7, startA + 0.02, curbArcSpan - 0.04), MUKTA_PALETTE.soil);
    for (let b = 0; b < 4; b++) {
      const a = startA + ((b + 0.5) / 4) * curbArcSpan;
      const r = 6.98;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const bush = new THREE.IcosahedronGeometry(0.25 + (b % 2) * 0.05, 0);
      bush.scale(1.18, 0.72, 1.18);
      bush.translate(bx, 0.42, bz);
      add(bush, b % 2 === 0 ? MUKTA_PALETTE.foliageDark : MUKTA_PALETTE.foliageLight);
      const blossom = new THREE.OctahedronGeometry(0.08, 0);
      blossom.translate(bx + Math.cos(a) * 0.08, 0.57, bz + Math.sin(a) * 0.08);
      add(blossom, (q + b) % 2 === 0 ? MUKTA_PALETTE.flowerMarigold : MUKTA_PALETTE.flowerCrimson);
    }
  }

  // 3. Carved dark-terracotta cylindrical relief drum (y = 0.96 .. 2.78 m).
  cyl(2.18, 2.26, 0.16, 22, 0, 0.96, 0, MUKTA_PALETTE.stoneRim);
  cyl(2.04, 2.08, 0.10, 22, 0, 1.12, 0, MUKTA_PALETTE.drumReliefDark, true);
  cyl(1.94, 1.96, 1.32, 22, 0, 1.22, 0, MUKTA_PALETTE.drumDark, true);
  // Upper & lower framed relief rings + 16 carved terracotta bas-relief panels wrapping the drum
  add(makeAnnulus(2.02, 1.93, 1.24, 1.33, 22), MUKTA_PALETTE.drumReliefLight);
  add(makeAnnulus(2.02, 1.93, 2.42, 2.51, 22), MUKTA_PALETTE.drumReliefLight);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const panelH = 0.78 + ((i * 5) % 3) * 0.11;
    const panel = new THREE.BoxGeometry(0.11, panelH, 0.52);
    panel.rotateY(-a);
    panel.translate(Math.cos(a) * 1.97, 1.36 + panelH / 2 + (i % 2) * 0.05, Math.sin(a) * 1.97);
    add(panel, i % 3 === 0 ? MUKTA_PALETTE.drumReliefLight : i % 3 === 1 ? MUKTA_PALETTE.drumReliefMid : MUKTA_PALETTE.drumReliefDark);
  }
  cyl(2.02, 1.98, 0.09, 22, 0, 2.54, 0, MUKTA_PALETTE.drumReliefDark, true);
  cyl(2.22, 2.12, 0.15, 22, 0, 2.63, 0, MUKTA_PALETTE.stoneBright);

  // 4. Soaring sculpted white/ivory concrete liberation motif (curved wing-arches cradling the central spire).
  const concreteRibbon = (controlPoints, wStart, wEnd, dStart, dEnd, steps = 8, axis = [0, 0, 1]) => {
    const curve = new THREE.CatmullRomCurve3(controlPoints.map(pt => new THREE.Vector3(...pt)));
    const frames = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const v = curve.getPoint(t);
      frames.push({
        p: [v.x, v.y, v.z],
        w: wStart + (wEnd - wStart) * t,
        d: dStart + (dEnd - dStart) * t,
        axis,
      });
    }
    parts.push(makeSweptRibbon(frames, MUKTA_PALETTE.concreteIvory, MUKTA_PALETTE.concreteShadow));
  };

  // Sculpted white concrete plinth collar on top of drum supporting the wing-arches
  cyl(1.75, 1.92, 0.24, 18, 0, 2.78, 0, MUKTA_PALETTE.concreteIvory);

  // Symmetric pairs of soaring curved wing-arches sweeping proudly outward and curving inward near the summit
  for (const sign of [-1, 1]) {
    // Primary grand soaring inner liberation wing-arch (up to y = 8.38 m)
    concreteRibbon([
      [sign * 0.95, 2.86, 0.0],
      [sign * 1.95, 4.45, -0.18],
      [sign * 2.10, 6.40, -0.32],
      [sign * 1.12, 7.95, -0.22],
      [sign * 0.26, 8.38, -0.12],
    ], 0.56, 0.24, 0.58, 0.26, 8);

    // Secondary dramatic sweeping outer liberation wing-arch (up to y = 7.42 m)
    concreteRibbon([
      [sign * 1.38, 2.84, 0.14],
      [sign * 2.68, 4.25, 0.06],
      [sign * 2.92, 5.95, -0.10],
      [sign * 2.02, 7.20, -0.16],
      [sign * 1.38, 7.42, -0.14],
    ], 0.44, 0.18, 0.46, 0.20, 7);

    // Graceful low sweeping wing-fin framing the outer silhouette (up to y = 5.95 m)
    concreteRibbon([
      [sign * 1.62, 2.82, 0.34],
      [sign * 2.96, 3.85, 0.26],
      [sign * 3.22, 5.15, 0.12],
      [sign * 2.66, 5.95, 0.02],
    ], 0.34, 0.14, 0.34, 0.16, 6);

    // Rear stabilizing sanctuary wing-ribs curving behind the fist for rich 360-degree sculptural silhouette
    concreteRibbon([
      [sign * 0.72, 2.86, -0.82],
      [sign * 1.28, 4.65, -1.08],
      [sign * 0.92, 6.55, -0.92],
      [sign * 0.18, 7.62, -0.52],
    ], 0.38, 0.18, 0.36, 0.18, 6, [1, 0, 0]);
  }

  // Bright sculptural ivory concrete halo bridge tying the upper wing-arch cradle behind the fist
  concreteRibbon([
    [-1.65, 5.10, -0.34],
    [-0.90, 5.75, -0.56],
    [0.0,   6.00, -0.64],
    [0.90,  5.75, -0.56],
    [1.65,  5.10, -0.34],
  ], 0.28, 0.28, 0.30, 0.30, 6, [0, 1, 0]);

  // 5. Stylized golden-bronze clenched fist & rifle/banner monument silhouette rising to 9.5 m!
  // Stepped bronze mounting socket emerging cleanly from the ivory cradle
  cyl(0.66, 0.82, 0.46, 12, 0, 2.95, 0.08, MUKTA_PALETTE.bronzeDark);
  cyl(0.56, 0.64, 0.24, 12, 0, 3.41, 0.08, MUKTA_PALETTE.bronzeMid);

  // Powerful sculpted upward-thrusting liberation forearm (faceted chamfered bronze column)
  cyl(0.36, 0.50, 2.65, 10, 0, 3.62, 0.10, MUKTA_PALETTE.bronzeMain);
  // Subtle forearm ridge accents catching golden highlights
  box(-0.24, 3.72, 0.22, 0.12, 2.40, 0.26, MUKTA_PALETTE.bronzeLight);
  box(0.24, 3.72, 0.22, 0.12, 2.40, 0.26, MUKTA_PALETTE.bronzeMid);

  // Articulated sculpted bronze clenched fist (y = 6.20 .. 7.40 m)
  // Wrist cuff & palm core
  box(0, 6.20, 0.10, 0.86, 0.22, 0.74, MUKTA_PALETTE.bronzeMid);
  box(0, 6.38, 0.06, 0.96, 0.96, 0.78, MUKTA_PALETTE.bronzeMain);
  // 4 sculpted curled finger knuckle bars gripping tightly around the rifle
  for (let f = 0; f < 4; f++) {
    const fy = 6.44 + f * 0.235;
    box(0.02, fy, 0.48, 0.90, 0.19, 0.24, f % 2 === 0 ? MUKTA_PALETTE.bronzeLight : MUKTA_PALETTE.bronzeMain);
    box(0.02, fy - 0.02, 0.44, 0.84, 0.035, 0.22, MUKTA_PALETTE.bronzeDark);
  }
  // Sculpted thumb wrapping diagonally across the front knuckles
  const thumb = new THREE.BoxGeometry(0.68, 0.26, 0.26);
  thumb.rotateZ(0.38);
  thumb.translate(-0.14, 6.96, 0.58);
  add(thumb, MUKTA_PALETTE.bronzeLight);

  // Stylized upright liberation rifle & ceremonial bayonet spire piercing cleanly through the fist to y = 9.50 m!
  // Rifle buttstock emerging below the fist
  const stock = new THREE.BoxGeometry(0.18, 1.35, 0.34);
  stock.rotateZ(-0.08);
  stock.translate(0.08, 5.55, 0.22);
  add(stock, MUKTA_PALETTE.bronzeDark);
  // Rifle receiver, handguard & rising barrel spire
  box(0, 6.18, 0.24, 0.18, 1.48, 0.28, MUKTA_PALETTE.bronzeMid);
  cyl(0.065, 0.095, 1.24, 10, 0, 7.62, 0.24, MUKTA_PALETTE.bronzeLight);
  // Iconic bayonet & liberation spire tip reaching exact y = 9.50 m
  cyl(0.008, 0.070, 0.64, 8, 0, 8.86, 0.24, MUKTA_PALETTE.bronzeLight);
  // Subtle sight block & bayonet collar
  box(0, 8.58, 0.34, 0.08, 0.24, 0.18, MUKTA_PALETTE.bronzeDark);

  // Sweeping sculpted golden-bronze victory banner unfurling from the rifle spire (y = 7.55 .. 9.22 m)
  const bannerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.04, 8.45, 0.24),
    new THREE.Vector3(0.62, 8.76, 0.16),
    new THREE.Vector3(1.22, 8.48, -0.04),
    new THREE.Vector3(1.66, 8.84, -0.18),
  ]);
  const bannerFrames = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const p = bannerCurve.getPoint(t);
    bannerFrames.push({
      p: [p.x, p.y, p.z],
      w: 0.78 * (1 - t * 0.48),
      d: 0.085,
      axis: [0, 0, 1],
    });
  }
  parts.push(makeSweptRibbon(bannerFrames, MUKTA_PALETTE.bronzeLight, MUKTA_PALETTE.bronzeMid));

  const geometry = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.76,
    envMapIntensity: 0.42,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'mukta-bangla-monument';
  mesh.castShadow = mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'mukta-bangla';
  group.add(mesh);

  return { group, mesh, geometry, material, vertexCount: geometry.getAttribute('position').count };
}

/**
 * Generates a merged BufferGeometry of parabolic water-jet tubes with color gradient
 * (all vertices relative to waterSurfaceY so scaling jetsPivot.scale.y pulses cleanly from the pool).
 */
function buildFountainJetsGeometry(waterSurfaceY) {
  const parts = [];
  const pushArc = (start, peakY, end, rStart, rEnd, steps = 8, radialSegs = 5) => {
    const positions = [];
    const colors = [];
    const cBase = new THREE.Color(FOUNTAIN_PALETTE.jetAqua);
    const cTip = new THREE.Color(FOUNTAIN_PALETTE.jetMist);
    const cTmp = new THREE.Color();
    const rings = [];
    const ringColors = [];
    const tVec = new THREE.Vector3(), nVec = new THREE.Vector3(), bVec = new THREE.Vector3();
    const ref = new THREE.Vector3(0, 1, 0);

    const sample = t => {
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      // Smooth quadratic arch passing through start.y (t=0), peakY near mid-span, and end.y (t=1)
      const baseLinear = start[1] + (end[1] - start[1]) * t;
      const archLift = Math.max(0, peakY - (start[1] + end[1]) * 0.5) * 4 * t * (1 - t);
      return [x, baseLinear + archLift - waterSurfaceY, z];
    };
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push(sample(i / steps));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(steps, i + 1)];
      tVec.set(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize();
      ref.set(0, 1, 0);
      if (Math.abs(tVec.dot(ref)) > 0.95) ref.set(1, 0, 0);
      nVec.crossVectors(ref, tVec).normalize();
      bVec.crossVectors(tVec, nVec).normalize();
      const radius = rStart + (rEnd - rStart) * t;
      const p = pts[i];
      const ring = [];
      for (let s = 0; s < radialSegs; s++) {
        const a = (s / radialSegs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        ring.push([
          p[0] + (nVec.x * ca + bVec.x * sa) * radius,
          p[1] + (nVec.y * ca + bVec.y * sa) * radius,
          p[2] + (nVec.z * ca + bVec.z * sa) * radius,
        ]);
      }
      rings.push(ring);
      // Bright airy mist near apex & splash
      const mistFactor = Math.sin(t * Math.PI) * 0.75 + t * 0.25;
      cTmp.copy(cBase).lerp(cTip, Math.min(1, mistFactor));
      ringColors.push([cTmp.r, cTmp.g, cTmp.b]);
    }
    for (let i = 0; i < steps; i++) {
      const r0 = rings[i], r1 = rings[i + 1];
      const col0 = ringColors[i], col1 = ringColors[i + 1];
      for (let s = 0; s < radialSegs; s++) {
        const sn = (s + 1) % radialSegs;
        positions.push(...r0[s], ...r0[sn], ...r1[sn], ...r0[s], ...r1[sn], ...r1[s]);
        colors.push(...col0, ...col0, ...col1, ...col0, ...col1, ...col1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    parts.push(g);
  };

  // 12 outer rim jets arching gracefully inward from bronze rim nozzles into Tier 1 & inner pool
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pushArc([c * 3.98, 0.72, s * 3.98], 2.28, [c * 1.56, 1.82, s * 1.56], 0.032, 0.056, 8, 5);
  }
  // 8 cascading arcs from Tier 1 bowl rim down into the main basin
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pushArc([c * 1.74, 1.84, s * 1.74], 2.08, [c * 2.95, 0.65, s * 2.95], 0.028, 0.052, 7, 5);
  }
  // 6 upper arcs cascading from Tier 2 bowl into Tier 1 bowl
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pushArc([c * 1.12, 2.70, s * 1.12], 2.86, [c * 1.48, 1.82, s * 1.48], 0.024, 0.042, 6, 4);
  }
  // 4 crown arcs spilling gently from Tier 3 bowl into Tier 2 bowl
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pushArc([c * 0.60, 3.38, s * 0.60], 3.52, [c * 0.88, 2.68, s * 0.88], 0.020, 0.034, 5, 4);
  }
  // Central vertical lotus finial spray plume fanning cleanly into Tier 3
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pushArc([c * 0.03, 4.18, s * 0.03], 4.68, [c * 0.42, 3.36, s * 0.42], 0.022, 0.040, 6, 4);
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Builds a radial-gradient vertex-colored water pool disc for crisp emerald-turquoise depth. */
function makeWaterDisc(radius, y, innerColor, outerColor, segments = 28) {
  const positions = [];
  const colors = [];
  const cIn = new THREE.Color(innerColor);
  const cMid = new THREE.Color(innerColor).lerp(new THREE.Color(outerColor), 0.55);
  const cOut = new THREE.Color(outerColor);
  const rMid = radius * 0.62;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    // Inner fan triangle (+Y normal)
    positions.push(0, y, 0, c1 * rMid, y, s1 * rMid, c0 * rMid, y, s0 * rMid);
    colors.push(cIn.r, cIn.g, cIn.b, cMid.r, cMid.g, cMid.b, cMid.r, cMid.g, cMid.b);
    // Outer ring quad
    positions.push(
      c0 * rMid, y, s0 * rMid, c1 * rMid, y, s1 * rMid, c1 * radius, y, s1 * radius,
      c0 * rMid, y, s0 * rMid, c1 * radius, y, s1 * radius, c0 * radius, y, s0 * radius
    );
    colors.push(
      cMid.r, cMid.g, cMid.b, cMid.r, cMid.g, cMid.b, cOut.r, cOut.g, cOut.b,
      cMid.r, cMid.g, cMid.b, cOut.r, cOut.g, cOut.b, cOut.r, cOut.g, cOut.b
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds Sotota Fountain (সততা ফোয়ারা) for the Administration Building forecourt garden:
 * 3 draw calls total (stonework + reflective water pool + animated water jets).
 */
function buildSototaFountain() {
  const stoneParts = [];
  const addStone = (geometry, color) => { stoneParts.push(preparePart(geometry, color)); };
  const cyl = (rTop, rBot, h, segs, x, y, z, color) =>
    addStone(new THREE.CylinderGeometry(rTop, rBot, h, segs).translate(x, y + h / 2, z), color);

  // 1. Two stepped 16-sided white-stone steps encircling the basin (radius 5.05 m -> 4.60 m).
  cyl(5.04, 5.08, 0.10, 16, 0, 0.00, 0, FOUNTAIN_PALETTE.marbleMid);
  addStone(makeAnnulus(5.06, 4.78, 0.09, 0.13, 16), FOUNTAIN_PALETTE.marbleBright);
  cyl(4.80, 4.84, 0.10, 16, 0, 0.12, 0, FOUNTAIN_PALETTE.marbleMid);
  addStone(makeAnnulus(4.82, 4.56, 0.21, 0.25, 16), FOUNTAIN_PALETTE.marbleBright);

  // 2. White-stone & emerald-mosaic octagonal/16-sided main basin (radius 4.60 m).
  addStone(makeAnnulus(4.60, 4.18, 0.24, 0.74, 16), FOUNTAIN_PALETTE.marbleMain);
  // Overhanging sculpted white-marble bullnose coping rim
  addStone(makeAnnulus(4.68, 4.10, 0.74, 0.84, 16), FOUNTAIN_PALETTE.marbleBright);
  addStone(makeAnnulus(4.62, 4.55, 0.70, 0.74, 16), FOUNTAIN_PALETTE.marbleShadow);
  // Continuous emerald-mosaic inner basin wall liner & compass-tiled mosaic floor
  addStone(makeAnnulus(4.19, 4.14, 0.26, 0.74, 16), FOUNTAIN_PALETTE.emeraldMain);
  cyl(4.18, 4.18, 0.05, 16, 0, 0.22, 0, FOUNTAIN_PALETTE.emeraldDeep);
  addStone(makeAnnulus(2.95, 2.55, 0.27, 0.285, 24), FOUNTAIN_PALETTE.emeraldBright);
  addStone(makeAnnulus(1.65, 1.40, 0.27, 0.285, 20), FOUNTAIN_PALETTE.emeraldBright);
  // 8 framed emerald-mosaic accent panels inlaid around the outer white-stone basin faces
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const panel = new THREE.BoxGeometry(0.06, 0.28, 1.38);
    panel.rotateY(-a);
    panel.translate(Math.cos(a) * 4.59, 0.50, Math.sin(a) * 4.59);
    addStone(panel, FOUNTAIN_PALETTE.emeraldBright);
  }
  // 12 small bronze rim nozzle collars around the inner basin coping
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const nozzle = new THREE.CylinderGeometry(0.045, 0.065, 0.14, 6);
    nozzle.rotateZ(0.45);
    nozzle.rotateY(-a);
    nozzle.translate(Math.cos(a) * 4.02, 0.68, Math.sin(a) * 4.02);
    addStone(nozzle, FOUNTAIN_PALETTE.bronzeNozzle);
  }

  // 3. Central fluted stone pedestal & 3 concentric sculpted stone bowls rising to a lotus finial (height 4.20 m).
  cyl(1.06, 1.16, 0.22, 8, 0, 0.26, 0, FOUNTAIN_PALETTE.marbleMid);
  cyl(0.84, 0.98, 0.34, 8, 0, 0.48, 0, FOUNTAIN_PALETTE.marbleMain);
  cyl(0.56, 0.68, 0.24, 16, 0, 0.82, 0, FOUNTAIN_PALETTE.marbleBright);
  // Tapered sculpted central shaft segments
  cyl(0.40, 0.46, 0.46, 16, 0, 1.02, 0, FOUNTAIN_PALETTE.marbleMain);
  cyl(0.32, 0.36, 0.56, 16, 0, 1.84, 0, FOUNTAIN_PALETTE.marbleMain);
  cyl(0.24, 0.28, 0.48, 16, 0, 2.68, 0, FOUNTAIN_PALETTE.marbleMain);

  const addBowl = (baseY, outerR, depth, rimH) => {
    const pts = [
      new THREE.Vector2(outerR * 0.22, baseY),
      new THREE.Vector2(outerR * 0.48, baseY + depth * 0.14),
      new THREE.Vector2(outerR * 0.84, baseY + depth * 0.48),
      new THREE.Vector2(outerR,        baseY + depth - rimH),
      new THREE.Vector2(outerR * 1.03, baseY + depth),
      new THREE.Vector2(outerR * 0.91, baseY + depth),
      new THREE.Vector2(outerR * 0.84, baseY + depth * 0.64),
      new THREE.Vector2(outerR * 0.20, baseY + depth * 0.42),
    ];
    addStone(new THREE.LatheGeometry(pts, 24), FOUNTAIN_PALETTE.marbleBright);
    // Emerald-mosaic band accent hugging the carved bowl underside
    addStone(makeAnnulus(outerR * 0.82, outerR * 0.72, baseY + depth * 0.34, baseY + depth * 0.44, 24),
      FOUNTAIN_PALETTE.emeraldMain);
  };
  addBowl(1.40, 1.84, 0.48, 0.08); // Tier 1 lower bowl (top y = 1.88 m)
  addBowl(2.34, 1.20, 0.40, 0.07); // Tier 2 middle bowl (top y = 2.74 m)
  addBowl(3.12, 0.68, 0.30, 0.06); // Tier 3 upper bowl (top y = 3.42 m)

  // Graceful sculpted lotus finial crowning the fountain (y = 3.42 .. 4.20 m)
  cyl(0.18, 0.24, 0.22, 12, 0, 3.36, 0, FOUNTAIN_PALETTE.marbleMid);
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    const petal = new THREE.ConeGeometry(0.14, 0.42, 4);
    petal.scale(1.0, 1.0, 0.52);
    petal.rotateX(0.55);
    petal.rotateY(-a);
    petal.translate(Math.cos(a) * 0.22, 3.68, Math.sin(a) * 0.22);
    addStone(petal, FOUNTAIN_PALETTE.marbleBright);
  }
  const lotusBudPts = [
    new THREE.Vector2(0.01, 3.55),
    new THREE.Vector2(0.18, 3.66),
    new THREE.Vector2(0.22, 3.82),
    new THREE.Vector2(0.13, 4.02),
    new THREE.Vector2(0.04, 4.15),
    new THREE.Vector2(0.005, 4.20),
  ];
  addStone(new THREE.LatheGeometry(lotusBudPts, 14), FOUNTAIN_PALETTE.lotusGold);

  // 4. Subtle diagonal corner garden flower coping framing the octagonal fountain court.
  const planterSpan = Math.PI * 0.22;
  for (let c = 0; c < 4; c++) {
    const startA = c * (Math.PI / 2) + Math.PI * 0.14;
    addStone(makeAnnulus(6.75, 5.95, 0.0, 0.26, 8, startA, planterSpan), FOUNTAIN_PALETTE.curbBrick);
    addStone(makeAnnulus(6.80, 6.62, 0.26, 0.33, 8, startA, planterSpan), FOUNTAIN_PALETTE.marbleBright);
    addStone(makeAnnulus(6.10, 5.90, 0.26, 0.33, 8, startA, planterSpan), FOUNTAIN_PALETTE.marbleBright);
    addStone(makeAnnulus(6.62, 6.10, 0.22, 0.29, 8, startA + 0.02, planterSpan - 0.04), FOUNTAIN_PALETTE.soil);
    for (let s = 0; s < 3; s++) {
      const a = startA + ((s + 0.5) / 3) * planterSpan;
      const sx = Math.cos(a) * 6.36, sz = Math.sin(a) * 6.36;
      const mound = new THREE.DodecahedronGeometry(0.24, 0);
      mound.scale(1.2, 0.72, 1.2);
      mound.translate(sx, 0.40, sz);
      addStone(mound, s % 2 === 0 ? FOUNTAIN_PALETTE.shrubDark : FOUNTAIN_PALETTE.shrubLight);
      const bloom = new THREE.OctahedronGeometry(0.075, 0);
      bloom.translate(sx, 0.55, sz);
      addStone(bloom, (c + s) % 2 === 0 ? FOUNTAIN_PALETTE.petalWarm : FOUNTAIN_PALETTE.petalRose);
    }
  }

  const stoneGeometry = mergeGeometries(stoneParts, false);
  stoneParts.forEach(p => p.dispose());
  stoneGeometry.computeBoundingBox();
  stoneGeometry.computeBoundingSphere();
  const stoneMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    envMapIntensity: 0.45,
    side: THREE.DoubleSide,
  });
  const stoneMesh = new THREE.Mesh(stoneGeometry, stoneMaterial);
  stoneMesh.name = 'sotota-fountain-stonework';
  stoneMesh.castShadow = stoneMesh.receiveShadow = true;

  // 5. Shimmering reflective turquoise-emerald water pool (main basin + 3 bowl pools + foam ripple rings).
  const waterSurfaceY = 0.65;
  const poolParts = [
    makeWaterDisc(4.15, waterSurfaceY, FOUNTAIN_PALETTE.waterCenter, FOUNTAIN_PALETTE.waterRim, 28),
    makeWaterDisc(1.70, 1.82, FOUNTAIN_PALETTE.waterMid, FOUNTAIN_PALETTE.waterRim, 20),
    makeWaterDisc(1.09, 2.68, FOUNTAIN_PALETTE.waterMid, FOUNTAIN_PALETTE.waterRim, 16),
    makeWaterDisc(0.58, 3.36, FOUNTAIN_PALETTE.waterRim, FOUNTAIN_PALETTE.waterFoam, 14),
    preparePart(makeAnnulus(3.04, 2.86, waterSurfaceY + 0.004, waterSurfaceY + 0.012, 24), FOUNTAIN_PALETTE.waterFoam),
    preparePart(makeAnnulus(1.62, 1.50, 1.824, 1.832, 20), FOUNTAIN_PALETTE.waterFoam),
  ];
  const poolGeometry = mergeGeometries(poolParts, false);
  poolParts.forEach(p => p.dispose());
  poolGeometry.computeBoundingBox();
  poolGeometry.computeBoundingSphere();
  const poolMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.12,
    metalness: 0.18,
    envMapIntensity: 1.15,
    transparent: true,
    opacity: 0.90,
  });
  const poolMesh = new THREE.Mesh(poolGeometry, poolMaterial);
  poolMesh.name = 'sotota-fountain-water-pool';
  poolMesh.receiveShadow = true;

  // 6. Delicate animated arching water-jet streams anchored cleanly at the basin water line.
  const jetsGeometry = buildFountainJetsGeometry(waterSurfaceY);
  const jetsMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.08,
    envMapIntensity: 0.9,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jetsMesh = new THREE.Mesh(jetsGeometry, jetsMaterial);
  jetsMesh.name = 'sotota-fountain-water-jets';
  const jetsPivot = new THREE.Group();
  jetsPivot.name = 'sotota-fountain-jets-pivot';
  jetsPivot.position.y = waterSurfaceY;
  jetsPivot.add(jetsMesh);

  const group = new THREE.Group();
  group.name = 'sotota-fountain';
  group.add(stoneMesh, poolMesh, jetsPivot);

  return {
    group,
    jetsPivot,
    poolMaterial,
    jetsMaterial,
    geometries: [stoneGeometry, poolGeometry, jetsGeometry],
    materials: [stoneMaterial, poolMaterial, jetsMaterial],
    vertexCounts: {
      stonework: stoneGeometry.getAttribute('position').count,
      waterPool: poolGeometry.getAttribute('position').count,
      waterJets: jetsGeometry.getAttribute('position').count,
    },
  };
}

/**
 * Builds all 4 ceremonial paved stone & brick forecourt aprons (plus the linking memorial walkway)
 * merged into a single world-space draw call cleanly elevated above garden turf (y = 0.014..0.045 m).
 */
function buildPlazaAprons(placements) {
  const parts = [];
  const slabH = APRON_TOP_Y - APRON_BASE_Y;
  const curbH = 0.032;

  const pushLocal = (geometry, color, x, z, yaw = 0) => {
    const part = preparePart(geometry, color);
    if (yaw) part.rotateY(yaw);
    part.translate(x, 0, z);
    parts.push(part);
  };

  const byId = Object.fromEntries(placements.map(p => [p.id, p]));

  // 1. Mukta Bangla circular paved stone & brick ceremonial plaza + East entrance tongue toward Main Gate
  const mb = byId['mukta-bangla'];
  pushLocal(new THREE.CylinderGeometry(8.35, 8.42, slabH, 32).translate(0, APRON_BASE_Y + slabH / 2, 0),
    APRON_PALETTE.stoneDeck, mb.x, mb.z, mb.yaw);
  pushLocal(makeAnnulus(8.36, 7.95, APRON_TOP_Y, APRON_TOP_Y + 0.008, 32),
    APRON_PALETTE.brickInlay, mb.x, mb.z, mb.yaw);
  pushLocal(makeAnnulus(6.15, 5.75, APRON_TOP_Y, APRON_TOP_Y + 0.006, 32),
    APRON_PALETTE.stoneLight, mb.x, mb.z, mb.yaw);
  pushLocal(makeAnnulus(8.52, 8.34, APRON_BASE_Y, APRON_TOP_Y + curbH, 32),
    APRON_PALETTE.stoneCurb, mb.x, mb.z, mb.yaw);
  // Ceremonial East approach pad (+Z local -> +X world at yaw 1.57)
  pushLocal(new THREE.BoxGeometry(3.4, slabH, 2.2).translate(0, APRON_BASE_Y + slabH / 2, 8.8),
    APRON_PALETTE.stoneLight, mb.x, mb.z, mb.yaw);
  pushLocal(new THREE.BoxGeometry(3.7, 0.008, 2.2).translate(0, APRON_TOP_Y + 0.002, 8.8),
    APRON_PALETTE.brickBorder, mb.x, mb.z, mb.yaw);

  // 2. Shaheed Minar elliptical stone & brick memorial forecourt apron matching its oval steps
  const sm = byId['shaheed-minar'];
  const smRx = 13.5, smRz = 9.1, smZ = 1.65;
  const smSlab = new THREE.CylinderGeometry(1, 1, slabH, 32);
  smSlab.scale(smRx, 1, smRz);
  smSlab.translate(0, APRON_BASE_Y + slabH / 2, smZ);
  pushLocal(smSlab, APRON_PALETTE.stoneDeck, sm.x, sm.z, sm.yaw);
  const smBrick = makeAnnulus(1.0, 0.945, APRON_TOP_Y, APRON_TOP_Y + 0.007, 32);
  smBrick.scale(smRx - 0.15, 1, smRz - 0.15);
  smBrick.translate(0, 0, smZ);
  pushLocal(smBrick, APRON_PALETTE.brickInlay, sm.x, sm.z, sm.yaw);
  const smCurb = makeAnnulus(1.014, 0.996, APRON_BASE_Y, APRON_TOP_Y + curbH, 32);
  smCurb.scale(smRx, 1, smRz);
  smCurb.translate(0, 0, smZ);
  pushLocal(smCurb, APRON_PALETTE.stoneCurb, sm.x, sm.z, sm.yaw);
  // Crisp pale limestone ceremonial approach carpet in front of the Minar (-Z)
  pushLocal(new THREE.BoxGeometry(4.6, 0.007, 3.8).translate(0, APRON_TOP_Y + 0.0035, -5.85),
    APRON_PALETTE.stoneLight, sm.x, sm.z, sm.yaw);

  // 3. Martyrs' Memorial approach apron (framing the 3-step ceremonial platform & central portal approach)
  const mm = byId['martyrs-memorial'];
  const mmW = 23.0, mmD = 15.6, mmZ = -0.5;
  pushLocal(new THREE.BoxGeometry(mmW, slabH, mmD).translate(0, APRON_BASE_Y + slabH / 2, mmZ),
    APRON_PALETTE.stoneDeck, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(mmW - 0.9, 0.006, 0.55).translate(0, APRON_TOP_Y + 0.003, mmZ - mmD / 2 + 0.72),
    APRON_PALETTE.brickInlay, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(mmW - 0.9, 0.006, 0.55).translate(0, APRON_TOP_Y + 0.003, mmZ + mmD / 2 - 0.72),
    APRON_PALETTE.brickInlay, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(4.2, 0.007, 4.0).translate(0, APRON_TOP_Y + 0.0035, -6.3),
    APRON_PALETTE.stoneLight, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(mmW + 0.36, curbH, 0.18).translate(0, APRON_TOP_Y + curbH / 2, mmZ - mmD / 2 - 0.09),
    APRON_PALETTE.stoneCurb, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(mmW + 0.36, curbH, 0.18).translate(0, APRON_TOP_Y + curbH / 2, mmZ + mmD / 2 + 0.09),
    APRON_PALETTE.stoneCurb, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(0.18, curbH, mmD).translate(-mmW / 2 - 0.09, APRON_TOP_Y + curbH / 2, mmZ),
    APRON_PALETTE.stoneCurb, mm.x, mm.z, mm.yaw);
  pushLocal(new THREE.BoxGeometry(0.18, curbH, mmD).translate(mmW / 2 + 0.09, APRON_TOP_Y + curbH / 2, mmZ),
    APRON_PALETTE.stoneCurb, mm.x, mm.z, mm.yaw);

  // Connecting stone & brick ceremonial promenade seamlessly linking Shaheed Minar & Martyrs' Memorial
  const midX = (sm.x + mm.x) / 2, midZ = (sm.z + mm.z) / 2 - 0.4;
  pushLocal(new THREE.BoxGeometry(8.2, slabH, 3.6).translate(0, APRON_BASE_Y + slabH / 2, 0),
    APRON_PALETTE.stoneLight, midX, midZ, 0);
  pushLocal(new THREE.BoxGeometry(8.2, 0.007, 0.32).translate(0, APRON_TOP_Y + 0.0035, -1.64),
    APRON_PALETTE.brickBorder, midX, midZ, 0);
  pushLocal(new THREE.BoxGeometry(8.2, 0.007, 0.32).translate(0, APRON_TOP_Y + 0.0035, 1.64),
    APRON_PALETTE.brickBorder, midX, midZ, 0);

  // 4. Sotota Fountain octagonal white-stone & emerald-slate promenade apron + 4 cardinal approach spurs
  const sf = byId['sotota-fountain'];
  pushLocal(new THREE.CylinderGeometry(7.65, 7.72, slabH, 8).rotateY(Math.PI / 8).translate(0, APRON_BASE_Y + slabH / 2, 0),
    APRON_PALETTE.stoneDeck, sf.x, sf.z, sf.yaw);
  pushLocal(makeAnnulus(7.35, 6.98, APRON_TOP_Y, APRON_TOP_Y + 0.007, 8, Math.PI / 8),
    APRON_PALETTE.emeraldSlate, sf.x, sf.z, sf.yaw);
  pushLocal(makeAnnulus(5.58, 5.26, APRON_TOP_Y, APRON_TOP_Y + 0.006, 16),
    APRON_PALETTE.stoneLight, sf.x, sf.z, sf.yaw);
  pushLocal(makeAnnulus(7.80, 7.62, APRON_BASE_Y, APRON_TOP_Y + curbH, 8, Math.PI / 8),
    APRON_PALETTE.stoneCurb, sf.x, sf.z, sf.yaw);
  for (let d = 0; d < 4; d++) {
    const a = d * (Math.PI / 2);
    pushLocal(new THREE.BoxGeometry(2.3, slabH, 1.5).translate(0, APRON_BASE_Y + slabH / 2, 7.7),
      APRON_PALETTE.stoneLight, sf.x, sf.z, a);
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    envMapIntensity: 0.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'heritage-plaza-aprons';
  mesh.receiveShadow = true;

  return { mesh, geometry, material, vertexCount: geometry.getAttribute('position').count };
}

/**
 * Builds the Campus Heritage Monuments Plaza ensemble (Mukta Bangla, Shaheed Minar,
 * Martyrs' Memorial, Sotota Fountain + paved ceremonial aprons).
 * Visual-only geometry: zero collision mutations, <= 8 total draw calls, idempotent dispose().
 */
export function buildMonumentsPlaza(mapData = {}) {
  const placements = MONUMENT_PLACEMENTS.map(p => Object.freeze({ ...p }));
  const byId = Object.fromEntries(placements.map(p => [p.id, p]));

  const group = new THREE.Group();
  group.name = 'campus-heritage-monuments-plaza';

  // 1. Merged ceremonial stone & brick plaza aprons (1 draw call)
  const aprons = buildPlazaAprons(placements);
  group.add(aprons.mesh);

  // 2. Mukta Bangla Sculpture (1 draw call)
  const muktaPlacement = byId['mukta-bangla'];
  const mukta = buildMuktaBangla();
  mukta.group.position.set(muktaPlacement.x, APRON_TOP_Y, muktaPlacement.z);
  mukta.group.rotation.y = muktaPlacement.yaw;
  group.add(mukta.group);

  // 3. Shaheed Minar (1 draw call, delegated cleanly to standalone builder)
  const minarPlacement = byId['shaheed-minar'];
  const shaheedMinar = buildShaheedMinar({ heightMeters: minarPlacement.heightMeters });
  shaheedMinar.group.name = 'shaheed-minar';
  shaheedMinar.group.position.set(minarPlacement.x, APRON_TOP_Y, minarPlacement.z);
  shaheedMinar.group.rotation.y = minarPlacement.yaw;
  group.add(shaheedMinar.group);

  // 4. Martyrs' Memorial (1 draw call, delegated cleanly to standalone builder)
  const memorialPlacement = byId['martyrs-memorial'];
  const martyrsMemorial = buildMartyrsMemorial({ heightMeters: memorialPlacement.heightMeters });
  martyrsMemorial.group.name = 'martyrs-memorial';
  martyrsMemorial.group.position.set(memorialPlacement.x, APRON_TOP_Y, memorialPlacement.z);
  martyrsMemorial.group.rotation.y = memorialPlacement.yaw;
  group.add(martyrsMemorial.group);

  // 5. Sotota Fountain (3 draw calls: stonework + reflective turquoise water pool + animated water jets)
  const fountainPlacement = byId['sotota-fountain'];
  const fountain = buildSototaFountain();
  fountain.group.position.set(fountainPlacement.x, APRON_TOP_Y, fountainPlacement.z);
  fountain.group.rotation.y = fountainPlacement.yaw;
  group.add(fountain.group);

  // Count actual draw calls (meshes) and vertex budgets across the entire group
  let drawCalls = 0;
  let totalVertices = 0;
  group.traverse(object => {
    if (object.isMesh) {
      drawCalls++;
      totalVertices += object.geometry?.getAttribute('position')?.count ?? 0;
    }
  });

  const diagnostics = {
    monumentCount: placements.length,
    drawCalls,
    collisionObjects: 0,
    totalVertices,
    vertexCounts: {
      aprons: aprons.vertexCount,
      muktaBangla: mukta.vertexCount,
      shaheedMinar: shaheedMinar.group.children[0].geometry.getAttribute('position').count,
      martyrsMemorial: martyrsMemorial.group.children[0].geometry.getAttribute('position').count,
      sototaFountain: fountain.vertexCounts,
    },
    monuments: placements.map(p => ({ ...p })),
    nested: {
      shaheedMinar: shaheedMinar.diagnostics,
      martyrsMemorial: martyrsMemorial.diagnostics,
    },
    mapContextProvided: Boolean(mapData && (mapData.buildings || mapData.roads || mapData.greens)),
  };
  group.userData.monumentsPlaza = diagnostics;

  let elapsed = 0;
  let disposed = false;

  return {
    group,
    placements: Object.freeze(placements),
    diagnostics,
    update(dt) {
      if (disposed) return;
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      elapsed += step;
      // Gentle zero-allocation pulse on water-jet arcs & turquoise pool shimmer
      const arcPulseY = 1 + Math.sin(elapsed * 2.8) * 0.036;
      const arcPulseXZ = 1 + Math.sin(elapsed * 2.0 + 0.7) * 0.014;
      fountain.jetsPivot.scale.set(arcPulseXZ, arcPulseY, arcPulseXZ);
      fountain.jetsMaterial.opacity = 0.58 + Math.sin(elapsed * 3.6) * 0.07;
      const sheen = 1 + Math.sin(elapsed * 1.45) * 0.045;
      fountain.poolMaterial.color.setHex(0xffffff).multiplyScalar(sheen);
      fountain.poolMaterial.roughness = 0.12 + Math.sin(elapsed * 1.9) * 0.025;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shaheedMinar.dispose();
      martyrsMemorial.dispose();
      aprons.geometry.dispose();
      aprons.material.dispose();
      mukta.geometry.dispose();
      mukta.material.dispose();
      for (const g of fountain.geometries) g.dispose();
      for (const m of fountain.materials) m.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
