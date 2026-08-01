#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const host = '127.0.0.1';
const port = 4187;
const baseUrl = `http://${host}:${port}`;
const demoUrl = `${baseUrl}/Advanced_Analysis/demo-only/lfea-phase6h/`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', host, '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let browser;
try {
  await waitForServer(demoUrl);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(demoUrl, { waitUntil: 'networkidle' });

  await assertLoaded(page);
  await assertMalformedInputFailsClosed(page);

  console.log(JSON.stringify({
    check: 'lfea-phase6h-demo-browser',
    status: 'PASS',
    validSampleRendered: true,
    malformedInputFailedClosed: true,
    recordRows: 7,
    fallbackUsed: false,
  }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

async function assertLoaded(page) {
  await page.waitForFunction(() => document.querySelectorAll('#records tr').length === 7);
  assert.match(await page.locator('#load-status').textContent(), /Loaded approved demo sample\.json/u);
  assert.match(await page.locator('#guard').textContent(), /PASS — demo sample is segregated/u);
  assert.equal(await page.locator('#records tr').count(), 7);
  assert.match(await page.locator('#identity').textContent(), /617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54/u);
  assert.equal(await page.locator('#download').isDisabled(), false);
}

async function assertMalformedInputFailsClosed(page) {
  await page.route('**/sample.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schema: 'malformed' }),
    });
  });
  await page.locator('#reload').click();
  await page.waitForFunction(() => document.querySelector('#guard')?.textContent?.includes('FAIL CLOSED'));
  assert.match(await page.locator('#load-status').textContent(), /rejected/u);
  assert.equal(await page.locator('#records tr').count(), 0);
  assert.equal(await page.locator('#download').isDisabled(), true);
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the preview server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Preview server did not become ready: ${url}`);
}
