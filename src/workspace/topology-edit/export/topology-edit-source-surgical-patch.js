import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { validateSourcePackageSnapshot } from '../../../core/shared-piping-model/source-package-snapshot.js';

export const TOPOLOGY_EDIT_SOURCE_SURGICAL_PATCH_SCHEMA =
  'TopologyEditSourceSurgicalPatch.v1';

export function prepareTopologyEditSourceSurgicalPatch(input = {}) {
  const snapshot = input.sourceSnapshot;
  const validation = validateSourcePackageSnapshot(snapshot);
  if (!validation.ok) {
    throw new RangeError(
      `TopologyEditSourceSurgicalPatch: invalid source snapshot: ${validation.errors.join('; ')}`,
    );
  }
  const patches = normalizePatches(input.patches);
  assertDisjointPointers(patches);
  const sourcePackage = structuredClone(snapshot.sourcePackage);
  const receipts = [];
  for (const patch of patches) {
    const current = readJsonPointer(sourcePackage, patch.pointer);
    const currentHash = semanticHash(current);
    if (currentHash !== patch.expectedPreimageHash) {
      throw new RangeError(
        `TopologyEditSourceSurgicalPatch: stale preimage at ${patch.pointer}; expected ${patch.expectedPreimageHash}, current ${currentHash}.`,
      );
    }
    writeExistingJsonPointer(sourcePackage, patch.pointer, structuredClone(patch.value));
    receipts.push(deepFreeze({
      pointer: patch.pointer,
      canonicalId: patch.canonicalId,
      property: patch.property,
      preimageHash: currentHash,
      resultHash: semanticHash(patch.value),
      patchHash: patch.patchHash,
    }));
  }
  const resultingSourceSemanticHash = semanticHash(sourcePackage);
  const material = {
    schema: TOPOLOGY_EDIT_SOURCE_SURGICAL_PATCH_SCHEMA,
    sourceSnapshotSchema: snapshot.schema,
    sourceSchema: snapshot.sourceSchema,
    datasetId: snapshot.datasetId,
    originalSourceSemanticHash: snapshot.sourceSemanticHash,
    originalSourceByteHash: snapshot.sourceByteHash,
    resultingSourceSemanticHash,
    patchCount: patches.length,
    patchHashes: patches.map((patch) => patch.patchHash),
    receipts,
  };
  return deepFreeze({
    ...material,
    surgicalPatchHash: semanticHash(material),
    sourcePackage,
  });
}

export function assertTopologyEditSourceSurgicalPatch(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SOURCE_SURGICAL_PATCH_SCHEMA) {
    throw new TypeError(`Surgical source patch must use ${TOPOLOGY_EDIT_SOURCE_SURGICAL_PATCH_SCHEMA}.`);
  }
  const {
    surgicalPatchHash: suppliedPatchHash,
    sourcePackage,
    ...material
  } = value;
  if (semanticHash(material) !== suppliedPatchHash
    || semanticHash(sourcePackage) !== value.resultingSourceSemanticHash) {
    throw new Error('TopologyEditSourceSurgicalPatch: patch authority mismatch.');
  }
  return value;
}

export function createTopologyEditSourcePatch(input = {}) {
  const pointer = normalizePointer(input.pointer);
  const canonicalId = requiredText(input.canonicalId, 'canonicalId');
  const property = requiredText(input.property, 'property');
  const expectedPreimageHash = requiredText(input.expectedPreimageHash, 'expectedPreimageHash');
  if (!Object.prototype.hasOwnProperty.call(input, 'value')) {
    throw new TypeError('TopologyEditSourceSurgicalPatch: patch value is required.');
  }
  const material = {
    pointer,
    canonicalId,
    property,
    expectedPreimageHash,
    value: structuredClone(input.value),
  };
  return deepFreeze({ ...material, patchHash: semanticHash(material) });
}

export function readTopologyEditSourceJsonPointer(sourcePackage, pointerInput) {
  return structuredClone(readJsonPointer(sourcePackage, normalizePointer(pointerInput)));
}

function normalizePatches(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new TypeError('TopologyEditSourceSurgicalPatch: patches must be a non-empty array.');
  }
  const patches = value.map((patch, index) => {
    const suppliedPatchHash = patch?.patchHash ?? null;
    const normalized = createTopologyEditSourcePatch(patch);
    if (suppliedPatchHash && normalized.patchHash !== suppliedPatchHash) {
      throw new RangeError(`TopologyEditSourceSurgicalPatch: patches[${index}] hash mismatch.`);
    }
    return normalized;
  });
  return [...patches].sort((left, right) => left.pointer.localeCompare(right.pointer));
}

function assertDisjointPointers(patches) {
  const seen = new Set();
  for (const patch of patches) {
    if (seen.has(patch.pointer)) {
      throw new RangeError(`TopologyEditSourceSurgicalPatch: duplicate patch pointer ${patch.pointer}.`);
    }
    for (const previous of seen) {
      if (isAncestorPointer(previous, patch.pointer) || isAncestorPointer(patch.pointer, previous)) {
        throw new RangeError(`TopologyEditSourceSurgicalPatch: overlapping patch pointers ${previous} and ${patch.pointer}.`);
      }
    }
    seen.add(patch.pointer);
  }
}

function readJsonPointer(root, pointer) {
  const tokens = pointerTokens(pointer);
  let current = root;
  for (const token of tokens) {
    if (!isContainer(current) || !Object.prototype.hasOwnProperty.call(current, token)) {
      throw new RangeError(`TopologyEditSourceSurgicalPatch: source pointer does not exist: ${pointer}.`);
    }
    current = current[token];
  }
  return current;
}

function writeExistingJsonPointer(root, pointer, value) {
  const tokens = pointerTokens(pointer);
  if (!tokens.length) {
    throw new RangeError('TopologyEditSourceSurgicalPatch: replacing the source-package root is forbidden.');
  }
  let parent = root;
  for (const token of tokens.slice(0, -1)) {
    if (!isContainer(parent) || !Object.prototype.hasOwnProperty.call(parent, token)) {
      throw new RangeError(`TopologyEditSourceSurgicalPatch: source pointer parent does not exist: ${pointer}.`);
    }
    parent = parent[token];
  }
  const leaf = tokens.at(-1);
  if (!isContainer(parent) || !Object.prototype.hasOwnProperty.call(parent, leaf)) {
    throw new RangeError(`TopologyEditSourceSurgicalPatch: source pointer leaf does not exist: ${pointer}.`);
  }
  parent[leaf] = value;
}

function pointerTokens(pointer) {
  if (pointer === '') return [];
  return pointer.slice(1).split('/').map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}
function normalizePointer(value) {
  const pointer = String(value ?? '');
  if (!pointer.startsWith('/') || pointer === '/') {
    throw new RangeError('TopologyEditSourceSurgicalPatch: pointer must be a non-root RFC 6901 JSON Pointer.');
  }
  if (/~(?![01])/u.test(pointer)) {
    throw new RangeError(`TopologyEditSourceSurgicalPatch: invalid JSON Pointer escape in ${pointer}.`);
  }
  return pointer;
}
function isAncestorPointer(parent, child) { return child.startsWith(`${parent}/`); }
function isContainer(value) { return value !== null && typeof value === 'object'; }
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditSourceSurgicalPatch: ${label} is required.`);
  return text;
}
