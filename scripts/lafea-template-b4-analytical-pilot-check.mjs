#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture } from './lafea.2-fixtures.mjs';
import {
  createTemplateExecutionRequest,
} from '../src/core/lafea-application-templates/analytical-execution-contract.js';
import {
  createTemplateReleaseRecordV2,
} from '../src/core/lafea-application-templates/release-record-v2.js';
import {
  createTemplateTargetAuthoritySnapshot,
  evaluateTemplateTargetCompatibility,
} from '../src/core/lafea-application-templates/target-compatibility.js';
import {
  ACTION_SENSES,
  COORDINATE_SYSTEMS,
  calculateLocalAttachmentFoundation,
  createCanonicalLocalAttachmentFoundationModel,
} from '../src/core/local-stress/index.js';
import {
  ENVELOPE_QUANTITIES,
  RADIUS_BASES,
  SOURCE_SCHEMA,
} from '../src/core/local-attachment-screening/index.js';
import {
  executeControlledLafeaAnalyticalPilot,
} from '../src/workspace/lafea-template-execution-controller.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from '../src/workspace/lafea-target-compatibility-authority.js';
import { lafeaDocumentDigest } from '../src/workspace/lafea-edit-command.js';
import {
  normalizeLafeaStageDocument,
} from '../src/workspace/lafea-workbench-model.js';

const FNV = 'fnv1a64:0123456789abcdef';
const HEAD = 'ba90311675d5cdbe91a267434fbd47e31f7e2609';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let antiDriftCount = 0;

sourceGuards();

const foundationDocument = normalizeLafeaStageDocument(
  'LAFEA.1', sourceFixture(),
);
const foundationAuthority = authorityPackage(
  'ALG-LOAD-REFERENCE-TRANSFER',
  'LAFEA.1',
  foundationDocument,
);
const foundationResult = executeControlledLafeaAnalyticalPilot({
  ...foundationAuthority,
  document: foundationDocument,
  productInput: foundationProductInput(),
});
assert.equal(foundationResult.status, 'ACCEPTED');
assert.equal(foundationResult.receipt.calculationAccepted, true);
assert.equal(foundationResult.receipt.resultReady, true);
assert.equal(foundationResult.receipt.assessmentApplicability, 'NOT_APPLICABLE');
assert.equal(foundationResult.receipt.assessmentReady, false);
assert.equal(foundationResult.receipt.codeReady, false);
assert.equal(foundationResult.receipt.releaseQualified, false);
assert.equal(foundationResult.lifecycle.artifacts.FOUNDATION_DISTRIBUTION.qualification, 'PASS');

const transferred = foundationResult.execution.result.transformedLoadCases[0];
assert.deepEqual(transferred.transformedForceGlobal, [1000, 0, 0]);
assert.deepEqual(transferred.transformedMomentGlobal, [0, 1_000_000, 0]);
assert.deepEqual(transferred.forceResidualGlobal, [0, 0, 0]);
assert.deepEqual(transferred.momentResidualGlobal, [0, 0, 0]);

const exactScreening = exactCombinedSectionSource();
const screeningDocument = normalizeLafeaStageDocument('LAFEA.2', exactScreening.raw);
const screeningAuthority = authorityPackage(
  'ALG-PIPE-SECTION-COMBINED',
  'LAFEA.2',
  screeningDocument,
);
const screeningResult = executeControlledLafeaAnalyticalPilot({
  ...screeningAuthority,
  document: screeningDocument,
  productInput: exactScreening.productInput,
});
assert.equal(screeningResult.status, 'ACCEPTED');
assert.equal(screeningResult.receipt.resultReady, true);
assert.equal(screeningResult.receipt.assessmentApplicability, 'APPLICABLE');
assert.equal(screeningResult.receipt.assessmentReady, true);
assert.equal(screeningResult.receipt.codeReady, false);
assert.equal(screeningResult.receipt.releaseQualified, false);
assert.equal(screeningResult.lifecycle.artifacts.SCREENING_ASSESSMENT.qualification, 'PASS');

