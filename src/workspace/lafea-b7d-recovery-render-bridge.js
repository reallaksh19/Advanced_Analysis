import {
  LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA,
  validateLafeaLugPinholePhysicalProblemProjection,
} from './lafea-lug-pinhole-physical-problem-batch.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA,
  LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY,
  requireLafeaRecoveryRenderFieldRequest,
} from './lafea-recovery-render-contract.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  sealRenderPacketV2,
} from './lafea-canvas/render-packet-v2-contract.js';

export const LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA =
  'lafea-b7d-recovery-render-bridge-intake/v1';
export const LAFEA_B7D_RECOVERY_RENDER_BRIDGE_SCHEMA =
  'lafea-b7d-recovery-render-bridge/v1';
export const LAFEA_B7D_RECOVERY_RENDER_BRIDGE_PRODUCER_REVISION = 'NB-T6D.1';

const STAGE_ID = 'LAFEA.3';
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const PRODUCER_REF = 'NB-T6D/C2D-LUG-PINHOLE/LAFEA.3/B7D-FINE-RENDER';
const QUANTITY_KEYS = Object.freeze({
  SIGMA_X: 'sigmaX',
  SIGMA_Y: 'sigmaY',
  TAU_XY: 'tauXY',
});
const INTAKE_KEYS = Object.freeze([
  'schema', 'sceneRevision', 'projection', 'executionPackage', 'fieldRequest',
]);
const EXECUTION_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'templateId', 'projectionHash',
  'request', 'benchmarkQualification', 'controllerResult', 'executionHash',
  'status', 'accepted', 'authority',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'templateId', 'sceneRevision',
  'projectionHash', 'executionPackageHash', 'controllerReceiptHash',
  'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'analysisMeshHash', 'executionHash', 'recoveryHash', 'convergenceHash',
  'displayGeometryHash', 'renderProfileHash', 'fieldRequest', 'displayField',
  'renderPacket', 'bridgeHash', 'status', 'authority',
]);

/**
 * Convert the accepted fine-level B7D retained recovery into one display-only
 * V2 packet. Existing B7D execution, recovery and convergence hashes remain
 * the sole lifecycle authority; this producer creates no new engineering
 * recovery and registers no lifecycle artifacts.
 */
export function createLafeaB7dRecoveryRenderBridge(intakeValue) {
  exactKeys(intakeValue, INTAKE_KEYS, 'B7D recovery-render bridge intake');
  if (intakeValue.schema !== LAFEA_B7D_RECOVERY_RENDER_BRIDGE_INTAKE_SCHEMA) {
    throw bridgeError('LAFEA_NB_T6D_INTAKE_SCHEMA_INVALID');
  }
  const sceneRevision = nonNegativeInteger(
    intakeValue.sceneRevision,
    'sceneRevision',
  );
  const projection = requireProjection(intakeValue.projection);
  const executionPackage = requireExecutionPackage(
    intakeValue.executionPackage,
    projection,
  );
  const fieldRequest = requireLafeaRecoveryRenderFieldRequest(
    intakeValue.fieldRequest,
  );
  requireFineLevelRequest(fieldRequest);

  const controller = executionPackage.controllerResult;
  const fineLevel = requireFineLevel(controller, projection);
  const meshEvidence = fineLevel.meshEvidence;
  const execution = fineLevel.execution;
  requireStressUnits(execution, fieldRequest.units);

  const displayGeometryHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6d-display-geometry-hash-input/v1',
    stageId: STAGE_ID,
    analysisMeshArtifactHash: meshEvidence.artifactHash,
    analysisMeshContentHash: meshEvidence.meshHash,
    tessellationPolicy: LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY,
  });
  const renderProfileHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6d-render-profile-hash-input/v1',
    producerRevision: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_PRODUCER_REVISION,
    fieldRequest,
  });
  const displayField = createDisplayField(
    meshEvidence.mesh,
    execution.result,
    fieldRequest,
  );
  const renderPacket = createRenderPacket({
    sceneRevision,
    mesh: meshEvidence.mesh,
    displayField,
    fieldRequest,
    sourceHash: controller.sourceAuthority.sourceHash,
    analysisGeometryHash: projection.analysisGeometryHash,
    analysisMeshHash: meshEvidence.artifactHash,
    executionHash: fineLevel.executionRecord.artifactHash,
    recoveryHash: fineLevel.recoveryRecord.artifactHash,
    displayGeometryHash,
    renderProfileHash,
  });
  const convergenceHash = controller.lifecycle.artifacts.CONVERGENCE.artifactHash;
  const base = {
    schema: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_SCHEMA,
    producerRevision: LAFEA_B7D_RECOVERY_RENDER_BRIDGE_PRODUCER_REVISION,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sceneRevision,
    projectionHash: projection.projectionHash,
    executionPackageHash: executionPackage.executionHash,
    controllerReceiptHash: controller.receipt.evidenceHash,
    sourceHash: controller.sourceAuthority.sourceHash,
    canonicalModelHash: projection.canonicalModelHash,
    analysisGeometryHash: projection.analysisGeometryHash,
    analysisMeshHash: meshEvidence.artifactHash,
    executionHash: fineLevel.executionRecord.artifactHash,
    recoveryHash: fineLevel.recoveryRecord.artifactHash,
    convergenceHash,
    displayGeometryHash,
    renderProfileHash,
    fieldRequest,
    displayField,
    renderPacket,
    status: 'DISPLAY_PACKET_READY',
    authority: bridgeAuthority(),
  };
  return deepFreeze({
    ...base,
    bridgeHash: bridgeHash(base),
  });
}

