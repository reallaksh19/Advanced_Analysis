import { codePointCompare, deepFreeze, semanticHash } from './enriched-staged-json-qualification-helpers.mjs';
import { FIELD_SCHEMA, TARGET_RECORD_SCHEMA, stableTargetId, vector } from './enriched-staged-json-fixture-schema.mjs';

const COMPONENT_TYPES = Object.freeze(['PIPE', 'ELBOW', 'TEE', 'VALVE', 'FLANGE']);

export function buildBranch(manifest, ordinal) {
  const targetId = stableTargetId(manifest.seed, 'BRANCH', ordinal);
  const lineKey = `Q405-${manifest.seed}-${String(ordinal).padStart(5, '0')}`;
  const node = {
    type: 'BRANCH', id: `BRANCH:${manifest.seed}:${ordinal}`, targetId,
    name: `/QUALIFICATION/${manifest.name}/BRANCH-${String(ordinal).padStart(5, '0')}`,
    APOS: vector(manifest.seed, ordinal, 10), LPOS: vector(manifest.seed, ordinal, 11),
    POS: vector(manifest.seed, ordinal, 12), CENTER: vector(manifest.seed, ordinal, 13),
    attributes: { lineKey, service: `SERVICE-${ordinal % 11}`, pipingClass: `PC-${ordinal % 7}`, originalMarker: `BRANCH-ATTRIBUTE-${ordinal}` },
    references: { model: `MODEL:${manifest.seed}`, upstream: ordinal === 0 ? null : `BRANCH:${manifest.seed}:${ordinal - 1}` },
    children: [],
  };
  return { node, record: buildTargetRecord(targetId, 'LINE', node.id, lineKey, ordinal) };
}

export function buildComponent(manifest, branchOrdinal, localOrdinal, globalOrdinal, parentTargetId, lineKey) {
  const targetId = stableTargetId(manifest.seed, 'COMPONENT', globalOrdinal);
  const type = COMPONENT_TYPES[globalOrdinal % COMPONENT_TYPES.length];
  const node = {
    type, id: `COMPONENT:${manifest.seed}:${globalOrdinal}`, targetId, parentTargetId,
    name: `${type}-${String(globalOrdinal).padStart(7, '0')}`,
    APOS: vector(manifest.seed, globalOrdinal, 20), LPOS: vector(manifest.seed, globalOrdinal, 21),
    POS: vector(manifest.seed, globalOrdinal, 22), CENTER: vector(manifest.seed, globalOrdinal, 23),
    attributes: { catalogKey: `CAT-${type}-${globalOrdinal % 37}`, sequence: localOrdinal, branchOrdinal, originalMarker: `COMPONENT-ATTRIBUTE-${globalOrdinal}` },
    references: { parentTargetId, predecessor: localOrdinal === 0 ? null : `COMPONENT:${manifest.seed}:${globalOrdinal - 1}` },
    children: [],
  };
  return { node, record: buildTargetRecord(targetId, 'COMPONENT', node.id, lineKey, globalOrdinal) };
}

export function buildTargetRecord(targetId, targetKind, sourceRecordId, lineKey, ordinal) {
  const fields = [
    resolvedField('process.designPressureKpaG', 800 + (ordinal % 17) * 25, 'kPa(g)', ordinal),
    resolvedField('piping.wallThicknessMm', 4.5 + (ordinal % 9) * 0.5, 'mm', ordinal + 1),
    blockedField('material.densityKgM3', ordinal % 13 === 0 ? 'BLOCKED_MISSING' : 'BLOCKED_STALE_SOURCE', ordinal),
  ].sort((a, b) => codePointCompare(a.field, b.field));
  const recordDraft = { schema: TARGET_RECORD_SCHEMA, targetId, targetKind, sourceRecordId, lineKey, fields, statusSummary: summarizeStatuses(fields) };
  return deepFreeze({ ...recordDraft, semanticHash: semanticHash(recordDraft) });
}

function resolvedField(field, value, unit, ordinal) {
  return { schema: FIELD_SCHEMA, field, value, unit, status: 'RESOLVED_EXACT', sourceKind: 'MODEL', sourceKey: 'syntheticModel',
    sourceHash: `sha256:${String(ordinal).padStart(64, '0').slice(-64)}`, locator: `synthetic:${ordinal}:${field}`,
    matchMethod: 'EXACT_TARGET_ID', confidence: 1, policyId: null, policyHash: null, reviewEventId: null, approved: true, diagnostics: [] };
}

function blockedField(field, status, ordinal) {
  const missing = status === 'BLOCKED_MISSING';
  return { schema: FIELD_SCHEMA, field, value: null, unit: 'kg/m3', status,
    sourceKind: missing ? 'NONE' : 'MATERIAL_REGISTER', sourceKey: missing ? null : 'syntheticMaterialRegister',
    sourceHash: missing ? null : `sha256:${String(ordinal + 9000).padStart(64, '0').slice(-64)}`,
    locator: missing ? null : `material:${ordinal}`, matchMethod: missing ? 'NONE' : 'EXACT_TARGET_ID',
    confidence: 0, policyId: null, policyHash: null, reviewEventId: null, approved: false, diagnostics: [status] };
}

function summarizeStatuses(fields) {
  const counts = {};
  for (const field of fields) counts[field.status] = (counts[field.status] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => codePointCompare(a, b)));
}
