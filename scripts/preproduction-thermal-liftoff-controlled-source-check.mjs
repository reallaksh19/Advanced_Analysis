import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EXECUTION_RECORD_KEYS,
  compileSolverExecution,
  computeExecutionEvidenceHash,
  computeExecutionSemanticHash,
} from '../src/core/linear-fea-solver/index.js';
import { requirePreproductionSupportContactAuthority } from '../src/workspace/engineering-loads/preproduction-support-contact-authority.js';
import { createPreproductionThermalLiftoffReactionToleranceAuthority } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js';
import {
  cantileverWithSettlementSlotCompilation,
  elementContributions,
  frameElements,
  settlementLoadCase,
  settlementPrimitive,
  solverProfile,
  tipLoadCase,
} from './lfea-b3.3-solver-fixtures.mjs';
import {
  buildControlledThermalLiftoffSourceQualification,
  requireControlledThermalLiftoffSourceQualification,
} from './preproduction-thermal-liftoff-controlled-source-adapter.mjs';
import { requireControlledThermalLiftoffSourceQualificationIndependently } from './preproduction-thermal-liftoff-controlled-source-validator.mjs';

const compilation = cantileverWithSettlementSlotCompilation();
const contributions = elementContributions();
const profile = solverProfile();
const contact = contactAuthority();
const referenceState = solvedMovementState('TL-REF', 0, 'LP-TL-REF');
const hotState = solvedMovementState('OPE', 0.002, 'LP-TL-HOT');
const zeroProbe = solvedMovementState('TL-K-ZERO', 0, 'LP-TL-K-ZERO');
const displacedProbe = solvedMovementState('TL-K-PROBE', 0.001, 'LP-TL-K-PROBE');
const tolerance = createPreproductionThermalLiftoffReactionToleranceAuthority({
  toleranceId: 'TL-TOL-CONTROLLED',
  reactionToleranceN: 5,
  source: source('TL-TOL-APPROVAL', 'APPROVED_ENGINEERING_DATA'),
  benchmarkReference: benchmark('TL-TOL-CONTROLLED-BENCH'),
  qualification: 'QUALIFIED',
});
const mapping = {
  supportSiteId: 'SITE-A',
  nodeId: 'N-000121',
  referenceSupportMovementM: { x: 0, y: 0, z: 0 },
  hotSupportMovementM: { x: 0, y: 0, z: 0 },
  supportMovementSource: source('SUPPORT-MOVEMENT:SITE-A', 'APPROVED_ENGINEERING_DATA'),
  horizontalComponentAuthority: null,
};
const probe = {
  supportSiteId: 'SITE-A',
  nodeId: 'N-000121',
  zeroState: zeroProbe,
  displacedState: displacedProbe,
  source: source('LFEA-B3.3-PRESCRIBED-01', 'SOURCE_SOLVER'),
  benchmarkReference: benchmark('LFEA-B3.3-PRESCRIBED-01'),
  contactAuthoritySemanticHash: contact.semanticHash,
};
const sourceSnapshot = JSON.stringify({ contact, referenceState, hotState, zeroProbe, displacedProbe, tolerance });

const qualification = buildControlledThermalLiftoffSourceQualification({
  contactAuthority: contact,
  referenceState,
  hotState,
  supportMappings: [mapping],
  stiffnessProbes: [probe],
  reactionTolerance: tolerance,
});
const accepted = requireControlledThermalLiftoffSourceQualificationIndependently(qualification);
assert.equal(accepted.status, 'READY_FOR_TL03_CONTROLLED_SOURCE_RECONCILIATION');
assert.equal(accepted.summary.supportCount, 1);
assert.equal(accepted.summary.qualifiedDisplacementCount, 1);
assert.equal(accepted.summary.qualifiedLocalStiffnessCount, 1);
assert.equal(accepted.displacements[0].qualification, 'QUALIFIED');
assert.equal(accepted.displacements[0].usedUpwardRelativeDisplacementM, 0.002);
assert.equal(accepted.prerequisiteAuthority.status, 'READY_FOR_TL03_PREREQUISITE_BRIDGE');
assert.equal(accepted.prerequisiteBridge.status, 'READY_FOR_TL03_INPUT_RECONCILIATION');
assert.equal(accepted.prerequisiteBridge.reactionToleranceAuthority.reactionToleranceN, 5);
assert.equal(accepted.policy.sourceSolverExecutedByAdapter, false);
assert.equal(accepted.policy.srcRuntimeDependencyCreated, false);
assert.equal(accepted.policy.reactionToleranceInferredFromSolver, false);
assert.equal(accepted.policy.solverInternalTolerancePromoted, false);
assert.equal(accepted.policy.localScreenExecutionPerformed, false);
assert.equal(accepted.policy.activeSetRedistributionPerformed, false);

