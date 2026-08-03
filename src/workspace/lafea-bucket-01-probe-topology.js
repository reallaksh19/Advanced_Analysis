import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_FIXED_PROBE_REVISION,
} from './lafea-bucket-01-fixed-probe.js';

export const LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_INPUT_SCHEMA =
  'lafea-bucket-01-probe-topology-audit-input/v1';
export const LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_EVIDENCE_SCHEMA =
  'lafea-bucket-01-probe-topology-audit-evidence/v1';
export const LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_REVISION =
  'B01-PROBE-TOPOLOGY.1';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'governedLevelOrdinals', 'probeEvidences',
  'minimumNaturalMargin',
]);

export function evaluateLafeaBucket01ProbeTopologyAudit(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'probe-topology audit input');
  if (inputValue.schema !== LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_INPUT_SCHEMA) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const minimumNaturalMargin = nonNegative(
    inputValue.minimumNaturalMargin,
    'minimumNaturalMargin',
  );
  const ordinals = normalizeOrdinals(inputValue.governedLevelOrdinals);
  if (!Array.isArray(inputValue.probeEvidences)
    || inputValue.probeEvidences.length !== ordinals.length
    || inputValue.probeEvidences.length < 2) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_LEVEL_COUNT_INVALID');
  }
  const probes = inputValue.probeEvidences.map((row) =>
    validateProbeEvidence(row, exactHeadSha));
  assertProbeIdentityStable(probes);
  const levels = probes.map((probe, index) => levelEvidence(
    probe,
    ordinals[index],
    minimumNaturalMargin,
  ));
  const transitions = [];
  for (let index = 1; index < levels.length; index += 1) {
    transitions.push(transitionEvidence(levels[index - 1], levels[index]));
  }
  const reasons = [];
  for (const level of levels) {
    if (!level.topologyMetadataAvailable) {
      reasons.push(`LEVEL_${level.ordinal}_TOPOLOGY_METADATA_UNAVAILABLE`);
    }
    if (!level.naturalMarginAccepted) {
      reasons.push(`LEVEL_${level.ordinal}_NATURAL_MARGIN_BELOW_MINIMUM`);
    }
    if (!(level.jacobianDeterminant > 0)) {
      reasons.push(`LEVEL_${level.ordinal}_JACOBIAN_NON_POSITIVE`);
    }
  }
  for (const transition of transitions) {
    if (!transition.refinementRatioCompatible) {
      reasons.push(`LEVEL_${transition.coarseOrdinal}_${transition.fineOrdinal}_REFINEMENT_RATIO_INVALID`);
    }
    if (!transition.radialParentCompatible) {
      reasons.push(`LEVEL_${transition.coarseOrdinal}_${transition.fineOrdinal}_RADIAL_PARENT_MISMATCH`);
    }
    if (!transition.circumferentialParentCompatible) {
      reasons.push(`LEVEL_${transition.coarseOrdinal}_${transition.fineOrdinal}_CIRCUMFERENTIAL_PARENT_MISMATCH`);
    }
    if (!transition.topologySignatureStable) {
      reasons.push(`LEVEL_${transition.coarseOrdinal}_${transition.fineOrdinal}_TOPOLOGY_SIGNATURE_CHANGED`);
    }
    if (!transition.orientationStable) {
      reasons.push(`LEVEL_${transition.coarseOrdinal}_${transition.fineOrdinal}_ORIENTATION_CHANGED`);
    }
  }
  const diagnosis = buildDiagnosis(levels, transitions, probes);
  const uniqueReasons = [...new Set(reasons)].sort();
  const status = uniqueReasons.length === 0 ? 'PASS' : 'BLOCKED';
  const reference = probes[0];
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_REVISION,
    exactHeadSha,
    probeId: reference.probe.probeId,
    loadCaseId: reference.probe.loadCaseId,
    component: reference.probe.component,
    units: reference.probe.units,
    physicalCoordinates: { x: reference.probe.x, y: reference.probe.y },
    locationDefinitionHash: reference.probe.locationDefinitionHash,
    minimumNaturalMargin,
    governedLevelOrdinals: ordinals,
    fixedProbeEvidenceHashes: probes.map((row) => row.semanticHash),
    levels,
    transitions,
    diagnosis,
    status,
    reasons: uniqueReasons,
    authority: {
      deterministicContainingElement: true,
      exactlyOneContainingElementRequired: true,
      directT6NaturalCoordinates: true,
      exactQuadraticEdgeDistance: true,
      annularElementIdentityParsed: true,
      parentCellLineageAudited: true,
      topologySignatureChangesFailClosed: true,
      stressAcceptanceAuthorized: false,
      meshRepairAuthorized: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01ProbeTopologyAuditEvidence(value, probes) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_REVISION) {
      throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_EVIDENCE_INVALID');
    }
    const rebuilt = evaluateLafeaBucket01ProbeTopologyAudit({
      schema: LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      governedLevelOrdinals: value.governedLevelOrdinals,
      probeEvidences: probes,
      minimumNaturalMargin: value.minimumNaturalMargin,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_PROBE_TOPOLOGY_INVALID'],
    });
  }
}

