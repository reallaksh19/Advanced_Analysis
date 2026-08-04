import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { conditionGeometry, FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  normalizeLinearPipingInputXmlGeometry,
  sealLinearPipingInputXmlSource,
  sealLinearPipingInputXmlUnitProfile,
  expandPipeWallGravitySourceAuthorities,
  augmentPipingComponentTemperatureAuthorities,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE, resolveLinearFeaMaterialState, sealMaterialTable } from '../src/core/linear-fea-material/index.js';
import { PIPE_SECTION_FORMULATION_ID, PIPE_SECTION_PROFILE, PIPE_SECTION_REQUEST_SCHEMA, computePipeSectionRequestSemanticHash, resolvePipeSection } from '../src/core/linear-fea-section/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import { compileSolverExecution, elementContributionFromFrameElement, elementContributionsFromPipingComponent } from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { compileCodeResult, sealCodeProfile, sealEditionDataset, sealStressFactorSet } from '../src/core/linear-fea-b31-code-engine/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
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
export const SCREENING_ALLOWABLE = 138e6;
export const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'M020 retain one source span per BM1 PIPINGELEMENT' },
  bendSeedingSegments: { value: 4, source: 'M020 unresolved internal bend stations are not curvature seeded' },
  bendLengthErrorLimit: { value: 0.01, source: 'M020 benchmark conditioning authority' },
});

export function sourceEvidence(value) {
  return { sourceId: value.sourceId, sourceRevision: value.sourceRevision, sourceSemanticHash: semanticHash(value) };
}

