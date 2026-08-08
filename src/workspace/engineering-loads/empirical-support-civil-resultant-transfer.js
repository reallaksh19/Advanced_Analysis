import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, stringValue } from '../dataset-utils.js';
import { SUPPORT_SITE_MODEL_SCHEMA } from '../support-sites/support-site-model.js';
import {
  requireAuthorizedEmpiricalLoadExecutionV2,
} from './authorized-empirical-load-execution-v2.js';
import {
  EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS,
  requireEmpiricalSupportAssemblyAuthority,
} from './empirical-support-assembly-authority.js';

export const EMPIRICAL_SUPPORT_CIVIL_RESULTANT_TRANSFER_SCHEMA =
  'empirical-support-civil-resultant-transfer/v1';

export const EMPIRICAL_SUPPORT_CIVIL_RESULTANT_CONVENTION = Object.freeze({
  SOURCE_REACTION: 'SUPPORT_ON_PIPE_GLOBAL_XYZ_Z_UP',
  STRUCTURAL_ACTION: 'PIPE_ON_SUPPORT_GLOBAL_XYZ_Z_UP',
  CIVIL_RESULTANT: 'PIPE_ON_SUPPORT_AT_CIVIL_REFERENCE',
});

/**
 * EMP-PROD-04 B2. Transfers an already-authorized vertical piping reaction to
 * one exact structural support assembly as an equivalent civil-reference
 * force/moment resultant. This is rigid-body statics only: it does not split a
 * site reaction between multiple assemblies, solve stiffness, calculate
 * support-steel member forces, or modify the upstream piping reaction.
 */
export function calculateEmpiricalSupportCivilResultantTransfer(input = {}) {
  const execution = requireAuthorizedEmpiricalLoadExecutionV2(input.authorizedExecution);
  const supportSiteModel = requireSupportSiteModel(input.supportSiteModel);
  const assemblyAuthority = requireEmpiricalSupportAssemblyAuthority(
    input.supportAssemblyAuthority,
  );

  const supportSiteModelSemanticHash = semanticHash(supportSiteModel);
  const globalBlockers = globalBindingBlockers({
    execution,
    supportSiteModel,
    supportSiteModelSemanticHash,
    assemblyAuthority,
  });

  const authorityBySite = indexAuthorityBySite(assemblyAuthority.records);
  const siteById = new Map(
    supportSiteModel.sites.map((site) => [site.siteId, site]),
  );
  const loadCases = execution.distribution.loadCases.map((loadCase) => buildLoadCase({
    loadCase,
    siteById,
    authorityBySite,
    globalBlockers,
  }));
  const blockers = dedupeRows([
    ...globalBlockers,
    ...loadCases.flatMap((loadCase) => loadCase.blockers.map((row) => ({
      ...row,
      loadCaseId: loadCase.loadCaseId,
    }))),
  ]);
  const calculatedCaseCount = loadCases.filter((row) => row.status === 'CALCULATED').length;
  const draft = {
    schema: EMPIRICAL_SUPPORT_CIVIL_RESULTANT_TRANSFER_SCHEMA,
    datasetId: execution.datasetId,
    datasetVersion: execution.datasetVersion,
    sourceExecutionId: execution.executionId,
    sourceExecutionMethod: execution.executedMethod,
    sourceExecutionSemanticHash: execution.semanticHash,
    sourceDistributionSemanticHash: execution.distributionSemanticHash,
    supportSiteModelSemanticHash,
    supportAssemblyAuthoritySemanticHash: assemblyAuthority.semanticHash,
    sourceAxisBasis: 'Z_UP',
    conventions: EMPIRICAL_SUPPORT_CIVIL_RESULTANT_CONVENTION,
    status: globalBlockers.length === 0
      && loadCases.length > 0
      && calculatedCaseCount === loadCases.length
      ? 'CALCULATED'
      : 'BLOCKED',
    loadCases,
    blockers,
    summary: {
      loadCaseCount: loadCases.length,
      calculatedCaseCount,
      blockedCaseCount: loadCases.length - calculatedCaseCount,
      civilResultantCount: loadCases.reduce(
        (total, row) => total + row.civilResultants.length,
        0,
      ),
      zeroReactionCount: loadCases.reduce(
        (total, row) => total + row.completeness.zeroReactionCount,
        0,
      ),
    },
    policy: {
      exactStaticsOnly: true,
      oneAssemblyPerLoadedSiteRequired: true,
      multiAssemblyLoadSharingPermitted: false,
      stiffnessDistributionPermitted: false,
      structuralMemberForceCalculationPermitted: false,
      componentMomentDemandDistributionPermitted: false,
      upstreamReactionMutationPermitted: false,
    },
    upstreamPipingReactionModified: false,
    multiAssemblyLoadSharingPerformed: false,
    stiffnessDistributionPerformed: false,
    structuralMemberForcesCalculated: false,
    componentMomentDemandDistributed: false,
  };
  return requireEmpiricalSupportCivilResultantTransfer(freezeDeep({
    ...draft,
    semanticHash: semanticHash(draft),
  }));
}

