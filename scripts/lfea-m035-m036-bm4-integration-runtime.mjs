import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import {
  augmentFrameElementUniformAxialInitialStrain,
  compileFrameElement,
} from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  computePipingComponentSemanticHash,
  requirePipingComponent,
} from '../src/core/linear-fea-piping-components/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE,
  BM4_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import { buildM036Bm4Inventory } from './lfea-m036-bm4-runtime.mjs';

const NODE_PREFIX = 'BM4M035.N';
const M038_ACCDB_SOURCE = '3e5c5e20d9e8741faa08be4360cb7f79498f87b6:benchmarks/LFEA/BM4/BM4 accdb.zip';
const M038_BOURDON_DISCLOSURE = 'ACCDB CASE19=W+P1 and CASE20=W+T1+P1; user-confirmed ACCDB Bourdon=yes. First qualification applies translational Bourdon only to non-rigid straight spans and bend incoming straights; bend-arc opening/translation and rigid-body pressure strain remain blocked.';
const M038_FRICTION_DISCLOSURE = 'BM4 InputXML +Y shoes carry FRIC_COEF=0.3. Node-level qualification uses CAESAR-style friction stiffness in sticking directions and Coulomb-capped nodal force after slip, with the solved +Y normal reaction and the default 1,000,000 lb/in friction stiffness converted to SI.';
const CAESAR_FRICTION_STIFFNESS = 175126835.24647635;
const FRICTION_FORCE_TOLERANCE = 0.5;
const FRICTION_STATE_TOLERANCE = 1;
const FRICTION_MAX_ITERATIONS = 24;
const FRICTION_RELAXATION = 0.7;
const FRICTION_DISPLACEMENT_FLOOR = 1e-12;

function mapNodeId(nodeId) {
  return String(nodeId).replace(/^BM4\.N/u, NODE_PREFIX);
}

export function buildM035M036Inventory(authorities) {
  const source = buildM036Bm4Inventory(authorities.base);
  return Object.freeze({
    base: Object.freeze(source.base.map((row) => Object.freeze({ ...row, nodeId: mapNodeId(row.nodeId) }))),
    unilateral: Object.freeze(source.unilateral.map((row) => Object.freeze({ ...row, nodeId: mapNodeId(row.nodeId) }))),
    gappedGuideEvidence: source.gappedGuideEvidence,
  });
}

function point(geometry, nodeId) {
  const row = geometry.nodes.find((candidate) => String(candidate.id) === String(nodeId));
  if (!row) throw new Error(`M035+M036 node ${nodeId} is missing.`);
  return [row.x, row.y, row.z];
}

function addOffset(value, offset) {
  if (!offset) return value;
  return [value[0] + offset.x, value[1] + offset.y, value[2] + offset.z];
}

function resolveEntryAxes(authorities, entry) {
  const rawI = point(authorities.analysisGeometry, entry.segment.startNodeId);
  const rawJ = point(authorities.analysisGeometry, entry.segment.endNodeId);
  return resolveFrameLocalAxes({
    nodeI: addOffset(rawI, entry.teeModifier?.rigidOffsets?.I),
    nodeJ: addOffset(rawJ, entry.teeModifier?.rigidOffsets?.J),
    referenceVector: entry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  });
}

