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

export const LAFEA_STAGE_RELEASE_STATES = Object.freeze([
  'RELEASE_NOT_QUALIFIED',
  'RELEASE_QUALIFIED',
]);

export const LAFEA_STAGE_RELEASE_GATE_POLICIES = Object.freeze([
  'ALL_REQUIRED_BENCHMARK_AND_ANTI_DRIFT_GATES_PASS',
  'ENGINE_NOT_IMPLEMENTED_BLOCKS_RELEASE',
]);

export const LAFEA_COMPONENT_ROLES = Object.freeze([
  'sourceNormalizer',
  'canonicalInputAdapter',
  'calculator',
  'resultAcceptance',
  'lifecycleProducer',
]);

export const LAFEA_STAGE_REGISTRY = Object.freeze([
  entry({
    stageId: 'LAFEA.1',
    label: 'Attachment foundation',
    purpose: 'Load transfer and elastic pressure baseline only',
    limitation: 'No finite-element or local attachment-stress authority.',
    category: 'FOUNDATION_LOAD_TRANSFER',
    authority: 'LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY',
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-stress',
    inputContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_SOURCE',
    resultContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_RESULT',
    presenterRole: 'ATTACHMENT_FOUNDATION_EVIDENCE',
    unitSourceRole: 'DOCUMENT_UNITS',
    previewPolicy: 'SOURCE_POINTS_DISPLAY_ONLY',
    previewSource: {
      nodePath: 'loadReferencePoints',
      elementPath: null,
      editable: false,
    },
    collectionPaths: ['materials', 'pressureDefinitions', 'loadReferencePoints', 'loadCases'],
    compositionRootId: 'LAFEA.1/CURRENT_CORE_COMPOSITION/V1',
    componentIds: componentIds('LAFEA.1', 'local-stress'),
    lifecycleProfileId: 'ANALYTICAL_FOUNDATION_V1',
    benchmarkManifestId: 'LAFEA.1/CURRENT_CORE_BENCHMARK_MANIFEST/V1',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    releaseGatePolicy: 'ALL_REQUIRED_BENCHMARK_AND_ANTI_DRIFT_GATES_PASS',
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
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-attachment-screening',
    inputContractRole: 'LOCAL_ATTACHMENT_SCREENING_REQUEST',
    resultContractRole: 'LOCAL_ATTACHMENT_SCREENING_RESULT',
    presenterRole: 'PIPE_SECTION_SCREENING_EVIDENCE',
    unitSourceRole: 'FOUNDATION_CANONICAL_UNITS',
    previewPolicy: 'NO_GEOMETRY_AUTHORITY',
    previewSource: {
      nodePath: null,
      elementPath: null,
      editable: false,
    },
    collectionPaths: ['screeningCases', 'evaluationLocations'],
    compositionRootId: 'LAFEA.2/CURRENT_CORE_COMPOSITION/V1',
    componentIds: componentIds('LAFEA.2', 'local-attachment-screening'),
    lifecycleProfileId: 'ANALYTICAL_SCREENING_V1',
    benchmarkManifestId: 'LAFEA.2/CURRENT_CORE_BENCHMARK_MANIFEST/V1',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    releaseGatePolicy: 'ALL_REQUIRED_BENCHMARK_AND_ANTI_DRIFT_GATES_PASS',
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
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-continuum',
    inputContractRole: 'LOCAL_CONTINUUM_MODEL',
    resultContractRole: 'LOCAL_CONTINUUM_RESULT',
    presenterRole: 'CONTINUUM_RESULT_EVIDENCE',
    unitSourceRole: 'DOCUMENT_UNITS',
    previewPolicy: 'SOURCE_MESH_EDITABLE',
    previewSource: {
      nodePath: 'nodes',
      elementPath: 'elements',
      editable: true,
    },
    collectionPaths: ['materials', 'nodes', 'elements', 'constraints', 'loadCases'],
    compositionRootId: 'LAFEA.3/CURRENT_CORE_COMPOSITION/V1',
    componentIds: componentIds('LAFEA.3', 'local-continuum'),
    lifecycleProfileId: 'FEA_MESH_RECOVERY_V1',
    benchmarkManifestId: 'LAFEA.3/CURRENT_CORE_BENCHMARK_MANIFEST/V1',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    releaseGatePolicy: 'ALL_REQUIRED_BENCHMARK_AND_ANTI_DRIFT_GATES_PASS',
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
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-shell',
    inputContractRole: 'LOCAL_SHELL_MODEL',
    resultContractRole: 'LOCAL_SHELL_RESULT',
    presenterRole: 'SHELL_RESULT_EVIDENCE',
    unitSourceRole: 'DOCUMENT_UNITS',
    previewPolicy: 'SOURCE_MESH_EDITABLE',
    previewSource: {
      nodePath: 'nodes',
      elementPath: 'elements',
      editable: true,
    },
    collectionPaths: ['materials', 'nodes', 'elements', 'constraints', 'loadCases'],
    compositionRootId: 'LAFEA.4/CURRENT_CORE_COMPOSITION/V1',
    componentIds: componentIds('LAFEA.4', 'local-shell'),
    lifecycleProfileId: 'FEA_MESH_RECOVERY_V1',
    benchmarkManifestId: 'LAFEA.4/CURRENT_CORE_BENCHMARK_MANIFEST/V1',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    releaseGatePolicy: 'ALL_REQUIRED_BENCHMARK_AND_ANTI_DRIFT_GATES_PASS',
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
    engineState: 'QUALIFIED_ROUTE_REGISTERED',
    enginePackage: 'local-trunnion-footprint',
    inputContractRole: 'TRUNNION_FOOTPRINT_SOURCE',
    resultContractRole: 'TRUNNION_FOOTPRINT_RESULT',
    presenterRole: 'TRUNNION_FOOTPRINT_EVIDENCE',
    unitSourceRole: 'SHELL_TEMPLATE_UNITS',
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
    compositionRootId: 'LAFEA.5/CURRENT_CORE_COMPOSITION/V1',
    componentIds: componentIds('LAFEA.5', 'local-trunnion-footprint'),
    lifecycleProfileId: 'FEA_MESH_RECOVERY_V1',
    benchmarkManifestId: 'LAFEA.5/CURRENT_CORE_BENCHMARK_MANIFEST/V1',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    releaseGatePolicy: 'ALL_REQUIRED_BENCHMARK_AND_ANTI_DRIFT_GATES_PASS',
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
    engineState: 'ENGINE_NOT_IMPLEMENTED',
    enginePackage: null,
    inputContractRole: 'UNQUALIFIED_PLACEHOLDER_SOURCE',
    resultContractRole: null,
    presenterRole: 'UNSUPPORTED_STAGE_DIAGNOSTIC',
    unitSourceRole: null,
    previewPolicy: 'EXPLICIT_SOURCE_GEOMETRY_DISPLAY_ONLY',
    previewSource: {
      nodePath: 'nodes',
      elementPath: 'elements',
      editable: false,
    },
    collectionPaths: ['nodes', 'elements', 'materials', 'loadCases'],
    compositionRootId: 'LAFEA.6/UNSUPPORTED_STAGE_COMPOSITION/V1',
    componentIds: unsupportedComponentIds(),
    lifecycleProfileId: 'UNSUPPORTED_STAGE_V1',
    benchmarkManifestId: null,
    releaseState: 'RELEASE_NOT_QUALIFIED',
    releaseGatePolicy: 'ENGINE_NOT_IMPLEMENTED_BLOCKS_RELEASE',
    limitations: [
      'Calculation is disabled.',
      'No qualified weld schema, calculator, result validator or benchmark manifest is registered.',
    ],
  }),
]);

