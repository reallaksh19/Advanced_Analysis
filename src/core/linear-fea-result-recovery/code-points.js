import { CODE_POINT_INTERPOLATION_METHOD, LOCAL_ACTION_FIELDS, compareAscii, fail } from './recovery-contract.js';

/**
 * Component code-point resultant recovery (section 9 "Component result",
 * section 9.1 code-point stations).
 *
 * Every code station B-3.2 currently publishes (`CODE_STATION_KEYS`: bend
 * tangent/mid-arc, reducer section change, valve/flange ends) carries a
 * `nodeId` that is exactly the I or J node of one of the component's own
 * compiled elements — that correspondence is why the bend subdivision is
 * forced to an even element count (so the mid-arc station "falls exactly on
 * a node", per B-3.2's own README). `EXACT_NODE_ELEMENT_END_MATCH_V1` is
 * therefore the one interpolation/extrapolation method this package
 * implements: locate the element end whose node matches the station, and
 * report that end's already-recovered action directly. A station that does
 * not land on any compiled element's node is refused rather than smoothed
 * across the gap (section 9.1: "never uses visually smoothed viewport
 * values") — off-node interpolation is not exercised by any current B-3.2
 * component and is not invented here to cover a case that cannot yet occur.
 *
 * An internal chain node (a bend/reducer station shared by one element's J
 * end and the next element's I end) has two candidates. Both are real, and
 * physically the same joint, but a joint's two attached end actions are not
 * simply equal: the frozen B-2.0 `oppositeAction` rule
 * (`ELEMENT_ACTION_ON_JOINT_IS_NEGATIVE_OF_REPORTED_END_ACTION`) means each
 * attached element's reported action is the joint *pushing on the element*,
 * so nodal equilibrium at that joint (no other attachment, section 4.3
 * component spans carry no load primitives of their own) reads
 * `candidate1.global + candidate2.global = externalNodalLoadAtNode`, not
 * `candidate1 == candidate2`. Comparing the two candidates' raw local values
 * for equality is exactly the bug this check exists to catch — it is wrong
 * by a sign, and every worked example disagrees by very nearly a factor of
 * two rather than by solver noise. The check below compares in *global*
 * components (local axes can differ in orientation between two elements at a
 * junction) and folds in any NODAL_FORCE_MOMENT applied directly at that
 * node, so the evidence is a real free-body balance rather than an equality
 * that happens to hold only when nothing is attached at the far side.
 */

function findElementNodeCandidates({ componentElementIds, modelElementsById, nodeId }) {
  const candidates = [];
  for (const elementId of componentElementIds) {
    const modelElement = modelElementsById.get(elementId);
    if (modelElement === undefined) continue;
    if (modelElement.nodeI === nodeId) candidates.push({ elementId, end: 'I' });
    if (modelElement.nodeJ === nodeId) candidates.push({ elementId, end: 'J' });
  }
  candidates.sort((left, right) => compareAscii(left.elementId, right.elementId) || compareAscii(left.end, right.end));
  return candidates;
}

/**
 * Worst normalized nodal-equilibrium residual between two elements' actions
 * at the shared joint: `primary + other - externalLoad`, each term in global
 * components (`ELEMENT_ACTION_ON_JOINT_IS_NEGATIVE_OF_REPORTED_END_ACTION`
 * applied to both sides cancels the sign, turning the joint balance into a
 * sum rather than a difference).
 */
function worstEquilibriumResidual(primaryGlobal, otherGlobal, externalLoad) {
  let worst = 0;
  for (const field of LOCAL_ACTION_FIELDS) {
    const balance = primaryGlobal[field] + otherGlobal[field] - externalLoad[field];
    const scale = Math.max(Math.abs(primaryGlobal[field]), Math.abs(otherGlobal[field]), 1);
    worst = Math.max(worst, Math.abs(balance) / scale);
  }
  return worst;
}

/**
 * @param {object} args
 * @param {object} args.station One `CODE_STATION_KEYS` entry from a sealed piping component.
 * @param {Array<string>} args.componentElementIds `component.elements[].elementId`, in the component's own order.
 * @param {Map<string,object>} args.modelElementsById `model.elements`, keyed by `elementId` (for `nodeI`/`nodeJ`).
 * @param {Map<string,object>} args.actionByElementId Recovered `{local:{I,J}, global:{I,J}}` per elementId.
 * @param {Map<string,object>} args.nodalLoadByNode Summed global `NODAL_FORCE_MOMENT` load per nodeId (zero-filled lookups are the caller's job; missing entries are treated as zero here).
 * @param {number} args.tolerance Declared `codePointConsistencyTolerance`.
 * @returns {object} One `CODE_POINT_RESULTANT_KEYS` entry.
 */
export function recoverComponentCodePoint({
  station, componentElementIds, modelElementsById, actionByElementId, nodalLoadByNode, tolerance,
}) {
  const candidates = findElementNodeCandidates({ componentElementIds, modelElementsById, nodeId: station.nodeId });
  if (candidates.length === 0) {
    fail(
      `Code station ${station.stationId} names node ${station.nodeId}, which is not the I or J end of any element this component compiled; off-node code-point interpolation is not implemented and the station is refused rather than approximated.`,
      'RECOVERY_CODE_STATION_NOT_LOCATABLE',
    );
  }
  const primary = candidates[0];
  const primaryAction = actionByElementId.get(primary.elementId);
  const externalLoad = nodalLoadByNode.get(station.nodeId) ?? { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };

  let consistency = null;
  for (let index = 1; index < candidates.length; index += 1) {
    const other = candidates[index];
    const otherAction = actionByElementId.get(other.elementId);
    const residual = worstEquilibriumResidual(
      primaryAction.global[primary.end],
      otherAction.global[other.end],
      externalLoad,
    );
    if (consistency === null || residual > consistency.residual) {
      consistency = {
        comparedElementId: other.elementId,
        comparedEnd: other.end,
        residual,
        tolerance,
        withinTolerance: residual <= tolerance,
      };
    }
  }
  if (consistency !== null && !consistency.withinTolerance) {
    fail(
      `Code station ${station.stationId} at node ${station.nodeId} disagrees between ${primary.elementId}:${primary.end} and ${consistency.comparedElementId}:${consistency.comparedEnd} beyond the declared codePointConsistencyTolerance (residual ${consistency.residual} > ${tolerance}); the code point is not a reliable single value.`,
      'RECOVERY_CODE_POINT_INCONSISTENT',
    );
  }

  return {
    stationId: station.stationId,
    kind: station.kind,
    nodeId: station.nodeId,
    position: [...station.position],
    arcFraction: station.arcFraction,
    elementId: primary.elementId,
    end: primary.end,
    method: CODE_POINT_INTERPOLATION_METHOD,
    local: primaryAction.local[primary.end],
    global: primaryAction.global[primary.end],
    consistency,
  };
}
