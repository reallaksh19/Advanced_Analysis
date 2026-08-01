import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPLICATION_NAVIGATION_ORDER_V11,
  APPLICATION_VIEW_STATE_V11_SCHEMA,
  CONSUMER_IDS,
  createApplicationViewStateV11,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistryV11,
  validateApplicationViewStateV11,
  validateWorkspaceConsumerRegistryV11,
} from '../src/core/workspace-consumers/index.js';
import {
  createAdvancedTabBenchmarkRegistry,
  reconcileNavigationAndBenchmarkRegistry,
} from '../src/core/tab-benchmarks/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = createWorkspaceConsumerRegistryV11();
const benchmarkRegistry = createAdvancedTabBenchmarkRegistry();

assert.deepEqual(APPLICATION_NAVIGATION_ORDER_V11, ['WORKSPACE', 'LOAD_CALC', 'LAFEA', 'LFEA']);
assert.deepEqual(registry.consumers.map((row) => row.consumerId), ['LAFEA', 'LFEA', 'LOAD_CALC', 'WORKSPACE']);
assert.equal(validateWorkspaceConsumerRegistryV11(registry).ok, true);
assert.equal(reconcileNavigationAndBenchmarkRegistry(APPLICATION_NAVIGATION_ORDER_V11, benchmarkRegistry).ok, true);

const context = createWorkspaceConsumerContext({
  datasetId: null,
  workspaceVersion: 0,
  selectedEntityId: null,
  contracts: {},
});
const readiness = createWorkspaceConsumerReadinessRegistry(registry, context, { workspaceBooted: true });
const state = createApplicationViewStateV11(readiness, { activeViewId: CONSUMER_IDS.WORKSPACE, version: 0 });
assert.equal(state.schema, APPLICATION_VIEW_STATE_V11_SCHEMA);
assert.equal(state.activeViewId, CONSUMER_IDS.WORKSPACE);
assert.equal(validateApplicationViewStateV11(state).ok, true);

const layoutSource = await readFile(path.join(root, 'src/workspace/workspace-layout.js'), 'utf8');
const viewIds = [...layoutSource.matchAll(/data-application-view="([A-Z_]+)"/g)].map((match) => match[1]);
assert.deepEqual(viewIds, APPLICATION_NAVIGATION_ORDER_V11);
for (const forbidden of ['HOME', 'PCF', 'SKETCHER', 'THREE_D_CALC', 'PIPE_SOLVER', 'LOCAL_FEA', 'REPORTS', 'QA', 'SETTINGS', 'DEBUG']) {
  assert.equal(viewIds.includes(forbidden), false, `${forbidden} must not be mounted by the Advanced shell.`);
}

const shellSource = await readFile(path.join(root, 'src/workspace/application-shell-controller.js'), 'utf8');
for (const forbidden of [
  'home-consumer-controller',
  'pcf-consumer-controller',
  'sketcher-controller',
  'three-d-calc-consumer-controller',
  'pipe-solver-consumer-controller',
  'qa-evidence-controller',
]) {
  assert.equal(shellSource.includes(forbidden), false, `${forbidden} must not be bundled by the Advanced shell.`);
}

const loadCalcViewSource = await readFile(path.join(root, 'src/workspace/load-calc-consumer-view.js'), 'utf8');
const loadCalcTabs = [...loadCalcViewSource.matchAll(/tab\('([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(loadCalcTabs, ['loads', 'preflight', 'project-data', 'masters', 'json-trace']);
const loadCalcControllerSource = await readFile(path.join(root, 'src/workspace/load-calc-consumer-controller.js'), 'utf8');
for (const requiredView of ['empirical-preflight-view.js', 'project-data/project-data-view.js', 'master-data-ui.js', 'json-trace-ui.js', 'topology-edit-3d-view-controller.js']) {
  assert.equal(loadCalcControllerSource.includes(requiredView), true, `Load Calc must mount ${requiredView}.`);
}
const jsonTraceSource = await readFile(path.join(root, 'src/workspace/json-trace-ui.js'), 'utf8');
assert.doesNotMatch(jsonTraceSource, /fixture|fetch\(/iu, 'JSON Trace must not load a fixture or external fallback.');

const removedLegacyPaths = [
  'src/3d-analysis',
  'src/calc-extended',
  'src/components',
  'src/pcf',
  'src/piperack',
  'src/reporting',
  'src/sketcher',
  'src/solvers',
  'src/workspace/pcf-consumer-view.js',
  'src/workspace/pipe-solver-consumer-view.js',
  'src/workspace/sketcher-view.js',
  'src/workspace/three-d-calc-consumer-view.js',
];
for (const relativePath of removedLegacyPaths) {
  assert.equal(await pathExists(path.join(root, relativePath)), false, `${relativePath} must remain absent from Advanced.`);
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const declaredPackages = new Set([
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
]);
for (const packageName of ['react', 'react-dom', 'zustand', 'lucide-react', '@react-three/fiber', '@react-three/drei']) {
  assert.equal(declaredPackages.has(packageName), false, `${packageName} is a removed legacy UI dependency.`);
}

console.log('Advanced four-tab shell and benchmark registry reconciliation passed.');

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
