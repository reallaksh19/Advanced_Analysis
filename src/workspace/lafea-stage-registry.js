export const LAFEA_STAGE_REGISTRY_SCHEMA = 'lafea-stage-registry/v2';

export const LAFEA_STAGE_CATEGORIES = Object.freeze([
  'FOUNDATION_LOAD_TRANSFER',
  'PIPE_SECTION_SCREENING',
  'CONTINUUM_2D',
  'THIN_SHELL',
  'TRUNNION_FOOTPRINT',
  'WELD_PROFILE_PLACEHOLDER',
]);

export const LAFEA_ENGINE_STATES = Object.freeze([
  'QUALIFIED_ROUTE_REGISTERED',
  'ENGINE_NOT_IMPLEMENTED',
]);

export const LAFEA_PREVIEW_POLICIES = Object.freeze([
  'SOURCE_POINTS_DISPLAY_ONLY',
  'NO_GEOMETRY_AUTHORITY',
  'SOURCE_MESH_EDITABLE',
  'SOURCE_SHELL_TEMPLATE_EDITABLE',
  'EXPLICIT_SOURCE_GEOMETRY_DISPLAY_ONLY',
]);

export const LAFEA_RELEASE_BINDING_STATES = Object.freeze([
  'RELEASE_NOT_QUALIFIED',
]);

export const LAFEA_RELEASE_BINDING_POLICIES = Object.freeze([
  'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED',
  'UNSUPPORTED_STAGE',
]);

