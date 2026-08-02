import { exactKeys } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failQualification } from './contracts.js';
import {
  canonicalArtifactReference,
  requireHash,
  requireHead,
} from './external-evidence-contracts.js';
import {
  requireLinearPipingExternalQualificationPackage,
} from './external-evidence-package.js';
import {
  requireApprovedProjectAuthorityIndex,
} from './project-authority-index.js';

export const PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA =
  'linear-piping-project-authority-bound-external-package-request/v1';
export const PROJECT_AUTHORITY_BOUND_PACKAGE_SCHEMA =
  'linear-piping-project-authority-bound-external-package/v1';
export const PROJECT_AUTHORITY_BOUND_PACKAGE_STATUS =
  'ELIGIBLE_FOR_PHASE6G_ASSEMBLY';

const INPUT_KEYS = Object.freeze([
  'schema',
  'externalPackage',
  'projectAuthorityIndexArtifact',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema',
  'packageId',
  'exactHead',
  'externalPackage',
  'projectAuthorityIndexArtifact',
  'status',
  'semanticHash',
  'evidenceHash',
]);

export function compileProjectAuthorityBoundExternalPackage(
  input,
  { packageValidator = requireLinearPipingExternalQualificationPackage } = {},
) {
  exactKeys(input, INPUT_KEYS, 'projectAuthorityBoundPackageInput');
  if (input.schema !== PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA) {
    failQualification(
      'Project-authority package request is invalid.',
      'PIPING_PROJECT_AUTHORITY_PACKAGE_REQUEST_INVALID',
    );
  }
  const externalPackage = packageValidator(input.externalPackage);
  const projectAuthorityIndex = requireApprovedProjectAuthorityIndex(
    externalPackage.projectAuthorityIndex,
  );
  requireCandidateHead(projectAuthorityIndex, externalPackage.exactHead);
  const projectAuthorityIndexArtifact = requireAuthorityArtifact(
    input.projectAuthorityIndexArtifact,
    projectAuthorityIndex,
    externalPackage,
  );
  const draft = {
    schema: PROJECT_AUTHORITY_BOUND_PACKAGE_SCHEMA,
    packageId: externalPackage.packageId,
    exactHead: externalPackage.exactHead,
    externalPackage,
    projectAuthorityIndexArtifact,
    status: PROJECT_AUTHORITY_BOUND_PACKAGE_STATUS,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(
    projectAuthorityBoundPackageSemanticProjection(draft),
  );
  draft.evidenceHash = computeProjectAuthorityBoundPackageEvidenceHash(draft);
  return requireProjectAuthorityBoundExternalPackage(draft, { packageValidator });
}

export function requireProjectAuthorityBoundExternalPackage(
  record,
  { packageValidator = requireLinearPipingExternalQualificationPackage } = {},
) {
  exactKeys(record, OUTPUT_KEYS, 'projectAuthorityBoundPackage');
  if (record.schema !== PROJECT_AUTHORITY_BOUND_PACKAGE_SCHEMA
    || record.status !== PROJECT_AUTHORITY_BOUND_PACKAGE_STATUS) {
    failQualification(
      'Project-authority-bound external package is invalid.',
      'PIPING_PROJECT_AUTHORITY_PACKAGE_INVALID',
    );
  }
  const exactHead = requireHead(record.exactHead, 'projectAuthorityBoundPackage.exactHead');
  requireHash(record.semanticHash, 'projectAuthorityBoundPackage.semanticHash');
  requireHash(record.evidenceHash, 'projectAuthorityBoundPackage.evidenceHash');
  const externalPackage = packageValidator(record.externalPackage);
  if (record.packageId !== externalPackage.packageId
    || exactHead !== externalPackage.exactHead) {
    failQualification(
      'Project-authority package identity is stale.',
      'PIPING_PROJECT_AUTHORITY_PACKAGE_IDENTITY_MISMATCH',
    );
  }
  const projectAuthorityIndex = requireApprovedProjectAuthorityIndex(
    externalPackage.projectAuthorityIndex,
  );
  requireCandidateHead(projectAuthorityIndex, exactHead);
  const projectAuthorityIndexArtifact = requireAuthorityArtifact(
    record.projectAuthorityIndexArtifact,
    projectAuthorityIndex,
    externalPackage,
  );
  const accepted = {
    ...record,
    externalPackage,
    projectAuthorityIndexArtifact,
  };
  if (record.semanticHash !== semanticHash(
    projectAuthorityBoundPackageSemanticProjection(accepted),
  ) || record.evidenceHash !== computeProjectAuthorityBoundPackageEvidenceHash(accepted)) {
    failQualification(
      'Project-authority package hashes are stale.',
      'PIPING_PROJECT_AUTHORITY_PACKAGE_HASH_MISMATCH',
    );
  }
  return deepFreeze(accepted);
}

export function projectAuthorityBoundPackageSemanticProjection(record) {
  return {
    schema: record.schema,
    packageId: record.packageId,
    exactHead: record.exactHead,
    externalPackageSemanticHash: record.externalPackage.semanticHash,
    projectAuthorityIndexSemanticHash:
      record.externalPackage.projectAuthorityIndex.semanticHash,
    projectAuthorityIndexArtifact: record.projectAuthorityIndexArtifact,
    status: record.status,
  };
}

export function computeProjectAuthorityBoundPackageEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    externalPackageEvidenceHash: record.externalPackage.evidenceHash,
    projectAuthorityIndexEvidenceHash:
      record.externalPackage.projectAuthorityIndex.evidenceHash,
    projectAuthorityIndexArtifactContentHash:
      record.projectAuthorityIndexArtifact.contentHash,
  });
}

function requireCandidateHead(projectAuthorityIndex, exactHead) {
  if (projectAuthorityIndex.candidate.sha !== exactHead) {
    failQualification(
      'Project Authority Index is bound to a different candidate head.',
      'PIPING_PROJECT_AUTHORITY_HEAD_MISMATCH',
      {
        packageHead: exactHead,
        authorityCandidate: projectAuthorityIndex.candidate.sha,
      },
    );
  }
}

function requireAuthorityArtifact(source, projectAuthorityIndex, externalPackage) {
  const reference = canonicalArtifactReference(
    source,
    'projectAuthorityBoundPackage.projectAuthorityIndexArtifact',
  );
  if (reference.recordSemanticHash !== projectAuthorityIndex.semanticHash
    || reference.recordEvidenceHash !== projectAuthorityIndex.evidenceHash
    || reference.contentHash !== semanticHash(projectAuthorityIndex)) {
    failQualification(
      'Project Authority Index artifact does not match the approved record.',
      'PIPING_PROJECT_AUTHORITY_ARTIFACT_MISMATCH',
    );
  }
  const existingPaths = Object.values(externalPackage.artifactReferences)
    .map((entry) => entry.path.toLowerCase());
  if (existingPaths.includes(reference.path.toLowerCase())) {
    failQualification(
      'Project Authority Index artifact path collides with external evidence.',
      'PIPING_PROJECT_AUTHORITY_ARTIFACT_PATH_DUPLICATE',
    );
  }
  return reference;
}
