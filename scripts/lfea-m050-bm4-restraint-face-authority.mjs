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
import { solveBm4M047PressureElongationCandidate } from './lfea-m047-bm4-pressure-elongation-runtime.mjs';

const CASES = Object.freeze({ SUS: 19, OPE: 20 });
const DOF_AXIS = Object.freeze({ UX: 'FX', UY: 'FY', UZ: 'FZ' });
const DOF_DISP = Object.freeze({ UX: 'DX', UY: 'DY', UZ: 'DZ' });
const FORCE_TOLERANCE_N = BM4_COMPARISON_POLICY.absoluteTolerance.force;
const BOUNDARY_TOLERANCE_M = 2e-9;

function num(attributes, key) {
  const value = Number(attributes?.[key]);
  if (!Number.isFinite(value)) throw new Error(`M050 non-finite ${key}: ${attributes?.[key]}`);
  return value;
}
function caseNumber(loadcase) {
  const match = /^CASE\s+(\d+)\b/u.exec(String(loadcase ?? '').trim());
  return match ? Number(match[1]) : null;
}
function rawRestraints(xml, wantedCase) {
  const reports = findElements(xml, 'RESTRAINT_REPORT').filter((row) => caseNumber(row.attributes.LOADCASE) === wantedCase);
  assert.equal(reports.length, 1, `M050 expected one restraint report for CASE ${wantedCase}.`);
  return Object.freeze(findElements(reports[0].inner, 'RESTRAINT').map((row, index) => {
    const force = findElements(row.inner, 'FORCES')[0];
    const moment = findElements(row.inner, 'MOMENTS')[0];
    return Object.freeze({
      rowIndex: index,
      nodeId: String(row.attributes.NODE),
      type: String(row.attributes.TYPE),
      FX: num(force.attributes, 'FX'), FY: num(force.attributes, 'FY'), FZ: num(force.attributes, 'FZ'),
      MX: num(moment.attributes, 'MX'), MY: num(moment.attributes, 'MY'), MZ: num(moment.attributes, 'MZ'),
    });
  }));
}
function cleanNodeId(value) { return String(value).replace(/^BM4M035\.N/u, ''); }
function runFor(solved, label) { return label === 'SUS' ? solved.sustainedRun : solved.operatingRun; }
function executionFor(solved, label) { return label === 'SUS' ? solved.sustained.execution : solved.operating.execution; }
function lfeaReaction(execution, nodeId, dof) {
  return execution.reactions.find((row) => cleanNodeId(row.nodeId) === nodeId && row.dof === dof)?.value ?? 0;
}
function stateMap(run) { return new Map(run.convergedState.map((row) => [row.declarationId, row.status])); }
function groupDeclarations(run) {
  const groups = new Map();
  for (const row of run.unilateral) {
    const key = `${cleanNodeId(row.nodeId)}:${row.dof}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, rows]) => Object.freeze({
    key, nodeId: cleanNodeId(rows[0].nodeId), dof: rows[0].dof,
    rows: Object.freeze([...rows].sort((a, b) => a.sense - b.sense)),
  }));
}
function rawRowsAt(raw, nodeId) { return raw.filter((row) => row.nodeId === nodeId); }
function plusYRaw(rows) {
  const matched = rows.filter((row) => /\+Y/u.test(row.type));
  assert.equal(matched.length, 1, `M050 expected one raw +Y row; found ${matched.length}.`);
  return matched[0];
}
function gapRawCandidate(rows, dof) {
  const axis = DOF_AXIS[dof];
  const gapped = rows.filter((row) => /w\/gap/u.test(row.type));
  const significant = gapped.filter((row) => Math.abs(row[axis]) > FORCE_TOLERANCE_N);
  if (significant.length === 0) return Object.freeze({ row: null, candidates: gapped });
  const sorted = [...significant].sort((a, b) => Math.abs(b[axis]) - Math.abs(a[axis]));
  if (sorted.length > 1 && Math.abs(sorted[1][axis]) > FORCE_TOLERANCE_N) {
    throw new Error(`M050 ${rows[0]?.nodeId}:${dof} has multiple raw gap rows with nonzero ${axis}.`);
  }
  return Object.freeze({ row: sorted[0], candidates: gapped });
}
function compareReaction(lfea, caesarSupportOnPipe) {
  const delta = lfea - caesarSupportOnPipe;
  const absDelta = Math.abs(delta);
  const nearZero = Math.abs(caesarSupportOnPipe) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absPercent = nearZero ? null : absDelta / Math.abs(caesarSupportOnPipe) * 100;
  const passed = nearZero ? absDelta <= FORCE_TOLERANCE_N : absPercent <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  return Object.freeze({ lfea, caesarSupportOnPipe, delta, absDelta, absPercent, passed });
}
function classifyGroup({ group, rawRows, displacement, state, execution }) {
  const axis = DOF_AXIS[group.dof];
  const dispField = DOF_DISP[group.dof];
  const displacementM = displacement[dispField] * 1e-3;
  const lfeaN = lfeaReaction(execution, group.nodeId, group.dof);
  if (group.rows.length === 1) {
    const declaration = group.rows[0];
    assert.equal(declaration.dof, 'UY', `M050 singleton unilateral group ${group.key} must be +Y.`);
    const raw = plusYRaw(rawRows);
    const rawN = raw[axis];
    const supportOnPipeN = -rawN;
    const separated = displacementM > BOUNDARY_TOLERANCE_M;
    const atFace = Math.abs(displacementM) <= BOUNDARY_TOLERANCE_M;
    const authorityState = separated && Math.abs(rawN) <= FORCE_TOLERANCE_N ? 'RELEASED'
      : atFace && supportOnPipeN > FORCE_TOLERANCE_N ? 'ENGAGED' : 'UNRESOLVED';
    const expectedRawSign = authorityState === 'ENGAGED' ? -1 : 0;
    return Object.freeze({
      key: group.key, nodeId: group.nodeId, dof: group.dof, kind: 'PLUS_Y', displacementM,
      raw: Object.freeze({ rowIndex: raw.rowIndex, type: raw.type, reactionN: rawN }),
      rawSignMatchesPipeOnRestraint: expectedRawSign === 0 ? null : Math.sign(rawN) === expectedRawSign,
      authorityState, lfeaState: state.get(declaration.declarationId), stateMatches: authorityState === state.get(declaration.declarationId),
      activeDeclarationId: authorityState === 'ENGAGED' ? declaration.declarationId : null,
      reactionComparison: authorityState === 'ENGAGED' ? compareReaction(lfeaN, supportOnPipeN) : null,
    });
  }
  assert.equal(group.rows.length, 2, `M050 gap group ${group.key} must have two faces.`);
  const gap = group.rows[0].gap;
  assert.ok(group.rows.every((row) => row.gap === gap), `M050 ${group.key} gap drift.`);
  const lower = group.rows.find((row) => row.sense === 1);
  const upper = group.rows.find((row) => row.sense === -1);
  assert.ok(lower && upper, `M050 ${group.key} must contain lower(+1) and upper(-1) faces.`);
  const atLower = Math.abs(displacementM + gap) <= BOUNDARY_TOLERANCE_M;
  const atUpper = Math.abs(displacementM - gap) <= BOUNDARY_TOLERANCE_M;
  const inside = displacementM > -gap + BOUNDARY_TOLERANCE_M && displacementM < gap - BOUNDARY_TOLERANCE_M;
  const rawMatch = gapRawCandidate(rawRows, group.dof);
  const raw = rawMatch.row;
  const rawN = raw?.[axis] ?? 0;
  const supportOnPipeN = -rawN;
  let authorityState = 'UNRESOLVED'; let active = null; let expectedRawSign = 0;
  if (inside && raw === null) authorityState = 'BOTH_RELEASED';
  else if (atLower && raw && supportOnPipeN > FORCE_TOLERANCE_N) {
    authorityState = 'LOWER_ENGAGED'; active = lower; expectedRawSign = -1;
  } else if (atUpper && raw && supportOnPipeN < -FORCE_TOLERANCE_N) {
    authorityState = 'UPPER_ENGAGED'; active = upper; expectedRawSign = 1;
  } else if ((atLower || atUpper) && raw === null) authorityState = 'BOUNDARY_ZERO_REACTION';
  const lowerExpected = authorityState === 'LOWER_ENGAGED' ? 'ENGAGED' : 'RELEASED';
  const upperExpected = authorityState === 'UPPER_ENGAGED' ? 'ENGAGED' : 'RELEASED';
  const lfeaLower = state.get(lower.declarationId); const lfeaUpper = state.get(upper.declarationId);
  return Object.freeze({
    key: group.key, nodeId: group.nodeId, dof: group.dof, kind: 'FINITE_GAP', gapM: gap, displacementM,
    raw: raw ? Object.freeze({ rowIndex: raw.rowIndex, type: raw.type, reactionN: rawN }) : null,
    rawGapRowCountAtNode: rawMatch.candidates.length,
    rawSignMatchesPipeOnRestraint: expectedRawSign === 0 ? null : Math.sign(rawN) === expectedRawSign,
    authorityState,
    lfeaStates: Object.freeze({ lower: lfeaLower, upper: lfeaUpper }),
    stateMatches: ['BOTH_RELEASED', 'LOWER_ENGAGED', 'UPPER_ENGAGED'].includes(authorityState)
      ? lfeaLower === lowerExpected && lfeaUpper === upperExpected : null,
    activeDeclarationId: active?.declarationId ?? null,
    reactionComparison: active ? compareReaction(lfeaN, supportOnPipeN) : null,
  });
}
function summarize(rows) {
  const resolvable = rows.filter((row) => row.stateMatches !== null);
  const active = rows.filter((row) => row.reactionComparison !== null);
  const signRows = rows.filter((row) => row.rawSignMatchesPipeOnRestraint !== null);
  return Object.freeze({
    groups: rows.length,
    resolvableGroups: resolvable.length,
    stateMatches: resolvable.filter((row) => row.stateMatches).length,
    stateMismatches: resolvable.filter((row) => !row.stateMatches).length,
    unresolvedGroups: rows.filter((row) => row.stateMatches === null).length,
    activeGroups: active.length,
    rawSignChecks: signRows.length,
    rawSignMatchesPipeOnRestraint: signRows.filter((row) => row.rawSignMatchesPipeOnRestraint).length,
    reactionPass: active.filter((row) => row.reactionComparison.passed).length,
    reactionFail: active.filter((row) => !row.reactionComparison.passed).length,
    reactionMaeN: active.length ? active.reduce((sum, row) => sum + row.reactionComparison.absDelta, 0) / active.length : null,
    worstReaction: active.length ? [...active].sort((a, b) => b.reactionComparison.absDelta - a.reactionComparison.absDelta)[0] : null,
    stateMismatchRows: Object.freeze(resolvable.filter((row) => !row.stateMatches)),
    unresolvedRows: Object.freeze(rows.filter((row) => row.stateMatches === null)),
    reactionFailureRows: Object.freeze(active.filter((row) => !row.reactionComparison.passed)),
  });
}

const xml = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const cii = loadBm4CiiOutputCases1921();
const solved = solveBm4M047PressureElongationCandidate();
const cases = {};
for (const [label, number] of Object.entries(CASES)) {
  const run = runFor(solved, label); const execution = executionFor(solved, label); const states = stateMap(run);
  const raw = rawRestraints(xml, number); const groups = groupDeclarations(run);
  const rows = groups.map((group) => classifyGroup({
    group,
    rawRows: rawRowsAt(raw, group.nodeId),
    displacement: cii.displacement.get(label).get(group.nodeId),
    state: states,
    execution,
  }));
  assert.equal(groups.length, 10, `M050 ${label} expects 10 unilateral node/DOF groups.`);
  cases[label] = Object.freeze({ summary: summarize(rows), rows: Object.freeze(rows) });
}

assert.equal(cases.SUS.summary.rawSignChecks, cases.SUS.summary.rawSignMatchesPipeOnRestraint, 'M050 SUS raw sign convention must be uniform.');
assert.equal(cases.OPE.summary.rawSignChecks, cases.OPE.summary.rawSignMatchesPipeOnRestraint, 'M050 OPE raw sign convention must be uniform.');
const report = Object.freeze({
  schema: 'lfea-m050-bm4-restraint-face-authority/v1',
  authority: Object.freeze({
    rawOutputRowsUsed: true,
    aggregatedNodeReactionRejectedForFaceSelection: true,
    caesarRawForceConvention: 'PIPE_ON_RESTRAINT',
    comparisonConvention: 'SUPPORT_ON_PIPE_EQUALS_NEGATIVE_CAESAR_RAW_RESTRAINT_FORCE',
    forceToleranceN: FORCE_TOLERANCE_N,
    targetRelativeTolerancePercent: BM4_COMPARISON_POLICY.targetTolerancePercent,
    boundaryToleranceM: BOUNDARY_TOLERANCE_M,
  }),
  cases: Object.freeze(cases),
  disposition: Object.freeze({ mechanicsChangedByM050: false, outputFitUsed: false, forcedStateUsed: false }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const label of Object.keys(CASES)) {
  const summary = report.cases[label].summary;
  console.log(`M050 ${label} states ${summary.stateMatches}/${summary.resolvableGroups} match; unresolved=${summary.unresolvedGroups}; raw sign ${summary.rawSignMatchesPipeOnRestraint}/${summary.rawSignChecks}; reactions ${summary.reactionPass}/${summary.activeGroups} pass; MAE=${summary.reactionMaeN?.toFixed(3) ?? 'n/a'} N.`);
  console.log(`M050 ${label} state mismatches: ${JSON.stringify(summary.stateMismatchRows.map((row) => ({ key: row.key, authority: row.authorityState, lfea: row.lfeaStates ?? row.lfeaState })))}.`);
  console.log(`M050 ${label} reaction failures: ${JSON.stringify(summary.reactionFailureRows.map((row) => ({ key: row.key, authority: row.authorityState, comparison: row.reactionComparison })))}.`);
}
