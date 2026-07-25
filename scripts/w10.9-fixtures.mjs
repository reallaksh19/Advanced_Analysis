import {
  createModelLoadReadinessAudit,
} from '../src/core/model-loads/index.js';
import {
  createSharedPipingModel,
  deepFreeze,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';
import {
  createWorkspaceConsumerContext,
} from '../src/core/workspace-consumers/index.js';
import { buildBeamFixture } from './w10.6-beam-fixtures.mjs';
import { buildWorkspaceConsumerFixture } from './w10.8-fixtures.mjs';

export function buildW109Context(options = {}) {
  const fixture = buildWorkspaceConsumerFixture({ datasetId: options.datasetId || 'W10.9-FIXTURE' });
  const contracts = { ...fixture.contracts };
  if (options.screening === false) {
    contracts.verticalLoadPathModel = null;
    contracts.supportLoadScreening = null;
    contracts.supportLoadScreeningAudit = null;
  }
  if (options.partialScreening) {
    contracts.supportLoadScreening = null;
    contracts.supportLoadScreeningAudit = null;
  }
  return createWorkspaceConsumerContext({
    datasetId: fixture.contracts.sharedModel.project.datasetId,
    workspaceVersion: options.workspaceVersion ?? 1,
    selectedEntityId: options.selectedEntityId || 'COMP-1',
    contracts,
  });
}

export function buildAllPrimitiveContext(options = {}) {
  const datasetId = options.datasetId || 'W10.9-ALL-PRIMITIVES';
  const fixture = buildBeamFixture({
    datasetId,
    lengthsM: [2, 2],
    loads: allCases([
      { type: 'DISTRIBUTED', componentKey: 'COMP-1', forcePerLengthNM: 100 },
      { type: 'POINT', componentKey: 'COMP-2', stationM: 3, forceN: 50 },
      { type: 'MOMENT', componentKey: 'COMP-2', stationM: 3, momentNm: 25 },
    ]),
    blockedComponentsByCase: options.blockedCase ? { [options.blockedCase]: ['COMP-2'] } : {},
  });
  const primitiveSet = withTraceEvidence(fixture.loadFoundation.loadPrimitiveSet);
  const readinessAudit = createModelLoadReadinessAudit(fixture.loadFoundation.loadCaseSet, primitiveSet);
  const sharedModel = options.nullGeometry ? withNullGeometry(fixture.sharedModel) : fixture.sharedModel;
  return createWorkspaceConsumerContext({
    datasetId,
    workspaceVersion: 1,
    selectedEntityId: 'COMP-1',
    contracts: {
      sharedModel,
      loadCaseSet: fixture.loadFoundation.loadCaseSet,
      loadPrimitiveSet: primitiveSet,
      modelLoadReadinessAudit: readinessAudit,
    },
  });
}

export function stalePrimitiveContext() {
  const context = buildAllPrimitiveContext();
  const primitive = structuredClone(context.contracts.loadPrimitiveSet);
  primitive.loadCaseSetSemanticHash = 'fnv1a64:stale';
  const { semanticHash: _hash, ...base } = primitive;
  const stale = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  return createWorkspaceConsumerContext({
    datasetId: context.datasetId,
    workspaceVersion: 2,
    contracts: {
      sharedModel: context.contracts.sharedModel,
      loadCaseSet: context.contracts.loadCaseSet,
      loadPrimitiveSet: stale,
      modelLoadReadinessAudit: context.contracts.modelLoadReadinessAudit,
    },
  });
}

function withTraceEvidence(source) {
  const value = structuredClone(source);
  value.primitives = value.primitives.map((row) => {
    if (row.primitiveType === 'DISTRIBUTED_GRAVITY_LOAD') {
      return {
        ...row,
        massSourceBreakdown: [{ source: 'FIXTURE_PIPE_METAL', massPerLengthKgM: row.massPerLengthKgM }],
        formulaTrace: [{ formulaId: 'MASS_TO_WEIGHT_FORCE_V1', result: row.forcePerLengthNM }],
      };
    }
    if (row.primitiveType === 'POINT_GRAVITY_LOAD') {
      return { ...row, formulaTrace: [{ formulaId: 'MASS_TO_WEIGHT_FORCE_V1', result: row.pointForceN }] };
    }
    return row;
  });
  value.summary = primitiveSummary(value.primitives);
  const { semanticHash: _hash, ...base } = value;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function withNullGeometry(source) {
  const input = structuredClone(source);
  input.components[0].geometry.start = null;
  input.components[0].geometry.end = null;
  input.components[0].geometry.center = null;
  return createSharedPipingModel(input);
}

function primitiveSummary(rows) {
  return {
    primitiveCount: rows.length,
    distributedPrimitiveCount: rows.filter((row) => row.primitiveType === 'DISTRIBUTED_GRAVITY_LOAD').length,
    pointPrimitiveCount: rows.filter((row) => row.primitiveType === 'POINT_GRAVITY_LOAD').length,
    explicitMomentCount: rows.filter((row) => row.primitiveType === 'EXPLICIT_POINT_MOMENT').length,
  };
}
function allCases(rows) {
  return { EMPTY: structuredClone(rows), OPE: structuredClone(rows), HYD: structuredClone(rows) };
}
