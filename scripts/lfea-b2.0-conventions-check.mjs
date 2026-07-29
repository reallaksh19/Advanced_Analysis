import assert from 'node:assert/strict';

import {
  CANONICAL_ID_ORDER_ID,
  CANONICAL_NODE_ID_GRAMMAR_ID,
  CANONICAL_ORDERING_CONVENTION_SCHEMA,
  DOF_ORDER,
  ELEMENT_DOF_ORDER,
  ELEMENT_END_ACTION_CONVENTION_ID,
  ELEMENT_END_ORDER,
  ELEMENT_MATRIX_STORAGE_ID,
  ELEMENT_VECTOR_LAYOUT_ID,
  ELEMENT_VECTOR_LAYOUT_SCHEMA,
  END_ACTION_CONVENTION,
  END_ACTION_CONVENTION_SCHEMA,
  LINEAR_FEA_CONVENTIONS,
  LINEAR_FEA_CONVENTIONS_SCHEMA,
  LINEAR_FEA_UNITS,
  LINEAR_FEA_UNITS_SCHEMA,
  LOCAL_RESULT_ORDER,
  NUMERIC_NORMALIZATION_CONVENTION_SCHEMA,
  NUMERIC_NORMALIZATION_ID,
  PRESCRIBED_DISPLACEMENT_CONVENTION_ID,
  REACTION_CONVENTION_ID,
  THERMAL_STRAIN_CONVENTION_ID,
  TRANSFORMATION_CONVENTION_ID,
  TRANSFORMATION_CONVENTION_SCHEMA,
  VECTOR_ORIENTATION_ID,
  compareCanonicalIds,
  dofIndex,
  elementDofIndex,
  elementMatrixIndex,
  endIndex,
  globalDofIdentity,
  normalizeLinearFeaNumber,
  requireCanonicalNodeId,
  requireLinearFeaConventions,
  requireLinearFeaUnits,
} from '../src/core/linear-fea-contract/index.js';

const tests = [];

function test(id, description, run) {
  tests.push({ id, description, run });
}

function expectThrow(run, code) {
  assert.throws(run, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function cloneConventions() {
  return Object.fromEntries(Object.entries(LINEAR_FEA_CONVENTIONS).map(([key, value]) => {
    if (Array.isArray(value)) return [key, [...value]];
    if (value !== null && typeof value === 'object') return [key, { ...value }];
    return [key, value];
  }));
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, column) => sum + value * vector[column],
    0,
  ));
}

function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

const EXPECTED_DOF_ORDER = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'];
const EXPECTED_END_ORDER = ['I', 'J'];
const EXPECTED_RESULT_ORDER = ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'];
const EXPECTED_ELEMENT_DOF_ORDER = [
  'I:UX', 'I:UY', 'I:UZ', 'I:RX', 'I:RY', 'I:RZ',
  'J:UX', 'J:UY', 'J:UZ', 'J:RX', 'J:RY', 'J:RZ',
];

const EXPECTED_UNITS = {
  length: 'm',
  area: 'm^2',
  secondMomentOfArea: 'm^4',
  polarMomentOfArea: 'm^4',
  force: 'N',
  moment: 'N*m',
  distributedForce: 'N/m',
  stress: 'Pa',
  strain: '1',
  mass: 'kg',
  massDensity: 'kg/m^3',
  acceleration: 'm/s^2',
  translationalStiffness: 'N/m',
  rotationalStiffness: 'N*m/rad',
  absoluteTemperature: 'K',
  temperatureDifference: 'K',
  thermalExpansionCoefficient: '1/K',
  rotation: 'rad',
};

const EXPECTED_END_ACTION = {
  conventionId: 'FRAME_END_ACTION_ON_ELEMENT_V1',
  actionSource: 'CONNECTED_JOINT',
  actionTarget: 'ELEMENT_END',
  componentBasis: 'ELEMENT_LOCAL_AXES',
  recoveryShape: 'K_D_MINUS_EQUIVALENT_LOAD_MINUS_INITIAL_STRAIN_LOAD',
  oppositeAction: 'ELEMENT_ACTION_ON_JOINT_IS_NEGATIVE_OF_REPORTED_END_ACTION',
};

test('B20-T01', 'Exact six-DOF order', () => {
  assert.deepEqual(DOF_ORDER, EXPECTED_DOF_ORDER);
});

test('B20-T02', 'Exact element-end order', () => {
  assert.deepEqual(ELEMENT_END_ORDER, EXPECTED_END_ORDER);
});

test('B20-T03', 'Exact local-result order', () => {
  assert.deepEqual(LOCAL_RESULT_ORDER, EXPECTED_RESULT_ORDER);
});

