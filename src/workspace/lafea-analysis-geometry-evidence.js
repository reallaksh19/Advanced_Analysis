/** Retained mesh-independent analysis-geometry evidence for the domain-first LAFEA.3 path. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { validateLafeaAnalysisGeometry } from './lafea-analysis-geometry-contract.js';
import { validateLafeaContinuumAnalysisDomain } from './lafea-continuum-analysis-domain.js';

export const LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA = 'lafea-analysis-geometry-evidence/v1';
export const LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE = 'LAFEA3_DOMAIN_FIRST_GEOMETRY_V1';

const INPUT_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'analysisDomain', 'geometry',
  'producerRef', 'profileId',
]);
const SEALED_KEYS = Object.freeze([
  ...INPUT_KEYS.filter((key) => !['analysisDomain', 'geometry'].includes(key)),
  'analysisDomainHash', 'analysisGeometryHash', 'geometry', 'semanticHash',
  'status', 'qualification',
]);

export function createLafeaAnalysisGeometryEvidence(value) {
  exact(value, INPUT_KEYS, 'LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_KEYS_INVALID');
  if (value.schema !== LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA
    || value.stageId !== 'LAFEA.3'
    || value.profileId !== LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE) {
    fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA_OR_PROFILE_INVALID');
  }
  const geometry = validateLafeaAnalysisGeometry(value.geometry);
  const domain = validateLafeaContinuumAnalysisDomain(value.analysisDomain, geometry);
  if (domain.stageId !== value.stageId || geometry.stageId !== value.stageId) {
    fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_STAGE_MISMATCH');
  }
  const sourceHash = sha256(value.sourceHash, 'SOURCE_HASH');
  if (domain.sourceHash !== sourceHash) fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SOURCE_MISMATCH');
  const record = {
    schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash,
    analysisDomainHash: domain.semanticHash,
    analysisGeometryHash: geometry.semanticHash,
    geometry,
    producerRef: text(value.producerRef, 'PRODUCER_REF'),
    profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
    status: 'CURRENT',
    qualification: 'PASS',
  };
  return freeze({ ...record, semanticHash: canonicalLafeaSha256({
    schema: 'lafea-analysis-geometry-evidence-hash-input/v1', evidence: record,
  }) });
}

export function validateLafeaAnalysisGeometryEvidence(value) {
  exact(value, SEALED_KEYS, 'LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SEALED_KEYS_INVALID');
  if (value.schema !== LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA
    || value.profileId !== LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE
    || value.status !== 'CURRENT' || value.qualification !== 'PASS') {
    fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_CONTRACT_INVALID');
  }
  const geometry = validateLafeaAnalysisGeometry(value.geometry);
  if (geometry.semanticHash !== value.analysisGeometryHash) {
    fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_GEOMETRY_HASH_INVALID');
  }
  const record = {
    schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
    stageId: text(value.stageId, 'STAGE_ID'),
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    analysisDomainHash: sha256(value.analysisDomainHash, 'ANALYSIS_DOMAIN_HASH'),
    analysisGeometryHash: sha256(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    geometry,
    producerRef: text(value.producerRef, 'PRODUCER_REF'),
    profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
    status: 'CURRENT',
    qualification: 'PASS',
  };
  const expected = canonicalLafeaSha256({
    schema: 'lafea-analysis-geometry-evidence-hash-input/v1', evidence: record,
  });
  if (expected !== value.semanticHash) fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_TAMPERED');
  return freeze({ ...record, semanticHash: expected });
}

function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
}
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_${field}_INVALID`); return value.trim(); }
function sha256(value, field) { const out = text(value, field); if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_${field}_INVALID`); return out; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
