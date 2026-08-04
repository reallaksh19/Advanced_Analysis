const STICK = 'STICK';
const SLIP = 'SLIP';

// CAESAR II's documented default static-friction stiffness is 1.0E+06 lbf/in.
// The BM1 source uses SI base units, so convert exactly to N/m.
const POUND_FORCE_TO_NEWTON = 4.4482216152605;
const INCH_TO_METRE = 0.0254;
const FRICTION_STIFFNESS = 1.0e6 * POUND_FORCE_TO_NEWTON / INCH_TO_METRE;

const FORCE_ABSOLUTE_TOLERANCE = 1.0e-2;
const FORCE_RELATIVE_TOLERANCE = 1.0e-8;
const DIRECTION_COSINE_TOLERANCE = 1.0e-8;
const MAXIMUM_NEWTON_ITERATIONS = 40;
const MAXIMUM_LINE_SEARCH_STEPS = 18;

const ACTIVE_SETS = Object.freeze([
  Object.freeze({ '70': STICK, '80': STICK }),
  Object.freeze({ '70': STICK, '80': SLIP }),
  Object.freeze({ '70': SLIP, '80': STICK }),
  Object.freeze({ '70': SLIP, '80': SLIP }),
]);

export const BM1_COULOMB_PROFILE = Object.freeze({
  schema: 'm025-bm1-coulomb-profile/v2',
  algorithm: 'SIMULTANEOUS_ACTIVE_SET_ENUMERATION_DAMPED_NEWTON_V2',
  frictionStiffness: FRICTION_STIFFNESS,
  frictionStiffnessSource: Object.freeze({
    value: 1.0e6,
    units: 'lbf/in',
    convertedValue: FRICTION_STIFFNESS,
    convertedUnits: 'N/m',
    authority: 'CAESAR_II_DEFAULT_STATIC_FRICTION_STIFFNESS',
  }),
  forceAbsoluteTolerance: FORCE_ABSOLUTE_TOLERANCE,
  forceRelativeTolerance: FORCE_RELATIVE_TOLERANCE,
  directionCosineTolerance: DIRECTION_COSINE_TOLERANCE,
  maximumNewtonIterations: MAXIMUM_NEWTON_ITERATIONS,
  maximumLineSearchSteps: MAXIMUM_LINE_SEARCH_STEPS,
  activeSetCandidates: ACTIVE_SETS,
});

/**
 * Resolve the two live BM1 friction restraints without modifying the linear
 * kernel. Each candidate active set is a sealed linear mechanical model:
 *
 * - STICK: finite transverse springs with CAESAR's friction stiffness.
 * - SLIP: transverse springs removed and a bounded support-force vector added.
 *
 * All slip-force components are solved simultaneously. Candidate enumeration
 * removes update-order dependence and makes cycling impossible: exactly one
 * constitutively admissible candidate must exist for each load case.
 */
export function solveBm1CoulombCases({ buildAuthorities, analyseCase }) {
  if (typeof buildAuthorities !== 'function' || typeof analyseCase !== 'function') {
    throw new TypeError('M025 requires buildAuthorities and analyseCase callbacks.');
  }

  const sourceAuthorities = buildAuthorities({});
  const sites = frictionSites(sourceAuthorities);
  assertBm1Sites(sites);

  const sustained = solveCase({
    caseId: 'BM1-SUSTAINED',
    thermal: false,
    sites,
    buildAuthorities,
    analyseCase,
  });
  const operating = solveCase({
    caseId: 'BM1-OPERATING-T1',
    thermal: true,
    sites,
    buildAuthorities,
    analyseCase,
  });

  return {
    authorities: operating.authorities,
    sustained: sustained.analysis,
    operating: operating.analysis,
    friction: Object.freeze({
      schema: 'm025-bm1-coulomb-friction/v2',
      profile: BM1_COULOMB_PROFILE,
      sourceSites: Object.freeze(sites),
      sustained: sustained.friction,
      operating: operating.friction,
    }),
  };
}

