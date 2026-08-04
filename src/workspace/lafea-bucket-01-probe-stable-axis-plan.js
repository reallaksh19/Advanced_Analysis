import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA =
  'lafea-bucket-01-probe-stable-axis-plan-input/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_EVIDENCE_SCHEMA =
  'lafea-bucket-01-probe-stable-axis-plan-evidence/v1';
export const LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_REVISION =
  'B01-PROBE-STABLE-AXIS.2';

const INPUT_KEYS = Object.freeze([
  'schema',
  'axisId',
  'axisKind',
  'domainStart',
  'domainEnd',
  'anchors',
  'protectedBreakpoints',
  'targetPhase',
  'refinementRatio',
  'levelCount',
  'backgroundBaseDivisions',
  'windowClearanceFraction',
]);
const ANCHOR_KEYS = Object.freeze(['anchorId', 'value']);
const AXIS_KINDS = Object.freeze(new Set([
  'RADIAL_LENGTH',
  'POLAR_ANGLE_DEGREES',
]));
const NUMERIC_TOLERANCE = 1e-12;

export function buildLafeaBucket01ProbeStableAxisPlan(inputValue) {
  const sourceInput = normalizeInput(inputValue);
  const baseWindows = buildBaseWindows(sourceInput);
  const levels = [];
  for (let ordinal = 1; ordinal <= sourceInput.levelCount; ordinal += 1) {
    levels.push(buildLevel(sourceInput, baseWindows, ordinal));
  }
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_REVISION,
    axisId: sourceInput.axisId,
    axisKind: sourceInput.axisKind,
    sourceInput,
    baseWindows,
    levels,
    status: 'DESIGN_READY_NOT_PRODUCTION',
    authority: {
      frozenAnchorValuesPreserved: true,
      protectedFeatureBreakpointsPreserved: true,
      anchorCellsSelfSimilarAcrossLevels: true,
      anchorPhaseInvariantAcrossLevels: true,
      anchorCellWidthsContractByGovernedRatio: true,
      deterministicTransitionCoordinates: true,
      globalCoordinatesNested: false,
      transitionRemeshingRequired: true,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01ProbeStableAxisPlanEvidence(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_REVISION) {
      throw planError('LAFEA_B01_PROBE_STABLE_AXIS_EVIDENCE_INVALID');
    }
    const rebuilt = buildLafeaBucket01ProbeStableAxisPlan(value.sourceInput);
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw planError('LAFEA_B01_PROBE_STABLE_AXIS_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw planError('LAFEA_B01_PROBE_STABLE_AXIS_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_PROBE_STABLE_AXIS_INVALID'],
    });
  }
}

function normalizeInput(value) {
  exactKeys(value, INPUT_KEYS, 'probe-stable axis input');
  if (value.schema !== LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_INPUT_SCHEMA_INVALID');
  }
  const axisId = text(value.axisId, 'axisId');
  const axisKind = text(value.axisKind, 'axisKind');
  if (!AXIS_KINDS.has(axisKind)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_KIND_INVALID');
  }
  const domainStart = finite(value.domainStart, 'domainStart');
  const domainEnd = finite(value.domainEnd, 'domainEnd');
  if (!(domainEnd > domainStart)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_DOMAIN_INVALID');
  }
  if (axisKind === 'POLAR_ANGLE_DEGREES'
    && Math.abs((domainEnd - domainStart) - 360) > NUMERIC_TOLERANCE) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_ANGLE_SPAN_INVALID');
  }
  if (!Array.isArray(value.anchors) || value.anchors.length === 0) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_ANCHORS_REQUIRED');
  }
  const anchors = value.anchors.map((row) => {
    exactKeys(row, ANCHOR_KEYS, 'probe-stable axis anchor');
    return {
      anchorId: text(row.anchorId, 'anchorId'),
      value: finite(row.value, 'anchor.value'),
    };
  }).sort((left, right) => left.value - right.value
    || left.anchorId.localeCompare(right.anchorId));
  if (new Set(anchors.map((row) => row.anchorId)).size !== anchors.length
    || new Set(anchors.map((row) => row.value)).size !== anchors.length) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_ANCHOR_DUPLICATE');
  }
  if (anchors.some((row) => !(row.value > domainStart && row.value < domainEnd))) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_ANCHOR_OUTSIDE_DOMAIN');
  }
  if (!Array.isArray(value.protectedBreakpoints)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_BREAKPOINTS_INVALID');
  }
  const protectedBreakpoints = value.protectedBreakpoints
    .map((row) => finite(row, 'protectedBreakpoint'))
    .sort((left, right) => left - right);
  if (new Set(protectedBreakpoints).size !== protectedBreakpoints.length
    || protectedBreakpoints.some((row) =>
      !(row > domainStart && row < domainEnd))) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_BREAKPOINTS_INVALID');
  }
  if (protectedBreakpoints.some((breakpoint) =>
    anchors.some((anchor) => Math.abs(anchor.value - breakpoint)
      <= NUMERIC_TOLERANCE))) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_BREAKPOINT_ANCHOR_COLLISION');
  }
  const targetPhase = finite(value.targetPhase, 'targetPhase');
  if (!(targetPhase > 0.1 && targetPhase < 0.9)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_PHASE_INVALID');
  }
  const refinementRatio = integer(value.refinementRatio, 'refinementRatio');
  if (refinementRatio < 2) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_REFINEMENT_RATIO_INVALID');
  }
  const levelCount = integer(value.levelCount, 'levelCount');
  if (levelCount < 2 || levelCount > 8) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_LEVEL_COUNT_INVALID');
  }
  const backgroundBaseDivisions = integer(
    value.backgroundBaseDivisions,
    'backgroundBaseDivisions',
  );
  if (backgroundBaseDivisions < anchors.length + 1) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_BACKGROUND_DIVISIONS_INVALID');
  }
  const windowClearanceFraction = finite(
    value.windowClearanceFraction,
    'windowClearanceFraction',
  );
  if (!(windowClearanceFraction > 0 && windowClearanceFraction < 0.5)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_CLEARANCE_INVALID');
  }
  return deepFreeze({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
    axisId,
    axisKind,
    domainStart,
    domainEnd,
    anchors,
    protectedBreakpoints,
    targetPhase,
    refinementRatio,
    levelCount,
    backgroundBaseDivisions,
    windowClearanceFraction,
  });
}

