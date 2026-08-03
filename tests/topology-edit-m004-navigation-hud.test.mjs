import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveTopologyEditNavigationAction,
  resolveTopologyEditNavigationShortcut,
  topologyEditNavigationShortcutLabel,
  topologyEditNavigationShortcutManifest,
  TOPOLOGY_EDIT_NAVIGATION_ROUTE_ERROR,
} from '../src/workspace/topology-edit/topology-edit-navigation-routing.js';

const SHARED_ACTIONS = {
  fit: ['COMMAND', 'fit'],
  'fit-selection': ['COMMAND', 'fit-selection'],
  home: ['COMMAND', 'home'],
  reset: ['COMMAND', 'home'],
  'pivot-selection': ['COMMAND', 'pivot-selection'],
  'previous-view': ['COMMAND', 'previous'],
  'toggle-projection': ['COMMAND', 'projection'],
  'view-iso': ['STANDARD_VIEW', 'iso'],
  'view-top': ['STANDARD_VIEW', 'top'],
  'view-bottom': ['STANDARD_VIEW', 'bottom'],
  'view-front': ['STANDARD_VIEW', 'front'],
  'view-back': ['STANDARD_VIEW', 'back'],
  'view-left': ['STANDARD_VIEW', 'left'],
  'view-right': ['STANDARD_VIEW', 'right'],
  'mode-select': ['MODE', 'select'],
  'mode-orbit': ['MODE', 'orbit'],
  'mode-pan': ['MODE', 'pan'],
};

function keyEvent(code, options = {}) {
  return {
    code,
    shiftKey: options.shiftKey === true,
    altKey: options.altKey === true,
    ctrlKey: options.ctrlKey === true,
    metaKey: options.metaKey === true,
    repeat: options.repeat === true,
    defaultPrevented: options.defaultPrevented === true,
    target: options.target || { tagName: 'CANVAS', isContentEditable: false },
  };
}

test('M004 resolves the complete existing shared navigation vocabulary', () => {
  for (const [action, expected] of Object.entries(SHARED_ACTIONS)) {
    const intent = resolveTopologyEditNavigationAction(action);
    assert.deepEqual([intent.kind, intent.value], expected, action);
    assert.ok(Object.isFrozen(intent), `${action} intent must be immutable`);
  }
});

test('M004 shortcuts resolve to the same immutable navigation intents', () => {
  const cases = [
    ['KeyQ', false, 'MODE', 'select'],
    ['KeyO', false, 'MODE', 'orbit'],
    ['KeyP', false, 'MODE', 'pan'],
    ['KeyF', false, 'COMMAND', 'fit'],
    ['KeyF', true, 'COMMAND', 'fit-selection'],
    ['KeyH', false, 'COMMAND', 'home'],
    ['KeyC', false, 'COMMAND', 'pivot-selection'],
    ['Digit5', false, 'COMMAND', 'projection'],
    ['Digit0', false, 'STANDARD_VIEW', 'iso'],
    ['Digit1', false, 'STANDARD_VIEW', 'front'],
    ['Digit3', false, 'STANDARD_VIEW', 'right'],
    ['Digit7', false, 'STANDARD_VIEW', 'top'],
  ];
  for (const [code, shiftKey, kind, value] of cases) {
    const resolved = resolveTopologyEditNavigationShortcut(keyEvent(code, { shiftKey }));
    assert.deepEqual([resolved.kind, resolved.value], [kind, value]);
  }
});

test('M004 shortcuts do not claim editable, modified, repeated, or unknown events', () => {
  for (const target of [
    { tagName: 'INPUT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'SELECT' },
    { tagName: 'BUTTON' },
    { tagName: 'DIV', isContentEditable: true },
  ]) assert.equal(resolveTopologyEditNavigationShortcut(keyEvent('KeyF', { target })), null);
  for (const options of [
    { altKey: true }, { ctrlKey: true }, { metaKey: true },
    { repeat: true }, { defaultPrevented: true },
  ]) assert.equal(resolveTopologyEditNavigationShortcut(keyEvent('KeyF', options)), null);
  assert.equal(resolveTopologyEditNavigationShortcut(keyEvent('KeyZ')), null);
});

test('M004 shortcut manifest is deeply immutable and conflict-free', () => {
  const manifest = topologyEditNavigationShortcutManifest();
  assert.ok(Object.isFrozen(manifest));
  assert.ok(manifest.every(Object.isFrozen));
  const keys = manifest.map((row) => `${row.code}:${row.shift ? 'SHIFT' : 'PLAIN'}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(topologyEditNavigationShortcutLabel('fit'), 'F');
  assert.equal(topologyEditNavigationShortcutLabel('fit-selection'), 'Shift+F');
});

test('M004 fails closed for unsupported claimed actions', () => {
  assert.throws(() => resolveTopologyEditNavigationAction('fly-through'), (error) => (
    error.code === TOPOLOGY_EDIT_NAVIGATION_ROUTE_ERROR
    && error.detailCode === 'ACTION_UNSUPPORTED'
  ));
});

test('M004 production wiring retains one render owner and one keyboard lifecycle', async () => {
  const controller = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );
  const backend = await readFile(
    new URL('../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /return new TopologyEditNavigationHudViewportBackend\(\)/u);
  assert.equal((controller.match(/addEventListener\('keydown'/gu) || []).length, 1);
  assert.equal((controller.match(/removeEventListener\('keydown'/gu) || []).length, 1);
  assert.doesNotMatch(controller, /const aliases\s*=/u);
  assert.match(controller, /resolveTopologyEditNavigationAction/u);
  assert.match(controller, /resolveTopologyEditNavigationShortcut/u);
  assert.match(backend, /new ViewportAxisHUD\(\{ basisQuaternion: engineeringBasisQuaternion\(\) \}\)/u);
  assert.match(backend, /ENGINEERING_TO_RENDER_MATRIX4_ELEMENTS/u);
  assert.match(backend, /super\.renderFrame\(\)/u);
  assert.match(backend, /axisHud\.updateOrientation\(this\.activeCamera\)/u);
  assert.match(backend, /axisHud\.render\(this\.renderer, width, height\)/u);
  assert.match(backend, /axisHud\?\.dispose\(\)/u);
  assert.doesNotMatch(backend, /requestAnimationFrame|new THREE\.WebGLRenderer/u);
});

test('M004 shared HUD applies the engineering basis after camera inversion', async () => {
  const hud = await readFile(new URL('../src/workspace/viewport-axis-hud.js', import.meta.url), 'utf8');
  assert.match(hud, /validatedBasisQuaternion/u);
  assert.match(hud, /\.invert\(\)\s*\.multiply\(this\.basisQuaternion\)/u);
  assert.match(hud, /basisQuaternion = null/u);
});
