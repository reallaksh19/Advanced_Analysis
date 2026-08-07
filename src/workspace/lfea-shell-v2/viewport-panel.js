import {
  lfeaDisplayGeometry,
  lfeaPreviewPackage,
} from '../lfea-workbench-model.js';
import { renderLfeaNodeDraftEditor } from '../lfea-workbench-panels.js';
import { renderLfeaWorkbenchSvg } from '../lfea-workbench-svg.js';
import { workbenchElement } from '../workbench-dom.js';

export function renderLfeaViewportPanel(root, state, handlers) {
  const panel = workbenchElement(root, 'section', 'lfea-shell-v2__viewport');
  const heading = workbenchElement(root, 'header', 'lfea-shell-v2__panel-heading');
  heading.append(
    workbenchElement(root, 'div', null, 'Viewport'),
    workbenchElement(root, 'span', null, state.display.resultMode.replaceAll('_', ' ')),
  );

  const host = workbenchElement(root, 'div', 'lfea-workbench__svg lfea-shell-v2__viewport-host');
  if (!state.packageValue) {
    host.append(workbenchElement(
      root,
      'div',
      'lfea-shell-v2__empty',
      'Import a hash-valid lfea-mesh-package/v1 to begin.',
    ));
  } else {
    const previewPackage = lfeaPreviewPackage(state.packageValue, state.nodeDraft);
    const geometry = lfeaDisplayGeometry(
      previewPackage,
      state.execution,
      state.display.resultMode,
      {
        deformation: {
          enabled: state.display.resultMode === 'DEFORMED',
          scale: state.display.deformationScale,
        },
      },
    );
    renderLfeaWorkbenchSvg(host, geometry, previewPackage, {
      onMoveNode: handlers.onPreviewNode,
      onCancelNode: handlers.onCancelNode,
    });
    const authority = workbenchElement(
      root,
      'p',
      'lfea-workbench__authority',
      geometry.authority,
    );
    authority.dataset.lfeaValueKey = 'viewportAuthority';
    panel.append(heading, host, authority);
    panel.append(renderLfeaNodeDraftEditor(root, state.nodeDraft, handlers));
    return panel;
  }

  panel.append(heading, host);
  return panel;
}
