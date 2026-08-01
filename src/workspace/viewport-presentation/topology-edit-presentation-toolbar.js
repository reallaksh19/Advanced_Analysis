import { PRESENTATION_BASIS_STATUS, topologyEditPresentationActions } from './topology-edit-presentation-contract.js';

const ACTIONS = topologyEditPresentationActions();

export class TopologyEditPresentationToolbar {
  constructor({ onAction } = {}) {
    if (typeof onAction !== 'function') throw new TypeError('TopologyEditPresentationToolbar requires onAction.');
    this.onAction = onAction;
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
    this.state = state;
    setChecked(this.host, 'source-visible', state.sourceVisible);
    setChecked(this.host, 'draft-visible', state.draftVisible);
    setValue(this.host, 'source-opacity', state.sourceOpacity);
    setValue(this.host, 'draft-opacity', state.draftOpacity);
    setText(this.host, 'presentation-basis-status', basisLabel(state.basisStatus));
    setTitle(this.host, 'presentation-basis-status', basisTitle(state));
    setTitle(this.host, 'presentation-policy-info', policyTitle(state));
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
    if (!event.target?.closest?.('[data-action="reset-presentation"]')) return;
    this.onAction({ type: ACTIONS.RESET });
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
      <button type="button" data-action="reset-presentation">Reset</button>
      <span role="img" aria-label="Presentation policy information" data-role="presentation-policy-info">ⓘ</span>
      <output data-role="presentation-basis-status" aria-live="polite"></output>
    </fieldset>`;
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

function policyTitle(state) {
  return `${state.policy.disclosure} Defaults: source opacity ${state.policy.sourceOpacity}, draft opacity ${state.policy.draftOpacity}.`;
}

function basisTitle(state) {
  const missing = Object.entries(state.basis)
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  return missing.length ? `Unavailable basis fields: ${missing.join(', ')}.` : 'All presentation basis hashes are available.';
}

function basisLabel(status) {
  if (status === PRESENTATION_BASIS_STATUS.CURRENT) return 'Basis: current';
  if (status === PRESENTATION_BASIS_STATUS.STALE) return 'Basis: stale';
  return 'Basis: incomplete';
}

function setChecked(host, name, checked) {
  const input = host.querySelector(`[data-presentation-control="${name}"]`);
  if (input) input.checked = Boolean(checked);
}

function setValue(host, name, value) {
  const input = host.querySelector(`[data-presentation-control="${name}"]`);
  if (input) input.value = String(value);
}

function setText(host, role, value) {
  const element = host.querySelector(`[data-role="${role}"]`);
  if (element) element.textContent = value;
}

function setTitle(host, role, value) {
  const element = host.querySelector(`[data-role="${role}"]`);
  if (element) element.title = value;
}
