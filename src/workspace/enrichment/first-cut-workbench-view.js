/**
 * Functionality: Renders the accessible bulk-enrichment, preflight, and
 * calculation-basis UI. All calculations are delegated to the controller.
 */

const TABS = Object.freeze([
  ['PIPING_CLASS_BORE', 'Piping Class / Section Evidence'],
  ['COMPONENT_TYPE_BORE', 'Component Mass'],
  ['SUPPORT_KIND', 'Support Restraint'],
  ['PROFILE', 'Screening Profile & Approved Assumptions'],
]);

export function renderFirstCutWorkbench(host, snapshot, handlers) {
  host.replaceChildren();
  const doc = host.ownerDocument;
  const card = element(doc, 'section', 'first-cut-workbench');
  card.dataset.role = 'first-cut-workbench';
  card.append(header(doc, snapshot), tabBar(doc, snapshot, handlers));
  card.append(snapshot.activeTab === 'PROFILE'
    ? profileTab(doc, snapshot, handlers)
    : bindingsTab(doc, snapshot, handlers));
  card.append(actionBar(doc, handlers));
  if (snapshot.error) card.append(message(doc, snapshot.error, 'error'));
  if (snapshot.message) card.append(message(doc, snapshot.message, 'message'));
  if (snapshot.preflight) card.append(preflightDialog(doc, snapshot.preflight, handlers));
  if (snapshot.calculationPackage && snapshot.basisVisible) {
    card.append(calculationBasis(doc, snapshot.calculationPackage, snapshot.stale, handlers));
  }
  host.append(card);
}

function header(doc, snapshot) {
  const wrapper = element(doc, 'header', 'first-cut-workbench__header');
  wrapper.append(
    text(doc, 'h3', 'First-Cut Piping Load Estimation'),
    text(doc, 'p', 'Screening only. Thermal, guide, line-stop, anchor, nozzle, contact and code compliance require LFEA.'),
  );
  const counts = statusCounts(snapshot);
  wrapper.append(text(doc, 'output', `Qualified ${counts.qualified} · Conditional ${counts.conditional} · Blocked ${counts.blocked} · Escalate ${counts.escalate}`));
  return wrapper;
}

function tabBar(doc, snapshot, handlers) {
  const bar = element(doc, 'div', 'first-cut-tabs');
  bar.setAttribute('role', 'tablist');
  TABS.forEach(([id, label]) => {
    const button = actionButton(doc, label, () => handlers.onTab(id));
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(snapshot.activeTab === id));
    button.classList.toggle('is-active', snapshot.activeTab === id);
    bar.append(button);
  });
  return bar;
}

function bindingsTab(doc, snapshot, handlers) {
  const section = element(doc, 'section', 'first-cut-tab-panel');
  section.setAttribute('role', 'tabpanel');
  section.append(text(doc, 'p', 'One accepted row applies to every matching entity. Empty or conflicting evidence remains blocked.'));
  const kinds = selectorKindsForPanel(snapshot.activeTab);
  const records = combinedBindings(snapshot).filter((row) => kinds.includes(row.selectorKind)
    && (row.selectorKind !== 'ENTITY' || fieldsFor(snapshot.activeTab).includes(row.fieldId)));
  section.append(bindingTable(doc, records, handlers), addBindingForm(doc, snapshot.activeTab, handlers));
  return section;
}

