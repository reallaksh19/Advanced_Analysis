import assert from 'node:assert/strict';
import { SketcherDraftAuthority } from '../src/core/sketcher-draft/index.js';

const authority = new SketcherDraftAuthority();
assertMutation(authority, 'SET_WORKING_PLANE', { workingPlane: 'XZ' });
assertMutation(authority, 'SET_WORKING_PLANE', { workingPlane: 'XY' });
const firstBefore = authority.getDocument();
assertMutation(authority, 'ADD_PIPE_SEGMENT', { start:{xMm:0,yMm:0,zMm:0}, end:{xMm:1000,yMm:0,zMm:0}, snapToGrid:true, gridSizeMm:100 });
const firstHash = authority.getDocument().semanticHash;
assert.equal(authority.getDocument().nodes[0].nodeId, 'N001');
assert.equal(authority.getDocument().nodes[1].nodeId, 'N002');
assertMutation(authority, 'ADD_PIPE_SEGMENT', { start:{nodeId:'N002'}, end:{xMm:1000,yMm:1000,zMm:0}, snapToGrid:true, gridSizeMm:100 });
const secondHash = authority.getDocument().semanticHash;
assert.deepEqual(authority.getDocument().segments.map((row)=>row.segmentId), ['S001','S002']);

const rejectedDuplicate = execute(authority, 'ADD_PIPE_SEGMENT', { start:{nodeId:'N002'}, end:{nodeId:'N001'} });
assertRejectedUnchanged(rejectedDuplicate, secondHash, authority.getDocument().revision);
const rejectedZero = execute(authority, 'ADD_PIPE_SEGMENT', { start:{nodeId:'N002'}, end:{xMm:1000,yMm:0,zMm:0} });
assertRejectedUnchanged(rejectedZero, secondHash, authority.getDocument().revision);
const beforeInvalid = authority.getDocument();
assert.throws(() => authority.createCommand('MOVE_NODE', { nodeId:'N003', position:{xMm:Infinity,yMm:1000,zMm:0} }), /Non-finite/);
assert.equal(authority.getDocument().semanticHash, beforeInvalid.semanticHash);
assert.equal(authority.getDocument().revision, beforeInvalid.revision);
const rejectedReferenced = execute(authority, 'DELETE_NODE', { nodeId:'N002' });
assert.equal(rejectedReferenced.code, 'SKETCHER_NODE_REFERENCED');
assertRejectedUnchanged(rejectedReferenced, secondHash, authority.getDocument().revision);

const beforeMove = authority.getDocument();
const moved = assertMutation(authority, 'MOVE_NODE', { nodeId:'N003', position:{xMm:1500,yMm:1000,zMm:0} });
assert.equal(moved.document.nodes.find((row)=>row.nodeId==='N003').nodeId, 'N003');
assert.equal(moved.document.nodes.find((row)=>row.nodeId==='N003').xMm, 1500);
const movedHash = moved.document.semanticHash;
const undo = authority.undo();
assert.equal(undo.accepted, true);
assert.equal(undo.document.semanticHash, beforeMove.semanticHash);
const redo = authority.redo();
assert.equal(redo.accepted, true);
assert.equal(redo.document.semanticHash, movedHash);
authority.undo();
assert.equal(authority.getStatus().canRedo, true);
assertMutation(authority, 'SET_WORKING_PLANE', { workingPlane:'YZ' });
assert.equal(authority.getStatus().canRedo, false);

const beforeDelete = authority.getDocument();
assertMutation(authority, 'DELETE_SEGMENT', { segmentId:'S002' });
assert.equal(authority.getDocument().segments.length, 1);
assert.equal(authority.undo().document.semanticHash, beforeDelete.semanticHash);
const beforeResetRevision = authority.getDocument().revision;
assertMutation(authority, 'RESET_DRAFT', {});
assert.equal(authority.getDocument().nodes.length, 0);
assert.equal(authority.getDocument().revision, beforeResetRevision + 1);

const left = fixedSequence(), right = fixedSequence();
assert.equal(left.getDocument().semanticHash, right.getDocument().semanticHash);
assert.equal(left.getAudit().semanticHash, right.getAudit().semanticHash);
assert.deepEqual(left.getDocument(), right.getDocument());
assert.deepEqual(left.getAudit(), right.getAudit());
assert.notEqual(firstBefore.semanticHash, firstHash);
console.log('✅ W10.R4 deterministic commands, rejection atomicity, identity and exact undo/redo passed.');

function execute(instance, commandType, payload) { return instance.execute(instance.createCommand(commandType, payload)); }
function assertMutation(instance, commandType, payload) {
  const before = instance.getDocument();
  const result = execute(instance, commandType, payload);
  assert.equal(result.accepted, true, `${commandType} should be accepted`);
  assert.equal(result.document.revision, before.revision + 1, `${commandType} must increment revision exactly once`);
  assert.notEqual(result.document.semanticHash, before.semanticHash, `${commandType} must change the document hash`);
  return result;
}
function assertRejectedUnchanged(result, hash, revision) { assert.equal(result.accepted, false); assert.equal(result.document.semanticHash, hash); assert.equal(result.document.revision, revision); }
function fixedSequence() {
  const instance = new SketcherDraftAuthority();
  execute(instance, 'ADD_PIPE_SEGMENT', { start:{xMm:0,yMm:0,zMm:0}, end:{xMm:1000,yMm:0,zMm:0}, snapToGrid:true, gridSizeMm:100 });
  execute(instance, 'ADD_PIPE_SEGMENT', { start:{nodeId:'N002'}, end:{xMm:1000,yMm:1000,zMm:0}, snapToGrid:true, gridSizeMm:100 });
  execute(instance, 'MOVE_NODE', { nodeId:'N003', position:{xMm:1200,yMm:1000,zMm:0} });
  return instance;
}
