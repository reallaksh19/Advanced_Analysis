/**
 * NB-T6A controlled continuum pilot controller.
 *
 * Executes only the B7C-authorized C2D-LUG-PINHOLE -> LAFEA.3 pilot over
 * exactly three caller-supplied, NB-T4A-qualified T6 meshes. The controller
 * revalidates release, target, mapping and benchmark parents, issues exact
 * source authority, executes the retained local-continuum kernel, retains
 * integration-point recovery and evaluates the B7C convergence receipt.
 *
 * It does not generate a mesh, register lifecycle evidence, assess code,
 * authorize general T7D, execute shell routes or qualify release.
 */
import {
  createControlledContinuumExecutionReceipt,
  createControlledContinuumLevelEvidence,
  validateControlledContinuumExecutionRequest,
} from '../core/lafea-application-templates/controlled-continuum-pilot-contract.js';
import {
  validateLafeaLugPinholeMappingPackage,
} from '../core/lafea-application-templates/continuum-application-mapping-evidence.js';
import {
  validateLafeaContinuumBenchmarkQualification,
} from '../core/lafea-application-templates/continuum-benchmark-convergence.js';
import {
  validateTemplateReleaseRecordV2,
} from '../core/lafea-application-templates/release-record-v2.js';
import {
  evaluateTemplateTargetCompatibility,
  validateTemplateTargetCompatibilityReceipt,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  QUALIFICATION_STATES,
  RESULT_SCHEMA,
  calculateLocalContinuum,
  validateCanonicalLocalContinuumModel,
} from '../core/local-continuum/index.js';
import {
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from './lafea-target-compatibility-authority.js';

export const LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA =
  'lafea-controlled-continuum-controller-result/v1';
export const LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_REVISION = 'NB-T6A.1';
export const LAFEA_CONTROLLED_CONTINUUM_RECOVERY_PROFILE_SCHEMA =
  'lafea-controlled-continuum-recovery-profile/v1';
export const LAFEA_CONTROLLED_CONTINUUM_CONVERGENCE_PROFILE_SCHEMA =
  'lafea-controlled-continuum-convergence-profile/v1';
export const LAFEA_CONTROLLED_CONTINUUM_RECOVERY_QUANTITIES = Object.freeze([
  'VON_MISES',
  'SIGMA_X',
  'SIGMA_Y',
  'TAU_XY',
  'PRINCIPAL_MAXIMUM',
  'PRINCIPAL_MINIMUM',
  'MAXIMUM_IN_PLANE_SHEAR',
]);

const INPUT_KEYS = Object.freeze([
  'request',
  'releaseRecord',
  'compatibilityReceipt',
  'mappingPackage',
  'benchmarkQualification',
  'document',
  'levels',
  'recoveryProfile',
  'convergenceProfile',
]);
const LEVEL_KEYS = Object.freeze(['ordinal', 'meshEvidence', 'canonicalModel']);
const RECOVERY_PROFILE_KEYS = Object.freeze([
  'schema', 'loadCaseId', 'quantity', 'reduction', 'units', 'authority',
]);
const CONVERGENCE_PROFILE_KEYS = Object.freeze([
  'schema', 'quantityId', 'units', 'tolerance', 'requireImprovement',
]);

/** Execute the single B7C-authorized three-level continuum pilot. */
export function executeControlledLafeaContinuumPilot(options) {
  const context = createContext(options);
  try {
    validateControllerInput(context);
    validatePrerequisiteAuthority(context);
    validateDocumentRevision(context);
    validateLevelInputs(context);
    issueExactSourceAuthority(context);
    validateSourceParents(context);
    executeLevels(context);
    createReceipt(context);
  } catch (error) {
    context.diagnostics.push(errorCode(error, 'LAFEA_NB_T6A_CONTROLLER_BLOCKED'));
  }
  return controllerResult(context);
}

function createContext(options) {
  return {
    options,
    request: options?.request ?? null,
    releaseRecord: options?.releaseRecord ?? null,
    providedCompatibilityReceipt: options?.compatibilityReceipt ?? null,
    currentCompatibilityReceipt: null,
    mappingPackage: options?.mappingPackage ?? null,
    benchmarkQualification: options?.benchmarkQualification ?? null,
    document: options?.document ?? null,
    recoveryProfile: null,
    convergenceProfile: null,
    levels: [],
    sourceAuthority: null,
    levelExecutions: [],
    receipt: null,
    diagnostics: [],
  };
}

function validateControllerInput(context) {
  exactKeys(context.options, INPUT_KEYS, 'Controlled continuum controller options');
  requirePlainRecord(context.document, 'document');
  requireValid(
    validateControlledContinuumExecutionRequest(context.request),
    'LAFEA_NB_T6A_REQUEST_INVALID',
  );
  requireValid(
    validateTemplateReleaseRecordV2(context.releaseRecord),
    'LAFEA_NB_T6A_RELEASE_RECORD_INVALID',
  );
  requireValid(
    validateTemplateTargetCompatibilityReceipt(
      context.providedCompatibilityReceipt,
    ),
    'LAFEA_NB_T6A_COMPATIBILITY_RECEIPT_INVALID',
  );
  requireValid(
    validateLafeaLugPinholeMappingPackage(context.mappingPackage),
    'LAFEA_NB_T6A_MAPPING_PACKAGE_INVALID',
  );
  requireValid(
    validateLafeaContinuumBenchmarkQualification(
      context.benchmarkQualification,
    ),
    'LAFEA_NB_T6A_BENCHMARK_QUALIFICATION_INVALID',
  );
  context.recoveryProfile = normalizeRecoveryProfile(
    context.options.recoveryProfile,
  );
  context.convergenceProfile = normalizeConvergenceProfile(
    context.options.convergenceProfile,
  );
  if (canonicalLafeaSha256(context.recoveryProfile)
    !== context.request.recoveryProfileHash) {
    throw controllerError('LAFEA_NB_T6A_RECOVERY_PROFILE_HASH_MISMATCH');
  }
  if (canonicalLafeaSha256(context.convergenceProfile)
    !== context.request.convergenceProfileHash) {
    throw controllerError('LAFEA_NB_T6A_CONVERGENCE_PROFILE_HASH_MISMATCH');
  }
  if (context.recoveryProfile.units !== context.convergenceProfile.units) {
    throw controllerError('LAFEA_NB_T6A_PROFILE_UNIT_MISMATCH');
  }
}

function validatePrerequisiteAuthority(context) {
  const { request, releaseRecord, providedCompatibilityReceipt } = context;
  if (request.templateId !== 'C2D-LUG-PINHOLE'
    || request.stageId !== 'LAFEA.3') {
    throw controllerError('LAFEA_NB_T6A_PILOT_IDENTITY_INVALID');
  }
  if (releaseRecord.semanticHash !== request.releaseRecordHash
    || releaseRecord.template?.templateId !== request.templateId
    || releaseRecord.targetStage?.stageId !== request.stageId) {
    throw controllerError('LAFEA_NB_T6A_RELEASE_PARENT_MISMATCH');
  }
  if (releaseRecord.releaseState?.authorityState !== 'ENGINE_EXECUTABLE'
    || releaseRecord.releaseState?.validity !== 'CURRENT'
    || releaseRecord.releaseState?.releaseQualified !== false
    || request.releaseAuthorityState !== 'ENGINE_EXECUTABLE'
    || request.releaseValidity !== 'CURRENT') {
    throw controllerError('LAFEA_NB_T6A_RELEASE_NOT_ENGINE_EXECUTABLE');
  }
  if (providedCompatibilityReceipt.semanticHash
    !== request.compatibilityReceiptHash
    || providedCompatibilityReceipt.status !== 'CURRENT'
    || request.compatibilityStatus !== 'CURRENT'
    || releaseRecord.compositionRoot?.compatibilityReceiptHash
      !== providedCompatibilityReceipt.semanticHash) {
    throw controllerError('LAFEA_NB_T6A_COMPATIBILITY_PARENT_MISMATCH');
  }
  const snapshot = createCurrentLafeaTargetAuthoritySnapshot('LAFEA.3');
  context.currentCompatibilityReceipt = evaluateTemplateTargetCompatibility(
    releaseRecord,
    snapshot,
  );
  if (context.currentCompatibilityReceipt.status !== 'CURRENT'
    || context.currentCompatibilityReceipt.semanticHash
      !== providedCompatibilityReceipt.semanticHash) {
    throw controllerError('LAFEA_NB_T6A_TARGET_COMPATIBILITY_CHANGED');
  }

  const mapping = context.mappingPackage;
  if (mapping.semanticHash !== request.mappingPackageHash
    || mapping.status !== 'MAPPING_EVIDENCE_QUALIFIED'
    || request.mappingStatus !== 'MAPPING_EVIDENCE_QUALIFIED'
    || mapping.boundBinding?.semanticHash !== request.boundBindingHash
    || mapping.boundBinding?.status !== 'BOUND'
    || request.boundBindingStatus !== 'BOUND'
    || mapping.templateId !== request.templateId
    || mapping.stageId !== request.stageId
    || mapping.canonicalModelHash !== request.canonicalModelHash
    || mapping.analysisGeometryHash !== request.analysisGeometryHash) {
    throw controllerError('LAFEA_NB_T6A_MAPPING_PARENT_MISMATCH');
  }

  const benchmark = context.benchmarkQualification;
  if (benchmark.semanticHash !== request.benchmarkQualificationHash
    || benchmark.status !== 'BENCHMARK_EVIDENCE_QUALIFIED'
    || request.benchmarkStatus !== 'BENCHMARK_EVIDENCE_QUALIFIED'
    || benchmark.mappingPackageHash !== mapping.semanticHash
    || benchmark.templateId !== request.templateId
    || benchmark.stageId !== request.stageId) {
    throw controllerError('LAFEA_NB_T6A_BENCHMARK_PARENT_MISMATCH');
  }
}

function validateDocumentRevision(context) {
  const digest = lafeaDocumentDigest(context.document);
  if (digest !== context.request.importedDocumentRevisionDigest
    || digest !== context.request.sourceAuthorityRequest
      .expectedDocumentRevisionDigest) {
    throw controllerError('LAFEA_NB_T6A_IMPORTED_DOCUMENT_REVISION_STALE');
  }
}

function validateLevelInputs(context) {
  if (!Array.isArray(context.options.levels)
    || context.options.levels.length !== 3) {
    throw controllerError('LAFEA_NB_T6A_THREE_LEVEL_INPUT_REQUIRED');
  }
  const normalized = [...context.options.levels]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((level, index) => normalizeLevel(context, level, index));
  const elementCounts = normalized.map((row) => row.meshEvidence.mesh.elements.length);
  if (!(elementCounts[0] < elementCounts[1]
    && elementCounts[1] < elementCounts[2])) {
    throw controllerError('LAFEA_NB_T6A_MESH_REFINEMENT_NOT_INCREASING');
  }
  context.levels = normalized;
}

function normalizeLevel(context, value, index) {
  exactKeys(value, LEVEL_KEYS, `levels[${index}]`);
  if (value.ordinal !== index + 1) {
    throw controllerError('LAFEA_NB_T6A_LEVEL_ORDINAL_INVALID');
  }
  const meshEvidence = rebuildMeshEvidence(value.meshEvidence);
  const canonicalModel = validateCanonicalLocalContinuumModel(
    value.canonicalModel,
  );
  const requested = context.request.meshLevels[index];
  if (meshEvidence.stageId !== 'LAFEA.3'
    || meshEvidence.status !== 'CURRENT'
    || meshEvidence.qualification !== 'PASS'
    || meshEvidence.meshHash !== requested.meshHash
    || meshEvidence.meshProfileHash !== requested.meshProfileHash
    || meshEvidence.canonicalModelHash !== requested.canonicalModelHash
    || meshEvidence.analysisGeometryHash !== requested.analysisGeometryHash
    || requested.elementType !== 'T6') {
    throw controllerError('LAFEA_NB_T6A_LEVEL_MESH_PARENT_MISMATCH');
  }
  if (meshEvidence.mesh.elements.some((row) => row.elementType !== 'T6')
    || canonicalModel.elements.some((row) => row.elementType !== 'T6')) {
    throw controllerError('LAFEA_NB_T6A_T6_ONLY');
  }
  if (canonicalModel.units?.canonical?.stress !== 'MPa'
    || context.recoveryProfile.units !== 'MPa') {
    throw controllerError('LAFEA_NB_T6A_STRESS_UNIT_UNSUPPORTED');
  }
  if (!canonicalModel.resultRequests.loadCaseIds
    .includes(context.recoveryProfile.loadCaseId)) {
    throw controllerError('LAFEA_NB_T6A_LOAD_CASE_NOT_REQUESTED');
  }
  assertModelMeshIdentity(canonicalModel, meshEvidence.mesh);
  return deepFreeze({ ordinal: value.ordinal, meshEvidence, canonicalModel });
}

function rebuildMeshEvidence(value) {
  if (!value || typeof value !== 'object') {
    throw controllerError('LAFEA_NB_T6A_MESH_EVIDENCE_INVALID');
  }
  const rebuilt = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: value.stageId,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    meshProfile: value.meshProfile,
    mesh: value.mesh,
    authority: value.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw controllerError('LAFEA_NB_T6A_MESH_EVIDENCE_TAMPERED');
  }
  return rebuilt;
}

