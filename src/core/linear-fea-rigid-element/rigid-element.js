import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import {
  distributedLoadLocalVector,
  frameLocalStiffness,
  thermalInitialStrainVector,
} from '../linear-fea-frame-element/index.js';
import {
  RIGID_ELEMENT_AUTHORITY_SCHEMA,
  requireRigidElementAuthority,
  requireRigidElementRequest,
  sealRigidElementAuthority,
} from './contract.js';

// SOURCE: Hexagon CAESAR II Users Guide, "Rigid Element Application".
export const CAESAR_RIGID_WALL_MULTIPLIER = 10;
// SOURCE: Hexagon CAESAR II Users Guide, "Insulation Weight on Rigid Elements".
export const CAESAR_RIGID_INSULATION_WEIGHT_MULTIPLIER = 1.75;

const SOURCE_IDENTITY = Object.freeze({
  standard: 'CAESAR_II_RIGID_ELEMENT',
  edition: 'HEXAGON_USERS_GUIDE_VERSION_14',
  ruleId: 'RIGID_10X_WALL_SEPARATE_WEIGHT_V1',
  sourceRevision: 'RIGID-335594:335041:335596',
});

function annulusProperties(outerDiameter, innerDiameter) {
  // SOURCE: classical circular-annulus section identities.
  const area = Math.PI * (outerDiameter ** 2 - innerDiameter ** 2) / 4;
  // SOURCE: classical circular-annulus second moment identity.
  const secondMoment = Math.PI * (outerDiameter ** 4 - innerDiameter ** 4) / 64;
  // SOURCE: circular tube polar moment J = 2I.
  const polarMoment = 2 * secondMoment;
  return {
    area: cleanNumber(area),
    secondMomentY: cleanNumber(secondMoment),
    secondMomentZ: cleanNumber(secondMoment),
    polarMoment: cleanNumber(polarMoment),
  };
}

function physicalWeights(request) {
  const hasPhysicalWeight = request.enteredRigidWeight > 0;
  if (!hasPhysicalWeight) {
    return {
      hasPhysicalWeight: false,
      enteredRigidWeight: 0,
      fluidWeight: 0,
      insulationWeight: 0,
      refractoryWeight: 0,
      claddingWeight: 0,
      totalWeight: 0,
      totalLineWeight: 0,
      centroidFraction: 0.5,
    };
  }
  // SOURCE: Hexagon rigid-fluid rule uses equivalent straight pipe at the original ID.
  const fluidArea = Math.PI * request.insideDiameter ** 2 / 4;
  const fluidWeight = request.fluidDensity
    * fluidArea
    * request.length
    * request.gravityAcceleration;
  const insulatedOutsideDiameter = request.enteredOutsideDiameter + 2 * request.insulationThickness;
  // SOURCE: Hexagon rigid-insulation rule uses entered OD, then multiplies equivalent insulation by 1.75.
  const insulationArea = Math.PI
    * (insulatedOutsideDiameter ** 2 - request.enteredOutsideDiameter ** 2)
    / 4;
  const insulationWeight = CAESAR_RIGID_INSULATION_WEIGHT_MULTIPLIER
    * request.insulationDensity
    * insulationArea
    * request.length
    * request.gravityAcceleration;
  const totalWeight = request.enteredRigidWeight
    + fluidWeight
    + insulationWeight
    + request.refractoryWeight
    + CAESAR_RIGID_INSULATION_WEIGHT_MULTIPLIER * request.claddingWeight;
  return {
    hasPhysicalWeight: true,
    enteredRigidWeight: cleanNumber(request.enteredRigidWeight),
    fluidWeight: cleanNumber(fluidWeight),
    insulationWeight: cleanNumber(insulationWeight),
    refractoryWeight: cleanNumber(request.refractoryWeight),
    claddingWeight: cleanNumber(CAESAR_RIGID_INSULATION_WEIGHT_MULTIPLIER * request.claddingWeight),
    totalWeight: cleanNumber(totalWeight),
    totalLineWeight: cleanNumber(totalWeight / request.length),
    centroidFraction: 0.5,
  };
}

/**
 * Compile the CAESAR-compatible rigid-element authority described by the
 * Hexagon rigid-element, rigid-weight and insulation-weight rules.
 *
 * This function produces stiffness/load/thermal evidence only. It does not
 * assemble the global model, solve it, recover actions, or calculate code
 * stress.
 */
