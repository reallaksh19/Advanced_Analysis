/**
 * NB-T4B retained recovery-to-render producer.
 *
 * The producer consumes an already accepted stage calculation and an explicit
 * NB-T4A-qualified analysis mesh. It creates parent-bound EXECUTION/RECOVERY
 * lifecycle records and a display-only V2 packet. It does not invoke a solver,
 * compute new engineering stress, smooth across elements, assess code or
 * qualify release.
 */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  sourceAuthorityDocument,
  validateLafeaSourceAuthority,
} from './lafea-source-authority.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  sealRenderPacketV2,
} from './lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA,
  LAFEA_RECOVERY_RENDER_FEA_STAGES,
  LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA,
  LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA,
  LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY,
  lafeaRecoveryRenderDisplayGeometryHash,
  lafeaRecoveryRenderProfileHash,
  lafeaRecoveryRenderPackageHash,
  rebuildAnalysisMeshEvidence,
  recoveryRenderError,
  requireLafeaRecoveryRenderFieldRequest,
  requireLafeaRecoveryRenderPackage,
  requireRecoveryRenderExactRecord,
} from './lafea-recovery-render-contract.js';

export {
  LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA,
  LAFEA_RECOVERY_RENDER_FEA_STAGES,
  LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
  LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA,
  LAFEA_RECOVERY_RENDER_LOCATION_KINDS,
  LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
  LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA,
  LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  LAFEA_RECOVERY_RENDER_QUANTITIES,
  LAFEA_RECOVERY_RENDER_SHELL_SURFACES,
  LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY,
  lafeaRecoveryRenderDisplayGeometryHash,
  lafeaRecoveryRenderProfileHash,
  lafeaRecoveryRenderPackageHash,
} from './lafea-recovery-render-contract.js';

const INTAKE_KEYS = Object.freeze([
  'schema', 'stageId', 'sceneRevision', 'lifecycle', 'sourceAuthority',
  'analysisMeshEvidence', 'execution', 'fieldRequest',
]);
const QUANTITY_KEYS = Object.freeze({
  SIGMA_X: 'sigmaX',
  SIGMA_Y: 'sigmaY',
  TAU_XY: 'tauXY',
});
const SHELL_ELEMENT = 'CST_DKT_TRI3_THIN_SHELL_V1';
const SHELL_RENDER_ELEMENT = 'CST_DKT_TRI3';

