import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  requireSjsonEmpiricalPipingRequest,
} from './adapters/sjson-to-empirical-piping-request.js';
import {
  calculateAuthorizedEmpiricalBeamContactExecution,
} from './authorized-empirical-beam-contact-execution.js';
import {
  createEmpiricalBeamContactRuntimeProfile,
  requireEmpiricalBeamContactRuntimeProfile,
} from './empirical-beam-contact-runtime-profile.js';
import {
  getEmpiricalMethodRegistration,
  requireRegisteredEmpiricalMethod,
} from './empirical-method-registry.js';

export const EMPIRICAL_LOAD_CALC_SCENARIO_SNAPSHOT_SCHEMA =
  'empirical-load-calc-scenario-snapshot/v1';
export const EMPIRICAL_LOAD_CALC_AUTHORIZATION_SCHEMA =
  'empirical-load-calc-authorization/v1';
export const EMPIRICAL_LOAD_CALC_SCENARIO_STATES = Object.freeze([
  'NOT_CONFIGURED',
  'DRAFT_BLOCKED',
  'DRAFT_READY',
  'AUTHORIZED_CURRENT',
  'AUTHORIZED_STALE',
  'EXECUTED_CURRENT',
  'EXECUTED_STALE',
]);

const PROPOSAL_KEYS = Object.freeze([
  'adaptedRequest',
  'runtimeProfile',
  'caseConfigurations',
  'sharedModel',
  'topologyGraph',
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'sourceLoadPrimitiveSet',
]);
const EXECUTION_KEYS = Object.freeze(['executionId', 'executedAt']);
const AUTHORIZATION_KEYS = Object.freeze(['authorizationId', 'authorizedAt']);

export class EmpiricalLoadCalcScenarioStore {
  #proposal = null;
  #authorization = null;
  #execution = null;
  #state = 'NOT_CONFIGURED';
  #reasonCode = 'EMPIRICAL_SCENARIO_REQUIRED';
  #details = [];
  #journal = [];
  #version = 0;
  #listeners = new Set();
  #executor;

  constructor(executor = calculateAuthorizedEmpiricalBeamContactExecution) {
    if (typeof executor !== 'function') {
      throw new TypeError('Empirical Load Calc scenario store requires an execution function.');
    }
    this.#executor = executor;
  }

