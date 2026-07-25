import { getComponentColor, registerMaterialState } from './three-object-materials.js';
import { createPipeTube, createBendArc } from './three-pipe-primitives.js';
import { createTubeSegment, createFrustum, createDisc, createValveBody } from './three-fitting-primitives.js';
import { createSupportSymbol, createFallbackMarker } from './three-support-overlay.js';

export function createThreePrimitive(renderItem) {
  const primitive = renderItem.primitive;
  const color = getComponentColor(renderItem.componentKind);
  let object;

  switch (primitive.kind) {
    case 'PIPE_TUBE':
    case 'TEE_LEG':
    case 'TEE_BRANCH':
      object = createPipeTube(primitive, color);
      break;
    case 'BEND_ARC':
      object = createBendArc(primitive, color);
      break;
    case 'REDUCER_FRUSTUM':
    case 'OLET_FRUSTUM':
      object = createFrustum(primitive, color);
      break;
    case 'FLANGE_DISC':
      object = createDisc(primitive, color);
      break;
    case 'VALVE_BODY':
      object = createValveBody(primitive, color);
      break;
    case 'SUPPORT_MARKER':
      object = createSupportSymbol(primitive, color);
      break;
    case 'FALLBACK_MARKER':
    default:
      object = createFallbackMarker(primitive, color);
      break;
  }

  if (object) {
    object.userData.primitiveId = renderItem.primitiveId;
    object.userData.objectId = renderItem.objectId;
    object.userData.componentKind = renderItem.componentKind;
    object.userData.resolutionStatus = renderItem.resolutionStatus;
    object.userData.layer = renderItem.layer;
    registerMaterialState(object);
  }

  return object;
}
