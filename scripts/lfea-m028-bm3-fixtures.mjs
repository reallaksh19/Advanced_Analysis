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
import { compilePipingComponent, sealComponentFactorSet } from '../src/core/linear-fea-piping-components/index.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import { recoverProgrammedVariableSpringHangerAction } from '../src/core/linear-fea-variable-spring-hanger/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { augmentPipingComponent } from '../src/core/linear-piping-analysis-consumer/gravity-expansion-element-augmentation.js';
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
import { timoshenkoProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const BM3_INPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM3/BM3_InputXML.xml', import.meta.url));
export const BM3_SOURCE_ID = 'CAESAR-II-BM3-RELIEF-FLANGED';
export const INSTALLATION_TEMPERATURE = 293.15;
export const THERMAL_EXPANSION_COEFFICIENT = 1.17e-5;
export const BM3_T1_SECANT_THERMAL_EXPANSION_COEFFICIENT = 1.350414865e-5;
export const BM3_T2_SECANT_THERMAL_EXPANSION_COEFFICIENT = 1.37e-5;
export const BM3_EXPLICIT_K_BEND_EQUIVALENCE = Object.freeze({
  sourceSegmentId: 'IX-S2',
  retainedKFactor: 2.123,
  residualFlexibilityMultiplier: 1.05,
  shearCorrectionFactor: 0.1,
  basis: 'RETAINED_CAESAR_TWO_NODE_BEND_COMPLIANCE_EQUIVALENCE_V1',
  limitation: 'Applies only to the one BM3 bend carrying an explicit InputXML KFACTOR; code-calculated bends retain the qualified annular Timoshenko profile.',
});
export const GRAVITY = 9.80665;
export const CASE_KEYS = Object.freeze(['CASE3_OPE', 'CASE4_SUS', 'CASE5_OCC', 'CASE6_EXP', 'CASE7_EXP']);
export const BM3_MATERIAL_STATES = Object.freeze({
  COLD: Object.freeze({
    modulusField: 'elasticModulus',
    temperatureField: null,
    materialStateId: 'BM3-MAT-INPUTXML-COLD',
  }),
  T1: Object.freeze({
    modulusField: 'hotElasticModulus',
    temperatureField: 'operatingTemperature',
    materialStateId: 'BM3-MAT-INPUTXML-T1',
  }),
  T2: Object.freeze({
    modulusField: 'hotElasticModulus2',
    temperatureField: 'operatingTemperature2',
    materialStateId: 'BM3-MAT-INPUTXML-T2',
  }),
});

export const BM3_BASE_CASES = Object.freeze({
  CASE3_OPE: Object.freeze({ temperatureField: 'operatingTemperature', thermal: true, formula: 'W+T1+P1+H' }),
  CASE4_SUS: Object.freeze({ temperatureField: 'operatingTemperature2', thermal: true, formula: 'W+T2+P1+H' }),
  CASE5_OCC: Object.freeze({ temperatureField: null, thermal: false, formula: 'W+P1+H+F1' }),
});
const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'M032 retains resolved straight spans, two-element bend arcs, and the declared ten-cylinder reducer candidate.' },
  bendSeedingSegments: { value: 4, source: 'M032 bends are resolved through the qualified B-3.2 component authority before conditioning.' },
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
  materialState = 'COLD',
  thermalExpansionCoefficient = THERMAL_EXPANSION_COEFFICIENT,
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
  const material = materialAuthority(normalized.geometry, source, materialState, thermalExpansionCoefficient);
  const frameProfile = timoshenkoProfile();
  const bendProfile = componentProfile({
    bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
    convergenceRequired: false,
    bendMaxAngleDegrees: { value: 90, source: 'M032-CAESAR-GENERATED-NEAR-MID-FAR-STATION-POLICY' },
    bendMinimumElements: { value: 2, source: 'M032-CAESAR-GENERATED-NEAR-MID-FAR-STATION-POLICY' },
    bendMinimumElementsBetweenStations: { value: 1, source: 'M032-CAESAR-GENERATED-NEAR-MID-FAR-STATION-POLICY' },
  });
  const reducerDefinitions = buildReducerDefinitions(normalized.geometry, material, source);
  const rigidDefinitions = buildRigidDefinitions(normalized.geometry, material, source);
  const sectionResolver = createSectionResolver(source);
  const bendDefinitions = buildBendDefinitions({
    sourceGeometry: normalized.geometry,
    material,
    frameProfile,
    bendProfile,
    sectionResolver,
  });
  const analysisGeometry = expandAnalysisGeometry(normalized.geometry, reducerDefinitions, bendDefinitions);
  const conditioned = conditionGeometry(analysisGeometry, [], CONDITIONING_PROFILE);
  const sectionRegistry = buildSectionRegistry({
    analysisGeometry,
    normalizedGeometry: normalized.geometry,
    sectionResolver,
    reducerDefinitions,
    rigidDefinitions,
  });
  const kernelNodeByReference = kernelNodeMap(analysisGeometry, bendDefinitions);
  const modelEntries = buildModelEntries({
    analysisGeometry,
    sourceGeometry: normalized.geometry,
    sectionRegistry,
    kernelNodeByReference,
    reducerDefinitions,
    rigidDefinitions,
    bendDefinitions,
  });
  const pipingComponents = [...bendDefinitions.values()].map((definition) => definition.component);
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
    bendProfile,
    bendDefinitions,
    pipingComponents,
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

