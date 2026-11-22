import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { buildingGeometry } from '../geometry.js';
import { wallEdges } from '../facades.js';

export const ACADEMIC_LANDMARK_IDS = Object.freeze({
  administration: '18079380',
  newAdministration: '929202651',
  rabindraNazrul: '18079382',
  ibnSina: '18079384',
  businessAdmin: '18079386',
});

const PALETTES = Object.freeze({
  civicAdmin: Object.freeze({
    wallMain: 0xece4d2,
    wallLight: 0xf5f0e3,
    sandstone: 0xd5c8ad,
    sandstoneDeep: 0xb59a74,
    soffit: 0x9b886c,
    plinth: 0x8f8370,
    glass: 0x22333b,
    mullion: 0xf4f0e6,
    steelLight: 0xd9e0e4,
    steelShade: 0xaab4ba,
    brass: 0xe2b963,
  }),
  culturalArts: Object.freeze({
    wallMain: 0xdfd0b8,
    terracotta: 0xb86c52,
    terracottaDeep: 0x93503a,
    ivory: 0xebe4d5,
    ivoryCap: 0xf3eee3,
    soffit: 0x8f7964,
    plinth: 0x88725f,
    glass: 0x232e33,
    woodMullion: 0x6c4a34,
  }),
  ibnSina: Object.freeze({
    wallMain: 0xe4e2d8,
    accent: 0x46686e,
    accentDeep: 0x314b50,
    ribLight: 0xf2efe8,
    soffit: 0x9ca3a0,
    plinth: 0x7c8381,
    glass: 0x1f333b,
    stairGlass: 0x2a4a55,
    tankBody: 0xc9cecc,
    tankShade: 0xa6aeac,
    tankCap: 0x46686e,
  }),
  businessAdmin: Object.freeze({
    wallMain: 0xe5d6bd,
    accent: 0x9b634a,
    accentDeep: 0x744734,
    ribLight: 0xf3ede0,
    soffit: 0xa6947d,
    plinth: 0x857564,
    glass: 0x252f37,
    stairGlass: 0x31424c,
    tankBody: 0xd1c7b8,
    tankShade: 0xb0a493,
    tankCap: 0x8f5b43,
  }),
});

const LANDMARK_SPECS = Object.freeze({
  [`relation/${ACADEMIC_LANDMARK_IDS.administration}`]: Object.freeze({
    key: 'administration',
    osmType: 'relation',
    id: ACADEMIC_LANDMARK_IDS.administration,
    archetype: 'civic-admin',
    nameEn: 'Administration Building',
    nameBn: 'প্রশাসন ভবন',
    defaultHeight: 9.6,
    hasFlagpoles: true,
    palette: PALETTES.civicAdmin,
  }),
  [`way/${ACADEMIC_LANDMARK_IDS.newAdministration}`]: Object.freeze({
    key: 'newAdministration',
    osmType: 'way',
    id: ACADEMIC_LANDMARK_IDS.newAdministration,
    archetype: 'civic-admin',
    nameEn: 'New Administrative Building',
    nameBn: 'নতুন প্রশাসন ভবন',
    defaultHeight: 9.6,
    hasFlagpoles: false,
    palette: PALETTES.civicAdmin,
  }),
  [`relation/${ACADEMIC_LANDMARK_IDS.rabindraNazrul}`]: Object.freeze({
    key: 'rabindraNazrul',
    osmType: 'relation',
    id: ACADEMIC_LANDMARK_IDS.rabindraNazrul,
    archetype: 'cultural-arts',
    nameEn: 'Rabindra–Nazrul Arts Building',
    nameBn: 'রবীন্দ্র–নজরুল কলা ভবন',
    defaultHeight: 9.6,
    hasFlagpoles: false,
    palette: PALETTES.culturalArts,
  }),
  [`relation/${ACADEMIC_LANDMARK_IDS.ibnSina}`]: Object.freeze({
    key: 'ibnSina',
    osmType: 'relation',
    id: ACADEMIC_LANDMARK_IDS.ibnSina,
    archetype: 'modern-tower',
    nameEn: 'Ibn Sina Science Building',
    nameBn: 'ইবনে সিনা বিজ্ঞান ভবন',
    defaultHeight: 16.0,
    hasFlagpoles: false,
    palette: PALETTES.ibnSina,
  }),
  [`relation/${ACADEMIC_LANDMARK_IDS.businessAdmin}`]: Object.freeze({
    key: 'businessAdmin',
    osmType: 'relation',
    id: ACADEMIC_LANDMARK_IDS.businessAdmin,
    archetype: 'modern-tower',
    nameEn: 'Business Administration Building',
    nameBn: 'ব্যবসায় প্রশাসন অনুষদ ভবন',
    defaultHeight: 19.2,
    hasFlagpoles: false,
    palette: PALETTES.businessAdmin,
  }),
});

const COLOR_CACHE = new Map();
function getColor(hex) {
  let c = COLOR_CACHE.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    COLOR_CACHE.set(hex, c);
  }
  return c;
}

export function isAcademicLandmark(building) {
  if (!building || typeof building !== 'object') return false;
  const key = `${building.osmType ?? ''}/${building.id ?? ''}`;
  return Object.prototype.hasOwnProperty.call(LANDMARK_SPECS, key);
}

/**
 * Direct right-handed triangle/quad builder emitting guaranteed outward normals
 * into a single flat vertex-colored BufferGeometry with zero intermediate GC churn.
 */
class MeshBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  tri(a, b, c, n, colorHex) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-12) return;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) {
      this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    } else {
      this.pos.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
    }
    const color = getColor(colorHex);
    for (let i = 0; i < 3; i++) {
      this.norm.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a, b, c, d, n, colorHex) {
    this.tri(a, b, c, n, colorHex);
    this.tri(a, c, d, n, colorHex);
  }

  /** Axis-aligned solid box in wall-local coordinates: d along edge, y vertical, o outward. */
  edgeBox(edge, d0, d1, y0, y1, o0, o1, colorHex, {
    topColor = colorHex,
    bottomColor = colorHex,
    sideColor = colorHex,
    back = false,
    top = true,
    bottom = true,
    sides = true,
  } = {}) {
    if (d1 - d0 < 1e-4 || y1 - y0 < 1e-4 || o1 - o0 < 1e-4) return;
    const p000 = edge.at(d0, y0, o0), p100 = edge.at(d1, y0, o0);
    const p110 = edge.at(d1, y1, o0), p010 = edge.at(d0, y1, o0);
    const p001 = edge.at(d0, y0, o1), p101 = edge.at(d1, y0, o1);
    const p111 = edge.at(d1, y1, o1), p011 = edge.at(d0, y1, o1);
    const nOut = [edge.nx, 0, edge.nz];
    this.quad(p001, p101, p111, p011, nOut, colorHex);
    if (back) this.quad(p100, p000, p010, p110, [-edge.nx, 0, -edge.nz], colorHex);
    if (sides) {
      this.quad(p000, p001, p011, p010, [-edge.ux, 0, -edge.uz], sideColor);
      this.quad(p101, p100, p110, p111, [edge.ux, 0, edge.uz], sideColor);
    }
    if (top) this.quad(p011, p111, p110, p010, [0, 1, 0], topColor);
    if (bottom) this.quad(p000, p100, p101, p001, [0, -1, 0], bottomColor);
  }

  /** Outward-facing flat wall quad at exact offset o. */
  edgeFace(edge, d0, d1, y0, y1, o, colorHex) {
    if (d1 - d0 < 1e-4 || y1 - y0 < 1e-4) return;
    const a = edge.at(d0, y0, o), b = edge.at(d1, y0, o);
    const c = edge.at(d1, y1, o), d = edge.at(d0, y1, o);
    this.quad(a, b, c, d, [edge.nx, 0, edge.nz], colorHex);
  }

  /** Sloped Bangladeshi concrete chajja / brise-soleil rain-hood sunshade. */
  chajja(edge, d0, d1, yBottom, backH, frontH, depth, colorHex, soffitHex, o0 = 0.01) {
    if (d1 - d0 < 0.12 || depth <= o0) return;
    const o1 = depth;
    const yBackTop = yBottom + backH;
    const yFrontTop = yBottom + frontH;
    const b0 = edge.at(d0, yBottom, o0), b1 = edge.at(d1, yBottom, o0);
    const f0 = edge.at(d0, yBottom, o1), f1 = edge.at(d1, yBottom, o1);
    const tb0 = edge.at(d0, yBackTop, o0), tb1 = edge.at(d1, yBackTop, o0);
    const tf0 = edge.at(d0, yFrontTop, o1), tf1 = edge.at(d1, yFrontTop, o1);
    const run = o1 - o0;
    const slope = backH - frontH;
    const slen = Math.hypot(run, slope) || 1;
    const nTop = [edge.nx * slope / slen, run / slen, edge.nz * slope / slen];
    const nOut = [edge.nx, 0, edge.nz];
    const nLeft = [-edge.ux, 0, -edge.uz];
    const nRight = [edge.ux, 0, edge.uz];
    this.quad(tf0, tf1, tb1, tb0, nTop, colorHex);
    this.quad(f0, f1, tf1, tf0, nOut, colorHex);
    this.quad(b0, b1, f1, f0, [0, -1, 0], soffitHex);
    this.quad(b0, f0, tf0, tb0, nLeft, colorHex);
    this.quad(f1, b1, tb1, tf1, nRight, colorHex);
  }

  /** Tapered or straight faceted vertical cylinder centered at world (cx, cz). */
  cylinder(cx, cz, y0, y1, rBottom, rTop, sides, colorA, colorB = colorA, { topColor = colorA, bottom = false } = {}) {
    if (y1 - y0 < 1e-4) return;
    const topCenter = [cx, y1, cz];
    const botCenter = [cx, y0, cz];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const b0 = [cx + c0 * rBottom, y0, cz + s0 * rBottom];
      const b1 = [cx + c1 * rBottom, y0, cz + s1 * rBottom];
      const t0 = [cx + c0 * rTop, y1, cz + s0 * rTop];
      const t1 = [cx + c1 * rTop, y1, cz + s1 * rTop];
      const am = (a0 + a1) * 0.5;
      const shade = i % 2 === 0 ? colorA : colorB;
      this.quad(b0, b1, t1, t0, [Math.cos(am), 0, Math.sin(am)], shade);
      if (topColor !== null) this.tri(topCenter, t0, t1, [0, 1, 0], topColor);
      if (bottom) this.tri(botCenter, b1, b0, [0, -1, 0], colorB);
    }
  }

  /** Faceted brass/stone finial orb centered at (cx, cy, cz). */
  orb(cx, cy, cz, r, colorLight, colorShade) {
    const top = [cx, cy + r, cz], bot = [cx, cy - r, cz];
    const ring = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ring.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    }
    for (let i = 0; i < 6; i++) {
      const p0 = ring[i], p1 = ring[(i + 1) % 6];
      const am = ((i + 0.5) / 6) * Math.PI * 2;
      this.tri(top, p0, p1, [Math.cos(am) * 0.7, 0.71, Math.sin(am) * 0.7], colorLight);
      this.tri(bot, p1, p0, [Math.cos(am) * 0.7, -0.71, Math.sin(am) * 0.7], colorShade);
    }
  }

  /**
   * 3D decorative segmental or pointed arch rim spanning a gallery bay.
   * Leaves the bay interior below the arch crown completely unobstructed.
   */
  edgeArchRim(edge, dCenter, ySpring, halfSpan, rise, thick, oBack, oFront, frontHex, revealHex, { pointed = false, segments = 6 } = {}) {
    const sampleOutline = (hs, r) => {
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = Math.PI * (1 - t);
        const x = Math.cos(angle) * hs;
        let y = Math.sin(angle) * r;
        if (pointed) {
          const tip = 1 - Math.abs(t * 2 - 1);
          y = y * 0.68 + tip * r * 0.44;
        }
        pts.push([dCenter + x, ySpring + y]);
      }
      return pts;
    };
    const inner = sampleOutline(Math.max(0.25, halfSpan - thick), Math.max(0.2, rise - thick * 0.85));
    const outer = sampleOutline(halfSpan, rise);
    const nOut = [edge.nx, 0, edge.nz];
    for (let i = 0; i < segments; i++) {
      const o0 = outer[i], o1 = outer[i + 1];
      const i0 = inner[i], i1 = inner[i + 1];
      // Front arch ring face
      this.quad(
        edge.at(o0[0], o0[1], oFront), edge.at(o1[0], o1[1], oFront),
        edge.at(i1[0], i1[1], oFront), edge.at(i0[0], i0[1], oFront),
        nOut, frontHex
      );
      // Inner shaded arch intrados soffit
      const id = i1[0] - i0[0], iy = i1[1] - i0[1], il = Math.hypot(id, iy) || 1;
      const inN = [edge.ux * (iy / il), -id / il, edge.uz * (iy / il)];
      this.quad(
        edge.at(i0[0], i0[1], oFront), edge.at(i1[0], i1[1], oFront),
        edge.at(i1[0], i1[1], oBack), edge.at(i0[0], i0[1], oBack),
        inN, revealHex
      );
      // Outer extrados edge
      const od = o1[0] - o0[0], oy = o1[1] - o0[1], ol = Math.hypot(od, oy) || 1;
      const outN = [-edge.ux * (oy / ol), od / ol, -edge.uz * (oy / ol)];
      this.quad(
        edge.at(o0[0], o0[1], oBack), edge.at(o1[0], o1[1], oBack),
        edge.at(o1[0], o1[1], oFront), edge.at(o0[0], o0[1], oFront),
        outN, frontHex
      );
    }
  }

  /**
   * Dignified 3D classical triangular gabled pediment above the central roofline,
   * complete with recessed sandstone tympanum, circular civic emblem boss,
   * projecting sloped raking cornice moldings, and solid roof-side back face.
   */
  edgeClassicalPediment(edge, dCenter, yBase, halfW, rise, oBack, oFront, {
    tympanumHex, moldingHex, trimHex, soffitHex, emblemHex,
  }) {
    const oTymp = oFront - 0.16;
    const nOut = [edge.nx, 0, edge.nz];
    const nIn = [-edge.nx, 0, -edge.nz];
    const leftBase = edge.at(dCenter - halfW, yBase, oTymp);
    const rightBase = edge.at(dCenter + halfW, yBase, oTymp);
    const apex = edge.at(dCenter, yBase + rise, oTymp);
    // Recessed tympanum triangle + solid back gable face
    this.tri(leftBase, rightBase, apex, nOut, tympanumHex);
    this.tri(
      edge.at(dCenter + halfW, yBase, oBack),
      edge.at(dCenter - halfW, yBase, oBack),
      edge.at(dCenter, yBase + rise, oBack),
      nIn, tympanumHex
    );

    // Projecting horizontal base cornice bed
    this.edgeBox(edge, dCenter - halfW - 0.24, dCenter + halfW + 0.24, yBase - 0.14, yBase + 0.04, oBack, oFront + 0.06, moldingHex, {
      topColor: moldingHex, bottomColor: soffitHex, back: true,
    });

    // Two projecting sloped raking cornice beams meeting cleanly at the pediment apex
    const thick = 0.22;
    const slopeLen = Math.hypot(halfW, rise) || 1;
    const slopeSin = rise / slopeLen;
    const slopeCos = halfW / slopeLen;
    for (const side of [-1, 1]) {
      const dOuter = dCenter + side * (halfW + 0.26);
      const yOuter = yBase - 0.04;
      const dTop = dCenter;
      const yTop = yBase + rise + 0.06;
      // Normal pointing perpendicular-upward from the gable slope
      const nxSlope = -side * edge.ux * slopeSin;
      const nySlope = slopeCos;
      const nzSlope = -side * edge.uz * slopeSin;
      const dOuterUp = dOuter - side * slopeSin * thick;
      const yOuterUp = yOuter + slopeCos * thick;
      const dTopUp = dTop;
      const yTopUp = yTop + thick / Math.max(0.45, slopeCos);

      const f0 = edge.at(dOuter, yOuter, oFront + 0.05);
      const f1 = edge.at(dTop, yTop, oFront + 0.05);
      const f2 = edge.at(dTopUp, yTopUp, oFront + 0.05);
      const f3 = edge.at(dOuterUp, yOuterUp, oFront + 0.05);
      const b0 = edge.at(dOuter, yOuter, oBack);
      const b1 = edge.at(dTop, yTop, oBack);
      const b2 = edge.at(dTopUp, yTopUp, oBack);
      const b3 = edge.at(dOuterUp, yOuterUp, oBack);

      // Front sloped fascia
      this.quad(f0, f1, f2, f3, nOut, moldingHex);
      // Back sloped fascia
      this.quad(b1, b0, b3, b2, nIn, trimHex);
      // Upper weathering slope
      this.quad(f3, f2, b2, b3, [nxSlope, nySlope, nzSlope], moldingHex);
      // Shaded underside raking soffit
      this.quad(b0, b1, f1, f0, [-nxSlope, -nySlope, -nzSlope], soffitHex);
      // Outer eave return end cap
      this.quad(b0, f0, f3, b3, [side * edge.ux, 0, side * edge.uz], trimHex);
    }

    // Sculpted circular civic medallion boss centered in the tympanum
    const medY = yBase + rise * 0.42;
    const medR = Math.min(0.42, rise * 0.28);
    const oMed = oTymp + 0.08;
    const ctr = edge.at(dCenter, medY, oMed);
    const ringSegs = 8;
    for (let i = 0; i < ringSegs; i++) {
      const a0 = (i / ringSegs) * Math.PI * 2;
      const a1 = ((i + 1) / ringSegs) * Math.PI * 2;
      const p0 = edge.at(dCenter + Math.cos(a0) * medR, medY + Math.sin(a0) * medR, oMed);
      const p1 = edge.at(dCenter + Math.cos(a1) * medR, medY + Math.sin(a1) * medR, oMed);
      const b0 = edge.at(dCenter + Math.cos(a0) * medR, medY + Math.sin(a0) * medR, oTymp);
      const b1 = edge.at(dCenter + Math.cos(a1) * medR, medY + Math.sin(a1) * medR, oTymp);
      this.tri(ctr, p0, p1, nOut, emblemHex);
      const am = (a0 + a1) * 0.5;
      this.quad(b0, b1, p1, p0, [edge.ux * Math.cos(am), Math.sin(am), edge.uz * Math.cos(am)], trimHex);
    }

    // Modest central acroterion cap crowning the pediment apex
    this.edgeBox(edge, dCenter - 0.30, dCenter + 0.30, yBase + rise + 0.16, yBase + rise + 0.44, oBack + 0.04, oFront, moldingHex, {
      topColor: moldingHex, bottomColor: soffitHex, back: true,
    });
  }

  /** Appends an extruded BufferGeometry (e.g., clipped rooftop penthouse) with flat tint and disposes it. */
  appendGeometry(geometry, colorHex) {
    if (!geometry) return;
    const src = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    const posAttr = src.getAttribute('position');
    const normAttr = src.getAttribute('normal');
    const color = getColor(colorHex);
    for (let i = 0; i < posAttr.count; i++) {
      this.pos.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      this.norm.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      this.col.push(color.r, color.g, color.b);
    }
    if (src !== geometry) src.dispose();
    geometry.dispose();
  }

  toBufferGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function splitIntervals(length, blocked, margin = 0) {
  let spans = [[margin, length - margin]];
  for (const [lo, hi] of blocked) {
    spans = spans.flatMap(([a, b]) => {
      if (hi <= a || lo >= b) return [[a, b]];
      return [[a, Math.min(lo, b)], [Math.max(hi, a), b]].filter(([x, y]) => y - x > 0.15);
    });
  }
  return spans.filter(([x, y]) => y - x > 0.15);
}

function addInterval(map, key, lo, hi) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push([lo, hi]);
}

function clipRectToRoof(buildingPolygons, cx, cz, halfU, halfN, ux, uz, nx, nz) {
  const rect = [
    [-halfU, -halfN], [halfU, -halfN], [halfU, halfN], [-halfU, halfN], [-halfU, -halfN],
  ].map(([u, n]) => [cx + ux * u + nx * n, cz + uz * u + nz * n]);
  return polygonClipping.intersection(buildingPolygons, [[rect]]);
}

