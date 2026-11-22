import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { buildingGeometry } from '../geometry.js';
import { wallEdges, tintGeometry } from '../facades.js';

export const AUDITORIUM_ID = '7650711';
const PHOTO_URL = 'https://commons.wikimedia.org/wiki/File:Architectures_of_Islamic_University,_Bangladesh._Birshreshtha_Hamidur_Rahman_Auditorium.jpg';

const PALETTE = Object.freeze({
  cream: 0xe6d5bf,
  creamLight: 0xf0e3d0,
  creamReveal: 0xc5b09a,
  terracotta: 0xa96d5e,
  terracottaDeep: 0x8e594c,
  soffitShadow: 0x7a4c41,
  plinth: 0xc7b49f,
  roofDeck: 0xc7b9a9,
  parapet: 0xd6c3ae,
  spandrel: 0x975e50,
  nicheDark: 0x453937,
  louverBack: 0x333a3d,
  louverSlat: 0x5c6366,
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

function roundArchOutline(halfW, height, segments) {
  const crownRise = Math.min(halfW * .85, height * .42);
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
 * Continuous inverted-U 3D arch surround (no threshold bar) with front/side/reveal shading.
 */
function makeOpenArchFrame(width, height, thickness, depth, frontHex, sideHex, revealHex, segments = 10) {
  const pos = [], norm = [], col = [];
  const cFront = new THREE.Color(frontHex);
  const cSide = new THREE.Color(sideHex);
  const cReveal = new THREE.Color(revealHex);
  const outer = roundArchOutline(width / 2, height, segments);
  const inner = roundArchOutline(Math.max(.08, width / 2 - thickness), Math.max(.15, height - thickness), segments);
  for (let i = 0; i < outer.length - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], depth], [o1[0], o1[1], depth], [i1[0], i1[1], depth], [i0[0], i0[1], depth],
      [0, 0, 1], cFront);
    const odx = o1[0] - o0[0], ody = o1[1] - o0[1], olen = Math.hypot(odx, ody) || 1;
    pushColoredQuad(pos, norm, col,
      [o0[0], o0[1], 0], [o1[0], o1[1], 0], [o1[0], o1[1], depth], [o0[0], o0[1], depth],
      [-ody / olen, odx / olen, 0], cSide);
    const idx = i1[0] - i0[0], idy = i1[1] - i0[1], ilen = Math.hypot(idx, idy) || 1;
    pushColoredQuad(pos, norm, col,
      [i0[0], i0[1], depth], [i1[0], i1[1], depth], [i1[0], i1[1], 0], [i0[0], i0[1], 0],
      [idy / ilen, -idx / ilen, 0], cReveal);
  }
  return buildCustomGeometry(pos, norm, col);
}

/** Recessed warm-terracotta & shadowed acoustic back panel for upper facade decorative arches. */
function makeUpperArchRecess(width, height, thickness, segments = 8) {
  const pos = [], norm = [], col = [];
  const cSpandrel = new THREE.Color(PALETTE.spandrel);
  const cNiche = new THREE.Color(PALETTE.nicheDark);
  const inner = roundArchOutline(Math.max(.08, width / 2 - thickness * .9), Math.max(.15, height - thickness * .9), segments);
  const center = [0, height * .35, .012];
  for (let i = 0; i < inner.length - 1; i++) {
    pushColoredTri(pos, norm, col, center, [inner[i][0], inner[i][1], .012], [inner[i + 1][0], inner[i + 1][1], .012], [0, 0, 1], cSpandrel);
  }
  pushColoredTri(pos, norm, col, center, [inner.at(-1)[0], inner.at(-1)[1], .012], [inner[0][0], inner[0][1], .012], [0, 0, 1], cSpandrel);

  // Inner dark recessed acoustic alcove inset inside the terracotta spandrel
  const alcoveW = Math.max(.08, width / 2 - thickness * 1.45);
  const alcoveH = Math.max(.12, height - thickness * 1.45);
  const alcove = roundArchOutline(alcoveW, alcoveH, segments);
  const aCtr = [0, alcoveH * .35, .025];
  for (let i = 0; i < alcove.length - 1; i++) {
    pushColoredTri(pos, norm, col, aCtr, [alcove[i][0], alcove[i][1], .025], [alcove[i + 1][0], alcove[i + 1][1], .025], [0, 0, 1], cNiche);
  }
  pushColoredTri(pos, norm, col, aCtr, [alcove.at(-1)[0], alcove.at(-1)[1], .025], [alcove[0][0], alcove[0][1], .025], [0, 0, 1], cNiche);
  return buildCustomGeometry(pos, norm, col);
}

