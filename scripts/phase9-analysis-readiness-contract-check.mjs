import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSolverResultContract, ENGINEERING_LEVEL } from '../src/core/solvers/certification/solverResultContract.js';
import { AnalysisCapabilityRegistry } from '../src/workspace/analysis-capability-registry.js';
import { createDefaultAnalysisCapabilityRegistry } from '../src/workspace/analysis-capabilities.js';
import { AnalysisCoordinator } from '../src/workspace/analysis-coordinator.js';
import { createAnalysisContext } from '../src/workspace/analysis-context.js';
import {
  validateWorkspaceAnalysisReadiness,
  WORKSPACE_ANALYSIS_READINESS_SCHEMA,
  WORKSPACE_QUALIFICATION_STATUS,
} from '../src/workspace/analysis-readiness.js';
import { AnalysisSessionController } from '../src/workspace/analysis-session-controller.js';
import { AnalysisSessionStore } from '../src/workspace/analysis-session-store.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = createDefaultAnalysisCapabilityRegistry();

assertReadyContract();
assertInputRequiredContract();
assertNotApplicableContract();
assertStrictManifestContract();
await assertSessionAndExecutionGates();
await assertSourceGuards();
console.log('Phase 9 workspace analysis readiness contracts passed.');

function assertReadyContract() {
  const state = stateFor(completePackage(), 'PIPE-1', 'ready.json');
  const capabilities = registry.list(createAnalysisContext(state, 'PIPE-1'));
  assert.equal(capabilities.length, 2);
  capabilities.forEach((capability) => {
    const readiness = capability.readiness;
    assert.equal(readiness.schema, WORKSPACE_ANALYSIS_READINESS_SCHEMA);
    assert.equal(validateWorkspaceAnalysisReadiness(readiness).ok, true);
    assert.equal(readiness.applicable, true);
    assert.equal(readiness.readyToReview, true);
    assert.equal(readiness.readyToRun, true);
    assert.equal(readiness.qualificationStatus, WORKSPACE_QUALIFICATION_STATUS.READY);
    assert.ok(readiness.solverId);
    assert.ok(readiness.solverVersion);
    assert.ok(readiness.methodId);
    assert.ok(readiness.methodVersion);
    assert.ok(readiness.codeBasis.length);
    assert.ok(readiness.assumptions.length);
    assert.ok(readiness.limitations.length);
    assert.equal(Object.isFrozen(readiness), true);
    assert.equal(Object.isFrozen(readiness.missingInputs), true);
  });
}

function assertInputRequiredContract() {
  const state = stateFor(incompletePackage(), 'PIPE-INCOMPLETE', 'incomplete.json');
  const capabilities = registry.list(createAnalysisContext(state, 'PIPE-INCOMPLETE'));
  capabilities.forEach((capability) => {
    const readiness = capability.readiness;
    assert.equal(readiness.applicable, true);
    assert.equal(readiness.readyToReview, true);
    assert.equal(readiness.readyToRun, false);
    assert.equal(readiness.qualificationStatus, WORKSPACE_QUALIFICATION_STATUS.INPUT_REQUIRED);
    assert.ok(readiness.missingInputs.length > 0);
    assert.ok(readiness.diagnostics.some((item) => item.code === 'ANALYSIS_INPUT_REQUIRED'));
  });
}

function assertNotApplicableContract() {
  const state = stateFor(nonApplicablePackage(), 'VALVE-1', 'non-applicable.json');
  const capabilities = registry.list(createAnalysisContext(state, 'VALVE-1'));
  capabilities.forEach((capability) => {
    const readiness = capability.readiness;
    assert.equal(readiness.applicable, false);
    assert.equal(readiness.readyToReview, false);
    assert.equal(readiness.readyToRun, false);
    assert.equal(readiness.qualificationStatus, WORKSPACE_QUALIFICATION_STATUS.NOT_APPLICABLE);
    assert.ok(readiness.applicabilityReason);
    assert.equal(readiness.diagnostics[0].code, 'CAPABILITY_NOT_APPLICABLE');
  });
}

function assertStrictManifestContract() {
  const strict = new AnalysisCapabilityRegistry();
  assert.throws(() => strict.register({
    id: 'missing-manifest', label: 'Missing manifest', applicability: () => true,
    evaluate: () => true, execute: () => ({}),
  }), /solver manifest/);
  assert.throws(() => strict.register({
    ...testCapability('empty-basis'),
    manifest: { ...testCapability('empty-basis').manifest, codeBasis: [] },
  }), /non-empty array/);
  strict.register(testCapability('strict-test'));
  assert.throws(() => strict.register(testCapability('strict-test')), /already registered/);
}

