import * as THREE from 'three';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { HALL_OBSERVATIONS } from '../../data/hall-observations.js';
import { buildingGeometry, ringArea } from '../geometry.js';
import { wallEdges } from '../facades.js';

export const RESIDENTIAL_HALL_IDS = Object.freeze({
  SHAH_AZIZUR: '532464837',
  SHAHID_ZIAUR: '967967197',
  JULY_36: '532464846',
  SHAHID_ANAS: '967967198',
  SADDAM_HOSSAIN: '532464712',
  LALON_SHAH: '532464760',
  KHALEDA_ZIA: '970015480',
  AISHA_SIDDIQA: '970015482',
  JIA_HALL_MOSQUE: '1317423300',
});

export const SHAH_AZIZUR_POND_ID = '1317423252';

const HALL_ID_SET = new Set(Object.values(RESIDENTIAL_HALL_IDS));
const WATER_LEVEL_Y = 0.021;
const MATERIAL_CONFIG = Object.freeze({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.82,
  envMapIntensity: 0.34,
  side: THREE.DoubleSide,
});

const HALL_META = Object.freeze({
  [RESIDENTIAL_HALL_IDS.SHAH_AZIZUR]: { key: 'shah-azizur', style: 'terracotta-gallery', name: 'Shah Azizur Rahman Hall' },
  [RESIDENTIAL_HALL_IDS.SHAHID_ZIAUR]: { key: 'shahid-ziaur', style: 'ivory-arcade', name: 'Shahid Ziaur Rahman Hall' },
  [RESIDENTIAL_HALL_IDS.JULY_36]: { key: 'july-36', style: 'pediment-eaves', name: 'July-36 Hall' },
  [RESIDENTIAL_HALL_IDS.SHAHID_ANAS]: { key: 'shahid-anas', style: 'ochre-grid', name: 'Shahid Anas Hall' },
  [RESIDENTIAL_HALL_IDS.SADDAM_HOSSAIN]: { key: 'saddam-hossain', style: 'classic-gallery', name: 'Saddam Hossain Hall' },
  [RESIDENTIAL_HALL_IDS.LALON_SHAH]: { key: 'lalon-shah', style: 'classic-gallery', name: 'Lalon Shah Hall' },
  [RESIDENTIAL_HALL_IDS.KHALEDA_ZIA]: { key: 'khaleda-zia', style: 'womens-rose', name: 'Khaleda Zia Hall' },
  [RESIDENTIAL_HALL_IDS.AISHA_SIDDIQA]: { key: 'aisha-siddiqa', style: 'womens-rose', name: "Ummul Mu'mineen Aisha Siddiqa Hall" },
  [RESIDENTIAL_HALL_IDS.JIA_HALL_MOSQUE]: { key: 'jia-hall-mosque', style: 'hall-mosque', name: 'Jia Hall Mosque' },
});

export function isResidentialHallLandmark(building) {
  if (!building || building.osmType !== 'way') return false;
  return HALL_ID_SET.has(String(building.id ?? ''));
}

function parseHexColor(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return parseInt(value.slice(1), 16);
  return fallback;
}

function colorObj(hex) {
  return hex instanceof THREE.Color ? hex : new THREE.Color(hex);
}

function shadeColor(hex, factor) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(factor);
}

function mixColor(hexA, hexB, t) {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

function observedHex(id, field) {
  const raw = HALL_OBSERVATIONS[`way/${id}`]?.fields?.[field]?.value;
  return parseHexColor(raw, null);
}

function resolveHallColors(id, callerPalette = {}) {
  const obsWall = observedHex(id, 'wallColor');
  const obsRoof = observedHex(id, 'roofColor');
  const wallHex = callerPalette?.wall != null ? parseHexColor(callerPalette.wall, obsWall ?? 0xd4ccbe) : (obsWall ?? 0xe4d6cc);
  const roofHex = callerPalette?.roof != null ? parseHexColor(callerPalette.roof, obsRoof ?? 0x8a847d) : (obsRoof ?? 0x8a847d);

  switch (id) {
    case RESIDENTIAL_HALL_IDS.SHAH_AZIZUR:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.87),
        wallDeep: shadeColor(wallHex, 0.76),
        pier: colorObj(0xf0ece2),
        pierShade: colorObj(0xdfd9cc),
        soffit: colorObj(0xa9a295),
        plinth: colorObj(0x888177),
        parapet: colorObj(0xe5dfd3),
        coping: colorObj(0xf3efe5),
        glass: colorObj(0x253236),
        mullion: colorObj(0xd9d4c7),
        rail: colorObj(0x2d3639),
        gateMain: colorObj(0xf1ede4),
        gateAccent: colorObj(wallHex),
        gateDeep: shadeColor(wallHex, 0.78),
        tankBody: colorObj(0xcfcac0),
        tankDark: colorObj(0x2e3d47),
      };
    case RESIDENTIAL_HALL_IDS.SHAHID_ZIAUR:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.89),
        wallDeep: shadeColor(wallHex, 0.78),
        pier: colorObj(0xede9dc),
        pierShade: colorObj(0xd8d3c3),
        soffit: colorObj(0x9e988a),
        plinth: colorObj(0x878377),
        parapet: colorObj(wallHex),
        coping: colorObj(0xf1ede0),
        glass: colorObj(0x232f33),
        mullion: colorObj(0xd6d1c1),
        rail: colorObj(0x3a4347),
        gateMain: colorObj(0xebe7d9),
        gateAccent: colorObj(0x9c9687),
        gateDeep: colorObj(0x6d685c),
        tankBody: colorObj(0xcac5b8),
        tankDark: colorObj(0x2e3d47),
      };
    case RESIDENTIAL_HALL_IDS.JULY_36:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.88),
        wallDeep: shadeColor(wallHex, 0.78),
        salmon: colorObj(0xd88c74),
        salmonShade: colorObj(0xbc725c),
        pier: colorObj(0xf1ede0),
        pierShade: colorObj(0xded8c7),
        soffit: colorObj(0xa69f8f),
        plinth: colorObj(0x898476),
        parapet: colorObj(0xe5dfd0),
        coping: colorObj(0xf4f0e4),
        glass: colorObj(0x243136),
        mullion: colorObj(0xe0dacb),
        rail: colorObj(0x3c4549),
        tankBody: colorObj(0xcfcbc0),
        tankDark: colorObj(0x2e3d47),
      };
    case RESIDENTIAL_HALL_IDS.SHAHID_ANAS:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.87),
        wallDeep: shadeColor(wallHex, 0.76),
        pier: colorObj(0xf4f2eb),
        pierShade: colorObj(0xe2dfd6),
        soffit: colorObj(0xb0aba0),
        plinth: colorObj(0x8a867c),
        parapet: colorObj(0xeeece4),
        coping: colorObj(0xf7f5ef),
        glass: colorObj(0x243237),
        mullion: colorObj(0xe7e4db),
        rail: colorObj(0x353f42),
        tankBody: colorObj(0xd4d0c7),
        tankDark: colorObj(0x2e3d47),
      };
    case RESIDENTIAL_HALL_IDS.SADDAM_HOSSAIN:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.88),
        wallDeep: shadeColor(wallHex, 0.78),
        pier: colorObj(0xded9cb),
        pierShade: colorObj(0xc8c2b2),
        soffit: colorObj(0x9b9587),
        plinth: colorObj(0x847f73),
        parapet: colorObj(wallHex),
        coping: colorObj(0xe8e3d6),
        glass: colorObj(0x263438),
        mullion: colorObj(0xcbc6b7),
        rail: colorObj(0x3b4448),
        gateMain: colorObj(0xdcd6c8),
        gateAccent: colorObj(0x9f6b56),
        gateDeep: colorObj(0x7c7669),
        tankBody: colorObj(0xc9c4b8),
        tankDark: colorObj(0x2d3d46),
      };
    case RESIDENTIAL_HALL_IDS.LALON_SHAH:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.88),
        wallDeep: shadeColor(wallHex, 0.78),
        pier: colorObj(0xe2e0d4),
        pierShade: colorObj(0xcccbc0),
        soffit: colorObj(0x9d9b90),
        plinth: colorObj(0x838278),
        parapet: colorObj(wallHex),
        coping: colorObj(0xebeadf),
        glass: colorObj(0x26353a),
        mullion: colorObj(0xd0cfc2),
        rail: colorObj(0x3d464a),
        gateMain: colorObj(0xe0dfd3),
        gateAccent: colorObj(0x7e837a),
        gateDeep: colorObj(0x6b6d65),
        tankBody: colorObj(0xcac9be),
        tankDark: colorObj(0x2d3d46),
      };
    case RESIDENTIAL_HALL_IDS.KHALEDA_ZIA:
      return {
        wallHex,
        roofHex,
        wall: colorObj(wallHex),
        wallShade: shadeColor(wallHex, 0.88),
        wallDeep: shadeColor(wallHex, 0.78),
        pier: colorObj(0xf3efeb),
        pierShade: colorObj(0xe1dad6),
        soffit: colorObj(0xa89d9b),
        plinth: colorObj(0x8b8280),
        parapet: colorObj(0xe7dad7),
        coping: colorObj(0xf5f1ee),
        glass: colorObj(0x273539),
        mullion: colorObj(0xe4ddda),
        rail: colorObj(0x41494d),
        gateMain: colorObj(0xf1ece6),
        gateAccent: colorObj(0xc28581),
        gateDeep: colorObj(0x9e6764),
        iron: colorObj(0x22292c),
        tankBody: colorObj(0xd4ccc9),
        tankDark: colorObj(0x2e3d47),
      };
    case RESIDENTIAL_HALL_IDS.AISHA_SIDDIQA: {
      // Aisha Hall has gate-only photo in hall-observations.js; use warm rose-ivory
      // facade framing with gentle accent harmony from caller palette if present.
      const roseIvoryHex = 0xe5d6cc;
      const accentHex = callerPalette?.wall != null ? parseHexColor(callerPalette.wall, 0xc3897a) : 0xc3897a;
      return {
        wallHex: roseIvoryHex,
        roofHex,
        wall: colorObj(roseIvoryHex),
        wallShade: shadeColor(roseIvoryHex, 0.89),
        wallDeep: shadeColor(roseIvoryHex, 0.78),
        pier: colorObj(0xf5f1ea),
        pierShade: colorObj(0xe4dcd4),
        soffit: colorObj(0xab9f97),
        plinth: colorObj(0x8c827b),
        parapet: colorObj(0xeadfd7),
        coping: colorObj(0xf6f2ec),
        glass: colorObj(0x273539),
        mullion: colorObj(0xe6dfd8),
        rail: colorObj(0x424a4e),
        gateMain: colorObj(0xf3eee6),
        gateAccent: mixColor(accentHex, 0xc78d7e, 0.45),
        gateDeep: shadeColor(accentHex, 0.78),
        iron: colorObj(0x232a2d),
        tankBody: colorObj(0xd5cec7),
        tankDark: colorObj(0x2e3d47),
      };
    }
    case RESIDENTIAL_HALL_IDS.JIA_HALL_MOSQUE:
    default:
      return {
        wallHex: 0xeee9dc,
        roofHex: 0xdad4c5,
        domeShell: colorObj(0xf1ece0),
        domeRib: colorObj(0xf8f5ec),
        drumWall: colorObj(0xe6dfd0),
        stoneLight: colorObj(0xf2ede1),
        stoneMid: colorObj(0xe2dbca),
        stoneReveal: colorObj(0xbfb7a4),
        soffit: colorObj(0xada592),
        plinth: colorObj(0xcfc7b4),
        sageAccent: colorObj(0x568b78),
        glass: colorObj(0x2a3f44),
        mullion: colorObj(0xded8c8),
        goldDark: colorObj(0xb89036),
        goldMid: colorObj(0xd8b14c),
        goldBright: colorObj(0xedc96b),
      };
  }
}

/** Direct right-handed non-indexed triangle/quad builder emitting guaranteed outward normals. */
class MeshBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
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

  edgeFrontQuad(edge, d0, d1, y0, y1, o, color) {
    if (d1 - d0 < 1e-4 || y1 - y0 < 1e-4) return;
    this.quad(
      edge.at(d0, y0, o), edge.at(d1, y0, o),
      edge.at(d1, y1, o), edge.at(d0, y1, o),
      [edge.nx, 0, edge.nz], color,
    );
  }

  edgeBox(edge, d0, d1, y0, y1, o0, o1, color, {
    topColor = color,
    bottomColor = color,
    sideColor = color,
    back = false,
    bottom = true,
    top = true,
    sides = true,
    front = true,
  } = {}) {
    if (d1 - d0 < 1e-4 || y1 - y0 < 1e-4 || o1 - o0 < 1e-4) return;
    const p000 = edge.at(d0, y0, o0), p100 = edge.at(d1, y0, o0);
    const p110 = edge.at(d1, y1, o0), p010 = edge.at(d0, y1, o0);
    const p001 = edge.at(d0, y0, o1), p101 = edge.at(d1, y0, o1);
    const p111 = edge.at(d1, y1, o1), p011 = edge.at(d0, y1, o1);
    const nOut = [edge.nx, 0, edge.nz], nIn = [-edge.nx, 0, -edge.nz];
    const nLeft = [-edge.ux, 0, -edge.uz], nRight = [edge.ux, 0, edge.uz];
    if (front) this.quad(p001, p101, p111, p011, nOut, color);
    if (back) this.quad(p100, p000, p010, p110, nIn, color);
    if (sides) {
      this.quad(p000, p001, p011, p010, nLeft, sideColor);
      this.quad(p101, p100, p110, p111, nRight, sideColor);
    }
    if (top) this.quad(p011, p111, p110, p010, [0, 1, 0], topColor);
    if (bottom) this.quad(p000, p100, p101, p001, [0, -1, 0], bottomColor);
  }

  /** Sloped Bangladeshi concrete chajja (rain-hood sunshade). */
  chajja(edge, d0, d1, yBottom, backHeight, frontHeight, depth, color, soffitColor, oStart = 0.025) {
    if (d1 - d0 < 0.15) return;
    const o0 = oStart, o1 = oStart + depth;
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
    this.quad(tf0, tf1, tb1, tb0, nTop, color);
    this.quad(f0, f1, tf1, tf0, nOut, color);
    this.quad(b0, b1, f1, f0, [0, -1, 0], soffitColor);
    this.quad(b0, f0, tf0, tb0, nLeft, color);
    this.quad(f1, b1, tb1, tf1, nRight, color);
  }

  /** Oriented solid box in arbitrary horizontal basis (ux, uz) & (nx, nz). */
  worldBox(cx, cz, y0, y1, halfU, halfN, ux, uz, nx, nz, color, {
    topColor = color,
    bottomColor = color,
    sideColor = color,
    bottom = false,
    top = true,
  } = {}) {
    if (halfU < 1e-4 || halfN < 1e-4 || y1 - y0 < 1e-4) return;
    const pt = (su, sn, y) => [cx + ux * halfU * su + nx * halfN * sn, y, cz + uz * halfU * su + nz * halfN * sn];
    const p00 = pt(-1, -1, y0), p10 = pt(1, -1, y0), p11 = pt(1, 1, y0), p01 = pt(-1, 1, y0);
    const q00 = pt(-1, -1, y1), q10 = pt(1, -1, y1), q11 = pt(1, 1, y1), q01 = pt(-1, 1, y1);
    this.quad(p01, p11, q11, q01, [nx, 0, nz], color);
    this.quad(p10, p00, q00, q10, [-nx, 0, -nz], color);
    this.quad(p00, p01, q01, q00, [-ux, 0, -uz], sideColor);
    this.quad(p11, p10, q10, q11, [ux, 0, uz], sideColor);
    if (top) this.quad(q01, q11, q10, q00, [0, 1, 0], topColor);
    if (bottom) this.quad(p00, p10, p11, p01, [0, -1, 0], bottomColor);
  }

  /** Lean vertical frustum/cylinder (for rooftop tanks, octagonal drums, mosque collars). */
  cylinder(cx, cz, y0, y1, rTop, rBot, sides, sideColor, {
    topColor = sideColor,
    top = true,
    bottom = false,
    angleOffset = 0,
  } = {}) {
    if (y1 - y0 < 1e-4) return;
    const topCenter = [cx, y1, cz];
    const botCenter = [cx, y0, cz];
    const dr = rBot - rTop, dy = y1 - y0, nLen = Math.hypot(dr, dy) || 1;
    const nr = dy / nLen, ny = dr / nLen;
    for (let i = 0; i < sides; i++) {
      const a0 = angleOffset + (i / sides) * Math.PI * 2;
      const a1 = angleOffset + ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const b0 = [cx + c0 * rBot, y0, cz + s0 * rBot];
      const b1 = [cx + c1 * rBot, y0, cz + s1 * rBot];
      const t0 = [cx + c0 * rTop, y1, cz + s0 * rTop];
      const t1 = [cx + c1 * rTop, y1, cz + s1 * rTop];
      const midA = (a0 + a1) / 2;
      if (rTop > 1e-4 && rBot > 1e-4) {
        this.quad(b0, b1, t1, t0, [Math.cos(midA) * nr, ny, Math.sin(midA) * nr], sideColor);
      } else if (rBot > 1e-4) {
        this.tri(b0, b1, topCenter, [Math.cos(midA) * nr, ny, Math.sin(midA) * nr], sideColor);
      }
      if (top && rTop > 1e-4) this.tri(topCenter, t0, t1, [0, 1, 0], topColor);
      if (bottom && rBot > 1e-4) this.tri(botCenter, b1, b0, [0, -1, 0], sideColor);
    }
  }

  /** Revolve a [r, y] profile around (cx, cz) at baseY (used for mosque pointed dome & finials). */
  lathe(cx, cz, baseY, profile, sides, color) {
    for (let s = 0; s < profile.length - 1; s++) {
      const [r0, y0] = profile[s], [r1, y1] = profile[s + 1];
      const dr = r1 - r0, dy = y1 - y0, len = Math.hypot(dr, dy) || 1;
      const nr = dy / len, ny = -dr / len;
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const midA = (a0 + a1) / 2;
        const n = [Math.cos(midA) * nr, ny, Math.sin(midA) * nr];
        const p00 = [cx + c0 * r0, baseY + y0, cz + s0 * r0];
        const p10 = [cx + c1 * r0, baseY + y0, cz + s1 * r0];
        const p01 = [cx + c0 * r1, baseY + y1, cz + s0 * r1];
        const p11 = [cx + c1 * r1, baseY + y1, cz + s1 * r1];
        if (r1 <= 1e-4) this.tri(p00, p10, [cx, baseY + y1, cz], n, color);
        else if (r0 <= 1e-4) this.tri([cx, baseY + y0, cz], p11, p01, n, color);
        else this.quad(p00, p10, p11, p01, n, color);
      }
    }
  }

  /** Absorb an auxiliary BufferGeometry (e.g. ExtrudeGeometry roof eave slab) with a flat tint. */
  addGeometry(geometry, color) {
    const src = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.norm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(color.r, color.g, color.b);
    }
    if (src !== geometry) src.dispose();
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/* -------------------------------------------------------------------------- */
/*  Shared Polygon, Entrance, Interval & Rooftop Placement Helpers            */
/* -------------------------------------------------------------------------- */

