/** Explicit visual policy and source-evidence normalization for Wave 2. */
import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import { integerAtLeast, positiveNumber } from './topology-edit-geometry-math.js';

export const TOPOLOGY_EDIT_VISUAL_POLICY = 'TopologyEditVisualPolicy.v1';

export const DEFAULT_TOPOLOGY_VISUAL_POLICY = deepFreeze({
  schema: TOPOLOGY_EDIT_VISUAL_POLICY,
  chordErrorMm: 1,
  minimumArcSegments: 6,
  maximumArcSegments: 256,
  diagnosticRadiusMm: 2,
  radialSegments: 16,
  modelRole: 'DRAFT',
});

export function normalizeTopologyVisualPolicy(policy = {}) {
  const merged = { ...DEFAULT_TOPOLOGY_VISUAL_POLICY, ...policy };
  const minimumArcSegments = integerAtLeast(merged.minimumArcSegments, 3);
  const maximumArcSegments = Math.max(
    minimumArcSegments,
    integerAtLeast(merged.maximumArcSegments, minimumArcSegments),
  );
  const material = {
    schema: TOPOLOGY_EDIT_VISUAL_POLICY,
    chordErrorMm: positiveNumber(merged.chordErrorMm) ?? 1,
    minimumArcSegments,
    maximumArcSegments,
    diagnosticRadiusMm: positiveNumber(merged.diagnosticRadiusMm) ?? 2,
    radialSegments: integerAtLeast(merged.radialSegments, 8),
    modelRole: stringValue(merged.modelRole || 'DRAFT').toUpperCase(),
  };
  return deepFreeze({ ...material, policyHash: semanticHash(material) });
}

export function visualPolicySummary(policy = DEFAULT_TOPOLOGY_VISUAL_POLICY) {
  const normalized = normalizeTopologyVisualPolicy(policy);
  return `Visual policy: ${normalized.chordErrorMm} mm chord error, ${normalized.radialSegments} radial segments, diagnostic radius ${normalized.diagnosticRadiusMm} mm.`;
}

export function componentEvidence(source, canonicalId, componentKey) {
  if (source instanceof Map) return source.get(canonicalId) || source.get(componentKey) || {};
  return source?.[canonicalId] || source?.[componentKey] || {};
}

export function canonicalType(value) {
  const token = stringValue(value).toUpperCase().replace(/[\s/-]+/g, '_');
  return ({
    BEND: 'ELBOW',
    ELBO: 'ELBOW',
    REDUCING_TEE: 'TEE',
    WELDOLET: 'OLET',
    SOCKOLET: 'OLET',
    INST: 'INSTRUMENT',
  })[token] || token;
}

export function sourcePaths(entity = {}, evidence = {}) {
  return [...new Set([
    entity.sourcePath,
    ...(entity.sourcePaths || []),
    evidence.sourcePath,
    ...(evidence.sourcePaths || []),
  ].map(stringValue).filter(Boolean))].sort();
}

export function workspaceEntityIds(entity = {}, evidence = {}) {
  return [...new Set([
    entity.componentKey,
    entity.entityId,
    ...(evidence.workspaceEntityIds || []),
  ].map(stringValue).filter(Boolean))].sort();
}

export function authoritativeCanonicalDiameter(edge = {}) {
  return edge.diameterAuthority === 'OUTSIDE_DIAMETER' ? edge.diameterMm : undefined;
}