const section = screeningResult.execution.result.sectionProperties;
approx(section.crossSectionArea, exactScreening.expected.area, 1e-10, 1e-8);
approx(section.secondMomentY, exactScreening.expected.inertia, 1e-10, 1e-7);
approx(section.secondMomentZ, exactScreening.expected.inertia, 1e-10, 1e-7);
approx(section.polarMoment, exactScreening.expected.polar, 1e-10, 1e-7);
const point = screeningResult.execution.result.pointStressStates[0];
approx(point.mechanicalStress.sigmaXAxialMembrane, 100, 1e-10, 1e-8);
approx(point.mechanicalStress.sigmaXBiaxialBending, 100, 1e-10, 1e-8);
approx(point.mechanicalStress.tauXThetaTorsion, 100, 1e-10, 1e-8);
approx(point.stressTensor.sigmaX, 200, 1e-10, 1e-8);
approx(point.stressTensor.sigmaTheta, 0, 0, 1e-10);
approx(point.stressTensor.sigmaR, 0, 0, 1e-10);
approx(point.stressTensor.tauXTheta, 100, 1e-10, 1e-8);
approx(point.stressTensor.vonMises, exactScreening.expected.vonMises, 1e-10, 1e-8);

antiDrift('edited document after request', () => {
  const edited = structuredClone(foundationDocument);
  edited.modelVersion = '2';
  return executeControlledLafeaAnalyticalPilot({
    ...foundationAuthority,
    document: edited,
    productInput: foundationProductInput(),
  });
}, 'LAFEA_TEMPLATE_IMPORTED_DOCUMENT_REVISION_STALE');

antiDrift('stale request revision', () => {
  const request = requestFor(
    foundationAuthority.releaseRecord,
    foundationAuthority.compatibilityReceipt,
    foundationDocument,
    'fnv1a64:1111111111111111',
  );
  return executeControlledLafeaAnalyticalPilot({
    request,
    releaseRecord: foundationAuthority.releaseRecord,
    compatibilityReceipt: foundationAuthority.compatibilityReceipt,
    document: foundationDocument,
    productInput: foundationProductInput(),
  });
}, 'LAFEA_TEMPLATE_IMPORTED_DOCUMENT_REVISION_STALE');

antiDrift('release not engine executable', () => {
  const compiled = compiledRelease(
    foundationAuthority.snapshot,
    'ALG-LOAD-REFERENCE-TRANSFER',
  );
  const receipt = evaluateTemplateTargetCompatibility(
    compiled, foundationAuthority.snapshot,
  );
  return executeControlledLafeaAnalyticalPilot({
    request: requestFor(compiled, receipt, foundationDocument),
    releaseRecord: compiled,
    compatibilityReceipt: receipt,
    document: foundationDocument,
    productInput: foundationProductInput(),
  });
}, 'LAFEA_TEMPLATE_RELEASE_NOT_ENGINE_EXECUTABLE');

antiDrift('provided stale target receipt', () => {
  const staleSnapshotInput = snapshotInput(foundationAuthority.snapshot);
  staleSnapshotInput.compositionRoot.compositionRootHash =
    `sha256:${'9'.repeat(64)}`;
  const staleSnapshot = createTemplateTargetAuthoritySnapshot(staleSnapshotInput);
  const staleReceipt = evaluateTemplateTargetCompatibility(
    foundationAuthority.releaseRecord,
    staleSnapshot,
  );
  const recordInput = toReleaseInput(foundationAuthority.releaseRecord);
  recordInput.compositionRoot.compatibilityReceiptHash = staleReceipt.semanticHash;
  const staleBoundRecord = createTemplateReleaseRecordV2(recordInput);
  return executeControlledLafeaAnalyticalPilot({
    request: requestFor(staleBoundRecord, staleReceipt, foundationDocument),
    releaseRecord: staleBoundRecord,
    compatibilityReceipt: staleReceipt,
    document: foundationDocument,
    productInput: foundationProductInput(),
  });
}, 'LAFEA_TEMPLATE_PROVIDED_COMPATIBILITY_NOT_CURRENT');

