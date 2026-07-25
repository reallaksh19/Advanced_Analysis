import {
  archiveModelCalculationPackage,
  createModelCalculationLedger,
  createModelCalculationPackage,
  createModelCalculationReport,
  PACKAGE_MODES,
} from '../src/core/model-calculation-package/index.js';
import { buildCalculationFixture } from './w10.7-fixtures.mjs';

export function buildWorkspaceConsumerFixture(options = {}) {
  const calculation = buildCalculationFixture({ datasetId: options.datasetId || 'W10.8-FIXTURE' });
  const source = calculation.source;
  const packageValue = createModelCalculationPackage({
    packageMode: PACKAGE_MODES.COMBINED,
    screeningSnapshot: calculation.screeningSnapshot,
    verticalBeamSnapshot: calculation.verticalBeamSnapshot,
    modelReference: calculation.modelReference,
  });
  const ledger = archiveModelCalculationPackage(
    createModelCalculationLedger(packageValue.datasetId),
    packageValue,
  );
  const activeEntry = ledger.entries.find((row) => row.entryId === ledger.activeEntryId);
  const report = createModelCalculationReport(activeEntry);
  return Object.freeze({
    calculation,
    contracts: Object.freeze({
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
    }),
  });
}
