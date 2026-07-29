import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireCanonicalNodeId } from './identifiers.js';
import { requireLinearFeaConventions } from './conventions.js';
import { requireLinearFeaUnits } from './units.js';
import { canonicalizeLinearFeaModel } from './model-canonicalization.js';
import {
  CONSTRAINT_BASES,
  CONSTRAINT_DOFS,
  LINEAR_FEA_FORMULATION_REGISTRY_VERSION,
  LINEAR_FEA_MODEL_SCHEMA,
  LINEAR_FEA_VALIDATION_PROFILE,
  LINEAR_FEA_VALIDATION_PROFILE_ID,
  MODEL_TOP_LEVEL_KEYS,
  RECORD_KEYS,
  SUPPORTED_CONSTRAINT_BEHAVIORS,
  SUPPORTED_FORMULATIONS,
} from './model-schema.js';
import { DIAGNOSTIC_SEVERITIES, LIMITATION_SEVERITIES } from './model-diagnostics.js';
import {
  computeEvidenceHash,
  computeSemanticHash,
  computeStiffnessStateHash,
  computeValidationProfileSemanticHash,
} from './model-hashes.js';

function fail(message, code) {
  throw new SharedAnalysisContractError(message, code);
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, 'NOT_A_RECORD');
  return value;
}

function requireExactKeys(value, expectedKeys, field) {
  requireRecord(value, field);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, 'MISSING_FIELD');
  }
  for (const key of Object.keys(value)) {
    if (!expectedKeys.includes(key)) fail(`${field} contains unexpected field ${key}.`, 'UNEXPECTED_FIELD');
  }
}

function requireAllowedKeys(value, requiredKeys, allowedKeys, field) {
  requireRecord(value, field);
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, 'MISSING_FIELD');
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) fail(`${field} contains unexpected field ${key}.`, 'UNEXPECTED_FIELD');
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, 'NOT_AN_ARRAY');
  return value;
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} must be finite.`, 'NONFINITE_VALUE');
  return Object.is(value, -0) ? 0 : value;
}

function requirePositive(value, field, code = 'NONPOSITIVE_VALUE') {
  const finite = requireFinite(value, field);
  if (!(finite > 0)) fail(`${field} must be greater than zero.`, code);
  return finite;
}

function requireNonnegative(value, field) {
  const finite = requireFinite(value, field);
  if (finite < 0) fail(`${field} must not be negative.`, 'NEGATIVE_TOLERANCE');
  return finite;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be a nonempty string.`, 'INVALID_STRING');
  if (value === 'UNKNOWN') fail(`${field} must be resolved.`, 'UNRESOLVED_VALUE');
  return value;
}

function requireIdentity(value, field) {
  requireString(value, field);
  try {
    return requireCanonicalNodeId(value);
  } catch {
    fail(`${field} is not canonical.`, 'INVALID_CANONICAL_IDENTITY');
  }
}

function requireSourceIdentity(value, field) {
  const sourceIdentity = requireString(value, field);
  if (sourceIdentity.trim().length === 0) fail(`${field} must not be whitespace-only.`, 'INVALID_SOURCE_IDENTITY');
  return sourceIdentity;
}

