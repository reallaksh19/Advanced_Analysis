import assert from 'node:assert/strict';
import {
  EMPIRICAL_FORMULA_REGISTER,
} from '../src/workspace/engineering-loads/empirical-formula-register.js';
import {
  EMPIRICAL_METHOD_REGISTRY,
} from '../src/workspace/engineering-loads/empirical-method-registry.js';
import {
  EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS,
} from '../src/workspace/engineering-loads/empirical-restraint-network-profile.js';
import {
  EMPIRICAL_COUPLED_RESTRAINT_NETWORK_FORMULA_IDS,
} from '../src/workspace/engineering-loads/empirical-coupled-restraint-network-profile.js';
import {
  EMPIRICAL_METHOD_BASIS_REGISTER,
  createEmpiricalMethodBasisRegister,
  requireEmpiricalMethodBasisRegister,
} from '../src/workspace/engineering-loads/empirical-method-basis-register.js';

const registered = EMPIRICAL_METHOD_REGISTRY.methods
  .filter((row) => row.runtimeStatus === 'REGISTERED')
  .map((row) => row.methodId)
  .sort();
const covered = EMPIRICAL_METHOD_BASIS_REGISTER.methods
  .map((row) => row.methodId)
  .sort();

assert.deepEqual(covered, registered, 'registered method/basis coverage drifted');
assert.deepEqual(createEmpiricalMethodBasisRegister(), EMPIRICAL_METHOD_BASIS_REGISTER);
assert.equal(Object.isFrozen(EMPIRICAL_METHOD_BASIS_REGISTER), true);

for (const row of EMPIRICAL_METHOD_BASIS_REGISTER.methods) {
  const registration = EMPIRICAL_METHOD_REGISTRY.methods
    .find((candidate) => candidate.methodId === row.methodId);
  assert.ok(registration);
  assert.equal(row.runtimeStatus, registration.runtimeStatus);
  assert.equal(row.qualificationStatus, registration.qualificationStatus);
  assert.deepEqual(row.resultClasses, registration.resultClasses);
  assert.deepEqual(row.qualifiedDofs, registration.qualifiedDofs);
  assert(row.governingBasis.length > 0);
  assert(row.authoritativeInputs.length > 0);
  assert(row.applicability.included.length > 0);
  assert(row.applicability.excluded.length > 0);
  assert(row.qualificationEvidence.length > 0);
}

const v2 = get('CHAINAGE_TRIBUTARY_SPAN_V2');
assert.equal(
  v2.compatibility.legacyFormulaRegisterSemanticHash,
  EMPIRICAL_FORMULA_REGISTER.semanticHash,
);
assert.deepEqual(v2.basisIds, EMPIRICAL_FORMULA_REGISTER.terms.map((row) => row.termId));

const v3 = get('CHAINAGE_TRIBUTARY_SPAN_V3_COG');
assert(v3.basisIds.includes('QUALIFIED_COMPONENT_COG_APPLICATION_POINT'));

const beam = get('EMPIRICAL_BEAM_CONTACT_V1');
assert(beam.basisIds.includes('solvePlanarRestContact'));

const networkV1 = get('EMPIRICAL_RESTRAINT_NETWORK_V1');
assert.deepEqual(
  [...networkV1.basisIds].sort(),
  Object.values(EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS).sort(),
);

const networkV2 = get('EMPIRICAL_RESTRAINT_NETWORK_V2');
assert.deepEqual(
  [...networkV2.basisIds].sort(),
  Object.values(EMPIRICAL_COUPLED_RESTRAINT_NETWORK_FORMULA_IDS).sort(),
);

assert.equal(
  EMPIRICAL_METHOD_BASIS_REGISTER.methods.some(
    (row) => row.methodId === 'THERMAL_LIFTOFF_ACTIVE_SET_V1',
  ),
  false,
);

const tampered = structuredClone(EMPIRICAL_METHOD_BASIS_REGISTER);
tampered.methods[0].classification = 'TAMPERED';
assert.throws(
  () => requireEmpiricalMethodBasisRegister(tampered),
  (error) => error.code === 'EMPIRICAL_METHOD_BASIS_HASH_MISMATCH',
);

console.log(JSON.stringify({
  check: 'empirical-method-basis-register',
  status: 'PASS',
  registeredMethodCount: registered.length,
  coveredMethodCount: covered.length,
  methods: covered,
  semanticHash: EMPIRICAL_METHOD_BASIS_REGISTER.semanticHash,
}, null, 2));

function get(methodId) {
  const row = EMPIRICAL_METHOD_BASIS_REGISTER.methods
    .find((candidate) => candidate.methodId === methodId);
  assert.ok(row, `missing method basis for ${methodId}`);
  return row;
}