function validateBuilding(building, baseHeight) {
  if (!isResidentialHallLandmark(building)) {
    throw new TypeError(`Residential hall builder requires a supported OSM way ID, received ${building?.osmType}/${building?.id}`);
  }
  const polygon = building.polygons?.[0];
  if (
    building.polygons?.length !== 1 || !polygon?.[0]?.length ||
    polygon.some(ring => ring.length < 4 ||
      ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
      ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
  ) {
    throw new TypeError('Residential hall requires one finite closed mapped polygon');
  }
  const height = baseHeight ?? building.height ?? 12.8;
  if (!Number.isFinite(height) || height < 3.5 || height > 45) {
    throw new RangeError('Residential hall baseHeight must be finite and between 3.5 and 45 metres');
  }
  return { polygon, height };
}

function samePoint(a, b) {
  return !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4;
}

function resolveEntries(outerEdges, requested) {
  if (requested !== undefined && (!Array.isArray(requested) || !requested.length)) {
    throw new TypeError('Entrances must be a nonempty array');
  }
  const inputs = requested ?? [{
    edge: [...outerEdges].sort((a, b) => b.length - a.length)[0],
    source: 'illustrative-longest-edge',
  }];
  return inputs.map(entry => {
    let edge = outerEdges.find(e => samePoint(e.a, entry.edge?.a) && samePoint(e.b, entry.edge?.b));
    let distance = entry.distance;
    if (!edge && entry.edge?.a && Number.isFinite(entry.edge?.ux) && Number.isFinite(entry.edge?.uz) && Number.isFinite(distance)) {
      const pt = [entry.edge.a[0] + entry.edge.ux * distance, entry.edge.a[1] + entry.edge.uz * distance];
      edge = outerEdges.find(e => pointToSegmentDistance(pt, e.a, e.b) < 0.05);
      if (edge) distance = (pt[0] - edge.a[0]) * edge.ux + (pt[1] - edge.a[1]) * edge.uz;
    }
    if (edge && distance === undefined) distance = edge.length / 2;
    if (!edge || !Number.isFinite(distance) || distance < 0.8 || distance > edge.length - 0.8) {
      throw new RangeError('Entrance must lie cleanly on a mapped outer edge');
    }
    return { edge, distance, source: entry.source ?? 'caller-supplied' };
  });
}

function splitIntervals(lo, hi, blocked) {
  let spans = [[lo, hi]];
  for (const [bLo, bHi] of blocked) {
    spans = spans.flatMap(([a, b]) => {
      if (bHi <= a || bLo >= b) return [[a, b]];
      return [[a, Math.min(bLo, b)], [Math.max(bHi, a), b]].filter(([x, y]) => y - x > 0.2);
    });
  }
  return spans.filter(([x, y]) => y - x > 0.2);
}

/** Outward mitered offset of closed outer ring (used for July-36 Hall's projecting roof eaves). */
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
    const denom = Math.max(0.35, 1 + dot);
    let ox = (n0[0] + n1[0]) * (distance / denom);
    let oz = (n0[1] + n1[1]) * (distance / denom);
    const miterLen = Math.hypot(ox, oz);
    const maxMiter = distance * 1.45;
    if (miterLen > maxMiter) { ox *= maxMiter / miterLen; oz *= maxMiter / miterLen; }
    out.push([ring[i][0] + ox, ring[i][1] + oz]);
  }
  out.push([out[0][0], out[0][1]]);
  return out;
}

function pointClearance(pt, polygon) {
  if (!pointInPolygon(pt, polygon)) return -1;
  let minD = Infinity;
  for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) {
      const d = pointToSegmentDistance(pt, ring[i - 1], ring[i]);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/** Finds up to `count` well-separated interior rooftop anchors strictly inside the footprint. */
function findRoofAnchors(polygon, count = 3, minClearance = 3.6, minSpacing = 18) {
  const ring = polygon[0];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const candidates = [];
  const steps = 20;
  for (let ix = 1; ix < steps; ix++) {
    for (let iz = 1; iz < steps; iz++) {
      const pt = [minX + (maxX - minX) * ix / steps, minZ + (maxZ - minZ) * iz / steps];
      const room = pointClearance(pt, polygon);
      if (room >= minClearance) candidates.push({ point: pt, room });
    }
  }
  candidates.sort((a, b) => b.room - a.room);
  const chosen = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (chosen.every(p => Math.hypot(p.point[0] - c.point[0], p.point[1] - c.point[1]) >= minSpacing)) {
      chosen.push(c);
    }
  }
  return chosen;
}

function addRoofParapet(builder, allEdges, height, parapetH, colors, { overhang = 0 } = {}) {
  for (const edge of allEdges) {
    if (edge.length < 0.6) continue;
    builder.edgeBox(edge, 0, edge.length, height, height + parapetH, -0.22, 0.04 + overhang, colors.parapet, {
      sideColor: colors.pierShade ?? colors.parapet,
      back: true,
      bottom: false,
      top: false,
    });
    builder.edgeBox(edge, -0.02, edge.length + 0.02, height + parapetH, height + parapetH + 0.08, -0.26, 0.09 + overhang, colors.coping, {
      topColor: colors.coping,
      bottomColor: colors.soffit,
      back: true,
    });
  }
}

/** Raised rooftop stairhead enclosures (mumties) & cylindrical water tanks strictly inside the roof. */
function addRooftopStairheadsAndTanks(builder, polygon, refEdge, height, colors, {
  coreCount = 3,
  coreColor = colors.pier,
  roofCapColor = colors.coping,
  accentColor = colors.wallShade,
  coreHeight = 2.45,
  withTanks = true,
} = {}) {
  const anchors = findRoofAnchors(polygon, coreCount, 3.8, 22);
  let stairheadCount = 0;
  let waterTankCount = 0;
  let maxTopY = height;

  for (let i = 0; i < anchors.length; i++) {
    const { point: [cx, cz], room } = anchors[i];
    const halfU = Math.min(2.6, room * 0.42);
    const halfN = Math.min(1.9, room * 0.34);
    if (halfU < 1.0 || halfN < 0.9) continue;

    // Stairhead body + crisp overhanging roof slab + small roof access door
    builder.worldBox(cx, cz, height, height + coreHeight, halfU, halfN, refEdge.ux, refEdge.uz, refEdge.nx, refEdge.nz, coreColor, {
      sideColor: colors.pierShade ?? coreColor,
      topColor: roofCapColor,
      bottom: false,
    });
    builder.worldBox(cx, cz, height + coreHeight, height + coreHeight + 0.16, halfU + 0.24, halfN + 0.24, refEdge.ux, refEdge.uz, refEdge.nx, refEdge.nz, roofCapColor, {
      bottomColor: colors.soffit,
      bottom: true,
    });
    // Subtle stairwell doorway inset & accent fascia band
    builder.worldBox(cx, cz, height + coreHeight - 0.34, height + coreHeight - 0.10, halfU + 0.03, halfN + 0.03, refEdge.ux, refEdge.uz, refEdge.nx, refEdge.nz, accentColor, {
      top: false,
      bottom: false,
    });
    builder.worldBox(
      cx + refEdge.nx * (halfN + 0.02), cz + refEdge.nz * (halfN + 0.02),
      height + 0.06, height + Math.min(1.85, coreHeight - 0.38),
      Math.min(0.48, halfU * 0.35), 0.03,
      refEdge.ux, refEdge.uz, refEdge.nx, refEdge.nz,
      colors.glass, { top: false, bottom: false },
    );
    stairheadCount++;
    maxTopY = Math.max(maxTopY, height + coreHeight + 0.16);

    // Paired rooftop overhead water tanks perched beside or atop the stairhead core
    if (withTanks) {
      const tankBaseY = height + coreHeight + 0.16;
      const tankR = 0.56, tankH = 1.15;
      const tankColor = i % 2 === 0 ? colors.tankBody : colors.tankDark;
      for (const side of [-1, 1]) {
        const tx = cx + refEdge.ux * (side * Math.min(0.85, halfU * 0.45));
        const tz = cz + refEdge.uz * (side * Math.min(0.85, halfU * 0.45));
        builder.cylinder(tx, tz, tankBaseY, tankBaseY + 0.14, tankR * 0.92, tankR * 0.96, 8, colors.plinth, { top: false });
        builder.cylinder(tx, tz, tankBaseY + 0.14, tankBaseY + 0.14 + tankH, tankR, tankR, 8, tankColor, { topColor: colors.coping });
        waterTankCount++;
      }
      maxTopY = Math.max(maxTopY, tankBaseY + 0.14 + tankH);
    }
  }
  return { stairheadCount, waterTankCount, maxTopY };
}

/* -------------------------------------------------------------------------- */
/*  Lean 3D Arch, Window, Balcony & Gateway Primitives                        */
/* -------------------------------------------------------------------------- */

function roundArchCurve(halfW, springY, topY, segments = 4) {
  const rise = Math.max(0.05, topY - springY);
  const pts = [[-halfW, springY]];
  for (let i = 1; i < segments; i++) {
    const a = Math.PI - (i / segments) * Math.PI;
    pts.push([Math.cos(a) * halfW, springY + Math.sin(a) * rise]);
  }
  pts.push([halfW, springY]);
  return pts;
}

/**
 * Recessed rounded-top gallery/corridor arch bay along a wall edge.
 * Leaves ground openings 100% open when `openBottom` is true.
 */
function addRoundedArchBay(builder, edge, dCenter, halfW, y0, y1, colors, {
  frameThick = 0.16,
  frameDepth = 0.16,
  oBase = 0.03,
  segments = 4,
  openBottom = false,
  withGlass = true,
  withMullion = true,
  frameColor = colors.pier,
  revealColor = colors.soffit,
} = {}) {
  const crownRise = Math.min(halfW * 0.62, (y1 - y0) * 0.28);
  const springY = y1 - crownRise;
  const inHW = Math.max(0.18, halfW - frameThick);
  const inTop = Math.max(springY + 0.06, y1 - frameThick);
  const inSpring = Math.min(springY, inTop - crownRise * 0.72);
  const oFront = oBase + frameDepth;
  const nOut = [edge.nx, 0, edge.nz];

  // Left & right vertical jambs (front face + inner shaded reveal only — outer cheeks flush with wall/piers)
  builder.edgeFrontQuad(edge, dCenter - halfW, dCenter - inHW, y0, springY, oFront, frameColor);
  builder.edgeFrontQuad(edge, dCenter + inHW, dCenter + halfW, y0, springY, oFront, frameColor);
  builder.quad(
    edge.at(dCenter - inHW, y0, oFront), edge.at(dCenter - inHW, y0, oBase),
    edge.at(dCenter - inHW, springY, oBase), edge.at(dCenter - inHW, springY, oFront),
    [edge.ux, 0, edge.uz], revealColor,
  );
  builder.quad(
    edge.at(dCenter + inHW, y0, oBase), edge.at(dCenter + inHW, y0, oFront),
    edge.at(dCenter + inHW, springY, oFront), edge.at(dCenter + inHW, springY, oBase),
    [-edge.ux, 0, -edge.uz], revealColor,
  );

  // Curved top archivolt ring
  const outerArc = roundArchCurve(halfW, springY, y1, segments);
  const innerArc = roundArchCurve(inHW, inSpring, inTop, segments);
  for (let i = 0; i < outerArc.length - 1; i++) {
    const [ox0, oy0] = outerArc[i], [ox1, oy1] = outerArc[i + 1];
    const [ix0, iy0] = innerArc[i], [ix1, iy1] = innerArc[i + 1];
    // Front curved band
    builder.quad(
      edge.at(dCenter + ox0, oy0, oFront), edge.at(dCenter + ox1, oy1, oFront),
      edge.at(dCenter + ix1, iy1, oFront), edge.at(dCenter + ix0, iy0, oFront),
      nOut, frameColor,
    );
    // Inner shaded arch soffit reveal
    const dx = ix1 - ix0, dy = iy1 - iy0, len = Math.hypot(dx, dy) || 1;
    const rnU = dy / len, rnY = -dx / len;
    builder.quad(
      edge.at(dCenter + ix0, iy0, oFront), edge.at(dCenter + ix1, iy1, oFront),
      edge.at(dCenter + ix1, iy1, oBase), edge.at(dCenter + ix0, iy0, oBase),
      [edge.ux * rnU, rnY, edge.uz * rnU], revealColor,
    );
  }

  // Sill ledge (omitted when openBottom is true)
  if (!openBottom) {
    builder.edgeBox(edge, dCenter - halfW - 0.04, dCenter + halfW + 0.04, y0 - 0.09, y0, oBase, oFront + 0.04, colors.coping ?? frameColor, {
      bottomColor: revealColor, sides: false,
    });
  }

  // Recessed dark interior glazing / corridor depth
  if (withGlass && !openBottom) {
    const gZ = oBase + 0.015;
    builder.edgeFrontQuad(edge, dCenter - inHW, dCenter + inHW, y0, inSpring, gZ, colors.glass);
    const fanC = edge.at(dCenter, inSpring, gZ);
    for (let i = 0; i < innerArc.length - 1; i++) {
      builder.tri(
        fanC,
        edge.at(dCenter + innerArc[i][0], innerArc[i][1], gZ),
        edge.at(dCenter + innerArc[i + 1][0], innerArc[i + 1][1], gZ),
        nOut, colors.glass,
      );
    }
    if (withMullion) {
      const mZ = gZ + 0.02;
      builder.edgeFrontQuad(edge, dCenter - 0.025, dCenter + 0.025, y0, inTop - 0.03, mZ, colors.mullion);
      builder.edgeFrontQuad(edge, dCenter - inHW, dCenter + inHW, inSpring - 0.025, inSpring + 0.025, mZ, colors.mullion);
    }
  }
}

