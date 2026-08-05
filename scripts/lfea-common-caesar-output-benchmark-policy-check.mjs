#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPORT_PATH = resolve(ROOT, 'reports/common-caesar-output-benchmark-policy.json');
const STRICT_RELATIVE_LIMIT = 0.05;
const TOP_DELTA_LIMIT = 25;
const COMPONENTS = Object.freeze(['X', 'Y', 'Z', 'RX', 'RY', 'RZ']);

const BENCHMARKS = Object.freeze([
  Object.freeze({
    id: 'BM2',
    path: resolve(ROOT, 'benchmarks/LFEA/BM2/Output_BM2.xml'),
    repositoryPath: 'benchmarks/LFEA/BM2/Output_BM2.xml',
    expectedGitBlobSha: 'c13190a14a4f292702dc20a4cdd4109d284f5c5d',
    strictCaseNumbers: Object.freeze([3, 4, 6]),
    referenceVariantPairs: Object.freeze([
      Object.freeze({ leftCase: 1, rightCase: 3, kind: 'EXACT_FORMULA_FRICTION_STATE', evidenceQuality: 'HIGH', priorityDomain: 'RESTRAINT_FRICTION_ACTIVE_SET' }),
      Object.freeze({ leftCase: 2, rightCase: 4, kind: 'EXACT_FORMULA_FRICTION_STATE', evidenceQuality: 'HIGH', priorityDomain: 'RESTRAINT_FRICTION_ACTIVE_SET' }),
      Object.freeze({ leftCase: 5, rightCase: 6, kind: 'DERIVED_FRICTION_STATE', evidenceQuality: 'MEDIUM', priorityDomain: 'DERIVED_CASE_PROPAGATION' }),
    ]),
    reviewNotes: Object.freeze([]),
  }),
  Object.freeze({
    id: 'BM3',
    path: resolve(ROOT, 'benchmarks/LFEA/BM3/BM3_Output.xml'),
    repositoryPath: 'benchmarks/LFEA/BM3/BM3_Output.xml',
    expectedGitBlobSha: '184e8287a60bde8fc02aad312333d62a0298f7d6',
    strictCaseNumbers: Object.freeze([6, 7]),
    referenceVariantPairs: Object.freeze([
      Object.freeze({ leftCase: 4, rightCase: 6, kind: 'EXACT_FORMULA_FRICTION_STATE', evidenceQuality: 'HIGH', priorityDomain: 'RESTRAINT_FRICTION_ACTIVE_SET' }),
      Object.freeze({ leftCase: 5, rightCase: 7, kind: 'COMPOSITE_NO_FRICTION_VARIANT', evidenceQuality: 'LOW', priorityDomain: 'HANGER_F1_AND_FRICTION_COMPOSITE' }),
    ]),
    reviewNotes: Object.freeze([
      Object.freeze({
        code: 'BM3_CASE7_CATEGORY_REVIEW',
        detail: 'The source label declares CASE 7 as OPE with formula W+P1. The benchmark retains the label exactly and does not reinterpret it as SUS.',
      }),
      Object.freeze({
        code: 'BM3_CASE5_CASE7_COMPOSITE_DIFFERENCE',
        detail: 'CASE 5 versus CASE 7 is not a pure friction comparison because H and F1 also differ; sensitivity is recorded but cannot isolate causation.',
      }),
    ]),
  }),
]);

console.log('\n--- Common CAESAR output benchmark policy ---');
qualifyStrictToleranceBoundary();

const benchmarkReports = BENCHMARKS.map(analyseBenchmark);
const report = Object.freeze({
  schema: 'lfea-common-caesar-output-benchmark-policy/v2',
  policyId: 'LFEA_CAESAR_OUTPUT_TWO_TIER_POLICY_V2',
  sourceCorrectionContract: Object.freeze({
    status: 'PASS',
    meaning: 'The seven-row InputXML restraint TYPE export correction contract passed. This status is source normalization only and is not solver parity.',
  }),
  strictNoFrictionPolicy: Object.freeze({
    tier: 'STRICT_NO_FRICTION',
    relativeErrorRule: 'abs((solver-reference)/reference) < 0.05',
    relativeLimit: STRICT_RELATIVE_LIMIT,
    boundaryInclusive: false,
    zeroReferenceRule: 'solver value must equal zero exactly; no undeclared absolute tolerance is introduced',
    unmatchedReferenceRows: 'FAIL',
    unmatchedSolverRows: 'FAIL',
    currentParityStatus: 'NOT_EVALUATED',
    reason: 'This common lot governs source custody and strict case identity. Dedicated BM2/BM3 solver ledgers must compare every strict row before PASS can be claimed.',
  }),
  diagnosticPolicy: Object.freeze({
    tier: 'DIAGNOSTIC_PRIORITY',
    custodyRequired: true,
    omissionAllowed: false,
    currentCustodyStatus: benchmarkReports.every((row) => row.diagnosticCustodyStatus === 'PASS') ? 'PASS' : 'FAIL',
    analysisStatus: 'REFERENCE_VARIANT_SENSITIVITY_GENERATED',
    interpretation: 'Sensitivity between CAESAR reference cases identifies investigation opportunities. It is not a solver residual and does not prove root cause.',
  }),
  benchmarkReports,
});

