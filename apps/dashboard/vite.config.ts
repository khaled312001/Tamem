import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Dashboard is served from /super_admin/ on deliverytamem.com (production).
  // Local dev still runs at root — override with BASE=/ if needed.
  base: process.env.BASE ?? (process.env.NODE_ENV === 'production' ? '/super_admin/' : '/'),
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
    // Charts (recharts) and maps (leaflet) are deliberately NOT listed below:
    // they are reached only through React.lazy routes, so Rollup gives them
    // async chunks that load on demand instead of being preloaded up front.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — loaded by everything, so keep it together.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // tanstack query — touched on every page but big enough to isolate
          query: ['@tanstack/react-query'],
          // axios + the api client
          'api-client': ['axios', '@tamem/api-client'],
          // cn() is in the entry and clsx/tailwind-merge are also recharts
          // dependencies. Without this chunk Rollup folded clsx into recharts,
          // so the entry statically imported it and the browser modulepreloaded
          // all 412 kB of charts on every page. Keep the tiny shared utilities
          // in a chunk of their own and recharts stays off the first paint.
          'ui-utils': ['clsx', 'tailwind-merge', 'class-variance-authority'],
        },
      },
    },
  },
});
