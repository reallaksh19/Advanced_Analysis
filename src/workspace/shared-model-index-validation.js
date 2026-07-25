import { deepFreeze, stringValue } from '../core/shared-piping-model/immutable.js';

const INDEX_FIELDS = Object.freeze([
  'bySourceNodeKey',
  'bySourceEntityId',
  'byLineId',
  'byBranchId',
  'byType',
  'bySourcePath',
]);

export function validateStagedModelIndexContract(model, schema) {
  const errors = [];
  if (!model || model.schema !== schema) errors.push('Invalid staged model index schema.');
  validateNodes(model, errors);
  validateRoots(model, errors);
  validateIndexes(model, errors);
  validateAudit(model, errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validateNodes(model, errors) {
  if (!Array.isArray(model?.nodes)) return errors.push('Staged model nodes must be an array.');
  const keys = model.nodes.map((node) => stringValue(node?.sourceNodeKey));
  if (keys.some((key) => !key)) errors.push('Staged model sourceNodeKey is required.');
  if (new Set(keys).size !== keys.length) errors.push('Staged model sourceNodeKey values must be unique.');
  model.nodes.forEach((node, index) => validateNode(node, index, errors));
}

function validateNode(node, index, errors) {
  const prefix = `Staged model node ${index}`;
  if (!stringValue(node?.jsonPointer)) errors.push(`${prefix} jsonPointer is required.`);
  if (!Array.isArray(node?.childSourceNodeKeys)) errors.push(`${prefix} childSourceNodeKeys must be an array.`);
  if (!Number.isInteger(node?.childIndex) || node.childIndex < 0) errors.push(`${prefix} childIndex is invalid.`);
  if (!Number.isInteger(node?.depth) || node.depth < 0) errors.push(`${prefix} depth is invalid.`);
  if (!stringValue(node?.type)) errors.push(`${prefix} type is required.`);
  if (!Array.isArray(node?.diagnostics)) errors.push(`${prefix} diagnostics must be an array.`);
}

function validateRoots(model, errors) {
  if (!Array.isArray(model?.rootSourceNodeKeys)) {
    errors.push('Staged model roots must be an array.');
    return;
  }
  const keys = new Set((model?.nodes || []).map((node) => node.sourceNodeKey));
  model.rootSourceNodeKeys.forEach((key) => {
    if (!keys.has(key)) errors.push(`Staged model root does not exist: ${key}.`);
  });
}

function validateIndexes(model, errors) {
  if (!model?.indexes || typeof model.indexes !== 'object') {
    errors.push('Staged model indexes are required.');
    return;
  }
  INDEX_FIELDS.forEach((field) => {
    if (!model.indexes[field] || typeof model.indexes[field] !== 'object') {
      errors.push(`Staged model index ${field} is required.`);
    }
  });
}

function validateAudit(model, errors) {
  const audit = model?.validation;
  if (!audit || typeof audit !== 'object') return errors.push('Staged model validation audit is required.');
  ['duplicateSourceIds', 'missingSourceIds', 'repeatedChildReferences', 'cycles', 'invalidChildren', 'unsupportedRecords']
    .forEach((field) => {
      if (!Array.isArray(audit[field])) errors.push(`Staged model validation.${field} must be an array.`);
    });
}
