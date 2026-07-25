import assert from 'node:assert/strict';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  AUDIT_CODES,
  createSimpleChainVerticalProfile,
  runTributarySupportLoadScreening,
} from '../src/core/support-load-screening/index.js';
import {
  buildDisconnectedFixture,
  buildStraightFixture,
} from './w10.5-screening-fixtures.mjs';

checkCrossPathIsolation();
checkInputLinkage();
console.log('✅ W10.5 owner regression checks passed.');

function checkCrossPathIsolation() {
  const fixture = buildDisconnectedFixture();
  const target = fixture.modelLoads.loadPrimitiveSet.primitives.find((row) => (
    row.componentKey === 'LINE-A' && row.loadCaseId === 'EMPTY'
  ));
  const primitives = fixture.modelLoads.loadPrimitiveSet.primitives.map((row) => (
    row.primitiveId === target.primitiveId
      ? { ...row, semanticDirection: 'INVALID_DIRECTION' }
      : row
  ));
  const loadPrimitiveSet = rehash({ ...fixture.modelLoads.loadPrimitiveSet, primitives });
  const modelLoadReadinessAudit = rehash({
    ...fixture.modelLoads.readinessAudit,
    primitiveSetSemanticHash: loadPrimitiveSet.semanticHash,
  });
  const result = runTributarySupportLoadScreening(fixture.pathFoundation, {
    loadCaseSet: fixture.modelLoads.loadCaseSet,
    loadPrimitiveSet,
    modelLoadReadinessAudit,
  });
  const ownerPath = fixture.pathFoundation.pathModel.paths.find((path) => (
    path.orderedComponentKeys.includes('LINE-A')
  ));
  const otherPath = fixture.pathFoundation.pathModel.paths.find((path) => (
    path.pathId !== ownerPath.pathId
  ));
  const ownerCase = pathCase(result, ownerPath.pathId, target.loadCaseId);
  const otherCase = pathCase(result, otherPath.pathId, target.loadCaseId);
  assert.equal(ownerCase.qualification, 'BLOCKED');
  assert.equal(ownerCase.blockers.includes(AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH), true);
  assert.equal(otherCase.qualification, 'READY');
}

function checkInputLinkage() {
  const fixture = buildStraightFixture();
  const loadPrimitiveSet = rehash({
    ...fixture.modelLoads.loadPrimitiveSet,
    datasetId: 'OTHER-DATASET',
  });
  const modelLoadReadinessAudit = rehash({
    ...fixture.modelLoads.readinessAudit,
    datasetId: 'OTHER-DATASET',
    primitiveSetSemanticHash: loadPrimitiveSet.semanticHash,
  });
  assert.throws(() => runTributarySupportLoadScreening(fixture.pathFoundation, {
    loadCaseSet: fixture.modelLoads.loadCaseSet,
    loadPrimitiveSet,
    modelLoadReadinessAudit,
  }), /Primitive set does not match vertical load paths/);

  const mismatchedProfile = createSimpleChainVerticalProfile({ absoluteToleranceN: 1e-8 });
  assert.throws(() => runTributarySupportLoadScreening({
    profile: mismatchedProfile,
    pathModel: fixture.pathFoundation.pathModel,
  }, {
    loadCaseSet: fixture.modelLoads.loadCaseSet,
    loadPrimitiveSet: fixture.modelLoads.loadPrimitiveSet,
    modelLoadReadinessAudit: fixture.modelLoads.readinessAudit,
  }), /Screening profile does not match vertical load paths/);
}

function rehash(value) {
  const base = { ...value };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function pathCase(result, pathId, loadCaseId) {
  return result.screening.pathCases.find((row) => (
    row.pathId === pathId && row.loadCaseId === loadCaseId
  ));
}