function compileModel(authorities, constraints) {
  const localAxisResults = authorities.entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveEntryAxes(authorities, entry),
  }));
  const sections = new Map(authorities.entries.map((entry) => [entry.analysisSection.semanticHash, entry.analysisSection]));
  return compileMechanicalModel({
    modelIdentity: 'BM4-LIVE-INPUTXML-M035-M036',
    modelRevision: 1,
    sourceSemanticHash: authorities.source.semanticHash,
    conditionedTopology: authorities.conditioned,
    nodeBindings: authorities.analysisGeometry.nodes.map((node) => ({
      nodeId: `${NODE_PREFIX}${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: String(node.id),
    })),
    elementBindings: authorities.entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: String(entry.segment.id),
      topologySegmentId: String(entry.segment.id),
      materialStateId: authorities.material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.bendComponent?.componentId
        ?? entry.sourceEntry.rigidAuthority?.rigidElementId
        ?? entry.sourceEntry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [authorities.material],
    sectionResolutions: [...sections.values()],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraints,
    profile: compilerProfile(),
  });
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = analysis.pipeDensity * section.sectionState.area * GRAVITY;
  const contents = (analysis.fluidDensity ?? 0) * Math.PI * section.dimensions.innerDiameter ** 2 / 4 * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  return pipe + contents + (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
}

function bourdonEligible(entry) {
  return entry.bendComponent === null && entry.sourceEntry.rigidAuthority === null;
}

function closedEndPipeBourdonAxialStrain(authorities, entry, pressure) {
  const physical = entry.sourceEntry.physicalSection.dimensions;
  const outerDiameter = physical.outerDiameter;
  const innerDiameter = physical.innerDiameter;
  const elasticModulus = authorities.material.materialState.elasticModulus;
  const poissonRatio = entry.sourceEntry.sourceSegment.meta.analysis.poissonRatio;
  const denominator = elasticModulus * (outerDiameter ** 2 - innerDiameter ** 2);
  if (!(pressure > 0) || !(denominator > 0) || !Number.isFinite(poissonRatio)) return 0;
  return (1 - 2 * poissonRatio) * pressure * innerDiameter ** 2 / denominator;
}

function compileCase(authorities, compilation, label, thermal, movements, frictionLoads) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceEntry.sourceSegment.meta.analysis;
    const lineWeight = entry.sourceEntry.rigidAuthority
      ? entry.sourceEntry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry.sourceEntry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD', elementId: entry.elementId, basis: 'GLOBAL', variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 }, endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-M036-WEIGHT`, sourceRevision: `${entry.sourceSegmentId}:${lineWeight}` }),
    });
    if (analysis.pressure > 0) primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `${label}-PRESSURE-${entry.elementId}`,
      kind: 'PRESSURE', elementId: entry.elementId, pressure: analysis.pressure, pressureBasis: 'GAUGE',
      authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: bourdonEligible(entry) },
      sourceEvidence: sourceEvidence({
        sourceId: `${BM4_SOURCE_ID}-M038-ACCDB-BOURDON`,
        sourceRevision: `${M038_ACCDB_SOURCE}:${entry.sourceSegmentId}:${analysis.pressure}:${bourdonEligible(entry) ? 'TRANSLATION' : 'BLOCKED'}`,
      }),
    });
    if (thermal) primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `${label}-TEMP-${entry.elementId}`,
      kind: 'TEMPERATURE', elementId: entry.elementId, operatingTemperature: analysis.operatingTemperature,
      installationTemperature: INSTALLATION_TEMPERATURE,
      stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
      thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-M036-TEMP`, sourceRevision: `${entry.sourceSegmentId}:${analysis.operatingTemperature}` }),
    });
  }
  for (const movement of movements) primitives.push({
    schema: 'fea-linear-load-primitive/v1', primitiveId: `${label}-CONTACT-${movement.prescribedSlotId}`,
    kind: 'PRESCRIBED_MOVEMENT', prescribedSlotId: movement.prescribedSlotId,
    nodeId: movement.nodeId, dof: movement.dof, value: movement.value,
    sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-M036-CONTACT`, sourceRevision: `${movement.prescribedSlotId}:${movement.value}` }),
  });
  for (const friction of frictionLoads) primitives.push({
    schema: 'fea-linear-load-primitive/v1', primitiveId: `${label}-FRICTION-${friction.supportId}`,
    kind: 'NODAL_FORCE_MOMENT', nodeId: friction.nodeId, basis: { kind: 'GLOBAL' },
    force: { fx: friction.fx, fy: 0, fz: friction.fz }, moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' }, signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: sourceEvidence({
      sourceId: `${BM4_SOURCE_ID}-M038-FRICTION`,
      sourceRevision: `${M038_ACCDB_SOURCE}:${friction.supportId}:mu=${friction.mu}:fx=${friction.fx}:fz=${friction.fz}:k=${CAESAR_FRICTION_STIFFNESS}`,
    }),
  });
  return compilePhysicalLoadCase({
    loadCaseId: label,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `M038 ACCDB-authorized P1 Bourdon translation plus node-level Coulomb support friction. ${M038_FRICTION_DISCLOSURE}` },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function loadElements(authorities, loadCase) {
  const distributed = new Map(loadCase.primitives.filter((row) => row.kind === 'DISTRIBUTED_LOAD').map((row) => [row.elementId, row]));
  const temperatures = new Map(loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]));
  const pressures = new Map(loadCase.primitives.filter((row) => row.kind === 'PRESSURE').map((row) => [row.elementId, row]));
  const frames = authorities.entries.filter((entry) => !entry.bendComponent).map((entry) => {
    const baseFrame = compileFrameElement({
      elementId: entry.elementId, material: authorities.material, section: entry.analysisSection,
      localAxes: { result: resolveEntryAxes(authorities, entry), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: authorities.frameProfile, distributedLoads: [distributed.get(entry.elementId)],
      temperature: temperatures.get(entry.elementId) ?? null, releases: [],
      endSprings: entry.teeModifier?.endSprings ?? [], rigidOffsets: entry.teeModifier?.rigidOffsets ?? null,
    });
    const pressure = pressures.get(entry.elementId);
    if (!pressure?.authorizedEffects?.bourdon) return baseFrame;
    const axialStrain = closedEndPipeBourdonAxialStrain(authorities, entry, pressure.pressure);
    return augmentFrameElementUniformAxialInitialStrain({
      frame: baseFrame,
      profile: authorities.frameProfile,
      primitive: pressure,
      axialStrain,
      disclosure: M038_BOURDON_DISCLOSURE,
    });
  });
  const components = authorities.bendExpansion.components.map((component) => {
    const elements = component.elements.map((componentElement) => {
      const entry = authorities.entryByElementId.get(componentElement.elementId);
      const frameElement = compileFrameElement({
        elementId: componentElement.elementId, material: authorities.material, section: entry.analysisSection,
        localAxes: { result: resolveEntryAxes(authorities, entry), profile: FRAME_LOCAL_AXIS_PROFILE },
        profile: authorities.frameProfile, distributedLoads: [distributed.get(componentElement.elementId)],
        temperature: temperatures.get(componentElement.elementId) ?? null, releases: [], endSprings: [], rigidOffsets: null,
      });
      return Object.freeze({ ...componentElement, frameElement });
    });
    const draft = { ...component, elements, semanticHash: '' };
    draft.semanticHash = computePipingComponentSemanticHash(draft);
    return requirePipingComponent(draft);
  });
  return { frames, components };
}

