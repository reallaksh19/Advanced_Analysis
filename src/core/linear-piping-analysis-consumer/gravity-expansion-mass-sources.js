import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  computePrimitiveSemanticHash,
  requireLoadPrimitive,
} from '../linear-fea-load-case/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';
import {
  GRAVITY_DISTRIBUTED_WEIGHT_EXPANSION_ID,
  distributedWeightGravityDerivation,
  gravityIntensity,
  requirePositiveFinite,
} from './gravity-expansion-primitives.js';

export const GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE =
  'PIPING_ANALYSIS_GRAVITY_DISTRIBUTED_WEIGHT_MISSING';
export const GRAVITY_DISTRIBUTED_WEIGHT_COLLISION_CODE =
  'PIPING_ANALYSIS_GRAVITY_DISTRIBUTED_WEIGHT_COLLISION';

export function indexDistributedWeightPrimitives(loadCase) {
  const index = new Map();
  const primitives = loadCase.primitives
    .filter((primitive) => primitive.kind === 'DISTRIBUTED_WEIGHT')
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  for (const primitive of primitives) {
    const key = distributedWeightKey(primitive.elementId, primitive.weightComponent);
    const existing = index.get(key);
    if (existing !== undefined) {
      failLinearPipingAnalysis(
        `Load case ${loadCase.loadCaseId} declares duplicate DISTRIBUTED_WEIGHT primitives for element ${primitive.elementId} and ${primitive.weightComponent}.`,
        GRAVITY_DISTRIBUTED_WEIGHT_COLLISION_CODE,
        {
          loadCaseId: loadCase.loadCaseId,
          elementId: primitive.elementId,
          weightComponent: primitive.weightComponent,
          primitiveIds: [existing.primitiveId, primitive.primitiveId].sort(compareAscii),
        },
      );
    }
    index.set(key, primitive);
  }
  return index;
}

export function expandDeclaredDistributedWeightSource({
  acceptedCompilation,
  gravity,
  element,
  massSource,
  distributedWeights,
  existingPrimitiveIds,
}) {
  const distributedWeight = distributedWeights.get(
    distributedWeightKey(element.elementId, massSource),
  );
  if (distributedWeight === undefined) {
    failLinearPipingAnalysis(
      `Gravity primitive ${gravity.primitiveId} authorizes ${massSource}, but element ${element.elementId} has no matching DISTRIBUTED_WEIGHT primitive.`,
      GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE,
      {
        gravityPrimitiveId: gravity.primitiveId,
        elementId: element.elementId,
        massSource,
      },
    );
  }
  const primitiveId = generatedPrimitiveId(
    gravity.primitiveId,
    element.elementId,
    massSource,
  );
  if (existingPrimitiveIds.has(primitiveId)) {
    failLinearPipingAnalysis(
      `Generated gravity primitive identity ${primitiveId} collides with an existing load primitive.`,
      'PIPING_ANALYSIS_GRAVITY_PRIMITIVE_ID_COLLISION',
      { primitiveId },
    );
  }
  existingPrimitiveIds.add(primitiveId);

  const acceleration = requirePositiveFinite(
    gravity.accelerationMagnitude.value,
    `gravity[${gravity.primitiveId}].accelerationMagnitude.value`,
  );
  const massPerUnitLength = requirePositiveFinite(
    distributedWeight.massPerUnitLength,
    `distributedWeight[${distributedWeight.primitiveId}].massPerUnitLength`,
  );
  const lineWeight = massPerUnitLength * acceleration;
  const intensity = gravityIntensity(gravity, lineWeight);
  const derivation = distributedWeightGravityDerivation({
    acceptedCompilation,
    gravity,
    element,
    distributedWeight,
    acceleration,
    lineWeight,
    intensity,
  });
  const sourceEvidence = {
    sourceId: `${GRAVITY_DISTRIBUTED_WEIGHT_EXPANSION_ID}:${gravity.primitiveId}:${element.elementId}:${massSource}`,
    sourceRevision: `${distributedWeight.primitiveId}:${massSource}`,
    sourceSemanticHash: semanticHash(derivation),
  };
  const draft = {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId,
    kind: 'DISTRIBUTED_LOAD',
    sourceEvidence,
    elementId: element.elementId,
    basis: 'GLOBAL',
    variation: 'UNIFORM',
    startIntensity: { ...intensity },
    endIntensity: { ...intensity },
    units: { distributedForce: 'N/m', length: 'm' },
    limitations: [],
    semanticHash: '',
  };
  draft.semanticHash = computePrimitiveSemanticHash(draft);
  return deepFreeze({
    primitive: requireLoadPrimitive(draft),
    derivation: deepFreeze({ primitiveId, sourceEvidence, ...derivation }),
  });
}

function distributedWeightKey(elementId, massSource) {
  return `${elementId}\u0000${massSource}`;
}

function generatedPrimitiveId(gravityPrimitiveId, elementId, massSource) {
  return `LP-M012-${gravityPrimitiveId}-${elementId}-${massSource}`;
}
