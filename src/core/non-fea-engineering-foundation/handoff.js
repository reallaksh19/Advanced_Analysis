import { requireCommonEnrichedPipingInput } from '../non-fea-common-checker/index.js';
import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateNonFeaEngineeringFoundationBundle } from './bundle.js';
import {
  createNonFeaApprovedAssumptionCustody,
  createNonFeaQualificationCustody,
  validateNonFeaApprovedAssumptionCustody,
  validateNonFeaQualificationCustody,
} from './governance-custody.js';

export const NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_SCHEMA =
  'non-fea-engineering-foundation-handoff/v2';

const VERTICAL_LOAD_IMPLEMENTATIONS = Object.freeze([
  'LOAD_CASE_AUTHORITY',
  'MODEL_LOAD_FOUNDATION',
  'MASS_LEDGER',
  'TOPOLOGY_GRAPH',
  'SUPPORT_ATTACHMENTS',
  'RESTRAINT_CAPABILITY',
  'SUPPORT_SITES',
  'ROUTE_PARTITIONS',
  'VERTICAL_LOAD_PATH',
]);

const RESTRAINT_NETWORK_IMPLEMENTATIONS = Object.freeze([
  'LOAD_CASE_AUTHORITY',
  'TOPOLOGY_GRAPH',
  'SUPPORT_ATTACHMENTS',
  'RESTRAINT_CAPABILITY',
  'SUPPORT_SITES',
  'ROUTE_PARTITIONS',
]);

const IMPLEMENTATION_FOUNDATION_CAPABILITIES = Object.freeze({
  CHAINAGE_TRIBUTARY_SPAN_V2: VERTICAL_LOAD_IMPLEMENTATIONS,
  CHAINAGE_TRIBUTARY_SPAN_V3_COG: VERTICAL_LOAD_IMPLEMENTATIONS,
  EMPIRICAL_BEAM_CONTACT_V1: VERTICAL_LOAD_IMPLEMENTATIONS,
  AUTHORIZED_EMPIRICAL_SUPPORT_LOADS_V1: VERTICAL_LOAD_IMPLEMENTATIONS,
  EMPIRICAL_RESTRAINT_NETWORK_V1: RESTRAINT_NETWORK_IMPLEMENTATIONS,
  EMPIRICAL_RESTRAINT_NETWORK_V2: RESTRAINT_NETWORK_IMPLEMENTATIONS,
  EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1: Object.freeze([
    'LOAD_CASE_AUTHORITY',
  ]),
  COMMON_INPUT_EXPORT_V1: Object.freeze([]),
});

export function requiredFoundationCapabilitiesForImplementation(implementationId) {
  const id = requiredText(implementationId, 'implementationId');
  const capabilityIds = IMPLEMENTATION_FOUNDATION_CAPABILITIES[id];
  if (!capabilityIds) {
    throw codedError(
      `No engineering-foundation capability binding exists for ${id}.`,
      'NON_FEA_ENGINEERING_FOUNDATION_IMPLEMENTATION_BINDING_REQUIRED',
    );
  }
  return capabilityIds;
}

/**
 * Creates the immutable preprocessing handoff consumed by method authorization.
 * Mechanical foundation capabilities and governance custody are deliberately
 * orthogonal. Neither receipt authorizes or executes a calculation.
 */
