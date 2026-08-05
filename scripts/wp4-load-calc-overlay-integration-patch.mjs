import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

patchLoadCalcController();
patchBootstrap();
console.log('wp4-load-calc-overlay-integration-patch: APPLIED');

function patchLoadCalcController() {
  const path = new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "import {\n  empiricalLoadCalcScenarioStore,\n} from './engineering-loads/empirical-load-calc-scenario-store.js';\n",
    `import {
  empiricalLoadCalcScenarioStore,
} from './engineering-loads/empirical-load-calc-scenario-store.js';
import {
  empiricalResultOverlayStore,
} from './engineering-loads/empirical-result-overlay-store.js';
`,
    'overlay store import',
  );
  source = replaceOnce(
    source,
    "      this.eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.FAILED, ({ message }) => this.handleFailure(message)),\n",
    `      this.eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.RESULT_OVERLAY_CHANGED, ({ snapshot, projection }) => {
        this.topologyEdit3DController?.viewportBackend?.setGovernedResultProjection(
          projection,
          snapshot?.reasonCode || 'EMPIRICAL_EXECUTION_REQUIRED',
        );
      }),
      this.eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.FAILED, ({ message }) => this.handleFailure(message)),
`,
    'overlay changed subscription',
  );
  source = replaceOnce(
    source,
    "        execution: empiricalLoadCalcScenarioStore.getExecution(),\n      };\n",
    "        execution: empiricalLoadCalcScenarioStore.getExecution(),\n        overlaySnapshot: empiricalResultOverlayStore.getSnapshot(),\n      };\n",
    'empirical view overlay state',
  );
  source = replaceOnce(
    source,
    "        if (revision === this.renderRevision) this.topologyEdit3DController.renderPane(pane);\n",
    `        if (revision === this.renderRevision) {
          const overlaySnapshot = empiricalResultOverlayStore.getSnapshot();
          this.topologyEdit3DController.viewportBackend?.setGovernedResultProjection(
            empiricalResultOverlayStore.getProjection(),
            overlaySnapshot.reasonCode || 'EMPIRICAL_EXECUTION_REQUIRED',
          );
          this.topologyEdit3DController.renderPane(pane);
        }
`,
    '3d activation overlay sync',
  );
  writeFileSync(path, source);
}

function patchBootstrap() {
  const path = new URL('../src/workspace/bootstrap.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "    getEmpiricalLoadCalcExecution(){return empiricalLoadCalcScenarioController.getExecution();},\n",
    `    getEmpiricalLoadCalcExecution(){return empiricalLoadCalcScenarioController.getExecution();},
    getEmpiricalLoadCalcResultOverlayState(){return empiricalLoadCalcScenarioController.getResultOverlaySnapshot();},
    getEmpiricalLoadCalcResultOverlay(){return empiricalLoadCalcScenarioController.getResultOverlayProjection();},
`,
    'bootstrap overlay API',
  );
  writeFileSync(path, source);
}

function replaceOnce(value, before, after, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected one source match, found ${count}`);
  return value.replace(before, after);
}
