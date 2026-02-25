/**
 * FaceMeshBuilder.ts
 *
 * Builds a closed head mesh from 468 MediaPipe landmarks + a source photo.
 *
 * ─── Strategy ─────────────────────────────────────────────────────────────────
 *
 * Rather than attaching a sphere, we extrude the face mesh's own perimeter
 * backward to form the rest of the head:
 *
 *   1. Face surface  — 880 MediaPipe triangles, photo texture (group 0).
 *   2. Side wall     — quad strip connecting face perimeter → scaled-back ring.
 *                      The back ring is the perimeter points scaled inward and
 *                      pushed back in Z, so the head tapers naturally (group 1).
 *   3. Back cap      — a fan of triangles from a single centre point to the
 *                      back ring, closing the head (group 1).
 *
 * All three parts are merged into one BufferGeometry with two material groups:
 *   [0] MeshStandardMaterial { map: photoTexture }  — face surface
 *   [1] MeshStandardMaterial { color: skinSample }  — sides + back
 *
 * ─── UV notes ─────────────────────────────────────────────────────────────────
 * UVs use original landmark (x, y) from FaceCapture (pre-centring):
 *   u = -lm.x + 0.5   (undo X flip)
 *   v =  lm.y + 0.5   (undo Y flip; Three.js v=0=bottom)
 *
 * ─── Winding fix ──────────────────────────────────────────────────────────────
 * FaceCapture flips X → TRIANGULATION winding becomes CW → normals point inward.
 * Fix: swap TRIANGULATION[t+1] ↔ TRIANGULATION[t+2] per triangle.
 *
 * ─── Face perimeter ───────────────────────────────────────────────────────────
 * FACE_OVAL is the ordered ring of landmark indices that form the face boundary
 * in MediaPipe's canonical model (jawline + temples + forehead), going clockwise
 * when viewed from the front in image space (counter-clockwise in Three.js space
 * after the X-flip, which is what we need for outward normals on the side wall).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Landmark3D } from '../face-capture/FaceCapture';
import { TRIANGULATION } from './triangulation';

const HELMET_OBJ_URL = '/models/Helmet__Sfera_v1_L1.123c237682f7-5c65-4abc-81fb-c187b7186453/18893_Helmet-Sfera_v1.obj';

/**
 * Ordered ring of MediaPipe landmark indices that trace the face oval boundary.
 * Source: MediaPipe FACEMESH_FACE_OVAL connection list, ordered as a loop.
 * Goes: left-temple → forehead → right-temple → right-jaw → chin → left-jaw → back.
 */
const FACE_OVAL: number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172,  58, 132,  93, 234, 127, 162,  21,  54, 103,  67, 109,
];


export class FaceMeshBuilder {

  async build(
    landmarks: Landmark3D[],
    sourceImage: HTMLImageElement,
  ): Promise<THREE.Group> {
    const group = new THREE.Group();

    const bbox       = this.computeBbox(landmarks);
    const headColor  = this.sampleSkinFromRegions(sourceImage, landmarks);

    // Build each part.
    const faceGeo = this.buildFaceGeometry(landmarks);
    const { sideGeo } = this.buildBackShell(landmarks, bbox);

    // Merge: face (group 0) + side+cap (group 1, unified in one geometry).
    const merged = mergeGeometries([faceGeo, sideGeo], true);
    merged.computeVertexNormals();

    const faceMat = this.buildFaceMaterial(sourceImage, landmarks, headColor);
    const backMat = new THREE.MeshStandardMaterial({
      color:     headColor,
      roughness: 0.9,
      metalness: 0.0,
      side:      THREE.DoubleSide,  // back cap + side wall visible from all angles
    });

    const headMesh = new THREE.Mesh(merged, [faceMat, backMat]);
    headMesh.name = 'head';
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;

    const headGroup = new THREE.Group();
    headGroup.name = 'head';
    headGroup.add(headMesh);
    group.add(headGroup);

    // Headwear (helmet, hair, etc.) — separate, swappable element.
    const headwearGroup = new THREE.Group();
    headwearGroup.name = 'headwear';
    headwearGroup.add(await this.buildHelmet(bbox));
    group.add(headwearGroup);

    // Shift so the face centre is at the scene origin.
    group.position.set(-bbox.cx, -bbox.cy, -bbox.cz);

    return group;
  }

  // ── Bounding box ─────────────────────────────────────────────────────────────