function solveCase({ caseId, thermal, sites, buildAuthorities, analyseCase }) {
  const candidates = ACTIVE_SETS.map((states) => solveCandidate({
    caseId,
    thermal,
    sites,
    buildAuthorities,
    analyseCase,
    states,
  }));
  const admissible = candidates.filter((candidate) => candidate.admissible);

  if (admissible.length !== 1) {
    throw new Error(`M025 ${caseId} requires one admissible simultaneous active set; resolved ${admissible.length}: ${JSON.stringify(candidates.map(candidateSummary))}`);
  }

  const selected = admissible[0];
  const finalNodes = Object.freeze(selected.nodeEvidence.map(finalizeNode));
  const byKernelNode = Object.freeze(Object.fromEntries(
    finalNodes.map((row) => [row.kernelNodeId, row]),
  ));
  const friction = Object.freeze({
    schema: 'm025-bm1-coulomb-case/v2',
    caseId,
    converged: true,
    selectedActiveSet: Object.freeze({ ...selected.states }),
    activeSetCandidateCount: candidates.length,
    admissibleActiveSetCount: admissible.length,
    iterationCount: selected.iterationCount,
    residualInfinityNorm: selected.residualInfinityNorm,
    residualEuclideanNorm: selected.residualEuclideanNorm,
    forceTolerance: selected.forceTolerance,
    states: Object.freeze(Object.fromEntries(finalNodes.map((row) => [row.sourceNodeId, row.state]))),
    nodes: finalNodes,
    byKernelNode,
    candidates: Object.freeze(candidates.map(candidateEvidence)),
    history: Object.freeze(selected.history),
  });
  const rawAnalysis = analyseCase(
    selected.authorities,
    caseId,
    thermal,
    selected.forcePrimitives,
    thermal ? 1 : 0,
    true,
    friction,
  );
  const analysis = Object.freeze(rawAnalysis);

  return {
    authorities: selected.authorities,
    analysis,
    friction,
  };
}

function solveCandidate({ caseId, thermal, sites, buildAuthorities, analyseCase, states }) {
  const slipSites = sites.filter((site) => states[site.sourceNodeId] === SLIP);
  const authorities = buildAuthorities({
    frictionStates: states,
    frictionStiffness: FRICTION_STIFFNESS,
  });
  const response = buildAffineResponse({
    caseId,
    thermal,
    sites,
    slipSites,
    authorities,
    analyseCase,
    states,
  });
  const zero = Array(2 * slipSites.length).fill(0);
  const initialEvaluation = response.evaluate(zero);
  let x = slipSites.flatMap((site) => {
    const row = initialEvaluation.nodeEvidence.find((candidate) => candidate.sourceNodeId === site.sourceNodeId);
    return [row.desiredForce.x, row.desiredForce.z];
  });
  let current = response.evaluate(x);
  const history = [];

  if (slipSites.length > 0) {
    for (let iteration = 1; iteration <= MAXIMUM_NEWTON_ITERATIONS; iteration += 1) {
      const convergence = convergenceEvidence(current);
      history.push(Object.freeze({
        iteration,
        residualInfinityNorm: convergence.residualInfinityNorm,
        residualEuclideanNorm: convergence.residualEuclideanNorm,
        forceTolerance: convergence.forceTolerance,
        converged: convergence.converged,
        nodes: Object.freeze(current.nodeEvidence),
      }));
      if (convergence.converged) break;

      const jacobian = finiteDifferenceJacobian({
        x,
        baseResidual: current.residual,
        evaluateResidual: (candidateX) => response.evaluate(candidateX).residual,
      });
      const step = regularizedLeastSquaresStep(jacobian, current.residual);
      if (!step) break;

      const accepted = lineSearch({
        x,
        step,
        current,
        evaluateCandidate: response.evaluate,
      });
      if (!accepted) break;
      x = accepted.x;
      current = accepted.evaluation;
    }
  }

  const convergence = convergenceEvidence(current);
  if (slipSites.length === 0) {
    history.push(Object.freeze({
      iteration: 1,
      residualInfinityNorm: 0,
      residualEuclideanNorm: 0,
      forceTolerance: convergence.forceTolerance,
      converged: true,
      nodes: Object.freeze(current.nodeEvidence),
    }));
  }

  const nodeAdmissible = current.nodeEvidence.every((row) => row.activeSetAdmissible);
  const admissible = convergence.converged && nodeAdmissible;
  return {
    ...current,
    authorities,
    forcePrimitives: forcePrimitivesFromVector({ x, slipSites, authorities }),
    states: { ...states },
    history,
    responseEvidence: response.evidence,
    iterationCount: history.length,
    residualInfinityNorm: convergence.residualInfinityNorm,
    residualEuclideanNorm: convergence.residualEuclideanNorm,
    forceTolerance: convergence.forceTolerance,
    converged: convergence.converged,
    nodeAdmissible,
    admissible,
  };
}