/**
 * Continuous horizontal corridor balcony slab + dark tubular railing across a wall span.
 */
function addBalconySpan(builder, edge, a, b, floorY, colors, {
  depth = 0.56,
  slabThick = 0.16,
  railHeight = 0.96,
  kneeWallHeight = 0,
  postSpacing = 4.6,
  slabColor = colors.pier,
} = {}) {
  if (b - a < 0.8) return;
  const oBase = 0.02;
  // Projecting floor slab with shaded soffit
  builder.edgeBox(edge, a, b, floorY - slabThick, floorY, oBase, oBase + depth, slabColor, {
    topColor: colors.pierShade ?? slabColor,
    bottomColor: colors.soffit,
    sideColor: slabColor,
  });

  const oRailIn = oBase + depth - 0.08;
  const oRailOut = oBase + depth - 0.02;

  if (kneeWallHeight > 0.12) {
    // Low solid plaster balcony apron + slender top handrail
    builder.edgeBox(edge, a, b, floorY, floorY + kneeWallHeight, oRailIn - 0.05, oBase + depth, slabColor, {
      topColor: colors.coping ?? slabColor,
      back: true,
      bottom: false,
      sides: false,
    });
  }

  // Top & mid dark-steel tubular railings (front, back, top — lean & crisp)
  const topY = floorY + railHeight;
  builder.edgeBox(edge, a, b, topY - 0.045, topY, oRailIn, oRailOut, colors.rail, {
    back: true, bottom: false, sides: false,
  });
  if (kneeWallHeight < 0.45) {
    const midY = floorY + (kneeWallHeight > 0 ? kneeWallHeight + (railHeight - kneeWallHeight) * 0.5 : railHeight * 0.52);
    builder.edgeBox(edge, a, b, midY - 0.028, midY + 0.028, oRailIn + 0.01, oRailOut - 0.01, colors.rail, {
      back: true, bottom: false, sides: false,
    });
  }

  // Slender vertical stanchion posts
  const postCount = Math.max(2, Math.floor((b - a) / postSpacing) + 1);
  const pBaseY = floorY + kneeWallHeight;
  for (let i = 0; i < postCount; i++) {
    const d = i === 0 ? a + 0.08 : i === postCount - 1 ? b - 0.08 : a + (b - a) * (i / (postCount - 1));
    builder.edgeBox(edge, d - 0.024, d + 0.024, pBaseY, topY - 0.04, oRailIn + 0.008, oRailOut - 0.008, colors.rail, {
      top: false, bottom: false, back: false, sides: true,
    });
  }
}

/**
 * Wall-mounted overhead portico canopy & flanking jamb pilasters strictly outside `clearHalf`.
 */
function addWallEntryCanopy(builder, edge, dCenter, clearHalf, canopyY, canopyDepth, colors, {
  jambColor = colors.pier,
  accentColor = null,
} = {}) {
  const jambW = 0.28;
  const outerHalf = clearHalf + jambW;
  for (const side of [-1, 1]) {
    const d0 = side < 0 ? dCenter - outerHalf : dCenter + clearHalf;
    const d1 = side < 0 ? dCenter - clearHalf : dCenter + outerHalf;
    builder.edgeBox(edge, d0, d1, 0, canopyY + 0.24, 0.02, 0.34, jambColor, {
      sideColor: colors.pierShade ?? jambColor, bottom: false,
    });
  }
  builder.edgeBox(edge, dCenter - outerHalf - 0.16, dCenter + outerHalf + 0.16, canopyY, canopyY + 0.24, 0.02, canopyDepth, jambColor, {
    topColor: colors.coping ?? jambColor,
    bottomColor: colors.soffit,
  });
  if (accentColor) {
    builder.edgeBox(edge, dCenter - outerHalf - 0.12, dCenter + outerHalf + 0.12, canopyY + 0.05, canopyY + 0.18, canopyDepth, canopyDepth + 0.03, accentColor, {
      top: false, bottom: false,
    });
  }
}

/**
 * Open scrolled wrought-iron gate leaf folded neatly back along a gateway pillar,
 * strictly outside `[-clearHalf, +clearHalf]` so the gate passage stays 100% raycast-clear!
 */
function addFoldedScrolledIronGate(builder, edge, dInnerEdge, side, oHinge, leafLen, gateHeight, ironColor) {
  const d0 = side < 0 ? dInnerEdge - 0.08 : dInnerEdge + 0.02;
  const d1 = side < 0 ? dInnerEdge - 0.02 : dInnerEdge + 0.08;
  const o0 = Math.max(0.45, oHinge - leafLen);
  const o1 = oHinge - 0.02;
  if (o1 - o0 < 0.35) return;

  // Top, mid, and bottom iron frame rails
  for (const [ry0, ry1] of [[0.14, 0.22], [gateHeight * 0.50, gateHeight * 0.56], [gateHeight - 0.08, gateHeight]]) {
    builder.edgeBox(edge, d0, d1, ry0, ry1, o0, o1, ironColor, { back: true });
  }
  // Vertical picket bars & ornamental spear tips along the folded leaf
  const bars = 6;
  for (let i = 0; i <= bars; i++) {
    const o = o0 + (o1 - o0) * (i / bars);
    builder.edgeBox(edge, d0 + 0.008, d1 - 0.008, 0.14, gateHeight + 0.14, o - 0.018, o + 0.018, ironColor, {
      back: true, bottom: false,
    });
  }
  // Decorative diamond scroll accents between mid and top rail
  const midY = gateHeight * 0.74;
  const dMid = (d0 + d1) / 2;
  const nSide = [side < 0 ? edge.ux : -edge.ux, 0, side < 0 ? edge.uz : -edge.uz];
  for (let i = 0; i < 3; i++) {
    const oc = o0 + (o1 - o0) * ((i + 0.5) / 3);
    const ro = (o1 - o0) * 0.11, ry = gateHeight * 0.11;
    const pL = edge.at(dMid, midY, oc - ro), pR = edge.at(dMid, midY, oc + ro);
    const pT = edge.at(dMid, midY + ry, oc), pB = edge.at(dMid, midY - ry, oc);
    builder.quad(pL, pB, pR, pT, nSide, ironColor);
  }
}

/**
 * Formal freestanding Hall Entrance Gateway standing cleanly outside the primary entrance.
 * Clear central opening spans `[-clearHalf, +clearHalf]` from ground `y = 0` up to `springY >= 3.30 m`!
 */
function addHallEntranceGateway(builder, edge, dCenter, colors, {
  clearHalf = 1.80,
  outward = 1.85,
  depth = 0.70,
  pierW = 0.68,
  springY = 3.38,
  headerTopY = 5.05,
  style = 'arched',
  foldedIronGates = false,
} = {}) {
  const o0 = outward;
  const o1 = outward + depth;
  const outerHalf = clearHalf + pierW;
  const mainC = colors.gateMain ?? colors.pier;
  const accentC = colors.gateAccent ?? colors.wall;
  const deepC = colors.gateDeep ?? colors.wallShade;
  const capC = colors.coping ?? mainC;

  // Twin gateway piers standing strictly outside [-clearHalf, +clearHalf]
  for (const side of [-1, 1]) {
    const dIn = side < 0 ? dCenter - clearHalf : dCenter + clearHalf;
    const dOut = side < 0 ? dCenter - outerHalf : dCenter + outerHalf;
    const dLo = Math.min(dIn, dOut), dHi = Math.max(dIn, dOut);
    const dOutFlareLo = side < 0 ? dLo - 0.10 : dLo;
    const dOutFlareHi = side < 0 ? dHi : dHi + 0.10;

    // Grounded plinth base (flares outward/front/back only, NEVER intruding into clear opening!)
    builder.edgeBox(edge, dOutFlareLo, dOutFlareHi, 0, 0.56, o0 - 0.08, o1 + 0.08, colors.plinth, {
      topColor: mainC, back: true, bottom: false,
    });
    // Main shaft
    builder.edgeBox(edge, dLo, dHi, 0.56, springY + 0.22, o0, o1, mainC, {
      sideColor: colors.pierShade ?? mainC, back: true, bottom: false, top: false,
    });
    // Decorative vertical recessed accent panel on front face of pier
    const pMid = (dLo + dHi) / 2, pHalf = pierW * 0.26;
    builder.edgeBox(edge, pMid - pHalf, pMid + pHalf, 0.85, springY - 0.18, o1, o1 + 0.04, accentC, {
      top: false, bottom: false,
    });
    // Molded pier capital / collar
    builder.edgeBox(edge, dOutFlareLo, dOutFlareHi, springY + 0.18, springY + 0.36, o0 - 0.08, o1 + 0.08, capC, {
      bottomColor: colors.soffit, back: true,
    });

    if (style === 'ornate-womens') {
      // Decorative stepped pyramid finials crowning both cream-stone women's hall gate piers
      const pTop = headerTopY + 0.18;
      builder.edgeBox(edge, dLo + 0.04, dHi - 0.04, springY + 0.36, pTop, o0 + 0.03, o1 - 0.03, mainC, {
        sideColor: colors.pierShade ?? mainC, back: true, bottom: false,
      });
      builder.edgeBox(edge, dOutFlareLo, dOutFlareHi, pTop, pTop + 0.14, o0 - 0.07, o1 + 0.07, capC, {
        bottomColor: colors.soffit, back: true,
      });
      builder.edgeBox(edge, dLo + 0.12, dHi - 0.12, pTop + 0.14, pTop + 0.36, o0 + 0.10, o1 - 0.10, accentC, { back: true });
      builder.edgeBox(edge, dLo + 0.22, dHi - 0.22, pTop + 0.36, pTop + 0.56, o0 + 0.20, o1 - 0.20, capC, { back: true });

      // Flanking low wing-wall stubs extending outward from the pillars (away from entry!)
      const stubLo = side < 0 ? dLo - 1.35 : dHi;
      const stubHi = side < 0 ? dLo : dHi + 1.35;
      builder.edgeBox(edge, stubLo, stubHi, 0, 1.35, o0 + 0.14, o1 - 0.14, mainC, { back: true, bottom: false });
      builder.edgeBox(edge, stubLo - 0.04, stubHi + 0.04, 1.35, 1.48, o0 + 0.08, o1 - 0.08, capC, { back: true });
    } else {
      // Pier extensions rising to entablature top with subtle stepped cap
      builder.edgeBox(edge, dLo, dHi, springY + 0.36, headerTopY + 0.12, o0, o1, mainC, {
        sideColor: colors.pierShade ?? mainC, back: true, bottom: false,
      });
      builder.edgeBox(edge, dOutFlareLo, dOutFlareHi, headerTopY + 0.12, headerTopY + 0.26, o0 - 0.08, o1 + 0.08, capC, {
        bottomColor: colors.soffit, back: true,
      });
    }

    if (foldedIronGates) {
      addFoldedScrolledIronGate(builder, edge, dIn, side, o0, Math.min(1.45, Math.max(0.75, outward - 0.65)), 2.35, colors.iron);
    }
  }

  // Overhead spanning arch / ornamental header strictly above y = springY (>= 3.35 m!)
  const archRise = Math.min(0.95, (headerTopY - springY) * 0.56);
  const archSegs = 6;
  const innerCurve = roundArchCurve(clearHalf, springY, springY + archRise, archSegs);
  const nOut = [edge.nx, 0, edge.nz], nIn = [-edge.nx, 0, -edge.nz];
  const spandrelTopY = headerTopY - 0.36;

  // Curved arch soffit & spandrel wall above the open arch
  for (let i = 0; i < innerCurve.length - 1; i++) {
    const [x0, y0] = innerCurve[i], [x1, y1] = innerCurve[i + 1];
    // Front spandrel panel
    builder.quad(
      edge.at(dCenter + x0, y0, o1), edge.at(dCenter + x1, y1, o1),
      edge.at(dCenter + x1, spandrelTopY, o1), edge.at(dCenter + x0, spandrelTopY, o1),
      nOut, mainC,
    );
    // Back spandrel panel
    builder.quad(
      edge.at(dCenter + x1, y0, o0), edge.at(dCenter + x0, y1, o0),
      edge.at(dCenter + x0, spandrelTopY, o0), edge.at(dCenter + x1, spandrelTopY, o0),
      nIn, mainC,
    );
    // Curved arch underside soffit
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    builder.quad(
      edge.at(dCenter + x0, y0, o1), edge.at(dCenter + x1, y1, o1),
      edge.at(dCenter + x1, y1, o0), edge.at(dCenter + x0, y0, o0),
      [edge.ux * (dy / len), -dx / len, edge.uz * (dy / len)], colors.soffit,
    );
    // Crisp projecting accent archivolt trim molding along front curve
    const trimH = 0.11;
    builder.quad(
      edge.at(dCenter + x0, y0, o1 + 0.03), edge.at(dCenter + x1, y1, o1 + 0.03),
      edge.at(dCenter + x1, Math.min(spandrelTopY, y1 + trimH), o1 + 0.03),
      edge.at(dCenter + x0, Math.min(spandrelTopY, y0 + trimH), o1 + 0.03),
      nOut, accentC,
    );
  }

  // Upper entablature fascia nameplate beam & cornice cap
  const beamW = outerHalf + 0.14;
  builder.edgeBox(edge, dCenter - beamW, dCenter + beamW, spandrelTopY, headerTopY, o0 - 0.06, o1 + 0.06, accentC, {
    sideColor: deepC, back: true,
  });
  builder.edgeBox(edge, dCenter - beamW - 0.08, dCenter + beamW + 0.08, headerTopY, headerTopY + 0.16, o0 - 0.12, o1 + 0.12, capC, {
    bottomColor: colors.soffit, back: true,
  });

  if (style === 'ornate-womens') {
    // Curved ornamental crest pediment rising gracefully over center of the women's hall gate!
    const crestHW = clearHalf * 0.68;
    const crestBaseY = headerTopY + 0.16;
    const crestTopY = crestBaseY + 0.74;
    const crestPts = roundArchCurve(crestHW, crestBaseY, crestTopY, 6);
    const cCenterF = edge.at(dCenter, crestBaseY, o1 + 0.02);
    const cCenterB = edge.at(dCenter, crestBaseY, o0 - 0.02);
    for (let i = 0; i < crestPts.length - 1; i++) {
      const [x0, y0] = crestPts[i], [x1, y1] = crestPts[i + 1];
      builder.tri(cCenterF, edge.at(dCenter + x0, y0, o1 + 0.02), edge.at(dCenter + x1, y1, o1 + 0.02), nOut, mainC);
      builder.tri(cCenterB, edge.at(dCenter + x1, y1, o0 - 0.02), edge.at(dCenter + x0, y0, o0 - 0.02), nIn, mainC);
      // Curved top rim of crest medallion
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      builder.quad(
        edge.at(dCenter + x0, y0, o1 + 0.05), edge.at(dCenter + x1, y1, o1 + 0.05),
        edge.at(dCenter + x1, y1, o0 - 0.05), edge.at(dCenter + x0, y0, o0 - 0.05),
        [-edge.ux * (dy / len), dx / len, -edge.uz * (dy / len)], accentC,
      );
    }
    // Crisp central ornamental medallion inset
    builder.edgeBox(edge, dCenter - 0.55, dCenter + 0.55, crestBaseY + 0.14, crestBaseY + 0.44, o1 + 0.02, o1 + 0.07, accentC);
  } else if (style === 'pergola-beam') {
    // Lalon Shah Hall: twin concrete crest parapet fins & central raised fascia tablet
    builder.edgeBox(edge, dCenter - clearHalf * 0.55, dCenter + clearHalf * 0.55, headerTopY + 0.16, headerTopY + 0.56, o0 + 0.04, o1 - 0.04, mainC, { back: true });
    builder.edgeBox(edge, dCenter - clearHalf * 0.60, dCenter + clearHalf * 0.60, headerTopY + 0.56, headerTopY + 0.66, o0, o1, capC, { back: true });
  } else {
    // Stepped formal central entablature tablet (Shah Azizur, Shahid Ziaur, Saddam)
    builder.edgeBox(edge, dCenter - clearHalf * 0.62, dCenter + clearHalf * 0.62, headerTopY + 0.16, headerTopY + 0.52, o0, o1, deepC, { back: true });
    builder.edgeBox(edge, dCenter - clearHalf * 0.68, dCenter + clearHalf * 0.68, headerTopY + 0.52, headerTopY + 0.64, o0 - 0.06, o1 + 0.06, capC, { back: true });
  }
}

