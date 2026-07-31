import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { add, combine, norm, subtract } from '../shared-analysis-contract/vector3.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import {
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../support-restraints/index.js';
import {
  DEFINITION_INPUT_KEYS,
  INTERFACE_KINDS,
  INTERFACE_PROFILE_SCHEMA,
  INTERFACE_SET_SCHEMA,
  INTERFACE_SIGN_CONVENTIONS,
  PROHIBITED_INTERFACE_STATES,
  canonicalBasis,
  canonicalDofMappings,
  canonicalSourceEvidence,
  canonicalSupportBinding,
  compareAscii,
  failInterface,
  requireArray,
  requireHash,
  requireRecord,
  sealInterfaceProfile,
} from './contracts.js';

export const INTERFACE_SET_INPUT_KEYS = Object.freeze([
  'compilation',
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'definitions',
  'profile',
]);
export const INTERFACE_SET_KEYS = Object.freeze([
  'schema',
  'profileId',
  'profileSemanticHash',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'supportAttachmentModelSemanticHash',
  'restraintCapabilityModelSemanticHash',
  'interfaces',
  'semanticHash',
  'evidenceHash',
]);
export const INTERFACE_DEFINITION_KEYS = Object.freeze([
  'interfaceId',
  'interfaceKind',
  'nodeId',
  'sourceEntityId',
  'supportBinding',
  'basis',
  'basisQualification',
  'referencePointGlobal',
  'leverReferenceToNodeLocal',
  'dofMappings',
  'reportingSignConvention',
  'sourceEvidence',
  'allowableProfileHash',
  'semanticHash',
]);

