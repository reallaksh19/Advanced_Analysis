import { defineConfig } from 'vite';

const buildTime = new Date().toISOString();

function manualChunk(id) {
  const source = id.replaceAll('\\', '/');
  if (source.includes('vite/preload-helper')) return 'runtime';
  if (source.includes('/node_modules/three/examples/')) return 'vendor-three-examples';
  if (source.includes('/node_modules/three/')) return 'vendor-three-core';
  if (source.includes('/src/core/element-fea/')) return 'core-element-fea';
  if (source.includes('/src/core/local-continuum/')) return 'core-local-continuum';
  if (source.includes('/src/core/local-shell/')) return 'core-local-shell';
  if (source.includes('/src/core/local-stress/')) return 'core-local-stress';
  if (source.includes('/src/core/local-attachment-screening/')) return 'core-attachment-screening';
  if (source.includes('/src/core/local-trunnion-footprint/')) return 'core-trunnion-footprint';
  if (source.includes('/src/core/fea-benchmarks/')
    || source.includes('/src/workspace/fea-benchmark')
    || source.includes('/src/workspace/lafea-')
    || source.includes('/src/workspace/lfea-')
    || source.endsWith('/src/workspace/workbench-dom.js')) return 'fea-workbenches';
  if (source.includes('/src/core/')) return 'core-application';
  if (source.includes('/src/calc-workspace/')
    || source.includes('/src/vendors/')
    || source.includes('/src/utils/')
    || source.includes('/src/mocks/')) return 'application-support';
  return undefined;
}

export default defineConfig({
  base: '/Advanced_Analysis/',
  plugins: [],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: manualChunk,
        onlyExplicitManualChunks: true,
      },
    },
  },
  server: {
    watch: {
      ignored: ['**/benchmarks/**', '**/reports/**', '**/playwright-report/**'],
    },
  },
});
