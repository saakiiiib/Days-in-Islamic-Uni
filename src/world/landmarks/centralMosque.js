import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { wallEdges, tintGeometry } from '../facades.js';

export const CENTRAL_MOSQUE_ID = '1317423259';
const REFERENCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Central_Mosque_architectures_of_Islamic_University,_Bangladesh.jpg',
  'https://commons.wikimedia.org/wiki/File:Islamic_University_Central_Mosque_main_dome_and_others.jpg',
  'https://thedailycampus.com/public-university/138124',
]);

const PALETTE = Object.freeze({
  domeShell: 0xeee8d9,
  domeRib: 0xf6f2e7,
  drumWall: 0xe3dbc8,
  plinth: 0xd3c9b3,
  cornice: 0xf1ece0,
  shadowSoffit: 0xb4aa94,
  archFront: 0xf0eadb,
  archSide: 0xe1d9c6,
  archReveal: 0xc0b6a0,
  glazing: 0x314549,
  drumGlazing: 0x2a3b3e,
  mullion: 0xd9d2bf,
  parapet: 0xe6dfce,
  merlon: 0xf4efe2,
  goldDark: 0xb99136,
  goldMid: 0xd8b14c,
  goldBright: 0xebc96a,
});

function clearance(point, polygon) {
  if (!pointInPolygon(point, polygon)) return -1;
  let distance = Infinity;
  for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    distance = Math.min(distance, pointToSegmentDistance(point, ring[i - 1], ring[i]));
  }
  return distance;
}

function candidates(polygon) {
  const ring = polygon[0], xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const points = [];
  for (let ix = 0; ix <= 32; ix++) for (let iz = 0; iz <= 32; iz++) {
    const center = [minX + (maxX - minX) * ix / 32, minZ + (maxZ - minZ) * iz / 32];
    const room = clearance(center, polygon);
    if (room > .1) points.push({ center, room });
  }
  return points;
}

/** Right-handed (det = +1) wall-local transform: +X along edge, +Y up, +Z outward. */
function edgeMatrix(edge, d, y, outward) {
  const at = edge.at(d, y, outward);
  return new THREE.Matrix4().set(
    edge.nz, 0, edge.nx, at[0],
    0, 1, 0, at[1],
    -edge.nx, 0, edge.nz, at[2],
    0, 0, 0, 1
  );
}

function pushColoredTri(pos, norm, col, a, b, c, n, color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) pos.push(...a, ...b, ...c);
  else pos.push(...a, ...c, ...b);
  for (let i = 0; i < 3; i++) {
    norm.push(n[0], n[1], n[2]);
    col.push(color.r, color.g, color.b);
  }
}

function pushColoredQuad(pos, norm, col, a, b, c, d, n, color) {
  pushColoredTri(pos, norm, col, a, b, c, n, color);
  pushColoredTri(pos, norm, col, a, c, d, n, color);
}

function buildCustomGeometry(pos, norm, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function pointedArchOutline(halfW, height, bottomY, segments) {
  const spring = bottomY + (height - bottomY) * 0.56;
  const ctrlY = height - (height - bottomY) * 0.14;
  const pts = [[-halfW, bottomY], [-halfW, spring]];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments, u = 1 - t;
    const x = u * u * (-halfW) + 2 * u * t * (-halfW) + t * t * 0;
    const y = u * u * spring + 2 * u * t * ctrlY + t * t * height;
    pts.push([x, y]);
  }
  for (let i = 1; i <= segments; i++) {
    const t = i / segments, u = 1 - t;
    const x = u * u * 0 + 2 * u * t * halfW + t * t * halfW;
    const y = u * u * height + 2 * u * t * ctrlY + t * t * spring;
    pts.push([x, y]);
  }
  pts.push([halfW, bottomY]);
  return pts;
}

/**
 * Lean 3D pointed-arch surround with baked reveal shading and zero hidden back-face triangles.
 * When openBottom is true, leaves ground-level openings completely unobstructed.
 */
