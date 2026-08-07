import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  computePipingComponentSemanticHash,
  requirePipingComponent,
} from '../src/core/linear-fea-piping-components/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE,
  BM4_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';

export function diagnoseBm4M035FeatureStiffness() {
  const authorities = buildBm4M035FeatureAuthorities();
  const frames = compileFrames(authorities, null, null);
  const probeElementId = authorities.entries[0].elementId;
  const loadCase = compilePhysicalLoadCase({
    loadCaseId: 'BM4-M035-STIFFNESS-DIAGNOSTIC-ZERO-RHS',
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: {
      label: 'M035 stiffness diagnostic',
      description: 'Zero-RHS execution used only to expose feature-model numerical qualification gates.',
    },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives: [{
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: 'BM4-M035-STIFFNESS-DIAGNOSTIC-P0',
      kind: 'PRESSURE',
      elementId: probeElementId,
      pressure: 0,
      pressureBasis: 'GAUGE',
      authorizedEffects: {
        codeStress: true,
        pressureStiffening: false,
        axialThrust: false,
        bourdon: false,
      },
      sourceEvidence: {
        sourceId: 'M035-BM4-STIFFNESS-DIAGNOSTIC',
        sourceRevision: 'ZERO-PRESSURE-RHS-V1',
        sourceSemanticHash: authorities.source.semanticHash,
      },
    }],
    profile: loadCaseProfile({
      gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' },
    }),
  });
  const execution = compileExecution(authorities, frames, authorities.bendExpansion.components, loadCase);
  return executionEvidence(execution);
}

export function diagnoseBm4M035PhysicalCases() {
  const authorities = buildBm4M035FeatureAuthorities();
  const sustained = diagnosePhysicalCase(authorities, 'BM4-M035-DIAGNOSTIC-SUS', false);
  const operating = diagnosePhysicalCase(authorities, 'BM4-M035-DIAGNOSTIC-OPE', true);
  return Object.freeze({ sustained, operating });
}

function diagnosePhysicalCase(authorities, loadCaseId, thermal) {
  const loadCase = compilePhysicalCase(authorities, loadCaseId, thermal);
  const distributedByElement = new Map(
    loadCase.primitives.filter((row) => row.kind === 'DISTRIBUTED_LOAD').map((row) => [row.elementId, row]),
  );
  const temperatureByElement = new Map(
    loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]),
  );
  const frames = compileFrames(authorities, distributedByElement, temperatureByElement);
  const loadedComponents = authorities.bendExpansion.components.map((component) => {
    const elements = component.elements.map((componentElement) => {
      const entry = authorities.entryByElementId.get(componentElement.elementId);
      if (!entry) throw new Error(`Missing diagnostic analysis entry for bend element ${componentElement.elementId}.`);
      const frameElement = compileFrameElement({
        elementId: componentElement.elementId,
        material: authorities.material,
        section: entry.analysisSection,
        localAxes: { result: resolveEntryAxes(authorities.analysisGeometry, entry), profile: FRAME_LOCAL_AXIS_PROFILE },
        profile: authorities.frameProfile,
        distributedLoads: [distributedByElement.get(componentElement.elementId)],
        temperature: temperatureByElement.get(componentElement.elementId) ?? null,
        releases: [],
        endSprings: [],
        rigidOffsets: null,
      });
      return Object.freeze({ ...componentElement, frameElement });
    });
    const draft = { ...component, elements, semanticHash: '' };
    draft.semanticHash = computePipingComponentSemanticHash(draft);
    return requirePipingComponent(draft);
  });
  const execution = compileExecution(authorities, frames, loadedComponents, loadCase);
  return executionEvidence(execution);
}

function compileFrames(authorities, distributedByElement, temperatureByElement) {
  return authorities.entries
    .filter((entry) => !entry.bendComponent)
    .map((entry) => compileFrameElement({
      elementId: entry.elementId,
      material: authorities.material,
      section: entry.analysisSection,
      localAxes: {
        result: resolveEntryAxes(authorities.analysisGeometry, entry),
        profile: FRAME_LOCAL_AXIS_PROFILE,
      },
      profile: authorities.frameProfile,
      distributedLoads: distributedByElement ? [distributedByElement.get(entry.elementId)] : [],
      temperature: temperatureByElement?.get(entry.elementId) ?? null,
      releases: [],
      endSprings: entry.teeModifier?.endSprings ?? [],
      rigidOffsets: entry.teeModifier?.rigidOffsets ?? null,
    }));
}

function compileExecution(authorities, frames, components, loadCase) {
  return compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: [
      ...frames.map(elementContributionFromFrameElement),
      ...components.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
}

function executionEvidence(execution) {
  return Object.freeze({
    status: execution.status,
    diagnostics: execution.diagnostics,
    factorization: {
      kind: execution.factorization.kind,
      conditionEstimate: execution.factorization.conditionEstimate,
      pivotStatistics: execution.factorization.pivotStatistics,
    },
    assembly: execution.assembly,
  });
}

function compilePhysicalCase(authorities, loadCaseId, thermal) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceEntry.sourceSegment.meta.analysis;
    const lineWeight = entry.sourceEntry.rigidAuthority
      ? entry.sourceEntry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry.sourceEntry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${loadCaseId}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({
        sourceId: `${BM4_SOURCE_ID}-M035-DIAGNOSTIC-WEIGHT`,
        sourceRevision: `${entry.sourceSegmentId}:${lineWeight}`,
      }),
    });
    if (analysis.pressure > 0) {
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
        sourceEvidence: sourceEvidence({
          sourceId: `${BM4_SOURCE_ID}-M035-DIAGNOSTIC-PRESSURE`,
          sourceRevision: `${entry.sourceSegmentId}:${analysis.pressure}`,
        }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${loadCaseId}-TEMP-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({
          sourceId: `${BM4_SOURCE_ID}-M035-DIAGNOSTIC-TEMP`,
          sourceRevision: `${entry.sourceSegmentId}:${analysis.operatingTemperature}`,
        }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: {
      label: loadCaseId,
      description: 'M035 BM4 physical-case solver qualification diagnostic.',
    },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives,
    profile: loadCaseProfile({
      gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' },
    }),
  });
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = analysis.pipeDensity * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return pipe + contents + insulation;
}

function resolveEntryAxes(geometry, entry) {
  const rawI = point(geometry, entry.segment.startNodeId);
  const rawJ = point(geometry, entry.segment.endNodeId);
  const physicalI = addOffset(rawI, entry.teeModifier?.rigidOffsets?.I);
  const physicalJ = addOffset(rawJ, entry.teeModifier?.rigidOffsets?.J);
  return resolveFrameLocalAxes({
    nodeI: physicalI,
    nodeJ: physicalJ,
    referenceVector: entry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  });
}
function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => String(row.id) === String(nodeId));
  if (!node) throw new Error(`BM4 M035 diagnostic node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}
function addOffset(pointValue, offset) {
  if (!offset) return pointValue;
  return [pointValue[0] + offset.x, pointValue[1] + offset.y, pointValue[2] + offset.z];
}
