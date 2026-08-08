import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE,
  BM4_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  buildBm4SolveAuthorities,
  sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM4 node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = (analysis.pipeDensity ?? 0) * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return pipe + contents + insulation;
}

function compileCase(authorities, label, thermal) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority
      ? entry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `BM4-${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({
        sourceId: entry.rigidAuthority ? `${BM4_SOURCE_ID}-RIGID-WEIGHT` : `${BM4_SOURCE_ID}-PHYSICAL-WEIGHT`,
        sourceRevision: `${entry.sourceSegment.id}:${lineWeight}`,
        rigidAuthorityHash: entry.rigidAuthority?.semanticHash ?? null,
      }),
    });
    if ((analysis.pressure ?? 0) > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM4-${label}-PRESSURE-${entry.elementId}`,
        kind: 'PRESSURE',
        elementId: entry.elementId,
        pressure: analysis.pressure,
        pressureBasis: 'GAUGE',
        authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
        sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-PRESSURE1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}` }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM4-${label}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}` }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId: `BM4-${label}`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `M034 BM4 ${label} first onboarding solve (CASE 19/20/21).` },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function analyse(authorities, label, thermal) {
  const loadCase = compileCase(authorities, label, thermal);
  const distributedByElement = new Map();
  const temperatureByElement = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributedByElement.has(primitive.elementId)) distributedByElement.set(primitive.elementId, []);
      distributedByElement.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') temperatureByElement.set(primitive.elementId, primitive);
  }
  const frameElements = authorities.entries.map((entry) => compileFrameElement({
    elementId: entry.elementId,
    material: authorities.material,
    section: entry.analysisSection,
    localAxes: {
      result: resolveFrameLocalAxes({
        nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId),
        nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
        referenceVector: entry.referenceVector,
        profile: FRAME_LOCAL_AXIS_PROFILE,
      }),
      profile: FRAME_LOCAL_AXIS_PROFILE,
    },
    profile: authorities.frameProfile,
    distributedLoads: distributedByElement.get(entry.elementId) ?? [],
    temperature: temperatureByElement.get(entry.elementId) ?? null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  }));
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: frameElements.map(elementContributionFromFrameElement),
    loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = compileResultRecovery({
    compilation: authorities.compilation,
    execution,
    loadCase,
    frameElements,
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  return Object.freeze({ loadCase, frameElements, execution, recovery });
}

function nodalResult(analysis, nodeId) {
  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
  return Object.freeze({
    displacement: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.displacement, dof)])),
    reaction: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.reactions, dof)])),
  });
}

function buildReport(authorities, sustained, operating) {
  return Object.freeze({
    schema: 'm034-bm4-first-solve-report/v1',
    sourceSemanticHash: authorities.source.semanticHash,
    solverConditioningProfile: BM4_SOLVER_CONDITIONING_PROFILE,
    counts: {
      sourceNodes: authorities.normalized.geometry.nodes.length,
      sourceElements: authorities.entries.length,
      rigidElements: authorities.entries.filter((row) => row.rigidAuthority).length,
      bendTaggedElements: authorities.entries.filter((row) => row.sourceSegment.meta.bendDeclaredRadius != null).length,
      reducerTaggedElements: 0,
    },
    limitations: [
      { code: 'BM4_BEND_CHORD_STIFFNESS_ONLY', cause: 'The first BM4 solve retains each InputXML PIPINGELEMENT as one straight frame chord; CAESAR internal bend stations and B31 bend flexibility are not yet applied.' },
      { code: 'BM4_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION', cause: 'Rigid-element body, fluid and insulation weight use the merged CAESAR rigid-element authority (#615) and a uniform consistent line load, for all 20 rigid elements (Flange/Flanged Valve/Unspecified).' },
      { code: 'BM4_NO_TRUE_REDUCER_CONDENSATION', cause: 'InputXML_BM4.xml has real inline diameter changes but no active REDUCER child tag drives the #618 ten-cylinder condensation candidate; reducers are passed through as plain chords in this first solve.' },
      { code: 'BM4_DECLARED_FORCES_NOT_APPLIED', cause: '12 declared FORCESMOMENTS entries are parsed and retained but not applied as external nodal loads; none of CASE 19/20/21\'s formulas (W+P1 / W+T1+P1) show a declared-force "+F" term, so this is not expected to be material to this comparison, but is not independently confirmed zero-effect.' },
      { code: 'BM4_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED', cause: 'Shared-node topology is retained, but branch-junction flexibility and code SIF evidence are not applied to stiffness in this first solve.' },
      { code: 'BM4_CODE_STRESS_DEFERRED', cause: 'This phase compares displacement, restraint and global/local force truth; piping-code stress comparison remains unclaimed.' },
    ],
    nodes: authorities.normalized.geometry.nodes.map((node) => ({
      sourceNodeId: node.id,
      kernelNodeId: `BM4.N${node.id}`,
      restraint: node.restraint,
      sourceRestraints: node.meta.restraints ?? [],
      position: { x: node.x, y: node.y, z: node.z },
      sustained: nodalResult(sustained, `BM4.N${node.id}`),
      operating: nodalResult(operating, `BM4.N${node.id}`),
    })),
    elements: authorities.entries.map((entry) => ({
      sourceElementId: entry.sourceSegment.id,
      kernelElementId: entry.elementId,
      fromNode: entry.sourceSegment.startNodeId,
      toNode: entry.sourceSegment.endNodeId,
      sourceType: entry.sourceSegment.type,
      bendTagged: entry.sourceSegment.meta.bendDeclaredRadius != null,
      rigid: entry.rigidAuthority !== null,
      rigidAuthority: entry.rigidAuthority,
      codeStressEligible: entry.rigidAuthority ? entry.rigidAuthority.structuralParticipation.calculatePipingCodeStress : true,
      sustained: sustained.recovery.elementActions.find((row) => row.elementId === entry.elementId),
      operating: operating.recovery.elementActions.find((row) => row.elementId === entry.elementId),
    })),
  });
}

export function solveBm4InputXmlConditioned() {
  const authorities = buildBm4SolveAuthorities();
  const sustained = analyse(authorities, 'SUS', false);
  const operating = analyse(authorities, 'OPE', true);
  return Object.freeze({
    ...authorities,
    sustained,
    operating,
    report: buildReport(authorities, sustained, operating),
  });
}