function bindingTable(doc, records, handlers) {
  const table = element(doc, 'table', 'first-cut-table');
  const head = doc.createElement('thead'), headerRow = doc.createElement('tr');
  ['ID', 'Selector', 'Field', 'Value', 'Unit', 'Source', 'Authority', ''].forEach((label) => headerRow.append(text(doc, 'th', label)));
  head.append(headerRow); table.append(head);
  const body = doc.createElement('tbody');
  records.forEach((row) => {
    const tr = doc.createElement('tr');
    [row.recordId, row.selectorKey, row.fieldId, row.value, row.unit, `${row.sourceId}@${row.revision}`, row.authorityLevel]
      .forEach((value) => tr.append(text(doc, 'td', value)));
    const cell = doc.createElement('td');
    if (['ACCEPTED_OVERRIDE', 'USER_APPROVED_APPROXIMATION'].includes(row.authorityLevel)) {
      cell.append(actionButton(doc, 'Remove', () => handlers.onRemoveBinding(row.recordId)));
    }
    tr.append(cell); body.append(tr);
  });
  if (!records.length) {
    const tr = doc.createElement('tr'), td = text(doc, 'td', 'No sidecar records in this group.');
    td.colSpan = 8; tr.append(td); body.append(tr);
  }
  table.append(body);
  return table;
}

function addBindingForm(doc, selectorKind, handlers) {
  const form = element(doc, 'form', 'first-cut-binding-form');
  form.setAttribute('aria-label', 'Add accepted override');
  const recordId = input(doc, 'text', 'Record ID');
  const selectorKindControl = select(doc, selectorKindsForPanel(selectorKind)
    .map((value) => [value, value === 'ENTITY' ? 'Exact entity' : value]));
  const authority = select(doc, [
    ['ACCEPTED_OVERRIDE', 'Accepted override'],
    ['USER_APPROVED_APPROXIMATION', 'User-approved approximation'],
  ]);
  const selectorKey = input(doc, 'text', 'Group selector key');
  const fieldId = select(doc, [
    ['', 'Select field'],
    ...fieldsForPanel(selectorKind).map((value) => [value, value]),
  ]);
  const value = input(doc, 'text', 'Value');
  const unit = input(doc, 'text', 'Unit or 1');
  const sourceId = input(doc, 'text', 'Source ID');
  const revision = input(doc, 'text', 'Revision');
  const add = actionButton(doc, 'Add accepted override', () => {
    handlers.onAddBinding({
      recordId: recordId.value, selectorKind: selectorKindControl.value, selectorKey: selectorKey.value,
      fieldId: fieldId.value, value: numericOrString(value.value), unit: unit.value,
      sourceId: sourceId.value, revision: revision.value, authorityLevel: authority.value,
    });
  });
  add.type = 'submit';
  form.addEventListener('submit', (event) => { event.preventDefault(); add.click(); });
  form.append(
    labelled(doc, 'Selector kind', selectorKindControl),
    labelled(doc, 'Authority', authority),
    recordId, selectorKey, fieldId, value, unit, sourceId, revision, add,
  );
  return form;
}

