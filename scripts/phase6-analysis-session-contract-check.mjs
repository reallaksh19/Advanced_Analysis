import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSolverResultContract } from '../src/core/solvers/certification/solverResultContract.js';
import { createDefaultAnalysisCapabilityRegistry } from '../src/workspace/analysis-capabilities.js';
import { AnalysisCoordinator } from '../src/workspace/analysis-coordinator.js';
import { createAnalysisContext } from '../src/workspace/analysis-context.js';
import { AnalysisSessionController } from '../src/workspace/analysis-session-controller.js';
import { withAnalysisSession } from '../src/workspace/analysis-session-context.js';
import { AnalysisSessionStore, ANALYSIS_SESSION_SCHEMA } from '../src/workspace/analysis-session-store.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = createDefaultAnalysisCapabilityRegistry();

await assertSessionStoreContract();
await assertSupportLoadOverrideContract();
await assertPipeScreeningOverrideContract();
await assertCoordinatorSessionGuards();
await assertSourceGuards();
console.log('Phase 6 analysis session contracts passed.');

async function assertSessionStoreContract() {
  const store = new AnalysisSessionStore();
  const inspection = Object.freeze({
    fields: Object.freeze([{ key: 'x', label: 'X', unit: 'mm', kind: 'number', required: true, editable: true, value: null, source: 'missing', sourcePath: '', validation: 'positive' }]),
    readiness: Object.freeze({ enabled: false, reason: 'Missing x.', missing: Object.freeze(['x']) }),
  });
  const first = store.open({
    targetId: 'PIPE-1', analysisType: 'test', datasetId: 'DATASET-1', workspaceVersion: 1, inspection,
  });
  assert.equal(first.schema, ANALYSIS_SESSION_SCHEMA);
  assert.equal(first.sessionId, 'analysis-session-1');
  assert.equal(first.version, 1);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.inputs), true);
  assert.throws(() => { first.overrides.x = 2; }, TypeError);
  store.clear();
  const second = store.open({
    targetId: 'PIPE-1', analysisType: 'test', datasetId: 'DATASET-1', workspaceVersion: 1, inspection,
  });
  assert.equal(second.sessionId, 'analysis-session-2');
}

async function assertSupportLoadOverrideContract() {
  const state = new WorkspaceStateStore();
  const dataset = normalizeWorkspaceDataset(incompleteSupportPackage(), 'phase6-support.json');
  state.loadDataset(dataset);
  state.selectEntity('PIPE-SUPPORT');
  const before = JSON.stringify(dataset);
  const store = new AnalysisSessionStore();
  const controller = new AnalysisSessionController(EventBus, state, registry, store);
  controller.init();

  EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OPEN_REQUESTED, {
    analysisType: 'support-load', targetId: 'PIPE-SUPPORT',
  });
  let session = store.getSnapshot().session;
  assert.equal(session.status, 'draft');
  assert.ok(session.inputs.some((field) => field.source === 'derived'));
  assert.ok(session.inputs.some((field) => field.source === 'missing'));

  EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OVERRIDE_REQUESTED, {
    sessionId: session.sessionId, fieldKey: 'pipeOdMm', value: '-10',
  });
  session = store.getSnapshot().session;
  assert.match(session.fieldErrors.pipeOdMm, /greater than zero/);
  assert.equal(Object.hasOwn(session.overrides, 'pipeOdMm'), false);

  const overrides = {
    pipeOdMm: 168.3,
    wallThicknessMm: 7.11,
    unitPipeWtKgPerM: 28.3,
    fluidWtOpeKgPerM: 13.9,
    fluidWtHydKgPerM: 17.4,
    insulationThicknessMm: 40,
    insulationDensityKgM3: 120,
    tempExpC1: 200,
  };
  for (const [fieldKey, value] of Object.entries(overrides)) {
    EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OVERRIDE_REQUESTED, {
      sessionId: session.sessionId, fieldKey, value,
    });
    session = store.getSnapshot().session;
  }
  assert.equal(session.readiness.enabled, true);
  assert.equal(session.inputs.find((field) => field.key === 'pipeOdMm').source, 'override');
  assert.equal(JSON.stringify(dataset), before, 'Reviewed overrides mutated the normalized dataset.');

  const context = withAnalysisSession(createAnalysisContext(state, 'PIPE-SUPPORT'), session);
  const result = await registry.execute('support-load', context);
  assert.equal(validateSolverResultContract(result).ok, true);
  assert.equal(result.status, 'CALCULATED');
  assert.equal(result.meta.analysisSessionId, session.sessionId);

  EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_RESET_REQUESTED, { sessionId: session.sessionId });
  session = store.getSnapshot().session;
  assert.deepEqual(session.overrides, {});
  assert.equal(session.status, 'draft');
  controller.destroy();
  assert.equal(EventBus.listenerCount(EVENT_TOPICS.ANALYSIS_SESSION_OVERRIDE_REQUESTED), 0);
}