if (process.argv.includes('--write')) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`report: ${REPORT_PATH}`);
}

for (const benchmark of benchmarkReports) printBenchmark(benchmark);
console.log('\nSOURCE_CORRECTION_CONTRACT: PASS');
console.log('STRICT_NO_FRICTION_PARITY: NOT_EVALUATED');
console.log(`DIAGNOSTIC_CASE_CUSTODY: ${report.diagnosticPolicy.currentCustodyStatus}`);
console.log('NEXT_PRIORITY_ANALYSIS: GENERATED_REFERENCE_VARIANT_SENSITIVITY');
console.log('✅ Common CAESAR output benchmark policy check passed.\n');

function analyseBenchmark(definition) {
  const content = readFileSync(definition.path, 'utf8');
  const actualGitBlobSha = gitBlobSha(content);
  assert.equal(
    actualGitBlobSha,
    definition.expectedGitBlobSha,
    `${definition.id} output source changed; update custody only after reviewing the complete new case inventory`,
  );

  const parsed = parseOutput(content);
  const discoveredCaseNumbers = [...parsed.cases.keys()].sort((a, b) => a - b);
  for (const caseNumber of definition.strictCaseNumbers) {
    assert.ok(parsed.cases.has(caseNumber), `${definition.id} is missing strict no-friction CASE ${caseNumber}`);
  }

  const caseInventory = discoveredCaseNumbers.map((caseNumber) => {
    const sourceCase = parsed.cases.get(caseNumber);
    const tier = definition.strictCaseNumbers.includes(caseNumber)
      ? 'STRICT_NO_FRICTION'
      : 'DIAGNOSTIC_PRIORITY';
    return summarizeCase(sourceCase, tier);
  });
  const strictNoFrictionCases = caseInventory.filter((row) => row.tier === 'STRICT_NO_FRICTION');
  const diagnosticCases = caseInventory.filter((row) => row.tier === 'DIAGNOSTIC_PRIORITY');
  assert.equal(strictNoFrictionCases.length, definition.strictCaseNumbers.length);
  assert.ok(diagnosticCases.length > 0, `${definition.id} must retain non-strict diagnostic cases`);

  const referenceVariantSensitivity = definition.referenceVariantPairs
    .flatMap((pair) => compareCases(parsed.cases, pair))
    .sort(comparePriority);
  const pairedDiagnosticNumbers = new Set(definition.referenceVariantPairs.map((row) => row.leftCase));
  const unpairedDiagnosticCases = diagnosticCases
    .filter((row) => !pairedDiagnosticNumbers.has(row.caseNumber))
    .map((row) => Object.freeze({
      caseNumber: row.caseNumber,
      loadCase: row.loadCase,
      disposition: 'REQUIRES_DEDICATED_SOLVER_RESIDUAL_LEDGER',
      reason: 'No controlled direct no-friction companion exists in the CAESAR reference output.',
    }));

  return Object.freeze({
    benchmarkId: definition.id,
    repositoryPath: definition.repositoryPath,
    sourceCustody: Object.freeze({
      expectedGitBlobSha: definition.expectedGitBlobSha,
      actualGitBlobSha,
      contentSha256: sha256(content),
      outputBytes: Buffer.byteLength(content),
      status: 'PASS',
    }),
    strictNoFrictionParityStatus: 'NOT_EVALUATED',
    diagnosticCustodyStatus: 'PASS',
    strictCaseNumbers: definition.strictCaseNumbers,
    caseInventory,
    strictNoFrictionCases,
    diagnosticCases,
    reportBlockCount: sum(caseInventory.map((row) => row.reportBlockCount)),
    sourceRowCount: sum(caseInventory.map((row) => row.sourceRowCount)),
    responseVectorCount: sum(caseInventory.map((row) => row.responseVectorCount)),
    responseScalarCount: sum(caseInventory.map((row) => row.responseScalarCount)),
    referenceVariantSensitivity,
    unpairedDiagnosticCases,
    reviewNotes: definition.reviewNotes,
    nextPriorityBasis: 'Use high-quality exact-formula CAESAR variant sensitivity first, then combine it with dedicated solver residual ledgers. Do not infer causation from reference sensitivity alone.',
  });
}

