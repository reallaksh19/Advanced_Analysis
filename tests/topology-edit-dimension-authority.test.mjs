import test from 'node:test';
import assert from 'node:assert/strict';
import { createDimensionAuthority, DIMENSION_STATUS } from '../src/workspace/topology-edit/dimension-authority.js';

test('outside diameter precedence keeps explicit component evidence authoritative', () => {
  const authority = createDimensionAuthority({
    catalog: { C1: { outsideDiameterMm: 200 } },
  });
  const result = authority.resolveOutsideDiameter({
    outsideDiameterMm: 219.1,
    catalogRef: 'C1',
    sourceEvidenceId: 'SRC-1',
  }, { canonicalEntityId: 'E1' });
  assert.equal(result.status, DIMENSION_STATUS.RESOLVED);
  assert.equal(result.valueMm, 219.1);
  assert.equal(result.authority, 'EXPLICIT_COMPONENT_OD');
});

test('equal-precedence conflicting dimensions fail closed', () => {
  const authority = createDimensionAuthority({ toleranceMm: 0.001 });
  const result = authority.resolveOutsideDiameter({
    outsideDiameterMm: 100,
    odMm: 110,
    sourceEvidenceId: 'SRC-CONFLICT',
  }, { canonicalEntityId: 'E2' });
  assert.equal(result.status, DIMENSION_STATUS.CONFLICTING);
  assert.equal(result.valueMm, null);
  assert.equal(result.diagnostics[0].code, 'OUTSIDE_DIAMETER_CONFLICTING');
});

test('missing dimensions produce diagnostics rather than defaults', () => {
  const result = createDimensionAuthority().resolveOutsideDiameter({}, { canonicalEntityId: 'E3' });
  assert.equal(result.status, DIMENSION_STATUS.MISSING);
  assert.equal(result.valueMm, null);
  assert.equal(result.diagnostics[0].code, 'OUTSIDE_DIAMETER_MISSING');
});

test('branch inheritance requires explicit policy and evidence opt-in', () => {
  const authority = createDimensionAuthority({
    branchInheritance: { enabled: true, allowedComponentTypes: ['TEE'] },
  });
  const missing = authority.resolveBranchOutsideDiameter({ runOutsideDiameterMm: 168.3 }, {
    canonicalEntityId: 'TEE-1', componentType: 'TEE',
  });
  assert.equal(missing.status, DIMENSION_STATUS.MISSING);

  const inherited = authority.resolveBranchOutsideDiameter({
    runOutsideDiameterMm: 168.3,
    allowBranchSizeInheritance: true,
  }, { canonicalEntityId: 'TEE-1', componentType: 'TEE' });
  assert.equal(inherited.status, DIMENSION_STATUS.RESOLVED);
  assert.equal(inherited.valueMm, 168.3);
  assert.equal(inherited.ruleId, 'BRANCH_INHERITS_RUN_OD');
});
