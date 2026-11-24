/**
 * Christmas companions and belt ornaments, without a browser.
 *
 * The shapes are what the wall swaps in when the theme is christmas. This
 * checks the costume pieces, the gift in the satellite, and that the baubles
 * stay one instanced cap plus a non-shadow glint — the sun's shadow cube is
 * the frame-time budget, so ornaments must not grow a mesh per bauble or turn
 * on transmission.
 */
import {
  createOrnamentCapGeometry,
  createOrnamentHighlightGeometry,
  createOrnamentMaterial,
  themeBodyAttachments,
  themeBodyEuler,
} from './ThemeAsteroidFactory.js';
import { createGiftSatellite, createSantaAstronaut } from './ThemeVisualFactory.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

function parts(group, key, role) {
  const found = [];
  group.traverse((child) => {
    if (child.userData?.[key] === role) found.push(child);
  });
  return found;
}

function everyColor(meshes, predicate) {
  return meshes.length > 0 && meshes.every((mesh) => predicate(mesh.material.color));
}

const red = (color) => color.r > 0.55 && color.g < 0.28 && color.b < 0.32 && color.r > color.g * 2;
const white = (color) => color.r > 0.82 && color.g > 0.82 && color.b > 0.78;

console.log('\n1. Santa astronaut');
const santa = createSantaAstronaut();
check('marked as Santa', santa.userData.kidsGalaxySanta === true);
check('red suit', everyColor(parts(santa, 'kidsGalaxySantaPart', 'suit'), red));
check('white fur trim', everyColor(parts(santa, 'kidsGalaxySantaPart', 'fur'), white));
check('white beard', everyColor(parts(santa, 'kidsGalaxySantaPart', 'beard'), white));
check('red tuque', everyColor(parts(santa, 'kidsGalaxySantaPart', 'hat'), red));
check('white tuque trim', everyColor(parts(santa, 'kidsGalaxySantaPart', 'trim'), white));
check('white pompom', everyColor(parts(santa, 'kidsGalaxySantaPart', 'pompom'), white));
const pompom = parts(santa, 'kidsGalaxySantaPart', 'pompom')[0];
const hat = parts(santa, 'kidsGalaxySantaPart', 'hat')[0];
check(
  'pompom sits above the tuque brim',
  pompom.position.y > hat.position.y && pompom.position.x > 0.04,
  `pompom (${pompom.position.x.toFixed(3)}, ${pompom.position.y.toFixed(3)})`,
);

console.log('\n2. Gift satellite');
const gift = createGiftSatellite();
check('marked as a gift satellite', gift.userData.kidsGalaxyGiftSatellite === true);
const wrap = parts(gift, 'kidsGalaxyGiftPart', 'wrap');
const ribbons = parts(gift, 'kidsGalaxyGiftPart', 'ribbon');
const bows = parts(gift, 'kidsGalaxyGiftPart', 'bow');
const panels = parts(gift, 'kidsGalaxyGiftPart', 'panel');
check('wrapped box in the middle', wrap.length === 1 && wrap[0].geometry.type === 'BoxGeometry');
check('wrap is centred', Math.abs(wrap[0].position.x) < 1e-6 && Math.abs(wrap[0].position.y) < 1e-6);
check('ribbon crosses the box', ribbons.length >= 2 && ribbons.every((mesh) => mesh.geometry.type === 'BoxGeometry'));
check('bow has loops', bows.some((mesh) => mesh.geometry.type === 'TorusGeometry'));
check(
  'panels flank the gift',
  panels.length === 2 && panels.some((mesh) => mesh.position.x < -0.2) && panels.some((mesh) => mesh.position.x > 0.2),
);
check('panels stay the satellite blue', panels.every((mesh) => {
  const { color } = mesh.material;
  return color.b > color.r && color.b > color.g;
}));

console.log('\n3. Glass ornaments');
const glass = createOrnamentMaterial();
check('glass is a physical material', glass.isMeshPhysicalMaterial === true);
check('glass roughness is low', glass.roughness < 0.15, `${glass.roughness}`);
check('glass clearcoat is on', glass.clearcoat >= 0.8, `${glass.clearcoat}`);
check('glass does not transmit', glass.transmission === 0);
check('glass specular stays bright', glass.specularIntensity >= 1);

const radius = 0.16;
const cap = createOrnamentCapGeometry(radius);
cap.computeBoundingBox();
check('cap carries a hook', cap.userData.kidsGalaxyOrnamentHook === true);
check(
  'hook rises above the bauble',
  cap.boundingBox.max.y > radius * 1.25,
  `max y ${cap.boundingBox.max.y.toFixed(3)}`,
);
const highlight = createOrnamentHighlightGeometry(radius);
highlight.computeBoundingBox();
check(
  'highlight sits on the front of the bauble',
  highlight.boundingBox.max.z > radius * 0.9,
  `max z ${highlight.boundingBox.max.z.toFixed(3)}`,
);

const attachments = themeBodyAttachments('ornament', radius);
check('ornament adds a cap and a highlight', attachments.length === 2);
check('cap is the only shadow caster', attachments[0].castShadow === true && attachments[0].marker === 'kidsGalaxyOrnamentCaps');
check(
  'highlight does not cast',
  attachments[1].castShadow === false && attachments[1].material.isMeshBasicMaterial === true,
);
check('cap metal reads as metal', attachments[0].material.metalness > 0.7);
const pumpkin = themeBodyAttachments('pumpkin', radius);
check('pumpkin stems stay one shadow-casting attachment', pumpkin.length === 1 && pumpkin[0].castShadow === true && pumpkin[0].marker === 'kidsGalaxyPumpkinStems');
check('rocks gain no attachment', themeBodyAttachments('rock', radius).length === 0);

const upright = themeBodyEuler('ornament', 0.5, [1, 2, 3]);
const tilted = themeBodyEuler('ornament', 0, [1, 2, 3]);
check('ornaments have no pitch or roll', upright[0] === 0 && upright[2] === 0 && tilted[0] === 0 && tilted[2] === 0);
check('ornament yaw stays small', Math.abs(upright[1]) < 0.01 && Math.abs(tilted[1]) < 0.5);
check('other bodies keep their tumble', themeBodyEuler('rock', 0.2, [1, 2, 3]).join(',') === '1,2,3');

if (failures) {
  console.log(`\n${failures} Christmas visual check(s) failed`);
  process.exit(1);
}
console.log('\nChristmas visual checks passed.');
