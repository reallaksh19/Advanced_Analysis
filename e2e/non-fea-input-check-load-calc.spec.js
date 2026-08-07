import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'NON-FEA-INPUT-CHECK-UI',
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

test('integrates preflight, Project Data, enrichment, checker and explicit seal inside Load Calc', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'non-fea-input-check.json', STAGED_PACKAGE);

  const applicationNav = page.getByRole('navigation', { name: 'Application views' });
  await applicationNav.getByRole('button', { name: 'Edit, Topo fix and Load Calc', exact: true }).click();
  const consumer = page.locator('[data-role="load-calc-consumer"]');
  await expect(consumer).toHaveCount(1);

  await loadCalcTab(consumer, 'preflight').click();
  const inputCheck = page.locator('[data-role="non-fea-input-check"]');
  await expect(inputCheck).toBeVisible();
  await expect(inputCheck).toContainText('PHASE 1 · PREFLIGHT CONSOLIDATION');
  await expect(inputCheck).toContainText('NON-FEA ONLY');
  await expect(inputCheck).toContainText('EIGHT-GATE WORKFLOW');
  await expect(inputCheck.locator('[data-role="non-fea-project-audits"] [data-preflight-workflow]')).toHaveCount(3);
  await expect(inputCheck.locator('[data-role="non-fea-source-evidence"]')).toContainText('Shared piping model');
  const routeEvidence = inputCheck.locator('[data-role="non-fea-route-evidence"]');
  await expect(routeEvidence).toContainText('Route partitions');
  await expect(routeEvidence).toContainText('Route partitions are not available.');

  const initialEnrichment = inputCheck.locator('[data-role="non-fea-enrichment-authority"]');
  await expect(initialEnrichment).toHaveAttribute('data-status', 'NOT_EVALUATED');
  await expect(initialEnrichment).toContainText('No accepted common-enrichment sidecar');
  const initialCommon = inputCheck.locator('[data-role="non-fea-common-input-authority"]');
  await expect(initialCommon).toBeVisible();
  await expect(initialCommon).toHaveAttribute('data-seal-state', 'NOT_SEALED');
  await expect(initialCommon).toContainText('COMMON CHECKER & SEAL');
  await expect(inputCheck.locator('[data-method-id]')).toHaveCount(9);
  await expect(inputCheck.locator('[data-method-id] .non-fea-chip')).toHaveText([
    ...Array(8).fill('BLOCKED'),
    'READY',
  ]);
  await expect(
    inputCheck.locator('[data-method-id="ENRICHED_STAGED_JSON_EXPORT"] .non-fea-chip'),
  ).toHaveText('READY');
  await expect(inputCheck).toContainText('Historical legacy authority');
  await expect(inputCheck).not.toContainText('First Cut');

  await inputCheck.getByRole('button', { name: 'Edit Project Data' }).click();
  const projectData = page.locator('[data-role="non-fea-project-data"]');
  await expect(projectData).toBeVisible();
  await expect(projectData).toHaveAttribute('data-phase', '2');
  await expect(projectData).toContainText('NON-FEA · PHASE 2');
  await expect(projectData).toContainText('NO UNDOCUMENTED FALLBACK');
  await expect(projectData).toContainText('DETERMINISTIC STALENESS');
  const ownership = projectData.locator('[data-role="non-fea-field-ownership-matrix"]');
  await expect(ownership).toContainText('SOURCE_EXPLICIT');
  await expect(ownership).toContainText('EXACT_APPROVED_MASTER');
  await expect(ownership).toContainText('PROJECT_CONFIGURED_DEFAULT');
  await expect(ownership).toContainText('SUPPORT_AVAILABILITY_SENSITIVITY');
  const thermoMechanicalGroup = projectData.locator('#phase2-thermoMechanicalBasis');
  await thermoMechanicalGroup.locator('summary').click();
  const signedTemperature = projectData.locator('[data-project-value="thermoMechanicalBasis.installationTemperatureC"]');
  await expect(signedTemperature).toBeVisible();
  expect(await signedTemperature.getAttribute('min')).toBeNull();

  await loadCalcTab(consumer, 'enrichment').click();
  const enrichment = page.locator('[data-role="non-fea-enrichment"]');
  await expect(enrichment).toBeVisible();
  await expect(enrichment).toContainText('PHASE 3 · ENRICHMENT & OVERRIDES');
  await expect(enrichment).toContainText('exact selectors only');
  await expect(enrichment).toContainText('PROPOSAL / ACCEPTANCE');
  await expect(enrichment).toContainText('FIELD-RESOLUTION LEDGER');
  await expect(enrichment).toContainText('IMPACT PREVIEW');
  await expect(enrichment).toContainText('LEGACY COMPATIBILITY');
  await expect(enrichment).not.toContainText('First Cut');

  const form = enrichment.locator('[data-enrichment-proposal-form]');
  await form.locator('[name="recordId"]').fill('UI-ELASTIC-MODULUS');
  await form.locator('[name="selectorKind"]').selectOption('ENTITY');
  await form.locator('[name="selectorKey"]').fill('PIPE-A');
  await form.locator('[name="fieldId"]').selectOption('ELASTIC_MODULUS');
  await form.locator('[name="value"]').fill('200000');
  await form.locator('[name="unit"]').fill('MPa');
  await form.locator('[name="authority"]').selectOption('ACCEPTED_OVERRIDE');
  await form.locator('[name="sourceId"]').fill('UI-REVIEWED-EVIDENCE');
  await form.locator('[name="revision"]').fill('1');
  await form.getByRole('button', { name: 'Stage proposal' }).click();
  const proposals = page.locator('[data-role="enrichment-proposals"]');
  await expect(proposals).toContainText('UI-ELASTIC-MODULUS');
  const acceptExact = proposals.getByRole('button', { name: 'Accept exact' });
  await acceptExact.scrollIntoViewIfNeeded();
  await expect(acceptExact).toBeVisible();
  await acceptExact.click();
  await expect(page.locator('[data-role="enrichment-accepted"]')).toContainText('UI-ELASTIC-MODULUS');
  await expect(page.locator('[data-role="enrichment-resolution"]')).toContainText('ACCEPTED_OVERRIDE');
  const impact = page.locator('[data-role="enrichment-impact"]');
  await expect(impact).toContainText('Source mutation');
  await expect(impact).toContainText('Support removal');
  await expect(impact).toContainText('NONE');

  await loadCalcTab(consumer, 'preflight').click();
  const currentEnrichment = page.locator('[data-role="non-fea-enrichment-authority"]');
  await expect(currentEnrichment).toHaveAttribute('data-status', 'READY');
  const enrichmentGate = inputCheck.locator('[data-enrichment-gate-state="READY"]');
  await expect(enrichmentGate).toContainText('E_ENRICHMENT');

  await loadCalcTab(consumer, 'method-basis').click();
  const methodBasis = page.locator('[data-role="non-fea-method-basis"]');
  await expect(methodBasis).toBeVisible();
  await expect(methodBasis).toContainText('PHASE 4 · COMMON CHECKER + IMPLEMENTATION BINDING');
  await expect(methodBasis).toContainText('METHOD PURPOSE → IMPLEMENTATION');
  await expect(methodBasis).toContainText('Input readiness and executable implementation readiness are evaluated separately.');
  await expect(methodBasis.locator('[data-common-method-id]')).toHaveCount(9);
  await expect(methodBasis).toContainText('BLOCKED_INPUT');
  const loadCaseAuthority = methodBasis.locator('[data-role="method-basis-load-case-authority"]');
  await expect(loadCaseAuthority).toContainText('Project Data-approved load cases');
  await expect(loadCaseAuthority).toContainText('EMPTY');
  await expect(loadCaseAuthority).toContainText('OPE');
  await expect(loadCaseAuthority).toContainText('HYD');
  await expect(methodBasis).toContainText('No profile selected');
  const exportMethod = methodBasis.locator('[data-common-method-id="ENRICHED_STAGED_JSON_EXPORT"]');
  await expect(exportMethod).toContainText('COMMON_INPUT_EXPORT_V1');
  await expect(exportMethod).toContainText('READY_TO_AUTHORIZE');

  await loadCalcTab(consumer, 'seal-export').click();
  const sealExport = page.locator('[data-role="non-fea-seal-export"]');
  await expect(sealExport).toBeVisible();
  await expect(sealExport).toContainText('PHASE 4 · EXPLICIT SEAL');
  await expect(sealExport).toContainText('No common input seal');
  await expect(sealExport).toContainText('Evaluation, sealing, export and calculation remain separate explicit actions.');
  await expect(sealExport.getByRole('button', { name: 'Seal common input' })).toBeEnabled();
  await expect(sealExport.getByRole('button', { name: 'Create deterministic export' })).toBeDisabled();

  await expect(page.locator('[data-role="first-cut-workbench-root"]')).toHaveCount(0);
  await expect(page.locator('[data-section-id="first-cut"]')).toHaveCount(0);
  await expect(applicationNav.getByRole('button', { name: 'Input Check', exact: true })).toHaveCount(0);
  await expect(applicationNav.getByRole('button', { name: 'Method Basis', exact: true })).toHaveCount(0);
  await expect(applicationNav.getByRole('button', { name: 'Seal & Export', exact: true })).toHaveCount(0);
});

function loadCalcTab(consumer, tabId) {
  return consumer.locator('.empirical-load-calc__tabs').locator(`[data-load-calc-tab="${tabId}"]`);
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

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
