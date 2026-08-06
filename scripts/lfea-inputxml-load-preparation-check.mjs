import assert from 'node:assert/strict';
import {
  diagnoseInputXmlLinearModelHealthContext,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import {
  prepareInputXmlLinearSolve,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation.js';
import {
  requireInputXmlLinearSolvePreparation,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation-contract.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';

console.log('\n--- LFEA InputXML load and physical-case preparation check ---');

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

const UNITS = [
  '<UNITS>',
  '<LENGTH LABEL="MM" FACTOR="25.4"/>',
  '<FORCE LABEL="N" FACTOR="4.4482216152605"/>',
  '<MOMENT-INPUT LABEL="NM" FACTOR="0.1129848290276167"/>',
  '<EMOD LABEL="MPA" FACTOR="0.006894757293168"/>',
  '<PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/>',
  '<TEMP LABEL="C" FACTOR="0.5555555555555556"/>',
  '<PDENS LABEL="KG/M3" FACTOR="27679.9047102"/>',
  '<IDENS LABEL="KG/M3" FACTOR="27679.9047102"/>',
  '<FDENS LABEL="KG/M3" FACTOR="27679.9047102"/>',
  '</UNITS>',
].join('');

function model(elements, counts = {}) {
  return [
    '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input">',
    `<PIPINGMODEL xmlns="" JOBNAME="MH4B" NUMELT="${counts.elements ?? elements.length}" NUMBEND="${counts.bends ?? 0}" NUMRIGID="${counts.rigids ?? 0}" NUMREST="${counts.restraints ?? 0}">`,
    UNITS,
    ...elements,
    '</PIPINGMODEL></CAESARII>',
  ].join('');
}

function element(from, to, dx, inner = '', fields = '') {
  return `<PIPINGELEMENT FROM_NODE="${from}" TO_NODE="${to}" DELTA_X="${dx}" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" ${fields}>${inner}</PIPINGELEMENT>`;
}

function physicalCase(preparation, role) {
  return preparation.physicalCases.find((row) => row.caseRole === role);
}

function primitive(caseRecord, kind) {
  return caseRecord.loadCase.primitives.find((row) => row.kind === kind);
}

test('MH-PR4B-01', 'clean strict preparation retains exact self-weight custody', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), {});
  const preparation = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B1' });
  assert.equal(preparation.summary.physicalCaseCount, 1);
  assert.equal(preparation.physicalCases[0].caseRole, 'WEIGHT_BASE');
  const load = primitive(preparation.physicalCases[0], 'DISTRIBUTED_LOAD');
  assert.ok(load);
  const section = preparation.structuralPreparation.sectionResolutions[0];
  const expected = 7850 * section.sectionState.area * 9.80665;
  assert.ok(Math.abs(Math.abs(load.startIntensity.fy) - expected) <= expected * 1e-12);
  assert.equal(preparation.loadLedger.filter((row) => row.sourceKind === 'PIPE_WALL')[0].disposition, 'COMPILED');
  assert.equal(preparation.executionAvailability.solveExecution, 'NOT_AUTHORIZED');
});

test('MH-PR4B-02', 'pressure remains strict-blocked and is retained code-only in approximation', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, '', 'PRESSURE1="2"')]),
    {},
  );
  assert.throws(() => prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B2S' }));
  const preparation = prepareInputXmlLinearSolve(context, APPROXIMATE, { modelId: 'PR4B2A' });
  const pressureCase = physicalCase(preparation, 'WEIGHT_PRESSURE');
  const pressure = primitive(pressureCase, 'PRESSURE');
  assert.equal(pressure.pressure, 2e6);
  assert.deepEqual(pressure.authorizedEffects, {
    codeStress: true,
    pressureStiffening: false,
    axialThrust: false,
    bourdon: false,
  });
  assert.ok(preparation.limitations.includes('GENERIC_APPROX_PRESSURE_CODE_ONLY'));
});

test('MH-PR4B-03', 'resolved temperature authority produces a bound operating physical case', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, '', 'TEMP_EXP_C1="100"')]),
    {},
  );
  const preparation = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B3' });
  const operating = physicalCase(preparation, 'WEIGHT_TEMPERATURE');
  const temperature = primitive(operating, 'TEMPERATURE');
  assert.equal(temperature.operatingTemperature, 373.15);
  assert.equal(temperature.installationTemperature, 293.15);
  assert.equal(
    temperature.stiffnessEvaluationMaterialStateId,
    preparation.structuralPreparation.materialBindings[0].materialStateId,
  );
});

