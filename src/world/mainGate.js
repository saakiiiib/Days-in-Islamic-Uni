import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Islamic University Main Gate (প্রধান ফটক) & Highway Approach Reconstruction.
 * Museum-grade, architecturally faithful 3D recreation anchored to OSM Entrance
 * Node 9027931168 and batched by shared PBR material for ultra-low draw calls.
 *
 * Architectural features:
 * - Two tall independent vehicular arch towers with dark granite base kickplates,
 *   recessed vertical pilaster panels, stepped impost capitals, molded semicircular
 *   archivolts, tapered apex keystones, and multi-tier overhanging cornices.
 * - Two shorter flanking pedestrian arch wings with matching granite plinths,
 *   pilasters, molded archivolts, and overhanging cornices.
 * - Recessed central entrance pavilion with semicircular glass-and-iron sunburst
 *   fanlight lunette, dark emerald-bronze & gold trilingual signboard with IU crest
 *   emblem, framed white marble commemorative plaque, and flanked arched brass
 *   wall-sconce lamp niches.
 * - Iconic rooftop open brushed-steel lattice truss carrying freestanding gleaming
 *   golden Arabic Kalima calligraphy ("لَا إِلٰهَ إِلَّا الله مُحَمَّدٌ رَسُولُ الله")
 *   readable from both exterior and interior with real sky visible through it.
 * - Central semicircular/circular terracotta brick planter island with checkered
 *   base curb, stone coping, 3-tier stainless-steel railing, layered emerald hedges,
 *   and scarlet/gold floral accents.
 * - Ornate wrought-iron open gate leaves with arched top rails, circular scrollwork
 *   medallions, and golden spearhead finials folded cleanly inside the portals.
 * - Warm architectural brass sconces with amber emissive uplights inside all four
 *   archways and central niches.
 * - Paneled stone perimeter boundary walls with rhythmic piers and wrought-iron
 *   spear fencing, procedural asphalt approach road with chamfered black-and-white
 *   curbs, scattered fallen Krishnachura petals, Hero Krishnachura trees, Hero
 *   Royal Palms with curved arching fronds, and a realistic highway barrier.
 */

export const MAIN_GATE_EVIDENCE = Object.freeze({
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Islamic_University_Bangladesh,_Islamic_Unviersity_gate,_iu_gate.jpg',
  observedAt: '2013-02-21', portalCount: 4, dimensionsStatus: 'unmeasured-art-proportions',
  newerAdditionUrl: 'https://www.daily-sun.com/sun-campus/899668',
  newerAdditionStatus: 'reported-steel-calligraphy-layout-unverified',
  note: 'Front view confirms two large and two side arches; exact dimensions, upper beam/crown and current signs require dated elevation verification.',
});

export const MAIN_GATE_CONFIG = Object.freeze({
  position: { x: 304.91, y: 0.0, z: -64.49 }, // OSM Entrance Node 9027931168
  yaw: 2.1866, // Angle facing outward toward highway (~125.3 deg)
  highwayNode: { x: 338.00, y: 0.0, z: -87.87 }, // OSM Highway Node 321516187
  exteriorSpawn: { x: 317.50, y: 0.0, z: -73.50, yaw: 2.1866 }, // Highway approach spawn facing Main Gate (~15.5m outside)
  busParking: { x: 271.00, y: 0.0, z: -45.00, yaw: -0.45 }, // Road bay near entrance
});

// Architectural palette (linearized via THREE.Color for vertex-colored batches)
const PALETTE = Object.freeze({
  stoneMain: 0xf1e8d6,
  stoneTrim: 0xf7f1e3,
  stonePanel: 0xd8cab0,
  stoneKeystone: 0xece2ce,
  stoneWall: 0xdfd7c5,
  stoneCoping: 0xf5f1e7,
  graniteBase: 0x2d3238,
  darkRecess: 0x1c2120,
  curbWhite: 0xf2efe8,
  curbBlack: 0x24272b,
  concreteBarrier: 0xc9c3b6,
  hazardYellow: 0xe6b422,
  steelTruss: 0xd0d7de,
  steelRail: 0xe6edf3,
  barkKrishnachura: 0x453122,
  barkKrishnachuraDark: 0x332317,
  palmTrunkLight: 0xa19e95,
  palmTrunkRing: 0x77746c,
  palmCrownshaft: 0x3b7d34,
  palmFrondBase: 0x1f5222,
  palmFrondMid: 0x2c6b2a,
  palmFrondTip: 0x438236,
  fernDark: 0x1b421a,
  fernMid: 0x255622,
  fernSunlit: 0x31692a,
  hedgeShadow: 0x123217,
  hedgeDeep: 0x163d1c,
  hedgeMid: 0x1f4f24,
  hedgeTip: 0x29612d,
  soilBed: 0x33261b,
  blossomCrimson: 0xb81a0d,
  blossomScarlet: 0xd92612,
  blossomFlame: 0xf03e18,
  blossomOrange: 0xff5c1f,
  flowerRed: 0xd92616,
  flowerGold: 0xf2b724,
  petalDeep: 0xb81b10,
  petalCrimson: 0xd62414,
  petalScarlet: 0xed3b1c,
});

/** Deterministic Mulberry32 PRNG for organic landscaping and procedural textures */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Safely create an offscreen 2D canvas; returns null in headless Node environments */
function createCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

/** Fit text cleanly inside maxWidth without clipping regardless of OS font fallback */
function drawFittedText(ctx, text, x, y, maxWidth, fontBuilder, initialSize, minSize = 18) {
  let size = initialSize;
  ctx.font = fontBuilder(size);
  let measured = ctx.measureText(text).width;
  if (measured > maxWidth && measured > 0) {
    size = Math.max(minSize, Math.floor(size * (maxWidth / measured)));
    ctx.font = fontBuilder(size);
  }
  return size;
}

