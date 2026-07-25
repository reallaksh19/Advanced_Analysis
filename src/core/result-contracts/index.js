/**
 * Standard engineering result helpers.
 */

export function makeEngineeringResult({
  moduleId,
  methodId,
  formulaIds,
  unitSystem,
  inputs,
  outputs,
  status,
  diagnostics = [],
  benchmarkCaseIds = []
}) {
  const missing = [];
  for (const [key, value] of Object.entries({ moduleId, methodId, formulaIds, unitSystem, inputs, outputs, status })) {
    if (value === undefined || value === null) missing.push(key);
  }
  if (missing.length) {
    throw new Error(`makeEngineeringResult missing required field(s): ${missing.join(', ')}`);
  }
  if (!Array.isArray(formulaIds) || formulaIds.length === 0) {
    throw new Error('makeEngineeringResult requires a non-empty formulaIds array.');
  }
  return {
    schemaVersion: 'engineering-result-v1',
    moduleId,
    methodId,
    formulaIds,
    unitSystem,
    inputs,
    outputs,
    status,
    diagnostics,
    benchmarkCaseIds
  };
}
