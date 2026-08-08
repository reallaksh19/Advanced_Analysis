import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';
import { caesarDisplacementSI } from './lfea-m043-bm4-ladder-fixtures.mjs';

// M043 L4 domain of validity.
//
// The residual retrace is only meaningful where it has resolving power. Two
// separate things disqualify a node, and both are enforced here rather than
// discovered later in the numbers:
//
//   1. Differing discretisation. LFEA expands each bend into a chord chain, so a
//      node adjacent to a bend has a neighbour the authority never declares.
//      K*u at that node would have to be assembled from a zero-filled
//      displacement, manufacturing a large residual out of nothing.
//
//   2. Stiffness amplification. The retrace forms K*u from an externally
//      serialised displacement vector, so every element multiplies that
//      vector's print precision by its own stiffness magnitude.
//
// Enforcing (2) as an ELEMENT admission gate matters: a per-node
// signal-to-noise test cannot catch it, because the residual and its noise
// bound blow up together and leave a large ratio that looks like signal.

function key(nodeId, dof) {
  return `${nodeId}|${dof}`;
}

/**
 * Which DOFs can honestly be retraced against CAESAR.
 *
 * The residual at a node needs K*u from every element touching it, so it needs a
 * known displacement at that node AND at every one of its topological
 * neighbours. Nodes adjacent to a bend fail this, because the neighbour lies
 * inside LFEA's chord chain where CAESAR declares no displacement. Those DOFs
 * are excluded and counted rather than computed from a zero-filled neighbour,
 * which would manufacture a large residual out of nothing.
 */
/**
 * Elements on which the retrace has any resolving power at all.
 *
 * The retrace forms K*u from an externally serialised u, so each element
 * amplifies that serialisation precision by its own stiffness magnitude. BM4
 * carries CAESAR connector stubs as short as 0.0002 m, and frame stiffness grows
 * as EA/L and 12EI/L^3, so those elements reach |K| ~ 1e17..1e19 N/m. At that
 * magnitude even a physically correct displacement difference is amplified past
 * any useful scale: measured relative displacement across node 20500->20510 is
 * 4.5e-7 m, which is a perfectly ordinary 0.11% strain over 0.4 mm, yet through
 * a 6.4e17 N/m stiffness it produces a 2.2e11 N "residual" on a model whose
 * entire weight is 93.5 kN.
 *
 * No improvement in authority precision can rescue those elements -- the
 * amplification factor is ~1e17 N per metre of disagreement -- so they are
 * outside the method's domain of validity and are excluded rather than reported.
 * This is an admission gate on ELEMENTS, applied before any node is judged,
 * because a per-node signal-to-noise test cannot catch it: the residual and its
 * noise bound blow up together, leaving a large ratio that looks like signal.
 */
export function admitElements({ elementIndex, displacementPrecision, noiseBudgetNewtons }) {
  const worstPrecision = Math.max(
    displacementPrecision.translationMetres,
    displacementPrecision.rotationRadians,
  );
  const admitted = [];
  const rejected = [];
  for (const element of elementIndex.elements) {
    const maxStiffness = Math.max(...element.globalStiffness.map(Math.abs));
    const amplifiedNoise = maxStiffness * worstPrecision;
    const row = {
      elementId: element.elementId,
      length: element.length,
      maxStiffness,
      amplifiedNoiseNewtons: amplifiedNoise,
    };
    if (amplifiedNoise <= noiseBudgetNewtons) admitted.push(element);
    else rejected.push(Object.freeze({ ...row, reason: 'STIFFNESS_AMPLIFIES_AUTHORITY_PRECISION_BEYOND_NOISE_BUDGET' }));
  }
  return Object.freeze({
    admitted: Object.freeze(admitted),
    rejected: Object.freeze(rejected.sort((a, b) => b.maxStiffness - a.maxStiffness)),
    worstPrecision,
    noiseBudgetNewtons,
  });
}

export function resolveRetraceableNodes({
  elementIndex, caesarDisplacement, nodePrefix, admittedElementIds = null,
}) {
  const known = new Set();
  for (const sourceNodeId of caesarDisplacement.keys()) known.add(`${nodePrefix}${sourceNodeId}`);
  const retraceable = [];
  const excluded = [];
  for (const [nodeId, elements] of elementIndex.elementsByNode) {
    if (!known.has(nodeId)) { excluded.push({ nodeId, reason: 'NODE_NOT_DECLARED_BY_AUTHORITY' }); continue; }
    const unknownNeighbour = elements
      .flatMap((element) => [element.nodeI, element.nodeJ])
      .find((neighbour) => !known.has(neighbour));
    if (unknownNeighbour) {
      excluded.push({ nodeId, reason: 'NEIGHBOUR_INTERIOR_TO_DIFFERING_DISCRETISATION', unknownNeighbour });
      continue;
    }
    // A node is only judged when every element delivering force to it is inside
    // the method's domain of validity; one ill-conditioned stub would otherwise
    // dominate the node's whole residual.
    if (admittedElementIds) {
      const inadmissible = elements.find((element) => !admittedElementIds.has(element.elementId));
      if (inadmissible) {
        excluded.push({
          nodeId,
          reason: 'INCIDENT_ELEMENT_OUTSIDE_RETRACE_DOMAIN_OF_VALIDITY',
          inadmissibleElementId: inadmissible.elementId,
          inadmissibleElementLength: inadmissible.length,
        });
        continue;
      }
    }
    retraceable.push(nodeId);
  }
  return Object.freeze({
    retraceable: Object.freeze(retraceable.sort()),
    excluded: Object.freeze(excluded.sort((a, b) => a.nodeId.localeCompare(b.nodeId))),
  });
}

/** Build the CAESAR displacement field in analysis-node keyspace. */
export function caesarDisplacementField({ cii, caseLabel, nodePrefix }) {
  const caesar = caesarDisplacementSI(cii, caseLabel);
  const field = new Map();
  for (const [sourceNodeId, row] of caesar) {
    for (const dof of DOF_ORDER) field.set(key(`${nodePrefix}${sourceNodeId}`, dof), row[dof]);
  }
  return { caesar, field };
}