export function validateLafeaB7dRecoveryRenderBridge(value) {
  try {
    exactKeys(value, OUTPUT_KEYS, 'B7D recovery-render bridge');
    if (value.schema !== LAFEA_B7D_RECOVERY_RENDER_BRIDGE_SCHEMA
      || value.producerRevision
        !== LAFEA_B7D_RECOVERY_RENDER_BRIDGE_PRODUCER_REVISION
      || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID
      || value.status !== 'DISPLAY_PACKET_READY') {
      throw bridgeError('LAFEA_NB_T6D_BRIDGE_IDENTITY_INVALID');
    }
    nonNegativeInteger(value.sceneRevision, 'sceneRevision');
    for (const key of [
      'projectionHash', 'executionPackageHash', 'controllerReceiptHash',
      'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
      'analysisMeshHash', 'executionHash', 'recoveryHash', 'convergenceHash',
      'displayGeometryHash', 'renderProfileHash', 'bridgeHash',
    ]) sha256(value[key], key);
    const fieldRequest = requireLafeaRecoveryRenderFieldRequest(value.fieldRequest);
    requireFineLevelRequest(fieldRequest);
    const sealedPacket = sealRenderPacketV2(value.renderPacket);
    if (sealedPacket.sceneRevision !== value.sceneRevision
      || sealedPacket.lineage.sourceHash !== value.sourceHash
      || sealedPacket.lineage.topologyHash !== value.analysisGeometryHash
      || sealedPacket.lineage.meshHash !== value.analysisMeshHash
      || sealedPacket.lineage.executionHash !== value.executionHash
      || sealedPacket.lineage.recoveryHash !== value.recoveryHash
      || sealedPacket.lineage.displayGeometryHash !== value.displayGeometryHash
      || sealedPacket.lineage.renderProfileHash !== value.renderProfileHash) {
      throw bridgeError('LAFEA_NB_T6D_RENDER_LINEAGE_INVALID');
    }
    if (JSON.stringify(value.authority) !== JSON.stringify(bridgeAuthority())) {
      throw bridgeError('LAFEA_NB_T6D_AUTHORITY_INVALID');
    }
    const base = { ...value };
    delete base.bridgeHash;
    if (bridgeHash(base) !== value.bridgeHash) {
      throw bridgeError('LAFEA_NB_T6D_BRIDGE_HASH_INVALID');
    }
    return Object.freeze({ ok: true, errors: Object.freeze([]) });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([error?.code ?? 'LAFEA_NB_T6D_BRIDGE_INVALID']),
    });
  }
}

function requireProjection(value) {
  const validation = validateLafeaLugPinholePhysicalProblemProjection(value);
  if (!validation.ok || value.status !== 'PROJECTION_READY'
    || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID) {
    throw bridgeError('LAFEA_NB_T6D_PROJECTION_INVALID');
  }
  return value;
}

