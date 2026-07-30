/**
 * LFEA SVG Adoption Contracts (LfeaSvgDraft.v1, LfeaSvgCommand.v1, etc.)
 */

export const LFEA_SVG_DRAFT_SCHEMA = 'LfeaSvgDraft.v1';
export const LFEA_SVG_COMMAND_SCHEMA = 'LfeaSvgCommand.v1';
export const LFEA_SVG_PATCH_SCHEMA = 'LfeaSvgPatch.v1';
export const LFEA_SVG_VIEWPORT_STATE_SCHEMA = 'LfeaSvgViewportState.v1';
export const LFEA_SVG_SELECTION_SCHEMA = 'LfeaSvgSelection.v1';
export const LFEA_SVG_EVIDENCE_SCHEMA = 'LfeaSvgEvidence.v1';

export function asciiCompare(a, b) {
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function asciiSort(arr) {
  if (!Array.isArray(arr)) throw new TypeError('asciiSort expects an array.');
  return [...arr].sort(asciiCompare);
}

export function createLfeaSvgDraft({
  baseRevision = '',
  draftRevision = '',
  entities = [],
  pendingCommands = [],
  isDirty = false,
} = {}) {
  if (!baseRevision || typeof baseRevision !== 'string') {
    throw new TypeError('LfeaSvgDraft requires a string baseRevision.');
  }
  return Object.freeze({
    schema: LFEA_SVG_DRAFT_SCHEMA,
    baseRevision,
    draftRevision: draftRevision || baseRevision,
    entities: Object.freeze(asciiSort(entities)),
    pendingCommands: Object.freeze([...pendingCommands]),
    isDirty: Boolean(isDirty),
  });
}

export function createLfeaSvgCommand({
  operationId,
  baseRevision,
  type,
  targetIds = [],
  beforeValues = {},
  afterValues = {},
  evidence = {},
} = {}) {
  if (!operationId || typeof operationId !== 'string') {
    throw new TypeError('LfeaSvgCommand requires operationId.');
  }
  if (!baseRevision || typeof baseRevision !== 'string') {
    throw new TypeError('LfeaSvgCommand requires baseRevision.');
  }
  if (!type || typeof type !== 'string') {
    throw new TypeError('LfeaSvgCommand requires type.');
  }
  return Object.freeze({
    schema: LFEA_SVG_COMMAND_SCHEMA,
    operationId,
    baseRevision,
    type,
    targetIds: Object.freeze(asciiSort(targetIds)),
    beforeValues: Object.freeze({ ...beforeValues }),
    afterValues: Object.freeze({ ...afterValues }),
    evidence: Object.freeze({ ...evidence }),
  });
}

export function createLfeaSvgPatch({
  baseSourceHash,
  patchId,
  commands = [],
  timestamp = 0,
} = {}) {
  if (!baseSourceHash || typeof baseSourceHash !== 'string') {
    throw new TypeError('LfeaSvgPatch requires baseSourceHash.');
  }
  if (!patchId || typeof patchId !== 'string') {
    throw new TypeError('LfeaSvgPatch requires patchId.');
  }
  return Object.freeze({
    schema: LFEA_SVG_PATCH_SCHEMA,
    baseSourceHash,
    patchId,
    commands: Object.freeze([...commands]),
    timestamp: typeof timestamp === 'number' ? timestamp : 0,
  });
}

export function createLfeaSvgViewportState({
  projection = 'ISO',
  fitMatrix = [1, 0, 0, 1, 0, 0],
  pan = { x: 0, y: 0 },
  zoom = 1.0,
  visibility = {},
} = {}) {
  const validProjections = ['ISO', 'XY', 'XZ', 'YZ'];
  if (!validProjections.includes(projection)) {
    throw new TypeError(`Invalid projection "${projection}". Must be one of ${validProjections.join(', ')}.`);
  }
  return Object.freeze({
    schema: LFEA_SVG_VIEWPORT_STATE_SCHEMA,
    projection,
    fitMatrix: Object.freeze([...fitMatrix]),
    pan: Object.freeze({ x: Number(pan.x) || 0, y: Number(pan.y) || 0 }),
    zoom: Number(zoom) > 0 ? Number(zoom) : 1.0,
    visibility: Object.freeze({ ...visibility }),
  });
}

export function createLfeaSvgSelection({
  selectedIds = [],
  selectionType = 'point',
} = {}) {
  return Object.freeze({
    schema: LFEA_SVG_SELECTION_SCHEMA,
    selectedIds: Object.freeze(asciiSort(selectedIds)),
    selectionType,
  });
}

export function createLfeaSvgEvidence({
  provenance = {},
  sceneRevision = '',
  draftRevision = '',
  commands = [],
  parityPass = false,
} = {}) {
  return Object.freeze({
    schema: LFEA_SVG_EVIDENCE_SCHEMA,
    provenance: Object.freeze({ ...provenance }),
    sceneRevision,
    draftRevision,
    commands: Object.freeze([...commands]),
    parityPass: Boolean(parityPass),
  });
}
