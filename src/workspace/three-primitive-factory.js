import { getComponentColor, registerMaterialState } from './three-object-materials.js';
import { createPipeTube, createBendArc } from './three-pipe-primitives.js';
import { createFrustum, createDisc, createValveBody } from './three-fitting-primitives.js';
import { createSupportSymbol, createFallbackMarker } from './three-support-overlay.js';

export function createThreePrimitive(renderItem, resourcePool = null) {
  const primitive = renderItem.primitive;
  const color = getComponentColor(renderItem.componentKind);
  let object;

  switch (primitive.kind) {
    case 'PIPE_TUBE':
    case 'TEE_LEG':
    case 'TEE_BRANCH':
      object = createPipeTube(primitive, color, renderItem.renderSettings, resourcePool);
      break;
    case 'BEND_ARC':
    case 'BEND_CENTERLINE':
      object = createBendArc(primitive, color, renderItem.renderSettings, resourcePool);
      break;
    case 'REDUCER_FRUSTUM':
    case 'OLET_FRUSTUM':
      object = createFrustum(primitive, color, renderItem.renderSettings, resourcePool);
      break;
    case 'FLANGE_DISC':
      object = createDisc(primitive, color, renderItem.renderSettings, resourcePool);
      break;
    case 'VALVE_BODY':
      object = createValveBody(primitive, color, renderItem.renderSettings, resourcePool);
      break;
    case 'SUPPORT_MARKER':
      object = createSupportSymbol(primitive, color, resourcePool);
      break;
    case 'FALLBACK_MARKER':
    default:
      object = createFallbackMarker(primitive, color, resourcePool);
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
