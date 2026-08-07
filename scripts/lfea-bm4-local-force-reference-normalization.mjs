import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const ENDS = Object.freeze(['I', 'J']);
const FORCE_FIELDS = Object.freeze(['fx', 'fy', 'fz']);
const MOMENT_FIELDS = Object.freeze(['mx', 'my', 'mz']);

export const BM4_LOCAL_FORCE_REFERENCE_NORMALIZATION = Object.freeze({
  schema: 'bm4-local-force-reference-normalization-policy/v1',
  method: 'CAESAR_GLOBAL_RESULTANTS_PROJECTED_TO_LFEA_QUALIFIED_LOCAL_AXES',
  vectorMagnitudeParity: Object.freeze({ absoluteTolerance: 1e-3, relativeTolerance: 1e-6 }),
  unmatchedPolicy: 'PRESERVE_RAW_CAESAR_LOCAL_ROW_WITHOUT_INVENTED_STATION_MAPPING',
});

function norm(action, fields) {
  return Math.hypot(...fields.map((field) => action[field]));
}
function differenceAccepted(left, right, policy) {
  const difference = Math.abs(left - right);
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return difference <= policy.absoluteTolerance + policy.relativeTolerance * scale;
}
function pairRows(report, pairKey) {
  return report.byPair.get(pairKey) ?? [];
}
function compareVectorMagnitudes(globalAction, localAction, caseLabel, pairKey, rowIndex, end, family, policy) {
  const fields = family === 'force' ? FORCE_FIELDS : MOMENT_FIELDS;
  const globalMagnitude = norm(globalAction, fields);
  const localMagnitude = norm(localAction, fields);
  const absoluteDifference = Math.abs(globalMagnitude - localMagnitude);
  const scale = Math.max(globalMagnitude, localMagnitude);
  const relativeDifference = scale > 0 ? absoluteDifference / scale : 0;
  if (!differenceAccepted(globalMagnitude, localMagnitude, policy)) {
    throw new Error(`BM4 CAESAR ${caseLabel} ${pairKey} row ${rowIndex} ${end} ${family} global/local magnitude drift: ${absoluteDifference}.`);
  }
  return { absoluteDifference, relativeDifference };
}

