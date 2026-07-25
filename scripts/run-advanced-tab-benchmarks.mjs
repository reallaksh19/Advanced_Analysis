import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import {
  ADVANCED_ANALYSIS_APP_ID,
  createAdvancedTabBenchmarkRegistry,
  createTabBenchmarkResult,
  createTabBenchmarkSuite,
  serializeTabBenchmarkSuiteJson,
  serializeTabBenchmarkSuiteMarkdown,
} from '../src/core/tab-benchmarks/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realProjectPath = process.env.ADVANCED_REAL_PROJECT_DATASET
  || 'F:\\CODE-5-SS\\ATTRIBUTE-AML_ASIM-1835_managed_stage_enriched_stage.json';
const registry = createAdvancedTabBenchmarkRegistry();
const specs = createCaseSpecs();
const results = [];

for (const tab of registry.tabs) {
  for (const benchmarkCase of tab.requiredCases) {
    const spec = specs.get(benchmarkCase.caseId);
    if (!spec) throw new TypeError(`No runner is registered for ${benchmarkCase.caseId}.`);
    const evidence = spec.kind === 'REAL_PROJECT'
      ? await runRealProjectBenchmark(spec)
      : await runCommandBenchmark(spec);
    results.push(createTabBenchmarkResult({
      appId: ADVANCED_ANALYSIS_APP_ID,
      tabId: tab.tabId,
      caseId: benchmarkCase.caseId,
      category: benchmarkCase.category,
      evidenceBasis: benchmarkCase.evidenceBasis,
      inputSemanticHash: evidence.inputSemanticHash,
      expectedEvidence: evidence.expectedEvidence,
      actualEvidence: evidence.actualEvidence,
      tolerance: evidence.tolerance,
      status: evidence.status,
      diagnostics: evidence.diagnostics,
    }));
  }
}

const suite = createTabBenchmarkSuite(registry, results);
await writeReports(suite);
printSummary(suite);
if (suite.qualifications.some((row) => row.status !== 'Qualified')) process.exitCode = 1;

