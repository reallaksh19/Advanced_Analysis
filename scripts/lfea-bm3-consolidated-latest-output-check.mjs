#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import {
  analyseBaseCase,
  buildBm3Authorities,
  buildBm3PhysicalCaseValues,
} from './lfea-m028-bm3-fixtures.mjs';
import { solveBm3WithProgrammedHangers } from './lfea-m029-bm3-hangers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT_PATH = resolve(ROOT, 'benchmarks/LFEA/BM3/BM3_Output.xml');
const REPORT_PATH = resolve(ROOT, 'reports/bm3-consolidated-latest-output.json');
const STRICT_LIMIT = 0.05;
const CASE_NUMBERS = Object.freeze([3, 4, 5, 6, 7, 8, 9]);
const STRICT_CASES = Object.freeze([6, 7]);
const DIAGNOSTIC_CASES = Object.freeze([3, 4, 5, 8, 9]);
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const FAMILIES = Object.freeze(['displacement', 'restraint', 'globalForce', 'localForce']);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Non-finite ${label}: ${value}`);
  return number;
}

function parseCase(value) {
  const label = String(value ?? '').trim();
  const match = /^CASE\s+(\d+)\s+\(([A-Z]+)\)\s+(.+)$/u.exec(label);
  if (!match) throw new Error(`Unrecognised BM3 load case: ${label}`);
  return Object.freeze({ number: Number(match[1]), category: match[2], formula: match[3], label });
}

function child(inner, tag, label) {
  const row = findElements(inner, tag)[0];
  if (!row) throw new Error(`Missing ${tag} in ${label}.`);
  return row;
}

function occurrence(counter, key) {
  const current = counter.get(key) ?? 0;
  counter.set(key, current + 1);
  return current;
}

function emptyCase(meta) {
  return {
    ...meta,
    families: Object.fromEntries(FAMILIES.map((family) => [family, []])),
  };
}

function ensureCase(cases, meta) {
  if (!cases.has(meta.number)) cases.set(meta.number, emptyCase(meta));
  const existing = cases.get(meta.number);
  assert.equal(existing.label, meta.label, `CASE ${meta.number} label consistency`);
  return existing;
}

function parseDisplacement(report, blockOrdinal) {
  const counter = new Map();
  return findElements(report.inner, 'NODE').map((row, sourceRowOrdinal) => {
    const nodeId = row.attributes.NUMBER;
    const duplicateOrdinal = occurrence(counter, nodeId);
    const translations = child(row.inner, 'TRANSLATIONS', `node ${nodeId}`);
    const rotations = child(row.inner, 'ROTATIONS', `node ${nodeId}`);
    return Object.freeze({
      sourceRowOrdinal,
      duplicateOrdinal,
      nodeId,
      identity: `block=${blockOrdinal}|node=${nodeId}|occ=${duplicateOrdinal}`,
      values: Object.freeze({
        UX: finite(translations.attributes.DX, 'DX') / 1000,
        UY: finite(translations.attributes.DY, 'DY') / 1000,
        UZ: finite(translations.attributes.DZ, 'DZ') / 1000,
        RX: finite(rotations.attributes.RX, 'RX') * Math.PI / 180,
        RY: finite(rotations.attributes.RY, 'RY') * Math.PI / 180,
        RZ: finite(rotations.attributes.RZ, 'RZ') * Math.PI / 180,
      }),
    });
  });
}

function parseRestraint(report, blockOrdinal) {
  const counter = new Map();
  return findElements(report.inner, 'RESTRAINT').map((row, sourceRowOrdinal) => {
    const nodeId = row.attributes.NODE;
    const type = row.attributes.TYPE ?? '';
    const duplicateOrdinal = occurrence(counter, `${nodeId}|${type}`);
    const forces = child(row.inner, 'FORCES', `restraint ${nodeId}`);
    const moments = child(row.inner, 'MOMENTS', `restraint ${nodeId}`);
    return Object.freeze({
      sourceRowOrdinal,
      duplicateOrdinal,
      nodeId,
      type,
      identity: `block=${blockOrdinal}|node=${nodeId}|type=${type}|occ=${duplicateOrdinal}`,
      values: Object.freeze({
        UX: -finite(forces.attributes.FX, 'FX'),
        UY: -finite(forces.attributes.FY, 'FY'),
        UZ: -finite(forces.attributes.FZ, 'FZ'),
        RX: -finite(moments.attributes.MX, 'MX'),
        RY: -finite(moments.attributes.MY, 'MY'),
        RZ: -finite(moments.attributes.MZ, 'MZ'),
      }),
    });
  });
}

function actionVector(force, moment) {
  return Object.freeze({
    fx: finite(force.attributes.FX, 'FX'),
    fy: finite(force.attributes.FY, 'FY'),
    fz: finite(force.attributes.FZ, 'FZ'),
    mx: finite(moment.attributes.MX, 'MX'),
    my: finite(moment.attributes.MY, 'MY'),
    mz: finite(moment.attributes.MZ, 'MZ'),
  });
}

function parseActions(report, blockOrdinal) {
  const counter = new Map();
  return findElements(report.inner, 'ELEMENT').map((row, sourceRowOrdinal) => {
    const fromNode = row.attributes.FROM_NODE;
    const toNode = row.attributes.TO_NODE;
    const pairKey = `${fromNode}-${toNode}`;
    const duplicateOrdinal = occurrence(counter, pairKey);
    const forces = child(row.inner, 'FORCES', `element ${pairKey}`);
    const moments = child(row.inner, 'MOMENTS', `element ${pairKey}`);
    return Object.freeze({
      sourceRowOrdinal,
      duplicateOrdinal,
      fromNode,
      toNode,
      pairKey,
      identity: `block=${blockOrdinal}|pair=${pairKey}|occ=${duplicateOrdinal}`,
      I: actionVector(child(forces.inner, 'FROM', `${pairKey} force I`), child(moments.inner, 'FROM', `${pairKey} moment I`)),
      J: actionVector(child(forces.inner, 'TO', `${pairKey} force J`), child(moments.inner, 'TO', `${pairKey} moment J`)),
    });
  });
}

function parseOutput(xmlText) {
  const cases = new Map();
  const definitions = [
    ['displacement', 'DISPLACEMENT_REPORT', 'NUM_NODES', parseDisplacement],
    ['restraint', 'RESTRAINT_REPORT', 'NUM_RESTRAINTS', parseRestraint],
    ['globalForce', 'GLOBAL_FORCE_REPORT', 'NUM_ELEMENTS', parseActions],
    ['localForce', 'LOCAL_FORCE_REPORT', 'NUM_ELEMENTS', parseActions],
  ];
  for (const [family, tag, countAttribute, parser] of definitions) {
    for (const report of findElements(xmlText, tag)) {
      const meta = parseCase(report.attributes.LOADCASE);
      const target = ensureCase(cases, meta);
      const blockOrdinal = target.families[family].length;
      const rows = Object.freeze(parser(report, blockOrdinal));
      const declaredCount = finite(report.attributes[countAttribute], `${meta.label} ${countAttribute}`);
      assert.equal(rows.length, declaredCount, `${meta.label} ${family} declared-row custody`);
      target.families[family].push(Object.freeze({ blockOrdinal, declaredCount, rows }));
    }
  }
  assert.deepEqual([...cases.keys()].sort((a, b) => a - b), CASE_NUMBERS);
  for (const sourceCase of cases.values()) {
    for (const family of FAMILIES) assert.ok(sourceCase.families[family].length > 0, `${sourceCase.label} missing ${family}`);
  }
  return cases;
}

function familyRows(sourceCase, family) {
  return sourceCase.families[family].flatMap((block) => block.rows);
}

function caseInventory(sourceCase) {
  const families = {};
  let responseScalarCount = 0;
  for (const family of FAMILIES) {
    const rows = familyRows(sourceCase, family);
    const scalarsPerRow = family === 'globalForce' || family === 'localForce' ? 12 : 6;
    families[family] = Object.freeze({
      reportBlockCount: sourceCase.families[family].length,
      sourceRowCount: rows.length,
      responseScalarCount: rows.length * scalarsPerRow,
    });
    responseScalarCount += rows.length * scalarsPerRow;
  }
  return Object.freeze({
    caseNumber: sourceCase.number,
    category: sourceCase.category,
    formula: sourceCase.formula,
    label: sourceCase.label,
    tier: STRICT_CASES.includes(sourceCase.number) ? 'STRICT_NO_FRICTION' : 'DIAGNOSTIC_PRIORITY',
    responseScalarCount,
    families: Object.freeze(families),
  });
}

function executionValue(entries, nodeId, dof) {
  return entries.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}

function physicalCaseValues(authorities, analysis) {
  const nodes = new Map(authorities.normalized.geometry.nodes.map((node) => [node.id, Object.freeze({
    displacement: Object.freeze(Object.fromEntries(DOFS.map((dof) => [dof, executionValue(analysis.execution.displacement, authorities.kernelNodeByReference.get(node.id), dof)]))),
    reaction: Object.freeze(Object.fromEntries(DOFS.map((dof) => [dof, executionValue(analysis.execution.reactions, authorities.kernelNodeByReference.get(node.id), dof)]))),
  })]));
  const pairs = new Map();
  for (const source of authorities.normalized.geometry.segments) {
    const entries = authorities.modelEntries
      .filter((row) => row.sourceSegment.id === source.id)
      .sort((left, right) => (left.reducerIndex ?? 0) - (right.reducerIndex ?? 0));
    const first = analysis.recovery.elementActions.find((row) => row.elementId === entries[0].elementId);
    const last = analysis.recovery.elementActions.find((row) => row.elementId === entries.at(-1).elementId);
    pairs.set(`${source.startNodeId}-${source.endNodeId}`, Object.freeze({
      global: Object.freeze({ I: first.global.I, J: last.global.J }),
      local: Object.freeze({ I: first.local.I, J: last.local.J }),
    }));
  }
  return Object.freeze({ nodes, pairs });
}

function strictPass(reference, solver) {
  if (reference === 0) return solver === 0;
  return Math.abs((solver - reference) / reference) < STRICT_LIMIT;
}

function scalar(caseNumber, family, identity, component, solver, reference) {
  const relativeError = reference === 0 ? null : Math.abs((solver - reference) / reference);
  return Object.freeze({
    caseNumber,
    family,
    identity,
    component,
    solver,
    reference,
    difference: solver - reference,
    relativeError,
    passed: strictPass(reference, solver),
  });
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeComparisonRows(rows) {
  const summarize = (selected) => {
    const errors = selected
      .filter((row) => row.reference !== 0)
      .map((row) => row.relativeError)
      .sort((left, right) => left - right);
    const zeroRows = selected.filter((row) => row.reference === 0);
    const passed = selected.filter((row) => row.passed).length;
    return Object.freeze({
      scalarCount: selected.length,
      passed,
      failed: selected.length - passed,
      passRate: selected.length === 0 ? null : passed / selected.length,
      zeroReference: Object.freeze({
        scalarCount: zeroRows.length,
        exactZeroPasses: zeroRows.filter((row) => row.passed).length,
        failures: zeroRows.filter((row) => !row.passed).length,
        maximumAbsoluteSolverValue: zeroRows.reduce((maximum, row) => Math.max(maximum, Math.abs(row.solver)), 0),
      }),
      nonzeroReference: Object.freeze({
        scalarCount: errors.length,
        meanAbsoluteRelativeError: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null,
        medianAbsoluteRelativeError: quantile(errors, 0.5),
        percentile95AbsoluteRelativeError: quantile(errors, 0.95),
        maximumAbsoluteRelativeError: errors.length ? errors.at(-1) : null,
      }),
    });
  };
  return Object.freeze({
    overall: summarize(rows),
    byFamily: Object.freeze(Object.fromEntries(FAMILIES.map((family) => [
      family,
      summarize(rows.filter((row) => row.family === family)),
    ]))),
  });
}

function groupBy(rows, keyOf) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function aggregateRestraints(rows) {
  const grouped = groupBy(rows, (row) => row.nodeId);
  return new Map([...grouped].map(([nodeId, sourceRows]) => [nodeId, Object.freeze({
    nodeId,
    sourceRowIdentities: Object.freeze(sourceRows.map((row) => row.identity)),
    values: Object.freeze(Object.fromEntries(DOFS.map((dof) => [dof, sourceRows.reduce((sum, row) => sum + row.values[dof], 0)]))),
  })]));
}

function nonzeroReactionNodes(nodes) {
  return [...nodes].filter(([, row]) => DOFS.some((dof) => row.reaction[dof] !== 0)).map(([nodeId]) => nodeId);
}

function compareStrictCase(caseNumber, referenceCase, own) {
  const rows = [];
  const familyCoverage = {};

  const referenceDisplacements = familyRows(referenceCase, 'displacement');
  const matchedDisplacementNodes = new Set();
  const unmatchedDisplacementReference = [];
  for (const reference of referenceDisplacements) {
    const actual = own.nodes.get(reference.nodeId)?.displacement;
    if (!actual) {
      unmatchedDisplacementReference.push(reference.identity);
      continue;
    }
    matchedDisplacementNodes.add(reference.nodeId);
    for (const dof of DOFS) rows.push(scalar(caseNumber, 'displacement', reference.identity, dof, actual[dof], reference.values[dof]));
  }
  familyCoverage.displacement = Object.freeze({
    referenceRows: referenceDisplacements.length,
    matchedRows: matchedDisplacementNodes.size,
    unmatchedReferenceRows: Object.freeze(unmatchedDisplacementReference),
    unmatchedSolverRows: Object.freeze([...own.nodes.keys()].filter((nodeId) => !matchedDisplacementNodes.has(nodeId))),
  });

  const referenceRestraints = aggregateRestraints(familyRows(referenceCase, 'restraint'));
  const matchedRestraintNodes = new Set();
  const unmatchedRestraintReference = [];
  for (const [nodeId, reference] of referenceRestraints) {
    const actual = own.nodes.get(nodeId)?.reaction;
    if (!actual) {
      unmatchedRestraintReference.push(...reference.sourceRowIdentities);
      continue;
    }
    matchedRestraintNodes.add(nodeId);
    for (const dof of DOFS) rows.push(scalar(caseNumber, 'restraint', `node=${nodeId}|rows=${reference.sourceRowIdentities.join(',')}`, dof, actual[dof], reference.values[dof]));
  }
  familyCoverage.restraint = Object.freeze({
    referenceRows: familyRows(referenceCase, 'restraint').length,
    referenceNodeAggregates: referenceRestraints.size,
    matchedRows: matchedRestraintNodes.size,
    unmatchedReferenceRows: Object.freeze(unmatchedRestraintReference),
    unmatchedSolverRows: Object.freeze(nonzeroReactionNodes(own.nodes).filter((nodeId) => !matchedRestraintNodes.has(nodeId))),
  });

  for (const family of ['globalForce', 'localForce']) {
    const references = familyRows(referenceCase, family);
    const byPair = groupBy(references, (row) => row.pairKey);
    const matchedPairs = new Set();
    const unmatchedReference = [];
    for (const [pairKey, referenceGroup] of byPair) {
      const actual = own.pairs.get(pairKey)?.[family === 'globalForce' ? 'global' : 'local'];
      if (referenceGroup.length !== 1 || !actual) {
        unmatchedReference.push(...referenceGroup.map((row) => row.identity));
        continue;
      }
      matchedPairs.add(pairKey);
      const reference = referenceGroup[0];
      for (const end of ['I', 'J']) {
        for (const component of ACTIONS) {
          rows.push(scalar(caseNumber, family, `${reference.identity}|end=${end}`, component, actual[end][component], reference[end][component]));
        }
      }
    }
    familyCoverage[family] = Object.freeze({
      referenceRows: references.length,
      matchedRows: matchedPairs.size,
      duplicateReferencePairs: [...byPair.values()].filter((group) => group.length > 1).length,
      unmatchedReferenceRows: Object.freeze(unmatchedReference),
      unmatchedSolverRows: Object.freeze([...own.pairs.keys()].filter((pairKey) => !matchedPairs.has(pairKey))),
    });
  }

  const failed = rows.filter((row) => !row.passed).length;
  const unmatchedReferenceRows = Object.values(familyCoverage).reduce((sum, row) => sum + row.unmatchedReferenceRows.length, 0);
  const unmatchedSolverRows = Object.values(familyCoverage).reduce((sum, row) => sum + row.unmatchedSolverRows.length, 0);
  return Object.freeze({
    caseNumber,
    matchedScalarDenominator: rows.length,
    passed: rows.length - failed,
    failed,
    unmatchedReferenceRows,
    unmatchedSolverRows,
    coverage: Object.freeze(familyCoverage),
    statistics: summarizeComparisonRows(rows),
    status: failed === 0 && unmatchedReferenceRows === 0 && unmatchedSolverRows === 0 ? 'PASS' : 'INCOMPLETE_BLOCKED',
    topFailures: Object.freeze(rows.filter((row) => !row.passed)
      .sort((left, right) => (right.relativeError ?? Number.POSITIVE_INFINITY) - (left.relativeError ?? Number.POSITIVE_INFINITY))
      .slice(0, 60)),
  });
}

function sourceScalars(sourceCase, family) {
  const rows = familyRows(sourceCase, family);
  if (family === 'displacement' || family === 'restraint') {
    return rows.flatMap((row) => DOFS.map((component) => Object.freeze({
      identity: `${row.identity}|component=${component}`,
      value: row.values[component],
    })));
  }
  return rows.flatMap((row) => ['I', 'J'].flatMap((end) => ACTIONS.map((component) => Object.freeze({
    identity: `${row.identity}|end=${end}|component=${component}`,
    value: row[end][component],
  }))));
}

function compareReferenceCases(cases, leftNumber, rightNumber, confounded) {
  const families = {};
  for (const family of FAMILIES) {
    const left = new Map(sourceScalars(cases.get(leftNumber), family).map((row) => [row.identity, row.value]));
    const right = new Map(sourceScalars(cases.get(rightNumber), family).map((row) => [row.identity, row.value]));
    const shared = [...left.keys()].filter((identity) => right.has(identity));
    let changed = 0;
    let maximumRelativeDelta = 0;
    for (const identity of shared) {
      const a = left.get(identity);
      const b = right.get(identity);
      if (a !== b) changed += 1;
      const scale = Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
      maximumRelativeDelta = Math.max(maximumRelativeDelta, Math.abs(a - b) / scale);
    }
    families[family] = Object.freeze({
      leftScalars: left.size,
      rightScalars: right.size,
      pairedScalars: shared.length,
      changedScalars: changed,
      unmatchedLeft: left.size - shared.length,
      unmatchedRight: right.size - shared.length,
      maximumRelativeDelta,
    });
  }
  return Object.freeze({
    leftCase: leftNumber,
    rightCase: rightNumber,
    confounded,
    interpretation: confounded
      ? 'DIAGNOSTIC_ONLY: H, F1 and friction state are not held constant.'
      : 'HIGH_QUALITY_REFERENCE_SENSITIVITY: same formula and identical identities isolate the reference friction-state variant.',
    families: Object.freeze(families),
  });
}

assert.equal(strictPass(100, 104.999999), true);
assert.equal(strictPass(100, 105), false);
assert.equal(strictPass(100, 95), false);
assert.equal(strictPass(0, 0), true);
assert.equal(strictPass(0, Number.EPSILON), false);

const sourceCases = parseOutput(readFileSync(OUTPUT_PATH, 'utf8'));
const inventory = Object.freeze([...sourceCases.values()].sort((left, right) => left.number - right.number).map(caseInventory));

const hangerQualification = solveBm3WithProgrammedHangers();
assert.equal(hangerQualification.comparison, null);
const case6Own = hangerQualification.solved.report.cases.CASE4_SUS;
const case7Authorities = hangerQualification.solved;
const case7Analysis = analyseBaseCase(
  case7Authorities,
  'CASE7_NO_FRICTION',
  Object.freeze({ temperatureField: null, thermal: false, formula: 'W+P1' }),
  { description: 'Latest BM3 CASE 7 strict no-friction physical state; no H and no F1.' },
);
const case7Own = buildBm3PhysicalCaseValues(case7Authorities, case7Analysis);

const strictCases = Object.freeze([
  compareStrictCase(6, sourceCases.get(6), case6Own),
  compareStrictCase(7, sourceCases.get(7), case7Own),
]);
const strictTotals = strictCases.reduce((sum, row) => ({
  matchedScalarDenominator: sum.matchedScalarDenominator + row.matchedScalarDenominator,
  passed: sum.passed + row.passed,
  failed: sum.failed + row.failed,
  unmatchedReferenceRows: sum.unmatchedReferenceRows + row.unmatchedReferenceRows,
  unmatchedSolverRows: sum.unmatchedSolverRows + row.unmatchedSolverRows,
}), { matchedScalarDenominator: 0, passed: 0, failed: 0, unmatchedReferenceRows: 0, unmatchedSolverRows: 0 });
const strictStatus = strictCases.every((row) => row.status === 'PASS') ? 'PASS' : 'INCOMPLETE_BLOCKED';

const report = Object.freeze({
  schema: 'lfea-bm3-consolidated-latest-output/v2',
  benchmark: 'BM3',
  sourceOutput: 'benchmarks/LFEA/BM3/BM3_Output.xml',
  restraintSourceCorrection: Object.freeze({
    profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
    status: 'GOVERNED_SOURCE_CORRECTION',
  }),
  caseSemantics: Object.freeze({
    strictPhysicalCases: Object.freeze({
      6: 'W+T2+P1+H; no-friction reference; M029 selected hangers compiled.',
      7: 'W+P1; no-friction reference; no H and no F1.',
    }),
    expansionCases: Object.freeze({ 8: 'L8=L3-L5', 9: 'L9=L4-L5' }),
    supersededMapping: 'The pre-update M029 CASE6_EXP/CASE7_EXP labels are not used for latest parity.',
  }),
  strictPolicy: Object.freeze({
    cases: STRICT_CASES,
    rule: 'abs((solver-reference)/reference) < 0.05',
    exactBoundaryPasses: false,
    zeroReferenceRule: 'EXACT_ZERO',
    unmatchedRows: 'FAIL',
  }),
  diagnosticPolicy: Object.freeze({ cases: DIAGNOSTIC_CASES, omissionAllowed: false }),
  caseInventory: inventory,
  sourceCustody: Object.freeze({
    caseCount: inventory.length,
    responseScalarCount: inventory.reduce((sum, row) => sum + row.responseScalarCount, 0),
    status: 'PASS',
  }),
  strictComparison: Object.freeze({
    cases: strictCases,
    totals: Object.freeze({
      ...strictTotals,
      passRate: strictTotals.matchedScalarDenominator === 0 ? null : strictTotals.passed / strictTotals.matchedScalarDenominator,
      maximumAbsoluteRelativeError: Math.max(...strictCases.map((row) => row.statistics.overall.nonzeroReference.maximumAbsoluteRelativeError ?? 0)),
    }),
    status: strictStatus,
    completeComparisonClaim: strictStatus === 'PASS',
  }),
  referenceVariantSensitivity: Object.freeze([
    compareReferenceCases(sourceCases, 4, 6, false),
    compareReferenceCases(sourceCases, 5, 7, true),
  ]),
  hangerSelections: Object.freeze(hangerQualification.solved.hangerDesign.designs.map((design) => Object.freeze({
    nodeId: design.nodeId,
    figure: design.selected.figure,
    size: design.selected.size,
    springRate: design.selected.springRate,
    theoreticalColdLoad: design.selected.theoreticalColdLoad,
    hotLoad: design.selected.hotLoad,
    signedOperatingTravel: design.selected.signedOperatingTravel,
  }))),
  unresolvedAuthorities: Object.freeze([
    'DECLARED_FORCE_F1_NOT_COMPILED',
    'BEND_SOURCE_SPANS_COMPILED_AS_STRAIGHT_CHORDS',
    'REDUCER_REPRESENTATION_PENDING_PARITY',
    'GENERATED_STATION_AND_DUPLICATE_PAIR_SOLVER_IDENTITY_INCOMPLETE',
    'T1_T2_EC_EH_THERMAL_STRAIN_POLICY_REQUIRES_FINAL_AUTHORITY',
  ]),
  nextPriority: Object.freeze([
    'COMPILE_DECLARED_F1_RECORDS_GENERICALLY',
    'VERIFY_CASE5_CASE6_CASE7_PHYSICAL_LOAD_SET_CUSTODY',
    'VERIFY_T1_T2_EC_EH_AND_THERMAL_STRAIN_SELECTION',
    'RUN_CONTROLLED_H_ONLY_AND_F1_ONLY_AB_STUDIES',
    'INTEGRATE_REAL_BEND_ARCS_AND_DIRECTIONAL_FLEXIBILITY',
    'QUALIFY_REDUCER_REPRESENTATION',
    'CLOSE_GENERATED_STATION_AND_DUPLICATE_PAIR_SOLVER_IDENTITY',
  ]),
  qualificationStatus: strictStatus,
});

if (process.argv.includes('--write')) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  benchmark: report.benchmark,
  sourceCaseNumbers: report.caseInventory.map((row) => row.caseNumber),
  sourceResponseScalarCount: report.sourceCustody.responseScalarCount,
  strictMatchedScalarDenominator: strictTotals.matchedScalarDenominator,
  strictPassed: strictTotals.passed,
  strictFailed: strictTotals.failed,
  unmatchedReferenceRows: strictTotals.unmatchedReferenceRows,
  unmatchedSolverRows: strictTotals.unmatchedSolverRows,
  qualificationStatus: report.qualificationStatus,
}, null, 2));
console.log('BM3 source custody complete; latest strict CASE 6/7 parity remains governed by qualificationStatus.');
