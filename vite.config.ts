import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, 'dist');
const DIST_TEST = path.join(DIST, 'test');

/** Exclude public/test/ from the build output so test assets are not sent to the client. */
function excludePublicTest() {
  return {
    name: 'exclude-public-test',
    closeBundle() {
      try {
        if (fs.existsSync(DIST_TEST)) {
          fs.rmSync(DIST_TEST, { recursive: true });
        }
      } catch {
        // ignore
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    excludePublicTest(),
  ],
  server: {
    port: 5173,
    host: true, // listen on 0.0.0.0 so you can access from iOS on same Wi‑Fi
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh'],
  },
});
