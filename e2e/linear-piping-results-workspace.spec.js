import { expect, test } from '@playwright/test';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  sealLinearPipingQualifiedApplicationResult,
} from '../src/core/linear-piping-code-application/index.js';
import { LINEAR_PIPING_WORKSPACE_PACKAGE_SCHEMA } from '../src/workspace/linear-piping-results-workbench.js';
import { buildQualifiedPresentationFixture } from '../scripts/linear-piping-presentation-fixtures.mjs';

const fixture = buildQualifiedPresentationFixture();
const QUALIFIED_PACKAGE = jsonValue(workspacePackage(fixture));
const conditionalApplication = sealLinearPipingQualifiedApplicationResult({
  schema: APPLICATION_RESULT_REQUEST_SCHEMA,
  applicationId: 'PIPE-PHASE5B-E2E-CONDITIONAL',
  analysisResults: fixture.analysisResults,
  interfaceSet: fixture.interfaceSet,
  interfaceRecoveries: fixture.interfaceRecoveries,
  nozzleAssessments: [],
  b31Application: fixture.b31Application,
});
const CONDITIONAL_PACKAGE = jsonValue(workspacePackage({
  ...fixture,
  applicationResult: conditionalApplication,
  nozzleAssessments: [],
}));

test('[SIMULATED] current qualified piping package renders and downloads governed audit evidence', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.AnalysisWorkspace))).toBe(true);

  const state = await page.evaluate((value) => {
    AnalysisWorkspace.importLinearPipingResultPackage(value);
    return AnalysisWorkspace.getLinearPipingResultState();
  }, QUALIFIED_PACKAGE);
  expect(state.status).toBe('CURRENT');
  expect(state.exportEligibility).toBe('ENGINEERING_EXPORT_ALLOWED');

  const section = page.locator('[data-section-id="linear-piping-results"]');
  await expect(section).toBeVisible();
  await expect(section).toHaveAttribute('data-current', 'true');
  await expect(section.locator('[data-role="linear-piping-results-root"]')).toContainText(
    'Support, anchor and nozzle interface actions',
  );
  await expect(section.locator('[data-role="linear-piping-results-root"]')).toContainText(
    'B31.3 application results',
  );
  await expect(section.getByRole('button', { name: 'Download Audit JSON' })).toBeEnabled();
  await expect(section.getByRole('button', { name: 'Download Engineering CSVs' })).toBeEnabled();

  const exportSummary = await page.evaluate(() => ({
    audit: AnalysisWorkspace.createLinearPipingAuditExportRecord(),
    engineering: AnalysisWorkspace.createLinearPipingEngineeringExportRecords(),
  }));
  expect(exportSummary.audit.role).toBe('CURRENT_AUDIT_EVIDENCE');
  expect(exportSummary.engineering).toHaveLength(3);

  const downloadPromise = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download Audit JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-piping-audit\.json$/u);

  await page.evaluate(() => AnalysisWorkspace.clearLinearPipingResultPackage());
  await expect(section).toHaveAttribute('data-current', 'false');
  await expect(section.locator('[data-role="linear-piping-results-root"]')).toContainText(
    'No CURRENT sealed piping application result is loaded',
  );
  await expect(section.getByRole('button', { name: 'Download Audit JSON' })).toBeDisabled();
});

test('[SIMULATED] conditional result blocks engineering export and rejected replacement clears prior state', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.AnalysisWorkspace))).toBe(true);

  await page.evaluate((value) => AnalysisWorkspace.importLinearPipingResultPackage(value), CONDITIONAL_PACKAGE);
  const section = page.locator('[data-section-id="linear-piping-results"]');
  await expect(section).toHaveAttribute('data-qualification-status', 'CONDITIONAL');
  await expect(section.getByRole('button', { name: 'Download Audit JSON' })).toBeEnabled();
  await expect(section.getByRole('button', { name: 'Download Engineering CSVs' })).toBeDisabled();
  await expect(section.locator('[data-role="linear-piping-results-root"]')).toContainText(
    'NOZZLE_ALLOWABLE_NOT_CONFIGURED',
  );

  const invalidPackage = { ...QUALIFIED_PACKAGE, injectedApplicationValue: 123 };
  const rejection = await page.evaluate((value) => {
    try {
      AnalysisWorkspace.importLinearPipingResultPackage(value);
      return null;
    } catch (error) {
      return { code: error.code, state: AnalysisWorkspace.getLinearPipingResultState() };
    }
  }, invalidPackage);
  expect(rejection.code).toBe('PIPING_WORKSPACE_PACKAGE_KEYS_INVALID');
  expect(rejection.state.status).toBe('EMPTY');
  await expect(section).toHaveAttribute('data-current', 'false');
  await expect(section.locator('[data-role="linear-piping-results-root"]')).not.toContainText(
    'PIPE-PHASE5B-E2E-CONDITIONAL',
  );
});

function workspacePackage(value) {
  return {
    schema: LINEAR_PIPING_WORKSPACE_PACKAGE_SCHEMA,
    applicationResult: value.applicationResult,
    analysisResults: value.analysisResults,
    interfaceSet: value.interfaceSet,
    interfaceRecoveries: value.interfaceRecoveries,
    nozzleAssessments: value.nozzleAssessments,
    b31Application: value.b31Application,
  };
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}