antiDrift('request release hash mismatch', () => {
  const requestInput = requestInputFor(
    foundationAuthority.releaseRecord,
    foundationAuthority.compatibilityReceipt,
    foundationDocument,
  );
  requestInput.releaseRecordHash = `sha256:${'8'.repeat(64)}`;
  return executeControlledLafeaAnalyticalPilot({
    request: createTemplateExecutionRequest(requestInput),
    releaseRecord: foundationAuthority.releaseRecord,
    compatibilityReceipt: foundationAuthority.compatibilityReceipt,
    document: foundationDocument,
    productInput: foundationProductInput(),
  });
}, 'LAFEA_TEMPLATE_RELEASE_RECORD_HASH_MISMATCH');

antiDrift('request benchmark drift', () => {
  const requestInput = requestInputFor(
    foundationAuthority.releaseRecord,
    foundationAuthority.compatibilityReceipt,
    foundationDocument,
  );
  requestInput.expectedBenchmarkManifestIds = ['UNBOUND-BENCHMARK'];
  return executeControlledLafeaAnalyticalPilot({
    request: createTemplateExecutionRequest(requestInput),
    releaseRecord: foundationAuthority.releaseRecord,
    compatibilityReceipt: foundationAuthority.compatibilityReceipt,
    document: foundationDocument,
    productInput: foundationProductInput(),
  });
}, 'LAFEA_TEMPLATE_BENCHMARK_BINDING_MISMATCH');

antiDrift('screening product evidence incomplete', () =>
  executeControlledLafeaAnalyticalPilot({
    ...screeningAuthority,
    document: screeningDocument,
    productInput: {
      ...exactScreening.productInput,
      applicabilityRecords: [],
    },
  }), 'LAFEA_TEMPLATE_PRODUCT_EVIDENCE_NOT_QUALIFIED');

const deterministicFoundation = executeControlledLafeaAnalyticalPilot({
  ...foundationAuthority,
  document: foundationDocument,
  productInput: foundationProductInput(),
});
assert.equal(
  deterministicFoundation.receipt.semanticHash,
  foundationResult.receipt.semanticHash,
);
assert.equal(
  deterministicFoundation.receipt.evidenceHash,
  foundationResult.receipt.evidenceHash,
);
antiDriftCount += 1;

const reversedFoundation = normalizeLafeaStageDocument('LAFEA.1', sourceFixture((source) => {
  source.loadCases[0].actionSense = ACTION_SENSES.PIPE_ON_SUPPORT;
}));
const reversedAuthority = authorityPackage(
  'ALG-LOAD-REFERENCE-TRANSFER', 'LAFEA.1', reversedFoundation,
);
const reversedResult = executeControlledLafeaAnalyticalPilot({
  ...reversedAuthority,
  document: reversedFoundation,
  productInput: {
    ...foundationProductInput(),
    foundation: {
      ...foundationProductInput().foundation,
      declaredResultant: {
        force: [-1000, 0, 0],
        moment: [0, -1_000_000, 0],
        sourceReference: 'B4-REVERSED-RESULTANT',
      },
    },
  },
});
assert.equal(reversedResult.status, 'ACCEPTED');
assert.deepEqual(
  reversedResult.execution.result.transformedLoadCases[0].transformedForceGlobal,
  [-1000, 0, 0],
);
assert.deepEqual(
  reversedResult.execution.result.transformedLoadCases[0].transformedMomentGlobal,
  [0, -1_000_000, 0],
);
antiDriftCount += 1;

assert.equal(foundationResult.receipt.releaseQualified, false);
assert.equal(screeningResult.receipt.releaseQualified, false);
assert.equal(foundationResult.receipt.codeReady, false);
assert.equal(screeningResult.receipt.codeReady, false);
assert.equal(Object.isFrozen(foundationResult), true);
assert.equal(Object.isFrozen(screeningResult), true);
antiDriftCount += 4;

