/** Builders that bind non-executable mesh requests to exact current stage lineage. */
import {
  LAFEA_MESH_GENERATION_INTENT_SCHEMA,
  createLafeaMeshGenerationIntent,
} from './lafea-mesh-generation-intent.js';
import {
  LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA,
  createLafeaMeshRefinementCommand,
} from './lafea-mesh-refinement-command.js';
import {
  requireKnownLafeaMeshRefinementIds,
  requireLafeaMeshRequestElementFamily,
  requireReadyLafeaMeshRequestStage,
} from './lafea-mesh-stage-adapter.js';

const GENERATION_CONFIGURATION_KEYS = Object.freeze([
  'targetElementLength', 'lengthUnit', 'elementFamily',
  'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
  'maximumEstimatedDofs', 'refinementEntityIds',
]);

const REFINEMENT_CONFIGURATION_KEYS = Object.freeze([
  'generationIntent', 'commandId', 'kind', 'entityIds',
  'targetElementLength', 'lengthUnit', 'reason',
]);

const GENERATION_INTENT_INPUT_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'meshProfileHash', 'targetElementLength', 'lengthUnit', 'elementFamily',
  'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
  'maximumEstimatedDofs', 'refinementEntityIds',
]);

export function buildLafeaMeshGenerationIntentFromStage(stageValue, configurationValue) {
  const configuration = exactRecord(
    configurationValue,
    GENERATION_CONFIGURATION_KEYS,
    'LAFEA_MESH_GENERATION_CONFIGURATION_KEYS_INVALID',
  );
  const projection = requireReadyLafeaMeshRequestStage(stageValue);
  requireLafeaMeshRequestElementFamily(projection, configuration.elementFamily);
  const refinementEntityIds = requireKnownLafeaMeshRefinementIds(
    configuration.refinementEntityIds,
    projection.availableRefinementEntityIds,
    { allowEmpty: true },
  );
  return createLafeaMeshGenerationIntent({
    schema: LAFEA_MESH_GENERATION_INTENT_SCHEMA,
    stageId: projection.stageId,
    sourceHash: projection.sourceHash,
    canonicalModelHash: projection.canonicalModelHash,
    analysisGeometryHash: projection.analysisGeometryHash,
    meshProfileHash: projection.meshProfileHash,
    targetElementLength: configuration.targetElementLength,
    lengthUnit: configuration.lengthUnit,
    elementFamily: configuration.elementFamily,
    curvatureToleranceDegrees: configuration.curvatureToleranceDegrees,
    growthLimit: configuration.growthLimit,
    maximumNodes: configuration.maximumNodes,
    maximumElements: configuration.maximumElements,
    maximumEstimatedDofs: configuration.maximumEstimatedDofs,
    refinementEntityIds,
  });
}

export function buildLafeaMeshRefinementCommandFromStage(stageValue, configurationValue) {
  const configuration = exactRecord(
    configurationValue,
    REFINEMENT_CONFIGURATION_KEYS,
    'LAFEA_MESH_REFINEMENT_CONFIGURATION_KEYS_INVALID',
  );
  const projection = requireReadyLafeaMeshRequestStage(stageValue);
  const intent = requireCurrentGenerationIntent(configuration.generationIntent, projection);
  const entityIds = requireKnownLafeaMeshRefinementIds(
    configuration.entityIds,
    projection.availableRefinementEntityIds,
  );
  return createLafeaMeshRefinementCommand({
    schema: LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA,
    commandId: configuration.commandId,
    stageId: projection.stageId,
    expectedGenerationIntentHash: intent.semanticHash,
    kind: configuration.kind,
    entityIds,
    targetElementLength: configuration.targetElementLength,
    lengthUnit: configuration.lengthUnit,
    reason: configuration.reason,
  });
}

function requireCurrentGenerationIntent(value, projection) {
  if (!isRecord(value)) throw requestError('LAFEA_MESH_GENERATION_INTENT_REQUIRED');
  const intake = Object.fromEntries(
    GENERATION_INTENT_INPUT_KEYS.map((key) => [key, value[key]]),
  );
  const rebuilt = createLafeaMeshGenerationIntent(intake);
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw requestError('LAFEA_MESH_GENERATION_INTENT_TAMPERED');
  }
  const sameParents = rebuilt.stageId === projection.stageId
    && rebuilt.sourceHash === projection.sourceHash
    && rebuilt.canonicalModelHash === projection.canonicalModelHash
    && rebuilt.analysisGeometryHash === projection.analysisGeometryHash
    && rebuilt.meshProfileHash === projection.meshProfileHash;
  if (!sameParents) throw requestError('LAFEA_MESH_GENERATION_INTENT_STALE');
  return rebuilt;
}

function exactRecord(value, keys, code) {
  if (!isRecord(value)) throw requestError(code);
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) throw requestError(code);
  return value;
}
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function compareCodeUnits(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function requestError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
