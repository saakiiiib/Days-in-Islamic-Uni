import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { buildingGeometry, ringArea } from '../geometry.js';
import { wallEdges, tintGeometry } from '../facades.js';

export const CENTRAL_LIBRARY_ID = '532464097';
const REFERENCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Central_library_of_IU.jpg',
  'https://iu.ac.bd/index.php/pages/view_1/Nzc=',
]);

const PALETTE = Object.freeze({
  ochreMain: 0xdbb23b,
  ochreShade: 0xc89d2f,
  ochreDeep: 0xb18723,
  concreteLight: 0xebe6d8,
  concreteCap: 0xf2eee2,
  concreteMid: 0xd9d3c3,
  concreteShadow: 0xc2bba9,
  plinth: 0x8e8a7d,
  steelGlass: 0x263236,
  steelMullion: 0x1a2326,
});

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

function makeSlab(x0, x1, y0, y1, z0, z1, colorHex, { back = false, bottom = true, top = true } = {}) {
  const pos = [], norm = [], col = [];
  const c = new THREE.Color(colorHex);
  pushColoredQuad(pos, norm, col, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
  if (back) pushColoredQuad(pos, norm, col, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c);
  pushColoredQuad(pos, norm, col, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c);
  pushColoredQuad(pos, norm, col, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c);
  if (top) pushColoredQuad(pos, norm, col, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c);
  if (bottom) pushColoredQuad(pos, norm, col, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c);
  return buildCustomGeometry(pos, norm, col);
}

/** Builds a clean angled 3D concrete strut connecting point A to point B with rectangular cross-section. */
function makeStrut(a, b, halfW, halfD, colorHex) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 1e-4) return null;
  dir.divideScalar(len);
  const ref = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(ref, dir).normalize().multiplyScalar(halfW);
  const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(halfD);

  const corner = (base, su, sv) => [
    base.x + u.x * su + v.x * sv,
    base.y + u.y * su + v.y * sv,
    base.z + u.z * su + v.z * sv,
  ];
  const a0 = corner(start, -1, -1), a1 = corner(start, 1, -1), a2 = corner(start, 1, 1), a3 = corner(start, -1, 1);
  const b0 = corner(end, -1, -1), b1 = corner(end, 1, -1), b2 = corner(end, 1, 1), b3 = corner(end, -1, 1);

  const pos = [], norm = [], col = [];
  const c = new THREE.Color(colorHex);
  const nu = u.clone().normalize().toArray(), nv = v.clone().normalize().toArray();
  const nNegU = nu.map(x => -x), nNegV = nv.map(x => -x);
  pushColoredQuad(pos, norm, col, a0, a1, b1, b0, nNegV, c);
  pushColoredQuad(pos, norm, col, a2, a3, b3, b2, nv, c);
  pushColoredQuad(pos, norm, col, a1, a2, b2, b1, nu, c);
  pushColoredQuad(pos, norm, col, a3, a0, b0, b3, nNegU, c);
  return buildCustomGeometry(pos, norm, col);
}

/**
 * Sculpted white Y-shaped / forked structural column capital supporting the
 * deep cantilevered roof overhang slab — signature of IU Central Library.
 */
