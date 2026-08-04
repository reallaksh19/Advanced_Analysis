const STICK = 'STICK';
const SLIP = 'SLIP';
const MAX_ITERATIONS_PER_STEP = 80;
const THERMAL_LOAD_STEPS = 32;
const FORCE_RELAXATION = 0.55;
const FORCE_RELATIVE_TOLERANCE = 1e-8;
const FORCE_ABSOLUTE_TOLERANCE = 1e-5;
const DISPLACEMENT_DIRECTION_TOLERANCE = 1e-12;
const ACTIVE_SET_RELATIVE_TOLERANCE = 1e-10;
const ACTIVE_SET_ABSOLUTE_TOLERANCE = 1e-6;

export const BM1_COULOMB_PROFILE = Object.freeze({
  algorithm: 'THERMAL_CONTINUATION_ACTIVE_SET_RELAXED_FIXED_POINT_V1',
  maximumIterationsPerStep: MAX_ITERATIONS_PER_STEP,
  thermalLoadSteps: THERMAL_LOAD_STEPS,
  maximumIterations: MAX_ITERATIONS_PER_STEP * THERMAL_LOAD_STEPS,
  forceRelaxation: FORCE_RELAXATION,
  forceRelativeTolerance: FORCE_RELATIVE_TOLERANCE,
  forceAbsoluteTolerance: FORCE_ABSOLUTE_TOLERANCE,
  displacementDirectionTolerance: DISPLACEMENT_DIRECTION_TOLERANCE,
  activeSetRelativeTolerance: ACTIVE_SET_RELATIVE_TOLERANCE,
  activeSetAbsoluteTolerance: ACTIVE_SET_ABSOLUTE_TOLERANCE,
});

export function solveBm1CoulombCases({ buildAuthorities, analyseCase }) {
  if (typeof buildAuthorities !== 'function' || typeof analyseCase !== 'function') {
    throw new TypeError('M025 requires buildAuthorities and analyseCase callbacks.');
  }
  const sourceAuthorities = buildAuthorities({});
  const sites = frictionSites(sourceAuthorities);
  if (sites.length !== 2 || sites.map((row) => row.sourceNodeId).join(',') !== '70,80') {
    throw new Error(`M025 requires exactly the live BM1 friction sites 70 and 80; resolved ${sites.map((row) => row.sourceNodeId).join(',')}.`);
  }

  const sustained = solveContinuation({
    caseId: 'BM1-SUSTAINED',
    thermal: false,
    thermalScales: [0],
    sites,
    buildAuthorities,
    analyseCase,
    initial: null,
  });
  const operating = solveContinuation({
    caseId: 'BM1-OPERATING-T1',
    thermal: true,
    thermalScales: Array.from({ length: THERMAL_LOAD_STEPS }, (_, index) => (index + 1) / THERMAL_LOAD_STEPS),
    sites,
    buildAuthorities,
    analyseCase,
    initial: continuationState(sustained),
  });

  return {
    authorities: operating.authorities,
    sustained: sustained.analysis,
    operating: operating.analysis,
    friction: {
      schema: 'm025-bm1-coulomb-friction/v1',
      profile: BM1_COULOMB_PROFILE,
      sourceSites: sites,
      sustained: sustained.friction,
      operating: operating.friction,
    },
  };
}

function frictionSites(authorities) {
  const sites = [];
  for (const node of authorities.normalized.geometry.nodes) {
    for (const restraint of node.meta.restraints ?? []) {
      const coefficient = restraint.frictionCoefficient;
      if (!(coefficient > 0)) continue;
      const direction = [restraint.xCosine ?? 0, restraint.yCosine ?? 0, restraint.zCosine ?? 0];
      if (Math.abs(direction[0]) > 1e-12 || Math.abs(Math.abs(direction[1]) - 1) > 1e-12 || Math.abs(direction[2]) > 1e-12) {
        throw new Error(`M025 BM1 friction site ${node.id} must be normal to global Y.`);
      }
      sites.push(Object.freeze({
        sourceNodeId: node.id,
        kernelNodeId: authorities.kernelNodeByReference.get(node.id),
        coefficient,
        sourceTypeCode: restraint.sourceTypeCode,
        typeCode: restraint.typeCode,
        normalDof: 'UY',
        tangentialDofs: Object.freeze(['UX', 'UZ']),
      }));
    }
  }
  return sites.sort((left, right) => Number(left.sourceNodeId) - Number(right.sourceNodeId));
}