async function assertPipeScreeningOverrideContract() {
  const state = new WorkspaceStateStore();
  state.loadDataset(normalizeWorkspaceDataset(incompleteScreeningPackage(), 'phase6-screening.json'));
  state.selectEntity('PIPE-A');
  const store = new AnalysisSessionStore();
  const controller = new AnalysisSessionController(EventBus, state, registry, store);
  controller.init();
  EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OPEN_REQUESTED, {
    analysisType: 'pipe-screening', targetId: 'PIPE-A',
  });
  let session = store.getSnapshot().session;
  assert.equal(session.inputs.find((field) => field.key === 'connectedLineSegments').value, 2);
  for (const [fieldKey, value] of Object.entries({
    deltaT: 180, alpha: 0.000012, E: 200000, od: 168.3, Sa: 100,
  })) {
    EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OVERRIDE_REQUESTED, {
      sessionId: session.sessionId, fieldKey, value,
    });
    session = store.getSnapshot().session;
  }
  assert.equal(session.readiness.enabled, true);
  const result = await registry.execute(
    'pipe-screening',
    withAnalysisSession(createAnalysisContext(state, 'PIPE-A'), session),
  );
  assert.equal(validateSolverResultContract(result).ok, true);
  assert.equal(result.meta.sourceEntityIds.length, 2);
  assert.equal(result.meta.analysisSessionId, session.sessionId);
  controller.destroy();
}

async function assertCoordinatorSessionGuards() {
  const state = new WorkspaceStateStore();
  state.loadDataset(normalizeWorkspaceDataset(incompleteScreeningPackage(), 'phase6-guard.json'));
  state.selectEntity('PIPE-A');
  const store = new AnalysisSessionStore();
  const context = createAnalysisContext(state, 'PIPE-A');
  const inspection = registry.inspect('pipe-screening', context);
  const session = store.open({
    targetId: 'PIPE-A', analysisType: 'pipe-screening', datasetId: context.dataset.datasetId,
    workspaceVersion: context.version, inspection,
  });
  const coordinator = new AnalysisCoordinator(EventBus, state, registry, store);
  const failures = [];
  const unsubscribe = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_FAILED, (payload) => failures.push(payload));
  coordinator.init();
  EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
    entityId: 'PIPE-A', type: 'pipe', properties: {}, source: 'api',
  });
  EventBus.publish(EVENT_TOPICS.ANALYSIS_REQUESTED, {
    analysisType: 'support-load', targetId: 'PIPE-A', sessionId: session.sessionId,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(failures[0].code, 'ANALYSIS_SESSION_CAPABILITY_MISMATCH');
  coordinator.destroy();
  unsubscribe();
}

async function assertSourceGuards() {
  const modules = [
    'src/workspace/analysis-input-evidence.js',
    'src/workspace/analysis-session-store.js',
    'src/workspace/analysis-session-context.js',
    'src/workspace/analysis-session-controller.js',
    'src/workspace/analysis-session-view.js',
    'src/workspace/analysis-capability-registry.js',
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
  const panel = await readFile(path.join(root, 'src/workspace/properties-panel.js'), 'utf8');
  assert.doesNotMatch(panel, /(?:solver|support-load|capability-registry|analysis-session-store)/);
  assert.doesNotMatch(panel, /document\.(querySelector|getElementById)/);
}

function incompleteSupportPackage() {
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1',
    packageHash: 'PHASE6-SUPPORT',
    geometry: {
      objects: [pipe('PIPE-SUPPORT', [0, 0, 0], [5000, 0, 0], { LINE_NO: 'LINE-S' })],
      supports: [], branches: [],
    },
  };
}

function incompleteScreeningPackage() {
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1',
    packageHash: 'PHASE6-SCREENING',
    geometry: {
      objects: [
        pipe('PIPE-A', [0, 0, 0], [6000, 0, 0], { LINE_NO: 'LINE-P' }),
        pipe('PIPE-B', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-P' }),
      ],
      supports: [], branches: [],
    },
  };
}

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id, name: id, type: 'PIPE', sourcePath: `/AREA/LINE/${id}`,
    sourceAttributes, nativeParams: { startPoint, endPoint },
  };
}
