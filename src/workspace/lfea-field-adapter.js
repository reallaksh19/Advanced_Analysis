/**
 * Single authority for turning qualified solver evidence into a displayable
 * scalar field.
 *
 * This module NEVER computes a physical quantity. It SELECTS one that the
 * kernel already published and records where it came from. Any arithmetic here
 * would create a second place where a constitutive or invariant formula lives,
 * which is how the displayed von Mises came to disagree with the exported
 * evidence by 26 % on plane-strain T3 models.
 *
 * Verified by benchmark case BM-P1-DISPLAYED-VON-MISES, which asserts the
 * displayed value is bit-identical (Object.is) to a value in the result object.
 */

export const FIELD_IDS = Object.freeze({
  VON_MISES: 'VON_MISES',
  SHELL_VON_MISES: 'SHELL_VON_MISES',
  SX: 'SX',
  SY: 'SY',
  TXY: 'TXY',
  SIGMA_Z: 'SIGMA_Z',
  PRINCIPAL_MAX: 'PRINCIPAL_MAX',
  PRINCIPAL_MIN: 'PRINCIPAL_MIN',
  PROJECTED_SX: 'PROJECTED_SX',
  PROJECTED_SY: 'PROJECTED_SY',
  PROJECTED_TXY: 'PROJECTED_TXY',
});

export const REDUCTIONS = Object.freeze({
  T3_CONSTANT: 'T3_CONSTANT_ELEMENT_DOMAIN',
  Q4_MAX_OVER_IP: 'Q4_MAXIMUM_OF_4_GAUSS_POINTS',
  Q4_MIN_OVER_IP: 'Q4_MINIMUM_OF_4_GAUSS_POINTS',
  NODAL_PATCH_MEAN: 'ELEMENT_MEAN_OF_PROJECTED_NODAL_VALUES',
  SHELL_MAX_OVER_CASE_IP_SURFACE: 'SHELL_MAXIMUM_OVER_LOAD_CASE_INTEGRATION_POINT_AND_SURFACE',
});

export const AUTHORITIES = Object.freeze({
  RAW: 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS',
  PROJECTED: 'NON_AUTHORITATIVE_REVIEW_PROJECTION',
});

const PROJECTED_FIELDS = Object.freeze({
  [FIELD_IDS.PROJECTED_SX]: 'SX',
  [FIELD_IDS.PROJECTED_SY]: 'SY',
  [FIELD_IDS.PROJECTED_TXY]: 'TXY',
});

/**
 * Select an authoritative per-element scalar field from qualified solver evidence.
 *
 * @param {Record<string, unknown>} result Qualified `fea-continuum-result`.
 * @param {string} fieldId One of FIELD_IDS (non-projected).
 * @param {string} unit Stress unit taken from `solverProfile.units.stress`.
 * @param {string} ipReduction Q4 integration-point reduction, from REDUCTIONS.
 * @returns {Readonly<Record<string, unknown>>} Immutable field descriptor.
 */
export function selectElementField(result, fieldId, unit, ipReduction = REDUCTIONS.Q4_MAX_OVER_IP) {
  if (!result) throw new TypeError('lfea-field-adapter requires a qualified continuum result.');
  if (!Object.values(FIELD_IDS).includes(fieldId)) throw new TypeError(`Unsupported field identity: ${fieldId}.`);
  if (fieldId in PROJECTED_FIELDS) {
    throw new TypeError('Projected fields must be selected with selectProjectedField().');
  }
  if (typeof unit !== 'string' || !unit.trim()) {
    throw new TypeError('A stress unit is required; it must come from solverProfile.units.stress.');
  }
  if (ipReduction !== REDUCTIONS.Q4_MAX_OVER_IP && ipReduction !== REDUCTIONS.Q4_MIN_OVER_IP) {
    throw new TypeError(`Unsupported integration-point reduction: ${ipReduction}.`);
  }

  const byElement = {};
  const elementReductions = {};
  const sources = new Set();

  // ---- T3 / element-constant evidence -------------------------------
  if (fieldId === FIELD_IDS.VON_MISES) {
    for (const row of result.vonMisesStress ?? []) {
      byElement[row.elementId] = row.value;
      elementReductions[row.elementId] = REDUCTIONS.T3_CONSTANT;
      sources.add('result.vonMisesStress[].value');
    }
  } else if (fieldId === FIELD_IDS.PRINCIPAL_MAX || fieldId === FIELD_IDS.PRINCIPAL_MIN) {
    for (const row of result.principalStresses ?? []) {
      const values = row.values ?? [];
      byElement[row.elementId] = fieldId === FIELD_IDS.PRINCIPAL_MAX ? values[0] : values[values.length - 1];
      elementReductions[row.elementId] = REDUCTIONS.T3_CONSTANT;
      sources.add('result.principalStresses[].values');
    }
  } else {
    for (const row of result.elementStresses ?? []) {
      byElement[row.elementId] = componentFromStressRow(row, fieldId);
      elementReductions[row.elementId] = REDUCTIONS.T3_CONSTANT;
      sources.add('result.elementStresses[]');
    }
  }

  // ---- Q4 / integration-point evidence ------------------------------
  const reduce = ipReduction === REDUCTIONS.Q4_MIN_OVER_IP ? Math.min : Math.max;
  const seen = new Set();
  for (const row of result.integrationPointResults ?? []) {
    const value = componentFromIntegrationPointRow(row, fieldId);
    if (!Number.isFinite(value)) continue;
    byElement[row.elementId] = seen.has(row.elementId) ? reduce(byElement[row.elementId], value) : value;
    seen.add(row.elementId);
    elementReductions[row.elementId] = ipReduction;
    sources.add('result.integrationPointResults[]');
  }

  return finalize({
    byElement, elementReductions, quantityId: fieldId, unit,
    sources, reduction: ipReduction, authority: AUTHORITIES.RAW,
  });
}

