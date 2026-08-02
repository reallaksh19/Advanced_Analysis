/** Read-only adapter from current workspace authority to the B2 core snapshot. */
import {
  createTemplateTargetAuthoritySnapshot,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  LAFEA_CANONICAL_SHA256_PROFILE,
  canonicalLafeaSha256,
} from './lafea-canonical-sha256.js';
import {
  LAFEA_LIFECYCLE_PROFILE_SCHEMA,
  requireLafeaLifecycleProfileForStage,
} from './lafea-lifecycle-profiles.js';
import {
  LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
  requireLafeaStageCompositionBinding,
} from './lafea-stage-composition-bindings.js';
import {
  LAFEA_SOURCE_AUTHORITY_ROLE,
  LAFEA_SOURCE_AUTHORITY_SCHEMA,
} from './lafea-source-authority.js';
import {
  LAFEA_STAGE_REGISTRY_SCHEMA,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';
import {
  lafeaProductComponentRegistered,
} from './lafea-stage-product-components.js';

export const LAFEA_TARGET_AUTHORITY_ADAPTER_REVISION = 'B2.1';

export function createCurrentLafeaTargetAuthoritySnapshot(stageId) {
  const stage = requireLafeaStageRegistryEntry(stageId);
  const binding = requireLafeaStageCompositionBinding(stageId);
  const lifecycle = requireLafeaLifecycleProfileForStage(stageId);
  if (stage.composition !== binding) {
    throw new TypeError(`${stageId} registry composition is not the current binding.`);
  }
  if (binding.lifecycleProfileId !== lifecycle.profileId) {
    throw new TypeError(`${stageId} lifecycle profile binding is stale.`);
  }

  const stageIdentity = {
    schema: LAFEA_STAGE_REGISTRY_SCHEMA,
    stageId,
    engineState: stage.engineState,
    enginePackage: stage.enginePackage,
    authority: stage.authority,
    inputContractRole: stage.inputContractRole,
    resultContractRole: stage.resultContractRole,
    unitSourceRole: stage.unitSourceRole,
  };
  const compositionIdentity = {
    schema: LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
    stageId,
    compositionRootId: binding.compositionRootId,
    componentIds: binding.componentIds,
    lifecycleProfileId: binding.lifecycleProfileId,
    benchmarkManifestIds: binding.benchmarkManifestIds,
    benchmarkBindingState: binding.benchmarkBindingState,
    releaseStateBinding: binding.releaseStateBinding,
  };
  const productAdapterId = binding.componentIds.productAdapter;
  const productRequired = typeof productAdapterId === 'string';
  if (productRequired && !lafeaProductComponentRegistered(productAdapterId)) {
    throw new TypeError(`${stageId} product adapter is not registered.`);
  }
  const unitResolverId = binding.componentIds.unitResolver;
  if (stage.engineState === 'QUALIFIED_ROUTE_REGISTERED'
    && (typeof unitResolverId !== 'string' || !unitResolverId)) {
    throw new TypeError(`${stageId} unit resolver binding is missing.`);
  }

  return createTemplateTargetAuthoritySnapshot({
    targetStage: {
      stageId,
      registrySchema: LAFEA_STAGE_REGISTRY_SCHEMA,
      registryEntryHash: canonicalLafeaSha256(stageIdentity),
      engineState: stage.engineState,
      enginePackage: stage.enginePackage,
      stageAuthority: stage.authority,
      inputContractRole: stage.inputContractRole,
      resultContractRole: stage.resultContractRole,
    },
    compositionRoot: {
      compositionSchema: LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
      compositionRootId: binding.compositionRootId,
      compositionRootHash: canonicalLafeaSha256(compositionIdentity),
      componentIdsHash: canonicalLafeaSha256(binding.componentIds),
      releaseStateBinding: binding.releaseStateBinding,
    },
    lifecycleProfile: {
      profileSchema: LAFEA_LIFECYCLE_PROFILE_SCHEMA,
      profileId: lifecycle.profileId,
      profileHash: canonicalLafeaSha256(lifecycle),
      artifactKindsHash: canonicalLafeaSha256(lifecycle.artifactKinds),
      resultRequiredKindsHash: canonicalLafeaSha256(lifecycle.resultRequiredKinds),
      assessmentRequiredKindsHash: canonicalLafeaSha256(
        lifecycle.assessmentRequiredKinds,
      ),
      meshApplicable: lifecycle.meshApplicable,
      recoveryApplicable: lifecycle.artifactKinds.includes('RECOVERY'),
      convergenceApplicable: lifecycle.convergenceApplicable,
      codeAssessmentApplicable: lifecycle.codeAssessmentApplicable,
    },
    sourceContract: {
      sourceAuthoritySchema: LAFEA_SOURCE_AUTHORITY_SCHEMA,
      sourceAuthorityRole: LAFEA_SOURCE_AUTHORITY_ROLE,
      sourceContractRole: stage.inputContractRole,
      canonicalizationProfile: LAFEA_CANONICAL_SHA256_PROFILE,
    },
    unitProjection: {
      unitResolverId: unitResolverId ?? 'NO_UNIT_RESOLVER',
      unitSourceRole: stage.unitSourceRole ?? 'NO_UNIT_SOURCE_ROLE',
      targetUnitContractHash: canonicalLafeaSha256({
        stageId,
        unitResolverId,
        unitSourceRole: stage.unitSourceRole,
      }),
    },
    productAdapter: productRequired
      ? {
          applicability: 'REQUIRED',
          componentId: productAdapterId,
          componentHash: canonicalLafeaSha256({
            componentId: productAdapterId,
            registered: true,
          }),
          productProfileHash: canonicalLafeaSha256({
            stageId,
            componentId: productAdapterId,
            lifecycleProfileId: lifecycle.profileId,
          }),
        }
      : {
          applicability: 'NOT_APPLICABLE',
          componentId: null,
          componentHash: null,
          productProfileHash: null,
        },
    meshRequirement: lifecycle.meshApplicable
      ? {
          applicability: 'REQUIRED',
          authoritySchema: 'lafea-analysis-mesh-authority/v1',
          authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
          requiredStatus: 'ACCEPTED_BY_STAGE_CONTRACT',
        }
      : {
          applicability: 'NOT_APPLICABLE',
          authoritySchema: null,
          authorityRole: null,
          requiredStatus: null,
        },
    benchmarkBindings: {
      bindingState: binding.benchmarkBindingState,
      manifestIds: [...binding.benchmarkManifestIds],
      manifestHashes: binding.benchmarkManifestIds.map((manifestId) =>
        canonicalLafeaSha256({
          stageId,
          compositionRootId: binding.compositionRootId,
          manifestId,
        })),
    },
  });
}