function requireHash(value, field, allowBlank) {
  if (allowBlank && value === '') return value;
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${field} must be a canonical hash.`, 'INVALID_HASH');
  }
  return value;
}

function requireUniqueIdentities(records, field, identityKey) {
  const identities = new Set();
  for (const record of records) {
    const identity = record[identityKey];
    if (identities.has(identity)) fail(`${field} contains duplicate ${identity}.`, 'DUPLICATE_IDENTITY');
    identities.add(identity);
  }
  return identities;
}

function validateIdentityArray(value, field, validator, duplicateCode) {
  requireArray(value, field);
  const seen = new Set();
  value.forEach((entry, index) => {
    const identity = validator(entry, `${field}[${index}]`);
    if (seen.has(identity)) fail(`${field} contains duplicate ${identity}.`, duplicateCode);
    seen.add(identity);
  });
}

function validateCanonicalStringArray(value, field) {
  validateIdentityArray(value, field, requireIdentity, 'DUPLICATE_ANCESTRY_IDENTITY');
}

function validateSourceStringArray(value, field) {
  validateIdentityArray(value, field, requireSourceIdentity, 'DUPLICATE_SOURCE_IDENTITY');
}

function validateSourceEvidence(value, field) {
  requireArray(value, field);
  if (value.length === 0) fail(`${field} must not be empty.`, 'MISSING_SOURCE_EVIDENCE');
  value.forEach((evidence, index) => {
    const evidenceField = `${field}[${index}]`;
    requireAllowedKeys(
      evidence,
      ['sourceId', 'sourceSemanticHash'],
      ['sourceId', 'sourceRevision', 'sourceSemanticHash'],
      evidenceField,
    );
    requireSourceIdentity(evidence.sourceId, `${evidenceField}.sourceId`);
    if (Object.hasOwn(evidence, 'sourceRevision')) {
      requireSourceIdentity(evidence.sourceRevision, `${evidenceField}.sourceRevision`);
    }
    requireHash(evidence.sourceSemanticHash, `${evidenceField}.sourceSemanticHash`, false);
  });
}

function validateAncestry(ancestry) {
  requireExactKeys(ancestry, RECORD_KEYS.ancestry, 'ancestry');
  RECORD_KEYS.ancestry.forEach((key) => requireHash(ancestry[key], `ancestry.${key}`, false));
}

function validateProfile(profile, allowBlankHashes) {
  requireExactKeys(profile, RECORD_KEYS.validationProfile, 'validationProfile');
  if (profile.profileId !== LINEAR_FEA_VALIDATION_PROFILE_ID) {
    fail('validationProfile.profileId is unsupported.', 'UNSUPPORTED_VALIDATION_PROFILE');
  }
  requirePositive(profile.zeroLengthTolerance, 'validationProfile.zeroLengthTolerance');
  requireNonnegative(profile.unitVectorTolerance, 'validationProfile.unitVectorTolerance');
  requireNonnegative(profile.orthogonalityTolerance, 'validationProfile.orthogonalityTolerance');
  requireNonnegative(profile.handednessTolerance, 'validationProfile.handednessTolerance');
  for (const [key, expected] of Object.entries(LINEAR_FEA_VALIDATION_PROFILE)) {
    if (profile[key] !== expected) {
      fail(`validationProfile.${key} does not match ${LINEAR_FEA_VALIDATION_PROFILE_ID}.`, 'INVALID_VALIDATION_PROFILE_VALUE');
    }
  }
  requireHash(profile.semanticHash, 'validationProfile.semanticHash', allowBlankHashes);
}

function validateNodes(nodes) {
  requireArray(nodes, 'nodes');
  nodes.forEach((node, index) => {
    const field = `nodes[${index}]`;
    requireExactKeys(node, RECORD_KEYS.node, field);
    requireIdentity(node.nodeId, `${field}.nodeId`);
    requireExactKeys(node.position, RECORD_KEYS.position, `${field}.position`);
    requireFinite(node.position.x, `${field}.position.x`);
    requireFinite(node.position.y, `${field}.position.y`);
    requireFinite(node.position.z, `${field}.position.z`);
    requireExactKeys(node.sourceAncestry, RECORD_KEYS.nodeAncestry, `${field}.sourceAncestry`);
    requireIdentity(node.sourceAncestry.conditionedNodeId, `${field}.sourceAncestry.conditionedNodeId`);
    validateSourceStringArray(node.sourceAncestry.sourceNodeIds, `${field}.sourceAncestry.sourceNodeIds`);
    validateSourceStringArray(node.sourceAncestry.sourceComponentIds, `${field}.sourceAncestry.sourceComponentIds`);
    requireIdentity(node.sourceAncestry.creationBasis, `${field}.sourceAncestry.creationBasis`);
  });
  return requireUniqueIdentities(nodes, 'nodes', 'nodeId');
}

function validateMaterialStates(states) {
  requireArray(states, 'materialStates');
  states.forEach((state, index) => {
    const field = `materialStates[${index}]`;
    requireExactKeys(state, RECORD_KEYS.materialState, field);
    requireIdentity(state.materialStateId, `${field}.materialStateId`);
    requireSourceIdentity(state.materialId, `${field}.materialId`);
    requirePositive(state.elasticModulus, `${field}.elasticModulus`, 'INVALID_MATERIAL_VALUE');
    requirePositive(state.shearModulus, `${field}.shearModulus`, 'INVALID_MATERIAL_VALUE');
    const poisson = requireFinite(state.poissonRatio, `${field}.poissonRatio`);
    if (!(poisson > -1 && poisson < 0.5)) fail(`${field}.poissonRatio is out of range.`, 'INVALID_MATERIAL_VALUE');
    requirePositive(state.massDensity, `${field}.massDensity`, 'INVALID_MATERIAL_VALUE');
    requireFinite(state.thermalExpansionCoefficient, `${field}.thermalExpansionCoefficient`);
    requirePositive(state.evaluationTemperature, `${field}.evaluationTemperature`, 'INVALID_MATERIAL_VALUE');
    validateSourceEvidence(state.sourceEvidence, `${field}.sourceEvidence`);
  });
  return requireUniqueIdentities(states, 'materialStates', 'materialStateId');
}

function validateSectionStates(states) {
  requireArray(states, 'sectionStates');
  states.forEach((state, index) => {
    const field = `sectionStates[${index}]`;
    requireExactKeys(state, RECORD_KEYS.sectionState, field);
    requireIdentity(state.sectionStateId, `${field}.sectionStateId`);
    requirePositive(state.area, `${field}.area`, 'INVALID_SECTION_VALUE');
    requirePositive(state.secondMomentY, `${field}.secondMomentY`, 'INVALID_SECTION_VALUE');
    requirePositive(state.secondMomentZ, `${field}.secondMomentZ`, 'INVALID_SECTION_VALUE');
    requirePositive(state.polarMoment, `${field}.polarMoment`, 'INVALID_SECTION_VALUE');
    validateSourceEvidence(state.sourceEvidence, `${field}.sourceEvidence`);
  });
  return requireUniqueIdentities(states, 'sectionStates', 'sectionStateId');
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function norm(vector) {
  return Math.sqrt(dot(vector, vector));
}

function validateVector(vector, field) {
  requireArray(vector, field);
  if (vector.length !== 3) fail(`${field} must have three components.`, 'INVALID_AXIS_VECTOR');
  vector.forEach((value, index) => requireFinite(value, `${field}[${index}]`));
}

function validateAxes(axes, field, profile) {
  requireExactKeys(axes, RECORD_KEYS.localAxes, field);
  validateVector(axes.x, `${field}.x`);
  validateVector(axes.y, `${field}.y`);
  validateVector(axes.z, `${field}.z`);
  requireIdentity(axes.policyId, `${field}.policyId`);
  requireIdentity(axes.evidenceIdentity, `${field}.evidenceIdentity`);
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(norm(axes[axis]) - 1) > profile.unitVectorTolerance) {
      fail(`${field}.${axis} is not unit length.`, 'NONUNIT_AXIS');
    }
  }
  for (const [left, right] of [['x', 'y'], ['y', 'z'], ['z', 'x']]) {
    if (Math.abs(dot(axes[left], axes[right])) > profile.orthogonalityTolerance) {
      fail(`${field} axes are not orthogonal.`, 'NONORTHOGONAL_AXES');
    }
  }
  const crossXY = cross(axes.x, axes.y);
  if (norm(crossXY) === 0 || dot(crossXY, axes.z) < 1 - profile.handednessTolerance) {
    fail(`${field} is not right-handed.`, 'LEFT_HANDED_AXES');
  }
}

function validateElements(elements, nodeIds, materialIds, sectionIds, nodesById, model) {
  requireArray(elements, 'elements');
  const registry = SUPPORTED_FORMULATIONS[model.formulationRegistryVersion];
  elements.forEach((element, index) => {
    const field = `elements[${index}]`;
    requireExactKeys(element, RECORD_KEYS.element, field);
    requireIdentity(element.elementId, `${field}.elementId`);
    requireIdentity(element.formulationId, `${field}.formulationId`);
    if (!registry.includes(element.formulationId)) fail(`${field}.formulationId is unsupported.`, 'UNSUPPORTED_FORMULATION');
    requireIdentity(element.nodeI, `${field}.nodeI`);
    requireIdentity(element.nodeJ, `${field}.nodeJ`);
    if (element.nodeI === element.nodeJ) fail(`${field} has identical end nodes.`, 'ZERO_LENGTH_ELEMENT');
    if (!nodeIds.has(element.nodeI) || !nodeIds.has(element.nodeJ)) {
      fail(`${field} references a missing node.`, 'MISSING_NODE_REFERENCE');
    }
    const nodeI = nodesById.get(element.nodeI).position;
    const nodeJ = nodesById.get(element.nodeJ).position;
    const length = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y, nodeJ.z - nodeI.z);
    if (!Number.isFinite(length) || !(length > model.validationProfile.zeroLengthTolerance)) {
      fail(`${field} length is below tolerance.`, 'ZERO_LENGTH_ELEMENT');
    }
    requireIdentity(element.materialStateId, `${field}.materialStateId`);
    if (!materialIds.has(element.materialStateId)) fail(`${field} references a missing material state.`, 'MISSING_MATERIAL_REFERENCE');
    requireIdentity(element.sectionStateId, `${field}.sectionStateId`);
    if (!sectionIds.has(element.sectionStateId)) fail(`${field} references a missing section state.`, 'MISSING_SECTION_REFERENCE');
    validateAxes(element.localAxes, `${field}.localAxes`, model.validationProfile);
    requireExactKeys(element.sourceAncestry, RECORD_KEYS.elementAncestry, `${field}.sourceAncestry`);
    requireIdentity(element.sourceAncestry.conditionedSegmentId, `${field}.sourceAncestry.conditionedSegmentId`);
    requireSourceIdentity(element.sourceAncestry.sourceComponentId, `${field}.sourceAncestry.sourceComponentId`);
  });
  requireUniqueIdentities(elements, 'elements', 'elementId');
}

function validateConstraints(constraints, nodeIds) {
  requireArray(constraints, 'constraints');
  const occupied = new Set();
  constraints.forEach((constraint, index) => {
    const field = `constraints[${index}]`;
    requireExactKeys(constraint, RECORD_KEYS.constraint, field);
    requireIdentity(constraint.constraintId, `${field}.constraintId`);
    requireIdentity(constraint.nodeId, `${field}.nodeId`);
    if (!nodeIds.has(constraint.nodeId)) fail(`${field} references a missing node.`, 'MISSING_CONSTRAINT_NODE_REFERENCE');
    if (!CONSTRAINT_DOFS.includes(constraint.dof)) fail(`${field}.dof is unsupported.`, 'UNSUPPORTED_DOF');
    if (!SUPPORTED_CONSTRAINT_BEHAVIORS.includes(constraint.behavior)) {
      fail(`${field}.behavior is unsupported.`, 'UNSUPPORTED_CONSTRAINT_BEHAVIOR');
    }
    if (!CONSTRAINT_BASES.includes(constraint.basis)) fail(`${field}.basis is unsupported.`, 'UNSUPPORTED_CONSTRAINT_BASIS');
    if (constraint.behavior === 'LINEAR_SPRING') {
      requirePositive(constraint.stiffness, `${field}.stiffness`, 'INVALID_SPRING_STIFFNESS');
    } else if (constraint.stiffness !== null) {
      fail(`${field}.stiffness must be null.`, 'INVALID_CONSTRAINT_STIFFNESS');
    }
    const slot = `${constraint.nodeId}:${constraint.dof}`;
    if (occupied.has(slot)) fail(`${field} duplicates an active node/DOF constraint.`, 'DUPLICATE_NODE_DOF_CONSTRAINT');
    occupied.add(slot);
  });
  requireUniqueIdentities(constraints, 'constraints', 'constraintId');
}

function validateLimitations(limitations) {
  requireArray(limitations, 'limitations');
  limitations.forEach((limitation, index) => {
    const field = `limitations[${index}]`;
    requireExactKeys(limitation, RECORD_KEYS.limitation, field);
    requireIdentity(limitation.code, `${field}.code`);
    if (!LIMITATION_SEVERITIES.includes(limitation.severity)) fail(`${field}.severity is unsupported.`, 'INVALID_LIMITATION');
    requireIdentity(limitation.scope, `${field}.scope`);
    if (typeof limitation.stiffnessRelevant !== 'boolean') fail(`${field}.stiffnessRelevant must be boolean.`, 'INVALID_LIMITATION');
    requireRecord(limitation.details, `${field}.details`);
  });
  requireUniqueIdentities(limitations, 'limitations', 'code');
}

function validateDiagnostics(diagnostics) {
  requireArray(diagnostics, 'diagnostics');
  const authorities = new Set();
  diagnostics.forEach((diagnostic, index) => {
    const field = `diagnostics[${index}]`;
    requireExactKeys(diagnostic, RECORD_KEYS.diagnostic, field);
    if (!DIAGNOSTIC_SEVERITIES.includes(diagnostic.severity)) fail(`${field}.severity is unsupported.`, 'INVALID_DIAGNOSTIC');
    requireIdentity(diagnostic.code, `${field}.code`);
    requireIdentity(diagnostic.entityType, `${field}.entityType`);
    requireIdentity(diagnostic.entityId, `${field}.entityId`);
    requireString(diagnostic.message, `${field}.message`);
    requireArray(diagnostic.evidence, `${field}.evidence`);
    diagnostic.evidence.forEach((evidence, evidenceIndex) => {
      const evidenceField = `${field}.evidence[${evidenceIndex}]`;
      requireAllowedKeys(
        evidence,
        ['evidenceId', 'sourceId', 'sourceSemanticHash'],
        RECORD_KEYS.diagnosticEvidence,
        evidenceField,
      );
      requireIdentity(evidence.evidenceId, `${evidenceField}.evidenceId`);
      requireSourceIdentity(evidence.sourceId, `${evidenceField}.sourceId`);
      if (Object.hasOwn(evidence, 'sourceRevision')) {
        requireSourceIdentity(evidence.sourceRevision, `${evidenceField}.sourceRevision`);
      }
      requireHash(evidence.sourceSemanticHash, `${evidenceField}.sourceSemanticHash`, false);
    });
    validateCanonicalStringArray(diagnostic.qualificationEvidenceIds, `${field}.qualificationEvidenceIds`);
    const authority = `${diagnostic.severity}:${diagnostic.code}:${diagnostic.entityType}:${diagnostic.entityId}`;
    if (authorities.has(authority)) fail(`${field} duplicates a diagnostic authority.`, 'DUPLICATE_DIAGNOSTIC_AUTHORITY');
    authorities.add(authority);
  });
}

function validateStructure(candidate, allowBlankHashes) {
  requireExactKeys(candidate, MODEL_TOP_LEVEL_KEYS, 'model');
  if (candidate.schema !== LINEAR_FEA_MODEL_SCHEMA) fail('model.schema is unsupported.', 'UNSUPPORTED_MODEL_SCHEMA');
  requireIdentity(candidate.modelIdentity, 'model.modelIdentity');
  if (!Number.isInteger(candidate.modelRevision) || candidate.modelRevision < 1) {
    fail('model.modelRevision must be a positive integer.', 'INVALID_MODEL_REVISION');
  }
  requireLinearFeaUnits(candidate.units);
  requireLinearFeaConventions(candidate.conventions);
  validateAncestry(candidate.ancestry);
  if (candidate.formulationRegistryVersion !== LINEAR_FEA_FORMULATION_REGISTRY_VERSION) {
    fail('formulationRegistryVersion is unsupported.', 'UNSUPPORTED_FORMULATION_REGISTRY');
  }
  validateProfile(candidate.validationProfile, allowBlankHashes);
  const nodeIds = validateNodes(candidate.nodes);
  const materialIds = validateMaterialStates(candidate.materialStates);
  const sectionIds = validateSectionStates(candidate.sectionStates);
  const nodesById = new Map(candidate.nodes.map((node) => [node.nodeId, node]));
  validateElements(candidate.elements, nodeIds, materialIds, sectionIds, nodesById, candidate);
  validateConstraints(candidate.constraints, nodeIds);
  validateLimitations(candidate.limitations);
  validateDiagnostics(candidate.diagnostics);
  requireHash(candidate.stiffnessStateHash, 'model.stiffnessStateHash', allowBlankHashes);
  requireHash(candidate.semanticHash, 'model.semanticHash', allowBlankHashes);
  requireHash(candidate.evidenceHash, 'model.evidenceHash', allowBlankHashes);
}

function withComputedHashes(candidate) {
  const canonical = canonicalizeLinearFeaModel(candidate);
  canonical.validationProfile.semanticHash = computeValidationProfileSemanticHash(canonical.validationProfile);
  canonical.stiffnessStateHash = computeStiffnessStateHash(canonical);
  canonical.semanticHash = computeSemanticHash(canonical);
  canonical.evidenceHash = computeEvidenceHash(canonical);
  return canonical;
}

export function sealLinearFeaModel(candidate) {
  validateStructure(candidate, true);
  const sealed = withComputedHashes(candidate);
  validateStructure(sealed, false);
  return deepFreeze(sealed);
}

export function validateLinearFeaModel(candidate) {
  validateStructure(candidate, false);
  const canonical = canonicalizeLinearFeaModel(candidate);
  const expectedProfileHash = computeValidationProfileSemanticHash(canonical.validationProfile);
  if (canonical.validationProfile.semanticHash !== expectedProfileHash) {
    fail('validationProfile.semanticHash is stale.', 'STALE_VALIDATION_PROFILE_HASH');
  }
  const expectedStiffnessHash = computeStiffnessStateHash(canonical);
  if (canonical.stiffnessStateHash !== expectedStiffnessHash) fail('stiffnessStateHash is stale.', 'STALE_STIFFNESS_HASH');
  const expectedSemanticHash = computeSemanticHash(canonical);
  if (canonical.semanticHash !== expectedSemanticHash) fail('semanticHash is stale.', 'STALE_SEMANTIC_HASH');
  const expectedEvidenceHash = computeEvidenceHash(canonical);
  if (canonical.evidenceHash !== expectedEvidenceHash) fail('evidenceHash is stale.', 'STALE_EVIDENCE_HASH');
  return deepFreeze(canonical);
}
