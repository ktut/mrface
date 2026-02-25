import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useApp } from '../context/AppContext';
import { buildKartCharacter } from '../character/KartCharacter';
import { CONFIG } from '../config';

type Vec3 = [number, number, number];

const [dpx, dpy, dpz] = CONFIG.KART.DRIVER.POSITION;
const [drx, dry, drz] = CONFIG.KART.DRIVER.ROTATION;
const [hpx, hpy, hpz] = CONFIG.KART.DRIVER.HEAD.POSITION;
const [hrx, hry, hrz] = CONFIG.KART.DRIVER.HEAD.ROTATION;
const bodyPos0: Vec3 = [...CONFIG.KART.DRIVER.BODY.POSITION];
const leftArmPos0: Vec3 = [...CONFIG.KART.DRIVER.ARMS.LEFT.POSITION];
const rightArmPos0: Vec3 = [...CONFIG.KART.DRIVER.ARMS.RIGHT.POSITION];
const leftLegPos0: Vec3 = [...CONFIG.KART.DRIVER.LEGS.LEFT.POSITION];
const rightLegPos0: Vec3 = [...CONFIG.KART.DRIVER.LEGS.RIGHT.POSITION];
const leftLegRot0: Vec3 = [...CONFIG.KART.DRIVER.LEGS.LEFT.ROTATION];
const rightLegRot0: Vec3 = [...CONFIG.KART.DRIVER.LEGS.RIGHT.ROTATION];
const leftFootPos0: Vec3 = [...CONFIG.KART.DRIVER.FEET.LEFT.POSITION];
const rightFootPos0: Vec3 = [...CONFIG.KART.DRIVER.FEET.RIGHT.POSITION];

/**
 * Renders the same kart + character + body setup used in the actual game,
 * so we can debug orientation and appearance on the game select screen.
 */