function parseOutput(xmlText) {
  const cases = new Map();
  parseReportFamily(xmlText, cases, 'displacement', 'DISPLACEMENT_REPORT', parseDisplacementRows, 'NUM_NODES');
  parseReportFamily(xmlText, cases, 'restraint', 'RESTRAINT_REPORT', parseRestraintRows, 'NUM_RESTRAINTS');
  parseReportFamily(xmlText, cases, 'globalForce', 'GLOBAL_FORCE_REPORT', parseElementRows, 'NUM_ELEMENTS');
  parseReportFamily(xmlText, cases, 'localForce', 'LOCAL_FORCE_REPORT', parseElementRows, 'NUM_ELEMENTS');

  for (const sourceCase of cases.values()) {
    for (const family of ['displacement', 'restraint', 'globalForce', 'localForce']) {
      assert.ok(sourceCase.families[family].length > 0, `${sourceCase.loadCase} is missing ${family}`);
    }
  }
  return Object.freeze({ cases });
}

function parseReportFamily(xmlText, cases, family, tagName, rowParser, declaredCountKey) {
  let reportOccurrence = 0;
  for (const report of findElements(xmlText, tagName)) {
    const meta = parseCaseLabel(report.attributes.LOADCASE);
    const sourceCase = getOrCreateCase(cases, meta);
    const parsedRows = rowParser(report.inner, family, reportOccurrence);
    const declaredCount = finiteNumber(report.attributes[declaredCountKey], `${meta.loadCase} ${declaredCountKey}`);
    assert.equal(
      declaredCount,
      parsedRows.sourceRowCount,
      `${meta.loadCase} ${family} declared count must equal retained source rows`,
    );
    sourceCase.families[family].push(Object.freeze({
      family,
      reportOccurrence,
      declaredCountKey,
      declaredCount,
      sourceRowCount: parsedRows.sourceRowCount,
      responseRows: parsedRows.responseRows,
    }));
    reportOccurrence += 1;
  }
}

function parseDisplacementRows(inner, family, reportOccurrence) {
  const nodes = findElements(inner, 'NODE');
  const duplicateCounts = new Map();
  const responseRows = nodes.map((node) => {
    const number = node.attributes.NUMBER;
    const occurrence = nextOccurrence(duplicateCounts, number);
    const translations = requiredChild(node.inner, 'TRANSLATIONS', `${family} node ${number}`);
    const rotations = requiredChild(node.inner, 'ROTATIONS', `${family} node ${number}`);
    return responseRow({
      family,
      reportOccurrence,
      identity: `NODE|NUMBER=${number}|occurrence=${occurrence}`,
      values: {
        X: finiteNumber(translations.attributes.DX, 'DX'),
        Y: finiteNumber(translations.attributes.DY, 'DY'),
        Z: finiteNumber(translations.attributes.DZ, 'DZ'),
        RX: finiteNumber(rotations.attributes.RX, 'RX'),
        RY: finiteNumber(rotations.attributes.RY, 'RY'),
        RZ: finiteNumber(rotations.attributes.RZ, 'RZ'),
      },
    });
  });
  return Object.freeze({ sourceRowCount: nodes.length, responseRows: Object.freeze(responseRows) });
}

function parseRestraintRows(inner, family, reportOccurrence) {
  const restraints = findElements(inner, 'RESTRAINT');
  const duplicateCounts = new Map();
  const responseRows = restraints.map((restraint) => {
    const node = restraint.attributes.NODE;
    const type = restraint.attributes.TYPE ?? '';
    const duplicateKey = `${node}|${type}`;
    const occurrence = nextOccurrence(duplicateCounts, duplicateKey);
    const forces = requiredChild(restraint.inner, 'FORCES', `${family} node ${node}`);
    const moments = requiredChild(restraint.inner, 'MOMENTS', `${family} node ${node}`);
    return responseRow({
      family,
      reportOccurrence,
      identity: `RESTRAINT|NODE=${node}|TYPE=${type}|occurrence=${occurrence}`,
      values: {
        X: finiteNumber(forces.attributes.FX, 'FX'),
        Y: finiteNumber(forces.attributes.FY, 'FY'),
        Z: finiteNumber(forces.attributes.FZ, 'FZ'),
        RX: finiteNumber(moments.attributes.MX, 'MX'),
        RY: finiteNumber(moments.attributes.MY, 'MY'),
        RZ: finiteNumber(moments.attributes.MZ, 'MZ'),
      },
    });
  });
  return Object.freeze({ sourceRowCount: restraints.length, responseRows: Object.freeze(responseRows) });
}