export function createNonFeaEngineeringFoundationHandoff(input = {}) {
  const implementationId = requiredText(input.implementationId, 'implementationId');
  const commonInput = requireCommonEnrichedPipingInput(input.commonInput);
  const foundation = input.foundation;
  const validation = validateNonFeaEngineeringFoundationBundle(foundation);
  if (!validation.ok) {
    const error = codedError(
      'The Non-FEA Engineering Foundation bundle is invalid.',
      'NON_FEA_ENGINEERING_FOUNDATION_INVALID',
    );
    error.details = deepFreeze({ errors: [...validation.errors] });
    throw error;
  }

  const approvedAssumptionCustody = createNonFeaApprovedAssumptionCustody({
    sourceModelSemanticHash: commonInput.sourceModelSemanticHash,
    resolutionLedger: commonInput.resolutionLedger,
  });
  const qualificationCustody = createNonFeaQualificationCustody({
    projectDataProfile: commonInput.projectDataProfile,
    qualificationProfile: commonInput.qualificationProfile,
    qualificationRequired: implementationId !== 'COMMON_INPUT_EXPORT_V1',
    authorityMode: 'SEALED_COMMON_INPUT',
    sealedQualificationProfileSemanticHash:
      commonInput.qualificationProfileSemanticHash || null,
  });

  const requiredCapabilityIds = requiredFoundationCapabilitiesForImplementation(implementationId);
  const blockers = [];
  if (foundation.sourceModelSemanticHash !== commonInput.sourceModelSemanticHash) {
    blockers.push(issue(
      'NON_FEA_ENGINEERING_FOUNDATION_SOURCE_MISMATCH',
      'Engineering Foundation is bound to a different source model.',
      commonInput.sourceModelSemanticHash,
      foundation.sourceModelSemanticHash,
    ));
  }
  if (foundation.enrichmentProjectionSemanticHash !== commonInput.enrichedProjectionSemanticHash) {
    blockers.push(issue(
      'NON_FEA_ENGINEERING_FOUNDATION_PROJECTION_MISMATCH',
      'Engineering Foundation is bound to a different enriched projection.',
      commonInput.enrichedProjectionSemanticHash,
      foundation.enrichmentProjectionSemanticHash,
    ));
  }
  const expectedProjectRevision = Number.isInteger(commonInput.projectDataProfile?.revision)
    ? commonInput.projectDataProfile.revision
    : null;
  if (expectedProjectRevision !== null && foundation.projectDataRevision !== expectedProjectRevision) {
    blockers.push(issue(
      'NON_FEA_ENGINEERING_FOUNDATION_PROJECT_REVISION_MISMATCH',
      'Engineering Foundation is bound to a different Project Data revision.',
      expectedProjectRevision,
      foundation.projectDataRevision,
    ));
  }

  assertRequiredAuthorityContractsCurrent(
    requiredCapabilityIds,
    foundation,
    commonInput,
    blockers,
  );

  const capabilityById = new Map(
    (foundation.capabilities || []).map((row) => [row.capabilityId, row]),
  );
  requiredCapabilityIds.forEach((capabilityId) => {
    const row = capabilityById.get(capabilityId);
    if (!row || row.state !== 'READY' || !validHash(row.semanticHash)) {
      blockers.push(issue(
        'NON_FEA_ENGINEERING_FOUNDATION_CAPABILITY_NOT_READY',
        `${capabilityId} is required by ${implementationId} but is not READY.`,
        'READY',
        row?.state || 'MISSING',
        capabilityId,
      ));
    }
  });

  if (approvedAssumptionCustody.state !== 'READY') {
    blockers.push(issue(
      'NON_FEA_APPROVED_ASSUMPTION_CUSTODY_BLOCKED',
      'Approved-assumption custody is not READY for calculation handoff.',
      'READY',
      approvedAssumptionCustody.state,
      'APPROVED_ASSUMPTION_CUSTODY',
    ));
  }
  if (qualificationCustody.state !== 'READY') {
    blockers.push(issue(
      'NON_FEA_QUALIFICATION_CUSTODY_BLOCKED',
      'Project/application qualification custody is not READY for calculation handoff.',
      'READY',
      qualificationCustody.state,
      'QUALIFICATION_CUSTODY',
    ));
  }

  if (requiredCapabilityIds.includes('LOAD_CASE_AUTHORITY')) {
    const approved = new Set(foundation.loadCaseAuthority?.approvedLoadCases || []);
    const missingLoadCases = (commonInput.requestedLoadCases || [])
      .filter((loadCaseId) => !approved.has(loadCaseId))
      .sort(ascii);
    if (missingLoadCases.length) {
      blockers.push(issue(
        'NON_FEA_ENGINEERING_FOUNDATION_LOAD_CASE_MISMATCH',
        `Engineering Foundation does not authorize sealed Load Cases: ${missingLoadCases.join(', ')}.`,
        commonInput.requestedLoadCases,
        foundation.loadCaseAuthority?.approvedLoadCases || [],
      ));
    }
  }

  if (blockers.length) {
    const error = codedError(
      `Engineering Foundation is not current/ready for ${implementationId}.`,
      'NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_BLOCKED',
    );
    error.details = deepFreeze({
      blockers: blockers.sort(issueOrder),
      approvedAssumptionCustodyBlockers: approvedAssumptionCustody.blockers,
      qualificationCustodyBlockers: qualificationCustody.blockers,
    });
    throw error;
  }

  const capabilityBindings = requiredCapabilityIds.map((capabilityId) => {
    const row = capabilityById.get(capabilityId);
    return deepFreeze({ capabilityId, semanticHash: row.semanticHash });
  });
  const governanceBindings = deepFreeze([
    {
      custodyId: 'APPROVED_ASSUMPTION_CUSTODY',
      semanticHash: approvedAssumptionCustody.semanticHash,
    },
    {
      custodyId: 'QUALIFICATION_CUSTODY',
      semanticHash: qualificationCustody.semanticHash,
    },
  ]);
  const governanceBindingSemanticHash = semanticHash({
    implementationId,
    commonInputSemanticHash: commonInput.semanticHash,
    governanceBindings,
  });
  const capabilityBindingSemanticHash = semanticHash({
    implementationId,
    commonInputSemanticHash: commonInput.semanticHash,
    requiredCapabilityIds,
    capabilityBindings,
    governanceBindingSemanticHash,
  });
  const base = {
    schema: NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_SCHEMA,
    implementationId,
    commonInputSemanticHash: commonInput.semanticHash,
    sourceModelSemanticHash: commonInput.sourceModelSemanticHash,
    enrichedProjectionSemanticHash: commonInput.enrichedProjectionSemanticHash,
    resolutionLedgerSemanticHash: commonInput.resolutionLedgerSemanticHash,
    projectDataProfileSemanticHash: commonInput.projectDataProfileSemanticHash,
    qualificationProfileSemanticHash: commonInput.qualificationProfileSemanticHash || null,
    projectDataRevision: expectedProjectRevision,
    engineeringFoundationSemanticHash: foundation.semanticHash,
    requiredCapabilityIds,
    capabilityBindings,
    approvedAssumptionCustody,
    qualificationCustody,
    governanceBindings,
    governanceBindingSemanticHash,
    capabilityBindingSemanticHash,
    policy: {
      readOnlyPreparation: true,
      governanceCustodyRequired: true,
      authorizationAuthority: false,
      executionAuthority: false,
      geometryMutationPermitted: false,
    },
  };
  return requireNonFeaEngineeringFoundationHandoff({
    ...base,
    semanticHash: semanticHash(base),
  });
}

