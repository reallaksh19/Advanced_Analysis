import { resolveLafeaDescriptorSourceRef } from './lafea-stage-input-descriptors.js';
import {
  descriptorPath,
  firstEditDiagnostic,
  inputIdentity,
} from './lafea-document-table-utils.js';

export function renderIdentityCell(documentRef, stageId, descriptor, entityId) {
  const cell = documentRef.createElement('th');
  cell.scope = 'row';
  const label = documentRef.createElement('strong');
  label.textContent = descriptor.presentation.label;
  const identity = documentRef.createElement('code');
  identity.textContent = entityId ?? stageId;
  identity.style.display = 'block';
  const path = documentRef.createElement('code');
  path.textContent = descriptorPath(descriptor, entityId);
  path.style.display = 'block';
  cell.append(label, identity, path);
  return cell;
}

export function renderInputCell(documentRef, stageId, descriptor, instance) {
  const cell = documentRef.createElement('td');
  const inputId = inputIdentity(descriptor, instance.entityId);
  const input = documentRef.createElement('input');
  input.id = inputId;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.dataset.role = 'lafea-governed-input';
  input.dataset.descriptorId = descriptor.descriptorId;
  input.dataset.entityId = instance.entityId ?? '';
  input.value = displayNumeric(instance.value);
  input.placeholder = instance.state === 'PRESENT_NULL' ? 'null' : '';
  input.setAttribute(
    'aria-label',
    `${descriptor.presentation.label} ${instance.entityId ?? stageId}`,
  );
  const state = documentRef.createElement('small');
  state.id = `${inputId}-state`;
  state.textContent = `State: ${instance.state}`;
  input.setAttribute('aria-describedby', state.id);
  cell.append(input, state);
  return { cell, input };
}

export function renderSourceCell(
  documentRef,
  documentValue,
  descriptor,
  entityId,
) {
  const cell = documentRef.createElement('td');
  let sourceRef = null;
  try {
    sourceRef = resolveLafeaDescriptorSourceRef(documentValue, descriptor, entityId);
  } catch {
    sourceRef = null;
  }
  const source = documentRef.createElement('code');
  source.textContent = sourceRef ?? 'SOURCE REF NOT DECLARED';
  const status = documentRef.createElement('small');
  status.textContent = descriptor.authority.sourceStatus;
  status.style.display = 'block';
  cell.append(source, status);
  return cell;
}

export function renderActionCell(
  documentRef,
  input,
  descriptor,
  entityId,
  onSetScalar,
) {
  const cell = documentRef.createElement('td');
  const apply = documentRef.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply';
  apply.dataset.role = 'lafea-apply-descriptor';
  apply.addEventListener('click', () => {
    input.setCustomValidity('');
    const returned = onSetScalar(descriptor.descriptorId, entityId, input.value);
    const diagnostic = firstEditDiagnostic(returned);
    if (diagnostic) {
      input.setCustomValidity(diagnostic.message);
      input.reportValidity();
    }
  });
  cell.append(apply);
  return cell;
}

function displayNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
