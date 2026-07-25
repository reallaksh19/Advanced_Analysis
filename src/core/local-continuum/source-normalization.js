import {
  FORMULATIONS, MODEL_SCHEMA, QUALIFICATION_PROFILE_SCHEMA, SOURCE_EVIDENCE_SCHEMA,
} from './constants.js';
import { modelError } from './errors.js';
import { strictNumber } from './numeric.js';
import {
  normalizeConstraints, normalizeLoadCases, normalizeRequests, validateReferences,
} from './source-loads.js';
import { normalizeElements, normalizeMaterials, normalizeNodes } from './source-mesh.js';
import {
  arrayValue, clonePlain, codeUnitCompare, enumValue, exactRecord, nonEmptyString,
} from './validation.js';

export const INPUT_KEYS = [
  'schema', 'modelIdentity', 'modelVersion', 'sourceAncestry', 'units',
  'formulation', 'materials', 'nodes', 'elements', 'constraints', 'loadCases',
  'resultRequests', 'qualificationProfile', 'limitations',
];
const TOLERANCE_KEYS = [
  'minimumElementArea', 'stiffnessSymmetry', 'constitutiveSymmetry',
  'choleskyPivot', 'freeDofResidual', 'reactionEquilibrium', 'strainEnergy',
  'rigidBodyStrain', 'patchTestStress',
];

export function normalizeSourceInput(input) {
  return normalizeSource(clonePlain(input));
}

export function normalizeRetainedSource(value) {
  const source = clonePlain(value);
  exactRecord(source, ['schema', ...INPUT_KEYS.slice(1)], 'sourceEvidence');
  if (source.schema !== SOURCE_EVIDENCE_SCHEMA) {
    throw modelError(
      'SOURCE_SCHEMA_MISMATCH',
      'sourceEvidence.schema',
      'Source evidence schema is invalid.',
    );
  }
  return normalizeSource({ ...source, schema: MODEL_SCHEMA });
}

function normalizeSource(input) {
  exactRecord(input, INPUT_KEYS, 'model');
  if (input.schema !== MODEL_SCHEMA) {
    throw modelError('SCHEMA_MISMATCH', 'schema', `schema must be ${MODEL_SCHEMA}.`);
  }
  const materials = normalizeMaterials(input.materials);
  const nodes = normalizeNodes(input.nodes);
  const elements = normalizeElements(input.elements, nodes);
  const constraints = normalizeConstraints(input.constraints);
  const loadCases = normalizeLoadCases(input.loadCases);
  const resultRequests = normalizeRequests(input.resultRequests, loadCases);
  const qualificationProfile = normalizeProfile(input.qualificationProfile);
  validateReferences({ materials, nodes, elements, constraints, loadCases });
  return {
    schema: SOURCE_EVIDENCE_SCHEMA,
    modelIdentity: nonEmptyString(input.modelIdentity, 'modelIdentity'),
    modelVersion: nonEmptyString(input.modelVersion, 'modelVersion'),
    sourceAncestry: normalizeAncestry(input.sourceAncestry),
    units: normalizeUnits(input.units),
    formulation: enumValue(input.formulation, FORMULATIONS, 'formulation'),
    materials,
    nodes,
    elements,
    constraints,
    loadCases,
    resultRequests,
    qualificationProfile,
    limitations: normalizeLimitations(input.limitations),
  };
}

function normalizeAncestry(value) {
  const row = exactRecord(
    value,
    ['sourceModelIdentity', 'sourceVersion', 'adapterIdentity', 'adapterVersion'],
    'sourceAncestry',
  );
  return {
    sourceModelIdentity: nonEmptyString(
      row.sourceModelIdentity,
      'sourceAncestry.sourceModelIdentity',
    ),
    sourceVersion: nonEmptyString(row.sourceVersion, 'sourceAncestry.sourceVersion'),
    adapterIdentity: nonEmptyString(
      row.adapterIdentity,
      'sourceAncestry.adapterIdentity',
    ),
    adapterVersion: nonEmptyString(row.adapterVersion, 'sourceAncestry.adapterVersion'),
  };
}

function normalizeUnits(value) {
  const row = exactRecord(value, ['length', 'force', 'stress', 'modulus'], 'units');
  return { ...row };
}

function normalizeProfile(value) {
  const row = exactRecord(
    value,
    ['schema', 'identity', 'tolerances'],
    'qualificationProfile',
  );
  if (row.schema !== QUALIFICATION_PROFILE_SCHEMA) {
    throw modelError(
      'PROFILE_SCHEMA_MISMATCH',
      'qualificationProfile.schema',
      `schema must be ${QUALIFICATION_PROFILE_SCHEMA}.`,
    );
  }
  const rules = exactRecord(
    row.tolerances,
    TOLERANCE_KEYS,
    'qualificationProfile.tolerances',
  );
  const tolerances = {};
  TOLERANCE_KEYS.forEach((key) => {
    tolerances[key] = normalizeTolerance(rules[key], key);
  });
  return {
    schema: row.schema,
    identity: nonEmptyString(row.identity, 'qualificationProfile.identity'),
    tolerances,
  };
}

function normalizeTolerance(value, key) {
  const path = `qualificationProfile.tolerances.${key}`;
  const row = exactRecord(value, ['absolute', 'relative'], path);
  const absolute = strictNumber(row.absolute, `${path}.absolute`);
  const relative = strictNumber(row.relative, `${path}.relative`);
  if (absolute < 0 || relative < 0) {
    throw modelError('NEGATIVE_TOLERANCE', path, 'Tolerance values must be non-negative.');
  }
  return { absolute, relative };
}

function normalizeLimitations(values) {
  const rows = arrayValue(values, 'limitations').map((value, index) => (
    nonEmptyString(value, `limitations[${index}]`)
  ));
  if (new Set(rows).size !== rows.length) {
    throw modelError('DUPLICATE_LIMITATION', 'limitations', 'Limitations must be unique.');
  }
  return rows.sort(codeUnitCompare);
}
