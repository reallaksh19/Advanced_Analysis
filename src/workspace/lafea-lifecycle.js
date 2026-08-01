/**
 * Public compatibility surface for the stage-correct
 * `lafea-analysis-lifecycle/v2` implementation.
 *
 * Legacy v1 intake is explicit through `migrateLafeaLifecycleV1`; this module
 * does not synthesize evidence or silently reinterpret legacy lineage.
 */
import {
  LAFEA_ARTIFACT_KINDS as PROFILED_ARTIFACT_KINDS,
} from './lafea-lifecycle-profiled.js';

export * from './lafea-lifecycle-profiled.js';

/** Complete current v2 artifact vocabulary, including PR-NB1 product evidence. */
export const LAFEA_ARTIFACT_KINDS = Object.freeze([
  ...PROFILED_ARTIFACT_KINDS.slice(0, 5),
  'FOUNDATION_DISTRIBUTION',
  ...PROFILED_ARTIFACT_KINDS.slice(5),
]);
