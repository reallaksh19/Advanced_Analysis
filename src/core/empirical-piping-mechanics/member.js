import {
  EMPIRICAL_FORMULA_IDS,
  deepFreeze,
  requireFiniteNumber,
  requireNonEmptyString,
  requirePositiveNumber,
} from './contracts.js';
import { buildPlanarMemberAxes, projectGlobalVectorToLocal } from './axes.js';
import {
  addVectors,
  transformLocalLoadToGlobal,
  transformStiffness,
} from './matrix.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';
import { semanticHash } from './identity.js';

export function buildPlanarFrameLocalStiffness({
  elasticModulusPa,
  areaM2,
  secondMomentM4,
  lengthM,
}) {
  const E = requirePositiveNumber(elasticModulusPa, 'elasticModulusPa');
  const A = requirePositiveNumber(areaM2, 'areaM2');
  const I = requirePositiveNumber(secondMomentM4, 'secondMomentM4');
  const L = requirePositiveNumber(lengthM, 'lengthM');
  const a = (E * A) / L;
  const b = (12 * E * I) / (L ** 3);
  const c = (6 * E * I) / (L ** 2);
  const d = (4 * E * I) / L;
  const e = (2 * E * I) / L;
  return [
    [a, 0, 0, -a, 0, 0],
    [0, b, c, 0, -b, c],
    [0, c, d, 0, -c, e],
    [-a, 0, 0, a, 0, 0],
    [0, -b, -c, 0, b, -c],
    [0, c, e, 0, -c, d],
  ];
}

export function buildUniformLocalEquivalentLoad({ lengthM, axialLoadNM = 0, transverseLoadNM = 0 }) {
  const L = requirePositiveNumber(lengthM, 'lengthM');
  const qx = requireFiniteNumber(axialLoadNM, 'axialLoadNM');
  const qy = requireFiniteNumber(transverseLoadNM, 'transverseLoadNM');
  return [
    (qx * L) / 2,
    (qy * L) / 2,
    (qy * (L ** 2)) / 12,
    (qx * L) / 2,
    (qy * L) / 2,
    -(qy * (L ** 2)) / 12,
  ];
}

export function compileInitialStrainLoad(member, thermal) {
  if (!thermal) return deepFreeze({
    strain: 0,
    freeExpansionM: 0,
    localEquivalentLoad: [0, 0, 0, 0, 0, 0],
    formulaTrace: [],
  });
  const alphaPerK = requireFiniteNumber(thermal.alphaPerK, 'thermal.alphaPerK');
  const deltaTK = requireFiniteNumber(thermal.deltaTK, 'thermal.deltaTK');
  const strain = alphaPerK * deltaTK;
  const forceN = member.elasticModulusPa * member.section.areaM2 * strain;
  return deepFreeze({
    strain,
    freeExpansionM: strain * member.axes.lengthM,
    localEquivalentLoad: [-forceN, 0, 0, forceN, 0, 0],
    formulaTrace: [
      EMPIRICAL_FORMULA_IDS.thermalStrain,
      EMPIRICAL_FORMULA_IDS.freeThermalExpansion,
    ],
  });
}

export function compileEmpiricalMember(input) {
  const id = requireNonEmptyString(input.id, 'member.id');
  const nodeIId = requireNonEmptyString(input.nodeI?.id, 'member.nodeI.id');
  const nodeJId = requireNonEmptyString(input.nodeJ?.id, 'member.nodeJ.id');
  const axes = buildPlanarMemberAxes(input.nodeI, input.nodeJ);
  if (!input.sectionStates?.stiffness) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.INPUT_INCOMPLETE,
      `Member ${id} requires resolved stiffness section state.`,
    );
  }
  const elasticModulusPa = requirePositiveNumber(input.elasticModulusPa, 'elasticModulusPa');
  const flexibilityFactor = requirePositiveNumber(input.flexibilityFactor ?? 1, 'flexibilityFactor');
  const section = deepFreeze({
    areaM2: input.sectionStates.stiffness.areaM2,
    secondMomentM4: input.sectionStates.stiffness.secondMomentM4 / flexibilityFactor,
    unmodifiedSecondMomentM4: input.sectionStates.stiffness.secondMomentM4,
    flexibilityFactor,
  });
  const localStiffness = buildPlanarFrameLocalStiffness({
    elasticModulusPa,
    areaM2: section.areaM2,
    secondMomentM4: section.secondMomentM4,
    lengthM: axes.lengthM,
  });
  const physicalMassLengthM = requirePositiveNumber(
    input.physicalMassLengthM ?? axes.lengthM,
    'physicalMassLengthM',
  );
  const uniformGlobalLoadNM = input.uniformGlobalLoadNM ?? { x: 0, y: 0 };
  const loadLengthScale = physicalMassLengthM / axes.lengthM;
  const effectiveUniformGlobalLoadNM = {
    x: requireFiniteNumber(uniformGlobalLoadNM.x, 'uniformGlobalLoadNM.x') * loadLengthScale,
    y: requireFiniteNumber(uniformGlobalLoadNM.y, 'uniformGlobalLoadNM.y') * loadLengthScale,
  };
  const uniformLocalLoadNM = projectGlobalVectorToLocal(axes, effectiveUniformGlobalLoadNM);
  const uniformLocalEquivalentLoad = buildUniformLocalEquivalentLoad({
    lengthM: axes.lengthM,
    axialLoadNM: uniformLocalLoadNM.x,
    transverseLoadNM: uniformLocalLoadNM.y,
  });
  const base = {
    id,
    nodeIId,
    nodeJId,
    nodeI: deepFreeze({ ...input.nodeI }),
    nodeJ: deepFreeze({ ...input.nodeJ }),
    kind: input.kind ?? 'STRAIGHT',
    physicalMassLengthM,
    loadLengthScale,
    axes,
    elasticModulusPa,
    section,
    localStiffness,
    globalStiffness: transformStiffness(localStiffness, axes.transformGlobalToLocal),
    uniformGlobalLoadNM: deepFreeze({
      x: requireFiniteNumber(uniformGlobalLoadNM.x, 'uniformGlobalLoadNM.x'),
      y: requireFiniteNumber(uniformGlobalLoadNM.y, 'uniformGlobalLoadNM.y'),
    }),
    effectiveUniformGlobalLoadNM: deepFreeze(effectiveUniformGlobalLoadNM),
    uniformLocalLoadNM,
    uniformLocalEquivalentLoad,
  };
  const thermal = compileInitialStrainLoad(base, input.thermal);
  const localEquivalentLoad = addVectors(uniformLocalEquivalentLoad, thermal.localEquivalentLoad);
  const result = {
    ...base,
    thermal,
    localEquivalentLoad,
    globalEquivalentLoad: transformLocalLoadToGlobal(
      localEquivalentLoad,
      axes.transformGlobalToLocal,
    ),
    formulaTrace: [
      EMPIRICAL_FORMULA_IDS.axialCoefficient,
      EMPIRICAL_FORMULA_IDS.bending12,
      EMPIRICAL_FORMULA_IDS.bending6,
      EMPIRICAL_FORMULA_IDS.bending4,
      EMPIRICAL_FORMULA_IDS.bending2,
      EMPIRICAL_FORMULA_IDS.uniformLoadShear,
      EMPIRICAL_FORMULA_IDS.uniformLoadMoment,
      ...(flexibilityFactor === 1 ? [] : [EMPIRICAL_FORMULA_IDS.segmentedElbow]),
      ...thermal.formulaTrace,
    ],
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}
