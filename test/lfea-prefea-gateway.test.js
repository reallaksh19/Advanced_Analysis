import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
  assertSerializable,
  makeFinding,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-contract.js';
import {
  diagnoseInputXmlLinearPreFea,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-diagnostics.js';
import {
  prepareInputXmlLinearPreFea,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-preparation.js';
import {
  authorizeInputXmlLinearSolve,
  requireInputXmlLinearSolveAuthorization,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-authorization.js';
import { solveInputXmlLinearAnalysis } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-governed-solve.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XML = `<PIPINGMODEL JOBNAME="PF1">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106-B">
    <RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`;

function acceptedAnalysisRequest(content = XML) {
  return Object.freeze({
    inputXmlSource: Object.freeze({
      content,
      fileName: 'pf1.xml',
      semanticHash: 'SRC-SEMANTIC',
      contentHash: 'SRC-CONTENT',
    }),
    ingestionOptions: Object.freeze({
      unit: 'mm',
      source: 'PF1',
      componentOrigins: Object.freeze({}),
      restraintTypeCodeMap: Object.freeze({ 1: 'ANCHOR' }),
      restraintTypeMutation: Object.freeze({ enabled: false, rows: Object.freeze([]) }),
      bendRadiusTolerance: Object.freeze({ value: 0.001 }),
    }),
    conditioning: Object.freeze({}),
    sourceAnalysisRequest: Object.freeze({}),
  });
}

function request({ cases = ['PF1-W'], profile = 'STRICT_INPUTXML_LINEAR_STATIC_V1' } = {}) {
  return Object.freeze({
    schema: INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
    analysisRequest: Object.freeze({ opaque: 'validated-by-production-authority' }),
    requestedProfileId: profile,
    requestedCaseIds: Object.freeze(cases),
  });
}

function diagnostic({
  cases = ['PF1-W'],
  profile = 'STRICT_INPUTXML_LINEAR_STATIC_V1',
  capabilityStatus = 'PASS',
  capabilityLimitations = [],
  findings = [],
  content = XML,
} = {}) {
  let parseCount = 0;
  const result = diagnoseInputXmlLinearPreFea(request({ cases, profile }), {
    validateSourceRequest: () => acceptedAnalysisRequest(content),
    parseSource: (xml, options) => {
      parseCount += 1;
      return defaultParse(xml, options);
    },
    diagnoseTopology: () => Object.freeze({ findings: Object.freeze([]) }),
    diagnoseProximity: () => Object.freeze({ findings: Object.freeze([]) }),
    diagnoseRepresentability: () => Object.freeze({
      findings: Object.freeze(findings),
      capabilities: Object.freeze([Object.freeze({
        capabilityId: 'LINEAR_STRUCTURAL_MODEL',
        status: capabilityStatus,
        findingIds: Object.freeze([]),
        limitationCodes: Object.freeze(capabilityLimitations),
      })]),
    }),
  });
  assert.equal(parseCount, 1);
  return result;
}

let parserPromise;
async function parser() {
  parserPromise ??= import('../src/core/linear-piping-analysis-consumer/inputxml-source-binding.js');
  return parserPromise;
}
function defaultParse(xml, options) {
  // The parser module has no asynchronous work; import completion is forced by top-level fixture setup below.
  return globalThis.__PF1_PARSE_SOURCE__(xml, options);
}

const parserModule = await parser();
globalThis.__PF1_PARSE_SOURCE__ = parserModule.parseInputXmlModelHealthSource;

function authorityStubs({
  availableCases = ['PF1-W'],
  preflightStatus = 'PASS',
  preflightFindings = [],
  authorityError = null,
  callLedger = null,
  loadRevision = 'LOAD-A',
  stiffnessRevision = 'STIFF-A',
  modelRevision = 'MODEL-A',
} = {}) {
  const ledger = callLedger ?? [];
  return {
    prepareAuthorities: () => {
      ledger.push('authority');
      if (authorityError) throw authorityError;
      return Object.freeze({
        semanticHash: 'AUTH-SEM', evidenceHash: 'AUTH-EVID', limitations: Object.freeze([]),
        summary: Object.freeze({ materialResolutionCount: 1, sectionResolutionCount: 1, rigidAuthorityCount: 0 }),
      });
    },
    compileStructure: () => {
      ledger.push('structure');
      return Object.freeze({
        semanticHash: 'STRUCT-SEM', evidenceHash: 'STRUCT-EVID', limitations: Object.freeze([]),
        compilation: Object.freeze({ mechanicalModelSemanticHash: modelRevision }),
        summary: Object.freeze({ mechanicalModelSemanticHash: modelRevision, constraintCount: 6 }),
      });
    },
    compilePhysicalCases: () => {
      ledger.push('loads');
      const physicalCases = availableCases.map((caseId) => Object.freeze({
        caseId,
        caseRole: caseId.endsWith('-W') ? 'WEIGHT_BASE' : 'OPERATING',
        primitiveIds: Object.freeze([`${caseId}-P1`]),
        loadCase: Object.freeze({
          semanticHash: `${loadRevision}-${caseId}`,
          physicalLoadCaseHash: `PHYSICAL-${loadRevision}-${caseId}`,
        }),
      }));
      return Object.freeze({
        semanticHash: `PHYS-${loadRevision}`, evidenceHash: `PHYS-EVID-${loadRevision}`,
        physicalCases: Object.freeze(physicalCases), loadLedger: Object.freeze([]), limitations: Object.freeze([]),
        summary: Object.freeze({ physicalCaseCount: physicalCases.length }),
      });
    },
    preflightStiffness: () => {
      ledger.push('preflight');
      return Object.freeze({
        semanticHash: `PREFLIGHT-${stiffnessRevision}`,
        evidenceHash: `PREFLIGHT-EVID-${stiffnessRevision}`,
        status: preflightStatus,
        stiffnessStateHash: stiffnessRevision,
        genericPreflight: Object.freeze({
          findings: Object.freeze(preflightFindings),
          components: Object.freeze([]),
          assembly: Object.freeze({ partitionIdentity: 'FREE-PARTITION-A' }),
          factorization: Object.freeze({ kind: 'CHOLESKY', conditionEstimate: 100 }),
        }),
        summary: Object.freeze({ freeDofCount: 6, constrainedDofCount: 6, conditionEstimate: 100 }),
      });
    },
    ledger,
  };
}

function preparation(options = {}) {
  const diagnostics = options.diagnostics ?? diagnostic(options.diagnosticOptions);
  const stubs = authorityStubs(options);
  const prepared = prepareInputXmlLinearPreFea(diagnostics, stubs);
  return { diagnostics, prepared, stubs };
}

function approval(prepared, overrides = {}) {
  const warnings = prepared.findings.filter((row) => row.disposition === 'CONDITIONAL');
  return {
    authorizationSource: 'ENGINEERING_REVIEW',
    authorizationRevision: '1',
    approverIdentity: 'reviewer@example.invalid',
    reason: 'Reviewed retained findings and accepted the disclosed limitations.',
    limitationsAccepted: [...new Set([...prepared.limitations, ...warnings.map((row) => row.code)])].sort(),
    authorizedPhysicalCaseIds: [...prepared.requestedCaseIds],
    warningFindingIds: warnings.map((row) => row.findingId).sort(),
    invalidationPolicy: 'INVALIDATE_ON_PARENT_IDENTITY_CHANGE',
    expiration: null,
    ...overrides,
  };
}

function codedError(code, message = code, data = {}) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  return error;
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

const cases = [
  ['PF-01 valid exact anchored model passes', () => {
    const { prepared } = preparation();
    assert.equal(prepared.status, 'PASS');
    assert.equal(authorizeInputXmlLinearSolve(prepared).preparationStatus, 'PASS');
  }],
  ['PF-02 malformed request blocks before parsing', () => {
    let parsed = false;
    expectCode(() => diagnoseInputXmlLinearPreFea({ schema: 'bad' }, {
      validateSourceRequest: () => { throw new Error('unreachable'); },
      parseSource: () => { parsed = true; },
    }), 'PREFEA_REQUEST_KEYS_INVALID');
    assert.equal(parsed, false);
  }],
  ['PF-03 invalid geometry blocks before conditioning', () => {
    const finding = { code: 'ZERO_LENGTH_SEGMENT', severity: 'ERROR', disposition: 'BLOCK', message: 'zero', data: { segmentId: 'IX-S1' } };
    const d = diagnostic({ findings: [finding] });
    assert.equal(d.status, 'BLOCK');
    const ledger = [];
    const p = prepareInputXmlLinearPreFea(d, authorityStubs({ callLedger: ledger }));
    assert.equal(p.status, 'BLOCK'); assert.deepEqual(ledger, []);
  }],
  ['PF-04 duplicate span or intersection blocks', () => {
    const d = diagnostic({ findings: [{ code: 'DUPLICATE_SPAN', severity: 'ERROR', disposition: 'BLOCK', message: 'duplicate' }] });
    assert.equal(d.status, 'BLOCK');
  }],
  ['PF-05 unsupported active component blocks', () => {
    assert.equal(diagnostic({ capabilityStatus: 'BLOCK' }).status, 'BLOCK');
  }],
  ['PF-06 missing material or section blocks', () => {
    const ledger = [];
    const { prepared } = preparation({ authorityError: codedError('MATERIAL_ELASTIC_MODULUS_MISSING'), callLedger: ledger });
    assert.equal(prepared.status, 'BLOCK'); assert.deepEqual(ledger, ['authority']);
  }],
  ['PF-07 unresolved thermal authority blocks operating only', () => {
    assert.equal(preparation({ diagnosticOptions: { cases: ['PF1-W'] }, availableCases: ['PF1-W'] }).prepared.status, 'PASS');
    assert.equal(preparation({ diagnosticOptions: { cases: ['PF1-WT'] }, availableCases: ['PF1-W'] }).prepared.status, 'BLOCK');
  }],
  ['PF-08 duplicate restraint DOF blocks before compiler collapse', () => {
    const ledger = [];
    const { prepared } = preparation({ authorityError: codedError('DUPLICATE_CONSTRAINT_DOF'), callLedger: ledger });
    assert.equal(prepared.status, 'BLOCK'); assert.deepEqual(ledger, ['authority']);
  }],
  ['PF-09 unsupported gap friction finite-stiffness restraint blocks', () => {
    for (const code of ['RESTRAINT_GAP_UNSUPPORTED', 'RESTRAINT_FRICTION_UNSUPPORTED', 'RESTRAINT_FINITE_STIFFNESS_UNSUPPORTED']) {
      assert.equal(preparation({ authorityError: codedError(code) }).prepared.status, 'BLOCK');
    }
  }],
  ['PF-10 inactive and sentinel loads remain visible but create no primitive', () => {
    const { prepared } = preparation();
    assert.equal(prepared.authorizedCaseCandidates[0].primitiveIds.length, 1);
    assert.equal(prepared.physicalPreparation.loadLedger.length, 0);
  }],
  ['PF-11 pressure remains structurally isolated', () => {
    const d = diagnostic({ capabilityStatus: 'WARN', capabilityLimitations: ['GENERIC_APPROX_PRESSURE_CODE_ONLY'] });
    const { prepared } = preparation({ diagnostics: d });
    assert.equal(prepared.status, 'WARN');
    assert.equal(prepared.stiffnessStateHash, 'STIFF-A');
  }],
  ['PF-12 incomplete physical-case authority blocks', () => {
    assert.equal(preparation({ diagnosticOptions: { cases: ['PF1-W', 'PF1-WT'] }, availableCases: ['PF1-W'] }).prepared.status, 'BLOCK');
  }],
  ['PF-13 floating component blocks at mechanism preflight', () => {
    const finding = { code: 'FLOATING_STRUCTURAL_COMPONENT', disposition: 'BLOCK', componentIds: ['COMP-B'], message: 'floating' };
    const { prepared } = preparation({ preflightStatus: 'BLOCK', preflightFindings: [finding] });
    assert.equal(prepared.status, 'BLOCK');
    assert.ok(prepared.findings.some((row) => row.canonicalEntityIds.includes('COMP-B')));
  }],
  ['PF-14 rank deficiency and indefiniteness retain distinct failure codes', () => {
    for (const code of ['STIFFNESS_RANK_DEFICIENT', 'STIFFNESS_INDEFINITE']) {
      const { prepared } = preparation({ preflightStatus: 'BLOCK', preflightFindings: [{ code, disposition: 'BLOCK', message: code }] });
      assert.ok(prepared.findings.some((row) => row.code === code));
    }
  }],
  ['PF-15 conditioning warning requires sealed authorization', () => {
    const { prepared } = preparation({ preflightStatus: 'WARN' });
    assert.equal(prepared.status, 'WARN');
    expectCode(() => authorizeInputXmlLinearSolve(prepared), 'PREFEA_AUTHORIZATION_RECORD_REQUIRED');
    assert.equal(authorizeInputXmlLinearSolve(prepared, approval(prepared)).preparationStatus, 'WARN');
  }],
  ['PF-16 BLOCK cannot be overridden', () => {
    const { prepared } = preparation({ authorityError: codedError('SECTION_INVALID') });
    expectCode(() => authorizeInputXmlLinearSolve(prepared, approval(prepared)), 'PREFEA_BLOCK_OVERRIDE_PROHIBITED');
  }],
  ['PF-17 authorization is case-subset specific', () => {
    const { prepared } = preparation({ diagnosticOptions: { cases: ['PF1-W', 'PF1-WT'] }, availableCases: ['PF1-W', 'PF1-WT'] });
    const auth = authorizeInputXmlLinearSolve(prepared, approval(prepared, { authorizedPhysicalCaseIds: ['PF1-W'] }));
    expectCode(() => requireInputXmlLinearSolveAuthorization(auth, prepared, ['PF1-WT']), 'PREFEA_AUTHORIZATION_CASE_NOT_AUTHORIZED');
  }],
  ['PF-18 source load support profile changes stale authorization', () => {
    const { prepared } = preparation();
    const auth = authorizeInputXmlLinearSolve(prepared);
    const changedParents = [
      preparation({ diagnosticOptions: { content: XML.replace('DELTA_X="1000"', 'DELTA_X="1001"') } }).prepared,
      preparation({ loadRevision: 'LOAD-B' }).prepared,
      preparation({ stiffnessRevision: 'STIFF-B' }).prepared,
      preparation({ modelRevision: 'MODEL-B' }).prepared,
      preparation({ diagnosticOptions: { profile: 'DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_V1' } }).prepared,
    ];
    for (const changed of changedParents) {
      expectCode(() => requireInputXmlLinearSolveAuthorization(auth, changed), 'PREFEA_AUTHORIZATION_STALE');
    }
  }],
  ['PF-19 deterministic ordering and hashes', () => {
    const a = makeFinding({ code: 'X', category: 'SOURCE', severity: 'ERROR', disposition: 'BLOCK', capabilityEffects: ['B', 'A'], sourceFeatureIds: ['2', '1'], sourcePaths: [], canonicalEntityIds: [], physicalCaseIds: [], message: 'first', technicalBasis: 'basis', evidence: { b: 2, a: 1 }, remediation: 'fix', approximationEligible: false, authorizationRequired: false });
    const b = makeFinding({ ...a, findingId: undefined, message: 'different text', capabilityEffects: ['A', 'B'], sourceFeatureIds: ['1', '2'], evidence: { a: 1, b: 2 } });
    assert.equal(a.findingId, b.findingId);
  }],
  ['PF-20 clone tamper and cross-model substitution rejection', () => {
    const { prepared } = preparation(); const auth = authorizeInputXmlLinearSolve(prepared);
    const tampered = structuredClone(auth); tampered.reason = 'changed';
    expectCode(() => requireInputXmlLinearSolveAuthorization(tampered, prepared), 'PREFEA_RECORD_TAMPERED');
  }],
  ['PF-21 serialized reports contain no runtime state', () => {
    const { prepared } = preparation(); const auth = authorizeInputXmlLinearSolve(prepared);
    assert.doesNotThrow(() => assertSerializable(JSON.parse(JSON.stringify({ prepared, auth }))));
    expectCode(() => assertSerializable({ matrix: [[1]] }), 'PREFEA_RUNTIME_STATE_PROHIBITED');
  }],
  ['PF-22 every public InputXML solve path requires authorization', () => {
    const index = fs.readFileSync(path.join(ROOT, 'src/core/linear-piping-analysis-consumer/index.js'), 'utf8');
    assert.match(index, /solveInputXmlLinearAnalysis/u);
    assert.doesNotMatch(index, /runLinearPipingAnalysisFromInputXml/u);
  }],
  ['PF-23 legacy gateway bypass attempt fails', async () => {
    const legacy = await import('../src/core/linear-piping-analysis-consumer/generic-inputxml-solve.js');
    expectCode(() => legacy.solveInputXmlGeneric(XML), 'PREFEA_SOLVE_AUTHORIZATION_REQUIRED');
  }],
  ['PF-24 no equation or default changes', () => {
    const governed = fs.readFileSync(path.join(ROOT, 'src/core/linear-piping-analysis-consumer/inputxml-linear-governed-solve.js'), 'utf8');
    assert.doesNotMatch(governed, /elasticModulus|thermalStrain|distributedLoad|stiffnessMatrix/iu);
    assert.match(governed, /executeAuthorizedCases/u);
  }],
];

for (const [name, fn] of cases) test(name, fn);

test('Exercise G wrong or partial WARN authorization is rejected', () => {
  const { prepared } = preparation({ preflightStatus: 'WARN' });
  const partial = approval(prepared, { limitationsAccepted: [] });
  expectCode(() => authorizeInputXmlLinearSolve(prepared, partial), 'PREFEA_AUTHORIZATION_LIMITATION_SET_MISMATCH');
});

test('Exercise H finding and semantic hash tamper are rejected', () => {
  const { prepared } = preparation({ preflightStatus: 'WARN' });
  const auth = authorizeInputXmlLinearSolve(prepared, approval(prepared));
  for (const mutation of [
    (row) => { row.warningFindingIds = []; },
    (row) => { row.semanticHash = '0'.repeat(64); },
  ]) {
    const clone = structuredClone(auth); mutation(clone);
    expectCode(() => requireInputXmlLinearSolveAuthorization(clone, prepared), 'PREFEA_RECORD_TAMPERED');
  }
});

test('solver runtime is created only after complete authorization validation', () => {
  const { prepared } = preparation();
  let runtimeCreated = false;
  expectCode(() => solveInputXmlLinearAnalysis(prepared, null, {
    executeAuthorizedCases: () => { runtimeCreated = true; },
  }), 'PREFEA_OBJECT_REQUIRED');
  assert.equal(runtimeCreated, false);
  const auth = authorizeInputXmlLinearSolve(prepared);
  const result = solveInputXmlLinearAnalysis(prepared, auth, {
    executeAuthorizedCases: ({ requestedCaseIds }) => { runtimeCreated = true; return requestedCaseIds; },
  });
  assert.equal(runtimeCreated, true);
  assert.deepEqual(result, ['PF1-W']);
});
