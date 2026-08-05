import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  assertArray,
  assertBoolean,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertGitSha,
  assertHash,
  assertId,
  assertPlainData,
  assertRelativePath,
  assertString,
  clonePlain,
  deepFreeze,
  semanticHash,
  sha256Bytes,
  verifySealedHash,
} from './contracts.js';

export const SOLVER_CUSTODY_EVIDENCE_SCHEMA =
  'nonlinear-shell-contact-solver-custody-evidence/v1';

export const REQUIRED_SOLVER_CUSTODY_EVIDENCE = Object.freeze([
  'SOURCE_ARCHIVE',
  'EXECUTABLE_BINARY',
  'CONTAINER_RECORD',
  'BUILD_RECORD',
  'PLATFORM_RECORD',
  'LINKED_LIBRARIES_RECORD',
  'THREAD_POLICY_RECORD',
  'LICENSE_RECORD',
]);

export const EXPECTED_SOLVER_IDENTITY = deepFreeze({
  solverId: 'CALCULIX.CCX.2.22',
  solverFamily: 'CALCULIX_CRUNCHIX',
  solverVersion: '2.22',
  sourceRepository: 'https://github.com/Dhondtguido/CalculiX',
  sourceCommit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
});

const RECORD_EVIDENCE_IDS = new Set([
  'CONTAINER_RECORD',
  'BUILD_RECORD',
  'PLATFORM_RECORD',
  'LINKED_LIBRARIES_RECORD',
  'THREAD_POLICY_RECORD',
  'LICENSE_RECORD',
]);
const ZERO_HASH = `sha256:${'0'.repeat(64)}`;

export function validateSolverCustodyInventory(value) {
  assertPlainData(value, '$solverCustodyInventory');
  assertExactKeys(
    value,
    ['schema', 'solver', 'evidence', 'qualificationRequested', 'inventoryHash'],
    '$solverCustodyInventory',
  );
  assertEnum(value.schema, [SOLVER_CUSTODY_EVIDENCE_SCHEMA], '$solverCustodyInventory.schema');
  validateSolverIdentity(value.solver);
  assertBoolean(value.qualificationRequested, '$solverCustodyInventory.qualificationRequested');
  assertArray(value.evidence, '$solverCustodyInventory.evidence', {
    min: REQUIRED_SOLVER_CUSTODY_EVIDENCE.length,
  });
  if (value.evidence.length !== REQUIRED_SOLVER_CUSTODY_EVIDENCE.length) {
    throw new TypeError('$solverCustodyInventory.evidence must contain exactly eight entries.');
  }
  const seen = new Set();
  value.evidence.forEach((entry, index) => {
    validateEvidenceEntry(entry, index);
    if (seen.has(entry.id)) {
      throw new TypeError(`$solverCustodyInventory.evidence contains duplicate ${entry.id}.`);
    }
    seen.add(entry.id);
    if (entry.id !== REQUIRED_SOLVER_CUSTODY_EVIDENCE[index]) {
      throw new TypeError('$solverCustodyInventory.evidence must use the governed canonical order.');
    }
  });
  for (const id of REQUIRED_SOLVER_CUSTODY_EVIDENCE) {
    if (!seen.has(id)) throw new TypeError(`$solverCustodyInventory.evidence is missing ${id}.`);
  }
  verifySealedHash(value, 'inventoryHash', '$solverCustodyInventory');
  return true;
}

export function sealSolverCustodyInventory(input) {
  const clean = clonePlain(input);
  delete clean.inventoryHash;
  return deepFreeze({ ...clean, inventoryHash: semanticHash(clean) });
}

