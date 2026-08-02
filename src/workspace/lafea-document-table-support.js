/**
 * Private support contracts for the governed LAFEA document-table editor.
 *
 * Helpers resolve retained descriptor paths and value states only. They do not
 * discover arbitrary fields, infer identity from array position, or mutate the
 * source document.
 */

export function descriptorInstances(documentValue, descriptor) {
  if (!descriptor.target.collectionPath) {
    return [instance(null, documentValue, descriptor)];
  }
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => instance(
    row?.[descriptor.target.identityKey] ?? null,
    row,
    descriptor,
  ));
}

function instance(entityId, root, descriptor) {
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

export function groupDescriptors(descriptors) {
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

export function firstEditDiagnostic(returnedState) {
  const rows = returnedState?.diagnostics;
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export function descriptorPath(descriptor, entityId) {
  const prefix = descriptor.target.collectionPath
    ? `${descriptor.target.collectionPath}[${descriptor.target.identityKey}=${entityId}]`
    : 'document';
  const property = descriptor.target.propertyPath.join('.');
  const wrapper = descriptor.target.scalarWrapperKey
    ? `.${descriptor.target.scalarWrapperKey}`
    : '';
  return property ? `${prefix}.${property}${wrapper}` : `${prefix}${wrapper}`;
}

export function inputIdentity(descriptor, entityId) {
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

export function displayNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function friendlyName(value) {
  return String(value)
    .toLowerCase()
    .replace(/_/gu, ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

export function getAtPath(value, path) {
  return getAtSegments(value, String(path).split('.'));
}

function getAtSegments(value, segments) {
  return segments.reduce((current, segment) => current?.[segment], value);
}

export function normalizeDocumentTableHandlers(handlers) {
  if (typeof handlers?.onSetScalar !== 'function') {
    throw new TypeError('LAFEA descriptor editor requires onSetScalar.');
  }
  if (typeof handlers?.onApplyJson !== 'function') {
    throw new TypeError('LAFEA descriptor editor requires onApplyJson.');
  }
  return handlers;
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
