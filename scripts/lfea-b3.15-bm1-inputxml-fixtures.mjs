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
  augmentPipingComponentTemperatureAuthorities,
  expandPipeWallGravitySourceAuthorities,
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
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { compileCodeResult } from '../src/core/linear-fea-b31-code-engine/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { augmentBm1CodeStress, bm1CodeAuthorities } from './lfea-b3.17-bm1-code-stress-fixtures.mjs';
import {
  bm1BendFactorSet,
  bm1CodeStressFactorSet,
  deriveBm1BendAuthority,
} from './lfea-b3.18-bm1-bend-authorities.mjs';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const BM1_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url));
export const SOURCE_ID = 'CAESAR-II-BM1-LIVE-INPUTXML';
export const INSTALLATION_TEMPERATURE = 293.15;
export const THERMAL_EXPANSION_COEFFICIENT = 1.17e-5;
export const GRAVITY = 9.80665;
export const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'M024 retains one analysis span per resolved straight or bend chord' },
  bendSeedingSegments: { value: 4, source: 'M024 bends are already resolved by B-3.2 before conditioning' },
  bendLengthErrorLimit: { value: 0.01, source: 'M020 benchmark conditioning authority' },
});

export function sourceEvidence(value) {
  return {
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    sourceSemanticHash: semanticHash(value),
  };
}

export function buildBm1InputXmlAuthorities() {
  const content = readFileSync(BM1_PATH, 'utf8');
  const source = sealLinearPipingInputXmlSource({
    sourceId: SOURCE_ID,
    sourceRevision: semanticHash({ content }),
    fileName: 'benchmarks/LFEA/BM1/BM1_InputXML.xml',
    mediaType: 'application/xml',
    content,
  });
  const parsed = inputXmlToCanonicalGeometry(content, {
    unit: 'mm',
    source: SOURCE_ID,
    restraintTypeCodeMap: { 0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE' },
    bendRadiusTolerance: 1e-6,
  });
  const unitProfile = sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: 'M020-BM1-INPUTXML-UNIT-R1',
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: ['mm'],
    sourceEvidence: {
      authority: 'CAESAR-II-INPUTXML-UNITS-BLOCK',
      documentId: 'BM1_InputXML.xml',
      revision: source.sourceRevision,
      sourceSemanticHash: source.semanticHash,
    },
    semanticHash: '',
  });
  const normalized = normalizeLinearPipingInputXmlGeometry(parsed, unitProfile);
  const material = materialAuthority(normalized.geometry, source);
  const sections = sectionAuthorities(normalized.geometry, source);
  const frameProfile = eulerBernoulliProfile();
  const rigidProfile = componentProfile({ valveBodyRule: 'VALVE_RIGID_BODY_V1', convergenceRequired: false });
  const bendProfile = componentProfile({
    bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
    convergenceRequired: false,
    bendMaxAngleDegrees: { value: 90, source: 'M024-CAESAR-NEAR-MID-FAR-STATION-POLICY' },
    bendMinimumElements: { value: 2, source: 'M024-CAESAR-NEAR-MID-FAR-STATION-POLICY' },
    bendMinimumElementsBetweenStations: { value: 1, source: 'M024-CAESAR-NEAR-MID-FAR-STATION-POLICY' },
  });

  const rigidDefinitions = normalized.geometry.segments
    .filter((segment) => segment.meta.analysis.rigid)
    .map((segment) => ({
      sourceSegment: segment,
      component: compileRigidComponent(
        segment,
        normalized.geometry,
        material,
        sections.get(segment.id),
        frameProfile,
        rigidProfile,
      ),
    }));
  const bendDefinitions = normalized.geometry.segments
    .filter((segment) => segment.type === 'BEND')
    .map((segment) => compileBendDefinition({
      sourceSegment: segment,
      sourceGeometry: normalized.geometry,
      material,
      section: sections.get(segment.id),
      frameProfile,
      bendProfile,
    }));

  const analysisGeometry = expandBm1AnalysisGeometry(normalized.geometry, bendDefinitions);
  const conditioned = conditionGeometry(analysisGeometry, [], CONDITIONING_PROFILE);
  const rigidComponents = rigidDefinitions.map((entry) => entry.component);
  const bendComponents = bendDefinitions.map((entry) => entry.component);
  const pipingComponents = [...rigidComponents, ...bendComponents];
  const rigidBySource = new Map(rigidDefinitions.map((entry) => [entry.sourceSegment.id, entry.component]));
  const bendBySource = new Map(bendDefinitions.map((entry) => [entry.sourceSegment.id, entry]));
  const kernelNodeByReference = kernelNodeMap(analysisGeometry, rigidDefinitions, bendDefinitions);
  const modelEntries = buildModelEntries({
    analysisGeometry,
    sourceGeometry: normalized.geometry,
    sections,
    rigidBySource,
    bendBySource,
    kernelNodeByReference,
  });
  const compilation = compileModel({
    source,
    conditioned,
    analysisGeometry,
    material,
    sections,
    frameProfile,
    kernelNodeByReference,
    modelEntries,
  });
  return {
    content,
    source,
    parsed,
    normalized,
    analysisGeometry,
    conditioned,
    material,
    sections,
    frameProfile,
    rigidComponents,
    bendComponents,
    pipingComponents,
    bendDefinitions,
    kernelNodeBySource: kernelNodeByReference,
    kernelNodeByReference,
    modelEntries,
    compilation,
  };
}

