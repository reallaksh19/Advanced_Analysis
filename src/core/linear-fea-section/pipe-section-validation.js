import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  PIPE_SECTION_ARITHMETIC_RULE,
  PIPE_SECTION_DIAGNOSTIC_EVIDENCE_KEYS,
  PIPE_SECTION_DIAGNOSTIC_KEYS,
  PIPE_SECTION_DIMENSION_KEYS,
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_INNER_DIAMETER_RULE,
  PIPE_SECTION_LIMITATION_KEYS,
  PIPE_SECTION_LIMITATIONS,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_PROFILE_ID,
  PIPE_SECTION_PROFILE_KEYS,
  PIPE_SECTION_PROFILE_SCHEMA,
  PIPE_SECTION_QUALIFICATION_EVIDENCE_KEYS,
  PIPE_SECTION_REQUEST_KEYS,
  PIPE_SECTION_REQUEST_SCHEMA,
  PIPE_SECTION_RESOLUTION_KEYS,
  PIPE_SECTION_RESOLUTION_SCHEMA,
  PIPE_SECTION_SOLID_RULE,
  PIPE_SECTION_SOURCE_EVIDENCE_KEYS,
  PIPE_SECTION_STATE_KEYS,
  PIPE_SECTION_VERIFICATION_KEYS,
  PipeSectionError,
  pipeSectionError,
  requireExactPipeSectionRecord,
  requirePipeSectionHash,
  requireRetainedSourceString,
  strictClonePipeSectionData,
} from './pipe-section-contract.js';
import {
  canonicalStringifyPipeSection,
  canonicalizePipeSectionValue,
  computePipeSectionEvidenceHash,
  computePipeSectionProfileSemanticHash,
  computePipeSectionRequestSemanticHash,
  computePipeSectionResolutionSemanticHash,
} from './pipe-section-canonicalization.js';
import { calculateCircularAnnulusProperties } from './pipe-section-properties.js';

const INVALID = 'PIPE_SECTION_REQUEST_INVALID';

export function requirePipeSectionRequest(value) {
  const request = clone(value, INVALID);
  exact(request, PIPE_SECTION_REQUEST_KEYS, 'request', INVALID);
  equal(request.schema, PIPE_SECTION_REQUEST_SCHEMA, 'request.schema', INVALID);
  canonicalId(request.sectionStateId, 'request.sectionStateId');
  formulation(request.formulationId, 'request.formulationId');
  outer(request.outerDiameter);
  wall(request.wallThickness);
  source(request.sourceEvidence, 'request.sourceEvidence', INVALID);
  requirePipeSectionHash(request.semanticHash, 'request.semanticHash');
  const result = canonical(request, INVALID);
  checkHash(result.semanticHash, computePipeSectionRequestSemanticHash(result), 'Request');
  return deepFreeze(result);
}

export function requirePipeSectionProfile(value) {
  const profile = clone(value, 'PIPE_SECTION_PROFILE_INVALID');
  exact(profile, PIPE_SECTION_PROFILE_KEYS, 'profile', 'PIPE_SECTION_PROFILE_INVALID');
  equal(profile.schema, PIPE_SECTION_PROFILE_SCHEMA, 'profile.schema', 'PIPE_SECTION_PROFILE_INVALID');
  equal(profile.profileId, PIPE_SECTION_PROFILE_ID, 'profile.profileId', 'PIPE_SECTION_PROFILE_INVALID');
  formulation(profile.formulationId, 'profile.formulationId');
  equal(profile.arithmeticRule, PIPE_SECTION_ARITHMETIC_RULE, 'profile.arithmeticRule', 'PIPE_SECTION_PROFILE_INVALID');
  equal(profile.innerDiameterRule, PIPE_SECTION_INNER_DIAMETER_RULE, 'profile.innerDiameterRule', 'PIPE_SECTION_PROFILE_INVALID');
  equal(profile.solidSectionRule, PIPE_SECTION_SOLID_RULE, 'profile.solidSectionRule', 'PIPE_SECTION_PROFILE_INVALID');
  requirePipeSectionHash(profile.semanticHash, 'profile.semanticHash', 'PIPE_SECTION_PROFILE_INVALID');
  const result = canonical(profile, 'PIPE_SECTION_PROFILE_INVALID');
  checkHash(result.semanticHash, computePipeSectionProfileSemanticHash(result), 'Profile');
  checkHash(result.semanticHash, PIPE_SECTION_PROFILE.semanticHash, 'Qualified profile authority');
  return deepFreeze(result);
}

