import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { validateCanonicalGeometry } from '../geometry/validateCanonicalGeometry.js';
import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { seedIntermediateNodes, seedRequiredAttachmentPoints } from './node-seeding.js';

/**
 * Geometry conditioning — LFEA B-1, the mesher.
 *
 * Turns imported canonical geometry (`src/core/geometry/geometryTypes.js`)
 * into a model with a node everywhere the plan requires one, ready for beam
 * model assembly (B-2). Two passes, in order:
 *
 * 1. `seedRequiredAttachmentPoints` — nodes for supports, restraints and
 *    LAFEA attachment-load extraction points that fall partway along a
 *    segment (mandatory rules 1 and 5).
 * 2. `seedIntermediateNodes` — subdivide every segment to the declared span
 *    and curvature seeding limits (the intermediate seeding rule).
 *
 * Mandatory rules 2 (branch connections), 3 (property changes) and 6 (free
 * ends, nozzles) are already satisfied by how canonical geometry represents a
 * route: a segment's start and end are always distinct declared nodes, so a
 * branch point, a property boundary and a terminal end are nodes by
 * construction, not something this module needs to insert. `verifyStructuralInvariants`
 * checks that construction holds rather than assuming it silently.
 *
 * No numeric literal here decides a seeding limit — every one of
 * `spanSeedingLimit`, `bendSeedingSegments` and `bendLengthErrorLimit` is read
 * from the profile via `requireDeclaredValue`, which rejects an absent value
 * rather than defaulting it.
 */

export const CONDITIONING_PROFILE_FIELDS = Object.freeze([
  'spanSeedingLimit',
  'bendSeedingSegments',
  'bendLengthErrorLimit',
]);

const CANONICAL_GEOMETRY_SCHEMA = 'canonical-geometry-v1';

/**
 * Condition canonical geometry: seed mandatory attachment points, then
 * subdivide to the declared span and curvature limits.
 *
 * Idempotent (LFEA B-1 test 7): conditioning an already-conditioned model
 * with the same inputs changes nothing, because attachment points already
 * seeded are recognised by their tag rather than re-resolved by segment id,
 * and every segment produced by the first pass already satisfies the
 * seeding limits the second pass enforces.
 *
 * @param {object} geometry Canonical geometry (`schemaVersion: 'canonical-geometry-v1'`).
 * @param {Array<{attachmentPointId:string, segmentId:string, fraction:number, kind:string}>} requiredAttachmentPoints
 *        Supports, restraints and LAFEA extraction points not already at a node.
 * @param {object} profile Declared conditioning profile — see `CONDITIONING_PROFILE_FIELDS`.
 * The returned `semanticHash` covers the geometry proper — schema, nodes,
 * segments, source and unit — not the diagnostics trail. A diagnostic such as
 * `ATTACHMENT_POINT_ALREADY_SEEDED` is legitimately different between a first
 * pass and a re-entrant one even though the model itself does not change, so
 * diagnostics cannot be part of an idempotence hash without making every
 * re-entrant call look like a change. This mirrors
 * `local-shell/result-hashes.js`, which also keeps evidence hashes separate
 * from the qualification/diagnostic trail rather than folding everything into
 * one hash.
 *
 * @returns {Readonly<{geometry:object, report:object, semanticHash:string}>}
 */
export function conditionGeometry(geometry, requiredAttachmentPoints, profile) {
  assertCanonicalGeometry(geometry);
  const spanLimit = requireDeclaredValue(profile, 'spanSeedingLimit', { exclusiveMinimum: 0 });
  const bendSegments = requireDeclaredValue(profile, 'bendSeedingSegments', { minimum: 2 });
  const bendLengthErrorLimit = requireDeclaredValue(profile, 'bendLengthErrorLimit', { exclusiveMinimum: 0 });

  const attachment = seedRequiredAttachmentPoints(geometry, requiredAttachmentPoints || []);
  const intermediate = seedIntermediateNodes(attachment.geometry, spanLimit, bendSegments, bendLengthErrorLimit);

  const conditioned = {
    ...intermediate.geometry,
    diagnostics: [...(geometry.diagnostics || []), ...attachment.diagnostics, ...intermediate.diagnostics],
  };

  const structural = validateCanonicalGeometry(conditioned, { requireKnownUnit: false });
  if (!structural.ok) {
    const details = structural.errors.map((error) => (
      error.message ? `${error.code} (${error.message})` : error.code
    ));
    throw new SharedAnalysisContractError(
      `Conditioned geometry failed structural validation: ${details.join(', ')}`,
      'CONDITIONED_GEOMETRY_INVALID',
    );
  }
  verifyStructuralInvariants(conditioned);

  const report = Object.freeze({
    spanSeedingLimit: spanLimit,
    bendSeedingSegments: bendSegments,
    bendLengthErrorLimit,
    attachmentPointsInserted: Object.freeze(attachment.inserted),
    intermediateNodesInserted: Object.freeze(intermediate.inserted),
  });

  const frozenGeometry = deepFreeze(conditioned);
  return Object.freeze({
    geometry: frozenGeometry,
    report,
    semanticHash: semanticHash(geometryOnly(conditioned)),
  });
}

function geometryOnly(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, ...rest } = geometry;
  return rest;
}

/**
 * Confirm mandatory rules 2, 3 and 6 hold on the conditioned geometry: every
 * segment boundary is a distinct node, and no segment starts and ends on the
 * same node. This does not walk the connectivity graph — it is a direct
 * per-segment check, an O(segments) scan with a node-id index, not a
 * traversal — and it does not insert anything; `validateCanonicalGeometry`
 * and this function together are the proof, not a second mesher.
 *
 * @param {object} geometry Conditioned canonical geometry.
 */
function verifyStructuralInvariants(geometry) {
  const nodeIds = new Set(geometry.nodes.map((node) => node.id));
  for (const segment of geometry.segments) {
    if (!nodeIds.has(segment.startNodeId) || !nodeIds.has(segment.endNodeId)) {
      throw new SharedAnalysisContractError(
        `Segment ${segment.id} references a node that does not exist after conditioning.`,
        'CONDITIONED_SEGMENT_NODE_MISSING',
      );
    }
    if (segment.startNodeId === segment.endNodeId && segment.type !== 'SUPPORT') {
      throw new SharedAnalysisContractError(
        `Segment ${segment.id} starts and ends on the same node after conditioning.`,
        'CONDITIONED_SEGMENT_ZERO_TOPOLOGY',
      );
    }
  }
}

function assertCanonicalGeometry(geometry) {
  if (!geometry || geometry.schemaVersion !== CANONICAL_GEOMETRY_SCHEMA) {
    throw new SharedAnalysisContractError(`conditionGeometry requires schemaVersion ${CANONICAL_GEOMETRY_SCHEMA}.`, 'CANONICAL_GEOMETRY_SCHEMA_MISMATCH');
  }
  if (!Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    throw new SharedAnalysisContractError('conditionGeometry requires nodes and segments arrays.', 'CANONICAL_GEOMETRY_INVALID');
  }
}
