/** ASME B31.3 Appendix D / ASME B31J equation kernels. Inputs are SI, outputs dimensionless. */
const minimumOne = (value) => Math.max(1, value);
const clampReducerSif = (value) => Math.min(2, minimumOne(value));

function pressureCorrectBend({ h, meanRadius, bendRadius, wallThickness, pressure, elasticModulus }) {
  const baseFlexibility = 1.65 / h;
  const baseInPlaneSif = 0.9 / h ** (2 / 3);
  const baseOutOfPlaneSif = 0.75 / h ** (2 / 3);
  const flexibilityDenominator = 1
    + 6
      * (pressure / elasticModulus)
      * (meanRadius / wallThickness) ** (7 / 3)
      * (bendRadius / meanRadius) ** (1 / 3);
  const sifDenominator = 1
    + 3.25
      * (pressure / elasticModulus)
      * (meanRadius / wallThickness) ** (5 / 2)
      * (bendRadius / meanRadius) ** (2 / 3);
  return {
    flexibilityCharacteristic: h,
    meanCrossSectionRadius: meanRadius,
    unpressurized: {
      flexibility: minimumOne(baseFlexibility),
      inPlaneSif: minimumOne(baseInPlaneSif),
      outOfPlaneSif: minimumOne(baseOutOfPlaneSif),
      torsionalSif: 1,
    },
    pressureCorrection: {
      applied: pressure > 0,
      pressure,
      elasticModulus,
      flexibilityDenominator,
      sifDenominator,
    },
    flexibility: {
      inPlane: minimumOne(baseFlexibility / flexibilityDenominator),
      outOfPlane: minimumOne(baseFlexibility / flexibilityDenominator),
      torsional: 1,
    },
    displacementSifs: {
      axial: 1,
      torsional: 1,
      inPlaneBending: minimumOne(baseInPlaneSif / sifDenominator),
      outOfPlaneBending: minimumOne(baseOutOfPlaneSif / sifDenominator),
    },
  };
}

export function calculateBendFactors(geometry) {
  const meanRadius = (geometry.outerDiameter - geometry.wallThickness) / 2;
  const h = geometry.wallThickness * geometry.bendRadius / meanRadius ** 2;
  return pressureCorrectBend({
    h,
    meanRadius,
    bendRadius: geometry.bendRadius,
    wallThickness: geometry.wallThickness,
    pressure: geometry.pressure,
    elasticModulus: geometry.elasticModulus,
  });
}

export function calculateLegacyWeldingTeeFactors(geometry) {
  const runMeanRadius = (geometry.runOuterDiameter - geometry.runWallThickness) / 2;
  const h = 3.1 * geometry.runWallThickness / runMeanRadius;
  const outOfPlane = minimumOne(0.9 / h ** (2 / 3));
  const inPlane = minimumOne(0.75 * outOfPlane + 0.25);
  return {
    flexibilityCharacteristic: h,
    runMeanRadius,
    flexibility: {
      run: { inPlane: 1, outOfPlane: 1, torsional: 1 },
      branch: { inPlane: 1, outOfPlane: 1, torsional: 1 },
    },
    displacementSifs: {
      run: { axial: 1, torsional: 1, inPlaneBending: inPlane, outOfPlaneBending: outOfPlane },
      branch: { axial: 1, torsional: 1, inPlaneBending: inPlane, outOfPlaneBending: outOfPlane },
    },
  };
}