console.log(JSON.stringify({
  schema: 'lafea-template-b4-analytical-pilot-check/v1',
  status: 'PASS',
  pilots: [
    'ALG-LOAD-REFERENCE-TRANSFER -> LAFEA.1',
    'ALG-PIPE-SECTION-COMBINED -> LAFEA.2',
  ],
  independentExpectedValues: {
    referenceTransfer: {
      force: [1000, 0, 0],
      moment: [0, 1_000_000, 0],
    },
    combinedSection: {
      area: exactScreening.expected.area,
      inertia: exactScreening.expected.inertia,
      polar: exactScreening.expected.polar,
      sigmaX: 200,
      tauXTheta: 100,
      vonMises: exactScreening.expected.vonMises,
    },
  },
  antiDriftTestCount: antiDriftCount,
  authority: {
    selectedPilotExecution: true,
    generalT7dAuthorized: false,
    continuumAuthorized: false,
    shellAuthorized: false,
    codeReady: false,
    releaseQualified: false,
  },
}));

function authorityPackage(templateId, stageId, document) {
  const snapshot = createCurrentLafeaTargetAuthoritySnapshot(stageId);
  const compiled = compiledRelease(snapshot, templateId);
  const compatibilityReceipt = evaluateTemplateTargetCompatibility(
    compiled, snapshot,
  );
  assert.equal(compatibilityReceipt.status, 'CURRENT');
  const releaseInput = toReleaseInput(compiled);
  releaseInput.compositionRoot.compatibilityReceiptHash =
    compatibilityReceipt.semanticHash;
  releaseInput.releaseState = {
    authorityState: 'ENGINE_EXECUTABLE',
    validity: 'CURRENT',
    releaseQualified: false,
    blockedReasons: [],
  };
  const releaseRecord = createTemplateReleaseRecordV2(releaseInput);
  const currentReceipt = evaluateTemplateTargetCompatibility(
    releaseRecord, snapshot,
  );
  assert.equal(currentReceipt.semanticHash, compatibilityReceipt.semanticHash);
  const request = requestFor(releaseRecord, currentReceipt, document);
  return {
    request,
    releaseRecord,
    compatibilityReceipt: currentReceipt,
    snapshot,
  };
}