function makePointedArchFrame(width, height, thickness, depth, openBottom, segments = 4) {
  const pos = [], norm = [], col = [];
  const cFront = new THREE.Color(PALETTE.archFront);
  const cSide = new THREE.Color(PALETTE.archSide);
  const cReveal = new THREE.Color(PALETTE.archReveal);
  const outer = pointedArchOutline(width / 2, height, 0, segments);
  const inner = pointedArchOutline(Math.max(.05, width / 2 - thickness), Math.max(.1, height - thickness), openBottom ? 0 : thickness, segments);

  for (let i = 0; i < outer.length - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    // Front face
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], depth], [o1[0], o1[1], depth], [i1[0], i1[1], depth], [i0[0], i0[1], depth],
      [0, 0, 1], cFront);
    // Outer rim side face
    const odx = o1[0] - o0[0], ody = o1[1] - o0[1], olen = Math.hypot(odx, ody) || 1;
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], 0], [o1[0], o1[1], 0], [o1[0], o1[1], depth], [o0[0], o0[1], depth],
      [-ody / olen, odx / olen, 0], cSide);
    // Inner recessed reveal soffit
    const idx = i1[0] - i0[0], idy = i1[1] - i0[1], ilen = Math.hypot(idx, idy) || 1;
    pushColoredQuad(pos, norm, col,
      [i0[0], i0[1], depth], [i1[0], i1[1], depth], [i1[0], i1[1], 0], [i0[0], i0[1], 0],
      [idy / ilen, -idx / ilen, 0], cReveal);
  }
  if (!openBottom) {
    const oL = outer[0], oR = outer.at(-1), iL = inner[0], iR = inner.at(-1);
    pushColoredQuad(pos, norm, col,
      [oL[0], oL[1], depth], [iL[0], iL[1], depth], [iR[0], iR[1], depth], [oR[0], oR[1], depth],
      [0, 0, 1], cFront);
    pushColoredQuad(pos, norm, col,
      [iL[0], iL[1], depth], [iR[0], iR[1], depth], [iR[0], iR[1], 0], [iL[0], iL[1], 0],
      [0, 1, 0], cSide);
    pushColoredQuad(pos, norm, col,
      [oL[0], oL[1], 0], [oR[0], oR[1], 0], [oR[0], oR[1], depth], [oL[0], oL[1], depth],
      [0, -1, 0], cReveal);
  }
  return buildCustomGeometry(pos, norm, col);
}

/** Recessed pointed-arch glazing panel with slender geometric mullions. */
function makePointedArchGlazing(width, height, thickness, segments = 4, glazeHex = PALETTE.glazing, zPane = 0.028) {
  const pos = [], norm = [], col = [];
  const cGlass = new THREE.Color(glazeHex);
  const cMullion = new THREE.Color(PALETTE.mullion);
  const halfW = Math.max(.04, width / 2 - thickness * .92);
  const bottomY = thickness * .92;
  const topY = Math.max(bottomY + .1, height - thickness * .92);
  const outline = pointedArchOutline(halfW, topY, bottomY, segments);
  const center = [0, bottomY + (topY - bottomY) * .4, zPane];
  for (let i = 0; i < outline.length - 1; i++) {
    pushColoredTri(pos, norm, col, center,
      [outline[i][0], outline[i][1], zPane], [outline[i + 1][0], outline[i + 1][1], zPane],
      [0, 0, 1], cGlass);
  }
  // Close bottom of glass fan
  pushColoredTri(pos, norm, col, center,
    [outline.at(-1)[0], outline.at(-1)[1], zPane], [outline[0][0], outline[0][1], zPane],
    [0, 0, 1], cGlass);

  // Geometric mullions (vertical central bar + spring transom bar)
  const mw = Math.min(.045, halfW * .11), mz = zPane + .022;
  const springY = bottomY + (topY - bottomY) * 0.54;
  pushColoredQuad(pos, norm, col,
    [-mw / 2, bottomY, mz], [mw / 2, bottomY, mz], [mw / 2, topY - .04, mz], [-mw / 2, topY - .04, mz],
    [0, 0, 1], cMullion);
  pushColoredQuad(pos, norm, col,
    [-halfW, springY - mw / 2, mz], [halfW, springY - mw / 2, mz], [halfW, springY + mw / 2, mz], [-halfW, springY + mw / 2, mz],
    [0, 0, 1], cMullion);
  // Subtle lower sub-transom on taller windows
  if (topY - bottomY > 1.5) {
    const lowY = bottomY + (springY - bottomY) * 0.5;
    pushColoredQuad(pos, norm, col,
      [-halfW, lowY - mw * .4, mz], [halfW, lowY - mw * .4, mz], [halfW, lowY + mw * .4, mz], [-halfW, lowY + mw * .4, mz],
      [0, 0, 1], cMullion);
  }
  return buildCustomGeometry(pos, norm, col);
}