function createCaseSpecs() {
  const cases = [
    realProjectSpec(),
    commandSpec('workspace-schema-rejection', ['scripts/phase2-workspace-contract-check.mjs']),
    commandSpec('workspace-topology-invariance', ['scripts/w10.2-topology-property-check.mjs']),
    commandSpec('workspace-selection-export-reimport', [
      'scripts/w10.1-shared-piping-model-contract-check.mjs',
      'scripts/phase4-viewport-picking-contract-check.mjs',
    ]),
    browserSpec('workspace-browser-workflow', 'workspace qualification'),
    commandSpec('load-empty-ope-hyd', ['scripts/w10.4-model-load-contract-check.mjs']),
    commandSpec('load-contributions-and-blockers', ['scripts/w10.4-model-load-property-check.mjs']),
    commandSpec('load-force-balance-and-reactions', ['scripts/w10.5-support-load-screening-property-check.mjs']),
    commandSpec('load-workspace-contract-propagation', [
      'scripts/w10.9-load-calculation-contract-check.mjs',
      'scripts/w10.9-load-calculation-property-check.mjs',
    ]),
    browserSpec('load-browser-workflow', 'load calc qualification'),
    commandSpec('lafea-stage-1-foundation', [
      'scripts/lafea.1-contract-check.mjs',
      'scripts/lafea.1-mechanics-check.mjs',
      'scripts/lafea.1-pressure-check.mjs',
      'scripts/lafea.1-determinism-check.mjs',
    ]),
    commandSpec('lafea-stage-2-screening', [
      'scripts/lafea.2-contract-check.mjs',
      'scripts/lafea.2-source-evidence-check.mjs',
      'scripts/lafea.2-section-check.mjs',
      'scripts/lafea.2-mechanics-check.mjs',
      'scripts/lafea.2-pressure-invariant-check.mjs',
      'scripts/lafea.2-envelope-check.mjs',
      'scripts/lafea.2-determinism-check.mjs',
    ]),
    commandSpec('lafea-stage-3-continuum', [
      'scripts/lafea.3-contract-check.mjs',
      'scripts/lafea.3-element-check.mjs',
      'scripts/lafea.3-solver-check.mjs',
      'scripts/lafea.3-patch-check.mjs',
      'scripts/lafea.3-stress-energy-check.mjs',
      'scripts/lafea.3-determinism-check.mjs',
    ]),
    commandSpec('lafea-stage-4-shell', [
      'scripts/lafea.4-contract-check.mjs',
      'scripts/lafea.4-geometry-basis-check.mjs',
      'scripts/lafea.4-membrane-check.mjs',
      'scripts/lafea.4-bending-check.mjs',
      'scripts/lafea.4-solver-loads-check.mjs',
      'scripts/lafea.4-pressure-check.mjs',
      'scripts/lafea.4-stress-energy-check.mjs',
      'scripts/lafea.4-cylindrical-check.mjs',
      'scripts/lafea.4-determinism-check.mjs',
    ]),
    commandSpec('lafea-stage-5-trunnion', [
      'scripts/lafea.5-contract-check.mjs',
      'scripts/lafea.5-source-check.mjs',
      'scripts/lafea.5-geometry-check.mjs',
      'scripts/lafea.5-distribution-check.mjs',
      'scripts/lafea.5-shell-check.mjs',
      'scripts/lafea.5-assessment-check.mjs',
      'scripts/lafea.5-determinism-check.mjs',
    ]),
    commandSpec('lafea-editor-kernel-workflow', ['scripts/lafea-workbench-check.mjs']),
    browserFileSpec('lafea-browser-workflow', 'e2e/lafea-workbench.spec.js'),
    commandSpec('lfea-t3-q4-patch', [
      'scripts/lfea-001-contract-check.mjs',
      'scripts/lfea-001-numerical-check.mjs',
      'scripts/lfea-001-determinism-check.mjs',
      'scripts/lfea-002-contract-check.mjs',
      'scripts/lfea-002-numerical-check.mjs',
      'scripts/lfea-002-determinism-check.mjs',
      'scripts/lfea-003-contract-check.mjs',
      'scripts/lfea-003-numerical-check.mjs',
      'scripts/lfea-003-determinism-check.mjs',
    ]),
    commandSpec('lfea-dense-sparse-parity', [
      'scripts/lfea-004-contract-check.mjs',
      'scripts/lfea-004-numerical-check.mjs',
      'scripts/lfea-004-determinism-check.mjs',
      'scripts/lfea-004-capacity-check.mjs',
    ]),
    commandSpec('lfea-equilibrium-convergence', [
      'scripts/lfea-005-contract-check.mjs',
      'scripts/lfea-005-topology-check.mjs',
      'scripts/lfea-005-assignment-check.mjs',
      'scripts/lfea-005-solver-roundtrip-check.mjs',
      'scripts/lfea-005-determinism-check.mjs',
    ]),
    commandSpec('lfea-singular-rejection', [
      'scripts/lfea-003-failure-check.mjs',
      'scripts/lfea-004-failure-check.mjs',
    ]),
    commandSpec('lfea-editor-review-export', [
      'scripts/lfea-006-contract-check.mjs',
      'scripts/lfea-006-qualification-check.mjs',
      'scripts/lfea-006-review-check.mjs',
      'scripts/lfea-006-export-check.mjs',
      'scripts/lfea-006-failure-check.mjs',
      'scripts/lfea-006-determinism-check.mjs',
      'scripts/lfea-workbench-check.mjs',
    ]),
    browserFileSpec('lfea-browser-workflow', 'e2e/lfea-workbench.spec.js'),
  ];
  return new Map(cases.map((item) => [item.caseId, item]));
}

function realProjectSpec() {
  return {
    kind: 'REAL_PROJECT',
    caseId: 'workspace-real-project-import',
    sourcePath: realProjectPath,
    expected: {
      schema: 'inputxml-managed-stage/v1',
      sha256: '88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6',
      byteLength: 25219174,
      rawRootCount: 276,
      rawNodeCount: 4884,
      rawSupportCount: 1331,
      normalizedPipeCount: 3277,
      normalizedSupportCount: 1331,
      normalizedComponentCount: 276,
    },
  };
}

function commandSpec(caseId, relativeScripts) {
  return {
    kind: 'COMMAND',
    caseId,
    commands: relativeScripts.map((relativePath) => ({
      executable: process.execPath,
      args: [relativePath],
      identity: `node ${relativePath}`,
    })),
    inputPaths: relativeScripts,
  };
}

function browserSpec(caseId, title) {
  return browserCommandSpec(caseId, ['e2e/advanced-shell.spec.js', '--grep', title], ['e2e/advanced-shell.spec.js']);
}

function browserFileSpec(caseId, relativePath) {
  return browserCommandSpec(caseId, [relativePath], [relativePath]);
}

function browserCommandSpec(caseId, playwrightArgs, inputPaths) {
  return {
    kind: 'COMMAND',
    caseId,
    commands: [{
      executable: process.execPath,
      args: ['node_modules/@playwright/test/cli.js', 'test', ...playwrightArgs],
      identity: `playwright test ${playwrightArgs.join(' ')}`,
    }],
    inputPaths,
  };
}

