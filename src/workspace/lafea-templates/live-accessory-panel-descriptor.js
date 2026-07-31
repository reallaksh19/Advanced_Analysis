import {
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  createLafeaTemplateAccessoryPanelDescriptor,
} from './t6b-accessory-panel.js';
import { mountLafeaLiveTemplateWizard } from './live-wizard.js';

export const LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_STATUS =
  'LIVE_UI_COMPOSITION_ONLY';

const MOUNT_CONTEXT_KEYS = Object.freeze(['controller', 'hostElement']);
const CONTROLLER_FACADE_KEYS = Object.freeze(['getState', 'importDocument']);

export const LAFEA_LIVE_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR =
  createLafeaLiveTemplateAccessoryPanelDescriptor();

export function createLafeaLiveTemplateAccessoryPanelDescriptor(options = {}) {
  createLafeaTemplateAccessoryPanelDescriptor(options);
  const wizardOptions = Object.freeze({ ...options });
  return Object.freeze({
    schema: LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.schema,
    panelId: LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.panelId,
    label: LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.label,
    order: LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.order,
    mount(context) {
      const { hostElement } = requireMountContext(context);
      const wizard = mountLafeaLiveTemplateWizard(hostElement, wizardOptions);
      if (!wizard || typeof wizard.destroy !== 'function') {
        throw new TypeError('Live template wizard mount must return a destroyable controller.');
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
  });
}

function requireMountContext(value) {
  requireExactPlainRecord(value, MOUNT_CONTEXT_KEYS, 'Live accessory panel mount context');
  const { controller, hostElement } = value;
  if (!hostElement || typeof hostElement !== 'object') {
    throw new TypeError('Live accessory panel hostElement is required.');
  }
  if (hostElement.dataset?.role === 'lafea-benchmark-host') {
    throw new TypeError('The LAFEA benchmark host cannot be reused as a live accessory panel host.');
  }
  requireExactPlainRecord(
    controller,
    CONTROLLER_FACADE_KEYS,
    'Live accessory panel controller facade',
  );
  if (!Object.isFrozen(controller)) {
    throw new TypeError('Live accessory panel controller facade must be frozen.');
  }
  for (const method of CONTROLLER_FACADE_KEYS) {
    if (typeof controller[method] !== 'function') {
      throw new TypeError(`Live accessory panel controller.${method} must be a function.`);
    }
  }
  return value;
}

function requireExactPlainRecord(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} keys are invalid.`);
  }
}
