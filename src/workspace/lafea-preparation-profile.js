import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_PREPARATION_PROFILE_SCHEMA = 'lafea-preparation-profile/v1';

const REQUIRED_CAPABILITIES = Object.freeze([
  'SOURCE', 'SCHEMA', 'UNIT', 'GEOMETRY', 'TOPOLOGY', 'MATERIAL', 'SECTION',
  'RESTRAINT', 'LOAD', 'PHYSICAL_CASE', 'CONSTRAINT',
]);
const CONDITIONAL_CODES = Object.freeze(['LAFEA_CONDITIONAL_APPROXIMATION']);

export function lafeaPreparationProfile(stageId) {
  const registry = requireLafeaStageRegistryEntry(stageId);
  const lifecycle = requireLafeaLifecycleProfileForStage(stageId);
  const supported = registry.engineState === 'QUALIFIED_ROUTE_REGISTERED';
  const profile = {
    schema: LAFEA_PREPARATION_PROFILE_SCHEMA,
    profileId: `LAFEA_PREPARATION_BASELINE:${stageId}:V1`,
    stageId,
    lifecycleProfileId: lifecycle.profileId,
    analysisGeometryRequired: lifecycle.meshApplicable === true,
    requiredCapabilityIds: supported ? [...REQUIRED_CAPABILITIES] : [],
    allowedConditionalFindingCodes: supported ? [...CONDITIONAL_CODES] : [],
    producerQualified: false,
    qualifiedProducerRef: null,
    missingProducerReason: supported
      ? 'LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED'
      : 'STAGE_ENGINE_NOT_IMPLEMENTED',
  };
  return freeze({ ...profile, semanticHash: canonicalLafeaSha256(profile) });
}

export function requireLafeaPreparationProfile(stageId) {
  return lafeaPreparationProfile(stageId);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
