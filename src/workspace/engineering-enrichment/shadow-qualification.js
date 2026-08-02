import { canonicalStringify, canonicalizeJson, semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { assertEngineeringEnrichmentEvidenceLineageGraph } from './evidence-lineage.js';
import { assertEngineeringEnrichmentPortableBundle } from './portable-bundle-validation.js';

export const ENRICHMENT_QUALIFICATION_MANIFEST_SCHEMA = 'EngineeringEnrichmentQualificationManifest.v1';
export const ENRICHMENT_EVIDENCE_INDEX_SCHEMA = 'EngineeringEnrichmentEvidenceIndex.v1';
export const ENRICHMENT_PROPOSAL_HANDOFF_SCHEMA = 'EngineeringEnrichmentProposalHandoff.v1';
export const ENRICHMENT_QUALIFICATION_CHECK_IDS = deepFreeze([
  'CONTRACT_INTEGRITY', 'PORTABLE_BUNDLE_LINEAGE', 'RAW_NUMERICAL_IMPACT',
  'REPRODUCIBILITY_EVIDENCE', 'REVIEW_PACKET_EVIDENCE',
  'SHADOW_CANDIDATE_PROJECTION', 'STALENESS_EVIDENCE',
  'STEP_1_EXACT_RESOLUTION', 'STRUCTURAL_NON_CHANGE_EVIDENCE',
]);
const FALSE_AUTHORITY = Object.freeze([
  'persistenceCreated', 'reviewDecisionCreated', 'approvalGranted', 'bindingCreated',
  'current', 'sealEligible', 'calculationEligible', 'resultAcceptanceEligible',
]);
const CHECK_STATUS = Object.freeze([
  'EVIDENCE_PRESENT', 'EVIDENCE_ABSENT_OPTIONAL',
  'BLOCKED_BY_EXISTING_ARTIFACT_STATUS',
]);

export function buildEnrichmentQualificationManifest(input) {
  exact(input, ['bundle', 'lineageGraph'], 'qualification manifest input');
  const bundle = assertEngineeringEnrichmentPortableBundle(input.bundle);
  const graph = assertEngineeringEnrichmentEvidenceLineageGraph(input.lineageGraph);
  if (graph.bundleHash !== bundle.bundleHash) fail('manifest graph/bundle identity mismatch');
  const a = bundle.artifacts;
  const checks = [
    check('CONTRACT_INTEGRITY', 'EVIDENCE_PRESENT', ['PORTABLE_BUNDLE'], 'CANONICAL_CONTRACT_VALIDATED', [], graph),
    check('PORTABLE_BUNDLE_LINEAGE', 'EVIDENCE_PRESENT', graph.nodes.filter((n) => n.present).map((n) => n.nodeId), graph.status, [], graph),
    check('STEP_1_EXACT_RESOLUTION', a.resolution.summary.status === 'READY_FOR_REVIEW' ? 'EVIDENCE_PRESENT' : 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS', ['STEP_1_RESOLUTION'], a.resolution.summary.status, a.resolution.rows.filter((r) => r.disposition !== 'EXACT_MATCH_PROPOSAL_ONLY').map((r) => ({ code: 'RESOLUTION_ROW_NOT_EXACT', proposalId: r.proposalId, disposition: r.disposition, blockers: r.blockers })), graph),
    check('SHADOW_CANDIDATE_PROJECTION', a.candidateProjection.summary.status === 'READY_FOR_STRUCTURAL_IMPACT' ? 'EVIDENCE_PRESENT' : 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS', ['CANDIDATE_PROJECTION'], a.candidateProjection.summary.status, a.candidateProjection.rows.filter((r) => r.disposition !== 'SHADOW_CANDIDATE_VALUE').map((r) => ({ code: 'CANDIDATE_ROW_NOT_PROJECTED', proposalId: r.proposalId, targetId: r.targetId, disposition: r.disposition, blockers: r.blockers })), graph),
    check('STRUCTURAL_NON_CHANGE_EVIDENCE', 'EVIDENCE_PRESENT', ['STEP_2_STRUCTURAL_IMPACT'], a.structuralImpact.status, a.structuralImpact.blockers, graph),
    check('RAW_NUMERICAL_IMPACT', a.numericalImpact.status === 'RECORDED_SHADOW_RAW_DELTAS' ? 'EVIDENCE_PRESENT' : 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS', ['STEP_3_NUMERICAL_IMPACT'], a.numericalImpact.status, fallback(a.numericalImpact.blockers, a.numericalImpact.status === 'BLOCKED' ? { code: 'NUMERICAL_IMPACT_STATUS_BLOCKED' } : null), graph),
    check('REVIEW_PACKET_EVIDENCE', a.reviewPacket.status === 'READY_FOR_REVIEW_ONLY' ? 'EVIDENCE_PRESENT' : 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS', ['REVIEW_PACKET'], a.reviewPacket.status, fallback(a.reviewPacket.blockers, a.reviewPacket.status === 'BLOCKED' ? { code: 'REVIEW_PACKET_STATUS_BLOCKED' } : null), graph),
    lifecycleCheck('STALENESS_EVIDENCE', 'STALENESS_REPORT', a.stalenessReport, 'UNCHANGED_SHADOW_IDENTITIES', a.stalenessReport?.differences.map((d) => ({ code: 'STALE_SHADOW_IDENTITY_DIFFERENCE', difference: d })) || [], graph),
    lifecycleCheck('REPRODUCIBILITY_EVIDENCE', 'SHADOW_REPRODUCIBILITY_RECEIPT', a.reproducibilityReceipt, 'MATCHED_SHADOW_REPRODUCTION', a.reproducibilityReceipt?.differences.map((d) => ({ code: 'SHADOW_REPRODUCIBILITY_DIFFERENCE', difference: d })) || [], graph),
  ].sort((l, r) => ascii(l.checkId, r.checkId));
  const blocked = checks.filter((c) => c.status === 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS').length;
  const absent = checks.filter((c) => c.status === 'EVIDENCE_ABSENT_OPTIONAL').length;
  const material = {
    schema: ENRICHMENT_QUALIFICATION_MANIFEST_SCHEMA,
    bundleHash: bundle.bundleHash,
    graphHash: graph.graphHash,
    purpose: 'SHADOW_EVIDENCE_INSPECTION_ONLY',
    checks: deepFreeze(checks),
    summary: deepFreeze({ checkCount: checks.length, evidencePresentCount: checks.length - blocked - absent, optionalAbsentEntryCount: absent, blockedEntryCount: blocked, status: 'RECORDED_SHADOW_QUALIFICATION_MANIFEST' }),
    status: 'RECORDED_SHADOW_QUALIFICATION_MANIFEST',
    reviewRequirement: 'NOT_AUTHORIZED',
    productionReadinessJudgement: 'NOT_AUTHORIZED',
    ...falseAuthority(),
  };
  return deepFreeze({ ...material, manifestHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentQualificationManifest(value) {
  exact(value, ['schema', 'bundleHash', 'graphHash', 'purpose', 'checks', 'summary', 'status', 'reviewRequirement', 'productionReadinessJudgement', ...FALSE_AUTHORITY, 'manifestHash'], 'qualification manifest');
  if (value.schema !== ENRICHMENT_QUALIFICATION_MANIFEST_SCHEMA || value.purpose !== 'SHADOW_EVIDENCE_INSPECTION_ONLY' || value.status !== 'RECORDED_SHADOW_QUALIFICATION_MANIFEST' || value.reviewRequirement !== 'NOT_AUTHORIZED' || value.productionReadinessJudgement !== 'NOT_AUTHORIZED') fail('invalid qualification manifest contract');
  text(value.bundleHash, 'bundleHash'); text(value.graphHash, 'graphHash'); assertFalse(value);
  if (!Array.isArray(value.checks)) fail('checks must be an array');
  value.checks.forEach(assertCheck);
  if (canonicalStringify(value.checks.map((c) => c.checkId)) !== canonicalStringify(ENRICHMENT_QUALIFICATION_CHECK_IDS)) fail('qualification check set/order mismatch');
  const blocked = value.checks.filter((c) => c.status === 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS').length;
  const absent = value.checks.filter((c) => c.status === 'EVIDENCE_ABSENT_OPTIONAL').length;
  const summary = { checkCount: value.checks.length, evidencePresentCount: value.checks.length - blocked - absent, optionalAbsentEntryCount: absent, blockedEntryCount: blocked, status: value.status };
  if (canonicalStringify(value.summary) !== canonicalStringify(summary)) fail('qualification summary mismatch');
  verifyHash(value, 'manifestHash'); return value;
}

export function buildEnrichmentEvidenceIndex(input) {
  exact(input, ['bundle', 'lineageGraph', 'qualificationManifest'], 'evidence index input');
  const bundle = assertEngineeringEnrichmentPortableBundle(input.bundle);
  const graph = assertEngineeringEnrichmentEvidenceLineageGraph(input.lineageGraph);
  const manifest = assertEngineeringEnrichmentQualificationManifest(input.qualificationManifest);
  if (graph.bundleHash !== bundle.bundleHash || manifest.bundleHash !== bundle.bundleHash || manifest.graphHash !== graph.graphHash) fail('index identity chain mismatch');
  const a = bundle.artifacts;
  const checksByNode = new Map();
  manifest.checks.forEach((c) => c.sourceNodeIds.forEach((id) => { if (!checksByNode.has(id)) checksByNode.set(id, []); checksByNode.get(id).push(c.checkId); }));
  const byRole = deepFreeze(graph.nodes.map((n) => deepFreeze({ nodeId: n.nodeId, artifactKey: n.artifactKey, present: n.present, optional: n.optional, artifactSchemas: deepFreeze([...n.artifactSchemas]), identityHashes: deepFreeze([...n.identityHashes]), qualificationCheckIds: deepFreeze([...(new Set(checksByNode.get(n.nodeId) || []))].sort(ascii)) })).sort((l, r) => ascii(l.nodeId, r.nodeId)));
  const rr = new Map(a.resolution.rows.map((r) => [r.proposalId, r]));
  const cr = new Map(a.candidateProjection.rows.map((r) => [r.proposalId, r]));
  const byProposal = deepFreeze(a.proposals.map((p) => {
    const r = rr.get(p.proposalId), c = cr.get(p.proposalId);
    if (!r || !c) fail(`missing proposal evidence ${p.proposalId}`);
    return deepFreeze({ proposalId: p.proposalId, proposalHash: p.proposalHash, sourceSnapshotHash: p.sourceSnapshotHash, sourceRowHash: p.sourceRowHash, fieldId: p.fieldId, selector: p.selector, proposalStatus: p.status, resolutionDisposition: r.disposition, targetIds: deepFreeze([...r.targetIds].sort(ascii)), selectedTargetId: r.selectedTargetId, projectionDisposition: c.disposition, projectionTargetId: c.targetId, blockerCodes: deepFreeze(codes([...p.blockers, ...r.blockers, ...c.blockers])) });
  }).sort((l, r) => ascii(l.proposalId, r.proposalId)));
  const targetMap = new Map();
  byProposal.forEach((p) => [...new Set([...p.targetIds, ...(p.projectionTargetId ? [p.projectionTargetId] : [])])].forEach((id) => { if (!targetMap.has(id)) targetMap.set(id, { proposalIds: new Set(), fieldIds: new Set(), resolutionDispositions: new Set(), projectionDispositions: new Set() }); const t = targetMap.get(id); t.proposalIds.add(p.proposalId); t.fieldIds.add(p.fieldId); t.resolutionDispositions.add(p.resolutionDisposition); t.projectionDispositions.add(p.projectionDisposition); }));
  const byTarget = deepFreeze([...targetMap.entries()].map(([targetId, t]) => deepFreeze({ targetId, proposalIds: deepFreeze([...t.proposalIds].sort(ascii)), fieldIds: deepFreeze([...t.fieldIds].sort(ascii)), resolutionDispositions: deepFreeze([...t.resolutionDispositions].sort(ascii)), projectionDispositions: deepFreeze([...t.projectionDispositions].sort(ascii)) })).sort((l, r) => ascii(l.targetId, r.targetId)));
  const byMetric = deepFreeze(a.numericalImpact.deltas.map((d) => deepFreeze({ metricKey: semanticHash({ metricId: d.metricId, scopeId: d.scopeId, loadCaseId: d.loadCaseId }), ...d })).sort((l, r) => ascii(l.metricKey, r.metricKey)));
  const locations = new Map(); const add = (b, loc) => { if (!isPlainRecord(b) || !textOrNull(b.code)) return; if (!locations.has(b.code)) locations.set(b.code, new Set()); locations.get(b.code).add(loc); };
  a.proposals.forEach((p) => p.blockers.forEach((b) => add(b, `proposal:${p.proposalId}`)));
  a.resolution.rows.forEach((r) => r.blockers.forEach((b) => add(b, `resolution:${r.proposalId}`)));
  a.candidateProjection.rows.forEach((r) => r.blockers.forEach((b) => add(b, `candidate:${r.proposalId}`)));
  a.numericalImpact.blockers.forEach((b) => add(b, 'numericalImpact')); a.reviewPacket.blockers.forEach((b) => add(b, 'reviewPacket'));
  manifest.checks.forEach((c) => c.blockers.forEach((b) => add(b, `qualification:${c.checkId}`)));
  const byBlocker = deepFreeze([...locations.entries()].map(([code, loc]) => deepFreeze({ code, locations: deepFreeze([...loc].sort(ascii)) })).sort((l, r) => ascii(l.code, r.code)));
  const byProvenance = deepFreeze(a.proposals.map((p) => deepFreeze({ proposalId: p.proposalId, proposalHash: p.proposalHash, sourceSnapshotHash: p.sourceSnapshotHash, sourceRowHash: p.sourceRowHash, sourceFileName: p.evidence.sourceFileName, sourceSheetName: p.evidence.sourceSheetName, sourceSha256: p.evidence.sourceSha256, sourceRowNumber: p.evidence.sourceRowNumber, sourceRowIndex: p.evidence.sourceRowIndex, policyHash: p.evidence.policyHash })).sort((l, r) => ascii(l.proposalId, r.proposalId)));
  const material = {
    schema: ENRICHMENT_EVIDENCE_INDEX_SCHEMA, bundleHash: bundle.bundleHash, graphHash: graph.graphHash, manifestHash: manifest.manifestHash,
    purpose: 'SHADOW_EVIDENCE_LOOKUP_ONLY', lookupSemantics: 'EXACT_IMMUTABLE_KEYS_ONLY', byRole, byProposal, byTarget, byMetric, byBlocker, byProvenance,
    summary: deepFreeze({ roleCount: byRole.length, proposalCount: byProposal.length, targetCount: byTarget.length, metricCount: byMetric.length, blockerCodeCount: byBlocker.length, provenanceCount: byProvenance.length, status: 'RECORDED_SHADOW_EVIDENCE_INDEX' }),
    status: 'RECORDED_SHADOW_EVIDENCE_INDEX', reviewRequirement: 'NOT_AUTHORIZED', productionReadinessJudgement: 'NOT_AUTHORIZED', ...falseAuthority(),
  };
  return deepFreeze({ ...material, indexHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentEvidenceIndex(value) {
  exact(value, ['schema', 'bundleHash', 'graphHash', 'manifestHash', 'purpose', 'lookupSemantics', 'byRole', 'byProposal', 'byTarget', 'byMetric', 'byBlocker', 'byProvenance', 'summary', 'status', 'reviewRequirement', 'productionReadinessJudgement', ...FALSE_AUTHORITY, 'indexHash'], 'evidence index');
  if (value.schema !== ENRICHMENT_EVIDENCE_INDEX_SCHEMA || value.purpose !== 'SHADOW_EVIDENCE_LOOKUP_ONLY' || value.lookupSemantics !== 'EXACT_IMMUTABLE_KEYS_ONLY' || value.status !== 'RECORDED_SHADOW_EVIDENCE_INDEX' || value.reviewRequirement !== 'NOT_AUTHORIZED' || value.productionReadinessJudgement !== 'NOT_AUTHORIZED') fail('invalid evidence index contract');
  ['bundleHash', 'graphHash', 'manifestHash'].forEach((k) => text(value[k], k)); assertFalse(value);
  sortedRows(value.byRole, 'nodeId'); sortedRows(value.byProposal, 'proposalId'); sortedRows(value.byTarget, 'targetId'); sortedRows(value.byMetric, 'metricKey'); sortedRows(value.byBlocker, 'code'); sortedRows(value.byProvenance, 'proposalId');
  const summary = { roleCount: value.byRole.length, proposalCount: value.byProposal.length, targetCount: value.byTarget.length, metricCount: value.byMetric.length, blockerCodeCount: value.byBlocker.length, provenanceCount: value.byProvenance.length, status: value.status };
  if (canonicalStringify(value.summary) !== canonicalStringify(summary)) fail('index summary mismatch');
  verifyHash(value, 'indexHash'); return value;
}

export function buildEnrichmentProposalHandoff(input) {
  exact(input, ['bundle', 'lineageGraph', 'qualificationManifest', 'evidenceIndex'], 'proposal handoff input');
  const bundle = assertEngineeringEnrichmentPortableBundle(input.bundle);
  const graph = assertEngineeringEnrichmentEvidenceLineageGraph(input.lineageGraph);
  const manifest = assertEngineeringEnrichmentQualificationManifest(input.qualificationManifest);
  const index = assertEngineeringEnrichmentEvidenceIndex(input.evidenceIndex);
  if (graph.bundleHash !== bundle.bundleHash || manifest.bundleHash !== bundle.bundleHash || manifest.graphHash !== graph.graphHash || index.bundleHash !== bundle.bundleHash || index.graphHash !== graph.graphHash || index.manifestHash !== manifest.manifestHash) fail('handoff identity chain mismatch');
  const ip = new Map(index.byProposal.map((p) => [p.proposalId, p])), pv = new Map(index.byProvenance.map((p) => [p.proposalId, p]));
  const evidenceHashes = deepFreeze({ candidateProjectionHash: bundle.artifactHashes.candidateProjectionHash, structuralImpactHash: bundle.artifactHashes.structuralImpactHash, numericalImpactHash: bundle.artifactHashes.numericalImpactHash, reviewPacketHash: bundle.artifactHashes.reviewPacketHash, bundleHash: bundle.bundleHash, graphHash: graph.graphHash, manifestHash: manifest.manifestHash, indexHash: index.indexHash });
  const proposals = deepFreeze(bundle.artifacts.proposals.map((p) => { const i = ip.get(p.proposalId), v = pv.get(p.proposalId); if (!i || !v || i.proposalHash !== p.proposalHash) fail(`handoff proposal index mismatch ${p.proposalId}`); const limitations = [...i.blockerCodes]; if (i.proposalStatus !== 'PROPOSAL_ONLY') limitations.push(`PROPOSAL_STATUS:${i.proposalStatus}`); if (i.resolutionDisposition !== 'EXACT_MATCH_PROPOSAL_ONLY') limitations.push(`RESOLUTION_DISPOSITION:${i.resolutionDisposition}`); if (i.projectionDisposition !== 'SHADOW_CANDIDATE_VALUE') limitations.push(`CANDIDATE_DISPOSITION:${i.projectionDisposition}`); return deepFreeze({ proposalId: p.proposalId, proposalHash: p.proposalHash, fieldId: p.fieldId, selector: p.selector, proposedValue: p.value, unit: p.unit, proposalStatus: p.status, resolutionDisposition: i.resolutionDisposition, resolvedTargetId: i.selectedTargetId, candidateDisposition: i.projectionDisposition, source: deepFreeze({ snapshotHash: v.sourceSnapshotHash, rowHash: v.sourceRowHash, fileName: v.sourceFileName, sheetName: v.sourceSheetName, sha256: v.sourceSha256, rowNumber: v.sourceRowNumber, rowIndex: v.sourceRowIndex, policyHash: v.policyHash }), evidenceHashes, limitations: deepFreeze([...new Set(limitations)].sort(ascii)) }); }).sort((l, r) => ascii(l.proposalId, r.proposalId)));
  const blocked = proposals.filter((p) => p.limitations.length).length;
  const material = {
    schema: ENRICHMENT_PROPOSAL_HANDOFF_SCHEMA, purpose: 'EXTERNAL_GOVERNANCE_INPUT_ONLY', bundleHash: bundle.bundleHash, graphHash: graph.graphHash, manifestHash: manifest.manifestHash, indexHash: index.indexHash, proposals,
    summary: deepFreeze({ proposalCount: proposals.length, exactResolvedCount: proposals.filter((p) => p.resolutionDisposition === 'EXACT_MATCH_PROPOSAL_ONLY').length, shadowProjectedCount: proposals.filter((p) => p.candidateDisposition === 'SHADOW_CANDIDATE_VALUE').length, blockedProposalCount: blocked, status: 'RECORDED_SHADOW_PROPOSAL_HANDOFF' }),
    status: 'RECORDED_SHADOW_PROPOSAL_HANDOFF', approvalOwner: 'EXTERNAL_TO_PR_371', applicabilityOwner: 'EXTERNAL_TO_PR_371', candidateBindingOwner: 'EXTERNAL_TO_PR_371', derivationPolicyOwner: 'EXTERNAL_TO_PR_371', solverAuthorizationOwner: 'EXTERNAL_TO_PR_371', reviewRequirement: 'NOT_AUTHORIZED', productionReadinessJudgement: 'NOT_AUTHORIZED', ...falseAuthority(),
  };
  return deepFreeze({ ...material, handoffHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentProposalHandoff(value) {
  exact(value, ['schema', 'purpose', 'bundleHash', 'graphHash', 'manifestHash', 'indexHash', 'proposals', 'summary', 'status', 'approvalOwner', 'applicabilityOwner', 'candidateBindingOwner', 'derivationPolicyOwner', 'solverAuthorizationOwner', 'reviewRequirement', 'productionReadinessJudgement', ...FALSE_AUTHORITY, 'handoffHash'], 'proposal handoff');
  if (value.schema !== ENRICHMENT_PROPOSAL_HANDOFF_SCHEMA || value.purpose !== 'EXTERNAL_GOVERNANCE_INPUT_ONLY' || value.status !== 'RECORDED_SHADOW_PROPOSAL_HANDOFF' || value.reviewRequirement !== 'NOT_AUTHORIZED' || value.productionReadinessJudgement !== 'NOT_AUTHORIZED') fail('invalid proposal handoff contract');
  ['bundleHash', 'graphHash', 'manifestHash', 'indexHash'].forEach((k) => text(value[k], k));
  ['approvalOwner', 'applicabilityOwner', 'candidateBindingOwner', 'derivationPolicyOwner', 'solverAuthorizationOwner'].forEach((k) => { if (value[k] !== 'EXTERNAL_TO_PR_371') fail(`${k} must remain external`); });
  assertFalse(value); sortedRows(value.proposals, 'proposalId'); if (!value.proposals.length) fail('handoff proposals required');
  const summary = { proposalCount: value.proposals.length, exactResolvedCount: value.proposals.filter((p) => p.resolutionDisposition === 'EXACT_MATCH_PROPOSAL_ONLY').length, shadowProjectedCount: value.proposals.filter((p) => p.candidateDisposition === 'SHADOW_CANDIDATE_VALUE').length, blockedProposalCount: value.proposals.filter((p) => Array.isArray(p.limitations) && p.limitations.length).length, status: value.status };
  if (canonicalStringify(value.summary) !== canonicalStringify(summary)) fail('handoff summary mismatch'); verifyHash(value, 'handoffHash'); return value;
}

function lifecycleCheck(id, node, artifact, good, blockers, graph) {
  if (artifact === null) return check(id, 'EVIDENCE_ABSENT_OPTIONAL', [node], 'NOT_PRESENT_OPTIONAL', [], graph);
  return check(id, artifact.status === good ? 'EVIDENCE_PRESENT' : 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS', [node], artifact.status, artifact.status === good ? [] : fallback(blockers, { code: artifact.status }), graph);
}
function check(checkId, status, sourceNodeIds, observedArtifactStatus, blockers, graph) {
  if (!CHECK_STATUS.includes(status)) fail(`invalid check status ${status}`);
  const ids = unique(sourceNodeIds); const map = new Map(graph.nodes.map((n) => [n.nodeId, n])); const hashes = [];
  ids.forEach((id) => { const node = map.get(id); if (!node) fail(`unknown lineage node ${id}`); if (status !== 'EVIDENCE_ABSENT_OPTIONAL' && !node.present) fail(`absent lineage node ${id}`); hashes.push(...node.identityHashes); });
  const normalized = normalizeBlockers(blockers);
  if ((status === 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS') !== (normalized.length > 0)) fail(`check ${checkId} blocker/status mismatch`);
  return deepFreeze({ checkId, status, sourceNodeIds: ids, sourceArtifactHashes: deepFreeze([...new Set(hashes)].sort(ascii)), observedArtifactStatus: text(observedArtifactStatus, 'observedArtifactStatus'), blockers: normalized });
}
function assertCheck(c) {
  exact(c, ['checkId', 'status', 'sourceNodeIds', 'sourceArtifactHashes', 'observedArtifactStatus', 'blockers'], 'qualification check');
  if (!ENRICHMENT_QUALIFICATION_CHECK_IDS.includes(c.checkId) || !CHECK_STATUS.includes(c.status)) fail('invalid qualification check');
  unique(c.sourceNodeIds); if (c.status !== 'EVIDENCE_ABSENT_OPTIONAL' && !c.sourceArtifactHashes.length) fail('present check requires source hashes'); unique(c.sourceArtifactHashes, false); text(c.observedArtifactStatus, 'observedArtifactStatus'); if (!Array.isArray(c.blockers) || ((c.status === 'BLOCKED_BY_EXISTING_ARTIFACT_STATUS') !== (c.blockers.length > 0))) fail('qualification check blocker/status mismatch');
}
function falseAuthority() { return Object.fromEntries(FALSE_AUTHORITY.map((k) => [k, false])); }
function assertFalse(v) { FALSE_AUTHORITY.forEach((k) => { if (v[k] !== false) fail(`${k} must remain false`); }); }
function verifyHash(v, field) { const material = { ...v }; delete material[field]; if (v[field] !== semanticHash(material)) fail(`${field} is invalid`); }
function fallback(rows, row) { const out = Array.isArray(rows) ? [...rows] : []; if (!out.length && row) out.push(row); return out; }
function normalizeBlockers(rows) { if (!Array.isArray(rows)) fail('blockers must be an array'); return deepFreeze(rows.map((r) => deepFreeze(canonicalizeJson(r))).sort((l, r) => ascii(semanticHash(l), semanticHash(r)) || ascii(canonicalStringify(l), canonicalStringify(r)))); }
function codes(rows) { return [...new Set(rows.filter((r) => isPlainRecord(r) && textOrNull(r.code)).map((r) => r.code))].sort(ascii); }
function sortedRows(rows, key) { if (!Array.isArray(rows)) fail(`${key} index must be an array`); const values = rows.map((r) => text(r?.[key], key)); if (canonicalStringify(values) !== canonicalStringify([...new Set(values)].sort(ascii))) fail(`${key} index must be sorted and unique`); }
function unique(rows, requireNonEmpty = true) { if (!Array.isArray(rows) || (requireNonEmpty && !rows.length)) fail('sorted unique array required'); const values = rows.map((r) => text(r, 'array value')); const sorted = [...new Set(values)].sort(ascii); if (canonicalStringify(values) !== canonicalStringify(sorted)) fail('array must be sorted and unique'); return deepFreeze(sorted); }
function exact(v, keys, label) { if (!isPlainRecord(v) || canonicalStringify(Object.keys(v).sort(ascii)) !== canonicalStringify([...keys].sort(ascii))) fail(`${label} keys mismatch`); }
function text(v, label) { const t = String(v ?? '').trim(); if (!t) fail(`${label} required`); return t; }
function textOrNull(v) { return typeof v === 'string' && v.length ? v : null; }
function ascii(l, r) { return l < r ? -1 : l > r ? 1 : 0; }
function fail(message, Constructor = TypeError) { throw new Constructor(`EngineeringEnrichmentShadowQualification: ${message}`); }
