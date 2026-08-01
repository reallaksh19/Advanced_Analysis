export const DEMO_EXACT_HEAD = '617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54';
export const DEMO_IMMUTABLE_REF = 'release/lfea-piping-phase6i-617f7c2';
export const DEMO_ELIGIBILITY = 'INELIGIBLE_FOR_PROJECT_EVIDENCE';

const EXPECTED_RECORDS = Object.freeze([
  'application-result.json',
  'presentation.json',
  'real-model-reconciliation.json',
  'commercial-corroboration.json',
  'performance-evidence.json',
  'rollback-evidence.json',
  'signed-disposition.json',
]);
const EXPECTED_PATHS = Object.freeze([
  'request/external-materialization-request.json',
  ...EXPECTED_RECORDS.map((name) => `records/${name}`),
]);
const FORBIDDEN_RELEASE_CLAIMS = Object.freeze([
  ['RELEASE', 'APPROVED'].join('_'),
  ['ELIGIBLE', 'FOR_RELEASE_REVIEW'].join('_'),
]);

export async function loadPhase6hDemo(url = './sample.json', fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('DEMO_FETCH_UNAVAILABLE');
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response?.ok) throw new Error(`DEMO_SAMPLE_FETCH_FAILED:${response?.status ?? 'UNKNOWN'}`);
  return requirePhase6hDemo(await response.json());
}

export function requirePhase6hDemo(value) {
  const failures = validatePhase6hDemo(value);
  if (failures.length) throw new TypeError(`DEMO_SAMPLE_INVALID:${failures.join('|')}`);
  return deepFreeze(clone(value));
}

export function validatePhase6hDemo(value) {
  const failures = [];
  if (!isRecord(value)) return ['ROOT_NOT_OBJECT'];
  equal(failures, value.schema, 'lfea-phase6h-demo-only-sample/v2', 'SCHEMA');
  equal(failures, value.exactHead, DEMO_EXACT_HEAD, 'CANDIDATE');
  equal(failures, value.immutableRef, DEMO_IMMUTABLE_REF, 'IMMUTABLE_REF');
  equal(failures, value.eligibility, DEMO_ELIGIBILITY, 'ELIGIBILITY');
  equal(failures, value.evidenceClass, 'SAMPLE_FOR_UI_AND_WORKFLOW_SHAPE_APPROVAL_ONLY', 'EVIDENCE_CLASS');
  if ([value.workflowRun, value.workflowJob, value.artifactId].some((item) => item !== null)) {
    failures.push('PROVENANCE_MUST_BE_NULL');
  }
  validateAuthority(failures, value.authorityState);
  validateModel(failures, value.model);
  validateResults(failures, value.results);
  validateRecords(failures, value.records);
  validateComparisons(failures, value.comparisons);
  if (!Array.isArray(value.paths) || !same(value.paths, EXPECTED_PATHS)) failures.push('SOURCE_PATHS');
  return failures;
}

function validateAuthority(failures, state) {
  if (!isRecord(state)) return failures.push('AUTHORITY_STATE_NOT_OBJECT');
  equal(failures, state.wp3, 'BLOCKED_INPUT_REQUIRED', 'WP3');
  equal(failures, state.phase6h, 'NOT_READY', 'PHASE6H');
  equal(failures, state.wp4, 'BLOCKED', 'WP4');
}

function validateModel(failures, model) {
  if (!isRecord(model)) return failures.push('MODEL_NOT_OBJECT');
  equal(failures, model.modelId, 'SAMPLE-LINE-1001', 'MODEL_ID');
  equal(failures, model.loadCaseId, 'OPE-1', 'LOAD_CASE');
  if (!Array.isArray(model.nodes) || model.nodes.length !== 3) failures.push('NODE_COUNT');
  if (!Array.isArray(model.elements) || model.elements.length !== 2) failures.push('ELEMENT_COUNT');
}

function validateResults(failures, results) {
  if (!isRecord(results)) return failures.push('RESULTS_NOT_OBJECT');
  const scalars = [
    results.nozzleUtilization,
    results.b31CalculatedStressPa,
    results.b31AllowableStressPa,
    results.b31Utilization,
  ];
  if (!scalars.every(Number.isFinite)) failures.push('RESULT_SCALARS');
  if (!vector(results.forceLocalN, 3)) failures.push('FORCE_VECTOR');
  if (!vector(results.momentLocalNm, 3)) failures.push('MOMENT_VECTOR');
}

function validateRecords(failures, records) {
  if (!Array.isArray(records) || records.length !== EXPECTED_RECORDS.length) {
    failures.push('RECORD_COUNT');
    return;
  }
  if (!same(records.map((record) => record?.name), EXPECTED_RECORDS)) failures.push('RECORD_SEQUENCE');
  if (records.some((record) => record?.eligibility !== DEMO_ELIGIBILITY)) failures.push('RECORD_ELIGIBILITY');
  if (records.at(-1)?.state !== 'NOT_SIGNED') failures.push('DISPOSITION_NOT_UNSIGNED');
  if (records.some((record) => FORBIDDEN_RELEASE_CLAIMS.some((claim) => JSON.stringify(record).includes(claim)))) {
    failures.push('FORBIDDEN_RELEASE_CLAIM');
  }
}

