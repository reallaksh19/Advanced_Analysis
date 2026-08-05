import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  conditionGeometry,
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  normalizeLinearPipingInputXmlGeometry,
  sealLinearPipingInputXmlSource,
  sealLinearPipingInputXmlUnitProfile,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { recoverProgrammedVariableSpringHangerAction } from '../src/core/linear-fea-variable-spring-hanger/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  RIGID_ELEMENT_REQUEST_SCHEMA,
  compileCaesarRigidElementAuthority,
  sealRigidElementRequest,
} from '../src/core/linear-fea-rigid-element/index.js';
import {
  REDUCER_CONDENSATION_REQUEST_SCHEMA,
  REDUCER_SAMPLING_RULE,
  compileTenCylinderReducerAuthority,
  sealReducerCondensationRequest,
} from '../src/core/linear-fea-reducer-condensation/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const BM3_INPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM3/BM3_InputXML.xml', import.meta.url));
export const BM3_SOURCE_ID = 'CAESAR-II-BM3-RELIEF-FLANGED';
export const INSTALLATION_TEMPERATURE = 293.15;
export const THERMAL_EXPANSION_COEFFICIENT = 1.17e-5;
export const GRAVITY = 9.80665;
export const CASE_KEYS = Object.freeze(['CASE3_OPE', 'CASE4_SUS', 'CASE5_OCC', 'CASE6_EXP', 'CASE7_EXP']);
export const BM3_BASE_CASES = Object.freeze({
  CASE3_OPE: Object.freeze({ temperatureField: 'operatingTemperature', thermal: true, formula: 'W+T1+P1+H' }),
  CASE4_SUS: Object.freeze({ temperatureField: 'operatingTemperature2', thermal: true, formula: 'W+T2+P1+H' }),
  CASE5_OCC: Object.freeze({ temperatureField: null, thermal: false, formula: 'W+P1+H+F1' }),
});
const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'M028 retains one analysis span per source span except the declared ten-cylinder reducer candidate.' },
  bendSeedingSegments: { value: 4, source: 'M028 compiles unresolved source bend chords as straight spans and discloses the limitation.' },
  bendLengthErrorLimit: { value: 0.01, source: 'M028 benchmark conditioning authority.' },
});

export function sourceEvidence(value) {
  return {
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    sourceSemanticHash: semanticHash(value),
  };
}

export function buildBm3Authorities({
  additionalConstraintDeclarations = [],
  modelIdentity = 'BM3-RELIEF-FLANGED-M028',
  modelRevision = 1,
} = {}) {
  const content = readFileSync(BM3_INPUT_PATH, 'utf8');
  const source = sealLinearPipingInputXmlSource({
    sourceId: BM3_SOURCE_ID,
    sourceRevision: semanticHash({ content }),
    fileName: 'benchmarks/LFEA/BM3/BM3_InputXML.xml',
    mediaType: 'application/xml',
    content,
  });
  const parsed = inputXmlToCanonicalGeometry(content, {
    unit: 'mm',
    source: BM3_SOURCE_ID,
    restraintTypeCodeMap: { 0: 'ANCHOR', 3: 'Y' },
    bendRadiusTolerance: 1e-6,
  });
  const unitProfile = sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: 'M028-BM3-INPUTXML-UNIT-R1',
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: ['mm'],
    sourceEvidence: {
      authority: 'CAESAR-II-INPUTXML-UNITS-BLOCK',
      documentId: 'BM3_InputXML.xml',
      revision: source.sourceRevision,
      sourceSemanticHash: source.semanticHash,
    },
    semanticHash: '',
  });
  const normalized = normalizeLinearPipingInputXmlGeometry(parsed, unitProfile);
  const material = materialAuthority(normalized.geometry, source);
  const frameProfile = eulerBernoulliProfile();
  const reducerDefinitions = buildReducerDefinitions(normalized.geometry, material, source);
  const rigidDefinitions = buildRigidDefinitions(normalized.geometry, material, source);
  const analysisGeometry = expandAnalysisGeometry(normalized.geometry, reducerDefinitions);
  const conditioned = conditionGeometry(analysisGeometry, [], CONDITIONING_PROFILE);
  const sectionRegistry = buildSectionRegistry({
    analysisGeometry,
    normalizedGeometry: normalized.geometry,
    material,
    source,
    reducerDefinitions,
    rigidDefinitions,
  });
  const kernelNodeByReference = new Map(analysisGeometry.nodes.map((node) => [node.id, `BM3.N${node.id}`]));
  const modelEntries = buildModelEntries({
    analysisGeometry,
    sourceGeometry: normalized.geometry,
    sectionRegistry,
    kernelNodeByReference,
    reducerDefinitions,
    rigidDefinitions,
  });
  const compilation = compileModel({
    source,
    conditioned,
    analysisGeometry,
    material,
    sectionRegistry,
    kernelNodeByReference,
    modelEntries,
    additionalConstraintDeclarations,
    modelIdentity,
    modelRevision,
  });
  return Object.freeze({
    content,
    source,
    parsed,
    normalized,
    material,
    frameProfile,
    reducerDefinitions,
    rigidDefinitions,
    analysisGeometry,
    conditioned,
    sectionRegistry,
    kernelNodeByReference,
    modelEntries,
    compilation,
  });
}

