import { TOPOLOGY_EDIT_COMPARISON_SCHEMA } from './topology-edit-comparison-model.js';

export function renderTopologyEditComparisonPanel(element, model) {
  if (!element) throw new TypeError('Comparison panel element is required.');
  element.innerHTML = topologyEditComparisonMarkup(model);
}

export function topologyEditComparisonMarkup(model) {
  if (model?.schema !== TOPOLOGY_EDIT_COMPARISON_SCHEMA) {
    throw new TypeError(`Comparison panel requires ${TOPOLOGY_EDIT_COMPARISON_SCHEMA}.`);
  }
  const changed = model.status === 'CHANGED';
  const rows = changed
    ? `<ol>${model.entries.slice(0, 100).map(entryMarkup).join('')}</ol>`
    : '<p>Source and draft canonical topology are identical.</p>';
  const overflow = model.entries.length > 100
    ? `<p>${model.entries.length - 100} additional changed object(s) omitted from the panel.</p>`
    : '';
  return `
    <header class="topology-edit-comparison__header">
      <strong>Source vs draft comparison</strong>
      <span title="Display-only comparison. Canonical command, persistence, calculation, and export authority are unchanged.">ⓘ</span>
      <div>
        <button type="button" data-action="focus-comparison"${changed ? '' : ' disabled'}>Focus changes</button>
        <button type="button" data-action="isolate-comparison"${changed ? '' : ' disabled'}>Isolate changes</button>
        <button type="button" data-action="show-all-comparison">Show all</button>
      </div>
    </header>
    <p><strong>${escapeHtml(model.measurementDisclosure)}</strong></p>
    <dl>
      ${row('Total changed', model.summary.totalChanged)}
      ${row('Added', model.summary.added)}
      ${row('Removed', model.summary.removed)}
      ${row('Modified', model.summary.modified)}
      ${row('Nodes / edges', `${model.summary.nodes} / ${model.summary.edges}`)}
      ${row('Supports / junctions', `${model.summary.supports} / ${model.summary.junctions}`)}
    </dl>
    ${rows}${overflow}
    <p>Comparison hash: <code>${escapeHtml(model.comparisonHash)}</code></p>`;
}

function entryMarkup(entry) {
  const movement = entry.objectKind === 'node' && entry.details.movement
    ? `; Δ=(${signed(entry.details.movement.delta.x)}, ${signed(entry.details.movement.delta.y)}, ${signed(entry.details.movement.delta.z)}) mm; distance=${format(entry.details.movement.distanceMm)} mm`
    : '';
  const endpoints = entry.objectKind === 'edge'
    ? `; source=${entry.details.sourceEndpointIds?.join('→') ?? 'UNAVAILABLE'}; draft=${entry.details.draftEndpointIds?.join('→') ?? 'UNAVAILABLE'}`
    : '';
  return `<li data-comparison-id="${escapeHtml(entry.canonicalId)}"><strong>${escapeHtml(entry.changeType)}</strong> ${escapeHtml(entry.objectKind)} ${escapeHtml(entry.canonicalId)}${escapeHtml(movement)}${escapeHtml(endpoints)}</li>`;
}
function row(label, value) { return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`; }
function signed(value) { const number = Number(value); return `${number > 0 ? '+' : ''}${format(number)}`; }
function format(value) { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString('en', { maximumFractionDigits: 3 }) : '—'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