function assertModelMeshIdentity(model, mesh) {
  const modelNodes = new Map(model.nodes.map((row) => [row.nodeId, row]));
  if (modelNodes.size !== mesh.nodes.length) {
    throw controllerError('LAFEA_NB_T6A_MODEL_MESH_NODE_COUNT_MISMATCH');
  }
  for (const node of mesh.nodes) {
    const modelNode = modelNodes.get(node.nodeId);
    if (!modelNode || modelNode.x !== node.x || modelNode.y !== node.y
      || node.z !== 0) {
      throw controllerError('LAFEA_NB_T6A_MODEL_MESH_NODE_MISMATCH');
    }
  }
  const modelElements = new Map(model.elements.map((row) => [row.elementId, row]));
  if (modelElements.size !== mesh.elements.length) {
    throw controllerError('LAFEA_NB_T6A_MODEL_MESH_ELEMENT_COUNT_MISMATCH');
  }
  for (const element of mesh.elements) {
    const modelElement = modelElements.get(element.elementId);
    if (!modelElement || modelElement.elementType !== element.elementType
      || JSON.stringify(modelElement.nodeIds) !== JSON.stringify(element.nodeIds)) {
      throw controllerError('LAFEA_NB_T6A_MODEL_MESH_ELEMENT_MISMATCH');
    }
  }
}

