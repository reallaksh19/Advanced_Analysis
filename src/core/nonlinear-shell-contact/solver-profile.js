import {
  SCHEMAS,
  assertArray,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertHash,
  assertId,
  assertString,
  clonePlain,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export const LICENSE_REVIEW_STATUSES = Object.freeze(['REVIEWED', 'UNRESOLVED']);

export const PROVISIONAL_CALCULIX_2_22_PROFILE = Object.freeze({
  schema: SCHEMAS.SOLVER_PROFILE,
  solverId: 'CALCULIX_CCX_2_22_PROVISIONAL',
  solverName: 'CalculiX CrunchiX',
  solverVersion: '2.22',
  sourceRepository: 'https://github.com/Dhondtguido/CalculiX',
  sourceCommit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
  sourceArchiveSha256: null,
  binarySha256: null,
  containerImage: null,
  containerDigest: null,
  operatingSystem: null,
  architecture: null,
  compilerName: null,
  compilerVersion: null,
  linkedLibraryManifestHash: null,
  threadCount: 1,
  environmentAllowlist: ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'TZ', 'LANG', 'LC_ALL'],
  licenseId: 'GPL-2.0-only',
  licenseReviewStatus: 'UNRESOLVED',
});

export function createSolverProfile(input) {
  assertExactKeys(input, [
    'schema',
    'solverId',
    'solverName',
    'solverVersion',
    'sourceRepository',
    'sourceCommit',
    'sourceArchiveSha256',
    'binarySha256',
    'containerImage',
    'containerDigest',
    'operatingSystem',
    'architecture',
    'compilerName',
    'compilerVersion',
    'linkedLibraryManifestHash',
    'threadCount',
    'environmentAllowlist',
    'licenseId',
    'licenseReviewStatus',
  ], 'solverProfileInput', ['solverProfileSemanticHash']);
  if (Object.hasOwn(input, 'solverProfileSemanticHash')) {
    throw new TypeError('solverProfileSemanticHash is computed internally.');
  }
  if (input.schema !== SCHEMAS.SOLVER_PROFILE) throw new TypeError('Unknown solver profile schema.');
  assertId(input.solverId, 'solverProfileInput.solverId');
  if (input.solverId === 'CALCULIX_CCX_2_22_PROVISIONAL') {
    if (input.solverName !== 'CalculiX CrunchiX'
        || input.solverVersion !== '2.22'
        || input.sourceCommit !== 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54') {
      throw new TypeError('Provisional CalculiX profile identity has drifted.');
    }
  }
  [
    'solverName',
    'solverVersion',
    'sourceRepository',
    'sourceCommit',
    'licenseId',
  ].forEach((field) => assertString(input[field], `solverProfileInput.${field}`));
  if (!/^https:\/\/github\.com\/Dhondtguido\/CalculiX$/u.test(input.sourceRepository)) {
    throw new TypeError('CalculiX source repository is not the approved provisional source.');
  }
  if (!/^[0-9a-f]{40}$/u.test(input.sourceCommit)) {
    throw new TypeError('sourceCommit must be an exact 40-character Git SHA.');
  }
  assertEnum(input.licenseReviewStatus, LICENSE_REVIEW_STATUSES, 'solverProfileInput.licenseReviewStatus');
  assertFiniteNumber(
    input.threadCount,
    'solverProfileInput.threadCount',
    (v) => Number.isInteger(v) && v === 1,
    'single-thread integer',
  );
  assertArray(input.environmentAllowlist, 'solverProfileInput.environmentAllowlist');
  const environmentAllowlist = [...new Set(input.environmentAllowlist)].sort();
  environmentAllowlist.forEach((name) => {
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(name)) {
      throw new TypeError(`Invalid environment allowlist entry ${name}.`);
    }
  });

  const custodyFields = [
    'sourceArchiveSha256',
    'binarySha256',
    'containerDigest',
    'linkedLibraryManifestHash',
  ];
  custodyFields.forEach((field) => assertHash(input[field], `solverProfileInput.${field}`, {
    nullable: input.licenseReviewStatus === 'UNRESOLVED',
  }));
  const nullableStrings = [
    'containerImage',
    'operatingSystem',
    'architecture',
    'compilerName',
    'compilerVersion',
  ];
  nullableStrings.forEach((field) => {
    if (input[field] !== null) assertString(input[field], `solverProfileInput.${field}`);
  });

  if (input.licenseReviewStatus === 'REVIEWED') {
    custodyFields.forEach((field) => {
      if (input[field] === null) throw new TypeError(`${field} is required for a reviewed profile.`);
    });
    nullableStrings.forEach((field) => {
      if (input[field] === null) throw new TypeError(`${field} is required for a reviewed profile.`);
    });
  }

  return sealWithHash({
    schema: SCHEMAS.SOLVER_PROFILE,
    solverId: input.solverId,
    solverName: input.solverName,
    solverVersion: input.solverVersion,
    sourceRepository: input.sourceRepository,
    sourceCommit: input.sourceCommit,
    sourceArchiveSha256: input.sourceArchiveSha256,
    binarySha256: input.binarySha256,
    containerImage: input.containerImage,
    containerDigest: input.containerDigest,
    operatingSystem: input.operatingSystem,
    architecture: input.architecture,
    compilerName: input.compilerName,
    compilerVersion: input.compilerVersion,
    linkedLibraryManifestHash: input.linkedLibraryManifestHash,
    threadCount: 1,
    environmentAllowlist,
    licenseId: input.licenseId,
    licenseReviewStatus: input.licenseReviewStatus,
  }, 'solverProfileSemanticHash');
}

export function validateSolverProfile(profile, { requireApproved = false } = {}) {
  verifySealedHash(profile, 'solverProfileSemanticHash', 'solverProfile');
  const copy = clonePlain(profile);
  delete copy.solverProfileSemanticHash;
  const rebuilt = createSolverProfile(copy);
  if (rebuilt.solverProfileSemanticHash !== profile.solverProfileSemanticHash) {
    throw new TypeError('Solver profile semantics are not canonical.');
  }
  if (requireApproved && profile.licenseReviewStatus !== 'REVIEWED') {
    throw new TypeError('Solver license review remains unresolved.');
  }
  if (requireApproved && [
    profile.sourceArchiveSha256,
    profile.binarySha256,
    profile.containerDigest,
    profile.linkedLibraryManifestHash,
  ].some((value) => value === null)) {
    throw new TypeError('Approved solver profile lacks complete custody hashes.');
  }
  return true;
}

export function isApprovedSolverProfile(profile) {
  try {
    validateSolverProfile(profile, { requireApproved: true });
    return true;
  } catch {
    return false;
  }
}
