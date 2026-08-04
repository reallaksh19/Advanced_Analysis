import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const files = await listJavaScriptFiles(sourceRoot);
const sources = new Map(await Promise.all(files.map(async (file) => [
  normalize(path.relative(root, file)),
  await readFile(file, 'utf8'),
])));
const get = (file) => {
  const source = sources.get(file);
  assert.equal(typeof source, 'string', `missing source file: ${file}`);
  return source;
};

const engineeringController = get('src/workspace/engineering-model-controller.js');
const engineeringStore = get('src/workspace/engineering-model-store.js');
const supportStore = get('src/workspace/engineering-loads/engineering-support-load-store.js');
const loadController = get('src/workspace/load-calc-consumer-controller.js');
const loadView = get('src/workspace/load-calc-consumer-view.js');
const runtimePackage = get('src/workspace/engineering-loads/authorized-empirical-runtime-package.js');
const runtimeStore = get('src/workspace/engineering-loads/authorized-empirical-runtime-store.js');
const authorizedController = get('src/workspace/enrichment/authorized-enrichment-consumer-controller.js');
const workspaceApi = get('src/workspace/enrichment/authorized-enrichment-workspace-api.js');
const main = get('src/main.js');
const engine = get('src/workspace/engineering-loads/support-load-distribution-v3.js');

assert.equal(engineeringController.includes('engineeringModelStore.calculate('), false,
  'ordinary controller still invokes the legacy calculation route');
assert.match(engineeringController, /authorizedConsumerController\.executeEmpirical\(\)/u);
assert.match(engineeringController, /CALCULATE_REQUESTED/u);
assert.match(loadController, /authorization\.calculationEligible/u);
assert.match(loadController, /data-engineering-load-calculate/u);
assert.match(loadView, /disabled/u);
assert.match(loadView, /AUTHORIZED_CURRENT|EXECUTED_CURRENT/u);
assert.match(loadView, /HISTORICAL/u);
assert.equal(loadView.includes('LEGACY_PROJECT_DATA'), false,
  'ordinary Load Calc view still endorses legacy Project Data authority');
assert.match(main, /authorizedEnrichmentConsumerController/u);
assert.match(workspaceApi, /configureAuthorizedEmpiricalLoads/u);
assert.match(workspaceApi, /getAuthorizedEmpiricalLoadState/u);
assert.match(authorizedController, /configureAuthorizedEmpiricalPackage/u);
assert.match(authorizedController, /executeConfiguredAuthorized/u);
assert.match(engineeringStore, /executeConfiguredAuthorized\(masterData\)/u);
assert.match(engineeringStore, /authorizedEmpiricalRuntimeStore\.requireCurrentPackage\(\)/u);
assert.match(supportStore, /calculateAuthorizedEmpiricalLoadExecution/u);
assert.match(engine, /EMPIRICAL_LOAD_METHOD = 'CHAINAGE_TRIBUTARY_SPAN_V2'/u);

for (const [label, source] of [
  ['runtime package', runtimePackage],
  ['runtime store', runtimeStore],
  ['authorized controller', authorizedController],
  ['workspace API', workspaceApi],
]) {
  for (const forbidden of [
    'Date.now(', 'new Date()', 'Math.random(', 'crypto.randomUUID',
    'localStorage', 'sessionStorage', 'projectDataStore.set',
    'stagedJSON =', 'stagedJson =', 'LFEA', 'lafea',
  ]) assert.equal(source.includes(forbidden), false, `${label} contains forbidden token: ${forbidden}`);
}

const discoveries = {
  engineeringModelStoreCalculate: discover(sources, /engineeringModelStore\.calculate\s*\(/gu),
  engineeringModelStoreCalculateAuthorized: discover(sources, /engineeringModelStore\.calculateAuthorized\s*\(/gu),
  engineeringSupportLoadStoreCalculate: discover(sources, /engineeringSupportLoadStore\.calculate\s*\(/gu),
  engineeringSupportLoadStoreCalculateAuthorized: discover(sources, /engineeringSupportLoadStore\.calculateAuthorized\s*\(/gu),
  calculateSupportLoadDistribution: discover(sources, /calculateSupportLoadDistribution\s*\(/gu),
  calculateRequested: discover(sources, /ENGINEERING_MODEL_EVENTS\.CALCULATE_REQUESTED/gu),
};

assert.deepEqual(discoveries.engineeringModelStoreCalculate, [],
  'a production caller reaches engineeringModelStore.calculate');
assert.deepEqual(discoveries.engineeringModelStoreCalculateAuthorized, [],
  'a production caller bypasses the configured runtime package');
assert.deepEqual(discoveries.engineeringSupportLoadStoreCalculate, [
  'src/workspace/engineering-model-store.js',
], 'legacy support-store call inventory changed');
assert.deepEqual(discoveries.engineeringSupportLoadStoreCalculateAuthorized, [
  'src/workspace/engineering-model-store.js',
], 'authorized support-store call inventory changed');
assert.deepEqual(discoveries.calculateSupportLoadDistribution, [
  'src/workspace/engineering-loads/authorized-empirical-load-execution.js',
  'src/workspace/engineering-loads/engineering-support-load-store.js',
  'src/workspace/engineering-loads/support-load-distribution-v3.js',
], 'distribution engine caller inventory changed');
assert.deepEqual(discoveries.calculateRequested, [
  'src/workspace/engineering-model-controller.js',
  'src/workspace/load-calc-consumer-controller.js',
], 'ordinary calculation event inventory changed');

const methodSourceSha256 = createHash('sha256').update(engine, 'utf8').digest('hex');
console.log(JSON.stringify({
  status: 'PASS',
  method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
  methodSourceSha256,
  ordinaryLegacyCallerCount: discoveries.engineeringModelStoreCalculate.length,
  configuredAuthorizedExecutionCallerCount: count(engineeringController, /executeEmpirical\(\)/gu),
  productionCallerInventory: discoveries,
}, null, 2));

function discover(sourceMap, pattern) {
  return [...sourceMap.entries()]
    .filter(([, source]) => { pattern.lastIndex = 0; return pattern.test(source); })
    .map(([file]) => file)
    .sort(ascii);
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listJavaScriptFiles(file));
    else if (/\.(?:js|mjs)$/u.test(entry.name)) result.push(file);
  }
  return result;
}

function normalize(value) { return value.split(path.sep).join('/'); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
