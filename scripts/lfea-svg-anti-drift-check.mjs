/**
 * Anti-Drift Source Guard Check Script
 * Enforces strict anti-drift rules on src/workspace/lfea-svg modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('--- LFEA SVG anti-drift source guard check ---');

const forbiddenRules = [
  {
    code: 'SVG_NUMERICAL_AUTHORITY_LEAK',
    root: 'src/workspace/lfea-svg',
    pattern: /calculateStress|allowableStress|utilization\s*=|factorize|assembleGlobal/u,
  },
  {
    code: 'SVG_POINTER_SOURCE_MUTATION',
    root: 'src/workspace/lfea-svg',
    pattern: /pointermove[\s\S]{0,600}(source|model)\s*\./u,
  },
  {
    code: 'REMOTE_RUNTIME_IMPORT',
    root: 'src',
    pattern: /reallaksh19\.github\.io|raw\.githubusercontent\.com/u,
  },
  {
    code: 'LOCALE_CANONICAL_ORDER',
    root: 'src/workspace/lfea-svg',
    pattern: /localeCompare\s*\(/u,
  },
  {
    code: 'NON_DETERMINISTIC_IDENTITY',
    root: 'src/workspace/lfea-svg',
    pattern: /Date\.now|Math\.random|randomUUID/u,
  },
];

function scanDirectory(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.json'))) {
      files.push(fullPath);
    }
  });
  return files;
}

let violations = 0;

forbiddenRules.forEach((rule) => {
  const targetDir = path.join(projectRoot, rule.root);
  const files = scanDirectory(targetDir);

  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    if (rule.pattern.test(content)) {
      console.error(`FAIL [${rule.code}] Violation found in file: ${path.relative(projectRoot, filePath)}`);
      violations++;
    }
  });
});

if (violations > 0) {
  console.error(`FAIL: ${violations} anti-drift violation(s) detected.`);
  process.exit(1);
}

console.log('LFEA SVG anti-drift source guard PASS');
