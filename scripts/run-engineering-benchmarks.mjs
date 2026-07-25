import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { loadBenchmarkFixtures } from '../src/benchmarking/loadBenchmarkFixtures.js';
import { compareEngineeringResults } from '../src/benchmarking/compareEngineeringResults.js';
import { getMethod } from '../src/engineering-methods/methodRegistry.js';

const DISPATCH = {
  '2d-simplified-stress-check': './src/solvers/2d/index.js',
  '2d-math': './src/solvers/2d/math2d.js',
  '3d-guided-cantilever': './src/solvers/3d/index.js',
  'gc3d-core': './src/core/solvers/gc3d/GC3DCalcEngine.js',
  'calc-extended': './src/calc-extended/solver/ExtendedSolver.js',
  'piperack-expansion-loop': './src/solvers/piperack/index.js',
  'reporting': './src/reporting/index.js',
  'engineering-data': './src/data/engineeringData.js',
  'ui-proof': './src/mocks/engineeringMockCatalog.js'
};

const ROOT_DIR = process.cwd();
const FIXTURES_DIR = path.join(ROOT_DIR, 'benchmarks', 'fixtures');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

function relative(file) {
  return path.relative(ROOT_DIR, file);
}

function isPlainEmptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

function getResultField(rawResult, actual, field) {
  if (rawResult && typeof rawResult === 'object' && field in rawResult) return rawResult[field];
  if (actual && typeof actual === 'object' && field in actual) return actual[field];
  return undefined;
}

