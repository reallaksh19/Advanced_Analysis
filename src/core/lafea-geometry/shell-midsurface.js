import { LafeaGeometryError } from './errors.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { positiveNumber } from '../shared-analysis-contract/numeric.js';

/**
 * Shell midsurface declaration at the geometry layer (spec §10.1: "Shell
 * surfaces: midsurface with deterministic normal and thickness/offset
 * fields."). This module declares *what* thickness/offset/normal-rule apply
 * to a region — it does not compute per-node normals. Actual normal
 * propagation over a meshed shell is the shell kernel's job
 * (`src/core/local-shell`, upgraded in a later phase) so that normal
 * computation has exactly one numerical authority.
 */
export const OFFSET_CONVENTIONS = Object.freeze(['MIDSURFACE', 'TOP_OFFSET', 'BOTTOM_OFFSET']);

const DECLARATION_FIELDS = Object.freeze(['regionId', 'thickness', 'offsetConvention', 'normalPropagationRule', 'flipped']);

/**
 * @param {object} source Candidate declaration.
 * @param {Readonly<object>} topology Accepted topology; `regionId` must resolve.
 * @returns {Readonly<object>} Canonical shell-midsurface declaration.
 */
export function canonicalShellMidsurfaceDeclaration(source, topology) {
  exactKeys(source, DECLARATION_FIELDS, 'shellMidsurfaceDeclaration');
  const regionId = nonEmptyString(source.regionId, 'shellMidsurfaceDeclaration.regionId');
  if (!topology.regions.some((region) => region.regionId === regionId)) {
    throw new LafeaGeometryError(`shellMidsurfaceDeclaration references an unresolved region: ${regionId}`, 'UNRESOLVED_REGION');
  }
  return Object.freeze({
    regionId,
    thickness: positiveNumber(source.thickness, `shellMidsurfaceDeclaration.${regionId}.thickness`),
    offsetConvention: member(source.offsetConvention, OFFSET_CONVENTIONS, `shellMidsurfaceDeclaration.${regionId}.offsetConvention`),
    normalPropagationRule: nonEmptyString(source.normalPropagationRule, `shellMidsurfaceDeclaration.${regionId}.normalPropagationRule`),
    flipped: requireBoolean(source.flipped, `shellMidsurfaceDeclaration.${regionId}.flipped`),
  });
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new LafeaGeometryError(`${label} must be a boolean`, 'NOT_A_BOOLEAN');
  return value;
}
