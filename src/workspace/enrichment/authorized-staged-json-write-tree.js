import {
  UNSAFE_KEYS, cloneJson, compareAscii, fail, hasOwn, isRecord,
  requireSourceIdentity,
} from './authorized-staged-json-write-contract.js';

export function applyAuthorizedStagedJsonSidecar(sourceValue, sidecar, mapping) {
  requireRoot(sourceValue);
  const outputValue = cloneJson(sourceValue);
  const entryBySourceId = new Map(sidecar.entries.map((entry) => [entry.sourceRecordId, entry]));
  const seenSourceIds = new Set();
  const consumed = new Set();
  const summary = {
    visitedNodeCount: 0,
    identifiedNodeCount: 0,
    matchedEntryCount: 0,
    addedAttributeCount: 0,
    retainedExactAttributeCount: 0,
  };

  visitNodes(outputValue, mapping.childrenField, (node, path) => {
    summary.visitedNodeCount += 1;
    if (!hasOwn(node, mapping.sourceRecordIdField)) return;
    const sourceRecordId = requireSourceIdentity(
      node[mapping.sourceRecordIdField],
      `${path}.${mapping.sourceRecordIdField}`,
    );
    summary.identifiedNodeCount += 1;
    if (seenSourceIds.has(sourceRecordId)) {
      fail('Source stagedJson contains a duplicate source-record identity.',
        'STAGED_JSON_WRITE_DUPLICATE_SOURCE_RECORD', { sourceRecordId, path });
    }
    seenSourceIds.add(sourceRecordId);
    const entry = entryBySourceId.get(sourceRecordId);
    if (!entry) return;
    consumed.add(sourceRecordId);
    requireSourceBinding(node, path, entry, mapping);
    applyAttributes(node, path, entry, mapping.attributesField, summary);
    summary.matchedEntryCount += 1;
  });

  if (consumed.size !== sidecar.entries.length) {
    fail('Not every stagedJson sidecar entry matched one source record.',
      'STAGED_JSON_WRITE_SOURCE_RECORD_MISSING', {
        missingSourceRecordIds: sidecar.entries
          .map((entry) => entry.sourceRecordId)
          .filter((sourceRecordId) => !consumed.has(sourceRecordId))
          .sort(compareAscii),
      });
  }
  return { outputValue, summary };
}

function requireSourceBinding(node, path, entry, mapping) {
  if (mapping.targetIdField !== null
      && (!hasOwn(node, mapping.targetIdField)
        || node[mapping.targetIdField] !== entry.targetId)) {
    fail('Source stagedJson target identity differs from the sidecar.',
      'STAGED_JSON_WRITE_TARGET_MISMATCH', {
        path, expected: entry.targetId, actual: node[mapping.targetIdField] ?? null,
      });
  }
  if (mapping.lineKeyField !== null && entry.lineKey !== null
      && (!hasOwn(node, mapping.lineKeyField)
        || node[mapping.lineKeyField] !== entry.lineKey)) {
    fail('Source stagedJson line identity differs from the sidecar.',
      'STAGED_JSON_WRITE_LINE_MISMATCH', {
        path, expected: entry.lineKey, actual: node[mapping.lineKeyField] ?? null,
      });
  }
}

function applyAttributes(node, path, entry, attributesField, summary) {
  let attributes;
  if (!hasOwn(node, attributesField)) {
    attributes = {};
    node[attributesField] = attributes;
  } else {
    attributes = node[attributesField];
    if (!isRecord(attributes)) {
      fail('Source stagedJson attributes field is not an object.',
        'STAGED_JSON_WRITE_ATTRIBUTES_INVALID', { path, attributesField });
    }
  }
  for (const existingKey of Object.keys(attributes)) {
    if (UNSAFE_KEYS.has(existingKey)) {
      fail('Source stagedJson attributes contain an unsafe key.',
        'STAGED_JSON_WRITE_UNSAFE_KEY', { path, attribute: existingKey });
    }
  }
  for (const [attribute, value] of Object.entries(entry.attributes)) {
    if (hasOwn(attributes, attribute)) {
      if (attributes[attribute] !== value) {
        fail('Source stagedJson already contains a conflicting authoritative value.',
          'STAGED_JSON_WRITE_EXISTING_VALUE_CONFLICT', {
            path, sourceRecordId: entry.sourceRecordId, attribute,
            existingValue: attributes[attribute], sidecarValue: value,
          });
      }
      summary.retainedExactAttributeCount += 1;
    } else {
      attributes[attribute] = value;
      summary.addedAttributeCount += 1;
    }
  }
}

function visitNodes(root, childrenField, visitor) {
  const stack = Array.isArray(root)
    ? root.map((node, index) => ({ node, path: `$[${index}]` })).reverse()
    : [{ node: root, path: '$' }];
  while (stack.length > 0) {
    const { node, path } = stack.pop();
    if (!isRecord(node)) {
      fail('StagedJson tree nodes must be objects.', 'STAGED_JSON_WRITE_NODE_INVALID', { path });
    }
    visitor(node, path);
    if (!hasOwn(node, childrenField)) continue;
    const children = node[childrenField];
    if (!Array.isArray(children)) {
      fail('StagedJson children field must be an array.',
        'STAGED_JSON_WRITE_CHILDREN_INVALID', { path, childrenField });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], path: `${path}.${childrenField}[${index}]` });
    }
  }
}

function requireRoot(value) {
  if (!Array.isArray(value) && !isRecord(value)) {
    fail('Source stagedJson root must be an object or array.', 'STAGED_JSON_WRITE_ROOT_INVALID');
  }
}
