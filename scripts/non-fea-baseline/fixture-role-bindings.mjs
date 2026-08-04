import {
  NON_FEA_FIXTURE_AUTHORITIES,
  nonFeaFixtureAuthority,
} from './fixture-authority-manifest.mjs';
import { nonFeaFailure } from './contracts.mjs';

export function resolveNonFeaFixtureRoleBindings(cliBindings, fixtureLedger, fixtureRuns = []) {
  const byPath = new Map(fixtureLedger.map((row) => [row.path, row]));
  const coldRunByPath = new Map(fixtureRuns
    .filter((row) => row.sampleKind === 'COLD')
    .map((row) => [row.fixturePath, row]));
  const failures = [];
  const bindings = NON_FEA_FIXTURE_AUTHORITIES.map((authority) => {
    const explicitPath = cliBindings[authority.role] ?? null;
    const path = explicitPath ?? authority.defaultPath;
    const ledger = path ? byPath.get(path) ?? null : null;
    const run = path ? coldRunByPath.get(path) ?? null : null;
    const disposition = evaluateBinding({ authority, path, ledger, run, failures });
    return Object.freeze({
      role: authority.role,
      sourceKind: authority.sourceKind,
      path,
      bindingSource: explicitPath ? 'CLI_OVERRIDE' : authority.defaultPath ? 'AUTHORITY_DEFAULT' : 'UNBOUND',
      status: disposition,
      sourceSha256: ledger?.sourceSha256 ?? null,
      expectedSourceSha256: authority.expectedSourceSha256,
      actualIdentity: run?.identity ?? ledger?.expectedIdentity ?? {},
      expectedIdentity: authority.expectedIdentity,
      authoritySource: authority.authoritySource,
    });
  });
  return Object.freeze({ bindings: Object.freeze(bindings), failures: Object.freeze(failures) });
}

function evaluateBinding({ authority, path, ledger, run, failures }) {
  if (!path) {
    failures.push(failure('MISSING_AUTHORITY', 'P0_FIXTURE_AUTHORITY_UNBOUND',
      `Fixture role ${authority.role} requires an explicit content-addressed path.`, authority, { path: null }));
    return 'UNBOUND';
  }
  if (!ledger || ledger.status !== 'PRESENT') {
    failures.push(failure('MISSING_AUTHORITY', 'P0_BOUND_FIXTURE_MISSING',
      `Fixture role ${authority.role} points to a missing fixture.`, authority, { path }));
    return 'MISSING';
  }
  if (!run) {
    failures.push(failure('UNRESOLVED_GATE', 'P0_BOUND_FIXTURE_NOT_EXECUTED',
      `Fixture role ${authority.role} was not executed by the baseline runner.`, authority, { path }));
    return 'NOT_EXECUTED';
  }
  if (authority.expectedSourceSha256 === null) {
    failures.push(failure('UNRESOLVED_GATE', 'P0_FIXTURE_SHA_EXPECTATION_MISSING',
      `Fixture role ${authority.role} has captured bytes but no Owner-accepted SHA-256 yet.`, authority,
      { path, capturedSourceSha256: ledger.sourceSha256 }));
    return 'CAPTURED_PENDING_OWNER_ACCEPTANCE';
  }
  if (ledger.sourceSha256 !== authority.expectedSourceSha256) {
    failures.push(failure('REGRESSION', 'P0_FIXTURE_AUTHORITY_SHA_MISMATCH',
      `Fixture role ${authority.role} does not match its accepted source SHA-256.`, authority,
      { path, expected: authority.expectedSourceSha256, actual: ledger.sourceSha256 }));
    return 'MISMATCH';
  }
  const identityMismatches = compareIdentity(authority.expectedIdentity, run.identity ?? {});
  if (identityMismatches.length) {
    failures.push(failure('REGRESSION', 'P0_FIXTURE_AUTHORITY_IDENTITY_MISMATCH',
      `Fixture role ${authority.role} does not match its accepted production identity.`, authority,
      { path, mismatches: identityMismatches }));
    return 'MISMATCH';
  }
  return 'VERIFIED';
}

function compareIdentity(expected, actual) {
  return Object.entries(expected).flatMap(([key, expectedValue]) => (
    actual[key] === expectedValue ? [] : [{ key, expected: expectedValue, actual: actual[key] ?? null }]
  ));
}

function failure(classification, code, message, authority, details) {
  return nonFeaFailure({
    classification,
    code,
    message,
    details: { role: authority.role, authoritySource: authority.authoritySource, ...details },
  });
}

export function requiredNonFeaFixtureRoles() {
  return NON_FEA_FIXTURE_AUTHORITIES.map((row) => row.role);
}

export { nonFeaFixtureAuthority };
