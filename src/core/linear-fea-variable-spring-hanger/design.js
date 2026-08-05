import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const DEFAULT_ALLOWABLE_LOAD_VARIATION = 0.25;

export class VariableSpringHangerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'VariableSpringHangerError';
    this.code = code;
  }
}

function requireFinite(value, field) {
  if (!Number.isFinite(value)) throw new VariableSpringHangerError(`${field} must be finite.`, 'VARIABLE_SPRING_INPUT_INVALID');
  return value;
}

function requirePositive(value, field) {
  requireFinite(value, field);
  if (!(value > 0)) throw new VariableSpringHangerError(`${field} must be positive.`, 'VARIABLE_SPRING_INPUT_INVALID');
  return value;
}

export function theoreticalColdLoad({ hotLoad, signedOperatingTravel, springRate }) {
  return requirePositive(hotLoad, 'hotLoad')
    + requireFinite(signedOperatingTravel, 'signedOperatingTravel') * requirePositive(springRate, 'springRate');
}

export function variableSpringSupportForce({ theoreticalColdLoad: coldLoad, springRate, displacement }) {
  return requireFinite(coldLoad, 'theoreticalColdLoad')
    - requirePositive(springRate, 'springRate') * requireFinite(displacement, 'displacement');
}

export function selectProgrammedVariableSpringHanger({
  designId,
  nodeId,
  hotLoad,
  signedOperatingTravel,
  catalog,
  allowableLoadVariation = DEFAULT_ALLOWABLE_LOAD_VARIATION,
}) {
  if (!designId || !nodeId) throw new VariableSpringHangerError('designId and nodeId are required.', 'VARIABLE_SPRING_INPUT_INVALID');
  requirePositive(hotLoad, 'hotLoad');
  requireFinite(signedOperatingTravel, 'signedOperatingTravel');
  requirePositive(allowableLoadVariation, 'allowableLoadVariation');
  if (!catalog || !Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    throw new VariableSpringHangerError('catalog.entries must be a non-empty array.', 'VARIABLE_SPRING_CATALOG_INVALID');
  }

  const travelMagnitude = Math.abs(signedOperatingTravel);
  const minimumSeriesOrder = Math.min(...catalog.entries
    .filter((entry) => travelMagnitude <= entry.maximumRecommendedMovement + 1e-12)
    .map((entry) => entry.seriesOrder));
  if (!Number.isFinite(minimumSeriesOrder)) {
    throw new VariableSpringHangerError('Required travel exceeds the catalog variable-spring range.', 'VARIABLE_SPRING_CONSTANT_SUPPORT_REQUIRED');
  }

  const candidates = [];
  const ordered = [...catalog.entries].sort((a, b) => a.seriesOrder - b.seriesOrder || a.sizeOrder - b.sizeOrder);
  for (const entry of ordered) {
    const coldLoad = theoreticalColdLoad({ hotLoad, signedOperatingTravel, springRate: entry.springRate });
    const variability = Math.abs(coldLoad - hotLoad) / hotLoad;
    const reasons = [];
    if (entry.seriesOrder < minimumSeriesOrder) reasons.push('TRAVEL_EXCEEDS_RECOMMENDED_SERIES_LIMIT');
    if (hotLoad < entry.minimumWorkingLoad || hotLoad > entry.maximumWorkingLoad) reasons.push('HOT_LOAD_OUTSIDE_WORKING_RANGE');
    if (coldLoad < entry.minimumWorkingLoad || coldLoad > entry.maximumWorkingLoad) reasons.push('COLD_LOAD_OUTSIDE_WORKING_RANGE');
    if (variability > allowableLoadVariation + 1e-12) reasons.push('ALLOWABLE_LOAD_VARIATION_EXCEEDED');
    candidates.push({
      entryId: entry.entryId,
      seriesId: entry.seriesId,
      figure: entry.figure,
      size: entry.size,
      springRate: entry.springRate,
      hotLoad,
      theoreticalColdLoad: coldLoad,
      signedOperatingTravel,
      variability,
      minimumWorkingLoad: entry.minimumWorkingLoad,
      maximumWorkingLoad: entry.maximumWorkingLoad,
      accepted: reasons.length === 0,
      rejectionReasons: reasons,
    });
  }
  const selected = candidates.find((candidate) => candidate.accepted);
  if (!selected) {
    throw new VariableSpringHangerError('No single variable spring satisfies travel, load range, and variability.', 'VARIABLE_SPRING_SINGLE_SPRING_NOT_FOUND');
  }
  const result = {
    schema: 'fea-linear-programmed-variable-spring-design/v1',
    designId,
    nodeId,
    catalogId: catalog.catalogId,
    catalogSemanticHash: catalog.semanticHash,
    criteria: {
      allowableLoadVariation,
      minimumSeriesOrder,
      selectionRule: 'FIRST_VALID_SERIES_THEN_SMALLEST_SIZE_V1',
      rigidSupportDisplacementCriterion: 0,
      constantSupportTravelCriterion: Math.max(...catalog.entries.map((entry) => entry.maximumRecommendedMovement)),
    },
    designInput: { hotLoad, signedOperatingTravel },
    selected,
    candidates,
    semanticHash: '',
  };
  result.semanticHash = semanticHash(result);
  return deepFreeze(result);
}
