/**
 * LAFEA mesh-quality panel.
 *
 * Gate classification is owned by the meshing quality-gate package. This
 * presentation module renders only retained gate results and never invents a
 * mesh, threshold, metric value or PASS state.
 */

const SEVERITY = Object.freeze({ OK: 0, WARNING: 1, BLOCK: 2 });

const METRIC_LABELS = Object.freeze({
  ASPECT_RATIO: 'Aspect ratio',
  MINIMUM_ANGLE_DEGREES: 'Minimum interior angle',
  SCALED_JACOBIAN: 'Minimum scaled Jacobian',
  SHELL_WARPAGE_DEGREES: 'Shell warpage',
  BOUNDARY_SEGMENT_COUNT: 'Boundary segment count',
  SHELL_SIZE_TO_THICKNESS_RATIO: 'Element size / thickness',
});

const METRIC_UNITS = Object.freeze({
  ASPECT_RATIO: 'ratio',
  MINIMUM_ANGLE_DEGREES: 'deg',
  SCALED_JACOBIAN: 'ratio',
  SHELL_WARPAGE_DEGREES: 'deg',
  BOUNDARY_SEGMENT_COUNT: 'count',
  SHELL_SIZE_TO_THICKNESS_RATIO: 'ratio',
});

/**
 * Build a display model from retained gate evidence.
 *
 * @param {readonly object[]} gateResults Results from the governed quality-gate package.
 * @param {{stageId: string, meshProfileIdentity: string}} context Retained parent identities.
 * @returns {Readonly<Record<string, unknown>>}
 */
export function buildMeshQualityPanel(gateResults, context) {
  if (!Array.isArray(gateResults)) {
    throw new TypeError('buildMeshQualityPanel requires an array of gate results.');
  }
  requireText(context?.stageId, 'stageId');
  requireText(context?.meshProfileIdentity, 'meshProfileIdentity');
  const rows = gateResults.map((result, index) => toRow(result, index));
  const worst = rows.reduce(
    (current, row) => (SEVERITY[row.status] > SEVERITY[current] ? row.status : current),
    'OK',
  );
  return Object.freeze({
    stageId: context.stageId,
    meshProfileIdentity: context.meshProfileIdentity,
    rows: Object.freeze(rows),
    worstStatus: worst,
    blocksAdvance: worst === 'BLOCK',
    counts: Object.freeze({
      ok: rows.filter((row) => row.status === 'OK').length,
      warning: rows.filter((row) => row.status === 'WARNING').length,
      block: rows.filter((row) => row.status === 'BLOCK').length,
    }),
  });
}

function toRow(result, index) {
  const path = `meshQuality.gateResults[${index}]`;
  const metric = result?.metric;
  if (typeof metric !== 'string' || !metric) {
    throw new TypeError(`${path}.metric is required.`);
  }
  if (!Object.hasOwn(METRIC_LABELS, metric)) {
    throw new TypeError(`${path}.metric is not a known mesh-quality metric: ${metric}`);
  }
  if (typeof result.value !== 'number' || !Number.isFinite(result.value)) {
    throw new TypeError(`${path}.value must be a finite number.`);
  }
  if (!Object.hasOwn(SEVERITY, result.status)) {
    throw new TypeError(`${path}.status must be OK, WARNING or BLOCK.`);
  }
  return Object.freeze({
    metric,
    label: METRIC_LABELS[metric],
    value: result.value,
    unit: METRIC_UNITS[metric],
    status: result.status,
    threshold: thresholdOf(result),
    sourcePath: `${path}.value`,
  });
}

function thresholdOf(result) {
  const declared = ['minimum', 'minimumMultiple', 'maximumMultiple']
    .filter((key) => typeof result[key] === 'number')
    .map((key) => `${key}=${result[key]}`);
  return declared.length ? declared.join(' ') : null;
}

/** The single place callers ask whether retained mesh evidence blocks advance. */
export function panelBlocksAdvance(panel) {
  return panel.blocksAdvance === true;
}

function requireText(value, key) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`buildMeshQualityPanel requires a ${key}.`);
  }
}

/**
 * Render retained mesh-quality evidence.
 *
 * `options.documentValue.meshConfig`, when present, is displayed only as an
 * unapplied workbench preference. It is not represented as a produced mesh or
 * as quality evidence.
 *
 * @param {Element} rootElement Target DOM host.
 * @param {object|null} panel Retained panel model or null.
 * @param {{stageId?: string, documentValue?: object}} options Display context.
 */
export function renderMeshQualityPanel(rootElement, panel, options = {}) {
  if (!rootElement) return;
  rootElement.replaceChildren();
  const documentRef = rootElement.ownerDocument;
  const container = documentRef.createElement('div');
  container.className = 'lafea-mesh-quality-panel';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'LAFEA retained mesh quality evidence');

  const stageId = options.stageId || panel?.stageId || 'UNKNOWN';
  const title = documentRef.createElement('h4');
  title.textContent = `Mesh quality evidence — Stage ${stageId}`;
  container.append(title);

  const meshConfig = options.documentValue?.meshConfig;
  if (meshConfig && typeof meshConfig === 'object') {
    const preference = documentRef.createElement('p');
    preference.className = 'lafea-mesh-quality-panel__neutral';
    preference.textContent = `Retained workbench mesh preference: ${summarizeConfig(meshConfig)}. `
      + 'This preference is not connected to a qualified stage mesh compiler and does not constitute mesh evidence.';
    container.append(preference);
  }

  if (!panel) {
    const neutral = documentRef.createElement('p');
    neutral.className = 'lafea-mesh-quality-panel__neutral';
    neutral.textContent = 'No retained mesh-quality result is available. No numerical quality status is asserted.';
    container.append(neutral);
    rootElement.append(container);
    return;
  }

  const header = documentRef.createElement('div');
  header.className = 'lafea-mesh-quality-panel__header';
  const profile = documentRef.createElement('p');
  profile.textContent = `Retained mesh profile: ${panel.meshProfileIdentity}`;
  header.append(profile);
  if (panel.blocksAdvance) {
    const badge = documentRef.createElement('span');
    badge.className = 'lafea-mesh-quality-panel__badge-block';
    badge.setAttribute('role', 'alert');
    badge.textContent = 'MESH QUALITY BLOCKS ADVANCE';
    header.append(badge);
  }

  const list = documentRef.createElement('ul');
  list.className = 'lafea-mesh-quality-panel__list';
  for (const row of panel.rows) {
    const item = documentRef.createElement('li');
    item.className = `lafea-mesh-quality-panel__row lafea-mesh-quality-panel__row--${row.status.toLowerCase()}`;
    const threshold = row.threshold ? `; retained gate ${row.threshold}` : '';
    item.textContent = `${row.label}: ${row.value} ${row.unit}${threshold} [${row.status}]`;
    item.dataset.sourcePath = row.sourcePath;
    list.append(item);
  }

  container.append(header, list);
  rootElement.append(container);
}

function summarizeConfig(meshConfig) {
  const entries = Object.entries(meshConfig)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `${key}=${value}`);
  return entries.length ? entries.join(', ') : 'unclassified settings';
}