function frictionSupports(authorities) {
  const supports = [];
  for (const node of authorities.sourceGeometry.nodes) {
    const restraints = node.meta?.restraints ?? [];
    restraints.forEach((restraint, index) => {
      const mu = restraint.frictionCoefficient ?? 0;
      if (String(restraint.typeCode) !== '14' || !(mu > 0)) return;
      supports.push(Object.freeze({
        supportId: `${node.id}-PLUS-Y-${index + 1}`,
        nodeId: `${NODE_PREFIX}${node.id}`,
        sourceNodeId: String(node.id),
        mu,
      }));
    });
  }
  return Object.freeze(supports.sort((left, right) => left.supportId.localeCompare(right.supportId)));
}

function executionValue(entries, nodeId, dof) {
  return entries.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}

function activeNormalSupports(authorities, constraints) {
  const restrainedUy = new Set(constraints
    .filter((row) => row.nodeId && row.dof === 'UY')
    .map((row) => row.nodeId));
  return frictionSupports(authorities).filter((support) => restrainedUy.has(support.nodeId));
}

function constrainedTangentialDofs(constraints) {
  return new Set(constraints
    .filter((row) => row.nodeId && (row.dof === 'UX' || row.dof === 'UZ'))
    .map((row) => `${row.nodeId}:${row.dof}`));
}

function prescribedTangentialValues(movements) {
  return new Map(movements
    .filter((row) => row.dof === 'UX' || row.dof === 'UZ')
    .map((row) => [`${row.nodeId}:${row.dof}`, row.value]));
}

function initialFrictionStates(authorities, constraints, movements) {
  const constrained = constrainedTangentialDofs(constraints);
  const prescribed = prescribedTangentialValues(movements);
  return activeNormalSupports(authorities, constraints).map((support) => {
    const uxKey = `${support.nodeId}:UX`;
    const uzKey = `${support.nodeId}:UZ`;
    const forcedSlip = Math.hypot(prescribed.get(uxKey) ?? 0, prescribed.get(uzKey) ?? 0) > FRICTION_DISPLACEMENT_FLOOR;
    return Object.freeze({
      ...support,
      freeX: !constrained.has(uxKey),
      freeZ: !constrained.has(uzKey),
      regime: forcedSlip ? 'SLIDING' : 'STICKING',
      fx: 0,
      fz: 0,
    });
  });
}