function requireExecutionPackage(value, projection) {
  exactKeys(value, EXECUTION_KEYS, 'NB-T6C execution package');
  if (value.schema !== LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA
    || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID
    || value.projectionHash !== projection.projectionHash
    || value.status !== 'ACCEPTED' || value.accepted !== true
    || value.authority?.selectedPilotExecution !== true
    || value.authority?.generalT7dAuthorized !== false
    || value.authority?.codeReady !== false
    || value.authority?.releaseQualified !== false) {
    throw bridgeError('LAFEA_NB_T6D_EXECUTION_PACKAGE_INVALID');
  }
  sha256(value.executionHash, 'executionPackage.executionHash');
  const controller = value.controllerResult;
  if (!controller || controller.status !== 'ACCEPTED'
    || controller.accepted !== true
    || controller.receipt?.status !== 'ACCEPTED'
    || controller.receipt?.resultReady !== true
    || controller.receipt?.convergenceReady !== true
    || controller.receipt?.codeReady !== false
    || controller.authority?.generalT7dAuthorized !== false
    || controller.authority?.releaseQualified !== false
    || controller.sourceAuthority?.sourceHash
      !== projection.sourceAuthority.sourceHash
    || value.request?.semanticHash !== controller.request?.semanticHash) {
    throw bridgeError('LAFEA_NB_T6D_CONTROLLER_RESULT_INVALID');
  }
  return value;
}

function requireFineLevel(controller, projection) {
  if (!Array.isArray(controller.levelResults)
    || controller.levelResults.length !== 3) {
    throw bridgeError('LAFEA_NB_T6D_THREE_LEVEL_RESULTS_REQUIRED');
  }
  const level = controller.levelResults[2];
  const projectedLevel = projection.levels[2];
  if (!level || level.ordinal !== 3
    || level.levelEvidence?.status !== 'ACCEPTED'
    || level.execution?.status !== 'QUALIFIED'
    || level.execution?.result?.qualification?.state !== 'ACCEPTED'
    || level.executionRecord?.qualification !== 'PASS'
    || level.recoveryRecord?.qualification !== 'PASS'
    || level.executionRecord.artifactHash !== level.levelEvidence.executionHash
    || level.recoveryRecord.artifactHash !== level.levelEvidence.recoveryHash
    || level.meshEvidence?.artifactHash !== projectedLevel.meshEvidence.artifactHash
    || JSON.stringify(level.meshEvidence)
      !== JSON.stringify(projectedLevel.meshEvidence)) {
    throw bridgeError('LAFEA_NB_T6D_FINE_LEVEL_INVALID');
  }
  const lifecycle = controller.lifecycle;
  if (lifecycle?.artifacts?.EXECUTION?.artifactHash
      !== level.executionRecord.artifactHash
    || lifecycle?.artifacts?.RECOVERY?.artifactHash
      !== level.recoveryRecord.artifactHash
    || lifecycle?.artifacts?.CONVERGENCE?.status !== 'CURRENT'
    || lifecycle?.artifacts?.CONVERGENCE?.qualification !== 'PASS'
    || lifecycle?.artifacts?.CONVERGENCE?.artifactHash
      !== controller.receipt.pilotConvergence.semanticHash) {
    throw bridgeError('LAFEA_NB_T6D_FINE_LEVEL_LIFECYCLE_MISMATCH');
  }
  const reconstructedResultHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-result-hash-evidence/v1',
    reconstructed: level.reconstructedResultHashes,
  });
  if (reconstructedResultHash !== level.levelEvidence.resultHash
    || JSON.stringify(level.reconstructedResultHashes)
      !== JSON.stringify(level.execution.result.semanticHashes)) {
    throw bridgeError('LAFEA_NB_T6D_RETAINED_RESULT_HASH_MISMATCH');
  }
  return level;
}

function requireFineLevelRequest(fieldRequest) {
  if (fieldRequest.location.kind !== 'INTEGRATION_POINT'
    || fieldRequest.location.surface !== null) {
    throw bridgeError('LAFEA_NB_T6D_INTEGRATION_POINT_FIELD_REQUIRED');
  }
}

