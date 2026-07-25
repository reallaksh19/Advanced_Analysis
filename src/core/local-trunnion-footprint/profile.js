import { QUALIFICATION_PROFILE_SCHEMA } from './constants.js';
import { sourceError } from './errors.js';
import { exactKeys, finiteNumber, stringValue } from './validation.js';

const RULES = [
  'axisUnitVector', 'axisNonParallel', 'pipeRadialDistance', 'pipeDirectorAlignment',
  'trunnionIntersection', 'footprintMinimumEdge', 'footprintPerimeter',
  'resultantFitPivot', 'forceReconstruction', 'momentReconstruction',
  'referenceTransfer', 'shellHashReconstruction', 'assessmentEnvelope',
];

export function canonicalQualificationProfile(source) {
  exactKeys(source, ['schema', 'identity', ...RULES], 'qualificationProfile');
  if (source.schema !== QUALIFICATION_PROFILE_SCHEMA) throw sourceError('QUALIFICATION_PROFILE_SCHEMA_MISMATCH', 'qualificationProfile.schema', `qualificationProfile.schema must be ${QUALIFICATION_PROFILE_SCHEMA}.`);
  const result = { schema: source.schema, identity: stringValue(source.identity, 'qualificationProfile.identity') };
  for (const key of RULES) result[key] = canonicalRule(source[key], `qualificationProfile.${key}`);
  return result;
}
function canonicalRule(source, path) {
  exactKeys(source, ['absolute', 'relative'], path);
  const absolute = finiteNumber(source.absolute, `${path}.absolute`);
  const relative = finiteNumber(source.relative, `${path}.relative`);
  if (absolute < 0 || relative < 0 || absolute + relative === 0) throw sourceError('INVALID_TOLERANCE_RULE', path, `${path} must define a positive tolerance.`);
  return { absolute, relative };
}
export function defaultQualificationProfile() {
  const d = { absolute: 1e-10, relative: 1e-12 };
  const l = { absolute: 1e-8, relative: 1e-12 };
  const m = { absolute: 1e-5, relative: 1e-12 };
  return canonicalQualificationProfile({
    schema: QUALIFICATION_PROFILE_SCHEMA, identity: 'LAFEA5_SCALE_AWARE_V1',
    axisUnitVector: d, axisNonParallel: d, pipeRadialDistance: l, pipeDirectorAlignment: d,
    trunnionIntersection: l, footprintMinimumEdge: l, footprintPerimeter: l,
    resultantFitPivot: d, forceReconstruction: { absolute: 1e-8, relative: 1e-12 },
    momentReconstruction: m, referenceTransfer: m, shellHashReconstruction: d,
    assessmentEnvelope: d,
  });
}