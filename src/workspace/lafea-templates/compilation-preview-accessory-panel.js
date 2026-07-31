import {
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
} from './t6b-accessory-panel.js';
import {
  normalizeLafeaTemplateParameterPanelOptions,
} from './parameter-entry-panel.js';
import {
  mountLafeaT7bCompilationPreviewPanel,
} from './compilation-preview-panel.js';

export const LAFEA_T7B_COMPILATION_ACCESSORY_PANEL_STATUS =
  'COMPILATION_PREVIEW_ONLY';

const MOUNT_CONTEXT_KEYS = Object.freeze(['controller', 'hostElement']);
const CONTROLLER_FACADE_KEYS = Object.freeze(['getState', 'importDocument']);

export const LAFEA_T7B_COMPILATION_ACCESSORY_PANEL_DESCRIPTOR =
  createLafeaT7bCompilationAccessoryPanelDescriptor();

export function createLafeaT7bCompilationAccessoryPanelDescriptor(options = {}) {
  const panelOptions = normalizeLafeaTemplateParameterPanelOptions(options);
  return Object.freeze({
    schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
    panelId: LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
    label: LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL,
    order: LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER,
    mount(context) {
      const { hostElement } = requireMountContext(context);
      const panel = mountLafeaT7bCompilationPreviewPanel(hostElement, panelOptions);
      if (!panel || typeof panel.destroy !== 'function') {
        throw new TypeError('T7B compilation panel mount must return a destroyable controller.');
      }
      let destroyed = false;
      return Object.freeze({
        destroy() {
          if (destroyed) return;
          destroyed = true;
          panel.destroy();
        },
      });
    },
  });
}

function requireMountContext(value) {
  requireExactPlainRecord(value, MOUNT_CONTEXT_KEYS, 'T7B accessory panel mount context');
  const { controller, hostElement } = value;
  if (!hostElement || typeof hostElement !== 'object') {
    throw new TypeError('T7B accessory panel hostElement is required.');
  }
  if (hostElement.dataset?.role === 'lafea-benchmark-host') {
    throw new TypeError('The LAFEA benchmark host cannot be reused as a T7B accessory host.');
  }
  requireExactPlainRecord(
    controller,
    CONTROLLER_FACADE_KEYS,
    'T7B accessory panel controller facade',
  );
  if (!Object.isFrozen(controller)) {
    throw new TypeError('T7B accessory panel controller facade must be frozen.');
  }
  for (const method of CONTROLLER_FACADE_KEYS) {
    if (typeof controller[method] !== 'function') {
      throw new TypeError(`T7B accessory panel controller.${method} must be a function.`);
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