function compiledRelease(snapshot, templateId) {
  const product = snapshot.productAdapter.applicability === 'REQUIRED'
    ? {
        applicability: 'REQUIRED',
        componentId: snapshot.productAdapter.componentId,
        componentHash: snapshot.productAdapter.componentHash,
        productProfileHash: snapshot.productAdapter.productProfileHash,
        productEvidenceHash: null,
        productQualification: null,
      }
    : {
        applicability: 'NOT_APPLICABLE', componentId: null,
        componentHash: null, productProfileHash: null,
        productEvidenceHash: null, productQualification: null,
      };
  return createTemplateReleaseRecordV2({
    recordId: `LAFEA.RELEASE.${templateId}/B4`,
    candidateHeadSha: HEAD,
    template: {
      templateId,
      templateRevision: 1,
      templateSemanticHash: FNV,
      templateRegistryHash: FNV,
      bucketId: 'B4_SELECTED_ANALYTICAL_PILOTS',
    },
    parameterSchema: {
      schemaId: `${templateId}.PARAMETERS/V1`,
      schemaHash: FNV,
    },
    parameterSet: {
      applicability: 'REQUIRED',
      parameterSetHash: FNV,
      validationResultHash: FNV,
    },
    compiler: {
      applicability: 'REQUIRED',
      bindingSchema: 'lafea-template-compiler-binding/v1',
      bindingHash: FNV,
      compilerVersion: 'B4.1',
      geometryCompilerId: 'B4-GEOMETRY',
      loadCompilerId: 'B4-LOAD',
      boundaryCompilerId: 'B4-BOUNDARY',
      meshRequestCompilerId: null,
    },
    handoff: {
      applicability: 'REQUIRED',
      handoffSchema: 'lafea-template-handoff/v1',
      compilationHash: FNV,
      handoffHash: FNV,
      entryStageId: snapshot.targetStage.stageId,
      stageSourceHash: FNV,
      handoffStatus: 'IMPORTED_FOR_EDITING',
    },
    targetStage: {
      registrySchema: snapshot.targetStage.registrySchema,
      stageId: snapshot.targetStage.stageId,
      stageEntryHash: snapshot.targetStage.registryEntryHash,
      engineState: snapshot.targetStage.engineState,
      enginePackage: snapshot.targetStage.enginePackage,
      stageAuthority: snapshot.targetStage.stageAuthority,
      inputContractRole: snapshot.targetStage.inputContractRole,
      resultContractRole: snapshot.targetStage.resultContractRole,
    },
    compositionRoot: {
      compositionSchema: snapshot.compositionRoot.compositionSchema,
      compositionRootId: snapshot.compositionRoot.compositionRootId,
      compositionRootHash: snapshot.compositionRoot.compositionRootHash,
      componentIdsHash: snapshot.compositionRoot.componentIdsHash,
      releaseStateBinding: snapshot.compositionRoot.releaseStateBinding,
      compatibilityReceiptHash: null,
    },
    lifecycleProfile: { ...snapshot.lifecycleProfile },
    sourceAuthority: {
      applicability: 'REQUIRED',
      requiredSchema: snapshot.sourceContract.sourceAuthoritySchema,
      requiredRole: snapshot.sourceContract.sourceAuthorityRole,
      authorityHash: null,
      sourceHash: null,
      canonicalizationProfile: snapshot.sourceContract.canonicalizationProfile,
      documentRevisionDigest: null,
      originRef: null,
    },
    unitProjection: {
      sourceUnitContractHash: FNV,
      handoffUnitContractHash: FNV,
      targetUnitContractHash: snapshot.unitProjection.targetUnitContractHash,
      projectionProfileHash: FNV,
    },
    meshAuthority: {
      applicability: 'NOT_APPLICABLE', authoritySchema: null,
      authorityRole: null, authorityStatus: null, authorityHash: null,
      sourceHash: null, canonicalModelHash: null, analysisGeometryHash: null,
      meshProfileHash: null, meshHash: null, qualityEvidenceHash: null,
    },
    recoveryAuthority: {
      applicability: 'NOT_APPLICABLE', recoveryProfileHash: null,
      recoveryEvidenceHash: null, convergenceProfileHash: null,
      convergenceEvidenceHash: null,
    },
    benchmarkManifests: {
      bindingState: snapshot.benchmarkBindings.bindingState,
      manifestIds: [...snapshot.benchmarkBindings.manifestIds],
      manifestHashes: [...snapshot.benchmarkBindings.manifestHashes],
      expectedResultHashes: [],
      benchmarkResultHashes: [],
      independentEvidenceBasisHashes: [],
    },
    productAdapter: product,
    executionEvidence: {
      applicability: 'REQUIRED', requestHash: null, receiptHash: null,
      stageExecutionEvidenceHash: null, lifecycleProducerBatchHash: null,
      resultEvidenceHash: null, calculationAccepted: false,
      resultReady: false, assessmentReady: false, codeReady: false,
    },
    qualificationEvidence: {
      exactHeadArtifactHash: null, buildEvidenceHash: null,
      browserEvidenceHash: null, performanceEvidenceHash: null,
      accessibilityEvidenceHash: null, independentReviewHash: null,
      repositoryIntegrationEvidenceHash: null,
    },
    releaseState: {
      authorityState: 'COMPILED_READY', validity: 'BLOCKED',
      releaseQualified: false,
      blockedReasons: ['B2_COMPATIBILITY_RECEIPT_REQUIRED'],
    },
    diagnostics: [],
  });
}

function requestFor(releaseRecord, compatibilityReceipt, document, digest = null) {
  return createTemplateExecutionRequest(requestInputFor(
    releaseRecord, compatibilityReceipt, document, digest,
  ));
}

