import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';

export const DIMENSION_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  MISSING: 'MISSING',
  CONFLICTING: 'CONFLICTING',
});

export function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function readPath(record, path) {
  let value = record;
  for (const key of path) {
    if (!value || typeof value !== 'object') return undefined;
    value = value[key];
  }
  return value;
}

export function candidate(value, authority, evidenceId, priority, ruleId = null) {
  const normalized = finitePositive(value);
  return normalized === null ? null : Object.freeze({
    valueMm: normalized,
    authority,
    evidenceId: stringValue(evidenceId) || `${authority}:${normalized}`,
    priority,
    ruleId,
  });
}

export function explicitCandidates(evidence, definitions) {
  const rows = [];
  for (const definition of definitions) {
    const value = readPath(evidence, definition.path);
    const row = candidate(
      value,
      definition.authority,
      readPath(evidence, definition.evidencePath || ['sourceEvidenceId']) || definition.label,
      definition.priority,
      definition.ruleId,
    );
    if (row) rows.push(row);
  }
  return rows;
}

function conflictDiagnostic(dimension, rows) {
  return Object.freeze({
    code: `${dimension.toUpperCase()}_CONFLICTING`,
    severity: 'ERROR',
    message: `Equal-precedence ${dimension} evidence conflicts.`,
    evidenceIds: Object.freeze(rows.map((row) => row.evidenceId).sort()),
    valuesMm: Object.freeze(rows.map((row) => row.valueMm).sort((a, b) => a - b)),
  });
}

function missingDiagnostic(dimension, context) {
  return Object.freeze({
    code: `${dimension.toUpperCase()}_MISSING`,
    severity: 'ERROR',
    message: `No authoritative ${dimension} evidence is available.`,
    canonicalEntityId: stringValue(context?.canonicalEntityId),
    evidenceIds: Object.freeze([]),
  });
}

export function resolveCandidates(dimension, candidates, toleranceMm, context) {
  if (!candidates.length) {
    return deepFreeze({
      status: DIMENSION_STATUS.MISSING,
      valueMm: null,
      authority: null,
      ruleId: null,
      sourceEvidenceIds: [],
      diagnostics: [missingDiagnostic(dimension, context)],
    });
  }

  const bestPriority = Math.min(...candidates.map((row) => row.priority));
  const best = candidates.filter((row) => row.priority === bestPriority);
  const reference = best[0].valueMm;
  const conflicting = best.filter((row) => Math.abs(row.valueMm - reference) > toleranceMm);

  if (conflicting.length) {
    return deepFreeze({
      status: DIMENSION_STATUS.CONFLICTING,
      valueMm: null,
      authority: null,
      ruleId: null,
      sourceEvidenceIds: best.map((row) => row.evidenceId).sort(),
      diagnostics: [conflictDiagnostic(dimension, best)],
    });
  }

  const winner = [...best].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId) || left.valueMm - right.valueMm
  )[0];

  return deepFreeze({
    status: DIMENSION_STATUS.RESOLVED,
    valueMm: winner.valueMm,
    authority: winner.authority,
    ruleId: winner.ruleId,
    sourceEvidenceIds: best.map((row) => row.evidenceId).sort(),
    diagnostics: [],
  });
}

export function catalogEntry(catalog, evidence) {
  const reference = stringValue(
    evidence?.catalogRef || evidence?.specRef || evidence?.componentClass || evidence?.lineClass,
  );
  return reference && catalog && typeof catalog === 'object' ? catalog[reference] || null : null;
}