function makeForkedColumn(height, overhang) {
  const parts = [];
  const forkY = Math.max(2.6, height - 1.55);
  const topY = height - .02;
  const shaftZ = .30;
  // Grounded plinth pedestal & vertical white concrete shaft
  parts.push(makeSlab(-.21, .21, 0, .50, 0, shaftZ + .08, PALETTE.concreteMid, { bottom: false }));
  parts.push(makeSlab(-.15, .15, .50, forkY, 0, shaftZ, PALETTE.concreteLight, { bottom: false, top: false }));
  // Fork collar ring
  parts.push(makeSlab(-.19, .19, forkY - .08, forkY + .08, 0, shaftZ + .05, PALETTE.concreteMid));
  // Symmetrical forked Y-arms flaring laterally and outward under the roof overhang
  const armSpread = Math.min(.72, Math.max(.42, overhang * .72));
  const armOutZ = Math.max(shaftZ + .12, overhang - .12);
  for (const side of [-1, 1]) {
    const strut = makeStrut(
      [side * .05, forkY, shaftZ * .62],
      [side * armSpread, topY, armOutZ],
      .105, .105, PALETTE.concreteLight
    );
    if (strut) parts.push(strut);
    // Crisp white capital pad seated directly against roof soffit
    parts.push(makeSlab(side * armSpread - .14, side * armSpread + .14, topY - .12, topY, armOutZ - .14, armOutZ + .12, PALETTE.concreteCap, { back: true }));
  }
  // Forward-cantilevered central bracket rib supporting the deep overhang
  const frontRib = makeStrut(
    [0, forkY + .04, shaftZ * .7],
    [0, topY, Math.max(shaftZ + .16, overhang - .08)],
    .085, .11, PALETTE.concreteMid
  );
  if (frontRib) parts.push(frontRib);

  const merged = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return merged;
}

function roundArchOutline(halfW, height, segments) {
  const crownRise = Math.min(halfW * .95, height * .26);
  const spring = height - crownRise;
  const pts = [[-halfW, 0], [-halfW, spring]];
  for (let i = 1; i < segments; i++) {
    const angle = Math.PI - (i / segments) * Math.PI;
    pts.push([Math.cos(angle) * halfW, spring + Math.sin(angle) * crownRise]);
  }
  pts.push([halfW, spring], [halfW, 0]);
  return pts;
}

/**
 * Monumental tall arched recess with crisp white concrete outer arch surround,
 * shaded golden-ochre inner casing, and tall dark steel-grille window grid.
 */
