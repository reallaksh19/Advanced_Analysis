/**
 * Functionality: Orchestrates explicit sidecar enrichment, W10.4/W10.5/W10.6
 * inputs, preflight qualification, immutable sealing, and read-only reporting.
 * Imported shared-model objects are never mutated.
 */

import {
  buildFirstCutMasterData,
  buildFirstCutProfile,
  compileFirstCutMassLedger,
  createEnrichedSharedModelProjection,
  parseFirstCutMasterDataCsv,
  resolveEvidenceBindings,
  runFirstCutLoadEstimation,
  sealFirstCutAssumptionSet,
  validateFirstCutMasterData,
} from '../../core/first-cut-load-estimation/index.js';
import {
  buildModelLoadFoundation, createExplicitGravityProfile,
} from '../../core/model-loads/index.js';
import { buildPipingPortTopologyGraph } from '../../core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel, buildSupportAttachmentModel,
} from '../../core/support-restraints/index.js';
import {
  buildVerticalLoadPathFoundation, runTributarySupportLoadScreening,
} from '../../core/support-load-screening/index.js';
import {
  buildVerticalBeamFoundation, runVerticalBeamSolution,
} from '../../core/vertical-beam-solver/index.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { FirstCutResultStore } from '../first-cut-result-store.js';
import { copyTextToClipboard } from './clipboard-adapter.js';
import {
  createBindingsCsv, createCalculationBasisText, downloadTextArtifact,
} from './first-cut-serialization.js';
import { FirstCutWorkbenchStore } from './first-cut-workbench-store.js';
import { renderFirstCutWorkbench } from './first-cut-workbench-view.js';

export class FirstCutWorkbenchController {
  constructor(hostElement, eventBus, workspaceState, documentRef, clipboard, urlApi) {
    if (!hostElement) throw new TypeError('First-cut workbench host is required.');
    this.host = hostElement;
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.documentRef = documentRef;
    this.clipboard = clipboard;
    this.urlApi = urlApi;
    this.store = new FirstCutWorkbenchStore();
    this.prepared = null;
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [this.eventBus.subscribe(
      EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
      ({ snapshot }) => this.handleWorkspaceSnapshot(snapshot),
    )];
    this.handleWorkspaceSnapshot(this.workspaceState.getSnapshot());
  }

  handleWorkspaceSnapshot(snapshot) {
    const sourceHash = snapshot.status === 'ready' ? snapshot.dataset?.sharedModel?.semanticHash || '' : '';
    const previousHash = this.store.getSnapshot().sourceSemanticHash;
    this.store.loadDataset(sourceHash);
    if (previousHash && previousHash !== sourceHash) FirstCutResultStore.markStale();
    if (!sourceHash) FirstCutResultStore.markStale();
    this.prepared = null;
    this.render();
  }

  render() {
    renderFirstCutWorkbench(this.host, this.store.getSnapshot(), this.handlers());
  }

  handlers() {
    return Object.freeze({
      onTab: (value) => this.update(() => this.store.setActiveTab(value)),
      onProfileField: (key, value) => this.update(() => this.store.setProfileField(key, value)),
      onAddBinding: (value) => this.stage(() => this.store.addBinding(validateUiBinding(value))),
      onRemoveBinding: (id) => this.update(() => this.store.removeBinding(id)),
      onReset: () => this.update(() => this.store.resetStaged()),
      onImportMaster: () => this.importMaster(),
      onExportCsv: () => this.exportCsv(),
      onPreflight: () => this.preflight(),
      onReturn: () => this.update(() => this.store.clearPreflight()),
      onConfirm: () => this.confirmAndRun(),
      onCopyReport: (result) => this.copyReport(result),
      onFocus: (result) => this.focus(result),
      onCloseBasis: () => this.update(() => this.store.hideBasis()),
    });
  }

  update(action) {
    action();
    this.prepared = null;
    if (FirstCutResultStore.getPackage()) {
      FirstCutResultStore.markStale();
      this.store.markStale();
    }
    this.render();
  }

  stage(action) {
    try {
      this.update(action);
    } catch (error) {
      this.store.setError(messageOf(error));
      this.render();
    }
  }

  attempt(action) {
    try {
      action();
    } catch (error) {
      this.store.setError(messageOf(error));
    }
    this.render();
  }