export const LAFEA_STAGE_REGISTRY = Object.freeze([
  entry({
    stageId: 'LAFEA.1',
    label: 'Attachment foundation',
    purpose: 'Load transfer and elastic pressure baseline only',
    limitation: 'No finite-element or local attachment-stress authority.',
    category: 'FOUNDATION_LOAD_TRANSFER',
    authority: 'LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY',
    authorityPathId: 'LAFEA.1/CURRENT_CORE/ANALYTICAL_FOUNDATION/V1',
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-stress',
    inputContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_SOURCE',
    resultContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_RESULT',
    presenterRole: 'ATTACHMENT_FOUNDATION_EVIDENCE',
    unitSourceRole: 'DOCUMENT_UNITS',
    lifecycleProfileId: 'ANALYTICAL_FOUNDATION_V1',
    componentIds: components('LAFEA.1', 'ATTACHMENT_FOUNDATION'),
    benchmarkManifestIds: ['LAFEA.1/ATTACHMENT_FOUNDATION/CURRENT_CORE_QUALIFICATION/V1'],
    releaseStateBinding: releaseBinding(
      'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED',
    ),
    previewPolicy: 'SOURCE_POINTS_DISPLAY_ONLY',
    previewSource: {
      nodePath: 'loadReferencePoints',
      elementPath: null,
      editable: false,
    },
    collectionPaths: ['materials', 'pressureDefinitions', 'loadReferencePoints', 'loadCases'],
    limitations: [
      'No finite-element analysis or local attachment stress.',
      'No shell bending, weld stress, contact or code assessment.',
    ],
  }),
  entry({
    stageId: 'LAFEA.2',
    label: 'Pipe-section screening',
    purpose: 'Nominal far-field pipe-section screening only',
    limitation: 'No local discontinuity or attachment-stress authority.',
    category: 'PIPE_SECTION_SCREENING',
    authority: 'NOMINAL_PIPE_SECTION_SCREENING_ONLY',
    authorityPathId: 'LAFEA.2/CURRENT_CORE/ANALYTICAL_SCREENING/V1',
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-attachment-screening',
    inputContractRole: 'LOCAL_ATTACHMENT_SCREENING_REQUEST',
    resultContractRole: 'LOCAL_ATTACHMENT_SCREENING_RESULT',
    presenterRole: 'PIPE_SECTION_SCREENING_EVIDENCE',
    unitSourceRole: 'FOUNDATION_CANONICAL_UNITS',
    lifecycleProfileId: 'ANALYTICAL_SCREENING_V1',
    componentIds: components('LAFEA.2', 'PIPE_SECTION_SCREENING'),
    benchmarkManifestIds: ['LAFEA.2/PIPE_SECTION_SCREENING/CURRENT_CORE_QUALIFICATION/V1'],
    releaseStateBinding: releaseBinding(
      'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED',
    ),
    previewPolicy: 'NO_GEOMETRY_AUTHORITY',
    previewSource: {
      nodePath: null,
      elementPath: null,
      editable: false,
    },
    collectionPaths: ['screeningCases', 'evaluationLocations'],
    limitations: [
      'No local discontinuity or attachment stress.',
      'No transverse-shear recovery, shell analysis, weld analysis or code assessment.',
    ],
  }),
  entry({
    stageId: 'LAFEA.3',
    label: '2D continuum',
    purpose: 'T6/Q8 continuum with T3 fallback and benchmark support',
    limitation: 'Production geometry-to-mesh-to-convergence orchestration is incomplete.',
    category: 'CONTINUUM_2D',
    authority: 'T3_T6_Q8_LINEAR_CONTINUUM',
    authorityPathId: 'LAFEA.3/CURRENT_CORE/T3_T6_Q8_CONTINUUM/V1',
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-continuum',
    inputContractRole: 'LOCAL_CONTINUUM_MODEL',
    resultContractRole: 'LOCAL_CONTINUUM_RESULT',
    presenterRole: 'CONTINUUM_RESULT_EVIDENCE',
    unitSourceRole: 'DOCUMENT_UNITS',
    lifecycleProfileId: 'FEA_MESH_RECOVERY_V1',
    componentIds: components('LAFEA.3', 'T3_T6_Q8_CONTINUUM'),
    benchmarkManifestIds: ['LAFEA.3/T3_T6_Q8_CONTINUUM/CURRENT_CORE_QUALIFICATION/V1'],
    releaseStateBinding: releaseBinding(
      'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED',
    ),
    previewPolicy: 'SOURCE_MESH_EDITABLE',
    previewSource: {
      nodePath: 'nodes',
      elementPath: 'elements',
      editable: true,
    },
    collectionPaths: ['materials', 'nodes', 'elements', 'constraints', 'loadCases'],
    limitations: [
      'Integration-point stress is authoritative for T6/Q8; nodal projection is display-only.',
      'Production geometry-to-mesh-to-convergence orchestration is not complete.',
    ],
  }),
  entry({
    stageId: 'LAFEA.4',
    label: 'Thin shell',
    purpose: 'Legacy five-DOF triangular CST+DKT thin-shell path',
    limitation: 'No production MITC4/MITC3 or thick-shell authority.',
    category: 'THIN_SHELL',
    authority: 'CST_DKT_TRI3_THIN_SHELL_V1',
    authorityPathId: 'LAFEA.4/CURRENT_CORE/CST_DKT_TRI3_THIN_SHELL/V1',
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-shell',
    inputContractRole: 'LOCAL_SHELL_MODEL',
    resultContractRole: 'LOCAL_SHELL_RESULT',
    presenterRole: 'SHELL_RESULT_EVIDENCE',
    unitSourceRole: 'DOCUMENT_UNITS',
    lifecycleProfileId: 'FEA_MESH_RECOVERY_V1',
    componentIds: components('LAFEA.4', 'CST_DKT_TRI3_THIN_SHELL'),
    benchmarkManifestIds: ['LAFEA.4/CST_DKT_TRI3_THIN_SHELL/CURRENT_CORE_QUALIFICATION/V1'],
    releaseStateBinding: releaseBinding(
      'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED',
    ),
    previewPolicy: 'SOURCE_MESH_EDITABLE',
    previewSource: {
      nodePath: 'nodes',
      elementPath: 'elements',
      editable: true,
    },
    collectionPaths: ['materials', 'nodes', 'elements', 'constraints', 'loadCases'],
    limitations: [
      'Current production dispatch is the legacy five-DOF triangular thin-shell path.',
      'No production MITC4/MITC3 claim, drilling DOF, thick-shell claim, weld stress or code assessment.',
    ],
  }),
  entry({
    stageId: 'LAFEA.5',
    label: 'Trunnion footprint',
    purpose: 'Caller-authored host-shell footprint load distribution',
    limitation: 'No generated trunnion stiffness, weld, contact or code assessment.',
    category: 'TRUNNION_FOOTPRINT',
    authority: 'CALLER_AUTHORED_HOST_SHELL_FOOTPRINT_ONLY',
    authorityPathId: 'LAFEA.5/CURRENT_CORE/TRUNNION_FOOTPRINT/V1',
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-trunnion-footprint',
    inputContractRole: 'TRUNNION_FOOTPRINT_SOURCE',
    resultContractRole: 'TRUNNION_FOOTPRINT_RESULT',
    presenterRole: 'TRUNNION_FOOTPRINT_EVIDENCE',
    unitSourceRole: 'SHELL_TEMPLATE_UNITS',
    lifecycleProfileId: 'FEA_MESH_RECOVERY_V1',
    componentIds: components('LAFEA.5', 'TRUNNION_FOOTPRINT'),
    benchmarkManifestIds: ['LAFEA.5/TRUNNION_FOOTPRINT/CURRENT_CORE_QUALIFICATION/V1'],
    releaseStateBinding: releaseBinding(
      'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED',
    ),
    previewPolicy: 'SOURCE_SHELL_TEMPLATE_EDITABLE',
    previewSource: {
      nodePath: 'shellTemplate.nodes',
      elementPath: 'shellTemplate.elements',
      editable: true,
    },
    collectionPaths: [
      'shellTemplate.materials',
      'shellTemplate.nodes',
      'shellTemplate.elements',
      'shellTemplate.constraints',
      'loadCaseMappings',
      'assessmentRegions',
    ],
    limitations: [
      'No generated trunnion stiffness, weld, contact or pressure superposition.',
      'No code assessment; footprint-adjacent peaks remain load-introduction-sensitive.',
    ],
  }),
  entry({
    stageId: 'LAFEA.6',
    label: 'Weld profile',
    purpose: 'Not implemented — no qualified stage engine',
    limitation: 'No qualified weld schema, calculator, result validator or benchmark manifest.',
    category: 'WELD_PROFILE_PLACEHOLDER',
    authority: 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED',
    authorityPathId: 'LAFEA.6/UNSUPPORTED/WELD_PROFILE_PLACEHOLDER/V1',
    engineState: 'ENGINE_NOT_IMPLEMENTED',
    enginePackage: null,
    inputContractRole: 'UNQUALIFIED_PLACEHOLDER_SOURCE',
    resultContractRole: null,
    presenterRole: 'UNSUPPORTED_STAGE_DIAGNOSTIC',
    unitSourceRole: null,
    lifecycleProfileId: 'UNSUPPORTED_STAGE_V1',
    componentIds: components('LAFEA.6', 'UNSUPPORTED_WELD_PROFILE'),
    benchmarkManifestIds: [],
    releaseStateBinding: releaseBinding('UNSUPPORTED_STAGE'),
    previewPolicy: 'EXPLICIT_SOURCE_GEOMETRY_DISPLAY_ONLY',
    previewSource: {
      nodePath: 'nodes',
      elementPath: 'elements',
      editable: false,
    },
    collectionPaths: ['nodes', 'elements', 'materials', 'loadCases'],
    limitations: [
      'Calculation is disabled.',
      'No qualified weld schema, calculator, result validator or benchmark manifest is registered.',
    ],
  }),
]);

