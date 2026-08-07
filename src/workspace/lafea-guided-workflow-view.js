/** Render the guided LAFEA step navigator without creating engineering state. */
export function renderLafeaGuidedWorkflow(root, workflow, onNavigate) {
  if (!root?.ownerDocument || workflow?.schema !== 'lafea-guided-workflow/v1') {
    throw new TypeError('LAFEA_GUIDED_WORKFLOW_VIEW_INPUT_INVALID');
  }
  const doc = root.ownerDocument;
  const nav = doc.createElement('nav');
  nav.className = 'lafea-guided-workflow';
  nav.dataset.role = 'lafea-guided-workflow';
  nav.setAttribute('aria-label', 'Guided LAFEA analysis steps');
  const title = doc.createElement('h2');
  title.textContent = 'Analysis workflow';
  const list = doc.createElement('ol');
  for (const step of workflow.steps) {
    const item = doc.createElement('li');
    item.dataset.stepId = step.stepId;
    item.dataset.status = step.status;
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.guidedStep = step.stepId;
    button.dataset.status = step.status;
    button.textContent = `${step.label} — ${step.status}`;
    button.addEventListener('click', () => onNavigate?.(step));
    item.append(button);
    if (step.reasons.length) {
      const reasons = doc.createElement('small');
      reasons.textContent = step.reasons.join(' • ');
      item.append(reasons);
    }
    list.append(item);
  }
  const release = doc.createElement('p');
  release.className = 'lafea-guided-workflow__release';
  release.textContent = 'Release authority: NOT QUALIFIED';
  nav.append(title, list, release);
  root.replaceChildren(nav);
  return nav;
}