export function requireEmpiricalSupportCivilResultantTransfer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_INVALID',
      'Civil resultant transfer must be an object.',
    );
  }
  if (value.schema !== EMPIRICAL_SUPPORT_CIVIL_RESULTANT_TRANSFER_SCHEMA) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_SCHEMA_INVALID',
      'Unexpected civil resultant transfer schema.',
    );
  }
  if (!Array.isArray(value.loadCases) || !Array.isArray(value.blockers)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_INVALID',
      'Civil resultant loadCases and blockers must be arrays.',
    );
  }
  if (!isStrictlySorted(value.loadCases.map((row) => row.loadCaseId))) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_LOAD_CASE_ORDER_INVALID',
      'Civil resultant load cases must be unique and code-unit sorted.',
    );
  }
  value.loadCases.forEach(validateLoadCase);
  if (value.policy?.exactStaticsOnly !== true
      || value.policy?.oneAssemblyPerLoadedSiteRequired !== true
      || value.policy?.multiAssemblyLoadSharingPermitted !== false
      || value.policy?.stiffnessDistributionPermitted !== false
      || value.policy?.structuralMemberForceCalculationPermitted !== false
      || value.policy?.componentMomentDemandDistributionPermitted !== false
      || value.policy?.upstreamReactionMutationPermitted !== false
      || value.upstreamPipingReactionModified !== false
      || value.multiAssemblyLoadSharingPerformed !== false
      || value.stiffnessDistributionPerformed !== false
      || value.structuralMemberForcesCalculated !== false
      || value.componentMomentDemandDistributed !== false) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_BOUNDARY_INVALID',
      'B2 must remain exact-resultant transfer only.',
    );
  }
  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_HASH_MISMATCH',
      'Civil resultant transfer semantic hash mismatch.',
    );
  }
  return freezeDeep(value);
}

function globalBindingBlockers({
  execution,
  supportSiteModel,
  supportSiteModelSemanticHash,
  assemblyAuthority,
}) {
  const blockers = [];
  if (execution.status !== 'CALCULATED') {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_SOURCE_EXECUTION_BLOCKED',
      'The authorized upstream execution must be fully CALCULATED.',
    ));
  }
  if (execution.distribution?.freshness?.status !== 'CURRENT') {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_SOURCE_EXECUTION_STALE',
      'The upstream support-load distribution must be CURRENT.',
    ));
  }
  if (execution.datasetId !== supportSiteModel.datasetId
      || assemblyAuthority.datasetId !== supportSiteModel.datasetId) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_DATASET_MISMATCH',
      'Execution, support-site model and support-assembly authority must bind the same dataset.',
    ));
  }
  if (assemblyAuthority.supportSiteModelSemanticHash !== supportSiteModelSemanticHash
      || execution.distribution?.hashes?.supportSiteModel !== supportSiteModelSemanticHash) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_MODEL_MISMATCH',
      'Upstream execution and structural authority must bind the exact active support-site model.',
    ));
  }
  if (execution.distribution?.sourceAxisBasis !== 'Z_UP'
      || supportSiteModel.sourceAxisBasis !== 'Z_UP'
      || assemblyAuthority.sourceAxisBasis !== 'Z_UP') {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_AXIS_BASIS_UNSUPPORTED',
      'B2 is qualified only for the shared GLOBAL XYZ / Z_UP basis.',
    ));
  }
  if (assemblyAuthority.status !== 'READY_FOR_DISTRIBUTION_MODEL') {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_ASSEMBLY_AUTHORITY_BLOCKED',
      'Support-assembly authority must be ready before B2 transfer.',
    ));
  }
  return dedupeRows(blockers);
}

