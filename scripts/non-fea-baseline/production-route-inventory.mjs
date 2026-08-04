import { semanticHash } from '../../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import {
  NON_FEA_ROUTE_INVENTORY_SCHEMA,
  NON_FEA_STAGE_IDS,
  codeUnitCompare,
} from './contracts.mjs';

function row(
  stageId,
  entryPoint,
  owningFile,
  inputSchema,
  outputSchema,
  trigger,
  repeatCondition,
  cacheRule,
  currentCoverage,
  currentIssueOrPr,
  presentDefectOrUncertainty,
  intendedOwner,
  forbiddenParallelOwner,
  workspaceMutation = false,
  mainThread = 'synchronous',
) {
  return {
    stageId,
    entryPoint,
    owningFile,
    inputSchema,
    outputSchema,
    trigger,
    sourceMutation: false,
    workspaceMutation,
    mainThread,
    repeatCondition,
    cacheRule,
    currentCoverage,
    currentIssueOrPr,
    presentDefectOrUncertainty,
    intendedOwner,
    forbiddenParallelOwner,
  };
}

const ROUTE = [
  row('FILE_READ', 'import reader / P0 runner', 'dataset-controller.js + caller', 'File', 'bytes', 'DATASET_LOAD_REQUESTED', 'each import', 'none', 'normalization benchmark', '#541', 'browser read timing absent', 'P1', 'P2-P7', false, 'environment-dependent'),
  row('UTF8_DECODE', 'Buffer.toString / File.text', 'import caller', 'bytes', 'UTF-8 text', 'each import', 'each import', 'none', 'P0 runner', '#541', 'browser decode timing absent', 'P1', 'P2-P7'),
  row('JSON_PARSE', 'JSON.parse', 'import caller', 'UTF-8 JSON', 'plain package', 'each import', 'each import', 'none', 'P0 runner', '#541', 'browser parse long-task evidence absent', 'P1', 'P2-P7'),
  row('SOURCE_SNAPSHOT', 'createSourcePackageSnapshot', 'src/core/shared-piping-model/source-package-snapshot.js', 'raw package + source evidence', 'source snapshot', 'normalizeWorkspaceDataset', 'every normalization', 'none', 'workspace contracts', '#541', 'timing hidden inside normalization', 'P1', 'P2-P7'),
  row('SOURCE_INDEX', 'indexWorkspaceSourcePackage', 'src/workspace/staged-model-index.js', 'source snapshot', 'indexed model', 'normalizeWorkspaceDataset', 'every normalization', 'none', 'workspace contracts', '#541', 'timing hidden inside normalization', 'P1', 'P2-P7'),
  row('NORMALIZATION', 'normalizeWorkspaceDataset', 'src/workspace/dataset-adapter.js', 'raw package', 'analysis-workspace-dataset/v1', 'DatasetController.load', 'every load', 'none', 'normalization benchmark', '#541', 'composite synchronous stage', 'P1', 'P2-P7'),
  row('SHARED_MODEL', 'buildSharedPipingModelFromWorkspaceDataset', 'src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js', 'workspace dataset', 'shared model', 'normalize/rebuild', 'load and edit rebuild', 'stored on dataset', 'shared-model checks', '#541', 'timing hidden inside normalization/rebuild', 'P1', 'P2-P7'),
  row('WORKSPACE_SNAPSHOT', 'WorkspaceState.loadDataset', 'src/workspace/dataset-controller.js + workspace-state.js', 'workspace dataset', 'workspace snapshot', 'DATASET_LOAD_REQUESTED', 'load/clear/edit', 'current snapshot', 'workspace contracts', '#541', 'event fan-out count not frozen', 'P1', 'P2-P7', true),
  row('ENGINEERING_MODEL', 'EngineeringModelController.handleSnapshot -> EngineeringModelStore.rebuild', 'src/workspace/engineering-model-controller.js + engineering-model-store.js', 'dataset + Project Data', 'support/route models', 'snapshot or Project Data change', 'new dataset/profile', 'controller reference guard', 'engineering-load checks', '#541', 'profile invalidation and duplicate calls unmeasured', 'P1 shared-stop P2/P6', 'P3-P5/P7'),
  row('SUPPORT_SITES', 'buildSupportSiteModel', 'src/workspace/support-sites/support-site-model.js', 'dataset + topology policy', 'support-site-model/v1', 'engineering rebuild', 'each rebuild', 'store field', 'support-site checks', 'P2', 'grouping authority must not be optimized', 'P2', 'P1 write/P3-P7'),
  row('ROUTE_PARTITION', 'buildRoutePartitionModel', 'src/workspace/routes/route-partition-model.js', 'dataset + topology policy', 'route-partition-model/v1', 'engineering rebuild', 'each rebuild', 'store field', 'route checks', 'P2', 'ordering/policy authority needs certification', 'P2', 'P1 write/P3-P7'),
  row('MODEL_ZONE_PROJECTION', 'projectDatasetForModelZone + projectSupportSiteModelForModelZone', 'model-zone-selector.js + model-zone-viewport-projection.js', 'dataset/zone/supports', 'zone projection', 'renderDataset/zone change', 'initial and zone change', 'none', 'model-zone checks', '#541 then P3', 'full downstream compile repeats', 'P1 then P3', 'P2/P4-P7'),
  row('RESOLVED_GEOMETRY', 'buildResolvedEngineeringGeometry + filterResolvedGeometryForModelZone', 'resolved-engineering-geometry.js + model-zone-viewport-projection.js', 'dataset/profile/supports', 'resolved-engineering-geometry/v1', 'ViewportPanel.renderDataset', 'every renderDataset', 'none', 'geometry checks', '#541', 'recompiled on non-geometric engineering changes', 'P1', 'P2/P5/P6'),
  row('RENDER_MODEL', 'buildViewportRenderModel', 'src/workspace/viewport-render-model.js', 'resolved geometry', 'viewport-render-model/v3', 'ViewportPanel.renderDataset', 'every renderDataset', 'none', 'viewport checks', '#541', 'complete model rebuilt; no delta class', 'P1', 'P2/P5/P6'),
  row('THREE_MATERIALIZATION', 'createThreePrimitive via renderThreeModel', 'three-primitive-factory.js + three-viewport-scene.js', 'render primitives', 'Three objects', 'renderModel/context restore', 'each install/restore', 'none', 'viewport Node/browser tests', '#541', 'geometry/material recreation cost unknown', 'P1', 'P2/P5/P6; P7 overlay'),
  row('GPU_SCENE_INSTALL', 'projectPrimitives', 'src/workspace/three-viewport-scene.js', 'Three objects', 'scene groups/object map', 'renderModel/context restore', 'each install/restore', 'full clear/reinstall', 'viewport tests', '#541', 'teardown/install cost and disposal need browser proof', 'P1', 'P2/P5/P6; P7 overlay'),
  row('FIT', 'fitThreeView', 'src/workspace/three-viewport-camera.js', 'bounds + camera', 'camera state', 'first model/fit command', 'first load and commands', 'sceneBoundsCache', 'navigation tests', 'P4', 'large/high-coordinate proof pending', 'P4 after P1', 'P2/P5/P6'),
  row('FIRST_MEANINGFUL_FRAME', 'ThreeViewportBackend.renderOnce', 'src/workspace/three-viewport-backend.js', 'installed dirty scene', 'WebGL frame + HUD', 'single RAF owner', 'dirty frames', 'renderDirty', 'browser harness', '#541', 'accepted real-fixture marker absent', 'P1', 'P2/P5/P6', false, 'browser main thread'),
  row('SELECTION', 'handlePick -> DatasetController.select', 'three-viewport-backend.js + dataset-controller.js', 'qualified pointer/raycast', 'workspace selection', 'pointer-up', 'each pick', 'objects Map; flattened candidates', 'navigation tests', '#541', 'p95/candidate cost not frozen', 'P1 performance/P3 semantics', 'P2/P5/P6', true, 'browser main thread'),
  row('ORBIT_PAN', 'OrbitControls + ThreeInteractionArbiter', 'three-viewport-backend.js + three-interaction-arbiter.js', 'pointer/wheel', 'camera + dirty flag', 'navigation input', 'interaction frames', 'camera/controls state', 'navigation tests', '#541 then P4', 'real 4,884-entity p95 absent', 'P4 after P1', 'P2/P5/P6', false, 'browser main thread'),
  row('CANONICAL_TOPOLOGY', 'buildCanonicalTopologyFromWorkspaceDataset + finalizeCanonicalTopology', 'topology-edit-source-adapter.js + topology-edit-canonical-state.js', 'dataset/topology/support authority', 'canonical topology', '3D Edit refresh', 'refresh/rebase', 'certified session base/draft', 'topology-edit tests', 'P2', 'current issue ledger not accepted', 'P2', 'P1/P3-P7'),
  row('CHECKER', 'checkCanonicalTopology', 'src/workspace/topology-edit/topology-edit-checker.js', 'canonical topology + policy', 'topology issues', 'refresh/certification', 'base/draft/preview', 'none', 'topology-edit tests', 'P2', 'ordering and policy authority need freeze', 'P2', 'P1/P3-P7'),
  row('EDIT_PREVIEW_APPLY_UNDO_REDO', 'TopologyEditCertifiedSession methods', 'topology-edit-certified-session.js', 'topology + command/journal', 'certified transition/replay', '3D Edit command UI', 'each transaction', 'immutable journal/replay', 'topology-edit tests', 'P2 then P3', 'limited visible tools; workspace commit incomplete', 'P2 core/P3 UI', 'P1/P4-P7', true),
  row('ENRICHMENT_PROJECTION', 'common enriched projection/sidecar contracts', 'src/core/common-enriched-properties/** + src/workspace/enrichment/**', 'baseline/readiness/decision', 'authorized projection', 'reviewer workflow', 'each authorized operation', 'hash-bound records', 'enrichment checks', '#425/P5', 'production bypass inventory open', 'P5', 'P1-P4/P6/P7 adapter'),
  row('AUTHORIZED_HANDOFF', 'AuthorizedEnrichmentConsumerController + workspace API', 'src/workspace/enrichment/authorized-enrichment-*.js', 'authorized request', 'empirical result/stagedJson receipt', 'workspace API', 'explicit request', 'hash-bound result', 'authorized API checks', '#425/P5', 'legacy bypasses not fully inventoried', 'P5', 'P1-P4/P6/P7', true),
  row('EMPIRICAL_CALCULATION', 'calculateSupportLoadDistribution', 'src/workspace/engineering-loads/support-load-distribution-v3.js', 'dataset/profile/support/route/master', 'support-load-distribution/v3', 'calculate/calculateAuthorized', 'explicit calculate', 'distribution + freshness', 'authorized empirical/W10.6', 'P6', 'formula/oracle/negative-case register incomplete', 'P6', 'P1/P3-P5/P7', true),
  row('LOAD_PRESENTATION', 'SupportLoadPresenter', 'src/workspace/sequential-sketcher/support-load-presenter.js', 'entity + qualified stores', 'callouts/inspector/table', 'render/engineering changed', 'each render', 'none', 'sequential sketcher checks', '#490/P7', 'ordinary WebGL callout/common adapter gap', 'P7', 'P1-P6 except read-only adapters'),
];

