import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Use the same skin color as the head (face mesh back/sides).
 * Reads from userData set by FaceMeshBuilder, then mesh materials.
 */
export function getHeadSkinColor(headGroup: THREE.Group): THREE.Color {
  const fallback = new THREE.Color(CONFIG.HEAD.MATERIAL.SKIN_FALLBACK);
  const stored = headGroup.userData?.skinColor as { r: number; g: number; b: number } | undefined;
  if (stored && typeof stored.r === 'number' && typeof stored.g === 'number' && typeof stored.b === 'number') {
    return new THREE.Color(stored.r, stored.g, stored.b);
  }
  const headContainer = headGroup.getObjectByName('head');
  if (headContainer) {
    let found: THREE.Color | null = null;
    headContainer.traverse((obj) => {
      if (found) return;
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        if (mats.length >= 2) {
          const backMat = mats[1] as THREE.MeshStandardMaterial;
          if (backMat?.color instanceof THREE.Color) found = backMat.color.clone();
        }
      }
    });
    if (found) return found;
  }
  return fallback;
}
