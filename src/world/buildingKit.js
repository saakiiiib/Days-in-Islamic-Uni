import * as THREE from 'three';
import { pointInPolygon, pointToSegmentDistance } from '../map/geometry.js';
import { wallEdges } from './facades.js';
import { hashId } from './appearance.js';
import { CENTRAL_MOSQUE_ID } from './landmarks/centralMosque.js';
import { AUDITORIUM_ID } from './landmarks/auditorium.js';
import { CENTRAL_LIBRARY_ID } from './landmarks/centralLibrary.js';
import { isAcademicLandmark } from './landmarks/academicLandmarks.js';
import { isResidentialHallLandmark } from './landmarks/residentialHalls.js';

const DEDICATED_LANDMARK_KEYS = new Set([
  `way/${CENTRAL_MOSQUE_ID}`,
  `relation/${AUDITORIUM_ID}`,
  `way/${CENTRAL_LIBRARY_ID}`,
]);
const DEDICATED_LANDMARK_IDS = new Set([CENTRAL_MOSQUE_ID, AUDITORIUM_ID, CENTRAL_LIBRARY_ID]);
const TALL_ARCADE_KEYS = new Set(['relation/18079379', 'relation/18079381']);
const SKIP_TAG_RE = /^(shed|garage|grarage|hut|kiosk|toilets|roof)$/;

const COLORS = Object.freeze({
  concreteLight: new THREE.Color(0xe3ded1),
  concreteMid: new THREE.Color(0xd2ccbd),
  concreteSoffit: new THREE.Color(0xa6a091),
  plinth: new THREE.Color(0x89867b),
  plinthLip: new THREE.Color(0xa6a294),
  railingSteel: new THREE.Color(0x465154),
  mumtyWall: new THREE.Color(0xdcd6c6),
  mumtyRoof: new THREE.Color(0xeae5d8),
  mumtyDoor: new THREE.Color(0x374346),
  tankConcrete: new THREE.Color(0xcfcbc0),
  tankPoly: new THREE.Color(0x2e3d47),
  tankLid: new THREE.Color(0x525a5d),
});

function isDedicatedLandmark(building) {
  if (isAcademicLandmark(building) || isResidentialHallLandmark(building)) return true;
  const id = String(building?.id ?? '');
  if (building?.osmType) return DEDICATED_LANDMARK_KEYS.has(`${building.osmType}/${id}`);
  return DEDICATED_LANDMARK_IDS.has(id);
}

function isSkippedBuilding(building) {
  if (!building || !Array.isArray(building.polygons) || !building.polygons.length) return true;
  if (!Number.isFinite(building.height) || building.height < 4.5) return true;
  if (SKIP_TAG_RE.test(building.tags?.building ?? '')) return true;
  if (isDedicatedLandmark(building)) return true;
  return false;
}

