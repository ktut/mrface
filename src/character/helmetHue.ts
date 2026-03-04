import * as THREE from 'three';

/** Same values as home screen so games match. */
const HELMET_SATURATION = 0.35;
const HELMET_LIGHTNESS_MIN = 0.38;
const HELMET_LIGHTNESS_MAX = 0.62;

/**
 * Apply helmet (headwear) color from hue so in-game driver matches home screen.
 * Use on the driver head (e.g. object named 'driverHead') after building the character.
 */
export function applyHelmetHue(head: THREE.Object3D, hue: number): void {
  const headwear = head.getObjectByName('headwear') as THREE.Group | undefined;
  if (!headwear) return;
  const helmet = headwear.getObjectByName('helmet');
  if (!helmet) return;
  const t = hue / 360;
  const lightness = HELMET_LIGHTNESS_MIN + t * (HELMET_LIGHTNESS_MAX - HELMET_LIGHTNESS_MIN);
  const color = new THREE.Color().setHSL(t, HELMET_SATURATION, lightness);
  helmet.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat.color) mat.color.copy(color);
    }
  });
}