/**
 * A fixed active set is a linear system. Rather than rerunning the FEA solve
 * for every Newton residual evaluation, identify the exact affine map from the
 * active slip-force components to the two support reactions/displacements.
 * Newton then operates on a four-variable constitutive residual only. This is
 * both deterministic and substantially more stable/efficient than embedding a
 * full global solve inside every finite-difference and line-search probe.
 */
function buildAffineResponse({ caseId, thermal, sites, slipSites, authorities, analyseCase, states }) {
  const dimension = 2 * slipSites.length;
  const baseX = Array(dimension).fill(0);
  const base = solveTargetState({
    x: baseX,
    caseId,
    thermal,
    sites,
    slipSites,
    authorities,
    analyseCase,
  });
  const columns = [];
  const probeForce = 1000;
  for (let column = 0; column < dimension; column += 1) {
    const x = Array(dimension).fill(0);
    x[column] = probeForce;
    const target = solveTargetState({
      x,
      caseId,
      thermal,
      sites,
      slipSites,
      authorities,
      analyseCase,
    });
    columns.push(Object.freeze(Object.fromEntries(sites.map((site) => {
      const baseRow = base[site.sourceNodeId];
      const row = target[site.sourceNodeId];
      return [site.sourceNodeId, Object.freeze({
        normalReaction: (row.normalReaction - baseRow.normalReaction) / probeForce,
        ux: (row.ux - baseRow.ux) / probeForce,
        uz: (row.uz - baseRow.uz) / probeForce,
      })];
    }))));
  }

  const evaluate = (x) => {
    const target = Object.fromEntries(sites.map((site) => {
      const baseRow = base[site.sourceNodeId];
      const row = { ...baseRow };
      for (let column = 0; column < dimension; column += 1) {
        const derivative = columns[column][site.sourceNodeId];
        row.normalReaction += derivative.normalReaction * x[column];
        row.ux += derivative.ux * x[column];
        row.uz += derivative.uz * x[column];
      }
      return [site.sourceNodeId, row];
    }));
    return constitutiveEvaluation({ x, sites, slipSites, states, target });
  };

  return Object.freeze({
    evaluate,
    evidence: Object.freeze({
      kind: 'FIXED_ACTIVE_SET_AFFINE_RESPONSE_V1',
      probeForce,
      slipVariableCount: dimension,
      globalLinearSolveCount: 1 + dimension,
      base: Object.freeze(base),
      columns: Object.freeze(columns),
    }),
  });
}

function solveTargetState({ x, caseId, thermal, sites, slipSites, authorities, analyseCase }) {
  const forcePrimitives = forcePrimitivesFromVector({ x, slipSites, authorities });
  const analysis = analyseCase(
    authorities,
    caseId,
    thermal,
    forcePrimitives,
    thermal ? 1 : 0,
    false,
    null,
  );
  return Object.freeze(Object.fromEntries(sites.map((site) => {
    const kernelNodeId = authorities.kernelNodeByReference.get(site.sourceNodeId);
    return [site.sourceNodeId, Object.freeze({
      normalReaction: value(analysis.execution.reactions, kernelNodeId, 'UY'),
      ux: value(analysis.execution.displacement, kernelNodeId, 'UX'),
      uz: value(analysis.execution.displacement, kernelNodeId, 'UZ'),
    })];
  })));
}

