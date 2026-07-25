import {
  isEngineeringSupport,
  resolveEngineeringElement,
  resolveEngineeringSupport,
} from '../calc-workspace/engineering-loads/resolvers/resolveEngineeringElement.js';
import { workspaceObjects, workspaceSupports } from '../calc-workspace/workspaceModel.js';
import { buildCalculationWorkspaceBridge } from './calculation-workspace-bridge.js';
import { freezeDeep, stringValue } from './dataset-utils.js';

export const MODEL_SUPPORT_LOAD_READINESS_SCHEMA = 'model-support-load-readiness/v1';
const NON_PHYSICAL_TYPES = new Set(['BRANCH', 'GROUP', 'MODEL', 'ROOT', 'FOLDER', 'SYSTEM', 'ZONE']);

export function assessModelSupportLoadReadiness(dataset) {
  const bridge = buildCalculationWorkspaceBridge(dataset);
  const workspace = bridge.calculationWorkspace;
  const objects = workspaceObjects(workspace);
  const supportObjects = objects.filter(isEngineeringSupport);
  const supportSources = uniqueById([
    ...workspaceSupports(workspace),
    ...supportObjects,
  ]);
  const elementSources = objects.filter((object) => (
    !isEngineeringSupport(object) && isPhysicalElement(object)
  ));
  const elements = elementSources.map(resolveEngineeringElement).filter(hasLoadIntent);
  const supports = supportSources.map(resolveEngineeringSupport);

  const opeBlocked = elements.filter((element) => element.totalWeightOpeKg === null);
  const hydBlocked = elements.filter((element) => element.totalWeightHydKg === null);
  const usableSupports = supports.filter(isUsableSupport);
  const missingPosition = supports.filter((support) => !support.position);
  const missingChainage = supports.filter((support) => !Number.isFinite(support.chainageMm));
  const missingCapability = supports.filter((support) => support.verticalCapability !== true);
  const missingElementChainage = elements.filter((element) => (
    element.chainageCenterMm === null
    || (element.lengthM !== null && (element.chainageStartMm === null || element.chainageEndMm === null))
  ));
  const diagnostics = [
    ...elements.flatMap((element) => element.diagnostics || []),
    ...supports.flatMap((support) => support.diagnostics || []),
  ];
  const legacyEligible = usableSupports.length >= 2
    && elements.length > 0
    && opeBlocked.length === 0
    && hydBlocked.length === 0
    && missingElementChainage.length === 0;

  return freezeDeep({
    schema: MODEL_SUPPORT_LOAD_READINESS_SCHEMA,
    scope: 'MODEL',
    datasetId: dataset.datasetId,
    sourceSchema: dataset.sourceSchema,
    sourceNodeCount: bridge.sourceNodeCount,
    calculationWorkspaceSchema: workspace.schema,
    elements: {
      total: elements.length,
      excludedContainers: objects.length - supportObjects.length - elementSources.length,
      opeReady: elements.length - opeBlocked.length,
      hydReady: elements.length - hydBlocked.length,
      opeBlockedIds: opeBlocked.map((element) => element.elementId),
      hydBlockedIds: hydBlocked.map((element) => element.elementId),
      missingChainageIds: missingElementChainage.map((element) => element.elementId),
    },
    supports: {
      total: supports.length,
      usable: usableSupports.length,
      usableIds: usableSupports.map((support) => support.supportId),
      missingPositionIds: missingPosition.map((support) => support.supportId),
      missingChainageIds: missingChainage.map((support) => support.supportId),
      missingVerticalCapabilityIds: missingCapability.map((support) => support.supportId),
    },
    diagnostics: {
      total: diagnostics.length,
      blocked: diagnostics.filter((row) => row?.severity === 'BLOCKED').length,
      categories: countBy(diagnostics, (row) => row?.category || 'UNKNOWN'),
    },
    readyForElementWeightingOpe: elements.length > 0 && opeBlocked.length === 0,
    readyForElementWeightingHyd: elements.length > 0 && hydBlocked.length === 0,
    legacyGlobalChainageEligible: legacyEligible,
    readyForRoutePartitionedDistribution: false,
    distributionBlockers: buildDistributionBlockers({
      elements,
      opeBlocked,
      hydBlocked,
      usableSupports,
      missingElementChainage,
    }),
  });
}

function buildDistributionBlockers(state) {
  const blockers = [];
  if (!state.elements.length) blockers.push('NO_LOAD_BEARING_ELEMENTS');
  if (state.opeBlocked.length) blockers.push('OPE_ELEMENT_WEIGHTS_BLOCKED');
  if (state.hydBlocked.length) blockers.push('HYD_ELEMENT_WEIGHTS_BLOCKED');
  if (state.usableSupports.length < 2) blockers.push('INSUFFICIENT_USABLE_SUPPORTS');
  if (state.missingElementChainage.length) blockers.push('ELEMENT_CHAINAGE_INCOMPLETE');
  blockers.push('ROUTE_PARTITION_MODEL_NOT_BUILT');
  return blockers;
}

function isPhysicalElement(object) {
  const type = stringValue(object?.type || object?.kind || object?.sourceAttributes?.TYPE).toUpperCase();
  return !NON_PHYSICAL_TYPES.has(type);
}

function hasLoadIntent(element) {
  return element.lengthM !== null || element.componentWeightKg !== null || element.diagnostics.length > 0;
}

function isUsableSupport(support) {
  return support.verticalCapability === true
    && Number.isFinite(support.chainageMm)
    && Boolean(support.position);
}

function uniqueById(objects) {
  const rows = new Map();
  objects.forEach((object, index) => {
    const id = stringValue(object?.id || object?.name || `support-${index}`);
    rows.set(id, object);
  });
  return [...rows.values()];
}

function countBy(rows, selector) {
  return Object.freeze(rows.reduce((counts, row) => {
    const key = String(selector(row));
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {}));
}
