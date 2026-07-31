#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  validateExternalReleaseEvidence,
} from './lfea-piping-external-release-evidence-check.mjs';
import {
  validateInternalReleaseEvidence,
} from './lfea-piping-internal-release-evidence-check.mjs';
import {
  evaluateReleaseReadiness,
  loadReleaseEvidence,
  parseReleaseInvocation,
} from './lfea-piping-release-orchestrator.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const invocation = parseReleaseInvocation(process.argv.slice(2), process.cwd());
  const source = loadReleaseEvidence(invocation);
  const result = await evaluateReleaseReadiness({
    root: source.root,
    evidence: source.evidence,
    releaseMode: invocation.releaseMode,
    expectedHead: invocation.expectedHead,
    validators: {
      external: validateExternalReleaseEvidence,
      internal: validateInternalReleaseEvidence,
    },
    policyRunner: runPolicyChecks,
  });
  console.log(JSON.stringify(result));
}

async function runPolicyChecks() {
  await import('./linear-piping-project-qualification-check.mjs');
  await import('./linear-piping-project-qualification-anti-drift-check.mjs');
  await import('./lfea-piping-phase6c-anti-drift-check.mjs');
  await import('./lfea-piping-phase6d-anti-drift-check.mjs');
  await import('./lfea-piping-phase6e-anti-drift-check.mjs');
}
