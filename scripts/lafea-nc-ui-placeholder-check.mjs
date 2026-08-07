import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLafeaNcPlaceholderProjection } from '../src/workspace/lafea-nc-placeholder-panel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projection = createLafeaNcPlaceholderProjection();

assert.equal(projection.schema, 'lafea-nc-ui-placeholders/v1');
assert.equal(projection.mode, 'READ_ONLY_PLACEHOLDER');
assert.equal(projection.status, 'AWAITING_GOVERNED_EVIDENCE');
assert.deepEqual(projection.modules.map((module) => module.id), ['NC-10', 'NC-11', 'NC-12']);
assert.ok(Object.values(projection.authority).every((value) => value === false));
projection.modules.forEach((module) => {
  assert.equal(module.status, 'AWAITING_GOVERNED_EVIDENCE');
  assert.ok(module.evidencePlaceholders.length >= 4);
  assert.ok(Object.isFrozen(module));
  assert.ok(Object.isFrozen(module.evidencePlaceholders));
});
assert.ok(Object.isFrozen(projection));
assert.ok(Object.isFrozen(projection.modules));

const panelSource = fs.readFileSync(path.join(ROOT, 'src/workspace/lafea-nc-placeholder-panel.js'), 'utf8');
assert.doesNotMatch(panelSource, /production-run-receipt-evaluator|operational-surveillance-evaluator|retirement-preservation-evaluator/u);
assert.doesNotMatch(panelSource, /executeLafeaStage|actionButton|onRun|onApprove|onRelease/u);
assert.doesNotMatch(panelSource, /element\(root,\s*['"]button/u);
assert.match(panelSource, /Read-only placeholder/u);
assert.match(panelSource, /NOT AUTHORIZED/u);

const workbenchSource = fs.readFileSync(path.join(ROOT, 'src/workspace/lafea-workbench-content.js'), 'utf8');
assert.match(workbenchSource, /renderLafeaNcPlaceholderPanel/u);
assert.match(workbenchSource, /NC governance — evidence placeholders/u);

console.log(JSON.stringify({
  check: 'lafea-nc-ui-placeholders',
  status: 'PASS',
  modules: projection.modules.map((module) => module.id),
  executionAuthority: false,
  releaseAuthority: false,
  reactivationAuthority: false,
}));