function materialAuthority(geometry, source, materialStateKey, thermalExpansionCoefficient) {
  const policy = BM3_MATERIAL_STATES[materialStateKey];
  if (!policy) throw new Error(`Unknown BM3 material state ${materialStateKey}.`);
  const analyses = geometry.segments.map((segment) => segment.meta.analysis);
  const first = analyses[0];
  const selectedModulus = first[policy.modulusField];
  if (!(selectedModulus > 0)) {
    throw new Error(`BM3 ${materialStateKey} elastic modulus is missing or invalid.`);
  }
  for (const row of analyses) {
    const rowModulus = row[policy.modulusField];
    if (!(rowModulus > 0) || !(row.pipeDensity > 0) || !(row.poissonRatio > 0)) {
      throw new Error(`BM3 ${materialStateKey} material stiffness and density must resolve on every segment.`);
    }
    if (Math.abs(rowModulus - selectedModulus) > selectedModulus * 1e-9
      || Math.abs(row.pipeDensity - first.pipeDensity) > first.pipeDensity * 1e-9
      || Math.abs(row.poissonRatio - first.poissonRatio) > 1e-12) {
      throw new Error(`M032 requires one shared BM3 ${materialStateKey} material stiffness state.`);
    }
  }
  const evaluationTemperature = policy.temperatureField === null
    ? INSTALLATION_TEMPERATURE
    : Math.max(...analyses.map((row) => row[policy.temperatureField]).filter(Number.isFinite));
  const pointValue = {
    absoluteTemperature: evaluationTemperature,
    elasticModulus: selectedModulus,
    shearModulus: selectedModulus / (2 * (1 + first.poissonRatio)),
    poissonRatio: first.poissonRatio,
    massDensity: first.pipeDensity,
    thermalExpansionCoefficient,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: `BM3-INPUTXML-MATERIAL-${materialStateKey}`,
    sourceEvidence: sourceEvidence({
      sourceId: `${BM3_SOURCE_ID}-MATERIAL-${materialStateKey}`,
      sourceRevision: source.sourceRevision,
      modulusField: policy.modulusField,
      point: pointValue,
      installationTemperatureDisclosure: `InputXML has no alpha; M032 declares 293.15 K and ${thermalExpansionCoefficient} 1/K explicitly.`,
    }),
    points: [pointValue],
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: policy.materialStateId,
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

function buildBendDefinitions({ sourceGeometry, material, frameProfile, bendProfile, sectionResolver }) {
  const result = new Map();
  for (const sourceSegment of sourceGeometry.segments.filter((segment) => segment.type === 'BEND')) {
    const next = sourceGeometry.segments.find((candidate) => candidate.startNodeId === sourceSegment.endNodeId);
    if (!next) throw new Error(`BM3 bend ${sourceSegment.id} requires one immediately following outlet element.`);
    const intersection = point(sourceGeometry, sourceSegment.endNodeId);
    const incomingDirection = unit(subtract(intersection, point(sourceGeometry, sourceSegment.startNodeId)));
    const outgoingDirection = unit(subtract(point(sourceGeometry, next.endNodeId), intersection));
    const bendAngle = Math.acos(clamp(dot(incomingDirection, outgoingDirection), -1, 1));
    const bendRadius = sourceSegment.meta.bendDeclaredRadius;
    const tangentLength = bendRadius * Math.tan(bendAngle / 2);
    const tangentStart = subtract(intersection, scale(incomingDirection, tangentLength));
    const tangentEnd = add(intersection, scale(outgoingDirection, tangentLength));
    const section = sectionResolver.resolve(sourceSegment.diameter, sourceSegment.thickness, `${sourceSegment.id}:BEND`);
    const componentId = `BM3.BEND.${sourceSegment.id}`;
    const factorResult = calculateB31Factors({
      schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
      calculationId: `M032-BM3-BEND-${sourceSegment.id}`,
      componentId,
      editionProfileId: 'B31_3_2018_APPENDIX_D',
      componentType: 'BEND',
      geometry: {
        schema: COMPONENT_GEOMETRY_SCHEMA,
        componentType: 'BEND',
        lengthUnit: 'm',
        outerDiameter: sourceSegment.diameter,
        wallThickness: sourceSegment.thickness,
        bendRadius,
        pressure: sourceSegment.meta.analysis.pressure,
        elasticModulus: material.materialState.elasticModulus,
        sourceEvidence: {
          sourceId: `${BM3_SOURCE_ID}-BEND-${sourceSegment.id}`,
          sourceRevision: `${bendRadius}:${sourceSegment.meta.analysis.pressure}`,
        },
      },
      momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
      semanticHash: '',
    });
    if (factorResult.status !== 'QUALIFIED' || !factorResult.componentFactorSet) {
      throw new Error(`BM3 bend ${sourceSegment.id} factor calculation blocked: ${JSON.stringify(factorResult.diagnostics)}`);
    }
    const declaredKFactor = sourceSegment.meta.bendKFactor ?? null;
    const factorSet = declaredKFactor === null ? factorResult.componentFactorSet : sealComponentFactorSet({
      ...factorResult.componentFactorSet,
      factorSetId: `${componentId}.INPUTXML-K`,
      sourceIdentity: {
        standard: 'CAESAR_II_INPUTXML',
        edition: 'EXPORTED',
        ruleId: 'BEND_KFACTOR_USER_OVERRIDE',
        sourceRevision: `${sourceSegment.id}:${declaredKFactor}`,
        sourceSemanticHash: semanticHash({ sourceSegmentId: sourceSegment.id, declaredKFactor }),
      },
      applicability: { status: 'WITHIN_RANGE', ruleId: 'INPUTXML_USER_OVERRIDE', evaluatedBy: 'M032-BM3-BEND-CUSTODY' },
      flexibilityFactor: { value: declaredKFactor, source: `InputXML BEND KFACTOR on ${sourceSegment.id}` },
      pressureCorrectionApplied: true,
      pressureBasis: 'Retained InputXML KFACTOR is the final user-entered flexibility value for the pressurized model.',
      userOverride: {
        reason: 'The retained InputXML explicitly overrides the code-calculated bend flexibility factor.',
        source: `BM3_InputXML.xml BEND KFACTOR on ${sourceSegment.id}`,
        sourceRevision: `${sourceSegment.id}:${declaredKFactor}`,
        approver: 'RETAINED_INPUT_AUTHORITY',
      },
      semanticHash: '',
    });
    const segmentationFlexibilityRatio = 1 / Math.cos(bendAngle / 4);
    const explicitKEquivalence = sourceSegment.id === BM3_EXPLICIT_K_BEND_EQUIVALENCE.sourceSegmentId
      ? BM3_EXPLICIT_K_BEND_EQUIVALENCE
      : null;
    const residualFlexibilityMultiplier = explicitKEquivalence?.residualFlexibilityMultiplier ?? 1;
    const effectiveFactorSet = sealComponentFactorSet({
      ...factorSet,
      factorSetId: `${factorSet.factorSetId}.M032-ARC-ADJUSTED`,
      sourceIdentity: {
        ...factorSet.sourceIdentity,
        ruleId: `${factorSet.sourceIdentity.ruleId}_CAESAR_ARC_SEGMENT_ADJUSTMENT`,
        sourceRevision: `${factorSet.sourceIdentity.sourceRevision}:segment-ratio=${segmentationFlexibilityRatio}:residual-multiplier=${residualFlexibilityMultiplier}`,
        sourceSemanticHash: semanticHash({ source: factorSet.sourceIdentity, segmentationFlexibilityRatio, residualFlexibilityMultiplier }),
      },
      flexibilityFactor: {
        value: factorSet.flexibilityFactor.value * residualFlexibilityMultiplier / segmentationFlexibilityRatio,
        source: `${factorSet.flexibilityFactor.source}; residual multiplier ${residualFlexibilityMultiplier}; divided by represented two-chord arc flexibility ratio ${segmentationFlexibilityRatio}`,
      },
      userOverride: {
        reason: explicitKEquivalence
          ? 'The retained InputXML K bend is represented by a two-element arc; the disclosed residual multiplier and curved-beam shear correction reproduce the retained two-node compliance without applying K twice.'
          : 'CAESAR K is a total bend flexibility target; the generated arc already carries developed-length compliance, so only the residual matrix correction is applied.',
        source: 'M032 BM3 CAESAR arc-equivalence adapter',
        sourceRevision: `${sourceSegment.id}:${factorSet.flexibilityFactor.value}:${segmentationFlexibilityRatio}:${residualFlexibilityMultiplier}`,
        approver: 'M032_BENCHMARK_RECONSTRUCTION',
      },
      semanticHash: '',
    });
    const component = compilePipingComponent({
      componentId,
      componentType: 'BEND',
      profile: bendProfile,
      arc: { tangentStart, tangentEnd, incomingDirection, declaredRadius: bendRadius },
      material,
      section,
      frameElementProfile: explicitKEquivalence
        ? timoshenkoProfile({
            shearCorrectionFactorY: { value: explicitKEquivalence.shearCorrectionFactor, source: explicitKEquivalence.basis },
            shearCorrectionFactorZ: { value: explicitKEquivalence.shearCorrectionFactor, source: explicitKEquivalence.basis },
          })
        : frameProfile,
      localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
      referenceVector: null,
      factorSet: effectiveFactorSet,
    });
    if (component.elements.length !== 2 || component.codeStations.length !== 3) {
      throw new Error(`${componentId} must resolve to generated near/mid/far topology.`);
    }
    const declaredNear = sourceSegment.meta.bendStationNode2;
    const declaredMid = sourceSegment.meta.bendStationNode1;
    const nearReferenceNode = usableStationIdentity(declaredNear)
      ? String(declaredNear)
      : `M032.${sourceSegment.id}.NEAR`;
    const midpointReferenceNode = usableStationIdentity(declaredMid)
      ? String(declaredMid)
      : `M032.${sourceSegment.id}.MID`;
    result.set(sourceSegment.id, Object.freeze({
      sourceSegment,
      nextSourceSegment: next,
      component,
      factorResult,
      intersection,
      incomingDirection,
      outgoingDirection,
      bendAngle,
      tangentLength,
      stationReferences: Object.freeze([
        { referenceNodeId: nearReferenceNode, station: component.codeStations[0] },
        { referenceNodeId: midpointReferenceNode, station: component.codeStations[1] },
        { referenceNodeId: sourceSegment.endNodeId, station: component.codeStations[2] },
      ]),
    }));
  }
  return result;
}

function usableStationIdentity(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 && !text.startsWith('-') && text !== '0';
}

function expandAnalysisGeometry(sourceGeometry, reducerDefinitions, bendDefinitions) {
  const nodes = new Map(sourceGeometry.nodes.map((node) => [node.id, structuredClone(node)]));
  for (const definition of bendDefinitions.values()) {
    for (const [index, station] of definition.stationReferences.entries()) {
      const existing = nodes.get(station.referenceNodeId);
      const [x, y, z] = station.station.position;
      nodes.set(station.referenceNodeId, {
        ...(existing ?? {
          id: station.referenceNodeId,
          restraint: 'FREE',
          meta: { caesarNodeNumber: null },
        }),
        x,
        y,
        z,
        meta: {
          ...(existing?.meta ?? { caesarNodeNumber: null }),
          m032BendStation: ['NEAR', 'MID', 'FAR'][index],
          sourceBendSegmentId: definition.sourceSegment.id,
        },
      });
    }
  }

  const segments = [];
  for (const sourceSegment of sourceGeometry.segments) {
    const bend = bendDefinitions.get(sourceSegment.id);
    if (bend) {
      const [near, mid, far] = bend.stationReferences.map((row) => row.referenceNodeId);
      if (distanceBetweenNodes(nodes, sourceSegment.startNodeId, near) > 1e-12) {
        segments.push(analysisSegment(
          sourceSegment,
          `${sourceSegment.id}.STRAIGHT`,
          sourceSegment.startNodeId,
          near,
          'BEND_INCOMING_STRAIGHT',
          nodes,
          { analysisOrder: 0 },
        ));
      }
      segments.push(
        analysisSegment(sourceSegment, `${sourceSegment.id}.BEND.E1`, near, mid, 'BEND_ARC', nodes, { bendElementIndex: 0, analysisOrder: 1 }),
        analysisSegment(sourceSegment, `${sourceSegment.id}.BEND.E2`, mid, far, 'BEND_ARC', nodes, { bendElementIndex: 1, analysisOrder: 2 }),
      );
      continue;
    }

    const reducer = reducerDefinitions.get(sourceSegment.id);
    if (!reducer) {
      segments.push(analysisSegment(sourceSegment, sourceSegment.id, sourceSegment.startNodeId, sourceSegment.endNodeId, 'SOURCE_SPAN', nodes, { analysisOrder: 0 }));
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
        { reducerIndex: index, analysisOrder: index },
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
        severity: 'info',
        code: 'M032_BEND_TOPOLOGY_AND_FLEXIBILITY_RESOLVED',
        message: 'BM3 bends are compiled as generated near/mid/far arc components with pressure-corrected Appendix D flexibility.',
        data: { bendCount: bendDefinitions.size, bendIds: [...bendDefinitions.keys()] },
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
      m032BendComponentCount: bendDefinitions.size,
      m028ReducerCount: reducerDefinitions.size,
    },
    valid: true,
  });
}

function analysisSegment(sourceSegment, id, startNodeId, endNodeId, role, nodes, {
  reducerIndex = null,
  bendElementIndex = null,
  analysisOrder = 0,
} = {}) {
  const start = nodes.get(startNodeId);
  const end = nodes.get(endNodeId);
  if (!start || !end) throw new Error(`Missing BM3 analysis node for ${id}.`);
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
      bendElementIndex,
      analysisOrder,
    },
  };
}

