import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../centerline-beam-fea/index.js';
import { sealFrameElementProfile } from '../linear-fea-frame-element/index.js';
import { sealLoadCaseProfile } from '../linear-fea-load-case/index.js';
import { compileMechanicalModel, sealMechanicalModelCompilerProfile } from '../linear-fea-model-compiler/index.js';
import { sealSolverProfile } from '../linear-fea-solver/index.js';
import { sealRecoveryProfile } from '../linear-fea-result-recovery/index.js';
import { GRAVITY, point } from './generic-inputxml-solve-authorities.js';

export const PROFILE_SOURCE = 'IXA-GENERIC-SOLVE-FIXTURE-PROFILE';

export function constraintDeclarations(geometry, modelId) {
  const rows = new Map();
  const add = (nodeId, dof, reason) => rows.set(`${nodeId}:${dof}`, {
    declarationId: `${modelId}-C-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `${modelId}.N${nodeId}`,
    dof,
    behavior: 'FIXED',
  });
  const unresolvedRestraintNodes = [];
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof, 'ANCHOR');
    }
    for (const restraint of node.meta.restraints ?? []) {
      if (restraint.typeCode === '14' || restraint.typeCode === '15') {
        // Unilateral (+Y / +Z) restraint, linearized to a full fixed
        // constraint in its declared cosine direction rather than modeled
        // as a true gap/complementarity contact. Real, disclosed
        // simplification -- not the same mechanics PR #698 built for BM2
        // specifically, which solves the true unilateral active set.
        const direction = [Math.abs(restraint.xCosine ?? 0), Math.abs(restraint.yCosine ?? 0), Math.abs(restraint.zCosine ?? 0)];
        const axis = direction.indexOf(Math.max(...direction));
        add(node.id, ['UX', 'UY', 'UZ'][axis], 'UNILATERAL-LINEARIZED');
      } else if (restraint.classification === 'GUIDE') {
        const direction = [Math.abs(restraint.xCosine ?? 0), Math.abs(restraint.yCosine ?? 0), Math.abs(restraint.zCosine ?? 0)];
        const magnitude = Math.max(...direction);
        const axis = magnitude > 0 ? direction.indexOf(magnitude) : null;
        if (axis !== null) add(node.id, ['UX', 'UY', 'UZ'][axis], 'GUIDE');
      } else if (restraint.classification === 'UNKNOWN') {
        unresolvedRestraintNodes.push({ nodeId: node.id, sourceTypeCode: restraint.sourceTypeCode, typeCode: restraint.typeCode });
      }
    }
  }
  return { declarations: [...rows.values()], unresolvedRestraintNodes };
}

export function compilerProfile() {
  return sealMechanicalModelCompilerProfile({
    schema: 'fea-linear-model-compiler-profile/v1',
    profileId: 'LINEAR-MODEL-COMPILER-R1',
    spanBindingRule: 'EXACTLY_ONE_BINDING_PER_SPAN_V1',
    zeroLengthLinkRule: 'ZERO_LENGTH_LINK_PROHIBITED_V1',
    constraintConflictRule: 'CONFLICTING_DEFINITION_BLOCKS_COMPILATION_V1',
    unrepresentableFeatureRule: 'UNREPRESENTABLE_FEATURE_BLOCKS_COMPILATION_V1',
    minimumElementLength: { value: 1e-8, source: PROFILE_SOURCE },
    spanDirectionTolerance: { value: 1e-9, source: PROFILE_SOURCE },
    semanticHash: '',
  });
}

export function compileModel({ modelId, source, conditioned, geometry, material, entries, constraints }) {
  const axes = entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const sectionResolutions = new Map();
  for (const entry of entries) sectionResolutions.set(entry.analysisSection.semanticHash, entry.analysisSection);
  return compileMechanicalModel({
    modelIdentity: `${modelId}-GENERIC-SOLVE`,
    modelRevision: 1,
    sourceSemanticHash: source.semanticHash,
    conditionedTopology: conditioned,
    nodeBindings: geometry.nodes.map((node) => ({
      nodeId: `${modelId}.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.sourceSegment.id,
      topologySegmentId: entry.sourceSegment.id,
      materialStateId: material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId ?? entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [material],
    sectionResolutions: [...sectionResolutions.values()],
    localAxisResults: axes,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraints,
    profile: compilerProfile(),
  });
}

