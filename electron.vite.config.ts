import { defineConfig, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const repoRoot = import.meta.dirname;

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env };
  const office = env.VITE_OFFICE_URL || 'http://127.0.0.1:4317';
  return {
    main: {},
    preload: {},
    renderer: {
      root: resolve(repoRoot, 'src/renderer'),
      base: './',
      plugins: [react()],
      server: {
        host: '127.0.0.1',
        port: Number(env.WEB_PORT || 4318),
        proxy: {
          '/api': { target: office, changeOrigin: true },
          '/media': { target: office, changeOrigin: true },
          '/ws': { target: office, changeOrigin: true, ws: true },
        },
        fs: { allow: [repoRoot] },
      },
      build: {
        rollupOptions: { input: resolve(repoRoot, 'src/renderer/index.html') },
        chunkSizeWarningLimit: 2000,
      },
    },
  };
});
