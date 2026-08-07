import assert from 'node:assert/strict';
import {
  assertEmpiricalCaseConfigurationsAuthorized,
  assertRequestedLoadCasesAuthorized,
  createNonFeaLoadCaseAuthority,
} from '../src/workspace/project-data/non-fea-load-case-authority.js';

const readyProfile = profile(['HYD', 'EMPTY', 'OPE']);
const authorityA = createNonFeaLoadCaseAuthority(readyProfile);
const authorityB = createNonFeaLoadCaseAuthority(structuredClone(readyProfile));

assert.equal(authorityA.state, 'READY');
assert.deepEqual(authorityA.approvedLoadCases, ['EMPTY', 'OPE', 'HYD']);
assert.equal(authorityA.semanticHash, authorityB.semanticHash, 'load-case authority must be deterministic');
assert.deepEqual(assertRequestedLoadCasesAuthorized(authorityA, ['OPE', 'EMPTY']), ['EMPTY', 'OPE']);
assert.throws(
  () => assertRequestedLoadCasesAuthorized(authorityA, ['OPE', 'STARTUP']),
  (error) => error?.code === 'LOAD_CASE_NOT_PROJECT_DATA_APPROVED',
);

assert.deepEqual(assertEmpiricalCaseConfigurationsAuthorized(authorityA, [
  { loadCaseId: 'W-COLD', weightPrimitiveCaseId: 'EMPTY' },
  { loadCaseId: 'OPERATING', weightPrimitiveCaseId: 'OPE' },
  { loadCaseId: 'THERMAL-ONLY', weightPrimitiveCaseId: null },
]), ['EMPTY', 'OPE']);
assert.throws(
  () => assertEmpiricalCaseConfigurationsAuthorized(authorityA, [
    { loadCaseId: 'BAD', weightPrimitiveCaseId: 'STARTUP' },
  ]),
  (error) => error?.code === 'LOAD_CASE_NOT_PROJECT_DATA_APPROVED',
);

const unapproved = profile(['EMPTY']);
unapproved.loadCalculation.activeLoadCases.approved = false;
const unapprovedAuthority = createNonFeaLoadCaseAuthority(unapproved);
assert.equal(unapprovedAuthority.state, 'BLOCKED');
assert.ok(unapprovedAuthority.blockers.some((row) => row.code === 'ACTIVE_LOAD_CASES_NOT_APPROVED'));
assert.throws(
  () => assertRequestedLoadCasesAuthorized(unapprovedAuthority, ['EMPTY']),
  (error) => error?.code === 'LOAD_CASE_AUTHORITY_NOT_READY',
);

const missingAuthority = createNonFeaLoadCaseAuthority({ revision: 1, loadCalculation: {} });
assert.equal(missingAuthority.state, 'BLOCKED');
assert.ok(missingAuthority.blockers.some((row) => row.code === 'ACTIVE_LOAD_CASES_MISSING'));

const unknownAuthority = createNonFeaLoadCaseAuthority(profile(['EMPTY', 'STARTUP']));
assert.equal(unknownAuthority.state, 'BLOCKED');
assert.ok(unknownAuthority.blockers.some((row) => row.code === 'ACTIVE_LOAD_CASE_UNKNOWN'));

console.log(JSON.stringify({
  check: 'non-fea-load-case-authority',
  status: 'PASS',
  projectDataOwnsCanonicalSet: true,
  canonicalCases: authorityA.approvedLoadCases,
  requestedSubsetEnforced: true,
  empiricalPrimitiveCaseSubsetEnforced: true,
  scenarioCaseIdsRemainMethodSpecific: true,
  nullPrimitiveCaseAllowed: true,
  unapprovedAuthorityBlocked: true,
  unknownCaseBlocked: true,
  deterministic: true,
}, null, 2));

function profile(activeLoadCases) {
  return {
    revision: 11,
    loadCalculation: {
      activeLoadCases: {
        value: activeLoadCases,
        evidence: { source: 'PROJECT-DATA-LOAD-CASE-BASIS', sourceHash: 'fixture' },
        approved: true,
      },
    },
  };
}
