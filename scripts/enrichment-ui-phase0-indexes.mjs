export { buildEnrichmentUiIndexes } from './enrichment-ui-phase0-index-core.mjs';
export {
  applyFilter,
  buildExceptionQueues,
  buildGroups,
  buildVisibleOrder,
  lookupContainmentCandidates,
  lookupNormalizedLineKey,
} from './enrichment-ui-phase0-index-query.mjs';
export {
  assertIndexInvariants,
  indexEvidence,
  materializeComponentViewport,
  materializeViewport,
} from './enrichment-ui-phase0-index-viewport.mjs';
