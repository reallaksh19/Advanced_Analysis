import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';

export const NON_FEA_3D_INVESTIGATION_PROJECTION_SCHEMA =
  'non-fea-3d-investigation-projection/v1';

/**
 * Read-only cross-navigation projection for Non-FEA investigation in the shared 3D viewport.
 *
 * The projection never derives identity from coordinates. It only carries exact workspace
 * entity IDs already present on the empirical restraint occurrence and binds result rows by
 * exact restraintId. Result values remain owned by their method-specific payloads.
 */
export function createNonFea3dInvestigationProjection(state = {}) {
  const snapshot = state.snapshot || {};
  const proposal = state.proposal || null;
  const execution = state.execution || null;
  const occurrences = Array.isArray(proposal?.adaptedRequest?.restraintOccurrences)
    ? proposal.adaptedRequest.restraintOccurrences
    : [];
  const blockers = [];
  const occurrenceCounts = countBy(occurrences, (row) => text(row?.restraintId));
  const resultRefs = resultRefsByRestraint(execution);

  const rows = occurrences
    .filter((row) => {
      const restraintId = text(row?.restraintId);
      if (!restraintId) {
        blockers.push(issue(
          'RESTRAINT_ID_REQUIRED',
          'A restraint occurrence without exact restraintId cannot participate in 3D investigation.',
        ));
        return false;
      }
      if ((occurrenceCounts.get(restraintId) || 0) !== 1) {
        blockers.push(issue(
          'RESTRAINT_ID_AMBIGUOUS',
          `Restraint ${restraintId} occurs more than once; no result-to-entity navigation target is selected.`,
          restraintId,
        ));
        return false;
      }
      return true;
    })
    .map((occurrence) => investigationRow(occurrence, resultRefs, blockers))
    .sort((left, right) => ascii(left.restraintId, right.restraintId));

  for (const restraintId of resultRefs.keys()) {
    if (!occurrenceCounts.has(restraintId)) {
      blockers.push(issue(
        'RESULT_RESTRAINT_ID_NOT_BOUND',
        `Result restraint ${restraintId} has no exact current restraint occurrence binding.`,
        restraintId,
      ));
    }
  }

  const orderedBlockers = uniqueIssues(blockers).sort((left, right) => (
    ascii(`${left.code}|${left.restraintId || ''}|${left.message}`, `${right.code}|${right.restraintId || ''}|${right.message}`)
  ));
  const navigableCount = rows.filter((row) => row.navigationEntityId).length;
  const material = {
    schema: NON_FEA_3D_INVESTIGATION_PROJECTION_SCHEMA,
    state: rows.length === 0
      ? orderedBlockers.length ? 'BLOCKED' : 'EMPTY'
      : orderedBlockers.length
        ? 'PARTIALLY_READY'
        : 'READY',
    executionCurrentness: executionCurrentness(snapshot, execution),
    scenarioId: text(proposal?.scenarioId) || null,
    methodId: text(proposal?.method) || text(execution?.method) || null,
    executionId: text(execution?.executionId) || null,
    executionSemanticHash: text(execution?.semanticHash) || null,
    resultSemanticHash: text(execution?.coreResult?.semanticHash) || null,
    rows,
    blockers: orderedBlockers,
    summary: {
      restraintOccurrenceCount: occurrences.length,
      investigationRowCount: rows.length,
      navigableCount,
      resultBoundCount: rows.filter((row) => row.resultRefs.length > 0).length,
      blockerCount: orderedBlockers.length,
    },
    policy: {
      readOnly: true,
      exactIdentityOnly: true,
      coordinateMatchingPermitted: false,
      geometryMutationPermitted: false,
      resultSchemaTranslationPermitted: false,
      resultInterpretationAuthority: false,
      calculationAuthority: false,
      authorizationAuthority: false,
      executionAuthority: false,
    },
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

function investigationRow(occurrence, resultRefs, blockers) {
  const restraintId = text(occurrence.restraintId);
  const target = exactNavigationTarget(occurrence);
  if (!target.entityId) {
    blockers.push(issue(
      target.code,
      target.message,
      restraintId,
    ));
  }
  return deepFreeze({
    supportSiteId: text(occurrence.supportSiteId) || null,
    restraintId,
    navigationEntityId: target.entityId,
    navigationBasis: target.basis,
    sourceDirection: text(occurrence.sourceDirection) || null,
    effectiveDirection: text(occurrence.effectiveDirection) || null,
    resultRefs: deepFreeze([...(resultRefs.get(restraintId) || [])]),
  });
}

function exactNavigationTarget(occurrence) {
  const sourceEntityIds = uniqueText(occurrence?.sourceEntityIds);
  if (sourceEntityIds.length === 1) {
    return { entityId: sourceEntityIds[0], basis: 'EXACT_SOURCE_ENTITY_ID' };
  }
  const hostSourceEntityId = text(occurrence?.hostSourceEntityId);
  if (hostSourceEntityId) {
    return { entityId: hostSourceEntityId, basis: 'EXACT_HOST_SOURCE_ENTITY_ID' };
  }
  const hostEntityId = text(occurrence?.hostEntityId);
  if (hostEntityId) {
    return { entityId: hostEntityId, basis: 'EXACT_HOST_ENTITY_ID' };
  }
  if (sourceEntityIds.length > 1) {
    return {
      entityId: null,
      basis: null,
      code: 'NAVIGATION_ENTITY_ID_AMBIGUOUS',
      message: `Restraint ${text(occurrence?.restraintId) || 'UNKNOWN'} has multiple exact source entity IDs and no explicit host identity.`,
    };
  }
  return {
    entityId: null,
    basis: null,
    code: 'NAVIGATION_ENTITY_ID_REQUIRED',
    message: `Restraint ${text(occurrence?.restraintId) || 'UNKNOWN'} has no exact workspace entity identity for 3D navigation.`,
  };
}

function resultRefsByRestraint(execution) {
  const map = new Map();
  for (const loadCase of execution?.coreResult?.loadCases || []) {
    const loadCaseId = text(loadCase?.loadCaseId);
    for (const result of loadCase?.supportResults || []) {
      const restraintId = text(result?.restraintId);
      if (!restraintId) continue;
      const rows = map.get(restraintId) || [];
      rows.push(deepFreeze({
        loadCaseId: loadCaseId || null,
        loadCaseStatus: text(loadCase?.status) || null,
        contactState: text(result?.contactState) || null,
      }));
      map.set(restraintId, rows);
    }
  }
  for (const [restraintId, rows] of map) {
    map.set(restraintId, deepFreeze(rows.sort((left, right) => (
      ascii(`${left.loadCaseId}|${left.contactState}`, `${right.loadCaseId}|${right.contactState}`)
    ))));
  }
  return map;
}

function executionCurrentness(snapshot, execution) {
  if (!execution) return 'NOT_AVAILABLE';
  if (snapshot?.state === 'EXECUTED_CURRENT') return 'CURRENT';
  if (snapshot?.state === 'EXECUTED_STALE') return 'STALE';
  return 'HISTORICAL_NOT_CURRENT';
}

function countBy(rows, keyFor) {
  const result = new Map();
  rows.forEach((row) => {
    const key = keyFor(row);
    if (key) result.set(key, (result.get(key) || 0) + 1);
  });
  return result;
}

function issue(code, message, restraintId = null) {
  return deepFreeze({ code, message, restraintId });
}

function uniqueIssues(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.code}|${row.restraintId || ''}|${row.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueText(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].sort(ascii);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
