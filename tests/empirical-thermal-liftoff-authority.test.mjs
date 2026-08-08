import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  THERMAL_LIFTOFF_AUTHORITY,
  THERMAL_LIFTOFF_BLOCKER_CODES,
  createThermalLiftoffSupportContactAuthority,
  requireThermalLiftoffAuthority,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-authority.js';
import {
  createThermalFreeExpansionEvidence,
  createThermalLiftoffUsedDisplacement,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-displacement-intake.js';
import {
  createThermalLiftoffApplicabilityBinding,
  createThermalLiftoffStiffnessEntry,
  createThermalLiftoffStiffnessRegistry,
  resolveThermalLiftoffLocalStiffness,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-stiffness-registry.js';

function source(sourceId) {
  return {
    sourceId,
    sourceRevision: '1',
    sourceSemanticHash: semanticHash({ sourceId }),
  };
}

function coordinateFrame() {
  const payload = { basis: 'GLOBAL_Z_UP', verticalUnitVector: { x: 0, y: 0, z: 1 } };
  return { ...payload, semanticHash: semanticHash(payload) };
}

function applicability() {
  return createThermalLiftoffApplicabilityBinding({
    classId: 'TL-A',
    templateId: 'LOCAL:S-1',
    templateRevision: '1',
    geometrySemanticHash: semanticHash({ geometry: 'S-1' }),
    supportCapabilitySemanticHash: semanticHash({ capability: 'S-1' }),
    linePropertySemanticHash: semanticHash({ line: 'L-1' }),
    coordinateFrameSemanticHash: coordinateFrame().semanticHash,
  });
}

test('TL-00 frozen authority fixes Z-up reaction/gap conventions and denies production capabilities', () => {
  const validated = requireThermalLiftoffAuthority(THERMAL_LIFTOFF_AUTHORITY);
  assert.equal(validated.coordinateFrame.sourceAxisBasis, 'GLOBAL_Z_UP');
  assert.deepEqual(validated.coordinateFrame.verticalUnitVector, [0, 0, 1]);
  assert.equal(validated.reactionConvention, 'POSITIVE_UPWARD_OPPOSING_GRAVITY');
  assert.equal(validated.gapConvention, 'POSITIVE_OPEN_PIPE_TO_SUPPORT');
  assert.equal(validated.capabilities.redistribution, false);
  assert.equal(validated.capabilities.activeSetSolve, false);
  assert.equal(validated.restrictions.registrationPermitted, false);
});

test('TL-00 detects mismatched cold-gap sign/reference as unresolved evidence', () => {
  const contact = createThermalLiftoffSupportContactAuthority({
    supportSiteId: 'S-1',
    routeChainageMm: 1000,
    capability: 'UNILATERAL_REST',
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    coldGapM: 0,
    gapConvention: 'POSITIVE_CLOSING_SUPPORT_TO_PIPE',
    tensileReactionPermitted: false,
    initialState: 'CONTACTING',
    source: source('CONTACT:S-1'),
  });
  assert.equal(contact.qualification, 'UNRESOLVED');
  assert(contact.blockers.some((row) => row.code === THERMAL_LIFTOFF_BLOCKER_CODES.GAP_REFERENCE_MISMATCH));
});

test('TL-01 preserves alpha*DeltaT*L only as free-expansion evidence', () => {
  const evidence = createThermalFreeExpansionEvidence({
    evidenceId: 'FREE:AUTHORITY',
    referenceTemperatureC: 20,
    analysisTemperatureC: 120,
    thermalExpansionPerK: 12e-6,
    activeLengthM: 10,
    source: source('FREE-EXPANSION'),
  });
  assert.equal(evidence.evidenceKind, 'FREE_EXPANSION_ONLY');
  assert.equal(evidence.tl03Eligibility, 'EVIDENCE_ONLY');
  assert.equal(Object.hasOwn(evidence, 'usedUpwardRelativeDisplacementM'), false);
});

test('TL-01 computes upward pipe-to-support movement only in governed global Z and blocks horizontal ambiguity', () => {
  const blocked = createThermalLiftoffUsedDisplacement({
    displacementId: 'D:1',
    loadCaseId: 'OPE',
    supportSiteId: 'S-1',
    coordinateFrame: coordinateFrame(),
    pipeDisplacementM: { x: 0.001, y: 0, z: 0.002 },
    supportDisplacementM: { x: 0, y: 0, z: 0.0005 },
    provenance: 'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
    source: source('DISP:S-1'),
    mappingEvidence: null,
    horizontalComponentAuthority: null,
  });
  assert.deepEqual(blocked.relativeDisplacementM, { x: 0.001, y: 0, z: 0.0015 });
  assert.equal(blocked.qualification, 'UNRESOLVED');
  assert.equal(blocked.usedUpwardRelativeDisplacementM, null);
  assert(blocked.blockers.some((row) => row.code === THERMAL_LIFTOFF_BLOCKER_CODES.HORIZONTAL_COMPONENT_UNQUALIFIED));
});

test('TL-02 binds qualified local stiffness to exact applicability evidence and rejects copied use', () => {
  const binding = applicability();
  const entry = createThermalLiftoffStiffnessEntry({
    entryId: 'K:S-1',
    supportSiteId: 'S-1',
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { kind: 'SCALAR', effectiveVerticalStiffnessNPerM: 1000 },
    units: 'N_PER_M',
    ordering: ['S-1'],
    sourceKind: 'BENCHMARKED_TEMPLATE',
    source: source('K:S-1'),
    benchmarkReference: {
      benchmarkId: 'K-BENCH:S-1',
      benchmarkRevision: '1',
      benchmarkSemanticHash: semanticHash({ benchmark: 'K:S-1' }),
    },
    applicability: binding,
    qualification: 'QUALIFIED',
  });
  const registry = createThermalLiftoffStiffnessRegistry({ registryId: 'K:REGISTRY', entries: [entry] });
  assert.equal(resolveThermalLiftoffLocalStiffness({
    registry,
    supportSiteId: 'S-1',
    applicability: binding,
  }).status, 'QUALIFIED');

  const other = createThermalLiftoffApplicabilityBinding({
    classId: 'TL-A',
    templateId: 'LOCAL:S-1:OTHER',
    templateRevision: '1',
    geometrySemanticHash: semanticHash({ geometry: 'DIFFERENT' }),
    supportCapabilitySemanticHash: semanticHash({ capability: 'S-1' }),
    linePropertySemanticHash: semanticHash({ line: 'L-1' }),
    coordinateFrameSemanticHash: coordinateFrame().semanticHash,
  });
  const resolution = resolveThermalLiftoffLocalStiffness({
    registry,
    supportSiteId: 'S-1',
    applicability: other,
  });
  assert.equal(resolution.status, 'UNRESOLVED');
  assert(resolution.blockers.some((row) => row.code === THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_APPLICABILITY_MISMATCH));
});
