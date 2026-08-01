export {
  LAFEA_TEMPLATE_WIZARD_ACTIONS,
  LAFEA_TEMPLATE_WIZARD_ACTION_AUTHORITY,
  LAFEA_TEMPLATE_WIZARD_COMPILER_ROUTES,
  LAFEA_TEMPLATE_WIZARD_COMPILER_STATUSES,
  LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS,
  LAFEA_TEMPLATE_WIZARD_MODEL_SCHEMA,
  LAFEA_TEMPLATE_WIZARD_SELECTION_SCHEMA,
  LAFEA_TEMPLATE_WIZARD_STYLES,
} from './wizard-constants.js';
export {
  LAFEA_T6A_SELECTION_TEMPLATE_IDS,
  LAFEA_T6A_STANDALONE_CATALOG_MODEL,
  createLafeaTemplateWizardModel,
  requireT6AParameterSchema,
  validateLafeaTemplateWizardModel,
  validateLafeaTemplateWizardSelection,
} from './wizard-model.js';
export { LafeaTemplateWizardView } from './wizard-view.js';
export { LafeaTemplateWizardController } from './wizard-controller.js';

import { LafeaTemplateWizardController } from './wizard-controller.js';

export function mountLafeaTemplateWizard(rootElement, options) {
  return new LafeaTemplateWizardController(rootElement, options).init();
}