/** Direct right-handed triangle/quad builder emitting guaranteed outward normals. */
class TrimBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];
  }

  tri(a, b, c, n, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.pos.push(...a, ...b, ...c);
    else this.pos.push(...a, ...c, ...b);
    for (let i = 0; i < 3; i++) {
      this.norm.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a, b, c, d, n, color) {
    this.tri(a, b, c, n, color);
    this.tri(a, c, d, n, color);
  }

  /**
   * Adds an axis-aligned box in edge-local coordinates:
   * d in [d0, d1] along edge, y in [y0, y1] vertical, o in [o0, o1] along outward normal.
   */
  edgeBox(edge, d0, d1, y0, y1, o0, o1, color, {
    topColor = color, bottomColor = COLORS.concreteSoffit,
    back = false, bottom = true, top = true, sides = true,
  } = {}) {
    if (d1 - d0 < 1e-4 || y1 - y0 < 1e-4 || o1 - o0 < 1e-4) return;
    const p000 = edge.at(d0, y0, o0), p100 = edge.at(d1, y0, o0);
    const p110 = edge.at(d1, y1, o0), p010 = edge.at(d0, y1, o0);
    const p001 = edge.at(d0, y0, o1), p101 = edge.at(d1, y0, o1);
    const p111 = edge.at(d1, y1, o1), p011 = edge.at(d0, y1, o1);
    const nOut = [edge.nx, 0, edge.nz], nIn = [-edge.nx, 0, -edge.nz];
    const nLeft = [-edge.ux, 0, -edge.uz], nRight = [edge.ux, 0, edge.uz];
    this.quad(p001, p101, p111, p011, nOut, color);
    if (back) this.quad(p100, p000, p010, p110, nIn, color);
    if (sides) {
      this.quad(p000, p001, p011, p010, nLeft, color);
      this.quad(p101, p100, p110, p111, nRight, color);
    }
    if (top) this.quad(p011, p111, p110, p010, [0, 1, 0], topColor);
    if (bottom) this.quad(p000, p100, p101, p001, [0, -1, 0], bottomColor);
  }

  /**
   * Sloped concrete chajja (Bangladeshi rain-hood sunshade): deeper at wall, tapering down to crisp front drip lip.
   */
  chajja(edge, d0, d1, yBottom, backHeight, frontHeight, depth, color, soffitColor) {
    if (d1 - d0 < .15) return;
    const o0 = .01, o1 = depth;
    const yBackTop = yBottom + backHeight;
    const yFrontTop = yBottom + frontHeight;
    const b0 = edge.at(d0, yBottom, o0), b1 = edge.at(d1, yBottom, o0);
    const f0 = edge.at(d0, yBottom, o1), f1 = edge.at(d1, yBottom, o1);
    const tb0 = edge.at(d0, yBackTop, o0), tb1 = edge.at(d1, yBackTop, o0);
    const tf0 = edge.at(d0, yFrontTop, o1), tf1 = edge.at(d1, yFrontTop, o1);
    const slope = backHeight - frontHeight, slen = Math.hypot(depth, slope) || 1;
    const nTop = [edge.nx * slope / slen, depth / slen, edge.nz * slope / slen];
    const nOut = [edge.nx, 0, edge.nz];
    const nLeft = [-edge.ux, 0, -edge.uz], nRight = [edge.ux, 0, edge.uz];
    // Top sloped weathering plane
    this.quad(tf0, tf1, tb1, tb0, nTop, color);
    // Crisp front drip lip
    this.quad(f0, f1, tf1, tf0, nOut, color);
    // Shaded underside soffit
    this.quad(b0, b1, f1, f0, [0, -1, 0], soffitColor);
    // Left & right trapezoidal end cheeks
    this.quad(b0, f0, tf0, tb0, nLeft, color);
    this.quad(f1, b1, tb1, tf1, nRight, color);
  }

  /** Slender triangular corbel bracket supporting an overhead entry portico canopy. */
  corbelBracket(edge, dCenter, halfThick, yBottom, yTop, depth, color) {
    const d0 = dCenter - halfThick, d1 = dCenter + halfThick;
    const o0 = .01, o1 = depth;
    const wallBot0 = edge.at(d0, yBottom, o0), wallBot1 = edge.at(d1, yBottom, o0);
    const wallTop0 = edge.at(d0, yTop, o0), wallTop1 = edge.at(d1, yTop, o0);
    const tip0 = edge.at(d0, yTop, o1), tip1 = edge.at(d1, yTop, o1);
    const nLeft = [-edge.ux, 0, -edge.uz], nRight = [edge.ux, 0, edge.uz];
    const dy = yTop - yBottom, len = Math.hypot(depth, dy) || 1;
    const nHyp = [edge.nx * dy / len, -depth / len, edge.nz * dy / len];
    this.tri(wallBot0, tip0, wallTop0, nLeft, color);
    this.tri(wallBot1, wallTop1, tip1, nRight, color);
    this.quad(wallBot0, wallBot1, tip1, tip0, nHyp, COLORS.concreteSoffit);
  }

  /** Oriented world-space solid box centered at (cx, cy, cz) with horizontal basis (ux, uz) and normal (nx, nz). */
  roofBox(cx, cz, y0, y1, halfU, halfN, ux, uz, nx, nz, color, topColor = color) {
    const pt = (su, sn, y) => [cx + ux * halfU * su + nx * halfN * sn, y, cz + uz * halfU * su + nz * halfN * sn];
    const p00 = pt(-1, -1, y0), p10 = pt(1, -1, y0), p11 = pt(1, 1, y0), p01 = pt(-1, 1, y0);
    const q00 = pt(-1, -1, y1), q10 = pt(1, -1, y1), q11 = pt(1, 1, y1), q01 = pt(-1, 1, y1);
    this.quad(p01, p11, q11, q01, [nx, 0, nz], color);
    this.quad(p10, p00, q00, q10, [-nx, 0, -nz], color);
    this.quad(p00, p01, q01, q00, [-ux, 0, -uz], color);
    this.quad(p11, p10, q10, q11, [ux, 0, uz], color);
    this.quad(q01, q11, q10, q00, [0, 1, 0], topColor);
    this.quad(p00, p10, p11, p01, [0, -1, 0], COLORS.concreteSoffit);
  }

  /** Lean vertical prism cylinder (for rooftop overhead water tanks). */
  cylinder(cx, cz, y0, y1, radius, sides, sideColor, topColor = sideColor) {
    const topCenter = [cx, y1, cz];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const b0 = [cx + c0 * radius, y0, cz + s0 * radius];
      const b1 = [cx + c1 * radius, y0, cz + s1 * radius];
      const t0 = [cx + c0 * radius, y1, cz + s0 * radius];
      const t1 = [cx + c1 * radius, y1, cz + s1 * radius];
      const midA = (a0 + a1) / 2;
      this.quad(b0, b1, t1, t0, [Math.cos(midA), 0, Math.sin(midA)], sideColor);
      this.tri(topCenter, t0, t1, [0, 1, 0], topColor);
    }
  }

  toGeometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function matchingEntries(edge, entries) {
  if (edge.ringIndex || !Array.isArray(entries) || !entries.length) return [];
  const hits = [];
  for (const entry of entries) {
    const source = entry?.edge;
    if (!source || source.ringIndex || !Number.isFinite(entry.distance) || !Array.isArray(source.a) ||
      !Number.isFinite(source.ux) || !Number.isFinite(source.uz)) continue;
    const point = [source.a[0] + source.ux * entry.distance, source.a[1] + source.uz * entry.distance];
    if (pointToSegmentDistance(point, edge.a, edge.b) > .02) continue;
    const distance = (point[0] - edge.a[0]) * edge.ux + (point[1] - edge.a[1]) * edge.uz;
    if (distance < 0 || distance > edge.length) continue;
    hits.push({ distance, source: entry.source ?? 'caller-supplied' });
  }
  return hits;
}

