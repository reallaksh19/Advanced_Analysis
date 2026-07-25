import { expect, test } from '@playwright/test';

const SETTINGS_KEY = 'simplified-analysis:engineering-settings:v1';

test('Settings opens without a dataset and applies one immutable profile explicitly', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  const settingsButton = navigation.getByRole('button', { name: 'Settings', exact: true });
  await expect(settingsButton).toHaveAttribute('aria-disabled', 'false');

  const beforeOpen = await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile());
  await settingsButton.click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('empty');
  expect(await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).toEqual(beforeOpen);

  const field = page.locator('[data-settings-field="reportTimestampPolicy"]');
  await field.selectOption('include-in-export-content');
  const proposed = await page.evaluate(() => AnalysisWorkspace.getSettingsReviewModel());
  expect(proposed.fieldRows[0].proposedValue).toBe('include-in-export-content');
  expect((await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).profileId).toBe(beforeOpen.profileId);

  await page.evaluate(() => {
    globalThis.__settingsChangedCount = 0;
    EventBus.subscribe('engineeringSettings:changed', () => { globalThis.__settingsChangedCount += 1; });
  });
  await page.getByRole('button', { name: 'Apply Settings Profile' }).click();
  const applied = await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile());
  expect(applied.profileId).not.toBe(beforeOpen.profileId);
  expect(applied.settings.reportTimestampPolicy).toBe('include-in-export-content');
  expect(await page.evaluate(() => globalThis.__settingsChangedCount)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('simplified-analysis:engineering-settings:v1'))).toContain(applied.profileId);

  await page.reload();
  expect((await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).profileId).toBe(applied.profileId);
});

test('invalid proposals fail closed and resets never alter the active profile before Apply', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Application views' }).getByRole('button', { name: 'Settings', exact: true }).click();
  const initial = await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile());

  await page.evaluate(() => EventBus.publish('engineeringSettings:proposalChanged', {
    settingId: 'reportTimestampPolicy', value: 'invalid-policy',
  }));
  await expect(page.getByRole('status').filter({ hasText: /must be one of/ })).toBeVisible();
  await page.getByRole('button', { name: 'Apply Settings Profile' }).click();
  expect((await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).profileId).toBe(initial.profileId);
  await expect(page.getByText(/SETTINGS_APPLY_REJECTED/)).toBeVisible();

  await page.getByRole('button', { name: 'Reset to Approved Defaults' }).click();
  expect((await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).profileId).toBe(initial.profileId);
  await page.getByRole('button', { name: 'Reset Proposal' }).click();
  expect((await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).profileId).toBe(initial.profileId);
});

test('malformed persistence fails closed and dataset replacement does not reset settings', async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, '{malformed'), [SETTINGS_KEY]);
  await page.goto('/');
  const defaultProfile = await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile());
  expect(defaultProfile.settings.reportTimestampPolicy).toBe('exclude-from-deterministic-hash');
  await page.getByRole('navigation', { name: 'Application views' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText(/SETTINGS_PERSISTENCE_REJECTED/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('simplified-analysis:engineering-settings:v1'))).toBe('{malformed');

  await page.locator('[data-settings-field="reportTimestampPolicy"]').selectOption('include-in-export-content');
  await page.getByRole('button', { name: 'Apply Settings Profile' }).click();
  const applied = await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile());
  const historicalEntries = await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger().entries);
  await page.evaluate(() => EventBus.publish('dataset:loadRequested', {
    sourceName: 'settings-boundary.json',
    rawPackage: { schema: 'inputxml-managed-stage/v1', objects: [{ id: 'P1', type: 'PIPE', name: 'P1', points: [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }] }] },
  }));
  expect((await page.evaluate(() => AnalysisWorkspace.getEngineeringSettingsProfile())).profileId).toBe(applied.profileId);
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger().entries)).toEqual(historicalEntries);
});
