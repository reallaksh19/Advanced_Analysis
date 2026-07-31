/**
 * Dependency-free accessory-panel composition seam for the LAFEA workbench.
 *
 * Panels receive one owned DOM host and a frozen allow-listed controller facade.
 * They receive no store, view, registry, presenter, lifecycle or engine internals.
 */

export const LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA = 'lafea-workbench-accessory-panel/v1';
export const LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA = 'lafea-workbench-accessory-host/v1';
export const LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA = 'lafea-workbench-accessory-diagnostic/v1';

const DESCRIPTOR_KEYS = Object.freeze([
  'schema', 'panelId', 'label', 'order', 'mount',
]);
const MOUNT_RESULT_KEYS = Object.freeze(['destroy']);
const CONTROLLER_FACADE_KEYS = Object.freeze(['getState', 'importDocument']);
const PANEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

/** Validate one exact public panel descriptor without importing any consumer. */
export function validateLafeaAccessoryPanelDescriptor(value) {
  assertExactKeys(value, DESCRIPTOR_KEYS, 'LAFEA_ACCESSORY_PANEL_DESCRIPTOR_KEYS_INVALID');
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

/**
 * Create one host/manager for a supplied panel collection.
 *
 * The manager is intentionally internal-facing. Consumer panels use only the
 * descriptor contract above and the `mountLafeaWorkbench` option.
 */
export function createLafeaAccessoryPanelManager(documentRef, descriptorValues) {
  if (!documentRef?.createElement) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_DOCUMENT_REQUIRED');
  }

  const hostElement = documentRef.createElement('aside');
  hostElement.dataset.role = 'lafea-accessory-panels';
  hostElement.dataset.schema = LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA;
  hostElement.setAttribute('aria-label', 'Workbench accessory panels');

  const diagnosticsElement = documentRef.createElement('div');
  diagnosticsElement.dataset.role = 'lafea-accessory-panel-diagnostics';
  diagnosticsElement.setAttribute('aria-live', 'polite');
  hostElement.append(diagnosticsElement);

  const diagnostics = [];
  const records = prepareRecords(documentRef, descriptorValues, diagnostics);
  for (const record of records) hostElement.append(record.section);
  renderDiagnostics(documentRef, diagnosticsElement, diagnostics);

  let mounted = false;
  let destroyed = false;
  let facade = null;

  function mount(controller) {
    if (destroyed) throw accessoryError('LAFEA_ACCESSORY_PANEL_MANAGER_DESTROYED');
    if (mounted) return snapshot();
    facade = createControllerFacade(controller);
    mounted = true;

    for (const record of records) {
      try {
        const result = record.descriptor.mount(Object.freeze({
          hostElement: record.body,
          controller: facade,
        }));
        assertExactKeys(result, MOUNT_RESULT_KEYS, 'LAFEA_ACCESSORY_PANEL_MOUNT_RESULT_INVALID');
        if (typeof result.destroy !== 'function') {
          throw accessoryError('LAFEA_ACCESSORY_PANEL_DESTROY_INVALID', record.descriptor.panelId);
        }
        record.destroy = once(() => result.destroy());
        record.status = 'MOUNTED';
        record.section.dataset.status = 'MOUNTED';
      } catch (error) {
        record.status = 'BLOCKED';
        record.section.dataset.status = 'BLOCKED';
        record.body.replaceChildren();
        diagnostics.push(diagnostic(
          record.descriptor.panelId,
          'MOUNT',
          error?.code ?? 'LAFEA_ACCESSORY_PANEL_MOUNT_FAILED',
          error,
        ));
      }
    }
    renderDiagnostics(documentRef, diagnosticsElement, diagnostics);
    return snapshot();
  }

  function destroy() {
    if (destroyed) return snapshot();
    destroyed = true;
    for (const record of records) {
      if (!record.destroy) continue;
      try {
        record.destroy();
        record.status = 'DESTROYED';
      } catch (error) {
        record.status = 'DESTROY_FAILED';
        diagnostics.push(diagnostic(
          record.descriptor.panelId,
          'DESTROY',
          error?.code ?? 'LAFEA_ACCESSORY_PANEL_DESTROY_FAILED',
          error,
        ));
      }
    }
    renderDiagnostics(documentRef, diagnosticsElement, diagnostics);
    facade = null;
    return snapshot();
  }

  function snapshot() {
    return deepFreeze({
      schema: LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
      mounted,
      destroyed,
      panelOrder: records.map((record) => record.descriptor.panelId),
      panels: records.map((record) => ({
        panelId: record.descriptor.panelId,
        order: record.descriptor.order,
        status: record.status,
      })),
      diagnostics: diagnostics.map((entry) => ({ ...entry })),
      controllerFacadeFrozen: facade === null ? null : Object.isFrozen(facade),
    });
  }

  return Object.freeze({
    schema: LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
    hostElement,
    mount,
    destroy,
    getSnapshot: snapshot,
  });
}

