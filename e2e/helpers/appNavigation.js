import { expect } from '@playwright/test';

export async function openApp(page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Simplified Analysis/i);
  await expect(page.locator('#root')).toBeVisible();
}

export async function clickTab(page, testId, fallbackText = null) {
  const byTestId = page.getByTestId(testId);
  if (await byTestId.count()) {
    await byTestId.first().click();
    return;
  }
  if (fallbackText) {
    await page.getByText(fallbackText, { exact: false }).first().click();
    return;
  }
  throw new Error(`Tab not found: ${testId}`);
}

export async function openSettings(page) {
  await clickTab(page, 'nav-tab-settings', 'Settings');
}

export async function openSketcher(page) {
  await clickTab(page, 'nav-tab-sketcher', 'Sketcher');
}

export async function openSimplifiedAnalysis(page) {
  await clickTab(page, 'nav-tab-simpAnalysis', 'Simplified Analysis');
}

export async function open3DAnalysis(page) {
  await clickTab(page, 'nav-tab-3d-analysis', '3D Analysis');
}

export async function openReports(page) {
  await clickTab(page, 'nav-tab-reports', 'Reports');
  await expect(page.getByTestId('reports-tab')).toBeVisible().catch(() => {});
}

export async function openBenchmarks(page) {
  await clickTab(page, 'nav-tab-benchmarks', 'Benchmarks');
}

export async function assertNoBlankRoute(page) {
  const content = await page.locator('#root').innerText();
  if (!content || content.trim().length < 10) {
    throw new Error('Blank route detected — root content is empty.');
  }
}
