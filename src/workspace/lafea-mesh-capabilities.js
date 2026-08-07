/** Truthful stage mesh capabilities. This module authorizes no producer execution. */
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';

export const LAFEA_MESH_CAPABILITIES_SCHEMA = 'lafea-mesh-capabilities/v1';

const STAGE_ELEMENT_FAMILIES = Object.freeze({
  'LAFEA.3': Object.freeze(['T3', 'T6', 'Q8']),
  'LAFEA.4': Object.freeze(['CST_DKT_TRI3_THIN_SHELL_V1']),
  'LAFEA.5': Object.freeze(['CST_DKT_TRI3_THIN_SHELL_V1']),
});

export function lafeaMeshCapabilities(stageId) {
  const lifecycleProfile = requireLafeaLifecycleProfileForStage(stageId);
  const applicable = lifecycleProfile.meshApplicable === true;
  return freeze({
    schema: LAFEA_MESH_CAPABILITIES_SCHEMA,
    stageId,
    applicable,
    retainedAuthorizedMesh: applicable,
    sourceDiscretizationAuthorized: false,
    automaticMeshProducerQualified: false,
    manualRefinementQualified: false,
    allowedElementFamilies: applicable ? [...STAGE_ELEMENT_FAMILIES[stageId]] : [],
    generationRequestSupported: applicable,
    generationExecutionAuthorized: false,
    reasons: applicable ? [
      'RETAIN_AUTHORIZED_MESH_SUPPORTED',
      'SOURCE_DISCRETIZATION_NOT_AUTHORIZED',
      'QUALIFIED_MESH_PRODUCER_NOT_AVAILABLE',
      'GOVERNED_REFINEMENT_COMMAND_NOT_AVAILABLE',
    ] : ['ANALYSIS_MESH_NOT_APPLICABLE'],
  });
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
