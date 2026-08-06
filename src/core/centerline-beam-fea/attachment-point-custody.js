import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import {
  ATTACHMENT_POINT_KINDS,
  seedRequiredAttachmentPoints as seedAttachmentTopology,
} from './node-seeding.js';

/**
 * Govern retained attachment-station custody around the topology-only seeder.
 *
 * The topology seeder is intentionally idempotent by attachment identity: once
 * an identity is present on a node, it does not attempt to resolve the original
 * source segment again because that segment may have been split. This module
 * makes that idempotence safe by retaining the original segment/fraction
 * lineage and requiring an exact replay before the identity may be skipped.
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
    throw new SharedAnalysisContractError(
      'Required attachment points must be an array.',
      'ATTACHMENT_POINT_LIST_INVALID',
    );
  }
  const byId = new Set();
  for (const point of points) {
    if (!point || typeof point !== 'object') {
      throw new SharedAnalysisContractError(
        'Each required attachment point must be a record.',
        'ATTACHMENT_POINT_INVALID',
      );
    }
    if (typeof point.attachmentPointId !== 'string' || point.attachmentPointId.length === 0) {
      throw new SharedAnalysisContractError(
        'Attachment point identity must be a non-empty string.',
        'ATTACHMENT_POINT_ID_INVALID',
      );
    }
    if (byId.has(point.attachmentPointId)) {
      throw new SharedAnalysisContractError(
        `Attachment point identity ${point.attachmentPointId} is declared more than once.`,
        'ATTACHMENT_POINT_ID_DUPLICATE',
      );
    }
    byId.add(point.attachmentPointId);
    if (typeof point.segmentId !== 'string' || point.segmentId.length === 0) {
      throw new SharedAnalysisContractError(
        `Attachment point ${point.attachmentPointId} requires a non-empty source segment identity.`,
        'ATTACHMENT_POINT_SEGMENT_INVALID',
      );
    }
    if (!ATTACHMENT_POINT_KINDS.includes(point.kind)) {
      throw new SharedAnalysisContractError(
        `Attachment point ${point.attachmentPointId} has unsupported kind ${point.kind}.`,
        'ATTACHMENT_POINT_KIND_UNSUPPORTED',
      );
    }
    if (typeof point.fraction !== 'number'
      || !Number.isFinite(point.fraction)
      || !(point.fraction >= 0 && point.fraction <= 1)) {
      throw new SharedAnalysisContractError(
        `Attachment point ${point.attachmentPointId} fraction must be finite and in [0, 1].`,
        'ATTACHMENT_POINT_FRACTION_OUT_OF_RANGE',
      );
    }
  }
}

function indexRetainedCustody(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    for (const row of custodyRows(node)) {
      const retained = normalizeCustody(row, node.id);
      const prior = byId.get(retained.attachmentPointId);
      if (prior) {
        if (sameCustody(prior, retained)) continue;
        throw new SharedAnalysisContractError(
          `Attachment point ${retained.attachmentPointId} is retained by more than one incompatible node or lineage record.`,
          'ATTACHMENT_POINT_CUSTODY_DUPLICATE',
        );
      }
      byId.set(retained.attachmentPointId, retained);
    }
  }
  return byId;
}

function custodyRows(node) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const rows = Array.isArray(meta.attachmentPoints) ? [...meta.attachmentPoints] : [];
  if (typeof meta.attachmentPointId === 'string'
    && meta.attachmentPointId.length > 0
    && !rows.some((row) => row?.attachmentPointId === meta.attachmentPointId)) {
    rows.push({
      attachmentPointId: meta.attachmentPointId,
      kind: meta.attachmentPointKind ?? null,
    });
  }
  return rows;
}

function normalizeCustody(row, nodeId) {
  return {
    attachmentPointId: row.attachmentPointId,
    kind: row.kind ?? null,
    sourceSegmentId: row.sourceSegmentId ?? row.segmentId ?? null,
    sourceFraction: row.sourceFraction ?? row.fraction ?? null,
    nodeId,
  };
}

function sameCustody(left, right) {
  return left.attachmentPointId === right.attachmentPointId
    && left.kind === right.kind
    && left.sourceSegmentId === right.sourceSegmentId
    && left.sourceFraction === right.sourceFraction
    && left.nodeId === right.nodeId;
}

function requireExactReplay(point, retained) {
  if (retained.kind === null
    || retained.sourceSegmentId === null
    || retained.sourceFraction === null) {
    throw new SharedAnalysisContractError(
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
    throw new SharedAnalysisContractError(
      `Attachment point ${point.attachmentPointId} replay does not match retained custody: ${mismatches.join(', ')}.`,
      'ATTACHMENT_POINT_REPLAY_MISMATCH',
    );
  }
}

function enrichNodeCustody(node, pointById) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  if (!Array.isArray(meta.attachmentPoints)) return node;
  let changed = false;
  const attachmentPoints = meta.attachmentPoints.map((row) => {
    const point = pointById.get(row?.attachmentPointId);
    if (!point) return row;
    const enriched = {
      ...row,
      attachmentPointId: point.attachmentPointId,
      kind: point.kind,
      sourceSegmentId: point.segmentId,
      sourceFraction: point.fraction,
    };
    if (row.kind !== enriched.kind
      || row.sourceSegmentId !== enriched.sourceSegmentId
      || row.sourceFraction !== enriched.sourceFraction) {
      changed = true;
    }
    return enriched;
  });
  if (!changed) return node;
  return {
    ...node,
    meta: {
      ...meta,
      attachmentPoints,
    },
  };
}

function info(code, scope, data) {
  return { severity: 'info', code, message: `${code} (${scope})`, data };
}
