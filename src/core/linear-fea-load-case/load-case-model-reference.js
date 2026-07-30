import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { CONSTRAINT_DOFS } from '../linear-fea-contract/model-schema.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import {
  LOAD_CASE_MODEL_REFERENCE_SCHEMA,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireHash,
  requireIdentity,
  requireMember,
  requireRecord,
} from './load-case-contract.js';

const REFERENCE_CODE = 'LOAD_CASE_MODEL_REFERENCE_INVALID';

export const MODEL_REFERENCE_KEYS = Object.freeze([
  'schema',
  'modelIdentity',
  'modelRevision',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'nodeIds',
  'elementIds',
  'materialStateIds',
  'prescribedSlots',
  'semanticHash',
]);

export const PRESCRIBED_SLOT_KEYS = Object.freeze(['slotId', 'nodeId', 'dof']);

/**
 * Project a compiled mechanical model down to the identities a load case is
 * allowed to name.
 *
 * The load case cites the model by identity and by the entity names it must
 * resolve against — nothing else. No coordinate, material property, section
 * property or local axis crosses into the load-case layer, because a load case
 * that carried model internals would drag the model into its own hash and the
 * section 2.1 chain would stop being a chain.
 *
 * The compilation is re-accepted through B-2.5's own validator, so a tampered
 * record is rejected by its owner before this package reads it.
 *
 * @param {object} compilation `fea-linear-mechanical-model-compilation/v1`.
 * @returns {Readonly<object>} `fea-linear-load-case-model-reference/v1`.
 */
export function modelReferenceFromCompilation(compilation) {
  const accepted = requireMechanicalModelCompilation(compilation);
  const model = accepted.model;
  const draft = {
    schema: LOAD_CASE_MODEL_REFERENCE_SCHEMA,
    modelIdentity: model.modelIdentity,
    modelRevision: model.modelRevision,
    mechanicalModelSemanticHash: accepted.mechanicalModelSemanticHash,
    stiffnessStateHash: accepted.stiffnessStateHash,
    nodeIds: model.nodes.map((node) => node.nodeId).sort(compareAscii),
    elementIds: model.elements.map((element) => element.elementId).sort(compareAscii),
    materialStateIds: model.materialStates.map((state) => state.materialStateId).sort(compareAscii),
    prescribedSlots: model.constraints
      .filter((constraint) => constraint.behavior === 'PRESCRIBED_SLOT')
      .map((constraint) => ({
        slotId: constraint.constraintId,
        nodeId: constraint.nodeId,
        dof: constraint.dof,
      }))
      .sort((left, right) => compareAscii(left.slotId, right.slotId)),
    semanticHash: '',
  };
  draft.semanticHash = computeModelReferenceSemanticHash(draft);
  return requireModelReference(draft);
}

export function modelReferenceSemanticProjection(reference) {
  return {
    schema: reference.schema,
    modelIdentity: reference.modelIdentity,
    modelRevision: reference.modelRevision,
    mechanicalModelSemanticHash: reference.mechanicalModelSemanticHash,
    stiffnessStateHash: reference.stiffnessStateHash,
    nodeIds: [...reference.nodeIds].sort(compareAscii),
    elementIds: [...reference.elementIds].sort(compareAscii),
    materialStateIds: [...reference.materialStateIds].sort(compareAscii),
    prescribedSlots: [...reference.prescribedSlots]
      .map((slot) => ({ slotId: slot.slotId, nodeId: slot.nodeId, dof: slot.dof }))
      .sort((left, right) => compareAscii(left.slotId, right.slotId)),
  };
}

export function computeModelReferenceSemanticHash(reference) {
  return semanticHash(modelReferenceSemanticProjection(reference));
}