/** Splits [0, length] by subtracting blocked intervals [lo, hi]. */
function splitIntervals(length, blocked, margin = 0) {
  let spans = [[margin, length - margin]];
  for (const [lo, hi] of blocked) {
    spans = spans.flatMap(([a, b]) => {
      if (hi <= a || lo >= b) return [[a, b]];
      return [[a, Math.min(lo, b)], [Math.max(hi, a), b]].filter(([x, y]) => y - x > .25);
    });
  }
  return spans.filter(([x, y]) => y - x > .25);
}

function anchorInside(polygon) {
  const xs = polygon[0].map(p => p[0]), zs = polygon[0].map(p => p[1]);
  const minX = Math.min(...xs), minZ = Math.min(...zs), width = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
  let best;
  for (let ix = 1; ix < 25; ix++) for (let iz = 1; iz < 25; iz++) {
    const point = [minX + width * ix / 25, minZ + depth * iz / 25];
    if (!pointInPolygon(point, polygon)) continue;
    const room = Math.min(...polygon.flatMap(ring => ring.slice(1).map((p, i) => pointToSegmentDistance(point, ring[i], p))));
    if (!best || room > best.room) best = { point, room };
  }
  return best;
}

/** Adds visual roof masses/entry trim; the caller retains the mapped body and collision. */
export function buildAuditorium(building, options = {}) {
  if (String(building?.id) !== AUDITORIUM_ID || (building.osmType && building.osmType !== 'relation')) {
    throw new TypeError('Auditorium model requires OSM relation 7650711');
  }
  const polygon = building.polygons?.[0];
  if (building.polygons?.length !== 1 || !polygon?.[0]?.length || polygon.some(ring => ring.length < 4 ||
    ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
    ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
    throw new TypeError('Auditorium requires one finite closed mapped polygon');
  }
  const height = options.baseHeight ?? building.height ?? 9.6;
  const projection = options.entryProjection ?? .9;
  if (!Number.isFinite(height) || height < 4 || height > 40 || !Number.isFinite(projection) || projection < .15 || projection > 1.25) {
    throw new RangeError('Auditorium height/projection must be finite and within visual augmentation limits');
  }
  const allEdges = wallEdges(polygon);
  const edges = allEdges.filter(e => !e.ringIndex && e.length >= 4);
  if (!edges.length) throw new RangeError('Auditorium has no usable outer facade');
  const samePoint = (a, b) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const sameEdge = (a, b) => samePoint(a.a, b.a) && samePoint(a.b, b.b);
  const requested = options.entrances;
  if (requested !== undefined && (!Array.isArray(requested) || !requested.length)) throw new TypeError('Entrances must be a nonempty array');
  const entryInputs = requested ?? [{ edge: [...edges].sort((a, b) => b.length - a.length)[0], source: 'illustrative-longest-edge' }];
  const entries = entryInputs.map(entry => {
    const edge = edges.find(e => samePoint(e.a, entry.edge?.a) && samePoint(e.b, entry.edge?.b));
    const distance = entry.distance ?? edge?.length / 2;
    if (!edge || !Number.isFinite(distance) || distance < 1 || distance > edge.length - 1) {
      throw new RangeError('Entrance must lie away from a corner on a mapped outer edge');
    }
    return { edge, distance, source: entry.source ?? 'caller-supplied-unverified' };
  });
  const anchor = anchorInside(polygon);
  if (!anchor || anchor.room < 1) throw new RangeError('Auditorium footprint has no usable hall roof');

  const parts = [], entryDetails = [];
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
  const onEdge = (geometry, edge, distance, y, outward, color = null) => {
    geometry.applyMatrix4(edgeMatrix(edge, distance, y, outward));
    if (color === null) addRaw(geometry);
    else add(geometry, color);
  };

  // Safe non-portico facade projection cap so all trim remains strictly inside maxFacadeProjection
  const trimProj = Math.min(.16, projection * .88);

  // 1. ROOF DECK CAP + SCULPTED PERIMETER ROOF PARAPET WITH STEPPED COPING
  // Follow every original ring, including holes; no invented rectangular site slab.
  const cap = buildingGeometry(polygon, .14); cap.translate(0, height + .015, 0); add(cap, PALETTE.roofDeck);

  const front = entries[0].edge, halfWidth = anchor.room * 1.16, halfDepth = anchor.room * .92;
  const makeHallRect = (hw, hd) => [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]]
    .map(([u, v]) => [anchor.point[0] + front.ux * u + front.nx * v, anchor.point[1] + front.uz * u + front.nz * v]);

  const hallPolygons = polygonClipping.intersection(building.polygons, [makeHallRect(halfWidth, halfDepth)]);
  const innerInset = Math.min(.38, anchor.room * .14);
  const innerCandidates = halfWidth > innerInset + 1 && halfDepth > innerInset + 1
    ? polygonClipping.intersection(building.polygons, [makeHallRect(halfWidth - innerInset, halfDepth - innerInset)])
    : [];
  const wallPolygons = innerCandidates.length ? innerCandidates : hallPolygons;
  const hallRise = Math.min(2.1, height * .2);
  const roofRise = hallRise + .34;

  // Perimeter roof parapet (kept well below height + roofRise so boundingBox.max.y === height + roofRise)
  const parapetH = Math.min(.68, hallRise * .52);
  const copingOut = Math.min(.06, projection * .4);
  for (const edge of allEdges) {
    if (edge.length < .6) continue;
    const halfL = edge.length / 2;
    const wall = makeSlab(-halfL, halfL, 0, parapetH, -.24, .01, PALETTE.parapet, { back: true, bottom: false, top: false });
    onEdge(wall, edge, halfL, height + .155, 0);
    const coping = makeSlab(-halfL - .02, halfL + .02, parapetH, parapetH + .10, -.28, copingOut, PALETTE.creamLight, { back: true });
    onEdge(coping, edge, halfL, height + .155, 0);
  }

  // 2. RECESSED CLERESTORY ROOF HALL (ribbed pilasters, dark acoustic louver band & overhanging cornice)
  for (const p of wallPolygons) {
    const walls = buildingGeometry(p, hallRise); walls.translate(0, height + .16, 0); add(walls, PALETTE.terracotta);
    for (const edge of wallEdges(p)) {
      if (edge.length < 2.2) continue;
      const pilasterDepth = Math.min(.13, innerInset * .55);
      // Dark clerestory acoustic louver ribbon wrapping upper half of hall
      const louverBottom = height + .16 + hallRise * .42;
      const louverTop = height + .16 + hallRise * .86;
      const louverHalf = edge.length / 2 - .18;
      if (louverHalf > .4) {
        const back = makeSlab(-louverHalf, louverHalf, louverBottom, louverTop, 0, .035, PALETTE.louverBack, { top: false, bottom: false });
        onEdge(back, edge, edge.length / 2, 0, .01);
        for (let s = 0; s < 3; s++) {
          const sy = louverBottom + (louverTop - louverBottom) * (s + .5) / 3;
          const slat = makeSlab(-louverHalf, louverHalf, sy - .032, sy + .032, .025, .075, PALETTE.louverSlat);
          onEdge(slat, edge, edge.length / 2, 0, .01);
        }
      }
      // Rhythmic vertical ribbed pilasters along clerestory hall walls
      const pCount = Math.max(2, Math.floor(edge.length / 2.6));
      const pStep = edge.length / pCount;
      for (let i = 0; i <= pCount; i++) {
        const d = i === 0 ? .16 : i === pCount ? edge.length - .16 : i * pStep;
        const rib = makeSlab(-.10, .10, height + .16, height + .16 + hallRise, 0, pilasterDepth, PALETTE.cream, { bottom: false, top: false });
        onEdge(rib, edge, d, 0, .01);
      }
    }
  }
  // Overhanging upper clerestory cornice slab + shadow soffit (top at exact height + roofRise)
  for (const p of hallPolygons) {
    const soffit = buildingGeometry(p, .06); soffit.translate(0, height + .16 + hallRise - .06, 0); add(soffit, PALETTE.soffitShadow);
    const slab = buildingGeometry(p, .18); slab.translate(0, height + .16 + hallRise, 0); add(slab, PALETTE.creamLight);
  }

  // 3. DEEPER SCULPTED ARCHED ENTRANCE PORTICO(S)
  // Track blocked spans per edge so pilasters & mid-height cornice bands never cross the entry opening.
  const entryZonesByEdge = new Map();
  for (const { edge, distance, source } of entries) {
    const maxAvailHalf = Math.min(distance - .08, edge.length - distance - .08);
    const width = Math.min(7.8, Math.min(distance, edge.length - distance) * 1.65);
    const archHeight = Math.min(7, height * .76);
    const trim = Math.min(.42, width * .07);
    const outerDepth = Math.max(.08, projection - .04);

    // Outer deep cream arch portal (open at bottom — zero threshold bar!)
    const outerArch = makeOpenArchFrame(width, archHeight, trim, outerDepth, PALETTE.cream, PALETTE.creamLight, PALETTE.creamReveal, 12);
    onEdge(outerArch, edge, distance, .05, .04);

    // Inner chamfered/stepped terracotta arch molding recessed inside outer arch reveal
    const innerArchW = width - trim * 2 + .02;
    const innerArchH = archHeight - trim + .02;
    const innerTrim = Math.min(.22, Math.max(.08, (innerArchW - 1.6) * .12));
    if (innerArchW - innerTrim * 2 > 1.45 && outerDepth > .14) {
      const innerArch = makeOpenArchFrame(innerArchW, innerArchH, innerTrim, outerDepth * .62,
        PALETTE.terracotta, PALETTE.terracottaDeep, PALETTE.soffitShadow, 10);
      onEdge(innerArch, edge, distance, .05, .04);
    }

    // Twin flanking vertical column piers supporting the overhanging canopy
    const pierW = Math.min(.44, Math.max(.22, maxAvailHalf - width / 2));
    const pierOffset = width / 2 + pierW * .42;
    if (pierOffset + pierW * .5 <= maxAvailHalf) {
      const pierDepth = Math.min(projection + .02, outerDepth + .06);
      for (const side of [-1, 1]) {
        const px = side * pierOffset;
        const base = makeSlab(px - pierW * .58, px + pierW * .58, 0, .55, 0, pierDepth + .02, PALETTE.plinth, { bottom: false });
        onEdge(base, edge, distance, .02, .03);
        const shaft = makeSlab(px - pierW * .46, px + pierW * .46, .55, archHeight - .32, 0, pierDepth, PALETTE.cream, { bottom: false, top: false });
        onEdge(shaft, edge, distance, .02, .03);
        const neck = makeSlab(px - pierW * .52, px + pierW * .52, archHeight - .32, archHeight - .18, 0, pierDepth + .01, PALETTE.terracotta);
        onEdge(neck, edge, distance, .02, .03);
        const capSlab = makeSlab(px - pierW * .60, px + pierW * .60, archHeight - .18, archHeight + .04, 0, pierDepth + .02, PALETTE.creamLight);
        onEdge(capSlab, edge, distance, .02, .03);
      }
    }

    // Double-tiered overhanging fascia canopy slabs with shadow soffit (only above archHeight!)
    const canopyHalf = Math.min(width / 2 + pierW + .20, maxAvailHalf);
    const maxCanopyZ = projection + .05; // strictly <= maxFacadeProjection (projection + .08)
    const soffit = makeSlab(-canopyHalf + .06, canopyHalf - .06, archHeight + .02, archHeight + .08, .02, maxCanopyZ * .90, PALETTE.soffitShadow, { top: false });
    onEdge(soffit, edge, distance, 0, .01);
    const lowerFascia = makeSlab(-canopyHalf, canopyHalf, archHeight + .08, archHeight + .30, .02, maxCanopyZ * .94, PALETTE.terracotta);
    onEdge(lowerFascia, edge, distance, 0, .01);
    const revealBand = makeSlab(-canopyHalf + .08, canopyHalf - .08, archHeight + .30, archHeight + .39, .02, maxCanopyZ * .84, PALETTE.terracottaDeep, { top: false, bottom: false });
    onEdge(revealBand, edge, distance, 0, .01);
    const upperFascia = makeSlab(-canopyHalf - .02, canopyHalf + .02, archHeight + .39, archHeight + .59, .02, maxCanopyZ, PALETTE.creamLight);
    onEdge(upperFascia, edge, distance, 0, .01);

    const key = edges.indexOf(edge);
    if (!entryZonesByEdge.has(key)) entryZonesByEdge.set(key, []);
    entryZonesByEdge.get(key).push([distance - canopyHalf - .15, distance + canopyHalf + .15]);

    entryDetails.push({
      center: edge.at(distance, 0, 0), source, width, clearWidth: width - trim * 2,
      archHeight, maxProjection: projection + .08, surveyed: source === 'surveyed',
    });
  }

  // 4. OUTER-WALL PILASTERS, MID-HEIGHT SHADOW CORNICE BAND & UPPER DECORATIVE ARCH ARCADES
  let upperArches = 0;
  for (let ei = 0; ei < edges.length; ei++) {
    const edge = edges[ei];
    const blocked = entryZonesByEdge.get(ei) ?? [];
    const freeSpans = splitIntervals(edge.length, blocked, .04);

    // Horizontal mid-height shadow cornice band & grounded base plinth (interrupted across entry zones)
    const midY = height * .50;
    for (const [a, b] of freeSpans) {
      const spanLen = b - a, midD = (a + b) / 2;
      const soffitBand = makeSlab(-spanLen / 2, spanLen / 2, midY - .08, midY, 0, trimProj * .72, PALETTE.soffitShadow, { top: false });
      onEdge(soffitBand, edge, midD, 0, .01);
      const corniceBand = makeSlab(-spanLen / 2, spanLen / 2, midY, midY + .13, 0, trimProj, PALETTE.cream);
      onEdge(corniceBand, edge, midD, 0, .01);
      // Ground-floor base plinth band
      const plinthBand = makeSlab(-spanLen / 2, spanLen / 2, 0, .42, 0, trimProj * .75, PALETTE.plinth, { bottom: false });
      onEdge(plinthBand, edge, midD, .01, .01);
    }

    // Continuous top wall eaves band (above portico canopy level)
    const eaveH = Math.min(.16, height * .025);
    const eaveSoffit = makeSlab(-edge.length / 2 + .02, edge.length / 2 - .02, height - eaveH - .07, height - eaveH, 0, trimProj * .72, PALETTE.soffitShadow, { top: false });
    onEdge(eaveSoffit, edge, edge.length / 2, 0, .01);
    const eaveBand = makeSlab(-edge.length / 2 + .02, edge.length / 2 - .02, height - eaveH, height + .02, 0, trimProj, PALETTE.creamLight);
    onEdge(eaveBand, edge, edge.length / 2, 0, .01);

    // Rhythmic vertical architectural pilasters & deeply framed upper decorative arch arcades
    const count = Math.max(1, Math.floor(edge.length / 6)), spacing = edge.length / count;
    for (let i = 0; i <= count; i++) {
      const d = i === 0 ? .22 : i === count ? edge.length - .22 : i * spacing;
      if (blocked.some(([lo, hi]) => d >= lo - .22 && d <= hi + .22)) continue;
      const pilShaft = makeSlab(-.15, .15, .42, height - eaveH - .18, 0, trimProj * .86, PALETTE.cream, { bottom: false, top: false });
      onEdge(pilShaft, edge, d, 0, .01);
      const pilCap = makeSlab(-.19, .19, height - eaveH - .18, height - eaveH, 0, trimProj, PALETTE.creamLight, { top: false });
      onEdge(pilCap, edge, d, 0, .01);
    }

    for (let i = 0; i < count; i++) {
      const centerD = spacing * (i + .5);
      const width = Math.min(3.3, spacing * .62), h = Math.min(2.05, height * .22);
      const archY = height - h - .28;
      const archDepth = Math.min(.14, trimProj * .88);
      const overlapsEntryLow = archY < 3.1 && blocked.some(([lo, hi]) => centerD + width / 2 > lo && centerD - width / 2 < hi);
      if (overlapsEntryLow) continue;
      const archFrame = makeOpenArchFrame(width, h, .20, archDepth, PALETTE.cream, PALETTE.creamLight, PALETTE.creamReveal, 8);
      onEdge(archFrame, edge, centerD, archY, .02);
      // Recessed warm-terracotta spandrel & acoustic shadow back inside upper arcade
      if (!blocked.some(([lo, hi]) => centerD + width / 2 > lo && centerD - width / 2 < hi) || archY > 3.2) {
        const recess = makeUpperArchRecess(width, h, .20, 8);
        onEdge(recess, edge, centerD, archY, .02);
      }
      upperArches++;
    }
  }

  const geometry = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  if (!geometry) throw new Error('Could not merge auditorium augmentation');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .78, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'auditorium-layered-roof-and-arches'; mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'birshreshtha-hamidur-rahman-auditorium'; group.add(mesh);
  const diagnostics = {
    osmType: 'relation', osmId: AUDITORIUM_ID, baseHeight: height,
    heightStatus: 'caller-body-height-unmeasured', roofRise, footprintStatus: 'source-osm',
    detailStatus: 'illustrative-dimensions-from-historical-photo', entries: entryDetails, upperArches,
    drawCalls: 1, collisionObjects: 0, maxFacadeProjection: projection + .08,
    sourceUrl: PHOTO_URL, observedAt: '2021-04-04', hallPolygons,
  };
  group.userData.auditorium = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
