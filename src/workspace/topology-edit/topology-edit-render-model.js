/** Governed visual-model orchestration for certified canonical topology. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { createTopologyVisualGeometryModel } from './visual-geometry-contract.js';
import { deriveVisualComponents } from './topology-edit-fitting-geometry.js';
import {
  DEFAULT_TOPOLOGY_VISUAL_POLICY,
  normalizeTopologyVisualPolicy,
  visualPolicySummary,
} from './topology-edit-visual-policy.js';
import { projectVisualGeometryToViewport } from './topology-edit-visual-projector.js';

export const TOPOLOGY_EDIT_RENDER_MODEL = 'advanced-topology-edit-render-model/v1';
export { DEFAULT_TOPOLOGY_VISUAL_POLICY, visualPolicySummary, projectVisualGeometryToViewport };

export function createTopologyEditRenderModel(input = {}) {
  return deepFreeze({
    schema: TOPOLOGY_EDIT_RENDER_MODEL,
    documentId: input.documentId || '',
    sourceHash: input.sourceHash || '',
    baseCanonicalHash: input.baseCanonicalHash || '',
    draftCanonicalHash: input.draftCanonicalHash || '',
    verticalAxis: input.verticalAxis || 'Z',
    units: 'MM',
    source: input.sourceVisualModel || { nodes: [], elements: [] },
    draft: input.draftVisualModel || { nodes: [], elements: [] },
    ghost: input.ghostVisualModel || null,
    connectors: input.connectors || [],
    transient: input.transient || [],
    measurements: input.measurements || [],
    issues: input.issues || [],
    supports: input.supports || [],
    selection: input.selection || [],
    visibility: {
      source: true,
      draft: true,
      ghost: false,
      connectors: false,
      transient: true,
      measurement: true,
      issues: true,
      supports: true,
      ...(input.visibility || {}),
    },
    bounds: input.bounds || null,
  });
}

export function deriveTopologyVisualGeometry(input = {}) {
  const topology = input.canonicalTopology;
  if (!topology?.canonicalTopologyHash) {
    throw new TypeError('deriveTopologyVisualGeometry requires canonical topology authority.');
  }
  if (!input.dimensionAuthority) {
    throw new TypeError('deriveTopologyVisualGeometry requires dimension authority.');
  }
  const policy = normalizeTopologyVisualPolicy(input.visualPolicy);
  const components = deriveVisualComponents(input, policy);
  return createTopologyVisualGeometryModel({
    canonicalTopologyHash: topology.canonicalTopologyHash,
    geometryPolicyHash: policy.policyHash,
    modelRole: policy.modelRole,
    components,
  });
}
