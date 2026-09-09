import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AndroidEasterEggs-Web/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
