export const MESH_PACKAGE_SCHEMA = 'lfea-mesh-package/v1';
export const MESH_ADAPTER_PROFILE_SCHEMA = 'lfea-mesh-adapter-profile/v1';
export const MESH_ADAPTER_RESULT_SCHEMA = 'lfea-mesh-adapter-result/v1';
export const MESH_PACKAGE_UNITS = 'MM_N_MPA_V1';
export const MESH_COORDINATE_SYSTEM = 'RIGHT_HANDED_XY_V1';
export const MESH_ADAPTER_STATUS = Object.freeze({ ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' });
export const MAPPING_STATUS = 'MAPPED_EXACTLY';
export const EDGE_CLASSIFICATIONS = Object.freeze({ EXTERIOR: 'EXTERIOR_EDGE', INTERIOR: 'INTERIOR_EDGE' });
export const LOCAL_EDGE_IDS = Object.freeze({
  T3: Object.freeze(['T3_E1', 'T3_E2', 'T3_E3']),
  Q4: Object.freeze(['Q4_E1', 'Q4_E2', 'Q4_E3', 'Q4_E4']),
});
export const SELECTOR_TYPES = Object.freeze({ POINT: 'POINT', BOUNDARY: 'BOUNDARY' });
export const CONSTRAINT_COMPONENT_TYPES = Object.freeze({ FREE: 'FREE', FIXED: 'FIXED', PRESCRIBED: 'PRESCRIBED' });
export const PACKAGE_LIMITATIONS = Object.freeze([
  'JSON-compatible framework-neutral mesh-package adapter only.',
  'No automatic meshing, node merging, coordinate snapping, topology repair, or connectivity reorientation.',
  'No proprietary or third-party mesh-format parsing.',
]);
