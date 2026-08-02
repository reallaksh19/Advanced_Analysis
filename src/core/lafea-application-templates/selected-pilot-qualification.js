import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_SELECTED_PILOT_QUALIFICATION_SCHEMA =
  'lafea-template-selected-pilot-qualification/v1';
export const LAFEA_SELECTED_PILOT_QUALIFICATION_STATUS =
  'SELECTED_PILOT_EVIDENCE_QUALIFIED';
export const LAFEA_SELECTED_PILOT_RELEASE_DISPOSITION = 'NOT_CLAIMED';

const REFERENCE_MANIFEST = benchmarkManifest({
  manifestId: 'ALG-LOAD-REFERENCE-TRANSFER.B5-INDEPENDENT/V1',
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  stageId: 'LAFEA.1',
  evidenceBasis: 'INDEPENDENT_RIGID_REFERENCE_TRANSFER_CROSS_PRODUCT',
  expected: {
    transformedForceGlobal: [1000, 0, 0],
    transformedMomentGlobal: [0, 1_000_000, 0],
  },
  tolerance: {
    forceAbsolute: 1e-9,
    forceRelative: 1e-12,
    momentAbsolute: 1e-6,
    momentRelative: 1e-12,
  },
});

const outsideDiameter = 100;
const insideDiameter = 80;
const radius = outsideDiameter / 2;
const area = Math.PI / 4 * (outsideDiameter ** 2 - insideDiameter ** 2);
const inertia = Math.PI / 64 * (outsideDiameter ** 4 - insideDiameter ** 4);
const polar = 2 * inertia;
const vonMises = Math.sqrt(200 ** 2 + 3 * 100 ** 2);

const COMBINED_SECTION_MANIFEST = benchmarkManifest({
  manifestId: 'ALG-PIPE-SECTION-COMBINED.B5-INDEPENDENT/V1',
  templateId: 'ALG-PIPE-SECTION-COMBINED',
  stageId: 'LAFEA.2',
  evidenceBasis: 'INDEPENDENT_CIRCULAR_ANNULUS_AND_VON_MISES_CLOSED_FORM',
  expected: {
    outsideDiameter,
    insideDiameter,
    radius,
    area,
    inertia,
    polar,
    sigmaX: 200,
    tauXTheta: 100,
    vonMises,
  },
  tolerance: {
    sectionAbsolute: 1e-7,
    sectionRelative: 1e-10,
    stressAbsolute: 1e-8,
    stressRelative: 1e-10,
  },
});

export const LAFEA_SELECTED_PILOT_BENCHMARK_MANIFESTS = Object.freeze([
  REFERENCE_MANIFEST,
  COMBINED_SECTION_MANIFEST,
]);

const INPUT_KEYS = Object.freeze([
  'exactHead',
  'b4Report',
  'b4CheckHash',
  'controllerHash',
]);
const REPORT_KEYS = Object.freeze([
  'schema',
  'status',
  'pilots',
  'independentExpectedValues',
  'antiDriftTestCount',
  'authority',
]);
const AUTHORITY_KEYS = Object.freeze([
  'selectedPilotExecution',
  'generalT7dAuthorized',
  'continuumAuthorized',
  'shellAuthorized',
  'codeReady',
  'releaseQualified',
]);
const EXPECTED_KEYS = Object.freeze([
  'referenceTransfer',
  'combinedSection',
]);
const REFERENCE_KEYS = Object.freeze(['force', 'moment']);
const COMBINED_KEYS = Object.freeze([
  'area', 'inertia', 'polar', 'sigmaX', 'tauXTheta', 'vonMises',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema',
  'exactHead',
  'benchmarkManifests',
  'b4Evidence',
  'pilotResults',
  'status',
  'releaseQualification',
  'limitations',
  'hashProfile',
  'semanticHash',
]);

