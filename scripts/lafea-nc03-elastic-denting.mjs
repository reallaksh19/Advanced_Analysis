import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, fileHash, semanticHash, SOLVER_DIGEST, writeJson } from './nc01-shell/common.mjs';
import { BENCHMARK_IDS } from './nc03-denting/config.mjs';
import { runDentBenchmarks } from './nc03-denting/benchmarks.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const m=/^--([^=]+)=(.*)$/u.exec(arg);if(!m)throw new TypeError(`Invalid argument ${arg}`);return[m[1],m[2]];}));
const solver=resolve(required('solver')),exactHeadSha=required('head-sha'),root=resolve(args['output-root']??'artifacts/nc03-real');
if(!/^[0-9a-f]{40}$/u.test(exactHeadSha))throw new TypeError('Invalid exact head SHA.');await mkdir(root,{recursive:true});await chmod(solver,0o755);if(await fileHash(solver)!==SOLVER_DIGEST)throw new Error('Solver digest mismatch.');
const files=[fileURLToPath(import.meta.url),resolve('scripts/nc03-denting/config.mjs'),resolve('scripts/nc03-denting/engine.mjs'),resolve('scripts/nc03-denting/evidence.mjs'),resolve('scripts/nc03-denting/benchmarks.mjs'),resolve('scripts/nc01-shell/common.mjs')];
const implementationHash=semanticHash(await Promise.all(files.map(fileHash)));const rows=await runDentBenchmarks({solver,root,exactHeadSha,implementationHash});if(rows.length!==BENCHMARK_IDS.length)throw new Error('Incomplete NC-03 evidence.');
const evidenceRoot=resolve(root,'evidence');await mkdir(evidenceRoot,{recursive:true});for(const row of rows)await writeJson(resolve(evidenceRoot,`${row.id}.json`),row);
const summary={schema:'lafea-nc03-real-elastic-denting-run/v2',exactHeadSha,solverHash:SOLVER_DIGEST,implementationHash,requiredEvidenceCount:8,producedEvidenceCount:rows.length,status:'EVIDENCE_COMPLETE'};summary.semanticHash=semanticHash(summary);await writeJson(resolve(root,'real-denting-summary.json'),summary);await writeFile(resolve(root,'real-denting-summary.canonical.json'),`${canonicalJson(summary)}\n`);process.stdout.write(`${JSON.stringify(summary)}\n`);
function required(name){if(!args[name])throw new TypeError(`--${name} is required.`);return args[name];}