function minDistanceToPolygonRings(point, polygon) {
  let best = Infinity;
  for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) {
      const d = pointToSegmentDistance(point, ring[i - 1], ring[i]);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Finds candidate rooftop anchor positions strictly inside the mapped roof polygon
 * with guaranteed clearance from outer walls AND every inner courtyard hole.
 */
function findRoofAnchors(polygon, { minRoom = 2.0, count = 2, minSpacing = 4.5, avoid = [] } = {}) {
  const outer = polygon[0];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const width = maxX - minX, depth = maxZ - minZ;
  const candidates = [];
  const steps = 22;
  for (let ix = 1; ix < steps; ix++) {
    for (let iz = 1; iz < steps; iz++) {
      const pt = [minX + (width * ix) / steps, minZ + (depth * iz) / steps];
      if (!pointInPolygon(pt, polygon)) continue;
      const room = minDistanceToPolygonRings(pt, polygon);
      if (room < minRoom) continue;
      if (avoid.some(a => Math.hypot(pt[0] - a[0], pt[1] - a[1]) < minSpacing)) continue;
      candidates.push({ point: pt, room });
    }
  }
  candidates.sort((a, b) => b.room - a.room);
  const chosen = [];
  for (const cand of candidates) {
    if (chosen.length >= count) break;
    if (chosen.some(c => Math.hypot(cand.point[0] - c.point[0], cand.point[1] - c.point[1]) < minSpacing)) continue;
    chosen.push(cand);
  }
  return chosen;
}

/** Smooth coverage helper for procedural anti-aliased DataTextures (works in Node & browser). */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createBangladeshFlagTexture() {
  const w = 160, h = 96;
  const data = new Uint8Array(w * h * 4);
  // Official Bangladesh National Flag palette: deep bottle green #006a4e + crimson disc #f42a41
  const green = [0x00, 0x6a, 0x4e];
  const red = [0xf4, 0x2a, 0x41];
  const hoist = [0x06, 0x54, 0x3e];
  // Official 10:6 proportion: disc centered at 9/20 = 0.45 from hoist, radius = 0.20 of length
  const cx = 0.45 * w, cy = 0.50 * h, r = 0.20 * w;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      const discMask = 1 - smoothstep(r - 1.1, r + 1.1, dist);
      const isHoist = px < 4;
      const base = isHoist ? hoist : green;
      // Subtle cloth weave variation so the waving cloth catches light richly
      const weave = 0.97 + 0.03 * Math.sin(py * 0.9) * Math.cos(px * 0.45);
      const idx = (py * w + px) * 4;
      data[idx] = Math.round((base[0] * (1 - discMask) + red[0] * discMask) * weave);
      data[idx + 1] = Math.round((base[1] * (1 - discMask) + red[1] * discMask) * weave);
      data[idx + 2] = Math.round((base[2] * (1 - discMask) + red[2] * discMask) * weave);
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createUniversityFlagTexture() {
  const w = 160, h = 96;
  const data = new Uint8Array(w * h * 4);
  // Islamic University Flag: deep emerald #0f522e + warm gold border & central crest medallion #e5bc70
  const emerald = [0x0f, 0x52, 0x2e];
  const emeraldDark = [0x0a, 0x3d, 0x22];
  const gold = [0xe5, 0xbc, 0x70];
  const cx = 0.50 * w, cy = 0.50 * h;
  const rOuter = 0.255 * h;
  const rInner = 0.205 * h;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px + 0.5, y = py + 0.5;
      const dist = Math.hypot(x - cx, y - cy);

      // Crisp warm-gold double border frame inset cleanly from flag perimeter
      const inOuterBorder = (x >= 5 && x <= w - 5 && y >= 5 && y <= h - 5) &&
        !(x >= 8.5 && x <= w - 8.5 && y >= 8.5 && y <= h - 8.5);
      const inInnerHairline = (x >= 11 && x <= w - 11 && y >= 11 && y <= h - 11) &&
        !(x >= 12.6 && x <= w - 12.6 && y >= 12.6 && y <= h - 12.6);

      // Central crest medallion ring + ceremonial university emblem (open book + dome arch + star)
      const ringMask = smoothstep(rInner - 1.0, rInner + 0.7, dist) * (1 - smoothstep(rOuter - 0.7, rOuter + 1.0, dist));
      const innerHairRing = smoothstep(rInner - 4.2, rInner - 3.2, dist) * (1 - smoothstep(rInner - 2.6, rInner - 1.6, dist));

      // Local normalized coords inside medallion (y=0 bottom, y=1 top since DataTexture flipY=false)
      const lx = (x - cx) / rInner;
      const ly = (y - cy) / rInner;
      let emblemMask = 0;
      if (dist < rInner - 1.2) {
        // Open book pages along lower half of crest
        const bookCurve = -0.36 + 0.16 * Math.abs(lx);
        const inBook = Math.abs(lx) < 0.62 && ly > bookCurve - 0.16 && ly < bookCurve + 0.12 && Math.abs(lx) > 0.04;
        // Stylized campus dome / arch silhouette rising in center
        const domeR = Math.hypot(lx * 1.15, (ly - 0.05) * 1.05);
        const inArch = domeR < 0.46 && domeR > 0.30 && ly > -0.08;
        // Radiant academic star / finial at crown of crest
        const starDist = Math.hypot(lx, ly - 0.52);
        const inStar = starDist < 0.14;
        if (inBook || inArch || inStar) emblemMask = 1;
      }

      const goldMask = Math.min(1, (inOuterBorder || inInnerHairline ? 1 : 0) + ringMask + innerHairRing * 0.75 + emblemMask);
      const base = dist < rInner ? emeraldDark : emerald;
      const weave = 0.97 + 0.03 * Math.sin(py * 0.9) * Math.cos(px * 0.45);
      const idx = (py * w + px) * 4;
      data[idx] = Math.round((base[0] * (1 - goldMask) + gold[0] * goldMask) * weave);
      data[idx + 1] = Math.round((base[1] * (1 - goldMask) + gold[1] * goldMask) * weave);
      data[idx + 2] = Math.round((base[2] * (1 - goldMask) + gold[2] * goldMask) * weave);
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds twin brushed-steel ceremonial flagpoles with animated Bangladesh & Islamic University flags
 * strictly for Administration Building (relation/18079380).
 * Positioned flanking left & right of the clear entry walkway on the ceremonial forecourt terrace.
 */
function buildAdminFlagpoles(builder, edge, entry, height, palette, options = {}) {
  // Note: OSM service road 1317423239 asphalt starts ~2.36 m and curb ~1.80 m south of Admin's front wall.
  // Placing flagpoles at lateral = ±4.5 m, outward = 1.50 m (configurable via options.flagpoleOutward)
  // keeps both ceremonial pedestals strictly off the road curb/asphalt while flanking the entry portico cleanly.
  const outward = options.flagpoleOutward ?? 1.50;
  const lateral = Math.min(4.5, Math.max(2.6, Math.min(entry.distance - 1.2, edge.length - entry.distance - 1.2)));
  const poleHeight = Math.max(height + 1.85, 11.45);

  // Prevailing gentle breeze direction along front plaza, angled slightly outward so cloth never touches walls
  const bx = edge.ux * 0.96 + edge.nx * 0.28;
  const bz = edge.uz * 0.96 + edge.nz * 0.28;
  const bLen = Math.hypot(bx, bz) || 1;
  const tx = bx / bLen, tz = bz / bLen;
  const flagYaw = Math.atan2(-tz, tx);

  const flagSpecs = [
    {
      name: 'admin-flag-bangladesh',
      label: 'Bangladesh National Flag',
      side: 1, // heraldic right (viewer's left facing Administration Building)
      phase: 0.0,
      makeTexture: createBangladeshFlagTexture,
    },
    {
      name: 'admin-flag-islamic-university',
      label: 'Islamic University Flag',
      side: -1, // viewer's right facing Administration Building
      phase: 1.45,
      makeTexture: createUniversityFlagTexture,
    },
  ];

  const flagMeshes = [];
  const flagMaterials = [];
  const flagTextures = [];
  const flagAnimators = [];
  const flagDiagnostics = [];

  for (const fs of flagSpecs) {
    const pos = edge.at(entry.distance + fs.side * lateral, 0, outward);
    const px = pos[0], pz = pos[2];

    // Octagonal stone ceremonial pedestal + stepped collar
    builder.cylinder(px, pz, 0, 0.44, 0.28, 0.26, 8, palette.wallLight, palette.sandstone, { topColor: palette.wallLight });
    builder.cylinder(px, pz, 0.44, 0.58, 0.21, 0.18, 8, palette.sandstone, palette.sandstoneDeep, { topColor: palette.wallLight });
    // Tapered brushed-steel mast shaft + truck collar + brass finial orb
    builder.cylinder(px, pz, 0.58, poleHeight - 0.16, 0.072, 0.042, 8, palette.steelLight, palette.steelShade, { topColor: palette.steelLight });
    builder.cylinder(px, pz, poleHeight - 0.22, poleHeight - 0.12, 0.064, 0.064, 8, palette.steelShade, palette.steelLight, { topColor: palette.steelLight });
    builder.orb(px, poleHeight - 0.02, pz, 0.11, palette.brass, palette.sandstoneDeep);

    // Lightweight subdivided cloth mesh: PlaneGeometry(1.8, 1.08, 10, 4)
    const flagW = 1.8, flagH = 1.08;
    const flagGeo = new THREE.PlaneGeometry(flagW, flagH, 10, 4);
    const hoistOffset = 0.048;
    flagGeo.translate(flagW * 0.5 + hoistOffset, 0, 0);

    const posAttr = flagGeo.getAttribute('position');
    const baseXY = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      baseXY[i * 2] = posAttr.getX(i);
      baseXY[i * 2 + 1] = posAttr.getY(i);
    }

    const flagTex = fs.makeTexture();
    const flagMat = new THREE.MeshStandardMaterial({
      map: flagTex,
      roughness: 0.72,
      metalness: 0.02,
      envMapIntensity: 0.35,
      side: THREE.DoubleSide,
    });

    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.name = fs.name;
    flagMesh.castShadow = true;
    flagMesh.receiveShadow = true;
    const hoistY = poleHeight - 0.74;
    flagMesh.position.set(px, hoistY, pz);
    flagMesh.rotation.y = flagYaw;

    const applyWave = (t) => {
      for (let i = 0; i < posAttr.count; i++) {
        const bx0 = baseXY[i * 2];
        const by0 = baseXY[i * 2 + 1];
        const rawU = (bx0 - hoistOffset) / flagW;
        if (rawU < 1e-4) {
          // Strictly pinned at hoist (u = 0) so cloth stays attached to pole
          posAttr.setXYZ(i, bx0, by0, 0);
          continue;
        }
        const u = rawU;
        const amp = u * (0.42 + 0.58 * u);
        const primary = Math.sin(u * 5.2 - t * 4.4 + fs.phase) * 0.135 * amp;
        const flutter = Math.sin(u * 10.6 - t * 7.6 + by0 * 2.5 + fs.phase * 1.7) * 0.032 * amp;
        const yLift = Math.sin(u * 3.6 - t * 3.2 + fs.phase) * 0.022 * amp;
        const xPull = -0.026 * amp * amp;
        posAttr.setXYZ(i, bx0 + xPull, by0 + yLift, primary + flutter);
      }
      posAttr.needsUpdate = true;
      flagGeo.computeVertexNormals();
    };
    applyWave(0);

    flagMeshes.push(flagMesh);
    flagMaterials.push(flagMat);
    flagTextures.push(flagTex);
    flagAnimators.push(applyWave);
    flagDiagnostics.push({
      name: fs.name,
      label: fs.label,
      position: [px, 0, pz],
      hoistY,
      poleHeight,
      outward,
      lateralOffset: fs.side * lateral,
    });
  }

  return { flagMeshes, flagMaterials, flagTextures, flagAnimators, flagDiagnostics, maxExtent: outward + 0.34 };
}

/**
 * Adds a crisp recessed dark-reflective window bay with white/timber mullions,
 * sandstone/ivory surround, sill and lintel hood.
 */
function addMullionedWindow(builder, edge, dCenter, y0, y1, width, palette, {
  mullionHex = palette.mullion ?? palette.ivory ?? palette.ribLight,
  frameHex = palette.sandstone ?? palette.ivory ?? palette.ribLight,
  lintelHex = palette.sandstoneDeep ?? palette.terracotta ?? palette.accent,
  soffitHex = palette.soffit,
  verticalBars = 2,
  baseOut = 0.055,
  frameDepth = 0.14,
} = {}) {
  const hw = width * 0.5;
  if (hw < 0.25 || y1 - y0 < 0.45) return;
  const ft = 0.085;
  // Projecting sill & top lintel hood
  builder.edgeBox(edge, dCenter - hw - 0.10, dCenter + hw + 0.10, y0 - 0.10, y0, baseOut - 0.01, baseOut + frameDepth + 0.03, frameHex, {
    topColor: frameHex, bottomColor: soffitHex,
  });
  builder.edgeBox(edge, dCenter - hw - 0.10, dCenter + hw + 0.10, y1, y1 + 0.11, baseOut - 0.01, baseOut + frameDepth + 0.05, lintelHex, {
    topColor: frameHex, bottomColor: soffitHex,
  });
  // Left & right recessed jamb reveals
  builder.edgeBox(edge, dCenter - hw - ft, dCenter - hw, y0, y1, baseOut - 0.01, baseOut + frameDepth * 0.85, frameHex, {
    top: false, bottom: false,
  });
  builder.edgeBox(edge, dCenter + hw, dCenter + hw + ft, y0, y1, baseOut - 0.01, baseOut + frameDepth * 0.85, frameHex, {
    top: false, bottom: false,
  });
  // Recessed dark-reflective glass pane
  builder.edgeFace(edge, dCenter - hw, dCenter + hw, y0, y1, baseOut + 0.012, palette.glass);
  // Crisp mullions & upper transom bar
  const bar = 0.04;
  const mz = baseOut + 0.038;
  for (let i = 1; i <= verticalBars; i++) {
    const dx = -hw + (width * i) / (verticalBars + 1);
    builder.edgeFace(edge, dCenter + dx - bar * 0.5, dCenter + dx + bar * 0.5, y0, y1, mz, mullionHex);
  }
  const ty = y0 + (y1 - y0) * 0.68;
  builder.edgeFace(edge, dCenter - hw, dCenter + hw, ty - bar * 0.5, ty + bar * 0.5, mz, mullionHex);
}

/**
 * Adds a strictly roof-clipped rooftop stairhead/elevator penthouse core (mumty)
 * guaranteed never to overhang outer walls or inner courtyards.
 */
function addRooftopCore(builder, buildingPolygons, cx, cz, halfU, halfN, ux, uz, nx, nz, yBase, coreHeight, {
  wallHex, roofHex, accentHex, glassHex, soffitHex,
}) {
  const outerPolys = clipRectToRoof(buildingPolygons, cx, cz, halfU, halfN, ux, uz, nx, nz);
  if (!outerPolys.length) return [];
  const innerPolys = clipRectToRoof(buildingPolygons, cx, cz, Math.max(0.8, halfU - 0.24), Math.max(0.8, halfN - 0.24), ux, uz, nx, nz);
  const bodyPolys = innerPolys.length ? innerPolys : outerPolys;
  const slabH = 0.22;

  for (const poly of bodyPolys) {
    const body = buildingGeometry(poly, coreHeight);
    body.translate(0, yBase, 0);
    builder.appendGeometry(body, wallHex);
    for (const e of wallEdges(poly)) {
      if (e.length < 1.6) continue;
      // Crisp upper louver / clerestory accent band around the penthouse core
      const m = 0.25;
      builder.edgeBox(e, m, e.length - m, yBase + coreHeight * 0.52, yBase + coreHeight * 0.80, 0.01, 0.06, glassHex, {
        top: false, bottom: false,
      });
      builder.edgeBox(e, 0, e.length, yBase + coreHeight * 0.82, yBase + coreHeight * 0.94, 0.01, 0.09, accentHex, {
        topColor: accentHex, bottomColor: soffitHex,
      });
    }
  }
  for (const poly of outerPolys) {
    const soffit = buildingGeometry(poly, 0.06);
    soffit.translate(0, yBase + coreHeight - 0.06, 0);
    builder.appendGeometry(soffit, soffitHex);
    const roof = buildingGeometry(poly, slabH);
    roof.translate(0, yBase + coreHeight, 0);
    builder.appendGeometry(roof, roofHex);
  }
  return outerPolys;
}

/**
 * ARCHETYPE 1: Administration Building (relation/18079380) & New Administrative Building (way/929202651).
 * Formal civic cream-ivory & warm-sandstone classical architecture with grand ceremonial portico,
 * twin paired fluted columns, recessed coffered canopy soffit, classical central pediment crown,
 * executive veranda galleries across outer & courtyard walls, and twin waving flags on Admin.
 */
function buildCivicAdminArchitecture(builder, building, polygon, allEdges, entries, height, spec, options) {
  const pal = spec.palette;
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const parapetH = 0.86;
  const copingH = 0.11;

  const entryApertureByEdge = new Map();
  const porticoBlockedByEdge = new Map();
  const entryDetails = [];

  let porticoCount = 0, pedimentCount = 0, pilasterCount = 0, columnCount = 0, windowBayCount = 0;
  let maxHorizontalExtent = 0.32;
  let roofRise = parapetH + copingH;

  // 1. GRAND CEREMONIAL FRONT PORTICO + CLASSICAL CENTRAL PEDIMENT CROWN
  entries.forEach((entry, idx) => {
    const { edge, distance, source } = entry;
    const edgeIdx = allEdges.indexOf(edge);
    const availLeft = distance - 0.45;
    const availRight = edge.length - distance - 0.45;
    const halfRoom = Math.min(availLeft, availRight);

    const clearHalf = Math.min(1.55, Math.max(1.15, halfRoom * 0.42));
    const colInnerD = clearHalf + 0.30;
    const colOuterD = Math.min(halfRoom - 0.35, clearHalf + 1.10);
    const usePairedCols = colOuterD - colInnerD >= 0.52;
    const porticoHalf = Math.min(halfRoom, (usePairedCols ? colOuterD : colInnerD) + 0.48);

    const canopyY = Math.min(height - 1.4, 3.28);
    const canopyOut = 1.42;
    const colOut = 1.12;
    maxHorizontalExtent = Math.max(maxHorizontalExtent, canopyOut + 0.10);

    // Paired fluted classical entrance columns flanking left & right of 100% open ground-level entry!
    const colOffsets = usePairedCols
      ? [-colOuterD, -colInnerD, colInnerD, colOuterD]
      : [-colInnerD, colInnerD];
    for (const dx of colOffsets) {
      const colD = distance + dx;
      const worldPt = edge.at(colD, 0, colOut);
      // Stepped square plinth base + Attic collar + 8-sided fluted shaft + classical Doric/Ionic abacus capital
      builder.edgeBox(edge, colD - 0.25, colD + 0.25, 0, 0.44, colOut - 0.25, colOut + 0.25, pal.sandstone, {
        topColor: pal.wallLight, bottom: false, back: true,
      });
      builder.cylinder(worldPt[0], worldPt[2], 0.44, 0.56, 0.20, 0.17, 8, pal.wallLight, pal.sandstone, { topColor: pal.wallLight });
      builder.cylinder(worldPt[0], worldPt[2], 0.56, canopyY - 0.22, 0.165, 0.145, 8, pal.wallLight, pal.sandstone, { topColor: null });
      builder.cylinder(worldPt[0], worldPt[2], canopyY - 0.22, canopyY - 0.10, 0.16, 0.21, 8, pal.sandstone, pal.sandstoneDeep, { topColor: pal.wallLight });
      builder.edgeBox(edge, colD - 0.24, colD + 0.24, canopyY - 0.10, canopyY, colOut - 0.24, colOut + 0.24, pal.wallLight, {
        topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
      });
      columnCount++;

      // Matching engaged wall pilaster behind each portico column (strictly outside clear entry!)
      builder.edgeBox(edge, colD - 0.18, colD + 0.18, 0.44, canopyY, 0.02, 0.24, pal.wallLight, {
        sideColor: pal.sandstone, top: false, bottom: false,
      });
      pilasterCount++;
    }

    // Stepped projecting concrete canopy slab with recessed coffered soffit (strictly above y = 3.28 m!)
    // Perimeter downstand fascia beams creating a true recessed coffered soffit underneath
    const soffitRecessY = canopyY + 0.12;
    builder.edgeBox(edge, distance - porticoHalf, distance + porticoHalf, canopyY, canopyY + 0.34, canopyOut - 0.26, canopyOut, pal.wallMain, {
      topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
    });
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? distance - porticoHalf : distance + porticoHalf - 0.26;
      builder.edgeBox(edge, x0, x0 + 0.26, canopyY, canopyY + 0.34, 0.02, canopyOut - 0.26, pal.wallMain, {
        topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
      });
    }
    // Recessed coffered soffit ceiling plate + transverse coffer ribs
    builder.edgeBox(edge, distance - porticoHalf + 0.24, distance + porticoHalf - 0.24, soffitRecessY, canopyY + 0.34, 0.02, canopyOut - 0.24, pal.sandstone, {
      topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
    });
    for (const ribX of [-clearHalf * 0.55, 0, clearHalf * 0.55]) {
      builder.edgeBox(edge, distance + ribX - 0.07, distance + ribX + 0.07, canopyY + 0.01, soffitRecessY, 0.06, canopyOut - 0.24, pal.wallLight, {
        bottomColor: pal.soffit, sideColor: pal.sandstone, top: false, back: true,
      });
    }
    // Stepped upper projecting canopy cornice lip + sandstone entablature band
    builder.edgeBox(edge, distance - porticoHalf - 0.10, distance + porticoHalf + 0.10, canopyY + 0.34, canopyY + 0.48, 0.02, canopyOut + 0.09, pal.wallLight, {
      topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
    });
    builder.edgeBox(edge, distance - porticoHalf - 0.02, distance + porticoHalf + 0.02, canopyY + 0.20, canopyY + 0.31, canopyOut - 0.02, canopyOut + 0.03, pal.sandstoneDeep, {
      top: false, bottom: false,
    });

    // Executive balcony balustrade above the portico canopy
    const balBase = canopyY + 0.48;
    const balTop = balBase + 0.72;
    if (balTop < height - 0.8) {
      builder.edgeBox(edge, distance - porticoHalf, distance + porticoHalf, balTop - 0.10, balTop, canopyOut - 0.18, canopyOut + 0.02, pal.wallLight, {
        topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
      });
      for (const side of [-1, 1]) {
        const bx = side < 0 ? distance - porticoHalf : distance + porticoHalf - 0.18;
        builder.edgeBox(edge, bx, bx + 0.18, balTop - 0.10, balTop, 0.02, canopyOut - 0.18, pal.wallLight, {
          topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
        });
      }
      const postCount = Math.max(4, Math.round((porticoHalf * 2) / 0.68));
      for (let p = 0; p <= postCount; p++) {
        const pd = distance - porticoHalf + 0.12 + ((porticoHalf * 2 - 0.24) * p) / postCount;
        const isEnd = p === 0 || p === postCount;
        const pw = isEnd ? 0.14 : 0.055;
        builder.edgeBox(edge, pd - pw, pd + pw, balBase, balTop - 0.10, canopyOut - 0.14, canopyOut - 0.02, isEnd ? pal.sandstone : pal.wallLight, {
          top: false, bottom: false, back: true,
        });
      }
    }

    // Upper ceremonial facade bay above canopy: full-height framing pilasters + executive windows
    for (const side of [-1, 1]) {
      const pd = distance + side * (porticoHalf - 0.22);
      builder.edgeBox(edge, pd - 0.22, pd + 0.22, canopyY + 0.48, height - 0.34, 0.02, 0.24, pal.wallLight, {
        sideColor: pal.sandstone, top: false, bottom: false,
      });
      pilasterCount++;
    }
    for (let f = 1; f < floors; f++) {
      const wy0 = Math.max(canopyY + 0.72, f * floorH + 0.85);
      const wy1 = Math.min(height - 0.62, (f + 1) * floorH - 0.52);
      if (wy1 - wy0 >= 0.65) {
        addMullionedWindow(builder, edge, distance, wy0, wy1, Math.min(2.7, clearHalf * 1.65), pal, {
          verticalBars: 3, baseOut: 0.055, frameDepth: 0.16,
        });
        windowBayCount++;
      }
    }

    // Dignified Classical Central Pediment Crown above the roofline (on primary entrance!)
    if (idx === 0) {
      const pedHalf = Math.min(halfRoom - 0.2, edge.length >= 30 ? 5.2 : 4.2);
      const pedRise = Math.min(1.65, pedHalf * 0.34);
      const entabH = 0.56;
      // Classical entablature frieze plinth supporting pediment above roof
      builder.edgeBox(edge, distance - pedHalf - 0.18, distance + pedHalf + 0.18, height, height + entabH, -0.46, 0.18, pal.wallMain, {
        topColor: pal.wallLight, bottom: false, back: true,
      });
      builder.edgeBox(edge, distance - pedHalf - 0.10, distance + pedHalf + 0.10, height + 0.16, height + entabH - 0.14, 0.16, 0.22, pal.sandstoneDeep, {
        top: false, bottom: false,
      });
      builder.edgeClassicalPediment(edge, distance, height + entabH, pedHalf, pedRise, -0.46, 0.24, {
        tympanumHex: pal.sandstone,
        moldingHex: pal.wallLight,
        trimHex: pal.sandstoneDeep,
        soffitHex: pal.soffit,
        emblemHex: pal.brass,
      });
      pedimentCount++;
      roofRise = Math.max(roofRise, entabH + pedRise + 0.44);
    }

    addInterval(entryApertureByEdge, edgeIdx, distance - clearHalf - 0.04, distance + clearHalf + 0.04);
    addInterval(porticoBlockedByEdge, edgeIdx, distance - porticoHalf - 0.20, distance + porticoHalf + 0.20);
    porticoCount++;

    entryDetails.push({
      center: edge.at(distance, 0, 0),
      source,
      clearWidth: clearHalf * 2,
      canopyHeight: canopyY,
      surveyed: source === 'surveyed',
    });
  });

  // 2. RECESSED EXECUTIVE VERANDA GALLERIES, PILASTERS, CORNICES & PARAPET ACROSS OUTER & COURTYARD WALLS
  for (let ei = 0; ei < allEdges.length; ei++) {
    const edge = allEdges[ei];
    const isCourtyard = edge.ringIndex > 0;
    const apertures = entryApertureByEdge.get(ei) ?? [];
    const porticoBlocked = porticoBlockedByEdge.get(ei) ?? [];

    // Grounded stone plinth skirt (strictly open across entry apertures!)
    for (const [a, b] of splitIntervals(edge.length, apertures, 0)) {
      builder.edgeBox(edge, a, b, 0, 0.46, 0.01, 0.14, pal.plinth, {
        topColor: pal.sandstone, bottom: false,
      });
    }

    // Cream-ivory stucco facade cladding skin (strictly open across ground-level entry apertures!)
    for (const [a, b] of splitIntervals(edge.length, apertures, 0)) {
      builder.edgeFace(edge, a, b, 0.46, Math.min(height, 3.28), 0.032, pal.wallMain);
    }
    if (height > 3.28) {
      builder.edgeFace(edge, 0, edge.length, 3.28, height - 0.34, 0.032, pal.wallMain);
    }

    // Horizontal classical cornice belts between storeys
    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      const spans = f === 1 ? splitIntervals(edge.length, porticoBlocked, 0) : [[0, edge.length]];
      for (const [a, b] of spans) {
        builder.edgeBox(edge, a, b, fy - 0.13, fy + 0.11, 0.01, isCourtyard ? 0.16 : 0.20, pal.sandstone, {
          topColor: pal.wallLight, bottomColor: pal.soffit,
        });
      }
    }

    // Stepped classical main roof entablature cornice
    builder.edgeBox(edge, 0, edge.length, height - 0.36, height - 0.16, 0.01, isCourtyard ? 0.14 : 0.18, pal.sandstoneDeep, {
      top: false, bottomColor: pal.soffit,
    });
    builder.edgeBox(edge, 0, edge.length, height - 0.16, height + 0.05, 0.01, isCourtyard ? 0.22 : 0.28, pal.wallLight, {
      topColor: pal.wallLight, bottomColor: pal.soffit,
    });

    // Stepped classical roof parapet wall + coping tracing every outer AND courtyard ring
    if (edge.length >= 0.8) {
      builder.edgeBox(edge, 0, edge.length, height + 0.05, height + parapetH, -0.26, 0.04, pal.wallMain, {
        top: false, bottom: false, back: true,
      });
      if (edge.length >= 5.0) {
        // Recessed sandstone accent panel strip along parapet face
        builder.edgeFace(edge, 0.5, edge.length - 0.5, height + 0.24, height + parapetH - 0.18, 0.052, pal.sandstone);
      }
      builder.edgeBox(edge, 0, edge.length, height + parapetH, height + parapetH + copingH, -0.32, 0.10, pal.wallLight, {
        topColor: pal.wallLight, bottomColor: pal.soffit, back: true,
      });
    }

    // Columned facade bays, fluted pilasters & recessed executive veranda gallery windows
    if (edge.length >= 3.4) {
      const bayTarget = isCourtyard ? 4.4 : 4.2;
      const bayCount = Math.max(1, Math.floor(edge.length / bayTarget));
      const bayStep = edge.length / bayCount;
      const endMargin = isCourtyard ? 0.36 : 0.24;

      for (let i = 0; i <= bayCount; i++) {
        const pd = i === 0 ? endMargin : i === bayCount ? edge.length - endMargin : i * bayStep;
        if (porticoBlocked.some(([lo, hi]) => pd >= lo - 0.25 && pd <= hi + 0.25)) continue;
        // Full-height classical pilaster with base plinth and sandstone capital band
        builder.edgeBox(edge, pd - 0.16, pd + 0.16, 0.46, height - 0.36, 0.02, isCourtyard ? 0.16 : 0.19, pal.wallLight, {
          sideColor: pal.sandstone, top: false, bottom: false,
        });
        builder.edgeBox(edge, pd - 0.20, pd + 0.20, height - 0.52, height - 0.36, 0.02, isCourtyard ? 0.20 : 0.23, pal.sandstoneDeep, {
          top: false, bottomColor: pal.soffit,
        });
        pilasterCount++;
      }

      for (let b = 0; b < bayCount; b++) {
        const centerD = (b + 0.5) * bayStep;
        const winW = Math.min(2.35, bayStep * 0.58);
        if (porticoBlocked.some(([lo, hi]) => centerD + winW * 0.5 + 0.22 > lo && centerD - winW * 0.5 - 0.22 < hi)) continue;
        for (let f = 0; f < floors; f++) {
          const fy0 = f * floorH;
          const wy0 = fy0 + (f === 0 ? 1.02 : 0.94);
          const wy1 = Math.min(height - 0.62, fy0 + floorH - 0.48);
          if (wy1 - wy0 < 0.65) continue;
          // Recessed veranda gallery dado spandrel apron below sill
          builder.edgeBox(edge, centerD - winW * 0.5 - 0.08, centerD + winW * 0.5 + 0.08, fy0 + (f === 0 ? 0.48 : 0.14), wy0 - 0.10, 0.02, 0.075, pal.sandstone, {
            top: false, bottom: false,
          });
          addMullionedWindow(builder, edge, centerD, wy0, wy1, winW, pal, {
            verticalBars: winW >= 1.9 ? 2 : 1,
            baseOut: 0.048,
            frameDepth: isCourtyard ? 0.11 : 0.14,
          });
          windowBayCount++;
        }
      }
    }
  }

  // 3. MODEST ROOFTOP STAIRHEAD CORE (clipped strictly inside roof polygon away from courtyard!)
  const roofAnchors = findRoofAnchors(polygon, { minRoom: 2.8, count: 1 });
  let penthousePolygons = [];
  if (roofAnchors.length) {
    const refEdge = entries[0].edge;
    const anchor = roofAnchors[0];
    const coreH = 2.0;
    penthousePolygons = addRooftopCore(
      builder, building.polygons,
      anchor.point[0], anchor.point[1],
      Math.min(3.4, anchor.room * 0.72), Math.min(2.6, anchor.room * 0.62),
      refEdge.ux, refEdge.uz, refEdge.nx, refEdge.nz,
      height, coreH,
      {
        wallHex: pal.wallMain,
        roofHex: pal.wallLight,
        accentHex: pal.sandstoneDeep,
        glassHex: pal.glass,
        soffitHex: pal.soffit,
      }
    );
    if (penthousePolygons.length) roofRise = Math.max(roofRise, coreH + 0.22);
  }

  // 4. TWIN TALL BRUSHED-STEEL FLAGPOLES WITH ANIMATED WAVING FLAGS (Admin Building relation/18079380 ONLY!)
  let flagResult = { flagMeshes: [], flagMaterials: [], flagTextures: [], flagAnimators: [], flagDiagnostics: [], maxExtent: 0 };
  if (spec.hasFlagpoles && entries.length) {
    flagResult = buildAdminFlagpoles(builder, entries[0].edge, entries[0], height, pal, options);
    maxHorizontalExtent = Math.max(maxHorizontalExtent, flagResult.maxExtent);
    const maxFlagTop = Math.max(...flagResult.flagDiagnostics.map(f => f.poleHeight + 0.12));
    roofRise = Math.max(roofRise, maxFlagTop - height);
  }

  return {
    roofRise,
    maxHorizontalExtent,
    entryDetails,
    flagResult,
    features: {
      porticoCount,
      pedimentCount,
      pilasterCount,
      columnCount,
      archCount: 0,
      windowBayCount,
      chajjaCount: 0,
      finCount: 0,
      stairCoreCount: penthousePolygons.length ? 1 : 0,
      penthousePolygons,
      waterTankCount: 0,
      flagpoleCount: flagResult.flagDiagnostics.length,
      flags: flagResult.flagDiagnostics,
    },
  };
}

