import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import { checkCanonicalTopology } from '../topology-edit-checker.js';
import { assertTopologyEditOperationPlan } from './topology-edit-operation-plan.js';
import {
  compareTopologyEditDiagnostics,
  mergeTopologyEditIncrementalDiagnostics,
  topologyEditDiagnosticsHash,
} from './topology-edit-validation-diagnostics.js';
import {
  projectTopologyEditValidationScope,
  topologyEditValidationScopeIds,
} from './topology-edit-validation-scope.js';

export const TOPOLOGY_EDIT_INCREMENTAL_VALIDATION_SCHEMA =
  'TopologyEditIncrementalValidationReceipt.v1';

export function runTopologyEditIncrementalValidation(input = {}) {
  const canonical = assertCanonical(input.canonicalTopology);
  const plan = assertTopologyEditOperationPlan(input.operationPlan);
  const previousDiagnostics = diagnosticRows(
    input.previousDiagnostics,
    'previousDiagnostics',
  );
  const checker = input.checker ?? checkCanonicalTopology;
  if (typeof checker !== 'function') fail('checker must be a function.');
  const now = input.now;
  if (typeof now !== 'function') fail('now must be an injected monotonic clock function.');
  const policy = performancePolicy(input.performancePolicy);
  const checkerOptions = isPlainRecord(input.checkerOptions)
    ? input.checkerOptions
    : {};
  const totalStart = readNow(now);

  const projectionStage = measured(now, () => (
    projectTopologyEditValidationScope(canonical, plan.changedScope)
  ));
  const projection = projectionStage.value;
  const scopeIds = topologyEditValidationScopeIds(projection);

  const incrementalStage = measured(now, () => diagnosticRows(
    checker(projection.canonical, checkerOptions),
    'incrementalDiagnostics',
  ));
  const candidateStage = measured(now, () => mergeTopologyEditIncrementalDiagnostics(
    previousDiagnostics,
    incrementalStage.value,
    scopeIds,
  ));
  const fullStage = measured(now, () => diagnosticRows(
    checker(canonical, checkerOptions),
    'fullDiagnostics',
  ));
  const comparisonStage = measured(now, () => compareTopologyEditDiagnostics(
    candidateStage.value,
    fullStage.value,
  ));
  const comparison = comparisonStage.value;
  const status = comparison.equivalent
    ? 'INCREMENTAL_EQUIVALENT'
    : 'FULL_FALLBACK';
  const finalDiagnostics = comparison.equivalent
    ? candidateStage.value
    : fullStage.value;
  const totalEnd = readNow(now);
  if (totalEnd < totalStart) fail('clock moved backwards during validation.', RangeError);

  const authority = {
    schema: TOPOLOGY_EDIT_INCREMENTAL_VALIDATION_SCHEMA,
    status,
    priorBasisHash: plan.basisHash,
    validatedTopologyHash: canonical.canonicalTopologyHash,
    planHash: plan.planHash,
    changedScopeHash: plan.changedScope.changedScopeHash,
    catalogueCompatibility: catalogueEvidence(plan),
    validationScope: {
      projectionHash: projection.projectionHash,
      ids: projection.ids,
    },
    incremental: {
      issueCount: incrementalStage.value.length,
      issueHash: topologyEditDiagnosticsHash(incrementalStage.value),
    },
    candidate: {
      issueCount: candidateStage.value.length,
      issueHash: comparison.leftHash,
    },
    full: {
      issueCount: fullStage.value.length,
      issueHash: comparison.rightHash,
    },
    equivalence: comparison.equivalent,
    fallback: comparison.equivalent ? null : {
      code: 'INCREMENTAL_FULL_MISMATCH',
      message: 'Scoped validation differed from full checker authority.',
    },
    finalIssueCount: finalDiagnostics.length,
    finalIssueHash: topologyEditDiagnosticsHash(finalDiagnostics),
  };
  const performanceEvidence = performanceRecord({
    policy,
    status,
    projectionMs: projectionStage.durationMs,
    incrementalCheckerMs: incrementalStage.durationMs,
    candidateAssemblyMs: candidateStage.durationMs,
    fullCheckerMs: fullStage.durationMs,
    equivalenceMs: comparisonStage.durationMs,
    totalMs: totalEnd - totalStart,
  });
  return deepFreeze({
    ...authority,
    validationHash: semanticHash(authority),
    performanceEvidence,
    finalDiagnostics: cloneJson(finalDiagnostics),
  });
}