function profileTab(doc, snapshot, handlers) {
  const form = snapshot.profileForm;
  const section = element(doc, 'section', 'first-cut-profile-form');
  section.setAttribute('role', 'tabpanel');
  section.append(
    profileField(doc, 'Profile ID', 'profileId', form.profileId, handlers),
    profileSelect(doc, 'Method', 'methodId', form.methodId, handlers, [
      ['', 'Select method'],
      ['SIMPLE_SPAN_TRIBUTARY_VERTICAL_V1', 'W10.5 simple-span tributary'],
      ['CONTINUOUS_BEAM_GRAVITY_V1', 'Qualified continuous beam'],
    ]),
    loadCaseControls(doc, form.loadCaseIds, handlers),
    profileField(doc, 'Gravity (m/s²)', 'gravityAccelerationMPerS2', form.gravityAccelerationMPerS2, handlers, 'number'),
    profileSelect(doc, 'Gravity direction', 'gravityDirection', form.gravityDirection, handlers, [['', 'Select direction'], ['GRAVITY_DOWN', 'GRAVITY_DOWN']]),
    profileField(doc, 'Gravity source', 'gravitySource', form.gravitySource, handlers),
    profileField(doc, 'Geometry absolute tolerance (m)', 'geometryAbsoluteM', form.geometryAbsoluteM, handlers, 'number'),
    profileField(doc, 'Geometry relative tolerance', 'geometryRelative', form.geometryRelative, handlers, 'number'),
    profileField(doc, 'Force absolute tolerance (N)', 'forceAbsoluteN', form.forceAbsoluteN, handlers, 'number'),
    profileField(doc, 'Force relative tolerance', 'forceRelative', form.forceRelative, handlers, 'number'),
    profileField(doc, 'Moment absolute tolerance (N·m)', 'momentAbsoluteNm', form.momentAbsoluteNm, handlers, 'number'),
    profileField(doc, 'Moment relative tolerance', 'momentRelative', form.momentRelative, handlers, 'number'),
    checkboxField(doc, 'Request sag screening', 'sagRequested', form.sagRequested, handlers),
    profileField(doc, 'Sag criterion (m, optional)', 'sagMaximumM', form.sagMaximumM, handlers, 'number'),
    profileField(doc, 'Sag criterion source', 'sagSource', form.sagSource, handlers),
    checkboxField(doc, 'Request sustained screening', 'sustainedRequested', form.sustainedRequested, handlers),
    profileSelect(doc, 'Pressure formula', 'pressureFormulaId', form.pressureFormulaId, handlers, [
      ['', 'Select formula'],
      ['USER_AUTHORIZED_LONGITUDINAL_PRESSURE_V1', 'User-authorized longitudinal pressure v1'],
    ]),
    textareaField(doc, 'Explicit sustained-screening JSON', 'sustainedInputJson', form.sustainedInputJson, handlers),
    profileField(doc, 'Profile source', 'profileSource', form.profileSource, handlers),
    profileField(doc, 'CSV master source ID', 'masterSourceId', form.masterSourceId, handlers),
    profileField(doc, 'CSV master revision', 'masterRevision', form.masterRevision, handlers),
  );
  return section;
}

function actionBar(doc, handlers) {
  const bar = element(doc, 'footer', 'first-cut-actions');
  bar.append(
    actionButton(doc, 'Reset Staged', handlers.onReset),
    actionButton(doc, 'Import Master', handlers.onImportMaster),
    actionButton(doc, 'Export CSV', handlers.onExportCsv),
    actionButton(doc, 'Run First-Cut Screening', handlers.onPreflight, 'primary'),
  );
  return bar;
}

function preflightDialog(doc, preflight, handlers) {
  const dialog = element(doc, 'section', 'first-cut-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Pre-calculation audit and assumptions verification');
  dialog.append(text(doc, 'h4', 'Pre-Calculation Audit & Assumptions Verification'));
  dialog.append(
    text(doc, 'p', `${preflight.blockers.length} blockers · ${preflight.assumptionCount} accepted sidecar records`),
    text(doc, 'p', preflight.methodQualification),
  );
  const list = doc.createElement('ul');
  (preflight.blockers.length ? preflight.blockers : ['All requested inputs and method applicability checks are qualified.'])
    .forEach((item) => list.append(text(doc, 'li', item)));
  dialog.append(list);
  dialog.append(auditList(doc, 'Evidence bindings', preflight.evidence));
  dialog.append(auditList(doc, 'Proposed user-approved approximations', preflight.proposedApproximations));
  dialog.append(auditList(doc, 'Affected entities', preflight.affectedEntities));
  const actions = element(doc, 'div', 'first-cut-actions');
  const confirm = actionButton(doc, 'Confirm Assumptions & Perform Calc', handlers.onConfirm, 'primary');
  confirm.disabled = !preflight.canConfirm;
  actions.append(actionButton(doc, 'Return to Enrichment', handlers.onReturn), confirm);
  dialog.append(actions);
  return dialog;
}

