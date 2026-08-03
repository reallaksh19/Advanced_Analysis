import { LOCAL_ACTION_FIELDS, RESULTANT_KEYS, requireExactKeys, requireFinite } from './code-engine-contract.js';

/**
 * Section 10.3 stress component requirements: retain axial force, torsional
 * moment, in-plane bending moment and out-of-plane bending moment at the
 * code point (already recovered by B-3.4; never recomputed here), and expose
 * each stress contribution before combination so a reviewer can reproduce
 * the utilization. A category may legitimately retain a nonzero raw
 * resultant while assigning a zero contribution to its governing formula.
 *
 * Section properties (area, section modulus, polar section modulus) are read
 * directly off the B-2.3 `sectionState`/`dimensions` a B-3.1 frame element
 * already retains — cited, never recomputed by this package.
 */

export function requireLocalAction(value, field, code) {
  requireExactKeys(value, LOCAL_ACTION_FIELDS, field, code);
  for (const key of LOCAL_ACTION_FIELDS) requireFinite(value[key], `${field}.${key}`, code);
  return value;
}

/**
 * Section properties for a circular pipe cross section: section modulus and
 * polar section modulus follow directly from the already-resolved area
 * moment of inertia and outer radius — generic beam mechanics, not a
 * licensed table.
 *
 * The outer diameter comes from the full B-2.3 `fea-linear-pipe-section-
 * resolution/v1` (the B-3.1 frame element retains only `sectionStateId` /
 * `area` / `secondMomentY` / `secondMomentZ` / `polarMoment`, not the
 * dimensions); the area/inertia come from the frame element's own retained
 * section, never recomputed.
 *
 * @param {Readonly<object>} frameElementSection Frame element's own retained `.section` (area, secondMomentY, polarMoment).
 * @param {Readonly<object>} sectionResolution Sealed `fea-linear-pipe-section-resolution/v1` (dimensions.outerDiameter).
 * @returns {{area:number, sectionModulus:number, polarSectionModulus:number}}
 */
export function sectionMechanicalProperties(frameElementSection, sectionResolution) {
  const outerRadius = sectionResolution.dimensions.outerDiameter / 2;
  return {
    area: frameElementSection.area,
    sectionModulus: frameElementSection.secondMomentY / outerRadius,
    polarSectionModulus: frameElementSection.polarMoment / outerRadius,
  };
}

/**
 * Section 10.3: extract the four retained resultants from the recovered
 * local action, using the factor set's own declared moment-direction mapping
 * rather than one scalar collapsing in-plane/out-of-plane.
 *
 * @param {{fx:number,fy:number,fz:number,mx:number,my:number,mz:number}} localAction
 * @param {{inPlaneField:'my'|'mz', outOfPlaneField:'my'|'mz'}} momentDirectionMapping
 * @returns {Readonly<{axialForce:number, torsion:number, inPlaneMoment:number, outOfPlaneMoment:number}>}
 */
export function extractResultants(localAction, momentDirectionMapping) {
  const resultants = {
    axialForce: localAction.fx,
    torsion: localAction.mx,
    inPlaneMoment: localAction[momentDirectionMapping.inPlaneField],
    outOfPlaneMoment: localAction[momentDirectionMapping.outOfPlaneField],
  };
  requireExactKeys(resultants, RESULTANT_KEYS, 'resultants', 'CODE_ENGINE_INVALID');
  return resultants;
}

/**
 * Category-resolved stress combination. `SUSTAINED`/`OCCASIONAL` supply their
 * real axial and pressure longitudinal-stress contributions, so the direct
 * terms sum algebraically before absolute value. ASME B31.3-2006 para.
 * 319.4.4 Eq. (17) range categories supply zero for both direct terms, leaving
 * the SIF-weighted bending/torsion SRSS required by that equation. Raw axial
 * force remains visible in `resultants.axialForce`; only its formula
 * contribution is category-resolved by the caller.
 *
 * @param {Readonly<{axialForce:number, torsion:number,inPlaneMoment:number,outOfPlaneMoment:number}>} resultants
 * @param {{area:number, sectionModulus:number, polarSectionModulus:number}} mechanicalProperties
 * @param {Readonly<{axial:number, torsional:number, inPlaneBending:number, outOfPlaneBending:number}>} indices
 * @param {number} pressureStressValue Category-resolved pressure contribution (zero for range categories).
 * @param {number} axialStressValue Category-resolved axial contribution (zero for range categories).
 * @returns {{stressTerms: Readonly<object>, calculatedStress:number}}
 */
export function combineStressTerms(
  resultants,
  mechanicalProperties,
  indices,
  pressureStressValue,
  axialStressValue,
) {
  const { sectionModulus, polarSectionModulus } = mechanicalProperties;
  const stressTerms = {
    pressure: pressureStressValue,
    axial: axialStressValue,
    torsional: (resultants.torsion / polarSectionModulus) * indices.torsional,
    inPlaneBending: (resultants.inPlaneMoment / sectionModulus) * indices.inPlaneBending,
    outOfPlaneBending: (resultants.outOfPlaneMoment / sectionModulus) * indices.outOfPlaneBending,
  };
  const directTerm = Math.abs(stressTerms.axial + stressTerms.pressure);
  const combinedBendingTorsion = Math.sqrt(
    stressTerms.inPlaneBending ** 2 + stressTerms.outOfPlaneBending ** 2 + stressTerms.torsional ** 2,
  );
  return { stressTerms, calculatedStress: directTerm + combinedBendingTorsion };
}
