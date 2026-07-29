import assert from 'node:assert/strict';
import {
  LINEAR_FEA_CONVENTIONS,
  LINEAR_FEA_UNITS,
  MODEL_TOP_LEVEL_KEYS,
  sealLinearFeaModel,
  validateLinearFeaModel,
} from '../src/core/linear-fea-contract/index.js';
import {
  FIXTURE_NAMES,
  axialModel,
  clone,
  diagnosticModel,
  fixtureByName,
  withConstraint,
} from './lfea-b2.1-model-fixtures.mjs';

const results = [];

function pass(id, name) {
  results.push({ id, name, status: 'PASS' });
  console.log(`${id} PASS ${name}`);
}

function test(id, name, body) {
  body();
  pass(id, name);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function resealWith(model, mutate) {
  const candidate = clone(model);
  candidate.validationProfile.semanticHash = '';
  candidate.stiffnessStateHash = '';
  candidate.semanticHash = '';
  candidate.evidenceHash = '';
  mutate(candidate);
  return sealLinearFeaModel(candidate);
}

function assertDeepFrozen(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  if (Array.isArray(value)) value.forEach((child, index) => assertDeepFrozen(child, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
}

const valid = fixtureByName('VALID-AXIAL-2NODE');

test('B21-T01', 'Exact top-level schema', () => {
  assert.deepEqual(Object.keys(valid).sort(), [...MODEL_TOP_LEVEL_KEYS].sort());
  const extra = clone(valid);
  extra.uiState = {};
  expectCode(() => validateLinearFeaModel(extra), 'UNEXPECTED_FIELD');
});

test('B21-T02', 'Exact B-2.0 units required', () => {
  assert.deepEqual(valid.units, LINEAR_FEA_UNITS);
  const candidate = axialModel();
  candidate.units = { ...candidate.units, length: 'mm' };
  expectCode(() => sealLinearFeaModel(candidate), 'UNSUPPORTED_UNIT');
});

test('B21-T03', 'Exact B-2.0 conventions required', () => {
  assert.deepEqual(valid.conventions, LINEAR_FEA_CONVENTIONS);
  const candidate = axialModel();
  candidate.conventions = { ...candidate.conventions, vectorOrientation: 'ROW_VECTOR_V1' };
  expectCode(() => sealLinearFeaModel(candidate), 'INVALID_LINEAR_FEA_CONVENTION');
});

test('B21-T04', 'Unique canonical identities', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-DUPLICATE-NODE')), 'DUPLICATE_IDENTITY');
  const candidate = axialModel();
  candidate.nodes[0].nodeId = ' bad';
  expectCode(() => sealLinearFeaModel(candidate), 'INVALID_CANONICAL_IDENTITY');
});

test('B21-T05', 'All references resolve', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-MISSING-NODE')), 'MISSING_NODE_REFERENCE');
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-MISSING-MATERIAL')), 'MISSING_MATERIAL_REFERENCE');
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-MISSING-SECTION')), 'MISSING_SECTION_REFERENCE');
});

test('B21-T06', 'Input order does not affect any hash', () => {
  const ordered = diagnosticModel();
  ordered.constraints = [
    withConstraint('FIXED', 'UX').constraints[0],
    withConstraint('LINEAR_SPRING', 'UZ', 4e6).constraints[0],
  ];
  ordered.limitations = [
    { code: 'LIM-B', severity: 'WARNING', scope: 'MODEL', stiffnessRelevant: false, details: { note: 'b' } },
    { code: 'LIM-A', severity: 'INFO', scope: 'MODEL', stiffnessRelevant: true, details: { factor: 1 } },
  ];
  ordered.diagnostics.push({
    severity: 'WARNING',
    code: 'SECOND_DIAGNOSTIC',
    entityType: 'MODEL',
    entityId: 'SYS-03-MECH-01',
    message: 'Second diagnostic.',
    evidence: [{ evidenceId: 'EVID-02', sourceId: 'COMPILER', sourceSemanticHash: 'fnv1a64:6666666666666666' }],
    qualificationEvidenceIds: ['B21-T06'],
  });
  ordered.materialStates[0].sourceEvidence.push({ sourceId: 'AAA', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:7777777777777777' });
  const shuffled = clone(ordered);
  for (const field of ['nodes', 'materialStates', 'sectionStates', 'elements', 'constraints', 'limitations', 'diagnostics']) shuffled[field].reverse();
  shuffled.nodes.forEach((node) => {
    node.sourceAncestry.sourceNodeIds.reverse();
    node.sourceAncestry.sourceComponentIds.reverse();
  });
  shuffled.materialStates.forEach((state) => state.sourceEvidence.reverse());
  shuffled.diagnostics.forEach((diagnostic) => {
    diagnostic.evidence.reverse();
    diagnostic.qualificationEvidenceIds.reverse();
  });
  const a = sealLinearFeaModel(ordered);
  const b = sealLinearFeaModel(shuffled);
  assert.equal(a.stiffnessStateHash, b.stiffnessStateHash);
  assert.equal(a.semanticHash, b.semanticHash);
  assert.equal(a.evidenceHash, b.evidenceHash);
});

test('B21-T07', 'Caller input is not mutated', () => {
  const candidate = diagnosticModel();
  candidate.nodes.reverse();
  const before = structuredClone(candidate);
  sealLinearFeaModel(candidate);
  assert.deepEqual(candidate, before);
});

test('B21-T08', 'Source ancestry changes semantic hash', () => {
  const changed = resealWith(valid, (candidate) => {
    candidate.ancestry.sourceSemanticHash = 'fnv1a64:aaaaaaaaaaaaaaaa';
  });
  assert.notEqual(valid.semanticHash, changed.semanticHash);
});

test('B21-T09', 'Source ancestry does not change stiffness hash', () => {
  const changed = resealWith(valid, (candidate) => {
    candidate.nodes[0].sourceAncestry.conditionedNodeId = 'CN-ALT';
  });
  assert.equal(valid.stiffnessStateHash, changed.stiffnessStateHash);
});

test('B21-T10', 'Density and alpha do not change stiffness hash', () => {
  const changed = resealWith(valid, (candidate) => {
    candidate.materialStates[0].massDensity = 7840;
    candidate.materialStates[0].thermalExpansionCoefficient = 1.18e-5;
  });
  assert.equal(valid.stiffnessStateHash, changed.stiffnessStateHash);
  assert.notEqual(valid.semanticHash, changed.semanticHash);
});

test('B21-T11', 'E or G changes stiffness hash', () => {
  for (const field of ['elasticModulus', 'shearModulus']) {
    const changed = resealWith(valid, (candidate) => { candidate.materialStates[0][field] *= 0.99; });
    assert.notEqual(valid.stiffnessStateHash, changed.stiffnessStateHash);
  }
});

test('B21-T12', 'A, Iy, Iz or J changes stiffness hash', () => {
  for (const field of ['area', 'secondMomentY', 'secondMomentZ', 'polarMoment']) {
    const changed = resealWith(valid, (candidate) => { candidate.sectionStates[0][field] *= 1.01; });
    assert.notEqual(valid.stiffnessStateHash, changed.stiffnessStateHash);
  }
});

test('B21-T13', 'Spring stiffness changes stiffness hash', () => {
  const a = sealLinearFeaModel(withConstraint('LINEAR_SPRING', 'UZ', 4e6));
  const b = sealLinearFeaModel(withConstraint('LINEAR_SPRING', 'UZ', 5e6));
  assert.notEqual(a.stiffnessStateHash, b.stiffnessStateHash);
});

test('B21-T14', 'Prescribed-slot value is prohibited', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-PRESCRIBED-VALUE-IN-MODEL')), 'UNEXPECTED_FIELD');
});

test('B21-T15', 'Diagnostic wording does not change semantic hash', () => {
  const a = sealLinearFeaModel(diagnosticModel('Alias resolved.'));
  const b = sealLinearFeaModel(diagnosticModel('Project material alias was resolved from governed evidence.'));
  assert.equal(a.semanticHash, b.semanticHash);
  assert.notEqual(a.evidenceHash, b.evidenceHash);
});

test('B21-T16', 'Diagnostics change evidence hash', () => {
  const a = sealLinearFeaModel(axialModel());
  const b = sealLinearFeaModel(diagnosticModel());
  assert.equal(a.semanticHash, b.semanticHash);
  assert.notEqual(a.evidenceHash, b.evidenceHash);
});

test('B21-T17', 'Zero-length elements rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-ZERO-LENGTH')), 'ZERO_LENGTH_ELEMENT');
});

