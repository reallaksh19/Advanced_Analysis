import { clonePlain, sealWithHash } from './contracts.js';

function reseal(record, hashField, mutate) {
  const copy = clonePlain(record);
  delete copy[hashField];
  mutate(copy);
  return sealWithHash(copy, hashField);
}
function mutateRelease(fixture, name, mutate) {
  return { name, input: { ...fixture, releaseRecord: reseal(fixture.releaseRecord, 'releaseRecordHash', mutate) } };
}
function mutateUpstream(fixture, name, mutate) {
  return { name, input: { ...fixture, upstreamBinding: reseal(fixture.upstreamBinding, 'semanticHash', mutate) } };
}
function mutateEvidence(fixture, name, index, mutate) {
  const rows = [...fixture.domainEvidence];
  rows[index] = reseal(rows[index], 'evidenceHash', mutate);
  return { name, input: { ...fixture, domainEvidence: rows } };
}

export function createNc08rNegativeControls(fixture) {
  return [
    mutateUpstream(fixture, 'upstream exact head not qualified NC-08', (row) => { row.nc08ExactHeadSha = 'f'.repeat(40); }),
    mutateUpstream(fixture, 'upstream report hash not qualified NC-08', (row) => { row.nc08ReportHash = `sha256:${'f'.repeat(64)}`; }),
    mutateUpstream(fixture, 'upstream synthetic qualification missing', (row) => { row.syntheticReferenceModuleQualified = false; }),
    mutateUpstream(fixture, 'upstream module authority escalated', (row) => { row.moduleQualified = true; }),
    mutateUpstream(fixture, 'upstream production authority escalated', (row) => { row.productionExecutionAuthorized = true; }),
    mutateRelease(fixture, 'synthetic version presented as production', (row) => { row.moduleVersion = '1.0.0-synthetic-reference'; }),
    mutateRelease(fixture, 'production intent missing', (row) => { row.productionIntended = false; }),
    mutateRelease(fixture, 'artifact signature unverified', (row) => { row.artifactSignatureVerified = false; }),
    mutateRelease(fixture, 'provenance unverified', (row) => { row.provenanceVerified = false; }),
    mutateRelease(fixture, 'dependency lock unverified', (row) => { row.dependencyLockVerified = false; }),
    mutateRelease(fixture, 'SBOM unverified', (row) => { row.sbomVerified = false; }),
    mutateRelease(fixture, 'runtime profile unapproved', (row) => { row.runtimeProfileApproved = false; }),
    mutateRelease(fixture, 'production configuration unapproved', (row) => { row.productionConfigurationApproved = false; }),
    mutateRelease(fixture, 'technical approval missing', (row) => { row.technicalApprovalRecorded = false; }),
    mutateRelease(fixture, 'owner approval missing', (row) => { row.ownerApprovalRecorded = false; }),
    mutateRelease(fixture, 'simulated approval presented', (row) => { row.simulatedApproval = true; }),
    mutateRelease(fixture, 'unresolved blocking finding', (row) => { row.unresolvedBlockingFindings = true; }),
    mutateRelease(fixture, 'undeclared network enabled', (row) => { row.undeclaredNetworkAccessEnabled = true; }),
    mutateRelease(fixture, 'runtime extension enabled', (row) => { row.runtimeExtensionEnabled = true; }),
    mutateRelease(fixture, 'dynamic code enabled', (row) => { row.dynamicCodeEnabled = true; }),
    mutateRelease(fixture, 'release record claims production execution', (row) => { row.productionExecutionAuthorized = true; }),
    mutateRelease(fixture, 'release head mismatch', (row) => { row.exactHeadSha = 'f'.repeat(40); }),
    mutateRelease(fixture, 'release source tree mismatch', (row) => { row.sourceTreeSha = 'f'.repeat(40); }),
    mutateEvidence(fixture, 'evidence source tree mismatch', 1, (row) => { row.sourceTreeSha = 'f'.repeat(40); }),
    mutateEvidence(fixture, 'insufficient independent builds', 2, (row) => { row.metrics.independentBuildCount = 1; }),
    mutateEvidence(fixture, 'negative control failure', 5, (row) => { row.metrics.negativeControlPassCount = 29; }),
    mutateEvidence(fixture, 'resource boundary exceeded', 6, (row) => { row.metrics.artifactBytes = 1048577; }),
    mutateEvidence(fixture, 'simulated review metric', 8, (row) => { row.metrics.simulatedApprovalCount = 1; }),
    { name: 'required evidence missing', input: { ...fixture, domainEvidence: fixture.domainEvidence.slice(0, -1) } },
    { name: 'duplicate evidence identity', input: { ...fixture, domainEvidence: [...fixture.domainEvidence, fixture.domainEvidence[0]] } },
  ];
}
