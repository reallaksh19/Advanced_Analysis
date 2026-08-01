/**
 * Stage-specific LAFEA source editor.
 *
 * The primary surface renders only governed StageInputDescriptor/v2 fields.
 * Raw JSON remains an advanced whole-document replacement view. The editor does
 * not recurse arbitrary keys, mutate the frozen document or infer identity from
 * array position.
 */
import {
  lafeaStageInputDescriptors,
  resolveLafeaDescriptorSourceRef,
  resolveLafeaDescriptorUnit,
} from './lafea-stage-input-descriptors.js';

/** Render governed typed fields and the advanced whole-document JSON view. */
export function renderDocumentTableEditor(rootElement, stageId, documentValue, handlers) {
  const documentRef = rootElement.ownerDocument || document;
  const container = documentRef.createElement('div');
  container.className = 'lafea-doc-table-view';

  if (!documentValue || typeof documentValue !== 'object') {
    const empty = documentRef.createElement('p');
    empty.className = 'lafea-workbench-svg__empty';
    empty.textContent = 'No validated stage source document is loaded.';
    container.append(empty);
    return container;
  }

  const callbacks = normalizeHandlers(handlers);
  const descriptors = lafeaStageInputDescriptors(stageId);
  let mode = 'FORM';

  const notice = documentRef.createElement('p');
  notice.className = 'lafea-doc-table-notice';
  notice.textContent = descriptors.length
    ? 'Governed stage-specific inputs. Every edit uses an exact descriptor and engineering identity.'
    : 'No editable input descriptors are registered for this stage. Calculation and source editing remain blocked.';

  if (!descriptors.length) {
    const blocked = documentRef.createElement('p');
    blocked.className = 'lafea-workbench-svg__empty';
    blocked.dataset.role = 'lafea-source-edit-blocked';
    blocked.textContent = `${stageId} retained placeholder source is read-only. Raw JSON replacement is not authorized.`;
    container.append(notice, blocked);
    return container;
  }

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'lafea-doc-table-toolbar';
  const tabs = documentRef.createElement('div');
  tabs.className = 'lafea-doc-table-tabs';
  tabs.setAttribute('role', 'tablist');

  const formButton = tabButton(documentRef, 'Stage inputs', true, () => {
    mode = 'FORM';
    updateTabs();
    refresh();
  });
  const jsonButton = tabButton(documentRef, 'Advanced raw JSON', false, () => {
    mode = 'JSON';
    updateTabs();
    refresh();
  });
  tabs.append(formButton, jsonButton);
  toolbar.append(tabs);

  const content = documentRef.createElement('div');
  content.className = 'lafea-doc-table-content';
  container.append(notice, toolbar, content);

  function updateTabs() {
    formButton.setAttribute('aria-selected', String(mode === 'FORM'));
    jsonButton.setAttribute('aria-selected', String(mode === 'JSON'));
  }

  function refresh() {
    content.replaceChildren();
    if (mode === 'JSON') {
      renderJsonEditor(documentRef, content, documentValue, callbacks.onApplyJson);
      return;
    }
    renderDescriptorForm(
      documentRef,
      content,
      stageId,
      documentValue,
      descriptors,
      callbacks.onSetScalar,
    );
  }

  refresh();
  return container;
}

function renderDescriptorForm(documentRef, container, stageId, documentValue, descriptors, onSetScalar) {
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

    const entityDescriptors = rows.filter((descriptor) => descriptor.valueContract.domainType === 'ENTITY');
    const scalarDescriptors = rows.filter((descriptor) => descriptor.valueContract.domainType === 'NUMBER');
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

function renderScalarRow(documentRef, stageId, documentValue, descriptor, instance, onSetScalar) {
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
  input.setAttribute('aria-label', `${descriptor.presentation.label} ${instance.entityId ?? stageId}`);
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
    sourceRef = resolveLafeaDescriptorSourceRef(documentValue, descriptor, instance.entityId);
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
    const returned = onSetScalar(descriptor.descriptorId, instance.entityId, input.value);
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

function renderJsonEditor(documentRef, container, documentValue, onApplyJson) {
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
      if (!isRecord(parsed)) throw new TypeError('LAFEA document must be a JSON object.');
      const returned = onApplyJson(JSON.stringify(parsed, null, 2));
      const diagnostic = firstEditDiagnostic(returned);
      message.textContent = diagnostic?.message ?? '';
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Invalid JSON.';
    }
  });
  container.append(explanation, textarea, apply, message);
}

function descriptorInstances(documentValue, descriptor) {
  if (!descriptor.target.collectionPath) {
    return [instance(null, documentValue, descriptor)];
  }
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => instance(row?.[descriptor.target.identityKey] ?? null, row, descriptor));
}

function instance(entityId, root, descriptor) {
  const base = getAtSegments(root, descriptor.target.propertyPath);
  const value = descriptor.target.scalarWrapperKey
    ? base?.[descriptor.target.scalarWrapperKey]
    : base;
  return { entityId: typeof entityId === 'string' ? entityId : null, value, state: storedState(value) };
}

function groupDescriptors(descriptors) {
  const map = new Map();
  [...descriptors]
    .sort((left, right) => left.presentation.order - right.presentation.order)
    .forEach((descriptor) => {
      const key = descriptor.presentation.groupId;
      const rows = map.get(key) ?? [];
      rows.push(descriptor);
      map.set(key, rows);
    });
  return map;
}

function firstEditDiagnostic(returnedState) {
  const rows = returnedState?.diagnostics;
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function tabButton(documentRef, label, selected, handler) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(selected));
  button.addEventListener('click', handler);
  return button;
}

function descriptorPath(descriptor, entityId) {
  const prefix = descriptor.target.collectionPath
    ? `${descriptor.target.collectionPath}[${descriptor.target.identityKey}=${entityId}]`
    : 'document';
  const property = descriptor.target.propertyPath.join('.');
  const wrapper = descriptor.target.scalarWrapperKey ? `.${descriptor.target.scalarWrapperKey}` : '';
  return property ? `${prefix}.${property}${wrapper}` : `${prefix}${wrapper}`;
}

function inputIdentity(descriptor, entityId) {
  return `lafea-${descriptor.descriptorId}-${entityId ?? 'document'}`
    .replace(/[^A-Za-z0-9_-]+/gu, '-');
}

function storedState(value) {
  if (value === undefined) return 'MISSING';
  if (value === null) return 'PRESENT_NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'INVALID_NUMBER';
    return value === 0 ? 'EXPLICIT_ZERO' : 'FINITE_NUMBER';
  }
  return 'INVALID_NUMBER';
}

function displayNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function friendlyName(value) {
  return String(value)
    .toLowerCase()
    .replace(/_/gu, ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

function getAtPath(value, path) {
  return getAtSegments(value, String(path).split('.'));
}

function getAtSegments(value, segments) {
  return segments.reduce((current, segment) => current?.[segment], value);
}

function normalizeHandlers(handlers) {
  if (typeof handlers?.onSetScalar !== 'function') throw new TypeError('LAFEA descriptor editor requires onSetScalar.');
  if (typeof handlers?.onApplyJson !== 'function') throw new TypeError('LAFEA descriptor editor requires onApplyJson.');
  return handlers;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