function buildLoadCase({ loadCase, siteById, authorityBySite, globalBlockers }) {
  const loadCaseId = stringValue(loadCase?.loadCaseId);
  const caseBlockers = [...globalBlockers];
  const supportResults = Array.isArray(loadCase?.supportResults)
    ? loadCase.supportResults
    : [];
  if (!loadCaseId) {
    caseBlockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_LOAD_CASE_ID_MISSING',
      'Upstream load case ID is required.',
    ));
  }
  if (loadCase?.status !== 'CALCULATED') {
    caseBlockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_LOAD_CASE_BLOCKED',
      'Only fully calculated upstream load cases may be transferred.',
    ));
  }

  const audits = supportResults
    .map((result) => auditSupportResult(result, siteById, authorityBySite))
    .sort((left, right) => compareCodeUnits(left.supportSiteId, right.supportSiteId));
  caseBlockers.push(...audits.flatMap((audit) => audit.blockers.map((row) => ({
    ...row,
    supportSiteId: audit.supportSiteId,
  }))));
  const blockers = dedupeRows(caseBlockers);
  const qualifiedCandidates = audits
    .filter((audit) => audit.status === 'QUALIFIED_TRANSFER')
    .map((audit) => audit.civilResultant);
  const calculated = blockers.length === 0;
  const civilResultants = calculated ? qualifiedCandidates : [];
  return freezeDeep({
    loadCaseId: loadCaseId || 'UNBOUND',
    status: calculated ? 'CALCULATED' : 'BLOCKED',
    civilResultants,
    siteAudits: audits,
    blockers,
    transferBalance: calculated
      ? transferBalance(supportResults, civilResultants)
      : null,
    completeness: {
      supportResultCount: supportResults.length,
      nonzeroReactionCount: audits.filter((row) => row.status !== 'NO_LOAD').length,
      zeroReactionCount: audits.filter((row) => row.status === 'NO_LOAD').length,
      qualifiedTransferCount: qualifiedCandidates.length,
      blockedTransferCount: audits.filter((row) => row.status === 'BLOCKED').length,
    },
  });
}

