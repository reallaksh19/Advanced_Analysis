import {
  canonicalPrettyStringify,
  deepFreeze,
  semanticHash,
  utf8ByteLength,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';

export const NON_FEA_COMMON_SCHEMAS = Object.freeze({
  REQUEST: 'pre-fea-piping-check-request/v1',
  REPORT: 'pre-fea-piping-check-report/v1',
  CANDIDATE: 'common-enriched-piping-input-candidate/v1',
  COMMON_INPUT: 'common-enriched-piping-input/v1',
  LINEAGE: 'non-fea-common-input-lineage/v1',
  EXPORT: 'enriched-staged-json-export/v1',
  EXPORT_ARTIFACT: 'enriched-staged-json-artifact/v1',
  STALENESS: 'non-fea-common-input-staleness/v1',
});

export const NON_FEA_COMMON_METHOD_IDS = Object.freeze([
  'WEIGHT_AND_GRAVITY',
  'SUSTAINED_REACTIONS',
  'SUSTAINED_MEMBER_ACTIONS',
  'SUSTAINED_STRESS',
  'THERMAL_FREE_DISPLACEMENT',
  'RESTRAINT_REACTIONS',
  'VERTICAL_CONTACT',
  'COMBINED_OPERATING_REACTION',
  'ENRICHED_STAGED_JSON_EXPORT',
]);

const AUTHORITY_CONTRACT_KEYS = Object.freeze([
  'topologyGraph',
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'supportSiteModel',
  'routePartitionModel',
  'loadPrimitiveSet',
]);

const PROJECT_PATHS = Object.freeze({
  GRAVITY: 'loadCalculation.gravityMPerS2',
  ACTIVE_CASES: 'loadCalculation.activeLoadCases',
  INSTALLATION_TEMPERATURE: 'thermoMechanicalBasis.installationTemperatureC',
  OPERATING_TEMPERATURES: 'thermoMechanicalBasis.operatingTemperaturesC',
  CASE_PRESSURES: 'thermoMechanicalBasis.casePressuresPa',
  CORROSION_ALLOWANCES: 'thermoMechanicalBasis.corrosionAllowancesMm',
  MATERIAL_ELASTIC: 'thermoMechanicalBasis.materialElasticProperties',
  STRESS_CODE: 'thermoMechanicalBasis.stressCodeBasis',
  PRESSURE_BOUNDARY: 'thermoMechanicalBasis.pressureBoundarySemantics',
  RESTRAINT_STIFFNESS: 'restraintPolicy.restraintStiffnessNPerM',
  RESTRAINT_GAPS: 'restraintPolicy.restraintGapsMm',
  FRICTION: 'restraintPolicy.frictionCoefficients',
  CONTACT: 'restraintPolicy.contactPolicy',
  NONLINEAR: 'qualificationPolicy.nonlinearApplicabilityPolicy',
  SUPERPOSITION: 'qualificationPolicy.superpositionPolicy',
});

const REQUIREMENTS = Object.freeze({
  SOURCE_MODEL: requirement('SOURCE_MODEL', 'Immutable shared piping model'),
  SOURCE_CUSTODY: requirement('SOURCE_CUSTODY', 'Source dataset SHA-256'),
  ENRICHMENT_CURRENT: requirement('ENRICHMENT_CURRENT', 'Current exact field-resolution ledger and enriched projection'),
  TOPOLOGY_GRAPH: requirement('TOPOLOGY_GRAPH', 'Governed topology graph'),
  SUPPORT_ATTACHMENTS: requirement('SUPPORT_ATTACHMENTS', 'Exact support attachment authority'),
  RESTRAINT_CAPABILITY: requirement('RESTRAINT_CAPABILITY', 'Restraint capability authority'),
  SUPPORT_SITES: requirement('SUPPORT_SITES', 'Canonical support-site model'),
  ROUTE_PARTITIONS: requirement('ROUTE_PARTITIONS', 'Governed route partitions'),
  LOAD_PRIMITIVES: requirement('LOAD_PRIMITIVES', 'Source load primitive set'),
  GRAVITY: requirement('GRAVITY', 'Approved gravity basis'),
  ACTIVE_LOAD_CASES: requirement('ACTIVE_LOAD_CASES', 'Approved active load cases'),
  MASS_COVERAGE: requirement('MASS_COVERAGE', 'Entity mass and content coverage'),
  FLEXURAL_COVERAGE: requirement('FLEXURAL_COVERAGE', 'Entity flexural-property coverage'),
  SECTION_COVERAGE: requirement('SECTION_COVERAGE', 'Pipe section and corrosion coverage'),
  THERMAL_BASIS: requirement('THERMAL_BASIS', 'Temperature and thermal material basis'),
  PRESSURE_BASIS: requirement('PRESSURE_BASIS', 'Pressure and pressure-boundary basis'),
  STRESS_BASIS: requirement('STRESS_BASIS', 'Sustained stress-code basis'),
  RESTRAINT_STIFFNESS: requirement('RESTRAINT_STIFFNESS', 'Restraint stiffness basis'),
  RESTRAINT_GAPS: requirement('RESTRAINT_GAPS', 'Restraint gap basis'),
  CONTACT_POLICY: requirement('CONTACT_POLICY', 'Unilateral contact policy'),
  FRICTION_POLICY: requirement('FRICTION_POLICY', 'Friction policy'),
  NONLINEAR_POLICY: requirement('NONLINEAR_POLICY', 'Nonlinear applicability policy'),
  SUPERPOSITION_POLICY: requirement('SUPERPOSITION_POLICY', 'Combined-case superposition policy'),
  QUALIFICATION: requirement('QUALIFICATION', 'Exact locked qualification profile'),
  CONFIGURED_DEFAULT_USAGE: requirement('CONFIGURED_DEFAULT_USAGE', 'Auditable configured-default usage'),
  EXPORT_CONTRACT: requirement('EXPORT_CONTRACT', 'Deterministic staged export contract'),
});

const METHOD_REQUIREMENTS = Object.freeze({
  WEIGHT_AND_GRAVITY: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'GRAVITY',
    'ACTIVE_LOAD_CASES', 'MASS_COVERAGE', 'QUALIFICATION', 'CONFIGURED_DEFAULT_USAGE',
  ]),
  SUSTAINED_REACTIONS: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'SUPPORT_ATTACHMENTS', 'RESTRAINT_CAPABILITY', 'SUPPORT_SITES',
    'ROUTE_PARTITIONS', 'LOAD_PRIMITIVES', 'GRAVITY', 'ACTIVE_LOAD_CASES',
    'MASS_COVERAGE', 'QUALIFICATION', 'CONFIGURED_DEFAULT_USAGE',
  ]),
  SUSTAINED_MEMBER_ACTIONS: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'SUPPORT_ATTACHMENTS', 'RESTRAINT_CAPABILITY', 'SUPPORT_SITES',
    'ROUTE_PARTITIONS', 'LOAD_PRIMITIVES', 'GRAVITY', 'ACTIVE_LOAD_CASES',
    'MASS_COVERAGE', 'FLEXURAL_COVERAGE', 'QUALIFICATION',
    'CONFIGURED_DEFAULT_USAGE',
  ]),
  SUSTAINED_STRESS: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'SUPPORT_ATTACHMENTS', 'RESTRAINT_CAPABILITY', 'SUPPORT_SITES',
    'ROUTE_PARTITIONS', 'LOAD_PRIMITIVES', 'GRAVITY', 'ACTIVE_LOAD_CASES',
    'MASS_COVERAGE', 'FLEXURAL_COVERAGE', 'SECTION_COVERAGE',
    'PRESSURE_BASIS', 'STRESS_BASIS', 'QUALIFICATION',
    'CONFIGURED_DEFAULT_USAGE',
  ]),
  THERMAL_FREE_DISPLACEMENT: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'FLEXURAL_COVERAGE', 'THERMAL_BASIS', 'QUALIFICATION',
    'CONFIGURED_DEFAULT_USAGE',
  ]),
  RESTRAINT_REACTIONS: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'SUPPORT_ATTACHMENTS', 'RESTRAINT_CAPABILITY', 'SUPPORT_SITES',
    'ROUTE_PARTITIONS', 'FLEXURAL_COVERAGE', 'THERMAL_BASIS',
    'RESTRAINT_STIFFNESS', 'RESTRAINT_GAPS', 'QUALIFICATION',
    'CONFIGURED_DEFAULT_USAGE',
  ]),
  VERTICAL_CONTACT: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'SUPPORT_ATTACHMENTS', 'RESTRAINT_CAPABILITY', 'SUPPORT_SITES',
    'ROUTE_PARTITIONS', 'LOAD_PRIMITIVES', 'GRAVITY', 'ACTIVE_LOAD_CASES',
    'MASS_COVERAGE', 'FLEXURAL_COVERAGE', 'RESTRAINT_STIFFNESS',
    'RESTRAINT_GAPS', 'CONTACT_POLICY', 'FRICTION_POLICY', 'NONLINEAR_POLICY',
    'QUALIFICATION', 'CONFIGURED_DEFAULT_USAGE',
  ]),
  COMBINED_OPERATING_REACTION: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT', 'TOPOLOGY_GRAPH',
    'SUPPORT_ATTACHMENTS', 'RESTRAINT_CAPABILITY', 'SUPPORT_SITES',
    'ROUTE_PARTITIONS', 'LOAD_PRIMITIVES', 'GRAVITY', 'ACTIVE_LOAD_CASES',
    'MASS_COVERAGE', 'FLEXURAL_COVERAGE', 'SECTION_COVERAGE',
    'THERMAL_BASIS', 'PRESSURE_BASIS', 'STRESS_BASIS',
    'RESTRAINT_STIFFNESS', 'RESTRAINT_GAPS', 'CONTACT_POLICY',
    'FRICTION_POLICY', 'NONLINEAR_POLICY', 'SUPERPOSITION_POLICY',
    'QUALIFICATION', 'CONFIGURED_DEFAULT_USAGE',
  ]),
  ENRICHED_STAGED_JSON_EXPORT: Object.freeze([
    'SOURCE_MODEL', 'SOURCE_CUSTODY', 'ENRICHMENT_CURRENT',
    'CONFIGURED_DEFAULT_USAGE', 'EXPORT_CONTRACT',
  ]),
});

