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
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const BM2_INPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url));
export const BM2_OUTPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM2/Output_BM2.xml', import.meta.url));
export const BM2_SOURCE_ID = 'CAESAR-II-BM2-LIVE-INPUTXML';
export const INSTALLATION_TEMPERATURE = 293.15;
export const THERMAL_EXPANSION_COEFFICIENT = 1.17e-5;
export const GRAVITY = 9.80665;

const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'M027 preserves one analysis span per source PIPINGELEMENT during first solve comparison' },
  bendSeedingSegments: { value: 4, source: 'M027 does not condition bends into fitted curvature during first solve comparison' },
  bendLengthErrorLimit: { value: 0.01, source: 'M027 inherited InputXML conditioning disclosure' },
});

export function sourceEvidence(value) {
  return {
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    sourceSemanticHash: semanticHash(value),
  };
}

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

function materialAuthority(geometry, source) {
  const analyses = geometry.segments.map((segment) => segment.meta.analysis);
  const first = analyses[0];
  for (const analysis of analyses) {
    if (!(analysis.elasticModulus > 0) || !(analysis.pipeDensity > 0) || !(analysis.poissonRatio > 0)) {
      throw new Error('BM2 material fields must resolve on every segment.');
    }
  }
  const evaluationTemperature = Math.max(...analyses.map((row) => row.operatingTemperature));
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
    materialId: 'BM2-A106-GRADE-B-INPUTXML',
    sourceEvidence: sourceEvidence({
      sourceId: `${BM2_SOURCE_ID}-MATERIAL`,
      sourceRevision: source.sourceRevision,
      point: pointValue,
      installationTemperatureDisclosure: 'InputXML has no installation temperature or alpha; M027 declares 293.15 K and 1.17e-5 1/K.',
    }),
    points: [pointValue],
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: 'BM2-MAT-INPUTXML',
      materialId: table.materialId,
      evaluationTemperature,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

function resolveSection({ sectionStateId, outerDiameter, wallThickness, sourceId, sourceRevision }) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness,
    sourceEvidence: sourceEvidence({ sourceId, sourceRevision, outerDiameter, wallThickness }),
  };
  return resolvePipeSection({
    request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
    profile: PIPE_SECTION_PROFILE,
  });
}

function physicalSectionAuthorities(geometry, source) {
  const byKey = new Map();
  const bySegment = new Map();
  for (const segment of geometry.segments) {
    const key = `${segment.diameter}:${segment.thickness}`;
    let section = byKey.get(key);
    if (!section) {
      section = resolveSection({
        sectionStateId: `BM2-SEC-${byKey.size + 1}`,
        outerDiameter: segment.diameter,
        wallThickness: segment.thickness,
        sourceId: `${BM2_SOURCE_ID}-PHYSICAL-SECTION`,
        sourceRevision: `${source.sourceRevision}:${key}`,
      });
      byKey.set(key, section);
    }
    bySegment.set(segment.id, section);
  }
  bySegment.unique = [...byKey.values()];
  return bySegment;
}

function rigidAuthorityFor(segment, physicalSection, material, source) {
  const analysis = segment.meta.analysis;
  const request = sealRigidElementRequest({
    schema: RIGID_ELEMENT_REQUEST_SCHEMA,
    rigidElementId: `BM2-RIGID-${segment.id}`,
    length: segment.length,
    insideDiameter: physicalSection.dimensions.innerDiameter,
    enteredOutsideDiameter: physicalSection.dimensions.outerDiameter,
    pipeWallThickness: physicalSection.dimensions.wallThickness,
    enteredRigidWeight: analysis.rigid.weight ?? 0,
    fluidDensity: analysis.fluidDensity ?? 0,
    insulationThickness: analysis.insulationThickness ?? 0,
    insulationDensity: analysis.insulationDensity ?? 0,
    refractoryWeight: 0,
    claddingWeight: 0,
    gravityAcceleration: GRAVITY,
    installationTemperature: INSTALLATION_TEMPERATURE,
    operatingTemperature: analysis.operatingTemperature,
    material: {
      elasticModulus: analysis.elasticModulus,
      shearModulus: analysis.elasticModulus / (2 * (1 + analysis.poissonRatio)),
      thermalExpansionCoefficient: THERMAL_EXPANSION_COEFFICIENT,
    },
    sourceEvidence: sourceEvidence({
      sourceId: `${BM2_SOURCE_ID}-RIGID-${segment.id}`,
      sourceRevision: source.sourceRevision,
      rigid: analysis.rigid,
      physicalSectionHash: physicalSection.semanticHash,
      materialHash: material.semanticHash,
    }),
    semanticHash: '',
  });
  return compileCaesarRigidElementAuthority(request);
}

function rigidStiffnessSection(segment, authority, source) {
  return resolveSection({
    sectionStateId: `BM2-RIGID-SEC-${segment.meta.sourceIndex + 1}`,
    outerDiameter: authority.stiffnessSection.outsideDiameter,
    wallThickness: authority.stiffnessSection.wallThickness,
    sourceId: `${BM2_SOURCE_ID}-RIGID-STIFFNESS-SECTION`,
    sourceRevision: `${source.sourceRevision}:${authority.semanticHash}`,
  });
}

