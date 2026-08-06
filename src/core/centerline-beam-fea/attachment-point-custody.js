import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import {
  ATTACHMENT_POINT_KINDS,
  seedRequiredAttachmentPoints as seedAttachmentTopology,
} from './node-seeding.js';

/**
 * Govern retained attachment-station custody around the topology-only seeder.
 *
 * `meta.attachmentPoints` remains the lightweight identity/kind surface.
 * `meta.attachmentPointCustody` retains the original source segment and exact
 * source fraction required to prove an idempotent replay.
 *
 * @param {object} geometry Canonical geometry.
 * @param {Array<{attachmentPointId:string,segmentId:string,fraction:number,kind:string}>} points
 * @returns {{geometry:object,inserted:Array<object>,diagnostics:Array<object>}}
 */
export function seedRequiredAttachmentPointsWithCustody(geometry, points) {
  validateAttachmentPoints(points);
  const retainedById = indexRetainedCustody(geometry.nodes);
  const pending = [];
  const replayed = [];

  for (const point of points) {
    const retained = retainedById.get(point.attachmentPointId);
    if (!retained) {
      pending.push(point);
      continue;
    }
    requireExactReplay(point, retained);
    replayed.push({ point, retained });
  }

  const seeded = seedAttachmentTopology(geometry, pending);
  const pointById = new Map(points.map((point) => [point.attachmentPointId, point]));
  const nodes = seeded.geometry.nodes.map((node) => enrichNodeCustody(node, pointById));
  const replayDiagnostics = replayed.map(({ point, retained }) => info(
    'ATTACHMENT_POINT_ALREADY_SEEDED',
    point.attachmentPointId,
    {
      segmentId: point.segmentId,
      fraction: point.fraction,
      nodeId: retained.nodeId,
    },
  ));

  return {
    geometry: { ...seeded.geometry, nodes },
    inserted: seeded.inserted,
    diagnostics: [...replayDiagnostics, ...seeded.diagnostics],
  };
}

function validateAttachmentPoints(points) {
  if (!Array.isArray(points)) {
    throw contract(
      'Required attachment points must be an array.',
      'ATTACHMENT_POINT_LIST_INVALID',
    );
  }
  const byId = new Set();
  for (const point of points) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      throw contract(
        'Each required attachment point must be a record.',
        'ATTACHMENT_POINT_INVALID',
      );
    }
    requireNonEmptyString(
      point.attachmentPointId,
      'Attachment point identity must be a non-empty string.',
      'ATTACHMENT_POINT_ID_INVALID',
    );
    if (byId.has(point.attachmentPointId)) {
      throw contract(
        `Attachment point identity ${point.attachmentPointId} is declared more than once.`,
        'ATTACHMENT_POINT_ID_DUPLICATE',
      );
    }
    byId.add(point.attachmentPointId);
    requireNonEmptyString(
      point.segmentId,
      `Attachment point ${point.attachmentPointId} requires a non-empty source segment identity.`,
      'ATTACHMENT_POINT_SEGMENT_INVALID',
    );
    requireKind(
      point.kind,
      `Attachment point ${point.attachmentPointId} has unsupported kind ${point.kind}.`,
      'ATTACHMENT_POINT_KIND_UNSUPPORTED',
    );
    requireFraction(
      point.fraction,
      `Attachment point ${point.attachmentPointId} fraction must be finite and in [0, 1].`,
      'ATTACHMENT_POINT_FRACTION_OUT_OF_RANGE',
    );
  }
}

function indexRetainedCustody(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    for (const retained of retainedRowsForNode(node)) {
      const prior = byId.get(retained.attachmentPointId);
      if (prior) {
        throw contract(
          `Attachment point ${retained.attachmentPointId} is retained by more than one node.`,
          'ATTACHMENT_POINT_CUSTODY_DUPLICATE',
        );
      }
      byId.set(retained.attachmentPointId, retained);
    }
  }
  return byId;
}

