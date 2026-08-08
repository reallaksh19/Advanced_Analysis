import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../centerline-beam-fea/index.js';
import { compileFrameElement } from '../linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../linear-fea-load-case/index.js';
import { compileSolverExecution, elementContributionFromFrameElement } from '../linear-fea-solver/index.js';
import { compileResultRecovery } from '../linear-fea-result-recovery/index.js';
import { DEFAULT_INSTALLATION_TEMPERATURE, point, sourceEvidence, physicalLineWeight } from './generic-inputxml-solve-authorities.js';
import { frameProfile, loadCaseProfile, recoveryProfile, solverProfile } from './generic-inputxml-solve-model.js';

export function compileCase({ modelId, entries, material, compilation, label, thermal, thermalExpansionCoefficient }) {
  const primitives = [];
  for (const entry of entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority ? entry.rigidAuthority.gravity.totalLineWeight : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${modelId}-${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({
        sourceId: entry.rigidAuthority ? `${modelId}-RIGID-WEIGHT` : `${modelId}-PHYSICAL-WEIGHT`,
        sourceRevision: `${entry.sourceSegment.id}:${lineWeight}`,
      }),
    });
    if ((analysis.pressure ?? 0) > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${modelId}-${label}-PRESSURE-${entry.elementId}`,
        kind: 'PRESSURE',
        elementId: entry.elementId,
        pressure: analysis.pressure,
        pressureBasis: 'GAUGE',
        authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
        sourceEvidence: sourceEvidence({ sourceId: `${modelId}-PRESSURE1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}` }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${modelId}-${label}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: DEFAULT_INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({ sourceId: `${modelId}-TEMP_EXP_C1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}:${thermalExpansionCoefficient}` }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId: `${modelId}-${label}`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `IXA generic ${label} solve.` },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile(),
  });
}

export function analyse({ modelId, geometry, entries, material, compilation, label, thermal, thermalExpansionCoefficient }) {
  const loadCase = compileCase({ modelId, entries, material, compilation, label, thermal, thermalExpansionCoefficient });
  const distributedByElement = new Map();
  const temperatureByElement = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributedByElement.has(primitive.elementId)) distributedByElement.set(primitive.elementId, []);
      distributedByElement.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') temperatureByElement.set(primitive.elementId, primitive);
  }
  const profile = frameProfile();
  const frameElements = entries.map((entry) => compileFrameElement({
    elementId: entry.elementId,
    material,
    section: entry.analysisSection,
    localAxes: {
      result: resolveFrameLocalAxes({
        nodeI: point(geometry, entry.sourceSegment.startNodeId),
        nodeJ: point(geometry, entry.sourceSegment.endNodeId),
        referenceVector: entry.referenceVector,
        profile: FRAME_LOCAL_AXIS_PROFILE,
      }),
      profile: FRAME_LOCAL_AXIS_PROFILE,
    },
    profile,
    distributedLoads: distributedByElement.get(entry.elementId) ?? [],
    temperature: temperatureByElement.get(entry.elementId) ?? null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  }));
  const execution = compileSolverExecution({
    compilation,
    elementContributions: frameElements.map(elementContributionFromFrameElement),
    loadCase,
    solverProfile: solverProfile(),
  });
  if (execution.status === 'BLOCKED') {
    console.log('BM4_SOLVER_GATE_DIAGNOSTICS_BEGIN');
    console.log(JSON.stringify({
      label,
      status: execution.status,
      diagnostics: execution.diagnostics,
      factorization: execution.factorization,
      assembly: execution.assembly,
    }, null, 2));
    console.log('BM4_SOLVER_GATE_DIAGNOSTICS_END');
  }
  const recovery = compileResultRecovery({
    compilation,
    execution,
    loadCase,
    frameElements,
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  return Object.freeze({ loadCase, frameElements, execution, recovery });
}

export function nodalResult(analysisResult, nodeId) {
  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
  const dofs = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'];
  return Object.freeze({
    displacement: Object.fromEntries(dofs.map((dof) => [dof, value(analysisResult.execution.displacement, dof)])),
    reaction: Object.fromEntries(dofs.map((dof) => [dof, value(analysisResult.execution.reactions, dof)])),
  });
}