function issueExactSourceAuthority(context) {
  const authority = issueLafeaSourceAuthority(
    'LAFEA.3',
    context.document,
    context.request.sourceAuthorityRequest.originRef,
  );
  if (authority.documentRevisionDigest
    !== context.request.importedDocumentRevisionDigest) {
    throw controllerError('LAFEA_NB_T6A_SOURCE_AUTHORITY_REVISION_MISMATCH');
  }
  context.sourceAuthority = authority;
}

function validateSourceParents(context) {
  const sourceHash = context.sourceAuthority.sourceHash;
  if (context.mappingPackage.sourceHash !== sourceHash
    || context.levels.some((row) => row.meshEvidence.sourceHash !== sourceHash)) {
    throw controllerError('LAFEA_NB_T6A_SOURCE_PARENT_MISMATCH');
  }
}

function executeLevels(context) {
  context.levelExecutions = context.levels.map((level) =>
    executeLevel(context, level));
}

function executeLevel(context, level) {
  const executionHash = canonicalLafeaSha256({
    schema: 'lafea-controlled-continuum-level-execution-input/v1',
    requestHash: context.request.semanticHash,
    ordinal: level.ordinal,
    sourceHash: context.sourceAuthority.sourceHash,
    meshHash: level.meshEvidence.meshHash,
    meshArtifactHash: level.meshEvidence.artifactHash,
    canonicalLocalModelHash: level.canonicalModel.semanticHash,
  });
  const result = calculateLocalContinuum(level.canonicalModel);
  const resultHash = canonicalLafeaSha256({
    schema: 'lafea-controlled-continuum-level-result/v1',
    executionHash,
    result,
  });
  if (result.schema !== RESULT_SCHEMA
    || result.qualification?.state !== QUALIFICATION_STATES.ACCEPTED) {
    const diagnostics = result.diagnostics?.map((row) =>
      typeof row?.code === 'string' ? row.code : 'LAFEA_CONTINUUM_NUMERICAL_FAILURE')
      ?? ['LAFEA_CONTINUUM_NUMERICAL_FAILURE'];
    const evidence = createControlledContinuumLevelEvidence({
      requestHash: context.request.semanticHash,
      ordinal: level.ordinal,
      meshHash: level.meshEvidence.meshHash,
      sourceAuthorityHash: canonicalLafeaSha256(context.sourceAuthority),
      exactSourceHash: context.sourceAuthority.sourceHash,
      importedDocumentRevisionDigest: context.request.importedDocumentRevisionDigest,
      executionHash,
      resultHash,
      recoveryHash: null,
      resultSchema: RESULT_SCHEMA,
      calculationAccepted: false,
      recoveryAuthority: 'NOT_PRODUCED',
      integrationPointResultHash: null,
      projectedDisplayHash: null,
      projectedDisplayRole: 'NOT_PRODUCED',
      status: 'FAILED',
      diagnostics,
    });
    return deepFreeze({
      ordinal: level.ordinal,
      result,
      recovery: null,
      observedQuantity: null,
      evidence,
    });
  }
  try {
    const recovery = retainIntegrationPointRecovery(
      result,
      context.recoveryProfile,
    );
    const recoveryHash = canonicalLafeaSha256({
      schema: 'lafea-controlled-continuum-retained-recovery/v1',
      requestHash: context.request.semanticHash,
      ordinal: level.ordinal,
      meshHash: level.meshEvidence.meshHash,
      recovery,
    });
    const integrationPointResultHash = canonicalLafeaSha256({
      schema: 'lafea-controlled-continuum-integration-point-result/v1',
      recoveryHash,
      elements: recovery.elements,
    });
    const evidence = createControlledContinuumLevelEvidence({
      requestHash: context.request.semanticHash,
      ordinal: level.ordinal,
      meshHash: level.meshEvidence.meshHash,
      sourceAuthorityHash: canonicalLafeaSha256(context.sourceAuthority),
      exactSourceHash: context.sourceAuthority.sourceHash,
      importedDocumentRevisionDigest: context.request.importedDocumentRevisionDigest,
      executionHash,
      resultHash,
      recoveryHash,
      resultSchema: RESULT_SCHEMA,
      calculationAccepted: true,
      recoveryAuthority: 'RETAINED_INTEGRATION_POINT_VALUES',
      integrationPointResultHash,
      projectedDisplayHash: null,
      projectedDisplayRole: 'NOT_PRODUCED',
      status: 'ACCEPTED',
      diagnostics: [],
    });
    return deepFreeze({
      ordinal: level.ordinal,
      result,
      recovery,
      observedQuantity: recovery.observedQuantity,
      evidence,
    });
  } catch (error) {
    const evidence = createControlledContinuumLevelEvidence({
      requestHash: context.request.semanticHash,
      ordinal: level.ordinal,
      meshHash: level.meshEvidence.meshHash,
      sourceAuthorityHash: canonicalLafeaSha256(context.sourceAuthority),
      exactSourceHash: context.sourceAuthority.sourceHash,
      importedDocumentRevisionDigest: context.request.importedDocumentRevisionDigest,
      executionHash,
      resultHash,
      recoveryHash: null,
      resultSchema: RESULT_SCHEMA,
      calculationAccepted: false,
      recoveryAuthority: 'NOT_PRODUCED',
      integrationPointResultHash: null,
      projectedDisplayHash: null,
      projectedDisplayRole: 'NOT_PRODUCED',
      status: 'FAILED',
      diagnostics: [errorCode(error, 'LAFEA_NB_T6A_RECOVERY_FAILED')],
    });
    return deepFreeze({
      ordinal: level.ordinal,
      result,
      recovery: null,
      observedQuantity: null,
      evidence,
    });
  }
}

