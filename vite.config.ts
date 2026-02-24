import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // @mediapipe/face_mesh loads WASM and model files at runtime from CDN.
    // Excluding it from pre-bundling prevents Vite from corrupting the WASM binary.
    exclude: ['@mediapipe/face_mesh'],
  },
});
