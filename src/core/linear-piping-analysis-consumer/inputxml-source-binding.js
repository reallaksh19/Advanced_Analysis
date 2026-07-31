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
  INPUTXML_INGESTION_V2_KEYS,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
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
  inputXmlUnitEvidenceProjection,
  normalizeLinearPipingInputXmlGeometry,
  requireLinearPipingInputXmlUnitProfile,
} from './inputxml-unit-normalization.js';
import { sealLinearPipingInputXmlAnalysisContext } from './inputxml-analysis-context.js';
import {
  compileLinearPipingSourceAnalysisContext,
  validateLinearPipingSourceAnalysisRequest,
} from './source-orchestration.js';

const INPUTXML_REQUEST_SCHEMAS = Object.freeze([
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
]);

/** Existing Phase 2B result-only boundary, preserved for compatibility. */
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

/** Compile one sealed InputXML source into the retained B-2.5/B-3.0/T0 context. */
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

export function validateLinearPipingInputXmlAnalysisRequest(value) {
  requireRecord(value, 'inputXmlAnalysisRequest');
  requireExactKeys(value, INPUTXML_ANALYSIS_REQUEST_KEYS, 'inputXmlAnalysisRequest');
  if (!INPUTXML_REQUEST_SCHEMAS.includes(value.schema)) {
    failInputXml('InputXML analysis request schema is unsupported.', 'PIPING_INPUTXML_REQUEST_INVALID');
  }
  const inputXmlSource = requireLinearPipingInputXmlSource(value.inputXmlSource);
  const ingestionOptions = requireIngestionOptions(value.ingestionOptions, inputXmlSource, value.schema);
  const conditioning = requireConditioning(value.conditioning);
  const sourceAnalysisRequest = validateLinearPipingSourceAnalysisRequest(value.sourceAnalysisRequest);
  return Object.freeze({
    schema: value.schema,
    inputXmlSource,
    ingestionOptions,
    conditioning,
    sourceAnalysisRequest,
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

function requireIngestionOptions(value, source, schema) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions');
  const isV2 = schema === LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA;
  requireExactKeys(
    value,
    isV2 ? INPUTXML_INGESTION_V2_KEYS : INPUTXML_INGESTION_KEYS,
    'inputXmlAnalysisRequest.ingestionOptions',
  );
  const unit = requireText(value.unit, 'inputXmlAnalysisRequest.ingestionOptions.unit');
  if (!isV2 && unit !== CANONICAL_ANALYSIS_UNIT) {
    failInputXml(
      'InputXML request v1 unit must already be metres; use request v2 for governed conversion.',
      'PIPING_INPUTXML_UNIT_NOT_CANONICAL',
    );
  }
  const unitNormalizationProfile = isV2
    ? requireLinearPipingInputXmlUnitProfile(value.unitNormalizationProfile)
    : null;
  if (unitNormalizationProfile && !unitNormalizationProfile.allowedSourceUnits.includes(unit)) {
    failInputXml(
      'InputXML source unit is not authorized by the normalization profile.',
      'PIPING_INPUTXML_UNIT_NOT_AUTHORIZED',
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
    unit,
    source: value.source,
    componentOrigins: structuredClone(value.componentOrigins),
    restraintTypeCodeMap: { ...value.restraintTypeCodeMap },
    bendRadiusTolerance: { ...value.bendRadiusTolerance },
    unitNormalizationProfile,
  });
}

function requireComponentOrigins(value) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions.componentOrigins');
  for (const [nodeId, point] of Object.entries(value)) {
    requireText(nodeId, 'componentOrigins node id');
    requireRecord(point, `componentOrigins.${nodeId}`);
    requireExactKeys(point, ['x', 'y', 'z'], `componentOrigins.${nodeId}`);
    for (const component of ['x', 'y', 'z']) {
      requireFinite(point[component], `componentOrigins.${nodeId}.${component`);
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