/**
 * ARCHETYPE 2: Rabindra–Nazrul Arts Building (relation/18079382).
 * Warm cultural terracotta-cream & brick-ochre architecture with deep rhythmic double-columned
 * recessed arcade galleries along outer AND both inner courtyard walls, graceful upper arches,
 * horizontal floor-slab bands with shaded soffits, wooden-tone mullions, shaded entrance portico,
 * and terracotta-trimmed roof parapet + rooftop stairhead core.
 */
function buildCulturalArtsArchitecture(builder, building, polygon, allEdges, entries, height, spec) {
  const pal = spec.palette;
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const parapetH = 0.88;
  const copingH = 0.12;

  const entryApertureByEdge = new Map();
  const porticoBlockedByEdge = new Map();
  const entryDetails = [];

  let porticoCount = 0, columnCount = 0, archCount = 0, windowBayCount = 0;
  let maxHorizontalExtent = 0.34;
  let roofRise = parapetH + copingH;

  // 1. SHADED CULTURAL ENTRANCE PORTICO CANOPY (100% open at ground level!)
  entries.forEach((entry) => {
    const { edge, distance, source } = entry;
    const edgeIdx = allEdges.indexOf(edge);
    const halfRoom = Math.min(distance - 0.35, edge.length - distance - 0.35);

    const clearHalf = Math.min(1.48, Math.max(1.12, halfRoom * 0.40));
    const colInner = clearHalf + 0.28;
    const colOuter = Math.min(halfRoom - 0.30, colInner + 0.62);
    const usePaired = colOuter - colInner >= 0.42;
    const porticoHalf = Math.min(halfRoom, (usePaired ? colOuter : colInner) + 0.42);

    const canopyY = Math.min(height - 1.2, 3.26);
    const canopyOut = 1.52;
    const colOut = 1.24;
    maxHorizontalExtent = Math.max(maxHorizontalExtent, canopyOut + 0.10);

    // Paired ivory-and-terracotta square entrance arcade columns flanking clear entry opening
    const colOffsets = usePaired ? [-colOuter, -colInner, colInner, colOuter] : [-colInner, colInner];
    for (const dx of colOffsets) {
      const cd = distance + dx;
      builder.edgeBox(edge, cd - 0.20, cd + 0.20, 0, 0.48, colOut - 0.20, colOut + 0.20, pal.terracotta, {
        topColor: pal.ivory, bottom: false, back: true,
      });
      builder.edgeBox(edge, cd - 0.15, cd + 0.15, 0.48, canopyY - 0.16, colOut - 0.15, colOut + 0.15, pal.ivory, {
        sideColor: pal.wallMain, top: false, bottom: false, back: true,
      });
      builder.edgeBox(edge, cd - 0.20, cd + 0.20, canopyY - 0.16, canopyY, colOut - 0.20, colOut + 0.20, pal.terracotta, {
        topColor: pal.ivory, bottomColor: pal.soffit, back: true,
      });
      columnCount++;
    }

    // Stepped shaded cultural entrance canopy with terracotta fascia frieze & shaded soffit
    builder.edgeBox(edge, distance - porticoHalf, distance + porticoHalf, canopyY, canopyY + 0.32, 0.02, canopyOut, pal.ivory, {
      topColor: pal.ivoryCap, bottomColor: pal.soffit, back: true,
    });
    builder.edgeBox(edge, distance - porticoHalf - 0.08, distance + porticoHalf + 0.08, canopyY + 0.32, canopyY + 0.46, 0.02, canopyOut + 0.08, pal.terracotta, {
      topColor: pal.ivoryCap, bottomColor: pal.soffit, back: true,
    });
    // Decorative pointed cultural arch motif crowning the entrance canopy edge
    builder.edgeArchRim(edge, distance, canopyY + 0.46, Math.min(1.65, clearHalf * 1.05), 0.72, 0.18, canopyOut - 0.22, canopyOut + 0.04, pal.ivory, pal.terracottaDeep, {
      pointed: true, segments: 6,
    });
    archCount++;

    // Upper arts-gallery arched bays directly above entrance canopy
    for (let f = 1; f < floors; f++) {
      const fy0 = f * floorH;
      const archBottom = fy0 + 0.92;
      const springY = Math.min(height - 0.95, fy0 + floorH - 1.15);
      const bayHalf = Math.min(1.45, clearHalf * 0.92);
      if (springY > archBottom + 0.4) {
        addMullionedWindow(builder, edge, distance, archBottom, springY + 0.38, bayHalf * 1.6, pal, {
          mullionHex: pal.woodMullion, frameHex: pal.ivory, lintelHex: pal.terracotta, verticalBars: 2, baseOut: 0.048, frameDepth: 0.11,
        });
        builder.edgeArchRim(edge, distance, springY, bayHalf, 0.76, 0.16, 0.05, 0.26, pal.ivory, pal.terracottaDeep, {
          pointed: true, segments: 6,
        });
        archCount++;
        windowBayCount++;
      }
    }

    addInterval(entryApertureByEdge, edgeIdx, distance - clearHalf - 0.04, distance + clearHalf + 0.04);
    addInterval(porticoBlockedByEdge, edgeIdx, distance - porticoHalf - 0.18, distance + porticoHalf + 0.18);
    porticoCount++;

    entryDetails.push({
      center: edge.at(distance, 0, 0),
      source,
      clearWidth: clearHalf * 2,
      canopyHeight: canopyY,
      surveyed: source === 'surveyed',
    });
  });

  // 2. DOUBLE-COLUMNED RECESSED ARCADE GALLERIES, UPPER ARCHES & FLOOR-SLAB BANDS (OUTER + BOTH COURTYARDS!)
  for (let ei = 0; ei < allEdges.length; ei++) {
    const edge = allEdges[ei];
    const isCourtyard = edge.ringIndex > 0;
    const apertures = entryApertureByEdge.get(ei) ?? [];
    const porticoBlocked = porticoBlockedByEdge.get(ei) ?? [];

    // Grounded warm brick-stone base plinth (strictly open across entry apertures!)
    for (const [a, b] of splitIntervals(edge.length, apertures, 0)) {
      builder.edgeBox(edge, a, b, 0, 0.44, 0.01, 0.14, pal.plinth, {
        topColor: pal.terracotta, bottom: false,
      });
    }

    // Warm terracotta-cream plaster cladding skin (strictly open across ground-level entries!)
    for (const [a, b] of splitIntervals(edge.length, apertures, 0)) {
      builder.edgeFace(edge, a, b, 0.44, Math.min(height, 3.26), 0.032, pal.wallMain);
    }
    if (height > 3.26) {
      builder.edgeFace(edge, 0, edge.length, 3.26, height - 0.26, 0.032, pal.wallMain);
    }

    // Projecting horizontal concrete floor-slab bands with shaded soffits & terracotta edge accent
    const slabProj = isCourtyard ? 0.24 : 0.30;
    for (let f = 1; f <= floors; f++) {
      const fy = f === floors ? height : f * floorH;
      const spans = f === 1 ? splitIntervals(edge.length, porticoBlocked, 0) : [[0, edge.length]];
      for (const [a, b] of spans) {
        builder.edgeBox(edge, a, b, fy - 0.22, fy + 0.04, 0.01, slabProj, pal.ivory, {
          topColor: pal.ivoryCap, bottomColor: pal.soffit,
        });
        builder.edgeFace(edge, a, b, fy - 0.14, fy - 0.04, slabProj + 0.008, pal.terracotta);
      }
    }

    // Terracotta-trimmed roof parapet tracing outer AND both courtyard rings!
    if (edge.length >= 0.8) {
      builder.edgeBox(edge, 0, edge.length, height + 0.04, height + parapetH, -0.26, 0.04, pal.ivory, {
        top: false, bottom: false, back: true,
      });
      if (edge.length >= 2.2) {
        builder.edgeFace(edge, 0.18, edge.length - 0.18, height + 0.22, height + parapetH - 0.18, 0.052, pal.terracotta);
      }
      builder.edgeBox(edge, 0, edge.length, height + parapetH, height + parapetH + copingH, -0.30, 0.09, pal.terracottaDeep, {
        topColor: pal.terracotta, bottomColor: pal.soffit, back: true,
      });
    }

    // Deep rhythmic double-columned recessed arcade galleries along outer AND courtyard walls
    if (edge.length >= 4.0) {
      const bayTarget = isCourtyard ? 5.3 : 5.2;
      const bayCount = Math.max(1, Math.floor(edge.length / bayTarget));
      const bayStep = edge.length / bayCount;
      const colProj = isCourtyard ? 0.22 : 0.27;
      const endMargin = isCourtyard ? 0.42 : 0.34;

      // Twin double-column piers along bay boundaries (standing proud of recessed gallery glazing)
      for (let i = 0; i <= bayCount; i++) {
        const centerD = i === 0 ? endMargin : i === bayCount ? edge.length - endMargin : i * bayStep;
        if (porticoBlocked.some(([lo, hi]) => centerD >= lo - 0.30 && centerD <= hi + 0.30)) continue;
        // Double column: twin slender ivory shafts separated by a crisp recessed shadow gap
        const isInteriorPier = i > 0 && i < bayCount;
        const pairOffsets = isInteriorPier ? [-0.15, 0.15] : [0];
        for (const ox of pairOffsets) {
          const pd = centerD + ox;
          builder.edgeBox(edge, pd - 0.09, pd + 0.09, 0.44, height - 0.22, 0.03, colProj, pal.ivory, {
            sideColor: pal.wallMain, top: false, bottom: false,
          });
          columnCount++;
        }
        // Shared terracotta-ochre pedestal base linking the double-column pair
        const padW = isInteriorPier ? 0.30 : 0.16;
        builder.edgeBox(edge, centerD - padW, centerD + padW, 0.44, 0.72, 0.03, colProj + 0.03, pal.terracotta, {
          topColor: pal.ivory, bottom: false,
        });
      }

      // Recessed glazed bays + terracotta gallery balustrade + upper segmental/pointed arches
      for (let b = 0; b < bayCount; b++) {
        const bayD = (b + 0.5) * bayStep;
        const innerSpan = Math.min(3.8, bayStep - 0.72);
        if (innerSpan < 1.4) continue;
        if (porticoBlocked.some(([lo, hi]) => bayD + innerSpan * 0.5 + 0.16 > lo && bayD - innerSpan * 0.5 - 0.16 < hi)) continue;

        for (let f = 0; f < floors; f++) {
          const fy0 = f * floorH;
          const dadoTop = fy0 + (f === 0 ? 0.96 : 0.92);
          const bayTop = Math.min(height - 0.28, (f + 1) * floorH - 0.24);
          if (bayTop - dadoTop < 0.9) continue;

          // Terracotta-brick gallery balustrade apron along lower bay
          builder.edgeBox(edge, bayD - innerSpan * 0.5, bayD + innerSpan * 0.5, fy0 + (f === 0 ? 0.46 : 0.06), dadoTop, 0.04, colProj - 0.03, pal.terracotta, {
            topColor: pal.ivory, bottom: false,
          });
          // Recessed dark glazed gallery wall with warm wooden-tone mullions
          const winW = innerSpan * 0.78;
          const winTop = f >= 1 ? bayTop - 0.52 : bayTop - 0.18;
          builder.edgeFace(edge, bayD - winW * 0.5, bayD + winW * 0.5, dadoTop + 0.04, winTop, 0.046, pal.glass);
          // Warm wooden-tone vertical & transom mullions
          const mBar = 0.042;
          const mZ = 0.064;
          for (const frac of [-0.5, -0.17, 0.17, 0.5]) {
            const mx = bayD + winW * frac;
            builder.edgeFace(edge, mx - mBar * 0.5, mx + mBar * 0.5, dadoTop + 0.04, winTop, mZ, pal.woodMullion);
          }
          const transY = dadoTop + (winTop - dadoTop) * 0.66;
          builder.edgeFace(edge, bayD - winW * 0.5, bayD + winW * 0.5, transY - mBar * 0.5, transY + mBar * 0.5, mZ, pal.woodMullion);
          windowBayCount++;

          // Graceful segmental/pointed decorative arches along upper gallery corridors (f >= 1)
          if (f >= 1) {
            const rise = Math.min(0.72, (bayTop - dadoTop) * 0.34);
            const springY = bayTop - rise;
            builder.edgeArchRim(edge, bayD, springY, innerSpan * 0.5, rise, 0.15, 0.06, colProj - 0.01, pal.ivory, pal.terracottaDeep, {
              pointed: true, segments: 5,
            });
            archCount++;
          }
        }
      }
    }
  }

  // 3. ROOFTOP STAIRHEAD CORE SAFELY INSIDE ROOF POLYGON (strictly clear of both courtyards!)
  const roofAnchors = findRoofAnchors(polygon, { minRoom: 2.6, count: 1 });
  let penthousePolygons = [];
  if (roofAnchors.length) {
    const refEdge = entries[0].edge;
    const anchor = roofAnchors[0];
    const coreH = 2.25;
    penthousePolygons = addRooftopCore(
      builder, building.polygons,
      anchor.point[0], anchor.point[1],
      Math.min(3.6, anchor.room * 0.72), Math.min(2.8, anchor.room * 0.62),
      refEdge.ux, refEdge.uz, refEdge.nx, refEdge.nz,
      height, coreH,
      {
        wallHex: pal.wallMain,
        roofHex: pal.ivoryCap,
        accentHex: pal.terracotta,
        glassHex: pal.glass,
        soffitHex: pal.soffit,
      }
    );
    if (penthousePolygons.length) roofRise = Math.max(roofRise, coreH + 0.22);
  }

  return {
    roofRise,
    maxHorizontalExtent,
    entryDetails,
    flagResult: { flagMeshes: [], flagMaterials: [], flagTextures: [], flagAnimators: [], flagDiagnostics: [] },
    features: {
      porticoCount,
      pedimentCount: 0,
      pilasterCount: 0,
      columnCount,
      archCount,
      windowBayCount,
      chajjaCount: 0,
      finCount: 0,
      stairCoreCount: penthousePolygons.length ? 1 : 0,
      penthousePolygons,
      waterTankCount: 0,
      flagpoleCount: 0,
      flags: [],
    },
  };
}