/* -------------------------------------------------------------------------- */
/*  Individual Architectural Builders for All 8 Halls + Jia Hall Mosque       */
/* -------------------------------------------------------------------------- */

function buildBlockedMap(outerEdges, entries, apertureClearHalf, detailMargin) {
  const apertureByEdge = new Map();
  const detailByEdge = new Map();
  const addInt = (map, idx, lo, hi) => {
    if (!map.has(idx)) map.set(idx, []);
    map.get(idx).push([lo, hi]);
  };
  const entrySpecs = entries.map((entry, idx) => {
    const ei = outerEdges.indexOf(entry.edge);
    const maxAvail = Math.min(entry.distance - 0.6, entry.edge.length - entry.distance - 0.6);
    const clearHalf = Math.max(0.85, Math.min(apertureClearHalf, maxAvail));
    addInt(apertureByEdge, ei, entry.distance - clearHalf - 0.04, entry.distance + clearHalf + 0.04);
    addInt(detailByEdge, ei, entry.distance - clearHalf - detailMargin, entry.distance + clearHalf + detailMargin);
    return { ...entry, edgeIndex: ei, clearHalf, primary: idx === 0 };
  });
  return { apertureByEdge, detailByEdge, entrySpecs };
}

/** 1. way/532464837 — Shah Azizur Rahman Hall (#ce8e72 terracotta-salmon + white piers + balconies + gateway) */
function buildShahAzizurHall(builder, polygon, allEdges, outerEdges, entries, height, colors) {
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const { apertureByEdge, detailByEdge, entrySpecs } = buildBlockedMap(outerEdges, entries, 1.55, 0.55);

  const primary = entrySpecs[0];
  const gateClearHalf = Math.min(1.80, Math.max(1.25, primary.edge.length / 2 - 1.2));
  // Formal terracotta-and-cream arched Hall Entrance Gateway standing cleanly in forecourt
  addHallEntranceGateway(builder, primary.edge, primary.distance, colors, {
    clearHalf: gateClearHalf,
    outward: 1.55,
    depth: 0.68,
    pierW: 0.66,
    springY: 3.38,
    headerTopY: 5.05,
    style: 'arched',
  });
  for (const es of entrySpecs) {
    addWallEntryCanopy(builder, es.edge, es.distance, es.clearHalf, Math.min(height - 1.2, 3.28), 0.92, colors, {
      jambColor: colors.pier,
      accentColor: colors.wall,
    });
  }

  let bayCountTotal = 0;
  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = apertureByEdge.get(ei) ?? [];
    const detailBlocked = detailByEdge.get(ei) ?? [];

    // Grounded plinth skirt (strictly open across entrances)
    for (const [a, b] of splitIntervals(0, edge.length, apertureBlocked)) {
      builder.edgeBox(edge, a, b, 0, 0.46, 0.02, 0.14, colors.plinth, { topColor: colors.pierShade, bottom: false });
    }

    // Continuous multi-storey open-corridor balcony slabs & iron railings on upper floors
    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      const spans = splitIntervals(0.15, edge.length - 0.15, []);
      for (const [a, b] of spans) {
        addBalconySpan(builder, edge, a, b, fy, colors, {
          depth: 0.56,
          slabThick: 0.16,
          railHeight: 0.96,
          postSpacing: 5.6,
        });
      }
    }

    // Rhythmic crisp off-white vertical piers framing warm terracotta-salmon room bays & rounded-top gallery bays
    const bays = Math.max(1, Math.floor(edge.length / 5.6));
    const step = edge.length / bays;
    for (let i = 0; i <= bays; i++) {
      const d = i === 0 ? 0.24 : i === bays ? edge.length - 0.24 : i * step;
      if (detailBlocked.some(([lo, hi]) => d >= lo && d <= hi)) continue;
      builder.edgeBox(edge, d - 0.16, d + 0.16, 0.44, height, 0.03, 0.22, colors.pier, {
        sideColor: colors.pierShade, bottom: false, top: false,
      });
    }

    for (let b = 0; b < bays; b++) {
      const dc = (b + 0.5) * step;
      const hw = Math.min(1.30, step * 0.30);
      if (detailBlocked.some(([lo, hi]) => dc + hw + 0.18 > lo && dc - hw - 0.18 < hi)) continue;
      bayCountTotal++;
      const isRoundedGallery = b % 2 === 0;
      for (let f = 0; f < floors; f++) {
        const fy = f * floorH;
        const y0 = fy + (f === 0 ? 0.92 : 0.96);
        const y1 = Math.min(height - 0.44, fy + floorH - 0.36);
        if (y1 - y0 < 0.72) continue;
        // Terracotta-salmon wall panel infill behind bay
        builder.edgeFrontQuad(edge, dc - step * 0.43, dc + step * 0.43, fy + (f === 0 ? 0.46 : 0.02), fy + floorH - 0.16, 0.032, colors.wall);
        if (isRoundedGallery) {
          addRoundedArchBay(builder, edge, dc, hw, y0, y1, colors, {
            frameThick: 0.12, frameDepth: 0.11, oBase: 0.038, segments: 3, withGlass: true, withMullion: false,
          });
        } else {
          // Crisp rectangular recessed room bay with pale lintel & sill
          builder.edgeFrontQuad(edge, dc - hw, dc + hw, y0, y1, 0.045, colors.glass);
          builder.edgeFrontQuad(edge, dc - 0.022, dc + 0.022, y0, y1, 0.058, colors.mullion);
          builder.edgeBox(edge, dc - hw - 0.08, dc + hw + 0.08, y1, y1 + 0.11, 0.035, 0.16, colors.pier, { bottomColor: colors.soffit, sides: false });
          builder.edgeBox(edge, dc - hw - 0.06, dc + hw + 0.06, y0 - 0.08, y0, 0.035, 0.14, colors.pierShade, { bottomColor: colors.soffit, sides: false });
        }
      }
    }
  }

  addRoofParapet(builder, allEdges, height, 0.62, colors);
  const roof = addRooftopStairheadsAndTanks(builder, polygon, primary.edge, height, colors, {
    coreCount: 3, coreColor: colors.pier, accentColor: colors.wall, coreHeight: 2.5, withTanks: true,
  });
  return {
    features: ['terracotta-salmon-panels', 'white-structural-piers', 'open-corridor-balconies', 'rounded-gallery-bays', 'arched-hall-gateway', 'rooftop-stairheads-and-tanks'],
    bayCount: bayCountTotal,
    gatewayCount: 1,
    ...roof,
    maxTopY: Math.max(roof.maxTopY, height + 0.70),
  };
}

/** 2. way/967967197 — Shahid Ziaur Rahman Hall (#e0ddcc ivory-cream + repeated rounded courtyard arches + cream archway) */
function buildShahidZiaurHall(builder, polygon, allEdges, outerEdges, entries, height, colors) {
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const { apertureByEdge, detailByEdge, entrySpecs } = buildBlockedMap(outerEdges, entries, 1.65, 0.6);

  const primary = entrySpecs[0];
  addHallEntranceGateway(builder, primary.edge, primary.distance, colors, {
    clearHalf: 1.90,
    outward: 2.15,
    depth: 0.74,
    pierW: 0.70,
    springY: 3.42,
    headerTopY: 5.15,
    style: 'arched',
  });
  for (const es of entrySpecs) {
    addWallEntryCanopy(builder, es.edge, es.distance, es.clearHalf, Math.min(height - 1.2, 3.30), 0.96, colors, {
      jambColor: colors.pier,
      accentColor: colors.gateAccent,
    });
  }

  let bayCountTotal = 0;
  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = apertureByEdge.get(ei) ?? [];
    const detailBlocked = detailByEdge.get(ei) ?? [];

    for (const [a, b] of splitIntervals(0, edge.length, apertureBlocked)) {
      builder.edgeBox(edge, a, b, 0, 0.48, 0.02, 0.14, colors.plinth, { topColor: colors.pierShade, bottom: false });
    }

    // Continuous horizontal shaded corridor balcony bands across every upper floor
    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      addBalconySpan(builder, edge, 0.12, edge.length - 0.12, fy, colors, {
        depth: 0.54,
        slabThick: 0.17,
        railHeight: 0.95,
        kneeWallHeight: 0.42,
        postSpacing: 5.2,
        slabColor: colors.wall,
      });
    }

    // Repeated dark recessed rounded-top corridor arches framed in warm ivory-cream
    const bays = Math.max(1, Math.floor(edge.length / 5.0));
    const step = edge.length / bays;
    for (let i = 0; i <= bays; i++) {
      const d = i === 0 ? 0.24 : i === bays ? edge.length - 0.24 : i * step;
      if (detailBlocked.some(([lo, hi]) => d >= lo && d <= hi)) continue;
      builder.edgeBox(edge, d - 0.16, d + 0.16, 0.46, height, 0.03, 0.20, colors.pier, {
        sideColor: colors.pierShade, bottom: false, top: false,
      });
    }
    for (let b = 0; b < bays; b++) {
      const dc = (b + 0.5) * step;
      const hw = Math.min(1.30, step * 0.31);
      if (detailBlocked.some(([lo, hi]) => dc + hw + 0.18 > lo && dc - hw - 0.18 < hi)) continue;
      bayCountTotal++;
      for (let f = 0; f < floors; f++) {
        const fy = f * floorH;
        const y0 = fy + (f === 0 ? 0.88 : 0.98);
        const y1 = Math.min(height - 0.42, fy + floorH - 0.34);
        if (y1 - y0 < 0.72) continue;
        addRoundedArchBay(builder, edge, dc, hw, y0, y1, colors, {
          frameThick: 0.13, frameDepth: 0.13, oBase: 0.035, segments: 3, withGlass: true, withMullion: false,
          frameColor: colors.pier,
        });
      }
    }
  }

  addRoofParapet(builder, allEdges, height, 0.64, colors);
  const roof = addRooftopStairheadsAndTanks(builder, polygon, primary.edge, height, colors, {
    coreCount: 3, coreColor: colors.pier, accentColor: colors.wallShade, coreHeight: 2.55, withTanks: true,
  });
  return {
    features: ['ivory-cream-wings', 'rounded-corridor-arches', 'continuous-shaded-balcony-bands', 'cream-stone-entrance-archway', 'rooftop-staircase-cores'],
    bayCount: bayCountTotal,
    gatewayCount: 1,
    ...roof,
    maxTopY: Math.max(roof.maxTopY, height + 0.72),
  };
}