function parseElementRows(inner, family, reportOccurrence) {
  const elements = findElements(inner, 'ELEMENT');
  const duplicateCounts = new Map();
  const responseRows = [];
  for (const element of elements) {
    const fromNode = element.attributes.FROM_NODE;
    const toNode = element.attributes.TO_NODE;
    const pair = `${fromNode}-${toNode}`;
    const occurrence = nextOccurrence(duplicateCounts, pair);
    const forces = requiredChild(element.inner, 'FORCES', `${family} element ${pair}`);
    const moments = requiredChild(element.inner, 'MOMENTS', `${family} element ${pair}`);
    const fromForces = requiredChild(forces.inner, 'FROM', `${family} element ${pair} forces FROM`);
    const toForces = requiredChild(forces.inner, 'TO', `${family} element ${pair} forces TO`);
    const fromMoments = requiredChild(moments.inner, 'FROM', `${family} element ${pair} moments FROM`);
    const toMoments = requiredChild(moments.inner, 'TO', `${family} element ${pair} moments TO`);
    responseRows.push(responseRow({
      family,
      reportOccurrence,
      identity: `ELEMENT|FROM=${fromNode}|TO=${toNode}|occurrence=${occurrence}|END=I`,
      values: actionValues(fromForces.attributes, fromMoments.attributes),
    }));
    responseRows.push(responseRow({
      family,
      reportOccurrence,
      identity: `ELEMENT|FROM=${fromNode}|TO=${toNode}|occurrence=${occurrence}|END=J`,
      values: actionValues(toForces.attributes, toMoments.attributes),
    }));
  }
  return Object.freeze({ sourceRowCount: elements.length, responseRows: Object.freeze(responseRows) });
}

function actionValues(forces, moments) {
  return {
    X: finiteNumber(forces.FX, 'FX'),
    Y: finiteNumber(forces.FY, 'FY'),
    Z: finiteNumber(forces.FZ, 'FZ'),
    RX: finiteNumber(moments.MX, 'MX'),
    RY: finiteNumber(moments.MY, 'MY'),
    RZ: finiteNumber(moments.MZ, 'MZ'),
  };
}

function responseRow({ family, reportOccurrence, identity, values }) {
  return Object.freeze({ family, reportOccurrence, identity, values: Object.freeze(values) });
}

function getOrCreateCase(cases, meta) {
  const existing = cases.get(meta.caseNumber);
  if (existing) {
    assert.equal(existing.loadCase, meta.loadCase, `CASE ${meta.caseNumber} label must be stable across reports`);
    return existing;
  }
  const created = {
    ...meta,
    families: { displacement: [], restraint: [], globalForce: [], localForce: [] },
  };
  cases.set(meta.caseNumber, created);
  return created;
}

function summarizeCase(sourceCase, tier) {
  const familySummaries = Object.fromEntries(Object.entries(sourceCase.families).map(([family, blocks]) => {
    const sourceRowCount = sum(blocks.map((row) => row.sourceRowCount));
    const responseVectorCount = sum(blocks.map((row) => row.responseRows.length));
    return [family, Object.freeze({
      reportBlockCount: blocks.length,
      declaredCounts: Object.freeze(blocks.map((row) => row.declaredCount)),
      sourceRowCount,
      responseVectorCount,
      responseScalarCount: responseVectorCount * COMPONENTS.length,
    })];
  }));
  return Object.freeze({
    caseNumber: sourceCase.caseNumber,
    loadCase: sourceCase.loadCase,
    category: sourceCase.category,
    formula: sourceCase.formula,
    tier,
    reportBlockCount: sum(Object.values(familySummaries).map((row) => row.reportBlockCount)),
    sourceRowCount: sum(Object.values(familySummaries).map((row) => row.sourceRowCount)),
    responseVectorCount: sum(Object.values(familySummaries).map((row) => row.responseVectorCount)),
    responseScalarCount: sum(Object.values(familySummaries).map((row) => row.responseScalarCount)),
    families: Object.freeze(familySummaries),
  });
}

