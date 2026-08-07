#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const REPORT_DIR = fileURLToPath(new URL('../reports', import.meta.url));
const SOURCE_AUDIT_PATH = `${REPORT_DIR}/m037-bm4-source-level-ope-audit.json`;
const OUTPUT_PATH = `${REPORT_DIR}/m037-bm4-bend-station-semantics.json`;
const CATEGORY = 'BEND_STATION_OR_SOURCE_SEMANTICS_CANDIDATE';
const FORCE_FAMILIES = new Set(['globalForce', 'localForce']);
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function pairKey(segment) {
  return `${segment.startNodeId}-${segment.endNodeId}`;
}

function touchedNodes(row) {
  return row.family === 'displacement' || row.family === 'restraint'
    ? [String(row.identifier)]
    : String(row.identifier).split('-').map(String);
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

const sourceAudit = JSON.parse(readFileSync(SOURCE_AUDIT_PATH, 'utf8'));
const solved = solveBm4M035M036Combined();
const candidates = sourceAudit.auditedPreviouslyUnexplainedOpeRows.filter((row) => row.sourceCandidate === CATEGORY);
assert.equal(candidates.length, 52, 'BM4 exact-head bend/station candidate inventory drifted.');

const baseEntries = solved.authorities.base.entries;
const analysisEntries = solved.authorities.entries;
const sourceEntryByPair = new Map(baseEntries.map((entry) => [pairKey(entry.sourceSegment), entry]));
const bendEntries = baseEntries.filter((entry) => entry.sourceSegment.type === 'BEND');
const bendPairKeys = new Set(bendEntries.map((entry) => pairKey(entry.sourceSegment)));
const bendEndpointNodes = new Set(bendEntries.flatMap((entry) => [
  String(entry.sourceSegment.startNodeId),
  String(entry.sourceSegment.endNodeId),
]));
const descendantCountBySourceId = new Map();
for (const entry of analysisEntries) {
  const key = String(entry.sourceSegmentId);
  descendantCountBySourceId.set(key, (descendantCountBySourceId.get(key) ?? 0) + 1);
}

function classify(row) {
  const nodes = touchedNodes(row);
  const sourceEntry = FORCE_FAMILIES.has(row.family) ? sourceEntryByPair.get(String(row.identifier)) : null;
  const exactBendPair = FORCE_FAMILIES.has(row.family) && bendPairKeys.has(String(row.identifier));
  const onBendEndpoint = nodes.some((node) => bendEndpointNodes.has(node));
  if (exactBendPair) return 'DIRECT_EXPANDED_BEND_SOURCE_ENDPOINT_RESULT';
  if (row.family === 'displacement' && onBendEndpoint) return 'BEND_ENDPOINT_NODE_DISPLACEMENT';
  if (FORCE_FAMILIES.has(row.family) && sourceEntry && sourceEntry.sourceSegment.type !== 'BEND') {
    return onBendEndpoint ? 'ADJACENT_NON_BEND_SOURCE_RESULT' : 'NEARBY_NON_BEND_SOURCE_RESULT';
  }
  return onBendEndpoint ? 'BEND_ENDPOINT_OTHER_RESULT' : 'BEND_ADJACENT_NODE_RESPONSE';
}

const auditedRows = candidates.map((row) => {
  const sourceEntry = FORCE_FAMILIES.has(row.family) ? sourceEntryByPair.get(String(row.identifier)) : null;
  const directBend = sourceEntry?.sourceSegment.type === 'BEND';
  const sourceId = sourceEntry ? String(sourceEntry.sourceSegment.id) : null;
  return Object.freeze({
    family: row.family,
    identifier: row.identifier,
    end: row.end,
    field: row.field,
    ours: row.ours,
    cii: row.cii,
    percentDifference: row.percentDifference,
    bendDistanceEdges: row.sourceEvidence?.bendDistanceEdges ?? null,
    sourceSegmentId: sourceId,
    sourceSegmentType: sourceEntry?.sourceSegment.type ?? null,
    sourceDescendantCount: sourceId ? (descendantCountBySourceId.get(sourceId) ?? 0) : null,
    exactSourceEndpointPair: Boolean(sourceEntry),
    directExpandedBend: Boolean(directBend && (descendantCountBySourceId.get(sourceId) ?? 0) > 1),
    classification: classify(row),
  });
}).sort((a, b) => lexical(`${a.classification}|${a.identifier}|${a.end ?? ''}|${a.field}`, `${b.classification}|${b.identifier}|${b.end ?? ''}|${b.field}`));

const directBendRows = auditedRows.filter((row) => row.classification === 'DIRECT_EXPANDED_BEND_SOURCE_ENDPOINT_RESULT');
const exactNonBendRows = auditedRows.filter((row) => (
  row.classification === 'ADJACENT_NON_BEND_SOURCE_RESULT'
  || row.classification === 'NEARBY_NON_BEND_SOURCE_RESULT'
));

const report = Object.freeze({
  schema: 'm037-bm4-bend-station-semantics/v1',
  mechanicsChanged: false,
  scope: Object.freeze({
    candidateRows: candidates.length,
    retainedSourceBends: bendEntries.length,
    directExpandedBendEndpointRows: directBendRows.length,
    exactNonBendSourceRowsNearBends: exactNonBendRows.length,
  }),
  method: Object.freeze({
    statement: 'Refine the broad bend/station candidate bucket using retained source segment identity and M035 bend descendant mapping.',
    endpointRule: 'A matched CAESAR pair equal to a retained source bend pair is compared against the first/last analysis descendants, i.e. the retained source I/J endpoints; no internal station value is invented.',
    adjacentRule: 'Rows on retained non-bend source pairs remain exact source-pair comparisons even when topologically near a bend.',
    interpretation: 'Proximity to an expanded bend is not itself evidence for a station remap. Any station transform requires independent CAESAR source/result-location authority.',
    policy: 'DO_NOT_REMAP_BEND_ROWS_OR_CHANGE_QUALIFIED_BEND_MECHANICS_FROM BENCHMARK_ERROR ALONE.',
  }),
  classificationCounts: Object.freeze(countBy(auditedRows, (row) => row.classification)),
  directBendPairCounts: Object.freeze(countBy(directBendRows, (row) => row.identifier)),
  auditedRows: Object.freeze(auditedRows),
});

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  scope: report.scope,
  classificationCounts: report.classificationCounts,
  directBendPairCounts: report.directBendPairCounts,
}, null, 2));
console.log(`M037 bend station-semantics audit PASS; evidence written to ${OUTPUT_PATH}`);