function makeMonumentalArch(width, height, depth = .30, segments = 10) {
  const pos = [], norm = [], col = [];
  const cWhite = new THREE.Color(PALETTE.concreteLight);
  const cSide = new THREE.Color(PALETTE.concreteCap);
  const cReveal = new THREE.Color(PALETTE.concreteMid);
  const cOchre = new THREE.Color(PALETTE.ochreShade);
  const cGlass = new THREE.Color(PALETTE.steelGlass);
  const cSteel = new THREE.Color(PALETTE.steelMullion);

  const thick = Math.min(.28, width * .11);
  const outer = roundArchOutline(width / 2, height, segments);
  const inner = roundArchOutline(Math.max(.35, width / 2 - thick), Math.max(.8, height - thick), segments);

  // Outer crisp white concrete arch frame
  for (let i = 0; i < outer.length - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], depth], [o1[0], o1[1], depth], [i1[0], i1[1], depth], [i0[0], i0[1], depth],
      [0, 0, 1], cWhite);
    const odx = o1[0] - o0[0], ody = o1[1] - o0[1], olen = Math.hypot(odx, ody) || 1;
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], 0], [o1[0], o1[1], 0], [o1[0], o1[1], depth], [o0[0], o0[1], depth],
      [-ody / olen, odx / olen, 0], cSide);
    const idx = i1[0] - i0[0], idy = i1[1] - i0[1], ilen = Math.hypot(idx, idy) || 1;
    pushColoredQuad(pos, norm, col,
      [i0[0], i0[1], depth], [i1[0], i1[1], depth], [i1[0], i1[1], 0], [i0[0], i0[1], 0],
      [idy / ilen, -idx / ilen, 0], cReveal);
  }

  // Stepped golden-ochre inner arch recess surround & recessed dark steel-grille arched window
  const innerW = Math.max(.32, width / 2 - thick);
  const innerH = Math.max(.75, height - thick);
  const glassW = Math.max(.24, innerW - .14);
  const glassH = Math.max(.65, innerH - .14);
  const ochreStep = roundArchOutline(glassW, glassH, segments);
  const stepZ = depth * .42;
  for (let i = 0; i < inner.length - 1; i++) {
    const o0 = inner[i], o1 = inner[i + 1], i0 = ochreStep[i], i1 = ochreStep[i + 1];
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], stepZ], [o1[0], o1[1], stepZ], [i1[0], i1[1], stepZ], [i0[0], i0[1], stepZ],
      [0, 0, 1], cOchre);
  }

  // Recessed golden-ochre lower dado & dark steel-grille glazing above
  const dadoH = Math.min(.92, glassH * .14);
  pushColoredQuad(pos, norm, col,
    [-glassW, 0, .05], [glassW, 0, .05], [glassW, dadoH, .05], [-glassW, dadoH, .05],
    [0, 0, 1], cOchre);
  const glassTopOutline = roundArchOutline(glassW, glassH, segments);
  const gCenter = [0, dadoH + (glassH - dadoH) * .45, .045];
  for (let i = 0; i < glassTopOutline.length - 1; i++) {
    const p0 = [glassTopOutline[i][0], Math.max(dadoH, glassTopOutline[i][1]), .045];
    const p1 = [glassTopOutline[i + 1][0], Math.max(dadoH, glassTopOutline[i + 1][1]), .045];
    if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1e-4) {
      pushColoredTri(pos, norm, col, gCenter, p0, p1, [0, 0, 1], cGlass);
    }
  }
  pushColoredTri(pos, norm, col, gCenter, [glassW, dadoH, .045], [-glassW, dadoH, .045], [0, 0, 1], cGlass);

  // Dark steel-grille vertical & horizontal mullion grid inside the tall arch
  const crownRise = Math.min(glassW * .95, glassH * .26);
  const springY = glassH - crownRise;
  const bar = .045, mz = .078;
  for (const frac of [-.5, 0, .5]) {
    const x = glassW * frac;
    const dx = Math.min(.99, Math.abs(x) / glassW);
    const maxY = springY + Math.sqrt(Math.max(0, 1 - dx * dx)) * crownRise - .03;
    pushColoredQuad(pos, norm, col,
      [x - bar / 2, dadoH, mz], [x + bar / 2, dadoH, mz], [x + bar / 2, maxY, mz], [x - bar / 2, maxY, mz],
      [0, 0, 1], cSteel);
  }
  const hBands = Math.max(2, Math.floor((springY - dadoH) / 1.55));
  for (let b = 1; b <= hBands; b++) {
    const y = dadoH + (springY - dadoH) * b / hBands;
    pushColoredQuad(pos, norm, col,
      [-glassW, y - bar / 2, mz], [glassW, y - bar / 2, mz], [glassW, y + bar / 2, mz], [-glassW, y + bar / 2, mz],
      [0, 0, 1], cSteel);
  }
  return buildCustomGeometry(pos, norm, col);
}

/** Framed dark steel-grille window bay with recessed glazing and steel muntin grid. */
function makeSteelGrilleWindow(width, height) {
  const pos = [], norm = [], col = [];
  const cFrame = new THREE.Color(PALETTE.concreteLight);
  const cSill = new THREE.Color(PALETTE.concreteCap);
  const cReveal = new THREE.Color(PALETTE.concreteShadow);
  const cGlass = new THREE.Color(PALETTE.steelGlass);
  const cSteel = new THREE.Color(PALETTE.steelMullion);

  const hw = width / 2, hh = height / 2;
  const ft = .10, fd = .15;
  // Concrete window frame surround (top lintel, bottom sill, left & right jambs)
  const addBar = (x0, x1, y0, y1, z0, z1, color) => {
    pushColoredQuad(pos, norm, col, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color);
    pushColoredQuad(pos, norm, col, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color);
    pushColoredQuad(pos, norm, col, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], cReveal);
    pushColoredQuad(pos, norm, col, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], cReveal);
    pushColoredQuad(pos, norm, col, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], cReveal);
  };
  addBar(-hw - .08, hw + .08, hh, hh + ft + .03, 0, fd + .05, cFrame);
  addBar(-hw - .08, hw + .08, -hh - ft, -hh, 0, fd + .04, cSill);
  addBar(-hw - ft, -hw, -hh, hh, 0, fd, cFrame);
  addBar(hw, hw + ft, -hh, hh, 0, fd, cFrame);

  // Dark recessed library glazing
  pushColoredQuad(pos, norm, col, [-hw, -hh, .032], [hw, -hh, .032], [hw, hh, .032], [-hw, hh, .032], [0, 0, 1], cGlass);

  // Dark steel-grille grid (3 vertical + 2 horizontal bars)
  const bar = .038, mz = .062;
  const vCols = Math.max(2, Math.min(4, Math.round(width / .85)));
  for (let i = 1; i < vCols; i++) {
    const x = -hw + width * i / vCols;
    pushColoredQuad(pos, norm, col, [x - bar / 2, -hh, mz], [x + bar / 2, -hh, mz], [x + bar / 2, hh, mz], [x - bar / 2, hh, mz], [0, 0, 1], cSteel);
  }
  for (const frac of [-.18, .26]) {
    const y = height * frac;
    pushColoredQuad(pos, norm, col, [-hw, y - bar / 2, mz], [hw, y - bar / 2, mz], [hw, y + bar / 2, mz], [-hw, y + bar / 2, mz], [0, 0, 1], cSteel);
  }
  return buildCustomGeometry(pos, norm, col);
}

