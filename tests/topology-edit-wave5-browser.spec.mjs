import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const HOST = '127.0.0.1';
const PORT = 41735;
const OUTPUT = path.resolve('reports/qualification/topology-edit-wave5-browser.json');

test('exact-head Chromium qualifies large-model rendering, picking, and lifecycle', {
  timeout: 300_000,
}, async () => {
  const server = startServer();
  try {
    await waitForServer(server);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(`http://${HOST}:${PORT}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      assert.ok(response && response.ok(), 'Vite did not return the application shell.');
      const evidence = await page.evaluate(async () => {
        const harness = await import('/tests/topology-edit-wave5-browser-harness.js');
        return harness.runTopologyEditWave5BrowserHarness({
          componentCount: 25_600,
          pickSampleCount: 40,
          frameSampleCount: 40,
        });
      });
      assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
      assert.equal(
        evidence.status,
        'PASS_BROWSER_INFRASTRUCTURE',
        JSON.stringify(evidence, null, 2),
      );
      await mkdir(path.dirname(OUTPUT), { recursive: true });
      await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
});

function startServer() {
  const child = spawn(NPM, [
    'run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: 'none', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  child.output = [];
  child.stdout.on('data', (chunk) => child.output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => child.output.push(chunk.toString()));
  return child;
}

async function waitForServer(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited early.\n${child.output.join('')}`);
    }
    try {
      const response = await fetch(`http://${HOST}:${PORT}/`);
      if (response.status >= 200 && response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Vite did not become ready.\n${child.output.join('')}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    await new Promise((resolve) => killer.once('exit', resolve));
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}