export function createLafeaRecoveryRenderPackage(intakeValue) {
  const intake = requireRecoveryRenderExactRecord(
    intakeValue, INTAKE_KEYS, 'recovery render intake',
  );
  if (intake.schema !== LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA_INVALID');
  }
  const stageId = requireFeaStage(intake.stageId);
  const stage = requireLafeaStageRegistryEntry(stageId);
  const profile = requireLafeaLifecycleProfileForStage(stageId);
  if (stage.engineState !== 'QUALIFIED_ROUTE_REGISTERED'
    || !profile.meshApplicable) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_STAGE_NOT_AUTHORIZED');
  }
  requireRevision(intake.sceneRevision);
  const authority = validateLafeaSourceAuthority(intake.sourceAuthority);
  const meshEvidence = rebuildAnalysisMeshEvidence(intake.analysisMeshEvidence);
  const execution = requireAcceptedExecution(stageId, intake.execution);
  const fieldRequest = requireLafeaRecoveryRenderFieldRequest(intake.fieldRequest);
  const lifecycle = requireLifecycleParents(
    intake.lifecycle, stageId, profile.profileId, authority, meshEvidence,
  );
  requireSourceAuthority(stageId, authority, execution);

  const canonicalModelHash = canonicalModelArtifactHash(
    stageId, authority.sourceHash, execution.canonicalInput,
  );
  if (canonicalModelHash !== meshEvidence.canonicalModelHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_CANONICAL_MODEL_MISMATCH');
  }
  const displayGeometryHash = lafeaRecoveryRenderDisplayGeometryHash(
    stageId, meshEvidence,
  );
  const renderProfileHash = lafeaRecoveryRenderProfileHash(fieldRequest);
  requireDisplayProfiles(lifecycle, displayGeometryHash, renderProfileHash);
  requireStressUnits(stageId, execution, fieldRequest.units);

  const physicalLoadCaseHash = engineeringHash(stageId, 'PHYSICAL_LOAD_CASE_INPUT',
    physicalLoadPayload(stageId, execution.canonicalInput));
  const solverProfileHash = engineeringHash(stageId, 'SOLVER_PROFILE', {
    enginePackage: stage.enginePackage,
    authority: stage.authority,
    producerRevision: LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  });
  const acceptedResultHash = canonicalLafeaSha256({
    schema: 'lafea-accepted-stage-result-hash-input/v1',
    stageId,
    result: execution.result,
  });
  const executionHash = engineeringHash(stageId, 'EXECUTION', {
    canonicalModelHash,
    meshHash: meshEvidence.artifactHash,
    physicalLoadCaseHash,
    solverProfileHash,
    acceptedResultHash,
  });
  const recoveryProfileHash = engineeringHash(stageId, 'RECOVERY_PROFILE', {
    resultContractRole: stage.resultContractRole,
    authority: stage.authority,
    recoveryAuthority: retainedRecoveryAuthority(stageId),
    producerRevision: LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  });
  const retainedRecoveryHash = canonicalLafeaSha256({
    schema: 'lafea-retained-recovery-evidence-hash-input/v1',
    stageId,
    recovery: retainedRecoveryEvidence(stageId, execution.result),
  });
  const recoveryHash = engineeringHash(stageId, 'RECOVERY', {
    executionHash,
    meshHash: meshEvidence.artifactHash,
    recoveryProfileHash,
    retainedRecoveryHash,
  });
  const producerRef = producerReference(stageId, stage, profile);
  const executionRecord = createLafeaArtifactRecord({
    stageId,
    kind: 'EXECUTION',
    status: 'CURRENT',
    artifactHash: executionHash,
    parentHashes: {
      canonicalModelHash,
      meshHash: meshEvidence.artifactHash,
      physicalLoadCaseHash,
      solverProfileHash,
    },
    qualification: 'PASS',
    producerRef,
    diagnostics: [],
  });
  const recoveryRecord = createLafeaArtifactRecord({
    stageId,
    kind: 'RECOVERY',
    status: 'CURRENT',
    artifactHash: recoveryHash,
    parentHashes: {
      executionHash,
      meshHash: meshEvidence.artifactHash,
      recoveryProfileHash,
    },
    qualification: 'PASS',
    producerRef,
    diagnostics: [],
  });
  const displayField = createDisplayField(
    stageId, meshEvidence.mesh, execution.result, fieldRequest,
  );
  const renderPacket = createRenderPacket({
    stageId,
    sceneRevision: intake.sceneRevision,
    meshEvidence,
    displayField,
    fieldRequest,
    sourceHash: authority.sourceHash,
    analysisGeometryHash: meshEvidence.analysisGeometryHash,
    executionHash,
    recoveryHash,
    displayGeometryHash,
    renderProfileHash,
    producerRef,
  });

  const packageRow = {
    schema: LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA,
    producerRevision: LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
    stageId,
    profileId: profile.profileId,
    sceneRevision: intake.sceneRevision,
    sourceHash: authority.sourceHash,
    canonicalModelHash,
    analysisGeometryHash: meshEvidence.analysisGeometryHash,
    analysisMeshHash: meshEvidence.artifactHash,
    executionHash,
    recoveryHash,
    displayGeometryHash,
    renderProfileHash,
    executionRecord,
    recoveryRecord,
    executionRegistrationId: registrationIdentity(
      stageId, 'EXECUTION', executionHash,
    ),
    recoveryRegistrationId: registrationIdentity(
      stageId, 'RECOVERY', recoveryHash,
    ),
    displayField,
    renderPacket,
    calculationState: 'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT',
    resultReadyWhenRegistered: true,
    releaseState: 'RELEASE_NOT_QUALIFIED',
    convergenceProduced: false,
    codeAssessmentProduced: false,
    reportProduced: false,
    releaseQualified: false,
  };
  packageRow.packageHash = lafeaRecoveryRenderPackageHash(packageRow);
  return deepFreeze(packageRow);
}

export function registerLafeaRecoveryRenderPackage(lifecycleValue, packageValue) {
  const packageRow = requireLafeaRecoveryRenderPackage(packageValue);
  const lifecycle = requireLifecycleForRegistration(lifecycleValue, packageRow);
  let registered = registerLafeaArtifact(
    lifecycle, packageRow.executionRecord, packageRow.executionRegistrationId,
  );
  registered = registerLafeaArtifact(
    registered, packageRow.recoveryRecord, packageRow.recoveryRegistrationId,
  );
  const readiness = lafeaLifecycleReadiness(registered);
  if (!readiness.resultReady || !readiness.meshQualified
    || readiness.codeReady || readiness.convergenceReady) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_READINESS_INVALID');
  }
  return registered;
}