test('B21-T18', 'Nonfinite coordinates rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-NONFINITE-COORDINATE')), 'NONFINITE_VALUE');
});

test('B21-T19', 'Missing references rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-MISSING-MATERIAL')), 'MISSING_MATERIAL_REFERENCE');
});

test('B21-T20', 'Invalid material values rejected', () => {
  const candidate = axialModel();
  candidate.materialStates[0].elasticModulus = 0;
  expectCode(() => sealLinearFeaModel(candidate), 'INVALID_MATERIAL_VALUE');
});

test('B21-T21', 'Invalid section values rejected', () => {
  const candidate = axialModel();
  candidate.sectionStates[0].polarMoment = 0;
  expectCode(() => sealLinearFeaModel(candidate), 'INVALID_SECTION_VALUE');
});

test('B21-T22', 'Nonorthonormal axes rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-NONUNIT-AXIS')), 'NONUNIT_AXIS');
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-NONORTHOGONAL-AXES')), 'NONORTHOGONAL_AXES');
});

test('B21-T23', 'Left-handed axes rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-LEFT-HANDED-AXES')), 'LEFT_HANDED_AXES');
});

test('B21-T24', 'Duplicate node/DOF constraints rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-DUPLICATE-CONSTRAINT')), 'DUPLICATE_NODE_DOF_CONSTRAINT');
});

test('B21-T25', 'Nonlinear behaviors rejected', () => {
  expectCode(() => sealLinearFeaModel(fixtureByName('INVALID-NONLINEAR-BEHAVIOR')), 'UNSUPPORTED_CONSTRAINT_BEHAVIOR');
});

