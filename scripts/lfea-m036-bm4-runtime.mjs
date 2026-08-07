import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { attributeValue, findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { resolveRestraintTypeMutation } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { convertInputXmlLengthToMetres } from '../src/core/geometry/adapters/inputxml-unit-system.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
} from '../src/core/linear-fea-solver/index.js';
import {
  compileUnilateralSolverExecution,
  createDoubleActingGapDeclarations,
  createUnilateralDeclaration,
  sealUnilateralDeclaration,
} from '../src/core/linear-fea-unilateral-solver/index.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE,
  BM4_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  buildBm4SolveAuthorities,
  sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';

const SENTINEL = -1.0101;
const TRANSLATIONAL_DOFS = ['UX', 'UY', 'UZ'];
export const BM4_FRICTION_LIMITATION = 'BM4_FRICTION_NOT_MODELED';
export const BM4_LIFTOFF_NODES = Object.freeze(['20090', '20350', '21470', '21610']);

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM4 node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function sourceNumber(attributes, key) {
  const value = Number(attributeValue(attributes, key));
  if (!Number.isFinite(value) || Math.abs(value - SENTINEL) < 1e-3) return null;
  return value;
}

function cleanNodeId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : String(value ?? '').trim();
}

function rawRestraints(authorities) {
  const unit = authorities.parsed.summary.inputXmlLengthUnit;
  return findElements(authorities.content, 'RESTRAINT').map((row, index) => {
    const nodeId = cleanNodeId(attributeValue(row.attributes, 'NODE'));
    const mutation = resolveRestraintTypeMutation(attributeValue(row.attributes, 'TYPE'));
    const rawGap = sourceNumber(row.attributes, 'GAP');
    return Object.freeze({
      sourceIndex: index,
      nodeId,
      kernelNodeId: `BM4.N${nodeId}`,
      typeCode: mutation.typeCode,
      gap: rawGap == null ? 0 : convertInputXmlLengthToMetres(rawGap, unit),
      frictionCoefficient: sourceNumber(row.attributes, 'FRIC_COEF') ?? 0,
      xCosine: sourceNumber(row.attributes, 'XCOSINE') ?? 0,
      yCosine: sourceNumber(row.attributes, 'YCOSINE') ?? 0,
      zCosine: sourceNumber(row.attributes, 'ZCOSINE') ?? 0,
    });
  });
}