function retainIntegrationPointRecovery(result, profile) {
  const loadCase = result.loadCaseResults?.find((row) =>
    row.loadCaseId === profile.loadCaseId);
  if (!loadCase) throw controllerError('LAFEA_NB_T6A_LOAD_CASE_RESULT_MISSING');
  const elements = loadCase.elementResults.map((element) => {
    if (element.recoveryLayer !== 'INTEGRATION_POINT'
      || !Array.isArray(element.gaussPointResults)
      || element.gaussPointResults.length === 0) {
      throw controllerError('LAFEA_NB_T6A_INTEGRATION_POINT_RECOVERY_MISSING');
    }
    return deepFreeze({
      elementId: element.elementId,
      elementType: element.elementType,
      points: element.gaussPointResults.map((point) => deepFreeze({
        pointId: point.pointId,
        xi: point.xi,
        eta: point.eta,
        weight: point.weight,
        stress: point.stress,
        principalMaximum: point.principalMaximum,
        principalMinimum: point.principalMinimum,
        maximumInPlaneShear: point.maximumInPlaneShear,
        vonMises: point.vonMises,
      })),
    });
  });
  const values = elements.flatMap((element) => element.points.map((point) =>
    recoveryValue(point, profile.quantity)));
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw controllerError('LAFEA_NB_T6A_RECOVERY_VALUE_INVALID');
  }
  const observedQuantity = Math.max(...values.map((value) => Math.abs(value)));
  return deepFreeze({
    schema: 'lafea-controlled-continuum-retained-recovery/v1',
    loadCaseId: profile.loadCaseId,
    quantity: profile.quantity,
    reduction: profile.reduction,
    units: profile.units,
    authority: profile.authority,
    elements,
    observedQuantity,
  });
}

