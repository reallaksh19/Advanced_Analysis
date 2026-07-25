/**
 * Public integration surface for the standalone LAFEA calculation workbench.
 */
import { LafeaWorkbenchController } from './lafea-workbench-controller.js';
import { LAFEA_WORKBENCH_STYLES, lafeaWorkbenchStyles } from './lafea-workbench-styles.js';

export { LafeaWorkbenchController };
export { LAFEA_WORKBENCH_STYLES, lafeaWorkbenchStyles };
export {
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  executeLafeaStage,
  lafeaCollectionPaths,
  lafeaPreviewGeometry,
  normalizeLafeaStageEdit,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';
export { createLafeaWorkbenchStore } from './lafea-workbench-store.js';

/**
 * Mount and initialize a LAFEA workbench in an existing shell root.
 *
 * @param {Element} rootElement Workbench host.
 * @param {{initialStage?:string,initialDocument?:unknown}|undefined} options Explicit initial state.
 * @returns {LafeaWorkbenchController} Initialized controller.
 */
export function mountLafeaWorkbench(rootElement, options) {
  if (!rootElement) throw new TypeError('LAFEA workbench root is required.');
  return new LafeaWorkbenchController(rootElement, options).init();
}
