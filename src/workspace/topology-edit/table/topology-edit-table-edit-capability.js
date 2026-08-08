import { topologyEditTableColumnsFor } from './topology-edit-table-columns.js';
import { createTopologyEditCapabilityReceipt } from '../editor-state/topology-edit-capability-contract.js';

const CERTIFIED_EDITOR_TO_INTENT = Object.freeze({
  PIPE_LENGTH: 'PIPE_LENGTH',
  VALVE_REPLACE: 'VALVE_REPLACEMENT',
  BRANCH_RECONFIGURE: 'TEE_REDUCER_RELATION',
});

const SUPPORT_MUTATION_KEYS = new Set([
  'stationMm', 'supportType', 'direction', 'gapMm', 'travelMm',
]);

export function deriveTopologyEditTableCellCapability(input = {}) {
  const row = input.row;
  const columnKey = String(input.columnKey ?? '').trim();
  const context = {
    basisCanonicalHash: input.basisCanonicalHash ?? input.projection?.authority?.canonicalTopologyHash ?? null,
    selectionHash: input.selectionHash ?? null,
    selectionRevision: input.selectionRevision ?? null,
  };
  if (!row || !columnKey) {
    return receipt('BLOCKED', 'SELECTION_REQUIRED', 'Select an exact table row and property.', row, columnKey, context);
  }
  const descriptor = topologyEditTableColumnsFor(row.elementType)
    .find((column) => column.key === columnKey);
  if (descriptor?.readOnly) {
    return receipt('BLOCKED', 'READ_ONLY_PROPERTY', 'This property is explicitly read-only.', row, columnKey, context);
  }
  if (row.elementType === 'SUPPORT' && SUPPORT_MUTATION_KEYS.has(columnKey)) {
    return receipt(
      'UNREPRESENTABLE',
      'SUPPORT_EDIT_NOT_CERTIFIED',
      'Support editing is not certified in this recovery slice.',
      row,
      columnKey,
      context,
    );
  }
  if (!descriptor?.editor) {
    return receipt('BLOCKED', 'READ_ONLY_PROPERTY', 'No certified editor is declared for this property.', row, columnKey, context);
  }
  const intentKind = CERTIFIED_EDITOR_TO_INTENT[descriptor.editor];
  if (!intentKind) {
    return receipt(
      'UNREPRESENTABLE',
      'TABLE_INTENT_NOT_CERTIFIED',
      `${descriptor.label} is visible but not yet backed by a certified Table intent.`,
      row,
      columnKey,
      context,
      { editor: descriptor.editor },
    );
  }
  if (intentKind === 'PIPE_LENGTH') {
    const available = row.elementType === 'PIPE' && row.identity?.canonicalKind === 'EDGE';
    return available
      ? receipt('AVAILABLE', 'READY', 'Certified PIPE_LENGTH intent is available.', row, columnKey, context, { intentKind })
      : receipt('BLOCKED', 'TABLE_TARGET_KIND_INVALID', 'PIPE_LENGTH requires an exact PIPE edge row.', row, columnKey, context, { intentKind });
  }
  if (intentKind === 'VALVE_REPLACEMENT') {
    if (row.elementType !== 'VALVE' || row.identity?.canonicalKind !== 'EDGE') {
      return receipt('BLOCKED', 'TABLE_TARGET_KIND_INVALID', 'VALVE_REPLACEMENT requires an exact VALVE edge row.', row, columnKey, context, { intentKind });
    }
    if (token(row.fields?.valveType) !== 'GATE') {
      return receipt('BLOCKED', 'VALVE_TARGET_NOT_CERTIFIED', 'The certified Table replacement path currently requires an observed GATE valve.', row, columnKey, context, { intentKind });
    }
    return receipt(
      'NEEDS_INPUT',
      'EXACT_CATALOGUE_RECORD_REQUIRED',
      'Choose an exact BALL valve catalogue record and geometry policy before staging.',
      row,
      columnKey,
      context,
      { intentKind },
      ['catalogueBinding', 'geometryPolicy'],
    );
  }
  if (intentKind === 'TEE_REDUCER_RELATION') {
    if (row.elementType !== 'TEE' || row.identity?.canonicalKind !== 'JUNCTION') {
      return receipt('BLOCKED', 'TABLE_TARGET_KIND_INVALID', 'TEE_REDUCER_RELATION requires an exact TEE junction row.', row, columnKey, context, { intentKind });
    }
    return receipt(
      'NEEDS_INPUT',
      'REQUIRED_ENGINEERING_INPUT_MISSING',
      'Choose the exact branch binding and reducer with exact catalogue custody before staging.',
      row,
      columnKey,
      context,
      { intentKind },
      ['branchPortKey', 'reducerCanonicalId'],
    );
  }
  return receipt('UNREPRESENTABLE', 'TABLE_INTENT_NOT_CERTIFIED', 'No certified Table intent is available.', row, columnKey, context);
}

export function topologyEditTableRowCapabilityMap(row, projection) {
  const result = {};
  for (const column of topologyEditTableColumnsFor(row?.elementType)) {
    result[column.key] = deriveTopologyEditTableCellCapability({ row, columnKey: column.key, projection });
  }
  return Object.freeze(result);
}

function receipt(status, reasonCode, reason, row, columnKey, context, details = {}, missingEvidence = []) {
  return createTopologyEditCapabilityReceipt({
    surfaceId: 'ENGINEERING_TABLE',
    actionId: `${row?.elementType || 'ROW'}:${columnKey || 'PROPERTY'}`,
    status,
    reasonCode,
    reason,
    ...context,
    missingEvidence,
    details: {
      canonicalId: row?.identity?.canonicalId ?? null,
      elementType: row?.elementType ?? null,
      property: columnKey || null,
      ...details,
    },
  });
}
function token(value) { return String(value ?? '').trim().toUpperCase(); }
