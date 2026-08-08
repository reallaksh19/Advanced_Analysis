import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';
import { requireControlledThermalLiftoffInfluenceQualification } from './preproduction-thermal-liftoff-controlled-influence-adapter.mjs';

export function requireControlledThermalLiftoffInfluenceQualificationIndependently(value) {
  const accepted = requireControlledThermalLiftoffInfluenceQualification(value);
  if (accepted.sourceColumns.length !== accepted.ordering.length) throw coded('TL_CONTROLLED_INFLUENCE_COLUMN_COUNT_MISMATCH');
  const columnBySite = new Map();
  for (const column of accepted.sourceColumns) {
    const { semanticHash: actual, ...material } = column;
    if (actual !== semanticHash(material)) throw coded('TL_CONTROLLED_INFLUENCE_COLUMN_HASH_MISMATCH');
    if (columnBySite.has(column.supportSiteId)) throw coded('TL_CONTROLLED_INFLUENCE_COLUMN_DUPLICATE');
    columnBySite.set(column.supportSiteId, column);
  }
  if (JSON.stringify([...columnBySite.keys()].sort(ascii)) !== JSON.stringify([...accepted.ordering].sort(ascii))) {
    throw coded('TL_CONTROLLED_INFLUENCE_COVERAGE_MISMATCH');
  }
  const expected = accepted.ordering.map((_, rowIndex) => accepted.ordering.map((siteId) => {
    const column = columnBySite.get(siteId);
    if (column.valuesMPerN.length !== accepted.ordering.length) throw coded('TL_CONTROLLED_INFLUENCE_COLUMN_SHAPE_MISMATCH');
    return column.valuesMPerN[rowIndex];
  }));
  if (semanticHash(expected) !== semanticHash(accepted.matrixEvidence.data.values)) {
    throw coded('TL_CONTROLLED_INFLUENCE_MATRIX_COLUMN_MISMATCH');
  }
  let maxReciprocityResidualMPerN = 0;
  for (let i = 0; i < expected.length; i += 1) {
    for (let j = i + 1; j < expected.length; j += 1) {
      maxReciprocityResidualMPerN = Math.max(maxReciprocityResidualMPerN, Math.abs(expected[i][j] - expected[j][i]));
    }
  }
  const expectedSummary = {
    supportCount: accepted.ordering.length,
    probePairCount: accepted.sourceColumns.length,
    offDiagonalCouplingPresent: expected.some((row, i) => row.some((entry, j) => i !== j && entry !== 0)),
    maxReciprocityResidualMPerN,
  };
  if (semanticHash(expectedSummary) !== semanticHash(accepted.summary)) throw coded('TL_CONTROLLED_INFLUENCE_SUMMARY_MISMATCH');
  if (accepted.matrixEvidence.applicability.contactAuthoritySemanticHash !== accepted.contactAuthoritySemanticHash
      || accepted.matrixEvidence.applicability.geometrySemanticHash !== accepted.mechanicalModelSemanticHash
      || accepted.matrixEvidence.applicability.linePropertySemanticHash !== accepted.stiffnessStateHash) {
    throw coded('TL_CONTROLLED_INFLUENCE_APPLICABILITY_BINDING_MISMATCH');
  }
  return deepFreeze(structuredClone(accepted));
}

function ascii(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: false, sensitivity: 'variant' }); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
