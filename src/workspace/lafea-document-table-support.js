/**
 * Private support utilities for the governed LAFEA document-table editor.
 *
 * These helpers render UI controls and resolve declared descriptor presentation
 * only. They do not infer engineering identity, mutate source documents, execute
 * a stage or create authority evidence.
 */

export function renderLafeaJsonEditor(
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
  apply.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      if (!isRecord(parsed)) {
        throw new TypeError('LAFEA document must be a JSON object.');
      }
      const returned = onApplyJson(JSON.stringify(parsed, null, 2));
      const diagnostic = firstLafeaEditDiagnostic(returned);
      message.textContent = diagnostic?.message ?? '';
    } catch (error) {
      message.textContent = error instanceof Error
        ? error.message
        : 'Invalid JSON.';
    }
  });
  container.append(explanation, textarea, apply, message);
}

export function firstLafeaEditDiagnostic(returnedState) {
  const rows = returnedState?.diagnostics;
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export function createLafeaDocumentTableTabButton(
  documentRef,
  label,
  selected,
  handler,
) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(selected));
  button.addEventListener('click', handler);
  return button;
}

export function normalizeLafeaDocumentTableHandlers(handlers) {
  if (typeof handlers?.onSetScalar !== 'function') {
    throw new TypeError('LAFEA descriptor editor requires onSetScalar.');
  }
  if (typeof handlers?.onApplyJson !== 'function') {
    throw new TypeError('LAFEA descriptor editor requires onApplyJson.');
  }
  return handlers;
}

export function lafeaDescriptorInstances(documentValue, descriptor) {
  if (!descriptor.target.collectionPath) {
    return [descriptorInstance(null, documentValue, descriptor)];
  }
  const rows = lafeaGetAtPath(
    documentValue,
    descriptor.target.collectionPath,
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => descriptorInstance(
    row?.[descriptor.target.identityKey] ?? null,
    row,
    descriptor,
  ));
}

export function groupLafeaDescriptors(descriptors) {
  const map = new Map();
  [...descriptors]
    .sort((left, right) => (
      left.presentation.order - right.presentation.order
    ))
    .forEach((descriptor) => {
      const key = descriptor.presentation.groupId;
      const rows = map.get(key) ?? [];
      rows.push(descriptor);
      map.set(key, rows);
    });
  return map;
}

export function lafeaDescriptorPath(descriptor, entityId) {
  const prefix = descriptor.target.collectionPath
    ? `${descriptor.target.collectionPath}[${descriptor.target.identityKey}=${entityId}]`
    : 'document';
  const property = descriptor.target.propertyPath.join('.');
  const wrapper = descriptor.target.scalarWrapperKey
    ? `.${descriptor.target.scalarWrapperKey}`
    : '';
  return property
    ? `${prefix}.${property}${wrapper}`
    : `${prefix}${wrapper}`;
}

export function lafeaInputIdentity(descriptor, entityId) {
  return `lafea-${descriptor.descriptorId}-${entityId ?? 'document'}`
    .replace(/[^A-Za-z0-9_-]+/gu, '-');
}

export function displayLafeaNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '';
}

export function friendlyLafeaName(value) {
  return String(value)
    .toLowerCase()
    .replace(/_/gu, ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

export function lafeaGetAtPath(value, path) {
  return getAtSegments(value, String(path).split('.'));
}

function descriptorInstance(entityId, root, descriptor) {
  const base = getAtSegments(root, descriptor.target.propertyPath);
  const value = descriptor.target.scalarWrapperKey
    ? base?.[descriptor.target.scalarWrapperKey]
    : base;
  return {
    entityId: typeof entityId === 'string' ? entityId : null,
    value,
    state: storedState(value),
  };
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

function getAtSegments(value, segments) {
  return segments.reduce((current, segment) => current?.[segment], value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