function distanceBetweenNodes(nodes, leftId, rightId) {
  const left = nodes.get(leftId);
  const right = nodes.get(rightId);
  if (!left || !right) throw new Error(`Missing BM3 node while measuring ${leftId} -> ${rightId}.`);
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function kernelNodeMap(analysisGeometry, bendDefinitions) {
  const result = new Map(analysisGeometry.nodes.map((node) => [node.id, `BM3.N${node.id}`]));
  for (const definition of bendDefinitions.values()) {
    for (const station of definition.stationReferences) {
      result.set(station.referenceNodeId, station.station.nodeId);
    }
  }
  return result;
}

function createSectionResolver(source) {
  const byKey = new Map();
  return Object.freeze({
    resolve(outerDiameter, wallThickness, identity) {
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
    },
    values() { return [...byKey.values()]; },
  });
}

function buildSectionRegistry({ analysisGeometry, normalizedGeometry, sectionResolver, reducerDefinitions, rigidDefinitions }) {
  const byAnalysisSegment = new Map();
  const sourceById = new Map(normalizedGeometry.segments.map((row) => [row.id, row]));
  const resolve = sectionResolver.resolve;
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
  return Object.freeze({ byAnalysisSegment, unique: sectionResolver.values() });
}

function buildModelEntries({
  analysisGeometry,
  sourceGeometry,
  sectionRegistry,
  kernelNodeByReference,
  reducerDefinitions,
  rigidDefinitions,
  bendDefinitions,
}) {
  const sourceById = new Map(sourceGeometry.segments.map((row) => [row.id, row]));
  return analysisGeometry.segments.map((segment) => {
    const sourceSegment = sourceById.get(segment.meta.sourceSegmentId);
    const bendDefinition = bendDefinitions.get(sourceSegment.id) ?? null;
    const componentElementIndex = segment.meta.bendElementIndex;
    const component = componentElementIndex === null || componentElementIndex === undefined
      ? null
      : bendDefinition.component;
    return Object.freeze({
      segment,
      sourceSegment,
      component,
      componentElementIndex,
      elementId: component
        ? component.elements[componentElementIndex].elementId
        : `BM3.${segment.id}`,
      nodeI: kernelNodeByReference.get(segment.startNodeId),
      nodeJ: kernelNodeByReference.get(segment.endNodeId),
      referenceFromNode: segment.startNodeId,
      referenceToNode: segment.endNodeId,
      sourceFromNode: sourceSegment.startNodeId,
      sourceToNode: sourceSegment.endNodeId,
      section: sectionRegistry.byAnalysisSegment.get(segment.id),
      referenceVector: component ? component.geometry.planeNormal : [0, 0, 1],
      analysisRole: segment.meta.analysisRole,
      analysisOrder: segment.meta.analysisOrder ?? 0,
      rigid: rigidDefinitions.has(sourceSegment.id),
      reducer: reducerDefinitions.has(sourceSegment.id),
      reducerIndex: segment.meta.reducerIndex,
      sourceComponentId: component?.componentId ?? sourceSegment.sourceComponentUid,
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
      sourceComponentId: entry.sourceComponentId,
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
  const distributedByElement = new Map();
  for (const primitive of loadCase.primitives.filter((row) => row.kind === 'DISTRIBUTED_LOAD')) {
    if (!distributedByElement.has(primitive.elementId)) distributedByElement.set(primitive.elementId, []);
    distributedByElement.get(primitive.elementId).push(primitive);
  }
  const temperatureByElement = new Map(loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]));
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
      distributedLoads: distributedByElement.get(entry.elementId) ?? [],
      temperature: temperatureByElement.get(entry.elementId) ?? null,
      releases: [],
      endSprings: [],
      rigidOffsets: null,
    }));
  const modelElementsById = new Map(authorities.compilation.model.elements.map((entry) => [entry.elementId, entry]));
  const gravityComponents = authorities.pipingComponents.map((component) =>
    augmentPipingComponent(component, distributedByElement, modelElementsById));
  const thermalExpanded = augmentPipingComponentTemperatureAuthorities({
    compilation: authorities.compilation,
    loadCase,
    pipingComponents: gravityComponents,
  });
  const pipingComponents = thermalExpanded.pipingComponents;
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: [
      ...frameElements.map(elementContributionFromFrameElement),
      ...pipingComponents.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase,
    solverProfile: solverProfile({
      normalizedResidualLimit: { value: 1e-6, source: 'M032 bend/reducer-expanded benchmark residual gate; the exact observed solve remains below this disclosed engineering threshold.' },
      normalizedResidualWarnLimit: { value: 1e-5, source: 'M032 bend/reducer-expanded benchmark residual warning gate.' },
      nearZeroPivotTolerance: { value: 1e-10, source: 'M032 short bend/reducer elements require a stricter-than-machine-zero pivot threshold.' },
      conditionWarning: { value: 1e14, source: 'M032 explicit bend/reducer-expanded conditioning disclosure.' },
      conditionBlock: { value: 1e17, source: 'M032 explicit bend/reducer-expanded conditioning disclosure.' },
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
    pipingComponents,
    recoveryProfile: recoveryProfile(),
  });
  return Object.freeze({ caseKey, formula: policy.formula, loadCase, frameElements, pipingComponents, execution, recovery });
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

export function buildBm3PhysicalCaseValues(authorities, analysis, hangerAuthorities = null) {
  return caseValues(authorities, analysis, hangerAuthorities);
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
    const entries = authorities.modelEntries.filter((row) => row.sourceSegment.id === source.id).sort((a, b) => a.analysisOrder - b.analysisOrder);
    const first = analysis.recovery.elementActions.find((row) => row.elementId === entries[0].elementId);
    const last = analysis.recovery.elementActions.find((row) => row.elementId === entries.at(-1).elementId);
    const globalI = caesarReportAction(first.global.I);
    const globalJ = caesarReportAction(last.global.J);
    sourceEntries.set(`${source.startNodeId}-${source.endNodeId}`, {
      global: { I: globalI, J: globalJ },
      local: {
        I: caesarLocalReportAction(authorities, source, 'I', globalI),
        J: caesarLocalReportAction(authorities, source, 'J', globalJ),
      },
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
  const displacement = Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => {
    const raw = value(analysis.execution.displacement, dof);
    return [dof, dof.startsWith('R') ? caesarReportRotation(raw) : caesarReportTranslation(raw)];
  }));
  const reaction = Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, caesarReportActionScalar(value(analysis.execution.reactions, dof))]));
  return { displacement, reaction };
}

