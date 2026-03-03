import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../config';

const WP = CONFIG.WATERPARK;
const TUBE = WP.TUBE;
const DRIVER = WP.DRIVER;

function getHeadSkinColor(headGroup: THREE.Group): THREE.Color {
  const fallback = new THREE.Color(CONFIG.HEAD.MATERIAL.SKIN_FALLBACK);
  let found: THREE.Color | null = null;

  headGroup.traverse((obj) => {
    if (found) return;
    if (obj instanceof THREE.Mesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (mats.length > 1) {
        const backMat = mats[1] as THREE.MeshStandardMaterial;
        if (backMat.color instanceof THREE.Color) {
          found = backMat.color.clone();
        }
      }
    }
  });

  return found ?? fallback;
}

/**
 * Builds a Group: inner tube mesh (OBJ or torus fallback) + driver body (rigged GLB or primitives) + cloned character head.
 * Character sits on the tube; root moves along the slide path.
 */
export async function buildWaterparkCharacter(headGroup: THREE.Group): Promise<THREE.Group> {
  const root = new THREE.Group();
  root.name = 'waterparkCharacter';

  let tubeMesh: THREE.Object3D;

  if (TUBE.OBJ_URL) {
    try {
      const loader = new OBJLoader();
      const tubeObj = await new Promise<THREE.Group>((resolve, reject) => {
        loader.load(TUBE.OBJ_URL, resolve, undefined, reject);
      });
      tubeObj.rotation.order = 'XYZ';
      tubeObj.rotation.x = TUBE.ROTATION_X ?? -Math.PI / 2;
      tubeObj.rotation.z = TUBE.ROTATION_Z ?? 0;
      const box = new THREE.Box3().setFromObject(tubeObj);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1.2 / maxDim;
      tubeObj.scale.setScalar(scale * TUBE.SCALE);
      tubeObj.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          obj.material = new THREE.MeshStandardMaterial({
            color: TUBE.MATERIAL.COLOR,
            roughness: TUBE.MATERIAL.ROUGHNESS,
            metalness: TUBE.MATERIAL.METALNESS,
          });
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      tubeMesh = tubeObj;
    } catch (_) {
      tubeMesh = createTorusTube();
    }
  } else {
    tubeMesh = createTorusTube();
  }

  tubeMesh.name = 'tube';
  root.add(tubeMesh);

  const driverBody = new THREE.Group();
  driverBody.name = 'driverBody';

  const skinColor = getHeadSkinColor(headGroup);

  let usedCustomModel = false;

  // Prefer a rigged GLB if configured.
  if (DRIVER.GLB_URL) {
    try {
      const gltfLoader = new GLTFLoader();
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        gltfLoader.load(DRIVER.GLB_URL, resolve, undefined, reject);
      });
      const model = gltf.scene;
      model.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.name && DRIVER.GLB_HEAD_MESH_NAMES_TO_HIDE.some((n) => obj.name === n)) {
            obj.visible = false;
          }
        }
      });
      model.scale.setScalar(DRIVER.GLB_SCALE ?? 1);
      const [grx, gry, grz] = DRIVER.GLB_ROTATION;
      model.rotation.set(grx, gry, grz);
      driverBody.add(model);
      usedCustomModel = true;
    } catch (_) {
      // fall through to OBJ / primitives
    }
  }

  // Otherwise, if a SittingBaby OBJ body is configured, reuse it so the tube
  // game matches the kart game.
  if (!usedCustomModel && DRIVER.BODY_OBJ_URL) {
    try {
      const bodyLoader = new OBJLoader();
      const model = await new Promise<THREE.Group>((resolve, reject) => {
        bodyLoader.load(DRIVER.BODY_OBJ_URL as string, resolve, undefined, reject);
      });

      const bodyMat = new THREE.MeshStandardMaterial({
        color: skinColor,
        roughness: CONFIG.HEAD.MATERIAL.BACK_ROUGHNESS,
        metalness: CONFIG.HEAD.MATERIAL.BACK_METALNESS,
      });

      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = bodyMat;
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      const targetHeight = DRIVER.BODY_OBJ_TARGET_HEIGHT ?? 0.9;
      const bbox = new THREE.Box3().setFromObject(model);
      const sizeObj = bbox.getSize(new THREE.Vector3());
      const objHeight = sizeObj.y || 1;
      const baseScale = targetHeight / objHeight;
      const extraScale = DRIVER.BODY_OBJ_SCALE ?? 1;
      const finalScale = baseScale * extraScale;
      model.scale.setScalar(finalScale);

      const bboxAfter = new THREE.Box3().setFromObject(model);
      const offsetY = -bboxAfter.min.y;
      const [ox, oy, oz] = DRIVER.BODY_OBJ_OFFSET;
      model.position.set(ox, oy + offsetY, oz);

      const [orx, ory, orz] = DRIVER.BODY_OBJ_ROTATION;
      model.rotation.set(orx, ory, orz);

      driverBody.add(model);
      usedCustomModel = true;
    } catch (_) {
      // fall back to primitives
    }
  }

  if (!usedCustomModel) {
    const bodyCfg = DRIVER.BODY;
    const bodyGeo = new THREE.BoxGeometry(bodyCfg.WIDTH, bodyCfg.HEIGHT, bodyCfg.DEPTH);
    const bodyMat = new THREE.MeshStandardMaterial({ color: skinColor });
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

    const armsCfg = DRIVER.ARMS;
    const armGeo = new THREE.CylinderGeometry(armsCfg.RADIUS, armsCfg.RADIUS, armsCfg.LENGTH, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: skinColor });
    const leftArm = new THREE.Mesh(armGeo.clone(), armMat.clone());
    leftArm.name = 'driverLeftArm';
    leftArm.castShadow = true;
    leftArm.receiveShadow = true;
    leftArm.position.set(...armsCfg.LEFT.POSITION);
    leftArm.rotation.set(Math.PI / 2 + armsCfg.LEFT.ROTATION[0], armsCfg.LEFT.ROTATION[1], armsCfg.LEFT.ROTATION[2]);
    driverBody.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo.clone(), armMat.clone());
    rightArm.name = 'driverRightArm';
    rightArm.castShadow = true;
    rightArm.receiveShadow = true;
    rightArm.position.set(...armsCfg.RIGHT.POSITION);
    rightArm.rotation.set(Math.PI / 2 + armsCfg.RIGHT.ROTATION[0], armsCfg.RIGHT.ROTATION[1], armsCfg.RIGHT.ROTATION[2]);
    driverBody.add(rightArm);

    const legsCfg = DRIVER.LEGS;
    const legGeo = new THREE.CylinderGeometry(legsCfg.RADIUS, legsCfg.RADIUS, legsCfg.LENGTH, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: skinColor });
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

    const feetCfg = DRIVER.FEET;
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
  }

  const headClone = headGroup.clone(true);
  headClone.name = 'driverHead';
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
  const headCfg = DRIVER.HEAD;
  const headScale = headCfg.SCALE_FACTOR / Math.max(headSize.x, headSize.y, headSize.z);
  headClone.scale.setScalar(headScale);
  headClone.position.set(...headCfg.POSITION);
  headClone.rotation.set(...headCfg.ROTATION);
  driverBody.add(headClone);

  driverBody.position.set(...DRIVER.POSITION);
  driverBody.rotation.set(...DRIVER.ROTATION);
  root.add(driverBody);

  return root;
}

function createTorusTube(): THREE.Mesh {
  const { RADIUS, TUBE: TUBE_RADIUS, RADIAL_SEGMENTS, TUBULAR_SEGMENTS } = TUBE.FALLBACK_TORUS;
  const geo = new THREE.TorusGeometry(RADIUS, TUBE_RADIUS, RADIAL_SEGMENTS, TUBULAR_SEGMENTS);
  const mat = new THREE.MeshStandardMaterial({
    color: TUBE.MATERIAL.COLOR,
    roughness: TUBE.MATERIAL.ROUGHNESS,
    metalness: TUBE.MATERIAL.METALNESS,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(TUBE.SCALE);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
