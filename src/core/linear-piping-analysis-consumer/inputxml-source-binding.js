import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { canonicalStringify, semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { inputXmlToCanonicalGeometry } from '../geometry/adapters/inputXmlToCanonicalGeometry.js';
import { conditionGeometry } from '../centerline-beam-fea/index.js';
import {
  CANONICAL_ANALYSIS_UNIT,
  LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA,
  compareAscii,
  computeInputXmlAnalysisResultEvidenceHash,
  computeInputXmlAnalysisResultSemanticHash,
  failInputXml,
  requireLinearPipingInputXmlAnalysisResult,
} from './inputxml-source-contract.js';
import { inputXmlUnitEvidenceProjection } from './inputxml-unit-contract.js';
import { normalizeLinearPipingInputXmlGeometry } from './inputxml-unit-normalization.js';
import { sealLinearPipingInputXmlAnalysisContext } from './inputxml-analysis-context.js';
import { compileLinearPipingSourceAnalysisContext } from './source-orchestration.js';
import { validateLinearPipingInputXmlAnalysisRequest } from './inputxml-request-validation.js';

export { validateLinearPipingInputXmlAnalysisRequest } from './inputxml-request-validation.js';

// The single point of entry for raw InputXML text into this directory's
// governed Phase 2A binding below and into the generic (non-benchmark)
// solve path. Any other file needing InputXML text parsed to canonical
// geometry must go through this export rather than importing the adapter
// directly -- see linear-piping-analysis-consumer-anti-drift-check.mjs.
export function parseInputXmlToCanonicalGeometry(content, options) {
  return inputXmlToCanonicalGeometry(content, options);
}

export function runLinearPipingAnalysisFromInputXml(request, runtime) {
  const compiled = compileBoundInputXml(request, runtime);
  return sealInputXmlAnalysisResult({
    source: compiled.source,
    geometry: compiled.geometry,
    conditionedTopology: compiled.conditionedTopology,
    analysisResult: compiled.sourceAnalysisContext.analysisResult,
    unitNormalization: compiled.unitNormalization,
  });
}

export function compileLinearPipingInputXmlAnalysisContext(request, runtime) {
  const compiled = compileBoundInputXml(request, runtime);
  return sealLinearPipingInputXmlAnalysisContext({
    inputXmlSource: compiled.source,
    conditionedTopologyHash: compiled.conditionedTopology.semanticHash,
    ingestionEvidence: ingestionEvidence(
      compiled.source,
      compiled.geometry,
      compiled.conditionedTopology,
      compiled.unitNormalization,
    ),
    sourceAnalysisContext: compiled.sourceAnalysisContext,
  });
}

function compileBoundInputXml(request, runtime) {
  const accepted = validateLinearPipingInputXmlAnalysisRequest(request);
  const source = accepted.inputXmlSource;
  const bendRadiusTolerance = requireDeclaredValue(
    accepted.ingestionOptions,
    'bendRadiusTolerance',
    { exclusiveMinimum: 0 },
  );
  const parsedGeometry = inputXmlToCanonicalGeometry(source.content, {
    unit: accepted.ingestionOptions.unit,
    source: accepted.ingestionOptions.source,
    componentOrigins: accepted.ingestionOptions.componentOrigins,
    restraintTypeCodeMap: accepted.ingestionOptions.restraintTypeCodeMap,
    restraintTypeMutation: accepted.ingestionOptions.restraintTypeMutation,
    bendRadiusTolerance,
    fileName: source.fileName,
  });
  const unitNormalization = accepted.ingestionOptions.unitNormalizationProfile === null
    ? null
    : normalizeLinearPipingInputXmlGeometry(
      parsedGeometry,
      accepted.ingestionOptions.unitNormalizationProfile,
    );
  const geometry = unitNormalization?.geometry ?? parsedGeometry;
  requireValidInputXmlGeometry(geometry);
  const conditionedTopology = conditionGeometry(
    geometry,
    accepted.conditioning.requiredAttachmentPoints,
    accepted.conditioning.profile,
  );
  requireSourceRequestMatchesInputXml(accepted.sourceAnalysisRequest, source, conditionedTopology);
  const boundSourceRequest = {
    ...accepted.sourceAnalysisRequest,
    mechanicalModelInput: {
      ...accepted.sourceAnalysisRequest.mechanicalModelInput,
      sourceSemanticHash: source.semanticHash,
      conditionedTopology,
    },
  };
  const sourceAnalysisContext = compileLinearPipingSourceAnalysisContext(boundSourceRequest, runtime);
  return Object.freeze({
    source,
    geometry,
    conditionedTopology,
    sourceAnalysisContext,
    unitNormalization,
  });
}

function sealInputXmlAnalysisResult({
  source,
  geometry,
  conditionedTopology,
  analysisResult,
  unitNormalization,
}) {
  const draft = {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA,
    sourceSemanticHash: source.semanticHash,
    contentHash: source.contentHash,
    conditionedTopologyHash: conditionedTopology.semanticHash,
    ingestionEvidence: ingestionEvidence(source, geometry, conditionedTopology, unitNormalization),
    analysisResult,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInputXmlAnalysisResultSemanticHash(draft);
  draft.evidenceHash = computeInputXmlAnalysisResultEvidenceHash(draft);
  return requireLinearPipingInputXmlAnalysisResult(draft);
}

function ingestionEvidence(source, geometry, conditionedTopology, unitNormalization) {
  const conditioningReport = unitNormalization === null
    ? conditionedTopology.report
    : deepFreeze({
      ...structuredClone(conditionedTopology.report),
      unitNormalization: inputXmlUnitEvidenceProjection(unitNormalization),
    });
  return deepFreeze({
    fileName: source.fileName,
    unit: geometry.unit,
    source: geometry.source,
    geometryDiagnosticCodes: Object.freeze(
      (geometry.diagnostics ?? []).map((row) => row.code).filter(Boolean).sort(compareAscii),
    ),
    conditioningReport,
  });
}

function requireSourceRequestMatchesInputXml(sourceRequest, source, conditionedTopology) {
  const modelInput = sourceRequest.mechanicalModelInput;
  if (modelInput.sourceSemanticHash !== source.semanticHash
    || sourceRequest.expectedSourceAuthorities.sourceSemanticHash !== source.semanticHash) {
    failInputXml(
      'Phase 2A source identity does not match the sealed InputXML authority.',
      'PIPING_INPUTXML_SOURCE_AUTHORITY_MISMATCH',
    );
  }
  const suppliedTopology = modelInput.conditionedTopology;
  if (suppliedTopology.semanticHash !== conditionedTopology.semanticHash
    || semanticHash(geometryProjection(suppliedTopology.geometry)) !== conditionedTopology.semanticHash
    || canonicalStringify(geometryProjection(suppliedTopology.geometry))
      !== canonicalStringify(geometryProjection(conditionedTopology.geometry))) {
    failInputXml(
      'Caller-supplied conditioned topology does not match recomputed InputXML conditioning.',
      'PIPING_INPUTXML_TOPOLOGY_MISMATCH',
    );
  }
  if (sourceRequest.expectedSourceAuthorities.conditionedTopologyHash
    !== conditionedTopology.semanticHash) {
    failInputXml(
      'Phase 2A expected topology hash does not match recomputed InputXML conditioning.',
      'PIPING_INPUTXML_TOPOLOGY_AUTHORITY_MISMATCH',
    );
  }
}

function requireValidInputXmlGeometry(geometry) {
  const errorCodes = (geometry.diagnostics ?? [])
    .filter((row) => row.severity === 'error' || row.severity === 'ERROR')
    .map((row) => row.code);
  if (geometry.valid !== true || errorCodes.length > 0 || geometry.unit !== CANONICAL_ANALYSIS_UNIT) {
    failInputXml(
      'InputXML geometry is invalid or non-canonical and cannot enter B-1 conditioning.',
      'PIPING_INPUTXML_GEOMETRY_INVALID',
      { errorCodes, unit: geometry.unit },
    );
  }
}

function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, ...projection } = geometry;
  return projection;
}
