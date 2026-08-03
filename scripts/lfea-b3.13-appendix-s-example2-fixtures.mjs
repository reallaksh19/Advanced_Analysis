import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';
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
import {
  BEND_RADIUS,
  CONTENTS_MASS_PER_LENGTH,
  ELASTIC_MODULUS,
  INSULATION_MASS_PER_LENGTH,
  MASS_DENSITY,
  OUTER_DIAMETER,
  POISSON_RATIO,
  SHEAR_MODULUS,
  WALL_THICKNESS,
  sectionAuthority,
} from './lfea-b3.12-appendix-s-example1-fixtures.mjs';

export const APPENDIX_S2_SOURCE =
  'ASME-B31.3-2006-APPENDIX-S-EXAMPLE-2';
export const INSTALLATION_TEMPERATURE = 294.15;
export const OPERATING_TEMPERATURE = 561.15;
export const OPERATING_PRESSURE = 3.795e6;
export const SYMMETRY_PLANE_X = 24.40;

/*
 * ASME B31.3-2006 Appendix C, Table C-1: Carbon Steel at 550°F gives
 * total linear thermal expansion from 70°F as 4.11 in per 100 ft.
 * B-3.1 consumes one mean coefficient, so Example 2 declares:
 *
 *   epsilon = 4.11 / (100 * 12) = 0.003425
 *   deltaT  = 288 - 21 = 267 K
 *   alpha   = epsilon / deltaT = 1.2827715355805244e-5 1/K
 *
 * This is intentionally distinct from M013's 500°F row (3.62 in/100 ft).
 */
export const PUBLISHED_TOTAL_EXPANSION_IN_PER_100FT = 4.11;
export const THERMAL_EXPANSION_COEFFICIENT =
  (PUBLISHED_TOTAL_EXPANSION_IN_PER_100FT / 1200)
  / (OPERATING_TEMPERATURE - INSTALLATION_TEMPERATURE);

/*
 * ASME B31.3-2006 Appendix D, Table D300, welding elbow, Note (7).
 * Example 2 has the same geometry and modulus as M013 but a different
 * operating pressure, so the geometry terms are retained and the pressure
 * correction is re-evaluated at P1=3.795 MPa:
 *
 *   r   = (D - t) / 2 = 0.198435 m
 *   h   = t R / r^2 = 0.14753712217178722
 *   k   = 1.65 / h = 11.183626030598562
 *   den = 1 + 6(P/E)(r/t)^(7/3)(R/r)^(1/3)
 *       = 1.1941095268599717
 *   k_p = k / den = 9.36566184176338
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
});

/* ASME B31.3-2006 Table S302.5.1, pipe-on-support sign convention. */
export const PUBLISHED_SUPPORT_LOADS = Object.freeze([
  { nodeId: 'APP-S2.N10', dof: 'UX', value: -26600, quantity: 'force' },
  { nodeId: 'APP-S2.N10', dof: 'UY', value: -14050, quantity: 'force' },
  { nodeId: 'APP-S2.N10', dof: 'RZ', value: 27000, quantity: 'moment', absolute: true },
  { nodeId: 'APP-S2.N20', dof: 'UY', value: -58900, quantity: 'force' },
]);

export const POINTS = Object.freeze({
  'APP-S2.N10': [0, 0, 0],
  'APP-S2.N15': [6.10, 0, 0],
  'APP-S2.N20': [12.20, 0, 0],
  'APP-S2.B30.N0': [15.25 - BEND_RADIUS, 0, 0],
  'APP-S2.B30.N2': [15.25, BEND_RADIUS, 0],
  'APP-S2.B40.N0': [15.25, 6.10 - BEND_RADIUS, 0],
  'APP-S2.B40.N2': [15.25 + BEND_RADIUS, 6.10, 0],
  'APP-S2.N45': [18.30, 6.10, 0],
  'APP-S2.N50': [24.40, 6.10, 0],
  'APP-S2.N145': [30.50, 6.10, 0],
  'APP-S2.B140.N2': [33.55 - BEND_RADIUS, 6.10, 0],
  'APP-S2.B140.N0': [33.55, 6.10 - BEND_RADIUS, 0],
  'APP-S2.B130.N2': [33.55, BEND_RADIUS, 0],
  'APP-S2.B130.N0': [33.55 + BEND_RADIUS, 0, 0],
  'APP-S2.N120': [36.60, 0, 0],
  'APP-S2.N115': [42.70, 0, 0],
  'APP-S2.N110': [48.80, 0, 0],
});