export function compileCaesarRigidElementAuthority(request) {
  const accepted = requireRigidElementRequest(request);
  const stiffnessWallThickness = CAESAR_RIGID_WALL_MULTIPLIER * accepted.pipeWallThickness;
  const stiffnessOutsideDiameter = accepted.insideDiameter + 2 * stiffnessWallThickness;
  const section = annulusProperties(stiffnessOutsideDiameter, accepted.insideDiameter);
  const localStiffness = frameLocalStiffness({
    elasticModulus: accepted.material.elasticModulus,
    shearModulus: accepted.material.shearModulus,
    area: section.area,
    secondMomentY: section.secondMomentY,
    secondMomentZ: section.secondMomentZ,
    polarMoment: section.polarMoment,
    length: accepted.length,
    shearDeformation: false,
  }).matrix;
  const gravity = physicalWeights(accepted);
  const temperatureDifference = accepted.operatingTemperature - accepted.installationTemperature;
  const axialStrain = accepted.material.thermalExpansionCoefficient * temperatureDifference;
  const initialStrainLoad = thermalInitialStrainVector({
    elasticModulus: accepted.material.elasticModulus,
    area: section.area,
    axialStrain,
  });
  return sealRigidElementAuthority({
    schema: RIGID_ELEMENT_AUTHORITY_SCHEMA,
    rigidElementId: accepted.rigidElementId,
    sourceIdentity: {
      ...SOURCE_IDENTITY,
      sourceSemanticHash: accepted.sourceEvidence.sourceSemanticHash,
    },
    inputSemanticHash: accepted.semanticHash,
    geometry: {
      length: accepted.length,
      originalInsideDiameter: accepted.insideDiameter,
      enteredOutsideDiameter: accepted.enteredOutsideDiameter,
      enteredPipeWallThickness: accepted.pipeWallThickness,
    },
    stiffnessSection: {
      insideDiameter: accepted.insideDiameter,
      outsideDiameter: cleanNumber(stiffnessOutsideDiameter),
      wallThickness: cleanNumber(stiffnessWallThickness),
      area: section.area,
      secondMomentY: section.secondMomentY,
      secondMomentZ: section.secondMomentZ,
      polarMoment: section.polarMoment,
      localStiffness,
      rule: 'TEN_TIMES_ENTERED_WALL_STIFFNESS_ONLY',
    },
    rigidities: {
      axial: cleanNumber(accepted.material.elasticModulus * section.area),
      bendingY: cleanNumber(accepted.material.elasticModulus * section.secondMomentY),
      bendingZ: cleanNumber(accepted.material.elasticModulus * section.secondMomentZ),
      torsional: cleanNumber(accepted.material.shearModulus * section.polarMoment),
    },
    gravity: {
      ...gravity,
      includePipeWallMetalWeight: false,
      fluidDiameterBasis: 'ORIGINAL_INSIDE_DIAMETER',
      insulationDiameterBasis: 'ENTERED_OUTSIDE_DIAMETER',
      distribution: 'UNIFORM_CONSISTENT_ELEMENT_LOAD',
    },
    thermal: {
      installationTemperature: accepted.installationTemperature,
      operatingTemperature: accepted.operatingTemperature,
      temperatureDifference: cleanNumber(temperatureDifference),
      expansionCoefficient: accepted.material.thermalExpansionCoefficient,
      axialStrain: cleanNumber(axialStrain),
      freeExpansion: cleanNumber(axialStrain * accepted.length),
      initialStrainLoad,
    },
    structuralParticipation: {
      participatesInGlobalStiffness: true,
      participatesInThermalExpansion: true,
      participatesInGravity: true,
      recoverForcesAndMoments: true,
      calculatePipingCodeStress: false,
    },
    limitations: [
      'The authority does not infer a component body weight from geometry.',
      'The authority does not establish CAESAR internal element-load implementation beyond the documented uniform line-weight basis.',
      'Global-axis transformation and model assembly remain owned by the frame/component and solver packages.',
    ],
    semanticHash: '',
  });
}

/**
 * Build the consistent local gravity vector for a compiled authority.
 * `gravityDirectionLocal` is a unit vector in the element local basis.
 */
export function rigidElementGravityLocalVector(authority, gravityDirectionLocal) {
  const accepted = requireRigidElementAuthority(authority);
  if (!Array.isArray(gravityDirectionLocal) || gravityDirectionLocal.length !== 3
    || gravityDirectionLocal.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError('gravityDirectionLocal must be a finite three-component vector.');
  }
  const norm = Math.hypot(...gravityDirectionLocal);
  if (!(norm > 0)) throw new TypeError('gravityDirectionLocal must have non-zero length.');
  const direction = gravityDirectionLocal.map((value) => value / norm);
  const lineWeight = accepted.gravity.totalLineWeight;
  const intensity = {
    fx: direction[0] * lineWeight,
    fy: direction[1] * lineWeight,
    fz: direction[2] * lineWeight,
  };
  return distributedLoadLocalVector({
    primitive: {
      kind: 'DISTRIBUTED_LOAD',
      basis: 'ELEMENT_LOCAL',
      startIntensity: intensity,
      endIntensity: intensity,
    },
    axes: null,
    length: accepted.geometry.length,
    phiXY: 0,
    phiXZ: 0,
  });
}
