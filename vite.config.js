import { defineConfig } from 'vite';

const buildTime = new Date().toISOString();

/**
 * Keep manual chunking limited to dependency-oriented or calculation-core
 * domains. Workspace modules remain graph-owned because they contain stores,
 * controllers, views, and top-level singleton instances with cross-feature
 * imports.
 */
export function manualChunk(id) {
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
  if (source.includes('/src/core/linear-fea-')) return 'core-linear-fea';
  if (source.includes('/src/core/linear-piping-')) return 'core-linear-piping';
  if (source.includes('/src/core/support-')) return 'core-support-engineering';
  if (source.includes('/src/core/vertical-beam-solver/')
    || source.includes('/src/core/centerline-beam-fea/')) return 'core-beam-analysis';
  if (source.includes('/src/core/first-cut-load-estimation/')) return 'core-load-estimation';
  if (source.includes('/src/core/model-calculation-package/')) return 'core-model-calculation';
  if (source.includes('/src/core/piping-topology/')
    || source.includes('/src/core/shared-piping-model/')) return 'core-piping-model';
  if (source.includes('/src/core/fea-benchmarks/')) return 'core-fea-benchmarks';
  if (source.includes('/src/core/')) return 'core-application';
  if (source.includes('/src/calc-workspace/cii-standalone-port/ui-adapted/')) {
    return 'cii-standalone-ui';
  }
  if (source.includes('/src/calc-workspace/cii-standalone-port/')) {
    return 'cii-standalone-core';
  }
  if (source.includes('/src/calc-workspace/')) return 'calculation-workspaces';
  if (source.includes('/src/vendors/')) return 'vendor-integrations';
  if (source.includes('/src/utils/') || source.includes('/src/mocks/')) return 'application-support';

  // Rollup must own the complete workspace graph so evaluation order follows
  // its static dependency analysis rather than filename-based partitions.
  if (source.includes('/src/workspace/')) return undefined;
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
        // Allow dependencies of a selected manual chunk to move with that
        // chunk. Explicit-only ownership created circular chunks and TDZ
        // failures in the generated ESM graph.
        onlyExplicitManualChunks: false,
      },
    },
  },
  server: {
    watch: {
      ignored: ['**/benchmarks/**', '**/reports/**', '**/playwright-report/**'],
    },
  },
});