function prepareRecords(documentRef, descriptorValues, diagnostics) {
  if (!Array.isArray(descriptorValues)) {
    diagnostics.push(diagnostic(
      null,
      'VALIDATION',
      'LAFEA_ACCESSORY_PANEL_COLLECTION_INVALID',
      new TypeError('accessoryPanels must be an array.'),
    ));
    return [];
  }

  const candidates = [];
  descriptorValues.forEach((value, index) => {
    try {
      candidates.push({ descriptor: validateLafeaAccessoryPanelDescriptor(value), index });
    } catch (error) {
      diagnostics.push(diagnostic(
        readablePanelId(value, index),
        'VALIDATION',
        error?.code ?? 'LAFEA_ACCESSORY_PANEL_DESCRIPTOR_INVALID',
        error,
      ));
    }
  });

  const counts = new Map();
  candidates.forEach(({ descriptor }) => {
    counts.set(descriptor.panelId, (counts.get(descriptor.panelId) ?? 0) + 1);
  });
  const unique = candidates.filter(({ descriptor }) => {
    if (counts.get(descriptor.panelId) === 1) return true;
    diagnostics.push(diagnostic(
      descriptor.panelId,
      'VALIDATION',
      'LAFEA_ACCESSORY_PANEL_DUPLICATE_ID',
      new TypeError(`Duplicate accessory panel ID: ${descriptor.panelId}`),
    ));
    return false;
  });

  unique.sort((left, right) => {
    if (left.descriptor.order !== right.descriptor.order) {
      return left.descriptor.order - right.descriptor.order;
    }
    return asciiCompare(left.descriptor.panelId, right.descriptor.panelId);
  });

  return unique.map(({ descriptor }) => {
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

    return {
      descriptor,
      section,
      body,
      destroy: null,
      status: 'PENDING',
    };
  });
}

function createControllerFacade(controller) {
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

function renderDiagnostics(documentRef, target, diagnostics) {
  target.replaceChildren();
  if (!diagnostics.length) {
    target.hidden = true;
    return;
  }
  target.hidden = false;
  const title = documentRef.createElement('h2');
  title.textContent = 'Accessory panel diagnostics';
  const list = documentRef.createElement('ul');
  diagnostics.forEach((entry) => {
    const item = documentRef.createElement('li');
    item.dataset.code = entry.code;
    item.dataset.phase = entry.phase;
    if (entry.panelId !== null) item.dataset.panelId = entry.panelId;
    item.textContent = `${entry.panelId ?? 'UNIDENTIFIED_PANEL'}: ${entry.code}`;
    list.append(item);
  });
  target.append(title, list);
}

function diagnostic(panelId, phase, code, error) {
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

function readablePanelId(value, index) {
  return typeof value?.panelId === 'string' && value.panelId
    ? value.panelId
    : `INVALID_PANEL_${String(index + 1).padStart(4, '0')}`;
}

function asciiCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function once(callback) {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    callback();
  };
}

function assertExactKeys(value, expectedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw accessoryError(code);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw accessoryError(code);
  }
}

function accessoryError(code, panelId = null) {
  const error = new TypeError(code);
  error.code = code;
  error.panelId = panelId;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