async function runBenchmarks() {
  console.log('Running engineering benchmarks...');
  const loaded = loadBenchmarkFixtures(FIXTURES_DIR, { includeDiagnostics: true });
  const { fixtures, invalidFixtures, skippedLegacy, unreadable } = loaded;
  const results = {
    summary: {
      total: fixtures.length,
      passed: 0,
      failed: 0,
      pending: 0,
      skippedLegacy: skippedLegacy.length,
      invalidFixtures: invalidFixtures.length,
      unreadableFixtures: unreadable.length,
      maxRoundedNumericError: 0
    },
    caseResults: [],
    fixtureDiagnostics: {
      invalidFixtures: invalidFixtures.map((item) => ({ file: relative(item.file), errors: item.errors })),
      unreadable: unreadable.map((item) => ({ file: relative(item.file), error: item.error })),
      skippedLegacy: skippedLegacy.map((item) => ({ file: relative(item.file), reason: item.reason }))
    }
  };

  if (invalidFixtures.length || unreadable.length) {
    for (const item of invalidFixtures) {
      results.caseResults.push({
        caseId: relative(item.file),
        title: 'Invalid engineering benchmark fixture',
        module: 'fixture-schema',
        status: 'FAILED',
        message: item.errors.join('; '),
        roundedError: null
      });
    }
    for (const item of unreadable) {
      results.caseResults.push({
        caseId: relative(item.file),
        title: 'Unreadable benchmark fixture',
        module: 'fixture-load',
        status: 'FAILED',
        message: item.error,
        roundedError: null
      });
    }
    results.summary.failed += invalidFixtures.length + unreadable.length;
  }

  for (const fixture of fixtures) {
    const caseResult = {
      caseId: fixture.caseId,
      title: fixture.title,
      module: fixture.module,
      solverExport: fixture.solverExport,
      status: null,
      message: '',
      roundedError: null
    };

    try {
      const method = getMethod(fixture.methodId);
      if (!method) throw new Error(`Unknown methodId "${fixture.methodId}" in benchmark fixture.`);
      if (!DISPATCH[fixture.module]) throw new Error(`No dispatch entry for module "${fixture.module}"`);

      const modulePath = path.join(ROOT_DIR, DISPATCH[fixture.module]);
      const moduleUrl = pathToFileURL(modulePath).href;
      const solverModule = await import(moduleUrl);
      const solverFn = solverModule[fixture.solverExport];
      if (typeof solverFn !== 'function') {
        throw new Error(`Export "${fixture.solverExport}" not found in module "${fixture.module}"`);
      }

      const solverInput = fixture.input;
      const rawResult = Array.isArray(solverInput)
        ? await solverFn(...solverInput)
        : await solverFn(solverInput);

      const actual = rawResult && typeof rawResult === 'object' && 'results' in rawResult
        ? rawResult.results
        : rawResult;

      if (isPlainEmptyObject(actual)) throw new Error('Solver returned empty actualResult object.');

      const actualStatus = getResultField(rawResult, actual, 'status');
      const actualMethodId = getResultField(rawResult, actual, 'methodId');
      const actualFormulaIds = getResultField(rawResult, actual, 'formulaIds');

      if (fixture.compare?.requiredStatus && actualStatus !== fixture.compare.requiredStatus) {
        throw new Error(`Required status ${fixture.compare.requiredStatus} not returned; actual status was ${actualStatus ?? '<missing>'}.`);
      }
      if (actualMethodId !== fixture.methodId) {
        throw new Error(`Required methodId ${fixture.methodId} not returned; actual methodId was ${actualMethodId ?? '<missing>'}.`);
      }
      if (!Array.isArray(actualFormulaIds) || actualFormulaIds.length === 0) {
        throw new Error('Solver result must include non-empty formulaIds array.');
      }

      const comparison = compareEngineeringResults(fixture, actual);
      caseResult.roundedError = comparison.maxError;
      results.summary.maxRoundedNumericError = Math.max(results.summary.maxRoundedNumericError, comparison.maxError);
      if (comparison.passed) {
        caseResult.status = 'PASSED';
        results.summary.passed++;
      } else {
        caseResult.status = 'FAILED';
        caseResult.message = 'Result outside tolerance or mismatch';
        results.summary.failed++;
      }
    } catch (err) {
      caseResult.status = 'FAILED';
      caseResult.message = err.message;
      results.summary.failed++;
    }
    results.caseResults.push(caseResult);
  }

  if (results.summary.total === 0) {
    results.summary.failed++;
    results.caseResults.push({
      caseId: 'NO_FIXTURES',
      title: 'No engineering benchmark fixtures found',
      module: 'benchmark-runner',
      status: 'FAILED',
      message: 'At least one engineering-benchmark-v2 fixture is required.',
      roundedError: null
    });
  }

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'benchmark-results.json'), JSON.stringify(results, null, 2), 'utf8');

  let md = '# Engineering Benchmark Summary\n\n';
  md += `Total engineering cases: ${results.summary.total}\n\n`;
  md += `Passed: ${results.summary.passed}\n\n`;
  md += `Failed: ${results.summary.failed}\n\n`;
  md += `Pending: ${results.summary.pending}\n\n`;
  md += `Skipped legacy/reference fixtures: ${results.summary.skippedLegacy}\n\n`;
  md += `Max Rounded Numeric Error: ${results.summary.maxRoundedNumericError}\n\n`;
  md += '| Case ID | Module | Status | Rounded Error | Message |\n';
  md += '| --- | --- | --- | --- | --- |\n';
  for (const c of results.caseResults) {
    md += `| ${c.caseId} | ${c.module} | **${c.status}** | ${c.roundedError ?? ''} | ${c.message ?? ''} |\n`;
  }
  fs.writeFileSync(path.join(REPORTS_DIR, 'benchmark-summary.md'), md, 'utf8');

  console.log('\nBenchmark Summary:');
  console.log(`Total: ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Pending: ${results.summary.pending}`);
  console.log(`Skipped legacy/reference fixtures: ${results.summary.skippedLegacy}`);
  console.log(`Max Rounded Numeric Error: ${results.summary.maxRoundedNumericError}`);

  if (results.summary.failed > 0) {
    console.error('Some benchmarks failed.');
    process.exit(1);
  }
}

runBenchmarks().catch((err) => {
  console.error('Fatal error running benchmarks:', err);
  process.exit(1);
});
