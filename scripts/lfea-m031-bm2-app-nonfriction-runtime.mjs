import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  deriveLinearPipingParentSet,
  LINEAR_PIPING_ANALYSIS_REQUEST_SCHEMA,
  runLinearPipingAnalysis,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  BM2_SOURCE_ID,
  buildBm2SolveAuthorities,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  sourceEvidence,
} from './lfea-b3.26-bm2-solve-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const BM2_APP_NONFRICTION_CASES = Object.freeze({
  OPE: Object.freeze({ caseNumber: 3, formula: 'W+T1+P1', activeContact: 'PLUS_Z', thermal: true }),
  SUS: Object.freeze({ caseNumber: 4, formula: 'W+P1', activeContact: 'PLUS_Y', thermal: false }),
  EXP: Object.freeze({ caseNumber: 6, formula: 'L6=L3-L4', activeContact: 'DERIVED_OPE_MINUS_SUS_NOT_REITERATED' }),
});

const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const APP_SOLVER_PROFILE = Object.freeze({
  backend: 'FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1',
  nearZeroPivotTolerance: Object.freeze({ value: 1e-12, source: 'M031 BM2 app benchmark; no regularization' }),
  conditionWarning: Object.freeze({ value: 1e14, source: 'M031 BM2 app benchmark warning threshold' }),
  conditionBlock: Object.freeze({ value: 1e18, source: 'M031 BM2 app benchmark block threshold' }),
});