function validateComparisons(failures, rows) {
  if (!Array.isArray(rows) || rows.length !== 5) return failures.push('COMPARISON_COUNT');
  if (rows.some((row) => !['application', 'g8', 'g9'].every((key) => Number.isFinite(row?.[key])))) {
    failures.push('COMPARISON_VALUES');
  }
}

function equal(failures, actual, expected, code) {
  if (actual !== expected) failures.push(code);
}

function same(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function vector(value, size) {
  return Array.isArray(value) && value.length === size && value.every(Number.isFinite);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

if (typeof document !== 'undefined') initializeDemoPage();

function initializeDemoPage() {
  const element = (selector) => document.querySelector(selector);
  const ui = Object.freeze({
    actions: element('#actions'),
    comparisons: element('#comparisons'),
    download: element('#download'),
    guard: element('#guard'),
    identity: element('#identity'),
    loadStatus: element('#load-status'),
    paths: element('#paths'),
    raw: element('#raw'),
    records: element('#records'),
    reload: element('#reload'),
    results: element('#results'),
  });
  let activeDemo = null;
  ui.reload.addEventListener('click', loadAndRender);
  ui.download.addEventListener('click', download);
  loadAndRender();

  async function loadAndRender() {
    setLoading();
    try {
      activeDemo = await loadPhase6hDemo();
      render(activeDemo);
      ui.loadStatus.textContent = 'Loaded approved demo sample.json through the segregated loader.';
    } catch (error) {
      activeDemo = null;
      clear();
      ui.loadStatus.textContent = 'Demo sample rejected. No fallback data was loaded.';
      ui.guard.innerHTML = `<p><strong>FAIL CLOSED</strong></p><p><code>${escape(error?.message ?? error)}</code></p>`;
      ui.reload.disabled = false;
    }
  }

  function setLoading() {
    ui.reload.disabled = true;
    ui.download.disabled = true;
    ui.loadStatus.textContent = 'Loading demo-only sample…';
    ui.guard.innerHTML = '<p><strong>VALIDATING</strong></p>';
  }

  function render(demo) {
    const cards = [
      ['Candidate SHA', demo.exactHead],
      ['Immutable ref', demo.immutableRef],
      ['Model', demo.model.modelId],
      ['Load case', demo.model.loadCaseId],
      ['WP-3', demo.authorityState.wp3],
      ['Phase 6H', demo.authorityState.phase6h],
    ];
    ui.identity.innerHTML = cards.map(([label, value]) => (
      `<article class="card"><div class="subtle">${escape(label)}</div><div class="metric">${escape(value)}</div></article>`
    )).join('');
    ui.results.innerHTML = [
      utilization('Nozzle', demo.results.nozzleUtilization),
      utilization('B31.3', demo.results.b31Utilization),
      `<p><strong>B31 stress:</strong> ${(demo.results.b31CalculatedStressPa / 1e6).toFixed(1)} MPa / ${(demo.results.b31AllowableStressPa / 1e6).toFixed(1)} MPa</p>`,
    ].join('');
    ui.actions.innerHTML = vectorHtml('Force [N]', demo.results.forceLocalN)
      + vectorHtml('Moment [N·m]', demo.results.momentLocalNm);
    ui.records.innerHTML = demo.records.map((row) => (
      `<tr><td><code>${escape(row.name)}</code></td><td>${escape(row.owner)}</td><td>${escape(row.approver)}</td><td>${escape(row.state)}</td><td>${escape(row.authority)}</td></tr>`
    )).join('');
    ui.comparisons.innerHTML = demo.comparisons.map((row) => (
      `<tr><td>${escape(row.selector)}</td><td>${row.application}</td><td>${row.g8}</td><td>${row.g9}</td><td>${escape(row.unit)}</td></tr>`
    )).join('');
    ui.paths.textContent = demo.paths.join('\n');
    ui.raw.textContent = JSON.stringify(demo, null, 2);
    ui.guard.innerHTML = '<p><strong>PASS — demo sample is segregated, validated and ineligible.</strong></p><p>WP-2, WP-3, Phase 6H, WP-4 and release qualification remain unchanged.</p>';
    ui.reload.disabled = false;
    ui.download.disabled = false;
  }

  function clear() {
    for (const key of ['identity', 'results', 'actions', 'records', 'comparisons']) ui[key].replaceChildren();
    ui.paths.textContent = '';
    ui.raw.textContent = '';
    ui.download.disabled = true;
  }

  function download() {
    if (!activeDemo || activeDemo.eligibility !== DEMO_ELIGIBILITY) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(activeDemo, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lfea-phase6h-demo-only-sample.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

function utilization(label, value) {
  return `<p><strong>${escape(label)}:</strong> ${value.toFixed(3)}</p><div class="bar"><span style="width:${Math.max(0, Math.min(100, value * 100))}%"></span></div>`;
}

function vectorHtml(label, values) {
  return `<p><strong>${escape(label)}:</strong> <code>[${values.join(', ')}]</code></p>`;
}

function escape(value) {
  const node = document.createElement('span');
  node.textContent = String(value);
  return node.innerHTML;
}
