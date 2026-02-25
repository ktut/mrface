/**
 * Application constants — edit this file to tune behaviour across the app.
 */

export const CONFIG = {
  // ─── Helmet ─────────────────────────────────────────────────────────────────
  HELMET: {
    OBJ_URL: '/models/Helmet__Sfera_v1_L1.123c237682f7-5c65-4abc-81fb-c187b7186453/18893_Helmet-Sfera_v1.obj',
    SCALE_FACTOR: 1.0,       // Size relative to head (1.0 = head size, >1 = larger)
    OFFSET_UP: 0.47,         // Up/down: fraction of head radius (+ = up)
    OFFSET_BACK: 0.72,       // Forward/back: fraction of head radius (+ = back)
    MATERIAL: {
      COLOR: 0xc0c0c8,
      ROUGHNESS: 0.08,
      METALNESS: 0.92,
    },
  },

  // ─── Head (face mesh + back shell) ───────────────────────────────────────────
  HEAD: {
    BACK_SHELL: {
      DEPTH_FACTOR: 0.5,     // Back shell depth = width * this
      TAPER_MIN: 0.94,
      TAPER_MAX: 0.04,       // taper = TAPER_MIN + TAPER_MAX * tNorm
      RING1_TAPER: 0.97,
      RING2_TAPER: 0.96,
      FOREHEAD_BULGE: 0.1,    // fraction of depth
      DOME_HEIGHT: 0.18,     // fraction of depth
    },
    MATERIAL: {
      BACK_ROUGHNESS: 0.9,
      BACK_METALNESS: 0.0,
      FACE_ROUGHNESS: 0.75,
      FACE_METALNESS: 0.0,
      FACE_OVAL_INSET: 0.02, // clip inset to avoid hair at perimeter
      SKIN_FALLBACK: 0xd4956a,
    },
    TEXTURE: {
      WIDTH: 512,
      HEIGHT: 512,
      JPEG_QUALITY: 0.85,
    },
    SKIN_SAMPLE_PATCH_SIZE: 24,
  },

  // ─── Scene & rendering ──────────────────────────────────────────────────────
  SCENE: {
    BACKGROUND: 0x0a0a0f,
    CAMERA: {
      FOV: 45,
      NEAR: 0.01,
      FAR: 100,
      INITIAL_POSITION: [0, 0, 2.5] as [number, number, number],
    },
    CONTROLS: {
      DAMPING_FACTOR: 0.05,
      MIN_DISTANCE: 1,
      MAX_DISTANCE: 6,
    },
    LIGHTS: {
      AMBIENT: { COLOR: 0xffffff, INTENSITY: 0.35 },
      KEY: { COLOR: 0xfff5e0, INTENSITY: 1.8, POSITION: [1, 2, 2] as [number, number, number] },
      FILL: { COLOR: 0xc0d8ff, INTENSITY: 0.6, POSITION: [-2, 0, 1] as [number, number, number] },
      RIM: { COLOR: 0xffffff, INTENSITY: 0.4, POSITION: [0, -1, -2] as [number, number, number] },
      SHADOW_MAP_SIZE: 1024,
    },
    ENV_MAP_SIZE: 256,
    PLACEHOLDER: {
      RADIUS: 0.6,
      SEGMENTS: 32,
      COLOR: 0x334455,
      ROUGHNESS: 0.8,
      METALNESS: 0.1,
      OPACITY: 0.35,
    },
    IDLE_ROTATION_SPEED: 0.002,
  },

  // ─── Face capture (MediaPipe) ───────────────────────────────────────────────
  FACE_CAPTURE: {
    MIN_DETECTION_CONFIDENCE: 0.5,
    MIN_TRACKING_CONFIDENCE: 0.5,
    Z_SCALE: 0.5,            // Landmark z → Three.js z
  },
} as const;