function requireFeaStage(stageId) {
  if (!LAFEA_RECOVERY_RENDER_FEA_STAGES.includes(stageId)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_STAGE_NOT_FEA');
  }
  return stageId;
}

function requireAcceptedExecution(stageId, execution) {
  if (!execution || typeof execution !== 'object' || execution.stageId !== stageId
    || execution.status !== 'QUALIFIED' || !execution.source
    || !execution.canonicalInput || !execution.result) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_EXECUTION_INVALID');
  }
  const accepted = stageId === 'LAFEA.3'
    ? execution.result.qualification?.state === 'ACCEPTED'
    : stageId === 'LAFEA.4'
      ? execution.result.qualification?.accepted === true
      : execution.result.qualification?.state === 'ACCEPTED';
  if (!accepted) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_CALCULATION_NOT_ACCEPTED');
  }
  return execution;
}

function requireSourceAuthority(stageId, authority, execution) {
  if (authority.stageId !== stageId) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_SOURCE_STAGE_MISMATCH');
  }
  const expected = canonicalLafeaSha256({
    schema: 'lafea-source-authority-payload/v1',
    stageId,
    source: sourceAuthorityDocument(execution.source),
  });
  if (authority.sourceHash !== expected) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_SOURCE_AUTHORITY_MISMATCH');
  }
}

function requireLifecycleParents(lifecycle, stageId, profileId, authority,
  meshEvidence) {
  const readiness = lafeaLifecycleReadiness(lifecycle);
  if (lifecycle.stageId !== stageId || lifecycle.profileId !== profileId
    || lifecycle.source.status !== 'CURRENT'
    || lifecycle.source.sourceHash !== authority.sourceHash
    || meshEvidence.stageId !== stageId
    || meshEvidence.sourceHash !== authority.sourceHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_LIFECYCLE_MISMATCH');
  }
  requireCurrentPass(lifecycle, 'CANONICAL_MODEL', meshEvidence.canonicalModelHash,
    'LAFEA_RECOVERY_RENDER_MODEL_PARENT_STALE');
  requireCurrentPass(lifecycle, 'ANALYSIS_GEOMETRY',
    meshEvidence.analysisGeometryHash,
    'LAFEA_RECOVERY_RENDER_GEOMETRY_PARENT_STALE');
  requireCurrentPass(lifecycle, 'ANALYSIS_MESH', meshEvidence.artifactHash,
    'LAFEA_RECOVERY_RENDER_MESH_PARENT_STALE');
  if (!readiness.meshQualified || readiness.resultReady) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_PRECONDITION_INVALID');
  }
  return lifecycle;
}

function requireLifecycleForRegistration(lifecycle, packageRow) {
  if (!lifecycle || lifecycle.stageId !== packageRow.stageId
    || lifecycle.profileId !== packageRow.profileId
    || lifecycle.source?.status !== 'CURRENT'
    || lifecycle.source?.sourceHash !== packageRow.sourceHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_REGISTRATION_LIFECYCLE_MISMATCH');
  }
  requireCurrentPass(lifecycle, 'CANONICAL_MODEL', packageRow.canonicalModelHash,
    'LAFEA_RECOVERY_RENDER_MODEL_PARENT_STALE');
  requireCurrentPass(lifecycle, 'ANALYSIS_GEOMETRY',
    packageRow.analysisGeometryHash,
    'LAFEA_RECOVERY_RENDER_GEOMETRY_PARENT_STALE');
  requireCurrentPass(lifecycle, 'ANALYSIS_MESH', packageRow.analysisMeshHash,
    'LAFEA_RECOVERY_RENDER_MESH_PARENT_STALE');
  requireDisplayProfiles(
    lifecycle, packageRow.displayGeometryHash, packageRow.renderProfileHash,
  );
  if (packageRow.renderPacket.lineage.executionHash !== packageRow.executionHash
    || packageRow.renderPacket.lineage.recoveryHash !== packageRow.recoveryHash
    || packageRow.renderPacket.lineage.meshHash !== packageRow.analysisMeshHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_PACKET_LINEAGE_INVALID');
  }
  return lifecycle;
}

