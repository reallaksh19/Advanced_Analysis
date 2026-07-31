// src/workspace/lafea-canvas/meshing-intent.js

import {
  SCHEMAS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
  requireFiniteNumber,
} from './contracts.js';

const PARAMETER_KEYS = Object.freeze([
  'globalSize',
  'edgeSizes',
  'curvatureSize',
  'refinementZones',
  'mappedDirections',
  'transitionControl',
]);
const INPUT_KEYS = Object.freeze([
  'operationId', 'baseSourceRevision', 'profileId', 'parameters', 'sourceEvidence',
]);

export function createMeshingCommand(input) {
  assertExactKeys(input, INPUT_KEYS, 'LAFEA_MESHING_COMMAND_INPUT_INVALID');
  const parameters = input.parameters;

  assertExactKeys(
    parameters,
    PARAMETER_KEYS,
    'LAFEA_MESHING_PARAMETERS_INVALID',
  );

  requireAsciiIdentity(input.operationId, 'operationId');
  requireAsciiIdentity(input.profileId, 'profileId');
  if (!Number.isInteger(input.baseSourceRevision) || input.baseSourceRevision < 0) {
    throw contractError('LAFEA_MESHING_BASE_REVISION_INVALID');
  }
  if (!input.sourceEvidence || typeof input.sourceEvidence.hash !== 'string'
    || !input.sourceEvidence.hash.trim()) {
    throw contractError('LAFEA_MESHING_SOURCE_EVIDENCE_REQUIRED');
  }
  for (const field of ['edgeSizes', 'refinementZones', 'mappedDirections']) {
    if (!Array.isArray(parameters[field])) {
      throw contractError('LAFEA_MESHING_COLLECTION_REQUIRED', { field });
    }
  }

  requireDeclaredPositive(parameters.globalSize, 'globalSize');
  requireDeclaredPositive(parameters.curvatureSize, 'curvatureSize');
  requireDeclaredPositive(parameters.transitionControl, 'transitionControl');

  parameters.edgeSizes.forEach((row, index) => {
    requireAsciiIdentity(row.boundaryId, `edgeSizes[${index}].boundaryId`);
    requireDeclaredPositive(row.size, `edgeSizes[${index}].size`);
  });

  parameters.refinementZones.forEach((row, index) => {
    requireAsciiIdentity(row.zoneId, `refinementZones[${index}].zoneId`);
    requireDeclaredPositive(row.targetSize, `refinementZones[${index}].targetSize`);
  });

  const copiedParameters = structuredClone(parameters);
  const copiedEvidence = structuredClone(input.sourceEvidence);
  return deepFreeze({
    schema: SCHEMAS.meshingCommand,
    operationId: input.operationId,
    baseSourceRevision: input.baseSourceRevision,
    profileId: input.profileId,
    parameters: copiedParameters,
    sourceEvidence: copiedEvidence,
  });
}

function requireDeclaredPositive(declared, field) {
  if (
    !declared ||
    typeof declared.source !== 'string' ||
    declared.source.trim() === ''
  ) {
    throw contractError('LAFEA_MESH_VALUE_SOURCE_REQUIRED', { field });
  }

  requireFiniteNumber(declared.value, `${field}.value`);

  if (declared.value <= 0) {
    throw contractError('LAFEA_MESH_VALUE_MUST_BE_POSITIVE', { field });
  }
}
