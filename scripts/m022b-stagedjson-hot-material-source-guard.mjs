#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guarded = [
  'src/workspace/analysis-authority-overlay/stagedjson-material-section-catalog.js',
  'src/workspace/analysis-authority-overlay/stagedjson-material-section-resolution.js',
  'src/workspace/analysis-authority-overlay/stagedjson-material-resolution-materializer.js',
  'src/workspace/analysis-authority-overlay/stagedjson-hot-authority-composition.js',
];
const source = Object.fromEntries(guarded.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
const combined = Object.entries(source).map(([path, text]) => `\n/* ${path} */\n${text}`).join('\n');
const resolver = source[guarded[1]];
const catalog = source[guarded[0]];
const composition = source[guarded[3]];

function reject(pattern, message, text = combined) { assert.equal(pattern.test(text), false, message); }
for (const path of guarded) assert.ok(source[path].length > 0, `missing ${path}`);

reject(/from\s*['"][^'"]*(?:linear-fea-model-compiler|linear-fea-solver|linear-piping-analysis-consumer|lfea-shell-v2|geometry\/adapters|inputxml)[^'"]*['"]/iu, 'M022-B must not import compiler, solver, canonical adapters, InputXML, consumer, or Shell V2');
reject(/compileMechanicalModel|compileSolverExecution|inputXmlToCanonicalGeometry|canonicalGeometry|solverReady\s*:\s*true/iu, 'M022-B must stop before canonical/solver execution');
reject(/resolveBranchMaterialSectionAuthority/u, 'M022-B production resolver must not delegate to M008-C');
reject(/previous(?:Entity|Element)|carry\s*forward|sourceOrderAllowed\s*:\s*true/iu, 'source-order carry-forward is prohibited');
reject(/operatingAnalysisPressure\s*[:=]\s*[^\n]*designPressure/iu, 'design pressure must not become operating pressure');
reject(/ENRICHED_SJSON_CANONICAL_PIPING_ADAPTER_REMAINS_UNWIRED\s*=\s*false/iu, 'direct EnrichedSjson wiring guard must remain active');

assert.match(catalog, /stagedjson-material-section-catalog\/v1/u);
assert.match(catalog, /ASTM A234-WPB/u);
assert.match(catalog, /ASTM A105/u);
assert.match(catalog, /NPS8-SCH100/u);
assert.match(catalog, /644\.15/u, 'catalog must bracket the selected design temperature');
assert.match(catalog, /ASME-B31\.1-1995-CARBON-STEEL-E-T-PUBLIC-REPRODUCTION/u);
assert.match(catalog, /ASME-B31\.3-APPENDIX-C-TABLE-C1-GROUP1-PUBLIC-REPRODUCTION/u);
assert.match(resolver, /resolveLinearFeaMaterialState/u);
assert.match(resolver, /LINEAR_INTERPOLATION|evaluationTemperature/u);
assert.match(resolver, /INHERITED_ADJACENT_ENTITY/u);
assert.match(composition, /BLOCKED_PENDING_QUALIFIED_CANONICAL_ADAPTER/u);
assert.match(composition, /STAGEDJSON_REFERENCE_MATERIAL_STATE_MISSING/u);

const legacy = readFileSync(resolve(root, 'src/workspace/analysis-authority-overlay/material-section-resolution.js'), 'utf8');
assert.match(legacy, /const\s+MATERIAL_ALIASES\s*=\s*new\s+Map/u, 'M008-C compatibility oracle must remain unchanged in this batch');
assert.match(legacy, /const\s+EVALUATION_TEMPERATURE\s*=\s*293\.15/u, 'M008-C compatibility oracle must retain its historical baseline behavior');

console.log('M022-B StagedJSON hot-material source guard PASS');
