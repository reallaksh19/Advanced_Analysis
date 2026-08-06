import { readFile } from 'node:fs/promises';
import { buildSyntheticReferenceModule } from './nc08-module/builder.mjs';
const [bindingPath, outputDir, exactHeadSha, sourceTreeSha] = process.argv.slice(2);
if (!sourceTreeSha) throw new Error('usage: lafea-nc08-module <binding> <out> <head> <tree>');
const upstreamBinding = JSON.parse(await readFile(bindingPath, 'utf8'));
await buildSyntheticReferenceModule({ upstreamBinding, outputDir, exactHeadSha, sourceTreeSha });
