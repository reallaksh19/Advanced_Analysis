import { defineConfig } from 'vite';

const buildTime = new Date().toISOString();

export default defineConfig({
  base: '/Advanced_Analysis/',
  plugins: [],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    watch: {
      ignored: ['**/benchmarks/**', '**/reports/**'],
    },
  },
});