function materialAuthority(geometry, source) {
  const analyses = geometry.segments.map((segment) => segment.meta.analysis);
  const first = analyses[0];
  for (const analysis of analyses) {
    if (!(analysis.elasticModulus > 0) || !(analysis.pipeDensity > 0) || !(analysis.poissonRatio > 0)) {
      throw new Error('BM1 material fields must resolve on every segment.');
    }
    if (Math.abs(analysis.elasticModulus - first.elasticModulus) > first.elasticModulus * 1e-9
      || Math.abs(analysis.pipeDensity - first.pipeDensity) > first.pipeDensity * 1e-9
      || Math.abs(analysis.poissonRatio - first.poissonRatio) > 1e-12) {
      throw new Error('M020 currently requires one shared BM1 material stiffness state.');
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
    materialId: 'BM1-A106-GRADE-B-INPUTXML',
    sourceEvidence: sourceEvidence({
      sourceId: `${SOURCE_ID}-MATERIAL`,
      sourceRevision: source.sourceRevision,
      point: pointValue,
      installationTemperatureDisclosure: 'InputXML has no installation temperature or alpha; M020 declares 293.15 K and 1.17e-5 1/K explicitly.',
    }),
    points: [pointValue],
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: 'BM1-MAT-INPUTXML',
      materialId: table.materialId,
      evaluationTemperature,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

function sectionAuthorities(geometry, source) {
  const byKey = new Map();
  const result = new Map();
  for (const segment of geometry.segments) {
    const key = `${segment.diameter}:${segment.thickness}`;
    let authority = byKey.get(key);
    if (!authority) {
      const payload = {
        schema: PIPE_SECTION_REQUEST_SCHEMA,
        sectionStateId: `BM1-SEC-${byKey.size + 1}`,
        formulationId: PIPE_SECTION_FORMULATION_ID,
        outerDiameter: segment.diameter,
        wallThickness: segment.thickness,
        sourceEvidence: sourceEvidence({
          sourceId: `${SOURCE_ID}-SECTION`,
          sourceRevision: `${source.sourceRevision}:${key}`,
          outerDiameter: segment.diameter,
          wallThickness: segment.thickness,
        }),
      };
      authority = resolvePipeSection({
        request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
        profile: PIPE_SECTION_PROFILE,
      });
      byKey.set(key, authority);
    }
    result.set(segment.id, authority);
  }
  result.unique = [...byKey.values()];
  return result;
}

function compileRigidComponent(segment, geometry, material, section, frameProfile, profile) {
  const start = point(geometry, segment.startNodeId);
  const end = point(geometry, segment.endNodeId);
  const componentId = `BM1.RIGID.${segment.id}`;
  const weight = segment.meta.analysis.rigid.weight;
  return compilePipingComponent({
    componentId,
    componentType: 'VALVE_FLANGE',
    profile,
    start,
    end,
    material,
    section,
    massProperties: {
      mass: { value: weight / GRAVITY, source: `InputXML RIGID WEIGHT on ${segment.id}` },
      centreOfGravity: start.map((value, index) => (value + end[index]) / 2),
    },
    endConnections: {
      I: { portId: `${componentId}.I`, connectionType: 'INPUTXML_RIGID' },
      J: { portId: `${componentId}.J`, connectionType: 'INPUTXML_RIGID' },
    },
    bodyStiffnessMultiplier: null,
    frameElementProfile: frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: [0, 0, 1],
  });
}

function compileBendDefinition({ sourceSegment, sourceGeometry, material, section, frameProfile, bendProfile }) {
  const next = sourceGeometry.segments.find((candidate) => candidate.startNodeId === sourceSegment.endNodeId);
  if (!next) throw new Error(`BM1 bend ${sourceSegment.id} requires one immediately following outlet element.`);
  const intersection = point(sourceGeometry, sourceSegment.endNodeId);
  const incomingDirection = unit(subtract(intersection, point(sourceGeometry, sourceSegment.startNodeId)));
  const outgoingDirection = unit(subtract(point(sourceGeometry, next.endNodeId), intersection));
  const bendAngle = Math.acos(clamp(dot(incomingDirection, outgoingDirection), -1, 1));
  const bendRadius = sourceSegment.meta.bendDeclaredRadius;
  const tangentLength = bendRadius * Math.tan(bendAngle / 2);
  const tangentStart = subtract(intersection, scale(incomingDirection, tangentLength));
  const tangentEnd = add(intersection, scale(outgoingDirection, tangentLength));
  const authority = deriveBm1BendAuthority({ sourceSegment, material, section });
  const componentId = `BM1.BEND.${sourceSegment.id}`;
  const component = compilePipingComponent({
    componentId,
    componentType: 'BEND',
    profile: bendProfile,
    arc: {
      tangentStart,
      tangentEnd,
      incomingDirection,
      declaredRadius: bendRadius,
    },
    material,
    section,
    frameElementProfile: frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: null,
    factorSet: bm1BendFactorSet(componentId, authority),
  });
  if (component.elements.length !== 2 || component.codeStations.length !== 3) {
    throw new Error(`${componentId} must resolve to CAESAR near/mid/far topology (2 elements, 3 stations).`);
  }
  const nearReferenceNode = sourceSegment.meta.bendStationNode2;
  const midpointReferenceNode = sourceSegment.meta.bendStationNode1;
  const farReferenceNode = sourceSegment.endNodeId;
  if (!nearReferenceNode || !midpointReferenceNode) {
    throw new Error(`${sourceSegment.id} must retain the live CAESAR near and midpoint station identities.`);
  }
  return Object.freeze({
    sourceSegment,
    nextSourceSegment: next,
    component,
    authority,
    intersection,
    incomingDirection,
    outgoingDirection,
    bendAngle,
    tangentLength,
    stationReferences: Object.freeze([
      { referenceNodeId: nearReferenceNode, station: component.codeStations[0] },
      { referenceNodeId: midpointReferenceNode, station: component.codeStations[1] },
      { referenceNodeId: farReferenceNode, station: component.codeStations[2] },
    ]),
  });
}

function expandBm1AnalysisGeometry(sourceGeometry, bendDefinitions) {
  const nodes = new Map(sourceGeometry.nodes.map((node) => [node.id, structuredClone(node)]));
  const bendBySource = new Map(bendDefinitions.map((definition) => [definition.sourceSegment.id, definition]));
  for (const definition of bendDefinitions) {
    for (const [index, station] of definition.stationReferences.entries()) {
      const position = station.station.position;
      const existing = nodes.get(station.referenceNodeId);
      nodes.set(station.referenceNodeId, {
        ...(existing ?? {
          id: station.referenceNodeId,
          restraint: 'FREE',
          meta: { caesarNodeNumber: station.referenceNodeId },
        }),
        x: position[0],
        y: position[1],
        z: position[2],
        meta: {
          ...(existing?.meta ?? { caesarNodeNumber: station.referenceNodeId }),
          m024BendStation: ['NEAR', 'MID', 'FAR'][index],
          sourceBendSegmentId: definition.sourceSegment.id,
        },
      });
    }
  }
  const segments = [];
  for (const sourceSegment of sourceGeometry.segments) {
    const bend = bendBySource.get(sourceSegment.id);
    if (!bend) {
      segments.push(analysisSegment(sourceSegment, sourceSegment.id, sourceSegment.startNodeId, sourceSegment.endNodeId, 'SOURCE_SPAN', nodes));
      continue;
    }
    const [near, mid, far] = bend.stationReferences.map((row) => row.referenceNodeId);
    segments.push(
      analysisSegment(sourceSegment, `${sourceSegment.id}.STRAIGHT`, sourceSegment.startNodeId, near, 'BEND_INCOMING_STRAIGHT', nodes),
      analysisSegment(sourceSegment, `${sourceSegment.id}.BEND.E1`, near, mid, 'BEND_ARC', nodes),
      analysisSegment(sourceSegment, `${sourceSegment.id}.BEND.E2`, mid, far, 'BEND_ARC', nodes),
    );
  }
  return Object.freeze({
    ...structuredClone(sourceGeometry),
    nodes: [...nodes.values()],
    segments,
    diagnostics: [
      ...(sourceGeometry.diagnostics ?? []).map((row) => structuredClone(row)),
      {
        severity: 'info',
        code: 'M024_BM1_BEND_TOPOLOGY_RESOLVED',
        message: 'BM1 bend tags were expanded under CAESAR near/mid/far station semantics and compiled through B-3.2 BEND components.',
        data: { sourceNodeCount: sourceGeometry.nodes.length, analysisNodeCount: nodes.size, sourceElementCount: sourceGeometry.segments.length, analysisElementCount: segments.length },
      },
    ],
    summary: {
      ...(sourceGeometry.summary ?? {}),
      nodeCount: nodes.size,
      segmentCount: segments.length,
      m024SourceNodeCount: sourceGeometry.nodes.length,
      m024SourceElementCount: sourceGeometry.segments.length,
      m024BendComponentCount: bendDefinitions.length,
    },
    valid: true,
  });
}

function analysisSegment(sourceSegment, id, startNodeId, endNodeId, analysisRole, nodes) {
  const start = nodes.get(startNodeId);
  const end = nodes.get(endNodeId);
  if (!start || !end) throw new Error(`Missing M024 analysis node for ${id}.`);
  return {
    ...structuredClone(sourceSegment),
    id,
    startNodeId,
    endNodeId,
    type: 'PIPE',
    sourceComponentUid: sourceSegment.sourceComponentUid,
    length: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
    meta: {
      ...structuredClone(sourceSegment.meta),
      sourceSegmentId: sourceSegment.id,
      analysisRole,
    },
  };
}

function kernelNodeMap(analysisGeometry, rigidDefinitions, bendDefinitions) {
  const result = new Map(analysisGeometry.nodes.map((node) => [node.id, `BM1.N${node.id}`]));
  for (const definition of rigidDefinitions) {
    result.set(
      definition.sourceSegment.startNodeId,
      definition.component.codeStations.find((row) => row.stationId.endsWith('CP-I')).nodeId,
    );
    result.set(
      definition.sourceSegment.endNodeId,
      definition.component.codeStations.find((row) => row.stationId.endsWith('CP-J')).nodeId,
    );
  }
  for (const definition of bendDefinitions) {
    for (const station of definition.stationReferences) {
      result.set(station.referenceNodeId, station.station.nodeId);
    }
  }
  return result;
}

function buildModelEntries({ analysisGeometry, sourceGeometry, sections, rigidBySource, bendBySource, kernelNodeByReference }) {
  const sourceById = new Map(sourceGeometry.segments.map((segment) => [segment.id, segment]));
  return analysisGeometry.segments.map((segment) => {
    const sourceSegment = sourceById.get(segment.meta.sourceSegmentId);
    if (!sourceSegment) throw new Error(`Missing source segment for ${segment.id}.`);
    const rigid = rigidBySource.get(sourceSegment.id) ?? null;
    const bendDefinition = bendBySource.get(sourceSegment.id) ?? null;
    const arcMatch = /\.BEND\.E([12])$/u.exec(segment.id);
    const component = rigid ?? (arcMatch ? bendDefinition.component : null);
    const componentElementIndex = rigid ? 0 : arcMatch ? Number(arcMatch[1]) - 1 : null;
    const bendAuthority = arcMatch ? bendDefinition.authority : null;
    const componentId = component?.componentId ?? sourceSegment.id;
    return Object.freeze({
      segment,
      sourceSegment,
      component,
      componentElementIndex,
      elementId: component
        ? component.elements[componentElementIndex].elementId
        : `BM1.${segment.id}`,
      nodeI: kernelNodeByReference.get(segment.startNodeId),
      nodeJ: kernelNodeByReference.get(segment.endNodeId),
      referenceFromNode: segment.startNodeId,
      referenceToNode: segment.endNodeId,
      section: sections.get(sourceSegment.id),
      rigid: rigid !== null,
      bendAuthority,
      stressFactorSet: bm1CodeStressFactorSet({
        componentId: sourceSegment.id,
        sourceSegmentId: sourceSegment.id,
        bendAuthority,
      }),
      referenceVector: component?.componentType === 'BEND' ? component.geometry.planeNormal : [0, 0, 1],
      analysisRole: segment.meta.analysisRole,
      sourceComponentId: component?.componentId ?? sourceSegment.sourceComponentUid,
    });
  });
}

function compileModel({ source, conditioned, analysisGeometry, material, sections, kernelNodeByReference, modelEntries }) {
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
    modelIdentity: 'BM1-LIVE-INPUTXML-M024',
    modelRevision: 2,
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
      sourceComponentId: entry.sourceComponentId,
    })),
    materialResolutions: [material],
    sectionResolutions: sections.unique,
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(analysisGeometry, kernelNodeByReference),
    profile: compilerProfile(),
  });
}

