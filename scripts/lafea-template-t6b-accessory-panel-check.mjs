#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_INTEGRATION_STATUS,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  createLafeaTemplateAccessoryPanelDescriptor,
  validateLafeaTemplateAccessoryPanelDescriptor,
} from '../src/workspace/lafea-templates/t6b-accessory-panel.js';

assert.equal(
  validateLafeaTemplateAccessoryPanelDescriptor(
    LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR,
  ).ok,
  true,
);
assert.deepEqual(
  Object.keys(LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR).sort(),
  ['label', 'mount', 'order', 'panelId', 'schema'],
);
assert.equal(
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.schema,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
);
assert.equal(
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.panelId,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
);
assert.equal(
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.label,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_LABEL,
);
assert.equal(
  LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR.order,
  LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER,
);
assert.equal(Object.isFrozen(LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR), true);
assert.equal(
  LAFEA_TEMPLATE_ACCESSORY_PANEL_INTEGRATION_STATUS,
  'AWAITING_AGENT1_SEAM_MERGE',
);

const second = createLafeaTemplateAccessoryPanelDescriptor();
assert.notEqual(second, LAFEA_TEMPLATE_ACCESSORY_PANEL_DESCRIPTOR);
assert.equal(second.mount, second.mount);
assert.equal(validateLafeaTemplateAccessoryPanelDescriptor(second).ok, true);

assert.throws(
  () => createLafeaTemplateAccessoryPanelDescriptor({ unknown: true }),
  /unknown keys/u,
);
assert.throws(
  () => createLafeaTemplateAccessoryPanelDescriptor({ onSelectionChange: true }),
  /onSelectionChange/u,
);
assert.throws(
  () => createLafeaTemplateAccessoryPanelDescriptor({ catalogModel: {} }),
  /catalogModel must be a frozen governed record/u,
);
assert.throws(
  () => createLafeaTemplateAccessoryPanelDescriptor({ selectedTemplateId: ' C2D-LUG-PINHOLE ' }),
  /canonical non-empty text/u,
);
assert.throws(
  () => createLafeaTemplateAccessoryPanelDescriptor(new Date()),
  /plain record/u,
);

const frozenFacade = Object.freeze({
  getState() { return null; },
  importDocument() { throw new Error('IMPORT_MUST_NOT_BE_CALLED_BY_T6B'); },
});
assert.throws(
  () => second.mount({
    controller: frozenFacade,
    hostElement: { dataset: { role: 'lafea-benchmark-host' } },
  }),
  /benchmark host cannot be reused/u,
);
assert.throws(
  () => second.mount({
    controller: {
      getState() { return null; },
      importDocument() { return null; },
    },
    hostElement: {},
  }),
  /facade must be frozen/u,
);
assert.throws(
  () => second.mount({
    controller: Object.freeze({ getState() { return null; } }),
    hostElement: {},
  }),
  /keys are invalid/u,
);
assert.throws(
  () => second.mount({
    controller: Object.freeze({
      getState() { return null; },
      importDocument() { return null; },
      run() { return null; },
    }),
    hostElement: {},
  }),
  /keys are invalid/u,
);

const mountSource = String(second.mount);
assert.equal(mountSource.includes('.importDocument('), false);
assert.equal(mountSource.includes('.getState('), false);
assert.equal(mountSource.includes('executeLafeaStage'), false);
assert.equal(mountSource.includes('compileLafea'), false);

console.log(JSON.stringify({
  check: 'lafea-template-t6b-accessory-panel',
  status: 'PASS',
  schema: LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  panelId: LAFEA_TEMPLATE_ACCESSORY_PANEL_ID,
  order: LAFEA_TEMPLATE_ACCESSORY_PANEL_ORDER,
  controllerFacadeMethodCount: 2,
  controllerMethodInvocations: 0,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
  liveIntegrationStatus: LAFEA_TEMPLATE_ACCESSORY_PANEL_INTEGRATION_STATUS,
}, null, 2));