/** Graceful Islamic pointed/lotus dome contour ending at exact (0, rise). */
function islamicDomeProfile(radius, rise, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const r = i === steps ? 0 : radius * (0.93 + 0.12 * Math.sin(s * Math.PI * 0.85)) * Math.pow(Math.cos(s * Math.PI / 2), 0.78);
    const y = i === steps ? rise : rise * (0.64 * Math.sin(s * Math.PI / 2) + 0.36 * s);
    pts.push(new THREE.Vector2(r, y));
  }
  return pts;
}

/** Subtle vertical architectural ribs curving cleanly along the main dome contour. */
function makeDomeRibs(profile, ribCount, ribWidth, ribDepth, colorHex) {
  const pos = [], norm = [], col = [];
  const color = new THREE.Color(colorHex);
  const endStep = Math.max(2, profile.length - 2);
  for (let r = 0; r < ribCount; r++) {
    const theta = r / ribCount * Math.PI * 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const tx = -sin, tz = cos;
    for (let i = 0; i < endStep; i++) {
      const p0 = profile[i], p1 = profile[i + 1];
      const hw0 = ribWidth * 0.5 * Math.min(1, p0.x / (profile[0].x || 1) + 0.25);
      const hw1 = ribWidth * 0.5 * Math.min(1, p1.x / (profile[0].x || 1) + 0.25);
      const r0 = p0.x + ribDepth, r1 = p1.x + ribDepth;
      const a = [cos * r0 - tx * hw0, p0.y, sin * r0 - tz * hw0];
      const b = [cos * r0 + tx * hw0, p0.y, sin * r0 + tz * hw0];
      const c = [cos * r1 + tx * hw1, p1.y, sin * r1 + tz * hw1];
      const d = [cos * r1 - tx * hw1, p1.y, sin * r1 - tz * hw1];
      const dr = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dr, dy) || 1;
      const nr = dy / len, ny = -dr / len;
      pushColoredQuad(pos, norm, col, a, b, c, d, [cos * nr, ny, sin * nr], color);
    }
  }
  return buildCustomGeometry(pos, norm, col);
}

/** Delicate Islamic crescent crown whose highest vertex sits at exact topY. */
function makeCrescentCrown(x, z, baseY, topY, radius, depth = 0.045) {
  const pos = [], norm = [], col = [];
  const cGold = new THREE.Color(PALETTE.goldBright);
  const h = topY - baseY;
  const rOut = Math.min(radius, h * 0.52);
  const cy = topY - rOut * 0.88;
  const rIn = rOut * 0.74;
  const inCy = cy + rOut * 0.24;
  // Build crescent arc from -142 deg to +142 deg (bottom centered at -90 deg, horns pointing up)
  const segs = 10;
  const outerPts = [], innerPts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const angle = (-Math.PI * 0.5 - Math.PI * 0.72) + t * (Math.PI * 1.44);
    const ox = Math.cos(angle) * rOut;
    const oy = Math.min(topY, cy + Math.sin(angle) * rOut);
    outerPts.push([ox, oy]);
    const ix = Math.cos(angle) * rIn * (i === 0 || i === segs ? rOut / rIn : 1);
    const iy = Math.min(topY, i === 0 || i === segs ? oy : inCy + Math.sin(angle) * rIn);
    innerPts.push([ix, iy]);
  }
  const hz = depth * 0.5;
  for (let i = 0; i < segs; i++) {
    const o0 = outerPts[i], o1 = outerPts[i + 1], i0 = innerPts[i], i1 = innerPts[i + 1];
    pushColoredQuad(pos, norm, col,
      [x + o0[0], o0[1], z + hz], [x + o1[0], o1[1], z + hz], [x + i1[0], i1[1], z + hz], [x + i0[0], i0[1], z + hz],
      [0, 0, 1], cGold);
    pushColoredQuad(pos, norm, col,
      [x + i0[0], i0[1], z - hz], [x + i1[0], i1[1], z - hz], [x + o1[0], o1[1], z - hz], [x + o0[0], o0[1], z - hz],
      [0, 0, -1], cGold);
  }
  // Slender central gold spike reaching exact topY so boundingBox.max.y === topY
  const sw = Math.max(.018, rOut * .09);
  pushColoredTri(pos, norm, col, [x - sw, baseY, z], [x + sw, baseY, z], [x, topY, z], [0, 0, 1], cGold);
  pushColoredTri(pos, norm, col, [x, baseY, z - sw], [x, baseY, z + sw], [x, topY, z], [1, 0, 0], cGold);
  return buildCustomGeometry(pos, norm, col);
}