function frictionSpringDeclarations(states) {
  return states.flatMap((state) => {
    if (state.regime !== 'STICKING') return [];
    const declarations = [];
    if (state.freeX) declarations.push({
      declarationId: `BM4-FRICTION-${state.supportId}-UX`,
      kind: 'PARTIAL_RELEASE_SPRING',
      nodeId: state.nodeId,
      dof: 'UX',
      stiffness: CAESAR_FRICTION_STIFFNESS,
    });
    if (state.freeZ) declarations.push({
      declarationId: `BM4-FRICTION-${state.supportId}-UZ`,
      kind: 'PARTIAL_RELEASE_SPRING',
      nodeId: state.nodeId,
      dof: 'UZ',
      stiffness: CAESAR_FRICTION_STIFFNESS,
    });
    return declarations;
  });
}

function slidingFrictionLoads(states) {
  return states
    .filter((state) => state.regime === 'SLIDING' && (Math.abs(state.fx) > 0 || Math.abs(state.fz) > 0))
    .map((state) => Object.freeze(state));
}

function targetFrictionState(state, execution) {
  const normalReaction = Math.max(0, executionValue(execution.reactions, state.nodeId, 'UY'));
  const ux = executionValue(execution.displacement, state.nodeId, 'UX');
  const uz = executionValue(execution.displacement, state.nodeId, 'UZ');
  const slipMagnitude = Math.hypot(ux, uz);
  const trialMagnitude = CAESAR_FRICTION_STIFFNESS * slipMagnitude;
  const coulombLimit = state.mu * normalReaction;
  const shouldSlide = trialMagnitude > coulombLimit + FRICTION_STATE_TOLERANCE;

  if (!shouldSlide || slipMagnitude <= FRICTION_DISPLACEMENT_FLOOR || coulombLimit <= 0) {
    return Object.freeze({
      ...state,
      regime: 'STICKING',
      fx: 0,
      fz: 0,
      normalReaction,
      coulombLimit,
      slipMagnitude,
      trialMagnitude,
    });
  }

  const targetFx = -coulombLimit * ux / slipMagnitude;
  const targetFz = -coulombLimit * uz / slipMagnitude;
  const fx = state.regime === 'SLIDING'
    ? state.fx + FRICTION_RELAXATION * (targetFx - state.fx)
    : targetFx;
  const fz = state.regime === 'SLIDING'
    ? state.fz + FRICTION_RELAXATION * (targetFz - state.fz)
    : targetFz;
  return Object.freeze({
    ...state,
    regime: 'SLIDING',
    fx,
    fz,
    targetFx,
    targetFz,
    normalReaction,
    coulombLimit,
    slipMagnitude,
    trialMagnitude,
  });
}

function frictionConvergence(previous, next) {
  let stateChanges = 0;
  let forceResidual = 0;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index].regime !== next[index].regime) stateChanges += 1;
    if (next[index].regime === 'SLIDING') {
      forceResidual = Math.max(
        forceResidual,
        Math.abs((next[index].targetFx ?? next[index].fx) - next[index].fx),
        Math.abs((next[index].targetFz ?? next[index].fz) - next[index].fz),
      );
    }
  }
  return { stateChanges, forceResidual };
}

