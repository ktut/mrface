import { SceneManager } from './rendering/SceneManager';
import { FaceCapture } from './character/face-capture/FaceCapture';
import { FaceMeshBuilder } from './character/mesh-builder/FaceMeshBuilder';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container') as HTMLElement;
const statusEl  = document.getElementById('status')           as HTMLElement;
const uploadBtn = document.getElementById('upload-btn')        as HTMLButtonElement;
const fileInput = document.getElementById('file-input')        as HTMLInputElement;

// ─── Core objects ─────────────────────────────────────────────────────────────
const sceneManager   = new SceneManager(container);
const faceCapture    = new FaceCapture();
const faceMeshBuilder = new FaceMeshBuilder();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg: string) {
  statusEl.textContent = msg;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────
async function processImage(img: HTMLImageElement) {
  uploadBtn.disabled = true;

  try {
    setStatus('Detecting face landmarks…');
    const landmarks = await faceCapture.detectFromImage(img);

    if (!landmarks) {
      setStatus('No face detected — try a clearer front-facing photo.');
      return;
    }

    setStatus(`Found ${landmarks.length} landmarks — building mesh…`);
    const headGroup = await faceMeshBuilder.build(landmarks, img);

    sceneManager.setCharacterHead(headGroup);
    setStatus('Done! Drag to orbit · scroll to zoom.');
  } catch (err) {
    console.error('[processImage]', err);
    setStatus('Error processing image — check the console for details.');
  } finally {
    uploadBtn.disabled = false;
  }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    await processImage(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
    fileInput.value = ''; // reset so the same file can be re-selected
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    setStatus('Initialising MediaPipe Face Mesh…');
    await faceCapture.init();
    uploadBtn.disabled = false;
    setStatus('Loading default face…');
    try {
      const img = await loadImage('/test-face.png');
      await processImage(img);
    } catch {
      setStatus('Ready — upload a face photo to get started.');
    }
  } catch (err) {
    console.error('[init]', err);
    setStatus('Failed to load MediaPipe — check your internet connection.');
  }
}

init();