export function requirePipeSectionResolution(value) {
  const result = clone(value, INVALID);
  exact(result, PIPE_SECTION_RESOLUTION_KEYS, 'resolution', INVALID);
  equal(result.schema, PIPE_SECTION_RESOLUTION_SCHEMA, 'resolution.schema', INVALID);
  equal(result.profileId, PIPE_SECTION_PROFILE_ID, 'resolution.profileId', INVALID);
  requirePipeSectionHash(result.profileSemanticHash, 'resolution.profileSemanticHash');
  checkHash(result.profileSemanticHash, PIPE_SECTION_PROFILE.semanticHash, 'Resolution profile authority');
  requirePipeSectionHash(result.requestSemanticHash, 'resolution.requestSemanticHash');
  dimensions(result.dimensions);
  sectionState(result.sectionState);
  verification(result.verification);
  rows(result.limitations, PIPE_SECTION_LIMITATION_KEYS, 'resolution.limitations', true);
  rows(result.diagnostics, PIPE_SECTION_DIAGNOSTIC_KEYS, 'resolution.diagnostics');
  rows(result.diagnosticEvidence, PIPE_SECTION_DIAGNOSTIC_EVIDENCE_KEYS, 'resolution.diagnosticEvidence');
  rows(result.qualificationEvidence, PIPE_SECTION_QUALIFICATION_EVIDENCE_KEYS, 'resolution.qualificationEvidence', true);
  requirePipeSectionHash(result.semanticHash, 'resolution.semanticHash');
  requirePipeSectionHash(result.evidenceHash, 'resolution.evidenceHash');
  const normalized = canonical(result, INVALID);
  checkHash(normalized.semanticHash, computePipeSectionResolutionSemanticHash(normalized), 'Resolution semantic');
  checkHash(normalized.evidenceHash, computePipeSectionEvidenceHash(normalized), 'Resolution evidence');
  return deepFreeze(normalized);
}

export function resolvePipeSection({ request, profile = PIPE_SECTION_PROFILE }) {
  const input = requirePipeSectionRequest(request);
  const policy = requirePipeSectionProfile(profile);
  if (input.formulationId !== policy.formulationId) {
    throw pipeSectionError('PIPE_SECTION_FORMULATION_UNSUPPORTED', 'Request/profile formulation mismatch.');
  }
  const p = calculateCircularAnnulusProperties(input.outerDiameter, input.wallThickness);
  const check = {
    circularSymmetryResidual: Math.abs(p.secondMomentY - p.secondMomentZ),
    polarClosureResidual: Math.abs(p.polarMoment - (p.secondMomentY + p.secondMomentZ)),
  };
  const payload = canonical({
    schema: PIPE_SECTION_RESOLUTION_SCHEMA,
    profileId: policy.profileId,
    profileSemanticHash: policy.semanticHash,
    requestSemanticHash: input.semanticHash,
    dimensions: { outerDiameter: input.outerDiameter, wallThickness: input.wallThickness, innerDiameter: p.innerDiameter },
    sectionState: {
      sectionStateId: input.sectionStateId,
      area: p.area,
      secondMomentY: p.secondMomentY,
      secondMomentZ: p.secondMomentZ,
      polarMoment: p.polarMoment,
      sourceEvidence: [input.sourceEvidence],
    },
    verification: check,
    limitations: PIPE_SECTION_LIMITATIONS,
    diagnostics: [],
    diagnosticEvidence: [],
    qualificationEvidence: qualification(check),
  }, INVALID);
  const semanticHash = computePipeSectionResolutionSemanticHash(payload);
  const evidenceHash = computePipeSectionEvidenceHash({ ...payload, semanticHash });
  return verifyPipeSectionResolution({ ...payload, semanticHash, evidenceHash }, policy, input);
}

