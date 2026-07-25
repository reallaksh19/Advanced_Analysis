import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSolverResultContract,
  ENGINEERING_LEVEL,
  validateSolverResultContract,
} from '../src/core/solvers/certification/solverResultContract.js';
import { AnalysisCapabilityRegistry } from '../src/workspace/analysis-capability-registry.js';
import { createDefaultAnalysisCapabilityRegistry } from '../src/workspace/analysis-capabilities.js';
import { AnalysisCoordinator } from '../src/workspace/analysis-coordinator.js';
import { createAnalysisContext } from '../src/workspace/analysis-context.js';
import { AnalysisSessionStore } from '../src/workspace/analysis-session-store.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataset = normalizeWorkspaceDataset(completePackage(), 'phase5-complete.json');
const state = new WorkspaceStateStore();
state.loadDataset(dataset);
state.selectEntity('PIPE-1');
const registry = createDefaultAnalysisCapabilityRegistry();
const pipeContext = createAnalysisContext(state, 'PIPE-1');
const pipeCapabilities = registry.list(pipeContext);
assert.equal(registry.size, 2);
assert.equal(pipeCapabilities.find((item) => item.analysisType === 'support-load').enabled, true);
assert.equal(pipeCapabilities.find((item) => item.analysisType === 'pipe-screening').enabled, true);

const supportLoadResult = await registry.execute('support-load', pipeContext);
assert.equal(validateSolverResultContract(supportLoadResult).ok, true);
assert.equal(supportLoadResult.status, 'CALCULATED');
assert.equal(supportLoadResult.meta.sourcePipeId, 'PIPE-1');
assert.equal(supportLoadResult.results.status.calculated, true);

const screeningResult = await registry.execute('pipe-screening', pipeContext);
assert.equal(validateSolverResultContract(screeningResult).ok, true);
assert.equal(screeningResult.moduleId, 'simplified-2d');
assert.equal(screeningResult.meta.sourceEntityIds.length, 2);
assert.ok(['PASS', 'MARGINAL', 'FAIL', 'INVALID'].includes(screeningResult.status));

state.selectEntity('SUP-1');
const supportContext = createAnalysisContext(state, 'SUP-1');
const supportCapabilities = registry.list(supportContext);
assert.equal(supportCapabilities.find((item) => item.analysisType === 'support-load').enabled, true);
assert.equal(supportCapabilities.find((item) => item.analysisType === 'pipe-screening').enabled, false);
const linkedResult = await registry.execute('support-load', supportContext);
assert.equal(linkedResult.meta.requestedTargetId, 'SUP-1');
assert.equal(linkedResult.meta.sourcePipeId, 'PIPE-1');

const incompleteState = new WorkspaceStateStore();
incompleteState.loadDataset(normalizeWorkspaceDataset(incompletePackage(), 'incomplete.json'));
incompleteState.selectEntity('PIPE-INCOMPLETE');
const incomplete = registry.list(createAnalysisContext(incompleteState, 'PIPE-INCOMPLETE'));
assert.equal(incomplete.every((item) => item.enabled === false), true);
await assert.rejects(
  registry.execute('support-load', createAnalysisContext(incompleteState, 'PIPE-INCOMPLETE')),
  /not ready|incomplete|required/i,
);

const disconnectedState = new WorkspaceStateStore();
disconnectedState.loadDataset(normalizeWorkspaceDataset(disconnectedPackage(), 'disconnected.json'));
disconnectedState.selectEntity('PIPE-D1');
const disconnected = registry.list(createAnalysisContext(disconnectedState, 'PIPE-D1'));
const disconnectedScreening = disconnected.find((item) => item.analysisType === 'pipe-screening');
assert.equal(disconnectedScreening.enabled, false);
assert.match(disconnectedScreening.reason, /connected pipe legs/i);

