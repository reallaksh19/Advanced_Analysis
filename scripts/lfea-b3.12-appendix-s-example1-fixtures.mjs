import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
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
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compilePipingComponent,
  sealComponentFactorSet,
} from '../src/core/linear-fea-piping-components/index.js';
import {
  augmentPipingComponentTemperatureAuthorities,
  expandPipeWallGravitySourceAuthorities,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const APPENDIX_S_SOURCE =
  'ASME-B31.3-2006-APPENDIX-S-EXAMPLE-1';
export const OUTER_DIAMETER = 0.4064;
export const WALL_THICKNESS = 0.00953;
export const BEND_RADIUS = 0.6096;
export const OPERATING_PRESSURE = 3.45e6;
export const INSTALLATION_TEMPERATURE = 294.15;
export const OPERATING_TEMPERATURE = 533.15;
export const ELASTIC_MODULUS = 203.4e9;
export const POISSON_RATIO = 0.3;
export const SHEAR_MODULUS = ELASTIC_MODULUS / (2 * (1 + POISSON_RATIO));
export const MASS_DENSITY = 7833.4;
export const CONTENTS_MASS_PER_LENGTH = 117.841;
export const INSULATION_MASS_PER_LENGTH = 37.456;

/*
 * ASME B31.3-2006 Appendix C, Table C-1, Group 1 carbon/low-alloy
 * steel gives total thermal expansion from 70°F to 500°F as 3.7 in
 * per 100 ft. The B-3.1 uniform-alpha formulation consumes one mean
 * coefficient, so the declared coefficient is the published total
 * strain divided by this benchmark's 21°C -> 260°C temperature rise:
 *
 *   epsilon = 3.7 in / (100 ft * 12 in/ft) = 0.0030833333333333333
 *   deltaT  = 260 - 21 = 239 K
 *   alpha   = epsilon / deltaT = 1.2900976290097629e-5 1/K
 */
export const PUBLISHED_TOTAL_EXPANSION_IN_PER_100FT = 3.7;
export const THERMAL_EXPANSION_COEFFICIENT =
  (PUBLISHED_TOTAL_EXPANSION_IN_PER_100FT / 1200)
  / (OPERATING_TEMPERATURE - INSTALLATION_TEMPERATURE);

/*
 * ASME B31.3-2006 Appendix D, Table D300, welding elbow, with Note (7)
 * pressure correction. All dimensions are nominal, in the same units.
 *
 *   r = (D - t) / 2
 *   h = t R / r^2
 *   k = 1.65 / h
 *   k_p = k / [1 + 6(P/E)(r/t)^(7/3)(R/r)^(1/3)]
 *
 * For D=0.4064 m, t=0.00953 m, R=0.6096 m, P=3.45 MPa,
 * and E=203.4 GPa:
 *
 *   r                         = 0.198435 m
 *   h                         = 0.14753712217178722
 *   k (unpressurised)         = 11.183626030598562
 *   pressure denominator      = 1.1764632062363378
 *   k_p                       = 9.506141774188135
 *
 * SIFs are not used in this stiffness benchmark. For reviewer context only,
 * the same Appendix D expressions give unpressurised ii=3.2233562286309296,
 * io=2.6861301905257746 and pressure-corrected ii=2.619611948608015,
 * io=2.1830099571733457. The Peng/SIMFLEX-II paper reports lower SIFs
 * (~1.949/~1.624); those are a secondary stress-result cross-check and do
 * not replace the Appendix D flexibility factor required here.
 */
const meanRadius = (OUTER_DIAMETER - WALL_THICKNESS) / 2;
const flexibilityCharacteristic =
  (WALL_THICKNESS * BEND_RADIUS) / meanRadius ** 2;
const unpressurisedFlexibility = 1.65 / flexibilityCharacteristic;
const pressureDenominator = 1
  + 6
    * (OPERATING_PRESSURE / ELASTIC_MODULUS)
    * (meanRadius / WALL_THICKNESS) ** (7 / 3)
    * (BEND_RADIUS / meanRadius) ** (1 / 3);
const pressureSifDenominator = 1
  + 3.25
    * (OPERATING_PRESSURE / ELASTIC_MODULUS)
    * (meanRadius / WALL_THICKNESS) ** (5 / 2)
    * (BEND_RADIUS / meanRadius) ** (2 / 3);
const inPlaneSif = 0.9 / flexibilityCharacteristic ** (2 / 3);
const outOfPlaneSif = 0.75 / flexibilityCharacteristic ** (2 / 3);

export const FLEXIBILITY_DERIVATION = Object.freeze({
  source: 'ASME B31.3-2006 Appendix D Table D300 welding elbow and Note (7)',
  outerDiameter: OUTER_DIAMETER,
  nominalWallThickness: WALL_THICKNESS,
  bendRadius: BEND_RADIUS,
  meanCrossSectionRadius: meanRadius,
  flexibilityCharacteristic,
  unpressurisedFlexibilityFactor: unpressurisedFlexibility,
  pressure: OPERATING_PRESSURE,
  elasticModulus: ELASTIC_MODULUS,
  pressureCorrectionDenominator: pressureDenominator,
  pressureCorrectedFlexibilityFactor:
    unpressurisedFlexibility / pressureDenominator,
  unpressurisedInPlaneSif: inPlaneSif,
  unpressurisedOutOfPlaneSif: outOfPlaneSif,
  sifPressureCorrectionDenominator: pressureSifDenominator,
  pressureCorrectedInPlaneSif: inPlaneSif / pressureSifDenominator,
  pressureCorrectedOutOfPlaneSif: outOfPlaneSif / pressureSifDenominator,
});

export const PUBLISHED_DISPLACEMENTS = Object.freeze([
  { label: '10', nodeId: 'APP-S.N10', uxMm: 0, uyMm: 0 },
  { label: '15', nodeId: 'APP-S.N15', uxMm: 18.3, uyMm: -1.3 },
  { label: '20', nodeId: 'APP-S.N20', uxMm: 36.7, uyMm: 0 },
  { label: '30 near', nodeId: 'APP-S.B30.N0', uxMm: 44.0, uyMm: -3.7 },
  { label: '30 mid', nodeId: 'APP-S.B30.N1', uxMm: 44.7, uyMm: -2.3 },
  { label: '30 far', nodeId: 'APP-S.B30.N2', uxMm: 41.4, uyMm: 0.4 },
  { label: '40 near', nodeId: 'APP-S.B40.N0', uxMm: -23.0, uyMm: 15.1 },
  { label: '40 mid', nodeId: 'APP-S.B40.N1', uxMm: -26.4, uyMm: 17.8 },
  { label: '40 far', nodeId: 'APP-S.B40.N2', uxMm: -25.7, uyMm: 19.2 },
  { label: '45', nodeId: 'APP-S.N45', uxMm: -18.3, uyMm: 13.5 },
  { label: '50', nodeId: 'APP-S.N50', uxMm: 0, uyMm: 0 },
]);

export const PUBLISHED_ACTIONS = Object.freeze([
  { label: '10', axialForceN: 26500, bendingMomentNm: 21520 },
  { label: '15', axialForceN: 26500, bendingMomentNm: 10710 },
  { label: '20', axialForceN: 26500, bendingMomentNm: 47560 },
  { label: '30 near', axialForceN: 26500, bendingMomentNm: 57530 },
  { label: '30 mid', axialForceN: 46300, bendingMomentNm: 69860 },
  { label: '30 far', axialForceN: 37800, bendingMomentNm: 65320 },
  { label: '40 near', axialForceN: 25920, bendingMomentNm: 63930 },
  { label: '40 mid', axialForceN: 36250, bendingMomentNm: 70860 },
  { label: '40 far', axialForceN: 26500, bendingMomentNm: 65190 },
  { label: '45', axialForceN: 26500, bendingMomentNm: 14900 },
  { label: '50', axialForceN: 26500, bendingMomentNm: 47480 },
]);

export const PUBLISHED_SUPPORT_LOADS = Object.freeze([
  { nodeId: 'APP-S.N10', dof: 'UX', value: -26500, quantity: 'force' },
  { nodeId: 'APP-S.N10', dof: 'UY', value: -12710, quantity: 'force' },
  { nodeId: 'APP-S.N10', dof: 'RZ', value: 21520, quantity: 'moment', absolute: true },
  { nodeId: 'APP-S.N20', dof: 'UY', value: -63050, quantity: 'force' },
  { nodeId: 'APP-S.N50', dof: 'UX', value: 26500, quantity: 'force' },
  { nodeId: 'APP-S.N50', dof: 'UY', value: 2810, quantity: 'force' },
  { nodeId: 'APP-S.N50', dof: 'RZ', value: 47480, quantity: 'moment', absolute: true },
]);

export const POINTS = Object.freeze({
  'APP-S.N10': [0, 0, 0],
  'APP-S.N15': [6.10, 0, 0],
  'APP-S.N20': [12.20, 0, 0],
  'APP-S.B30.N0': [15.25 - BEND_RADIUS, 0, 0],
  'APP-S.B30.N2': [15.25, BEND_RADIUS, 0],
  'APP-S.B40.N0': [15.25, 6.10 - BEND_RADIUS, 0],
  'APP-S.B40.N2': [15.25 + BEND_RADIUS, 6.10, 0],
  'APP-S.N45': [18.30, 6.10, 0],
  'APP-S.N50': [24.40, 6.10, 0],
});

const STRAIGHT_SPANS = Object.freeze([
  { elementId: 'APP-S.E10-15', nodeI: 'APP-S.N10', nodeJ: 'APP-S.N15' },
  { elementId: 'APP-S.E15-20', nodeI: 'APP-S.N15', nodeJ: 'APP-S.N20' },
  { elementId: 'APP-S.E20-B30', nodeI: 'APP-S.N20', nodeJ: 'APP-S.B30.N0' },
  { elementId: 'APP-S.EB30-B40', nodeI: 'APP-S.B30.N2', nodeJ: 'APP-S.B40.N0' },
  { elementId: 'APP-S.EB40-45', nodeI: 'APP-S.B40.N2', nodeJ: 'APP-S.N45' },
  { elementId: 'APP-S.E45-50', nodeI: 'APP-S.N45', nodeJ: 'APP-S.N50' },
]);

export function materialAuthority() {
  const points = [{
    absoluteTemperature: OPERATING_TEMPERATURE,
    elasticModulus: ELASTIC_MODULUS,
    shearModulus: SHEAR_MODULUS,
    poissonRatio: POISSON_RATIO,
    massDensity: MASS_DENSITY,
    thermalExpansionCoefficient: THERMAL_EXPANSION_COEFFICIENT,
  }];
  const source = {
    sourceId: `${APPENDIX_S_SOURCE}-A106B`,
    sourceRevision: 'S301.3.1-APPENDIX-C-TABLE-C1-C6',
    points,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: 'CS-A106B-APPENDIX-S',
    sourceEvidence: sourceEvidence(source),
    points,
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: 'MAT-A106B-APPENDIX-S-533K',
      materialId: table.materialId,
      evaluationTemperature: OPERATING_TEMPERATURE,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

export function sectionAuthority() {
  const source = {
    sourceId: `${APPENDIX_S_SOURCE}-NPS16-STD`,
    sourceRevision: 'TABLE-S301.3.1-NOMINAL',
    outerDiameter: OUTER_DIAMETER,
    wallThickness: WALL_THICKNESS,
  };
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: 'SEC-NPS16-STD-APPENDIX-S',
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: OUTER_DIAMETER,
    wallThickness: WALL_THICKNESS,
    sourceEvidence: sourceEvidence(source),
  };
  return resolvePipeSection({
    request: {
      ...payload,
      semanticHash: computePipeSectionRequestSemanticHash(payload),
    },
    profile: PIPE_SECTION_PROFILE,
  });
}

export function appendixSBendFactorSet(componentId, flexibilityFactor) {
  const derivation = {
    ...FLEXIBILITY_DERIVATION,
    selectedFlexibilityFactor: flexibilityFactor,
    componentId,
  };
  const regressionControl = flexibilityFactor === 1;
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: `${componentId}.FS`,
    componentType: 'BEND',
    sourceIdentity: {
      standard: regressionControl ? 'M013_REGRESSION_CONTROL' : 'ASME_B31_3_2006',
      edition: regressionControl ? '01' : '2006',
      ruleId: regressionControl
        ? 'FORCED-RIGID-ELBOW-K-1'
        : 'APPENDIX-D-TABLE-D300-WELDING-ELBOW-NOTE-7',
      sourceRevision: 'M013-01',
      sourceSemanticHash: semanticHash(derivation),
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'APPENDIX-D-WELDING-ELBOW',
      evaluatedBy: 'M013-APPENDIX-S-FLEXIBILITY-DERIVATION',
    },
    flexibilityFactor: {
      value: flexibilityFactor,
      source: regressionControl
        ? 'M013 forced k=1 rigid-elbow regression control'
        : 'ASME B31.3-2006 Appendix D Table D300 and Note (7)',
    },
    flexibilityGeometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: true,
    pressureBasis: regressionControl
      ? 'M013 regression retains the pressure-stiffening profile while forcing k=1'
      : 'P1=3.45 MPa gauge; Appendix D Note (7) pressure correction',
    userOverride: null,
    semanticHash: '',
  });
}

