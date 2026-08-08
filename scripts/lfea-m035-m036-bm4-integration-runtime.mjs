import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
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
import { bm4BaseWForcmntPrimitives } from './lfea-m038-bm4-forcmnt-authority.mjs';

const NODE_PREFIX = 'BM4M035.N';

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

function compileCase(authorities, compilation, label, thermal, movements) {
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
      authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-M036-PRESSURE`, sourceRevision: `${entry.sourceSegmentId}:${analysis.pressure}` }),
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
  primitives.push(...bm4BaseWForcmntPrimitives({
    baseEntries: authorities.base.entries,
    loadCaseId: label,
    nodeIdPrefix: NODE_PREFIX,
    sourceEvidence,
  }));
  for (const movement of movements) primitives.push({
    schema: 'fea-linear-load-primitive/v1', primitiveId: `${label}-CONTACT-${movement.prescribedSlotId}`,
    kind: 'PRESCRIBED_MOVEMENT', prescribedSlotId: movement.prescribedSlotId,
    nodeId: movement.nodeId, dof: movement.dof, value: movement.value,
    sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-M036-CONTACT`, sourceRevision: `${movement.prescribedSlotId}:${movement.value}` }),
  });
  return compilePhysicalLoadCase({
    loadCaseId: label,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: 'M038 BM4 feature/contact mechanics with ACCDB-qualified base-W FORCE/MOMENT membership.' },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function loadElements(authorities, loadCase) {
  const distributed = new Map(loadCase.primitives.filter((row) => row.kind === 'DISTRIBUTED_LOAD').map((row) => [row.elementId, row]));
  const temperatures = new Map(loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]));
  const frames = authorities.entries.filter((entry) => !entry.bendComponent).map((entry) => compileFrameElement({
    elementId: entry.elementId, material: authorities.material, section: entry.analysisSection,
    localAxes: { result: resolveEntryAxes(authorities, entry), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile: authorities.frameProfile, distributedLoads: [distributed.get(entry.elementId)],
    temperature: temperatures.get(entry.elementId) ?? null, releases: [],
    endSprings: entry.teeModifier?.endSprings ?? [], rigidOffsets: entry.teeModifier?.rigidOffsets ?? null,
  }));
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

export function analyseM035M036Case(authorities, constraints, label, thermal, movements = []) {
  const compilation = compileModel(authorities, constraints);
  const loadCase = compileCase(authorities, compilation, label, thermal, movements);
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
  const recovery = compileResultRecovery({
    compilation, execution, loadCase, frameElements: frames, pipingComponents: components,
    recoveryProfile: recoveryProfile({ recoverComponentCodePoints: false }),
  });
  return Object.freeze({ compilation, loadCase, execution, recovery, frames, pipingComponents: components });
}

function finalAnalysis(authorities, inventory, run, label, thermal) {
  const state = new Map(run.convergedState.map((row) => [row.declarationId, row.status]));
  const active = run.unilateral.filter((row) => state.get(row.declarationId) === 'ENGAGED');
  const analysis = analyseM035M036Case(
    authorities,
    [...inventory.base, ...active.map((row) => row.constraintDeclaration)],
    label,
    thermal,
    active.map((row) => row.prescribedMovement).filter((row) => row !== null),
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
    buildAndSolve: (constraints, active) => analyseM035M036Case(authorities, constraints, label, thermal, active.prescribedMovements).execution,
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
