import { runTributarySupportLoadScreening } from '../src/core/support-load-screening/index.js';
import { solveBeamFixture } from './w10.6-beam-fixtures.mjs';

export function buildCalculationFixture(options = {}) {
  const solveOptions = fixtureOptions(options);
  const fixture = solveBeamFixture(solveOptions);
  const screeningRun = runTributarySupportLoadScreening(fixture.pathFoundation, {
    loadCaseSet: fixture.loadFoundation.loadCaseSet,
    loadPrimitiveSet: fixture.loadFoundation.loadPrimitiveSet,
    modelLoadReadinessAudit: fixture.loadFoundation.readinessAudit,
  });
  return Object.freeze({
    source: fixture,
    modelReference: modelReference(fixture),
    screeningSnapshot: Object.freeze({
      profile: screeningRun.profile,
      pathModel: screeningRun.pathModel,
      screening: screeningRun.screening,
      audit: screeningRun.audit,
    }),
    verticalBeamSnapshot: Object.freeze({
      profile: fixture.foundation.profile,
      flexuralProjection: fixture.foundation.flexuralProjection,
      beamModel: fixture.foundation.beamModel,
      solution: fixture.solved.solution,
      audit: fixture.solved.audit,
    }),
  });
}

function fixtureOptions(options) {
  const base = {
    datasetId: options.datasetId || 'W10.7-FIXTURE',
    lengthsM: options.lengthsM || [2, 2],
    supportStationsM: options.supportStationsM,
    reverseInputOrder: options.reverseInputOrder || false,
    profileOptions: options.profileOptions || {},
    blockedComponentsByCase: options.blockedCase ? { [options.blockedCase]: ['COMP-1'] } : {},
  };
  if (!options.directionReversal) return base;
  const loads = allCases([{ type: 'DISTRIBUTED', componentKey: 'COMP-3', forcePerLengthNM: 400 }]);
  return { ...base, lengthsM: [2, 2, 2], supportStationsM: [0, 4], loads };
}
function modelReference(fixture) {
  return Object.freeze({
    datasetId: fixture.sharedModel.project.datasetId,
    sharedModelSemanticHash: fixture.sharedModel.semanticHash,
    topologySemanticHash: fixture.topologyGraph.semanticHash,
    supportAttachmentSemanticHash: fixture.attachmentModel.semanticHash,
    restraintCapabilitySemanticHash: fixture.restraintModel.semanticHash,
    loadCaseSetSemanticHash: fixture.loadFoundation.loadCaseSet.semanticHash,
    loadPrimitiveSetSemanticHash: fixture.loadFoundation.loadPrimitiveSet.semanticHash,
    modelLoadReadinessSemanticHash: fixture.loadFoundation.readinessAudit.semanticHash,
    verticalLoadPathModelSemanticHash: fixture.pathFoundation.pathModel.semanticHash,
  });
}
function allCases(rows) { return { EMPTY: structuredClone(rows), OPE: structuredClone(rows), HYD: structuredClone(rows) }; }
