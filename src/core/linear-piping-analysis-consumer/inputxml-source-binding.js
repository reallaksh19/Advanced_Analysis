import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { canonicalStringify, semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { inputXmlToCanonicalGeometry } from '../geometry/adapters/inputXmlToCanonicalGeometry.js';
import { conditionGeometry } from '../centerline-beam-fea/index.js';
import {
  CANONICAL_ANALYSIS_UNIT,
  INPUTXML_ANALYSIS_REQUEST_KEYS,
  INPUTXML_CONDITIONING_KEYS,
  INPUTXML_INGESTION_KEYS,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA,
  compareAscii,
  computeInputXmlAnalysisResultEvidenceHash,
  computeInputXmlAnalysisResultSemanticHash,
  failInputXml,
  requireExactKeys,
  requireFinite,
  requireLinearPipingInputXmlAnalysisResult,
  requireLinearPipingInputXmlSource,
  requireRecord,
  requireText,
} from './inputxml-source-contract.js';
import {
  runLinearPipingAnalysisFromSourceAuthorities,
  validateLinearPipingSourceAnalysisRequest,
} from './source-orchestration.js';

/**
 * Recompute InputXML geometry and B-1 conditioning, bind those identities to
 * an existing Phase 2A request, then delegate B-2.5/B-3.0/T0 execution.
 * Material, section, local-axis, constraint and load authorities remain
 * caller-supplied through the Phase 2A request and are never inferred here.
 */
export function runLinearPipingAnalysisFromInputXml(request, runtime) {
  const accepted = validateLinearPipingInputXmlAnalysisRequest(request);
  const source = accepted.inputXmlSource;
  const bendRadiusTolerance = requireDeclaredValue(
    accepted.ingestionOptions,
    'bendRadiusTolerance',
    { exclusiveMinimum: 0 },
  );
  const geometry = inputXmlToCanonicalGeometry(source.content, {
    unit: accepted.ingestionOptions.unit,
    source: accepted.ingestionOptions.source,
    componentOrigins: accepted.ingestionOptions.componentOrigins,
    restraintTypeCodeMap: accepted.ingestionOptions.restraintTypeCodeMap,
    bendRadiusTolerance,
    fileName: source.fileName,
  });
  requireValidInputXmlGeometry(geometry);
  const conditionedTopology = conditionGeometry(
    geometry,
    accepted.conditioning.requiredAttachmentPoints,
    accepted.conditioning.profile,
  );
  requireSourceRequestMatchesInputXml(
    accepted.sourceAnalysisRequest,
    source,
    conditionedTopology,
  );
  const boundSourceRequest = {
    ...accepted.sourceAnalysisRequest,
    mechanicalModelInput: {
      ...accepted.sourceAnalysisRequest.mechanicalModelInput,
      sourceSemanticHash: source.semanticHash,
      conditionedTopology,
    },
  };
  const analysisResult = runLinearPipingAnalysisFromSourceAuthorities(
    boundSourceRequest,
    runtime,
  );
  return sealInputXmlAnalysisResult({
    source,
    geometry,
    conditionedTopology,
    analysisResult,
  });
}

export function validateLinearPipingInputXmlAnalysisRequest(value) {
  requireRecord(value, 'inputXmlAnalysisRequest');
  requireExactKeys(value, INPUTXML_ANALYSIS_REQUEST_KEYS, 'inputXmlAnalysisRequest');
  if (value.schema !== LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA) {
    failInputXml(
      'InputXML analysis request schema is unsupported.',
      'PIPING_INPUTXML_REQUEST_INVALID',
    );
  }
  const inputXmlSource = requireLinearPipingInputXmlSource(value.inputXmlSource);
  const ingestionOptions = requireIngestionOptions(value.ingestionOptions, inputXmlSource);
  const conditioning = requireConditioning(value.conditioning);
  const sourceAnalysisRequest = validateLinearPipingSourceAnalysisRequest(
    value.sourceAnalysisRequest,
  );
  return Object.freeze({
    schema: value.schema,
    inputXmlSource,
    ingestionOptions,
    conditioning,
    sourceAnalysisRequest,
  });
}

function sealInputXmlAnalysisResult({ source, geometry, conditionedTopology, analysisResult }) {
  const draft = {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA,
    sourceSemanticHash: source.semanticHash,
    contentHash: source.contentHash,
    conditionedTopologyHash: conditionedTopology.semanticHash,
    ingestionEvidence: deepFreeze({
      fileName: source.fileName,
      unit: geometry.unit,
      source: geometry.source,
      geometryDiagnosticCodes: Object.freeze(
        (geometry.diagnostics ?? []).map((row) => row.code).filter(Boolean).sort(compareAscii),
      ),
      conditioningReport: conditionedTopology.report,
    }),
    analysisResult,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInputXmlAnalysisResultSemanticHash(draft);
  draft.evidenceHash = computeInputXmlAnalysisResultEvidenceHash(draft);
  return requireLinearPipingInputXmlAnalysisResult(draft);
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

function requireIngestionOptions(value, source) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions');
  requireExactKeys(value, INPUTXML_INGESTION_KEYS, 'inputXmlAnalysisRequest.ingestionOptions');
  if (value.unit !== CANONICAL_ANALYSIS_UNIT) {
    failInputXml(
      'InputXML analysis unit must already be metres; this gateway does not convert units.',
      'PIPING_INPUTXML_UNIT_NOT_CANONICAL',
    );
  }
  if (value.source !== source.sourceId) {
    failInputXml(
      'InputXML ingestion source must equal the sealed source identity.',
      'PIPING_INPUTXML_SOURCE_MISMATCH',
    );
  }
  requireComponentOrigins(value.componentOrigins);
  requireRestraintMap(value.restraintTypeCodeMap);
  requireDeclaredValue(value, 'bendRadiusTolerance', { exclusiveMinimum: 0 });
  return deepFreeze({
    unit: value.unit,
    source: value.source,
    componentOrigins: structuredClone(value.componentOrigins),
    restraintTypeCodeMap: { ...value.restraintTypeCodeMap },
    bendRadiusTolerance: { ...value.bendRadiusTolerance },
  });
}

function requireComponentOrigins(value) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions.componentOrigins');
  for (const [nodeId, point] of Object.entries(value)) {
    requireText(nodeId, 'componentOrigins node id');
    requireRecord(point, `componentOrigins.${nodeId}`);
    requireExactKeys(point, ['x', 'y', 'z'], `componentOrigins.${nodeId}`);
    for (const component of ['x', 'y', 'z']) {
      requireFinite(point[component], `componentOrigins.${nodeId}.${component}`);
    }
  }
}

function requireRestraintMap(value) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions.restraintTypeCodeMap');
  for (const [code, kind] of Object.entries(value)) {
    requireText(code, 'InputXML restraint code');
    if (!['ANCHOR', 'GUIDE'].includes(kind)) {
      failInputXml(
        'InputXML restraint map contains an unsupported kind.',
        'PIPING_INPUTXML_RESTRAINT_MAP_INVALID',
      );
    }
  }
}

