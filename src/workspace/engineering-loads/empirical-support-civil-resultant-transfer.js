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
  const siteById = new Map(supportSiteModel.sites.map((site) => [site.siteId, site]));
  const loadCases = execution.distribution.loadCases
    .map((loadCase) => buildLoadCase({
      loadCase,
      siteById,
      authorityBySite,
      globalBlockers,
    }))
    .sort((left, right) => compareCodeUnits(left.loadCaseId, right.loadCaseId));
  const blockers = dedupeRows([
    ...globalBlockers,
    ...loadCases.flatMap((loadCase) => loadCase.blockers.map((row) => ({
      ...row,
      loadCaseId: loadCase.loadCaseId,
    }))),
  ]);
  const summary = summarize(loadCases);
  const status = blockers.length === 0
    && loadCases.length > 0
    && loadCases.every((row) => row.status === 'CALCULATED')
    ? 'CALCULATED'
    : 'BLOCKED';
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
    status,
    loadCases,
    blockers,
    summary,
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
    fail('EMPIRICAL_CIVIL_TRANSFER_INVALID', 'Civil resultant transfer must be an object.');
  }
  if (value.schema !== EMPIRICAL_SUPPORT_CIVIL_RESULTANT_TRANSFER_SCHEMA) {
    fail('EMPIRICAL_CIVIL_TRANSFER_SCHEMA_INVALID', 'Unexpected civil resultant transfer schema.');
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
  if (semanticHash(value.summary) !== semanticHash(summarize(value.loadCases))) {
    fail('EMPIRICAL_CIVIL_TRANSFER_SUMMARY_INVALID', 'Civil resultant summary is stale.');
  }
  const expectedStatus = value.loadCases.length > 0
    && value.loadCases.every((row) => row.status === 'CALCULATED')
    && value.blockers.length === 0
    ? 'CALCULATED'
    : 'BLOCKED';
  if (value.status !== expectedStatus) {
    fail('EMPIRICAL_CIVIL_TRANSFER_STATUS_INVALID', 'Civil resultant status is stale.');
  }
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
  const supportResults = Array.isArray(loadCase?.supportResults) ? loadCase.supportResults : [];
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
  if (supportResults.length === 0) {
    caseBlockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_RESULTS_MISSING',
      'A calculated upstream load case must contain support results.',
    ));
  }
  const audits = supportResults
    .map((result) => auditSupportResult({
      loadCaseId,
      result,
      siteById,
      authorityBySite,
    }))
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
  const completeness = completenessFor(audits, supportResults.length, qualifiedCandidates.length);
  return freezeDeep({
    loadCaseId: loadCaseId || 'UNBOUND',
    status: calculated ? 'CALCULATED' : 'BLOCKED',
    civilResultants,
    siteAudits: audits,
    blockers,
    transferBalance: calculated ? transferBalance(supportResults, civilResultants) : null,
    completeness,
  });
}

function auditSupportResult({ loadCaseId, result, siteById, authorityBySite }) {
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
  const assemblyIds = Array.isArray(site?.assemblyIds) ? site.assemblyIds : [];
  if (site && assemblyIds.length !== 1) {
    blockers.push(blocker(
      'EMPIRICAL_CIVIL_TRANSFER_MULTI_ASSEMBLY_LOAD_SHARE_UNRESOLVED',
      'A site-level piping reaction cannot be split across multiple structural assemblies in B2.',
      { assemblyIds: [...assemblyIds] },
    ));
  }
  const assemblyId = assemblyIds.length === 1 ? assemblyIds[0] : null;
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
  return freezeDeep({
    supportSiteId,
    status: 'QUALIFIED_TRANSFER',
    sourceVerticalReactionOnPipeN: reaction,
    civilResultant: buildCivilResultant({
      loadCaseId,
      supportSiteId,
      reaction,
      authority,
      pipePoint,
      civilPoint,
    }),
    blockers: [],
  });
}