function forcePrimitivesFromVector({ x, slipSites, authorities }) {
  return slipSites.map((site, index) => ({
    sourceNodeId: site.sourceNodeId,
    kernelNodeId: authorities.kernelNodeByReference.get(site.sourceNodeId),
    fx: x[2 * index],
    fz: x[2 * index + 1],
  }));
}

function constitutiveEvaluation({ x, sites, slipSites, states, target }) {
  const slipForces = zeroForces(sites);
  slipSites.forEach((site, index) => {
    slipForces[site.sourceNodeId] = vector(x[2 * index], x[2 * index + 1]);
  });
  const nodeEvidence = [];
  const residual = [];

  for (const site of sites) {
    const sourceNodeId = site.sourceNodeId;
    const solved = target[sourceNodeId];
    const normalReaction = solved.normalReaction;
    const normalMagnitude = Math.abs(normalReaction);
    const coulombLimit = site.coefficient * normalMagnitude;
    const displacement = vector(solved.ux, solved.uz);
    const displacementMagnitude = norm(displacement);
    const elasticTrialForce = scale(displacement, -FRICTION_STIFFNESS);
    const elasticTrialMagnitude = norm(elasticTrialForce);
    const forceTolerance = toleranceFor(coulombLimit);
    const state = states[sourceNodeId];

    if (state === STICK) {
      nodeEvidence.push(evidence({
        site,
        state,
        normalReaction,
        coulombLimit,
        displacement,
        elasticTrialForce,
        tangentialForce: elasticTrialForce,
        desiredForce: elasticTrialForce,
        forceResidualVector: vector(0, 0),
        activeSetAdmissible: elasticTrialMagnitude <= coulombLimit + forceTolerance,
      }));
      continue;
    }

    const currentForce = slipForces[sourceNodeId];
    const desiredForce = displacementMagnitude > 0
      ? scale(unit(displacement), -coulombLimit)
      : vector(0, 0);
    const forceResidualVector = subtract(currentForce, desiredForce);
    residual.push(forceResidualVector.x, forceResidualVector.z);
    const oppositionCosine = cosine(currentForce, displacement);
    const onSurface = Math.abs(norm(currentForce) - coulombLimit) <= forceTolerance;
    const beyondBreakaway = elasticTrialMagnitude + forceTolerance >= coulombLimit;
    const opposing = displacementMagnitude > 0
      && oppositionCosine <= -1 + DIRECTION_COSINE_TOLERANCE;

    nodeEvidence.push(evidence({
      site,
      state,
      normalReaction,
      coulombLimit,
      displacement,
      elasticTrialForce,
      tangentialForce: currentForce,
      desiredForce,
      forceResidualVector,
      activeSetAdmissible: onSurface && beyondBreakaway && opposing,
    }));
  }

  return { nodeEvidence, residual };
}

function convergenceEvidence(evaluation) {
  const residualInfinityNorm = infinityNorm(evaluation.residual);
  const residualEuclideanNorm = Math.sqrt(squaredNorm(evaluation.residual));
  const forceTolerance = Math.max(
    FORCE_ABSOLUTE_TOLERANCE,
    ...evaluation.nodeEvidence.map((row) => toleranceFor(row.coulombLimit)),
  );
  return {
    residualInfinityNorm,
    residualEuclideanNorm,
    forceTolerance,
    converged: residualInfinityNorm <= forceTolerance,
  };
}

function finiteDifferenceJacobian({ x, baseResidual, evaluateResidual }) {
  const rows = baseResidual.length;
  const columns = x.length;
  const jacobian = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let column = 0; column < columns; column += 1) {
    const step = Math.max(0.01, 1.0e-5 * Math.max(1, Math.abs(x[column])));
    const plus = [...x];
    const minus = [...x];
    plus[column] += step;
    minus[column] -= step;
    const plusResidual = evaluateResidual(plus);
    const minusResidual = evaluateResidual(minus);
    for (let row = 0; row < rows; row += 1) {
      jacobian[row][column] = (plusResidual[row] - minusResidual[row]) / (2 * step);
    }
  }
  return jacobian;
}

