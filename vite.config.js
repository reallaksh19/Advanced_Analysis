import { defineConfig } from 'vite';

const buildTime = new Date().toISOString();

const WORKSPACE_ANALYSIS_PREFIXES = Object.freeze([
  'analysis-',
  'model-',
  'shared-model-',
  'support-',
  'topology-',
  'vertical-beam-',
]);

const WORKSPACE_DATA_PREFIXES = Object.freeze([
  'dataset',
  'json-trace-',
  'master-data-',
  'properties-',
  'settings-',
  'tree-',
  'workspace-consumer-',
  'workspace-state',
]);

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
  if (source.includes('/src/core/fea-benchmarks/')
    || source.includes('/src/workspace/fea-benchmark')
    || source.includes('/src/workspace/lafea-')
    || source.includes('/src/workspace/lfea-')
    || source.endsWith('/src/workspace/workbench-dom.js')) return 'fea-workbenches';
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
  if (source.includes('/src/workspace/topology-edit/')) {
  return 'workspace-topology-edit-core';
}
if (source.includes('/src/workspace/topology-edit-3d-')
  || source.includes('/src/workspace/viewport-productivity/')
  || source.includes('/src/workspace/viewport-interaction/')
  || source.includes('/src/workspace/viewport-presentation/')) {
  return 'workspace-topology-edit-ui';
}
  if (source.includes('/src/workspace/enrichment/')
    || source.includes('/src/workspace/first-cut-')) return 'workspace-enrichment';
  if (source.includes('/src/workspace/linear-piping')) return 'workspace-linear-piping';
  if (source.includes('/src/workspace/')) {
    const fileName = source.slice(source.lastIndexOf('/') + 1);
    if (WORKSPACE_ANALYSIS_PREFIXES.some((prefix) => fileName.startsWith(prefix))) {
      return 'workspace-analysis';
    }
    if (WORKSPACE_DATA_PREFIXES.some((prefix) => fileName.startsWith(prefix))) {
      return 'workspace-data';
    }
    return 'workspace-shell';
  }
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
