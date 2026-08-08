#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import {
  BM4_COMPARISON_POLICY,
  BM4_OUTPUT_PATH,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import {
  BM4_M040_FRICTION_AUTHORITY,
  BM4_M040_FRICTION_NODE_IDS,
  BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS,
} from './lfea-m040-bm4-friction-authority.mjs';

const CASES = Object.freeze({ SUS: 19, OPE: 20 });
const FORCE_TOLERANCE_N = BM4_COMPARISON_POLICY.absoluteTolerance.force;
const MU = BM4_M040_FRICTION_AUTHORITY.source.frictionCoefficient;

function num(attributes, key) {
  const value = Number(attributes?.[key]);
  if (!Number.isFinite(value)) throw new Error(`M052 non-finite ${key}: ${attributes?.[key]}`);
  return value;
}
function caseNumber(loadcase) {
  const match = /^CASE\s+(\d+)\b/u.exec(String(loadcase ?? '').trim());
  return match ? Number(match[1]) : null;
}
function rawRestraints(xml, wantedCase) {
  const reports = findElements(xml, 'RESTRAINT_REPORT').filter((row) => caseNumber(row.attributes.LOADCASE) === wantedCase);
  assert.equal(reports.length, 1, `M052 expected one RESTRAINT_REPORT for CASE ${wantedCase}.`);
  return Object.freeze(findElements(reports[0].inner, 'RESTRAINT').map((row) => {
    const force = findElements(row.inner, 'FORCES')[0];
    return Object.freeze({
      nodeId: String(row.attributes.NODE), type: String(row.attributes.TYPE),
      x: num(force.attributes, 'FX'), y: num(force.attributes, 'FY'), z: num(force.attributes, 'FZ'),
    });
  }));
}
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(a, factor) { return { x: factor * a.x, y: factor * a.y, z: factor * a.z }; }
function norm(a) { return Math.hypot(a.x, a.y, a.z); }
function horizontal(a) { return Math.hypot(a.x, a.z); }
function endVector(end) { return { x: end.fx, y: end.fy, z: end.fz }; }
function incidentEndSum(globalRows, nodeId) {
  let sum = { x: 0, y: 0, z: 0 }; let count = 0;
  for (const row of globalRows) {
    if (row.fromNode === nodeId) { sum = add(sum, endVector(row.I)); count += 1; }
    if (row.toNode === nodeId) { sum = add(sum, endVector(row.J)); count += 1; }
  }
  assert.ok(count >= 1, `M052 no global element end action is incident at node ${nodeId}.`);
  return Object.freeze({ count, vector: Object.freeze(sum) });
}
function reportedSupport(raw, nodeId) {
  const rows = raw.filter((row) => row.nodeId === nodeId);
  assert.ok(rows.length >= 1, `M052 node ${nodeId} has no raw restraint row.`);
  const pipeOnRestraint = rows.reduce((sum, row) => add(sum, row), { x: 0, y: 0, z: 0 });
  return Object.freeze({
    rowCount: rows.length,
    pipeOnRestraint: Object.freeze(pipeOnRestraint),
    supportOnPipe: Object.freeze(scale(pipeOnRestraint, -1)),
    rowTypes: Object.freeze(rows.map((row) => row.type)),
  });
}
function plusYNormal(raw, nodeId) {
  const rows = raw.filter((row) => row.nodeId === nodeId && /\+Y/u.test(row.type));
  assert.equal(rows.length, 1, `M052 expected one +Y row at ${nodeId}; found ${rows.length}.`);
  return Math.max(0, -rows[0].y);
}
function nodeEvidence({ globalRows, raw, nodeId, frictionSource }) {
  const ends = incidentEndSum(globalRows, nodeId);
  const reported = reportedSupport(raw, nodeId);
  // M045/M044 compare CAESAR end actions directly to LFEA q=K*d-f, which is joint-on-element.
  // Joint equilibrium therefore predicts support-on-pipe = sum(joint-on-element end actions).
  const predictedSupport = ends.vector;
  const unreportedSupport = sub(predictedSupport, reported.supportOnPipe);
  const oppositeConventionResidual = sub(scale(predictedSupport, -1), reported.supportOnPipe);
  const normalN = plusYNormal(raw, nodeId);
  const tangentN = horizontal(unreportedSupport);
  const capacityN = frictionSource ? MU * normalN : 0;
  const utilization = frictionSource && capacityN > FORCE_TOLERANCE_N ? tangentN / capacityN : null;
  return Object.freeze({
    nodeId,
    sourceClass: frictionSource ? 'FRICTION_MU_0_3' : 'FRICTIONLESS_PLUS_Y_CONTROL',
    incidentElementEnds: ends.count,
    rawRestraintRows: reported.rowCount,
    rawRestraintTypes: reported.rowTypes,
    predictedSupportOnPipeFromEndActions: predictedSupport,
    reportedSupportOnPipe: reported.supportOnPipe,
    unreportedSupportOnPipe: Object.freeze(unreportedSupport),
    residualMagnitudeN: norm(unreportedSupport),
    verticalResidualN: unreportedSupport.y,
    tangentialResidualN: tangentN,
    oppositeEndActionConventionResidualN: norm(oppositeConventionResidual),
    normalN,
    capacityN,
    utilization,
    tangentialPresent: tangentN > FORCE_TOLERANCE_N,
    verticalEquilibriumPass: Math.abs(unreportedSupport.y) <= FORCE_TOLERANCE_N,
    coulombAdmissible: frictionSource ? tangentN <= capacityN + FORCE_TOLERANCE_N : tangentN <= FORCE_TOLERANCE_N,
  });
}
function summary(rows, frictionSource) {
  const tangential = rows.filter((row) => row.tangentialPresent);
  const utilizationRows = rows.filter((row) => row.utilization !== null);
  const resultant = rows.reduce((sum, row) => add(sum, row.unreportedSupportOnPipe), { x: 0, y: 0, z: 0 });
  return Object.freeze({
    nodeCount: rows.length,
    tangentialResidualPresentCount: tangential.length,
    verticalEquilibriumPassCount: rows.filter((row) => row.verticalEquilibriumPass).length,
    coulombAdmissibleCount: rows.filter((row) => row.coulombAdmissible).length,
    maximumTangentialResidualN: Math.max(...rows.map((row) => row.tangentialResidualN)),
    totalTangentialResidualMagnitudeN: rows.reduce((sum, row) => sum + row.tangentialResidualN, 0),
    resultantUnreportedSupportN: Object.freeze(resultant),
    maximumUtilization: frictionSource && utilizationRows.length ? Math.max(...utilizationRows.map((row) => row.utilization)) : null,
    topTangential: Object.freeze([...rows].sort((a, b) => b.tangentialResidualN - a.tangentialResidualN).slice(0, 10)),
  });
}

