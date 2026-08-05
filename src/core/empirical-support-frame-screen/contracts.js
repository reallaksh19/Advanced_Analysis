const METHOD_ID = 'EMPIRICAL_SUPPORT_FRAME_SCREEN_V1';
const SCHEMA = 'empirical-support-interface-load/v1';

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return value;
}

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required.`);
  return value;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

export const SUPPORT_FRAME_SCREEN_METHOD_ID = METHOD_ID;

export const SUPPORT_FRAME_SCREEN_BLOCKERS = Object.freeze([
  'CONNECTION_FIXITY_UNKNOWN',
  'SECTION_PROPERTIES_INCOMPLETE',
  'BASE_CONDITION_UNKNOWN',
  'STRUCTURAL_CODE_DATASET_UNRESOLVED',
  'SECOND_ORDER_EFFECTS_REQUIRED',
  'LOCAL_BUCKLING_CHECK_REQUIRED',
  'LATERAL_TORSIONAL_BUCKLING_REQUIRED',
  'BASE_PLATE_CHECK_REQUIRED',
  'ANCHOR_BOLT_CHECK_REQUIRED',
  'FOUNDATION_CHECK_REQUIRED',
  'DETAILED_STRUCTURAL_MODEL_REQUIRED',
]);

export function createSupportInterfaceLoad(input) {
  return freeze({
    schema: SCHEMA,
    method: METHOD_ID,
    qualification: 'CONTRACT_ONLY_NOT_STRUCTURAL_ADEQUACY',
    loadCaseId: text(input.loadCaseId, 'loadCaseId'),
    supportId: text(input.supportId, 'supportId'),
    sourceResultIdentity: text(input.sourceResultIdentity, 'sourceResultIdentity'),
    contactState: text(input.contactState, 'contactState'),
    applicationPointM: {
      x: finite(input.applicationPointM?.x, 'applicationPointM.x'),
      y: finite(input.applicationPointM?.y, 'applicationPointM.y'),
      z: finite(input.applicationPointM?.z, 'applicationPointM.z'),
    },
    coordinateFrameId: text(input.coordinateFrameId, 'coordinateFrameId'),
    forceN: {
      x: finite(input.forceN?.x, 'forceN.x'),
      y: finite(input.forceN?.y, 'forceN.y'),
      z: finite(input.forceN?.z, 'forceN.z'),
    },
    momentNm: {
      x: finite(input.momentNm?.x, 'momentNm.x'),
      y: finite(input.momentNm?.y, 'momentNm.y'),
      z: finite(input.momentNm?.z, 'momentNm.z'),
    },
  });
}
