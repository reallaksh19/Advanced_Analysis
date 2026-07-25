import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { BASE_LIMITATIONS, MODEL_SCHEMA } from './constants.js';
import { modelError } from './errors.js';
import {
  canonicalConstraint, canonicalLoadCase,
} from './source-loads.js';
import {
  canonicalElements, canonicalMaterial, canonicalNode,
} from './source-mesh.js';
import {
  INPUT_KEYS, normalizeRetainedSource, normalizeSourceInput,
} from './source-normalization.js';
import { canonicalizeUnits } from './units.js';
import { clonePlain, codeUnitCompare, exactRecord } from './validation.js';

const MODEL_KEYS = [...INPUT_KEYS, 'sourceEvidence', 'semanticHash'];

export function createCanonicalLocalContinuumModel(input) {
  return sealSource(normalizeSourceInput(input));
}

export function validateCanonicalLocalContinuumModel(input) {
  const model = clonePlain(input);
  exactRecord(model, MODEL_KEYS, 'model');
  if (model.schema !== MODEL_SCHEMA) {
    throw modelError('SCHEMA_MISMATCH', 'schema', `schema must be ${MODEL_SCHEMA}.`);
  }
  const expected = sealSource(normalizeRetainedSource(model.sourceEvidence));
  if (
    model.semanticHash !== expected.semanticHash
    || semanticHash(model) !== semanticHash(expected)
  ) {
    throw modelError(
      'CANONICAL_MODEL_HASH_MISMATCH',
      'semanticHash',
      'Canonical model does not reconstruct from source evidence.',
    );
  }
  return expected;
}

function sealSource(source) {
  const units = canonicalizeUnits(source.units);
  const model = {
    schema: MODEL_SCHEMA,
    modelIdentity: source.modelIdentity,
    modelVersion: source.modelVersion,
    sourceAncestry: {
      ...source.sourceAncestry,
      sourceEvidenceSemanticHash: semanticHash(source),
    },
    sourceEvidence: source,
    units,
    formulation: source.formulation,
    materials: source.materials.map((row) => canonicalMaterial(row, units)),
    nodes: source.nodes.map((row) => canonicalNode(row, units)),
    elements: [],
    constraints: source.constraints.map((row) => canonicalConstraint(row, units)),
    loadCases: source.loadCases.map((row) => canonicalLoadCase(row, units)),
    resultRequests: source.resultRequests,
    qualificationProfile: source.qualificationProfile,
    limitations: [...new Set([...BASE_LIMITATIONS, ...source.limitations])].sort(
      codeUnitCompare,
    ),
  };
  model.elements = canonicalElements(
    source.elements,
    model.nodes,
    units,
    model.qualificationProfile,
  );
  const canonicalHash = semanticHash(model);
  model.sourceAncestry.canonicalModelSemanticHash = canonicalHash;
  model.semanticHash = semanticHash(modelPayload(model));
  return deepFreeze(model);
}

function modelPayload(model) {
  const copy = clonePlain(model);
  delete copy.semanticHash;
  delete copy.sourceAncestry.canonicalModelSemanticHash;
  return copy;
}
