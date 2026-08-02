/** Non-UI public surface for registered-template caller-mesh LAFEA.3 execution. */
export {
  LAFEA_GENERAL_CONTINUUM_REQUEST_SCHEMA,
  LAFEA_GENERAL_CONTINUUM_RECEIPT_SCHEMA,
  LAFEA_GENERAL_CONTINUUM_TEMPLATE_IDS,
  createGeneralContinuumExecutionRequest,
  createGeneralContinuumExecutionReceipt,
  requireGeneralContinuumTemplate,
  validateGeneralContinuumExecutionRequest,
  validateGeneralContinuumExecutionReceipt,
} from '../core/lafea-application-templates/general-continuum-execution-contract.js';
export {
  LAFEA_GENERAL_CONTINUUM_CONTROLLER_SCHEMA,
  executeGeneralLafeaContinuum,
} from './lafea-general-continuum-controller.js';
