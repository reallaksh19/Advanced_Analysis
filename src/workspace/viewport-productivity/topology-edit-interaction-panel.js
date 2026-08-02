import { formatTopologyEditMm } from '../viewport-interaction/topology-edit-numeric-entry.js';

export function renderTopologyEditInteractionPanel(element, options = {}) {
  if (!element) throw new TypeError('Topology-edit interaction panel element is required.');
  element.innerHTML = topologyEditInteractionPanelMarkup(options);
}

export function topologyEditInteractionPanelMarkup({
  context = null,
  runtimeState = null,
  acceptance = null,
  error = null,
  nudgeIncrementMm = 1,
} = {}) {
  const preview = runtimeState?.preview ?? null;
  const selected = Boolean(context?.nodeId);
  const applicable = Boolean(preview?.canApply);
  const anchor = context?.anchorPosition ?? { x: 0, y: 0, z: 0 };
  return `
    <header class="topology-edit-interaction__header">
      <strong>Professional node interaction</strong>
      <span title="Display-only preview; Apply delegates to the existing certified MOVE_NODE session path.">ⓘ</span>
    </header>
    <div class="topology-edit-interaction__body">
      ${error ? `<p role="alert"><strong>Interaction blocked:</strong> ${escapeHtml(error)}</p>` : ''}
      <dl class="topology-edit-interaction__summary">
        ${summaryRow('Selected node', context?.nodeId ?? 'Select one exact node')}
        ${summaryRow('Basis', context?.basisHash ?? '—')}
        ${summaryRow('Anchor X/Y/Z (mm)', pointText(anchor))}
        ${summaryRow('Runtime hash', runtimeState?.runtimeHash ?? '—')}
        ${summaryRow('Preview hash', preview?.previewHash ?? '—')}
        ${summaryRow('Acceptance hash', acceptance?.acceptanceHash ?? '—')}
      </dl>
      <fieldset${selected ? '' : ' disabled'}>
        <legend>Exact numeric preview</legend>
        <label>Entry mode
          <select data-role="interaction-entry-mode">
            <option value="ABSOLUTE">Absolute X/Y/Z</option>
            <option value="DELTA" selected>Delta X/Y/Z</option>
            <option value="MAGNITUDE">Axis magnitude</option>
          </select>
        </label>
        <div class="topology-edit-interaction__xyz">
          ${numberInput('X (mm)', 'interaction-value-x', 0)}
          ${numberInput('Y (mm)', 'interaction-value-y', 0)}
          ${numberInput('Z (mm)', 'interaction-value-z', 0)}
        </div>
        <div class="topology-edit-interaction__magnitude">
          ${numberInput('Magnitude (mm)', 'interaction-magnitude', 0)}
          <label>Axis
            <select data-role="interaction-axis">
              <option value="X">X</option>
              <option value="Y">Y</option>
              <option value="Z">Z</option>
            </select>
          </label>
        </div>
        <button type="button" data-action="preview-professional-interaction">Preview</button>
      </fieldset>
      <fieldset${selected ? '' : ' disabled'}>
        <legend>Keyboard and button nudge</legend>
        ${numberInput('Increment (mm)', 'interaction-nudge-increment', nudgeIncrementMm)}
        <div class="topology-edit-interaction__nudges" role="group" aria-label="Node nudge controls">
          ${nudgeButton('−X', 'X', -1)}${nudgeButton('+X', 'X', 1)}
          ${nudgeButton('−Y', 'Y', -1)}${nudgeButton('+Y', 'Y', 1)}
          ${nudgeButton('−Z', 'Z', -1)}${nudgeButton('+Z', 'Z', 1)}
        </div>
        <p class="topology-edit-interaction__hint">Keyboard: X, Y or Z nudges positive; hold Shift to reverse. Escape cancels. Enter applies a current preview.</p>
      </fieldset>
      ${previewMarkup(preview)}
      <div class="topology-edit-interaction__actions">
        <button type="button" data-action="apply-professional-interaction"${applicable ? '' : ' disabled'}>Apply certified move</button>
        <button type="button" data-action="cancel-professional-interaction"${preview ? '' : ' disabled'}>Cancel preview</button>
      </div>
    </div>`;
}

function previewMarkup(preview) {
  if (!preview) return '<p>No interaction preview is active.</p>';
  return `
    <section aria-label="Current display-only interaction preview">
      <h4>Display-only preview</h4>
      <dl>
        ${summaryRow('Node', preview.nodeId)}
        ${summaryRow('Target X/Y/Z (mm)', pointText(preview.targetPosition))}
        ${summaryRow('Delta X/Y/Z (mm)', pointText(preview.delta))}
        ${summaryRow('Intent hash', preview.intentHash)}
        ${summaryRow('Preview authority', preview.authority)}
        ${summaryRow('Pickable', String(preview.pickable))}
      </dl>
    </section>`;
}
function numberInput(label, role, value) {
  return `<label>${escapeHtml(label)}
    <input type="text" inputmode="decimal" autocomplete="off" data-role="${escapeHtml(role)}" value="${escapeHtml(formatTopologyEditMm(Number(value)))}">
  </label>`;
}
function nudgeButton(label, axis, sign) {
  return `<button type="button" data-action="nudge-professional-interaction" data-axis="${axis}" data-sign="${sign}">${label}</button>`;
}
function summaryRow(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}
function pointText(point) {
  return ['x', 'y', 'z'].map((key) => formatTopologyEditMm(Number(point?.[key] ?? 0))).join(', ');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
