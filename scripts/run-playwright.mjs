/**
 * Runs Advanced Analysis browser checks with the pinned project-local Chromium.
 *
 * Inputs: optional Playwright CLI arguments passed after the script name.
 * Output: Playwright test results and artifacts; failures return non-zero.
 * Fallback: none. A missing local browser is an explicit test failure.
 */

import { spawnSync } from 'node:child_process';

const cliPath = `${process.cwd()}/node_modules/playwright/cli.js`;
const result = spawnSync(process.execPath, [cliPath, 'test', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