function requireDisplayProfiles(lifecycle, displayGeometryHash, renderProfileHash) {
  if (lifecycle.display?.displayMeshDensityHash !== displayGeometryHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_DISPLAY_GEOMETRY_PROFILE_STALE');
  }
  if (lifecycle.display?.contourPaletteHash !== renderProfileHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_PROFILE_STALE');
  }
}

function requireCurrentPass(lifecycle, kind, hash, code) {
  const record = lifecycle.artifacts?.[kind];
  if (!record || record.status !== 'CURRENT' || record.qualification !== 'PASS'
    || record.artifactHash !== hash) throw recoveryRenderError(code);
}

function canonicalModelArtifactHash(stageId, sourceHash, canonicalInput) {
  return engineeringHash(stageId, 'CANONICAL_MODEL', {
    sourceHash,
    canonicalInput,
  });
}

function engineeringHash(stageId, role, payload) {
  return canonicalLafeaSha256({
    schema: 'lafea-engineering-evidence-hash-input/v1',
    stageId,
    role,
    payload,
  });
}

function physicalLoadPayload(stageId, input) {
  if (stageId === 'LAFEA.5') return {
    loadCaseMappings: input.loadCaseMappings ?? input.canonicalLoadCaseMappings,
    attachmentEvidenceHash: input.acceptedAttachmentEvidenceHash ?? null,
  };
  return {
    loadCases: input.loadCases ?? null,
    resultRequests: input.resultRequests ?? null,
  };
}

function retainedRecoveryEvidence(stageId, result) {
  if (stageId === 'LAFEA.5') return {
    shellLoadCaseResults: result.rawShellResult?.loadCaseResults ?? null,
    assessmentRegionResults: result.assessmentRegionResults ?? null,
    footprintGeometryEvidence: result.footprintGeometryEvidence ?? null,
  };
  return {
    meshEvidence: result.meshEvidence,
    loadCaseResults: result.loadCaseResults,
  };
}

function retainedRecoveryAuthority(stageId) {
  return stageId === 'LAFEA.3'
    ? 'CONTINUUM_ELEMENT_OR_INTEGRATION_POINT_RETAINED_RESULT'
    : 'SHELL_ELEMENT_INTEGRATION_POINT_SURFACE_RETAINED_RESULT';
}

function requireStressUnits(stageId, execution, requestedUnits) {
  const expected = stageId === 'LAFEA.5'
    ? execution.result.generatedShellModel?.units?.stress
      ?? execution.source.shellTemplate?.units?.stress
    : execution.canonicalInput.units?.stress;
  if (typeof expected !== 'string' || !expected.trim()) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_STRESS_UNIT_UNRESOLVED');
  }
  if (expected !== requestedUnits) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_STRESS_UNIT_MISMATCH', {
      expected, actual: requestedUnits,
    });
  }
}

function createDisplayField(stageId, mesh, result, fieldRequest) {
  const loadCases = stageId === 'LAFEA.5'
    ? result.rawShellResult?.loadCaseResults
    : result.loadCaseResults;
  if (!Array.isArray(loadCases)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_LOAD_CASES_MISSING');
  }
  const loadCaseIndex = loadCases.findIndex(
    (row) => row.loadCaseId === fieldRequest.loadCaseId,
  );
  if (loadCaseIndex < 0) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_LOAD_CASE_NOT_FOUND');
  }
  const loadCase = loadCases[loadCaseIndex];
  if (!Array.isArray(loadCase.elementResults)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ELEMENT_RESULTS_MISSING');
  }
  const resultById = new Map(loadCase.elementResults.map((row, index) => [
    row.elementId, { row, index },
  ]));
  const property = QUANTITY_KEYS[fieldRequest.quantity];
  const values = mesh.elements.map((element) => {
    const retained = resultById.get(element.elementId);
    if (!retained) {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ELEMENT_RESULT_NOT_FOUND', {
        elementId: element.elementId,
      });
    }
    return displayValue(stageId, element, retained.row, retained.index,
      loadCaseIndex, property, fieldRequest.location);
  });
  const kind = renderFieldKind(mesh.elements[0].elementType,
    fieldRequest.location);
  return deepFreeze({
    schema: LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA,
    fieldId: fieldRequest.fieldId,
    loadCaseId: fieldRequest.loadCaseId,
    quantity: fieldRequest.quantity,
    units: fieldRequest.units,
    kind,
    valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
    location: fieldRequest.location,
    values,
  });
}

