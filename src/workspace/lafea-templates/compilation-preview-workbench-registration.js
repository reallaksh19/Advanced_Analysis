import {
  mountLafeaWorkbench,
  validateLafeaAccessoryPanelDescriptor,
} from '../lafea-workbench.js';
import {
  LAFEA_T7B_COMPILATION_ACCESSORY_PANEL_DESCRIPTOR,
  createLafeaT7bCompilationAccessoryPanelDescriptor,
} from './compilation-preview-accessory-panel.js';
import {
  LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
} from './compilation-preview.js';

export const LAFEA_T7B_COMPILATION_WORKBENCH_REGISTRATION_SCHEMA =
  'lafea-template-compilation-workbench-registration/v1';
export const LAFEA_T7B_COMPILATION_WORKBENCH_REGISTRATION_STATUS =
  'COMPILATION_PREVIEW_ONLY';

const OPTION_KEYS = Object.freeze([
  'compilationPanelOptions',
  'workbenchOptions',
]);

export function createLafeaT7bCompilationWorkbenchRegistration(options = {}) {
  requirePlainRecord(options, 'T7B compilation workbench registration options');
  rejectUnknownKeys(
    options,
    OPTION_KEYS,
    'T7B compilation workbench registration options',
  );
  const workbenchOptions = normalizeWorkbenchOptions(options.workbenchOptions ?? {});
  const descriptor = options.compilationPanelOptions === undefined
    ? LAFEA_T7B_COMPILATION_ACCESSORY_PANEL_DESCRIPTOR
    : createLafeaT7bCompilationAccessoryPanelDescriptor(
      options.compilationPanelOptions,
    );
  validateLafeaAccessoryPanelDescriptor(descriptor);
  const mountOptions = Object.freeze({
    ...workbenchOptions,
    accessoryPanels: Object.freeze([descriptor]),
  });
  return Object.freeze({
    schema: LAFEA_T7B_COMPILATION_WORKBENCH_REGISTRATION_SCHEMA,
    status: LAFEA_T7B_COMPILATION_WORKBENCH_REGISTRATION_STATUS,
    authority: LAFEA_TEMPLATE_COMPILATION_PREVIEW_AUTHORITY,
    descriptor,
    mountOptions,
  });
}

export function mountLafeaT7bCompilationWorkbench(rootElement, options = {}) {
  const registration = createLafeaT7bCompilationWorkbenchRegistration(options);
  return mountLafeaWorkbench(rootElement, registration.mountOptions);
}

function normalizeWorkbenchOptions(value) {
  requirePlainRecord(value, 'LAFEA workbench options');
  if (Object.prototype.hasOwnProperty.call(value, 'accessoryPanels')) {
    throw new TypeError(
      'LAFEA workbench options must not supply accessoryPanels; T7B owns compilation-panel registration.',
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
