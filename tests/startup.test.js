import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCharacterSelection, createLanding, TIME_OF_DAY_OPTIONS, SPAWN_LOCATIONS } from '../src/ui/startup.js';

test('Male is the fresh default and early Female choice survives delayed initialization', async () => {
  const choice = createCharacterSelection();
  assert.equal(choice.value, 'hujur');
  choice.select('niqab');
  await Promise.resolve(); // Game bootstrap reads the current selection, not a captured default.
  assert.equal(choice.value, 'niqab');
  assert.equal(createCharacterSelection().value, 'hujur');
});

test('hidden Student and invalid choices cannot replace the two menu characters', () => {
  const choice = createCharacterSelection(), changes = [];
  const unsubscribe = choice.subscribe(type => changes.push(type));
  assert.equal(choice.select('student'), false);
  assert.equal(choice.select(undefined), false);
  choice.select('niqab'); choice.select('niqab'); choice.select('hujur');
  assert.deepEqual(changes, ['niqab', 'hujur']);
  unsubscribe(); choice.select('niqab');
  assert.equal(changes.length, 2);
});

test('landing rebrands to Days in Islamic Uni, keeps Student hidden, and loads menu before the heavy game', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(html, /<title>Days in Islamic Uni/);
  assert.match(html, /<h1 id="heroTitle">Days in<br><em>Islamic Uni\.<\/em><\/h1>/);
  assert.match(html, /DAYS IN ISLAMIC UNI<small>175 ACRES · KUSHTIA<\/small>/);
  assert.match(html, /ইসলামী বিশ্ববিদ্যালয় · কুষ্টিয়া/);
  assert.match(html, /Cormorant\+Garamond.*Hind\+Siliguri.*Plus\+Jakarta\+Sans/);
  assert.doesNotMatch(html, /GTA Islamic University|Campus Story/);
  assert.doesNotMatch(hud, /GTA Islamic University|Campus Story/);
  assert.match(hud, /Days in Islamic Uni · LIVING CAMPUS/);
  assert.match(html, /data-char="hujur" aria-pressed="true"/);
  assert.match(html, /data-char="student"[^>]+hidden disabled tabindex="-1" aria-hidden="true"/);
  assert.match(html, /id="landingTimeOfDay"/);
  assert.match(html, /data-time="golden" aria-pressed="true"/);
  assert.match(html, /id="landingSpawn"/);
  assert.match(html, /data-spawn="main-gate" aria-pressed="true"/);
  assert.match(html, /id="lighting-time"[^>]*>.*<option value="golden" selected>/);
  assert.match(html, /Kushtia · NOAA solar angle/);
  assert.doesNotMatch(html, /hero__description|Explore a living re-creation/);
  assert.match(html, /src="\.\/src\/landing\.js"/);
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /setCharacterType\('hujur'\)/);
});

// Minimal DOM fixture exercises state transitions without starting WebGL.
function menuFixture() {
  const element = () => {
    const classes = new Set(), attributes = {}, listeners = {};
    return { hidden: false, disabled: false, textContent: '', value: '', dataset: {}, style: {},
      classList: { contains: key => classes.has(key), remove: key => classes.delete(key),
        toggle(key, enabled = !classes.has(key)) { enabled ? classes.add(key) : classes.delete(key); return enabled; } },
      setAttribute: (key, value) => { attributes[key] = value; },
      getAttribute: key => attributes[key], removeAttribute: key => delete attributes[key],
      addEventListener: (event, callback) => { (listeners[event] ??= []).push(callback); },
      fire: (event, data = {}) => { for (const callback of listeners[event] ?? []) callback(data); },
      querySelector: () => null, focus() {},
    };
  };
  const nodes = new Map(['mainGateView','landing','selectionNumber','retry-loading','controlsDialog','controlsButton','enterButton',
    'loadingPanel','enterButtonLabel','loadingMessage','loadingPercent','loadingBar','loadingProgress','error-message',
    'landingTimeOfDay','landingSpawn','lighting-time'].map(id => [id, element()]));
  const pills = ['hujur', 'niqab', 'student'].map(char => ({ ...element(), dataset: { char }, hidden: char === 'student' }));
  const timePills = TIME_OF_DAY_OPTIONS.map(time => ({ ...element(), dataset: { time } }));
  const spawnPills = SPAWN_LOCATIONS.map(spawn => ({ ...element(), dataset: { spawn } }));
  nodes.get('landingTimeOfDay').querySelectorAll = q => q === '[data-time]' ? timePills : [];
  nodes.get('landingSpawn').querySelectorAll = q => q === '[data-spawn]' ? spawnPills : [];
  const doc = { ...element(), body: element(), getElementById: id => nodes.get(id),
    querySelectorAll: query => query === '.char-pill' ? pills
      : query === '.char-pill:not([hidden])' ? pills.slice(0, 2)
      : query === '[data-time]' ? timePills
      : query === '[data-spawn]' ? spawnPills
      : [] };
  return { doc, nodes, pills, timePills, spawnPills };
}

