import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EXECUTION_RECORD_KEYS,
  compileSolverExecution,
  computeExecutionEvidenceHash,
  computeExecutionSemanticHash,
} from '../src/core/linear-fea-solver/index.js';
import { requirePreproductionSupportContactAuthority } from '../src/workspace/engineering-loads/preproduction-support-contact-authority.js';
import {
  cantileverCompilation,
  cantileverWithSettlementSlotCompilation,
  elementContributions,
  frameElements,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
} from './lfea-b3.3-solver-fixtures.mjs';
import {
  buildControlledThermalLiftoffInfluenceQualification,
  requireControlledThermalLiftoffInfluenceQualification,
} from './preproduction-thermal-liftoff-controlled-influence-adapter.mjs';
import { requireControlledThermalLiftoffInfluenceQualificationIndependently } from './preproduction-thermal-liftoff-controlled-influence-validator.mjs';

const compilation = cantileverCompilation();
const contributions = elementContributions();
const profile = solverProfile();
const contact = contactAuthority();
const mappings = [
  { supportSiteId: 'SITE-A', nodeId: 'N-000121' },
  { supportSiteId: 'SITE-B', nodeId: 'N-000122' },
];
const probePairs = mappings.map((mapping) => ({
  supportSiteId: mapping.supportSiteId,
  zeroState: forceState(compilation, mapping.nodeId, 0, `TL-C-ZERO-${mapping.supportSiteId}`),
  forcedState: forceState(compilation, mapping.nodeId, 1000, `TL-C-FORCE-${mapping.supportSiteId}`),
}));
const source = sourceIdentity('LFEA-B3.3-UNIT-FORCE-FLEX');
const benchmarkReference = benchmark('TL02-CANTILEVER-CLOSED-FORM-COMPLIANCE');
const snapshot = JSON.stringify({ contact, mappings, probePairs });

const qualification = buildControlledThermalLiftoffInfluenceQualification({
  contactAuthority: contact,
  supportMappings: mappings,
  probePairs,
  source,
  benchmarkReference,
});
const accepted = requireControlledThermalLiftoffInfluenceQualificationIndependently(qualification);
assert.equal(accepted.status, 'QUALIFIED_CONTROLLED_SOURCE_INFLUENCE');
assert.equal(accepted.matrixEvidence.qualification, 'QUALIFIED');
assert.equal(accepted.matrixEvidence.representation, 'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE');
assert.deepEqual(accepted.ordering, ['SITE-A', 'SITE-B']);
assert.equal(accepted.summary.supportCount, 2);
assert.equal(accepted.summary.probePairCount, 2);
assert.equal(accepted.summary.offDiagonalCouplingPresent, true);
assert.equal(accepted.policy.sourceSolverExecutedByAdapter, false);
assert.equal(accepted.policy.srcRuntimeDependencyCreated, false);
assert.equal(accepted.policy.localScalarStiffnessInferredFromMatrix, false);
assert.equal(accepted.policy.activeSetRedistributionPerformed, false);
assert.equal(JSON.stringify({ contact, mappings, probePairs }), snapshot);

const element = frameElements()[0];
const E = element.material.elasticModulus;
const I = element.section.secondMomentY;
const positions = [1.2, 2.4];
const expected = positions.map((x) => positions.map((a) => cantileverCompliance(x, a, E, I)));
for (let i = 0; i < expected.length; i += 1) {
  for (let j = 0; j < expected.length; j += 1) {
    assertClose(accepted.matrixEvidence.data.values[i][j], expected[i][j], 1e-8, `C[${i},${j}]`);
  }
}
assertClose(accepted.matrixEvidence.data.values[0][1], accepted.matrixEvidence.data.values[1][0], 1e-10, 'Maxwell reciprocity');
assert.ok(accepted.matrixEvidence.data.values[0][1] > 0, 'off-diagonal coupling must be physically present');

// A mixed force probe is not a vertical influence coefficient source.
const mixed = forceState(compilation, 'N-000121', 1000, 'TL-C-MIXED', { fx: 25 });
expectCode(() => buildControlledThermalLiftoffInfluenceQualification({
  contactAuthority: contact,
  supportMappings: mappings,
  probePairs: [{ ...probePairs[0], forcedState: mixed }, probePairs[1]],
  source,
  benchmarkReference,
}), 'TL_INFLUENCE_PROBE_COMPONENT_INVALID');

// A self-consistently rehashed CONDITIONAL source execution remains inadmissible.
const conditional = rehashExecutionStatus(probePairs[0].forcedState.execution, 'CONDITIONAL');
expectCode(() => buildControlledThermalLiftoffInfluenceQualification({
  contactAuthority: contact,
  supportMappings: mappings,
  probePairs: [{ ...probePairs[0], forcedState: { loadCase: probePairs[0].forcedState.loadCase, execution: conditional } }, probePairs[1]],
  source,
  benchmarkReference,
}), 'TL_INFLUENCE_EXECUTION_NOT_QUALIFIED');

// Probe results from a changed constrained partition cannot be mixed into one matrix.
const changedCompilation = cantileverWithSettlementSlotCompilation();
const changedState = forceState(changedCompilation, 'N-000122', 1000, 'TL-C-CHANGED-PARTITION');
expectCode(() => buildControlledThermalLiftoffInfluenceQualification({
  contactAuthority: contact,
  supportMappings: mappings,
  probePairs: [probePairs[0], { ...probePairs[1], forcedState: changedState }],
  source,
  benchmarkReference,
}), 'TL_INFLUENCE_STIFFNESS_STATE_MISMATCH');

