/**
 * Functionality: Formats sealed LFEA or first-cut support results for SVG,
 * property-inspector, and topology-table views. It contains no mechanics,
 * defaults, allowable tables, or inferred loads.
 */

import { FirstCutResultStore } from '../first-cut-result-store.js';

export class SupportLoadPresenter {
  getResultCallouts(entity) {
    const result = qualifiedResult(entity);
    const forceN = result ? numericForce(result) : null;
    if (!Number.isFinite(forceN)) return [];
    return [{ label: `Vertical=${(forceN / 1000).toFixed(3)}kN`, forceN, forcekN: forceN / 1000, direction: 'V', resultKind: result.resultKind }];
  }

  formatLoadInspectorProperties(entity) {
    const result = qualifiedResult(entity);
    if (!result) return {};
    const forceN = numericForce(result);
    if (!Number.isFinite(forceN)) return {};
    return {
      Method: result.method || result.resultKind,
      'Load Case': result.loadCaseId,
      [result.label]: `${forceN.toFixed(3)} N (${formatKn(forceN)} kN)`,
      Authority: result.authority || 'FIRST-CUT SCREENING',
      Limitation: result.limitation || 'Thermal and interface loads: NOT EVALUATED - RUN LFEA',
    };
  }

  getTableSummary(entity) {
    const result = qualifiedResult(entity);
    if (!result) return 'NOT EVALUATED';
    const forceN = numericForce(result);
    return Number.isFinite(forceN) ? `${result.label}: ${formatKn(forceN)} kN` : 'NOT EVALUATED';
  }
}

function qualifiedResult(entity) {
  const lfea = entity?.analysisResults?.lfeaReaction;
  if (lfea?.qualified === true && lfea.stale !== true && Number.isFinite(lfea.verticalForceN)) {
    return {
      label: 'Qualified LFEA reaction',
      resultKind: 'QUALIFIED_LFEA_REACTION',
      loadCaseId: lfea.loadCaseId,
      verticalForceN: lfea.verticalForceN,
      method: lfea.methodId,
      authority: 'QUALIFIED LFEA',
      limitation: 'See sealed LFEA evidence package.',
    };
  }
  const entityId = entity?.entityId || entity?.supportKey || entity?.sourceEntityId;
  const row = FirstCutResultStore.findSupportResult(entityId, 'OPE');
  if (!row) return null;
  return { ...row, authority: 'FIRST-CUT SCREENING' };
}

function numericForce(result) {
  return result.screenedVerticalShareN ?? result.beamVerticalForceN ?? result.verticalForceN;
}
function formatKn(forceN) { return (forceN / 1000).toFixed(3); }
