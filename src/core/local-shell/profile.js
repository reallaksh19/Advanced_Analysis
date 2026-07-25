import { ShellModelError } from './errors.js';
import { exactKeys, minimumRule, toleranceRule } from './validation.js';

export const PROFILE_FIELDS = Object.freeze([
  'minimumFacetArea',
  'nodeBasisUnit',
  'nodeBasisOrthogonality',
  'nodeBasisHandedness',
  'elementNormalDirectorAlignment',
  'rotationMappingRank',
  'membraneConstitutiveSymmetry',
  'bendingConstitutiveSymmetry',
  'elementStiffnessSymmetry',
  'globalStiffnessSymmetry',
  'rigidTranslation',
  'rigidRotation',
  'choleskyPivot',
  'freeDofResidual',
  'forceEquilibrium',
  'momentEquilibrium',
  'strainEnergyReconstruction',
  'membranePatchResponse',
  'bendingPatchResponse',
]);

const MINIMUM_FIELDS = new Set(['elementNormalDirectorAlignment']);

export function canonicalQualificationProfile(source) {
  exactKeys(source, PROFILE_FIELDS, 'qualificationProfile');
  const result = {};
  for (const field of PROFILE_FIELDS) {
    result[field] = MINIMUM_FIELDS.has(field)
      ? minimumRule(source[field], `qualificationProfile.${field}`)
      : toleranceRule(source[field], `qualificationProfile.${field}`);
    if (field === 'elementNormalDirectorAlignment' && !(result[field].minimum > 0 && result[field].minimum <= 1)) {
      throw new ShellModelError('qualificationProfile.elementNormalDirectorAlignment.minimum must be in (0, 1]');
    }
  }
  return result;
}
