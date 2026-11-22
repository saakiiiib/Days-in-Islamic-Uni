import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tintGeometry } from '../facades.js';

const SOURCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Shahid_Minar_IU.jpg',
  'https://commons.wikimedia.org/wiki/File:Shahid_minar_and_Monument.jpg',
]);

const PALETTE = Object.freeze({
  brickLow: 0x764234,
  brickMid: 0x894e3e,
  brickTop: 0xa35f4a,
  shadowGroove: 0x4c2a21,
  stoneRim: 0xd5cfc2,
  stoneRimTop: 0xe3ddd1,
  alponaWhite: 0xede7da,
  alponaOchre: 0xc98f69,
  plinthShadow: 0x6c7068,
  plinthMid: 0xe2dfd6,
  plinthTop: 0xefece4,
  marbleMain: 0xeeebe2,
  marbleBright: 0xf7f5ef,
  marbleReveal: 0xd3cfc4,
  marbleSoffit: 0xc7c3b7,
  steelRod: 0x383c38,
  steelBar: 0x464b46,
  sunCrimson: 0xc9221d,
  sunCore: 0xd82a23,
  sunBevel: 0x9f1b17,
  stanchionSteel: 0x3b403c,
});

function ellipseRing(rxOuter, rzOuter, rxInner, rzInner, y0, y1, zCenter, segments = 48) {
  const positions = [];
  const pushQuad = (a, b, c, d) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const ox0 = c0 * rxOuter, oz0 = zCenter + s0 * rzOuter;
    const ox1 = c1 * rxOuter, oz1 = zCenter + s1 * rzOuter;
    const ix0 = c0 * rxInner, iz0 = zCenter + s0 * rzInner;
    const ix1 = c1 * rxInner, iz1 = zCenter + s1 * rzInner;
    // Top face (+Y)
    pushQuad([ox0, y1, oz0], [ix0, y1, iz0], [ix1, y1, iz1], [ox1, y1, oz1]);
    // Outer wall
    pushQuad([ox0, y0, oz0], [ox0, y1, oz0], [ox1, y1, oz1], [ox1, y0, oz1]);
    // Inner wall
    pushQuad([ix0, y0, iz0], [ix1, y0, iz1], [ix1, y1, iz1], [ix0, y1, iz0]);
    // Bottom face (-Y)
    pushQuad([ox0, y0, oz0], [ox1, y0, oz1], [ix1, y0, iz1], [ix0, y0, iz0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Sheared prism with horizontal bottom at (y0, z0) and horizontal top at (y1, z1). */
function slantedPrism(x, y0, z0, y1, z1, width, depth) {
  const hw = width / 2, hd = depth / 2;
  const b0 = [x - hw, y0, z0 - hd], b1 = [x + hw, y0, z0 - hd];
  const b2 = [x + hw, y0, z0 + hd], b3 = [x - hw, y0, z0 + hd];
  const t0 = [x - hw, y1, z1 - hd], t1 = [x + hw, y1, z1 - hd];
  const t2 = [x + hw, y1, z1 + hd], t3 = [x - hw, y1, z1 + hd];
  const positions = [];
  const quad = (a, b, c, d) => { positions.push(...a, ...b, ...c, ...a, ...c, ...d); };
  quad(b0, t0, t1, b1); // front (-Z)
  quad(b2, t2, t3, b3); // back (+Z)
  quad(b3, t3, t0, b0); // left (-X)
  quad(b1, t1, t2, b2); // right (+X)
  quad(t0, t3, t2, t1); // top (+Y)
  quad(b0, b1, b2, b3); // bottom (-Y)
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Historical-photo-inspired local asset. No surveyed scale, anchor or orientation is implied. */
export function buildShaheedMinar(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Minar options must be an object');
  const { heightMeters } = options;
  if (!Number.isFinite(heightMeters) || heightMeters <= 0 || heightMeters > 1000) {
    throw new RangeError('Minar heightMeters must be caller-supplied, positive and at most 1000 metres');
  }
  const h = heightMeters, parts = [], base = .075 * h;
  const ratios = { plazaWidth: 2.1, plazaDepth: 1.28, plinthHeight: .075, frameDepth: .032, redDiscDiameter: .43 };
  const add = (geometry, color) => {
    geometry.deleteAttribute('uv');
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    tintGeometry(geometry, color); parts.push(geometry);
  };
  const box = (x, y, z, w, rise, depth, color) =>
    add(new THREE.BoxGeometry(w, rise, depth).translate(x, y + rise / 2, z), color);
  const cylinder = (rTop, rBottom, rise, segs, x, y, z, color) =>
    add(new THREE.CylinderGeometry(rTop, rBottom, rise, segs).translate(x, y + rise / 2, z), color);

  // 1. Refined 3-tier terracotta-brick oval ceremonial plaza with pale stone edging rims & shadow grooves.
  const plazaZ = .18 * h, stepH = base / 3, lipH = .0055 * h;
  const brickTones = [PALETTE.brickLow, PALETTE.brickMid, PALETTE.brickTop];
  for (let step = 0; step < 3; step++) {
    const rx = (ratios.plazaWidth / 2 - step * .075) * h;
    const rz = (ratios.plazaDepth / 2 - step * .065) * h;
    const y0 = step * stepH, y1 = (step + 1) * stepH;
    const riserH = stepH - lipH;
    // Recessed terracotta brick riser drum
    const riser = new THREE.CylinderGeometry(1, 1, riserH, 48);
    riser.scale(rx - .008 * h, 1, rz - .008 * h);
    riser.translate(0, y0 + riserH / 2, plazaZ);
    add(riser, brickTones[step]);
    // Recessed shadow-under-step groove band directly beneath stone nosing
    add(ellipseRing(rx - .005 * h, rz - .005 * h, rx - .011 * h, rz - .011 * h,
      y1 - lipH - .003 * h, y1 - lipH, plazaZ, 48), PALETTE.shadowGroove);
    // Warm terracotta tread deck inside the stone rim
    const deck = new THREE.CylinderGeometry(1, 1, lipH, 48);
    deck.scale(rx - .022 * h, 1, rz - .022 * h);
    deck.translate(0, y1 - lipH / 2, plazaZ);
    add(deck, step === 2 ? PALETTE.brickTop : PALETTE.brickMid);
    // Crisp overhanging pale stone edging rim
    add(ellipseRing(rx, rz, rx - .022 * h, rz - .022 * h, y1 - lipH, y1, plazaZ, 48),
      step === 2 ? PALETTE.stoneRimTop : PALETTE.stoneRim);
  }

  // Subtle radial geometric alpona inlay accent rings on the top ceremonial platform.
  const inlayY0 = base, inlayY1 = base + .0016 * h;
  const topRx = (ratios.plazaWidth / 2 - 2 * .075) * h;
  const topRz = (ratios.plazaDepth / 2 - 2 * .065) * h;
  add(ellipseRing(topRx - .042 * h, topRz - .042 * h, topRx - .054 * h, topRz - .054 * h,
    inlayY0, inlayY1, plazaZ, 48), PALETTE.alponaWhite);
  add(ellipseRing(topRx - .064 * h, topRz - .064 * h, topRx - .072 * h, topRz - .072 * h,
    inlayY0, inlayY1, plazaZ, 48), PALETTE.alponaOchre);
  const alponaZ = -.16 * h;
  add(ellipseRing(.136 * h, .118 * h, .124 * h, .106 * h, inlayY0, inlayY1, alponaZ, 36), PALETTE.alponaWhite);
  add(ellipseRing(.096 * h, .084 * h, .087 * h, .075 * h, inlayY0, inlayY1, alponaZ, 32), PALETTE.alponaOchre);
  add(ellipseRing(.052 * h, .045 * h, .042 * h, .036 * h, inlayY0, inlayY1, alponaZ, 24), PALETTE.alponaWhite);
  for (let spoke = 0; spoke < 12; spoke++) {
    const angle = (spoke / 12) * Math.PI * 2;
    const midR = .109 * h;
    const petal = new THREE.BoxGeometry(.032 * h, .0014 * h, .009 * h);
    petal.rotateY(-angle);
    petal.translate(Math.cos(angle) * midR, base + .0009 * h, alponaZ + Math.sin(angle) * midR * .87);
    add(petal, spoke % 2 === 0 ? PALETTE.alponaWhite : PALETTE.alponaOchre);
  }

  // Continuous low unifying white-marble plinth runner beneath all five frame pedestals.
  box(0, base, 0, 1.66 * h, .003 * h, .092 * h, PALETTE.plinthShadow);
  box(0, base + .003 * h, 0, 1.68 * h, .007 * h, .098 * h, PALETTE.plinthMid);

  // 2. Five sculpted white concrete/marble open frames with stepped marble pedestals & steel lattice.
  const frames = [
    { x: -.72, width: .14, height: .44 }, { x: -.45, width: .14, height: .59 },
    { x: 0, width: .46, height: .925 },
    { x: .45, width: .14, height: .59 }, { x: .72, width: .14, height: .44 },
  ].map((frame, index) => {
    const x = frame.x * h, width = frame.width * h, rise = frame.height * h;
    const isCenter = index === 2;
    const thickness = (isCenter ? .03 : .023) * h, depth = ratios.frameDepth * h;
    const topY = base + rise;

    // Stepped marble/stone pedestal plinths with chamfered trim & shadow-under-step grooves.
    box(x, base + .010 * h, 0, width * 1.11, .0045 * h, .084 * h, PALETTE.plinthShadow);
    box(x, base + .0145 * h, 0, width * 1.15, .011 * h, .092 * h, PALETTE.plinthMid);
    box(x, base + .0255 * h, 0, width * 1.06, .010 * h, .068 * h, PALETTE.plinthTop);

    const uprightXs = isCenter
      ? [x - width / 2 + thickness / 2, x, x + width / 2 - thickness / 2]
      : [x - width / 2 + thickness / 2, x + width / 2 - thickness / 2];

    // Base collar shoes around each marble upright foot.
    for (const ux of uprightXs) {
      box(ux, base + .0355 * h, 0, thickness + .011 * h, .010 * h, depth + .012 * h, PALETTE.marbleBright);
    }

    const bars = isCenter ? 12 : 3, rod = .0022 * h;
    if (isCenter) {
      // Iconic subtle forward cant on upper central frame crown, strictly bounded to y <= heightMeters.
      const bendFraction = .77;
      const bendY = base + rise * bendFraction;
      const leanZ = -.072 * h;
      const straightH = bendY - base;
      const upperRise = topY - thickness - bendY;
      const crownLeanZ = leanZ * (upperRise / (topY - bendY));
      for (const ux of uprightXs) {
        // Lower straight marble upright with chamfered front/back flute trim
        box(ux, base, 0, thickness, straightH, depth, PALETTE.marbleMain);
        box(ux, base + .045 * h, 0, thickness * .54, straightH - .05 * h, depth + .004 * h, PALETTE.marbleBright);
        box(ux, bendY - .005 * h, 0, thickness + .005 * h, .010 * h, depth + .005 * h, PALETTE.marbleReveal);
        // Upper gently angled marble pillar segment reaching horizontal crown base
        add(slantedPrism(ux, bendY, 0, topY - thickness, crownLeanZ, thickness, depth), PALETTE.marbleMain);
        add(slantedPrism(ux, bendY, 0, topY - thickness, crownLeanZ, thickness * .54, depth + .0035 * h), PALETTE.marbleBright);
      }
      // Angled central top crown header flush at exact y = heightMeters (topY)
      add(slantedPrism(x, topY - thickness, crownLeanZ, topY, leanZ, width, depth), PALETTE.marbleMain);
      add(slantedPrism(x, topY - .006 * h, leanZ + .0015 * h, topY, leanZ, width + .009 * h, depth + .007 * h), PALETTE.marbleBright);
      box(x, topY - thickness - .004 * h, crownLeanZ, width - 2 * thickness, .004 * h, depth * .88, PALETTE.marbleSoffit);

      // Matte dark-steel vertical lattice rods following the gentle upper bend
      for (let bar = 1; bar <= bars; bar++) {
        const at = x - width / 2 + thickness + (width - 2 * thickness) * bar / (bars + 1);
        box(at, base + .025 * h, .003 * h, rod, straightH - .025 * h, rod, PALETTE.steelRod);
        add(slantedPrism(at, bendY, .003 * h, topY - thickness, crownLeanZ + .003 * h, rod, rod), PALETTE.steelRod);
      }
      // Horizontal dark-steel tie-bars (strictly below openingSample at 0.82 * rise)
      for (const fraction of [.24, .49, .73]) {
        box(x, base + rise * fraction, .003 * h, width - 2 * thickness, rod * 1.15, rod * 1.35, PALETTE.steelBar);
      }
    } else {
      for (const ux of uprightXs) {
        box(ux, base, 0, thickness, rise - thickness, depth, PALETTE.marbleMain);
        box(ux, base + .045 * h, 0, thickness * .56, rise - thickness - .05 * h, depth + .0035 * h, PALETTE.marbleBright);
      }
      // Inner reveal accents on flanking jambs
      box(x - width / 2 + thickness + .0015 * h, base + .035 * h, 0, .003 * h, rise - thickness - .035 * h, depth * .82, PALETTE.marbleReveal);
      box(x + width / 2 - thickness - .0015 * h, base + .035 * h, 0, .003 * h, rise - thickness - .035 * h, depth * .82, PALETTE.marbleReveal);
      // Molded top lintel & crisp cornice cap strictly flush at y = topY
      box(x, topY - thickness, 0, width, thickness - .005 * h, depth, PALETTE.marbleMain);
      box(x, topY - .005 * h, 0, width + .007 * h, .005 * h, depth + .006 * h, PALETTE.marbleBright);
      box(x, topY - thickness - .0035 * h, 0, width - 2 * thickness, .0035 * h, depth * .86, PALETTE.marbleSoffit);

      // Fine matte dark-steel lattice bars
      for (let bar = 1; bar <= bars; bar++) {
        const at = x - width / 2 + thickness + (width - 2 * thickness) * bar / (bars + 1);
        box(at, base + .025 * h, .003 * h, rod, rise - thickness - .025 * h, rod, PALETTE.steelRod);
      }
      for (const fraction of [.25, .5, .74]) {
        box(x, base + rise * fraction, .003 * h, width - 2 * thickness, rod * 1.15, rod * 1.35, PALETTE.steelBar);
      }
    }

    const interval = (width - 2 * thickness) / (bars + 1);
    return { index, centerX: x, width, height: rise, bottom: base, top: topY,
      openingSample: [x - width / 2 + thickness + interval * .5, base + rise * .82, 0] };
  });

  // 3. Luminous rich crimson rising sun disc with warm bevel ring & rear steel support stanchions.
  const discY = base + .235 * h, discZ = .065 * h, discR = .215 * h;
  add(new THREE.CylinderGeometry(discR, discR, .009 * h, 48)
    .rotateX(Math.PI / 2).translate(0, discY, discZ), PALETTE.sunBevel);
  add(new THREE.CylinderGeometry(discR * .955, discR * .955, .0115 * h, 48)
    .rotateX(Math.PI / 2).translate(0, discY, discZ), PALETTE.sunCrimson);
  add(new THREE.CylinderGeometry(discR * .86, discR * .86, .013 * h, 40)
    .rotateX(Math.PI / 2).translate(0, discY, discZ), PALETTE.sunCore);

  // Dark-steel rear support stanchions & diagonal A-frame braces behind the crimson disc.
  const stanchionZ = discZ + .022 * h, braceFootZ = discZ + .105 * h;
  for (const sign of [-1, 1]) {
    const sx = sign * .102 * h;
    // Stone anchor pads on upper terracotta terrace
    box(sx, base, stanchionZ, .026 * h, .018 * h, .026 * h, PALETTE.plinthMid);
    box(sx, base, braceFootZ, .024 * h, .016 * h, .024 * h, PALETTE.plinthMid);
    // Vertical steel stanchion post
    cylinder(.006 * h, .0065 * h, .295 * h, 8, sx, base + .016 * h, stanchionZ, PALETTE.stanchionSteel);
    // Diagonal rear A-frame steel strut
    add(slantedPrism(sx, base + .014 * h, braceFootZ, base + .235 * h, stanchionZ, .009 * h, .009 * h), PALETTE.stanchionSteel);
    // Short stand-off mounting brackets clamping the rear of the disc
    box(sx, base + .16 * h, (discZ + stanchionZ) / 2, .010 * h, .010 * h, .022 * h, PALETTE.stanchionSteel);
    box(sx, base + .28 * h, (discZ + stanchionZ) / 2, .010 * h, .010 * h, .022 * h, PALETTE.stanchionSteel);
  }
  // Horizontal rear steel mounting bar bracing the two stanchions behind the disc
  box(0, base + .22 * h, stanchionZ, .22 * h, .010 * h, .010 * h, PALETTE.stanchionSteel);

  const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .78, envMapIntensity: .4, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'shaheed-minar-frames-disc-and-plaza';
  mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'unplaced-shaheed-minar'; group.add(mesh);
  const diagnostics = { placementStatus: 'unverified', dimensionsStatus: 'provisional', heightMeters,
    heightSource: 'caller-supplied-art-scale', scaleRatios: { ...ratios }, localFront: '-Z', frames,
    redDisc: { center: [0, discY, discZ], radius: discR },
    drawCalls: 1, collisionObjects: 0, observedAt: '2021-03', sourceUrls: [...SOURCES],
    limitations: ['No campus anchor or orientation', 'Ratios are provisional photo interpretation',
      'Illustrative alpona rings; inscriptions and measured platform dimensions omitted'] };
  group.userData.shaheedMinar = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
