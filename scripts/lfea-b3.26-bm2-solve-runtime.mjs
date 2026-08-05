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
  BM2_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  buildBm2SolveAuthorities,
  sourceEvidence,
} from './lfea-b3.26-bm2-solve-fixtures.mjs';

export const BM2_SOLVER_CONDITIONING_PROFILE = Object.freeze({
  backend: 'FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1',
  nearZeroPivotTolerance: Object.freeze({
    value: 1e-12,
    source: 'M027 BM2 real-model conditioning study; default 1e-6 blocked a connected model at BM2.N300:UX',
  }),
  conditionWarning: Object.freeze({
    value: 1e14,
    source: 'M027 BM2 real-model conditioning study',
  }),
  conditionBlock: Object.freeze({
    value: 1e18,
    source: 'M027 BM2 real-model conditioning study; no stiffness regularization is applied',
  }),
});

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM2 node ${nodeId} is missing.`);
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
      primitiveId: `BM2-${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({
        sourceId: entry.rigidAuthority ? `${BM2_SOURCE_ID}-RIGID-WEIGHT` : `${BM2_SOURCE_ID}-PHYSICAL-WEIGHT`,
        sourceRevision: `${entry.sourceSegment.id}:${lineWeight}`,
        rigidAuthorityHash: entry.rigidAuthority?.semanticHash ?? null,
      }),
    });
    if ((analysis.pressure ?? 0) > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-${label}-PRESSURE-${entry.elementId}`,
        kind: 'PRESSURE',
        elementId: entry.elementId,
        pressure: analysis.pressure,
        pressureBasis: 'GAUGE',
        authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
        sourceEvidence: sourceEvidence({ sourceId: `${BM2_SOURCE_ID}-PRESSURE1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}` }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-${label}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({ sourceId: `${BM2_SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}` }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId: `BM2-${label}`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `M027 BM2 ${label} first production-pipeline solve.` },
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
    solverProfile: solverProfile(BM2_SOLVER_CONDITIONING_PROFILE),
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
    schema: 'm027-bm2-first-solve-report/v1',
    sourceSemanticHash: authorities.source.semanticHash,
    solverConditioningProfile: BM2_SOLVER_CONDITIONING_PROFILE,
    counts: {
      sourceNodes: authorities.normalized.geometry.nodes.length,
      sourceElements: authorities.entries.length,
      rigidElements: authorities.entries.filter((row) => row.rigidAuthority).length,
      bendTaggedElements: authorities.entries.filter((row) => row.sourceSegment.meta.bendDeclaredRadius != null).length,
      reducerTaggedElements: 0,
    },
    limitations: [
      { code: 'BM2_BEND_CHORD_STIFFNESS_ONLY', cause: 'The first BM2 solve retains each InputXML PIPINGELEMENT as one straight frame chord; CAESAR internal bend stations and B31 bend flexibility are not yet applied.' },
      { code: 'BM2_UNKNOWN_RESTRAINT_TYPE_15_OMITTED', cause: 'Source restraint TYPE 18 mutates to 15 but remains UNKNOWN in the governed classification map and is omitted rather than guessed.' },
      { code: 'BM2_RESTRAINT_LINEARIZATION_AND_UNKNOWN_TYPE', cause: 'One-way and other nonlinear restraint semantics are reduced to the explicitly classified linear DOFs; unknown types are omitted.' },
      { code: 'BM2_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED', cause: 'Shared-node topology is retained, but branch-junction flexibility and code SIF evidence are not applied to stiffness in this first solve.' },
      { code: 'BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION', cause: 'Rigid-element body, fluid and insulation weight use the merged CAESAR rigid-element authority and a uniform consistent line load.' },
      { code: 'BM2_GLOBAL_STIFFNESS_INCOMPLETE_BEND_BRANCH_RESTRAINT_MODEL', cause: 'The global first-solve stiffness omits bend curvature/flexibility, branch flexibility and unclassified restraint behavior; these omissions affect response away from the local source feature.' },
      { code: 'BM2_SOLVER_CONDITIONING_PROFILE_STUDY', cause: 'The connected model requires a declared 1e-12 pivot tolerance and 1e18 condition block while retaining sparse LDLT, diagonal energy scaling and zero stiffness regularization.' },
      { code: 'BM2_NO_TRUE_REDUCER_TAG', cause: 'Input_BM2.xml contains no active REDUCER child tag; the ten-cylinder reducer candidate is not force-fit to branch diameter changes.' },
      { code: 'BM2_CODE_STRESS_DEFERRED', cause: 'This phase compares displacement, restraint and global/local force truth; piping-code stress comparison remains unclaimed.' },
    ],
    nodes: authorities.normalized.geometry.nodes.map((node) => ({
      sourceNodeId: node.id,
      kernelNodeId: `BM2.N${node.id}`,
      restraint: node.restraint,
      sourceRestraints: node.meta.restraints ?? [],
      position: { x: node.x, y: node.y, z: node.z },
      sustained: nodalResult(sustained, `BM2.N${node.id}`),
      operating: nodalResult(operating, `BM2.N${node.id}`),
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

export function solveBm2InputXmlConditioned() {
  const authorities = buildBm2SolveAuthorities();
  const sustained = analyse(authorities, 'SUS', false);
  const operating = analyse(authorities, 'OPE', true);
  return Object.freeze({
    ...authorities,
    sustained,
    operating,
    report: buildReport(authorities, sustained, operating),
  });
}
