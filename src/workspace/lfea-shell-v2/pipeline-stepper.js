import { workbenchElement } from '../workbench-dom.js';

const SYMBOLS = Object.freeze({
  Complete: '✓',
  Running: '●',
  Warning: '⚠',
  Blocked: '■',
  'Not run': '○',
});

export function renderLfeaPipelineStepper(root, pipeline) {
  const section = workbenchElement(root, 'section', 'lfea-shell-v2__pipeline');
  section.setAttribute('aria-label', 'LFEA execution pipeline');
  const heading = workbenchElement(root, 'div', 'lfea-shell-v2__pipeline-heading');
  heading.append(
    workbenchElement(root, 'strong', null, 'Pipeline'),
    workbenchElement(root, 'span', null, 'VALIDATE → PREFLIGHT → ADAPT → SOLVE → PROJECT → REVIEW → EXPORT'),
  );

  const list = workbenchElement(root, 'ol', 'lfea-shell-v2__pipeline-list');
  for (const step of pipeline) {
    const item = workbenchElement(root, 'li', 'lfea-shell-v2__pipeline-step');
    item.dataset.stage = step.stage;
    item.dataset.state = step.state.replaceAll(' ', '_').toUpperCase();
    item.append(
      workbenchElement(root, 'span', 'lfea-shell-v2__step-symbol', SYMBOLS[step.state] ?? '○'),
      workbenchElement(root, 'strong', null, step.stage),
      workbenchElement(root, 'span', 'lfea-shell-v2__step-state', step.state),
    );
    list.append(item);
  }
  section.append(heading, list);
  return section;
}
