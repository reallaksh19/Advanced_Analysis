import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import {
  distributedLoadLocalVector,
  frameLocalStiffness,
  thermalInitialStrainVector,
} from '../linear-fea-frame-element/index.js';
import {
  REDUCER_CONDENSATION_AUTHORITY_SCHEMA,
  REDUCER_SEGMENT_COUNT,
  requireReducerCondensationRequest,
  sealReducerCondensationAuthority,
} from './contract.js';

function annulus(outerDiameter, wallThickness) {
  const innerDiameter = outerDiameter - 2 * wallThickness;
  const area = Math.PI * (outerDiameter ** 2 - innerDiameter ** 2) / 4;
  const secondMoment = Math.PI * (outerDiameter ** 4 - innerDiameter ** 4) / 64;
  return {
    outerDiameter: cleanNumber(outerDiameter),
    wallThickness: cleanNumber(wallThickness),
    innerDiameter: cleanNumber(innerDiameter),
    area: cleanNumber(area),
    secondMomentY: cleanNumber(secondMoment),
    secondMomentZ: cleanNumber(secondMoment),
    polarMoment: cleanNumber(2 * secondMoment),
  };
}

function interpolate(start, end, fraction) {
  return cleanNumber(start + fraction * (end - start));
}

export function reducerRepresentativeFraction(index, samplingRule) {
  if (samplingRule === 'I_END_LINEAR_INTERPOLATION_CANDIDATE_V1') return index / REDUCER_SEGMENT_COUNT;
  if (samplingRule === 'MIDPOINT_LINEAR_INTERPOLATION_CANDIDATE_V1') return (index + 0.5) / REDUCER_SEGMENT_COUNT;
  if (samplingRule === 'J_END_LINEAR_INTERPOLATION_CANDIDATE_V1') return (index + 1) / REDUCER_SEGMENT_COUNT;
  throw new Error(`REDUCER_CONDENSATION_SAMPLING_RULE_INVALID:${samplingRule}`);
}

function matrix(size, fill = 0) {
  return Array.from({ length: size }, () => new Array(size).fill(fill));
}

function vector(size) {
  return new Array(size).fill(0);
}

function addElementMatrix(global, local, nodeI, nodeJ) {
  const map = [
    ...Array.from({ length: 6 }, (_, index) => nodeI * 6 + index),
    ...Array.from({ length: 6 }, (_, index) => nodeJ * 6 + index),
  ];
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      global[map[row]][map[column]] += local[row * 12 + column];
    }
  }
}

function addElementVector(global, local, nodeI, nodeJ) {
  const map = [
    ...Array.from({ length: 6 }, (_, index) => nodeI * 6 + index),
    ...Array.from({ length: 6 }, (_, index) => nodeJ * 6 + index),
  ];
  for (let index = 0; index < 12; index += 1) global[map[index]] += local[index];
}

function submatrix(source, rows, columns) {
  return rows.map((row) => columns.map((column) => source[row][column]));
}

function subvector(source, rows) {
  return rows.map((row) => source[row]);
}

function solveDense(A, rhs) {
  const n = A.length;
  const M = A.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(M[row][pivot]) > Math.abs(M[best][pivot])) best = row;
    }
    if (!(Math.abs(M[best][pivot]) > 1e-18)) throw new Error('REDUCER_CONDENSATION_INTERNAL_MATRIX_SINGULAR');
    [M[pivot], M[best]] = [M[best], M[pivot]];
    const divisor = M[pivot][pivot];
    for (let column = pivot; column <= n; column += 1) M[pivot][column] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = M[row][pivot];
      if (factor === 0) continue;
      for (let column = pivot; column <= n; column += 1) M[row][column] -= factor * M[pivot][column];
    }
  }
  return M.map((row) => row[n]);
}

function multiply(A, B) {
  const rows = A.length;
  const inner = A[0].length;
  const columns = B[0].length;
  const result = matrix(rows, 0);
  result.forEach((row) => { row.length = columns; row.fill(0); });
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const value = A[i][k];
      for (let j = 0; j < columns; j += 1) result[i][j] += value * B[k][j];
    }
  }
  return result;
}

function multiplyVector(A, x) {
  return A.map((row) => row.reduce((sum, value, index) => sum + value * x[index], 0));
}