function solveContinuation({ caseId, thermal, thermalScales, sites, buildAuthorities, analyseCase, initial }) {
  let states = initial?.states ?? Object.fromEntries(sites.map((site) => [site.sourceNodeId, STICK]));
  let slipForces = initial?.slipForces ?? Object.fromEntries(sites.map((site) => [site.sourceNodeId, vector(0, 0)]));
  let previousDisplacements = initial?.displacements ?? Object.fromEntries(sites.map((site) => [site.sourceNodeId, vector(0, 0)]));
  const steps = [];
  let final = null;

  for (const [stepIndex, thermalScale] of thermalScales.entries()) {
    const solved = solveStep({
      caseId,
      thermal,
      thermalScale,
      stepIndex: stepIndex + 1,
      stepCount: thermalScales.length,
      sites,
      buildAuthorities,
      analyseCase,
      states,
      slipForces,
      previousDisplacements,
    });
    steps.push(solved.stepEvidence);
    states = solved.states;
    slipForces = solved.slipForces;
    previousDisplacements = solved.displacements;
    final = solved;
  }

  if (!final) throw new Error(`M025 ${caseId} has no continuation steps.`);
  const history = steps.flatMap((step) => step.history);
  const friction = Object.freeze({
    ...final.friction,
    iterationCount: history.length,
    loadStepCount: steps.length,
    loadSteps: Object.freeze(steps),
    history: Object.freeze(history),
  });
  const analysis = Object.freeze({ ...final.analysis, friction });
  return { ...final, analysis, friction };
}

