import * as THREE from 'three';
import { TopologyEditNavigationHudViewportBackend } from '../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js';
import { selectTopologyEditPickingMode } from '../scripts/topology-edit-wave5-contract.mjs';

export async function runTopologyEditWave5BrowserHarness(options = {}) {
  const componentCount = Number(options.componentCount ?? 25_600);
  if (!Number.isSafeInteger(componentCount) || componentCount < 8) {
    throw new TypeError('Wave 5 browser componentCount must be an integer of at least 8.');
  }
  const optimizerProbeCount = Math.min(
    componentCount - 1,
    Math.max(4, Number(options.optimizerProbeCount ?? 256)),
  );
  const pickCount = Number(options.pickSampleCount ?? 40);
  const frameCount = Number(options.frameSampleCount ?? 40);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:700px;overflow:hidden';
  document.body.append(host);
  const backend = new TopologyEditNavigationHudViewportBackend();
  const startedAt = performance.now();
  backend.mount(host);
  const fixture = largeModel(componentCount, optimizerProbeCount);
  backend.renderSession(fixture.model);
  await frames(2);
  const firstValidFrameMs = performance.now() - startedAt;
  const optimizationEvidence = backend.renderOptimizationEvidence;
  const client = project(
    fixture.target,
    backend.engineeringRoot,
    backend.activeCamera,
    backend.renderer.domElement,
  );
  const picks = [];
  let identityErrorCount = 0;
  for (let index = 0; index < pickCount; index += 1) {
    const start = performance.now();
    const hit = backend.pickAt(client.x, client.y);
    picks.push(performance.now() - start);
    if (hit?.objectId !== fixture.target.id) identityErrorCount += 1;
  }
  const frameTimes = [];
  for (let index = 0; index < frameCount; index += 1) {
    const start = performance.now();
    backend.renderDirty = true;
    backend.renderFrame();
    frameTimes.push(performance.now() - start);
  }
  const renderer = backend.renderer;
  const pick = summary(picks);
  const navigationFrame = summary(frameTimes);
  const m005CreatedInstanceCount = (optimizationEvidence?.layers || []).reduce(
    (sum, layer) => sum + (layer.instancing?.newInstanceCount || 0),
    0,
  );
  const m005GeometryReuseCount = (optimizationEvidence?.layers || []).reduce(
    (sum, layer) => sum + (layer.pooling?.geometryReuseCount || 0),
    0,
  );
  const resourcesBeforeDestroy = {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    renderCalls: renderer.info.render.calls,
    groupChildren: children(backend),
    hostChildren: host.childElementCount,
  };
  const pickingDecision = selectTopologyEditPickingMode({
    componentCount,
    cpuEvidence: { sampleCount: pick.count, p95Ms: pick.p95, identityErrorCount },
  });
  backend.destroy();
  await frames(1);
  const lifecycle = {
    rendererReleased: backend.renderer === null,
    animationFrameReleased: !backend.animationFrameId,
    mountedStateReleased: backend.isMounted === false,
    axisHudReleased: backend.axisHud === null,
    optimizationEvidenceReleased: backend.renderOptimizationEvidence === null,
    hostChildrenAfterDestroy: host.childElementCount,
    groupChildrenAfterDestroy: children(backend),
  };
  host.remove();
  const failures = [];
  if (!renderer?.getContext()) failures.push('WEBGL_CONTEXT_UNAVAILABLE');
  if (firstValidFrameMs > 5_000) failures.push('FIRST_VALID_FRAME_BUDGET');
  if (pick.p95 > 100) failures.push('PICK_P95_BUDGET');
  if (navigationFrame.p95 > 33.3) failures.push('FRAME_P95_BUDGET');
  if (identityErrorCount) failures.push('PICK_IDENTITY_MISMATCH');
  if (!optimizationEvidence) failures.push('RENDER_OPTIMIZATION_EVIDENCE_MISSING');
  if (optimizationEvidence?.totals?.exactPickIdentityCount !== componentCount) {
    failures.push('OPTIMIZED_IDENTITY_COUNT_MISMATCH');
  }
  if ((optimizationEvidence?.totals?.instanceCountAfter ?? 0) < componentCount) {
    failures.push('LARGE_MODEL_INSTANCING_MISSING');
  }
  if (m005CreatedInstanceCount < optimizerProbeCount) {
    failures.push('M005_INSTANCE_CONVERSION_MISSING');
  }
  if (m005GeometryReuseCount < optimizerProbeCount - 1) {
    failures.push('M005_GEOMETRY_POOLING_MISSING');
  }
  if (!lifecycle.rendererReleased || !lifecycle.animationFrameReleased
      || !lifecycle.mountedStateReleased || !lifecycle.axisHudReleased
      || !lifecycle.optimizationEvidenceReleased || lifecycle.hostChildrenAfterDestroy
      || lifecycle.groupChildrenAfterDestroy) failures.push('LIFECYCLE_CLEANUP');
  const context = renderer?.getContext();
  return {
    schema: 'TopologyEditWave5BrowserEvidence.v2',
    status: failures.length ? 'FAIL' : 'PASS_BROWSER_INFRASTRUCTURE',
    componentCount,
    optimizerProbeCount,
    m005CreatedInstanceCount,
    m005GeometryReuseCount,
    firstValidFrameMs: round(firstValidFrameMs),
    pick,
    navigationFrame,
    identityErrorCount,
    pickingDecision,
    optimizationEvidence,
    resourcesBeforeDestroy,
    lifecycle,
    failures,
    userAgent: navigator.userAgent,
    webglRenderer: context?.getParameter(context.RENDERER) ?? null,
  };
}

