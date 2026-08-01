/**
 * Immutable command gateway for governed LAFEA source edits.
 *
 * This public facade owns orchestration only. Contract validation, value
 * parsing, identity authority and document mutation remain in bounded modules.
 */
import { normalizeLafeaStageEdit } from './lafea-workbench-model.js';
import { requireLafeaInputDescriptor } from './lafea-stage-input-descriptors.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  LAFEA_EDIT_COMMAND_SCHEMA,
  LAFEA_EDIT_OPERATIONS,
  LAFEA_EDIT_RESULT_SCHEMA,
  LAFEA_EDIT_STATUSES,
  createLafeaAddEntityCommand,
  createLafeaDeleteEntityCommand,
  createLafeaDeleteFieldCommand,
  createLafeaEditResult,
  createLafeaReplaceDocumentCommand,
  createLafeaSetScalarCommand,
  validateLafeaEditCommand,
} from './lafea-edit-command-contract.js';
import { applyLafeaEditOperation } from './lafea-edit-command-operations.js';
import {
  diagnostic,
  emptyChange,
  safeDigest,
  sanitizeCommand,
} from './lafea-edit-command-support.js';
import {
  allocateLafeaEntityIdentity,
  assertUniqueStageIdentities,
  classifyLafeaNumericInput,
  lafeaDocumentDigest,
} from './lafea-edit-command-values.js';

const REPLACE_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL',
  'MESH',
  'EXECUTION',
  'RECOVERY',
  'CONVERGENCE',
  'CODE',
  'REPORT',
]);

export {
  LAFEA_EDIT_COMMAND_SCHEMA,
  LAFEA_EDIT_OPERATIONS,
  LAFEA_EDIT_RESULT_SCHEMA,
  LAFEA_EDIT_STATUSES,
  allocateLafeaEntityIdentity,
  assertUniqueStageIdentities,
  classifyLafeaNumericInput,
  createLafeaAddEntityCommand,
  createLafeaDeleteEntityCommand,
  createLafeaDeleteFieldCommand,
  createLafeaReplaceDocumentCommand,
  createLafeaSetScalarCommand,
  lafeaDocumentDigest,
};

/** Apply one exact command against the current frozen stage document. */
export function applyLafeaStageEditCommand(currentDocument, command) {
  const previousDocumentDigest = safeDigest(currentDocument);
  try {
    validateLafeaEditCommand(command);
    requireEditableStage(command.stageId);
    const conflict = staleDocumentResult(
      currentDocument,
      command,
      previousDocumentDigest,
    );
    if (conflict) return conflict;
    return applyCurrentCommand(currentDocument, command, previousDocumentDigest);
  } catch (error) {
    return rejectedResult(
      currentDocument,
      command,
      previousDocumentDigest,
      error,
    );
  }
}

function requireEditableStage(stageId) {
  const stageEntry = requireLafeaStageRegistryEntry(stageId);
  if (stageEntry.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    const error = new Error(
      `${stageEntry.stageId} source editing is blocked because no qualified stage engine is registered.`,
    );
    error.code = 'LAFEA_STAGE_EDIT_NOT_AUTHORIZED';
    throw error;
  }
}

function staleDocumentResult(currentDocument, command, previousDocumentDigest) {
  if (previousDocumentDigest === command.expectedDocumentDigest) return null;
  return createLafeaEditResult({
    command,
    status: 'CONFLICT',
    previousDocumentDigest,
    currentDocumentDigest: previousDocumentDigest,
    document: currentDocument,
    change: emptyChange(command.operation, command.target.entityId),
    dependencyImpact: [],
    diagnostics: [diagnostic(
      'ERROR',
      'LAFEA_STALE_DOCUMENT_DIGEST',
      'document',
      command.target.entityId,
      'The editable document changed after this command was created.',
    )],
    descriptor: null,
  });
}

function applyCurrentCommand(currentDocument, command, previousDocumentDigest) {
  assertUniqueStageIdentities(command.stageId, currentDocument);
  const descriptor = command.operation === 'REPLACE_DOCUMENT'
    ? null
    : requireCommandDescriptor(command);
  const applied = applyLafeaEditOperation(currentDocument, command, descriptor);
  const normalized = normalizeLafeaStageEdit(command.stageId, applied.document);
  assertUniqueStageIdentities(command.stageId, normalized);
  const currentDocumentDigest = lafeaDocumentDigest(normalized);
  const status = currentDocumentDigest === previousDocumentDigest
    ? 'NO_CHANGE'
    : 'APPLIED';
  return createLafeaEditResult({
    command,
    status,
    previousDocumentDigest,
    currentDocumentDigest,
    document: normalized,
    change: applied.change,
    dependencyImpact: status === 'NO_CHANGE'
      ? []
      : descriptor?.invalidation.descendants ?? REPLACE_DESCENDANTS,
    diagnostics: [],
    descriptor,
  });
}

function rejectedResult(currentDocument, command, previousDocumentDigest, error) {
  const safeCommand = sanitizeCommand(command);
  return createLafeaEditResult({
    command: safeCommand,
    status: 'REJECTED',
    previousDocumentDigest,
    currentDocumentDigest: previousDocumentDigest,
    document: currentDocument,
    change: emptyChange(
      command?.operation ?? null,
      command?.target?.entityId ?? null,
    ),
    dependencyImpact: [],
    diagnostics: [diagnostic(
      'ERROR',
      typeof error?.code === 'string'
        ? error.code
        : 'LAFEA_EDIT_COMMAND_REJECTED',
      typeof error?.path === 'string' ? error.path : 'document',
      typeof error?.entityId === 'string'
        ? error.entityId
        : command?.target?.entityId ?? null,
      error instanceof Error
        ? error.message
        : 'Unknown LAFEA edit-command failure.',
    )],
    descriptor: null,
  });
}

function requireCommandDescriptor(command) {
  const descriptor = requireLafeaInputDescriptor(
    command.stageId,
    command.descriptorId,
  );
  if (command.descriptorRevision !== descriptor.descriptorRevision) {
    const error = new Error(`${command.descriptorId} revision is stale.`);
    error.code = 'LAFEA_STALE_DESCRIPTOR_REVISION';
    throw error;
  }
  return descriptor;
}
