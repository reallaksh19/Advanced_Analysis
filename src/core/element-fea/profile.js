import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  BACKEND_ID, DOF_ORDER, FORMULATIONS, JACOBI_PRECONDITIONER_ID, LFEA_PROFILE_SCHEMA,
  LFEA_PROFILE_SCHEMA_V2, LINEAR_BACKENDS, PRESSURE_CONVENTION, REACTION_CONVENTION,
  STRAIN_ORDER, STRESS_ORDER,
} from './constants.js';

const COMMON_KEYS = Object.freeze(['schema','profileIdentity','profileVersion','formulation','units','coordinateConvention','dofOrder','stressVectorOrder','strainVectorOrder','shearConvention','elementNodeOrder','signedAreaPolicy','constraintMethod','reactionConvention','pressureConvention','principalStressConvention','vonMisesConvention','residualDefinitions','energyDefinition','identityComparator','floatingPointEvidencePolicy','runtimeIdentity','outOfPlaneScale','tolerances','limitations']);
const LEGACY_KEYS = Object.freeze([...COMMON_KEYS,'backendIdentity','referenceBackendMaxDofs']);
const SPARSE_KEYS = Object.freeze([...COMMON_KEYS,'linearBackend','preconditioner','absoluteResidualTolerance','relativeResidualTolerance','maximumIterations','maximumDofs','maximumNonzeros','maximumEstimatedStorageBytes']);

export function createLfeaProfile(input) {
  const source = requiredRecord(input, 'profile');
  if (source.schema === LFEA_PROFILE_SCHEMA) return deepFreeze(createLegacyProfile(source));
  if (source.schema === LFEA_PROFILE_SCHEMA_V2) return deepFreeze(createSparseProfile(source));
  throw new TypeError('Invalid LFEA profile schema.');
}

export function validateLfeaProfile(value) {
  try { return deepFreeze({ ok: true, profile: createLfeaProfile(value), errors: [] }); }
  catch (error) { return deepFreeze({ ok: false, profile: null, errors: [error.message] }); }
}

export function profileLinearBackend(profile) {
  return profile.schema === LFEA_PROFILE_SCHEMA ? LINEAR_BACKENDS.DENSE_REFERENCE : profile.linearBackend;
}

function createLegacyProfile(source) {
  exactKeys(source, LEGACY_KEYS, 'profile');
  const profile = commonProfile(source);
  return { ...profile, backendIdentity: exact(source.backendIdentity, BACKEND_ID, 'backendIdentity'), referenceBackendMaxDofs: positiveInteger(source.referenceBackendMaxDofs, 'referenceBackendMaxDofs') };
}

function createSparseProfile(source) {
  exactKeys(source, SPARSE_KEYS, 'profile');
  const profile = commonProfile(source);
  return {
    ...profile,
    linearBackend: exact(source.linearBackend, LINEAR_BACKENDS.SPARSE_PCG_V1, 'linearBackend'),
    preconditioner: exact(source.preconditioner, JACOBI_PRECONDITIONER_ID, 'preconditioner'),
    absoluteResidualTolerance: positive(source.absoluteResidualTolerance, 'absoluteResidualTolerance'),
    relativeResidualTolerance: positive(source.relativeResidualTolerance, 'relativeResidualTolerance'),
    maximumIterations: positiveInteger(source.maximumIterations, 'maximumIterations'),
    maximumDofs: positiveInteger(source.maximumDofs, 'maximumDofs'),
    maximumNonzeros: positiveInteger(source.maximumNonzeros, 'maximumNonzeros'),
    maximumEstimatedStorageBytes: positiveInteger(source.maximumEstimatedStorageBytes, 'maximumEstimatedStorageBytes'),
  };
}

