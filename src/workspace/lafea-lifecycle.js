/**
 * Public compatibility surface for the stage-correct
 * `lafea-analysis-lifecycle/v2` implementation.
 *
 * Legacy v1 intake is explicit through `migrateLafeaLifecycleV1`; this module
 * does not synthesize evidence or silently reinterpret legacy lineage.
 */
export * from './lafea-lifecycle-profiled.js';