function requestInputFor(releaseRecord, compatibilityReceipt, document, digest = null) {
  const revision = digest ?? lafeaDocumentDigest(document);
  return {
    requestId: `B4-REQUEST-${releaseRecord.template.templateId}`,
    executionMode: 'CONTROLLED_TEMPLATE_PILOT',
    templateId: releaseRecord.template.templateId,
    releaseRecordHash: releaseRecord.semanticHash,
    parameterSetHash: releaseRecord.parameterSet.parameterSetHash,
    compilationHash: releaseRecord.handoff.compilationHash,
    handoffHash: releaseRecord.handoff.handoffHash,
    compatibilityReceiptHash: compatibilityReceipt.semanticHash,
    targetStageId: releaseRecord.targetStage.stageId,
    targetCompositionRootId: releaseRecord.compositionRoot.compositionRootId,
    targetLifecycleProfileId: releaseRecord.lifecycleProfile.profileId,
    expectedProductAdapterId: releaseRecord.productAdapter.componentId,
    expectedBenchmarkManifestIds: [
      ...releaseRecord.benchmarkManifests.manifestIds,
    ],
    importedDocumentRevisionDigest: revision,
    sourceAuthorityRequest: {
      originRef: `B4/${releaseRecord.template.templateId}`,
      expectedStageId: releaseRecord.targetStage.stageId,
      expectedDocumentRevisionDigest: revision,
    },
  };
}

function foundationProductInput() {
  return {
    foundation: {
      schema: 'lafea-load-foundation/v2',
      foundationIdentity: 'B4-REFERENCE-TRANSFER-FOUNDATION',
      foundationVersion: '1',
      referencePoint: [0, 0, 0],
      declaredResultant: {
        force: [1000, 0, 0],
        moment: [0, 1_000_000, 0],
        sourceReference: 'B4-DECLARED-RESULTANT',
      },
      footprint: {
        method: 'POINT',
        stations: [{
          stationId: 'P1',
          position: [0, 0, 0],
          measure: 1,
          sourceReference: 'B4-STATION-P1',
        }],
        sourceReference: 'B4-POINT-FOOTPRINT',
      },
      qualificationProfile: {
        identity: 'B4-FOUNDATION-PROFILE',
        forceTolerance: { absolute: 1e-8, relative: 1e-12 },
        momentTolerance: { absolute: 1e-7, relative: 1e-12 },
        rankTolerance: 1e-12,
      },
      limitations: [],
    },
    handoffs: [],
  };
}

function exactCombinedSectionSource() {
  const outsideDiameter = 100;
  const insideDiameter = 80;
  const radius = outsideDiameter / 2;
  const area = Math.PI / 4 * (outsideDiameter ** 2 - insideDiameter ** 2);
  const inertia = Math.PI / 64 * (outsideDiameter ** 4 - insideDiameter ** 4);
  const polar = 2 * inertia;
  const forceX = 100 * area;
  const momentY = 100 * inertia / radius;
  const momentX = 100 * polar / radius;
  const expectedVonMises = Math.sqrt(200 ** 2 + 3 * 100 ** 2);

  const source = sourceFixture((model) => {
    model.pipeGeometry.outsideDiameter.value = outsideDiameter;
    model.thicknessBasis.nominalPipeThickness.value = 10;
    model.thicknessBasis.corrosionAllowance.value = 0;
    model.thicknessBasis.assessmentPipeThickness.value = 10;
    model.loadCases = [{
      identity: 'LC-EXACT',
      sourceCoordinateSystem: COORDINATE_SYSTEMS.PIPE_LOCAL,
      sourceReferencePointIdentity: 'TARGET',
      targetReferencePointIdentity: 'TARGET',
      actionSense: ACTION_SENSES.SUPPORT_ON_PIPE,
      force: {
        value: [forceX, 0, 0],
        sourceRef: 'B4-EXACT#force',
      },
      moment: {
        value: [momentX, momentY, 0],
        sourceRef: 'B4-EXACT#moment',
      },
    }];
    model.resultRequests.transformedLoadCaseIdentities = ['LC-EXACT'];
  });
  const foundationModel = createCanonicalLocalAttachmentFoundationModel(source);
  const foundationResult = calculateLocalAttachmentFoundation(foundationModel);
  assert.equal(foundationResult.qualification.state, 'ACCEPTED');

  const raw = rawRequestFixture();
  raw.requestIdentity = 'B4-EXACT-COMBINED-SECTION';
  raw.requestVersion = '1';
  raw.sourceEvidence = {
    schema: SOURCE_SCHEMA,
    foundationModel: structuredClone(foundationModel),
    foundationResult: structuredClone(foundationResult),
  };
  raw.screeningCases = [{
    screeningCaseId: 'CASE-EXACT',
    mechanicalTerms: [{ loadCaseId: 'LC-EXACT', factor: 1 }],
    pressureDefinitionId: 'P-CLOSED',
    pressureFactor: 0,
    sourceReference: 'B4-CASE-EXACT',
  }];
  raw.evaluationLocations = [{
    evaluationLocationId: 'L0',
    radiusBasis: RADIUS_BASES.OUTER_SURFACE,
    explicitRadius: null,
    angle: 0,
    sourceReference: 'B4-LOCATION-L0',
  }];
  raw.resultRequests = { envelopeQuantities: [...ENVELOPE_QUANTITIES] };
  const productInput = {
    assessmentIdentity: 'B4-EXACT-ASSESSMENT',
    assessmentProfileId: 'B4-EXACT-PRODUCT-PROFILE',
    governingQuantity: 'vonMisesMaximum',
    applicabilityRecords: [{
      screeningCaseId: 'CASE-EXACT',
      evaluationLocationId: 'L0',
      locationClass: 'FAR_FIELD',
      transverseShearState: 'NOT_PRESENT',
      evidenceReferences: ['B4-INDEPENDENT-CLOSED-FORM'],
    }],
    handoffs: [],
  };
  return {
    raw,
    productInput,
    expected: {
      area,
      inertia,
      polar,
      vonMises: expectedVonMises,
    },
  };
}

