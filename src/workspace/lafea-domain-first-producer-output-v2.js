import {
  canonicalLafeaAnalysisMesh,
  lafeaAnalysisMeshContentHash,
} from './lafea-analysis-mesh-contract.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { canonicalLafeaMeshProfileParentHash } from './lafea-domain-first-mesh-profile.js';
import { validateLafeaDomainFirstMeshPlanV2 } from './lafea-domain-first-mesh-plan-v2.js';
import { bindLafeaDomainFirstT6Producer } from './lafea-domain-first-t6-producer-policy.js';

export const LAFEA_DOMAIN_FIRST_MESH_PRODUCER_OUTPUT_SCHEMA =
  'lafea-mesh-producer-output/v2';

const KEYS = Object.freeze([
  'schema', 'stageId', 'intentHash', 'planHash', 'capabilityHash',
  'qualificationHash', 'producerId', 'producerRevision', 'sourceHash',
  'analysisDomainHash', 'analysisGeometryHash', 'meshProfileHash',
  'elementFamily', 'mesh',
]);

export function createLafeaDomainFirstMeshProducerOutputV2(value) {
  exact(value, KEYS);
  if (value.schema !== LAFEA_DOMAIN_FIRST_MESH_PRODUCER_OUTPUT_SCHEMA) {
    fail('LAFEA_MP3_OUTPUT_SCHEMA_INVALID');
  }
  if (value.stageId !== 'LAFEA.3' || value.elementFamily !== 'T6') {
    fail('LAFEA_MP3_OUTPUT_SCOPE_INVALID');
  }
  const mesh = canonicalLafeaAnalysisMesh(value.mesh);
  const record = {
    schema: LAFEA_DOMAIN_FIRST_MESH_PRODUCER_OUTPUT_SCHEMA,
    stageId: 'LAFEA.3',
    intentHash: sha(value.intentHash, 'INTENT_HASH'),
    planHash: sha(value.planHash, 'PLAN_HASH'),
    capabilityHash: sha(value.capabilityHash, 'CAPABILITY_HASH'),
    qualificationHash: sha(value.qualificationHash, 'QUALIFICATION_HASH'),
    producerId: text(value.producerId, 'PRODUCER_ID'),
    producerRevision: text(value.producerRevision, 'PRODUCER_REVISION'),
    sourceHash: sha(value.sourceHash, 'SOURCE_HASH'),
    analysisDomainHash: sha(value.analysisDomainHash, 'ANALYSIS_DOMAIN_HASH'),
    analysisGeometryHash: sha(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    meshProfileHash: canonicalLafeaMeshProfileParentHash(value.meshProfileHash),
    elementFamily: 'T6',
    mesh,
  };
  if (mesh.elements.some((row) => row.elementType !== 'T6')) {
    fail('LAFEA_MP3_OUTPUT_ELEMENT_FAMILY_MISMATCH');
  }
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  return freeze({
    ...record,
    meshHash,
    outputHash: canonicalLafeaSha256({
      schema: 'lafea-mesh-producer-output-hash-input/v2', record, meshHash,
    }),
    lifecycleAuthority: false,
  });
}

export function validateLafeaDomainFirstMeshProducerOutputV2(value, { intent, plan }) {
  const { meshHash, outputHash, lifecycleAuthority, ...input } = value || {};
  const output = createLafeaDomainFirstMeshProducerOutputV2(input);
  if (meshHash !== output.meshHash || outputHash !== output.outputHash
    || lifecycleAuthority !== false) fail('LAFEA_MP3_OUTPUT_TAMPERED');
  const binding = bindLafeaDomainFirstT6Producer(intent);
  const validPlan = validateLafeaDomainFirstMeshPlanV2(plan, intent);
  const expected = {
    stageId: intent.stageId,
    intentHash: intent.semanticHash,
    planHash: validPlan.planHash,
    capabilityHash: binding.capabilityHash,
    qualificationHash: binding.qualificationHash,
    producerId: binding.producerId,
    producerRevision: binding.producerRevision,
    sourceHash: intent.sourceHash,
    analysisDomainHash: intent.analysisDomainHash,
    analysisGeometryHash: intent.analysisGeometryHash,
    meshProfileHash: intent.meshProfileHash,
    elementFamily: intent.elementFamily,
  };
  for (const [key, valueExpected] of Object.entries(expected)) {
    if (output[key] !== valueExpected) fail(`LAFEA_MP3_OUTPUT_${key.toUpperCase()}_MISMATCH`);
  }
  if (output.meshHash !== validPlan.plannedMeshHash) {
    fail('LAFEA_MP3_OUTPUT_PLANNED_MESH_HASH_MISMATCH');
  }
  const nodes = output.mesh.nodes.length;
  const elements = output.mesh.elements.length;
  if (nodes > intent.maximumNodes || elements > intent.maximumElements
    || nodes * 2 > intent.maximumEstimatedDofs
    || nodes > binding.qualification.maximumNodes
    || elements > binding.qualification.maximumElements
    || nodes * 2 > binding.qualification.maximumEstimatedDofs) {
    fail('LAFEA_MP3_OUTPUT_RESOURCE_LIMIT_EXCEEDED');
  }
  return output;
}

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail('LAFEA_MP3_OUTPUT_KEYS_INVALID');
  }
}
function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_MP3_OUTPUT_${field}_INVALID`);
  return value.trim();
}
function sha(value, field) {
  const out = text(value, field);
  if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_MP3_OUTPUT_${field}_INVALID`);
  return out;
}
function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