export async function evaluateSolverCustody({ inventory, rootDir }) {
  validateSolverCustodyInventory(inventory);
  assertString(rootDir, '$rootDir');
  const blockers = [];
  const verifiedEvidence = [];
  const missingEvidence = [];
  const root = await realpath(rootDir);

  for (const entry of inventory.evidence) {
    if (entry.status === 'MISSING') {
      missingEvidence.push(entry.id);
      blockers.push(`EVIDENCE_MISSING:${entry.id}`);
      continue;
    }
    try {
      const evidencePath = await resolveEvidencePath(root, entry.path);
      const bytes = await readFile(evidencePath);
      if (bytes.length === 0) throw new TypeError('evidence file is empty');
      const actualHash = sha256Bytes(bytes);
      if (actualHash !== entry.sha256) {
        throw new TypeError(`hash mismatch: expected ${entry.sha256}, received ${actualHash}`);
      }
      if (RECORD_EVIDENCE_IDS.has(entry.id)) {
        const record = parseJsonRecord(bytes, entry.id);
        await validateSemanticRecord(entry.id, record, inventory.solver, root);
      }
      verifiedEvidence.push({
        id: entry.id,
        path: entry.path,
        sha256: entry.sha256,
        mediaType: entry.mediaType,
      });
    } catch (error) {
      blockers.push(`EVIDENCE_INVALID:${entry.id}:${error.message}`);
    }
  }

  if (inventory.qualificationRequested !== true) blockers.push('QUALIFICATION_NOT_REQUESTED');
  const solverCustodyQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-solver-custody-report/v1',
    status: solverCustodyQualified ? 'SOLVER_CUSTODY_QUALIFIED' : 'SOLVER_CUSTODY_BLOCKED',
    solver: clonePlain(inventory.solver),
    inventoryHash: inventory.inventoryHash,
    requiredEvidenceCount: REQUIRED_SOLVER_CUSTODY_EVIDENCE.length,
    verifiedEvidenceCount: verifiedEvidence.length,
    verifiedEvidence: verifiedEvidence.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    missingEvidence: [...missingEvidence].sort(),
    blockers: [...blockers].sort(),
    authority: {
      solverCustodyQualified,
      solverBridgeQualified: false,
      shellFormulationQualified: false,
      contactProcedureQualified: false,
      codeAssessmentQualified: false,
      moduleQualified: false,
      productionExecutionAuthorized: false,
      mergeAuthorized: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

function validateSolverIdentity(value) {
  assertExactKeys(
    value,
    ['solverId', 'solverFamily', 'solverVersion', 'sourceRepository', 'sourceCommit'],
    '$solverCustodyInventory.solver',
  );
  assertId(value.solverId, '$solverCustodyInventory.solver.solverId');
  assertId(value.solverFamily, '$solverCustodyInventory.solver.solverFamily');
  assertString(value.solverVersion, '$solverCustodyInventory.solver.solverVersion');
  assertString(value.sourceRepository, '$solverCustodyInventory.solver.sourceRepository');
  assertGitSha(value.sourceCommit, '$solverCustodyInventory.solver.sourceCommit');
  for (const [field, expected] of Object.entries(EXPECTED_SOLVER_IDENTITY)) {
    if (value[field] !== expected) {
      throw new TypeError(`$solverCustodyInventory.solver.${field} must equal ${expected}.`);
    }
  }
}

function validateEvidenceEntry(value, index) {
  const path = `$solverCustodyInventory.evidence[${index}]`;
  assertExactKeys(value, ['id', 'status', 'path', 'sha256', 'mediaType', 'note'], path);
  assertEnum(value.id, REQUIRED_SOLVER_CUSTODY_EVIDENCE, `${path}.id`);
  assertEnum(value.status, ['MISSING', 'PRESENT'], `${path}.status`);
  assertString(value.note, `${path}.note`);
  if (value.status === 'MISSING') {
    if (value.path !== null || value.sha256 !== null || value.mediaType !== null) {
      throw new TypeError(`${path} missing evidence must use null path, sha256 and mediaType.`);
    }
    return;
  }
  assertRelativePath(value.path, `${path}.path`);
  assertHash(value.sha256, `${path}.sha256`);
  if (value.sha256 === ZERO_HASH) throw new TypeError(`${path}.sha256 must not be a placeholder.`);
  assertString(value.mediaType, `${path}.mediaType`);
}

async function resolveEvidencePath(root, relativePath) {
  assertRelativePath(relativePath, '$evidencePath');
  const candidate = await realpath(resolve(root, relativePath));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new TypeError('evidence path escapes the governed root');
  }
  return candidate;
}

function parseJsonRecord(bytes, id) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    assertPlainData(value, `$${id}`);
    return value;
  } catch (error) {
    throw new TypeError(`record is not valid plain JSON: ${error.message}`);
  }
}

async function validateSemanticRecord(id, record, solver, root) {
  switch (id) {
    case 'CONTAINER_RECORD':
      validateContainerRecord(record);
      await verifyNestedFile(root, record.ociArchivePath, record.ociArchiveHash, '$containerRecord.ociArchive');
      return;
    case 'BUILD_RECORD':
      validateBuildRecord(record, solver);
      await verifyNestedFile(root, record.buildLogPath, record.buildLogHash, '$buildRecord.buildLog');
      return;
    case 'PLATFORM_RECORD':
      validatePlatformRecord(record);
      await verifyNestedFile(root, record.probePath, record.probeHash, '$platformRecord.probe');
      return;
    case 'LINKED_LIBRARIES_RECORD':
      validateLinkedLibrariesRecord(record);
      for (const [index, library] of record.libraries.entries()) {
        await verifyNestedFile(root, library.path, library.binaryHash, `$linkedLibrariesRecord.libraries[${index}]`);
      }
      return;
    case 'THREAD_POLICY_RECORD':
      validateThreadPolicyRecord(record);
      await verifyNestedFile(root, record.probePath, record.probeHash, '$threadPolicyRecord.probe');
      return;
    case 'LICENSE_RECORD':
      validateLicenseRecord(record);
      await verifyNestedFile(root, record.licenseTextPath, record.licenseTextHash, '$licenseRecord.licenseText');
      return;
    default:
      throw new TypeError(`unsupported semantic record ${id}`);
  }
}

async function verifyNestedFile(root, path, expectedHash, label) {
  const resolvedPath = await resolveEvidencePath(root, path);
  const bytes = await readFile(resolvedPath);
  if (bytes.length === 0) throw new TypeError(`${label} is empty`);
  const actualHash = sha256Bytes(bytes);
  if (actualHash !== expectedHash) {
    throw new TypeError(`${label} hash mismatch: expected ${expectedHash}, received ${actualHash}`);
  }
}

