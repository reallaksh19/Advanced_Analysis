/**
 * Topology Edit Draft — Phase 5 Governed Autofix Controller
 *
 * Thin orchestration layer over topology-edit-checker.js's pure
 * checkCanonicalTopology / planSafeAutofix functions: applies one candidate
 * at a time against the real canonical topology and only keeps a fix if it
 * doesn't create a new or worse issue (see planSafeAutofix's doc comment).
 */

import { checkCanonicalTopology, planSafeAutofix } from './topology-edit-checker.js';

export class TopologyEditAutofixController {
  /** Runs the checker and returns the current issue list for a canonical topology. */
  static check(canonical, options) {
    return checkCanonicalTopology(canonical, options);
  }

  /**
   * Applies autofixes for the given issues (a subset of check()'s output),
   * one at a time, rejecting any that don't actually resolve or that worsen
   * overall topology health. Returns the resulting topology plus applied/rejected receipts.
   */
  static applyAutofix(canonical, issues, options) {
    if (!canonical || !Array.isArray(issues)) {
      throw new TypeError('TopologyEditAutofixController: Invalid canonical topology or issue list.');
    }
    return planSafeAutofix(canonical, issues, options);
  }
}
