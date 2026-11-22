import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tintGeometry } from '../facades.js';

const SOURCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Shahid_Monument,_Islamic_University,_Bangladesh.jpg',
  'https://commons.wikimedia.org/wiki/File:Shahid_Monument,_architectures_of_Islamic_University,_Bangladesh.jpg',
]);

const PALETTE = Object.freeze({
  brickMain: 0x9c5644,
  brickDeep: 0x874839,
  brickWarm: 0xa8624d,
  brickHighlight: 0xb66e56,
  brickShadow: 0x673529,
  stoneBright: 0xebe4d4,
  stoneCoping: 0xe0d8c7,
  stoneMid: 0xd1c8b6,
  stoneRiser: 0x766f62,
  stoneShadow: 0x575046,
  wingWall: 0xded7c6,
  wingNeck: 0xb3aa97,
  terracottaDeck: 0x965240,
});

function rectangle(x, y, width, height) {
  const path = new THREE.Path();
  path.moveTo(x, y); path.lineTo(x + width, y); path.lineTo(x + width, y + height);
  path.lineTo(x, y + height); path.closePath(); return path;
}

function makeArchSection(rOuter, rInner, bottomY, springY) {
  const shape = new THREE.Shape();
  shape.moveTo(-rOuter, bottomY); shape.lineTo(-rOuter, springY);
  shape.absarc(0, springY, rOuter, Math.PI, 0, true); shape.lineTo(rOuter, bottomY);
  shape.lineTo(rInner, bottomY); shape.lineTo(rInner, springY);
  shape.absarc(0, springY, rInner, 0, Math.PI, false); shape.lineTo(-rInner, bottomY);
  shape.closePath();
  return shape;
}

