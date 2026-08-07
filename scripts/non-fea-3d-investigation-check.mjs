import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createNonFea3dInvestigationProjection,
  NON_FEA_3D_INVESTIGATION_PROJECTION_SCHEMA,
} from '../src/workspace/engineering-loads/non-fea-3d-investigation-projection.js';

const currentState = {
  snapshot: { state: 'EXECUTED_CURRENT' },
  proposal: {
    scenarioId: 'SCENARIO:3D',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    adaptedRequest: {
      restraintOccurrences: [{
        supportSiteId: 'SITE:1',
        restraintId: 'R:1',
        sourceEntityIds: ['SUPPORT:100'],
        hostSourceEntityId: 'PIPE:100',
        hostEntityId: 'PIPE:100',
        sourceDirection: 'ANC',
        effectiveDirection: 'ANC',
      }],
    },
  },
  execution: {
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    executionId: 'EXEC:3D',
    semanticHash: 'fnv1a64:1111111111111111',
    coreResult: {
      semanticHash: 'fnv1a64:2222222222222222',
      loadCases: [{
        loadCaseId: 'W-COLD',
        status: 'CALCULATED',
        supportResults: [{
          supportSiteId: 'SITE:1',
          restraintId: 'R:1',
          contactState: 'ENGAGED',
          globalReaction: {
            forceN: { x: 1, y: 2, z: 3 },
            momentNm: { x: 4, y: 5, z: 6 },
          },
        }],
      }],
    },
  },
};

const original = structuredClone(currentState);
const projection = createNonFea3dInvestigationProjection(currentState);
const repeat = createNonFea3dInvestigationProjection(currentState);
assert.equal(projection.schema, NON_FEA_3D_INVESTIGATION_PROJECTION_SCHEMA);
assert.equal(projection.state, 'READY');
assert.equal(projection.executionCurrentness, 'CURRENT');
assert.equal(projection.semanticHash, repeat.semanticHash, 'projection must be deterministic');
assert.deepEqual(currentState, original, 'investigation projection must not mutate method/source state');
assert.equal(projection.rows.length, 1);
assert.equal(projection.rows[0].navigationEntityId, 'SUPPORT:100');
assert.equal(projection.rows[0].navigationBasis, 'EXACT_SOURCE_ENTITY_ID');
assert.deepEqual(projection.rows[0].resultRefs, [{
  loadCaseId: 'W-COLD',
  loadCaseStatus: 'CALCULATED',
  contactState: 'ENGAGED',
}]);
assert.equal(projection.policy.readOnly, true);
assert.equal(projection.policy.exactIdentityOnly, true);
assert.equal(projection.policy.coordinateMatchingPermitted, false);
assert.equal(projection.policy.geometryMutationPermitted, false);
assert.equal(projection.policy.resultSchemaTranslationPermitted, false);
assert.equal(projection.policy.resultInterpretationAuthority, false);
assert.equal(projection.policy.calculationAuthority, false);
assert.equal(projection.policy.authorizationAuthority, false);
assert.equal(projection.policy.executionAuthority, false);

const stale = createNonFea3dInvestigationProjection({
  ...currentState,
  snapshot: { state: 'EXECUTED_STALE' },
});
assert.equal(stale.executionCurrentness, 'STALE');
assert.equal(stale.rows[0].resultRefs.length, 1, 'historical results remain inspectable evidence');

const ambiguous = createNonFea3dInvestigationProjection({
  snapshot: { state: 'DRAFT_READY' },
  proposal: {
    scenarioId: 'SCENARIO:AMBIGUOUS',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    adaptedRequest: {
      restraintOccurrences: [{
        supportSiteId: 'SITE:2',
        restraintId: 'R:2',
        sourceEntityIds: ['SUPPORT:A', 'SUPPORT:B'],
      }],
    },
  },
});
assert.equal(ambiguous.state, 'PARTIALLY_READY');
assert.equal(ambiguous.rows[0].navigationEntityId, null);
assert(ambiguous.blockers.some((row) => row.code === 'NAVIGATION_ENTITY_ID_AMBIGUOUS'));

const duplicate = createNonFea3dInvestigationProjection({
  snapshot: { state: 'DRAFT_READY' },
  proposal: {
    scenarioId: 'SCENARIO:DUPLICATE',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    adaptedRequest: {
      restraintOccurrences: [
        { supportSiteId: 'SITE:A', restraintId: 'R:DUP', sourceEntityIds: ['SUPPORT:A'] },
        { supportSiteId: 'SITE:B', restraintId: 'R:DUP', sourceEntityIds: ['SUPPORT:B'] },
      ],
    },
  },
});
assert.equal(duplicate.state, 'BLOCKED', 'all-blocked identity must not be reported as merely empty');
assert.equal(duplicate.rows.length, 0, 'duplicate restraint identity must not choose a 3D target');
assert(duplicate.blockers.some((row) => row.code === 'RESTRAINT_ID_AMBIGUOUS'));

const projectionSource = readFileSync(
  new URL('../src/workspace/engineering-loads/non-fea-3d-investigation-projection.js', import.meta.url),
  'utf8',
);
const scenarioViewSource = readFileSync(
  new URL('../src/workspace/engineering-loads/empirical-load-calc-scenario-view.js', import.meta.url),
  'utf8',
);
const loadCalcControllerSource = readFileSync(
  new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url),
  'utf8',
);
const shared3dSource = readFileSync(
  new URL('../src/workspace/topology-edit-3d-search-controller.js', import.meta.url),
  'utf8',
);
const focusWorkspaceEntitySource = shared3dSource.match(
  /focusWorkspaceEntity\(entityIdInput\) \{([\s\S]*?)\n  \}\n\n  activateSearchResult/u,
)?.[0];

assert.doesNotMatch(projectionSource, /Math\.hypot|distanceTo|nearest|proximity|coordinateFrame|globalReaction/,
  '3D investigation identity must not be derived from geometry or result vectors');
assert.doesNotMatch(projectionSource, /(linear-fea|lafea|lfea|shell|continuum|solver)/i,
  '3D investigation projection must not import or invoke FEA/solver authority');
assert.match(scenarioViewSource, /data-non-fea-investigation-entity-id/);
assert.match(scenarioViewSource, /Result values remain method-owned/);
assert.match(scenarioViewSource, /is not engineering, calculation or result authority/);
assert.match(loadCalcControllerSource, /pending3dInvestigationEntityId/);
assert.match(loadCalcControllerSource, /focusWorkspaceEntity/);
assert.ok(focusWorkspaceEntitySource, 'shared 3D exact workspace focus function must be present');
assert.match(focusWorkspaceEntitySource, /canonicalIdsForWorkspaceEntity/);
assert.match(focusWorkspaceEntitySource, /'inspector'/);
assert.doesNotMatch(
  focusWorkspaceEntitySource,
  /nearest|proximity|distanceTo|Math\.hypot|coordinates|worldPosition/i,
  'shared 3D external focus must use the existing exact identity crosswalk only',
);

console.log('non-fea-3d-investigation-check: PASS');
