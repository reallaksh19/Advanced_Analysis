import { engineeringModelStore } from '../engineering-model-store.js';
import { masterDataController } from '../master-data-controller.js';
import { AuthorizedEnrichmentConsumerController } from './authorized-enrichment-consumer-controller.js';

/** Single production composition root for authorized empirical execution. */
export const authorizedEnrichmentConsumerController = new AuthorizedEnrichmentConsumerController({
  engineeringModelStore,
  masterDataController,
});