export function calculateB31JWeldingTeeFactors(geometry) {
  const R = (geometry.runOuterDiameter - geometry.runWallThickness) / 2;
  const T = geometry.runWallThickness;
  const d = geometry.branchOuterDiameter - geometry.branchWallThickness;
  const D = geometry.runOuterDiameter - geometry.runWallThickness;
  const t = geometry.branchWallThickness;
  const rt = R / T;
  const q = d / D;
  const tau = t / T;

  const kir = 0.18 * rt ** 0.8 * q ** 5;
  const kor = 1;
  const ktr = 0.08 * rt ** 0.91 * q ** 5.7;
  const kib = (1.91 * q - 4.32 * q ** 2 + 2.7 * q ** 3) * rt ** 0.77 * q ** 0.47 * tau;
  const kob = (0.34 * q - 0.49 * q ** 2 + 0.18 * q ** 3) * rt ** 1.46 * tau;
  const ktb = (1.08 * q - 2.44 * q ** 2 + 1.52 * q ** 3) * rt ** 0.77 * q ** 1.61 * tau;

  const runOutOfPlane = minimumOne(0.61 * rt ** 0.29 * q ** 1.95 * tau ** -0.53);
  const run = {
    // B31J secondary-load axial SIF for a non-bend component follows the
    // component out-of-plane SIF; sustained/occasional axial indices remain 1.
    axial: runOutOfPlane,
    torsional: minimumOne(0.34 * rt ** (2 / 3) * q * tau ** -0.5),
    inPlaneBending: minimumOne(0.98 * rt ** 0.35 * q ** 0.72 * tau ** -0.52),
    outOfPlaneBending: runOutOfPlane,
  };
  const branchOutOfPlane = minimumOne(0.42 * rt ** (2 / 3) * q ** 0.37 * tau ** 0.37);
  const branch = {
    // Same secondary-load axial convention as the run leg.
    axial: branchOutOfPlane,
    torsional: minimumOne(0.42 * rt ** (2 / 3) * q ** 1.1 * tau ** 1.1),
    inPlaneBending: minimumOne(0.33 * rt ** (2 / 3) * q ** 0.18 * tau ** 0.7),
    outOfPlaneBending: branchOutOfPlane,
  };
  return {
    ratios: { runRadiusToThickness: rt, branchToRunMeanDiameter: q, branchToRunThickness: tau },
    flexibility: {
      run: { inPlane: minimumOne(kir), outOfPlane: minimumOne(kor), torsional: minimumOne(ktr) },
      branch: { inPlane: minimumOne(kib), outOfPlane: minimumOne(kob), torsional: minimumOne(ktb) },
    },
    displacementSifs: { run, branch },
  };
}

export function calculateB31JReducerFactors(geometry) {
  const alphaTerm = geometry.coneAngleDegrees
    * geometry.smallEndWallThickness
    / geometry.largeEndWallThickness;
  const common = alphaTerm ** 0.8
    * (geometry.smallEndOuterDiameter / geometry.smallEndWallThickness) ** 0.25
    * (geometry.smallEndOuterDiameter / geometry.smallEndTransitionRadius);
  const thresholdLength = Math.sqrt(
    geometry.smallEndOuterDiameter * geometry.smallEndWallThickness,
  );
  const shortCylinderMultiplier = geometry.smallEndCylinderLength < thresholdLength
    ? 2 - geometry.smallEndCylinderLength / thresholdLength
    : 1;
  const inPlane = clampReducerSif((0.6 + 0.003 * common) * shortCylinderMultiplier);
  const outOfPlane = clampReducerSif((0.6 + 0.003 * common) * shortCylinderMultiplier);
  const torsional = clampReducerSif((0.3 + 0.0015 * common) * shortCylinderMultiplier);
  return {
    commonTerm: common,
    shortCylinderThreshold: thresholdLength,
    shortCylinderMultiplier,
    flexibility: null,
    displacementSifs: {
      // Non-bend secondary-load axial SIF follows the out-of-plane SIF.
      axial: outOfPlane,
      torsional,
      inPlaneBending: inPlane,
      outOfPlaneBending: outOfPlane,
    },
  };
}

export function legacySustainedIndices(displacementSifs) {
  return {
    axial: 1,
    torsional: 1,
    inPlaneBending: minimumOne(0.75 * displacementSifs.inPlaneBending),
    outOfPlaneBending: minimumOne(0.75 * displacementSifs.outOfPlaneBending),
  };
}

export function b31jDirectSustainedIndices(displacementSifs) {
  return {
    axial: 1,
    torsional: displacementSifs.torsional,
    inPlaneBending: displacementSifs.inPlaneBending,
    outOfPlaneBending: displacementSifs.outOfPlaneBending,
  };
}

export function b31jBranchSustainedIndices(displacementSifs, thicknessRatio) {
  const resolve = (value) => minimumOne(Math.min(
    0.75 * value,
    (thicknessRatio > 1 ? thicknessRatio : 1) * Math.sqrt(value),
  ));
  return {
    axial: 1,
    torsional: resolve(displacementSifs.torsional),
    inPlaneBending: resolve(displacementSifs.inPlaneBending),
    outOfPlaneBending: resolve(displacementSifs.outOfPlaneBending),
  };
}

export function applyB31J2023SustainedDoTCorrection(indices, outerDiameterToThickness) {
  if (!(outerDiameterToThickness > 50)) {
    return {
      indices: { ...indices },
      correction: { applied: false, outerDiameterToThickness, denominator: 1 },
    };
  }
  const denominator = 1.3 - 0.006 * outerDiameterToThickness;
  return {
    indices: {
      axial: indices.axial,
      torsional: minimumOne(indices.torsional / denominator),
      inPlaneBending: minimumOne(indices.inPlaneBending / denominator),
      outOfPlaneBending: minimumOne(indices.outOfPlaneBending / denominator),
    },
    correction: { applied: true, outerDiameterToThickness, denominator },
  };
}
