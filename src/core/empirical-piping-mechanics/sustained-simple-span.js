import {
  deepFreeze,
  requireFiniteNumber,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from './contracts.js';
import { semanticHash } from './identity.js';

export const SIMPLE_SPAN_SUSTAINED_SCHEMA = 'empirical-simple-span-sustained-result/v1';

const FORMULAS = Object.freeze({
  distributedResultant: 'SUS-UDL-01',
  pointReaction: 'SUS-RXN-01',
  forceClosure: 'SUS-EQ-F-01',
  momentClosure: 'SUS-EQ-M-01',
  shear: 'ACT-V-01',
  moment: 'ACT-M-01',
});

/**
 * Exact statics for one simply supported span with piecewise-uniform and point
 * loads. Downward load magnitudes and upward reactions are positive.
 */
export function calculateSimpleSpanSustained(input) {
  const spanId = requireNonEmptyString(input?.spanId, 'spanId');
  const lengthM = requirePositiveNumber(input?.lengthM, 'lengthM');
  const distributedLoads = normalizeDistributedLoads(input?.distributedLoads ?? [], lengthM);
  const pointLoads = normalizePointLoads(input?.pointLoads ?? [], lengthM);

  const distributedResultants = distributedLoads.map((load) => {
    const length = load.endM - load.startM;
    const forceN = load.forcePerLengthNM * length;
    return deepFreeze({
      loadId: load.loadId,
      forceN,
      centroidM: (load.startM + load.endM) / 2,
      startM: load.startM,
      endM: load.endM,
      forcePerLengthNM: load.forcePerLengthNM,
    });
  });
  const totalLoadN = sum(distributedResultants.map((row) => row.forceN))
    + sum(pointLoads.map((row) => row.forceN));
  const firstMomentAboutANm = sum(distributedResultants.map((row) => row.forceN * row.centroidM))
    + sum(pointLoads.map((row) => row.forceN * row.positionM));
  const reactionBN = firstMomentAboutANm / lengthM;
  const reactionAN = totalLoadN - reactionBN;

  const eventPositions = sortedUnique([
    0,
    lengthM,
    ...distributedLoads.flatMap((load) => [load.startM, load.endM]),
    ...pointLoads.map((load) => load.positionM),
  ]);
  const candidatePositions = new Set(eventPositions);
  for (let index = 0; index < eventPositions.length - 1; index += 1) {
    const left = eventPositions[index];
    const right = eventPositions[index + 1];
    if (!(right > left)) continue;
    const q = activeDistributedIntensity(distributedLoads, (left + right) / 2);
    if (!(q > 0)) continue;
    const shearAtLeftPlus = shearAt(left + Math.min(1e-12, (right - left) / 1e9), reactionAN, distributedLoads, pointLoads);
    const root = left + (shearAtLeftPlus / q);
    if (root > left && root < right) candidatePositions.add(root);
  }

  const stations = [...candidatePositions]
    .sort((a, b) => a - b)
    .map((positionM) => deepFreeze({
      positionM,
      shearN: shearAt(positionM, reactionAN, distributedLoads, pointLoads),
      momentNm: momentAt(positionM, reactionAN, distributedLoads, pointLoads),
    }));
  const governingStation = stations.reduce((best, row) => (
    !best || Math.abs(row.momentNm) > Math.abs(best.momentNm) ? row : best
  ), null);

  const forceResidualN = reactionAN + reactionBN - totalLoadN;
  const momentResidualAboutANm = reactionBN * lengthM - firstMomentAboutANm;
  const result = {
    schema: SIMPLE_SPAN_SUSTAINED_SCHEMA,
    spanId,
    lengthM,
    signConvention: 'DOWNWARD_LOAD_POSITIVE_UPWARD_REACTION_POSITIVE',
    distributedLoads,
    pointLoads,
    distributedResultants: Object.freeze(distributedResultants),
    totalLoadN,
    firstMomentAboutANm,
    reactions: deepFreeze({ supportA: reactionAN, supportB: reactionBN }),
    stations: Object.freeze(stations),
    governingMoment: governingStation,
    equilibrium: deepFreeze({ forceResidualN, momentResidualAboutANm }),
    formulaTrace: Object.freeze(Object.values(FORMULAS)),
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

function normalizeDistributedLoads(loads, spanLengthM) {
  if (!Array.isArray(loads)) throw new TypeError('distributedLoads must be an array.');
  return Object.freeze(loads.map((load, index) => {
    const loadId = requireNonEmptyString(load?.loadId ?? `UDL-${index + 1}`, `distributedLoads[${index}].loadId`);
    const forcePerLengthNM = requireNonNegativeNumber(
      load?.forcePerLengthNM,
      `distributedLoads[${index}].forcePerLengthNM`,
    );
    const startM = load?.startM == null ? 0 : requireNonNegativeNumber(load.startM, `distributedLoads[${index}].startM`);
    const endM = load?.endM == null ? spanLengthM : requireNonNegativeNumber(load.endM, `distributedLoads[${index}].endM`);
    if (!(endM > startM) || endM > spanLengthM) {
      throw new RangeError(`Distributed load ${loadId} must lie within the span and have positive length.`);
    }
    return deepFreeze({ loadId, forcePerLengthNM, startM, endM, source: load.source ?? null });
  }));
}

function normalizePointLoads(loads, spanLengthM) {
  if (!Array.isArray(loads)) throw new TypeError('pointLoads must be an array.');
  return Object.freeze(loads.map((load, index) => {
    const loadId = requireNonEmptyString(load?.loadId ?? `POINT-${index + 1}`, `pointLoads[${index}].loadId`);
    const forceN = requireNonNegativeNumber(load?.forceN, `pointLoads[${index}].forceN`);
    const positionM = requireFiniteNumber(load?.positionM, `pointLoads[${index}].positionM`);
    if (positionM < 0 || positionM > spanLengthM) {
      throw new RangeError(`Point load ${loadId} must lie within the span.`);
    }
    return deepFreeze({ loadId, forceN, positionM, source: load.source ?? null });
  }));
}

function shearAt(x, reactionAN, distributedLoads, pointLoads) {
  let shear = reactionAN;
  for (const load of distributedLoads) {
    const loadedLength = Math.max(0, Math.min(x, load.endM) - load.startM);
    shear -= load.forcePerLengthNM * loadedLength;
  }
  for (const load of pointLoads) {
    if (load.positionM <= x) shear -= load.forceN;
  }
  return shear;
}

function momentAt(x, reactionAN, distributedLoads, pointLoads) {
  let moment = reactionAN * x;
  for (const load of distributedLoads) {
    const loadedLength = Math.max(0, Math.min(x, load.endM) - load.startM);
    if (loadedLength > 0) {
      const centroid = load.startM + loadedLength / 2;
      moment -= load.forcePerLengthNM * loadedLength * (x - centroid);
    }
  }
  for (const load of pointLoads) {
    if (load.positionM <= x) moment -= load.forceN * (x - load.positionM);
  }
  return moment;
}

function activeDistributedIntensity(loads, x) {
  return sum(loads.filter((load) => x >= load.startM && x <= load.endM)
    .map((load) => load.forcePerLengthNM));
}

function sortedUnique(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > 1e-12);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
