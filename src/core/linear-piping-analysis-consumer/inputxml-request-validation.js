import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  defaultRestraintTypeMutationConfig,
  normalizeRestraintTypeMutationConfig,
} from '../geometry/adapters/inputxml-restraint-type-mutation.js';
import {
  CANONICAL_ANALYSIS_UNIT,
  INPUTXML_ANALYSIS_REQUEST_KEYS,
  INPUTXML_CONDITIONING_KEYS,
  INPUTXML_INGESTION_KEYS,
  INPUTXML_INGESTION_V2_KEYS,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
  failInputXml,
  requireExactKeys,
  requireFinite,
  requireLinearPipingInputXmlSource,
  requireRecord,
  requireText,
} from './inputxml-source-contract.js';
import { requireLinearPipingInputXmlUnitProfile } from './inputxml-unit-contract.js';
import { validateLinearPipingSourceAnalysisRequest } from './source-orchestration.js';

const INPUTXML_REQUEST_SCHEMAS = Object.freeze([
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
]);

export function validateLinearPipingInputXmlAnalysisRequest(value) {
  requireRecord(value, 'inputXmlAnalysisRequest');
  requireExactKeys(value, INPUTXML_ANALYSIS_REQUEST_KEYS, 'inputXmlAnalysisRequest');
  if (!INPUTXML_REQUEST_SCHEMAS.includes(value.schema)) {
    failInputXml('InputXML analysis request schema is unsupported.', 'PIPING_INPUTXML_REQUEST_INVALID');
  }
  const inputXmlSource = requireLinearPipingInputXmlSource(value.inputXmlSource);
  const ingestionOptions = requireIngestionOptions(
    value.ingestionOptions,
    inputXmlSource,
    value.schema,
  );
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

function requireIngestionOptions(value, source, schema) {
  requireRecord(value, 'inputXmlAnalysisRequest.ingestionOptions');
  const isV2 = schema === LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA;
  const accepted = {
    restraintTypeMutation: defaultRestraintTypeMutationConfig(),
    ...value,
  };
  requireExactKeys(
    accepted,
    isV2 ? INPUTXML_INGESTION_V2_KEYS : INPUTXML_INGESTION_KEYS,
    'inputXmlAnalysisRequest.ingestionOptions',
  );
  const unit = requireText(accepted.unit, 'inputXmlAnalysisRequest.ingestionOptions.unit');
  if (!isV2 && unit !== CANONICAL_ANALYSIS_UNIT) {
    failInputXml(
      'InputXML request v1 unit must already be metres; use request v2 for governed conversion.',
      'PIPING_INPUTXML_UNIT_NOT_CANONICAL',
    );
  }
  const unitNormalizationProfile = isV2
    ? requireLinearPipingInputXmlUnitProfile(accepted.unitNormalizationProfile)
    : null;
  if (unitNormalizationProfile && !unitNormalizationProfile.allowedSourceUnits.includes(unit)) {
    failInputXml(
      'InputXML source unit is not authorized by the normalization profile.',
      'PIPING_INPUTXML_UNIT_NOT_AUTHORIZED',
    );
  }
  if (accepted.source !== source.sourceId) {
    failInputXml(
      'InputXML ingestion source must equal the sealed source identity.',
      'PIPING_INPUTXML_SOURCE_MISMATCH',
    );
  }
  requireComponentOrigins(accepted.componentOrigins);
  requireRestraintMap(accepted.restraintTypeCodeMap);
  const restraintTypeMutation = requireRestraintMutation(accepted.restraintTypeMutation);
  requireDeclaredValue(accepted, 'bendRadiusTolerance', { exclusiveMinimum: 0 });
  return deepFreeze({
    unit,
    source: accepted.source,
    componentOrigins: structuredClone(accepted.componentOrigins),
    restraintTypeCodeMap: { ...accepted.restraintTypeCodeMap },
    restraintTypeMutation,
    bendRadiusTolerance: { ...accepted.bendRadiusTolerance },
    unitNormalizationProfile,
  });
}

function requireRestraintMutation(value) {
  if (!isPlainRecord(value)) {
    failInputXml(
      'InputXML restraint mutation must be a record.',
      'PIPING_INPUTXML_RESTRAINT_MUTATION_INVALID',
    );
  }
  requireExactKeys(value, ['enabled', 'rows'], 'ingestionOptions.restraintTypeMutation');
  if (typeof value.enabled !== 'boolean' || !Array.isArray(value.rows)) {
    failInputXml(
      'InputXML restraint mutation requires boolean enabled and array rows.',
      'PIPING_INPUTXML_RESTRAINT_MUTATION_INVALID',
    );
  }
  value.rows.forEach((row, index) => {
    requireRecord(row, `ingestionOptions.restraintTypeMutation.rows[${index}]`);
    requireExactKeys(
      row,
      ['label', 'from', 'to'],
      `ingestionOptions.restraintTypeMutation.rows[${index}]`,
    );
    for (const key of ['label', 'from', 'to']) {
      if (typeof row[key] !== 'string') {
        failInputXml(
          'InputXML restraint mutation row values must be strings.',
          'PIPING_INPUTXML_RESTRAINT_MUTATION_INVALID',
        );
      }
    }
  });
  return deepFreeze(normalizeRestraintTypeMutationConfig(value));
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
