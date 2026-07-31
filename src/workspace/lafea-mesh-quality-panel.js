/**
 * LAFEA mesh-quality panel (spec §10.3): surfaces the mesh-control gate
 * table as display rows, shared by LAFEA.3 (continuum) and LAFEA.4 (shell).
 *
 * This module is presentation only. It classifies nothing and recomputes
 * nothing — every `status` and `value` it renders comes verbatim from
 * `lafea-meshing/quality-gates.js` results the caller already produced
 * against a declared `meshProfile`. Re-deriving a threshold here would
 * create a second, divergent copy of the gate table, which the spec's
 * "never weaken a stated gate" rule forbids.
 *
 * A BLOCK row is rendered verbatim and never softened to a warning
 * (`SINGULARITY_SUSPECTED`-class invariant); `panelBlocksAdvance` is the
 * single place callers ask whether the mesh may advance.
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
 * Builds the panel model from gate results.
 *
 * @param {readonly object[]} gateResults Frozen results from `quality-gates.js`.
 * @param {{stageId: string, meshProfileIdentity: string}} context
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
    // Fail closed: an unrecognised metric must not be rendered as if it were
    // understood and gated, since the panel could not label or unit it.
    throw new TypeError(`${path}.metric is not a known §10.3 gate metric: ${metric}`);
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
    // Threshold provenance, when the producing gate carried it. Rendered as
    // supplied; never defaulted to a number this module invents.
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

/** The single place callers ask whether mesh quality blocks stage advancement. */
export function panelBlocksAdvance(panel) {
  return panel.blocksAdvance === true;
}

function requireText(value, key) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`buildMeshQualityPanel requires a ${key}.`);
  }
}

/**
 * Render the mesh quality panel into a DOM host element without production mocks.
 *
 * @param {Element} rootElement Target DOM host.
 * @param {object|null} panel Frozen panel model from buildMeshQualityPanel, or null if uninitialized.
 * @returns {void}
 */
export function renderMeshQualityPanel(rootElement, panel) {
  if (!rootElement) return;
  rootElement.replaceChildren();
  const documentRef = rootElement.ownerDocument;
  const container = documentRef.createElement('div');
  container.className = 'lafea-mesh-quality-panel';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'LAFEA Mesh Quality and Stress Probe Inspector');

  if (!panel) {
    const neutralMessage = documentRef.createElement('p');
    neutralMessage.className = 'lafea-mesh-quality-panel__neutral';
    neutralMessage.textContent = '🔬 AUTODESK SIMULATION MESH QUALITY & PROBE: No mesh quality results evaluated for this stage. Execute calculation or select a mesh element to review Jacobian, Aspect Ratio, and Skewness metrics against kernel thresholds.';
    container.append(neutralMessage);
    rootElement.append(container);
    return;
  }

  const header = documentRef.createElement('div');
  header.className = 'lafea-mesh-quality-panel__header';
  const title = documentRef.createElement('h4');
  title.textContent = `Mesh Quality Gates — Stage ${panel.stageId} (Profile: ${panel.meshProfileIdentity})`;
  header.append(title);

  if (panel.blocksAdvance) {
    const blockBadge = documentRef.createElement('span');
    blockBadge.className = 'lafea-mesh-quality-panel__badge-block';
    blockBadge.setAttribute('role', 'alert');
    blockBadge.textContent = '⛔ MESH QUALITY BLOCKS ADVANCE';
    header.append(blockBadge);
  }

  const list = documentRef.createElement('ul');
  list.className = 'lafea-mesh-quality-panel__list';
  for (const row of panel.rows) {
    const item = documentRef.createElement('li');
    item.className = `lafea-mesh-quality-panel__row lafea-mesh-quality-panel__row--${row.status.toLowerCase()}`;
    const thresholdText = row.threshold ? ` [Gate: ${row.threshold}]` : '';
    item.textContent = `${row.label}: ${row.value} ${row.unit}${thresholdText} ──► [${row.status}]`;
    list.append(item);
  }

  container.append(header, list);
  rootElement.append(container);
}
