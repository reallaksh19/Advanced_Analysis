import { createTopologyEditTableBatch } from '../topology-edit/table/topology-edit-table-batch.js';
import { planTopologyEditTableBatch } from '../topology-edit/table/topology-edit-table-batch-planner.js';
import { createTopologyEditTableIntent } from '../topology-edit/table/topology-edit-table-intent.js';

export function stageTopologyEditValveReplacement(runtime, canonicalId) {
  return stage(runtime, () => createTopologyEditTableIntent({
    projection: runtime.projection,
    sessionSnapshot: runtime.controller.session.snapshot(),
    canonicalId,
    intentKind: 'VALVE_REPLACEMENT',
    requestedValue: {
      catalogueBinding: parseCatalogueJson(runtime),
      direction: 'FROM_TO',
    },
    geometryPolicy: {
      anchor: value(runtime, '[data-table-edit-anchor]'),
      propagation: value(runtime, '[data-table-edit-propagation]'),
    },
  }));
}

export function stageTopologyEditTeeReducerRelation(runtime, canonicalId) {
  return stage(runtime, () => {
    const row = exactRow(runtime.projection, canonicalId);
    const branchPortKey = required(value(runtime, '[data-table-edit-tee-branch-port]'), 'branch port');
    const binding = row.identity.portBindings.find((entry) => entry.portKey === branchPortKey);
    if (!binding?.nodeId) {
      throw new RangeError('TopologyEditTableEngineeringRuntime: selected branch port is not an exact row binding.');
    }
    const runNodeIds = row.identity.nodeIds.filter((id) => id !== binding.nodeId).sort();
    if (runNodeIds.length !== 2) {
      throw new RangeError('TopologyEditTableEngineeringRuntime: TEE branch selection must leave exactly two run nodes.');
    }
    return createTopologyEditTableIntent({
      projection: runtime.projection,
      sessionSnapshot: runtime.controller.session.snapshot(),
      canonicalId,
      intentKind: 'TEE_REDUCER_RELATION',
      requestedValue: {
        branchNodeId: binding.nodeId,
        branchPortKey,
        runNodeIds,
        reducerCanonicalId: required(value(runtime, '[data-table-edit-tee-reducer]'), 'reducer'),
        runNominalSizeMm: positive(value(runtime, '[data-table-edit-tee-run-dn]'), 'run DN'),
        teeBranchNominalSizeMm: positive(value(runtime, '[data-table-edit-tee-branch-dn]'), 'TEE branch DN'),
        downstreamNominalSizeMm: positive(value(runtime, '[data-table-edit-tee-downstream-dn]'), 'downstream DN'),
        relationPolicy: 'EXPLICIT_REDUCER',
      },
    });
  });
}

function stage(runtime, intentFactory) {
  try {
    const intent = intentFactory();
    const canonicalId = intent.target.canonicalId;
    const intents = [
      ...runtime.intents.filter((row) => row.target.canonicalId !== canonicalId),
      intent,
    ];
    const batch = createTopologyEditTableBatch({ intents });
    const batchPlan = planTopologyEditTableBatch({
      batch,
      projection: runtime.projection,
      canonicalTopology: runtime.controller.session.currentTopology(),
    });
    runtime.intents = intents;
    runtime.batch = batch;
    runtime.batchPlan = batchPlan;
    runtime.staleResult = null;
    runtime.clearCandidate();
    runtime.error = null;
    runtime.message = `${batch.intentCount} table change(s) staged against the exact certified revision.`;
  } catch (error) {
    runtime.error = error instanceof Error ? error.message : String(error);
  }
  runtime.render();
  return true;
}

function parseCatalogueJson(runtime) {
  const text = value(runtime, '[data-table-edit-valve-catalogue]');
  if (!text) throw new TypeError('TopologyEditTableEngineeringRuntime: exact BALL catalogue JSON is required.');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new TypeError('TopologyEditTableEngineeringRuntime: BALL catalogue JSON is invalid.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('TopologyEditTableEngineeringRuntime: BALL catalogue JSON must be one object.');
  }
  return parsed;
}
function exactRow(projection, canonicalId) {
  const rows = (projection?.rows ?? []).filter((row) => row.identity?.canonicalId === canonicalId);
  if (rows.length !== 1) {
    throw new RangeError(`TopologyEditTableEngineeringRuntime: ${canonicalId} resolved ${rows.length} rows.`);
  }
  return rows[0];
}
function value(runtime, selector) { return runtime.element?.querySelector(selector)?.value ?? ''; }
function required(input, label) {
  const text = String(input ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditTableEngineeringRuntime: ${label} is required.`);
  return text;
}
function positive(input, label) {
  const number = Number(input);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`TopologyEditTableEngineeringRuntime: ${label} must be positive.`);
  }
  return number;
}
