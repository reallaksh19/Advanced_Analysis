import { semanticHash } from '../core/shared-piping-model/index.js';
import { freezeDeep } from './dataset-utils.js';
import {
  NON_FEA_COMMON_METHOD_IDS,
  assessCommonInputStaleness,
  createEnrichedStagedJsonExport,
  createPreFeaPipingCheckRequest,
  reimportEnrichedStagedJsonExport,
  runPreFeaPipingCheck,
  sealCommonEnrichedPipingInput,
} from '../core/non-fea-common-checker/index.js';

export class NonFeaCommonInputStore {
  #snapshot = emptySnapshot(0);
  #listeners = new Set();

  configure(input = {}) {
    const requestedMethods = normalizeMethods(input.requestedMethods || this.#snapshot.configuration.requestedMethods);
    const requestedLoadCases = normalizeLoadCases(input.requestedLoadCases || this.#snapshot.configuration.requestedLoadCases);
    const qualificationProfileId = nullableText(input.qualificationProfileId ?? this.#snapshot.configuration.qualificationProfileId);
    const qualificationProfileVersion = input.qualificationProfileVersion ?? this.#snapshot.configuration.qualificationProfileVersion;
    if (qualificationProfileVersion !== null && (!Number.isInteger(qualificationProfileVersion) || qualificationProfileVersion < 1)) {
      throw new TypeError('qualificationProfileVersion must be null or a positive integer.');
    }
    const configuration = freezeDeep({ requestedMethods, requestedLoadCases, qualificationProfileId, qualificationProfileVersion });
    if (JSON.stringify(configuration) === JSON.stringify(this.#snapshot.configuration)) return this.#snapshot;
    return this.#update({
      configuration,
      request: null,
      report: null,
      commonInput: this.#snapshot.commonInput,
      staleness: this.#snapshot.commonInput
        ? mergeStaleness(
          this.#snapshot.staleness,
          explicitStaleness('COMMON_INPUT_CONFIGURATION_CHANGED', 'configuration', 'Method, load-case or qualification selection changed.'),
        )
        : null,
      exportArtifact: null,
      message: 'Common-input configuration changed; evaluate and reseal.',
      error: '',
    });
  }

  evaluate(input) {
    const request = createPreFeaPipingCheckRequest(input);
    const report = runPreFeaPipingCheck(request);
    const currentBindings = bindingsFromRequest(request);
    const assessed = this.#snapshot.commonInput
      ? assessCommonInputStaleness(this.#snapshot.commonInput, currentBindings)
      : null;
    const staleness = this.#snapshot.commonInput
      ? mergeStaleness(this.#snapshot.staleness, assessed)
      : null;
    return this.#update({
      request,
      report,
      currentBindings,
      staleness,
      exportArtifact: staleness?.stale ? null : this.#snapshot.exportArtifact,
      message: `Common checker evaluated ${report.readyMethodIds.length}/${report.methodRows.length} methods; package ${report.packageState}.`,
      error: '',
    });
  }

  seal(confirmation) {
    if (!this.#snapshot.request || !this.#snapshot.report) {
      throw new TypeError('Evaluate the common checker before sealing.');
    }
    const commonInput = sealCommonEnrichedPipingInput({
      request: this.#snapshot.request,
      report: this.#snapshot.report,
      confirmation,
    });
    return this.#update({
      commonInput,
      staleness: freezeDeep({ stale: false, changes: [] }),
      exportArtifact: null,
      consumptionAuthorizations: [],
      consumptionExecutions: [],
      message: `Sealed ${commonInput.sealedMethodIds.length} methods at ${commonInput.semanticHash}.`,
      error: '',
    });
  }

  exportCurrent() {
    const commonInput = this.requireCurrentCommonInput();
    const exportArtifact = createEnrichedStagedJsonExport(commonInput);
    return this.#update({
      exportArtifact,
      message: `Created deterministic staged export ${exportArtifact.exportSemanticHash}.`,
      error: '',
    });
  }

  reimport(text) {
    const imported = reimportEnrichedStagedJsonExport(text);
    const staleness = this.#snapshot.currentBindings
      ? assessCommonInputStaleness(imported.commonInput, this.#snapshot.currentBindings)
      : explicitStaleness('CURRENT_BINDINGS_UNAVAILABLE', 'currentBindings', 'Current authority bindings are unavailable.');
    return this.#update({
      commonInput: imported.commonInput,
      staleness,
      exportArtifact: null,
      consumptionAuthorizations: [],
      consumptionExecutions: [],
      message: staleness.stale
        ? 'Re-imported common input as historical/stale evidence.'
        : 'Re-imported common input is equivalent to current authority bindings.',
      error: '',
    });
  }

  refreshCurrentBindings(currentBindings) {
    if (!this.#snapshot.commonInput) return this.#update({ currentBindings, staleness: null });
    const assessed = assessCommonInputStaleness(this.#snapshot.commonInput, currentBindings);
    const staleness = mergeStaleness(this.#snapshot.staleness, assessed);
    return this.#update({
      currentBindings,
      staleness,
      exportArtifact: staleness.stale ? null : this.#snapshot.exportArtifact,
      message: staleness.stale
        ? `Common input is stale: ${staleness.changes.length} authority bindings changed or require resealing.`
        : 'Common input remains current.',
      error: '',
    });
  }

  markStale(code, path = 'authority', message = 'Common-input authority changed.') {
    if (!this.#snapshot.commonInput) return this.#snapshot;
    const staleness = mergeStaleness(
      this.#snapshot.staleness,
      explicitStaleness(code, path, message),
    );
    return this.#update({
      staleness,
      exportArtifact: null,
      message: `Common input marked stale: ${message}`,
      error: '',
    });
  }

  requireCurrentCommonInput() {
    if (!this.#snapshot.commonInput) {
      throw codedError('A sealed common enriched piping input is required.', 'COMMON_INPUT_REQUIRED');
    }
    if (this.#snapshot.staleness?.stale !== false) {
      throw codedError('The sealed common input is stale and must be resealed.', 'COMMON_INPUT_STALE');
    }
    return this.#snapshot.commonInput;
  }

  requireReadyMethods(methodIds) {
    const commonInput = this.requireCurrentCommonInput();
    const requested = normalizeMethods(methodIds);
    const missing = requested.filter((methodId) => !commonInput.sealedMethodIds.includes(methodId));
    if (missing.length) {
      const error = codedError(
        `The current common input is not sealed for: ${missing.join(', ')}.`,
        'COMMON_INPUT_METHOD_NOT_READY',
      );
      error.details = freezeDeep({ requested, sealed: commonInput.sealedMethodIds, missing });
      throw error;
    }
    return commonInput;
  }

  recordConsumptionAuthorization(receipt) {
    const row = freezeDeep(structuredClone(receipt));
    return this.#update({
      consumptionAuthorizations: freezeDeep([
        ...this.#snapshot.consumptionAuthorizations.filter((item) => item.authorizationId !== row.authorizationId),
        row,
      ]),
      message: `Bound method authorization ${row.authorizationId} to the common input.`,
      error: '',
    });
  }

  recordConsumptionExecution(receipt) {
    const row = freezeDeep(structuredClone(receipt));
    return this.#update({
      consumptionExecutions: freezeDeep([
        ...this.#snapshot.consumptionExecutions.filter((item) => item.executionId !== row.executionId),
        row,
      ]),
      message: `Bound method execution ${row.executionId} to the common input.`,
      error: '',
    });
  }

  setError(error) {
    return this.#update({ error: error instanceof Error ? error.message : String(error), message: '' });
  }

  clear() {
    this.#snapshot = emptySnapshot(this.#snapshot.version + 1);
    this.#emit();
    return this.#snapshot;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Common-input listener must be a function.');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSnapshot() { return this.#snapshot; }
  getRequest() { return this.#snapshot.request; }
  getReport() { return this.#snapshot.report; }
  getCommonInput() { return this.#snapshot.commonInput; }
  getExportArtifact() { return this.#snapshot.exportArtifact; }

  #update(patch) {
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      ...patch,
      version: this.#snapshot.version + 1,
    });
    this.#emit();
    return this.#snapshot;
  }

  #emit() {
    this.#listeners.forEach((listener) => listener(this.#snapshot));
  }
}