  importMaster() {
    const input = this.documentRef.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,application/json,text/csv';
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const masterData = file.name.toLowerCase().endsWith('.csv')
          ? parseFirstCutMasterDataCsv(
            text,
            this.store.getSnapshot().profileForm.masterSourceId,
            this.store.getSnapshot().profileForm.masterRevision,
          )
          : masterFromJson(text);
        this.store.setMasterData(masterData);
        if (FirstCutResultStore.getPackage()) {
          FirstCutResultStore.markStale();
          this.store.markStale();
        }
        this.prepared = null;
      } catch (error) {
        this.store.setError(messageOf(error));
      }
      this.render();
    }, { once: true });
    input.click();
  }

  exportCsv() {
    this.attempt(() => {
      const bindings = resolvedBindings(this.store.getSnapshot());
      downloadTextArtifact(
        this.documentRef, this.urlApi, 'first-cut-sidecar-bindings.csv',
        createBindingsCsv(bindings), 'text/csv;charset=utf-8',
      );
      this.store.setMessage(`Exported ${bindings.length} deterministic sidecar bindings.`);
    });
  }

  preflight() {
    try {
      this.prepared = prepareCalculation(this.workspaceState, this.store.getSnapshot());
      this.store.setPreflight(buildPreflight(this.prepared));
    } catch (error) {
      this.prepared = null;
      this.store.setPreflight({
        blockers: [messageOf(error)],
        assumptionCount: resolvedBindings(this.store.getSnapshot()).length,
        evidence: resolvedBindings(this.store.getSnapshot()).map(bindingEvidenceLabel),
        proposedApproximations: [],
        affectedEntities: [],
        methodQualification: 'BLOCKED BEFORE METHOD QUALIFICATION',
        canConfirm: false,
      });
    }
    this.render();
  }

  confirmAndRun() {
    try {
      const prepared = prepareCalculation(this.workspaceState, this.store.getSnapshot());
      const audit = buildPreflight(prepared);
      if (!audit.canConfirm) throw new TypeError(`Preflight is blocked: ${audit.blockers.join(' ')}`);
      const calculationPackage = calculate(prepared);
      FirstCutResultStore.setPackage(calculationPackage);
      this.store.seal(calculationPackage);
      this.prepared = null;
    } catch (error) {
      this.store.setError(messageOf(error));
    }
    this.render();
  }

  async copyReport(result) {
    try {
      const snapshot = this.store.getSnapshot();
      if (snapshot.stale || FirstCutResultStore.isStale()) {
        throw new TypeError('Stale first-cut results cannot be copied.');
      }
      await copyTextToClipboard(
        this.clipboard,
        createCalculationBasisText(snapshot.calculationPackage, result),
      );
      this.store.setMessage('Deterministic first-cut report copied.');
    } catch (error) {
      this.store.setError(`Copy Report failed: ${messageOf(error)}`);
    }
    this.render();
  }

  focus(result) {
    this.attempt(() => {
      if (!result?.supportId) throw new TypeError('A support result is required for Focus.');
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: result.supportId,
        source: 'api',
      });
    });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.prepared = null;
    this.store.clear();
    FirstCutResultStore.clear();
    this.host.replaceChildren();
  }
}

