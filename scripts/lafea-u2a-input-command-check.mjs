#!/usr/bin/env node

import assert from 'node:assert/strict';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import {
  LAFEA_EDIT_COMMAND_SCHEMA,
  LAFEA_EDIT_RESULT_SCHEMA,
  allocateLafeaEntityIdentity,
  applyLafeaStageEditCommand,
  classifyLafeaNumericInput,
  createLafeaAddEntityCommand,
  createLafeaDeleteEntityCommand,
  createLafeaDeleteFieldCommand,
  createLafeaReplaceDocumentCommand,
  createLafeaSetScalarCommand,
  lafeaDocumentDigest,
} from '../src/workspace/lafea-edit-command.js';
import {
  LAFEA_INPUT_DESCRIPTOR_SCHEMA,
  LAFEA_INPUT_DESCRIPTOR_REVISION,
  lafeaStageInputDescriptors,
  requireLafeaInputDescriptor,
  resolveLafeaDescriptorSourceRef,
  resolveLafeaDescriptorUnit,
} from '../src/workspace/lafea-stage-input-descriptors.js';
import { normalizeLafeaStageDocument } from '../src/workspace/lafea-workbench-model.js';

const origin = Object.freeze({ surface: 'PROGRAMMATIC', sessionId: 'U2A-CHECK', sequence: 1 });

for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6']) {
  const descriptors = lafeaStageInputDescriptors(stageId);
  assert.ok(Object.isFrozen(descriptors));
  descriptors.forEach((descriptor) => {
    assert.equal(descriptor.schema, LAFEA_INPUT_DESCRIPTOR_SCHEMA);
    assert.equal(descriptor.descriptorRevision, LAFEA_INPUT_DESCRIPTOR_REVISION);
    assert.equal(descriptor.stageId, stageId);
    assert.ok(Object.isFrozen(descriptor));
    assert.deepEqual(Object.keys(descriptor).sort(), [
      'authority', 'descriptorId', 'descriptorRevision', 'invalidation',
      'metadataPolicy', 'presentation', 'schema', 'stageId', 'target',
      'unitContract', 'valueContract',
    ].sort());
  });
}
assert.deepEqual(lafeaStageInputDescriptors('LAFEA.6'), []);

const continuum = normalizeLafeaStageDocument('LAFEA.3', continuumFixture());
const materialDescriptor = requireLafeaInputDescriptor('LAFEA.3', 'LAFEA.3.material.elasticModulus');
assert.equal(resolveLafeaDescriptorUnit(continuum, materialDescriptor), 'MPa');
assert.equal(resolveLafeaDescriptorSourceRef(continuum, materialDescriptor, 'MAT'), 'MATERIAL#MAT');

const materialCommand = createLafeaSetScalarCommand({
  commandId: 'CMD-U2A-MATERIAL-1',
  stageId: 'LAFEA.3',
  descriptorId: materialDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  entityId: 'MAT',
  rawText: '210000',
  origin,
});
assert.equal(materialCommand.schema, LAFEA_EDIT_COMMAND_SCHEMA);
const materialResult = applyLafeaStageEditCommand(continuum, materialCommand);
assert.equal(materialResult.schema, LAFEA_EDIT_RESULT_SCHEMA);
assert.equal(materialResult.status, 'APPLIED');
assert.equal(materialResult.document.materials[0].elasticModulus, 210000);
assert.equal(materialResult.document.materials[0].sourceReference, 'MATERIAL#MAT');
assert.ok(materialResult.dependencyImpact.includes('EXECUTION'));

const noChangeCommand = createLafeaSetScalarCommand({
  commandId: 'CMD-U2A-NO-CHANGE-1',
  stageId: 'LAFEA.3',
  descriptorId: materialDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  entityId: 'MAT',
  rawText: '200000',
  origin: { ...origin, sequence: 11 },
});
const noChangeResult = applyLafeaStageEditCommand(continuum, noChangeCommand);
assert.equal(noChangeResult.status, 'NO_CHANGE');
assert.deepEqual(noChangeResult.dependencyImpact, []);