/** Visual augmentation only. Source body/roof and all collision remain caller-owned. */
export function buildCentralMosque(building, options = {}) {
  if (String(building?.id) !== CENTRAL_MOSQUE_ID || (building.osmType && building.osmType !== 'way')) {
    throw new TypeError('Central Mosque model requires OSM way 1317423259');
  }
  const polygon = building.polygons?.[0];
  if (building.polygons?.length !== 1 || !polygon?.[0]?.length || polygon.some(ring =>
    ring.length < 4 || ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
    ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
    throw new TypeError('Central Mosque requires one finite closed mapped polygon');
  }
  const baseHeight = options.baseHeight ?? building.height ?? 9.6;
  const mainDomeTopMeters = options.mainDomeTopMeters ?? 27.4;
  if (!Number.isFinite(baseHeight) || baseHeight < 3 || !Number.isFinite(mainDomeTopMeters) ||
    mainDomeTopMeters <= baseHeight + 4 || mainDomeTopMeters > 100) {
    throw new RangeError('Mosque roof and provisional ground-to-finial height must leave room for the dome');
  }
  const points = candidates(polygon).sort((a, b) => b.room - a.room);
  if (!points.length || points[0].room < 3) throw new RangeError('Mosque footprint has no usable dome placement');
  const requested = options.mainDomeCenter;
  const mainCenter = requested ? [...requested] : [...points[0].center];
  if (mainCenter.length !== 2 || !mainCenter.every(Number.isFinite) || clearance(mainCenter, polygon) < 3) {
    throw new RangeError('Main dome center must be safely inside the mapped footprint');
  }
  const mainRadius = Math.min(12, clearance(mainCenter, polygon) * .7);
  const components = [], parts = [];
  const addRaw = geometry => {
    if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    parts.push(geometry);
  };
  const add = (geometry, color) => {
    if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
    tintGeometry(geometry, color);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    parts.push(geometry);
  };
  const cylinder = (x, z, rTop, rBot, bottom, height, color, sides = 16, openEnded = false) =>
    add(new THREE.CylinderGeometry(rTop, rBot, height, sides, 1, openEnded).translate(x, bottom + height / 2, z), color);

  /** Lean architectural prism in local coords; omits buried back (z0) or bottom (y0) faces. */
  const makeSlab = (x0, x1, y0, y1, z0, z1, colorHex, { back = false, bottom = true, top = true } = {}) => {
    const pos = [], norm = [], col = [];
    const c = new THREE.Color(colorHex);
    // Front (+Z)
    pushColoredQuad(pos, norm, col, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
    // Back (-Z)
    if (back) pushColoredQuad(pos, norm, col, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c);
    // Left (-X) & Right (+X)
    pushColoredQuad(pos, norm, col, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c);
    pushColoredQuad(pos, norm, col, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c);
    // Top (+Y) & Bottom (-Y)
    if (top) pushColoredQuad(pos, norm, col, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c);
    if (bottom) pushColoredQuad(pos, norm, col, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c);
    return buildCustomGeometry(pos, norm, col);
  };

  const addFinial = (x, z, domeTop, finialHeight, domeRadius, includeCrescent) => {
    if (finialHeight <= 0) return;
    const baseR = Math.min(.42, domeRadius * .09);
    // Tiered gold collar base
    cylinder(x, z, baseR * .72, baseR, domeTop - .04, Math.min(.14, finialHeight * .12), PALETTE.goldDark, 8, false);
    // Slender vertical mast
    const mastH = finialHeight * (includeCrescent ? .78 : 1);
    const mastR = Math.min(.06, Math.max(.025, domeRadius * .012));
    cylinder(x, z, mastR * .65, mastR * 1.15, domeTop, mastH, PALETTE.goldMid, 6, true);
    // Stacked kalasha spheres
    const s1 = Math.min(.24, Math.max(.08, domeRadius * .042));
    const s2 = s1 * .74;
    const s3 = s1 * .52;
    if (includeCrescent) {
      add(new THREE.SphereGeometry(s1, 8, 5).translate(x, domeTop + finialHeight * .22, z), PALETTE.goldBright);
      add(new THREE.SphereGeometry(s2, 6, 4).translate(x, domeTop + finialHeight * .46, z), PALETTE.goldMid);
      add(new THREE.SphereGeometry(s3, 6, 4).translate(x, domeTop + finialHeight * .65, z), PALETTE.goldBright);
      addRaw(makeCrescentCrown(x, z, domeTop + finialHeight * .68, domeTop + finialHeight, Math.min(.36, finialHeight * .28)));
    } else {
      add(new THREE.SphereGeometry(s1, 6, 4).translate(x, domeTop + finialHeight * .28, z), PALETTE.goldBright);
      add(new THREE.ConeGeometry(Math.min(.11, domeRadius * .055), finialHeight * .46, 6)
        .translate(x, domeTop + finialHeight * .77, z), PALETTE.goldBright);
    }
  };

  // 1. SCULPTED MAIN CENTRAL DOME & OCTAGONAL CLERESTORY DRUM
  const remaining = mainDomeTopMeters - baseHeight;
  const mainDrum = Math.min(4.3, remaining * .27);
  const collarH = Math.min(.44, remaining * .035);
  const mainFinial = Math.min(1.45, Math.max(.75, remaining * .088));
  const mainRise = remaining - mainDrum - collarH - mainFinial;
  const [mx, mz] = mainCenter;
  const mainOuterRadius = mainRadius * 1.065;

  // Octagonal lower plinth, shaft, shadow reveal, and projecting stepped upper cornice
  const plinthH = mainDrum * .15;
  const corniceH = Math.min(.18, mainDrum * .07);
  const soffitH = Math.min(.11, mainDrum * .045);
  cylinder(mx, mz, mainRadius * 1.045, mainRadius * 1.055, baseHeight, plinthH, PALETTE.plinth, 8, false);
  cylinder(mx, mz, mainRadius * .99, mainRadius * .99, baseHeight + plinthH, mainDrum - plinthH - soffitH - corniceH, PALETTE.drumWall, 8, true);
  cylinder(mx, mz, mainRadius * 1.03, mainRadius * 1.00, baseHeight + mainDrum - soffitH - corniceH, soffitH, PALETTE.shadowSoffit, 8, true);
  cylinder(mx, mz, mainOuterRadius, mainRadius * 1.045, baseHeight + mainDrum - corniceH, corniceH, PALETTE.cornice, 8, false);

  // Octagonal drum clerestory pointed-arch windows + decorative scalloped frieze
  const drumFaceR = mainRadius * .99 * Math.cos(Math.PI / 8);
  const winW = mainRadius * .42, winH = (mainDrum - plinthH - soffitH - corniceH) * .78;
  const winBaseY = baseHeight + plinthH + (mainDrum - plinthH - soffitH - corniceH) * .11;
  for (let i = 0; i < 8; i++) {
    const angle = (i + .5) * Math.PI / 4;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const mat = new THREE.Matrix4().set(
      cos, 0, sin, mx + sin * (drumFaceR + .01),
      0, 1, 0, winBaseY,
      -sin, 0, cos, mz + cos * (drumFaceR + .01),
      0, 0, 0, 1
    );
    const archFrame = makePointedArchFrame(winW, winH, Math.min(.18, winW * .11), .14, false, 3);
    archFrame.applyMatrix4(mat); addRaw(archFrame);
    const archGlass = makePointedArchGlazing(winW, winH, Math.min(.18, winW * .11), 2, PALETTE.drumGlazing, .025);
    archGlass.applyMatrix4(mat); addRaw(archGlass);
    // Projecting clerestory sill ledge
    const sill = makeSlab(-winW / 2 - .12, winW / 2 + .12, -.09, 0, 0, .18, PALETTE.cornice);
    sill.applyMatrix4(mat); addRaw(sill);

    // Decorative scalloped merlon frieze along each octagonal face above cornice
    const faceWidth = 2 * mainRadius * 1.01 * Math.sin(Math.PI / 8);
    const merlonCount = 2, mStep = faceWidth / (merlonCount + .4);
    const merlonY = baseHeight + mainDrum;
    for (let m = 0; m < merlonCount; m++) {
      const u = (m - (merlonCount - 1) / 2) * mStep;
      const fx = mx + sin * (drumFaceR + .12) + cos * u;
      const fz = mz + cos * (drumFaceR + .12) - sin * u;
      const fMat = new THREE.Matrix4().set(cos, 0, sin, fx, 0, 1, 0, merlonY, -sin, 0, cos, fz, 0, 0, 0, 1);
      const lowMerlon = makeSlab(-mStep * .26, mStep * .26, 0, .16, -.08, .08, PALETTE.cornice, { back: true, bottom: false });
      lowMerlon.applyMatrix4(fMat); addRaw(lowMerlon);
      const topMerlon = makeSlab(-mStep * .14, mStep * .14, .16, .30, -.07, .07, PALETTE.merlon, { back: true, bottom: false });
      topMerlon.applyMatrix4(fMat); addRaw(topMerlon);
    }
  }

  // Tiered circular transition collar molding beneath dome
  cylinder(mx, mz, mainRadius * .96, mainRadius * .985, baseHeight + mainDrum, collarH * .65, PALETTE.drumWall, 18, true);
  cylinder(mx, mz, mainRadius * .93, mainRadius * .95, baseHeight + mainDrum + collarH * .65, collarH * .35, PALETTE.shadowSoffit, 18, true);

  // Refined Islamic pointed main dome shell + vertical ribs + lotus apex collar + golden finial
  const mainDomeBaseY = baseHeight + mainDrum + collarH;
  const mainProfile = islamicDomeProfile(mainRadius, mainRise, 12);
  add(new THREE.LatheGeometry(mainProfile, 22).translate(mx, mainDomeBaseY, mz), PALETTE.domeShell);
  addRaw(makeDomeRibs(mainProfile, 16, Math.min(.14, mainRadius * .022), .055, PALETTE.domeRib)
    .translate(mx, mainDomeBaseY, mz));
  // Subtle raised lotus petal apex cap covering top ~16% of main dome
  const capProfile = mainProfile.slice(10).map((p, idx, arr) =>
    new THREE.Vector2(idx === arr.length - 1 ? 0 : p.x + .035, p.y));
  add(new THREE.LatheGeometry(capProfile, 14).translate(mx, mainDomeBaseY, mz), PALETTE.merlon);
  addFinial(mx, mz, mainDomeBaseY + mainRise, mainFinial, mainRadius, true);
  components.push({ kind: 'main-dome', center: [...mainCenter], radius: mainOuterRadius, bottom: baseHeight, top: mainDomeTopMeters });

  // 2. UPGRADED SECONDARY DOME (stepped circular drum, cornice collar, pointed dome, finial)
  const freePoints = points.filter(p => p.room > 3.2 &&
    Math.hypot(p.center[0] - mainCenter[0], p.center[1] - mainCenter[1]) > mainOuterRadius + Math.min(6, p.room * .6) * 1.12 + 1);
  const secondary = freePoints.sort((a, b) => b.room - a.room || a.center[1] - b.center[1])[0];
  if (secondary) {
    const secRadius = Math.min(6, secondary.room * .6), [sx, sz] = secondary.center;
    const secPlinthR = secRadius * 1.12;
    const secScale = Math.min(1, (remaining - .3) / (secRadius * .46 + 1.9));
    const secPlinthH = .62 * secScale, secDrumH = .48 * secScale;
    const secRise = secRadius * .42 * secScale, secFinial = .72 * secScale;
    cylinder(sx, sz, secPlinthR, secPlinthR, baseHeight, secPlinthH * .58, PALETTE.plinth, 14, false);
    cylinder(sx, sz, secRadius * 1.05, secRadius * 1.06, baseHeight + secPlinthH * .58, secPlinthH * .42, PALETTE.drumWall, 14, false);
    cylinder(sx, sz, secRadius * .99, secRadius * .99, baseHeight + secPlinthH, secDrumH, PALETTE.drumWall, 14, true);
    cylinder(sx, sz, secRadius * 1.045, secRadius * 1.01, baseHeight + secPlinthH + secDrumH - .14 * secScale, .14 * secScale, PALETTE.cornice, 14, false);
    const secBaseY = baseHeight + secPlinthH + secDrumH;
    const secProfile = islamicDomeProfile(secRadius, secRise, 7);
    add(new THREE.LatheGeometry(secProfile, 14).translate(sx, secBaseY, sz), PALETTE.domeShell);
    addFinial(sx, sz, secBaseY + secRise, secFinial, secRadius, false);
    components.push({
      kind: 'secondary-dome', center: [...secondary.center], radius: secPlinthR,
      bottom: baseHeight, top: secBaseY + secRise + secFinial,
    });
  }

  // 3. FOUR REFINED CORNER ROOF CUPOLAS (distinct from planned 150-foot minarets)
  for (let i = 0; i < 4; i++) {
    const usable = points.filter(p => p.room > 1.8 && components.every(c =>
      Math.hypot(p.center[0] - c.center[0], p.center[1] - c.center[1]) > c.radius + 2));
    const point = usable.sort((a, b) => {
      const score = p => Math.min(...components.map(c => Math.hypot(p.center[0] - c.center[0], p.center[1] - c.center[1]) - c.radius));
      return score(b) - score(a);
    })[0];
    if (!point) break;
    const scale = Math.min(1, (remaining - .25) / 4.45);
    const [cx, cz] = point.center;
    const cupR = 1.30, cupCorniceR = 1.44;
    const cupPlinthH = .24 * scale, cupDrumH = 1.98 * scale, cupRise = 1.56 * scale, cupFinial = .58 * scale;
    cylinder(cx, cz, 1.40, 1.42, baseHeight, cupPlinthH, PALETTE.plinth, 8, false);
    cylinder(cx, cz, cupR, cupR, baseHeight + cupPlinthH, cupDrumH - .16 * scale, PALETTE.drumWall, 8, true);
    cylinder(cx, cz, 1.38, 1.32, baseHeight + cupPlinthH + cupDrumH - .16 * scale, .07 * scale, PALETTE.shadowSoffit, 8, true);
    cylinder(cx, cz, cupCorniceR, 1.40, baseHeight + cupPlinthH + cupDrumH - .09 * scale, .12 * scale, PALETTE.cornice, 8, false);
    // 8 crisp pointed-arch openings around each octagonal cupola drum (lean 3-tri pointed arch)
    const cupFaceR = cupR * Math.cos(Math.PI / 8) + .018;
    const cupNicheH = cupDrumH * .64, cupSpring = cupNicheH * .58;
    const cCupGlass = new THREE.Color(PALETTE.drumGlazing);
    for (let f = 0; f < 8; f++) {
      const angle = (f + .5) * Math.PI / 4, sin = Math.sin(angle), cos = Math.cos(angle);
      const mat = new THREE.Matrix4().set(
        cos, 0, sin, cx + sin * cupFaceR, 0, 1, 0, baseHeight + cupPlinthH + .16 * scale,
        -sin, 0, cos, cz + cos * cupFaceR, 0, 0, 0, 1
      );
      const np = [], nn = [], nc = [];
      pushColoredQuad(np, nn, nc, [-.32, 0, 0], [.32, 0, 0], [.32, cupSpring, 0], [-.32, cupSpring, 0], [0, 0, 1], cCupGlass);
      pushColoredTri(np, nn, nc, [-.32, cupSpring, 0], [.32, cupSpring, 0], [0, cupNicheH, 0], [0, 0, 1], cCupGlass);
      const niche = buildCustomGeometry(np, nn, nc);
      niche.applyMatrix4(mat); addRaw(niche);
    }
    const cupDomeY = baseHeight + cupPlinthH + cupDrumH + .03 * scale;
    const cupProfile = islamicDomeProfile(cupR * .96, cupRise, 5);
    add(new THREE.LatheGeometry(cupProfile, 10).translate(cx, cupDomeY, cz), PALETTE.domeShell);
    addFinial(cx, cz, cupDomeY + cupRise, cupFinial, cupR, false);
    components.push({
      kind: 'roof-cupola', center: [...point.center], radius: cupCorniceR,
      bottom: baseHeight, top: cupDomeY + cupRise + cupFinial,
    });
  }

  // 4. DEEP 3D MULTI-STOREY POINTED-ARCH FACADE COLONNADES, PILASTERS, CORNICES & PARAPET
  let archCount = 0;
  if (options.includeFacadeArches !== false) {
    const levels = Math.max(1, Math.round(baseHeight / 3.2));
    const levelH = baseHeight / levels;
    const archDepth = .22;
    const parapetH = Math.min(.54, remaining * .14);
    const merlonH = Math.min(.36, remaining * .09);
    const outerEdges = wallEdges(polygon).filter(e => !e.ringIndex && e.length > 4);

    for (const edge of outerEdges) {
      const bays = Math.max(1, Math.floor(edge.length / 4.8)), spacing = edge.length / bays;
      // Multi-storey pointed arch bays
      for (let row = 0; row < levels; row++) {
        const isGround = row === 0;
        const archH = levelH * (isGround ? .88 : .83);
        const archW = Math.min(spacing * .72, archH * .82);
        const thickness = Math.min(.19, archW * .11);
        const baseY = row * levelH + (isGround ? 0 : .15);
        for (let bay = 0; bay < bays; bay++) {
          const d = (bay + .5) * spacing;
          const matrix = edgeMatrix(edge, d, baseY, .025);
          const frame = makePointedArchFrame(archW, archH, thickness, archDepth, isGround, row === 0 ? 3 : 2);
          frame.applyMatrix4(matrix); addRaw(frame);
          archCount++;
          // Upper storeys carry recessed cool-tinted glazing + mullions; ground floor remains 100% open.
          if (!isGround) {
            const glass = makePointedArchGlazing(archW, archH, thickness, 2, PALETTE.glazing, .03);
            glass.applyMatrix4(matrix); addRaw(glass);
          }
        }
      }

      // Slender twin vertical pilasters between bays (lean back-culled architectural prisms)
      for (let b = 0; b <= bays; b++) {
        const rawD = b * spacing;
        const d = b === 0 ? Math.min(.24, spacing * .12) : b === bays ? edge.length - Math.min(.24, spacing * .12) : rawD;
        const pMat = edgeMatrix(edge, d, 0, .025);
        for (const sx of [-.095, .095]) {
          const shaft = makeSlab(sx - .048, sx + .048, .44, baseHeight - .18, 0, .21, PALETTE.archFront, { bottom: false, top: false });
          shaft.applyMatrix4(pMat); addRaw(shaft);
        }
        const base = makeSlab(-.17, .17, 0, .46, 0, .26, PALETTE.plinth, { bottom: false });
        base.applyMatrix4(pMat); addRaw(base);
        const cap = makeSlab(-.18, .18, baseHeight - .18, baseHeight, 0, .28, PALETTE.cornice, { top: false });
        cap.applyMatrix4(pMat); addRaw(cap);
      }

      // Horizontal floor-band cornices with shadow undersides (strictly at floor boundaries >= levelH)
      for (let row = 1; row <= levels; row++) {
        const y = row * levelH;
        const isRoof = row === levels;
        const bandDepth = isRoof ? .30 : .24;
        const bandH = isRoof ? .16 : .12;
        const soffitBandH = .07;
        const halfL = edge.length / 2 + .05;
        const cMat = edgeMatrix(edge, edge.length / 2, y, .01);
        const soffit = makeSlab(-halfL, halfL, -soffitBandH, 0, 0, bandDepth * .82, PALETTE.shadowSoffit, { top: false });
        soffit.applyMatrix4(cMat); addRaw(soffit);
        const ledge = makeSlab(-halfL - .02, halfL + .02, 0, bandH, 0, bandDepth, PALETTE.cornice);
        ledge.applyMatrix4(cMat); addRaw(ledge);
      }

      // Crisp rooftop parapet band + rhythmic Islamic stepped crenellations/merlons
      const halfEdge = edge.length / 2 + .02;
      const paraMat = edgeMatrix(edge, edge.length / 2, baseHeight, 0);
      const paraWall = makeSlab(-halfEdge, halfEdge, 0, parapetH, -.18, .06, PALETTE.parapet, { back: true, bottom: false, top: false });
      paraWall.applyMatrix4(paraMat); addRaw(paraWall);
      const paraCap = makeSlab(-halfEdge - .03, halfEdge + .03, parapetH, parapetH + .09, -.20, .10, PALETTE.cornice, { back: true });
      paraCap.applyMatrix4(paraMat); addRaw(paraCap);

      const merlonCount = Math.max(2, Math.floor(edge.length / 4.2));
      const mSpacing = edge.length / merlonCount;
      for (let m = 0; m < merlonCount; m++) {
        const d = (m + .5) * mSpacing;
        const mMat = edgeMatrix(edge, d, baseHeight + parapetH + .09, -.05);
        const hw1 = Math.min(.48, mSpacing * .22);
        const hw2 = hw1 * .52;
        const step1 = makeSlab(-hw1, hw1, 0, merlonH * .55, -.10, .10, PALETTE.parapet, { back: true, bottom: false });
        step1.applyMatrix4(mMat); addRaw(step1);
        const step2 = makeSlab(-hw2, hw2, merlonH * .55, merlonH, -.09, .09, PALETTE.merlon, { back: true, bottom: false });
        step2.applyMatrix4(mMat); addRaw(step2);
      }
    }
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error('Could not merge Central Mosque geometry');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .72, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'central-mosque-domes-and-arches'; mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'central-mosque-landmark'; group.add(mesh);
  const diagnostics = {
    osmType: 'way', osmId: CENTRAL_MOSQUE_ID, baseHeight, mainDomeTopMeters,
    heightStatus: 'reported-ambiguous-datum', physicalDatum: 'provisional ground-to-finial interpretation',
    layoutStatus: requested ? 'caller-supplied-main-center' : 'illustrative-contained-roof-layout',
    components, archCount, drawCalls: 1, collisionObjects: 0, plannedMinarets: 0,
    sourceUrls: [...REFERENCES], observedAt: '2021-04',
  };
  group.userData.centralMosque = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
