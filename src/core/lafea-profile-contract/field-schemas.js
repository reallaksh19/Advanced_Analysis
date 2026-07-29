import { LafeaProfileContractError } from './errors.js';
import { boundedNumber, integerAtLeast, positiveNumber } from './numeric.js';
import { CODE_ASSESSMENT_METHODS, PROFILE_KINDS, SHELL_SURFACES } from './constants.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';

/**
 * Kind-specific `fields` validators. Each returns a frozen, exact-key-checked
 * record. Bounds encode non-negotiable relationships from the spec (e.g. a
 * mesh block threshold must be strictly beyond its own warn threshold) — this
 * is a validator refusing self-contradictory profiles, not a hidden default.
 */

const GEOMETRY_FIELDS = Object.freeze(['mergeTolerance', 'curveChordError', 'normalPropagationRule']);
function canonicalGeometryFields(source) {
  exactKeys(source, GEOMETRY_FIELDS, 'geometryProfile.fields');
  return Object.freeze({
    mergeTolerance: positiveNumber(source.mergeTolerance, 'geometryProfile.fields.mergeTolerance'),
    curveChordError: positiveNumber(source.curveChordError, 'geometryProfile.fields.curveChordError'),
    normalPropagationRule: nonEmptyString(source.normalPropagationRule, 'geometryProfile.fields.normalPropagationRule'),
  });
}

const MESH_FIELDS = Object.freeze([
  'continuumElement', 'shellElement', 'globalTargetSize', 'adjacentSizeRatioMax',
  'aspectRatioWarn', 'aspectRatioBlock', 'scaledJacobianWarn', 'scaledJacobianBlock', 'adaptiveLevels',
]);
function canonicalMeshFields(source) {
  exactKeys(source, MESH_FIELDS, 'meshProfile.fields');
  const fields = {
    continuumElement: nonEmptyString(source.continuumElement, 'meshProfile.fields.continuumElement'),
    shellElement: nonEmptyString(source.shellElement, 'meshProfile.fields.shellElement'),
    globalTargetSize: positiveNumber(source.globalTargetSize, 'meshProfile.fields.globalTargetSize'),
    adjacentSizeRatioMax: boundedNumber(source.adjacentSizeRatioMax, { exclusiveMinimum: 1 }, 'meshProfile.fields.adjacentSizeRatioMax'),
    aspectRatioWarn: positiveNumber(source.aspectRatioWarn, 'meshProfile.fields.aspectRatioWarn'),
    aspectRatioBlock: positiveNumber(source.aspectRatioBlock, 'meshProfile.fields.aspectRatioBlock'),
    scaledJacobianWarn: boundedNumber(source.scaledJacobianWarn, { exclusiveMinimum: 0, maximum: 1 }, 'meshProfile.fields.scaledJacobianWarn'),
    scaledJacobianBlock: boundedNumber(source.scaledJacobianBlock, { exclusiveMinimum: 0, maximum: 1 }, 'meshProfile.fields.scaledJacobianBlock'),
    adaptiveLevels: integerAtLeast(source.adaptiveLevels, 3, 'meshProfile.fields.adaptiveLevels'),
  };
  if (!(fields.aspectRatioBlock > fields.aspectRatioWarn)) {
    throw new LafeaProfileContractError('meshProfile.fields.aspectRatioBlock must exceed aspectRatioWarn', 'INVALID_THRESHOLD_ORDER');
  }
  if (!(fields.scaledJacobianWarn > fields.scaledJacobianBlock)) {
    throw new LafeaProfileContractError('meshProfile.fields.scaledJacobianWarn must exceed scaledJacobianBlock', 'INVALID_THRESHOLD_ORDER');
  }
  return Object.freeze(fields);
}

const SOLVER_FIELDS = Object.freeze(['backend', 'scaling', 'normalizedResidualLimit', 'equilibriumRelativeLimit', 'conditionWarning']);
function canonicalSolverFields(source) {
  exactKeys(source, SOLVER_FIELDS, 'solverProfile.fields');
  return Object.freeze({
    backend: nonEmptyString(source.backend, 'solverProfile.fields.backend'),
    scaling: nonEmptyString(source.scaling, 'solverProfile.fields.scaling'),
    normalizedResidualLimit: positiveNumber(source.normalizedResidualLimit, 'solverProfile.fields.normalizedResidualLimit'),
    equilibriumRelativeLimit: positiveNumber(source.equilibriumRelativeLimit, 'solverProfile.fields.equilibriumRelativeLimit'),
    conditionWarning: positiveNumber(source.conditionWarning, 'solverProfile.fields.conditionWarning'),
  });
}

