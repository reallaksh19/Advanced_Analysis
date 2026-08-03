import assert from 'node:assert/strict';
import {
  AUTHORIZED_EMPIRICAL_LOAD_INPUT_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_PROJECTION_SCHEMA,
  compileAuthorizedEmpiricalLoadInput,
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
  COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA,
  COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedConsumerHandoff,
  createCommonEnrichedConsumerProjectionDescriptor,
  createCommonEnrichedConsumerProjectionPayload,
  createCommonEnrichedPropertiesCandidate,
  createCommonEnrichedTargetRecord,
  evaluateCommonEnrichedConsumerReadiness,
  orchestrateCommonEnrichedPublication,
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const FIELD_SCHEMA = 'common-enriched-properties-field/v1';
const SOURCE_HASH = 'e'.repeat(64);
const SOURCE_BINDING = {
  schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  sourceKey: 'LINE_LIST:lineList',
  sourceHash: SOURCE_HASH,
  snapshotSemanticHash: semanticHash({ snapshot: 'EMPIRICAL-INPUT-P14' }),
};
const LINE_FIELDS = [
  ['fluid.hydroDensityKgM3', 'hydroFluidDensityKgM3'],
  ['insulation.code', 'insulationCode'],
  ['insulation.densityKgM3', 'insulationDensityKgM3'],
  ['insulation.thicknessMm', 'insulationThicknessMm'],
  ['material.code', 'materialCode'],
  ['material.densityKgM3', 'materialDensityKgM3'],
  ['fluid.operatingDensityKgM3', 'operatingFluidDensityKgM3'],
  ['pipe.outsideDiameterMm', 'outsideDiameterMm'],
  ['pipe.wallThicknessMm', 'wallThicknessMm'],
];
const COMPONENT_FIELDS = [
  ['component.catalogKey', 'catalogKey'],
  ['component.weightKg', 'weightKg'],
];
const BASE_LINE = {
  targetId: 'LINE:S100', sourceRecordId: 'S100', lineKey: 'S100',
  hydroFluidDensityKgM3: 1000, insulationCode: 'INS-HOT',
  insulationDensityKgM3: 160, insulationThicknessMm: 50,
  materialCode: 'A106-B', materialDensityKgM3: 7850,
  operatingFluidDensityKgM3: 998, outsideDiameterMm: 114.3,
  wallThicknessMm: 6.02,
};
const BASE_COMPONENT = {
  targetId: 'COMPONENT:C1', sourceRecordId: 'C1', lineKey: 'S100',
  catalogKey: 'ELBOW-100-CS', weightKg: 12.5,
};

const chain = buildChain([BASE_LINE], [BASE_COMPONENT]);
const request = {
  schema: AUTHORIZED_EMPIRICAL_LOAD_INPUT_REQUEST_SCHEMA,
  intakeId: 'EMPIRICAL-INTAKE-P14',
  handoff: chain.handoff,
  projectionPayload: chain.payload,
};
const first = compileAuthorizedEmpiricalLoadInput(request);
const second = compileAuthorizedEmpiricalLoadInput(request);
assert.deepEqual(first, second);
assert.deepEqual(requireAuthorizedEmpiricalLoadInput(first), first);
assert.ok(Object.isFrozen(first));
assert.deepEqual(first.loadCalculationOverlay.pipeSectionProperties, {
  S100: {
    outsideDiameterMm: 114.3,
    wallThicknessMm: 6.02,
    materialCode: 'A106-B',
    insulationCode: 'INS-HOT',
    insulationThicknessMm: 50,
  },
});
assert.deepEqual(first.loadCalculationOverlay.materialDensitiesKgPerM3, { 'A106-B': 7850 });
assert.deepEqual(first.loadCalculationOverlay.componentWeightsKg, { 'ELBOW-100-CS': 12.5 });
assert.deepEqual(first.summary, {
  lineCount: 1, componentCount: 1, materialCodeCount: 1,
  insulationCodeCount: 1, componentCatalogCount: 1,
});

const denied = buildChain([BASE_LINE], [BASE_COMPONENT], 'DENY');
expectCode(() => compileAuthorizedEmpiricalLoadInput({ ...request, handoff: denied.handoff, projectionPayload: denied.payload }), 'EMPIRICAL_INPUT_HANDOFF_NOT_AUTHORIZED');

const duplicate = buildChain([BASE_LINE, { ...BASE_LINE, targetId: 'LINE:S100-B', sourceRecordId: 'S100-B' }], [BASE_COMPONENT]);
expectCode(() => compileAuthorizedEmpiricalLoadInput({ ...request, handoff: duplicate.handoff, projectionPayload: duplicate.payload }), 'EMPIRICAL_INPUT_DUPLICATE_LINE_KEY');

const conflict = buildChain([BASE_LINE, { ...BASE_LINE, targetId: 'LINE:S200', sourceRecordId: 'S200', lineKey: 'S200', materialDensityKgM3: 8000 }], [BASE_COMPONENT]);
expectCode(() => compileAuthorizedEmpiricalLoadInput({ ...request, handoff: conflict.handoff, projectionPayload: conflict.payload }), 'EMPIRICAL_INPUT_MATERIAL_DENSITY_CONFLICT');

const other = buildChain([{ ...BASE_LINE, operatingFluidDensityKgM3: 997 }], [BASE_COMPONENT]);
expectCode(() => compileAuthorizedEmpiricalLoadInput({ ...request, projectionPayload: other.payload }), 'EMPIRICAL_INPUT_PAYLOAD_BINDING_MISMATCH');

const tampered = {
  ...first,
  loadCalculationOverlay: { ...first.loadCalculationOverlay, componentWeightsKg: { 'ELBOW-100-CS': 99 } },
};
expectCode(() => requireAuthorizedEmpiricalLoadInput({
  ...tampered,
  semanticHash: computeAuthorizedEmpiricalLoadInputSemanticHash(tampered),
}), 'EMPIRICAL_INPUT_HASH_MISMATCH');

console.log('PASS authorized empirical-load input adapter checks');
console.log(JSON.stringify({
  baselineSemanticHash: first.baselineSemanticHash,
  projectionPayloadSemanticHash: first.projectionPayloadSemanticHash,
  handoffSemanticHash: first.handoffSemanticHash,
  overlaySemanticHash: first.overlaySemanticHash,
  intakeSemanticHash: first.semanticHash,
  summary: first.summary,
}, null, 2));

function buildChain(lines, components, handoffDecision = 'AUTHORIZE') {
  const modelHash = semanticHash({ lines, components, handoffDecision });
  const targets = [
    ...components.map((row) => componentRecord(row, modelHash)),
    ...lines.map((row) => lineRecord(row, modelHash)),
  ].sort((a, b) => ascii(a.targetId, b.targetId));
  const candidate = createCommonEnrichedPropertiesCandidate({
    schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
    candidateId: `CAND-${semanticHash({ lines, components }).slice(-8)}`,
    projectId: 'PROJECT-EMPIRICAL-P14', revision: 1,
    createdAt: '2026-08-03T00:20:00.000Z',
    status: COMMON_ENRICHED_CANDIDATE_STATUS,
    sourceModelHash: modelHash, sourceSnapshots: [SOURCE_BINDING],
    targetRecords: targets,
    reviewLedgerHash: semanticHash({ review: lines, components }),
  });
  const baseline = orchestrateCommonEnrichedPublication({
    schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
    transactionId: `PUB-${candidate.candidateId}`, candidate,
    decision: {
      schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
      decisionId: `DEC-PUB-${candidate.candidateId}`,
      candidateSemanticHash: candidate.semanticHash, decision: 'APPROVE',
      authorityId: 'AUTHORITY:ENGINEERING', decidedAt: '2026-08-03T00:21:00.000Z',
      evidenceHash: candidate.reviewLedgerHash,
    },
    previousBaseline: null,
    publicationIdentity: { baselineId: `BASE-${candidate.candidateId}`, publishedAt: '2026-08-03T00:22:00.000Z' },
  }).baseline;
  const requirements = [
    ...LINE_FIELDS.map(([field]) => requirement('LINE', field)),
    ...COMPONENT_FIELDS.map(([field]) => requirement('COMPONENT', field)),
  ].sort((a, b) => ascii(a.requirementId, b.requirementId));
  const configurationHash = semanticHash({ consumer: 'EMPIRICAL_LOADS', requirements });
  const evaluation = evaluateCommonEnrichedConsumerReadiness({
    schema: COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
    evaluationId: `READY-${candidate.candidateId}`,
    baseline, currentSourceModelHash: modelHash, currentSourceSnapshots: [SOURCE_BINDING],
    policies: [
      policy('EMPIRICAL_LOADS', true, requirements, configurationHash),
      policy('ENRICHED_STAGED_JSON_EXPORT', false, []),
      policy('LFEA_HANDOFF', false, []),
    ],
  });
  const readiness = evaluation.readiness.find((row) => row.consumer === 'EMPIRICAL_LOADS');
  const payload = createCommonEnrichedConsumerProjectionPayload({
    schema: COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA,
    payloadId: `PAYLOAD-${candidate.candidateId}`,
    baseline, readinessEvaluation: evaluation,
    policy: {
      schema: COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA,
      consumer: 'EMPIRICAL_LOADS', payloadSchema: AUTHORIZED_EMPIRICAL_LOAD_PROJECTION_SCHEMA,
      adapterVersion: readiness.adapterVersion, configurationHash: readiness.configurationHash,
      fields: [
        ...LINE_FIELDS.map(([sourceField, outputField]) => projection(outputField, 'LINE', sourceField)),
        ...COMPONENT_FIELDS.map(([sourceField, outputField]) => projection(outputField, 'COMPONENT', sourceField)),
      ].sort((a, b) => ascii(a.outputField, b.outputField)),
    },
    createdAt: '2026-08-03T00:23:00.000Z',
  });
  const handoff = createCommonEnrichedConsumerHandoff({
    schema: COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
    handoffId: `HANDOFF-${candidate.candidateId}`, consumer: 'EMPIRICAL_LOADS',
    baseline, readinessEvaluation: evaluation,
    payload: createCommonEnrichedConsumerProjectionDescriptor(payload),
    decision: {
      schema: COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
      decisionId: `DEC-HANDOFF-${candidate.candidateId}`,
      consumer: 'EMPIRICAL_LOADS', baselineSemanticHash: baseline.semanticHash,
      readinessSemanticHash: readiness.semanticHash, payloadSemanticHash: payload.semanticHash,
      decision: handoffDecision, authorityId: 'AUTHORITY:EMPIRICAL-GATEKEEPER',
      decidedAt: '2026-08-03T00:24:00.000Z', evidenceHash: semanticHash({ handoffDecision, payload: payload.semanticHash }),
    },
  });
  return { payload, handoff };
}

function lineRecord(row, modelHash) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA, targetId: row.targetId,
    targetKind: 'LINE', sourceModelHash: modelHash, sourceRecordId: row.sourceRecordId,
    lineKey: row.lineKey,
    fields: [
      field('fluid.hydroDensityKgM3', row.hydroFluidDensityKgM3, 'kg/m3'),
      field('insulation.code', row.insulationCode, null),
      field('insulation.densityKgM3', row.insulationDensityKgM3, 'kg/m3'),
      field('insulation.thicknessMm', row.insulationThicknessMm, 'mm'),
      field('material.code', row.materialCode, null),
      field('material.densityKgM3', row.materialDensityKgM3, 'kg/m3'),
      field('fluid.operatingDensityKgM3', row.operatingFluidDensityKgM3, 'kg/m3'),
      field('pipe.outsideDiameterMm', row.outsideDiameterMm, 'mm'),
      field('pipe.wallThicknessMm', row.wallThicknessMm, 'mm'),
    ].sort((a, b) => ascii(a.field, b.field)),
  });
}
function componentRecord(row, modelHash) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA, targetId: row.targetId,
    targetKind: 'COMPONENT', sourceModelHash: modelHash, sourceRecordId: row.sourceRecordId,
    lineKey: row.lineKey,
    fields: [field('component.catalogKey', row.catalogKey, null), field('component.weightKg', row.weightKg, 'kg')],
  });
}
function field(name, value, unit) { return { schema: FIELD_SCHEMA, field: name, value, unit, status: 'RESOLVED_EXACT', sourceKind: 'LINE_LIST', sourceKey: 'LINE_LIST:SOURCE', sourceHash: SOURCE_HASH, locator: `FIELD:${name}`, matchMethod: 'EXACT_KEY', confidence: 1, policyId: null, policyHash: null, reviewEventId: null, approved: true, diagnostics: [] }; }
function policy(consumer, configured, requirements, configurationHash = semanticHash({ consumer, configured, requirements })) { return { schema: COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA, consumer, configured, adapterVersion: '1.0.0', configurationHash, requirements }; }
function requirement(targetKind, fieldName) { return { schema: COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA, requirementId: `${targetKind}:${fieldName}`, targetKind, field: fieldName, allowNotApplicable: false }; }
function projection(outputField, targetKind, sourceField) { return { schema: COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA, outputField, targetKind, sourceField, allowNotApplicable: false }; }
function expectCode(fn, code) { assert.throws(fn, (error) => { assert.equal(error?.code, code); return true; }); }
function ascii(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
