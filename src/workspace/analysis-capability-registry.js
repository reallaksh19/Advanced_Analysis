import { createInspection } from './analysis-input-evidence.js';
import {
  createWorkspaceAnalysisReadiness,
  evaluateApplicability,
  validateWorkspaceAnalysisReadiness,
} from './analysis-readiness.js';
import { freezeDeep } from './dataset-utils.js';

export class AnalysisCapabilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AnalysisCapabilityError';
    this.code = code;
    this.details = freezeDeep({ ...details });
  }
}

export class AnalysisCapabilityRegistry {
  #capabilities = new Map();

  register(definition) {
    const capability = normalizeDefinition(definition);
    if (this.#capabilities.has(capability.id)) {
      throw new AnalysisCapabilityError(
        'DUPLICATE_CAPABILITY',
        `Analysis capability is already registered: ${capability.id}.`,
      );
    }
    this.#capabilities.set(capability.id, capability);
    return this;
  }

  list(context) {
    return freezeDeep([...this.#capabilities.values()].map((capability) => {
      const assessment = this.#assess(capability, context);
      const readiness = assessment.workspaceReadiness;
      return {
        analysisType: capability.id,
        label: capability.label,
        description: capability.description,
        engineeringLevel: capability.engineeringLevel,
        solverId: readiness.solverId,
        solverVersion: readiness.solverVersion,
        methodId: readiness.methodId,
        methodVersion: readiness.methodVersion,
        enabled: readiness.readyToRun,
        reason: readiness.diagnostics[0]?.message || '',
        missing: readiness.missingInputs.map((item) => item.key),
        readiness,
      };
    }));
  }

  inspect(analysisType, context) {
    return this.#assess(this.#require(analysisType), context);
  }

  readiness(analysisType, context) {
    return this.#assess(this.#require(analysisType), context).workspaceReadiness;
  }

  async execute(analysisType, context) {
    const capability = this.#require(analysisType);
    const assessment = this.#assess(capability, context);
    const readiness = assessment.workspaceReadiness;
    if (!readiness.readyToRun) {
      throw new AnalysisCapabilityError(
        readiness.applicable ? 'CAPABILITY_INPUTS_NOT_READY' : 'CAPABILITY_NOT_APPLICABLE',
        readiness.diagnostics[0]?.message || `${capability.label} is not ready.`,
        { readiness },
      );
    }

    const result = await capability.execute(context);
    if (!result || typeof result !== 'object') {
      throw new AnalysisCapabilityError(
        'INVALID_CAPABILITY_RESULT',
        `${capability.id} returned an invalid result.`,
      );
    }
    return result;
  }

  has(analysisType) {
    return this.#capabilities.has(String(analysisType || ''));
  }

  get size() {
    return this.#capabilities.size;
  }

  #assess(capability, context) {
    const evaluatedReadiness = normalizeReadiness(capability.evaluate(context));
    const rawInspection = capability.inspect ? capability.inspect(context) : { fields: [], readiness: evaluatedReadiness };
    if (!rawInspection || typeof rawInspection !== 'object') {
      throw new AnalysisCapabilityError(
        'INVALID_INPUT_INSPECTION',
        `${capability.id} returned an invalid input inspection.`,
      );
    }
    const inspection = createInspection(rawInspection.fields || [], rawInspection.readiness || evaluatedReadiness);
    const workspaceReadiness = createWorkspaceAnalysisReadiness({
      capability,
      context,
      inspection,
      applicability: evaluateApplicability(capability, context),
      evaluatedReadiness,
    });
    const validation = validateWorkspaceAnalysisReadiness(workspaceReadiness);
    if (!validation.ok) {
      throw new AnalysisCapabilityError(
        'INVALID_WORKSPACE_READINESS',
        `${capability.id} produced invalid workspace readiness: ${validation.errors.join(' ')}`,
        { errors: validation.errors },
      );
    }
    return freezeDeep({ ...inspection, workspaceReadiness });
  }

  #require(analysisType) {
    const capability = this.#capabilities.get(String(analysisType || ''));
    if (!capability) {
      throw new AnalysisCapabilityError(
        'CAPABILITY_NOT_FOUND',
        `Unknown analysis capability: ${analysisType}.`,
      );
    }
    return capability;
  }
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Analysis capability definition must be an object.');
  }
  const id = nonEmptyString(definition.id, 'id');
  const label = nonEmptyString(definition.label, 'label');
  if (typeof definition.evaluate !== 'function') {
    throw new TypeError(`Analysis capability ${id} requires evaluate(context).`);
  }
  if (typeof definition.execute !== 'function') {
    throw new TypeError(`Analysis capability ${id} requires execute(context).`);
  }
  if (typeof definition.applicability !== 'function') {
    throw new TypeError(`Analysis capability ${id} requires applicability(context).`);
  }
  if (definition.inspect !== undefined && typeof definition.inspect !== 'function') {
    throw new TypeError(`Analysis capability ${id} inspect must be a function.`);
  }
  return Object.freeze({
    id,
    label,
    description: String(definition.description || ''),
    engineeringLevel: nonEmptyString(definition.engineeringLevel || 'SCREENING', 'engineeringLevel'),
    manifest: normalizeManifest(definition.manifest, id),
    applicability: definition.applicability,
    evaluate: definition.evaluate,
    execute: definition.execute,
    inspect: definition.inspect || null,
  });
}

function normalizeManifest(value, capabilityId) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`Analysis capability ${capabilityId} requires a solver manifest.`);
  }
  return freezeDeep({
    solverId: nonEmptyString(value.solverId, 'manifest.solverId'),
    solverVersion: nonEmptyString(value.solverVersion, 'manifest.solverVersion'),
    methodId: nonEmptyString(value.methodId, 'manifest.methodId'),
    methodVersion: nonEmptyString(value.methodVersion, 'manifest.methodVersion'),
    codeBasis: nonEmptyStringArray(value.codeBasis, 'manifest.codeBasis'),
    assumptions: nonEmptyStringArray(value.assumptions, 'manifest.assumptions'),
    limitations: nonEmptyStringArray(value.limitations, 'manifest.limitations'),
  });
}

function normalizeReadiness(value) {
  if (value === true) return { enabled: true, reason: '', missing: [] };
  if (value === false || value == null) {
    return { enabled: false, reason: 'Capability inputs are not ready.', missing: [] };
  }
  if (typeof value !== 'object') {
    throw new TypeError('Capability readiness must be a boolean or object.');
  }
  return {
    enabled: value.enabled === true,
    reason: String(value.reason || ''),
    missing: Array.isArray(value.missing) ? value.missing.map(String) : [],
  };
}

function nonEmptyStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`Analysis capability ${field} must be a non-empty array.`);
  }
  return value.map((item) => nonEmptyString(String(item), field));
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Analysis capability ${field} must be a non-empty string.`);
  }
  return value.trim();
}
