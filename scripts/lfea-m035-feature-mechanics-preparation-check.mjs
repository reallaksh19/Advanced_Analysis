#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import {
  REDUCER_CONDENSATION_REQUEST_SCHEMA,
  REDUCER_SAMPLING_RULES,
  compileTenCylinderReducerAuthority,
  predictReducerBoundaryActions,
  qualifyReducerSamplingRules,
  sealReducerCondensationRequest,
} from '../src/core/linear-fea-reducer-condensation/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { sealInputXmlLinearSolvePreparation } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation-contract.js';
import { compileInputXmlFeatureMechanicsPreparation } from '../src/core/linear-piping-analysis-consumer/inputxml-feature-mechanics-preparation.js';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { materialResolution, sectionResolution } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { reducedSectionResolution, componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';

const material = materialResolution();
const runSection = sectionResolution();
const branchSection = reducedSectionResolution('M035-FEATURE-BRANCH-SEC');
const hash = (value) => semanticHash(value);
const analysis = Object.freeze({ pressure: 2e6, elasticModulus: material.materialState.elasticModulus });

const nodes = [
  ['B0', -2, 0, 0], ['B1', 0, 0, 0], ['B2', 0, 2, 0],
  ['T0', -2, 5, 0], ['TJ', 0, 5, 0], ['T1', 2, 5, 0], ['TB', 0, 7, 0],
  ['R0', 0, 10, 0], ['R1', 1, 10, 0],
].map(([id, x, y, z]) => ({ id, x, y, z, restraint: 'FREE', meta: { caesarNodeNumber: id } }));
const segments = [
  segment('BEND', 'B0', 'B1', 'BEND', runSection, { bendDeclaredRadius: 0.25, bendStationNode1: 'BMID', bendStationNode2: 'BNEAR' }),
  segment('BOUT', 'B1', 'B2', 'PIPE', runSection),
  segment('RUN-I', 'T0', 'TJ', 'PIPE', runSection),
  segment('TEE', 'TJ', 'T1', 'TEE', runSection),
  segment('BRANCH', 'TJ', 'TB', 'PIPE', branchSection),
  segment('RED', 'R0', 'R1', 'PIPE', runSection),
];
const geometry = Object.freeze({
  schemaVersion: 'canonical-geometry/v1',
  nodes: Object.freeze(nodes),
  segments: Object.freeze(segments),
  source: 'M035-SYNTHETIC-MIXED-FEATURE',
  unit: 'm',
  diagnostics: Object.freeze([]),
  summary: Object.freeze({ jobName: 'M035-SYNTHETIC', nodeCount: nodes.length, segmentCount: segments.length }),
  valid: true,
});

const sectionById = new Map(segments.map((row) => [row.id, row.id === 'BRANCH' ? branchSection : runSection]));
const segmentBindings = segments.map((row, index) => {
  const section = sectionById.get(row.id);
  return Object.freeze({
    bindingId: `M035:B:${row.id}`,
    segmentId: row.id,
    sourceFeatureId: `PIPINGELEMENT[${index}]`,
    sourceIndex: index,
    componentKind: row.id === 'BEND' ? 'BEND' : row.id === 'TEE' ? 'TEE' : row.id === 'RED' ? 'REDUCER' : 'STRAIGHT_PIPE',
    representabilityDisposition: 'IMPLEMENTED_EXACTLY',
    limitationCode: null,
    materialResolutionSemanticHash: material.semanticHash,
    materialResolutionEvidenceHash: material.evidenceHash,
    physicalSectionSemanticHash: section.semanticHash,
    analysisSectionSemanticHash: section.semanticHash,
    rigidAuthoritySemanticHash: null,
    thermalAuthoritySemanticHash: hash({ thermal: row.id }),
    thermalAuthorityStatus: 'RESOLVED',
  });
});
const loadBindings = segments.map((row, index) => Object.freeze({
  loadBindingId: `M035:L:${row.id}`,
  segmentId: row.id,
  sourceFeatureId: `PIPINGELEMENT[${index}]`,
  gravity: Object.freeze({ semanticHash: hash({ gravity: row.id }) }),
  pressure: Object.freeze({ semanticHash: hash({ pressure: row.id }) }),
  thermal: Object.freeze({ semanticHash: hash({ thermalLoad: row.id }) }),
}));
const sourcePreparation = sealInputXmlLinearSolvePreparation({
  schema: 'fea-inputxml-linear-solve-preparation/v1',
  preparationId: 'M035-SYNTHETIC-PREP',
  modelId: 'M035-SYNTHETIC',
  analysisProfileId: 'M035-FEATURE-MECHANICS-TEST',
  modelCapabilityId: 'LINEAR_STATIC',
  modelCapabilityStatus: 'PASS',
  sourceBundleSemanticHash: hash({ source: 'semantic' }),
  sourceBundleEvidenceHash: hash({ source: 'evidence' }),
  modelHealthSemanticHash: hash({ health: 'semantic' }),
  modelHealthEvidenceHash: hash({ health: 'evidence' }),
  unitNormalizationSemanticHash: hash({ unit: 'semantic' }),
  unitNormalizationEvidenceHash: hash({ unit: 'evidence' }),
  normalizedGeometry: geometry,
  materialResolutions: [material],
  sectionResolutions: [runSection, branchSection],
  rigidAuthorities: [],
  segmentBindings,
  loadBindings,
  caseAvailability: {
    sustained: { status: 'PREPARED_AUTHORITY_ONLY', loadCaseCompilationAvailable: false, reasonCodes: ['TEST'] },
    operating: { status: 'PREPARED_AUTHORITY_ONLY', loadCaseCompilationAvailable: false, reasonCodes: ['TEST'] },
  },
  limitations: [],
  summary: { sourceSegmentCount: segments.length, preparedSegmentCount: segments.length },
  executionBoundary: {
    constraintsCompiled: false,
    mechanicalModelCompiled: false,
    loadPrimitivesCompiled: false,
    stiffnessAssembled: false,
    factorizationCreated: false,
    solveAuthorized: false,
    reasonCodes: ['TEST_PREPARATION_ONLY'],
  },
});

const teeFactors = calculateB31Factors({
  schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculationId: 'M035-FEATURE-TEE-CALC',
  componentId: 'TEE',
  editionProfileId: 'B31_3_2020_B31J_2017',
  componentType: 'WELDING_TEE',
  geometry: {
    schema: COMPONENT_GEOMETRY_SCHEMA,
    componentType: 'WELDING_TEE',
    lengthUnit: 'm',
    runOuterDiameter: runSection.dimensions.outerDiameter,
    runWallThickness: runSection.dimensions.wallThickness,
    branchOuterDiameter: branchSection.dimensions.outerDiameter,
    branchWallThickness: branchSection.dimensions.wallThickness,
    fittingQuality: 'VERIFIED_B16_9',
    sourceEvidence: { sourceId: 'M035-FEATURE-TEE', sourceRevision: '01' },
  },
  momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
  semanticHash: '',
});
assert.equal(teeFactors.status, 'QUALIFIED');

const reducerRequest = sealReducerCondensationRequest({
  schema: REDUCER_CONDENSATION_REQUEST_SCHEMA,
  reducerId: 'M035-FEATURE-REDUCER',
  length: 1,
  fromSection: { outerDiameter: runSection.dimensions.outerDiameter, wallThickness: runSection.dimensions.wallThickness },
  toSection: { outerDiameter: branchSection.dimensions.outerDiameter, wallThickness: branchSection.dimensions.wallThickness },
  segmentCount: 10,
  samplingRule: 'MIDPOINT_LINEAR_INTERPOLATION_CANDIDATE_V1',
  material: {
    elasticModulus: material.materialState.elasticModulus,
    shearModulus: material.materialState.shearModulus,
    massDensity: material.materialState.massDensity,
    thermalExpansionCoefficient: material.materialState.thermalExpansionCoefficient,
  },
  gravity: { enabled: true, acceleration: 9.80665, directionLocal: [0, -1, 0], fluidDensity: 800, insulationThickness: 0.03, insulationDensity: 100 },
  thermal: { installationTemperature: 293.15, operatingTemperature: 373.15 },
  sourceEvidence: { sourceId: 'M035-FEATURE-REDUCER', sourceRevision: '01', sourceSemanticHash: hash({ reducer: 'source' }) },
  semanticHash: '',
});
const reducerAuthority = compileTenCylinderReducerAuthority(reducerRequest);
const reducerDisplacement = [0,0,0,0,0,0, 1e-4,-2e-4,3e-4, 2e-4,-3e-4,4e-4];
const reducerQualification = qualifyReducerSamplingRules({
  cases: [{
    caseId: 'SYNTHETIC-REDUCER',
    request: reducerRequest,
    displacement: reducerDisplacement,
    referenceAction: predictReducerBoundaryActions({ authority: reducerAuthority, displacement: reducerDisplacement }),
  }],
  samplingRules: REDUCER_SAMPLING_RULES,
  absoluteTolerance: 1e-7,
  relativeTolerance: 1e-11,
});
assert.equal(reducerQualification.status, 'QUALIFIED');
assert.equal(reducerQualification.qualifiedSamplingRule, reducerRequest.samplingRule);

const feature = compileInputXmlFeatureMechanicsPreparation({
  sourcePreparation,
  editionProfileId: 'B31_3_2020_B31J_2017',
  momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
  smooth90FlexibilityCorrection: false,
  frameElementProfile: eulerBernoulliProfile(),
  pipingComponentProfile: componentProfile({ bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1' }),
  localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
  teeFactorResultBySegmentId: new Map([['TEE', teeFactors]]),
  reducerRequestBySegmentId: new Map([['RED', reducerRequest]]),
  reducerSamplingQualification: reducerQualification,
});

assert.equal(feature.schema, 'fea-inputxml-feature-mechanics-preparation/v1');
assert.equal(feature.bendComponents.length, 1);
assert.equal(feature.teeJunctions.length, 1);
assert.equal(feature.reducerAuthorities.length, 1);
assert.equal(feature.executionBoundary.sourceV1PreparationMutated, false);
assert.equal(feature.executionBoundary.solveAuthorized, false);
assert.ok(feature.sourceToAnalysisElementIds.BEND.length > 1);
assert.deepEqual(feature.sourceToAnalysisElementIds.TEE, ['TEE']);
assert.deepEqual(feature.sourceToAnalysisElementIds.RED, ['RED']);
const tee = feature.teeJunctions[0];
assert.equal(tee.junctionNodeId, 'TJ');
assert.equal(tee.modifiers.length, 3);
assert.ok(tee.modifiers.every((row) => ['I','J'].includes(row.junctionEnd)));
assert.ok(tee.modifiers.every((row) => row.rotationalSprings.every((spring) => spring.end === row.junctionEnd)));
assert.ok(tee.modifiers.find((row) => row.role === 'BRANCH').rigidOffset);
assert.equal(feature.reducerAuthorities[0].authority.samplingRule, reducerQualification.qualifiedSamplingRule);

assert.throws(() => compileInputXmlFeatureMechanicsPreparation({
  sourcePreparation,
  editionProfileId: 'B31_3_2020_B31J_2017',
  momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
  smooth90FlexibilityCorrection: false,
  frameElementProfile: eulerBernoulliProfile(),
  pipingComponentProfile: componentProfile({ bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1' }),
  teeFactorResultBySegmentId: new Map(),
  reducerRequestBySegmentId: new Map([['RED', reducerRequest]]),
  reducerSamplingQualification: reducerQualification,
}), /must cover exactly/);

console.log(JSON.stringify({
  check: 'm035-feature-mechanics-preparation',
  status: 'PASS',
  sourceSegments: sourcePreparation.normalizedGeometry.segments.length,
  analysisSegments: feature.analysisGeometry.segments.length,
  bendComponents: feature.bendComponents.length,
  teeJunctions: feature.teeJunctions.length,
  reducerAuthorities: feature.reducerAuthorities.length,
  semanticHash: feature.semanticHash,
}, null, 2));
console.log('M035 mixed-feature mechanics preparation PASS');

function segment(id, startNodeId, endNodeId, type, section, extraMeta = {}) {
  const start = nodes?.find?.((row) => row.id === startNodeId);
  const end = nodes?.find?.((row) => row.id === endNodeId);
  return Object.freeze({
    id, startNodeId, endNodeId, type,
    sourceComponentUid: `SOURCE:${id}`,
    length: start && end ? Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z) : 1,
    diameter: section.dimensions.outerDiameter,
    thickness: section.dimensions.wallThickness,
    material: 'TEST',
    meta: { sourceIndex: 0, analysis, ...extraMeta },
  });
}
