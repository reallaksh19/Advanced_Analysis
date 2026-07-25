export function renderAnalysisSession(documentRef, session) {
  const section = documentRef.createElement('section');
  section.className = 'analysis-session';
  section.dataset.role = 'analysis-session';
  if (!session) return section;

  const professional = session.workspaceReadiness;
  const readyToRun = professional?.readyToRun ?? session.readiness.enabled;
  const header = documentRef.createElement('header');
  const heading = documentRef.createElement('h3');
  heading.textContent = 'Reviewed analysis inputs';
  const identity = documentRef.createElement('small');
  identity.textContent = `${session.sessionId} · v${session.version}`;
  header.append(heading, identity);
  section.append(header);

  if (professional) {
    const method = documentRef.createElement('p');
    method.className = 'analysis-session__method';
    method.dataset.role = 'analysis-session-method';
    method.textContent = `${professional.solverId} v${professional.solverVersion} · ${professional.methodId} v${professional.methodVersion} · ${professional.engineeringLevel}`;
    section.append(method);
  }

  const readiness = documentRef.createElement('output');
  readiness.className = `analysis-session__readiness analysis-session__readiness--${readyToRun ? 'ready' : 'draft'}`;
  readiness.dataset.role = 'analysis-session-readiness';
  readiness.textContent = readyToRun
    ? 'Ready for reviewed execution'
    : professional?.diagnostics?.[0]?.message || session.readiness.reason || 'Additional reviewed inputs are required.';
  section.append(readiness);

  const fieldList = documentRef.createElement('div');
  fieldList.className = 'analysis-session__fields';
  session.inputs.forEach((field) => fieldList.append(renderField(documentRef, session, field)));
  section.append(fieldList);

  const actions = documentRef.createElement('div');
  actions.className = 'analysis-session__actions';
  actions.append(
    actionButton(documentRef, 'run', `Run reviewed analysis · ${session.analysisType}`, {
      disabled: !readyToRun || session.status === 'running',
      primary: true,
    }),
    actionButton(documentRef, 'reset', 'Reset reviewed overrides', {
      disabled: Object.keys(session.overrides).length === 0,
    }),
    actionButton(documentRef, 'close', 'Close input review'),
  );
  actions.querySelectorAll('button').forEach((button) => {
    button.dataset.sessionId = session.sessionId;
  });
  section.append(actions);

  const status = documentRef.createElement('p');
  status.className = 'analysis-session__status';
  status.dataset.role = 'analysis-session-status';
  status.textContent = sessionStatus(session, readyToRun);
  section.append(status);
  return section;
}

function renderField(documentRef, session, field) {
  const row = documentRef.createElement('label');
  row.className = `analysis-session-field analysis-session-field--${field.source}`;
  row.dataset.fieldKey = field.key;

  const heading = documentRef.createElement('span');
  heading.className = 'analysis-session-field__label';
  heading.textContent = field.unit ? `${field.label} (${field.unit})` : field.label;
  const source = documentRef.createElement('em');
  source.className = 'analysis-session-field__source';
  source.textContent = field.source;
  heading.append(source);
  row.append(heading);

  if (field.editable) {
    const input = documentRef.createElement('input');
    input.type = field.kind === 'number' ? 'number' : 'text';
    if (field.kind === 'number') input.step = 'any';
    input.dataset.sessionField = field.key;
    input.dataset.sessionId = session.sessionId;
    input.value = displayInputValue(session, field);
    input.placeholder = field.source === 'missing' ? 'Enter reviewed value' : 'Override value';
    input.setAttribute('aria-label', field.label);
    row.append(input);
  } else {
    const value = documentRef.createElement('strong');
    value.textContent = field.value == null ? 'Unavailable' : String(field.value);
    row.append(value);
  }

  const evidence = documentRef.createElement('small');
  evidence.textContent = field.sourcePath || 'No source evidence';
  row.append(evidence);

  const errorText = session.fieldErrors?.[field.key];
  if (errorText) {
    const error = documentRef.createElement('span');
    error.className = 'analysis-session-field__error';
    error.textContent = errorText;
    row.append(error);
  }
  return row;
}

function actionButton(documentRef, action, text, options = {}) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.sessionAction = action;
  button.textContent = text;
  button.disabled = options.disabled === true;
  button.className = options.primary ? 'analysis-action' : 'analysis-session__secondary';
  return button;
}

function displayInputValue(session, field) {
  if (Object.prototype.hasOwnProperty.call(session.overrides, field.key)) {
    return String(session.overrides[field.key]);
  }
  return field.value == null ? '' : String(field.value);
}

function sessionStatus(session, readyToRun) {
  if (session.status === 'running') return 'Reviewed analysis is running…';
  if (session.status === 'completed') return `Completed · ${session.result?.status || 'UNKNOWN'}`;
  if (session.status === 'failed') return `${session.failure?.code || 'FAILED'}: ${session.failure?.message || 'Analysis failed.'}`;
  if (readyToRun) return 'Inputs reviewed and ready. Execution remains manual.';
  return `${session.workspaceReadiness?.missingInputs?.length ?? session.readiness.missing.length} required input(s) remain unresolved.`;
}