function retainedRowsForNode(node) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const legacyById = legacyIdentityIndex(meta, node.id);
  const custodyById = custodyIndex(meta, node.id);

  for (const retained of custodyById.values()) {
    const legacy = legacyById.get(retained.attachmentPointId);
    if (!legacy) {
      throw contract(
        `Attachment point ${retained.attachmentPointId} has source custody on node ${node.id} but no retained lightweight identity.`,
        'ATTACHMENT_POINT_CUSTODY_ORPHANED',
      );
    }
    if (legacy.kind !== null && retained.kind !== null && legacy.kind !== retained.kind) {
      throw contract(
        `Attachment point ${retained.attachmentPointId} kind differs between retained identity and source custody.`,
        'ATTACHMENT_POINT_CUSTODY_KIND_MISMATCH',
      );
    }
  }

  return [...legacyById.values()].map((legacy) => {
    const retained = custodyById.get(legacy.attachmentPointId);
    if (!retained) {
      return {
        ...legacy,
        sourceSegmentId: null,
        sourceFraction: null,
        nodeId: node.id,
      };
    }
    return {
      ...retained,
      kind: retained.kind ?? legacy.kind,
      nodeId: node.id,
    };
  });
}

function legacyIdentityIndex(meta, nodeId) {
  if (meta.attachmentPoints !== undefined && !Array.isArray(meta.attachmentPoints)) {
    throw contract(
      `Node ${nodeId} attachmentPoints must be an array when declared.`,
      'ATTACHMENT_POINT_RETAINED_LIST_INVALID',
    );
  }
  const byId = new Map();
  for (const row of meta.attachmentPoints ?? []) {
    addLegacyIdentity(byId, row, nodeId);
  }
  if (meta.attachmentPointId !== undefined && meta.attachmentPointId !== null) {
    addLegacyIdentity(byId, {
      attachmentPointId: meta.attachmentPointId,
      kind: meta.attachmentPointKind ?? null,
    }, nodeId);
  }
  return byId;
}

function addLegacyIdentity(byId, row, nodeId) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw contract(
      `Node ${nodeId} contains an invalid retained attachment identity row.`,
      'ATTACHMENT_POINT_RETAINED_ROW_INVALID',
    );
  }
  requireNonEmptyString(
    row.attachmentPointId,
    `Node ${nodeId} contains a retained attachment identity without a non-empty id.`,
    'ATTACHMENT_POINT_RETAINED_ID_INVALID',
  );
  const kind = row.kind ?? null;
  if (kind !== null) {
    requireKind(
      kind,
      `Retained attachment point ${row.attachmentPointId} has unsupported kind ${kind}.`,
      'ATTACHMENT_POINT_RETAINED_KIND_UNSUPPORTED',
    );
  }
  const prior = byId.get(row.attachmentPointId);
  if (prior && prior.kind !== kind && prior.kind !== null && kind !== null) {
    throw contract(
      `Retained attachment point ${row.attachmentPointId} has conflicting kinds on node ${nodeId}.`,
      'ATTACHMENT_POINT_RETAINED_KIND_CONFLICT',
    );
  }
  byId.set(row.attachmentPointId, {
    attachmentPointId: row.attachmentPointId,
    kind: prior?.kind ?? kind,
    nodeId,
  });
}

function custodyIndex(meta, nodeId) {
  if (meta.attachmentPointCustody === undefined) return new Map();
  if (!Array.isArray(meta.attachmentPointCustody)) {
    throw contract(
      `Node ${nodeId} attachmentPointCustody must be an array when declared.`,
      'ATTACHMENT_POINT_CUSTODY_LIST_INVALID',
    );
  }
  const byId = new Map();
  for (const row of meta.attachmentPointCustody) {
    const retained = normalizeCustody(row, nodeId);
    if (byId.has(retained.attachmentPointId)) {
      throw contract(
        `Attachment point ${retained.attachmentPointId} has duplicate source-custody rows on node ${nodeId}.`,
        'ATTACHMENT_POINT_CUSTODY_DUPLICATE',
      );
    }
    byId.set(retained.attachmentPointId, retained);
  }
  return byId;
}

