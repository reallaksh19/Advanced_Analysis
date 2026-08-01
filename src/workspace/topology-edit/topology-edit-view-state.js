/**
 * Topology Edit Draft — Phase 1 View State Contract
 *
 * Governs 6-DOF camera controls, projection mode (PERSPECTIVE / ORTHOGRAPHIC),
 * vertical axis (Y / Z), support scale, and active gesture state.
 */

export const TOPOLOGY_EDIT_VIEW_STATE = 'advanced-topology-edit-view-state/v1';

export function createTopologyEditViewState(input = {}) {
  return Object.freeze({
    schema: TOPOLOGY_EDIT_VIEW_STATE,
    cameraType: input.cameraType || 'PERSPECTIVE',
    verticalAxis: input.verticalAxis || 'Z',
    supportScale: Number.isFinite(input.supportScale) ? input.supportScale : 1.0,
    standardView: input.standardView || 'ISO',
    activeTool: input.activeTool || 'select',
    navigationLock: Boolean(input.navigationLock),
    pivotPoint: Object.freeze(input.pivotPoint || { x: 0, y: 0, z: 0 }),
    cameraPosition: Object.freeze(input.cameraPosition || { x: 10, y: 10, z: 10 }),
    targetPosition: Object.freeze(input.targetPosition || { x: 0, y: 0, z: 0 }),
  });
}
