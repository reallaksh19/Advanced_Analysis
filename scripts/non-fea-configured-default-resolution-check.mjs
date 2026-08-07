import assert from 'node:assert/strict';
import {
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentRecord,
  createNonFeaEnrichmentSidecar,
  resolveNonFeaEnrichment,
} from '../src/core/non-fea-enrichment/index.js';
import {
  createConfiguredDefaultUsageRowsFromResolution,
  createNonFeaConfiguredDefaultProvider,
} from '../src/workspace/project-data/non-fea-configured-default-provider.js';
import { createConfiguredDefaultUsageLedger } from '../src/workspace/project-data/non-fea-field-registry.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const sourceModel = buildStraightFixture({ lengthsM: [1, 1] }).sharedModel;
const sourceHash = sourceModel.semanticHash;
const sourceJson = JSON.stringify(sourceModel);

checkSpecificityAndAuthorityPrecedence();
checkSourceBeatsConfiguredDefault();
checkEqualSpecificityConflict();
checkPosScopeFailsClosedWithoutExplicitIdentity();
checkProjectDataApprovalRequired();
checkDeterminism();

assert.equal(sourceModel.semanticHash, sourceHash, 'configured-default resolution changed source hash');
assert.equal(JSON.stringify(sourceModel), sourceJson, 'configured-default resolution mutated source model');

console.log(JSON.stringify({
  phase: 'configured-default-convergence',
  status: 'PASS',
  singleCommonResolver: true,
  exactEntityScoping: true,
  specificityPrecedence: true,
  sourcePrecedence: true,
  acceptedOverridePrecedence: true,
  selectedDefaultsOnlyCreateUsage: true,
  equalSpecificityConflictBlocked: true,
  posProximityInferencePermitted: false,
  projectDataApprovalRequired: true,
  sourceImmutable: true,
}, null, 2));

function checkSpecificityAndAuthorityPrecedence() {
  const profile = approvedProfile([
    configuredDefault({
      defaultId: 'ELASTIC-GLOBAL',
      fieldId: 'ELASTIC_MODULUS',
      value: 180000,
      unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'],
    }),
    configuredDefault({
      defaultId: 'ELASTIC-COMP-1',
      fieldId: 'ELASTIC_MODULUS',
      value: 200000,
      unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'],
      scope: { entityIds: ['COMP-1'] },
    }),
  ]);
  const provider = createNonFeaConfiguredDefaultProvider({
    profile,
    sourceModel,
    requestedMethods: ['THERMAL_FREE_DISPLACEMENT'],
  });
  assert.deepEqual(provider.blockers, []);
  assert.equal(provider.records.length, 2);
  assert.equal(recordFor(provider, 'COMP-1').evidence.defaultId, 'ELASTIC-COMP-1');
  assert.equal(recordFor(provider, 'COMP-2').evidence.defaultId, 'ELASTIC-GLOBAL');

  const accepted = createNonFeaEnrichmentRecord({
    recordId: 'REVIEWED-COMP-2-ELASTIC',
    selectorKind: 'ENTITY',
    selectorKey: 'COMP-2',
    fieldId: 'ELASTIC_MODULUS',
    value: 210000,
    unit: 'MPa',
    authority: 'ACCEPTED_OVERRIDE',
    sourceId: 'REVIEWED-OVERRIDE',
    revision: '1',
    evidence: { source: 'Reviewed override' },
  });
  const sidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: [accepted, ...provider.records],
  });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'READY');
  assert.equal(selected(ledger, 'COMP-1', 'ELASTIC_MODULUS').authority, 'PROJECT_CONFIGURED_DEFAULT');
  assert.equal(selected(ledger, 'COMP-1', 'ELASTIC_MODULUS').value, 200000);
  assert.equal(selected(ledger, 'COMP-2', 'ELASTIC_MODULUS').authority, 'ACCEPTED_OVERRIDE');
  assert.equal(selected(ledger, 'COMP-2', 'ELASTIC_MODULUS').value, 210000);

  const usageRows = createConfiguredDefaultUsageRowsFromResolution({
    resolutionLedger: ledger,
    requestedMethods: ['THERMAL_FREE_DISPLACEMENT'],
  });
  assert.equal(usageRows.length, 1, 'only the selected Project Data default may produce usage');
  assert.equal(usageRows[0].defaultId, 'ELASTIC-COMP-1');
  assert.equal(usageRows[0].targetId, 'COMP-1');
  const usage = createConfiguredDefaultUsageLedger(profile, usageRows);
  assert.equal(usage.rows.length, 1);

  const projection = createNonFeaEnrichedProjection({ sourceModel, resolutionLedger: ledger });
  const comp1 = projection.enrichedModel.components.find((row) => row.componentKey === 'COMP-1');
  const comp2 = projection.enrichedModel.components.find((row) => row.componentKey === 'COMP-2');
  assert.equal(comp1.engineeringProperties.elasticModulusMpa.value, 200000);
  assert.equal(comp2.engineeringProperties.elasticModulusMpa.value, 210000);
}

