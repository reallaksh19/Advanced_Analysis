import { mkdir, readFile, writeFile } from 'node:fs/promises';

const HEAD = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null;
const REPORTS = [
  'reports/qualification/topology-edit-real-user-3d-demo.json',
  'reports/qualification/topology-edit-real-user-xyz.json',
];

const journeys = [];
for (const path of REPORTS) {
  journeys.push(JSON.parse(await readFile(path, 'utf8')));
}

const report = {
  schema: 'TopologyEditR1ExactHeadEvidence.v1',
  status: journeys.every((row) => String(row.status).startsWith('PASS_'))
    ? 'PASS_REAL_USER_REACHABILITY'
    : 'FAIL_REAL_USER_REACHABILITY',
  exactHead: HEAD,
  github: {
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    job: process.env.GITHUB_JOB || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
  },
  gates: {
    productionBackend: 'WEBGL',
    antiCheat: 'PASS_REQUIRED',
    newModuleLineBudget: '<300_PHYSICAL_LINES',
  },
  journeys,
};

await mkdir('reports/qualification', { recursive: true });
await writeFile(
  'reports/qualification/topology-edit-r1-exact-head-evidence.json',
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${report.status} at ${HEAD || 'UNKNOWN_HEAD'}\n`);
if (!report.status.startsWith('PASS_')) process.exitCode = 1;
