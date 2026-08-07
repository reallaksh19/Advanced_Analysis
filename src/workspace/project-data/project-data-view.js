import { renderNonFeaProjectDataViewV2 } from './non-fea-project-data-view-v2.js';
import { renderProjectDataFullView } from './project-data-view-full.js';

/**
 * Routes Project Data to the consumer-appropriate editor.
 *
 * Load Calc receives the focused Phase 2 Non-FEA authority surface. LFEA and
 * other consumers retain the complete Project Data profile without narrowing
 * their workflow-specific fields.
 */
export function renderProjectDataView(container, onChanged) {
  if (!container) throw new TypeError('Project Data view requires a container.');
  const inLoadCalc = Boolean(container.closest?.('[data-role="load-calc-consumer"]'));
  return inLoadCalc
    ? renderNonFeaProjectDataViewV2(container, onChanged)
    : renderProjectDataFullView(container, onChanged);
}
