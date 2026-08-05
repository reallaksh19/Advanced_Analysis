import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  BM2_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  buildBm2SolveAuthorities,
  sourceEvidence,
} from './lfea-b3.26-bm2-solve-fixtures.mjs';
import { BM2_SOLVER_CONDITIONING_PROFILE } from './lfea-b3.26-bm2-solve-runtime.mjs';

const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const DIRECTIONAL_TYPE_MAP = Object.freeze({
  13: Object.freeze({ label: '+X', dof: 'UX', freeSign: 1 }),
  14: Object.freeze({ label: '+Y', dof: 'UY', freeSign: 1 }),
  15: Object.freeze({ label: '+Z', dof: 'UZ', freeSign: 1 }),
  16: Object.freeze({ label: '-X', dof: 'UX', freeSign: -1 }),
  17: Object.freeze({ label: '-Y', dof: 'UY', freeSign: -1 }),
  18: Object.freeze({ label: '-Z', dof: 'UZ', freeSign: -1 }),
});

export const BM2_DIRECTIONAL_CONTACT_POLICY = Object.freeze({
  schema: 'lfea-bm2-directional-contact-policy/v1',
  maximumIterations: 8,
  displacementTolerance: 1e-9,
  reactionTolerance: 1e-6,
  initialState: 'ALL_DIRECTIONAL_RESTRAINTS_INACTIVE',
  rule: 'SIGNED_FREE_TRAVEL_COMPLEMENTARITY_ACTIVE_SET',
});

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM2 node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = (analysis.pipeDensity ?? 0) * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (
    insulatedOd ** 2 - section.dimensions.outerDiameter ** 2
  ) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return pipe + contents + insulation;
}

function dominantTranslationDof(restraint) {
  const values = [
    Math.abs(restraint.xCosine ?? 0),
    Math.abs(restraint.yCosine ?? 0),
    Math.abs(restraint.zCosine ?? 0),
  ];
  const maximum = Math.max(...values);
  if (!(maximum > 0)) {
    throw new Error(`BM2 guide restraint at node ${restraint.nodeId} has no usable direction cosine.`);
  }
  return ['UX', 'UY', 'UZ'][values.indexOf(maximum)];
}

export function bm2DirectionalRestraints(geometry) {
  const records = [];
  const occupied = new Set();
  for (const node of geometry.nodes) {
    for (const [index, restraint] of (node.meta.restraints ?? []).entries()) {
      const authority = DIRECTIONAL_TYPE_MAP[Number(restraint.typeCode)];
      if (!authority) continue;
      const slot = `${node.id}:${authority.dof}`;
      if (occupied.has(slot)) {
        throw new Error(`BM2 has multiple directional restraints acting on ${slot}.`);
      }
      occupied.add(slot);
      records.push(Object.freeze({
        restraintId: `BM2-DIRECTIONAL-${node.id}-${authority.dof}-${index + 1}`,
        sourceNodeId: node.id,
        nodeId: `BM2.N${node.id}`,
        sourceTypeCode: String(restraint.sourceTypeCode),
        effectiveTypeCode: String(restraint.typeCode),
        mutationApplied: restraint.mutationApplied === true,
        label: authority.label,
        dof: authority.dof,
        freeSign: authority.freeSign,
        freeDirection: authority.freeSign > 0 ? 'POSITIVE' : 'NEGATIVE',
        restrainedDirection: authority.freeSign > 0 ? 'NEGATIVE' : 'POSITIVE',
        gap: 0,
        frictionCoefficient: restraint.frictionCoefficient ?? 0,
      }));
    }
  }
  return Object.freeze(records.sort((left, right) => left.restraintId.localeCompare(right.restraintId)));
}

function constraintDeclarations(geometry, directional, activeState) {
  const rows = new Map();
  const add = (nodeId, dof, reason) => {
    const key = `${nodeId}:${dof}`;
    if (rows.has(key)) throw new Error(`BM2 duplicate active constraint ${key}.`);
    rows.set(key, {
      declarationId: `BM2-C-${nodeId}-${dof}-${reason}`,
      kind: 'NODAL_RESTRAINT',
      nodeId: `BM2.N${nodeId}`,
      dof,
      behavior: 'FIXED',
    });
  };

  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      for (const dof of DOFS) add(node.id, dof, 'ANCHOR');
    }
    for (const restraint of node.meta.restraints ?? []) {
      if (String(restraint.typeCode) === '8') {
        add(node.id, dominantTranslationDof({ ...restraint, nodeId: node.id }), 'GUIDE');
      }
    }
  }

  for (const restraint of directional) {
    if (activeState[restraint.restraintId] === true) {
      add(restraint.sourceNodeId, restraint.dof, `ACTIVE-${restraint.label.replace('+', 'P').replace('-', 'M')}`);
    }
  }
  return [...rows.values()];
}