export function createSelectedPilotQualification(input) {
  exactKeys(input, INPUT_KEYS, 'Selected-pilot qualification input');
  const normalized = normalizeInput(input);
  evaluateB4Evidence(normalized.b4Report);
  const pilotResults = Object.freeze([
    pilotResult(REFERENCE_MANIFEST),
    pilotResult(COMBINED_SECTION_MANIFEST),
  ]);
  const base = {
    schema: LAFEA_SELECTED_PILOT_QUALIFICATION_SCHEMA,
    exactHead: normalized.exactHead,
    benchmarkManifests: LAFEA_SELECTED_PILOT_BENCHMARK_MANIFESTS,
    b4Evidence: {
      reportHash: templateReleaseSha256(normalized.b4Report),
      b4CheckHash: normalized.b4CheckHash,
      controllerHash: normalized.controllerHash,
      antiDriftTestCount: normalized.b4Report.antiDriftTestCount,
    },
    pilotResults,
    status: LAFEA_SELECTED_PILOT_QUALIFICATION_STATUS,
    releaseQualification: LAFEA_SELECTED_PILOT_RELEASE_DISPOSITION,
    limitations: Object.freeze([
      'NO_GENERAL_T7D_AUTHORITY',
      'NO_CONTINUUM_AUTHORITY',
      'NO_SHELL_AUTHORITY',
      'NO_CODE_READY_CLAIM',
      'NO_RELEASE_QUALIFIED_CLAIM',
      'EXACT_HEAD_CI_BUILD_REVIEW_EVIDENCE_STILL_REQUIRED_FOR_RELEASE',
    ]),
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({
    ...base,
    semanticHash: templateReleaseSha256(base),
  });
}

export function validateSelectedPilotQualification(value) {
  const errors = [];
  try {
    exactKeys(value, OUTPUT_KEYS, 'Selected-pilot qualification');
    if (value.schema !== LAFEA_SELECTED_PILOT_QUALIFICATION_SCHEMA
      || value.status !== LAFEA_SELECTED_PILOT_QUALIFICATION_STATUS
      || value.releaseQualification !== LAFEA_SELECTED_PILOT_RELEASE_DISPOSITION
      || value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) {
      throw new TypeError('Selected-pilot qualification identity is invalid.');
    }
    commit(value.exactHead);
    if (!Array.isArray(value.benchmarkManifests)
      || value.benchmarkManifests.length !== 2) {
      throw new TypeError('Selected-pilot qualification requires two manifests.');
    }
    exactKeys(value.b4Evidence, [
      'reportHash', 'b4CheckHash', 'controllerHash', 'antiDriftTestCount',
    ], 'b4Evidence');
    hash(value.b4Evidence.reportHash, 'b4Evidence.reportHash');
    hash(value.b4Evidence.b4CheckHash, 'b4Evidence.b4CheckHash');
    hash(value.b4Evidence.controllerHash, 'b4Evidence.controllerHash');
    if (!Number.isInteger(value.b4Evidence.antiDriftTestCount)
      || value.b4Evidence.antiDriftTestCount < 12) {
      throw new TypeError('Selected-pilot qualification requires at least 12 anti-drift tests.');
    }
    if (!Array.isArray(value.pilotResults) || value.pilotResults.length !== 2
      || value.pilotResults.some((row) => row.status !== 'PASS')) {
      throw new TypeError('Both selected pilot results must pass.');
    }
    strings(value.limitations, 'limitations');
    const base = { ...value };
    delete base.semanticHash;
    if (value.semanticHash !== templateReleaseSha256(base)) {
      throw new TypeError('Selected-pilot qualification semantic hash is invalid.');
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError('Selected-pilot qualification must be deeply frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeInput(input) {
  commit(input.exactHead);
  hash(input.b4CheckHash, 'b4CheckHash');
  hash(input.controllerHash, 'controllerHash');
  exactKeys(input.b4Report, REPORT_KEYS, 'B4 report');
  exactKeys(input.b4Report.authority, AUTHORITY_KEYS, 'B4 report authority');
  exactKeys(input.b4Report.independentExpectedValues, EXPECTED_KEYS,
    'B4 report independentExpectedValues');
  exactKeys(input.b4Report.independentExpectedValues.referenceTransfer,
    REFERENCE_KEYS, 'B4 reference-transfer values');
  exactKeys(input.b4Report.independentExpectedValues.combinedSection,
    COMBINED_KEYS, 'B4 combined-section values');
  return structuredClone(input);
}

function evaluateB4Evidence(report) {
  if (report.schema !== 'lafea-template-b4-analytical-pilot-check/v1'
    || report.status !== 'PASS') {
    throw new TypeError('B4 selected-pilot report did not pass.');
  }
  const expectedPilots = [
    'ALG-LOAD-REFERENCE-TRANSFER -> LAFEA.1',
    'ALG-PIPE-SECTION-COMBINED -> LAFEA.2',
  ];
  if (JSON.stringify(report.pilots) !== JSON.stringify(expectedPilots)) {
    throw new TypeError('B4 report pilot scope is invalid.');
  }
  if (!Number.isInteger(report.antiDriftTestCount)
    || report.antiDriftTestCount < 12) {
    throw new TypeError('B4 report anti-drift coverage is insufficient.');
  }
  const authority = report.authority;
  if (!authority.selectedPilotExecution
    || authority.generalT7dAuthorized
    || authority.continuumAuthorized
    || authority.shellAuthorized
    || authority.codeReady
    || authority.releaseQualified) {
    throw new TypeError('B4 report authority boundary is invalid.');
  }

  const reference = report.independentExpectedValues.referenceTransfer;
  vector(reference.force, REFERENCE_MANIFEST.expected.transformedForceGlobal,
    REFERENCE_MANIFEST.tolerance.forceAbsolute,
    REFERENCE_MANIFEST.tolerance.forceRelative,
    'reference force');
  vector(reference.moment, REFERENCE_MANIFEST.expected.transformedMomentGlobal,
    REFERENCE_MANIFEST.tolerance.momentAbsolute,
    REFERENCE_MANIFEST.tolerance.momentRelative,
    'reference moment');

  const combined = report.independentExpectedValues.combinedSection;
  scalar(combined.area, COMBINED_SECTION_MANIFEST.expected.area,
    COMBINED_SECTION_MANIFEST.tolerance.sectionAbsolute,
    COMBINED_SECTION_MANIFEST.tolerance.sectionRelative, 'section area');
  scalar(combined.inertia, COMBINED_SECTION_MANIFEST.expected.inertia,
    COMBINED_SECTION_MANIFEST.tolerance.sectionAbsolute,
    COMBINED_SECTION_MANIFEST.tolerance.sectionRelative, 'section inertia');
  scalar(combined.polar, COMBINED_SECTION_MANIFEST.expected.polar,
    COMBINED_SECTION_MANIFEST.tolerance.sectionAbsolute,
    COMBINED_SECTION_MANIFEST.tolerance.sectionRelative, 'polar moment');
  scalar(combined.sigmaX, COMBINED_SECTION_MANIFEST.expected.sigmaX,
    COMBINED_SECTION_MANIFEST.tolerance.stressAbsolute,
    COMBINED_SECTION_MANIFEST.tolerance.stressRelative, 'sigmaX');
  scalar(combined.tauXTheta, COMBINED_SECTION_MANIFEST.expected.tauXTheta,
    COMBINED_SECTION_MANIFEST.tolerance.stressAbsolute,
    COMBINED_SECTION_MANIFEST.tolerance.stressRelative, 'tauXTheta');
  scalar(combined.vonMises, COMBINED_SECTION_MANIFEST.expected.vonMises,
    COMBINED_SECTION_MANIFEST.tolerance.stressAbsolute,
    COMBINED_SECTION_MANIFEST.tolerance.stressRelative, 'von Mises');
}

function benchmarkManifest(input) {
  const base = {
    schema: 'lafea-selected-pilot-independent-benchmark/v1',
    ...input,
    expectedValueAuthority: 'FROZEN_BEFORE_B5_PRODUCTION_EVIDENCE_CONSUMPTION',
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

function pilotResult(manifest) {
  return deepFreeze({
    templateId: manifest.templateId,
    stageId: manifest.stageId,
    benchmarkManifestId: manifest.manifestId,
    benchmarkManifestHash: manifest.semanticHash,
    status: 'PASS',
  });
}

function scalar(actual, expected, absolute, relative, label) {
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    throw new TypeError(`${label} must be finite.`);
  }
  const limit = Math.max(absolute, relative * Math.abs(expected));
  if (Math.abs(actual - expected) > limit) {
    throw new TypeError(`${label} changed beyond the frozen tolerance.`);
  }
}

function vector(actual, expected, absolute, relative, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new TypeError(`${label} vector shape is invalid.`);
  }
  actual.forEach((value, index) => scalar(
    value, expected[index], absolute, relative, `${label}[${index}]`,
  ));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function commit(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new TypeError('exactHead must be a 40-character commit SHA.');
  }
}

function hash(value, field) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${field} must be a SHA-256 hash.`);
  }
}

function strings(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new TypeError(`${field} must contain non-empty strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${field} values must be unique.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
