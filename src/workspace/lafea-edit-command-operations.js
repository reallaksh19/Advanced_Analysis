/**
 * Private scalar and whole-document edit operations.
 *
 * Entity operations are delegated to the exact-identity module. No operation
 * owns lifecycle, execution, result or release state.
 */
import {
  requireLafeaInputDescriptor,
  resolveDescriptorEntity,
} from './lafea-stage-input-descriptors.js';
import {
  applyLafeaAddEntity,
  applyLafeaDeleteEntity,
  assertUniqueStageIdentities,
} from './lafea-edit-command-entities.js';
import {
  classifyLafeaNumericInput,
} from './lafea-edit-command-numeric.js';
import {
  assertJsonSafe,
  classifyStoredValue,
  contractError,
  descriptorPath,
  isRecord,
  requireParent,
} from './lafea-edit-command-support.js';

export function applyLafeaEditOperation(
  currentDocument,
  command,
  descriptor,
) {
  if (command.operation === 'REPLACE_DOCUMENT') {
    return applyReplaceDocument(currentDocument, command);
  }
  if (command.operation === 'SET_SCALAR'
    || command.operation === 'DELETE_FIELD') {
    return applyScalar(currentDocument, command, descriptor);
  }
  if (command.operation === 'ADD_ENTITY') {
    return applyLafeaAddEntity(currentDocument, command, descriptor);
  }
  if (command.operation === 'DELETE_ENTITY') {
    return applyLafeaDeleteEntity(currentDocument, command, descriptor);
  }
  throw contractError(
    'LAFEA_EDIT_OPERATION_UNSUPPORTED',
    `Unsupported edit operation: ${command.operation}.`,
  );
}

export function requireLafeaCommandDescriptor(command) {
  const descriptor = requireLafeaInputDescriptor(
    command.stageId,
    command.descriptorId,
  );
  if (command.descriptorRevision !== descriptor.descriptorRevision) {
    throw contractError(
      'LAFEA_STALE_DESCRIPTOR_REVISION',
      `${command.descriptorId} revision is stale.`,
    );
  }
  return descriptor;
}

function applyReplaceDocument(currentDocument, command) {
  if (!isRecord(command.input.jsonValue)) {
    throw contractError(
      'LAFEA_DOCUMENT_OBJECT_REQUIRED',
      'Whole-document replacement requires a JSON object.',
    );
  }
  assertJsonSafe(command.input.jsonValue);
  assertUniqueStageIdentities(command.stageId, command.input.jsonValue);
  return {
    document: structuredClone(command.input.jsonValue),
    change: {
      operation: command.operation,
      entityId: null,
      resolvedPath: 'document',
      previousState: 'PRESENT',
      currentState: 'PRESENT',
      previousValue: currentDocument,
      currentValue: command.input.jsonValue,
    },
  };
}

function applyScalar(currentDocument, command, descriptor) {
  if (descriptor.valueContract.domainType !== 'NUMBER') {
    throw contractError(
      'LAFEA_NUMERIC_DESCRIPTOR_REQUIRED',
      `${descriptor.descriptorId} is not a numeric descriptor.`,
    );
  }
  const parsedValue = classifyLafeaNumericInput(command.input, descriptor);
  if (!descriptor.valueContract.allowedStates.includes(parsedValue.state)) {
    throw contractError(
      parsedValue.diagnostic ?? 'LAFEA_VALUE_STATE_NOT_ALLOWED',
      `${descriptor.descriptorId} does not allow ${parsedValue.state}.`,
    );
  }
  const document = structuredClone(currentDocument);
  const entity = resolveDescriptorEntity(
    document,
    descriptor,
    command.target.entityId,
  );
  const propertyParent = descriptor.target.propertyPath.length
    ? requireParent(entity, descriptor.target.propertyPath)
    : entity;
  const finalKey = descriptor.target.propertyPath.at(-1);
  let previousValue;
  let resolvedPath = descriptorPath(descriptor, command.target.entityId);

  if (descriptor.target.scalarWrapperKey) {
    const wrapper = descriptor.target.propertyPath.length
      ? propertyParent[finalKey]
      : entity;
    if (!isRecord(wrapper)) {
      throw contractError(
        'LAFEA_SCALAR_WRAPPER_REQUIRED',
        `${descriptor.descriptorId} requires a scalar wrapper.`,
      );
    }
    previousValue = wrapper[descriptor.target.scalarWrapperKey];
    if (parsedValue.state === 'MISSING') {
      delete wrapper[descriptor.target.scalarWrapperKey];
    } else {
      wrapper[descriptor.target.scalarWrapperKey] = parsedValue.value;
    }
    resolvedPath += `.${descriptor.target.scalarWrapperKey}`;
  } else {
    if (finalKey === undefined) {
      throw contractError(
        'LAFEA_SCALAR_PATH_REQUIRED',
        `${descriptor.descriptorId} has no scalar property path.`,
      );
    }
    previousValue = propertyParent[finalKey];
    if (parsedValue.state === 'MISSING') delete propertyParent[finalKey];
    else propertyParent[finalKey] = parsedValue.value;
  }

  return {
    document,
    change: {
      operation: command.operation,
      entityId: command.target.entityId,
      resolvedPath,
      previousState: classifyStoredValue(previousValue),
      currentState: parsedValue.state,
      previousValue,
      currentValue: parsedValue.value,
    },
  };
}