function constraintDeclarations(geometry, kernelNodeByReference) {
  const rows = new Map();
  const add = (referenceNode, dof) => rows.set(`${referenceNode}:${dof}`, {
    declarationId: `BM1-C-${referenceNode}-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: kernelNodeByReference.get(referenceNode),
    dof,
    behavior: 'FIXED',
  });
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof);
    }
    for (const restraint of node.meta.restraints ?? []) {
      if (restraint.typeCode === '14') add(node.id, 'UY');
      if (restraint.typeCode === '8') {
        const direction = [
          Math.abs(restraint.xCosine ?? 0),
          Math.abs(restraint.yCosine ?? 0),
          Math.abs(restraint.zCosine ?? 0),
        ];
        const axis = direction.indexOf(Math.max(...direction));
        add(node.id, ['UX', 'UY', 'UZ'][axis]);
      }
    }
  }
  return [...rows.values()];
}

export function solveBm1InputXml() {
  const authorities = buildBm1InputXmlAuthorities();
  const sustained = analyseCase(authorities, 'BM1-SUSTAINED', false);
  const operating = analyseCase(authorities, 'BM1-OPERATING-T1', true);
  const codeAuthorities = bm1CodeAuthorities(authorities);
  const code = displacementStressResults(authorities, sustained, operating, codeAuthorities);
  const baseResult = {
    ...authorities,
    sustained,
    operating,
    code,
    report: buildReport(authorities, sustained, operating, code),
  };
  return augmentBm1CodeStress(baseResult, codeAuthorities);
}

function analyseCase(authorities, loadCaseId, thermal) {
  const loadCase = compileCase(authorities, loadCaseId, thermal);
  const temperatureByElement = new Map(
    loadCase.primitives
      .filter((row) => row.kind === 'TEMPERATURE')
      .map((row) => [row.elementId, row]),
  );
  const frameElements = authorities.modelEntries
    .filter((entry) => !entry.component)
    .map((entry) => compileFrameElement({
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
      distributedLoads: [],
      temperature: temperatureByElement.get(entry.elementId) ?? null,
      releases: [],
      endSprings: [],
      rigidOffsets: null,
    }));
  const gravityExpanded = expandPipeWallGravitySourceAuthorities({
    compilation: authorities.compilation,
    loadCase,
    frameElements,
    pipingComponents: authorities.pipingComponents,
  });
  const thermalExpanded = augmentPipingComponentTemperatureAuthorities({
    compilation: authorities.compilation,
    loadCase: gravityExpanded.loadCase,
    pipingComponents: gravityExpanded.pipingComponents,
  });
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: [
      ...gravityExpanded.frameElements.map(elementContributionFromFrameElement),
      ...thermalExpanded.pipingComponents.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase: thermalExpanded.loadCase,
    solverProfile: solverProfile(),
  });
  const recovery = compileResultRecovery({
    compilation: authorities.compilation,
    execution,
    loadCase: thermalExpanded.loadCase,
    frameElements: gravityExpanded.frameElements,
    pipingComponents: thermalExpanded.pipingComponents,
    recoveryProfile: recoveryProfile(),
  });
  const result = {
    loadCase: thermalExpanded.loadCase,
    frameElements: gravityExpanded.frameElements,
    pipingComponents: thermalExpanded.pipingComponents,
    generatedGravityPrimitives: gravityExpanded.generatedPrimitives,
    execution,
    recovery,
  };
  return {
    ...result,
    equilibrium: equilibrium(authorities, result, thermalExpanded.loadCase),
  };
}

function compileCase(authorities, loadCaseId, thermal) {
  const primitives = [{
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `${loadCaseId}-GRAVITY`,
    kind: 'GRAVITY',
    direction: { x: 0, y: 1, z: 0 },
    basis: 'GLOBAL',
    includedMassSources: ['PIPE_WALL', 'CONTENTS', 'INSULATION'],
    sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-GRAVITY`, sourceRevision: loadCaseId }),
  }];
  for (const entry of authorities.modelEntries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const innerDiameter = entry.section.dimensions.outerDiameter - 2 * entry.section.dimensions.wallThickness;
    const contentsMass = analysis.fluidDensity * Math.PI * innerDiameter ** 2 / 4;
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${loadCaseId}-CONTENTS-${entry.elementId}`,
      kind: 'DISTRIBUTED_WEIGHT',
      elementId: entry.elementId,
      weightComponent: 'CONTENTS',
      massPerUnitLength: contentsMass,
      densityEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-FDENS`, sourceRevision: `${entry.sourceSegment.id}:${analysis.fluidDensity}` }),
      geometryEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-BORE`, sourceRevision: entry.sourceSegment.id }),
      sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-CONTENTS`, sourceRevision: entry.segment.id }),
    });
    const insulatedOuterDiameter = entry.section.dimensions.outerDiameter + 2 * analysis.insulationThickness;
    const insulationMass = analysis.insulationDensity
      * Math.PI
      * (insulatedOuterDiameter ** 2 - entry.section.dimensions.outerDiameter ** 2)
      / 4;
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${loadCaseId}-INSULATION-${entry.elementId}`,
      kind: 'DISTRIBUTED_WEIGHT',
      elementId: entry.elementId,
      weightComponent: 'INSULATION',
      massPerUnitLength: insulationMass,
      densityEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-INSUL_DENSITY`, sourceRevision: `${entry.sourceSegment.id}:${analysis.insulationDensity}` }),
      geometryEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-INSUL_THICK`, sourceRevision: `${entry.sourceSegment.id}:${analysis.insulationThickness}` }),
      sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-INSULATION`, sourceRevision: entry.segment.id }),
    });
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${loadCaseId}-PRESSURE-${entry.elementId}`,
      kind: 'PRESSURE',
      elementId: entry.elementId,
      pressure: analysis.pressure,
      pressureBasis: 'GAUGE',
      authorizedEffects: {
        codeStress: true,
        pressureStiffening: false,
        axialThrust: false,
        bourdon: false,
      },
      sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-PRESSURE1`, sourceRevision: `${entry.segment.id}:${analysis.pressure}` }),
    });
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${loadCaseId}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.segment.id}:${analysis.operatingTemperature}` }),
      });
    }
  }
  for (const entry of authorities.modelEntries.filter((row) => row.rigid)) {
    const half = entry.sourceSegment.meta.analysis.rigid.weight / 2;
    for (const [suffix, nodeId] of [['I', entry.nodeI], ['J', entry.nodeJ]]) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${loadCaseId}-RIGID-WEIGHT-${entry.sourceSegment.id}-${suffix}`,
        kind: 'NODAL_FORCE_MOMENT',
        nodeId,
        basis: { kind: 'GLOBAL' },
        force: { fx: 0, fy: -half, fz: 0 },
        moment: { mx: 0, my: 0, mz: 0 },
        units: { force: 'N', moment: 'N*m', length: 'm' },
        signConvention: 'APPLIED_TO_STRUCTURE',
        sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-RIGID-WEIGHT`, sourceRevision: `${entry.sourceSegment.id}:${half}` }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label: loadCaseId, description: 'M024 live BM1 InputXML bend-resolved case.' },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives,
    profile: loadCaseProfile({
      gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' },
    }),
  });
}

function displacementStressResults(authorities, sustained, operating, codeAuthorities) {
  const { profile, editionDataset: dataset } = codeAuthorities;
  return authorities.modelEntries.flatMap((entry) => ['I', 'J'].map((end) => {
    const sus = sustained.recovery.elementActions.find((row) => row.elementId === entry.elementId).local[end];
    const ope = operating.recovery.elementActions.find((row) => row.elementId === entry.elementId).local[end];
    const localAction = Object.fromEntries(
      ['fx', 'fy', 'fz', 'mx', 'my', 'mz'].map((field) => [field, ope[field] - sus[field]]),
    );
    return compileCodeResult({
      codeProfile: profile,
      editionDataset: dataset,
      stressFactorSet: entry.stressFactorSet,
      category: 'DISPLACEMENT_STRESS_RANGE',
      codePointId: `${entry.segment.id}.${end}`,
      componentId: entry.sourceSegment.id,
      combinationId: 'BM1-OPERATING-MINUS-SUSTAINED',
      frameElementRecord: frameForEntry(operating, entry),
      sectionResolution: entry.section,
      materialResolution: authorities.material,
      localAction,
      pressureStressContribution: null,
      coldTemperature: { value: INSTALLATION_TEMPERATURE, source: 'M020 explicit installation-temperature authority' },
      occasionalCategoryId: null,
    });
  }));
}

export function frameForEntry(analysis, entry) {
  if (!entry.component) {
    const frame = analysis.frameElements.find((row) => row.elementId === entry.elementId);
    if (!frame) throw new Error(`Missing frame element ${entry.elementId}.`);
    return frame;
  }
  const component = analysis.pipingComponents.find((row) => row.componentId === entry.component.componentId);
  const frame = component?.elements[entry.componentElementIndex]?.frameElement;
  if (!frame) throw new Error(`Missing component frame element ${entry.elementId}.`);
  return frame;
}

function buildReport(authorities, sustained, operating, code) {
  const sourceNodeIds = new Set(authorities.normalized.geometry.nodes.map((node) => node.id));
  const bendCodePoints = authorities.modelEntries
    .flatMap((entry, index) => entry.bendAuthority ? code.slice(index * 2, index * 2 + 2).map((row) => ({
      sourceSegmentId: entry.sourceSegment.id,
      analysisElementId: entry.segment.id,
      fromNode: entry.referenceFromNode,
      toNode: entry.referenceToNode,
      codePointId: row.codePointId,
      inPlaneSif: entry.bendAuthority.pressureCorrectedInPlaneSif,
      outOfPlaneSif: entry.bendAuthority.pressureCorrectedOutOfPlaneSif,
      factorSetSemanticHash: entry.stressFactorSet.semanticHash,
    })) : []);
  return Object.freeze({
    schema: 'm024-bm1-inputxml-bend-analysis-report/v1',
    sourceSemanticHash: authorities.source.semanticHash,
    conditionedTopologyHash: authorities.conditioned.semanticHash,
    counts: {
      sourceNodes: authorities.normalized.geometry.nodes.length,
      sourceElements: authorities.normalized.geometry.segments.length,
      analysisNodes: authorities.analysisGeometry.nodes.length,
      analysisElements: authorities.modelEntries.length,
      rigidComponents: authorities.rigidComponents.length,
      bendComponents: authorities.bendComponents.length,
      bendSpans: authorities.normalized.geometry.segments.filter((row) => row.type === 'BEND').length,
      bendCodePoints: bendCodePoints.length,
      activeSourceSifs: authorities.normalized.geometry.segments.flatMap((row) => row.meta.analysis.sifs ?? []).length,
    },
    limitations: [
      'InputXML declares no installation temperature or thermal expansion coefficient; M020 explicitly uses 293.15 K and 1.17e-5 1/K.',
      'M024 expands each CAESAR bend input element into its incoming straight remainder plus two B-3.2 curved-component chords at the declared near, midpoint and far station identities.',
      'M024 derives pressure-corrected elbow flexibility and directional SIFs from the existing ASME B31.3-2006 Appendix D Table D300 Note (7) authority pattern; no value is fitted to CAESAR output.',
      'One-way +Y restraints are represented by their engaged linear fixed-UY state.',
      'CAESAR restraints at nodes 70 and 80 declare friction coefficient 0.3; restraint friction remains outside this linear benchmark.',
      'reaction.* values are reactions applied by the restraint to the structure; CAESAR RESTRAINT_REPORT uses the equal-and-opposite hardware convention.',
    ],
    diagnostics: authorities.normalized.geometry.diagnostics.map((row) => row.code),
    nodes: authorities.analysisGeometry.nodes.map((node) => ({
      sourceNodeId: node.id,
      sourceDeclared: sourceNodeIds.has(node.id),
      kernelNodeId: authorities.kernelNodeByReference.get(node.id),
      restraint: node.restraint,
      sourceRestraints: node.meta.restraints ?? [],
      position: { x: node.x, y: node.y, z: node.z },
      sustained: nodalResult(sustained, authorities.kernelNodeByReference.get(node.id)),
      operating: nodalResult(operating, authorities.kernelNodeByReference.get(node.id)),
    })),
    elements: authorities.modelEntries.map((entry, index) => ({
      sourceElementId: entry.sourceSegment.id,
      analysisElementId: entry.segment.id,
      kernelElementId: entry.elementId,
      fromNode: entry.referenceFromNode,
      toNode: entry.referenceToNode,
      sourceType: entry.sourceSegment.type,
      analysisRole: entry.analysisRole,
      rigid: entry.rigid,
      bendAuthority: entry.bendAuthority,
      analysisAuthority: entry.sourceSegment.meta.analysis,
      sustained: sustained.recovery.elementActions.find((row) => row.elementId === entry.elementId),
      operating: operating.recovery.elementActions.find((row) => row.elementId === entry.elementId),
      displacementStressRange: code.slice(index * 2, index * 2 + 2),
    })),
    sifCodePoints: bendCodePoints,
    bendComponents: authorities.bendDefinitions.map((definition) => ({
      sourceSegmentId: definition.sourceSegment.id,
      componentId: definition.component.componentId,
      stationReferences: definition.stationReferences.map((row) => ({
        referenceNodeId: row.referenceNodeId,
        stationId: row.station.stationId,
        kind: row.station.kind,
        position: row.station.position,
      })),
      subdivision: definition.component.subdivision,
      flexibility: definition.component.flexibility,
      convergence: definition.component.convergence,
      authority: definition.authority,
    })),
    equilibrium: { sustained: sustained.equilibrium, operating: operating.equilibrium },
  });
}

function nodalResult(analysis, nodeId) {
  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
  return {
    displacement: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.displacement, dof)])),
    reaction: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.reactions, dof)])),
  };
}

function equilibrium(authorities, analysis, loadCase) {
  const sum = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
  const addForceAt = (position, force, moment = { mx: 0, my: 0, mz: 0 }) => {
    sum.fx += force.fx;
    sum.fy += force.fy;
    sum.fz += force.fz;
    sum.mx += moment.mx + position[1] * force.fz - position[2] * force.fy;
    sum.my += moment.my + position[2] * force.fx - position[0] * force.fz;
    sum.mz += moment.mz + position[0] * force.fy - position[1] * force.fx;
  };
  for (const primitive of analysis.generatedGravityPrimitives) {
    const entry = authorities.modelEntries.find((row) => row.elementId === primitive.elementId);
    const a = point(authorities.analysisGeometry, entry.referenceFromNode);
    const b = point(authorities.analysisGeometry, entry.referenceToNode);
    const length = Math.hypot(...a.map((value, index) => b[index] - value));
    addForceAt(
      a.map((value, index) => (value + b[index]) / 2),
      {
        fx: primitive.startIntensity.fx * length,
        fy: primitive.startIntensity.fy * length,
        fz: primitive.startIntensity.fz * length,
      },
    );
  }
  for (const primitive of loadCase.primitives.filter((row) => row.kind === 'NODAL_FORCE_MOMENT')) {
    const node = authorities.compilation.model.nodes.find((row) => row.nodeId === primitive.nodeId);
    addForceAt([node.position.x, node.position.y, node.position.z], primitive.force, primitive.moment);
  }
  const reactionByNode = new Map();
  for (const row of analysis.execution.reactions) {
    const record = reactionByNode.get(row.nodeId) ?? { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
    const field = { UX: 'fx', UY: 'fy', UZ: 'fz', RX: 'mx', RY: 'my', RZ: 'mz' }[row.dof];
    record[field] += row.value;
    reactionByNode.set(row.nodeId, record);
  }
  for (const [nodeId, reaction] of reactionByNode) {
    const node = authorities.compilation.model.nodes.find((row) => row.nodeId === nodeId);
    addForceAt([node.position.x, node.position.y, node.position.z], reaction, reaction);
  }
  const scaleValue = Math.max(
    1,
    ...analysis.generatedGravityPrimitives.map((row) => {
      const entry = authorities.modelEntries.find((candidate) => candidate.elementId === row.elementId);
      return Math.hypot(row.startIntensity.fx, row.startIntensity.fy, row.startIntensity.fz) * entry.segment.length;
    }),
  );
  return {
    residual: sum,
    normalizedWorst: Math.max(...Object.values(sum).map(Math.abs)) / scaleValue,
  };
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => row.id === nodeId);
  if (!node) throw new Error(`Missing BM1 node ${nodeId}.`);
  return [node.x, node.y, node.z];
}

function add(left, right) { return left.map((value, index) => value + right[index]); }
function subtract(left, right) { return left.map((value, index) => value - right[index]); }
function scale(vector, factor) { return vector.map((value) => value * factor); }
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function unit(vector) {
  const norm = Math.hypot(...vector);
  if (!(norm > 0)) throw new Error('M024 bend direction must be nonzero.');
  return vector.map((value) => value / norm);
}