function largeModel(count, optimizerProbeCount) {
  const genericCount = count - optimizerProbeCount;
  const elements = [{
    id: 'probe-target',
    entityId: 'probe-target',
    type: 'component',
    x: -1000,
    y: -1000,
    z: 0,
    pickTarget: { objectKind: 'component', objectId: 'probe-target' },
  }];
  const remaining = Math.max(0, genericCount - 1);
  const side = Math.ceil(Math.sqrt(remaining));
  for (let index = 0; index < remaining; index += 1) {
    const id = `component-${String(index).padStart(6, '0')}`;
    elements.push({
      id,
      entityId: id,
      type: 'component',
      x: (index % side) * 100,
      y: Math.floor(index / side) * 100,
      z: (index % 7) * 5,
      pickTarget: { objectKind: 'component', objectId: id },
    });
  }
  const primitives = Array.from({ length: optimizerProbeCount }, (_, index) => {
    const id = `m005-probe-${String(index).padStart(4, '0')}`;
    return {
      primitiveId: `primitive:${id}`,
      canonicalEntityId: id,
      partRole: 'body',
      kind: 'JUNCTION_MARKER',
      modelRole: 'draft',
      sourcePaths: [`/m005-probes/${index}`],
      workspaceEntityIds: [`entity:${id}`],
      parameters: {
        position: {
          x: 20_000 + ((index % 32) * 100),
          y: Math.floor(index / 32) * 100,
          z: 0,
        },
      },
    };
  });
  const empty = Object.freeze({ elements: Object.freeze([]), segments: Object.freeze([]) });
  return {
    target: elements[0],
    model: Object.freeze({
      source: Object.freeze({ elements: Object.freeze(elements), segments: Object.freeze([]) }),
      draft: Object.freeze({
        elements: Object.freeze([]),
        segments: Object.freeze([]),
        primitives: Object.freeze(primitives),
      }),
      supports: empty,
    }),
  };
}

function project(point, engineeringRoot, camera, canvas) {
  engineeringRoot.updateMatrixWorld(true);
  const value = new THREE.Vector3(point.x, point.y, point.z)
    .applyMatrix4(engineeringRoot.matrixWorld)
    .project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + ((value.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - value.y) / 2) * rect.height,
  };
}

function children(backend) {
  return Object.values(backend.groups).reduce(
    (sum, group) => sum + group.children.length,
    0,
  );
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
  ] ?? 0;
  return {
    count: sorted.length,
    min: round(sorted[0] ?? 0),
    max: round(sorted.at(-1) ?? 0),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / Math.max(sorted.length, 1)),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
  };
}

function frames(count) {
  return new Promise((resolve) => {
    const next = (left) => left <= 0
      ? resolve()
      : requestAnimationFrame(() => next(left - 1));
    next(count);
  });
}

function round(value) {
  return Number(Number(value).toFixed(3));
}
