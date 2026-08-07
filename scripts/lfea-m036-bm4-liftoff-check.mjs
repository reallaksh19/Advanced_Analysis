#!/usr/bin/env node

import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { attributeValue, findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { resolveRestraintTypeMutation } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { convertInputXmlLengthToMetres, parseInputXmlUnitSystem } from '../src/core/geometry/adapters/inputxml-unit-system.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compileSolverExecution, elementContributionFromFrameElement } from '../src/core/linear-fea-solver/index.js';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE, BM4_SOURCE_ID, GRAVITY, INSTALLATION_TEMPERATURE,
  buildBm4SolveAuthorities, sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';

const TARGETS = Object.freeze(['20090', '20350', '21470', '21610']);
const H1_RELEASED = new Set(TARGETS);
const NEIGHBORS = Object.freeze(['20170', '21640']);

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
      index,
      nodeId: node == null ? null : String(node),
      typeCode: mutation.typeCode,
      gap: gapRaw == null ? 0 : convertInputXmlLengthToMetres(gapRaw, units.lengthUnit),
      frictionCoefficient: caesarNumber(attributeValue(tag.attributes, 'FRIC_COEF')),
    };
  }).filter((row) => row.nodeId !== null && row.typeCode !== null);
}

function constraintInventory(authorities) {
  const base = new Map();
  const unilateral = [];
  const rawRows = rawRestraints(authorities.content);
  const rawByNode = new Map();
  for (const row of rawRows) {
    if (!rawByNode.has(row.nodeId)) rawByNode.set(row.nodeId, []);
    rawByNode.get(row.nodeId).push(row);
  }
  const add = (nodeId, dof, reason) => base.set(`${nodeId}:${dof}`, {
    declarationId: `BM4-C-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT', nodeId: `BM4.N${nodeId}`, dof, behavior: 'FIXED',
  });
  for (const node of authorities.normalized.geometry.nodes) {
    if (node.restraint === 'ANCHOR') for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof, 'ANCHOR');
    const candidates = rawByNode.get(node.id) ?? [];
    const consumed = new Set();
    for (const restraint of node.meta.restraints ?? []) {
      const raw = candidates.find((row) => !consumed.has(row.index) && row.typeCode === restraint.typeCode) ?? null;
      if (raw) consumed.add(raw.index);
      if (restraint.typeCode === '14') unilateral.push({
        declarationId: `BM4-C-${node.id}-UY-PLUS-Y-LINEARIZED`, nodeId: `BM4.N${node.id}`,
        typeCode: 14, gap: raw?.gap ?? 0,
        frictionCoefficient: raw?.frictionCoefficient ?? restraint.frictionCoefficient ?? null,
      });
      if (restraint.typeCode === '9') {
        const v = [Math.abs(restraint.xCosine ?? 0), Math.abs(restraint.yCosine ?? 0), Math.abs(restraint.zCosine ?? 0)];
        add(node.id, ['UX', 'UY', 'UZ'][v.indexOf(Math.max(...v))], 'GUIDE');
      }
    }
  }
  return Object.freeze({
    base: [...base.values()],
    unilateral: unilateral.sort((a, b) => a.declarationId < b.declarationId ? -1 : 1),
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
    modelIdentity: 'BM4-LIVE-INPUTXML-M034', modelRevision: 1,
    sourceSemanticHash: authorities.source.semanticHash, conditionedTopology: authorities.conditioned,
    nodeBindings: authorities.normalized.geometry.nodes.map((node) => ({
      nodeId: `BM4.N${node.id}`, conditionedNodeId: `CN-${node.id}`, topologyNodeId: node.id,
    })),
    elementBindings: authorities.entries.map((entry) => ({
      elementId: entry.elementId, conditionedSegmentId: entry.sourceSegment.id, topologySegmentId: entry.sourceSegment.id,
      materialStateId: authorities.material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1', localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId ?? entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [authorities.material], sectionResolutions: [...sections.values()],
    localAxisResults: axes, localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraints, profile: compilerProfile(),
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

function compileCase(authorities, compilation, label, thermal) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceSegment.meta.analysis;
    const lineWeight = entry.rigidAuthority ? entry.rigidAuthority.gravity.totalLineWeight : physicalLineWeight(entry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1', primitiveId: `BM4-${label}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD', elementId: entry.elementId, basis: 'GLOBAL', variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 }, endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({
        sourceId: entry.rigidAuthority ? `${BM4_SOURCE_ID}-RIGID-WEIGHT` : `${BM4_SOURCE_ID}-PHYSICAL-WEIGHT`,
        sourceRevision: `${entry.sourceSegment.id}:${lineWeight}`, rigidAuthorityHash: entry.rigidAuthority?.semanticHash ?? null,
      }),
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
  return compilePhysicalLoadCase({
    loadCaseId: `BM4-${label}`, loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `M036 BM4 ${label} unilateral solve.` },
    modelReference: modelReferenceFromCompilation(compilation), primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function analyse(authorities, constraints, label, thermal) {
  const compilation = compileModel(authorities, constraints);
  const loadCase = compileCase(authorities, compilation, label, thermal);
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
      nodeI: point(authorities.normalized.geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(authorities.normalized.geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector, profile: FRAME_LOCAL_AXIS_PROFILE,
    }), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile: authorities.frameProfile, distributedLoads: distributed.get(entry.elementId) ?? [],
    temperature: temperatures.get(entry.elementId) ?? null, releases: [], endSprings: [], rigidOffsets: null,
  }));
  const execution = compileSolverExecution({
    compilation, elementContributions: frameElements.map(elementContributionFromFrameElement), loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  return Object.freeze({ compilation, loadCase, execution });
}

function reaction(execution, nodeId) {
  return execution.reactions.find((row) => row.nodeId === `BM4.N${nodeId}` && row.dof === 'UY')?.value ?? 0;
}

function finalAnalysis(authorities, inventory, unilateralExecution, label, thermal) {
  const active = unilateralExecution.convergedState.filter((row) => row.status === 'ENGAGED')
    .map((row) => inventory.unilateral.find((u) => u.declarationId === row.declarationId))
    .map((u) => ({ declarationId: u.declarationId, kind: 'NODAL_RESTRAINT', nodeId: u.nodeId, dof: 'UY', behavior: 'FIXED' }));
  const result = analyse(authorities, [...inventory.base, ...active], label, thermal);
  assert.equal(result.execution.semanticHash, unilateralExecution.finalExecutionHash, `${label} converged execution hash`);
  return result;
}

function equilibrium(analysis) {
  const lengths = new Map(analysis.compilation.model.elements.map((element) => {
    const i = analysis.compilation.model.nodes.find((node) => node.nodeId === element.nodeI).position;
    const j = analysis.compilation.model.nodes.find((node) => node.nodeId === element.nodeJ).position;
    return [element.elementId, Math.hypot(j.x - i.x, j.y - i.y, j.z - i.z)];
  }));
  let appliedY = 0;
  for (const p of analysis.loadCase.primitives) if (p.kind === 'DISTRIBUTED_LOAD') {
    appliedY += 0.5 * (p.startIntensity.fy + p.endIntensity.fy) * lengths.get(p.elementId);
  }
  const reactionY = analysis.execution.reactions.filter((row) => row.dof === 'UY').reduce((sum, row) => sum + row.value, 0);
  const relative = Math.abs(reactionY + appliedY) / Math.max(Math.abs(appliedY), 1);
  const forceLimit = analysis.execution.diagnostics.forceEquilibrium.limit;
  const acceptedEnvelope = Math.max(forceLimit, BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit.value);
  assert.ok(relative <= acceptedEnvelope, `vertical equilibrium ${relative} > ${acceptedEnvelope}`);
  return { appliedY, reactionY, relative, forceLimit, acceptedEnvelope };
}

const direct = solveBm4InputXmlConditioned();
const authorities = buildBm4SolveAuthorities();
const inventory = constraintInventory(authorities);
const cii = loadBm4CiiOutputCases1921();
assert.equal(inventory.unilateral.length, 29, 'BM4 must expose 29 canonical +Y supports');
assert.equal(inventory.unilateral.filter((u) => u.gap > 0).length, 0, 'BM4 +Y family must not silently carry an unhandled nonzero gap');

for (const [label, execution] of [['SUS', direct.sustained.execution], ['OPE', direct.operating.execution]]) {
  const noOp = compileUnilateralSolverExecution({ baseDeclarations: [], unilateral: [], buildAndSolve: () => execution });
  assert.equal(noOp.finalExecutionHash, execution.semanticHash, `T5 ${label} no-op hash`);
}

const solveState = (label, thermal) => compileUnilateralSolverExecution({
  baseDeclarations: inventory.base, unilateral: inventory.unilateral,
  buildAndSolve: (constraints) => analyse(authorities, constraints, label, thermal).execution,
});
const sus = solveState('SUS', false);
const ope = solveState('OPE', true);
const finalSus = finalAnalysis(authorities, inventory, sus, 'SUS', false);
const finalOpe = finalAnalysis(authorities, inventory, ope, 'OPE', true);

const releasedSus = sus.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.nodeId.replace('BM4.N', '')).sort();
const releasedOpe = ope.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.nodeId.replace('BM4.N', '')).sort();
const h1Confirmed = releasedSus.length === H1_RELEASED.size && releasedSus.every((id) => H1_RELEASED.has(id));
const targetRows = [];
for (const [label, beforeExecution, afterExecution] of [
  ['SUS', direct.sustained.execution, finalSus.execution],
  ['OPE', direct.operating.execution, finalOpe.execution],
]) for (const nodeId of TARGETS) {
  const ciiRow = cii.restraint.get(label).get(nodeId);
  const ciiReaction = ciiRow ? -ciiRow.FY : null;
  const after = reaction(afterExecution, nodeId);
  targetRows.push({ label, nodeId, before: reaction(beforeExecution, nodeId), after, cii: ciiReaction });
  if (label === 'OPE') assert.ok(Math.abs(after) <= 1, `${nodeId} OPE reaction must be within 1 N of zero`);
}

