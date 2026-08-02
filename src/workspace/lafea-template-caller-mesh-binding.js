/**
 * B6 read-only adapter from B1/B2 template parents and NB-T4A mesh evidence.
 *
 * The adapter does not generate or register a mesh, execute LAFEA.3, create
 * recovery/convergence evidence, or promote production/release authority.
 */
import {
  createTemplateCallerMeshBinding,
} from '../core/lafea-application-templates/caller-mesh-binding.js';
import {
  validateTemplateReleaseRecordV2,
} from '../core/lafea-application-templates/release-record-v2.js';
import {
  validateTemplateTargetCompatibilityReceipt,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_TEMPLATE_CALLER_MESH_ADAPTER_REVISION = 'B6.1';

const INPUT_KEYS = Object.freeze([
  'releaseRecord',
  'compatibilityReceipt',
  'meshEvidence',
  'sourceAuthorityHash',
  'materialRegionEvidence',
  'loadEdgeEvidence',
  'boundaryEdgeEvidence',
]);

export function bindLafeaContinuumTemplateCallerMesh(options) {
  exactKeys(options, INPUT_KEYS, 'Template caller-mesh binding options');
  requireValid(
    validateTemplateReleaseRecordV2(options.releaseRecord),
    'LAFEA_TEMPLATE_CALLER_MESH_RELEASE_RECORD_INVALID',
  );
  requireValid(
    validateTemplateTargetCompatibilityReceipt(options.compatibilityReceipt),
    'LAFEA_TEMPLATE_CALLER_MESH_COMPATIBILITY_INVALID',
  );
  const release = options.releaseRecord;
  const receipt = options.compatibilityReceipt;
  if (!['COMPILED_READY', 'IMPORTED_FOR_EDITING', 'ENGINE_EXECUTABLE']
    .includes(release.releaseState.authorityState)) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_RELEASE_STATE_INVALID');
  }
  if (receipt.status !== 'CURRENT') {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_TARGET_NOT_CURRENT');
  }
  if (release.template.templateId !== receipt.templateId
    || release.template.templateSemanticHash !== receipt.templateSemanticHash
    || release.compiler.bindingHash !== receipt.compilerBindingHash
    || release.handoff.compilationHash !== receipt.compilationHash
    || release.handoff.handoffHash !== receipt.handoffHash
    || release.targetStage.stageId !== 'LAFEA.3'
    || receipt.targetStage.stageId !== 'LAFEA.3') {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_TEMPLATE_PARENT_MISMATCH');
  }
  if (release.meshAuthority.applicability !== 'REQUIRED'
    || receipt.meshRequirement.applicability !== 'REQUIRED'
    || release.meshAuthority.authoritySchema
      !== receipt.meshRequirement.authoritySchema
    || release.meshAuthority.authorityRole
      !== receipt.meshRequirement.authorityRole
    || release.meshAuthority.authorityStatus
      !== receipt.meshRequirement.requiredStatus) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_REQUIREMENT_MISMATCH');
  }

  const evidence = reconstructMeshEvidence(options.meshEvidence);
  if (evidence.stageId !== 'LAFEA.3'
    || evidence.status !== 'CURRENT'
    || evidence.qualification !== 'PASS'
    || evidence.quality.worstStatus === 'BLOCK') {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_EVIDENCE_NOT_CURRENT_PASS');
  }
  if (!evidence.mesh.elements.length
    || evidence.mesh.elements.some((element) => element.elementType !== 'T6')) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_T6_REQUIRED');
  }
  if (evidence.sourceHash !== release.meshAuthority.sourceHash
    && release.meshAuthority.sourceHash !== null) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_SOURCE_PARENT_MISMATCH');
  }
  if (release.meshAuthority.canonicalModelHash !== null
    && evidence.canonicalModelHash !== release.meshAuthority.canonicalModelHash) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_MODEL_PARENT_MISMATCH');
  }
  if (release.meshAuthority.analysisGeometryHash !== null
    && evidence.analysisGeometryHash !== release.meshAuthority.analysisGeometryHash) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_GEOMETRY_PARENT_MISMATCH');
  }
  if (release.meshAuthority.meshProfileHash !== null
    && evidence.meshProfileHash !== release.meshAuthority.meshProfileHash) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_PROFILE_PARENT_MISMATCH');
  }
  if (release.meshAuthority.meshHash !== null
    && evidence.meshHash !== release.meshAuthority.meshHash) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_CONTENT_PARENT_MISMATCH');
  }

  return createTemplateCallerMeshBinding({
    templateId: release.template.templateId,
    templateSemanticHash: release.template.templateSemanticHash,
    compilationHash: release.handoff.compilationHash,
    handoffHash: release.handoff.handoffHash,
    compatibilityReceiptHash: receipt.semanticHash,
    targetStageId: 'LAFEA.3',
    targetCompositionRootHash: receipt.compositionRoot.compositionRootHash,
    sourceAuthorityHash: options.sourceAuthorityHash,
    sourceHash: evidence.sourceHash,
    canonicalModelHash: evidence.canonicalModelHash,
    analysisGeometryHash: evidence.analysisGeometryHash,
    meshProfileHash: evidence.meshProfileHash,
    meshHash: evidence.meshHash,
    meshAuthorityHash: canonicalLafeaSha256(evidence.authority),
    qualityEvidenceHash: canonicalLafeaSha256(evidence.quality),
    materialRegionEvidence: options.materialRegionEvidence,
    loadEdgeEvidence: options.loadEdgeEvidence,
    boundaryEdgeEvidence: options.boundaryEdgeEvidence,
  });
}

function reconstructMeshEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_EVIDENCE_INVALID');
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
    throw bindingError('LAFEA_TEMPLATE_CALLER_MESH_EVIDENCE_TAMPERED');
  }
  return rebuilt;
}

function requireValid(validation, code) {
  if (!validation.ok) throw bindingError(code, validation.errors.join(' '));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function bindingError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