export const NON_FEA_METHOD_REQUIREMENT_REGISTRY = deepFreeze({
  schema: 'non-fea-method-requirement-registry/v1',
  requirements: Object.values(REQUIREMENTS),
  methods: NON_FEA_COMMON_METHOD_IDS.map((methodId) => ({
    methodId,
    requirementIds: METHOD_REQUIREMENTS[methodId],
  })),
});

export function createPreFeaPipingCheckRequest(input) {
  if (!isRecord(input)) throw new TypeError('Pre-FEA piping check request input must be an object.');
  const sourceModel = requireSharedModel(input.sourceModel);
  const requestedMethods = uniqueMethodIds(input.requestedMethods || NON_FEA_COMMON_METHOD_IDS);
  const requestedLoadCases = uniqueStrings(input.requestedLoadCases || ['EMPTY'], 'requestedLoadCases');
  const sourceDatasetSha256 = requireSha256(input.sourceDatasetSha256, 'sourceDatasetSha256');
  const projectDataProfile = requireObject(input.projectDataProfile, 'projectDataProfile');
  const resolutionLedger = requireSchemaObject(
    input.resolutionLedger,
    'non-fea-field-resolution-ledger/v1',
    'resolutionLedger',
  );
  const enrichmentSidecar = requireSchemaObject(
    input.enrichmentSidecar,
    'non-fea-enrichment-sidecar/v1',
    'enrichmentSidecar',
  );
  const enrichedProjection = requireSchemaObject(
    input.enrichedProjection,
    'non-fea-enriched-shared-model-projection/v1',
    'enrichedProjection',
  );
  const authorityContracts = normalizeAuthorityContracts(input.authorityContracts || {});
  const qualificationProfile = input.qualificationProfile === null || input.qualificationProfile === undefined
    ? null
    : normalizeQualificationProfile(input.qualificationProfile);
  const configuredDefaultUsageLedger = input.configuredDefaultUsageLedger === null
    || input.configuredDefaultUsageLedger === undefined
    ? null
    : requireSchemaObject(
      input.configuredDefaultUsageLedger,
      'non-fea-configured-default-usage-ledger/v1',
      'configuredDefaultUsageLedger',
    );
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.REQUEST,
    requestId: requiredText(input.requestId, 'requestId'),
    sourceDatasetSha256,
    requestedMethods,
    requestedLoadCases,
    sourceModel,
    enrichmentSidecar,
    resolutionLedger,
    enrichedProjection,
    projectDataProfile: deepFreeze(structuredClone(projectDataProfile)),
    projectDataOrigin: input.projectDataOrigin === null || input.projectDataOrigin === undefined
      ? null
      : deepFreeze(structuredClone(requireObject(input.projectDataOrigin, 'projectDataOrigin'))),
    authorityContracts,
    qualificationProfile,
    configuredDefaultUsageLedger,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function runPreFeaPipingCheck(value) {
  const request = requirePreFeaPipingCheckRequest(value);
  const context = createEvaluationContext(request);
  const globalBlockers = globalRequestBlockers(context);
  const methodRows = request.requestedMethods.map((methodId) => evaluateMethod(methodId, context));
  const readyMethodIds = methodRows.filter((row) => row.state === 'READY').map((row) => row.methodId);
  const blockedMethodIds = methodRows.filter((row) => row.state !== 'READY').map((row) => row.methodId);
  const packageState = globalBlockers.length || readyMethodIds.length === 0
    ? 'BLOCKED'
    : blockedMethodIds.length === 0 ? 'READY' : 'PARTIALLY_READY';
  const candidate = createCandidate(request, methodRows, packageState);
  const blockers = uniqueIssues([
    ...globalBlockers,
    ...methodRows.flatMap((row) => row.blockers.map((blocker) => ({
      ...blocker,
      methodId: row.methodId,
    }))),
  ]);
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.REPORT,
    requestSemanticHash: request.semanticHash,
    candidateSemanticHash: candidate.semanticHash,
    packageState,
    readyMethodIds,
    blockedMethodIds,
    methodRows,
    blockers,
    candidate,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function sealCommonEnrichedPipingInput(input) {
  if (!isRecord(input)) throw new TypeError('Common-input seal request must be an object.');
  const request = requirePreFeaPipingCheckRequest(input.request);
  const report = requirePreFeaPipingCheckReport(input.report);
  if (report.requestSemanticHash !== request.semanticHash) {
    throw codedError('Checker report is not bound to the supplied request.', 'COMMON_INPUT_REPORT_REQUEST_MISMATCH');
  }
  if (report.packageState === 'BLOCKED' || report.readyMethodIds.length === 0) {
    throw codedError('A blocked checker report cannot be sealed.', 'COMMON_INPUT_NOT_SEALABLE');
  }
  const confirmation = normalizeConfirmation(input.confirmation);
  if (report.packageState === 'PARTIALLY_READY' && confirmation.acceptPartial !== true) {
    throw codedError('A partial package requires explicit partial acceptance.', 'COMMON_INPUT_PARTIAL_ACCEPTANCE_REQUIRED');
  }
  const expectedBlocked = [...report.blockedMethodIds].sort(ascii);
  const acknowledged = [...confirmation.acknowledgedBlockedMethods].sort(ascii);
  if (JSON.stringify(expectedBlocked) !== JSON.stringify(acknowledged)) {
    throw codedError(
      'Blocked-method acknowledgement must exactly match the checker report.',
      'COMMON_INPUT_BLOCKED_METHOD_ACKNOWLEDGEMENT_MISMATCH',
    );
  }
  const lineage = createLineage(request, report);
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.COMMON_INPUT,
    packageState: report.packageState,
    requestSemanticHash: request.semanticHash,
    reportSemanticHash: report.semanticHash,
    candidateSemanticHash: report.candidate.semanticHash,
    sourceDatasetSha256: request.sourceDatasetSha256,
    sourceModelSemanticHash: request.sourceModel.semanticHash,
    enrichmentSidecarSemanticHash: request.enrichmentSidecar.semanticHash,
    resolutionLedgerSemanticHash: request.resolutionLedger.semanticHash,
    enrichedProjectionSemanticHash: request.enrichedProjection.semanticHash,
    projectDataProfileSemanticHash: semanticHash(request.projectDataProfile),
    configuredDefaultUsageLedgerSemanticHash:
      request.configuredDefaultUsageLedger?.semanticHash || null,
    qualificationProfileSemanticHash: request.qualificationProfile?.semanticHash || null,
    requestedLoadCases: request.requestedLoadCases,
    sealedMethodIds: report.readyMethodIds,
    blockedMethodIds: report.blockedMethodIds,
    enrichedModel: request.enrichedProjection.enrichedModel,
    resolutionLedger: request.resolutionLedger,
    projectDataProfile: request.projectDataProfile,
    configuredDefaultUsageLedger: request.configuredDefaultUsageLedger,
    qualificationProfile: request.qualificationProfile,
    authorityContracts: request.authorityContracts,
    methodReadiness: report.methodRows,
    lineage,
    seal: confirmation,
  };
  return requireCommonEnrichedPipingInput({ ...base, semanticHash: semanticHash(base) });
}

export function requirePreFeaPipingCheckRequest(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_COMMON_SCHEMAS.REQUEST) {
    throw new TypeError(`Expected ${NON_FEA_COMMON_SCHEMAS.REQUEST}.`);
  }
  const rebuilt = createPreFeaPipingCheckRequest({
    requestId: value.requestId,
    sourceDatasetSha256: value.sourceDatasetSha256,
    requestedMethods: value.requestedMethods,
    requestedLoadCases: value.requestedLoadCases,
    sourceModel: value.sourceModel,
    enrichmentSidecar: value.enrichmentSidecar,
    resolutionLedger: value.resolutionLedger,
    enrichedProjection: value.enrichedProjection,
    projectDataProfile: value.projectDataProfile,
    projectDataOrigin: value.projectDataOrigin,
    authorityContracts: value.authorityContracts,
    qualificationProfile: value.qualificationProfile,
    configuredDefaultUsageLedger: value.configuredDefaultUsageLedger,
  });
  if (value.semanticHash !== rebuilt.semanticHash) {
    throw codedError('Pre-FEA piping check request hash is stale.', 'PRE_FEA_REQUEST_HASH_MISMATCH');
  }
  return rebuilt;
}