const element = frameElements()[0];
const expectedLocalStiffness = (3 * element.material.elasticModulus * element.section.secondMomentY) / (1.2 ** 3);
assertClose(
  accepted.stiffnessEntries[0].data.effectiveVerticalStiffnessNPerM,
  expectedLocalStiffness,
  1e-8,
  'derived prescribed-UZ local stiffness vs closed-form cantilever',
);
assert.equal(JSON.stringify({ contact, referenceState, hotState, zeroProbe, displacedProbe, tolerance }), sourceSnapshot);

// A general mechanical load result is not a TL-02 unit-displacement probe.
const arbitraryLoadCase = tipLoadCase(compilation, { loadCaseId: 'TL-K-ARBITRARY' });
const arbitraryExecution = sealedRecord(compileSolverExecution({
  compilation,
  elementContributions: contributions,
  loadCase: arbitraryLoadCase,
  solverProfile: profile,
}));
expectCode(() => buildControlledThermalLiftoffSourceQualification({
  contactAuthority: contact,
  referenceState,
  hotState,
  supportMappings: [mapping],
  stiffnessProbes: [{ ...probe, displacedState: { loadCase: arbitraryLoadCase, execution: arbitraryExecution } }],
  reactionTolerance: tolerance,
}), 'TL_SOURCE_PROBE_LOAD_CASE_INVALID');

// A non-qualified solver receipt cannot become displacement or stiffness authority,
// even if its hashes are rebuilt self-consistently.
const conditionalHot = rehashExecutionStatus(hotState.execution, 'CONDITIONAL');
expectCode(() => buildControlledThermalLiftoffSourceQualification({
  contactAuthority: contact,
  referenceState,
  hotState: { loadCase: hotState.loadCase, execution: conditionalHot },
  supportMappings: [mapping],
  stiffnessProbes: [probe],
  reactionTolerance: tolerance,
}), 'TL_SOURCE_EXECUTION_NOT_QUALIFIED');

// A forged source row that is fully rehashed still fails the independent child
// re-derivation check; outer hash consistency is not accepted as engineering truth.
const forged = structuredClone(qualification);
forged.sourceRows[0].effectiveVerticalStiffnessNPerM += 1;
rehashSourceRow(forged.sourceRows[0]);
rehashOuter(forged);
requireControlledThermalLiftoffSourceQualification(forged);
expectCode(() => requireControlledThermalLiftoffSourceQualificationIndependently(forged), 'TL_CONTROLLED_SOURCE_ROW_CHILD_MISMATCH');

// Missing or generic coverage fails before any partial child authority is emitted.
expectCode(() => buildControlledThermalLiftoffSourceQualification({
  contactAuthority: contact,
  referenceState,
  hotState,
  supportMappings: [],
  stiffnessProbes: [probe],
  reactionTolerance: tolerance,
}), 'TL_SOURCE_DISPLACEMENT_COVERAGE_MISMATCH');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-controlled-source',
  status: 'PASS',
  qualificationSchema: accepted.schema,
  qualificationStatus: accepted.status,
  supportCount: accepted.summary.supportCount,
  sourceBackedDisplacementFromSealedExecutionPair: true,
  localStiffnessFromDedicatedPrescribedUzProbePair: true,
  localStiffnessMatchesClosedForm: true,
  arbitraryLoadCaseRatioRejected: true,
  nonQualifiedSolverReceiptRejected: true,
  independentRehashTamperRejected: true,
  reactionToleranceExternallySupplied: true,
  solverInternalTolerancePromoted: false,
  sourceSolverExecutedByAdapter: false,
  srcRuntimeDependencyCreated: false,
  localScreenExecutionPerformed: false,
  activeSetRedistributionPerformed: false,
  qualificationFixtureOnly: true,
  sourceInputsImmutable: true,
}, null, 2));

function solvedMovementState(loadCaseId, value, primitiveId) {
  const loadCase = settlementLoadCase(compilation, {
    loadCaseId,
    primitives: [settlementPrimitive({ primitiveId, value })],
  });
  const execution = compileSolverExecution({
    compilation,
    elementContributions: contributions,
    loadCase,
    solverProfile: profile,
  });
  assert.equal(execution.status, 'QUALIFIED');
  return { loadCase, execution: sealedRecord(execution) };
}

function sealedRecord(execution) {
  return Object.fromEntries(EXECUTION_RECORD_KEYS.map((key) => [key, structuredClone(execution[key])]));
}

function rehashExecutionStatus(execution, status) {
  const next = structuredClone(execution);
  next.status = status;
  next.semanticHash = computeExecutionSemanticHash(next);
  next.executionHash = next.semanticHash;
  next.evidenceHash = computeExecutionEvidenceHash(next);
  return next;
}

