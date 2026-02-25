import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { CONFIG } from '../config';

/**
 * Builds a single Group: kart mesh (OBJ) + simple driver body + cloned character head.
 * The root is meant to be attached to the vehicle chassis so it moves with physics.
 */
export async function buildKartCharacter(headGroup: THREE.Group): Promise<THREE.Group> {
  const root = new THREE.Group();
  root.name = 'kartCharacter';

  const loader = new OBJLoader();
  const kartObj = await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(CONFIG.KART.OBJ_URL, resolve, undefined, reject);
  });

  // OBJ is often exported Z-up or on its side; put wheels down (Y-up in Three.js).
  kartObj.rotation.order = 'XYZ';
  kartObj.rotation.x = CONFIG.KART.ROTATION_X ?? -Math.PI / 2;
  kartObj.rotation.y = 0;
  kartObj.rotation.z = CONFIG.KART.ROTATION_Z ?? 0;

  const box = new THREE.Box3().setFromObject(kartObj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = (2 * 0.6) / maxDim;
  kartObj.scale.setScalar(scale * (CONFIG.KART.SCALE ?? 1));
  kartObj.position.set(0, 0, 0);
  const kartMat = new THREE.MeshStandardMaterial({
    color: CONFIG.KART.MATERIAL.COLOR,
    roughness: CONFIG.KART.MATERIAL.ROUGHNESS,
    metalness: CONFIG.KART.MATERIAL.METALNESS,
  });
  kartObj.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      obj.material = kartMat;
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  root.add(kartObj);

  const driverBody = new THREE.Group();
  driverBody.name = 'driverBody';
  const body = CONFIG.KART.DRIVER.BODY;
  const bodyGeo = new THREE.BoxGeometry(body.WIDTH, body.HEIGHT, body.DEPTH);
  const bodyMat = new THREE.MeshStandardMaterial({ color: body.COLOR });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.position.y = body.OFFSET_Y;
  driverBody.add(bodyMesh);

  const headClone = headGroup.clone(true);
  headClone.name = 'driverHead';
  // Ensure materials (and texture) are used: clone shares materials by default, but traverse to be sure face is visible
  headClone.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m && 'side' in m) (m as THREE.Material).side = THREE.DoubleSide;
      });
    }
  });
  const headBox = new THREE.Box3().setFromObject(headClone);
  const headSize = headBox.getSize(new THREE.Vector3());
  const headCfg = CONFIG.KART.DRIVER.HEAD;
  const headScale = headCfg.SCALE_FACTOR / Math.max(headSize.x, headSize.y, headSize.z);
  headClone.scale.setScalar(headScale);
  const [hx, hy, hz] = headCfg.POSITION;
  const [hrx, hry, hrz] = headCfg.ROTATION;
  headClone.position.set(hx, hy, hz);
  headClone.rotation.set(hrx, hry, hrz);
  driverBody.add(headClone);

  const [dx, dy, dz] = CONFIG.KART.DRIVER.POSITION;
  const [drx, dry, drz] = CONFIG.KART.DRIVER.ROTATION;
  driverBody.position.set(dx, dy, dz);
  driverBody.rotation.set(drx, dry, drz);
  root.add(driverBody);

  return root;
}
