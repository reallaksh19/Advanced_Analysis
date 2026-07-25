import {
  archiveModelCalculationPackage, createModelCalculationLedger, createModelCalculationPackage,
  createModelCalculationReport, PACKAGE_MODES,
} from '../src/core/model-calculation-package/index.js';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { createWorkspaceConsumerContext } from '../src/core/workspace-consumers/index.js';
import { buildCalculationFixture } from './w10.7-fixtures.mjs';
import { buildWorkspaceConsumerFixture } from './w10.8-fixtures.mjs';

export function buildW1010Context(options = {}) {
  const fixture = buildWorkspaceConsumerFixture({ datasetId: options.datasetId || 'W10.10-FIXTURE' });
  const contracts = selectedContracts(fixture.contracts, options);
  return createWorkspaceConsumerContext({
    datasetId: options.contextDatasetId || fixture.contracts.sharedModel.project.datasetId,
    workspaceVersion: options.workspaceVersion ?? 1,
    selectedEntityId: options.selectedEntityId || 'COMP-1',
    contracts,
  });
}

export function buildReorderedW1010Context(options = {}) {
  const calculation = buildCalculationFixture({
    datasetId: options.datasetId || 'W10.10-FIXTURE',
    reverseInputOrder: true,
  });
  return createWorkspaceConsumerContext({
    datasetId: calculation.source.sharedModel.project.datasetId,
    workspaceVersion: 7,
    selectedEntityId: 'COMP-2',
    contracts: calculationContracts(calculation),
  });
}

export function staleOptionalLoadContext() {
  const fixture = buildWorkspaceConsumerFixture({ datasetId: 'W10.10-STALE-LOAD' });
  const stale = rehash({ ...structuredClone(fixture.contracts.loadPrimitiveSet), loadCaseSetSemanticHash: 'fnv1a64:stale' });
  return createWorkspaceConsumerContext({
    datasetId: fixture.contracts.sharedModel.project.datasetId,
    contracts: { ...fixture.contracts, loadPrimitiveSet: stale },
  });
}

export function staleOptionalBeamContext() {
  const fixture = buildWorkspaceConsumerFixture({ datasetId: 'W10.10-STALE-BEAM' });
  const stale = rehash({ ...structuredClone(fixture.contracts.verticalBeamSolution), beamModelSemanticHash: 'fnv1a64:stale' });
  return createWorkspaceConsumerContext({
    datasetId: fixture.contracts.sharedModel.project.datasetId,
    contracts: { ...fixture.contracts, verticalBeamSolution: stale },
  });
}

export function staleRequiredContext() {
  const fixture = buildWorkspaceConsumerFixture({ datasetId: 'W10.10-STALE-REQUIRED' });
  const stale = rehash({ ...structuredClone(fixture.contracts.topologyGraph), sharedModelSemanticHash: 'fnv1a64:stale' });
  return createWorkspaceConsumerContext({
    datasetId: fixture.contracts.sharedModel.project.datasetId,
    contracts: { ...fixture.contracts, topologyGraph: stale },
  });
}

function selectedContracts(source, options) {
  const contracts = { ...source };
  if (options.requiredOnly || options.loads === false) {
    contracts.loadCaseSet = null;
    contracts.loadPrimitiveSet = null;
    contracts.modelLoadReadinessAudit = null;
  }
  if (options.requiredOnly) {
    contracts.verticalLoadPathModel = null;
    contracts.supportLoadScreening = null;
    contracts.supportLoadScreeningAudit = null;
  }
  if (options.requiredOnly || options.beam === false) {
    contracts.flexuralPropertyProjection = null;
    contracts.verticalBeamModel = null;
    contracts.verticalBeamSolution = null;
    contracts.verticalBeamSolverAudit = null;
  }
  if (options.partialBeam) contracts.verticalBeamSolverAudit = null;
  return contracts;
}

function calculationContracts(calculation) {
  const source = calculation.source;
  const packageValue = createModelCalculationPackage({
    packageMode: PACKAGE_MODES.COMBINED,
    screeningSnapshot: calculation.screeningSnapshot,
    verticalBeamSnapshot: calculation.verticalBeamSnapshot,
    modelReference: calculation.modelReference,
  });
  const ledger = archiveModelCalculationPackage(createModelCalculationLedger(packageValue.datasetId), packageValue);
  const activeEntry = ledger.entries.find((row) => row.entryId === ledger.activeEntryId);
  const report = createModelCalculationReport(activeEntry);
  return {
    sharedModel: source.sharedModel,
    topologyGraph: source.topologyGraph,
    topologyAudit: source.topologyGraph.topologyAudit,
    supportAttachmentModel: source.attachmentModel,
    supportAttachmentAudit: source.attachmentModel.attachmentAudit,
    restraintCapabilityModel: source.restraintModel,
    restraintCapabilityAudit: source.restraintModel.restraintAudit,
    loadCaseSet: source.loadFoundation.loadCaseSet,
    loadPrimitiveSet: source.loadFoundation.loadPrimitiveSet,
    modelLoadReadinessAudit: source.loadFoundation.readinessAudit,
    verticalLoadPathModel: source.pathFoundation.pathModel,
    supportLoadScreening: calculation.screeningSnapshot.screening,
    supportLoadScreeningAudit: calculation.screeningSnapshot.audit,
    flexuralPropertyProjection: source.foundation.flexuralProjection,
    verticalBeamModel: source.foundation.beamModel,
    verticalBeamSolution: source.solved.solution,
    verticalBeamSolverAudit: source.solved.audit,
    modelCalculationLedger: ledger,
    activeModelCalculationPackage: packageValue,
    activeModelCalculationReport: report,
  };
}
function rehash(value) {
  const { semanticHash: _hash, ...base } = value;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