function buildBaseWindows(input) {
  const windows = input.anchors.map((anchor, index) => {
    const previousValue = index === 0
      ? input.domainStart : input.anchors[index - 1].value;
    const nextValue = index === input.anchors.length - 1
      ? input.domainEnd : input.anchors[index + 1].value;
    const leftClearance = anchor.value - previousValue;
    const rightClearance = nextValue - anchor.value;
    const width = Math.min(
      input.windowClearanceFraction * leftClearance / input.targetPhase,
      input.windowClearanceFraction * rightClearance / (1 - input.targetPhase),
    );
    if (!(width > 0)) {
      throw planError('LAFEA_B01_PROBE_STABLE_AXIS_WINDOW_INVALID');
    }
    const left = anchor.value - input.targetPhase * width;
    const right = anchor.value + (1 - input.targetPhase) * width;
    return deepFreeze({
      anchorId: anchor.anchorId,
      anchorValue: anchor.value,
      leftClearance,
      rightClearance,
      baseWidth: width,
      baseLeft: left,
      baseRight: right,
    });
  });
  for (let index = 1; index < windows.length; index += 1) {
    if (!(windows[index - 1].baseRight < windows[index].baseLeft)) {
      throw planError('LAFEA_B01_PROBE_STABLE_AXIS_WINDOWS_OVERLAP');
    }
  }
  if (input.protectedBreakpoints.some((breakpoint) =>
    windows.some((window) =>
      breakpoint > window.baseLeft - NUMERIC_TOLERANCE
        && breakpoint < window.baseRight + NUMERIC_TOLERANCE))) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_BREAKPOINT_WINDOW_COLLISION');
  }
  return deepFreeze(windows);
}

