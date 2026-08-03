import path from 'node:path';
import { nonFeaFailure, codeUnitCompare } from './contracts.mjs';
import { NON_FEA_REQUIRED_FIXTURE_ROLES } from './runner-options.mjs';

export function resolveNonFeaFixtureRoleBindings(configuredRoles, fixtureLedger) {
  const bindings = [];
  const failures = [];
  for (const role of NON_FEA_REQUIRED_FIXTURE_ROLES) {
    const configuredPath = configuredRoles[role] || null;
    const normalizedPath = configuredPath ? normalizeRepositoryPath(configuredPath) : null;
    const fixture = normalizedPath ? fixtureLedger.find((row) => row.path === normalizedPath) : null;
    if (!configuredPath || !fixture || fixture.status !== 'PRESENT' || !fixture.sourceSha256) {
      bindings.push({
        role,
        path: normalizedPath,
        sourceSha256: fixture?.sourceSha256 || null,
        expectedIdentity: fixture?.expectedIdentity || {},
        status: 'MISSING_AUTHORITY',
      });
      failures.push(nonFeaFailure({
        classification: 'MISSING_AUTHORITY',
        code: 'P0_FIXTURE_ROLE_UNRESOLVED',
        message: `Required P0 fixture role is unresolved: ${role}.`,
        details: { role, configuredPath: normalizedPath },
      }));
      continue;
    }
    bindings.push({
      role,
      path: fixture.path,
      sourceSha256: fixture.sourceSha256,
      expectedIdentity: fixture.expectedIdentity,
      status: 'BOUND',
    });
  }
  return Object.freeze({
    bindings: Object.freeze(bindings.sort((left, right) => codeUnitCompare(left.role, right.role))),
    failures: Object.freeze(failures),
  });
}

function normalizeRepositoryPath(value) { return value.split(path.sep).join('/'); }