function displayValue(stageId, element, elementResult, elementIndex,
  loadCaseIndex, property, location) {
  if (stageId === 'LAFEA.3') {
    if (element.elementType === 'T3') {
      if (location.kind !== 'ELEMENT_CONSTANT') {
        throw recoveryRenderError('LAFEA_RECOVERY_RENDER_T3_LOCATION_INVALID');
      }
      return valueRow(element.elementId, elementResult.stress?.[property],
        `result.loadCaseResults[${loadCaseIndex}].elementResults[${elementIndex}].stress.${property}`,
        'ELEMENT_CONSTANT_RETAINED_ENGINEERING_RESULT');
    }
    if (!['T6', 'Q8'].includes(element.elementType)
      || location.kind !== 'INTEGRATION_POINT') {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_CONTINUUM_LOCATION_INVALID');
    }
    if (elementResult.recoveryLayer !== 'INTEGRATION_POINT') {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_INTEGRATION_POINT_AUTHORITY_MISSING');
    }
    const point = elementResult.gaussPointResults?.[location.integrationPointIndex];
    if (!point) {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_INTEGRATION_POINT_NOT_FOUND');
    }
    return valueRow(element.elementId, point.stress?.[property],
      `result.loadCaseResults[${loadCaseIndex}].elementResults[${elementIndex}].gaussPointResults[${location.integrationPointIndex}].stress.${property}`,
      'INTEGRATION_POINT_RETAINED_ENGINEERING_RESULT');
  }
  if (element.elementType !== SHELL_ELEMENT
    || location.kind !== 'SHELL_SURFACE') {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_SHELL_LOCATION_INVALID');
  }
  const point = elementResult.integrationPoints?.[location.integrationPointIndex];
  if (!point) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_INTEGRATION_POINT_NOT_FOUND');
  }
  const surfaceIndex = point.surfaces?.findIndex(
    (row) => row.surface === location.surface,
  );
  if (!Number.isInteger(surfaceIndex) || surfaceIndex < 0) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_SHELL_SURFACE_NOT_FOUND');
  }
  const prefix = stageId === 'LAFEA.5' ? 'result.rawShellResult' : 'result';
  return valueRow(element.elementId,
    point.surfaces[surfaceIndex].combinedStress?.[property],
    `${prefix}.loadCaseResults[${loadCaseIndex}].elementResults[${elementIndex}].integrationPoints[${location.integrationPointIndex}].surfaces[${surfaceIndex}].combinedStress.${property}`,
    'SHELL_SURFACE_RETAINED_ENGINEERING_RESULT');
}

function valueRow(elementId, value, sourcePath, authorityLayer) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_RETAINED_VALUE_INVALID', {
      elementId, sourcePath,
    });
  }
  return Object.freeze({
    elementId,
    value: Object.is(value, -0) ? 0 : value,
    sourcePath,
    authorityLayer,
  });
}

function renderFieldKind(elementType, location) {
  if (elementType === 'T3') return 'ELEMENT';
  if (elementType === 'T6' || elementType === 'Q8') return 'INTEGRATION_POINT';
  if (elementType !== SHELL_ELEMENT) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ELEMENT_FAMILY_UNSUPPORTED');
  }
  return {
    TOP: 'SHELL_TOP',
    MIDSURFACE: 'SHELL_MID',
    BOTTOM: 'SHELL_BOTTOM',
  }[location.surface];
}

