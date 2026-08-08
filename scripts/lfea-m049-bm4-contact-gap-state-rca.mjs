#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { solveBm4M047PressureElongationCandidate } from './lfea-m047-bm4-pressure-elongation-runtime.mjs';

const CASES = Object.freeze(['SUS', 'OPE']);
const FORCE_TOLERANCE_N = 1;
const OUTPUT_DISPLACEMENT_QUANTUM_M = 1e-9; // Output_BM4 prints translations to 1e-6 mm.
const BOUNDARY_TOLERANCE_M = 2 * OUTPUT_DISPLACEMENT_QUANTUM_M;
const DOF_TO_SOURCE = Object.freeze({ UX: 'DX', UY: 'DY', UZ: 'DZ' });
const DOF_TO_REACTION = Object.freeze({ UX: 'FX', UY: 'FY', UZ: 'FZ' });

function cleanNodeId(value) { return String(value).replace(/^BM4M035\.N/u, ''); }
function runFor(solved, caseLabel) { return caseLabel === 'SUS' ? solved.sustainedRun : solved.operatingRun; }
function stateMap(run) { return new Map(run.convergedState.map((row) => [row.declarationId, row.status])); }
function declarationKind(declaration) { return declaration.declarationId.includes('-GAP-') ? 'FINITE_GAP_FACE' : 'PLUS_Y'; }

function authorityEvidence(cii, caseLabel, declaration) {
  const nodeId = cleanNodeId(declaration.nodeId);
  const disp = cii.displacement.get(caseLabel).get(nodeId);
  assert.ok(disp, `M049 missing CAESAR ${caseLabel} displacement at ${nodeId}.`);
  const restraint = cii.restraint.get(caseLabel).get(nodeId) ?? null;
  const sourceField = DOF_TO_SOURCE[declaration.dof];
  const reactionField = DOF_TO_REACTION[declaration.dof];
  const displacementM = disp[sourceField] * 1e-3;
  const reactionN = restraint?.[reactionField] ?? 0;
  const normalizedDisplacementM = declaration.sense * displacementM;
  const clearanceM = normalizedDisplacementM + declaration.gap;
  const normalizedReactionN = declaration.sense * reactionN;
  const atBoundary = Math.abs(clearanceM) <= BOUNDARY_TOLERANCE_M;
  const reactionNegligible = Math.abs(reactionN) <= FORCE_TOLERANCE_N;
  let status = 'AMBIGUOUS';
  let reason = 'ZERO_REACTION_AT_CONTACT_BOUNDARY';
  if (clearanceM < -BOUNDARY_TOLERANCE_M) {
    status = 'CONFLICT'; reason = 'CAESAR_DISPLACEMENT_PENETRATES_DECLARED_FACE';
  } else if (normalizedReactionN < -FORCE_TOLERANCE_N) {
    status = 'CONFLICT'; reason = 'CAESAR_REACTION_SIGN_OPPOSES_DECLARED_FACE';
  } else if (atBoundary && normalizedReactionN > FORCE_TOLERANCE_N) {
    status = 'ENGAGED'; reason = 'REACTION_ADMISSIBLE_AT_CONTACT_BOUNDARY';
  } else if (clearanceM > BOUNDARY_TOLERANCE_M && reactionNegligible) {
    status = 'RELEASED'; reason = 'SEPARATED_WITH_NEGLIGIBLE_REACTION';
  } else if (clearanceM > BOUNDARY_TOLERANCE_M && !reactionNegligible) {
    status = 'CONFLICT'; reason = 'NONZERO_REACTION_WHILE_SEPARATED_FROM_FACE';
  } else if (atBoundary && normalizedReactionN > -FORCE_TOLERANCE_N && normalizedReactionN <= FORCE_TOLERANCE_N) {
    status = 'AMBIGUOUS'; reason = 'ZERO_REACTION_AT_CONTACT_BOUNDARY';
  }
  return Object.freeze({
    nodeId, dof: declaration.dof, sense: declaration.sense, gapM: declaration.gap,
    contactValueM: declaration.contactValue, displacementM, normalizedDisplacementM, clearanceM,
    reactionN, normalizedReactionN, restraintRowPresent: restraint !== null,
    restraintType: restraint?.type ?? null, atBoundary, reactionNegligible, status, reason,
  });
}

function rowsFor(solved, cii, caseLabel) {
  const run = runFor(solved, caseLabel);
  const states = stateMap(run);
  return Object.freeze(run.unilateral.map((declaration) => {
    const authority = authorityEvidence(cii, caseLabel, declaration);
    const lfea = states.get(declaration.declarationId);
    assert.ok(lfea === 'ENGAGED' || lfea === 'RELEASED', `M049 unresolved LFEA state ${declaration.declarationId}.`);
    const comparable = authority.status === 'ENGAGED' || authority.status === 'RELEASED';
    return Object.freeze({
      declarationId: declaration.declarationId,
      kind: declarationKind(declaration),
      nodeId: authority.nodeId,
      dof: declaration.dof,
      typeCode: declaration.typeCode,
      sense: declaration.sense,
      gapM: declaration.gap,
      frictionCoefficient: declaration.frictionCoefficient,
      lfeaState: lfea,
      authorityState: authority.status,
      comparable,
      matches: comparable ? lfea === authority.status : null,
      authority,
    });
  }));
}

