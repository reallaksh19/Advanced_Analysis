import {
  thermalInitialStrainVector,
  transformLoadToGlobal,
} from '../src/core/linear-fea-frame-element/index.js';
import { requireElementContribution } from '../src/core/linear-fea-solver/index.js';

// M045: closed-end internal-pressure axial elongation strain, the mechanism
// this project's RCA on BM4 node 21470 (SUS) identified as the dominant
// missing structural effect. Cross-checked before this module was written:
// running solveBm4M035FeatureCases() reproduces the RCA's reported "APP
// baseline" element-action figures at IX-S37/IX-S38 to 5-6 significant
// figures, so the same code path is what this module extends.
//
// Formula -- thick-wall closed-end axial strain under internal gauge
// pressure, Poisson-coupled to the mean hoop/radial contraction:
//
//   epsilon_p = (1 - 2*nu) * P * Di^2 / (E * (Do^2 - Di^2))
//
// Scope: straight prismatic runs only. A formed bend's own pressure
// response (rotational bend-opening, the "Bourdon effect") is a distinct
// mechanism; applying this uniform axial-strain formula along a bend arc
// was tried and rejected upstream of this module (it moves bending moment
// the wrong direction), so this module is never applied to bend elements.
//
// compileFrameElement's static condensation of a load vector is linear in
// that vector when the condensation entries and base local stiffness are
// held fixed (frame-element-stiffness.js: condenseEndConditions returns the
// vectors UNCHANGED when entries.length === 0). That makes it exact to
// compute this contribution's own global vector independently -- via the
// SAME thermalInitialStrainVector + frameTransformationMatrix +
// transformLoadToGlobal primitives compileFrameElement uses for the
// thermal case -- and add it to an already-compiled element's
// initialStrainLoadGlobal, PROVIDED the element has no releases, end
// springs or rigid offsets to condense/transform against. BM4 has exactly
// two pressurized non-bend elements that fail that precondition (tee end
// springs and rigid offsets both nonzero); this module explicitly excludes
// them rather than silently mis-condensing.
export const PRESSURE_ELONGATION_SKIPPED_ELEMENT_IDS = Object.freeze([
  'BM4M035.IX-S12',
  'BM4M035.IX-S36.STRAIGHT',
]);

export function closedEndPressureAxialStrain({ pressure, poissonRatio, innerDiameter, outerDiameter, elasticModulus }) {
  if (!(pressure >= 0)) throw new Error('M045 pressure must be >= 0.');
  if (!(poissonRatio > 0 && poissonRatio < 0.5)) throw new Error('M045 poissonRatio must be in (0, 0.5).');
  if (!(innerDiameter > 0)) throw new Error('M045 innerDiameter must be positive.');
  if (!(outerDiameter > innerDiameter)) throw new Error('M045 outerDiameter must exceed innerDiameter.');
  if (!(elasticModulus > 0)) throw new Error('M045 elasticModulus must be positive.');
  return (1 - 2 * poissonRatio) * pressure * innerDiameter ** 2
    / (elasticModulus * (outerDiameter ** 2 - innerDiameter ** 2));
}

/**
 * Extra GLOBAL initial-strain vector for one eligible element carrying
 * internal pressure. transformationMatrix must be the element's OWN
 * compiled transformation (frame.transformation.matrix) so this is
 * bit-identical to what compileFrameElement would produce internally.
 */
export function pressureElongationGlobalVector({
  pressure, poissonRatio, innerDiameter, outerDiameter, elasticModulus, area, transformationMatrix,
}) {
  const axialStrain = closedEndPressureAxialStrain({ pressure, poissonRatio, innerDiameter, outerDiameter, elasticModulus });
  const local = thermalInitialStrainVector({ elasticModulus, area, axialStrain });
  return transformLoadToGlobal(local, transformationMatrix);
}

/** Re-seals an element contribution with an extra global vector added into initialStrainLoadGlobal. */
export function addPressureElongationToContribution(contribution, extraGlobalVector) {
  return requireElementContribution({
    elementId: contribution.elementId,
    globalStiffness: contribution.globalStiffness,
    equivalentLoadGlobal: contribution.equivalentLoadGlobal,
    initialStrainLoadGlobal: contribution.initialStrainLoadGlobal.map((value, index) => value + extraGlobalVector[index]),
  });
}
