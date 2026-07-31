import { mountLafeaTemplateWizard } from './t6a-standalone-wizard.js';

export const LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA =
  'lafea-workbench-accessory-panel/v1';
export const LAFEA_TEMPLATE_ACCESSORY_PANEL_ID =
  'LAFEA_APPLICATION_TEMPLATES';
export const LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL =
  'Application templates';
export const LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER = 100;
export const LAFEA_TEMPLATE_ACCESSORY_PANEL_INTEGRATION_STATUS =
  'AWAITING_AGENT1_SEAM_MERGE';

const DESCRIPTOR_KEYS = Object.freeze([
  'label',
  'mount',
  'order',
  'panelId',
  'schema',
]);
const FACTORY_OPTION_KEYS = Object.freeze([
  'catalogModel',
  'onSelectionChange',
  'query',
  'selectedTemplateId',
]);
const MOUNT_CONTEXT_KEYS = Object.freeze(['controller', 'hostElement']);
const CONTROLLER_FACADE_KEYS = Object.freeze(['getState', 'importDocument']);
const HANDLE_KEYS = Object.freeze(['destroy']);

export const LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR =
  createLafeaTemplateAccessoryPanelDescriptor();

export function createLafeaTemplateAccessoryPanelDescriptor(options = {}) {
  const wizardOptions = normalizeFactoryOptions(options);
  const descriptor = {
    schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
    panelId: LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
    label: LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL,
    order: LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER,
    mount(context) {
      const { hostElement } = requireMountContext(context);
      const wizard = mountLafeaTemplateWizard(hostElement, wizardOptions);
      if (!wizard || typeof wizard.destroy !== 'function') {
        throw new TypeError('Template wizard mount must return a destroyable controller.');
      }
      let destroyed = false;
      return Object.freeze({
        destroy() {
          if (destroyed) return;
          destroyed = true;
          wizard.destroy();
        },
      });
    },
  };
  return Object.freeze(descriptor);
}

export function validateLafeaTemplateAccessoryPanelDescriptor(value) {
  const errors = [];
  try {
    requireExactRecord(value, DESCRIPTOR_KEYS, 'Accessory panel descriptor');
    if (value.schema !== LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA) {
      throw new TypeError('Accessory panel schema is invalid.');
    }
    if (value.panelId !== LAFEA_TEMPLATE_ACCESSORY_PANEL_ID) {
      throw new TypeError('Accessory panel identity is invalid.');
    }
    if (value.label !== LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL) {
      throw new TypeError('Accessory panel label is invalid.');
    }
    if (value.order !== LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER) {
      throw new TypeError('Accessory panel order is invalid.');
    }
    if (typeof value.mount !== 'function') {
      throw new TypeError('Accessory panel mount must be a function.');
    }
    if (!Object.isFrozen(value)) {
      throw new TypeError('Accessory panel descriptor must be frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function normalizeFactoryOptions(value) {
  requireRecord(value, 'Accessory panel factory options');
  rejectUnknownKeys(value, FACTORY_OPTION_KEYS, 'Accessory panel factory options');
  if (
    value.onSelectionChange !== undefined
    && value.onSelectionChange !== null
    && typeof value.onSelectionChange !== 'function'
  ) {
    throw new TypeError('onSelectionChange must be a function, null or undefined.');
  }
  if (
    value.selectedTemplateId !== undefined
    && value.selectedTemplateId !== null
    && (
      typeof value.selectedTemplateId !== 'string'
      || !value.selectedTemplateId.trim()
      || value.selectedTemplateId !== value.selectedTemplateId.trim()
    )
  ) {
    throw new TypeError(
      'selectedTemplateId must be canonical non-empty text, null or undefined.',
    );
  }
  for (const field of ['catalogModel', 'query']) {
    if (value[field] !== undefined && !Object.isFrozen(value[field])) {
      throw new TypeError(`${field} must be a frozen governed record when supplied.`);
    }
  }
  const result = {};
  for (const field of FACTORY_OPTION_KEYS) {
    if (value[field] !== undefined) result[field] = value[field];
  }
  return Object.freeze(result);
}

function requireMountContext(value) {
  requireExactRecord(value, MOUNT_CONTEXT_KEYS, 'Accessory panel mount context');
  const { controller, hostElement } = value;
  if (!hostElement || typeof hostElement !== 'object') {
    throw new TypeError('Accessory panel hostElement is required.');
  }
  if (hostElement.dataset?.role === 'lafea-benchmark-host') {
    throw new TypeError('The LAFEA benchmark host cannot be reused as an accessory panel host.');
  }
  requireExactRecord(controller, CONTROLLER_FACADE_KEYS, 'Accessory panel controller facade');
  if (!Object.isFrozen(controller)) {
    throw new TypeError('Accessory panel controller facade must be frozen.');
  }
  for (const method of CONTROLLER_FACADE_KEYS) {
    if (typeof controller[method] !== 'function') {
      throw new TypeError(`Accessory panel controller.${method} must be a function.`);
    }
  }
  return value;
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record.`);
  }
}

function requireExactRecord(value, keys, label) {
  requireRecord(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} keys are invalid.`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unknown keys: ${unknown.sort().join(', ')}.`);
  }
}

export function validateLafeaTemplateAccessoryPanelHandle(value) {
  const errors = [];
  try {
    requireExactRecord(value, HANDLE_KEYS, 'Accessory panel handle');
    if (typeof value.destroy !== 'function') {
      throw new TypeError('Accessory panel handle destroy must be a function.');
    }
    if (!Object.isFrozen(value)) {
      throw new TypeError('Accessory panel handle must be frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
