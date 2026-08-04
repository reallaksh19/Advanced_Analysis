#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
  createLafeaBucket01CodeBasis,
  validateLafeaBucket01CodeBasis,
} from '../src/workspace/lafea-bucket-01-code-basis.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = path.join(ROOT, 'validation/bucket-01/09-code-basis-intake-template.json');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_CODE_BASIS_CONTRACT_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-code-basis-contract.json',
);
const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

validateUnresolvedTemplate(template);
const validInput = syntheticApprovedInput();
const packageValue = createLafeaBucket01CodeBasis(validInput);
assert.equal(validateLafeaBucket01CodeBasis(packageValue).ok, true);
assert.equal(packageValue.status, 'CODE_BASIS_FROZEN');
assert.equal(packageValue.producerRevision, 'B01-CODE-BASIS.2');
assert.equal(packageValue.authorityBoundary.codeAssessmentPerformed, false);
assert.equal(packageValue.authorityBoundary.codeVerified, false);
assert.equal(packageValue.authorityBoundary.bucketQualified, false);

assertRejected(
  { ...validInput, authority: { ...validInput.authority, approvalStatus: 'UNAPPROVED' } },
  'LAFEA_B01_CODE_BASIS_APPROVAL_REQUIRED',
);
assertRejected(
  { ...validInput, governingCode: { ...validInput.governingCode, edition: '' } },
  'LAFEA_B01_CODE_BASIS_TEXT_REQUIRED',
);
assertRejected(
  { ...validInput, allowable: { ...validInput.allowable, value: 0 } },
  'LAFEA_B01_CODE_BASIS_POSITIVE_REQUIRED',
);
assertRejected(
  {
    ...validInput,
    stressClassification: {
      ...validInput.stressClassification,
      extractionAuthority: 'MOVING_MAXIMUM',
    },
  },
  'LAFEA_B01_CODE_BASIS_EXTRACTION_AUTHORITY_INVALID',
);
assertRejected(
  {
    ...validInput,
    stressClassification: {
      ...validInput.stressClassification,
      extractionAuthority: 'RETAINED_INTEGRATION_POINT_FIXED_PROBES_AND_PATHS',
    },
  },
  'LAFEA_B01_CODE_BASIS_EXTRACTION_AUTHORITY_INVALID',
);
assertRejected(
  {
    ...validInput,
    loadCombination: {
      ...validInput.loadCombination,
      terms: validInput.loadCombination.terms.map((row) => ({ ...row, factor: 0 })),
    },
  },
  'LAFEA_B01_CODE_BASIS_ZERO_LOAD_COMBINATION',
);
const tampered = structuredClone(packageValue);
tampered.allowable.value += 1;
assert.equal(validateLafeaBucket01CodeBasis(tampered).ok, false);

const reportBase = {
  schema: 'lafea-bucket-01-code-basis-contract-evidence/v2',
  producerRevision: 'B01-CODE-BASIS-CONTRACT.2',
  templateHash: canonicalLafeaSha256(template),
  templateStatus: template.status,
  syntheticFixtureSemanticHash: packageValue.semanticHash,
  requiredExtractionAuthority: 'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS',
  rejectionCases: [
    'UNAPPROVED_AUTHORITY', 'MISSING_EDITION', 'NONPOSITIVE_ALLOWABLE',
    'MOVING_MAXIMUM_EXTRACTION', 'INTEGRATION_POINT_EXTRACTION',
    'ZERO_LOAD_COMBINATION', 'TAMPERED_PACKAGE',
  ],
  authority: {
    contractImplemented: true,
    directFixedPointStressRequired: true,
    integrationPointExtrapolationAuthorized: false,
    committedCodeBasisResolved: false,
    syntheticFixtureEligibleForEngineeringUse: false,
    governingCodeSelectedByRepository: false,
    codeAssessmentPerformed: false,
    codeVerified: false,
    bucketQualified: false,
  },
  status: 'CONTRACT_PASS_CODE_BASIS_UNRESOLVED',
};
const report = { ...reportBase, evidenceHash: canonicalLafeaSha256(reportBase) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function validateUnresolvedTemplate(value) {
  assert.equal(value.schema, 'lafea-bucket-01-code-basis-intake-template/v1');
  assert.equal(value.status, 'UNRESOLVED_GATE');
  assert.equal(value.benchmarkId, 'C2D-LUG-PINHOLE-01');
  assert.equal(value.requiredFields.governingCode.documentId, null);
  assert.equal(value.requiredFields.governingCode.edition, null);
  assert.equal(value.requiredFields.allowable.value, null);
  assert.deepEqual(value.requiredFields.stressClassification.locationIds, []);
  assert.equal(
    value.requiredFields.stressClassification.extractionAuthority,
    'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS',
  );
  assert.deepEqual(value.requiredFields.loadCombination.terms, []);
  assert.equal(value.requiredFields.authority.approvalStatus, 'UNAPPROVED');
  assert.equal(value.requiredFields.authority.approvalRecordHash, null);
}

function syntheticApprovedInput() {
  return {
    schema: LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
    basisId: 'SYNTHETIC-CONTRACT-FIXTURE-NOT-FOR-ENGINEERING',
    exactHeadSha: 'a'.repeat(40),
    benchmarkId: 'C2D-LUG-PINHOLE-01',
    target: 'C2D-LUG-PINHOLE -> LAFEA.3',
    probeSpecHash: `sha256:${'b'.repeat(64)}`,
    governingCode: {
      organization: 'TEST-ONLY', documentId: 'SYNTHETIC-CODE',
      title: 'Contract Fixture', edition: 'TEST-EDITION', addenda: null,
      jurisdiction: 'TEST-ONLY', sourceDocumentHash: `sha256:${'c'.repeat(64)}`,
    },
    allowable: {
      allowableId: 'SYNTHETIC-ALLOWABLE', value: 100, units: 'MPa',
      temperature: 20, temperatureUnits: 'degC', materialScope: 'TEST-MATERIAL',
      sourceSection: 'TEST-SECTION', sourceTable: null, interpolationPolicy: 'NONE',
    },
    stressClassification: {
      classificationId: 'SYNTHETIC-CLASSIFICATION',
      method: 'TEST-ONLY-FIXED-LOCATION-CLASSIFICATION',
      sourceSection: 'TEST-SECTION',
      locationIds: ['LUG_NEAR_HOLE_PMAX', 'LUG_RADIAL_PATH_THETA_67:R47'],
      stressQuantity: 'VON_MISES',
      extractionAuthority: 'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS',
      singularityTreatment: 'EXCLUDE_UNCLASSIFIED_SINGULAR_PEAKS',
    },
    loadCombination: {
      combinationId: 'SYNTHETIC-COMBINATION', sourceSection: 'TEST-SECTION',
      terms: [{ loadCaseId: 'LC1', factor: 1, role: 'TEST-ONLY' }],
    },
    authority: {
      approvalStatus: 'APPROVED',
      approvalId: 'SYNTHETIC-APPROVAL-NOT-FOR-ENGINEERING',
      authoritySource: 'EXTERNAL_ENGINEERING_AUTHORITY',
      issuer: 'TEST-ONLY', approver: 'SYNTHETIC', approverRole: 'TEST-FIXTURE',
      approvedAt: '2026-08-02T00:00:00.000Z',
      approvalRecordHash: `sha256:${'d'.repeat(64)}`,
    },
  };
}

function assertRejected(input, expectedCode) {
  assert.throws(
    () => createLafeaBucket01CodeBasis(input),
    (error) => error?.code === expectedCode,
  );
}
