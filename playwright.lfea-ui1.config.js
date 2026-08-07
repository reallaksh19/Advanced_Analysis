import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

export default defineConfig({
  ...baseConfig,
  retries: 0,
  workers: 1,
  webServer: {
    ...baseConfig.webServer,
    command: 'npx vite --config vite.lfea-ui1-test.config.js',
  },
});