function splitIntervals(lo, hi, blocked) {
  let spans = [[lo, hi]];
  for (const [bLo, bHi] of blocked) {
    spans = spans.flatMap(([a, b]) => {
      if (bHi <= a || bLo >= b) return [[a, b]];
      return [[a, Math.min(bLo, b)], [Math.max(bHi, a), b]].filter(([x, y]) => y - x > .2);
    });
  }
  return spans.filter(([x, y]) => y - x > .2);
}

/**
 * Finds the safest interior rooftop point strictly inside the polygon (never inside courtyard holes)
 * with clearance >= minClearance from every outer AND hole ring segment.
 */
function findRoofAnchor(polygon, minClearance = 2.8) {
  const ring = polygon[0];
  if (!ring || ring.length < 4) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  if (maxX - minX < minClearance * 2 || maxZ - minZ < minClearance * 2) return null;
  let best = null;
  const steps = 16;
  for (let ix = 1; ix < steps; ix++) for (let iz = 1; iz < steps; iz++) {
    const pt = [minX + (maxX - minX) * ix / steps, minZ + (maxZ - minZ) * iz / steps];
    if (!pointInPolygon(pt, polygon)) continue;
    let room = Infinity;
    for (const r of polygon) for (let i = 1; i < r.length; i++) {
      const d = pointToSegmentDistance(pt, r[i - 1], r[i]);
      if (d < room) room = d;
    }
    if (room >= minClearance && (!best || room > best.room)) best = { point: pt, room };
  }
  return best;
}

/**
 * Generates lean 3D architectural realism trim (chajja sunshades, projecting veranda slabs &
 * railings, perimeter roof parapets, rooftop mumty cores & overhead water tanks, entry portico
 * canopies, and ground-floor plinth skirts) for regular campus buildings.
 *
 * Returns `{ trim: BufferGeometry }` (non-indexed, with vertex color and normal attributes)
 * ready to batch with `collision: false` and `kind: 'building-trim'`, or `null` when skipped.
 */
