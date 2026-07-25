/**
 * Functionality: exports calculation workspace geometry plus diagnostic-rich
 * LOADMARKER nodes as managed stagedJson. Parameters: workspace, distribution,
 * and source name. Outputs: stagedJson hierarchy without coordinate changes.
 * Fallback: missing values remain null and diagnostics remain attached.
 */

import { readObjectEndpoints, stringValue, workspaceObjects, workspaceSupports } from '../../workspaceModel.js';

export function buildEngineeringLoadMarkerStageJson(workspace, distribution, sourceName) {
  const source = stringValue(sourceName || workspace?.packageMeta?.source?.sourceFileName || 'workspace');
  const geometry = uniqueObjects([...workspaceObjects(workspace), ...workspaceSupports(workspace)]).map(stageObject).filter(Boolean);
  const markers = (distribution?.supports || []).filter((support) => support.position).map((support) => markerNode(support, distribution));
  return [{
    name: `SUPPORT-LOADS ${source}`,
    type: 'BRANCH',
    attributes: {
      NAME: `SUPPORT-LOADS ${source}`,
      SCHEMA: 'support-load-distribution/v2',
      METHOD: distribution?.method || null,
      METHOD_LABEL: distribution?.methodLabel || null,
      TOTAL_WEIGHT_OPE_KG: distribution?.totals?.totalWeightOpeKg ?? null,
      TOTAL_WEIGHT_HYD_KG: distribution?.totals?.totalWeightHydKg ?? null,
      DISTRIBUTED_WEIGHT_OPE_KG: distribution?.totals?.distributedWeightOpeKg ?? null,
      DISTRIBUTED_WEIGHT_HYD_KG: distribution?.totals?.distributedWeightHydKg ?? null,
      COG_OPE: distribution?.totals?.cogOpe || null,
      COG_HYD: distribution?.totals?.cogHyd || null,
    },
    diagnostics: [...(distribution?.diagnostics || [])],
    children: [...geometry, ...markers],
  }];
}

function stageObject(object) {
  const endpoints = readObjectEndpoints(object);
  if (!endpoints.start && !endpoints.center) return null;
  const source = { ...(object?.attributes || {}), ...(object?.sourceAttributes || {}) };
  const attributes = { ...source };
  if (endpoints.start) attributes.APOS = point(endpoints.start);
  if (endpoints.end) attributes.LPOS = point(endpoints.end);
  if (!endpoints.start && endpoints.center) attributes.POS = point(endpoints.center);
  return {
    id: stringValue(object?.id), name: stringValue(object?.name || object?.id || 'ELEMENT'),
    type: stringValue(object?.type || 'OBJECT'), attributes,
    ...(object?.enrichedAttributes ? { enrichedAttributes: object.enrichedAttributes } : {}),
    diagnostics: uniqueDiagnostics([...(object?.diagnostics || []), ...(object?.enrichedAttributes?.diagnostics || [])]),
  };
}

function markerNode(support, distribution) {
  const diagnostics = supportDiagnostics(support, distribution);
  return {
    id: `LOAD-${support.supportId}`,
    name: `LOAD ${support.name}`,
    type: 'LOADMARKER',
    attributes: {
      POS: point(support.position), MARKER: 'SUPPORT_VERTICAL_LOAD', SUPPORT_NAME: support.name,
      SUPPORT_ID: support.supportId, SUPPORT_TYPE: support.supportType,
      VERTICAL_LOAD_OPE_KG: support.verticalLoadOpeKg ?? null, VERTICAL_LOAD_OPE_N: support.verticalLoadOpeN ?? null,
      VERTICAL_LOAD_HYD_KG: support.verticalLoadHydKg ?? null, VERTICAL_LOAD_HYD_N: support.verticalLoadHydN ?? null,
      CONTRIBUTING_ELEMENTS: support.contributions.map((row) => row.elementId),
      CONTRIBUTION_COUNT: support.contributionCount,
      METHOD: distribution.method, METHOD_LABEL: distribution.methodLabel,
      EVALUATED_AT: distribution.evaluatedAt,
      LOAD_STATUS: diagnostics.some((row) => row.severity === 'BLOCKED') ? 'PARTIAL' : 'OK',
      FALLBACK_USED: false,
      AUDIT_SUMMARY: { contributionCount: support.contributionCount, diagnosticCount: diagnostics.length },
    },
    diagnostics,
  };
}

function supportDiagnostics(support, distribution) {
  const elementIds = new Set((support.contributions || []).map((row) => row.elementId));
  return [...(support.diagnostics || []), ...(distribution?.diagnostics || []).filter((row) => row?.context?.supportId === support.supportId || elementIds.has(row?.context?.elementId))];
}

function uniqueObjects(objects) {
  const rows = new Map();
  objects.forEach((object, index) => rows.set(stringValue(object?.id || object?.name || `object-${index}`), object));
  return [...rows.values()];
}

function uniqueDiagnostics(diagnostics) {
  return [...new Map(diagnostics.map((row) => [row?.id || JSON.stringify(row), row])).values()];
}

function point(value) {
  return { x: value.x, y: value.y, z: value.z };
}
