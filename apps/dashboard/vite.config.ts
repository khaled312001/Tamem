import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The default 500kB warning fires on the main bundle; we explicitly split
    // the heavy libraries below so the initial JS the admin downloads is a lot
    // smaller and the rest streams in as needed.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — loaded by everything, so keep it together.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Charts only used on /overview + /reports
          recharts: ['recharts'],
          // Leaflet only used on /orders?view=map and /merchants
          leaflet: ['leaflet'],
          // tanstack query — touched on every page but big enough to isolate
          query: ['@tanstack/react-query'],
          // axios + the api client
          'api-client': ['axios', '@tamem/api-client'],
        },
      },
    },
  },
});
