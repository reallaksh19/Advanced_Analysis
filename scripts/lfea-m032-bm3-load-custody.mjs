import { compileInputXmlForceMomentPrimitives } from '../src/core/linear-piping-inputxml-force-moment/index.js';
import {
  BM3_SOURCE_ID,
  analyseBaseCase,
  buildBm3Authorities,
} from './lfea-m028-bm3-fixtures.mjs';
import { solveBm3WithProgrammedHangers } from './lfea-m029-bm3-hangers.mjs';

export const M032_CASE_POLICIES = Object.freeze({
  CASE3_OPE: Object.freeze({
    formula: 'W+T1+P1+H',
    temperatureField: 'operatingTemperature',
    thermal: true,
    hangerStiffness: true,
    hangerPreload: true,
    forceMomentVectorNumbers: Object.freeze([]),
    friction: false,
  }),
  CASE4_SUS: Object.freeze({
    formula: 'W+T2+P1+H',
    temperatureField: 'operatingTemperature2',
    thermal: true,
    hangerStiffness: true,
    hangerPreload: true,
    forceMomentVectorNumbers: Object.freeze([]),
    friction: false,
  }),
  CASE5_OCC: Object.freeze({
    formula: 'W+P1+H+F1',
    temperatureField: null,
    thermal: false,
    hangerStiffness: true,
    hangerPreload: true,
    forceMomentVectorNumbers: Object.freeze([1]),
    friction: false,
  }),
  CASE6_NO_FRICTION: Object.freeze({
    formula: 'W+T2+P1+H',
    temperatureField: 'operatingTemperature2',
    thermal: true,
    hangerStiffness: true,
    hangerPreload: true,
    forceMomentVectorNumbers: Object.freeze([]),
    friction: false,
  }),
  CASE7_NO_FRICTION: Object.freeze({
    formula: 'W+P1',
    temperatureField: null,
    thermal: false,
    hangerStiffness: true,
    hangerPreload: false,
    forceMomentVectorNumbers: Object.freeze([]),
    friction: false,
  }),
});

const AB_POLICY = Object.freeze({
  formula: 'W+P1',
  temperatureField: null,
  thermal: false,
  friction: false,
});