function antiDrift(label, run, expectedDiagnostic) {
  const result = run();
  assert.equal(result.status, 'BLOCKED', label);
  assert.equal(result.receipt.releaseQualified, false, label);
  assert.equal(result.receipt.codeReady, false, label);
  assert.equal(result.receipt.diagnostics.includes(expectedDiagnostic), true, label);
  antiDriftCount += 1;
}

function sourceGuards() {
  const controllerPath = path.join(
    ROOT, 'src/workspace/lafea-template-execution-controller.js',
  );
  const controllerSource = fs.readFileSync(controllerPath, 'utf8');
  assert.doesNotMatch(controllerSource,
    /from ['"][^'"]*(?:local-stress|local-attachment-screening|local-load-foundation)[^'"]*['"]/u);
  assert.match(controllerSource, /executeLafeaStage/u);
  assert.match(controllerSource, /issueLafeaSourceAuthority/u);
  assert.match(controllerSource, /createLafeaLifecycleProducerBatch/u);
  assert.match(controllerSource, /createLafeaAnalyticalProductBatch/u);

  const workspace = path.join(ROOT, 'src/workspace');
  const uiFiles = walk(workspace).filter((file) =>
    /(?:wizard|panel|view|ui|import)/iu.test(path.basename(file))
      && file.endsWith('.js'));
  for (const file of uiFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source,
      /from ['"][^'"]*lafea-template-execution-(?:controller|public)\.js['"]/u,
      `${path.relative(ROOT, file)} must not import the B4 controller.`);
    assert.doesNotMatch(source,
      /\bexecuteControlledLafeaAnalyticalPilot\s*\(/u,
      `${path.relative(ROOT, file)} must not invoke the B4 controller.`);
    assert.doesNotMatch(source,
      /\bexecuteLafeaStage\s*\(/u,
      `${path.relative(ROOT, file)} must not invoke a stage route directly.`);
  }
  antiDriftCount += 4;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}

function snapshotInput(snapshot) {
  const input = structuredClone(snapshot);
  delete input.schema;
  delete input.semanticHash;
  return input;
}

function toReleaseInput(record) {
  const input = structuredClone(record);
  delete input.schema;
  delete input.hashProfile;
  delete input.semanticHash;
  delete input.evidenceHash;
  return input;
}

function approx(actual, expected, relative, absolute) {
  const limit = Math.max(absolute, relative * Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= limit,
    `${actual} must match ${expected} within ${limit}.`,
  );
}