function solveStep({
  caseId,
  thermal,
  thermalScale,
  stepIndex,
  stepCount,
  sites,
  buildAuthorities,
  analyseCase,
  states: initialStates,
  slipForces: initialSlipForces,
  previousDisplacements,
}) {
  let states = { ...initialStates };
  let slipForces = cloneVectors(initialSlipForces);
  const history = [];
  let last = null;

  for (let iteration = 1; iteration <= MAX_ITERATIONS_PER_STEP; iteration += 1) {
    const authorities = buildAuthorities({ frictionStates: states });
    const forcePrimitives = sites
      .filter((site) => states[site.sourceNodeId] === SLIP)
      .map((site) => ({
        sourceNodeId: site.sourceNodeId,
        kernelNodeId: authorities.kernelNodeByReference.get(site.sourceNodeId),
        fx: slipForces[site.sourceNodeId].x,
        fz: slipForces[site.sourceNodeId].z,
      }));
    const rawAnalysis = analyseCase(authorities, caseId, thermal, forcePrimitives, thermalScale);
    const nextStates = { ...states };
    const nextForces = cloneVectors(slipForces);
    const nodeEvidence = [];
    let stateChanged = false;
    let maximumForceResidual = 0;

    for (const site of sites) {
      const sourceNodeId = site.sourceNodeId;
      const kernelNodeId = authorities.kernelNodeByReference.get(sourceNodeId);
      const normalReaction = value(rawAnalysis.execution.reactions, kernelNodeId, 'UY');
      const normalMagnitude = Math.abs(normalReaction);
      const coulombLimit = site.coefficient * normalMagnitude;
      const displacement = vector(
        value(rawAnalysis.execution.displacement, kernelNodeId, 'UX'),
        value(rawAnalysis.execution.displacement, kernelNodeId, 'UZ'),
      );
      const displacementIncrement = subtract(displacement, previousDisplacements[sourceNodeId]);
      const state = states[sourceNodeId];

      if (state === STICK) {
        const reaction = vector(
          value(rawAnalysis.execution.reactions, kernelNodeId, 'UX'),
          value(rawAnalysis.execution.reactions, kernelNodeId, 'UZ'),
        );
        const tangentialMagnitude = norm(reaction);
        const admissibleLimit = coulombLimit * (1 + ACTIVE_SET_RELATIVE_TOLERANCE) + ACTIVE_SET_ABSOLUTE_TOLERANCE;
        const admissible = tangentialMagnitude <= admissibleLimit;
        if (!admissible) {
          nextStates[sourceNodeId] = SLIP;
          nextForces[sourceNodeId] = scale(unit(reaction), coulombLimit);
          stateChanged = true;
        }
        nodeEvidence.push(evidence({
          site,
          state,
          normalReaction,
          coulombLimit,
          displacement,
          displacementIncrement,
          tangentialForce: reaction,
          desiredForce: admissible ? reaction : nextForces[sourceNodeId],
          forceResidual: admissible ? 0 : norm(subtract(nextForces[sourceNodeId], reaction)),
          admissible,
        }));
        continue;
      }

      const currentForce = slipForces[sourceNodeId];
      const incrementMagnitude = norm(displacementIncrement);
      const desiredForce = incrementMagnitude > DISPLACEMENT_DIRECTION_TOLERANCE
        ? scale(unit(displacementIncrement), -coulombLimit)
        : projectToLimit(currentForce, coulombLimit);
      const forceResidual = norm(subtract(desiredForce, currentForce));
      maximumForceResidual = Math.max(maximumForceResidual, forceResidual);
      const tolerance = forceTolerance(coulombLimit);
      nextForces[sourceNodeId] = forceResidual <= tolerance
        ? desiredForce
        : add(scale(currentForce, 1 - FORCE_RELAXATION), scale(desiredForce, FORCE_RELAXATION));
      nodeEvidence.push(evidence({
        site,
        state,
        normalReaction,
        coulombLimit,
        displacement,
        displacementIncrement,
        tangentialForce: currentForce,
        desiredForce,
        forceResidual,
        admissible: norm(currentForce) <= coulombLimit + tolerance,
      }));
    }

    const converged = !stateChanged && nodeEvidence.every((row) => {
      if (row.state === STICK) return row.admissible;
      return row.forceResidual <= forceTolerance(row.coulombLimit) && row.admissible;
    });
    history.push(Object.freeze({
      loadStep: stepIndex,
      loadStepCount: stepCount,
      thermalScale,
      iteration,
      states: Object.freeze({ ...states }),
      stateChanged,
      maximumForceResidual,
      converged,
      nodes: Object.freeze(nodeEvidence),
    }));

    last = { authorities, rawAnalysis, nodeEvidence, converged, iteration };
    states = nextStates;
    slipForces = nextForces;
    if (converged) break;
  }

  if (!last?.converged) {
    throw new Error(`M025 ${caseId} load step ${stepIndex}/${stepCount} did not converge in ${MAX_ITERATIONS_PER_STEP} iterations.`);
  }

  const finalNodes = finalizeNodes(last.nodeEvidence);
  const byKernelNode = Object.fromEntries(finalNodes.map((row) => [row.kernelNodeId, row]));
  const friction = Object.freeze({
    schema: 'm025-bm1-coulomb-case/v1',
    caseId,
    converged: true,
    iterationCount: last.iteration,
    loadStepCount: 1,
    finalThermalScale: thermalScale,
    states: Object.freeze(Object.fromEntries(finalNodes.map((row) => [row.sourceNodeId, row.state]))),
    nodes: Object.freeze(finalNodes),
    byKernelNode: Object.freeze(byKernelNode),
    history: Object.freeze(history),
  });
  const analysis = Object.freeze({ ...last.rawAnalysis, friction });
  return {
    authorities: last.authorities,
    analysis,
    friction,
    states: Object.fromEntries(finalNodes.map((row) => [row.sourceNodeId, row.state])),
    slipForces: Object.fromEntries(finalNodes.map((row) => [row.sourceNodeId, row.state === SLIP ? { ...row.tangentialForce } : vector(0, 0)])),
    displacements: Object.fromEntries(finalNodes.map((row) => [row.sourceNodeId, vector(row.tangentialDisplacement.ux, row.tangentialDisplacement.uz)])),
    stepEvidence: Object.freeze({
      loadStep: stepIndex,
      loadStepCount: stepCount,
      thermalScale,
      iterationCount: last.iteration,
      states: friction.states,
      nodes: friction.nodes,
      history: friction.history,
    }),
  };
}