export function requirePreFeaPipingCheckReport(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_COMMON_SCHEMAS.REPORT) {
    throw new TypeError(`Expected ${NON_FEA_COMMON_SCHEMAS.REPORT}.`);
  }
  const base = {
    schema: value.schema,
    requestSemanticHash: value.requestSemanticHash,
    candidateSemanticHash: value.candidateSemanticHash,
    packageState: value.packageState,
    readyMethodIds: value.readyMethodIds,
    blockedMethodIds: value.blockedMethodIds,
    methodRows: value.methodRows,
    blockers: value.blockers,
    candidate: value.candidate,
  };
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError('Pre-FEA piping check report hash is stale.', 'PRE_FEA_REPORT_HASH_MISMATCH');
  }
  if (!['READY', 'PARTIALLY_READY', 'BLOCKED'].includes(value.packageState)) {
    throw new TypeError('Checker report package state is invalid.');
  }
  return deepFreeze(value);
}

export function requireCommonEnrichedPipingInput(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_COMMON_SCHEMAS.COMMON_INPUT) {
    throw new TypeError(`Expected ${NON_FEA_COMMON_SCHEMAS.COMMON_INPUT}.`);
  }
  const base = { ...value };
  delete base.semanticHash;
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError('Common enriched piping input hash is stale.', 'COMMON_INPUT_HASH_MISMATCH');
  }
  if (!['READY', 'PARTIALLY_READY'].includes(value.packageState)) {
    throw new TypeError('A sealed common input must be READY or PARTIALLY_READY.');
  }
  requireSharedModel(value.enrichedModel);
  if (!Array.isArray(value.sealedMethodIds) || value.sealedMethodIds.length === 0) {
    throw new TypeError('A sealed common input requires at least one ready method.');
  }
  uniqueMethodIds([...value.sealedMethodIds, ...value.blockedMethodIds]);
  return deepFreeze(value);
}