export function buildBm1InputXmlAuthorities() {
  const content = readFileSync(BM1_PATH, 'utf8');
  const source = sealLinearPipingInputXmlSource({ sourceId: SOURCE_ID, sourceRevision: semanticHash({ content }), fileName: 'benchmarks/LFEA/BM1/BM1_InputXML.xml', mediaType: 'application/xml', content });
  const parsed = inputXmlToCanonicalGeometry(content, { unit: 'mm', source: SOURCE_ID, restraintTypeCodeMap: { 0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE' }, bendRadiusTolerance: 1e-6 });
  const unitProfile = sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA, profileId: 'M020-BM1-INPUTXML-UNIT-R1', registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: ['mm'], sourceEvidence: { authority: 'CAESAR-II-INPUTXML-UNITS-BLOCK', documentId: 'BM1_InputXML.xml', revision: source.sourceRevision, sourceSemanticHash: source.semanticHash }, semanticHash: '',
  });
  const normalized = normalizeLinearPipingInputXmlGeometry(parsed, unitProfile);
  const conditioned = conditionGeometry(normalized.geometry, [], CONDITIONING_PROFILE);
  const material = materialAuthority(normalized.geometry, source);
  const sections = sectionAuthorities(normalized.geometry, source);
  const frameProfile = eulerBernoulliProfile();
  const rigidProfile = componentProfile({ valveBodyRule: 'VALVE_RIGID_BODY_V1', convergenceRequired: false });
  const rigidDefinitions = normalized.geometry.segments.filter((segment) => segment.meta.analysis.rigid).map((segment) => ({
    sourceSegmentId: segment.id,
    component: compileRigidComponent(segment, normalized.geometry, material, sections.get(segment.id), frameProfile, rigidProfile),
  }));
  const rigidComponents = rigidDefinitions.map((entry) => entry.component);
  const componentBySegment = new Map(rigidDefinitions.map((entry) => [entry.sourceSegmentId, entry.component]));
  const kernelNodeBySource = kernelNodeMap(normalized.geometry, componentBySegment);
  const modelEntries = normalized.geometry.segments.map((segment) => {
    const component = componentBySegment.get(segment.id) ?? null;
    return { segment, component, elementId: component ? component.elements[0].elementId : `BM1.${segment.id}`, nodeI: kernelNodeBySource.get(segment.startNodeId), nodeJ: kernelNodeBySource.get(segment.endNodeId), section: sections.get(segment.id) };
  });
  const compilation = compileModel({ source, conditioned, normalized: normalized.geometry, material, sections, frameProfile, rigidComponents, kernelNodeBySource, modelEntries });
  return { content, source, parsed, normalized, conditioned, material, sections, frameProfile, rigidComponents, componentBySegment, kernelNodeBySource, modelEntries, compilation };
}

function materialAuthority(geometry, source) {
  const analyses = geometry.segments.map((segment) => segment.meta.analysis);
  const first = analyses[0];
  for (const analysis of analyses) {
    if (!(analysis.elasticModulus > 0) || !(analysis.pipeDensity > 0) || !(analysis.poissonRatio > 0)) throw new Error('BM1 material fields must resolve on every segment.');
    if (Math.abs(analysis.elasticModulus - first.elasticModulus) > first.elasticModulus * 1e-9 || Math.abs(analysis.pipeDensity - first.pipeDensity) > first.pipeDensity * 1e-9 || Math.abs(analysis.poissonRatio - first.poissonRatio) > 1e-12) throw new Error('M020 currently requires one shared BM1 material stiffness state.');
  }
  const evaluationTemperature = Math.max(...analyses.map((row) => row.operatingTemperature));
  const pointValue = { absoluteTemperature: evaluationTemperature, elasticModulus: first.elasticModulus, shearModulus: first.elasticModulus / (2 * (1 + first.poissonRatio)), poissonRatio: first.poissonRatio, massDensity: first.pipeDensity, thermalExpansionCoefficient: THERMAL_EXPANSION_COEFFICIENT };
  const table = sealMaterialTable({ schema: 'fea-linear-material-table/v1', materialId: 'BM1-A106-GRADE-B-INPUTXML', sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-MATERIAL`, sourceRevision: source.sourceRevision, point: pointValue, installationTemperatureDisclosure: 'InputXML has no installation temperature or alpha; M020 declares 293.15 K and 1.17e-5 1/K explicitly.' }), points: [pointValue], semanticHash: '' });
  return resolveLinearFeaMaterialState({ table, request: { materialStateId: 'BM1-MAT-INPUTXML', materialId: table.materialId, evaluationTemperature }, profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE });
}

function sectionAuthorities(geometry, source) {
  const byKey = new Map();
  const result = new Map();
  for (const segment of geometry.segments) {
    const key = `${segment.diameter}:${segment.thickness}`;
    let authority = byKey.get(key);
    if (!authority) {
      const payload = { schema: PIPE_SECTION_REQUEST_SCHEMA, sectionStateId: `BM1-SEC-${byKey.size + 1}`, formulationId: PIPE_SECTION_FORMULATION_ID, outerDiameter: segment.diameter, wallThickness: segment.thickness, sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-SECTION`, sourceRevision: `${source.sourceRevision}:${key}`, outerDiameter: segment.diameter, wallThickness: segment.thickness }) };
      authority = resolvePipeSection({ request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) }, profile: PIPE_SECTION_PROFILE });
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
    componentId, componentType: 'VALVE_FLANGE', profile, start, end, material, section,
    massProperties: { mass: { value: weight / GRAVITY, source: `InputXML RIGID WEIGHT on ${segment.id}` }, centreOfGravity: start.map((value, index) => (value + end[index]) / 2) },
    endConnections: { I: { portId: `${componentId}.I`, connectionType: 'INPUTXML_RIGID' }, J: { portId: `${componentId}.J`, connectionType: 'INPUTXML_RIGID' } },
    bodyStiffnessMultiplier: null, frameElementProfile: frameProfile, localAxisProfile: FRAME_LOCAL_AXIS_PROFILE, referenceVector: [0, 0, 1],
  });
}

function kernelNodeMap(geometry, componentBySegment) {
  const result = new Map(geometry.nodes.map((node) => [node.id, `BM1.N${node.id}`]));
  for (const segment of geometry.segments) {
    const component = componentBySegment.get(segment.id);
    if (!component) continue;
    result.set(segment.startNodeId, component.codeStations.find((row) => row.stationId.endsWith('CP-I')).nodeId);
    result.set(segment.endNodeId, component.codeStations.find((row) => row.stationId.endsWith('CP-J')).nodeId);
  }
  return result;
}

