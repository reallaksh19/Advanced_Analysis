import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const requiredFiles = [
  'e2e/helpers/appNavigation.js',
  'e2e/helpers/elementGuards.js',
  'e2e/helpers/reportAssertions.js',
  'e2e/helpers/sketcherActions.js',
  'e2e/v9-settings-workflow.spec.js',
  'e2e/v9-sketcher-to-2d.spec.js',
  'e2e/v9-sketcher-to-gc3d.spec.js',
  'e2e/v9-calc-extended-report.spec.js',
  'e2e/v9-benchmark-cards.spec.js',
];

const requiredFunctions = [
  {
    file: 'e2e/helpers/sketcherActions.js',
    functions: [
      'enableE2EMode',
      'createSketcherLRoute',
      'createSketcherTeeRoute',
      'analyzeSketcher2D',
      'pushSketcherToGC3D',
    ],
  },
];

const requiredStrings = [
  {
    file: 'e2e/helpers/sketcherActions.js',
    strings: ['__SIMPLIFIED_ANALYSIS_E2E__'],
  },
];

let hasErrors = false;

// Check if all required files exist
console.log('Checking required files...');
for (const file of requiredFiles) {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Required file not found: ${file}`);
    hasErrors = true;
  } else {
    console.log(`✓ ${file}`);
  }
}

// Check if all required functions exist
console.log('\nChecking required functions in helpers...');
for (const { file, functions } of requiredFunctions) {
  const filePath = path.join(repoRoot, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const fn of functions) {
      if (content.includes(`export async function ${fn}`) || content.includes(`export function ${fn}`)) {
        console.log(`✓ ${file}: ${fn}`);
      } else {
        console.error(`ERROR: Function not found in ${file}: ${fn}`);
        hasErrors = true;
      }
    }
  }
}

// Check for required strings
console.log('\nChecking for required strings...');
for (const { file, strings } of requiredStrings) {
  const filePath = path.join(repoRoot, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const str of strings) {
      if (content.includes(str)) {
        console.log(`✓ ${file}: contains "${str}"`);
      } else {
        console.error(`ERROR: String not found in ${file}: "${str}"`);
        hasErrors = true;
      }
    }
  }
}

// Check package.json for required scripts
console.log('\nChecking package.json scripts...');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const requiredScripts = ['check:v9', 'ci:v9'];

for (const script of requiredScripts) {
  if (packageJson.scripts && packageJson.scripts[script]) {
    console.log(`✓ package.json: script "${script}"`);
  } else {
    console.error(`ERROR: Script not found in package.json: ${script}`);
    hasErrors = true;
  }
}

// Summary
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.error('V9 browser workflow check FAILED');
  process.exit(1);
} else {
  console.log('V9 browser workflow check PASSED');
  process.exit(0);
}