function regularizedLeastSquaresStep(jacobian, residual) {
  const columns = jacobian[0]?.length ?? 0;
  if (columns === 0) return [];

  for (const damping of [0, 1.0e-12, 1.0e-10, 1.0e-8, 1.0e-6, 1.0e-4, 1.0e-2, 1, 100]) {
    const normal = Array.from({ length: columns }, () => Array(columns).fill(0));
    const rhs = Array(columns).fill(0);
    for (let row = 0; row < jacobian.length; row += 1) {
      for (let i = 0; i < columns; i += 1) {
        rhs[i] -= jacobian[row][i] * residual[row];
        for (let j = 0; j < columns; j += 1) {
          normal[i][j] += jacobian[row][i] * jacobian[row][j];
        }
      }
    }
    for (let i = 0; i < columns; i += 1) {
      normal[i][i] += damping * Math.max(1, normal[i][i]);
    }
    const solved = solveDenseLinearSystem(normal, rhs);
    if (solved) return solved;
  }
  return null;
}

function lineSearch({ x, step, current, evaluateCandidate }) {
  const currentObjective = squaredNorm(current.residual);
  const forceScale = Math.max(
    1,
    ...current.nodeEvidence.map((row) => row.coulombLimit),
    ...x.map(Math.abs),
  );
  const limitedStep = limitVectorNorm(step, 2 * forceScale);

  for (let index = 0; index < MAXIMUM_LINE_SEARCH_STEPS; index += 1) {
    const alpha = 2 ** -index;
    const candidateX = x.map((value, component) => value + alpha * limitedStep[component]);
    const evaluation = evaluateCandidate(candidateX);
    if (squaredNorm(evaluation.residual) < currentObjective) {
      return { x: candidateX, evaluation };
    }
  }
  return null;
}

function finalizeNode(row) {
  const tangentialMagnitude = norm(row.tangentialForce);
  const forceTolerance = toleranceFor(row.coulombLimit);
  const reactionSupplement = row.tangentialForce;
  return Object.freeze({
    ...row,
    tangentialMagnitude,
    mobilization: row.coulombLimit > 0 ? tangentialMagnitude / row.coulombLimit : 0,
    forceTolerance,
    boundResidual: tangentialMagnitude - row.coulombLimit,
    constitutiveResidual: norm(row.forceResidualVector),
    oppositionCosine: cosine(row.tangentialForce, row.tangentialDisplacementVector),
    forceAppliedToStructure: Object.freeze({
      fx: row.tangentialForce.x,
      fy: 0,
      fz: row.tangentialForce.z,
    }),
    reactionSupplement: Object.freeze({
      UX: reactionSupplement.x,
      UY: 0,
      UZ: reactionSupplement.z,
      RX: 0,
      RY: 0,
      RZ: 0,
    }),
    equilibriumSupplement: Object.freeze(row.state === STICK
      ? { fx: reactionSupplement.x, fy: 0, fz: reactionSupplement.z, mx: 0, my: 0, mz: 0 }
      : { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }),
  });
}

function evidence({
  site,
  state,
  normalReaction,
  coulombLimit,
  displacement,
  elasticTrialForce,
  tangentialForce,
  desiredForce,
  forceResidualVector,
  activeSetAdmissible,
}) {
  return Object.freeze({
    sourceNodeId: site.sourceNodeId,
    kernelNodeId: site.kernelNodeId,
    coefficient: site.coefficient,
    state,
    frictionStiffness: FRICTION_STIFFNESS,
    normalReaction,
    normalMagnitude: Math.abs(normalReaction),
    coulombLimit,
    tangentialDisplacementVector: Object.freeze({ ...displacement }),
    tangentialDisplacement: Object.freeze({ ux: displacement.x, uz: displacement.z }),
    tangentialDisplacementMagnitude: norm(displacement),
    elasticTrialForce: Object.freeze({ ...elasticTrialForce }),
    elasticTrialMagnitude: norm(elasticTrialForce),
    tangentialForce: Object.freeze({ ...tangentialForce }),
    desiredForce: Object.freeze({ ...desiredForce }),
    forceResidualVector: Object.freeze({ ...forceResidualVector }),
    activeSetAdmissible,
  });
}

