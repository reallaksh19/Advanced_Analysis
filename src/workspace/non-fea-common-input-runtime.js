import {
  assertCanonicalStagedJsonText,
  assertCommonCheckerDependencyIntegrity,
  assertCommonInputMethodPartition,
} from '../core/non-fea-common-checker/integrity.js';
import {
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentSidecar,
  resolveNonFeaEnrichment,
} from '../core/non-fea-enrichment/index.js';
import { deepFreeze, semanticHash } from '../core/shared-piping-model/index.js';
import { TopologyStore } from './topology-store.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { ModelLoadStore } from './model-load-store.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { nonFeaEnrichmentStore } from './enrichment/non-fea-enrichment-store.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { createConfiguredDefaultUsageLedger } from './project-data/non-fea-field-registry.js';
import {
  createConfiguredDefaultUsageRowsFromResolution,
  createNonFeaConfiguredDefaultProvider,
} from './project-data/non-fea-configured-default-provider.js';
import {
  assertRequestedLoadCasesAuthorized,
  createNonFeaLoadCaseAuthority,
} from './project-data/non-fea-load-case-authority.js';
import { WorkspaceState } from './workspace-state.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';

export function evaluateCurrentNonFeaCommonInput() {
  try {
    const input = buildCurrentPreFeaRequestInput();
    return nonFeaCommonInputStore.evaluate(input);
  } catch (error) {
    nonFeaCommonInputStore.setError(error);
    return nonFeaCommonInputStore.getSnapshot();
  }
}

export function sealCurrentNonFeaCommonInput(confirmation) {
  evaluateCurrentNonFeaCommonInput();
  if (nonFeaCommonInputStore.getSnapshot().error) {
    throw codedError(nonFeaCommonInputStore.getSnapshot().error, 'COMMON_INPUT_EVALUATION_FAILED');
  }
  const snapshot = nonFeaCommonInputStore.seal(confirmation);
  assertCommonInputMethodPartition(snapshot.commonInput);
  return snapshot;
}

export function exportCurrentNonFeaCommonInput() {
  const commonInput = nonFeaCommonInputStore.requireCurrentCommonInput();
  assertCommonInputMethodPartition(commonInput);
  return nonFeaCommonInputStore.exportCurrent();
}

export function reimportNonFeaCommonInput(text) {
  assertCanonicalStagedJsonText(text);
  const snapshot = nonFeaCommonInputStore.reimport(text);
  assertCommonInputMethodPartition(snapshot.commonInput);
  return snapshot;
}

export function requireCurrentNonFeaMethods(methodIds) {
  const snapshot = evaluateCurrentNonFeaCommonInput();
  if (snapshot.error) throw codedError(snapshot.error, 'COMMON_INPUT_EVALUATION_FAILED');
  const commonInput = nonFeaCommonInputStore.requireReadyMethods(methodIds);
  assertCommonInputMethodPartition(commonInput);
  return commonInput;
}

