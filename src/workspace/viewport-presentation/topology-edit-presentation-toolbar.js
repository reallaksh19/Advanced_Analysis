import { PRESENTATION_BASIS_STATUS, topologyEditPresentationActions } from './topology-edit-presentation-contract.js';
import { topologyEditSectionSummary } from './topology-edit-section-model.js';
import { topologyEditVisibilitySummary } from './topology-edit-visibility-model.js';

const ACTIONS = topologyEditPresentationActions();
const SECTION_FIELDS = Object.freeze(['min-x', 'max-x', 'min-y', 'max-y', 'min-z', 'max-z']);

export class TopologyEditPresentationToolbar {
  constructor({ onAction, getSelectedCanonicalIds } = {}) {
    if (typeof onAction !== 'function') throw new TypeError('TopologyEditPresentationToolbar requires onAction.');
    if (typeof getSelectedCanonicalIds !== 'function') {
      throw new TypeError('TopologyEditPresentationToolbar requires getSelectedCanonicalIds.');
    }
    this.onAction = onAction;
    this.getSelectedCanonicalIds = getSelectedCanonicalIds;
    this.host = null;
    this.state = null;
    this.changeHandler = (event) => this.handleChange(event);
    this.clickHandler = (event) => this.handleClick(event);
  }

  mount(host, state) {
    if (!host) throw new TypeError('TopologyEditPresentationToolbar requires a host element.');
    this.destroy();
    this.host = host;
    this.host.innerHTML = toolbarMarkup();
    this.host.addEventListener('change', this.changeHandler);
    this.host.addEventListener('click', this.clickHandler);
    this.update(state);
  }

  update(state) {
    if (!this.host || !state) return;
    const previousSectionHash = this.state?.section?.sectionHash;
    this.state = state;
    updateLayerControls(this.host, state);
    updateVisibilityControls(this.host, state, this.getSelectedCanonicalIds());
    updateStatusControls(this.host, state);
    if (previousSectionHash !== state.section.sectionHash) syncSectionInputs(this.host, state.section.box);
  }

  destroy() {
    if (!this.host) return;
    this.host.removeEventListener('change', this.changeHandler);
    this.host.removeEventListener('click', this.clickHandler);
    this.host.replaceChildren();
    this.host = null;
    this.state = null;
  }

  handleChange(event) {
    const control = event.target?.closest?.('[data-presentation-control]');
    if (!control) return;
    const action = actionFromControl(control);
    if (action) this.onAction(action);
  }

  handleClick(event) {
    const button = event.target?.closest?.('[data-action]');
    if (!button) return;
    const action = actionFromButton(button, this);
    if (action) this.onAction(action);
  }
}

function toolbarMarkup() {
  return `
    <fieldset class="topology-edit-presentation" aria-label="3D presentation controls">
      <legend>Presentation</legend>
      <label><input type="checkbox" data-presentation-control="source-visible"> Source</label>
      <label>Source opacity <input type="range" min="0" max="1" step="0.05" data-presentation-control="source-opacity"></label>
      <label><input type="checkbox" data-presentation-control="draft-visible"> Draft</label>
      <label>Draft opacity <input type="range" min="0" max="1" step="0.05" data-presentation-control="draft-opacity"></label>
      <button type="button" data-action="hide-selected" title="Hide the selected canonical object in this viewport only.">Hide selected</button>
      <button type="button" data-action="isolate-selected" title="Show only the selected canonical object in this viewport. Command scope is unchanged.">Isolate selected</button>
      <button type="button" data-action="show-all" title="Clear canonical hide and isolate presentation filters.">Show all</button>
      ${sectionMarkup()}
      <button type="button" data-action="reset-presentation">Reset</button>
      <span role="img" aria-label="Presentation policy information" data-role="presentation-policy-info">ⓘ</span>
      <output data-role="presentation-visibility-status" aria-live="polite"></output>
      <output data-role="presentation-section-status" aria-live="polite"></output>
      <output data-role="presentation-basis-status" aria-live="polite"></output>
    </fieldset>`;
}

function sectionMarkup() {
  return `
    <details class="topology-edit-section-controls">
      <summary>Section box</summary>
      <span role="img" aria-label="Section box information" title="Section bounds are explicit engineering-coordinate display filters. They do not modify geometry, command scope, or export.">ⓘ</span>
      ${sectionInput('min-x', 'Min X')}${sectionInput('max-x', 'Max X')}
      ${sectionInput('min-y', 'Min Y')}${sectionInput('max-y', 'Max Y')}
      ${sectionInput('min-z', 'Min Z')}${sectionInput('max-z', 'Max Z')}
      <button type="button" data-action="apply-section-box">Apply section</button>
      <button type="button" data-action="clear-section-box">Clear section</button>
      <output data-role="presentation-section-input-status" aria-live="polite"></output>
    </details>`;
}

function sectionInput(name, label) {
  return `<label>${label} <input type="number" step="any" data-section-bound="${name}"></label>`;
}

function actionFromControl(control) {
  const name = control.dataset.presentationControl;
  if (name === 'source-visible' || name === 'draft-visible') {
    return { type: ACTIONS.VISIBILITY, layer: name.split('-')[0], visible: control.checked };
  }
  if (name === 'source-opacity' || name === 'draft-opacity') {
    return { type: ACTIONS.OPACITY, layer: name.split('-')[0], opacity: Number(control.value) };
  }
  return null;
}