function compileModel({ source, conditioned, normalized, material, sections, kernelNodeBySource, modelEntries }) {
  const localAxisResults = modelEntries.map((entry) => ({ evidenceIdentity: `AXIS-${entry.elementId}`, result: resolveFrameLocalAxes({ nodeI: point(normalized, entry.segment.startNodeId), nodeJ: point(normalized, entry.segment.endNodeId), referenceVector: [0, 0, 1], profile: FRAME_LOCAL_AXIS_PROFILE }) }));
  return compileMechanicalModel({
    modelIdentity: 'BM1-LIVE-INPUTXML-M020', modelRevision: 1, sourceSemanticHash: source.semanticHash, conditionedTopology: conditioned,
    nodeBindings: normalized.nodes.map((node) => ({ nodeId: kernelNodeBySource.get(node.id), conditionedNodeId: `CN-${node.id}`, topologyNodeId: node.id })),
    elementBindings: modelEntries.map((entry) => ({ elementId: entry.elementId, conditionedSegmentId: entry.segment.id, topologySegmentId: entry.segment.id, materialStateId: material.materialState.materialStateId, sectionStateId: entry.section.sectionState.sectionStateId, formulationId: 'PIPE_FRAME3D_LINEAR_V1', localAxisEvidenceIdentity: `AXIS-${entry.elementId}`, sourceComponentId: entry.component?.componentId ?? entry.segment.sourceComponentUid })),
    materialResolutions: [material], sectionResolutions: sections.unique, localAxisResults, localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(normalized, kernelNodeBySource), profile: compilerProfile(),
  });
}

function constraintDeclarations(geometry, kernelNodeBySource) {
  const rows = new Map();
  const add = (sourceNode, dof) => rows.set(`${sourceNode}:${dof}`, { declarationId: `BM1-C-${sourceNode}-${dof}`, kind: 'NODAL_RESTRAINT', nodeId: kernelNodeBySource.get(sourceNode), dof, behavior: 'FIXED' });
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof);
    for (const restraint of node.meta.restraints ?? []) {
      if (restraint.typeCode === '14') add(node.id, 'UY');
      if (restraint.typeCode === '8') {
        const direction = [Math.abs(restraint.xCosine ?? 0), Math.abs(restraint.yCosine ?? 0), Math.abs(restraint.zCosine ?? 0)];
        const axis = direction.indexOf(Math.max(...direction));
        const transverse = axis === 0 ? ['UY', 'UZ'] : axis === 1 ? ['UX', 'UZ'] : ['UX', 'UY'];
        transverse.forEach((dof) => add(node.id, dof));
      }
    }
  }
  return [...rows.values()];
}

export function solveBm1InputXml() {
  const authorities = buildBm1InputXmlAuthorities();
  const sustained = analyseCase(authorities, 'BM1-SUSTAINED', false);
  const operating = analyseCase(authorities, 'BM1-OPERATING-T1', true);
  const code = displacementStressResults(authorities, sustained, operating);
  return { ...authorities, sustained, operating, code, report: buildReport(authorities, sustained, operating, code) };
}

function analyseCase(authorities, loadCaseId, thermal) {
  const loadCase = compileCase(authorities, loadCaseId, thermal);
  const temperatureByElement = new Map(loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]));
  const frameElements = authorities.modelEntries.filter((entry) => !entry.component).map((entry) => compileFrameElement({
    elementId: entry.elementId, material: authorities.material, section: entry.section,
    localAxes: { result: resolveFrameLocalAxes({ nodeI: point(authorities.normalized.geometry, entry.segment.startNodeId), nodeJ: point(authorities.normalized.geometry, entry.segment.endNodeId), referenceVector: [0, 0, 1], profile: FRAME_LOCAL_AXIS_PROFILE }), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile: authorities.frameProfile, distributedLoads: [], temperature: temperatureByElement.get(entry.elementId) ?? null, releases: [], endSprings: [], rigidOffsets: null,
  }));
  const gravityExpanded = expandPipeWallGravitySourceAuthorities({ compilation: authorities.compilation, loadCase, frameElements, pipingComponents: authorities.rigidComponents });
  const thermalExpanded = augmentPipingComponentTemperatureAuthorities({ compilation: authorities.compilation, loadCase: gravityExpanded.loadCase, pipingComponents: gravityExpanded.pipingComponents });
  const execution = compileSolverExecution({ compilation: authorities.compilation, elementContributions: [...gravityExpanded.frameElements.map(elementContributionFromFrameElement), ...thermalExpanded.pipingComponents.flatMap(elementContributionsFromPipingComponent)], loadCase: thermalExpanded.loadCase, solverProfile: solverProfile() });
  const recovery = compileResultRecovery({ compilation: authorities.compilation, execution, loadCase: thermalExpanded.loadCase, frameElements: gravityExpanded.frameElements, pipingComponents: thermalExpanded.pipingComponents, recoveryProfile: recoveryProfile() });
  return { loadCase: thermalExpanded.loadCase, frameElements: gravityExpanded.frameElements, pipingComponents: thermalExpanded.pipingComponents, generatedGravityPrimitives: gravityExpanded.generatedPrimitives, execution, recovery, equilibrium: equilibrium(authorities, execution, gravityExpanded.generatedPrimitives, thermalExpanded.loadCase) };
}