function summarize(rows) {
  const comparable = rows.filter((row) => row.comparable);
  const mismatches = comparable.filter((row) => !row.matches);
  return Object.freeze({
    declarations: rows.length,
    comparable: comparable.length,
    matches: comparable.filter((row) => row.matches).length,
    mismatches: mismatches.length,
    ambiguous: rows.filter((row) => row.authorityState === 'AMBIGUOUS').length,
    conflicts: rows.filter((row) => row.authorityState === 'CONFLICT').length,
    mismatchRows: Object.freeze(mismatches),
    ambiguousRows: Object.freeze(rows.filter((row) => row.authorityState === 'AMBIGUOUS')),
    conflictRows: Object.freeze(rows.filter((row) => row.authorityState === 'CONFLICT')),
  });
}

function pairConsistency(rows) {
  const groups = new Map();
  for (const row of rows.filter((entry) => entry.kind === 'FINITE_GAP_FACE')) {
    const key = `${row.nodeId}:${row.dof}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.freeze([...groups.entries()].map(([key, pair]) => {
    assert.equal(pair.length, 2, `M049 finite gap ${key} must have two faces.`);
    const authorityEngaged = pair.filter((row) => row.authorityState === 'ENGAGED').length;
    const lfeaEngaged = pair.filter((row) => row.lfeaState === 'ENGAGED').length;
    return Object.freeze({ key, nodeId: pair[0].nodeId, dof: pair[0].dof, gapM: pair[0].gapM,
      authorityEngagedFaces: authorityEngaged, lfeaEngagedFaces: lfeaEngaged,
      authorityPairAdmissible: authorityEngaged <= 1 && pair.every((row) => row.authorityState !== 'CONFLICT'),
      rows: Object.freeze(pair) });
  }));
}

function compareRuns(baselineRows, candidateRows) {
  const base = new Map(baselineRows.map((row) => [row.declarationId, row]));
  return Object.freeze(candidateRows.map((row) => {
    const previous = base.get(row.declarationId);
    assert.ok(previous, `M049 baseline missing ${row.declarationId}.`);
    return Object.freeze({ declarationId: row.declarationId, nodeId: row.nodeId, dof: row.dof,
      authorityState: row.authorityState, baselineState: previous.lfeaState, candidateState: row.lfeaState,
      baselineMatches: previous.matches, candidateMatches: row.matches,
      candidateChangedState: previous.lfeaState !== row.lfeaState });
  }));
}

const baseline = solveBm4M035M036Combined();
const candidate = solveBm4M047PressureElongationCandidate();
const cii = loadBm4CiiOutputCases1921();
const cases = {};
for (const caseLabel of CASES) {
  const baselineRows = rowsFor(baseline, cii, caseLabel);
  const candidateRows = rowsFor(candidate, cii, caseLabel);
  assert.equal(candidateRows.length, 16, `M049 ${caseLabel} expects 16 M036 unilateral declarations.`);
  const comparison = compareRuns(baselineRows, candidateRows);
  cases[caseLabel] = Object.freeze({
    baseline: summarize(baselineRows), candidate: summarize(candidateRows),
    gapPairs: pairConsistency(candidateRows),
    changedByPressureCandidate: Object.freeze(comparison.filter((row) => row.candidateChangedState)),
    focus21640: Object.freeze(candidateRows.filter((row) => row.nodeId === '21640')),
    rows: candidateRows,
  });
}

const report = Object.freeze({
  schema: 'lfea-m049-bm4-contact-gap-state-rca/v1',
  authorityClassifier: Object.freeze({
    forceToleranceN: FORCE_TOLERANCE_N,
    outputDisplacementQuantumM: OUTPUT_DISPLACEMENT_QUANTUM_M,
    boundaryToleranceM: BOUNDARY_TOLERANCE_M,
    engagedRule: 'ADMISSIBLE_SIGNED_REACTION_ABOVE_1N_AND_DISPLACEMENT_AT_DECLARED_FACE',
    releasedRule: 'REACTION_MAGNITUDE_AT_OR_BELOW_1N_AND_POSITIVE_CLEARANCE_ABOVE_PRINT_BOUNDARY_TOLERANCE',
    ambiguousRule: 'ZERO_REACTION_AT_CONTACT_BOUNDARY_IS_NOT_FORCED_TO_A_STATE',
  }),
  cases: Object.freeze(cases),
  disposition: Object.freeze({
    mechanicsChangedByM049: false, outputFitUsed: false, frictionActivated: false,
    forcedStateDiagnosticRun: false,
  }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const caseLabel of CASES) {
  const value = report.cases[caseLabel];
  console.log(`M049 ${caseLabel} baseline comparable/mismatch: ${value.baseline.comparable}/${value.baseline.mismatches}; candidate: ${value.candidate.comparable}/${value.candidate.mismatches}; ambiguous=${value.candidate.ambiguous}; conflicts=${value.candidate.conflicts}.`);
  console.log(`M049 ${caseLabel} pressure-changed states: ${JSON.stringify(value.changedByPressureCandidate)}.`);
  console.log(`M049 ${caseLabel} 21640: ${JSON.stringify(value.focus21640.map((row) => ({ id: row.declarationId, dof: row.dof, lfea: row.lfeaState, authority: row.authorityState, clearanceM: row.authority.clearanceM, reactionN: row.authority.reactionN, reason: row.authority.reason })))}.`);
  console.log(`M049 ${caseLabel} mismatches: ${JSON.stringify(value.candidate.mismatchRows.map((row) => ({ id: row.declarationId, nodeId: row.nodeId, dof: row.dof, lfea: row.lfeaState, authority: row.authorityState })))}.`);
}