/** Outward mitered offset of a closed outer ring for the cantilevered flat roof overhang. */
function offsetOuterRing(ring, distance) {
  const n = ring.length - 1;
  if (n < 3) return ring;
  const outward = Math.sign(ringArea(ring)) || 1;
  const normals = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    normals.push([(dz / len) * outward, (-dx / len) * outward]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const n0 = normals[(i - 1 + n) % n], n1 = normals[i];
    const dot = n0[0] * n1[0] + n0[1] * n1[1];
    const denom = Math.max(.35, 1 + dot);
    let ox = (n0[0] + n1[0]) * (distance / denom);
    let oz = (n0[1] + n1[1]) * (distance / denom);
    const miterLen = Math.hypot(ox, oz);
    const maxMiter = distance * 1.48;
    if (miterLen > maxMiter) {
      ox *= maxMiter / miterLen;
      oz *= maxMiter / miterLen;
    }
    out.push([ring[i][0] + ox, ring[i][1] + oz]);
  }
  out.push([out[0][0], out[0][1]]);
  return out;
}

function splitIntervals(length, blocked, margin = 0) {
  let spans = [[margin, length - margin]];
  for (const [lo, hi] of blocked) {
    spans = spans.flatMap(([a, b]) => {
      if (hi <= a || lo >= b) return [[a, b]];
      return [[a, Math.min(lo, b)], [Math.max(hi, a), b]].filter(([x, y]) => y - x > .2);
    });
  }
  return spans.filter(([x, y]) => y - x > .2);
}

function anchorInside(polygon) {
  const xs = polygon[0].map(p => p[0]), zs = polygon[0].map(p => p[1]);
  const minX = Math.min(...xs), minZ = Math.min(...zs), width = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
  let best = null;
  for (let ix = 1; ix < 25; ix++) for (let iz = 1; iz < 25; iz++) {
    const point = [minX + width * ix / 25, minZ + depth * iz / 25];
    if (!pointInPolygon(point, polygon)) continue;
    const room = Math.min(...polygon.flatMap(ring => ring.slice(1).map((p, i) => pointToSegmentDistance(point, ring[i], p))));
    if (!best || room > best.room) best = { point, room };
  }
  return best;
}

/**
 * Visual augmentation for King Fahad Bin Abdul Aziz Central Library (way/532464097).
 * Caller retains the mapped source body and all collision triangles.
 */
