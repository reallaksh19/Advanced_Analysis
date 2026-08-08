import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';

// M043 L4 signature classification.
//
// A residual field is only useful if its SHAPE is read, not just its size. Each
// class of modelling defect leaves a different fingerprint in
// r = K*u_caesar - F_lfea, and the tests below are chosen so that the classes
// are distinguishable from one another rather than merely detectable:
//
//   global sum over free DOFs != 0     -> applied-load vector error: a load in
//                                         one model and absent in the other
//                                         cannot balance internally, so it
//                                         survives summation.
//   sum ~ 0 but nodes individually hot -> internal distribution error: total load
//                                         agrees, its load path does not.
//   residual cancels across one
//   element's two ends                 -> that element's stiffness is wrong. A
//                                         wrong k still satisfies element
//                                         equilibrium, so its error is
//                                         self-equilibrating: an antisymmetric
//                                         pair.
//   rotational DOFs dominate           -> bending/flexibility term (k factor,
//                                         SIF-adjacent, moment release).
//   translational and axis-aligned     -> a missing AXIAL term. Pressure
//                                         elongation and end-cap thrust are the
//                                         two piping candidates, and both act
//                                         along the pipe axis.
//   translational and transverse       -> shear, support engagement or weight.
//
// The axial test is the one worth stating plainly: a nodal residual force that
// lies along the pipe axis cannot come from a bending or support error, because
// neither loads the pipe axially. It is the signature a suppressed pressure
// structural effect would leave, and BM4 suppresses both -- every pressure
// primitive in the BM4 load case declares axialThrust: false and bourdon: false.

const FORCE_DOFS = Object.freeze(['UX', 'UY', 'UZ']);
const MOMENT_DOFS = Object.freeze(['RX', 'RY', 'RZ']);

function norm(values) {
  return Math.hypot(...values);
}

function rootMeanSquare(values) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((total, value) => total + value * value, 0) / values.length);
}

/**
 * Free-DOF residual vectors at a node.
 *
 * Constrained DOFs are zeroed, not read. At a restrained DOF the quantity
 * K*u - F IS the reaction -- a legitimately large number that belongs to L5's
 * reaction comparison, not to L4's equilibrium residual. Including it would make
 * every supported node look like the worst offender in the model purely because
 * it is supported, which is a measurement of the support layout rather than of
 * any error.
 */
function nodalVectors(residual, nodeId, constrainedKeys) {
  const read = (dof) => {
    const at = `${nodeId}|${dof}`;
    return constrainedKeys.has(at) ? 0 : (residual.get(at) ?? 0);
  };
  return {
    force: FORCE_DOFS.map(read),
    moment: MOMENT_DOFS.map(read),
  };
}

/**
 * Classify the residual field for one case.
 *
 * @param {Map<string, number>} residual  r keyed `nodeId|dof`.
 * @param {Map<string, number>} appliedLoad  F keyed `nodeId|dof`, for scale.
 * @param {ReadonlyArray<string>} retraceableNodes Nodes whose residual is honest.
 * @param {Set<string>} constrainedKeys `nodeId|dof` of restrained DOFs.
 * @param {Readonly<object>} elementIndex From buildElementIndex.
 */