function buildCivilResultant({
  loadCaseId,
  supportSiteId,
  reaction,
  authority,
  pipePoint,
  civilPoint,
}) {
  const sourceReactionOnPipeN = freezeDeep({ x: 0, y: 0, z: reaction });
  const structureActionAtPipeAttachmentN = freezeDeep({ x: 0, y: 0, z: -reaction });
  const offsetMm = freezeDeep(subtract(pipePoint, civilPoint));
  const momentNm = freezeDeep(cross(scale(offsetMm, 0.001), structureActionAtPipeAttachmentN));
  const payload = {
    transferId: `CIVIL:${loadCaseId}:${supportSiteId}:${authority.structuralAssemblyId}`,
    loadCaseId,
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

function validateLoadCase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['CALCULATED', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.civilResultants)
      || !Array.isArray(value.siteAudits)
      || !Array.isArray(value.blockers)) {
    fail('EMPIRICAL_CIVIL_TRANSFER_LOAD_CASE_INVALID', 'Civil resultant load case is invalid.');
  }
  if (!isStrictlySorted(value.civilResultants.map((row) => row.supportSiteId))) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_RESULT_ORDER_INVALID',
      'Civil resultants must be unique and support-site sorted.',
    );
  }
  if (!isStrictlySorted(value.siteAudits.map((row) => row.supportSiteId))) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_AUDIT_ORDER_INVALID',
      'Site audits must be unique and support-site sorted.',
    );
  }
  value.civilResultants.forEach((row) => {
    validateCivilResultant(row);
    if (row.loadCaseId !== value.loadCaseId) {
      fail(
        'EMPIRICAL_CIVIL_TRANSFER_RESULT_LOAD_CASE_MISMATCH',
        'Civil resultant loadCaseId must match its parent load case.',
      );
    }
  });
  const expectedCompleteness = completenessFor(
    value.siteAudits,
    value.siteAudits.length,
    value.siteAudits.filter((row) => row.status === 'QUALIFIED_TRANSFER').length,
  );
  if (semanticHash(value.completeness) !== semanticHash(expectedCompleteness)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_COMPLETENESS_INVALID',
      'Civil resultant completeness audit is stale.',
    );
  }
  if (value.status === 'CALCULATED') {
    if (value.blockers.length !== 0 || !value.transferBalance?.passed) {
      fail(
        'EMPIRICAL_CIVIL_TRANSFER_BALANCE_INVALID',
        'Calculated civil transfer must be blocker-free and action/reaction balanced.',
      );
    }
    if (value.civilResultants.length !== value.completeness.qualifiedTransferCount) {
      fail(
        'EMPIRICAL_CIVIL_TRANSFER_RESULT_COUNT_INVALID',
        'Calculated civil resultants must match the qualified site-transfer count.',
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
  if (!stringValue(value.loadCaseId)
      || !stringValue(value.supportSiteId)
      || !stringValue(value.structuralAssemblyId)
      || value.transferId !== `CIVIL:${value.loadCaseId}:${value.supportSiteId}:${value.structuralAssemblyId}`) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_RESULT_IDENTITY_INVALID',
      'Civil resultant identity must bind load case, support site and structural assembly.',
    );
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
  const sourceReaction = vector(value.sourceReactionOnPipeN);
  const structureAction = vector(value.structureActionAtPipeAttachmentN);
  const civilForce = vector(value.civilReferenceResultant?.forceN);
  const offsetMm = vector(value.offsetCivilToPipeMm);
  const civilMoment = vector(value.civilReferenceResultant?.momentNm);
  if (!sourceReaction || !structureAction || !civilForce || !offsetMm || !civilMoment
      || sourceReaction.x !== 0 || sourceReaction.y !== 0) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_RESULT_VECTOR_INVALID',
      'B2 civil resultant vectors must be finite and source reaction must be vertical.',
    );
  }
  const expectedForce = scale(sourceReaction, -1);
  if (!sameVector(expectedForce, structureAction) || !sameVector(expectedForce, civilForce)) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_FORCE_SIGN_INVALID',
      'Structural action must be equal and opposite to the source reaction on pipe.',
    );
  }
  const expectedMoment = cross(scale(offsetMm, 0.001), expectedForce);
  if (!sameVector(expectedMoment, civilMoment)) {
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

function completenessFor(audits, supportResultCount, qualifiedTransferCount) {
  return {
    supportResultCount,
    nonzeroReactionCount: audits.filter((row) => (
      row.sourceVerticalReactionOnPipeN !== null
        && row.sourceVerticalReactionOnPipeN !== 0
    )).length,
    zeroReactionCount: audits.filter((row) => row.status === 'NO_LOAD').length,
    qualifiedTransferCount,
    blockedTransferCount: audits.filter((row) => row.status === 'BLOCKED').length,
  };
}

function transferBalance(supportResults, civilResultants) {
  const sourceVerticalReactionOnPipeN = supportResults.reduce((total, row) => {
    const value = finite(row?.verticalForceN);
    return total + (value === null ? 0 : value);
  }, 0);
  const structureVerticalActionN = civilResultants.reduce(
    (total, row) => total + row.civilReferenceResultant.forceN.z,
    0,
  );
  const actionReactionResidualN = sourceVerticalReactionOnPipeN + structureVerticalActionN;
  return freezeDeep({
    sourceVerticalReactionOnPipeN,
    structureVerticalActionN,
    actionReactionResidualN,
    passed: actionReactionResidualN === 0,
  });
}

function summarize(loadCases) {
  const calculatedCaseCount = loadCases.filter((row) => row.status === 'CALCULATED').length;
  return {
    loadCaseCount: loadCases.length,
    calculatedCaseCount,
    blockedCaseCount: loadCases.length - calculatedCaseCount,
    civilResultantCount: loadCases.reduce((total, row) => total + row.civilResultants.length, 0),
    zeroReactionCount: loadCases.reduce(
      (total, row) => total + row.completeness.zeroReactionCount,
      0,
    ),
  };
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
  const siteIds = value.sites.map((site) => stringValue(site?.siteId));
  if (siteIds.some((id) => !id) || new Set(siteIds).size !== siteIds.length) {
    fail(
      'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_MODEL_INVALID',
      'Support-site IDs must be non-empty and unique.',
    );
  }
  return value;
}

function blocker(code, message, details = null) {
  return freezeDeep(details === null ? { code, message } : { code, message, ...details });
}

function point(value) {
  const result = vector(value);
  return result ? freezeDeep(result) : null;
}

function vector(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = finite(value.x);
  const y = finite(value.y);
  const z = finite(value.z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(value, factor) {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function samePoint(left, right) {
  const a = vector(left);
  const b = vector(right);
  return Boolean(a && b && sameVector(a, b));
}

function sameVector(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