/** 3. way/532464846 — July-36 Hall (#d2c58f cream-yellow + projecting eaves + narrow horizontal window bands + salmon vertical bays + triangular pediment entrance canopy!) */
function buildJuly36Hall(builder, polygon, allEdges, outerEdges, entries, height, colors) {
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const { apertureByEdge, detailByEdge, entrySpecs } = buildBlockedMap(outerEdges, entries, 1.70, 0.85);
  const primary = entrySpecs[0];

  // Signature projecting roof eaves cantilevered cleanly around the outer perimeter
  const eaveOverhang = 0.68;
  const eaveRing = offsetOuterRing(polygon[0], eaveOverhang);
  const eavePoly = [eaveRing, ...polygon.slice(1)];
  const eaveSoffit = buildingGeometry(eavePoly, 0.08);
  eaveSoffit.translate(0, height - 0.08, 0);
  builder.addGeometry(eaveSoffit, colors.soffit);
  eaveSoffit.dispose();
  const eaveSlab = buildingGeometry(eavePoly, 0.26);
  eaveSlab.translate(0, height, 0);
  builder.addGeometry(eaveSlab, colors.pier);
  eaveSlab.dispose();

  // Unmistakable SIGNATURE TRIANGULAR PEDIMENT ENTRANCE CANOPY over the open ground-level entryway!
  for (const es of entrySpecs) {
    const { edge, distance, clearHalf } = es;
    const canopyY = Math.min(height - 2.6, 3.38);
    const canopyDepth = 2.45;
    const pedHalfW = clearHalf + 0.92;
    const peakRise = 1.65;
    const colOut = canopyDepth - 0.32;

    // Warm salmon vertical recessed entry bay climbing the full building height behind the pediment
    builder.edgeBox(edge, distance - pedHalfW, distance - clearHalf, 0.44, height - 0.08, 0.025, 0.14, colors.salmon, {
      sideColor: colors.salmonShade, bottom: false, top: false,
    });
    builder.edgeBox(edge, distance + clearHalf, distance + pedHalfW, 0.44, height - 0.08, 0.025, 0.14, colors.salmon, {
      sideColor: colors.salmonShade, bottom: false, top: false,
    });
    builder.edgeBox(edge, distance - pedHalfW, distance + pedHalfW, canopyY + 0.18, height - 0.08, 0.025, 0.12, colors.salmon, {
      sideColor: colors.salmonShade, bottom: false, top: false,
    });
    // Vertical glazed stair/lobby window inside the upper salmon entry bay
    if (height - (canopyY + peakRise) > 1.4) {
      const wY0 = canopyY + peakRise + 0.45, wY1 = height - 0.65;
      builder.edgeFrontQuad(edge, distance - clearHalf * 0.72, distance + clearHalf * 0.72, wY0, wY1, 0.135, colors.glass);
      builder.edgeBox(edge, distance - clearHalf * 0.72 - 0.08, distance + clearHalf * 0.72 + 0.08, wY1, wY1 + 0.12, 0.12, 0.24, colors.pier);
    }

    // Paired crisp pale columns flanking the open entryway (strictly outside [-clearHalf, +clearHalf]!)
    for (const side of [-1, 1]) {
      const colCenter = distance + side * (clearHalf + 0.34);
      // Front portico column + rear wall pilaster
      for (const [o0, o1] of [[0.03, 0.42], [colOut - 0.22, colOut + 0.22]]) {
        builder.edgeBox(edge, colCenter - 0.24, colCenter + 0.24, 0, 0.46, o0 - 0.04, o1 + 0.04, colors.plinth, {
          topColor: colors.pier, back: true, bottom: false,
        });
        builder.edgeBox(edge, colCenter - 0.19, colCenter + 0.19, 0.46, canopyY, o0, o1, colors.pier, {
          sideColor: colors.pierShade, back: true, bottom: false, top: false,
        });
        builder.edgeBox(edge, colCenter - 0.25, colCenter + 0.25, canopyY - 0.12, canopyY, o0 - 0.05, o1 + 0.05, colors.coping, {
          bottomColor: colors.soffit, back: true,
        });
      }
      // Overhead side tie-beam connecting front column back to wall
      builder.edgeBox(edge, colCenter - 0.18, colCenter + 0.18, canopyY, canopyY + 0.28, 0.03, canopyDepth, colors.pier, {
        bottomColor: colors.soffit, back: true,
      });
    }

    // Horizontal canopy soffit & entablature beam strictly above y = canopyY (>= 3.38m!)
    builder.edgeBox(edge, distance - pedHalfW - 0.14, distance + pedHalfW + 0.14, canopyY, canopyY + 0.28, 0.03, canopyDepth, colors.pier, {
      topColor: colors.coping, bottomColor: colors.soffit, back: true,
    });
    // Salmon horizontal frieze strip across pediment entablature
    builder.edgeBox(edge, distance - pedHalfW, distance + pedHalfW, canopyY + 0.06, canopyY + 0.20, canopyDepth, canopyDepth + 0.035, colors.salmon);

    // Sculpted TRIANGULAR PEDIMENT GABLE (front tympanum, two sloped raking roofs, ridge cap!)
    const gableBaseY = canopyY + 0.28;
    const peakY = gableBaseY + peakRise;
    const oFront = canopyDepth, oBack = 0.03;
    const nOut = [edge.nx, 0, edge.nz];
    const fL = edge.at(distance - pedHalfW, gableBaseY, oFront);
    const fR = edge.at(distance + pedHalfW, gableBaseY, oFront);
    const fP = edge.at(distance, peakY, oFront);
    const bL = edge.at(distance - pedHalfW, gableBaseY, oBack);
    const bR = edge.at(distance + pedHalfW, gableBaseY, oBack);
    const bP = edge.at(distance, peakY, oBack);

    // Recessed warm salmon triangular tympanum on front gable face
    builder.tri(fL, fR, fP, nOut, colors.salmon);
    // Crisp white raking roof slabs (overhanging 0.22m on left, right, and front!)
    const slopeLen = Math.hypot(pedHalfW + 0.22, peakRise + 0.12) || 1;
    const rThick = 0.16;
    const roofOFront = oFront + 0.22;
    const eaveDrop = 0.09;
    // Left roof slope (normal tilts up & -edge.u)
    const nLeftSlope = [-edge.ux * (peakRise / slopeLen), (pedHalfW + 0.22) / slopeLen, -edge.uz * (peakRise / slopeLen)];
    const rLF0 = edge.at(distance - pedHalfW - 0.22, gableBaseY - eaveDrop, roofOFront);
    const rLB0 = edge.at(distance - pedHalfW - 0.22, gableBaseY - eaveDrop, oBack);
    const rPF0 = edge.at(distance, peakY + rThick, roofOFront);
    const rPB0 = edge.at(distance, peakY + rThick, oBack);
    const rLF1 = edge.at(distance - pedHalfW - 0.22, gableBaseY - eaveDrop - rThick, roofOFront);
    const rLB1 = edge.at(distance - pedHalfW - 0.22, gableBaseY - eaveDrop - rThick, oBack);
    const rPF1 = edge.at(distance, peakY, roofOFront);
    const rPB1 = edge.at(distance, peakY, oBack);
    builder.quad(rLF0, rPF0, rPB0, rLB0, nLeftSlope, colors.coping);
    builder.quad(rLF1, rLB1, rPB1, rPF1, [-nLeftSlope[0], -nLeftSlope[1], -nLeftSlope[2]], colors.soffit);
    builder.quad(rLF1, rPF1, rPF0, rLF0, nOut, colors.pier);

    // Right roof slope (normal tilts up & +edge.u)
    const nRightSlope = [edge.ux * (peakRise / slopeLen), (pedHalfW + 0.22) / slopeLen, edge.uz * (peakRise / slopeLen)];
    const rRF0 = edge.at(distance + pedHalfW + 0.22, gableBaseY - eaveDrop, roofOFront);
    const rRB0 = edge.at(distance + pedHalfW + 0.22, gableBaseY - eaveDrop, oBack);
    const rRF1 = edge.at(distance + pedHalfW + 0.22, gableBaseY - eaveDrop - rThick, roofOFront);
    const rRB1 = edge.at(distance + pedHalfW + 0.22, gableBaseY - eaveDrop - rThick, oBack);
    builder.quad(rPF0, rRF0, rRB0, rPB0, nRightSlope, colors.coping);
    builder.quad(rPF1, rPB1, rRB1, rRF1, [-nRightSlope[0], -nRightSlope[1], -nRightSlope[2]], colors.soffit);
    builder.quad(rPF1, rRF1, rRF0, rPF0, nOut, colors.pier);
    // Close back gable wall triangle lightly
    builder.tri(bR, bL, bP, [-edge.nx, 0, -edge.nz], colors.pierShade);
  }

  let windowBandCount = 0;
  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = apertureByEdge.get(ei) ?? [];
    const detailBlocked = [...(detailByEdge.get(ei) ?? [])];

    for (const [a, b] of splitIntervals(0, edge.length, apertureBlocked)) {
      builder.edgeBox(edge, a, b, 0, 0.46, 0.02, 0.14, colors.plinth, { topColor: colors.pierShade, bottom: false });
    }

    // Secondary warm salmon vertical recessed stair/entry accent bays on long wings
    if (edge.length >= 45) {
      for (const frac of [0.22, 0.78]) {
        const dc = edge.length * frac;
        if (detailBlocked.some(([lo, hi]) => dc + 2.2 > lo && dc - 2.2 < hi)) continue;
        builder.edgeBox(edge, dc - 1.55, dc + 1.55, 0.46, height - 0.08, 0.028, 0.13, colors.salmon, {
          sideColor: colors.salmonShade, bottom: false, top: false,
        });
        // Crisp vertical pale framing edges & tall stair slit glazing
        builder.edgeBox(edge, dc - 1.68, dc - 1.55, 0.46, height - 0.08, 0.03, 0.20, colors.pier, { bottom: false, top: false });
        builder.edgeBox(edge, dc + 1.55, dc + 1.68, 0.46, height - 0.08, 0.03, 0.20, colors.pier, { bottom: false, top: false });
        builder.edgeFrontQuad(edge, dc - 0.58, dc + 0.58, 1.35, height - 0.75, 0.142, colors.glass);
        for (let f = 1; f < floors; f++) {
          builder.edgeBox(edge, dc - 0.62, dc + 0.62, f * floorH - 0.08, f * floorH + 0.08, 0.13, 0.20, colors.pier);
        }
        detailBlocked.push([dc - 1.8, dc + 1.8]);
      }
    }

    // Continuous narrow dark horizontal window bands with crisp pale framing on every storey!
    const spans = splitIntervals(0.55, edge.length - 0.55, detailBlocked);
    for (const [a, b] of spans) {
      if (b - a < 2.2) continue;
      for (let f = 0; f < floors; f++) {
        const fy = f * floorH;
        const winY0 = fy + (f === 0 ? 1.25 : 1.18);
        const winY1 = Math.min(height - 0.55, winY0 + 0.96);
        if (winY1 - winY0 < 0.62) continue;
        windowBandCount++;
        // Cream-yellow facade band spandrel & upper pale horizontal hood/sill framing
        builder.edgeFrontQuad(edge, a, b, fy + (f === 0 ? 0.46 : 0.08), winY0 - 0.08, 0.032, colors.wall);
        builder.edgeFrontQuad(edge, a, b, winY0, winY1, 0.044, colors.glass);
        // Projecting crisp pale upper hood & lower sill framing the horizontal ribbon window
        builder.edgeBox(edge, a - 0.06, b + 0.06, winY1, winY1 + 0.12, 0.03, 0.24, colors.pier, {
          topColor: colors.coping, bottomColor: colors.soffit,
        });
        builder.edgeBox(edge, a - 0.04, b + 0.04, winY0 - 0.09, winY0, 0.03, 0.18, colors.pierShade, {
          bottomColor: colors.soffit,
        });
        // Slender vertical pale mullions dividing the continuous window ribbon
        const mCount = Math.max(2, Math.floor((b - a) / 2.8));
        for (let m = 0; m <= mCount; m++) {
          const dm = a + (b - a) * (m / mCount);
          builder.edgeBox(edge, dm - 0.045, dm + 0.045, winY0, winY1, 0.044, 0.13, colors.pier, { top: false, bottom: false });
        }
      }
    }
  }

  addRoofParapet(builder, allEdges, height + 0.26, 0.54, colors);
  const roof = addRooftopStairheadsAndTanks(builder, polygon, primary.edge, height + 0.26, colors, {
    coreCount: 3, coreColor: colors.pier, accentColor: colors.salmon, coreHeight: 2.35, withTanks: true,
  });
  return {
    features: ['projecting-roof-eaves', 'narrow-horizontal-window-bands', 'salmon-vertical-entry-bays', 'triangular-pediment-entrance-canopy', 'rooftop-stairheads'],
    windowBandCount,
    hasTriangularPediment: true,
    ...roof,
    maxTopY: Math.max(roof.maxTopY, height + 0.88),
  };
}

/** 4. way/967967198 — Shahid Anas Hall (#d49650 bold ochre-orange panels + crisp white grid + louvers + tall white portal bay) */
function buildShahidAnasHall(builder, polygon, allEdges, outerEdges, entries, height, colors) {
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const { apertureByEdge, detailByEdge, entrySpecs } = buildBlockedMap(outerEdges, entries, 1.65, 0.72);
  const primary = entrySpecs[0];

  // Signature TALL WHITE-FRAMED PORTAL ENTRANCE BAY climbing full building height + parapet crown!
  for (const es of entrySpecs) {
    const { edge, distance, clearHalf } = es;
    const portalHW = clearHalf + 0.56;
    const portalTop = height + 1.32;
    const canopyY = Math.min(height - 1.5, 3.38);

    // Tall vertical white portal frame piers rising above the roofline
    for (const side of [-1, 1]) {
      const dLo = side < 0 ? distance - portalHW : distance + clearHalf;
      const dHi = side < 0 ? distance - clearHalf : distance + portalHW;
      builder.edgeBox(edge, dLo, dHi, 0, portalTop, 0.02, 0.72, colors.pier, {
        sideColor: colors.pierShade, bottom: false,
      });
      // Ochre inset relief stripe along the tall portal pier face
      const pMid = (dLo + dHi) / 2;
      builder.edgeBox(edge, pMid - 0.11, pMid + 0.11, 0.52, height - 0.25, 0.72, 0.75, colors.wall, {
        top: false, bottom: false,
      });
    }
    // Bold overhanging top portal crown beam above roofline
    builder.edgeBox(edge, distance - portalHW - 0.14, distance + portalHW + 0.14, height + 0.68, portalTop, 0.02, 0.82, colors.pier, {
      topColor: colors.coping, bottomColor: colors.soffit, back: true,
    });
    builder.edgeBox(edge, distance - clearHalf, distance + clearHalf, height + 0.78, portalTop - 0.14, 0.82, 0.86, colors.wall);

    // Deep cantilevered white entrance canopy sheltering the open ground-level passage (y >= 3.38 m!)
    builder.edgeBox(edge, distance - portalHW - 0.16, distance + portalHW + 0.16, canopyY, canopyY + 0.28, 0.02, 2.25, colors.pier, {
      topColor: colors.coping, bottomColor: colors.soffit,
    });
    builder.edgeBox(edge, distance - portalHW - 0.08, distance + portalHW + 0.08, canopyY + 0.07, canopyY + 0.20, 2.25, 2.28, colors.wall);

    // Upper tall vertical glazed lobby & louver stack inside the tall white portal bay
    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      const y0 = Math.max(canopyY + 0.45, fy + 0.68);
      const y1 = Math.min(height - 0.28, fy + floorH - 0.26);
      if (y1 - y0 < 0.65) continue;
      builder.edgeFrontQuad(edge, distance - clearHalf + 0.08, distance + clearHalf - 0.08, y0, y1, 0.12, colors.glass);
      // White horizontal louver fin across portal window
      builder.edgeBox(edge, distance - clearHalf, distance + clearHalf, y1, y1 + 0.12, 0.06, 0.56, colors.pier, {
        bottomColor: colors.soffit,
      });
      builder.edgeBox(edge, distance - clearHalf, distance + clearHalf, fy - 0.10, fy + 0.10, 0.06, 0.48, colors.pier, {
        bottomColor: colors.soffit,
      });
      for (const mx of [-0.55, 0, 0.55]) {
        builder.edgeBox(edge, distance + mx - 0.03, distance + mx + 0.03, y0, y1, 0.12, 0.20, colors.pier, {
          top: false, bottom: false,
        });
      }
    }
  }

  let gridCellCount = 0;
  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = apertureByEdge.get(ei) ?? [];
    const detailBlocked = detailByEdge.get(ei) ?? [];

    for (const [a, b] of splitIntervals(0, edge.length, apertureBlocked)) {
      builder.edgeBox(edge, a, b, 0, 0.46, 0.02, 0.15, colors.plinth, { topColor: colors.pierShade, bottom: false });
    }

    // Crisp white horizontal grid slab bands across every floor
    for (let f = 1; f <= floors; f++) {
      const fy = f === floors ? height - 0.16 : f * floorH;
      for (const [a, b] of splitIntervals(0, edge.length, detailBlocked)) {
        builder.edgeBox(edge, a, b, fy - 0.12, fy + 0.14, 0.03, 0.26, colors.pier, {
          topColor: colors.coping, bottomColor: colors.soffit,
        });
      }
    }

    // Crisp white vertical grid columns framing bold ochre-orange infill panels + horizontal sunshade louvers!
    const bays = Math.max(1, Math.floor(edge.length / 4.2));
    const step = edge.length / bays;
    for (let i = 0; i <= bays; i++) {
      const d = i === 0 ? 0.22 : i === bays ? edge.length - 0.22 : i * step;
      if (detailBlocked.some(([lo, hi]) => d >= lo && d <= hi)) continue;
      builder.edgeBox(edge, d - 0.16, d + 0.16, 0.44, height, 0.03, 0.26, colors.pier, {
        sideColor: colors.pierShade, bottom: false, top: false,
      });
    }

    for (let b = 0; b < bays; b++) {
      const dc = (b + 0.5) * step;
      const cellHW = Math.max(0.55, step * 0.5 - 0.20);
      if (detailBlocked.some(([lo, hi]) => dc + cellHW + 0.06 > lo && dc - cellHW - 0.06 < hi)) continue;
      for (let f = 0; f < floors; f++) {
        const fy = f * floorH;
        const cellBot = fy + (f === 0 ? 0.48 : 0.15);
        const cellTop = Math.min(height - 0.28, fy + floorH - 0.13);
        const winY0 = cellBot + (f === 0 ? 0.72 : 0.78);
        const winY1 = Math.min(cellTop - 0.22, winY0 + 1.02);
        if (winY1 - winY0 < 0.55) continue;
        gridCellCount++;

        // Bold ochre-orange lower infill panel & top header inside the white grid cell
        builder.edgeBox(edge, dc - cellHW, dc + cellHW, cellBot, winY0 - 0.06, 0.03, 0.10, colors.wall, {
          topColor: colors.wallShade, bottom: false,
        });
        if (cellTop - winY1 > 0.14) {
          builder.edgeFrontQuad(edge, dc - cellHW, dc + cellHW, winY1 + 0.08, cellTop, 0.05, colors.wallShade);
        }
        // Narrow dark horizontal window opening
        builder.edgeFrontQuad(edge, dc - cellHW + 0.06, dc + cellHW - 0.06, winY0, winY1, 0.042, colors.glass);
        // White mullions
        builder.edgeFrontQuad(edge, dc - 0.025, dc + 0.025, winY0, winY1, 0.056, colors.mullion);
        // Horizontal white sunshade louver bands (main upper brise-soleil + secondary mid fin)
        builder.edgeBox(edge, dc - cellHW + 0.02, dc + cellHW - 0.02, winY1, winY1 + 0.09, 0.04, 0.38, colors.pier, {
          topColor: colors.coping, bottomColor: colors.soffit,
        });
        builder.edgeBox(edge, dc - cellHW + 0.06, dc + cellHW - 0.06, winY1 - 0.26, winY1 - 0.21, 0.05, 0.26, colors.pierShade, {
          bottomColor: colors.soffit,
        });
      }
    }
  }

  addRoofParapet(builder, allEdges, height, 0.62, colors);
  // Signature raised BRIGHT WHITE rooftop stairhead enclosures
  const roof = addRooftopStairheadsAndTanks(builder, polygon, primary.edge, height, colors, {
    coreCount: 2, coreColor: colors.coping, roofCapColor: colors.coping, accentColor: colors.wall, coreHeight: 2.65, withTanks: true,
  });
  return {
    features: ['white-structural-grid', 'ochre-orange-panels', 'horizontal-sunshade-louvers', 'tall-white-portal-entrance-bay', 'raised-white-stairheads'],
    gridCellCount,
    hasTallPortalBay: true,
    ...roof,
    maxTopY: Math.max(roof.maxTopY, height + 1.32),
  };
}