export function classifyResidualSignature({
  residual, appliedLoad, noise, retraceableNodes, constrainedKeys, elementIndex, caseLabel,
  resolvableSignalToNoiseRatio,
}) {
  const allFreeNodes = retraceableNodes.filter((nodeId) => (
    DOF_ORDER.some((dof) => !constrainedKeys.has(`${nodeId}|${dof}`))
  ));
  const loadScale = Math.max(...[...appliedLoad.values()].map(Math.abs), 1);

  // Resolution gate. The retrace amplifies the authority's displacement print
  // precision by the stiffness magnitude, so each DOF carries its own worst-case
  // noise bound. A node is only admitted to classification if at least one of
  // its force DOFs carries a residual exceeding that bound -- otherwise the
  // number is propagated rounding, and treating it as a finding would be exactly
  // the kind of unfounded conclusion this ladder exists to prevent.
  const nodeSnr = new Map();
  for (const nodeId of allFreeNodes) {
    let best = 0;
    for (const dof of [...FORCE_DOFS, ...MOMENT_DOFS]) {
      const at = `${nodeId}|${dof}`;
      if (constrainedKeys.has(at)) continue;
      const bound = noise.get(at) ?? 0;
      const value = Math.abs(residual.get(at) ?? 0);
      const ratio = bound > 0 ? value / bound : (value > 0 ? Number.POSITIVE_INFINITY : 0);
      if (ratio > best) best = ratio;
    }
    nodeSnr.set(nodeId, best);
  }
  const freeNodes = allFreeNodes.filter((nodeId) => nodeSnr.get(nodeId) >= resolvableSignalToNoiseRatio);
  const unresolvableNodes = allFreeNodes.filter((nodeId) => nodeSnr.get(nodeId) < resolvableSignalToNoiseRatio);

  // --- global sum over free, retraceable force DOFs ---
  const globalForceSum = FORCE_DOFS.map((dof) => freeNodes.reduce((total, nodeId) => {
    const at = `${nodeId}|${dof}`;
    return constrainedKeys.has(at) ? total : total + (residual.get(at) ?? 0);
  }, 0));

  // --- per-node rollup ---
  const nodeRows = [];
  for (const nodeId of freeNodes) {
    const { force, moment } = nodalVectors(residual, nodeId, constrainedKeys);
    const adjacent = elementIndex.elementsByNode.get(nodeId) ?? [];
    const governing = [...adjacent].sort((a, b) => b.length - a.length)[0] ?? null;
    const forceMagnitude = norm(force);
    const axialProjection = governing
      ? Math.abs(force.reduce((total, value, index) => total + value * governing.axis[index], 0))
      : null;
    nodeRows.push(Object.freeze({
      nodeId,
      forceResidual: Object.freeze(force),
      momentResidual: Object.freeze(moment),
      forceMagnitude,
      momentMagnitude: norm(moment),
      forceNoiseBound: norm(FORCE_DOFS.map((dof) => (constrainedKeys.has(`${nodeId}|${dof}`) ? 0 : (noise.get(`${nodeId}|${dof}`) ?? 0)))),
      signalToNoiseRatio: nodeSnr.get(nodeId) ?? null,
      governingElementId: governing?.elementId ?? null,
      governingElementLength: governing?.length ?? null,
      axialProjection,
      axialFraction: axialProjection !== null && forceMagnitude > 0
        ? axialProjection / forceMagnitude
        : null,
    }));
  }

  // --- family split ---
  const forceValues = [];
  const momentValues = [];
  for (const nodeId of freeNodes) {
    for (const dof of FORCE_DOFS) {
      const at = `${nodeId}|${dof}`;
      if (!constrainedKeys.has(at)) forceValues.push(residual.get(at) ?? 0);
    }
    for (const dof of MOMENT_DOFS) {
      const at = `${nodeId}|${dof}`;
      if (!constrainedKeys.has(at)) momentValues.push(residual.get(at) ?? 0);
    }
  }

  // --- per-element antisymmetry: does the residual cancel across the element? ---
  const retraceableSet = new Set(retraceableNodes);
  const elementRows = [];
  for (const element of elementIndex.elements) {
    if (!retraceableSet.has(element.nodeI) || !retraceableSet.has(element.nodeJ)) continue;
    const atI = nodalVectors(residual, element.nodeI, constrainedKeys);
    const atJ = nodalVectors(residual, element.nodeJ, constrainedKeys);
    const sum = norm(atI.force.map((value, index) => value + atJ.force[index]));
    const magnitude = norm(atI.force) + norm(atJ.force);
    elementRows.push(Object.freeze({
      elementId: element.elementId,
      nodeI: element.nodeI,
      nodeJ: element.nodeJ,
      endResidualMagnitudeSum: magnitude,
      vectorSumMagnitude: sum,
      // ~0 means the two ends cancel: a self-equilibrating error, i.e. this
      // element's own stiffness. ~1 means they reinforce: the error is nodal.
      cancellationRatio: magnitude > 0 ? sum / magnitude : null,
    }));
  }

  const axialCandidates = nodeRows.filter((row) => row.axialFraction !== null && row.forceMagnitude > loadScale * 1e-6);
  const meanAxialFraction = axialCandidates.length
    ? axialCandidates.reduce((total, row) => total + row.axialFraction, 0) / axialCandidates.length
    : null;
  const forceRms = rootMeanSquare(forceValues);
  const momentRms = rootMeanSquare(momentValues);
  const globalSumMagnitude = norm(globalForceSum);

  return Object.freeze({
    level: 'L4',
    name: 'RESIDUAL_SIGNATURE',
    caseLabel,
    loadScale,
    resolution: Object.freeze({
      resolvableSignalToNoiseRatio,
      freeRetraceableNodeCount: allFreeNodes.length,
      resolvableNodeCount: freeNodes.length,
      unresolvableNodeCount: unresolvableNodes.length,
      worstSignalToNoiseRatio: Math.max(...allFreeNodes.map((nodeId) => nodeSnr.get(nodeId) ?? 0), 0),
      status: freeNodes.length === 0
        ? 'NO_RESOLVABLE_DOF_AT_THIS_AUTHORITY_PRECISION'
        : 'RESOLVABLE_SUBSET_PRESENT',
    }),
    freeRetraceableNodeCount: freeNodes.length,
    globalForceSum: Object.freeze(globalForceSum),
    globalForceSumMagnitude: globalSumMagnitude,
    globalForceSumFractionOfLoadScale: globalSumMagnitude / loadScale,
    familySplit: Object.freeze({
      forceResidualRms: forceRms,
      momentResidualRms: momentRms,
      // Dimensionally these are N and N*m, so the ratio is a metre-scaled
      // indicator, not a pure number. Reported for shape, not as a bar.
      momentToForceRatio: forceRms > 0 ? momentRms / forceRms : null,
    }),
    axialSignature: Object.freeze({
      sampledNodeCount: axialCandidates.length,
      meanAxialFraction,
      interpretation: meanAxialFraction === null ? 'NO_SAMPLE'
        : meanAxialFraction >= 0.7 ? 'AXIAL_DOMINANT_CONSISTENT_WITH_A_SUPPRESSED_AXIAL_TERM'
          : meanAxialFraction <= 0.3 ? 'TRANSVERSE_DOMINANT_NOT_AN_AXIAL_TERM'
            : 'MIXED_NO_SINGLE_DIRECTIONAL_MECHANISM',
    }),
    worstNodesByForceResidual: Object.freeze(
      [...nodeRows].sort((a, b) => b.forceMagnitude - a.forceMagnitude
        || a.nodeId.localeCompare(b.nodeId)).slice(0, 20),
    ),
    worstNodesByMomentResidual: Object.freeze(
      [...nodeRows].sort((a, b) => b.momentMagnitude - a.momentMagnitude
        || a.nodeId.localeCompare(b.nodeId)).slice(0, 20),
    ),
    mostSelfEquilibratingElements: Object.freeze(
      [...elementRows]
        .filter((row) => row.cancellationRatio !== null && row.endResidualMagnitudeSum > loadScale * 1e-4)
        .sort((a, b) => a.cancellationRatio - b.cancellationRatio
          || a.elementId.localeCompare(b.elementId))
        .slice(0, 20),
    ),
    nodeRows: Object.freeze(nodeRows),
  });
}

