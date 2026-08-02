import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  validateLafeaB7dRecoveryRenderBridge,
} from './lafea-b7d-recovery-render-bridge.js';
import {
  reconstructControlledContinuumResultHashes,
} from './lafea-controlled-continuum-stage-route.js';
import {
  validateLafeaLoadDrivenPilotQualification,
} from './lafea-load-driven-pilot-qualification.js';
import {
  validateLafeaLugPinholePhysicalProblemProjection,
} from './lafea-lug-pinhole-physical-problem-batch.js';

export const LAFEA_SELECTED_PILOT_REVIEW_HANDOFF_SCHEMA =
  'lafea-selected-pilot-review-handoff/v1';
export const LAFEA_SELECTED_PILOT_REVIEW_PACKET_SCHEMA =
  'lafea-selected-pilot-review-packet/v1';
export const LAFEA_SELECTED_PILOT_AUDIT_RECEIPT_SCHEMA =
  'lafea-selected-pilot-audit-receipt/v1';
export const LAFEA_SELECTED_PILOT_REVIEW_PRODUCER_REVISION = 'NB-T6E.1';

const INPUT_KEYS = Object.freeze([
  'handoffId', 'exactHeadSha', 'qualification', 'projection', 'execution',
  'renderBridge',
]);
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const STAGE_ID = 'LAFEA.3';
const STATUS = 'SELECTED_PILOT_REVIEW_EVIDENCE_READY';
const QUANTITY_KEYS = Object.freeze({
  SIGMA_X: 'sigmaX',
  SIGMA_Y: 'sigmaY',
  TAU_XY: 'tauXY',
});

