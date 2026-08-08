import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, stringValue } from '../dataset-utils.js';
import { SUPPORT_SITE_MODEL_SCHEMA } from '../support-sites/support-site-model.js';

export const EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_SCHEMA =
  'empirical-support-assembly-authority/v1';

export const EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS = Object.freeze({
  EXACT_STATICS: 'EXACT_STATICS',
  AUTHORIZED_STIFFNESS: 'AUTHORIZED_STIFFNESS',
});

const REQUIRED_NODE_ROLES = Object.freeze([
  'PIPE_ATTACHMENT',
  'CIVIL_REFERENCE',
]);

/**
 * Binds explicit structural support-assembly geometry/basis evidence to the
 * existing support-site-model identities. This is EMP-PROD-04 authority only:
 * it does not modify piping reactions, solve structural distribution, or
 * publish civil/member forces.
 */
export function createEmpiricalSupportAssemblyAuthority(input = {}) {
  const supportSiteModel = requireSupportSiteModel(input.supportSiteModel);
  const sourceRows = Array.isArray(input.authorities) ? input.authorities : [];
  const assemblyIndex = new Map(
    supportSiteModel.assemblies.map((assembly) => [assembly.assemblyId, assembly]),
  );
  const siteIndex = new Map(
    supportSiteModel.sites.map((site) => [site.siteId, site]),
  );

  const records = sourceRows
    .map((row) => buildAuthorityRecord(row, assemblyIndex, siteIndex))
    .sort((left, right) => compareCodeUnits(left.authorityId, right.authorityId));

  const globalBlockers = duplicateBindingBlockers(records);
  const blockers = dedupeRows([
    ...globalBlockers,
    ...records.flatMap((row) => row.blockers.map((blocker) => ({
      ...blocker,
      authorityId: row.authorityId,
      supportSiteId: row.supportSiteId,
      assemblyId: row.assemblyId,
    }))),
  ]);

  const readyCount = records.filter((row) => row.status === 'READY').length;
  const draft = {
    schema: EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_SCHEMA,
    datasetId: supportSiteModel.datasetId,
    supportSiteModelSemanticHash: semanticHash(supportSiteModel),
    sourceAxisBasis: supportSiteModel.sourceAxisBasis || 'Z_UP',
    status: blockers.length > 0
      ? 'BLOCKED'
      : (records.length > 0 ? 'READY_FOR_DISTRIBUTION_MODEL' : 'NO_STRUCTURAL_ASSEMBLY_AUTHORITY'),
    records,
    blockers,
    summary: {
      authorityCount: records.length,
      readyCount,
      blockedCount: records.length - readyCount,
      exactStaticsBasisCount: records.filter(
        (row) => row.distributionBasis?.kind === EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.EXACT_STATICS,
      ).length,
      authorizedStiffnessBasisCount: records.filter(
        (row) => row.distributionBasis?.kind === EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.AUTHORIZED_STIFFNESS,
      ).length,
    },
    policy: {
      supportIdentityAuthority: SUPPORT_SITE_MODEL_SCHEMA,
      geometryMutationPermitted: false,
      guessedStiffnessPermitted: false,
      distributionCalculationPermitted: false,
      structuralMemberForceApproximationPermitted: false,
    },
    pipingReactionModified: false,
    civilReactionDistributionPerformed: false,
    structuralMemberForcesCalculated: false,
  };

  return requireEmpiricalSupportAssemblyAuthority(freezeDeep({
    ...draft,
    semanticHash: semanticHash(draft),
  }));
}

export function requireEmpiricalSupportAssemblyAuthority(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_INVALID',
      'Support-assembly authority must be an object.',
    );
  }
  if (value.schema !== EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_SCHEMA) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_SCHEMA_INVALID',
      'Unexpected support-assembly authority schema.',
    );
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.blockers)) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_INVALID',
      'Support-assembly records and blockers must be arrays.',
    );
  }
  if (!isStrictlySorted(value.records.map((row) => row.authorityId))) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_ORDER_INVALID',
      'Support-assembly authority IDs must be unique and code-unit sorted.',
    );
  }
  value.records.forEach(validateAuthorityRecord);
  if (value.policy?.geometryMutationPermitted !== false
      || value.policy?.guessedStiffnessPermitted !== false
      || value.policy?.distributionCalculationPermitted !== false
      || value.policy?.structuralMemberForceApproximationPermitted !== false
      || value.pipingReactionModified !== false
      || value.civilReactionDistributionPerformed !== false
      || value.structuralMemberForcesCalculated !== false) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_BOUNDARY_INVALID',
      'Authority-only B1 must not modify reactions or enable structural calculation.',
    );
  }
  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_HASH_MISMATCH',
      'Support-assembly authority semantic hash mismatch.',
    );
  }
  return freezeDeep(value);
}

