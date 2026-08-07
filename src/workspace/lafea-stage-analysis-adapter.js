/** Canonical stage-adapter boundary for LAFEA orchestration. */
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import { requireLafeaPreparationProfile } from './lafea-preparation-profile.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_STAGE_ANALYSIS_ADAPTER_SCHEMA = 'lafea-stage-analysis-adapter/v1';

const MESH = Object.freeze({
  'LAFEA.1': Object.freeze({ families: [], nodePath: null, elementPath: null }),
  'LAFEA.2': Object.freeze({ families: [], nodePath: null, elementPath: null }),
  'LAFEA.3': Object.freeze({ families: Object.freeze(['T3', 'T6', 'Q8']), nodePath: 'nodes', elementPath: 'elements' }),
  'LAFEA.4': Object.freeze({ families: Object.freeze(['CST_DKT_TRI3_THIN_SHELL_V1']), nodePath: 'nodes', elementPath: 'elements' }),
  'LAFEA.5': Object.freeze({ families: Object.freeze(['CST_DKT_TRI3_THIN_SHELL_V1']), nodePath: 'shellTemplate.nodes', elementPath: 'shellTemplate.elements' }),
  'LAFEA.6': Object.freeze({ families: [], nodePath: null, elementPath: null }),
});

export function requireLafeaStageAnalysisAdapter(stageId) {
  const registry = requireLafeaStageRegistryEntry(stageId);
  const lifecycle = requireLafeaLifecycleProfileForStage(stageId);
  const preparation = requireLafeaPreparationProfile(stageId);
  const mesh = MESH[stageId];
  if (!mesh) throw adapterError('LAFEA_STAGE_ANALYSIS_ADAPTER_MISSING');
  const supported = registry.engineState === 'QUALIFIED_ROUTE_REGISTERED';
  const meshApplicable = lifecycle.meshApplicable === true;
  if (meshApplicable !== (mesh.families.length > 0)) throw adapterError('LAFEA_STAGE_ANALYSIS_ADAPTER_MESH_PROFILE_MISMATCH');

  return freeze({
    schema: LAFEA_STAGE_ANALYSIS_ADAPTER_SCHEMA,
    adapterId: `LAFEA_STAGE_ADAPTER:${stageId}:V1`,
    stageId,
    lifecycleProfileId: lifecycle.profileId,
    engineState: registry.engineState,
    preparation: {
      adapterId: supported ? `LAFEA_PREPARATION_ADAPTER:${stageId}:V1` : null,
      qualified: supported,
      profileId: preparation.profileId,
      profileHash: preparation.semanticHash,
      analysisGeometryRequired: preparation.analysisGeometryRequired,
      producerQualified: preparation.producerQualified,
      qualifiedProducerRef: preparation.qualifiedProducerRef,
      reason: supported ? preparation.missingProducerReason : 'STAGE_ENGINE_NOT_IMPLEMENTED',
    },
    discretization: {
      applicable: meshApplicable,
      allowedElementFamilies: [...mesh.families],
      sourceNodePath: mesh.nodePath,
      sourceElementPath: mesh.elementPath,
      qualifiedProducerId: null,
      generationAuthorized: false,
      refinementAuthorized: false,
    },
    execution: {
      adapterId: supported ? `ENGINE:${registry.enginePackage}` : null,
      qualifiedRouteRegistered: supported,
    },
    results: { adapterId: registry.presenterRole ? `PRESENTER:${registry.presenterRole}` : null },
    release: { qualified: false, reason: 'RELEASE_NOT_QUALIFIED' },
  });
}

export function lafeaStageAnalysisAdapter(stageId) { return requireLafeaStageAnalysisAdapter(stageId); }
function adapterError(code) { const error = new TypeError(code); error.code = code; return error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