function commonProfile(source) {
  const formulation = source.formulation;
  if (!Object.values(FORMULATIONS).includes(formulation)) throw new TypeError('LFEA formulation is invalid.');
  return {
    schema: source.schema,
    profileIdentity: requiredText(source.profileIdentity, 'profileIdentity'), profileVersion: requiredText(source.profileVersion, 'profileVersion'), formulation,
    units: normalizeUnits(source.units), coordinateConvention: exactText(source.coordinateConvention, 'coordinateConvention'),
    dofOrder: exactArray(source.dofOrder, DOF_ORDER, 'dofOrder'), stressVectorOrder: exactArray(source.stressVectorOrder, STRESS_ORDER, 'stressVectorOrder'), strainVectorOrder: exactArray(source.strainVectorOrder, STRAIN_ORDER, 'strainVectorOrder'),
    shearConvention: exact(source.shearConvention, 'ENGINEERING_GAMMA_XY', 'shearConvention'), elementNodeOrder: exact(source.elementNodeOrder, 'COUNTERCLOCKWISE_POSITIVE_SIGNED_AREA', 'elementNodeOrder'), signedAreaPolicy: exact(source.signedAreaPolicy, 'REJECT_ZERO_NEAR_ZERO_OR_NONPOSITIVE', 'signedAreaPolicy'),
    constraintMethod: exact(source.constraintMethod, 'PARTITION_ELIMINATION', 'constraintMethod'), reactionConvention: exact(source.reactionConvention, REACTION_CONVENTION, 'reactionConvention'), pressureConvention: exact(source.pressureConvention, PRESSURE_CONVENTION, 'pressureConvention'),
    principalStressConvention: exact(source.principalStressConvention, 'IN_PLANE_ATAN2_HALF_ANGLE_AND_FULL_3D_SET_FOR_PLANE_STRAIN', 'principalStressConvention'), vonMisesConvention: exactVonMises(source.vonMisesConvention, formulation), residualDefinitions: exact(source.residualDefinitions, 'ORIGINAL_ASSEMBLED_SYSTEM', 'residualDefinitions'), energyDefinition: exact(source.energyDefinition, 'HALF_U_TRANSPOSE_K_U', 'energyDefinition'),
    identityComparator: exact(source.identityComparator, 'UNICODE_CODE_POINT_ASCENDING', 'identityComparator'), floatingPointEvidencePolicy: exact(source.floatingPointEvidencePolicy, 'RAW_FINITE_IEEE754_CANONICAL_JSON_V1', 'floatingPointEvidencePolicy'), runtimeIdentity: requiredText(source.runtimeIdentity, 'runtimeIdentity'), outOfPlaneScale: positive(source.outOfPlaneScale, 'outOfPlaneScale'), tolerances: normalizeTolerances(source.tolerances), limitations: textArray(source.limitations, 'limitations'),
  };
}

function normalizeUnits(value) { const row = requiredRecord(value, 'units'); exactKeys(row, ['length','force','stress'], 'units'); return { length: requiredText(row.length, 'units.length'), force: requiredText(row.force, 'units.force'), stress: requiredText(row.stress, 'units.stress') }; }
function normalizeTolerances(value) { const row = requiredRecord(value, 'tolerances'); exactKeys(row, ['geometryArea','pivotAbsolute','pivotRatio','matrixSymmetryAbsolute','residualForceAbsolute','residualForceRelative','forceEquilibriumAbsolute','momentEquilibriumAbsolute','energyAbsolute'], 'tolerances'); return { geometryArea: positive(row.geometryArea, 'tolerances.geometryArea'), pivotAbsolute: positive(row.pivotAbsolute, 'tolerances.pivotAbsolute'), pivotRatio: unitIntervalExclusive(row.pivotRatio, 'tolerances.pivotRatio'), matrixSymmetryAbsolute: positive(row.matrixSymmetryAbsolute, 'tolerances.matrixSymmetryAbsolute'), residualForceAbsolute: positive(row.residualForceAbsolute, 'tolerances.residualForceAbsolute'), residualForceRelative: positive(row.residualForceRelative, 'tolerances.residualForceRelative'), forceEquilibriumAbsolute: positive(row.forceEquilibriumAbsolute, 'tolerances.forceEquilibriumAbsolute'), momentEquilibriumAbsolute: positive(row.momentEquilibriumAbsolute, 'tolerances.momentEquilibriumAbsolute'), energyAbsolute: positive(row.energyAbsolute, 'tolerances.energyAbsolute') }; }
function exactVonMises(value, formulation) { return exact(value, formulation === FORMULATIONS.PLANE_STRAIN ? 'THREE_DIMENSIONAL_WITH_RECOVERED_SIGMA_Z' : 'PLANE_STRESS_SIGMA_Z_ZERO', 'vonMisesConvention'); }
function exactArray(value, expected, name) { if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index])) throw new TypeError(`${name} must exactly match the approved order.`); return [...expected]; }
function exact(value, expected, name) { if (value !== expected) throw new TypeError(`${name} must equal ${expected}.`); return expected; }
function exactText(value, name) { return requiredText(value, name); }
function requiredText(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required.`); return value.trim(); }
function requiredRecord(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} is required.`); return value; }
function finite(value, name) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite.`); return value; }
function positive(value, name) { const number = finite(value, name); if (!(number > 0)) throw new TypeError(`${name} must be positive.`); return number; }
function positiveInteger(value, name) { const number = positive(value, name); if (!Number.isInteger(number)) throw new TypeError(`${name} must be an integer.`); return number; }
function unitIntervalExclusive(value, name) { const number = positive(value, name); if (!(number < 1)) throw new TypeError(`${name} must be less than one.`); return number; }
function textArray(value, name) { if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new TypeError(`${name} must contain text.`); return value.map((item) => item.trim()).sort(compare); }
function exactKeys(value, allowed, name) { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); const missing = allowed.filter((key) => !Object.hasOwn(value, key)); if (extras.length) throw new TypeError(`${name} contains unsupported fields: ${extras.sort(compare).join(', ')}.`); if (missing.length) throw new TypeError(`${name} is missing required fields: ${missing.sort(compare).join(', ')}.`); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
