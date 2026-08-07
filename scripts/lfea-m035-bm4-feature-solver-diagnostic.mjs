import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
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
  GRAVITY,
} from './lfea-m034-bm4-solve-fixtures.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';

export function diagnoseBm4M035FeatureStiffness() {
  const authorities = buildBm4M035FeatureAuthorities();
  const frames = authorities.entries
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
      distributedLoads: [],
      temperature: null,
      releases: [],
      endSprings: entry.teeModifier?.endSprings ?? [],
      rigidOffsets: entry.teeModifier?.rigidOffsets ?? null,
    }));
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
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: [
      ...frames.map(elementContributionFromFrameElement),
      ...authorities.bendExpansion.components.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
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