function requireStressUnits(execution, units) {
  const retainedUnits = execution.canonicalInput?.units?.stress;
  if (typeof retainedUnits !== 'string' || retainedUnits !== units) {
    throw bridgeError('LAFEA_NB_T6D_STRESS_UNIT_MISMATCH');
  }
}

function createDisplayField(mesh, result, fieldRequest) {
  const loadCases = result.loadCaseResults;
  if (!Array.isArray(loadCases)) {
    throw bridgeError('LAFEA_NB_T6D_LOAD_CASE_RESULTS_MISSING');
  }
  const loadCaseIndex = loadCases.findIndex(
    (row) => row.loadCaseId === fieldRequest.loadCaseId,
  );
  if (loadCaseIndex < 0) {
    throw bridgeError('LAFEA_NB_T6D_LOAD_CASE_NOT_FOUND');
  }
  const elementResults = loadCases[loadCaseIndex].elementResults;
  if (!Array.isArray(elementResults)) {
    throw bridgeError('LAFEA_NB_T6D_ELEMENT_RESULTS_MISSING');
  }
  const resultById = new Map(
    elementResults.map((row, index) => [row.elementId, { row, index }]),
  );
  const property = QUANTITY_KEYS[fieldRequest.quantity];
  const values = mesh.elements.map((element) => {
    if (element.elementType !== 'T6') {
      throw bridgeError('LAFEA_NB_T6D_FINE_LEVEL_T6_REQUIRED');
    }
    const retained = resultById.get(element.elementId);
    if (!retained || retained.row.recoveryLayer !== 'INTEGRATION_POINT') {
      throw bridgeError('LAFEA_NB_T6D_RETAINED_RECOVERY_MISSING');
    }
    const point = retained.row.gaussPointResults?.[
      fieldRequest.location.integrationPointIndex
    ];
    const value = point?.stress?.[property];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw bridgeError('LAFEA_NB_T6D_RETAINED_VALUE_INVALID');
    }
    return Object.freeze({
      elementId: element.elementId,
      value: Object.is(value, -0) ? 0 : value,
      sourcePath: `controllerResult.levelResults[2].execution.result.loadCaseResults[${loadCaseIndex}].elementResults[${retained.index}].gaussPointResults[${fieldRequest.location.integrationPointIndex}].stress.${property}`,
      authorityLayer: 'B7D_RETAINED_INTEGRATION_POINT_ENGINEERING_RESULT',
    });
  });
  return deepFreeze({
    schema: LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA,
    fieldId: fieldRequest.fieldId,
    loadCaseId: fieldRequest.loadCaseId,
    quantity: fieldRequest.quantity,
    units: fieldRequest.units,
    kind: 'INTEGRATION_POINT',
    valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
    location: fieldRequest.location,
    values,
  });
}