function prepareCalculation(workspaceState, snapshot) {
  const workspace = workspaceState.getSnapshot();
  const sourceModel = workspace.status === 'ready' ? workspace.dataset?.sharedModel : null;
  if (!sourceModel) throw new TypeError('Import a shared piping model before first-cut screening.');
  const profile = profileFromForm(snapshot.profileForm);
  const bindings = resolvedBindings(snapshot);
  const enrichment = createEnrichedSharedModelProjection({ sourceModel, bindings });
  const topologyGraph = buildPipingPortTopologyGraph(enrichment.enrichedModel);
  const attachmentModel = buildSupportAttachmentModel(enrichment.enrichedModel, topologyGraph);
  const restraintModel = buildRestraintCapabilityModel(attachmentModel);
  const gravityProfile = createExplicitGravityProfile({
    profileId: `${profile.profileId}:gravity`,
    profileVersion: 1,
    accelerationMPerS2: profile.gravity.accelerationMPerS2,
    sourceBasis: profile.gravity.source,
    semanticDirection: profile.gravity.direction,
  });
  const modelLoadFoundation = buildModelLoadFoundation(
    enrichment.enrichedModel, topologyGraph, { gravityProfile },
  );
  const pathFoundation = buildVerticalLoadPathFoundation({
    sharedModel: enrichment.enrichedModel, topologyGraph, attachmentModel, restraintModel,
  }, { profileOptions: supportProfileOptions(profile) });
  const massLedger = compileFirstCutMassLedger({
    sourceSemanticHash: sourceModel.semanticHash,
    enrichmentResultSemanticHash: enrichment.semanticHash,
    modelLoadFoundation,
  });
  const assumptionSet = sealFirstCutAssumptionSet({
    sourceSemanticHash: sourceModel.semanticHash,
    profileSemanticHash: profile.semanticHash,
    assumptions: bindings.map(assumptionFromBinding),
  });
  const beamFoundation = needsBeam(profile)
    ? buildVerticalBeamFoundation({
      sharedModel: enrichment.enrichedModel,
      pathModel: pathFoundation.pathModel,
      loadCaseSet: modelLoadFoundation.loadCaseSet,
      loadPrimitiveSet: modelLoadFoundation.loadPrimitiveSet,
      modelLoadReadinessAudit: modelLoadFoundation.readinessAudit,
    }, { profileOptions: beamProfileOptions(profile) })
    : null;
  return Object.freeze({
    profile, bindings, enrichment, modelLoadFoundation, pathFoundation,
    massLedger, assumptionSet, beamFoundation,
    sustainedInput: sustainedFromForm(snapshot.profileForm, profile),
  });
}

function calculate(prepared) {
  const supportResult = prepared.profile.methodId === 'SIMPLE_SPAN_TRIBUTARY_VERTICAL_V1'
    ? runTributarySupportLoadScreening(prepared.pathFoundation, screeningInputs(prepared))
    : null;
  const beamResult = prepared.beamFoundation
    ? runVerticalBeamSolution(prepared.beamFoundation) : null;
  const pathSemanticHash = prepared.pathFoundation.pathModel.semanticHash;
  const currentParentHashes = {
    sourceSemanticHash: prepared.massLedger.sourceSemanticHash,
    enrichmentResultSemanticHash: prepared.massLedger.enrichmentResultSemanticHash,
    modelLoadPrimitiveSemanticHash: prepared.massLedger.loadPrimitiveSemanticHash,
    pathSemanticHash,
    assumptionSetSemanticHash: prepared.assumptionSet.semanticHash,
    profileSemanticHash: prepared.profile.semanticHash,
  };
  return runFirstCutLoadEstimation({
    profile: prepared.profile,
    assumptionSet: prepared.assumptionSet,
    massLedger: prepared.massLedger,
    pathSemanticHash,
    supportScreening: supportResult?.screening || null,
    beamModel: beamResult?.beamModel || prepared.beamFoundation?.beamModel || null,
    beamSolution: beamResult?.solution || null,
    sustainedInput: prepared.sustainedInput,
    currentParentHashes,
  });
}