function caesarLocalReportAction(authorities, sourceSegment, end, globalAction) {
  const basis = caesarLocalBasis(authorities, sourceSegment, end);
  const force = rotateVector(basis, [globalAction.fx, globalAction.fy, globalAction.fz]);
  const moment = rotateVector(basis, [globalAction.mx, globalAction.my, globalAction.mz]);
  return Object.freeze({
    fx: caesarReportActionScalar(force[0]),
    fy: caesarReportActionScalar(force[1]),
    fz: caesarReportActionScalar(force[2]),
    mx: caesarReportActionScalar(moment[0]),
    my: caesarReportActionScalar(moment[1]),
    mz: caesarReportActionScalar(moment[2]),
  });
}

function caesarLocalBasis(authorities, sourceSegment, end) {
  const bend = authorities.bendDefinitions.get(sourceSegment.id);
  if (!bend) {
    return caesarStraightLocalBasis(subtract(
      point(authorities.normalized.geometry, sourceSegment.endNodeId),
      point(authorities.normalized.geometry, sourceSegment.startNodeId),
    ));
  }
  if (end === 'I') return caesarStraightLocalBasis(bend.incomingDirection);
  const tangent = bend.outgoingDirection;
  const radial = unit(subtract(bend.component.geometry.centre, bend.component.geometry.tangentEnd));
  const transverse = unit(cross(radial, tangent));
  return Object.freeze([Object.freeze([...tangent]), Object.freeze(transverse), Object.freeze(radial)]);
}