export const nonFeaCommonInputStore = new NonFeaCommonInputStore();

function emptySnapshot(version) {
  return freezeDeep({
    configuration: {
      requestedMethods: [...NON_FEA_COMMON_METHOD_IDS],
      requestedLoadCases: ['EMPTY', 'OPE', 'HYD'],
      qualificationProfileId: null,
      qualificationProfileVersion: null,
    },
    request: null,
    report: null,
    commonInput: null,
    currentBindings: null,
    staleness: null,
    exportArtifact: null,
    consumptionAuthorizations: [],
    consumptionExecutions: [],
    message: '',
    error: '',
    version,
  });
}

export function commonInputBindingsFromRequest(request) {
  return bindingsFromRequest(request);
}

function bindingsFromRequest(request) {
  return freezeDeep({
    sourceDatasetSha256: request.sourceDatasetSha256,
    sourceModelSemanticHash: request.sourceModel.semanticHash,
    enrichmentSidecarSemanticHash: request.enrichmentSidecar.semanticHash,
    resolutionLedgerSemanticHash: request.resolutionLedger.semanticHash,
    projectDataProfileSemanticHash: semanticHash(request.projectDataProfile),
    configuredDefaultUsageLedgerSemanticHash: request.configuredDefaultUsageLedger?.semanticHash || null,
    qualificationProfileSemanticHash: request.qualificationProfile?.semanticHash || null,
    authorityContractSemanticHashes: Object.fromEntries(Object.entries(request.authorityContracts).map(([key, row]) => [
      key,
      row?.semanticHash || null,
    ])),
  });
}

function explicitStaleness(code, path, message) {
  return freezeDeep({
    stale: true,
    changes: [{ code, path, message }],
  });
}

function mergeStaleness(previous, assessed) {
  if (!previous?.stale) return assessed || previous || null;
  if (!assessed?.stale) return previous;
  const byKey = new Map();
  [...(previous.changes || []), ...(assessed.changes || [])].forEach((row) => {
    const key = `${row.code}|${row.path}|${row.message || row.expected || ''}|${row.actual || ''}`;
    if (!byKey.has(key)) byKey.set(key, structuredClone(row));
  });
  return freezeDeep({ stale: true, changes: [...byKey.values()] });
}

function normalizeMethods(values) {
  if (!Array.isArray(values)) throw new TypeError('requestedMethods must be an array.');
  const rows = [...new Set(values)].sort();
  rows.forEach((methodId) => {
    if (!NON_FEA_COMMON_METHOD_IDS.includes(methodId)) throw new TypeError(`Unknown Non-FEA method: ${methodId}.`);
  });
  if (!rows.length) throw new TypeError('At least one requested method is required.');
  return freezeDeep(rows);
}

function normalizeLoadCases(values) {
  if (!Array.isArray(values)) throw new TypeError('requestedLoadCases must be an array.');
  const rows = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
  if (!rows.length) throw new TypeError('At least one requested load case is required.');
  return freezeDeep(rows);
}

function nullableText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.trim() !== value) throw new TypeError('qualificationProfileId must be null or a trimmed string.');
  return value;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
