import {
  SCHEMAS,
  assertArray,
  assertEnum,
  assertExactKeys,
  assertGitSha,
  assertHash,
  assertString,
  clonePlain,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';
import { createAuthorityTable, validateAuthorityTable } from './authority.js';

export const NC00_STATUSES = Object.freeze([
  'NC00_CONTRACTS_ONLY',
  'NC00_SOLVER_BRIDGE_QUALIFIED',
  'NC00_BLOCKED',
  'NC00_FAILED',
]);

export function createNc00Report(input) {
  assertExactKeys(input, [
    'schema',
    'status',
    'exactHeadSha',
    'baseSha',
    'branch',
    'solverProfileHash',
    'deckProfileHash',
    'fixtureResults',
    'negativeControlResults',
    'independentCheckerResults',
    'deterministicReplayResults',
    'changedPaths',
    'authority',
    'limitations',
  ], 'nc00ReportInput', ['semanticHash']);
  if (Object.hasOwn(input, 'semanticHash')) throw new TypeError('Report semanticHash is computed internally.');
  if (input.schema !== SCHEMAS.NC00_REPORT) throw new TypeError('Unknown NC-00 report schema.');
  assertEnum(input.status, NC00_STATUSES, 'nc00ReportInput.status');
  assertGitSha(input.exactHeadSha, 'nc00ReportInput.exactHeadSha');
  assertGitSha(input.baseSha, 'nc00ReportInput.baseSha');
  assertString(input.branch, 'nc00ReportInput.branch');
  assertHash(input.solverProfileHash, 'nc00ReportInput.solverProfileHash');
  assertHash(input.deckProfileHash, 'nc00ReportInput.deckProfileHash');
  ['fixtureResults', 'negativeControlResults', 'changedPaths', 'limitations'].forEach((field) => {
    assertArray(input[field], `nc00ReportInput.${field}`);
  });
  validateAuthorityTable(input.authority);
  validateReportStatus(input);
  return sealWithHash({
    schema: SCHEMAS.NC00_REPORT,
    status: input.status,
    exactHeadSha: input.exactHeadSha,
    baseSha: input.baseSha,
    branch: input.branch,
    solverProfileHash: input.solverProfileHash,
    deckProfileHash: input.deckProfileHash,
    fixtureResults: clonePlain(input.fixtureResults),
    negativeControlResults: clonePlain(input.negativeControlResults),
    independentCheckerResults: clonePlain(input.independentCheckerResults),
    deterministicReplayResults: clonePlain(input.deterministicReplayResults),
    changedPaths: [...input.changedPaths].sort(),
    authority: clonePlain(input.authority),
    limitations: [...new Set(input.limitations)].sort(),
  }, 'semanticHash');
}

export function validateNc00Report(report) {
  verifySealedHash(report, 'semanticHash', 'nc00Report');
  validateAuthorityTable(report.authority);
  validateReportStatus(report);
  return true;
}

function validateReportStatus(input) {
  const fixturesPass = input.fixtureResults.every((row) => row.status === 'PASS');
  const controlsPass = input.negativeControlResults.every((row) => row.status === 'PASS');
  const independentPass = input.independentCheckerResults.status === 'PASS';
  const replayPass = input.deterministicReplayResults.status === 'PASS';
  if (input.status === 'NC00_SOLVER_BRIDGE_QUALIFIED') {
    if (!fixturesPass || !controlsPass || !independentPass || !replayPass) {
      throw new TypeError('Qualified NC-00 report contains failed evidence.');
    }
    const requiredAuthority = createAuthorityTable({
      contractQualified: true,
      solverBridgeQualified: true,
      nc01Authorized: true,
    });
    if (JSON.stringify(input.authority) !== JSON.stringify(requiredAuthority)) {
      throw new TypeError('Qualified NC-00 report has a conflicting authority table.');
    }
  } else if (input.authority.solverBridgeQualified || input.authority.nc01Authorized) {
    throw new TypeError('Nonqualified NC-00 report cannot authorize the solver bridge or NC-01.');
  }
}