function subtractMatrix(A, B) {
  return A.map((row, i) => row.map((value, j) => cleanNumber(value - B[i][j])));
}

function solveColumns(A, B) {
  const columns = B[0].length;
  const solved = matrix(A.length, 0);
  solved.forEach((row) => { row.length = columns; row.fill(0); });
  for (let column = 0; column < columns; column += 1) {
    const x = solveDense(A, B.map((row) => row[column]));
    for (let row = 0; row < A.length; row += 1) solved[row][column] = x[row];
  }
  return solved;
}

function flattenSymmetric(A) {
  const n = A.length;
  const values = [];
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      values.push(cleanNumber((A[row][column] + A[column][row]) / 2));
    }
  }
  return values;
}

function condense(K, loads) {
  const boundary = [...Array.from({ length: 6 }, (_, index) => index), ...Array.from({ length: 6 }, (_, index) => 60 + index)];
  const internal = Array.from({ length: 54 }, (_, index) => 6 + index);
  const Kbb = submatrix(K, boundary, boundary);
  const Kbi = submatrix(K, boundary, internal);
  const Kib = submatrix(K, internal, boundary);
  const Kii = submatrix(K, internal, internal);
  const X = solveColumns(Kii, Kib);
  const condensedK = subtractMatrix(Kbb, multiply(Kbi, X));
  const condensedLoads = {};
  for (const [name, full] of Object.entries(loads)) {
    const fb = subvector(full, boundary);
    const fi = subvector(full, internal);
    const yi = solveDense(Kii, fi);
    const correction = multiplyVector(Kbi, yi);
    condensedLoads[name] = fb.map((value, index) => cleanNumber(value - correction[index]));
  }
  return { stiffness: flattenSymmetric(condensedK), loads: condensedLoads };
}