function recoveryValue(point, quantity) {
  if (quantity === 'VON_MISES') return point.vonMises;
  if (quantity === 'PRINCIPAL_MAXIMUM') return point.principalMaximum;
  if (quantity === 'PRINCIPAL_MINIMUM') return point.principalMinimum;
  if (quantity === 'MAXIMUM_IN_PLANE_SHEAR') {
    return point.maximumInPlaneShear;
  }
  const key = {
    SIGMA_X: 'sigmaX',
    SIGMA_Y: 'sigmaY',
    TAU_XY: 'tauXY',
  }[quantity];
  return point.stress?.[key];
}

function createReceipt(context) {
  const accepted = context.levelExecutions.every((row) =>
    row.evidence.status === 'ACCEPTED');
  const pilotConvergence = accepted
    ? {
      quantityId: context.convergenceProfile.quantityId,
      units: context.convergenceProfile.units,
      tolerance: context.convergenceProfile.tolerance,
      levels: context.levelExecutions.map((row) => ({
        ordinal: row.ordinal,
        meshHash: context.levels[row.ordinal - 1].meshEvidence.meshHash,
        recoveryHash: row.evidence.recoveryHash,
        observedQuantity: row.observedQuantity,
      })),
    }
    : null;
  context.receipt = createControlledContinuumExecutionReceipt({
    receiptId: receiptId(context),
    request: context.request,
    currentDocumentRevisionDigest: lafeaDocumentDigest(context.document),
    sourceAuthorityHash: canonicalLafeaSha256(context.sourceAuthority),
    exactSourceHash: context.sourceAuthority.sourceHash,
    levelEvidence: context.levelExecutions.map((row) => row.evidence),
    pilotConvergence,
    diagnostics: [...context.diagnostics],
  });
}

