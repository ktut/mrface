import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true, // listen on 0.0.0.0 so you can access from iOS on same Wi‑Fi
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh'],
  },
});