export function solveBm3M032LoadCustody() {
  const predecessor = solveBm3WithProgrammedHangers();
  if (predecessor.comparison !== null) {
    throw new Error('M032 requires the M029 physical qualification path, not the stale legacy comparator.');
  }
  const hangerAuthorities = predecessor.solved.hangerDesign.compiledHangers;
  const hangerPreloads = hangerAuthorities.map((authority) => authority.preloadPrimitive);
  const caseAuthorities = predecessor.solved.hangerDesign.caseAuthorities;
  const t1HangerModel = caseAuthorities.CASE3_OPE;
  const t2HangerModel = caseAuthorities.CASE4_SUS;
  const coldHangerModel = caseAuthorities.CASE5_OCC;
  const noHangerModel = buildBm3Authorities({
    modelIdentity: 'BM3-M032-NO-HANGER',
    modelRevision: 1,
  });
  const f1ForHangerModel = compileF1(coldHangerModel, 'M032-HANGER-MODEL-F1');
  const f1ForNoHangerModel = compileF1(noHangerModel, 'M032-NO-HANGER-MODEL-F1');

  const cases = Object.freeze({
    CASE3_OPE: solveCase(t1HangerModel, 'M032_CASE3_OPE', M032_CASE_POLICIES.CASE3_OPE, {
      hangerPreloads,
      f1Compilation: f1ForHangerModel,
    }),
    CASE4_SUS: solveCase(t2HangerModel, 'M032_CASE4_SUS', M032_CASE_POLICIES.CASE4_SUS, {
      hangerPreloads,
      f1Compilation: f1ForHangerModel,
    }),
    CASE5_OCC: solveCase(coldHangerModel, 'M032_CASE5_OCC', M032_CASE_POLICIES.CASE5_OCC, {
      hangerPreloads,
      f1Compilation: f1ForHangerModel,
    }),
    CASE6_NO_FRICTION: solveCase(
      t2HangerModel,
      'M032_CASE6_NO_FRICTION',
      M032_CASE_POLICIES.CASE6_NO_FRICTION,
      { hangerPreloads, f1Compilation: f1ForHangerModel },
    ),
    CASE7_NO_FRICTION: solveCase(
      coldHangerModel,
      'M032_CASE7_NO_FRICTION',
      M032_CASE_POLICIES.CASE7_NO_FRICTION,
      { hangerPreloads: [], f1Compilation: f1ForHangerModel },
    ),
  });

  const controlledStudies = buildControlledStudies({
    hangerModel: coldHangerModel,
    noHangerModel,
    hangerPreloads,
    f1ForHangerModel,
    f1ForNoHangerModel,
  });
  const custody = Object.freeze(Object.fromEntries(Object.entries(cases).map(([caseKey, analysis]) => [
    caseKey,
    auditPhysicalCase({
      caseKey,
      analysis,
      policy: M032_CASE_POLICIES[caseKey],
      elementCount: (caseKey === 'CASE3_OPE' ? t1HangerModel : caseKey === 'CASE4_SUS' || caseKey === 'CASE6_NO_FRICTION' ? t2HangerModel : coldHangerModel).modelEntries.length,
      hangerPrimitiveIds: new Set(hangerPreloads.map((primitive) => primitive.primitiveId)),
      f1PrimitiveIds: new Set(f1ForHangerModel.primitives.map((primitive) => primitive.primitiveId)),
      material: (caseKey === 'CASE3_OPE' ? t1HangerModel : caseKey === 'CASE4_SUS' || caseKey === 'CASE6_NO_FRICTION' ? t2HangerModel : coldHangerModel).material,
    }),
  ])));

  return Object.freeze({
    schema: 'm032-bm3-load-custody-solve/v1',
    sourceSemanticHash: coldHangerModel.source.semanticHash,
    predecessor,
    hangerModel: coldHangerModel,
    noHangerModel,
    hangerAuthorities,
    hangerPreloads: Object.freeze(hangerPreloads),
    declaredForceMoments: f1ForHangerModel,
    cases,
    custody,
    controlledStudies,
    remainingGaps: Object.freeze([]),
  });
}

function compileF1(authorities, primitiveIdPrefix) {
  return compileInputXmlForceMomentPrimitives({
    geometry: authorities.normalized.geometry,
    kernelNodeByReference: authorities.kernelNodeByReference,
    vectorNumbers: [1],
    sourceId: BM3_SOURCE_ID,
    sourceRevision: authorities.source.sourceRevision,
    primitiveIdPrefix,
  });
}

function solveCase(authorities, caseKey, policy, { hangerPreloads, f1Compilation }) {
  const nodalLoads = [
    ...(policy.hangerPreload ? hangerPreloads : []),
    ...(policy.forceMomentVectorNumbers.includes(1) ? f1Compilation.primitives : []),
  ];
  return analyseBaseCase(authorities, caseKey, policy, {
    nodalLoads,
    description: `M032 BM3 ${policy.formula}; hanger stiffness=${policy.hangerStiffness ? 'ON' : 'OFF'}; hanger preload=${policy.hangerPreload ? 'ON' : 'OFF'}; F1=${policy.forceMomentVectorNumbers.includes(1) ? 'ON' : 'OFF'}; friction=OFF.`,
  });
}

