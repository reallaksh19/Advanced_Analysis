import {
  LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
  LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
  LAFEA_MESH_PUBLICATION_POLICY,
  LAFEA_MESH_REPEATABILITY_POLICY,
  LAFEA_MESH_ROLLBACK_POLICY,
  createLafeaMeshProducerCapability,
  createLafeaMeshProducerQualification,
} from './lafea-mesh-producer-contract.js';
import { buildLafeaMeshProducerReadinessV2 } from './lafea-domain-first-producer-readiness.js';

export const LAFEA_DOMAIN_FIRST_T6_PRODUCER_ID = 'LAFEA_DOMAIN_FIRST_CDT_T6';
export const LAFEA_DOMAIN_FIRST_T6_PRODUCER_REVISION = 'MP3.1';
export const LAFEA_DOMAIN_FIRST_T6_QUALITY_POLICY = 'MESH-QUALITY-POLICY-V1';
export const LAFEA_DOMAIN_FIRST_T6_MAXIMUM_NODES = 100000;
export const LAFEA_DOMAIN_FIRST_T6_MAXIMUM_ELEMENTS = 200000;
export const LAFEA_DOMAIN_FIRST_T6_MAXIMUM_DOFS = 200000;

export function lafeaDomainFirstT6ProducerCapability() {
  return createLafeaMeshProducerCapability({
    schema: LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
    producerId: LAFEA_DOMAIN_FIRST_T6_PRODUCER_ID,
    producerRevision: LAFEA_DOMAIN_FIRST_T6_PRODUCER_REVISION,
    scopes: [{ stageId: 'LAFEA.3', elementFamilies: ['T6'] }],
    generationModes: ['AUTOMATIC_MESH'],
    supportsLocalRefinement: false,
    repeatabilityPolicy: LAFEA_MESH_REPEATABILITY_POLICY,
    qualityPolicyId: LAFEA_DOMAIN_FIRST_T6_QUALITY_POLICY,
    rollbackPolicy: LAFEA_MESH_ROLLBACK_POLICY,
    publicationPolicy: LAFEA_MESH_PUBLICATION_POLICY,
    maximumNodes: LAFEA_DOMAIN_FIRST_T6_MAXIMUM_NODES,
    maximumElements: LAFEA_DOMAIN_FIRST_T6_MAXIMUM_ELEMENTS,
    maximumEstimatedDofs: LAFEA_DOMAIN_FIRST_T6_MAXIMUM_DOFS,
  });
}

export function lafeaDomainFirstT6ProducerQualification() {
  const capability = lafeaDomainFirstT6ProducerCapability();
  return createLafeaMeshProducerQualification({
    schema: LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
    qualificationId: 'WP-MP3-T6-SIMPLE-OUTER-LOOP',
    qualificationRevision: '1',
    capabilityHash: capability.capabilityHash,
    authorizedScopes: [{ stageId: 'LAFEA.3', elementFamilies: ['T6'] }],
    authorizedGenerationModes: ['AUTOMATIC_MESH'],
    localRefinementAuthorized: false,
    maximumNodes: LAFEA_DOMAIN_FIRST_T6_MAXIMUM_NODES,
    maximumElements: LAFEA_DOMAIN_FIRST_T6_MAXIMUM_ELEMENTS,
    maximumEstimatedDofs: LAFEA_DOMAIN_FIRST_T6_MAXIMUM_DOFS,
    repeatabilityPolicy: LAFEA_MESH_REPEATABILITY_POLICY,
    qualityPolicyId: LAFEA_DOMAIN_FIRST_T6_QUALITY_POLICY,
    rollbackPolicy: LAFEA_MESH_ROLLBACK_POLICY,
    publicationPolicy: LAFEA_MESH_PUBLICATION_POLICY,
    governanceRef: 'WP-MP3:#880',
    invalidationPolicy: 'PARENT_OR_PRODUCER_POLICY_CHANGE_INVALIDATES_V1',
  });
}

export function bindLafeaDomainFirstT6Producer(intent) {
  const capability = lafeaDomainFirstT6ProducerCapability();
  const qualification = lafeaDomainFirstT6ProducerQualification();
  const readiness = buildLafeaMeshProducerReadinessV2(intent, capability, qualification);
  if (!readiness.producerContractReady) {
    fail(readiness.reasons[0] ?? 'LAFEA_MP3_PRODUCER_CONTRACT_NOT_READY');
  }
  if (intent.elementFamily !== 'T6') fail('LAFEA_MP3_T6_FAMILY_REQUIRED');
  if (intent.refinementFeatureIds.length) fail('LAFEA_MP3_REFINEMENT_NOT_QUALIFIED');
  return freeze({
    ...readiness,
    schema: 'lafea-domain-first-t6-producer-binding/v1',
    executionAuthorized: true,
    reasons: [],
    producerRef: `${capability.producerId}@${capability.producerRevision}`,
    capability,
    qualification,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