test('MH-PR4B-04', 'multiple retained material states stay bound per element in one temperature set', () => {
  const second = '<PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="80" WALL_THICK="4" MATERIAL_NAME="A334" MATERIAL_NUM="360" MODULUS="190000" POISSONS="0.3" PIPE_DENSITY="7800" TEMP_EXP_C1="120"/>';
  const context = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000, '', 'TEMP_EXP_C1="100"'),
    second,
  ]), {});
  const preparation = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B4' });
  const temperatures = physicalCase(preparation, 'WEIGHT_TEMPERATURE').loadCase.primitives
    .filter((row) => row.kind === 'TEMPERATURE');
  assert.equal(temperatures.length, 2);
  assert.equal(new Set(temperatures.map((row) => row.stiffnessEvaluationMaterialStateId)).size, 2);
});

test('MH-PR4B-05', 'inactive pressure sentinels remain ledgered and create no pressure case', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, '', 'PRESSURE1="-1.0101"')]),
    {},
  );
  const preparation = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B5' });
  assert.equal(physicalCase(preparation, 'WEIGHT_PRESSURE'), undefined);
  const pressureRows = preparation.loadLedger.filter((row) => row.sourceKind === 'PRESSURE');
  assert.equal(pressureRows.length, 1);
  assert.equal(pressureRows[0].disposition, 'INACTIVE');
  assert.deepEqual(pressureRows[0].primitiveIds, []);
});

test('MH-PR4B-06', 'rigid self-weight consumes the qualified rigid total-line-weight authority', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, '<RIGID WEIGHT="100"/>')], { rigids: 1 }),
    {},
  );
  const preparation = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B6' });
  const rigid = preparation.structuralPreparation.rigidAuthorities[0];
  const load = primitive(preparation.physicalCases[0], 'DISTRIBUTED_LOAD');
  assert.ok(Math.abs(Math.abs(load.startIntensity.fy) - rigid.gravity.totalLineWeight) <= 1e-12);
  const ledger = preparation.loadLedger.find((row) => row.sourceKind === 'RIGID_WEIGHT');
  assert.equal(ledger.evidence.rigidAuthoritySemanticHash, rigid.semanticHash);
  assert.equal(preparation.loadLedger.some((row) => row.sourceKind === 'PIPE_WALL'), false);
});

test('MH-PR4B-07', 'unsupported active load mechanics still fail before physical-case preparation', () => {
  const force = '<FORCESMOMENTS NODE_NUM="20" FORCMNT_NUM="1"><VECTOR NUMBER="1" FX="100" FY="0" FZ="0" MX="0" MY="0" MZ="0"/></FORCESMOMENTS>';
  const context = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, force)]), {});
  assert.equal(context.report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.throws(() => prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B7' }));
});

test('MH-PR4B-08', 'solve preparation is deterministic, tamper-evident and stale-context rejected', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), {});
  const first = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B8' });
  const second = prepareInputXmlLinearSolve(context, STRICT, {
    modelId: 'PR4B8',
    structuralPreparation: first.structuralPreparation,
  });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(first.evidenceHash, second.evidenceHash);
  requireInputXmlLinearSolvePreparation(first, context);
  assert.throws(() => requireInputXmlLinearSolvePreparation({
    ...first,
    summary: { ...first.summary, physicalCaseCount: 99 },
  }));
  const other = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 999)]), {});
  assert.throws(() => requireInputXmlLinearSolvePreparation(first, other));
});

test('MH-PR4B-09', 'gravity direction changes load identity without changing structural identity', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), {});
  const downward = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PR4B9' });
  const axial = prepareInputXmlLinearSolve(context, STRICT, {
    structuralPreparation: downward.structuralPreparation,
    gravityDirection: { x: 0, y: 0, z: -1 },
  });
  assert.equal(downward.structuralPreparationSemanticHash, axial.structuralPreparationSemanticHash);
  assert.notEqual(downward.semanticHash, axial.semanticHash);
  assert.equal(primitive(axial.physicalCases[0], 'DISTRIBUTED_LOAD').startIntensity.fz < 0, true);
});

console.log('LFEA InputXML load and physical-case preparation check PASS.');