/** Compile one of the three predeclared ten-cylinder section-sampling hypotheses. */
export function compileTenCylinderReducerAuthority(request) {
  const accepted = requireReducerCondensationRequest(request);
  const segmentLength = accepted.length / REDUCER_SEGMENT_COUNT;
  const globalSize = (REDUCER_SEGMENT_COUNT + 1) * 6;
  const K = matrix(globalSize, 0);
  const gravityFull = vector(globalSize);
  const thermalFull = vector(globalSize);
  const directionNorm = Math.hypot(...accepted.gravity.directionLocal);
  const direction = accepted.gravity.directionLocal.map((value) => value / directionNorm);
  const temperatureDifference = accepted.thermal.operatingTemperature - accepted.thermal.installationTemperature;
  const axialStrain = accepted.material.thermalExpansionCoefficient * temperatureDifference;
  const segments = [];
  let totalWeight = 0;
  let firstWeightMoment = 0;

  for (let index = 0; index < REDUCER_SEGMENT_COUNT; index += 1) {
    const fraction = reducerRepresentativeFraction(index, accepted.samplingRule);
    const section = annulus(
      interpolate(accepted.fromSection.outerDiameter, accepted.toSection.outerDiameter, fraction),
      interpolate(accepted.fromSection.wallThickness, accepted.toSection.wallThickness, fraction),
    );
    const stiffness = frameLocalStiffness({
      elasticModulus: accepted.material.elasticModulus,
      shearModulus: accepted.material.shearModulus,
      area: section.area,
      secondMomentY: section.secondMomentY,
      secondMomentZ: section.secondMomentZ,
      polarMoment: section.polarMoment,
      length: segmentLength,
      shearDeformation: false,
    }).matrix;
    addElementMatrix(K, stiffness, index, index + 1);

    const thermal = thermalInitialStrainVector({
      elasticModulus: accepted.material.elasticModulus,
      area: section.area,
      axialStrain,
    });
    addElementVector(thermalFull, thermal, index, index + 1);

    const metalLineWeight = accepted.material.massDensity * section.area * accepted.gravity.acceleration;
    const fluidArea = Math.PI * section.innerDiameter ** 2 / 4;
    const fluidLineWeight = accepted.gravity.fluidDensity * fluidArea * accepted.gravity.acceleration;
    const insulatedOd = section.outerDiameter + 2 * accepted.gravity.insulationThickness;
    const insulationArea = Math.PI * (insulatedOd ** 2 - section.outerDiameter ** 2) / 4;
    const insulationLineWeight = accepted.gravity.insulationDensity * insulationArea * accepted.gravity.acceleration;
    const lineWeight = accepted.gravity.enabled ? metalLineWeight + fluidLineWeight + insulationLineWeight : 0;
    const intensity = {
      fx: direction[0] * lineWeight,
      fy: direction[1] * lineWeight,
      fz: direction[2] * lineWeight,
    };
    const gravity = distributedLoadLocalVector({
      primitive: {
        kind: 'DISTRIBUTED_LOAD',
        basis: 'ELEMENT_LOCAL',
        startIntensity: intensity,
        endIntensity: intensity,
      },
      axes: null,
      length: segmentLength,
      phiXY: 0,
      phiXZ: 0,
    });
    addElementVector(gravityFull, gravity, index, index + 1);
    const segmentWeight = lineWeight * segmentLength;
    const midpoint = (index + 0.5) * segmentLength;
    totalWeight += segmentWeight;
    firstWeightMoment += segmentWeight * midpoint;
    segments.push({
      index,
      representativeFraction: cleanNumber(fraction),
      startFraction: index / REDUCER_SEGMENT_COUNT,
      midpointFraction: (index + 0.5) / REDUCER_SEGMENT_COUNT,
      endFraction: (index + 1) / REDUCER_SEGMENT_COUNT,
      length: cleanNumber(segmentLength),
      section,
      lineWeights: {
        metal: cleanNumber(accepted.gravity.enabled ? metalLineWeight : 0),
        fluid: cleanNumber(accepted.gravity.enabled ? fluidLineWeight : 0),
        insulation: cleanNumber(accepted.gravity.enabled ? insulationLineWeight : 0),
        total: cleanNumber(lineWeight),
      },
    });
  }

  const condensed = condense(K, { gravity: gravityFull, thermal: thermalFull });
  return sealReducerCondensationAuthority({
    schema: REDUCER_CONDENSATION_AUTHORITY_SCHEMA,
    reducerId: accepted.reducerId,
    inputSemanticHash: accepted.semanticHash,
    sourceIdentity: {
      standard: 'CAESAR_II_REDUCER',
      edition: 'HEXAGON_USERS_GUIDE_VERSION_12_14',
      ruleId: 'TEN_SUCCESSIVELY_CHANGING_PIPE_CYLINDERS',
      sourceRevision: accepted.sourceEvidence.sourceRevision,
      sourceSemanticHash: accepted.sourceEvidence.sourceSemanticHash,
    },
    parityStatus: 'CANDIDATE_PENDING_SECTION_SAMPLING_VERIFICATION',
    samplingRule: accepted.samplingRule,
    axisRule: 'CALLER_DECLARED_ELEMENT_AXIS',
    geometry: {
      length: accepted.length,
      fromSection: { ...accepted.fromSection },
      toSection: { ...accepted.toSection },
      segmentCount: accepted.segmentCount,
    },
    segments,
    condensed: {
      localStiffness: condensed.stiffness,
      gravityLocalVector: condensed.loads.gravity,
      thermalInitialStrainLocalVector: condensed.loads.thermal,
    },
    gravity: {
      totalWeight: cleanNumber(totalWeight),
      centroidFromEnd: totalWeight === 0 ? cleanNumber(accepted.length / 2) : cleanNumber(firstWeightMoment / totalWeight),
      firstMomentFromEnd: cleanNumber(firstWeightMoment),
      rule: 'TEN_CYLINDER_PHYSICAL_WEIGHT',
    },
    thermal: {
      temperatureDifference: cleanNumber(temperatureDifference),
      axialStrain: cleanNumber(axialStrain),
      rule: 'TEN_CYLINDER_THERMAL_STRAIN',
    },
    structuralParticipation: {
      publicBoundaryNodeCount: 2,
      condensedInternalStationCount: 9,
      publicBoundaryDofCount: 12,
      stressSectionRule: 'CODE_SPECIFIC_REDUCER_NOT_CONDENSED_EQUIVALENT_SECTION',
    },
    limitations: [
      'The public Hexagon documentation confirms ten cylinders but not the exact representative section sampling location.',
      `${accepted.samplingRule} is a predeclared physical hypothesis and not a byte-for-byte CAESAR parity claim until independently qualified.`,
      'Eccentricity is represented by the caller-declared element axis; this authority varies section properties along that axis.',
    ],
    semanticHash: '',
  });
}