function requireConditioning(value) {
  requireRecord(value, 'inputXmlAnalysisRequest.conditioning');
  requireExactKeys(value, INPUTXML_CONDITIONING_KEYS, 'inputXmlAnalysisRequest.conditioning');
  if (!Array.isArray(value.requiredAttachmentPoints)) {
    failInputXml(
      'InputXML required attachment points must be an array.',
      'PIPING_INPUTXML_CONDITIONING_INVALID',
    );
  }
  requireRecord(value.profile, 'inputXmlAnalysisRequest.conditioning.profile');
  requireDeclaredValue(value.profile, 'spanSeedingLimit', { exclusiveMinimum: 0 });
  requireDeclaredValue(value.profile, 'bendSeedingSegments', { minimum: 2 });
  requireDeclaredValue(value.profile, 'bendLengthErrorLimit', { exclusiveMinimum: 0 });
  return deepFreeze({
    requiredAttachmentPoints: structuredClone(value.requiredAttachmentPoints),
    profile: structuredClone(value.profile),
  });
}

function requireValidInputXmlGeometry(geometry) {
  const errorCodes = (geometry.diagnostics ?? [])
    .filter((row) => row.severity === 'error' || row.severity === 'ERROR')
    .map((row) => row.code);
  if (geometry.valid !== true || errorCodes.length > 0) {
    failInputXml(
      'InputXML geometry is invalid and cannot enter B-1 conditioning.',
      'PIPING_INPUTXML_GEOMETRY_INVALID',
      { errorCodes },
    );
  }
}

function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, ...projection } = geometry;
  return projection;
}