const nodeDescriptor = requireLafeaInputDescriptor('LAFEA.3', 'LAFEA.3.node.x');
const nodeBefore = continuum.nodes.find((row) => row.nodeId === 'B');
const nodeCommand = createLafeaSetScalarCommand({
  commandId: 'CMD-U2A-NODE-1',
  stageId: 'LAFEA.3',
  descriptorId: nodeDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  entityId: 'B',
  rawText: '125.5',
  origin: { ...origin, sequence: 2 },
});
const nodeResult = applyLafeaStageEditCommand(continuum, nodeCommand);
const nodeAfter = nodeResult.document.nodes.find((row) => row.nodeId === 'B');
assert.equal(nodeResult.status, 'APPLIED');
assert.equal(nodeAfter.nodeId, nodeBefore.nodeId);
assert.equal(nodeAfter.x, 125.5);
assert.equal(nodeAfter.sourceReference, nodeBefore.sourceReference);
assert.match(nodeResult.change.resolvedPath, /nodes\[nodeId=B\]\.x/u);

const attachment = normalizeLafeaStageDocument('LAFEA.1', attachmentFixture());
const diameterDescriptor = requireLafeaInputDescriptor('LAFEA.1', 'LAFEA.1.pipe.outsideDiameter');
const diameterSourceRef = attachment.pipeGeometry.outsideDiameter.sourceRef;
const diameterCommand = createLafeaSetScalarCommand({
  commandId: 'CMD-U2A-WRAPPER-1',
  stageId: 'LAFEA.1',
  descriptorId: diameterDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(attachment),
  entityId: null,
  rawText: '1010',
  origin: { ...origin, sequence: 3 },
});
const diameterResult = applyLafeaStageEditCommand(attachment, diameterCommand);
assert.equal(diameterResult.status, 'APPLIED');
assert.equal(diameterResult.document.pipeGeometry.outsideDiameter.value, 1010);
assert.equal(diameterResult.document.pipeGeometry.outsideDiameter.sourceRef, diameterSourceRef);
assert.equal(diameterResult.document.units.length, attachment.units.length);

const blank = classifyLafeaNumericInput(
  { presence: 'PRESENT', encoding: 'TEXT', rawText: '   ', jsonValue: null },
  materialDescriptor,
);
assert.equal(blank.state, 'EMPTY_TEXT');
const explicitZero = classifyLafeaNumericInput(
  { presence: 'PRESENT', encoding: 'TEXT', rawText: '-0.0e5', jsonValue: null },
  nodeDescriptor,
);
assert.equal(explicitZero.state, 'EXPLICIT_ZERO');
assert.equal(explicitZero.value, 0);
for (const rawText of ['abc', '1 MPa', '1,000', '0x10', 'NaN', 'Infinity', '1e9999']) {
  const parsed = classifyLafeaNumericInput(
    { presence: 'PRESENT', encoding: 'TEXT', rawText, jsonValue: null },
    nodeDescriptor,
  );
  assert.equal(parsed.state, 'INVALID_NUMBER', `${rawText} must not parse as an engineering number.`);
}
const presentNull = classifyLafeaNumericInput(
  { presence: 'PRESENT', encoding: 'JSON', rawText: null, jsonValue: null },
  materialDescriptor,
);
assert.equal(presentNull.state, 'PRESENT_NULL');
const missing = classifyLafeaNumericInput(
  { presence: 'DELETE', encoding: 'JSON', rawText: null, jsonValue: null },
  materialDescriptor,
);
assert.equal(missing.state, 'MISSING');
const deleteFieldCommand = createLafeaDeleteFieldCommand({
  commandId: 'CMD-U2A-DELETE-FIELD-1',
  stageId: 'LAFEA.2',
  descriptorId: 'LAFEA.2.location.explicitRadius',
  expectedDocumentDigest: 'fnv1a64:0000000000000000',
  entityId: 'L0',
  origin: { ...origin, sequence: 12 },
});
assert.equal(deleteFieldCommand.operation, 'DELETE_FIELD');
assert.equal(deleteFieldCommand.input.presence, 'DELETE');