function actionFromButton(button, toolbar) {
  const name = button.dataset.action;
  if (name === 'reset-presentation') return { type: ACTIONS.RESET };
  if (name === 'show-all') return { type: ACTIONS.SHOW_ALL_IDS };
  if (name === 'clear-section-box') return { type: ACTIONS.CLEAR_SECTION_BOX };
  if (name === 'apply-section-box') return sectionAction(toolbar.host);
  const canonicalIds = selectedCanonicalIds(toolbar.getSelectedCanonicalIds());
  if (!canonicalIds.length) return null;
  if (name === 'hide-selected') return { type: ACTIONS.HIDE_IDS, canonicalIds };
  if (name === 'isolate-selected') return { type: ACTIONS.ISOLATE_IDS, canonicalIds };
  return null;
}

function sectionAction(host) {
  const values = Object.fromEntries(SECTION_FIELDS.map((name) => [name, sectionValue(host, name)]));
  if (Object.values(values).some((value) => value === null)) {
    setText(host, 'presentation-section-input-status', 'Enter all six finite section bounds.');
    return null;
  }
  const box = {
    min: { x: values['min-x'], y: values['min-y'], z: values['min-z'] },
    max: { x: values['max-x'], y: values['max-y'], z: values['max-z'] },
  };
  if (!hasPositiveSectionExtent(box)) {
    setText(host, 'presentation-section-input-status', 'Each section maximum must be greater than its minimum.');
    return null;
  }
  setText(host, 'presentation-section-input-status', '');
  return { type: ACTIONS.SET_SECTION_BOX, box };
}

function hasPositiveSectionExtent(box) {
  return ['x', 'y', 'z'].every((axis) => box.max[axis] > box.min[axis]);
}

function sectionValue(host, name) {
  const input = host.querySelector(`[data-section-bound="${name}"]`);
  if (!input || input.value.trim() === '') return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function updateLayerControls(host, state) {
  setChecked(host, 'source-visible', state.sourceVisible);
  setChecked(host, 'draft-visible', state.draftVisible);
  setValue(host, 'source-opacity', state.sourceOpacity);
  setValue(host, 'draft-opacity', state.draftOpacity);
}

function updateVisibilityControls(host, state, selectedInput) {
  const selectedIds = selectedCanonicalIds(selectedInput);
  const summary = topologyEditVisibilitySummary(state.canonicalVisibility);
  setDisabled(host, 'hide-selected', selectedIds.length === 0);
  setDisabled(host, 'isolate-selected', selectedIds.length === 0);
  setText(host, 'presentation-visibility-status', visibilityLabel(summary));
}

function updateStatusControls(host, state) {
  const section = topologyEditSectionSummary(state.section);
  setText(host, 'presentation-section-status', section.active ? 'Section: active' : 'Section: off');
  setText(host, 'presentation-basis-status', basisLabel(state.basisStatus));
  setTitle(host, 'presentation-basis-status', basisTitle(state));
  setTitle(host, 'presentation-policy-info', policyTitle(state));
}

function syncSectionInputs(host, box) {
  const values = box ? {
    'min-x': box.min.x, 'max-x': box.max.x,
    'min-y': box.min.y, 'max-y': box.max.y,
    'min-z': box.min.z, 'max-z': box.max.z,
  } : {};
  SECTION_FIELDS.forEach((name) => setSectionValue(host, name, values[name]));
}

function selectedCanonicalIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function policyTitle(state) {
  return `${state.policy.disclosure} Defaults: source opacity ${state.policy.sourceOpacity}, draft opacity ${state.policy.draftOpacity}.`;
}

function basisTitle(state) {
  const missing = Object.entries(state.basis).filter(([, value]) => value === null).map(([key]) => key);
  return missing.length ? `Unavailable basis fields: ${missing.join(', ')}.` : 'All presentation basis hashes are available.';
}

function basisLabel(status) {
  if (status === PRESENTATION_BASIS_STATUS.CURRENT) return 'Basis: current';
  if (status === PRESENTATION_BASIS_STATUS.STALE) return 'Basis: stale';
  return 'Basis: incomplete';
}

function visibilityLabel(summary) {
  if (summary.isolatedCount) return `Isolated: ${summary.isolatedCount}`;
  if (summary.hiddenCount) return `Hidden: ${summary.hiddenCount}`;
  return 'Visibility: all';
}

function setChecked(host, name, checked) {
  const input = host.querySelector(`[data-presentation-control="${name}"]`);
  if (input) input.checked = Boolean(checked);
}

function setValue(host, name, value) {
  const input = host.querySelector(`[data-presentation-control="${name}"]`);
  if (input) input.value = String(value);
}

function setSectionValue(host, name, value) {
  const input = host.querySelector(`[data-section-bound="${name}"]`);
  if (input) input.value = value == null ? '' : String(value);
}

function setDisabled(host, action, disabled) {
  const button = host.querySelector(`[data-action="${action}"]`);
  if (button) button.disabled = Boolean(disabled);
}

function setText(host, role, value) {
  const element = host.querySelector(`[data-role="${role}"]`);
  if (element) element.textContent = value;
}

function setTitle(host, role, value) {
  const element = host.querySelector(`[data-role="${role}"]`);
  if (element) element.title = value;
}