test('B20-T04', 'Exact 12-DOF element order', () => {
  assert.deepEqual(ELEMENT_DOF_ORDER, EXPECTED_ELEMENT_DOF_ORDER);
});

test('B20-T05', 'Exported convention records are frozen', () => {
  for (const value of [
    DOF_ORDER,
    ELEMENT_END_ORDER,
    LOCAL_RESULT_ORDER,
    ELEMENT_DOF_ORDER,
    END_ACTION_CONVENTION,
    LINEAR_FEA_CONVENTIONS,
    LINEAR_FEA_UNITS,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.equal(LINEAR_FEA_CONVENTIONS.endActionConvention, END_ACTION_CONVENTION);
});

test('B20-T06', 'DOF indices are exactly 0-5', () => {
  assert.deepEqual(DOF_ORDER.map(dofIndex), [0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(DOF_ORDER.map(dofIndex)).size, 6);
});

test('B20-T07', 'Element indices are exactly 0-11', () => {
  const indexes = ELEMENT_END_ORDER.flatMap((end) =>
    DOF_ORDER.map((dof) => elementDofIndex(end, dof)));
  assert.deepEqual(indexes, [...Array(12).keys()]);
  assert.equal(elementDofIndex('I', 'UX'), 0);
  assert.equal(elementDofIndex('I', 'RZ'), 5);
  assert.equal(elementDofIndex('J', 'UX'), 6);
  assert.equal(elementDofIndex('J', 'RZ'), 11);
});

test('B20-T08', 'Invalid DOFs and ends are rejected', () => {
  for (const dof of ['ux', 'Ux', 'URX', '', null, 1]) {
    expectThrow(() => dofIndex(dof), 'INVALID_DOF');
  }
  for (const end of ['i', 'j', 'K', '', null, 1]) {
    expectThrow(() => endIndex(end), 'INVALID_ELEMENT_END');
  }
});

test('B20-T09', 'Exact unit record is accepted', () => {
  assert.equal(LINEAR_FEA_UNITS_SCHEMA, 'fea-linear-units/v1');
  assert.deepEqual(LINEAR_FEA_UNITS, EXPECTED_UNITS);
  assert.equal(requireLinearFeaUnits({ ...EXPECTED_UNITS }), LINEAR_FEA_UNITS);
  assert.equal(LINEAR_FEA_UNITS.absoluteTemperature, 'K');
  assert.equal(LINEAR_FEA_UNITS.temperatureDifference, 'K');
});

test('B20-T10', 'Missing and unexpected units are rejected', () => {
  const missing = { ...EXPECTED_UNITS };
  delete missing.absoluteTemperature;
  expectThrow(() => requireLinearFeaUnits(missing), 'MISSING_LINEAR_FEA_UNIT');
  expectThrow(
    () => requireLinearFeaUnits({ ...EXPECTED_UNITS, energy: 'J' }),
    'UNEXPECTED_LINEAR_FEA_UNIT',
  );
});

test('B20-T11', 'Alternate units are rejected', () => {
  for (const change of [
    { length: 'mm' },
    { stress: 'MPa' },
    { absoluteTemperature: '°C' },
    { temperatureDifference: '°C' },
  ]) {
    expectThrow(
      () => requireLinearFeaUnits({ ...EXPECTED_UNITS, ...change }),
      'INVALID_LINEAR_FEA_UNIT',
    );
  }
});

test('B20-T12', 'Exact convention record is accepted', () => {
  assert.equal(LINEAR_FEA_CONVENTIONS_SCHEMA, 'fea-linear-conventions/v1');
  assert.equal(ELEMENT_VECTOR_LAYOUT_SCHEMA, 'fea-linear-element-vector-layout/v1');
  assert.equal(TRANSFORMATION_CONVENTION_SCHEMA, 'fea-linear-transformation/v1');
  assert.equal(END_ACTION_CONVENTION_SCHEMA, 'fea-linear-end-action/v1');
  assert.equal(CANONICAL_ORDERING_CONVENTION_SCHEMA, 'fea-linear-canonical-ordering/v1');
  assert.equal(NUMERIC_NORMALIZATION_CONVENTION_SCHEMA, 'fea-linear-numeric-normalization/v1');
  assert.equal(VECTOR_ORIENTATION_ID, 'COLUMN_VECTOR_V1');
  assert.equal(ELEMENT_MATRIX_STORAGE_ID, 'ROW_MAJOR_12X12_V1');
  assert.equal(ELEMENT_VECTOR_LAYOUT_ID, 'I_SIX_DOF_THEN_J_SIX_DOF_V1');
  assert.equal(TRANSFORMATION_CONVENTION_ID, 'D_LOCAL_EQ_T_D_GLOBAL_V1');
  assert.equal(ELEMENT_END_ACTION_CONVENTION_ID, 'FRAME_END_ACTION_ON_ELEMENT_V1');
  assert.equal(REACTION_CONVENTION_ID, 'SUPPORT_ACTION_ON_STRUCTURE_R_EQ_KU_MINUS_F_V1');
  assert.equal(PRESCRIBED_DISPLACEMENT_CONVENTION_ID, 'PRESCRIBED_VALUE_IS_STRUCTURAL_DOF_IN_U_V1');
  assert.equal(THERMAL_STRAIN_CONVENTION_ID, 'POSITIVE_DELTA_T_PRODUCES_POSITIVE_INITIAL_EXTENSION_V1');
  assert.equal(CANONICAL_NODE_ID_GRAMMAR_ID, 'ASCII_ALNUM_START_ALNUM_DOT_UNDERSCORE_HYPHEN_V1');
  assert.equal(CANONICAL_ID_ORDER_ID, 'CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1');
  assert.equal(NUMERIC_NORMALIZATION_ID, 'FINITE_IEEE754_NEGATIVE_ZERO_NORMALIZED_V1');
  assert.deepEqual(END_ACTION_CONVENTION, EXPECTED_END_ACTION);
  assert.equal(requireLinearFeaConventions(cloneConventions()), LINEAR_FEA_CONVENTIONS);
});

test('B20-T13', 'Reordered convention arrays are rejected', () => {
  for (const field of ['dofOrder', 'elementEndOrder', 'localResultOrder', 'elementDofOrder']) {
    const candidate = cloneConventions();
    [candidate[field][0], candidate[field][1]] = [candidate[field][1], candidate[field][0]];
    expectThrow(() => requireLinearFeaConventions(candidate), 'INVALID_ORDER_FIELD');
  }
});

test('B20-T14', 'Changed transformation identity is rejected', () => {
  for (const [field, value] of [
    ['transformationConvention', 'D_GLOBAL_EQ_T_D_LOCAL_V1'],
    ['displacementTransformation', 'd_global = T d_local'],
    ['stiffnessTransformation', 'K_local = transpose(T) K_global T'],
    ['forceTransformation', 'q_local = transpose(T) q_global'],
    ['schema', 'fea-linear-conventions/v2'],
  ]) {
    const candidate = cloneConventions();
    candidate[field] = value;
    expectThrow(() => requireLinearFeaConventions(candidate), 'INVALID_LINEAR_FEA_CONVENTION');
  }
});

test('B20-T15', 'Changed end-action semantics are rejected', () => {
  for (const [field, value] of [
    ['actionSource', 'ELEMENT'],
    ['actionTarget', 'CONNECTED_JOINT'],
    ['recoveryShape', 'K_D_PLUS_EQUIVALENT_LOAD_MINUS_INITIAL_STRAIN_LOAD'],
  ]) {
    const candidate = cloneConventions();
    candidate.endActionConvention[field] = value;
    expectThrow(() => requireLinearFeaConventions(candidate), 'INVALID_END_ACTION_CONVENTION');
  }

  const missing = cloneConventions();
  delete missing.endActionConvention.actionTarget;
  expectThrow(() => requireLinearFeaConventions(missing), 'MISSING_LINEAR_FEA_CONVENTION');

  const unexpected = cloneConventions();
  unexpected.endActionConvention.reportedAt = 'NODE';
  expectThrow(() => requireLinearFeaConventions(unexpected), 'UNEXPECTED_LINEAR_FEA_CONVENTION');
});

test('B20-T16', 'Canonical node IDs are validated', () => {
  for (const valid of ['A', 'N1', 'rack-2.node_A', '0', 'A-10']) {
    assert.equal(requireCanonicalNodeId(valid), valid);
  }
  for (const invalid of [
    null, 1, '', ' ', '\t', '\n', 'N:1', '.N1', '-N1', '_N1',
    'N/1', 'N 1', '\u0000N', 'N\u007f', 'Å1', '节点1',
  ]) {
    expectThrow(() => requireCanonicalNodeId(invalid), 'INVALID_CANONICAL_NODE_ID');
  }
});

test('B20-T17', 'Global DOF identities cannot collide', () => {
  const identities = new Set();
  for (const nodeId of ['A', 'A.1', 'A-1', 'A_1', 'A-10', 'A-2', 'B2']) {
    for (const dof of DOF_ORDER) {
      const identity = globalDofIdentity(nodeId, dof);
      assert.equal(identities.has(identity), false, identity);
      identities.add(identity);
      assert.equal(identity, `${nodeId}:${dof}`);
    }
  }
});

test('B20-T18', 'ASCII ordering is locale-independent and lexicographic', () => {
  const original = String.prototype.localeCompare;
  String.prototype.localeCompare = () => {
    throw new Error('locale-sensitive comparison is prohibited');
  };
  try {
    assert.equal(compareCanonicalIds('A', 'B'), -1);
    assert.equal(compareCanonicalIds('B', 'A'), 1);
    assert.equal(compareCanonicalIds('A', 'A'), 0);
    assert.equal(compareCanonicalIds('A-2', 'A-10'), 1);
    assert.equal(compareCanonicalIds('A-10', 'A-2'), -1);
    assert.equal(compareCanonicalIds('Z', 'a'), -1);
    assert.equal(compareCanonicalIds('A', 'A.1'), -1);
  } finally {
    String.prototype.localeCompare = original;
  }
});

test('B20-T19', 'Finite-value normalization identity is retained', () => {
  assert.equal(NUMERIC_NORMALIZATION_ID, 'FINITE_IEEE754_NEGATIVE_ZERO_NORMALIZED_V1');
  assert.equal(Object.is(normalizeLinearFeaNumber(-0), 0), true);
  assert.equal(normalizeLinearFeaNumber(0), 0);
  assert.equal(normalizeLinearFeaNumber(12.5), 12.5);
  assert.equal(normalizeLinearFeaNumber(-7.25), -7.25);
  for (const invalid of [NaN, Infinity, -Infinity, '1', null]) {
    expectThrow(() => normalizeLinearFeaNumber(invalid), 'INVALID_LINEAR_FEA_NUMBER');
  }
});

test('B20-A01', 'Hand-computed axial end-action signs', () => {
  const stiffness = [[10, -10], [-10, 10]];
  const displacement = [0, 0.2];
  const q = multiplyMatrixVector(stiffness, displacement);
  assert.deepEqual(q, [-2, 2]);
  assert.deepEqual(q.map((value) => -value), [2, -2]);
  assert.equal(END_ACTION_CONVENTION.actionSource, 'CONNECTED_JOINT');
  assert.equal(END_ACTION_CONVENTION.actionTarget, 'ELEMENT_END');
});

test('B20-A02', 'Reaction-sign convention', () => {
  const stiffness = [[10, -10], [-10, 10]];
  const displacement = [0, 0.2];
  const appliedNodalLoad = [0, 2];
  const internalResidual = multiplyMatrixVector(stiffness, displacement);
  const reaction = internalResidual.map((value, index) => value - appliedNodalLoad[index]);
  assert.deepEqual(reaction, [-2, 0]);
  assert.equal(LINEAR_FEA_CONVENTIONS.reactionEquation, 'R = K U - F');
});

test('B20-A03', 'Transformation virtual-work preservation', () => {
  const angle = Math.PI / 6;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const transformation = [
    [cosine, sine, 0],
    [-sine, cosine, 0],
    [0, 0, 1],
  ];
  const dGlobal = [0.4, -0.7, 0.2];
  const qLocal = [3.2, -1.5, 0.8];
  const dLocal = multiplyMatrixVector(transformation, dGlobal);
  const qGlobal = multiplyMatrixVector(transpose(transformation), qLocal);
  assert(Math.abs(dot(qGlobal, dGlobal) - dot(qLocal, dLocal)) < 1e-12);
  assert.equal(LINEAR_FEA_CONVENTIONS.displacementTransformation, 'd_local = T d_global');
  assert.equal(LINEAR_FEA_CONVENTIONS.forceTransformation, 'q_global = transpose(T) q_local');
});

test('B20-A04', 'Matrix flattening/index convention', () => {
  assert.equal(ELEMENT_MATRIX_STORAGE_ID, 'ROW_MAJOR_12X12_V1');
  assert.equal(elementMatrixIndex(0, 0), 0);
  assert.equal(elementMatrixIndex(0, 11), 11);
  assert.equal(elementMatrixIndex(1, 0), 12);
  assert.equal(elementMatrixIndex(3, 7), 43);
  assert.equal(elementMatrixIndex(11, 11), 143);
  for (const invalid of [[-1, 0], [0, -1], [12, 0], [0, 12], [1.5, 0]]) {
    expectThrow(() => elementMatrixIndex(...invalid), 'INVALID_ELEMENT_MATRIX_INDEX');
  }
});

let failures = 0;
for (const { id, description, run } of tests) {
  try {
    await run();
    console.log(`PASS ${id} ${description}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${id} ${description}`);
    console.error(error?.stack ?? error);
  }
}

if (failures > 0) {
  console.error(`LFEA B-2.0 conventions check failed: ${failures}/${tests.length}.`);
  process.exitCode = 1;
} else {
  console.log(`LFEA B-2.0 conventions check passed: ${tests.length}/${tests.length}.`);
}