export function buildCurrentPreFeaRequestInput() {
  const workspace = WorkspaceState.getSnapshot();
  const dataset = workspace?.status === 'ready' ? workspace.dataset : null;
  if (!dataset?.sharedModel) throw codedError('An active shared piping model is required.', 'COMMON_INPUT_SOURCE_MODEL_REQUIRED');
  if (typeof dataset.sourceSha256 !== 'string') throw codedError('Active dataset SHA-256 is required.', 'COMMON_INPUT_SOURCE_HASH_REQUIRED');

  const configuration = nonFeaCommonInputStore.getSnapshot().configuration;
  const projectDataProfile = projectDataStore.getProfile();
  const loadCaseAuthority = createNonFeaLoadCaseAuthority(projectDataProfile);
  if (loadCaseAuthority.state === 'READY') {
    assertRequestedLoadCasesAuthorized(loadCaseAuthority, configuration.requestedLoadCases);
  }

  nonFeaEnrichmentStore.loadSource(dataset.sharedModel.semanticHash);
  const enrichment = nonFeaEnrichmentStore.getSnapshot();
  if (enrichment.migrationReport?.blockers?.length) {
    throw codedError('Legacy migration decisions are unresolved.', 'COMMON_INPUT_MIGRATION_BLOCKED');
  }
  if (enrichment.stale) throw codedError('Accepted enrichment records are stale.', 'COMMON_INPUT_ENRICHMENT_STALE');

  const acceptedEnrichmentSidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: dataset.sharedModel.semanticHash,
    records: enrichment.acceptedRecords,
  });
  const configuredDefaultProvider = createNonFeaConfiguredDefaultProvider({
    profile: projectDataProfile,
    sourceModel: dataset.sharedModel,
    requestedMethods: configuration.requestedMethods,
  });
  if (configuredDefaultProvider.blockers.length) {
    const error = codedError('Configured-default evidence is blocked.', 'COMMON_INPUT_CONFIGURED_DEFAULTS_BLOCKED');
    error.details = configuredDefaultProvider.blockers;
    throw error;
  }

  // This sidecar is an ephemeral resolver evidence bundle. The accepted user
  // sidecar remains separately stored; Project Data defaults are compiled into
  // exact ENTITY records only for resolution and are never written back to it.
  const enrichmentSidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: dataset.sharedModel.semanticHash,
    records: [
      ...acceptedEnrichmentSidecar.records,
      ...configuredDefaultProvider.records,
    ],
  });
  const resolutionLedger = resolveNonFeaEnrichment({
    sourceModel: dataset.sharedModel,
    sidecar: enrichmentSidecar,
  });
  if (resolutionLedger.status !== 'READY') {
    const error = codedError('The common field-resolution ledger is blocked.', 'COMMON_INPUT_RESOLUTION_BLOCKED');
    error.details = resolutionLedger.blockers;
    throw error;
  }
  const enrichedProjection = createNonFeaEnrichedProjection({
    sourceModel: dataset.sharedModel,
    resolutionLedger,
  });

  const configuredDefaultUsageRows = createConfiguredDefaultUsageRowsFromResolution({
    resolutionLedger,
    requestedMethods: configuration.requestedMethods,
  });
  const configuredDefaultUsageLedger = createConfiguredDefaultUsageLedger(
    projectDataProfile,
    configuredDefaultUsageRows,
  );
  const qualificationProfile = selectQualificationProfile(projectDataProfile, configuration);
  assertCommonCheckerDependencyIntegrity({
    enrichmentSidecar,
    resolutionLedger,
    enrichedProjection,
    configuredDefaultUsageLedger,
  });
  const requestId = [
    'PRE-FEA',
    dataset.datasetId || 'ACTIVE-DATASET',
    configuration.requestedMethods.join('+'),
    configuration.requestedLoadCases.join('+'),
    qualificationProfile ? `${qualificationProfile.profileId}@${qualificationProfile.version}` : 'NO-QUALIFICATION',
  ].join(':');

  return {
    requestId,
    sourceDatasetSha256: dataset.sourceSha256,
    requestedMethods: configuration.requestedMethods,
    requestedLoadCases: configuration.requestedLoadCases,
    sourceModel: dataset.sharedModel,
    enrichmentSidecar,
    acceptedEnrichmentSidecar,
    configuredDefaultProvider,
    loadCaseAuthority,
    resolutionLedger,
    enrichedProjection,
    projectDataProfile,
    projectDataOrigin: projectDataStore.getOrigin(),
    authorityContracts: {
      topologyGraph: TopologyStore.getGraph(),
      supportAttachmentModel: SupportRestraintStore.getAttachmentModel(),
      restraintCapabilityModel: SupportRestraintStore.getRestraintModel(),
      supportSiteModel: ensureAuthoritySemanticHash(engineeringModelStore.getSupportSiteModel()),
      routePartitionModel: ensureAuthoritySemanticHash(engineeringModelStore.getRoutePartitionModel()),
      loadPrimitiveSet: ModelLoadStore.getLoadPrimitiveSet(),
    },
    qualificationProfile,
    configuredDefaultUsageLedger,
  };
}

export function listCurrentQualificationProfiles() {
  const profile = projectDataStore.getProfile();
  const entry = profile?.qualificationPolicy?.qualificationProfiles;
  if (!entry || entry.approved !== true || !entry.evidence?.source) return [];
  const value = entry.value;
  if (!value || value.schema !== 'non-fea-qualification-profile-set/v1' || !Array.isArray(value.profiles)) return [];
  return value.profiles.map((row) => ({ ...structuredClone(row) }));
}

export function getCurrentNonFeaLoadCaseAuthority() {
  return createNonFeaLoadCaseAuthority(projectDataStore.getProfile());
}

function selectQualificationProfile(projectDataProfile, configuration) {
  if (!configuration.qualificationProfileId || !configuration.qualificationProfileVersion) return null;
  const entry = projectDataProfile?.qualificationPolicy?.qualificationProfiles;
  if (!entry || entry.approved !== true || !entry.evidence?.source) {
    throw codedError('Qualification profile authority is not approved and source-evidenced.', 'COMMON_INPUT_QUALIFICATION_AUTHORITY_REQUIRED');
  }
  const set = entry.value;
  if (!set || set.schema !== 'non-fea-qualification-profile-set/v1' || !Array.isArray(set.profiles)) {
    throw codedError('Qualification profile set is invalid.', 'COMMON_INPUT_QUALIFICATION_SET_INVALID');
  }
  const selected = set.profiles.find((row) => (
    row.profileId === configuration.qualificationProfileId
    && row.version === configuration.qualificationProfileVersion
  ));
  if (!selected) {
    throw codedError(
      `Qualification profile ${configuration.qualificationProfileId}@${configuration.qualificationProfileVersion} was not found.`,
      'COMMON_INPUT_QUALIFICATION_PROFILE_NOT_FOUND',
    );
  }
  return selected;
}

function ensureAuthoritySemanticHash(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (typeof value.semanticHash === 'string' && value.semanticHash.includes(':')) return value;
  const base = structuredClone(value);
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
