/** Prepare, regenerate, validate and certify one immutable command candidate. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditCommandRequest } from './topology-edit-command-contract.js';
import { resolveTopologyEditCommand } from './topology-edit-command-resolver.js';
import { buildTopologyEditCandidate } from './topology-edit-candidate-builder.js';
import { validateTopologyEditCandidate } from './topology-edit-candidate-validator.js';
import {
  createTopologyEditAuthorityReceipt,
  proposedEditLedgerHash,
} from './topology-edit-authority-receipt.js';

export const TOPOLOGY_EDIT_CERTIFICATION_RESULT_SCHEMA = 'TopologyEditCertificationResult.v1';

function rejectionReason(error, phase) {
  return {
    code: `CERTIFICATION_${phase}_REJECTED`,
    message: error instanceof Error ? error.message : String(error),
  };
}

function rejectedValidationReport(request, reason) {
  const material = {
    schema: 'TopologyEditCandidateValidation.v1',
    commandId: request.commandId,
    commandType: request.commandType,
    candidateDraftHash: null,
    canonicalTopologyHash: null,
    checkerPolicyHash: null,
    valid: false,
    errors: [{ code: reason.code, message: reason.message, targetIds: [] }],
    warnings: [],
  };
  return deepFreeze({ ...material, validationHash: semanticHash(material) });
}

function certificationEnvelope(request, disposition, receipt, validationReport, candidate) {
  const material = {
    schema: TOPOLOGY_EDIT_CERTIFICATION_RESULT_SCHEMA,
    commandId: request.commandId,
    commandType: request.commandType,
    disposition,
    receipt,
    validationReport,
    candidate,
  };
  return deepFreeze({ ...material, certificationHash: semanticHash(material) });
}

function rejectionReceipt(request, report, reason, resolutionHash) {
  const extraReasons = report.errors
    .filter((row) => row.code !== reason.code)
    .map((row) => ({ code: row.code, message: row.message }));
  return createTopologyEditAuthorityReceipt({
    commandId: request.commandId,
    commandType: request.commandType,
    basis: request.basis,
    requestHash: request.requestHash,
    resolutionHash,
    result: {
      candidateDraftHash: report.candidateDraftHash,
      canonicalTopologyHash: report.canonicalTopologyHash,
      editLedgerHash: null,
      validationHash: report.validationHash,
      checkerHash: null,
    },
    disposition: 'REJECTED',
    reasons: [reason, ...extraReasons],
  });
}

function rejectedResult(request, reason, resolutionHash = null, validationReport = null) {
  const report = validationReport ?? rejectedValidationReport(request, reason);
  const receipt = rejectionReceipt(request, report, reason, resolutionHash);
  return certificationEnvelope(request, 'REJECTED', receipt, report, null);
}

function acceptedReceipt(request, resolvedCommand, candidate, validationReport) {
  const editLedgerHash = proposedEditLedgerHash({
    basis: request.basis,
    commandId: request.commandId,
    commandType: request.commandType,
    requestHash: request.requestHash,
    resolutionHash: resolvedCommand.resolutionHash,
    candidateDraftHash: candidate.candidateDraftHash,
    validationHash: validationReport.validationHash,
  });
  return createTopologyEditAuthorityReceipt({
    commandId: request.commandId,
    commandType: request.commandType,
    basis: request.basis,
    requestHash: request.requestHash,
    resolutionHash: resolvedCommand.resolutionHash,
    result: {
      candidateDraftHash: candidate.candidateDraftHash,
      canonicalTopologyHash: candidate.canonicalTopologyHash,
      editLedgerHash,
      validationHash: validationReport.validationHash,
      checkerHash: candidate.afterChecker.checkerHash,
    },
    disposition: 'ACCEPTED',
    reasons: [],
  });
}

function acceptedResult(request, resolvedCommand, candidate, validationReport) {
  const receipt = acceptedReceipt(request, resolvedCommand, candidate, validationReport);
  return certificationEnvelope(request, 'ACCEPTED', receipt, validationReport, candidate);
}

function attemptPhase(request, phase, resolutionHash, operation) {
  try {
    return { accepted: true, value: operation() };
  } catch (error) {
    const reason = rejectionReason(error, phase);
    return { accepted: false, result: rejectedResult(request, reason, resolutionHash) };
  }
}

export function certifyTopologyEditCommand({
  request: requestInput,
  canonicalTopology,
  baseCanonicalTopology,
  authority,
  checkerPolicy,
} = {}) {
  const request = assertTopologyEditCommandRequest(requestInput);
  const resolution = attemptPhase(request, 'RESOLUTION', null, () => (
    resolveTopologyEditCommand({ request, canonicalTopology, authority })
  ));
  if (!resolution.accepted) return resolution.result;

  const resolvedCommand = resolution.value;
  const regeneration = attemptPhase(request, 'REGENERATION', resolvedCommand.resolutionHash, () => (
    buildTopologyEditCandidate({ canonicalTopology, resolvedCommand, checkerPolicy })
  ));
  if (!regeneration.accepted) return regeneration.result;

  const candidate = regeneration.value;
  const validation = attemptPhase(request, 'VALIDATION', resolvedCommand.resolutionHash, () => (
    validateTopologyEditCandidate({ candidate, baseCanonicalTopology })
  ));
  if (!validation.accepted) return validation.result;
  if (!validation.value.valid) {
    const reason = { code: 'CERTIFICATION_VALIDATION_FAILED', message: 'Candidate failed structural or checker-policy validation.' };
    return rejectedResult(request, reason, resolvedCommand.resolutionHash, validation.value);
  }
  return acceptedResult(request, resolvedCommand, candidate, validation.value);
}

export function assertTopologyEditCertificationResult(value) {
  if (value?.schema !== TOPOLOGY_EDIT_CERTIFICATION_RESULT_SCHEMA) {
    throw new TypeError(`Topology edit certification result must use ${TOPOLOGY_EDIT_CERTIFICATION_RESULT_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.certificationHash;
  if (value.certificationHash !== semanticHash(material)) {
    throw new Error('TopologyEditCertificationService: certification result hash mismatch.');
  }
  if (value.disposition === 'ACCEPTED' && !value.candidate) {
    throw new Error('TopologyEditCertificationService: accepted result is missing its exact candidate.');
  }
  if (value.disposition === 'REJECTED' && value.candidate !== null) {
    throw new Error('TopologyEditCertificationService: rejected result exposed a candidate.');
  }
  return value;
}
