import { executeRehearsal } from './nc09-deployment/engine.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/u,'').split('=')));
const exactHeadSha=process.env.NC09_EXACT_HEAD_SHA??args.head;
const implementationHash=process.env.NC09_IMPLEMENTATION_HASH??args.implementation;
if(!exactHeadSha||!implementationHash)throw new Error('head and implementation hash required');
await executeRehearsal({outputDir:args.output??'artifacts/nc09-run',upstreamFile:args.upstream??'artifacts/nc09-upstream.json',exactHeadSha,implementationHash});
