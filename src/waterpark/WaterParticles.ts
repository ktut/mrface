import * as THREE from 'three';
import { CONFIG } from '../config';

const WP = CONFIG.WATERPARK;
const PC = WP.PARTICLES;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/**
 * Simple water splash/slosh particles: spawn near a source position (e.g. tube),
 * fall with gravity and random outward velocity, then respawn.
 */
export class WaterParticleSystem {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private particles: Particle[] = [];
  private spawnAccum = 0;
  private sourcePos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const count = PC.COUNT;
    this.positions = new Float32Array(count * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

    const mat = new THREE.PointsMaterial({
      size: PC.SIZE,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0,
        maxLife: PC.LIFETIME,
      });
    }
  }

  setSourcePosition(x: number, y: number, z: number): void {
    this.sourcePos.set(x, y, z);
  }

  private spawnOne(): void {
    const r = () => (Math.random() - 0.5) * 2 * PC.SPEED_RAND;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        p.x = this.sourcePos.x + (Math.random() - 0.5) * 0.8;
        p.y = this.sourcePos.y + Math.random() * 0.3;
        p.z = this.sourcePos.z + (Math.random() - 0.5) * 0.8;
        p.vx = r();
        p.vy = PC.SPEED_Y + Math.random() * 0.1;
        p.vz = r();
        p.life = p.maxLife = PC.LIFETIME * (0.7 + Math.random() * 0.6);
        break;
      }
    }
  }

  update(dt: number): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const colorArray = colorAttr.array as Float32Array;
    const g = -2;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy += g * dt;
        p.life -= dt;
        const t = 1 - p.life / p.maxLife;
        posArray[i * 3] = p.x;
        posArray[i * 3 + 1] = p.y;
        posArray[i * 3 + 2] = p.z;
        const blue = 0.6 + 0.4 * (1 - t);
        colorArray[i * 3] = 0.5;
        colorArray[i * 3 + 1] = 0.7;
        colorArray[i * 3 + 2] = blue;
      }
    }

    this.spawnAccum += PC.SPAWN_RATE * dt;
    while (this.spawnAccum >= 1) {
      this.spawnOne();
      this.spawnAccum -= 1;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
