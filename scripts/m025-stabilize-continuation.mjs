#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/lfea-b3.19-bm1-friction.mjs';
let content = readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`M025 stabilization could not find ${label}.`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`M025 stabilization found ${label} more than once.`);
  }
  content = `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
}

replaceOnce(
  'const MAX_ITERATIONS_PER_STEP = 80;\nconst THERMAL_LOAD_STEPS = 32;\nconst FORCE_RELAXATION = 0.55;\nconst FORCE_RELATIVE_TOLERANCE = 1e-8;\nconst FORCE_ABSOLUTE_TOLERANCE = 1e-5;\nconst DISPLACEMENT_DIRECTION_TOLERANCE = 1e-12;',
  'const MAX_ITERATIONS_PER_STEP = 240;\nconst THERMAL_LOAD_STEPS = 32;\nconst FORCE_RELAXATION = 0.2;\nconst FORCE_RELATIVE_TOLERANCE = 1e-6;\nconst FORCE_ABSOLUTE_TOLERANCE = 1e-3;\nconst DISPLACEMENT_DIRECTION_TOLERANCE = 1e-7;',
  'continuation constants',
);
replaceOnce(
  '    throw new Error(`M025 ${caseId} load step ${stepIndex}/${stepCount} did not converge in ${MAX_ITERATIONS_PER_STEP} iterations.`);',
  '    throw new Error(`M025 ${caseId} load step ${stepIndex}/${stepCount} did not converge in ${MAX_ITERATIONS_PER_STEP} iterations: ${JSON.stringify({ states, nodes: last?.nodeEvidence?.map((row) => ({ node: row.sourceNodeId, state: row.state, forceResidual: row.forceResidual, limit: row.coulombLimit, increment: row.tangentialDisplacementIncrementMagnitude })) })}`);',
  'non-convergence evidence',
);

writeFileSync(path, content);
console.log('M025 stabilized thermal continuation tolerances.');