  configure(value) {
    exactKeys(value, PROPOSAL_KEYS, 'empirical Load Calc scenario proposal');
    const request = requireSjsonEmpiricalPipingRequest(value.adaptedRequest);
    const runtimeProfile = requireEmpiricalBeamContactRuntimeProfile(value.runtimeProfile);
    const methodRegistration = getEmpiricalMethodRegistration(request.method);
    const blockers = proposalBlockers(request, runtimeProfile, methodRegistration);
    const authorities = deepFreeze({
      sharedModel: requireAuthority(value.sharedModel, 'sharedModel'),
      topologyGraph: requireAuthority(value.topologyGraph, 'topologyGraph'),
      supportAttachmentModel: requireAuthority(
        value.supportAttachmentModel,
        'supportAttachmentModel',
      ),
      restraintCapabilityModel: requireAuthority(
        value.restraintCapabilityModel,
        'restraintCapabilityModel',
      ),
      sourceLoadPrimitiveSet: requireAuthority(
        value.sourceLoadPrimitiveSet,
        'sourceLoadPrimitiveSet',
      ),
    });
    const caseConfigurations = requireCaseConfigurations(
      value.caseConfigurations,
      request.loadCases,
    );
    const bindings = proposalBindings(request, runtimeProfile, authorities);
    const proposalBase = {
      schema: 'empirical-load-calc-scenario-proposal/v1',
      method: request.method,
      scenarioId: request.scenarioId,
      adaptedRequest: request,
      runtimeProfile,
      caseConfigurations,
      authorities,
      bindings,
      blockers,
      overrideJournal: buildOverrideJournal(request),
    };
    this.#proposal = deepFreeze({
      ...proposalBase,
      semanticHash: semanticHash(proposalBase),
    });
    this.#authorization = null;
    this.#execution = null;
    this.#state = blockers.length ? 'DRAFT_BLOCKED' : 'DRAFT_READY';
    this.#reasonCode = blockers.length ? 'EMPIRICAL_SCENARIO_BLOCKED' : null;
    this.#details = blockers;
    this.#journal = deepFreeze([
      ...this.#journal,
      journalEntry('CONFIGURED', this.#proposal.semanticHash, {
        method: request.method,
        scenarioId: request.scenarioId,
        blockerCount: blockers.length,
      }),
      ...this.#proposal.overrideJournal.map((row) => journalEntry(
        'RESTRAINT_OVERRIDE_RETAINED',
        row.overrideId,
        row,
      )),
    ]);
    this.#emit();
    return this.getSnapshot();
  }

  authorize(value) {
    exactKeys(value, AUTHORIZATION_KEYS, 'empirical Load Calc authorization request');
    this.#requireProposal();
    if (this.#state !== 'DRAFT_READY') {
      throw codedError(
        'Only a ready empirical scenario proposal can be authorized.',
        'EMPIRICAL_SCENARIO_NOT_READY',
      );
    }
    requireRegisteredEmpiricalMethod(this.#proposal.method);
    const base = {
      schema: EMPIRICAL_LOAD_CALC_AUTHORIZATION_SCHEMA,
      authorizationId: requiredString(value.authorizationId, 'authorizationId'),
      authorizedAt: timestamp(value.authorizedAt, 'authorizedAt'),
      method: this.#proposal.method,
      scenarioId: this.#proposal.scenarioId,
      proposalSemanticHash: this.#proposal.semanticHash,
      adaptedRequestSemanticHash: this.#proposal.adaptedRequest.semanticHash,
      runtimeProfileSemanticHash: this.#proposal.runtimeProfile.semanticHash,
      bindings: this.#proposal.bindings,
      policy: {
        explicitAuthorization: true,
        autoExecution: false,
        geometryMutationPermitted: false,
        combinedOperatingReactionPermitted: false,
      },
    };
    this.#authorization = deepFreeze({ ...base, semanticHash: semanticHash(base) });
    this.#execution = null;
    this.#state = 'AUTHORIZED_CURRENT';
    this.#reasonCode = null;
    this.#details = [];
    this.#journal = appendJournal(this.#journal, journalEntry(
      'AUTHORIZED',
      this.#authorization.authorizationId,
      {
        method: this.#authorization.method,
        authorizationSemanticHash: this.#authorization.semanticHash,
      },
    ));
    this.#emit();
    return this.getSnapshot();
  }

  execute(value) {
    exactKeys(value, EXECUTION_KEYS, 'empirical Load Calc execution request');
    this.#requireProposal();
    if (!['AUTHORIZED_CURRENT', 'EXECUTED_CURRENT'].includes(this.#state)) {
      throw codedError(
        'Empirical calculation requires a current explicit authorization.',
        'EMPIRICAL_SCENARIO_AUTHORIZATION_REQUIRED',
      );
    }
    this.refresh(this.#proposal.bindings);
    if (!['AUTHORIZED_CURRENT', 'EXECUTED_CURRENT'].includes(this.#state)) {
      throw codedError(
        'Empirical calculation authorization is stale.',
        'EMPIRICAL_SCENARIO_AUTHORIZATION_STALE',
      );
    }
    const execution = this.#executor({
      schema: 'authorized-empirical-beam-contact-execution-request/v1',
      executionId: requiredString(value.executionId, 'executionId'),
      executedAt: timestamp(value.executedAt, 'executedAt'),
      adaptedRequest: this.#proposal.adaptedRequest,
      sharedModel: this.#proposal.authorities.sharedModel,
      topologyGraph: this.#proposal.authorities.topologyGraph,
      supportAttachmentModel: this.#proposal.authorities.supportAttachmentModel,
      restraintCapabilityModel: this.#proposal.authorities.restraintCapabilityModel,
      sourceLoadPrimitiveSet: this.#proposal.authorities.sourceLoadPrimitiveSet,
      runtimeProfile: this.#proposal.runtimeProfile,
      caseConfigurations: this.#proposal.caseConfigurations,
    });
    this.#execution = execution;
    this.#state = execution.coreResult.status === 'CALCULATED'
      ? 'EXECUTED_CURRENT'
      : 'AUTHORIZED_CURRENT';
    this.#reasonCode = execution.coreResult.status === 'CALCULATED'
      ? null
      : 'EMPIRICAL_EXECUTION_BLOCKED';
    this.#details = execution.coreResult.status === 'CALCULATED'
      ? []
      : execution.coreResult.loadCases.flatMap((row) => row.blockers || []);
    this.#journal = appendJournal(this.#journal, journalEntry(
      'EXECUTED',
      execution.executionId,
      {
        status: execution.coreResult.status,
        executionSemanticHash: execution.semanticHash,
      },
    ));
    this.#emit();
    return execution;
  }

  refresh(currentBindings) {
    if (!this.#proposal) return this.getSnapshot();
    const normalized = requireBindings(currentBindings);
    const changes = bindingChanges(this.#proposal.bindings, normalized);
    if (changes.length === 0) return this.getSnapshot();
    this.#state = this.#execution ? 'EXECUTED_STALE' : 'AUTHORIZED_STALE';
    this.#reasonCode = 'EMPIRICAL_SCENARIO_BINDINGS_CHANGED';
    this.#details = changes;
    this.#journal = appendJournal(this.#journal, journalEntry(
      'MARKED_STALE',
      semanticHash(normalized),
      { changes },
    ));
    this.#emit();
    return this.getSnapshot();
  }

  cloneProfile(value = {}) {
    this.#requireProposal();
    const profile = this.#proposal.runtimeProfile;
    const clone = createEmpiricalBeamContactRuntimeProfile({
      profileId: requiredString(
        value.profileId || `${profile.profileId}-CLONE`,
        'profileId',
      ),
      profileVersion: Number.isInteger(value.profileVersion)
        ? value.profileVersion
        : profile.profileVersion + 1,
      qualification: 'UNQUALIFIED',
      locked: false,
      lineProperties: structuredClone(profile.lineProperties),
      elbow: structuredClone(profile.elbow),
      tolerances: structuredClone(profile.tolerances),
      numericalOptions: structuredClone(profile.numericalOptions),
    });
    this.#journal = appendJournal(this.#journal, journalEntry(
      'PROFILE_CLONED',
      clone.semanticHash,
      {
        sourceProfileSemanticHash: profile.semanticHash,
        profileId: clone.profileId,
        profileVersion: clone.profileVersion,
        qualification: clone.qualification,
        locked: clone.locked,
      },
    ));
    this.#emit();
    return clone;
  }

  clear(reasonCode = 'EMPIRICAL_SCENARIO_REQUIRED') {
    this.#proposal = null;
    this.#authorization = null;
    this.#execution = null;
    this.#state = 'NOT_CONFIGURED';
    this.#reasonCode = reasonCode;
    this.#details = [];
    this.#journal = [];
    this.#emit();
    return this.getSnapshot();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Scenario listener must be a function.');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSnapshot() {
    const proposal = this.#proposal;
    const snapshotBase = {
      schema: EMPIRICAL_LOAD_CALC_SCENARIO_SNAPSHOT_SCHEMA,
      version: this.#version,
      state: this.#state,
      reasonCode: this.#reasonCode,
      calculationEligible: ['AUTHORIZED_CURRENT', 'EXECUTED_CURRENT'].includes(this.#state),
      method: proposal?.method || null,
      scenarioId: proposal?.scenarioId || null,
      proposalSemanticHash: proposal?.semanticHash || null,
      authorizationSemanticHash: this.#authorization?.semanticHash || null,
      executionSemanticHash: this.#execution?.semanticHash || null,
      profile: proposal ? {
        profileId: proposal.runtimeProfile.profileId,
        profileVersion: proposal.runtimeProfile.profileVersion,
        qualification: proposal.runtimeProfile.qualification,
        locked: proposal.runtimeProfile.locked,
        semanticHash: proposal.runtimeProfile.semanticHash,
      } : null,
      sourceBindings: proposal?.bindings || null,
      blockerCount: this.#details.length,
      details: this.#details,
      overrideCount: proposal?.overrideJournal.length || 0,
      journal: this.#journal,
    };
    return deepFreeze({ ...snapshotBase, semanticHash: semanticHash(snapshotBase) });
  }

  getProposal() { return this.#proposal; }
  getAuthorization() { return this.#authorization; }
  getExecution() { return this.#execution; }

  #requireProposal() {
    if (!this.#proposal) {
      throw codedError(
        'An empirical Load Calc scenario proposal is required.',
        'EMPIRICAL_SCENARIO_REQUIRED',
      );
    }
  }

  #emit() {
    this.#version += 1;
    const snapshot = this.getSnapshot();
    this.#listeners.forEach((listener) => listener(snapshot));
  }
}

function proposalBlockers(request, profile, registration) {
  const rows = [...(request.blockers || [])];
  if (!registration || registration.runtimeStatus !== 'REGISTERED') {
    rows.push(blocker(
      'EMPIRICAL_METHOD_NOT_REGISTERED',
      request.method,
      'The selected empirical method is not registered.',
    ));
  }
  if (request.status !== 'READY_FOR_RUNTIME_BRIDGE') {
    rows.push(blocker(
      'EMPIRICAL_REQUEST_NOT_READY',
      request.scenarioId,
      'The adapted empirical request is not ready for execution.',
    ));
  }
  if (profile.qualification !== 'QUALIFIED' || profile.locked !== true) {
    rows.push(blocker(
      'EMPIRICAL_PROFILE_UNQUALIFIED',
      profile.profileId,
      'Execution requires a qualified locked profile.',
    ));
  }
  if (request.profileRef.semanticHash !== profile.semanticHash) {
    rows.push(blocker(
      'EMPIRICAL_PROFILE_BINDING_MISMATCH',
      profile.profileId,
      'The scenario profile binding differs from the supplied runtime profile.',
    ));
  }
  return deepFreeze(uniqueRows(rows));
}

function proposalBindings(request, profile, authorities) {
  return deepFreeze({
    datasetId: request.datasetId,
    adaptedRequestSemanticHash: request.semanticHash,
    runtimeProfileSemanticHash: profile.semanticHash,
    sharedModelSemanticHash: authorityHash(authorities.sharedModel, 'sharedModel'),
    topologySemanticHash: authorityHash(authorities.topologyGraph, 'topologyGraph'),
    attachmentSemanticHash: authorityHash(
      authorities.supportAttachmentModel,
      'supportAttachmentModel',
    ),
    restraintSemanticHash: authorityHash(
      authorities.restraintCapabilityModel,
      'restraintCapabilityModel',
    ),
    loadPrimitiveSetSemanticHash: authorityHash(
      authorities.sourceLoadPrimitiveSet,
      'sourceLoadPrimitiveSet',
    ),
  });
}

function requireBindings(value) {
  exactKeys(value, [
    'datasetId',
    'adaptedRequestSemanticHash',
    'runtimeProfileSemanticHash',
    'sharedModelSemanticHash',
    'topologySemanticHash',
    'attachmentSemanticHash',
    'restraintSemanticHash',
    'loadPrimitiveSetSemanticHash',
  ], 'empirical scenario bindings');
  return deepFreeze({
    datasetId: requiredString(value.datasetId, 'bindings.datasetId'),
    adaptedRequestSemanticHash: requiredHash(
      value.adaptedRequestSemanticHash,
      'bindings.adaptedRequestSemanticHash',
    ),
    runtimeProfileSemanticHash: requiredHash(
      value.runtimeProfileSemanticHash,
      'bindings.runtimeProfileSemanticHash',
    ),
    sharedModelSemanticHash: requiredHash(
      value.sharedModelSemanticHash,
      'bindings.sharedModelSemanticHash',
    ),
    topologySemanticHash: requiredHash(
      value.topologySemanticHash,
      'bindings.topologySemanticHash',
    ),
    attachmentSemanticHash: requiredHash(
      value.attachmentSemanticHash,
      'bindings.attachmentSemanticHash',
    ),
    restraintSemanticHash: requiredHash(
      value.restraintSemanticHash,
      'bindings.restraintSemanticHash',
    ),
    loadPrimitiveSetSemanticHash: requiredHash(
      value.loadPrimitiveSetSemanticHash,
      'bindings.loadPrimitiveSetSemanticHash',
    ),
  });
}

function requireCaseConfigurations(rows, loadCases) {
  if (!Array.isArray(rows)) throw new TypeError('caseConfigurations must be an array.');
  const normalized = rows.map((row) => {
    exactKeys(row, [
      'loadCaseId',
      'weightPrimitiveCaseId',
      'referenceTemperatureC',
      'analysisTemperatureC',
    ], 'caseConfiguration');
    return deepFreeze({
      loadCaseId: requiredString(row.loadCaseId, 'caseConfiguration.loadCaseId'),
      weightPrimitiveCaseId: row.weightPrimitiveCaseId === null
        ? null
        : requiredString(row.weightPrimitiveCaseId, 'weightPrimitiveCaseId'),
      referenceTemperatureC: nullableFinite(row.referenceTemperatureC, 'referenceTemperatureC'),
      analysisTemperatureC: nullableFinite(row.analysisTemperatureC, 'analysisTemperatureC'),
    });
  }).sort((left, right) => left.loadCaseId.localeCompare(right.loadCaseId));
  const expected = loadCases.map((row) => row.loadCaseId).sort();
  const actual = normalized.map((row) => row.loadCaseId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError('Scenario case configurations must exactly match request load cases.');
  }
  return deepFreeze(normalized);
}

function buildOverrideJournal(request) {
  return deepFreeze((request.restraintOccurrences || []).filter((row) => row.overrideId).map((row) => ({
    overrideId: row.overrideId,
    supportSiteId: row.supportSiteId,
    restraintId: row.restraintId,
    sourceDirection: row.sourceDirection,
    effectiveDirection: row.effectiveDirection,
    sourceCapability: row.sourceCapability,
    effectiveCapability: row.effectiveCapability,
    reason: row.overrideReason,
    geometryChanged: row.geometryChanged,
  })).sort((left, right) => left.overrideId.localeCompare(right.overrideId)));
}

function bindingChanges(expected, actual) {
  return Object.keys(expected).flatMap((field) => (
    expected[field] === actual[field] ? [] : [{
      field,
      expected: expected[field],
      actual: actual[field],
    }]
  ));
}

function requireAuthority(value, field) {
  if (!isPlainRecord(value)) throw new TypeError(`${field} must be an object.`);
  authorityHash(value, field);
  return value;
}

function authorityHash(value, field) {
  const hash = value?.semanticHash;
  return requiredHash(hash, `${field}.semanticHash`);
}

function appendJournal(rows, row) {
  return deepFreeze([...rows, row]);
}

function journalEntry(action, identity, details) {
  return deepFreeze({
    sequence: null,
    action,
    identity,
    details: deepFreeze(structuredClone(details || {})),
  });
}

function blocker(code, scope, message) {
  return deepFreeze({ code, severity: 'ERROR', scope, message });
}

function uniqueRows(rows) {
  return [...new Map(rows.map((row) => [
    `${row.code}|${row.scope}|${row.message}`,
    row,
  ])).values()].sort((left, right) => (
    `${left.severity}|${left.code}|${left.scope}`
      .localeCompare(`${right.severity}|${right.code}|${right.scope}`)
  ));
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function requiredHash(value, field) {
  const normalized = requiredString(value, field);
  if (!normalized.includes(':')) throw new TypeError(`${field} must be a namespaced hash.`);
  return normalized;
}

function timestamp(value, field) {
  const normalized = requiredString(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new TypeError(`${field} must be an ISO timestamp.`);
  return normalized;
}

function nullableFinite(value, field) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite or null.`);
  return value;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export const empiricalLoadCalcScenarioStore = new EmpiricalLoadCalcScenarioStore();
