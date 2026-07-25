import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}`);
    failed++;
  }
}

// Check 1: professionalDraftingCommands.js exports
const cmdPath = path.join(rootDir, 'src/sketcher/commands/professionalDraftingCommands.js');
if (fs.existsSync(cmdPath)) {
  const content = fs.readFileSync(cmdPath, 'utf-8');
  check(content.includes('export const SKETCH_DRAFTING_COMMAND_SCHEMA_VERSION'), 'SKETCH_DRAFTING_COMMAND_SCHEMA_VERSION is exported');
  check(content.includes('export function convertSelectedNodeToBend'), 'convertSelectedNodeToBend is exported');
  check(content.includes('export function convertSelectedNodeToTee'), 'convertSelectedNodeToTee is exported');
  check(content.includes('export function convertSelectedNodeToOlet'), 'convertSelectedNodeToOlet is exported');
  check(content.includes('export function autoConnectPipes'), 'autoConnectPipes is exported');
  check(content.includes('export function validateSketchCommand'), 'validateSketchCommand is exported');
} else {
  check(false, 'professionalDraftingCommands.js exists');
  failed += 5;
}

// Check 2: TopologyDiagnosticsPanel.jsx
const panelPath = path.join(rootDir, 'src/sketcher/TopologyDiagnosticsPanel.jsx');
if (fs.existsSync(panelPath)) {
  const content = fs.readFileSync(panelPath, 'utf-8');
  check(content.includes('data-testid="topology-diagnostics-panel"'), 'topology-diagnostics-panel testid exists');
  check(content.includes('export default'), 'TopologyDiagnosticsPanel is default export');
} else {
  check(false, 'TopologyDiagnosticsPanel.jsx exists');
  failed += 2;
}

// Check 3: SketcherStore.js integration
const storePath = path.join(rootDir, 'src/sketcher/SketcherStore.js');
if (fs.existsSync(storePath)) {
  const content = fs.readFileSync(storePath, 'utf-8');
  check(content.includes('convertSelectedToBend'), 'convertSelectedToBend action exists');
  check(content.includes('applyDraftingCommandResult'), 'applyDraftingCommandResult action exists');
  check(content.includes('topologyDiagnostics'), 'topologyDiagnostics state exists');
} else {
  check(false, 'SketcherStore.js exists');
  failed += 3;
}

// Check 4: SketcherTab.jsx integration
const tabPath = path.join(rootDir, 'src/sketcher/SketcherTab.jsx');
if (fs.existsSync(tabPath)) {
  const content = fs.readFileSync(tabPath, 'utf-8');
  check(content.includes('data-testid="sketcher-convert-bend"'), 'sketcher-convert-bend button exists');
  check(content.includes('TopologyDiagnosticsPanel'), 'TopologyDiagnosticsPanel imported');
} else {
  check(false, 'SketcherTab.jsx exists');
  failed += 2;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