test('landing preserves loading-time selection, real progress, error gating and retry', () => {
  const { doc, nodes, pills } = menuFixture(); let retries = 0;
  const menu = createLanding(doc, { reload: () => retries++ });
  pills[1].fire('click'); menu.setReady(false);
  assert.equal(menu.selection.value, 'niqab');
  assert.equal(nodes.get('selectionNumber').textContent, '02 / 02');
  assert.equal(nodes.get('enterButton').disabled, true);
  menu.progress('Downloading', { loadedBytes: 1024, totalBytes: 4096 });
  assert.equal(nodes.get('loadingProgress').getAttribute('aria-valuenow'), '25');
  menu.progress('Preparing');
  assert.equal(nodes.get('loadingProgress').getAttribute('aria-valuenow'), undefined);
  menu.setReady(true);
  assert.equal(nodes.get('enterButton').disabled, false);
  assert.equal(nodes.get('loadingPanel').hidden, true);
  menu.fail(new Error('Map unavailable'));
  assert.equal(menu.ready, false);
  assert.equal(nodes.get('error-message').textContent, 'Map unavailable');
  assert.equal(nodes.get('retry-loading').hidden, false);
  nodes.get('retry-loading').fire('click'); assert.equal(retries, 1);
  assert.equal(menu.selection.value, 'niqab');
});

test('landing exposes reactive timeOfDay and spawnLocation stores synced with UI controls', () => {
  const { doc, nodes, timePills, spawnPills } = menuFixture();
  const menu = createLanding(doc);
  const times = [], spawns = [];
  const unsubTime = menu.timeOfDay.subscribe(value => times.push(value));
  const unsubSpawn = menu.spawnLocation.subscribe(value => spawns.push(value));

  assert.equal(menu.timeOfDay.value, 'golden');
  assert.equal(nodes.get('lighting-time').value, 'golden');
  assert.equal(timePills[2].classList.contains('active'), true);
  assert.equal(timePills[2].getAttribute('aria-pressed'), 'true');
  assert.equal(menu.spawnLocation.value, 'main-gate');
  assert.equal(spawnPills[0].classList.contains('active'), true);
  assert.equal(spawnPills[0].getAttribute('aria-pressed'), 'true');

  timePills[0].fire('click'); // morning
  assert.equal(menu.timeOfDay.value, 'morning');
  assert.equal(nodes.get('lighting-time').value, 'morning');
  assert.equal(timePills[0].classList.contains('active'), true);
  assert.equal(timePills[2].classList.contains('active'), false);
  assert.equal(menu.timeOfDay.select('midnight'), false);

  nodes.get('lighting-time').value = 'dusk';
  nodes.get('lighting-time').fire('change', { target: nodes.get('lighting-time') });
  assert.equal(menu.timeOfDay.value, 'dusk');
  assert.equal(timePills[3].getAttribute('aria-pressed'), 'true');

  spawnPills[1].fire('click'); // central-mosque
  spawnPills[3].fire('click'); // iu-lake
  assert.equal(menu.spawnLocation.value, 'iu-lake');
  assert.equal(spawnPills[3].classList.contains('active'), true);
  assert.equal(spawnPills[0].getAttribute('aria-pressed'), 'false');
  assert.equal(menu.spawnLocation.select('unknown-spot'), false);

  assert.deepEqual(times, ['morning', 'dusk']);
  assert.deepEqual(spawns, ['central-mosque', 'iu-lake']);
  unsubTime(); unsubSpawn();
  menu.timeOfDay.select('midday');
  menu.spawnLocation.select('central-library');
  assert.equal(times.length, 2);
  assert.equal(spawns.length, 2);
});

test('expanded gate returns with Escape without changing selection or readiness', () => {
  const { doc, nodes } = menuFixture(), menu = createLanding(doc);
  nodes.get('mainGateView').fire('click');
  assert.equal(nodes.get('landing').classList.contains('gate-expanded'), true);
  assert.equal(nodes.get('mainGateView').getAttribute('aria-label'), 'Return to start menu');
  nodes.get('landing').classList.toggle('gate-live', true);
  doc.fire('keydown', { key: 'Escape' });
  assert.equal(nodes.get('landing').classList.contains('gate-expanded'), false);
  assert.equal(nodes.get('landing').classList.contains('gate-live'), false);
  assert.equal(menu.selection.value, 'hujur'); assert.equal(menu.ready, false);
});
