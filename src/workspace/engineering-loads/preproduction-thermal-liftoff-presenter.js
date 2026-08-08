import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  requirePreproductionThermalLiftoffGovernedCurrentness,
  requirePreproductionThermalLiftoffGovernedExecution,
} from './preproduction-thermal-liftoff-governed-execution.js';

export const PREPRODUCTION_TL06_PRESENTATION_SCHEMA =
  'engineering-preproduction-thermal-liftoff-presentation/v1';

export function presentPreproductionThermalLiftoffGovernedExecution(input) {
  exactKeys(input, ['receipt', 'currentness'], 'TL-06 presentation input');
  const receipt = requirePreproductionThermalLiftoffGovernedExecution(input.receipt);
  const currentness = requirePreproductionThermalLiftoffGovernedCurrentness(input.currentness);
  if (currentness.receiptSemanticHash !== receipt.semanticHash) {
    throw coded('PREPRODUCTION_TL06_PRESENTATION_CURRENTNESS_BINDING_MISMATCH');
  }
  const current = currentness.status === 'CURRENT';
  const material = {
    schema: PREPRODUCTION_TL06_PRESENTATION_SCHEMA,
    receiptSemanticHash: receipt.semanticHash,
    currentnessSemanticHash: currentness.semanticHash,
    status: current ? 'PRESENTABLE_GOVERNED_EMPIRICAL_SCREEN' : 'STALE_SUPPRESSED',
    title: 'Thermal lift-off governed empirical screen',
    applicabilityClass: current ? receipt.applicabilityClass : null,
    correlationClass: current ? receipt.correlationClass : null,
    datasetId: current ? receipt.datasetId : null,
    loadCaseId: current ? receipt.loadCaseId : null,
    rows: current ? receipt.supportResults.map((row) => deepFreeze({
      supportSiteId: row.supportSiteId,
      routeChainageMm: row.routeChainageMm,
      screenedContactState: row.screenedContactState,
      screenedReactionN: row.screenedReactionN,
      screenedGapM: row.screenedGapM,
    })) : [],
    notices: current ? [
      'OPT-IN GOVERNED EMPIRICAL SCREEN ONLY — not a default production calculation or final hot-reaction claim.',
      'Applicability is limited to the TL-B reduced-flexibility single-route class qualified by the controlled TL-05 programme.',
      'This result is empirical screening, not FEA or code-compliance authority.',
      'Method registration, default UI exposure, seal/export eligibility and production cutover remain disabled.',
    ] : [
      'STALE SUPPRESSED — source authority changed or failed requalification; no numerical screen rows are presented.',
    ],
    policy: {
      governedOptInOnly: true,
      productionUiWiringPerformed: false,
      defaultUiExposurePermitted: false,
      staleRowsSuppressed: !current,
      sealExportEligibilityPermitted: false,
      finalHotReactionPublicationPermitted: false,
      productionCutoverPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffPresentation(freezeHash(material));
}

export function requirePreproductionThermalLiftoffPresentation(value) {
  exactKeys(value, [
    'schema', 'receiptSemanticHash', 'currentnessSemanticHash', 'status', 'title',
    'applicabilityClass', 'correlationClass', 'datasetId', 'loadCaseId', 'rows',
    'notices', 'policy', 'semanticHash',
  ], 'TL-06 presentation');
  if (value.schema !== PREPRODUCTION_TL06_PRESENTATION_SCHEMA
      || !['PRESENTABLE_GOVERNED_EMPIRICAL_SCREEN', 'STALE_SUPPRESSED'].includes(value.status)) {
    throw coded('PREPRODUCTION_TL06_PRESENTATION_IDENTITY_INVALID');
  }
  hash(value.receiptSemanticHash, 'receiptSemanticHash');
  hash(value.currentnessSemanticHash, 'currentnessSemanticHash');
  if (!Array.isArray(value.rows) || !Array.isArray(value.notices) || value.notices.length === 0) {
    throw coded('PREPRODUCTION_TL06_PRESENTATION_ARRAY_INVALID');
  }
  const stale = value.status === 'STALE_SUPPRESSED';
  if (stale && (value.rows.length !== 0
      || value.applicabilityClass !== null
      || value.correlationClass !== null
      || value.datasetId !== null
      || value.loadCaseId !== null)) {
    throw coded('PREPRODUCTION_TL06_STALE_ROWS_NOT_SUPPRESSED');
  }
  if (!stale && value.rows.length === 0) throw coded('PREPRODUCTION_TL06_CURRENT_ROWS_MISSING');
  const p = value.policy || {};
  if (p.governedOptInOnly !== true
      || p.productionUiWiringPerformed !== false
      || p.defaultUiExposurePermitted !== false
      || p.staleRowsSuppressed !== stale
      || p.sealExportEligibilityPermitted !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.productionCutoverPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_PRESENTATION_POLICY_INVALID');
  }
  verifySemanticHash(value, 'PREPRODUCTION_TL06_PRESENTATION_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function verifySemanticHash(value, code) { const { semanticHash: actual, ...material } = value; if (actual !== semanticHash(material)) throw coded(code); }
function exactKeys(value, keys, label) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${label} contains unexpected or missing keys.`); }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`); return value; }
function coded(code) { const error = new Error(code); error.code = code; return error; }