function buildLevel(input, baseWindows, ordinal) {
  const scale = input.refinementRatio ** (ordinal - 1);
  const targetBackgroundCellWidth = (input.domainEnd - input.domainStart)
    / (input.backgroundBaseDivisions * scale);
  const windows = baseWindows.map((window) => {
    const width = window.baseWidth / scale;
    return {
      anchorId: window.anchorId,
      anchorValue: window.anchorValue,
      left: window.anchorValue - input.targetPhase * width,
      right: window.anchorValue + (1 - input.targetPhase) * width,
      width,
    };
  });
  const coordinates = [input.domainStart];
  const anchorCells = [];
  let cursor = input.domainStart;
  for (const window of windows) {
    appendPartitionedGap(
      coordinates,
      cursor,
      window.left,
      targetBackgroundCellWidth,
      input.protectedBreakpoints,
    );
    const cellIndex = coordinates.length - 1;
    appendCoordinate(coordinates, window.right);
    const phase = (window.anchorValue - window.left) / window.width;
    anchorCells.push(deepFreeze({
      anchorId: window.anchorId,
      anchorValue: window.anchorValue,
      cellIndex,
      left: window.left,
      right: window.right,
      width: window.width,
      phase,
      distanceToLeft: window.anchorValue - window.left,
      distanceToRight: window.right - window.anchorValue,
      cellId: `${input.axisId}:${window.anchorId}:L${ordinal}`,
      parentCellId: ordinal === 1
        ? null : `${input.axisId}:${window.anchorId}:L${ordinal - 1}`,
    }));
    cursor = window.right;
  }
  appendPartitionedGap(
    coordinates,
    cursor,
    input.domainEnd,
    targetBackgroundCellWidth,
    input.protectedBreakpoints,
  );
  validateCoordinates(
    coordinates,
    input.domainStart,
    input.domainEnd,
    input.protectedBreakpoints,
  );
  const anchorCellIndices = new Set(anchorCells.map((row) => row.cellIndex));
  const cellWidths = coordinates.slice(1).map(
    (coordinate, index) => coordinate - coordinates[index],
  );
  const backgroundCellWidths = cellWidths.filter(
    (_width, index) => !anchorCellIndices.has(index),
  );
  const coordinateHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-probe-stable-axis-coordinates/v1',
    axisId: input.axisId,
    ordinal,
    coordinates,
  });
  const base = {
    ordinal,
    refinementScale: scale,
    targetBackgroundCellWidth,
    coordinates,
    coordinateHash,
    cellCount: coordinates.length - 1,
    anchorCellCount: anchorCells.length,
    protectedBreakpointCount: input.protectedBreakpoints.length,
    protectedBreakpoints: input.protectedBreakpoints,
    backgroundCellCount: coordinates.length - 1 - anchorCells.length,
    minimumCellWidth: Math.min(...cellWidths),
    maximumCellWidth: Math.max(...cellWidths),
    maximumBackgroundCellWidth: Math.max(...backgroundCellWidths),
    anchorCells,
    anchorPhaseMaximumError: Math.max(
      ...anchorCells.map((row) => Math.abs(row.phase - input.targetPhase)),
    ),
    status: 'DESIGN_READY',
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function appendPartitionedGap(coordinates, start, end, targetWidth,
  protectedBreakpoints) {
  const contained = protectedBreakpoints.filter((breakpoint) =>
    breakpoint > start + NUMERIC_TOLERANCE
      && breakpoint < end - NUMERIC_TOLERANCE);
  let cursor = start;
  for (const endpoint of [...contained, end]) {
    appendUniformGap(coordinates, cursor, endpoint, targetWidth);
    cursor = endpoint;
  }
}

function appendUniformGap(coordinates, start, end, targetWidth) {
  const gap = end - start;
  if (gap < -NUMERIC_TOLERANCE) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_GAP_NEGATIVE');
  }
  if (gap <= NUMERIC_TOLERANCE) return;
  const segmentCount = Math.max(1, Math.ceil(gap / targetWidth));
  for (let index = 1; index <= segmentCount; index += 1) {
    const coordinate = index === segmentCount
      ? end : start + gap * index / segmentCount;
    appendCoordinate(coordinates, coordinate);
  }
}

function appendCoordinate(coordinates, coordinateValue) {
  const coordinate = normalizeZero(coordinateValue);
  const previous = coordinates.at(-1);
  if (!(coordinate > previous + NUMERIC_TOLERANCE)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_COORDINATE_ORDER_INVALID');
  }
  coordinates.push(coordinate);
}

function validateCoordinates(coordinates, domainStart, domainEnd,
  protectedBreakpoints) {
  if (coordinates[0] !== domainStart || coordinates.at(-1) !== domainEnd) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_DOMAIN_COVERAGE_INVALID');
  }
  for (let index = 1; index < coordinates.length; index += 1) {
    if (!(coordinates[index] > coordinates[index - 1])) {
      throw planError('LAFEA_B01_PROBE_STABLE_AXIS_COORDINATE_ORDER_INVALID');
    }
  }
  if (protectedBreakpoints.some((breakpoint) =>
    !coordinates.includes(breakpoint))) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_BREAKPOINT_NOT_RETAINED');
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_RECORD_INVALID', label);
  }
  if (JSON.stringify(Object.keys(value).sort())
    !== JSON.stringify([...expected].sort())) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_EXACT_KEYS_INVALID', label);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_TEXT_REQUIRED', label);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_FINITE_REQUIRED', label);
  }
  return normalizeZero(value);
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw planError('LAFEA_B01_PROBE_STABLE_AXIS_INTEGER_REQUIRED', label);
  }
  return value;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function planError(code, message = code) {
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
