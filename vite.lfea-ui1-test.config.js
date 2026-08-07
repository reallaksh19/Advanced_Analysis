import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config.js';
import { fileURLToPath } from 'node:url';

const pipingStub = fileURLToPath(
  new URL('./e2e/fixtures/ui1-linear-piping-run-analysis-stub.js', import.meta.url),
);

const ui1TestOverlay = defineConfig({
  optimizeDeps: {
    noDiscovery: true,
  },
  plugins: [
    {
      name: 'ui1-isolate-inherited-piping-runner-defect',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source !== './linear-piping-run-analysis.js') return null;
        if (!importer?.replaceAll('\\', '/').includes('/src/workspace/')) return null;
        return pipingStub;
      },
    },
  ],
});

export default mergeConfig(baseConfig, ui1TestOverlay);