function auditPhysicalCase({
  caseKey,
  analysis,
  policy,
  elementCount,
  hangerPrimitiveIds,
  f1PrimitiveIds,
  material,
}) {
  const primitives = analysis.loadCase.primitives;
  const byKind = countBy(primitives, (primitive) => primitive.kind);
  const hangerIds = primitives.filter((primitive) => hangerPrimitiveIds.has(primitive.primitiveId)).map((primitive) => primitive.primitiveId);
  const f1 = primitives.filter((primitive) => f1PrimitiveIds.has(primitive.primitiveId));
  const temperatures = primitives.filter((primitive) => primitive.kind === 'TEMPERATURE');
  const unexpectedNodal = primitives.filter((primitive) => primitive.kind === 'NODAL_FORCE_MOMENT'
    && !hangerPrimitiveIds.has(primitive.primitiveId)
    && !f1PrimitiveIds.has(primitive.primitiveId));
  const expectedF1Count = policy.forceMomentVectorNumbers.includes(1) ? f1PrimitiveIds.size : 0;
  const expectedHangerCount = policy.hangerPreload ? hangerPrimitiveIds.size : 0;

  requireEqual(byKind.DISTRIBUTED_LOAD ?? 0, elementCount, `${caseKey} weight primitive count`);
  requireEqual(byKind.PRESSURE ?? 0, elementCount, `${caseKey} pressure primitive count`);
  requireEqual(temperatures.length, policy.thermal ? elementCount : 0, `${caseKey} temperature primitive count`);
  requireEqual(hangerIds.length, expectedHangerCount, `${caseKey} hanger preload count`);
  requireEqual(f1.length, expectedF1Count, `${caseKey} F1 primitive count`);
  requireEqual(unexpectedNodal.length, 0, `${caseKey} unexpected nodal load count`);
  if (policy.thermal) {
    for (const primitive of temperatures) {
      if (!(primitive.operatingTemperature > primitive.installationTemperature)) {
        throw new Error(`${caseKey} has non-expansive thermal state on ${primitive.elementId}.`);
      }
      requireEqual(
        primitive.stiffnessEvaluationMaterialStateId,
        material.materialState.materialStateId,
        `${caseKey} material-state custody`,
      );
    }
  }

  return Object.freeze({
    caseKey,
    formula: policy.formula,
    physicalLoads: Object.freeze({
      weight: true,
      pressure: true,
      thermal: policy.thermal,
      temperatureField: policy.temperatureField,
      hangerStiffness: policy.hangerStiffness,
      hangerPreload: policy.hangerPreload,
      hangerPreloadPrimitiveCount: hangerIds.length,
      declaredF1PrimitiveCount: f1.length,
      friction: false,
    }),
    primitiveCounts: Object.freeze(byKind),
    f1: Object.freeze(f1.map((primitive) => Object.freeze({
      primitiveId: primitive.primitiveId,
      nodeId: primitive.nodeId,
      basis: primitive.basis.kind,
      force: primitive.force,
      moment: primitive.moment,
    }))),
    thermalState: Object.freeze({
      temperaturePrimitiveCount: temperatures.length,
      installationTemperature: temperatures[0]?.installationTemperature ?? null,
      minimumOperatingTemperature: temperatures.length
        ? Math.min(...temperatures.map((primitive) => primitive.operatingTemperature))
        : null,
      maximumOperatingTemperature: temperatures.length
        ? Math.max(...temperatures.map((primitive) => primitive.operatingTemperature))
        : null,
      stiffnessEvaluationMaterialStateId: material.materialState.materialStateId,
      elasticModulus: material.materialState.elasticModulus,
      thermalExpansionCoefficient: material.materialState.thermalExpansionCoefficient,
      policy: 'COLD_MODULUS_WITH_CASE_SELECTED_UNIFORM_THERMAL_STRAIN_V1',
    }),
    solverQualification: Object.freeze({
      status: analysis.execution.status,
      forceEquilibrium: analysis.execution.diagnostics.forceEquilibrium.status,
      momentEquilibrium: analysis.execution.diagnostics.momentEquilibrium.status,
      normalizedResidual: analysis.execution.diagnostics.residual.value,
    }),
  });
}