function candidateEvidence(candidate) {
  return Object.freeze({
    states: Object.freeze({ ...candidate.states }),
    converged: candidate.converged,
    nodeAdmissible: candidate.nodeAdmissible,
    admissible: candidate.admissible,
    iterationCount: candidate.iterationCount,
    residualInfinityNorm: candidate.residualInfinityNorm,
    residualEuclideanNorm: candidate.residualEuclideanNorm,
    forceTolerance: candidate.forceTolerance,
    nodes: Object.freeze(candidate.nodeEvidence),
  });
}

function candidateSummary(candidate) {
  return {
    states: candidate.states,
    converged: candidate.converged,
    nodeAdmissible: candidate.nodeAdmissible,
    admissible: candidate.admissible,
    residualInfinityNorm: candidate.residualInfinityNorm,
    nodes: candidate.nodeEvidence.map((row) => ({
      node: row.sourceNodeId,
      state: row.state,
      normal: Math.abs(row.normalReaction),
      limit: row.coulombLimit,
      elasticTrial: norm(row.elasticTrialForce),
      force: norm(row.tangentialForce),
      activeSetAdmissible: row.activeSetAdmissible,
    })),
  };
}

function frictionSites(authorities) {
  const sites = [];
  for (const node of authorities.normalized.geometry.nodes) {
    for (const restraint of node.meta.restraints ?? []) {
      const coefficient = restraint.frictionCoefficient;
      if (!(coefficient > 0)) continue;
      const direction = [restraint.xCosine ?? 0, restraint.yCosine ?? 0, restraint.zCosine ?? 0];
      if (Math.abs(direction[0]) > 1.0e-12
        || Math.abs(Math.abs(direction[1]) - 1) > 1.0e-12
        || Math.abs(direction[2]) > 1.0e-12) {
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

function assertBm1Sites(sites) {
  if (sites.length !== 2 || sites.map((row) => row.sourceNodeId).join(',') !== '70,80') {
    throw new Error(`M025 requires exactly the live BM1 friction sites 70 and 80; resolved ${sites.map((row) => row.sourceNodeId).join(',')}.`);
  }
  if (!sites.every((row) => row.coefficient === 0.3)) {
    throw new Error(`M025 requires coefficient 0.3 at both live BM1 friction sites: ${JSON.stringify(sites)}`);
  }
}

function toleranceFor(coulombLimit) {
  return FORCE_ABSOLUTE_TOLERANCE
    + FORCE_RELATIVE_TOLERANCE * Math.max(1, coulombLimit);
}

function zeroForces(sites) {
  return Object.fromEntries(sites.map((site) => [site.sourceNodeId, vector(0, 0)]));
}

function solveDenseLinearSystem(matrix, rhs) {
  const n = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    if (Math.abs(augmented[best][pivot]) < 1.0e-14) return null;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= n; column += 1) augmented[pivot][column] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= n; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }
  return augmented.map((row) => row[n]);
}

function value(entries, nodeId, dof) {
  return entries.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}
function vector(x, z) { return { x, z }; }
function norm(value) { return Math.hypot(value.x, value.z); }
function scale(value, factor) { return vector(value.x * factor, value.z * factor); }
function subtract(left, right) { return vector(left.x - right.x, left.z - right.z); }
function unit(value) {
  const magnitude = norm(value);
  return magnitude > 0 ? scale(value, 1 / magnitude) : vector(0, 0);
}
function cosine(left, right) {
  const denominator = norm(left) * norm(right);
  return denominator > 0 ? (left.x * right.x + left.z * right.z) / denominator : 0;
}
function infinityNorm(values) {
  return values.reduce((maximum, current) => Math.max(maximum, Math.abs(current)), 0);
}
function squaredNorm(values) {
  return values.reduce((sum, current) => sum + current * current, 0);
}
function limitVectorNorm(values, limit) {
  const magnitude = Math.sqrt(squaredNorm(values));
  if (!(magnitude > limit)) return values;
  const factor = limit / magnitude;
  return values.map((value) => value * factor);
}
