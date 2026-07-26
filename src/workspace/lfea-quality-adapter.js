/**
 * Select kernel-published mesh-quality evidence for display.
 *
 * No quality score or acceptance threshold is invented here. T3 elements
 * expose signed area only; Q4 elements expose their retained qualification
 * metrics verbatim.
 */
export const QUALITY_METRICS = Object.freeze({
  JACOBIAN_RATIO: 'JACOBIAN_DETERMINANT_RATIO',
  EDGE_LENGTH_RATIO: 'EDGE_LENGTH_RATIO',
  MAXIMUM_CORNER_COSINE: 'MAXIMUM_CORNER_COSINE',
  SIGNED_AREA: 'SIGNED_AREA',
});

const PATHS = Object.freeze({
  [QUALITY_METRICS.JACOBIAN_RATIO]: 'jacobianDeterminantRatio',
  [QUALITY_METRICS.EDGE_LENGTH_RATIO]: 'edgeLengthRatio',
  [QUALITY_METRICS.MAXIMUM_CORNER_COSINE]: 'maximumCornerCosine',
  [QUALITY_METRICS.SIGNED_AREA]: 'signedArea',
});

export function selectQualityField(result, metricId) {
  const key = PATHS[metricId];
  if (!key) throw new TypeError(`Unsupported mesh-quality metric: ${metricId}.`);
  const byElement = {};
  for (const row of result?.elementQualityEvidence ?? []) {
    const value = row.evidence?.[key];
    if (Number.isFinite(value)) byElement[row.elementId] = value;
  }
  const values = Object.values(byElement);
  if (!values.length) {
    throw new TypeError(
      `No retained ${metricId} evidence exists for the current element types.`,
    );
  }
  return Object.freeze({
    byElement: Object.freeze(byElement),
    elementReductions: Object.freeze(
      Object.fromEntries(Object.keys(byElement).map((id) => [id, 'NONE'])),
    ),
    quantityId: metricId,
    unit: 'ratio',
    reduction: 'NONE',
    authority: 'RAW_MESH_QUALITY_QUALIFICATION_EVIDENCE',
    sourcePath: `result.elementQualityEvidence[].evidence.${key}`,
    min: Math.min(...values),
    max: Math.max(...values),
    elementCount: values.length,
  });
}

export function qualityEvidenceRows(result) {
  return (result?.elementQualityEvidence ?? []).map((row) => ({
    elementId: row.elementId,
    elementType: row.elementType,
    jacobianDeterminantRatio:
      row.evidence?.jacobianDeterminantRatio ?? 'N/A',
    edgeLengthRatio: row.evidence?.edgeLengthRatio ?? 'N/A',
    maximumCornerCosine: row.evidence?.maximumCornerCosine ?? 'N/A',
    signedArea: row.evidence?.signedArea ?? 'N/A',
    sourcePath: `result.elementQualityEvidence[${row.elementId}].evidence`,
  }));
}