export const LAFEA_STAGE_IDS = Object.freeze(
  LAFEA_STAGE_REGISTRY.map((row) => row.stageId),
);

export const LAFEA_STAGE_DEFINITIONS = Object.freeze(
  LAFEA_STAGE_REGISTRY.map((row) => Object.freeze({
    stageId: row.stageId,
    label: row.label,
    purpose: row.purpose,
  })),
);

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

export function lafeaRegisteredCompositionRootId(stageId) {
  return requireLafeaStageRegistryEntry(stageId).compositionRootId;
}

export function lafeaRegisteredComponentIds(stageId) {
  return requireLafeaStageRegistryEntry(stageId).componentIds;
}

export function lafeaRegisteredLifecycleProfileId(stageId) {
  return requireLafeaStageRegistryEntry(stageId).lifecycleProfileId;
}

export function lafeaRegisteredBenchmarkManifestId(stageId) {
  return requireLafeaStageRegistryEntry(stageId).benchmarkManifestId;
}

export function lafeaRegisteredReleaseState(stageId) {
  return requireLafeaStageRegistryEntry(stageId).releaseState;
}

function componentIds(stageId, enginePackage) {
  return {
    sourceNormalizer: `${stageId}/${enginePackage}/SOURCE_NORMALIZER/V1`,
    canonicalInputAdapter: `${stageId}/${enginePackage}/CANONICAL_INPUT_ADAPTER/V1`,
    calculator: `${stageId}/${enginePackage}/CALCULATOR/V1`,
    resultAcceptance: `${stageId}/${enginePackage}/RESULT_ACCEPTANCE/V1`,
    lifecycleProducer: `NB-T2/${stageId}/${enginePackage}`,
  };
}

function unsupportedComponentIds() {
  return {
    sourceNormalizer: 'LAFEA.6/UNSUPPORTED_SOURCE_PASSTHROUGH/V1',
    canonicalInputAdapter: null,
    calculator: null,
    resultAcceptance: null,
    lifecycleProducer: null,
  };
}

function entry(value) {
  const componentKeys = Object.keys(value.componentIds ?? {}).sort();
  if (JSON.stringify(componentKeys) !== JSON.stringify([...LAFEA_COMPONENT_ROLES].sort())) {
    throw new TypeError(`LAFEA registry component roles are invalid for ${value.stageId}.`);
  }
  if (!LAFEA_STAGE_RELEASE_STATES.includes(value.releaseState)) {
    throw new TypeError(`LAFEA registry release state is invalid for ${value.stageId}.`);
  }
  if (!LAFEA_STAGE_RELEASE_GATE_POLICIES.includes(value.releaseGatePolicy)) {
    throw new TypeError(`LAFEA registry release gate policy is invalid for ${value.stageId}.`);
  }
  return deepFreeze({
    schema: LAFEA_STAGE_REGISTRY_SCHEMA,
    ...value,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
