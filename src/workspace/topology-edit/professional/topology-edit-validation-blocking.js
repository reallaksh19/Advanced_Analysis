import {
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import {
  topologyEditDiagnosticTargetIds,
} from './topology-edit-validation-diagnostics.js';

export function assertNoTopologyEditBlockingDiagnostics(
  receipt,
  blockingSeverities = ['HIGH'],
) {
  const blocking = new Set(normalizeSeverities(blockingSeverities));
  const scope = validationScopeIds(receipt?.validationScope?.ids);
  const issue = (receipt?.finalDiagnostics ?? []).find((row) => {
    const severity = stringValue(row?.severity).toUpperCase() || 'UNKNOWN';
    if (!blocking.has(severity)) return false;
    const targetIds = topologyEditDiagnosticTargetIds(row);
    return targetIds.length === 0 || targetIds.some((id) => scope.has(id));
  });
  if (issue) {
    throw new RangeError(
      `TopologyEditValidationBlocking: validation contains in-scope blocking issue ${issue.id || semanticHash(issue)}.`,
    );
  }
  return receipt;
}

function validationScopeIds(value) {
  const ids = new Set();
  if (!value || typeof value !== 'object') return ids;
  Object.values(value).forEach((rows) => {
    if (!Array.isArray(rows)) return;
    rows.forEach((id) => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  });
  return ids;
}

function normalizeSeverities(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new TypeError(
      'TopologyEditValidationBlocking: blockingSeverities must be a non-empty array.',
    );
  }
  return [...new Set(value.map((row, index) => {
    const severity = stringValue(row).toUpperCase();
    if (!severity) {
      throw new TypeError(
        `TopologyEditValidationBlocking: blockingSeverities[${index}] is required.`,
      );
    }
    return severity;
  }))].sort((left, right) => left.localeCompare(right));
}
