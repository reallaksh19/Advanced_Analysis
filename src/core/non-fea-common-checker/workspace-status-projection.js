import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export const NON_FEA_WORKSPACE_STATUS_SCHEMA = 'non-fea-workspace-status-projection/v1';

const GATE_ORDER = Object.freeze([
  'A_SOURCE_MODEL',
  'B_TOPOLOGY_POS',
  'C_PROJECT_BASIS',
  'D_MASTER_AUTHORITY',
  'E_ENRICHMENT',
  'F_METHOD_READINESS',
  'G_QUALIFICATION',
  'H_SEAL_EXPORT',
]);
const VALID_GATE_STATES = Object.freeze([
  'READY', 'PARTIALLY_READY', 'BLOCKED', 'STALE', 'NOT_EVALUATED', 'NOT_SEALED',
]);

export function createNonFeaWorkspaceStatusProjection(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA workspace status input must be an object.');
  const source = normalizeSource(input.source);
  const topology = normalizeTopology(input.topology);
  const projectData = normalizeProjectData(input.projectData);
  const masters = normalizeMasters(input.masters);
  const enrichment = normalizeEnrichment(input.enrichment);
  const commonInput = normalizeCommonInput(input.commonInput);
  const implementation = normalizeImplementation(input.implementation);
  const execution = normalizeExecution(input.execution);

  const gates = buildGates({ source, topology, projectData, masters, enrichment, commonInput });
  const blockers = collectBlockers({ gates, projectData, masters, enrichment, commonInput });
  const lifecycleState = deriveLifecycleState(gates, commonInput);
  const overallState = deriveOverallState(gates, commonInput);
  const summary = deepFreeze({
    readyGateCount: gates.filter((row) => row.state === 'READY').length,
    blockedGateCount: gates.filter((row) => row.state === 'BLOCKED').length,
    staleGateCount: gates.filter((row) => row.state === 'STALE').length,
    requestedMethodCount: commonInput.requestedMethodIds.length,
    checkerReadyMethodCount: commonInput.readyMethodIds.length,
    checkerBlockedMethodCount: commonInput.blockedMethodIds.length,
    sealedMethodCount: commonInput.sealedMethodIds.length,
    masterProposalCount: enrichment.proposalCount,
    acceptedEnrichmentRecordCount: enrichment.acceptedRecordCount,
    implementationCount: implementation.implementations.length,
    qualifiedImplementationCount: implementation.implementations.filter((row) => (
      ['QUALIFIED', 'QUALIFIED_RESTRICTED_DOMAIN'].includes(row.qualificationState)
    )).length,
    authorizationReceiptCount: commonInput.authorizationReceiptCount,
    executionReceiptCount: commonInput.executionReceiptCount,
  });
  const policy = deepFreeze({
    readOnly: true,
    engineeringAuthority: false,
    fieldResolutionAuthority: false,
    sealingAuthority: false,
    authorizationAuthority: false,
    executionAuthority: false,
    implementationQualificationIsInputReadiness: false,
  });
  const base = {
    schema: NON_FEA_WORKSPACE_STATUS_SCHEMA,
    overallState,
    lifecycleState,
    source,
    topology,
    projectData,
    masters,
    enrichment,
    commonInput,
    implementation,
    execution,
    gates,
    blockers,
    summary,
    policy,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaWorkspaceStatusProjection(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_WORKSPACE_STATUS_SCHEMA) {
    throw new TypeError(`Expected ${NON_FEA_WORKSPACE_STATUS_SCHEMA}.`);
  }
  if (!Array.isArray(value.gates) || value.gates.length !== GATE_ORDER.length) {
    throw new TypeError('Non-FEA workspace status projection must contain exactly eight gates.');
  }
  value.gates.forEach((gate, index) => {
    if (gate.gateId !== GATE_ORDER[index]) throw new TypeError('Non-FEA workspace status gate order is invalid.');
    if (!VALID_GATE_STATES.includes(gate.state)) throw new TypeError(`Unsupported Non-FEA workspace gate state: ${gate.state}.`);
  });
  if (value.policy?.readOnly !== true
    || value.policy?.engineeringAuthority !== false
    || value.policy?.fieldResolutionAuthority !== false
    || value.policy?.sealingAuthority !== false
    || value.policy?.authorizationAuthority !== false
    || value.policy?.executionAuthority !== false
    || value.policy?.implementationQualificationIsInputReadiness !== false) {
    throw new TypeError('Non-FEA workspace status projection policy boundary is invalid.');
  }
  const { semanticHash: observed, ...base } = value;
  if (observed !== semanticHash(base)) throw new TypeError('Non-FEA workspace status projection semantic hash is invalid.');
  return value;
}

function buildGates(context) {
  const sourceReady = context.source.workspaceState === 'ready'
    && Boolean(context.source.datasetId)
    && isSha256(context.source.sourceDatasetSha256)
    && isSemanticHash(context.source.sourceModelSemanticHash);
  const topologyReady = context.topology.supportSiteStatus === 'READY'
    && context.topology.routePartitionStatus === 'READY'
    && isSemanticHash(context.topology.supportSiteSemanticHash)
    && isSemanticHash(context.topology.routePartitionSemanticHash);
  const projectReady = Object.values(context.projectData.audits).every((audit) => audit.valid === true);
  const requiredMasters = context.masters.filter((row) => row.required);
  const mastersReady = requiredMasters.every((row) => row.state === 'READY');

  let enrichmentState = 'NOT_EVALUATED';
  let enrichmentMessage = 'No current common field-resolution ledger has been observed.';
  if (context.enrichment.stale) {
    enrichmentState = 'STALE';
    enrichmentMessage = 'Accepted enrichment authority is stale against the active source model.';
  } else if (context.enrichment.migrationBlockerCodes.length) {
    enrichmentState = 'BLOCKED';
    enrichmentMessage = `${context.enrichment.migrationBlockerCodes.length} legacy migration decision(s) remain unresolved.`;
  } else if (context.commonInput.requestResolutionLedgerStatus === 'READY'
    && context.commonInput.requestSourceModelSemanticHash === context.source.sourceModelSemanticHash) {
    enrichmentState = 'READY';
    enrichmentMessage = `Current field-resolution ledger ${compact(context.commonInput.requestResolutionLedgerSemanticHash)} is source-bound.`;
  }

  const methodState = context.commonInput.error
    ? 'BLOCKED'
    : context.commonInput.reportPackageState || 'NOT_EVALUATED';
  const methodMessage = context.commonInput.error
    || (context.commonInput.reportPackageState
      ? `${context.commonInput.readyMethodIds.length}/${context.commonInput.requestedMethodIds.length} requested methods are input-ready.`
      : 'The common method-requirement registry has not produced a current report.');

  const qualificationRequired = context.commonInput.requestedMethodIds
    .some((methodId) => methodId !== 'ENRICHED_STAGED_JSON_EXPORT');
  let qualificationState = qualificationRequired ? 'NOT_EVALUATED' : 'READY';
  let qualificationMessage = qualificationRequired
    ? 'Qualification has not been evaluated for the requested calculation methods.'
    : 'The requested export-only scope does not require a calculation qualification profile.';
  if (qualificationRequired && context.commonInput.reportPackageState) {
    const qualificationBlocked = context.commonInput.methodRows.some((row) => (
      row.blockerCodes.includes('QUALIFICATION_PROFILE_REQUIRED')
    ));
    qualificationState = qualificationBlocked ? 'BLOCKED' : 'READY';
    qualificationMessage = qualificationBlocked
      ? 'At least one requested calculation method lacks a locked QUALIFIED profile.'
      : `Qualification profile ${compact(context.commonInput.requestQualificationProfileSemanticHash)} is current for the evaluated method scope.`;
  }

  let sealState = 'NOT_SEALED';
  let sealMessage = 'No common enriched piping input seal has been issued.';
  if (context.commonInput.commonInputSemanticHash && context.commonInput.commonInputStale) {
    sealState = 'STALE';
    sealMessage = `${context.commonInput.stalenessCodes.length || 1} authority change(s) require resealing.`;
  } else if (context.commonInput.commonInputSemanticHash) {
    sealState = context.commonInput.commonInputPackageState || 'READY';
    sealMessage = `${context.commonInput.sealedMethodIds.length} method(s) are bound to current common input ${compact(context.commonInput.commonInputSemanticHash)}.`;
  }

  return deepFreeze([
    gate('A_SOURCE_MODEL', sourceReady ? 'READY' : 'BLOCKED', sourceReady
      ? `Dataset ${context.source.datasetId} has current byte and shared-model identity.`
      : 'An active dataset with SHA-256 and shared-model semantic identity is required.'),
    gate('B_TOPOLOGY_POS', topologyReady ? 'READY' : 'BLOCKED', topologyReady
      ? `${context.topology.supportSiteCount} support site(s) and ${context.topology.routeCount} route(s) are current.`
      : 'Current support-site and route-partition authority is required.'),
    gate('C_PROJECT_BASIS', projectReady ? 'READY' : 'BLOCKED', projectReady
      ? `Project Data revision ${context.projectData.revision ?? 'UNKNOWN'} passes Non-FEA prerequisite audits.`
      : 'One or more Project Data prerequisite audits are blocked.'),
    gate('D_MASTER_AUTHORITY', mastersReady ? 'READY' : 'BLOCKED', mastersReady
      ? `${requiredMasters.length} required master source(s) are loaded and normalized.`
      : 'One or more required master sources are missing current normalized rows or source hashes.'),
    gate('E_ENRICHMENT', enrichmentState, enrichmentMessage),
    gate('F_METHOD_READINESS', normalizeGateState(methodState), methodMessage),
    gate('G_QUALIFICATION', qualificationState, qualificationMessage),
    gate('H_SEAL_EXPORT', normalizeGateState(sealState), sealMessage),
  ]);
}

function collectBlockers(context) {
  const rows = [];
  context.gates.filter((gateRow) => ['BLOCKED', 'STALE'].includes(gateRow.state)).forEach((gateRow) => {
    rows.push(issue(gateRow.gateId, gateRow.state, gateRow.message));
  });
  Object.entries(context.projectData.audits).forEach(([workflow, audit]) => {
    audit.errorCodes.forEach((code) => rows.push(issue('PROJECT_DATA', code, `${workflow} Project Data audit is blocked.`)));
  });
  context.masters.filter((row) => row.required && row.state !== 'READY').forEach((row) => {
    rows.push(issue('MASTER_DATA', 'MASTER_NOT_READY', `${row.masterKey} is required but not current.`));
  });
  context.enrichment.migrationBlockerCodes.forEach((code) => rows.push(issue('ENRICHMENT', code, 'Legacy enrichment migration decision is unresolved.')));
  context.commonInput.methodRows.forEach((row) => row.blockerCodes.forEach((code) => {
    rows.push(issue(row.methodId, code, `Method ${row.methodId} is blocked by ${code}.`));
  }));
  context.commonInput.stalenessCodes.forEach((code) => {
    rows.push(issue('COMMON_INPUT', code, 'The common input seal is stale.'));
  });
  const byKey = new Map();
  rows.forEach((row) => byKey.set(`${row.scope}|${row.code}|${row.message}`, row));
  return deepFreeze([...byKey.values()].sort(issueOrder));
}

function deriveLifecycleState(gates, commonInput) {
  const byId = new Map(gates.map((row) => [row.gateId, row]));
  if (['A_SOURCE_MODEL', 'B_TOPOLOGY_POS', 'C_PROJECT_BASIS', 'D_MASTER_AUTHORITY']
    .some((gateId) => byId.get(gateId)?.state === 'BLOCKED')) return 'PREFLIGHT_BLOCKED';
  if (byId.get('H_SEAL_EXPORT')?.state === 'STALE') return 'SEALED_STALE';
  if (commonInput.commonInputSemanticHash && !commonInput.commonInputStale) return 'SEALED_CURRENT';
  if (byId.get('F_METHOD_READINESS')?.state === 'READY' && byId.get('G_QUALIFICATION')?.state === 'READY') return 'READY_FOR_SEAL';
  if (byId.get('F_METHOD_READINESS')?.state === 'PARTIALLY_READY' && byId.get('G_QUALIFICATION')?.state === 'READY') return 'PARTIALLY_READY_FOR_SEAL';
  if (gates.some((row) => row.state === 'BLOCKED')) return 'PREFLIGHT_BLOCKED';
  return 'NOT_EVALUATED';
}

function deriveOverallState(gates, commonInput) {
  if (gates.some((row) => row.state === 'STALE')) return 'STALE';
  if (gates.some((row) => row.state === 'BLOCKED')) return 'BLOCKED';
  if (commonInput.commonInputSemanticHash && !commonInput.commonInputStale) {
    return commonInput.commonInputPackageState === 'PARTIALLY_READY' ? 'PARTIALLY_READY' : 'READY';
  }
  if (gates.some((row) => row.state === 'PARTIALLY_READY')) return 'PARTIALLY_READY';
  if (gates.every((row) => ['READY', 'NOT_SEALED'].includes(row.state))) return 'READY';
  return 'NOT_EVALUATED';
}

function normalizeSource(value) {
  const row = isRecord(value) ? value : {};
  return deepFreeze({
    workspaceState: text(row.workspaceState) || 'empty',
    datasetId: nullableText(row.datasetId),
    sourceDatasetSha256: nullableText(row.sourceDatasetSha256),
    sourceModelSemanticHash: nullableText(row.sourceModelSemanticHash),
  });
}
function normalizeTopology(value) {
  const row = isRecord(value) ? value : {};
  return deepFreeze({
    supportSiteStatus: nullableText(row.supportSiteStatus),
    supportSiteSemanticHash: nullableText(row.supportSiteSemanticHash),
    supportSiteCount: nonnegativeInteger(row.supportSiteCount),
    routePartitionStatus: nullableText(row.routePartitionStatus),
    routePartitionSemanticHash: nullableText(row.routePartitionSemanticHash),
    routeCount: nonnegativeInteger(row.routeCount),
  });
}
function normalizeProjectData(value) {
  const row = isRecord(value) ? value : {};
  const audits = isRecord(row.audits) ? row.audits : {};
  return deepFreeze({
    revision: Number.isInteger(row.revision) && row.revision >= 0 ? row.revision : null,
    profileSemanticHash: nullableText(row.profileSemanticHash),
    originKind: nullableText(row.originKind),
    originSource: nullableText(row.originSource),
    audits: deepFreeze(Object.fromEntries(['normalization', 'topology', 'loads'].map((workflow) => {
      const audit = isRecord(audits[workflow]) ? audits[workflow] : {};
      return [workflow, deepFreeze({
        valid: audit.valid === true,
        errorCodes: uniqueStrings(audit.errorCodes),
      })];
    }))),
  });
}
function normalizeMasters(value) {
  if (!Array.isArray(value)) return deepFreeze([]);
  const rows = value.map((row) => {
    if (!isRecord(row)) throw new TypeError('Master workspace status row must be an object.');
    const required = row.required === true;
    const rowCount = nonnegativeInteger(row.rowCount);
    const sourceHash = nullableText(row.sourceHash);
    return deepFreeze({
      masterKey: requiredText(row.masterKey, 'masterKey'),
      required,
      rowCount,
      sourceHash,
      state: rowCount > 0 && sourceHash ? 'READY' : required ? 'BLOCKED' : 'OPTIONAL',
    });
  }).sort((left, right) => ascii(left.masterKey, right.masterKey));
  assertUnique(rows.map((row) => row.masterKey), 'masterKey');
  return deepFreeze(rows);
}
function normalizeEnrichment(value) {
  const row = isRecord(value) ? value : {};
  return deepFreeze({
    currentSourceSemanticHash: nullableText(row.currentSourceSemanticHash),
    boundSourceSemanticHash: nullableText(row.boundSourceSemanticHash),
    stale: row.stale === true,
    proposalCount: nonnegativeInteger(row.proposalCount),
    acceptedRecordCount: nonnegativeInteger(row.acceptedRecordCount),
    migrationBlockerCodes: uniqueStrings(row.migrationBlockerCodes),
  });
}
function normalizeCommonInput(value) {
  const row = isRecord(value) ? value : {};
  const methodRows = Array.isArray(row.methodRows) ? row.methodRows.map((method) => deepFreeze({
    methodId: requiredText(method?.methodId, 'methodId'),
    state: normalizeGateState(method?.state || 'BLOCKED'),
    blockerCodes: uniqueStrings(method?.blockerCodes),
  })).sort((left, right) => ascii(left.methodId, right.methodId)) : [];
  return deepFreeze({
    requestedMethodIds: uniqueStrings(row.requestedMethodIds),
    requestedLoadCaseIds: uniqueStrings(row.requestedLoadCaseIds),
    error: nullableText(row.error),
    reportPackageState: nullableGateState(row.reportPackageState),
    reportSemanticHash: nullableText(row.reportSemanticHash),
    candidateSemanticHash: nullableText(row.candidateSemanticHash),
    readyMethodIds: uniqueStrings(row.readyMethodIds),
    blockedMethodIds: uniqueStrings(row.blockedMethodIds),
    methodRows: deepFreeze(methodRows),
    requestSourceModelSemanticHash: nullableText(row.requestSourceModelSemanticHash),
    requestResolutionLedgerStatus: nullableText(row.requestResolutionLedgerStatus),
    requestResolutionLedgerSemanticHash: nullableText(row.requestResolutionLedgerSemanticHash),
    requestEnrichmentSidecarSemanticHash: nullableText(row.requestEnrichmentSidecarSemanticHash),
    requestQualificationProfileSemanticHash: nullableText(row.requestQualificationProfileSemanticHash),
    commonInputPackageState: nullableGateState(row.commonInputPackageState),
    commonInputSemanticHash: nullableText(row.commonInputSemanticHash),
    sealedMethodIds: uniqueStrings(row.sealedMethodIds),
    commonInputStale: row.commonInputStale === true,
    stalenessCodes: uniqueStrings(row.stalenessCodes),
    exportSemanticHash: nullableText(row.exportSemanticHash),
    authorizationReceiptCount: nonnegativeInteger(row.authorizationReceiptCount),
    executionReceiptCount: nonnegativeInteger(row.executionReceiptCount),
  });
}
function normalizeImplementation(value) {
  const row = isRecord(value) ? value : {};
  const implementations = Array.isArray(row.implementations) ? row.implementations.map((item) => deepFreeze({
    implementationId: requiredText(item?.implementationId, 'implementationId'),
    runtimeState: text(item?.runtimeState) || 'UNKNOWN',
    qualificationState: text(item?.qualificationState) || 'UNKNOWN',
    commonMethodIds: uniqueStrings(item?.commonMethodIds),
  })).sort((left, right) => ascii(left.implementationId, right.implementationId)) : [];
  assertUnique(implementations.map((item) => item.implementationId), 'implementationId');
  return deepFreeze({
    registrySemanticHash: nullableText(row.registrySemanticHash),
    implementations: deepFreeze(implementations),
  });
}
function normalizeExecution(value) {
  const row = isRecord(value) ? value : {};
  return deepFreeze({
    empiricalScenarioState: nullableText(row.empiricalScenarioState),
    empiricalAuthorizationState: nullableText(row.empiricalAuthorizationState),
    empiricalAuthorizationReasonCode: nullableText(row.empiricalAuthorizationReasonCode),
  });
}

function gate(gateId, state, message) {
  return deepFreeze({ gateId, state: normalizeGateState(state), message: requiredText(message, 'gate message') });
}
function issue(scope, code, message) { return deepFreeze({ scope, code, message }); }
function issueOrder(left, right) { return ascii(`${left.scope}|${left.code}|${left.message}`, `${right.scope}|${right.code}|${right.message}`); }
function normalizeGateState(value) {
  const state = text(value);
  if (!VALID_GATE_STATES.includes(state)) return 'BLOCKED';
  return state;
}
function nullableGateState(value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizeGateState(value);
}
function uniqueStrings(value) {
  if (!Array.isArray(value)) return deepFreeze([]);
  return deepFreeze([...new Set(value.map((item) => text(item)).filter(Boolean))].sort(ascii));
}
function requiredText(value, label) {
  const result = text(value);
  if (!result) throw new TypeError(`${label} is required.`);
  return result;
}
function nullableText(value) { const result = text(value); return result || null; }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function nonnegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }
function assertUnique(values, label) { if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label} values are not permitted.`); }
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function isSemanticHash(value) { return typeof value === 'string' && /^fnv1a64:[a-f0-9]{16}$/u.test(value); }
function compact(value) { return value ? (value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value) : 'NOT_AVAILABLE'; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