function buildPreflight(prepared) {
  const selected = new Set(prepared.profile.loadCaseIds);
  const blockers = [];
  const affectedEntities = new Set();
  prepared.modelLoadFoundation.readinessAudit.cases
    .filter((row) => selected.has(row.loadCaseId) && row.qualification !== 'READY')
    .forEach((row) => {
      row.blockedComponentIds.forEach((id) => affectedEntities.add(id));
      blockers.push(`W10.4 ${row.loadCaseId}: ${row.blockedComponentIds.join(', ') || 'blocked'}`);
    });
  prepared.pathFoundation.pathModel.paths
    .filter((row) => row.qualification !== 'READY')
    .forEach((row) => {
      (row.orderedComponentKeys || []).forEach((id) => affectedEntities.add(id));
      (row.supportStations || []).forEach((item) => affectedEntities.add(item.supportKey));
      blockers.push(`W10.5 ${row.pathId}: ${(row.blockers || []).join(', ') || 'blocked'}`);
    });
  if (prepared.beamFoundation) {
    prepared.beamFoundation.beamModel.pathCases
      .filter((row) => selected.has(row.loadCaseId) && row.qualification !== 'READY')
      .forEach((row) => blockers.push(`W10.6 ${row.pathId}/${row.loadCaseId}: ${(row.blockers || []).join(', ') || 'blocked'}`));
  }
  if (prepared.profile.methodId === 'CONTINUOUS_BEAM_GRAVITY_V1') {
    const insufficient = prepared.beamFoundation.beamModel.pathCases.some(
      (row) => selected.has(row.loadCaseId) && row.qualification === 'READY' && row.constraints.length < 3,
    );
    if (insufficient) blockers.push('Continuous-beam screening requires at least three bilateral vertical supports.');
  }
  if (prepared.profile.requestedCapabilities.includes('SUSTAINED_STRESS_SCREENING')
    && prepared.sustainedInput === null) blockers.push('Explicit sustained-screening input JSON is required.');
  return Object.freeze({
    blockers: [...new Set(blockers)].sort(),
    assumptionCount: prepared.assumptionSet.assumptions.length,
    evidence: prepared.bindings.map(bindingEvidenceLabel),
    proposedApproximations: prepared.bindings
      .filter((row) => row.authorityLevel === 'USER_APPROVED_APPROXIMATION')
      .map(bindingEvidenceLabel),
    affectedEntities: [...affectedEntities].filter(Boolean).sort(),
    methodQualification: `${prepared.profile.methodId}: ${blockers.length ? 'BLOCKED' : 'QUALIFIED'}`,
    canConfirm: blockers.length === 0,
  });
}

function bindingEvidenceLabel(row) {
  return `${row.authorityLevel} ${row.selectorKind}:${row.selectorKey} ${row.fieldId} = ${row.value} ${row.unit} (${row.sourceId}@${row.revision})`;
}

function profileFromForm(form) {
  const requestedCapabilities = [
    ...(form.sagRequested ? ['SAG_SCREENING'] : []),
    ...(form.sustainedRequested ? ['SUSTAINED_STRESS_SCREENING'] : []),
  ];
  const sagCriterion = optionalSagCriterion(form);
  return buildFirstCutProfile({
    profileId: requiredText(form.profileId, 'Profile ID'),
    methodId: requiredText(form.methodId, 'Method'),
    loadCaseIds: form.loadCaseIds,
    gravity: {
      accelerationMPerS2: requiredNumber(form.gravityAccelerationMPerS2, 'Gravity acceleration'),
      direction: requiredText(form.gravityDirection, 'Gravity direction'),
      source: requiredText(form.gravitySource, 'Gravity source'),
    },
    geometryTolerances: {
      absoluteM: requiredNumber(form.geometryAbsoluteM, 'Geometry absolute tolerance'),
      relative: requiredNumber(form.geometryRelative, 'Geometry relative tolerance'),
    },
    equilibriumTolerances: {
      forceAbsoluteN: requiredNumber(form.forceAbsoluteN, 'Force absolute tolerance'),
      forceRelative: requiredNumber(form.forceRelative, 'Force relative tolerance'),
      momentAbsoluteNm: requiredNumber(form.momentAbsoluteNm, 'Moment absolute tolerance'),
      momentRelative: requiredNumber(form.momentRelative, 'Moment relative tolerance'),
    },
    sagCriterion,
    requestedCapabilities,
    pressureFormulaId: form.sustainedRequested
      ? requiredText(form.pressureFormulaId, 'Pressure formula') : null,
    source: requiredText(form.profileSource, 'Profile source'),
  });
}

function optionalSagCriterion(form) {
  const hasMaximum = String(form.sagMaximumM).trim() !== '';
  const hasSource = String(form.sagSource).trim() !== '';
  if (!hasMaximum && !hasSource) return null;
  if (!hasMaximum || !hasSource) throw new TypeError('Sag criterion maximum and source must be supplied together.');
  return { maximumM: requiredNumber(form.sagMaximumM, 'Sag criterion'), source: form.sagSource };
}

function sustainedFromForm(form, profile) {
  if (!profile.requestedCapabilities.includes('SUSTAINED_STRESS_SCREENING')) return null;
  if (!String(form.sustainedInputJson).trim()) return null;
  const value = JSON.parse(form.sustainedInputJson);
  if (value.formulaId !== profile.pressureFormulaId) {
    throw new TypeError('Sustained input formulaId must match the selected profile formula.');
  }
  return value;
}