export function compileLinearPipingInterfaceSet(input) {
  exactKeys(input, INTERFACE_SET_INPUT_KEYS, 'interfaceSetInput');
  const compilation = requireMechanicalModelCompilation(input.compilation);
  const profile = sealInterfaceProfile(input.profile);
  const supportAuthorities = requireSupportAuthorities(
    input.supportAttachmentModel,
    input.restraintCapabilityModel,
  );
  const context = { compilation, profile, ...supportAuthorities };
  const interfaces = requireArray(input.definitions, 'interfaceSetInput.definitions')
    .map((definition, index) => compileDefinition(definition, context, index))
    .sort((left, right) => compareAscii(left.interfaceId, right.interfaceId));

  if (interfaces.length === 0) {
    failInterface('interfaceSetInput.definitions must contain at least one interface.', 'PIPING_INTERFACE_SET_EMPTY');
  }
  requireUniqueInterfaces(interfaces);
  requireUniqueReactionOwnership(interfaces);

  const draft = {
    schema: INTERFACE_SET_SCHEMA,
    profileId: profile.profileId,
    profileSemanticHash: profile.semanticHash,
    mechanicalModelSemanticHash: compilation.mechanicalModelSemanticHash,
    stiffnessStateHash: compilation.stiffnessStateHash,
    supportAttachmentModelSemanticHash: supportAuthorities.attachmentModel?.semanticHash ?? null,
    restraintCapabilityModelSemanticHash: supportAuthorities.restraintModel?.semanticHash ?? null,
    interfaces,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInterfaceSetSemanticHash(draft);
  draft.evidenceHash = computeInterfaceSetEvidenceHash(draft);
  return requireLinearPipingInterfaceSet(draft);
}

function compileDefinition(source, context, index) {
  const field = `interfaceSetInput.definitions[${index}]`;
  exactKeys(source, DEFINITION_INPUT_KEYS, field);
  const interfaceKind = member(source.interfaceKind, INTERFACE_KINDS, `${field}.interfaceKind`);
  const interfaceId = nonEmptyString(source.interfaceId, `${field}.interfaceId`);
  const nodeId = nonEmptyString(source.nodeId, `${field}.nodeId`);
  const sourceEntityId = nonEmptyString(source.sourceEntityId, `${field}.sourceEntityId`);
  const node = context.compilation.model.nodes.find((row) => row.nodeId === nodeId);
  if (!node) failInterface(`${field}.nodeId is absent from the B-2.5 model.`, 'PIPING_INTERFACE_NODE_MISSING');
  if (!node.sourceAncestry.sourceComponentIds.includes(sourceEntityId)) {
    failInterface(
      `${field}.sourceEntityId is not in the node source ancestry.`,
      'PIPING_INTERFACE_SOURCE_ANCESTRY_MISMATCH',
    );
  }

  const { basis, qualification } = canonicalBasis(source.basis, context.profile, `${field}.basis`);
  requireCoincident(node.position, basis.origin, context.profile.positionTolerance.value, 'PIPING_INTERFACE_NODE_FRAME_MISMATCH');
  const referencePointGlobal = canonicalPoint(source.referencePointGlobal, `${field}.referencePointGlobal`);
  const leverReferenceToNodeLocal = canonicalPoint(
    source.leverReferenceToNodeLocal,
    `${field}.leverReferenceToNodeLocal`,
  );
  requireReferenceOffsetConsistency(
    basis,
    referencePointGlobal,
    leverReferenceToNodeLocal,
    context.profile.offsetTolerance.value,
  );

  const supportBinding = canonicalSupportBinding(
    source.supportBinding,
    interfaceKind === 'SUPPORT' || interfaceKind === 'ANCHOR',
    `${field}.supportBinding`,
  );
  if (supportBinding) requireSupportBinding(supportBinding, sourceEntityId, context);
  else if (interfaceKind === 'SUPPORT' || interfaceKind === 'ANCHOR') {
    failInterface(`${field}.supportBinding is required.`, 'PIPING_INTERFACE_SUPPORT_BINDING_REQUIRED');
  }

  const dofMappings = canonicalDofMappings(source.dofMappings, `${field}.dofMappings`);
  if (interfaceKind === 'ANCHOR' && dofMappings.length !== 6) {
    failInterface(`${field} ANCHOR must own all six DOFs.`, 'PIPING_INTERFACE_ANCHOR_DOF_INCOMPLETE');
  }
  requireMappingsMatchModel(nodeId, dofMappings, context.compilation.model.constraints, field);
  const reportingSignConvention = member(
    source.reportingSignConvention,
    INTERFACE_SIGN_CONVENTIONS,
    `${field}.reportingSignConvention`,
  );
  const allowableProfileHash = source.allowableProfileHash === null
    ? null
    : requireHash(source.allowableProfileHash, `${field}.allowableProfileHash`);

  const draft = {
    interfaceId,
    interfaceKind,
    nodeId,
    sourceEntityId,
    supportBinding,
    basis,
    basisQualification: qualification,
    referencePointGlobal,
    leverReferenceToNodeLocal,
    dofMappings,
    reportingSignConvention,
    sourceEvidence: canonicalSourceEvidence(source.sourceEvidence, `${field}.sourceEvidence`),
    allowableProfileHash,
    semanticHash: '',
  };
  draft.semanticHash = semanticHash(interfaceSemanticProjection(draft));
  return deepFreeze(draft);
}

function requireSupportAuthorities(attachmentModel, restraintModel) {
  if (attachmentModel === null && restraintModel === null) {
    return { attachmentModel: null, restraintModel: null };
  }
  if (attachmentModel === null || restraintModel === null) {
    failInterface('Support attachment and restraint models must be supplied together.', 'PIPING_INTERFACE_SUPPORT_AUTHORITY_PARTIAL');
  }
  const attachmentValidation = validateSupportAttachmentModel(attachmentModel);
  if (!attachmentValidation.ok) {
    failInterface('Support attachment model is invalid.', 'PIPING_INTERFACE_ATTACHMENT_MODEL_INVALID', attachmentValidation.errors);
  }
  const restraintValidation = validateRestraintCapabilityModel(restraintModel);
  if (!restraintValidation.ok) {
    failInterface('Restraint capability model is invalid.', 'PIPING_INTERFACE_RESTRAINT_MODEL_INVALID', restraintValidation.errors);
  }
  if (restraintModel.attachmentModelSemanticHash !== attachmentModel.semanticHash) {
    failInterface('Restraint model does not belong to the supplied attachment model.', 'PIPING_INTERFACE_SUPPORT_AUTHORITY_MISMATCH');
  }
  return { attachmentModel, restraintModel };
}

function requireSupportBinding(binding, sourceEntityId, context) {
  if (!context.attachmentModel || !context.restraintModel) {
    failInterface('Support interfaces require governed support authorities.', 'PIPING_INTERFACE_SUPPORT_AUTHORITY_REQUIRED');
  }
  const attachment = context.attachmentModel.attachments.find((row) => row.attachmentId === binding.attachmentId);
  const restraint = context.restraintModel.restraints.find((row) => row.restraintId === binding.restraintId);
  if (!attachment || !restraint) {
    failInterface('Support binding references a missing governed record.', 'PIPING_INTERFACE_SUPPORT_BINDING_MISSING');
  }
  if (attachment.supportKey !== binding.supportKey || restraint.supportKey !== binding.supportKey) {
    failInterface('Support binding identities disagree.', 'PIPING_INTERFACE_SUPPORT_BINDING_MISMATCH');
  }
  if (restraint.attachmentId !== binding.attachmentId || attachment.attachedComponentKey !== sourceEntityId) {
    failInterface('Support binding does not match the interface source entity.', 'PIPING_INTERFACE_SUPPORT_BINDING_MISMATCH');
  }
  if (!restraint.solverEligible) {
    failInterface('Governed restraint is not solver eligible.', 'PIPING_INTERFACE_RESTRAINT_NOT_ELIGIBLE');
  }
  for (const direction of ['vertical', 'lateral', 'longitudinal', 'rotational']) {
    if (PROHIBITED_INTERFACE_STATES.includes(restraint[direction].state)) {
      failInterface(
        `Governed restraint ${direction} state is not linear-interface eligible.`,
        'PIPING_INTERFACE_NONLINEAR_RESTRAINT_BLOCKED',
      );
    }
  }
}

function requireMappingsMatchModel(nodeId, mappings, constraints, field) {
  for (const mapping of mappings) {
    const constraint = constraints.find((row) => row.nodeId === nodeId && row.dof === mapping.dof);
    if (!constraint) {
      failInterface(`${field} maps an unconstrained model DOF.`, 'PIPING_INTERFACE_CONSTRAINT_MISSING');
    }
    if (constraint.constraintId !== mapping.constraintId || constraint.behavior !== mapping.behavior) {
      failInterface(`${field} mapping differs from the B-2.5 constraint.`, 'PIPING_INTERFACE_CONSTRAINT_MISMATCH');
    }
    const modelStiffness = constraint.stiffness ?? null;
    if (modelStiffness !== mapping.stiffness) {
      failInterface(`${field} stiffness differs from the B-2.5 constraint.`, 'PIPING_INTERFACE_CONSTRAINT_MISMATCH');
    }
  }
}

function requireUniqueInterfaces(interfaces) {
  const ids = interfaces.map((row) => row.interfaceId);
  if (new Set(ids).size !== ids.length) {
    failInterface('Interface IDs must be unique.', 'PIPING_INTERFACE_ID_DUPLICATE');
  }
}

function requireUniqueReactionOwnership(interfaces) {
  const owners = new Map();
  for (const definition of interfaces) {
    for (const mapping of definition.dofMappings) {
      const key = `${definition.nodeId}:${mapping.dof}`;
      if (owners.has(key)) {
        failInterface(
          `Reaction slot ${key} is owned by more than one interface.`,
          'PIPING_INTERFACE_REACTION_OWNERSHIP_DUPLICATE',
        );
      }
      owners.set(key, definition.interfaceId);
    }
  }
}

function requireCoincident(left, right, tolerance, code) {
  if (norm(subtract(left, right)) > tolerance) {
    failInterface('Declared interface position is not coincident with the analysis node.', code);
  }
}

function requireReferenceOffsetConsistency(basis, referencePoint, leverLocal, tolerance) {
  const leverGlobal = combine(basis, { a: leverLocal.x, b: leverLocal.y, c: leverLocal.z });
  const reconstructedNode = add(referencePoint, leverGlobal);
  if (norm(subtract(reconstructedNode, basis.origin)) > tolerance) {
    failInterface(
      'referencePointGlobal and leverReferenceToNodeLocal are inconsistent.',
      'PIPING_INTERFACE_OFFSET_INCONSISTENT',
    );
  }
}

function canonicalPoint(source, field) {
  requireRecord(source, field);
  exactKeys(source, ['x', 'y', 'z'], field);
  return deepFreeze({
    x: Number(source.x),
    y: Number(source.y),
    z: Number(source.z),
  });
}

export function interfaceSemanticProjection(record) {
  const { semanticHash: _semanticHash, ...projection } = record;
  return projection;
}

export function computeInterfaceSetSemanticHash(record) {
  return semanticHash({
    schema: record.schema,
    profileId: record.profileId,
    profileSemanticHash: record.profileSemanticHash,
    mechanicalModelSemanticHash: record.mechanicalModelSemanticHash,
    stiffnessStateHash: record.stiffnessStateHash,
    supportAttachmentModelSemanticHash: record.supportAttachmentModelSemanticHash,
    restraintCapabilityModelSemanticHash: record.restraintCapabilityModelSemanticHash,
    interfaces: record.interfaces.map((row) => ({ interfaceId: row.interfaceId, semanticHash: row.semanticHash })),
  });
}

export function computeInterfaceSetEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    interfaceSourceEvidence: record.interfaces.map((row) => ({
      interfaceId: row.interfaceId,
      sourceEvidence: row.sourceEvidence,
      basisQualification: row.basisQualification,
    })),
  });
}

