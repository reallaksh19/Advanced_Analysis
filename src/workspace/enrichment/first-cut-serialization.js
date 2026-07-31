/**
 * Functionality: Creates deterministic binding CSV and calculation-basis text
 * artifacts, then downloads them through an injected document and URL API.
 */

import { canonicalPrettyStringify } from '../../core/shared-piping-model/index.js';

const CSV_HEADERS = Object.freeze([
  'record_id', 'selector_kind', 'selector_key', 'field_id',
  'value', 'unit', 'source_id', 'revision',
]);

export function createBindingsCsv(bindings) {
  const rows = [...bindings].sort((left, right) => left.recordId.localeCompare(right.recordId))
    .map((row) => [
      row.recordId, row.selectorKind, row.selectorKey, row.fieldId,
      row.value, row.unit, row.sourceId, row.revision,
    ]);
  return [CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function createCalculationBasisText(calculationPackage, supportResult) {
  if (!calculationPackage || !supportResult) throw new TypeError('A current package and support result are required.');
  if (calculationPackage.status === 'STALE') throw new TypeError('Stale first-cut results cannot be copied.');
  const massCase = calculationPackage.massLedger.cases.find((row) => row.loadCaseId === supportResult.loadCaseId);
  const lines = [
    'FIRST-CUT SCREENING',
    `Support: ${supportResult.supportId}`,
    `Case: ${supportResult.loadCaseId}`,
    `Method: ${calculationPackage.method}`,
    `Status: ${calculationPackage.status}`,
    `${supportResult.label}: ${forceValue(supportResult).toFixed(3)} N`,
    `Mass: ${massCase?.massKg ?? 'UNAVAILABLE'} kg`,
    `COG: ${massCase?.cogM ? canonicalPrettyStringify(massCase.cogM).trim() : 'UNAVAILABLE'}`,
    `Source hash: ${calculationPackage.parentHashes.sourceSemanticHash}`,
    `Profile hash: ${calculationPackage.parentHashes.profileSemanticHash}`,
    'Thermal: NOT EVALUATED - RUN LFEA',
    'Guide: NOT EVALUATED - RUN LFEA',
    'Line stop: NOT EVALUATED - RUN LFEA',
    'Anchor/nozzle: NOT EVALUATED - RUN LFEA',
    'Limitation: preliminary screening; not B31.3 compliance.',
  ];
  return `${lines.join('\n')}\n`;
}

export function downloadTextArtifact(documentRef, urlApi, filename, content, mimeType) {
  if (!documentRef?.createElement || !documentRef?.body) throw new TypeError('Download requires a document.');
  if (!urlApi?.createObjectURL || !urlApi?.revokeObjectURL) throw new TypeError('Download requires an object URL API.');
  const url = urlApi.createObjectURL(new Blob([content], { type: mimeType }));
  try {
    const anchor = documentRef.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    documentRef.body.append(anchor); anchor.click(); anchor.remove();
  } finally {
    urlApi.revokeObjectURL(url);
  }
}

function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function forceValue(result) {
  const value = result.screenedVerticalShareN ?? result.beamVerticalForceN;
  if (!Number.isFinite(value)) throw new TypeError('Support result does not contain a finite vertical force.');
  return value;
}
