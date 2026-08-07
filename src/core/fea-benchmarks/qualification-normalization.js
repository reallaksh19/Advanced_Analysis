import { deepFreeze } from '../shared-piping-model/immutable.js';
import { normalizeBenchmarkResultRows } from './qualification-contract.js';

const TRANSLATION_DOFS = new Set(['UX', 'UY', 'UZ']);
const ROTATION_DOFS = new Set(['RX', 'RY', 'RZ']);

/**
 * Normalize the repository linear solver execution plus optional recovered
 * element/stress rows into the common benchmark comparison row contract.
 *
 * `execution.reactions` is already support-on-pipe and is never sign-flipped.
 */
export function normalizeLinearSolverBenchmarkResult(caseId, solved) {
  const envelope = solved?.execution ? solved : { execution: solved };
  const execution = envelope.execution;
  if (!execution || !Array.isArray(execution.displacement) || !Array.isArray(execution.reactions)) {
    throw new TypeError('Benchmark solve result must expose linear execution displacement and reactions arrays.');
  }

  const rows = [];
  for (const entry of execution.displacement) {
    if (TRANSLATION_DOFS.has(entry.dof)) {
      rows.push(nodeRow(entry, 'DISPLACEMENT', 'm'));
    } else if (ROTATION_DOFS.has(entry.dof)) {
      rows.push(nodeRow(entry, 'ROTATION', 'rad'));
    }
  }
  for (const entry of execution.reactions) {
    if (TRANSLATION_DOFS.has(entry.dof)) {
      rows.push(nodeRow(entry, 'FORCE', 'N'));
    } else if (ROTATION_DOFS.has(entry.dof)) {
      rows.push(nodeRow(entry, 'MOMENT', 'N*m'));
    }
  }

  appendElementRows(rows, envelope.elementResults ?? [], 'ELEMENT_RESULT');
  appendElementRows(rows, envelope.stressResults ?? [], 'STRESS');

  const normalized = normalizeBenchmarkResultRows(rows, caseId);
  return deepFreeze({
    rows: normalized,
    exposedQuantities: Object.freeze([...new Set(normalized.map((row) => row.quantity))].sort()),
    executionSemanticHash: execution.semanticHash ?? execution.executionHash ?? null,
    executionEvidenceHash: execution.evidenceHash ?? null,
  });
}

function nodeRow(entry, quantity, unit) {
  return {
    entityKind: 'NODE',
    entityId: String(entry.nodeId),
    quantity,
    component: entry.dof,
    value: entry.value,
    unit,
  };
}

function appendElementRows(target, source, fallbackQuantity) {
  if (!Array.isArray(source)) throw new TypeError('Recovered element benchmark results must be an array.');
  source.forEach((row, index) => {
    const entityId = row.elementId ?? row.entityId;
    if (entityId === undefined || entityId === null) {
      throw new TypeError(`Recovered element result ${index} is missing elementId.`);
    }
    target.push({
      entityKind: 'ELEMENT',
      entityId: String(entityId),
      quantity: row.quantity ?? fallbackQuantity,
      component: row.component,
      value: row.value,
      unit: row.unit,
      required: row.required,
      note: row.note,
    });
  });
}
