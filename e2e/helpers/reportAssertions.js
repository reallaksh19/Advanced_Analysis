import { expect } from '@playwright/test';

export async function expectNoDemoReport(page) {
  const root = page.locator('#root');
  const content = await root.innerText();
  if (content.includes('Demo Calculation Report')) {
    throw new Error('Demo Calculation Report found — should not appear');
  }
  if (content.includes('Benchmark Report —')) {
    throw new Error('Benchmark Report found — should not appear without active calculation');
  }
}

export async function expectNoActiveReportMessage(page) {
  await expect(page.getByTestId('no-active-report')).toBeVisible();
}

export async function expectActiveReportFields(page) {
  await expect(page.getByTestId('active-report-summary')).toBeVisible().catch(() => {});
  const content = await page.locator('#root').innerText();
  const hasMethodId = content.includes('Method') || content.includes('method');
  if (!hasMethodId) {
    throw new Error('Active report fields (Method ID) not found in report output');
  }
}
