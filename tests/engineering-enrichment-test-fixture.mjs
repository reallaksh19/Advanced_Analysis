import { createSharedPipingModel } from '../src/core/shared-piping-model/shared-piping-model.js';
import {
  buildComponentWeightProposals,
  buildEnrichmentBaselineReference,
  buildEnrichmentEngineDescriptor,
  buildEnrichmentNumericalImpactReport,
  buildEnrichmentShadowCalculationRequest,
  buildEnrichmentStructuralImpactReport,
  buildEnrichmentTarget,
  buildMasterDataSnapshot,
  buildShadowCandidateProjection,
  executeEnrichmentShadowCalculation,
  resolveExactEnrichmentProposals,
} from '../src/workspace/engineering-enrichment/index.js';

export const SOURCE_SHA = 'a'.repeat(64);
export const DATASET_SHA = 'b'.repeat(64);

export function buildSharedModel() {
  return createSharedPipingModel({
    project: {
      datasetId: 'dataset:test',
      name: 'Test',
      sourceName: 'test.json',
    },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId: 'dataset:test',
      sourceSchema: 'test/v1',
      sourceSemanticHash: 'fnv1a64:1111111111111111',
      sourceByteHash: DATASET_SHA,
    },
    components: [{
      componentKey: 'entity:1',
      sourceEntityId: 'C-1',
      name: 'Gate valve',
      type: 'VALVE',
      identity: {
        lineId: 'L1',
        branchId: 'B1',
        systemId: 'S1',
        zoneId: 'Z1',
      },
      geometry: {
        center: { x: 0, y: 0, z: 0 },
        applicationPoint: { x: 0, y: 0, z: 0 },
        ports: [{
          portKey: 'entity:1:port:start',
          role: 'start',
          position: { x: 0, y: 0, z: 0 },
          sourceReference: { sourcePath: '/components/0/start' },
        }],
      },
      engineeringProperties: {},
      compatibilityEvidence: {},
      sourceReferences: {
        sourceNodeKey: 'node:1',
        sourceEntityId: 'C-1',
        jsonPointer: '/components/0',
        sourcePath: '/components/0',
      },
      diagnostics: [],
    }],
    supports: [],
    sourceReferences: {
      nodes: [{
        sourceNodeKey: 'node:1',
        sourceEntityId: 'C-1',
        jsonPointer: '/components/0',
        parentSourceNodeKey: null,
        childSourceNodeKeys: [],
        childIndex: 0,
        depth: 0,
        type: 'VALVE',
        name: 'Gate valve',
        sourcePath: '/components/0',
        lineId: 'L1',
        branchId: 'B1',
        systemId: 'S1',
        zoneId: 'Z1',
      }],
    },
    diagnostics: [],
  });
}

export function buildWeightSnapshot(weight = 12) {
  return buildMasterDataSnapshot({
    masterKey: 'weight',
    source: {
      fileName: 'weights.xlsx',
      sheetName: 'Weights',
      sha256: SOURCE_SHA,
      byteLength: 100,
    },
    mapping: { bore: 'Size', valveType: 'Type', weight: 'Weight' },
    normalizedRows: [{
      _sourceRowNumber: 2,
      bore: 50,
      valveType: 'VALVE',
      weight,
    }],
    diagnostics: [],
  });
}

export function buildDescriptor(overrides = {}) {
  return buildEnrichmentEngineDescriptor({
    engineId: 'empirical-shadow',
    engineVersion: '1.0.0',
    methodId: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    loadCaseIds: ['OPE', 'EMPTY'],
    metricIds: ['supportReactionN', 'totalMassKg'],
    ...overrides,
  });
}

export function buildBaselineReference(overrides = {}) {
  return buildEnrichmentBaselineReference({
    basisId: 'source-model-shadow',
    basisHash: 'fnv1a64:6666666666666666',
    ...overrides,
  });
}

export function engineOutput(weightDelta = 0, complete = true) {
  return {
    metrics: [
      {
        metricId: 'totalMassKg',
        scopeId: 'route:1',
        loadCaseId: 'EMPTY',
        value: 100 + weightDelta,
        unit: 'kg',
      },
      {
        metricId: 'supportReactionN',
        scopeId: 'support:1',
        loadCaseId: 'OPE',
        value: 980 + (weightDelta * 9.8),
        unit: 'N',
      },
    ],
    diagnostics: [],
    complete,
  };
}

export function buildPipeline({
  weight = 12,
  baselineComplete = true,
  candidateComplete = true,
  baselineOutput = null,
  candidateOutput = null,
} = {}) {
  const sharedModel = buildSharedModel();
  const masterSnapshot = buildWeightSnapshot(weight);
  const proposals = buildComponentWeightProposals({
    snapshot: masterSnapshot,
    policy: {
      schema: 'ComponentWeightAdapterPolicy.v1',
      adapterId: 'component-weight:test:v1',
      selectorKind: 'COMPONENT_TYPE_BORE',
      selectorMap: { componentType: 'valveType', boreMm: 'bore' },
      valueColumn: 'weight',
      sourceUnit: 'kg',
      canonicalUnit: 'kg',
    },
  });
  const targets = [buildEnrichmentTarget({
    targetId: 'entity:1',
    selector: proposals[0].selector,
  })];
  const resolution = resolveExactEnrichmentProposals({
    sourceDatasetHash: DATASET_SHA,
    sourceSharedModelHash: sharedModel.semanticHash,
    masterSnapshots: [masterSnapshot],
    proposals,
    targets,
  });
  const candidateProjection = buildShadowCandidateProjection({
    sourceSharedModel: sharedModel,
    resolution,
    proposals,
  });
  const structuralImpact = buildEnrichmentStructuralImpactReport({
    sourceSharedModel: sharedModel,
    candidateProjection,
  });
  const descriptor = buildDescriptor();
  const baselineReference = buildBaselineReference();
  const baselineRequest = buildEnrichmentShadowCalculationRequest({
    descriptor,
    variant: 'BASELINE',
    candidateProjection,
    structuralImpact,
    baselineReference,
  });
  const candidateRequest = buildEnrichmentShadowCalculationRequest({
    descriptor,
    variant: 'CANDIDATE',
    candidateProjection,
    structuralImpact,
    baselineReference,
  });
  const baselineResult = executeEnrichmentShadowCalculation({
    descriptor,
    request: baselineRequest,
    runEngine: () => baselineOutput || engineOutput(0, baselineComplete),
  });
  const candidateResult = executeEnrichmentShadowCalculation({
    descriptor,
    request: candidateRequest,
    runEngine: () => candidateOutput || engineOutput(weight, candidateComplete),
  });
  const numericalImpact = buildEnrichmentNumericalImpactReport({
    candidateProjection,
    structuralImpact,
    baselineResult,
    candidateResult,
  });
  return {
    sharedModel,
    masterSnapshot,
    proposals,
    targets,
    resolution,
    candidateProjection,
    structuralImpact,
    descriptor,
    baselineReference,
    baselineRequest,
    candidateRequest,
    baselineResult,
    candidateResult,
    numericalImpact,
  };
}