export function auditBm4CiiGlobalLocalVectorParity(
  cii,
  policy = BM4_LOCAL_FORCE_REFERENCE_NORMALIZATION.vectorMagnitudeParity,
) {
  let comparedEnds = 0;
  let maxForceAbsoluteDifference = 0;
  let maxForceRelativeDifference = 0;
  let maxMomentAbsoluteDifference = 0;
  let maxMomentRelativeDifference = 0;
  for (const caseLabel of CASES) {
    const global = cii.globalForce.get(caseLabel);
    const local = cii.localForce.get(caseLabel);
    const pairKeys = new Set([...global.byPair.keys(), ...local.byPair.keys()]);
    for (const pairKey of pairKeys) {
      const globalRows = pairRows(global, pairKey);
      const localRows = pairRows(local, pairKey);
      if (globalRows.length !== localRows.length) {
        throw new Error(`BM4 CAESAR ${caseLabel} ${pairKey} global/local row-count mismatch ${globalRows.length}/${localRows.length}.`);
      }
      for (let index = 0; index < globalRows.length; index += 1) {
        for (const end of ENDS) {
          const force = compareVectorMagnitudes(globalRows[index][end], localRows[index][end], caseLabel, pairKey, index, end, 'force', policy);
          const moment = compareVectorMagnitudes(globalRows[index][end], localRows[index][end], caseLabel, pairKey, index, end, 'moment', policy);
          maxForceAbsoluteDifference = Math.max(maxForceAbsoluteDifference, force.absoluteDifference);
          maxForceRelativeDifference = Math.max(maxForceRelativeDifference, force.relativeDifference);
          maxMomentAbsoluteDifference = Math.max(maxMomentAbsoluteDifference, moment.absoluteDifference);
          maxMomentRelativeDifference = Math.max(maxMomentRelativeDifference, moment.relativeDifference);
          comparedEnds += 1;
        }
      }
    }
  }
  return Object.freeze({
    schema: 'bm4-cii-global-local-vector-parity/v1',
    comparedEnds,
    maxForceAbsoluteDifference,
    maxForceRelativeDifference,
    maxMomentAbsoluteDifference,
    maxMomentRelativeDifference,
    policy,
  });
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => String(candidate.id) === String(nodeId));
  if (!node) throw new Error(`BM4 local-force normalization node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}
function addOffset(value, offset) {
  if (!offset) return value;
  return [value[0] + offset.x, value[1] + offset.y, value[2] + offset.z];
}
function m035EntryAxes(authorities, entry) {
  return resolveFrameLocalAxes({
    nodeI: addOffset(point(authorities.analysisGeometry, entry.segment.startNodeId), entry.teeModifier?.rigidOffsets?.I),
    nodeJ: addOffset(point(authorities.analysisGeometry, entry.segment.endNodeId), entry.teeModifier?.rigidOffsets?.J),
    referenceVector: entry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  }).axes;
}
function m034EntryAxes(solved, entry) {
  return resolveFrameLocalAxes({
    nodeI: point(solved.normalized.geometry, entry.sourceSegment.startNodeId),
    nodeJ: point(solved.normalized.geometry, entry.sourceSegment.endNodeId),
    referenceVector: entry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  }).axes;
}

export function transformGlobalActionToLocalAxes(action, axes) {
  const dot = (values, axis) => values[0] * axis[0] + values[1] * axis[1] + values[2] * axis[2];
  const force = [action.fx, action.fy, action.fz];
  const moment = [action.mx, action.my, action.mz];
  return Object.freeze({
    fx: dot(force, axes.x),
    fy: dot(force, axes.y),
    fz: dot(force, axes.z),
    mx: dot(moment, axes.x),
    my: dot(moment, axes.y),
    mz: dot(moment, axes.z),
  });
}

function normalizedRow(globalRow, axesI, axesJ) {
  return Object.freeze({
    fromNode: globalRow.fromNode,
    toNode: globalRow.toNode,
    pairKey: globalRow.pairKey,
    I: transformGlobalActionToLocalAxes(globalRow.I, axesI),
    J: transformGlobalActionToLocalAxes(globalRow.J, axesJ),
  });
}
function buildNormalizedLocalForce(cii, axisEndsByPair) {
  const localForce = new Map();
  let normalizedRows = 0;
  let preservedRawRows = 0;
  for (const caseLabel of CASES) {
    const rawLocal = cii.localForce.get(caseLabel);
    const global = cii.globalForce.get(caseLabel);
    const byPair = new Map();
    const rows = [];
    for (const [pairKey, rawLocalRows] of rawLocal.byPair) {
      const globalRows = pairRows(global, pairKey);
      const axes = axisEndsByPair.get(pairKey);
      let outputRows = rawLocalRows;
      if (axes && globalRows.length === 1 && rawLocalRows.length === 1) {
        outputRows = [normalizedRow(globalRows[0], axes.I, axes.J)];
        normalizedRows += 1;
      } else {
        preservedRawRows += rawLocalRows.length;
      }
      byPair.set(pairKey, outputRows);
      rows.push(...outputRows);
    }
    localForce.set(caseLabel, Object.freeze({ rows: Object.freeze(rows), byPair }));
  }
  return { localForce, normalizedRows, preservedRawRows };
}
function withNormalizedLocalForce(cii, axisEndsByPair, authority) {
  const audit = auditBm4CiiGlobalLocalVectorParity(cii);
  const normalized = buildNormalizedLocalForce(cii, axisEndsByPair);
  return Object.freeze({
    ...cii,
    localForce: normalized.localForce,
    localForceReferenceNormalization: Object.freeze({
      schema: 'bm4-local-force-reference-normalization-evidence/v1',
      authority,
      policy: BM4_LOCAL_FORCE_REFERENCE_NORMALIZATION,
      vectorParityAudit: audit,
      normalizedRows: normalized.normalizedRows,
      preservedRawRows: normalized.preservedRawRows,
    }),
  });
}

export function normalizeBm4CiiLocalForceForM035(cii, authorities) {
  const axisEndsByPair = new Map();
  for (const sourceEntry of authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const pairKey = `${sourceEntry.sourceSegment.startNodeId}-${sourceEntry.sourceSegment.endNodeId}`;
    const descendants = authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    if (descendants.length === 0) continue;
    axisEndsByPair.set(pairKey, Object.freeze({
      I: m035EntryAxes(authorities, descendants[0]),
      J: m035EntryAxes(authorities, descendants.at(-1)),
    }));
  }
  return withNormalizedLocalForce(cii, axisEndsByPair, 'M035_QUALIFIED_ANALYSIS_AXES');
}

export function normalizeBm4CiiLocalForceForM034(cii, solved) {
  const axisEndsByPair = new Map();
  for (const entry of solved.entries) {
    const pairKey = `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
    const axes = m034EntryAxes(solved, entry);
    axisEndsByPair.set(pairKey, Object.freeze({ I: axes, J: axes }));
  }
  return withNormalizedLocalForce(cii, axisEndsByPair, 'M034_QUALIFIED_ANALYSIS_AXES');
}