function buildControlledStudies({
  hangerModel,
  noHangerModel,
  hangerPreloads,
  f1ForHangerModel,
  f1ForNoHangerModel,
}) {
  const offOff = analyseBaseCase(noHangerModel, 'M032_AB_H0_F0', AB_POLICY, {
    nodalLoads: [],
    description: 'M032 controlled baseline: W+P1, H off, F1 off, friction off.',
  });
  const onOff = analyseBaseCase(hangerModel, 'M032_AB_H1_F0', AB_POLICY, {
    nodalLoads: hangerPreloads,
    description: 'M032 controlled hanger-only variant: W+P1, H on, F1 off, friction off.',
  });
  const offOn = analyseBaseCase(noHangerModel, 'M032_AB_H0_F1', AB_POLICY, {
    nodalLoads: f1ForNoHangerModel.primitives,
    description: 'M032 controlled F1-only variant: W+P1, H off, F1 on, friction off.',
  });
  const onOn = analyseBaseCase(hangerModel, 'M032_AB_H1_F1', AB_POLICY, {
    nodalLoads: [...hangerPreloads, ...f1ForHangerModel.primitives],
    description: 'M032 combined endpoint: W+P1, H on, F1 on, friction off.',
  });
  return Object.freeze({
    design: 'TWO_BY_TWO_HANGER_F1_FACTORIAL_WITH_FRICTION_HELD_OFF',
    solves: Object.freeze({ H0_F0: offOff, H1_F0: onOff, H0_F1: offOn, H1_F1: onOn }),
    effects: Object.freeze({
      hangerAtF1Off: responseDelta(offOff, onOff),
      hangerAtF1On: responseDelta(offOn, onOn),
      f1AtHangerOff: responseDelta(offOff, offOn),
      f1AtHangerOn: responseDelta(onOff, onOn),
      interaction: interactionDelta(offOff, onOff, offOn, onOn),
    }),
  });
}

function responseDelta(reference, variant) {
  const referenceMap = new Map(reference.execution.displacement.map((row) => [`${row.nodeId}:${row.dof}`, row.value]));
  let sumSquares = 0;
  let maximumAbsoluteDelta = 0;
  let maximumIdentity = null;
  for (const row of variant.execution.displacement) {
    const identity = `${row.nodeId}:${row.dof}`;
    const delta = row.value - (referenceMap.get(identity) ?? 0);
    sumSquares += delta ** 2;
    if (Math.abs(delta) > maximumAbsoluteDelta) {
      maximumAbsoluteDelta = Math.abs(delta);
      maximumIdentity = identity;
    }
  }
  return Object.freeze({
    l2DisplacementDelta: Math.sqrt(sumSquares),
    maximumAbsoluteDisplacementDelta: maximumAbsoluteDelta,
    maximumIdentity,
  });
}

function interactionDelta(offOff, onOff, offOn, onOn) {
  const maps = [offOff, onOff, offOn, onOn].map((analysis) => new Map(
    analysis.execution.displacement.map((row) => [`${row.nodeId}:${row.dof}`, row.value]),
  ));
  let sumSquares = 0;
  let maximumAbsoluteInteraction = 0;
  let maximumIdentity = null;
  for (const identity of maps[3].keys()) {
    const value = (maps[3].get(identity) ?? 0)
      - (maps[2].get(identity) ?? 0)
      - (maps[1].get(identity) ?? 0)
      + (maps[0].get(identity) ?? 0);
    sumSquares += value ** 2;
    if (Math.abs(value) > maximumAbsoluteInteraction) {
      maximumAbsoluteInteraction = Math.abs(value);
      maximumIdentity = identity;
    }
  }
  return Object.freeze({
    l2DisplacementInteraction: Math.sqrt(sumSquares),
    maximumAbsoluteInteraction,
    maximumIdentity,
  });
}

function countBy(rows, keyOf) {
  const result = {};
  for (const row of rows) {
    const key = keyOf(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}.`);
}
