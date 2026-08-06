import assert from 'node:assert/strict';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';
import { diagnoseInputXmlLinearModelHealthContext } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { prepareInputXmlLinearStructure } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-structural-preparation.js';
import { requireInputXmlLinearStructuralPreparation } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-structural-preparation-contract.js';

console.log('\n--- LFEA InputXML structural preparation check ---');

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
    `<PIPINGMODEL xmlns="" JOBNAME="PREP" NUMELT="${elements.length}" NUMBEND="${counts.bends ?? 0}" NUMRIGID="${counts.rigids ?? 0}" NUMREST="${counts.restraints ?? 0}">`,
    UNITS,
    ...elements,
    '</PIPINGMODEL></CAESARII>',
  ].join('');
}

function element(request) {
  const materialNumber = request.materialNumber ?? 106;
  const modulus = request.modulus ?? 200000;
  const temperature = request.temperature === undefined ? '' : `TEMP_EXP_C1="${request.temperature}"`;
  return `<PIPINGELEMENT FROM_NODE="${request.from}" TO_NODE="${request.to}" DELTA_X="${request.dx}" DELTA_Y="${request.dy ?? 0}" DELTA_Z="${request.dz ?? 0}" DIAMETER="${request.diameter ?? 100}" WALL_THICK="${request.wall ?? 5}" MATERIAL_NAME="M${materialNumber}" MATERIAL_NUM="${materialNumber}" MODULUS="${modulus}" POISSONS="0.3" PIPE_DENSITY="7850" ${temperature}>${request.inner ?? ''}</PIPINGELEMENT>`;
}

function context(xml) {
  return diagnoseInputXmlLinearModelHealthContext(xml, { fileName: 'preparation.xml' });
}

function capability(report, id) {
  return report.capabilities.find((row) => row.capabilityId === id);
}

test('MH-PR4A-01', 'strict preparation binds distinct materials per source element', () => {
  const health = context(model([
    element({ from: 10, to: 20, dx: 1000, materialNumber: 106, modulus: 200000 }),
    element({ from: 20, to: 30, dx: 1000, materialNumber: 360, modulus: 190000 }),
  ]));
  assert.equal(capability(health.report, 'STRICT_LINEAR_STATIC').status, 'PASS');
  assert.equal(health.report.findings.some((row) => row.code === 'MODEL_PER_ELEMENT_MATERIAL_BINDING_REQUIRED'), false);
  const prepared = prepareInputXmlLinearStructure(health, STRICT, { modelId: 'MIXED' });
  assert.equal(prepared.schema, 'fea-inputxml-linear-structural-preparation/v1');
  assert.equal(prepared.summary.elementCount, 2);
  assert.equal(prepared.summary.materialStateCount, 2);
  assert.equal(new Set(prepared.materialBindings.map((row) => row.materialStateId)).size, 2);
  assert.equal(prepared.compilation.model.elements.length, 2);
});

test('MH-PR4A-02', 'anchors and axis-aligned bilateral restraints compile from retained source custody', () => {
  const inner = [
    '<RESTRAINT NODE="10" TYPE="0" STIFFNESS="-1.0101"/>',
    '<RESTRAINT NODE="20" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" STIFFNESS="-1.0101"/>',
  ].join('');
  const health = context(model([element({ from: 10, to: 20, dx: 1000, inner })], { restraints: 2 }));
  const prepared = prepareInputXmlLinearStructure(health, STRICT, { modelId: 'CONSTRAINTS' });
  assert.equal(prepared.constraintBindings.length, 2);
  assert.equal(prepared.constraintDeclarations.length, 7);
  assert.ok(prepared.constraintDeclarations.some((row) => row.nodeId === 'CONSTRAINTS.N20' && row.dof === 'UX'));
  assert.ok(prepared.constraintBindings.every((row) => row.implementation === 'IMPLEMENTED_EXACTLY'));
});

test('MH-PR4A-03', 'approximate preparation compiles only diagnosed bend and unilateral substitutions', () => {
  const inner = [
    '<BEND RADIUS="300"/>',
    '<RESTRAINT NODE="10" TYPE="17" XCOSINE="0" YCOSINE="1" ZCOSINE="0" STIFFNESS="-1.0101"/>',
  ].join('');
  const health = context(model([element({ from: 10, to: 20, dx: 1000, inner })], { bends: 1, restraints: 1 }));
  assert.throws(
    () => prepareInputXmlLinearStructure(health, STRICT, { modelId: 'STRICT-BLOCK' }),
    (error) => error.code === 'INPUTXML_PREPARATION_PROFILE_CAPABILITY_BLOCKED',
  );
  const prepared = prepareInputXmlLinearStructure(health, APPROXIMATE, { modelId: 'APPROX' });
  assert.equal(prepared.profileCapabilityStatus, 'CONDITIONAL');
  assert.ok(prepared.limitations.includes('GENERIC_APPROX_BEND_STRAIGHT_CHORD'));
  assert.ok(prepared.limitations.includes('GENERIC_APPROX_UNILATERAL_LINEARIZED'));
  assert.equal(prepared.summary.approximatedComponentCount, 1);
  assert.equal(prepared.summary.approximatedConstraintCount, 1);
});

