import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backendUrl = new URL(
  '../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js',
  import.meta.url,
);
const runtimeUrl = new URL(
  '../src/workspace/topology-edit/topology-edit-orientation-cube-runtime.js',
  import.meta.url,
);
const contractUrl = new URL(
  '../src/workspace/topology-edit/topology-edit-orientation-contract.js',
  import.meta.url,
);
const cssUrl = new URL('../src/workspace/viewport-renderer.css', import.meta.url);

test('M006 owns one DOM cube and reuses the inherited dirty frame', async () => {
  const backend = await readFile(backendUrl, 'utf8');
  const runtime = await readFile(runtimeUrl, 'utf8');
  assert.match(backend, /new TopologyEditOrientationCubeRuntime\(\)/u);
  assert.match(backend, /this\.orientationCube\.mount\(host\)/u);
  assert.match(backend, /this\.orientationCube\?\.update\(this\.orientationSnapshot\(\)\)/u);
  assert.match(backend, /this\.orientationCube\?\.destroy\(\)/u);
  assert.equal((backend.match(/renderFrame\(\)/gu) || []).length, 2,
    'The subclass may define one renderFrame and invoke the inherited frame once.');
  assert.doesNotMatch(backend, /requestAnimationFrame|new THREE\.WebGLRenderer|ResizeObserver/u);
  assert.doesNotMatch(runtime, /requestAnimationFrame|new THREE\.|ResizeObserver|setInterval|setTimeout/u);
});

test('M006 cube routes only through the existing shared viewport action vocabulary', async () => {
  const runtime = await readFile(runtimeUrl, 'utf8');
  assert.match(runtime, /data-viewport-action="\$\{viewportAction\}"/u);
  assert.match(runtime, /resolveTopologyEditNavigationAction\(viewportAction\)/u);
  assert.match(runtime, /resolveTopologyEditNavigationAction\('view-iso'\)/u);
  assert.doesNotMatch(runtime, /setStandardView|toggleProjection|camera\./u);
});

test('M006 lifecycle stores and removes the exact listener reference', async () => {
  const runtime = await readFile(runtimeUrl, 'utf8');
  assert.match(runtime, /this\.keyHandler = \(event\) => this\.handleKey\(event\)/u);
  assert.match(runtime, /addEventListener\('keydown', this\.keyHandler\)/u);
  assert.match(runtime, /removeEventListener\('keydown', this\.keyHandler\)/u);
  assert.equal((runtime.match(/addEventListener\(/gu) || []).length, 1);
  assert.equal((runtime.match(/removeEventListener\(/gu) || []).length, 1);
});

test('M006 stable evidence excludes time, random and locale ordering', async () => {
  const contract = await readFile(contractUrl, 'utf8');
  const runtime = await readFile(runtimeUrl, 'utf8');
  for (const source of [contract, runtime]) {
    assert.doesNotMatch(source, /Math\.random|Date\.now|new Date|localeCompare/u);
  }
});

test('M006 CSS is DOM-only, reduced-motion aware and pointer-contained', async () => {
  const css = await readFile(cssUrl, 'utf8');
  assert.match(css, /\.topology-edit-orientation-cube\s*\{/u);
  assert.match(css, /transform-style:\s*preserve-3d/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.match(css, /pointer-events:\s*none/u);
  assert.match(css, /\.topology-edit-orientation-cube__face[\s\S]*pointer-events:\s*auto/u);
});