const xml = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const cii = loadBm4CiiOutputCases1921();
const cases = {};
for (const [label, number] of Object.entries(CASES)) {
  const raw = rawRestraints(xml, number);
  const globalRows = cii.globalForce.get(label).rows;
  const friction = BM4_M040_FRICTION_NODE_IDS.map((nodeId) => nodeEvidence({ globalRows, raw, nodeId, frictionSource: true }));
  const controls = BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS.map((nodeId) => nodeEvidence({ globalRows, raw, nodeId, frictionSource: false }));
  const controlDirectPass = controls.every((row) => row.residualMagnitudeN <= FORCE_TOLERANCE_N);
  const controlOppositeWorse = controls.every((row) => row.oppositeEndActionConventionResidualN > row.residualMagnitudeN + FORCE_TOLERANCE_N);
  assert.ok(controlDirectPass, `M052 ${label} frictionless controls do not close nodal equilibrium under the direct end-action convention.`);
  assert.ok(controlOppositeWorse, `M052 ${label} end-action sign convention is not discriminated by frictionless controls.`);
  assert.ok(friction.every((row) => row.verticalEquilibriumPass), `M052 ${label} friction-source vertical equilibrium does not close through reported normal restraints.`);
  cases[label] = Object.freeze({
    signQualification: Object.freeze({
      convention: 'CAESAR_GLOBAL_END_ACTION_IS_JOINT_ON_ELEMENT',
      predictedSupportOnPipe: 'SUM_INCIDENT_CAESAR_GLOBAL_ELEMENT_END_ACTIONS',
      qualifiedByFrictionlessControls: true,
    }),
    friction: Object.freeze({ summary: summary(friction, true), rows: Object.freeze(friction) }),
    frictionlessControls: Object.freeze({ summary: summary(controls, false), rows: Object.freeze(controls) }),
  });
}

const frictionSignal = Object.values(cases).some((entry) => entry.friction.summary.tangentialResidualPresentCount > 0);
const controlsClean = Object.values(cases).every((entry) => entry.frictionlessControls.summary.tangentialResidualPresentCount === 0);
const coulombBounded = Object.values(cases).every((entry) => entry.friction.summary.coulombAdmissibleCount === 26);
const representationConfirmed = frictionSignal && controlsClean && coulombBounded;
const report = Object.freeze({
  schema: 'lfea-m052-bm4-friction-equilibrium-residual/v1',
  sourceAuthority: Object.freeze({ frictionCoefficient: MU, frictionNodeIds: BM4_M040_FRICTION_NODE_IDS, frictionlessControls: BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS }),
  equilibriumIdentity: Object.freeze({
    noF1InCases19And20: true,
    endActionConventionBasis: 'M045_M044_DIRECT_CAESAR_TO_LFEA_Q_COMPARISON_PLUS_FRICTIONLESS_CONTROL_CLOSURE',
    equation: 'unreported_support = sum_incident_joint_on_element_end_actions - reported_support_on_pipe',
  }),
  cases: Object.freeze(cases),
  interpretation: Object.freeze({
    boundedTangentialEquilibriumResidualConfirmed: representationConfirmed,
    residualMayBeCalledFrictionLoadPathEvidence: representationConfirmed,
    stickSlipStateMayBeInferred: false,
    outputMaySelectProductionFrictionState: false,
  }),
  disposition: Object.freeze({ mechanicsChangedByM052: false, outputFitUsed: false, frictionMechanicsActivated: false, productionActivationAuthorized: false }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const label of Object.keys(CASES)) {
  const f = report.cases[label].friction.summary; const c = report.cases[label].frictionlessControls.summary;
  console.log(`M052 ${label} friction residuals: tangential ${f.tangentialResidualPresentCount}/26; vertical closure ${f.verticalEquilibriumPassCount}/26; Coulomb admissible ${f.coulombAdmissibleCount}/26; max T=${f.maximumTangentialResidualN.toFixed(3)} N; max util=${f.maximumUtilization?.toFixed(6) ?? 'n/a'}.`);
  console.log(`M052 ${label} controls: tangential ${c.tangentialResidualPresentCount}/3; max T=${c.maximumTangentialResidualN.toFixed(6)} N.`);
  console.log(`M052 ${label} top residuals: ${JSON.stringify(f.topTangential.slice(0, 6).map((row) => ({ nodeId: row.nodeId, T: row.tangentialResidualN, N: row.normalN, muN: row.capacityN, utilization: row.utilization, residual: row.unreportedSupportOnPipe })))}.`);
}
console.log(`M052 bounded tangential equilibrium residual confirmed: ${report.interpretation.boundedTangentialEquilibriumResidualConfirmed}.`);
