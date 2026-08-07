import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config.js';

const ui1TestOverlay = defineConfig({
  plugins: [
    {
      name: 'ui1-embedded-layout-harness',
      transformIndexHtml(html) {
        return html.replace(
          '/src/main.js',
          '/e2e/fixtures/ui1-embedded-shell-entry.js',
        );
      },
    },
  ],
});

export default mergeConfig(baseConfig, ui1TestOverlay);
