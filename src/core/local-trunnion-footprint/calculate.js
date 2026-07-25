import {
  ENGINEERING_LEVEL, FORMULA_IDS, MANDATORY_LIMITATIONS, QUALIFICATION_STATES,
  RESULT_SCHEMA, WORKFLOW_VERSION,
} from './constants.js';
import {
  createCanonicalTrunnionFootprintModel,
  createCanonicalTrunnionFootprintSource,
  validateCanonicalTrunnionFootprintModel,
} from './canonical-model.js';
import { assessmentRegionEvidence } from './assessment.js';
import { transferAndDistribute } from './distribution.js';
import { TrunnionFootprintError } from './errors.js';
import { deepFreeze } from './json.js';
import { attachTrunnionFootprintResultHashes, reconstructTrunnionFootprintResultHashes } from './result-hashes.js';
import { adoptAndSolveShell } from './shell-adoption.js';
import { attachmentLoadCase, rejectPressureOnlyRequest, validateAttachmentEvidence } from './source-evidence.js';

export function calculateLocalTrunnionFootprint(input) {
  let source;
  let model;
  try {
    source = createCanonicalTrunnionFootprintSource(input);
    model = validateCanonicalTrunnionFootprintModel(createCanonicalTrunnionFootprintModel(source));
    return acceptedResult(source, model);
  } catch (error) {
    return rejectedResult(source ?? input, model, normalizeError(error));
  }
}
export const calculateTrunnionFootprintShellWorkflow = calculateLocalTrunnionFootprint;
export { reconstructTrunnionFootprintResultHashes };

function acceptedResult(source, model) {
  const attachment = validateAttachmentEvidence(source.attachmentEvidence, source.sourceAncestry);
  rejectPressureOnlyRequest(attachment.result, model.canonicalLoadCaseMappings);
  const nodeMap = new Map(source.shellTemplate.nodes.map((node) => [node.nodeId, node]));
  const distributions = model.canonicalLoadCaseMappings.map((mapping) => transferAndDistribute(
    mapping,
    attachmentLoadCase(attachment.result, mapping.attachmentLoadCaseId),
    model.canonicalFootprint,
    nodeMap,
    model.qualificationProfile,
  ));
  const shell = adoptAndSolveShell(source, model, distributions);
  const assessmentRegionResults = assessmentRegionEvidence(model.canonicalAssessmentRegions, shell.rawShellResult, model.qualificationProfile);
  const base = {
    schema: RESULT_SCHEMA,
    workflowIdentity: model.workflowIdentity,
    workflowVersion: model.workflowVersion,
    sourceAncestry: model.sourceAncestry,
    qualification: {
      state: QUALIFICATION_STATES.ACCEPTED,
      engineeringLevel: ENGINEERING_LEVEL,
      accepted: true,
      summary: 'Attachment evidence, geometry, footprint distribution and shell result qualified.',
      shellHashReconstructionEvidence: shell.shellHashReconstructionEvidence,
    },
    canonicalWorkflowModelHash: model.semanticHash,
    canonicalWorkflowModel: model,
    attachmentEvidenceHash: model.acceptedAttachmentEvidenceHash,
    canonicalShellModelHash: shell.canonicalShellModelHash,
    shellResultHash: shell.shellResultHash,
    footprintGeometryEvidence: geometryEvidence(model),
    loadDistributionEvidence: distributions,
    generatedShellModel: shell.canonicalShellModel,
    rawShellResult: shell.rawShellResult,
    loadCaseResults: loadCaseResults(distributions, shell.rawShellResult),
    assessmentRegionResults,
    formulaTrace: Object.values(FORMULA_IDS).sort(),
    diagnostics: [],
    limitations: model.limitations,
  };
  return deepFreeze(attachTrunnionFootprintResultHashes(base));
}

function geometryEvidence(model) {
  return {
    pipeGeometry: model.pipeGeometry,
    trunnionGeometry: model.trunnionGeometry,
    canonicalFootprint: model.canonicalFootprint,
    footprintGeometryHash: model.canonicalFootprint.footprintGeometryHash,
  };
}

function loadCaseResults(distributions, shellResult) {
  const shellCases = new Map(shellResult.loadCaseResults.map((row) => [row.loadCaseId, row]));
  return distributions.map((row) => ({
    workflowLoadCaseId: row.workflowLoadCaseId,
    attachmentLoadCaseId: row.attachmentLoadCaseId,
    shellLoadCaseId: row.shellLoadCaseId,
    loadDistributionResultHash: row.loadDistributionResultHash,
    shellLoadCaseQualification: shellCases.get(row.shellLoadCaseId).qualification,
    shellLoadCaseProvenance: { loadCaseId: row.shellLoadCaseId, canonicalShellModelHash: shellResult.canonicalModelSemanticHash, shellResultHash: shellResult.semanticHashes.resultPayloadSemanticHash },
  }));
}
function rejectedResult(input, model, diagnostic) {
  const base = {
    schema: RESULT_SCHEMA,
    workflowIdentity: safeString(input, 'workflowIdentity'),
    workflowVersion: safeString(input, 'workflowVersion') ?? WORKFLOW_VERSION,
    sourceAncestry: safeAncestry(input),
    qualification: { state: diagnostic.state, engineeringLevel: ENGINEERING_LEVEL, accepted: false, summary: diagnostic.message },
    canonicalWorkflowModelHash: model?.semanticHash ?? null,
    attachmentEvidenceHash: model?.acceptedAttachmentEvidenceHash ?? null,
    formulaTrace: [],
    diagnostics: [diagnostic],
    limitations: rejectedLimitations(input),
  };
  return deepFreeze(attachTrunnionFootprintResultHashes(base));
}
function normalizeError(error) {
  if (error instanceof TrunnionFootprintError) return { state: error.state, code: error.code, path: error.path, message: error.message, evidence: error.evidence };
  return { state: QUALIFICATION_STATES.NUMERICAL_FAILURE, code: 'UNEXPECTED_NUMERICAL_FAILURE', path: 'calculation', message: error instanceof Error ? error.message : 'Unknown numerical failure.', evidence: null };
}
function safeString(record, key) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable && 'value' in descriptor && typeof descriptor.value === 'string' ? descriptor.value : null;
}
function safeAncestry(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(record, 'sourceAncestry');
  const value = descriptor?.enumerable && 'value' in descriptor ? descriptor.value : null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const result = {};
  for (const key of ['attachmentCanonicalModelSemanticHash', 'attachmentResultPayloadSemanticHash', 'shellTemplateSemanticHash', 'sourceReference']) result[key] = safeString(value, key);
  return result;
}
function rejectedLimitations(input) {
  const descriptor = input && typeof input === 'object' && !Array.isArray(input) ? Object.getOwnPropertyDescriptor(input, 'limitations') : null;
  const value = descriptor?.enumerable && 'value' in descriptor ? descriptor.value : [];
  const values = safeStringArray(value);
  return [...new Set([...MANDATORY_LIMITATIONS, ...values, 'NO_AUTHORITATIVE_LOAD_DISTRIBUTION_OR_SHELL_EVIDENCE'])].sort();
}
function safeStringArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return [];
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'string') return [];
    result.push(descriptor.value);
  }
  return result;
}