export function analyseM035M036Case(
  authorities,
  constraints,
  label,
  thermal,
  movements = [],
  frictionLoads = [],
  recover = true,
) {
  const compilation = compileModel(authorities, constraints);
  const loadCase = compileCase(authorities, compilation, label, thermal, movements, frictionLoads);
  const { frames, components } = loadElements(authorities, loadCase);
  const execution = compileSolverExecution({
    compilation,
    elementContributions: [
      ...frames.map(elementContributionFromFrameElement),
      ...components.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = recover
    ? compileResultRecovery({
      compilation, execution, loadCase, frameElements: frames, pipingComponents: components,
      recoveryProfile: recoveryProfile({ recoverComponentCodePoints: false }),
    })
    : null;
  return Object.freeze({ compilation, loadCase, execution, recovery, frames, pipingComponents: components });
}

function analyseM038FrictionCase(authorities, constraints, label, thermal, movements = [], recover = true) {
  let states = initialFrictionStates(authorities, constraints, movements);
  let lastConvergence = { stateChanges: Number.POSITIVE_INFINITY, forceResidual: Number.POSITIVE_INFINITY };

  for (let iteration = 0; iteration < FRICTION_MAX_ITERATIONS; iteration += 1) {
    const springConstraints = frictionSpringDeclarations(states);
    const frictionLoads = slidingFrictionLoads(states);
    const raw = analyseM035M036Case(
      authorities,
      [...constraints, ...springConstraints],
      label,
      thermal,
      movements,
      frictionLoads,
      false,
    );
    const next = states.map((state) => targetFrictionState(state, raw.execution));
    lastConvergence = frictionConvergence(states, next);

    if (lastConvergence.stateChanges === 0 && lastConvergence.forceResidual <= FRICTION_FORCE_TOLERANCE) {
      const finalSpringConstraints = frictionSpringDeclarations(next);
      const finalFrictionLoads = slidingFrictionLoads(next);
      const analysis = analyseM035M036Case(
        authorities,
        [...constraints, ...finalSpringConstraints],
        label,
        thermal,
        movements,
        finalFrictionLoads,
        recover,
      );
      return Object.freeze({
        ...analysis,
        frictionEvidence: Object.freeze({
          disclosure: M038_FRICTION_DISCLOSURE,
          iterationCount: iteration + 1,
          stateChanges: lastConvergence.stateChanges,
          forceResidual: lastConvergence.forceResidual,
          stiffness: CAESAR_FRICTION_STIFFNESS,
          states: next,
        }),
      });
    }
    states = next;
  }
  throw new Error(`${label} Coulomb friction active set did not converge; stateChanges=${lastConvergence.stateChanges}; forceResidual=${lastConvergence.forceResidual}.`);
}

function finalAnalysis(authorities, inventory, run, label, thermal) {
  const state = new Map(run.convergedState.map((row) => [row.declarationId, row.status]));
  const active = run.unilateral.filter((row) => state.get(row.declarationId) === 'ENGAGED');
  const analysis = analyseM038FrictionCase(
    authorities,
    [...inventory.base, ...active.map((row) => row.constraintDeclaration)],
    label,
    thermal,
    active.map((row) => row.prescribedMovement).filter((row) => row !== null),
    true,
  );
  if (analysis.execution.semanticHash !== run.finalExecutionHash) throw new Error(`${label} combined final execution hash drift.`);
  return analysis;
}

export function solveBm4M035M036Combined() {
  const authorities = buildBm4M035FeatureAuthorities();
  const inventory = buildM035M036Inventory(authorities);
  const solveState = (label, thermal, unilateral = inventory.unilateral) => compileUnilateralSolverExecution({
    baseDeclarations: inventory.base,
    unilateral,
    buildAndSolve: (constraints, active) => analyseM038FrictionCase(
      authorities,
      constraints,
      label,
      thermal,
      active.prescribedMovements,
      false,
    ).execution,
  });
  const sustainedRun = solveState('BM4-M035-M036-SUS', false);
  const operatingRun = solveState('BM4-M035-M036-OPE', true);
  const sustained = finalAnalysis(authorities, inventory, sustainedRun, 'BM4-M035-M036-SUS', false);
  const operating = finalAnalysis(authorities, inventory, operatingRun, 'BM4-M035-M036-OPE', true);
  return Object.freeze({ authorities, inventory, sustainedRun, operatingRun, sustained, operating });
}

export function reactionUy(execution, sourceNodeId) {
  return execution.reactions.find((row) => row.nodeId === `${NODE_PREFIX}${sourceNodeId}` && row.dof === 'UY')?.value ?? 0;
}

export function releasedTargetIds(run, targetIds) {
  const targets = new Set(targetIds);
  return run.convergedState
    .filter((row) => row.status === 'RELEASED' && targets.has(row.nodeId.replace(NODE_PREFIX, '')))
    .map((row) => row.nodeId.replace(NODE_PREFIX, '')).sort();
}
