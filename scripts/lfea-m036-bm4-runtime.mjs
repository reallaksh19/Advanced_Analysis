import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { attributeValue, findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { resolveRestraintTypeMutation } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { convertInputXmlLengthToMetres, parseInputXmlUnitSystem } from '../src/core/geometry/adapters/inputxml-unit-system.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compileSolverExecution, elementContributionFromFrameElement } from '../src/core/linear-fea-solver/index.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE, BM4_SOURCE_ID, GRAVITY, INSTALLATION_TEMPERATURE, sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';

export const M036_BM4_TARGETS = Object.freeze(['20090', '20350', '21470', '21610']);
export const M036_BM4_NEIGHBORS = Object.freeze(['20170', '21640']);
const TARGET_SET = new Set(M036_BM4_TARGETS);
const AXIS = Object.freeze({
  UX: Object.freeze({ positive: 13, negative: 16 }),
  UY: Object.freeze({ positive: 14, negative: 17 }),
  UZ: Object.freeze({ positive: 15, negative: 18 }),
});

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM4 node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function caesarNumber(value) {
  const numeric = Number(String(value ?? '').trim());
  return Number.isFinite(numeric) && Math.abs(numeric + 1.0101) >= 0.001 ? numeric : null;
}

function rawRestraints(content) {
  const diagnostics = [];
  const units = parseInputXmlUnitSystem(content, 'mm', diagnostics);
  return findElements(content, 'RESTRAINT').map((tag, index) => {
    const node = caesarNumber(attributeValue(tag.attributes, 'NODE'));
    const mutation = resolveRestraintTypeMutation(attributeValue(tag.attributes, 'TYPE'));
    const gapRaw = caesarNumber(attributeValue(tag.attributes, 'GAP'));
    return {
      index, nodeId: node == null ? null : String(node), typeCode: mutation.typeCode,
      gap: gapRaw == null ? 0 : convertInputXmlLengthToMetres(gapRaw, units.lengthUnit),
      frictionCoefficient: caesarNumber(attributeValue(tag.attributes, 'FRIC_COEF')),
    };
  }).filter((row) => row.nodeId !== null && row.typeCode !== null);
}

function guideDof(restraint) {
  const values = [Math.abs(restraint.xCosine ?? 0), Math.abs(restraint.yCosine ?? 0), Math.abs(restraint.zCosine ?? 0)];
  return ['UX', 'UY', 'UZ'][values.indexOf(Math.max(...values))];
}

function gapFaces(nodeId, dof, raw) {
  const common = { nodeId: `BM4.N${nodeId}`, gap: raw.gap, frictionCoefficient: raw.frictionCoefficient, initiallyEngaged: false };
  return [
    { ...common, declarationId: `BM4-GAP-${nodeId}-${dof}-LOWER`, typeCode: AXIS[dof].positive },
    { ...common, declarationId: `BM4-GAP-${nodeId}-${dof}-UPPER`, typeCode: AXIS[dof].negative },
  ];
}

export function buildM036Bm4Inventory(authorities) {
  const base = new Map();
  const unilateral = [];
  const rawRows = rawRestraints(authorities.content);
  const rawByNode = new Map();
  for (const row of rawRows) {
    if (!rawByNode.has(row.nodeId)) rawByNode.set(row.nodeId, []);
    rawByNode.get(row.nodeId).push(row);
  }
  const add = (nodeId, dof, reason) => base.set(`${nodeId}:${dof}`, {
    declarationId: `BM4-C-${nodeId}-${dof}-${reason}`, kind: 'NODAL_RESTRAINT',
    nodeId: `BM4.N${nodeId}`, dof, behavior: 'FIXED',
  });
  for (const node of authorities.normalized.geometry.nodes) {
    if (node.restraint === 'ANCHOR') for (const dof of Object.keys(AXIS).concat(['RX', 'RY', 'RZ'])) add(node.id, dof, 'ANCHOR');
    const candidates = rawByNode.get(node.id) ?? [];
    const consumed = new Set();
    for (const restraint of node.meta.restraints ?? []) {
      const raw = candidates.find((row) => !consumed.has(row.index) && row.typeCode === restraint.typeCode) ?? null;
      if (raw) consumed.add(raw.index);
      if (restraint.typeCode === '14') {
        if (TARGET_SET.has(node.id)) unilateral.push({
          declarationId: `BM4-C-${node.id}-UY-PLUS-Y`, nodeId: `BM4.N${node.id}`, typeCode: 14,
          gap: raw?.gap ?? 0, frictionCoefficient: raw?.frictionCoefficient ?? restraint.frictionCoefficient ?? null,
        });
        else add(node.id, 'UY', 'PLUS-Y-LINEARIZED');
      }
      if (restraint.typeCode === '9') {
        const dof = guideDof(restraint);
        if ((raw?.gap ?? 0) > 0) unilateral.push(...gapFaces(node.id, dof, raw));
        else add(node.id, dof, 'GUIDE');
      }
    }
  }
  return Object.freeze({
    base: [...base.values()], unilateral: unilateral.sort((a, b) => a.declarationId < b.declarationId ? -1 : 1),
    gappedGuideEvidence: rawRows.filter((row) => row.typeCode === '9' && row.gap > 0),
  });
}

function compileModel(authorities, constraints) {
  const axes = authorities.entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector, profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const sections = new Map(authorities.entries.map((entry) => [entry.analysisSection.semanticHash, entry.analysisSection]));
  return compileMechanicalModel({
    modelIdentity: 'BM4-LIVE-INPUTXML-M034', modelRevision: 1, sourceSemanticHash: authorities.source.semanticHash,
    conditionedTopology: authorities.conditioned,
    nodeBindings: authorities.normalized.geometry.nodes.map((node) => ({ nodeId: `BM4.N${node.id}`, conditionedNodeId: `CN-${node.id}`, topologyNodeId: node.id })),
    elementBindings: authorities.entries.map((entry) => ({
      elementId: entry.elementId, conditionedSegmentId: entry.sourceSegment.id, topologySegmentId: entry.sourceSegment.id,
      materialStateId: authorities.material.materialState.materialStateId, sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1', localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId ?? entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [authorities.material], sectionResolutions: [...sections.values()], localAxisResults: axes,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE, constraintDeclarations: constraints, profile: compilerProfile(),
  });
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = (analysis.pipeDensity ?? 0) * section.sectionState.area * GRAVITY;
  const contents = (analysis.fluidDensity ?? 0) * Math.PI * section.dimensions.innerDiameter ** 2 / 4 * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  return pipe + contents + (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
}

function compileCase(authorities, compilation, label, thermal, movements) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority ? entry.rigidAuthority.gravity.totalLineWeight : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-WEIGHT-${entry.elementId}`, kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId, basis: 'GLOBAL', variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 }, endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-WEIGHT`, sourceRevision: `${entry.sourceSegment.id}:${lineWeight}` }),
    });
    if ((analysis.pressure ?? 0) > 0) primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-PRESSURE-${entry.elementId}`, kind: 'PRESSURE',
      elementId: entry.elementId, pressure: analysis.pressure, pressureBasis: 'GAUGE',
      authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-PRESSURE1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.pressure}` }),
    });
    if (thermal) primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-TEMPERATURE-${entry.elementId}`, kind: 'TEMPERATURE',
      elementId: entry.elementId, operatingTemperature: analysis.operatingTemperature, installationTemperature: INSTALLATION_TEMPERATURE,
      stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
      thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.sourceSegment.id}:${analysis.operatingTemperature}` }),
    });
  }
  for (const movement of movements) primitives.push({
    schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-CONTACT-${movement.prescribedSlotId}`,
    kind: 'PRESCRIBED_MOVEMENT', prescribedSlotId: movement.prescribedSlotId, nodeId: movement.nodeId, dof: movement.dof, value: movement.value,
    sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-GAP-CONTACT`, sourceRevision: `${movement.prescribedSlotId}:${movement.value}` }),
  });
  return compilePhysicalLoadCase({
    loadCaseId: `BM4-${label}`, loadCaseClass: 'MIXED_PHYSICAL', presentation: { label, description: `M036 BM4 ${label} unilateral solve.` },
    modelReference: modelReferenceFromCompilation(compilation), primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

export function analyseM036Bm4(authorities, constraints, label, thermal, movements = []) {
  const compilation = compileModel(authorities, constraints);
  const loadCase = compileCase(authorities, compilation, label, thermal, movements);
  const distributed = new Map();
  const temperatures = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributed.has(primitive.elementId)) distributed.set(primitive.elementId, []);
      distributed.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') temperatures.set(primitive.elementId, primitive);
  }
  const frameElements = authorities.entries.map((entry) => compileFrameElement({
    elementId: entry.elementId, material: authorities.material, section: entry.analysisSection,
    localAxes: { result: resolveFrameLocalAxes({
      nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId), nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector, profile: FRAME_LOCAL_AXIS_PROFILE,
    }), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile: authorities.frameProfile, distributedLoads: distributed.get(entry.elementId) ?? [], temperature: temperatures.get(entry.elementId) ?? null,
    releases: [], endSprings: [], rigidOffsets: null,
  }));
  const execution = compileSolverExecution({
    compilation, elementContributions: frameElements.map(elementContributionFromFrameElement), loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  return Object.freeze({ compilation, loadCase, execution });
}

export function finalM036Bm4(authorities, inventory, run, label, thermal) {
  const active = run.unilateral.filter((u) => run.convergedState.some((row) => row.declarationId === u.declarationId && row.status === 'ENGAGED'));
  const result = analyseM036Bm4(authorities, [...inventory.base, ...active.map((u) => u.constraintDeclaration)], label, thermal,
    active.map((u) => u.prescribedMovement).filter((row) => row !== null));
  assert.equal(result.execution.semanticHash, run.finalExecutionHash, `${label} converged execution hash`);
  return result;
}

export function m036Bm4Reaction(execution, nodeId) {
  return execution.reactions.find((row) => row.nodeId === `BM4.N${nodeId}` && row.dof === 'UY')?.value ?? 0;
}

export function auditM036Bm4Equilibrium(analysis) {
  const lengths = new Map(analysis.compilation.model.elements.map((element) => {
    const i = analysis.compilation.model.nodes.find((node) => node.nodeId === element.nodeI).position;
    const j = analysis.compilation.model.nodes.find((node) => node.nodeId === element.nodeJ).position;
    return [element.elementId, Math.hypot(j.x - i.x, j.y - i.y, j.z - i.z)];
  }));
  let appliedY = 0;
  for (const p of analysis.loadCase.primitives) if (p.kind === 'DISTRIBUTED_LOAD') appliedY += 0.5 * (p.startIntensity.fy + p.endIntensity.fy) * lengths.get(p.elementId);
  const reactionY = analysis.execution.reactions.filter((row) => row.dof === 'UY').reduce((sum, row) => sum + row.value, 0);
  const relative = Math.abs(reactionY + appliedY) / Math.max(Math.abs(appliedY), 1);
  const forceLimit = analysis.execution.diagnostics.forceEquilibrium.limit;
  const acceptedEnvelope = Math.max(forceLimit, BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit.value);
  assert.ok(relative <= acceptedEnvelope, `vertical equilibrium ${relative} > ${acceptedEnvelope}`);
  return { appliedY, reactionY, relative, forceLimit, acceptedEnvelope };
}
