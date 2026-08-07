import {
  compileNonFeaMassLedger,
  createNonFeaAnalysisTopology,
  createNonFeaEngineeringFoundationBundle,
  createNonFeaThermalAssignmentAuthority,
  createNonFeaThermalFreeMovementBasis,
} from '../core/non-fea-engineering-foundation/index.js';
import { ModelLoadStore } from './model-load-store.js';
import { buildCurrentPreFeaRequestInput } from './non-fea-common-input-runtime.js';
import { SupportLoadScreeningStore } from './support-load-screening-store.js';

/**
 * Builds the current common preprocessing foundation without authorizing or
 * executing any calculation. No workspace store is mutated.
 */
export function buildCurrentNonFeaEngineeringFoundation() {
  const request = buildCurrentPreFeaRequestInput();
  const modelLoadFoundation = ModelLoadStore.getFoundation();
  const massLedger = buildMassLedger(request, modelLoadFoundation);
  const pathSnapshot = SupportLoadScreeningStore.getSnapshot();

  return createNonFeaEngineeringFoundationBundle({
    sourceModelSemanticHash: request.sourceModel.semanticHash,
    enrichmentProjectionSemanticHash: request.enrichedProjection.semanticHash,
    projectDataRevision: request.projectDataProfile.revision,
    loadCaseAuthority: request.loadCaseAuthority || null,
    modelLoadFoundation,
    massLedger,
    topologyGraph: request.authorityContracts.topologyGraph,
    supportAttachmentModel: request.authorityContracts.supportAttachmentModel,
    restraintCapabilityModel: request.authorityContracts.restraintCapabilityModel,
    supportSiteModel: request.authorityContracts.supportSiteModel,
    routePartitionModel: request.authorityContracts.routePartitionModel,
    verticalLoadPathProfile: pathSnapshot.profile,
    verticalLoadPathModel: pathSnapshot.pathModel,
  });
}

/**
 * Builds the additive common analysis-topology projection. This is read-only
 * preparation and is intentionally not yet a required Engineering Foundation
 * capability or method-authorization dependency.
 */
export function buildCurrentNonFeaAnalysisTopology() {
  const request = buildCurrentPreFeaRequestInput();
  return createNonFeaAnalysisTopology({
    topologyGraph: request.authorityContracts.topologyGraph,
    supportAttachmentModel: request.authorityContracts.supportAttachmentModel,
    restraintCapabilityModel: request.authorityContracts.restraintCapabilityModel,
    supportSiteModel: request.authorityContracts.supportSiteModel,
    routePartitionModel: request.authorityContracts.routePartitionModel,
  });
}

/**
 * Builds thermal-only free movement from explicit schema-bearing Project Data
 * assignments. Callers must name the thermal load cases; this helper never
 * assumes which project cases represent thermal operation.
 */
export function buildCurrentNonFeaThermalFreeMovementBasis(requestedLoadCaseIds) {
  const request = buildCurrentPreFeaRequestInput();
  const thermalAssignmentAuthority = createNonFeaThermalAssignmentAuthority({
    projectDataProfile: request.projectDataProfile,
  });
  const thermalFreeMovementBasis = createNonFeaThermalFreeMovementBasis({
    sharedModel: request.sourceModel,
    topologyGraph: request.authorityContracts.topologyGraph,
    thermalAssignmentAuthority,
    requestedLoadCaseIds,
  });
  return Object.freeze({ thermalAssignmentAuthority, thermalFreeMovementBasis });
}

function buildMassLedger(request, foundation) {
  if (!foundation?.loadCaseSet
    || !foundation?.loadPrimitiveSet
    || !foundation?.readinessAudit
    || !(foundation?.gravityProfile?.accelerationMPerS2 > 0)) {
    return null;
  }
  return compileNonFeaMassLedger({
    sourceSemanticHash: request.sourceModel.semanticHash,
    enrichmentProjectionSemanticHash: request.enrichedProjection.semanticHash,
    modelLoadFoundation: foundation,
  });
}