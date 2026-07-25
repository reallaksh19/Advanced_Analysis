import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { IMPLEMENTATION_STATUS, READINESS_STATES } from '../workspace-consumers/index.js';
import { WORKSPACE_HOME_REVIEW_MODEL_SCHEMA } from './constants.js';
import { validateWorkspaceHomeSource } from './source.js';

export function createWorkspaceHomeReviewModel(source) {
  const validation = validateWorkspaceHomeSource(source);
  if (!validation.ok) throw new TypeError(`Workspace Home source is invalid: ${validation.errors.join(' ')}`);
  const counts = deepFreeze({
    implemented: source.tabs.filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED && row.readinessState === READINESS_STATES.AVAILABLE).length,
    recoveryPending: source.tabs.filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.RECOVERY_PENDING).length,
    blocked: source.tabs.filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED && row.readinessState !== READINESS_STATES.AVAILABLE).length,
    notImplemented: source.tabs.filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.NOT_IMPLEMENTED).length,
  });
  const quickNavigation = deepFreeze(source.tabs.filter((row) => row.consumerId !== 'HOME' && row.available)
    .map((row) => deepFreeze({ consumerId: row.consumerId, label: row.label })));
  const pendingTabs = deepFreeze(source.tabs.filter((row) => row.implementationStatus !== IMPLEMENTATION_STATUS.IMPLEMENTED)
    .map((row) => deepFreeze({ consumerId: row.consumerId, label: row.label, diagnosticCode: row.diagnosticCode, message: row.diagnosticMessage })));
  const names = pendingTabs.map((row) => row.label);
  const base = {
    schema: WORKSPACE_HOME_REVIEW_MODEL_SCHEMA, sourceSemanticHash: source.semanticHash,
    applicationTitle: source.applicationTitle, dataset: deepFreeze({ status: source.datasetStatus, datasetId: source.datasetId }),
    counts, quickNavigation, pendingTabs,
    migrationStatement: names.length ? `${names.join(', ')} remain visible but are not yet migrated to the current runtime.` : 'All recovered application views are implemented in the current runtime.',
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
export function validateWorkspaceHomeReviewModel(value, source) {
  const errors = [];
  try {
    const expected = createWorkspaceHomeReviewModel(source);
    if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Workspace Home review model does not match its source.');
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return deepFreeze({ ok: errors.length === 0, errors });
}
