/**
 * Topology Edit Draft — Phase 1 Render Model Schema & Builder
 *
 * Schema: advanced-topology-edit-render-model/v1
 */

export const TOPOLOGY_EDIT_RENDER_MODEL = 'advanced-topology-edit-render-model/v1';

export function createTopologyEditRenderModel(input = {}) {
  return Object.freeze({
    schema: TOPOLOGY_EDIT_RENDER_MODEL,
    documentId: input.documentId || 'doc-draft-active',
    sessionVersion: input.sessionVersion || 1,
    sourceHash: input.sourceHash || '',
    baseCanonicalHash: input.baseCanonicalHash || '',
    draftCanonicalHash: input.draftCanonicalHash || '',
    verticalAxis: input.verticalAxis || 'Z',
    units: 'MM',

    source: Object.freeze(input.sourceVisualModel || { nodes: [], elements: [] }),
    draft: Object.freeze(input.draftVisualModel || { nodes: [], elements: [] }),
    ghost: input.ghostVisualModel ? Object.freeze(input.ghostVisualModel) : null,

    connectors: Object.freeze(input.connectors || []),
    transient: Object.freeze(input.transient || []),
    measurements: Object.freeze(input.measurements || []),
    issues: Object.freeze(input.issues || []),
    supports: Object.freeze(input.supports || []),

    selection: Object.freeze(input.selection || []),
    visibility: Object.freeze({
      source: true,
      draft: true,
      ghost: false,
      connectors: false,
      transient: true,
      measurement: true,
      issues: true,
      supports: true,
      ...(input.visibility || {}),
    }),
    bounds: Object.freeze(input.bounds || {
      minimum: { x: 0, y: 0, z: 0 },
      maximum: { x: 10, y: 10, z: 10 },
    }),
  });
}
