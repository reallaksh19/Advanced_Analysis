/**
 * Functionality: Formats qualified LFEA, empirical support-load distribution,
 * or sealed first-cut results for SVG, property-inspector, and table views. It
 * contains no mechanics, defaults, allowable tables, or inferred loads.
 */

import { engineeringModelStore } from '../engineering-model-store.js';
import { FirstCutResultStore } from '../first-cut-result-store.js';

const EMPIRICAL_RESULT_KIND = 'EMPIRICAL_SUPPORT_REACTION';
const EMPIRICAL_LIMITATION = 'Empirical gravity-load screening only; thermal and interface loads: NOT EVALUATED - RUN LFEA';

export class SupportLoadPresenter {
  constructor({ engineeringStore = engineeringModelStore, firstCutStore = FirstCutResultStore } = {}) {
    this.engineeringStore = engineeringStore;
    this.firstCutStore = firstCutStore;
  }

  getResultCallouts(entity) {
    const result = qualifiedResult(entity, this.engineeringStore, this.firstCutStore);
    const forceN = result ? numericForce(result) : null;
    if (!Number.isFinite(forceN)) return [];
    return [{ label: `Vertical=${(forceN / 1000).toFixed(3)}kN`, forceN, forcekN: forceN / 1000, direction: 'V', resultKind: result.resultKind }];
  }

  formatLoadInspectorProperties(entity) {
    const result = qualifiedResult(entity, this.engineeringStore, this.firstCutStore);
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
    const result = qualifiedResult(entity, this.engineeringStore, this.firstCutStore);
    if (!result) return 'NOT EVALUATED';
    const forceN = numericForce(result);
    return Number.isFinite(forceN) ? `${result.label}: ${formatKn(forceN)} kN` : 'NOT EVALUATED';
  }
}

function qualifiedResult(entity, engineeringStore, firstCutStore) {
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

  const empirical = qualifiedEmpiricalResult(entity, engineeringStore);
  if (empirical) return empirical;

  const entityId = entity?.entityId || entity?.supportKey || entity?.sourceEntityId;
  const row = firstCutStore.findSupportResult(entityId, 'OPE');
  if (!row) return null;
  return { ...row, authority: 'FIRST-CUT SCREENING' };
}

function qualifiedEmpiricalResult(entity, engineeringStore) {
  const decorated = entity?.properties?.engineeringSupportLoads
    ? entity
    : engineeringStore.decorateEntity(entity);
  const loads = decorated?.properties?.engineeringSupportLoads;
  if (loads?.freshness?.status !== 'CURRENT') return null;
  const loadCase = loads.loadCases?.find((row) => row.loadCaseId === 'OPE');
  if (loadCase?.status !== 'CALCULATED' || !Number.isFinite(loadCase.verticalForceN)) return null;
  return {
    label: 'Empirical support reaction',
    resultKind: EMPIRICAL_RESULT_KIND,
    loadCaseId: 'OPE',
    verticalForceN: loadCase.verticalForceN,
    method: loads.method,
    authority: loads.authority === 'AUTHORIZED_HANDOFF' ? 'AUTHORIZED_HANDOFF' : 'LEGACY_PROJECT_DATA',
    limitation: EMPIRICAL_LIMITATION,
  };
}

function numericForce(result) {
  return result.screenedVerticalShareN ?? result.beamVerticalForceN ?? result.verticalForceN;
}
function formatKn(forceN) { return (forceN / 1000).toFixed(3); }