async function runRealProjectBenchmark(spec) {
  const expected = spec.expected;
  try {
    const sourceStat = await stat(spec.sourcePath);
    const buffer = await readFile(spec.sourcePath);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const raw = JSON.parse(buffer.toString('utf8'));
    const rawRows = flattenRawObjects(raw.objects);
    const dataset = normalizeWorkspaceDataset(raw, path.basename(spec.sourcePath));
    const actual = {
      schema: raw.schema,
      sha256,
      byteLength: sourceStat.size,
      rawRootCount: Array.isArray(raw.objects) ? raw.objects.length : 0,
      rawNodeCount: rawRows.length,
      rawSupportCount: rawRows.filter((row) => row?.type === 'SUPPORT').length,
      normalizedPipeCount: dataset.summary.pipes,
      normalizedSupportCount: dataset.summary.supports,
      normalizedComponentCount: dataset.summary.components,
    };
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    return {
      inputSemanticHash: `sha256:${sha256}`,
      expectedEvidence: expected,
      actualEvidence: actual,
      tolerance: null,
      status: passed ? 'PASS' : 'FAIL',
      diagnostics: passed ? [] : ['Real-project source evidence differs from the independently recorded baseline.'],
    };
  } catch (error) {
    return {
      inputSemanticHash: `sha256:${expected.sha256}`,
      expectedEvidence: expected,
      actualEvidence: { sourceAvailable: false },
      tolerance: null,
      status: 'FAIL',
      diagnostics: [`Real-project benchmark unavailable: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function runCommandBenchmark(spec) {
  const inputSemanticHash = await hashInputs(spec);
  const exitCodes = [];
  const diagnostics = [];
  for (const command of spec.commands) {
    const result = spawnSync(command.executable, command.args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
      stdio: 'pipe',
      timeout: 600000,
    });
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    exitCodes.push(exitCode);
    if (exitCode !== 0) diagnostics.push(`${command.identity} failed with exit code ${exitCode}.`);
  }
  const expectedEvidence = { passed: true, exitCodes: spec.commands.map(() => 0) };
  const actualEvidence = { passed: exitCodes.every((code) => code === 0), exitCodes };
  return {
    inputSemanticHash,
    expectedEvidence,
    actualEvidence,
    tolerance: null,
    status: actualEvidence.passed ? 'PASS' : 'FAIL',
    diagnostics,
  };
}

async function hashInputs(spec) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(spec.commands.map((command) => command.identity)));
  const allFiles = await resolveInputFiles(spec.inputPaths);
  for (const relativePath of allFiles) {
    hash.update(relativePath);
    try {
      hash.update(await readFile(path.join(root, relativePath)));
    } catch {
      hash.update('<missing>');
    }
  }
  return `sha256:${hash.digest('hex')}`;
}

async function resolveInputFiles(inputs) {
  const scripts = await import('node:fs/promises').then(({ readdir }) => readdir(path.join(root, 'scripts')));
  const resolved = [];
  for (const input of inputs) {
    if (input.endsWith('-')) {
      const prefix = input.slice('scripts/'.length);
      scripts.filter((name) => name.startsWith(prefix)).sort().forEach((name) => resolved.push(`scripts/${name}`));
    } else {
      resolved.push(input);
    }
  }
  return [...new Set(resolved)].sort();
}

function flattenRawObjects(roots) {
  const rows = [];
  const pending = Array.isArray(roots) ? [...roots] : [];
  while (pending.length) {
    const row = pending.shift();
    rows.push(row);
    if (Array.isArray(row?.children)) pending.unshift(...row.children);
  }
  return rows;
}

async function writeReports(suite) {
  const json = serializeTabBenchmarkSuiteJson(suite);
  const markdown = serializeTabBenchmarkSuiteMarkdown(suite);
  const reportDirectory = path.join(root, 'reports', 'qualification');
  const publicDirectory = path.join(root, 'public', 'qualification');
  await Promise.all([mkdir(reportDirectory, { recursive: true }), mkdir(publicDirectory, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(reportDirectory, 'advanced-tab-benchmarks.json'), json, 'utf8'),
    writeFile(path.join(reportDirectory, 'advanced-tab-benchmarks.md'), markdown, 'utf8'),
    writeFile(path.join(publicDirectory, 'advanced-tab-benchmarks.json'), json, 'utf8'),
    writeFile(path.join(publicDirectory, 'advanced-tab-benchmarks.md'), markdown, 'utf8'),
  ]);
}

function printSummary(suite) {
  console.log('Advanced Analysis tab qualification');
  suite.qualifications.forEach((row) => {
    console.log(`${row.tabId}: ${row.status} (${row.passedCaseCount}/${row.requiredCaseCount})`);
  });
  console.log(`Suite semantic hash: ${suite.semanticHash}`);
}