export function createLafeaSelectedPilotReviewHandoff(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'NB-T6E handoff input');
  const handoffId = text(inputValue.handoffId, 'handoffId');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const qualification = requireQualification(
    inputValue.qualification,
    exactHeadSha,
  );
  const projection = requireProjection(
    inputValue.projection,
    qualification,
  );
  const execution = requireExecution(
    inputValue.execution,
    qualification,
    projection,
  );
  const renderBridge = requireRenderBridge(
    inputValue.renderBridge,
    projection,
    execution,
  );

  const levels = deepFreeze(projection.levels.map((level, index) =>
    summarizeLevel({
      level,
      ordinal: index + 1,
      qualificationLevel: qualification.receipt.levelEvidence[index],
      controllerLevel: execution.controllerResult.levelResults[index],
      loadCaseId: projection.physicalProblem.loadCase.loadCaseId,
    })));
  requireIncreasingLevels(levels);

  const finest = summarizeFinestLevel({
    level: levels[2],
    projectionLevel: projection.levels[2],
    controllerLevel: execution.controllerResult.levelResults[2],
    renderBridge,
  });
  const convergence = deepFreeze({
    schema: 'lafea-selected-pilot-review-convergence/v1',
    displacement: qualification.receipt.displacementConvergence,
    retainedStress: qualification.receipt.stressConvergence,
    controllerConvergenceHash: renderBridge.convergenceHash,
    sourceRole: 'NB_T6D_QUALIFICATION_EVIDENCE_UNCHANGED',
    reinterpreted: false,
    newConvergenceProduced: false,
  });
  const displayEvidence = createDisplayEvidence(renderBridge);
  const authority = reviewAuthority();
  const limitations = deepFreeze([
    ...new Set([
      ...projection.physicalProblem.limitations,
      'SELECTED_C2D_LUG_PINHOLE_ONLY',
      'REVIEW_AND_AUDIT_HANDOFF_ONLY',
      'EXISTING_NB_T6D_RENDER_BRIDGE_ONLY',
      'RETAINED_INTEGRATION_POINT_RESULTS_ONLY',
      'DISPLAY_VALUES_ARE_NON_AUTHORITATIVE',
      'NO_NEW_DISPLAY_PROJECTION_OR_ENGINEERING_RECOVERY',
      'NO_CROSS_ELEMENT_SMOOTHING_OR_NODAL_AVERAGING',
      'NO_ASSESSMENT_CODE_REPORT_OR_RELEASE_AUTHORITY',
    ]),
  ].sort());

  const packetBase = {
    schema: LAFEA_SELECTED_PILOT_REVIEW_PACKET_SCHEMA,
    producerRevision: LAFEA_SELECTED_PILOT_REVIEW_PRODUCER_REVISION,
    handoffId,
    exactHeadSha,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    parentHashes: {
      qualificationHash: qualification.semanticHash,
      qualificationManifestHash: qualification.manifest.semanticHash,
      qualificationReceiptHash: qualification.receipt.evidenceHash,
      projectionHash: projection.projectionHash,
      executionHash: execution.executionHash,
      requestHash: execution.request.semanticHash,
      benchmarkQualificationHash:
        execution.benchmarkQualification.semanticHash,
      controllerReceiptHash: execution.controllerResult.receipt.evidenceHash,
      sourceAuthorityHash: canonicalLafeaSha256(
        execution.controllerResult.sourceAuthority,
      ),
      exactSourceHash: execution.controllerResult.sourceAuthority.sourceHash,
      renderBridgeHash: renderBridge.bridgeHash,
      displayGeometryHash: renderBridge.displayGeometryHash,
      renderProfileHash: renderBridge.renderProfileHash,
    },
    physicalProblem: {
      modelIdentity: projection.physicalProblem.modelIdentity,
      modelVersion: projection.physicalProblem.modelVersion,
      formulation: 'PLANE_STRESS',
      units: projection.physicalProblem.units,
      materialId: projection.physicalProblem.material.materialId,
      thickness: projection.physicalProblem.thickness,
      loadCaseId: projection.physicalProblem.loadCase.loadCaseId,
      appliedResultant: projection.physicalProblem.loadCase.resultant,
      geometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
    },
    levels,
    convergence,
    finestLevel: finest,
    displayEvidence,
    limitations,
    authority,
    status: STATUS,
  };
  const reviewPacket = deepFreeze({
    ...packetBase,
    packetHash: canonicalLafeaSha256(packetBase),
  });

  const receiptBase = {
    schema: LAFEA_SELECTED_PILOT_AUDIT_RECEIPT_SCHEMA,
    producerRevision: LAFEA_SELECTED_PILOT_REVIEW_PRODUCER_REVISION,
    handoffId,
    exactHeadSha,
    reviewPacketHash: reviewPacket.packetHash,
    qualificationHash: qualification.semanticHash,
    renderBridgeHash: renderBridge.bridgeHash,
    finestMeshHash: finest.meshHash,
    finestResultHash: finest.resultHash,
    finestRecoveryHash: finest.recoveryHash,
    displayEvidenceHash: displayEvidence.semanticHash,
    status: STATUS,
    reviewPacketReady: true,
    portableAuditHandoff: true,
    existingRenderBridgeConsumed: true,
    newDisplayProjectionProduced: false,
    formalReportProduced: false,
    releaseQualified: false,
    diagnostics: [],
  };
  const receiptSemanticBasis = { ...receiptBase };
  delete receiptSemanticBasis.diagnostics;
  const receiptSemanticHash = canonicalLafeaSha256(receiptSemanticBasis);
  const auditReceipt = deepFreeze({
    ...receiptBase,
    semanticHash: receiptSemanticHash,
    evidenceHash: canonicalLafeaSha256({
      schema: 'lafea-selected-pilot-audit-receipt-evidence/v1',
      semanticHash: receiptSemanticHash,
      diagnostics: receiptBase.diagnostics,
    }),
  });

  const packageBase = {
    schema: LAFEA_SELECTED_PILOT_REVIEW_HANDOFF_SCHEMA,
    producerRevision: LAFEA_SELECTED_PILOT_REVIEW_PRODUCER_REVISION,
    handoffId,
    exactHeadSha,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    reviewPacket,
    auditReceipt,
    authority,
    status: STATUS,
  };
  return deepFreeze({
    ...packageBase,
    portablePayloadHash: canonicalLafeaSha256({
      schema: 'lafea-selected-pilot-portable-payload/v1',
      reviewPacket,
      auditReceipt,
    }),
    semanticHash: canonicalLafeaSha256(packageBase),
  });
}