function compareIds(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
  return String(left).localeCompare(String(right));
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM2 app benchmark node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function dominantGuideDof(restraint) {
  const direction = [
    Math.abs(restraint.xCosine ?? 0),
    Math.abs(restraint.yCosine ?? 0),
    Math.abs(restraint.zCosine ?? 0),
  ];
  const maximum = Math.max(...direction);
  if (!(maximum > 0)) throw new Error('BM2 app guide restraint has no non-zero direction cosine.');
  return ['UX', 'UY', 'UZ'][direction.indexOf(maximum)];
}

function contactConstraints(geometry, activeContact) {
  if (!['PLUS_Y', 'PLUS_Z'].includes(activeContact)) {
    throw new Error(`Unsupported BM2 app active contact ${activeContact}.`);
  }
  const rows = new Map();
  const add = (nodeId, dof, reason) => rows.set(`${nodeId}:${dof}`, Object.freeze({
    declarationId: `BM2-APP-${activeContact}-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `BM2.N${nodeId}`,
    dof,
    behavior: 'FIXED',
  }));
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      DOFS.forEach((dof) => add(node.id, dof, 'ANCHOR'));
    }
    for (const restraint of node.meta?.restraints ?? []) {
      const typeCode = String(restraint.typeCode);
      if (typeCode === '14' && activeContact === 'PLUS_Y') add(node.id, 'UY', 'PLUS-Y-ACTIVE');
      if (typeCode === '15' && activeContact === 'PLUS_Z') add(node.id, 'UZ', 'PLUS-Z-ACTIVE');
      if (typeCode === '9') add(node.id, dominantGuideDof(restraint), 'GUIDE');
    }
  }
  return Object.freeze([...rows.values()].sort((left, right) => compareIds(left.nodeId, right.nodeId)
    || DOFS.indexOf(left.dof) - DOFS.indexOf(right.dof)));
}

function compileContactModel(authorities, activeContact) {
  const geometry = authorities.normalized.geometry;
  const localAxisResults = authorities.entries.map((entry) => ({
    evidenceIdentity: `APP-AXIS-${activeContact}-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const sectionResolutions = new Map();
  authorities.entries.forEach((entry) => sectionResolutions.set(
    entry.analysisSection.semanticHash,
    entry.analysisSection,
  ));
  return compileMechanicalModel({
    modelIdentity: `BM2-APP-NONFRICTION-${activeContact}`,
    modelRevision: 1,
    sourceSemanticHash: authorities.source.semanticHash,
    conditionedTopology: authorities.conditioned,
    nodeBindings: geometry.nodes.map((node) => ({
      nodeId: `BM2.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: authorities.entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.sourceSegment.id,
      topologySegmentId: entry.sourceSegment.id,
      materialStateId: authorities.material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `APP-AXIS-${activeContact}-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId ?? entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [authorities.material],
    sectionResolutions: [...sectionResolutions.values()],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: contactConstraints(geometry, activeContact),
    profile: compilerProfile(),
  });
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

function compileCase(authorities, compilation, label, thermal) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority
      ? entry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `BM2-APP-${label}-WEIGHT-${entry.elementId}`,
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
      }),
    });
    if ((analysis.pressure ?? 0) > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-APP-${label}-PRESSURE-${entry.elementId}`,
        kind: 'PRESSURE',
        elementId: entry.elementId,
        pressure: analysis.pressure,
        pressureBasis: 'GAUGE',
        authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
        sourceEvidence: sourceEvidence({
          sourceId: `${BM2_SOURCE_ID}-PRESSURE1`,
          sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}`,
        }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-APP-${label}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({
          sourceId: `${BM2_SOURCE_ID}-TEMP-CASE-1`,
          sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}`,
        }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId: `BM2-APP-${label}`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `BM2 production-app non-friction ${label}.` },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile({
      gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' },
    }),
  });
}

function compileFrames(authorities, loadCase) {
  const distributedByElement = new Map();
  const temperatureByElement = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributedByElement.has(primitive.elementId)) distributedByElement.set(primitive.elementId, []);
      distributedByElement.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') temperatureByElement.set(primitive.elementId, primitive);
  }
  return Object.freeze(authorities.entries.map((entry) => compileFrameElement({
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
  })));
}

function solvePhysicalCase(authorities, label) {
  const authority = BM2_APP_NONFRICTION_CASES[label];
  const compilation = compileContactModel(authorities, authority.activeContact);
  const loadCase = compileCase(authorities, compilation, label, authority.thermal);
  const frameElements = compileFrames(authorities, loadCase);
  const parent = {
    compilation,
    loadCase,
    frameElements,
    pipingComponents: [],
    solverProfile: solverProfile(APP_SOLVER_PROFILE),
    recoveryProfile: recoveryProfile(),
  };
  const result = runLinearPipingAnalysis({
    schema: LINEAR_PIPING_ANALYSIS_REQUEST_SCHEMA,
    analysisIdentity: `BM2-APP-NONFRICTION-${label}`,
    analysisRevision: 1,
    ...parent,
    expectedParents: deriveLinearPipingParentSet(parent),
  }, { factorizationCache: new Map() });
  return Object.freeze({ authority, compilation, loadCase, frameElements, result });
}

function valueAt(rows, nodeId, dof) {
  return rows.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}

function nodalCaseResult(caseResult, sourceNodeId) {
  const nodeId = `BM2.N${sourceNodeId}`;
  return Object.freeze({
    displacement: Object.freeze(Object.fromEntries(DOFS.map((dof) => [
      dof,
      valueAt(caseResult.result.execution.displacement, nodeId, dof),
    ]))),
    reaction: Object.freeze(Object.fromEntries(DOFS.map((dof) => [
      dof,
      -valueAt(caseResult.result.execution.reactions, nodeId, dof),
    ]))),
  });
}

function subtractVectors(left, right) {
  return Object.freeze(Object.fromEntries(DOFS.map((dof) => [dof, left[dof] - right[dof]])));
}

function reportNode(authorities, operating, sustained, node) {
  const ope = nodalCaseResult(operating, node.id);
  const sus = nodalCaseResult(sustained, node.id);
  return Object.freeze({
    sourceNodeId: node.id,
    kernelNodeId: `BM2.N${node.id}`,
    restraint: node.restraint,
    sourceRestraints: node.meta?.restraints ?? [],
    position: Object.freeze({ x: node.x, y: node.y, z: node.z }),
    OPE: ope,
    SUS: sus,
    EXP: Object.freeze({
      displacement: subtractVectors(ope.displacement, sus.displacement),
      reaction: subtractVectors(ope.reaction, sus.reaction),
    }),
  });
}

export function solveBm2AppNonfrictionCases() {
  const authorities = buildBm2SolveAuthorities();
  const operating = solvePhysicalCase(authorities, 'OPE');
  const sustained = solvePhysicalCase(authorities, 'SUS');
  const actionByCase = Object.freeze({
    OPE: new Map(operating.result.recovery.elementActions.map((row) => [row.elementId, row])),
    SUS: new Map(sustained.result.recovery.elementActions.map((row) => [row.elementId, row])),
  });
  return Object.freeze({
    schema: 'bm2-app-nonfriction-solve/v1',
    solverPath: 'PRODUCTION_RUN_LINEAR_PIPING_ANALYSIS',
    caseAuthority: BM2_APP_NONFRICTION_CASES,
    authorities,
    physicalCases: Object.freeze({ OPE: operating, SUS: sustained }),
    nodes: Object.freeze(authorities.normalized.geometry.nodes
      .map((node) => reportNode(authorities, operating, sustained, node))
      .sort((left, right) => compareIds(left.sourceNodeId, right.sourceNodeId))),
    elements: Object.freeze(authorities.entries.map((entry) => Object.freeze({
      sourceElementId: entry.sourceSegment.id,
      kernelElementId: entry.elementId,
      fromNode: entry.sourceSegment.startNodeId,
      toNode: entry.sourceSegment.endNodeId,
      bendTagged: entry.sourceSegment.meta.bendDeclaredRadius != null,
      rigid: entry.rigidAuthority !== null,
      sourceAnalysis: entry.sourceSegment.meta.analysis,
      actions: Object.freeze({
        OPE: actionByCase.OPE.get(entry.elementId),
        SUS: actionByCase.SUS.get(entry.elementId),
      }),
    }))),
    limitations: Object.freeze([
      Object.freeze({
        code: 'APP_SOURCE_SPAN_GEOMETRY_ONLY',
        cause: 'The production application currently retains source PIPINGELEMENT spans; generated bend and junction stations are not emitted by this path.',
      }),
      Object.freeze({
        code: 'APP_CODE_RESULTS_UNAVAILABLE',
        cause: 'runLinearPipingAnalysis currently returns codeResults=null and no component resultants for BM2.',
      }),
    ]),
  });
}