function receiptId(context) {
  const digest = canonicalLafeaSha256({
    schema: 'lafea-controlled-continuum-controller-receipt-id/v1',
    requestHash: context.request.semanticHash,
    sourceHash: context.sourceAuthority.sourceHash,
    levelEvidenceHashes: context.levelExecutions.map((row) =>
      row.evidence.evidenceHash),
  });
  return `NB-T6A-LAFEA-3-${digest.slice(7, 31).toUpperCase()}`;
}

function controllerResult(context) {
  const status = context.receipt?.status
    ?? (context.sourceAuthority ? 'FAILED' : 'BLOCKED');
  const diagnostics = [...new Set([
    ...context.diagnostics,
    ...(context.receipt?.diagnostics ?? []),
  ])].sort();
  return deepFreeze({
    schema: LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA,
    controllerRevision: LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_REVISION,
    status,
    accepted: status === 'ACCEPTED',
    request: context.request,
    currentCompatibilityReceipt: context.currentCompatibilityReceipt,
    sourceAuthority: context.sourceAuthority,
    levels: context.levelExecutions,
    receipt: context.receipt,
    diagnostics,
    authority: {
      selectedPilotExecution: context.levelExecutions.length === 3,
      productionMeshGenerated: false,
      retainedIntegrationPointRecoveryProduced:
        context.levelExecutions.length === 3
        && context.levelExecutions.every((row) => row.recovery !== null),
      convergenceEvaluated: context.receipt !== null,
      lifecycleRegistered: false,
      assessmentReady: false,
      codeReady: false,
      releaseQualified: false,
      generalT7dAuthorized: false,
      shellAuthorized: false,
      lafea6Enabled: false,
    },
  });
}

