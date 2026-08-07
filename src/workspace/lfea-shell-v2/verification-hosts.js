import { workbenchElement } from '../workbench-dom.js';

export function renderLfeaVerificationArea(root, benchmarkHost, convergenceHost, open = false) {
  const details = workbenchElement(root, 'details', 'lfea-shell-v2__verification');
  details.open = open;
  details.dataset.role = 'lfea-verification-area';
  details.append(workbenchElement(root, 'summary', null, 'Verification · benchmark and convergence'));

  const grid = workbenchElement(root, 'div', 'lfea-shell-v2__verification-grid');
  if (benchmarkHost) {
    const section = workbenchElement(root, 'section');
    section.append(workbenchElement(root, 'h3', null, 'Benchmark evidence'), benchmarkHost);
    grid.append(section);
  }
  if (convergenceHost) {
    const section = workbenchElement(root, 'section');
    section.append(workbenchElement(root, 'h3', null, 'Convergence evidence'), convergenceHost);
    grid.append(section);
  }
  if (!grid.children.length) {
    grid.append(workbenchElement(root, 'p', 'lfea-shell-v2__muted', 'No verification hosts are attached.'));
  }
  details.append(grid);
  return details;
}
