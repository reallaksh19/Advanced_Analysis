import { engineeringModelStore } from '../engineering-model-store.js';
import { masterDataController } from '../master-data-controller.js';
import { nonFeaCommonInputStore } from '../non-fea-common-input-store.js';
import { AuthorizedEnrichmentConsumerController } from './authorized-enrichment-consumer-controller.js';

/** Single production composition root for common-input-bound empirical execution. */
export const authorizedEnrichmentConsumerController = new AuthorizedEnrichmentConsumerController({
  engineeringModelStore,
  masterDataController,
  commonInputStore: nonFeaCommonInputStore,
});