export function GameSelectPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectedCharacter, debugMode } = useApp();
  const kartGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    animationId: number;
  } | null>(null);

  const [driverPos, setDriverPos] = useState<Vec3>([dpx, dpy, dpz]);
  const [driverRot, setDriverRot] = useState<Vec3>([drx, dry, drz]);
  const [headPos, setHeadPos] = useState<Vec3>([hpx, hpy, hpz]);
  const [headRot, setHeadRot] = useState<Vec3>([hrx, hry, hrz]);
  const [bodyPos, setBodyPos] = useState<Vec3>(bodyPos0);
  const [leftArmPos, setLeftArmPos] = useState<Vec3>(leftArmPos0);
  const [rightArmPos, setRightArmPos] = useState<Vec3>(rightArmPos0);
  const [leftLegPos, setLeftLegPos] = useState<Vec3>(leftLegPos0);
  const [rightLegPos, setRightLegPos] = useState<Vec3>(rightLegPos0);
  const [leftLegRot, setLeftLegRot] = useState<Vec3>(leftLegRot0);
  const [rightLegRot, setRightLegRot] = useState<Vec3>(rightLegRot0);
  const [leftFootPos, setLeftFootPos] = useState<Vec3>(leftFootPos0);
  const [rightFootPos, setRightFootPos] = useState<Vec3>(rightFootPos0);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
    driver: false,
    body: false,
    arms: false,
    legs: false,
    feet: false,
    head: false,
    output: false,
  });

  const debugRef = useRef({
    driverPos,
    driverRot,
    headPos,
    headRot,
    bodyPos,
    leftArmPos,
    rightArmPos,
    leftLegPos,
    rightLegPos,
    leftLegRot,
    rightLegRot,
    leftFootPos,
    rightFootPos,
  });
  debugRef.current = {
    driverPos,
    driverRot,
    headPos,
    headRot,
    bodyPos,
    leftArmPos,
    rightArmPos,
    leftLegPos,
    rightLegPos,
    leftLegRot,
    rightLegRot,
    leftFootPos,
    rightFootPos,
  };

  const toggleSection = (id: string) =>
    setSectionOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedCharacter?.headGroup) return;

    let cancelled = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.SCENE.BACKGROUND);

    const camera = new THREE.PerspectiveCamera(
      CONFIG.SCENE.CAMERA.FOV,
      container.clientWidth / container.clientHeight,
      CONFIG.SCENE.CAMERA.NEAR,
      CONFIG.SCENE.CAMERA.FAR,
    );
    camera.position.set(1.8, 1.2, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI / 2;
    controls.maxPolarAngle = Math.PI / 2;
    controls.enableDamping = true;
    controls.dampingFactor = CONFIG.SCENE.CONTROLS.DAMPING_FACTOR;
    controls.minDistance = 1;
    controls.maxDistance = 6;
    controls.target.set(0, 0.5, 0);

    const ambient = new THREE.AmbientLight(
      CONFIG.SCENE.LIGHTS.AMBIENT.COLOR,
      CONFIG.SCENE.LIGHTS.AMBIENT.INTENSITY,
    );
    scene.add(ambient);
    const key = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.KEY.COLOR,
      CONFIG.SCENE.LIGHTS.KEY.INTENSITY,
    );
    key.position.set(...CONFIG.SCENE.LIGHTS.KEY.POSITION);
    key.castShadow = true;
    key.shadow.mapSize.set(CONFIG.SCENE.LIGHTS.SHADOW_MAP_SIZE, CONFIG.SCENE.LIGHTS.SHADOW_MAP_SIZE);
    scene.add(key);
    const fill = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.FILL.COLOR,
      CONFIG.SCENE.LIGHTS.FILL.INTENSITY,
    );
    fill.position.set(...CONFIG.SCENE.LIGHTS.FILL.POSITION);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.RIM.COLOR,
      CONFIG.SCENE.LIGHTS.RIM.INTENSITY,
    );
    rim.position.set(...CONFIG.SCENE.LIGHTS.RIM.POSITION);
    scene.add(rim);

    const size = CONFIG.SCENE.ENV_MAP_SIZE;
    const data = new Uint8Array(size * (size / 2) * 4);
    const h = size / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const r = Math.round(0xe0 * (1 - t) + 0x60 * t);
      const g = Math.round(0xe0 * (1 - t) + 0x60 * t);
      const b = Math.round(0xe8 * (1 - t) + 0x68 * t);
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size / 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();

    buildKartCharacter(selectedCharacter.headGroup)
      .then((kartGroup) => {
        if (cancelled) return;
        kartGroupRef.current = kartGroup;
        scene.add(kartGroup);
        const driverBody = kartGroup.getObjectByName('driverBody');
        const driverHead = kartGroup.getObjectByName('driverHead');
        const torso = kartGroup.getObjectByName('driverTorso');
        const leftArm = kartGroup.getObjectByName('driverLeftArm');
        const rightArm = kartGroup.getObjectByName('driverRightArm');
        const leftLeg = kartGroup.getObjectByName('driverLeftLeg');
        const rightLeg = kartGroup.getObjectByName('driverRightLeg');
        const leftFoot = kartGroup.getObjectByName('driverLeftFoot');
        const rightFoot = kartGroup.getObjectByName('driverRightFoot');
        if (driverBody) {
          setDriverPos([driverBody.position.x, driverBody.position.y, driverBody.position.z]);
          setDriverRot([driverBody.rotation.x, driverBody.rotation.y, driverBody.rotation.z]);
        }
        if (driverHead) {
          setHeadPos([driverHead.position.x, driverHead.position.y, driverHead.position.z]);
          setHeadRot([driverHead.rotation.x, driverHead.rotation.y, driverHead.rotation.z]);
        }
        const bodyOffY = CONFIG.KART.DRIVER.BODY.OFFSET_Y;
        if (torso) {
          setBodyPos([torso.position.x, torso.position.y - bodyOffY, torso.position.z]);
        }
        if (leftArm) setLeftArmPos([leftArm.position.x, leftArm.position.y, leftArm.position.z]);
        if (rightArm) setRightArmPos([rightArm.position.x, rightArm.position.y, rightArm.position.z]);
        if (leftLeg) {
          setLeftLegPos([leftLeg.position.x, leftLeg.position.y, leftLeg.position.z]);
          setLeftLegRot([leftLeg.rotation.x, leftLeg.rotation.y, leftLeg.rotation.z]);
        }
        if (rightLeg) {
          setRightLegPos([rightLeg.position.x, rightLeg.position.y, rightLeg.position.z]);
          setRightLegRot([rightLeg.rotation.x, rightLeg.rotation.y, rightLeg.rotation.z]);
        }
        if (leftFoot) setLeftFootPos([leftFoot.position.x, leftFoot.position.y, leftFoot.position.z]);
        if (rightFoot) setRightFootPos([rightFoot.position.x, rightFoot.position.y, rightFoot.position.z]);
      })
      .catch((err) => {
        if (!cancelled) console.error('[GameSelectPreview] buildKartCharacter', err);
      });

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let animationId = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const kg = kartGroupRef.current;
      const d = debugRef.current;
      const bodyOffY = CONFIG.KART.DRIVER.BODY.OFFSET_Y;
      if (kg) {
        const driverBody = kg.getObjectByName('driverBody');
        const driverHead = kg.getObjectByName('driverHead');
        const torso = kg.getObjectByName('driverTorso');
        const leftArm = kg.getObjectByName('driverLeftArm');
        const rightArm = kg.getObjectByName('driverRightArm');
        const leftLeg = kg.getObjectByName('driverLeftLeg');
        const rightLeg = kg.getObjectByName('driverRightLeg');
        const leftFoot = kg.getObjectByName('driverLeftFoot');
        const rightFoot = kg.getObjectByName('driverRightFoot');
        if (driverBody) {
          driverBody.position.set(d.driverPos[0], d.driverPos[1], d.driverPos[2]);
          driverBody.rotation.set(d.driverRot[0], d.driverRot[1], d.driverRot[2]);
        }
        if (driverHead) {
          driverHead.position.set(d.headPos[0], d.headPos[1], d.headPos[2]);
          driverHead.rotation.set(d.headRot[0], d.headRot[1], d.headRot[2]);
        }
        if (torso) {
          torso.position.set(d.bodyPos[0], bodyOffY + d.bodyPos[1], d.bodyPos[2]);
        }
        if (leftArm) leftArm.position.set(d.leftArmPos[0], d.leftArmPos[1], d.leftArmPos[2]);
        if (rightArm) rightArm.position.set(d.rightArmPos[0], d.rightArmPos[1], d.rightArmPos[2]);
        if (leftLeg) {
          leftLeg.position.set(d.leftLegPos[0], d.leftLegPos[1], d.leftLegPos[2]);
          leftLeg.rotation.set(d.leftLegRot[0], d.leftLegRot[1], d.leftLegRot[2]);
        }
        if (rightLeg) {
          rightLeg.position.set(d.rightLegPos[0], d.rightLegPos[1], d.rightLegPos[2]);
          rightLeg.rotation.set(d.rightLegRot[0], d.rightLegRot[1], d.rightLegRot[2]);
        }
        if (leftFoot) leftFoot.position.set(d.leftFootPos[0], d.leftFootPos[1], d.leftFootPos[2]);
        if (rightFoot) rightFoot.position.set(d.rightFootPos[0], d.rightFootPos[1], d.rightFootPos[2]);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { renderer, scene, camera, controls, animationId };

    return () => {
      cancelled = true;
      kartGroupRef.current = null;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animationId);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [selectedCharacter?.headGroup]);

  const updateDriverPos = (i: 0 | 1 | 2, v: number) =>
    setDriverPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateDriverRot = (i: 0 | 1 | 2, v: number) =>
    setDriverRot((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateHeadPos = (i: 0 | 1 | 2, v: number) =>
    setHeadPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateHeadRot = (i: 0 | 1 | 2, v: number) =>
    setHeadRot((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateBodyPos = (i: 0 | 1 | 2, v: number) =>
    setBodyPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateLeftArmPos = (i: 0 | 1 | 2, v: number) =>
    setLeftArmPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateRightArmPos = (i: 0 | 1 | 2, v: number) =>
    setRightArmPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateLeftLegPos = (i: 0 | 1 | 2, v: number) =>
    setLeftLegPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateRightLegPos = (i: 0 | 1 | 2, v: number) =>
    setRightLegPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateLeftLegRot = (i: 0 | 1 | 2, v: number) =>
    setLeftLegRot((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateRightLegRot = (i: 0 | 1 | 2, v: number) =>
    setRightLegRot((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateLeftFootPos = (i: 0 | 1 | 2, v: number) =>
    setLeftFootPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateRightFootPos = (i: 0 | 1 | 2, v: number) =>
    setRightFootPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);

  const fmt3 = (v: Vec3) => `[${v.map((n) => n.toFixed(3)).join(', ')}]`;
  const fmt4 = (v: Vec3) => `[${v.map((n) => n.toFixed(4)).join(', ')}]`;
  const valueText = `DRIVER.POSITION: ${fmt3(driverPos)}
DRIVER.ROTATION: ${fmt4(driverRot)}
BODY.POSITION: ${fmt3(bodyPos)}
ARMS.LEFT.POSITION: ${fmt3(leftArmPos)}
ARMS.RIGHT.POSITION: ${fmt3(rightArmPos)}
LEGS.LEFT.POSITION: ${fmt3(leftLegPos)}
LEGS.LEFT.ROTATION: ${fmt4(leftLegRot)}
LEGS.RIGHT.POSITION: ${fmt3(rightLegPos)}
LEGS.RIGHT.ROTATION: ${fmt4(rightLegRot)}
FEET.LEFT.POSITION: ${fmt3(leftFootPos)}
FEET.RIGHT.POSITION: ${fmt3(rightFootPos)}
HEAD.POSITION: ${fmt3(headPos)}
HEAD.ROTATION: ${fmt4(headRot)}`;

  if (!selectedCharacter) return null;

  const slider = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min: number,
    max: number,
    step: number,
  ) => (
    <label key={label} className="game-select-debug-row">
      <span className="game-select-debug-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="game-select-debug-val">{value.toFixed(3)}</span>
    </label>
  );

  const CollapseSection = ({
    id,
    title,
    children,
  }: {
    id: string;
    title: string;
    children: ReactNode;
  }) => {
    const open = sectionOpen[id] ?? false;
    return (
      <div className="game-select-debug-collapse">
        <button
          type="button"
          className="game-select-debug-collapse-btn"
          onClick={() => toggleSection(id)}
          aria-expanded={open}
        >
          <span className="game-select-debug-collapse-chevron">{open ? '▼' : '▶'}</span>
          {title}
        </button>
        {open && <div className="game-select-debug-collapse-content">{children}</div>}
      </div>
    );
  };

  return (
    <div className="game-select-preview-wrap">
      <div ref={containerRef} className="canvas-container game-select-preview" />
      {debugMode && (
      <div className="game-select-debug-panel">
        <h3 className="game-select-debug-title">Debug: driver (temporary)</h3>
        <CollapseSection id="driver" title="Driver">
          <div className="game-select-debug-section">
            <strong>Position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, driverPos[i], (v) => updateDriverPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Rotation (rad)</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, driverRot[i], (v) => updateDriverRot(i as 0 | 1 | 2, v), -Math.PI, Math.PI, 0.01),
            )}
          </div>
        </CollapseSection>
        <CollapseSection id="body" title="Torso">
          <div className="game-select-debug-section">
            <strong>Position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, bodyPos[i], (v) => updateBodyPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
        </CollapseSection>
        <CollapseSection id="arms" title="Arms">
          <div className="game-select-debug-section">
            <strong>Left arm position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, leftArmPos[i], (v) => updateLeftArmPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Right arm position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, rightArmPos[i], (v) => updateRightArmPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
        </CollapseSection>
        <CollapseSection id="legs" title="Legs">
          <div className="game-select-debug-section">
            <strong>Left leg position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, leftLegPos[i], (v) => updateLeftLegPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Left leg rotation (rad)</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, leftLegRot[i], (v) => updateLeftLegRot(i as 0 | 1 | 2, v), -Math.PI, Math.PI, 0.01),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Right leg position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, rightLegPos[i], (v) => updateRightLegPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Right leg rotation (rad)</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, rightLegRot[i], (v) => updateRightLegRot(i as 0 | 1 | 2, v), -Math.PI, Math.PI, 0.01),
            )}
          </div>
        </CollapseSection>
        <CollapseSection id="feet" title="Feet">
          <div className="game-select-debug-section">
            <strong>Left foot position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, leftFootPos[i], (v) => updateLeftFootPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Right foot position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, rightFootPos[i], (v) => updateRightFootPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
            )}
          </div>
        </CollapseSection>
        <CollapseSection id="head" title="Head">
          <div className="game-select-debug-section">
            <strong>Position</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(
                axis,
                headPos[i],
                (v) => updateHeadPos(i as 0 | 1 | 2, v),
                -0.5,
                axis === 'y' ? 1 : 0.5,
                0.01,
              ),
            )}
          </div>
          <div className="game-select-debug-section">
            <strong>Rotation (rad)</strong>
            {(['x', 'y', 'z'] as const).map((axis, i) =>
              slider(axis, headRot[i], (v) => updateHeadRot(i as 0 | 1 | 2, v), -Math.PI, Math.PI, 0.01),
            )}
          </div>
        </CollapseSection>
        <CollapseSection id="output" title="Copy values">
          <label className="game-select-debug-output">
            <textarea readOnly rows={16} value={valueText} className="game-select-debug-textarea" />
          </label>
        </CollapseSection>
      </div>
      )}
    </div>
  );
}
