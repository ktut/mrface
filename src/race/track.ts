import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RACE_CONFIG } from './types';

/** Linear track: long in Z, narrow in X. Dimensions from RACE_CONFIG. */
const TRACK_LENGTH = RACE_CONFIG.TRACK_LENGTH;
const TRACK_HALF_WIDTH = RACE_CONFIG.TRACK_HALF_WIDTH;
const WALL_HEIGHT = 16;
const WALL_THICKNESS = 4;
/** Center Z of track (start at START_LINE_Z, finish at FINISH_LINE_Z). */
const TRACK_CENTER_Z = (RACE_CONFIG.START_LINE_Z + RACE_CONFIG.FINISH_LINE_Z) / 2;
const HALF_LENGTH = TRACK_LENGTH / 2;

/** Creates a texture for the track: dark asphalt with a dashed yellow center line along the strip. */
function createTrackTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(80, 80, 80, 0.6)';
  ctx.fillRect(0, 0, width, 12);
  ctx.fillRect(0, height - 12, width, 12);
  ctx.strokeStyle = '#e6b800';
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 24]);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, TRACK_LENGTH / 8);
  tex.needsUpdate = true;
  return tex;
}

/** Creates a checkered (start/finish) texture. */
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
      ctx.fillStyle = check ? '#ffffff' : '#111111';
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
 * Add track colliders: long rectangular ground and four boundary walls (no center mountain).
 * Call this instead of vehicle.addGround() when using the linear track.
 */
export function addTrackColliders(world: RAPIER.World): void {
  const halfW = TRACK_HALF_WIDTH + WALL_THICKNESS;
  const halfL = HALF_LENGTH + WALL_THICKNESS;

  // Ground: long rectangle under the track
  const groundDesc = RAPIER.ColliderDesc.cuboid(
    TRACK_HALF_WIDTH,
    0.1,
    HALF_LENGTH,
  ).setTranslation(0, -0.1, TRACK_CENTER_Z);
  world.createCollider(groundDesc);

  const halfWallH = WALL_HEIGHT / 2;
  const halfThick = WALL_THICKNESS / 2;

  // West wall (x = -TRACK_HALF_WIDTH)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfThick, halfWallH, halfL).setTranslation(
      -TRACK_HALF_WIDTH - halfThick,
      halfWallH,
      TRACK_CENTER_Z,
    ),
  );
  // East wall (x = +TRACK_HALF_WIDTH)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfThick, halfWallH, halfL).setTranslation(
      TRACK_HALF_WIDTH + halfThick,
      halfWallH,
      TRACK_CENTER_Z,
    ),
  );
  // Start wall (z = START_LINE_Z)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfW, halfWallH, halfThick).setTranslation(
      0,
      halfWallH,
      RACE_CONFIG.START_LINE_Z - halfThick,
    ),
  );
  // Finish wall (z = FINISH_LINE_Z) — drive through finish then hit wall slightly past
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfW, halfWallH, halfThick).setTranslation(
      0,
      halfWallH,
      RACE_CONFIG.FINISH_LINE_Z + halfThick,
    ),
  );
}

/**
 * Create Three.js meshes for the linear track: long asphalt strip, start line, finish line, boundary walls.
 * No center mountain.
 */
export function addTrackMeshes(scene: THREE.Scene): void {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x3d523d,
    roughness: 0.9,
    metalness: 0.05,
  });

  // Track surface: long rectangle (driveable strip)
  const trackGeo = new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, TRACK_LENGTH);
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    map: createTrackTexture(),
    roughness: 0.9,
    metalness: 0.08,
  });
  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.rotation.x = -Math.PI / 2;
  trackMesh.position.set(0, 0.005, TRACK_CENTER_Z);
  trackMesh.receiveShadow = true;
  trackMesh.name = 'trackSurface';
  scene.add(trackMesh);

  const createWall = (
    width: number,
    height: number,
    depth: number,
    x: number,
    z: number,
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const wallW = TRACK_HALF_WIDTH * 2 + WALL_THICKNESS;
  const wallL = TRACK_LENGTH + WALL_THICKNESS;

  scene.add(createWall(WALL_THICKNESS, WALL_HEIGHT, wallL, -TRACK_HALF_WIDTH - WALL_THICKNESS / 2, TRACK_CENTER_Z));
  scene.add(createWall(WALL_THICKNESS, WALL_HEIGHT, wallL, TRACK_HALF_WIDTH + WALL_THICKNESS / 2, TRACK_CENTER_Z));
  scene.add(createWall(wallW, WALL_HEIGHT, WALL_THICKNESS, 0, RACE_CONFIG.START_LINE_Z - WALL_THICKNESS / 2));
  scene.add(createWall(wallW, WALL_HEIGHT, WALL_THICKNESS, 0, RACE_CONFIG.FINISH_LINE_Z + WALL_THICKNESS / 2));

  // Start line: checkered strip across the track
  const lineStripGeo = new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, 4);
  const lineMat = new THREE.MeshStandardMaterial({
    map: createCheckeredTexture(),
    roughness: 0.8,
    metalness: 0.1,
  });
  const startLine = new THREE.Mesh(lineStripGeo, lineMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.015, RACE_CONFIG.START_LINE_Z);
  startLine.receiveShadow = true;
  startLine.name = 'startLine';
  scene.add(startLine);

  // Finish line: checkered strip across the track
  const finishLine = new THREE.Mesh(lineStripGeo, lineMat.clone());
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(0, 0.016, RACE_CONFIG.FINISH_LINE_Z);
  finishLine.receiveShadow = true;
  finishLine.name = 'finishLine';
  scene.add(finishLine);
}

/** Kart start: just behind the start line but ON the ground (ground Z starts at START_LINE_Z), facing +Z toward the finish. */
export const KART_START_POSITION = {
  x: 0,
  y: 0.38,
  z: RACE_CONFIG.START_LINE_Z + 1,
} as const;

/** Identity: chassis forward is already +Z (toward finish). */
export const KART_START_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
