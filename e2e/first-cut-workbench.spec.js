import { expect, test } from '@playwright/test';

test('[SIMULATED] first-cut workbench has explicit inputs, preflight blocking, and dock restore', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('[data-section-id="first-cut"]');
  await section.locator('.accordion-section-header').click();

  const workbench = page.locator('[data-role="first-cut-workbench"]');
  await expect(workbench).toBeVisible();
  await expect(workbench.getByRole('tab')).toHaveCount(4);
  await workbench.getByRole('tab', { name: 'Screening Profile & Approved Assumptions' }).click();

  const profileId = workbench.getByLabel('Profile ID');
  const gravity = workbench.getByLabel('Gravity (m/s²)');
  const geometryTolerance = workbench.getByLabel('Geometry absolute tolerance (m)');
  await expect(profileId).toHaveValue('');
  await expect(gravity).toHaveValue('');
  await expect(geometryTolerance).toHaveValue('');
  await profileId.fill('[SIMULATED] E2E PROFILE');
  await profileId.blur();

  await workbench.getByRole('button', { name: 'Run First-Cut Screening' }).click();
  const dialog = workbench.getByRole('dialog');
  await expect(dialog).toContainText('Import a shared piping model');
  await expect(dialog.getByRole('button', { name: 'Confirm Assumptions & Perform Calc' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Return to Enrichment' }).click();

  await section.locator('.accordion-popout-btn').click();
  const popup = page.locator('[data-role="panel-popup-overlay"]');
  await expect(popup).toBeVisible();
  await expect(popup.locator('[data-role="first-cut-workbench"]')).toBeVisible();
  await popup.locator('[data-action="popup-dock"]').click();
  await expect(section.locator('[data-role="first-cut-workbench"]')).toBeVisible();
  await expect(section.getByLabel('Profile ID')).toHaveValue('[SIMULATED] E2E PROFILE');
});

test('[SIMULATED] explicit source evidence seals a current first-cut package', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name: 'first-cut-simulated.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(SCREENING_PACKAGE)),
  });
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().status)).toBe('ready');

  const section = page.locator('[data-section-id="first-cut"]');
  await section.locator('.accordion-section-header').click();
  const workbench = page.locator('[data-role="first-cut-workbench"]');
  await workbench.getByRole('tab', { name: 'Screening Profile & Approved Assumptions' }).click();

  await workbench.getByLabel('Profile ID').fill('[SIMULATED] FC-E2E');
  await workbench.getByLabel('Profile ID').blur();
  await workbench.getByLabel('Method').selectOption('SIMPLE_SPAN_TRIBUTARY_VERTICAL_V1');
  await workbench.getByLabel('EMPTY').check();
  await workbench.getByLabel('Gravity (m/s²)').fill('9.80665');
  await workbench.getByLabel('Gravity (m/s²)').blur();
  await workbench.getByLabel('Gravity direction').selectOption('GRAVITY_DOWN');
  await workbench.getByLabel('Gravity source').fill('[SIMULATED] project basis');
  await workbench.getByLabel('Gravity source').blur();
  await workbench.getByLabel('Geometry absolute tolerance (m)').fill('0.000000001');
  await workbench.getByLabel('Geometry absolute tolerance (m)').blur();
  await workbench.getByLabel('Geometry relative tolerance').fill('0.000000001');
  await workbench.getByLabel('Geometry relative tolerance').blur();
  await workbench.getByLabel('Force absolute tolerance (N)').fill('0.000001');
  await workbench.getByLabel('Force absolute tolerance (N)').blur();
  await workbench.getByLabel('Force relative tolerance').fill('0.000000001');
  await workbench.getByLabel('Force relative tolerance').blur();
  await workbench.getByLabel('Moment absolute tolerance (N·m)').fill('0.000001');
  await workbench.getByLabel('Moment absolute tolerance (N·m)').blur();
  await workbench.getByLabel('Moment relative tolerance').fill('0.000000001');
  await workbench.getByLabel('Moment relative tolerance').blur();
  await workbench.getByLabel('Profile source').fill('[SIMULATED] reviewed screening method');
  await workbench.getByLabel('Profile source').blur();

  await workbench.getByRole('button', { name: 'Run First-Cut Screening' }).click();
  const dialog = workbench.getByRole('dialog');
  await expect(dialog).toContainText('All requested inputs');
  await dialog.getByRole('button', { name: 'Confirm Assumptions & Perform Calc' }).click();
  await expect(workbench.locator('[data-role="first-cut-calculation-basis"]')).toContainText('QUALIFIED_SCREENING');
  const result = await page.evaluate(() => AnalysisWorkspace.getFirstCutCalculationPackage());
  expect(result.status).toBe('QUALIFIED_SCREENING');
  expect(result.thermalReaction).toBeNull();
  expect(result.supportScreening.supportResults).toHaveLength(2);

  await workbench.getByRole('tab', { name: 'Screening Profile & Approved Assumptions' }).click();
  await workbench.getByLabel('Profile source').fill('[SIMULATED] changed basis');
  await workbench.getByLabel('Profile source').blur();
  const basis = workbench.locator('[data-role="first-cut-calculation-basis"]');
  await expect(basis).toContainText('STALE');
  await expect(basis.getByRole('button', { name: 'Copy Report' })).toBeDisabled();
});

const SCREENING_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'FIRST-CUT-E2E-[SIMULATED]',
  unit: 'mm',
  objects: [
    {
      id: 'PIPES',
      name: 'Pipes',
      type: 'BRANCH',
      children: [{
        id: 'PIPE-FC',
        name: 'PIPE-FC',
        type: 'PIPE',
        sourcePath: '/MODEL/PIPES/PIPE-FC',
        sourceAttributes: {
          LINE_ID: 'LINE-FC',
          SYSTEM_ID: 'SYS-FC',
          UNIT_PIPE_WEIGHT_KG_PER_M: 10,
          INSULATION_THICKNESS_MM: 0,
        },
        nativeParams: { startPoint: [0, 0, 0], endPoint: [2000, 0, 0] },
      }],
    },
    {
      id: 'SUPPORTS',
      name: 'Supports',
      type: 'GROUP',
      children: [
        support('SUP-FC-1', [0, 0, 0], 'PIPE-FC:port:start'),
        support('SUP-FC-2', [2000, 0, 0], 'PIPE-FC:port:end'),
      ],
    },
  ],
};

function support(id, position, attachedPortId) {
  return {
    id,
    name: id,
    type: 'SUPPORT',
    sourcePath: `/MODEL/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-FC',
      SYSTEM_ID: 'SYS-FC',
      POS: { x: position[0], y: position[1], z: position[2] },
      ATTACHED_PORT_ID: attachedPortId,
      SUPPORT_TYPE: 'ANCHOR',
      VERTICAL_CAPABILITY: 'RESTRAINED',
    },
  };
}