function validateContainerRecord(value) {
  assertExactKeys(value, ['image', 'digest', 'platform', 'ociArchivePath', 'ociArchiveHash', 'immutable'], '$containerRecord');
  assertString(value.image, '$containerRecord.image');
  assertHash(value.digest, '$containerRecord.digest');
  assertString(value.platform, '$containerRecord.platform');
  assertRelativePath(value.ociArchivePath, '$containerRecord.ociArchivePath');
  assertHash(value.ociArchiveHash, '$containerRecord.ociArchiveHash');
  assertBoolean(value.immutable, '$containerRecord.immutable');
  if (!value.immutable) throw new TypeError('container record must be immutable');
}

function validateBuildRecord(value, solver) {
  assertExactKeys(
    value,
    ['sourceCommit', 'compilerId', 'compilerVersion', 'compilerFlags', 'buildCommandHash', 'buildLogPath', 'buildLogHash'],
    '$buildRecord',
  );
  assertGitSha(value.sourceCommit, '$buildRecord.sourceCommit');
  if (value.sourceCommit !== solver.sourceCommit) throw new TypeError('build source commit is not bound');
  assertString(value.compilerId, '$buildRecord.compilerId');
  assertString(value.compilerVersion, '$buildRecord.compilerVersion');
  assertArray(value.compilerFlags, '$buildRecord.compilerFlags', { min: 1 });
  value.compilerFlags.forEach((flag, index) => assertString(flag, `$buildRecord.compilerFlags[${index}]`));
  assertHash(value.buildCommandHash, '$buildRecord.buildCommandHash');
  assertRelativePath(value.buildLogPath, '$buildRecord.buildLogPath');
  assertHash(value.buildLogHash, '$buildRecord.buildLogHash');
}

function validatePlatformRecord(value) {
  assertExactKeys(value, ['os', 'architecture', 'libc', 'kernel', 'platformFingerprintHash', 'probePath', 'probeHash'], '$platformRecord');
  for (const field of ['os', 'architecture', 'libc', 'kernel']) assertString(value[field], `$platformRecord.${field}`);
  assertHash(value.platformFingerprintHash, '$platformRecord.platformFingerprintHash');
  assertRelativePath(value.probePath, '$platformRecord.probePath');
  assertHash(value.probeHash, '$platformRecord.probeHash');
}

function validateLinkedLibrariesRecord(value) {
  assertExactKeys(value, ['libraries', 'aggregateHash'], '$linkedLibrariesRecord');
  assertArray(value.libraries, '$linkedLibrariesRecord.libraries', { min: 1 });
  value.libraries.forEach((library, index) => {
    const path = `$linkedLibrariesRecord.libraries[${index}]`;
    assertExactKeys(library, ['name', 'version', 'path', 'binaryHash'], path);
    assertString(library.name, `${path}.name`);
    assertString(library.version, `${path}.version`);
    assertRelativePath(library.path, `${path}.path`);
    assertHash(library.binaryHash, `${path}.binaryHash`);
  });
  assertHash(value.aggregateHash, '$linkedLibrariesRecord.aggregateHash');
  if (value.aggregateHash !== semanticHash(value.libraries)) {
    throw new TypeError('linked-library aggregate hash does not match the library ledger');
  }
}

function validateThreadPolicyRecord(value) {
  assertExactKeys(value, ['threadCount', 'environmentVariables', 'deterministic', 'probePath', 'probeHash'], '$threadPolicyRecord');
  assertFiniteNumber(value.threadCount, '$threadPolicyRecord.threadCount', Number.isInteger, 'integer');
  if (value.threadCount !== 1) throw new TypeError('thread count must be exactly one');
  assertPlainData(value.environmentVariables, '$threadPolicyRecord.environmentVariables');
  if (Array.isArray(value.environmentVariables) || value.environmentVariables === null) {
    throw new TypeError('environmentVariables must be a plain object');
  }
  Object.entries(value.environmentVariables).forEach(([key, entry]) => {
    assertString(key, '$threadPolicyRecord.environmentVariables key');
    assertString(entry, `$threadPolicyRecord.environmentVariables.${key}`);
  });
  assertBoolean(value.deterministic, '$threadPolicyRecord.deterministic');
  if (!value.deterministic) throw new TypeError('thread policy must declare deterministic execution');
  assertRelativePath(value.probePath, '$threadPolicyRecord.probePath');
  assertHash(value.probeHash, '$threadPolicyRecord.probeHash');
}

function validateLicenseRecord(value) {
  assertExactKeys(value, ['spdxId', 'licenseTextPath', 'licenseTextHash', 'sourcePath'], '$licenseRecord');
  assertString(value.spdxId, '$licenseRecord.spdxId');
  assertRelativePath(value.licenseTextPath, '$licenseRecord.licenseTextPath');
  assertHash(value.licenseTextHash, '$licenseRecord.licenseTextHash');
  assertRelativePath(value.sourcePath, '$licenseRecord.sourcePath');
}