function normalizeCustody(row, nodeId) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw contract(
      `Node ${nodeId} contains an invalid attachment source-custody row.`,
      'ATTACHMENT_POINT_CUSTODY_ROW_INVALID',
    );
  }
  requireNonEmptyString(
    row.attachmentPointId,
    `Node ${nodeId} contains attachment source custody without a non-empty identity.`,
    'ATTACHMENT_POINT_CUSTODY_ID_INVALID',
  );
  const kind = row.kind ?? null;
  if (kind !== null) {
    requireKind(
      kind,
      `Attachment point ${row.attachmentPointId} custody has unsupported kind ${kind}.`,
      'ATTACHMENT_POINT_CUSTODY_KIND_UNSUPPORTED',
    );
  }
  const sourceSegmentId = row.sourceSegmentId ?? row.segmentId ?? null;
  if (sourceSegmentId !== null) {
    requireNonEmptyString(
      sourceSegmentId,
      `Attachment point ${row.attachmentPointId} custody has an invalid source segment identity.`,
      'ATTACHMENT_POINT_CUSTODY_SEGMENT_INVALID',
    );
  }
  const sourceFraction = row.sourceFraction ?? row.fraction ?? null;
  if (sourceFraction !== null) {
    requireFraction(
      sourceFraction,
      `Attachment point ${row.attachmentPointId} custody has an invalid source fraction.`,
      'ATTACHMENT_POINT_CUSTODY_FRACTION_INVALID',
    );
  }
  return {
    attachmentPointId: row.attachmentPointId,
    kind,
    sourceSegmentId,
    sourceFraction,
    nodeId,
  };
}

function requireExactReplay(point, retained) {
  if (retained.kind === null
    || retained.sourceSegmentId === null
    || retained.sourceFraction === null) {
    throw contract(
      `Attachment point ${point.attachmentPointId} is already seeded but its retained source lineage is incomplete.`,
      'ATTACHMENT_POINT_REPLAY_LINEAGE_UNAVAILABLE',
    );
  }
  const mismatches = [];
  if (retained.kind !== point.kind) mismatches.push(`kind ${retained.kind} != ${point.kind}`);
  if (retained.sourceSegmentId !== point.segmentId) {
    mismatches.push(`segment ${retained.sourceSegmentId} != ${point.segmentId}`);
  }
  if (retained.sourceFraction !== point.fraction) {
    mismatches.push(`fraction ${retained.sourceFraction} != ${point.fraction}`);
  }
  if (mismatches.length > 0) {
    throw contract(
      `Attachment point ${point.attachmentPointId} replay does not match retained custody: ${mismatches.join(', ')}.`,
      'ATTACHMENT_POINT_REPLAY_MISMATCH',
    );
  }
}

function enrichNodeCustody(node, pointById) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const retainedById = new Map(
    retainedRowsForNode(node).map((row) => [row.attachmentPointId, row]),
  );
  if (retainedById.size === 0) return node;

  const attachmentPointCustody = [];
  for (const retained of retainedById.values()) {
    const point = pointById.get(retained.attachmentPointId);
    if (point) {
      attachmentPointCustody.push({
        attachmentPointId: point.attachmentPointId,
        kind: point.kind,
        sourceSegmentId: point.segmentId,
        sourceFraction: point.fraction,
      });
      continue;
    }
    if (retained.kind !== null
      && retained.sourceSegmentId !== null
      && retained.sourceFraction !== null) {
      attachmentPointCustody.push({
        attachmentPointId: retained.attachmentPointId,
        kind: retained.kind,
        sourceSegmentId: retained.sourceSegmentId,
        sourceFraction: retained.sourceFraction,
      });
    }
  }
  attachmentPointCustody.sort((left, right) => compareAscii(
    left.attachmentPointId,
    right.attachmentPointId,
  ));

  if (attachmentPointCustody.length === 0) {
    if (meta.attachmentPointCustody === undefined) return node;
    const { attachmentPointCustody: _discarded, ...restMeta } = meta;
    return { ...node, meta: restMeta };
  }
  return {
    ...node,
    meta: {
      ...meta,
      attachmentPointCustody,
    },
  };
}

function requireKind(value, message, code) {
  if (!ATTACHMENT_POINT_KINDS.includes(value)) throw contract(message, code);
}

function requireFraction(value, message, code) {
  if (typeof value !== 'number'
    || !Number.isFinite(value)
    || !(value >= 0 && value <= 1)) {
    throw contract(message, code);
  }
}

function requireNonEmptyString(value, message, code) {
  if (typeof value !== 'string' || value.length === 0) throw contract(message, code);
}

function contract(message, code) {
  return new SharedAnalysisContractError(message, code);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function info(code, scope, data) {
  return { severity: 'info', code, message: `${code} (${scope})`, data };
}