/**
 * ARCHETYPE 3: Ibn Sina Science Building (relation/18079384, 5 storeys / 16 m, 2 courtyards)
 * & Business Administration Building (relation/18079386, 6 storeys / 19.2 m, 1 courtyard).
 * Modern multi-storey Bangladeshi institutional tower architecture featuring continuous projecting
 * horizontal concrete chajja / brise-soleil ledges, rhythmic full-height vertical solar shading fins,
 * tall vertical glazed staircase/elevator core rising into a crisp rooftop elevator penthouse,
 * cylindrical overhead water tanks, open ground-floor columned entrance canopy, and parapet coping.
 */
function buildModernTowerArchitecture(builder, building, polygon, allEdges, entries, height, spec) {
  const pal = spec.palette;
  const floors = Math.max(4, Math.round(height / 3.2));
  const floorH = height / floors;
  const parapetH = 0.90;
  const copingH = 0.12;
  const isScience = spec.key === 'ibnSina';

  const entryApertureByEdge = new Map();
  const porticoBlockedByEdge = new Map();
  const entryDetails = [];

  let porticoCount = 0, columnCount = 0, windowBayCount = 0;
  let chajjaCount = 0, finCount = 0, stairCoreCount = 0, waterTankCount = 0;
  let maxHorizontalExtent = 0.44;
  let roofRise = parapetH + copingH;
  const penthousePolygons = [];
  const coreAvoidPoints = [];

  // 1. OPEN GROUND-FLOOR COLUMNED ENTRANCE CANOPY + TALL VERTICAL GLAZED STAIRCASE/ELEVATOR CORE BAY + ROOFTOP PENTHOUSE
  entries.forEach((entry, idx) => {
    const { edge, distance, source } = entry;
    const edgeIdx = allEdges.indexOf(edge);
    const halfRoom = Math.min(distance - 0.35, edge.length - distance - 0.35);

    const clearHalf = Math.min(1.50, Math.max(1.15, halfRoom * 0.40));
    const colInner = clearHalf + 0.28;
    const colOuter = Math.min(halfRoom - 0.32, colInner + 0.88);
    const usePaired = colOuter - colInner >= 0.48;
    const porticoHalf = Math.min(halfRoom, (usePaired ? colOuter : colInner) + 0.45);

    const canopyY = Math.min(height - 2.0, 3.32);
    const canopyOut = 1.48;
    const colOut = 1.22;
    maxHorizontalExtent = Math.max(maxHorizontalExtent, canopyOut + 0.08);

    // Sleek modern square entrance columns flanking 100% open ground-floor walkway
    const colOffsets = usePaired ? [-colOuter, -colInner, colInner, colOuter] : [-colInner, colInner];
    for (const dx of colOffsets) {
      const cd = distance + dx;
      builder.edgeBox(edge, cd - 0.21, cd + 0.21, 0, 0.48, colOut - 0.21, colOut + 0.21, pal.plinth, {
        topColor: pal.ribLight, bottom: false, back: true,
      });
      builder.edgeBox(edge, cd - 0.16, cd + 0.16, 0.48, canopyY - 0.14, colOut - 0.16, colOut + 0.16, pal.ribLight, {
        sideColor: pal.wallMain, top: false, bottom: false, back: true,
      });
      builder.edgeBox(edge, cd - 0.19, cd + 0.19, canopyY - 0.14, canopyY, colOut - 0.19, colOut + 0.19, pal.accent, {
        top: false, bottomColor: pal.soffit, back: true,
      });
      columnCount++;
    }

    // Crisp horizontal projecting modern entrance canopy slab with accent fascia ribbon
    builder.edgeBox(edge, distance - porticoHalf, distance + porticoHalf, canopyY, canopyY + 0.30, 0.02, canopyOut, pal.ribLight, {
      topColor: pal.ribLight, bottomColor: pal.soffit, back: true,
    });
    builder.edgeBox(edge, distance - porticoHalf - 0.04, distance + porticoHalf + 0.04, canopyY + 0.08, canopyY + 0.24, canopyOut - 0.02, canopyOut + 0.05, pal.accent, {
      top: false, bottomColor: pal.soffit,
    });
    porticoCount++;

    // Tall recessed multi-storey vertical glazed staircase/elevator core bay above primary entrance!
    if (idx === 0) {
      const coreHalf = Math.min(porticoHalf - 0.12, 2.35);
      const coreBottom = canopyY + 0.34;
      const coreTop = height + parapetH;
      // Bold projecting vertical flank piers framing the full-height glass core
      for (const side of [-1, 1]) {
        const px = distance + side * (coreHalf + 0.18);
        builder.edgeBox(edge, px - 0.20, px + 0.20, coreBottom, coreTop, 0.02, 0.38, pal.ribLight, {
          sideColor: pal.wallMain, topColor: pal.ribLight, bottom: false,
        });
        builder.edgeBox(edge, px - 0.06, px + 0.06, coreBottom, coreTop, 0.36, 0.44, pal.accent, {
          top: false, bottom: false,
        });
      }
      // Tall continuous recessed curtain-wall glazing spanning all storeys above canopy
      builder.edgeFace(edge, distance - coreHalf, distance + coreHalf, coreBottom, coreTop - 0.16, 0.075, pal.stairGlass);
      // Vertical steel/aluminum curtain-wall mullions
      const vDivs = 4;
      for (let v = 1; v < vDivs; v++) {
        const mx = distance - coreHalf + (coreHalf * 2 * v) / vDivs;
        builder.edgeBox(edge, mx - 0.04, mx + 0.04, coreBottom, coreTop - 0.16, 0.075, 0.16, pal.ribLight, {
          top: false, bottom: false,
        });
      }
      // Floor landing spandrel transoms across every upper storey inside the glazed core
      for (let f = 1; f <= floors; f++) {
        const ty = f === floors ? coreTop - 0.16 : f * floorH;
        if (ty <= coreBottom + 0.4) continue;
        builder.edgeBox(edge, distance - coreHalf, distance + coreHalf, ty - 0.14, ty + 0.10, 0.075, 0.22, pal.accentDeep, {
          topColor: pal.ribLight, bottomColor: pal.soffit,
        });
      }
      // Projecting cap hood flush with the roof parapet coping line
      builder.edgeBox(edge, distance - coreHalf - 0.40, distance + coreHalf + 0.40, coreTop, coreTop + copingH, 0.02, 0.46, pal.ribLight, {
        topColor: pal.ribLight, bottomColor: pal.soffit, back: true,
      });
      stairCoreCount++;

      // Crisp Architectural Elevator Penthouse / Mumty rising ~2.4 m above the roof parapet!
      // Positioned cleanly behind the entrance staircore and clipped strictly inside the mapped roof!
      const pDepth = 4.2;
      const pWidth = Math.min(5.2, coreHalf * 2 + 0.6);
      const pCenter = edge.at(distance, 0, -(pDepth * 0.5 + 0.35));
      const mumtyBaseY = height;
      const mumtyHeight = parapetH + 2.40; // rises 2.40 m cleanly above roof parapet!
      const clipped = addRooftopCore(
        builder, building.polygons,
        pCenter[0], pCenter[2],
        pWidth * 0.5, pDepth * 0.5,
        edge.ux, edge.uz, edge.nx, edge.nz,
        mumtyBaseY, mumtyHeight,
        {
          wallHex: pal.wallMain,
          roofHex: pal.ribLight,
          accentHex: pal.accent,
          glassHex: pal.stairGlass,
          soffitHex: pal.soffit,
        }
      );
      if (clipped.length) {
        penthousePolygons.push(...clipped);
        roofRise = Math.max(roofRise, mumtyHeight + 0.22);
        coreAvoidPoints.push([pCenter[0], pCenter[2]]);
      }
    }

    addInterval(entryApertureByEdge, edgeIdx, distance - clearHalf - 0.04, distance + clearHalf + 0.04);
    addInterval(porticoBlockedByEdge, edgeIdx, distance - porticoHalf - 0.18, distance + porticoHalf + 0.18);

    entryDetails.push({
      center: edge.at(distance, 0, 0),
      source,
      clearWidth: clearHalf * 2,
      canopyHeight: canopyY,
      surveyed: source === 'surveyed',
    });
  });

  // 2. CONTINUOUS PROJECTING HORIZONTAL CHAJJAS, RHYTHMIC VERTICAL SOLAR FINS & RIBBON GLAZING (ALL 5-6 STOREYS!)
  for (let ei = 0; ei < allEdges.length; ei++) {
    const edge = allEdges[ei];
    const isCourtyard = edge.ringIndex > 0;
    const apertures = entryApertureByEdge.get(ei) ?? [];
    const porticoBlocked = porticoBlockedByEdge.get(ei) ?? [];

    // Grounded institutional plinth skirt (strictly open across entry apertures!)
    for (const [a, b] of splitIntervals(edge.length, apertures, 0)) {
      builder.edgeBox(edge, a, b, 0, 0.48, 0.01, 0.14, pal.plinth, {
        topColor: pal.ribLight, bottom: false,
      });
    }

    // Main wall cladding skin (strictly open across ground-level entry apertures!)
    for (const [a, b] of splitIntervals(edge.length, apertures, 0)) {
      builder.edgeFace(edge, a, b, 0.48, Math.min(height, 3.32), 0.032, pal.wallMain);
    }
    if (height > 3.32) {
      builder.edgeFace(edge, 0, edge.length, 3.32, height, 0.032, pal.wallMain);
    }

    // Crisp roof parapet coping tracing every outer AND courtyard ring
    if (edge.length >= 0.8) {
      builder.edgeBox(edge, 0, edge.length, height, height + parapetH, -0.26, 0.04, pal.wallMain, {
        top: false, bottom: false, back: true,
      });
      if (edge.length >= 2.2) {
        builder.edgeFace(edge, 0.15, edge.length - 0.15, height + parapetH - 0.28, height + parapetH - 0.10, 0.052, pal.accent);
      }
      builder.edgeBox(edge, 0, edge.length, height + parapetH, height + parapetH + copingH, -0.32, 0.11, pal.ribLight, {
        topColor: pal.ribLight, bottomColor: pal.soffit, back: true,
      });
    }

    // Continuous projecting horizontal concrete chajja / brise-soleil ledges & recessed ribbon glazing across every floor!
    const chajjaDepth = isCourtyard ? 0.28 : 0.40;
    const finDepth = isCourtyard ? 0.22 : 0.30;
    const chajjaHex = pal.ribLight;
    const finHex = isScience ? pal.ribLight : pal.accent;
    const spandrelHex = isScience ? pal.accent : pal.accentDeep;

    const wallSpansUpper = splitIntervals(edge.length, porticoBlocked, 0);
    for (let f = 0; f < floors; f++) {
      const fy0 = f * floorH;
      const winBottom = fy0 + (f === 0 ? 1.05 : 0.96);
      const winTop = Math.min(height - 0.34, fy0 + floorH - 0.44);
      const spans = f === 0 ? splitIntervals(edge.length, porticoBlocked, 0) : wallSpansUpper;

      for (const [a, b] of spans) {
        const spanLen = b - a;
        if (spanLen < 1.2) continue;

        // Continuous projecting sloped horizontal chajja sun-breaker ledge right above each storey's ribbon glazing!
        if (edge.length >= 2.4 && winTop + 0.02 < height) {
          builder.chajja(edge, a, b, winTop, 0.22, 0.11, chajjaDepth, chajjaHex, pal.soffit, 0.01);
          chajjaCount++;
        }

        // Recessed continuous institutional ribbon glazing + crisp mullions + louver accent spandrel strip
        if (spanLen >= 2.0 && winTop - winBottom >= 0.7) {
          const pad = Math.min(0.28, spanLen * 0.08);
          const gA = a + pad, gB = b - pad;
          const gLen = gB - gA;
          // Recessed dark glazing ribbon
          builder.edgeFace(edge, gA, gB, winBottom, winTop, 0.052, pal.glass);
          // Crisp horizontal transom & window sill strip
          builder.edgeFace(edge, gA, gB, winBottom - 0.08, winBottom, 0.072, pal.ribLight);
          builder.edgeFace(edge, gA, gB, winBottom + (winTop - winBottom) * 0.64, winBottom + (winTop - winBottom) * 0.68, 0.068, pal.ribLight);
          // Modular vertical window mullions giving street-level rhythm inside the ribbon glazing
          const mCount = Math.max(1, Math.floor(gLen / (isCourtyard ? 2.4 : 1.9)));
          for (let m = 1; m < mCount; m++) {
            const mx = gA + (gLen * m) / mCount;
            builder.edgeFace(edge, mx - 0.022, mx + 0.022, winBottom, winTop, 0.066, pal.ribLight);
          }
          // Louver / architectural accent spandrel band below window sill
          const spBot = fy0 + (f === 0 ? 0.52 : 0.26);
          if (winBottom - 0.12 > spBot + 0.14) {
            builder.edgeFace(edge, gA, gB, spBot, winBottom - 0.14, 0.058, spandrelHex);
          }
          windowBayCount++;
        }
      }
    }

    // Rhythmic full-height vertical solar shading fins running cleanly across all 5-6 storeys!
    if (edge.length >= 3.2) {
      const finSpacing = isCourtyard ? 3.8 : (isScience ? 3.2 : 3.0);
      const finCountOnEdge = Math.max(2, Math.floor((edge.length - 0.8) / finSpacing) + 1);
      const step = (edge.length - 0.8) / Math.max(1, finCountOnEdge - 1);
      for (let i = 0; i < finCountOnEdge; i++) {
        const fd = 0.40 + i * step;
        if (porticoBlocked.some(([lo, hi]) => fd >= lo - 0.22 && fd <= hi + 0.22)) continue;
        // Full-height vertical brise-soleil blade interlocking cleanly with the horizontal chajjas
        builder.edgeBox(edge, fd - 0.075, fd + 0.075, 0.48, height - 0.08, 0.02, finDepth, finHex, {
          sideColor: isScience ? pal.accent : pal.accentDeep,
          topColor: pal.ribLight,
          bottom: false,
        });
        finCount++;
      }
    }
  }

  // 3. CYLINDRICAL OVERHEAD WATER TANKS ON THE ROOF (strictly inside roof polygon, clear of courtyards & penthouse!)
  const tankRadius = 1.22;
  const tankAnchors = findRoofAnchors(polygon, {
    minRoom: tankRadius + 1.15,
    count: 2,
    minSpacing: 4.4,
    avoid: coreAvoidPoints,
  });
  for (const anchor of tankAnchors) {
    const [tx, tz] = anchor.point;
    // Concrete plinth cradle legs lifting the tank cleanly above roof deck
    builder.cylinder(tx, tz, height, height + 0.48, tankRadius * 0.72, tankRadius * 0.72, 8, pal.plinth, pal.soffit, { topColor: null });
    // Main cylindrical overhead water tank drum (12 sides)
    builder.cylinder(tx, tz, height + 0.48, height + 2.28, tankRadius, tankRadius, 12, pal.tankBody, pal.tankShade, { topColor: pal.ribLight });
    // Top perimeter stiffening collar + sloped cap dome
    builder.cylinder(tx, tz, height + 2.18, height + 2.34, tankRadius + 0.06, tankRadius + 0.06, 12, pal.tankCap, pal.accentDeep, { topColor: pal.ribLight });
    builder.cylinder(tx, tz, height + 2.34, height + 2.52, tankRadius * 0.45, tankRadius * 0.38, 8, pal.tankCap, pal.accentDeep, { topColor: pal.ribLight });
    waterTankCount++;
    roofRise = Math.max(roofRise, 2.52);
  }

  return {
    roofRise,
    maxHorizontalExtent,
    entryDetails,
    flagResult: { flagMeshes: [], flagMaterials: [], flagTextures: [], flagAnimators: [], flagDiagnostics: [] },
    features: {
      porticoCount,
      pedimentCount: 0,
      pilasterCount: 0,
      columnCount,
      archCount: 0,
      windowBayCount,
      chajjaCount,
      finCount,
      stairCoreCount,
      penthousePolygons,
      waterTankCount,
      flagpoleCount: 0,
      flags: [],
    },
  };
}