const strictRegistry = new AnalysisCapabilityRegistry();
assert.throws(() => strictRegistry.register({ id: '', label: 'Bad' }), /non-empty string/);
strictRegistry.register(testCapability('test-capability'));
assert.throws(() => strictRegistry.register(testCapability('test-capability')), /already registered/);

await assertStaleCompletionIsIgnored(dataset);
assertEventValidation();
await assertSourceGuards();
console.log('Phase 5 analysis capability and coordinator contracts passed.');

async function assertStaleCompletionIsIgnored(activeDataset) {
  let resolveExecution;
  const delayedRegistry = new AnalysisCapabilityRegistry().register({
    ...testCapability('delayed'),
    execute: () => new Promise((resolve) => { resolveExecution = resolve; }),
  });
  const localState = new WorkspaceStateStore();
  localState.loadDataset(activeDataset);
  localState.selectEntity('PIPE-1');
  const context = createAnalysisContext(localState, 'PIPE-1');
  const store = new AnalysisSessionStore();
  const session = store.open({
    targetId: 'PIPE-1',
    analysisType: 'delayed',
    datasetId: context.dataset.datasetId,
    workspaceVersion: context.version,
    inspection: delayedRegistry.inspect('delayed', context),
  });
  const coordinator = new AnalysisCoordinator(EventBus, localState, delayedRegistry, store);
  const completions = [];
  const failures = [];
  const unsubscribeCompleted = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_COMPLETED, (payload) => completions.push(payload));
  const unsubscribeFailed = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_FAILED, (payload) => failures.push(payload));
  coordinator.init();
  EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
    entityId: 'PIPE-1', type: 'pipe', properties: {}, source: 'api',
  });
  EventBus.publish(EVENT_TOPICS.ANALYSIS_REQUESTED, {
    analysisType: 'delayed', targetId: 'PIPE-1', sessionId: session.sessionId,
  });
  localState.selectEntity('PIPE-2');
  EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
    entityId: 'PIPE-2', type: 'pipe', properties: {}, source: 'api',
  });
  resolveExecution(createSolverResultContract({
    moduleId: 'delayed-test',
    methodId: 'DELAYED_TEST',
    formulaIds: ['DELAYED_TEST'],
    engineeringLevel: ENGINEERING_LEVEL.SCREENING,
    status: 'PASS',
    results: { value: 1 },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(completions.length, 0);
  assert.equal(failures.length, 0);
  coordinator.destroy();
  unsubscribeCompleted();
  unsubscribeFailed();
  assert.equal(EventBus.listenerCount(EVENT_TOPICS.ANALYSIS_REQUESTED), 0);
}

function assertEventValidation() {
  assert.throws(() => EventBus.publish(EVENT_TOPICS.ANALYSIS_COMPLETED, {
    requestId: 'analysis-1', analysisType: 'support-load', targetId: 'PIPE-1', result: null,
  }), /result must be an object/);
  assert.throws(() => EventBus.publish(EVENT_TOPICS.ANALYSIS_FAILED, {
    requestId: 'analysis-1', analysisType: 'support-load', targetId: 'PIPE-1', code: '', message: 'failed',
  }), /code must be a non-empty string/);
}

async function assertSourceGuards() {
  const modules = [
    'src/workspace/analysis-capability-registry.js',
    'src/workspace/analysis-capabilities.js',
    'src/workspace/analysis-connectivity.js',
    'src/workspace/analysis-context.js',
    'src/workspace/analysis-coordinator.js',
    'src/workspace/support-load-capability.js',
    'src/workspace/pipe-screening-capability.js',
    'src/workspace/properties-panel.js',
    'src/workspace/properties-view.js',
    'src/workspace/event-topics.js',
    'src/workspace/bootstrap.js',
  ];
  for (const relativePath of modules) {
    const source = await readFile(path.join(root, relativePath), 'utf8');
    const lineCount = source.split(/\r?\n/).length;
    assert.ok(lineCount <= 300, `${relativePath} exceeds 300 lines (${lineCount}).`);
    assert.doesNotMatch(source, /from ['"](?:zustand|react|react-dom)/, `${relativePath} imports React/Zustand.`);
    assert.doesNotMatch(source, /(?:Date\.now|performance\.now|Math\.random)/, `${relativePath} is non-deterministic.`);
  }
  const propertiesSource = await readFile(path.join(root, 'src/workspace/properties-panel.js'), 'utf8');
  assert.doesNotMatch(
    propertiesSource,
    /(?:solver|support-load|capability-registry|pipe-screening-capability)/,
    'PropertiesPanel imports or names calculation implementation modules.',
  );
  assert.doesNotMatch(propertiesSource, /document\.(querySelector|getElementById)/);
}

function testCapability(id) {
  return {
    id,
    label: id,
    engineeringLevel: ENGINEERING_LEVEL.SCREENING,
    manifest: {
      solverId: `${id}-solver`, solverVersion: '1.0.0', methodId: `${id}-method`, methodVersion: '1',
      codeBasis: ['Test basis'], assumptions: ['Test assumption'], limitations: ['Test limitation'],
    },
    applicability: () => ({ applicable: true, reason: '' }),
    evaluate: () => true,
    inspect: () => ({ fields: [], readiness: { enabled: true, reason: '', missing: [] } }),
    execute: () => createSolverResultContract({
      moduleId: id, methodId: `${id}-method`, formulaIds: [`${id}-formula`],
      engineeringLevel: ENGINEERING_LEVEL.SCREENING, status: 'PASS', results: { value: 1 },
    }),
  };
}

function completePackage() {
  const engineering = engineeringAttributes();
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1',
    packageHash: 'PHASE5-COMPLETE',
    geometry: {
      objects: [
        pipe('PIPE-1', [0, 0, 0], [6000, 0, 0], engineering),
        pipe('PIPE-2', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-100' }),
      ],
      supports: [{
        id: 'SUP-1', name: 'Guide Support', type: 'GUIDE',
        sourcePath: '/AREA-A/LINE-100/SUP-1',
        sourceAttributes: { PIPE_ID: 'PIPE-1', LINE_NO: 'LINE-100' },
        nativeParams: { center: [3000, 0, 0] },
      }],
      branches: [],
    },
  };
}

function incompletePackage() {
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1',
    packageHash: 'PHASE5-INCOMPLETE',
    geometry: {
      objects: [pipe('PIPE-INCOMPLETE', [0, 0, 0], [1000, 0, 0], { LINE_NO: 'LINE-X' })],
      supports: [],
      branches: [],
    },
  };
}

function disconnectedPackage() {
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1',
    packageHash: 'PHASE5-DISCONNECTED',
    geometry: {
      objects: [
        pipe('PIPE-D1', [0, 0, 0], [1000, 0, 0], engineeringAttributes()),
        pipe('PIPE-D2', [5000, 0, 0], [5000, 1000, 0], { LINE_NO: 'LINE-100' }),
      ],
      supports: [],
      branches: [],
    },
  };
}

function engineeringAttributes() {
  return {
    LINE_NO: 'LINE-100',
    PIPE_OD: 168.3,
    WALL_THICKNESS_MM: 7.11,
    MATERIAL_DENSITY_KG_M3: 7850,
    FLUID_DENSITY_OPE_KG_M3: 800,
    FLUID_DENSITY_HYD_KG_M3: 1000,
    INSULATION_THICKNESS_MM: 40,
    INSULATION_DENSITY_KG_M3: 120,
    TEMP_EXP_C1: 200,
    REFERENCE_TEMP_C: 20,
    ALPHA_PER_C: 0.000012,
    E_MPA: 200000,
    SA_MPA: 100,
  };
}

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/AREA-A/LINE-100/${id}`,
    sourceAttributes,
    nativeParams: { startPoint, endPoint },
  };
}