function createRenderPacket(options) {
  const nodeById = new Map(options.mesh.nodes.map((node) => [node.nodeId, node]));
  const valueByElement = new Map(
    options.displayField.values.map((row) => [row.elementId, row.value]),
  );
  const positions = [];
  const vertexMeshNodeIds = [];
  const drawTriangleIndices = [];
  const drawTriangleElementIndices = [];
  const sourceElementIds = [];
  const fieldValues = [];
  const qualityFlags = [];
  const pickEntries = [];

  options.mesh.elements.forEach((element, elementIndex) => {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) {
      throw bridgeError('LAFEA_NB_T6D_T6_MESH_REQUIRED');
    }
    const vertexStart = vertexMeshNodeIds.length;
    for (const nodeId of element.nodeIds.slice(0, 3)) {
      const node = nodeById.get(nodeId);
      if (!node) throw bridgeError('LAFEA_NB_T6D_MESH_NODE_MISSING');
      positions.push(node.x, node.y, node.z);
      vertexMeshNodeIds.push(nodeId);
      fieldValues.push(valueByElement.get(element.elementId));
      qualityFlags.push(0);
    }
    drawTriangleIndices.push(vertexStart, vertexStart + 1, vertexStart + 2);
    drawTriangleElementIndices.push(elementIndex);
    sourceElementIds.push(element.elementId);
    pickEntries.push({
      drawGroup: 'TRIANGLES',
      primitiveStart: elementIndex,
      primitiveEnd: elementIndex + 1,
      sourceEntityId: element.elementId,
      meshEntityId: element.elementId,
      entityRole: 'ELEMENT',
    });
  });

  const scalarValues = options.displayField.values.map((row) => row.value);
  const minimum = Math.min(...scalarValues);
  const maximum = Math.max(...scalarValues);
  const boundsHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6d-field-bounds-hash-input/v1',
    fieldId: options.displayField.fieldId,
    values: options.displayField.values,
    minimum,
    maximum,
  });
  return sealRenderPacketV2({
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision: options.sceneRevision,
    stageId: STAGE_ID,
    sourceElementType: 'T6',
    positions: new Float32Array(positions),
    vertexMeshNodeIds,
    drawTriangleIndices: new Uint32Array(drawTriangleIndices),
    drawTriangleElementIndices: new Uint32Array(drawTriangleElementIndices),
    sourceElementIds,
    fieldValues: new Float32Array(fieldValues),
    qualityFlags: new Uint8Array(qualityFlags),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: options.displayField.fieldId,
      kind: 'INTEGRATION_POINT',
      units: options.displayField.units,
      sourcePath: 'displayField.values',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum,
        maximum,
        source: 'NB_T6D_B7D_FINE_LEVEL_RETAINED_RECOVERY',
        semanticHash: boundsHash,
      },
      colorMapId: options.fieldRequest.colorMapId,
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision: options.sceneRevision,
      entries: pickEntries,
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: options.sourceHash,
      topologyHash: options.analysisGeometryHash,
      meshHash: options.analysisMeshHash,
      executionHash: options.executionHash,
      recoveryHash: options.recoveryHash,
      displayGeometryHash: options.displayGeometryHash,
      renderProfileHash: options.renderProfileHash,
      producerRef: PRODUCER_REF,
    },
  });
}

function bridgeAuthority() {
  return deepFreeze({
    selectedPilotDisplay: true,
    fineLevelOnly: true,
    retainedEngineeringResultUsed: true,
    displayProjectionOnly: true,
    newEngineeringRecoveryComputed: false,
    lifecycleArtifactsRegistered: false,
    resultReady: true,
    convergenceReady: true,
    assessmentReady: false,
    codeReady: false,
    reportAuthority: false,
    releaseQualified: false,
    generalT7dAuthorized: false,
    shellAuthorized: false,
    lafea6Enabled: false,
  });
}

function bridgeHash(value) {
  const packet = value.renderPacket;
  return canonicalLafeaSha256({
    schema: 'lafea-b7d-recovery-render-bridge-hash-input/v1',
    producerRevision: value.producerRevision,
    stageId: value.stageId,
    templateId: value.templateId,
    sceneRevision: value.sceneRevision,
    projectionHash: value.projectionHash,
    executionPackageHash: value.executionPackageHash,
    controllerReceiptHash: value.controllerReceiptHash,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    analysisMeshHash: value.analysisMeshHash,
    executionHash: value.executionHash,
    recoveryHash: value.recoveryHash,
    convergenceHash: value.convergenceHash,
    displayGeometryHash: value.displayGeometryHash,
    renderProfileHash: value.renderProfileHash,
    fieldRequest: value.fieldRequest,
    displayField: value.displayField,
    renderPacket: {
      ...packet,
      positions: [...packet.positions],
      drawTriangleIndices: [...packet.drawTriangleIndices],
      drawTriangleElementIndices: [...packet.drawTriangleElementIndices],
      fieldValues: [...packet.fieldValues],
      qualityFlags: [...packet.qualityFlags],
    },
    status: value.status,
    authority: value.authority,
  });
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw bridgeError('LAFEA_NB_T6D_RECORD_INVALID', `${label} must be a plain record.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    throw bridgeError('LAFEA_NB_T6D_EXACT_KEYS_INVALID');
  }
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw bridgeError('LAFEA_NB_T6D_HASH_INVALID', `${label} must be SHA-256.`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw bridgeError('LAFEA_NB_T6D_INTEGER_INVALID', `${label} must be non-negative.`);
  }
  return value;
}

function bridgeError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