export function requireNonFeaEngineeringFoundationHandoff(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_SCHEMA) {
    throw new TypeError(`Expected ${NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_SCHEMA}.`);
  }
  const base = { ...value };
  delete base.semanticHash;
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError(
      'Engineering Foundation handoff hash is stale.',
      'NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_HASH_MISMATCH',
    );
  }
  const required = requiredFoundationCapabilitiesForImplementation(value.implementationId);
  if (JSON.stringify(value.requiredCapabilityIds) !== JSON.stringify(required)) {
    throw codedError(
      'Engineering Foundation handoff capability binding is not canonical.',
      'NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_CAPABILITY_MISMATCH',
    );
  }
  const capabilityIds = (value.capabilityBindings || []).map((row) => row?.capabilityId);
  if (JSON.stringify(capabilityIds) !== JSON.stringify(required)) {
    throw codedError(
      'Engineering Foundation handoff capability receipts are incomplete or out of order.',
      'NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_CAPABILITY_RECEIPTS_INVALID',
    );
  }
  if (!(value.capabilityBindings || []).every((row) => validHash(row?.semanticHash))) {
    throw codedError(
      'Engineering Foundation handoff capability semantic hashes are invalid.',
      'NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_CAPABILITY_HASH_INVALID',
    );
  }

  const assumptionValidation = validateNonFeaApprovedAssumptionCustody(
    value.approvedAssumptionCustody,
  );
  const qualificationValidation = validateNonFeaQualificationCustody(
    value.qualificationCustody,
  );
  if (!assumptionValidation.ok || value.approvedAssumptionCustody.state !== 'READY') {
    throw codedError(
      'Engineering Foundation handoff assumption custody is invalid or blocked.',
      'NON_FEA_ENGINEERING_FOUNDATION_ASSUMPTION_CUSTODY_INVALID',
    );
  }
  if (!qualificationValidation.ok || value.qualificationCustody.state !== 'READY') {
    throw codedError(
      'Engineering Foundation handoff qualification custody is invalid or blocked.',
      'NON_FEA_ENGINEERING_FOUNDATION_QUALIFICATION_CUSTODY_INVALID',
    );
  }
  if (value.approvedAssumptionCustody.sourceModelSemanticHash !== value.sourceModelSemanticHash
      || value.approvedAssumptionCustody.resolutionLedgerSemanticHash !== value.resolutionLedgerSemanticHash) {
    throw codedError(
      'Engineering Foundation handoff assumption custody does not match sealed input lineage.',
      'NON_FEA_ENGINEERING_FOUNDATION_ASSUMPTION_CUSTODY_BINDING_MISMATCH',
    );
  }
  if (value.qualificationCustody.projectDataProfileSemanticHash !== value.projectDataProfileSemanticHash
      || value.qualificationCustody.qualificationProfileSemanticHash !== value.qualificationProfileSemanticHash
      || value.qualificationCustody.sealedQualificationProfileSemanticHash !== value.qualificationProfileSemanticHash) {
    throw codedError(
      'Engineering Foundation handoff qualification custody does not match sealed input lineage.',
      'NON_FEA_ENGINEERING_FOUNDATION_QUALIFICATION_CUSTODY_BINDING_MISMATCH',
    );
  }
  const expectedGovernanceBindings = [
    {
      custodyId: 'APPROVED_ASSUMPTION_CUSTODY',
      semanticHash: value.approvedAssumptionCustody.semanticHash,
    },
    {
      custodyId: 'QUALIFICATION_CUSTODY',
      semanticHash: value.qualificationCustody.semanticHash,
    },
  ];
  if (JSON.stringify(value.governanceBindings) !== JSON.stringify(expectedGovernanceBindings)) {
    throw codedError(
      'Engineering Foundation governance custody receipts are incomplete or out of order.',
      'NON_FEA_ENGINEERING_FOUNDATION_GOVERNANCE_RECEIPTS_INVALID',
    );
  }
  const expectedGovernanceBindingHash = semanticHash({
    implementationId: value.implementationId,
    commonInputSemanticHash: value.commonInputSemanticHash,
    governanceBindings: value.governanceBindings,
  });
  if (value.governanceBindingSemanticHash !== expectedGovernanceBindingHash) {
    throw codedError(
      'Engineering Foundation governance-binding hash is invalid.',
      'NON_FEA_ENGINEERING_FOUNDATION_GOVERNANCE_BINDING_HASH_MISMATCH',
    );
  }
  const expectedCapabilityBindingHash = semanticHash({
    implementationId: value.implementationId,
    commonInputSemanticHash: value.commonInputSemanticHash,
    requiredCapabilityIds: value.requiredCapabilityIds,
    capabilityBindings: value.capabilityBindings,
    governanceBindingSemanticHash: value.governanceBindingSemanticHash,
  });
  if (value.capabilityBindingSemanticHash !== expectedCapabilityBindingHash) {
    throw codedError(
      'Engineering Foundation capability-binding hash is invalid.',
      'NON_FEA_ENGINEERING_FOUNDATION_CAPABILITY_BINDING_HASH_MISMATCH',
    );
  }
  if (!validHash(value.commonInputSemanticHash)
      || !validHash(value.sourceModelSemanticHash)
      || !validHash(value.enrichedProjectionSemanticHash)
      || !validHash(value.resolutionLedgerSemanticHash)
      || !validHash(value.projectDataProfileSemanticHash)
      || (value.qualificationProfileSemanticHash !== null
        && !validHash(value.qualificationProfileSemanticHash))
      || !validHash(value.engineeringFoundationSemanticHash)) {
    throw codedError(
      'Engineering Foundation handoff requires current semantic-hash bindings.',
      'NON_FEA_ENGINEERING_FOUNDATION_HANDOFF_BINDING_HASH_INVALID',
    );
  }
  return deepFreeze(value);
}