function compileCase(authorities, loadCaseId, thermal) {
  const primitives = [{ schema: 'fea-linear-load-primitive/v1', primitiveId: `${loadCaseId}-GRAVITY`, kind: 'GRAVITY', direction: { x: 0, y: 1, z: 0 }, basis: 'GLOBAL', includedMassSources: ['PIPE_WALL', 'CONTENTS'], sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-GRAVITY`, sourceRevision: loadCaseId }) }];
  for (const entry of authorities.modelEntries) {
    const analysis = entry.segment.meta.analysis;
    const innerDiameter = entry.section.dimensions.outerDiameter - 2 * entry.section.dimensions.wallThickness;
    const contentsMass = analysis.fluidDensity * Math.PI * innerDiameter ** 2 / 4;
    primitives.push({ schema: 'fea-linear-load-primitive/v1', primitiveId: `${loadCaseId}-CONTENTS-${entry.elementId}`, kind: 'DISTRIBUTED_WEIGHT', elementId: entry.elementId, weightComponent: 'CONTENTS', massPerUnitLength: contentsMass, densityEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-FDENS`, sourceRevision: `${entry.segment.id}:${analysis.fluidDensity}` }), geometryEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-BORE`, sourceRevision: entry.segment.id }), sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-CONTENTS`, sourceRevision: entry.segment.id }) });
    primitives.push({ schema: 'fea-linear-load-primitive/v1', primitiveId: `${loadCaseId}-PRESSURE-${entry.elementId}`, kind: 'PRESSURE', elementId: entry.elementId, pressure: analysis.pressure, pressureBasis: 'GAUGE', authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false }, sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-PRESSURE1`, sourceRevision: `${entry.segment.id}:${analysis.pressure}` }) });
    if (thermal) primitives.push({ schema: 'fea-linear-load-primitive/v1', primitiveId: `${loadCaseId}-TEMPERATURE-${entry.elementId}`, kind: 'TEMPERATURE', elementId: entry.elementId, operatingTemperature: analysis.operatingTemperature, installationTemperature: INSTALLATION_TEMPERATURE, stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId, thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1', sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.segment.id}:${analysis.operatingTemperature}` }) });
  }
  for (const entry of authorities.modelEntries.filter((row) => row.component)) {
    const half = entry.segment.meta.analysis.rigid.weight / 2;
    for (const [suffix, nodeId] of [['I', entry.nodeI], ['J', entry.nodeJ]]) primitives.push({ schema: 'fea-linear-load-primitive/v1', primitiveId: `${loadCaseId}-RIGID-WEIGHT-${entry.segment.id}-${suffix}`, kind: 'NODAL_FORCE_MOMENT', nodeId, basis: { kind: 'GLOBAL' }, force: { fx: 0, fy: -half, fz: 0 }, moment: { mx: 0, my: 0, mz: 0 }, units: { force: 'N', moment: 'N*m', length: 'm' }, signConvention: 'APPLIED_TO_STRUCTURE', sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-RIGID-WEIGHT`, sourceRevision: `${entry.segment.id}:${half}` }) });
  }
  return compilePhysicalLoadCase({ loadCaseId, loadCaseClass: 'MIXED_PHYSICAL', presentation: { label: loadCaseId, description: 'M020 live BM1 InputXML self-consistency case.' }, modelReference: modelReferenceFromCompilation(authorities.compilation), primitives, profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }) });
}

function displacementStressResults(authorities, sustained, operating) {
  const profile = sealCodeProfile({ schema: 'fea-b31-code-profile/v1', profileId: 'LINEAR-B31-CODE-PROFILE-R1', codeProfileId: 'M020-BM1-SELF-CONSISTENCY', scope: 'METALLIC_PROCESS_PIPING_B31_3', editionStandard: 'ASME_B31_3_2024', flexibilitySource: 'ASME_B31J_2023', temperatureInterpolationPolicy: 'LINEAR_BRACKET_INTERPOLATION_V1', displacementRangeCombinationRuleId: 'DISPLACEMENT_RANGE_COLD_HOT_CYCLE_REDUCTION_LINEAR_V1', occasionalDurationFactors: [], liberalAllowableUse: false, liberalAllowableUpliftFactor: null, semanticHash: '' });
  const hot = authorities.material.materialState.evaluationTemperature;
  const dataset = sealEditionDataset({ schema: 'fea-b31-edition-dataset/v1', datasetId: 'M020-BM1-SCREENING-NOT-CAESAR-AUTHORITY', sourceIdentity: { standard: 'M020_SELF_CONSISTENCY', edition: '01', sourceRevision: 'INPUTXML-ALLOWABLES-SENTINEL-ONLY', sourceSemanticHash: semanticHash({ screening: SCREENING_ALLOWABLE }) }, materialId: authorities.material.materialState.materialId, allowablePoints: [{ absoluteTemperature: INSTALLATION_TEMPERATURE, allowableStress: { value: SCREENING_ALLOWABLE, source: 'M020 non-qualification screening value; InputXML allowable fields are sentinel-only' } }, { absoluteTemperature: hot, allowableStress: { value: SCREENING_ALLOWABLE, source: 'M020 non-qualification screening value; InputXML allowable fields are sentinel-only' } }], displacementRangeCoefficients: { coldWeight: { value: 1.25, source: 'M020 generic B31 displacement-range profile' }, hotWeight: { value: 0.25, source: 'M020 generic B31 displacement-range profile' }, cycleReductionFactor: { value: 1, source: 'M020 no cycle authority in InputXML; unity screening only' } }, weldJointFactor: { value: 1, source: 'M020 unity screening factor' }, semanticHash: '' });
  return authorities.modelEntries.flatMap((entry) => ['I', 'J'].map((end) => {
    const sus = sustained.recovery.elementActions.find((row) => row.elementId === entry.elementId).local[end];
    const ope = operating.recovery.elementActions.find((row) => row.elementId === entry.elementId).local[end];
    const localAction = Object.fromEntries(['fx', 'fy', 'fz', 'mx', 'my', 'mz'].map((field) => [field, ope[field] - sus[field]]));
    const frame = entry.component ? operating.pipingComponents.find((row) => row.componentId === entry.component.componentId).elements[0].frameElement : operating.frameElements.find((row) => row.elementId === entry.elementId);
    return compileCodeResult({ codeProfile: profile, editionDataset: dataset, stressFactorSet: unityStressFactors(entry.segment.sourceComponentUid), category: 'DISPLACEMENT_STRESS_RANGE', codePointId: `${entry.segment.id}.${end}`, componentId: entry.segment.sourceComponentUid, combinationId: 'BM1-OPERATING-MINUS-SUSTAINED', frameElementRecord: frame, sectionResolution: entry.section, materialResolution: authorities.material, localAction, pressureStressContribution: null, coldTemperature: { value: INSTALLATION_TEMPERATURE, source: 'M020 explicit installation-temperature authority' }, occasionalCategoryId: null });
  }));
}

function unityStressFactors(componentId) {
  const directional = () => ({ axial: { value: 1, source: 'M020 InputXML contains no active SIF records' }, torsional: { value: 1, source: 'M020 InputXML contains no active SIF records' }, inPlaneBending: { value: 1, source: 'M020 InputXML contains no active SIF records' }, outOfPlaneBending: { value: 1, source: 'M020 InputXML contains no active SIF records' } });
  return sealStressFactorSet({ schema: 'fea-b31-stress-factor-set/v1', factorSetId: `${componentId}.UNITY`, componentId, sourceIdentity: { standard: 'M020_INPUTXML', edition: '01', ruleId: 'NO-ACTIVE-SIF-UNITY', sourceRevision: 'BM1-LIVE', sourceSemanticHash: semanticHash({ componentId }) }, applicability: { status: 'WITHIN_RANGE', ruleId: 'NO-ACTIVE-SIF', evaluatedBy: 'M020-BM1-INPUTXML' }, momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' }, sustainedIndices: directional(), occasionalIndices: directional(), displacementSifs: directional(), userOverride: null, semanticHash: '' });
}

function buildReport(authorities, sustained, operating, code) {
  return Object.freeze({ schema: 'm020-bm1-inputxml-analysis-report/v1', sourceSemanticHash: authorities.source.semanticHash, conditionedTopologyHash: authorities.conditioned.semanticHash,
    counts: { sourceNodes: authorities.normalized.geometry.nodes.length, sourceElements: authorities.normalized.geometry.segments.length, rigidComponents: authorities.rigidComponents.length, bendSpans: authorities.normalized.geometry.segments.filter((row) => row.type === 'BEND').length, activeSifs: authorities.normalized.geometry.segments.flatMap((row) => row.meta.analysis.sifs ?? []).length },
    limitations: ['InputXML declares no installation temperature or thermal expansion coefficient; M020 explicitly uses 293.15 K and 1.17e-5 1/K.', 'BM1 bend spans declare internal CAESAR station nodes that are not inserted by the current adapter; they remain finite chord frame spans and are not reported as resolved arcs.', 'ALLOWABLESTRESS values in the live file are sentinel-only; B-4 results use a clearly labelled non-qualification screening allowable.', 'One-way +Y restraints are represented by their engaged linear fixed-UY state.', 'Insulation density is not declared on every source element, so insulation self-weight is reported as unavailable rather than partially expanded by the all-element gravity consumer.'],
    diagnostics: authorities.normalized.geometry.diagnostics.map((row) => row.code),
    nodes: authorities.normalized.geometry.nodes.map((node) => ({ sourceNodeId: node.id, kernelNodeId: authorities.kernelNodeBySource.get(node.id), restraint: node.restraint, sourceRestraints: node.meta.restraints ?? [], sustained: nodalResult(sustained, authorities.kernelNodeBySource.get(node.id)), operating: nodalResult(operating, authorities.kernelNodeBySource.get(node.id)) })),
    elements: authorities.modelEntries.map((entry, index) => ({ sourceElementId: entry.segment.id, kernelElementId: entry.elementId, fromNode: entry.segment.startNodeId, toNode: entry.segment.endNodeId, sourceType: entry.segment.type, analysisAuthority: entry.segment.meta.analysis, sustained: sustained.recovery.elementActions.find((row) => row.elementId === entry.elementId), operating: operating.recovery.elementActions.find((row) => row.elementId === entry.elementId), displacementStressRange: code.slice(index * 2, index * 2 + 2) })),
    sifCodePoints: [], equilibrium: { sustained: sustained.equilibrium, operating: operating.equilibrium } });
}

function nodalResult(analysis, nodeId) {
  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
  return { displacement: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.displacement, dof)])), reaction: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.reactions, dof)])) };
}

function equilibrium(authorities, execution, generated, loadCase) {
  const sum = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
  const addForceAt = (position, force, moment = { mx: 0, my: 0, mz: 0 }) => { sum.fx += force.fx; sum.fy += force.fy; sum.fz += force.fz; sum.mx += moment.mx + position[1] * force.fz - position[2] * force.fy; sum.my += moment.my + position[2] * force.fx - position[0] * force.fz; sum.mz += moment.mz + position[0] * force.fy - position[1] * force.fx; };
  for (const primitive of generated) { const entry = authorities.modelEntries.find((row) => row.elementId === primitive.elementId); const a = point(authorities.normalized.geometry, entry.segment.startNodeId); const b = point(authorities.normalized.geometry, entry.segment.endNodeId); const length = Math.hypot(...a.map((value, index) => b[index] - value)); addForceAt(a.map((value, index) => (value + b[index]) / 2), { fx: primitive.startIntensity.fx * length, fy: primitive.startIntensity.fy * length, fz: primitive.startIntensity.fz * length }); }
  for (const primitive of loadCase.primitives.filter((row) => row.kind === 'NODAL_FORCE_MOMENT')) { const node = authorities.compilation.model.nodes.find((row) => row.nodeId === primitive.nodeId); addForceAt([node.position.x, node.position.y, node.position.z], primitive.force, primitive.moment); }
  const reactionByNode = new Map();
  for (const row of execution.reactions) { const record = reactionByNode.get(row.nodeId) ?? { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }; const field = { UX: 'fx', UY: 'fy', UZ: 'fz', RX: 'mx', RY: 'my', RZ: 'mz' }[row.dof]; record[field] += row.value; reactionByNode.set(row.nodeId, record); }
  for (const [nodeId, reaction] of reactionByNode) { const node = authorities.compilation.model.nodes.find((row) => row.nodeId === nodeId); addForceAt([node.position.x, node.position.y, node.position.z], reaction, reaction); }
  const scale = Math.max(1, ...generated.map((row) => Math.hypot(row.startIntensity.fx, row.startIntensity.fy, row.startIntensity.fz) * authorities.modelEntries.find((entry) => entry.elementId === row.elementId).segment.length));
  return { residual: sum, normalizedWorst: Math.max(...Object.values(sum).map(Math.abs)) / scale };
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => row.id === nodeId);
  if (!node) throw new Error(`Missing BM1 source node ${nodeId}.`);
  return [node.x, node.y, node.z];
}
