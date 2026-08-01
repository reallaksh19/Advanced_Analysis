import {
  ALL_ENGINEERING_DESCENDANTS,
  MODEL_DESCENDANTS,
  collectionScalar,
  entityDescriptor,
  vectorDescriptors,
} from './lafea-stage-input-descriptor-contracts.js';

export const LAFEA_SHELL_INPUT_DESCRIPTORS = Object.freeze({
  'LAFEA.5': Object.freeze([
    entityDescriptor('LAFEA.5.shell.nodes.entity', 'LAFEA.5', {
      collectionPath: 'shellTemplate.nodes', identityKey: 'nodeId',
      identityPrefix: 'N', label: 'Host-shell node',
      groupId: 'SHELL_NODES', order: 1,
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.5.shell.material.elasticModulus', 'LAFEA.5', {
      collectionPath: 'shellTemplate.materials', identityKey: 'materialId',
      propertyPath: ['elasticModulus'], label: 'Host-shell elastic modulus',
      groupId: 'SHELL_MATERIALS', order: 10,
      dimension: 'MODULUS',
      unitSourcePath: ['shellTemplate', 'units', 'modulus'],
      sourceRefPath: ['sourceReference'],
      invalidationClass: 'MATERIAL_PROPERTY', descendants: MODEL_DESCENDANTS,
      minimum: 0, minimumExclusive: true,
    }),
    ...vectorDescriptors({
      descriptorPrefix: 'LAFEA.5.shell.node.position', stageId: 'LAFEA.5',
      collectionPath: 'shellTemplate.nodes', identityKey: 'nodeId',
      propertyPrefix: ['position'], sourceRefPath: ['sourceReference'],
      labelPrefix: 'Host-shell node position', groupId: 'SHELL_NODES', order: 20,
      dimension: 'LENGTH',
      unitSourcePath: ['shellTemplate', 'units', 'length'],
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.5.shell.element.thickness', 'LAFEA.5', {
      collectionPath: 'shellTemplate.elements', identityKey: 'elementId',
      propertyPath: ['thickness'], label: 'Host-shell element thickness',
      groupId: 'SHELL_ELEMENTS', order: 50,
      dimension: 'LENGTH',
      unitSourcePath: ['shellTemplate', 'units', 'length'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS,
      minimum: 0, minimumExclusive: true,
    }),
    collectionScalar('LAFEA.5.mapping.mechanicalScaleFactor', 'LAFEA.5', {
      collectionPath: 'loadCaseMappings', identityKey: 'workflowLoadCaseId',
      propertyPath: ['mechanicalScaleFactor'], label: 'Mechanical scale factor',
      groupId: 'LOAD_CASE_MAPPINGS', order: 60,
      dimension: 'DIMENSIONLESS', sourceRefPath: ['sourceReference'],
      invalidationClass: 'LOAD_OR_BC', descendants: MODEL_DESCENDANTS,
    }),
  ]),
  'LAFEA.6': Object.freeze([]),
});
