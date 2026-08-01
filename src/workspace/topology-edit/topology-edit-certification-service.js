/**
 * Prepare, regenerate, validate and certify one command without mutating a
 * journal or workspace. Accepted output is the only candidate exposed to the
 * next Wave 1 journal layer.
 */
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

function rejectedResult(request, reason, resolutionHash = null, validationReport = null) {
  const report = validationReport ?? rejectedValidationReport(request, reason);
  const receipt = createTopologyEditAuthorityReceipt({
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
    reasons: [reason, ...report.errors
      .filter((row) => row.code !== reason.code)
      .map((row) => ({ code: row.code, message: row.message }))],
  });
  const material = {
    schema: TOPOLOGY_EDIT_CERTIFICATION_RESULT_SCHEMA,
    commandId: request.commandId,
    commandType: request.commandType,
    disposition: 'REJECTED',
    receipt,
    validationReport: report,
    candidate: null,
  };
  return deepFreeze({ ...material, certificationHash: semanticHash(material) });
}

export function certifyTopologyEditCommand({
  request: requestInput,
  canonicalTopology,
  baseCanonicalTopology,
  authority,
  checkerPolicy,
} = {}) {
  const request = assertTopologyEditCommandRequest(requestInput);
  let resolvedCommand;
  try {
    resolvedCommand = resolveTopologyEditCommand({ request, canonicalTopology, authority });
  } catch (error) {
    return rejectedResult(request, rejectionReason(error, 'RESOLUTION'));
  }

  let candidate;
  try {
    candidate = buildTopologyEditCandidate({ canonicalTopology, resolvedCommand, checkerPolicy });
  } catch (error) {
    return rejectedResult(request, rejectionReason(error, 'REGENERATION'), resolvedCommand.resolutionHash);
  }

  let validationReport;
  try {
    validationReport = validateTopologyEditCandidate({ candidate, baseCanonicalTopology });
  } catch (error) {
    return rejectedResult(request, rejectionReason(error, 'VALIDATION'), resolvedCommand.resolutionHash);
  }

  if (!validationReport.valid) {
    return rejectedResult(
      request,
      { code: 'CERTIFICATION_VALIDATION_FAILED', message: 'Candidate failed structural or checker-policy validation.' },
      resolvedCommand.resolutionHash,
      validationReport,
    );
  }

  const editLedgerHash = proposedEditLedgerHash({
    basis: request.basis,
    commandId: request.commandId,
    commandType: request.commandType,
    requestHash: request.requestHash,
    resolutionHash: resolvedCommand.resolutionHash,
    candidateDraftHash: candidate.candidateDraftHash,
    validationHash: validationReport.validationHash,
  });
  const receipt = createTopologyEditAuthorityReceipt({
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
  const material = {
    schema: TOPOLOGY_EDIT_CERTIFICATION_RESULT_SCHEMA,
    commandId: request.commandId,
    commandType: request.commandType,
    disposition: 'ACCEPTED',
    receipt,
    validationReport,
    candidate,
  };
  return deepFreeze({ ...material, certificationHash: semanticHash(material) });
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