const weldPlaceholder = Object.freeze({
  schema: 'lafea-weld-profile-placeholder/v1',
  identity: 'WELD-NOT-IMPLEMENTED',
});
const weldReplaceCommand = createLafeaReplaceDocumentCommand({
  commandId: 'CMD-U2A-WELD-EDIT-BLOCK-1',
  stageId: 'LAFEA.6',
  expectedDocumentDigest: lafeaDocumentDigest(weldPlaceholder),
  documentValue: { ...weldPlaceholder, identity: 'EDITED-WELD' },
  origin: { ...origin, sequence: 14 },
});
const weldEditResult = applyLafeaStageEditCommand(weldPlaceholder, weldReplaceCommand);
assert.equal(weldEditResult.status, 'REJECTED');
assert.ok(weldEditResult.diagnostics.some((row) => row.code === 'LAFEA_STAGE_EDIT_NOT_AUTHORIZED'));
assert.equal(weldEditResult.currentDocumentDigest, lafeaDocumentDigest(weldPlaceholder));

const withMeshConfig = normalizeLafeaStageDocument('LAFEA.3', {
  ...structuredClone(continuumFixture()),
  meshConfig: { density: 'FINE', palette: 'VIRIDIS' },
});
const replacement = structuredClone(withMeshConfig);
delete replacement.meshConfig;
const replaceCommand = createLafeaReplaceDocumentCommand({
  commandId: 'CMD-U2A-REPLACE-1',
  stageId: 'LAFEA.3',
  expectedDocumentDigest: lafeaDocumentDigest(withMeshConfig),
  documentValue: replacement,
  origin: { ...origin, sequence: 4 },
});
const replaceResult = applyLafeaStageEditCommand(withMeshConfig, replaceCommand);
assert.equal(replaceResult.status, 'APPLIED');
assert.equal(Object.hasOwn(replaceResult.document, 'meshConfig'), false, 'Whole-document replacement must delete omitted keys.');

const collision = structuredClone(continuum);
collision.nodes.push({ ...structuredClone(collision.nodes[0]), x: 999 });
const collisionCommand = createLafeaReplaceDocumentCommand({
  commandId: 'CMD-U2A-COLLISION-1',
  stageId: 'LAFEA.3',
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  documentValue: collision,
  origin: { ...origin, sequence: 5 },
});
const collisionResult = applyLafeaStageEditCommand(continuum, collisionCommand);
assert.equal(collisionResult.status, 'REJECTED');
assert.ok(collisionResult.diagnostics.some((row) => row.code === 'LAFEA_IDENTITY_COLLISION'));
assert.equal(collisionResult.currentDocumentDigest, lafeaDocumentDigest(continuum));

const staleResult = applyLafeaStageEditCommand(materialResult.document, materialCommand);
assert.equal(staleResult.status, 'CONFLICT');
assert.ok(staleResult.diagnostics.some((row) => row.code === 'LAFEA_STALE_DOCUMENT_DIGEST'));

assert.throws(() => { continuum.nodes[0].x = 999; }, TypeError, 'Frozen source documents must reject direct mutation.');