/** 5. way/532464712 (Saddam Hossain Hall) & way/532464760 (Lalon Shah Hall) — Classic gallery halls with chajjas, balconies, stair cores & twin-pillar entrance arch gates */
function buildClassicGalleryHall(builder, id, polygon, allEdges, outerEdges, entries, height, colors) {
  const isLalon = id === RESIDENTIAL_HALL_IDS.LALON_SHAH;
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const { apertureByEdge, detailByEdge, entrySpecs } = buildBlockedMap(outerEdges, entries, 1.55, 0.55);
  const primary = entrySpecs[0];

  // Stately twin-pillar concrete Hall Entrance Arch Gate cleanly outside primary entrance
  addHallEntranceGateway(builder, primary.edge, primary.distance, colors, {
    clearHalf: isLalon ? 1.85 : 1.75,
    outward: isLalon ? 1.50 : 2.00,
    depth: 0.70,
    pierW: 0.66,
    springY: 3.38,
    headerTopY: isLalon ? 4.95 : 5.10,
    style: isLalon ? 'pergola-beam' : 'arched',
  });
  for (const es of entrySpecs) {
    addWallEntryCanopy(builder, es.edge, es.distance, es.clearHalf, Math.min(height - 1.2, 3.28), 0.90, colors, {
      jambColor: colors.pier,
      accentColor: colors.gateAccent,
    });
  }

  let chajjaCount = 0;
  let stairCoreCount = 0;

  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = apertureByEdge.get(ei) ?? [];
    const detailBlocked = [...(detailByEdge.get(ei) ?? [])];

    for (const [a, b] of splitIntervals(0, edge.length, apertureBlocked)) {
      builder.edgeBox(edge, a, b, 0, 0.48, 0.02, 0.15, colors.plinth, { topColor: colors.pierShade, bottom: false });
    }

    // Projecting vertical staircase core volume rising above the low weathered roof parapet on long wings
    if (edge.length >= 42) {
      const stairD = edge.length * (ei % 2 === 0 ? 0.30 : 0.70);
      if (!detailBlocked.some(([lo, hi]) => stairD + 2.4 > lo && stairD - 2.4 < hi)) {
        const sHW = 1.65;
        const sTop = height + 1.85;
        builder.edgeBox(edge, stairD - sHW, stairD + sHW, 0.46, sTop, 0.02, 0.64, colors.pier, {
          sideColor: colors.pierShade, topColor: colors.coping, bottom: false,
        });
        builder.edgeBox(edge, stairD - sHW - 0.14, stairD + sHW + 0.14, sTop, sTop + 0.16, 0.02, 0.78, colors.coping, {
          bottomColor: colors.soffit, back: true,
        });
        // Tall recessed staircase landing glazing slot + concrete louver slats
        builder.edgeFrontQuad(edge, stairD - 0.56, stairD + 0.56, 1.4, height + 0.65, 0.652, colors.glass);
        for (let y = 2.0; y < height + 0.4; y += 1.4) {
          builder.edgeBox(edge, stairD - 0.62, stairD + 0.62, y, y + 0.10, 0.64, 0.80, colors.pier, { bottomColor: colors.soffit });
        }
        detailBlocked.push([stairD - sHW - 0.25, stairD + sHW + 0.25]);
        stairCoreCount++;
      }
    }

    // Multi-storey open residential gallery balconies with tubular guardrails on upper floors
    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      for (const [a, b] of splitIntervals(0.15, edge.length - 0.15, detailBlocked)) {
        addBalconySpan(builder, edge, a, b, fy, colors, {
          depth: 0.58,
          slabThick: 0.16,
          railHeight: 0.96,
          postSpacing: 4.4,
          slabColor: colors.pier,
        });
      }
    }

    // Structural piers, recessed residential bays & sloped concrete CHAJJA rain hoods!
    const bays = Math.max(1, Math.floor(edge.length / 4.4));
    const step = edge.length / bays;
    for (let i = 0; i <= bays; i++) {
      const d = i === 0 ? 0.22 : i === bays ? edge.length - 0.22 : i * step;
      if (detailBlocked.some(([lo, hi]) => d >= lo && d <= hi)) continue;
      builder.edgeBox(edge, d - 0.15, d + 0.15, 0.46, height, 0.03, 0.20, colors.pier, {
        sideColor: colors.pierShade, bottom: false, top: false,
      });
    }
    for (let b = 0; b < bays; b++) {
      const dc = (b + 0.5) * step;
      const hw = Math.min(1.12, step * 0.29);
      if (detailBlocked.some(([lo, hi]) => dc + hw + 0.16 > lo && dc - hw - 0.16 < hi)) continue;
      for (let f = 0; f < floors; f++) {
        const fy = f * floorH;
        const y0 = fy + (f === 0 ? 0.96 : 0.96);
        const y1 = Math.min(height - 0.48, fy + floorH - 0.44);
        if (y1 - y0 < 0.65) continue;
        // Recessed window/gallery glazing + central mullion + stone sill
        builder.edgeFrontQuad(edge, dc - hw, dc + hw, y0, y1, 0.042, colors.glass);
        builder.edgeFrontQuad(edge, dc - 0.024, dc + 0.024, y0, y1, 0.054, colors.mullion);
        builder.edgeBox(edge, dc - hw - 0.08, dc + hw + 0.08, y0 - 0.08, y0, 0.03, 0.15, colors.pierShade, { bottomColor: colors.soffit });
        // Authentic sloped concrete chajja rain hood over every ground window & alternating/top gallery windows!
        if (f === 0 || f === floors - 1) {
          builder.chajja(edge, dc - hw - 0.14, dc + hw + 0.14, y1, 0.18, 0.07, 0.44, colors.pier, colors.soffit, 0.03);
          chajjaCount++;
        } else {
          builder.edgeBox(edge, dc - hw - 0.08, dc + hw + 0.08, y1, y1 + 0.10, 0.03, 0.16, colors.pier, { bottomColor: colors.soffit });
        }
      }
    }
  }

  addRoofParapet(builder, allEdges, height, 0.56, colors);
  const roof = addRooftopStairheadsAndTanks(builder, polygon, primary.edge, height, colors, {
    coreCount: 2, coreColor: colors.pier, accentColor: colors.wallShade, coreHeight: 2.45, withTanks: true,
  });
  return {
    features: ['open-gallery-balconies', 'tubular-guardrails', 'concrete-chajja-rain-hoods', 'projecting-staircase-cores', 'rooftop-water-tanks', 'twin-pillar-entrance-arch-gate'],
    chajjaCount,
    projectingStairCores: stairCoreCount,
    gatewayCount: 1,
    ...roof,
    maxTopY: Math.max(roof.maxTopY, height + 2.02),
  };
}

/** 6. way/970015480 (Khaleda Zia Hall) & way/970015482 (Ummul Mu'mineen Aisha Siddiqa Hall) — Women's residential halls with rose-cream/ivory bays, arched lower gallery connectors & ornate gates with folded wrought-iron leaves! */
function buildWomensHall(builder, id, polygon, allEdges, outerEdges, entries, height, colors) {
  const floors = Math.max(2, Math.round(height / 3.2));
  const floorH = height / floors;
  const { apertureByEdge, detailByEdge, entrySpecs } = buildBlockedMap(outerEdges, entries, 1.65, 0.60);
  const primary = entrySpecs[0];

  // Signature ORNATE WOMEN'S RESIDENTIAL HALL ENTRANCE GATE (twin decorative pillars, stepped caps,
  // curved ornamental arch header beam, rose accent trim, and open scrolled dark wrought-iron gate leaves folded neatly back!)
  addHallEntranceGateway(builder, primary.edge, primary.distance, colors, {
    clearHalf: 2.00,
    outward: 2.35,
    depth: 0.76,
    pierW: 0.76,
    springY: 3.55,
    headerTopY: 5.20,
    style: 'ornate-womens',
    foldedIronGates: true,
  });

  // Graceful arched portico canopy at the hall wall entrance itself
  for (const es of entrySpecs) {
    addWallEntryCanopy(builder, es.edge, es.distance, es.clearHalf, Math.min(height - 1.2, 3.30), 0.98, colors, {
      jambColor: colors.pier,
      accentColor: colors.gateAccent,
    });
  }

  let verticalBayCount = 0;
  let lowerArchCount = 0;

  for (let ei = 0; ei < outerEdges.length; ei++) {
    const edge = outerEdges[ei];
    const apertureBlocked = apertureByEdge.get(ei) ?? [];
    const detailBlocked = detailByEdge.get(ei) ?? [];

    for (const [a, b] of splitIntervals(0, edge.length, apertureBlocked)) {
      builder.edgeBox(edge, a, b, 0, 0.46, 0.02, 0.14, colors.plinth, { topColor: colors.pierShade, bottom: false });
    }

    // Continuous upper-floor balcony slabs & slim guardrails
    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      addBalconySpan(builder, edge, 0.14, edge.length - 0.14, fy, colors, {
        depth: 0.50,
        slabThick: 0.15,
        railHeight: 0.94,
        kneeWallHeight: 0.34,
        postSpacing: 4.8,
        slabColor: colors.pier,
      });
    }

    // Soft rose-cream/ivory facade panels framed by crisp white vertical window bays + arched lower gallery connectors
    const bays = Math.max(1, Math.floor(edge.length / 4.4));
    const step = edge.length / bays;
    for (let b = 0; b < bays; b++) {
      const dc = (b + 0.5) * step;
      const hw = Math.min(1.16, step * 0.30);
      if (detailBlocked.some(([lo, hi]) => dc + hw + 0.22 > lo && dc - hw - 0.22 < hi)) continue;
      verticalBayCount++;

      // Crisp white continuous vertical window bay surround framing upper storeys
      builder.edgeBox(edge, dc - hw - 0.15, dc - hw, floorH, height - 0.12, 0.03, 0.18, colors.pier, {
        sideColor: colors.pierShade, bottom: false, top: false,
      });
      builder.edgeBox(edge, dc + hw, dc + hw + 0.15, floorH, height - 0.12, 0.03, 0.18, colors.pier, {
        sideColor: colors.pierShade, bottom: false, top: false,
      });

      // Soft rose-cream/ivory panel fill on facade piers between bays
      builder.edgeFrontQuad(edge, dc - step * 0.46, dc + step * 0.46, 0.46, height - 0.10, 0.028, colors.wall);

      // Ground storey: ARCHED LOWER GALLERY CONNECTORS (graceful white-framed rounded arches!)
      const gTop = Math.min(floorH - 0.24, 2.86);
      addRoundedArchBay(builder, edge, dc, hw, 0.48, gTop, colors, {
        frameThick: 0.14, frameDepth: 0.14, oBase: 0.035, segments: 3, openBottom: false, withGlass: true, withMullion: true,
        frameColor: colors.pier,
      });
      lowerArchCount++;

      // Upper storeys: white-framed rectangular vertical window bays with soft rose spandrel aprons
      for (let f = 1; f < floors; f++) {
        const fy = f * floorH;
        const y0 = fy + 0.96;
        const y1 = Math.min(height - 0.42, fy + floorH - 0.38);
        if (y1 - y0 < 0.62) continue;
        builder.edgeFrontQuad(edge, dc - hw, dc + hw, y0, y1, 0.044, colors.glass);
        builder.edgeFrontQuad(edge, dc - 0.022, dc + 0.022, y0, y1, 0.056, colors.mullion);
        builder.edgeBox(edge, dc - hw - 0.12, dc + hw + 0.12, y1, y1 + 0.10, 0.035, 0.19, colors.pier, { bottomColor: colors.soffit });
        builder.edgeBox(edge, dc - hw - 0.08, dc + hw + 0.08, y0 - 0.08, y0, 0.035, 0.16, colors.coping, { bottomColor: colors.soffit });
      }
    }
  }

  addRoofParapet(builder, allEdges, height, 0.60, colors);
  const roof = addRooftopStairheadsAndTanks(builder, polygon, primary.edge, height, colors, {
    coreCount: 2, coreColor: colors.pier, accentColor: colors.wall, coreHeight: 2.45, withTanks: true,
  });
  return {
    features: ['rose-cream-vertical-window-bays', 'arched-lower-gallery-connectors', 'balcony-railings', 'ornate-womens-hall-entrance-gate', 'folded-scrolled-iron-gate-leaves', 'rooftop-stair-enclosures'],
    verticalBayCount,
    lowerArchCount,
    gatewayCount: 1,
    hasFoldedIronGates: true,
    ...roof,
    maxTopY: Math.max(roof.maxTopY, height + 0.68),
  };
}

/* -------------------------------------------------------------------------- */
/*  7. way/1317423300 — Jia Hall Mosque (Modest Graceful Hall Mosque)         */
/* -------------------------------------------------------------------------- */

function pointedArchOutline(halfW, bottomY, topY, segments = 3, springRatio = 0.58) {
  const spring = bottomY + (topY - bottomY) * springRatio;
  const ctrlY = topY - (topY - bottomY) * 0.12;
  const pts = [[-halfW, bottomY], [-halfW, spring]];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments, u = 1 - t;
    pts.push([
      u * u * (-halfW) + 2 * u * t * (-halfW) + t * t * 0,
      u * u * spring + 2 * u * t * ctrlY + t * t * topY,
    ]);
  }
  for (let i = 1; i <= segments; i++) {
    const t = i / segments, u = 1 - t;
    pts.push([
      u * u * 0 + 2 * u * t * halfW + t * t * halfW,
      u * u * topY + 2 * u * t * ctrlY + t * t * spring,
    ]);
  }
  pts.push([halfW, bottomY]);
  return pts;
}

function addPointedArchSurround(builder, edge, dCenter, halfW, y0, y1, colors, {
  thick = 0.16,
  depth = 0.20,
  oBase = 0.028,
  openBottom = false,
  withGlass = false,
  segments = 3,
  springRatio = 0.58,
} = {}) {
  const outer = pointedArchOutline(halfW, y0, y1, segments, springRatio);
  const inner = pointedArchOutline(Math.max(0.16, halfW - thick), openBottom ? y0 : y0 + thick, Math.max(y0 + 0.4, y1 - thick), segments, springRatio);
  const nOut = [edge.nx, 0, edge.nz];
  const oFront = oBase + depth;

  for (let i = 0; i < outer.length - 1; i++) {
    const [ox0, oy0] = outer[i], [ox1, oy1] = outer[i + 1];
    const [ix0, iy0] = inner[i], [ix1, iy1] = inner[i + 1];
    builder.quad(
      edge.at(dCenter + ox0, oy0, oFront), edge.at(dCenter + ox1, oy1, oFront),
      edge.at(dCenter + ix1, iy1, oFront), edge.at(dCenter + ix0, iy0, oFront),
      nOut, colors.stoneLight,
    );
    const odx = ox1 - ox0, ody = oy1 - oy0, olen = Math.hypot(odx, ody) || 1;
    builder.quad(
      edge.at(dCenter + ox0, oy0, oBase), edge.at(dCenter + ox1, oy1, oBase),
      edge.at(dCenter + ox1, oy1, oFront), edge.at(dCenter + ox0, oy0, oFront),
      [-edge.ux * (ody / olen), odx / olen, -edge.uz * (ody / olen)], colors.stoneMid,
    );
    const idx = ix1 - ix0, idy = iy1 - iy0, ilen = Math.hypot(idx, idy) || 1;
    builder.quad(
      edge.at(dCenter + ix0, iy0, oFront), edge.at(dCenter + ix1, iy1, oFront),
      edge.at(dCenter + ix1, iy1, oBase), edge.at(dCenter + ix0, iy0, oBase),
      [edge.ux * (idy / ilen), -idx / ilen, edge.uz * (idy / ilen)], colors.stoneReveal,
    );
  }
  if (!openBottom) {
    builder.edgeBox(edge, dCenter - halfW - 0.06, dCenter + halfW + 0.06, y0 - 0.08, y0 + thick, oBase, oFront + 0.03, colors.stoneLight, {
      bottomColor: colors.soffit,
    });
  }
  if (withGlass && !openBottom) {
    const gZ = oBase + 0.02;
    const gBot = y0 + thick * 0.9;
    const gTop = y1 - thick * 0.9;
    const gCenter = edge.at(dCenter, gBot + (gTop - gBot) * 0.42, gZ);
    for (let i = 0; i < inner.length - 1; i++) {
      builder.tri(
        gCenter,
        edge.at(dCenter + inner[i][0], inner[i][1], gZ),
        edge.at(dCenter + inner[i + 1][0], inner[i + 1][1], gZ),
        nOut, colors.glass,
      );
    }
    builder.tri(
      gCenter,
      edge.at(dCenter + inner.at(-1)[0], inner.at(-1)[1], gZ),
      edge.at(dCenter + inner[0][0], inner[0][1], gZ),
      nOut, colors.glass,
    );
    // Slender white mullions
    const springY = gBot + (gTop - gBot) * springRatio;
    const inHW = Math.max(0.14, halfW - thick);
    builder.edgeFrontQuad(edge, dCenter - 0.022, dCenter + 0.022, gBot, gTop - 0.06, gZ + 0.02, colors.mullion);
    builder.edgeFrontQuad(edge, dCenter - inHW, dCenter + inHW, springY - 0.022, springY + 0.022, gZ + 0.02, colors.mullion);
  }
}

