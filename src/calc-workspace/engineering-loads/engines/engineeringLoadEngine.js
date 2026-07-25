/**
 * Functionality: builds the engineering support-load model from an isolated
 * calculation workspace using explicit enriched evidence. Parameters:
 * workspace, visible config, and evaluation timestamp. Outputs: chainage V2
 * distribution with element/support audits. Fallback: none; missing chainage,
 * capability, or weight evidence remains blocked and diagnostic.
 */

import { workspaceObjects, workspaceSupports } from '../../workspaceModel.js';
import { distributeLoadsByChainage } from './chainageDistribution.js';
import { isEngineeringSupport, resolveEngineeringElement, resolveEngineeringSupport } from '../resolvers/resolveEngineeringElement.js';

export const VISIBLE_ENGINEERING_LOAD_CONFIG = Object.freeze({
  gravityMps2: 9.80665,
  loadFactor: 1,
  distributionMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
  source: 'visible-editable-config',
});

export const ENGINEERING_LOAD_CONFIG_INFO = [
  'Suggested visible configuration (editable in Factors):',
  'gravityMps2 = 9.80665 (standard physical gravity)',
  'loadFactor = 1.0 (project factor; confirm for project)',
  'distributionMethod = CHAINAGE_TRIBUTARY_SPAN_V2',
  'No insulation-density default. No component-weight zero default.',
  'HYD never copies OPE when hydro density/weight is missing.',
  'Legacy guide/line-stop preview uses the visible Access profile and its documented A106 Gr.B temperature table; it is not part of the vertical reaction benchmark.',
].join('\n');

export function buildEngineeringLoadDistribution(workspace, config, evaluatedAt) {
  const objects = workspaceObjects(workspace);
  const supportCandidates = uniqueById([...workspaceSupports(workspace), ...objects.filter(isEngineeringSupport)]);
  const supports = supportCandidates.map(resolveEngineeringSupport);
  const elements = objects.filter((object) => !isEngineeringSupport(object)).map(resolveEngineeringElement).filter(hasLoadIntent);
  return distributeLoadsByChainage(elements, supports, {
    gravityMps2: config?.gravityMps2,
    loadFactor: config?.loadFactor,
    source: config?.source,
    evaluatedAt,
  });
}

export function normalizeVisibleEngineeringLoadConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Support-load configuration must be a visible object.');
  const gravityMps2 = positive(config.gravityMps2, 'gravityMps2');
  const loadFactor = positive(config.loadFactor, 'loadFactor');
  const method = String(config.distributionMethod || '').trim();
  if (method !== 'CHAINAGE_TRIBUTARY_SPAN_V2') throw new TypeError('Only explicit CHAINAGE_TRIBUTARY_SPAN_V2 is enabled for engineering results.');
  return Object.freeze({ gravityMps2, loadFactor, distributionMethod: method, source: String(config.source || 'visible-editable-config') });
}

function hasLoadIntent(element) {
  return element.lengthM !== null || element.componentWeightKg !== null || element.diagnostics.length > 0;
}

function uniqueById(objects) {
  const rows = new Map();
  objects.forEach((object, index) => rows.set(String(object?.id || object?.name || `support-${index}`), object));
  return [...rows.values()];
}

function positive(value, field) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new TypeError(`Visible support-load config ${field} must be a positive number.`);
  return numeric;
}