// A fully rehashed forged source column still fails independent matrix/column re-derivation.
const forged = structuredClone(qualification);
forged.sourceColumns[0].valuesMPerN[1] *= 1.1;
rehashColumn(forged.sourceColumns[0]);
rehashOuter(forged);
requireControlledThermalLiftoffInfluenceQualification(forged);
expectCode(() => requireControlledThermalLiftoffInfluenceQualificationIndependently(forged), 'TL_CONTROLLED_INFLUENCE_MATRIX_COLUMN_MISMATCH');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-controlled-influence',
  status: 'PASS',
  qualificationSchema: accepted.schema,
  matrixRepresentation: accepted.matrixEvidence.representation,
  supportCount: accepted.summary.supportCount,
  sealedUnitForceProbePairs: accepted.summary.probePairCount,
  allCoefficientsMatchClosedFormCantilever: true,
  maxwellReciprocityVerified: true,
  offDiagonalCouplingPresent: true,
  mixedForceProbeRejected: true,
  nonQualifiedExecutionRejected: true,
  changedStiffnessStateRejected: true,
  independentRehashTamperRejected: true,
  sourceSolverExecutedByAdapter: false,
  srcRuntimeDependencyCreated: false,
  qualificationFixtureOnly: true,
  sourceInputsImmutable: true,
}, null, 2));

function forceState(modelCompilation, nodeId, fz, loadCaseId, forceOverrides = {}) {
  const loadCase = tipLoadCase(modelCompilation, {
    loadCaseId,
    primitives: [tipLoadPrimitive({
      primitiveId: `LP-${loadCaseId}`,
      nodeId,
      force: { fx: 0, fy: 0, fz, ...forceOverrides },
      moment: { mx: 0, my: 0, mz: 0 },
    })],
  });
  const execution = compileSolverExecution({
    compilation: modelCompilation,
    elementContributions: contributions,
    loadCase,
    solverProfile: profile,
  });
  assert.equal(execution.status, 'QUALIFIED');
  return { loadCase, execution: sealedRecord(execution) };
}

function cantileverCompliance(x, a, E, I) {
  if (x <= a) return (x ** 2 * (3 * a - x)) / (6 * E * I);
  return (a ** 2 * (3 * x - a)) / (6 * E * I);
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

function rehashColumn(column) {
  const { semanticHash: ignored, ...material } = column;
  void ignored;
  column.semanticHash = semanticHash(material);
}

function rehashOuter(value) {
  const { semanticHash: ignored, ...material } = value;
  void ignored;
  value.semanticHash = semanticHash(material);
}

function contactAuthority() {
  const rows = [
    contactRow('SUP-A', 'SITE-A', 1200),
    contactRow('SUP-B', 'SITE-B', 2400),
  ];
  const material = {
    schema: 'engineering-preproduction-support-contact-authority/v1',
    datasetId: 'CONTROLLED-TL-INFLUENCE-FIXTURE',
    sourceBindings: {
      analysisTopologySemanticHash: semanticHash({ influence: 1 }),
      topologyGraphSemanticHash: semanticHash({ influence: 2 }),
      supportAttachmentModelSemanticHash: semanticHash({ influence: 3 }),
      restraintCapabilityModelSemanticHash: semanticHash({ influence: 4 }),
      effectiveRestraintCapabilityModelSemanticHash: semanticHash({ influence: 5 }),
      supportSiteModelSemanticHash: semanticHash({ influence: 6 }),
      routePartitionModelSemanticHash: semanticHash({ influence: 7 }),
      contactSemanticsSemanticHashes: rows.map((row) => row.contactSemanticsHash).sort(),
    },
    coordinateFrame: {
      basis: 'GLOBAL_XYZ_Z_UP',
      verticalContactDirection: 'GLOBAL_Z_PLUS',
      gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
      gapUnit: 'M',
      routeChainageUnit: 'MM',
    },
    status: 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY',
    rows,
    blockers: [],
    summary: {
      supportCount: rows.length,
      qualifiedAuthorityCount: rows.length,
      tl03ReadyCount: rows.length,
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

function contactRow(supportKey, supportSiteId, routeChainageMm) {
  const material = {
    supportKey,
    supportSiteId,
    routeId: 'ROUTE-CONTROLLED-INFLUENCE',
    routeChainageMm,
    restraintId: `R-${supportSiteId}`,
    attachmentId: `A-${supportSiteId}`,
    attachedComponentKey: `PIPE-${supportSiteId}`,
    sourceRestraintCapabilityHash: semanticHash({ supportSiteId, restraint: true }),
    contactSemanticsHash: semanticHash({ supportSiteId, contact: 'controlled-influence' }),
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
    gapEvidenceHash: semanticHash({ supportSiteId, gap: 0 }),
    restraintStiffnessEvidenceValue: 50000,
    stiffnessEvidenceHash: semanticHash({ supportSiteId, genericK: 50000 }),
    springRateEvidenceHash: semanticHash({ supportSiteId, spring: null }),
    frictionCoefficient: null,
    frictionEvidenceHash: semanticHash({ supportSiteId, friction: null }),
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
  return Object.freeze({ ...material, semanticHash: semanticHash(material) });
}

function sourceIdentity(sourceId) {
  return {
    sourceId,
    sourceRevision: 'REV-A',
    sourceSemanticHash: semanticHash({ sourceId, revision: 'REV-A', controlledInfluence: true }),
    sourceKind: 'SOURCE_SOLVER',
  };
}

function benchmark(benchmarkId) {
  return {
    benchmarkId,
    benchmarkRevision: 'REV-A',
    benchmarkSemanticHash: semanticHash({ benchmarkId, revision: 'REV-A', controlledInfluence: true }),
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