export function buildingArchitectureGeometry(building, palette = {}, entries = []) {
  if (isSkippedBuilding(building)) return null;

  const height = building.height;
  const floors = Math.max(1, Math.floor(height / 3.2));
  const kind = palette?.kind ?? 'unclassified';
  const isTallArcade = building.osmType ? TALL_ARCADE_KEYS.has(`${building.osmType}/${building.id}`) : false;
  const hasVerandaStyle = !isTallArcade && (kind === 'residential' || (kind === 'academic' && height >= 9));
  const bayWidth = kind === 'academic' ? 3.4 : kind === 'residential' ? 2.9 : 3.2;

  const parapetColor = new THREE.Color(palette?.wall ?? 0xd4cdc0).lerp(COLORS.concreteMid, .45);
  const verandaRailColor = kind === 'residential'
    ? new THREE.Color(palette?.accent ?? 0x8a4e3a).lerp(COLORS.railingSteel, .45)
    : COLORS.railingSteel;

  const builder = new TrimBuilder();
  const tankVariant = hashId(building.id ?? '0') % 2;

  for (const polygon of building.polygons) {
    if (!Array.isArray(polygon) || !polygon[0] || polygon[0].length < 4) continue;
    const edges = wallEdges(polygon);
    if (!edges.length) continue;

    for (const edge of edges) {
      const { length } = edge;
      const doors = matchingEntries(edge, entries);
      const doorBlocked = doors.map(d => [d.distance - 1.15, d.distance + 1.15]);

      // 1. GROUND-FLOOR PLINTH SKIRT (0.45m tall, 0.14m out; cleanly open across entries!)
      for (const [a, b] of splitIntervals(0, length, doorBlocked)) {
        builder.edgeBox(edge, a, b, 0, .45, 0, .14, COLORS.plinth, { topColor: COLORS.plinthLip, bottom: false });
      }

      // 2. 3D PERIMETER ROOF PARAPET WALL (0.72m high, 0.24m thick) + COPING RIM
      // Seated cleanly inside the roof edge (-0.24..0) along BOTH outer and courtyard rings!
      if (length >= .5) {
        builder.edgeBox(edge, 0, length, height, height + .72, -.24, 0, parapetColor, { back: true, bottom: false, top: false });
        builder.edgeBox(edge, 0, length, height + .72, height + .81, -.27, .05, COLORS.concreteLight, { back: true });
      }

      // 3. PROJECTING ENTRY PORTICO CANOPY (0.85m deep overhead slab above y = 2.65m + side brackets)
      for (const door of doors) {
        const halfW = Math.min(1.45, door.distance - .12, length - door.distance - .12);
        if (halfW < .62 || height < 3.4) continue;
        const d0 = door.distance - halfW, d1 = door.distance + halfW;
        // Overhead concrete canopy slab strictly above y = 2.65m
        builder.edgeBox(edge, d0, d1, 2.70, 2.92, 0, .85, COLORS.concreteLight, { topColor: COLORS.concreteLight });
        // Slender side corbel brackets strictly tucked at left & right canopy ends above y = 2.25m
        builder.corbelBracket(edge, d0 + .08, .06, 2.25, 2.70, .66, COLORS.concreteMid);
        builder.corbelBracket(edge, d1 - .08, .06, 2.25, 2.70, .66, COLORS.concreteMid);
      }

      const isVerandaEdge = floors >= 2 && hasVerandaStyle && length >= 10;

      // 4. 3D CONCRETE CHAJJAS (WINDOW SUNSHADES / WEATHER HOODS)
      // Protruding 0.32m sloped concrete rain-hoods above each floor's window bays
      // (skipped on tall-arcade buildings so horizontal hoods never cut tall arches).
      if (!isTallArcade && length >= 2.1) {
        const count = Math.max(1, Math.floor((length - 1) / bayWidth));
        const spacing = length / count;
        const half = Math.min(.62, spacing * .25);
        for (let floor = 0; floor < floors; floor++) {
          // On veranda edges, upper floors already carry 0.42m projecting veranda slab hoods;
          // still place chajjas on the top floor (and ground floor windows away from doors).
          if (isVerandaEdge && floor > 0 && floor < floors - 1) continue;
          const y0 = floor * 3.2 + 1.05;
          const y1 = Math.min(height - .55, y0 + 1.35);
          if (y1 <= y0) continue;
          const hoodY = y1 + .05;
          if (hoodY + .15 >= height) continue;

          if (count === 1) {
            const center = .5 * spacing;
            if (floor === 0 && doors.some(d => Math.abs(d.distance - center) < half + .95)) continue;
            const c0 = Math.max(.08, center - half - .16);
            const c1 = Math.min(length - .08, center + half + .16);
            builder.chajja(edge, c0, c1, hoodY, .14, .065, .32, COLORS.concreteLight, COLORS.concreteSoffit);
          } else {
            // Crisp continuous lintel-band chajja across each unbroken window run (split around doors)
            const firstL = Math.max(.12, .5 * spacing - half - .18);
            const lastR = Math.min(length - .12, (count - .5) * spacing + half + .18);
            const blocked = floor === 0 ? doors.map(d => [d.distance - 1.55, d.distance + 1.55]) : [];
            for (const [s0, s1] of splitIntervals(firstL, lastR, blocked)) {
              builder.chajja(edge, s0, s1, hoodY, .14, .065, .32, COLORS.concreteLight, COLORS.concreteSoffit);
            }
          }
        }
      }

      // 5. PROJECTING HORIZONTAL FLOOR BELT / VERANDA SLABS + PERIMETER RAILINGS
      if (floors >= 2) {
        if (isVerandaEdge) {
          for (let floor = 1; floor < floors; floor++) {
            const fy = floor * 3.2;
            // Continuous 0.42m projecting concrete veranda/corridor slab ledge
            builder.edgeBox(edge, .06, length - .06, fy - .10, fy + .06, 0, .42, COLORS.concreteLight);
            // Slender horizontal perimeter railing bar along veranda front edge
            const railY = fy + .92;
            if (railY + .08 < height) {
              builder.edgeBox(edge, .12, length - .12, railY, railY + .06, .36, .41, verandaRailColor, { back: true, bottomColor: verandaRailColor });
            }
          }
          // Continuous slender vertical veranda fins/stanchions tying upper verandas together cleanly
          const topRailY = Math.min(height - .08, (floors - 1) * 3.2 + .98);
          const finCount = Math.max(2, Math.min(6, Math.floor(length / 6.5)));
          for (let p = 0; p <= finCount; p++) {
            const pd = .18 + (length - .36) * p / finCount;
            builder.edgeBox(edge, pd - .04, pd + .04, 3.26, topRailY, .34, .41, verandaRailColor, { back: true, top: false, bottom: false });
          }
        } else if (!isTallArcade && height >= 9 && length >= 4) {
          // Crisp modest 0.16m concrete floor-belt cornice band on non-veranda multi-storey walls
          for (let floor = 1; floor < floors; floor++) {
            const fy = floor * 3.2;
            builder.edgeBox(edge, .04, length - .04, fy - .07, fy + .07, 0, .16, COLORS.concreteMid);
          }
        }
      }
    }

    // 6. ROOFTOP STAIRCASE MUMTY CORE & OVERHEAD WATER TANK (height >= 9m, strictly inside roof!)
    if (height >= 9) {
      const anchor = findRoofAnchor(polygon, 2.8);
      if (anchor) {
        const longest = edges.filter(e => !e.ringIndex).sort((a, b) => b.length - a.length)[0] ?? edges[0];
        const [ax, az] = anchor.point;
        const { ux, uz, nx, nz } = longest;
        const mumtyH = 2.35;
        // Half-extents 1.30m x 1.00m (roof slab 1.45m x 1.15m -> max radius 1.85m << 2.8m clearance!)
        builder.roofBox(ax, az, height, height + mumtyH, 1.30, 1.00, ux, uz, nx, nz, COLORS.mumtyWall, COLORS.mumtyWall);
        // Dark stair access door relief on one side of the mumty core
        builder.roofBox(ax + nx * 1.01, az + nz * 1.01, height + .06, height + 1.98, .44, .03, ux, uz, nx, nz, COLORS.mumtyDoor, COLORS.mumtyDoor);
        // Projecting flat concrete mumty roof slab
        builder.roofBox(ax, az, height + mumtyH, height + mumtyH + .14, 1.45, 1.15, ux, uz, nx, nz, COLORS.mumtyRoof, COLORS.mumtyRoof);

        // Elevated overhead water tank seated on concrete support plinth atop the mumty slab
        const tankBaseY = height + mumtyH + .14;
        builder.roofBox(ax, az, tankBaseY, tankBaseY + .28, .82, .82, ux, uz, nx, nz, COLORS.plinth, COLORS.concreteMid);
        const tankColor = tankVariant === 0 ? COLORS.tankConcrete : COLORS.tankPoly;
        builder.cylinder(ax, az, tankBaseY + .28, tankBaseY + 1.46, .74, 8, tankColor, COLORS.tankLid);
        builder.cylinder(ax, az, tankBaseY + 1.46, tankBaseY + 1.54, .34, 8, COLORS.tankLid, COLORS.tankLid);
      }
    }
  }

  const trim = builder.toGeometry();
  return trim ? { trim } : null;
}