const RECOVERY_FIELDS = Object.freeze(['gaussPointRetention', 'nodalProjection', 'shellSurfaces', 'sclProcedure']);
function canonicalRecoveryFields(source) {
  exactKeys(source, RECOVERY_FIELDS, 'recoveryProfile.fields');
  if (source.gaussPointRetention !== true) {
    // Spec §7.1/§12.1: Gauss-point stress is the primary truth and must be
    // retained before extrapolation. A profile cannot switch this off.
    throw new LafeaProfileContractError('recoveryProfile.fields.gaussPointRetention must be true', 'GAUSS_POINT_RETENTION_REQUIRED');
  }
  const shellSurfaces = requireExactMemberSet(source.shellSurfaces, SHELL_SURFACES, 'recoveryProfile.fields.shellSurfaces');
  return Object.freeze({
    gaussPointRetention: true,
    nodalProjection: nonEmptyString(source.nodalProjection, 'recoveryProfile.fields.nodalProjection'),
    shellSurfaces,
    sclProcedure: nonEmptyString(source.sclProcedure, 'recoveryProfile.fields.sclProcedure'),
  });
}

const CONVERGENCE_FIELDS = Object.freeze([
  'energyChangeLimit', 'displacementChangeLimit', 'sclMembraneBendingChangeLimit', 'structuralStressChangeLimit',
]);
function canonicalConvergenceFields(source) {
  exactKeys(source, CONVERGENCE_FIELDS, 'convergenceProfile.fields');
  return Object.freeze({
    energyChangeLimit: boundedNumber(source.energyChangeLimit, { exclusiveMinimum: 0, maximum: 1 }, 'convergenceProfile.fields.energyChangeLimit'),
    displacementChangeLimit: boundedNumber(source.displacementChangeLimit, { exclusiveMinimum: 0, maximum: 1 }, 'convergenceProfile.fields.displacementChangeLimit'),
    sclMembraneBendingChangeLimit: boundedNumber(source.sclMembraneBendingChangeLimit, { exclusiveMinimum: 0, maximum: 1 }, 'convergenceProfile.fields.sclMembraneBendingChangeLimit'),
    structuralStressChangeLimit: boundedNumber(source.structuralStressChangeLimit, { exclusiveMinimum: 0, maximum: 1 }, 'convergenceProfile.fields.structuralStressChangeLimit'),
  });
}

const CODE_FIELDS = Object.freeze(['edition', 'method', 'allowableSourceIdentity', 'equivalentStressRule', 'categoryLimitProfile']);
function canonicalCodeFields(source) {
  exactKeys(source, CODE_FIELDS, 'codeProfile.fields');
  return Object.freeze({
    edition: nonEmptyString(source.edition, 'codeProfile.fields.edition'),
    method: member(source.method, CODE_ASSESSMENT_METHODS, 'codeProfile.fields.method'),
    allowableSourceIdentity: nonEmptyString(source.allowableSourceIdentity, 'codeProfile.fields.allowableSourceIdentity'),
    equivalentStressRule: nonEmptyString(source.equivalentStressRule, 'codeProfile.fields.equivalentStressRule'),
    categoryLimitProfile: nonEmptyString(source.categoryLimitProfile, 'codeProfile.fields.categoryLimitProfile'),
  });
}

const OUTPUT_FIELDS = Object.freeze(['retainIntegrationPointResults', 'exportJson', 'exportCsv', 'generateEngineeringReport']);
function canonicalOutputFields(source) {
  exactKeys(source, OUTPUT_FIELDS, 'outputProfile.fields');
  if (source.retainIntegrationPointResults !== true) {
    throw new LafeaProfileContractError('outputProfile.fields.retainIntegrationPointResults must be true', 'GAUSS_POINT_RETENTION_REQUIRED');
  }
  return Object.freeze({
    retainIntegrationPointResults: true,
    exportJson: requireBoolean(source.exportJson, 'outputProfile.fields.exportJson'),
    exportCsv: requireBoolean(source.exportCsv, 'outputProfile.fields.exportCsv'),
    generateEngineeringReport: requireBoolean(source.generateEngineeringReport, 'outputProfile.fields.generateEngineeringReport'),
  });
}

export const FIELD_VALIDATORS = Object.freeze({
  [PROFILE_KINDS.GEOMETRY]: canonicalGeometryFields,
  [PROFILE_KINDS.MESH]: canonicalMeshFields,
  [PROFILE_KINDS.SOLVER]: canonicalSolverFields,
  [PROFILE_KINDS.RECOVERY]: canonicalRecoveryFields,
  [PROFILE_KINDS.CONVERGENCE]: canonicalConvergenceFields,
  [PROFILE_KINDS.CODE]: canonicalCodeFields,
  [PROFILE_KINDS.OUTPUT]: canonicalOutputFields,
});

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new LafeaProfileContractError(`${label} must be a boolean`, 'NOT_A_BOOLEAN');
  return value;
}

function requireExactMemberSet(value, allowed, label) {
  if (!Array.isArray(value)) throw new LafeaProfileContractError(`${label} must be an array`, 'NOT_AN_ARRAY');
  const sorted = [...value].sort();
  const wanted = [...allowed].sort();
  if (sorted.length !== wanted.length || sorted.some((entry, index) => entry !== wanted[index])) {
    throw new LafeaProfileContractError(`${label} must contain exactly ${wanted.join(', ')}`, 'INVALID_MEMBER_SET');
  }
  return Object.freeze([...value]);
}