function calculationBasis(doc, calculationPackage, stale, handlers) {
  const section = element(doc, 'section', 'first-cut-basis');
  section.dataset.role = 'first-cut-calculation-basis';
  const rows = calculationPackage.supportScreening?.supportResults
    || calculationPackage.beamScreening?.supportResults || [];
  const result = rows[0] || null;
  section.append(text(doc, 'h4', 'Support Calculation Basis & Load Breakdown'));
  const actions = element(doc, 'div', 'first-cut-actions');
  const copy = actionButton(doc, 'Copy Report', () => handlers.onCopyReport(result));
  const focus = actionButton(doc, 'Focus', () => handlers.onFocus(result));
  copy.disabled = !result || stale || calculationPackage.status === 'STALE';
  focus.disabled = !result;
  actions.append(copy, focus, actionButton(doc, 'Close', handlers.onCloseBasis));
  section.append(actions);
  const definition = doc.createElement('dl');
  [
    ['Status', stale ? 'STALE' : calculationPackage.status],
    ['Method', calculationPackage.method],
    ['Support', result?.supportId || 'No qualified support result'],
    ['Case', result?.loadCaseId || '—'],
    ['Result', result ? `${result.label}: ${forceValue(result)} N` : '—'],
    ['Source hash', calculationPackage.parentHashes.sourceSemanticHash],
    ['Profile hash', calculationPackage.parentHashes.profileSemanticHash],
    ['Thermal / interface loads', calculationPackage.notEvaluatedLabel],
  ].forEach(([term, value]) => { definition.append(text(doc, 'dt', term), text(doc, 'dd', value)); });
  section.append(definition);
  const massCase = calculationPackage.massLedger.cases
    .find((row) => row.loadCaseId === result?.loadCaseId) || null;
  section.append(text(doc, 'h5', 'Mass, gravity, and COG basis'));
  section.append(text(doc, 'pre', massCase ? JSON.stringify({
    loadCaseId: massCase.loadCaseId,
    massKg: massCase.massKg,
    weightN: massCase.weightN,
    cogM: massCase.cogM,
    qualification: massCase.qualification,
  }, null, 2) : 'No selected mass case.'));
  const sag = calculationPackage.supportScreening?.sag || calculationPackage.beamScreening?.sag;
  section.append(text(doc, 'h5', 'Beam / sag / sustained basis'));
  section.append(text(doc, 'pre', JSON.stringify({
    sag: sag ? { status: sag.status, maximumAbsoluteSagM: sag.maximumAbsoluteSagM } : null,
    sustained: calculationPackage.sustainedScreening
      ? {
        status: calculationPackage.sustainedScreening.status,
        screeningStressPa: calculationPackage.sustainedScreening.screeningStressPa,
        utilization: calculationPackage.sustainedScreening.utilization,
      } : null,
  }, null, 2)));
  section.append(auditList(doc, 'Parent hashes', Object.entries(calculationPackage.parentHashes)
    .map(([key, value]) => `${key}: ${value}`)));
  section.append(auditList(doc, 'Limitations', calculationPackage.limitations));
  section.append(auditList(doc, calculationPackage.notEvaluatedLabel, calculationPackage.notEvaluated));
  return section;
}

function auditList(doc, heading, items) {
  const wrapper = element(doc, 'section', 'first-cut-audit-list');
  wrapper.append(text(doc, 'h5', heading));
  const list = doc.createElement('ul');
  (items?.length ? items : ['None']).forEach((item) => list.append(text(doc, 'li', item)));
  wrapper.append(list);
  return wrapper;
}