function levelEvidence(probe, ordinal, minimumNaturalMargin) {
  const observation = probe.topologyObservation;
  const topology = observation.meshTopology;
  return deepFreeze({
    ordinal,
    elementId: probe.elementId,
    radialDivisions: topology.radialDivisions,
    circumferentialDivisions: topology.circumferentialDivisions,
    radialRingIndex: topology.radialRingIndex,
    circumferentialSectorIndex: topology.circumferentialSectorIndex,
    triangleSide: topology.triangleSide,
    orientation: topology.orientation,
    naturalCoordinates: probe.naturalCoordinates,
    minimumNaturalMargin: probe.minimumNaturalMargin,
    naturalMarginAccepted: probe.minimumNaturalMargin >= minimumNaturalMargin,
    jacobianDeterminant: probe.jacobianDeterminant,
    localElementSize: probe.localElementSize,
    probeToEdgeDistances: probe.probeToEdgeDistances,
    minimumPhysicalEdgeDistance: probe.minimumPhysicalEdgeDistance,
    topologySignature: probe.topologySignature,
    elementPhaseSignature: probe.elementPhaseSignature,
    parentCellLineage: topology.parentCellLineage,
    topologyMetadataAvailable: topology.metadataAvailable,
    authoritativeValue: probe.authoritativeValue,
    fixedProbeEvidenceHash: probe.semanticHash,
  });
}

function transitionEvidence(coarse, fine) {
  const radialRatio = integerRatio(fine.radialDivisions, coarse.radialDivisions);
  const circumferentialRatio = integerRatio(
    fine.circumferentialDivisions,
    coarse.circumferentialDivisions,
  );
  const refinementRatioCompatible = radialRatio !== null
    && circumferentialRatio !== null
    && radialRatio === circumferentialRatio
    && radialRatio > 1;
  const expectedParentRingIndex = refinementRatioCompatible
    ? Math.floor(fine.radialRingIndex / radialRatio) : null;
  const expectedParentSectorIndex = refinementRatioCompatible
    ? Math.floor(fine.circumferentialSectorIndex / circumferentialRatio) : null;
  const radialParentCompatible = refinementRatioCompatible
    && expectedParentRingIndex === coarse.radialRingIndex;
  const circumferentialParentCompatible = refinementRatioCompatible
    && expectedParentSectorIndex === coarse.circumferentialSectorIndex;
  const topologySignatureStable = coarse.topologySignature === fine.topologySignature;
  const orientationStable = coarse.orientation === fine.orientation;
  const triangleSideStable = coarse.triangleSide === fine.triangleSide;
  const naturalCoordinateDelta = deepFreeze({
    xi: Math.abs(fine.naturalCoordinates.xi - coarse.naturalCoordinates.xi),
    eta: Math.abs(fine.naturalCoordinates.eta - coarse.naturalCoordinates.eta),
    lambda1: Math.abs(
      fine.naturalCoordinates.lambda1 - coarse.naturalCoordinates.lambda1,
    ),
    maximum: Math.max(
      Math.abs(fine.naturalCoordinates.xi - coarse.naturalCoordinates.xi),
      Math.abs(fine.naturalCoordinates.eta - coarse.naturalCoordinates.eta),
      Math.abs(
        fine.naturalCoordinates.lambda1 - coarse.naturalCoordinates.lambda1,
      ),
    ),
  });
  return deepFreeze({
    coarseOrdinal: coarse.ordinal,
    fineOrdinal: fine.ordinal,
    coarseElementId: coarse.elementId,
    fineElementId: fine.elementId,
    radialRefinementRatio: radialRatio,
    circumferentialRefinementRatio: circumferentialRatio,
    refinementRatioCompatible,
    expectedParentRingIndex,
    expectedParentSectorIndex,
    actualParentRingIndex: coarse.radialRingIndex,
    actualParentSectorIndex: coarse.circumferentialSectorIndex,
    radialParentCompatible,
    circumferentialParentCompatible,
    triangleSideStable,
    orientationStable,
    topologySignatureStable,
    elementPhaseSignatureChanged:
      coarse.elementPhaseSignature !== fine.elementPhaseSignature,
    naturalCoordinateDelta,
    parentElementLineage: `${fine.elementId}->${coarse.elementId}`,
    compatible: refinementRatioCompatible
      && radialParentCompatible
      && circumferentialParentCompatible
      && topologySignatureStable
      && orientationStable,
  });
}

