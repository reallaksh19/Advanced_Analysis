import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { APPLICATION_NAVIGATION_ORDER_V11 } from '../workspace-consumers/index.js';
import {
  ADVANCED_ANALYSIS_APP_ID,
  TAB_BENCHMARK_REGISTRY_SCHEMA,
} from './constants.js';

const CASES = Object.freeze({
  WORKSPACE: Object.freeze([
    benchmarkCase('workspace-real-project-import', 'DATASET_IMPORT', 'REAL_PROJECT'),
    benchmarkCase('workspace-schema-rejection', 'SCHEMA_REJECTION', 'REGRESSION'),
    benchmarkCase('workspace-topology-invariance', 'TOPOLOGY_INVARIANCE', '[SIMULATED]'),
    benchmarkCase('workspace-selection-export-reimport', 'STATE_AND_ROUND_TRIP', '[SIMULATED]'),
    benchmarkCase('workspace-browser-workflow', 'BROWSER_WORKFLOW', '[SIMULATED]'),
  ]),
  LOAD_CALC: Object.freeze([
    benchmarkCase('load-empty-ope-hyd', 'WEIGHT_CASES', 'ANALYTICAL'),
    benchmarkCase('load-contributions-and-blockers', 'LOAD_CONTRIBUTIONS', '[SIMULATED]'),
    benchmarkCase('load-force-balance-and-reactions', 'FORCE_BALANCE', 'ANALYTICAL'),
    benchmarkCase('load-workspace-contract-propagation', 'CONTRACT_PROPAGATION', 'REGRESSION'),
    benchmarkCase('load-browser-workflow', 'BROWSER_WORKFLOW', '[SIMULATED]'),
  ]),
  LAFEA: Object.freeze([
    benchmarkCase('lafea-stage-1-foundation', 'LAFEA_1', 'ANALYTICAL'),
    benchmarkCase('lafea-stage-2-screening', 'LAFEA_2', 'ANALYTICAL'),
    benchmarkCase('lafea-stage-3-continuum', 'LAFEA_3', 'ANALYTICAL'),
    benchmarkCase('lafea-stage-4-shell', 'LAFEA_4', 'ANALYTICAL'),
    benchmarkCase('lafea-stage-5-trunnion', 'LAFEA_5', 'ANALYTICAL'),
    benchmarkCase('lafea-editor-kernel-workflow', 'EDITOR_TO_KERNEL', '[SIMULATED]'),
    benchmarkCase('lafea-browser-workflow', 'BROWSER_WORKFLOW', '[SIMULATED]'),
  ]),
  LFEA: Object.freeze([
    benchmarkCase('lfea-t3-q4-patch', 'PATCH_TESTS', 'ANALYTICAL'),
    benchmarkCase('lfea-dense-sparse-parity', 'SOLVER_PARITY', 'ANALYTICAL'),
    benchmarkCase('lfea-equilibrium-convergence', 'EQUILIBRIUM_AND_CONVERGENCE', 'ANALYTICAL'),
    benchmarkCase('lfea-singular-rejection', 'FAIL_CLOSED', 'REGRESSION'),
    benchmarkCase('lfea-editor-review-export', 'EDITOR_TO_EVIDENCE', '[SIMULATED]'),
    benchmarkCase('lfea-browser-workflow', 'BROWSER_WORKFLOW', '[SIMULATED]'),
  ]),
});

/**
 * Returns the immutable required benchmark registry for all visible tabs.
 *
 * @returns {Readonly<object>} Canonical advanced-tab benchmark registry.
 */
export function createAdvancedTabBenchmarkRegistry() {
  const tabs = APPLICATION_NAVIGATION_ORDER_V11.map((tabId) => ({
    tabId,
    requiredCases: CASES[tabId],
  }));
  const base = {
    schema: TAB_BENCHMARK_REGISTRY_SCHEMA,
    appId: ADVANCED_ANALYSIS_APP_ID,
    tabIds: [...APPLICATION_NAVIGATION_ORDER_V11],
    tabs,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

/**
 * Verifies exact, ordered equality between navigation and qualification tabs.
 *
 * @param {ReadonlyArray<string>} navigationTabIds Visible navigation IDs.
 * @param {Readonly<object>} registry Benchmark registry to reconcile.
 * @returns {Readonly<object>} Reconciliation result with actionable errors.
 */
export function reconcileNavigationAndBenchmarkRegistry(navigationTabIds, registry) {
  const errors = [];
  const registryIds = registry?.tabIds;
  if (!Array.isArray(navigationTabIds) || !Array.isArray(registryIds)) {
    errors.push('Navigation and benchmark tab IDs must be arrays.');
  } else if (JSON.stringify(navigationTabIds) !== JSON.stringify(registryIds)) {
    errors.push(`Navigation/benchmark registry mismatch: ${JSON.stringify(navigationTabIds)} != ${JSON.stringify(registryIds)}.`);
  }
  if (new Set(registryIds || []).size !== (registryIds || []).length) {
    errors.push('Benchmark registry contains duplicate tab IDs.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function benchmarkCase(caseId, category, evidenceBasis) {
  return deepFreeze({ caseId, category, evidenceBasis });
}