function normalizeRecoveryProfile(value) {
  exactKeys(value, RECOVERY_PROFILE_KEYS, 'recoveryProfile');
  if (value.schema !== LAFEA_CONTROLLED_CONTINUUM_RECOVERY_PROFILE_SCHEMA
    || !LAFEA_CONTROLLED_CONTINUUM_RECOVERY_QUANTITIES.includes(value.quantity)
    || value.reduction !== 'MAX_ABSOLUTE'
    || value.units !== 'MPa'
    || value.authority !== 'RETAINED_INTEGRATION_POINT_VALUES') {
    throw controllerError('LAFEA_NB_T6A_RECOVERY_PROFILE_INVALID');
  }
  requireText(value.loadCaseId, 'recoveryProfile.loadCaseId');
  return deepFreeze({ ...value });
}

function normalizeConvergenceProfile(value) {
  exactKeys(value, CONVERGENCE_PROFILE_KEYS, 'convergenceProfile');
  if (value.schema !== LAFEA_CONTROLLED_CONTINUUM_CONVERGENCE_PROFILE_SCHEMA
    || value.units !== 'MPa'
    || value.requireImprovement !== true
    || typeof value.tolerance !== 'number'
    || !Number.isFinite(value.tolerance)
    || value.tolerance <= 0) {
    throw controllerError('LAFEA_NB_T6A_CONVERGENCE_PROFILE_INVALID');
  }
  requireText(value.quantityId, 'convergenceProfile.quantityId');
  return deepFreeze({ ...value });
}

function requireValid(validation, code) {
  if (!validation?.ok) {
    throw controllerError(code, validation?.errors?.join(' ') || code);
  }
}

function exactKeys(value, expected, label) {
  requirePlainRecord(value, label);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function requirePlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be non-empty text.`);
  }
}

function controllerError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function errorCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
