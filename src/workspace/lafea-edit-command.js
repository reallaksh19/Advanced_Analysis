/**
 * Immutable command gateway for governed LAFEA source edits.
 *
 * The facade preserves the StageEditCommand/v2 public API while delegating
 * contract, numeric and exact-identity implementation to bounded private
 * modules. It does not own lifecycle, execution, result or release authority.
 */
import { normalizeLafeaStageEdit } from './lafea-workbench-model.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  LAFEA_EDIT_COMMAND_SCHEMA,
  LAFEA_EDIT_OPERATIONS,
  LAFEA_EDIT_RESULT_SCHEMA,
  LAFEA_EDIT_STATUSES,
  LAFEA_REPLACE_DEPENDENCY_DESCENDANTS,
  createLafeaAddEntityCommand,
  createLafeaDeleteEntityCommand,
  createLafeaDeleteFieldCommand,
  createLafeaEditResult,
  createLafeaReplaceDocumentCommand,
  createLafeaSetScalarCommand,
  validateLafeaEditCommand,
} from './lafea-edit-command-contract.js';
import {
  allocateLafeaEntityIdentity,
  assertUniqueStageIdentities,
} from './lafea-edit-command-entities.js';
import {
  classifyLafeaNumericInput,
} from './lafea-edit-command-numeric.js';
import {
  applyLafeaEditOperation,
  requireLafeaCommandDescriptor,
} from './lafea-edit-command-operations.js';
import {
  contractError,
  diagnostic,
  emptyChange,
  lafeaDocumentDigest,
  safeDigest,
  sanitizeCommand,
} from './lafea-edit-command-support.js';

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
    const stageEntry = requireLafeaStageRegistryEntry(command.stageId);
    if (stageEntry.engineState === 'ENGINE_NOT_IMPLEMENTED') {
      throw contractError(
        'LAFEA_STAGE_EDIT_NOT_AUTHORIZED',
        `${stageEntry.stageId} source editing is blocked because no qualified stage engine is registered.`,
      );
    }
    if (previousDocumentDigest !== command.expectedDocumentDigest) {
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

    assertUniqueStageIdentities(command.stageId, currentDocument);
    const descriptor = command.operation === 'REPLACE_DOCUMENT'
      ? null
      : requireLafeaCommandDescriptor(command);
    const applied = applyLafeaEditOperation(
      currentDocument,
      command,
      descriptor,
    );
    const normalized = normalizeLafeaStageEdit(
      command.stageId,
      applied.document,
    );
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
        : descriptor?.invalidation.descendants
          ?? LAFEA_REPLACE_DEPENDENCY_DESCENDANTS,
      diagnostics: [],
      descriptor,
    });
  } catch (error) {
    return createLafeaEditResult({
      command: sanitizeCommand(command),
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
}