/**
 * Builds dedicated, architecturally distinct 3D visual landmark augmentations for 5 iconic
 * academic & administrative buildings of Islamic University, Kushtia:
 * - Administration Building (relation/18079380) & New Administrative Building (way/929202651)
 * - Rabindra–Nazrul Arts Building (relation/18079382)
 * - Ibn Sina Science Building (relation/18079384) & Business Administration Building (relation/18079386)
 *
 * Strictly anchored to mapped OSM footprints, preserving every open courtyard hole and
 * keeping every ground-level entrance raycast-clear with zero added collision volumes.
 */
export function buildAcademicLandmark(building, { entrances, baseHeight, flagpoleOutward } = {}) {
  if (!isAcademicLandmark(building)) {
    throw new TypeError(
      'Academic landmark requires exact typed OSM key: relation/18079380, way/929202651, relation/18079382, relation/18079384, or relation/18079386'
    );
  }
  const spec = LANDMARK_SPECS[`${building.osmType}/${building.id}`];

  const polygon = building.polygons?.[0];
  if (
    !Array.isArray(building.polygons) || building.polygons.length !== 1 ||
    !Array.isArray(polygon) || !polygon[0]?.length ||
    polygon.some(ring =>
      !Array.isArray(ring) || ring.length < 4 ||
      ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
      ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]
    )
  ) {
    throw new TypeError(`${spec.nameEn} requires one finite closed mapped footprint polygon`);
  }

  const height = baseHeight ?? building.height ?? spec.defaultHeight;
  if (!Number.isFinite(height) || height < 4 || height > 60) {
    throw new RangeError(`${spec.nameEn} baseHeight must be finite and within 4..60 metres`);
  }

  if (flagpoleOutward !== undefined && (!Number.isFinite(flagpoleOutward) || flagpoleOutward < 0.8 || flagpoleOutward > 12)) {
    throw new RangeError('flagpoleOutward must be finite and within 0.8..12 metres');
  }

  const allEdges = wallEdges(polygon);
  const outerEdges = allEdges.filter(e => !e.ringIndex && e.length >= 2.5);
  if (!outerEdges.length) {
    throw new RangeError(`${spec.nameEn} has no usable outer facade edge`);
  }

  if (entrances !== undefined && (!Array.isArray(entrances) || !entrances.length)) {
    throw new TypeError('Entrances must be a nonempty array when supplied');
  }

  const samePoint = (a, b) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const entryInputs = entrances ?? [
    { edge: [...outerEdges].sort((a, b) => b.length - a.length)[0], source: 'illustrative-longest-edge' },
  ];
  const resolvedEntries = entryInputs.map(entry => {
    const edge = outerEdges.find(e => samePoint(e.a, entry?.edge?.a) && samePoint(e.b, entry?.edge?.b));
    const distance = entry?.distance ?? (edge ? edge.length * 0.5 : NaN);
    if (!edge || !Number.isFinite(distance) || distance < 0.8 || distance > edge.length - 0.8) {
      throw new RangeError(`${spec.nameEn} entrance must lie away from corners on a mapped outer edge`);
    }
    return { edge, distance, source: entry?.source ?? 'caller-supplied-unverified' };
  });

  const builder = new MeshBuilder();
  let built;
  if (spec.archetype === 'civic-admin') {
    built = buildCivicAdminArchitecture(builder, building, polygon, allEdges, resolvedEntries, height, spec, { flagpoleOutward });
  } else if (spec.archetype === 'cultural-arts') {
    built = buildCulturalArtsArchitecture(builder, building, polygon, allEdges, resolvedEntries, height, spec);
  } else {
    built = buildModernTowerArchitecture(builder, building, polygon, allEdges, resolvedEntries, height, spec);
  }

  const geometry = builder.toBufferGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.80,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
  });

  const staticMesh = new THREE.Mesh(geometry, material);
  staticMesh.name = `academic-landmark-${spec.key}-architecture`;
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = `academic-landmark-${spec.key}`;
  group.add(staticMesh);

  const { flagMeshes, flagMaterials, flagTextures, flagAnimators } = built.flagResult;
  for (const fm of flagMeshes) group.add(fm);

  const flagVertexCount = flagMeshes.reduce((sum, m) => sum + (m.geometry.getAttribute('position')?.count ?? 0), 0);
  const totalVertexCount = geometry.getAttribute('position').count + flagVertexCount;
  const exactRoofRise = Math.max(0, (geometry.boundingBox?.max.y ?? height) - height);

  const diagnostics = {
    osmType: spec.osmType,
    osmId: spec.id,
    osmKey: `${spec.osmType}/${spec.id}`,
    landmarkKey: spec.key,
    archetype: spec.archetype,
    nameEn: spec.nameEn,
    nameBn: spec.nameBn,
    baseHeight: height,
    floors: Math.max(2, Math.round(height / 3.2)),
    courtyardCount: Math.max(0, polygon.length - 1),
    roofRise: +exactRoofRise.toFixed(4),
    maxHorizontalExtent: +built.maxHorizontalExtent.toFixed(3),
    entries: built.entryDetails,
    features: built.features,
    staticVertexCount: geometry.getAttribute('position').count,
    vertexCount: totalVertexCount,
    drawCalls: 1 + flagMeshes.length,
    collisionObjects: 0,
  };
  group.userData.academicLandmark = diagnostics;

  let elapsed = 0;
  let disposed = false;

  return {
    group,
    diagnostics,
    update(dt) {
      if (disposed || !flagAnimators.length) return;
      const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      elapsed += step;
      for (const animate of flagAnimators) animate(elapsed);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      for (const fm of flagMeshes) fm.geometry.dispose();
      for (const fMat of flagMaterials) fMat.dispose();
      for (const fTex of flagTextures) fTex.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