/** Separate from the Minar: local-origin, provisional-scale, unplaced visual geometry only. */
export function buildMartyrsMemorial(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Memorial options must be an object');
  const { heightMeters } = options;
  if (!Number.isFinite(heightMeters) || heightMeters <= 0 || heightMeters > 1000) {
    throw new RangeError('Memorial heightMeters must be caller-supplied, positive and at most 1000 metres');
  }
  const h = heightMeters, base = .05 * h, parts = [];
  const ratios = { shellWidth: .6, shellDepth: .29, shellThickness: .035, plinthHeight: .05, wingHeight: .14 };
  const add = (geometry, color) => {
    geometry.deleteAttribute('uv');
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    tintGeometry(geometry, color); parts.push(geometry);
  };
  const box = (x, y, z, w, rise, depth, color) =>
    add(new THREE.BoxGeometry(w, rise, depth).translate(x, y + rise / 2, z), color);
  const extrude = (shape, depth, z, color, curveSegments = 20) => {
    add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments }).translate(0, 0, z), color);
  };

  // 1. Refined 3-step stone & terracotta ceremonial platform with overhanging nosing lips & riser shadows.
  const stepH = base / 3, lipH = .0042 * h;
  for (let step = 0; step < 3; step++) {
    const w = (1.45 - step * .06) * h, d = (.92 - step * .06) * h;
    const y0 = step * stepH, y1 = (step + 1) * stepH;
    // Recessed darker riser
    box(0, y0, 0, w - .012 * h, stepH - lipH, d - .012 * h, step === 2 ? PALETTE.brickDeep : PALETTE.stoneRiser);
    // Crisp dark shadow groove beneath stone nosing overhang
    box(0, y1 - lipH - .0022 * h, 0, w - .015 * h, .0022 * h, d - .015 * h, PALETTE.stoneShadow);
    // Overhanging warm limestone nosing lip slab
    box(0, y1 - lipH, 0, w, lipH, d, step === 2 ? PALETTE.stoneCoping : PALETTE.stoneMid);
  }
  // Inset terracotta ceremonial terrace deck + central pale stone approach runner on top platform
  box(0, base, 0, 1.24 * h, .0016 * h, .71 * h, PALETTE.terracottaDeck);
  box(0, base + .0016 * h, -.225 * h, .15 * h, .0012 * h, .36 * h, PALETTE.stoneBright);

  // 2. Barrel-vault terracotta masonry shell with multi-tone brick courses, vertical relief ribs & stone coping rim.
  const radius = .3 * h, inner = radius - ratios.shellThickness * h, spring = .7 * h;
  const shellStartZ = -.145 * h, shellDepth = ratios.shellDepth * h;
  const courseSpecs = [
    { start: 0.00, end: 0.19, rOut: radius - .0015 * h, color: PALETTE.brickMain },
    { start: 0.19, end: 0.21, rOut: radius - .0042 * h, color: PALETTE.brickShadow },
    { start: 0.21, end: 0.40, rOut: radius - .0006 * h, color: PALETTE.brickDeep },
    { start: 0.40, end: 0.42, rOut: radius - .0042 * h, color: PALETTE.brickShadow },
    { start: 0.42, end: 0.58, rOut: radius,             color: PALETTE.brickWarm },
    { start: 0.58, end: 0.60, rOut: radius - .0042 * h, color: PALETTE.brickShadow },
    { start: 0.60, end: 0.79, rOut: radius - .0006 * h, color: PALETTE.brickDeep },
    { start: 0.79, end: 0.81, rOut: radius - .0042 * h, color: PALETTE.brickShadow },
    { start: 0.81, end: 1.00, rOut: radius - .0015 * h, color: PALETTE.brickMain },
  ];
  for (const course of courseSpecs) {
    const z0 = shellStartZ + course.start * shellDepth;
    const len = (course.end - course.start) * shellDepth;
    extrude(makeArchSection(course.rOut, inner, base, spring), len, z0, course.color, 20);
  }

  // Crisp pale limestone coping trim framing the front & rear outer barrel-vault arch rims (flush at exact y = h).
  const outerCoping = makeArchSection(radius, radius - .011 * h, base, spring);
  extrude(outerCoping, .010 * h, shellStartZ - .004 * h, PALETTE.stoneBright, 20);
  extrude(outerCoping, .010 * h, shellStartZ + shellDepth - .006 * h, PALETTE.stoneCoping, 20);
  // Subtle inner soffit limestone arch bead lining the front & rear vault reveals
  const soffitBead = makeArchSection(inner + .007 * h, inner, base, spring);
  extrude(soffitBead, .007 * h, shellStartZ - .002 * h, PALETTE.stoneCoping, 20);
  extrude(soffitBead, .007 * h, shellStartZ + shellDepth - .005 * h, PALETTE.stoneMid, 20);

  // Subtle vertical brick relief pilasters, spring-line stone stringcourses & jamb base plinths along both flanks.
  for (const sign of [-1, 1]) {
    const jambMidX = sign * ((radius + inner) / 2);
    // Stepped stone plinth base wrapping each shell jamb foot (strictly outside inner opening)
    box(jambMidX, base, 0, ratios.shellThickness * h + .012 * h, .024 * h, shellDepth + .014 * h, PALETTE.stoneMid);
    box(jambMidX, base + .024 * h, 0, ratios.shellThickness * h + .006 * h, .009 * h, shellDepth + .008 * h, PALETTE.stoneBright);
    // Crisp limestone impost/spring-line stringcourse band
    box(jambMidX, spring - .010 * h, 0, ratios.shellThickness * h + .008 * h, .012 * h, shellDepth + .010 * h, PALETTE.stoneCoping);
    // Subtle vertical masonry relief pilaster ribs rising along outer brick flanks
    for (const [idx, zFrac] of [-.095, -.032, .032, .095].entries()) {
      box(sign * (radius - .001 * h), base + .033 * h, zFrac * h, .0045 * h, spring - base - .043 * h, .022 * h,
        idx % 2 === 0 ? PALETTE.brickWarm : PALETTE.brickDeep);
    }
  }

  // 3. Enriched nested pierced brick portals with chamfered limestone doorway trims & stone coping ledges.
  const portals = [];
  for (const [index, width, top, z] of [[0, .46, .79, -.137], [1, .34, .62, .075]]) {
    const w = width * h / 2, shoulder = (top - .11) * h, crown = .075 * h;
    const portalDepth = .025 * h, pz = z * h;
    const shape = new THREE.Shape();
    // Open bottom doorway preserves genuine physical depth through both portals.
    shape.moveTo(-w, base); shape.lineTo(-w, shoulder); shape.lineTo(-crown, shoulder);
    shape.lineTo(-crown, (top - .075) * h);
    shape.absarc(0, (top - .075) * h, crown, Math.PI, 0, true);
    shape.lineTo(crown, shoulder); shape.lineTo(w, shoulder); shape.lineTo(w, base);
    shape.lineTo(.025 * h, base); shape.lineTo(.025 * h, base + .12 * h);
    shape.lineTo(-.025 * h, base + .12 * h); shape.lineTo(-.025 * h, base); shape.closePath();
    for (const sign of [-1, 1]) {
      for (const fraction of [.22, .6]) {
        shape.holes.push(rectangle((sign < 0 ? -width * .43 : width * .27) * h,
          base + fraction * (shoulder - base), width * .16 * h, .2 * (shoulder - base)));
      }
    }
    shape.holes.push(rectangle(-.025 * h, base + .29 * h, .05 * h, .15 * h));
    const archHole = new THREE.Path();
    const holeBottom = (top - .095) * h, holeSpring = (top - .075) * h, holeRadius = .026 * h;
    archHole.moveTo(-holeRadius, holeBottom); archHole.lineTo(-holeRadius, holeSpring);
    archHole.absarc(0, holeSpring, holeRadius, Math.PI, 0, true);
    archHole.lineTo(holeRadius, holeBottom); archHole.closePath(); shape.holes.push(archHole);
    extrude(shape, portalDepth, pz, index ? PALETTE.brickDeep : PALETTE.brickMain, 18);

    // Chamfered limestone doorway jambs & stepped lintel trim strictly outside the open doorway aperture.
    const zMid = pz + portalDepth / 2;
    const trimDepth = portalDepth + .007 * h;
    for (const sign of [-1, 1]) {
      box(sign * .027 * h, base, zMid, .004 * h, .122 * h, portalDepth + .003 * h, PALETTE.stoneMid);
      box(sign * .0335 * h, base, zMid, .009 * h, .126 * h, trimDepth, PALETTE.stoneCoping);
      // Warm brick relief pilasters flanking the portal outer bays
      box(sign * (w - .014 * h), base, zMid, .016 * h, shoulder - base, portalDepth + .004 * h,
        index ? PALETTE.brickMain : PALETTE.brickWarm);
      // Crisp stone coping cap along left & right portal shoulders
      const shoulderLen = w - crown;
      box(sign * (crown + shoulderLen / 2), shoulder - .002 * h, zMid, shoulderLen + .006 * h, .009 * h,
        portalDepth + .009 * h, PALETTE.stoneBright);
      // Subtle stone sills beneath the pierced side apertures
      for (const fraction of [.22, .6]) {
        const winCenterX = sign * (width * .35) * h;
        const winBottomY = base + fraction * (shoulder - base);
        box(winCenterX, winBottomY - .007 * h, zMid, width * .18 * h, .007 * h, portalDepth + .006 * h, PALETTE.stoneCoping);
      }
    }
    // Chamfered doorway lintel & central window sill (strictly above openingSample[0] at base + 0.07*h)
    box(0, base + .120 * h, zMid, .078 * h, .005 * h, portalDepth + .004 * h, PALETTE.stoneMid);
    box(0, base + .125 * h, zMid, .088 * h, .012 * h, trimDepth + .002 * h, PALETTE.stoneBright);
    box(0, base + .283 * h, zMid, .062 * h, .007 * h, portalDepth + .006 * h, PALETTE.stoneCoping);

    // Delicate stone hood coping molding crowning each portal's central semicircular arch (well below 0.87*h)
    const hood = new THREE.Shape();
    const archCenterY = (top - .075) * h;
    hood.absarc(0, archCenterY, crown + .007 * h, Math.PI, 0, true);
    hood.absarc(0, archCenterY, crown - .001 * h, 0, Math.PI, false);
    hood.closePath();
    extrude(hood, portalDepth + .007 * h, pz - .0035 * h, PALETTE.stoneBright, 16);

    portals.push({ index, width: width * h, top: top * h, depth: portalDepth, z: pz });
  }

  // 4. Curved limestone wing walls with warm limestone coping & sculpted terracotta bas-relief panel bands.
  const wingArc = (sign, rOuter, thickness, bottom, rise, color, segments = 20) => {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const a = -Math.PI / 2 + (i / segments) * Math.PI;
      points.push([sign * (.34 * h + Math.cos(a) * rOuter), -(.02 * h + Math.sin(a) * rOuter)]);
    }
    for (let i = segments; i >= 0; i--) {
      const a = -Math.PI / 2 + (i / segments) * Math.PI;
      points.push([sign * (.34 * h + Math.cos(a) * (rOuter - thickness)), -(.02 * h + Math.sin(a) * (rOuter - thickness))]);
    }
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(...p)));
    add(new THREE.ExtrudeGeometry(shape, { depth: rise, bevelEnabled: false }).rotateX(-Math.PI / 2)
      .translate(0, bottom, 0), color);
  };
  const wingH = ratios.wingHeight * h;
  for (const sign of [-1, 1]) {
    // Stepped limestone base plinth under curved wing wall
    wingArc(sign, .317 * h, .029 * h, base, .016 * h, PALETTE.stoneMid);
    // Main curved pale limestone wing wall
    wingArc(sign, .310 * h, .018 * h, base + .016 * h, wingH - .024 * h, PALETTE.wingWall);
    // Recessed shadow necking strip beneath top coping
    wingArc(sign, .308 * h, .015 * h, base + wingH - .008 * h, .004 * h, PALETTE.wingNeck);
    // Overhanging warm limestone coping cap crowning the wing wall
    wingArc(sign, .320 * h, .031 * h, base + wingH - .004 * h, .011 * h, PALETTE.stoneBright);

    // Framed terracotta bas-relief panel band along outer face
    wingArc(sign, .3145 * h, .0055 * h, base + .027 * h, .006 * h, PALETTE.stoneCoping);
    wingArc(sign, .3145 * h, .0055 * h, base + .108 * h, .006 * h, PALETTE.stoneCoping);
    wingArc(sign, .312 * h, .003 * h, base + .033 * h, .075 * h, PALETTE.brickShadow);
    wingArc(sign, .314 * h, .0025 * h, base + .038 * h, .065 * h, PALETTE.brickMain);

    // Sculpted rhythmic terracotta bas-relief motif tiles along the outer curve (illustrative sculptural texture)
    const tiles = 11;
    for (let t = 0; t < tiles; t++) {
      const a = -Math.PI * .43 + (t / (tiles - 1)) * Math.PI * .86;
      const rTile = .315 * h;
      const tx = sign * (.34 * h + Math.cos(a) * rTile);
      const tz = .02 * h + Math.sin(a) * rTile;
      const tileH = (.036 + ((t * 7) % 3) * .011) * h;
      const tileY = base + .041 * h + (t % 2) * .006 * h;
      const tile = new THREE.BoxGeometry(.0045 * h, tileH, .036 * h);
      // Tangent orientation aligned to curved wing outer normal
      tile.rotateY(sign > 0 ? -a : a);
      tile.translate(tx, tileY + tileH / 2, tz);
      add(tile, t % 3 === 0 ? PALETTE.brickHighlight : t % 3 === 1 ? PALETTE.brickWarm : PALETTE.brickDeep);
    }

    // Crisp end-cap limestone pilasters closing both ends of each curved wing
    for (const endZ of [-.29 * h, .33 * h]) {
      box(sign * .34 * h, base, endZ, .034 * h, wingH + .007 * h, .024 * h, PALETTE.stoneCoping);
    }
  }

  const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .84, envMapIntensity: .35, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'martyrs-memorial-shell-portals-and-wings';
  mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'unplaced-martyrs-memorial'; group.add(mesh);
  const diagnostics = { placementStatus: 'unverified', dimensionsStatus: 'provisional', heightMeters,
    heightSource: 'caller-supplied-art-scale', scaleRatios: { ...ratios }, localFront: '-Z', portals,
    shell: { width: radius * 2, depth: shellDepth, thickness: radius - inner, springHeight: spring },
    openingSamples: [[0, base + .07 * h, 0], [0, .87 * h, 0]],
    drawCalls: 1, collisionObjects: 0, sourceUrls: [...SOURCES], observedAt: '2021-04',
    limitations: ['No campus anchor or orientation', 'Ratios are provisional photo interpretation',
      'Relief panel motifs are illustrative; sculptural inscriptions omitted'] };
  group.userData.martyrsMemorial = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