export function assessCommonInputStaleness(value, currentBindings) {
  const commonInput = requireCommonEnrichedPipingInput(value);
  const bindings = normalizeCurrentBindings(currentBindings);
  const expected = {
    sourceDatasetSha256: commonInput.sourceDatasetSha256,
    sourceModelSemanticHash: commonInput.sourceModelSemanticHash,
    enrichmentSidecarSemanticHash: commonInput.enrichmentSidecarSemanticHash,
    resolutionLedgerSemanticHash: commonInput.resolutionLedgerSemanticHash,
    projectDataProfileSemanticHash: commonInput.projectDataProfileSemanticHash,
    configuredDefaultUsageLedgerSemanticHash:
      commonInput.configuredDefaultUsageLedgerSemanticHash,
    qualificationProfileSemanticHash: commonInput.qualificationProfileSemanticHash,
    authorityContractSemanticHashes: Object.fromEntries(
      AUTHORITY_CONTRACT_KEYS.map((key) => [key, commonInput.authorityContracts[key]?.semanticHash || null]),
    ),
  };
  const changes = [];
  compareBindingChanges(expected, bindings, '', changes);
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.STALENESS,
    commonInputSemanticHash: commonInput.semanticHash,
    stale: changes.length > 0,
    changes: changes.sort(issueOrder),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function createEnrichedStagedJsonExport(value) {
  const commonInput = requireCommonEnrichedPipingInput(value);
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.EXPORT,
    formatVersion: 1,
    commonInputSemanticHash: commonInput.semanticHash,
    commonInput,
  };
  const exported = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  const text = `${canonicalPrettyStringify(exported).trim()}\n`;
  const artifactBase = {
    schema: NON_FEA_COMMON_SCHEMAS.EXPORT_ARTIFACT,
    fileName: 'common-enriched-piping-input.json',
    mimeType: 'application/json',
    commonInputSemanticHash: commonInput.semanticHash,
    exportSemanticHash: exported.semanticHash,
    byteLength: utf8ByteLength(text),
    text,
  };
  return deepFreeze({ ...artifactBase, semanticHash: semanticHash(artifactBase) });
}

