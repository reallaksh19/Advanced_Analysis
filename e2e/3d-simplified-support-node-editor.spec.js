import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/support-node-editor-run.json' with { type: 'json' };

async function setSupportNode(page, nodeId, supportData) {
  await page.evaluate(
    ({ id, data }) => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      const node = store.getState().nodes[id];

      store.getState().updateNode(id, {
        ...node,
        type: data.supportType,
        supportTag: data.supportTag,
        supportType: data.supportType,
        frictionFactor: data.frictionFactor,
        restraint: data.restraint
      });
    },
    { id: nodeId, data: supportData }
  );
}

test.describe('Slice L — Sketcher support node property editor', () => {
  test('carries edited support node properties into 3D Simplified supports and report', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SIMPLIFIED_ANALYSIS_E2E__ = true;
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-sketcher').click();

    await page.waitForFunction(() =>
      Boolean(window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__)
    );

    await page.evaluate((caseData) => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;

      store.setState({
        nodes: {
          ...caseData.sketcher.nodes,
          N001: { ...caseData.sketcher.nodes.N001, type: 'support' },
        },
        segments: caseData.sketcher.segments,
        selectedSegmentId: null,
        workingPlane: caseData.sketcher.workingPlane,
        workingElevation: caseData.sketcher.workingElevation,
        designTemperature: caseData.sketcher.designTemperature
      });
      // Prefer using the action too, because it mirrors real UI behavior.
      store.getState().setSelectedNodeId('N001');
    }, fixture);

    // wait for state update to trigger UI render
    await page.waitForTimeout(500);

    await expect(page.getByTestId('sketcher-support-editor')).toBeVisible();

    await page.getByTestId('sketcher-node-support-tag').fill(fixture.supportEdits.N001.supportTag);
    await page.getByTestId('sketcher-node-support-type').selectOption(fixture.supportEdits.N001.supportType);
    await page.getByTestId('sketcher-node-friction-factor').fill(String(fixture.supportEdits.N001.frictionFactor));

    await setSupportNode(page, 'N001', fixture.supportEdits.N001);
    await setSupportNode(page, 'N002', fixture.supportEdits.N002);

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      fixture.expected.validationStatus
    );

    const modelSummary = page.getByTestId('3d-simplified-imported-model-summary');
    await expect(modelSummary).toContainText(`Supports: ${fixture.expected.supports}`);

    const supportTable = page.getByTestId('3d-simplified-support-load-table');

    await expect(supportTable).toContainText(fixture.expected.supportA);
    await expect(supportTable).toContainText(fixture.expected.supportB);
    await expect(supportTable).toContainText(String(fixture.expected.supportReaction_N));
    await expect(supportTable).toContainText(String(fixture.expected.supportReaction_kgf));

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');

    await expect(reportMarkdown).toContainText(fixture.expected.supportA);
    await expect(reportMarkdown).toContainText(fixture.expected.supportB);
    await expect(reportMarkdown).toContainText(fixture.expected.supportAType);
    await expect(reportMarkdown).toContainText(fixture.expected.supportBType);
    await expect(reportMarkdown).toContainText(String(fixture.expected.supportAFriction));
    await expect(reportMarkdown).toContainText(String(fixture.expected.supportBFriction));
    await expect(reportMarkdown).toContainText(fixture.expected.restraintAText);
    await expect(reportMarkdown).toContainText(fixture.expected.restraintBText);

    const reportJson = page.getByTestId('3d-simplified-report-json');

    await expect(reportJson).toContainText(fixture.expected.supportA);
    await expect(reportJson).toContainText(fixture.expected.supportB);
  });
});