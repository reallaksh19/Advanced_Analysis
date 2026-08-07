/** Canonical mesh-producer output envelope. Validation grants no lifecycle authority. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { canonicalLafeaAnalysisMesh, lafeaAnalysisMeshContentHash } from './lafea-analysis-mesh-contract.js';
import { validateLafeaMeshProducerQualification } from './lafea-mesh-producer-contract.js';
import { validateLafeaMeshPlan } from './lafea-mesh-plan-contract.js';

export const LAFEA_MESH_PRODUCER_OUTPUT_SCHEMA = 'lafea-mesh-producer-output/v1';

const KEYS = Object.freeze([
  'schema', 'stageId', 'intentHash', 'planHash', 'capabilityHash', 'qualificationHash',
  'producerId', 'producerRevision', 'sourceHash', 'canonicalModelHash',
  'analysisGeometryHash', 'meshProfileHash', 'elementFamily', 'mesh',
]);

export function createLafeaMeshProducerOutput(value) {
  requireExact(value, KEYS);
  if (value.schema !== LAFEA_MESH_PRODUCER_OUTPUT_SCHEMA) fail('LAFEA_MESH_PRODUCER_OUTPUT_SCHEMA_INVALID');
  const mesh = canonicalLafeaAnalysisMesh(value.mesh);
  const record = {
    schema: LAFEA_MESH_PRODUCER_OUTPUT_SCHEMA,
    stageId: text(value.stageId, 'STAGE_ID'),
    intentHash: sha256(value.intentHash, 'INTENT_HASH'),
    planHash: sha256(value.planHash, 'PLAN_HASH'),
    capabilityHash: sha256(value.capabilityHash, 'CAPABILITY_HASH'),
    qualificationHash: sha256(value.qualificationHash, 'QUALIFICATION_HASH'),
    producerId: text(value.producerId, 'PRODUCER_ID'),
    producerRevision: text(value.producerRevision, 'PRODUCER_REVISION'),
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    canonicalModelHash: sha256(value.canonicalModelHash, 'CANONICAL_MODEL_HASH'),
    analysisGeometryHash: sha256(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    meshProfileHash: text(value.meshProfileHash, 'MESH_PROFILE_HASH'),
    elementFamily: text(value.elementFamily, 'ELEMENT_FAMILY'),
    mesh,
  };
  if (mesh.elements.some((element) => element.elementType !== record.elementFamily)) fail('LAFEA_MESH_PRODUCER_OUTPUT_ELEMENT_FAMILY_MISMATCH');
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  return freeze({
    ...record,
    meshHash,
    outputHash: canonicalLafeaSha256({ schema: 'lafea-mesh-producer-output-hash-input/v1', record, meshHash }),
    lifecycleAuthority: false,
  });
}

export function validateLafeaMeshProducerOutput(value, context) {
  const { meshHash, outputHash, lifecycleAuthority, ...input } = value || {};
  const rebuilt = createLafeaMeshProducerOutput(input);
  if (meshHash !== rebuilt.meshHash || outputHash !== rebuilt.outputHash) fail('LAFEA_MESH_PRODUCER_OUTPUT_HASH_INVALID');
  if (lifecycleAuthority !== false) fail('LAFEA_MESH_PRODUCER_OUTPUT_AUTHORITY_INVALID');
  const capability = context?.capability;
  const qualification = validateLafeaMeshProducerQualification(context?.qualification, capability);
  const plan = validateLafeaMeshPlan(context?.plan, context);
  requireMatch(rebuilt.capabilityHash, capability.capabilityHash, 'CAPABILITY_HASH');
  requireMatch(rebuilt.qualificationHash, qualification.qualificationHash, 'QUALIFICATION_HASH');
  requireMatch(rebuilt.planHash, plan.planHash, 'PLAN_HASH');
  requireMatch(rebuilt.producerId, capability.producerId, 'PRODUCER_ID');
  requireMatch(rebuilt.producerRevision, capability.producerRevision, 'PRODUCER_REVISION');
  for (const field of ['stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash', 'elementFamily']) {
    requireMatch(rebuilt[field], plan[field], field.toUpperCase());
  }
  if (rebuilt.mesh.nodes.length > qualification.maximumNodes) fail('LAFEA_MESH_PRODUCER_OUTPUT_NODE_LIMIT_EXCEEDED');
  if (rebuilt.mesh.elements.length > qualification.maximumElements) fail('LAFEA_MESH_PRODUCER_OUTPUT_ELEMENT_LIMIT_EXCEEDED');
  if (plan.estimatedDofs > qualification.maximumEstimatedDofs) fail('LAFEA_MESH_PRODUCER_OUTPUT_DOF_LIMIT_EXCEEDED');
  return rebuilt;
}

function requireMatch(actual, expected, field) { if (actual !== expected) fail(`LAFEA_MESH_PRODUCER_OUTPUT_${field}_MISMATCH`); }
function requireExact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('LAFEA_MESH_PRODUCER_OUTPUT_KEYS_INVALID');
}
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_MESH_PRODUCER_OUTPUT_${field}_INVALID`); return value; }
function sha256(value, field) { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail(`LAFEA_MESH_PRODUCER_OUTPUT_${field}_INVALID`); return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