  private computeBbox(landmarks: Landmark3D[]) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const lm of landmarks) {
      if (lm.x < minX) minX = lm.x; if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y; if (lm.y > maxY) maxY = lm.y;
      if (lm.z < minZ) minZ = lm.z; if (lm.z > maxZ) maxZ = lm.z;
    }
    return {
      minX, maxX, minY, maxY, minZ, maxZ,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + maxZ) / 2,
      width:  maxX - minX,
      height: maxY - minY,
    };
  }

  // ── Face surface geometry (group 0) ──────────────────────────────────────────

  private buildFaceGeometry(landmarks: Landmark3D[]): THREE.BufferGeometry {
    const n         = landmarks.length;
    const positions = new Float32Array(n * 3);
    const uvs       = new Float32Array(n * 2);

    for (let i = 0; i < n; i++) {
      const lm = landmarks[i];
      positions[i * 3 + 0] = lm.x;
      positions[i * 3 + 1] = lm.y;
      positions[i * 3 + 2] = lm.z;
      uvs[i * 2 + 0] = -lm.x + 0.5;
      uvs[i * 2 + 1] =  lm.y + 0.5;
    }

    // Fix winding: X-flip reverses CCW→CW → normals point inward without this.
    const fixedIndex = new Uint16Array(TRIANGULATION.length);
    for (let t = 0; t < TRIANGULATION.length; t += 3) {
      fixedIndex[t + 0] = TRIANGULATION[t + 0];
      fixedIndex[t + 1] = TRIANGULATION[t + 2];
      fixedIndex[t + 2] = TRIANGULATION[t + 1];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(fixedIndex, 1));
    return geo;
  }

  // ── Side wall + back cap (group 1) ───────────────────────────────────────────

  /**
   * Extrude the face oval perimeter backward to form a smooth, rounded head.
   *
   * Simple structure for a baby-head-like back:
   *   - Three rings for side wall (front → mid → back)
   *   - Single smooth dome for back cap (centre + fan to back ring)
   *   - Uniform back ring (same Z) for a smooth, rounded dome — no indentations.
   */
  private buildBackShell(
    landmarks: Landmark3D[],
    bbox: ReturnType<FaceMeshBuilder['computeBbox']>,
  ): { sideGeo: THREE.BufferGeometry } {

    const N     = FACE_OVAL.length;
    const { cx, cy, minZ, minY, maxY } = bbox;

    const depth = bbox.width * 0.5;

    const front: Landmark3D[] = FACE_OVAL.map(i => landmarks[i]);

    const yRange = Math.max(maxY - minY, 0.01);
    const tNorm = (lm: Landmark3D) => (lm.y - minY) / yRange;

    // Uniform ovoid taper: 0.94–0.98 for smooth, egg-like profile.
    const taperAt = (lm: Landmark3D) => 0.94 + 0.04 * tNorm(lm);

    // Forehead bulge: gentle curve (smoother than t²).
    const foreheadBulge = depth * 0.1;
    const foreheadAt = (lm: Landmark3D) => {
      const t = tNorm(lm);
      return t * foreheadBulge;
    };

    // Four rings for smoother ovoid profile.
    const ring1Z = minZ - depth * 0.33;
    const ring1: Landmark3D[] = front.map(lm => {
      const t = tNorm(lm);
      const taper = 0.97 + 0.02 * t;
      return {
        x: cx + (lm.x - cx) * taper,
        y: cy + (lm.y - cy) * taper + foreheadAt(lm),
        z: ring1Z,
      };
    });

    const ring2Z = minZ - depth * 0.66;
    const ring2: Landmark3D[] = front.map(lm => {
      const t = tNorm(lm);
      const taper = 0.96 + 0.02 * t;
      return {
        x: cx + (lm.x - cx) * taper,
        y: cy + (lm.y - cy) * taper + foreheadAt(lm),
        z: ring2Z,
      };
    });

    const backZ = minZ - depth;
    const back: Landmark3D[] = front.map(lm => ({
      x: cx + (lm.x - cx) * taperAt(lm),
      y: cy + (lm.y - cy) * taperAt(lm) + foreheadAt(lm),
      z: backZ,
    }));

    // Dome centre behind back ring — creates convex (outward) curve, not concave.
    const domeHeight = depth * 0.18;
    const centreZ = backZ - domeHeight;
    const centreIdx = 4 * N;

    // Vertex layout: [f0,m0,b0, f1,m1,b1, ..., centre]
    const shellPos: number[] = [];
    const shellUV:  number[] = [];
    const shellIdx: number[] = [];

    for (let i = 0; i < N; i++) {
      shellPos.push(front[i].x, front[i].y, front[i].z);
      shellPos.push(ring1[i].x, ring1[i].y, ring1[i].z);
      shellPos.push(ring2[i].x, ring2[i].y, ring2[i].z);
      shellPos.push(back[i].x, back[i].y, back[i].z);
      shellUV.push(0, 0, 0, 0, 0, 0, 0, 0);
    }
    shellPos.push(cx, cy + foreheadBulge * 0.5, centreZ);
    shellUV.push(0, 0);

    const addQuad = (a: number, b: number, c: number, d: number, onRight: boolean) => {
      if (onRight) { shellIdx.push(a, b, c); shellIdx.push(c, b, d); }
      else { shellIdx.push(a, c, b); shellIdx.push(c, d, b); }
    };
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const f0 = i * 4, r10 = i * 4 + 1, r20 = i * 4 + 2, b0 = i * 4 + 3;
      const f1 = next * 4, r11 = next * 4 + 1, r21 = next * 4 + 2, b1 = next * 4 + 3;
      const onRight = (front[i].x + front[next].x) / 2 >= cx;
      addQuad(f0, f1, r10, r11, onRight);
      addQuad(r10, r11, r20, r21, onRight);
      addQuad(r20, r21, b0, b1, onRight);
    }
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const bi = i * 4 + 3, bNext = next * 4 + 3;
      shellIdx.push(centreIdx, bNext, bi);
    }

    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(shellPos), 3));
    shellGeo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(shellUV),  2));
    shellGeo.setIndex(shellIdx);

    return { sideGeo: shellGeo };
  }

  // ── Helmet (loaded from OBJ model) ────────────────────────────────────────────

  /**
   * Load the Sfera helmet OBJ model, scale and position it to fit the head.
   * Model from 3ds Max: Y-up OBJ, opening may face +Z or -Z. Try rotations to align.
   */
  private async buildHelmet(
    bbox: ReturnType<FaceMeshBuilder['computeBbox']>,
  ): Promise<THREE.Group> {
    const { cx, cy, cz } = bbox;
    const width = bbox.width;
    const depth = width * 0.5;
    const headRadius = Math.sqrt(width * width + bbox.height * bbox.height + depth * depth) / 2;

    const loader = new OBJLoader();
    const helmetObj = await loader.loadAsync(HELMET_OBJ_URL);

    const box = new THREE.Box3().setFromObject(helmetObj);
    const helmetSize = box.getSize(new THREE.Vector3());

    const helmetRadius = Math.max(helmetSize.x, helmetSize.y, helmetSize.z) / 2;
    const scale = (headRadius * 1.2) / helmetRadius;

    helmetObj.scale.setScalar(scale);

    // Orient: rotate 90° around X and Z, 180° around Y. Add 180° around Z so front faces the face mesh.
    helmetObj.rotation.x = Math.PI / 2;
    helmetObj.rotation.y = Math.PI;
    helmetObj.rotation.z = Math.PI / 2 + Math.PI;

    // Center on head. Recompute bbox after rotation for correct placement.
    const boxAfterRot = new THREE.Box3().setFromObject(helmetObj);
    const centerAfterRot = boxAfterRot.getCenter(new THREE.Vector3());
    helmetObj.position.set(cx - centerAfterRot.x, cy - centerAfterRot.y, cz - centerAfterRot.z);

    const helmetMat = new THREE.MeshStandardMaterial({
      color:     0xc0c0c0,
      roughness: 0.08,
      metalness: 0.95,
      side:      THREE.FrontSide,
    });

    helmetObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = helmetMat;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    helmetObj.name = 'helmet';
    return helmetObj;
  }

  // ── Face material (group 0) ───────────────────────────────────────────────────

  private buildFaceMaterial(
    sourceImage: HTMLImageElement,
    landmarks: Landmark3D[],
    skinColor: THREE.Color,
  ): THREE.MeshStandardMaterial {
    const w = 512, h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Fill with skin color first (covers edge artifacts).
    ctx.fillStyle = `rgb(${Math.round(skinColor.r * 255)},${Math.round(skinColor.g * 255)},${Math.round(skinColor.b * 255)})`;
    ctx.fillRect(0, 0, w, h);

    // Clip to face oval (slightly inset to avoid hair/black at perimeter).
    const inset = 0.02;
    const uvPath = FACE_OVAL.map(i => {
      const lm = landmarks[i];
      const u = -lm.x + 0.5;
      const v = lm.y + 0.5;
      const cx = 0.5, cy = 0.5;
      const u2 = cx + (u - cx) * (1 - inset);
      const v2 = cy + (v - cy) * (1 - inset);
      return [(u2 * w), ((1 - v2) * h)] as [number, number];
    });
    ctx.beginPath();
    ctx.moveTo(uvPath[0][0], uvPath[0][1]);
    for (let i = 1; i < uvPath.length; i++) ctx.lineTo(uvPath[i][0], uvPath[i][1]);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(sourceImage, 0, 0, w, h);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map:       texture,
      roughness: 0.75,
      metalness: 0.0,
      side:      THREE.FrontSide,
    });
  }

  // ── Skin colour sampling (derived from source image, no hard-coded tones) ────────

  /**
   * MediaPipe landmark indices for skin sampling:
   * Head: forehead (10), left cheek (93), right cheek (323)
   */
  private static readonly HEAD_SAMPLE_INDICES = [10, 93, 323];

  /**
   * Sample skin tone from the source image. Uses multiple landmarks and averages
   * successful samples. No hard-coded fallback when the image is valid — only
   * falls back if all sampling fails (e.g. image not loaded, zero dimensions).
   */
  private sampleSkinFromRegions(
    sourceImage: HTMLImageElement,
    landmarks: Landmark3D[],
  ): THREE.Color {
    const samples: THREE.Color[] = [];
    for (const idx of FaceMeshBuilder.HEAD_SAMPLE_INDICES) {
      const color = this.sampleAtLandmark(sourceImage, landmarks, idx);
      if (color) samples.push(color);
    }

    if (samples.length > 0) {
      let r = 0, g = 0, b = 0;
      for (const c of samples) {
        r += c.r; g += c.g; b += c.b;
      }
      const n = samples.length;
      return new THREE.Color(r / n, g / n, b / n);
    }

    return new THREE.Color(0xd4956a);
  }

  /** Sample average color from a patch centered on the given landmark. */
  private sampleAtLandmark(
    sourceImage: HTMLImageElement,
    landmarks: Landmark3D[],
    landmarkIndex: number,
    patchSize = 24,
  ): THREE.Color | null {
    try {
      if (!sourceImage.naturalWidth || !sourceImage.naturalHeight) return null;
      const lm = landmarks[landmarkIndex];
      if (!lm) return null;

      const imgX = (-lm.x + 0.5) * sourceImage.naturalWidth;
      const imgY = (1 - (lm.y + 0.5)) * sourceImage.naturalHeight;

      const c = document.createElement('canvas');
      c.width = c.height = patchSize;
      const ctx = c.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(
        sourceImage,
        imgX - patchSize / 2, imgY - patchSize / 2, patchSize, patchSize,
        0, 0, patchSize, patchSize,
      );
      const px = ctx.getImageData(0, 0, patchSize, patchSize).data;
      let r = 0, g = 0, b = 0;
      const count = px.length / 4;
      for (let i = 0; i < px.length; i += 4) {
        r += px[i]; g += px[i + 1]; b += px[i + 2];
      }
      return new THREE.Color(r / count / 255, g / count / 255, b / count / 255);
    } catch {
      return null;
    }
  }

  // ── Serialization stub ────────────────────────────────────────────────────────

  serialize(
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
  ): { vertices: string; uvs: string; indices: string | null; textureDataUrl: string } {
    const toBase64 = (buf: ArrayBufferLike) =>
      btoa(String.fromCharCode(...new Uint8Array(buf)));
    const pos = geometry.attributes['position'] as THREE.BufferAttribute;
    const uv  = geometry.attributes['uv']       as THREE.BufferAttribute;
    const idx = geometry.index;
    let textureDataUrl = '';
    if (material.map instanceof THREE.CanvasTexture) {
      textureDataUrl = (material.map.image as HTMLCanvasElement).toDataURL('image/jpeg', 0.85);
    }
    return {
      vertices:       toBase64((pos.array as Float32Array).buffer),
      uvs:            toBase64((uv.array  as Float32Array).buffer),
      indices:        idx ? toBase64((idx.array as Uint16Array).buffer) : null,
      textureDataUrl,
    };
  }
}
