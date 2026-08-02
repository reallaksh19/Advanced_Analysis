/** Complete pure visual derivation for one certified canonical topology snapshot. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { createDimensionAuthority } from './dimension-authority.js';
import { buildTopologyEditComponentEvidence } from './topology-edit-component-evidence.js';
import {
  deriveTopologyVisualGeometry,
  projectVisualGeometryToViewport,
  visualPolicySummary,
} from './topology-edit-render-model.js';
import { deriveAllSupportRestraintGeometry } from './support-restraint-geometry.js';
import { projectSupportGeometryToViewport } from './support-restraint-projector.js';

export function buildTopologyEditVisualSession({
  canonicalTopology,
  workspaceDataset,
  dimensionAuthority = createDimensionAuthority(),
  visualPolicy,
  verticalAxis = 'Z',
} = {}) {
  const componentEvidence = buildTopologyEditComponentEvidence(workspaceDataset);
  const visualModel = deriveTopologyVisualGeometry({
    canonicalTopology,
    componentEvidence,
    dimensionAuthority,
    visualPolicy,
  });
  const supportOverlays = deriveAllSupportRestraintGeometry({
    canonicalTopology,
    verticalAxis,
  });
  const diagnostics = [
    ...visualModel.diagnostics,
    ...supportOverlays.flatMap((overlay) => overlay.diagnostics || []),
    ...supportOverlays.flatMap((overlay) => (
      overlay.restraints.flatMap((restraint) => restraint.diagnostics || [])
    )),
  ];
  return deepFreeze({
    visualModel,
    visualProjection: projectVisualGeometryToViewport(visualModel, canonicalTopology),
    supportOverlays,
    supportProjection: projectSupportGeometryToViewport(supportOverlays),
    diagnostics,
    policySummary: visualPolicySummary(visualPolicy),
  });
}
