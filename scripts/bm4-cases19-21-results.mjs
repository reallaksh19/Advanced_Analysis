#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PINNED_REFERENCE = Object.freeze({
  commit: '2e4ee401dcce4c9ed6c2efe01b1ab74ed9b51c2c',
  path: 'reports/m034-bm4-forces-displacement-comparison.json',
  gitBlobSha1: '3cc7ff4f23b5577a4e0519096138497e186674e9',
  schema: 'm034-bm4-forces-displacement-comparison/v1',
});

// CAESAR II BM4 result load cases requested for this workstream.
// Keep the numerical identity next to the engineering category so reports do
// not silently drift if a future exporter changes display labels.
const REQUESTED_CASES = Object.freeze([
  Object.freeze({ loadCase: 19, referenceKey: 'SUS' }),
  Object.freeze({ loadCase: 20, referenceKey: 'OPE' }),
  Object.freeze({ loadCase: 21, referenceKey: 'EXP' }),
]);

function parseArgs(argv) {
  const result = {
    reference: PINNED_REFERENCE.path,
    computed: null,
    json: false,
    allowUnpinnedReference: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--reference') result.reference = argv[++i];
    else if (token === '--computed') result.computed = argv[++i];
    else if (token === '--json') result.json = true;
    else if (token === '--allow-unpinned-reference') result.allowUnpinnedReference = true;
    else if (token === '--help' || token === '-h') {
      console.log(`Usage: node scripts/bm4-cases19-21-results.mjs [options]\n\nOptions:\n  --reference <path>  M034 comparison JSON (default: ${PINNED_REFERENCE.path})\n  --computed <path>   Optional fresh solver result JSON for CASE 19-21\n  --json              Emit machine-readable JSON only\n  --allow-unpinned-reference  Skip pinned Git-blob identity check\n`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return result;
}

function gitBlobSha1(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function readJson(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`File not found: ${absolute}`);
  const content = readFileSync(absolute, 'utf8');
  return { absolute, content, value: JSON.parse(content) };
}

function rowsOf(value) {
  return value && typeof value === 'object' && Array.isArray(value.rows) ? value.rows : [];
}

function classifyFamily(name) {
  const token = String(name).toLowerCase();
  if (token.includes('displacement') || token.includes('movement')) return 'displacement';
  if (token.includes('stress')) return 'stress';
  if (/(force|moment|reaction|load|action)/u.test(token)) return 'force';
  return 'other';
}

function peakRowsByField(rows, valueKey) {
  const peaks = new Map();
  for (const row of rows) {
    const value = Number(row?.[valueKey]);
    if (!Number.isFinite(value)) continue;
    const field = String(row?.field ?? 'VALUE');
    const current = peaks.get(field);
    if (!current || Math.abs(value) > Math.abs(current[valueKey])) peaks.set(field, row);
  }
  return [...peaks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([field, row]) => ({
    field,
    identifier: row.identifier ?? null,
    end: row.end ?? null,
    value: row[valueKey],
    counterpart: valueKey === 'ours' ? row.cii ?? null : row.ours ?? null,
    percentDifference: row.percentDifference ?? null,
    causeCodes: Array.isArray(row.causeCodes) ? row.causeCodes : [],
  }));
}

function summarizeReferenceFamily(name, family) {
  const rows = rowsOf(family);
  const finitePercentRows = rows.filter((row) => Number.isFinite(Number(row?.percentDifference)));
  const worst = finitePercentRows.reduce((current, row) => {
    if (!current) return row;
    return Math.abs(Number(row.percentDifference)) > Math.abs(Number(current.percentDifference)) ? row : current;
  }, null);
  return {
    name,
    classification: classifyFamily(name),
    rowCount: rows.length,
    passedTarget: rows.filter((row) => row?.passedTarget === true).length,
    passedStandingBar: rows.filter((row) => row?.passedStandingBar === true).length,
    peakHistoricalComputedByField: peakRowsByField(rows, 'ours'),
    peakCaesarIiByField: peakRowsByField(rows, 'cii'),
    worstPercentDifference: worst ? {
      identifier: worst.identifier ?? null,
      end: worst.end ?? null,
      field: worst.field ?? null,
      ours: worst.ours ?? null,
      cii: worst.cii ?? null,
      percentDifference: worst.percentDifference,
      causeCodes: Array.isArray(worst.causeCodes) ? worst.causeCodes : [],
    } : null,
  };
}

function summarizeReferenceCase(reference, descriptor) {
  const source = reference?.cases?.[descriptor.referenceKey];
  if (!source || typeof source !== 'object') {
    return {
      ...descriptor,
      status: 'REFERENCE_CASE_MISSING',
      families: [],
      quantityStatus: {
        force: 'NOT_PRESENT_IN_PINNED_REFERENCE_CASE',
        displacement: 'NOT_PRESENT_IN_PINNED_REFERENCE_CASE',
        stress: 'NOT_PRESENT_IN_PINNED_REFERENCE_CASE',
      },
    };
  }
  const families = Object.entries(source)
    .filter(([, value]) => rowsOf(value).length > 0)
    .map(([name, value]) => summarizeReferenceFamily(name, value));
  const classifications = new Set(families.map((family) => family.classification));
  return {
    ...descriptor,
    status: 'REFERENCE_AVAILABLE',
    families,
    quantityStatus: {
      force: classifications.has('force') ? 'AVAILABLE' : 'NOT_PRESENT_IN_PINNED_REFERENCE_CASE',
      displacement: classifications.has('displacement') ? 'AVAILABLE' : 'NOT_PRESENT_IN_PINNED_REFERENCE_CASE',
      stress: classifications.has('stress') ? 'AVAILABLE' : 'NOT_PRESENT_IN_PINNED_REFERENCE_CASE',
    },
  };
}

function normalizeComputedCases(value) {
  if (!value) return new Map();
  const source = value.cases ?? value.results ?? value;
  const entries = Array.isArray(source)
    ? source.map((entry) => [String(entry.loadCase ?? entry.caseId ?? entry.case ?? ''), entry])
    : Object.entries(source);
  return new Map(entries);
}

function findComputedCase(computedCases, descriptor) {
  return computedCases.get(String(descriptor.loadCase))
    ?? computedCases.get(descriptor.referenceKey)
    ?? null;
}

function summarizeComputedCase(computedCases, descriptor) {
  const source = findComputedCase(computedCases, descriptor);
  if (!source) return { status: 'FRESH_COMPUTED_RESULT_NOT_SUPPLIED' };
  const quantities = {};
  for (const quantity of ['force', 'displacement', 'stress']) {
    const candidate = source[quantity] ?? source[`${quantity}s`] ?? null;
    const rows = Array.isArray(candidate) ? candidate : rowsOf(candidate);
    quantities[quantity] = rows.length > 0
      ? { status: 'AVAILABLE', rowCount: rows.length, rows }
      : { status: 'NOT_PRESENT_IN_COMPUTED_RESULT', rowCount: 0, rows: [] };
  }
  return { status: 'FRESH_COMPUTED_RESULT_SUPPLIED', quantities };
}

function buildReport(reference, computed) {
  const computedCases = normalizeComputedCases(computed);
  return {
    schema: 'bm4-cases19-21-result-report/v1',
    provenance: {
      pinnedReference: PINNED_REFERENCE,
      historicalComputedMeaning: 'M034 field `ours` is historical computed output from the pinned comparison artifact; it is not presented as a fresh solve by this command.',
      freshComputedSupplied: Boolean(computed),
    },
    cases: REQUESTED_CASES.map((descriptor) => ({
      ...summarizeReferenceCase(reference, descriptor),
      computed: summarizeComputedCase(computedCases, descriptor),
    })),
  };
}

function printHuman(report) {
  console.log('BM4 CASE 19-21 result report');
  console.log(`Pinned comparison: ${report.provenance.pinnedReference.commit}:${report.provenance.pinnedReference.path}`);
  console.log('M034 `ours` values below are historical computed baseline, not a fresh solve.');
  for (const entry of report.cases) {
    console.log(`\nCASE ${entry.loadCase} (${entry.referenceKey}) — ${entry.status}`);
    console.log(`  quantities: force=${entry.quantityStatus.force}, displacement=${entry.quantityStatus.displacement}, stress=${entry.quantityStatus.stress}`);
    for (const family of entry.families) {
      console.log(`  ${family.name}: rows=${family.rowCount}, target-pass=${family.passedTarget}/${family.rowCount}, standing-bar-pass=${family.passedStandingBar}/${family.rowCount}`);
      for (const peak of family.peakHistoricalComputedByField) {
        console.log(`    peak ours ${peak.field}: ${peak.value} @ ${peak.identifier}${peak.end ? `:${peak.end}` : ''} (cii=${peak.counterpart}, diff=${peak.percentDifference ?? 'n/a'}%)`);
      }
    }
    console.log(`  fresh solver: ${entry.computed.status}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const referenceFile = readJson(args.reference);
const actualBlobSha1 = gitBlobSha1(referenceFile.content);
if (!args.allowUnpinnedReference && actualBlobSha1 !== PINNED_REFERENCE.gitBlobSha1) {
  throw new Error(`Reference blob mismatch: expected ${PINNED_REFERENCE.gitBlobSha1}, got ${actualBlobSha1}. Use the exact pinned M034 artifact from commit ${PINNED_REFERENCE.commit}.`);
}
if (referenceFile.value?.schema !== PINNED_REFERENCE.schema) {
  throw new Error(`Reference schema mismatch: expected ${PINNED_REFERENCE.schema}, got ${referenceFile.value?.schema ?? '<missing>'}.`);
}
const computedFile = args.computed ? readJson(args.computed) : null;
const report = buildReport(referenceFile.value, computedFile?.value ?? null);
if (args.json) console.log(JSON.stringify(report, null, 2));
else printHuman(report);
