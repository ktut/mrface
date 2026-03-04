import * as THREE from 'three';
import { CONFIG } from '../config';

const WP = CONFIG.WATERPARK;
const L = WP.SLIDE_LENGTH;
const HW = WP.SLIDE_HALF_WIDTH;
const ROOM_BEFORE = WP.ROOM_BEFORE;
const ROOM_AFTER = WP.ROOM_AFTER;
const START_Z = WP.START_LINE_Z;
const FINISH_Z = WP.FINISH_LINE_Z;
const GROUND_START_Z = START_Z - ROOM_BEFORE;
const GROUND_END_Z = FINISH_Z + ROOM_AFTER;
const GROUND_LENGTH = GROUND_END_Z - GROUND_START_Z;
const GROUND_CENTER_Z = (GROUND_START_Z + GROUND_END_Z) / 2;
const SLIDE_CENTER_Z = (START_Z + FINISH_Z) / 2;

function createSlideTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff69b4';
  ctx.fillRect(0, 0, w, h);
  // Slight shine stripe
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, L / 6);
  tex.needsUpdate = true;
  return tex;
}

function createCheckeredTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const check = ((x + y) / cell) % 2 === 0;
      ctx.fillStyle = check ? '#ffffff' : '#ff1493';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.5);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Add waterslide meshes: pink half-cylinder (trough) slide, start/finish lines, and ground.
 */
export function addSlideMeshes(scene: THREE.Scene): void {
  const slideMat = new THREE.MeshStandardMaterial({
    color: WP.SLIDE_COLOR,
    map: createSlideTexture(),
    roughness: 0.35,
    metalness: 0.05,
  });

  // Half-cylinder (trough): opening faces +Y, curved bottom is the slide. Axis along Z.
  const slideGeo = new THREE.CylinderGeometry(HW, HW, L, 32, 1, true, Math.PI, Math.PI);
  const slideMesh = new THREE.Mesh(slideGeo, slideMat);
  slideMesh.rotation.x = -Math.PI / 2;
  slideMesh.position.set(0, HW, SLIDE_CENTER_Z);
  slideMesh.receiveShadow = true;
  slideMesh.castShadow = true;
  slideMesh.name = 'slideSurface';
  scene.add(slideMesh);

  const lineStripGeo = new THREE.PlaneGeometry(HW * 2, 3);
  const lineMat = new THREE.MeshStandardMaterial({
    map: createCheckeredTexture(),
    roughness: 0.6,
    metalness: 0.1,
  });
  const startLine = new THREE.Mesh(lineStripGeo, lineMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.03, START_Z);
  startLine.receiveShadow = true;
  startLine.name = 'startLine';
  scene.add(startLine);

  const finishLine = new THREE.Mesh(lineStripGeo.clone(), lineMat.clone());
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(0, 0.031, FINISH_Z);
  finishLine.receiveShadow = true;
  finishLine.name = 'finishLine';
  scene.add(finishLine);

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x00b894,
    roughness: 0.95,
    metalness: 0,
  });
  const groundGeo = new THREE.PlaneGeometry(HW * 2 + 8, GROUND_LENGTH + 8);
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, 0, GROUND_CENTER_Z);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}

const WATER_OFFSET = 0.12; // water layer sits this far above the slide surface (inward in trough)

/** Create curved water surface (same half-cylinder as slide) with vertices we can animate for waves. */
export function createWaterMesh(): { mesh: THREE.Mesh; basePositions: Float32Array } {
  const radialSegments = 24;
  const lengthSegments = 96;
  const geo = new THREE.CylinderGeometry(HW, HW, L, radialSegments, lengthSegments, true, Math.PI, Math.PI);
  const positions = geo.getAttribute('position') as THREE.BufferAttribute;
  const posArray = positions.array as Float32Array;
  const basePositions = new Float32Array(posArray.length);
  for (let i = 0; i < posArray.length; i += 3) {
    const x = posArray[i];
    const y = posArray[i + 1];
    const z = posArray[i + 2];
    const r = Math.sqrt(x * x + z * z) || 1;
    const scale = 1 - WATER_OFFSET / r;
    basePositions[i] = x * scale;
    basePositions[i + 1] = y;
    basePositions[i + 2] = z * scale;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(basePositions.slice(), 3));
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x1fb5ff,
    transparent: true,
    opacity: 0.88,
    roughness: 0.1,
    metalness: 0.25,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, HW, SLIDE_CENTER_Z);
  mesh.receiveShadow = false;
  mesh.name = 'waterSurface';
  return { mesh, basePositions };
}

/** Start position for the tube (just past start line), facing +Z. */
export const TUBE_START_POSITION = { x: 0, y: 0.5, z: START_Z + 2 } as const;
export const TUBE_START_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
