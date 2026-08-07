import {
  createCurrentNonFeaEnrichmentInputCheckState,
} from './enrichment/non-fea-enrichment-input-check-adapter.js';
import {
  evaluateCurrentNonFeaInputCheckStatus,
} from './non-fea-common-input-check-adapter.js';
import { renderNonFeaInputCheckView } from './non-fea-input-check-view.js';

/**
 * Backward-compatible Load Calc preflight entrypoint.
 *
 * Preparation happens before rendering: source-current enrichment evidence is
 * inspected, the existing common checker is evaluated, and one canonical
 * workspace-status projection is composed. The Input Check view then renders
 * that prepared state without performing engineering, seal, authorization or
 * execution writes and without post-render DOM state patching.
 */
export function renderEmpiricalPreflightView(container, consumerContext) {
  const enrichmentState = createCurrentNonFeaEnrichmentInputCheckState();
  const { snapshot: commonSnapshot, status } = evaluateCurrentNonFeaInputCheckStatus();
  return renderNonFeaInputCheckView(container, consumerContext, {
    enrichmentState,
    commonSnapshot,
    status,
  });
}