async function assertSessionAndExecutionGates() {
  const nonApplicableState = stateFor(nonApplicablePackage(), 'VALVE-1', 'no-session.json');
  const nonApplicableStore = new AnalysisSessionStore();
  const nonApplicableController = new AnalysisSessionController(EventBus, nonApplicableState, registry, nonApplicableStore);
  nonApplicableController.init();
  EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OPEN_REQUESTED, {
    analysisType: 'pipe-screening', targetId: 'VALVE-1',
  });
  assert.equal(nonApplicableStore.getSnapshot().session, null);
  nonApplicableController.destroy();

  const state = stateFor(completePackage(), 'PIPE-1', 'execution.json');
  const store = new AnalysisSessionStore();
  const sessionController = new AnalysisSessionController(EventBus, state, registry, store);
  const coordinator = new AnalysisCoordinator(EventBus, state, registry, store);
  const failures = [];
  const completions = [];
  const unsubscribeFailure = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_FAILED, (payload) => failures.push(payload));
  const unsubscribeComplete = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_COMPLETED, (payload) => completions.push(payload));
  sessionController.init();
  coordinator.init();
  EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, { entityId: 'PIPE-1', type: 'pipe', source: 'api', properties: {} });

  EventBus.publish(EVENT_TOPICS.ANALYSIS_REQUESTED, { analysisType: 'support-load', targetId: 'PIPE-1' });
  await tick();
  assert.equal(failures.at(-1).code, 'UNREVIEWED_ANALYSIS_SESSION');

  EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_OPEN_REQUESTED, {
    analysisType: 'support-load', targetId: 'PIPE-1',
  });
  const session = store.getSnapshot().session;
  assert.equal(session.status, 'ready');
  assert.equal(session.workspaceReadiness.readyToRun, true);
  assert.equal(session.workspaceReadiness.solverId, 'workspace-support-load-screening');
  EventBus.publish(EVENT_TOPICS.ANALYSIS_REQUESTED, {
    analysisType: 'support-load', targetId: 'PIPE-1', sessionId: session.sessionId,
  });
  await tick();
  assert.equal(completions.length, 1);
  assert.equal(completions[0].result.status, 'CALCULATED');

  coordinator.destroy();
  sessionController.destroy();
  unsubscribeFailure();
  unsubscribeComplete();
  assert.equal(EventBus.listenerCount(EVENT_TOPICS.ANALYSIS_REQUESTED), 0);
  assert.equal(EventBus.listenerCount(EVENT_TOPICS.ANALYSIS_SESSION_OPEN_REQUESTED), 0);
}

async function assertSourceGuards() {
  const workspaceDir = path.join(root, 'src/workspace');
  const modules = (await readdir(workspaceDir)).filter((name) => name.endsWith('.js'));
  for (const name of modules) {
    const source = await readFile(path.join(workspaceDir, name), 'utf8');
    const lineCount = source.split(/\r?\n/).length;
    assert.ok(lineCount <= 300, `src/workspace/${name} exceeds 300 lines (${lineCount}).`);
    assert.doesNotMatch(source, /from ['"](?:zustand|react|react-dom)/, `${name} imports UI framework state.`);
    assert.doesNotMatch(source, /(?:Date\.now|performance\.now|Math\.random)/, `${name} is non-deterministic.`);
  }
  const panel = await readFile(path.join(workspaceDir, 'properties-panel.js'), 'utf8');
  assert.doesNotMatch(panel, /(?:solver|support-load|capability-registry|analysis-session-store)/);
  const readinessView = await readFile(path.join(workspaceDir, 'analysis-readiness-view.js'), 'utf8');
  assert.doesNotMatch(readinessView, /(?:support-load-capability|pipe-screening-capability|analysis-capability-registry)/);
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
    evaluate: () => ({ enabled: true, reason: '', missing: [] }),
    inspect: () => ({ fields: [], readiness: { enabled: true, reason: '', missing: [] } }),
    execute: () => createSolverResultContract({
      moduleId: id, methodId: `${id}-method`, formulaIds: [`${id}-formula`],
      engineeringLevel: ENGINEERING_LEVEL.SCREENING, status: 'PASS', results: { value: 1 },
    }),
  };
}

function stateFor(raw, entityId, sourceName) {
  const state = new WorkspaceStateStore();
  state.loadDataset(normalizeWorkspaceDataset(raw, sourceName));
  state.selectEntity(entityId);
  return state;
}

function completePackage() {
  const engineering = {
    LINE_NO: 'LINE-900', PIPE_OD: 168.3, WALL_THICKNESS_MM: 7.11,
    MATERIAL_DENSITY_KG_M3: 7850, FLUID_DENSITY_OPE_KG_M3: 800,
    FLUID_DENSITY_HYD_KG_M3: 1000, INSULATION_THICKNESS_MM: 40,
    INSULATION_DENSITY_KG_M3: 120, TEMP_EXP_C1: 200, REFERENCE_TEMP_C: 20,
    ALPHA_PER_C: 0.000012, E_MPA: 200000, SA_MPA: 100,
  };
  return workspacePackage('PHASE9-READY', [
    pipe('PIPE-1', [0, 0, 0], [6000, 0, 0], engineering),
    pipe('PIPE-2', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-900' }),
  ], []);
}

function incompletePackage() {
  return workspacePackage('PHASE9-INCOMPLETE', [
    pipe('PIPE-INCOMPLETE', [0, 0, 0], [1000, 0, 0], { LINE_NO: 'LINE-X' }),
  ], []);
}

function nonApplicablePackage() {
  return workspacePackage('PHASE9-NOT-APPLICABLE', [{
    id: 'VALVE-1', name: 'Valve 1', type: 'VALVE', sourcePath: '/AREA/V/VALVE-1',
    nativeParams: { center: [0, 0, 0] }, sourceAttributes: {},
  }], []);
}

function workspacePackage(packageHash, objects, supports) {
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1', packageHash,
    geometry: { objects, supports, branches: [] },
  };
}

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id, name: id, type: 'PIPE', sourcePath: `/AREA/LINE/${id}`,
    sourceAttributes, nativeParams: { startPoint, endPoint },
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