function compareCases(cases, pair) {
  const left = cases.get(pair.leftCase);
  const right = cases.get(pair.rightCase);
  assert.ok(left, `missing comparison CASE ${pair.leftCase}`);
  assert.ok(right, `missing comparison CASE ${pair.rightCase}`);
  const exactFormulaMatch = left.formula === right.formula;
  if (pair.kind === 'EXACT_FORMULA_FRICTION_STATE') {
    assert.equal(exactFormulaMatch, true, `CASE ${pair.leftCase} and CASE ${pair.rightCase} must have identical formulas`);
  }

  return ['displacement', 'restraint', 'globalForce', 'localForce'].map((family) => {
    const leftRows = rowsForFamily(left, family);
    const rightRows = rowsForFamily(right, family);
    const leftByIdentity = new Map(leftRows.map((row) => [row.identity, row]));
    const rightByIdentity = new Map(rightRows.map((row) => [row.identity, row]));
    assert.equal(leftByIdentity.size, leftRows.length, `${left.loadCase} ${family} identities must be unique`);
    assert.equal(rightByIdentity.size, rightRows.length, `${right.loadCase} ${family} identities must be unique`);

    const deltas = [];
    const largestDeltas = [];
    let unmatchedLeftRows = 0;
    let unmatchedRightRows = 0;
    let signReversals = 0;
    for (const [identity, leftRow] of leftByIdentity.entries()) {
      const rightRow = rightByIdentity.get(identity);
      if (!rightRow) {
        unmatchedLeftRows += 1;
        continue;
      }
      for (const component of COMPONENTS) {
        const leftValue = leftRow.values[component];
        const rightValue = rightRow.values[component];
        const absoluteDelta = Math.abs(leftValue - rightValue);
        const denominator = Math.max(Math.abs(leftValue), Math.abs(rightValue));
        const relativeDelta = denominator === 0 ? 0 : absoluteDelta / denominator;
        const signReversal = leftValue !== 0 && rightValue !== 0 && Math.sign(leftValue) !== Math.sign(rightValue);
        if (signReversal) signReversals += 1;
        deltas.push(relativeDelta);
        largestDeltas.push({ identity, component, leftValue, rightValue, absoluteDelta, relativeDelta, signReversal });
      }
    }
    for (const identity of rightByIdentity.keys()) if (!leftByIdentity.has(identity)) unmatchedRightRows += 1;

    deltas.sort((a, b) => a - b);
    largestDeltas.sort((a, b) => b.relativeDelta - a.relativeDelta || b.absoluteDelta - a.absoluteDelta);
    const pairedScalars = deltas.length;
    const changedBeyondFivePercent = deltas.filter((value) => value > STRICT_RELATIVE_LIMIT).length;
    const changedScalars = deltas.filter((value) => value > 1e-12).length;
    const p95RelativeDelta = percentile(deltas, 0.95);
    const maxRelativeDelta = deltas.at(-1) ?? 0;
    const prioritySignal = unmatchedLeftRows > 0 || unmatchedRightRows > 0 || p95RelativeDelta > STRICT_RELATIVE_LIMIT
      ? 'HIGH'
      : maxRelativeDelta > STRICT_RELATIVE_LIMIT
        ? 'MEDIUM'
        : 'LOW';

    return Object.freeze({
      benchmarkPair: `CASE${pair.leftCase}_VS_CASE${pair.rightCase}`,
      leftCaseNumber: pair.leftCase,
      rightCaseNumber: pair.rightCase,
      leftLoadCase: left.loadCase,
      rightLoadCase: right.loadCase,
      leftFormula: left.formula,
      rightFormula: right.formula,
      exactFormulaMatch,
      kind: pair.kind,
      evidenceQuality: pair.evidenceQuality,
      priorityDomain: pair.priorityDomain,
      reportFamily: family,
      pairedScalars,
      changedScalars,
      changedBeyondFivePercent,
      unchangedScalars: pairedScalars - changedScalars,
      signReversals,
      unmatchedLeftRows,
      unmatchedRightRows,
      p50RelativeDelta: percentile(deltas, 0.50),
      p90RelativeDelta: percentile(deltas, 0.90),
      p95RelativeDelta,
      p99RelativeDelta: percentile(deltas, 0.99),
      maxRelativeDelta,
      prioritySignal,
      largestDeltas: Object.freeze(largestDeltas.slice(0, TOP_DELTA_LIMIT).map(Object.freeze)),
      interpretation: 'CAESAR reference-case sensitivity only; not a solver comparison and not causal proof.',
    });
  });
}