/** High-res transparent-background golden Arabic Kalima calligraphy CanvasTexture */
function createCalligraphyTexture() {
  const surface = createCanvas(2048, 256);
  if (!surface) return null;
  try {
    const { canvas, ctx } = surface;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const text = 'لَا إِلٰهَ إِلَّا الله مُحَمَّدٌ رَسُولُ الله';
    const fontBuilder = size =>
      `bold ${size}px "Amiri", "Scheherazade New", "Noto Naskh Arabic", "Traditional Arabic", "Times New Roman", serif`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawFittedText(ctx, text, canvas.width / 2, canvas.height / 2 + 4, canvas.width * 0.92, fontBuilder, 134, 48);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 6;

    // Deep antique-bronze outer silhouette stroke (ensures crisp alpha cutout against bright sky)
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#573806';
    ctx.lineWidth = 14;
    ctx.strokeText(text, cx, cy + 3);

    // Warm burnished mid-gold sculptural bevel stroke
    ctx.strokeStyle = '#bd8514';
    ctx.lineWidth = 7;
    ctx.strokeText(text, cx, cy + 1);

    // Rich 24k vertical metallic gold gradient fill
    const grad = ctx.createLinearGradient(0, 36, 0, 220);
    grad.addColorStop(0.0, '#fff7c4');
    grad.addColorStop(0.26, '#fbd65a');
    grad.addColorStop(0.54, '#e0a51e');
    grad.addColorStop(0.78, '#f5ca48');
    grad.addColorStop(1.0, '#99640b');
    ctx.fillStyle = grad;
    ctx.fillText(text, cx, cy);

    // Subtle specular crest highlight along upper stroke edges
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#fffbe3';
    ctx.fillText(text, cx - 1, cy - 2);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

/** Dark emerald-bronze & gold trilingual main gate signboard with IU crest emblem */
function createSignboardTexture() {
  const surface = createCanvas(1024, 384);
  if (!surface) return null;
  try {
    const { canvas, ctx } = surface;
    const w = canvas.width;
    const h = canvas.height;

    // Rich dark emerald-bronze metallic tablet background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#2a271f');
    bgGrad.addColorStop(0.45, '#192920');
    bgGrad.addColorStop(1, '#26231b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal metallic sheen lines
    ctx.fillStyle = 'rgba(255, 240, 196, 0.025)';
    for (let y = 0; y < h; y += 6) {
      ctx.fillRect(0, y, w, 2);
    }

    // Crisp double metallic gold border
    ctx.strokeStyle = '#d9b44a';
    ctx.lineWidth = 7;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = 'rgba(217, 180, 74, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Left Islamic University Crest Emblem Box
    const crestX = 48;
    const crestY = 58;
    const crestW = 196;
    const crestH = 268;
    const crestCx = crestX + crestW / 2;

    ctx.fillStyle = '#0f4c2b';
    ctx.fillRect(crestX, crestY, crestW, crestH);
    ctx.strokeStyle = '#dfc05e';
    ctx.lineWidth = 4;
    ctx.strokeRect(crestX, crestY, crestW, crestH);

    // Stylized Islamic pointed arch inside crest
    ctx.beginPath();
    ctx.moveTo(crestX + 22, crestY + crestH - 22);
    ctx.lineTo(crestX + 22, crestY + 110);
    ctx.quadraticCurveTo(crestX + 22, crestY + 46, crestCx, crestY + 22);
    ctx.quadraticCurveTo(crestX + crestW - 22, crestY + 46, crestX + crestW - 22, crestY + 110);
    ctx.lineTo(crestX + crestW - 22, crestY + crestH - 22);
    ctx.closePath();
    ctx.fillStyle = '#0a361e';
    ctx.fill();
    ctx.strokeStyle = '#e6c55c';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Miniature dome & book emblem inside crest arch
    ctx.fillStyle = '#ebd070';
    ctx.beginPath();
    ctx.arc(crestCx, crestY + 132, 34, Math.PI, 0, false);
    ctx.fill();
    ctx.fillRect(crestCx - 38, crestY + 132, 76, 36);
    // Dome finial spire
    ctx.fillRect(crestCx - 2, crestY + 80, 4, 20);
    // Open book chevron below dome
    ctx.strokeStyle = '#f5df8c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(crestCx - 44, crestY + 196);
    ctx.quadraticCurveTo(crestCx - 20, crestY + 184, crestCx, crestY + 198);
    ctx.quadraticCurveTo(crestCx + 20, crestY + 184, crestCx + 44, crestY + 196);
    ctx.stroke();

    // IU monogram inside crest base
    ctx.fillStyle = '#f5e29e';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IU · 1979', crestCx, crestY + 230);

    // Trilingual stacked typography on right panel
    const textCx = 626;
    const textMaxW = 696;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawGoldLine = (label, y, fontBuilder, initialSize) => {
      drawFittedText(ctx, label, textCx, y, textMaxW, fontBuilder, initialSize, 26);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillText(label, textCx + 2, y + 3);
      const tGrad = ctx.createLinearGradient(0, y - 34, 0, y + 34);
      tGrad.addColorStop(0, '#fff7dc');
      tGrad.addColorStop(0.55, '#f0d788');
      tGrad.addColorStop(1, '#c8a346');
      ctx.fillStyle = tGrad;
      ctx.fillText(label, textCx, y);
    };

    drawGoldLine(
      'ইসলামী বিশ্ববিদ্যালয়',
      102,
      s => `bold ${s}px "Hind Siliguri", "Noto Sans Bengali", "SolaimanLipi", "Kalpurush", "Nirmala UI", sans-serif`,
      64,
    );
    drawGoldLine('الجامعة الإسلامية', 202, s => `bold ${s}px "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif`, 62);
    drawGoldLine('ISLAMIC UNIVERSITY', 298, s => `bold ${s}px "Cinzel", "Georgia", "Times New Roman", serif`, 52);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

/** Framed white Carrara marble commemorative foundation plaque CanvasTexture */
function createPlaqueTexture() {
  const surface = createCanvas(512, 512);
  if (!surface) return null;
  try {
    const { canvas, ctx } = surface;
    const w = canvas.width;
    const h = canvas.height;
    const rng = createRng(19791122);

    // Carrara white marble gradient
    const marbleGrad = ctx.createLinearGradient(0, 0, w, h);
    marbleGrad.addColorStop(0, '#f5f4ef');
    marbleGrad.addColorStop(0.5, '#eceae3');
    marbleGrad.addColorStop(1, '#e4e1d8');
    ctx.fillStyle = marbleGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle organic marble veining
    ctx.strokeStyle = 'rgba(130, 126, 118, 0.14)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = 1 + rng() * 2.2;
      ctx.beginPath();
      let vx = rng() * w;
      let vy = rng() * h;
      ctx.moveTo(vx, vy);
      for (let s = 0; s < 5; s++) {
        vx += (rng() - 0.35) * 90;
        vy += (rng() - 0.35) * 90;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }

    // Carved emerald & gold border trim
    ctx.strokeStyle = '#1b4730';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.strokeStyle = '#c59d34';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    // Small engraved IU medallion at top center
    ctx.beginPath();
    ctx.arc(w / 2, 92, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#144b2c';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#cfa438';
    ctx.stroke();
    ctx.fillStyle = '#f2d87c';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IU', w / 2, 93);

    // Commemorative inscriptions
    const banglaFonts = '"Hind Siliguri", "Noto Sans Bengali", "SolaimanLipi", "Kalpurush", "Nirmala UI", sans-serif';
    ctx.fillStyle = '#143d27';
    drawFittedText(ctx, 'ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ', w / 2, 162, w - 96, s => `bold ${s}px ${banglaFonts}`, 28, 16);
    ctx.fillText('ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ', w / 2, 162);

    ctx.fillStyle = '#3d453f';
    ctx.font = `bold 20px ${banglaFonts}`;
    ctx.fillText('শান্তিডাঙ্গা-দুলালপুর · কুষ্টিয়া', w / 2, 198);

    // Ornamental divider with gold diamond
    ctx.strokeStyle = '#b99335';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(86, 230);
    ctx.lineTo(w - 86, 230);
    ctx.stroke();
    ctx.fillStyle = '#b99335';
    ctx.beginPath();
    ctx.moveTo(w / 2, 222);
    ctx.lineTo(w / 2 + 8, 230);
    ctx.lineTo(w / 2, 238);
    ctx.lineTo(w / 2 - 8, 230);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1d2721';
    ctx.font = 'bold 25px Georgia, serif';
    ctx.fillText('ISLAMIC UNIVERSITY', w / 2, 272);
    ctx.fillStyle = '#3c4540';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText('KUSHTIA · ESTD. 22 NOV 1979', w / 2, 306);

    // Fine engraved foundation script rows (authentic stone plaque visual texture)
    ctx.fillStyle = 'rgba(42, 50, 45, 0.52)';
    const rowWidths = [310, 340, 290, 326, 250];
    for (let r = 0; r < rowWidths.length; r++) {
      const rw = rowWidths[r];
      ctx.fillRect((w - rw) / 2, 344 + r * 22, rw, 5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

/** Procedural limestone plaster color + bump CanvasTextures (neutral tint so vertex colors shine) */
function createStoneTextures() {
  const colorSurf = createCanvas(512, 512);
  const bumpSurf = createCanvas(512, 512);
  if (!colorSurf || !bumpSurf) return { map: null, bumpMap: null };
  try {
    const rng = createRng(40219);
    const { canvas: cCan, ctx: cCtx } = colorSurf;
    const { canvas: bCan, ctx: bCtx } = bumpSurf;

    cCtx.fillStyle = '#f8f7f4';
    cCtx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 512, 512);

    // Subtle limestone mottling & plaster clouds
    for (let i = 0; i < 650; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const r = 4 + rng() * 18;
      const delta = Math.floor((rng() - 0.5) * 18);
      const tone = 244 + delta;
      cCtx.fillStyle = `rgba(${tone}, ${tone - 1}, ${tone - 4}, 0.22)`;
      cCtx.beginPath();
      cCtx.arc(x, y, r, 0, Math.PI * 2);
      cCtx.fill();

      const bt = 128 + delta * 2;
      bCtx.fillStyle = `rgba(${bt}, ${bt}, ${bt}, 0.18)`;
      bCtx.beginPath();
      bCtx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      bCtx.fill();
    }

    // Fine mineral speckle & subtle horizontal ashlar dress lines
    for (let i = 0; i < 2200; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const s = 1 + rng() * 2;
      const dark = rng() > 0.5;
      cCtx.fillStyle = dark ? 'rgba(170, 162, 148, 0.14)' : 'rgba(255, 255, 252, 0.18)';
      cCtx.fillRect(x, y, s, s);
      bCtx.fillStyle = dark ? 'rgba(92, 92, 92, 0.22)' : 'rgba(164, 164, 164, 0.22)';
      bCtx.fillRect(x, y, s, s);
    }

    cCtx.strokeStyle = 'rgba(155, 146, 132, 0.12)';
    bCtx.strokeStyle = 'rgba(78, 78, 78, 0.24)';
    cCtx.lineWidth = 1.5;
    bCtx.lineWidth = 2;
    for (let y = 128; y < 512; y += 128) {
      cCtx.beginPath(); cCtx.moveTo(0, y); cCtx.lineTo(512, y); cCtx.stroke();
      bCtx.beginPath(); bCtx.moveTo(0, y); bCtx.lineTo(512, y); bCtx.stroke();
    }

    const map = new THREE.CanvasTexture(cCan);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;

    const bumpMap = new THREE.CanvasTexture(bCan);
    bumpMap.colorSpace = THREE.NoColorSpace;
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.anisotropy = 4;

    return { map, bumpMap };
  } catch {
    return { map: null, bumpMap: null };
  }
}

/** Procedural running-bond terracotta red brick texture + bumpMap for central planter */
function createBrickTextures() {
  const colorSurf = createCanvas(512, 256);
  const bumpSurf = createCanvas(512, 256);
  if (!colorSurf || !bumpSurf) return { map: null, bumpMap: null };
  try {
    const rng = createRng(77315);
    const { canvas: cCan, ctx: cCtx } = colorSurf;
    const { canvas: bCan, ctx: bCtx } = bumpSurf;

    // Warm recessed lime-sand mortar bed
    cCtx.fillStyle = '#c8bfb0';
    cCtx.fillRect(0, 0, 512, 256);
    bCtx.fillStyle = '#383838';
    bCtx.fillRect(0, 0, 512, 256);

    const rows = 8;
    const cols = 8;
    const rowH = 256 / rows;
    const colW = 512 / cols;
    const mortar = 3.5;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * colW + offset + mortar / 2;
        const by = r * rowH + mortar / 2;
        const bw = colW - mortar;
        const bh = rowH - mortar;

        // Authentic kiln-fired Bangladeshi terracotta variation
        const red = Math.floor(148 + rng() * 38);
        const green = Math.floor(52 + rng() * 24);
        const blue = Math.floor(34 + rng() * 18);
        cCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        cCtx.fillRect(bx, by, bw, bh);

        // Kiln highlight along upper edge & darker lower shadow
        cCtx.fillStyle = 'rgba(255, 212, 180, 0.12)';
        cCtx.fillRect(bx, by, bw, 3);
        cCtx.fillStyle = 'rgba(42, 16, 10, 0.16)';
        cCtx.fillRect(bx, by + bh - 3, bw, 3);

        const bumpVal = Math.floor(190 + rng() * 45);
        bCtx.fillStyle = `rgb(${bumpVal}, ${bumpVal}, ${bumpVal})`;
        bCtx.fillRect(bx, by, bw, bh);
      }
    }

    // Fine clay grain
    for (let i = 0; i < 1600; i++) {
      const x = rng() * 512;
      const y = rng() * 256;
      cCtx.fillStyle = rng() > 0.5 ? 'rgba(40, 14, 10, 0.14)' : 'rgba(240, 180, 140, 0.12)';
      cCtx.fillRect(x, y, 2, 2);
      bCtx.fillStyle = rng() > 0.5 ? 'rgba(130,130,130,0.22)' : 'rgba(245,245,245,0.22)';
      bCtx.fillRect(x, y, 2, 2);
    }

    const map = new THREE.CanvasTexture(cCan);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(5, 1.35);
    map.anisotropy = 4;

    const bumpMap = new THREE.CanvasTexture(bCan);
    bumpMap.colorSpace = THREE.NoColorSpace;
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(5, 1.35);
    bumpMap.anisotropy = 4;

    return { map, bumpMap };
  } catch {
    return { map: null, bumpMap: null };
  }
}

/** Procedural fine-grain weathered asphalt aggregate + bump CanvasTextures (neutral tint for 0x3a3f42 material) */
function createAsphaltTextures() {
  const colorSurf = createCanvas(512, 512);
  const bumpSurf = createCanvas(512, 512);
  if (!colorSurf || !bumpSurf) return { map: null, bumpMap: null };
  try {
    const rng = createRng(99104);
    const { canvas: cCan, ctx: cCtx } = colorSurf;
    const { canvas: bCan, ctx: bCtx } = bumpSurf;

    cCtx.fillStyle = '#e5e7e9';
    cCtx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 512, 512);

    // Subtle weathered wear patches
    for (let i = 0; i < 450; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const r = 6 + rng() * 24;
      const v = Math.floor(204 + rng() * 38);
      cCtx.fillStyle = `rgba(${v}, ${v + 1}, ${v + 3}, 0.22)`;
      cCtx.beginPath();
      cCtx.arc(x, y, r, 0, Math.PI * 2);
      cCtx.fill();
    }

    // Crisp crushed-stone mineral grit
    for (let i = 0; i < 6500; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const s = 1 + rng() * 2.2;
      const bright = rng();
      if (bright > 0.68) {
        cCtx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        bCtx.fillStyle = 'rgba(195, 195, 195, 0.45)';
      } else if (bright < 0.34) {
        cCtx.fillStyle = 'rgba(135, 140, 146, 0.34)';
        bCtx.fillStyle = 'rgba(55, 55, 55, 0.45)';
      } else {
        cCtx.fillStyle = 'rgba(192, 196, 200, 0.24)';
        bCtx.fillStyle = 'rgba(138, 138, 138, 0.3)';
      }
      cCtx.fillRect(x, y, s, s);
      bCtx.fillRect(x, y, s, s);
    }

    const map = new THREE.CanvasTexture(cCan);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(4.5, 7.0);
    map.anisotropy = 4;

    const bumpMap = new THREE.CanvasTexture(bCan);
    bumpMap.colorSpace = THREE.NoColorSpace;
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(4.5, 7.0);
    bumpMap.anisotropy = 4;

    return { map, bumpMap };
  } catch {
    return { map: null, bumpMap: null };
  }
}

/** Procedural vertical fibrous bark bump texture */
function createBarkBumpTexture() {
  const surface = createCanvas(256, 256);
  if (!surface) return null;
  try {
    const rng = createRng(55123);
    const { canvas, ctx } = surface;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 420; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      const w = 1.5 + rng() * 3.5;
      const h = 18 + rng() * 58;
      const tone = rng() > 0.5 ? 185 : 65;
      ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone}, 0.35)`;
      ctx.fillRect(x, y, w, h);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 4);
    return texture;
  } catch {
    return null;
  }
}

/** Compose a transform matrix from translation, Euler rotation, and scale */
function makeTransform(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  mat.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(sx, sy, sz));
  return mat;
}

/** Apply stretch-free tri-planar metric UVs after world/local placement */
function applyMetricUVs(geo, tileSize = 2.5) {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));
    if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x / tileSize;
      uvs[i * 2 + 1] = z / tileSize;
    } else if (nx >= nz) {
      uvs[i * 2] = z / tileSize;
      uvs[i * 2 + 1] = y / tileSize;
    } else {
      uvs[i * 2] = x / tileSize;
      uvs[i * 2 + 1] = y / tileSize;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/** Geometry batch accumulator that normalizes attributes and merges per PBR material */
function createGeometryBatcher(trackedGeometries, trackedMaterials) {
  const buckets = new Map();

  function defineBucket(name, material, { castShadow = true, receiveShadow = true, vertexColors = false } = {}) {
    trackedMaterials.add(material);
    buckets.set(name, { name, material, castShadow, receiveShadow, vertexColors, parts: [] });
  }

  function add(name, rawGeo, { color = null, matrix = null, metricUV = false, tileSize = 2.5 } = {}) {
    const bucket = buckets.get(name);
    if (!bucket) throw new Error(`Unknown mainGate geometry bucket: ${name}`);

    let geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    if (geo !== rawGeo) rawGeo.dispose();

    if (matrix) geo.applyMatrix4(matrix);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();

    if (metricUV) {
      applyMetricUVs(geo, tileSize);
    } else if (!geo.getAttribute('uv')) {
      applyMetricUVs(geo, tileSize);
    }

    // Strip mismatched optional attributes (e.g. uv1/tangent) so mergeGeometries never fails
    for (const attrName of Object.keys(geo.attributes)) {
      if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv' && attrName !== 'color') {
        geo.deleteAttribute(attrName);
      }
    }

    const count = geo.getAttribute('position').count;
    if (bucket.vertexColors) {
      if (!geo.getAttribute('color') || color !== null) {
        const c = new THREE.Color(color ?? 0xffffff);
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          arr[i * 3] = c.r;
          arr[i * 3 + 1] = c.g;
          arr[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
    } else if (geo.getAttribute('color')) {
      geo.deleteAttribute('color');
    }

    bucket.parts.push(geo);
  }

  function addBox(name, w, h, d, x, y, z, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = opts.matrix ?? makeTransform(x, y, z, opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    add(name, geo, { ...opts, matrix: mat });
  }

  function addCylinder(name, rt, rb, h, radialSegs, x, y, z, opts = {}) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, radialSegs);
    const mat = opts.matrix ?? makeTransform(x, y, z, opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    add(name, geo, { ...opts, matrix: mat });
  }

  function addTubeBetween(name, p0, p1, r0, r1, radialSegs = 6, opts = {}) {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-5) return;
    const geo = new THREE.CylinderGeometry(r1, r0, len, radialSegs);
    const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
    add(name, geo, { ...opts, matrix: mat });
  }

  function flush(parent) {
    let drawCalls = 0;
    for (const bucket of buckets.values()) {
      if (!bucket.parts.length) continue;
      const merged = mergeGeometries(bucket.parts, false);
      for (const p of bucket.parts) p.dispose();
      bucket.parts.length = 0;
      if (!merged) throw new Error(`Failed to merge mainGate geometry bucket: ${bucket.name}`);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      trackedGeometries.add(merged);

      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.name = bucket.name;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      parent.add(mesh);
      drawCalls++;
    }
    return drawCalls;
  }

  return { defineBucket, add, addBox, addCylinder, addTubeBetween, flush };
}

/** Semicircular Roman arch spandrel geometry (open below y = 0 and inside radius archRadius) */
function createArchSpandrelGeometry(halfW, spandrelH, archRadius, depth, curveSegments = 20) {
  const shape = new THREE.Shape();
  shape.moveTo(halfW, 0);
  shape.lineTo(halfW, spandrelH);
  shape.lineTo(-halfW, spandrelH);
  shape.lineTo(-halfW, 0);
  shape.lineTo(-archRadius, 0);
  shape.absarc(0, 0, archRadius, Math.PI, 0, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.016,
    bevelSegments: 1,
    curveSegments,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Semicircular molded archivolt trim ring (or concentric fanlight iron ring) */
function createArchivoltRingGeometry(innerR, outerR, depth, bevel = true, curveSegments = 20) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI, false);
  shape.lineTo(-innerR, 0);
  shape.absarc(0, 0, innerR, Math.PI, 0, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.015 : 0,
    bevelSize: bevel ? 0.012 : 0,
    bevelSegments: 1,
    curveSegments,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Tapered classical trapezoidal keystone */
function createKeystoneGeometry(bottomW, topW, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-bottomW / 2, -height / 2);
  shape.lineTo(bottomW / 2, -height / 2);
  shape.lineTo(topW / 2, height / 2);
  shape.lineTo(-topW / 2, height / 2);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Chamfered trapezoidal block (curb stones & highway concrete barrier) */
function createChamferedPrism(bottomW, topW, height, length) {
  const shape = new THREE.Shape();
  shape.moveTo(-bottomW / 2, 0);
  shape.lineTo(bottomW / 2, 0);
  shape.lineTo(topW / 2, height);
  shape.lineTo(-topW / 2, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: length, bevelEnabled: false });
  geo.translate(0, 0, -length / 2);
  return geo;
}

/** Sculpted vertical pilaster with granite kickplate, recessed front/back panels & stepped impost */
function addSculptedPier(batcher, {
  x, width, depth, baseH = 0.54, springY, topY,
  panelBotY = 0.88, panelTopY, hasImpost = true,
}) {
  const halfD = depth / 2;

  // Dark charcoal granite kickplate at ground level
  batcher.addBox('granite-curb-dark', width + 0.14, baseH, depth + 0.16, x, baseH / 2, 0, {
    color: PALETTE.graniteBase, metricUV: true, tileSize: 2.0,
  });

  // Ivory plinth collar immediately above granite kickplate
  const collarH = 0.16;
  batcher.addBox('architectural-stone', width + 0.08, collarH, depth + 0.10, x, baseH + collarH / 2, 0, {
    color: PALETTE.stoneTrim, metricUV: true,
  });

  // Main ivory stone pier shaft
  const shaftStart = baseH + collarH;
  const shaftH = topY - shaftStart;
  batcher.addBox('architectural-stone', width, shaftH, depth, x, shaftStart + shaftH / 2, 0, {
    color: PALETTE.stoneMain, metricUV: true,
  });

  // Recessed vertical pilaster panels framed by raised stiles & rails on BOTH +Z and -Z faces
  const pTop = panelTopY ?? (springY - 0.34);
  const pH = pTop - panelBotY;
  if (pH > 0.6) {
    const pMidY = (panelBotY + pTop) / 2;
    const frameW = 0.11;
    const innerW = Math.max(0.24, width - frameW * 2 - 0.08);
    const stileX = innerW / 2 + frameW / 2;

    for (const faceSign of [-1, 1]) {
      // Subtle darker inset panel backing slightly proud of shaft (no z-fighting)
      batcher.addBox('architectural-stone', innerW, pH - frameW * 2, 0.016, x, pMidY, faceSign * (halfD + 0.008), {
        color: PALETTE.stonePanel, metricUV: true,
      });
      // Raised framing stiles (left & right) and rails (top & bottom) creating true architectural relief
      batcher.addBox('architectural-stone', frameW, pH, 0.05, x - stileX, pMidY, faceSign * (halfD + 0.025), {
        color: PALETTE.stoneTrim, metricUV: true,
      });
      batcher.addBox('architectural-stone', frameW, pH, 0.05, x + stileX, pMidY, faceSign * (halfD + 0.025), {
        color: PALETTE.stoneTrim, metricUV: true,
      });
      batcher.addBox('architectural-stone', innerW + frameW * 2, frameW, 0.05, x, pTop - frameW / 2, faceSign * (halfD + 0.025), {
        color: PALETTE.stoneTrim, metricUV: true,
      });
      batcher.addBox('architectural-stone', innerW + frameW * 2, frameW, 0.05, x, panelBotY + frameW / 2, faceSign * (halfD + 0.025), {
        color: PALETTE.stoneTrim, metricUV: true,
      });
    }
  }

  // Stepped classical impost capital at the arch spring line
  if (hasImpost) {
    batcher.addBox('architectural-stone', width + 0.10, 0.10, depth + 0.12, x, springY - 0.22, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', width + 0.18, 0.11, depth + 0.20, x, springY - 0.115, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', width + 0.24, 0.12, depth + 0.26, x, springY, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
  }
}

/** Add a sculpted brass wall sconce & glowing warm-amber uplight bulb */
function addWallSconce(batcher, x, y, z, normalX, normalZ, scale = 1.0) {
  const yaw = Math.atan2(normalX, normalZ);
  const offsetDist = 0.045 * scale;
  const cx = x + normalX * offsetDist;
  const cz = z + normalZ * offsetDist;

  // Brass wall backplate
  batcher.addBox('burnished-gold', 0.12 * scale, 0.28 * scale, 0.028 * scale, x + normalX * 0.014, y, z + normalZ * 0.014, {
    ry: yaw,
  });
  // Horizontal lantern support arm
  batcher.addCylinder('burnished-gold', 0.014 * scale, 0.014 * scale, 0.08 * scale, 6, cx, y - 0.04 * scale, cz, {
    rx: Math.PI / 2, ry: yaw,
  });
  // Lantern cup & conical brass pagoda cap
  const lx = x + normalX * (0.095 * scale);
  const lz = z + normalZ * (0.095 * scale);
  batcher.addCylinder('burnished-gold', 0.042 * scale, 0.024 * scale, 0.05 * scale, 8, lx, y - 0.055 * scale, lz);
  batcher.add(
    'burnished-gold',
    new THREE.ConeGeometry(0.088 * scale, 0.09 * scale, 8),
    { matrix: makeTransform(lx, y + 0.145 * scale, lz) },
  );
  // Warm glowing amber emissive glass globe
  batcher.add(
    'warm-uplights',
    new THREE.SphereGeometry(0.068 * scale, 10, 8),
    { matrix: makeTransform(lx, y + 0.045 * scale, lz, 0, 0, 0, 1, 1.35, 1) },
  );
}

/** Build an ornate open wrought-iron gate leaf with arched crest, circular medallion & gold finials */
function addOrnateGateLeaf(batcher, {
  hingeX, hingeZ, width, baseHeight, archRise, rotY, hasMedallion = true,
}) {
  const leafMatrix = makeTransform(hingeX, 0, hingeZ, 0, rotY, 0);
  const transformLocal = (geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
    const localM = makeTransform(lx, ly, lz, rx, ry, rz);
    return new THREE.Matrix4().multiplyMatrices(leafMatrix, localM);
  };

  // Vertical hinge stile and latch stile
  const endH = baseHeight + archRise;
  batcher.add('wrought-iron', new THREE.BoxGeometry(0.065, baseHeight, 0.065), {
    matrix: transformLocal(null, 0.032, baseHeight / 2, 0),
  });
  batcher.add('wrought-iron', new THREE.BoxGeometry(0.065, endH, 0.065), {
    matrix: transformLocal(null, width - 0.032, endH / 2, 0),
  });

  // Hinge pivot pins
  for (const hy of [0.55, baseHeight - 0.45]) {
    batcher.add('burnished-gold', new THREE.CylinderGeometry(0.036, 0.036, 0.10, 8), {
      matrix: transformLocal(null, 0.0, hy, 0),
    });
  }

  // Horizontal structural rails (bottom kick, lower dado, mid lock, upper frieze)
  const railYs = [0.18, 0.56, baseHeight * 0.50, baseHeight - 0.34];
  for (const ry of railYs) {
    batcher.add('wrought-iron', new THREE.BoxGeometry(width, 0.048, 0.048), {
      matrix: transformLocal(null, width / 2, ry, 0),
    });
  }

  // Gently curving arched top rail segmented across the width
  const segs = 10;
  const topHeightAt = u => baseHeight + archRise * Math.sin(u * Math.PI * 0.5);
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs;
    const u1 = (i + 1) / segs;
    const p0 = new THREE.Vector3(u0 * width, topHeightAt(u0), 0).applyMatrix4(leafMatrix);
    const p1 = new THREE.Vector3(u1 * width, topHeightAt(u1), 0).applyMatrix4(leafMatrix);
    batcher.addTubeBetween('wrought-iron', p0, p1, 0.026, 0.026, 6);
  }

  // Slender vertical wrought-iron pickets + golden spearhead finials
  const picketCount = Math.max(6, Math.round(width / 0.165));
  for (let i = 1; i < picketCount; i++) {
    const u = i / picketCount;
    const px = u * width;
    const topY = topHeightAt(u);
    batcher.add('wrought-iron', new THREE.CylinderGeometry(0.013, 0.013, topY - 0.16, 6), {
      matrix: transformLocal(null, px, 0.16 + (topY - 0.16) / 2, 0),
    });
    // Gleaming golden spearhead finial above arched top rail
    batcher.add('burnished-gold', new THREE.ConeGeometry(0.034, 0.15, 4), {
      matrix: transformLocal(null, px, topY + 0.085, 0),
    });
    batcher.add('burnished-gold', new THREE.SphereGeometry(0.022, 6, 5), {
      matrix: transformLocal(null, px, topY + 0.015, 0),
    });
  }

  // Decorative circular scrollwork medallion at center of gate leaf
  if (hasMedallion) {
    const mx = width * 0.5;
    const my = baseHeight * 0.50;
    const outerR = Math.min(0.42, width * 0.24);
    const innerR = outerR * 0.55;

    batcher.add('wrought-iron', new THREE.TorusGeometry(outerR, 0.022, 6, 20), {
      matrix: transformLocal(null, mx, my, 0),
    });
    batcher.add('wrought-iron', new THREE.TorusGeometry(innerR, 0.016, 6, 16), {
      matrix: transformLocal(null, mx, my, 0),
    });
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      const pA = new THREE.Vector3(mx, my, 0).applyMatrix4(leafMatrix);
      const pB = new THREE.Vector3(mx + Math.cos(a) * outerR, my + Math.sin(a) * outerR, 0).applyMatrix4(leafMatrix);
      batcher.addTubeBetween('wrought-iron', pA, pB, 0.011, 0.011, 5);
    }
    // Golden rosette boss at center of scrollwork medallion
    batcher.add('burnished-gold', new THREE.SphereGeometry(0.055, 8, 6), {
      matrix: transformLocal(null, mx, my, 0),
    });
  }
}

/** Build a curved multi-segment arching pinnate palm frond (no stiff straight cones!) */
function createArchingPalmFrond(length, maxWidth, archRise, droop, segments = 7) {
  const positions = [];
  const colors = [];
  const uvs = [];

  const cBase = new THREE.Color(PALETTE.palmFrondBase);
  const cMid = new THREE.Color(PALETTE.palmFrondMid);
  const cTip = new THREE.Color(PALETTE.palmFrondTip);
  const tmpColor = new THREE.Color();

  const rings = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = t * length;
    const y = archRise * Math.sin(t * Math.PI * 0.80) - droop * t * t;
    const serration = i === 0 || i === segments ? 1 : (i % 2 === 0 ? 1.0 : 0.84);
    const w = maxWidth * Math.sin(Math.pow(t, 0.72) * Math.PI) * serration;
    const drop = w * 0.36;

    if (t < 0.5) tmpColor.copy(cBase).lerp(cMid, t * 2);
    else tmpColor.copy(cMid).lerp(cTip, (t - 0.5) * 2);

    rings.push({
      left: [-w, y - drop, z],
      mid: [0, y + 0.035, z],
      right: [w, y - drop, z],
      color: [tmpColor.r, tmpColor.g, tmpColor.b],
      t,
    });
  }

  const pushTri = (a, b, c, ca, cb, cc, ua, ub, uc) => {
    positions.push(...a, ...b, ...c);
    colors.push(...ca, ...cb, ...cc);
    uvs.push(...ua, ...ub, ...uc);
  };

  for (let i = 0; i < segments; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    // Left half blade (2 tris)
    pushTri(r0.left, r1.left, r1.mid, r0.color, r1.color, r1.color, [0, r0.t], [0, r1.t], [0.5, r1.t]);
    pushTri(r0.left, r1.mid, r0.mid, r0.color, r1.color, r0.color, [0, r0.t], [0.5, r1.t], [0.5, r0.t]);
    // Right half blade (2 tris)
    pushTri(r0.mid, r1.mid, r1.right, r0.color, r1.color, r1.color, [0.5, r0.t], [0.5, r1.t], [1, r1.t]);
    pushTri(r0.mid, r1.right, r0.right, r0.color, r1.color, r0.color, [0.5, r0.t], [1, r1.t], [1, r0.t]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Add a Hero Royal Palm (Roystonea regia) with ringed curved trunk, green crownshaft & arching fronds */
function addHeroRoyalPalm(batcher, { x, z, trunkHeight = 8.1, leanX = 0.25, leanZ = -0.15, seed = 101 }) {
  const rng = createRng(seed);
  const segCount = 9;
  const points = [];

  for (let i = 0; i <= segCount; i++) {
    const t = i / segCount;
    const curve = t * t;
    points.push(new THREE.Vector3(x + leanX * curve, t * trunkHeight, z + leanZ * curve));
  }

  // Tapered concrete-grey ringed trunk with characteristic gentle mid-height swell
  for (let i = 0; i < segCount; i++) {
    const t0 = i / segCount;
    const t1 = (i + 1) / segCount;
    const radiusAt = t => {
      const baseFlare = Math.exp(-t * 9) * 0.11;
      const midSwell = Math.sin(t * Math.PI) * 0.045;
      return 0.24 - t * 0.05 + baseFlare + midSwell;
    };
    const r0 = radiusAt(t0);
    const r1 = radiusAt(t1);
    batcher.addTubeBetween('tree-bark', points[i], points[i + 1], r0, r1, 8, {
      color: PALETTE.palmTrunkLight,
    });
    // Leaf-scar horizontal ring collar
    if (i > 0) {
      batcher.addCylinder('tree-bark', r0 + 0.012, r0 + 0.012, 0.055, 8, points[i].x, points[i].y, points[i].z, {
        color: PALETTE.palmTrunkRing,
      });
    }
  }

  // Glossy emerald green crownshaft
  const topP = points[segCount];
  const crownshaftH = 1.28;
  const shaftTop = new THREE.Vector3(topP.x + leanX * 0.09, topP.y + crownshaftH, topP.z + leanZ * 0.09);
  batcher.addTubeBetween('foliage-canopy', topP, shaftTop, 0.225, 0.195, 8, {
    color: PALETTE.palmCrownshaft,
  });

  // Two-tier multi-segment curved arching pinnate fronds (12 fronds + central spear)
  const lowerCount = 7;
  for (let i = 0; i < lowerCount; i++) {
    const yaw = (i / lowerCount) * Math.PI * 2 + (rng() - 0.5) * 0.22;
    const frondLen = 3.25 + rng() * 0.55;
    const frondGeo = createArchingPalmFrond(frondLen, 0.62, 0.55 + rng() * 0.22, 1.35 + rng() * 0.25, 7);
    batcher.add('foliage-canopy', frondGeo, {
      matrix: makeTransform(shaftTop.x, shaftTop.y - 0.08, shaftTop.z, 0, yaw, 0),
    });
  }

  const upperCount = 5;
  for (let i = 0; i < upperCount; i++) {
    const yaw = ((i + 0.5) / upperCount) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    const frondLen = 2.75 + rng() * 0.45;
    const frondGeo = createArchingPalmFrond(frondLen, 0.52, 0.95 + rng() * 0.20, 0.85 + rng() * 0.22, 7);
    batcher.add('foliage-canopy', frondGeo, {
      matrix: makeTransform(shaftTop.x, shaftTop.y + 0.04, shaftTop.z, 0, yaw, 0),
    });
  }

  // Central emerging upright palm spear leaf
  batcher.add('foliage-canopy', new THREE.ConeGeometry(0.08, 1.05, 5), {
    color: PALETTE.palmFrondTip,
    matrix: makeTransform(shaftTop.x, shaftTop.y + 0.52, shaftTop.z),
  });
}

/** Watertight organically-jittered low-poly leaf/blossom puff (no smooth bowling-ball spheres or cracked seams) */
function createOrganicLeafTuft(radius, detail, rng, jitter = 0.14) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.getAttribute('position');
  const offsets = new Map();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let factor = offsets.get(key);
    if (factor === undefined) {
      factor = 1 + (rng() - 0.5) * 2 * jitter;
      offsets.set(key, factor);
    }
    pos.setXYZ(i, x * factor, y * factor, z * factor);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Add a Hero Krishnachura tree (Delonix regia) with gnarled multi-branching limbs & billowing scarlet umbrella canopy */
function addHeroKrishnachura(batcher, { x, z, scale = 1.0, leanX = 0, leanZ = 0, seed = 202 }) {
  const rng = createRng(seed);

  // Buttress root spurs gripping the earth cleanly
  for (let r = 0; r < 4; r++) {
    const a = (r / 4) * Math.PI * 2 + rng() * 0.4;
    const p0 = new THREE.Vector3(x + Math.cos(a) * 0.64 * scale, 0.08, z + Math.sin(a) * 0.64 * scale);
    const p1 = new THREE.Vector3(x + Math.cos(a) * 0.18 * scale, 0.95 * scale, z + Math.sin(a) * 0.18 * scale);
    batcher.addTubeBetween('tree-bark', p0, p1, 0.20 * scale, 0.13 * scale, 6, {
      color: PALETTE.barkKrishnachuraDark,
    });
  }

  // Multi-segment gently curved gnarled main trunk rising tall to frame gate shoulders
  const t0 = new THREE.Vector3(x, 0.02, z);
  const t1 = new THREE.Vector3(x + leanX * 0.25, 1.65 * scale, z + leanZ * 0.25);
  const t2 = new THREE.Vector3(x + leanX * 0.62, 3.30 * scale, z + leanZ * 0.62);
  const t3 = new THREE.Vector3(x + leanX, 4.68 * scale, z + leanZ);

  batcher.addTubeBetween('tree-bark', t0, t1, 0.52 * scale, 0.42 * scale, 8, { color: PALETTE.barkKrishnachuraDark });
  batcher.addTubeBetween('tree-bark', t1, t2, 0.42 * scale, 0.36 * scale, 7, { color: PALETTE.barkKrishnachura });
  batcher.addTubeBetween('tree-bark', t2, t3, 0.36 * scale, 0.29 * scale, 7, { color: PALETTE.barkKrishnachura });

  const fernPalette = [PALETTE.fernDark, PALETTE.fernMid, PALETTE.fernSunlit];
  const blossomPalette = [PALETTE.blossomCrimson, PALETTE.blossomScarlet, PALETTE.blossomFlame, PALETTE.blossomOrange];

  // Sweeping primary umbrella boughs + secondary forks supporting a billowing multi-puff crown
  const boughCount = 5;
  const canopyTips = [new THREE.Vector3(t3.x, t3.y + 2.55 * scale, t3.z)];

  for (let b = 0; b < boughCount; b++) {
    const az = (b / boughCount) * Math.PI * 2 + (rng() - 0.5) * 0.32;
    const reach = (2.40 + rng() * 0.72) * scale;
    const rise = (2.10 + rng() * 0.58) * scale;
    const startP = b % 2 === 0 ? t3 : t2.clone().lerp(t3, 0.72);
    const midP = new THREE.Vector3(
      startP.x + Math.cos(az) * reach * 0.55,
      startP.y + rise * 0.62,
      startP.z + Math.sin(az) * reach * 0.55,
    );
    const endP = new THREE.Vector3(
      startP.x + Math.cos(az) * reach,
      startP.y + rise,
      startP.z + Math.sin(az) * reach,
    );

    batcher.addTubeBetween('tree-bark', startP, midP, 0.22 * scale, 0.16 * scale, 6, { color: PALETTE.barkKrishnachura });
    batcher.addTubeBetween('tree-bark', midP, endP, 0.16 * scale, 0.10 * scale, 5, { color: PALETTE.barkKrishnachura });
    canopyTips.push(endP);

    // Fork into 2 outward spreading secondary sub-branches
    for (const forkSign of [-1, 1]) {
      const subAz = az + forkSign * (0.42 + rng() * 0.22);
      const subReach = (1.30 + rng() * 0.44) * scale;
      const subEnd = new THREE.Vector3(
        midP.x + Math.cos(subAz) * subReach,
        midP.y + (0.85 + rng() * 0.40) * scale,
        midP.z + Math.sin(subAz) * subReach,
      );
      batcher.addTubeBetween('tree-bark', midP, subEnd, 0.12 * scale, 0.065 * scale, 5, {
        color: PALETTE.barkKrishnachuraDark,
      });
      canopyTips.push(subEnd);
    }
  }

  const maxCrownY = 10.60;
  const addCanopyPuff = (bucket, px, py, pz, radius, sy, color) => {
    const r = Math.min(1.45, Math.max(0.85, radius));
    const sx = 0.98 + rng() * 0.16;
    const sz = 0.98 + rng() * 0.16;
    const safeY = Math.min(py, maxCrownY - r * 1.15 * sy);
    const puffGeo = createOrganicLeafTuft(r, 1, rng, 0.13);
    batcher.add(bucket, puffGeo, {
      color,
      matrix: makeTransform(
        px,
        safeY,
        pz,
        (rng() - 0.5) * 0.24,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.24,
        sx,
        sy,
        sz,
      ),
    });
  };

  // 16 deep fern-green under-canopy puffs + 16 crowning scarlet/crimson/flame-orange blossom puffs
  for (let i = 0; i < canopyTips.length; i++) {
    const tip = canopyTips[i];
    const isCenter = i === 0;

    // Deep fern-green foliage cushion cradling each bough tip
    const leafR = isCenter ? 1.40 : (0.98 + rng() * 0.42);
    const leafSy = 0.64 + rng() * 0.12;
    const leafColor = fernPalette[Math.floor(rng() * fernPalette.length)];
    addCanopyPuff(
      'foliage-canopy',
      tip.x + (rng() - 0.5) * 0.32 * scale,
      tip.y + (isCenter ? 0.12 : -0.08) * scale,
      tip.z + (rng() - 0.5) * 0.32 * scale,
      leafR,
      leafSy,
      leafColor,
    );

    // Billowing multi-tone crimson/scarlet/flame-orange blossom cluster crowning upper umbrella
    const blossomR = isCenter ? 1.32 : (0.88 + rng() * 0.44);
    const blossomSy = 0.62 + rng() * 0.15;
    const blossomColor = blossomPalette[Math.floor(rng() * blossomPalette.length)];
    addCanopyPuff(
      'krishnachura-blossoms',
      tip.x + (rng() - 0.5) * 0.48 * scale,
      tip.y + (isCenter ? 0.72 : (0.48 + rng() * 0.28)) * scale,
      tip.z + (rng() - 0.5) * 0.48 * scale,
      blossomR,
      blossomSy,
      blossomColor,
    );
  }

  // 4 inner-crown bridge puffs (2 deep fern + 2 blazing scarlet/orange) for continuous billowing umbrella volume
  for (let m = 0; m < 4; m++) {
    const az = (m / 4) * Math.PI * 2 + 0.38 + (rng() - 0.5) * 0.25;
    const rad = (1.35 + rng() * 0.55) * scale;
    const bx = t3.x + Math.cos(az) * rad;
    const bz = t3.z + Math.sin(az) * rad;
    const isBlossom = m % 2 === 0;
    addCanopyPuff(
      isBlossom ? 'krishnachura-blossoms' : 'foliage-canopy',
      bx,
      t3.y + (isBlossom ? 2.85 : 2.15) * scale,
      bz,
      0.95 + rng() * 0.32,
      0.64 + rng() * 0.14,
      isBlossom
        ? blossomPalette[Math.floor(rng() * blossomPalette.length)]
        : fernPalette[Math.floor(rng() * fernPalette.length)],
    );
  }
}

/**
 * Builds the complete 3D Main Gate architectural assembly, boundary walls,
 * landscaping, approach road, and collision boxes.
 */
export function buildMainGate(options = {}) {
  const group = new THREE.Group();
  group.name = 'islamic-university-main-gate';
  group.userData.referenceEvidence = { ...MAIN_GATE_EVIDENCE };

  const collisionGroup = new THREE.Group();
  collisionGroup.name = 'main-gate-colliders';
  collisionGroup.visible = false;

  const obstacles = [];
  const trackedGeometries = new Set();
  const trackedMaterials = new Set();
  const trackedTextures = new Set();
  const trackTexture = tex => { if (tex) trackedTextures.add(tex); return tex; };

  // Procedural CanvasTextures (all return null safely in headless Node)
  const stoneTex = createStoneTextures();
  trackTexture(stoneTex.map);
  trackTexture(stoneTex.bumpMap);

  const brickTex = createBrickTextures();
  trackTexture(brickTex.map);
  trackTexture(brickTex.bumpMap);

  const asphaltTex = createAsphaltTextures();
  trackTexture(asphaltTex.map);
  trackTexture(asphaltTex.bumpMap);

  const barkBumpTex = trackTexture(createBarkBumpTexture());
  const calligraphyTex = trackTexture(createCalligraphyTexture());
  const signboardTex = trackTexture(createSignboardTexture());
  const plaqueTex = trackTexture(createPlaqueTexture());

  // Shared PBR Materials (16 total batches -> <= 16 draw calls!)
  const batcher = createGeometryBatcher(trackedGeometries, trackedMaterials);

  batcher.defineBucket('architectural-stone', new THREE.MeshStandardMaterial({
    color: 0xefe5d2,
    vertexColors: true,
    map: stoneTex.map,
    bumpMap: stoneTex.bumpMap,
    bumpScale: 0.022,
    roughness: 0.86,
    metalness: 0.03,
    envMapIntensity: 0.28,
  }), { castShadow: true, receiveShadow: true, vertexColors: true });

  batcher.defineBucket('granite-curb-dark', new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.76,
    metalness: 0.06,
    envMapIntensity: 0.30,
  }), { castShadow: true, receiveShadow: true, vertexColors: true });

  batcher.defineBucket('terracotta-brick', new THREE.MeshStandardMaterial({
    color: brickTex.map ? 0xffffff : 0xa33f2b,
    map: brickTex.map,
    bumpMap: brickTex.bumpMap,
    bumpScale: 0.034,
    roughness: 0.90,
    metalness: 0.02,
    envMapIntensity: 0.25,
  }), { castShadow: true, receiveShadow: true });

  batcher.defineBucket('brushed-steel', new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.88,
  }), { castShadow: true, receiveShadow: true, vertexColors: true });

  batcher.defineBucket('wrought-iron', new THREE.MeshStandardMaterial({
    color: 0x171a1d,
    roughness: 0.36,
    metalness: 0.88,
  }), { castShadow: true, receiveShadow: true });

  batcher.defineBucket('burnished-gold', new THREE.MeshStandardMaterial({
    color: 0xdcb43e,
    roughness: 0.24,
    metalness: 0.90,
  }), { castShadow: true, receiveShadow: true });

  batcher.defineBucket('warm-uplights', new THREE.MeshStandardMaterial({
    color: 0xffe6ad,
    emissive: 0xffb347,
    emissiveIntensity: 2.2,
    roughness: 0.25,
    metalness: 0.0,
  }), { castShadow: false, receiveShadow: false });

  batcher.defineBucket('fanlight-glass', new THREE.MeshStandardMaterial({
    color: 0x264b42,
    emissive: 0x0d211b,
    emissiveIntensity: 0.25,
    roughness: 0.15,
    metalness: 0.38,
  }), { castShadow: false, receiveShadow: true });

  batcher.defineBucket('rooftop-kalima-calligraphy', new THREE.MeshStandardMaterial({
    color: calligraphyTex ? 0xffffff : 0xdcb43e,
    map: calligraphyTex,
    alphaTest: calligraphyTex ? 0.35 : 0,
    roughness: 0.24,
    metalness: 0.78,
    emissive: 0xd99b1e,
    emissiveIntensity: 0.35,
  }), { castShadow: false, receiveShadow: false });

  batcher.defineBucket('central-signboard', new THREE.MeshStandardMaterial({
    color: signboardTex ? 0xffffff : 0x1e2c22,
    map: signboardTex,
    emissive: 0xffe2a3,
    emissiveMap: signboardTex,
    emissiveIntensity: 0.18,
    roughness: 0.45,
    metalness: 0.22,
    envMapIntensity: 0.55,
  }), { castShadow: false, receiveShadow: true });

  batcher.defineBucket('marble-plaque', new THREE.MeshStandardMaterial({
    color: plaqueTex ? 0xffffff : 0xf0eee7,
    map: plaqueTex,
    roughness: 0.42,
    metalness: 0.06,
  }), { castShadow: false, receiveShadow: true });

  batcher.defineBucket('asphalt-road', new THREE.MeshStandardMaterial({
    color: 0x3a3f42,
    map: asphaltTex.map,
    bumpMap: asphaltTex.bumpMap,
    bumpScale: 0.022,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), { castShadow: false, receiveShadow: true });

  batcher.defineBucket('tree-bark', new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    bumpMap: barkBumpTex,
    bumpScale: 0.025,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.22,
  }), { castShadow: true, receiveShadow: true, vertexColors: true });

  batcher.defineBucket('foliage-canopy', new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.25,
    side: THREE.DoubleSide,
  }), { castShadow: true, receiveShadow: true, vertexColors: true });

  batcher.defineBucket('krishnachura-blossoms', new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
    envMapIntensity: 0.25,
    side: THREE.DoubleSide,
  }), { castShadow: true, receiveShadow: true, vertexColors: true });

  batcher.defineBucket('fallen-petals', new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.0,
    envMapIntensity: 0.25,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }), { castShadow: false, receiveShadow: true, vertexColors: true });

  // Gate container anchored at OSM Entrance Node 9027931168
  const gateCenter = MAIN_GATE_CONFIG.position;
  const gateYaw = MAIN_GATE_CONFIG.yaw;
  const upAxis = new THREE.Vector3(0, 1, 0);

  const gateRig = new THREE.Group();
  gateRig.name = 'main-gate-rig';
  gateRig.position.set(gateCenter.x, gateCenter.y, gateCenter.z);
  gateRig.rotation.y = gateYaw;
  group.add(gateRig);

  const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
  trackedMaterials.add(colliderMat);

  const addBoxCollider = (name, kind, lx, ly, lz, w, h, d, pushObstacle = true) => {
    const worldP = new THREE.Vector3(lx, ly, lz).applyAxisAngle(upAxis, gateYaw).add(gateCenter);
    const geo = new THREE.BoxGeometry(w, h, d);
    trackedGeometries.add(geo);
    const mesh = new THREE.Mesh(geo, colliderMat);
    mesh.position.copy(worldP);
    mesh.rotation.y = gateYaw;
    mesh.name = name;
    collisionGroup.add(mesh);

    if (pushObstacle) {
      obstacles.push({
        id: name,
        kind,
        x: worldP.x,
        z: worldP.z,
        width: w,
        depth: d,
        height: h,
        yaw: gateYaw,
      });
    }
  };

  // ==========================================================================
  // 1. TWO TALL INDEPENDENT VEHICULAR ARCH TOWERS (Left: x = -4.70, Right: +4.70)
  // Clear vehicular portal opening per tower: 3.70m wide (|x| = 2.85..6.55),
  // springY = 5.05m, semicircular radius = 1.85m (crown apex = 6.90m).
  // Double-decker bus (2.70m W x 4.20m H) drives through with ample clearance!
  // ==========================================================================
  const vehSpringY = 5.05;
  const vehArchR = 1.85;
  const vehSpandrelH = 3.17; // rises cleanly from y = 5.05 to y = 8.22
  const vehTowerDepth = 1.44;
  const vehSpandrelDepth = 1.36;

  for (const side of [-1, 1]) {
    const towerCx = side * 4.70;
    const innerPierX = side * 2.425; // |x| = 2.00..2.85 (width 0.85m)
    const outerPierX = side * 6.975; // |x| = 6.55..7.40 (width 0.85m)

    addSculptedPier(batcher, {
      x: innerPierX, width: 0.85, depth: vehTowerDepth,
      springY: vehSpringY, topY: 8.22,
    });
    addSculptedPier(batcher, {
      x: outerPierX, width: 0.85, depth: vehTowerDepth,
      springY: vehSpringY, topY: 8.22,
    });

    // Semicircular spandrel header spanning full tower width (5.40m)
    batcher.add('architectural-stone', createArchSpandrelGeometry(2.70, vehSpandrelH, vehArchR, vehSpandrelDepth, 20), {
      color: PALETTE.stoneMain,
      metricUV: true,
      matrix: makeTransform(towerCx, vehSpringY, 0),
    });

    // Molded double-stepped semicircular archivolt trim on front (+Z) & back (-Z)
    for (const faceSign of [-1, 1]) {
      batcher.add('architectural-stone', createArchivoltRingGeometry(vehArchR - 0.01, vehArchR + 0.17, 0.09, true, 20), {
        color: PALETTE.stoneTrim,
        metricUV: true,
        matrix: makeTransform(towerCx, vehSpringY, faceSign * (vehSpandrelDepth / 2 + 0.03)),
      });
      batcher.add('architectural-stone', createArchivoltRingGeometry(vehArchR + 0.17, vehArchR + 0.27, 0.06, true, 20), {
        color: PALETTE.stonePanel,
        metricUV: true,
        matrix: makeTransform(towerCx, vehSpringY, faceSign * (vehSpandrelDepth / 2 + 0.015)),
      });
    }

    // Sculpted tapered apex keystone + crowning cap fillet
    const apexY = vehSpringY + vehArchR + 0.10;
    batcher.add('architectural-stone', createKeystoneGeometry(0.34, 0.50, 0.56, vehSpandrelDepth + 0.24), {
      color: PALETTE.stoneKeystone,
      metricUV: true,
      matrix: makeTransform(towerCx, apexY, 0),
    });
    batcher.addBox('architectural-stone', 0.56, 0.08, vehSpandrelDepth + 0.30, towerCx, apexY + 0.31, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });

    // Multi-tier overhanging classical cornice atop each tall vehicular tower (y = 8.22..8.82)
    batcher.addBox('architectural-stone', 5.56, 0.14, 1.56, towerCx, 8.29, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', 5.46, 0.10, 1.46, towerCx, 8.41, 0, {
      color: PALETTE.stonePanel, metricUV: true,
    });
    batcher.addBox('architectural-stone', 5.78, 0.12, 1.74, towerCx, 8.52, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', 6.04, 0.15, 1.96, towerCx, 8.655, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', 5.54, 0.09, 1.54, towerCx, 8.775, 0, {
      color: PALETTE.stoneMain, metricUV: true,
    });

    // Warm architectural brass sconces tucked inside both inner reveals of each vehicular arch
    addWallSconce(batcher, side * 2.85, 4.38, 0.24, side, 0, 1.0);
    addWallSconce(batcher, side * 2.85, 4.38, -0.24, side, 0, 0.9);
    addWallSconce(batcher, side * 6.55, 4.38, 0.24, -side, 0, 1.0);
    addWallSconce(batcher, side * 6.55, 4.38, -0.24, -side, 0, 0.9);
  }

  // ==========================================================================
  // 2. TWO SHORTER FLANKING PEDESTRIAN ARCH WINGS (Left: x = -8.30, Right: +8.30)
  // Clear pedestrian opening: 1.80m wide (|x| = 7.40..9.20), springY = 3.45m,
  // semicircular radius = 0.90m (crown apex = 4.35m), cornice top = 5.70m,
  // cornice outer edge |x| = 10.16 <= 10.20 safe bound!
  // ==========================================================================
  const pedSpringY = 3.45;
  const pedArchR = 0.90;
  const pedSpandrelH = 1.80; // rises from y = 3.45 to y = 5.25
  const pedDepth = 1.12;

  for (const side of [-1, 1]) {
    const pedCx = side * 8.30;
    const farPierX = side * 9.56; // |x| = 9.20..9.92 (width 0.72m)

    addSculptedPier(batcher, {
      x: farPierX, width: 0.72, depth: pedDepth,
      baseH: 0.50, springY: pedSpringY, topY: 5.25, panelBotY: 0.84,
    });

    // Matching inner pedestrian impost bracket abutting the tall vehicular tower
    batcher.addBox('architectural-stone', 0.16, 0.24, pedDepth + 0.14, side * 7.42, pedSpringY - 0.06, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });

    // Pedestrian arch spandrel spanning cleanly between outer vehicular pier and far pier
    // Covers x from |7.40| to |9.92| -> width 2.52m, centered around pedCx = ±8.30
    // Built explicitly with asymmetric outer pier width so zero gap exists at |x|=7.40 or |x|=9.92
    const wingShape = new THREE.Shape();
    if (side === 1) {
      wingShape.moveTo(1.62, 0);        // +9.92
      wingShape.lineTo(1.62, pedSpandrelH);
      wingShape.lineTo(-0.90, pedSpandrelH); // +7.40
      wingShape.lineTo(-0.90, 0);
      wingShape.absarc(0, 0, pedArchR, Math.PI, 0, true);
      wingShape.closePath();
    } else {
      wingShape.moveTo(0.90, 0);        // -7.40
      wingShape.lineTo(0.90, pedSpandrelH);
      wingShape.lineTo(-1.62, pedSpandrelH); // -9.92
      wingShape.lineTo(-1.62, 0);
      wingShape.lineTo(-0.90, 0);
      wingShape.absarc(0, 0, pedArchR, Math.PI, 0, true);
      wingShape.closePath();
    }
    const pedSpandrelGeo = new THREE.ExtrudeGeometry(wingShape, {
      steps: 1, depth: pedDepth - 0.06, bevelEnabled: true,
      bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 1, curveSegments: 18,
    });
    pedSpandrelGeo.translate(0, 0, -(pedDepth - 0.06) / 2);
    batcher.add('architectural-stone', pedSpandrelGeo, {
      color: PALETTE.stoneMain,
      metricUV: true,
      matrix: makeTransform(pedCx, pedSpringY, 0),
    });

    // Molded pedestrian archivolt trim & mini keystone on front & back
    for (const faceSign of [-1, 1]) {
      batcher.add('architectural-stone', createArchivoltRingGeometry(pedArchR - 0.01, pedArchR + 0.14, 0.07, true, 18), {
        color: PALETTE.stoneTrim,
        metricUV: true,
        matrix: makeTransform(pedCx, pedSpringY, faceSign * (pedDepth / 2)),
      });
    }
    batcher.add('architectural-stone', createKeystoneGeometry(0.24, 0.34, 0.38, pedDepth + 0.18), {
      color: PALETTE.stoneKeystone,
      metricUV: true,
      matrix: makeTransform(pedCx, pedSpringY + pedArchR + 0.06, 0),
    });

    // Multi-tier overhanging pedestrian wing cornice (top y = 5.70, outer |x| = 10.16 <= 10.20)
    const wingMidX = side * 8.68; // spans |x| = 7.40..9.96
    batcher.addBox('architectural-stone', 2.60, 0.12, 1.24, wingMidX, 5.31, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', 2.54, 0.08, 1.18, wingMidX, 5.41, 0, {
      color: PALETTE.stonePanel, metricUV: true,
    });
    const coronaMidX = side * 8.78; // 8.78 + 1.38 = 10.16 <= 10.20!
    batcher.addBox('architectural-stone', 2.76, 0.16, 1.46, coronaMidX, 5.53, 0, {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('architectural-stone', 2.58, 0.09, 1.26, wingMidX, 5.655, 0, {
      color: PALETTE.stoneMain, metricUV: true,
    });

    // Warm architectural sconces inside pedestrian archway reveals
    addWallSconce(batcher, side * 7.40, 3.00, 0.16, side, 0, 0.85);
    addWallSconce(batcher, side * 9.20, 3.00, 0.16, -side, 0, 0.85);
  }

  // ==========================================================================
  // 3. CENTRAL ENTRANCE PAVILION (x = -2.00..+2.00, recessed z = -0.56..+0.56)
  // Lower monumental pavilion crowned by semicircular decorative glass-and-iron
  // fanlight lunette (top y = 5.88), leaving open sky beneath the rooftop truss!
  // ==========================================================================
  const pavWidth = 4.04;
  const pavDepth = 1.12;
  const pavHalfD = pavDepth / 2;

  // Dark granite base & recessed ivory central stone monument block
  batcher.addBox('granite-curb-dark', pavWidth + 0.08, 0.52, pavDepth + 0.12, 0, 0.26, 0, {
    color: PALETTE.graniteBase, metricUV: true,
  });
  batcher.addBox('architectural-stone', pavWidth, 4.14, pavDepth, 0, 0.52 + 2.07, 0, {
    color: PALETTE.stoneMain, metricUV: true,
  });

  // Mid horizontal belt course separating lower plaque/niche zone & trilingual signboard
  batcher.addBox('architectural-stone', pavWidth + 0.16, 0.14, pavDepth + 0.16, 0, 3.04, 0, {
    color: PALETTE.stoneTrim, metricUV: true,
  });

  // Stepped overhanging cornice crowning the central pavilion (y = 4.66..4.92)
  batcher.addBox('architectural-stone', pavWidth + 0.12, 0.10, pavDepth + 0.18, 0, 4.71, 0, {
    color: PALETTE.stonePanel, metricUV: true,
  });
  batcher.addBox('architectural-stone', pavWidth + 0.26, 0.16, pavDepth + 0.30, 0, 4.84, 0, {
    color: PALETTE.stoneTrim, metricUV: true,
  });

  // Semicircular Decorative Glass-and-Iron Sunburst Fanlight Lunette (y = 4.92..5.88)
  const lunetteY = 4.92;
  const lunetteInR = 0.78;
  const lunetteOutR = 0.96;

  // Molded ivory stone arch surround & base sill
  batcher.add('architectural-stone', createArchivoltRingGeometry(lunetteInR, lunetteOutR, 0.50, true, 18), {
    color: PALETTE.stoneTrim,
    metricUV: true,
    matrix: makeTransform(0, lunetteY, 0),
  });
  batcher.addBox('architectural-stone', lunetteOutR * 2 + 0.14, 0.10, 0.58, 0, lunetteY + 0.04, 0, {
    color: PALETTE.stoneTrim, metricUV: true,
  });
  // Small sculpted finial capstone at top of lunette
  batcher.add('architectural-stone', createKeystoneGeometry(0.18, 0.26, 0.24, 0.56), {
    color: PALETTE.stoneKeystone,
    metricUV: true,
    matrix: makeTransform(0, lunetteY + lunetteOutR - 0.05, 0),
  });

  // Tinted dark emerald-teal semicircular fanlight glass pane
  const glassShape = new THREE.Shape();
  glassShape.absarc(0, 0, lunetteInR + 0.02, 0, Math.PI, false);
  glassShape.closePath();
  const glassGeo = new THREE.ExtrudeGeometry(glassShape, { steps: 1, depth: 0.10, bevelEnabled: false, curveSegments: 18 });
  glassGeo.translate(0, 0, -0.05);
  batcher.add('fanlight-glass', glassGeo, { matrix: makeTransform(0, lunetteY, 0) });

  // Intricate radial wrought-iron sunburst fanlight mullions (front & back faces)
  for (const faceSign of [-1, 1]) {
    const fz = faceSign * 0.075;
    // Two concentric iron semi-rings
    batcher.add('wrought-iron', createArchivoltRingGeometry(0.28, 0.315, 0.03, false, 16), {
      matrix: makeTransform(0, lunetteY, fz),
    });
    batcher.add('wrought-iron', createArchivoltRingGeometry(0.54, 0.575, 0.03, false, 18), {
      matrix: makeTransform(0, lunetteY, fz),
    });
    // Horizontal base bar
    batcher.addBox('wrought-iron', lunetteInR * 2, 0.04, 0.04, 0, lunetteY + 0.06, fz);
    // 9 radial sunburst spokes
    for (let s = 1; s <= 9; s++) {
      const a = (s / 10) * Math.PI;
      const p0 = new THREE.Vector3(0, lunetteY + 0.04, fz);
      const p1 = new THREE.Vector3(Math.cos(a) * lunetteInR, lunetteY + Math.sin(a) * lunetteInR, fz);
      batcher.addTubeBetween('wrought-iron', p0, p1, 0.014, 0.014, 4);
    }
    // Golden center sunburst rosette
    batcher.add('burnished-gold', new THREE.SphereGeometry(0.065, 8, 6), {
      matrix: makeTransform(0, lunetteY + 0.07, fz + faceSign * 0.02),
    });
  }

  // Front (+Z) & Back (-Z) Signboards, Framed White Marble Plaques, and Flanked Arched Lamp Niches
  for (const faceSign of [-1, 1]) {
    const rotY = faceSign === 1 ? 0 : Math.PI;

    // Trilingual Signboard Stone & Gold Molded Frame (y = 3.16..4.56)
    const signY = 3.86;
    batcher.addBox('architectural-stone', 3.84, 1.44, 0.06, 0, signY, faceSign * (pavHalfD + 0.03), {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('burnished-gold', 3.74, 1.36, 0.036, 0, signY, faceSign * (pavHalfD + 0.056));
    batcher.add('central-signboard', new THREE.PlaneGeometry(3.66, 1.30), {
      matrix: makeTransform(0, signY, faceSign * (pavHalfD + 0.092), 0, rotY, 0),
    });

    // Framed White Marble Commemorative Plaque below signboard (y = 1.15..2.65)
    const plaqueY = 1.90;
    batcher.addBox('architectural-stone', 1.44, 1.54, 0.055, 0, plaqueY, faceSign * (pavHalfD + 0.028), {
      color: PALETTE.stoneTrim, metricUV: true,
    });
    batcher.addBox('granite-curb-dark', 1.34, 1.44, 0.032, 0, plaqueY, faceSign * (pavHalfD + 0.052), {
      color: PALETTE.darkRecess,
    });
    batcher.add('marble-plaque', new THREE.PlaneGeometry(1.26, 1.36), {
      matrix: makeTransform(0, plaqueY, faceSign * (pavHalfD + 0.088), 0, rotY, 0),
    });

    // Two Flanked Small Arched Lamp Niches with Glowing Brass Wall Sconces (x = ±1.32)
    for (const nicheSide of [-1, 1]) {
      const nx = nicheSide * 1.32;
      const nicheBotY = 1.24;
      const nicheSpringY = 2.22;
      const nicheR = 0.22;

      // Dark recessed arched niche shadow cavity
      const cavityShape = new THREE.Shape();
      cavityShape.moveTo(-nicheR, 0);
      cavityShape.lineTo(nicheR, 0);
      cavityShape.lineTo(nicheR, nicheSpringY - nicheBotY);
      cavityShape.absarc(0, nicheSpringY - nicheBotY, nicheR, 0, Math.PI, false);
      cavityShape.closePath();
      const cavityGeo = new THREE.ExtrudeGeometry(cavityShape, { steps: 1, depth: 0.03, bevelEnabled: false, curveSegments: 12 });
      cavityGeo.translate(0, 0, -0.015);
      batcher.add('granite-curb-dark', cavityGeo, {
        color: PALETTE.darkRecess,
        matrix: makeTransform(nx, nicheBotY, faceSign * (pavHalfD + 0.022)),
      });

      // Ornate wrought-iron arched niche frame & sill
      batcher.addBox('wrought-iron', 0.05, nicheSpringY - nicheBotY, 0.075, nx - nicheR - 0.02, (nicheBotY + nicheSpringY) / 2, faceSign * (pavHalfD + 0.04));
      batcher.addBox('wrought-iron', 0.05, nicheSpringY - nicheBotY, 0.075, nx + nicheR + 0.02, (nicheBotY + nicheSpringY) / 2, faceSign * (pavHalfD + 0.04));
      batcher.addBox('architectural-stone', nicheR * 2 + 0.16, 0.07, 0.12, nx, nicheBotY - 0.02, faceSign * (pavHalfD + 0.055), {
        color: PALETTE.stoneTrim, metricUV: true,
      });
      batcher.add('wrought-iron', createArchivoltRingGeometry(nicheR, nicheR + 0.055, 0.075, false, 12), {
        matrix: makeTransform(nx, nicheSpringY, faceSign * (pavHalfD + 0.04)),
      });

      // Glowing sculpted brass wall sconce centered inside each arched niche
      addWallSconce(batcher, nx, 1.78, faceSign * (pavHalfD + 0.036), 0, faceSign, 1.05);
    }
  }

  // ==========================================================================
  // 4. ICONIC ROOFTOP OPEN STEEL LATTICE TRUSS & FREESTANDING GOLDEN KALIMA
  // Spans continuously across both tall vehicular towers (x = -7.30..+7.30),
  // y = 8.82..10.64 (maxY = 10.665 <= 10.72 GateMenuCamera safe framing!).
  // Real sky shines right through the steel grid and behind the golden letters!
  // ==========================================================================
  const trussHalfW = 7.30;
  const trussBotY = 8.84;
  const trussTopY = 10.62;
  const trussHalfD = 0.14;

  // 5 Horizontal brushed-steel chord rails on front (+Z) & rear (-Z) planes
  const railLevels = [
    { y: trussBotY, r: 0.028 },
    { y: 9.285, r: 0.018 },
    { y: 9.73, r: 0.018 },
    { y: 10.175, r: 0.018 },
    { y: trussTopY, r: 0.028 },
  ];
  for (const level of railLevels) {
    for (const tz of [-trussHalfD, trussHalfD]) {
      batcher.addTubeBetween(
        'brushed-steel',
        new THREE.Vector3(-trussHalfW, level.y, tz),
        new THREE.Vector3(trussHalfW, level.y, tz),
        level.r, level.r, 5,
        { color: PALETTE.steelTruss },
      );
    }
  }

  // 25 Rhythmic vertical steel lattice struts + bolted roof anchor flanges
  const strutCount = 24;
  for (let i = 0; i <= strutCount; i++) {
    const sx = -trussHalfW + (i / strutCount) * (trussHalfW * 2);
    const isMajor = i === 0 || i === strutCount || i === 4 || i === 8 || i === 16 || i === 20;
    const rad = isMajor ? 0.028 : 0.016;
    const onTowerRoof = Math.abs(sx) >= 2.0;
    const baseFootY = onTowerRoof ? 8.78 : trussBotY;

    for (const tz of [-trussHalfD, trussHalfD]) {
      batcher.addTubeBetween(
        'brushed-steel',
        new THREE.Vector3(sx, baseFootY, tz),
        new THREE.Vector3(sx, trussTopY, tz),
        rad, rad, 5,
        { color: PALETTE.steelTruss },
      );
    }

    // Engineered steel base mounting plate bolted to the vehicular tower roofs
    if (isMajor && onTowerRoof) {
      batcher.addBox('brushed-steel', 0.22, 0.05, 0.42, sx, 8.83, 0, {
        color: PALETTE.steelTruss,
      });
    }

    // Cross-depth structural tie bars giving authentic 3D steel space-frame thickness
    if (i % 2 === 0) {
      for (const ty of [trussBotY, trussTopY]) {
        batcher.addTubeBetween(
          'brushed-steel',
          new THREE.Vector3(sx, ty, -trussHalfD),
          new THREE.Vector3(sx, ty, trussHalfD),
          0.016, 0.016, 4,
          { color: PALETTE.steelTruss },
        );
      }
    }
  }

  // Subtle diagonal structural end braces in outer left & right truss bays
  const bayW = (trussHalfW * 2) / strutCount;
  for (const side of [-1, 1]) {
    const xOuter = side * trussHalfW;
    const xInner = side * (trussHalfW - bayW);
    for (const tz of [-trussHalfD, trussHalfD]) {
      batcher.addTubeBetween(
        'brushed-steel',
        new THREE.Vector3(xOuter, trussBotY, tz),
        new THREE.Vector3(xInner, trussTopY, tz),
        0.014, 0.014, 4,
        { color: PALETTE.steelTruss },
      );
    }
  }

  // Freestanding Gleaming Golden Arabic Kalima Calligraphy (front +Z & back -Z)
  // Separate front & rotated back faces ensure Arabic reads naturally from BOTH highway & campus!
  const kalimaWidth = 13.70;
  const kalimaHeight = 1.66;
  const kalimaY = 9.74;
  batcher.add('rooftop-kalima-calligraphy', new THREE.PlaneGeometry(kalimaWidth, kalimaHeight), {
    matrix: makeTransform(0, kalimaY, trussHalfD + 0.055, 0, 0, 0),
  });
  batcher.add('rooftop-kalima-calligraphy', new THREE.PlaneGeometry(kalimaWidth, kalimaHeight), {
    matrix: makeTransform(0, kalimaY, -(trussHalfD + 0.055), 0, Math.PI, 0),
  });

  // ==========================================================================
  // 5. CENTRAL SEMICIRCULAR/CIRCULAR BRICK PLANTER ISLAND
  // Centered at (0, 0, 1.2), outer radius <= 2.08 -> maxZ = 3.28 <= 3.30!
  // Cleanly clears BOTH vehicular driving lanes (|x| = 2.85..6.55)!
  // ==========================================================================
  const islandZ = 1.20;
  const planterR = 2.00;
  const planterH = 0.56;

  // Checkered black-and-white low outer stone toe curb hugging the brick base
  const toeSegments = 20;
  for (let i = 0; i < toeSegments; i++) {
    const a = (i / toeSegments) * Math.PI * 2;
    const midR = planterR + 0.06;
    const bx = Math.cos(a) * midR;
    const bz = islandZ + Math.sin(a) * midR;
    // Skip blocks buried inside central pavilion masonry
    if (bz < 0.45 && Math.abs(bx) < 1.95) continue;
    const segLen = (2 * Math.PI * midR) / toeSegments * 0.94;
    batcher.addBox('granite-curb-dark', segLen, 0.14, 0.12, bx, 0.07, bz, {
      ry: -a + Math.PI / 2,
      color: i % 2 === 0 ? PALETTE.curbWhite : PALETTE.curbBlack,
    });
  }

  // Terracotta red brick circular planter body (preserves cylindrical wrap UVs!)
  const brickWallGeo = new THREE.CylinderGeometry(planterR, planterR + 0.04, planterH, 32, 1, false);
  batcher.add('terracotta-brick', brickWallGeo, {
    matrix: makeTransform(0, planterH / 2, islandZ),
  });

  // White stone overhanging coping rim
  const copingRimGeo = new THREE.TorusGeometry(planterR, 0.085, 8, 32);
  batcher.add('architectural-stone', copingRimGeo, {
    color: PALETTE.stoneCoping,
    metricUV: true,
    matrix: makeTransform(0, planterH + 0.045, islandZ, Math.PI / 2, 0, 0),
  });

  // Rich soil bed inside planter
  batcher.addCylinder('foliage-canopy', planterR - 0.10, planterR - 0.10, 0.08, 24, 0, planterH - 0.01, islandZ, {
    color: PALETTE.soilBed,
  });

  // 3-Tier Brushed Stainless-Steel Tubular Perimeter Railing & Vertical Posts
  // Curves smoothly around the entire exterior arc in front of the central pavilion
  const railR = planterR - 0.08;
  const railSegs = 18;
  const arcStart = -0.22; // radians from +X, curving over +Z to +PI + 0.22
  const arcEnd = Math.PI + 0.22;
  const railHeights = [0.78, 0.96, 1.14];

  for (let i = 0; i <= railSegs; i++) {
    const a = arcStart + (i / railSegs) * (arcEnd - arcStart);
    const px = Math.cos(a) * railR;
    const pz = islandZ + Math.sin(a) * railR;

    // Vertical stainless steel posts every 2 segments
    if (i % 2 === 0) {
      batcher.addCylinder('brushed-steel', 0.022, 0.024, 0.64, 8, px, planterH + 0.34, pz, {
        color: PALETTE.steelRail,
      });
      // Brushed steel spherical post finial cap
      batcher.add('brushed-steel', new THREE.SphereGeometry(0.030, 8, 6), {
        color: PALETTE.steelRail,
        matrix: makeTransform(px, planterH + 0.67, pz),
      });
    }

    if (i < railSegs) {
      const aNext = arcStart + ((i + 1) / railSegs) * (arcEnd - arcStart);
      const nx = Math.cos(aNext) * railR;
      const nz = islandZ + Math.sin(aNext) * railR;
      for (const ry of railHeights) {
        batcher.addTubeBetween(
          'brushed-steel',
          new THREE.Vector3(px, ry, pz),
          new THREE.Vector3(nx, ry, nz),
          0.016, 0.016, 6,
          { color: PALETTE.steelRail },
        );
      }
    }
  }

  // Tight, Dense, Manicured Dark-Emerald Boxwood Hedge Ring tucked neatly inside the 3-tier steel rail
  // (~45 small overlapping organically-jittered leaf tufts + 18 vibrant red/gold flower buds)
  const hedgeRng = createRng(62481);
  const hedgeColors = [PALETTE.hedgeShadow, PALETTE.hedgeDeep, PALETTE.hedgeMid, PALETTE.hedgeTip];
  const flowerBudColors = [PALETTE.flowerRed, PALETTE.flowerRed, PALETTE.flowerGold];
  const budAnchors = [];

  const addBoxwoodTuft = (hx, hy, hz, r, sy, colorIdx) => {
    const tuftGeo = createOrganicLeafTuft(r, 1, hedgeRng, 0.14);
    const sx = 0.98 + hedgeRng() * 0.10;
    const sz = 0.98 + hedgeRng() * 0.10;
    batcher.add('foliage-canopy', tuftGeo, {
      color: hedgeColors[colorIdx % hedgeColors.length],
      matrix: makeTransform(
        hx,
        hy,
        hz,
        (hedgeRng() - 0.5) * 0.25,
        hedgeRng() * Math.PI * 2,
        (hedgeRng() - 0.5) * 0.25,
        sx,
        sy,
        sz,
      ),
    });
    if (hz >= 0.88) {
      budAnchors.push({ x: hx, y: hy + r * sy * 0.96, z: hz });
    }
  };

  // Tier 1: Outer manicured boxwood rim (22 tufts tucked strictly inside railR = 1.92)
  for (let i = 0; i < 22; i++) {
    const a = -0.14 + (i / 21) * (Math.PI + 0.28);
    const rad = 1.44 + (hedgeRng() - 0.5) * 0.10;
    const hx = Math.cos(a) * rad;
    const hz = islandZ + Math.sin(a) * rad;
    if (hz < 0.78) continue;
    const hr = 0.24 + hedgeRng() * 0.05;
    const sy = 0.82 + hedgeRng() * 0.12;
    addBoxwoodTuft(hx, planterH + 0.24 + hedgeRng() * 0.04, hz, hr, sy, i + Math.floor(hedgeRng() * 2));
  }

  // Tier 2: Middle dense fill ring (15 tufts)
  for (let i = 0; i < 15; i++) {
    const a = 0.04 + (i / 14) * (Math.PI - 0.08);
    const rad = 1.00 + (hedgeRng() - 0.5) * 0.14;
    const hx = Math.cos(a) * rad;
    const hz = islandZ + Math.sin(a) * rad;
    if (hz < 0.80) continue;
    const hr = 0.26 + hedgeRng() * 0.06;
    const sy = 0.84 + hedgeRng() * 0.10;
    addBoxwoodTuft(hx, planterH + 0.28 + hedgeRng() * 0.05, hz, hr, sy, (i + 1) + Math.floor(hedgeRng() * 2));
  }

  // Tier 3: Inner lush boxwood dome crown (9 tufts)
  for (let i = 0; i < 6; i++) {
    const a = 0.22 + (i / 5) * (Math.PI - 0.44);
    const rad = 0.54 + (hedgeRng() - 0.5) * 0.12;
    const hx = Math.cos(a) * rad;
    const hz = islandZ + Math.sin(a) * rad;
    if (hz < 0.84) continue;
    const hr = 0.27 + hedgeRng() * 0.06;
    const sy = 0.82 + hedgeRng() * 0.10;
    addBoxwoodTuft(hx, planterH + 0.31 + hedgeRng() * 0.04, hz, hr, sy, i + 2);
  }
  const crownCenters = [
    { x: -0.26, z: islandZ + 0.14 },
    { x: 0.0, z: islandZ + 0.22 },
    { x: 0.26, z: islandZ + 0.14 },
  ];
  for (let i = 0; i < crownCenters.length; i++) {
    const c = crownCenters[i];
    const hr = 0.28 + hedgeRng() * 0.06;
    addBoxwoodTuft(c.x, planterH + 0.33 + hedgeRng() * 0.03, c.z, hr, 0.84 + hedgeRng() * 0.08, i + 1);
  }

  // 18 tiny scattered vibrant red/gold flower buds perched cleanly across the boxwood canopy
  const budCount = 18;
  for (let i = 0; i < budCount && budAnchors.length > 0; i++) {
    const anchor = budAnchors[Math.floor((i * budAnchors.length) / budCount) % budAnchors.length];
    const bx = anchor.x + (hedgeRng() - 0.5) * 0.18;
    const bz = anchor.z + (hedgeRng() - 0.5) * 0.18;
    if (Math.hypot(bx, bz - islandZ) > railR - 0.18) continue;
    const budGeo = createOrganicLeafTuft(0.055 + hedgeRng() * 0.030, 0, hedgeRng, 0.16);
    batcher.add('krishnachura-blossoms', budGeo, {
      color: flowerBudColors[i % flowerBudColors.length],
      matrix: makeTransform(
        bx,
        Math.min(planterH + 0.64, anchor.y + 0.02),
        bz,
        hedgeRng() * Math.PI,
        hedgeRng() * Math.PI,
        hedgeRng() * Math.PI,
        1.1,
        0.75,
        1.1,
      ),
    });
  }

  // ==========================================================================
  // 6. ORNATE OPEN WROUGHT-IRON GATE LEAVES (Swung cleanly open inside campus)
  // Driving lanes (|x| = 2.85..6.55) & walking lanes (|x| = 7.40..9.20) remain
  // 100% UNOBSTRUCTED for players, buses, and raycasts!
  // ==========================================================================
  for (const side of [-1, 1]) {
    // Vehicular outer open gate leaf (hinged at |x| = 6.50, z = -0.68, folded into -Z)
    addOrnateGateLeaf(batcher, {
      hingeX: side * 6.50,
      hingeZ: -0.68,
      width: 1.76,
      baseHeight: 3.35,
      archRise: 0.48,
      rotY: Math.PI / 2 - side * 0.06,
      hasMedallion: true,
    });
    // Vehicular inner open gate leaf (hinged at |x| = 2.90, z = -0.68, folded into -Z)
    addOrnateGateLeaf(batcher, {
      hingeX: side * 2.90,
      hingeZ: -0.68,
      width: 1.76,
      baseHeight: 3.35,
      archRise: 0.48,
      rotY: Math.PI / 2 + side * 0.06,
      hasMedallion: true,
    });
    // Pedestrian open gate leaf (hinged at far outer pier |x| = 9.16, z = -0.56, folded into -Z)
    addOrnateGateLeaf(batcher, {
      hingeX: side * 9.16,
      hingeZ: -0.56,
      width: 1.42,
      baseHeight: 2.55,
      archRise: 0.28,
      rotY: Math.PI / 2 - side * 0.05,
      hasMedallion: false,
    });
  }

  // ==========================================================================
  // 7. PANELED PERIMETER BOUNDARY WALLS WITH RHYTHMIC PIERS & WROUGHT-IRON FENCE
  // Extending Left (x = -9.92..-35.0) & Right (x = +9.92..+35.0)
  // ==========================================================================
  const wallStart = 9.92;
  const wallEnd = 35.0;
  const bayCount = 7;
  const baySpan = (wallEnd - wallStart) / bayCount;

  for (const side of [-1, 1]) {
    for (let b = 0; b < bayCount; b++) {
      const x0 = side * (wallStart + b * baySpan);
      const x1 = side * (wallStart + (b + 1) * baySpan);
      const bayMidX = (x0 + x1) / 2;
      const clearW = baySpan - 0.50;

      // Dark granite wall plinth base
      batcher.addBox('granite-curb-dark', baySpan, 0.36, 0.48, bayMidX, 0.18, 0, {
        color: PALETTE.graniteBase, metricUV: true,
      });

      // Lower stone wall bay with recessed architectural panels on front & back
      batcher.addBox('architectural-stone', baySpan, 1.32, 0.36, bayMidX, 0.36 + 0.66, 0, {
        color: PALETTE.stoneWall, metricUV: true,
      });
      for (const fSign of [-1, 1]) {
        batcher.addBox('architectural-stone', clearW - 0.32, 0.86, 0.025, bayMidX, 1.02, fSign * 0.19, {
          color: PALETTE.stonePanel, metricUV: true,
        });
      }

      // Clean white stone coping ledge along wall bay
      batcher.addBox('architectural-stone', baySpan + 0.04, 0.14, 0.50, bayMidX, 1.75, 0, {
        color: PALETTE.stoneCoping, metricUV: true,
      });

      // Decorative black wrought-iron spear fence along upper wall bay (y = 1.82..2.58)
      batcher.addBox('wrought-iron', clearW, 0.04, 0.04, bayMidX, 1.94, 0);
      batcher.addBox('wrought-iron', clearW, 0.04, 0.04, bayMidX, 2.44, 0);

      const fencePickets = 11;
      for (let p = 1; p < fencePickets; p++) {
        const px = bayMidX - clearW / 2 + (p / fencePickets) * clearW;
        batcher.addCylinder('wrought-iron', 0.012, 0.012, 0.68, 4, px, 2.16, 0);
        batcher.add(p % 3 === 0 ? 'burnished-gold' : 'wrought-iron', new THREE.ConeGeometry(0.028, 0.13, 4), {
          matrix: makeTransform(px, 2.55, 0),
        });
      }

      // Rhythmic square boundary pier at outer end of every bay
      const pierX = x1;
      batcher.addBox('granite-curb-dark', 0.64, 0.42, 0.64, pierX, 0.21, 0, {
        color: PALETTE.graniteBase, metricUV: true,
      });
      batcher.addBox('architectural-stone', 0.54, 1.98, 0.54, pierX, 0.42 + 0.99, 0, {
        color: PALETTE.stoneMain, metricUV: true,
      });
      batcher.addBox('architectural-stone', 0.66, 0.12, 0.66, pierX, 2.46, 0, {
        color: PALETTE.stoneCoping, metricUV: true,
      });
      batcher.add('architectural-stone', new THREE.ConeGeometry(0.42, 0.22, 4), {
        color: PALETTE.stoneTrim,
        metricUV: true,
        matrix: makeTransform(pierX, 2.63, 0, 0, Math.PI / 4, 0),
      });
    }
  }

  // ==========================================================================
  // 8. APPROACH ASPHALT ROAD, CHAMFERED STRIPED CURBS, LANE DASHES & PETALS
  // ==========================================================================
  const approachWidth = 14.0;
  const approachStartZ = -2.0;
  const approachEndZ = 20.0;
  const approachLength = approachEndZ - approachStartZ;
  const approachMidZ = (approachStartZ + approachEndZ) / 2;

  // Raised cleanly above OSM ROAD_LEVELS.asphalt (0.04) with polygonOffset to eliminate diagonal road slicing
  const roadGeo = new THREE.PlaneGeometry(approachWidth, approachLength);
  roadGeo.rotateX(-Math.PI / 2);
  batcher.add('asphalt-road', roadGeo, {
    matrix: makeTransform(0, 0.049, approachMidZ),
  });

  // Crisp painted white center dashed lane markings (starting cleanly past the planter island)
  for (let mz = 4.8; mz <= 17.6; mz += 4.2) {
    const dashGeo = new THREE.PlaneGeometry(0.20, 2.25);
    dashGeo.rotateX(-Math.PI / 2);
    batcher.add('granite-curb-dark', dashGeo, {
      color: PALETTE.curbWhite,
      matrix: makeTransform(0, 0.055, mz),
    });
  }

  // Chamfered Black-and-White Curbs lining approach road edges & pedestrian flare beds
  const curbStep = 1.05;
  let curbIndex = 0;
  for (let cz = 2.4; cz < 19.2; cz += curbStep) {
    const color = curbIndex % 2 === 0 ? PALETTE.curbWhite : PALETTE.curbBlack;
    for (const side of [-1, 1]) {
      batcher.add('granite-curb-dark', createChamferedPrism(0.36, 0.26, 0.20, curbStep - 0.02), {
        color,
        matrix: makeTransform(side * (approachWidth / 2 + 0.18), 0.0, cz + curbStep / 2),
      });
    }
    curbIndex++;
  }

  // Flanking Lush Layered Organic Multi-Tuft Dark-Emerald Garden Beds with Red Hibiscus/Ixora Blooms
  const cornerRng = createRng(88412);
  const cornerGreens = [PALETTE.hedgeShadow, PALETTE.hedgeDeep, PALETTE.hedgeMid, PALETTE.hedgeTip];
  const cornerBlooms = [PALETTE.flowerRed, PALETTE.petalScarlet, PALETTE.flowerRed, PALETTE.flowerGold];
  for (const side of [-1, 1]) {
    // Low striped curb border framing the corner garden bed
    for (let k = 0; k < 5; k++) {
      const bx = side * (9.2 + k * 0.95);
      batcher.add('granite-curb-dark', createChamferedPrism(0.30, 0.22, 0.18, 0.92), {
        color: k % 2 === 0 ? PALETTE.curbWhite : PALETTE.curbBlack,
        matrix: makeTransform(bx, 0.0, 2.55, 0, Math.PI / 2, 0),
      });
    }

    // Rich dark garden soil bed tucked behind the striped curb & outside the pedestrian wing
    batcher.addBox('foliage-canopy', 4.5, 0.12, 1.80, side * 11.85, 0.06, 1.48, {
      color: PALETTE.soilBed,
    });

    const bloomAnchors = [];
    // Back taller dark-emerald hedge row hugging the perimeter boundary wall
    for (let s = 0; s < 11; s++) {
      const sx = side * (9.80 + s * 0.42 + (cornerRng() - 0.5) * 0.14);
      const sz = 0.95 + (cornerRng() - 0.5) * 0.34;
      const sr = 0.28 + cornerRng() * 0.10;
      const sy = 0.92 + cornerRng() * 0.24;
      const hy = 0.36 + cornerRng() * 0.16;
      batcher.add('foliage-canopy', createOrganicLeafTuft(sr, 1, cornerRng, 0.15), {
        color: cornerGreens[s % 3],
        matrix: makeTransform(
          sx, hy, sz,
          (cornerRng() - 0.5) * 0.22, cornerRng() * Math.PI * 2, (cornerRng() - 0.5) * 0.22,
          1.05 + cornerRng() * 0.14, sy, 1.0 + cornerRng() * 0.14,
        ),
      });
      if (s % 2 === 0) {
        bloomAnchors.push({ x: sx, y: hy + sr * sy * 0.85, z: sz + 0.14 });
      }
    }

    // Front cascading dark-emerald shrub tier tucked cleanly behind the curb (z = 1.48..2.14)
    for (let s = 0; s < 13; s++) {
      const sx = side * (9.72 + s * 0.36 + (cornerRng() - 0.5) * 0.14);
      const sz = 1.72 + (cornerRng() - 0.5) * 0.44;
      const sr = 0.24 + cornerRng() * 0.09;
      const sy = 0.80 + cornerRng() * 0.18;
      const hy = 0.24 + cornerRng() * 0.12;
      batcher.add('foliage-canopy', createOrganicLeafTuft(sr, 1, cornerRng, 0.15), {
        color: cornerGreens[1 + (s % 3)],
        matrix: makeTransform(
          sx, hy, sz,
          (cornerRng() - 0.5) * 0.26, cornerRng() * Math.PI * 2, (cornerRng() - 0.5) * 0.26,
          1.04 + cornerRng() * 0.12, sy, 1.02 + cornerRng() * 0.12,
        ),
      });
      bloomAnchors.push({ x: sx, y: hy + sr * sy * 0.88, z: sz + 0.10 });
    }

    // Scattered vibrant red hibiscus & ixora flower blooms nestled across both shrub tiers
    for (let f = 0; f < 14 && bloomAnchors.length > 0; f++) {
      const anchor = bloomAnchors[Math.floor((f * bloomAnchors.length) / 14) % bloomAnchors.length];
      const br = 0.062 + cornerRng() * 0.036;
      batcher.add('krishnachura-blossoms', createOrganicLeafTuft(br, 0, cornerRng, 0.16), {
        color: cornerBlooms[f % cornerBlooms.length],
        matrix: makeTransform(
          anchor.x + (cornerRng() - 0.5) * 0.20,
          anchor.y + 0.03,
          anchor.z + (cornerRng() - 0.5) * 0.16,
          cornerRng() * Math.PI, cornerRng() * Math.PI, cornerRng() * Math.PI,
          1.12, 0.76, 1.12,
        ),
      });
    }
  }

  // 210 Scattered Fallen Scarlet Krishnachura Flower Petals across Dark Approach Asphalt (1 merged batch!)
  const petalRng = createRng(314159);
  const petalPalette = [PALETTE.petalCrimson, PALETTE.petalScarlet, PALETTE.petalDeep];
  const targetPetals = 210;
  let placedPetals = 0;
  let petalAttempts = 0;
  while (placedPetals < targetPetals && petalAttempts < 400) {
    petalAttempts++;
    // Organic bias: denser beneath overhanging right/left Krishnachura trees & drifting across approach
    const band = petalRng();
    let px;
    if (band < 0.45) {
      px = 1.5 + petalRng() * 5.3; // denser right side under Hero Krishnachura
    } else if (band < 0.74) {
      px = -6.7 + petalRng() * 5.2;
    } else {
      px = (petalRng() - 0.5) * 12.6;
    }
    const pz = 2.6 + petalRng() * 14.8;
    // Avoid overlapping the central planter footprint
    if (Math.hypot(px, pz - islandZ) < planterR + 0.22) continue;

    const size = 0.075 + petalRng() * 0.095;
    const petalGeo = new THREE.CircleGeometry(size, 5);
    petalGeo.rotateX(-Math.PI / 2);
    batcher.add('fallen-petals', petalGeo, {
      color: petalPalette[Math.floor(petalRng() * petalPalette.length)],
      matrix: makeTransform(
        px,
        0.057 + (placedPetals % 5) * 0.0007,
        pz,
        0,
        petalRng() * Math.PI * 2,
        0,
        1.05 + petalRng() * 0.65,
        1.0,
        0.60 + petalRng() * 0.45,
      ),
    });
    placedPetals++;
  }

  // ==========================================================================
  // 9. SIGNATURE LANDSCAPING: HERO KRISHNACHURA TREES & HERO ROYAL PALMS
  // Carefully framed so canopies silhouette the gate shoulders without
  // obstructing any archway or the rooftop golden Kalima (maxY <= 10.68)!
  // ==========================================================================
  addHeroKrishnachura(batcher, {
    x: -13.6, z: -2.0, scale: 1.06, leanX: 0.45, leanZ: 0.30, seed: 1101,
  });
  addHeroKrishnachura(batcher, {
    x: 13.4, z: 1.5, scale: 1.12, leanX: -0.60, leanZ: 0.20, seed: 2202,
  });

  const palmSpecs = [
    { x: -10.8, z: -2.6, trunkHeight: 7.9, leanX: -0.28, leanZ: 0.14, seed: 301 },
    { x: 10.8,  z: -2.6, trunkHeight: 8.1, leanX: 0.26,  leanZ: 0.12, seed: 302 },
    { x: -11.4, z: 8.4,  trunkHeight: 8.0, leanX: -0.32, leanZ: -0.18, seed: 303 },
    { x: -13.8, z: 16.8, trunkHeight: 7.8, leanX: 0.22,  leanZ: -0.20, seed: 304 },
    { x: 11.4,  z: 8.4,  trunkHeight: 8.2, leanX: 0.30,  leanZ: -0.16, seed: 305 },
    { x: 13.8,  z: 16.8, trunkHeight: 7.9, leanX: -0.24, leanZ: -0.18, seed: 306 },
  ];
  for (const spec of palmSpecs) {
    addHeroRoyalPalm(batcher, spec);
  }

  // ==========================================================================
  // 10. REALISTIC HIGHWAY BOUNDARY BARRIER & BOLLARD ASSEMBLY (z = 19.5)
  // ==========================================================================
  const barrierWidth = 24.0;
  const barrierZ = 19.5;

  // Tapered concrete New-Jersey traffic barrier base
  const jerseyGeo = createChamferedPrism(0.68, 0.26, 0.78, barrierWidth);
  jerseyGeo.rotateY(Math.PI / 2);
  batcher.add('granite-curb-dark', jerseyGeo, {
    color: PALETTE.concreteBarrier,
    matrix: makeTransform(0, 0.0, barrierZ),
  });

  // Alternating black-and-yellow reflective hazard steel guardrail sections
  const railSpan = 2.0;
  for (let rx = -barrierWidth / 2 + railSpan / 2; rx < barrierWidth / 2; rx += railSpan) {
    const isYellow = Math.round((rx + barrierWidth / 2) / railSpan) % 2 === 0;
    batcher.addBox('granite-curb-dark', railSpan - 0.04, 0.24, 0.12, rx, 1.12, barrierZ, {
      color: isYellow ? PALETTE.hazardYellow : PALETTE.curbBlack,
    });
  }

  // Symmetric brushed steel guardrail stanchions & safety bollards with reflective collar bands
  const bollardCount = 11;
  for (let bi = 0; bi < bollardCount; bi++) {
    const px = -11.0 + bi * 2.2;
    batcher.addCylinder('brushed-steel', 0.068, 0.075, 1.36, 8, px, 0.68, barrierZ, {
      color: PALETTE.steelRail,
    });
    batcher.add('brushed-steel', new THREE.SphereGeometry(0.072, 8, 6), {
      color: PALETTE.steelRail,
      matrix: makeTransform(px, 1.38, barrierZ),
    });
    batcher.addCylinder('granite-curb-dark', 0.074, 0.074, 0.10, 8, px, 1.24, barrierZ, {
      color: PALETTE.hazardYellow,
    });
  }

  // Flush all batched geometries into <= 16 draw-call meshes under gateRig
  const drawCallCount = batcher.flush(gateRig);
  group.userData.drawCallCount = drawCallCount;

  // Warm Architectural PointLights illuminating archways & central signboard wash (0 extra draw calls)
  const trackedLights = [];
  const addGatePointLight = (name, color, intensity, distance, decay, x, y, z) => {
    const light = new THREE.PointLight(color, intensity, distance, decay);
    light.name = name;
    light.position.set(x, y, z);
    gateRig.add(light);
    trackedLights.push(light);
    return light;
  };
  addGatePointLight('gate-arch-light-left', 0xffb454, 1.4, 24, 1.8, -3.2, 4.8, 2.2);
  addGatePointLight('gate-arch-light-right', 0xffb454, 1.4, 24, 1.8, 3.2, 4.8, 2.2);
  addGatePointLight('gate-pavilion-light', 0xffc36b, 1.2, 14, 1.8, 0, 4.3, 2.6);

  // ==========================================================================
  // 11. SOLID WORLD-SPACE COLLIDERS & OBSTACLES
  // 7 Gate Pier/Pavilion Colliders + 1 Central Island + 2 Boundary Walls +
  // 1 Highway Barrier = 11 Colliders (>= 8) and 9 Obstacles (>= 7).
  // All 4 arch portals remain 100% open & unobstructed!
  // ==========================================================================
  const pierColliders = [
    { x: -9.56,  w: 0.74, h: 5.60, d: 1.16 }, // 0: Far-left pedestrian pier
    { x: -6.975, w: 0.85, h: 8.60, d: 1.48 }, // 1: Left vehicular outer pier
    { x: -2.425, w: 0.85, h: 8.60, d: 1.48 }, // 2: Left vehicular inner pier
    { x:  0.00,  w: 4.00, h: 5.60, d: 1.20 }, // 3: Central entrance pavilion
    { x:  2.425, w: 0.85, h: 8.60, d: 1.48 }, // 4: Right vehicular inner pier
    { x:  6.975, w: 0.85, h: 8.60, d: 1.48 }, // 5: Right vehicular outer pier
    { x:  9.56,  w: 0.74, h: 5.60, d: 1.16 }, // 6: Far-right pedestrian pier
  ];
  for (let i = 0; i < pierColliders.length; i++) {
    const p = pierColliders[i];
    addBoxCollider(`gate-pillar-${i}`, 'gate-pillar', p.x, p.h / 2, 0, p.w, p.h, p.d, true);
  }

  // Central planter island collider & circular obstacle
  const islandWorldP = new THREE.Vector3(0, 0.72, islandZ).applyAxisAngle(upAxis, gateYaw).add(gateCenter);
  const islandColliderGeo = new THREE.CylinderGeometry(planterR + 0.08, planterR + 0.08, 1.44, 14);
  trackedGeometries.add(islandColliderGeo);
  const islandCollider = new THREE.Mesh(islandColliderGeo, colliderMat);
  islandCollider.position.copy(islandWorldP);
  islandCollider.name = 'main-gate-central-island';
  collisionGroup.add(islandCollider);

  obstacles.push({
    id: 'main-gate-central-island',
    kind: 'gate-island',
    x: islandWorldP.x,
    z: islandWorldP.z,
    radius: planterR + 0.08,
    height: 1.44,
  });

  // Left & Right perimeter boundary wall colliders
  const wallLen = wallEnd - wallStart;
  const wallMidAbsX = (wallStart + wallEnd) / 2;
  addBoxCollider('boundary-wall-left', 'boundary-wall', -wallMidAbsX, 1.3, 0, wallLen, 2.6, 0.65, false);
  addBoxCollider('boundary-wall-right', 'boundary-wall', wallMidAbsX, 1.3, 0, wallLen, 2.6, 0.65, false);

  // Highway boundary limit barrier collider & obstacle
  addBoxCollider('highway-boundary-barrier', 'highway-barrier', 0, 1.75, barrierZ, barrierWidth, 3.5, 1.2, true);

  group.updateMatrixWorld(true);
  collisionGroup.updateMatrixWorld(true);

  let disposed = false;

  return {
    group,
    collisionGroup,
    obstacles,
    config: MAIN_GATE_CONFIG,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const light of trackedLights) {
        light.removeFromParent();
        light.dispose?.();
      }
      trackedLights.length = 0;
      for (const geo of trackedGeometries) geo.dispose();
      for (const mat of trackedMaterials) mat.dispose();
      for (const tex of trackedTextures) tex.dispose();
      trackedGeometries.clear();
      trackedMaterials.clear();
      trackedTextures.clear();
      gateRig.clear();
      group.clear();
      collisionGroup.clear();
    },
  };
}