export function verifyPipeSectionResolution(value, profile, request) {
  const result = requirePipeSectionResolution(value);
  const policy = requirePipeSectionProfile(profile);
  const input = requirePipeSectionRequest(request);
  if (result.profileSemanticHash !== policy.semanticHash) mismatch('Profile binding', policy.semanticHash, result.profileSemanticHash);
  if (result.requestSemanticHash !== input.semanticHash) mismatch('Request binding', input.semanticHash, result.requestSemanticHash);
  const p = calculateCircularAnnulusProperties(input.outerDiameter, input.wallThickness);
  for (const [actual, expected, path] of [
    [result.dimensions.outerDiameter, input.outerDiameter, 'dimensions.outerDiameter'],
    [result.dimensions.wallThickness, input.wallThickness, 'dimensions.wallThickness'],
    [result.dimensions.innerDiameter, p.innerDiameter, 'dimensions.innerDiameter'],
    [result.sectionState.area, p.area, 'sectionState.area'],
    [result.sectionState.secondMomentY, p.secondMomentY, 'sectionState.secondMomentY'],
    [result.sectionState.secondMomentZ, p.secondMomentZ, 'sectionState.secondMomentZ'],
    [result.sectionState.polarMoment, p.polarMoment, 'sectionState.polarMoment'],
  ]) mechanical(actual, expected, path);
  if (result.sectionState.sectionStateId !== input.sectionStateId) throw pipeSectionError(INVALID, 'sectionStateId binding mismatch.');
  if (canonicalStringifyPipeSection(result.sectionState.sourceEvidence) !== canonicalStringifyPipeSection([input.sourceEvidence])) {
    throw pipeSectionError(INVALID, 'sourceEvidence binding mismatch.');
  }
  const symmetry = Math.abs(result.sectionState.secondMomentY - result.sectionState.secondMomentZ);
  const closure = Math.abs(result.sectionState.polarMoment - (result.sectionState.secondMomentY + result.sectionState.secondMomentZ));
  if (symmetry !== 0 || closure !== 0) throw pipeSectionError('PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE', 'Exact circular identities failed.');
  mechanical(result.verification.circularSymmetryResidual, symmetry, 'verification.circularSymmetryResidual');
  mechanical(result.verification.polarClosureResidual, closure, 'verification.polarClosureResidual');
  if (canonicalStringifyPipeSection(result.limitations) !== canonicalStringifyPipeSection(PIPE_SECTION_LIMITATIONS)) throw pipeSectionError(INVALID, 'Limitations mismatch.');
  if (canonicalStringifyPipeSection(result.qualificationEvidence) !== canonicalStringifyPipeSection(qualification(result.verification))) throw pipeSectionError(INVALID, 'Qualification evidence mismatch.');
  return result;
}

function qualification(v) {
  return [
    { evidenceId: 'PIPE_SECTION_CIRCULAR_SYMMETRY', checkId: 'IY_EQUALS_IZ_EXACTLY', passed: v.circularSymmetryResidual === 0, actual: v.circularSymmetryResidual, expected: 0 },
    { evidenceId: 'PIPE_SECTION_POLAR_CLOSURE', checkId: 'J_EQUALS_IY_PLUS_IZ_EXACTLY', passed: v.polarClosureResidual === 0, actual: v.polarClosureResidual, expected: 0 },
  ];
}

function dimensions(v) {
  exact(v, PIPE_SECTION_DIMENSION_KEYS, 'resolution.dimensions', INVALID);
  outer(v.outerDiameter); wall(v.wallThickness); positive(v.innerDiameter, 'resolution.dimensions.innerDiameter', 'PIPE_SECTION_INNER_DIAMETER_INVALID');
  if (!(v.innerDiameter < v.outerDiameter)) throw pipeSectionError('PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE', 'innerDiameter < outerDiameter was not preserved.');
}