function resolvedBindings(snapshot) {
  const acceptedOverrides = snapshot.stagedBindings
    .filter((row) => row.authorityLevel === 'ACCEPTED_OVERRIDE')
    .map(withoutAuthority);
  const approvedApproximations = snapshot.stagedBindings
    .filter((row) => row.authorityLevel === 'USER_APPROVED_APPROXIMATION')
    .map(withoutAuthority);
  return resolveEvidenceBindings({
    explicitSource: [],
    acceptedOverrides,
    authorizedMaster: (snapshot.masterData?.records || []).map((row) => ({
      ...row, authorityLevel: undefined,
    })).map(withoutAuthority),
    approvedApproximations,
  });
}

function withoutAuthority(row) {
  const { authorityLevel: _authorityLevel, ...record } = row;
  return record;
}

function assumptionFromBinding(row) {
  const unavailableSensitivity = row.fieldId === 'supportAvailabilitySensitivity';
  return {
    assumptionId: row.recordId,
    entityId: row.selectorKey,
    fieldId: row.fieldId,
    value: row.value,
    unit: row.unit,
    source: `${row.sourceId}@${row.revision}`,
    reason: unavailableSensitivity
      ? 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY'
      : 'Accepted through the first-cut enrichment workbench.',
    approver: 'USER-DECLARED',
    authorityLevel: row.authorityLevel,
    limitations: [
      `GROUP_SELECTOR:${row.selectorKind}`,
      ...(unavailableSensitivity ? ['DOES_NOT_IMPLY_THERMAL_LIFT_OFF'] : []),
    ],
  };
}

function supportProfileOptions(profile) {
  return {
    absoluteToleranceN: profile.equilibriumTolerances.forceAbsoluteN,
    relativeTolerance: profile.equilibriumTolerances.forceRelative,
    geometryAbsoluteToleranceM: profile.geometryTolerances.absoluteM,
    geometryRelativeTolerance: profile.geometryTolerances.relative,
  };
}

function beamProfileOptions(profile) {
  return {
    geometryTolerancePolicy: {
      absoluteTolerance: profile.geometryTolerances.absoluteM,
      relativeTolerance: profile.geometryTolerances.relative,
    },
    forceEquilibriumTolerancePolicy: {
      absoluteTolerance: profile.equilibriumTolerances.forceAbsoluteN,
      relativeTolerance: profile.equilibriumTolerances.forceRelative,
    },
    momentEquilibriumTolerancePolicy: {
      absoluteTolerance: profile.equilibriumTolerances.momentAbsoluteNm,
      relativeTolerance: profile.equilibriumTolerances.momentRelative,
    },
  };
}

function screeningInputs(prepared) {
  return {
    loadCaseSet: prepared.modelLoadFoundation.loadCaseSet,
    loadPrimitiveSet: prepared.modelLoadFoundation.loadPrimitiveSet,
    modelLoadReadinessAudit: prepared.modelLoadFoundation.readinessAudit,
  };
}

function needsBeam(profile) {
  return profile.methodId === 'CONTINUOUS_BEAM_GRAVITY_V1'
    || profile.requestedCapabilities.includes('SAG_SCREENING');
}

function masterFromJson(text) {
  const value = JSON.parse(text);
  if (value.schema === 'first-cut-master-data/v1') {
    const validation = validateFirstCutMasterData(value);
    if (!validation.ok) throw new TypeError(`Invalid master data: ${validation.errors.join(' ')}`);
    return value;
  }
  return buildFirstCutMasterData(value);
}

function validateUiBinding(value) {
  const record = withoutAuthority(value);
  const acceptedOverrides = value.authorityLevel === 'ACCEPTED_OVERRIDE' ? [record] : [];
  const approvedApproximations = value.authorityLevel === 'USER_APPROVED_APPROXIMATION'
    ? [record] : [];
  return resolveEvidenceBindings({
    explicitSource: [],
    acceptedOverrides,
    authorizedMaster: [],
    approvedApproximations,
  })[0];
}

function requiredNumber(value, label) {
  if (typeof value === 'string' && value.trim() === '') throw new TypeError(`${label} is required.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a finite number.`);
  return parsed;
}
function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
