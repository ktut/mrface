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
  const bodyCfg = CONFIG.KART.DRIVER.BODY;
  const bodyGeo = new THREE.BoxGeometry(bodyCfg.WIDTH, bodyCfg.HEIGHT, bodyCfg.DEPTH);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCfg.COLOR });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.name = 'driverTorso';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.position.set(
    bodyCfg.POSITION[0],
    bodyCfg.OFFSET_Y + bodyCfg.POSITION[1],
    bodyCfg.POSITION[2],
  );
  driverBody.add(bodyMesh);

  const armsCfg = CONFIG.KART.DRIVER.ARMS;
  const armGeo = new THREE.CylinderGeometry(armsCfg.RADIUS, armsCfg.RADIUS, armsCfg.LENGTH, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: armsCfg.COLOR });
  const leftArm = new THREE.Mesh(armGeo.clone(), armMat.clone());
  leftArm.name = 'driverLeftArm';
  leftArm.castShadow = true;
  leftArm.receiveShadow = true;
  leftArm.position.set(...armsCfg.LEFT.POSITION);
  leftArm.rotation.set(
    Math.PI / 2 + armsCfg.LEFT.ROTATION[0],
    armsCfg.LEFT.ROTATION[1],
    armsCfg.LEFT.ROTATION[2],
  );
  driverBody.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo.clone(), armMat.clone());
  rightArm.name = 'driverRightArm';
  rightArm.castShadow = true;
  rightArm.receiveShadow = true;
  rightArm.position.set(...armsCfg.RIGHT.POSITION);
  rightArm.rotation.set(
    Math.PI / 2 + armsCfg.RIGHT.ROTATION[0],
    armsCfg.RIGHT.ROTATION[1],
    armsCfg.RIGHT.ROTATION[2],
  );
  driverBody.add(rightArm);

  const legsCfg = CONFIG.KART.DRIVER.LEGS;
  const legGeo = new THREE.CylinderGeometry(legsCfg.RADIUS, legsCfg.RADIUS, legsCfg.LENGTH, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: legsCfg.COLOR });
  const leftLeg = new THREE.Mesh(legGeo.clone(), legMat.clone());
  leftLeg.name = 'driverLeftLeg';
  leftLeg.castShadow = true;
  leftLeg.receiveShadow = true;
  leftLeg.position.set(...legsCfg.LEFT.POSITION);
  leftLeg.rotation.set(...legsCfg.LEFT.ROTATION);
  driverBody.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo.clone(), legMat.clone());
  rightLeg.name = 'driverRightLeg';
  rightLeg.castShadow = true;
  rightLeg.receiveShadow = true;
  rightLeg.position.set(...legsCfg.RIGHT.POSITION);
  rightLeg.rotation.set(...legsCfg.RIGHT.ROTATION);
  driverBody.add(rightLeg);

  const feetCfg = CONFIG.KART.DRIVER.FEET;
  const footGeo = new THREE.BoxGeometry(...feetCfg.SIZE);
  const footMat = new THREE.MeshStandardMaterial({ color: feetCfg.COLOR });
  const leftFoot = new THREE.Mesh(footGeo.clone(), footMat.clone());
  leftFoot.name = 'driverLeftFoot';
  leftFoot.castShadow = true;
  leftFoot.receiveShadow = true;
  leftFoot.position.set(...feetCfg.LEFT.POSITION);
  driverBody.add(leftFoot);
  const rightFoot = new THREE.Mesh(footGeo.clone(), footMat.clone());
  rightFoot.name = 'driverRightFoot';
  rightFoot.castShadow = true;
  rightFoot.receiveShadow = true;
  rightFoot.position.set(...feetCfg.RIGHT.POSITION);
  driverBody.add(rightFoot);

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
