import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'src/workspace/topology-edit-3d-interaction-controller.js',
  'src/workspace/viewport-interaction/topology-edit-gizmo-three-renderer.js',
  'src/workspace/viewport-interaction/topology-edit-interaction-viewport-adapter.js',
  'src/workspace/viewport-productivity/topology-edit-interaction-controller-runtime.js',
  'src/workspace/viewport-productivity/topology-edit-interaction-panel.js',
  'src/workspace/viewport-productivity/topology-edit-interaction-session.js',
];

async function sources() {
  const rows = await Promise.all(
    FILES.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  return Object.fromEntries(FILES.map((file, index) => [file, rows[index]]));
}

test('interaction controller extends current composition without production routing', async () => {
  const source = await sources();
  const controller = source[FILES[0]];
  const loadCalc = await readFile(
    path.join(ROOT, 'src/workspace/load-calc-consumer-controller.js'),
    'utf8',
  );
  assert.match(controller, /topology-edit-3d-review-response-controller\.js/);
  assert.match(controller, /session\.execute\('MOVE_NODE', preview\.movePayload\)/);
  assert.match(controller, /autosaveAfterTransition\?\.\(priorVersion\)/);
  assert.match(controller, /TopologyEditInteractionControllerRuntime/);
  assert.match(controller, /interactionControllerRuntime\.mount\(\)/);
  assert.match(controller, /interactionControllerRuntime\.destroy\(\)/);
  assert.match(loadCalc, /topology-edit-3d-review-response-controller\.js/);
  assert.doesNotMatch(loadCalc, /topology-edit-3d-interaction-controller\.js/);
});

test('gizmo adapter owns explicit capture, release and non-pickable overlay lifecycle', async () => {
  const source = await sources();
  const adapter = source[FILES[2]];
  const renderer = source[FILES[1]];
  assert.match(adapter, /transientGroup\.add\(this\.group\)/);
  assert.match(adapter, /this\.group\.userData\.nonPickable = true/);
  assert.match(adapter, /addEventListener\('pointerdown'.*true\)/);
  assert.match(adapter, /setPointerCapture/);
  assert.match(adapter, /releasePointerCapture/);
  assert.match(adapter, /pointercancel/);
  assert.match(adapter, /stopImmediatePropagation/);
  assert.match(renderer, /interactionMode/);
  assert.match(renderer, /geometry\.dispose\(\)/);
  assert.match(renderer, /material\.dispose\(\)/);
});

test('controller package stays bounded and outside prohibited authority', async () => {
  const source = await sources();
  const prohibited = [
    /WorkspaceState/,
    /topology-edit-persistence/,
    /topology-edit-export/,
    /topology-edit-commit-service/,
    /commitPreparedTopologyEditExport/,
    /topology-edit-pure-reducer/,
    /Date\.now/,
    /new Date/,
    /Math\.random/,
    /crypto\.randomUUID/,
    /mesh\.name/,
    /nearestObject/,
    /closestObject/,
    /export default/,
  ];
  for (const file of FILES) {
    assert.ok(
      source[file].split(/\r?\n/).length <= 300,
      `${file} exceeds 300 physical lines`,
    );
    for (const pattern of prohibited) {
      assert.equal(pattern.test(source[file]), false, `${file} contains ${pattern}`);
    }
  }
});

test('panel exposes exact numeric, nudge, apply and cancel controls safely', async () => {
  const source = await sources();
  const panel = source[FILES[4]];
  assert.match(panel, /interaction-entry-mode/);
  assert.match(panel, /interaction-value-x/);
  assert.match(panel, /interaction-value-y/);
  assert.match(panel, /interaction-value-z/);
  assert.match(panel, /interaction-magnitude/);
  assert.match(panel, /interaction-nudge-increment/);
  assert.match(panel, /apply-professional-interaction/);
  assert.match(panel, /cancel-professional-interaction/);
  assert.match(panel, /escapeHtml/);
  assert.match(panel, /Display-only preview/);
});