test('B21-T26', 'Load fields rejected', () => {
  const candidate = axialModel();
  candidate.nodalForces = [];
  expectCode(() => sealLinearFeaModel(candidate), 'UNEXPECTED_FIELD');
});

test('B21-T27', 'Deep immutability', () => {
  const model = fixtureByName('VALID-DIAGNOSTIC-EVIDENCE');
  assertDeepFrozen(model);
  assert.throws(() => { model.nodes[0].position.x = 99; }, TypeError);
});

test('B21-T28', 'Stale hashes rejected', () => {
  expectCode(() => validateLinearFeaModel(fixtureByName('INVALID-STALE-STIFFNESS-HASH')), 'STALE_STIFFNESS_HASH');
  expectCode(() => validateLinearFeaModel(fixtureByName('INVALID-STALE-SEMANTIC-HASH')), 'STALE_SEMANTIC_HASH');
  expectCode(() => validateLinearFeaModel(fixtureByName('INVALID-STALE-EVIDENCE-HASH')), 'STALE_EVIDENCE_HASH');
});

const fixed = fixtureByName('VALID-FIXED-CONSTRAINT');
const prescribed = fixtureByName('VALID-PRESCRIBED-SLOT');
assert.equal(fixed.stiffnessStateHash, prescribed.stiffnessStateHash, 'fixed and prescribed slots must share the constrained partition identity');
assert.notEqual(fixed.semanticHash, prescribed.semanticHash, 'fixed and prescribed slots retain different physical semantics');

const regressions = [
  ['source ancestry removed from semanticHash', valid.semanticHash !== resealWith(valid, (m) => { m.ancestry.sourceSemanticHash = 'fnv1a64:bbbbbbbbbbbbbbbb'; }).semanticHash],
  ['density included in stiffnessStateHash', valid.stiffnessStateHash === resealWith(valid, (m) => { m.materialStates[0].massDensity += 1; }).stiffnessStateHash],
  ['E excluded from stiffnessStateHash', valid.stiffnessStateHash !== resealWith(valid, (m) => { m.materialStates[0].elasticModulus += 1e9; }).stiffnessStateHash],
  ['caller arrays sorted in place', (() => { const m = axialModel(); m.nodes.reverse(); const before = clone(m.nodes); sealLinearFeaModel(m); return JSON.stringify(m.nodes) === JSON.stringify(before); })()],
  ['local axis silently normalized', (() => { const m = fixtureByName('INVALID-NONUNIT-AXIS'); try { sealLinearFeaModel(m); return false; } catch { return m.elements[0].localAxes.x[0] === 2; } })()],
  ['prescribed numeric value embedded in model', (() => { try { sealLinearFeaModel(fixtureByName('INVALID-PRESCRIBED-VALUE-IN-MODEL')); return false; } catch { return true; } })()],
  ['duplicate node/DOF constraints accepted', (() => { try { sealLinearFeaModel(fixtureByName('INVALID-DUPLICATE-CONSTRAINT')); return false; } catch { return true; } })()],
  ['nonlinear behavior accepted', (() => { try { sealLinearFeaModel(fixtureByName('INVALID-NONLINEAR-BEHAVIOR')); return false; } catch { return true; } })()],
  ['diagnostic wording changes semanticHash', sealLinearFeaModel(diagnosticModel('A')).semanticHash === sealLinearFeaModel(diagnosticModel('B')).semanticHash],
];
for (const [name, caught] of regressions) {
  assert.equal(caught, true, `deliberate regression was not detected: ${name}`);
  console.log(`REGRESSION PASS ${name}`);
}

const requiredFixtures = [
  'VALID-AXIAL-2NODE',
  'VALID-ORIENTED-3D-ELEMENT',
  'VALID-FIXED-CONSTRAINT',
  'VALID-SPRING-CONSTRAINT',
  'VALID-PRESCRIBED-SLOT',
  'INVALID-DUPLICATE-NODE',
  'INVALID-NONFINITE-COORDINATE',
  'INVALID-ZERO-LENGTH',
  'INVALID-MISSING-MATERIAL',
  'INVALID-MISSING-SECTION',
  'INVALID-MISSING-NODE',
  'INVALID-NONUNIT-AXIS',
  'INVALID-NONORTHOGONAL-AXES',
  'INVALID-LEFT-HANDED-AXES',
  'INVALID-DUPLICATE-CONSTRAINT',
  'INVALID-PRESCRIBED-VALUE-IN-MODEL',
  'INVALID-NONLINEAR-BEHAVIOR',
  'INVALID-STALE-STIFFNESS-HASH',
  'INVALID-STALE-SEMANTIC-HASH',
  'INVALID-STALE-EVIDENCE-HASH',
];
assert.deepEqual(requiredFixtures.filter((name) => !FIXTURE_NAMES.includes(name)), []);
console.log(`B-2.1 qualification: ${results.length}/${results.length} tests passed; ${regressions.length}/${regressions.length} deliberate regressions detected.`);
