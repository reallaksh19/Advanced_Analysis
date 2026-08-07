/**
 * M035 BM4 scope isolation policy.
 *
 * The owner-provided M036 technical baseline establishes that nodes 20090,
 * 20350, 21470 and 21610 are frictionless-unilateral (+Y) support locations
 * whose lift-off status is a boundary-nonlinearity concern. M035 must not fit
 * bend/branch/reducer stiffness to make those support reactions agree.
 *
 * This module is reporting/attribution policy only. It changes no restraint,
 * model, element, load, solver or recovery contract.
 */

export const M035_SCOPE_POLICY_SCHEMA = 'm035-bm4-scope-policy/v1';

export const M036_UNILATERAL_SUPPORT_NODE_IDS = Object.freeze([
  '20090',
  '20350',
  '21470',
  '21610',
]);

// Node 20090 is explicitly excluded in #834 because its zero CAESAR reaction
// is confirmed lift-off rather than a bend-stiffness target.
export const M035_BEND_SCORING_EXCLUDED_NODE_IDS = Object.freeze(['20090']);

// These are observation/watch points only. They stay in the raw and scoped
// comparison populations; the code merely prevents an improvement/regression
// there from being claimed as isolated fitting-flexibility evidence.
export const M036_CROSS_EFFECT_WATCH_NODE_IDS = Object.freeze(['20170', '21640']);

const unilateral = new Set(M036_UNILATERAL_SUPPORT_NODE_IDS);
const bendExcluded = new Set(M035_BEND_SCORING_EXCLUDED_NODE_IDS);
const crossEffectWatch = new Set(M036_CROSS_EFFECT_WATCH_NODE_IDS);

export const M035_SCOPE_POLICY = Object.freeze({
  schema: M035_SCOPE_POLICY_SCHEMA,
  nonlinearSupportOwner: 'M036/#668',
  unilateralSupportNodeIds: M036_UNILATERAL_SUPPORT_NODE_IDS,
  bendScoringExcludedNodeIds: M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  crossEffectWatchNodeIds: M036_CROSS_EFFECT_WATCH_NODE_IDS,
  rules: Object.freeze([
    'M035 never changes unilateral support status, gaps or friction.',
    'Direct restraint comparisons at the four owner-declared lift-off nodes are reported but classified M036_OUT_OF_SCOPE.',
    'Node 20090 is excluded from bend-specific scoring exactly as required by #834.',
    'Potential redistributed-load cross-effects remain visible and are never used to tune B31 flexibility or reducer stiffness.',
    'Raw all-row pass rates are always reported alongside any M035-scoped pass rate.',
  ]),
});

export function classifyM035ComparisonScope({ family, nodeId = null, touchedNodeIds = [] }) {
  const touched = new Set([nodeId, ...touchedNodeIds].filter((value) => value !== null).map(String));
  const directUnilateral = nodeId !== null && unilateral.has(String(nodeId));
  const bendExcludedNode = nodeId !== null && bendExcluded.has(String(nodeId));
  const touchesUnilateral = [...touched].some((id) => unilateral.has(id));
  const watchesCrossEffect = [...touched].some((id) => crossEffectWatch.has(id));

  if (family === 'restraint' && directUnilateral) {
    return Object.freeze({
      scope: 'M036_OUT_OF_SCOPE',
      includeInM035ScopedRate: false,
      causeCodes: Object.freeze(['M036_UNILATERAL_SUPPORT_LIFT_OFF_OUT_OF_SCOPE']),
    });
  }

  if (family === 'bend' && bendExcludedNode) {
    return Object.freeze({
      scope: 'M036_OUT_OF_SCOPE',
      includeInM035ScopedRate: false,
      causeCodes: Object.freeze(['M036_UNILATERAL_SUPPORT_LIFT_OFF_OUT_OF_SCOPE']),
    });
  }

  if (touchesUnilateral || watchesCrossEffect) {
    return Object.freeze({
      scope: 'M035_IN_SCOPE_WITH_M036_CROSS_EFFECT_DISCLOSURE',
      includeInM035ScopedRate: true,
      causeCodes: Object.freeze(['M036_LIFT_OFF_LOAD_PATH_CROSS_EFFECT_POSSIBLE']),
    });
  }

  return Object.freeze({
    scope: 'M035_IN_SCOPE',
    includeInM035ScopedRate: true,
    causeCodes: Object.freeze([]),
  });
}
