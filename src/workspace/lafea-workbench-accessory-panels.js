/**
 * Dependency-free accessory-panel composition seam for the LAFEA workbench.
 *
 * Panels receive one owned DOM host and a frozen allow-listed controller facade.
 * They receive no store, view, registry, presenter, lifecycle or engine internals.
 */

export {
  LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA,
  LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  lafeaAccessoryPanelConfigurationRequiresHost,
  validateLafeaAccessoryPanelDescriptor,
} from './lafea-workbench-accessory-panel-contracts.js';

export {
  createLafeaAccessoryPanelManager,
} from './lafea-workbench-accessory-panel-manager.js';