export function buildAppendixSAuthorities(
  flexibilityFactor = FLEXIBILITY_DERIVATION.pressureCorrectedFlexibilityFactor,
) {
  const material = materialAuthority();
  const section = sectionAuthority();
  const frameProfile = eulerBernoulliProfile();
  const bendProfile = componentProfile({
    bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
    convergenceRequired: false,
    bendMaxAngleDegrees: { value: 90, source: 'M014-MINIMUM-EVEN-BEND-POLICY' },
    bendMinimumElements: { value: 2, source: 'M014-MINIMUM-EVEN-BEND-POLICY' },
    bendMinimumElementsBetweenStations: {
      value: 1,
      source: 'M014-MINIMUM-EVEN-BEND-POLICY',
    },
  });
  const bend30 = compilePipingComponent({
    componentId: 'APP-S.B30',
    componentType: 'BEND',
    profile: bendProfile,
    arc: {
      tangentStart: POINTS['APP-S.B30.N0'],
      tangentEnd: POINTS['APP-S.B30.N2'],
      incomingDirection: [1, 0, 0],
      declaredRadius: BEND_RADIUS,
    },
    material,
    section,
    frameElementProfile: frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: [0, 0, 1],
    factorSet: appendixSBendFactorSet('APP-S.B30', flexibilityFactor),
  });
  const bend40 = compilePipingComponent({
    componentId: 'APP-S.B40',
    componentType: 'BEND',
    profile: bendProfile,
    arc: {
      tangentStart: POINTS['APP-S.B40.N0'],
      tangentEnd: POINTS['APP-S.B40.N2'],
      incomingDirection: [0, 1, 0],
      declaredRadius: BEND_RADIUS,
    },
    material,
    section,
    frameElementProfile: frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: [0, 0, 1],
    factorSet: appendixSBendFactorSet('APP-S.B40', flexibilityFactor),
  });
  const components = [bend30, bend40];
  for (const bend of components) {
    if (bend.elements.length !== 2 || bend.codeStations.length !== 3) {
      throw new Error(`${bend.componentId} must have exactly two elements and near/mid/far stations.`);
    }
  }
  const compilation = compileMechanicalModel(
    mechanicalModelInput({ material, section, components }),
  );
  const loadCase = compileOperatingLoadCase(compilation, components);
  const temperaturesByElement = new Map(
    loadCase.primitives
      .filter((primitive) => primitive.kind === 'TEMPERATURE')
      .map((primitive) => [primitive.elementId, primitive]),
  );
  const straightFrameElements = STRAIGHT_SPANS.map((span) => {
    const axes = resolveFrameLocalAxes({
      nodeI: POINTS[span.nodeI],
      nodeJ: POINTS[span.nodeJ],
      referenceVector: [0, 0, 1],
      profile: FRAME_LOCAL_AXIS_PROFILE,
    });
    return compileFrameElement({
      elementId: span.elementId,
      material,
      section,
      localAxes: { result: axes, profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: frameProfile,
      distributedLoads: [],
      temperature: temperaturesByElement.get(span.elementId),
      releases: [],
      endSprings: [],
      rigidOffsets: null,
    });
  });
  return {
    material,
    section,
    frameProfile,
    components,
    compilation,
    loadCase,
    straightFrameElements,
  };
}

export function solveAppendixS(
  flexibilityFactor = FLEXIBILITY_DERIVATION.pressureCorrectedFlexibilityFactor,
) {
  const authorities = buildAppendixSAuthorities(flexibilityFactor);
  const gravityExpanded = expandPipeWallGravitySourceAuthorities({
    compilation: authorities.compilation,
    loadCase: authorities.loadCase,
    frameElements: authorities.straightFrameElements,
    pipingComponents: authorities.components,
  });
  const thermalExpanded = augmentPipingComponentTemperatureAuthorities({
    compilation: authorities.compilation,
    loadCase: gravityExpanded.loadCase,
    pipingComponents: gravityExpanded.pipingComponents,
  });
  const contributions = [
    ...gravityExpanded.frameElements.map(elementContributionFromFrameElement),
    ...thermalExpanded.pipingComponents.flatMap((component) =>
      elementContributionsFromPipingComponent(component)),
  ];
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: contributions,
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
  return {
    ...authorities,
    loadCase: thermalExpanded.loadCase,
    frameElements: gravityExpanded.frameElements,
    pipingComponents: thermalExpanded.pipingComponents,
    generatedGravityPrimitives: gravityExpanded.generatedPrimitives,
    gravityDerivations: gravityExpanded.derivations,
    thermalBindings: thermalExpanded.bindings,
    execution,
    recovery,
  };
}

function mechanicalModelInput({ material, section, components }) {
  const componentNodes = components.flatMap((component) =>
    component.codeStations.map((station) => ({
      nodeId: station.nodeId,
      position: station.position,
      sourceComponentId: component.componentId,
    })),
  );
  const straightOnlyNodes = [
    'APP-S.N10',
    'APP-S.N15',
    'APP-S.N20',
    'APP-S.N45',
    'APP-S.N50',
  ].map((nodeId) => ({
    nodeId,
    position: POINTS[nodeId],
    sourceComponentId: 'APP-S.PIPE',
  }));
  const nodes = [...straightOnlyNodes, ...componentNodes];
  const componentSegments = components.flatMap((component) => {
    const stations = [...component.codeStations]
      .sort((left, right) => left.arcFraction - right.arcFraction);
    return component.elements.map((entry, index) => ({
      elementId: entry.elementId,
      nodeI: stations[index].nodeId,
      nodeJ: stations[index + 1].nodeId,
      sourceComponentId: component.componentId,
    }));
  });
  const segments = [
    ...STRAIGHT_SPANS.map((span) => ({ ...span, sourceComponentId: 'APP-S.PIPE' })),
    ...componentSegments,
  ];
  const localAxisResults = segments.map((segment) => ({
    evidenceIdentity: `AXIS-${segment.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: nodePosition(nodes, segment.nodeI),
      nodeJ: nodePosition(nodes, segment.nodeJ),
      referenceVector: [0, 0, 1],
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const anchors = ['APP-S.N10', 'APP-S.N50'].flatMap((nodeId) =>
    ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
      declarationId: `C-${nodeId}-${dof}`,
      kind: 'NODAL_RESTRAINT',
      nodeId,
      dof,
      behavior: 'FIXED',
    })),
  );
  const support20 = {
    declarationId: 'C-APP-S.N20-UY-ENGAGED-YPLUS',
    kind: 'NODAL_RESTRAINT',
    nodeId: 'APP-S.N20',
    dof: 'UY',
    behavior: 'FIXED',
  };
  return {
    modelIdentity: 'APP-S-EXAMPLE-1-MECH',
    modelRevision: 1,
    sourceSemanticHash: semanticHash({
      source: APPENDIX_S_SOURCE,
      geometry: POINTS,
      flexibility: FLEXIBILITY_DERIVATION,
    }),
    conditionedTopology: {
      geometry: {
        schemaVersion: 'canonical-geometry-v1',
        nodes: nodes.map((entry) => ({
          id: `TOPO/${entry.nodeId}`,
          x: entry.position[0],
          y: entry.position[1],
          z: entry.position[2],
          restraint: 'FREE',
          sourceComponentUid: entry.sourceComponentId,
          meta: {},
        })),
        segments: segments.map((entry) => ({
          id: `TOPO/${entry.elementId}`,
          startNodeId: `TOPO/${entry.nodeI}`,
          endNodeId: `TOPO/${entry.nodeJ}`,
          type: 'PIPE',
          sourceComponentUid: entry.sourceComponentId,
        })),
        source: APPENDIX_S_SOURCE,
        unit: 'm',
        diagnostics: [],
        summary: {},
      },
      semanticHash: semanticHash({
        source: APPENDIX_S_SOURCE,
        nodes: nodes.map((entry) => [entry.nodeId, entry.position]),
        segments: segments.map((entry) => [entry.elementId, entry.nodeI, entry.nodeJ]),
      }),
    },
    nodeBindings: nodes.map((entry) => ({
      nodeId: entry.nodeId,
      conditionedNodeId: `CN-${entry.nodeId}`,
      topologyNodeId: `TOPO/${entry.nodeId}`,
    })),
    elementBindings: segments.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: `CS-${entry.elementId}`,
      topologySegmentId: `TOPO/${entry.elementId}`,
      materialStateId: material.materialState.materialStateId,
      sectionStateId: section.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.sourceComponentId,
    })),
    materialResolutions: [material],
    sectionResolutions: [section],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: [...anchors, support20],
    profile: compilerProfile(),
  };
}

function compileOperatingLoadCase(compilation, components) {
  const componentElementIds = new Set(
    components.flatMap((component) =>
      component.elements.map((entry) => entry.elementId)),
  );
  const elementIds = compilation.model.elements.map((element) => element.elementId);
  const primitives = [
    gravityPrimitive(),
    ...elementIds.flatMap((elementId) => [
      distributedWeightPrimitive(elementId, 'CONTENTS', CONTENTS_MASS_PER_LENGTH),
      distributedWeightPrimitive(elementId, 'INSULATION', INSULATION_MASS_PER_LENGTH),
      pressurePrimitive(elementId, componentElementIds.has(elementId)),
      temperaturePrimitive(elementId),
    ]),
  ];
  return compilePhysicalLoadCase({
    loadCaseId: 'APP-S-TW-1',
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: {
      label: 'Appendix S Example 1 TW-1',
      description:
        'Operating gravity, pressure-stiffened elbows, and installation-to-T1 thermal expansion.',
    },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile({
      gravitationalAcceleration: {
        value: 9.80665,
        source: 'SI-STANDARD-GRAVITY-EXACT',
      },
    }),
  });
}

function gravityPrimitive() {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-APP-S-GRAVITY',
    kind: 'GRAVITY',
    // M007/M012 expand physical intensity as -direction * lineWeight.
    // Declaring +Y therefore applies this benchmark's physical gravity in -Y.
    direction: { x: 0, y: 1, z: 0 },
    basis: 'GLOBAL',
    includedMassSources: ['PIPE_WALL', 'CONTENTS', 'INSULATION'],
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S_SOURCE}-GRAVITY`,
      sourceRevision: 'S301.5-TW-1',
      acceleration: 9.80665,
    }),
  };
}

function distributedWeightPrimitive(elementId, component, massPerUnitLength) {
  const evidence = sourceEvidence({
    sourceId: `${APPENDIX_S_SOURCE}-TABLE-S301.3.1`,
    sourceRevision: `${component}-${elementId}`,
    massPerUnitLength,
  });
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-APP-S-${component}-${elementId}`,
    kind: 'DISTRIBUTED_WEIGHT',
    elementId,
    weightComponent: component,
    massPerUnitLength,
    densityEvidence: evidence,
    geometryEvidence: evidence,
    sourceEvidence: evidence,
  };
}

function pressurePrimitive(elementId, pressureStiffening) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-APP-S-PRESSURE-${elementId}`,
    kind: 'PRESSURE',
    elementId,
    pressure: OPERATING_PRESSURE,
    pressureBasis: 'GAUGE',
    authorizedEffects: {
      codeStress: false,
      pressureStiffening,
      axialThrust: false,
      bourdon: false,
    },
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S_SOURCE}-PRESSURE`,
      sourceRevision: `P1-${elementId}`,
      pressure: OPERATING_PRESSURE,
      pressureStiffening,
    }),
  };
}

function temperaturePrimitive(elementId) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-APP-S-TEMPERATURE-${elementId}`,
    kind: 'TEMPERATURE',
    elementId,
    operatingTemperature: OPERATING_TEMPERATURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    stiffnessEvaluationMaterialStateId: 'MAT-A106B-APPENDIX-S-533K',
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S_SOURCE}-TEMPERATURE`,
      sourceRevision: `T1-${elementId}`,
      installationTemperature: INSTALLATION_TEMPERATURE,
      operatingTemperature: OPERATING_TEMPERATURE,
    }),
  };
}

function sourceEvidence(source) {
  return {
    sourceId: source.sourceId,
    sourceRevision: source.sourceRevision,
    sourceSemanticHash: semanticHash(source),
  };
}

function nodePosition(nodes, nodeId) {
  const found = nodes.find((entry) => entry.nodeId === nodeId);
  if (found === undefined) throw new Error(`Missing node position for ${nodeId}.`);
  return found.position;
}
