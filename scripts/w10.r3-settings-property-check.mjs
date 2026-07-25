import assert from 'node:assert/strict';
import {
  EngineeringSettingsAuthority,
  applyReportTimestampPolicy,
  createApprovedDefaultProfile,
  createEngineeringSettingsProfile,
  validateEngineeringSettingsAudit,
  validateEngineeringSettingsProfile,
  validateSettingsReviewModel,
} from '../src/core/settings-authority/index.js';
import { SettingsPersistenceAdapter } from '../src/workspace/settings-persistence-adapter.js';

const defaultProfile = createApprovedDefaultProfile();
assert.deepEqual(
  createEngineeringSettingsProfile({ reportTimestampPolicy: 'exclude-from-deterministic-hash' }),
  defaultProfile,
);
assert.equal(validateEngineeringSettingsProfile({ ...defaultProfile, settings: {} }).ok, false);
assert.throws(() => createEngineeringSettingsProfile({ reportTimestampPolicy: 'invalid' }));

const authority = new EngineeringSettingsAuthority({ persistenceSummary: { status: 'EMPTY' } });
const initialId = authority.getProfile().profileId;
authority.updateProposal('reportTimestampPolicy', 'include-in-export-content');
assert.equal(authority.getProfile().profileId, initialId);
const preview = authority.getReviewModel({ materializedContractKeys: ['activeModelCalculationReport','sharedModel'] });
assert.deepEqual(preview.invalidationSummary.changedSettingIds, ['reportTimestampPolicy']);
assert.deepEqual(preview.invalidationSummary.affectedContractKeys, ['modelCalculationExportArtifact']);
assert.deepEqual(preview.invalidationSummary.stalePreparedEvidence, []);
assert.deepEqual(preview.invalidationSummary.unaffectedEvidence, ['activeModelCalculationReport','sharedModel']);

const prepared = authority.prepareApply({ materializedContractKeys: ['activeModelCalculationReport','sharedModel'] });
assert.equal(validateEngineeringSettingsAudit(prepared.audit).ok, true);
assert.equal(prepared.audit.recalculationRequired, false);
assert.deepEqual(prepared.audit.staleCalculatedEvidence, []);
const committed = authority.commit(prepared, { status: 'SAVED', profileId: prepared.nextProfile.profileId });
assert.notEqual(authority.getProfile().profileId, initialId);
assert.equal(validateSettingsReviewModel(committed, {
  activeProfile: authority.getProfile(), proposal: authority.getProposal(), audit: authority.getAudit(),
  persistenceSummary: { status: 'SAVED', profileId: prepared.nextProfile.profileId },
  evidence: {}, diagnostics: [],
}).ok, true);

const beforeFailure = authority.getProfile();
authority.updateProposal('reportTimestampPolicy', 'not-approved');
assert.throws(() => authority.prepareApply());
assert.equal(authority.getProfile(), beforeFailure);

const storage = fakeStorage();
const persistence = new SettingsPersistenceAdapter(storage);
const saveSummary = persistence.save(defaultProfile);
assert.equal(saveSummary.status, 'SAVED');
assert.deepEqual(persistence.load().profile, defaultProfile);
storage.setItem('simplified-analysis:engineering-settings:v1', '{broken');
const rejected = persistence.load();
assert.equal(rejected.profile, null);
assert.equal(rejected.summary.status, 'REJECTED');
assert.equal(storage.getItem('simplified-analysis:engineering-settings:v1'), '{broken');

const artifact = Object.freeze({
  schema: 'model-calculation-export-artifact/v1', format: 'JSON', filename: 'x.json',
  mimeType: 'application/json;charset=utf-8', content: '{"schema":"x"}\n', byteLength: 15,
  datasetId: 'd', packageId: 'p', packageSemanticHash: 'a', reportSemanticHash: 'b', semanticHash: 'base',
});
assert.equal(applyReportTimestampPolicy(artifact, defaultProfile, '2026-07-24T00:00:00.000Z'), artifact);
const timestampProfile = createEngineeringSettingsProfile({ reportTimestampPolicy: 'include-in-export-content' });
const stampedA = applyReportTimestampPolicy(artifact, timestampProfile, '2026-07-24T00:00:00.000Z');
const stampedB = applyReportTimestampPolicy(artifact, timestampProfile, '2026-07-24T00:00:00.000Z');
assert.deepEqual(stampedA, stampedB);
assert.match(stampedA.content, /2026-07-24T00:00:00\.000Z/);
assert.equal(Object.isFrozen(stampedA), true);

console.log('✅ W10.R3 atomicity, persistence, invalidation and deterministic properties passed.');

function fakeStorage() {
  const rows = new Map();
  return { getItem: (key) => rows.has(key) ? rows.get(key) : null, setItem: (key, value) => rows.set(key, String(value)) };
}