const STRAIGHT_SPANS = Object.freeze([
  { elementId: 'APP-S2.E10-15', nodeI: 'APP-S2.N10', nodeJ: 'APP-S2.N15' },
  { elementId: 'APP-S2.E15-20', nodeI: 'APP-S2.N15', nodeJ: 'APP-S2.N20' },
  { elementId: 'APP-S2.E20-B30', nodeI: 'APP-S2.N20', nodeJ: 'APP-S2.B30.N0' },
  { elementId: 'APP-S2.EB30-B40', nodeI: 'APP-S2.B30.N2', nodeJ: 'APP-S2.B40.N0' },
  { elementId: 'APP-S2.EB40-45', nodeI: 'APP-S2.B40.N2', nodeJ: 'APP-S2.N45' },
  { elementId: 'APP-S2.E45-50', nodeI: 'APP-S2.N45', nodeJ: 'APP-S2.N50' },
  { elementId: 'APP-S2.E50-145', nodeI: 'APP-S2.N50', nodeJ: 'APP-S2.N145' },
  { elementId: 'APP-S2.E145-B140', nodeI: 'APP-S2.N145', nodeJ: 'APP-S2.B140.N2' },
  { elementId: 'APP-S2.EB140-B130', nodeI: 'APP-S2.B140.N0', nodeJ: 'APP-S2.B130.N2' },
  { elementId: 'APP-S2.EB130-120', nodeI: 'APP-S2.B130.N0', nodeJ: 'APP-S2.N120' },
  { elementId: 'APP-S2.E120-115', nodeI: 'APP-S2.N120', nodeJ: 'APP-S2.N115' },
  { elementId: 'APP-S2.E115-110', nodeI: 'APP-S2.N115', nodeJ: 'APP-S2.N110' },
]);

const BEND_DEFINITIONS = Object.freeze([
  {
    componentId: 'APP-S2.B30',
    tangentStart: POINTS['APP-S2.B30.N0'],
    tangentEnd: POINTS['APP-S2.B30.N2'],
    incomingDirection: [1, 0, 0],
  },
  {
    componentId: 'APP-S2.B40',
    tangentStart: POINTS['APP-S2.B40.N0'],
    tangentEnd: POINTS['APP-S2.B40.N2'],
    incomingDirection: [0, 1, 0],
  },
  {
    componentId: 'APP-S2.B140',
    tangentStart: POINTS['APP-S2.B140.N0'],
    tangentEnd: POINTS['APP-S2.B140.N2'],
    incomingDirection: [0, 1, 0],
  },
  {
    componentId: 'APP-S2.B130',
    tangentStart: POINTS['APP-S2.B130.N0'],
    tangentEnd: POINTS['APP-S2.B130.N2'],
    incomingDirection: [-1, 0, 0],
  },
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
    sourceId: `${APPENDIX_S2_SOURCE}-A106B`,
    sourceRevision: 'S302.1-S301.1-APPENDIX-C-TABLE-C1-C6',
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
      materialStateId: 'MAT-A106B-APPENDIX-S2-561K',
      materialId: table.materialId,
      evaluationTemperature: OPERATING_TEMPERATURE,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

export function appendixS2BendFactorSet(componentId, flexibilityFactor) {
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
      standard: regressionControl ? 'M016_REGRESSION_CONTROL' : 'ASME_B31_3_2006',
      edition: regressionControl ? '01' : '2006',
      ruleId: regressionControl
        ? 'FORCED-RIGID-ELBOW-K-1'
        : 'APPENDIX-D-TABLE-D300-WELDING-ELBOW-NOTE-7',
      sourceRevision: 'M016-01',
      sourceSemanticHash: semanticHash(derivation),
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'APPENDIX-D-WELDING-ELBOW',
      evaluatedBy: 'M016-APPENDIX-S2-FLEXIBILITY-DERIVATION',
    },
    flexibilityFactor: {
      value: flexibilityFactor,
      source: regressionControl
        ? 'M016 forced k=1 rigid-elbow regression control'
        : 'ASME B31.3-2006 Appendix D Table D300 and Note (7)',
    },
    flexibilityGeometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: true,
    pressureBasis: regressionControl
      ? 'M016 regression retains the pressure-stiffening profile while forcing k=1'
      : 'P1=3.795 MPa gauge; Appendix D Note (7) pressure correction',
    userOverride: null,
    semanticHash: '',
  });
}

export function buildAppendixS2Authorities({
  flexibilityFactor = FLEXIBILITY_DERIVATION.pressureCorrectedFlexibilityFactor,
  includeApexSupport = false,
} = {}) {
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
  const components = BEND_DEFINITIONS.map((definition) =>
    compilePipingComponent({
      componentId: definition.componentId,
      componentType: 'BEND',
      profile: bendProfile,
      arc: {
        tangentStart: definition.tangentStart,
        tangentEnd: definition.tangentEnd,
        incomingDirection: definition.incomingDirection,
        declaredRadius: BEND_RADIUS,
      },
      material,
      section,
      frameElementProfile: frameProfile,
      localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
      referenceVector: [0, 0, 1],
      factorSet: appendixS2BendFactorSet(definition.componentId, flexibilityFactor),
    }));
  for (const bend of components) {
    if (bend.elements.length !== 2 || bend.codeStations.length !== 3) {
      throw new Error(`${bend.componentId} must have exactly two elements and near/mid/far stations.`);
    }
  }
  const compilation = compileMechanicalModel(
    mechanicalModelInput({ material, section, components, includeApexSupport }),
  );
  const loadCase = compileOperatingLoadCase(compilation, components, includeApexSupport);
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
    includeApexSupport,
  };
}