function buildAuthorityRecord(source, assemblyIndex, siteIndex) {
  const raw = source && typeof source === 'object' && !Array.isArray(source)
    ? source
    : {};
  const supportSiteId = stringValue(raw.supportSiteId);
  const assemblyId = stringValue(raw.assemblyId);
  const structuralAssemblyId = stringValue(raw.structuralAssemblyId);
  const authorityId = stringValue(raw.authorityId)
    || `STRUCTURAL_ASSEMBLY:${supportSiteId || 'UNBOUND'}:${assemblyId || 'UNBOUND'}`;
  const blockers = [];
  const site = siteIndex.get(supportSiteId) || null;
  const assembly = assemblyIndex.get(assemblyId) || null;

  if (!supportSiteId || !site) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_SITE_UNKNOWN',
      'supportSiteId must exactly match the active support-site model.',
    ));
  }
  if (!assemblyId || !assembly) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_ID_UNKNOWN',
      'assemblyId must exactly match the active support-site model.',
    ));
  }
  if (site && assemblyId && !site.assemblyIds.includes(assemblyId)) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_SITE_MISMATCH',
      'assemblyId is not owned by the declared supportSiteId.',
    ));
  }
  if (!structuralAssemblyId) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_STRUCTURAL_ID_MISSING',
      'A stable structuralAssemblyId is required.',
    ));
  }

  const sourceEvidence = normalizeEvidence(
    raw.sourceEvidence,
    'EMPIRICAL_SUPPORT_ASSEMBLY_SOURCE_EVIDENCE_INVALID',
    blockers,
  );
  const geometry = normalizeGeometry(raw.geometry, assembly, blockers);
  const distributionBasis = normalizeDistributionBasis(raw.distributionBasis, blockers);
  const dedupedBlockers = dedupeRows(blockers);
  const payload = {
    authorityId,
    supportSiteId: supportSiteId || null,
    assemblyId: assemblyId || null,
    structuralAssemblyId: structuralAssemblyId || null,
    sourceEvidence,
    geometry,
    distributionBasis,
    status: dedupedBlockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers: dedupedBlockers,
    policy: {
      geometryMutationPermitted: false,
      guessedStiffnessPermitted: false,
      distributionCalculationPermitted: false,
    },
  };
  return freezeDeep({ ...payload, semanticHash: semanticHash(payload) });
}

function normalizeGeometry(value, assembly, blockers) {
  const geometry = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const coordinateBasis = stringValue(geometry.coordinateBasis);
  if (coordinateBasis !== 'GLOBAL_XYZ_Z_UP') {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_COORDINATE_BASIS_INVALID',
      'Structural assembly geometry must declare GLOBAL_XYZ_Z_UP.',
    ));
  }

  const pipeAttachmentPointMm = point(geometry.pipeAttachmentPointMm);
  if (!pipeAttachmentPointMm) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_PIPE_POINT_INVALID',
      'A finite pipeAttachmentPointMm is required.',
    ));
  } else if (assembly && !samePoint(pipeAttachmentPointMm, assembly.positionMm)) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_PIPE_POINT_MISMATCH',
      'Structural pipe attachment must exactly preserve the governed support assembly position.',
    ));
  }

  const civilReferencePointMm = point(geometry.civilReferencePointMm);
  if (!civilReferencePointMm) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_CIVIL_POINT_INVALID',
      'A finite civilReferencePointMm is required.',
    ));
  }

  const nodes = normalizeNodes(geometry.nodes, blockers);
  const members = normalizeMembers(geometry.members, nodes, blockers);
  for (const requiredRole of REQUIRED_NODE_ROLES) {
    if (!nodes.some((node) => node.role === requiredRole)) {
      blockers.push(blocker(
        'EMPIRICAL_SUPPORT_ASSEMBLY_REQUIRED_NODE_ROLE_MISSING',
        `Structural geometry requires a ${requiredRole} node.`,
        { role: requiredRole },
      ));
    }
  }
  if (pipeAttachmentPointMm
      && !nodes.some((node) => node.role === 'PIPE_ATTACHMENT'
        && samePoint(node.positionMm, pipeAttachmentPointMm))) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_PIPE_NODE_MISMATCH',
      'PIPE_ATTACHMENT node must coincide exactly with pipeAttachmentPointMm.',
    ));
  }
  if (civilReferencePointMm
      && !nodes.some((node) => node.role === 'CIVIL_REFERENCE'
        && samePoint(node.positionMm, civilReferencePointMm))) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_CIVIL_NODE_MISMATCH',
      'CIVIL_REFERENCE node must coincide exactly with civilReferencePointMm.',
    ));
  }

  const geometryEvidence = normalizeEvidence(
    geometry.evidence,
    'EMPIRICAL_SUPPORT_ASSEMBLY_GEOMETRY_EVIDENCE_INVALID',
    blockers,
  );
  return freezeDeep({
    coordinateBasis: coordinateBasis || null,
    pipeAttachmentPointMm,
    civilReferencePointMm,
    nodes,
    members,
    evidence: geometryEvidence,
  });
}