export function validateLafeaSelectedPilotReviewHandoff(value) {
  try {
    requireHandoff(value);
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_NB_T6E_HANDOFF_INVALID'],
    });
  }
}

export function serializeLafeaSelectedPilotReviewHandoff(value) {
  requireHandoff(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseLafeaSelectedPilotReviewHandoff(textValue) {
  if (typeof textValue !== 'string' || !textValue.trim()) {
    throw handoffError('LAFEA_NB_T6E_SERIALIZED_TEXT_REQUIRED');
  }
  let parsed;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    throw handoffError('LAFEA_NB_T6E_SERIALIZED_JSON_INVALID');
  }
  const frozen = deepFreeze(parsed);
  requireHandoff(frozen);
  return frozen;
}

function requireQualification(value, exactHeadSha) {
  const validation = validateLafeaLoadDrivenPilotQualification(value);
  if (!validation.ok) {
    throw handoffError(
      'LAFEA_NB_T6E_QUALIFICATION_INVALID',
      validation.errors.join(' '),
    );
  }
  if (value.exactHeadSha !== exactHeadSha
    || value.manifest.exactHeadSha !== exactHeadSha) {
    throw handoffError('LAFEA_NB_T6E_EXACT_HEAD_PARENT_STALE');
  }
  if (value.status !== 'LOAD_DRIVEN_SELECTED_PILOT_QUALIFIED'
    || value.receipt.selectedPilotQualified !== true
    || value.authority.selectedPilotQualification !== true
    || value.authority.generalT7dAuthorized !== false
    || value.authority.shellAuthorized !== false
    || value.authority.assessmentReady !== false
    || value.authority.codeReady !== false
    || value.authority.reportAuthority !== false
    || value.authority.releaseQualified !== false) {
    throw handoffError('LAFEA_NB_T6E_QUALIFICATION_AUTHORITY_INVALID');
  }
  return value;
}

function requireProjection(value, qualification) {
  const validation = validateLafeaLugPinholePhysicalProblemProjection(value);
  if (!validation.ok) {
    throw handoffError(
      'LAFEA_NB_T6E_PROJECTION_INVALID',
      validation.errors.join(' '),
    );
  }
  if (value.projectionHash !== qualification.manifest.projectionHash
    || value.physicalProblemHash !== qualification.manifest.physicalProblemHash
    || value.featureProjectionHash
      !== qualification.manifest.featureProjectionHash
    || value.releaseRecord.candidateHeadSha !== qualification.exactHeadSha) {
    throw handoffError('LAFEA_NB_T6E_PROJECTION_PARENT_STALE');
  }
  if (!Array.isArray(value.levels) || value.levels.length !== 3
    || value.levels.some((row, index) => row.ordinal !== index + 1)) {
    throw handoffError('LAFEA_NB_T6E_THREE_LEVELS_REQUIRED');
  }
  return value;
}

function requireExecution(value, qualification, projection) {
  if (!value || value.schema !==
      'lafea-lug-pinhole-physical-problem-execution/v1'
    || value.status !== 'ACCEPTED' || value.accepted !== true
    || value.projectionHash !== projection.projectionHash
    || value.executionHash !== qualification.manifest.executionHash
    || value.request.semanticHash !== qualification.manifest.requestHash
    || value.benchmarkQualification.semanticHash
      !== qualification.manifest.benchmarkQualificationHash
    || value.controllerResult?.receipt?.evidenceHash
      !== qualification.manifest.controllerReceiptHash
    || value.controllerResult?.status !== 'ACCEPTED'
    || value.controllerResult?.accepted !== true
    || value.controllerResult?.receipt?.status !== 'ACCEPTED'
    || value.controllerResult?.receipt?.resultReady !== true
    || value.controllerResult?.receipt?.convergenceReady !== true
    || value.controllerResult?.authority?.generalT7dAuthorized !== false
    || value.authority?.shellAuthorized !== false
    || value.authority?.assessmentReady !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false) {
    throw handoffError('LAFEA_NB_T6E_EXECUTION_PARENT_INVALID');
  }
  if (!Array.isArray(value.controllerResult.levelResults)
    || value.controllerResult.levelResults.length !== 3) {
    throw handoffError('LAFEA_NB_T6E_EXECUTION_LEVELS_INVALID');
  }
  return value;
}

function requireRenderBridge(value, projection, execution) {
  const validation = validateLafeaB7dRecoveryRenderBridge(value);
  if (!validation.ok) {
    throw handoffError(
      'LAFEA_NB_T6E_RENDER_BRIDGE_INVALID',
      validation.errors.join(' '),
    );
  }
  const controller = execution.controllerResult;
  const fine = controller.levelResults[2];
  const expected = [
    [value.projectionHash, projection.projectionHash],
    [value.executionPackageHash, execution.executionHash],
    [value.controllerReceiptHash, controller.receipt.evidenceHash],
    [value.sourceHash, controller.sourceAuthority.sourceHash],
    [value.canonicalModelHash, projection.canonicalModelHash],
    [value.analysisGeometryHash, projection.analysisGeometryHash],
    [value.analysisMeshHash, fine.meshEvidence.artifactHash],
    [value.executionHash, fine.executionRecord.artifactHash],
    [value.recoveryHash, fine.recoveryRecord.artifactHash],
    [value.convergenceHash,
      controller.lifecycle.artifacts.CONVERGENCE.artifactHash],
  ];
  if (expected.some(([actual, wanted]) => actual !== wanted)
    || value.status !== 'DISPLAY_PACKET_READY'
    || value.authority?.selectedPilotDisplay !== true
    || value.authority?.fineLevelOnly !== true
    || value.authority?.retainedEngineeringResultUsed !== true
    || value.authority?.displayProjectionOnly !== true
    || value.authority?.newEngineeringRecoveryComputed !== false
    || value.authority?.lifecycleArtifactsRegistered !== false
    || value.authority?.assessmentReady !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false
    || value.authority?.generalT7dAuthorized !== false
    || value.authority?.shellAuthorized !== false
    || value.displayField?.valueRole !== 'PRODUCER_PROJECTED_DISPLAY_ONLY'
    || value.renderPacket?.field?.valueRole
      !== 'PRODUCER_PROJECTED_DISPLAY_ONLY') {
    throw handoffError('LAFEA_NB_T6E_RENDER_BRIDGE_PARENT_STALE');
  }
  return value;
}

function summarizeLevel({
  level,
  ordinal,
  qualificationLevel,
  controllerLevel,
  loadCaseId,
}) {
  if (level.ordinal !== ordinal
    || qualificationLevel?.ordinal !== ordinal
    || controllerLevel?.ordinal !== ordinal
    || qualificationLevel.status !== 'PASS'
    || controllerLevel.levelEvidence?.status !== 'ACCEPTED'
    || controllerLevel.levelEvidence?.recoveryAuthority
      !== 'RETAINED_INTEGRATION_POINT_VALUES'
    || controllerLevel.levelEvidence?.projectedDisplayHash !== null
    || controllerLevel.levelEvidence?.projectedDisplayRole !== 'NOT_PRODUCED'
    || level.meshEvidence.meshHash !== qualificationLevel.meshHash
    || level.meshEvidence.meshHash !== controllerLevel.meshEvidence?.meshHash
    || level.meshEvidence.meshProfileHash !== qualificationLevel.meshProfileHash
    || controllerLevel.levelEvidence.executionHash
      !== qualificationLevel.executionHash
    || controllerLevel.levelEvidence.resultHash !== qualificationLevel.resultHash
    || controllerLevel.levelEvidence.recoveryHash
      !== qualificationLevel.recoveryHash
    || controllerLevel.levelEvidence.integrationPointResultHash
      !== qualificationLevel.integrationPointResultHash) {
    throw handoffError('LAFEA_NB_T6E_LEVEL_PARENT_STALE');
  }
  const result = controllerLevel.execution?.result;
  if (result?.schema !== 'local-continuum-result/v1'
    || result.qualification?.state !== 'ACCEPTED') {
    throw handoffError('LAFEA_NB_T6E_LEVEL_RESULT_NOT_ACCEPTED');
  }
  const reconstructed = reconstructControlledContinuumResultHashes(result);
  if (JSON.stringify(reconstructed) !== JSON.stringify(result.semanticHashes)) {
    throw handoffError('LAFEA_NB_T6E_RESULT_HASH_RECONSTRUCTION_FAILED');
  }
  const reconstructedResultHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-result-hash-evidence/v1',
    reconstructed,
  });
  if (reconstructedResultHash !== qualificationLevel.resultHash) {
    throw handoffError('LAFEA_NB_T6E_RESULT_PARENT_STALE');
  }
  const loadCase = result.loadCaseResults?.find(
    (row) => row.loadCaseId === loadCaseId,
  );
  if (!loadCase || loadCase.solverEvidence?.method !== 'DETERMINISTIC_CHOLESKY'
    || loadCase.solverEvidence?.accepted !== true
    || !Array.isArray(loadCase.freeDofIdentities)
    || loadCase.freeDofIdentities.length === 0
    || loadCase.equilibrium?.accepted !== true) {
    throw handoffError('LAFEA_NB_T6E_FREE_DOF_EVIDENCE_INVALID');
  }
  const reactionResultant = loadCase.reactions.reduce((sum, row) => {
    sum[row.dofIdentity.endsWith(':UX') ? 0 : 1] += row.value;
    return sum;
  }, [0, 0]);
  const equilibriumClosure = [
    loadCase.equilibrium.reactionPlusAppliedForce.x,
    loadCase.equilibrium.reactionPlusAppliedForce.y,
  ];
  const maximumDisplacementMagnitude = Math.max(
    ...loadCase.nodalDisplacements.map((row) => Math.hypot(row.ux, row.uy)),
  );
  const maximumRetainedVonMises = Math.max(
    ...loadCase.elementResults.flatMap((element) => {
      if (element.recoveryLayer !== 'INTEGRATION_POINT'
        || !Array.isArray(element.gaussPointResults)
        || element.gaussPointResults.length === 0) {
        throw handoffError('LAFEA_NB_T6E_RETAINED_RECOVERY_REQUIRED');
      }
      return element.gaussPointResults.map((point) => point.vonMises);
    }),
  );
  const checks = [
    [loadCase.freeDofIdentities.length, qualificationLevel.freeDofCount],
    [loadCase.constrainedDofIdentities.length,
      qualificationLevel.constrainedDofCount],
    [loadCase.solverEvidence.method, qualificationLevel.solverMethod],
    [maximumDisplacementMagnitude,
      qualificationLevel.maximumDisplacementMagnitude],
    [maximumRetainedVonMises, qualificationLevel.maximumRetainedVonMises],
  ];
  if (checks.some(([actual, expected]) => actual !== expected)
    || JSON.stringify(reactionResultant)
      !== JSON.stringify(qualificationLevel.reactionResultant)
    || JSON.stringify(equilibriumClosure)
      !== JSON.stringify(qualificationLevel.equilibriumClosure)) {
    throw handoffError('LAFEA_NB_T6E_LEVEL_SUMMARY_MISMATCH');
  }
  const base = {
    schema: 'lafea-selected-pilot-review-level/v1',
    ordinal,
    meshHash: qualificationLevel.meshHash,
    meshProfileHash: qualificationLevel.meshProfileHash,
    nodeCount: level.meshEvidence.mesh.nodes.length,
    elementCount: qualificationLevel.elementCount,
    projectedResultant: qualificationLevel.projectedResultant,
    reactionResultant,
    equilibriumClosure,
    freeDofCount: qualificationLevel.freeDofCount,
    constrainedDofCount: qualificationLevel.constrainedDofCount,
    solverMethod: qualificationLevel.solverMethod,
    minimumPivot: qualificationLevel.minimumPivot,
    pivotRatio: qualificationLevel.pivotRatio,
    maximumDisplacementMagnitude,
    maximumRetainedVonMises,
    executionHash: qualificationLevel.executionHash,
    resultHash: qualificationLevel.resultHash,
    recoveryHash: qualificationLevel.recoveryHash,
    integrationPointResultHash:
      qualificationLevel.integrationPointResultHash,
    retainedRecoveryAuthority: 'INTEGRATION_POINT_ENGINEERING_RESULT',
    projectedDisplayProducedByController: false,
    status: 'PASS',
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function summarizeFinestLevel({
  level,
  projectionLevel,
  controllerLevel,
  renderBridge,
}) {
  const fieldRequest = renderBridge.fieldRequest;
  const result = controllerLevel.execution.result;
  const loadCaseIndex = result.loadCaseResults.findIndex(
    (row) => row.loadCaseId === fieldRequest.loadCaseId,
  );
  if (loadCaseIndex < 0) {
    throw handoffError('LAFEA_NB_T6E_DISPLAY_LOAD_CASE_MISSING');
  }
  const resultLoadCase = result.loadCaseResults[loadCaseIndex];
  const meshElements = projectionLevel.meshEvidence.mesh.elements;
  const resultById = new Map(
    resultLoadCase.elementResults.map((row, index) => [row.elementId, { row, index }]),
  );
  const displayById = new Map(
    renderBridge.displayField.values.map((row) => [row.elementId, row]),
  );
  if (resultById.size !== meshElements.length
    || displayById.size !== meshElements.length) {
    throw handoffError('LAFEA_NB_T6E_FINEST_ELEMENT_SET_MISMATCH');
  }
  const quantityKey = QUANTITY_KEYS[fieldRequest.quantity];
  const retainedSources = meshElements.map((element) => {
    const match = resultById.get(element.elementId);
    const display = displayById.get(element.elementId);
    if (!match || !display || JSON.stringify(match.row.nodeIds)
      !== JSON.stringify(element.nodeIds)) {
      throw handoffError('LAFEA_NB_T6E_FINEST_CONNECTIVITY_MISMATCH');
    }
    const point = match.row.gaussPointResults?.[
      fieldRequest.location.integrationPointIndex
    ];
    const value = point?.stress?.[quantityKey];
    if (!Number.isFinite(value) || display.value !== value
      || display.authorityLayer
        !== 'B7D_RETAINED_INTEGRATION_POINT_ENGINEERING_RESULT') {
      throw handoffError('LAFEA_NB_T6E_FINEST_RETAINED_VALUE_MISMATCH');
    }
    return deepFreeze({
      elementId: element.elementId,
      value,
      sourcePath: display.sourcePath,
      authorityLayer: 'INTEGRATION_POINT_RETAINED_ENGINEERING_RESULT',
    });
  });
  const base = {
    schema: 'lafea-selected-pilot-finest-level-summary/v1',
    ordinal: 3,
    meshHash: level.meshHash,
    meshArtifactHash: projectionLevel.meshEvidence.artifactHash,
    meshProfileHash: level.meshProfileHash,
    nodeCount: level.nodeCount,
    elementCount: level.elementCount,
    executionHash: level.executionHash,
    resultHash: level.resultHash,
    recoveryHash: level.recoveryHash,
    convergenceHash: renderBridge.convergenceHash,
    integrationPointResultHash: level.integrationPointResultHash,
    loadCaseId: fieldRequest.loadCaseId,
    requestedQuantity: fieldRequest.quantity,
    requestedLocation: fieldRequest.location,
    retainedSources,
    renderBridgeHash: renderBridge.bridgeHash,
    displayFieldHash: canonicalLafeaSha256(renderBridge.displayField),
    renderPacketLineageHash: canonicalLafeaSha256(renderBridge.renderPacket.lineage),
    crossElementSmoothingPerformed: false,
    nodalAveragingPerformed: false,
    assessmentAuthority: false,
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function createDisplayEvidence(renderBridge) {
  const renderPacket = portableClone(renderBridge.renderPacket);
  const displayField = portableClone(renderBridge.displayField);
  const base = {
    schema: 'lafea-selected-pilot-display-evidence-handoff/v1',
    renderBridgeSchema: renderBridge.schema,
    renderBridgeRevision: renderBridge.producerRevision,
    renderBridgeHash: renderBridge.bridgeHash,
    sceneRevision: renderBridge.sceneRevision,
    displayGeometryHash: renderBridge.displayGeometryHash,
    renderProfileHash: renderBridge.renderProfileHash,
    fieldRequest: portableClone(renderBridge.fieldRequest),
    displayField,
    renderPacket,
    existingRenderBridgeConsumed: true,
    valuesIncluded: true,
    valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
    displayValuesAuthoritative: false,
    newDisplayProjectionProduced: false,
    newEngineeringRecoveryProduced: false,
    lifecycleArtifactsRegistered: false,
    crossElementSmoothingAuthorized: false,
    nodalAveragingAuthorized: false,
    assessmentAuthority: false,
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function requireIncreasingLevels(levels) {
  if (levels.length !== 3
    || levels.some((row, index) => row.ordinal !== index + 1)
    || levels.some((row, index) => index > 0
      && row.elementCount <= levels[index - 1].elementCount)) {
    throw handoffError('LAFEA_NB_T6E_LEVEL_REFINEMENT_INVALID');
  }
}

function requireHandoff(value) {
  if (!value || value.schema !== LAFEA_SELECTED_PILOT_REVIEW_HANDOFF_SCHEMA
    || value.producerRevision !== LAFEA_SELECTED_PILOT_REVIEW_PRODUCER_REVISION
    || value.templateId !== TEMPLATE_ID || value.stageId !== STAGE_ID
    || value.status !== STATUS
    || value.reviewPacket?.schema !== LAFEA_SELECTED_PILOT_REVIEW_PACKET_SCHEMA
    || value.reviewPacket?.status !== STATUS
    || value.auditReceipt?.schema !== LAFEA_SELECTED_PILOT_AUDIT_RECEIPT_SCHEMA
    || value.auditReceipt?.status !== STATUS
    || value.auditReceipt?.reviewPacketReady !== true
    || value.auditReceipt?.portableAuditHandoff !== true
    || value.auditReceipt?.existingRenderBridgeConsumed !== true
    || value.auditReceipt?.newDisplayProjectionProduced !== false
    || value.auditReceipt?.formalReportProduced !== false
    || value.auditReceipt?.releaseQualified !== false
    || value.auditReceipt?.reviewPacketHash !== value.reviewPacket.packetHash
    || value.auditReceipt?.renderBridgeHash
      !== value.reviewPacket.parentHashes?.renderBridgeHash
    || value.auditReceipt?.displayEvidenceHash
      !== value.reviewPacket.displayEvidence?.semanticHash
    || value.reviewPacket?.displayEvidence?.existingRenderBridgeConsumed
      !== true
    || value.reviewPacket?.displayEvidence?.valuesIncluded !== true
    || value.reviewPacket?.displayEvidence?.valueRole
      !== 'PRODUCER_PROJECTED_DISPLAY_ONLY'
    || value.reviewPacket?.displayEvidence?.displayField?.valueRole
      !== 'PRODUCER_PROJECTED_DISPLAY_ONLY'
    || value.reviewPacket?.displayEvidence?.renderPacket?.field?.valueRole
      !== 'PRODUCER_PROJECTED_DISPLAY_ONLY'
    || value.reviewPacket?.displayEvidence?.displayValuesAuthoritative
      !== false
    || value.reviewPacket?.displayEvidence?.newDisplayProjectionProduced
      !== false
    || value.reviewPacket?.displayEvidence?.newEngineeringRecoveryProduced
      !== false
    || value.reviewPacket?.displayEvidence?.assessmentAuthority !== false
    || JSON.stringify(value.reviewPacket?.authority)
      !== JSON.stringify(reviewAuthority())
    || value.authority?.reviewPacketReady !== true
    || value.authority?.portableAuditHandoff !== true
    || value.authority?.existingRenderBridgeConsumed !== true
    || value.authority?.solverExecuted !== false
    || value.authority?.newRecoveryProduced !== false
    || value.authority?.newConvergenceProduced !== false
    || value.authority?.newDisplayProjectionProduced !== false
    || value.authority?.generalT7dAuthorized !== false
    || value.authority?.shellAuthorized !== false
    || value.authority?.assessmentReady !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false
    || JSON.stringify(value.authority) !== JSON.stringify(reviewAuthority())) {
    throw handoffError('LAFEA_NB_T6E_HANDOFF_CONTRACT_INVALID');
  }
  const levels = value.reviewPacket.levels;
  requireIncreasingLevels(levels);
  levels.forEach((row) => requireSemanticRecord(
    row,
    'LAFEA_NB_T6E_LEVEL_HASH_TAMPERED',
  ));
  requireSemanticRecord(
    value.reviewPacket.finestLevel,
    'LAFEA_NB_T6E_FINEST_HASH_TAMPERED',
  );
  const packetBasis = { ...value.reviewPacket };
  delete packetBasis.packetHash;
  if (canonicalLafeaSha256(packetBasis) !== value.reviewPacket.packetHash) {
    throw handoffError('LAFEA_NB_T6E_PACKET_HASH_TAMPERED');
  }
  const displayBasis = { ...value.reviewPacket.displayEvidence };
  delete displayBasis.semanticHash;
  if (canonicalLafeaSha256(displayBasis)
      !== value.reviewPacket.displayEvidence.semanticHash) {
    throw handoffError('LAFEA_NB_T6E_DISPLAY_EVIDENCE_HASH_TAMPERED');
  }
  const receiptBasis = { ...value.auditReceipt };
  delete receiptBasis.semanticHash;
  delete receiptBasis.evidenceHash;
  const receiptSemanticBasis = { ...receiptBasis };
  delete receiptSemanticBasis.diagnostics;
  if (canonicalLafeaSha256(receiptSemanticBasis)
      !== value.auditReceipt.semanticHash
    || canonicalLafeaSha256({
      schema: 'lafea-selected-pilot-audit-receipt-evidence/v1',
      semanticHash: value.auditReceipt.semanticHash,
      diagnostics: value.auditReceipt.diagnostics,
    }) !== value.auditReceipt.evidenceHash) {
    throw handoffError('LAFEA_NB_T6E_RECEIPT_HASH_TAMPERED');
  }
  if (canonicalLafeaSha256({
    schema: 'lafea-selected-pilot-portable-payload/v1',
    reviewPacket: value.reviewPacket,
    auditReceipt: value.auditReceipt,
  }) !== value.portablePayloadHash) {
    throw handoffError('LAFEA_NB_T6E_PORTABLE_PAYLOAD_HASH_TAMPERED');
  }
  const packageBasis = { ...value };
  delete packageBasis.portablePayloadHash;
  delete packageBasis.semanticHash;
  if (canonicalLafeaSha256(packageBasis) !== value.semanticHash) {
    throw handoffError('LAFEA_NB_T6E_HANDOFF_HASH_TAMPERED');
  }
  if (!isDeepFrozen(value)) {
    throw handoffError('LAFEA_NB_T6E_HANDOFF_NOT_FROZEN');
  }
  return value;
}

function requireSemanticRecord(value, code) {
  if (!value || typeof value !== 'object'
    || typeof value.semanticHash !== 'string') {
    throw handoffError(code);
  }
  const basis = { ...value };
  delete basis.semanticHash;
  if (canonicalLafeaSha256(basis) !== value.semanticHash) {
    throw handoffError(code);
  }
}

function reviewAuthority() {
  return deepFreeze({
    reviewPacketReady: true,
    portableAuditHandoff: true,
    existingRenderBridgeConsumed: true,
    selectedPilotQualificationChanged: false,
    solverExecuted: false,
    newRecoveryProduced: false,
    newConvergenceProduced: false,
    newDisplayProjectionProduced: false,
    displayValuesIncluded: true,
    displayValuesAuthoritative: false,
    generalT7dAuthorized: false,
    additionalContinuumTemplatesAuthorized: false,
    arbitraryOuterProfileSupported: false,
    arbitraryHoleTopologySupported: false,
    shellAuthorized: false,
    sclAuthorized: false,
    structuralStressAuthorized: false,
    assessmentReady: false,
    codeReady: false,
    reportAuthority: false,
    releaseQualified: false,
  });
}

function portableClone(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(portableClone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, portableClone(item)]),
  );
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw handoffError('LAFEA_NB_T6E_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw handoffError('LAFEA_NB_T6E_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw handoffError('LAFEA_NB_T6E_EXACT_HEAD_SHA_INVALID');
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw handoffError('LAFEA_NB_T6E_TEXT_REQUIRED', `${label} required.`);
  }
  return value;
}

function handoffError(code, message = code) {
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

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
