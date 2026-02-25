# kart-face-game

A Mario Kart-style browser game where players upload a photo of their face.
The photo is processed entirely client-side — MediaPipe Face Mesh extracts 468
3D landmarks, `FaceMeshBuilder` assembles them into a Three.js mesh with the
photo projected as a UV texture, and the result is mounted on a kart.

No server required for Phase 1.

---

## Tech Stack

| Library | Version | Why |
|---|---|---|
| **Three.js** | ^0.162.0 | 3D rendering — scene graph, materials, renderer |
| **@mediapipe/face_mesh** | ^0.4.1633559619 | 468-point 3D facial landmark detection from a single still photo; runs WASM in-browser |
| **@tensorflow-models/face-landmarks-detection** | ^1.0.5 | Canonical `TRIANGULATION` index array (2640 indices, 880 triangles) that defines the face mesh topology |
| **onnxruntime-web** | ^1.17.3 | Reserved for Phase 2 MiDaS monocular depth estimation (installed, not yet used) |
| **@dimforge/rapier3d-compat** | ^0.12.0 | Reserved for Phase 2 physics — 4-wheel vehicle rigid-body sim (installed, not yet used) |
| **TypeScript + Vite** | 5.x / 5.1 | Type safety + fast HMR dev server |

---

## Development Phases

### Phase 1 — Face Capture Preview (current)
Upload a photo → MediaPipe extracts 468 3D landmarks → `FaceMeshBuilder`
assembles them into a `THREE.BufferGeometry` with photo as UV texture →
displayed in an orbitable Three.js scene.

### Phase 2 — Kart Physics
Add `src/physics/VehicleController.ts` using Rapier's `RigidBody` + 4-wheel
vehicle API. Add `src/character/KartCharacter.ts` that loads a kart glTF model
and attaches the face mesh geometry as the head. Keyboard-controlled driving
on a flat plane with a third-person camera.

### Phase 3 — Track
Import a glTF track with a trimesh collision mesh, checkpoints, and lap
counting. Start/finish line detection. Basic race timer.

### Phase 4 — Multiplayer & Server Persistence
WebSocket-based multiplayer. Server validates and stores character meshes
(use `FaceMeshBuilder.serialize()` → POST `/api/characters`). AI opponents.
Item boxes.

---

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

1. Wait for **"Ready"** in the status bar (MediaPipe downloads ~8 MB of WASM on first load).
2. Click **Upload Face Photo** or **Use Test Photo**.
3. Your face mesh appears — drag to orbit, scroll to zoom.

### Test Photo

Place test portraits in `public/test/` (e.g. `test-face.png`, `test-face-adult.png`). Contents of `public/test/` are excluded from the production build.
The photo works best when:
- Face is roughly centred and fills most of the frame
- Good even lighting, no strong shadows
- `minDetectionConfidence: 0.5` is the current threshold

---

## Face Pipeline

```
Photo (PNG / JPG)
  │
  ▼
FaceCapture.detectFromImage()
  MediaPipe FaceMesh (WASM, loaded from jsDelivr CDN)
  → 468 NormalizedLandmarks { x, y, z }  (MediaPipe space)
  │
  ▼
Coordinate conversion  (see FaceCapture.ts)
  three.x = -(mp.x − 0.5)   // centre & flip: right = positive
  three.y = -(mp.y − 0.5)   // centre & flip: up    = positive
  three.z = -mp.z × 0.15    // flip & scale to ~world units
  │
  ▼
FaceMeshBuilder.buildGeometry()
  positions ← landmark (x, y, z)
  uvs       ← u = -lm.x + 0.5,  v = lm.y + 0.5
  indices   ← TRIANGULATION (880 triangles, DO NOT MODIFY)
  computeVertexNormals()
  │
  ▼
FaceMeshBuilder.buildMaterial()
  source image → 512×512 CanvasTexture
  MeshStandardMaterial { roughness: 0.7, metalness: 0, DoubleSide }
  │
  ▼
SceneManager.setCharacterHead()
  Replaces placeholder sphere with the new mesh
  Idle rotation: head.rotation.y += 0.002 per frame
```

---

## Serialising Character Meshes (Future Server Use)

```ts
const payload = faceMeshBuilder.serialize(geometry, material);
// payload = {
//   vertices:       string,  // Float32Array as base64
//   uvs:            string,  // Float32Array as base64
//   indices:        string,  // Uint16Array  as base64
//   textureDataUrl: string,  // 'data:image/jpeg;base64,...'
// }
await fetch('/api/characters', {
  method: 'POST',
  body: JSON.stringify(payload),
  headers: { 'Content-Type': 'application/json' },
});
```

---

## Notes for AI Assistants (Cursor, Claude, etc.)

### Coordinate Systems
- **MediaPipe**: `x` and `y` are normalised 0–1 (top-left origin). `z` is depth
  relative to face size; `0` = face centroid plane, negative = closer to camera.
- **Three.js conversion** (applied in `FaceCapture.ts`):
  `x = -(mp.x − 0.5)`, `y = -(mp.y − 0.5)`, `z = −mp.z × 0.15`
- Resulting range: `x/y ≈ ±0.5`, `z ≈ 0–0.15`.

### TRIANGULATION
- Lives in `src/character/mesh-builder/triangulation.ts`.
- **DO NOT MODIFY.** It is the canonical MediaPipe face mesh topology.
  2640 indices defining 880 triangles across 468 vertices.
- Source: Apache-2.0 licensed, Google LLC /
  `tensorflow/tfjs-models · face-landmarks-detection/demos/shared/triangulation.js`

### Physics Engine
- **Rapier** (`@dimforge/rapier3d-compat`) is the chosen physics engine.
- Do **not** use Cannon.js — it is deprecated for this project.

### Character Build Pipeline
- **Face mask**: Always from a photo facing up, correct direction. No face rotation.
- **Headwear**: Helmet wraps around the face. Lives in the `headwear` group.
- **Persistence**: Final character saved to local storage for use in kart, racing, etc.

### Back of Head
- MediaPipe only covers the front face. The back/sides of the head will need a
  generic base head mesh blended in during a future task (Phase 2 or 3).
  Keep this in mind when working on `KartCharacter.ts`.

### MediaPipe WASM Loading
- MediaPipe loads WASM + model files at runtime from jsDelivr CDN via the
  `locateFile` callback. Do not attempt to bundle them.
- `vite.config.ts` has `optimizeDeps.exclude: ['@mediapipe/face_mesh']` to
  prevent Vite from corrupting the WASM binary.

### File Structure
```
src/
├── main.ts                              — orchestrator
├── rendering/SceneManager.ts            — Three.js renderer, camera, lights
├── character/
│   ├── face-capture/FaceCapture.ts      — MediaPipe wrapper
│   └── mesh-builder/
│       ├── FaceMeshBuilder.ts           — geometry + material builder
│       └── triangulation.ts             — canonical index array (DO NOT MODIFY)
└── ui/FaceUploader.ts                   — file-input helper
```
