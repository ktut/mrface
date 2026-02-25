/**
 * Application constants — edit this file to tune behaviour across the app.
 */

/** True when running via `npm run dev` (Vite dev server); false in production build. */
export const IS_DEV = import.meta.env.DEV;

export const CONFIG = {
  // ─── Helmet (only head topper) ───────────────────────────────────────────────
  HELMET: {
    OBJ_URL: '/models/Helmet__Sfera_v1_L1.123c237682f7-5c65-4abc-81fb-c187b7186453/18893_Helmet-Sfera_v1.obj',
    SCALE_FACTOR: 1.0,       // Size relative to head (1.0 = head size, >1 = larger)
    OFFSET_UP: 0.47,         // Up/down: fraction of head radius (+ = up)
    OFFSET_BACK: 0.52,       // Forward/back: fraction of head radius (+ = back)
    MATERIAL: {
      COLOR: 0xc0c0c8,       // Silver default; hue overridden by UI slider (HSL)
      ROUGHNESS: 0.08,
      METALNESS: 0.92,
    },
    // Default hue for helmet (0–360). Silver ≈ 220° with low saturation.
    DEFAULT_HUE: 220,
  },

  // ─── Head (face mesh + back shell) ───────────────────────────────────────────
  HEAD: {
    // Face shape: child (rounder, e.g. toddler) vs adult (taller). Drives proportions.
    FACE_SHAPE: {
      ASPECT_CHILD_MAX: 1.15,           // height/width below this → treat as child
      CHILD_DEPTH_FACTOR: 0.55,         // rounder head for children
      ADULT_DEPTH_FACTOR: 0.5,          // base depth for adults
      ADULT_ASPECT_EXTENSION: 0.28,     // extra depth for tall faces: (aspect - 1.2) * this
      ADULT_ASPECT_THRESHOLD: 1.2,      // start extending depth above this aspect
      ADULT_HEIGHT_EXTENSION: 0.18,     // taller mesh for adults: (aspect - 1.2) * this, cap at 0.2
      NOSE_SCALE_CHILD: 0.88,           // softer nose for children (test-face.png style)
      NOSE_SCALE_ADULT: 0.85,
      CHILD_DOME_HEIGHT: 0.22,          // rounder dome for children
      ADULT_DOME_HEIGHT: 0.18,
      CHILD_FOREHEAD_BULGE: 0.12,
      ADULT_FOREHEAD_BULGE: 0.1,
    },
    BACK_SHELL: {
      DEPTH_FACTOR: 0.5,     // Default; overridden by FACE_SHAPE for child/adult
      TAPER_MIN: 0.94,
      TAPER_MAX: 0.04,       // taper = TAPER_MIN + TAPER_MAX * tNorm
      RING1_TAPER: 0.97,
      RING2_TAPER: 0.96,
      FOREHEAD_BULGE: 0.1,    // fraction of depth (overridden by FACE_SHAPE)
      DOME_HEIGHT: 0.18,     // fraction of depth (overridden by FACE_SHAPE)
    },
    MATERIAL: {
      BACK_ROUGHNESS: 0.9,
      BACK_METALNESS: 0.0,
      FACE_ROUGHNESS: 0.75,
      FACE_METALNESS: 0.0,
      FACE_OVAL_INSET: 0.02, // clip inset at face perimeter
      SKIN_FALLBACK: 0xd4956a,
    },
    TEXTURE: {
      WIDTH: 512,
      HEIGHT: 512,
      JPEG_QUALITY: 0.85,
      SATURATION: 1.25,   // Boost saturation to match reference (warmer, more vibrant)
      CONTRAST: 1.18,     // Boost contrast for clearer shadows/highlights
    },
    SKIN_SAMPLE_PATCH_SIZE: 24,
  },

  // ─── Scene & rendering ──────────────────────────────────────────────────────
  SCENE: {
    BACKGROUND: 0x252525,  // Dark gray so shadows from the 3D object are visible
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

  // ─── Kart (go kart OBJ for racing game) ──────────────────────────────────────
  KART: {
    OBJ_URL: '/models/go_kart_v1_L1.123c544c2090-89ab-4f9b-804f-e6b7947ef625/16833_go_kart_v1_NEW.obj',
    /** Scale applied to loaded OBJ so it matches physics chassis size (~2 x 1 x 1 world units). */
    SCALE: 1,
    /** Rotation (radians) applied so kart sits on wheels: often OBJ is Z-up, so rotateX(-π/2) gives Y-up. */
    ROTATION_X: -Math.PI / 2,
    ROTATION_Z: 0,
    /** Kart mesh material (applied to loaded OBJ). */
    MATERIAL: {
      COLOR: 0x2a2a2a,
      ROUGHNESS: 0.25,
      METALNESS: 0.85,
    },
    /** Driver (torso + arms + legs + feet + head) placement and appearance. */
    DRIVER: {
      /** Position of the driver group relative to kart root. */
      POSITION: [-0.280, 0.230, -0.010] as [number, number, number],
      /** Rotation (radians) of the driver group: [x, y, z]. */
      ROTATION: [0.0284, 0.0084, 0.1384] as [number, number, number],
      /** Torso (slim box) in driver local space. */
      BODY: {
        WIDTH: 0.22,
        HEIGHT: 0.36,
        DEPTH: 0.14,
        /** Body box center Y in driver group. */
        OFFSET_Y: 0.2,
        /** Offset [x, y, z] of torso from driver origin (for fine-tuning). */
        POSITION: [0.1, 0, 0] as [number, number, number],
        COLOR: 0x334455,
      },
      /** Arms (cylinders) reaching toward steering wheel. Y-up cylinder, length along Y. */
      ARMS: {
        RADIUS: 0.04,
        LENGTH: 0.28,
        COLOR: 0x334455,
        /** Left arm: position in driver space; rotation [x,y,z] so arm points to wheel. */
        LEFT: {
          POSITION: [0.06, 0.32, -0.12] as [number, number, number],
          ROTATION: [0.4, 0, 0.1] as [number, number, number],
        },
        RIGHT: {
          POSITION: [0.05, 0.27, 0.15] as [number, number, number],
          ROTATION: [0.4, 0, -0.1] as [number, number, number],
        },
      },
      /** Lower legs (cylinders) toward pedals. */
      LEGS: {
        RADIUS: 0.05,
        LENGTH: 0.35,
        COLOR: 0x334455,
        LEFT: {
          POSITION: [0.19, -0.01, -0.08] as [number, number, number],
          /** Rotation (radians) [x, y, z]. */
          ROTATION: [-0.1616, 0.0584, 0.8584] as [number, number, number],
        },
        RIGHT: {
          POSITION: [0.19, 0.04, 0.11] as [number, number, number],
          ROTATION: [0.8984, 2.7984, -1.3116] as [number, number, number],
        },
      },
      /** Feet (small boxes) on pedals. */
      FEET: {
        SIZE: [0.12, 0.06, 0.08] as [number, number, number],
        COLOR: 0x2a2a2a,
        LEFT: { POSITION: [0.38, -0.03, 0.14] as [number, number, number] },
        RIGHT: { POSITION: [0.38, -0.11, -0.14] as [number, number, number] },
      },
      /** Character head on top of body. */
      HEAD: {
        /** Head scale = SCALE_FACTOR / max(head bbox size) so head fits body. */
        SCALE_FACTOR: 0.4,
        /** Position [x, y, z] of head in driver group space. */
        POSITION: [0.200, 0.560, 0.000] as [number, number, number],
        /** Rotation (radians) of head: [x, y, z]. */
        ROTATION: [-0.0516, 1.6584, -0.0116] as [number, number, number],
      },
    },
  },

  // ─── Face capture (MediaPipe) ───────────────────────────────────────────────
  FACE_CAPTURE: {
    MIN_DETECTION_CONFIDENCE: 0.5,
    MIN_TRACKING_CONFIDENCE: 0.5,
    Z_SCALE: 0.5,            // Landmark z → Three.js z
  },
} as const;
