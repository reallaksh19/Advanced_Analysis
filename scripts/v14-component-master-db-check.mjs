#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const checks = [];

function check(description, condition, details = '') {
  const pass = !!condition;
  checks.push({ description, pass, details });
  const symbol = pass ? '✓' : '✗';
  console.log(`${symbol} ${description}${details ? ' — ' + details : ''}`);
}

async function verifyFileExists(filePath, description) {
  const fullPath = path.resolve(ROOT, filePath);
  return fs.existsSync(fullPath);
}

async function importModule(filePath) {
  try {
    return await import(path.resolve(ROOT, filePath));
  } catch (e) {
    return null;
  }
}

console.log('\n=== V14 Component Master DB Static Checks ===\n');

const defaultComponentMasterDbPath = 'src/data/componentMasterDb/defaultComponentMasterDb.js';
const resolveComponentDimensionsPath = 'src/core/component-data/resolveComponentDimensions.js';
const componentMasterDbTabPath = 'src/components/ComponentMasterDbTab.jsx';
const reportIssueWorkflowPath = 'src/reporting/reportIssueWorkflow.js';

console.log('Checking files exist...');
check('defaultComponentMasterDb.js exists', await verifyFileExists(defaultComponentMasterDbPath), defaultComponentMasterDbPath);
check('resolveComponentDimensions.js exists', await verifyFileExists(resolveComponentDimensionsPath), resolveComponentDimensionsPath);
check('ComponentMasterDbTab.jsx exists', await verifyFileExists(componentMasterDbTabPath), componentMasterDbTabPath);
check('reportIssueWorkflow.js exists', await verifyFileExists(reportIssueWorkflowPath), reportIssueWorkflowPath);

console.log('\nChecking defaultComponentMasterDb exports...');
const defaultModule = await importModule(defaultComponentMasterDbPath);
check('COMPONENT_SOURCE_STATUS exported', !!defaultModule?.COMPONENT_SOURCE_STATUS);
check('COMPONENT_TYPES exported', !!defaultModule?.COMPONENT_TYPES);
check('DEFAULT_COMPONENT_MASTER_ROWS exported', !!defaultModule?.DEFAULT_COMPONENT_MASTER_ROWS);
check('COMPONENT_MASTER_DB_SCHEMA_VERSION exported', !!defaultModule?.COMPONENT_MASTER_DB_SCHEMA_VERSION);

if (defaultModule?.DEFAULT_COMPONENT_MASTER_ROWS) {
  check('DEFAULT_COMPONENT_MASTER_ROWS is array', Array.isArray(defaultModule.DEFAULT_COMPONENT_MASTER_ROWS), `length: ${defaultModule.DEFAULT_COMPONENT_MASTER_ROWS.length}`);
  check('DEFAULT_COMPONENT_MASTER_ROWS has 8 items', defaultModule.DEFAULT_COMPONENT_MASTER_ROWS.length === 8, `found ${defaultModule.DEFAULT_COMPONENT_MASTER_ROWS.length}`);
}

console.log('\nChecking resolveComponentDimensions exports...');
const resolverModule = await importModule(resolveComponentDimensionsPath);
check('COMPONENT_DATA_STATUS exported', !!resolverModule?.COMPONENT_DATA_STATUS);
check('COMPONENT_DATA_SCHEMA_VERSION exported', !!resolverModule?.COMPONENT_DATA_SCHEMA_VERSION);
check('resolveComponentDimension exported', typeof resolverModule?.resolveComponentDimension === 'function');
check('resolveElbowC2E exported', typeof resolverModule?.resolveElbowC2E === 'function');
check('resolveTeeC2E exported', typeof resolverModule?.resolveTeeC2E === 'function');
check('resolveOletBRLEN exported', typeof resolverModule?.resolveOletBRLEN === 'function');
check('resolveValveFaceToFace exported', typeof resolverModule?.resolveValveFaceToFace === 'function');
check('resolveFlangeThickness exported', typeof resolverModule?.resolveFlangeThickness === 'function');

console.log('\nChecking ComponentMasterDbTab...');
const tabContent = fs.readFileSync(path.resolve(ROOT, componentMasterDbTabPath), 'utf-8');
check('ComponentMasterDbTab has testid', tabContent.includes('component-master-db-tab'), 'data-testid="component-master-db-tab"');
check('ComponentMasterDbTab has filter testid', tabContent.includes('component-db-filter'));
check('ComponentMasterDbTab has add row button', tabContent.includes('component-db-add-row'));
check('ComponentMasterDbTab has export JSON button', tabContent.includes('component-db-export-json'));
check('ComponentMasterDbTab has export CSV button', tabContent.includes('component-db-export-csv'));
check('ComponentMasterDbTab has table testid', tabContent.includes('component-db-table'));

console.log('\nChecking reportIssueWorkflow.js...');
const reportContent = fs.readFileSync(path.resolve(ROOT, reportIssueWorkflowPath), 'utf-8');
check('reportIssueWorkflow contains COMPONENT_DATA_NOT_QUALIFIED', reportContent.includes('COMPONENT_DATA_NOT_QUALIFIED'), 'issue blocker code defined');

console.log('\n=== Summary ===\n');
const passCount = checks.filter(c => c.pass).length;
const failCount = checks.filter(c => !c.pass).length;
console.log(`Passed: ${passCount}/${checks.length}`);
if (failCount > 0) {
  console.log(`Failed: ${failCount}/${checks.length}`);
  process.exit(1);
}
console.log('\nAll checks passed!');
process.exit(0);
