import {
  mountLafeaWorkbench,
  validateLafeaAccessoryPanelDescriptor,
} from '../lafea-workbench.js';
import {
  LAFEA_T7A_PARAMETER_ACCESSORY_PANEL_DESCRIPTOR,
  createLafeaT7aParameterAccessoryPanelDescriptor,
} from './parameter-entry-accessory-panel.js';
import {
  LAFEA_TEMPLATE_PARAMETER_PANEL_AUTHORITY,
} from './parameter-entry-panel.js';

export const LAFEA_T7A_PARAMETER_WORKBENCH_REGISTRATION_SCHEMA =
  'lafea-template-parameter-workbench-registration/v1';
export const LAFEA_T7A_PARAMETER_WORKBENCH_REGISTRATION_STATUS =
  'PARAMETER_DRAFT_VALIDATION_ONLY';

const OPTION_KEYS = Object.freeze([
  'parameterPanelOptions',
  'workbenchOptions',
]);

export function createLafeaT7aParameterWorkbenchRegistration(options = {}) {
  requirePlainRecord(options, 'T7A parameter workbench registration options');
  rejectUnknownKeys(
    options,
    OPTION_KEYS,
    'T7A parameter workbench registration options',
  );
  const workbenchOptions = normalizeWorkbenchOptions(options.workbenchOptions ?? {});
  const descriptor = options.parameterPanelOptions === undefined
    ? LAFEA_T7A_PARAMETER_ACCESSORY_PANEL_DESCRIPTOR
    : createLafeaT7aParameterAccessoryPanelDescriptor(options.parameterPanelOptions);
  validateLafeaAccessoryPanelDescriptor(descriptor);
  const mountOptions = Object.freeze({
    ...workbenchOptions,
    accessoryPanels: Object.freeze([descriptor]),
  });
  return Object.freeze({
    schema: LAFEA_T7A_PARAMETER_WORKBENCH_REGISTRATION_SCHEMA,
    status: LAFEA_T7A_PARAMETER_WORKBENCH_REGISTRATION_STATUS,
    authority: LAFEA_TEMPLATE_PARAMETER_PANEL_AUTHORITY,
    descriptor,
    mountOptions,
  });
}

export function mountLafeaT7aParameterWorkbench(rootElement, options = {}) {
  const registration = createLafeaT7aParameterWorkbenchRegistration(options);
  return mountLafeaWorkbench(rootElement, registration.mountOptions);
}

function normalizeWorkbenchOptions(value) {
  requirePlainRecord(value, 'LAFEA workbench options');
  if (Object.prototype.hasOwnProperty.call(value, 'accessoryPanels')) {
    throw new TypeError(
      'LAFEA workbench options must not supply accessoryPanels; T7A owns parameter-panel registration.',
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
