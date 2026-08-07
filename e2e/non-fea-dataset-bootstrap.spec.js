import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'NON-FEA-DATASET-BOOTSTRAP',
  unit: 'mm',
  objects: [
    {
      id: 'PIPES', name: 'Pipes', type: 'BRANCH',
      children: [
        pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
        pipe('PIPE-B', [1000, 0, 0], [2000, 0, 0]),
      ],
    },
    {
      id: 'SUPPORTS', name: 'Supports', type: 'GROUP',
      children: [
        support('SUP-START', [0, 0, 0], 'PIPE-A:port:start'),
        support('SUP-END', [2000, 0, 0], 'PIPE-B:port:end'),
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d'; });
});

test('dataset bootstrap completes without partial EventBus failure', async ({ page }) => {
  await page.goto('/');
  const status = page.locator('[data-role="viewport-status"]');
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name: 'non-fea-dataset-bootstrap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(STAGED_PACKAGE)),
  });

  await expect(status).not.toHaveText('No dataset loaded');
  const text = (await status.textContent()) || '';
  if (text.startsWith('Import failed:')) {
    throw new Error(`Dataset bootstrap reported a partial initialization failure: ${text}`);
  }
  await expect(status).toContainText('NON-FEA-DATASET-BOOTSTRAP');
});

function pipe(id, startPoint, endPoint) {
  return {
    id, name: id, type: 'PIPE', sourcePath: `/MODEL/PIPES/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-NON-FEA', SYSTEM_ID: 'SYS-NON-FEA',
      EI_N_M2: 2000000, UNIT_PIPE_WEIGHT_KG_PER_M: 10,
      INSULATION_THICKNESS_MM: 0, FLUID_WT_OPE_KG_M: 2, FLUID_WT_HYD_KG_M: 3,
    },
    nativeParams: { startPoint, endPoint },
  };
}

function support(id, position, attachedPortId) {
  return {
    id, name: id, type: 'SUPPORT', sourcePath: `/MODEL/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-NON-FEA', SYSTEM_ID: 'SYS-NON-FEA',
      POS: { x: position[0], y: position[1], z: position[2] },
      ATTACHED_PORT_ID: attachedPortId, SUPPORT_TYPE: 'ANCHOR', VERTICAL_CAPABILITY: 'RESTRAINED',
    },
  };
}
