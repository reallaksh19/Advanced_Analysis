import {
  mountLafeaWorkbench,
  validateLafeaAccessoryPanelDescriptor,
} from '../lafea-workbench.js';
import {
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  createLafeaTemplateAccessoryPanelDescriptor,
  validateLafeaTemplateAccessoryPanelDescriptor,
} from './t6b-accessory-panel.js';

export const LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_SCHEMA =
  'lafea-template-workbench-registration/v1';
export const LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_STATUS =
  'LIVE_UI_COMPOSITION_ONLY';

export const LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_AUTHORITY = Object.freeze({
  liveUiComposition: true,
  selectionOnly: true,
  parameterEntry: false,
  compilerInvocation: false,
  workbenchImport: false,
  engineExecution: false,
  lifecycleRegistration: false,
  releasePromotion: false,
});

const REGISTRATION_OPTION_KEYS = Object.freeze([
  'templatePanelOptions',
  'workbenchOptions',
]);

export function createLafeaTemplateWorkbenchRegistration(options = {}) {
  requirePlainRecord(options, 'Template workbench registration options');
  rejectUnknownKeys(
    options,
    REGISTRATION_OPTION_KEYS,
    'Template workbench registration options',
  );

  const workbenchOptions = normalizeWorkbenchOptions(options.workbenchOptions ?? {});
  const descriptor = options.templatePanelOptions === undefined
    ? LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR
    : createLafeaTemplateAccessoryPanelDescriptor(options.templatePanelOptions);

  const consumerValidation = validateLafeaTemplateAccessoryPanelDescriptor(descriptor);
  if (!consumerValidation.ok) {
    throw new TypeError(
      `Template accessory descriptor is invalid: ${consumerValidation.errors.join('; ')}`,
    );
  }
  validateLafeaAccessoryPanelDescriptor(descriptor);

  const mountOptions = Object.freeze({
    ...workbenchOptions,
    accessoryPanels: Object.freeze([descriptor]),
  });

  return Object.freeze({
    schema: LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_SCHEMA,
    status: LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_STATUS,
    authority: LAFEA_TEMPLATE_WORKBENCH_REGISTRATION_AUTHORITY,
    descriptor,
    mountOptions,
  });
}

export function mountLafeaTemplateWorkbench(rootElement, options = {}) {
  const registration = createLafeaTemplateWorkbenchRegistration(options);
  return mountLafeaWorkbench(rootElement, registration.mountOptions);
}

function normalizeWorkbenchOptions(value) {
  requirePlainRecord(value, 'LAFEA workbench options');
  if (Object.prototype.hasOwnProperty.call(value, 'accessoryPanels')) {
    throw new TypeError(
      'LAFEA workbench options must not supply accessoryPanels; T6C owns template-panel registration.',
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
