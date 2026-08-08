import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  requirePreproductionThermalLiftoffGovernedCurrentness,
  requirePreproductionThermalLiftoffGovernedExecution,
} from './preproduction-thermal-liftoff-governed-execution.js';

export const PREPRODUCTION_TL06_PRESENTATION_SCHEMA =
  'engineering-preproduction-thermal-liftoff-presentation/v1';

export function presentPreproductionThermalLiftoffGovernedExecution(input) {
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
    status: current ? 'PRESENTABLE_PREPRODUCTION_SCREEN' : 'STALE_SUPPRESSED',
    title: 'Thermal lift-off preproduction governed screen',
    applicabilityClass: current ? receipt.applicabilityClass : null,
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
      'PREPRODUCTION SCREEN ONLY — not a production final hot-reaction claim.',
      'Applicability is limited to the qualified TL-B reduced-flexibility single-route class.',
      'Method registration, default UI enablement, seal/export eligibility and production cutover remain disabled.',
    ] : [
      'STALE SUPPRESSED — source authority changed or failed currentness requalification; no screen rows are presented.',
    ],
    policy: {
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
  if (value?.schema !== PREPRODUCTION_TL06_PRESENTATION_SCHEMA) throw coded('PREPRODUCTION_TL06_PRESENTATION_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL06_PRESENTATION_HASH_MISMATCH');
  if (!['PRESENTABLE_PREPRODUCTION_SCREEN', 'STALE_SUPPRESSED'].includes(value.status)) throw coded('PREPRODUCTION_TL06_PRESENTATION_STATUS_INVALID');
  if (!Array.isArray(value.rows) || !Array.isArray(value.notices)) throw coded('PREPRODUCTION_TL06_PRESENTATION_ARRAY_INVALID');
  const stale = value.status === 'STALE_SUPPRESSED';
  if (stale && value.rows.length !== 0) throw coded('PREPRODUCTION_TL06_STALE_ROWS_NOT_SUPPRESSED');
  const p = value.policy || {};
  if (p.productionUiWiringPerformed !== false
      || p.defaultUiExposurePermitted !== false
      || p.staleRowsSuppressed !== stale
      || p.sealExportEligibilityPermitted !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.productionCutoverPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_PRESENTATION_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
