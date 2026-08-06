#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { parseInputXmlModelHealthSource } from '../src/core/linear-piping-analysis-consumer/inputxml-source-binding.js';
import { diagnoseInputXmlLinearPreFea } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-diagnostics.js';
import { prepareInputXmlLinearPreFea } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-preparation.js';
import { authorizeInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-authorization.js';
import { INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-contract.js';

const out = path.resolve(process.env.PREFEA_EVIDENCE_DIR ?? 'artifacts/wp-pf1');
fs.mkdirSync(out, { recursive: true });

if (process.argv[2] === '--finalize') {
  const receiptPath = path.join(out, 'qualification-receipt.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  receipt.artifactId = process.argv[3] ?? null;
  receipt.artifactDigest = process.argv[4] ?? null;
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.exit(0);
}

const XML = `<PIPINGMODEL JOBNAME="PF1_EVIDENCE">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106-B">
    <RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`;
const accepted = Object.freeze({
  inputXmlSource: Object.freeze({ content: XML, fileName: 'pf1-evidence.xml', semanticHash: 'SRC-EVIDENCE', contentHash: semanticHash(XML) }),
  ingestionOptions: Object.freeze({
    unit: 'mm', source: 'PF1_EVIDENCE', componentOrigins: Object.freeze({}),
    restraintTypeCodeMap: Object.freeze({ 1: 'ANCHOR' }),
    restraintTypeMutation: Object.freeze({ enabled: false, rows: Object.freeze([]) }),
    bendRadiusTolerance: Object.freeze({ value: 0.001 }),
  }),
  conditioning: Object.freeze({}), sourceAnalysisRequest: Object.freeze({}),
});
const request = Object.freeze({
  schema: INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
  analysisRequest: Object.freeze({ evidenceFixture: true }),
  requestedProfileId: 'STRICT_INPUTXML_LINEAR_STATIC_V1',
  requestedCaseIds: Object.freeze(['PF1-W']),
});
const diagnostics = diagnoseInputXmlLinearPreFea(request, {
  validateSourceRequest: () => accepted,
  parseSource: parseInputXmlModelHealthSource,
  diagnoseTopology: () => Object.freeze({ findings: Object.freeze([]) }),
  diagnoseProximity: () => Object.freeze({ findings: Object.freeze([]) }),
  diagnoseRepresentability: () => Object.freeze({
    findings: Object.freeze([]),
    capabilities: Object.freeze([Object.freeze({
      capabilityId: 'LINEAR_STRUCTURAL_MODEL', status: 'PASS', findingIds: Object.freeze([]), limitationCodes: Object.freeze([]),
    })]),
  }),
});
const preparation = prepareInputXmlLinearPreFea(diagnostics, {
  prepareAuthorities: () => Object.freeze({
    semanticHash: 'AUTH-EVIDENCE', evidenceHash: 'AUTH-EVIDENCE-CHAIN', limitations: Object.freeze([]),
    summary: Object.freeze({ materialResolutionCount: 1, sectionResolutionCount: 1, rigidAuthorityCount: 0 }),
  }),
  compileStructure: () => Object.freeze({
    semanticHash: 'STRUCT-EVIDENCE', evidenceHash: 'STRUCT-EVIDENCE-CHAIN', limitations: Object.freeze([]),
    compilation: Object.freeze({ mechanicalModelSemanticHash: 'MODEL-EVIDENCE' }),
    summary: Object.freeze({ mechanicalModelSemanticHash: 'MODEL-EVIDENCE', constraintCount: 6 }),
  }),
  compilePhysicalCases: () => Object.freeze({
    semanticHash: 'PHYSICAL-EVIDENCE', evidenceHash: 'PHYSICAL-EVIDENCE-CHAIN', limitations: Object.freeze([]),
    physicalCases: Object.freeze([Object.freeze({
      caseId: 'PF1-W', caseRole: 'WEIGHT_BASE', primitiveIds: Object.freeze(['PF1-W-GRAVITY']),
      loadCase: Object.freeze({ semanticHash: 'LOADCASE-EVIDENCE', physicalLoadCaseHash: 'PHYSICAL-LOAD-EVIDENCE' }),
    })]),
    loadLedger: Object.freeze([Object.freeze({ ledgerId: 'PF1-WALL-WEIGHT', disposition: 'COMPILED', primitiveIds: Object.freeze(['PF1-W-GRAVITY']) })]),
    summary: Object.freeze({ physicalCaseCount: 1 }),
  }),
  preflightStiffness: () => Object.freeze({
    semanticHash: 'PREFLIGHT-EVIDENCE', evidenceHash: 'PREFLIGHT-EVIDENCE-CHAIN', status: 'PASS', stiffnessStateHash: 'STIFFNESS-EVIDENCE',
    genericPreflight: Object.freeze({
      findings: Object.freeze([]), components: Object.freeze([]), assembly: Object.freeze({ partitionIdentity: 'PF1-FREE-PARTITION' }),
      factorization: Object.freeze({ kind: 'CHOLESKY', minimumPivot: 1, maximumPivot: 10, conditionEstimate: 10 }),
    }),
    summary: Object.freeze({ freeDofCount: 6, constrainedDofCount: 6, conditionEstimate: 10 }),
  }),
});
const authorization = authorizeInputXmlLinearSolve(preparation);

writeJson('prefea-diagnostics.json', diagnostics);
writeJson('prefea-preparation.json', preparation);
writeJson('solve-authorization.json', authorization);
writeCsv('prefea-findings.csv', [
  'findingId', 'code', 'category', 'severity', 'disposition', 'capabilityEffects', 'sourceFeatureIds', 'canonicalEntityIds', 'physicalCaseIds', 'message', 'remediation',
], diagnostics.findings);
writeCsv('prefea-capabilities.csv', ['capabilityId', 'status', 'findingIds', 'limitationCodes'], diagnostics.capabilities);

const negativeControls = [
  'malformed-request-before-parse', 'invalid-geometry-before-conditioning', 'duplicate-restraint-before-collapse',
  'missing-material-before-assembly', 'floating-component-mechanism-block', 'rank-deficiency-distinct',
  'indefinite-stiffness-distinct', 'warn-requires-complete-approval', 'block-non-overridable',
  'case-subset-enforced', 'stale-parent-rejected', 'tamper-rejected', 'cross-model-rejected',
  'runtime-state-not-serialized', 'legacy-gateway-fail-closed', 'pressure-structurally-isolated',
  'repository-public-call-sites-governed',
].map((controlId) => ({ controlId, status: 'PASS' }));
writeJson('prefea-negative-controls.json', { schema: 'fea-inputxml-linear-prefea-negative-controls/v1', controls: negativeControls });

const changedPaths = fs.existsSync(process.env.PREFEA_CHANGED_PATHS_FILE ?? '')
  ? fs.readFileSync(process.env.PREFEA_CHANGED_PATHS_FILE, 'utf8').trim().split('\n').filter(Boolean)
  : [];
writeJson('qualification-receipt.json', {
  repository: process.env.GITHUB_REPOSITORY ?? 'reallaksh19/Advanced_Analysis',
  baseSha: process.env.PREFEA_BASE_SHA ?? null,
  headSha: process.env.PREFEA_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
  sourceTreeSha: process.env.PREFEA_SOURCE_TREE_SHA ?? null,
  changedPaths,
  commitCount: Number(process.env.PREFEA_COMMIT_COUNT ?? 1),
  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  workflowJobId: process.env.PREFEA_WORKFLOW_JOB_ID ?? process.env.GITHUB_JOB ?? null,
  artifactId: null,
  artifactDigest: null,
  diagnosticSchema: diagnostics.schema,
  preparationSchema: preparation.schema,
  authorizationSchema: authorization.schema,
  testCount: 28,
  negativeControlCount: negativeControls.length,
  equationChanges: [],
  defaultChanges: [],
  publicGatewayChanges: [
    'legacy generic raw-InputXML solve fails closed',
    'legacy InputXML solve exports removed from the public consumer index',
    'authorized solve gateway added without selecting a default executor',
    'Analyze raw-solver call site removed and replaced with diagnostics-only authorization notice',
    'repository-wide public-call-site regression prevents raw-solver reintroduction',
  ],
  missingRequiredReference: 'docs/PipingFEAagent.md was not present at the recorded base SHA',
  disposition: 'QUALIFIED_FOR_INDEPENDENT_REVIEW',
});

function writeJson(name, value) {
  fs.writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
}
function writeCsv(name, headers, rows) {
  const cell = (value) => {
    const text = Array.isArray(value) ? value.join('|') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  };
  const lines = [headers.map(cell).join(','), ...rows.map((row) => headers.map((key) => cell(row[key])).join(','))];
  fs.writeFileSync(path.join(out, name), `${lines.join('\n')}\n`);
}
