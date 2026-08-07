import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertCanonicalTopologyHash } from '../topology-edit-canonical-state.js';
import {
  assertTopologyEditTableBatch,
  rebaseTopologyEditTableBatch as rebuildBatchAuthority,
} from './topology-edit-table-batch.js';
import {
  assertTopologyEditTableBatchPlan,
  planTopologyEditTableBatch,
  topologyEditTableCanonicalRevision,
} from './topology-edit-table-batch-planner.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_REBASE_SCHEMA = 'TopologyEditTableRebaseResult.v1';

export function rebaseTopologyEditTableBatchPlan({
  batch: batchInput,
  plan: planInput,
  projection: projectionInput,
  canonicalTopology,
  sessionSnapshot,
} = {}) {
  const batch = assertTopologyEditTableBatch(batchInput);
  const plan = assertTopologyEditTableBatchPlan(planInput);
  const projection = assertTopologyEditTableProjection(projectionInput);
  const topology = assertCanonicalTopologyHash(canonicalTopology);
  if (plan.batchHash !== batch.batchHash) {
    throw new Error('TopologyEditTableRebase: plan does not belong to batch.');
  }
  const reasons = authorityReasons(batch, projection, topology, sessionSnapshot);
  reasons.push(...targetReasons(batch, projection));
  reasons.push(...dependencyReasons(plan, topology));
  if (reasons.length) return result('STALE_CONFLICT', batch, plan, topology, reasons);

  let rebasedBatch;
  let rebasedPlan;
  try {
    rebasedBatch = rebuildBatchAuthority(batch, projection, sessionSnapshot);
    rebasedPlan = planTopologyEditTableBatch({
      batch: rebasedBatch,
      projection,
      canonicalTopology: topology,
    });
  } catch (error) {
    return result('STALE_CONFLICT', batch, plan, topology, [{
      code: 'REPLAN_REJECTED',
      message: error instanceof Error ? error.message : String(error),
      canonicalIds: [],
    }]);
  }
  const semanticBefore = semanticPlanMaterial(plan);
  const semanticAfter = semanticPlanMaterial(rebasedPlan);
  if (semanticHash(semanticBefore) !== semanticHash(semanticAfter)) {
    return result('STALE_CONFLICT', batch, plan, topology, [{
      code: 'SEMANTIC_PLAN_CHANGED',
      message: 'Replanning against current authority changed exact command targets or payloads.',
      canonicalIds: changedTargetIds(semanticBefore.targetIds, semanticAfter.targetIds),
    }]);
  }
  return result('REBASED', batch, plan, topology, [], rebasedBatch, rebasedPlan);
}

function authorityReasons(batch, projection, topology, snapshot) {
  const reasons = [];
  const checks = [
    ['DATASET_ID_CHANGED', batch.authority.datasetId, projection.authority.datasetId],
    ['SOURCE_HASH_CHANGED', batch.authority.sourceHash, projection.authority.sourceHash],
    ['BASE_CANONICAL_CHANGED', batch.authority.baseCanonicalHash, snapshot?.baseAuthority?.baseCanonicalHash],
    ['SESSION_DATASET_CHANGED', projection.authority.datasetId, snapshot?.baseAuthority?.datasetId],
    ['SESSION_SOURCE_CHANGED', projection.authority.sourceHash, snapshot?.baseAuthority?.sourceHash],
    ['CURRENT_HASH_MISMATCH', projection.authority.canonicalTopologyHash, topology.canonicalTopologyHash],
    ['SESSION_HASH_MISMATCH', topology.canonicalTopologyHash, snapshot?.activeCanonicalTopologyHash],
  ];
  for (const [code, expected, actual] of checks) if (expected !== actual) {
    reasons.push({ code, message: `${code}: expected ${expected ?? '<null>'}, received ${actual ?? '<null>'}.`, canonicalIds: [] });
  }
  return reasons;
}

function targetReasons(batch, projection) {
  const reasons = [];
  for (const intent of batch.intents) {
    const matches = projection.rows.filter((row) => (
      row.identity.canonicalId === intent.target.canonicalId
    ));
    if (matches.length !== 1) {
      reasons.push({
        code: 'TARGET_RESOLUTION_CHANGED',
        message: `Target ${intent.target.canonicalId} resolved ${matches.length} current rows.`,
        canonicalIds: [intent.target.canonicalId],
      });
      continue;
    }
    if (matches[0].targetRevision !== intent.target.targetRevision) {
      reasons.push({
        code: 'TARGET_REVISION_CHANGED',
        message: `Target ${intent.target.canonicalId} changed since the table edit was staged.`,
        canonicalIds: [intent.target.canonicalId],
      });
    }
  }
  return reasons;
}

function dependencyReasons(plan, topology) {
  const reasons = [];
  for (const [id, expected] of Object.entries(plan.dependencyRevisions)) {
    try {
      const current = topologyEditTableCanonicalRevision(topology, id);
      if (current !== expected) reasons.push({
        code: 'DEPENDENCY_REVISION_CHANGED',
        message: `Dependency ${id} changed since the table batch was planned.`,
        canonicalIds: [id],
      });
    } catch (error) {
      reasons.push({
        code: 'DEPENDENCY_RESOLUTION_CHANGED',
        message: error instanceof Error ? error.message : String(error),
        canonicalIds: [id],
      });
    }
  }
  return reasons;
}

function semanticPlanMaterial(plan) {
  return {
    targetIds: [...plan.operationPlan.targetIds],
    commandIntents: plan.operationPlan.commandIntents.map((intent) => ({
      commandType: intent.commandType,
      payload: intent.payload,
    })),
    changedScope: {
      nodeIds: plan.operationPlan.changedScope.nodeIds,
      edgeIds: plan.operationPlan.changedScope.edgeIds,
      junctionIds: plan.operationPlan.changedScope.junctionIds,
      supportIds: plan.operationPlan.changedScope.supportIds,
      boundaryIds: plan.operationPlan.changedScope.boundaryIds,
      sourceRecordIds: plan.operationPlan.changedScope.sourceRecordIds,
      validationNeighbourhoodIds: plan.operationPlan.changedScope.validationNeighbourhoodIds,
    },
  };
}

function result(disposition, batch, plan, topology, reasons, rebasedBatch = null, rebasedPlan = null) {
  const normalizedReasons = [...reasons].sort((left, right) => (
    left.code.localeCompare(right.code)
      || left.canonicalIds.join(',').localeCompare(right.canonicalIds.join(','))
      || left.message.localeCompare(right.message)
  ));
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_REBASE_SCHEMA,
    disposition,
    priorBatchHash: batch.batchHash,
    priorPlanHash: plan.planHash,
    priorCanonicalHash: batch.authority.priorDraftHash,
    currentCanonicalHash: topology.canonicalTopologyHash,
    reasonCount: normalizedReasons.length,
    reasons: normalizedReasons,
    rebasedBatchHash: rebasedBatch?.batchHash ?? null,
    rebasedPlanHash: rebasedPlan?.planHash ?? null,
  };
  return deepFreeze({
    ...material,
    rebaseHash: semanticHash(material),
    rebasedBatch,
    rebasedPlan,
  });
}

function changedTargetIds(left, right) {
  const a = new Set(left); const b = new Set(right);
  return [...new Set([
    ...left.filter((id) => !b.has(id)),
    ...right.filter((id) => !a.has(id)),
  ])].sort();
}
