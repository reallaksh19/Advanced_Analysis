export function renderSupportRestraintSummary(
  documentRef,
  attachmentModel,
  restraintModel,
  status = {},
  toleranceValue = '',
) {
  const section = documentRef.createElement('section');
  section.className = 'support-restraint-summary analysis-capability';
  section.dataset.role = 'support-restraint-card';
  section.setAttribute('aria-label', 'Support attachment and restraint capability');
  section.append(heading(documentRef));
  if (!attachmentModel || !restraintModel) return renderEmpty(documentRef, section);
  section.append(summaryGrid(documentRef, attachmentModel, restraintModel));
  section.append(profileLine(documentRef, attachmentModel, restraintModel));
  section.append(toleranceControl(documentRef, toleranceValue, attachmentModel.profile.lengthUnit));
  section.append(actions(documentRef));
  const output = statusLine(documentRef, status);
  if (output) section.append(output);
  return section;
}

function heading(documentRef) {
  const header = documentRef.createElement('header');
  const eyebrow = documentRef.createElement('span');
  eyebrow.className = 'panel-eyebrow';
  eyebrow.textContent = 'Support/restraint foundation';
  const title = documentRef.createElement('h3');
  title.textContent = 'Attachment & Restraint Health';
  header.append(eyebrow, title);
  return header;
}

function renderEmpty(documentRef, section) {
  const empty = documentRef.createElement('p');
  empty.className = 'panel-empty';
  empty.textContent = 'Import a dataset and build topology to inspect supports.';
  section.append(empty);
  return section;
}

function summaryGrid(documentRef, attachmentModel, restraintModel) {
  const grid = documentRef.createElement('dl');
  grid.className = 'shared-model-summary__grid';
  const attachment = attachmentModel.attachmentAudit.summary;
  const restraint = restraintModel.restraintAudit.summary;
  const rows = [
    ['Supports', attachment.supportCount],
    ['Attached', attachment.attachedCount],
    ['Ambiguous', attachment.ambiguousCount],
    ['Unattached', attachment.unattachedCount],
    ['Invalid positions', attachment.invalidPositionCount],
    ['Identity conflicts', attachment.identityConflictCount],
    ['Unit blocked', attachment.unitBlockedCount],
    ['Explicit restraints', restraint.explicitlyResolvedCount],
    ['Type classified', restraint.typeClassifiedCount],
    ['Unresolved', restraint.unresolvedCount],
  ];
  rows.forEach(([label, value]) => grid.append(term(documentRef, label), detail(documentRef, value)));
  return grid;
}

function profileLine(documentRef, attachmentModel, restraintModel) {
  const line = documentRef.createElement('p');
  line.dataset.role = 'support-restraint-active-profiles';
  line.className = 'shared-model-summary__hash';
  line.textContent = `Profiles: ${attachmentModel.profile.profileId} · ${restraintModel.profile.profileId}`;
  return line;
}

function toleranceControl(documentRef, value, unit) {
  const label = documentRef.createElement('label');
  label.className = 'support-restraint-summary__tolerance';
  label.textContent = `Projection tolerance (${unit})`;
  const input = documentRef.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = 'any';
  input.value = value;
  input.dataset.role = 'support-restraint-tolerance';
  input.setAttribute('aria-label', `Support projection tolerance in ${unit}`);
  label.append(input);
  return label;
}

function actions(documentRef) {
  const group = documentRef.createElement('div');
  group.className = 'support-restraint-summary__actions';
  group.append(
    actionButton(documentRef, 'evidence', 'Rebuild Evidence Attachments'),
    actionButton(documentRef, 'projection', 'Rebuild With Projection'),
    actionButton(documentRef, 'export', 'Export Support/Restraint Model'),
  );
  return group;
}

function actionButton(documentRef, action, label) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.supportRestraintAction = action;
  button.textContent = label;
  return button;
}

function statusLine(documentRef, status) {
  if (!status.state) return null;
  const output = documentRef.createElement('output');
  output.dataset.role = 'support-restraint-status';
  output.textContent = statusText(status);
  return output;
}

function statusText(status) {
  if (status.state === 'rebuilt') return `Rebuilt ${status.profileId}`;
  if (status.state === 'exported') return `Exported ${status.filename} (${status.byteLength} bytes)`;
  return status.message;
}

function term(documentRef, value) {
  const element = documentRef.createElement('dt');
  element.textContent = value;
  return element;
}

function detail(documentRef, value) {
  const element = documentRef.createElement('dd');
  element.textContent = String(value);
  return element;
}