test('MH-PR4A-04', 'unsupported gap mechanics block preparation instead of being omitted', () => {
  const inner = '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" GAP="2"/>';
  const health = context(model([element({ from: 10, to: 20, dx: 1000, inner })], { restraints: 1 }));
  assert.equal(capability(health.report, 'APPROXIMATE_LINEAR_STATIC').status, 'BLOCK');
  assert.throws(
    () => prepareInputXmlLinearStructure(health, APPROXIMATE, { modelId: 'GAP' }),
    (error) => error.code === 'INPUTXML_PREPARATION_PROFILE_CAPABILITY_BLOCKED',
  );
});

test('MH-PR4A-05', 'unresolved thermal alpha blocks operating authority but not sustained structural compilation', () => {
  const health = context(model([
    element({ from: 10, to: 20, dx: 1000, materialNumber: 999, temperature: 100 }),
  ]));
  assert.equal(capability(health.report, 'STRICT_LINEAR_STATIC').status, 'PASS');
  assert.equal(capability(health.report, 'THERMAL_AUTHORITY').status, 'BLOCK');
  assert.ok(health.report.findings.some((row) => row.code === 'MODEL_THERMAL_EXPANSION_AUTHORITY_UNRESOLVED'));
  const prepared = prepareInputXmlLinearStructure(health, STRICT, { modelId: 'NO-ALPHA' });
  assert.equal(prepared.thermalAuthoritySummary.operatingMaterialAuthorityReady, false);
  assert.deepEqual(prepared.thermalAuthoritySummary.unresolvedSegmentIds, ['IX-S1']);
  assert.equal(prepared.materialResolutions[0].materialState.thermalExpansionCoefficient, 0);
  assert.equal(prepared.thermalAuthoritySummary.placeholderUsage, 'NONTHERMAL_MODEL_COMPILATION_ONLY');
});

test('MH-PR4A-06', 'qualified rigid source compiles a distinct stiffness section and authority', () => {
  const inner = '<RIGID TYPE="VALVE" WEIGHT="100"/>';
  const health = context(model([element({ from: 10, to: 20, dx: 1000, inner })], { rigids: 1 }));
  const prepared = prepareInputXmlLinearStructure(health, STRICT, { modelId: 'RIGID' });
  assert.equal(prepared.summary.rigidAuthorityCount, 1);
  assert.equal(prepared.componentBindings[0].componentKind, 'RIGID');
  assert.ok(prepared.componentBindings[0].rigidAuthoritySemanticHash);
  assert.notEqual(
    prepared.sectionBindings[0].physicalSectionStateId,
    prepared.sectionBindings[0].analysisSectionStateId,
  );
});

test('MH-PR4A-07', 'preparation is deterministic, tamper-evident and context-bound', () => {
  const health = context(model([element({ from: 10, to: 20, dx: 1000 })]));
  const first = prepareInputXmlLinearStructure(health, STRICT, { modelId: 'IDENTITY' });
  const second = prepareInputXmlLinearStructure(health, STRICT, { modelId: 'IDENTITY' });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(first.evidenceHash, second.evidenceHash);
  requireInputXmlLinearStructuralPreparation(first, health);
  const tampered = structuredClone(first);
  tampered.summary.elementCount = 9;
  assert.throws(() => requireInputXmlLinearStructuralPreparation(tampered), /semantic hash mismatch/u);
  const other = context(model([element({ from: 10, to: 20, dx: 999 })]));
  assert.throws(() => requireInputXmlLinearStructuralPreparation(first, other), /stale/u);
});

test('MH-PR4A-08', 'preparation consumes the retained context and rejects unsupported profiles', () => {
  const health = context(model([element({ from: 10, to: 20, dx: 1000 })]));
  const prepared = prepareInputXmlLinearStructure(health, STRICT, {});
  assert.equal(prepared.sourceBundleSemanticHash, health.sourceBundle.semanticHash);
  assert.equal(prepared.modelHealthSemanticHash, health.report.semanticHash);
  assert.throws(
    () => prepareInputXmlLinearStructure(health, 'UNDECLARED_PROFILE', {}),
    (error) => error.code === 'INPUTXML_PREPARATION_PROFILE_UNSUPPORTED',
  );
});

console.log('LFEA InputXML structural preparation check PASS.');
