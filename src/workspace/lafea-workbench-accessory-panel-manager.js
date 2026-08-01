import {
  LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
  MOUNT_RESULT_KEYS,
  accessoryDiagnostic,
  accessoryError,
  assertExactKeys,
  createAccessoryControllerFacade,
  deepFreezeAccessoryValue,
  once,
  prepareAccessoryPanelRecords,
  renderAccessoryDiagnostics,
} from './lafea-workbench-accessory-panel-contracts.js';

export function createLafeaAccessoryPanelManager(documentRef, descriptorValues) {
  if (!documentRef?.createElement) {
    throw accessoryError('LAFEA_ACCESSORY_PANEL_DOCUMENT_REQUIRED');
  }
  return new AccessoryPanelManager(documentRef, descriptorValues).publicFacade();
}

class AccessoryPanelManager {
  constructor(documentRef, descriptorValues) {
    this.documentRef = documentRef;
    this.diagnostics = [];
    this.hostElement = createHost(documentRef);
    this.diagnosticsElement = createDiagnosticsHost(documentRef);
    this.hostElement.append(this.diagnosticsElement);
    this.records = prepareAccessoryPanelRecords(
      documentRef,
      descriptorValues,
      this.diagnostics,
    );
    this.records.forEach((record) => this.hostElement.append(record.section));
    this.mounted = false;
    this.destroyed = false;
    this.facade = null;
    this.renderDiagnostics();
  }

  mount(controller) {
    if (this.destroyed) {
      throw accessoryError('LAFEA_ACCESSORY_PANEL_MANAGER_DESTROYED');
    }
    if (this.mounted) return this.snapshot();
    this.facade = createAccessoryControllerFacade(controller);
    this.mounted = true;
    this.records.forEach((record) => this.mountRecord(record));
    this.renderDiagnostics();
    return this.snapshot();
  }

  mountRecord(record) {
    try {
      const result = record.descriptor.mount(Object.freeze({
        hostElement: record.body,
        controller: this.facade,
      }));
      assertExactKeys(
        result,
        MOUNT_RESULT_KEYS,
        'LAFEA_ACCESSORY_PANEL_MOUNT_RESULT_INVALID',
      );
      if (typeof result.destroy !== 'function') {
        throw accessoryError(
          'LAFEA_ACCESSORY_PANEL_DESTROY_INVALID',
          record.descriptor.panelId,
        );
      }
      record.destroy = once(() => result.destroy());
      setRecordStatus(record, 'MOUNTED');
    } catch (error) {
      setRecordStatus(record, 'BLOCKED');
      record.body.replaceChildren();
      this.diagnostics.push(accessoryDiagnostic(
        record.descriptor.panelId,
        'MOUNT',
        error?.code ?? 'LAFEA_ACCESSORY_PANEL_MOUNT_FAILED',
        error,
      ));
    }
  }

  destroy() {
    if (this.destroyed) return this.snapshot();
    this.destroyed = true;
    this.records.forEach((record) => this.destroyRecord(record));
    this.renderDiagnostics();
    this.facade = null;
    return this.snapshot();
  }

  destroyRecord(record) {
    if (!record.destroy) return;
    try {
      record.destroy();
      setRecordStatus(record, 'DESTROYED');
    } catch (error) {
      setRecordStatus(record, 'DESTROY_FAILED');
      this.diagnostics.push(accessoryDiagnostic(
        record.descriptor.panelId,
        'DESTROY',
        error?.code ?? 'LAFEA_ACCESSORY_PANEL_DESTROY_FAILED',
        error,
      ));
    }
  }

  snapshot() {
    return deepFreezeAccessoryValue({
      schema: LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
      mounted: this.mounted,
      destroyed: this.destroyed,
      panelOrder: this.records.map((record) => record.descriptor.panelId),
      panels: this.records.map((record) => ({
        panelId: record.descriptor.panelId,
        order: record.descriptor.order,
        status: record.status,
      })),
      diagnostics: this.diagnostics.map((entry) => ({ ...entry })),
      controllerFacadeFrozen: this.facade === null
        ? null
        : Object.isFrozen(this.facade),
    });
  }

  renderDiagnostics() {
    renderAccessoryDiagnostics(
      this.documentRef,
      this.diagnosticsElement,
      this.diagnostics,
    );
  }

  publicFacade() {
    return Object.freeze({
      schema: LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
      hostElement: this.hostElement,
      mount: (controller) => this.mount(controller),
      destroy: () => this.destroy(),
      getSnapshot: () => this.snapshot(),
    });
  }
}

function createHost(documentRef) {
  const host = documentRef.createElement('aside');
  host.dataset.role = 'lafea-accessory-panels';
  host.dataset.schema = LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA;
  host.setAttribute('aria-label', 'Workbench accessory panels');
  return host;
}

function createDiagnosticsHost(documentRef) {
  const target = documentRef.createElement('div');
  target.dataset.role = 'lafea-accessory-panel-diagnostics';
  target.setAttribute('aria-live', 'polite');
  return target;
}

function setRecordStatus(record, status) {
  record.status = status;
  record.section.dataset.status = status;
}
