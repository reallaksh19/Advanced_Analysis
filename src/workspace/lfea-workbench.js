/**
 * Public integration surface for the standalone LFEA calculation workbench.
 */
import { LfeaWorkbenchController } from './lfea-workbench-controller.js';
import { LFEA_WORKBENCH_STYLES, lfeaWorkbenchStyles } from './lfea-workbench-styles.js';

export { LfeaWorkbenchController };
export { LFEA_WORKBENCH_STYLES, lfeaWorkbenchStyles };
export {
  LFEA_COLLECTION_PATHS,
  LFEA_RESULT_MODES,
  LFEA_WORKBENCH_DOCUMENT_SCHEMA,
  lfeaDisplayGeometry,
  normalizeLfeaMeshPackage,
  resealLfeaMeshPackage,
} from './lfea-workbench-model.js';
export {
  createLfeaWorkbenchAdapterProfile,
  createLfeaWorkbenchReviewProfile,
  executeLfeaWorkbench,
} from './lfea-workbench-pipeline.js';
export { createLfeaWorkbenchStore } from './lfea-workbench-store.js';

/**
 * Mount and initialize an LFEA workbench in an existing shell root.
 *
 * @param {Element} rootElement Workbench host.
 * @param {{initialDocument?:unknown,resultMode?:string,pipelineOptions?:unknown}|undefined} options Explicit initial state.
 * @returns {LfeaWorkbenchController} Initialized controller.
 */
export function mountLfeaWorkbench(rootElement, options) {
  if (!rootElement) throw new TypeError('LFEA workbench root is required.');
  return new LfeaWorkbenchController(rootElement, options).init();
}