const entityDescriptor = requireLafeaInputDescriptor('LAFEA.3', 'LAFEA.3.nodes.entity');
const proposedNode = { x: 50, y: 50, sourceReference: 'NODE#ALLOCATED' };
const allocatedFirst = allocateLafeaEntityIdentity('LAFEA.3', continuum, entityDescriptor, proposedNode);
const allocatedSecond = allocateLafeaEntityIdentity('LAFEA.3', continuum, entityDescriptor, proposedNode);
assert.equal(allocatedFirst, allocatedSecond);
assert.match(allocatedFirst, /^N-[0-9A-F]{12}$/u);
const suppliedIdentityCommand = createLafeaAddEntityCommand({
  commandId: 'CMD-U2A-ADD-SUPPLIED-ID-1',
  stageId: 'LAFEA.3',
  descriptorId: entityDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  recordValue: { nodeId: 'CLONED-ID', ...proposedNode },
  origin: { ...origin, sequence: 13 },
});
const suppliedIdentityResult = applyLafeaStageEditCommand(continuum, suppliedIdentityCommand);
assert.equal(suppliedIdentityResult.status, 'REJECTED');
assert.ok(suppliedIdentityResult.diagnostics.some((row) => row.code === 'LAFEA_ADD_ENTITY_ID_FORBIDDEN'));

const addCommand = createLafeaAddEntityCommand({
  commandId: 'CMD-U2A-ADD-1',
  stageId: 'LAFEA.3',
  descriptorId: entityDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  recordValue: proposedNode,
  origin: { ...origin, sequence: 6 },
});
const addResult = applyLafeaStageEditCommand(continuum, addCommand);
assert.equal(addResult.status, 'REJECTED');
assert.ok(addResult.diagnostics.some((row) => row.code === 'DISCONNECTED_UNREFERENCED_NODE'));
assert.equal(addResult.change.entityId, null);
assert.equal(addResult.currentDocumentDigest, lafeaDocumentDigest(continuum));

const deleteCommand = createLafeaDeleteEntityCommand({
  commandId: 'CMD-U2A-DELETE-1',
  stageId: 'LAFEA.3',
  descriptorId: entityDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  entityId: 'A',
  origin: { ...origin, sequence: 7 },
});
const deleteResult = applyLafeaStageEditCommand(continuum, deleteCommand);
assert.equal(deleteResult.status, 'REJECTED');
assert.ok(deleteResult.diagnostics.some((row) => row.code === 'LAFEA_REFERENTIAL_INTEGRITY'));

const indexFallbackCommand = createLafeaSetScalarCommand({
  commandId: 'CMD-U2A-INDEX-1',
  stageId: 'LAFEA.3',
  descriptorId: nodeDescriptor.descriptorId,
  expectedDocumentDigest: lafeaDocumentDigest(continuum),
  entityId: '0',
  rawText: '12',
  origin: { ...origin, sequence: 8 },
});
const indexFallbackResult = applyLafeaStageEditCommand(continuum, indexFallbackCommand);
assert.equal(indexFallbackResult.status, 'REJECTED');
assert.ok(indexFallbackResult.diagnostics.some((row) => row.code === 'LAFEA_ENTITY_NOT_FOUND'));

const commandWithUnknownKey = { ...materialCommand, unexpected: true };
const unknownKeyResult = applyLafeaStageEditCommand(continuum, commandWithUnknownKey);
assert.equal(unknownKeyResult.status, 'REJECTED');
assert.match(unknownKeyResult.diagnostics[0].message, /exact-key contract mismatch/u);

assert.deepEqual(Object.keys(materialResult).sort(), [
  'audit', 'change', 'commandId', 'currentDocumentDigest', 'dependencyImpact',
  'diagnostics', 'document', 'previousDocumentDigest', 'schema', 'stageId', 'status',
].sort());
assert.ok(Object.isFrozen(materialResult));
assert.ok(Object.isFrozen(materialResult.document));

console.log(JSON.stringify({
  check: 'lafea-u2a-input-command-contracts',
  status: 'PASS',
  descriptorSchema: LAFEA_INPUT_DESCRIPTOR_SCHEMA,
  commandSchema: LAFEA_EDIT_COMMAND_SCHEMA,
  resultSchema: LAFEA_EDIT_RESULT_SCHEMA,
  stagesWithTypedDescriptors: ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5'],
  blockedStages: ['LAFEA.6'],
  silentZeroCoercion: false,
  arrayIndexAuthority: false,
  wholeDocumentReplacement: true,
  deterministicIdentityAllocation: true,
  orphanEntityAddRejected: true,
}));