function auditSupportResult(result, siteById, authorityBySite) {
  const supportSiteId = stringValue(result?.supportSiteId);
  const reaction = finite(result?.verticalForceN);
  const blockers = [];
  if (!supportSiteId) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_SITE_ID_MISSING',
      'Every upstream support result requires supportSiteId.',
    ));
  }
  if (result?.status !== 'CALCULATED' || reaction === null) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_REACTION_INVALID',
      'B2 requires a finite CALCULATED vertical support reaction.',
    ));
  }
  if (blockers.length > 0) {
    return freezeDeep({
      supportSiteId: supportSiteId || 'UNBOUND',
      status: 'BLOCKED',
      sourceVerticalReactionOnPipeN: reaction,
      civilResultant: null,
      blockers,
    });
  }
  if (reaction === 0) {
    return freezeDeep({
      supportSiteId,
      status: 'NO_LOAD',
      sourceVerticalReactionOnPipeN: 0,
      civilResultant: null,
      blockers: [],
    });
  }

  const site = siteById.get(supportSiteId) || null;
  if (!site) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_SITE_UNKNOWN',
      'Upstream support result does not exist in the active support-site model.',
    ));
  }
  if (site && site.assemblyIds.length !== 1) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_MULTI_ASSEMBLY_LOAD_SHARE_UNRESOLVED',
      'A site-level piping reaction cannot be split across multiple structural assemblies in B2.',
      { assemblyIds: [...site.assemblyIds] },
    ));
  }
  const assemblyId = site?.assemblyIds?.length === 1 ? site.assemblyIds[0] : null;
  const authorities = authorityBySite.get(supportSiteId) || [];
  const authority = assemblyId
    ? authorities.find((row) => row.assemblyId === assemblyId) || null
    : null;
  if (!authority || authorities.length !== 1 || authority.status !== 'READY') {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_EXACT_ASSEMBLY_AUTHORITY_REQUIRED',
      'Each loaded site requires exactly one READY structural assembly authority.',
    ));
  }
  if (authority?.distributionBasis?.kind
      === EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.AUTHORIZED_STIFFNESS) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_STIFFNESS_DISTRIBUTION_UNQUALIFIED',
      'AUTHORIZED_STIFFNESS load sharing is outside the B2 exact-statics domain.',
    ));
  } else if (authority?.distributionBasis?.kind
      !== EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.EXACT_STATICS) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_EXACT_STATICS_BASIS_REQUIRED',
      'B2 requires an EXACT_STATICS structural assembly basis.',
    ));
  }
  if (authority && site
      && !samePoint(authority.geometry?.pipeAttachmentPointMm, site.positionMm)) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_PIPE_ATTACHMENT_MISMATCH',
      'Structural authority pipe attachment must equal the active support-site position.',
    ));
  }
  const pipePoint = point(authority?.geometry?.pipeAttachmentPointMm);
  const civilPoint = point(authority?.geometry?.civilReferencePointMm);
  if (!pipePoint || !civilPoint) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_REFERENCE_GEOMETRY_INVALID',
      'Finite pipe-attachment and civil-reference points are required.',
    ));
  }
  if (blockers.length > 0) {
    return freezeDeep({
      supportSiteId,
      status: 'BLOCKED',
      sourceVerticalReactionOnPipeN: reaction,
      civilResultant: null,
      blockers: dedupeRows(blockers),
    });
  }

  const civilResultant = buildCivilResultant({
    supportSiteId,
    reaction,
    authority,
    pipePoint,
    civilPoint,
  });
  return freezeDeep({
    supportSiteId,
    status: 'QUALIFIED_TRANSFER',
    sourceVerticalReactionOnPipeN: reaction,
    civilResultant,
    blockers: [],
  });
}

function buildCivilResultant({
  supportSiteId,
  reaction,
  authority,
  pipePoint,
  civilPoint,
}) {
  const sourceReactionOnPipeN = freezeDeep({ x: 0, y: 0, z: reaction });
  const structureActionAtPipeAttachmentN = freezeDeep({ x: 0, y: 0, z: -reaction });
  const offsetMm = freezeDeep(subtract(pipePoint, civilPoint));
  const offsetM = scale(offsetMm, 0.001);
  const momentNm = freezeDeep(cross(offsetM, structureActionAtPipeAttachmentN));
  const payload = {
    transferId: `CIVIL:${supportSiteId}:${authority.structuralAssemblyId}`,
    supportSiteId,
    assemblyId: authority.assemblyId,
    structuralAssemblyId: authority.structuralAssemblyId,
    authorityId: authority.authorityId,
    authoritySemanticHash: authority.semanticHash,
    distributionBasis: authority.distributionBasis,
    pipeAttachmentPointMm: pipePoint,
    civilReferencePointMm: civilPoint,
    offsetCivilToPipeMm: offsetMm,
    sourceReactionOnPipeN,
    structureActionAtPipeAttachmentN,
    civilReferenceResultant: {
      forceN: structureActionAtPipeAttachmentN,
      momentNm,
    },
    conventions: EMPIRICAL_SUPPORT_CIVIL_RESULTANT_CONVENTION,
    structuralMemberForcesCalculated: false,
    loadSharingPerformed: false,
  };
  return freezeDeep({ ...payload, semanticHash: semanticHash(payload) });
}

function transferBalance(supportResults, civilResultants) {
  const sourceVerticalReactionOnPipeN = supportResults.reduce((total, row) => (
    total + (finite(row?.verticalForceN) ?? 0)
  ), 0);
  const structureVerticalActionN = civilResultants.reduce((total, row) => (
    total + row.civilReferenceResultant.forceN.z
  ), 0);
  return freezeDeep({
    sourceVerticalReactionOnPipeN,
    structureVerticalActionN,
    actionReactionResidualN: sourceVerticalReactionOnPipeN + structureVerticalActionN,
    passed: sourceVerticalReactionOnPipeN + structureVerticalActionN === 0,
  });
}

