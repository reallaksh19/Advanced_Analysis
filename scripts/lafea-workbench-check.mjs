import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import {
  LAFEA_STAGE_IDS,
  createLafeaWorkbenchStore,
  executeLafeaStage,
  lafeaPreviewGeometry,
} from '../src/workspace/lafea-workbench.js';
import {
  presentLafeaResult,
  resolveLafeaUnits,
} from '../src/workspace/lafea-result-presenters/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALIFIED_FIXTURES = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
});

function weldPlaceholder() {
  return {
    schema: 'lafea-weld-profile-placeholder/v1',
    identity: 'WELD-NOT-IMPLEMENTED',
  };
}

assert.deepEqual(
  LAFEA_STAGE_IDS,
  ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6'],
);

const qualifiedExecutions = new Map();
for (const [stageId, fixture] of Object.entries(QUALIFIED_FIXTURES)) {
  const first = executeLafeaStage(stageId, fixture());
  const second = executeLafeaStage(stageId, fixture());
  assert.equal(first.status, 'QUALIFIED', `${stageId} retained fixture must qualify.`);
  assert.equal(JSON.stringify(first.result), JSON.stringify(second.result), `${stageId} result must be deterministic.`);
  assert.equal(first.stageId, stageId);
  assert.equal(
    executeLafeaStage(stageId, first.canonicalInput).status,
    'QUALIFIED',
    `${stageId} canonical import must reconstruct.`,
  );
  qualifiedExecutions.set(stageId, first);

  const units = resolveLafeaUnits(stageId, first.source);
  const presentation = presentLafeaResult(stageId, first.result, units);
  const rows = presentation.sections.flatMap((section) => section.rows);
  assert.ok(rows.length > 0, `${stageId} presenter must expose retained result rows.`);
  rows.forEach((row) => {
    assert.match(row.sourcePath, /^result\./u, `${stageId} presenter row must cite an exact retained result path.`);
  });
  if (presentation.governing) {
    assert.match(
      presentation.governing.sourcePath,
      /^result\./u,
      `${stageId} governing row must cite an exact retained result path.`,
    );
  }
}

const unsupportedWeld = executeLafeaStage('LAFEA.6', weldPlaceholder());
assert.equal(unsupportedWeld.status, 'FAILED');
assert.equal(unsupportedWeld.result, null);
assert.equal(unsupportedWeld.canonicalInput, null);
assert.deepEqual(
  unsupportedWeld.diagnostics.map((diagnostic) => diagnostic.code),
  ['UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED'],
);
assert.throws(
  () => presentLafeaResult('LAFEA.6', {}, {}),
  (error) => error?.code === 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED',
);
assert.throws(
  () => resolveLafeaUnits('LAFEA.6', weldPlaceholder()),
  (error) => error?.code === 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED',
);

const foundationPreview = lafeaPreviewGeometry('LAFEA.1', attachmentFixture());
assert.equal(foundationPreview.nodePath, null, 'LAFEA.1 source points must be display-only in U0.');
assert.ok(foundationPreview.nodes.length > 0, 'LAFEA.1 explicit source points must remain visible.');

const screeningPreview = lafeaPreviewGeometry('LAFEA.2', screeningFixture());
assert.equal(screeningPreview.nodePath, null, 'LAFEA.2 preview must not expose unsupported geometry editing.');
assert.equal(screeningPreview.nodes.length, 0, 'LAFEA.2 must not synthesize a pipe ring.');
assert.equal(screeningPreview.elements.length, 0, 'LAFEA.2 must not synthesize mesh topology.');

const continuumPreview = lafeaPreviewGeometry('LAFEA.3', continuumFixture());
assert.equal(continuumPreview.nodePath, 'nodes');
assert.equal(continuumPreview.nodes.length, continuumFixture().nodes.length);

const weldPreview = lafeaPreviewGeometry('LAFEA.6', {
  nodes: [{ nodeId: 'W1', x: 0, y: 0, z: 0 }],
  elements: [],
});
assert.equal(weldPreview.nodePath, null, 'LAFEA.6 placeholder geometry must be display-only.');
assert.equal(weldPreview.nodes.length, 1, 'Explicit placeholder source geometry may be shown without calculation.');

const store = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3',
  initialDocument: continuumFixture(),
});
const nodes = store.getState().stages['LAFEA.3'].document.nodes;
const nodeIndex = nodes.findIndex((row) => row.nodeId === 'B');
const originalX = nodes[nodeIndex].x;
store.updateRecord('nodes', nodeIndex, { ...nodes[nodeIndex], x: originalX + 10 });
assert.equal(store.getState().stages['LAFEA.3'].document.nodes[nodeIndex].x, originalX + 10);
assert.equal(store.getState().stages['LAFEA.3'].execution, null);
store.undo();
assert.equal(store.getState().stages['LAFEA.3'].document.nodes[nodeIndex].x, originalX);
store.redo();
assert.equal(store.getState().stages['LAFEA.3'].document.nodes[nodeIndex].x, originalX + 10);
assert.equal(store.exportDocument().schema, 'lafea-workbench-document/v1');

