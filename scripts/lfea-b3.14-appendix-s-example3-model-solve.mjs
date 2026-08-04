import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
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
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  APPENDIX_S3_SOURCE,
  GRAVITATIONAL_ACCELERATION,
  INSTALLATION_TEMPERATURE,
  OPERATING_PRESSURE,
  OPERATING_TEMPERATURE,
  STRAIGHT_SPANS,
} from './lfea-b3.14-appendix-s-example3-data.mjs';
import { sourceEvidence } from './lfea-b3.14-appendix-s-example3-code-authorities.mjs';
import { buildAppendixS3Authorities } from './lfea-b3.14-appendix-s-example3-model-build.mjs';

export function solveAppendixS3() {
  const authorities = buildAppendixS3Authorities();
  const analyses = Object.fromEntries([
    ['INSTALL', analyseCase(authorities, 'APP-S3-INSTALLATION', 'INSTALL')],
    ['CASE1', analyseCase(authorities, 'APP-S3-OPERATING-CASE-1-WEST-HOT', 'CASE1')],
    ['CASE2', analyseCase(authorities, 'APP-S3-OPERATING-CASE-2-EAST-HOT', 'CASE2')],
    ['SUS1', analyseCase(authorities, 'APP-S3-SUSTAINED-CASE-1', 'SUS1')],
    ['SUS2', analyseCase(authorities, 'APP-S3-SUSTAINED-CASE-2', 'SUS2')],
  ]);
  return { ...authorities, analyses };
}

function analyseCase(authorities, loadCaseId, caseKind) {
  const loadCase = compileCase(authorities, loadCaseId, caseKind);
  const temperatureByElement = new Map(loadCase.primitives
    .filter((primitive) => primitive.kind === 'TEMPERATURE')
    .map((primitive) => [primitive.elementId, primitive]));
  const straightFrameElements = STRAIGHT_SPANS.map((entry) => compileStraightFrame(
    entry,
    authorities,
    temperatureByElement.get(entry.elementId) ?? null,
  ));
  const gravityExpanded = expandPipeWallGravitySourceAuthorities({
    compilation: authorities.compilation,
    loadCase,
    frameElements: straightFrameElements,
    pipingComponents: authorities.components,
  });
  const thermalExpanded = augmentPipingComponentTemperatureAuthorities({
    compilation: authorities.compilation,
    loadCase: gravityExpanded.loadCase,
    pipingComponents: gravityExpanded.pipingComponents,
  });
  const contributions = [
    ...gravityExpanded.frameElements.map(elementContributionFromFrameElement),
    ...thermalExpanded.pipingComponents.flatMap((component) => elementContributionsFromPipingComponent(component)),
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

function compileStraightFrame(entry, authorities, temperature) {
  const nodeI = modelNodePosition(authorities.compilation, entry.nodeI);
  const nodeJ = modelNodePosition(authorities.compilation, entry.nodeJ);
  return compileFrameElement({
    elementId: entry.elementId,
    material: authorities.material,
    section: authorities.sections[entry.section],
    localAxes: {
      result: resolveFrameLocalAxes({
        nodeI,
        nodeJ,
        referenceVector: [0, 1, 0],
        profile: FRAME_LOCAL_AXIS_PROFILE,
      }),
      profile: FRAME_LOCAL_AXIS_PROFILE,
    },
    profile: authorities.frameProfile,
    distributedLoads: [],
    temperature,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
}

function compileCase(authorities, loadCaseId, caseKind) {
  const primitives = [gravityPrimitive(loadCaseId)];
  const operating = caseKind === 'CASE1' || caseKind === 'CASE2';
  const sustained = caseKind === 'SUS1' || caseKind === 'SUS2';
  if (operating || sustained) {
    for (const element of authorities.compilation.model.elements) {
      const region = authorities.elementRegions.get(element.elementId);
      primitives.push(pressurePrimitive(element.elementId, pressureFor(region, caseKind), loadCaseId));
      if (operating) {
        primitives.push(temperaturePrimitive(
          element.elementId,
          temperatureFor(region, caseKind),
          loadCaseId,
        ));
      }
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: {
      label: loadCaseId,
      description: 'ASME B31.3-2006 Appendix S Example 3 governed benchmark case.',
    },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives,
    profile: loadCaseProfile({
      gravitationalAcceleration: {
        value: GRAVITATIONAL_ACCELERATION,
        source: 'SI-STANDARD-GRAVITY-EXACT',
      },
    }),
  });
}

function gravityPrimitive(loadCaseId) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-${loadCaseId}-GRAVITY`,
    kind: 'GRAVITY',
    direction: { x: 0, y: 1, z: 0 },
    basis: 'GLOBAL',
    includedMassSources: ['PIPE_WALL'],
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S3_SOURCE}-GRAVITY`,
      sourceRevision: loadCaseId,
      acceleration: GRAVITATIONAL_ACCELERATION,
    }),
  };
}