function rehashSourceRow(row) {
  const { semanticHash: ignored, ...material } = row;
  void ignored;
  row.semanticHash = semanticHash(material);
}

function rehashOuter(value) {
  const { semanticHash: ignored, ...material } = value;
  void ignored;
  value.semanticHash = semanticHash(material);
}

function contactAuthority() {
  const rowMaterial = {
    supportKey: 'SUP-A',
    supportSiteId: 'SITE-A',
    routeId: 'ROUTE-1',
    routeChainageMm: 0,
    restraintId: 'R:SUP-A',
    attachmentId: 'A:SUP-A',
    attachedComponentKey: 'PIPE-1',
    sourceRestraintCapabilityHash: semanticHash({ supportKey: 'SUP-A', source: true }),
    contactSemanticsHash: semanticHash({ supportKey: 'SUP-A', contact: 'controlled-source-fixture' }),
    effectiveType: 'UNILATERAL_REST',
    effectiveDirection: 'VERTICAL',
    effectiveAxis: [0, 0, 1],
    verticalState: 'RESTRAINED',
    capability: 'UNILATERAL_REST',
    tensileReactionPermitted: false,
    initialState: 'CONTACTING',
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    coldGapM: 0,
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    gapEvidenceHash: semanticHash({ gap: 0 }),
    restraintStiffnessEvidenceValue: 50_000,
    stiffnessEvidenceHash: semanticHash({ generic: 50_000 }),
    springRateEvidenceHash: semanticHash([]),
    frictionCoefficient: null,
    frictionEvidenceHash: semanticHash([]),
    authorityStatus: 'QUALIFIED_SOURCE_BOUND',
    tl03Status: 'READY_FOR_TL03_CONTACT_INTAKE',
    blockers: [],
    tl03Blockers: [],
    evidenceOnly: {
      tl02EffectiveStiffnessAuthority: 'UNQUALIFIED_APPLICABILITY_REQUIRED',
      springMechanics: 'NOT_PROVIDED',
      frictionMechanics: 'NOT_PROVIDED',
      supportMovementAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
      reactionToleranceAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
    },
  };
  const row = { ...rowMaterial, semanticHash: semanticHash(rowMaterial) };
  const material = {
    schema: 'engineering-preproduction-support-contact-authority/v1',
    datasetId: 'CONTROLLED-TL-FIXTURE',
    sourceBindings: {
      analysisTopologySemanticHash: semanticHash({ a: 1 }),
      topologyGraphSemanticHash: semanticHash({ a: 2 }),
      supportAttachmentModelSemanticHash: semanticHash({ a: 3 }),
      restraintCapabilityModelSemanticHash: semanticHash({ a: 4 }),
      effectiveRestraintCapabilityModelSemanticHash: semanticHash({ a: 5 }),
      supportSiteModelSemanticHash: semanticHash({ a: 6 }),
      routePartitionModelSemanticHash: semanticHash({ a: 7 }),
      contactSemanticsSemanticHashes: [row.contactSemanticsHash],
    },
    coordinateFrame: {
      basis: 'GLOBAL_XYZ_Z_UP',
      verticalContactDirection: 'GLOBAL_Z_PLUS',
      gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
      gapUnit: 'M',
      routeChainageUnit: 'MM',
    },
    status: 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY',
    rows: [row],
    blockers: [],
    summary: {
      supportCount: 1,
      qualifiedAuthorityCount: 1,
      tl03ReadyCount: 1,
      tl03UnresolvedCount: 0,
      blockerCount: 0,
    },
    policy: {
      productionCalculationConsumptionEnabled: false,
      gravityMutationPermitted: false,
      supportAvailabilityScenarioExecutionEnabled: false,
      gapMechanicsExecuted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
      liftOffExecuted: false,
      activeSetRedistributionEnabled: false,
      finalHotReactionPublicationPermitted: false,
      tl03ContactAdapterPermitted: true,
      tl02StiffnessPromotionPermitted: false,
      reactionToleranceAuthorityCreated: false,
      supportMovementAuthorityCreated: false,
    },
  };
  return requirePreproductionSupportContactAuthority({ ...material, semanticHash: semanticHash(material) });
}

function source(sourceId, sourceKind, sourceRevision = 'REV-A') {
  return {
    sourceId,
    sourceRevision,
    sourceSemanticHash: semanticHash({ sourceId, sourceKind, sourceRevision, controlledQualification: true }),
    sourceKind,
  };
}

function benchmark(benchmarkId) {
  return {
    benchmarkId,
    benchmarkRevision: 'REV-A',
    benchmarkSemanticHash: semanticHash({ benchmarkId, revision: 'REV-A', controlledQualification: true }),
  };
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertClose(actual, expected, relativeTolerance, label) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(Math.abs(actual - expected) <= relativeTolerance * scale, `${label}: ${actual} vs ${expected}`);
}