function checkSourceBeatsConfiguredDefault() {
  const profile = approvedProfile([
    configuredDefault({
      defaultId: 'PIPE-WEIGHT-GLOBAL',
      fieldId: 'UNIT_PIPE_WEIGHT',
      value: 999,
      unit: 'kg/m',
      allowedMethods: ['WEIGHT_AND_GRAVITY'],
    }),
  ]);
  const provider = createNonFeaConfiguredDefaultProvider({
    profile,
    sourceModel,
    requestedMethods: ['WEIGHT_AND_GRAVITY'],
  });
  assert.equal(provider.blockers.length, 0);
  const sidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: provider.records,
  });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'READY');
  for (const component of sourceModel.components) {
    const row = selected(ledger, component.componentKey, 'UNIT_PIPE_WEIGHT');
    assert.equal(row.authority, 'SOURCE_EXPLICIT');
    assert.equal(row.value, 10);
  }
  const usageRows = createConfiguredDefaultUsageRowsFromResolution({
    resolutionLedger: ledger,
    requestedMethods: ['WEIGHT_AND_GRAVITY'],
  });
  assert.equal(usageRows.length, 0, 'a losing configured default must not create a usage receipt');
}

function checkEqualSpecificityConflict() {
  const profile = approvedProfile([
    configuredDefault({
      defaultId: 'ELASTIC-CONFLICT-A', fieldId: 'ELASTIC_MODULUS', value: 190000, unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'], scope: { entityIds: ['COMP-1'] },
    }),
    configuredDefault({
      defaultId: 'ELASTIC-CONFLICT-B', fieldId: 'ELASTIC_MODULUS', value: 200000, unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'], scope: { entityIds: ['COMP-1'] },
    }),
  ]);
  const provider = createNonFeaConfiguredDefaultProvider({
    profile,
    sourceModel,
    requestedMethods: ['THERMAL_FREE_DISPLACEMENT'],
  });
  assert.ok(provider.blockers.some((row) => row.code === 'CONFIGURED_DEFAULT_SCOPE_CONFLICT'));
  assert.equal(provider.records.some((row) => row.selectorKey === 'COMP-1'), false);
}

function checkPosScopeFailsClosedWithoutExplicitIdentity() {
  const profile = approvedProfile([
    configuredDefault({
      defaultId: 'POS-ONLY-ELASTIC', fieldId: 'ELASTIC_MODULUS', value: 200000, unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'], scope: { posIds: ['POS-404'] },
    }),
  ]);
  const provider = createNonFeaConfiguredDefaultProvider({
    profile,
    sourceModel,
    requestedMethods: ['THERMAL_FREE_DISPLACEMENT'],
  });
  assert.ok(provider.blockers.some((row) => row.code === 'CONFIGURED_DEFAULT_SCOPE_UNMATCHED'));
  assert.equal(provider.records.length, 0);
}

function checkProjectDataApprovalRequired() {
  const profile = approvedProfile([
    configuredDefault({
      defaultId: 'UNAPPROVED-ELASTIC', fieldId: 'ELASTIC_MODULUS', value: 200000, unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'],
    }),
  ]);
  profile.qualificationPolicy.configuredDefaults.approved = false;
  const provider = createNonFeaConfiguredDefaultProvider({
    profile,
    sourceModel,
    requestedMethods: ['THERMAL_FREE_DISPLACEMENT'],
  });
  assert.ok(provider.blockers.some((row) => row.code === 'CONFIGURED_DEFAULT_AUTHORITY_NOT_APPROVED'));
  assert.equal(provider.records.length, 0);
}

function checkDeterminism() {
  const profile = approvedProfile([
    configuredDefault({
      defaultId: 'DETERMINISTIC-ELASTIC', fieldId: 'ELASTIC_MODULUS', value: 200000, unit: 'MPa',
      allowedMethods: ['THERMAL_FREE_DISPLACEMENT'], scope: { entityIds: ['COMP-1'] },
    }),
  ]);
  const a = createNonFeaConfiguredDefaultProvider({ profile, sourceModel, requestedMethods: ['THERMAL_FREE_DISPLACEMENT'] });
  const b = createNonFeaConfiguredDefaultProvider({ profile, sourceModel, requestedMethods: ['THERMAL_FREE_DISPLACEMENT'] });
  assert.equal(a.semanticHash, b.semanticHash);
  assert.deepEqual(a.records, b.records);
}

function approvedProfile(defaults) {
  return {
    revision: 7,
    qualificationPolicy: {
      configuredDefaults: {
        value: {
          schema: 'non-fea-configured-default-policy/v1',
          defaults,
        },
        evidence: { source: 'PROJECT-DATA-DEFAULT-POLICY', sourceHash: 'fixture' },
        approved: true,
      },
    },
  };
}

function configuredDefault(overrides) {
  return {
    defaultId: overrides.defaultId,
    fieldId: overrides.fieldId,
    value: overrides.value,
    unit: overrides.unit,
    basis: `Approved basis for ${overrides.defaultId}`,
    allowedMethods: overrides.allowedMethods,
    ...(overrides.scope ? { scope: overrides.scope } : {}),
  };
}

function recordFor(provider, targetId) {
  return provider.records.find((row) => row.selectorKey === targetId);
}

function selected(ledger, targetId, fieldId) {
  const row = ledger.rows.find((item) => item.targetId === targetId && item.fieldId === fieldId);
  assert.ok(row, `missing resolution row for ${targetId}/${fieldId}`);
  assert.ok(row.selected, `missing selected candidate for ${targetId}/${fieldId}`);
  return row.selected;
}