function materialAuthority(geometry, source) {
  const analyses = geometry.segments.map((segment) => segment.meta.analysis);
  const first = analyses[0];
  for (const row of analyses) {
    if (!(row.elasticModulus > 0) || !(row.pipeDensity > 0) || !(row.poissonRatio > 0)) {
      throw new Error('BM3 material stiffness and density must resolve on every segment.');
    }
    if (Math.abs(row.elasticModulus - first.elasticModulus) > first.elasticModulus * 1e-9
      || Math.abs(row.pipeDensity - first.pipeDensity) > first.pipeDensity * 1e-9
      || Math.abs(row.poissonRatio - first.poissonRatio) > 1e-12) {
      throw new Error('M028 requires one shared BM3 material stiffness state.');
    }
  }
  const evaluationTemperature = Math.max(...analyses.flatMap((row) => [row.operatingTemperature, row.operatingTemperature2].filter(Number.isFinite)));
  const pointValue = {
    absoluteTemperature: evaluationTemperature,
    elasticModulus: first.elasticModulus,
    shearModulus: first.elasticModulus / (2 * (1 + first.poissonRatio)),
    poissonRatio: first.poissonRatio,
    massDensity: first.pipeDensity,
    thermalExpansionCoefficient: THERMAL_EXPANSION_COEFFICIENT,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: 'BM3-INPUTXML-MATERIAL',
    sourceEvidence: sourceEvidence({
      sourceId: `${BM3_SOURCE_ID}-MATERIAL`,
      sourceRevision: source.sourceRevision,
      point: pointValue,
      installationTemperatureDisclosure: 'InputXML has no installation temperature or alpha; M028 declares 293.15 K and 1.17e-5 1/K explicitly.',
    }),
    points: [pointValue],
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: 'BM3-MAT-INPUTXML',
      materialId: table.materialId,
      evaluationTemperature,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

function buildRigidDefinitions(geometry, material, source) {
  const result = new Map();
  for (const segment of geometry.segments.filter((row) => row.meta.analysis.rigid)) {
    const analysis = segment.meta.analysis;
    const insideDiameter = segment.diameter - 2 * segment.thickness;
    const compileAt = (label, operatingTemperature) => compileCaesarRigidElementAuthority(sealRigidElementRequest({
      schema: RIGID_ELEMENT_REQUEST_SCHEMA,
      rigidElementId: `BM3-RIGID-${segment.id}-${label}`,
      length: segment.length,
      insideDiameter,
      enteredOutsideDiameter: segment.diameter,
      pipeWallThickness: segment.thickness,
      enteredRigidWeight: analysis.rigid.weight,
      fluidDensity: analysis.fluidDensity ?? 0,
      insulationThickness: analysis.insulationThickness ?? 0,
      insulationDensity: analysis.insulationDensity ?? 0,
      refractoryWeight: 0,
      claddingWeight: 0,
      gravityAcceleration: GRAVITY,
      installationTemperature: INSTALLATION_TEMPERATURE,
      operatingTemperature,
      material: {
        elasticModulus: material.materialState.elasticModulus,
        shearModulus: material.materialState.shearModulus,
        thermalExpansionCoefficient: material.materialState.thermalExpansionCoefficient,
      },
      sourceEvidence: sourceEvidence({
        sourceId: `${BM3_SOURCE_ID}-RIGID-${segment.id}`,
        sourceRevision: `${source.sourceRevision}:${analysis.rigid.type}:${analysis.rigid.weight}:${label}`,
      }),
      semanticHash: '',
    }));
    const T1 = compileAt('T1', analysis.operatingTemperature);
    const T2 = compileAt('T2', analysis.operatingTemperature2);
    if (T1.stiffnessSection.outsideDiameter !== T2.stiffnessSection.outsideDiameter
      || T1.gravity.totalLineWeight !== T2.gravity.totalLineWeight) {
      throw new Error(`BM3 rigid ${segment.id} changed nonthermal authority between T1 and T2.`);
    }
    result.set(segment.id, Object.freeze({ sourceSegment: segment, T1, T2 }));
  }
  return result;
}

function buildReducerDefinitions(geometry, material, source) {
  const result = new Map();
  const segments = geometry.segments;
  for (let index = 1; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const previous = segments.find((row) => row.endNodeId === current.startNodeId);
    const next = segments.find((row) => row.startNodeId === current.endNodeId);
    if (!previous || !next || current.type !== 'PIPE') continue;
    const diameterChangesAcrossSpan = Math.abs(previous.diameter - next.diameter) > 1e-9;
    const currentIsIntermediate = current.diameter > Math.min(previous.diameter, next.diameter)
      && current.diameter < Math.max(previous.diameter, next.diameter);
    if (!diameterChangesAcrossSpan || !currentIsIntermediate) continue;
    const analysis = current.meta.analysis;
    const compileAt = (label, operatingTemperature) => compileTenCylinderReducerAuthority(sealReducerCondensationRequest({
      schema: REDUCER_CONDENSATION_REQUEST_SCHEMA,
      reducerId: `BM3-REDUCER-${current.id}-${label}`,
      length: current.length,
      fromSection: { outerDiameter: previous.diameter, wallThickness: previous.thickness },
      toSection: { outerDiameter: next.diameter, wallThickness: next.thickness },
      segmentCount: 10,
      samplingRule: REDUCER_SAMPLING_RULE,
      material: {
        elasticModulus: material.materialState.elasticModulus,
        shearModulus: material.materialState.shearModulus,
        massDensity: material.materialState.massDensity,
        thermalExpansionCoefficient: material.materialState.thermalExpansionCoefficient,
      },
      gravity: {
        enabled: true,
        acceleration: GRAVITY,
        directionLocal: [1, 0, 0],
        fluidDensity: analysis.fluidDensity ?? 0,
        insulationThickness: analysis.insulationThickness ?? 0,
        insulationDensity: analysis.insulationDensity ?? 0,
      },
      thermal: { installationTemperature: INSTALLATION_TEMPERATURE, operatingTemperature },
      sourceEvidence: sourceEvidence({
        sourceId: `${BM3_SOURCE_ID}-REDUCER-${current.id}`,
        sourceRevision: `${source.sourceRevision}:${previous.diameter}:${next.diameter}:${label}`,
      }),
      semanticHash: '',
    }));
    const T1 = compileAt('T1', analysis.operatingTemperature);
    const T2 = compileAt('T2', analysis.operatingTemperature2);
    result.set(current.id, Object.freeze({ sourceSegment: current, previous, next, T1, T2 }));
  }
  return result;
}

function expandAnalysisGeometry(sourceGeometry, reducerDefinitions) {
  const nodes = new Map(sourceGeometry.nodes.map((node) => [node.id, structuredClone(node)]));
  const segments = [];
  for (const sourceSegment of sourceGeometry.segments) {
    const reducer = reducerDefinitions.get(sourceSegment.id);
    if (!reducer) {
      segments.push(analysisSegment(sourceSegment, sourceSegment.id, sourceSegment.startNodeId, sourceSegment.endNodeId, 'SOURCE_CHORD', nodes, null));
      continue;
    }
    const start = point(sourceGeometry, sourceSegment.startNodeId);
    const end = point(sourceGeometry, sourceSegment.endNodeId);
    const references = [sourceSegment.startNodeId];
    for (let index = 1; index < 10; index += 1) {
      const id = `M028.${sourceSegment.id}.N${index}`;
      const fraction = index / 10;
      nodes.set(id, {
        id,
        x: start[0] + (end[0] - start[0]) * fraction,
        y: start[1] + (end[1] - start[1]) * fraction,
        z: start[2] + (end[2] - start[2]) * fraction,
        restraint: 'FREE',
        meta: { caesarNodeNumber: null, m028ReducerSourceSegmentId: sourceSegment.id, m028ReducerInternalIndex: index },
      });
      references.push(id);
    }
    references.push(sourceSegment.endNodeId);
    for (let index = 0; index < 10; index += 1) {
      segments.push(analysisSegment(
        sourceSegment,
        `${sourceSegment.id}.REDUCER.${index + 1}`,
        references[index],
        references[index + 1],
        'REDUCER_CYLINDER_CANDIDATE',
        nodes,
        index,
      ));
    }
  }
  return Object.freeze({
    ...structuredClone(sourceGeometry),
    nodes: [...nodes.values()],
    segments,
    unit: 'm',
    diagnostics: [
      ...(sourceGeometry.diagnostics ?? []).map((row) => structuredClone(row)),
      {
        severity: 'warn',
        code: 'M028_BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD',
        message: 'BM3 source bends are compiled as their canonical FROM/TO chords; no undocumented bend station geometry is inferred.',
        data: { bendCount: sourceGeometry.segments.filter((row) => row.type === 'BEND').length },
      },
      {
        severity: 'warn',
        code: 'M028_REDUCER_CANDIDATE_PENDING_PARITY',
        message: 'Each detected inline reducer is expanded into the merged ten-cylinder midpoint-sampling candidate; this is not a CAESAR parity claim.',
        data: { reducerCount: reducerDefinitions.size, reducerIds: [...reducerDefinitions.keys()] },
      },
    ],
    summary: {
      ...(sourceGeometry.summary ?? {}),
      nodeCount: nodes.size,
      segmentCount: segments.length,
      m028SourceNodeCount: sourceGeometry.nodes.length,
      m028SourceElementCount: sourceGeometry.segments.length,
      m028ReducerCount: reducerDefinitions.size,
    },
    valid: true,
  });
}

function analysisSegment(sourceSegment, id, startNodeId, endNodeId, role, nodes, reducerIndex) {
  const start = nodes.get(startNodeId);
  const end = nodes.get(endNodeId);
  return {
    ...structuredClone(sourceSegment),
    id,
    startNodeId,
    endNodeId,
    type: 'PIPE',
    length: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
    meta: {
      ...structuredClone(sourceSegment.meta),
      sourceSegmentId: sourceSegment.id,
      analysisRole: role,
      reducerIndex,
    },
  };
}

function buildSectionRegistry({ analysisGeometry, normalizedGeometry, source, reducerDefinitions, rigidDefinitions }) {
  const byKey = new Map();
  const byAnalysisSegment = new Map();
  const sourceById = new Map(normalizedGeometry.segments.map((row) => [row.id, row]));
  const resolve = (outerDiameter, wallThickness, identity) => {
    const key = `${outerDiameter}:${wallThickness}`;
    let authority = byKey.get(key);
    if (!authority) {
      const payload = {
        schema: PIPE_SECTION_REQUEST_SCHEMA,
        sectionStateId: `BM3-SEC-${byKey.size + 1}`,
        formulationId: PIPE_SECTION_FORMULATION_ID,
        outerDiameter,
        wallThickness,
        sourceEvidence: sourceEvidence({
          sourceId: `${BM3_SOURCE_ID}-SECTION`,
          sourceRevision: `${source.sourceRevision}:${identity}:${key}`,
        }),
      };
      authority = resolvePipeSection({
        request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
        profile: PIPE_SECTION_PROFILE,
      });
      byKey.set(key, authority);
    }
    return authority;
  };
  for (const segment of analysisGeometry.segments) {
    const sourceSegment = sourceById.get(segment.meta.sourceSegmentId);
    const rigid = rigidDefinitions.get(sourceSegment.id);
    const reducer = reducerDefinitions.get(sourceSegment.id);
    let section;
    if (rigid) {
      section = resolve(rigid.T1.stiffnessSection.outsideDiameter, rigid.T1.stiffnessSection.wallThickness, `${sourceSegment.id}:RIGID`);
    } else if (reducer) {
      const candidate = reducer.T1.segments[segment.meta.reducerIndex].section;
      section = resolve(candidate.outerDiameter, candidate.wallThickness, `${sourceSegment.id}:REDUCER:${segment.meta.reducerIndex}`);
    } else {
      section = resolve(sourceSegment.diameter, sourceSegment.thickness, sourceSegment.id);
    }
    byAnalysisSegment.set(segment.id, section);
  }
  return Object.freeze({ byAnalysisSegment, unique: [...byKey.values()] });
}

function buildModelEntries({ analysisGeometry, sourceGeometry, sectionRegistry, kernelNodeByReference, reducerDefinitions, rigidDefinitions }) {
  const sourceById = new Map(sourceGeometry.segments.map((row) => [row.id, row]));
  return analysisGeometry.segments.map((segment) => {
    const sourceSegment = sourceById.get(segment.meta.sourceSegmentId);
    return Object.freeze({
      segment,
      sourceSegment,
      elementId: `BM3.${segment.id}`,
      nodeI: kernelNodeByReference.get(segment.startNodeId),
      nodeJ: kernelNodeByReference.get(segment.endNodeId),
      referenceFromNode: segment.startNodeId,
      referenceToNode: segment.endNodeId,
      sourceFromNode: sourceSegment.startNodeId,
      sourceToNode: sourceSegment.endNodeId,
      section: sectionRegistry.byAnalysisSegment.get(segment.id),
      referenceVector: [0, 0, 1],
      analysisRole: segment.meta.analysisRole,
      rigid: rigidDefinitions.has(sourceSegment.id),
      reducer: reducerDefinitions.has(sourceSegment.id),
      reducerIndex: segment.meta.reducerIndex,
    });
  });
}

function compileModel({ source, conditioned, analysisGeometry, material, sectionRegistry, kernelNodeByReference, modelEntries, additionalConstraintDeclarations, modelIdentity, modelRevision }) {
  const localAxisResults = modelEntries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(analysisGeometry, entry.referenceFromNode),
      nodeJ: point(analysisGeometry, entry.referenceToNode),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  return compileMechanicalModel({
    modelIdentity,
    modelRevision,
    sourceSemanticHash: source.semanticHash,
    conditionedTopology: conditioned,
    nodeBindings: analysisGeometry.nodes.map((node) => ({
      nodeId: kernelNodeByReference.get(node.id),
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: modelEntries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.segment.id,
      topologySegmentId: entry.segment.id,
      materialStateId: material.materialState.materialStateId,
      sectionStateId: entry.section.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [material],
    sectionResolutions: sectionRegistry.unique,
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(analysisGeometry, kernelNodeByReference, additionalConstraintDeclarations),
    profile: compilerProfile(),
  });
}

function constraintDeclarations(geometry, kernelNodeByReference, additionalConstraintDeclarations = []) {
  const rows = new Map();
  const add = (referenceNode, dof) => rows.set(`${referenceNode}:${dof}`, {
    declarationId: `BM3-C-${referenceNode}-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: kernelNodeByReference.get(referenceNode),
    dof,
    behavior: 'FIXED',
  });
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof);
    for (const restraint of node.meta.restraints ?? []) {
      if (restraint.typeCode === '3') add(node.id, 'UY');
    }
  }
  for (const declaration of additionalConstraintDeclarations) {
    const key = `${declaration.nodeId}:${declaration.dof}`;
    if (rows.has(key)) throw new Error(`BM3 additional constraint conflicts at ${key}.`);
    rows.set(key, declaration);
  }
  return [...rows.values()];
}

export function solveBm3InputXml() {
  const authorities = buildBm3Authorities();
  const base = Object.fromEntries(Object.entries(BM3_BASE_CASES).map(([key, policy]) => [key, analyseBaseCase(authorities, key, policy)]));
  const cases = {
    ...base,
    CASE6_EXP: differenceCase('CASE6_EXP', base.CASE3_OPE, base.CASE5_OCC, 'L6=L3-L5'),
    CASE7_EXP: differenceCase('CASE7_EXP', base.CASE4_SUS, base.CASE5_OCC, 'L7=L4-L5'),
  };
  return Object.freeze({ ...authorities, cases, report: buildReport(authorities, cases) });
}

export function analyseBaseCase(authorities, caseKey, policy, options = {}) {
  const loadCase = compileCase(authorities, caseKey, policy, options);
  const distributedByElement = new Map(loadCase.primitives.filter((row) => row.kind === 'DISTRIBUTED_LOAD').map((row) => [row.elementId, [row]]));
  const temperatureByElement = new Map(loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]));
  const frameElements = authorities.modelEntries.map((entry) => compileFrameElement({
    elementId: entry.elementId,
    material: authorities.material,
    section: entry.section,
    localAxes: {
      result: resolveFrameLocalAxes({
        nodeI: point(authorities.analysisGeometry, entry.referenceFromNode),
        nodeJ: point(authorities.analysisGeometry, entry.referenceToNode),
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
    solverProfile: solverProfile({
      normalizedResidualLimit: { value: 1e-6, source: 'M028 reducer-expanded benchmark residual gate; the exact observed solve remains below this disclosed engineering threshold.' },
      normalizedResidualWarnLimit: { value: 1e-5, source: 'M028 reducer-expanded benchmark residual warning gate.' },
      nearZeroPivotTolerance: { value: 1e-10, source: 'M028 ten-cylinder reducer expansion creates short but physically stiff spans; retain a stricter-than-machine-zero pivot threshold.' },
      conditionWarning: { value: 1e14, source: 'M028 explicit reducer-expanded conditioning disclosure.' },
      conditionBlock: { value: 1e17, source: 'M028 explicit reducer-expanded conditioning disclosure.' },
    }),
  });
  if (execution.status !== 'QUALIFIED') {
    throw new Error(`BM3 ${caseKey} execution blocked: ${JSON.stringify({ status: execution.status, diagnostics: execution.diagnostics })}`);
  }
  const recovery = compileResultRecovery({
    compilation: authorities.compilation,
    execution,
    loadCase,
    frameElements,
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  return Object.freeze({ caseKey, formula: policy.formula, loadCase, frameElements, execution, recovery });
}

export function compileCase(authorities, caseKey, policy, { nodalLoads = [], description = null } = {}) {
  const primitives = [];
  for (const entry of authorities.modelEntries) {
    const lineWeight = lineWeightForEntry(authorities, entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${caseKey}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({ sourceId: `${BM3_SOURCE_ID}-WEIGHT`, sourceRevision: `${caseKey}:${entry.elementId}:${lineWeight}` }),
    });
    const analysis = entry.sourceSegment.meta.analysis;
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${caseKey}-PRESSURE-${entry.elementId}`,
      kind: 'PRESSURE',
      elementId: entry.elementId,
      pressure: analysis.pressure,
      pressureBasis: 'GAUGE',
      authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
      sourceEvidence: sourceEvidence({ sourceId: `${BM3_SOURCE_ID}-PRESSURE`, sourceRevision: `${entry.elementId}:${analysis.pressure}` }),
    });
    if (policy.thermal) {
      const operatingTemperature = analysis[policy.temperatureField];
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${caseKey}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({ sourceId: `${BM3_SOURCE_ID}-${policy.temperatureField}`, sourceRevision: `${entry.elementId}:${operatingTemperature}` }),
      });
    }
  }
  primitives.push(...nodalLoads);
  return compilePhysicalLoadCase({
    loadCaseId: `BM3-${caseKey}`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label: caseKey, description: description ?? `M028 BM3 ${policy.formula}; hanger and declared F1 are intentionally omitted.` },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function lineWeightForEntry(authorities, entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  if (entry.rigid) return authorities.rigidDefinitions.get(entry.sourceSegment.id).T1.gravity.totalLineWeight;
  if (entry.reducer) return authorities.reducerDefinitions.get(entry.sourceSegment.id).T1.segments[entry.reducerIndex].lineWeights.total;
  const section = entry.section.sectionState;
  const dimensions = entry.section.dimensions;
  const metal = authorities.material.materialState.massDensity * section.area * GRAVITY;
  const innerDiameter = dimensions.outerDiameter - 2 * dimensions.wallThickness;
  const fluid = (analysis.fluidDensity ?? 0) * Math.PI * innerDiameter ** 2 / 4 * GRAVITY;
  const insulatedOuterDiameter = dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOuterDiameter ** 2 - dimensions.outerDiameter ** 2) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return metal + fluid + insulation;
}

export function differenceCase(caseKey, positive, negative, formula) {
  return Object.freeze({ caseKey, formula, derived: true, positive: positive.caseKey, negative: negative.caseKey });
}

export function buildReport(authorities, cases, { gaps = null, schema = 'm028-bm3-analysis-report/v1', hangerAuthorities = null } = {}) {
  const sourceNodes = authorities.normalized.geometry.nodes.map((node) => node.id);
  const baseValues = Object.fromEntries(Object.entries(cases).filter(([, row]) => !row.derived).map(([key, analysis]) => [key, caseValues(authorities, analysis, hangerAuthorities)]));
  const values = {
    ...baseValues,
    CASE6_EXP: subtractCaseValues(baseValues.CASE3_OPE, baseValues.CASE5_OCC),
    CASE7_EXP: subtractCaseValues(baseValues.CASE4_SUS, baseValues.CASE5_OCC),
  };
  const forceRecords = authorities.normalized.geometry.segments.flatMap((row) => row.meta.analysis.forcesMoments ?? []);
  const hangerRecords = authorities.normalized.geometry.segments.flatMap((row) => row.meta.analysis.hangers ?? []);
  return Object.freeze({
    schema,
    sourceSemanticHash: authorities.source.semanticHash,
    counts: {
      sourceNodes: authorities.normalized.geometry.nodes.length,
      sourceElements: authorities.normalized.geometry.segments.length,
      analysisNodes: authorities.analysisGeometry.nodes.length,
      analysisElements: authorities.modelEntries.length,
      bends: authorities.normalized.geometry.segments.filter((row) => row.type === 'BEND').length,
      rigids: authorities.rigidDefinitions.size,
      reducers: authorities.reducerDefinitions.size,
      tees: teeNodes(authorities.normalized.geometry).length,
      declaredForceMomentRecords: forceRecords.length,
      hangerRecords: hangerRecords.length,
    },
    diagnostics: authorities.analysisGeometry.diagnostics.map((row) => ({ severity: row.severity, code: row.code, message: row.message, data: row.data ?? null })),
    gaps: gaps ?? [
      { code: 'HANGER_SUPPORT_NOT_COMPILED', affectedCases: CASE_KEYS, records: hangerRecords },
      { code: 'DECLARED_FORCE_F1_NOT_COMPILED', affectedCases: ['CASE5_OCC', 'CASE6_EXP', 'CASE7_EXP'], records: forceRecords },
      { code: 'REDUCER_CANDIDATE_PENDING_PARITY', affectedSourceSegments: [...authorities.reducerDefinitions.keys()] },
      { code: 'BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD', affectedSourceSegments: authorities.normalized.geometry.segments.filter((row) => row.type === 'BEND').map((row) => row.id) },
    ],
    hangerAuthorities,
    rigidAuthorities: [...authorities.rigidDefinitions.values()].map((row) => ({
      sourceSegmentId: row.sourceSegment.id,
      type: row.sourceSegment.meta.analysis.rigid.type,
      enteredWeight: row.sourceSegment.meta.analysis.rigid.weight,
      totalLineWeight: row.T1.gravity.totalLineWeight,
      stiffnessWallRule: row.T1.stiffnessSection.rule,
      semanticHashT1: row.T1.semanticHash,
      semanticHashT2: row.T2.semanticHash,
    })),
    reducerAuthorities: [...authorities.reducerDefinitions.values()].map((row) => ({
      sourceSegmentId: row.sourceSegment.id,
      fromSection: row.T1.geometry.fromSection,
      toSection: row.T1.geometry.toSection,
      segmentCount: row.T1.geometry.segmentCount,
      parityStatus: row.T1.parityStatus,
      samplingRule: row.T1.samplingRule,
      semanticHashT1: row.T1.semanticHash,
      semanticHashT2: row.T2.semanticHash,
    })),
    solverQualification: Object.fromEntries(Object.entries(cases).map(([caseKey, analysis]) => [caseKey, analysis.derived
      ? { status: 'DERIVED', formula: analysis.formula, positive: analysis.positive, negative: analysis.negative }
      : {
          status: analysis.execution.status,
          formula: analysis.formula,
          diagnostics: analysis.execution.diagnostics,
          factorization: {
            backend: analysis.execution.factorization.backend,
            kind: analysis.execution.factorization.kind,
            minAbsPivot: analysis.execution.factorization.pivotStatistics.minAbsPivot,
            maxAbsPivot: analysis.execution.factorization.pivotStatistics.maxAbsPivot,
            negativePivotCount: analysis.execution.factorization.pivotStatistics.negativePivotCount,
            conditionEstimate: analysis.execution.factorization.conditionEstimate,
            conditionEstimateMethod: analysis.execution.factorization.conditionEstimateMethod,
          },
        }])),
    sourceNodeIds: sourceNodes,
    sourcePairs: authorities.normalized.geometry.segments.map((row) => `${row.startNodeId}-${row.endNodeId}`),
    cases: values,
  });
}

function caseValues(authorities, analysis, hangerAuthorities = null) {
  const nodes = new Map(authorities.normalized.geometry.nodes.map((node) => [node.id, nodalResult(analysis, authorities.kernelNodeByReference.get(node.id))]));
  for (const authority of hangerAuthorities ?? []) {
    const recovered = recoverProgrammedVariableSpringHangerAction({ authority, execution: analysis.execution });
    const prior = nodes.get(authority.nodeId);
    if (!prior) throw new Error(`Programmed hanger ${authority.hangerId} references unknown source node ${authority.nodeId}.`);
    nodes.set(authority.nodeId, {
      displacement: prior.displacement,
      reaction: { ...prior.reaction, UY: recovered.totalSupportAction },
    });
  }
  const sourceEntries = new Map();
  for (const source of authorities.normalized.geometry.segments) {
    const entries = authorities.modelEntries.filter((row) => row.sourceSegment.id === source.id).sort((a, b) => (a.reducerIndex ?? 0) - (b.reducerIndex ?? 0));
    const first = analysis.recovery.elementActions.find((row) => row.elementId === entries[0].elementId);
    const last = analysis.recovery.elementActions.find((row) => row.elementId === entries.at(-1).elementId);
    sourceEntries.set(`${source.startNodeId}-${source.endNodeId}`, {
      global: { I: first.global.I, J: last.global.J },
      local: { I: first.local.I, J: last.local.J },
    });
  }
  return Object.freeze({ nodes, pairs: sourceEntries });
}

function subtractCaseValues(positive, negative) {
  const subtractRecord = (a, b) => Object.fromEntries(Object.keys(a).map((key) => [key, a[key] - b[key]]));
  const nodes = new Map();
  for (const [nodeId, row] of positive.nodes) {
    const other = negative.nodes.get(nodeId);
    nodes.set(nodeId, { displacement: subtractRecord(row.displacement, other.displacement), reaction: subtractRecord(row.reaction, other.reaction) });
  }
  const pairs = new Map();
  for (const [pairKey, row] of positive.pairs) {
    const other = negative.pairs.get(pairKey);
    pairs.set(pairKey, {
      global: { I: subtractRecord(row.global.I, other.global.I), J: subtractRecord(row.global.J, other.global.J) },
      local: { I: subtractRecord(row.local.I, other.local.I), J: subtractRecord(row.local.J, other.local.J) },
    });
  }
  return Object.freeze({ nodes, pairs });
}

function nodalResult(analysis, nodeId) {
  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
  return {
    displacement: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.displacement, dof)])),
    reaction: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.reactions, dof)])),
  };
}

export function teeNodes(geometry) {
  const degree = new Map();
  for (const segment of geometry.segments) {
    degree.set(segment.startNodeId, (degree.get(segment.startNodeId) ?? 0) + 1);
    degree.set(segment.endNodeId, (degree.get(segment.endNodeId) ?? 0) + 1);
  }
  return [...degree.entries()].filter(([, count]) => count >= 3).map(([nodeId]) => nodeId).sort((a, b) => Number(a) - Number(b));
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => row.id === nodeId);
  if (!node) throw new Error(`Missing BM3 node ${nodeId}.`);
  return [node.x, node.y, node.z];
}
