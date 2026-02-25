/**
 * FaceCapture.ts
 * Wraps the @mediapipe/face_mesh FaceMesh model to extract 468 3D landmarks
 * from a single still image and convert them to Three.js world-space coords.
 *
 * ─── Coordinate system notes (for future AI assistants) ─────────────────────
 *
 * MediaPipe FaceMesh returns NormalizedLandmarkList with 468 entries.
 * Each entry: { x, y, z, visibility? }
 *
 *   x — horizontal, 0 = left edge of image, 1 = right edge (mirrored for selfie)
 *   y — vertical,   0 = top  edge of image, 1 = bottom edge
 *   z — depth relative to face size; 0 = face centroid plane, negative = closer
 *        to camera. Magnitude is roughly proportional to interocular distance.
 *
 * Three.js uses a right-handed coordinate system:
 *   +X = right,  +Y = up,  +Z = toward viewer
 *
 * Conversion applied here:
 *   three.x = -(mp.x - 0.5)   → centre & flip so left = negative
 *   three.y = -(mp.y - 0.5)   → centre & flip so up   = positive
 *   three.z = -mp.z * 0.5     → flip & scale to give real depth (≈0–0.5 range)
 *
 * The resulting landmarks span roughly ±0.5 in X/Y and 0–0.5 in Z.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// @mediapipe/face_mesh is an IIFE bundle — it injects itself onto globalThis
// (window.FaceMesh, window.VERSION, etc.) rather than using ES module exports.
// We must load it via a <script> tag so the IIFE runs, then read window.FaceMesh.
// Types are imported separately so TypeScript is happy.
import type { FaceMesh as FaceMeshType, Results } from '@mediapipe/face_mesh';
import { CONFIG } from '../../config';

/** A single landmark already converted to Three.js coordinate space. */
export interface Landmark3D {
  x: number; // −0.5 … +0.5  (right is positive)
  y: number; // −0.5 … +0.5  (up   is positive)
  z: number; //  0   … +0.15 (toward viewer is positive)
}

/** Inject the MediaPipe face_mesh script tag and wait for it to load. */
function loadMediaPipeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded?
    if ((window as unknown as Record<string, unknown>)['FaceMesh']) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
    script.crossOrigin = 'anonymous';
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Failed to load @mediapipe/face_mesh from CDN'));
    document.head.appendChild(script);
  });
}

export class FaceCapture {
  private faceMesh!: FaceMeshType;
  private resolveDetection?: (lm: Landmark3D[] | null) => void;
  /** Serialize detection so results always match the image we sent (no cross-talk). */
  private lastDetection: Promise<Landmark3D[] | null> = Promise.resolve(null);

  /**
   * Initialise the MediaPipe FaceMesh model.
   * Downloads the IIFE bundle + WASM from jsDelivr CDN (~8 MB on first load).
   * Safe to call once at app startup; subsequent detectFromImage calls are fast.
   */
  async init(): Promise<void> {
    // 1. Inject the <script> tag so the IIFE runs and sets window.FaceMesh.
    await loadMediaPipeScript();

    // 2. Read from globalThis — cast needed because TS doesn't know about it.
    const FaceMesh = (window as unknown as Record<string, unknown>)['FaceMesh'] as
      new (config: { locateFile: (f: string) => string }) => FaceMeshType;

    this.faceMesh = new FaceMesh({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this.faceMesh.setOptions({
      maxNumFaces:           1,
      refineLandmarks:       true,
      minDetectionConfidence: CONFIG.FACE_CAPTURE.MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence:  CONFIG.FACE_CAPTURE.MIN_TRACKING_CONFIDENCE,
    });

    this.faceMesh.onResults((results: Results) => {
      const raw = results.multiFaceLandmarks?.[0] ?? null;
      if (!raw) {
        this.resolveDetection?.(null);
        return;
      }

      const converted: Landmark3D[] = raw.map((lm) => ({
        x: -(lm.x - 0.5),
        y: -(lm.y - 0.5),
        z: -lm.z * CONFIG.FACE_CAPTURE.Z_SCALE,
      }));

      this.resolveDetection?.(converted);
    });

    await this.faceMesh.initialize();

    // Warmup: the first send() after init often returns stale/wrong landmarks.
    // Run one detection and discard the result so the first real run is correct.
    const warmupImg = await this.createWarmupImage();
    await this.detectFromImage(warmupImg);
  }

  /** Minimal image for pipeline warmup (1×1 pixel). */
  private createWarmupImage(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Warmup image failed'));
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    });
  }

  /**
   * Run face detection on a still image.
   * Returns 468 landmarks in Three.js space, or null if no face is found.
   * Serialized so that rapid calls (e.g. Child test then Adult test) always
   * get landmarks for the correct image, not a previous one.
   */
  async detectFromImage(img: HTMLImageElement): Promise<Landmark3D[] | null> {
    const prev = this.lastDetection;
    let resolveThis!: (lm: Landmark3D[] | null) => void;
    this.lastDetection = new Promise<Landmark3D[] | null>((resolve) => {
      resolveThis = resolve;
    });
    await prev;
    this.resolveDetection = (result) => {
      resolveThis(result);
    };
    void this.faceMesh.send({ image: img });
    return this.lastDetection;
  }
}