function fixed(nodeId, dof, reason) {
  return Object.freeze({
    declarationId: `BM4-C-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `BM4.N${nodeId}`,
    dof,
    behavior: 'FIXED',
  });
}

function guideDof(row) {
  const direction = [Math.abs(row.xCosine), Math.abs(row.yCosine), Math.abs(row.zCosine)];
  return TRANSLATIONAL_DOFS[direction.indexOf(Math.max(...direction))];
}

export function buildBm4UnilateralPlan(authorities = buildBm4SolveAuthorities()) {
  const base = new Map();
  const unilateral = [];
  const sourceRows = rawRestraints(authorities);
  for (const node of authorities.normalized.geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) {
        const row = fixed(node.id, dof, 'ANCHOR');
        base.set(`${row.nodeId}:${row.dof}`, row);
      }
    }
  }
  for (const row of sourceRows) {
    if (['13', '14', '15', '16', '17', '18'].includes(row.typeCode)) {
      const dof = ({ 13: 'UX', 14: 'UY', 15: 'UZ', 16: 'UX', 17: 'UY', 18: 'UZ' })[row.typeCode];
      const label = row.typeCode === '14' ? 'PLUS-Y-LINEARIZED' : `TYPE-${row.typeCode}-UNILATERAL`;
      unilateral.push(createUnilateralDeclaration({
        declarationId: `BM4-C-${row.nodeId}-${dof}-${label}`,
        nodeId: row.kernelNodeId,
        typeCode: row.typeCode,
        gap: row.gap,
        frictionCoefficient: row.frictionCoefficient,
        limitationCode: BM4_FRICTION_LIMITATION,
      }));
      continue;
    }
    if (row.typeCode === '9') {
      const dof = guideDof(row);
      const baseId = `BM4-C-${row.nodeId}-${dof}-GUIDE`;
      if (row.gap > 0) {
        unilateral.push(...createDoubleActingGapDeclarations({
          declarationId: baseId,
          nodeId: row.kernelNodeId,
          dof,
          gap: row.gap,
          frictionCoefficient: row.frictionCoefficient,
          limitationCode: BM4_FRICTION_LIMITATION,
        }));
      } else {
        base.set(`${row.kernelNodeId}:${dof}`, fixed(row.nodeId, dof, 'GUIDE'));
      }
    }
  }
  const canonical = [...unilateral].sort((a, b) => a.declarationId < b.declarationId ? -1 : a.declarationId > b.declarationId ? 1 : 0);
  return Object.freeze({
    authorities,
    baseDeclarations: Object.freeze([...base.values()]),
    unilateral: Object.freeze(canonical),
    sourceRows: Object.freeze(sourceRows),
  });
}

function compileBm4Model(authorities, constraintDeclarations) {
  const localAxisResults = authorities.entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const sections = new Map(authorities.entries.map((entry) => [entry.analysisSection.semanticHash, entry.analysisSection]));
  return compileMechanicalModel({
    modelIdentity: 'BM4-LIVE-INPUTXML-M034',
    modelRevision: 1,
    sourceSemanticHash: authorities.source.semanticHash,
    conditionedTopology: authorities.conditioned,
    nodeBindings: authorities.normalized.geometry.nodes.map((node) => ({
      nodeId: `BM4.N${node.id}`, conditionedNodeId: `CN-${node.id}`, topologyNodeId: node.id,
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
    sectionResolutions: [...sections.values()],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations,
    profile: compilerProfile(),
  });
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = (analysis.pipeDensity ?? 0) * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  return pipe + contents + (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
}

function compileCase(authorities, compilation, label, thermal, prescribedMovements) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority ? entry.rigidAuthority.gravity.totalLineWeight : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD', elementId: entry.elementId, basis: 'GLOBAL', variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 }, endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M036-WEIGHT`, sourceRevision: `${entry.sourceSegment.id}:${lineWeight}` }),
    });
    if ((analysis.pressure ?? 0) > 0) primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-PRESSURE-${entry.elementId}`,
      kind: 'PRESSURE', elementId: entry.elementId, pressure: analysis.pressure, pressureBasis: 'GAUGE',
      authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-PRESSURE1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}` }),
    });
    if (thermal) primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-TEMPERATURE-${entry.elementId}`,
      kind: 'TEMPERATURE', elementId: entry.elementId, operatingTemperature: analysis.operatingTemperature,
      installationTemperature: INSTALLATION_TEMPERATURE,
      stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
      thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}` }),
    });
  }
  for (const movement of prescribedMovements) primitives.push({
    schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-GAP-${movement.prescribedSlotId}`,
    kind: 'PRESCRIBED_MOVEMENT', prescribedSlotId: movement.prescribedSlotId,
    nodeId: movement.nodeId, dof: movement.dof, value: movement.value,
    sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-RESTRAINT-GAP`, sourceRevision: `${movement.prescribedSlotId}:${movement.value}` }),
  });
  return compilePhysicalLoadCase({
    loadCaseId: `BM4-M036-${label}`, loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `M036 BM4 ${label} frictionless unilateral solve.` },
    modelReference: modelReferenceFromCompilation(compilation), primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function solveOnce(plan, label, thermal, declarations, solveContext = { prescribedMovements: [] }) {
  const { authorities } = plan;
  const compilation = compileBm4Model(authorities, declarations);
  const loadCase = compileCase(authorities, compilation, label, thermal, solveContext.prescribedMovements ?? []);
  const distributed = new Map();
  const temperature = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributed.has(primitive.elementId)) distributed.set(primitive.elementId, []);
      distributed.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') temperature.set(primitive.elementId, primitive);
  }
  const elements = authorities.entries.map((entry) => compileFrameElement({
    elementId: entry.elementId, material: authorities.material, section: entry.analysisSection,
    localAxes: { result: resolveFrameLocalAxes({
      nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector, profile: FRAME_LOCAL_AXIS_PROFILE,
    }), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile: authorities.frameProfile, distributedLoads: distributed.get(entry.elementId) ?? [],
    temperature: temperature.get(entry.elementId) ?? null, releases: [], endSprings: [], rigidOffsets: null,
  }));
  const execution = compileSolverExecution({
    compilation, elementContributions: elements.map(elementContributionFromFrameElement), loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  return Object.freeze({ compilation, loadCase, elements, execution });
}

export function solveBm4UnilateralCase({ plan = buildBm4UnilateralPlan(), label, thermal, unilateral = plan.unilateral }) {
  const analyses = new Map();
  const unilateralExecution = compileUnilateralSolverExecution({
    baseDeclarations: plan.baseDeclarations,
    unilateral,
    buildAndSolve(declarations, context) {
      const analysis = solveOnce(plan, label, thermal, declarations, context);
      analyses.set(analysis.execution.semanticHash, analysis);
      return analysis.execution;
    },
  });
  return Object.freeze({
    plan,
    unilateralExecution,
    finalAnalysis: analyses.get(unilateralExecution.finalExecutionHash),
    totalWeight: plan.authorities.entries.reduce((sum, entry) => {
      const lineWeight = entry.rigidAuthority ? entry.rigidAuthority.gravity.totalLineWeight : physicalLineWeight(entry);
      return sum + lineWeight * entry.sourceSegment.length;
    }, 0),
  });
}

export function solveBm4InheritedState({ plan, label, thermal, state }) {
  const byId = new Map(state.map((row) => [row.declarationId, row.engaged]));
  const activeUnilateral = plan.unilateral.filter((support) => byId.get(support.declarationId) === true);
  const declarations = [...plan.baseDeclarations, ...activeUnilateral.map((support) => support.constraint)];
  const prescribedMovements = activeUnilateral
    .filter((support) => support.constraint.behavior === 'PRESCRIBED_SLOT')
    .map((support) => ({ prescribedSlotId: support.declarationId, nodeId: support.nodeId, dof: support.dof, value: support.contactValue }));
  return solveOnce(plan, label, thermal, declarations, { prescribedMovements });
}

export function seedUnilateralFromState(unilateral, state) {
  const byId = new Map(state.map((row) => [row.declarationId, row.engaged]));
  return unilateral.map((support) => sealUnilateralDeclaration({ ...support, initiallyEngaged: byId.get(support.declarationId) === true }));
}