function compileStateModel(authorities, directional, activeState) {
  const geometry = authorities.normalized.geometry;
  const axes = authorities.entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const sectionResolutions = new Map();
  for (const entry of authorities.entries) {
    sectionResolutions.set(entry.analysisSection.semanticHash, entry.analysisSection);
  }
  return compileMechanicalModel({
    modelIdentity: 'BM2-LIVE-INPUTXML-M027-DIRECTIONAL-RESTRAINTS',
    modelRevision: 1,
    sourceSemanticHash: authorities.source.semanticHash,
    conditionedTopology: authorities.conditioned,
    nodeBindings: geometry.nodes.map((node) => ({
      nodeId: `BM2.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: authorities.entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.sourceSegment.id,
      topologySegmentId: entry.sourceSegment.id,
      materialStateId: authorities.material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId ?? entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [authorities.material],
    sectionResolutions: [...sectionResolutions.values()],
    localAxisResults: axes,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(geometry, directional, activeState),
    profile: compilerProfile(),
  });
}

function compileCase(authorities, compilation, label, thermal) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority
      ? entry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `BM2-${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({
        sourceId: entry.rigidAuthority
          ? `${BM2_SOURCE_ID}-RIGID-WEIGHT`
          : `${BM2_SOURCE_ID}-PHYSICAL-WEIGHT`,
        sourceRevision: `${entry.sourceSegment.id}:${lineWeight}`,
        rigidAuthorityHash: entry.rigidAuthority?.semanticHash ?? null,
      }),
    });
    if ((analysis.pressure ?? 0) > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-${label}-PRESSURE-${entry.elementId}`,
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
          sourceId: `${BM2_SOURCE_ID}-PRESSURE1`,
          sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}`,
        }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-${label}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({
          sourceId: `${BM2_SOURCE_ID}-TEMP_EXP_C1`,
          sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}`,
        }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId: `BM2-${label}-DIRECTIONAL`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: {
      label,
      description: `M027 BM2 ${label} solve with corrected InputXML restraint mutation and directional active set.`,
    },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile({
      gravitationalAcceleration: {
        value: GRAVITY,
        source: 'SI-STANDARD-GRAVITY-EXACT',
      },
    }),
  });
}

function analyseState(authorities, directional, activeState, label, thermal) {
  const compilation = compileStateModel(authorities, directional, activeState);
  const loadCase = compileCase(authorities, compilation, label, thermal);
  const distributedByElement = new Map();
  const temperatureByElement = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributedByElement.has(primitive.elementId)) {
        distributedByElement.set(primitive.elementId, []);
      }
      distributedByElement.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') {
      temperatureByElement.set(primitive.elementId, primitive);
    }
  }
  const frameElements = authorities.entries.map((entry) => compileFrameElement({
    elementId: entry.elementId,
    material: authorities.material,
    section: entry.analysisSection,
    localAxes: {
      result: resolveFrameLocalAxes({
        nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId),
        nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
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
  const execution = compileSolverExecution({
    compilation,
    elementContributions: frameElements.map(elementContributionFromFrameElement),
    loadCase,
    solverProfile: solverProfile(BM2_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = compileResultRecovery({
    compilation,
    execution,
    loadCase,
    frameElements,
    pipingComponents: [],
    recoveryProfile: recoveryProfile(),
  });
  return Object.freeze({ compilation, loadCase, frameElements, execution, recovery });
}

function resultValue(rows, nodeId, dof) {
  return rows.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}

function sameState(left, right, directional) {
  return directional.every((row) => left[row.restraintId] === right[row.restraintId]);
}

function stateKey(state, directional) {
  return directional.map((row) => `${row.restraintId}:${state[row.restraintId] ? 1 : 0}`).join('|');
}

function solveDirectionalCase(authorities, directional, label, thermal) {
  let state = Object.fromEntries(directional.map((row) => [row.restraintId, false]));
  const seen = new Set();
  const history = [];

  for (let iteration = 1; iteration <= BM2_DIRECTIONAL_CONTACT_POLICY.maximumIterations; iteration += 1) {
    const key = stateKey(state, directional);
    if (seen.has(key)) {
      throw new Error(`BM2 ${label} directional-restraint active set cycled at ${key}.`);
    }
    seen.add(key);
    const analysis = analyseState(authorities, directional, state, label, thermal);
    const next = { ...state };
    const evaluations = directional.map((restraint) => {
      const displacement = resultValue(
        analysis.execution.displacement,
        restraint.nodeId,
        restraint.dof,
      );
      const reaction = resultValue(
        analysis.execution.reactions,
        restraint.nodeId,
        restraint.dof,
      );
      const signedFreeDisplacement = restraint.freeSign * displacement;
      const signedContactReaction = restraint.freeSign * reaction;
      const active = state[restraint.restraintId] === true;
      if (!active && signedFreeDisplacement < -BM2_DIRECTIONAL_CONTACT_POLICY.displacementTolerance) {
        next[restraint.restraintId] = true;
      } else if (active && signedContactReaction < -BM2_DIRECTIONAL_CONTACT_POLICY.reactionTolerance) {
        next[restraint.restraintId] = false;
      }
      return Object.freeze({
        restraintId: restraint.restraintId,
        active,
        displacement,
        reaction,
        signedFreeDisplacement,
        signedContactReaction,
        nextActive: next[restraint.restraintId] === true,
      });
    });
    history.push(Object.freeze({
      iteration,
      state: Object.freeze({ ...state }),
      evaluations: Object.freeze(evaluations),
    }));
    if (sameState(state, next, directional)) {
      return Object.freeze({
        ...analysis,
        contact: Object.freeze({
          schema: 'lfea-bm2-directional-contact-result/v1',
          caseLabel: label,
          policy: BM2_DIRECTIONAL_CONTACT_POLICY,
          status: 'CONVERGED',
          iterations: iteration,
          activeState: Object.freeze({ ...state }),
          history: Object.freeze(history),
        }),
      });
    }
    state = next;
  }
  throw new Error(`BM2 ${label} directional-restraint active set did not converge.`);
}

function nodalResult(analysis, nodeId) {
  const value = (array, dof) => resultValue(array, nodeId, dof);
  return Object.freeze({
    displacement: Object.fromEntries(DOFS.map((dof) => [dof, value(analysis.execution.displacement, dof)])),
    reaction: Object.fromEntries(DOFS.map((dof) => [dof, value(analysis.execution.reactions, dof)])),
  });
}

function buildReport(authorities, directional, sustained, operating) {
  return Object.freeze({
    schema: 'm027-bm2-directional-restraint-solve-report/v1',
    sourceSemanticHash: authorities.source.semanticHash,
    solverConditioningProfile: BM2_SOLVER_CONDITIONING_PROFILE,
    directionalContactPolicy: BM2_DIRECTIONAL_CONTACT_POLICY,
    directionalRestraints: directional,
    contactCases: Object.freeze({
      SUS: sustained.contact,
      OPE: operating.contact,
    }),
    counts: {
      sourceNodes: authorities.normalized.geometry.nodes.length,
      sourceElements: authorities.entries.length,
      rigidElements: authorities.entries.filter((row) => row.rigidAuthority).length,
      bendTaggedElements: authorities.entries.filter(
        (row) => row.sourceSegment.meta.bendDeclaredRadius != null,
      ).length,
      directionalRestraints: directional.length,
    },
    limitations: [
      {
        code: 'BM2_BEND_CHORD_STIFFNESS_ONLY',
        cause: 'The model still represents each bend-bearing InputXML element as one straight frame chord.',
      },
      {
        code: 'BM2_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED',
        cause: 'Shared-node topology is retained without branch-junction flexibility in structural stiffness.',
      },
      {
        code: 'BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION',
        cause: 'Rigid body, fluid and insulation weight use the rigid authority with a uniform consistent line load.',
      },
      {
        code: 'BM2_GLOBAL_STIFFNESS_INCOMPLETE_BEND_BRANCH_MODEL',
        cause: 'Bend curvature/flexibility and branch flexibility remain incomplete after restraint correction.',
      },
      {
        code: 'BM2_SOLVER_CONDITIONING_PROFILE_STUDY',
        cause: 'The solve retains the declared BM2 sparse-LDLT conditioning profile with zero regularization.',
      },
      {
        code: 'BM2_CODE_STRESS_DEFERRED',
        cause: 'This phase compares structural response; piping-code stress remains out of scope.',
      },
    ],
    nodes: authorities.normalized.geometry.nodes.map((node) => ({
      sourceNodeId: node.id,
      kernelNodeId: `BM2.N${node.id}`,
      restraint: node.restraint,
      sourceRestraints: node.meta.restraints ?? [],
      position: { x: node.x, y: node.y, z: node.z },
      sustained: nodalResult(sustained, `BM2.N${node.id}`),
      operating: nodalResult(operating, `BM2.N${node.id}`),
    })),
    elements: authorities.entries.map((entry) => ({
      sourceElementId: entry.sourceSegment.id,
      kernelElementId: entry.elementId,
      fromNode: entry.sourceSegment.startNodeId,
      toNode: entry.sourceSegment.endNodeId,
      sourceType: entry.sourceSegment.type,
      bendTagged: entry.sourceSegment.meta.bendDeclaredRadius != null,
      rigid: entry.rigidAuthority !== null,
      rigidAuthority: entry.rigidAuthority,
      codeStressEligible: entry.rigidAuthority
        ? entry.rigidAuthority.structuralParticipation.calculatePipingCodeStress
        : true,
      sustained: sustained.recovery.elementActions.find((row) => row.elementId === entry.elementId),
      operating: operating.recovery.elementActions.find((row) => row.elementId === entry.elementId),
    })),
  });
}

export function solveBm2WithDirectionalRestraints() {
  const authorities = buildBm2SolveAuthorities();
  const directional = bm2DirectionalRestraints(authorities.normalized.geometry);
  const sustained = solveDirectionalCase(authorities, directional, 'SUS', false);
  const operating = solveDirectionalCase(authorities, directional, 'OPE', true);
  return Object.freeze({
    ...authorities,
    directional,
    sustained,
    operating,
    report: buildReport(authorities, directional, sustained, operating),
  });
}
