import * as THREE from 'three';
import { triangleSource } from '../../scripts/lafea.3-fixtures.mjs';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  createLafeaArtifactRecord,
  createLafeaLifecycleEvent,
  mountLafeaWorkbench,
} from '../../src/workspace/lafea-workbench.js';

export const HC_BROWSER_FIXTURE_SCHEMA = 'lafea-hybrid-browser-fixture/v1';

const SOURCE_HASH = 'sha256:hc-ui-source';
const MODEL_HASH = 'sha256:hc-ui-model';
const GEOMETRY_HASH = 'sha256:hc-ui-geometry';
const MESH_HASH = 'sha256:hc-ui-mesh';
const EXECUTION_HASH = 'sha256:hc-ui-execution';
const RECOVERY_HASH = 'sha256:hc-ui-recovery';
const DISPLAY_GEOMETRY_HASH = 'sha256:hc-ui-display-geometry';
const RENDER_PROFILE_HASH = 'sha256:hc-ui-render-profile';

export function mountHcSourceAuthoring(rootElement) {
  return mountScenario(rootElement, false);
}

export function mountHcQualifiedResult(rootElement) {
  return mountScenario(rootElement, true);
}

export function triggerHcWebglLoss(controller) {
  const canvas = controller.rootElement?.querySelector?.('canvas[data-layer="webgl"]');
  if (!canvas) throw new TypeError('HC_UI_WEBGL_CANVAS_NOT_FOUND');
  canvas.dispatchEvent(new Event('webglcontextlost', { bubbles: false, cancelable: true }));
  return controller.getDisplayViewportContext();
}

function mountScenario(rootElement, qualified) {
  if (!rootElement) throw new TypeError('HC_UI_ROOT_REQUIRED');
  const controller = mountLafeaWorkbench(rootElement, {
    initialStage: 'LAFEA.3',
    initialDocument: triangleSource(),
    THREE,
  });
  if (qualified) qualifyAndBind(controller);
  const context = controller.getDisplayViewportContext();
  const fixture = Object.freeze({
    schema: HC_BROWSER_FIXTURE_SCHEMA,
    scenario: qualified ? 'QUALIFIED_RESULT' : 'SOURCE_AUTHORING',
    controller,
    context,
  });
  globalThis.__LAFEA_HC_BROWSER__ = fixture;
  return fixture;
}

function qualifyAndBind(controller) {
  controller.initializeLifecycle(SOURCE_HASH, 'HC-UI-SIMULATED');
  register(controller, 'CANONICAL_MODEL', MODEL_HASH, {
    sourceHash: SOURCE_HASH,
  }, 'HC-REG-MODEL');
  register(controller, 'ANALYSIS_GEOMETRY', GEOMETRY_HASH, {
    sourceHash: SOURCE_HASH,
    canonicalModelHash: MODEL_HASH,
  }, 'HC-REG-GEOMETRY');
  register(controller, 'ANALYSIS_MESH', MESH_HASH, {
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfileHash: 'sha256:hc-ui-mesh-profile',
  }, 'HC-REG-MESH');
  register(controller, 'EXECUTION', EXECUTION_HASH, {
    canonicalModelHash: MODEL_HASH,
    meshHash: MESH_HASH,
    physicalLoadCaseHash: 'sha256:hc-ui-load-case',
    solverProfileHash: 'sha256:hc-ui-solver-profile',
  }, 'HC-REG-EXECUTION');
  register(controller, 'RECOVERY', RECOVERY_HASH, {
    executionHash: EXECUTION_HASH,
    meshHash: MESH_HASH,
    recoveryProfileHash: 'sha256:hc-ui-recovery-profile',
  }, 'HC-REG-RECOVERY');
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: 'HC-EV-DISPLAY-GEOMETRY',
    stageId: 'LAFEA.3',
    changeClass: 'DISPLAY_MESH_DENSITY',
    profileHash: DISPLAY_GEOMETRY_HASH,
    originRef: 'HC-UI-SIMULATED',
  }));
  controller.applyLifecycleEvent(createLafeaLifecycleEvent({
    eventId: 'HC-EV-RENDER-PROFILE',
    stageId: 'LAFEA.3',
    changeClass: 'CONTOUR_PALETTE',
    profileHash: RENDER_PROFILE_HASH,
    originRef: 'HC-UI-SIMULATED',
  }));

  const context = controller.getDisplayViewportContext();
  if (!context || context.sourceSemanticHash !== SOURCE_HASH) {
    throw new TypeError('HC_UI_QUALIFIED_SOURCE_CONTEXT_INVALID');
  }
  controller.setDisplayRenderPacket(renderPacket(context.sceneRevision));
  const ready = controller.getDisplayViewportContext();
  if (ready?.mode !== 'QUALIFIED_RESULT' || ready.status !== 'READY') {
    throw new TypeError('HC_UI_QUALIFIED_RESULT_NOT_READY');
  }
}

function register(controller, kind, artifactHash, parentHashes, registrationId) {
  controller.registerLifecycleArtifact(createLafeaArtifactRecord({
    stageId: 'LAFEA.3',
    kind,
    status: 'CURRENT',
    artifactHash,
    parentHashes,
    qualification: 'PASS',
    producerRef: 'HC-UI-SIMULATED-PRODUCER',
  }), registrationId);
}

function renderPacket(sceneRevision) {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision,
    stageId: 'LAFEA.3',
    sourceElementType: 'T3',
    positions: new Float32Array([
      0, 0, 0,
      100, 0, 0,
      0, 100, 0,
    ]),
    vertexMeshNodeIds: ['A', 'B', 'C'],
    drawTriangleIndices: new Uint32Array([0, 1, 2]),
    drawTriangleElementIndices: new Uint32Array([0]),
    sourceElementIds: ['E1'],
    fieldValues: new Float32Array([10, 20, 30]),
    qualityFlags: new Uint8Array([0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'HC-UI-FIELD',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.HC-UI-FIELD',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 10,
        maximum: 30,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:hc-ui-field-bounds',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision,
      entries: [{
        drawGroup: 'TRIANGLES',
        primitiveStart: 0,
        primitiveEnd: 1,
        sourceEntityId: 'E1',
        meshEntityId: 'E1',
        entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: SOURCE_HASH,
      topologyHash: GEOMETRY_HASH,
      meshHash: MESH_HASH,
      executionHash: EXECUTION_HASH,
      recoveryHash: RECOVERY_HASH,
      displayGeometryHash: DISPLAY_GEOMETRY_HASH,
      renderProfileHash: RENDER_PROFILE_HASH,
      producerRef: 'HC-UI-SIMULATED-PRODUCER',
    },
  };
}
