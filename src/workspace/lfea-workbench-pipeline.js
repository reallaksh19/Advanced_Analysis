/**
 * Public synchronous facade for the staged LFEA workbench pipeline.
 *
 * Browser controllers execute the same stage function inside a module Worker.
 * Tests and non-browser callers retain this deterministic synchronous facade.
 */
import {
  createLfeaWorkbenchAdapterProfile,
  createLfeaWorkbenchReviewProfile,
} from './lfea-pipeline-profiles.js';
import { runLfeaPipelineStages } from './lfea-pipeline-stages.js';

export {
  createLfeaWorkbenchAdapterProfile,
  createLfeaWorkbenchReviewProfile,
};

export function executeLfeaWorkbench(packageInput, options) {
  const configuration = options ?? {};
  const includeProjectedStress = configuration.includeProjectedStress ?? true;
  return runLfeaPipelineStages({
    packageInput,
    adapterProfile: configuration.adapterProfile
      ?? createLfeaWorkbenchAdapterProfile(),
    reviewProfile: configuration.reviewProfile
      ?? createLfeaWorkbenchReviewProfile(
        includeProjectedStress,
        Boolean(configuration.convergenceStudy),
      ),
    includeProjectedStress,
    convergenceStudy: configuration.convergenceStudy ?? null,
    convergenceResult: configuration.convergenceResult ?? null,
    untilStage: configuration.untilStage ?? null,
    onProgress: configuration.onProgress,
  });
}