export function solveAppendixS2(options = {}) {
  const authorities = buildAppendixS2Authorities(options);
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

function mechanicalModelInput({ material, section, components, includeApexSupport }) {
  const componentNodes = components.flatMap((component) =>
    component.codeStations.map((station) => ({
      nodeId: station.nodeId,
      position: station.position,
      sourceComponentId: component.componentId,
    })),
  );
  const straightOnlyNodeIds = [
    'APP-S2.N10', 'APP-S2.N15', 'APP-S2.N20', 'APP-S2.N45', 'APP-S2.N50',
    'APP-S2.N145', 'APP-S2.N120', 'APP-S2.N115', 'APP-S2.N110',
  ];
  const straightOnlyNodes = straightOnlyNodeIds.map((nodeId) => ({
    nodeId,
    position: POINTS[nodeId],
    sourceComponentId: 'APP-S2.PIPE',
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
    ...STRAIGHT_SPANS.map((span) => ({ ...span, sourceComponentId: 'APP-S2.PIPE' })),
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
  const anchors = ['APP-S2.N10', 'APP-S2.N110'].flatMap((nodeId) =>
    ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
      declarationId: `C-${nodeId}-${dof}`,
      kind: 'NODAL_RESTRAINT',
      nodeId,
      dof,
      behavior: 'FIXED',
    })),
  );
  const supports = ['APP-S2.N20', 'APP-S2.N120'].map((nodeId) => ({
    declarationId: `C-${nodeId}-UY-ENGAGED`,
    kind: 'NODAL_RESTRAINT',
    nodeId,
    dof: 'UY',
    behavior: 'FIXED',
  }));
  if (includeApexSupport) {
    supports.push({
      declarationId: 'C-APP-S2.N50-UY-ATTACHED-LIFTOFF-SANITY',
      kind: 'NODAL_RESTRAINT',
      nodeId: 'APP-S2.N50',
      dof: 'UY',
      behavior: 'FIXED',
    });
  }
  return {
    modelIdentity: includeApexSupport
      ? 'APP-S-EXAMPLE-2-MECH-APEX-ATTACHED'
      : 'APP-S-EXAMPLE-2-MECH-LIFTOFF',
    modelRevision: 1,
    sourceSemanticHash: semanticHash({
      source: APPENDIX_S2_SOURCE,
      geometry: POINTS,
      flexibility: FLEXIBILITY_DERIVATION,
      includeApexSupport,
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
        source: APPENDIX_S2_SOURCE,
        unit: 'm',
        diagnostics: [],
        summary: {},
      },
      semanticHash: semanticHash({
        source: APPENDIX_S2_SOURCE,
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
    constraintDeclarations: [...anchors, ...supports],
    profile: compilerProfile(),
  };
}

function compileOperatingLoadCase(compilation, components, includeApexSupport) {
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
    loadCaseId: includeApexSupport
      ? 'APP-S2-OPERATING-1-APEX-ATTACHED'
      : 'APP-S2-OPERATING-1-LIFTOFF',
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: {
      label: includeApexSupport
        ? 'Appendix S Example 2 Operating Case 1, apex support attached'
        : 'Appendix S Example 2 Operating Case 1, node 50 lift-off',
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
    primitiveId: 'LP-APP-S2-GRAVITY',
    kind: 'GRAVITY',
    direction: { x: 0, y: 1, z: 0 },
    basis: 'GLOBAL',
    includedMassSources: ['PIPE_WALL', 'CONTENTS', 'INSULATION'],
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S2_SOURCE}-GRAVITY`,
      sourceRevision: 'S302.5.1-OPERATING-CASE-1',
      acceleration: 9.80665,
    }),
  };
}

function distributedWeightPrimitive(elementId, component, massPerUnitLength) {
  const evidence = sourceEvidence({
    sourceId: `${APPENDIX_S2_SOURCE}-S302.1-S301.3.1`,
    sourceRevision: `${component}-${elementId}`,
    massPerUnitLength,
  });
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-APP-S2-${component}-${elementId}`,
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
    primitiveId: `LP-APP-S2-PRESSURE-${elementId}`,
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
      sourceId: `${APPENDIX_S2_SOURCE}-PRESSURE`,
      sourceRevision: `P1-${elementId}`,
      pressure: OPERATING_PRESSURE,
      pressureStiffening,
    }),
  };
}

function temperaturePrimitive(elementId) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-APP-S2-TEMPERATURE-${elementId}`,
    kind: 'TEMPERATURE',
    elementId,
    operatingTemperature: OPERATING_TEMPERATURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    stiffnessEvaluationMaterialStateId: 'MAT-A106B-APPENDIX-S2-561K',
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S2_SOURCE}-TEMPERATURE`,
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