export function frameProfile() {
  return sealFrameElementProfile({
    schema: 'fea-linear-frame-element-profile/v1',
    profileId: 'LINEAR-FRAME-ELEMENT-R1',
    straightPipeFormulation: 'PIPE_FRAME3D_EULER_BERNOULLI_V1',
    shearDeformation: false,
    releaseRule: 'STATIC_CONDENSATION_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    releaseSingularityTolerance: { value: 1e-12, source: PROFILE_SOURCE },
    semanticHash: '',
  });
}

export function solverProfile() {
  return sealSolverProfile({
    schema: 'fea-linear-solver-profile/v1',
    profileId: 'LINEAR-SOLVER-R1',
    backend: 'FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1',
    scaling: 'DIAGONAL_ENERGY_SCALING_V1',
    momentReferenceRule: 'FIRST_CANONICAL_NODE_V1',
    normalizedResidualLimit: { value: 1e-9, source: PROFILE_SOURCE },
    normalizedResidualWarnLimit: { value: 1e-7, source: PROFILE_SOURCE },
    equilibriumRelativeLimit: { value: 1e-6, source: PROFILE_SOURCE },
    equilibriumAbsoluteForceFloor: { value: 1e-3, source: PROFILE_SOURCE },
    equilibriumAbsoluteMomentFloor: { value: 1e-3, source: PROFILE_SOURCE },
    energyBalanceLimit: { value: 1e-7, source: PROFILE_SOURCE },
    // A real InputXML mixing rigid equipment (valves, etc.) with normal pipe
    // stiffness produces genuine, large stiffness disparity that is
    // well-conditioned but trips a tight pivot tolerance as a false-positive
    // mechanism. This project's own M027 BM2 real-model conditioning study
    // documented exactly this (default 1e-6 blocked a connected model at
    // BM2.N300:UX; see scripts/lfea-b3.26-bm2-solve-runtime.mjs) and adopted
    // these looser, still-safe tolerances. A genuinely singular/mechanism
    // system still fails at these tolerances -- this only stops a
    // well-conditioned system from being misdiagnosed as one.
    nearZeroPivotTolerance: { value: 1e-12, source: 'M027-BM2-CONDITIONING-STUDY' },
    conditionWarning: { value: 1e14, source: 'M027-BM2-CONDITIONING-STUDY' },
    conditionBlock: { value: 1e18, source: 'M027-BM2-CONDITIONING-STUDY' },
    semanticHash: '',
  });
}

export function recoveryProfile() {
  return sealRecoveryProfile({
    schema: 'fea-linear-recovery-profile/v1',
    profileId: 'LINEAR-RESULT-RECOVERY-R1',
    elementForceStationsPerSpan: { value: 5, source: PROFILE_SOURCE },
    codePointConsistencyTolerance: { value: 1e-6, source: PROFILE_SOURCE },
    retainLocalAndGlobalActions: true,
    semanticHash: '',
  });
}

export function loadCaseProfile() {
  return sealLoadCaseProfile({
    schema: 'fea-linear-load-case-profile/v1',
    profileId: 'LINEAR-LOAD-CASE-R1',
    primitiveImmutabilityRule: 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    combinationSemanticsRule: 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1',
    codeCombinationRule: 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1',
    gravitationalAcceleration: { value: GRAVITY, source: PROFILE_SOURCE },
    directionUnitTolerance: { value: 1e-12, source: PROFILE_SOURCE },
    semanticHash: '',
  });
}
