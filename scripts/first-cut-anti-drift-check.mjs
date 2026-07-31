import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const coreRoot = path.join(root, 'src/core/first-cut-load-estimation');
const workspaceRoot = path.join(root, 'src/workspace/enrichment');
const core = sources(coreRoot);
const workspace = sources(workspaceRoot);

for (const [label, source] of [['core', core], ['workspace', workspace]]) {
  assert.doesNotMatch(source, /B31\.3\s*(?:PASS|FAIL)|CODE\s+COMPLIANT/iu, `${label} contains a code-compliance claim.`);
  assert.doesNotMatch(source, /0\.4[ \t]*\*|0\.6[ \t]*\*|four[ \t]+times[ \t]+lift/iu, `${label} contains a prohibited empirical coefficient.`);
}
assert.doesNotMatch(core, /\b(?:document|window|navigator|Blob|URL\.createObjectURL)\b/u, 'First-cut core imports runtime/UI APIs.');
assert.doesNotMatch(workspace, /\b(?:calculateSag|calculateStress|slopeDeflection)\b/u, 'Workspace contains mechanics.');
assert.match(core, /thermalReaction/u);
assert.match(core, /NOT_EVALUATED_FIELDS\.map\(\(field\) => \[field, null\]\)/u, 'FEA-only fields must be emitted as null.');
assert.doesNotMatch(core, /Math\.random|Date\.now|new Date\s*\(/u, 'First-cut identity is nondeterministic.');
console.log('✅ First-cut anti-drift checks passed.');

function sources(directory) {
  if (!fs.existsSync(directory)) return '';
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return [sources(target)];
    return entry.name.endsWith('.js') ? [fs.readFileSync(target, 'utf8')] : [];
  }).join('\n');
}