export const LAFEA_STAGE_IDS = Object.freeze(
  LAFEA_STAGE_REGISTRY.map((row) => row.stageId),
);

export const LAFEA_STAGE_AUTHORITY_PATH_IDS = deepFreeze(
  Object.fromEntries(LAFEA_STAGE_REGISTRY.map((row) => [row.stageId, row.authorityPathId])),
);

export const LAFEA_STAGE_DEFINITIONS = Object.freeze(
  LAFEA_STAGE_REGISTRY.map((row) => Object.freeze({
    stageId: row.stageId,
    label: row.label,
    purpose: row.purpose,
  })),
);

assertRegistryUniqueness();

export function requireLafeaStageRegistryEntry(stageId) {
  if (!LAFEA_STAGE_IDS.includes(stageId)) {
    throw new TypeError(`Unsupported LAFEA stage identity: ${stageId}`);
  }
  const result = LAFEA_STAGE_REGISTRY.find((row) => row.stageId === stageId);
  if (!result) throw new TypeError(`LAFEA registry entry is missing for ${stageId}.`);
  return result;
}

export function lafeaRegisteredExecutionSupported(stageId) {
  return requireLafeaStageRegistryEntry(stageId).engineState === 'QUALIFIED_ROUTE_REGISTERED';
}

export function lafeaRegisteredCollectionPaths(stageId) {
  return requireLafeaStageRegistryEntry(stageId).collectionPaths;
}

