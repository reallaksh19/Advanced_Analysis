import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { canonicalNumber } from './numeric.js';
import { add, cross, scale, subtract } from './vector-math.js';
import {
  FINITE_FOOTPRINT_DISTRIBUTION_RULE,
  FINITE_FOOTPRINT_RESULT_SCHEMA,
  assertFiniteFootprintResidual,
  mergedFiniteFootprintLimitations,
  normalizeFiniteFootprintRequest,
  requireFiniteFootprintFoundationLoad,
} from './finite-footprint-contract.js';

export function compileFiniteFootprintDistribution(input) {
  const request = normalizeFiniteFootprintRequest(input);
  const sourceLoad = requireFiniteFootprintFoundationLoad(
    request.foundationResult,
    request.loadCaseIdentity,
  );
  const pressure = pressureResultant(request.pressureThrusts, request.referencePoint);
  const force = add(sourceLoad.transformedForceGlobal, pressure.force);
  const moment = add(sourceLoad.transformedMomentGlobal, pressure.moment);
  const weights = normalizedWeights(request.footprint.stations);
  const stations = request.footprint.stations.map((station, index) => ({
    stationId: station.stationId,
    position: station.position,
    normalizedWeight: weights[index],
    force: scale(force, weights[index]),
    moment: [0, 0, 0],
    sourceReference: station.sourceReference,
  }));
  const offsetMoment = stations.reduce((sum, station) => add(
    sum,
    cross(subtract(station.position, request.referencePoint), station.force),
  ), [0, 0, 0]);
  const balancingMoment = subtract(moment, offsetMoment);
  stations.forEach((station, index) => {
    station.moment = scale(balancingMoment, weights[index]);
  });
  const reconstructed = reconstruct(stations, request.referencePoint);
  const tolerances = equilibriumTolerances(request.qualificationProfile, force, moment);
  const forceResidual = subtract(reconstructed.force, force);
  const momentResidual = subtract(reconstructed.moment, moment);
  assertFiniteFootprintResidual(
    forceResidual,
    tolerances.force,
    'FOOTPRINT_FORCE_CLOSURE_FAILED',
  );
  assertFiniteFootprintResidual(
    momentResidual,
    tolerances.moment,
    'FOOTPRINT_MOMENT_CLOSURE_FAILED',
  );
  const base = {
    schema: FINITE_FOOTPRINT_RESULT_SCHEMA,
    requestIdentity: request.requestIdentity,
    requestVersion: request.requestVersion,
    sourceAuthority: {
      foundationSourceSemanticHash:
        request.foundationResult.semanticHashes.sourceSemanticHash,
      foundationCanonicalModelSemanticHash:
        request.foundationResult.semanticHashes.canonicalModelSemanticHash,
      foundationResultPayloadSemanticHash:
        request.foundationResult.semanticHashes.resultPayloadSemanticHash,
      loadCaseIdentity: request.loadCaseIdentity,
    },
    footprint: request.footprint,
    referencePoint: request.referencePoint,
    pressureThrusts: request.pressureThrusts,
    appliedResultant: { force, moment },
    stationResultants: stations,
    equilibrium: {
      reconstructedForce: reconstructed.force,
      reconstructedMoment: reconstructed.moment,
      forceResidual,
      momentResidual,
      tolerances,
      accepted: true,
    },
    distributionRule: FINITE_FOOTPRINT_DISTRIBUTION_RULE,
    qualification: {
      state: 'ACCEPTED',
      engineeringLevel: 'FINITE_FOOTPRINT_RESULTANT_DISTRIBUTION_ONLY',
      qualificationProfile: request.qualificationProfile,
    },
    limitations: mergedFiniteFootprintLimitations(request.limitations),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function pressureResultant(rows, referencePoint) {
  return rows.reduce((sum, row) => {
    const force = scale(
      row.normal,
      canonicalNumber(row.pressure * row.area, 'pressure thrust'),
    );
    return {
      force: add(sum.force, force),
      moment: add(
        sum.moment,
        cross(subtract(row.applicationPoint, referencePoint), force),
      ),
    };
  }, { force: [0, 0, 0], moment: [0, 0, 0] });
}

function normalizedWeights(stations) {
  const total = stations.reduce((sum, station) => sum + station.weight, 0);
  return stations.map((station) => canonicalNumber(
    station.weight / total,
    'station weight',
  ));
}

function reconstruct(stations, referencePoint) {
  return stations.reduce((sum, station) => ({
    force: add(sum.force, station.force),
    moment: add(sum.moment, add(
      cross(subtract(station.position, referencePoint), station.force),
      station.moment,
    )),
  }), { force: [0, 0, 0], moment: [0, 0, 0] });
}

function equilibriumTolerances(profile, force, moment) {
  return {
    force: tolerance(profile.forceTolerance, force),
    moment: tolerance(profile.momentTolerance, moment),
  };
}

function tolerance(rule, values) {
  return canonicalNumber(
    rule.absolute + rule.relative
      * Math.max(1, ...values.map((value) => Math.abs(value))),
    'equilibrium tolerance',
  );
}