export function assertTopologyEditIncrementalValidationReceipt(value) {
  if (!isPlainRecord(value)) fail('receipt must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_INCREMENTAL_VALIDATION_SCHEMA) {
    fail(`receipt must use ${TOPOLOGY_EDIT_INCREMENTAL_VALIDATION_SCHEMA}.`);
  }
  const authority = authorityMaterial(value);
  if (value.validationHash !== semanticHash(authority)) {
    fail('validation hash does not match semantic authority.', RangeError);
  }
  if (value.finalIssueHash !== topologyEditDiagnosticsHash(value.finalDiagnostics)) {
    fail('final diagnostics differ from receipt authority.', RangeError);
  }
  if (value.finalIssueCount !== value.finalDiagnostics?.length) {
    fail('final issue count differs from final diagnostics.', RangeError);
  }
  const performance = performanceRecord({
    policy: value.performanceEvidence?.policy,
    status: value.status,
    ...value.performanceEvidence?.timings,
  });
  if (semanticHash(performance) !== semanticHash(value.performanceEvidence)) {
    fail('performance evidence is internally inconsistent.', RangeError);
  }
  return value;
}

function authorityMaterial(value) {
  return {
    schema: value.schema,
    status: value.status,
    priorBasisHash: value.priorBasisHash,
    validatedTopologyHash: value.validatedTopologyHash,
    planHash: value.planHash,
    changedScopeHash: value.changedScopeHash,
    catalogueCompatibility: value.catalogueCompatibility,
    validationScope: value.validationScope,
    incremental: value.incremental,
    candidate: value.candidate,
    full: value.full,
    equivalence: value.equivalence,
    fallback: value.fallback,
    finalIssueCount: value.finalIssueCount,
    finalIssueHash: value.finalIssueHash,
  };
}

function performanceRecord(input) {
  const policy = performancePolicy(input.policy);
  const timings = {
    projectionMs: nonNegative(input.projectionMs, 'projectionMs'),
    incrementalCheckerMs: nonNegative(
      input.incrementalCheckerMs,
      'incrementalCheckerMs',
    ),
    candidateAssemblyMs: nonNegative(
      input.candidateAssemblyMs,
      'candidateAssemblyMs',
    ),
    fullCheckerMs: nonNegative(input.fullCheckerMs, 'fullCheckerMs'),
    equivalenceMs: nonNegative(input.equivalenceMs, 'equivalenceMs'),
    totalMs: nonNegative(input.totalMs, 'totalMs'),
  };
  const incrementalPathMs = timings.projectionMs
    + timings.incrementalCheckerMs
    + timings.candidateAssemblyMs;
  const classification = input.status === 'FULL_FALLBACK'
    ? 'FULL_FALLBACK'
    : incrementalPathMs <= policy.fastPathBudgetMs
      ? 'FAST_PATH'
      : incrementalPathMs <= policy.fastPathBudgetMs + policy.hysteresisMs
        ? 'FAST_PATH_HYSTERESIS'
        : incrementalPathMs <= policy.warningBudgetMs
          ? 'SLOW_PATH'
          : 'OVER_BUDGET';
  return deepFreeze({
    policy,
    timings,
    incrementalPathMs,
    classification,
  });
}

function performancePolicy(value) {
  if (!isPlainRecord(value)) fail('performancePolicy must be an object.');
  const fastPathBudgetMs = positive(
    value.fastPathBudgetMs,
    'performancePolicy.fastPathBudgetMs',
  );
  const warningBudgetMs = positive(
    value.warningBudgetMs,
    'performancePolicy.warningBudgetMs',
  );
  const hysteresisMs = nonNegative(
    value.hysteresisMs,
    'performancePolicy.hysteresisMs',
  );
  if (warningBudgetMs < fastPathBudgetMs) {
    fail('warningBudgetMs must be at least fastPathBudgetMs.', RangeError);
  }
  return deepFreeze({ fastPathBudgetMs, warningBudgetMs, hysteresisMs });
}

function catalogueEvidence(plan) {
  const compatibility = plan.parameters.catalogueCompatibility;
  if (isPlainRecord(compatibility)) return cloneJson(compatibility);
  const blocker = plan.unresolvedEvidence.find((row) => row.code.startsWith('CATALOGUE_'));
  return blocker
    ? { status: blocker.status, selectedRecordId: null }
    : { status: 'NOT_REQUIRED', selectedRecordId: null };
}

function measured(now, operation) {
  const start = readNow(now);
  const value = operation();
  const end = readNow(now);
  if (end < start) fail('clock moved backwards during a validation stage.', RangeError);
  return { value, durationMs: end - start };
}
function readNow(now) {
  const value = Number(now());
  if (!Number.isFinite(value)) fail('clock must return a finite number.', RangeError);
  return value;
}
function assertCanonical(value) {
  if (!isPlainRecord(value)) fail('canonicalTopology must be an object.');
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('canonicalTopology nodes and edges must be arrays.');
  }
  requiredText(value.canonicalTopologyHash, 'canonicalTopology.canonicalTopologyHash');
  return value;
}
function diagnosticRows(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  value.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`${label}[${index}] must be an object.`);
  });
  return value;
}
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be positive.`, RangeError);
  return number;
}
function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${label} must be non-negative.`, RangeError);
  return number;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditIncrementalValidation: ${message}`);
}