export function reimportEnrichedStagedJsonExport(text) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('Staged JSON text is required.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw codedError(
      `Staged JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
      'COMMON_INPUT_EXPORT_JSON_INVALID',
    );
  }
  if (!isRecord(parsed) || parsed.schema !== NON_FEA_COMMON_SCHEMAS.EXPORT) {
    throw new TypeError(`Expected ${NON_FEA_COMMON_SCHEMAS.EXPORT}.`);
  }
  const base = {
    schema: parsed.schema,
    formatVersion: parsed.formatVersion,
    commonInputSemanticHash: parsed.commonInputSemanticHash,
    commonInput: parsed.commonInput,
  };
  if (semanticHash(base) !== parsed.semanticHash) {
    throw codedError('Staged JSON export hash is stale.', 'COMMON_INPUT_EXPORT_HASH_MISMATCH');
  }
  const commonInput = requireCommonEnrichedPipingInput(parsed.commonInput);
  if (commonInput.semanticHash !== parsed.commonInputSemanticHash) {
    throw codedError('Staged JSON common-input binding is invalid.', 'COMMON_INPUT_EXPORT_BINDING_MISMATCH');
  }
  return deepFreeze({ export: deepFreeze(parsed), commonInput });
}

function createEvaluationContext(request) {
  return {
    request,
    sourceModel: request.sourceModel,
    enrichedModel: request.enrichedProjection.enrichedModel,
    projectDataProfile: request.projectDataProfile,
    authorityContracts: request.authorityContracts,
    qualificationProfile: request.qualificationProfile,
    requestedLoadCases: request.requestedLoadCases,
    modelCoverage: analyzeModelCoverage(request.enrichedProjection.enrichedModel, request.requestedLoadCases),
  };
}

function globalRequestBlockers(context) {
  const { request } = context;
  const rows = [];
  if (request.enrichmentSidecar.sourceSemanticHash !== request.sourceModel.semanticHash) {
    rows.push(issue('STALE_ENRICHMENT_SIDECAR', 'enrichmentSidecar.sourceSemanticHash', 'The enrichment sidecar is bound to a different source model.'));
  }
  if (request.resolutionLedger.sourceSemanticHash !== request.sourceModel.semanticHash) {
    rows.push(issue('STALE_RESOLUTION_LEDGER', 'resolutionLedger.sourceSemanticHash', 'The resolution ledger is bound to a different source model.'));
  }
  if (request.resolutionLedger.status !== 'READY') {
    rows.push(...(request.resolutionLedger.blockers || [issue('RESOLUTION_LEDGER_BLOCKED', 'resolutionLedger', 'The field-resolution ledger is blocked.')]).map(normalizeIssue));
  }
  if (request.enrichedProjection.sourceSemanticHash !== request.sourceModel.semanticHash) {
    rows.push(issue('STALE_ENRICHED_PROJECTION', 'enrichedProjection.sourceSemanticHash', 'The enriched projection is bound to a different source model.'));
  }
  if (request.enrichedProjection.resolutionLedgerSemanticHash !== request.resolutionLedger.semanticHash) {
    rows.push(issue('PROJECTION_LEDGER_MISMATCH', 'enrichedProjection.resolutionLedgerSemanticHash', 'The enriched projection is not bound to the supplied resolution ledger.'));
  }
  return uniqueIssues(rows);
}

function evaluateMethod(methodId, context) {
  const requirementIds = METHOD_REQUIREMENTS[methodId];
  const evaluations = requirementIds.map((requirementId) => evaluateRequirement(requirementId, methodId, context));
  const blockers = evaluations.filter((row) => row.state !== 'READY').map((row) => issue(
    row.code,
    row.requirementId,
    row.message,
  ));
  return deepFreeze({
    methodId,
    state: blockers.length ? 'BLOCKED' : 'READY',
    requirements: evaluations,
    blockers,
  });
}

function evaluateRequirement(requirementId, methodId, context) {
  const ready = (message, details = null) => requirementResult(requirementId, 'READY', `${requirementId}_READY`, message, details);
  const blocked = (code, message, details = null) => requirementResult(requirementId, 'BLOCKED', code, message, details);
  const project = (path) => projectEntryState(context.projectDataProfile, path);
  switch (requirementId) {
    case 'SOURCE_MODEL':
      return ready(`${context.sourceModel.components.length} components and ${context.sourceModel.supports.length} supports are immutable and schema-valid.`);
    case 'SOURCE_CUSTODY':
      return ready(`Source SHA-256 ${context.request.sourceDatasetSha256} is bound to the request.`);
    case 'ENRICHMENT_CURRENT':
      return globalRequestBlockers(context).length
        ? blocked('ENRICHMENT_NOT_CURRENT', 'The sidecar, resolution ledger or enriched projection is stale or blocked.', globalRequestBlockers(context))
        : ready(`${context.request.resolutionLedger.rows.length} exact entity-field resolutions are current.`);
    case 'TOPOLOGY_GRAPH':
      return contractRequirement(context.authorityContracts.topologyGraph, requirementId, 'Governed topology graph');
    case 'SUPPORT_ATTACHMENTS':
      return contractRequirement(context.authorityContracts.supportAttachmentModel, requirementId, 'Exact support attachment model');
    case 'RESTRAINT_CAPABILITY':
      return contractRequirement(context.authorityContracts.restraintCapabilityModel, requirementId, 'Restraint capability model');
    case 'SUPPORT_SITES':
      return contractRequirement(context.authorityContracts.supportSiteModel, requirementId, 'Support-site model');
    case 'ROUTE_PARTITIONS':
      return contractRequirement(context.authorityContracts.routePartitionModel, requirementId, 'Route-partition model');
    case 'LOAD_PRIMITIVES':
      return contractRequirement(context.authorityContracts.loadPrimitiveSet, requirementId, 'Load primitive set');
    case 'GRAVITY': {
      const row = project(PROJECT_PATHS.GRAVITY);
      return row.ready && Number.isFinite(row.value) && row.value > 0
        ? ready(`Approved gravity is ${row.value} m/s².`, row)
        : blocked('GRAVITY_BASIS_REQUIRED', 'Approved positive gravity Project Data is required.', row);
    }
    case 'ACTIVE_LOAD_CASES': {
      const row = project(PROJECT_PATHS.ACTIVE_CASES);
      const values = Array.isArray(row.value) ? row.value : [];
      const missing = context.requestedLoadCases.filter((loadCaseId) => !values.includes(loadCaseId));
      return row.ready && missing.length === 0
        ? ready(`Requested load cases are approved: ${context.requestedLoadCases.join(', ')}.`, row)
        : blocked('ACTIVE_LOAD_CASES_REQUIRED', `Approved active load cases are missing: ${missing.join(', ') || 'ALL'}.`, row);
    }
    case 'MASS_COVERAGE':
      return coverageRequirement(context.modelCoverage.mass, requirementId, 'MASS_COVERAGE_INCOMPLETE', 'Mass/content evidence');
    case 'FLEXURAL_COVERAGE':
      return coverageRequirement(context.modelCoverage.flexural, requirementId, 'FLEXURAL_COVERAGE_INCOMPLETE', 'Flexural evidence');
    case 'SECTION_COVERAGE': {
      const corrosion = project(PROJECT_PATHS.CORROSION_ALLOWANCES);
      if (!context.modelCoverage.section.ready) return coverageRequirement(context.modelCoverage.section, requirementId, 'SECTION_COVERAGE_INCOMPLETE', 'Pipe section evidence');
      return corrosion.ready
        ? ready('Pipe section evidence and approved corrosion allowances are available.', { coverage: context.modelCoverage.section, corrosion })
        : blocked('CORROSION_ALLOWANCE_REQUIRED', 'Approved corrosion-allowance policy is required.', corrosion);
    }
    case 'THERMAL_BASIS': {
      const rows = [project(PROJECT_PATHS.INSTALLATION_TEMPERATURE), project(PROJECT_PATHS.OPERATING_TEMPERATURES), project(PROJECT_PATHS.MATERIAL_ELASTIC)];
      return rows.every((row) => row.ready)
        ? ready('Approved installation temperature, operating temperatures and elastic/thermal material policy are available.', rows)
        : blocked('THERMAL_BASIS_REQUIRED', 'Approved installation temperature, operating temperatures and material elastic/thermal properties are required.', rows);
    }
    case 'PRESSURE_BASIS': {
      const rows = [project(PROJECT_PATHS.CASE_PRESSURES), project(PROJECT_PATHS.PRESSURE_BOUNDARY)];
      return rows.every((row) => row.ready)
        ? ready('Approved case pressures and pressure-boundary semantics are available.', rows)
        : blocked('PRESSURE_BASIS_REQUIRED', 'Approved case pressures and pressure-boundary semantics are required.', rows);
    }
    case 'STRESS_BASIS': {
      const row = project(PROJECT_PATHS.STRESS_CODE);
      return row.ready
        ? ready('Approved sustained stress-code basis is available.', row)
        : blocked('STRESS_CODE_BASIS_REQUIRED', 'Approved sustained stress-code basis is required.', row);
    }
    case 'RESTRAINT_STIFFNESS':
      return approvedProjectRequirement(project(PROJECT_PATHS.RESTRAINT_STIFFNESS), requirementId, 'RESTRAINT_STIFFNESS_REQUIRED', 'Approved restraint stiffness policy is required.');
    case 'RESTRAINT_GAPS':
      return approvedProjectRequirement(project(PROJECT_PATHS.RESTRAINT_GAPS), requirementId, 'RESTRAINT_GAP_REQUIRED', 'Approved restraint gap policy is required.');
    case 'CONTACT_POLICY':
      return approvedProjectRequirement(project(PROJECT_PATHS.CONTACT), requirementId, 'CONTACT_POLICY_REQUIRED', 'Approved unilateral contact policy is required.');
    case 'FRICTION_POLICY':
      return approvedProjectRequirement(project(PROJECT_PATHS.FRICTION), requirementId, 'FRICTION_POLICY_REQUIRED', 'Approved friction policy is required.');
    case 'NONLINEAR_POLICY':
      return approvedProjectRequirement(project(PROJECT_PATHS.NONLINEAR), requirementId, 'NONLINEAR_POLICY_REQUIRED', 'Approved nonlinear applicability policy is required.');
    case 'SUPERPOSITION_POLICY':
      return approvedProjectRequirement(project(PROJECT_PATHS.SUPERPOSITION), requirementId, 'SUPERPOSITION_POLICY_REQUIRED', 'Approved superposition policy is required.');
    case 'QUALIFICATION': {
      const profile = context.qualificationProfile;
      const bound = profile?.methods?.includes(methodId);
      return profile && profile.qualification === 'QUALIFIED' && profile.locked === true && bound
        ? ready(`Qualification profile ${profile.profileId} v${profile.version} is locked and bound to ${methodId}.`, profile)
        : blocked('QUALIFICATION_PROFILE_REQUIRED', `A locked QUALIFIED profile bound to ${methodId} is required.`, profile);
    }
    case 'CONFIGURED_DEFAULT_USAGE': {
      const ledger = context.request.configuredDefaultUsageLedger;
      if (!ledger) return ready('No configured-default usage is recorded.');
      if (ledger.projectDataRevision !== context.request.projectDataProfile.revision) {
        return blocked('CONFIGURED_DEFAULT_LEDGER_STALE', 'Configured-default usage is bound to a different Project Data revision.', ledger);
      }
      const invalid = (ledger.rows || []).filter((row) => row.methodId === methodId && (!row.defaultId || !row.fieldId || !row.targetId || !row.reason));
      return invalid.length
        ? blocked('CONFIGURED_DEFAULT_USAGE_INVALID', 'Configured-default uses require exact field, method, target and reason evidence.', invalid)
        : ready(`${(ledger.rows || []).filter((row) => row.methodId === methodId).length} configured-default uses are auditable.`, ledger);
    }
    case 'EXPORT_CONTRACT':
      return ready('Canonical JSON, semantic hash and UTF-8 byte-length contracts are available.');
    default:
      return blocked('UNKNOWN_METHOD_REQUIREMENT', `Unknown requirement ${requirementId}.`);
  }
}

function createCandidate(request, methodRows, packageState) {
  const lineage = createLineage(request, null);
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.CANDIDATE,
    requestSemanticHash: request.semanticHash,
    packageState,
    sourceDatasetSha256: request.sourceDatasetSha256,
    sourceModelSemanticHash: request.sourceModel.semanticHash,
    enrichmentSidecarSemanticHash: request.enrichmentSidecar.semanticHash,
    resolutionLedgerSemanticHash: request.resolutionLedger.semanticHash,
    enrichedProjectionSemanticHash: request.enrichedProjection.semanticHash,
    projectDataProfileSemanticHash: semanticHash(request.projectDataProfile),
    configuredDefaultUsageLedgerSemanticHash: request.configuredDefaultUsageLedger?.semanticHash || null,
    qualificationProfileSemanticHash: request.qualificationProfile?.semanticHash || null,
    authorityContracts: request.authorityContracts,
    methodReadiness: methodRows,
    lineage,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function createLineage(request, report) {
  const nodes = [
    lineageNode('SOURCE_DATASET', request.sourceDatasetSha256, 'SHA256'),
    lineageNode('SOURCE_MODEL', request.sourceModel.semanticHash),
    lineageNode('ENRICHMENT_SIDECAR', request.enrichmentSidecar.semanticHash),
    lineageNode('RESOLUTION_LEDGER', request.resolutionLedger.semanticHash),
    lineageNode('ENRICHED_PROJECTION', request.enrichedProjection.semanticHash),
    lineageNode('PROJECT_DATA', semanticHash(request.projectDataProfile)),
    ...(request.configuredDefaultUsageLedger ? [lineageNode('CONFIGURED_DEFAULT_USAGE', request.configuredDefaultUsageLedger.semanticHash)] : []),
    ...(request.qualificationProfile ? [lineageNode('QUALIFICATION_PROFILE', request.qualificationProfile.semanticHash)] : []),
    ...AUTHORITY_CONTRACT_KEYS.flatMap((key) => request.authorityContracts[key]
      ? [lineageNode(`AUTHORITY:${key}`, request.authorityContracts[key].semanticHash)]
      : []),
    lineageNode('CHECK_REQUEST', request.semanticHash),
    ...(report ? [lineageNode('CHECK_REPORT', report.semanticHash)] : []),
  ];
  const base = {
    schema: NON_FEA_COMMON_SCHEMAS.LINEAGE,
    nodes: nodes.sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    edges: nodes.filter((row) => row.nodeId !== 'CHECK_REQUEST' && row.nodeId !== 'CHECK_REPORT').map((row) => ({
      from: row.nodeId,
      to: 'CHECK_REQUEST',
      relation: 'BINDS',
    })).concat(report ? [{ from: 'CHECK_REQUEST', to: 'CHECK_REPORT', relation: 'EVALUATED_BY' }] : []),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function analyzeModelCoverage(model, requestedLoadCases) {
  const components = model.components || [];
  const massMissing = [];
  const flexuralMissing = [];
  const sectionMissing = [];
  components.forEach((component) => {
    const properties = component.engineeringProperties || {};
    const type = String(component.type || '').toUpperCase();
    const id = component.componentKey || component.sourceEntityId || 'UNKNOWN_COMPONENT';
    if (type === 'PIPE') {
      const directPipeMass = finiteEvidence(properties.unitPipeWeightKgPerM, true);
      const densitySectionMass = finiteEvidence(properties.materialDensityKgM3, false)
        && finiteEvidence(properties.outerDiameterMm, false)
        && finiteEvidence(properties.wallThicknessMm, false);
      if (!directPipeMass && !densitySectionMass) massMissing.push(`${id}:PIPE_MASS`);
      if (requestedLoadCases.includes('OPE') && !finiteEvidence(properties.fluidWeightOpeKgPerM, true) && !finiteEvidence(properties.fluidDensityOpeKgM3, true)) {
        massMissing.push(`${id}:OPERATING_FLUID`);
      }
      if (requestedLoadCases.includes('HYD') && !finiteEvidence(properties.fluidWeightHydKgPerM, true) && !finiteEvidence(properties.fluidDensityHydKgM3, true)) {
        massMissing.push(`${id}:HYDRO_FLUID`);
      }
      const insulationThickness = evidenceNumber(properties.insulationThicknessMm);
      if (Number.isFinite(insulationThickness) && insulationThickness > 0
        && !finiteEvidence(properties.insulationWeightKgPerM, true)
        && !finiteEvidence(properties.insulationDensityKgM3, true)) {
        massMissing.push(`${id}:INSULATION`);
      }
      const directEi = finiteEvidence(properties.flexuralRigidityNm2, false);
      const derivedEi = finiteEvidence(properties.elasticModulusMpa, false)
        && finiteEvidence(properties.secondMomentAreaMm4, false);
      if (!directEi && !derivedEi) flexuralMissing.push(id);
      if (!finiteEvidence(properties.outerDiameterMm, false) || !finiteEvidence(properties.wallThicknessMm, false)) sectionMissing.push(id);
    } else if (!finiteEvidence(properties.componentWeightKg, true)) {
      massMissing.push(`${id}:COMPONENT_WEIGHT`);
    }
  });
  return deepFreeze({
    mass: coverageResult(components.length, massMissing),
    flexural: coverageResult(components.filter((row) => String(row.type || '').toUpperCase() === 'PIPE').length, flexuralMissing),
    section: coverageResult(components.filter((row) => String(row.type || '').toUpperCase() === 'PIPE').length, sectionMissing),
  });
}

function normalizeAuthorityContracts(input) {
  if (!isRecord(input)) throw new TypeError('authorityContracts must be an object.');
  return deepFreeze(Object.fromEntries(AUTHORITY_CONTRACT_KEYS.map((key) => [
    key,
    input[key] === null || input[key] === undefined ? null : contractRef(input[key], key),
  ])));
}

function contractRef(value, label) {
  const object = requireObject(value, `authorityContracts.${label}`);
  const semanticHashValue = requiredSemanticHash(object.semanticHash, `authorityContracts.${label}.semanticHash`);
  return deepFreeze({
    schema: typeof object.schema === 'string' && object.schema ? object.schema : 'unknown-contract/v1',
    semanticHash: semanticHashValue,
    status: typeof object.status === 'string' && object.status ? object.status : 'AVAILABLE',
  });
}

function contractRequirement(contract, requirementId, label) {
  if (!contract) return requirementResult(requirementId, 'BLOCKED', `${requirementId}_REQUIRED`, `${label} is required.`, null);
  if (['BLOCKED', 'STALE', 'NOT_AVAILABLE', 'NOT_BUILT'].includes(contract.status)) {
    return requirementResult(requirementId, 'BLOCKED', `${requirementId}_NOT_READY`, `${label} status is ${contract.status}.`, contract);
  }
  return requirementResult(requirementId, 'READY', `${requirementId}_READY`, `${label} is bound at ${contract.semanticHash}.`, contract);
}

function coverageRequirement(coverage, requirementId, code, label) {
  return coverage.ready
    ? requirementResult(requirementId, 'READY', `${requirementId}_READY`, `${label} covers ${coverage.total} governed entities.`, coverage)
    : requirementResult(requirementId, 'BLOCKED', code, `${label} is missing for: ${coverage.missing.join(', ')}.`, coverage);
}

function approvedProjectRequirement(row, requirementId, code, message) {
  return row.ready
    ? requirementResult(requirementId, 'READY', `${requirementId}_READY`, message.replace(' is required.', ' is approved.'), row)
    : requirementResult(requirementId, 'BLOCKED', code, message, row);
}

function projectEntryState(profile, path) {
  const entry = String(path).split('.').reduce((current, key) => current?.[key], profile);
  const ready = isRecord(entry)
    && Object.hasOwn(entry, 'value')
    && entry.value !== null
    && entry.approved === true
    && isRecord(entry.evidence)
    && typeof entry.evidence.source === 'string'
    && entry.evidence.source.trim().length > 0;
  return deepFreeze({
    path,
    ready,
    value: isRecord(entry) && Object.hasOwn(entry, 'value') ? entry.value : null,
    approved: entry?.approved === true,
    evidence: entry?.evidence || null,
  });
}

function normalizeQualificationProfile(value) {
  const profile = requireObject(value, 'qualificationProfile');
  const base = {
    profileId: requiredText(profile.profileId, 'qualificationProfile.profileId'),
    version: positiveInteger(profile.version, 'qualificationProfile.version'),
    methods: uniqueMethodIds(profile.methods),
    qualification: profile.qualification,
    locked: profile.locked === true,
    basis: profile.basis === undefined ? null : structuredClone(profile.basis),
  };
  if (!['QUALIFIED', 'UNQUALIFIED'].includes(base.qualification)) {
    throw new TypeError('qualificationProfile.qualification must be QUALIFIED or UNQUALIFIED.');
  }
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function normalizeConfirmation(value) {
  const input = requireObject(value, 'confirmation');
  const base = {
    confirmationId: requiredText(input.confirmationId, 'confirmation.confirmationId'),
    confirmedAt: canonicalTimestamp(input.confirmedAt, 'confirmation.confirmedAt'),
    confirmedBy: requiredText(input.confirmedBy, 'confirmation.confirmedBy'),
    acceptPartial: input.acceptPartial === true,
    acknowledgedBlockedMethods: uniqueMethodIds(input.acknowledgedBlockedMethods || []),
    statement: requiredText(input.statement, 'confirmation.statement'),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function normalizeCurrentBindings(value) {
  const input = requireObject(value, 'currentBindings');
  const authorityHashes = requireObject(input.authorityContractSemanticHashes || {}, 'currentBindings.authorityContractSemanticHashes');
  return deepFreeze({
    sourceDatasetSha256: requireSha256(input.sourceDatasetSha256, 'currentBindings.sourceDatasetSha256'),
    sourceModelSemanticHash: requiredSemanticHash(input.sourceModelSemanticHash, 'currentBindings.sourceModelSemanticHash'),
    enrichmentSidecarSemanticHash: requiredSemanticHash(input.enrichmentSidecarSemanticHash, 'currentBindings.enrichmentSidecarSemanticHash'),
    resolutionLedgerSemanticHash: requiredSemanticHash(input.resolutionLedgerSemanticHash, 'currentBindings.resolutionLedgerSemanticHash'),
    projectDataProfileSemanticHash: requiredSemanticHash(input.projectDataProfileSemanticHash, 'currentBindings.projectDataProfileSemanticHash'),
    configuredDefaultUsageLedgerSemanticHash: nullableSemanticHash(input.configuredDefaultUsageLedgerSemanticHash, 'currentBindings.configuredDefaultUsageLedgerSemanticHash'),
    qualificationProfileSemanticHash: nullableSemanticHash(input.qualificationProfileSemanticHash, 'currentBindings.qualificationProfileSemanticHash'),
    authorityContractSemanticHashes: Object.fromEntries(AUTHORITY_CONTRACT_KEYS.map((key) => [
      key,
      nullableSemanticHash(authorityHashes[key], `currentBindings.authorityContractSemanticHashes.${key}`),
    ])),
  });
}

function compareBindingChanges(expected, actual, path, rows) {
  Object.keys(expected).forEach((key) => {
    const currentPath = path ? `${path}.${key}` : key;
    if (isRecord(expected[key]) && isRecord(actual[key])) compareBindingChanges(expected[key], actual[key], currentPath, rows);
    else if (expected[key] !== actual[key]) rows.push(issue('COMMON_INPUT_BINDING_CHANGED', currentPath, `Expected ${expected[key] ?? 'null'}; received ${actual[key] ?? 'null'}.`));
  });
}

function requirement(id, label) {
  return deepFreeze({ requirementId: id, label });
}

function requirementResult(requirementId, state, code, message, details) {
  return deepFreeze({ requirementId, state, code, message, details: details === undefined ? null : details });
}

function lineageNode(nodeId, identity, algorithm = 'FNV1A64') {
  return deepFreeze({ nodeId, identity, algorithm });
}

function coverageResult(total, missing) {
  const normalized = [...new Set(missing)].sort(ascii);
  return deepFreeze({ total, covered: Math.max(0, total - normalized.length), missing: normalized, ready: normalized.length === 0 });
}

function finiteEvidence(value, allowZero) {
  const number = evidenceNumber(value);
  return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
}

function evidenceNumber(value) {
  if (Number.isFinite(value)) return value;
  if (isRecord(value) && Number.isFinite(value.value)) return value.value;
  return null;
}

function requireSharedModel(value) {
  const audit = validateSharedPipingModel(value);
  if (!audit.ok) throw new TypeError(`Invalid shared piping model: ${audit.errors.join(' ')}`);
  return value;
}

function requireSchemaObject(value, schema, label) {
  const object = requireObject(value, label);
  if (object.schema !== schema) throw new TypeError(`${label} must use ${schema}.`);
  requiredSemanticHash(object.semanticHash, `${label}.semanticHash`);
  return object;
}

function requireObject(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function uniqueMethodIds(values) {
  if (!Array.isArray(values)) throw new TypeError('Method IDs must be an array.');
  const normalized = [...new Set(values.map((value) => requiredText(value, 'methodId')))].sort(ascii);
  normalized.forEach((methodId) => {
    if (!NON_FEA_COMMON_METHOD_IDS.includes(methodId)) throw new TypeError(`Unknown Non-FEA method: ${methodId}.`);
  });
  return deepFreeze(normalized);
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return deepFreeze([...new Set(values.map((value) => requiredText(value, label)))].sort(ascii));
}

function requireSha256(value, label) {
  const text = requiredText(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(text)) throw new TypeError(`${label} must be a SHA-256 hex digest.`);
  return text;
}

function requiredSemanticHash(value, label) {
  const text = requiredText(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(text)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  return text;
}

function nullableSemanticHash(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return requiredSemanticHash(value, label);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value) throw new TypeError(`${label} must be a non-empty trimmed string.`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}

function canonicalTimestamp(value, label) {
  const text = requiredText(value, label);
  if (new Date(text).toISOString() !== text) throw new TypeError(`${label} must be a canonical ISO-8601 timestamp.`);
  return text;
}

function issue(code, path, message) {
  return deepFreeze({ code, path, message });
}

function normalizeIssue(row) {
  return issue(row.code || 'BLOCKED', row.path || row.scope || 'unknown', row.message || 'Required evidence is blocked.');
}

function uniqueIssues(rows) {
  const byKey = new Map();
  rows.forEach((row) => {
    const normalized = isRecord(row) && row.methodId
      ? deepFreeze({ methodId: row.methodId, code: row.code, path: row.path, message: row.message })
      : normalizeIssue(row);
    const key = JSON.stringify(normalized);
    if (!byKey.has(key)) byKey.set(key, normalized);
  });
  return deepFreeze([...byKey.values()].sort(issueOrder));
}

function issueOrder(left, right) {
  return `${left.methodId || ''}|${left.code}|${left.path}|${left.message}`
    .localeCompare(`${right.methodId || ''}|${right.code}|${right.path}|${right.message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