function createRenderPacket(options) {
  const packed = packDisplayGeometry(options.meshEvidence.mesh,
    options.displayField);
  const scalarValues = options.displayField.values.map((row) => row.value);
  const minimum = Math.min(...scalarValues);
  const maximum = Math.max(...scalarValues);
  const boundsHash = canonicalLafeaSha256({
    schema: 'lafea-recovery-render-field-bounds-hash-input/v1',
    fieldId: options.displayField.fieldId,
    values: options.displayField.values,
    minimum,
    maximum,
  });
  return sealRenderPacketV2({
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision: options.sceneRevision,
    stageId: options.stageId,
    sourceElementType: renderElementType(
      options.meshEvidence.mesh.elements[0].elementType,
    ),
    positions: new Float32Array(packed.positions),
    vertexMeshNodeIds: packed.vertexMeshNodeIds,
    drawTriangleIndices: new Uint32Array(packed.drawTriangleIndices),
    drawTriangleElementIndices: new Uint32Array(
      packed.drawTriangleElementIndices,
    ),
    sourceElementIds: packed.sourceElementIds,
    fieldValues: new Float32Array(packed.fieldValues),
    qualityFlags: new Uint8Array(packed.qualityFlags),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: options.displayField.fieldId,
      kind: options.displayField.kind,
      units: options.displayField.units,
      sourcePath: 'displayField.values',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum,
        maximum,
        source: 'NB_T4B_RETAINED_RECOVERY_DISPLAY_FIELD',
        semanticHash: boundsHash,
      },
      colorMapId: options.fieldRequest.colorMapId,
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision: options.sceneRevision,
      entries: packed.pickEntries,
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: options.sourceHash,
      topologyHash: options.analysisGeometryHash,
      meshHash: options.meshEvidence.artifactHash,
      executionHash: options.executionHash,
      recoveryHash: options.recoveryHash,
      displayGeometryHash: options.displayGeometryHash,
      renderProfileHash: options.renderProfileHash,
      producerRef: options.producerRef,
    },
  });
}

function packDisplayGeometry(mesh, displayField) {
  const nodes = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const valueByElement = new Map(
    displayField.values.map((row) => [row.elementId, row.value]),
  );
  const positions = [];
  const vertexMeshNodeIds = [];
  const drawTriangleIndices = [];
  const drawTriangleElementIndices = [];
  const sourceElementIds = [];
  const fieldValues = [];
  const qualityFlags = [];
  const pickEntries = [];
  mesh.elements.forEach((element, elementIndex) => {
    const cornerIds = cornerNodeIds(element);
    const vertexStart = vertexMeshNodeIds.length;
    for (const nodeId of cornerIds) {
      const node = nodes.get(nodeId);
      if (!node) {
        throw recoveryRenderError('LAFEA_RECOVERY_RENDER_MESH_NODE_NOT_FOUND');
      }
      positions.push(node.x, node.y, node.z);
      vertexMeshNodeIds.push(nodeId);
      fieldValues.push(valueByElement.get(element.elementId));
      qualityFlags.push(0);
    }
    const triangles = localTriangles(element.elementType);
    const triangleStart = drawTriangleElementIndices.length;
    triangles.forEach((index) => {
      drawTriangleIndices.push(vertexStart + index);
    });
    const triangleCount = triangles.length / 3;
    for (let index = 0; index < triangleCount; index += 1) {
      drawTriangleElementIndices.push(elementIndex);
    }
    sourceElementIds.push(element.elementId);
    pickEntries.push({
      drawGroup: 'TRIANGLES',
      primitiveStart: triangleStart,
      primitiveEnd: triangleStart + triangleCount,
      sourceEntityId: element.elementId,
      meshEntityId: element.elementId,
      entityRole: 'ELEMENT',
    });
  });
  return {
    positions,
    vertexMeshNodeIds,
    drawTriangleIndices,
    drawTriangleElementIndices,
    sourceElementIds,
    fieldValues,
    qualityFlags,
    pickEntries,
  };
}

function cornerNodeIds(element) {
  if (['T3', 'T6', SHELL_ELEMENT].includes(element.elementType)) {
    return element.nodeIds.slice(0, 3);
  }
  if (element.elementType === 'Q8') return element.nodeIds.slice(0, 4);
  throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ELEMENT_FAMILY_UNSUPPORTED');
}

function localTriangles(elementType) {
  if (elementType === 'Q8') return [0, 1, 2, 0, 2, 3];
  if (['T3', 'T6', SHELL_ELEMENT].includes(elementType)) return [0, 1, 2];
  throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ELEMENT_FAMILY_UNSUPPORTED');
}

function renderElementType(elementType) {
  return elementType === SHELL_ELEMENT ? SHELL_RENDER_ELEMENT : elementType;
}

function producerReference(stageId, stage, profile) {
  return `NB-T4B/${stageId}/${stage.enginePackage}/${profile.profileId}/${LAFEA_RECOVERY_RENDER_PRODUCER_REVISION}`;
}

function registrationIdentity(stageId, kind, artifactHash) {
  return `NB-T4B-${stageId.replace('.', '-')}-${kind}-${artifactHash.slice(7, 23).toUpperCase()}`;
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_SCENE_REVISION_INVALID');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
