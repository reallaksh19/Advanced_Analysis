import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../../../core/piping-topology/topology-graph.js';
import { normalizeWorkspaceDataset } from '../../dataset-adapter.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../topology-edit-source-adapter.js';
import {
  assertTopologyEditRoundTripSemantics,
  compareTopologyEditRoundTripSemantics,
} from './topology-edit-roundtrip-semantics.js';
import {
  assertTopologyEditStagedJsonWriteback,
  prepareTopologyEditStagedJsonWriteback,
} from './topology-edit-stagedjson-writeback.js';

export const TOPOLOGY_EDIT_STAGEDJSON_ROUNDTRIP_SCHEMA =
  'TopologyEditStagedJsonRoundTrip.v1';

export function qualifyTopologyEditStagedJsonRoundTrip(input = {}) {
  const writeback = prepareTopologyEditStagedJsonWriteback(input);
  assertTopologyEditStagedJsonWriteback(writeback);

  const reimportedDataset = normalizeWorkspaceDataset(
    writeback.surgical.sourcePackage,
    input.dataset.sourceName,
  );
  if (reimportedDataset.datasetId !== input.dataset.datasetId) {
    throw new RangeError(
      `StagedJSON roundtrip: dataset identity changed from ${input.dataset.datasetId} to ${reimportedDataset.datasetId}.`,
    );
  }
  const graph = buildPipingPortTopologyGraph(reimportedDataset.sharedModel, input.topologyProfile ?? null);
  const reimportedCanonical = buildCanonicalTopologyFromWorkspaceDataset(
    reimportedDataset,
    graph,
    input.attachmentModel ?? null,
    input.restraintModel ?? null,
  );
  const comparison = compareTopologyEditRoundTripSemantics({
    expectedTopology: input.canonicalTopology,
    actualTopology: reimportedCanonical,
    identityMap: input.identityMap ?? {},
    coordinateToleranceMm: input.coordinateToleranceMm ?? 0,
    compareCatalogueEvidence: input.compareCatalogueEvidence !== false,
  });
  assertTopologyEditRoundTripSemantics(comparison);
  if (comparison.status !== 'EQUIVALENT') {
    const summary = comparison.mismatches
      .slice(0, 5)
      .map((row) => `${row.collection}:${row.canonicalId}:${row.kind}`)
      .join(', ');
    throw new RangeError(`StagedJSON roundtrip: engineering semantics changed after production re-import: ${summary}.`);
  }
  const material = {
    schema: TOPOLOGY_EDIT_STAGEDJSON_ROUNDTRIP_SCHEMA,
    datasetId: input.dataset.datasetId,
    sourceSchema: input.dataset.sourceSchema,
    canonicalTopologyHash: input.canonicalTopology.canonicalTopologyHash,
    writebackHash: writeback.writebackHash,
    resultingSourceSemanticHash: writeback.resultingSourceSemanticHash,
    reimportedSourceHash: reimportedDataset.sourceSnapshot.sourceSemanticHash,
    reimportedCanonicalTopologyHash: reimportedCanonical.canonicalTopologyHash,
    comparisonHash: comparison.comparisonHash,
    status: 'QUALIFIED',
  };
  return deepFreeze({
    ...material,
    roundTripHash: semanticHash(material),
    writeback,
    comparison,
    reimportedDataset,
    reimportedCanonical,
  });
}

export function assertTopologyEditStagedJsonRoundTrip(value) {
  if (value?.schema !== TOPOLOGY_EDIT_STAGEDJSON_ROUNDTRIP_SCHEMA) {
    throw new TypeError(`StagedJSON roundtrip must use ${TOPOLOGY_EDIT_STAGEDJSON_ROUNDTRIP_SCHEMA}.`);
  }
  const {
    roundTripHash,
    writeback: _writeback,
    comparison: _comparison,
    reimportedDataset: _dataset,
    reimportedCanonical: _canonical,
    ...material
  } = value;
  if (semanticHash(material) !== roundTripHash || value.status !== 'QUALIFIED') {
    throw new Error('StagedJSON roundtrip: qualification authority mismatch.');
  }
  assertTopologyEditStagedJsonWriteback(value.writeback);
  assertTopologyEditRoundTripSemantics(value.comparison);
  if (value.comparison.status !== 'EQUIVALENT') {
    throw new Error('StagedJSON roundtrip: non-equivalent comparison cannot be qualified.');
  }
  return value;
}