function sectionState(v) {
  exact(v, PIPE_SECTION_STATE_KEYS, 'resolution.sectionState', INVALID);
  canonicalId(v.sectionStateId, 'resolution.sectionState.sectionStateId');
  for (const key of ['area', 'secondMomentY', 'secondMomentZ', 'polarMoment']) property(v[key], `resolution.sectionState.${key}`);
  if (!Array.isArray(v.sourceEvidence) || v.sourceEvidence.length !== 1) throw pipeSectionError(INVALID, 'sectionState.sourceEvidence must contain one record.');
  source(v.sourceEvidence[0], 'resolution.sectionState.sourceEvidence[0]', INVALID);
}

function verification(v) {
  exact(v, PIPE_SECTION_VERIFICATION_KEYS, 'resolution.verification', INVALID);
  nonnegative(v.circularSymmetryResidual, 'circularSymmetryResidual');
  nonnegative(v.polarClosureResidual, 'polarClosureResidual');
}

function rows(value, keys, path, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) throw pipeSectionError(INVALID, `${path} must be ${nonempty ? 'nonempty ' : ''}array.`);
  value.forEach((row, index) => exact(row, keys, `${path}[${index}]`, INVALID));
}

function source(v, path, code) {
  exact(v, PIPE_SECTION_SOURCE_EVIDENCE_KEYS, path, code);
  requireRetainedSourceString(v.sourceId, `${path}.sourceId`, code);
  requireRetainedSourceString(v.sourceRevision, `${path}.sourceRevision`, code);
  requirePipeSectionHash(v.sourceSemanticHash, `${path}.sourceSemanticHash`, code);
}

function canonicalId(value, path) {
  try { return requireCanonicalNodeId(value); } catch { throw pipeSectionError(INVALID, `${path} must be canonical.`); }
}
function formulation(value, path) {
  if (value !== PIPE_SECTION_FORMULATION_ID) throw pipeSectionError('PIPE_SECTION_FORMULATION_UNSUPPORTED', `${path} is unsupported.`);
}
function outer(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) throw pipeSectionError('PIPE_SECTION_OUTER_DIAMETER_INVALID', 'outerDiameter must be finite and positive.');
}
function wall(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) throw pipeSectionError('PIPE_SECTION_WALL_THICKNESS_INVALID', 'wallThickness must be finite and positive.');
}
function property(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw pipeSectionError('PIPE_SECTION_PROPERTY_NONFINITE', `${path} must be finite.`);
  if (!(value > 0)) throw pipeSectionError('PIPE_SECTION_PROPERTY_NONPOSITIVE', `${path} must be positive.`);
}
function positive(value, path, code) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) throw pipeSectionError(code, `${path} must be finite and positive.`);
}
function nonnegative(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw pipeSectionError(INVALID, `${path} must be finite and nonnegative.`);
}
function equal(value, expected, path, code) {
  if (value !== expected) throw pipeSectionError(code, `${path} must equal ${expected}.`);
}
function exact(value, keys, path, code) { return requireExactPipeSectionRecord(value, keys, path, code); }
function mechanical(actual, expected, path) {
  if (actual !== expected) throw pipeSectionError('PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE', `${path} differs from the governed construction.`, { actual, expected });
}
function clone(value, code) {
  try { return strictClonePipeSectionData(value, code); } catch (error) { if (error instanceof PipeSectionError) throw error; throw pipeSectionError(code, 'Contract data clone failed.'); }
}
function canonical(value, code) {
  try { return canonicalizePipeSectionValue(value); } catch (error) { throw pipeSectionError(code, error.message); }
}
function checkHash(received, expected, label) { if (received !== expected) mismatch(`${label} hash`, expected, received); }
function mismatch(label, expected, received) { throw pipeSectionError('PIPE_SECTION_HASH_MISMATCH', `${label} mismatch.`, { expected, received }); }
