import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import process from 'node:process';
import { chromium } from 'playwright';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const HOST = '127.0.0.1';

function startProcess(args, options = {}) {
  const child = spawn(NPM, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER: 'none',
      NO_COLOR: '1',
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  child.output = output;
  return child;
}

async function stopProcess(child) {
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

async function runCommand(args, timeoutMs = 180_000) {
  const child = startProcess(args);
  const result = await Promise.race([
    new Promise((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    }),
    delay(timeoutMs).then(() => ({ timeout: true })),
  ]);

  if (result.timeout) {
    await stopProcess(child);
    assert.fail(
      `Command timed out: npm ${args.join(' ')}\n${child.output.join('')}`,
    );
  }

  assert.equal(
    result.code,
    0,
    `Command failed: npm ${args.join(' ')}\n${child.output.join('')}`,
  );
}

async function waitForServer(url, child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Server exited before readiness (${child.exitCode}).\n${
          child.output.join('')
        }`,
      );
    }

    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(
    `Server did not become ready at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${child.output.join('')}`,
  );
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/i,
    /Cannot access .* before initialization/i,
    /does not provide an export named/i,
    /Failed to fetch dynamically imported module/i,
    /circular import/i,
  ].some((pattern) => pattern.test(message));
}

async function qualifyRunningBundle({ script, port, label }) {
  const child = startProcess([
    'run',
    script,
    '--',
    '--host',
    HOST,
    '--port',
    String(port),
    '--strictPort',
  ]);

  const url = `http://${HOST}:${port}/`;
  try {
    await waitForServer(url, child);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      const criticalConsoleErrors = [];

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          isCriticalConsoleError(message.text())
        ) {
          criticalConsoleErrors.push(message.text());
        }
      });

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      assert.ok(response, `${label} did not return a document response`);
      assert.ok(
        response.status() >= 200 && response.status() < 400,
        `${label} returned HTTP ${response.status()}`,
      );

      await page.waitForTimeout(2_000);
      assert.ok(await page.locator('body').count(), `${label} rendered no body`);
      assert.deepEqual(
        pageErrors,
        [],
        `${label} raised startup page errors:\n${pageErrors.join('\n')}`,
      );
      assert.deepEqual(
        criticalConsoleErrors,
        [],
        `${label} raised critical startup console errors:\n${
          criticalConsoleErrors.join('\n')
        }`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(child);
  }
}

test(
  'development and production bundles start without topology-edit import failures',
  { timeout: 300_000 },
  async () => {
    await qualifyRunningBundle({
      script: 'dev',
      port: 41731,
      label: 'development bundle',
    });

    await runCommand(['run', 'build']);

    await qualifyRunningBundle({
      script: 'preview',
      port: 41732,
      label: 'production bundle',
    });
  },
);
