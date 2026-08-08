#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { BM4_COMPARISON_POLICY, BM4_OUTPUT_PATH } from './lfea-m034-bm4-output-comparison.mjs';
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
  if (!Number.isFinite(value)) throw new Error(`M051 non-finite ${key}: ${attributes?.[key]}`);
  return value;
}
function caseNumber(loadcase) {
  const match = /^CASE\s+(\d+)\b/u.exec(String(loadcase ?? '').trim());
  return match ? Number(match[1]) : null;
}
function rawRestraints(xml, wantedCase) {
  const reports = findElements(xml, 'RESTRAINT_REPORT').filter((row) => caseNumber(row.attributes.LOADCASE) === wantedCase);
  assert.equal(reports.length, 1, `M051 expected one restraint report for CASE ${wantedCase}.`);
  return Object.freeze(findElements(reports[0].inner, 'RESTRAINT').map((row, rowIndex) => {
    const force = findElements(row.inner, 'FORCES')[0];
    const moment = findElements(row.inner, 'MOMENTS')[0];
    return Object.freeze({
      rowIndex,
      nodeId: String(row.attributes.NODE),
      type: String(row.attributes.TYPE),
      FX: num(force.attributes, 'FX'), FY: num(force.attributes, 'FY'), FZ: num(force.attributes, 'FZ'),
      MX: num(moment.attributes, 'MX'), MY: num(moment.attributes, 'MY'), MZ: num(moment.attributes, 'MZ'),
    });
  }));
}
function plusYRow(raw, nodeId) {
  const rows = raw.filter((row) => row.nodeId === nodeId && /\+Y/u.test(row.type));
  assert.equal(rows.length, 1, `M051 expected exactly one raw +Y row at ${nodeId}; found ${rows.length}.`);
  return rows[0];
}
function supportOnPipe(rawRow) {
  return Object.freeze({ x: -rawRow.FX, y: -rawRow.FY, z: -rawRow.FZ });
}
function classifyNode(raw, nodeId, frictionSource) {
  const row = plusYRow(raw, nodeId);
  const support = supportOnPipe(row);
  const normalN = Math.max(0, support.y);
  const tangentN = Math.hypot(support.x, support.z);
  const capacityN = frictionSource ? MU * normalN : 0;
  const capacityResidualN = frictionSource ? tangentN - capacityN : tangentN;
  const utilization = frictionSource && capacityN > FORCE_TOLERANCE_N ? tangentN / capacityN : null;
  const tangentPresent = tangentN > FORCE_TOLERANCE_N;
  const normalPresent = normalN > FORCE_TOLERANCE_N;
  const coulombAdmissible = frictionSource
    ? tangentN <= capacityN + FORCE_TOLERANCE_N
    : tangentN <= FORCE_TOLERANCE_N;
  return Object.freeze({
    nodeId,
    sourceClass: frictionSource ? 'FRICTION_MU_0_3' : 'FRICTIONLESS_PLUS_Y_CONTROL',
    rowIndex: row.rowIndex,
    rawType: row.type,
    rawPipeOnRestraint: Object.freeze({ fx: row.FX, fy: row.FY, fz: row.FZ }),
    supportOnPipe: support,
    normalN,
    tangentN,
    capacityN,
    utilization,
    capacityResidualN,
    normalPresent,
    tangentPresent,
    coulombAdmissible,
    stateInterpretation: frictionSource && tangentPresent
      ? 'TANGENTIAL_RESTRAINT_FORCE_PRESENT_STATE_NOT_INFERRED'
      : frictionSource
        ? 'NO_TANGENTIAL_FORCE_STATE_NOT_INFERRED'
        : 'NEGATIVE_CONTROL',
  });
}
function summarize(rows, frictionSource) {
  const activeNormal = rows.filter((row) => row.normalPresent);
  const tangential = rows.filter((row) => row.tangentPresent);
  const utilizationRows = rows.filter((row) => row.utilization !== null);
  const vector = rows.reduce((sum, row) => ({
    x: sum.x + row.supportOnPipe.x,
    y: sum.y + row.supportOnPipe.y,
    z: sum.z + row.supportOnPipe.z,
  }), { x: 0, y: 0, z: 0 });
  return Object.freeze({
    nodeCount: rows.length,
    activeNormalCount: activeNormal.length,
    tangentialForcePresentCount: tangential.length,
    coulombAdmissibleCount: rows.filter((row) => row.coulombAdmissible).length,
    maximumTangentialN: Math.max(...rows.map((row) => row.tangentN)),
    totalTangentialMagnitudeN: rows.reduce((sum, row) => sum + row.tangentN, 0),
    resultantSupportVectorN: Object.freeze(vector),
    maximumUtilization: frictionSource && utilizationRows.length
      ? Math.max(...utilizationRows.map((row) => row.utilization)) : null,
    minimumUtilization: frictionSource && utilizationRows.length
      ? Math.min(...utilizationRows.map((row) => row.utilization)) : null,
    topTangential: Object.freeze([...rows].sort((a, b) => b.tangentN - a.tangentN).slice(0, 10)),
  });
}
function rowTypeInventory(raw, selectedNodes) {
  const selected = new Set(selectedNodes);
  const counts = new Map();
  for (const row of raw.filter((entry) => selected.has(entry.nodeId))) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  return Object.freeze(Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))));
}

