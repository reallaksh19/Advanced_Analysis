import {
  resolveLafeaDescriptorSourceRef,
  resolveLafeaDescriptorUnit,
} from './lafea-stage-input-descriptors.js';
import {
  descriptorInstances,
  descriptorPath,
  firstEditDiagnostic,
  friendlyName,
  getAtPath,
  groupDescriptors,
  inputIdentity,
  isRecord,
} from './lafea-document-table-utils.js';

export function renderDescriptorForm(
  documentRef,
  container,
  stageId,
  documentValue,
  descriptors,
  onSetScalar,
) {
  if (!descriptors.length) {
    const blocked = documentRef.createElement('p');
    blocked.className = 'lafea-workbench-svg__empty';
    blocked.textContent = `${stageId} has no governed editable fields.`;
    container.append(blocked);
    return;
  }

  for (const [groupId, rows] of groupDescriptors(descriptors)) {
    container.append(renderDescriptorGroup(
      documentRef,
      stageId,
      documentValue,
      groupId,
      rows,
      onSetScalar,
    ));
  }
}

export function renderJsonEditor(
  documentRef,
  container,
  documentValue,
  onApplyJson,
) {
  const explanation = documentRef.createElement('p');
  explanation.textContent = 'Advanced whole-document replacement. Omitted keys are deleted after exact stage validation; this view never merges into the current source.';
  const textarea = documentRef.createElement('textarea');
  textarea.dataset.role = 'lafea-document-json';
  textarea.spellcheck = false;
  textarea.value = JSON.stringify(documentValue, null, 2);

  const message = documentRef.createElement('output');
  message.setAttribute('aria-live', 'polite');
  const apply = documentRef.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Replace with validated JSON';
  apply.addEventListener('click', () => applyJsonReplacement(
    textarea,
    message,
    onApplyJson,
  ));
  container.append(explanation, textarea, apply, message);
}

export function tabButton(documentRef, label, selected, handler) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(selected));
  button.addEventListener('click', handler);
  return button;
}

function renderDescriptorGroup(
  documentRef,
  stageId,
  documentValue,
  groupId,
  descriptors,
  onSetScalar,
) {
  const section = documentRef.createElement('section');
  section.className = 'lafea-doc-table-section';
  section.dataset.inputGroup = groupId;
  const title = documentRef.createElement('h4');
  title.textContent = friendlyName(groupId);
  section.append(title);

  descriptors
    .filter((descriptor) => descriptor.valueContract.domainType === 'ENTITY')
    .forEach((descriptor) => {
      section.append(renderIdentityRegister(documentRef, documentValue, descriptor));
    });
  const scalarDescriptors = descriptors.filter(
    (descriptor) => descriptor.valueContract.domainType === 'NUMBER',
  );
  if (scalarDescriptors.length) {
    section.append(renderScalarTable(
      documentRef,
      stageId,
      documentValue,
      scalarDescriptors,
      onSetScalar,
    ));
  }
  return section;
}

function renderIdentityRegister(documentRef, documentValue, descriptor) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'lafea-doc-identity-register';
  const heading = documentRef.createElement('h5');
  heading.textContent = descriptor.presentation.label;
  const note = documentRef.createElement('p');
  note.textContent = 'Exact engineering identities. Creation and deletion require governed entity commands; array position is not authority.';
  const list = documentRef.createElement('ul');
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const item = documentRef.createElement('li');
    const identity = row?.[descriptor.target.identityKey];
    item.textContent = typeof identity === 'string'
      ? identity
      : 'BLOCKED — MISSING IDENTITY';
    item.dataset.entityId = typeof identity === 'string' ? identity : '';
    list.append(item);
  });
  wrapper.append(heading, note, list);
  return wrapper;
}

function renderScalarTable(
  documentRef,
  stageId,
  documentValue,
  descriptors,
  onSetScalar,
) {
  const table = documentRef.createElement('table');
  table.className = 'lafea-doc-grid lafea-doc-grid--governed';
  const header = documentRef.createElement('tr');
  ['Engineering identity', 'Input', 'Unit', 'Source/status', 'Action']
    .forEach((label) => {
      const cell = documentRef.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.append(cell);
    });
  table.append(header);

  descriptors.forEach((descriptor) => {
    descriptorInstances(documentValue, descriptor).forEach((instance) => {
      table.append(renderScalarRow(
        documentRef,
        stageId,
        documentValue,
        descriptor,
        instance,
        onSetScalar,
      ));
    });
  });
  return table;
}

function renderScalarRow(
  documentRef,
  stageId,
  documentValue,
  descriptor,
  instance,
  onSetScalar,
) {
  const row = documentRef.createElement('tr');
  row.dataset.descriptorId = descriptor.descriptorId;
  if (instance.entityId) row.dataset.rowId = instance.entityId;

  const identityCell = renderIdentityCell(
    documentRef,
    stageId,
    descriptor,
    instance.entityId,
  );
  const { cell: inputCell, input } = renderInputCell(
    documentRef,
    stageId,
    descriptor,
    instance,
  );
  const unitCell = documentRef.createElement('td');
  const unit = resolveLafeaDescriptorUnit(documentValue, descriptor);
  unitCell.textContent = unit ?? descriptor.unitContract.dimension ?? '—';
  const sourceCell = renderSourceCell(
    documentRef,
    documentValue,
    descriptor,
    instance.entityId,
  );
  const actionCell = renderActionCell(
    documentRef,
    input,
    descriptor,
    instance.entityId,
    onSetScalar,
  );
  row.append(identityCell, inputCell, unitCell, sourceCell, actionCell);
  return row;
}

function renderIdentityCell(documentRef, stageId, descriptor, entityId) {
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

function renderInputCell(documentRef, stageId, descriptor, instance) {
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

function renderSourceCell(documentRef, documentValue, descriptor, entityId) {
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

function renderActionCell(
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

function applyJsonReplacement(textarea, message, onApplyJson) {
  try {
    const parsed = JSON.parse(textarea.value);
    if (!isRecord(parsed)) {
      throw new TypeError('LAFEA document must be a JSON object.');
    }
    const returned = onApplyJson(JSON.stringify(parsed, null, 2));
    message.textContent = firstEditDiagnostic(returned)?.message ?? '';
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Invalid JSON.';
  }
}

function displayNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
