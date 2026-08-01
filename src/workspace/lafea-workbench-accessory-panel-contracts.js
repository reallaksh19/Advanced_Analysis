/** Accessory-panel descriptors, diagnostics and bounded controller facade. */

export const LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA = 'lafea-workbench-accessory-panel/v1';
export const LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA = 'lafea-workbench-accessory-host/v1';
export const LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA = 'lafea-workbench-accessory-diagnostic/v1';

export const MOUNT_RESULT_KEYS = Object.freeze(['destroy']);

const DESCRIPTOR_KEYS = Object.freeze([
  'schema', 'panelId', 'label', 'order', 'mount',
]);
const CONTROLLER_FACADE_KEYS = Object.freeze(['getState', 'importDocument']);
const PANEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

export function lafeaAccessoryPanelConfigurationRequiresHost(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'accessoryPanels')) return false;
  const descriptors = value.accessoryPanels;
  return !Array.isArray(descriptors) || descriptors.length > 0;
}

export function validateLafeaAccessoryPanelDescriptor(value) {
  assertExactKeys(
    value,
    DESCRIPTOR_KEYS,
    'LAFEA_ACCESSORY_PANEL_DESCRIPTOR_KEYS_INVALID',
  );
  if (value.schema !== LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_SCHEMA_INVALID');
  }
  if (typeof value.panelId !== 'string' || !PANEL_ID_PATTERN.test(value.panelId)) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_ID_INVALID');
  }
  if (typeof value.label !== 'string' || !value.label.trim()) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_LABEL_INVALID', value.panelId);
  }
  if (!Number.isSafeInteger(value.order)) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_ORDER_INVALID', value.panelId);
  }
  if (typeof value.mount !== 'function') {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_MOUNT_INVALID', value.panelId);
  }
  return Object.freeze({
    schema: value.schema,
    panelId: value.panelId,
    label: value.label,
    order: value.order,
    mount: value.mount,
  });
}

export function prepareAccessoryPanelRecords(
  documentRef,
  descriptorValues,
  diagnostics,
) {
  if (!Array.isArray(descriptorValues)) {
    diagnostics.push(accessoryDiagnostic(
      null,
      'VALIDATION',
      'LAFEA_ACCESSORY_PANEL_COLLECTION_INVALID',
      new TypeError('accessoryPanels must be an array.'),
    ));
    return [];
  }
  const candidates = validatedCandidates(descriptorValues, diagnostics);
  return uniqueCandidates(candidates, diagnostics)
    .sort(compareCandidates)
    .map(({ descriptor }) => createPanelRecord(documentRef, descriptor));
}

export function createAccessoryControllerFacade(controller) {
  if (typeof controller?.getState !== 'function'
    || typeof controller?.importDocument !== 'function') {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_CONTROLLER_FACADE_INVALID');
  }
  const facade = {
    getState: controller.getState.bind(controller),
    importDocument: controller.importDocument.bind(controller),
  };
  if (JSON.stringify(Object.keys(facade)) !== JSON.stringify(CONTROLLER_FACADE_KEYS)) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_CONTROLLER_FACADE_KEYS_INVALID');
  }
  return Object.freeze(facade);
}

export function renderAccessoryDiagnostics(documentRef, target, diagnostics) {
  target.replaceChildren();
  if (!diagnostics.length) {
    target.hidden = true;
    return;
  }
  target.hidden = false;
  const title = documentRef.createElement('h2');
  title.textContent = 'Accessory panel diagnostics';
  const list = documentRef.createElement('ul');
  diagnostics.forEach((entry) => list.append(diagnosticItem(documentRef, entry)));
  target.append(title, list);
}

export function accessoryDiagnostic(panelId, phase, code, error) {
  return Object.freeze({
    schema: LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA,
    panelId,
    phase,
    code,
    message: typeof error?.message === 'string' && error.message
      ? error.message
      : code,
  });
}

export function assertExactKeys(value, expectedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw accessoryError(code);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw accessoryError(code);
  }
}

export function accessoryError(code, panelId = null) {
  const error = new TypeError(code);
  error.code = code;
  error.panelId = panelId;
  return error;
}

export function deepFreezeAccessoryValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreezeAccessoryValue);
  return Object.freeze(value);
}

export function once(callback) {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    callback();
  };
}

function validatedCandidates(values, diagnostics) {
  const candidates = [];
  values.forEach((value, index) => {
    try {
      candidates.push({
        descriptor: validateLafeaAccessoryPanelDescriptor(value),
        index,
      });
    } catch (error) {
      diagnostics.push(accessoryDiagnostic(
        readablePanelId(value, index),
        'VALIDATION',
        error?.code ?? 'LAFEA_ACCESSORY_PANEL_DESCRIPTOR_INVALID',
        error,
      ));
    }
  });
  return candidates;
}

function uniqueCandidates(candidates, diagnostics) {
  const counts = new Map();
  candidates.forEach(({ descriptor }) => {
    counts.set(descriptor.panelId, (counts.get(descriptor.panelId) ?? 0) + 1);
  });
  return candidates.filter(({ descriptor }) => {
    if (counts.get(descriptor.panelId) === 1) return true;
    diagnostics.push(accessoryDiagnostic(
      descriptor.panelId,
      'VALIDATION',
      'LAFEA_ACCESSORY_PANEL_DUPLICATE_ID',
      new TypeError(`Duplicate accessory panel ID: ${descriptor.panelId}`),
    ));
    return false;
  });
}

function compareCandidates(left, right) {
  if (left.descriptor.order !== right.descriptor.order) {
    return left.descriptor.order - right.descriptor.order;
  }
  return asciiCompare(left.descriptor.panelId, right.descriptor.panelId);
}

function createPanelRecord(documentRef, descriptor) {
  const section = documentRef.createElement('section');
  section.dataset.role = 'lafea-accessory-panel';
  section.dataset.panelId = descriptor.panelId;
  section.dataset.panelOrder = String(descriptor.order);
  section.dataset.status = 'PENDING';
  const heading = documentRef.createElement('h2');
  heading.textContent = descriptor.label;
  heading.dataset.role = 'lafea-accessory-panel-label';
  const body = documentRef.createElement('div');
  body.dataset.role = 'lafea-accessory-panel-host';
  body.dataset.panelId = descriptor.panelId;
  section.append(heading, body);
  return { descriptor, section, body, destroy: null, status: 'PENDING' };
}

function diagnosticItem(documentRef, entry) {
  const item = documentRef.createElement('li');
  item.dataset.code = entry.code;
  item.dataset.phase = entry.phase;
  if (entry.panelId !== null) item.dataset.panelId = entry.panelId;
  item.textContent = `${entry.panelId ?? 'UNIDENTIFIED_PANEL'}: ${entry.code}`;
  return item;
}

function readablePanelId(value, index) {
  try {
    return typeof value?.panelId === 'string' && value.panelId
      ? value.panelId
      : invalidPanelId(index);
  } catch {
    return invalidPanelId(index);
  }
}

function invalidPanelId(index) {
  return `INVALID_PANEL_${String(index + 1).padStart(4, '0')}`;
}

function asciiCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
