export const M035_NONLINEAR_SUPPORT_NODE_IDS = Object.freeze([
  '20090',
  '20350',
  '21470',
  '21610',
]);

export const M035_BEND_SCORING_EXCLUDED_NODE_IDS = Object.freeze(['20090']);

export const M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS = Object.freeze([
  '20170',
  '21640',
]);

export const M035_SCOPE_POLICY = Object.freeze({
  schema: 'm035-bm4-scope-policy/v1',
  issue: 834,
  nonlinearSupportIssue: 668,
  nonlinearSupportNodeIds: M035_NONLINEAR_SUPPORT_NODE_IDS,
  bendScoringExcludedNodeIds: M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  liftOffCrossEffectWatchNodeIds: M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
  rules: Object.freeze({
    implementUnilateralSupportIteration: false,
    implementGapContact: false,
    implementFriction: false,
    fitFeatureStiffnessToLiftOffRows: false,
    preserveRawComparisonRows: true,
    discloseCrossEffects: true,
  }),
  rationale: Object.freeze([
    'M035 owns bend, branch/tee and reducer stiffness accuracy; unilateral support status remains M036/#668.',
    'Rows controlled by support lift-off are retained as evidence but are not calibration targets for M035 feature stiffness.',
    'Feature mechanics must remain model-generic; BM4 node identities appear only in this benchmark qualification policy, never in production mechanics.',
  ]),
});
