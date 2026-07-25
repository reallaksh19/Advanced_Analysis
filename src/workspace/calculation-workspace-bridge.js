import { projectSharedPipingModelToCalculationWorkspace } from '../core/shared-piping-model/adapters/shared-to-calculation-workspace.js';
import { validateSharedPipingModel } from '../core/shared-piping-model/shared-piping-model.js';
import { workspaceObjects, workspaceSupports } from '../calc-workspace/workspaceModel.js';
import { freezeDeep } from './dataset-utils.js';
import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';
import { STAGED_MODEL_INDEX_SCHEMA } from './staged-model-index.js';

export const CALCULATION_WORKSPACE_BRIDGE_SCHEMA = 'calculation-workspace-bridge/v1';

export function buildCalculationWorkspaceBridge(dataset) {
  assertBridgeableDataset(dataset);
  const calculationWorkspace = projectSharedPipingModelToCalculationWorkspace(dataset.sharedModel);
  return freezeDeep({
    schema: CALCULATION_WORKSPACE_BRIDGE_SCHEMA,
    datasetId: dataset.datasetId,
    sourceSchema: dataset.sourceSchema,
    sourceNodeCount: dataset.sourceModel.summary.nodeCount,
    sharedModelSemanticHash: dataset.sharedModel.semanticHash,
    calculationWorkspace,
    summary: {
      objects: workspaceObjects(calculationWorkspace).length,
      supports: workspaceSupports(calculationWorkspace).length,
      sourceRoots: dataset.sourceModel.summary.rootCount,
    },
  });
}

function assertBridgeableDataset(dataset) {
  if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA) {
    throw new TypeError(`Calculation workspace bridge requires ${WORKSPACE_DATASET_SCHEMA}.`);
  }
  if (!dataset.sourceModel || dataset.sourceModel.schema !== STAGED_MODEL_INDEX_SCHEMA) {
    throw new TypeError(`Calculation workspace bridge requires ${STAGED_MODEL_INDEX_SCHEMA}.`);
  }
  const validation = validateSharedPipingModel(dataset.sharedModel);
  if (!validation.ok) {
    throw new TypeError(`Calculation workspace bridge requires a valid shared model: ${validation.errors.join(' ')}`);
  }
}
