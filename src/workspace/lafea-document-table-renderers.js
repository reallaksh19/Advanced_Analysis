/**
 * Private governed document-table rendering surfaces.
 *
 * These renderers consume only retained StageInputDescriptor/v2 contracts and
 * exact engineering identities. They do not discover arbitrary source fields
 * or authorize edits by array position.
 */
import {
  resolveLafeaDescriptorSourceRef,
  resolveLafeaDescriptorUnit,
} from './lafea-stage-input-descriptors.js';
import {
  descriptorInstances,
  descriptorPath,
  displayNumeric,
  firstEditDiagnostic,
  friendlyName,
  getAtPath,
  groupDescriptors,
  inputIdentity,
  isRecord,
} from './lafea-document-table-support.js';

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

  const groups = groupDescriptors(descriptors);
  for (const [groupId, rows] of groups) {
    const section = documentRef.createElement('section');
    section.className = 'lafea-doc-table-section';
    section.dataset.inputGroup = groupId;
    const title = documentRef.createElement('h4');
    title.textContent = friendlyName(groupId);
    section.append(title);

    const entityDescriptors = rows.filter(
      (descriptor) => descriptor.valueContract.domainType === 'ENTITY',
    );
    const scalarDescriptors = rows.filter(
      (descriptor) => descriptor.valueContract.domainType === 'NUMBER',
    );
    entityDescriptors.forEach((descriptor) => {
      section.append(renderIdentityRegister(documentRef, documentValue, descriptor));
    });

    if (scalarDescriptors.length) {
      const table = documentRef.createElement('table');
      table.className = 'lafea-doc-grid lafea-doc-grid--governed';
      const header = documentRef.createElement('tr');
      ['Engineering identity', 'Input', 'Unit', 'Source/status', 'Action'].forEach((label) => {
        const cell = documentRef.createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        header.append(cell);
      });
      table.append(header);

      scalarDescriptors.forEach((descriptor) => {
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
      section.append(table);
    }
    container.append(section);
  }
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
    item.textContent = typeof identity === 'string' ? identity : 'BLOCKED — MISSING IDENTITY';
    item.dataset.entityId = typeof identity === 'string' ? identity : '';
    list.append(item);
  });
  wrapper.append(heading, note, list);
  return wrapper;
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

  const identityCell = documentRef.createElement('th');
  identityCell.scope = 'row';
  const label = documentRef.createElement('strong');
  label.textContent = descriptor.presentation.label;
  const identity = documentRef.createElement('code');
  identity.textContent = instance.entityId ?? stageId;
  identity.style.display = 'block';
  const path = documentRef.createElement('code');
  path.textContent = descriptorPath(descriptor, instance.entityId);
  path.style.display = 'block';
  identityCell.append(label, identity, path);

  const inputCell = documentRef.createElement('td');
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
  inputCell.append(input, state);

  const unitCell = documentRef.createElement('td');
  const unit = resolveLafeaDescriptorUnit(documentValue, descriptor);
  unitCell.textContent = unit ?? descriptor.unitContract.dimension ?? '—';

  const sourceCell = documentRef.createElement('td');
  let sourceRef = null;
  try {
    sourceRef = resolveLafeaDescriptorSourceRef(
      documentValue,
      descriptor,
      instance.entityId,
    );
  } catch {
    sourceRef = null;
  }
  const source = documentRef.createElement('code');
  source.textContent = sourceRef ?? 'SOURCE REF NOT DECLARED';
  const sourceStatus = documentRef.createElement('small');
  sourceStatus.textContent = descriptor.authority.sourceStatus;
  sourceStatus.style.display = 'block';
  sourceCell.append(source, sourceStatus);

  const actionCell = documentRef.createElement('td');
  const apply = documentRef.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply';
  apply.dataset.role = 'lafea-apply-descriptor';
  apply.addEventListener('click', () => {
    input.setCustomValidity('');
    const returned = onSetScalar(
      descriptor.descriptorId,
      instance.entityId,
      input.value,
    );
    const diagnostic = firstEditDiagnostic(returned);
    if (diagnostic) {
      input.setCustomValidity(diagnostic.message);
      input.reportValidity();
    }
  });
  actionCell.append(apply);

  row.append(identityCell, inputCell, unitCell, sourceCell, actionCell);
  return row;
}

export function renderJsonEditor(documentRef, container, documentValue, onApplyJson) {
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
  apply.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      if (!isRecord(parsed)) {
        throw new TypeError('LAFEA document must be a JSON object.');
      }
      const returned = onApplyJson(JSON.stringify(parsed, null, 2));
      const diagnostic = firstEditDiagnostic(returned);
      message.textContent = diagnostic?.message ?? '';
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Invalid JSON.';
    }
  });
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