const redistribution = NEIGHBORS.map((nodeId) => {
  const ciiRow = cii.restraint.get('OPE').get(nodeId);
  const ciiReaction = ciiRow ? -ciiRow.FY : null;
  const before = reaction(direct.operating.execution, nodeId);
  const after = reaction(finalOpe.execution, nodeId);
  return { nodeId, before, after, cii: ciiReaction, beforeError: Math.abs(before - ciiReaction), afterError: Math.abs(after - ciiReaction) };
});
for (const row of redistribution) assert.ok(row.afterError < row.beforeError, `${row.nodeId} OPE redistribution must move toward CAESAR`);
for (const nodeId of TARGETS) assert.ok(ope.limitations.some((row) => row.nodeId === `BM4.N${nodeId}` && row.code === 'BM4_FRICTION_NOT_MODELED'), `${nodeId} friction limitation`);

const report = {
  check: 'lfea-m036-bm4-liftoff', status: 'PASS',
  h1: { predictedReleased: [...H1_RELEASED].sort(), confirmed: h1Confirmed, actualReleased: releasedSus },
  opeReleased: releasedOpe,
  inventory: {
    unilateralCount: inventory.unilateral.length,
    frictionLimitations: ope.limitations.length,
    nonzeroDirectionalGaps: inventory.unilateral.filter((u) => u.gap > 0),
    gappedGuideEvidence: inventory.gappedGuideEvidence.map((row) => ({ nodeId: row.nodeId, gap: row.gap })),
  },
  targetRows,
  equilibrium: { SUS: equilibrium(finalSus), OPE: equilibrium(finalOpe) },
  redistribution,
  trace: { SUS: sus.trace, OPE: ope.trace },
};
console.log(JSON.stringify(report, null, 2));
console.log(`M036_SUMMARY=${JSON.stringify({ h1: report.h1, opeReleased: report.opeReleased, targetRows, equilibrium: report.equilibrium, redistribution, gappedGuideEvidence: report.inventory.gappedGuideEvidence })}`);
