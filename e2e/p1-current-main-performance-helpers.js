import { expect } from '@playwright/test';

export async function armAction(page, actionId, metadata, trigger) {
  await page.evaluate(({ actionId: id, metadata: data, trigger: source }) => (
    globalThis.__P1_Q0_OBSERVER__.arm(id, data, source)
  ), { actionId, metadata, trigger });
}

export async function beginAction(page, actionId, metadata = {}) {
  return page.evaluate(({ actionId: id, metadata: data }) => (
    globalThis.__P1_Q0_OBSERVER__.begin(id, data)
  ), { actionId, metadata });
}

export async function endAction(page, status = 'PASS', metadata = {}) {
  return page.evaluate(({ status: result, metadata: data }) => (
    globalThis.__P1_Q0_OBSERVER__.end(result, data)
  ), { status, metadata });
}

export async function waitForMeasuredRender(page, timeout = 10_000) {
  await expect.poll(() => page.evaluate(() => (
    globalThis.__P1_Q0_OBSERVER__.hasMeasuredRender()
  )), { timeout }).toBe(true);
}

export async function selectionSamples(page, count) {
  const entities = page.locator('[data-entity-id]');
  await expect(entities.first()).toBeVisible();
  const available = await entities.count();
  if (available < 2) throw new Error('P1 selection qualification requires two entities.');
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const target = entities.nth(index % 2);
    await armAction(page, 'SELECTION_ONLY', { sample: index }, 'ENTITY_CLICK');
    await target.click();
    await waitForMeasuredRender(page);
    samples.push((await endAction(page)).durationMs);
  }
  return samples;
}

export async function orbitPanSamples(page, count) {
  const orbitButton = page.locator('[data-viewport-action="mode-orbit"]');
  if (await orbitButton.count()) await orbitButton.click();
  const canvas = page.locator('canvas[data-viewport-backend="webgl"]');
  await expect(canvas).toHaveCount(1);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('WebGL canvas has no bounding box.');
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    await armAction(page, 'ORBIT_PAN', { sample: index }, 'VIEWPORT_POINTER_DOWN');
    const x = box.x + (box.width * (0.4 + ((index % 3) * 0.05)));
    const y = box.y + (box.height * 0.5);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(x + 8, y + 4, { steps: 2 });
    await page.mouse.up({ button: 'left' });
    await waitForMeasuredRender(page);
    samples.push((await endAction(page)).durationMs);
  }
  return samples;
}

export async function eventAction(page, actionId, reason) {
  await page.evaluate(({ actionId: id, reason: eventReason }) => {
    globalThis.__P1_Q0_OBSERVER__.begin(id, { reason: eventReason });
    globalThis.EventBus.publish('engineering-support-loads:changed', { reason: eventReason });
  }, { actionId, reason });
  await waitForFrames(page, 2);
  return endAction(page);
}

export async function masterDataAction(page) {
  await page.evaluate(async () => {
    const { masterDataController } = await import('/src/workspace/master-data-controller.js');
    const current = masterDataController.getMasterData().lineList.fieldMap;
    globalThis.__P1_Q0_OBSERVER__.begin('MASTER_DATA_CHANGED', {
      method: 'masterDataController.setFieldMap', masterKey: 'lineList',
    });
    masterDataController.setFieldMap('lineList', { ...current });
  });
  await waitForFrames(page, 2);
  return endAction(page);
}

export async function projectDataAction(page) {
  await page.evaluate(async () => {
    const { projectDataStore } = await import('/src/workspace/project-data/project-data-store.js');
    globalThis.__P1_Q0_OBSERVER__.begin('PROJECT_DATA_CHANGED', {
      method: 'projectDataStore.restoreApprovedProfile',
    });
    projectDataStore.restoreApprovedProfile();
  });
  await waitForFrames(page, 2);
  return endAction(page);
}

export async function modelZoneAction(page) {
  const result = await page.evaluate(() => {
    const selector = document.querySelector('[data-role="model-zone-selector"]');
    if (!selector) throw new Error('Model-zone selector missing.');
    const optionCount = selector.options.length;
    globalThis.__P1_Q0_OBSERVER__.begin('MODEL_ZONE_CHANGE', { optionCount });
    if (optionCount <= 1) return { skipped: true };
    selector.selectedIndex = 1;
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    return { skipped: false };
  });
  if (result.skipped) return endAction(page, 'SKIPPED', { reason: 'NO_EXPLICIT_MODEL_ZONES' });
  await waitForFrames(page, 2);
  return endAction(page);
}

export async function contextRestoreAction(page) {
  const context = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas[data-viewport-backend="webgl"]');
    if (!canvas) throw new Error('WebGL canvas missing.');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl?.getExtension?.('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is unavailable.');
    const waitFor = (name) => new Promise((resolve) => {
      canvas.addEventListener(name, resolve, { once: true });
    });
    globalThis.__P1_Q0_OBSERVER__.begin('CONTEXT_RESTORATION', {
      extension: 'WEBGL_lose_context',
    });
    const lost = waitFor('webglcontextlost');
    extension.loseContext();
    await lost;
    const restored = waitFor('webglcontextrestored');
    extension.restoreContext();
    await restored;
    const host = document.querySelector('[data-role="viewport-render-host"]');
    return { contextStatus: host?.dataset?.contextStatus || null };
  });
  await waitForFrames(page, 3);
  return endAction(page, 'PASS', context);
}

export async function clearReloadAction(page, fixturePath) {
  await beginAction(page, 'CLEAR_RELOAD');
  await page.locator('[data-action="clear-dataset"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.().status
  ))).toBe('empty');
  await page.locator('[data-role="dataset-file"]').setInputFiles(fixturePath);
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.().status
  )), { timeout: 120_000 }).toBe('ready');
  await waitForMeasuredRender(page, 120_000);
  return endAction(page);
}

export async function waitForFrames(page, count) {
  await page.evaluate((frameCount) => new Promise((resolve) => {
    let remaining = frameCount;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), count);
}
