import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        home: resolve('index.html'),
        launch: resolve('games/launch/index.html'),
        launchPractice: resolve('games/launch/practica-ascenso.html'),
        rover: resolve('games/rover/index.html'),
      },
    },
  },
});
