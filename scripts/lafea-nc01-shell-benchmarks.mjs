import { spawnSync } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, fileHash, seal, SOLVER_DIGEST, writeJson } from './nc01-shell/common.mjs';
import { runBenchmarks } from './nc01-shell/benchmarks.mjs';

const args=Object.fromEntries(process.argv.slice(2).map((arg)=>{const m=/^--([^=]+)=(.*)$/u.exec(arg);if(!m)throw new TypeError(`Invalid argument ${arg}`);return[m[1],m[2]];}));
const solver=resolve(required('solver')),exactHeadSha=required('head-sha'),sourceArchive=resolve(required('source-archive')),root=resolve(args['output-root']??'artifacts/nc01-real');
if(!/^[0-9a-f]{40}$/u.test(exactHeadSha))throw new TypeError('Invalid exact head SHA.');
await mkdir(root,{recursive:true});await chmod(solver,0o755);
if(await fileHash(solver)!==SOLVER_DIGEST)throw new Error('Solver digest mismatch.');
const sourceProof=await verifySource(sourceArchive);
if(!sourceProof.verified)throw new Error('S8R source ownership proof failed.');
const implementationHash=await fileHash(fileURLToPath(import.meta.url));
const context={solver,root,exactHeadSha,implementationHash,sourceProofHash:sourceProof.semanticHash};
const rows=await runBenchmarks(context), evidenceRoot=resolve(root,'evidence');await mkdir(evidenceRoot,{recursive:true});
for(const row of rows)await writeJson(resolve(evidenceRoot,`${row.id}.json`),row);
const summary=seal({schema:'lafea-nc01-real-shell-benchmark-run/v2',exactHeadSha,solverHash:SOLVER_DIGEST,implementationHash,sourceProof,requiredEvidenceCount:8,producedEvidenceCount:rows.length,status:'EVIDENCE_INCOMPLETE',blockers:['NC01-SH-05:INDEPENDENT_WARPED_MAPPING_REFERENCE_NOT_MATERIALIZED','NC01-SH-06:FINITE_ROTATION_FOLLOWER_PRESSURE_REFERENCE_NOT_MATERIALIZED']},'semanticHash');
await writeJson(resolve(root,'real-shell-benchmark-summary.json'),summary);await writeFile(resolve(root,'real-shell-benchmark-summary.canonical.json'),`${canonicalJson(summary)}\n`,'utf8');process.stdout.write(`${JSON.stringify(summary)}\n`);
function required(name){if(!args[name])throw new TypeError(`--${name} is required.`);return args[name];}
async function verifySource(archive){const member='CalculiX-cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54/src/e_c3d.f';const run=spawnSync('tar',['-xOf',archive,member],{encoding:'utf8'});return seal({schema:'lafea-nc01-s8r-source-proof/v1',member,verified:run.status===0&&run.stdout.includes('add hourglass control stiffnesses: C3D8R only')},'semanticHash');}