/**
 * Select a NON-AUTHORITATIVE projected nodal field, reduced to elements.
 *
 * Projected stress is a review aid only. It is never governing, never used for
 * convergence, and is always labelled with its authority alongside every value.
 *
 * @param {Record<string, unknown>} projection Qualified stress projection.
 * @param {Array<Record<string, unknown>>} elements Package elements.
 * @param {string} fieldId One of the PROJECTED_* field identities.
 * @param {string} unit Stress unit taken from `solverProfile.units.stress`.
 * @returns {Readonly<Record<string, unknown>>} Immutable field descriptor.
 */
export function selectProjectedField(projection, elements, fieldId, unit) {
  const component = PROJECTED_FIELDS[fieldId];
  if (!component) throw new TypeError(`Unsupported projected field identity: ${fieldId}.`);
  if (!projection) throw new TypeError('A qualified stress projection is required.');
  if (typeof unit !== 'string' || !unit.trim()) throw new TypeError('A stress unit is required.');

  const byNode = new Map(
    (projection.nodalValues ?? [])
      .filter((row) => row.stressComponent === component)
      .map((row) => [row.nodeId, row.weightedValue]),
  );
  const byElement = {};
  const elementReductions = {};
  for (const element of elements ?? []) {
    const values = element.nodeIds.map((nodeId) => byNode.get(nodeId)).filter(Number.isFinite);
    if (!values.length) continue;
    byElement[element.elementId] = values.reduce((sum, value) => sum + value, 0) / values.length;
    elementReductions[element.elementId] = REDUCTIONS.NODAL_PATCH_MEAN;
  }

  return finalize({
    byElement, elementReductions, quantityId: fieldId, unit,
    sources: new Set(['stressProjection.nodalValues[].weightedValue']),
    reduction: REDUCTIONS.NODAL_PATCH_MEAN, authority: AUTHORITIES.PROJECTED,
  });
}

/**
 * Select retained LAFEA.4 surface von Mises evidence for each shell element.
 *
 * This is a maximum selection across already-computed kernel values, not a
 * stress calculation. The field records the exact result path it consumes.
 *
 * @param {Record<string, unknown>} result Qualified local-shell result.
 * @param {string} unit Stress unit from the source document.
 * @returns {Readonly<Record<string, unknown>>} Immutable shell field.
 */
export function selectShellSurfaceField(result, unit) {
  if (!result) throw new TypeError('A qualified local-shell result is required.');
  if (typeof unit !== 'string' || !unit.trim()) {
    throw new TypeError('The local-shell stress unit is required.');
  }
  const byElement = {};
  const elementReductions = {};
  for (const loadCase of result.loadCaseResults ?? []) {
    for (const element of loadCase.elementResults ?? []) {
      for (const point of element.integrationPoints ?? []) {
        for (const surface of point.surfaces ?? []) {
          if (!Number.isFinite(surface.vonMises)) continue;
          const current = byElement[element.elementId];
          byElement[element.elementId] = Number.isFinite(current)
            ? Math.max(current, surface.vonMises)
            : surface.vonMises;
          elementReductions[element.elementId] = REDUCTIONS.SHELL_MAX_OVER_CASE_IP_SURFACE;
        }
      }
    }
  }
  return finalize({
    byElement,
    elementReductions,
    quantityId: FIELD_IDS.SHELL_VON_MISES,
    unit,
    sources: new Set([
      'result.loadCaseResults[].elementResults[].integrationPoints[].surfaces[].vonMises',
    ]),
    reduction: REDUCTIONS.SHELL_MAX_OVER_CASE_IP_SURFACE,
    authority: AUTHORITIES.RAW,
  });
}

function finalize(parts) {
  const values = Object.values(parts.byElement).filter(Number.isFinite);
  if (!values.length) throw new TypeError(`No qualified evidence is available for field ${parts.quantityId}.`);
  return Object.freeze({
    byElement: Object.freeze({ ...parts.byElement }),
    elementReductions: Object.freeze({ ...parts.elementReductions }),
    quantityId: parts.quantityId,
    unit: parts.unit,
    reduction: parts.reduction,
    authority: parts.authority,
    sourcePath: [...parts.sources].sort(compare).join(' + '),
    min: Math.min(...values),
    max: Math.max(...values),
    elementCount: values.length,
  });
}

function componentFromStressRow(row, fieldId) {
  const [sx, sy, txy] = row.values ?? [];
  if (fieldId === FIELD_IDS.SX) return sx;
  if (fieldId === FIELD_IDS.SY) return sy;
  if (fieldId === FIELD_IDS.TXY) return txy;
  if (fieldId === FIELD_IDS.SIGMA_Z) return row.sigmaZ;
  throw new TypeError(`Field ${fieldId} is not available from element-constant stress evidence.`);
}

function componentFromIntegrationPointRow(row, fieldId) {
  if (fieldId === FIELD_IDS.VON_MISES) return row.vonMisesStress;
  if (fieldId === FIELD_IDS.SX) return row.stress?.[0];
  if (fieldId === FIELD_IDS.SY) return row.stress?.[1];
  if (fieldId === FIELD_IDS.TXY) return row.stress?.[2];
  if (fieldId === FIELD_IDS.SIGMA_Z) return row.sigmaZ;
  if (fieldId === FIELD_IDS.PRINCIPAL_MAX) return row.principalStresses?.[0];
  if (fieldId === FIELD_IDS.PRINCIPAL_MIN) return row.principalStresses?.[row.principalStresses.length - 1];
  return undefined;
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
