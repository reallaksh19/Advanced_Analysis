export const SOLVER_RESULT_SCHEMA_VERSION = 'solver-result-contract-v1';

export const ENGINEERING_LEVEL = Object.freeze({
  MOCK: 'MOCK',
  SCREENING: 'SCREENING',
  BENCHMARKED_SCREENING: 'BENCHMARKED_SCREENING',
  CERTIFIED: 'CERTIFIED',
});

const DEFAULT_UNIT_SYSTEM = Object.freeze({
  length: 'project-default',
  force: 'project-default',
  stress: 'project-default',
  moment: 'project-default',
});

function normalizeFormulaIds(formulaIds) {
  if (Array.isArray(formulaIds)) return formulaIds.map(String).filter(Boolean);
  if (formulaIds) return [String(formulaIds)];
  return [];
}

function normalizeDiagnostics(diagnostics = []) {
  return diagnostics.map((item) => ({
    severity: item.severity || 'info',
    code: item.code || 'SOLVER_DIAGNOSTIC',
    message: item.message || String(item.code || 'Solver diagnostic.'),
    data: item.data || {},
  }));
}

export function createSolverResultContract({
  moduleId,
  methodId,
  formulaIds,
  unitSystem = DEFAULT_UNIT_SYSTEM,
  settingsHash = null,
  dataStatus = null,
  engineeringLevel = ENGINEERING_LEVEL.SCREENING,
  status = 'UNKNOWN',
  input = {},
  results = {},
  diagnostics = [],
  warnings = [],
  formulaTrace = [],
  meta = {},
  summary = {},
} = {}) {
  const normalizedFormulaIds = normalizeFormulaIds(formulaIds);
  const normalizedDiagnostics = normalizeDiagnostics(diagnostics);
  const normalizedWarnings = warnings
    .map((item) => typeof item === 'string' ? item : item?.message)
    .filter(Boolean);

  return Object.freeze({
    schemaVersion: SOLVER_RESULT_SCHEMA_VERSION,
    moduleId: moduleId || 'unknown-module',
    methodId: methodId || 'UNKNOWN_METHOD',
    formulaIds: normalizedFormulaIds.length ? normalizedFormulaIds : ['UNSPECIFIED_FORMULA'],
    unitSystem,
    settingsHash,
    dataStatus,
    engineeringLevel,
    status,
    input,
    results,
    diagnostics: normalizedDiagnostics,
    warnings: normalizedWarnings,
    formulaTrace: Array.isArray(formulaTrace) ? formulaTrace : [],
    meta,
    summary: {
      status,
      engineeringLevel,
      methodId: methodId || 'UNKNOWN_METHOD',
      formulaCount: normalizedFormulaIds.length || 1,
      warningCount: normalizedWarnings.length,
      diagnosticCount: normalizedDiagnostics.length,
      ...(summary || {}),
    },
  });
}

export function validateSolverResultContract(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['Result is not an object.'] };
  }
  if (result.schemaVersion !== SOLVER_RESULT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SOLVER_RESULT_SCHEMA_VERSION}.`);
  }
  if (!result.moduleId) errors.push('moduleId missing.');
  if (!result.methodId) errors.push('methodId missing.');
  if (!Array.isArray(result.formulaIds) || result.formulaIds.length === 0) {
    errors.push('formulaIds must be a non-empty array.');
  }
  if (!result.unitSystem) errors.push('unitSystem missing.');
  if (!result.engineeringLevel || !Object.values(ENGINEERING_LEVEL).includes(result.engineeringLevel)) {
    errors.push('engineeringLevel invalid or missing.');
  }
  if (!result.status) errors.push('status missing.');
  if (!('results' in result)) errors.push('results missing.');
  if (!Array.isArray(result.diagnostics)) errors.push('diagnostics must be an array.');
  if (!Array.isArray(result.warnings)) errors.push('warnings must be an array.');
  if (!Array.isArray(result.formulaTrace)) errors.push('formulaTrace must be an array.');
  return { ok: errors.length === 0, errors };
}

export function unwrapSolverResults(result) {
  if (result?.schemaVersion === SOLVER_RESULT_SCHEMA_VERSION) return result.results;
  return result;
}