function pressurePrimitive(elementId, pressure, loadCaseId) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-${loadCaseId}-PRESSURE-${elementId}`,
    kind: 'PRESSURE',
    elementId,
    pressure,
    pressureBasis: 'GAUGE',
    authorizedEffects: {
      codeStress: true,
      pressureStiffening: false,
      axialThrust: false,
      bourdon: false,
    },
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S3_SOURCE}-TABLE-S303.1-PRESSURE`,
      sourceRevision: `${loadCaseId}-${elementId}`,
      pressure,
    }),
  };
}

function temperaturePrimitive(elementId, operatingTemperature, loadCaseId) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `LP-${loadCaseId}-TEMPERATURE-${elementId}`,
    kind: 'TEMPERATURE',
    elementId,
    operatingTemperature,
    installationTemperature: INSTALLATION_TEMPERATURE,
    stiffnessEvaluationMaterialStateId: 'MAT-A53B-APPENDIX-S3-394K',
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S3_SOURCE}-TABLE-S303.1-TEMPERATURE`,
      sourceRevision: `${loadCaseId}-${elementId}`,
      installationTemperature: INSTALLATION_TEMPERATURE,
      operatingTemperature,
    }),
  };
}

function pressureFor(region, caseKind) {
  if (region === 'header') return OPERATING_PRESSURE;
  if ((caseKind === 'CASE1' || caseKind === 'SUS1') && region === 'west') return OPERATING_PRESSURE;
  if ((caseKind === 'CASE2' || caseKind === 'SUS2') && region === 'east') return OPERATING_PRESSURE;
  return 0;
}

function temperatureFor(region, caseKind) {
  if (region === 'header') return OPERATING_TEMPERATURE;
  if (caseKind === 'CASE1' && region === 'west') return OPERATING_TEMPERATURE;
  if (caseKind === 'CASE2' && region === 'east') return OPERATING_TEMPERATURE;
  return INSTALLATION_TEMPERATURE;
}

function modelNodePosition(compilation, nodeId) {
  const found = compilation.model.nodes.find((entry) => entry.nodeId === nodeId);
  if (found === undefined) throw new Error(`Missing compiled node ${nodeId}.`);
  return [found.position.x, found.position.y, found.position.z];
}

export function elementAction(analysis, elementId, end) {
  const found = analysis.recovery.elementActions.find((entry) => entry.elementId === elementId);
  if (found === undefined) throw new Error(`Missing element action ${elementId}.`);
  return { local: found.local[end], global: found.global[end], elementId, end };
}

export function componentCodePoint(analysis, componentId, stationId) {
  const component = analysis.recovery.componentResultants.find((entry) => entry.componentId === componentId);
  if (component === undefined) throw new Error(`Missing component result ${componentId}.`);
  const point = component.codePoints.find((entry) => entry.stationId === stationId);
  if (point === undefined) throw new Error(`Missing code point ${componentId}:${stationId}.`);
  return point;
}

export function componentFrameElement(analysis, componentId, elementId) {
  const component = analysis.pipingComponents.find((entry) => entry.componentId === componentId);
  if (component === undefined) throw new Error(`Missing component ${componentId}.`);
  const element = component.elements.find((entry) => entry.elementId === elementId);
  if (element === undefined) throw new Error(`Missing component element ${elementId}.`);
  return element.frameElement;
}

export function straightFrameElement(analysis, elementId) {
  const found = analysis.frameElements.find((entry) => entry.elementId === elementId);
  if (found === undefined) throw new Error(`Missing frame element ${elementId}.`);
  return found;
}
