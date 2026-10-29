import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
      '@config': resolve(__dirname, 'src/config'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@services': resolve(__dirname, 'src/services'),
      '@components': resolve(__dirname, 'src/components'),
      '@workers': resolve(__dirname, 'src/workers'),
      '@vision': resolve(__dirname, 'src/vision'),
      '@api': resolve(__dirname, 'src/api'),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    target: 'chrome120',

    rollupOptions: {
      input: {
        // Extension pages
        popup: resolve(__dirname, 'src/popup/index.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),

        // Background service worker (no HTML)
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),

        // Content script
        'content/content': resolve(__dirname, 'src/content/content.ts'),

        // Web Workers
        'workers/inference.worker': resolve(__dirname, 'src/workers/inference.worker.ts'),
        'workers/render.worker': resolve(__dirname, 'src/workers/render.worker.ts'),
        'workers/benchmark.worker': resolve(__dirname, 'src/workers/benchmark.worker.ts'),
      },

      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',

        // Prevent code splitting for service worker
        manualChunks(id) {
          // Mediapipe packages stay together
          if (id.includes('@mediapipe')) {
            return 'vendor/mediapipe';
          }
          if (id.includes('@tensorflow')) {
            return 'vendor/tensorflow';
          }
          if (id.includes('onnxruntime')) {
            return 'vendor/onnxruntime';
          }
          if (id.includes('react')) {
            return 'vendor/react';
          }
          // Background service worker must be standalone
          if (id.includes('service-worker')) {
            return undefined;
          }
        },
      },
    },
  },

  // Ensure WASM files are handled correctly
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@mediapipe/tasks-vision'],
  },

  // Worker files configuration
  worker: {
    format: 'es',
  },
});