function modelEntries(geometry, physicalSections, material, source) {
  return geometry.segments.map((sourceSegment) => {
    const physicalSection = physicalSections.get(sourceSegment.id);
    const rigidAuthority = sourceSegment.meta.analysis.rigid
      ? rigidAuthorityFor(sourceSegment, physicalSection, material, source)
      : null;
    const analysisSection = rigidAuthority
      ? rigidStiffnessSection(sourceSegment, rigidAuthority, source)
      : physicalSection;
    return Object.freeze({
      sourceSegment,
      elementId: `BM2.${sourceSegment.id}`,
      nodeI: `BM2.N${sourceSegment.startNodeId}`,
      nodeJ: `BM2.N${sourceSegment.endNodeId}`,
      physicalSection,
      analysisSection,
      rigidAuthority,
      referenceVector: [0, 0, 1],
    });
  });
}

function constraintDeclarations(geometry) {
  const rows = new Map();
  const add = (nodeId, dof, reason) => rows.set(`${nodeId}:${dof}`, {
    declarationId: `BM2-C-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `BM2.N${nodeId}`,
    dof,
    behavior: 'FIXED',
  });
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof, 'ANCHOR');
    }
    for (const restraint of node.meta.restraints ?? []) {
      if (restraint.typeCode === '14') add(node.id, 'UY', 'PLUS-Y-LINEARIZED');
      if (restraint.typeCode === '9') {
        const direction = [
          Math.abs(restraint.xCosine ?? 0),
          Math.abs(restraint.yCosine ?? 0),
          Math.abs(restraint.zCosine ?? 0),
        ];
        const axis = direction.indexOf(Math.max(...direction));
        add(node.id, ['UX', 'UY', 'UZ'][axis], 'GUIDE');
      }
    }
  }
  return [...rows.values()];
}

function compileModel({ source, conditioned, geometry, material, entries }) {
  const axes = entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const sectionResolutions = new Map();
  for (const entry of entries) sectionResolutions.set(entry.analysisSection.semanticHash, entry.analysisSection);
  return compileMechanicalModel({
    modelIdentity: 'BM2-LIVE-INPUTXML-M027',
    modelRevision: 1,
    sourceSemanticHash: source.semanticHash,
    conditionedTopology: conditioned,
    nodeBindings: geometry.nodes.map((node) => ({
      nodeId: `BM2.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.sourceSegment.id,
      topologySegmentId: entry.sourceSegment.id,
      materialStateId: material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId ?? entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [material],
    sectionResolutions: [...sectionResolutions.values()],
    localAxisResults: axes,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(geometry),
    profile: compilerProfile(),
  });
}

export function buildBm2SolveAuthorities() {
  const content = readFileSync(BM2_INPUT_PATH, 'utf8');
  const source = sealLinearPipingInputXmlSource({
    sourceId: BM2_SOURCE_ID,
    sourceRevision: semanticHash({ content }),
    fileName: 'benchmarks/LFEA/BM2/Input_BM2.xml',
    mediaType: 'application/xml',
    content,
  });
  const parsed = inputXmlToCanonicalGeometry(content, {
    unit: 'mm',
    source: BM2_SOURCE_ID,
    restraintTypeCodeMap: { 0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE', 9: 'GUIDE' },
    bendRadiusTolerance: 1e-6,
  });
  const unitProfile = sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: 'M027-BM2-INPUTXML-UNIT-R1',
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: ['mm'],
    sourceEvidence: {
      authority: 'CAESAR-II-INPUTXML-UNITS-BLOCK',
      documentId: 'Input_BM2.xml',
      revision: source.sourceRevision,
      sourceSemanticHash: source.semanticHash,
    },
    semanticHash: '',
  });
  const normalized = normalizeLinearPipingInputXmlGeometry(parsed, unitProfile);
  const material = materialAuthority(normalized.geometry, source);
  const physicalSections = physicalSectionAuthorities(normalized.geometry, source);
  const entries = modelEntries(normalized.geometry, physicalSections, material, source);
  const conditioned = conditionGeometry(normalized.geometry, [], CONDITIONING_PROFILE);
  const compilation = compileModel({
    source,
    conditioned,
    geometry: normalized.geometry,
    material,
    entries,
  });
  return Object.freeze({
    content,
    source,
    parsed,
    normalized,
    material,
    physicalSections,
    entries,
    conditioned,
    compilation,
    frameProfile: eulerBernoulliProfile(),
  });
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
    solverProfile: solverProfile(),
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
      { code: 'BM2_RIGID_WEIGHT_UNIFORM_BODY', cause: 'Rigid-element body, fluid and insulation weight use the merged CAESAR rigid-element authority and a uniform consistent line load.' },
      { code: 'BM2_NO_TRUE_REDUCER_TAG', cause: 'Input_BM2.xml contains no active REDUCER child tag; the ten-cylinder reducer candidate is not force-fit to branch diameter changes.' },
      { code: 'BM2_CODE_STRESS_DEFERRED', cause: 'This phase compares displacement, restraint and global force truth; piping-code stress comparison remains unclaimed.' },
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

export function solveBm2InputXml() {
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
