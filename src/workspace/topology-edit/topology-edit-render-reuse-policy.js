import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_RENDER_REUSE_POLICY_SCHEMA = 'TopologyEditRenderReusePolicy.v1';
export const TOPOLOGY_EDIT_RENDER_REUSE_POLICY_ERROR = 'TOPOLOGY_EDIT_RENDER_REUSE_POLICY_INVALID';

export const DEFAULT_TOPOLOGY_EDIT_RENDER_REUSE_POLICY = deepFreeze({
  schema: TOPOLOGY_EDIT_RENDER_REUSE_POLICY_SCHEMA,
  minimumInstanceCount: 4,
  eligibleGeometryTypes: [
    'BoxGeometry',
    'CylinderGeometry',
    'IcosahedronGeometry',
    'OctahedronGeometry',
    'SphereGeometry',
    'TorusGeometry',
  ],
  eligibleMaterialTypes: ['MeshBasicMaterial', 'MeshStandardMaterial'],
  authority: 'DISPLAY_ONLY_PROGRAM_POLICY',
  disclosure: 'Resource pooling and instancing change only retained renderer resources and draw topology. They do not alter governed geometry, canonical identity, engineering coordinates, sectioning, selection authority, or exported data.',
});

export function createTopologyEditRenderReusePolicy(
  input = DEFAULT_TOPOLOGY_EDIT_RENDER_REUSE_POLICY,
) {
  if (input?.schema !== TOPOLOGY_EDIT_RENDER_REUSE_POLICY_SCHEMA) {
    throw policyError('The reuse policy schema is invalid.', 'SCHEMA_INVALID');
  }
  const minimumInstanceCount = Number(input.minimumInstanceCount);
  if (!Number.isSafeInteger(minimumInstanceCount) || minimumInstanceCount < 2) {
    throw policyError(
      'minimumInstanceCount must be an integer of at least 2.',
      'MINIMUM_INSTANCE_COUNT_INVALID',
    );
  }
  const eligibleGeometryTypes = normalizedTokens(
    input.eligibleGeometryTypes,
    'ELIGIBLE_GEOMETRY_TYPES_INVALID',
  );
  const eligibleMaterialTypes = normalizedTokens(
    input.eligibleMaterialTypes,
    'ELIGIBLE_MATERIAL_TYPES_INVALID',
  );
  const disclosure = requiredText(input.disclosure, 'DISCLOSURE_MISSING');
  const base = {
    schema: TOPOLOGY_EDIT_RENDER_REUSE_POLICY_SCHEMA,
    minimumInstanceCount,
    eligibleGeometryTypes,
    eligibleMaterialTypes,
    authority: 'DISPLAY_ONLY_PROGRAM_POLICY',
    disclosure,
  };
  return deepFreeze({ ...base, policyHash: semanticHash(base) });
}

function normalizedTokens(value, code) {
  if (!Array.isArray(value) || value.length === 0) {
    throw policyError('A non-empty token array is required.', code);
  }
  const tokens = [...new Set(value.map((row) => requiredText(row, code)))].sort(compareCodeUnits);
  if (tokens.length !== value.length) throw policyError('Duplicate tokens are not allowed.', code);
  return tokens;
}

function requiredText(value, code) {
  const text = String(value || '').trim();
  if (!text) throw policyError('A non-empty text value is required.', code);
  return text;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function policyError(message, detailCode) {
  const error = new Error(`${TOPOLOGY_EDIT_RENDER_REUSE_POLICY_ERROR}: ${message}`);
  error.code = TOPOLOGY_EDIT_RENDER_REUSE_POLICY_ERROR;
  error.detailCode = detailCode;
  return error;
}
