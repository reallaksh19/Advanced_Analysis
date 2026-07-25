import assert from 'node:assert/strict';
import {
  createModelCalculationExportArtifact, createModelCalculationLedger,
  createModelCalculationPackage, createModelCalculationReport, EXPORT_FORMATS,
  PACKAGE_MODES, archiveModelCalculationPackage,
} from '../src/core/model-calculation-package/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildCalculationFixture } from './w10.7-fixtures.mjs';

console.log('\n--- W10.7 fixed-seed properties ---\n');
const fixture = buildCalculationFixture();
const base = build(fixture);
let distinctSourceIdentityCount = 0;
for (let seed = 10700; seed < 10720; seed += 1) {
  const shuffled = reorderFixture(fixture, seed);
  const candidate = build(shuffled);
  const repeated = build(shuffled);
  assert.equal(calculationProjectionHash(candidate), calculationProjectionHash(base));
  assert.equal(candidate.packageId, repeated.packageId);
  assert.equal(candidate.semanticHash, repeated.semanticHash);
  assert.equal(candidate.report.semanticHash, repeated.report.semanticHash);
  Object.values(EXPORT_FORMATS).forEach((format) => assert.equal(candidate.exports[format].content, repeated.exports[format].content));
  assert.equal(candidate.modelReference.verticalLoadPathModelSemanticHash, shuffled.screeningSnapshot.pathModel.semanticHash);
  assert.equal(candidate.screeningSnapshot.sourceSemanticHashes.resultSemanticHash, shuffled.screeningSnapshot.screening.semanticHash);
  assert.equal(candidate.verticalBeamSnapshot.sourceSemanticHashes.solutionSemanticHash, shuffled.verticalBeamSnapshot.solution.semanticHash);
  if (candidate.packageId !== base.packageId) distinctSourceIdentityCount += 1;
}
assert.ok(distinctSourceIdentityCount > 0, 'Different exact source contracts must not collapse to one package identity.');
assert.equal(Object.isFrozen(base), true);
console.log('✅ W10.7 fixed-seed properties passed.\n');

function build(source) {
  const packageValue = createModelCalculationPackage({ packageMode: PACKAGE_MODES.COMBINED, screeningSnapshot: source.screeningSnapshot, verticalBeamSnapshot: source.verticalBeamSnapshot, modelReference: source.modelReference });
  const ledger = archiveModelCalculationPackage(createModelCalculationLedger(packageValue.datasetId), packageValue);
  const report = createModelCalculationReport(ledger.entries[0]);
  const exports = Object.fromEntries(Object.values(EXPORT_FORMATS).map((format) => [format, createModelCalculationExportArtifact(packageValue, report, format)]));
  return Object.freeze({ ...packageValue, report, exports });
}
function calculationProjectionHash(value) {
  const clone = structuredClone(value);
  delete clone.packageId; delete clone.semanticHash; delete clone.report; delete clone.exports;
  delete clone.modelReference;
  [clone.screeningSnapshot, clone.verticalBeamSnapshot].filter(Boolean)
    .forEach((snapshot) => { delete snapshot.sourceSemanticHashes; });
  clone.methodEvidence.forEach((method) => {
    delete method.profileSemanticHash; delete method.resultSemanticHash; delete method.auditSemanticHash;
  });
  return semanticHash(clone);
}
function reorderFixture(source, seed) {
  const clone = structuredClone(source), random = generator(seed);
  clone.screeningSnapshot.pathModel.paths = shuffle(clone.screeningSnapshot.pathModel.paths, random).map((path) => rehash({ ...path, supportStations: shuffle(path.supportStations, random), diagnostics: shuffle(path.diagnostics, random) }));
  clone.screeningSnapshot.pathModel = rehash(clone.screeningSnapshot.pathModel);
  clone.screeningSnapshot.screening.pathCases = shuffle(clone.screeningSnapshot.screening.pathCases, random);
  clone.screeningSnapshot.screening.supportResults = shuffle(clone.screeningSnapshot.screening.supportResults, random);
  clone.screeningSnapshot.screening.diagnostics = shuffle(clone.screeningSnapshot.screening.diagnostics, random);
  clone.screeningSnapshot.screening.pathModelSemanticHash = clone.screeningSnapshot.pathModel.semanticHash;
  clone.screeningSnapshot.screening = rehash(clone.screeningSnapshot.screening);
  clone.screeningSnapshot.audit.records = shuffle(clone.screeningSnapshot.audit.records, random);
  clone.screeningSnapshot.audit.diagnostics = shuffle(clone.screeningSnapshot.audit.diagnostics, random);
  clone.screeningSnapshot.audit.screeningSemanticHash = clone.screeningSnapshot.screening.semanticHash;
  clone.screeningSnapshot.audit = rehash(clone.screeningSnapshot.audit);
  clone.verticalBeamSnapshot.flexuralProjection.records = shuffle(clone.verticalBeamSnapshot.flexuralProjection.records, random);
  clone.verticalBeamSnapshot.flexuralProjection.pathModelSemanticHash = clone.screeningSnapshot.pathModel.semanticHash;
  clone.verticalBeamSnapshot.flexuralProjection = rehash(clone.verticalBeamSnapshot.flexuralProjection);
  clone.verticalBeamSnapshot.beamModel.pathCases = shuffle(clone.verticalBeamSnapshot.beamModel.pathCases, random);
  clone.verticalBeamSnapshot.beamModel.pathModelSemanticHash = clone.screeningSnapshot.pathModel.semanticHash;
  clone.verticalBeamSnapshot.beamModel.flexuralProjectionSemanticHash = clone.verticalBeamSnapshot.flexuralProjection.semanticHash;
  clone.verticalBeamSnapshot.beamModel = rehash(clone.verticalBeamSnapshot.beamModel);
  clone.verticalBeamSnapshot.solution.pathCases = shuffle(clone.verticalBeamSnapshot.solution.pathCases, random).map((row) => rehash({ ...row, supportForceResults: shuffle(row.supportForceResults, random), diagnostics: shuffle(row.diagnostics, random) }));
  clone.verticalBeamSnapshot.solution.beamModelSemanticHash = clone.verticalBeamSnapshot.beamModel.semanticHash;
  clone.verticalBeamSnapshot.solution = rehash(clone.verticalBeamSnapshot.solution);
  clone.verticalBeamSnapshot.audit.records = shuffle(clone.verticalBeamSnapshot.audit.records, random);
  clone.verticalBeamSnapshot.audit.diagnostics = shuffle(clone.verticalBeamSnapshot.audit.diagnostics, random);
  clone.verticalBeamSnapshot.audit.solutionSemanticHash = clone.verticalBeamSnapshot.solution.semanticHash;
  clone.verticalBeamSnapshot.audit = rehash(clone.verticalBeamSnapshot.audit);
  clone.modelReference.verticalLoadPathModelSemanticHash = clone.screeningSnapshot.pathModel.semanticHash;
  return clone;
}
function rehash(value) { const { semanticHash: _hash, ...base } = value; return { ...base, semanticHash: semanticHash(base) }; }
function shuffle(values, random) { const rows = [...values]; for (let i = rows.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; } return rows; }
function generator(seed) { let value = seed >>> 0; return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 2 ** 32; }; }
