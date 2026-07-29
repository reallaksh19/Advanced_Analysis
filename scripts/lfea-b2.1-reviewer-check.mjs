import assert from 'node:assert/strict';
import {
  sealLinearFeaModel,
} from '../src/core/linear-fea-contract/index.js';
import {
  axialModel,
  clone,
  diagnosticModel,
} from './lfea-b2.1-model-fixtures.mjs';

function twoConstraintModel() {
  const model = axialModel();
  model.constraints = [
    {
      constraintId: 'A-FIXED',
      nodeId: 'N-000120',
      dof: 'UX',
      behavior: 'FIXED',
      basis: 'GLOBAL',
      stiffness: null,
    },
    {
      constraintId: 'Z-SPRING',
      nodeId: 'N-000120',
      dof: 'UZ',
      behavior: 'LINEAR_SPRING',
      basis: 'GLOBAL',
      stiffness: 4e6,
    },
  ];
  return model;
}

function twoElementModel() {
  const model = axialModel();
  model.nodes.push({
    nodeId: 'N-000122',
    position: { x: 2.4, y: 0, z: 0 },
    sourceAncestry: {
      conditionedNodeId: 'CN-122',
      sourceNodeIds: ['Area A/Node:122'],
      sourceComponentIds: ['Line 1 / Component:14'],
      creationBasis: 'SOURCE_ENDPOINT',
    },
  });
  model.elements[0].elementId = 'A-ELEMENT';
  const second = clone(model.elements[0]);
  second.elementId = 'Z-ELEMENT';
  second.nodeI = 'N-000121';
  second.nodeJ = 'N-000122';
  second.localAxes.evidenceIdentity = 'AXIS-E-000121';
  second.sourceAncestry.conditionedSegmentId = 'SEG-000122';
  model.elements.push(second);
  return model;
}

const baseConstraints = sealLinearFeaModel(twoConstraintModel());
const renamedConstraintsInput = twoConstraintModel();
renamedConstraintsInput.constraints[0].constraintId = 'Z-FIXED';
renamedConstraintsInput.constraints[1].constraintId = 'A-SPRING';
const renamedConstraints = sealLinearFeaModel(renamedConstraintsInput);
assert.equal(
  baseConstraints.stiffnessStateHash,
  renamedConstraints.stiffnessStateHash,
  'constraint record IDs must not alter stiffness identity',
);
assert.notEqual(
  baseConstraints.semanticHash,
  renamedConstraints.semanticHash,
  'constraint record IDs remain accepted-model semantics',
);

const baseElements = sealLinearFeaModel(twoElementModel());
const renamedElementsInput = twoElementModel();
renamedElementsInput.elements[0].elementId = 'Z-FIRST';
renamedElementsInput.elements[1].elementId = 'A-SECOND';
const renamedElements = sealLinearFeaModel(renamedElementsInput);
assert.equal(
  baseElements.stiffnessStateHash,
  renamedElements.stiffnessStateHash,
  'element record IDs must not alter stiffness identity',
);
assert.notEqual(
  baseElements.semanticHash,
  renamedElements.semanticHash,
  'element record IDs remain accepted-model semantics',
);

const canonicalSourceBase = sealLinearFeaModel(axialModel());
const sourceInput = diagnosticModel();
sourceInput.nodes[0].sourceAncestry.sourceNodeIds = ['Area A/Node:120'];
sourceInput.nodes[0].sourceAncestry.sourceComponentIds = ['Line 1 / Component:14'];
sourceInput.materialStates[0].materialId = 'ASTM A106 Gr. B';
sourceInput.materialStates[0].sourceEvidence[0].sourceId = 'Project/Material DB:Primary';
sourceInput.materialStates[0].sourceEvidence[0].sourceRevision = 'Rev 4';
sourceInput.elements[0].sourceAncestry.sourceComponentId = 'Line 1 / Component:14';
sourceInput.diagnostics[0].evidence[0].sourceId = 'Project/Material DB:Primary';
sourceInput.diagnostics[0].evidence[0].sourceRevision = 'Rev 4';
const retainedSource = sealLinearFeaModel(sourceInput);
assert.deepEqual(
  retainedSource.nodes[0].sourceAncestry.sourceNodeIds,
  ['Area A/Node:120'],
  'source node identity must be retained exactly',
);
assert.equal(retainedSource.materialStates[0].materialId, 'ASTM A106 Gr. B');
assert.equal(retainedSource.materialStates[0].sourceEvidence[0].sourceId, 'Project/Material DB:Primary');
assert.equal(retainedSource.materialStates[0].sourceEvidence[0].sourceRevision, 'Rev 4');
assert.equal(
  canonicalSourceBase.stiffnessStateHash,
  retainedSource.stiffnessStateHash,
  'source ancestry and evidence must not alter stiffness identity',
);
assert.notEqual(
  canonicalSourceBase.semanticHash,
  retainedSource.semanticHash,
  'source ancestry and resolved material identity must remain semantic',
);

console.log('LFEA B-2.1 reviewer regression check PASS');