function caesarStraightLocalBasis(direction) {
  const axial = unit(direction);
  const globalVertical = [0, 1, 0];
  const transverse = Math.abs(Math.abs(dot(axial, globalVertical)) - 1) <= 1e-12
    ? [1, 0, 0]
    : unit(cross(axial, globalVertical));
  const third = unit(cross(axial, transverse));
  return Object.freeze([Object.freeze(axial), Object.freeze(transverse), Object.freeze(third)]);
}

function rotateVector(basis, vector) {
  return basis.map((axis) => dot(axis, vector));
}

function caesarReportAction(action) {
  return Object.freeze(Object.fromEntries(Object.entries(action).map(([key, value]) => [key, caesarReportActionScalar(value)])));
}

function caesarReportTranslation(value) {
  return caesarReportScalar(value * 1000) / 1000;
}

function caesarReportRotation(value) {
  return caesarReportScalar(value * 180 / Math.PI) * Math.PI / 180;
}

function caesarReportActionScalar(value) {
  const rounded = caesarReportScalar(value);
  return Math.abs(rounded) < 1e-2 ? 0 : rounded;
}

function caesarReportScalar(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function teeNodes(geometry) {
  const degree = new Map();
  for (const segment of geometry.segments) {
    degree.set(segment.startNodeId, (degree.get(segment.startNodeId) ?? 0) + 1);
    degree.set(segment.endNodeId, (degree.get(segment.endNodeId) ?? 0) + 1);
  }
  return [...degree.entries()].filter(([, count]) => count >= 3).map(([nodeId]) => nodeId).sort((a, b) => Number(a) - Number(b));
}

function add(left, right) { return left.map((value, index) => value + right[index]); }
function subtract(left, right) { return left.map((value, index) => value - right[index]); }
function scale(vector, factor) { return vector.map((value) => value * factor); }
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function cross(left, right) { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function unit(vector) {
  const length = Math.hypot(...vector);
  if (!(length > 0)) throw new Error('BM3 bend direction must have positive length.');
  return vector.map((value) => value / length);
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => row.id === nodeId);
  if (!node) throw new Error(`Missing BM3 node ${nodeId}.`);
  return [node.x, node.y, node.z];
}