function assertRequiredAuthorityContractsCurrent(
  requiredCapabilityIds,
  foundation,
  commonInput,
  blockers,
) {
  const rows = [
    ['TOPOLOGY_GRAPH', 'topologyGraph', foundation.topologyGraph],
    ['SUPPORT_ATTACHMENTS', 'supportAttachmentModel', foundation.supportAttachmentModel],
    ['RESTRAINT_CAPABILITY', 'restraintCapabilityModel', foundation.restraintCapabilityModel],
    ['SUPPORT_SITES', 'supportSiteModel', foundation.supportSiteModel],
    ['ROUTE_PARTITIONS', 'routePartitionModel', foundation.routePartitionModel],
    ['MODEL_LOAD_FOUNDATION', 'loadPrimitiveSet', foundation.modelLoadFoundation?.loadPrimitiveSet],
  ];
  rows.forEach(([capabilityId, commonKey, actualContract]) => {
    if (!requiredCapabilityIds.includes(capabilityId)) return;
    const expectedHash = commonInput.authorityContracts?.[commonKey]?.semanticHash || null;
    const actualHash = actualContract?.semanticHash || null;
    if (expectedHash !== actualHash) {
      blockers.push(issue(
        'NON_FEA_ENGINEERING_FOUNDATION_SEALED_AUTHORITY_MISMATCH',
        `${capabilityId} does not match the authority contract frozen into the common seal.`,
        expectedHash,
        actualHash,
        capabilityId,
      ));
    }
  });
}

function issue(code, message, expected, actual, capabilityId = null) {
  return deepFreeze({ code, message, expected, actual, capabilityId });
}
function issueOrder(left, right) {
  return ascii(`${left.code}|${left.capabilityId || ''}`, `${right.code}|${right.capabilityId || ''}`);
}
function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}
function validHash(value) { return typeof value === 'string' && value.includes(':'); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function codedError(message, code) { const error = new Error(message); error.code = code; return error; }
