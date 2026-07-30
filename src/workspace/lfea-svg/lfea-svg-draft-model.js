/**
 * LFEA SVG Draft Model
 * Manages mutable draft state separated from authoritative source.
 */
import { createLfeaSvgDraft } from './lfea-svg-contracts.js';

export function createLfeaSvgDraftModel(initialBaseRevision = 'rev-0') {
  let baseRevision = initialBaseRevision;
  let draftRevision = `${initialBaseRevision}-draft-0`;
  let entities = [];
  let pendingCommands = [];
  let isDirty = false;

  function getDraft() {
    return createLfeaSvgDraft({
      baseRevision,
      draftRevision,
      entities,
      pendingCommands,
      isDirty,
    });
  }

  function setBaseSource(newBaseRevision, newEntities = []) {
    baseRevision = newBaseRevision;
    draftRevision = `${newBaseRevision}-draft-0`;
    entities = [...newEntities];
    pendingCommands = [];
    isDirty = false;
    return getDraft();
  }

  function applyTransientPreview(previewEntities) {
    return createLfeaSvgDraft({
      baseRevision,
      draftRevision: `${draftRevision}-preview`,
      entities: previewEntities,
      pendingCommands,
      isDirty: true,
    });
  }

  function commitCommand(command, updatedEntities) {
    pendingCommands = [...pendingCommands, command];
    entities = [...updatedEntities];
    isDirty = true;
    draftRevision = `${baseRevision}-draft-${pendingCommands.length}`;
    return getDraft();
  }

  function resetDraft() {
    pendingCommands = [];
    isDirty = false;
    draftRevision = `${baseRevision}-draft-0`;
    return getDraft();
  }

  return Object.freeze({
    getDraft,
    setBaseSource,
    applyTransientPreview,
    commitCommand,
    resetDraft,
  });
}