function addGoldFinial(builder, cx, cz, domeTopY, finialH, colors) {
  const mastR = 0.045;
  builder.cylinder(cx, cz, domeTopY - 0.04, domeTopY + 0.14, 0.24, 0.34, 8, colors.goldDark);
  builder.cylinder(cx, cz, domeTopY + 0.12, domeTopY + finialH * 0.80, mastR * 0.7, mastR, 6, colors.goldMid, { top: false });
  // Stacked kalasha beads
  for (const [frac, r, col] of [[0.24, 0.18, colors.goldBright], [0.46, 0.13, colors.goldMid], [0.64, 0.09, colors.goldBright]]) {
    const prof = [];
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI;
      prof.push([Math.max(0, Math.cos(a) * r), Math.sin(a) * r]);
    }
    builder.lathe(cx, cz, domeTopY + finialH * frac, prof, 8, col);
  }
  // Delicate crescent + top spire reaching exact domeTopY + finialH
  const topY = domeTopY + finialH;
  const rOut = Math.min(0.28, finialH * 0.22);
  const cy = topY - rOut * 0.86;
  const rIn = rOut * 0.72, inCy = cy + rOut * 0.24;
  const segs = 8, hz = 0.025;
  const oPts = [], iPts = [];
  for (let i = 0; i <= segs; i++) {
    const a = (-Math.PI * 0.5 - Math.PI * 0.70) + (i / segs) * (Math.PI * 1.40);
    const ox = Math.cos(a) * rOut, oy = Math.min(topY, cy + Math.sin(a) * rOut);
    oPts.push([ox, oy]);
    iPts.push([
      i === 0 || i === segs ? ox : Math.cos(a) * rIn,
      i === 0 || i === segs ? oy : Math.min(topY, inCy + Math.sin(a) * rIn),
    ]);
  }
  for (let i = 0; i < segs; i++) {
    const o0 = oPts[i], o1 = oPts[i + 1], i0 = iPts[i], i1 = iPts[i + 1];
    builder.quad([cx + o0[0], o0[1], cz + hz], [cx + o1[0], o1[1], cz + hz], [cx + i1[0], i1[1], cz + hz], [cx + i0[0], i0[1], cz + hz], [0, 0, 1], colors.goldBright);
    builder.quad([cx + i0[0], i0[1], cz - hz], [cx + i1[0], i1[1], cz - hz], [cx + o1[0], o1[1], cz - hz], [cx + o0[0], o0[1], cz - hz], [0, 0, -1], colors.goldBright);
  }
  builder.tri([cx - 0.02, domeTopY + finialH * 0.65, cz], [cx + 0.02, domeTopY + finialH * 0.65, cz], [cx, topY, cz], [0, 0, 1], colors.goldBright);
  builder.tri([cx, domeTopY + finialH * 0.65, cz - 0.02], [cx, domeTopY + finialH * 0.65, cz + 0.02], [cx, topY, cz], [1, 0, 0], colors.goldBright);
}