const sortedStages = [...ROUTE].sort((left, right) => codeUnitCompare(left.stageId, right.stageId));
const semanticMaterial = {
  schema: NON_FEA_ROUTE_INVENTORY_SCHEMA,
  programme: 'P0-P7',
  p0Authority: 'P0',
  stages: sortedStages,
};

export const NON_FEA_PRODUCTION_ROUTE_INVENTORY = deepFreeze({
  ...semanticMaterial,
  semanticHash: semanticHash(semanticMaterial),
});

export function assertNonFeaRouteInventory(inventory = NON_FEA_PRODUCTION_ROUTE_INVENTORY) {
  const actual = inventory.stages.map((item) => item.stageId).sort(codeUnitCompare);
  const expected = [...NON_FEA_STAGE_IDS].sort(codeUnitCompare);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Non-FEA route inventory does not cover the complete P0 stage set.');
  }
  if (new Set(actual).size !== actual.length) throw new Error('Non-FEA route inventory has duplicate stages.');
  for (const item of inventory.stages) {
    for (const key of ['entryPoint', 'owningFile', 'inputSchema', 'outputSchema', 'trigger', 'mainThread', 'repeatCondition', 'cacheRule', 'currentCoverage', 'presentDefectOrUncertainty', 'intendedOwner', 'forbiddenParallelOwner']) {
      if (typeof item[key] !== 'string' || !item[key]) throw new Error(`${item.stageId} is missing ${key}.`);
    }
    if (item.sourceMutation !== false) throw new Error(`${item.stageId} must not declare source mutation.`);
  }
  return inventory;
}