export function requireLinearPipingInterfaceSet(record) {
  exactKeys(record, INTERFACE_SET_KEYS, 'interfaceSet');
  if (record.schema !== INTERFACE_SET_SCHEMA) {
    failInterface(`interfaceSet.schema must be ${INTERFACE_SET_SCHEMA}.`, 'PIPING_INTERFACE_SET_INVALID');
  }
  nonEmptyString(record.profileId, 'interfaceSet.profileId');
  requireHash(record.profileSemanticHash, 'interfaceSet.profileSemanticHash');
  requireHash(record.mechanicalModelSemanticHash, 'interfaceSet.mechanicalModelSemanticHash');
  requireHash(record.stiffnessStateHash, 'interfaceSet.stiffnessStateHash');
  requireHash(record.supportAttachmentModelSemanticHash, 'interfaceSet.supportAttachmentModelSemanticHash', true);
  requireHash(record.restraintCapabilityModelSemanticHash, 'interfaceSet.restraintCapabilityModelSemanticHash', true);
  requireArray(record.interfaces, 'interfaceSet.interfaces');
  for (const [index, definition] of record.interfaces.entries()) {
    exactKeys(definition, INTERFACE_DEFINITION_KEYS, `interfaceSet.interfaces[${index}]`);
    const expected = semanticHash(interfaceSemanticProjection(definition));
    if (definition.semanticHash !== expected) {
      failInterface('Interface definition hash is stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
    }
  }
  if (record.semanticHash !== computeInterfaceSetSemanticHash(record)) {
    failInterface('Interface set semantic hash is stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
  }
  if (record.evidenceHash !== computeInterfaceSetEvidenceHash(record)) {
    failInterface('Interface set evidence hash is stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}