export function buildCentralLibrary(building, options = {}) {
  if (String(building?.id) !== CENTRAL_LIBRARY_ID || (building.osmType && building.osmType !== 'way')) {
    throw new TypeError('Central Library model requires OSM way 532464097');
  }
  const polygon = building.polygons?.[0];
  if (building.polygons?.length !== 1 || !polygon?.[0]?.length || polygon.some(ring => ring.length < 4 ||
    ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
    ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
    throw new TypeError('Central Library requires one finite closed mapped polygon');
  }
  const height = options.baseHeight ?? building.height ?? 9.6;
  const overhang = options.roofOverhang ?? .95;
  if (!Number.isFinite(height) || height < 4 || height > 40 || !Number.isFinite(overhang) || overhang < .25 || overhang > 1.5) {
    throw new RangeError('Central Library height and roof overhang must be finite and within visual augmentation limits');
  }
  const allEdges = wallEdges(polygon);
  const outerEdges = allEdges.filter(e => !e.ringIndex && e.length >= 3);
  if (!outerEdges.length) throw new RangeError('Central Library has no usable outer facade');

  const samePoint = (a, b) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const requested = options.entrances;
  if (requested !== undefined && (!Array.isArray(requested) || !requested.length)) {
    throw new TypeError('Entrances must be a nonempty array');
  }
  const entryInputs = requested ?? [{ edge: [...outerEdges].sort((a, b) => b.length - a.length)[0], source: 'illustrative-longest-edge' }];
  const entries = entryInputs.map(entry => {
    const edge = outerEdges.find(e => samePoint(e.a, entry.edge?.a) && samePoint(e.b, entry.edge?.b));
    const distance = entry.distance ?? edge?.length / 2;
    if (!edge || !Number.isFinite(distance) || distance < 1 || distance > edge.length - 1) {
      throw new RangeError('Entrance must lie away from a corner on a mapped outer edge');
    }
    return { edge, distance, source: entry.source ?? 'caller-supplied-unverified' };
  });

  const parts = [];
  const addRaw = geometry => {
    if (!geometry) return;
    if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    parts.push(geometry);
  };
  const add = (geometry, color) => {
    if (!geometry) return;
    if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
    tintGeometry(geometry, color);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    parts.push(geometry);
  };
  const onEdge = (geometry, edge, d, y, outward, color = null) => {
    if (!geometry) return;
    geometry.applyMatrix4(edgeMatrix(edge, d, y, outward));
    if (color === null) addRaw(geometry);
    else add(geometry, color);
  };

  // 1. SIGNATURE DEEP CANTILEVERED FLAT ROOF OVERHANG SLAB (0.95m overhang around outer perimeter)
  const overhangOuter = offsetOuterRing(polygon[0], overhang);
  const overhangPolygon = [overhangOuter, ...polygon.slice(1)];
  const soffitThickness = .08, slabThickness = .38;
  const soffitSlab = buildingGeometry(overhangPolygon, soffitThickness);
  soffitSlab.translate(0, height - soffitThickness, 0);
  add(soffitSlab, PALETTE.concreteShadow);

  const roofSlab = buildingGeometry(overhangPolygon, slabThickness);
  roofSlab.translate(0, height, 0);
  add(roofSlab, PALETTE.concreteLight);

  // Subtle top lip fascia molding framing the cantilevered roof edge
  const overhangEdges = wallEdges(overhangPolygon).filter(e => !e.ringIndex && e.length > .5);
  for (const oe of overhangEdges) {
    const lip = makeSlab(-oe.length / 2, oe.length / 2, height + slabThickness - .07, height + slabThickness + .04, -.04, .04, PALETTE.concreteCap, { back: true });
    onEdge(lip, oe, oe.length / 2, 0, 0);
  }

  // 2. ROOF PARAPET WALL + MODEST CENTRAL SKYLIGHT / STAIR MONITOR
  const parapetBaseY = height + slabThickness;
  const parapetH = .62;
  for (const edge of allEdges) {
    if (edge.length < .6) continue;
    const halfL = edge.length / 2;
    const pWall = makeSlab(-halfL, halfL, 0, parapetH, -.24, .01, PALETTE.concreteMid, { back: true, bottom: false, top: false });
    onEdge(pWall, edge, halfL, parapetBaseY, 0);
    const pCap = makeSlab(-halfL - .02, halfL + .02, parapetH, parapetH + .08, -.28, .05, PALETTE.concreteCap, { back: true });
    onEdge(pCap, edge, halfL, parapetBaseY, 0);
  }

  const anchor = anchorInside(polygon);
  let monitorPolygons = [];
  let roofRise = slabThickness + parapetH + .08;
  if (anchor && anchor.room >= 2.2) {
    const refEdge = entries[0].edge;
    const monW = Math.min(6.4, anchor.room * .95);
    const monD = Math.min(4.8, anchor.room * .78);
    const makeRect = (hw, hd) => [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]]
      .map(([u, v]) => [anchor.point[0] + refEdge.ux * u + refEdge.nx * v, anchor.point[1] + refEdge.uz * u + refEdge.nz * v]);
    monitorPolygons = polygonClipping.intersection(building.polygons, [makeRect(monW, monD)]);
    const innerMonitor = polygonClipping.intersection(building.polygons, [makeRect(Math.max(1.2, monW - .32), Math.max(1.0, monD - .32))]);
    const bodyPolys = innerMonitor.length ? innerMonitor : monitorPolygons;
    const monitorH = Math.min(2.05, height * .22);
    const capH = .20;
    if (monitorPolygons.length) {
      for (const mp of bodyPolys) {
        const mBody = buildingGeometry(mp, monitorH);
        mBody.translate(0, parapetBaseY, 0);
        add(mBody, PALETTE.ochreShade);
        for (const me of wallEdges(mp)) {
          if (me.length < 1.8) continue;
          const halfM = me.length / 2 - .22;
          const skyBottom = parapetBaseY + monitorH * .44;
          const skyTop = parapetBaseY + monitorH * .88;
          // Recessed dark steel-grille skylight clerestory ribbon
          const glass = makeSlab(-halfM, halfM, skyBottom, skyTop, 0, .035, PALETTE.steelGlass, { top: false, bottom: false });
          onEdge(glass, me, me.length / 2, 0, .01);
          const mCols = Math.max(2, Math.floor(me.length / 1.4));
          for (let c = 0; c <= mCols; c++) {
            const x = -halfM + (halfM * 2) * c / mCols;
            const bar = makeSlab(x - .025, x + .025, skyBottom, skyTop, .025, .06, PALETTE.steelMullion, { top: false, bottom: false });
            onEdge(bar, me, me.length / 2, 0, .01);
          }
          const rail = makeSlab(-halfM, halfM, (skyBottom + skyTop) / 2 - .02, (skyBottom + skyTop) / 2 + .02, .025, .055, PALETTE.steelMullion);
          onEdge(rail, me, me.length / 2, 0, .01);
        }
      }
      for (const mp of monitorPolygons) {
        const mSoffit = buildingGeometry(mp, .05);
        mSoffit.translate(0, parapetBaseY + monitorH - .05, 0);
        add(mSoffit, PALETTE.concreteShadow);
        const mRoof = buildingGeometry(mp, capH);
        mRoof.translate(0, parapetBaseY + monitorH, 0);
        add(mRoof, PALETTE.concreteLight);
      }
      roofRise = Math.max(roofRise, slabThickness + monitorH + capH);
    }
  }

  // 3. ENTRY PORTAL & TWO MONUMENTAL TALL ARCHED RECESSES ON PRIMARY ROAD-FACING FACADE
  const blockedFullByEdge = new Map();
  const entryApertureByEdge = new Map();
  const addInterval = (map, idx, lo, hi) => {
    if (!map.has(idx)) map.set(idx, []);
    map.get(idx).push([lo, hi]);
  };

  const entryDetails = [];
  let monumentalArchCount = 0;

  entries.forEach((entry, entryIdx) => {
    const { edge, distance, source } = entry;
    const edgeIdx = outerEdges.indexOf(edge);
    const clearHalf = Math.min(1.25, distance - .2, edge.length - distance - .2);
    const portalHalf = clearHalf + .28;
    const canopyY = Math.min(height - 1.1, 3.30);
    const canopyDepth = Math.min(overhang, .90);

    // Crisp white vertical jamb piers flanking the 100% open ground-level entry aperture
    for (const side of [-1, 1]) {
      const px = side * (clearHalf + .14);
      const jamb = makeSlab(px - .14, px + .14, .02, canopyY + .28, 0, .38, PALETTE.concreteLight, { bottom: false });
      onEdge(jamb, edge, distance, 0, .02);
    }
    // Overhead cantilevered white entrance canopy (strictly above y = 3.18m, keeping ground entry clear!)
    const cSoffit = makeSlab(-portalHalf - .12, portalHalf + .12, canopyY - .06, canopyY, .02, canopyDepth * .90, PALETTE.concreteShadow, { top: false });
    onEdge(cSoffit, edge, distance, 0, .01);
    const cSlab = makeSlab(-portalHalf - .18, portalHalf + .18, canopyY, canopyY + .26, .02, canopyDepth, PALETTE.concreteLight);
    onEdge(cSlab, edge, distance, 0, .01);

    // Upper lobby clerestory window above entry canopy
    if (height - canopyY > 2.2) {
      const winH = Math.min(2.1, height - canopyY - 1.25);
      const lobbyWin = makeSteelGrilleWindow(Math.max(1.2, clearHalf * 1.75), winH);
      onEdge(lobbyWin, edge, distance, canopyY + .55 + winH / 2, .03);
    }

    addInterval(entryApertureByEdge, edgeIdx, distance - clearHalf - .02, distance + clearHalf + .02);
    addInterval(blockedFullByEdge, edgeIdx, distance - portalHalf - .25, distance + portalHalf + .25);

    // Place TWO monumental tall arched recesses on the primary road-facing facade framing the entry zone
    if (entryIdx === 0) {
      const leftAvail = distance - portalHalf - .55;
      const rightAvail = edge.length - (distance + portalHalf) - .55;
      const archH = Math.max(2.6, height - .62);
      const archCenters = [];
      let archW = 3.4;

      if (leftAvail >= 1.8 && rightAvail >= 1.8) {
        archW = Math.min(3.8, Math.min(leftAvail, rightAvail) * .72);
        const leftC = Math.max(archW / 2 + .35, distance - portalHalf - .45 - archW / 2 - Math.min(.9, (leftAvail - archW) * .35));
        const rightC = Math.min(edge.length - archW / 2 - .35, distance + portalHalf + .45 + archW / 2 + Math.min(.9, (rightAvail - archW) * .35));
        archCenters.push(leftC, rightC);
      } else {
        // Asymmetric entry fallback: place both monumental arches on the widest open side of the primary facade
        const onRight = rightAvail >= leftAvail;
        const sideStart = onRight ? distance + portalHalf + .45 : .35;
        const sideLen = Math.max(0, (onRight ? edge.length - .35 : distance - portalHalf - .45) - sideStart);
        if (sideLen >= 3.4) {
          archW = Math.min(3.5, (sideLen - .6) / 2);
          archCenters.push(sideStart + sideLen * .27, sideStart + sideLen * .73);
        }
      }

      for (const ac of archCenters) {
        const monumental = makeMonumentalArch(archW, archH, .30, 10);
        onEdge(monumental, edge, ac, .08, .03);
        addInterval(blockedFullByEdge, edgeIdx, ac - archW / 2 - .30, ac + archW / 2 + .30);
        monumentalArchCount++;
      }
    }

    entryDetails.push({
      center: edge.at(distance, 0, 0), source, clearWidth: clearHalf * 2,
      canopyHeight: canopyY, surveyed: source === 'surveyed',
    });
  });

  // 4. GOLDEN-OCHRE FACADE CLADDING, SCULPTED WHITE Y-CAPITALS & DARK STEEL-GRILLE WINDOW GRIDS
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  let forkedColumnCount = 0;
  let windowBayCount = 0;

  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = entryApertureByEdge.get(ei) ?? [];
    const detailBlocked = blockedFullByEdge.get(ei) ?? [];

    // Grounded base plinth skirt (strictly open across entry apertures!)
    for (const [a, b] of splitIntervals(edge.length, apertureBlocked, 0)) {
      const len = b - a;
      const plinth = makeSlab(-len / 2, len / 2, 0, .44, 0, .14, PALETTE.plinth, { bottom: false });
      onEdge(plinth, edge, (a + b) / 2, 0, .01);
    }

    // Warm golden-ochre facade panels + crisp white floor spandrel bands outside monumental arches & entries
    const wallSpans = splitIntervals(edge.length, detailBlocked, 0);
    for (const [a, b] of wallSpans) {
      const len = b - a, mid = (a + b) / 2;
      // Golden-ochre cladding skin over source body
      const ochrePanel = makeSlab(-len / 2, len / 2, .44, height - .08, 0, .042, PALETTE.ochreMain, { bottom: false, top: false });
      onEdge(ochrePanel, edge, mid, 0, .01);
      // Crisp white concrete floor slab spandrel bands between storeys
      for (let f = 1; f < floors; f++) {
        const fy = f * floorH;
        const band = makeSlab(-len / 2, len / 2, fy - .11, fy + .11, 0, .13, PALETTE.concreteLight);
        onEdge(band, edge, mid, 0, .01);
      }
    }

    // Rhythmic white Y-shaped / forked structural column capitals & recessed steel-grille window bays
    if (edge.length >= 4.2) {
      const bayCount = Math.max(1, Math.floor(edge.length / 4.2));
      const bayStep = edge.length / bayCount;

      // Sculpted white Y-columns along bay boundaries
      for (let i = 0; i <= bayCount; i++) {
        const d = i === 0 ? .38 : i === bayCount ? edge.length - .38 : i * bayStep;
        if (detailBlocked.some(([lo, hi]) => d >= lo - .32 && d <= hi + .32)) continue;
        const yCol = makeForkedColumn(height, overhang);
        onEdge(yCol, edge, d, 0, .02);
        forkedColumnCount++;
      }

      // Recessed dark steel-grille window grids inside each structural bay across storeys
      for (let b = 0; b < bayCount; b++) {
        const centerD = (b + .5) * bayStep;
        const winW = Math.min(2.55, bayStep * .62);
        if (detailBlocked.some(([lo, hi]) => centerD + winW / 2 + .18 > lo && centerD - winW / 2 - .18 < hi)) continue;
        for (let f = 0; f < floors; f++) {
          const y0 = f * floorH + (f === 0 ? 1.02 : .92);
          const y1 = Math.min(height - .65, f * floorH + floorH - .52);
          const winH = y1 - y0;
          if (winH < .75) continue;
          // Shaded golden-ochre spandrel apron beneath window sill
          const apron = makeSlab(-winW / 2 - .06, winW / 2 + .06, f * floorH + (f === 0 ? .46 : .14), y0 - .10, 0, .065, PALETTE.ochreShade, { bottom: false, top: false });
          onEdge(apron, edge, centerD, 0, .01);
          const win = makeSteelGrilleWindow(winW, winH);
          onEdge(win, edge, centerD, (y0 + y1) / 2, .03);
          windowBayCount++;
        }
      }
    }
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  if (!geometry) throw new Error('Could not merge Central Library geometry');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .76, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'central-library-architecture';
  mesh.castShadow = mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'central-library-landmark';
  group.add(mesh);

  const diagnostics = {
    osmType: 'way',
    osmId: CENTRAL_LIBRARY_ID,
    baseHeight: height,
    roofOverhang: overhang,
    roofRise,
    maxHorizontalExtent: +(overhang * 1.48 + .08).toFixed(3),
    heightStatus: 'disputed-storey-envelope',
    detailStatus: 'illustrative-dimensions-from-historical-photo',
    entries: entryDetails,
    monumentalArchCount,
    forkedColumnCount,
    windowBayCount,
    monitorPolygons,
    drawCalls: 1,
    collisionObjects: 0,
    sourceUrls: [...REFERENCES],
    observedAt: '2018-11-21',
  };
  group.userData.centralLibrary = diagnostics;

  let disposed = false;
  return {
    group,
    diagnostics,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