function buildDiagnosis(levels, transitions, probes) {
  const triangleSides = levels.map((row) => row.triangleSide);
  const alternatingTriangleSide = triangleSides.length >= 3
    && triangleSides.slice(1).every(
      (side, index) => side !== null && side !== triangleSides[index],
    );
  const triangleSideMovement = transitions.some((row) => !row.triangleSideStable);
  const radialCellPhaseMovement = transitions.some(
    (row) => !row.radialParentCompatible,
  );
  const circumferentialCellPhaseMovement = transitions.some(
    (row) => !row.circumferentialParentCompatible,
  );
  const edgeProximity = levels.some((row) => !row.naturalMarginAccepted);
  const topologyMetadataUnavailable = levels.some(
    (row) => !row.topologyMetadataAvailable,
  );
  const maximumNaturalCoordinateDelta = Math.max(
    0,
    ...transitions.map((row) => row.naturalCoordinateDelta.maximum),
  );
  const stressSequenceClassification = classifySequence(
    probes.map((row) => row.authoritativeValue),
  );
  let governingDiagnosis = 'TOPOLOGY_COMPATIBLE_GENUINE_STRESS_FIELD_CANDIDATE';
  if (topologyMetadataUnavailable) governingDiagnosis = 'TOPOLOGY_METADATA_UNAVAILABLE';
  else if (edgeProximity) governingDiagnosis = 'EDGE_PROXIMITY';
  else if (alternatingTriangleSide) governingDiagnosis = 'ALTERNATING_TRIANGLE_SIDE';
  else if (triangleSideMovement) governingDiagnosis = 'TRIANGLE_SIDE_MOVEMENT';
  else if (radialCellPhaseMovement) governingDiagnosis = 'RADIAL_CELL_PHASE_MOVEMENT';
  else if (circumferentialCellPhaseMovement) {
    governingDiagnosis = 'CIRCUMFERENTIAL_CELL_PHASE_MOVEMENT';
  }
  return deepFreeze({
    governingDiagnosis,
    stressSequenceClassification,
    triangleSideSequence: triangleSides,
    alternatingTriangleSide,
    triangleSideMovement,
    radialCellPhaseMovement,
    circumferentialCellPhaseMovement,
    edgeProximity,
    topologyMetadataUnavailable,
    maximumNaturalCoordinateDelta,
    exactElementPhaseChanges: transitions.filter(
      (row) => row.elementPhaseSignatureChanged,
    ).length,
    genuineStressFieldCandidate: governingDiagnosis
      === 'TOPOLOGY_COMPATIBLE_GENUINE_STRESS_FIELD_CANDIDATE',
  });
}

function classifySequence(values) {
  const differences = values.slice(1).map((value, index) => value - values[index]);
  if (differences.every((value) => value === 0)) return 'ZERO_DIFFERENCE';
  if (differences.some((value) => value === 0)) return 'MIXED_ZERO';
  const signs = differences.map(Math.sign);
  if (signs.every((sign) => sign === signs[0])) return 'MONOTONIC';
  if (signs.slice(1).every((sign, index) => sign === -signs[index])) {
    return 'OSCILLATORY';
  }
  return 'NON_MONOTONIC';
}

function validateProbeEvidence(value, exactHeadSha) {
  if (!value
    || value.schema !== LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA
    || value.producerRevision !== LAFEA_BUCKET_01_FIXED_PROBE_REVISION
    || value.exactHeadSha !== exactHeadSha
    || value.status !== 'PASS'
    || value.topologyObservation?.status !== 'PASS'
    || value.topologyObservationHash !== value.topologyObservation.semanticHash
    || value.topologySignature !== value.topologyObservation.topologySignature
    || value.elementPhaseSignature !== value.topologyObservation.elementPhaseSignature
    || typeof value.authoritativeValue !== 'number'
    || !Number.isFinite(value.authoritativeValue)) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_PROBE_EVIDENCE_INVALID');
  }
  const basis = { ...value };
  delete basis.semanticHash;
  if (canonicalLafeaSha256(basis) !== value.semanticHash) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_PROBE_HASH_TAMPERED');
  }
  return value;
}

function assertProbeIdentityStable(probes) {
  const reference = probes[0].probe;
  for (const row of probes.slice(1)) {
    const probe = row.probe;
    if (probe.probeId !== reference.probeId
      || probe.loadCaseId !== reference.loadCaseId
      || probe.component !== reference.component
      || probe.units !== reference.units
      || probe.locationDefinitionHash !== reference.locationDefinitionHash
      || probe.x !== reference.x
      || probe.y !== reference.y) {
      throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_IDENTITY_DRIFT');
    }
  }
}

function normalizeOrdinals(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_ORDINALS_INVALID');
  }
  const ordinals = value.map((row) => positiveInteger(row, 'level ordinal'));
  if (new Set(ordinals).size !== ordinals.length
    || !ordinals.every((row, index) => index === 0 || row > ordinals[index - 1])) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_ORDINALS_INVALID');
  }
  return deepFreeze(ordinals);
}

function integerRatio(numerator, denominator) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)
    || denominator <= 0 || numerator <= denominator) return null;
  const ratio = numerator / denominator;
  return Number.isInteger(ratio) ? ratio : null;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_RECORD_INVALID', label);
  }
  if (JSON.stringify(Object.keys(value).sort())
    !== JSON.stringify([...expected].sort())) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_EXACT_KEYS_INVALID', label);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_EXACT_HEAD_INVALID');
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_INTEGER_REQUIRED', label);
  }
  return value;
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw topologyError('LAFEA_B01_PROBE_TOPOLOGY_NON_NEGATIVE_REQUIRED', label);
  }
  return Object.is(value, -0) ? 0 : value;
}

function topologyError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