function profileField(doc, label, key, value, handlers, type = 'text') {
  const control = input(doc, type, label); control.value = value;
  control.addEventListener('change', () => handlers.onProfileField(key, control.value));
  return labelled(doc, label, control);
}
function profileSelect(doc, label, key, value, handlers, options) {
  const control = select(doc, options); control.value = value;
  control.addEventListener('change', () => handlers.onProfileField(key, control.value));
  return labelled(doc, label, control);
}
function checkboxField(doc, label, key, checked, handlers) {
  const control = input(doc, 'checkbox', label); control.checked = checked;
  control.addEventListener('change', () => handlers.onProfileField(key, control.checked));
  return labelled(doc, label, control);
}
function textareaField(doc, label, key, value, handlers) {
  const control = doc.createElement('textarea'); control.rows = 5; control.value = value;
  control.addEventListener('change', () => handlers.onProfileField(key, control.value));
  return labelled(doc, label, control);
}
function loadCaseControls(doc, selected, handlers) {
  const group = element(doc, 'fieldset', 'first-cut-field');
  group.append(text(doc, 'legend', 'Load cases'));
  ['EMPTY', 'OPE', 'HYD'].forEach((id) => {
    const control = input(doc, 'checkbox', id); control.checked = selected.includes(id);
    control.addEventListener('change', () => {
      const next = control.checked ? [...selected, id] : selected.filter((value) => value !== id);
      handlers.onProfileField('loadCaseIds', [...new Set(next)].sort());
    });
    group.append(labelled(doc, id, control));
  });
  return group;
}

function input(doc, type, placeholder) { const node = doc.createElement('input'); node.type = type; node.placeholder = placeholder; return node; }
function select(doc, options) {
  const node = doc.createElement('select');
  options.forEach(([value, label]) => { const option = doc.createElement('option'); option.value = value; option.textContent = label; node.append(option); });
  return node;
}
function labelled(doc, label, control) { const wrapper = element(doc, 'label', 'first-cut-field'); wrapper.append(text(doc, 'span', label), control); return wrapper; }
function actionButton(doc, label, handler, kind = '') {
  const button = text(doc, 'button', label); button.type = 'button';
  if (kind) button.classList.add(`is-${kind}`);
  button.addEventListener('click', handler);
  return button;
}
function element(doc, tag, className) { const node = doc.createElement(tag); node.className = className; return node; }
function text(doc, tag, value) { const node = doc.createElement(tag); node.textContent = String(value); return node; }
function message(doc, value, kind) { const node = text(doc, 'p', value); node.className = `first-cut-${kind}`; node.setAttribute('role', kind === 'error' ? 'alert' : 'status'); return node; }
function numericOrString(value) { const number = Number(value); return value.trim() !== '' && Number.isFinite(number) ? number : value; }
function combinedBindings(snapshot) {
  return [
    ...snapshot.stagedBindings,
    ...(snapshot.masterData?.records || []).map((row) => ({ ...row, authorityLevel: 'AUTHORIZED_MASTER' })),
  ];
}
function fieldsFor(kind) {
  if (kind === 'PIPING_CLASS_BORE') return ['outerDiameterMm', 'wallThicknessMm', 'materialDensityKgM3', 'unitPipeWeightKgPerM', 'fluidDensityOpeKgM3', 'fluidDensityHydKgM3', 'insulationThicknessMm', 'insulationDensityKgM3', 'elasticModulusMpa', 'secondMomentAreaMm4', 'flexuralRigidityNm2'];
  if (kind === 'COMPONENT_TYPE_BORE') return ['componentWeightKg'];
  return ['verticalState', 'supportType', 'supportAvailabilitySensitivity'];
}
function selectorKindsForPanel(kind) {
  return [kind, 'ENTITY'];
}
function fieldsForPanel(kind) {
  return fieldsFor(kind);
}
function statusCounts(snapshot) {
  const status = snapshot.stale ? 'STALE' : snapshot.calculationPackage?.status;
  return {
    qualified: status === 'QUALIFIED_SCREENING' ? 1 : 0,
    conditional: status === 'CONDITIONAL' ? 1 : 0,
    blocked: status === 'BLOCKED' ? 1 : snapshot.preflight?.blockers.length || 0,
    escalate: status === 'ESCALATE' ? 1 : 0,
  };
}
function forceValue(result) { return result.screenedVerticalShareN ?? result.beamVerticalForceN ?? '—'; }