function rowsForFamily(sourceCase, family) {
  return sourceCase.families[family].flatMap((block) => block.responseRows);
}

function comparePriority(left, right) {
  return priorityRank(right.prioritySignal) - priorityRank(left.prioritySignal)
    || evidenceRank(right.evidenceQuality) - evidenceRank(left.evidenceQuality)
    || right.p95RelativeDelta - left.p95RelativeDelta
    || right.maxRelativeDelta - left.maxRelativeDelta
    || left.benchmarkPair.localeCompare(right.benchmarkPair)
    || left.reportFamily.localeCompare(right.reportFamily);
}

function priorityRank(value) {
  return value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1;
}

function evidenceRank(value) {
  return value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1;
}

function printBenchmark(benchmark) {
  console.log(`\n${benchmark.benchmarkId}`);
  console.log(`  output: ${benchmark.repositoryPath}`);
  console.log(`  git blob: ${benchmark.sourceCustody.actualGitBlobSha}`);
  console.log(`  sha256: ${benchmark.sourceCustody.contentSha256}`);
  console.log(`  cases: ${benchmark.caseInventory.length}`);
  console.log(`  strict no-friction: ${benchmark.strictNoFrictionCases.map((row) => `CASE ${row.caseNumber}`).join(', ')}`);
  console.log(`  diagnostic: ${benchmark.diagnosticCases.map((row) => `CASE ${row.caseNumber}`).join(', ')}`);
  console.log(`  response scalars retained: ${benchmark.responseScalarCount}`);
  for (const item of benchmark.caseInventory) {
    console.log(`    [${item.tier}] ${item.loadCase} | blocks=${item.reportBlockCount} sourceRows=${item.sourceRowCount} scalars=${item.responseScalarCount}`);
  }
  console.log('  priority opportunities from CAESAR reference sensitivity:');
  for (const item of benchmark.referenceVariantSensitivity.slice(0, 12)) {
    console.log(`    [${item.prioritySignal}/${item.evidenceQuality}] ${item.benchmarkPair} ${item.reportFamily} paired=${item.pairedScalars} >5%=${item.changedBeyondFivePercent} p95=${format(item.p95RelativeDelta)} max=${format(item.maxRelativeDelta)} unmatched=${item.unmatchedLeftRows + item.unmatchedRightRows}`);
  }
  for (const note of benchmark.reviewNotes) console.log(`  REVIEW ${note.code}: ${note.detail}`);
}

function parseCaseLabel(loadCase) {
  const normalized = String(loadCase ?? '').trim();
  const match = /^CASE\s+(\d+)\s+\(([^)]+)\)\s*(.*)$/u.exec(normalized);
  if (!match) throw new Error(`Unrecognised CAESAR LOADCASE label: ${normalized}`);
  return Object.freeze({
    caseNumber: Number(match[1]),
    category: match[2],
    formula: match[3].trim(),
    loadCase: normalized,
  });
}

function requiredChild(inner, tagName, context) {
  const children = findElements(inner, tagName);
  if (children.length === 0) throw new Error(`${context} is missing ${tagName}`);
  return children[0];
}

function nextOccurrence(counts, key) {
  const occurrence = counts.get(key) ?? 0;
  counts.set(key, occurrence + 1);
  return occurrence;
}

function finiteNumber(value, context) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Non-finite ${context}: ${value}`);
  return numeric;
}

function qualifyStrictToleranceBoundary() {
  assert.equal(strictRelativePass(100, 104.999999), true);
  assert.equal(strictRelativePass(100, 105), false, 'exactly +5% must fail');
  assert.equal(strictRelativePass(100, 95), false, 'exactly -5% must fail');
  assert.equal(strictRelativePass(-100, -104.999999), true);
  assert.equal(strictRelativePass(-100, -105), false);
  assert.equal(strictRelativePass(0, 0), true);
  assert.equal(strictRelativePass(0, Number.EPSILON), false, 'zero reference requires exact zero');
}

function strictRelativePass(reference, solver) {
  if (!Number.isFinite(reference) || !Number.isFinite(solver)) return false;
  if (reference === 0) return solver === 0;
  return Math.abs((solver - reference) / reference) < STRICT_RELATIVE_LIMIT;
}

function percentile(values, probability) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(probability * values.length) - 1));
  return values[index];
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function format(value) {
  return Number.isFinite(value) ? value.toExponential(3) : 'n/a';
}