/**
 * Reduce the signature to one named, falsifiable verdict.
 *
 * Deliberately conservative: it names a defect class only when the evidence
 * separates it from the alternatives, and otherwise says so. An RCA that always
 * produces a confident answer is not measuring anything.
 */
export function deriveVerdict(signature) {
  // No resolvable DOF means the retrace has no resolving power on this model at
  // this authority precision. That is a real, reportable outcome about the METHOD
  // and it must not be dressed up as a finding about the model.
  if (signature.resolution.status === 'NO_RESOLVABLE_DOF_AT_THIS_AUTHORITY_PRECISION') {
    return Object.freeze({
      level: 'L4',
      name: 'RESIDUAL_VERDICT',
      caseLabel: signature.caseLabel,
      findings: Object.freeze([Object.freeze({
        code: 'RETRACE_UNRESOLVABLE_AT_AUTHORITY_PRECISION',
        detail: `No free retraceable DOF carries a residual exceeding its own worst-case noise bound (best signal-to-noise ${signature.resolution.worstSignalToNoiseRatio.toPrecision(3)} against a required ${signature.resolution.resolvableSignalToNoiseRatio}). The serialised displacement precision, amplified by this model's short-element stiffness, exceeds the residual everywhere.`,
      })]),
      status: 'UNRESOLVABLE',
    });
  }
  const loadFraction = signature.globalForceSumFractionOfLoadScale;
  const axial = signature.axialSignature;
  const findings = [];
  if (loadFraction > 1e-3) {
    findings.push({
      code: 'APPLIED_LOAD_VECTOR_DISAGREEMENT',
      detail: `Free-DOF residual sums to ${signature.globalForceSumMagnitude.toPrecision(6)} N (${(loadFraction * 100).toPrecision(3)}% of load scale); a load present in one model and absent in the other cannot cancel internally.`,
    });
  }
  if (axial.interpretation === 'AXIAL_DOMINANT_CONSISTENT_WITH_A_SUPPRESSED_AXIAL_TERM') {
    findings.push({
      code: 'AXIAL_TERM_SUPPRESSED',
      detail: `Mean axial fraction of the nodal residual force is ${axial.meanAxialFraction.toFixed(3)} across ${axial.sampledNodeCount} nodes; bending and support errors do not load a pipe along its own axis.`,
    });
  }
  if (axial.interpretation === 'TRANSVERSE_DOMINANT_NOT_AN_AXIAL_TERM') {
    findings.push({
      code: 'TRANSVERSE_MECHANISM',
      detail: `Mean axial fraction is ${axial.meanAxialFraction.toFixed(3)}; the residual is transverse, so a suppressed axial/pressure term is not the driver.`,
    });
  }
  const selfEquilibrating = signature.mostSelfEquilibratingElements
    .filter((row) => row.cancellationRatio < 0.1);
  if (selfEquilibrating.length > 0) {
    findings.push({
      code: 'ELEMENT_STIFFNESS_CANDIDATES',
      detail: `${selfEquilibrating.length} element(s) carry a self-equilibrating residual pair (cancellation ratio < 0.1), which is the fingerprint of a wrong element stiffness rather than a nodal load or support error.`,
      elementIds: selfEquilibrating.map((row) => row.elementId),
    });
  }
  return Object.freeze({
    level: 'L4',
    name: 'RESIDUAL_VERDICT',
    caseLabel: signature.caseLabel,
    findings: Object.freeze(findings.map((row) => Object.freeze(row))),
    status: findings.length === 0 ? 'NO_DISCRIMINATING_SIGNATURE' : 'SIGNATURE_IDENTIFIED',
  });
}
