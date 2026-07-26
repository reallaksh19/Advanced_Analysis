#!/usr/bin/env node
/**
 * FEA benchmark CLI.
 *
 *   node scripts/run-fea-benchmarks.mjs --label before
 *   node scripts/run-fea-benchmarks.mjs --label after --compare before
 *   node scripts/run-fea-benchmarks.mjs --tier T1_CLOSED_FORM
 *   node scripts/run-fea-benchmarks.mjs --gate          (non-zero exit on any failure)
 *
 * Writes reports/fea-benchmark-<label>.json and .md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allBenchmarkCases, compareBenchmarkReports, runBenchmarks } from '../src/core/fea-benchmarks/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = path.join(ROOT, 'reports');

const args = parseArgs(process.argv.slice(2));
const label = args.label ?? 'current';
const filter = args.tier
  ? (row) => row.tier === args.tier
  : args.case
    ? (row) => row.caseId === args.case
    : () => true;

process.stdout.write(`FEA benchmark suite — label "${label}"\n\n`);

const report = runBenchmarks(allBenchmarkCases(), {
  label,
  filter,
  onProgress: (event) => {
    if (event.phase === 'START') process.stdout.write(`  [${event.index + 1}/${event.total}] ${event.caseId} ... `);
    else process.stdout.write(`${event.status}\n`);
  },
});

fs.mkdirSync(REPORTS, { recursive: true });
const jsonPath = path.join(REPORTS, `fea-benchmark-${label}.json`);
const markdownPath = path.join(REPORTS, `fea-benchmark-${label}.md`);
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

process.stdout.write('\n');
process.stdout.write(`Cases   ${report.totals.cases}  passed ${report.totals.passed}  failed ${report.totals.failed}  errored ${report.totals.errored}\n`);
process.stdout.write(`Checks  ${report.totals.checks}  failed ${report.totals.failedChecks}\n`);
process.stdout.write(`Max relative error on exact cases: ${report.totals.maximumRelativeError.toExponential(4)}\n`);
process.stdout.write(`Report hash: ${report.semanticHash}\n`);
process.stdout.write(`Written: ${path.relative(ROOT, jsonPath)}, ${path.relative(ROOT, markdownPath)}\n`);

if (args.compare) {
  const basePath = path.join(REPORTS, `fea-benchmark-${args.compare}.json`);
  if (!fs.existsSync(basePath)) {
    process.stderr.write(`\nBaseline report not found: ${path.relative(ROOT, basePath)}\n`);
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const comparison = compareBenchmarkReports(before, report);
  const comparisonPath = path.join(REPORTS, `fea-benchmark-comparison-${args.compare}-to-${label}.json`);
  const comparisonMarkdown = path.join(REPORTS, `fea-benchmark-comparison-${args.compare}-to-${label}.md`);
  fs.writeFileSync(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  fs.writeFileSync(comparisonMarkdown, renderComparison(comparison, before, report), 'utf8');
  process.stdout.write(`\nComparison ${args.compare} -> ${label}\n`);
  process.stdout.write(`  repairs     ${comparison.repairs.length}\n`);
  process.stdout.write(`  regressions ${comparison.regressions.length}\n`);
  comparison.repairs.forEach((row) => process.stdout.write(`    FIXED     ${row.caseId} (${row.transition})\n`));
  comparison.regressions.forEach((row) => process.stdout.write(`    REGRESSED ${row.caseId} (${row.transition})\n`));
  process.stdout.write(`Written: ${path.relative(ROOT, comparisonPath)}, ${path.relative(ROOT, comparisonMarkdown)}\n`);
  if (args.gate && comparison.regressions.length) process.exit(1);
}

if (args.gate && (report.totals.failed || report.totals.errored)) {
  process.stderr.write('\nBenchmark gate failed.\n');
  process.exit(1);
}

/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--gate') out.gate = true;
    else if (token.startsWith('--')) { out[token.slice(2)] = argv[i + 1]; i += 1; }
  }
  return out;
}

function renderMarkdown(record) {
  const lines = [];
  lines.push(`# FEA benchmark report — ${record.label}`);
  lines.push('');
  lines.push(`Report hash \`${record.semanticHash}\``);
  lines.push('');
  lines.push(`| Cases | Passed | Failed | Errored | Checks | Failed checks | Max relative error |`);
  lines.push(`|---:|---:|---:|---:|---:|---:|---:|`);
  lines.push(`| ${record.totals.cases} | ${record.totals.passed} | ${record.totals.failed} | ${record.totals.errored} `
    + `| ${record.totals.checks} | ${record.totals.failedChecks} | ${record.totals.maximumRelativeError.toExponential(3)} |`);
  lines.push('');
  lines.push('## By tier');
  lines.push('');
  lines.push('| Tier | Passed | Failed | Errored |');
  lines.push('|---|---:|---:|---:|');
  record.byTier.forEach((row) => lines.push(`| ${row.name} | ${row.passed} | ${row.failed} | ${row.errored} |`));
  lines.push('');
  lines.push('## Cases');
  lines.push('');
  record.results.forEach((row) => {
    lines.push(`### ${statusMark(row.status)} \`${row.caseId}\` — ${row.title}`);
    lines.push('');
    lines.push(`*Tier* ${row.tier} · *Category* ${row.category} · *Kernel* \`${row.kernel}\``);
    lines.push('');
    lines.push(`*Reference* (${row.reference.type}): ${row.reference.source}`);
    lines.push('');
    if (row.error) {
      lines.push(`> **ERROR** ${row.error.message}`);
      lines.push('');
      return;
    }
    lines.push('| | Check | Quantity | Computed | Reference | Tolerance | Note |');
    lines.push('|---|---|---|---:|---:|---|---|');
    row.checks.forEach((c) => lines.push(
      `| ${statusMark(c.status)} | \`${shortId(c.checkId, row.caseId)}\` | ${c.quantity} `
      + `| ${fmt(c.computed)} | ${fmt(c.reference)} | ${c.tolerance} ${c.toleranceType} `
      + `| ${(c.note ?? '').replaceAll('|', '\\|')} |`,
    ));
    lines.push('');
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderComparison(comparison, before, after) {
  const lines = [];
  lines.push(`# FEA benchmark comparison — ${comparison.beforeLabel} → ${comparison.afterLabel}`);
  lines.push('');
  lines.push(`| | Cases | Passed | Failed | Errored | Failed checks |`);
  lines.push(`|---|---:|---:|---:|---:|---:|`);
  lines.push(`| ${before.label} | ${before.totals.cases} | ${before.totals.passed} | ${before.totals.failed} `
    + `| ${before.totals.errored} | ${before.totals.failedChecks} |`);
  lines.push(`| ${after.label} | ${after.totals.cases} | ${after.totals.passed} | ${after.totals.failed} `
    + `| ${after.totals.errored} | ${after.totals.failedChecks} |`);
  lines.push('');
  lines.push(`Repairs: **${comparison.repairs.length}** · Regressions: **${comparison.regressions.length}**`);
  lines.push('');
  lines.push('| Case | Tier | Before | After | Transition |');
  lines.push('|---|---|---|---|---|');
  comparison.rows.forEach((row) => lines.push(
    `| \`${row.caseId}\` | ${row.tier} | ${row.beforeStatus ?? '—'} | ${row.afterStatus ?? '—'} `
    + `| ${row.transition === 'UNCHANGED' ? '' : `**${row.transition}**`} |`,
  ));
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function statusMark(status) {
  return status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'ERROR';
}
function shortId(checkId, caseId) {
  return checkId.startsWith(`${caseId}.`) ? checkId.slice(caseId.length + 1) : checkId;
}
function fmt(value) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  return magnitude < 1e-3 || magnitude >= 1e6 ? value.toExponential(4) : value.toPrecision(7);
}