function finalizeNodes(nodeEvidence) {
  return nodeEvidence.map((row) => {
    const physicalForce = row.state === STICK ? row.tangentialForce : row.desiredForce;
    const reactionSupplement = row.state === SLIP ? physicalForce : vector(0, 0);
    return Object.freeze({
      ...row,
      tangentialForce: Object.freeze({ ...physicalForce }),
      tangentialMagnitude: norm(physicalForce),
      mobilization: row.coulombLimit > 0 ? norm(physicalForce) / row.coulombLimit : 0,
      forceAppliedToStructure: Object.freeze({ fx: physicalForce.x, fy: 0, fz: physicalForce.z }),
      reactionSupplement: Object.freeze({ UX: reactionSupplement.x, UY: 0, UZ: reactionSupplement.z, RX: 0, RY: 0, RZ: 0 }),
    });
  });
}

function continuationState(result) {
  return {
    states: { ...result.friction.states },
    slipForces: Object.fromEntries(result.friction.nodes.map((row) => [row.sourceNodeId, vector(0, 0)])),
    displacements: Object.fromEntries(result.friction.nodes.map((row) => [
      row.sourceNodeId,
      vector(row.tangentialDisplacement.ux, row.tangentialDisplacement.uz),
    ])),
  };
}

function evidence({
  site,
  state,
  normalReaction,
  coulombLimit,
  displacement,
  displacementIncrement,
  tangentialForce,
  desiredForce,
  forceResidual,
  admissible,
}) {
  return Object.freeze({
    sourceNodeId: site.sourceNodeId,
    kernelNodeId: site.kernelNodeId,
    coefficient: site.coefficient,
    state,
    normalReaction,
    normalMagnitude: Math.abs(normalReaction),
    coulombLimit,
    tangentialDisplacement: Object.freeze({ ux: displacement.x, uz: displacement.z }),
    tangentialDisplacementMagnitude: norm(displacement),
    tangentialDisplacementIncrement: Object.freeze({ ux: displacementIncrement.x, uz: displacementIncrement.z }),
    tangentialDisplacementIncrementMagnitude: norm(displacementIncrement),
    tangentialForce: Object.freeze({ ...tangentialForce }),
    tangentialMagnitude: norm(tangentialForce),
    desiredForce: Object.freeze({ ...desiredForce }),
    desiredMagnitude: norm(desiredForce),
    forceResidual,
    boundResidual: norm(tangentialForce) - coulombLimit,
    admissible,
  });
}

function forceTolerance(coulombLimit) {
  return FORCE_ABSOLUTE_TOLERANCE + FORCE_RELATIVE_TOLERANCE * Math.max(1, coulombLimit);
}
function cloneVectors(value) {
  return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, { ...row }]));
}
function value(entries, nodeId, dof) {
  return entries.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}
function vector(x, z) { return { x, z }; }
function norm(value) { return Math.hypot(value.x, value.z); }
function add(left, right) { return vector(left.x + right.x, left.z + right.z); }
function subtract(left, right) { return vector(left.x - right.x, left.z - right.z); }
function scale(value, factor) { return vector(value.x * factor, value.z * factor); }
function unit(value) {
  const magnitude = norm(value);
  return magnitude > 0 ? scale(value, 1 / magnitude) : vector(0, 0);
}
function projectToLimit(value, limit) {
  const magnitude = norm(value);
  if (!(limit > 0) || !(magnitude > 0)) return vector(0, 0);
  return scale(value, limit / magnitude);
}
