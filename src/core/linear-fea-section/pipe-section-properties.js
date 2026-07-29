import { pipeSectionError } from './pipe-section-contract.js';
import { canonicalizePipeSectionValue } from './pipe-section-canonicalization.js';

export function calculateCircularAnnulusProperties(outerDiameter, wallThickness) {
  requireOuterDiameter(outerDiameter);
  requireWallThickness(wallThickness);

  const twiceWallThickness = 2 * wallThickness;
  if (twiceWallThickness === outerDiameter) {
    throw pipeSectionError(
      'PIPE_SECTION_SOLID_NOT_SUPPORTED',
      'The circular-annulus formulation requires a positive inner diameter.',
    );
  }
  if (twiceWallThickness > outerDiameter) {
    throw pipeSectionError(
      'PIPE_SECTION_INNER_DIAMETER_INVALID',
      'Wall thickness produces a negative inner diameter.',
    );
  }

  const innerDiameter = outerDiameter - twiceWallThickness;
  if (!Number.isFinite(innerDiameter) || !(innerDiameter > 0)) {
    throw pipeSectionError(
      'PIPE_SECTION_INNER_DIAMETER_INVALID',
      'The calculated inner diameter must be finite and positive.',
    );
  }
  if (!(innerDiameter < outerDiameter)) {
    throw pipeSectionError(
      'PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE',
      'Floating-point representation cannot preserve innerDiameter < outerDiameter.',
    );
  }

  const diameterRemainder = outerDiameter - wallThickness;
  const area = Math.PI * wallThickness * diameterRemainder;
  const outerDiameterSquared = outerDiameter * outerDiameter;
  const innerDiameterSquared = innerDiameter * innerDiameter;
  const secondMoment = (Math.PI / 16)
    * wallThickness
    * diameterRemainder
    * (outerDiameterSquared + innerDiameterSquared);
  const polarMoment = 2 * secondMoment;

  requireCalculatedProperty(area, 'area');
  requireCalculatedProperty(secondMoment, 'second moment');
  requireCalculatedProperty(polarMoment, 'polar moment');

  return canonicalizePipeSectionValue({
    innerDiameter,
    area,
    secondMomentY: secondMoment,
    secondMomentZ: secondMoment,
    polarMoment,
  });
}

function requireOuterDiameter(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw pipeSectionError(
      'PIPE_SECTION_OUTER_DIAMETER_INVALID',
      'outerDiameter must be finite and greater than zero.',
    );
  }
}

function requireWallThickness(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw pipeSectionError(
      'PIPE_SECTION_WALL_THICKNESS_INVALID',
      'wallThickness must be finite and greater than zero.',
    );
  }
}

function requireCalculatedProperty(value, name) {
  if (!Number.isFinite(value)) {
    throw pipeSectionError(
      'PIPE_SECTION_PROPERTY_NONFINITE',
      `Calculated ${name} must be finite.`,
    );
  }
  if (!(value > 0)) {
    throw pipeSectionError(
      'PIPE_SECTION_PROPERTY_NONPOSITIVE',
      `Calculated ${name} must be greater than zero.`,
    );
  }
}
