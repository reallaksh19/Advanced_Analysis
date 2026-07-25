import { deepFreeze } from '../shared-piping-model/index.js';
import { createPipingLoadCompositionProfile } from './composition-profile.js';
import { createStandardGravityProfile } from './gravity-profile.js';
import { createDefaultLoadCaseSet } from './load-case-set.js';
import { projectEngineeringLoadSources } from './load-source-projection.js';
import { buildModelLoadPrimitiveSet } from './primitive-builder.js';
import { createModelLoadReadinessAudit } from './readiness-audit.js';

export function buildModelLoadFoundation(sharedModel, topologyGraph, options = {}) {
  const gravityProfile = options.gravityProfile || createStandardGravityProfile();
  const loadCaseSet = options.loadCaseSet || createDefaultLoadCaseSet(options.caseOrder);
  const compositionProfile = options.compositionProfile || createPipingLoadCompositionProfile();
  const loadSourceProjection = projectEngineeringLoadSources(sharedModel, topologyGraph);
  const loadPrimitiveSet = buildModelLoadPrimitiveSet(
    loadSourceProjection,
    loadCaseSet,
    gravityProfile,
    compositionProfile,
  );
  const readinessAudit = createModelLoadReadinessAudit(loadCaseSet, loadPrimitiveSet);
  return deepFreeze({
    gravityProfile,
    loadCaseSet,
    compositionProfile,
    loadSourceProjection,
    loadPrimitiveSet,
    readinessAudit,
  });
}
