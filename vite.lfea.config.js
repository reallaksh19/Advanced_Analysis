import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { manualChunk } from './vite.config.js';

const buildTime = new Date().toISOString();

export default defineConfig({
  base: '/Advanced_Analysis/',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    modulePreload: false,
    outDir: 'dist-lfea',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        lfea: fileURLToPath(new URL('./lfea.html', import.meta.url)),
      },
      output: {
        manualChunks: manualChunk,
        onlyExplicitManualChunks: false,
      },
    },
  },
});