export function lafeaRegisteredPreviewSource(stageId) {
  return requireLafeaStageRegistryEntry(stageId).previewSource;
}

export function lafeaRegisteredAuthorityPath(stageId) {
  return requireLafeaStageRegistryEntry(stageId).authorityPathId;
}

export function lafeaRegisteredComponentIds(stageId) {
  return requireLafeaStageRegistryEntry(stageId).componentIds;
}

export function lafeaRegisteredBenchmarkManifestIds(stageId) {
  return requireLafeaStageRegistryEntry(stageId).benchmarkManifestIds;
}

export function lafeaRegisteredLifecycleProfileId(stageId) {
  return requireLafeaStageRegistryEntry(stageId).lifecycleProfileId;
}

export function lafeaRegisteredReleaseStateBinding(stageId) {
  return requireLafeaStageRegistryEntry(stageId).releaseStateBinding;
}

function components(stageId, role) {
  return {
    documentNormalizerId: `${stageId}/NORMALIZER/${role}/V1`,
    editResealerId: `${stageId}/EDIT_RESEAL/${role}/V1`,
    canonicalInputFactoryId: `${stageId}/CANONICAL_INPUT/${role}/V1`,
    calculationExecutorId: `${stageId}/EXECUTOR/${role}/V1`,
    acceptanceEvaluatorId: `${stageId}/ACCEPTANCE/${role}/V1`,
    presenterId: `${stageId}/PRESENTER/${role}/V1`,
  };
}

function releaseBinding(policy) {
  return {
    state: 'RELEASE_NOT_QUALIFIED',
    policy,
    automaticPromotion: false,
  };
}

function entry(value) {
  const record = deepFreeze({
    schema: LAFEA_STAGE_REGISTRY_SCHEMA,
    ...value,
  });
  validateEntry(record);
  return record;
}

function validateEntry(value) {
  if (!value.stageId || !value.authorityPathId || !value.lifecycleProfileId) {
    throw new TypeError('A registry-v2 entry requires stage, authority-path and lifecycle-profile identity.');
  }
  if (!LAFEA_RELEASE_BINDING_STATES.includes(value.releaseStateBinding?.state)) {
    throw new TypeError(`Invalid release-state binding for ${value.stageId}.`);
  }
  if (!LAFEA_RELEASE_BINDING_POLICIES.includes(value.releaseStateBinding?.policy)) {
    throw new TypeError(`Invalid release policy for ${value.stageId}.`);
  }
  if (value.releaseStateBinding.automaticPromotion !== false) {
    throw new TypeError(`Automatic release promotion is prohibited for ${value.stageId}.`);
  }
  for (const [name, componentId] of Object.entries(value.componentIds ?? {})) {
    if (typeof componentId !== 'string' || !componentId.length) {
      throw new TypeError(`Invalid ${name} component identity for ${value.stageId}.`);
    }
  }
  if (!Array.isArray(value.benchmarkManifestIds)) {
    throw new TypeError(`Benchmark-manifest bindings are required for ${value.stageId}.`);
  }
  if (value.engineState === 'QUALIFIED_ROUTE_REGISTERED' && !value.benchmarkManifestIds.length) {
    throw new TypeError(`A qualified route requires a benchmark-manifest identity: ${value.stageId}.`);
  }
  if (value.engineState === 'ENGINE_NOT_IMPLEMENTED' && value.benchmarkManifestIds.length) {
    throw new TypeError(`An unsupported route cannot claim benchmark manifests: ${value.stageId}.`);
  }
}

function assertRegistryUniqueness() {
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) {
      throw new TypeError(`Duplicate LAFEA registry ${label}.`);
    }
  };
  unique(LAFEA_STAGE_REGISTRY.map((row) => row.stageId), 'stage identity');
  unique(LAFEA_STAGE_REGISTRY.map((row) => row.authorityPathId), 'authority path');
  unique(
    LAFEA_STAGE_REGISTRY.flatMap((row) => Object.values(row.componentIds)),
    'component identity',
  );
  unique(
    LAFEA_STAGE_REGISTRY.flatMap((row) => row.benchmarkManifestIds),
    'benchmark-manifest identity',
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
