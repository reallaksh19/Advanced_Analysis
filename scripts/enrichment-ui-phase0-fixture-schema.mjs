import assert from 'node:assert/strict';
import { sha256Text } from './enrichment-ui-phase0-fixture-codec.mjs';

export const FIXTURE_SCHEMA = 'EnrichmentUiFixture.v1';
export const FIXTURE_MANIFEST_SCHEMA = 'EnrichmentUiFixtureManifest.v1';
export const FIXTURE_GENERATOR_VERSION = '1.0.0';
export const PINNED_TIMESTAMP = '2026-08-02T00:00:00.000Z';

export const ENGINEERING_FIELDS = Object.freeze([
  'process.designPressureKpaG',
  'process.hydroTestPressureKpaG',
  'process.designTemperatureC',
  'process.operatingTemperatureC',
  'process.minimumTemperatureC',
  'process.phaseCode',
  'process.testMediumCode',
  'piping.pipingClassCode',
  'piping.ratingClassCode',
  'piping.nominalBoreMm',
  'piping.nominalBoreIn',
  'piping.outsideDiameterMm',
  'piping.scheduleCode',
  'piping.wallThicknessMm',
  'piping.corrosionAllowanceMm',
  'piping.insideDiameterMm',
  'piping.sectionAreaM2',
  'material.materialCode',
  'material.categoryCode',
  'material.densityKgM3',
  'material.elasticModulusMpa',
  'material.poissonRatio',
  'material.thermalExpansionPerC',
  'material.referenceAllowableMpa',
  'contents.operatingDensityKgM3',
  'contents.hydroDensityKgM3',
  'contents.gasDensityKgM3',
  'contents.liquidDensityKgM3',
  'contents.mixedDensityKgM3',
  'contents.selectedBasisCode',
  'insulation.code',
  'insulation.stateCode',
  'insulation.thicknessMm',
  'insulation.densityKgM3',
  'insulation.massKgPerM',
  'weight.pipeMetalKgPerM',
  'weight.contentsOperatingKgPerM',
  'weight.contentsHydroKgPerM',
  'weight.insulationKgPerM',
  'weight.totalOperatingKgPerM',
]);

export const FIELD_STATUS = Object.freeze({
  RESOLVED_EXACT: 1,
  RESOLVED_DERIVED: 2,
  PROPOSED_REVIEW: 3,
  BLOCKED_MISSING: 4,
  BLOCKED_AMBIGUOUS: 5,
  BLOCKED_CONFLICT: 6,
  BLOCKED_STALE_SOURCE: 7,
  NOT_APPLICABLE: 8,
});

export const LINE_FLAG = Object.freeze({
  DUPLICATE_KEY: 1 << 0,
  MISSING_MASTER: 1 << 1,
  AMBIGUOUS_CONTAINMENT: 1 << 2,
  STALE_HASH: 1 << 3,
  BLOCKED_FIELD: 1 << 4,
});

const SHARED_MANIFEST = Object.freeze({
  schema: FIXTURE_MANIFEST_SCHEMA,
  generatorVersion: FIXTURE_GENERATOR_VERSION,
  engineeringColumnCount: ENGINEERING_FIELDS.length,
  sourceLocatorCountMin: 1,
  sourceLocatorCountMax: 3,
  pinnedTimestamp: PINNED_TIMESTAMP,
});

export const FIXTURE_MANIFESTS = Object.freeze({
  small: Object.freeze({
    ...SHARED_MANIFEST,
    name: 'small',
    seed: '393-UI-PHASE0-SMALL-v1',
    lineCount: 128,
    componentCount: 1024,
    duplicateKeyGroups: 8,
    duplicateKeyTargetCount: 16,
    missingMasterTargetCount: 6,
    ambiguousContainmentTargetCount: 4,
    staleSourceTargetCount: 4,
    blockedFieldTargetCount: 8,
  }),
  medium: Object.freeze({
    ...SHARED_MANIFEST,
    name: 'medium',
    seed: '393-UI-PHASE0-MEDIUM-v1',
    lineCount: 10_000,
    componentCount: 100_000,
    duplicateKeyGroups: 500,
    duplicateKeyTargetCount: 1_000,
    missingMasterTargetCount: 200,
    ambiguousContainmentTargetCount: 100,
    staleSourceTargetCount: 100,
    blockedFieldTargetCount: 300,
  }),
  large: Object.freeze({
    ...SHARED_MANIFEST,
    name: 'large',
    seed: '393-UI-PHASE0-LARGE-v1',
    lineCount: 100_000,
    componentCount: 1_000_000,
    duplicateKeyGroups: 5_000,
    duplicateKeyTargetCount: 10_000,
    missingMasterTargetCount: 2_000,
    ambiguousContainmentTargetCount: 1_000,
    staleSourceTargetCount: 1_000,
    blockedFieldTargetCount: 3_000,
  }),
});

export const SERVICE_COUNT = 12;
export const RATING_COUNT = 4;
export const CLASS_COUNT = 20;
export const SOURCE_HASHES = Object.freeze({
  model: sha256Text('synthetic-model-source-v1'),
  lineList: sha256Text('synthetic-line-list-source-v1'),
  pipingClass: sha256Text('synthetic-piping-class-source-v1'),
});

export function getFixtureManifest(name) {
  const manifest = FIXTURE_MANIFESTS[name];
  if (!manifest) throw new RangeError(`Unknown fixture manifest: ${name}`);
  return manifest;
}

export function validateFixtureManifest(manifest) {
  assert.equal(manifest?.schema, FIXTURE_MANIFEST_SCHEMA, 'E_QF_SCHEMA_INVALID: manifest schema');
  assert.equal(manifest?.generatorVersion, FIXTURE_GENERATOR_VERSION, 'E_QF_MANIFEST_DRIFT: generator version');
  assert.equal(manifest?.engineeringColumnCount, ENGINEERING_FIELDS.length, 'E_QF_FIELD_SCHEMA_DRIFT');
  assert.equal(manifest?.pinnedTimestamp, PINNED_TIMESTAMP, 'E_QF_MANIFEST_DRIFT: timestamp');
  for (const field of [
    'lineCount',
    'componentCount',
    'duplicateKeyGroups',
    'duplicateKeyTargetCount',
    'missingMasterTargetCount',
    'ambiguousContainmentTargetCount',
    'staleSourceTargetCount',
    'blockedFieldTargetCount',
  ]) {
    assert(Number.isSafeInteger(manifest[field]) && manifest[field] >= 0, `E_QF_SCHEMA_INVALID: ${field}`);
  }
  assert.equal(manifest.duplicateKeyTargetCount, manifest.duplicateKeyGroups * 2,
    'E_QF_MANIFEST_DRIFT: duplicate targets must be pairs');
  const anomalyTotal = manifest.duplicateKeyTargetCount
    + manifest.missingMasterTargetCount
    + manifest.ambiguousContainmentTargetCount
    + manifest.staleSourceTargetCount
    + manifest.blockedFieldTargetCount;
  assert(anomalyTotal <= manifest.lineCount, 'E_QF_SCHEMA_INVALID: anomaly ranges must be disjoint');
  assert(manifest.componentCount >= manifest.lineCount, 'E_QF_SCHEMA_INVALID: component count');
  return true;
}