const xml = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const cases = {};
for (const [label, number] of Object.entries(CASES)) {
  const raw = rawRestraints(xml, number);
  const friction = BM4_M040_FRICTION_NODE_IDS.map((nodeId) => classifyNode(raw, nodeId, true));
  const controls = BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS.map((nodeId) => classifyNode(raw, nodeId, false));
  assert.equal(friction.length, 26, `M051 ${label} friction source population drift.`);
  assert.equal(controls.length, 3, `M051 ${label} frictionless control population drift.`);
  assert.ok(friction.every((row) => row.coulombAdmissible), `M051 ${label} raw +Y tangential force violates mu*N bound.`);
  assert.ok(controls.every((row) => row.coulombAdmissible), `M051 ${label} frictionless +Y control carries tangential +Y-row force.`);
  cases[label] = Object.freeze({
    friction: Object.freeze({ summary: summarize(friction, true), rows: Object.freeze(friction) }),
    frictionlessControls: Object.freeze({ summary: summarize(controls, false), rows: Object.freeze(controls) }),
    rawTypeInventoryAtFrictionNodes: rowTypeInventory(raw, BM4_M040_FRICTION_NODE_IDS),
  });
}

const representationConfirmed = Object.values(cases).some((entry) => entry.friction.summary.tangentialForcePresentCount > 0)
  && Object.values(cases).every((entry) => entry.frictionlessControls.summary.tangentialForcePresentCount === 0);
const report = Object.freeze({
  schema: 'lfea-m051-bm4-raw-friction-load-path/v1',
  sourceAuthority: Object.freeze({
    nodeCount: BM4_M040_FRICTION_NODE_IDS.length,
    frictionCoefficient: MU,
    frictionNodeIds: BM4_M040_FRICTION_NODE_IDS,
    frictionlessControlNodeIds: BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS,
  }),
  rawRestraintConvention: 'PIPE_ON_RESTRAINT',
  cases: Object.freeze(cases),
  representation: Object.freeze({
    plusYRowTangentialRepresentationConfirmed: representationConfirmed,
    rule: 'TANGENTIAL_COMPONENTS_ON_RAW_PLUS_Y_ROW_AT_MU_SOURCE_SITES_WITH_FRICTIONLESS_PLUS_Y_NEGATIVE_CONTROLS',
    stateSelectionFromOutputProhibited: true,
  }),
  disposition: Object.freeze({
    mechanicsChangedByM051: false,
    outputFitUsed: false,
    frictionMechanicsActivated: false,
    productionActivationAuthorized: false,
  }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const label of Object.keys(CASES)) {
  const f = report.cases[label].friction.summary; const c = report.cases[label].frictionlessControls.summary;
  console.log(`M051 ${label} friction +Y rows: active normal ${f.activeNormalCount}/26; tangential present ${f.tangentialForcePresentCount}/26; Coulomb admissible ${f.coulombAdmissibleCount}/26; max T=${f.maximumTangentialN.toFixed(3)} N; max util=${f.maximumUtilization?.toFixed(6) ?? 'n/a'}.`);
  console.log(`M051 ${label} frictionless +Y controls: tangential present ${c.tangentialForcePresentCount}/3; max T=${c.maximumTangentialN.toFixed(6)} N.`);
  console.log(`M051 ${label} top tangential friction rows: ${JSON.stringify(f.topTangential.slice(0, 5).map((row) => ({ nodeId: row.nodeId, T: row.tangentN, N: row.normalN, muN: row.capacityN, utilization: row.utilization, support: row.supportOnPipe })))}.`);
}
console.log(`M051 raw +Y tangential representation confirmed: ${report.representation.plusYRowTangentialRepresentationConfirmed}.`);