function normalizeNodes(value, blockers) {
  if (!Array.isArray(value) || value.length === 0) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_NODES_MISSING',
      'Structural assembly geometry requires explicit nodes.',
    ));
    return freezeDeep([]);
  }
  const nodes = value.map((row) => ({
    nodeId: stringValue(row?.nodeId),
    role: stringValue(row?.role),
    positionMm: point(row?.positionMm),
  })).sort((left, right) => compareCodeUnits(left.nodeId, right.nodeId));
  const ids = nodes.map((row) => row.nodeId);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_NODE_ID_INVALID',
      'Structural node IDs must be non-empty and unique.',
    ));
  }
  if (nodes.some((row) => !row.role || !row.positionMm)) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_NODE_INVALID',
      'Every structural node requires a role and finite positionMm.',
    ));
  }
  return freezeDeep(nodes);
}

function normalizeMembers(value, nodes, blockers) {
  if (!Array.isArray(value)) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_MEMBERS_INVALID',
      'Structural assembly members must be an array.',
    ));
    return freezeDeep([]);
  }
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const members = value.map((row) => ({
    memberId: stringValue(row?.memberId),
    startNodeId: stringValue(row?.startNodeId),
    endNodeId: stringValue(row?.endNodeId),
  })).sort((left, right) => compareCodeUnits(left.memberId, right.memberId));
  const ids = members.map((row) => row.memberId);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_MEMBER_ID_INVALID',
      'Structural member IDs must be non-empty and unique.',
    ));
  }
  for (const member of members) {
    const start = nodeById.get(member.startNodeId);
    const end = nodeById.get(member.endNodeId);
    if (!start || !end) {
      blockers.push(blocker(
        'EMPIRICAL_SUPPORT_ASSEMBLY_MEMBER_NODE_MISSING',
        'Structural member endpoints must reference declared nodes.',
        { memberId: member.memberId },
      ));
      continue;
    }
    if (member.startNodeId === member.endNodeId || samePoint(start.positionMm, end.positionMm)) {
      blockers.push(blocker(
        'EMPIRICAL_SUPPORT_ASSEMBLY_MEMBER_ZERO_LENGTH',
        'Structural members must have nonzero geometric length.',
        { memberId: member.memberId },
      ));
    }
  }
  return freezeDeep(members);
}

function normalizeDistributionBasis(value, blockers) {
  const basis = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const kind = stringValue(basis.kind);
  if (!Object.values(EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS).includes(kind)) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS_INVALID',
      'Distribution basis must be EXACT_STATICS or AUTHORIZED_STIFFNESS.',
    ));
  }
  const basisId = stringValue(basis.basisId);
  const revision = stringValue(basis.revision);
  const evidenceSemanticHash = stringValue(basis.evidenceSemanticHash);
  if (!basisId || !revision || !validSemanticHash(evidenceSemanticHash)) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_EVIDENCE_INVALID',
      'Distribution basis requires basisId, revision and a namespaced evidence semantic hash.',
    ));
  }
  if (kind === EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.AUTHORIZED_STIFFNESS
      && basis.genericOrAssumedStiffness === true) {
    blockers.push(blocker(
      'EMPIRICAL_SUPPORT_ASSEMBLY_GUESSED_STIFFNESS_PROHIBITED',
      'Generic or assumed support stiffness is not an authorized distribution basis.',
    ));
  }
  return freezeDeep({
    kind: kind || null,
    basisId: basisId || null,
    revision: revision || null,
    evidenceSemanticHash: evidenceSemanticHash || null,
    genericOrAssumedStiffness: basis.genericOrAssumedStiffness === true,
  });
}