export function requireModelReference(reference) {
  requireExactKeys(reference, MODEL_REFERENCE_KEYS, 'modelReference', REFERENCE_CODE);
  if (reference.schema !== LOAD_CASE_MODEL_REFERENCE_SCHEMA) {
    fail('modelReference.schema is unsupported.', REFERENCE_CODE);
  }
  requireIdentity(reference.modelIdentity, 'modelReference.modelIdentity', REFERENCE_CODE);
  if (!Number.isInteger(reference.modelRevision) || reference.modelRevision < 1) {
    fail('modelReference.modelRevision must be a positive integer.', REFERENCE_CODE);
  }
  requireHash(
    reference.mechanicalModelSemanticHash,
    'modelReference.mechanicalModelSemanticHash',
    REFERENCE_CODE,
  );
  requireHash(reference.stiffnessStateHash, 'modelReference.stiffnessStateHash', REFERENCE_CODE);
  const nodeIds = requireIdentityList(reference.nodeIds, 'modelReference.nodeIds');
  const elementIds = requireIdentityList(reference.elementIds, 'modelReference.elementIds');
  const materialStateIds = requireIdentityList(
    reference.materialStateIds,
    'modelReference.materialStateIds',
  );
  requireArray(reference.prescribedSlots, 'modelReference.prescribedSlots', REFERENCE_CODE);
  const slots = reference.prescribedSlots.map((slot, index) => {
    const field = `modelReference.prescribedSlots[${index}]`;
    requireExactKeys(slot, PRESCRIBED_SLOT_KEYS, field, REFERENCE_CODE);
    const nodeId = requireIdentity(slot.nodeId, `${field}.nodeId`, REFERENCE_CODE);
    if (!nodeIds.includes(nodeId)) {
      fail(`${field}.nodeId is absent from modelReference.nodeIds.`, REFERENCE_CODE);
    }
    return {
      slotId: requireIdentity(slot.slotId, `${field}.slotId`, REFERENCE_CODE),
      nodeId,
      dof: requireMember(slot.dof, CONSTRAINT_DOFS, `${field}.dof`, REFERENCE_CODE),
    };
  });
  requireUnique(slots.map((slot) => slot.slotId), 'modelReference.prescribedSlots');
  requireHash(reference.semanticHash, 'modelReference.semanticHash', REFERENCE_CODE);
  if (reference.semanticHash !== computeModelReferenceSemanticHash(reference)) {
    fail('modelReference.semanticHash is stale.', 'LOAD_CASE_HASH_MISMATCH');
  }
  return deepFreeze({
    schema: reference.schema,
    modelIdentity: reference.modelIdentity,
    modelRevision: reference.modelRevision,
    mechanicalModelSemanticHash: reference.mechanicalModelSemanticHash,
    stiffnessStateHash: reference.stiffnessStateHash,
    nodeIds: [...nodeIds].sort(compareAscii),
    elementIds: [...elementIds].sort(compareAscii),
    materialStateIds: [...materialStateIds].sort(compareAscii),
    prescribedSlots: [...slots].sort((left, right) => compareAscii(left.slotId, right.slotId)),
    semanticHash: reference.semanticHash,
  });
}

function requireIdentityList(value, field) {
  requireArray(value, field, REFERENCE_CODE);
  const accepted = value.map((entry, index) => requireIdentity(entry, `${field}[${index}]`, REFERENCE_CODE));
  requireUnique(accepted, field);
  return accepted;
}

function requireUnique(values, field) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${field} declares ${value} more than once.`, REFERENCE_CODE);
    seen.add(value);
  }
}

/** Reject a node the bound mechanical model does not contain. */
export function requireBoundNode(reference, nodeId, field) {
  const accepted = requireIdentity(nodeId, field, 'LOAD_CASE_PRIMITIVE_INVALID');
  if (!reference.nodeIds.includes(accepted)) {
    fail(`${field} names node ${accepted}, which is absent from the bound mechanical model.`, 'LOAD_CASE_NODE_UNKNOWN');
  }
  return accepted;
}

/** Reject an element the bound mechanical model does not contain. */
export function requireBoundElement(reference, elementId, field) {
  const accepted = requireIdentity(elementId, field, 'LOAD_CASE_PRIMITIVE_INVALID');
  if (!reference.elementIds.includes(accepted)) {
    fail(
      `${field} names element ${accepted}, which is absent from the bound mechanical model.`,
      'LOAD_CASE_ELEMENT_UNKNOWN',
    );
  }
  return accepted;
}

/** Reject a material state the bound mechanical model does not carry. */
export function requireBoundMaterialState(reference, materialStateId, field) {
  const accepted = requireIdentity(materialStateId, field, 'LOAD_CASE_PRIMITIVE_INVALID');
  if (!reference.materialStateIds.includes(accepted)) {
    fail(
      `${field} names material state ${accepted}, which is absent from the bound mechanical model.`,
      'LOAD_CASE_MATERIAL_STATE_UNKNOWN',
    );
  }
  return accepted;
}

/**
 * Resolve a named prescribed slot. Section 6 binds case-specific movement to a
 * `PRESCRIBED_SLOT` record; in `fea-linear-model/v1` that record is the model
 * constraint whose behavior is `PRESCRIBED_SLOT`, so the slot name is the
 * constraint identity and the node/DOF it governs are the model's, never the
 * load case's to restate differently.
 */
export function requirePrescribedSlot(reference, slotId, field) {
  const accepted = requireIdentity(slotId, field, 'LOAD_CASE_PRIMITIVE_INVALID');
  const slot = reference.prescribedSlots.find((entry) => entry.slotId === accepted);
  if (slot === undefined) {
    fail(
      `${field} names prescribed slot ${accepted}, which the bound mechanical model does not declare.`,
      'LOAD_CASE_PRESCRIBED_SLOT_UNKNOWN',
    );
  }
  return slot;
}

export function requireModelReferenceRecord(reference) {
  return requireModelReference(requireRecord(reference, 'modelReference', REFERENCE_CODE));
}