function validateLoadCase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['CALCULATED', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.civilResultants)
      || !Array.isArray(value.siteAudits)
      || !Array.isArray(value.blockers)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_LOAD_CASE_INVALID',
      'Civil resultant load case is invalid.',
    );
  }
  if (!isStrictlySorted(value.civilResultants.map((row) => row.supportSiteId))) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_RESULT_ORDER_INVALID',
      'Civil resultants must be unique and support-site sorted.',
    );
  }
  value.civilResultants.forEach(validateCivilResultant);
  if (value.status === 'CALCULATED') {
    if (value.blockers.length !== 0 || !value.transferBalance?.passed) {
      fail(
        'EMPIRICAL_CIVIL_TRANSFER_BALANCE_INVALID',
        'Calculated civil transfer must be blocker-free and action/reaction balanced.',
      );
    }
  } else if (value.civilResultants.length !== 0) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_FAIL_CLOSED_INVALID',
      'Blocked load cases must not publish civil resultants.',
    );
  }
}

function validateCivilResultant(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('EMPIRICAL_CIVIL_TRANSFER_RESULT_INVALID', 'Civil resultant must be an object.');
  }
  if (value.distributionBasis?.kind
      !== EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.EXACT_STATICS
      || value.structuralMemberForcesCalculated !== false
      || value.loadSharingPerformed !== false) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_RESULT_BOUNDARY_INVALID',
      'Civil resultants must remain exact-statics, no-load-sharing results.',
    );
  }
  const expectedForce = scale(value.sourceReactionOnPipeN, -1);
  if (!sameVector(expectedForce, value.structureActionAtPipeAttachmentN)
      || !sameVector(expectedForce, value.civilReferenceResultant?.forceN)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_FORCE_SIGN_INVALID',
      'Structural action must be equal and opposite to the source reaction on pipe.',
    );
  }
  const offsetM = scale(value.offsetCivilToPipeMm, 0.001);
  const expectedMoment = cross(offsetM, expectedForce);
  if (!sameVector(expectedMoment, value.civilReferenceResultant?.momentNm)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_MOMENT_INVALID',
      'Civil reference moment must equal r cross F.',
    );
  }
  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_RESULT_HASH_MISMATCH',
      'Civil resultant semantic hash mismatch.',
    );
  }
}

function indexAuthorityBySite(records) {
  const index = new Map();
  records.forEach((record) => {
    const rows = index.get(record.supportSiteId) || [];
    rows.push(record);
    index.set(record.supportSiteId, rows);
  });
  return index;
}

function requireSupportSiteModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schema !== SUPPORT_SITE_MODEL_SCHEMA
      || !stringValue(value.datasetId)
      || value.sourceAxisBasis !== 'Z_UP'
      || !Array.isArray(value.assemblies)
      || !Array.isArray(value.sites)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_MODEL_INVALID',
      'A Z_UP support-site-model/v1 is required.',
    );
  }
  return value;
}

function blocker(code, message, details = null) {
  return freezeDeep(details === null ? { code, message } : { code, message, ...details });
}

function point(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = finite(value.x);
  const y = finite(value.y);
  const z = finite(value.z);
  return x === null || y === null || z === null ? null : freezeDeep({ x, y, z });
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector, factor) {
  return {
    x: Number(vector?.x) * factor,
    y: Number(vector?.y) * factor,
    z: Number(vector?.z) * factor,
  };
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function samePoint(left, right) {
  return sameVector(left, right);
}

function sameVector(left, right) {
  return finite(left?.x) === finite(right?.x)
    && finite(left?.y) === finite(right?.y)
    && finite(left?.z) === finite(right?.z);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isStrictlySorted(values) {
  if (new Set(values).size !== values.length) return false;
  return values.every((value, index) => (
    index === 0 || compareCodeUnits(values[index - 1], value) < 0
  ));
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => compareCodeUnits(
    `${left.code}|${left.supportSiteId || ''}|${left.loadCaseId || ''}`,
    `${right.code}|${right.supportSiteId || ''}|${right.loadCaseId || ''}`,
  ));
}

function compareCodeUnits(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