function buildJiaHallMosque(builder, polygon, allEdges, outerEdges, entries, height, colors) {
  const anchors = findRoofAnchors(polygon, 1, 3.0, 4);
  const center = anchors[0]?.point ?? [
    polygon[0].slice(0, -1).reduce((s, p) => s + p[0], 0) / (polygon[0].length - 1),
    polygon[0].slice(0, -1).reduce((s, p) => s + p[1], 0) / (polygon[0].length - 1),
  ];
  const room = Math.max(3.2, pointClearance(center, polygon));
  const [mx, mz] = center;

  // 1. Central pointed Islamic dome on crisp octagonal drum with golden finial
  const domeR = Math.min(4.45, room * 0.56);
  const drumH = 1.68;
  const domeRise = Math.min(3.55, domeR * 0.80);
  const finialH = 1.25;
  const plinthH = 0.28, corniceH = 0.18;

  // Octagonal drum plinth, shaft, shadow reveal, and projecting cornice
  builder.cylinder(mx, mz, height, height + plinthH, domeR * 1.07, domeR * 1.09, 8, colors.plinth);
  builder.cylinder(mx, mz, height + plinthH, height + drumH - corniceH, domeR * 1.00, domeR * 1.00, 8, colors.drumWall, { top: false });
  builder.cylinder(mx, mz, height + drumH - corniceH, height + drumH, domeR * 1.08, domeR * 1.03, 8, colors.stoneLight);

  // 8 recessed dark pointed-arch clerestory niches around octagonal drum
  const drumFaceR = domeR * 1.00 * Math.cos(Math.PI / 8) + 0.02;
  const nicheY0 = height + plinthH + 0.14, nicheH = (drumH - plinthH - corniceH) * 0.76;
  const nicheSpring = nicheY0 + nicheH * 0.58;
  const nicheHW = domeR * 0.22;
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4;
    const nx = Math.sin(a), nz = Math.cos(a);
    const ux = Math.cos(a), uz = -Math.sin(a);
    const pt = (u, y, off = 0) => [mx + nx * (drumFaceR + off) + ux * u, y, mz + nz * (drumFaceR + off) + uz * u];
    builder.quad(pt(-nicheHW, nicheY0), pt(nicheHW, nicheY0), pt(nicheHW, nicheSpring), pt(-nicheHW, nicheSpring), [nx, 0, nz], colors.glass);
    builder.tri(pt(-nicheHW, nicheSpring), pt(nicheHW, nicheSpring), pt(0, nicheY0 + nicheH), [nx, 0, nz], colors.glass);
    // Subtle sage-green frieze accent dot beneath cornice
    builder.quad(pt(-nicheHW * 1.15, height + drumH - corniceH - 0.10, 0.01), pt(nicheHW * 1.15, height + drumH - corniceH - 0.10, 0.01),
      pt(nicheHW * 1.15, height + drumH - corniceH - 0.02, 0.01), pt(-nicheHW * 1.15, height + drumH - corniceH - 0.02, 0.01), [nx, 0, nz], colors.sageAccent);
  }

  // Circular transition collar + graceful pointed Islamic dome shell + vertical ribs
  const collarH = 0.22;
  builder.cylinder(mx, mz, height + drumH, height + drumH + collarH, domeR * 0.96, domeR * 0.99, 16, colors.stoneMid, { top: false });
  const domeBaseY = height + drumH + collarH;
  const domeSteps = 10;
  const profile = [];
  for (let i = 0; i <= domeSteps; i++) {
    const s = i / domeSteps;
    const r = i === domeSteps ? 0 : domeR * 0.95 * (0.94 + 0.11 * Math.sin(s * Math.PI * 0.85)) * Math.pow(Math.cos(s * Math.PI / 2), 0.78);
    const y = i === domeSteps ? domeRise : domeRise * (0.62 * Math.sin(s * Math.PI / 2) + 0.38 * s);
    profile.push([r, y]);
  }
  builder.lathe(mx, mz, domeBaseY, profile, 18, colors.domeShell);

  // 12 crisp vertical white dome ribs
  for (let r = 0; r < 12; r++) {
    const theta = (r / 12) * Math.PI * 2;
    const cos = Math.cos(theta), sin = Math.sin(theta), tx = -sin, tz = cos;
    for (let i = 0; i < profile.length - 2; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      const hw0 = 0.045 * Math.min(1, r0 / (domeR || 1) + 0.25);
      const hw1 = 0.045 * Math.min(1, r1 / (domeR || 1) + 0.25);
      const dr = r1 - r0, dy = y1 - y0, len = Math.hypot(dr, dy) || 1;
      const n = [cos * (dy / len), -dr / len, sin * (dy / len)];
      builder.quad(
        [mx + cos * (r0 + 0.04) - tx * hw0, domeBaseY + y0, mz + sin * (r0 + 0.04) - tz * hw0],
        [mx + cos * (r0 + 0.04) + tx * hw0, domeBaseY + y0, mz + sin * (r0 + 0.04) + tz * hw0],
        [mx + cos * (r1 + 0.04) + tx * hw1, domeBaseY + y1, mz + sin * (r1 + 0.04) + tz * hw1],
        [mx + cos * (r1 + 0.04) - tx * hw1, domeBaseY + y1, mz + sin * (r1 + 0.04) - tz * hw1],
        n, colors.domeRib,
      );
    }
  }
  addGoldFinial(builder, mx, mz, domeBaseY + domeRise, finialH, colors);
  const domeTopY = domeBaseY + domeRise + finialH;

  // 2. Crisp white-stone pointed-arch doorway/window surrounds (100% open at ground level!) & scalloped roof parapet merlons
  const levels = Math.max(2, Math.round(height / 3.2));
  const levelH = height / levels;
  const parapetH = 0.56, merlonH = 0.34;
  let archCount = 0;
  let merlonCountTotal = 0;

  for (const edge of outerEdges) {
    const edgeEntries = entries.filter(e => e.edge === edge);
    const bays = Math.max(2, Math.round(edge.length / 5.2));
    const spacing = edge.length / bays;

    // Corner & bay pilasters (skip pilaster if it falls inside an entry opening)
    for (let b = 0; b <= bays; b++) {
      const d = b === 0 ? 0.22 : b === bays ? edge.length - 0.22 : b * spacing;
      if (edgeEntries.some(en => Math.abs(d - en.distance) < 1.55)) continue;
      builder.edgeBox(edge, d - 0.16, d + 0.16, 0, 0.44, 0.02, 0.24, colors.plinth, { bottom: false });
      builder.edgeBox(edge, d - 0.12, d + 0.12, 0.44, height, 0.02, 0.20, colors.stoneLight, {
        sideColor: colors.stoneMid, bottom: false, top: false,
      });
    }

    // Horizontal floor cornices & subtle sage-green decorative roof frieze
    for (let r = 1; r <= levels; r++) {
      const y = r * levelH;
      builder.edgeBox(edge, -0.02, edge.length + 0.02, y - 0.07, y + 0.09, 0.015, r === levels ? 0.28 : 0.20, colors.stoneLight, {
        bottomColor: colors.soffit,
      });
    }
    builder.edgeBox(edge, 0, edge.length, height - 0.30, height - 0.16, 0.02, 0.12, colors.sageAccent, { top: false, bottom: false });

    // Dedicated open pointed-arch entrance doorway portal (inner spring strictly >= 2.75 m, clear half-width >= 1.45 m!)
    for (const en of edgeEntries) {
      const portalHW = Math.min(1.66, en.distance - 0.3, edge.length - en.distance - 0.3);
      const portalH = Math.min(height - 0.6, Math.max(3.65, levelH * 1.15));
      addPointedArchSurround(builder, edge, en.distance, portalHW, 0, portalH, colors, {
        thick: 0.16, depth: 0.26, oBase: 0.025, openBottom: true, withGlass: false, segments: 4, springRatio: 0.78,
      });
      // Subtle cantilevered white-stone mosque doorway hood above the pointed arch
      builder.edgeBox(edge, en.distance - portalHW - 0.24, en.distance + portalHW + 0.24, portalH, portalH + 0.18, 0.02, 0.56, colors.stoneLight, {
        bottomColor: colors.soffit,
      });
      archCount++;
    }

    // Pointed-arch bays across all storeys (ground level = open doorway arches with zero glass/threshold!)
    for (let row = 0; row < levels; row++) {
      const isGround = row === 0;
      const archH = isGround ? Math.min(levelH - 0.04, 3.16) : levelH * 0.80;
      const archHW = isGround ? Math.min(spacing * 0.36, 1.45) : Math.min(spacing * 0.36, archH * 0.44);
      const y0 = row * levelH + (isGround ? 0 : 0.24);
      for (let b = 0; b < bays; b++) {
        const dc = (b + 0.5) * spacing;
        if (isGround && edgeEntries.some(en => Math.abs(dc - en.distance) < archHW + 1.55)) continue;
        addPointedArchSurround(builder, edge, dc, archHW, y0, y0 + archH, colors, {
          thick: 0.15, depth: 0.18, oBase: 0.025, openBottom: isGround, withGlass: !isGround, segments: 3,
          springRatio: isGround ? 0.76 : 0.58,
        });
        archCount++;
      }
    }

    // Scalloped white-stone roof parapet wall + rhythmic stepped Islamic merlons!
    builder.edgeBox(edge, 0, edge.length, height, height + parapetH, -0.20, 0.06, colors.stoneMid, { back: true, bottom: false, top: false });
    builder.edgeBox(edge, -0.03, edge.length + 0.03, height + parapetH, height + parapetH + 0.08, -0.22, 0.10, colors.stoneLight, { back: true });

    const mCount = Math.max(3, Math.floor(edge.length / 2.2));
    const mStep = edge.length / mCount;
    for (let m = 0; m < mCount; m++) {
      const dc = (m + 0.5) * mStep;
      const hw1 = Math.min(0.42, mStep * 0.28), hw2 = hw1 * 0.52;
      const my = height + parapetH + 0.08;
      builder.edgeBox(edge, dc - hw1, dc + hw1, my, my + merlonH * 0.55, -0.14, 0.06, colors.stoneMid, { back: true, bottom: false });
      builder.edgeBox(edge, dc - hw2, dc + hw2, my + merlonH * 0.55, my + merlonH, -0.12, 0.04, colors.stoneLight, { back: true, bottom: false });
      merlonCountTotal++;
    }
  }

  // 4 modest decorative corner roof turret pinnacles inside the corners of the roof
  const ring = polygon[0];
  for (let i = 0; i < ring.length - 1; i++) {
    const [vx, vz] = ring[i];
    const dx = mx - vx, dz = mz - vz, len = Math.hypot(dx, dz) || 1;
    const px = vx + (dx / len) * 0.85, pz = vz + (dz / len) * 0.85;
    if (!pointInPolygon([px, pz], polygon)) continue;
    builder.cylinder(px, pz, height, height + 1.35, 0.34, 0.38, 8, colors.stoneMid);
    builder.cylinder(px, pz, height + 1.35, height + 1.48, 0.42, 0.36, 8, colors.stoneLight);
    builder.lathe(px, pz, height + 1.48, [[0.34, 0], [0.28, 0.24], [0.14, 0.44], [0, 0.56]], 8, colors.domeShell);
    builder.cylinder(px, pz, height + 2.02, height + 2.38, 0.02, 0.04, 6, colors.goldBright);
  }

  return {
    features: ['central-pointed-dome', 'octagonal-drum', 'gold-finial-crescent', 'scalloped-parapet-merlons', 'pointed-arch-openings'],
    domeCenter: [mx, mz],
    domeRadius: domeR,
    domeTopY,
    archCount,
    merlonCount: merlonCountTotal,
    maxTopY: domeTopY,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public Entry Point 1: buildResidentialHall                                */
/* -------------------------------------------------------------------------- */

/**
 * Builds distinct, authentic Bangladeshi residential hall architecture (or Jia Hall Mosque crown)
 * as a single merged vertex-colored visual mesh (`drawCalls: 1`, `collisionObjects: 0`, `< 45,000` verts).
 * Never mutates `building`, `options`, or `HALL_OBSERVATIONS`.
 */
export function buildResidentialHall(building, { entrances, palette, baseHeight } = {}) {
  const { polygon, height } = validateBuilding(building, baseHeight);
  const id = String(building.id);
  const meta = HALL_META[id];
  const allEdges = wallEdges(polygon);
  const outerEdges = allEdges.filter(e => !e.ringIndex && e.length >= 2.2);
  if (!outerEdges.length) throw new RangeError(`Residential hall way/${id} has no usable outer walls`);

  const resolvedEntries = resolveEntries(outerEdges, entrances);
  const colors = resolveHallColors(id, palette);
  const builder = new MeshBuilder();

  let detailStats;
  switch (id) {
    case RESIDENTIAL_HALL_IDS.SHAH_AZIZUR:
      detailStats = buildShahAzizurHall(builder, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    case RESIDENTIAL_HALL_IDS.SHAHID_ZIAUR:
      detailStats = buildShahidZiaurHall(builder, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    case RESIDENTIAL_HALL_IDS.JULY_36:
      detailStats = buildJuly36Hall(builder, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    case RESIDENTIAL_HALL_IDS.SHAHID_ANAS:
      detailStats = buildShahidAnasHall(builder, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    case RESIDENTIAL_HALL_IDS.SADDAM_HOSSAIN:
    case RESIDENTIAL_HALL_IDS.LALON_SHAH:
      detailStats = buildClassicGalleryHall(builder, id, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    case RESIDENTIAL_HALL_IDS.KHALEDA_ZIA:
    case RESIDENTIAL_HALL_IDS.AISHA_SIDDIQA:
      detailStats = buildWomensHall(builder, id, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    case RESIDENTIAL_HALL_IDS.JIA_HALL_MOSQUE:
      detailStats = buildJiaHallMosque(builder, polygon, allEdges, outerEdges, resolvedEntries, height, colors);
      break;
    default:
      throw new TypeError(`Unsupported residential hall way/${id}`);
  }

  const geometry = builder.toGeometry();
  const material = new THREE.MeshStandardMaterial(MATERIAL_CONFIG);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${meta.key}-architecture`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = `${meta.key}-landmark`;
  group.add(mesh);

  const diagnostics = {
    osmType: 'way',
    osmId: id,
    name: meta.name,
    style: meta.style,
    baseHeight: height,
    wallColorHex: `#${colors.wallHex.toString(16).padStart(6, '0')}`,
    vertexCount: geometry.getAttribute('position').count,
    entries: resolvedEntries.map(e => ({
      center: e.edge.at(e.distance, 0, 0),
      source: e.source,
      edgeLength: e.edge.length,
    })),
    drawCalls: 1,
    collisionObjects: 0,
    ...detailStats,
  };
  group.userData.residentialHall = diagnostics;

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

/* -------------------------------------------------------------------------- */
/*  Public Entry Point 2: buildShahAzizurPondGhat (পুকুর ঘাট)                */
/* -------------------------------------------------------------------------- */

function findSouthBankEdge(polygon) {
  const ring = polygon?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  let best = null;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (!a || !b || !a.every(Number.isFinite) || !b.every(Number.isFinite)) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 8) continue;
    const tx = dx / len, tz = dz / len;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Test both perpendicular normals to identify the inward water-facing direction
    const n1 = [-tz, tx], n2 = [tz, -tx];
    const inNormal = pointInPolygon([mid[0] + n1[0] * 0.5, mid[1] + n1[1] * 0.5], polygon)
      ? n1
      : pointInPolygon([mid[0] + n2[0] * 0.5, mid[1] + n2[1] * 0.5], polygon)
        ? n2
        : null;
    if (!inNormal || inNormal[1] > -0.45) continue; // south bank must face northward (-Z) into the pond!
    const avgZ = mid[1];
    if (!best || avgZ > best.avgZ) {
      best = { a, b, len, mid, avgZ, inX: inNormal[0], inZ: inNormal[1] };
    }
  }
  return best;
}

/**
 * Builds the iconic stepped concrete-and-brick Shah Azizur Rahman Hall Pond Ghat (`পুকুর ঘাট`)
 * anchored programmatically along the south bank of Shah Azizur Pond (OSM `1317423252`).
 * Single merged vertex-colored mesh (`drawCalls: 1`, `collisionObjects: 0`), dipping cleanly
 * below the pond water surface (`y = 0.021`) down to `y = -0.35`.
 */
export function buildShahAzizurPondGhat(mapData = {}) {
  const pond = (mapData?.water ?? []).find(w => String(w?.id) === SHAH_AZIZUR_POND_ID);
  const polygon = pond?.polygons?.[0];
  const bank = polygon ? findSouthBankEdge(polygon) : null;

  if (!bank) {
    const group = new THREE.Group();
    group.name = 'shah-azizur-pond-ghat';
    const diagnostics = {
      waterId: SHAH_AZIZUR_POND_ID,
      found: false,
      drawCalls: 0,
      collisionObjects: 0,
      stepCount: 0,
    };
    group.userData.pondGhat = diagnostics;
    let disposed = false;
    return {
      group,
      diagnostics,
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
        group.clear();
      },
    };
  }

  // Ensure local +U points eastward (+X) while +W points northward into the pond water
  const inX = bank.inX, inZ = bank.inZ;
  let uX = -inZ, uZ = inX;
  if (uX < 0) { uX = -uX; uZ = -uZ; }

  // Project preferred x = 12.0 cleanly onto the south bank edge (clamped 8 m from corners)
  const dx = bank.b[0] - bank.a[0], dz = bank.b[1] - bank.a[1];
  const margin = Math.min(8, bank.len * 0.25);
  let t = 0.5;
  if (Math.abs(dx) > 1e-4) {
    const tPref = (12.0 - bank.a[0]) / dx;
    const minT = margin / bank.len, maxT = 1 - minT;
    if (tPref >= minT && tPref <= maxT) t = tPref;
  }
  const anchorX = bank.a[0] + dx * t;
  const anchorZ = bank.a[1] + dz * t;

  // Local ghat helper: u along bank (+east), y up, w into pond (+north into water, -south onto bank)
  const ptAt = (u, y, w) => [anchorX + uX * u + inX * w, y, anchorZ + uZ * u + inZ * w];
  const builder = new MeshBuilder();
  const boxUW = (u0, u1, y0, y1, w0, w1, color, opts = {}) => {
    const cu = (u0 + u1) / 2, cw = (w0 + w1) / 2;
    const cx = anchorX + uX * cu + inX * cw;
    const cz = anchorZ + uZ * cu + inZ * cw;
    builder.worldBox(cx, cz, y0, y1, (u1 - u0) / 2, (w1 - w0) / 2, uX, uZ, inX, inZ, color, opts);
  };

  const cPlaster = colorObj(0xd6d0c3);
  const cPlasterWarm = colorObj(0xcac2b3);
  const cPlasterDamp = colorObj(0x9f9d90);
  const cPlasterWet = colorObj(0x697668);
  const cPlasterDeep = colorObj(0x4b5c52);
  const cBrick = colorObj(0xa9543f);
  const cBrickDark = colorObj(0x8e4433);
  const cBrickWet = colorObj(0x674137);
  const cCoping = colorObj(0xeeeae0);
  const cBenchSeat = colorObj(0xe6e1d5);
  const cSoffit = colorObj(0x9a9488);

  const ghatHalfW = 5.5; // 11.0 m wide clear landing & stepped terraces!
  const wallThick = 0.56;
  const landingBackW = -3.70;
  const landingTopY = 0.08;

  // 1. WIDE PAVED BRICK-AND-PLASTER TOP LANDING APRON (width 11 m, y = 0.08 m)
  boxUW(-ghatHalfW, ghatHalfW, -0.02, landingTopY, landingBackW, 0.0, cPlaster, {
    topColor: cPlaster, sideColor: cPlasterWarm, bottom: false,
  });
  // Gentle landward red-brick arrival ramp / threshold curbing along south approach edge
  const rampA0 = ptAt(-ghatHalfW, 0.015, landingBackW - 0.45);
  const rampA1 = ptAt(ghatHalfW, 0.015, landingBackW - 0.45);
  const rampB1 = ptAt(ghatHalfW, landingTopY, landingBackW);
  const rampB0 = ptAt(-ghatHalfW, landingTopY, landingBackW);
  builder.quad(rampA0, rampA1, rampB1, rampB0, [-inX * 0.14, 0.99, -inZ * 0.14], cBrick);
  // Subtle decorative brick paving border & recessed concrete slab pattern on top landing
  boxUW(-ghatHalfW + 0.12, ghatHalfW - 0.12, landingTopY, landingTopY + 0.008, landingBackW + 0.18, landingBackW + 0.44, cBrickDark);
  boxUW(-ghatHalfW + 0.12, ghatHalfW - 0.12, landingTopY, landingTopY + 0.008, -0.26, -0.02, cBrick);
  for (const uLine of [-3.2, -1.1, 1.1, 3.2]) {
    boxUW(uLine - 0.04, uLine + 0.04, landingTopY, landingTopY + 0.006, landingBackW + 0.44, -0.26, cPlasterWarm);
  }

  // 2. EIGHT WIDE CONCRETE-AND-BRICK STEPPED TERRACES descending smoothly into Shah Azizur Pond!
  //    Descends cleanly from the 0.08 m landing apron through dry/damp upper steps (0.065, 0.032 m)
  //    right beneath the shimmering pond water surface (y = 0.021 m) down to y = -0.35 m!
  const stepElevations = [0.065, 0.032, -0.015, -0.075, -0.14, -0.208, -0.278, -0.35];
  const stepCount = stepElevations.length;
  const stepDepth = 0.56;
  const stepBaseY = -0.44;

  for (let i = 0; i < stepCount; i++) {
    const stepTopY = stepElevations[i];
    const w0 = i * stepDepth;
    const w1 = (i + 1) * stepDepth;

    const treadColor = stepTopY > 0.045 ? cPlaster
      : stepTopY > WATER_LEVEL_Y ? cPlasterDamp
      : stepTopY > -0.14 ? cPlasterWet
      : cPlasterDeep;
    const riserColor = stepTopY > 0.02 ? cBrick : cBrickWet;

    // Solid concrete-and-brick step block grounded below pond bed
    boxUW(-ghatHalfW, ghatHalfW, stepBaseY, stepTopY, w0, w1, riserColor, {
      topColor: treadColor, sideColor: cPlasterWarm, bottom: false,
    });
    // Crisp terracotta brick bullnose front lip on each step tread
    boxUW(-ghatHalfW + 0.06, ghatHalfW - 0.06, stepTopY - 0.025, stepTopY + 0.004, w1 - 0.12, w1 + 0.01, riserColor, {
      topColor: stepTopY > WATER_LEVEL_Y ? cBrick : cBrickWet,
    });
  }

  // 3. FLANKING TERRACOTTA BRICK PARAPET WING WALLS WITH WHITE PLASTER COPING & BUILT-IN ADDA BENCHES!
  const wallEndW = stepCount * stepDepth - 0.55;
  for (const side of [-1, 1]) {
    const uIn = side * ghatHalfW;
    const uOut = side * (ghatHalfW + wallThick);
    const uLo = Math.min(uIn, uOut), uHi = Math.max(uIn, uOut);

    // Landward arrival terracotta brick bollard pier with stepped white plaster cap
    boxUW(uLo - 0.06, uHi + 0.06, -0.02, 1.06, landingBackW - 0.10, landingBackW + 0.62, cBrick, {
      sideColor: cBrickDark, bottom: false,
    });
    boxUW(uLo - 0.11, uHi + 0.11, 1.06, 1.16, landingBackW - 0.15, landingBackW + 0.67, cCoping, {
      bottomColor: cSoffit,
    });
    boxUW(uLo + 0.04, uHi - 0.04, 1.16, 1.28, landingBackW, landingBackW + 0.52, cCoping);

    // Upper horizontal parapet wing wall framing the top landing apron (acts as backrest for built-in bench!)
    boxUW(uLo, uHi, -0.02, 0.88, landingBackW + 0.62, 0.12, cBrick, {
      sideColor: cBrickDark, bottom: false,
    });
    boxUW(uLo - 0.05, uHi + 0.05, 0.88, 0.96, landingBackW + 0.58, 0.16, cCoping, {
      bottomColor: cSoffit,
    });

    // Stepped descending wing walls flanking the pond stairs down into the water
    const segments = [
      [0.12, 1.50, 0.68],
      [1.50, 2.85, 0.48],
      [2.85, wallEndW, 0.28],
    ];
    for (const [w0, w1, h] of segments) {
      boxUW(uLo, uHi, stepBaseY, h, w0, w1, cBrick, { sideColor: cBrickDark, bottom: false });
      boxUW(uLo - 0.05, uHi + 0.05, h, h + 0.08, w0 - 0.02, w1 + 0.04, cCoping, { bottomColor: cSoffit });
    }

    // Waterward lakeside end bollard pier rising gracefully out of the pond
    boxUW(uLo - 0.05, uHi + 0.05, stepBaseY, 0.72, wallEndW - 0.06, wallEndW + 0.56, cBrickDark, {
      sideColor: cBrick, bottom: false,
    });
    boxUW(uLo - 0.10, uHi + 0.10, 0.72, 0.82, wallEndW - 0.11, wallEndW + 0.61, cCoping, {
      bottomColor: cSoffit,
    });

    // BUILT-IN SIDE SITTING BENCH (classic campus adda spot on top landing apron!)
    const benchDepth = 0.58;
    const bLo = side < 0 ? uIn : uIn - benchDepth;
    const bHi = side < 0 ? uIn + benchDepth : uIn;
    const benchW0 = landingBackW + 0.78, benchW1 = -0.22;
    const seatY = landingTopY + 0.42;
    // Three brick leg piers under the concrete bench slab
    for (const bw of [benchW0 + 0.18, (benchW0 + benchW1) / 2, benchW1 - 0.18]) {
      boxUW(bLo + 0.04, bHi - 0.04, landingTopY, seatY - 0.08, bw - 0.12, bw + 0.12, cBrickDark, { bottom: false });
    }
    // Smooth plastered concrete bench seat slab with overhanging front edge
    boxUW(bLo - (side > 0 ? 0.04 : 0), bHi + (side < 0 ? 0.04 : 0), seatY - 0.08, seatY, benchW0, benchW1, cBenchSeat, {
      topColor: cCoping, bottomColor: cSoffit,
    });
  }

  const geometry = builder.toGeometry();
  const material = new THREE.MeshStandardMaterial(MATERIAL_CONFIG);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'shah-azizur-pond-ghat-steps';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'shah-azizur-pond-ghat';
  group.add(mesh);

  const diagnostics = {
    waterId: SHAH_AZIZUR_POND_ID,
    found: true,
    anchor: [anchorX, anchorZ],
    bankNormalIntoWater: [inX, inZ],
    width: ghatHalfW * 2,
    totalWidthWithWalls: (ghatHalfW + wallThick) * 2,
    stepCount,
    stepElevations,
    waterLevel: WATER_LEVEL_Y,
    minY: geometry.boundingBox.min.y,
    maxY: geometry.boundingBox.max.y,
    hasSideBenches: true,
    vertexCount: geometry.getAttribute('position').count,
    drawCalls: 1,
    collisionObjects: 0,
  };
  group.userData.pondGhat = diagnostics;

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