function normalizeEvidence(value, code, blockers) {
  const evidence = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const sourceId = stringValue(evidence.sourceId);
  const revision = stringValue(evidence.revision);
  const semanticHashValue = stringValue(evidence.semanticHash);
  if (!sourceId || !revision || !validSemanticHash(semanticHashValue)) {
    blockers.push(blocker(
      code,
      'Evidence requires sourceId, revision and a namespaced semantic hash.',
    ));
  }
  return freezeDeep({
    sourceId: sourceId || null,
    revision: revision || null,
    semanticHash: semanticHashValue || null,
  });
}

function duplicateBindingBlockers(records) {
  const blockers = [];
  const fields = [
    ['authorityId', 'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_ID_DUPLICATE'],
    ['structuralAssemblyId', 'EMPIRICAL_SUPPORT_STRUCTURAL_ID_DUPLICATE'],
    ['assemblyId', 'EMPIRICAL_SUPPORT_ASSEMBLY_BINDING_DUPLICATE'],
  ];
  for (const [field, code] of fields) {
    const seen = new Set();
    for (const record of records) {
      const value = record[field];
      if (!value) continue;
      if (seen.has(value)) {
        blockers.push(blocker(code, `${field} must bind uniquely.`, { [field]: value }));
      }
      seen.add(value);
    }
  }
  return blockers;
}

function validateAuthorityRecord(row) {
  if (!row || typeof row !== 'object' || !stringValue(row.authorityId)
      || !Array.isArray(row.blockers)
      || !['READY', 'BLOCKED'].includes(row.status)) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_RECORD_INVALID',
      'Support-assembly authority record is malformed.',
    );
  }
  if (row.policy?.geometryMutationPermitted !== false
      || row.policy?.guessedStiffnessPermitted !== false
      || row.policy?.distributionCalculationPermitted !== false) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_RECORD_BOUNDARY_INVALID',
      'B1 authority record may not authorize mutation or distribution calculation.',
    );
  }
  const { semanticHash: suppliedHash, ...payload } = row;
  if (suppliedHash !== semanticHash(payload)) {
    fail(
      'EMPIRICAL_SUPPORT_ASSEMBLY_RECORD_HASH_MISMATCH',
      `Support-assembly authority record hash mismatch for ${row.authorityId}.`,
    );
  }
}

function requireSupportSiteModel(value) {
  if (!value || typeof value !== 'object' || value.schema !== SUPPORT_SITE_MODEL_SCHEMA
      || !stringValue(value.datasetId)
      || !Array.isArray(value.assemblies) || !Array.isArray(value.sites)) {
    fail(
      'EMPIRICAL_SUPPORT_SITE_MODEL_INVALID',
      `EMP-PROD-04 requires ${SUPPORT_SITE_MODEL_SCHEMA}.`,
    );
  }
  return value;
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const x = finite(value.x);
  const y = finite(value.y);
  const z = finite(value.z);
  return [x, y, z].some((coordinate) => coordinate === null)
    ? null
    : freezeDeep({ x, y, z });
}

function samePoint(left, right) {
  return Boolean(left && right
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z);
}

function blocker(code, message, details = null) {
  return freezeDeep({ code, message, details });
}

function dedupeRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = semanticHash(row);
    if (!byKey.has(key)) byKey.set(key, freezeDeep(row));
  }
  return [...byKey.values()].sort((left, right) => compareCodeUnits(
    `${left.code}|${left.authorityId || ''}|${JSON.stringify(left.details || {})}`,
    `${right.code}|${right.authorityId || ''}|${JSON.stringify(right.details || {})}`,
  ));
}

function isStrictlySorted(values) {
  if (new Set(values).size !== values.length) return false;
  return values.every((value, index) => (
    index === 0 || compareCodeUnits(values[index - 1], value) < 0
  ));
}

function compareCodeUnits(left, right) {
  return String(left).localeCompare(String(right), 'en', { sensitivity: 'variant' });
}

function validSemanticHash(value) {
  return typeof value === 'string' && /^[a-z0-9._-]+:[a-z0-9]+$/iu.test(value);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}
