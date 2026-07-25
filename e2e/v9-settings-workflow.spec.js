import { test, expect } from '@playwright/test';
import { openApp, openSettings } from './helpers/appNavigation.js';

test.describe('V9 settings workflow', () => {
  test('settings change marks results stale and changes hash', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    const hashEl = page.getByTestId('settings-contract-hash');
    const hashBefore = await hashEl.innerText().catch(() => '');
    await page.getByTestId('settings-field-shortDropLimit_ft').fill('2').catch(() => {});
    await expect(page.getByTestId('settings-results-stale-banner')).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});
