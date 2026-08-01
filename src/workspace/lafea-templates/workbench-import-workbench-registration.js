import {
  mountLafeaWorkbench,
  validateLafeaAccessoryPanelDescriptor,
} from '../lafea-workbench.js';
import {
  LAFEA_T7C_IMPORT_ACCESSORY_PANEL_DESCRIPTOR,
  createLafeaT7cImportAccessoryPanelDescriptor,
} from './workbench-import-accessory-panel.js';
import {
  LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
} from './workbench-import.js';

export const LAFEA_T7C_IMPORT_WORKBENCH_REGISTRATION_SCHEMA =
  'lafea-template-import-workbench-registration/v1';
export const LAFEA_T7C_IMPORT_WORKBENCH_REGISTRATION_STATUS =
  'CURRENT_HANDOFF_IMPORT_ONLY';

const OPTION_KEYS = Object.freeze([
  'importPanelOptions',
  'workbenchOptions',
]);

export function createLafeaT7cImportWorkbenchRegistration(options = {}) {
  requirePlainRecord(options, 'T7C import workbench registration options');
  rejectUnknownKeys(options, OPTION_KEYS, 'T7C import workbench registration options');
  const workbenchOptions = normalizeWorkbenchOptions(options.workbenchOptions ?? {});
  const descriptor = options.importPanelOptions === undefined
    ? LAFEA_T7C_IMPORT_ACCESSORY_PANEL_DESCRIPTOR
    : createLafeaT7cImportAccessoryPanelDescriptor(options.importPanelOptions);
  validateLafeaAccessoryPanelDescriptor(descriptor);
  const mountOptions = Object.freeze({
    ...workbenchOptions,
    accessoryPanels: Object.freeze([descriptor]),
  });
  return Object.freeze({
    schema: LAFEA_T7C_IMPORT_WORKBENCH_REGISTRATION_SCHEMA,
    status: LAFEA_T7C_IMPORT_WORKBENCH_REGISTRATION_STATUS,
    authority: LAFEA_TEMPLATE_WORKBENCH_IMPORT_AUTHORITY,
    descriptor,
    mountOptions,
  });
}

export function mountLafeaT7cImportWorkbench(rootElement, options = {}) {
  const registration = createLafeaT7cImportWorkbenchRegistration(options);
  return mountLafeaWorkbench(rootElement, registration.mountOptions);
}

function normalizeWorkbenchOptions(value) {
  requirePlainRecord(value, 'LAFEA workbench options');
  if (Object.prototype.hasOwnProperty.call(value, 'accessoryPanels')) {
    throw new TypeError(
      'LAFEA workbench options must not supply accessoryPanels; T7C owns import-panel registration.',
    );
  }
  return Object.freeze({ ...value });
}

function requirePlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record.`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unknown keys: ${unknown.sort().join(', ')}.`);
  }
}