const invalid = attachmentFixture();
invalid.pipeGeometry.outsideDiameter.value = -1;
const rejected = executeLafeaStage('LAFEA.1', invalid);
assert.equal(rejected.status, 'FAILED');
assert.equal(rejected.result, null);
assert.ok(rejected.diagnostics.some((row) => row.severity === 'ERROR'));

const workspace = path.join(ROOT, 'src', 'workspace');
const read = (relativePath) => fs.readFileSync(path.join(workspace, relativePath), 'utf8');
const modelSource = read('lafea-workbench-model.js');
const viewSource = read('lafea-workbench-view.js');
const documentTableSource = read('lafea-document-table.js');
const previewSource = read('lafea-stage-preview.js');
const meshPanelSource = read('lafea-mesh-quality-panel.js');
const resultsSource = read('lafea-results-view.js');
const presenterIndexSource = read('lafea-result-presenters/index.js');
const screeningPresenterSource = read('lafea-result-presenters/attachment-screening.js');
const continuumPresenterSource = read('lafea-result-presenters/local-continuum.js');
const shellPresenterSource = read('lafea-result-presenters/local-shell.js');
const trunnionPresenterSource = read('lafea-result-presenters/trunnion-footprint.js');

assert.match(modelSource, /UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED/u);
assert.doesNotMatch(modelSource, /85\.4/u);
assert.doesNotMatch(modelSource, /allowable(?:Shear)?Mpa\s*\|\|/u);
assert.doesNotMatch(modelSource, /Qualified Weld Profile evaluation passed/u);

assert.doesNotMatch(viewSource, /stage\.document(?:\.|\[)[^;\n]*=/u);
assert.doesNotMatch(viewSource, /\bprompt\s*\(/u);
assert.doesNotMatch(viewSource, /createHybridViewport|webgl:\s*\{\s*render:\s*\(\)\s*=>\s*\{\}/u);
assert.match(viewSource, /No geometry or mesh has been synthesized/u);
assert.match(viewSource, /Calculation not implemented/u);

assert.doesNotMatch(documentTableSource, /Number\([^)]*\)\s*\|\|\s*0/u);
assert.doesNotMatch(documentTableSource, /structuredClone\([^)]*\.at\(-1\)/u);
assert.match(documentTableSource, /Record creation is disabled/u);

assert.doesNotMatch(previewSource, /PLATE-NW|VALVE-MASS|Q8-PLATE|SH3D-|WELD-FILLET/u);
assert.match(previewSource, /does not manufacture pads/u);
assert.match(previewSource, /nodePath: editable \? nodePath : null/u);

assert.doesNotMatch(meshPanelSource, /J_min\s*=|Max AR\s*=|Max Skew\s*=/u);
assert.doesNotMatch(meshPanelSource, /\[PASS\]/u);
assert.match(meshPanelSource, /No numerical quality status is asserted/u);

assert.doesNotMatch(resultsSource, /IMMUTABLE TRUTH/u);
assert.doesNotMatch(resultsSource, /Raw qualified evidence/u);
assert.match(resultsSource, /RAW_RETAINED_FIELD/u);

assert.doesNotMatch(presenterIndexSource, /presentWeldProfile|WELD-TOE-001|MOMENT-ARM-X/u);
assert.doesNotMatch(presenterIndexSource, /LAFEA\.6['"]:\s*documentValue/u);
assert.match(presenterIndexSource, /UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED/u);

assert.doesNotMatch(screeningPresenterSource, /ASME B31\.3/u);
assert.match(screeningPresenterSource, /Nominal pipe-section stress envelopes/u);
assert.match(continuumPresenterSource, /result\.loadCaseResults\[/u);
assert.match(shellPresenterSource, /result\.loadCaseResults\[/u);
assert.match(trunnionPresenterSource, /result\.assessmentRegionResults\[/u);

const workbenchFiles = fs.readdirSync(workspace)
  .filter((name) => name.startsWith('lafea-workbench') && name.endsWith('.js'));
const sourceText = workbenchFiles
  .map((name) => fs.readFileSync(path.join(workspace, name), 'utf8'))
  .join('\n');
assert.doesNotMatch(sourceText, /EventBus|analysis-context|workspace-consumer-context/u);

console.log(JSON.stringify({
  check: 'lafea-workbench-u0',
  status: 'PASS',
  qualifiedStages: Object.keys(QUALIFIED_FIXTURES),
  unsupportedStages: ['LAFEA.6'],
  failClosed: true,
  fabricatedEngineeringClaims: false,
  presenterPathsRetained: true,
  workspaceCoupling: false,
}));
