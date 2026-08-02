/**
 * Private typed-form renderer for governed StageInputDescriptor/v2 fields.
 *
 * The renderer consumes declared descriptors and exact entity identities only.
 * It does not discover arbitrary fields or use array position as authority.
 */
import {
  resolveLafeaDescriptorSourceRef,
  resolveLafeaDescriptorUnit,
} from './lafea-stage-input-descriptors.js';
import {
  displayLafeaNumeric,
  firstLafeaEditDiagnostic,
  friendlyLafeaName,
  groupLafeaDescriptors,
  lafeaDescriptorInstances,
  lafeaDescriptorPath,
  lafeaGetAtPath,
  lafeaInputIdentity,
} from './lafea-document-table-support.js';

export function renderLafeaDescriptorForm({
  documentRef,
  container,
  stageId,
  documentValue,
  descriptors,
  onSetScalar,
}) {
  if (!descriptors.length) {
    const blocked = documentRef.createElement('p');
    blocked.className = 'lafea-workbench-svg__empty';
    blocked.textContent = `${stageId} has no governed editable fields.`;
    container.append(blocked);
    return;
  }

  const groups = groupLafeaDescriptors(descriptors);
  for (const [groupId, rows] of groups) {
    const section = documentRef.createElement('section');
    section.className = 'lafea-doc-table-section';
    section.dataset.inputGroup = groupId;
    const title = documentRef.createElement('h4');
    title.textContent = friendlyLafeaName(groupId);
    section.append(title);

    const entityDescriptors = rows.filter(
      (descriptor) => descriptor.valueContract.domainType === 'ENTITY',
    );
    const scalarDescriptors = rows.filter(
      (descriptor) => descriptor.valueContract.domainType === 'NUMBER',
    );
    entityDescriptors.forEach((descriptor) => {
      section.append(
        renderIdentityRegister(documentRef, documentValue, descriptor),
      );
    });

    if (scalarDescriptors.length) {
      section.append(renderScalarTable({
        documentRef,
        stageId,
        documentValue,
        descriptors: scalarDescriptors,
        onSetScalar,
      }));
    }
    container.append(section);
  }
}

function renderScalarTable({
  documentRef,
  stageId,
  documentValue,
  descriptors,
  onSetScalar,
}) {
  const table = documentRef.createElement('table');
  table.className = 'lafea-doc-grid lafea-doc-grid--governed';
  const header = documentRef.createElement('tr');
  [
    'Engineering identity',
    'Input',
    'Unit',
    'Source/status',
    'Action',
  ].forEach((label) => {
    const cell = documentRef.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    header.append(cell);
  });
  table.append(header);

  descriptors.forEach((descriptor) => {
    lafeaDescriptorInstances(documentValue, descriptor)
      .forEach((instance) => {
        table.append(renderScalarRow({
          documentRef,
          stageId,
          documentValue,
          descriptor,
          instance,
          onSetScalar,
        }));
      });
  });
  return table;
}

function renderIdentityRegister(documentRef, documentValue, descriptor) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'lafea-doc-identity-register';
  const heading = documentRef.createElement('h5');
  heading.textContent = descriptor.presentation.label;
  const note = documentRef.createElement('p');
  note.textContent = 'Exact engineering identities. Creation and deletion require governed entity commands; array position is not authority.';
  const list = documentRef.createElement('ul');
  const rows = lafeaGetAtPath(
    documentValue,
    descriptor.target.collectionPath,
  );
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

function renderScalarRow({
  documentRef,
  stageId,
  documentValue,
  descriptor,
  instance,
  onSetScalar,
}) {
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
  path.textContent = lafeaDescriptorPath(descriptor, instance.entityId);
  path.style.display = 'block';
  identityCell.append(label, identity, path);

  const inputCell = documentRef.createElement('td');
  const inputId = lafeaInputIdentity(descriptor, instance.entityId);
  const input = documentRef.createElement('input');
  input.id = inputId;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.dataset.role = 'lafea-governed-input';
  input.dataset.descriptorId = descriptor.descriptorId;
  input.dataset.entityId = instance.entityId ?? '';
  input.value = displayLafeaNumeric(instance.value);
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
    const diagnostic = firstLafeaEditDiagnostic(returned);
    if (diagnostic) {
      input.setCustomValidity(diagnostic.message);
      input.reportValidity();
    }
  });
  actionCell.append(apply);

  row.append(identityCell, inputCell, unitCell, sourceCell, actionCell);
  return row;
}
