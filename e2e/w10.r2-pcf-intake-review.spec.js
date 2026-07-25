import { expect, test } from '@playwright/test';

const validPcf = `ISOGEN-FILES ISOGEN.FLS
UNITS-CO-ORDS MM
UNITS-BORE INCH
PIPE
END-POINT 0 0 0 4
END-POINT 1000 0 0 4
MATERIAL A106-B
DESCRIPTION <img src=x onerror=globalThis.__pcfInjected=true>
`;

const invalidPcf = `UNITS-CO-ORDS MM
PIPE
END-POINT X 0 0 4
END-POINT 1000 0 0 4
`;

test('stages, reviews and explicitly adopts PCF without legacy runtime ownership', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'PCF', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PCF', exact: true })).toBeVisible();

  const before = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  await page.locator('[data-role="pcf-source-text"]').fill(validPcf);
  await page.getByRole('button', { name: 'Parse and Review' }).click();

  await expect(page.locator('[data-role="pcf-status"]')).toContainText('PCF review is ready');
  await expect(page.getByText('PIPE (MODEL)')).toBeVisible();
  await page.getByText('2 endpoint(s), 0 branch point(s)').click();
  await expect(page.getByText(/bore 4/)).toBeVisible();
  await expect(page.locator('[data-role="pcf-review"] img')).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__pcfInjected || false)).toBe(false);

  const afterReview = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(afterReview.status).toBe(before.status);
  expect(afterReview.dataset?.datasetId || null).toBe(before.dataset?.datasetId || null);

  await page.getByRole('button', { name: 'Adopt into Workspace' }).click();
  await expect(navigation.getByRole('button', { name: 'Workspace', exact: true })).toHaveAttribute('aria-current', 'page');
  const adopted = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(adopted.status).toBe('ready');
  expect(adopted.dataset.sourceSchema).toBe('inputxml-managed-stage/v1');
  expect(adopted.dataset.summary.pipes).toBe(1);

  await navigation.getByRole('button', { name: 'PCF', exact: true }).click();
  const adoptedId = adopted.dataset.datasetId;
  await page.locator('[data-role="pcf-source-text"]').fill(invalidPcf);
  await page.getByRole('button', { name: 'Parse and Review' }).click();
  await expect(page.locator('[data-role="pcf-status"]')).toContainText('blocked');
  await expect(page.getByRole('button', { name: 'Adopt into Workspace' })).toBeDisabled();
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).dataset.datasetId).toBe(adoptedId);
});

test('cancellation clears staged evidence without changing the active dataset', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'PCF', exact: true }).click();
  const before = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  await page.locator('[data-role="pcf-source-text"]').fill(validPcf);
  await page.getByRole('button', { name: 'Parse and Review' }).click();
  await expect(page.getByRole('heading', { name: 'Review summary' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel Staged Intake' }).click();
  await expect(page.locator('[data-role="pcf-source-text"]')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Review summary' })).toHaveCount(0);
  await expect(page.locator('[data-role="pcf-status"]')).toHaveText('Select a PCF file or paste PCF text.');
  const after = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(after.dataset?.datasetId || null).toBe(before.dataset?.datasetId || null);
});
